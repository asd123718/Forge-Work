import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import * as paths from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import * as process from "../../../../base/common/process.js";
import * as types from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { allVariableKinds, VariableError, VariableKind } from "./configurationResolver.js";
import { ConfigurationResolverExpression } from "./configurationResolverExpression.js";
class AbstractVariableResolverService {
  constructor(_context, _labelService, _userHomePromise, _envVariablesPromise) {
    this._contributedVariables = /* @__PURE__ */ new Map();
    this.resolvableVariables = new Set(allVariableKinds);
    this._context = _context;
    this._labelService = _labelService;
    this._userHomePromise = _userHomePromise;
    if (_envVariablesPromise) {
      this._envVariablesPromise = _envVariablesPromise.then((envVariables) => {
        return this.prepareEnv(envVariables);
      });
    }
  }
  prepareEnv(envVariables) {
    if (isWindows) {
      const ev = /* @__PURE__ */ Object.create(null);
      Object.keys(envVariables).forEach((key) => {
        ev[key.toLowerCase()] = envVariables[key];
      });
      return ev;
    }
    return envVariables;
  }
  async resolveWithEnvironment(environment, folder, value) {
    const expr = ConfigurationResolverExpression.parse(value);
    for (const replacement of expr.unresolved()) {
      const resolvedValue = await this.evaluateSingleVariable(replacement, folder?.uri, environment);
      if (resolvedValue !== void 0) {
        expr.resolve(replacement, String(resolvedValue));
      }
    }
    return expr.toObject();
  }
  async resolveAsync(folder, config) {
    const expr = ConfigurationResolverExpression.parse(config);
    for (const replacement of expr.unresolved()) {
      const resolvedValue = await this.evaluateSingleVariable(replacement, folder?.uri);
      if (resolvedValue !== void 0) {
        expr.resolve(replacement, String(resolvedValue));
      }
    }
    return expr.toObject();
  }
  resolveWithInteractionReplace(folder, config) {
    throw new Error("resolveWithInteractionReplace not implemented.");
  }
  resolveWithInteraction(folder, config) {
    throw new Error("resolveWithInteraction not implemented.");
  }
  contributeVariable(variable, resolution) {
    if (this._contributedVariables.has(variable)) {
      throw new Error("Variable " + variable + " is contributed twice.");
    } else {
      this.resolvableVariables.add(variable);
      this._contributedVariables.set(variable, resolution);
    }
  }
  fsPath(displayUri) {
    return this._labelService ? this._labelService.getUriLabel(displayUri, { noPrefix: true }) : displayUri.fsPath;
  }
  async evaluateSingleVariable(replacement, folderUri, processEnvironment, commandValueMapping) {
    const environment = {
      env: processEnvironment !== void 0 ? this.prepareEnv(processEnvironment) : await this._envVariablesPromise,
      userHome: processEnvironment !== void 0 ? void 0 : await this._userHomePromise
    };
    const { name: variable, arg: argument } = replacement;
    const getFilePath = (variableKind) => {
      const filePath = this._context.getFilePath();
      if (filePath) {
        return normalizeDriveLetter(filePath);
      }
      throw new VariableError(variableKind, localize("canNotResolveFile", "Variable {0} can not be resolved. Please open an editor.", replacement.id));
    };
    const getFolderPathForFile = (variableKind) => {
      const filePath = getFilePath(variableKind);
      if (this._context.getWorkspaceFolderPathForFile) {
        const folderPath = this._context.getWorkspaceFolderPathForFile();
        if (folderPath) {
          return normalizeDriveLetter(folderPath);
        }
      }
      throw new VariableError(variableKind, localize("canNotResolveFolderForFile", "Variable {0}: can not find workspace folder of '{1}'.", replacement.id, paths.basename(filePath)));
    };
    const getFolderUri = (variableKind) => {
      if (argument) {
        const folder = this._context.getFolderUri(argument);
        if (folder) {
          return folder;
        }
        throw new VariableError(variableKind, localize("canNotFindFolder", "Variable {0} can not be resolved. No such folder '{1}'.", variableKind, argument));
      }
      if (folderUri) {
        return folderUri;
      }
      if (this._context.getWorkspaceFolderCount() > 1) {
        throw new VariableError(variableKind, localize("canNotResolveWorkspaceFolderMultiRoot", "Variable {0} can not be resolved in a multi folder workspace. Scope this variable using ':' and a workspace folder name.", variableKind));
      }
      throw new VariableError(variableKind, localize("canNotResolveWorkspaceFolder", "Variable {0} can not be resolved. Please open a folder.", variableKind));
    };
    switch (variable) {
      case "env":
        if (argument) {
          if (environment.env) {
            const env = environment.env[isWindows ? argument.toLowerCase() : argument];
            if (types.isString(env)) {
              return env;
            }
          }
          return "";
        }
        throw new VariableError(VariableKind.Env, localize("missingEnvVarName", "Variable {0} can not be resolved because no environment variable name is given.", replacement.id));
      case "config":
        if (argument) {
          const config = this._context.getConfigurationValue(folderUri, argument);
          if (types.isUndefinedOrNull(config)) {
            throw new VariableError(VariableKind.Config, localize("configNotFound", "Variable {0} can not be resolved because setting '{1}' not found.", replacement.id, argument));
          }
          if (types.isObject(config)) {
            throw new VariableError(VariableKind.Config, localize("configNoString", "Variable {0} can not be resolved because '{1}' is a structured value.", replacement.id, argument));
          }
          return config;
        }
        throw new VariableError(VariableKind.Config, localize("missingConfigName", "Variable {0} can not be resolved because no settings name is given.", replacement.id));
      case "command":
        return this.resolveFromMap(VariableKind.Command, replacement.id, argument, commandValueMapping, "command");
      case "input":
        return this.resolveFromMap(VariableKind.Input, replacement.id, argument, commandValueMapping, "input");
      case "extensionInstallFolder":
        if (argument) {
          const ext = await this._context.getExtension(argument);
          if (!ext) {
            throw new VariableError(VariableKind.ExtensionInstallFolder, localize("extensionNotInstalled", "Variable {0} can not be resolved because the extension {1} is not installed.", replacement.id, argument));
          }
          return this.fsPath(ext.extensionLocation);
        }
        throw new VariableError(VariableKind.ExtensionInstallFolder, localize("missingExtensionName", "Variable {0} can not be resolved because no extension name is given.", replacement.id));
      default: {
        switch (variable) {
          case "workspaceRoot":
          case "workspaceFolder": {
            const uri2 = getFolderUri(VariableKind.WorkspaceFolder);
            return uri2 ? normalizeDriveLetter(this.fsPath(uri2)) : void 0;
          }
          case "cwd": {
            if (!folderUri && !argument) {
              return process.cwd();
            }
            const uri2 = getFolderUri(VariableKind.Cwd);
            return uri2 ? normalizeDriveLetter(this.fsPath(uri2)) : void 0;
          }
          case "workspaceRootFolderName":
          case "workspaceFolderBasename": {
            const uri2 = getFolderUri(VariableKind.WorkspaceFolderBasename);
            return uri2 ? normalizeDriveLetter(paths.basename(this.fsPath(uri2))) : void 0;
          }
          case "userHome":
            if (environment.userHome) {
              return environment.userHome;
            }
            throw new VariableError(VariableKind.UserHome, localize("canNotResolveUserHome", "Variable {0} can not be resolved. UserHome path is not defined", replacement.id));
          case "lineNumber": {
            const lineNumber = this._context.getLineNumber();
            if (lineNumber) {
              return lineNumber;
            }
            throw new VariableError(VariableKind.LineNumber, localize("canNotResolveLineNumber", "Variable {0} can not be resolved. Make sure to have a line selected in the active editor.", replacement.id));
          }
          case "columnNumber": {
            const columnNumber = this._context.getColumnNumber();
            if (columnNumber) {
              return columnNumber;
            }
            throw new Error(localize("canNotResolveColumnNumber", "Variable {0} can not be resolved. Make sure to have a column selected in the active editor.", replacement.id));
          }
          case "selectedText": {
            const selectedText = this._context.getSelectedText();
            if (selectedText) {
              return selectedText;
            }
            throw new VariableError(VariableKind.SelectedText, localize("canNotResolveSelectedText", "Variable {0} can not be resolved. Make sure to have some text selected in the active editor.", replacement.id));
          }
          case "file":
            return getFilePath(VariableKind.File);
          case "fileWorkspaceFolder":
            return getFolderPathForFile(VariableKind.FileWorkspaceFolder);
          case "fileWorkspaceFolderBasename":
            return paths.basename(getFolderPathForFile(VariableKind.FileWorkspaceFolderBasename));
          case "relativeFile":
            if (folderUri || argument) {
              return paths.relative(this.fsPath(getFolderUri(VariableKind.RelativeFile)), getFilePath(VariableKind.RelativeFile));
            }
            return getFilePath(VariableKind.RelativeFile);
          case "relativeFileDirname": {
            const dirname = paths.dirname(getFilePath(VariableKind.RelativeFileDirname));
            if (folderUri || argument) {
              const relative = paths.relative(this.fsPath(getFolderUri(VariableKind.RelativeFileDirname)), dirname);
              return relative.length === 0 ? "." : relative;
            }
            return dirname;
          }
          case "fileDirname":
            return paths.dirname(getFilePath(VariableKind.FileDirname));
          case "fileExtname":
            return paths.extname(getFilePath(VariableKind.FileExtname));
          case "fileBasename":
            return paths.basename(getFilePath(VariableKind.FileBasename));
          case "fileBasenameNoExtension": {
            const basename = paths.basename(getFilePath(VariableKind.FileBasenameNoExtension));
            return basename.slice(0, basename.length - paths.extname(basename).length);
          }
          case "fileDirnameBasename":
            return paths.basename(paths.dirname(getFilePath(VariableKind.FileDirnameBasename)));
          case "execPath": {
            const ep = this._context.getExecPath();
            if (ep) {
              return ep;
            }
            return replacement.id;
          }
          case "execInstallFolder": {
            const ar = this._context.getAppRoot();
            if (ar) {
              return ar;
            }
            return replacement.id;
          }
          case "pathSeparator":
          case "/":
            return paths.sep;
          default: {
            try {
              return this.resolveFromMap(VariableKind.Unknown, replacement.id, argument, commandValueMapping, void 0);
            } catch {
              return replacement.id;
            }
          }
        }
      }
    }
  }
  resolveFromMap(variableKind, match, argument, commandValueMapping, prefix) {
    if (argument && commandValueMapping) {
      const v = prefix === void 0 ? commandValueMapping[argument] : commandValueMapping[prefix + ":" + argument];
      if (typeof v === "string") {
        return v;
      }
      throw new VariableError(variableKind, localize("noValueForCommand", "Variable {0} can not be resolved because the command has no value.", match));
    }
    return match;
  }
}
export {
  AbstractVariableResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb25maWd1cmF0aW9uUmVzb2x2ZXJcXGNvbW1vblxcdmFyaWFibGVSZXNvbHZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplRHJpdmVMZXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0ICogYXMgcGF0aHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBwcm9jZXNzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIGFzIHVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VGb2xkZXJEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgYWxsVmFyaWFibGVLaW5kcywgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsIFZhcmlhYmxlRXJyb3IsIFZhcmlhYmxlS2luZCB9IGZyb20gJy4vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24sIElSZXNvbHZlZFZhbHVlLCBSZXBsYWNlbWVudCB9IGZyb20gJy4vY29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5qcyc7XG5cbmludGVyZmFjZSBJVmFyaWFibGVSZXNvbHZlQ29udGV4dCB7XG5cdGdldEZvbGRlclVyaShmb2xkZXJOYW1lOiBzdHJpbmcpOiB1cmkgfCB1bmRlZmluZWQ7XG5cdGdldFdvcmtzcGFjZUZvbGRlckNvdW50KCk6IG51bWJlcjtcblx0Z2V0Q29uZmlndXJhdGlvblZhbHVlKGZvbGRlclVyaTogdXJpIHwgdW5kZWZpbmVkLCBzZWN0aW9uOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldEFwcFJvb3QoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXRFeGVjUGF0aCgpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldEZpbGVQYXRoKCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0V29ya3NwYWNlRm9sZGVyUGF0aEZvckZpbGU/KCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0U2VsZWN0ZWRUZXh0KCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0TGluZU51bWJlcigpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldENvbHVtbk51bWJlcigpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldEV4dGVuc2lvbihpZDogc3RyaW5nKTogUHJvbWlzZTx7IHJlYWRvbmx5IGV4dGVuc2lvbkxvY2F0aW9uOiB1cmkgfSB8IHVuZGVmaW5lZD47XG59XG5cbnR5cGUgRW52aXJvbm1lbnQgPSB7IGVudjogSVByb2Nlc3NFbnZpcm9ubWVudCB8IHVuZGVmaW5lZDsgdXNlckhvbWU6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RWYXJpYWJsZVJlc29sdmVyU2VydmljZSBpbXBsZW1lbnRzIElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9jb250ZXh0OiBJVmFyaWFibGVSZXNvbHZlQ29udGV4dDtcblx0cHJpdmF0ZSBfbGFiZWxTZXJ2aWNlPzogSUxhYmVsU2VydmljZTtcblx0cHJpdmF0ZSBfZW52VmFyaWFibGVzUHJvbWlzZT86IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD47XG5cdHByaXZhdGUgX3VzZXJIb21lUHJvbWlzZT86IFByb21pc2U8c3RyaW5nPjtcblx0cHJvdGVjdGVkIF9jb250cmlidXRlZFZhcmlhYmxlczogTWFwPHN0cmluZywgKCkgPT4gUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+PiA9IG5ldyBNYXAoKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgcmVzb2x2YWJsZVZhcmlhYmxlcyA9IG5ldyBTZXQ8c3RyaW5nPihhbGxWYXJpYWJsZUtpbmRzKTtcblxuXHRjb25zdHJ1Y3RvcihfY29udGV4dDogSVZhcmlhYmxlUmVzb2x2ZUNvbnRleHQsIF9sYWJlbFNlcnZpY2U/OiBJTGFiZWxTZXJ2aWNlLCBfdXNlckhvbWVQcm9taXNlPzogUHJvbWlzZTxzdHJpbmc+LCBfZW52VmFyaWFibGVzUHJvbWlzZT86IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD4pIHtcblx0XHR0aGlzLl9jb250ZXh0ID0gX2NvbnRleHQ7XG5cdFx0dGhpcy5fbGFiZWxTZXJ2aWNlID0gX2xhYmVsU2VydmljZTtcblx0XHR0aGlzLl91c2VySG9tZVByb21pc2UgPSBfdXNlckhvbWVQcm9taXNlO1xuXHRcdGlmIChfZW52VmFyaWFibGVzUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fZW52VmFyaWFibGVzUHJvbWlzZSA9IF9lbnZWYXJpYWJsZXNQcm9taXNlLnRoZW4oZW52VmFyaWFibGVzID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJlcGFyZUVudihlbnZWYXJpYWJsZXMpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwcmVwYXJlRW52KGVudlZhcmlhYmxlczogSVByb2Nlc3NFbnZpcm9ubWVudCk6IElQcm9jZXNzRW52aXJvbm1lbnQge1xuXHRcdC8vIHdpbmRvd3MgZW52IHZhcmlhYmxlcyBhcmUgY2FzZSBpbnNlbnNpdGl2ZVxuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IGV2OiBJUHJvY2Vzc0Vudmlyb25tZW50ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdE9iamVjdC5rZXlzKGVudlZhcmlhYmxlcykuZm9yRWFjaChrZXkgPT4ge1xuXHRcdFx0XHRldltrZXkudG9Mb3dlckNhc2UoKV0gPSBlbnZWYXJpYWJsZXNba2V5XTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGV2O1xuXHRcdH1cblx0XHRyZXR1cm4gZW52VmFyaWFibGVzO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc29sdmVXaXRoRW52aXJvbm1lbnQoZW52aXJvbm1lbnQ6IElQcm9jZXNzRW52aXJvbm1lbnQsIGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlckRhdGEgfCB1bmRlZmluZWQsIHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKHZhbHVlKTtcblxuXHRcdGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgZXhwci51bnJlc29sdmVkKCkpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkVmFsdWUgPSBhd2FpdCB0aGlzLmV2YWx1YXRlU2luZ2xlVmFyaWFibGUocmVwbGFjZW1lbnQsIGZvbGRlcj8udXJpLCBlbnZpcm9ubWVudCk7XG5cdFx0XHRpZiAocmVzb2x2ZWRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGV4cHIucmVzb2x2ZShyZXBsYWNlbWVudCwgU3RyaW5nKHJlc29sdmVkVmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZXhwci50b09iamVjdCgpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc29sdmVBc3luYzxUPihmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXJEYXRhIHwgdW5kZWZpbmVkLCBjb25maWc6IFQpOiBQcm9taXNlPFQgZXh0ZW5kcyBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uPGluZmVyIFI+ID8gUiA6IFQ+IHtcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZShjb25maWcpO1xuXG5cdFx0Zm9yIChjb25zdCByZXBsYWNlbWVudCBvZiBleHByLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRWYWx1ZSA9IGF3YWl0IHRoaXMuZXZhbHVhdGVTaW5nbGVWYXJpYWJsZShyZXBsYWNlbWVudCwgZm9sZGVyPy51cmkpO1xuXHRcdFx0aWYgKHJlc29sdmVkVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRleHByLnJlc29sdmUocmVwbGFjZW1lbnQsIFN0cmluZyhyZXNvbHZlZFZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGV4cHIudG9PYmplY3QoKSBhcyAoVCBleHRlbmRzIENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb248aW5mZXIgUj4gPyBSIDogVCk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZVdpdGhJbnRlcmFjdGlvblJlcGxhY2UoZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyRGF0YSB8IHVuZGVmaW5lZCwgY29uZmlnOiB1bmtub3duKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdyZXNvbHZlV2l0aEludGVyYWN0aW9uUmVwbGFjZSBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZVdpdGhJbnRlcmFjdGlvbihmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXJEYXRhIHwgdW5kZWZpbmVkLCBjb25maWc6IHVua25vd24pOiBQcm9taXNlPE1hcDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Jlc29sdmVXaXRoSW50ZXJhY3Rpb24gbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0cHVibGljIGNvbnRyaWJ1dGVWYXJpYWJsZSh2YXJpYWJsZTogc3RyaW5nLCByZXNvbHV0aW9uOiAoKSA9PiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29udHJpYnV0ZWRWYXJpYWJsZXMuaGFzKHZhcmlhYmxlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdWYXJpYWJsZSAnICsgdmFyaWFibGUgKyAnIGlzIGNvbnRyaWJ1dGVkIHR3aWNlLicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlc29sdmFibGVWYXJpYWJsZXMuYWRkKHZhcmlhYmxlKTtcblx0XHRcdHRoaXMuX2NvbnRyaWJ1dGVkVmFyaWFibGVzLnNldCh2YXJpYWJsZSwgcmVzb2x1dGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmc1BhdGgoZGlzcGxheVVyaTogdXJpKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFiZWxTZXJ2aWNlID8gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpc3BsYXlVcmksIHsgbm9QcmVmaXg6IHRydWUgfSkgOiBkaXNwbGF5VXJpLmZzUGF0aDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBldmFsdWF0ZVNpbmdsZVZhcmlhYmxlKHJlcGxhY2VtZW50OiBSZXBsYWNlbWVudCwgZm9sZGVyVXJpOiB1cmkgfCB1bmRlZmluZWQsIHByb2Nlc3NFbnZpcm9ubWVudD86IElQcm9jZXNzRW52aXJvbm1lbnQsIGNvbW1hbmRWYWx1ZU1hcHBpbmc/OiBJU3RyaW5nRGljdGlvbmFyeTxJUmVzb2x2ZWRWYWx1ZT4pOiBQcm9taXNlPElSZXNvbHZlZFZhbHVlIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cblxuXHRcdGNvbnN0IGVudmlyb25tZW50OiBFbnZpcm9ubWVudCA9IHtcblx0XHRcdGVudjogKHByb2Nlc3NFbnZpcm9ubWVudCAhPT0gdW5kZWZpbmVkKSA/IHRoaXMucHJlcGFyZUVudihwcm9jZXNzRW52aXJvbm1lbnQpIDogYXdhaXQgdGhpcy5fZW52VmFyaWFibGVzUHJvbWlzZSxcblx0XHRcdHVzZXJIb21lOiAocHJvY2Vzc0Vudmlyb25tZW50ICE9PSB1bmRlZmluZWQpID8gdW5kZWZpbmVkIDogYXdhaXQgdGhpcy5fdXNlckhvbWVQcm9taXNlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHsgbmFtZTogdmFyaWFibGUsIGFyZzogYXJndW1lbnQgfSA9IHJlcGxhY2VtZW50O1xuXG5cdFx0Ly8gY29tbW9uIGVycm9yIGhhbmRsaW5nIGZvciBhbGwgdmFyaWFibGVzIHRoYXQgcmVxdWlyZSBhbiBvcGVuIGVkaXRvclxuXHRcdGNvbnN0IGdldEZpbGVQYXRoID0gKHZhcmlhYmxlS2luZDogVmFyaWFibGVLaW5kKTogc3RyaW5nID0+IHtcblx0XHRcdGNvbnN0IGZpbGVQYXRoID0gdGhpcy5fY29udGV4dC5nZXRGaWxlUGF0aCgpO1xuXHRcdFx0aWYgKGZpbGVQYXRoKSB7XG5cdFx0XHRcdHJldHVybiBub3JtYWxpemVEcml2ZUxldHRlcihmaWxlUGF0aCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcih2YXJpYWJsZUtpbmQsIChsb2NhbGl6ZSgnY2FuTm90UmVzb2x2ZUZpbGUnLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkLiBQbGVhc2Ugb3BlbiBhbiBlZGl0b3IuXCIsIHJlcGxhY2VtZW50LmlkKSkpO1xuXHRcdH07XG5cblx0XHQvLyBjb21tb24gZXJyb3IgaGFuZGxpbmcgZm9yIGFsbCB2YXJpYWJsZXMgdGhhdCByZXF1aXJlIGFuIG9wZW4gZWRpdG9yXG5cdFx0Y29uc3QgZ2V0Rm9sZGVyUGF0aEZvckZpbGUgPSAodmFyaWFibGVLaW5kOiBWYXJpYWJsZUtpbmQpOiBzdHJpbmcgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVBhdGggPSBnZXRGaWxlUGF0aCh2YXJpYWJsZUtpbmQpO1x0XHQvLyB0aHJvd3MgZXJyb3IgaWYgbm8gZWRpdG9yIG9wZW5cblx0XHRcdGlmICh0aGlzLl9jb250ZXh0LmdldFdvcmtzcGFjZUZvbGRlclBhdGhGb3JGaWxlKSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlclBhdGggPSB0aGlzLl9jb250ZXh0LmdldFdvcmtzcGFjZUZvbGRlclBhdGhGb3JGaWxlKCk7XG5cdFx0XHRcdGlmIChmb2xkZXJQYXRoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5vcm1hbGl6ZURyaXZlTGV0dGVyKGZvbGRlclBhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcih2YXJpYWJsZUtpbmQsIGxvY2FsaXplKCdjYW5Ob3RSZXNvbHZlRm9sZGVyRm9yRmlsZScsIFwiVmFyaWFibGUgezB9OiBjYW4gbm90IGZpbmQgd29ya3NwYWNlIGZvbGRlciBvZiAnezF9Jy5cIiwgcmVwbGFjZW1lbnQuaWQsIHBhdGhzLmJhc2VuYW1lKGZpbGVQYXRoKSkpO1xuXHRcdH07XG5cblx0XHQvLyBjb21tb24gZXJyb3IgaGFuZGxpbmcgZm9yIGFsbCB2YXJpYWJsZXMgdGhhdCByZXF1aXJlIGFuIG9wZW4gZm9sZGVyIGFuZCBhY2NlcHQgYSBmb2xkZXIgbmFtZSBhcmd1bWVudFxuXHRcdGNvbnN0IGdldEZvbGRlclVyaSA9ICh2YXJpYWJsZUtpbmQ6IFZhcmlhYmxlS2luZCk6IHVyaSA9PiB7XG5cdFx0XHRpZiAoYXJndW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5fY29udGV4dC5nZXRGb2xkZXJVcmkoYXJndW1lbnQpO1xuXHRcdFx0XHRpZiAoZm9sZGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZvbGRlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcih2YXJpYWJsZUtpbmQsIGxvY2FsaXplKCdjYW5Ob3RGaW5kRm9sZGVyJywgXCJWYXJpYWJsZSB7MH0gY2FuIG5vdCBiZSByZXNvbHZlZC4gTm8gc3VjaCBmb2xkZXIgJ3sxfScuXCIsIHZhcmlhYmxlS2luZCwgYXJndW1lbnQpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGZvbGRlclVyaSkge1xuXHRcdFx0XHRyZXR1cm4gZm9sZGVyVXJpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fY29udGV4dC5nZXRXb3Jrc3BhY2VGb2xkZXJDb3VudCgpID4gMSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcih2YXJpYWJsZUtpbmQsIGxvY2FsaXplKCdjYW5Ob3RSZXNvbHZlV29ya3NwYWNlRm9sZGVyTXVsdGlSb290JywgXCJWYXJpYWJsZSB7MH0gY2FuIG5vdCBiZSByZXNvbHZlZCBpbiBhIG11bHRpIGZvbGRlciB3b3Jrc3BhY2UuIFNjb3BlIHRoaXMgdmFyaWFibGUgdXNpbmcgJzonIGFuZCBhIHdvcmtzcGFjZSBmb2xkZXIgbmFtZS5cIiwgdmFyaWFibGVLaW5kKSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcih2YXJpYWJsZUtpbmQsIGxvY2FsaXplKCdjYW5Ob3RSZXNvbHZlV29ya3NwYWNlRm9sZGVyJywgXCJWYXJpYWJsZSB7MH0gY2FuIG5vdCBiZSByZXNvbHZlZC4gUGxlYXNlIG9wZW4gYSBmb2xkZXIuXCIsIHZhcmlhYmxlS2luZCkpO1xuXHRcdH07XG5cblx0XHRzd2l0Y2ggKHZhcmlhYmxlKSB7XG5cdFx0XHRjYXNlICdlbnYnOlxuXHRcdFx0XHRpZiAoYXJndW1lbnQpIHtcblx0XHRcdFx0XHRpZiAoZW52aXJvbm1lbnQuZW52KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbnYgPSBlbnZpcm9ubWVudC5lbnZbaXNXaW5kb3dzID8gYXJndW1lbnQudG9Mb3dlckNhc2UoKSA6IGFyZ3VtZW50XTtcblx0XHRcdFx0XHRcdGlmICh0eXBlcy5pc1N0cmluZyhlbnYpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbnY7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuRW52LCBsb2NhbGl6ZSgnbWlzc2luZ0VudlZhck5hbWUnLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkIGJlY2F1c2Ugbm8gZW52aXJvbm1lbnQgdmFyaWFibGUgbmFtZSBpcyBnaXZlbi5cIiwgcmVwbGFjZW1lbnQuaWQpKTtcblxuXHRcdFx0Y2FzZSAnY29uZmlnJzpcblx0XHRcdFx0aWYgKGFyZ3VtZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fY29udGV4dC5nZXRDb25maWd1cmF0aW9uVmFsdWUoZm9sZGVyVXJpLCBhcmd1bWVudCk7XG5cdFx0XHRcdFx0aWYgKHR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKGNvbmZpZykpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBWYXJpYWJsZUVycm9yKFZhcmlhYmxlS2luZC5Db25maWcsIGxvY2FsaXplKCdjb25maWdOb3RGb3VuZCcsIFwiVmFyaWFibGUgezB9IGNhbiBub3QgYmUgcmVzb2x2ZWQgYmVjYXVzZSBzZXR0aW5nICd7MX0nIG5vdCBmb3VuZC5cIiwgcmVwbGFjZW1lbnQuaWQsIGFyZ3VtZW50KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0eXBlcy5pc09iamVjdChjb25maWcpKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuQ29uZmlnLCBsb2NhbGl6ZSgnY29uZmlnTm9TdHJpbmcnLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkIGJlY2F1c2UgJ3sxfScgaXMgYSBzdHJ1Y3R1cmVkIHZhbHVlLlwiLCByZXBsYWNlbWVudC5pZCwgYXJndW1lbnQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGNvbmZpZztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuQ29uZmlnLCBsb2NhbGl6ZSgnbWlzc2luZ0NvbmZpZ05hbWUnLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkIGJlY2F1c2Ugbm8gc2V0dGluZ3MgbmFtZSBpcyBnaXZlbi5cIiwgcmVwbGFjZW1lbnQuaWQpKTtcblxuXHRcdFx0Y2FzZSAnY29tbWFuZCc6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVGcm9tTWFwKFZhcmlhYmxlS2luZC5Db21tYW5kLCByZXBsYWNlbWVudC5pZCwgYXJndW1lbnQsIGNvbW1hbmRWYWx1ZU1hcHBpbmcsICdjb21tYW5kJyk7XG5cblx0XHRcdGNhc2UgJ2lucHV0Jzpcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUZyb21NYXAoVmFyaWFibGVLaW5kLklucHV0LCByZXBsYWNlbWVudC5pZCwgYXJndW1lbnQsIGNvbW1hbmRWYWx1ZU1hcHBpbmcsICdpbnB1dCcpO1xuXG5cdFx0XHRjYXNlICdleHRlbnNpb25JbnN0YWxsRm9sZGVyJzpcblx0XHRcdFx0aWYgKGFyZ3VtZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ID0gYXdhaXQgdGhpcy5fY29udGV4dC5nZXRFeHRlbnNpb24oYXJndW1lbnQpO1xuXHRcdFx0XHRcdGlmICghZXh0KSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuRXh0ZW5zaW9uSW5zdGFsbEZvbGRlciwgbG9jYWxpemUoJ2V4dGVuc2lvbk5vdEluc3RhbGxlZCcsIFwiVmFyaWFibGUgezB9IGNhbiBub3QgYmUgcmVzb2x2ZWQgYmVjYXVzZSB0aGUgZXh0ZW5zaW9uIHsxfSBpcyBub3QgaW5zdGFsbGVkLlwiLCByZXBsYWNlbWVudC5pZCwgYXJndW1lbnQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZnNQYXRoKGV4dC5leHRlbnNpb25Mb2NhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IoVmFyaWFibGVLaW5kLkV4dGVuc2lvbkluc3RhbGxGb2xkZXIsIGxvY2FsaXplKCdtaXNzaW5nRXh0ZW5zaW9uTmFtZScsIFwiVmFyaWFibGUgezB9IGNhbiBub3QgYmUgcmVzb2x2ZWQgYmVjYXVzZSBubyBleHRlbnNpb24gbmFtZSBpcyBnaXZlbi5cIiwgcmVwbGFjZW1lbnQuaWQpKTtcblxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRzd2l0Y2ggKHZhcmlhYmxlKSB7XG5cdFx0XHRcdFx0Y2FzZSAnd29ya3NwYWNlUm9vdCc6XG5cdFx0XHRcdFx0Y2FzZSAnd29ya3NwYWNlRm9sZGVyJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpID0gZ2V0Rm9sZGVyVXJpKFZhcmlhYmxlS2luZC5Xb3Jrc3BhY2VGb2xkZXIpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVyaSA/IG5vcm1hbGl6ZURyaXZlTGV0dGVyKHRoaXMuZnNQYXRoKHVyaSkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNhc2UgJ2N3ZCc6IHtcblx0XHRcdFx0XHRcdGlmICghZm9sZGVyVXJpICYmICFhcmd1bWVudCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcHJvY2Vzcy5jd2QoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IGdldEZvbGRlclVyaShWYXJpYWJsZUtpbmQuQ3dkKTtcblx0XHRcdFx0XHRcdHJldHVybiB1cmkgPyBub3JtYWxpemVEcml2ZUxldHRlcih0aGlzLmZzUGF0aCh1cmkpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjYXNlICd3b3Jrc3BhY2VSb290Rm9sZGVyTmFtZSc6XG5cdFx0XHRcdFx0Y2FzZSAnd29ya3NwYWNlRm9sZGVyQmFzZW5hbWUnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSBnZXRGb2xkZXJVcmkoVmFyaWFibGVLaW5kLldvcmtzcGFjZUZvbGRlckJhc2VuYW1lKTtcblx0XHRcdFx0XHRcdHJldHVybiB1cmkgPyBub3JtYWxpemVEcml2ZUxldHRlcihwYXRocy5iYXNlbmFtZSh0aGlzLmZzUGF0aCh1cmkpKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y2FzZSAndXNlckhvbWUnOlxuXHRcdFx0XHRcdFx0aWYgKGVudmlyb25tZW50LnVzZXJIb21lKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbnZpcm9ubWVudC51c2VySG9tZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRocm93IG5ldyBWYXJpYWJsZUVycm9yKFZhcmlhYmxlS2luZC5Vc2VySG9tZSwgbG9jYWxpemUoJ2Nhbk5vdFJlc29sdmVVc2VySG9tZScsIFwiVmFyaWFibGUgezB9IGNhbiBub3QgYmUgcmVzb2x2ZWQuIFVzZXJIb21lIHBhdGggaXMgbm90IGRlZmluZWRcIiwgcmVwbGFjZW1lbnQuaWQpKTtcblxuXHRcdFx0XHRcdGNhc2UgJ2xpbmVOdW1iZXInOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5fY29udGV4dC5nZXRMaW5lTnVtYmVyKCk7XG5cdFx0XHRcdFx0XHRpZiAobGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbGluZU51bWJlcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRocm93IG5ldyBWYXJpYWJsZUVycm9yKFZhcmlhYmxlS2luZC5MaW5lTnVtYmVyLCBsb2NhbGl6ZSgnY2FuTm90UmVzb2x2ZUxpbmVOdW1iZXInLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkLiBNYWtlIHN1cmUgdG8gaGF2ZSBhIGxpbmUgc2VsZWN0ZWQgaW4gdGhlIGFjdGl2ZSBlZGl0b3IuXCIsIHJlcGxhY2VtZW50LmlkKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y2FzZSAnY29sdW1uTnVtYmVyJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29sdW1uTnVtYmVyID0gdGhpcy5fY29udGV4dC5nZXRDb2x1bW5OdW1iZXIoKTtcblx0XHRcdFx0XHRcdGlmIChjb2x1bW5OdW1iZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGNvbHVtbk51bWJlcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2FuTm90UmVzb2x2ZUNvbHVtbk51bWJlcicsIFwiVmFyaWFibGUgezB9IGNhbiBub3QgYmUgcmVzb2x2ZWQuIE1ha2Ugc3VyZSB0byBoYXZlIGEgY29sdW1uIHNlbGVjdGVkIGluIHRoZSBhY3RpdmUgZWRpdG9yLlwiLCByZXBsYWNlbWVudC5pZCkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNhc2UgJ3NlbGVjdGVkVGV4dCc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdGVkVGV4dCA9IHRoaXMuX2NvbnRleHQuZ2V0U2VsZWN0ZWRUZXh0KCk7XG5cdFx0XHRcdFx0XHRpZiAoc2VsZWN0ZWRUZXh0KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBzZWxlY3RlZFRleHQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuU2VsZWN0ZWRUZXh0LCBsb2NhbGl6ZSgnY2FuTm90UmVzb2x2ZVNlbGVjdGVkVGV4dCcsIFwiVmFyaWFibGUgezB9IGNhbiBub3QgYmUgcmVzb2x2ZWQuIE1ha2Ugc3VyZSB0byBoYXZlIHNvbWUgdGV4dCBzZWxlY3RlZCBpbiB0aGUgYWN0aXZlIGVkaXRvci5cIiwgcmVwbGFjZW1lbnQuaWQpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjYXNlICdmaWxlJzpcblx0XHRcdFx0XHRcdHJldHVybiBnZXRGaWxlUGF0aChWYXJpYWJsZUtpbmQuRmlsZSk7XG5cblx0XHRcdFx0XHRjYXNlICdmaWxlV29ya3NwYWNlRm9sZGVyJzpcblx0XHRcdFx0XHRcdHJldHVybiBnZXRGb2xkZXJQYXRoRm9yRmlsZShWYXJpYWJsZUtpbmQuRmlsZVdvcmtzcGFjZUZvbGRlcik7XG5cblx0XHRcdFx0XHRjYXNlICdmaWxlV29ya3NwYWNlRm9sZGVyQmFzZW5hbWUnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHBhdGhzLmJhc2VuYW1lKGdldEZvbGRlclBhdGhGb3JGaWxlKFZhcmlhYmxlS2luZC5GaWxlV29ya3NwYWNlRm9sZGVyQmFzZW5hbWUpKTtcblxuXHRcdFx0XHRcdGNhc2UgJ3JlbGF0aXZlRmlsZSc6XG5cdFx0XHRcdFx0XHRpZiAoZm9sZGVyVXJpIHx8IGFyZ3VtZW50KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBwYXRocy5yZWxhdGl2ZSh0aGlzLmZzUGF0aChnZXRGb2xkZXJVcmkoVmFyaWFibGVLaW5kLlJlbGF0aXZlRmlsZSkpLCBnZXRGaWxlUGF0aChWYXJpYWJsZUtpbmQuUmVsYXRpdmVGaWxlKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZ2V0RmlsZVBhdGgoVmFyaWFibGVLaW5kLlJlbGF0aXZlRmlsZSk7XG5cblx0XHRcdFx0XHRjYXNlICdyZWxhdGl2ZUZpbGVEaXJuYW1lJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlybmFtZSA9IHBhdGhzLmRpcm5hbWUoZ2V0RmlsZVBhdGgoVmFyaWFibGVLaW5kLlJlbGF0aXZlRmlsZURpcm5hbWUpKTtcblx0XHRcdFx0XHRcdGlmIChmb2xkZXJVcmkgfHwgYXJndW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVsYXRpdmUgPSBwYXRocy5yZWxhdGl2ZSh0aGlzLmZzUGF0aChnZXRGb2xkZXJVcmkoVmFyaWFibGVLaW5kLlJlbGF0aXZlRmlsZURpcm5hbWUpKSwgZGlybmFtZSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZWxhdGl2ZS5sZW5ndGggPT09IDAgPyAnLicgOiByZWxhdGl2ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBkaXJuYW1lO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNhc2UgJ2ZpbGVEaXJuYW1lJzpcblx0XHRcdFx0XHRcdHJldHVybiBwYXRocy5kaXJuYW1lKGdldEZpbGVQYXRoKFZhcmlhYmxlS2luZC5GaWxlRGlybmFtZSkpO1xuXG5cdFx0XHRcdFx0Y2FzZSAnZmlsZUV4dG5hbWUnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHBhdGhzLmV4dG5hbWUoZ2V0RmlsZVBhdGgoVmFyaWFibGVLaW5kLkZpbGVFeHRuYW1lKSk7XG5cblx0XHRcdFx0XHRjYXNlICdmaWxlQmFzZW5hbWUnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHBhdGhzLmJhc2VuYW1lKGdldEZpbGVQYXRoKFZhcmlhYmxlS2luZC5GaWxlQmFzZW5hbWUpKTtcblxuXHRcdFx0XHRcdGNhc2UgJ2ZpbGVCYXNlbmFtZU5vRXh0ZW5zaW9uJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgYmFzZW5hbWUgPSBwYXRocy5iYXNlbmFtZShnZXRGaWxlUGF0aChWYXJpYWJsZUtpbmQuRmlsZUJhc2VuYW1lTm9FeHRlbnNpb24pKTtcblx0XHRcdFx0XHRcdHJldHVybiAoYmFzZW5hbWUuc2xpY2UoMCwgYmFzZW5hbWUubGVuZ3RoIC0gcGF0aHMuZXh0bmFtZShiYXNlbmFtZSkubGVuZ3RoKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y2FzZSAnZmlsZURpcm5hbWVCYXNlbmFtZSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gcGF0aHMuYmFzZW5hbWUocGF0aHMuZGlybmFtZShnZXRGaWxlUGF0aChWYXJpYWJsZUtpbmQuRmlsZURpcm5hbWVCYXNlbmFtZSkpKTtcblxuXHRcdFx0XHRcdGNhc2UgJ2V4ZWNQYXRoJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXAgPSB0aGlzLl9jb250ZXh0LmdldEV4ZWNQYXRoKCk7XG5cdFx0XHRcdFx0XHRpZiAoZXApIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVwO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHJlcGxhY2VtZW50LmlkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNhc2UgJ2V4ZWNJbnN0YWxsRm9sZGVyJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgYXIgPSB0aGlzLl9jb250ZXh0LmdldEFwcFJvb3QoKTtcblx0XHRcdFx0XHRcdGlmIChhcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYXI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVwbGFjZW1lbnQuaWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y2FzZSAncGF0aFNlcGFyYXRvcic6XG5cdFx0XHRcdFx0Y2FzZSAnLyc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gcGF0aHMuc2VwO1xuXG5cdFx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUZyb21NYXAoVmFyaWFibGVLaW5kLlVua25vd24sIHJlcGxhY2VtZW50LmlkLCBhcmd1bWVudCwgY29tbWFuZFZhbHVlTWFwcGluZywgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVwbGFjZW1lbnQuaWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlRnJvbU1hcCh2YXJpYWJsZUtpbmQ6IFZhcmlhYmxlS2luZCwgbWF0Y2g6IHN0cmluZywgYXJndW1lbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29tbWFuZFZhbHVlTWFwcGluZzogSVN0cmluZ0RpY3Rpb25hcnk8SVJlc29sdmVkVmFsdWU+IHwgdW5kZWZpbmVkLCBwcmVmaXg6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKGFyZ3VtZW50ICYmIGNvbW1hbmRWYWx1ZU1hcHBpbmcpIHtcblx0XHRcdGNvbnN0IHYgPSAocHJlZml4ID09PSB1bmRlZmluZWQpID8gY29tbWFuZFZhbHVlTWFwcGluZ1thcmd1bWVudF0gOiBjb21tYW5kVmFsdWVNYXBwaW5nW3ByZWZpeCArICc6JyArIGFyZ3VtZW50XTtcblx0XHRcdGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIHY7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcih2YXJpYWJsZUtpbmQsIGxvY2FsaXplKCdub1ZhbHVlRm9yQ29tbWFuZCcsIFwiVmFyaWFibGUgezB9IGNhbiBub3QgYmUgcmVzb2x2ZWQgYmVjYXVzZSB0aGUgY29tbWFuZCBoYXMgbm8gdmFsdWUuXCIsIG1hdGNoKSk7XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyw0QkFBNEI7QUFDckMsWUFBWSxXQUFXO0FBQ3ZCLFNBQThCLGlCQUFpQjtBQUMvQyxZQUFZLGFBQWE7QUFDekIsWUFBWSxXQUFXO0FBRXZCLFNBQVMsZ0JB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
