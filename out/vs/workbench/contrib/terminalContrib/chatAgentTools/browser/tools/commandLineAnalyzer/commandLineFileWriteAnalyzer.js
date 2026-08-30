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
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { win32, posix } from "../../../../../../../base/common/path.js";
import { extUri, normalizePath } from "../../../../../../../base/common/resources.js";
import { localize } from "../../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { containsCmdDelayedExpansion } from "../../../../../../../platform/terminal/common/autoApprove/cmdDelayedExpansion.js";
import { TerminalChatAgentToolsSettingId } from "../../../common/terminalChatAgentToolsConfiguration.js";
import { TreeSitterCommandParserLanguage } from "../../treeSitterCommandParser.js";
import { OperatingSystem } from "../../../../../../../base/common/platform.js";
import { isString } from "../../../../../../../base/common/types.js";
import { ILabelService } from "../../../../../../../platform/label/common/label.js";
const nullDevice = /* @__PURE__ */ Symbol("null device");
let CommandLineFileWriteAnalyzer = class extends Disposable {
  constructor(_treeSitterCommandParser, _log, _configurationService, _labelService, _workspaceContextService) {
    super();
    this._treeSitterCommandParser = _treeSitterCommandParser;
    this._log = _log;
    this._configurationService = _configurationService;
    this._labelService = _labelService;
    this._workspaceContextService = _workspaceContextService;
  }
  async analyze(options) {
    let fileWrites;
    try {
      fileWrites = await this._getFileWrites(options);
    } catch (e) {
      console.error(e);
      this._log("Failed to get file writes via grammar", options.treeSitterLanguage);
      return {
        isAutoApproveAllowed: false
      };
    }
    return this._getResult(options, fileWrites);
  }
  async _getFileWrites(options) {
    let fileWrites = [];
    const capturedFileWrites = (await this._treeSitterCommandParser.getFileWrites(options.treeSitterLanguage, options.commandLine)).map(this._mapNullDevice.bind(this, options));
    const commandFileWrites = (await this._treeSitterCommandParser.getCommandFileWrites(options.treeSitterLanguage, options.commandLine)).map(this._mapNullDevice.bind(this, options));
    const allCapturedFileWrites = [...capturedFileWrites, ...commandFileWrites];
    if (allCapturedFileWrites.length) {
      const cwd = options.cwd;
      if (cwd) {
        this._log("Detected cwd", cwd.toString());
        fileWrites = allCapturedFileWrites.map((e) => {
          if (e === nullDevice) {
            return e;
          }
          if (/^['"].*['"]$/.test(e)) {
            e = this._stripSurroundingQuotes(e);
          }
          const isAbsolute = options.os === OperatingSystem.Windows ? win32.isAbsolute(e) : posix.isAbsolute(e);
          if (isAbsolute) {
            return cwd.with({ path: e });
          }
          return URI.joinPath(cwd, e);
        });
      } else {
        this._log("Cwd could not be detected");
        fileWrites = allCapturedFileWrites;
      }
    }
    this._log("File writes detected", fileWrites.map((e) => e.toString()));
    return fileWrites;
  }
  _stripSurroundingQuotes(text) {
    let result = text;
    while (result.startsWith('"') && result.endsWith('"') || result.startsWith("'") && result.endsWith("'")) {
      result = result.slice(1, -1);
    }
    return result;
  }
  _mapNullDevice(options, rawFileWrite) {
    if (options.treeSitterLanguage === TreeSitterCommandParserLanguage.PowerShell) {
      return rawFileWrite === "$null" ? nullDevice : rawFileWrite;
    }
    return rawFileWrite === "/dev/null" ? nullDevice : rawFileWrite;
  }
  _getResult(options, fileWrites) {
    let isAutoApproveAllowed = true;
    if (fileWrites.length > 0) {
      const blockDetectedFileWrites = this._configurationService.getValue(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites);
      switch (blockDetectedFileWrites) {
        case "all": {
          isAutoApproveAllowed = false;
          this._log('File writes blocked due to "all" setting');
          break;
        }
        case "outsideWorkspace": {
          const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
          if (workspaceFolders.length > 0) {
            for (const fileWrite of fileWrites) {
              if (fileWrite === nullDevice) {
                this._log("File write to null device allowed", URI.isUri(fileWrite) ? fileWrite.toString() : fileWrite);
                continue;
              }
              if (isString(fileWrite)) {
                const isAbsolute = options.os === OperatingSystem.Windows ? win32.isAbsolute(fileWrite) : posix.isAbsolute(fileWrite);
                if (!isAbsolute) {
                  isAutoApproveAllowed = false;
                  this._log("File write blocked due to unknown terminal cwd", fileWrite);
                  break;
                }
              }
              const fileUri = normalizePath(URI.isUri(fileWrite) ? fileWrite : URI.file(fileWrite));
              if (fileUri.fsPath.match(/[$\(\){}`~%]/) || containsCmdDelayedExpansion(fileUri.fsPath)) {
                isAutoApproveAllowed = false;
                this._log("File write blocked due to likely containing a variable, sub-command, or tilde/environment-variable expansion", fileUri.toString());
                break;
              }
              const isInsideWorkspace = workspaceFolders.some(
                (folder) => folder.uri.scheme === fileUri.scheme && extUri.isEqualOrParent(fileUri, folder.uri)
              );
              if (!isInsideWorkspace) {
                if (options.hasSessionAutoApproval && this._isInTempDirectory(fileUri.path, options.os)) {
                  continue;
                }
                isAutoApproveAllowed = false;
                this._log("File write blocked outside workspace", fileUri.toString());
                break;
              }
            }
          } else {
            const hasOnlyNullDevices = fileWrites.every((fw) => fw === nullDevice);
            if (!hasOnlyNullDevices) {
              isAutoApproveAllowed = false;
              this._log("File writes blocked - no workspace folders");
            }
          }
          break;
        }
        case "never":
        default: {
          break;
        }
      }
    }
    const disclaimers = [];
    if (fileWrites.length > 0) {
      const fileWritesList = fileWrites.map((fw) => `\`${URI.isUri(fw) ? this._labelService.getUriLabel(fw) : fw === nullDevice ? "/dev/null" : fw.toString()}\``).join(", ");
      if (!isAutoApproveAllowed) {
        disclaimers.push(localize("runInTerminal.fileWriteBlockedDisclaimer", "File write operations detected that cannot be auto approved: {0}", fileWritesList));
      } else {
        disclaimers.push(localize("runInTerminal.fileWriteDisclaimer", "File write operations detected: {0}", fileWritesList));
      }
    }
    return {
      isAutoApproveAllowed,
      disclaimers
    };
  }
  /**
   * Returns true if the given URI path points inside an OS temporary directory.
   * On posix systems this matches `/tmp/`. On Windows this matches any `temp`
   * or `tmp` directory segment (case-insensitive), which covers the canonical
   * user temp (`...\AppData\Local\Temp\`), system temp (`C:\Windows\Temp\`),
   * and common dev conventions like `C:\Temp\` and `C:\tmp\`.
   */
  _isInTempDirectory(uriPath, os) {
    if (os === OperatingSystem.Windows) {
      return /[\\/]te?mp[\\/].+/i.test(uriPath);
    }
    return uriPath.startsWith("/tmp/");
  }
};
CommandLineFileWriteAnalyzer = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IWorkspaceContextService)
], CommandLineFileWriteAnalyzer);
export {
  CommandLineFileWriteAnalyzer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFxjb21tYW5kTGluZUFuYWx5emVyXFxjb21tYW5kTGluZUZpbGVXcml0ZUFuYWx5emVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgd2luMzIsIHBvc2l4IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBleHRVcmksIG5vcm1hbGl6ZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBjb250YWluc0NtZERlbGF5ZWRFeHBhbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vYXV0b0FwcHJvdmUvY21kRGVsYXllZEV4cGFuc2lvbi5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyTGFuZ3VhZ2UsIHR5cGUgVHJlZVNpdHRlckNvbW1hbmRQYXJzZXIgfSBmcm9tICcuLi8uLi90cmVlU2l0dGVyQ29tbWFuZFBhcnNlci5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb21tYW5kTGluZUFuYWx5emVyLCBJQ29tbWFuZExpbmVBbmFseXplck9wdGlvbnMsIElDb21tYW5kTGluZUFuYWx5emVyUmVzdWx0IH0gZnJvbSAnLi9jb21tYW5kTGluZUFuYWx5emVyLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5cbmNvbnN0IG51bGxEZXZpY2UgPSBTeW1ib2woJ251bGwgZGV2aWNlJyk7XG5cbnR5cGUgRmlsZVdyaXRlID0gVVJJIHwgc3RyaW5nIHwgdHlwZW9mIG51bGxEZXZpY2U7XG5cbmV4cG9ydCBjbGFzcyBDb21tYW5kTGluZUZpbGVXcml0ZUFuYWx5emVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb21tYW5kTGluZUFuYWx5emVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJlZVNpdHRlckNvbW1hbmRQYXJzZXI6IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZzogKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgYW5hbHl6ZShvcHRpb25zOiBJQ29tbWFuZExpbmVBbmFseXplck9wdGlvbnMpOiBQcm9taXNlPElDb21tYW5kTGluZUFuYWx5emVyUmVzdWx0PiB7XG5cdFx0bGV0IGZpbGVXcml0ZXM6IEZpbGVXcml0ZVtdO1xuXHRcdHRyeSB7XG5cdFx0XHRmaWxlV3JpdGVzID0gYXdhaXQgdGhpcy5fZ2V0RmlsZVdyaXRlcyhvcHRpb25zKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGUpO1xuXHRcdFx0dGhpcy5fbG9nKCdGYWlsZWQgdG8gZ2V0IGZpbGUgd3JpdGVzIHZpYSBncmFtbWFyJywgb3B0aW9ucy50cmVlU2l0dGVyTGFuZ3VhZ2UpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aXNBdXRvQXBwcm92ZUFsbG93ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0UmVzdWx0KG9wdGlvbnMsIGZpbGVXcml0ZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0RmlsZVdyaXRlcyhvcHRpb25zOiBJQ29tbWFuZExpbmVBbmFseXplck9wdGlvbnMpOiBQcm9taXNlPEZpbGVXcml0ZVtdPiB7XG5cdFx0bGV0IGZpbGVXcml0ZXM6IEZpbGVXcml0ZVtdID0gW107XG5cblx0XHQvLyBHZXQgZmlsZSB3cml0ZXMgZnJvbSByZWRpcmVjdGlvbnMgKHZpYSB0cmVlLXNpdHRlciBncmFtbWFyKVxuXHRcdGNvbnN0IGNhcHR1cmVkRmlsZVdyaXRlcyA9IChhd2FpdCB0aGlzLl90cmVlU2l0dGVyQ29tbWFuZFBhcnNlci5nZXRGaWxlV3JpdGVzKG9wdGlvbnMudHJlZVNpdHRlckxhbmd1YWdlLCBvcHRpb25zLmNvbW1hbmRMaW5lKSlcblx0XHRcdC5tYXAodGhpcy5fbWFwTnVsbERldmljZS5iaW5kKHRoaXMsIG9wdGlvbnMpKTtcblxuXHRcdC8vIEdldCBmaWxlIHdyaXRlcyBmcm9tIGNvbW1hbmQtc3BlY2lmaWMgcGFyc2VycyAoZS5nLiwgc2VkIC1pIGluLXBsYWNlIGVkaXRpbmcpXG5cdFx0Y29uc3QgY29tbWFuZEZpbGVXcml0ZXMgPSAoYXdhaXQgdGhpcy5fdHJlZVNpdHRlckNvbW1hbmRQYXJzZXIuZ2V0Q29tbWFuZEZpbGVXcml0ZXMob3B0aW9ucy50cmVlU2l0dGVyTGFuZ3VhZ2UsIG9wdGlvbnMuY29tbWFuZExpbmUpKVxuXHRcdFx0Lm1hcCh0aGlzLl9tYXBOdWxsRGV2aWNlLmJpbmQodGhpcywgb3B0aW9ucykpO1xuXG5cdFx0Y29uc3QgYWxsQ2FwdHVyZWRGaWxlV3JpdGVzID0gWy4uLmNhcHR1cmVkRmlsZVdyaXRlcywgLi4uY29tbWFuZEZpbGVXcml0ZXNdO1xuXG5cdFx0aWYgKGFsbENhcHR1cmVkRmlsZVdyaXRlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGN3ZCA9IG9wdGlvbnMuY3dkO1xuXHRcdFx0aWYgKGN3ZCkge1xuXHRcdFx0XHR0aGlzLl9sb2coJ0RldGVjdGVkIGN3ZCcsIGN3ZC50b1N0cmluZygpKTtcblx0XHRcdFx0ZmlsZVdyaXRlcyA9IGFsbENhcHR1cmVkRmlsZVdyaXRlcy5tYXAoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUgPT09IG51bGxEZXZpY2UpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFN1cnJvdW5kaW5nIHF1b3RlcyB3aGVyZSBpdCdzIGRpZmZpY3VsdCB0byBkZXRlcm1pbmUgd2hldGhlciB0aGlzIGlzIGFic29sdXRlXG5cdFx0XHRcdFx0Ly8gb3IgcmVsYXRpdmVcblx0XHRcdFx0XHRpZiAoL15bJ1wiXS4qWydcIl0kLy50ZXN0KGUpKSB7XG5cdFx0XHRcdFx0XHQvLyBTdHJpcCBzdXJyb3VuZGluZyBxdW90ZXMgdG8gZ2V0IGEgbW9yZSByZWFzb25hYmxlIHZpZXcgb2YgdGhlIHBhdGguIE5vdGVcblx0XHRcdFx0XHRcdC8vIHRoYXQgdGhpcyBtYXkgbm90IGdldCB0aGUgcmVhbCBmaWxlIGluIHRoZSBjYXNlIG9mIGlubmVyIHF1b3RlcywgYnV0IHRoZVxuXHRcdFx0XHRcdFx0Ly8gaW1wb3J0YW50IHRoaW5nIGhlcmUgaXMgdGhlIHJlc29sdmluZyB3aGV0aGVyIGl0J3MgYWJzb2x1dGUgb3Igbm90LlxuXHRcdFx0XHRcdFx0ZSA9IHRoaXMuX3N0cmlwU3Vycm91bmRpbmdRdW90ZXMoZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQWJzb2x1dGVcblx0XHRcdFx0XHRjb25zdCBpc0Fic29sdXRlID0gb3B0aW9ucy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyB3aW4zMi5pc0Fic29sdXRlKGUpIDogcG9zaXguaXNBYnNvbHV0ZShlKTtcblx0XHRcdFx0XHRpZiAoaXNBYnNvbHV0ZSkge1xuXHRcdFx0XHRcdFx0Ly8gRW5zdXJlIGN3ZCdzIHNjaGVtZSBhbmQgYXV0aG9yaXR5IGlzIHJldGFpbmVkXG5cdFx0XHRcdFx0XHRyZXR1cm4gY3dkLndpdGgoeyBwYXRoOiBlIH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFJlbGF0aXZlXG5cdFx0XHRcdFx0cmV0dXJuIFVSSS5qb2luUGF0aChjd2QsIGUpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZygnQ3dkIGNvdWxkIG5vdCBiZSBkZXRlY3RlZCcpO1xuXHRcdFx0XHRmaWxlV3JpdGVzID0gYWxsQ2FwdHVyZWRGaWxlV3JpdGVzO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9sb2coJ0ZpbGUgd3JpdGVzIGRldGVjdGVkJywgZmlsZVdyaXRlcy5tYXAoZSA9PiBlLnRvU3RyaW5nKCkpKTtcblx0XHRyZXR1cm4gZmlsZVdyaXRlcztcblx0fVxuXG5cdHByaXZhdGUgX3N0cmlwU3Vycm91bmRpbmdRdW90ZXModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRsZXQgcmVzdWx0ID0gdGV4dDtcblx0XHR3aGlsZSAoXG5cdFx0XHQocmVzdWx0LnN0YXJ0c1dpdGgoJ1wiJykgJiYgcmVzdWx0LmVuZHNXaXRoKCdcIicpKSB8fFxuXHRcdFx0KHJlc3VsdC5zdGFydHNXaXRoKCdcXCcnKSAmJiByZXN1bHQuZW5kc1dpdGgoJ1xcJycpKVxuXHRcdCkge1xuXHRcdFx0cmVzdWx0ID0gcmVzdWx0LnNsaWNlKDEsIC0xKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX21hcE51bGxEZXZpY2Uob3B0aW9uczogSUNvbW1hbmRMaW5lQW5hbHl6ZXJPcHRpb25zLCByYXdGaWxlV3JpdGU6IHN0cmluZyk6IHN0cmluZyB8IHR5cGVvZiBudWxsRGV2aWNlIHtcblx0XHRpZiAob3B0aW9ucy50cmVlU2l0dGVyTGFuZ3VhZ2UgPT09IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyTGFuZ3VhZ2UuUG93ZXJTaGVsbCkge1xuXHRcdFx0cmV0dXJuIHJhd0ZpbGVXcml0ZSA9PT0gJyRudWxsJ1xuXHRcdFx0XHQ/IG51bGxEZXZpY2Vcblx0XHRcdFx0OiByYXdGaWxlV3JpdGU7XG5cdFx0fVxuXHRcdHJldHVybiByYXdGaWxlV3JpdGUgPT09ICcvZGV2L251bGwnXG5cdFx0XHQ/IG51bGxEZXZpY2Vcblx0XHRcdDogcmF3RmlsZVdyaXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVzdWx0KG9wdGlvbnM6IElDb21tYW5kTGluZUFuYWx5emVyT3B0aW9ucywgZmlsZVdyaXRlczogRmlsZVdyaXRlW10pOiBJQ29tbWFuZExpbmVBbmFseXplclJlc3VsdCB7XG5cdFx0bGV0IGlzQXV0b0FwcHJvdmVBbGxvd2VkID0gdHJ1ZTtcblx0XHRpZiAoZmlsZVdyaXRlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBibG9ja0RldGVjdGVkRmlsZVdyaXRlcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5CbG9ja0RldGVjdGVkRmlsZVdyaXRlcyk7XG5cdFx0XHRzd2l0Y2ggKGJsb2NrRGV0ZWN0ZWRGaWxlV3JpdGVzKSB7XG5cdFx0XHRcdGNhc2UgJ2FsbCc6IHtcblx0XHRcdFx0XHRpc0F1dG9BcHByb3ZlQWxsb3dlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuX2xvZygnRmlsZSB3cml0ZXMgYmxvY2tlZCBkdWUgdG8gXCJhbGxcIiBzZXR0aW5nJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnb3V0c2lkZVdvcmtzcGFjZSc6IHtcblx0XHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdFx0XHRpZiAod29ya3NwYWNlRm9sZGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGZpbGVXcml0ZSBvZiBmaWxlV3JpdGVzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChmaWxlV3JpdGUgPT09IG51bGxEZXZpY2UpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2coJ0ZpbGUgd3JpdGUgdG8gbnVsbCBkZXZpY2UgYWxsb3dlZCcsIFVSSS5pc1VyaShmaWxlV3JpdGUpID8gZmlsZVdyaXRlLnRvU3RyaW5nKCkgOiBmaWxlV3JpdGUpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0aWYgKGlzU3RyaW5nKGZpbGVXcml0ZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBpc0Fic29sdXRlID0gb3B0aW9ucy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyB3aW4zMi5pc0Fic29sdXRlKGZpbGVXcml0ZSkgOiBwb3NpeC5pc0Fic29sdXRlKGZpbGVXcml0ZSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFpc0Fic29sdXRlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpc0F1dG9BcHByb3ZlQWxsb3dlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nKCdGaWxlIHdyaXRlIGJsb2NrZWQgZHVlIHRvIHVua25vd24gdGVybWluYWwgY3dkJywgZmlsZVdyaXRlKTtcblx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb25zdCBmaWxlVXJpID0gbm9ybWFsaXplUGF0aChVUkkuaXNVcmkoZmlsZVdyaXRlKSA/IGZpbGVXcml0ZSA6IFVSSS5maWxlKGZpbGVXcml0ZSkpO1xuXHRcdFx0XHRcdFx0XHQvLyBUT0RPOiBIYW5kbGUgY29tbWFuZCBzdWJzdGl0dXRpb25zL2NvbXBsZXggZGVzdGluYXRpb25zIHByb3Blcmx5IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNzQxNjdcblx0XHRcdFx0XHRcdFx0Ly8gVE9ETzogSGFuZGxlIGVudmlyb25tZW50IHZhcmlhYmxlcyBwcm9wZXJseSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjc0MTY2XG5cdFx0XHRcdFx0XHRcdC8vIGB+YCBjYXRjaGVzIFBPU0lYIHRpbGRlIGV4cGFuc2lvbiAoZS5nLiBgfi9mb29gKSwgYCVgIGNhdGNoZXMgV2luZG93c1xuXHRcdFx0XHRcdFx0XHQvLyBlbnZpcm9ubWVudCB2YXJpYWJsZSBleHBhbnNpb24gKGUuZy4gYCVBUFBEQVRBJVxcZm9vYCksIGFuZCB0aGUgc2hhcmVkXG5cdFx0XHRcdFx0XHRcdC8vIHByZWRpY2F0ZSBjYXRjaGVzIENNRCBkZWxheWVkIGV4cGFuc2lvbiAoZS5nLiBgIUFQUERBVEEhXFxmb29gKS4gVGhlc2UgYXJlXG5cdFx0XHRcdFx0XHRcdC8vIG5vdCByZWNvZ25pemVkIGFzIGFic29sdXRlIGJ5IGBwb3NpeC5pc0Fic29sdXRlYCAvIGB3aW4zMi5pc0Fic29sdXRlYCwgc29cblx0XHRcdFx0XHRcdFx0Ly8gd2l0aG91dCB0aGlzIGd1YXJkIHRoZXkgd291bGQgYmUgam9pbmVkIG9udG8gY3dkIGFuZCBpbmNvcnJlY3RseSBjbGFzc2lmaWVkXG5cdFx0XHRcdFx0XHRcdC8vIGFzIGluc2lkZSB0aGUgd29ya3NwYWNlIHdoaWxlIGV4cGFuZGluZyBhdCBydW50aW1lIHRvIGEgbG9jYXRpb24gb3V0c2lkZSBpdC5cblx0XHRcdFx0XHRcdFx0aWYgKGZpbGVVcmkuZnNQYXRoLm1hdGNoKC9bJFxcKFxcKXt9YH4lXS8pIHx8IGNvbnRhaW5zQ21kRGVsYXllZEV4cGFuc2lvbihmaWxlVXJpLmZzUGF0aCkpIHtcblx0XHRcdFx0XHRcdFx0XHRpc0F1dG9BcHByb3ZlQWxsb3dlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZygnRmlsZSB3cml0ZSBibG9ja2VkIGR1ZSB0byBsaWtlbHkgY29udGFpbmluZyBhIHZhcmlhYmxlLCBzdWItY29tbWFuZCwgb3IgdGlsZGUvZW52aXJvbm1lbnQtdmFyaWFibGUgZXhwYW5zaW9uJywgZmlsZVVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGlzSW5zaWRlV29ya3NwYWNlID0gd29ya3NwYWNlRm9sZGVycy5zb21lKGZvbGRlciA9PlxuXHRcdFx0XHRcdFx0XHRcdGZvbGRlci51cmkuc2NoZW1lID09PSBmaWxlVXJpLnNjaGVtZSAmJlxuXHRcdFx0XHRcdFx0XHRcdGV4dFVyaS5pc0VxdWFsT3JQYXJlbnQoZmlsZVVyaSwgZm9sZGVyLnVyaSlcblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0aWYgKCFpc0luc2lkZVdvcmtzcGFjZSkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIEFsbG93IHdyaXRlcyB0byBPUyB0ZW1wIGxvY2F0aW9ucyB3aGVuIHRoZSB1c2VyIGhhcyBvcHRlZCBpbnRvXG5cdFx0XHRcdFx0XHRcdFx0Ly8gXCJBbGxvdyBBbGwgQ29tbWFuZHMgaW4gdGhpcyBTZXNzaW9uXCIgdmlhIHRoZSBjb25maXJtYXRpb24uXG5cdFx0XHRcdFx0XHRcdFx0aWYgKG9wdGlvbnMuaGFzU2Vzc2lvbkF1dG9BcHByb3ZhbCAmJiB0aGlzLl9pc0luVGVtcERpcmVjdG9yeShmaWxlVXJpLnBhdGgsIG9wdGlvbnMub3MpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aXNBdXRvQXBwcm92ZUFsbG93ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2coJ0ZpbGUgd3JpdGUgYmxvY2tlZCBvdXRzaWRlIHdvcmtzcGFjZScsIGZpbGVVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gTm8gd29ya3NwYWNlIGZvbGRlcnMsIGFsbG93IHNhZmUgbnVsbCBkZXZpY2UgcGF0aHMgZXZlbiB3aXRob3V0IHdvcmtzcGFjZVxuXHRcdFx0XHRcdFx0Y29uc3QgaGFzT25seU51bGxEZXZpY2VzID0gZmlsZVdyaXRlcy5ldmVyeShmdyA9PiBmdyA9PT0gbnVsbERldmljZSk7XG5cdFx0XHRcdFx0XHRpZiAoIWhhc09ubHlOdWxsRGV2aWNlcykge1xuXHRcdFx0XHRcdFx0XHRpc0F1dG9BcHByb3ZlQWxsb3dlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2coJ0ZpbGUgd3JpdGVzIGJsb2NrZWQgLSBubyB3b3Jrc3BhY2UgZm9sZGVycycpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICduZXZlcic6XG5cdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRpc2NsYWltZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChmaWxlV3JpdGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGZpbGVXcml0ZXNMaXN0ID0gZmlsZVdyaXRlcy5tYXAoZncgPT4gYFxcYCR7VVJJLmlzVXJpKGZ3KSA/IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmdykgOiBmdyA9PT0gbnVsbERldmljZSA/ICcvZGV2L251bGwnIDogZncudG9TdHJpbmcoKX1cXGBgKS5qb2luKCcsICcpO1xuXHRcdFx0aWYgKCFpc0F1dG9BcHByb3ZlQWxsb3dlZCkge1xuXHRcdFx0XHRkaXNjbGFpbWVycy5wdXNoKGxvY2FsaXplKCdydW5JblRlcm1pbmFsLmZpbGVXcml0ZUJsb2NrZWREaXNjbGFpbWVyJywgJ0ZpbGUgd3JpdGUgb3BlcmF0aW9ucyBkZXRlY3RlZCB0aGF0IGNhbm5vdCBiZSBhdXRvIGFwcHJvdmVkOiB7MH0nLCBmaWxlV3JpdGVzTGlzdCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGlzY2xhaW1lcnMucHVzaChsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5maWxlV3JpdGVEaXNjbGFpbWVyJywgJ0ZpbGUgd3JpdGUgb3BlcmF0aW9ucyBkZXRlY3RlZDogezB9JywgZmlsZVdyaXRlc0xpc3QpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlzQXV0b0FwcHJvdmVBbGxvd2VkLFxuXHRcdFx0ZGlzY2xhaW1lcnMsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIFVSSSBwYXRoIHBvaW50cyBpbnNpZGUgYW4gT1MgdGVtcG9yYXJ5IGRpcmVjdG9yeS5cblx0ICogT24gcG9zaXggc3lzdGVtcyB0aGlzIG1hdGNoZXMgYC90bXAvYC4gT24gV2luZG93cyB0aGlzIG1hdGNoZXMgYW55IGB0ZW1wYFxuXHQgKiBvciBgdG1wYCBkaXJlY3Rvcnkgc2VnbWVudCAoY2FzZS1pbnNlbnNpdGl2ZSksIHdoaWNoIGNvdmVycyB0aGUgY2Fub25pY2FsXG5cdCAqIHVzZXIgdGVtcCAoYC4uLlxcQXBwRGF0YVxcTG9jYWxcXFRlbXBcXGApLCBzeXN0ZW0gdGVtcCAoYEM6XFxXaW5kb3dzXFxUZW1wXFxgKSxcblx0ICogYW5kIGNvbW1vbiBkZXYgY29udmVudGlvbnMgbGlrZSBgQzpcXFRlbXBcXGAgYW5kIGBDOlxcdG1wXFxgLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNJblRlbXBEaXJlY3RvcnkodXJpUGF0aDogc3RyaW5nLCBvczogT3BlcmF0aW5nU3lzdGVtIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0Ly8gV2luZG93cyBwYXRocyBmcm9tIFVSSS53aXRoKHtwYXRofSkga2VlcCB0aGVpciBvcmlnaW5hbCBiYWNrc2xhc2hlcyxcblx0XHRcdC8vIHNvIGFjY2VwdCBlaXRoZXIgc2VwYXJhdG9yLiBSZXF1aXJlIGNvbnRlbnQgYWZ0ZXIgdGhlIHNlZ21lbnQgc28gdGhlXG5cdFx0XHQvLyBkaXJlY3RvcnkgaXRzZWxmIGlzIG5vdCBtYXRjaGVkLlxuXHRcdFx0cmV0dXJuIC9bXFxcXC9ddGU/bXBbXFxcXC9dLisvaS50ZXN0KHVyaVBhdGgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdXJpUGF0aC5zdGFydHNXaXRoKCcvdG1wLycpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLE9BQU8sYUFBYTtBQUM3QixTQUFTLFFBQVEscUJBQXFCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsdUNBQXFFO0FBRTlFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBRTlCLE1BQU0sYUFBYSx1QkFBTyxhQUFhO0FBSWhDLElBQU0sK0JBQU4sY0FBMkMsV0FBMkM7QUFBQSxFQUM1RixZQUNrQiwwQkFDQSxNQUN1Qix1QkFDUixlQUNXLDBCQUMxQztBQUNELFVBQU07QUFOVztBQUNBO0FBQ3VCO0FBQ1I7QUFDVztBQUFBLEVBRzVDO0FBQUEsRUFFQSxNQUFNLFFBQVEsU0FBMkU7QUFDeEYsUUFBSTtBQUNKLFFBQUk7QUFDSCxtQkFBYSxNQUFNLEtBQUss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
