var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { process } from "../../../../base/parts/sandbox/electron-browser/globals.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { URI } from "../../../../base/common/uri.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { PolicyCategory, PolicyCategoryData } from "../../../../base/common/policy.js";
import { join } from "../../../../base/common/path.js";
import { hasKey } from "../../../../base/common/types.js";
let PolicyExportContribution = class extends Disposable {
  constructor(nativeEnvironmentService, extensionService, fileService, configurationService, nativeHostService, progressService, logService) {
    super();
    this.nativeEnvironmentService = nativeEnvironmentService;
    this.extensionService = extensionService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.nativeHostService = nativeHostService;
    this.progressService = progressService;
    this.logService = logService;
    if (this.nativeEnvironmentService.isBuilt) {
      return;
    }
    const policyDataPath = this.nativeEnvironmentService.exportPolicyData;
    if (policyDataPath !== void 0) {
      const defaultPath = join(this.nativeEnvironmentService.appRoot, PolicyExportContribution.DEFAULT_POLICY_EXPORT_PATH);
      void this.exportPolicyDataAndQuit(policyDataPath ? policyDataPath : defaultPath);
    }
  }
  log(msg, ...args) {
    this.logService.info(`[${PolicyExportContribution.ID}]`, msg, ...args);
  }
  async exportPolicyDataAndQuit(policyDataPath) {
    try {
      await this.progressService.withProgress({
        location: ProgressLocation.Notification,
        title: `Exporting policy data to ${policyDataPath}`
      }, async (_progress) => {
        this.log("Export started. Waiting for configurations to load.");
        await this.extensionService.whenInstalledExtensionsRegistered();
        await this.configurationService.whenRemoteConfigurationLoaded();
        this.log("Extensions and configuration loaded.");
        const configurationRegistry = Registry.as(Extensions.Configuration);
        const configurationProperties = {
          ...configurationRegistry.getExcludedConfigurationProperties(),
          ...configurationRegistry.getConfigurationProperties()
        };
        const policyData = {
          categories: Object.values(PolicyCategory).map((category) => ({
            key: category,
            name: PolicyCategoryData[category].name
          })),
          policies: []
        };
        for (const [key, schema] of Object.entries(configurationProperties)) {
          if (schema.policy?.localization) {
            policyData.policies.push({
              key,
              name: schema.policy.name,
              category: schema.policy.category,
              minimumVersion: schema.policy.minimumVersion,
              localization: {
                description: schema.policy.localization.description,
                enumDescriptions: schema.policy.localization.enumDescriptions
              },
              type: schema.type,
              default: schema.default,
              enum: schema.enum,
              included: schema.included !== false
            });
          }
        }
        this.log(`Discovered ${policyData.policies.length} policies to export.`);
        const distroProduct = await this.getDistroProductJson();
        const extensionPolicies = distroProduct["extensionConfigurationPolicy"];
        const productReferencesByPolicyName = /* @__PURE__ */ new Map();
        if (extensionPolicies) {
          const existingKeys = new Set(policyData.policies.map((p) => p.key));
          let added = 0;
          let referenced = 0;
          for (const [key, entry] of Object.entries(extensionPolicies)) {
            if (existingKeys.has(key)) {
              continue;
            }
            if (hasKey(entry, { policyReference: true })) {
              const ownerName = entry.policyReference?.name;
              if (!ownerName) {
                throw new Error(`Extension policy reference '${key}' is missing required 'policyReference.name' field.`);
              }
              const list = productReferencesByPolicyName.get(ownerName) ?? [];
              list.push(key);
              productReferencesByPolicyName.set(ownerName, list);
              referenced++;
              continue;
            }
            if (!entry.name || !entry.category || !entry.description) {
              throw new Error(`Extension policy '${key}' is missing required 'name', 'category', or 'description' field.`);
            }
            policyData.policies.push({
              key,
              name: entry.name,
              category: entry.category,
              minimumVersion: entry.minimumVersion,
              localization: {
                description: { key, value: entry.description }
              },
              type: "boolean",
              default: true,
              included: true
            });
            added++;
          }
          this.log(`Merged ${added} extension configuration policies (${referenced} references).`);
        }
        const policyReferenceConfigurations = configurationRegistry.getPolicyReferenceConfigurations();
        const linkedProductReferenceNames = /* @__PURE__ */ new Set();
        let linkedReferences = 0;
        for (const policy of policyData.policies) {
          const references = new Set(policyReferenceConfigurations.get(policy.name) ?? []);
          const productReferences = productReferencesByPolicyName.get(policy.name);
          if (productReferences) {
            for (const productRefKey of productReferences) {
              references.add(productRefKey);
            }
            linkedProductReferenceNames.add(policy.name);
          }
          if (references.size > 0) {
            for (const referenceKey of references) {
              const referenceType = configurationProperties[referenceKey]?.type;
              if (referenceType !== void 0 && referenceType !== policy.type) {
                throw new Error(`Policy '${policy.name}': setting '${referenceKey}' (type '${referenceType}') declares a 'policyReference' to a policy of type '${policy.type}'. A 'policyReference' must match the owning setting's type.`);
              }
            }
            policy.referencedSettings = [...references].sort();
            linkedReferences += references.size;
          }
        }
        for (const policyName of productReferencesByPolicyName.keys()) {
          if (!linkedProductReferenceNames.has(policyName)) {
            throw new Error(`Extension policy reference to '${policyName}' has no owning policy. Ensure an in-code setting declares 'policy: { name: '${policyName}', ... }'.`);
          }
        }
        this.log(`Linked ${linkedReferences} referenced settings across ${policyData.policies.length} policies.`);
        const disclaimerComment = `/** THIS FILE IS AUTOMATICALLY GENERATED USING \`npm run export-policy-data\`. DO NOT MODIFY IT MANUALLY. **/`;
        const policyDataFileContent = `${disclaimerComment}
${JSON.stringify(policyData, null, 4)}
`;
        await this.fileService.writeFile(URI.file(policyDataPath), VSBuffer.fromString(policyDataFileContent));
        this.log(`Successfully exported ${policyData.policies.length} policies to ${policyDataPath}.`);
      });
      await this.nativeHostService.exit(0);
    } catch (error) {
      this.log("Failed to export policy", error);
      await this.nativeHostService.exit(1);
    }
  }
  /**
   * Reads the distro product.json for the 'stable' quality.
   * Checks DISTRO_PRODUCT_JSON env var (for testing),
   * then falls back to fetching from the GitHub API using GITHUB_TOKEN.
   */
  async getDistroProductJson() {
    const root = this.nativeEnvironmentService.appRoot;
    const envPath = process.env["DISTRO_PRODUCT_JSON"];
    if (envPath) {
      this.log(`Reading distro product.json from DISTRO_PRODUCT_JSON=${envPath}`);
      const content2 = (await this.fileService.readFile(URI.file(envPath))).value.toString();
      return JSON.parse(content2);
    }
    const packageJsonPath = join(root, "package.json");
    const packageJsonContent = (await this.fileService.readFile(URI.file(packageJsonPath))).value.toString();
    const packageJson = JSON.parse(packageJsonContent);
    const distroCommit = packageJson.distro;
    if (!distroCommit) {
      throw new Error(
        "No distro commit found in package.json. Use `npm run export-policy-data` which sets up the required environment."
      );
    }
    const token = process.env["GITHUB_TOKEN"];
    if (!token) {
      throw new Error(
        "GITHUB_TOKEN is required to fetch distro product.json. Use `npm run export-policy-data` which sets up the required environment."
      );
    }
    this.log(`Fetching distro product.json for commit ${distroCommit} from GitHub...`);
    const url = `https://api.github.com/repos/microsoft/vscode-distro/contents/mixin/stable/product.json?ref=${encodeURIComponent(distroCommit)}`;
    const response = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "VSCode Build"
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch distro product.json: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (data.encoding !== "base64") {
      throw new Error(`Unexpected encoding from GitHub API: ${data.encoding}`);
    }
    const content = VSBuffer.wrap(Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0))).toString();
    return JSON.parse(content);
  }
};
PolicyExportContribution.ID = "workbench.contrib.policyExport";
PolicyExportContribution.DEFAULT_POLICY_EXPORT_PATH = "build/lib/policies/policyData.jsonc";
PolicyExportContribution = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IWorkbenchConfigurationService),
  __decorateParam(4, INativeHostService),
  __decorateParam(5, IProgressService),
  __decorateParam(6, ILogService)
], PolicyExportContribution);
registerWorkbenchContribution2(
  PolicyExportContribution.ID,
  PolicyExportContribution,
  WorkbenchPhase.Eventually
);
export {
  PolicyExportContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHBvbGljeUV4cG9ydFxcZWxlY3Ryb24tYnJvd3NlclxccG9saWN5RXhwb3J0LmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgcHJvY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvc2FuZGJveC9lbGVjdHJvbi1icm93c2VyL2dsb2JhbHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBQb2xpY3lDYXRlZ29yeSwgUG9saWN5Q2F0ZWdvcnlEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IEV4cG9ydGVkUG9saWN5RGF0YUR0byB9IGZyb20gJy4uL2NvbW1vbi9wb2xpY3lEdG8uanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5pbnRlcmZhY2UgRXh0ZW5zaW9uQ29uZmlndXJhdGlvblBvbGljeUVudHJ5IHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBjYXRlZ29yeTogc3RyaW5nO1xuXHRyZWFkb25seSBtaW5pbXVtVmVyc2lvbjogYCR7bnVtYmVyfS4ke251bWJlcn1gO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xufVxuXG4vKipcbiAqIEEgcmVmZXJlbmNlLXNoYXBlZCBlbnRyeSBpbiB0aGUgZGlzdHJvIGBleHRlbnNpb25Db25maWd1cmF0aW9uUG9saWN5YDogdGhlIGV4dGVuc2lvbiBzZXR0aW5nXG4gKiBhdHRhY2hlcyB0byBhIHBvbGljeSAqb3duZWQqIGJ5IGFuIGluLWNvZGUgc2V0dGluZyAod2hpY2ggcHJvdmlkZXMgdGhlIGNhdGFsb2cgbWV0YWRhdGEgYW5kIHRoZVxuICogYHZhbHVlYCBjYWxsYmFjaykgdmlhIGEgYHBvbGljeVJlZmVyZW5jZWAgcG9pbnRlci5cbiAqL1xuaW50ZXJmYWNlIEV4dGVuc2lvbkNvbmZpZ3VyYXRpb25Qb2xpY3lSZWZlcmVuY2VFbnRyeSB7XG5cdHJlYWRvbmx5IHBvbGljeVJlZmVyZW5jZTogeyByZWFkb25seSBuYW1lOiBzdHJpbmcgfTtcbn1cblxuZXhwb3J0IGNsYXNzIFBvbGljeUV4cG9ydENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnBvbGljeUV4cG9ydCc7XG5cdHN0YXRpYyByZWFkb25seSBERUZBVUxUX1BPTElDWV9FWFBPUlRfUEFUSCA9ICdidWlsZC9saWIvcG9saWNpZXMvcG9saWN5RGF0YS5qc29uYyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVFbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBTa2lwIGZvciBub24tZGV2ZWxvcG1lbnQgZmxvd3Ncblx0XHRpZiAodGhpcy5uYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvbGljeURhdGFQYXRoID0gdGhpcy5uYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UuZXhwb3J0UG9saWN5RGF0YTtcblx0XHRpZiAocG9saWN5RGF0YVBhdGggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFBhdGggPSBqb2luKHRoaXMubmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLmFwcFJvb3QsIFBvbGljeUV4cG9ydENvbnRyaWJ1dGlvbi5ERUZBVUxUX1BPTElDWV9FWFBPUlRfUEFUSCk7XG5cdFx0XHR2b2lkIHRoaXMuZXhwb3J0UG9saWN5RGF0YUFuZFF1aXQocG9saWN5RGF0YVBhdGggPyBwb2xpY3lEYXRhUGF0aCA6IGRlZmF1bHRQYXRoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvZyhtc2c6IHN0cmluZyB8IHVuZGVmaW5lZCwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFske1BvbGljeUV4cG9ydENvbnRyaWJ1dGlvbi5JRH1dYCwgbXNnLCAuLi5hcmdzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZXhwb3J0UG9saWN5RGF0YUFuZFF1aXQocG9saWN5RGF0YVBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdHRpdGxlOiBgRXhwb3J0aW5nIHBvbGljeSBkYXRhIHRvICR7cG9saWN5RGF0YVBhdGh9YFxuXHRcdFx0fSwgYXN5bmMgKF9wcm9ncmVzcykgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZygnRXhwb3J0IHN0YXJ0ZWQuIFdhaXRpbmcgZm9yIGNvbmZpZ3VyYXRpb25zIHRvIGxvYWQuJyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS53aGVuUmVtb3RlQ29uZmlndXJhdGlvbkxvYWRlZCgpO1xuXG5cdFx0XHRcdHRoaXMubG9nKCdFeHRlbnNpb25zIGFuZCBjb25maWd1cmF0aW9uIGxvYWRlZC4nKTtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSB7XG5cdFx0XHRcdFx0Li4uY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldEV4Y2x1ZGVkQ29uZmlndXJhdGlvblByb3BlcnRpZXMoKSxcblx0XHRcdFx0XHQuLi5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBwb2xpY3lEYXRhOiBFeHBvcnRlZFBvbGljeURhdGFEdG8gPSB7XG5cdFx0XHRcdFx0Y2F0ZWdvcmllczogT2JqZWN0LnZhbHVlcyhQb2xpY3lDYXRlZ29yeSkubWFwKGNhdGVnb3J5ID0+ICh7XG5cdFx0XHRcdFx0XHRrZXk6IGNhdGVnb3J5LFxuXHRcdFx0XHRcdFx0bmFtZTogUG9saWN5Q2F0ZWdvcnlEYXRhW2NhdGVnb3J5XS5uYW1lXG5cdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdHBvbGljaWVzOiBbXVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgc2NoZW1hXSBvZiBPYmplY3QuZW50cmllcyhjb25maWd1cmF0aW9uUHJvcGVydGllcykpIHtcblx0XHRcdFx0XHQvLyBDaGVjayBmb3IgdGhlIGxvY2FsaXphdGlvbiBwcm9wZXJ0eSBmb3Igbm93IHRvIHJlbWFpbiBiYWNrd2FyZHMgY29tcGF0aWJsZS5cblx0XHRcdFx0XHRpZiAoc2NoZW1hLnBvbGljeT8ubG9jYWxpemF0aW9uKSB7XG5cdFx0XHRcdFx0XHRwb2xpY3lEYXRhLnBvbGljaWVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRrZXksXG5cdFx0XHRcdFx0XHRcdG5hbWU6IHNjaGVtYS5wb2xpY3kubmFtZSxcblx0XHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IHNjaGVtYS5wb2xpY3kuY2F0ZWdvcnksXG5cdFx0XHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiBzY2hlbWEucG9saWN5Lm1pbmltdW1WZXJzaW9uLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogc2NoZW1hLnBvbGljeS5sb2NhbGl6YXRpb24uZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogc2NoZW1hLnBvbGljeS5sb2NhbGl6YXRpb24uZW51bURlc2NyaXB0aW9ucyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0dHlwZTogc2NoZW1hLnR5cGUsXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IHNjaGVtYS5kZWZhdWx0LFxuXHRcdFx0XHRcdFx0XHRlbnVtOiBzY2hlbWEuZW51bSxcblx0XHRcdFx0XHRcdFx0aW5jbHVkZWQ6IHNjaGVtYS5pbmNsdWRlZCAhPT0gZmFsc2UsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5sb2coYERpc2NvdmVyZWQgJHtwb2xpY3lEYXRhLnBvbGljaWVzLmxlbmd0aH0gcG9saWNpZXMgdG8gZXhwb3J0LmApO1xuXG5cdFx0XHRcdC8vIE1lcmdlIGV4dGVuc2lvbiBjb25maWd1cmF0aW9uIHBvbGljaWVzIGZyb20gdGhlIGRpc3RybydzIHByb2R1Y3QuanNvbi5cblx0XHRcdFx0Ly8gQ2hlY2tzIERJU1RST19QUk9EVUNUX0pTT04gZW52IHZhciAoZm9yIHRlc3RpbmcpLFxuXHRcdFx0XHQvLyB0aGVuIGZhbGxzIGJhY2sgdG8gZmV0Y2hpbmcgZnJvbSBHaXRIdWIgQVBJIHdpdGggR0lUSFVCX1RPS0VOLlxuXHRcdFx0XHRjb25zdCBkaXN0cm9Qcm9kdWN0ID0gYXdhaXQgdGhpcy5nZXREaXN0cm9Qcm9kdWN0SnNvbigpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Qb2xpY2llcyA9IGRpc3Ryb1Byb2R1Y3RbJ2V4dGVuc2lvbkNvbmZpZ3VyYXRpb25Qb2xpY3knXSBhcyBSZWNvcmQ8c3RyaW5nLCBFeHRlbnNpb25Db25maWd1cmF0aW9uUG9saWN5RW50cnkgfCBFeHRlbnNpb25Db25maWd1cmF0aW9uUG9saWN5UmVmZXJlbmNlRW50cnk+IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyBSZWZlcmVuY2Utc2hhcGVkIHByb2R1Y3QgZW50cmllcyAoZXh0ZW5zaW9uIHNldHRpbmdzIGF0dGFjaGluZyB0byBhbiBpbi1jb2RlLW93bmVkXG5cdFx0XHRcdC8vIHBvbGljeSksIGNvbGxlY3RlZCBieSBvd25pbmcgcG9saWN5IG5hbWUgc28gdGhleSBjYW4gYmUgbGlua2VkIGJlbG93LlxuXHRcdFx0XHRjb25zdCBwcm9kdWN0UmVmZXJlbmNlc0J5UG9saWN5TmFtZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmdbXT4oKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvblBvbGljaWVzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmdLZXlzID0gbmV3IFNldChwb2xpY3lEYXRhLnBvbGljaWVzLm1hcChwID0+IHAua2V5KSk7XG5cdFx0XHRcdFx0bGV0IGFkZGVkID0gMDtcblx0XHRcdFx0XHRsZXQgcmVmZXJlbmNlZCA9IDA7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCBlbnRyeV0gb2YgT2JqZWN0LmVudHJpZXMoZXh0ZW5zaW9uUG9saWNpZXMpKSB7XG5cdFx0XHRcdFx0XHRpZiAoZXhpc3RpbmdLZXlzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Ly8gQSByZWZlcmVuY2UgZW50cnkgY2FycmllcyBhIGBwb2xpY3lSZWZlcmVuY2VgIHBvaW50ZXI7IHRoZSBvd25lciBcdTIwMTQgYW5kIGl0c1xuXHRcdFx0XHRcdFx0Ly8gYHZhbHVlYCBjYWxsYmFjayBcdTIwMTQgaXMgZGVjbGFyZWQgYnkgYW4gaW4tY29kZSBzZXR0aW5nLiBMaW5rIGl0IGJlbG93IGluc3RlYWRcblx0XHRcdFx0XHRcdC8vIG9mIG1lcmdpbmcgaXQgYXMgYW4gb3duZXIuXG5cdFx0XHRcdFx0XHRpZiAoaGFzS2V5KGVudHJ5LCB7IHBvbGljeVJlZmVyZW5jZTogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvd25lck5hbWUgPSBlbnRyeS5wb2xpY3lSZWZlcmVuY2U/Lm5hbWU7XG5cdFx0XHRcdFx0XHRcdGlmICghb3duZXJOYW1lKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHRlbnNpb24gcG9saWN5IHJlZmVyZW5jZSAnJHtrZXl9JyBpcyBtaXNzaW5nIHJlcXVpcmVkICdwb2xpY3lSZWZlcmVuY2UubmFtZScgZmllbGQuYCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3QgbGlzdCA9IHByb2R1Y3RSZWZlcmVuY2VzQnlQb2xpY3lOYW1lLmdldChvd25lck5hbWUpID8/IFtdO1xuXHRcdFx0XHRcdFx0XHRsaXN0LnB1c2goa2V5KTtcblx0XHRcdFx0XHRcdFx0cHJvZHVjdFJlZmVyZW5jZXNCeVBvbGljeU5hbWUuc2V0KG93bmVyTmFtZSwgbGlzdCk7XG5cdFx0XHRcdFx0XHRcdHJlZmVyZW5jZWQrKztcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyBPd25lciAoXCJwYXJlbnRcIikgZW50cnk6IGZ1bGwgY2F0YWxvZyBtZXRhZGF0YSBpcyByZXF1aXJlZC5cblx0XHRcdFx0XHRcdGlmICghZW50cnkubmFtZSB8fCAhZW50cnkuY2F0ZWdvcnkgfHwgIWVudHJ5LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRXh0ZW5zaW9uIHBvbGljeSAnJHtrZXl9JyBpcyBtaXNzaW5nIHJlcXVpcmVkICduYW1lJywgJ2NhdGVnb3J5Jywgb3IgJ2Rlc2NyaXB0aW9uJyBmaWVsZC5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHBvbGljeURhdGEucG9saWNpZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGtleSxcblx0XHRcdFx0XHRcdFx0bmFtZTogZW50cnkubmFtZSxcblx0XHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IGVudHJ5LmNhdGVnb3J5LFxuXHRcdFx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogZW50cnkubWluaW11bVZlcnNpb24sXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7IGtleSwgdmFsdWU6IGVudHJ5LmRlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0aW5jbHVkZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGFkZGVkKys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMubG9nKGBNZXJnZWQgJHthZGRlZH0gZXh0ZW5zaW9uIGNvbmZpZ3VyYXRpb24gcG9saWNpZXMgKCR7cmVmZXJlbmNlZH0gcmVmZXJlbmNlcykuYCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBMaW5rIHBvbGljeVJlZmVyZW5jZSBzZXR0aW5ncyBhbmQgZW5mb3JjZSB0eXBlIG1hdGNoIChzYW1lIHZhbHVlIGlzIGFwcGxpZWQgdmVyYmF0aW0pLlxuXHRcdFx0XHQvLyBSZWZlcmVuY2VzIGNvbWUgZnJvbSBib3RoIGluLWNvZGUgc2V0dGluZ3MgKGBnZXRQb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9uc2ApIGFuZFxuXHRcdFx0XHQvLyByZWZlcmVuY2Utc2hhcGVkIGRpc3RybyBwcm9kdWN0IGVudHJpZXMgY29sbGVjdGVkIGFib3ZlLlxuXHRcdFx0XHRjb25zdCBwb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucyA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRQb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucygpO1xuXHRcdFx0XHRjb25zdCBsaW5rZWRQcm9kdWN0UmVmZXJlbmNlTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdFx0bGV0IGxpbmtlZFJlZmVyZW5jZXMgPSAwO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBvbGljeSBvZiBwb2xpY3lEYXRhLnBvbGljaWVzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlcyA9IG5ldyBTZXQ8c3RyaW5nPihwb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucy5nZXQocG9saWN5Lm5hbWUpID8/IFtdKTtcblx0XHRcdFx0XHRjb25zdCBwcm9kdWN0UmVmZXJlbmNlcyA9IHByb2R1Y3RSZWZlcmVuY2VzQnlQb2xpY3lOYW1lLmdldChwb2xpY3kubmFtZSk7XG5cdFx0XHRcdFx0aWYgKHByb2R1Y3RSZWZlcmVuY2VzKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHByb2R1Y3RSZWZLZXkgb2YgcHJvZHVjdFJlZmVyZW5jZXMpIHtcblx0XHRcdFx0XHRcdFx0cmVmZXJlbmNlcy5hZGQocHJvZHVjdFJlZktleSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRsaW5rZWRQcm9kdWN0UmVmZXJlbmNlTmFtZXMuYWRkKHBvbGljeS5uYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHJlZmVyZW5jZXMuc2l6ZSA+IDApIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcmVmZXJlbmNlS2V5IG9mIHJlZmVyZW5jZXMpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlVHlwZSA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW3JlZmVyZW5jZUtleV0/LnR5cGU7XG5cdFx0XHRcdFx0XHRcdC8vIEV4dGVuc2lvbi1jb250cmlidXRlZCByZWZlcmVuY2Ugc2V0dGluZ3MgYXJlIG5vdCByZWdpc3RlcmVkIGluIHRoZVxuXHRcdFx0XHRcdFx0XHQvLyBoZWFkbGVzcyBleHBvcnQgcHJvY2Vzcywgc28gdGhlaXIgdHlwZSBjYW5ub3QgYmUgdmFsaWRhdGVkIGhlcmU7IG9ubHlcblx0XHRcdFx0XHRcdFx0Ly8gZW5mb3JjZSB0aGUgdHlwZSBtYXRjaCBmb3Igc2V0dGluZ3MgcHJlc2VudCBpbiB0aGUgcmVnaXN0cnkuXG5cdFx0XHRcdFx0XHRcdGlmIChyZWZlcmVuY2VUeXBlICE9PSB1bmRlZmluZWQgJiYgcmVmZXJlbmNlVHlwZSAhPT0gcG9saWN5LnR5cGUpIHtcblx0XHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFBvbGljeSAnJHtwb2xpY3kubmFtZX0nOiBzZXR0aW5nICcke3JlZmVyZW5jZUtleX0nICh0eXBlICcke3JlZmVyZW5jZVR5cGV9JykgZGVjbGFyZXMgYSAncG9saWN5UmVmZXJlbmNlJyB0byBhIHBvbGljeSBvZiB0eXBlICcke3BvbGljeS50eXBlfScuIEEgJ3BvbGljeVJlZmVyZW5jZScgbXVzdCBtYXRjaCB0aGUgb3duaW5nIHNldHRpbmcncyB0eXBlLmApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwb2xpY3kucmVmZXJlbmNlZFNldHRpbmdzID0gWy4uLnJlZmVyZW5jZXNdLnNvcnQoKTtcblx0XHRcdFx0XHRcdGxpbmtlZFJlZmVyZW5jZXMgKz0gcmVmZXJlbmNlcy5zaXplO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBIHJlZmVyZW5jZSBtdXN0IHBvaW50IGF0IGFuIG93bmVyLiBBbiB1bm1hdGNoZWQgcHJvZHVjdCByZWZlcmVuY2UgbWVhbnMgdGhlXG5cdFx0XHRcdC8vIGluLWNvZGUgb3duZXIgd2FzIG5vdCBsb2FkZWQvcmVnaXN0ZXJlZCBcdTIwMTQgc3VyZmFjZSBpdCByYXRoZXIgdGhhbiBzaWxlbnRseSBkcm9wcGluZy5cblx0XHRcdFx0Zm9yIChjb25zdCBwb2xpY3lOYW1lIG9mIHByb2R1Y3RSZWZlcmVuY2VzQnlQb2xpY3lOYW1lLmtleXMoKSkge1xuXHRcdFx0XHRcdGlmICghbGlua2VkUHJvZHVjdFJlZmVyZW5jZU5hbWVzLmhhcyhwb2xpY3lOYW1lKSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHRlbnNpb24gcG9saWN5IHJlZmVyZW5jZSB0byAnJHtwb2xpY3lOYW1lfScgaGFzIG5vIG93bmluZyBwb2xpY3kuIEVuc3VyZSBhbiBpbi1jb2RlIHNldHRpbmcgZGVjbGFyZXMgJ3BvbGljeTogeyBuYW1lOiAnJHtwb2xpY3lOYW1lfScsIC4uLiB9Jy5gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5sb2coYExpbmtlZCAke2xpbmtlZFJlZmVyZW5jZXN9IHJlZmVyZW5jZWQgc2V0dGluZ3MgYWNyb3NzICR7cG9saWN5RGF0YS5wb2xpY2llcy5sZW5ndGh9IHBvbGljaWVzLmApO1xuXG5cdFx0XHRcdGNvbnN0IGRpc2NsYWltZXJDb21tZW50ID0gYC8qKiBUSElTIEZJTEUgSVMgQVVUT01BVElDQUxMWSBHRU5FUkFURUQgVVNJTkcgXFxgbnBtIHJ1biBleHBvcnQtcG9saWN5LWRhdGFcXGAuIERPIE5PVCBNT0RJRlkgSVQgTUFOVUFMTFkuICoqL2A7XG5cdFx0XHRcdGNvbnN0IHBvbGljeURhdGFGaWxlQ29udGVudCA9IGAke2Rpc2NsYWltZXJDb21tZW50fVxcbiR7SlNPTi5zdHJpbmdpZnkocG9saWN5RGF0YSwgbnVsbCwgNCl9XFxuYDtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmZpbGUocG9saWN5RGF0YVBhdGgpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKHBvbGljeURhdGFGaWxlQ29udGVudCkpO1xuXHRcdFx0XHR0aGlzLmxvZyhgU3VjY2Vzc2Z1bGx5IGV4cG9ydGVkICR7cG9saWN5RGF0YS5wb2xpY2llcy5sZW5ndGh9IHBvbGljaWVzIHRvICR7cG9saWN5RGF0YVBhdGh9LmApO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2UuZXhpdCgwKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2coJ0ZhaWxlZCB0byBleHBvcnQgcG9saWN5JywgZXJyb3IpO1xuXHRcdFx0YXdhaXQgdGhpcy5uYXRpdmVIb3N0U2VydmljZS5leGl0KDEpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyB0aGUgZGlzdHJvIHByb2R1Y3QuanNvbiBmb3IgdGhlICdzdGFibGUnIHF1YWxpdHkuXG5cdCAqIENoZWNrcyBESVNUUk9fUFJPRFVDVF9KU09OIGVudiB2YXIgKGZvciB0ZXN0aW5nKSxcblx0ICogdGhlbiBmYWxscyBiYWNrIHRvIGZldGNoaW5nIGZyb20gdGhlIEdpdEh1YiBBUEkgdXNpbmcgR0lUSFVCX1RPS0VOLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXREaXN0cm9Qcm9kdWN0SnNvbigpOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMubmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLmFwcFJvb3Q7XG5cblx0XHQvLyAxLiBESVNUUk9fUFJPRFVDVF9KU09OIGVudiB2YXIgKGZvciB0ZXN0aW5nKVxuXHRcdGNvbnN0IGVudlBhdGggPSBwcm9jZXNzLmVudlsnRElTVFJPX1BST0RVQ1RfSlNPTiddO1xuXHRcdGlmIChlbnZQYXRoKSB7XG5cdFx0XHR0aGlzLmxvZyhgUmVhZGluZyBkaXN0cm8gcHJvZHVjdC5qc29uIGZyb20gRElTVFJPX1BST0RVQ1RfSlNPTj0ke2VudlBhdGh9YCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZpbGUoZW52UGF0aCkpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoY29udGVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gMi4gR2l0SHViIEFQSSB3aXRoIEdJVEhVQl9UT0tFTlxuXHRcdGNvbnN0IHBhY2thZ2VKc29uUGF0aCA9IGpvaW4ocm9vdCwgJ3BhY2thZ2UuanNvbicpO1xuXHRcdGNvbnN0IHBhY2thZ2VKc29uQ29udGVudCA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5maWxlKHBhY2thZ2VKc29uUGF0aCkpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHBhY2thZ2VKc29uID0gSlNPTi5wYXJzZShwYWNrYWdlSnNvbkNvbnRlbnQpO1xuXHRcdGNvbnN0IGRpc3Ryb0NvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkID0gcGFja2FnZUpzb24uZGlzdHJvO1xuXG5cdFx0aWYgKCFkaXN0cm9Db21taXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0J05vIGRpc3RybyBjb21taXQgZm91bmQgaW4gcGFja2FnZS5qc29uLiAnICtcblx0XHRcdFx0J1VzZSBgbnBtIHJ1biBleHBvcnQtcG9saWN5LWRhdGFgIHdoaWNoIHNldHMgdXAgdGhlIHJlcXVpcmVkIGVudmlyb25tZW50Lidcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9rZW4gPSBwcm9jZXNzLmVudlsnR0lUSFVCX1RPS0VOJ107XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHQnR0lUSFVCX1RPS0VOIGlzIHJlcXVpcmVkIHRvIGZldGNoIGRpc3RybyBwcm9kdWN0Lmpzb24uICcgK1xuXHRcdFx0XHQnVXNlIGBucG0gcnVuIGV4cG9ydC1wb2xpY3ktZGF0YWAgd2hpY2ggc2V0cyB1cCB0aGUgcmVxdWlyZWQgZW52aXJvbm1lbnQuJ1xuXHRcdFx0KTtcblx0XHR9XG5cblx0XHR0aGlzLmxvZyhgRmV0Y2hpbmcgZGlzdHJvIHByb2R1Y3QuanNvbiBmb3IgY29tbWl0ICR7ZGlzdHJvQ29tbWl0fSBmcm9tIEdpdEh1Yi4uLmApO1xuXHRcdGNvbnN0IHVybCA9IGBodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL21pY3Jvc29mdC92c2NvZGUtZGlzdHJvL2NvbnRlbnRzL21peGluL3N0YWJsZS9wcm9kdWN0Lmpzb24/cmVmPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGRpc3Ryb0NvbW1pdCl9YDtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwge1xuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL3ZuZC5naXRodWIranNvbicsXG5cdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke3Rva2VufWAsXG5cdFx0XHRcdCdYLUdpdEh1Yi1BcGktVmVyc2lvbic6ICcyMDIyLTExLTI4Jyxcblx0XHRcdFx0J1VzZXItQWdlbnQnOiAnVlNDb2RlIEJ1aWxkJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggZGlzdHJvIHByb2R1Y3QuanNvbjogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIHsgY29udGVudDogc3RyaW5nOyBlbmNvZGluZzogc3RyaW5nIH07XG5cdFx0aWYgKGRhdGEuZW5jb2RpbmcgIT09ICdiYXNlNjQnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgZW5jb2RpbmcgZnJvbSBHaXRIdWIgQVBJOiAke2RhdGEuZW5jb2Rpbmd9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRlbnQgPSBWU0J1ZmZlci53cmFwKFVpbnQ4QXJyYXkuZnJvbShhdG9iKGRhdGEuY29udGVudCksIGMgPT4gYy5jaGFyQ29kZUF0KDApKSkudG9TdHJpbmcoKTtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShjb250ZW50KTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoXG5cdFBvbGljeUV4cG9ydENvbnRyaWJ1dGlvbi5JRCxcblx0UG9saWN5RXhwb3J0Q29udHJpYnV0aW9uLFxuXHRXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5LFxuKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBaUMsZ0NBQWdDLHNCQUFzQjtBQUN2RixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBMEM7QUFDbkQsU0FBUyxrQkFBa0Isd0JBQXdCO0FBQ25ELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQiwwQkFBMEI7QUFFbkQsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsY0FBYztBQWtCaEIsSUFBTSwyQkFBTixjQUF1QyxXQUE2QztBQUFBLEVBSTFGLFlBQzZDLDBCQUNSLGtCQUNMLGFBQ2tCLHNCQUNaLG1CQUNGLGlCQUNMLFlBQzdCO0FBQ0QsVUFBTTtBQVJzQztBQUNSO0FBQ0w7QUFDa0I7QUFDWjtBQUNGO0FBQ0w7QUFLOUIsUUFBSSxLQUFLLHlCQUF5QixTQUFTO0FBQzFDO0FBQUEsSUFDRDtBQUVBLFVBQU0saUJBQWlCLEtBQUsseUJBQXlCO0FBQ3JELFFBQUksbUJBQW1CLFFBQVc7QUFDakMsWUFBTSxjQUFjLEtBQUssS0FBSyx5QkFBeUIsU0FBUyx5QkFBeUIsMEJBQTBCO0FBQ25ILFdBQUssS0FBSyx3QkFBd0IsaUJBQWlCLGlCQUFpQixXQUFXO0FBQUEsSUFDaEY7QUFBQSxFQUNEO0FBQUEsRUFFUSxJQUFJLFFBQTRCLE1B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
