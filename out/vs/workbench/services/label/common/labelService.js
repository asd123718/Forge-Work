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
import { localize } from "../../../../nls.js";
import { URI } from "../../../../base/common/uri.js";
import { Disposable, dispose } from "../../../../base/common/lifecycle.js";
import { posix, sep, win32 } from "../../../../base/common/path.js";
import { Emitter } from "../../../../base/common/event.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IWorkspaceContextService, isWorkspace, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier, WORKSPACE_EXTENSION, isUntitledWorkspace, isTemporaryWorkspace } from "../../../../platform/workspace/common/workspace.js";
import { basenameOrAuthority, basename, joinPath, dirname } from "../../../../base/common/resources.js";
import { tildify, getPathLabel } from "../../../../base/common/labels.js";
import { ILabelService, Verbosity } from "../../../../platform/label/common/label.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { match } from "../../../../base/common/glob.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IPathService } from "../../path/common/pathService.js";
import { isProposedApiEnabled } from "../../extensions/common/extensions.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { Schemas } from "../../../../base/common/network.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Memento } from "../../../common/memento.js";
const resourceLabelFormattersExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "resourceLabelFormatters",
  jsonSchema: {
    description: localize("vscode.extension.contributes.resourceLabelFormatters", "Contributes resource label formatting rules."),
    type: "array",
    items: {
      type: "object",
      required: ["scheme", "formatting"],
      properties: {
        scheme: {
          type: "string",
          description: localize("vscode.extension.contributes.resourceLabelFormatters.scheme", 'URI scheme on which to match the formatter on. For example "file". Simple glob patterns are supported.')
        },
        authority: {
          type: "string",
          description: localize("vscode.extension.contributes.resourceLabelFormatters.authority", "URI authority on which to match the formatter on. Simple glob patterns are supported.")
        },
        formatting: {
          description: localize("vscode.extension.contributes.resourceLabelFormatters.formatting", "Rules for formatting uri resource labels."),
          type: "object",
          properties: {
            label: {
              type: "string",
              description: localize("vscode.extension.contributes.resourceLabelFormatters.label", "Label rules to display. For example: myLabel:/${path}. ${path}, ${scheme}, ${authority} and ${authoritySuffix} are supported as variables.")
            },
            separator: {
              type: "string",
              description: localize("vscode.extension.contributes.resourceLabelFormatters.separator", "Separator to be used in the uri label display. '/' or '' as an example.")
            },
            stripPathStartingSeparator: {
              type: "boolean",
              description: localize("vscode.extension.contributes.resourceLabelFormatters.stripPathStartingSeparator", "Controls whether `${path}` substitutions should have starting separator characters stripped.")
            },
            tildify: {
              type: "boolean",
              description: localize("vscode.extension.contributes.resourceLabelFormatters.tildify", "Controls if the start of the uri label should be tildified when possible.")
            },
            workspaceSuffix: {
              type: "string",
              description: localize("vscode.extension.contributes.resourceLabelFormatters.formatting.workspaceSuffix", "Suffix appended to the workspace label.")
            }
          }
        }
      }
    }
  }
});
const posixPathSeparatorRegexp = /\//g;
const winPathSeparatorRegexp = /[\\\/]/g;
const labelMatchingRegexp = /\$\{(scheme|authoritySuffix|authority|path|(query)\.(.+?))\}/g;
function hasDriveLetterIgnorePlatform(path) {
  return !!(path && path[2] === ":");
}
let ResourceLabelFormattersHandler = class {
  constructor(labelService) {
    this.formattersDisposables = /* @__PURE__ */ new Map();
    resourceLabelFormattersExtPoint.setHandler((extensions, delta) => {
      for (const added of delta.added) {
        for (const untrustedFormatter of added.value) {
          const formatter = { ...untrustedFormatter };
          if (typeof formatter.formatting.label !== "string") {
            formatter.formatting.label = "${authority}${path}";
          }
          if (typeof formatter.formatting.separator !== `string`) {
            formatter.formatting.separator = sep;
          }
          if (!isProposedApiEnabled(added.description, "contribLabelFormatterWorkspaceTooltip") && formatter.formatting.workspaceTooltip) {
            formatter.formatting.workspaceTooltip = void 0;
          }
          this.formattersDisposables.set(formatter, labelService.registerFormatter(formatter));
        }
      }
      for (const removed of delta.removed) {
        for (const formatter of removed.value) {
          dispose(this.formattersDisposables.get(formatter));
        }
      }
    });
  }
};
ResourceLabelFormattersHandler = __decorateClass([
  __decorateParam(0, ILabelService)
], ResourceLabelFormattersHandler);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ResourceLabelFormattersHandler, LifecyclePhase.Restored);
const FORMATTER_CACHE_SIZE = 50;
let LabelService = class extends Disposable {
  constructor(environmentService, contextService, pathService, remoteAgentService, storageService, lifecycleService) {
    super();
    this.environmentService = environmentService;
    this.contextService = contextService;
    this.pathService = pathService;
    this.remoteAgentService = remoteAgentService;
    this._onDidChangeFormatters = this._register(new Emitter({ leakWarningThreshold: 400, leakWarningName: "LabelService._onDidChangeFormatters" }));
    this.onDidChangeFormatters = this._onDidChangeFormatters.event;
    this.os = OS;
    this.userHome = pathService.defaultUriScheme === Schemas.file ? this.pathService.userHome({ preferLocal: true }) : void 0;
    const memento = this.storedFormattersMemento = new Memento("cachedResourceLabelFormatters2", storageService);
    this.storedFormatters = memento.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    this.formatters = this.storedFormatters?.formatters?.slice() || [];
    this.resolveRemoteEnvironment();
  }
  async resolveRemoteEnvironment() {
    const env = await this.remoteAgentService.getEnvironment();
    this.os = env?.os ?? OS;
    this.userHome = await this.pathService.userHome();
  }
  findFormatting(resource) {
    let bestResult;
    for (const formatter of this.formatters) {
      if (formatter.scheme === resource.scheme) {
        if (!formatter.authority && (!bestResult || formatter.priority)) {
          bestResult = formatter;
          continue;
        }
        if (!formatter.authority) {
          continue;
        }
        if (match(formatter.authority, resource.authority, { ignoreCase: true }) && (!bestResult?.authority || formatter.authority.length > bestResult.authority.length || formatter.authority.length === bestResult.authority.length && formatter.priority)) {
          bestResult = formatter;
        }
      }
    }
    return bestResult ? bestResult.formatting : void 0;
  }
  getUriLabel(resource, options = {}) {
    let formatting = this.findFormatting(resource);
    if (formatting && options.separator) {
      formatting = { ...formatting, separator: options.separator };
    }
    let label = this.doGetUriLabel(resource, formatting, options);
    if (!formatting && options.separator) {
      label = this.adjustPathSeparators(label, options.separator);
    }
    if (options.appendWorkspaceSuffix && formatting?.workspaceSuffix) {
      label = this.appendWorkspaceSuffix(label, resource);
    }
    return label;
  }
  doGetUriLabel(resource, formatting, options = {}) {
    if (!formatting) {
      return getPathLabel(resource, {
        os: this.os,
        tildify: this.userHome ? { userHome: this.userHome } : void 0,
        relative: options.relative ? {
          noPrefix: options.noPrefix,
          getWorkspace: () => this.contextService.getWorkspace(),
          getWorkspaceFolder: (resource2) => this.contextService.getWorkspaceFolder(resource2)
        } : void 0
      });
    }
    if (options.relative && this.contextService) {
      let folder = this.contextService.getWorkspaceFolder(resource);
      if (!folder) {
        const workspace = this.contextService.getWorkspace();
        const firstFolder = workspace.folders.at(0);
        if (firstFolder && resource.scheme !== firstFolder.uri.scheme && resource.path.startsWith(posix.sep)) {
          folder = this.contextService.getWorkspaceFolder(firstFolder.uri.with({ path: resource.path }));
        }
      }
      if (folder) {
        const folderLabel = this.formatUri(folder.uri, formatting, options.noPrefix);
        let relativeLabel = this.formatUri(resource, formatting, options.noPrefix);
        let overlap = 0;
        while (relativeLabel[overlap] && relativeLabel[overlap] === folderLabel[overlap]) {
          overlap++;
        }
        if (!relativeLabel[overlap] || relativeLabel[overlap] === formatting.separator) {
          relativeLabel = relativeLabel.substring(1 + overlap);
        } else if (overlap === folderLabel.length && folder.uri.path === posix.sep) {
          relativeLabel = relativeLabel.substring(overlap);
        }
        const hasMultipleRoots = this.contextService.getWorkspace().folders.length > 1;
        if (hasMultipleRoots && !options.noPrefix) {
          const rootName = folder?.name ?? basenameOrAuthority(folder.uri);
          relativeLabel = relativeLabel ? `${rootName} \u2022 ${relativeLabel}` : rootName;
        }
        return relativeLabel;
      }
    }
    return this.formatUri(resource, formatting, options.noPrefix);
  }
  getUriBasenameLabel(resource) {
    const formatting = this.findFormatting(resource);
    const label = this.doGetUriLabel(resource, formatting);
    let pathLib;
    if (formatting?.separator === win32.sep) {
      pathLib = win32;
    } else if (formatting?.separator === posix.sep) {
      pathLib = posix;
    } else {
      pathLib = this.os === OperatingSystem.Windows ? win32 : posix;
    }
    return pathLib.basename(label);
  }
  getWorkspaceLabel(workspace, options) {
    if (isWorkspace(workspace)) {
      const identifier = toWorkspaceIdentifier(workspace);
      if (isSingleFolderWorkspaceIdentifier(identifier) || isWorkspaceIdentifier(identifier)) {
        return this.getWorkspaceLabel(identifier, options);
      }
      return "";
    }
    if (URI.isUri(workspace)) {
      return this.doGetSingleFolderWorkspaceLabel(workspace, options);
    }
    if (isSingleFolderWorkspaceIdentifier(workspace)) {
      return this.doGetSingleFolderWorkspaceLabel(workspace.uri, options);
    }
    if (isWorkspaceIdentifier(workspace)) {
      return this.doGetWorkspaceLabel(workspace.configPath, options);
    }
    return "";
  }
  doGetWorkspaceLabel(workspaceUri, options) {
    if (isUntitledWorkspace(workspaceUri, this.environmentService)) {
      return localize("untitledWorkspace", "Untitled (Workspace)");
    }
    if (isTemporaryWorkspace(workspaceUri)) {
      return localize("temporaryWorkspace", "Workspace");
    }
    let filename = basename(workspaceUri);
    if (filename.endsWith(WORKSPACE_EXTENSION)) {
      filename = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
    }
    let label;
    switch (options?.verbose) {
      case Verbosity.SHORT:
        label = filename;
        break;
      case Verbosity.LONG:
        label = localize("workspaceNameVerbose", "{0} (Workspace)", this.getUriLabel(joinPath(dirname(workspaceUri), filename)));
        break;
      case Verbosity.MEDIUM:
      default:
        label = localize("workspaceName", "{0} (Workspace)", filename);
        break;
    }
    if (options?.verbose === Verbosity.SHORT) {
      return label;
    }
    return this.appendWorkspaceSuffix(label, workspaceUri);
  }
  doGetSingleFolderWorkspaceLabel(folderUri, options) {
    let label;
    switch (options?.verbose) {
      case Verbosity.LONG:
        label = this.getUriLabel(folderUri);
        break;
      case Verbosity.SHORT:
      case Verbosity.MEDIUM:
      default:
        label = basename(folderUri) || posix.sep;
        break;
    }
    if (options?.verbose === Verbosity.SHORT) {
      return label;
    }
    return this.appendWorkspaceSuffix(label, folderUri);
  }
  getSeparator(scheme, authority) {
    const formatter = this.findFormatting(URI.from({ scheme, authority }));
    return formatter?.separator || posix.sep;
  }
  getHostLabel(scheme, authority) {
    const formatter = this.findFormatting(URI.from({ scheme, authority }));
    return formatter?.workspaceSuffix || authority || "";
  }
  getHostTooltip(scheme, authority) {
    const formatter = this.findFormatting(URI.from({ scheme, authority }));
    return formatter?.workspaceTooltip;
  }
  registerCachedFormatter(formatter) {
    const list = this.storedFormatters.formatters ??= [];
    let replace = list.findIndex((f) => f.scheme === formatter.scheme && f.authority === formatter.authority);
    if (replace === -1 && list.length >= FORMATTER_CACHE_SIZE) {
      replace = FORMATTER_CACHE_SIZE - 1;
    }
    if (replace === -1) {
      list.unshift(formatter);
    } else {
      for (let i = replace; i > 0; i--) {
        list[i] = list[i - 1];
      }
      list[0] = formatter;
    }
    this.storedFormattersMemento.saveMemento();
    return this.registerFormatter(formatter);
  }
  registerFormatter(formatter) {
    this.formatters.push(formatter);
    this._onDidChangeFormatters.fire({ scheme: formatter.scheme });
    return {
      dispose: () => {
        this.formatters = this.formatters.filter((f) => f !== formatter);
        this._onDidChangeFormatters.fire({ scheme: formatter.scheme });
      }
    };
  }
  formatUri(resource, formatting, forceNoTildify) {
    let label = formatting.label.replace(labelMatchingRegexp, (match2, token, qsToken, qsValue) => {
      switch (token) {
        case "scheme":
          return resource.scheme;
        case "authority":
          return resource.authority;
        case "authoritySuffix": {
          const i = resource.authority.indexOf("+");
          return i === -1 ? resource.authority : resource.authority.slice(i + 1);
        }
        case "path": {
          let pathValue = resource.path;
          if (formatting.stripPathSegments) {
            let pos = 0;
            for (let i = 0; i < formatting.stripPathSegments; i++) {
              const next = pathValue.indexOf("/", pos + 1);
              if (next === -1) {
                break;
              }
              pos = next;
            }
            pathValue = pathValue.substring(pos);
          }
          return formatting.stripPathStartingSeparator ? pathValue.slice(pathValue[0] === formatting.separator ? 1 : 0) : pathValue;
        }
        default: {
          if (qsToken === "query") {
            const { query } = resource;
            if (query && query[0] === "{" && query[query.length - 1] === "}") {
              try {
                return JSON.parse(query)[qsValue] || "";
              } catch {
              }
            }
          }
          return "";
        }
      }
    });
    if (formatting.normalizeDriveLetter && hasDriveLetterIgnorePlatform(label)) {
      label = label.charAt(1).toUpperCase() + label.substr(2);
    }
    if (formatting.tildify && !forceNoTildify) {
      if (this.userHome) {
        label = tildify(label, this.userHome.fsPath, this.os);
      }
    }
    if (formatting.authorityPrefix && resource.authority) {
      label = formatting.authorityPrefix + label;
    }
    return this.adjustPathSeparators(label, formatting.separator);
  }
  adjustPathSeparators(label, separator) {
    return label.replace(this.os === OperatingSystem.Windows ? winPathSeparatorRegexp : posixPathSeparatorRegexp, separator);
  }
  appendWorkspaceSuffix(label, uri) {
    const formatting = this.findFormatting(uri);
    const suffix = formatting && typeof formatting.workspaceSuffix === "string" ? formatting.workspaceSuffix : void 0;
    return suffix ? `${label} [${suffix}]` : label;
  }
};
LabelService = __decorateClass([
  __decorateParam(0, IWorkbenchEnvironmentService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IPathService),
  __decorateParam(3, IRemoteAgentService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, ILifecycleService)
], LabelService);
registerSingleton(ILabelService, LabelService, InstantiationType.Delayed);
export {
  LabelService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxsYWJlbFxcY29tbW9uXFxsYWJlbFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcG9zaXgsIHNlcCwgd2luMzIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2UsIGlzV29ya3NwYWNlLCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1dvcmtzcGFjZUlkZW50aWZpZXIsIElXb3Jrc3BhY2VJZGVudGlmaWVyLCB0b1dvcmtzcGFjZUlkZW50aWZpZXIsIFdPUktTUEFDRV9FWFRFTlNJT04sIGlzVW50aXRsZWRXb3Jrc3BhY2UsIGlzVGVtcG9yYXJ5V29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWVPckF1dGhvcml0eSwgYmFzZW5hbWUsIGpvaW5QYXRoLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IHRpbGRpZnksIGdldFBhdGhMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlLCBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyLCBSZXNvdXJjZUxhYmVsRm9ybWF0dGluZywgSUZvcm1hdHRlckNoYW5nZUV2ZW50LCBWZXJib3NpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IG1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuXG5jb25zdCByZXNvdXJjZUxhYmVsRm9ybWF0dGVyc0V4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8UmVzb3VyY2VMYWJlbEZvcm1hdHRlcltdPih7XG5cdGV4dGVuc2lvblBvaW50OiAncmVzb3VyY2VMYWJlbEZvcm1hdHRlcnMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnJlc291cmNlTGFiZWxGb3JtYXR0ZXJzJywgJ0NvbnRyaWJ1dGVzIHJlc291cmNlIGxhYmVsIGZvcm1hdHRpbmcgcnVsZXMuJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRyZXF1aXJlZDogWydzY2hlbWUnLCAnZm9ybWF0dGluZyddLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRzY2hlbWU6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMucmVzb3VyY2VMYWJlbEZvcm1hdHRlcnMuc2NoZW1lJywgJ1VSSSBzY2hlbWUgb24gd2hpY2ggdG8gbWF0Y2ggdGhlIGZvcm1hdHRlciBvbi4gRm9yIGV4YW1wbGUgXCJmaWxlXCIuIFNpbXBsZSBnbG9iIHBhdHRlcm5zIGFyZSBzdXBwb3J0ZWQuJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGF1dGhvcml0eToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5yZXNvdXJjZUxhYmVsRm9ybWF0dGVycy5hdXRob3JpdHknLCAnVVJJIGF1dGhvcml0eSBvbiB3aGljaCB0byBtYXRjaCB0aGUgZm9ybWF0dGVyIG9uLiBTaW1wbGUgZ2xvYiBwYXR0ZXJucyBhcmUgc3VwcG9ydGVkLicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnJlc291cmNlTGFiZWxGb3JtYXR0ZXJzLmZvcm1hdHRpbmcnLCBcIlJ1bGVzIGZvciBmb3JtYXR0aW5nIHVyaSByZXNvdXJjZSBsYWJlbHMuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGxhYmVsOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMucmVzb3VyY2VMYWJlbEZvcm1hdHRlcnMubGFiZWwnLCBcIkxhYmVsIHJ1bGVzIHRvIGRpc3BsYXkuIEZvciBleGFtcGxlOiBteUxhYmVsOi8ke3BhdGh9LiAke3BhdGh9LCAke3NjaGVtZX0sICR7YXV0aG9yaXR5fSBhbmQgJHthdXRob3JpdHlTdWZmaXh9IGFyZSBzdXBwb3J0ZWQgYXMgdmFyaWFibGVzLlwiKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHNlcGFyYXRvcjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnJlc291cmNlTGFiZWxGb3JtYXR0ZXJzLnNlcGFyYXRvcicsIFwiU2VwYXJhdG9yIHRvIGJlIHVzZWQgaW4gdGhlIHVyaSBsYWJlbCBkaXNwbGF5LiAnLycgb3IgJ1xcJyBhcyBhbiBleGFtcGxlLlwiKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN0cmlwUGF0aFN0YXJ0aW5nU2VwYXJhdG9yOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnJlc291cmNlTGFiZWxGb3JtYXR0ZXJzLnN0cmlwUGF0aFN0YXJ0aW5nU2VwYXJhdG9yJywgXCJDb250cm9scyB3aGV0aGVyIGAke3BhdGh9YCBzdWJzdGl0dXRpb25zIHNob3VsZCBoYXZlIHN0YXJ0aW5nIHNlcGFyYXRvciBjaGFyYWN0ZXJzIHN0cmlwcGVkLlwiKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHRpbGRpZnk6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMucmVzb3VyY2VMYWJlbEZvcm1hdHRlcnMudGlsZGlmeScsIFwiQ29udHJvbHMgaWYgdGhlIHN0YXJ0IG9mIHRoZSB1cmkgbGFiZWwgc2hvdWxkIGJlIHRpbGRpZmllZCB3aGVuIHBvc3NpYmxlLlwiKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZVN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnJlc291cmNlTGFiZWxGb3JtYXR0ZXJzLmZvcm1hdHRpbmcud29ya3NwYWNlU3VmZml4JywgXCJTdWZmaXggYXBwZW5kZWQgdG8gdGhlIHdvcmtzcGFjZSBsYWJlbC5cIilcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5jb25zdCBwb3NpeFBhdGhTZXBhcmF0b3JSZWdleHAgPSAvXFwvL2c7IC8vIG9uIFVuaXgsIGJhY2tzbGFzaCBpcyBhIHZhbGlkIGZpbGVuYW1lIGNoYXJhY3RlclxuY29uc3Qgd2luUGF0aFNlcGFyYXRvclJlZ2V4cCA9IC9bXFxcXFxcL10vZzsgLy8gb24gV2luZG93cywgbmVpdGhlciBzbGFzaCBub3IgYmFja3NsYXNoIGFyZSB2YWxpZCBmaWxlbmFtZSBjaGFyYWN0ZXJzXG5jb25zdCBsYWJlbE1hdGNoaW5nUmVnZXhwID0gL1xcJFxceyhzY2hlbWV8YXV0aG9yaXR5U3VmZml4fGF1dGhvcml0eXxwYXRofChxdWVyeSlcXC4oLis/KSlcXH0vZztcblxuZnVuY3Rpb24gaGFzRHJpdmVMZXR0ZXJJZ25vcmVQbGF0Zm9ybShwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuICEhKHBhdGggJiYgcGF0aFsyXSA9PT0gJzonKTtcbn1cblxuY2xhc3MgUmVzb3VyY2VMYWJlbEZvcm1hdHRlcnNIYW5kbGVyIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmb3JtYXR0ZXJzRGlzcG9zYWJsZXMgPSBuZXcgTWFwPFJlc291cmNlTGFiZWxGb3JtYXR0ZXIsIElEaXNwb3NhYmxlPigpO1xuXG5cdGNvbnN0cnVjdG9yKEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSkge1xuXHRcdHJlc291cmNlTGFiZWxGb3JtYXR0ZXJzRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblx0XHRcdGZvciAoY29uc3QgYWRkZWQgb2YgZGVsdGEuYWRkZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB1bnRydXN0ZWRGb3JtYXR0ZXIgb2YgYWRkZWQudmFsdWUpIHtcblxuXHRcdFx0XHRcdC8vIFdlIGNhbm5vdCB0cnVzdCB0aGF0IHRoZSBmb3JtYXR0ZXIgYXMgaXQgY29tZXMgZnJvbSBhbiBleHRlbnNpb25cblx0XHRcdFx0XHQvLyBhZGhlcmVzIHRvIG91ciBpbnRlcmZhY2UsIHNvIGZvciB0aGUgcmVxdWlyZWQgcHJvcGVydGllcyB3ZSBmaWxsXG5cdFx0XHRcdFx0Ly8gaW4gc29tZSBkZWZhdWx0cyBpZiBtaXNzaW5nLlxuXG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0dGVyID0geyAuLi51bnRydXN0ZWRGb3JtYXR0ZXIgfTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGZvcm1hdHRlci5mb3JtYXR0aW5nLmxhYmVsICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0Zm9ybWF0dGVyLmZvcm1hdHRpbmcubGFiZWwgPSAnJHthdXRob3JpdHl9JHtwYXRofSc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0eXBlb2YgZm9ybWF0dGVyLmZvcm1hdHRpbmcuc2VwYXJhdG9yICE9PSBgc3RyaW5nYCkge1xuXHRcdFx0XHRcdFx0Zm9ybWF0dGVyLmZvcm1hdHRpbmcuc2VwYXJhdG9yID0gc2VwO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghaXNQcm9wb3NlZEFwaUVuYWJsZWQoYWRkZWQuZGVzY3JpcHRpb24sICdjb250cmliTGFiZWxGb3JtYXR0ZXJXb3Jrc3BhY2VUb29sdGlwJykgJiYgZm9ybWF0dGVyLmZvcm1hdHRpbmcud29ya3NwYWNlVG9vbHRpcCkge1xuXHRcdFx0XHRcdFx0Zm9ybWF0dGVyLmZvcm1hdHRpbmcud29ya3NwYWNlVG9vbHRpcCA9IHVuZGVmaW5lZDsgLy8gd29ya3NwYWNlVG9vbHRpcCBpcyBvbmx5IHByb3Bvc2VkXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5mb3JtYXR0ZXJzRGlzcG9zYWJsZXMuc2V0KGZvcm1hdHRlciwgbGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKGZvcm1hdHRlcikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgcmVtb3ZlZCBvZiBkZWx0YS5yZW1vdmVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZm9ybWF0dGVyIG9mIHJlbW92ZWQudmFsdWUpIHtcblx0XHRcdFx0XHRkaXNwb3NlKHRoaXMuZm9ybWF0dGVyc0Rpc3Bvc2FibGVzLmdldChmb3JtYXR0ZXIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oUmVzb3VyY2VMYWJlbEZvcm1hdHRlcnNIYW5kbGVyLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cbmNvbnN0IEZPUk1BVFRFUl9DQUNIRV9TSVpFID0gNTA7XG5cbmludGVyZmFjZSBJU3RvcmVkRm9ybWF0dGVycyB7XG5cdGZvcm1hdHRlcnM/OiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyW107XG5cdGk/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBMYWJlbFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUxhYmVsU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBmb3JtYXR0ZXJzOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGb3JtYXR0ZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUZvcm1hdHRlckNoYW5nZUV2ZW50Pih7IGxlYWtXYXJuaW5nVGhyZXNob2xkOiA0MDAsIGxlYWtXYXJuaW5nTmFtZTogJ0xhYmVsU2VydmljZS5fb25EaWRDaGFuZ2VGb3JtYXR0ZXJzJyB9KSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9ybWF0dGVycyA9IHRoaXMuX29uRGlkQ2hhbmdlRm9ybWF0dGVycy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN0b3JlZEZvcm1hdHRlcnNNZW1lbnRvOiBNZW1lbnRvPElTdG9yZWRGb3JtYXR0ZXJzPjtcblx0cHJpdmF0ZSByZWFkb25seSBzdG9yZWRGb3JtYXR0ZXJzOiBJU3RvcmVkRm9ybWF0dGVycztcblx0cHJpdmF0ZSBvczogT3BlcmF0aW5nU3lzdGVtO1xuXHRwcml2YXRlIHVzZXJIb21lOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIEZpbmQgc29tZSBtZWFuaW5nZnVsIGRlZmF1bHRzIHVudGlsIHRoZSByZW1vdGUgZW52aXJvbm1lbnRcblx0XHQvLyBpcyByZXNvbHZlZCwgYnkgdGFraW5nIHRoZSBjdXJyZW50IE9TIHdlIGFyZSBydW5uaW5nIGluXG5cdFx0Ly8gYW5kIGJ5IHRha2luZyB0aGUgbG9jYWwgYHVzZXJIb21lYCBpZiB3ZSBydW4gb24gYSBsb2NhbFxuXHRcdC8vIGZpbGUgc2NoZW1lLlxuXHRcdHRoaXMub3MgPSBPUztcblx0XHR0aGlzLnVzZXJIb21lID0gcGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSh7IHByZWZlckxvY2FsOiB0cnVlIH0pIDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbWVtZW50byA9IHRoaXMuc3RvcmVkRm9ybWF0dGVyc01lbWVudG8gPSBuZXcgTWVtZW50bygnY2FjaGVkUmVzb3VyY2VMYWJlbEZvcm1hdHRlcnMyJywgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuc3RvcmVkRm9ybWF0dGVycyA9IG1lbWVudG8uZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR0aGlzLmZvcm1hdHRlcnMgPSB0aGlzLnN0b3JlZEZvcm1hdHRlcnM/LmZvcm1hdHRlcnM/LnNsaWNlKCkgfHwgW107XG5cblx0XHQvLyBSZW1vdGUgZW52aXJvbm1lbnQgaXMgcG90ZW50aWFsbHkgbG9uZyBydW5uaW5nXG5cdFx0dGhpcy5yZXNvbHZlUmVtb3RlRW52aXJvbm1lbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZVJlbW90ZUVudmlyb25tZW50KCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gT1Ncblx0XHRjb25zdCBlbnYgPSBhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdHRoaXMub3MgPSBlbnY/Lm9zID8/IE9TO1xuXG5cdFx0Ly8gVXNlciBob21lXG5cdFx0dGhpcy51c2VySG9tZSA9IGF3YWl0IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0fVxuXG5cdGZpbmRGb3JtYXR0aW5nKHJlc291cmNlOiBVUkkpOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGJlc3RSZXN1bHQ6IFJlc291cmNlTGFiZWxGb3JtYXR0ZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IGZvcm1hdHRlciBvZiB0aGlzLmZvcm1hdHRlcnMpIHtcblx0XHRcdGlmIChmb3JtYXR0ZXIuc2NoZW1lID09PSByZXNvdXJjZS5zY2hlbWUpIHtcblx0XHRcdFx0aWYgKCFmb3JtYXR0ZXIuYXV0aG9yaXR5ICYmICghYmVzdFJlc3VsdCB8fCBmb3JtYXR0ZXIucHJpb3JpdHkpKSB7XG5cdFx0XHRcdFx0YmVzdFJlc3VsdCA9IGZvcm1hdHRlcjtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghZm9ybWF0dGVyLmF1dGhvcml0eSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1hdGNoKGZvcm1hdHRlci5hdXRob3JpdHksIHJlc291cmNlLmF1dGhvcml0eSwgeyBpZ25vcmVDYXNlOiB0cnVlIH0pICYmXG5cdFx0XHRcdFx0KFxuXHRcdFx0XHRcdFx0IWJlc3RSZXN1bHQ/LmF1dGhvcml0eSB8fFxuXHRcdFx0XHRcdFx0Zm9ybWF0dGVyLmF1dGhvcml0eS5sZW5ndGggPiBiZXN0UmVzdWx0LmF1dGhvcml0eS5sZW5ndGggfHxcblx0XHRcdFx0XHRcdCgoZm9ybWF0dGVyLmF1dGhvcml0eS5sZW5ndGggPT09IGJlc3RSZXN1bHQuYXV0aG9yaXR5Lmxlbmd0aCkgJiYgZm9ybWF0dGVyLnByaW9yaXR5KVxuXHRcdFx0XHRcdClcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0YmVzdFJlc3VsdCA9IGZvcm1hdHRlcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBiZXN0UmVzdWx0ID8gYmVzdFJlc3VsdC5mb3JtYXR0aW5nIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0VXJpTGFiZWwocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogeyByZWxhdGl2ZT86IGJvb2xlYW47IG5vUHJlZml4PzogYm9vbGVhbjsgc2VwYXJhdG9yPzogJy8nIHwgJ1xcXFwnOyBhcHBlbmRXb3Jrc3BhY2VTdWZmaXg/OiBib29sZWFuIH0gPSB7fSk6IHN0cmluZyB7XG5cdFx0bGV0IGZvcm1hdHRpbmcgPSB0aGlzLmZpbmRGb3JtYXR0aW5nKHJlc291cmNlKTtcblx0XHRpZiAoZm9ybWF0dGluZyAmJiBvcHRpb25zLnNlcGFyYXRvcikge1xuXHRcdFx0Ly8gbWl4aW4gc2VwYXJhdG9yIGlmIGRlZmluZWQgZnJvbSB0aGUgb3V0c2lkZVxuXHRcdFx0Zm9ybWF0dGluZyA9IHsgLi4uZm9ybWF0dGluZywgc2VwYXJhdG9yOiBvcHRpb25zLnNlcGFyYXRvciB9O1xuXHRcdH1cblxuXHRcdGxldCBsYWJlbCA9IHRoaXMuZG9HZXRVcmlMYWJlbChyZXNvdXJjZSwgZm9ybWF0dGluZywgb3B0aW9ucyk7XG5cblx0XHQvLyBXaXRob3V0IGZvcm1hdHRpbmcgd2Ugc3RpbGwgbmVlZCB0byBzdXBwb3J0IHRoZSBzZXBhcmF0b3Jcblx0XHQvLyBhcyBwcm92aWRlZCBpbiBvcHRpb25zIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTMwMDE5KVxuXHRcdGlmICghZm9ybWF0dGluZyAmJiBvcHRpb25zLnNlcGFyYXRvcikge1xuXHRcdFx0bGFiZWwgPSB0aGlzLmFkanVzdFBhdGhTZXBhcmF0b3JzKGxhYmVsLCBvcHRpb25zLnNlcGFyYXRvcik7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuYXBwZW5kV29ya3NwYWNlU3VmZml4ICYmIGZvcm1hdHRpbmc/LndvcmtzcGFjZVN1ZmZpeCkge1xuXHRcdFx0bGFiZWwgPSB0aGlzLmFwcGVuZFdvcmtzcGFjZVN1ZmZpeChsYWJlbCwgcmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsYWJlbDtcblx0fVxuXG5cdHByaXZhdGUgZG9HZXRVcmlMYWJlbChyZXNvdXJjZTogVVJJLCBmb3JtYXR0aW5nPzogUmVzb3VyY2VMYWJlbEZvcm1hdHRpbmcsIG9wdGlvbnM6IHsgcmVsYXRpdmU/OiBib29sZWFuOyBub1ByZWZpeD86IGJvb2xlYW4gfSA9IHt9KTogc3RyaW5nIHtcblx0XHRpZiAoIWZvcm1hdHRpbmcpIHtcblx0XHRcdHJldHVybiBnZXRQYXRoTGFiZWwocmVzb3VyY2UsIHtcblx0XHRcdFx0b3M6IHRoaXMub3MsXG5cdFx0XHRcdHRpbGRpZnk6IHRoaXMudXNlckhvbWUgPyB7IHVzZXJIb21lOiB0aGlzLnVzZXJIb21lIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbGF0aXZlOiBvcHRpb25zLnJlbGF0aXZlID8ge1xuXHRcdFx0XHRcdG5vUHJlZml4OiBvcHRpb25zLm5vUHJlZml4LFxuXHRcdFx0XHRcdGdldFdvcmtzcGFjZTogKCkgPT4gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSxcblx0XHRcdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXI6IHJlc291cmNlID0+IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKVxuXHRcdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBSZWxhdGl2ZSBsYWJlbFxuXHRcdGlmIChvcHRpb25zLnJlbGF0aXZlICYmIHRoaXMuY29udGV4dFNlcnZpY2UpIHtcblx0XHRcdGxldCBmb2xkZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihyZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWZvbGRlcikge1xuXG5cdFx0XHRcdC8vIEl0IGlzIHBvc3NpYmxlIHRoYXQgdGhlIHJlc291cmNlIHdlIHdhbnQgdG8gcmVzb2x2ZSB0aGVcblx0XHRcdFx0Ly8gd29ya3NwYWNlIGZvbGRlciBmb3IgaXMgbm90IHVzaW5nIHRoZSBzYW1lIHNjaGVtZSBhc1xuXHRcdFx0XHQvLyB0aGUgZm9sZGVycyBpbiB0aGUgd29ya3NwYWNlLCBzbyB3ZSBoZWxwIGJ5IHRyeWluZyBhZ2FpblxuXHRcdFx0XHQvLyB0byByZXNvbHZlIGEgd29ya3NwYWNlIGZvbGRlciBieSB0cnlpbmcgYWdhaW4gd2l0aCBhXG5cdFx0XHRcdC8vIHNjaGVtZSB0aGF0IGlzIHdvcmtzcGFjZSBjb250YWluZWQuXG5cblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRcdFx0Y29uc3QgZmlyc3RGb2xkZXIgPSB3b3Jrc3BhY2UuZm9sZGVycy5hdCgwKTtcblx0XHRcdFx0aWYgKGZpcnN0Rm9sZGVyICYmIHJlc291cmNlLnNjaGVtZSAhPT0gZmlyc3RGb2xkZXIudXJpLnNjaGVtZSAmJiByZXNvdXJjZS5wYXRoLnN0YXJ0c1dpdGgocG9zaXguc2VwKSkge1xuXHRcdFx0XHRcdGZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGZpcnN0Rm9sZGVyLnVyaS53aXRoKHsgcGF0aDogcmVzb3VyY2UucGF0aCB9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJMYWJlbCA9IHRoaXMuZm9ybWF0VXJpKGZvbGRlci51cmksIGZvcm1hdHRpbmcsIG9wdGlvbnMubm9QcmVmaXgpO1xuXG5cdFx0XHRcdGxldCByZWxhdGl2ZUxhYmVsID0gdGhpcy5mb3JtYXRVcmkocmVzb3VyY2UsIGZvcm1hdHRpbmcsIG9wdGlvbnMubm9QcmVmaXgpO1xuXHRcdFx0XHRsZXQgb3ZlcmxhcCA9IDA7XG5cdFx0XHRcdHdoaWxlIChyZWxhdGl2ZUxhYmVsW292ZXJsYXBdICYmIHJlbGF0aXZlTGFiZWxbb3ZlcmxhcF0gPT09IGZvbGRlckxhYmVsW292ZXJsYXBdKSB7XG5cdFx0XHRcdFx0b3ZlcmxhcCsrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFyZWxhdGl2ZUxhYmVsW292ZXJsYXBdIHx8IHJlbGF0aXZlTGFiZWxbb3ZlcmxhcF0gPT09IGZvcm1hdHRpbmcuc2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0cmVsYXRpdmVMYWJlbCA9IHJlbGF0aXZlTGFiZWwuc3Vic3RyaW5nKDEgKyBvdmVybGFwKTtcblx0XHRcdFx0fSBlbHNlIGlmIChvdmVybGFwID09PSBmb2xkZXJMYWJlbC5sZW5ndGggJiYgZm9sZGVyLnVyaS5wYXRoID09PSBwb3NpeC5zZXApIHtcblx0XHRcdFx0XHRyZWxhdGl2ZUxhYmVsID0gcmVsYXRpdmVMYWJlbC5zdWJzdHJpbmcob3ZlcmxhcCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBhbHdheXMgc2hvdyByb290IGJhc2VuYW1lIGlmIHRoZXJlIGFyZSBtdWx0aXBsZSBmb2xkZXJzXG5cdFx0XHRcdGNvbnN0IGhhc011bHRpcGxlUm9vdHMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubGVuZ3RoID4gMTtcblx0XHRcdFx0aWYgKGhhc011bHRpcGxlUm9vdHMgJiYgIW9wdGlvbnMubm9QcmVmaXgpIHtcblx0XHRcdFx0XHRjb25zdCByb290TmFtZSA9IGZvbGRlcj8ubmFtZSA/PyBiYXNlbmFtZU9yQXV0aG9yaXR5KGZvbGRlci51cmkpO1xuXHRcdFx0XHRcdHJlbGF0aXZlTGFiZWwgPSByZWxhdGl2ZUxhYmVsID8gYCR7cm9vdE5hbWV9IFx1MjAyMiAke3JlbGF0aXZlTGFiZWx9YCA6IHJvb3ROYW1lO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHJlbGF0aXZlTGFiZWw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWJzb2x1dGUgbGFiZWxcblx0XHRyZXR1cm4gdGhpcy5mb3JtYXRVcmkocmVzb3VyY2UsIGZvcm1hdHRpbmcsIG9wdGlvbnMubm9QcmVmaXgpO1xuXHR9XG5cblx0Z2V0VXJpQmFzZW5hbWVMYWJlbChyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRjb25zdCBmb3JtYXR0aW5nID0gdGhpcy5maW5kRm9ybWF0dGluZyhyZXNvdXJjZSk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmRvR2V0VXJpTGFiZWwocmVzb3VyY2UsIGZvcm1hdHRpbmcpO1xuXG5cdFx0bGV0IHBhdGhMaWI6IHR5cGVvZiB3aW4zMiB8IHR5cGVvZiBwb3NpeDtcblx0XHRpZiAoZm9ybWF0dGluZz8uc2VwYXJhdG9yID09PSB3aW4zMi5zZXApIHtcblx0XHRcdHBhdGhMaWIgPSB3aW4zMjtcblx0XHR9IGVsc2UgaWYgKGZvcm1hdHRpbmc/LnNlcGFyYXRvciA9PT0gcG9zaXguc2VwKSB7XG5cdFx0XHRwYXRoTGliID0gcG9zaXg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBhdGhMaWIgPSAodGhpcy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpID8gd2luMzIgOiBwb3NpeDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGF0aExpYi5iYXNlbmFtZShsYWJlbCk7XG5cdH1cblxuXHRnZXRXb3Jrc3BhY2VMYWJlbCh3b3Jrc3BhY2U6IElXb3Jrc3BhY2UgfCBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyIHwgVVJJLCBvcHRpb25zPzogeyB2ZXJib3NlOiBWZXJib3NpdHkgfSk6IHN0cmluZyB7XG5cdFx0aWYgKGlzV29ya3NwYWNlKHdvcmtzcGFjZSkpIHtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0b1dvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlKTtcblx0XHRcdGlmIChpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIoaWRlbnRpZmllcikgfHwgaXNXb3Jrc3BhY2VJZGVudGlmaWVyKGlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFdvcmtzcGFjZUxhYmVsKGlkZW50aWZpZXIsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlOiBTaW5nbGUgRm9sZGVyIChhcyBVUkkpXG5cdFx0aWYgKFVSSS5pc1VyaSh3b3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb0dldFNpbmdsZUZvbGRlcldvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlOiBTaW5nbGUgRm9sZGVyIChhcyB3b3Jrc3BhY2UgaWRlbnRpZmllcilcblx0XHRpZiAoaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvR2V0U2luZ2xlRm9sZGVyV29ya3NwYWNlTGFiZWwod29ya3NwYWNlLnVyaSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlOiBNdWx0aSBSb290XG5cdFx0aWYgKGlzV29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb0dldFdvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZS5jb25maWdQYXRoLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0V29ya3NwYWNlTGFiZWwod29ya3NwYWNlVXJpOiBVUkksIG9wdGlvbnM/OiB7IHZlcmJvc2U6IFZlcmJvc2l0eSB9KTogc3RyaW5nIHtcblxuXHRcdC8vIFdvcmtzcGFjZTogVW50aXRsZWRcblx0XHRpZiAoaXNVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2VVcmksIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlKSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd1bnRpdGxlZFdvcmtzcGFjZScsIFwiVW50aXRsZWQgKFdvcmtzcGFjZSlcIik7XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlOiBUZW1wb3Jhcnlcblx0XHRpZiAoaXNUZW1wb3JhcnlXb3Jrc3BhY2Uod29ya3NwYWNlVXJpKSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0ZW1wb3JhcnlXb3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKTtcblx0XHR9XG5cblx0XHQvLyBXb3Jrc3BhY2U6IFNhdmVkXG5cdFx0bGV0IGZpbGVuYW1lID0gYmFzZW5hbWUod29ya3NwYWNlVXJpKTtcblx0XHRpZiAoZmlsZW5hbWUuZW5kc1dpdGgoV09SS1NQQUNFX0VYVEVOU0lPTikpIHtcblx0XHRcdGZpbGVuYW1lID0gZmlsZW5hbWUuc3Vic3RyKDAsIGZpbGVuYW1lLmxlbmd0aCAtIFdPUktTUEFDRV9FWFRFTlNJT04ubGVuZ3RoIC0gMSk7XG5cdFx0fVxuXG5cdFx0bGV0IGxhYmVsOiBzdHJpbmc7XG5cdFx0c3dpdGNoIChvcHRpb25zPy52ZXJib3NlKSB7XG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5TSE9SVDpcblx0XHRcdFx0bGFiZWwgPSBmaWxlbmFtZTsgLy8gc2tpcCBzdWZmaXggZm9yIHNob3J0IGxhYmVsXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBWZXJib3NpdHkuTE9ORzpcblx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnd29ya3NwYWNlTmFtZVZlcmJvc2UnLCBcInswfSAoV29ya3NwYWNlKVwiLCB0aGlzLmdldFVyaUxhYmVsKGpvaW5QYXRoKGRpcm5hbWUod29ya3NwYWNlVXJpKSwgZmlsZW5hbWUpKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBWZXJib3NpdHkuTUVESVVNOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnd29ya3NwYWNlTmFtZScsIFwiezB9IChXb3Jrc3BhY2UpXCIsIGZpbGVuYW1lKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LnZlcmJvc2UgPT09IFZlcmJvc2l0eS5TSE9SVCkge1xuXHRcdFx0cmV0dXJuIGxhYmVsOyAvLyBza2lwIHN1ZmZpeCBmb3Igc2hvcnQgbGFiZWxcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5hcHBlbmRXb3Jrc3BhY2VTdWZmaXgobGFiZWwsIHdvcmtzcGFjZVVyaSk7XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0U2luZ2xlRm9sZGVyV29ya3NwYWNlTGFiZWwoZm9sZGVyVXJpOiBVUkksIG9wdGlvbnM/OiB7IHZlcmJvc2U6IFZlcmJvc2l0eSB9KTogc3RyaW5nIHtcblx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRzd2l0Y2ggKG9wdGlvbnM/LnZlcmJvc2UpIHtcblx0XHRcdGNhc2UgVmVyYm9zaXR5LkxPTkc6XG5cdFx0XHRcdGxhYmVsID0gdGhpcy5nZXRVcmlMYWJlbChmb2xkZXJVcmkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVmVyYm9zaXR5LlNIT1JUOlxuXHRcdFx0Y2FzZSBWZXJib3NpdHkuTUVESVVNOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0bGFiZWwgPSBiYXNlbmFtZShmb2xkZXJVcmkpIHx8IHBvc2l4LnNlcDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LnZlcmJvc2UgPT09IFZlcmJvc2l0eS5TSE9SVCkge1xuXHRcdFx0cmV0dXJuIGxhYmVsOyAvLyBza2lwIHN1ZmZpeCBmb3Igc2hvcnQgbGFiZWxcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5hcHBlbmRXb3Jrc3BhY2VTdWZmaXgobGFiZWwsIGZvbGRlclVyaSk7XG5cdH1cblxuXHRnZXRTZXBhcmF0b3Ioc2NoZW1lOiBzdHJpbmcsIGF1dGhvcml0eT86IHN0cmluZyk6ICcvJyB8ICdcXFxcJyB7XG5cdFx0Y29uc3QgZm9ybWF0dGVyID0gdGhpcy5maW5kRm9ybWF0dGluZyhVUkkuZnJvbSh7IHNjaGVtZSwgYXV0aG9yaXR5IH0pKTtcblxuXHRcdHJldHVybiBmb3JtYXR0ZXI/LnNlcGFyYXRvciB8fCBwb3NpeC5zZXA7XG5cdH1cblxuXHRnZXRIb3N0TGFiZWwoc2NoZW1lOiBzdHJpbmcsIGF1dGhvcml0eT86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZm9ybWF0dGVyID0gdGhpcy5maW5kRm9ybWF0dGluZyhVUkkuZnJvbSh7IHNjaGVtZSwgYXV0aG9yaXR5IH0pKTtcblxuXHRcdHJldHVybiBmb3JtYXR0ZXI/LndvcmtzcGFjZVN1ZmZpeCB8fCBhdXRob3JpdHkgfHwgJyc7XG5cdH1cblxuXHRnZXRIb3N0VG9vbHRpcChzY2hlbWU6IHN0cmluZywgYXV0aG9yaXR5Pzogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmb3JtYXR0ZXIgPSB0aGlzLmZpbmRGb3JtYXR0aW5nKFVSSS5mcm9tKHsgc2NoZW1lLCBhdXRob3JpdHkgfSkpO1xuXG5cdFx0cmV0dXJuIGZvcm1hdHRlcj8ud29ya3NwYWNlVG9vbHRpcDtcblx0fVxuXG5cdHJlZ2lzdGVyQ2FjaGVkRm9ybWF0dGVyKGZvcm1hdHRlcjogUmVzb3VyY2VMYWJlbEZvcm1hdHRlcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBsaXN0ID0gdGhpcy5zdG9yZWRGb3JtYXR0ZXJzLmZvcm1hdHRlcnMgPz89IFtdO1xuXG5cdFx0bGV0IHJlcGxhY2UgPSBsaXN0LmZpbmRJbmRleChmID0+IGYuc2NoZW1lID09PSBmb3JtYXR0ZXIuc2NoZW1lICYmIGYuYXV0aG9yaXR5ID09PSBmb3JtYXR0ZXIuYXV0aG9yaXR5KTtcblx0XHRpZiAocmVwbGFjZSA9PT0gLTEgJiYgbGlzdC5sZW5ndGggPj0gRk9STUFUVEVSX0NBQ0hFX1NJWkUpIHtcblx0XHRcdHJlcGxhY2UgPSBGT1JNQVRURVJfQ0FDSEVfU0laRSAtIDE7IC8vIGF0IG1heCBjYXBhY2l0eSwgcmVwbGFjZSB0aGUgbGFzdCBlbGVtZW50XG5cdFx0fVxuXG5cdFx0aWYgKHJlcGxhY2UgPT09IC0xKSB7XG5cdFx0XHRsaXN0LnVuc2hpZnQoZm9ybWF0dGVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChsZXQgaSA9IHJlcGxhY2U7IGkgPiAwOyBpLS0pIHtcblx0XHRcdFx0bGlzdFtpXSA9IGxpc3RbaSAtIDFdO1xuXHRcdFx0fVxuXHRcdFx0bGlzdFswXSA9IGZvcm1hdHRlcjtcblx0XHR9XG5cblx0XHR0aGlzLnN0b3JlZEZvcm1hdHRlcnNNZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cblx0XHRyZXR1cm4gdGhpcy5yZWdpc3RlckZvcm1hdHRlcihmb3JtYXR0ZXIpO1xuXHR9XG5cblx0cmVnaXN0ZXJGb3JtYXR0ZXIoZm9ybWF0dGVyOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuZm9ybWF0dGVycy5wdXNoKGZvcm1hdHRlcik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VGb3JtYXR0ZXJzLmZpcmUoeyBzY2hlbWU6IGZvcm1hdHRlci5zY2hlbWUgfSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmZvcm1hdHRlcnMgPSB0aGlzLmZvcm1hdHRlcnMuZmlsdGVyKGYgPT4gZiAhPT0gZm9ybWF0dGVyKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGb3JtYXR0ZXJzLmZpcmUoeyBzY2hlbWU6IGZvcm1hdHRlci5zY2hlbWUgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0VXJpKHJlc291cmNlOiBVUkksIGZvcm1hdHRpbmc6IFJlc291cmNlTGFiZWxGb3JtYXR0aW5nLCBmb3JjZU5vVGlsZGlmeT86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGxldCBsYWJlbCA9IGZvcm1hdHRpbmcubGFiZWwucmVwbGFjZShsYWJlbE1hdGNoaW5nUmVnZXhwLCAobWF0Y2gsIHRva2VuLCBxc1Rva2VuLCBxc1ZhbHVlKSA9PiB7XG5cdFx0XHRzd2l0Y2ggKHRva2VuKSB7XG5cdFx0XHRcdGNhc2UgJ3NjaGVtZSc6IHJldHVybiByZXNvdXJjZS5zY2hlbWU7XG5cdFx0XHRcdGNhc2UgJ2F1dGhvcml0eSc6IHJldHVybiByZXNvdXJjZS5hdXRob3JpdHk7XG5cdFx0XHRcdGNhc2UgJ2F1dGhvcml0eVN1ZmZpeCc6IHtcblx0XHRcdFx0XHRjb25zdCBpID0gcmVzb3VyY2UuYXV0aG9yaXR5LmluZGV4T2YoJysnKTtcblx0XHRcdFx0XHRyZXR1cm4gaSA9PT0gLTEgPyByZXNvdXJjZS5hdXRob3JpdHkgOiByZXNvdXJjZS5hdXRob3JpdHkuc2xpY2UoaSArIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ3BhdGgnOiB7XG5cdFx0XHRcdFx0bGV0IHBhdGhWYWx1ZSA9IHJlc291cmNlLnBhdGg7XG5cdFx0XHRcdFx0aWYgKGZvcm1hdHRpbmcuc3RyaXBQYXRoU2VnbWVudHMpIHtcblx0XHRcdFx0XHRcdGxldCBwb3MgPSAwO1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmb3JtYXR0aW5nLnN0cmlwUGF0aFNlZ21lbnRzOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbmV4dCA9IHBhdGhWYWx1ZS5pbmRleE9mKCcvJywgcG9zICsgMSk7XG5cdFx0XHRcdFx0XHRcdGlmIChuZXh0ID09PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHBvcyA9IG5leHQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwYXRoVmFsdWUgPSBwYXRoVmFsdWUuc3Vic3RyaW5nKHBvcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBmb3JtYXR0aW5nLnN0cmlwUGF0aFN0YXJ0aW5nU2VwYXJhdG9yXG5cdFx0XHRcdFx0XHQ/IHBhdGhWYWx1ZS5zbGljZShwYXRoVmFsdWVbMF0gPT09IGZvcm1hdHRpbmcuc2VwYXJhdG9yID8gMSA6IDApXG5cdFx0XHRcdFx0XHQ6IHBhdGhWYWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0aWYgKHFzVG9rZW4gPT09ICdxdWVyeScpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHsgcXVlcnkgfSA9IHJlc291cmNlO1xuXHRcdFx0XHRcdFx0aWYgKHF1ZXJ5ICYmIHF1ZXJ5WzBdID09PSAneycgJiYgcXVlcnlbcXVlcnkubGVuZ3RoIC0gMV0gPT09ICd9Jykge1xuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKHF1ZXJ5KVtxc1ZhbHVlXSB8fCAnJztcblx0XHRcdFx0XHRcdFx0fSBjYXRjaCB7IH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIGNvbnZlcnQgXFxjOlxcc29tZXRoaW5nID0+IEM6XFxzb21ldGhpbmdcblx0XHRpZiAoZm9ybWF0dGluZy5ub3JtYWxpemVEcml2ZUxldHRlciAmJiBoYXNEcml2ZUxldHRlcklnbm9yZVBsYXRmb3JtKGxhYmVsKSkge1xuXHRcdFx0bGFiZWwgPSBsYWJlbC5jaGFyQXQoMSkudG9VcHBlckNhc2UoKSArIGxhYmVsLnN1YnN0cigyKTtcblx0XHR9XG5cblx0XHRpZiAoZm9ybWF0dGluZy50aWxkaWZ5ICYmICFmb3JjZU5vVGlsZGlmeSkge1xuXHRcdFx0aWYgKHRoaXMudXNlckhvbWUpIHtcblx0XHRcdFx0bGFiZWwgPSB0aWxkaWZ5KGxhYmVsLCB0aGlzLnVzZXJIb21lLmZzUGF0aCwgdGhpcy5vcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGZvcm1hdHRpbmcuYXV0aG9yaXR5UHJlZml4ICYmIHJlc291cmNlLmF1dGhvcml0eSkge1xuXHRcdFx0bGFiZWwgPSBmb3JtYXR0aW5nLmF1dGhvcml0eVByZWZpeCArIGxhYmVsO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmFkanVzdFBhdGhTZXBhcmF0b3JzKGxhYmVsLCBmb3JtYXR0aW5nLnNlcGFyYXRvcik7XG5cdH1cblxuXHRwcml2YXRlIGFkanVzdFBhdGhTZXBhcmF0b3JzKGxhYmVsOiBzdHJpbmcsIHNlcGFyYXRvcjogJy8nIHwgJ1xcXFwnIHwgJycpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsYWJlbC5yZXBsYWNlKHRoaXMub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gd2luUGF0aFNlcGFyYXRvclJlZ2V4cCA6IHBvc2l4UGF0aFNlcGFyYXRvclJlZ2V4cCwgc2VwYXJhdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kV29ya3NwYWNlU3VmZml4KGxhYmVsOiBzdHJpbmcsIHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRjb25zdCBmb3JtYXR0aW5nID0gdGhpcy5maW5kRm9ybWF0dGluZyh1cmkpO1xuXHRcdGNvbnN0IHN1ZmZpeCA9IGZvcm1hdHRpbmcgJiYgKHR5cGVvZiBmb3JtYXR0aW5nLndvcmtzcGFjZVN1ZmZpeCA9PT0gJ3N0cmluZycpID8gZm9ybWF0dGluZy53b3Jrc3BhY2VTdWZmaXggOiB1bmRlZmluZWQ7XG5cblx0XHRyZXR1cm4gc3VmZml4ID8gYCR7bGFiZWx9IFske3N1ZmZpeH1dYCA6IGxhYmVsO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElMYWJlbFNlcnZpY2UsIExhYmVsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFzQixZQUFZLGVBQWU7QUFDakQsU0FBUyxPQUFPLEtBQUssYUFBYTtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjLDJCQUFvRjtBQUMzRyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDBCQUFzQyxhQUErQyxtQ0FBbUMsdUJBQTZDLHVCQUF1QixxQkFBcUIscUJBQXFCLDRCQUE0QjtBQUMzUSxTQUFTLHFCQUFxQixVQUFVLFVBQVUsZUFBZTtBQUNqRSxTQUFTLFNBQVMsb0JBQW9CO0FBQ3RDLFNBQVMsZUFBdUYsaUJBQWlCO0FBQ2pILFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsYUFBYTtBQUN0QixTQUFTLG1CQUFtQixzQkFBc0I7QUFDbEQsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsaUJBQWlCLFVBQVU7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsZUFBZTtBQUV4QixNQUFNLGtDQUFrQyxtQkFBbUIsdUJBQWlEO0FBQUEsRUFDM0csZ0JBQWdCO0FBQUEsRUFDaEIsWUFBWTtBQUFBLElBQ1gsYUFBYSxTQUFTLHdEQUF3RCw4Q0FBOEM7QUFBQSxJQUM1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
