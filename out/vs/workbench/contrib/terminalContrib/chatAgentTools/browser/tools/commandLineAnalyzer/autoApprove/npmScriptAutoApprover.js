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
import { MarkdownString } from "../../../../../../../../base/common/htmlContent.js";
import { visit } from "../../../../../../../../base/common/json.js";
import { Disposable } from "../../../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../../../base/common/uri.js";
import { IUriIdentityService } from "../../../../../../../../platform/uriIdentity/common/uriIdentity.js";
import { localize } from "../../../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../../../../platform/files/common/files.js";
import { IWorkspaceContextService } from "../../../../../../../../platform/workspace/common/workspace.js";
import { TerminalChatAgentToolsSettingId } from "../../../../common/terminalChatAgentToolsConfiguration.js";
const npmRunPatterns = [
  // npm run <script>
  // npm run-script <script>
  /^(?<command>npm)\s+(?:run(?:-script)?)\s+(?<scriptName>[^\s&|;]+)/i,
  // npm test, npm start, npm stop, npm restart (shorthand commands)
  // See https://docs.npmjs.com/cli/v10/commands/npm-run-script
  /^(?<command>npm)\s+(?<scriptName>test|start|stop|restart)\b/i,
  // yarn <script>
  // yarn run <script>
  /^(?<command>yarn)\s+(?:run\s+)?(?<scriptName>[^\s&|;]+)/i,
  // pnpm <script>
  // pnpm run <script>
  /^(?<command>pnpm)\s+(?:run\s+)?(?<scriptName>[^\s&|;]+)/i
];
const yarnBuiltinCommands = /* @__PURE__ */ new Set([
  "add",
  "audit",
  "autoclean",
  "bin",
  "cache",
  "check",
  "config",
  "create",
  "dedupe",
  "dlx",
  "exec",
  "explain",
  "generate-lock-entry",
  "global",
  "help",
  "import",
  "info",
  "init",
  "install",
  "licenses",
  "link",
  "list",
  "login",
  "logout",
  "node",
  "outdated",
  "owner",
  "pack",
  "patch",
  "patch-commit",
  "plugin",
  "policies",
  "publish",
  "rebuild",
  "remove",
  "run",
  "search",
  "set",
  "stage",
  "tag",
  "team",
  "unlink",
  "unplug",
  "up",
  "upgrade",
  "upgrade-interactive",
  "version",
  "versions",
  "why",
  "workspace",
  "workspaces"
]);
const pnpmBuiltinCommands = /* @__PURE__ */ new Set([
  "add",
  "audit",
  "bin",
  "config",
  "dedupe",
  "deploy",
  "dlx",
  "doctor",
  "env",
  "exec",
  "fetch",
  "import",
  "init",
  "install",
  "install-test",
  "licenses",
  "link",
  "list",
  "ln",
  "ls",
  "outdated",
  "pack",
  "patch",
  "patch-commit",
  "patch-remove",
  "prune",
  "publish",
  "rb",
  "rebuild",
  "remove",
  "rm",
  "root",
  "run",
  "server",
  "setup",
  "store",
  "un",
  "uninstall",
  "unlink",
  "up",
  "update",
  "why"
]);
let NpmScriptAutoApprover = class extends Disposable {
  constructor(_configurationService, _fileService, _uriIdentityService, _workspaceContextService) {
    super();
    this._configurationService = _configurationService;
    this._fileService = _fileService;
    this._uriIdentityService = _uriIdentityService;
    this._workspaceContextService = _workspaceContextService;
  }
  /**
   * Checks if a single command is an npm/yarn/pnpm script that exists in package.json.
   * Returns auto-approve result if the command is a valid script.
   */
  async isCommandAutoApproved(command, cwd) {
    const isNpmScriptAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts) === true;
    if (!isNpmScriptAutoApproveEnabled) {
      return { isAutoApproved: false };
    }
    const scriptName = this._extractScriptName(command);
    if (!scriptName) {
      return { isAutoApproved: false };
    }
    const packageJsonScripts = await this._getPackageJsonScripts(cwd);
    if (!packageJsonScripts) {
      return { isAutoApproved: false };
    }
    if (!packageJsonScripts.scripts.has(scriptName)) {
      return { isAutoApproved: false };
    }
    return {
      isAutoApproved: true,
      scriptName,
      autoApproveInfo: new MarkdownString(
        localize("autoApprove.npmScript", "Auto approved as {0} is defined in package.json", `\`${scriptName}\``)
      )
    };
  }
  /**
   * Extracts script name from an npm/yarn/pnpm run command.
   */
  _extractScriptName(command) {
    const trimmedCommand = command.trim();
    for (const pattern of npmRunPatterns) {
      const match = trimmedCommand.match(pattern);
      if (match?.groups?.scriptName) {
        const { command: pkgManager, scriptName } = match.groups;
        if (pkgManager.toLowerCase() === "yarn" && yarnBuiltinCommands.has(scriptName.toLowerCase())) {
          continue;
        }
        if (pkgManager.toLowerCase() === "pnpm" && pnpmBuiltinCommands.has(scriptName.toLowerCase())) {
          continue;
        }
        return scriptName;
      }
    }
    return void 0;
  }
  /**
   * Checks if a URI is within any workspace folder.
   */
  _isWithinWorkspace(uri) {
    const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
    return workspaceFolders.some((folder) => this._uriIdentityService.extUri.isEqualOrParent(uri, folder.uri));
  }
  /**
   * Finds and parses package.json to get the scripts section.
   * Only looks within the workspace for security.
   */
  async _getPackageJsonScripts(cwd) {
    if (!cwd || !this._isWithinWorkspace(cwd)) {
      return void 0;
    }
    const packageJsonUri = URI.joinPath(cwd, "package.json");
    const scripts = await this._readPackageJsonScripts(packageJsonUri);
    if (scripts) {
      return { uri: packageJsonUri, scripts };
    }
    return void 0;
  }
  /**
   * Reads and parses the scripts section from a package.json file.
   */
  async _readPackageJsonScripts(packageJsonUri) {
    try {
      const exists = await this._fileService.exists(packageJsonUri);
      if (!exists) {
        return void 0;
      }
      const content = await this._fileService.readFile(packageJsonUri);
      const text = content.value.toString();
      return this._parsePackageJsonScripts(text);
    } catch {
      return void 0;
    }
  }
  /**
   * Parses the scripts section from package.json content using jsonc-parser.
   */
  _parsePackageJsonScripts(content) {
    const scripts = /* @__PURE__ */ new Set();
    let inScripts = false;
    let level = 0;
    const visitor = {
      onError() {
      },
      onObjectBegin() {
        level++;
      },
      onObjectEnd() {
        if (inScripts && level === 2) {
          inScripts = false;
        }
        level--;
      },
      onObjectProperty(property) {
        if (level === 1 && property === "scripts") {
          inScripts = true;
        } else if (inScripts && level === 2) {
          scripts.add(property);
        }
      }
    };
    visit(content, visitor);
    return scripts.size > 0 ? scripts : void 0;
  }
};
NpmScriptAutoApprover = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IWorkspaceContextService)
], NpmScriptAutoApprover);
export {
  NpmScriptAutoApprover
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFxjb21tYW5kTGluZUFuYWx5emVyXFxhdXRvQXBwcm92ZVxcbnBtU2NyaXB0QXV0b0FwcHJvdmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcsIHR5cGUgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgdmlzaXQsIHR5cGUgSlNPTlZpc2l0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCB0eXBlIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLmpzJztcblxuLyoqXG4gKiBSZWdleCBwYXR0ZXJucyB0byBtYXRjaCBucG0veWFybi9wbnBtIHJ1biBjb21tYW5kcyBhbmQgZXh0cmFjdCB0aGUgc2NyaXB0IG5hbWUuXG4gKiBVc2VzIG5hbWVkIGNhcHR1cmUgZ3JvdXBzOiAnY29tbWFuZCcgZm9yIHRoZSBwYWNrYWdlIG1hbmFnZXIsICdzY3JpcHROYW1lJyBmb3IgdGhlIHNjcmlwdC5cbiAqL1xuY29uc3QgbnBtUnVuUGF0dGVybnMgPSBbXG5cdC8vIG5wbSBydW4gPHNjcmlwdD5cblx0Ly8gbnBtIHJ1bi1zY3JpcHQgPHNjcmlwdD5cblx0L14oPzxjb21tYW5kPm5wbSlcXHMrKD86cnVuKD86LXNjcmlwdCk/KVxccysoPzxzY3JpcHROYW1lPlteXFxzJnw7XSspL2ksXG5cdC8vIG5wbSB0ZXN0LCBucG0gc3RhcnQsIG5wbSBzdG9wLCBucG0gcmVzdGFydCAoc2hvcnRoYW5kIGNvbW1hbmRzKVxuXHQvLyBTZWUgaHR0cHM6Ly9kb2NzLm5wbWpzLmNvbS9jbGkvdjEwL2NvbW1hbmRzL25wbS1ydW4tc2NyaXB0XG5cdC9eKD88Y29tbWFuZD5ucG0pXFxzKyg/PHNjcmlwdE5hbWU+dGVzdHxzdGFydHxzdG9wfHJlc3RhcnQpXFxiL2ksXG5cdC8vIHlhcm4gPHNjcmlwdD5cblx0Ly8geWFybiBydW4gPHNjcmlwdD5cblx0L14oPzxjb21tYW5kPnlhcm4pXFxzKyg/OnJ1blxccyspPyg/PHNjcmlwdE5hbWU+W15cXHMmfDtdKykvaSxcblx0Ly8gcG5wbSA8c2NyaXB0PlxuXHQvLyBwbnBtIHJ1biA8c2NyaXB0PlxuXHQvXig/PGNvbW1hbmQ+cG5wbSlcXHMrKD86cnVuXFxzKyk/KD88c2NyaXB0TmFtZT5bXlxccyZ8O10rKS9pLFxuXTtcblxuLyoqXG4gKiBZYXJuIGJ1aWx0LWluIGNvbW1hbmRzIHRoYXQgc2hvdWxkIG5vdCBiZSB0cmVhdGVkIGFzIHNjcmlwdCBuYW1lcy5cbiAqIE5vdGU6ICd0ZXN0JyBpcyBvbWl0dGVkIHNpbmNlIGl0J3MgY29tbW9ubHkgYSB1c2VyIHNjcmlwdCwgYW5kICd5YXJuIHRlc3QnXG4gKiBpcyBvZnRlbiB1c2VkIHRvIHJ1biB0aGUgJ3Rlc3QnIHNjcmlwdCBmcm9tIHBhY2thZ2UuanNvbi5cbiAqL1xuY29uc3QgeWFybkJ1aWx0aW5Db21tYW5kcyA9IG5ldyBTZXQoW1xuXHQnYWRkJywgJ2F1ZGl0JywgJ2F1dG9jbGVhbicsICdiaW4nLCAnY2FjaGUnLCAnY2hlY2snLCAnY29uZmlnJyxcblx0J2NyZWF0ZScsICdkZWR1cGUnLCAnZGx4JywgJ2V4ZWMnLCAnZXhwbGFpbicsICdnZW5lcmF0ZS1sb2NrLWVudHJ5Jyxcblx0J2dsb2JhbCcsICdoZWxwJywgJ2ltcG9ydCcsICdpbmZvJywgJ2luaXQnLCAnaW5zdGFsbCcsICdsaWNlbnNlcycsXG5cdCdsaW5rJywgJ2xpc3QnLCAnbG9naW4nLCAnbG9nb3V0JywgJ25vZGUnLCAnb3V0ZGF0ZWQnLCAnb3duZXInLFxuXHQncGFjaycsICdwYXRjaCcsICdwYXRjaC1jb21taXQnLCAncGx1Z2luJywgJ3BvbGljaWVzJywgJ3B1Ymxpc2gnLFxuXHQncmVidWlsZCcsICdyZW1vdmUnLCAncnVuJywgJ3NlYXJjaCcsICdzZXQnLCAnc3RhZ2UnLCAndGFnJywgJ3RlYW0nLFxuXHQndW5saW5rJywgJ3VucGx1ZycsICd1cCcsICd1cGdyYWRlJywgJ3VwZ3JhZGUtaW50ZXJhY3RpdmUnLFxuXHQndmVyc2lvbicsICd2ZXJzaW9ucycsICd3aHknLCAnd29ya3NwYWNlJywgJ3dvcmtzcGFjZXMnLFxuXSk7XG5cbi8qKlxuICogcG5wbSBidWlsdC1pbiBjb21tYW5kcyB0aGF0IHNob3VsZCBub3QgYmUgdHJlYXRlZCBhcyBzY3JpcHQgbmFtZXMuXG4gKiBOb3RlOiAndGVzdCcgaXMgb21pdHRlZCBzaW5jZSBpdCdzIGNvbW1vbmx5IGEgdXNlciBzY3JpcHQsIGFuZCAncG5wbSB0ZXN0J1xuICogaXMgb2Z0ZW4gdXNlZCB0byBydW4gdGhlICd0ZXN0JyBzY3JpcHQgZnJvbSBwYWNrYWdlLmpzb24uXG4gKi9cbmNvbnN0IHBucG1CdWlsdGluQ29tbWFuZHMgPSBuZXcgU2V0KFtcblx0J2FkZCcsICdhdWRpdCcsICdiaW4nLCAnY29uZmlnJywgJ2RlZHVwZScsICdkZXBsb3knLCAnZGx4JywgJ2RvY3RvcicsXG5cdCdlbnYnLCAnZXhlYycsICdmZXRjaCcsICdpbXBvcnQnLCAnaW5pdCcsICdpbnN0YWxsJywgJ2luc3RhbGwtdGVzdCcsXG5cdCdsaWNlbnNlcycsICdsaW5rJywgJ2xpc3QnLCAnbG4nLCAnbHMnLCAnb3V0ZGF0ZWQnLCAncGFjaycsICdwYXRjaCcsXG5cdCdwYXRjaC1jb21taXQnLCAncGF0Y2gtcmVtb3ZlJywgJ3BydW5lJywgJ3B1Ymxpc2gnLCAncmInLCAncmVidWlsZCcsXG5cdCdyZW1vdmUnLCAncm0nLCAncm9vdCcsICdydW4nLCAnc2VydmVyJywgJ3NldHVwJywgJ3N0b3JlJyxcblx0J3VuJywgJ3VuaW5zdGFsbCcsICd1bmxpbmsnLCAndXAnLCAndXBkYXRlJywgJ3doeScsXG5dKTtcblxuaW50ZXJmYWNlIElQYWNrYWdlSnNvblNjcmlwdHMge1xuXHR1cmk6IFVSSTtcblx0c2NyaXB0czogU2V0PHN0cmluZz47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5wbVNjcmlwdEF1dG9BcHByb3ZlUmVzdWx0IHtcblx0aXNBdXRvQXBwcm92ZWQ6IGJvb2xlYW47XG5cdHNjcmlwdE5hbWU/OiBzdHJpbmc7XG5cdGF1dG9BcHByb3ZlSW5mbz86IElNYXJrZG93blN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIE5wbVNjcmlwdEF1dG9BcHByb3ZlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVja3MgaWYgYSBzaW5nbGUgY29tbWFuZCBpcyBhbiBucG0veWFybi9wbnBtIHNjcmlwdCB0aGF0IGV4aXN0cyBpbiBwYWNrYWdlLmpzb24uXG5cdCAqIFJldHVybnMgYXV0by1hcHByb3ZlIHJlc3VsdCBpZiB0aGUgY29tbWFuZCBpcyBhIHZhbGlkIHNjcmlwdC5cblx0ICovXG5cdGFzeW5jIGlzQ29tbWFuZEF1dG9BcHByb3ZlZChjb21tYW5kOiBzdHJpbmcsIGN3ZDogVVJJIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJTnBtU2NyaXB0QXV0b0FwcHJvdmVSZXN1bHQ+IHtcblx0XHQvLyBDaGVjayBpZiB0aGUgZmVhdHVyZSBpcyBlbmFibGVkXG5cdFx0Y29uc3QgaXNOcG1TY3JpcHRBdXRvQXBwcm92ZUVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlV29ya3NwYWNlTnBtU2NyaXB0cykgPT09IHRydWU7XG5cdFx0aWYgKCFpc05wbVNjcmlwdEF1dG9BcHByb3ZlRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHsgaXNBdXRvQXBwcm92ZWQ6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Ly8gRXh0cmFjdCBzY3JpcHQgbmFtZSBmcm9tIHRoZSBjb21tYW5kXG5cdFx0Y29uc3Qgc2NyaXB0TmFtZSA9IHRoaXMuX2V4dHJhY3RTY3JpcHROYW1lKGNvbW1hbmQpO1xuXHRcdGlmICghc2NyaXB0TmFtZSkge1xuXHRcdFx0cmV0dXJuIHsgaXNBdXRvQXBwcm92ZWQ6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCBhbmQgcGFyc2UgcGFja2FnZS5qc29uXG5cdFx0Y29uc3QgcGFja2FnZUpzb25TY3JpcHRzID0gYXdhaXQgdGhpcy5fZ2V0UGFja2FnZUpzb25TY3JpcHRzKGN3ZCk7XG5cdFx0aWYgKCFwYWNrYWdlSnNvblNjcmlwdHMpIHtcblx0XHRcdHJldHVybiB7IGlzQXV0b0FwcHJvdmVkOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHNjcmlwdCBleGlzdHMgaW4gcGFja2FnZS5qc29uXG5cdFx0aWYgKCFwYWNrYWdlSnNvblNjcmlwdHMuc2NyaXB0cy5oYXMoc2NyaXB0TmFtZSkpIHtcblx0XHRcdHJldHVybiB7IGlzQXV0b0FwcHJvdmVkOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdC8vIFNjcmlwdCBleGlzdHMgLSBhdXRvIGFwcHJvdmVcblx0XHRyZXR1cm4ge1xuXHRcdFx0aXNBdXRvQXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRzY3JpcHROYW1lLFxuXHRcdFx0YXV0b0FwcHJvdmVJbmZvOiBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvQXBwcm92ZS5ucG1TY3JpcHQnLCAnQXV0byBhcHByb3ZlZCBhcyB7MH0gaXMgZGVmaW5lZCBpbiBwYWNrYWdlLmpzb24nLCBgXFxgJHtzY3JpcHROYW1lfVxcYGApXG5cdFx0XHQpLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogRXh0cmFjdHMgc2NyaXB0IG5hbWUgZnJvbSBhbiBucG0veWFybi9wbnBtIHJ1biBjb21tYW5kLlxuXHQgKi9cblx0cHJpdmF0ZSBfZXh0cmFjdFNjcmlwdE5hbWUoY29tbWFuZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0cmltbWVkQ29tbWFuZCA9IGNvbW1hbmQudHJpbSgpO1xuXG5cdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIG5wbVJ1blBhdHRlcm5zKSB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IHRyaW1tZWRDb21tYW5kLm1hdGNoKHBhdHRlcm4pO1xuXHRcdFx0aWYgKG1hdGNoPy5ncm91cHM/LnNjcmlwdE5hbWUpIHtcblx0XHRcdFx0Y29uc3QgeyBjb21tYW5kOiBwa2dNYW5hZ2VyLCBzY3JpcHROYW1lIH0gPSBtYXRjaC5ncm91cHM7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyBhIHlhcm4vcG5wbSBzaG9ydGhhbmQgdGhhdCBtYXRjaGVzIGEgYnVpbHQtaW4gY29tbWFuZFxuXHRcdFx0XHRpZiAocGtnTWFuYWdlci50b0xvd2VyQ2FzZSgpID09PSAneWFybicgJiYgeWFybkJ1aWx0aW5Db21tYW5kcy5oYXMoc2NyaXB0TmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwa2dNYW5hZ2VyLnRvTG93ZXJDYXNlKCkgPT09ICdwbnBtJyAmJiBwbnBtQnVpbHRpbkNvbW1hbmRzLmhhcyhzY3JpcHROYW1lLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gc2NyaXB0TmFtZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiBhIFVSSSBpcyB3aXRoaW4gYW55IHdvcmtzcGFjZSBmb2xkZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9pc1dpdGhpbldvcmtzcGFjZSh1cmk6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdHJldHVybiB3b3Jrc3BhY2VGb2xkZXJzLnNvbWUoKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcikgPT4gdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQodXJpLCBmb2xkZXIudXJpKSk7XG5cdH1cblxuXHQvKipcblx0ICogRmluZHMgYW5kIHBhcnNlcyBwYWNrYWdlLmpzb24gdG8gZ2V0IHRoZSBzY3JpcHRzIHNlY3Rpb24uXG5cdCAqIE9ubHkgbG9va3Mgd2l0aGluIHRoZSB3b3Jrc3BhY2UgZm9yIHNlY3VyaXR5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0UGFja2FnZUpzb25TY3JpcHRzKGN3ZDogVVJJIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJUGFja2FnZUpzb25TY3JpcHRzIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gT25seSBsb29rIGluIGN3ZCBpZiBpdCdzIHdpdGhpbiB0aGUgd29ya3NwYWNlXG5cdFx0aWYgKCFjd2QgfHwgIXRoaXMuX2lzV2l0aGluV29ya3NwYWNlKGN3ZCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFja2FnZUpzb25VcmkgPSBVUkkuam9pblBhdGgoY3dkLCAncGFja2FnZS5qc29uJyk7XG5cdFx0Y29uc3Qgc2NyaXB0cyA9IGF3YWl0IHRoaXMuX3JlYWRQYWNrYWdlSnNvblNjcmlwdHMocGFja2FnZUpzb25VcmkpO1xuXHRcdGlmIChzY3JpcHRzKSB7XG5cdFx0XHRyZXR1cm4geyB1cmk6IHBhY2thZ2VKc29uVXJpLCBzY3JpcHRzIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBhbmQgcGFyc2VzIHRoZSBzY3JpcHRzIHNlY3Rpb24gZnJvbSBhIHBhY2thZ2UuanNvbiBmaWxlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFBhY2thZ2VKc29uU2NyaXB0cyhwYWNrYWdlSnNvblVyaTogVVJJKTogUHJvbWlzZTxTZXQ8c3RyaW5nPiB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMocGFja2FnZUpzb25VcmkpO1xuXHRcdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHBhY2thZ2VKc29uVXJpKTtcblx0XHRcdGNvbnN0IHRleHQgPSBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cblx0XHRcdHJldHVybiB0aGlzLl9wYXJzZVBhY2thZ2VKc29uU2NyaXB0cyh0ZXh0KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBhcnNlcyB0aGUgc2NyaXB0cyBzZWN0aW9uIGZyb20gcGFja2FnZS5qc29uIGNvbnRlbnQgdXNpbmcganNvbmMtcGFyc2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGFyc2VQYWNrYWdlSnNvblNjcmlwdHMoY29udGVudDogc3RyaW5nKTogU2V0PHN0cmluZz4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNjcmlwdHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRsZXQgaW5TY3JpcHRzID0gZmFsc2U7XG5cdFx0bGV0IGxldmVsID0gMDtcblxuXHRcdGNvbnN0IHZpc2l0b3I6IEpTT05WaXNpdG9yID0ge1xuXHRcdFx0b25FcnJvcigpIHtcblx0XHRcdFx0Ly8gSWdub3JlIHBhcnNlIGVycm9yc1xuXHRcdFx0fSxcblx0XHRcdG9uT2JqZWN0QmVnaW4oKSB7XG5cdFx0XHRcdGxldmVsKys7XG5cdFx0XHR9LFxuXHRcdFx0b25PYmplY3RFbmQoKSB7XG5cdFx0XHRcdGlmIChpblNjcmlwdHMgJiYgbGV2ZWwgPT09IDIpIHtcblx0XHRcdFx0XHRpblNjcmlwdHMgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXZlbC0tO1xuXHRcdFx0fSxcblx0XHRcdG9uT2JqZWN0UHJvcGVydHkocHJvcGVydHk6IHN0cmluZykge1xuXHRcdFx0XHRpZiAobGV2ZWwgPT09IDEgJiYgcHJvcGVydHkgPT09ICdzY3JpcHRzJykge1xuXHRcdFx0XHRcdGluU2NyaXB0cyA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaW5TY3JpcHRzICYmIGxldmVsID09PSAyKSB7XG5cdFx0XHRcdFx0c2NyaXB0cy5hZGQocHJvcGVydHkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHR2aXNpdChjb250ZW50LCB2aXNpdG9yKTtcblxuXHRcdHJldHVy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
