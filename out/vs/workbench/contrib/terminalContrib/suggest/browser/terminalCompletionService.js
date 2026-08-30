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
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../base/common/path.js";
import { URI } from "../../../../../base/common/uri.js";
import { Emitter } from "../../../../../base/common/event.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../../platform/files/common/files.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { GeneralShellType, ITerminalLogService, WindowsShellType } from "../../../../../platform/terminal/common/terminal.js";
import { TerminalSuggestSettingId } from "../common/terminalSuggestConfiguration.js";
import { TerminalCompletionItemKind } from "./terminalCompletionItem.js";
import { env as processEnv } from "../../../../../base/common/process.js";
import { timeout } from "../../../../../base/common/async.js";
import { gitBashToWindowsPath, windowsToGitBashPath } from "./terminalGitBashHelpers.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { match } from "../../../../../base/common/glob.js";
import { isString } from "../../../../../base/common/types.js";
const ITerminalCompletionService = createDecorator("terminalCompletionService");
class TerminalCompletionList {
  /**
   * Creates a new completion list.
   *
   * @param items The completion items.
   * @param isIncomplete The list is not complete.
   */
  constructor(items, resourceOptions) {
    this.items = items;
    this.resourceOptions = resourceOptions;
  }
}
let TerminalCompletionService = class extends Disposable {
  constructor(_configurationService, _fileService, _labelService, _logService) {
    super();
    this._configurationService = _configurationService;
    this._fileService = _fileService;
    this._labelService = _labelService;
    this._logService = _logService;
    this._providers = /* @__PURE__ */ new Map();
    this._onDidChangeProviders = this._register(new Emitter());
    this.onDidChangeProviders = this._onDidChangeProviders.event;
    this._processEnv = processEnv;
  }
  get providers() {
    return this._providersGenerator();
  }
  *_providersGenerator() {
    for (const providerMap of this._providers.values()) {
      for (const provider of providerMap.values()) {
        yield provider;
      }
    }
  }
  /** Overrides the environment for testing purposes. */
  set processEnv(env) {
    this._processEnv = env;
  }
  registerTerminalCompletionProvider(extensionIdentifier, id, provider, ...triggerCharacters) {
    let extMap = this._providers.get(extensionIdentifier);
    if (!extMap) {
      extMap = /* @__PURE__ */ new Map();
      this._providers.set(extensionIdentifier, extMap);
    }
    provider.triggerCharacters = triggerCharacters;
    provider.id = id;
    extMap.set(id, provider);
    this._onDidChangeProviders.fire();
    return toDisposable(() => {
      const extMap2 = this._providers.get(extensionIdentifier);
      if (extMap2) {
        extMap2.delete(id);
        if (extMap2.size === 0) {
          this._providers.delete(extensionIdentifier);
        }
      }
      this._onDidChangeProviders.fire();
    });
  }
  async provideCompletions(promptValue, cursorPosition, allowFallbackCompletions, shellType, capabilities, token, triggerCharacter, skipExtensionCompletions, explicitlyInvoked) {
    this._logService.trace("TerminalCompletionService#provideCompletions");
    if (!this._providers || !this._providers.values || cursorPosition < 0) {
      return void 0;
    }
    let providers;
    if (triggerCharacter) {
      const providersToRequest = [];
      for (const provider of this.providers) {
        if (!provider.triggerCharacters) {
          continue;
        }
        for (const char of provider.triggerCharacters) {
          if (promptValue.substring(0, cursorPosition)?.endsWith(char)) {
            providersToRequest.push(provider);
            break;
          }
        }
      }
      providers = providersToRequest;
    } else {
      providers = [...this._providers.values()].flatMap((providerMap) => [...providerMap.values()]);
    }
    if (skipExtensionCompletions) {
      providers = providers.filter((p) => p.isBuiltin);
      return this._collectCompletions(providers, shellType, promptValue, cursorPosition, allowFallbackCompletions, capabilities, token, explicitlyInvoked);
    }
    providers = this._getEnabledProviders(providers);
    if (!providers.length) {
      return;
    }
    return this._collectCompletions(providers, shellType, promptValue, cursorPosition, allowFallbackCompletions, capabilities, token, explicitlyInvoked);
  }
  _getEnabledProviders(providers) {
    const providerConfig = this._configurationService.getValue(TerminalSuggestSettingId.Providers);
    return providers.filter((p) => {
      const providerId = p.id;
      return providerId && (!Object.prototype.hasOwnProperty.call(providerConfig, providerId) || providerConfig[providerId] !== false);
    });
  }
  async _collectCompletions(providers, shellType, promptValue, cursorPosition, allowFallbackCompletions, capabilities, token, explicitlyInvoked) {
    this._logService.trace("TerminalCompletionService#_collectCompletions");
    const completionPromises = providers.map(async (provider) => {
      if (provider.shellTypes && shellType && !provider.shellTypes.includes(shellType)) {
        return void 0;
      }
      const timeoutMs = explicitlyInvoked ? 3e4 : 5e3;
      let timedOut = false;
      let completions;
      try {
        completions = await Promise.race([
          provider.provideCompletions(promptValue, cursorPosition, token).then((result) => {
            this._logService.trace(`TerminalCompletionService#_collectCompletions provider ${provider.id} finished`);
            return result;
          }),
          (async () => {
            await timeout(timeoutMs);
            timedOut = true;
            return void 0;
          })()
        ]);
      } catch (e) {
        this._logService.trace(`[TerminalCompletionService] Exception from provider '${provider.id}':`, e);
        return void 0;
      }
      if (timedOut) {
        this._logService.trace(`[TerminalCompletionService] Provider '${provider.id}' timed out after ${timeoutMs}ms. promptValue='${promptValue}', cursorPosition=${cursorPosition}, explicitlyInvoked=${explicitlyInvoked}`);
        return void 0;
      }
      if (!completions) {
        return void 0;
      }
      const completionItems = Array.isArray(completions) ? completions : completions.items ?? [];
      this._logService.trace(`TerminalCompletionService#_collectCompletions amend ${completionItems.length} completion items`);
      if (shellType === GeneralShellType.PowerShell) {
        for (const completion of completionItems) {
          const start = completion.replacementRange ? completion.replacementRange[0] : 0;
          completion.isFileOverride ??= completion.kind === TerminalCompletionItemKind.Method && start === 0;
        }
      }
      if (provider.isBuiltin) {
        for (const item of completionItems) {
          item.provider ??= provider.id;
        }
      }
      if (Array.isArray(completions)) {
        return completionItems;
      }
      if (completions.resourceOptions) {
        const resourceCompletions = await this.resolveResources(completions.resourceOptions, promptValue, cursorPosition, `core:path:ext:${provider.id}`, capabilities, shellType);
        this._logService.trace(`TerminalCompletionService#_collectCompletions dedupe`);
        if (resourceCompletions) {
          const labels = new Set(completionItems.map((c) => c.label));
          for (const item of resourceCompletions) {
            if (!labels.has(item.label)) {
              completionItems.push(item);
            }
          }
        }
        this._logService.trace(`TerminalCompletionService#_collectCompletions dedupe done`);
      }
      return completionItems;
    });
    const results = await Promise.all(completionPromises);
    this._logService.trace("TerminalCompletionService#_collectCompletions done");
    return results.filter((result) => !!result).flat();
  }
  async resolveResources(resourceOptions, promptValue, cursorPosition, provider, capabilities, shellType) {
    this._logService.trace(`TerminalCompletionService#resolveResources`);
    const useWindowsStylePath = resourceOptions.pathSeparator === "\\";
    if (useWindowsStylePath) {
      promptValue = promptValue.replaceAll(/[\\/]/g, resourceOptions.pathSeparator);
    }
    const showDirectories = (resourceOptions.showDirectories || resourceOptions.showFiles) ?? false;
    const showFiles = resourceOptions.showFiles ?? false;
    const globPattern = resourceOptions.globPattern ?? void 0;
    if (!showDirectories && !showFiles) {
      return;
    }
    const resourceCompletions = [];
    const cursorPrefix = promptValue.substring(0, cursorPosition);
    const wordsBeforeCursor = cursorPrefix.split(/(?<!\\) /);
    const isCommandPosition = wordsBeforeCursor.length <= 1 && !cursorPrefix.endsWith(" ");
    let lastWord = cursorPrefix.endsWith(" ") ? "" : cursorPrefix.split(/(?<!\\) /).at(-1) ?? "";
    const matchEnvVarPrefix = lastWord.match(/^[a-zA-Z_]+=(?<rhs>.+)$/);
    if (matchEnvVarPrefix?.groups?.rhs) {
      lastWord = matchEnvVarPrefix.groups.rhs;
    }
    let lastSlashIndex;
    if (useWindowsStylePath) {
      let lastBackslashIndex = -1;
      for (let i = lastWord.length - 1; i >= 0; i--) {
        if (lastWord[i] === "\\") {
          if (i === lastWord.length - 1 || lastWord[i + 1] !== " ") {
            lastBackslashIndex = i;
            break;
          }
        }
      }
      lastSlashIndex = Math.max(lastBackslashIndex, lastWord.lastIndexOf("/"));
    } else {
      lastSlashIndex = lastWord.lastIndexOf(resourceOptions.pathSeparator);
    }
    let lastWordFolder = lastSlashIndex === -1 ? "" : lastWord.slice(0, lastSlashIndex + 1);
    if (useWindowsStylePath) {
      lastWordFolder = lastWordFolder.replaceAll("/", "\\");
    }
    const lastWordFolderHasDotPrefix = !!lastWordFolder.match(/^\.\.?[\\\/]/);
    const lastWordFolderHasTildePrefix = !!lastWordFolder.match(/^~[\\\/]?/);
    const isAbsolutePath = getIsAbsolutePath(shellType, resourceOptions.pathSeparator, lastWordFolder, useWindowsStylePath);
    const type = lastWordFolderHasTildePrefix ? "tilde" : isAbsolutePath ? "absolute" : "relative";
    const cwd = URI.revive(resourceOptions.cwd);
    let lastWordFolderResource;
    if (type === "relative" && lastWordFolder.length > 0) {
      const normalizedFolder = (useWindowsStylePath ? lastWordFolder.replaceAll("\\", "/") : lastWordFolder).replaceAll("\\ ", " ");
      const hasDotPrefix = normalizedFolder.startsWith("./");
      if (hasDotPrefix) {
        const stripped = normalizedFolder.replace(/^\.\/+/, "").replace(/\/+$/, "");
        if (stripped) {
          const cwdParts = cwd.path.replace(/\/+$/, "").split("/");
          const strippedParts = stripped.split("/");
          const tailMatches = strippedParts.length <= cwdParts.length && strippedParts.every((part, idx) => cwdParts[cwdParts.length - strippedParts.length + idx] === part);
          if (tailMatches) {
            try {
              await this._fileService.stat(cwd);
              lastWordFolderResource = cwd;
            } catch {
              return void 0;
            }
          }
        } else {
          try {
            await this._fileService.stat(cwd);
            lastWordFolderResource = cwd;
          } catch {
            return void 0;
          }
        }
      }
      if (!lastWordFolderResource) {
        const folderToResolve = URI.joinPath(cwd, normalizedFolder);
        try {
          await this._fileService.stat(folderToResolve);
          lastWordFolderResource = folderToResolve;
        } catch {
          return void 0;
        }
      }
    } else if (type === "relative") {
      lastWordFolderResource = cwd;
    }
    if (type === "relative" && !lastWordFolderResource) {
      try {
        await this._fileService.stat(cwd);
        lastWordFolderResource = cwd;
      } catch {
        return void 0;
      }
    }
    switch (type) {
      case "tilde": {
        const home = this._getHomeDir(useWindowsStylePath, capabilities);
        if (home) {
          lastWordFolderResource = URI.joinPath(createUriFromLocalPath(cwd, home), lastWordFolder.slice(1).replaceAll("\\ ", " "));
        }
        if (!lastWordFolderResource) {
          if (lastWord.match(/^~[\\\/]$/)) {
            lastWordFolderResource = useWindowsStylePath ? "Home directory" : "$HOME";
          }
        }
        break;
      }
      case "absolute": {
        if (shellType === WindowsShellType.GitBash) {
          lastWordFolderResource = createUriFromLocalPath(cwd, gitBashToWindowsPath(lastWordFolder, this._processEnv.SystemDrive));
        } else {
          lastWordFolderResource = createUriFromLocalPath(cwd, lastWordFolder.replaceAll("\\ ", " "));
        }
        break;
      }
      case "relative": {
        lastWordFolderResource ??= cwd;
        break;
      }
    }
    if (!lastWordFolderResource) {
      return void 0;
    }
    if (isString(lastWordFolderResource)) {
      resourceCompletions.push({
        label: lastWordFolder,
        provider,
        kind: TerminalCompletionItemKind.Folder,
        detail: lastWordFolderResource,
        replacementRange: [cursorPosition - lastWord.length, cursorPosition]
      });
      return resourceCompletions;
    }
    const stat = await this._fileService.resolve(lastWordFolderResource, {
      resolveMetadata: true,
      resolveSingleChildDescendants: true
    });
    if (!stat?.children) {
      return;
    }
    this._logService.trace(`TerminalCompletionService#resolveResources cwd`);
    if (showDirectories) {
      let label;
      switch (type) {
        case "tilde": {
          label = lastWordFolder;
          break;
        }
        case "absolute": {
          label = lastWordFolder;
          break;
        }
        case "relative": {
          label = ".";
          if (lastWordFolder.length > 0) {
            label = addPathRelativePrefix(lastWordFolder, resourceOptions, lastWordFolderHasDotPrefix);
          }
          break;
        }
      }
      resourceCompletions.push({
        label,
        provider,
        kind: TerminalCompletionItemKind.Folder,
        detail: getFriendlyPath(this._labelService, lastWordFolderResource, resourceOptions.pathSeparator, TerminalCompletionItemKind.Folder, shellType),
        replacementRange: [cursorPosition - lastWord.length, cursorPosition]
      });
    }
    this._logService.trace(`TerminalCompletionService#resolveResources direct children`);
    await Promise.all(stat.children.map((child) => (async () => {
      let kind;
      let detail = void 0;
      if (showDirectories && child.isDirectory) {
        if (child.isSymbolicLink) {
          kind = TerminalCompletionItemKind.SymbolicLinkFolder;
        } else {
          kind = TerminalCompletionItemKind.Folder;
        }
      } else if (showFiles && child.isFile) {
        if (isCommandPosition && !useWindowsStylePath) {
          if (!child.executable) {
            return;
          }
        }
        if (child.isSymbolicLink) {
          kind = TerminalCompletionItemKind.SymbolicLinkFile;
        } else {
          kind = TerminalCompletionItemKind.File;
        }
      }
      if (kind === void 0) {
        return;
      }
      let label = lastWordFolder;
      if (label.length > 0 && !label.endsWith(resourceOptions.pathSeparator)) {
        label += resourceOptions.pathSeparator;
      }
      label += child.name;
      if (type === "relative") {
        label = addPathRelativePrefix(label, resourceOptions, lastWordFolderHasDotPrefix);
      }
      if (child.isDirectory && !label.endsWith(resourceOptions.pathSeparator)) {
        label += resourceOptions.pathSeparator;
      }
      label = escapeTerminalCompletionLabel(label, shellType, resourceOptions.pathSeparator);
      if (child.isFile && globPattern) {
        const filePath = child.resource.fsPath;
        const ignoreCase = !this._fileService.hasCapability(child.resource, FileSystemProviderCapabilities.PathCaseSensitive);
        const matches = match(globPattern, filePath, { ignoreCase });
        if (!matches) {
          return;
        }
      }
      if (child.isSymbolicLink) {
        try {
          const realpath = await this._fileService.realpath(child.resource);
          if (realpath && !isEqual(child.resource, realpath)) {
            detail = `${getFriendlyPath(this._labelService, child.resource, resourceOptions.pathSeparator, kind, shellType)} -> ${getFriendlyPath(this._labelService, realpath, resourceOptions.pathSeparator, kind, shellType)}`;
          }
        } catch (error) {
        }
      }
      resourceCompletions.push({
        label,
        provider,
        kind,
        detail: detail ?? getFriendlyPath(this._labelService, child.resource, resourceOptions.pathSeparator, kind, shellType),
        replacementRange: [cursorPosition - lastWord.length, cursorPosition]
      });
    })()));
    this._logService.trace(`TerminalCompletionService#resolveResources CDPATH`);
    if (type === "relative" && showDirectories) {
      if (promptValue.startsWith("cd ")) {
        const config = this._configurationService.getValue(TerminalSuggestSettingId.CdPath);
        if (config === "absolute" || config === "relative") {
          const cdPath = this._getEnvVar("CDPATH", capabilities);
          if (cdPath) {
            const cdPathEntries = cdPath.split(useWindowsStylePath ? ";" : ":");
            for (const cdPathEntry of cdPathEntries) {
              try {
                const fileStat = await this._fileService.resolve(createUriFromLocalPath(cwd, cdPathEntry), { resolveSingleChildDescendants: true });
                if (fileStat?.children) {
                  for (const child of fileStat.children) {
                    if (!child.isDirectory) {
                      continue;
                    }
                    const useRelative = config === "relative";
                    const kind = TerminalCompletionItemKind.Folder;
                    const label = useRelative ? basename(child.resource.fsPath) : shellType === WindowsShellType.GitBash ? windowsToGitBashPath(child.resource.fsPath) : getFriendlyPath(this._labelService, child.resource, resourceOptions.pathSeparator, kind, shellType);
                    const detail = useRelative ? `CDPATH ${getFriendlyPath(this._labelService, child.resource, resourceOptions.pathSeparator, kind, shellType)}` : `CDPATH`;
                    resourceCompletions.push({
                      label,
                      provider,
                      kind,
                      detail,
                      replacementRange: [cursorPosition - lastWord.length, cursorPosition]
                    });
                  }
                }
              } catch {
              }
            }
          }
        }
      }
    }
    this._logService.trace(`TerminalCompletionService#resolveResources parent dir`);
    if (type === "relative" && showDirectories) {
      let label = `..${resourceOptions.pathSeparator}`;
      if (lastWordFolder.length > 0) {
        label = addPathRelativePrefix(lastWordFolder + label, resourceOptions, lastWordFolderHasDotPrefix);
      }
      const parentDir = URI.joinPath(lastWordFolderResource, ".." + resourceOptions.pathSeparator);
      resourceCompletions.push({
        label,
        provider,
        kind: TerminalCompletionItemKind.Folder,
        detail: getFriendlyPath(this._labelService, parentDir, resourceOptions.pathSeparator, TerminalCompletionItemKind.Folder, shellType),
        replacementRange: [cursorPosition - lastWord.length, cursorPosition]
      });
    }
    this._logService.trace(`TerminalCompletionService#resolveResources tilde`);
    if (type === "relative" && !lastWordFolder.match(/[\\\/]/)) {
      let homeResource;
      const home = this._getHomeDir(useWindowsStylePath, capabilities);
      if (home) {
        homeResource = createUriFromLocalPath(cwd, home);
      }
      if (!homeResource) {
        homeResource = useWindowsStylePath ? "Home directory" : "$HOME";
      }
      resourceCompletions.push({
        label: "~",
        provider,
        kind: TerminalCompletionItemKind.Folder,
        detail: isString(homeResource) ? homeResource : getFriendlyPath(this._labelService, homeResource, resourceOptions.pathSeparator, TerminalCompletionItemKind.Folder, shellType),
        replacementRange: [cursorPosition - lastWord.length, cursorPosition]
      });
    }
    this._logService.trace(`TerminalCompletionService#resolveResources done`);
    return resourceCompletions;
  }
  _getEnvVar(key, capabilities) {
    const env = capabilities.get(TerminalCapability.ShellEnvDetection)?.env?.value;
    if (env) {
      return env[key];
    }
    return this._processEnv[key];
  }
  _getHomeDir(useWindowsStylePath, capabilities) {
    return useWindowsStylePath ? this._getEnvVar("USERPROFILE", capabilities) : this._getEnvVar("HOME", capabilities);
  }
};
TerminalCompletionService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, ITerminalLogService)
], TerminalCompletionService);
function getFriendlyPath(labelService, uri, pathSeparator, kind, shellType) {
  let path = labelService.getUriLabel(uri, { noPrefix: true });
  const sep = shellType === WindowsShellType.GitBash ? "\\" : pathSeparator;
  if (kind === TerminalCompletionItemKind.Folder && !path.endsWith(sep)) {
    path += sep;
  }
  return path;
}
function addPathRelativePrefix(text, resourceOptions, lastWordFolderHasDotPrefix) {
  if (!lastWordFolderHasDotPrefix) {
    if (text.startsWith(resourceOptions.pathSeparator)) {
      return `.${text}`;
    }
    return `.${resourceOptions.pathSeparator}${text}`;
  }
  return text;
}
function escapeTerminalCompletionLabel(label, shellType, pathSeparator) {
  if (shellType === void 0 || shellType === GeneralShellType.PowerShell || shellType === WindowsShellType.CommandPrompt) {
    return label;
  }
  return label.replace(/[\[\]\(\)'"\\\`\*\?;|&<>]/g, "\\$&");
}
function getIsAbsolutePath(shellType, pathSeparator, lastWord, useWindowsStylePath) {
  if (shellType === WindowsShellType.GitBash) {
    return lastWord.startsWith(pathSeparator) || /^[a-zA-Z]:\//.test(lastWord);
  }
  return useWindowsStylePath ? /^[a-zA-Z]:[\\\/]/.test(lastWord) : lastWord.startsWith(pathSeparator);
}
function createUriFromLocalPath(cwd, absolutePath) {
  if (cwd.scheme === "file") {
    return URI.file(absolutePath);
  }
  return cwd.with({ path: absolutePath });
}
export {
  ITerminalCompletionService,
  TerminalCompletionList,
  TerminalCompletionService,
  escapeTerminalCompletionLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcc3VnZ2VzdFxcYnJvd3NlclxcdGVybWluYWxDb21wbGV0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHksIHR5cGUgSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgR2VuZXJhbFNoZWxsVHlwZSwgSVRlcm1pbmFsTG9nU2VydmljZSwgVGVybWluYWxTaGVsbFR5cGUsIFdpbmRvd3NTaGVsbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsU3VnZ2VzdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQsIHR5cGUgSVRlcm1pbmFsQ29tcGxldGlvbiB9IGZyb20gJy4vdGVybWluYWxDb21wbGV0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBlbnYgYXMgcHJvY2Vzc0VudiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvY2Vzc0Vudmlyb25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGdpdEJhc2hUb1dpbmRvd3NQYXRoLCB3aW5kb3dzVG9HaXRCYXNoUGF0aCB9IGZyb20gJy4vdGVybWluYWxHaXRCYXNoSGVscGVycy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVJlbGF0aXZlUGF0dGVybiwgbWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5leHBvcnQgY29uc3QgSVRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2U+KCd0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlJyk7XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIGNvbGxlY3Rpb24gb2Yge0BsaW5rIENvbXBsZXRpb25JdGVtIGNvbXBsZXRpb24gaXRlbXN9IHRvIGJlIHByZXNlbnRlZFxuICogaW4gdGhlIHRlcm1pbmFsLlxuICovXG5leHBvcnQgY2xhc3MgVGVybWluYWxDb21wbGV0aW9uTGlzdDxJVGVybWluYWxDb21wbGV0aW9uPiB7XG5cblx0LyoqXG5cdCAqIFJlc291cmNlcyBzaG91bGQgYmUgc2hvd24gaW4gdGhlIGNvbXBsZXRpb25zIGxpc3Rcblx0ICovXG5cdHJlc291cmNlT3B0aW9ucz86IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucztcblxuXHQvKipcblx0ICogVGhlIGNvbXBsZXRpb24gaXRlbXMuXG5cdCAqL1xuXHRpdGVtcz86IElUZXJtaW5hbENvbXBsZXRpb25bXTtcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBjb21wbGV0aW9uIGxpc3QuXG5cdCAqXG5cdCAqIEBwYXJhbSBpdGVtcyBUaGUgY29tcGxldGlvbiBpdGVtcy5cblx0ICogQHBhcmFtIGlzSW5jb21wbGV0ZSBUaGUgbGlzdCBpcyBub3QgY29tcGxldGUuXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihpdGVtcz86IElUZXJtaW5hbENvbXBsZXRpb25bXSwgcmVzb3VyY2VPcHRpb25zPzogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zKSB7XG5cdFx0dGhpcy5pdGVtcyA9IGl0ZW1zO1xuXHRcdHRoaXMucmVzb3VyY2VPcHRpb25zID0gcmVzb3VyY2VPcHRpb25zO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zIHtcblx0c2hvd0ZpbGVzPzogYm9vbGVhbjtcblx0c2hvd0RpcmVjdG9yaWVzPzogYm9vbGVhbjtcblx0Z2xvYlBhdHRlcm4/OiBzdHJpbmcgfCBJUmVsYXRpdmVQYXR0ZXJuO1xuXHRjd2Q6IFVyaUNvbXBvbmVudHM7XG5cdHBhdGhTZXBhcmF0b3I6IHN0cmluZztcbn1cblxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlciB7XG5cdGlkOiBzdHJpbmc7XG5cdHNoZWxsVHlwZXM/OiBUZXJtaW5hbFNoZWxsVHlwZVtdO1xuXHRwcm92aWRlQ29tcGxldGlvbnModmFsdWU6IHN0cmluZywgY3Vyc29yUG9zaXRpb246IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGVybWluYWxDb21wbGV0aW9uW10gfCBUZXJtaW5hbENvbXBsZXRpb25MaXN0PElUZXJtaW5hbENvbXBsZXRpb24+IHwgdW5kZWZpbmVkPjtcblx0dHJpZ2dlckNoYXJhY3RlcnM/OiBzdHJpbmdbXTtcblx0aXNCdWlsdGluPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcHJvdmlkZXJzOiBJdGVyYWJsZUl0ZXJhdG9yPElUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcj47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvdmlkZXJzOiBFdmVudDx2b2lkPjtcblx0cmVnaXN0ZXJUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcihleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmcsIGlkOiBzdHJpbmcsIHByb3ZpZGVyOiBJVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXIsIC4uLnRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSk6IElEaXNwb3NhYmxlO1xuXHRwcm92aWRlQ29tcGxldGlvbnMocHJvbXB0VmFsdWU6IHN0cmluZywgY3Vyc29yUG9zaXRpb246IG51bWJlciwgYWxsb3dGYWxsYmFja0NvbXBsZXRpb25zOiBib29sZWFuLCBzaGVsbFR5cGU6IFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkLCBjYXBhYmlsaXRpZXM6IElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCB0cmlnZ2VyQ2hhcmFjdGVyPzogYm9vbGVhbiwgc2tpcEV4dGVuc2lvbkNvbXBsZXRpb25zPzogYm9vbGVhbiwgZXhwbGljaXRseUludm9rZWQ/OiBib29sZWFuKTogUHJvbWlzZTxJVGVybWluYWxDb21wbGV0aW9uW10gfCB1bmRlZmluZWQ+O1xufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSB7XG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcnM6IE1hcDwvKmV4dCBpZCovc3RyaW5nLCBNYXA8Lypwcm92aWRlciBpZCovc3RyaW5nLCBJVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXI+PiA9IG5ldyBNYXAoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb3ZpZGVycyA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvdmlkZXJzLmV2ZW50O1xuXG5cdGdldCBwcm92aWRlcnMoKTogSXRlcmFibGVJdGVyYXRvcjxJVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXI+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZXJzR2VuZXJhdG9yKCk7XG5cdH1cblxuXHRwcml2YXRlICpfcHJvdmlkZXJzR2VuZXJhdG9yKCk6IEl0ZXJhYmxlSXRlcmF0b3I8SVRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyPiB7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlck1hcCBvZiB0aGlzLl9wcm92aWRlcnMudmFsdWVzKCkpIHtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgcHJvdmlkZXJNYXAudmFsdWVzKCkpIHtcblx0XHRcdFx0eWllbGQgcHJvdmlkZXI7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIE92ZXJyaWRlcyB0aGUgZW52aXJvbm1lbnQgZm9yIHRlc3RpbmcgcHVycG9zZXMuICovXG5cdHNldCBwcm9jZXNzRW52KGVudjogSVByb2Nlc3NFbnZpcm9ubWVudCkgeyB0aGlzLl9wcm9jZXNzRW52ID0gZW52OyB9XG5cdHByaXZhdGUgX3Byb2Nlc3NFbnYgPSBwcm9jZXNzRW52O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlZ2lzdGVyVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBpZDogc3RyaW5nLCBwcm92aWRlcjogSVRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyLCAuLi50cmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10pOiBJRGlzcG9zYWJsZSB7XG5cdFx0bGV0IGV4dE1hcCA9IHRoaXMuX3Byb3ZpZGVycy5nZXQoZXh0ZW5zaW9uSWRlbnRpZmllcik7XG5cdFx0aWYgKCFleHRNYXApIHtcblx0XHRcdGV4dE1hcCA9IG5ldyBNYXAoKTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQoZXh0ZW5zaW9uSWRlbnRpZmllciwgZXh0TWFwKTtcblx0XHR9XG5cdFx0cHJvdmlkZXIudHJpZ2dlckNoYXJhY3RlcnMgPSB0cmlnZ2VyQ2hhcmFjdGVycztcblx0XHRwcm92aWRlci5pZCA9IGlkO1xuXHRcdGV4dE1hcC5zZXQoaWQsIHByb3ZpZGVyKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVByb3ZpZGVycy5maXJlKCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBleHRNYXAgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KGV4dGVuc2lvbklkZW50aWZpZXIpO1xuXHRcdFx0aWYgKGV4dE1hcCkge1xuXHRcdFx0XHRleHRNYXAuZGVsZXRlKGlkKTtcblx0XHRcdFx0aWYgKGV4dE1hcC5zaXplID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJvdmlkZXJzLmRlbGV0ZShleHRlbnNpb25JZGVudGlmaWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm92aWRlcnMuZmlyZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNvbXBsZXRpb25zKHByb21wdFZhbHVlOiBzdHJpbmcsIGN1cnNvclBvc2l0aW9uOiBudW1iZXIsIGFsbG93RmFsbGJhY2tDb21wbGV0aW9uczogYm9vbGVhbiwgc2hlbGxUeXBlOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCwgY2FwYWJpbGl0aWVzOiBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgdHJpZ2dlckNoYXJhY3Rlcj86IGJvb2xlYW4sIHNraXBFeHRlbnNpb25Db21wbGV0aW9ucz86IGJvb2xlYW4sIGV4cGxpY2l0bHlJbnZva2VkPzogYm9vbGVhbik6IFByb21pc2U8SVRlcm1pbmFsQ29tcGxldGlvbltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnVGVybWluYWxDb21wbGV0aW9uU2VydmljZSNwcm92aWRlQ29tcGxldGlvbnMnKTtcblx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVycyB8fCAhdGhpcy5fcHJvdmlkZXJzLnZhbHVlcyB8fCBjdXJzb3JQb3NpdGlvbiA8IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHByb3ZpZGVycztcblx0XHRpZiAodHJpZ2dlckNoYXJhY3Rlcikge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJzVG9SZXF1ZXN0OiBJVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLnByb3ZpZGVycykge1xuXHRcdFx0XHRpZiAoIXByb3ZpZGVyLnRyaWdnZXJDaGFyYWN0ZXJzKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBjaGFyIG9mIHByb3ZpZGVyLnRyaWdnZXJDaGFyYWN0ZXJzKSB7XG5cdFx0XHRcdFx0aWYgKHByb21wdFZhbHVlLnN1YnN0cmluZygwLCBjdXJzb3JQb3NpdGlvbik/LmVuZHNXaXRoKGNoYXIpKSB7XG5cdFx0XHRcdFx0XHRwcm92aWRlcnNUb1JlcXVlc3QucHVzaChwcm92aWRlcik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHByb3ZpZGVycyA9IHByb3ZpZGVyc1RvUmVxdWVzdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvdmlkZXJzID0gWy4uLnRoaXMuX3Byb3ZpZGVycy52YWx1ZXMoKV0uZmxhdE1hcChwcm92aWRlck1hcCA9PiBbLi4ucHJvdmlkZXJNYXAudmFsdWVzKCldKTtcblx0XHR9XG5cblx0XHRpZiAoc2tpcEV4dGVuc2lvbkNvbXBsZXRpb25zKSB7XG5cdFx0XHRwcm92aWRlcnMgPSBwcm92aWRlcnMuZmlsdGVyKHAgPT4gcC5pc0J1aWx0aW4pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbGxlY3RDb21wbGV0aW9ucyhwcm92aWRlcnMsIHNoZWxsVHlwZSwgcHJvbXB0VmFsdWUsIGN1cnNvclBvc2l0aW9uLCBhbGxvd0ZhbGxiYWNrQ29tcGxldGlvbnMsIGNhcGFiaWxpdGllcywgdG9rZW4sIGV4cGxpY2l0bHlJbnZva2VkKTtcblx0XHR9XG5cblx0XHRwcm92aWRlcnMgPSB0aGlzLl9nZXRFbmFibGVkUHJvdmlkZXJzKHByb3ZpZGVycyk7XG5cblx0XHRpZiAoIXByb3ZpZGVycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY29sbGVjdENvbXBsZXRpb25zKHByb3ZpZGVycywgc2hlbGxUeXBlLCBwcm9tcHRWYWx1ZSwgY3Vyc29yUG9zaXRpb24sIGFsbG93RmFsbGJhY2tDb21wbGV0aW9ucywgY2FwYWJpbGl0aWVzLCB0b2tlbiwgZXhwbGljaXRseUludm9rZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRFbmFibGVkUHJvdmlkZXJzKHByb3ZpZGVyczogSVRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyW10pOiBJVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXJbXSB7XG5cdFx0Y29uc3QgcHJvdmlkZXJDb25maWc6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLlByb3ZpZGVycyk7XG5cdFx0cmV0dXJuIHByb3ZpZGVycy5maWx0ZXIocCA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcklkID0gcC5pZDtcblx0XHRcdHJldHVybiBwcm92aWRlcklkICYmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHByb3ZpZGVyQ29uZmlnLCBwcm92aWRlcklkKSB8fCBwcm92aWRlckNvbmZpZ1twcm92aWRlcklkXSAhPT0gZmFsc2UpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29sbGVjdENvbXBsZXRpb25zKHByb3ZpZGVyczogSVRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyW10sIHNoZWxsVHlwZTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQsIHByb21wdFZhbHVlOiBzdHJpbmcsIGN1cnNvclBvc2l0aW9uOiBudW1iZXIsIGFsbG93RmFsbGJhY2tDb21wbGV0aW9uczogYm9vbGVhbiwgY2FwYWJpbGl0aWVzOiBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgZXhwbGljaXRseUludm9rZWQ/OiBib29sZWFuKTogUHJvbWlzZTxJVGVybWluYWxDb21wbGV0aW9uW10gfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlI19jb2xsZWN0Q29tcGxldGlvbnMnKTtcblx0XHRjb25zdCBjb21wbGV0aW9uUHJvbWlzZXMgPSBwcm92aWRlcnMubWFwKGFzeW5jIHByb3ZpZGVyID0+IHtcblx0XHRcdGlmIChwcm92aWRlci5zaGVsbFR5cGVzICYmIHNoZWxsVHlwZSAmJiAhcHJvdmlkZXIuc2hlbGxUeXBlcy5pbmNsdWRlcyhzaGVsbFR5cGUpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0aW1lb3V0TXMgPSBleHBsaWNpdGx5SW52b2tlZCA/IDMwMDAwIDogNTAwMDtcblx0XHRcdGxldCB0aW1lZE91dCA9IGZhbHNlO1xuXHRcdFx0bGV0IGNvbXBsZXRpb25zO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29tcGxldGlvbnMgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRcdHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9ucyhwcm9tcHRWYWx1ZSwgY3Vyc29yUG9zaXRpb24sIHRva2VuKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlI19jb2xsZWN0Q29tcGxldGlvbnMgcHJvdmlkZXIgJHtwcm92aWRlci5pZH0gZmluaXNoZWRgKTtcblx0XHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0KGFzeW5jICgpID0+IHsgYXdhaXQgdGltZW91dCh0aW1lb3V0TXMpOyB0aW1lZE91dCA9IHRydWU7IHJldHVybiB1bmRlZmluZWQ7IH0pKClcblx0XHRcdFx0XSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlXSBFeGNlcHRpb24gZnJvbSBwcm92aWRlciAnJHtwcm92aWRlci5pZH0nOmAsIGUpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRpbWVkT3V0KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlXSBQcm92aWRlciAnJHtwcm92aWRlci5pZH0nIHRpbWVkIG91dCBhZnRlciAke3RpbWVvdXRNc31tcy4gcHJvbXB0VmFsdWU9JyR7cHJvbXB0VmFsdWV9JywgY3Vyc29yUG9zaXRpb249JHtjdXJzb3JQb3NpdGlvbn0sIGV4cGxpY2l0bHlJbnZva2VkPSR7ZXhwbGljaXRseUludm9rZWR9YCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWNvbXBsZXRpb25zKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb21wbGV0aW9uSXRlbXMgPSBBcnJheS5pc0FycmF5KGNvbXBsZXRpb25zKSA/IGNvbXBsZXRpb25zIDogY29tcGxldGlvbnMuaXRlbXMgPz8gW107XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlI19jb2xsZWN0Q29tcGxldGlvbnMgYW1lbmQgJHtjb21wbGV0aW9uSXRlbXMubGVuZ3RofSBjb21wbGV0aW9uIGl0ZW1zYCk7XG5cdFx0XHRpZiAoc2hlbGxUeXBlID09PSBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjb21wbGV0aW9uIG9mIGNvbXBsZXRpb25JdGVtcykge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0ID0gY29tcGxldGlvbi5yZXBsYWNlbWVudFJhbmdlID8gY29tcGxldGlvbi5yZXBsYWNlbWVudFJhbmdlWzBdIDogMDtcblx0XHRcdFx0XHRjb21wbGV0aW9uLmlzRmlsZU92ZXJyaWRlID8/PSBjb21wbGV0aW9uLmtpbmQgPT09IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLk1ldGhvZCAmJiBzdGFydCA9PT0gMDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHByb3ZpZGVyLmlzQnVpbHRpbikge1xuXHRcdFx0XHQvL1RPRE86IHdoeSBpcyB0aGlzIG5lZWRlZD9cblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGNvbXBsZXRpb25JdGVtcykge1xuXHRcdFx0XHRcdGl0ZW0ucHJvdmlkZXIgPz89IHByb3ZpZGVyLmlkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShjb21wbGV0aW9ucykpIHtcblx0XHRcdFx0cmV0dXJuIGNvbXBsZXRpb25JdGVtcztcblx0XHRcdH1cblx0XHRcdGlmIChjb21wbGV0aW9ucy5yZXNvdXJjZU9wdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VDb21wbGV0aW9ucyA9IGF3YWl0IHRoaXMucmVzb2x2ZVJlc291cmNlcyhjb21wbGV0aW9ucy5yZXNvdXJjZU9wdGlvbnMsIHByb21wdFZhbHVlLCBjdXJzb3JQb3NpdGlvbiwgYGNvcmU6cGF0aDpleHQ6JHtwcm92aWRlci5pZH1gLCBjYXBhYmlsaXRpZXMsIHNoZWxsVHlwZSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UjX2NvbGxlY3RDb21wbGV0aW9ucyBkZWR1cGVgKTtcblx0XHRcdFx0aWYgKHJlc291cmNlQ29tcGxldGlvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBsYWJlbHMgPSBuZXcgU2V0KGNvbXBsZXRpb25JdGVtcy5tYXAoYyA9PiBjLmxhYmVsKSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlc291cmNlQ29tcGxldGlvbnMpIHtcblx0XHRcdFx0XHRcdC8vIEVuc3VyZSBubyBkdXBsaWNhdGVzIHN1Y2ggYXMgLlxuXHRcdFx0XHRcdFx0aWYgKCFsYWJlbHMuaGFzKGl0ZW0ubGFiZWwpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbXBsZXRpb25JdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlI19jb2xsZWN0Q29tcGxldGlvbnMgZGVkdXBlIGRvbmVgKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjb21wbGV0aW9uSXRlbXM7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoY29tcGxldGlvblByb21pc2VzKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlI19jb2xsZWN0Q29tcGxldGlvbnMgZG9uZScpO1xuXHRcdHJldHVybiByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpLmZsYXQoKTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMsIHByb21wdFZhbHVlOiBzdHJpbmcsIGN1cnNvclBvc2l0aW9uOiBudW1iZXIsIHByb3ZpZGVyOiBzdHJpbmcsIGNhcGFiaWxpdGllczogSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLCBzaGVsbFR5cGU/OiBUZXJtaW5hbFNoZWxsVHlwZSk6IFByb21pc2U8SVRlcm1pbmFsQ29tcGxldGlvbltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSNyZXNvbHZlUmVzb3VyY2VzYCk7XG5cblx0XHRjb25zdCB1c2VXaW5kb3dzU3R5bGVQYXRoID0gcmVzb3VyY2VPcHRpb25zLnBhdGhTZXBhcmF0b3IgPT09ICdcXFxcJztcblx0XHRpZiAodXNlV2luZG93c1N0eWxlUGF0aCkge1xuXHRcdFx0Ly8gZm9yIHRlc3RzLCBtYWtlIHN1cmUgdGhlIHJpZ2h0IHBhdGggc2VwYXJhdG9yIGlzIHVzZWRcblx0XHRcdHByb21wdFZhbHVlID0gcHJvbXB0VmFsdWUucmVwbGFjZUFsbCgvW1xcXFwvXS9nLCByZXNvdXJjZU9wdGlvbnMucGF0aFNlcGFyYXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gRmlsZXMgcmVxdWVzdGVkIGltcGxpZXMgZm9sZGVycyByZXF1ZXN0ZWQgc2luY2UgdGhlIGZpbGUgY291bGQgYmUgaW4gYW55IGZvbGRlci4gV2UgY291bGRcblx0XHQvLyBwcm92aWRlIGRpYWdub3N0aWNzIHdoZW4gYSBmb2xkZXIgaXMgcHJvdmlkZWQgd2hlcmUgYSBmaWxlIGlzIGV4cGVjdGVkLlxuXHRcdGNvbnN0IHNob3dEaXJlY3RvcmllcyA9IChyZXNvdXJjZU9wdGlvbnMuc2hvd0RpcmVjdG9yaWVzIHx8IHJlc291cmNlT3B0aW9ucy5zaG93RmlsZXMpID8/IGZhbHNlO1xuXHRcdGNvbnN0IHNob3dGaWxlcyA9IHJlc291cmNlT3B0aW9ucy5zaG93RmlsZXMgPz8gZmFsc2U7XG5cdFx0Y29uc3QgZ2xvYlBhdHRlcm4gPSByZXNvdXJjZU9wdGlvbnMuZ2xvYlBhdHRlcm4gPz8gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKCFzaG93RGlyZWN0b3JpZXMgJiYgIXNob3dGaWxlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlQ29tcGxldGlvbnM6IElUZXJtaW5hbENvbXBsZXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGN1cnNvclByZWZpeCA9IHByb21wdFZhbHVlLnN1YnN0cmluZygwLCBjdXJzb3JQb3NpdGlvbik7XG5cblx0XHQvLyBEZXRlcm1pbmUgaWYgd2UncmUgY29tcGxldGluZyB0aGUgY29tbWFuZCAoZmlyc3Qgd29yZCkgdnMgYW4gYXJndW1lbnRcblx0XHQvLyBXZSdyZSBpbiBjb21tYW5kIHBvc2l0aW9uIGlmIHRoZXJlIGFyZSBubyB1bmVzY2FwZWQgc3BhY2VzIGJlZm9yZSBjdXJzb3Jcblx0XHRjb25zdCB3b3Jkc0JlZm9yZUN1cnNvciA9IGN1cnNvclByZWZpeC5zcGxpdCgvKD88IVxcXFwpIC8pO1xuXHRcdGNvbnN0IGlzQ29tbWFuZFBvc2l0aW9uID0gd29yZHNCZWZvcmVDdXJzb3IubGVuZ3RoIDw9IDEgJiYgIWN1cnNvclByZWZpeC5lbmRzV2l0aCgnICcpO1xuXG5cdFx0Ly8gVE9ETzogTGV2ZXJhZ2UgRmlnJ3MgdG9rZW5zIGFycmF5IGhlcmU/XG5cdFx0Ly8gVGhlIGxhc3Qgd29yZCAob3IgYXJndW1lbnQpLiBXaGVuIHRoZSBjdXJzb3IgaXMgZm9sbG93aW5nIGEgc3BhY2UgaXQgd2lsbCBiZSB0aGUgZW1wdHlcblx0XHQvLyBzdHJpbmdcblx0XHRsZXQgbGFzdFdvcmQgPSBjdXJzb3JQcmVmaXguZW5kc1dpdGgoJyAnKSA/ICcnIDogY3Vyc29yUHJlZml4LnNwbGl0KC8oPzwhXFxcXCkgLykuYXQoLTEpID8/ICcnO1xuXG5cdFx0Ly8gSWdub3JlIHByZWZpeGVzIGluIHRoZSB3b3JkIHRoYXQgbG9vayBsaWtlIHNldHRpbmcgYW4gZW52aXJvbm1lbnQgdmFyaWFibGVcblx0XHRjb25zdCBtYXRjaEVudlZhclByZWZpeCA9IGxhc3RXb3JkLm1hdGNoKC9eW2EtekEtWl9dKz0oPzxyaHM+LispJC8pO1xuXHRcdGlmIChtYXRjaEVudlZhclByZWZpeD8uZ3JvdXBzPy5yaHMpIHtcblx0XHRcdGxhc3RXb3JkID0gbWF0Y2hFbnZWYXJQcmVmaXguZ3JvdXBzLnJocztcblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIG5lYXJlc3QgZm9sZGVyIHBhdGggZnJvbSB0aGUgcHJlZml4LiBUaGlzIGlnbm9yZXMgZXZlcnl0aGluZyBhZnRlciB0aGUgYC9gIGFzXG5cdFx0Ly8gdGhleSBhcmUgd2hhdCB0cmlnZ2VycyBjaGFuZ2VzIGluIHRoZSBkaXJlY3RvcnkuXG5cdFx0bGV0IGxhc3RTbGFzaEluZGV4OiBudW1iZXI7XG5cdFx0aWYgKHVzZVdpbmRvd3NTdHlsZVBhdGgpIHtcblx0XHRcdC8vIFRPRE86IEZsZXNoIG91dCBlc2NhcGVkIHBhdGggbG9naWMsIGl0IGN1cnJlbnRseSBvbmx5IHBhcnRpYWxseSB3b3Jrc1xuXHRcdFx0bGV0IGxhc3RCYWNrc2xhc2hJbmRleCA9IC0xO1xuXHRcdFx0Zm9yIChsZXQgaSA9IGxhc3RXb3JkLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGlmIChsYXN0V29yZFtpXSA9PT0gJ1xcXFwnKSB7XG5cdFx0XHRcdFx0aWYgKGkgPT09IGxhc3RXb3JkLmxlbmd0aCAtIDEgfHwgbGFzdFdvcmRbaSArIDFdICE9PSAnICcpIHtcblx0XHRcdFx0XHRcdGxhc3RCYWNrc2xhc2hJbmRleCA9IGk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGxhc3RTbGFzaEluZGV4ID0gTWF0aC5tYXgobGFzdEJhY2tzbGFzaEluZGV4LCBsYXN0V29yZC5sYXN0SW5kZXhPZignLycpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGFzdFNsYXNoSW5kZXggPSBsYXN0V29yZC5sYXN0SW5kZXhPZihyZXNvdXJjZU9wdGlvbnMucGF0aFNlcGFyYXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIF9jb21wbGV0ZV8gZm9sZGVyIG9mIHRoZSBsYXN0IHdvcmQuIEZvciBleGFtcGxlIGlmIHRoZSBsYXN0IHdvcmQgaXMgYC4vc3JjL2ZpbGVgLFxuXHRcdC8vIHRoaXMgd2lsbCBiZSBgLi9zcmMvYC4gVGhpcyBhbHNvIGFsd2F5cyBlbmRzIGluIHRoZSBwYXRoIHNlcGFyYXRvciBpZiBpdCBpcyBub3QgdGhlIGVtcHR5XG5cdFx0Ly8gc3RyaW5nIGFuZCBwYXRoIHNlcGFyYXRvcnMgYXJlIG5vcm1hbGl6ZWQgb24gV2luZG93cy5cblx0XHRsZXQgbGFzdFdvcmRGb2xkZXIgPSBsYXN0U2xhc2hJbmRleCA9PT0gLTEgPyAnJyA6IGxhc3RXb3JkLnNsaWNlKDAsIGxhc3RTbGFzaEluZGV4ICsgMSk7XG5cdFx0aWYgKHVzZVdpbmRvd3NTdHlsZVBhdGgpIHtcblx0XHRcdGxhc3RXb3JkRm9sZGVyID0gbGFzdFdvcmRGb2xkZXIucmVwbGFjZUFsbCgnLycsICdcXFxcJyk7XG5cdFx0fVxuXG5cblx0XHQvLyBEZXRlcm1pbmUgdGhlIGN1cnJlbnQgZm9sZGVyIGJlaW5nIHNob3duXG5cdFx0Y29uc3QgbGFzdFdvcmRGb2xkZXJIYXNEb3RQcmVmaXggPSAhIWxhc3RXb3JkRm9sZGVyLm1hdGNoKC9eXFwuXFwuP1tcXFxcXFwvXS8pO1xuXHRcdGNvbnN0IGxhc3RXb3JkRm9sZGVySGFzVGlsZGVQcmVmaXggPSAhIWxhc3RXb3JkRm9sZGVyLm1hdGNoKC9efltcXFxcXFwvXT8vKTtcblx0XHRjb25zdCBpc0Fic29sdXRlUGF0aCA9IGdldElzQWJzb2x1dGVQYXRoKHNoZWxsVHlwZSwgcmVzb3VyY2VPcHRpb25zLnBhdGhTZXBhcmF0b3IsIGxhc3RXb3JkRm9sZGVyLCB1c2VXaW5kb3dzU3R5bGVQYXRoKTtcblx0XHRjb25zdCB0eXBlID0gbGFzdFdvcmRGb2xkZXJIYXNUaWxkZVByZWZpeCA/ICd0aWxkZScgOiBpc0Fic29sdXRlUGF0aCA/ICdhYnNvbHV0ZScgOiAncmVsYXRpdmUnO1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5yZXZpdmUocmVzb3VyY2VPcHRpb25zLmN3ZCk7XG5cdFx0bGV0IGxhc3RXb3JkRm9sZGVyUmVzb3VyY2U6IFVSSSB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZSA9PT0gJ3JlbGF0aXZlJyAmJiBsYXN0V29yZEZvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBJZiB0aGUgdHlwZWQgZm9sZGVyIG1hdGNoZXMgdGhlIHRhaWwgb2YgY3dkIChjb21tb24gd2hlbiB0aGUgZXh0ZW5zaW9uIGFscmVhZHlcblx0XHRcdC8vIHJlc29sdmVkIHRoZSBwYXRoLCBzdWNoIGFzIGAuL3NyYy92cy9gKSwgcmV1c2UgY3dkIHRvIGF2b2lkIGR1cGxpY2F0aW5nIHNlZ21lbnRzLlxuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZEZvbGRlciA9ICh1c2VXaW5kb3dzU3R5bGVQYXRoID8gbGFzdFdvcmRGb2xkZXIucmVwbGFjZUFsbCgnXFxcXCcsICcvJykgOiBsYXN0V29yZEZvbGRlcikucmVwbGFjZUFsbCgnXFxcXCAnLCAnICcpO1xuXHRcdFx0Y29uc3QgaGFzRG90UHJlZml4ID0gbm9ybWFsaXplZEZvbGRlci5zdGFydHNXaXRoKCcuLycpO1xuXHRcdFx0aWYgKGhhc0RvdFByZWZpeCkge1xuXHRcdFx0XHRjb25zdCBzdHJpcHBlZCA9IG5vcm1hbGl6ZWRGb2xkZXIucmVwbGFjZSgvXlxcLlxcLysvLCAnJykucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG5cdFx0XHRcdGlmIChzdHJpcHBlZCkge1xuXHRcdFx0XHRcdGNvbnN0IGN3ZFBhcnRzID0gY3dkLnBhdGgucmVwbGFjZSgvXFwvKyQvLCAnJykuc3BsaXQoJy8nKTtcblx0XHRcdFx0XHRjb25zdCBzdHJpcHBlZFBhcnRzID0gc3RyaXBwZWQuc3BsaXQoJy8nKTtcblx0XHRcdFx0XHRjb25zdCB0YWlsTWF0Y2hlcyA9IHN0cmlwcGVkUGFydHMubGVuZ3RoIDw9IGN3ZFBhcnRzLmxlbmd0aCAmJiBzdHJpcHBlZFBhcnRzLmV2ZXJ5KChwYXJ0LCBpZHgpID0+IGN3ZFBhcnRzW2N3ZFBhcnRzLmxlbmd0aCAtIHN0cmlwcGVkUGFydHMubGVuZ3RoICsgaWR4XSA9PT0gcGFydCk7XG5cdFx0XHRcdFx0aWYgKHRhaWxNYXRjaGVzKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5zdGF0KGN3ZCk7XG5cdFx0XHRcdFx0XHRcdGxhc3RXb3JkRm9sZGVyUmVzb3VyY2UgPSBjd2Q7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gYC4vYCBieSBpdHNlbGYgbWVhbnMgdGhlIGN1cnJlbnQgZGlyZWN0b3J5LCB1c2UgY3dkIGRpcmVjdGx5IHRvIGF2b2lkXG5cdFx0XHRcdFx0Ly8gdHJhaWxpbmcgc2xhc2ggaXNzdWVzIHdpdGggVVJJLmpvaW5QYXRoIG9uIHNvbWUgcmVtb3RlIGZpbGUgc3lzdGVtcy5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uuc3RhdChjd2QpO1xuXHRcdFx0XHRcdFx0bGFzdFdvcmRGb2xkZXJSZXNvdXJjZSA9IGN3ZDtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE90aGVyd2lzZSByZXNvbHZlIHRoZSBmb2xkZXIgcmVsYXRpdmUgdG8gY3dkLlxuXHRcdFx0aWYgKCFsYXN0V29yZEZvbGRlclJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlclRvUmVzb2x2ZSA9IFVSSS5qb2luUGF0aChjd2QsIG5vcm1hbGl6ZWRGb2xkZXIpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQoZm9sZGVyVG9SZXNvbHZlKTtcblx0XHRcdFx0XHRsYXN0V29yZEZvbGRlclJlc291cmNlID0gZm9sZGVyVG9SZXNvbHZlO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0eXBlID09PSAncmVsYXRpdmUnKSB7XG5cdFx0XHRsYXN0V29yZEZvbGRlclJlc291cmNlID0gY3dkO1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gJ3JlbGF0aXZlJyAmJiAhbGFzdFdvcmRGb2xkZXJSZXNvdXJjZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uuc3RhdChjd2QpO1xuXHRcdFx0XHRsYXN0V29yZEZvbGRlclJlc291cmNlID0gY3dkO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlICd0aWxkZSc6IHtcblx0XHRcdFx0Y29uc3QgaG9tZSA9IHRoaXMuX2dldEhvbWVEaXIodXNlV2luZG93c1N0eWxlUGF0aCwgY2FwYWJpbGl0aWVzKTtcblx0XHRcdFx0aWYgKGhvbWUpIHtcblx0XHRcdFx0XHRsYXN0V29yZEZvbGRlclJlc291cmNlID0gVVJJLmpvaW5QYXRoKGNyZWF0ZVVyaUZyb21Mb2NhbFBhdGgoY3dkLCBob21lKSwgbGFzdFdvcmRGb2xkZXIuc2xpY2UoMSkucmVwbGFjZUFsbCgnXFxcXCAnLCAnICcpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWxhc3RXb3JkRm9sZGVyUmVzb3VyY2UpIHtcblx0XHRcdFx0XHQvLyBVc2UgbGVzcyBzdHJvbmcgd29yZGluZyBoZXJlIGFzIGl0J3Mgbm90IGFzIHN0cm9uZyBvZiBhIGNvbmNlcHQgb24gV2luZG93c1xuXHRcdFx0XHRcdC8vIGFuZCBjb3VsZCBiZSBtaXNsZWFkaW5nXG5cdFx0XHRcdFx0aWYgKGxhc3RXb3JkLm1hdGNoKC9efltcXFxcXFwvXSQvKSkge1xuXHRcdFx0XHRcdFx0bGFzdFdvcmRGb2xkZXJSZXNvdXJjZSA9IHVzZVdpbmRvd3NTdHlsZVBhdGggPyAnSG9tZSBkaXJlY3RvcnknIDogJyRIT01FJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdhYnNvbHV0ZSc6IHtcblx0XHRcdFx0aWYgKHNoZWxsVHlwZSA9PT0gV2luZG93c1NoZWxsVHlwZS5HaXRCYXNoKSB7XG5cdFx0XHRcdFx0bGFzdFdvcmRGb2xkZXJSZXNvdXJjZSA9IGNyZWF0ZVVyaUZyb21Mb2NhbFBhdGgoY3dkLCBnaXRCYXNoVG9XaW5kb3dzUGF0aChsYXN0V29yZEZvbGRlciwgdGhpcy5fcHJvY2Vzc0Vudi5TeXN0ZW1Ecml2ZSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxhc3RXb3JkRm9sZGVyUmVzb3VyY2UgPSBjcmVhdGVVcmlGcm9tTG9jYWxQYXRoKGN3ZCwgbGFzdFdvcmRGb2xkZXIucmVwbGFjZUFsbCgnXFxcXCAnLCAnICcpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3JlbGF0aXZlJzoge1xuXHRcdFx0XHRsYXN0V29yZEZvbGRlclJlc291cmNlID8/PSBjd2Q7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFzc2VtYmxlIGNvbXBsZXRpb25zIGJhc2VkIG9uIHRoZSByZXNvdXJjZSBvZiBsYXN0V29yZEZvbGRlci4gTm90ZSB0aGF0IG9uIFdpbmRvd3MgdGhlXG5cdFx0Ly8gcGF0aCBzZXBhcmF0b3JzIGFyZSBub3JtYWxpemVkIHRvIGBcXGAuXG5cdFx0aWYgKCFsYXN0V29yZEZvbGRlclJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEVhcmx5IGV4aXQgd2l0aCBiYXNpYyBjb21wbGV0aW9uIGlmIHdlIGRvbid0IGtub3cgdGhlIHJlc291cmNlXG5cdFx0aWYgKGlzU3RyaW5nKGxhc3RXb3JkRm9sZGVyUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXNvdXJjZUNvbXBsZXRpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbGFzdFdvcmRGb2xkZXIsXG5cdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsXG5cdFx0XHRcdGRldGFpbDogbGFzdFdvcmRGb2xkZXJSZXNvdXJjZSxcblx0XHRcdFx0cmVwbGFjZW1lbnRSYW5nZTogW2N1cnNvclBvc2l0aW9uIC0gbGFzdFdvcmQubGVuZ3RoLCBjdXJzb3JQb3NpdGlvbl1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHJlc291cmNlQ29tcGxldGlvbnM7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUobGFzdFdvcmRGb2xkZXJSZXNvdXJjZSwge1xuXHRcdFx0cmVzb2x2ZU1ldGFkYXRhOiB0cnVlLFxuXHRcdFx0cmVzb2x2ZVNpbmdsZUNoaWxkRGVzY2VuZGFudHM6IHRydWVcblx0XHR9KTtcblx0XHRpZiAoIXN0YXQ/LmNoaWxkcmVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGN1cnJlbnQgZGlyZWN0b3J5LiBUaGlzIHNob3VsZCBiZSBzaG93biBhdCB0aGUgdG9wIGJlY2F1c2UgaXQgd2lsbCBiZSBhbiBleGFjdFxuXHRcdC8vIG1hdGNoIGFuZCB0aGVyZWZvcmUgaGlnaGxpZ2h0IHRoZSBkZXRhaWwsIHBsdXMgaXQgaW1wcm92ZXMgdGhlIGV4cGVyaWVuY2Ugd2hlblxuXHRcdC8vIHJ1bk9uRW50ZXIgaXMgdXNlZC5cblx0XHQvL1xuXHRcdC8vIC0gKHJlbGF0aXZlKSBgfGAgICAgICAgLT4gYC5gXG5cdFx0Ly8gICB0aGlzIGRvZXMgbm90IGhhdmUgdGhlIHRyYWlsaW5nIGAvYCBpbnRlbnRpb25hbGx5IGFzIGl0J3MgY29tbW9uIHRvIGNvbXBsZXRlIHRoZVxuXHRcdC8vICAgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSBhbmQgd2UgZG8gbm90IHdhbnQgdG8gY29tcGxldGUgYC4vYCB3aGVuIGBydW5PbkVudGVyYCBpc1xuXHRcdC8vICAgdXNlZC5cblx0XHQvLyAtIChyZWxhdGl2ZSkgYC4vc3JjL3xgIC0+IGAuL3NyYy9gXG5cdFx0Ly8gLSAoYWJzb2x1dGUpIGAvc3JjL3xgICAtPiBgL3NyYy9gXG5cdFx0Ly8gLSAodGlsZGUpICAgIGB+L3xgICAgICAtPiBgfi9gXG5cdFx0Ly8gLSAodGlsZGUpICAgIGB+L3NyYy98YCAtPiBgfi9zcmMvYFxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UjcmVzb2x2ZVJlc291cmNlcyBjd2RgKTtcblx0XHRpZiAoc2hvd0RpcmVjdG9yaWVzKSB7XG5cdFx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0XHRjYXNlICd0aWxkZSc6IHtcblx0XHRcdFx0XHRsYWJlbCA9IGxhc3RXb3JkRm9sZGVyO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2Fic29sdXRlJzoge1xuXHRcdFx0XHRcdGxhYmVsID0gbGFzdFdvcmRGb2xkZXI7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAncmVsYXRpdmUnOiB7XG5cdFx0XHRcdFx0bGFiZWwgPSAnLic7XG5cdFx0XHRcdFx0aWYgKGxhc3RXb3JkRm9sZGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGxhYmVsID0gYWRkUGF0aFJlbGF0aXZlUHJlZml4KGxhc3RXb3JkRm9sZGVyLCByZXNvdXJjZU9wdGlvbnMsIGxhc3RXb3JkRm9sZGVySGFzRG90UHJlZml4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc291cmNlQ29tcGxldGlvbnMucHVzaCh7XG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRwcm92aWRlcixcblx0XHRcdFx0a2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyLFxuXHRcdFx0XHRkZXRhaWw6IGdldEZyaWVuZGx5UGF0aCh0aGlzLl9sYWJlbFNlcnZpY2UsIGxhc3RXb3JkRm9sZGVyUmVzb3VyY2UsIHJlc291cmNlT3B0aW9ucy5wYXRoU2VwYXJhdG9yLCBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsIHNoZWxsVHlwZSksXG5cdFx0XHRcdHJlcGxhY2VtZW50UmFuZ2U6IFtjdXJzb3JQb3NpdGlvbiAtIGxhc3RXb3JkLmxlbmd0aCwgY3Vyc29yUG9zaXRpb25dXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBBZGQgYWxsIGRpcmVjdCBjaGlsZHJlbiBmaWxlcyBvciBmb2xkZXJzXG5cdFx0Ly9cblx0XHQvLyAtIChyZWxhdGl2ZSkgYGNkIC4vc3JjL2AgIC0+IGBjZCAuL3NyYy9mb2xkZXIxL2AsIC4uLlxuXHRcdC8vIC0gKGFic29sdXRlKSBgY2QgYzovc3JjL2AgLT4gYGNkIGM6L3NyYy9mb2xkZXIxL2AsIC4uLlxuXHRcdC8vIC0gKHRpbGRlKSAgICBgY2Qgfi9zcmMvYCAgLT4gYGNkIH4vc3JjL2ZvbGRlcjEvYCwgLi4uXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSNyZXNvbHZlUmVzb3VyY2VzIGRpcmVjdCBjaGlsZHJlbmApO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHN0YXQuY2hpbGRyZW4ubWFwKGNoaWxkID0+IChhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgZGV0YWlsOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoc2hvd0RpcmVjdG9yaWVzICYmIGNoaWxkLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdGlmIChjaGlsZC5pc1N5bWJvbGljTGluaykge1xuXHRcdFx0XHRcdGtpbmQgPSBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5TeW1ib2xpY0xpbmtGb2xkZXI7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0a2luZCA9IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcjtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChzaG93RmlsZXMgJiYgY2hpbGQuaXNGaWxlKSB7XG5cdFx0XHRcdC8vIFdoZW4gY29tcGxldGluZyB0aGUgY29tbWFuZCAoZmlyc3Qgd29yZCkgb24gVW5peCwgb25seSBzaG93IGV4ZWN1dGFibGUgZmlsZXNcblx0XHRcdFx0aWYgKGlzQ29tbWFuZFBvc2l0aW9uICYmICF1c2VXaW5kb3dzU3R5bGVQYXRoKSB7XG5cdFx0XHRcdFx0aWYgKCFjaGlsZC5leGVjdXRhYmxlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjaGlsZC5pc1N5bWJvbGljTGluaykge1xuXHRcdFx0XHRcdGtpbmQgPSBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5TeW1ib2xpY0xpbmtGaWxlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGtpbmQgPSBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GaWxlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoa2luZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGxhYmVsID0gbGFzdFdvcmRGb2xkZXI7XG5cdFx0XHRpZiAobGFiZWwubGVuZ3RoID4gMCAmJiAhbGFiZWwuZW5kc1dpdGgocmVzb3VyY2VPcHRpb25zLnBhdGhTZXBhcmF0b3IpKSB7XG5cdFx0XHRcdGxhYmVsICs9IHJlc291cmNlT3B0aW9ucy5wYXRoU2VwYXJhdG9yO1xuXHRcdFx0fVxuXHRcdFx0bGFiZWwgKz0gY2hpbGQubmFtZTtcblx0XHRcdGlmICh0eXBlID09PSAncmVsYXRpdmUnKSB7XG5cdFx0XHRcdGxhYmVsID0gYWRkUGF0aFJlbGF0aXZlUHJlZml4KGxhYmVsLCByZXNvdXJjZU9wdGlvbnMsIGxhc3RXb3JkRm9sZGVySGFzRG90UHJlZml4KTtcblx0XHRcdH1cblx0XHRcdGlmIChjaGlsZC5pc0RpcmVjdG9yeSAmJiAhbGFiZWwuZW5kc1dpdGgocmVzb3VyY2VPcHRpb25zLnBhdGhTZXBhcmF0b3IpKSB7XG5cdFx0XHRcdGxhYmVsICs9IHJlc291cmNlT3B0aW9ucy5wYXRoU2VwYXJhdG9yO1xuXHRcdFx0fVxuXG5cdFx0XHRsYWJlbCA9IGVzY2FwZVRlcm1pbmFsQ29tcGxldGlvbkxhYmVsKGxhYmVsLCBzaGVsbFR5cGUsIHJlc291cmNlT3B0aW9ucy5wYXRoU2VwYXJhdG9yKTtcblxuXHRcdFx0aWYgKGNoaWxkLmlzRmlsZSAmJiBnbG9iUGF0dGVybikge1xuXHRcdFx0XHRjb25zdCBmaWxlUGF0aCA9IGNoaWxkLnJlc291cmNlLmZzUGF0aDtcblx0XHRcdFx0Y29uc3QgaWdub3JlQ2FzZSA9ICF0aGlzLl9maWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KGNoaWxkLnJlc291cmNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUpO1xuXHRcdFx0XHRjb25zdCBtYXRjaGVzID0gbWF0Y2goZ2xvYlBhdHRlcm4sIGZpbGVQYXRoLCB7IGlnbm9yZUNhc2UgfSk7XG5cdFx0XHRcdGlmICghbWF0Y2hlcykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcnkgdG8gcmVzb2x2ZSBzeW1saW5rIHRhcmdldCBmb3Igc3ltYm9saWMgbGlua3Ncblx0XHRcdGlmIChjaGlsZC5pc1N5bWJvbGljTGluaykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlYWxwYXRoID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhbHBhdGgoY2hpbGQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmIChyZWFscGF0aCAmJiAhaXNFcXVhbChjaGlsZC5yZXNvdXJjZSwgcmVhbHBhdGgpKSB7XG5cdFx0XHRcdFx0XHRkZXRhaWwgPSBgJHtnZXRGcmllbmRseVBhdGgodGhpcy5fbGFiZWxTZXJ2aWNlLCBjaGlsZC5yZXNvdXJjZSwgcmVzb3VyY2VPcHRpb25zLnBhdGhTZXBhcmF0b3IsIGtpbmQsIHNoZWxsVHlwZSl9IC0+ICR7Z2V0RnJpZW5kbHlQYXRoKHRoaXMuX2xhYmVsU2VydmljZSwgcmVhbHBhdGgsIHJlc291cmNlT3B0aW9ucy5wYXRoU2VwYXJhdG9yLCBraW5kLCBzaGVsbFR5cGUpfWA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdC8vIElnbm9yZSBlcnJvcnMgcmVzb2x2aW5nIHN5bWxpbmsgdGFyZ2V0cyAtIHRoZXkgbWF5IGJlIGRhbmdsaW5nIGxpbmtzXG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmVzb3VyY2VDb21wbGV0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRraW5kLFxuXHRcdFx0XHRkZXRhaWw6IGRldGFpbCA/PyBnZXRGcmllbmRseVBhdGgodGhpcy5fbGFiZWxTZXJ2aWNlLCBjaGlsZC5yZXNvdXJjZSwgcmVzb3VyY2VPcHRpb25zLnBhdGhTZXBhcmF0b3IsIGtpbmQsIHNoZWxsVHlwZSksXG5cdFx0XHRcdHJlcGxhY2VtZW50UmFuZ2U6IFtjdXJzb3JQb3NpdGlvbiAtIGxhc3RXb3JkLmxlbmd0aCwgY3Vyc29yUG9zaXRpb25dXG5cdFx0XHR9KTtcblx0XHR9KSgpKSk7XG5cblx0XHQvLyBTdXBwb3J0ICRDRFBBVEggc3BlY2lhbGx5IGZvciB0aGUgYGNkYCBjb21tYW5kIG9ubHlcblx0XHQvL1xuXHRcdC8vIC0gKHJlbGF0aXZlKSBgfGAgLT4gYC9mb28vdnNjb2RlYCAoQ0RQQVRIIGhhcyAvZm9vIHdoaWNoIGNvbnRhaW5zIHZzY29kZSBmb2xkZXIpXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSNyZXNvbHZlUmVzb3VyY2VzIENEUEFUSGApO1xuXHRcdGlmICh0eXBlID09PSAncmVsYXRpdmUnICYmIHNob3dEaXJlY3Rvcmllcykge1xuXHRcdFx0aWYgKHByb21wdFZhbHVlLnN0YXJ0c1dpdGgoJ2NkICcpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5DZFBhdGgpO1xuXHRcdFx0XHRpZiAoY29uZmlnID09PSAnYWJzb2x1dGUnIHx8IGNvbmZpZyA9PT0gJ3JlbGF0aXZlJykge1xuXHRcdFx0XHRcdGNvbnN0IGNkUGF0aCA9IHRoaXMuX2dldEVudlZhcignQ0RQQVRIJywgY2FwYWJpbGl0aWVzKTtcblx0XHRcdFx0XHRpZiAoY2RQYXRoKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjZFBhdGhFbnRyaWVzID0gY2RQYXRoLnNwbGl0KHVzZVdpbmRvd3NTdHlsZVBhdGggPyAnOycgOiAnOicpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjZFBhdGhFbnRyeSBvZiBjZFBhdGhFbnRyaWVzKSB7XG5cdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKGNyZWF0ZVVyaUZyb21Mb2NhbFBhdGgoY3dkLCBjZFBhdGhFbnRyeSksIHsgcmVzb2x2ZVNpbmdsZUNoaWxkRGVzY2VuZGFudHM6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGZpbGVTdGF0Py5jaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBmaWxlU3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoIWNoaWxkLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgdXNlUmVsYXRpdmUgPSBjb25maWcgPT09ICdyZWxhdGl2ZSc7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGtpbmQgPSBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXI7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gdXNlUmVsYXRpdmVcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQ/IGJhc2VuYW1lKGNoaWxkLnJlc291cmNlLmZzUGF0aClcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQ6IHNoZWxsVHlwZSA9PT0gV2luZG93c1NoZWxsVHlwZS5HaXRCYXNoXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQ/IHdpbmRvd3NUb0dpdEJhc2hQYXRoKGNoaWxkLnJlc291cmNlLmZzUGF0aClcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdDogZ2V0RnJpZW5kbHlQYXRoKHRoaXMuX2xhYmVsU2VydmljZSwgY2hpbGQucmVzb3VyY2UsIHJlc291cmNlT3B0aW9ucy5wYXRoU2VwYXJhdG9yLCBraW5kLCBzaGVsbFR5cGUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBkZXRhaWwgPSB1c2VSZWxhdGl2ZVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdD8gYENEUEFUSCAke2dldEZyaWVuZGx5UGF0aCh0aGlzLl9sYWJlbFNlcnZpY2UsIGNoaWxkLnJlc291cmNlLCByZXNvdXJjZU9wdGlvbnMucGF0aFNlcGFyYXRvciwga2luZCwgc2hlbGxUeXBlKX1gXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0OiBgQ0RQQVRIYDtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmVzb3VyY2VDb21wbGV0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwcm92aWRlcixcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRraW5kLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRldGFpbCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRyZXBsYWNlbWVudFJhbmdlOiBbY3Vyc29yUG9zaXRpb24gLSBsYXN0V29yZC5sZW5ndGgsIGN1cnNvclBvc2l0aW9uXVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCBwYXJlbnQgZGlyZWN0b3J5IHRvIHRoZSBib3R0b20gb2YgdGhlIGxpc3QgYmVjYXVzZSBpdCdzIG5vdCBhcyB1c2VmdWwgYXMgb3RoZXIgc3VnZ2VzdGlvbnNcblx0XHQvL1xuXHRcdC8vIC0gKHJlbGF0aXZlKSBgfGAgLT4gYC4uL2Bcblx0XHQvLyAtIChyZWxhdGl2ZSkgYC4vc3JjL3xgIC0+IGAuL3NyYy8uLi9gXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSNyZXNvbHZlUmVzb3VyY2VzIHBhcmVudCBkaXJgKTtcblx0XHRpZiAodHlwZSA9PT0gJ3JlbGF0aXZlJyAmJiBzaG93RGlyZWN0b3JpZXMpIHtcblx0XHRcdGxldCBsYWJlbCA9IGAuLiR7cmVzb3VyY2VPcHRpb25zLnBhdGhTZXBhcmF0b3J9YDtcblx0XHRcdGlmIChsYXN0V29yZEZvbGRlci5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGxhYmVsID0gYWRkUGF0aFJlbGF0aXZlUHJlZml4KGxhc3RXb3JkRm9sZGVyICsgbGFiZWwsIHJlc291cmNlT3B0aW9ucywgbGFzdFdvcmRGb2xkZXJIYXNEb3RQcmVmaXgpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFyZW50RGlyID0gVVJJLmpvaW5QYXRoKGxhc3RXb3JkRm9sZGVyUmVzb3VyY2UsICcuLicgKyByZXNvdXJjZU9wdGlvbnMucGF0aFNlcGFyYXRvcik7XG5cdFx0XHRyZXNvdXJjZUNvbXBsZXRpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcixcblx0XHRcdFx0ZGV0YWlsOiBnZXRGcmllbmRseVBhdGgodGhpcy5fbGFiZWxTZXJ2aWNlLCBwYXJlbnREaXIsIHJlc291cmNlT3B0aW9ucy5wYXRoU2VwYXJhdG9yLCBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsIHNoZWxsVHlwZSksXG5cdFx0XHRcdHJlcGxhY2VtZW50UmFuZ2U6IFtjdXJzb3JQb3NpdGlvbiAtIGxhc3RXb3JkLmxlbmd0aCwgY3Vyc29yUG9zaXRpb25dXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBBZGQgdGlsZGUgZm9yIGhvbWUgZGlyZWN0b3J5IGZvciByZWxhdGl2ZSBwYXRocyB3aGVuIHRoZXJlIGlzIG5vIHBhdGggc2VwYXJhdG9yIGluIHRoZVxuXHRcdC8vIGlucHV0LlxuXHRcdC8vXG5cdFx0Ly8gLSAocmVsYXRpdmUpIGB8YCAtPiBgfmBcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlI3Jlc29sdmVSZXNvdXJjZXMgdGlsZGVgKTtcblx0XHRpZiAodHlwZSA9PT0gJ3JlbGF0aXZlJyAmJiAhbGFzdFdvcmRGb2xkZXIubWF0Y2goL1tcXFxcXFwvXS8pKSB7XG5cdFx0XHRsZXQgaG9tZVJlc291cmNlOiBVUkkgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBob21lID0gdGhpcy5fZ2V0SG9tZURpcih1c2VXaW5kb3dzU3R5bGVQYXRoLCBjYXBhYmlsaXRpZXMpO1xuXHRcdFx0aWYgKGhvbWUpIHtcblx0XHRcdFx0aG9tZVJlc291cmNlID0gY3JlYXRlVXJpRnJvbUxvY2FsUGF0aChjd2QsIGhvbWUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFob21lUmVzb3VyY2UpIHtcblx0XHRcdFx0Ly8gVXNlIGxlc3Mgc3Ryb25nIHdvcmRpbmcgaGVyZSBhcyBpdCdzIG5vdCBhcyBzdHJvbmcgb2YgYSBjb25jZXB0IG9uIFdpbmRvd3Ncblx0XHRcdFx0Ly8gYW5kIGNvdWxkIGJlIG1pc2xlYWRpbmdcblx0XHRcdFx0aG9tZVJlc291cmNlID0gdXNlV2luZG93c1N0eWxlUGF0aCA/ICdIb21lIGRpcmVjdG9yeScgOiAnJEhPTUUnO1xuXHRcdFx0fVxuXHRcdFx0cmVzb3VyY2VDb21wbGV0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6ICd+Jyxcblx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcixcblx0XHRcdFx0ZGV0YWlsOiBpc1N0cmluZyhob21lUmVzb3VyY2UpID8gaG9tZVJlc291cmNlIDogZ2V0RnJpZW5kbHlQYXRoKHRoaXMuX2xhYmVsU2VydmljZSwgaG9tZVJlc291cmNlLCByZXNvdXJjZU9wdGlvbnMucGF0aFNlcGFyYXRvciwgVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyLCBzaGVsbFR5cGUpLFxuXHRcdFx0XHRyZXBsYWNlbWVudFJhbmdlOiBbY3Vyc29yUG9zaXRpb24gLSBsYXN0V29yZC5sZW5ndGgsIGN1cnNvclBvc2l0aW9uXVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSNyZXNvbHZlUmVzb3VyY2VzIGRvbmVgKTtcblx0XHRyZXR1cm4gcmVzb3VyY2VDb21wbGV0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgX2dldEVudlZhcihrZXk6IHN0cmluZywgY2FwYWJpbGl0aWVzOiBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudiA9IGNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LlNoZWxsRW52RGV0ZWN0aW9uKT8uZW52Py52YWx1ZSBhcyB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdGlmIChlbnYpIHtcblx0XHRcdHJldHVybiBlbnZba2V5XTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2Nlc3NFbnZba2V5XTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEhvbWVEaXIodXNlV2luZG93c1N0eWxlUGF0aDogYm9vbGVhbiwgY2FwYWJpbGl0aWVzOiBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1c2VXaW5kb3dzU3R5bGVQYXRoID8gdGhpcy5fZ2V0RW52VmFyKCdVU0VSUFJPRklMRScsIGNhcGFiaWxpdGllcykgOiB0aGlzLl9nZXRFbnZWYXIoJ0hPTUUnLCBjYXBhYmlsaXRpZXMpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEZyaWVuZGx5UGF0aChsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsIHVyaTogVVJJLCBwYXRoU2VwYXJhdG9yOiBzdHJpbmcsIGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLCBzaGVsbFR5cGU/OiBUZXJtaW5hbFNoZWxsVHlwZSk6IHN0cmluZyB7XG5cdGxldCBwYXRoID0gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaSwgeyBub1ByZWZpeDogdHJ1ZSB9KTtcblx0Ly8gTm9ybWFsaXplIGxpbmUgZW5kaW5ncyBmb3IgZm9sZGVyc1xuXHRjb25zdCBzZXAgPSBzaGVsbFR5cGUgPT09IFdpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCA/ICdcXFxcJyA6IHBhdGhTZXBhcmF0b3I7XG5cdGlmIChraW5kID09PSBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIgJiYgIXBhdGguZW5kc1dpdGgoc2VwKSkge1xuXHRcdHBhdGggKz0gc2VwO1xuXHR9XG5cdHJldHVybiBwYXRoO1xufVxuXG4vKipcbiAqIE5vcm1hbGl6ZSBzdWdnZXN0aW9uIHRvIGFkZCBhIC4vIHByZWZpeCB0byB0aGUgc3RhcnQgb2YgdGhlIHBhdGggaWYgdGhlcmUgaXNuJ3Qgb25lIGFscmVhZHkuIFdlXG4gKiBtYXkgd2FudCB0byBjaGFuZ2UgdGhpcyBiZWhhdmlvciBpbiB0aGUgZnV0dXJlIHRvIGdvIHdpdGggd2hhdGV2ZXIgZm9ybWF0IHRoZSB1c2VyIGhhcy5cbiAqL1xuZnVuY3Rpb24gYWRkUGF0aFJlbGF0aXZlUHJlZml4KHRleHQ6IHN0cmluZywgcmVzb3VyY2VPcHRpb25zOiBQaWNrPFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucywgJ3BhdGhTZXBhcmF0b3InPiwgbGFzdFdvcmRGb2xkZXJIYXNEb3RQcmVmaXg6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRpZiAoIWxhc3RXb3JkRm9sZGVySGFzRG90UHJlZml4KSB7XG5cdFx0aWYgKHRleHQuc3RhcnRzV2l0aChyZXNvdXJjZU9wdGlvbnMucGF0aFNlcGFyYXRvcikpIHtcblx0XHRcdHJldHVybiBgLiR7dGV4dH1gO1xuXHRcdH1cblx0XHRyZXR1cm4gYC4ke3Jlc291cmNlT3B0aW9ucy5wYXRoU2VwYXJhdG9yfSR7dGV4dH1gO1xuXHR9XG5cdHJldHVybiB0ZXh0O1xufVxuXG4vKipcbiAqIEVzY2FwZXMgc3BlY2lhbCBjaGFyYWN0ZXJzIGluIGEgZmlsZS9mb2xkZXIgbGFiZWwgZm9yIHNoZWxsIGNvbXBsZXRpb24uXG4gKiBUaGlzIGVuc3VyZXMgdGhhdCBjaGFyYWN0ZXJzIGxpa2UgWywgXSwgZXRjLiBhcmUgcHJvcGVybHkgZXNjYXBlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVzY2FwZVRlcm1pbmFsQ29tcGxldGlvbkxhYmVsKGxhYmVsOiBzdHJpbmcsIHNoZWxsVHlwZTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQsIHBhdGhTZXBhcmF0b3I6IHN0cmluZyk6IHN0cmluZyB7XG5cdC8vIE9ubHkgZXNjYXBlIGZvciBiYXNoL3pzaC9maXNoOyBQb3dlclNoZWxsIGFuZCBjbWQgaGF2ZSBkaWZmZXJlbnQgcnVsZXNcblx0aWYgKHNoZWxsVHlwZSA9PT0gdW5kZWZpbmVkIHx8IHNoZWxsVHlwZSA9PT0gR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsIHx8IHNoZWxsVHlwZSA9PT0gV2luZG93c1NoZWxsVHlwZS5Db21tYW5kUHJvbXB0KSB7XG5cdFx0cmV0dXJuIGxhYmVsO1xuXHR9XG5cdHJldHVybiBsYWJlbC5yZXBsYWNlKC9bXFxbXFxdXFwoXFwpJ1wiXFxcXFxcYFxcKlxcPzt8Jjw+XS9nLCAnXFxcXCQmJyk7XG59XG5cbmZ1bmN0aW9uIGdldElzQWJzb2x1dGVQYXRoKHNoZWxsVHlwZTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQsIHBhdGhTZXBhcmF0b3I6IHN0cmluZywgbGFzdFdvcmQ6IHN0cmluZywgdXNlV2luZG93c1N0eWxlUGF0aDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRpZiAoc2hlbGxUeXBlID09PSBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gpIHtcblx0XHRyZXR1cm4gbGFzdFdvcmQuc3RhcnRzV2l0aChwYXRoU2VwYXJhdG9yKSB8fCAvXlthLXpBLVpdOlxcLy8udGVzdChsYXN0V29yZCk7XG5cdH1cblx0cmV0dXJuIHVzZVdpbmRvd3NTdHlsZVBhdGggPyAvXlthLXpBLVpdOltcXFxcXFwvXS8udGVzdChsYXN0V29yZCkgOiBsYXN0V29yZC5zdGFydHNXaXRoKHBhdGhTZXBhcmF0b3IpO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBVUkkgZnJvbSBhbiBhYnNvbHV0ZSBwYXRoLCBwcmVzZXJ2aW5nIHRoZSBzY2hlbWUgYW5kIGF1dGhvcml0eSBmcm9tIHRoZSBjd2QuXG4gKiBGb3IgbG9jYWwgZmlsZTovLyBVUklzLCB1c2VzIFVSSS5maWxlKCkgd2hpY2ggaGFuZGxlcyBXaW5kb3dzIHBhdGggbm9ybWFsaXphdGlvbi5cbiAqIEZvciByZW1vdGUgVVJJcyAoZS5nLiwgdnNjb2RlLXJlbW90ZTovL3dzbCtVYnVudHUpLCBwcmVzZXJ2ZXMgdGhlIHJlbW90ZSBjb250ZXh0LlxuICovXG5mdW5jdGlvbiBjcmVhdGVVcmlGcm9tTG9jYWxQYXRoKGN3ZDogVVJJLCBhYnNvbHV0ZVBhdGg6IHN0cmluZyk6IFVSSSB7XG5cdGlmIChjd2Quc2NoZW1lID09PSAnZmlsZScpIHtcblx0XHRyZXR1cm4gVVJJLmZpbGUoYWJzb2x1dGVQYXRoKTtcblx0fVxuXHRyZXR1cm4gY3dkLndpdGgoeyBwYXRoOiBhYnNvbHV0ZVBhdGggfSk7XG59XG4iXSwKICAi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
