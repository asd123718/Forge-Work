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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { hash } from "../../../../base/common/hash.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileService } from "../../../files/common/files.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { customizationId } from "../../common/state/sessionState.js";
import { CustomizationType } from "../../common/state/protocol/state.js";
import { DiscoveredType } from "../copilot/sessionCustomizationDiscovery.js";
const DISPLAY_NAME = "VS Code Synced Data";
const HOST_DISCOVERY_DIR = "host-discovery";
const MANIFEST_CONTENT = JSON.stringify({
  name: DISPLAY_NAME,
  description: "Customization data discovered from this workspace and your home directory"
}, null, "	");
function pluginDirForType(type) {
  switch (type) {
    case DiscoveredType.Agent:
      return "agents";
    case DiscoveredType.Skill:
      return "skills";
    case DiscoveredType.Instruction:
      return "rules";
    case DiscoveredType.Hook:
      return "hooks";
    case DiscoveredType.AgentInstruction:
      return void 0;
  }
}
let SessionPluginBundler = class extends Disposable {
  constructor(workingDirectory, _fileService, pluginManager) {
    super();
    this._fileService = _fileService;
    const authority = `host-${hash(workingDirectory.toString())}`;
    this._rootUri = URI.joinPath(pluginManager.basePath, HOST_DISCOVERY_DIR, authority);
  }
  get rootUri() {
    return this._rootUri;
  }
  get lastNonce() {
    return this._lastNonce;
  }
  /**
   * Bundles the given files into the on-disk plugin directory.
   *
   * Overwrites any previous bundle for this working directory. Returns a
   * {@link ClientPluginCustomization} pointing at the on-disk plugin root
   * with a content-based nonce, or `undefined` when there are no files or
   * cancellation was requested.
   */
  async bundle(directories, token = CancellationToken.None) {
    if (directories.length === 0 || token.isCancellationRequested) {
      return void 0;
    }
    const hashParts = [];
    const files = [];
    for (const discoveredDirectory of directories) {
      const dir = pluginDirForType(discoveredDirectory.type);
      if (!dir) {
        continue;
      }
      for (const file of discoveredDirectory.files) {
        const fileUri = file.uri;
        const fileName = basename(fileUri);
        let destUri;
        let hashKey;
        if (discoveredDirectory.type === DiscoveredType.Skill) {
          const skillDirName = basename(dirname(fileUri));
          destUri = URI.joinPath(this._rootUri, dir, skillDirName, fileName);
          hashKey = `${dir}/${skillDirName}/${fileName}`;
        } else {
          destUri = URI.joinPath(this._rootUri, dir, fileName);
          hashKey = `${dir}/${fileName}`;
        }
        const content = await this._fileService.readFile(fileUri);
        if (token.isCancellationRequested) {
          return void 0;
        }
        files.push({ destUri, content: content.value });
        hashParts.push(`${hashKey}:${content.value.toString()}`);
      }
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    hashParts.sort();
    const nonce = String(hash(hashParts.join("\n")));
    const rootUriString = this._rootUri.toString();
    const result = {
      ref: {
        type: CustomizationType.Plugin,
        id: customizationId(rootUriString),
        uri: rootUriString,
        name: DISPLAY_NAME,
        nonce
      }
    };
    if (this._lastNonce === nonce) {
      return result;
    }
    try {
      await this._fileService.del(this._rootUri, { recursive: true });
    } catch {
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const manifestUri = URI.joinPath(this._rootUri, ".plugin", "plugin.json");
    await this._fileService.createFolder(dirname(manifestUri));
    if (token.isCancellationRequested) {
      return void 0;
    }
    await this._fileService.writeFile(manifestUri, VSBuffer.fromString(MANIFEST_CONTENT));
    if (token.isCancellationRequested) {
      return void 0;
    }
    for (const file of files) {
      await this._fileService.createFolder(dirname(file.destUri));
      if (token.isCancellationRequested) {
        return void 0;
      }
      await this._fileService.writeFile(file.destUri, file.content);
      if (token.isCancellationRequested) {
        return void 0;
      }
    }
    this._lastNonce = nonce;
    return result;
  }
};
SessionPluginBundler = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IAgentPluginManager)
], SessionPluginBundler);
export {
  SessionPluginBundler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzaGFyZWRcXHNlc3Npb25QbHVnaW5CdW5kbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpbk1hbmFnZXIgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcbmltcG9ydCB7IGN1c3RvbWl6YXRpb25JZCwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgdHlwZSBVUkkgYXMgUHJvdG9jb2xVUkkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgRGlzY292ZXJlZFR5cGUsIHR5cGUgSURpc2NvdmVyZWREaXJlY3RvcnkgfSBmcm9tICcuLi9jb3BpbG90L3Nlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LmpzJztcblxuY29uc3QgRElTUExBWV9OQU1FID0gJ1ZTIENvZGUgU3luY2VkIERhdGEnO1xuY29uc3QgSE9TVF9ESVNDT1ZFUllfRElSID0gJ2hvc3QtZGlzY292ZXJ5JztcblxuY29uc3QgTUFOSUZFU1RfQ09OVEVOVCA9IEpTT04uc3RyaW5naWZ5KHtcblx0bmFtZTogRElTUExBWV9OQU1FLFxuXHRkZXNjcmlwdGlvbjogJ0N1c3RvbWl6YXRpb24gZGF0YSBkaXNjb3ZlcmVkIGZyb20gdGhpcyB3b3Jrc3BhY2UgYW5kIHlvdXIgaG9tZSBkaXJlY3RvcnknLFxufSwgbnVsbCwgJ1xcdCcpO1xuXG4vKipcbiAqIE1hcHMgYSB7QGxpbmsgRGlzY292ZXJlZFR5cGV9IHRvIHRoZSBwbHVnaW4gc3ViLWRpcmVjdG9yeSB1bmRlciB3aGljaCB0aGF0XG4gKiBjb21wb25lbnQgdHlwZSBsaXZlcyBpbiB0aGUgT3BlbiBQbHVnaW4gZm9ybWF0LlxuICovXG5mdW5jdGlvbiBwbHVnaW5EaXJGb3JUeXBlKHR5cGU6IERpc2NvdmVyZWRUeXBlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoICh0eXBlKSB7XG5cdFx0Y2FzZSBEaXNjb3ZlcmVkVHlwZS5BZ2VudDogcmV0dXJuICdhZ2VudHMnO1xuXHRcdGNhc2UgRGlzY292ZXJlZFR5cGUuU2tpbGw6IHJldHVybiAnc2tpbGxzJztcblx0XHRjYXNlIERpc2NvdmVyZWRUeXBlLkluc3RydWN0aW9uOiByZXR1cm4gJ3J1bGVzJztcblx0XHRjYXNlIERpc2NvdmVyZWRUeXBlLkhvb2s6IHJldHVybiAnaG9va3MnO1xuXHRcdGNhc2UgRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbjogcmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUJ1bmRsZVJlc3VsdCB7XG5cdHJlYWRvbmx5IHJlZjogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbjtcbn1cblxuLyoqXG4gKiBCdW5kbGVzIGhvc3QtZGlzY292ZXJlZCBjdXN0b21pemF0aW9uIGZpbGVzIGludG8gYW4gT3BlbiBQbHVnaW4gbGF5b3V0XG4gKiBvbiByZWFsIGRpc2sgdW5kZXIgYDxhZ2VudFBsdWdpbk1hbmFnZXIuYmFzZVBhdGg+L2hvc3QtZGlzY292ZXJ5LzxoYXNoPi9gLlxuICpcbiAqIFdyaXRpbmcgdG8gYSByZWFsIGRpcmVjdG9yeSAocmF0aGVyIHRoYW4gYW4gaW4tbWVtb3J5IHByb3ZpZGVyKSBpc1xuICogcmVxdWlyZWQgYmVjYXVzZSB0aGUgQ29waWxvdCBTREsgc3VicHJvY2VzcyByZWNlaXZlcyBza2lsbCBkaXJlY3Rvcmllc1xuICogYW5kIGhvb2sgY29tbWFuZHMgYXMgb24tZGlzayBwYXRocyB2aWEgYGZzUGF0aGAsIGFuZCBiZWNhdXNlIHRoZVxuICogd29ya2JlbmNoIGZldGNoZXMgZmlsZXMgdGhyb3VnaCB0aGUgYWdlbnQtaG9zdCBmaWxlc3lzdGVtIGJyaWRnZSBcdTIwMTRcbiAqIG5laXRoZXIgb2Ygd2hpY2ggY2FuIHJlYWQgYSBob3N0LXNpZGUgaW4tbWVtb3J5IEZTLlxuICpcbiAqIFRoZSBkaXJlY3RvcnkgaXMgbmFtZXNwYWNlZCBieSBhIGhhc2ggb2YgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IHNvXG4gKiBjb25jdXJyZW50IHNlc3Npb25zIG9uIGRpZmZlcmVudCBmb2xkZXJzIGRvbid0IGNvbGxpZGUuIFJlcGVhdGVkXG4gKiBgYnVuZGxlKClgIGNhbGxzIHdpdGggaWRlbnRpY2FsIGNvbnRlbnQgcmV1c2UgdGhlIHByaW9yIGJ1bmRsZSAobm9uY2VcbiAqIG1hdGNoKSBhbmQgc2tpcCB0aGUgcmV3cml0ZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb25QbHVnaW5CdW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcm9vdFVyaTogVVJJO1xuXHRwcml2YXRlIF9sYXN0Tm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkksXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQWdlbnRQbHVnaW5NYW5hZ2VyIHBsdWdpbk1hbmFnZXI6IElBZ2VudFBsdWdpbk1hbmFnZXIsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgYXV0aG9yaXR5ID0gYGhvc3QtJHtoYXNoKHdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSl9YDtcblx0XHR0aGlzLl9yb290VXJpID0gVVJJLmpvaW5QYXRoKHBsdWdpbk1hbmFnZXIuYmFzZVBhdGgsIEhPU1RfRElTQ09WRVJZX0RJUiwgYXV0aG9yaXR5KTtcblx0fVxuXG5cdGdldCByb290VXJpKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jvb3RVcmk7XG5cdH1cblxuXHRnZXQgbGFzdE5vbmNlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3ROb25jZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdW5kbGVzIHRoZSBnaXZlbiBmaWxlcyBpbnRvIHRoZSBvbi1kaXNrIHBsdWdpbiBkaXJlY3RvcnkuXG5cdCAqXG5cdCAqIE92ZXJ3cml0ZXMgYW55IHByZXZpb3VzIGJ1bmRsZSBmb3IgdGhpcyB3b3JraW5nIGRpcmVjdG9yeS4gUmV0dXJucyBhXG5cdCAqIHtAbGluayBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9ufSBwb2ludGluZyBhdCB0aGUgb24tZGlzayBwbHVnaW4gcm9vdFxuXHQgKiB3aXRoIGEgY29udGVudC1iYXNlZCBub25jZSwgb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGVyZSBhcmUgbm8gZmlsZXMgb3Jcblx0ICogY2FuY2VsbGF0aW9uIHdhcyByZXF1ZXN0ZWQuXG5cdCAqL1xuXHRhc3luYyBidW5kbGUoZGlyZWN0b3JpZXM6IHJlYWRvbmx5IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPElCdW5kbGVSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoZGlyZWN0b3JpZXMubGVuZ3RoID09PSAwIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc2hQYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBmaWxlczogeyByZWFkb25seSBkZXN0VXJpOiBVUkk7IHJlYWRvbmx5IGNvbnRlbnQ6IFZTQnVmZmVyIH1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBkaXNjb3ZlcmVkRGlyZWN0b3J5IG9mIGRpcmVjdG9yaWVzKSB7XG5cdFx0XHRjb25zdCBkaXIgPSBwbHVnaW5EaXJGb3JUeXBlKGRpc2NvdmVyZWREaXJlY3RvcnkudHlwZSk7XG5cdFx0XHRpZiAoIWRpcikge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gZG8gbm90IGJ1bmRsZSBhZ2VudCBpbnN0cnVjdGlvbnNcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBkaXNjb3ZlcmVkRGlyZWN0b3J5LmZpbGVzKSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVVcmkgPSBmaWxlLnVyaTtcblx0XHRcdFx0Y29uc3QgZmlsZU5hbWUgPSBiYXNlbmFtZShmaWxlVXJpKTtcblxuXHRcdFx0XHRsZXQgZGVzdFVyaTogVVJJO1xuXHRcdFx0XHRsZXQgaGFzaEtleTogc3RyaW5nO1xuXHRcdFx0XHRpZiAoZGlzY292ZXJlZERpcmVjdG9yeS50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCkge1xuXHRcdFx0XHRcdC8vIFNraWxscyBhcmUgY29udmVudGlvbmFsbHkgYDxza2lsbE5hbWU+L1NLSUxMLm1kYC4gUHJlc2VydmUgdGhlXG5cdFx0XHRcdFx0Ly8gY29udGFpbmluZyBkaXJlY3RvcnkgbmFtZSBzbyBtdWx0aXBsZSBza2lsbHMgZG9uJ3QgY29sbGlkZS5cblx0XHRcdFx0XHRjb25zdCBza2lsbERpck5hbWUgPSBiYXNlbmFtZShkaXJuYW1lKGZpbGVVcmkpKTtcblx0XHRcdFx0XHRkZXN0VXJpID0gVVJJLmpvaW5QYXRoKHRoaXMuX3Jvb3RVcmksIGRpciwgc2tpbGxEaXJOYW1lLCBmaWxlTmFtZSk7XG5cdFx0XHRcdFx0aGFzaEtleSA9IGAke2Rpcn0vJHtza2lsbERpck5hbWV9LyR7ZmlsZU5hbWV9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZXN0VXJpID0gVVJJLmpvaW5QYXRoKHRoaXMuX3Jvb3RVcmksIGRpciwgZmlsZU5hbWUpO1xuXHRcdFx0XHRcdGhhc2hLZXkgPSBgJHtkaXJ9LyR7ZmlsZU5hbWV9YDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShmaWxlVXJpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRmaWxlcy5wdXNoKHsgZGVzdFVyaSwgY29udGVudDogY29udGVudC52YWx1ZSB9KTtcblx0XHRcdFx0aGFzaFBhcnRzLnB1c2goYCR7aGFzaEtleX06JHtjb250ZW50LnZhbHVlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRoYXNoUGFydHMuc29ydCgpO1xuXHRcdGNvbnN0IG5vbmNlID0gU3RyaW5nKGhhc2goaGFzaFBhcnRzLmpvaW4oJ1xcbicpKSk7XG5cblx0XHRjb25zdCByb290VXJpU3RyaW5nID0gdGhpcy5fcm9vdFVyaS50b1N0cmluZygpIGFzIFByb3RvY29sVVJJO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHtcblx0XHRcdHJlZjoge1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiBjdXN0b21pemF0aW9uSWQocm9vdFVyaVN0cmluZyksXG5cdFx0XHRcdHVyaTogcm9vdFVyaVN0cmluZyxcblx0XHRcdFx0bmFtZTogRElTUExBWV9OQU1FLFxuXHRcdFx0XHRub25jZSxcblx0XHRcdH0sXG5cdFx0fSBzYXRpc2ZpZXMgSUJ1bmRsZVJlc3VsdDtcblxuXHRcdGlmICh0aGlzLl9sYXN0Tm9uY2UgPT09IG5vbmNlKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwodGhpcy5fcm9vdFVyaSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBEaXJlY3RvcnkgbWF5IG5vdCBleGlzdCBvbiBmaXJzdCBidW5kbGUuXG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBtYW5pZmVzdFVyaSA9IFVSSS5qb2luUGF0aCh0aGlzLl9yb290VXJpLCAnLnBsdWdpbicsICdwbHVnaW4uanNvbicpO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihkaXJuYW1lKG1hbmlmZXN0VXJpKSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUobWFuaWZlc3RVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoTUFOSUZFU1RfQ09OVEVOVCkpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihkaXJuYW1lKGZpbGUuZGVzdFVyaSkpO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoZmlsZS5kZXN0VXJpLCBmaWxlLmNvbnRlbnQpO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGFzdE5vbmNlID0gbm9uY2U7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFT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
