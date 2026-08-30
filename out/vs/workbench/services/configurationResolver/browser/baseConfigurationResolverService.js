import { Queue } from "../../../../base/common/async.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { LRUCache } from "../../../../base/common/map.js";
import { Schemas } from "../../../../base/common/network.js";
import * as Types from "../../../../base/common/types.js";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { localize } from "../../../../nls.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { VariableError, VariableKind } from "../common/configurationResolver.js";
import { ConfigurationResolverExpression } from "../common/configurationResolverExpression.js";
import { AbstractVariableResolverService } from "../common/variableResolver.js";
const LAST_INPUT_STORAGE_KEY = "configResolveInputLru";
const LAST_INPUT_CACHE_SIZE = 5;
class BaseConfigurationResolverService extends AbstractVariableResolverService {
  constructor(context, envVariablesPromise, editorService, configurationService, commandService, workspaceContextService, quickInputService, labelService, pathService, extensionService, storageService) {
    super({
      getFolderUri: (folderName) => {
        const folder = workspaceContextService.getWorkspace().folders.filter((f) => f.name === folderName).pop();
        return folder ? folder.uri : void 0;
      },
      getWorkspaceFolderCount: () => {
        return workspaceContextService.getWorkspace().folders.length;
      },
      getConfigurationValue: (folderUri, section) => {
        return configurationService.getValue(section, folderUri ? { resource: folderUri } : {});
      },
      getAppRoot: () => {
        return context.getAppRoot();
      },
      getExecPath: () => {
        return context.getExecPath();
      },
      getFilePath: () => {
        const fileResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, {
          supportSideBySide: SideBySideEditor.PRIMARY,
          filterByScheme: [Schemas.file, Schemas.vscodeUserData, this.pathService.defaultUriScheme]
        });
        if (!fileResource) {
          return void 0;
        }
        return this.labelService.getUriLabel(fileResource, { noPrefix: true });
      },
      getWorkspaceFolderPathForFile: () => {
        const fileResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, {
          supportSideBySide: SideBySideEditor.PRIMARY,
          filterByScheme: [Schemas.file, Schemas.vscodeUserData, this.pathService.defaultUriScheme]
        });
        if (!fileResource) {
          return void 0;
        }
        const wsFolder = workspaceContextService.getWorkspaceFolder(fileResource);
        if (!wsFolder) {
          return void 0;
        }
        return this.labelService.getUriLabel(wsFolder.uri, { noPrefix: true });
      },
      getSelectedText: () => {
        const activeTextEditorControl = editorService.activeTextEditorControl;
        let activeControl = null;
        if (isCodeEditor(activeTextEditorControl)) {
          activeControl = activeTextEditorControl;
        } else if (isDiffEditor(activeTextEditorControl)) {
          const original = activeTextEditorControl.getOriginalEditor();
          const modified = activeTextEditorControl.getModifiedEditor();
          activeControl = original.hasWidgetFocus() ? original : modified;
        }
        const activeModel = activeControl?.getModel();
        const activeSelection = activeControl?.getSelection();
        if (activeModel && activeSelection) {
          return activeModel.getValueInRange(activeSelection);
        }
        return void 0;
      },
      getLineNumber: () => {
        const activeTextEditorControl = editorService.activeTextEditorControl;
        if (isCodeEditor(activeTextEditorControl)) {
          const selection = activeTextEditorControl.getSelection();
          if (selection) {
            const lineNumber = selection.positionLineNumber;
            return String(lineNumber);
          }
        }
        return void 0;
      },
      getColumnNumber: () => {
        const activeTextEditorControl = editorService.activeTextEditorControl;
        if (isCodeEditor(activeTextEditorControl)) {
          const selection = activeTextEditorControl.getSelection();
          if (selection) {
            const columnNumber = selection.positionColumn;
            return String(columnNumber);
          }
        }
        return void 0;
      },
      getExtension: (id) => {
        return extensionService.getExtension(id);
      }
    }, labelService, pathService.userHome().then((home) => home.path), envVariablesPromise);
    this.configurationService = configurationService;
    this.commandService = commandService;
    this.quickInputService = quickInputService;
    this.labelService = labelService;
    this.pathService = pathService;
    this.storageService = storageService;
    this.userInputAccessQueue = new Queue();
    this.resolvableVariables.add("command");
    this.resolvableVariables.add("input");
  }
  async resolveWithInteractionReplace(folder, config, section, variables, target) {
    const parsed = ConfigurationResolverExpression.parse(config);
    const resolved = await this.resolveWithInteraction(folder, parsed, section, variables, target);
    if (resolved === void 0) {
      return void 0;
    }
    return parsed.toObject();
  }
  async resolveWithInteraction(folder, config, section, variableToCommandMap, target) {
    const expr = ConfigurationResolverExpression.parse(config);
    for (const variable of expr.unresolved()) {
      let result;
      if (variable.name === "command") {
        const commandId = (variableToCommandMap ? variableToCommandMap[variable.arg] : void 0) || variable.arg;
        const value = await this.commandService.executeCommand(commandId, expr.toObject());
        if (!Types.isUndefinedOrNull(value)) {
          if (typeof value !== "string") {
            throw new VariableError(VariableKind.Command, localize("commandVariable.noStringType", "Cannot substitute command variable '{0}' because command did not return a result of type string.", commandId));
          }
          result = { value };
        }
      } else if (variable.name === "input") {
        result = await this.showUserInput(section, variable.arg, await this.resolveInputs(folder, section, target), variableToCommandMap);
      } else if (this._contributedVariables.has(variable.inner)) {
        result = { value: await this._contributedVariables.get(variable.inner)() };
      } else {
        const resolvedValue = await this.evaluateSingleVariable(variable, folder?.uri);
        if (resolvedValue === void 0) {
          continue;
        }
        result = typeof resolvedValue === "string" ? { value: resolvedValue } : resolvedValue;
      }
      if (result === void 0) {
        return void 0;
      }
      expr.resolve(variable, result);
    }
    return new Map(Iterable.map(expr.resolved(), ([key, value]) => [key.inner, value.value]));
  }
  async resolveInputs(folder, section, target) {
    if (!section) {
      return void 0;
    }
    let inputs;
    const overrides = folder ? { resource: folder.uri } : {};
    const result = this.configurationService.inspect(section, overrides);
    if (result) {
      switch (target) {
        case ConfigurationTarget.MEMORY:
          inputs = result.memoryValue?.inputs;
          break;
        case ConfigurationTarget.DEFAULT:
          inputs = result.defaultValue?.inputs;
          break;
        case ConfigurationTarget.USER:
          inputs = result.userValue?.inputs;
          break;
        case ConfigurationTarget.USER_LOCAL:
          inputs = result.userLocalValue?.inputs;
          break;
        case ConfigurationTarget.USER_REMOTE:
          inputs = result.userRemoteValue?.inputs;
          break;
        case ConfigurationTarget.APPLICATION:
          inputs = result.applicationValue?.inputs;
          break;
        case ConfigurationTarget.WORKSPACE:
          inputs = result.workspaceValue?.inputs;
          break;
        case ConfigurationTarget.WORKSPACE_FOLDER:
        default:
          inputs = result.workspaceFolderValue?.inputs;
          break;
      }
    }
    inputs ??= this.configurationService.getValue(section, overrides)?.inputs;
    return inputs;
  }
  readInputLru() {
    const contents = this.storageService.get(LAST_INPUT_STORAGE_KEY, StorageScope.WORKSPACE);
    const lru = new LRUCache(LAST_INPUT_CACHE_SIZE);
    try {
      if (contents) {
        lru.fromJSON(JSON.parse(contents));
      }
    } catch {
    }
    return lru;
  }
  storeInputLru(lru) {
    this.storageService.store(LAST_INPUT_STORAGE_KEY, JSON.stringify(lru.toJSON()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async showUserInput(section, variable, inputInfos, variableToCommandMap) {
    if (!inputInfos) {
      throw new VariableError(VariableKind.Input, localize("inputVariable.noInputSection", "Variable '{0}' must be defined in an '{1}' section of the debug or task configuration.", variable, "inputs"));
    }
    const info = inputInfos.filter((item) => item.id === variable).pop();
    if (info) {
      const missingAttribute = (attrName) => {
        throw new VariableError(VariableKind.Input, localize("inputVariable.missingAttribute", "Input variable '{0}' is of type '{1}' and must include '{2}'.", variable, info.type, attrName));
      };
      const defaultValueMap = this.readInputLru();
      const defaultValueKey = `${section}.${variable}`;
      const previousPickedValue = defaultValueMap.get(defaultValueKey);
      switch (info.type) {
        case "promptString": {
          if (!Types.isString(info.description)) {
            missingAttribute("description");
          }
          const inputOptions = { prompt: info.description, ignoreFocusLost: true, value: variableToCommandMap?.[`input:${variable}`] ?? previousPickedValue ?? info.default };
          if (info.password) {
            inputOptions.password = info.password;
          }
          return this.userInputAccessQueue.queue(() => this.quickInputService.input(inputOptions)).then((resolvedInput) => {
            if (typeof resolvedInput === "string" && !info.password) {
              this.storeInputLru(defaultValueMap.set(defaultValueKey, resolvedInput));
            }
            return resolvedInput !== void 0 ? { value: resolvedInput, input: info } : void 0;
          });
        }
        case "pickString": {
          if (!Types.isString(info.description)) {
            missingAttribute("description");
          }
          if (Array.isArray(info.options)) {
            for (const pickOption of info.options) {
              if (!Types.isString(pickOption) && !Types.isString(pickOption.value)) {
                missingAttribute("value");
              }
            }
          } else {
            missingAttribute("options");
          }
          const picks = new Array();
          for (const pickOption of info.options) {
            const value = Types.isString(pickOption) ? pickOption : pickOption.value;
            const label = Types.isString(pickOption) ? void 0 : pickOption.label;
            const item = {
              label: label ? `${label}: ${value}` : value,
              value
            };
            const topValue = variableToCommandMap?.[`input:${variable}`] ?? previousPickedValue ?? info.default;
            if (value === info.default) {
              item.description = localize("inputVariable.defaultInputValue", "(Default)");
              picks.unshift(item);
            } else if (value === topValue) {
              picks.unshift(item);
            } else {
              picks.push(item);
            }
          }
          const pickOptions = { placeHolder: info.description, matchOnDetail: true, ignoreFocusLost: true };
          return this.userInputAccessQueue.queue(() => this.quickInputService.pick(picks, pickOptions, void 0)).then((resolvedInput) => {
            if (resolvedInput) {
              const value = resolvedInput.value;
              this.storeInputLru(defaultValueMap.set(defaultValueKey, value));
              return { value, input: info };
            }
            return void 0;
          });
        }
        case "command": {
          if (!Types.isString(info.command)) {
            missingAttribute("command");
          }
          return this.userInputAccessQueue.queue(() => this.commandService.executeCommand(info.command, info.args)).then((result) => {
            if (typeof result === "string" || Types.isUndefinedOrNull(result)) {
              return { value: result, input: info };
            }
            throw new VariableError(VariableKind.Input, localize("inputVariable.command.noStringType", "Cannot substitute input variable '{0}' because command '{1}' did not return a result of type string.", variable, info.command));
          });
        }
        default:
          throw new VariableError(VariableKind.Input, localize("inputVariable.unknownType", "Input variable '{0}' can only be of type 'promptString', 'pickString', or 'command'.", variable));
      }
    }
    throw new VariableError(VariableKind.Input, localize("inputVariable.undefinedVariable", "Undefined input variable '{0}' encountered. Remove or define '{0}' to continue.", variable));
  }
}
BaseConfigurationResolverService.INPUT_OR_COMMAND_VARIABLES_PATTERN = /\${((input|command):(.*?))}/g;
export {
  BaseConfigurationResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb25maWd1cmF0aW9uUmVzb2x2ZXJcXGJyb3dzZXJcXGJhc2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IFF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IExSVUNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBUeXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgYXMgdXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IsIGlzRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUlucHV0T3B0aW9ucywgSVBpY2tPcHRpb25zLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmVkSW5wdXQsIFZhcmlhYmxlRXJyb3IsIFZhcmlhYmxlS2luZCB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbiwgSVJlc29sdmVkVmFsdWUgfSBmcm9tICcuLi9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFZhcmlhYmxlUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3ZhcmlhYmxlUmVzb2x2ZXIuanMnO1xuXG5jb25zdCBMQVNUX0lOUFVUX1NUT1JBR0VfS0VZID0gJ2NvbmZpZ1Jlc29sdmVJbnB1dExydSc7XG5jb25zdCBMQVNUX0lOUFVUX0NBQ0hFX1NJWkUgPSA1O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdFZhcmlhYmxlUmVzb2x2ZXJTZXJ2aWNlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSU5QVVRfT1JfQ09NTUFORF9WQVJJQUJMRVNfUEFUVEVSTiA9IC9cXCR7KChpbnB1dHxjb21tYW5kKTooLio/KSl9L2c7XG5cblx0cHJpdmF0ZSB1c2VySW5wdXRBY2Nlc3NRdWV1ZSA9IG5ldyBRdWV1ZTxzdHJpbmcgfCBJUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZXh0OiB7XG5cdFx0XHRnZXRBcHBSb290OiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRnZXRFeGVjUGF0aDogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdH0sXG5cdFx0ZW52VmFyaWFibGVzUHJvbWlzZTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50Pixcblx0XHRlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGdldEZvbGRlclVyaTogKGZvbGRlck5hbWU6IHN0cmluZyk6IHVyaSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlciA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMuZmlsdGVyKGYgPT4gZi5uYW1lID09PSBmb2xkZXJOYW1lKS5wb3AoKTtcblx0XHRcdFx0cmV0dXJuIGZvbGRlciA/IGZvbGRlci51cmkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0V29ya3NwYWNlRm9sZGVyQ291bnQ6ICgpOiBudW1iZXIgPT4ge1xuXHRcdFx0XHRyZXR1cm4gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5sZW5ndGg7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q29uZmlndXJhdGlvblZhbHVlOiAoZm9sZGVyVXJpOiB1cmkgfCB1bmRlZmluZWQsIHNlY3Rpb246IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdHJldHVybiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KHNlY3Rpb24sIGZvbGRlclVyaSA/IHsgcmVzb3VyY2U6IGZvbGRlclVyaSB9IDoge30pO1xuXHRcdFx0fSxcblx0XHRcdGdldEFwcFJvb3Q6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gY29udGV4dC5nZXRBcHBSb290KCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0RXhlY1BhdGg6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gY29udGV4dC5nZXRFeGVjUGF0aCgpO1xuXHRcdFx0fSxcblx0XHRcdGdldEZpbGVQYXRoOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0Y29uc3QgZmlsZVJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciwge1xuXHRcdFx0XHRcdHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlksXG5cdFx0XHRcdFx0ZmlsdGVyQnlTY2hlbWU6IFtTY2hlbWFzLmZpbGUsIFNjaGVtYXMudnNjb2RlVXNlckRhdGEsIHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZV1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghZmlsZVJlc291cmNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZmlsZVJlc291cmNlLCB7IG5vUHJlZml4OiB0cnVlIH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldFdvcmtzcGFjZUZvbGRlclBhdGhGb3JGaWxlOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0Y29uc3QgZmlsZVJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciwge1xuXHRcdFx0XHRcdHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlksXG5cdFx0XHRcdFx0ZmlsdGVyQnlTY2hlbWU6IFtTY2hlbWFzLmZpbGUsIFNjaGVtYXMudnNjb2RlVXNlckRhdGEsIHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZV1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghZmlsZVJlc291cmNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB3c0ZvbGRlciA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihmaWxlUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoIXdzRm9sZGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwod3NGb2xkZXIudXJpLCB7IG5vUHJlZml4OiB0cnVlIH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldFNlbGVjdGVkVGV4dDogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblxuXHRcdFx0XHRsZXQgYWN0aXZlQ29udHJvbDogSUNvZGVFZGl0b3IgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0XHRpZiAoaXNDb2RlRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0XHRcdGFjdGl2ZUNvbnRyb2wgPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRcdFx0fSBlbHNlIGlmIChpc0RpZmZFZGl0b3IoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRPcmlnaW5hbEVkaXRvcigpO1xuXHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkID0gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0TW9kaWZpZWRFZGl0b3IoKTtcblx0XHRcdFx0XHRhY3RpdmVDb250cm9sID0gb3JpZ2luYWwuaGFzV2lkZ2V0Rm9jdXMoKSA/IG9yaWdpbmFsIDogbW9kaWZpZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhY3RpdmVNb2RlbCA9IGFjdGl2ZUNvbnRyb2w/LmdldE1vZGVsKCk7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZVNlbGVjdGlvbiA9IGFjdGl2ZUNvbnRyb2w/LmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRpZiAoYWN0aXZlTW9kZWwgJiYgYWN0aXZlU2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFjdGl2ZU1vZGVsLmdldFZhbHVlSW5SYW5nZShhY3RpdmVTZWxlY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGluZU51bWJlcjogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRcdFx0aWYgKGlzQ29kZUVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gc2VsZWN0aW9uLnBvc2l0aW9uTGluZU51bWJlcjtcblx0XHRcdFx0XHRcdHJldHVybiBTdHJpbmcobGluZU51bWJlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q29sdW1uTnVtYmVyOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdFx0XHRpZiAoaXNDb2RlRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbHVtbk51bWJlciA9IHNlbGVjdGlvbi5wb3NpdGlvbkNvbHVtbjtcblx0XHRcdFx0XHRcdHJldHVybiBTdHJpbmcoY29sdW1uTnVtYmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRFeHRlbnNpb246IGlkID0+IHtcblx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uKGlkKTtcblx0XHRcdH0sXG5cdFx0fSwgbGFiZWxTZXJ2aWNlLCBwYXRoU2VydmljZS51c2VySG9tZSgpLnRoZW4oaG9tZSA9PiBob21lLnBhdGgpLCBlbnZWYXJpYWJsZXNQcm9taXNlKTtcblxuXHRcdHRoaXMucmVzb2x2YWJsZVZhcmlhYmxlcy5hZGQoJ2NvbW1hbmQnKTtcblx0XHR0aGlzLnJlc29sdmFibGVWYXJpYWJsZXMuYWRkKCdpbnB1dCcpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZVdpdGhJbnRlcmFjdGlvblJlcGxhY2UoZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyRGF0YSB8IHVuZGVmaW5lZCwgY29uZmlnOiB1bmtub3duLCBzZWN0aW9uPzogc3RyaW5nLCB2YXJpYWJsZXM/OiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+LCB0YXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3QgcGFyc2VkID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZShjb25maWcpO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5yZXNvbHZlV2l0aEludGVyYWN0aW9uKGZvbGRlciwgcGFyc2VkLCBzZWN0aW9uLCB2YXJpYWJsZXMsIHRhcmdldCk7XG5cblx0XHQvLyBTa2lwIGlmIGlucHV0IHZhcmlhYmxlIHdhcyBjYW5jZWxlZFxuXHRcdGlmIChyZXNvbHZlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXJzZWQudG9PYmplY3QoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVXaXRoSW50ZXJhY3Rpb24oZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyRGF0YSB8IHVuZGVmaW5lZCwgY29uZmlnOiB1bmtub3duLCBzZWN0aW9uPzogc3RyaW5nLCB2YXJpYWJsZVRvQ29tbWFuZE1hcD86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4sIHRhcmdldD86IENvbmZpZ3VyYXRpb25UYXJnZXQpOiBQcm9taXNlPE1hcDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZShjb25maWcpO1xuXG5cdFx0Ly8gR2V0IHZhbHVlcyBmb3IgaW5wdXQgdmFyaWFibGVzIGZyb20gVUlcblx0XHRmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIGV4cHIudW5yZXNvbHZlZCgpKSB7XG5cdFx0XHRsZXQgcmVzdWx0OiBJUmVzb2x2ZWRWYWx1ZSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gQ29tbWFuZFxuXHRcdFx0aWYgKHZhcmlhYmxlLm5hbWUgPT09ICdjb21tYW5kJykge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kSWQgPSAodmFyaWFibGVUb0NvbW1hbmRNYXAgPyB2YXJpYWJsZVRvQ29tbWFuZE1hcFt2YXJpYWJsZS5hcmchXSA6IHVuZGVmaW5lZCkgfHwgdmFyaWFibGUuYXJnITtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCwgZXhwci50b09iamVjdCgpKTtcblx0XHRcdFx0aWYgKCFUeXBlcy5pc1VuZGVmaW5lZE9yTnVsbCh2YWx1ZSkpIHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IoVmFyaWFibGVLaW5kLkNvbW1hbmQsIGxvY2FsaXplKCdjb21tYW5kVmFyaWFibGUubm9TdHJpbmdUeXBlJywgXCJDYW5ub3Qgc3Vic3RpdHV0ZSBjb21tYW5kIHZhcmlhYmxlICd7MH0nIGJlY2F1c2UgY29tbWFuZCBkaWQgbm90IHJldHVybiBhIHJlc3VsdCBvZiB0eXBlIHN0cmluZy5cIiwgY29tbWFuZElkKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc3VsdCA9IHsgdmFsdWUgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gSW5wdXRcblx0XHRcdGVsc2UgaWYgKHZhcmlhYmxlLm5hbWUgPT09ICdpbnB1dCcpIHtcblx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5zaG93VXNlcklucHV0KHNlY3Rpb24hLCB2YXJpYWJsZS5hcmchLCBhd2FpdCB0aGlzLnJlc29sdmVJbnB1dHMoZm9sZGVyLCBzZWN0aW9uISwgdGFyZ2V0KSwgdmFyaWFibGVUb0NvbW1hbmRNYXApO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQ29udHJpYnV0ZWQgdmFyaWFibGVcblx0XHRcdGVsc2UgaWYgKHRoaXMuX2NvbnRyaWJ1dGVkVmFyaWFibGVzLmhhcyh2YXJpYWJsZS5pbm5lcikpIHtcblx0XHRcdFx0cmVzdWx0ID0geyB2YWx1ZTogYXdhaXQgdGhpcy5fY29udHJpYnV0ZWRWYXJpYWJsZXMuZ2V0KHZhcmlhYmxlLmlubmVyKSEoKSB9O1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdC8vIEZhbGxiYWNrIHRvIHBhcmVudCBldmFsdWF0aW9uXG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkVmFsdWUgPSBhd2FpdCB0aGlzLmV2YWx1YXRlU2luZ2xlVmFyaWFibGUodmFyaWFibGUsIGZvbGRlcj8udXJpKTtcblx0XHRcdFx0aWYgKHJlc29sdmVkVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdC8vIE5vdCBzb21ldGhpbmcgd2UgY2FuIGhhbmRsZVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdCA9IHR5cGVvZiByZXNvbHZlZFZhbHVlID09PSAnc3RyaW5nJyA/IHsgdmFsdWU6IHJlc29sdmVkVmFsdWUgfSA6IHJlc29sdmVkVmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyBTa2lwIHRoZSBlbnRpcmUgZmxvdyBpZiBhbnkgaW5wdXQgdmFyaWFibGUgd2FzIGNhbmNlbGVkXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGV4cHIucmVzb2x2ZSh2YXJpYWJsZSwgcmVzdWx0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IE1hcChJdGVyYWJsZS5tYXAoZXhwci5yZXNvbHZlZCgpLCAoW2tleSwgdmFsdWVdKSA9PiBba2V5LmlubmVyLCB2YWx1ZS52YWx1ZSFdKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVJbnB1dHMoZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyRGF0YSB8IHVuZGVmaW5lZCwgc2VjdGlvbjogc3RyaW5nLCB0YXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTxDb25maWd1cmVkSW5wdXRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghc2VjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBMb29rIGF0IHdvcmtzcGFjZSBjb25maWd1cmF0aW9uXG5cdFx0bGV0IGlucHV0czogQ29uZmlndXJlZElucHV0W10gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyA9IGZvbGRlciA/IHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSA6IHt9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDx7IGlucHV0cz86IENvbmZpZ3VyZWRJbnB1dFtdIH0+KHNlY3Rpb24sIG92ZXJyaWRlcyk7XG5cblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRzd2l0Y2ggKHRhcmdldCkge1xuXHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuTUVNT1JZOiBpbnB1dHMgPSByZXN1bHQubWVtb3J5VmFsdWU/LmlucHV0czsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUOiBpbnB1dHMgPSByZXN1bHQuZGVmYXVsdFZhbHVlPy5pbnB1dHM7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjogaW5wdXRzID0gcmVzdWx0LnVzZXJWYWx1ZT8uaW5wdXRzOyBicmVhaztcblx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw6IGlucHV0cyA9IHJlc3VsdC51c2VyTG9jYWxWYWx1ZT8uaW5wdXRzOyBicmVhaztcblx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFOiBpbnB1dHMgPSByZXN1bHQudXNlclJlbW90ZVZhbHVlPy5pbnB1dHM7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT046IGlucHV0cyA9IHJlc3VsdC5hcHBsaWNhdGlvblZhbHVlPy5pbnB1dHM7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOiBpbnB1dHMgPSByZXN1bHQud29ya3NwYWNlVmFsdWU/LmlucHV0czsgYnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0aW5wdXRzID0gcmVzdWx0LndvcmtzcGFjZUZvbGRlclZhbHVlPy5pbnB1dHM7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHRpbnB1dHMgPz89IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBpbnB1dHM/OiBDb25maWd1cmVkSW5wdXRbXSB9PihzZWN0aW9uLCBvdmVycmlkZXMpPy5pbnB1dHM7XG5cblx0XHRyZXR1cm4gaW5wdXRzO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkSW5wdXRMcnUoKTogTFJVQ2FjaGU8c3RyaW5nLCBzdHJpbmc+IHtcblx0XHRjb25zdCBjb250ZW50cyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KExBU1RfSU5QVVRfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGNvbnN0IGxydSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4oTEFTVF9JTlBVVF9DQUNIRV9TSVpFKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKGNvbnRlbnRzKSB7XG5cdFx0XHRcdGxydS5mcm9tSlNPTihKU09OLnBhcnNlKGNvbnRlbnRzKSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmVkXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxydTtcblx0fVxuXG5cdHByaXZhdGUgc3RvcmVJbnB1dExydShscnU6IExSVUNhY2hlPHN0cmluZywgc3RyaW5nPik6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoTEFTVF9JTlBVVF9TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkobHJ1LnRvSlNPTigpKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd1VzZXJJbnB1dChzZWN0aW9uOiBzdHJpbmcsIHZhcmlhYmxlOiBzdHJpbmcsIGlucHV0SW5mb3M6IENvbmZpZ3VyZWRJbnB1dFtdIHwgdW5kZWZpbmVkLCB2YXJpYWJsZVRvQ29tbWFuZE1hcD86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4pOiBQcm9taXNlPElSZXNvbHZlZFZhbHVlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFpbnB1dEluZm9zKSB7XG5cdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuSW5wdXQsIGxvY2FsaXplKCdpbnB1dFZhcmlhYmxlLm5vSW5wdXRTZWN0aW9uJywgXCJWYXJpYWJsZSAnezB9JyBtdXN0IGJlIGRlZmluZWQgaW4gYW4gJ3sxfScgc2VjdGlvbiBvZiB0aGUgZGVidWcgb3IgdGFzayBjb25maWd1cmF0aW9uLlwiLCB2YXJpYWJsZSwgJ2lucHV0cycpKTtcblx0XHR9XG5cblx0XHQvLyBGaW5kIGluZm8gZm9yIHRoZSBnaXZlbiBpbnB1dCB2YXJpYWJsZVxuXHRcdGNvbnN0IGluZm8gPSBpbnB1dEluZm9zLmZpbHRlcihpdGVtID0+IGl0ZW0uaWQgPT09IHZhcmlhYmxlKS5wb3AoKTtcblx0XHRpZiAoaW5mbykge1xuXHRcdFx0Y29uc3QgbWlzc2luZ0F0dHJpYnV0ZSA9IChhdHRyTmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBWYXJpYWJsZUVycm9yKFZhcmlhYmxlS2luZC5JbnB1dCwgbG9jYWxpemUoJ2lucHV0VmFyaWFibGUubWlzc2luZ0F0dHJpYnV0ZScsIFwiSW5wdXQgdmFyaWFibGUgJ3swfScgaXMgb2YgdHlwZSAnezF9JyBhbmQgbXVzdCBpbmNsdWRlICd7Mn0nLlwiLCB2YXJpYWJsZSwgaW5mby50eXBlLCBhdHRyTmFtZSkpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZGVmYXVsdFZhbHVlTWFwID0gdGhpcy5yZWFkSW5wdXRMcnUoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRWYWx1ZUtleSA9IGAke3NlY3Rpb259LiR7dmFyaWFibGV9YDtcblx0XHRcdGNvbnN0IHByZXZpb3VzUGlja2VkVmFsdWUgPSBkZWZhdWx0VmFsdWVNYXAuZ2V0KGRlZmF1bHRWYWx1ZUtleSk7XG5cblx0XHRcdHN3aXRjaCAoaW5mby50eXBlKSB7XG5cdFx0XHRcdGNhc2UgJ3Byb21wdFN0cmluZyc6IHtcblx0XHRcdFx0XHRpZiAoIVR5cGVzLmlzU3RyaW5nKGluZm8uZGVzY3JpcHRpb24pKSB7XG5cdFx0XHRcdFx0XHRtaXNzaW5nQXR0cmlidXRlKCdkZXNjcmlwdGlvbicpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBpbnB1dE9wdGlvbnM6IElJbnB1dE9wdGlvbnMgPSB7IHByb21wdDogaW5mby5kZXNjcmlwdGlvbiwgaWdub3JlRm9jdXNMb3N0OiB0cnVlLCB2YWx1ZTogdmFyaWFibGVUb0NvbW1hbmRNYXA/LltgaW5wdXQ6JHt2YXJpYWJsZX1gXSA/PyBwcmV2aW91c1BpY2tlZFZhbHVlID8/IGluZm8uZGVmYXVsdCB9O1xuXHRcdFx0XHRcdGlmIChpbmZvLnBhc3N3b3JkKSB7XG5cdFx0XHRcdFx0XHRpbnB1dE9wdGlvbnMucGFzc3dvcmQgPSBpbmZvLnBhc3N3b3JkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdGhpcy51c2VySW5wdXRBY2Nlc3NRdWV1ZS5xdWV1ZSgoKSA9PiB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KGlucHV0T3B0aW9ucykpLnRoZW4ocmVzb2x2ZWRJbnB1dCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIHJlc29sdmVkSW5wdXQgPT09ICdzdHJpbmcnICYmICFpbmZvLnBhc3N3b3JkKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc3RvcmVJbnB1dExydShkZWZhdWx0VmFsdWVNYXAuc2V0KGRlZmF1bHRWYWx1ZUtleSwgcmVzb2x2ZWRJbnB1dCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc29sdmVkSW5wdXQgIT09IHVuZGVmaW5lZCA/IHsgdmFsdWU6IHJlc29sdmVkSW5wdXQgYXMgc3RyaW5nLCBpbnB1dDogaW5mbyB9IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2FzZSAncGlja1N0cmluZyc6IHtcblx0XHRcdFx0XHRpZiAoIVR5cGVzLmlzU3RyaW5nKGluZm8uZGVzY3JpcHRpb24pKSB7XG5cdFx0XHRcdFx0XHRtaXNzaW5nQXR0cmlidXRlKCdkZXNjcmlwdGlvbicpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShpbmZvLm9wdGlvbnMpKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHBpY2tPcHRpb24gb2YgaW5mby5vcHRpb25zKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghVHlwZXMuaXNTdHJpbmcocGlja09wdGlvbikgJiYgIVR5cGVzLmlzU3RyaW5nKHBpY2tPcHRpb24udmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0bWlzc2luZ0F0dHJpYnV0ZSgndmFsdWUnKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtaXNzaW5nQXR0cmlidXRlKCdvcHRpb25zJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aW50ZXJmYWNlIFBpY2tTdHJpbmdJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdFx0XHRcdFx0dmFsdWU6IHN0cmluZztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcGlja3MgPSBuZXcgQXJyYXk8UGlja1N0cmluZ0l0ZW0+KCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwaWNrT3B0aW9uIG9mIGluZm8ub3B0aW9ucykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBUeXBlcy5pc1N0cmluZyhwaWNrT3B0aW9uKSA/IHBpY2tPcHRpb24gOiBwaWNrT3B0aW9uLnZhbHVlO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBUeXBlcy5pc1N0cmluZyhwaWNrT3B0aW9uKSA/IHVuZGVmaW5lZCA6IHBpY2tPcHRpb24ubGFiZWw7XG5cblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IFBpY2tTdHJpbmdJdGVtID0ge1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogbGFiZWwgPyBgJHtsYWJlbH06ICR7dmFsdWV9YCA6IHZhbHVlLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogdmFsdWVcblx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdGNvbnN0IHRvcFZhbHVlID0gdmFyaWFibGVUb0NvbW1hbmRNYXA/LltgaW5wdXQ6JHt2YXJpYWJsZX1gXSA/PyBwcmV2aW91c1BpY2tlZFZhbHVlID8/IGluZm8uZGVmYXVsdDtcblx0XHRcdFx0XHRcdGlmICh2YWx1ZSA9PT0gaW5mby5kZWZhdWx0KSB7XG5cdFx0XHRcdFx0XHRcdGl0ZW0uZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgnaW5wdXRWYXJpYWJsZS5kZWZhdWx0SW5wdXRWYWx1ZScsIFwiKERlZmF1bHQpXCIpO1xuXHRcdFx0XHRcdFx0XHRwaWNrcy51bnNoaWZ0KGl0ZW0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gdG9wVmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0cGlja3MudW5zaGlmdChpdGVtKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHBpY2tzLnB1c2goaXRlbSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcGlja09wdGlvbnM6IElQaWNrT3B0aW9uczxQaWNrU3RyaW5nSXRlbT4gPSB7IHBsYWNlSG9sZGVyOiBpbmZvLmRlc2NyaXB0aW9uLCBtYXRjaE9uRGV0YWlsOiB0cnVlLCBpZ25vcmVGb2N1c0xvc3Q6IHRydWUgfTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy51c2VySW5wdXRBY2Nlc3NRdWV1ZS5xdWV1ZSgoKSA9PiB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHBpY2tPcHRpb25zLCB1bmRlZmluZWQpKS50aGVuKHJlc29sdmVkSW5wdXQgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHJlc29sdmVkSW5wdXQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSAocmVzb2x2ZWRJbnB1dCBhcyBQaWNrU3RyaW5nSXRlbSkudmFsdWU7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc3RvcmVJbnB1dExydShkZWZhdWx0VmFsdWVNYXAuc2V0KGRlZmF1bHRWYWx1ZUtleSwgdmFsdWUpKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWUsIGlucHV0OiBpbmZvIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2FzZSAnY29tbWFuZCc6IHtcblx0XHRcdFx0XHRpZiAoIVR5cGVzLmlzU3RyaW5nKGluZm8uY29tbWFuZCkpIHtcblx0XHRcdFx0XHRcdG1pc3NpbmdBdHRyaWJ1dGUoJ2NvbW1hbmQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMudXNlcklucHV0QWNjZXNzUXVldWUucXVldWUoKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxzdHJpbmc+KGluZm8uY29tbWFuZCwgaW5mby5hcmdzKSkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnIHx8IFR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKHJlc3VsdCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IHJlc3VsdCwgaW5wdXQ6IGluZm8gfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRocm93IG5ldyBWYXJpYWJsZUVycm9yKFZhcmlhYmxlS2luZC5JbnB1dCwgbG9jYWxpemUoJ2lucHV0VmFyaWFibGUuY29tbWFuZC5ub1N0cmluZ1R5cGUnLCBcIkNhbm5vdCBzdWJzdGl0dXRlIGlucHV0IHZhcmlhYmxlICd7MH0nIGJlY2F1c2UgY29tbWFuZCAnezF9JyBkaWQgbm90IHJldHVybiBhIHJlc3VsdCBvZiB0eXBlIHN0cmluZy5cIiwgdmFyaWFibGUsIGluZm8uY29tbWFuZCkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuSW5wdXQsIGxvY2FsaXplKCdpbnB1dFZhcmlhYmxlLnVua25vd25UeXBlJywgXCJJbnB1dCB2YXJpYWJsZSAnezB9JyBjYW4gb25seSBiZSBvZiB0eXBlICdwcm9tcHRTdHJpbmcnLCAncGlja1N0cmluZycsIG9yICdjb21tYW5kJy5cIiwgdmFyaWFibGUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuSW5wdXQsIGxvY2FsaXplKCdpbnB1dFZhcmlhYmxlLnVuZGVmaW5lZFZhcmlhYmxlJywgXCJVbmRlZmluZWQgaW5wdXQgdmFyaWFibGUgJ3swfScgZW5jb3VudGVyZWQuIFJlbW92ZSBvciBkZWZpbmUgJ3swfScgdG8gY29udGludWUuXCIsIHZhcmlhYmxlKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLFNBQVMsYUFBYTtBQUV0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFFeEIsWUFBWSxXQUFXO0FBRXZCLFNBQXNCLGNBQWMsb0JBQW9CO0FBQ3hELFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsMkJBQTJFO0FBR3BGLFNBQTBCLGNBQWMscUJBQXFCO0FBRTdELFNBQVMsd0JBQXdCLHdCQUF3QjtBQUl6RCxTQUEwQixlQUFlLG9CQUFvQjtBQUM3RCxTQUFTLHVDQUF1RDtBQUNoRSxTQUFTLHVDQUF1QztBQUVoRCxNQUFNLHlCQUF5QjtBQUMvQixNQUFNLHdCQUF3QjtBQUV2QixNQUFlLHlDQUF5QyxnQ0FBZ0M7QUFBQSxFQU05RixZQUNDLFNBSUEscUJBQ0EsZUFDaUIsc0JBQ0EsZ0JBQ2pCLHlCQUNpQixtQkFDQSxjQUNBLGFBQ2pCLGtCQUNpQixnQkFDaEI7QUFDRCxVQUFNO0FBQUEsTUFDTCxjQUFjLENBQUMsZUFBd0M7QUFDdEQsY0FBTSxTQUFTLHdCQUF3QixhQUFhLEVBQUUsUUFBUSxPQUFPLE9BQUssRUFBRSxTQUFTLFVBQVUsRUFBRSxJQUFJO0FBQ3JHLGVBQU8sU0FBUyxPQUFPLE1BQU07QUFBQSxNQUM5QjtBQUFBLE1BQ0EseUJBQXlCLE1BQWM7QUFDdEMsZUFBTyx3QkFBd0IsYUFBYSxFQUFFLFFBQVE7QUFBQSxNQUN2RDtBQUFBLE1BQ0EsdUJBQXVCLENBQUMsV0FBNEIsWUFBd0M7QUFDM0YsZUFBTyxxQkFBcUIsU0FBaUIsU0FBUyxZQUFZLEVBQUUsVUFBVSxVQUFVLElBQUksQ0FBQyxDQUFDO0FBQUEsTUFDL0Y7QUFBQSxNQUNBLFlBQVksTUFBMEI7QUFDckMsZUFBTyxRQUFRLFdBQVc7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsYUFBYSxNQUEwQjtBQUN0QyxlQUFPLFFBQVEsWUFBWTtBQUFBLE1BQzVCO0FBQUEsTUFDQSxhQUFhLE1BQTBCO0FBQ3RDLGNBQU0sZUFBZSx1QkFBdUIsZUFBZSxjQUFjLGNBQWM7QUFBQSxVQUN0RixtQkFBbUIsaUJBQWlCO0FBQUEsVUFDcEMsZ0JBQWdCLENBQUMsUUFBUSxNQUFNLFFBQVEsZ0JBQWdCLEtBQUssWUFBWSxnQkFBZ0I7QUFBQSxRQUN6RixDQUFDO0FBQ0QsWUFBSSxDQUFDLGNBQWM7QUFDbEIsaUJBQU87QUFBQSxRQUNSO0FBQ0EsZUFBTyxLQUFLLGFBQWEsWUFBWSxjQUFjLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFBQSxNQUN0RTtBQUFBLE1BQ0EsK0JBQStCLE1BQTBCO0FBQ3hELGNBQU0sZUFBZSx1QkFBdUIsZUFBZSxjQUFjLGNBQWM7QUFBQSxVQUN0RixtQkFBbUIsaUJBQWlCO0FBQUEsVUFDcEMsZ0JBQWdCLENBQUMsUUFBUSxNQUFNLFFBQVEsZ0JBQWdCLEtBQUssWUFBWSxnQkFBZ0I7QUFBQSxRQUN6RixDQUFDO0FBQ0QsWUFBSSxDQUFDLGNBQWM7QUFDbEIsaUJBQU87QUFBQSxRQUNSO0FBQ0EsY0FBTSxXQUFXLHdCQUF3QixtQkFBbUIsWUFBWTtBQUN4RSxZQUFJLENBQUMsVUFBVTtBQUNkLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGVBQU8sS0FBSyxhQUFhLFlBQVksU0FBUyxLQUFLLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFBQSxNQUN0RTtBQUFBLE1BQ0EsaUJBQWlCLE1BQTBCO0FBQzFDLGNBQU0sMEJBQTBCLGNBQWM7QUFFOUMsWUFBSSxnQkFBb0M7QUFFeEMsWUFBSSxhQUFhLHVCQUF1QixHQUFHO0FBQzFDLDBCQUFnQjtBQUFBLFFBQ2pCLFdBQVcsYUFBYSx1QkFBdUIsR0FBRztBQUNqRCxnQkFBTSxXQUFXLHdCQUF3QixrQkFBa0I7QUFDM0QsZ0JBQU0sV0FBVyx3QkFBd0Isa0JBQWtCO0FBQzNELDBCQUFnQixTQUFTLGVBQWUsSUFBSSxXQUFXO0FBQUEsUUFDeEQ7QUFFQSxjQUFNLGNBQWMsZUFBZSxTQUFTO0FBQzVDLGNBQU0sa0JBQWtCLGVBQWUsYUFBYTtBQUNwRCxZQUFJLGVBQWUsaUJBQWlCO0FBQ25DLGlCQUFPLFlBQVksZ0JBQWdCLGVBQWU7QUFBQSxRQUNuRDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxlQUFlLE1BQTBCO0FBQ3hDLGNBQU0sMEJBQTBCLGNBQWM7QUFDOUMsWUFBSSxhQUFhLHVCQUF1QixHQUFHO0FBQzFDLGdCQUFNLFlBQVksd0JBQXdCLGFBQWE7QUFDdkQsY0FBSSxXQUFXO0FBQ2Qsa0JBQU0sYUFBYSxVQUFVO0FBQzdCLG1CQUFPLE9BQU8sVUFBVTtBQUFBLFVBQ3pCO0FBQUEsUUFDRDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxpQkFBaUIsTUFBMEI7QUFDMUMsY0FBTSwwQkFBMEIsY0FBYztBQUM5QyxZQUFJLGFBQWEsdUJBQXVCLEdBQUc7QUFDMUMsZ0JBQU0sWUFBWSx3QkFBd0IsYUFBYTtBQUN2RCxjQUFJLFdBQVc7QUFDZCxrQkFBTSxlQUFlLFVBQVU7QUFDL0IsbUJBQU8sT0FBTyxZQUFZO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLGNBQWMsUUFBTTtBQUNuQixlQUFPLGlCQUFpQixhQUFhLEVBQUU7QUFBQSxNQUN4QztBQUFBLElBQ0QsR0FBRyxjQUFjLFlBQVksU0FBUyxFQUFFLEtBQUssVUFBUSxLQUFLLElBQUksR0FBRyxtQkFBbUI7QUEvRm5FO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFFQTtBQWhCbEIsU0FBUSx1QkFBdUIsSUFBSSxNQUEyQztBQTBHN0UsU0FBSyxvQkFBb0IsSUFBSSxTQUFTO0FBQ3RDLFNBQUssb0JBQW9CLElBQUksT0FBTztBQUFBLEVBQ3JDO0FBQUEsRUFFQSxNQUFlLDhCQUE4QixRQUEwQyxRQUFpQixTQUFrQixXQUF1QyxRQUFnRDtBQUNoTixVQUFNLFNBQVMsZ0NBQWdDLE1BQU0sTUFBTTtBQUMzRCxVQUFNLFdBQVcsTUFBTSxLQUFLLHVCQUF1QixRQUFRLFFBQVEsU0FBUyxXQUFXLE1BQU07QUFHN0YsUUFBSSxhQUFhLFFBQVc7QUFDM0IsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLE9BQU8sU0FBUztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxNQUFlLHVCQUF1QixRQUEwQyxRQUFpQixTQUFrQixzQkFBa0QsUUFBd0U7QUFDNU8sVUFBTSxPQUFPLGdDQUFnQyxNQUFNLE1BQU07QUFHekQsZUFBVyxZQUFZLEtBQUssV0FBVyxHQUFHO0FBQ3pDLFVBQUk7QUFHSixVQUFJLFNBQVMsU0FBUyxXQUFXO0FBQ2hDLGNBQU0sYUFBYSx1QkFBdUIscUJBQXFCLFNBQVMsR0FBSSxJQUFJLFdBQWMsU0FBUztBQUN2RyxjQUFNLFFBQVEsTUFBTSxLQUFLLGVBQWUsZUFBZSxXQUFXLEtBQUssU0FBUyxDQUFDO0FBQ2pGLFlBQUksQ0FBQyxNQUFNLGtCQUFrQixLQUFLLEdBQUc7QUFDcEMsY0FBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixrQkFBTSxJQUFJLGNBQWMsYUFBYSxTQUFTLFNBQVMsZ0NBQWdDLG9HQUFvRyxTQUFTLENBQUM7QUFBQSxVQUN0TTtBQUNBLG1CQUFTLEVBQUUsTUFBTTtBQUFBLFFBQ2xCO0FBQUEsTUFDRCxXQUVTLFNBQVMsU0FBUyxTQUFTO0FBQ25DLGlCQUFTLE1BQU0sS0FBSyxjQUFjLFNBQVUsU0FBUyxLQUFNLE1BQU0sS0FBSyxjQUFjLFFBQVEsU0FBVSxNQUFNLEdBQUcsb0JBQW9CO0FBQUEsTUFDcEksV0FFUyxLQUFLLHNCQUFzQixJQUFJLFNBQVMsS0FBSyxHQUFHO0FBQ3hELGlCQUFTLEVBQUUsT0FBTyxNQUFNLEtBQUssc0JBQXNCLElBQUksU0FBUyxLQUFLLEVBQUcsRUFBRTtBQUFBLE1BQzNFLE9BQ0s7QUFFSixjQUFNLGdCQUFnQixNQUFNLEtBQUssdUJBQXVCLFVBQVUsUUFBUSxHQUFHO0FBQzdFLFlBQUksa0JBQWtCLFFBQVc7QUFFaEM7QUFBQSxRQUNEO0FBQ0EsaUJBQVMsT0FBTyxrQkFBa0IsV0FBVyxFQUFFLE9BQU8sY0FBYyxJQUFJO0FBQUEsTUFDekU7QUFFQSxVQUFJLFdBQVcsUUFBVztBQUV6QixlQUFPO0FBQUEsTUFDUjtBQUVBLFdBQUssUUFBUSxVQUFVLE1BQU07QUFBQSxJQUM5QjtBQUVBLFdBQU8sSUFBSSxJQUFJLFNBQVMsSUFBSSxLQUFLLFNBQVMsR0FBRyxDQUFDLENBQUMsS0FBSyxLQUFLLE1BQU0sQ0FBQyxJQUFJLE9BQU8sTUFBTSxLQUFNLENBQUMsQ0FBQztBQUFBLEVBQzFGO0FBQUEsRUFFQSxNQUFjLGNBQWMsUUFBMEMsU0FBaUIsUUFBc0U7QUFDNUosUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUdBLFFBQUk7QUFDSixVQUFNLFlBQXFDLFNBQVMsRUFBRSxVQUFVLE9BQU8sSUFBSSxJQUFJLENBQUM7QUFDaEYsVUFBTSxTQUFTLEtBQUsscUJBQXFCLFFBQXdDLFNBQVMsU0FBUztBQUVuRyxRQUFJLFFBQVE7QUFDWCxjQUFRLFFBQVE7QUFBQSxRQUNmLEtBQUssb0JBQW9CO0FBQVEsbUJBQVMsT0FBTyxhQUFhO0FBQVE7QUFBQSxRQUN0RSxLQUFLLG9CQUFvQjtBQUFTLG1CQUFTLE9BQU8sY0FBYztBQUFRO0FBQUEsUUFDeEUsS0FBSyxvQkFBb0I7QUFBTSxtQkFBUyxPQUFPLFdBQVc7QUFBUTtBQUFBLFFBQ2xFLEtBQUssb0JBQW9CO0FBQVksbUJBQVMsT0FBTyxnQkFBZ0I7QUFBUTtBQUFBLFFBQzdFLEtBQUssb0JBQW9CO0FBQWEsbUJBQVMsT0FBTyxpQkFBaUI7QUFBUTtBQUFBLFFBQy9FLEtBQUssb0JBQW9CO0FBQWEsbUJBQVMsT0FBTyxrQkFBa0I7QUFBUTtBQUFBLFFBQ2hGLEtBQUssb0JBQW9CO0FBQVcsbUJBQVMsT0FBTyxnQkFBZ0I7QUFBUTtBQUFBLFFBRTVFLEtBQUssb0JBQW9CO0FBQUEsUUFDekI7QUFDQyxtQkFBUyxPQUFPLHNCQUFzQjtBQUN0QztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBR0EsZUFBVyxLQUFLLHFCQUFxQixTQUF5QyxTQUFTLFNBQVMsR0FBRztBQUVuRyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZUFBeUM7QUFDaEQsVUFBTSxXQUFXLEtBQUssZUFBZSxJQUFJLHdCQUF3QixhQUFhLFNBQVM7QUFDdkYsVUFBTSxNQUFNLElBQUksU0FBeUIscUJBQXFCO0FBQzlELFFBQUk7QUFDSCxVQUFJLFVBQVU7QUFDYixZQUFJLFNBQVMsS0FBSyxNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQ2xDO0FBQUEsSUFDRCxRQUFRO0FBQUEsSUFFUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxjQUFjLEtBQXFDO0FBQzFELFNBQUssZUFBZSxNQUFNLHdCQUF3QixLQUFLLFVBQVUsSUFBSSxPQUFPLENBQUMsR0FBRyxhQUFhLFdBQVcsY0FBYyxPQUFPO0FBQUEsRUFDOUg7QUFBQSxFQUVBLE1BQWMsY0FBYyxTQUFpQixVQUFrQixZQUEyQyxzQkFBdUY7QUFDaE0sUUFBSSxDQUFDLFlBQVk7QUFDaEIsWUFBTSxJQUFJLGNBQWMsYUFBYSxPQUFPLFNBQVMsZ0NBQWdDLDBGQUEwRixVQUFVLFFBQVEsQ0FBQztBQUFBLElBQ25NO0FBR0EsVUFBTSxPQUFPLFdBQVcsT0FBTyxVQUFRLEtBQUssT0FBTyxRQUFRLEVBQUUsSUFBSTtBQUNqRSxRQUFJLE1BQU07QUFDVCxZQUFNLG1CQUFtQixDQUFDLGFBQXFCO0FBQzlDLGNBQU0sSUFBSSxjQUFjLGFBQWEsT0FBTyxTQUFTLGtDQUFrQyxpRUFBaUUsVUFBVSxLQUFLLE1BQU0sUUFBUSxDQUFDO0FBQUEsTUFDdkw7QUFFQSxZQUFNLGtCQUFrQixLQUFLLGFBQWE7QUFDMUMsWUFBTSxrQkFBa0IsR0FBRyxPQUFPLElBQUksUUFBUTtBQUM5QyxZQUFNLHNCQUFzQixnQkFBZ0IsSUFBSSxlQUFlO0FBRS9ELGNBQVEsS0FBSyxNQUFNO0FBQUEsUUFDbEIsS0FBSyxnQkFBZ0I7QUFDcEIsY0FBSSxDQUFDLE1BQU0sU0FBUyxLQUFLLFdBQVcsR0FBRztBQUN0Qyw2QkFBaUIsYUFBYTtBQUFBLFVBQy9CO0FBQ0EsZ0JBQU0sZUFBOEIsRUFBRSxRQUFRLEtBQUssYUFBYSxpQkFBaUIsTUFBTSxPQUFPLHVCQUF1QixTQUFTLFFBQVEsRUFBRSxLQUFLLHVCQUF1QixLQUFLLFFBQVE7QUFDakwsY0FBSSxLQUFLLFVBQVU7QUFDbEIseUJBQWEsV0FBVyxLQUFLO0FBQUEsVUFDOUI7QUFDQSxpQkFBTyxLQUFLLHFCQUFxQixNQUFNLE1BQU0sS0FBSyxrQkFBa0IsTUFBTSxZQUFZLENBQUMsRUFBRSxLQUFLLG1CQUFpQjtBQUM5RyxnQkFBSSxPQUFPLGtCQUFrQixZQUFZLENBQUMsS0FBSyxVQUFVO0FBQ3hELG1CQUFLLGNBQWMsZ0JBQWdCLElBQUksaUJBQWlCLGFBQWEsQ0FBQztBQUFBLFlBQ3ZFO0FBQ0EsbUJBQU8sa0JBQWtCLFNBQVksRUFBRSxPQUFPLGVBQXlCLE9BQU8sS0FBSyxJQUFJO0FBQUEsVUFDeEYsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxRQUVBLEtBQUssY0FBYztBQUNsQixjQUFJLENBQUMsTUFBTSxTQUFTLEtBQUssV0FBVyxHQUFHO0FBQ3RDLDZCQUFpQixhQUFhO0FBQUEsVUFDL0I7QUFDQSxjQUFJLE1BQU0sUUFBUSxLQUFLLE9BQU8sR0FBRztBQUNoQyx1QkFBVyxjQUFjLEtBQUssU0FBUztBQUN0QyxrQkFBSSxDQUFDLE1BQU0sU0FBUyxVQUFVLEtBQUssQ0FBQyxNQUFNLFNBQVMsV0FBVyxLQUFLLEdBQUc7QUFDckUsaUNBQWlCLE9BQU87QUFBQSxjQUN6QjtBQUFBLFlBQ0Q7QUFBQSxVQUNELE9BQU87QUFDTiw2QkFBaUIsU0FBUztBQUFBLFVBQzNCO0FBS0EsZ0JBQU0sUUFBUSxJQUFJLE1BQXNCO0FBQ3hDLHFCQUFXLGNBQWMsS0FBSyxTQUFTO0FBQ3RDLGtCQUFNLFFBQVEsTUFBTSxTQUFTLFVBQVUsSUFBSSxhQUFhLFdBQVc7QUFDbkUsa0JBQU0sUUFBUSxNQUFNLFNBQVMsVUFBVSxJQUFJLFNBQVksV0FBVztBQUVsRSxrQkFBTSxPQUF1QjtBQUFBLGNBQzVCLE9BQU8sUUFBUSxHQUFHLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFBQSxjQUN0QztBQUFBLFlBQ0Q7QUFFQSxrQkFBTSxXQUFXLHVCQUF1QixTQUFTLFFBQVEsRUFBRSxLQUFLLHVCQUF1QixLQUFLO0FBQzVGLGdCQUFJLFVBQVUsS0FBSyxTQUFTO0FBQzNCLG1CQUFLLGNBQWMsU0FBUyxtQ0FBbUMsV0FBVztBQUMxRSxvQkFBTSxRQUFRLElBQUk7QUFBQSxZQUNuQixXQUFXLFVBQVUsVUFBVTtBQUM5QixvQkFBTSxRQUFRLElBQUk7QUFBQSxZQUNuQixPQUFPO0FBQ04sb0JBQU0sS0FBSyxJQUFJO0FBQUEsWUFDaEI7QUFBQSxVQUNEO0FBRUEsZ0JBQU0sY0FBNEMsRUFBRSxhQUFhLEtBQUssYUFBYSxlQUFlLE1BQU0saUJBQWlCLEtBQUs7QUFDOUgsaUJBQU8sS0FBSyxxQkFBcUIsTUFBTSxNQUFNLEtBQUssa0JBQWtCLEtBQUssT0FBTyxhQUFhLE1BQVMsQ0FBQyxFQUFFLEtBQUssbUJBQWlCO0FBQzlILGdCQUFJLGVBQWU7QUFDbEIsb0JBQU0sUUFBUyxjQUFpQztBQUNoRCxtQkFBSyxjQUFjLGdCQUFnQixJQUFJLGlCQUFpQixLQUFLLENBQUM7QUFDOUQscUJBQU8sRUFBRSxPQUFPLE9BQU8sS0FBSztBQUFBLFlBQzdCO0FBQ0EsbUJBQU87QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNGO0FBQUEsUUFFQSxLQUFLLFdBQVc7QUFDZixjQUFJLENBQUMsTUFBTSxTQUFTLEtBQUssT0FBTyxHQUFHO0FBQ2xDLDZCQUFpQixTQUFTO0FBQUEsVUFDM0I7QUFDQSxpQkFBTyxLQUFLLHFCQUFxQixNQUFNLE1BQU0sS0FBSyxlQUFlLGVBQXVCLEtBQUssU0FBUyxLQUFLLElBQUksQ0FBQyxFQUFFLEtBQUssWUFBVTtBQUNoSSxnQkFBSSxPQUFPLFdBQVcsWUFBWSxNQUFNLGtCQUFrQixNQUFNLEdBQUc7QUFDbEUscUJBQU8sRUFBRSxPQUFPLFFBQVEsT0FBTyxLQUFLO0FBQUEsWUFDckM7QUFDQSxrQkFBTSxJQUFJLGNBQWMsYUFBYSxPQUFPLFNBQVMsc0NBQXNDLHdHQUF3RyxVQUFVLEtBQUssT0FBTyxDQUFDO0FBQUEsVUFDM04sQ0FBQztBQUFBLFFBQ0Y7QUFBQSxRQUVBO0FBQ0MsZ0JBQU0sSUFBSSxjQUFjLGFBQWEsT0FBTyxTQUFTLDZCQUE2Qix3RkFBd0YsUUFBUSxDQUFDO0FBQUEsTUFDckw7QUFBQSxJQUNEO0FBRUEsVUFBTSxJQUFJLGNBQWMsYUFBYSxPQUFPLFNBQVMsbUNBQW1DLG1GQUFtRixRQUFRLENBQUM7QUFBQSxFQUNyTDtBQUNEO0FBclVzQixpQ0FFTCxxQ0FBcUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
