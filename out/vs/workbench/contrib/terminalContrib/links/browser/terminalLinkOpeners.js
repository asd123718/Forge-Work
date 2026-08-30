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
import { Schemas } from "../../../../../base/common/network.js";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import { URI } from "../../../../../base/common/uri.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { TerminalBuiltinLinkType } from "./links.js";
import { osPathModule, updateLinkWithRelativeCwd } from "./terminalLinkHelpers.js";
import { getTerminalLinkType } from "./terminalLocalLinkDetector.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { QueryBuilder } from "../../../../services/search/common/queryBuilder.js";
import { ISearchService } from "../../../../services/search/common/search.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { detectLinks, getLinkSuffix } from "./terminalLinkParsing.js";
import { ITerminalLogService } from "../../../../../platform/terminal/common/terminal.js";
let TerminalLocalFileLinkOpener = class {
  constructor(_editorService) {
    this._editorService = _editorService;
  }
  async open(link) {
    if (!link.uri) {
      throw new Error("Tried to open file link without a resolved URI");
    }
    const linkSuffix = link.parsedLink ? link.parsedLink.suffix : getLinkSuffix(link.text);
    let selection = link.selection;
    if (!selection) {
      selection = linkSuffix?.row === void 0 ? void 0 : {
        startLineNumber: linkSuffix.row ?? 1,
        startColumn: linkSuffix.col ?? 1,
        endLineNumber: linkSuffix.rowEnd,
        endColumn: linkSuffix.colEnd
      };
    }
    await this._editorService.openEditor({
      resource: link.uri,
      options: { pinned: true, selection, revealIfOpened: true }
    });
  }
};
TerminalLocalFileLinkOpener = __decorateClass([
  __decorateParam(0, IEditorService)
], TerminalLocalFileLinkOpener);
let TerminalLocalFolderInWorkspaceLinkOpener = class {
  constructor(_commandService) {
    this._commandService = _commandService;
  }
  async open(link) {
    if (!link.uri) {
      throw new Error("Tried to open folder in workspace link without a resolved URI");
    }
    await this._commandService.executeCommand("revealInExplorer", link.uri);
  }
};
TerminalLocalFolderInWorkspaceLinkOpener = __decorateClass([
  __decorateParam(0, ICommandService)
], TerminalLocalFolderInWorkspaceLinkOpener);
let TerminalLocalFolderOutsideWorkspaceLinkOpener = class {
  constructor(_hostService) {
    this._hostService = _hostService;
  }
  async open(link) {
    if (!link.uri) {
      throw new Error("Tried to open folder in workspace link without a resolved URI");
    }
    this._hostService.openWindow([{ folderUri: link.uri }], { forceNewWindow: true });
  }
};
TerminalLocalFolderOutsideWorkspaceLinkOpener = __decorateClass([
  __decorateParam(0, IHostService)
], TerminalLocalFolderOutsideWorkspaceLinkOpener);
let TerminalSearchLinkOpener = class {
  constructor(_capabilities, _initialCwd, _localFileOpener, _localFolderInWorkspaceOpener, _getOS, _fileService, instantiationService, _quickInputService, _searchService, _logService, _workbenchEnvironmentService, _workspaceContextService) {
    this._capabilities = _capabilities;
    this._initialCwd = _initialCwd;
    this._localFileOpener = _localFileOpener;
    this._localFolderInWorkspaceOpener = _localFolderInWorkspaceOpener;
    this._getOS = _getOS;
    this._fileService = _fileService;
    this._quickInputService = _quickInputService;
    this._searchService = _searchService;
    this._logService = _logService;
    this._workbenchEnvironmentService = _workbenchEnvironmentService;
    this._workspaceContextService = _workspaceContextService;
    this._fileQueryBuilder = instantiationService.createInstance(QueryBuilder);
  }
  async open(link) {
    const osPath = osPathModule(this._getOS());
    const pathSeparator = osPath.sep;
    let text = link.text.replace(/^file:\/\/\/?/, "");
    text = osPath.normalize(text).replace(/^(\.+[\\/])+/, "");
    if (link.contextLine) {
      const iso8601Pattern = /:\d{2}:\d{2}[+-]\d{2}:\d{2}\.[a-z]+/;
      if (!iso8601Pattern.test(link.text)) {
        const parsedLinks = detectLinks(link.contextLine, this._getOS());
        const matchingParsedLink = parsedLinks.find((parsedLink) => parsedLink.suffix && link.text.startsWith(parsedLink.path.text));
        if (matchingParsedLink) {
          if (matchingParsedLink.suffix?.row !== void 0) {
            text = matchingParsedLink.path.text;
            text += `:${matchingParsedLink.suffix.row}`;
            if (matchingParsedLink.suffix?.col !== void 0) {
              text += `:${matchingParsedLink.suffix.col}`;
            }
          }
        }
      }
    }
    text = text.replace(/:[^\\/\d][^\d]*$/, "");
    text = text.replace(/\.$/, "");
    this._workspaceContextService.getWorkspace().folders.forEach((folder) => {
      if (text.substring(0, folder.name.length + 1) === folder.name + pathSeparator) {
        text = text.substring(folder.name.length + 1);
        return;
      }
    });
    let cwdResolvedText = text;
    if (this._capabilities.has(TerminalCapability.CommandDetection)) {
      cwdResolvedText = updateLinkWithRelativeCwd(this._capabilities, link.bufferRange.start.y, text, osPath, this._logService)?.[0] || text;
    }
    if (await this._tryOpenExactLink(cwdResolvedText, link)) {
      return;
    }
    if (text !== cwdResolvedText) {
      if (await this._tryOpenExactLink(text, link)) {
        return;
      }
    }
    return this._quickInputService.quickAccess.show(text);
  }
  async _getExactMatch(sanitizedLink) {
    const os = this._getOS();
    const pathModule = osPathModule(os);
    const isAbsolute = pathModule.isAbsolute(sanitizedLink);
    let absolutePath = isAbsolute ? sanitizedLink : void 0;
    if (!isAbsolute && this._initialCwd.length > 0) {
      absolutePath = pathModule.join(this._initialCwd, sanitizedLink);
    }
    let resourceMatch;
    if (absolutePath) {
      let normalizedAbsolutePath = absolutePath;
      if (os === OperatingSystem.Windows) {
        normalizedAbsolutePath = absolutePath.replace(/\\/g, "/");
        if (normalizedAbsolutePath.match(/[a-z]:/i)) {
          normalizedAbsolutePath = `/${normalizedAbsolutePath}`;
        }
      }
      let uri;
      if (this._workbenchEnvironmentService.remoteAuthority) {
        uri = URI.from({
          scheme: Schemas.vscodeRemote,
          authority: this._workbenchEnvironmentService.remoteAuthority,
          path: normalizedAbsolutePath
        });
      } else {
        uri = URI.file(normalizedAbsolutePath);
      }
      try {
        const fileStat = await this._fileService.stat(uri);
        resourceMatch = { uri, isDirectory: fileStat.isDirectory };
      } catch {
      }
    }
    if (!resourceMatch) {
      const results = await this._searchService.fileSearch(
        this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
          filePattern: sanitizedLink,
          maxResults: 2
        })
      );
      if (results.results.length > 0) {
        if (results.results.length === 1) {
          resourceMatch = { uri: results.results[0].resource };
        } else if (!isAbsolute) {
          const results2 = await this._searchService.fileSearch(
            this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
              filePattern: `**/${sanitizedLink}`
            })
          );
          const exactMatches = results2.results.filter((e) => e.resource.toString().endsWith(sanitizedLink));
          if (exactMatches.length === 1) {
            resourceMatch = { uri: exactMatches[0].resource };
          }
        }
      }
    }
    return resourceMatch;
  }
  async _tryOpenExactLink(text, link) {
    const sanitizedLink = text.replace(/:\d+(:\d+)?$/, "");
    try {
      const result = await this._getExactMatch(sanitizedLink);
      if (result) {
        const { uri, isDirectory } = result;
        const linkToOpen = {
          // Use the absolute URI's path here so the optional line/col get detected
          text: result.uri.path + (text.match(/:\d+(:\d+)?$/)?.[0] || ""),
          uri,
          bufferRange: link.bufferRange,
          type: link.type
        };
        if (uri) {
          await (isDirectory ? this._localFolderInWorkspaceOpener.open(linkToOpen) : this._localFileOpener.open(linkToOpen));
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }
};
TerminalSearchLinkOpener = __decorateClass([
  __decorateParam(5, IFileService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IQuickInputService),
  __decorateParam(8, ISearchService),
  __decorateParam(9, ITerminalLogService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IWorkspaceContextService)
], TerminalSearchLinkOpener);
let TerminalUrlLinkOpener = class {
  constructor(_isRemote, _localFileOpener, _localFolderInWorkspaceOpener, _localFolderOutsideWorkspaceOpener, _openerService, _configurationService, _fileService, _uriIdentityService, _workspaceContextService, _logService) {
    this._isRemote = _isRemote;
    this._localFileOpener = _localFileOpener;
    this._localFolderInWorkspaceOpener = _localFolderInWorkspaceOpener;
    this._localFolderOutsideWorkspaceOpener = _localFolderOutsideWorkspaceOpener;
    this._openerService = _openerService;
    this._configurationService = _configurationService;
    this._fileService = _fileService;
    this._uriIdentityService = _uriIdentityService;
    this._workspaceContextService = _workspaceContextService;
    this._logService = _logService;
  }
  async open(link) {
    if (!link.uri) {
      throw new Error("Tried to open a url without a resolved URI");
    }
    if (link.uri.scheme === Schemas.file) {
      return this._openFileSchemeLink(link);
    }
    this._openerService.open(link.text, {
      allowTunneling: this._isRemote && this._configurationService.getValue("remote.forwardOnOpen"),
      allowContributedOpeners: true,
      openExternal: true
    });
  }
  async _openFileSchemeLink(link) {
    if (!link.uri) {
      return;
    }
    try {
      const stat = await this._fileService.stat(link.uri);
      const isDirectory = stat.isDirectory;
      const linkType = getTerminalLinkType(
        link.uri,
        isDirectory,
        this._uriIdentityService,
        this._workspaceContextService
      );
      switch (linkType) {
        case TerminalBuiltinLinkType.LocalFile:
          await this._localFileOpener.open(link);
          return;
        case TerminalBuiltinLinkType.LocalFolderInWorkspace:
          await this._localFolderInWorkspaceOpener.open(link);
          return;
        case TerminalBuiltinLinkType.LocalFolderOutsideWorkspace:
          await this._localFolderOutsideWorkspaceOpener.open(link);
          return;
        case TerminalBuiltinLinkType.Url:
          await this.open(link);
          return;
      }
    } catch (error) {
      this._logService.warn("Open file via native file explorer");
    }
    this._openerService.open(link.text, {
      allowTunneling: this._isRemote && this._configurationService.getValue("remote.forwardOnOpen"),
      allowContributedOpeners: true,
      openExternal: true
    });
  }
};
TerminalUrlLinkOpener = __decorateClass([
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IUriIdentityService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, ITerminalLogService)
], TerminalUrlLinkOpener);
export {
  TerminalLocalFileLinkOpener,
  TerminalLocalFolderInWorkspaceLinkOpener,
  TerminalLocalFolderOutsideWorkspaceLinkOpener,
  TerminalSearchLinkOpener,
  TerminalUrlLinkOpener
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXGJyb3dzZXJcXHRlcm1pbmFsTGlua09wZW5lcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExpbmtPcGVuZXIsIElUZXJtaW5hbFNpbXBsZUxpbmssIFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlIH0gZnJvbSAnLi9saW5rcy5qcyc7XG5pbXBvcnQgeyBvc1BhdGhNb2R1bGUsIHVwZGF0ZUxpbmtXaXRoUmVsYXRpdmVDd2QgfSBmcm9tICcuL3Rlcm1pbmFsTGlua0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgZ2V0VGVybWluYWxMaW5rVHlwZSB9IGZyb20gJy4vdGVybWluYWxMb2NhbExpbmtEZXRlY3Rvci5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9xdWVyeUJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgSVNlYXJjaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGRldGVjdExpbmtzLCBnZXRMaW5rU3VmZml4IH0gZnJvbSAnLi90ZXJtaW5hbExpbmtQYXJzaW5nLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyIGltcGxlbWVudHMgSVRlcm1pbmFsTGlua09wZW5lciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhc3luYyBvcGVuKGxpbms6IElUZXJtaW5hbFNpbXBsZUxpbmspOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWxpbmsudXJpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyaWVkIHRvIG9wZW4gZmlsZSBsaW5rIHdpdGhvdXQgYSByZXNvbHZlZCBVUkknKTtcblx0XHR9XG5cdFx0Y29uc3QgbGlua1N1ZmZpeCA9IGxpbmsucGFyc2VkTGluayA/IGxpbmsucGFyc2VkTGluay5zdWZmaXggOiBnZXRMaW5rU3VmZml4KGxpbmsudGV4dCk7XG5cdFx0bGV0IHNlbGVjdGlvbjogSVRleHRFZGl0b3JTZWxlY3Rpb24gfCB1bmRlZmluZWQgPSBsaW5rLnNlbGVjdGlvbjtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0c2VsZWN0aW9uID0gbGlua1N1ZmZpeD8ucm93ID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogbGlua1N1ZmZpeC5yb3cgPz8gMSxcblx0XHRcdFx0c3RhcnRDb2x1bW46IGxpbmtTdWZmaXguY29sID8/IDEsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IGxpbmtTdWZmaXgucm93RW5kLFxuXHRcdFx0XHRlbmRDb2x1bW46IGxpbmtTdWZmaXguY29sRW5kXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IGxpbmsudXJpLFxuXHRcdFx0b3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIHNlbGVjdGlvbiwgcmV2ZWFsSWZPcGVuZWQ6IHRydWUgfVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyIGltcGxlbWVudHMgSVRlcm1pbmFsTGlua09wZW5lciB7XG5cdGNvbnN0cnVjdG9yKEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSkge1xuXHR9XG5cblx0YXN5bmMgb3BlbihsaW5rOiBJVGVybWluYWxTaW1wbGVMaW5rKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFsaW5rLnVyaSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUcmllZCB0byBvcGVuIGZvbGRlciBpbiB3b3Jrc3BhY2UgbGluayB3aXRob3V0IGEgcmVzb2x2ZWQgVVJJJyk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdyZXZlYWxJbkV4cGxvcmVyJywgbGluay51cmkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbExvY2FsRm9sZGVyT3V0c2lkZVdvcmtzcGFjZUxpbmtPcGVuZXIgaW1wbGVtZW50cyBJVGVybWluYWxMaW5rT3BlbmVyIHtcblx0Y29uc3RydWN0b3IoQElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlKSB7XG5cdH1cblxuXHRhc3luYyBvcGVuKGxpbms6IElUZXJtaW5hbFNpbXBsZUxpbmspOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWxpbmsudXJpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyaWVkIHRvIG9wZW4gZm9sZGVyIGluIHdvcmtzcGFjZSBsaW5rIHdpdGhvdXQgYSByZXNvbHZlZCBVUkknKTtcblx0XHR9XG5cdFx0dGhpcy5faG9zdFNlcnZpY2Uub3BlbldpbmRvdyhbeyBmb2xkZXJVcmk6IGxpbmsudXJpIH1dLCB7IGZvcmNlTmV3V2luZG93OiB0cnVlIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIgaW1wbGVtZW50cyBJVGVybWluYWxMaW5rT3BlbmVyIHtcblx0cHJvdGVjdGVkIF9maWxlUXVlcnlCdWlsZGVyOiBRdWVyeUJ1aWxkZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2FwYWJpbGl0aWVzOiBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW5pdGlhbEN3ZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsRmlsZU9wZW5lcjogVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsRm9sZGVySW5Xb3Jrc3BhY2VPcGVuZXI6IFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0T1M6ICgpID0+IE9wZXJhdGluZ1N5c3RlbSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVNlYXJjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2VhcmNoU2VydmljZTogSVNlYXJjaFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9maWxlUXVlcnlCdWlsZGVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVlcnlCdWlsZGVyKTtcblx0fVxuXG5cdGFzeW5jIG9wZW4obGluazogSVRlcm1pbmFsU2ltcGxlTGluayk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9zUGF0aCA9IG9zUGF0aE1vZHVsZSh0aGlzLl9nZXRPUygpKTtcblx0XHRjb25zdCBwYXRoU2VwYXJhdG9yID0gb3NQYXRoLnNlcDtcblxuXHRcdC8vIFJlbW92ZSBmaWxlOi8vLyBhbmQgYW55IGxlYWRpbmcgLi8gb3IgLi4vIHNpbmNlIHF1aWNrIGFjY2VzcyBkb2Vzbid0IHVuZGVyc3RhbmQgdGhhdCBmb3JtYXRcblx0XHRsZXQgdGV4dCA9IGxpbmsudGV4dC5yZXBsYWNlKC9eZmlsZTpcXC9cXC9cXC8/LywgJycpO1xuXHRcdHRleHQgPSBvc1BhdGgubm9ybWFsaXplKHRleHQpLnJlcGxhY2UoL14oXFwuK1tcXFxcL10pKy8sICcnKTtcblxuXHRcdC8vIFRyeSBleHRyYWN0IGFueSB0cmFpbGluZyBsaW5lIGFuZCBjb2x1bW4gbnVtYmVycyBieSBtYXRjaGluZyB0aGUgdGV4dCBhZ2FpbnN0IHBhcnNlZFxuXHRcdC8vIGxpbmtzLiBUaGlzIHdpbGwgZ2l2ZSBhIHNlYXJjaCBsaW5rIGBmb29gIG9uIGEgbGluZSBsaWtlIGBcImZvb1wiLCBsaW5lIDEwYCB0byBvcGVuIHRoZVxuXHRcdC8vIHF1aWNrIHBpY2sgd2l0aCBgZm9vOjEwYCBhcyB0aGUgY29udGVudHMuXG5cdFx0Ly9cblx0XHQvLyBUaGlzIGFsc28gbm9ybWFsaXplcyB0aGUgcGF0aCB0byByZW1vdmUgc3VmZml4ZXMgbGlrZSA6MTAgb3IgOjUuMC00XG5cdFx0aWYgKGxpbmsuY29udGV4dExpbmUpIHtcblx0XHRcdC8vIFNraXAgc3VmZml4IHBhcnNpbmcgaWYgdGhlIHRleHQgbG9va3MgbGlrZSBpdCBjb250YWlucyBhbiBJU08gODYwMSB0aW1lc3RhbXAgZm9ybWF0XG5cdFx0XHRjb25zdCBpc284NjAxUGF0dGVybiA9IC86XFxkezJ9OlxcZHsyfVsrLV1cXGR7Mn06XFxkezJ9XFwuW2Etel0rLztcblx0XHRcdGlmICghaXNvODYwMVBhdHRlcm4udGVzdChsaW5rLnRleHQpKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZExpbmtzID0gZGV0ZWN0TGlua3MobGluay5jb250ZXh0TGluZSwgdGhpcy5fZ2V0T1MoKSk7XG5cdFx0XHRcdC8vIE9wdGltaXN0aWNhbGx5IGNoZWNrIHRoYXQgdGhlIGxpbmsgX3N0YXJ0cyB3aXRoXyB0aGUgcGFyc2VkIGxpbmsgdGV4dC4gSWYgc28sXG5cdFx0XHRcdC8vIGNvbnRpbnVlIHRvIHVzZSB0aGUgcGFyc2VkIGxpbmtcblx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdQYXJzZWRMaW5rID0gcGFyc2VkTGlua3MuZmluZChwYXJzZWRMaW5rID0+IHBhcnNlZExpbmsuc3VmZml4ICYmIGxpbmsudGV4dC5zdGFydHNXaXRoKHBhcnNlZExpbmsucGF0aC50ZXh0KSk7XG5cdFx0XHRcdGlmIChtYXRjaGluZ1BhcnNlZExpbmspIHtcblx0XHRcdFx0XHRpZiAobWF0Y2hpbmdQYXJzZWRMaW5rLnN1ZmZpeD8ucm93ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdC8vIE5vcm1hbGl6ZSB0aGUgcGF0aCBiYXNlZCBvbiB0aGUgcGFyc2VkIGxpbmtcblx0XHRcdFx0XHRcdHRleHQgPSBtYXRjaGluZ1BhcnNlZExpbmsucGF0aC50ZXh0O1xuXHRcdFx0XHRcdFx0dGV4dCArPSBgOiR7bWF0Y2hpbmdQYXJzZWRMaW5rLnN1ZmZpeC5yb3d9YDtcblx0XHRcdFx0XHRcdGlmIChtYXRjaGluZ1BhcnNlZExpbmsuc3VmZml4Py5jb2wgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHR0ZXh0ICs9IGA6JHttYXRjaGluZ1BhcnNlZExpbmsuc3VmZml4LmNvbH1gO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBgOjxvbmUgb3IgbW9yZSBub24gbnVtYmVyIGNoYXJhY3RlcnM+YCBmcm9tIHRoZSBlbmQgb2YgdGhlIGxpbmsuXG5cdFx0Ly8gRXhhbXBsZXM6XG5cdFx0Ly8gLSBSdWJ5IHN0YWNrIHRyYWNlczogPGxpbms+OmluIC4uLlxuXHRcdC8vIC0gR3JlcCBvdXRwdXQ6IDxsaW5rPjo8cmVzdWx0IGxpbmU+XG5cdFx0Ly8gVGhpcyBvbmx5IGhhcHBlbnMgd2hlbiB0aGUgY29sb24gaXMgX25vdF8gZm9sbG93ZWQgYnkgYSBmb3J3YXJkLSBvciBiYWNrLXNsYXNoIGFzIHRoYXRcblx0XHQvLyB3b3VsZCBicmVhayBhYnNvbHV0ZSBXaW5kb3dzIHBhdGhzIChlZy4gYEM6L1VzZXJzLy4uLmApLlxuXHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoLzpbXlxcXFwvXFxkXVteXFxkXSokLywgJycpO1xuXG5cdFx0Ly8gUmVtb3ZlIGFueSB0cmFpbGluZyBwZXJpb2RzIGFmdGVyIHRoZSBsaW5lL2NvbHVtbiBudW1iZXJzLCB0byBwcmV2ZW50IGJyZWFraW5nIHRoZSBzZWFyY2ggZmVhdHVyZSwgIzIwMDI1N1xuXHRcdC8vIEV4YW1wbGVzOlxuXHRcdC8vIFwiQ2hlY2sgeW91ciBjb2RlIFRlc3QudHN4OjEyOjQ1LlwiIC0+IFRlc3QudHN4OjEyOjQ1XG5cdFx0Ly8gXCJDaGVjayB5b3VyIGNvZGUgVGVzdC50c3g6MTIuXCIgLT4gVGVzdC50c3g6MTJcblxuXHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoL1xcLiQvLCAnJyk7XG5cblx0XHQvLyBJZiBhbnkgb2YgdGhlIG5hbWVzIG9mIHRoZSBmb2xkZXJzIGluIHRoZSB3b3Jrc3BhY2UgbWF0Y2hlc1xuXHRcdC8vIGEgcHJlZml4IG9mIHRoZSBsaW5rLCByZW1vdmUgdGhhdCBwcmVmaXggYW5kIGNvbnRpbnVlXG5cdFx0dGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5mb3JFYWNoKChmb2xkZXIpID0+IHtcblx0XHRcdGlmICh0ZXh0LnN1YnN0cmluZygwLCBmb2xkZXIubmFtZS5sZW5ndGggKyAxKSA9PT0gZm9sZGVyLm5hbWUgKyBwYXRoU2VwYXJhdG9yKSB7XG5cdFx0XHRcdHRleHQgPSB0ZXh0LnN1YnN0cmluZyhmb2xkZXIubmFtZS5sZW5ndGggKyAxKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGxldCBjd2RSZXNvbHZlZFRleHQgPSB0ZXh0O1xuXHRcdGlmICh0aGlzLl9jYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSkge1xuXHRcdFx0Y3dkUmVzb2x2ZWRUZXh0ID0gdXBkYXRlTGlua1dpdGhSZWxhdGl2ZUN3ZCh0aGlzLl9jYXBhYmlsaXRpZXMsIGxpbmsuYnVmZmVyUmFuZ2Uuc3RhcnQueSwgdGV4dCwgb3NQYXRoLCB0aGlzLl9sb2dTZXJ2aWNlKT8uWzBdIHx8IHRleHQ7XG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IG9wZW4gdGhlIGN3ZCByZXNvbHZlZCBsaW5rIGZpcnN0XG5cdFx0aWYgKGF3YWl0IHRoaXMuX3RyeU9wZW5FeGFjdExpbmsoY3dkUmVzb2x2ZWRUZXh0LCBsaW5rKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBjd2QgcmVzb2x2ZWQgdGV4dCBkaWRuJ3QgbWF0Y2gsIHRyeSBmaW5kIHRoZSBsaW5rIHdpdGhvdXQgdGhlIGN3ZCByZXNvbHZlZCwgZm9yXG5cdFx0Ly8gZXhhbXBsZSB3aGVuIGEgY29tbWFuZCBwcmludHMgcGF0aHMgaW4gYSBzdWItZGlyZWN0b3J5IG9mIHRoZSBjdXJyZW50IGN3ZFxuXHRcdGlmICh0ZXh0ICE9PSBjd2RSZXNvbHZlZFRleHQpIHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl90cnlPcGVuRXhhY3RMaW5rKHRleHQsIGxpbmspKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGYWxsYmFjayB0byBzZWFyY2hpbmcgcXVpY2sgYWNjZXNzXG5cdFx0cmV0dXJuIHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3codGV4dCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRFeGFjdE1hdGNoKHNhbml0aXplZExpbms6IHN0cmluZyk6IFByb21pc2U8SVJlc291cmNlTWF0Y2ggfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBNYWtlIHRoZSBsaW5rIHJlbGF0aXZlIHRvIHRoZSBjd2QgaWYgaXQgaXNuJ3QgYWJzb2x1dGVcblx0XHRjb25zdCBvcyA9IHRoaXMuX2dldE9TKCk7XG5cdFx0Y29uc3QgcGF0aE1vZHVsZSA9IG9zUGF0aE1vZHVsZShvcyk7XG5cdFx0Y29uc3QgaXNBYnNvbHV0ZSA9IHBhdGhNb2R1bGUuaXNBYnNvbHV0ZShzYW5pdGl6ZWRMaW5rKTtcblx0XHRsZXQgYWJzb2x1dGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBpc0Fic29sdXRlID8gc2FuaXRpemVkTGluayA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIWlzQWJzb2x1dGUgJiYgdGhpcy5faW5pdGlhbEN3ZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRhYnNvbHV0ZVBhdGggPSBwYXRoTW9kdWxlLmpvaW4odGhpcy5faW5pdGlhbEN3ZCwgc2FuaXRpemVkTGluayk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IG9wZW4gYXMgYW4gYWJzb2x1dGUgbGlua1xuXHRcdGxldCByZXNvdXJjZU1hdGNoOiBJUmVzb3VyY2VNYXRjaCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYWJzb2x1dGVQYXRoKSB7XG5cdFx0XHRsZXQgbm9ybWFsaXplZEFic29sdXRlUGF0aDogc3RyaW5nID0gYWJzb2x1dGVQYXRoO1xuXHRcdFx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0XHRub3JtYWxpemVkQWJzb2x1dGVQYXRoID0gYWJzb2x1dGVQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcblx0XHRcdFx0aWYgKG5vcm1hbGl6ZWRBYnNvbHV0ZVBhdGgubWF0Y2goL1thLXpdOi9pKSkge1xuXHRcdFx0XHRcdG5vcm1hbGl6ZWRBYnNvbHV0ZVBhdGggPSBgLyR7bm9ybWFsaXplZEFic29sdXRlUGF0aH1gO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRsZXQgdXJpOiBVUkk7XG5cdFx0XHRpZiAodGhpcy5fd29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHR1cmkgPSBVUkkuZnJvbSh7XG5cdFx0XHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSxcblx0XHRcdFx0XHRhdXRob3JpdHk6IHRoaXMuX3dvcmtiZW5jaEVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdFx0cGF0aDogbm9ybWFsaXplZEFic29sdXRlUGF0aFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVyaSA9IFVSSS5maWxlKG5vcm1hbGl6ZWRBYnNvbHV0ZVBhdGgpO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5zdGF0KHVyaSk7XG5cdFx0XHRcdHJlc291cmNlTWF0Y2ggPSB7IHVyaSwgaXNEaXJlY3Rvcnk6IGZpbGVTdGF0LmlzRGlyZWN0b3J5IH07XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gRmlsZSBvciBkaXIgZG9lc24ndCBleGlzdCwgY29udGludWUgb25cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZWFyY2ggdGhlIHdvcmtzcGFjZSBpZiBhbiBleGFjdCBtYXRjaCBiYXNlZCBvbiB0aGUgYWJzb2x1dGUgcGF0aCB3YXMgbm90IGZvdW5kXG5cdFx0aWYgKCFyZXNvdXJjZU1hdGNoKSB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5fc2VhcmNoU2VydmljZS5maWxlU2VhcmNoKFxuXHRcdFx0XHR0aGlzLl9maWxlUXVlcnlCdWlsZGVyLmZpbGUodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycywge1xuXHRcdFx0XHRcdGZpbGVQYXR0ZXJuOiBzYW5pdGl6ZWRMaW5rLFxuXHRcdFx0XHRcdG1heFJlc3VsdHM6IDJcblx0XHRcdFx0fSlcblx0XHRcdCk7XG5cdFx0XHRpZiAocmVzdWx0cy5yZXN1bHRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0aWYgKHJlc3VsdHMucmVzdWx0cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHQvLyBJZiB0aGVyZSdzIGV4YWN0bHkgMSBzZWFyY2ggcmVzdWx0LCByZXR1cm4gaXQgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0J3Ncblx0XHRcdFx0XHQvLyBleGFjdCBvciBwYXJ0aWFsLlxuXHRcdFx0XHRcdHJlc291cmNlTWF0Y2ggPSB7IHVyaTogcmVzdWx0cy5yZXN1bHRzWzBdLnJlc291cmNlIH07XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWlzQWJzb2x1dGUpIHtcblx0XHRcdFx0XHQvLyBGb3Igbm9uLWFic29sdXRlIGxpbmtzLCBleGFjdCBsaW5rIG1hdGNoaW5nIGlzIGFsbG93ZWQgb25seSBpZiB0aGVyZSBpcyBhIHNpbmdsZSBhbiBleGFjdFxuXHRcdFx0XHRcdC8vIGZpbGUgbWF0Y2guIEZvciBleGFtcGxlIHNlYXJjaGluZyBmb3IgYGZvby50eHRgIHdoZW4gdGhlcmUgaXMgbm8gY3dkIGluZm9ybWF0aW9uXG5cdFx0XHRcdFx0Ly8gYXZhaWxhYmxlIChpZS4gb25seSB0aGUgaW5pdGlhbCBjd2QpIHNob3VsZCBvcGVuIHRoZSBmaWxlIGRpcmVjdGx5IG9ubHkgaWYgdGhlcmUgaXMgYVxuXHRcdFx0XHRcdC8vIHNpbmdsZSBmaWxlIG5hbWVzIGBmb28udHh0YCBhbnl3aGVyZSB3aXRoaW4gdGhlIGZvbGRlci4gVGhlc2Ugc2FtZSBydWxlcyBhcHBseSB0b1xuXHRcdFx0XHRcdC8vIHJlbGF0aXZlIHBhdGhzIHdpdGggZm9sZGVycyBzdWNoIGFzIGBzcmMvZm9vLnR4dGAuXG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuX3NlYXJjaFNlcnZpY2UuZmlsZVNlYXJjaChcblx0XHRcdFx0XHRcdHRoaXMuX2ZpbGVRdWVyeUJ1aWxkZXIuZmlsZSh0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLCB7XG5cdFx0XHRcdFx0XHRcdGZpbGVQYXR0ZXJuOiBgKiovJHtzYW5pdGl6ZWRMaW5rfWBcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHQvLyBGaW5kIGFuIGV4YWN0IG1hdGNoIGlmIGl0IGV4aXN0c1xuXHRcdFx0XHRcdGNvbnN0IGV4YWN0TWF0Y2hlcyA9IHJlc3VsdHMucmVzdWx0cy5maWx0ZXIoZSA9PiBlLnJlc291cmNlLnRvU3RyaW5nKCkuZW5kc1dpdGgoc2FuaXRpemVkTGluaykpO1xuXHRcdFx0XHRcdGlmIChleGFjdE1hdGNoZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZU1hdGNoID0geyB1cmk6IGV4YWN0TWF0Y2hlc1swXS5yZXNvdXJjZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzb3VyY2VNYXRjaDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3RyeU9wZW5FeGFjdExpbmsodGV4dDogc3RyaW5nLCBsaW5rOiBJVGVybWluYWxTaW1wbGVMaW5rKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgc2FuaXRpemVkTGluayA9IHRleHQucmVwbGFjZSgvOlxcZCsoOlxcZCspPyQvLCAnJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dldEV4YWN0TWF0Y2goc2FuaXRpemVkTGluayk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvbnN0IHsgdXJpLCBpc0RpcmVjdG9yeSB9ID0gcmVzdWx0O1xuXHRcdFx0XHRjb25zdCBsaW5rVG9PcGVuID0ge1xuXHRcdFx0XHRcdC8vIFVzZSB0aGUgYWJzb2x1dGUgVVJJJ3MgcGF0aCBoZXJlIHNvIHRoZSBvcHRpb25hbCBsaW5lL2NvbCBnZXQgZGV0ZWN0ZWRcblx0XHRcdFx0XHR0ZXh0OiByZXN1bHQudXJpLnBhdGggKyAodGV4dC5tYXRjaCgvOlxcZCsoOlxcZCspPyQvKT8uWzBdIHx8ICcnKSxcblx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IGxpbmsuYnVmZmVyUmFuZ2UsXG5cdFx0XHRcdFx0dHlwZTogbGluay50eXBlXG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmICh1cmkpIHtcblx0XHRcdFx0XHRhd2FpdCAoaXNEaXJlY3RvcnkgPyB0aGlzLl9sb2NhbEZvbGRlckluV29ya3NwYWNlT3BlbmVyLm9wZW4obGlua1RvT3BlbikgOiB0aGlzLl9sb2NhbEZpbGVPcGVuZXIub3BlbihsaW5rVG9PcGVuKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmludGVyZmFjZSBJUmVzb3VyY2VNYXRjaCB7XG5cdHVyaTogVVJJO1xuXHRpc0RpcmVjdG9yeT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFVybExpbmtPcGVuZXIgaW1wbGVtZW50cyBJVGVybWluYWxMaW5rT3BlbmVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNSZW1vdGU6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9jYWxGaWxlT3BlbmVyOiBUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9jYWxGb2xkZXJJbldvcmtzcGFjZU9wZW5lcjogVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbEZvbGRlck91dHNpZGVXb3Jrc3BhY2VPcGVuZXI6IFRlcm1pbmFsTG9jYWxGb2xkZXJPdXRzaWRlV29ya3NwYWNlTGlua09wZW5lcixcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgb3BlbihsaW5rOiBJVGVybWluYWxTaW1wbGVMaW5rKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFsaW5rLnVyaSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUcmllZCB0byBvcGVuIGEgdXJsIHdpdGhvdXQgYSByZXNvbHZlZCBVUkknKTtcblx0XHR9XG5cdFx0Ly8gSGFuZGxlIGZpbGU6Ly8gVVJJcyBieSBkZWxlZ2F0aW5nIHRvIGFwcHJvcHJpYXRlIGZpbGUvZm9sZGVyIG9wZW5lcnNcblx0XHRpZiAobGluay51cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9vcGVuRmlsZVNjaGVtZUxpbmsobGluayk7XG5cdFx0fVxuXHRcdC8vIEl0J3MgaW1wb3J0YW50IHRvIHVzZSB0aGUgcmF3IHN0cmluZyB2YWx1ZSBoZXJlIHRvIGF2b2lkIGNvbnZlcnRpbmcgcHJlLWVuY29kZWQgdmFsdWVzXG5cdFx0Ly8gZnJvbSB0aGUgVVJMIGxpa2UgYCUyQmAgLT4gYCtgLlxuXHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihsaW5rLnRleHQsIHtcblx0XHRcdGFsbG93VHVubmVsaW5nOiB0aGlzLl9pc1JlbW90ZSAmJiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgncmVtb3RlLmZvcndhcmRPbk9wZW4nKSxcblx0XHRcdGFsbG93Q29udHJpYnV0ZWRPcGVuZXJzOiB0cnVlLFxuXHRcdFx0b3BlbkV4dGVybmFsOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vcGVuRmlsZVNjaGVtZUxpbmsobGluazogSVRlcm1pbmFsU2ltcGxlTGluayk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghbGluay51cmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQobGluay51cmkpO1xuXHRcdFx0Y29uc3QgaXNEaXJlY3RvcnkgPSBzdGF0LmlzRGlyZWN0b3J5O1xuXHRcdFx0Y29uc3QgbGlua1R5cGUgPSBnZXRUZXJtaW5hbExpbmtUeXBlKFxuXHRcdFx0XHRsaW5rLnVyaSxcblx0XHRcdFx0aXNEaXJlY3RvcnksXG5cdFx0XHRcdHRoaXMuX3VyaUlkZW50aXR5U2VydmljZSxcblx0XHRcdFx0dGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2Vcblx0XHRcdCk7XG5cblx0XHRcdC8vIERlbGVnYXRlIHRvIGFwcHJvcHJpYXRlIG9wZW5lciBiYXNlZCBvbiBsaW5rIHR5cGVcblx0XHRcdHN3aXRjaCAobGlua1R5cGUpIHtcblx0XHRcdFx0Y2FzZSBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGU6XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fbG9jYWxGaWxlT3BlbmVyLm9wZW4obGluayk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRjYXNlIFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRm9sZGVySW5Xb3Jrc3BhY2U6XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fbG9jYWxGb2xkZXJJbldvcmtzcGFjZU9wZW5lci5vcGVuKGxpbmspO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0Y2FzZSBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZvbGRlck91dHNpZGVXb3Jrc3BhY2U6XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fbG9jYWxGb2xkZXJPdXRzaWRlV29ya3NwYWNlT3BlbmVyLm9wZW4obGluayk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRjYXNlIFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlVybDpcblx0XHRcdFx0XHRhd2FpdCB0aGlzLm9wZW4obGluayk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ09wZW4gZmlsZSB2aWEgbmF0aXZlIGZpbGUgZXhwbG9yZXInKTtcblx0XHR9XG5cdFx0dGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKGxpbmsudGV4dCwge1xuXHRcdFx0YWxsb3dUdW5uZWxpbmc6IHRoaXMuX2lzUmVtb3RlICYmIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdyZW1vdGUuZm9yd2FyZE9uT3BlbicpLFxuXHRcdFx0YWxsb3dDb250cmlidXRlZE9wZW5lcnM6IHRydWUsXG5cdFx0XHRvcGVuRXh0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
