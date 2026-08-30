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
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { CancellationError, isCancellationError } from "../../../../../../base/common/errors.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IExtensionService } from "../../../../../services/extensions/common/extensions.js";
import { IFilesConfigurationService } from "../../../../../services/filesConfiguration/common/filesConfigurationService.js";
import { getSkillFolderName } from "../config/promptFileLocations.js";
import { PromptFileParser } from "../promptFileParser.js";
import { PromptFileSource, PromptsType } from "../promptTypes.js";
import {
  CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT,
  INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT,
  PROMPT_FILE_PROVIDER_ACTIVATION_EVENT,
  PromptsStorage,
  SKILL_PROVIDER_ACTIVATION_EVENT
} from "./promptsService.js";
const ALL_PROMPT_TYPES = [
  PromptsType.prompt,
  PromptsType.instructions,
  PromptsType.agent,
  PromptsType.skill,
  PromptsType.hook
];
let ExtensionPromptFileService = class extends Disposable {
  constructor(logger, fileService, modelService, extensionService, filesConfigService, contextKeyService) {
    super();
    this.logger = logger;
    this.fileService = fileService;
    this.modelService = modelService;
    this.extensionService = extensionService;
    this.filesConfigService = filesConfigService;
    this.contextKeyService = contextKeyService;
    /**
     * Files contributed via extension contribution points, keyed by type then URI.
     */
    this.contributedFiles = {
      [PromptsType.prompt]: new ResourceMap(),
      [PromptsType.instructions]: new ResourceMap(),
      [PromptsType.agent]: new ResourceMap(),
      [PromptsType.skill]: new ResourceMap(),
      [PromptsType.hook]: new ResourceMap()
    };
    /**
     * Providers registered via the proposed extension API.
     */
    this._promptFileProviders = [];
    /**
     * Context keys referenced by tracked `when` clauses (from contributed
     * files and provider results). Used to know when to re-evaluate.
     */
    this._contributedWhenKeys = /* @__PURE__ */ new Set();
    this._contributedWhenClauses = /* @__PURE__ */ new Map();
    this._providerWhenClauses = /* @__PURE__ */ new Map();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    /**
     * Pending URIs to mark as readonly, flushed on the next microtask.
     * Batches multiple `registerContributedFile` calls (which happen
     * synchronously in the extension point handler) into a single
     * `updateReadonly` call to avoid firing `onDidChangeReadonly` per file.
     */
    this._pendingReadonlyUris = [];
    this._pendingReadonlyFlush = false;
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(this._contributedWhenKeys)) {
        for (const type of ALL_PROMPT_TYPES) {
          this._onDidChange.fire({ type });
        }
      }
    }));
  }
  /**
   * Returns the merged list of extension-contributed prompt files for the
   * given type, filtered by their `when` clause.
   */
  async getExtensionPromptFiles(type, token) {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const settledResults = await Promise.allSettled(this.contributedFiles[type].values());
    const contributedFiles = settledResults.filter((result) => result.status === "fulfilled").map((result) => result.value);
    const activationEvent = this._getProviderActivationEvent(type);
    const providerFiles = activationEvent ? await this._listFromProviders(type, activationEvent, token) : [];
    return [...contributedFiles, ...providerFiles].filter((file) => {
      if (!file.when) {
        return true;
      }
      const when = ContextKeyExpr.deserialize(file.when);
      if (!when) {
        this.logger.warn(`[getExtensionPromptFiles] Ignoring contributed prompt file with invalid when clause: ${file.when}`);
        return false;
      }
      return this.contextKeyService.contextMatchesRules(when);
    });
  }
  /**
   * Registers a file contributed via a static contribution point. Returns
   * a disposable that removes the contribution.
   */
  registerContributedFile(type, uri, extension, name, description, when, sessionTypes) {
    const bucket = this.contributedFiles[type];
    if (bucket.has(uri)) {
      return Disposable.None;
    }
    const entryPromise = (async () => {
      if (type === PromptsType.skill) {
        try {
          const validated = await this._validateAndSanitizeSkillFile(uri, CancellationToken.None);
          name = validated.name;
          description = validated.description;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.error(`[registerContributedFile] Extension '${extension.identifier.value}' failed to validate skill file: ${uri}`, msg);
          throw e;
        }
      }
      return { uri, name, description, when, sessionTypes, storage: PromptsStorage.extension, type, extension, source: PromptFileSource.ExtensionContribution };
    })();
    bucket.set(uri, entryPromise);
    this._enqueueReadonlyUpdate(uri);
    if (when) {
      this._contributedWhenClauses.set(`${type}/${uri.toString()}`, when);
      this._updateContributedWhenKeys();
    }
    this._onDidChange.fire({ type });
    return {
      dispose: () => {
        bucket.delete(uri);
        if (when) {
          this._contributedWhenClauses.delete(`${type}/${uri.toString()}`);
          this._updateContributedWhenKeys();
        }
        this._onDidChange.fire({ type });
      }
    };
  }
  /**
   * Registers a prompt file provider (CustomAgentProvider, InstructionsProvider, or PromptFileProvider).
   * This is called by the extension host bridge when an extension registers a provider via
   * vscode.chat.registerCustomAgentProvider(), registerInstructionsProvider(), or
   * registerPromptFileProvider().
   */
  registerPromptFileProvider(extension, type, provider) {
    const providerEntry = { extension, type, ...provider };
    this._promptFileProviders.push(providerEntry);
    const disposables = new DisposableStore();
    if (provider.onDidChangePromptFiles) {
      disposables.add(provider.onDidChangePromptFiles(() => {
        this._onDidChange.fire({ type });
      }));
    }
    this._onDidChange.fire({ type });
    disposables.add({
      dispose: () => {
        const index = this._promptFileProviders.findIndex((p) => p === providerEntry);
        if (index >= 0) {
          this._promptFileProviders.splice(index, 1);
          this._providerWhenClauses.delete(providerEntry);
          this._updateContributedWhenKeys();
          this._onDidChange.fire({ type });
        }
      }
    });
    return disposables;
  }
  async _listFromProviders(type, activationEvent, token) {
    const result = [];
    const readonlyUris = [];
    await this.extensionService.activateByEvent(activationEvent);
    const providers = this._promptFileProviders.filter((p) => p.type === type);
    if (providers.length === 0) {
      return result;
    }
    for (const providerEntry of providers) {
      if (token.isCancellationRequested) {
        break;
      }
      try {
        const files = await providerEntry.providePromptFiles({}, token);
        this._providerWhenClauses.set(providerEntry, files?.flatMap((file) => file.when ? [file.when] : []) ?? []);
        this._updateContributedWhenKeys();
        if (!files || token.isCancellationRequested) {
          continue;
        }
        for (const file of files) {
          readonlyUris.push(file.uri);
          result.push({
            uri: file.uri,
            storage: PromptsStorage.extension,
            type,
            extension: providerEntry.extension,
            source: PromptFileSource.ExtensionAPI,
            name: file.name,
            description: file.description,
            when: file.when,
            sessionTypes: file.sessionTypes
          });
        }
      } catch (e) {
        if (token.isCancellationRequested || isCancellationError(e)) {
          break;
        }
        this.logger.error(`[listFromProviders] Failed to get ${type} files from provider`, e instanceof Error ? e.message : String(e));
      }
    }
    void this.filesConfigService.updateReadonly(readonlyUris, true);
    return result;
  }
  _getProviderActivationEvent(type) {
    switch (type) {
      case PromptsType.agent:
        return CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT;
      case PromptsType.instructions:
        return INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT;
      case PromptsType.prompt:
        return PROMPT_FILE_PROVIDER_ACTIVATION_EVENT;
      case PromptsType.skill:
        return SKILL_PROVIDER_ACTIVATION_EVENT;
      case PromptsType.hook:
        return void 0;
    }
  }
  _enqueueReadonlyUpdate(uri) {
    this._pendingReadonlyUris.push(uri);
    if (!this._pendingReadonlyFlush) {
      this._pendingReadonlyFlush = true;
      queueMicrotask(() => {
        const uris = this._pendingReadonlyUris;
        this._pendingReadonlyUris = [];
        this._pendingReadonlyFlush = false;
        void this.filesConfigService.updateReadonly(uris, true);
      });
    }
  }
  _updateContributedWhenKeys() {
    this._contributedWhenKeys.clear();
    for (const whenClause of this._contributedWhenClauses.values()) {
      const expr = ContextKeyExpr.deserialize(whenClause);
      for (const key of expr?.keys() ?? []) {
        this._contributedWhenKeys.add(key);
      }
    }
    for (const whenClauses of this._providerWhenClauses.values()) {
      for (const whenClause of whenClauses) {
        const expr = ContextKeyExpr.deserialize(whenClause);
        for (const key of expr?.keys() ?? []) {
          this._contributedWhenKeys.add(key);
        }
      }
    }
  }
  // Skill validation
  async _validateAndSanitizeSkillFile(uri, token) {
    const parsedFile = await this._parsePromptFile(uri, token);
    const folderName = getSkillFolderName(uri);
    let name = parsedFile.header?.name;
    if (!name) {
      this.logger.debug(`[validateAndSanitizeSkillFile] Agent skill file missing name attribute, using folder name "${folderName}": ${uri}`);
      name = folderName;
    }
    const description = parsedFile.header?.description;
    let sanitizedName = this._truncateAgentSkillName(name, uri);
    if (sanitizedName !== folderName) {
      this.logger.debug(`[validateAndSanitizeSkillFile] Agent skill name "${sanitizedName}" does not match folder name "${folderName}", using folder name: ${uri}`);
      sanitizedName = folderName;
    }
    const sanitizedDescription = description ? this._truncateAgentSkillDescription(description, uri) : void 0;
    return { name: sanitizedName, description: sanitizedDescription };
  }
  async _parsePromptFile(uri, token) {
    const model = this.modelService.getModel(uri);
    if (model) {
      return new PromptFileParser().parse(uri, model.getValue());
    }
    const fileContent = await this.fileService.readFile(uri);
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    return new PromptFileParser().parse(uri, fileContent.value.toString());
  }
  _sanitizeAgentSkillText(text) {
    return text.replace(/<[^>]+>/g, "");
  }
  _truncateAgentSkillName(name, uri) {
    const MAX_NAME_LENGTH = 64;
    const sanitized = this._sanitizeAgentSkillText(name);
    if (sanitized !== name) {
      this.logger.debug(`[findAgentSkills] Agent skill name contains XML tags, removed: ${uri}`);
    }
    if (sanitized.length > MAX_NAME_LENGTH) {
      this.logger.debug(`[findAgentSkills] Agent skill name exceeds ${MAX_NAME_LENGTH} characters, truncated: ${uri}`);
      return sanitized.substring(0, MAX_NAME_LENGTH);
    }
    return sanitized;
  }
  _truncateAgentSkillDescription(description, uri) {
    const MAX_DESCRIPTION_LENGTH = 1024;
    const sanitized = this._sanitizeAgentSkillText(description);
    if (sanitized !== description) {
      this.logger.debug(`[findAgentSkills] Agent skill description contains XML tags, removed: ${uri}`);
    }
    if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
      this.logger.debug(`[findAgentSkills] Agent skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters, truncated: ${uri}`);
      return sanitized.substring(0, MAX_DESCRIPTION_LENGTH);
    }
    return sanitized;
  }
};
ExtensionPromptFileService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IModelService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IFilesConfigurationService),
  __decorateParam(5, IContextKeyService)
], ExtensionPromptFileService);
export {
  ExtensionPromptFileService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxzZXJ2aWNlXFxleHRlbnNpb25Qcm9tcHRGaWxlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0U2tpbGxGb2xkZXJOYW1lIH0gZnJvbSAnLi4vY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgUGFyc2VkUHJvbXB0RmlsZSwgUHJvbXB0RmlsZVBhcnNlciB9IGZyb20gJy4uL3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgUHJvbXB0RmlsZVNvdXJjZSwgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQge1xuXHRDVVNUT01fQUdFTlRfUFJPVklERVJfQUNUSVZBVElPTl9FVkVOVCxcblx0SUV4dGVuc2lvblByb21wdFBhdGgsXG5cdElOU1RSVUNUSU9OU19QUk9WSURFUl9BQ1RJVkFUSU9OX0VWRU5ULFxuXHRJUHJvbXB0RmlsZUNvbnRleHQsXG5cdElQcm9tcHRGaWxlUmVzb3VyY2UsXG5cdFBST01QVF9GSUxFX1BST1ZJREVSX0FDVElWQVRJT05fRVZFTlQsXG5cdFByb21wdHNTdG9yYWdlLFxuXHRTS0lMTF9QUk9WSURFUl9BQ1RJVkFUSU9OX0VWRU5ULFxufSBmcm9tICcuL3Byb21wdHNTZXJ2aWNlLmpzJztcblxuLyoqXG4gKiBFdmVudCBwYXlsb2FkIGVtaXR0ZWQgYnkge0BsaW5rIEV4dGVuc2lvblByb21wdEZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlfS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uUHJvbXB0RmlsZXNDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IHR5cGU6IFByb21wdHNUeXBlO1xufVxuXG50eXBlIFByb21wdEZpbGVQcm92aWRlckVudHJ5ID0ge1xuXHRyZWFkb25seSBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0cmVhZG9ubHkgdHlwZTogUHJvbXB0c1R5cGU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvbXB0RmlsZXM/OiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgcHJvdmlkZVByb21wdEZpbGVzOiAoY29udGV4dDogSVByb21wdEZpbGVDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8SVByb21wdEZpbGVSZXNvdXJjZVtdIHwgdW5kZWZpbmVkPjtcbn07XG5cbmNvbnN0IEFMTF9QUk9NUFRfVFlQRVM6IHJlYWRvbmx5IFByb21wdHNUeXBlW10gPSBbXG5cdFByb21wdHNUeXBlLnByb21wdCxcblx0UHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRQcm9tcHRzVHlwZS5hZ2VudCxcblx0UHJvbXB0c1R5cGUuc2tpbGwsXG5cdFByb21wdHNUeXBlLmhvb2ssXG5dO1xuXG4vKipcbiAqIE93bnMgdGhlIHJlZ2lzdHJ5IG9mIHByb21wdCBmaWxlcyBjb250cmlidXRlZCBieSBleHRlbnNpb25zLCBib3RoIHZpYVxuICogc3RhdGljIGNvbnRyaWJ1dGlvbiBwb2ludHMgKHNlZSB7QGxpbmsgcmVnaXN0ZXJDb250cmlidXRlZEZpbGV9KSBhbmQgdmlhXG4gKiBkeW5hbWljIHByb3ZpZGVycyByZWdpc3RlcmVkIHRocm91Z2ggdGhlIHByb3Bvc2VkIGV4dGVuc2lvbiBBUEkgKHNlZVxuICoge0BsaW5rIHJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyfSkuXG4gKlxuICogRXhwb3NlcyBhIHBlci10eXBlIGdldHRlciAoe0BsaW5rIGdldEV4dGVuc2lvblByb21wdEZpbGVzfSkgdGhhdCBtZXJnZXNcbiAqIGJvdGggc291cmNlcyBhbmQgYXBwbGllcyBhbnkgYHdoZW5gIGNsYXVzZXMsIHBsdXMgYSBzaW5nbGUgY2hhbmdlIGV2ZW50XG4gKiAoe0BsaW5rIG9uRGlkQ2hhbmdlfSkgY2FycnlpbmcgdGhlIGFmZmVjdGVkIHtAbGluayBQcm9tcHRzVHlwZX0uXG4gKi9cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25Qcm9tcHRGaWxlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8qKlxuXHQgKiBGaWxlcyBjb250cmlidXRlZCB2aWEgZXh0ZW5zaW9uIGNvbnRyaWJ1dGlvbiBwb2ludHMsIGtleWVkIGJ5IHR5cGUgdGhlbiBVUkkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRyaWJ1dGVkRmlsZXMgPSB7XG5cdFx0W1Byb21wdHNUeXBlLnByb21wdF06IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPElFeHRlbnNpb25Qcm9tcHRQYXRoPj4oKSxcblx0XHRbUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zXTogbmV3IFJlc291cmNlTWFwPFByb21pc2U8SUV4dGVuc2lvblByb21wdFBhdGg+PigpLFxuXHRcdFtQcm9tcHRzVHlwZS5hZ2VudF06IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPElFeHRlbnNpb25Qcm9tcHRQYXRoPj4oKSxcblx0XHRbUHJvbXB0c1R5cGUuc2tpbGxdOiBuZXcgUmVzb3VyY2VNYXA8UHJvbWlzZTxJRXh0ZW5zaW9uUHJvbXB0UGF0aD4+KCksXG5cdFx0W1Byb21wdHNUeXBlLmhvb2tdOiBuZXcgUmVzb3VyY2VNYXA8UHJvbWlzZTxJRXh0ZW5zaW9uUHJvbXB0UGF0aD4+KCksXG5cdH07XG5cblx0LyoqXG5cdCAqIFByb3ZpZGVycyByZWdpc3RlcmVkIHZpYSB0aGUgcHJvcG9zZWQgZXh0ZW5zaW9uIEFQSS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdEZpbGVQcm92aWRlcnM6IFByb21wdEZpbGVQcm92aWRlckVudHJ5W10gPSBbXTtcblxuXHQvKipcblx0ICogQ29udGV4dCBrZXlzIHJlZmVyZW5jZWQgYnkgdHJhY2tlZCBgd2hlbmAgY2xhdXNlcyAoZnJvbSBjb250cmlidXRlZFxuXHQgKiBmaWxlcyBhbmQgcHJvdmlkZXIgcmVzdWx0cykuIFVzZWQgdG8ga25vdyB3aGVuIHRvIHJlLWV2YWx1YXRlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJpYnV0ZWRXaGVuS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cmlidXRlZFdoZW5DbGF1c2VzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJXaGVuQ2xhdXNlcyA9IG5ldyBNYXA8UHJvbXB0RmlsZVByb3ZpZGVyRW50cnksIHJlYWRvbmx5IHN0cmluZ1tdPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUV4dGVuc2lvblByb21wdEZpbGVzQ2hhbmdlRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PElFeHRlbnNpb25Qcm9tcHRGaWxlc0NoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBQZW5kaW5nIFVSSXMgdG8gbWFyayBhcyByZWFkb25seSwgZmx1c2hlZCBvbiB0aGUgbmV4dCBtaWNyb3Rhc2suXG5cdCAqIEJhdGNoZXMgbXVsdGlwbGUgYHJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlYCBjYWxscyAod2hpY2ggaGFwcGVuXG5cdCAqIHN5bmNocm9ub3VzbHkgaW4gdGhlIGV4dGVuc2lvbiBwb2ludCBoYW5kbGVyKSBpbnRvIGEgc2luZ2xlXG5cdCAqIGB1cGRhdGVSZWFkb25seWAgY2FsbCB0byBhdm9pZCBmaXJpbmcgYG9uRGlkQ2hhbmdlUmVhZG9ubHlgIHBlciBmaWxlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGVuZGluZ1JlYWRvbmx5VXJpczogVVJJW10gPSBbXTtcblx0cHJpdmF0ZSBfcGVuZGluZ1JlYWRvbmx5Rmx1c2ggPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVzQ29uZmlnU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKHRoaXMuX2NvbnRyaWJ1dGVkV2hlbktleXMpKSB7XG5cdFx0XHRcdC8vIEEgdHJhY2tlZCBjb250ZXh0IGtleSBjaGFuZ2VkOyB0aGUgdmlzaWJpbGl0eSBvZiBhbnlcblx0XHRcdFx0Ly8gZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIGZpbGUgbWF5IGhhdmUgY2hhbmdlZCwgc28gbm90aWZ5XG5cdFx0XHRcdC8vIGZvciBldmVyeSB0eXBlLlxuXHRcdFx0XHRmb3IgKGNvbnN0IHR5cGUgb2YgQUxMX1BST01QVF9UWVBFUykge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyB0eXBlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG1lcmdlZCBsaXN0IG9mIGV4dGVuc2lvbi1jb250cmlidXRlZCBwcm9tcHQgZmlsZXMgZm9yIHRoZVxuXHQgKiBnaXZlbiB0eXBlLCBmaWx0ZXJlZCBieSB0aGVpciBgd2hlbmAgY2xhdXNlLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIGdldEV4dGVuc2lvblByb21wdEZpbGVzKHR5cGU6IFByb21wdHNUeXBlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElFeHRlbnNpb25Qcm9tcHRQYXRoW10+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0Y29uc3Qgc2V0dGxlZFJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodGhpcy5jb250cmlidXRlZEZpbGVzW3R5cGVdLnZhbHVlcygpKTtcblx0XHRjb25zdCBjb250cmlidXRlZEZpbGVzID0gc2V0dGxlZFJlc3VsdHNcblx0XHRcdC5maWx0ZXIoKHJlc3VsdCk6IHJlc3VsdCBpcyBQcm9taXNlRnVsZmlsbGVkUmVzdWx0PElFeHRlbnNpb25Qcm9tcHRQYXRoPiA9PiByZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJylcblx0XHRcdC5tYXAocmVzdWx0ID0+IHJlc3VsdC52YWx1ZSk7XG5cblx0XHRjb25zdCBhY3RpdmF0aW9uRXZlbnQgPSB0aGlzLl9nZXRQcm92aWRlckFjdGl2YXRpb25FdmVudCh0eXBlKTtcblx0XHRjb25zdCBwcm92aWRlckZpbGVzID0gYWN0aXZhdGlvbkV2ZW50ID8gYXdhaXQgdGhpcy5fbGlzdEZyb21Qcm92aWRlcnModHlwZSwgYWN0aXZhdGlvbkV2ZW50LCB0b2tlbikgOiBbXTtcblxuXHRcdHJldHVybiBbLi4uY29udHJpYnV0ZWRGaWxlcywgLi4ucHJvdmlkZXJGaWxlc10uZmlsdGVyKGZpbGUgPT4ge1xuXHRcdFx0aWYgKCFmaWxlLndoZW4pIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3aGVuID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZmlsZS53aGVuKTtcblx0XHRcdGlmICghd2hlbikge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci53YXJuKGBbZ2V0RXh0ZW5zaW9uUHJvbXB0RmlsZXNdIElnbm9yaW5nIGNvbnRyaWJ1dGVkIHByb21wdCBmaWxlIHdpdGggaW52YWxpZCB3aGVuIGNsYXVzZTogJHtmaWxlLndoZW59YCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMod2hlbik7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIGEgZmlsZSBjb250cmlidXRlZCB2aWEgYSBzdGF0aWMgY29udHJpYnV0aW9uIHBvaW50LiBSZXR1cm5zXG5cdCAqIGEgZGlzcG9zYWJsZSB0aGF0IHJlbW92ZXMgdGhlIGNvbnRyaWJ1dGlvbi5cblx0ICovXG5cdHB1YmxpYyByZWdpc3RlckNvbnRyaWJ1dGVkRmlsZSh0eXBlOiBQcm9tcHRzVHlwZSwgdXJpOiBVUkksIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBuYW1lPzogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZywgd2hlbj86IHN0cmluZywgc2Vzc2lvblR5cGVzPzogcmVhZG9ubHkgc3RyaW5nW10pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgYnVja2V0ID0gdGhpcy5jb250cmlidXRlZEZpbGVzW3R5cGVdO1xuXHRcdGlmIChidWNrZXQuaGFzKHVyaSkpIHtcblx0XHRcdC8vIGtlZXAgZmlyc3QgcmVnaXN0cmF0aW9uIHBlciBleHRlbnNpb24gKGhhbmRsZXIgZmlsdGVycyBkdXBsaWNhdGVzIHBlciBleHRlbnNpb24gYWxyZWFkeSlcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJ5UHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBGb3Igc2tpbGxzLCB2YWxpZGF0ZSB0aGF0IHRoZSBmaWxlIGZvbGxvd3MgdGhlIHJlcXVpcmVkIHN0cnVjdHVyZVxuXHRcdFx0aWYgKHR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsaWRhdGVkID0gYXdhaXQgdGhpcy5fdmFsaWRhdGVBbmRTYW5pdGl6ZVNraWxsRmlsZSh1cmksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdG5hbWUgPSB2YWxpZGF0ZWQubmFtZTtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbiA9IHZhbGlkYXRlZC5kZXNjcmlwdGlvbjtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGNvbnN0IG1zZyA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgW3JlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlXSBFeHRlbnNpb24gJyR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9JyBmYWlsZWQgdG8gdmFsaWRhdGUgc2tpbGwgZmlsZTogJHt1cml9YCwgbXNnKTtcblx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IHVyaSwgbmFtZSwgZGVzY3JpcHRpb24sIHdoZW4sIHNlc3Npb25UeXBlcywgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCB0eXBlLCBleHRlbnNpb24sIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25Db250cmlidXRpb24gfSBzYXRpc2ZpZXMgSUV4dGVuc2lvblByb21wdFBhdGg7XG5cdFx0fSkoKTtcblx0XHRidWNrZXQuc2V0KHVyaSwgZW50cnlQcm9taXNlKTtcblxuXHRcdHRoaXMuX2VucXVldWVSZWFkb25seVVwZGF0ZSh1cmkpO1xuXG5cdFx0aWYgKHdoZW4pIHtcblx0XHRcdHRoaXMuX2NvbnRyaWJ1dGVkV2hlbkNsYXVzZXMuc2V0KGAke3R5cGV9LyR7dXJpLnRvU3RyaW5nKCl9YCwgd2hlbik7XG5cdFx0XHR0aGlzLl91cGRhdGVDb250cmlidXRlZFdoZW5LZXlzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHR5cGUgfSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRidWNrZXQuZGVsZXRlKHVyaSk7XG5cdFx0XHRcdGlmICh3aGVuKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29udHJpYnV0ZWRXaGVuQ2xhdXNlcy5kZWxldGUoYCR7dHlwZX0vJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVDb250cmlidXRlZFdoZW5LZXlzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHR5cGUgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBwcm9tcHQgZmlsZSBwcm92aWRlciAoQ3VzdG9tQWdlbnRQcm92aWRlciwgSW5zdHJ1Y3Rpb25zUHJvdmlkZXIsIG9yIFByb21wdEZpbGVQcm92aWRlcikuXG5cdCAqIFRoaXMgaXMgY2FsbGVkIGJ5IHRoZSBleHRlbnNpb24gaG9zdCBicmlkZ2Ugd2hlbiBhbiBleHRlbnNpb24gcmVnaXN0ZXJzIGEgcHJvdmlkZXIgdmlhXG5cdCAqIHZzY29kZS5jaGF0LnJlZ2lzdGVyQ3VzdG9tQWdlbnRQcm92aWRlcigpLCByZWdpc3Rlckluc3RydWN0aW9uc1Byb3ZpZGVyKCksIG9yXG5cdCAqIHJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKCkuXG5cdCAqL1xuXHRwdWJsaWMgcmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHR5cGU6IFByb21wdHNUeXBlLCBwcm92aWRlcjoge1xuXHRcdG9uRGlkQ2hhbmdlUHJvbXB0RmlsZXM/OiBFdmVudDx2b2lkPjtcblx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IChjb250ZXh0OiBJUHJvbXB0RmlsZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxJUHJvbXB0RmlsZVJlc291cmNlW10gfCB1bmRlZmluZWQ+O1xuXHR9KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHByb3ZpZGVyRW50cnk6IFByb21wdEZpbGVQcm92aWRlckVudHJ5ID0geyBleHRlbnNpb24sIHR5cGUsIC4uLnByb3ZpZGVyIH07XG5cdFx0dGhpcy5fcHJvbXB0RmlsZVByb3ZpZGVycy5wdXNoKHByb3ZpZGVyRW50cnkpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRpZiAocHJvdmlkZXIub25EaWRDaGFuZ2VQcm9tcHRGaWxlcykge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlUHJvbXB0RmlsZXMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgdHlwZSB9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgdHlwZSB9KTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fcHJvbXB0RmlsZVByb3ZpZGVycy5maW5kSW5kZXgocCA9PiBwID09PSBwcm92aWRlckVudHJ5KTtcblx0XHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0XHR0aGlzLl9wcm9tcHRGaWxlUHJvdmlkZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdFx0dGhpcy5fcHJvdmlkZXJXaGVuQ2xhdXNlcy5kZWxldGUocHJvdmlkZXJFbnRyeSk7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlQ29udHJpYnV0ZWRXaGVuS2V5cygpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyB0eXBlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9saXN0RnJvbVByb3ZpZGVycyh0eXBlOiBQcm9tcHRzVHlwZSwgYWN0aXZhdGlvbkV2ZW50OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUV4dGVuc2lvblByb21wdFBhdGhbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUV4dGVuc2lvblByb21wdFBhdGhbXSA9IFtdO1xuXHRcdGNvbnN0IHJlYWRvbmx5VXJpczogVVJJW10gPSBbXTtcblxuXHRcdC8vIEFjdGl2YXRlIGV4dGVuc2lvbnMgdGhhdCBtaWdodCBwcm92aWRlIGZpbGVzIGZvciB0aGlzIHR5cGVcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCk7XG5cblx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLl9wcm9tcHRGaWxlUHJvdmlkZXJzLmZpbHRlcihwID0+IHAudHlwZSA9PT0gdHlwZSk7XG5cdFx0aWYgKHByb3ZpZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBwcm92aWRlckVudHJ5IG9mIHByb3ZpZGVycykge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBmaWxlcyA9IGF3YWl0IHByb3ZpZGVyRW50cnkucHJvdmlkZVByb21wdEZpbGVzKHt9LCB0b2tlbik7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyV2hlbkNsYXVzZXMuc2V0KHByb3ZpZGVyRW50cnksIGZpbGVzPy5mbGF0TWFwKGZpbGUgPT4gZmlsZS53aGVuID8gW2ZpbGUud2hlbl0gOiBbXSkgPz8gW10pO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVDb250cmlidXRlZFdoZW5LZXlzKCk7XG5cdFx0XHRcdGlmICghZmlsZXMgfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHRcdHJlYWRvbmx5VXJpcy5wdXNoKGZpbGUudXJpKTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHR1cmk6IGZpbGUudXJpLFxuXHRcdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLFxuXHRcdFx0XHRcdFx0dHlwZSxcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogcHJvdmlkZXJFbnRyeS5leHRlbnNpb24sXG5cdFx0XHRcdFx0XHRzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuRXh0ZW5zaW9uQVBJLFxuXHRcdFx0XHRcdFx0bmFtZTogZmlsZS5uYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGZpbGUuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHR3aGVuOiBmaWxlLndoZW4sXG5cdFx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IGZpbGUuc2Vzc2lvblR5cGVzLFxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElFeHRlbnNpb25Qcm9tcHRQYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmVycm9yKGBbbGlzdEZyb21Qcm92aWRlcnNdIEZhaWxlZCB0byBnZXQgJHt0eXBlfSBmaWxlcyBmcm9tIHByb3ZpZGVyYCwgZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNYXJrIGFsbCBjb2xsZWN0ZWQgZmlsZXMgYXMgcmVhZG9ubHkgaW4gYSBzaW5nbGUgYmF0Y2ggdG8gYXZvaWRcblx0XHQvLyBmaXJpbmcgb25EaWRDaGFuZ2VSZWFkb25seSBvbmNlIHBlciBmaWxlICh3aGljaCBjYXVzZXMgYSBjYXNjYWRlXG5cdFx0Ly8gb2YgZXZlbnQgaGFuZGxlcnMgYW5kIGNhbiBmcmVlemUgdGhlIHJlbmRlcmVyKS5cblx0XHR2b2lkIHRoaXMuZmlsZXNDb25maWdTZXJ2aWNlLnVwZGF0ZVJlYWRvbmx5KHJlYWRvbmx5VXJpcywgdHJ1ZSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UHJvdmlkZXJBY3RpdmF0aW9uRXZlbnQodHlwZTogUHJvbXB0c1R5cGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdFx0cmV0dXJuIENVU1RPTV9BR0VOVF9QUk9WSURFUl9BQ1RJVkFUSU9OX0VWRU5UO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRcdHJldHVybiBJTlNUUlVDVElPTlNfUFJPVklERVJfQUNUSVZBVElPTl9FVkVOVDtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OlxuXHRcdFx0XHRyZXR1cm4gUFJPTVBUX0ZJTEVfUFJPVklERVJfQUNUSVZBVElPTl9FVkVOVDtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuc2tpbGw6XG5cdFx0XHRcdHJldHVybiBTS0lMTF9QUk9WSURFUl9BQ1RJVkFUSU9OX0VWRU5UO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5ob29rOlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBob29rcyBkb24ndCBoYXZlIGV4dGVuc2lvbiBwcm92aWRlcnNcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbnF1ZXVlUmVhZG9ubHlVcGRhdGUodXJpOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nUmVhZG9ubHlVcmlzLnB1c2godXJpKTtcblx0XHRpZiAoIXRoaXMuX3BlbmRpbmdSZWFkb25seUZsdXNoKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVhZG9ubHlGbHVzaCA9IHRydWU7XG5cdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVyaXMgPSB0aGlzLl9wZW5kaW5nUmVhZG9ubHlVcmlzO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nUmVhZG9ubHlVcmlzID0gW107XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdSZWFkb25seUZsdXNoID0gZmFsc2U7XG5cdFx0XHRcdHZvaWQgdGhpcy5maWxlc0NvbmZpZ1NlcnZpY2UudXBkYXRlUmVhZG9ubHkodXJpcywgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb250cmlidXRlZFdoZW5LZXlzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRyaWJ1dGVkV2hlbktleXMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHdoZW5DbGF1c2Ugb2YgdGhpcy5fY29udHJpYnV0ZWRXaGVuQ2xhdXNlcy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgZXhwciA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHdoZW5DbGF1c2UpO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgZXhwcj8ua2V5cygpID8/IFtdKSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRyaWJ1dGVkV2hlbktleXMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgd2hlbkNsYXVzZXMgb2YgdGhpcy5fcHJvdmlkZXJXaGVuQ2xhdXNlcy52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCB3aGVuQ2xhdXNlIG9mIHdoZW5DbGF1c2VzKSB7XG5cdFx0XHRcdGNvbnN0IGV4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSh3aGVuQ2xhdXNlKTtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgZXhwcj8ua2V5cygpID8/IFtdKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29udHJpYnV0ZWRXaGVuS2V5cy5hZGQoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFNraWxsIHZhbGlkYXRpb25cblxuXHRwcml2YXRlIGFzeW5jIF92YWxpZGF0ZUFuZFNhbml0aXplU2tpbGxGaWxlKHVyaTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgbmFtZTogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRjb25zdCBwYXJzZWRGaWxlID0gYXdhaXQgdGhpcy5fcGFyc2VQcm9tcHRGaWxlKHVyaSwgdG9rZW4pO1xuXHRcdGNvbnN0IGZvbGRlck5hbWUgPSBnZXRTa2lsbEZvbGRlck5hbWUodXJpKTtcblxuXHRcdGxldCBuYW1lID0gcGFyc2VkRmlsZS5oZWFkZXI/Lm5hbWU7XG5cdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5kZWJ1ZyhgW3ZhbGlkYXRlQW5kU2FuaXRpemVTa2lsbEZpbGVdIEFnZW50IHNraWxsIGZpbGUgbWlzc2luZyBuYW1lIGF0dHJpYnV0ZSwgdXNpbmcgZm9sZGVyIG5hbWUgXCIke2ZvbGRlck5hbWV9XCI6ICR7dXJpfWApO1xuXHRcdFx0bmFtZSA9IGZvbGRlck5hbWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBwYXJzZWRGaWxlLmhlYWRlcj8uZGVzY3JpcHRpb247XG5cblx0XHQvLyBTYW5pdGl6ZSB0aGUgbmFtZSBmaXJzdCAocmVtb3ZlIFhNTCB0YWdzIGFuZCB0cnVuY2F0ZSlcblx0XHRsZXQgc2FuaXRpemVkTmFtZSA9IHRoaXMuX3RydW5jYXRlQWdlbnRTa2lsbE5hbWUobmFtZSwgdXJpKTtcblxuXHRcdC8vIElmIHNhbml0aXplZCBuYW1lIGRvZXNuJ3QgbWF0Y2ggZm9sZGVyIG5hbWUsIHVzZSBmb2xkZXIgbmFtZSAoY29uc2lzdGVudCB3aXRoIGNvbXB1dGVTa2lsbERpc2NvdmVyeUluZm8pXG5cdFx0aWYgKHNhbml0aXplZE5hbWUgIT09IGZvbGRlck5hbWUpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmRlYnVnKGBbdmFsaWRhdGVBbmRTYW5pdGl6ZVNraWxsRmlsZV0gQWdlbnQgc2tpbGwgbmFtZSBcIiR7c2FuaXRpemVkTmFtZX1cIiBkb2VzIG5vdCBtYXRjaCBmb2xkZXIgbmFtZSBcIiR7Zm9sZGVyTmFtZX1cIiwgdXNpbmcgZm9sZGVyIG5hbWU6ICR7dXJpfWApO1xuXHRcdFx0c2FuaXRpemVkTmFtZSA9IGZvbGRlck5hbWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2FuaXRpemVkRGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbiA/IHRoaXMuX3RydW5jYXRlQWdlbnRTa2lsbERlc2NyaXB0aW9uKGRlc2NyaXB0aW9uLCB1cmkpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB7IG5hbWU6IHNhbml0aXplZE5hbWUsIGRlc2NyaXB0aW9uOiBzYW5pdGl6ZWREZXNjcmlwdGlvbiB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGFyc2VQcm9tcHRGaWxlKHVyaTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFBhcnNlZFByb21wdEZpbGU+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHVyaSk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIG1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdH1cblx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2FuaXRpemVBZ2VudFNraWxsVGV4dCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdC8vIFJlbW92ZSBYTUwgdGFnc1xuXHRcdHJldHVybiB0ZXh0LnJlcGxhY2UoLzxbXj5dKz4vZywgJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJ1bmNhdGVBZ2VudFNraWxsTmFtZShuYW1lOiBzdHJpbmcsIHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRjb25zdCBNQVhfTkFNRV9MRU5HVEggPSA2NDtcblx0XHRjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLl9zYW5pdGl6ZUFnZW50U2tpbGxUZXh0KG5hbWUpO1xuXHRcdGlmIChzYW5pdGl6ZWQgIT09IG5hbWUpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmRlYnVnKGBbZmluZEFnZW50U2tpbGxzXSBBZ2VudCBza2lsbCBuYW1lIGNvbnRhaW5zIFhNTCB0YWdzLCByZW1vdmVkOiAke3VyaX1gKTtcblx0XHR9XG5cdFx0aWYgKHNhbml0aXplZC5sZW5ndGggPiBNQVhfTkFNRV9MRU5HVEgpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmRlYnVnKGBbZmluZEFnZW50U2tpbGxzXSBBZ2VudCBza2lsbCBuYW1lIGV4Y2VlZHMgJHtNQVhfTkFNRV9MRU5HVEh9IGNoYXJhY3RlcnMsIHRydW5jYXRlZDogJHt1cml9YCk7XG5cdFx0XHRyZXR1cm4gc2FuaXRpemVkLnN1YnN0cmluZygwLCBNQVhfTkFNRV9MRU5HVEgpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2FuaXRpemVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJ1bmNhdGVBZ2VudFNraWxsRGVzY3JpcHRpb24oZGVzY3JpcHRpb246IHN0cmluZywgdXJpOiBVUkkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IE1BWF9ERVNDUklQVElPTl9MRU5HVEggPSAxMDI0O1xuXHRcdGNvbnN0IHNhbml0aXplZCA9IHRoaXMuX3Nhbml0aXplQWdlbnRTa2lsbFRleHQoZGVzY3JpcHRpb24pO1xuXHRcdGlmIChzYW5pdGl6ZWQgIT09IGRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5kZWJ1ZyhgW2ZpbmRBZ2VudFNraWxsc10gQWdlbnQgc2tpbGwgZGVzY3JpcHRpb24gY29udGFpbnMgWE1MIHRhZ3MsIHJlbW92ZWQ6ICR7dXJpfWApO1xuXHRcdH1cblx0XHRpZiAoc2FuaXRpemVkLmxlbmd0aCA+IE1BWF9ERVNDUklQVElPTl9MRU5HVEgpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmRlYnVnKGBbZmluZEFnZW50U2tpbGxzXSBBZ2VudCBza2lsbCBkZXNjcmlwdGlvbiBleGNlZWRzICR7TUFYX0RFU0NSSVBUSU9OX0xFTkdUSH0gY2hhcmFjdGVycywgdHJ1bmNhdGVkOiAke3VyaX1gKTtcblx0XHRcdHJldHVybiBzYW5pdGl6ZWQuc3Vic3RyaW5nKDAsIE1BWF9ERVNDUklQVElPTl9MRU5HVEgpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2FuaXRpemVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLDJCQUEyQjtBQUN2RCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBRW5ELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQTJCLHdCQUF3QjtBQUNuRCxTQUFTLGtCQUFrQixtQkFBbUI7QUFDOUM7QUFBQSxFQUNDO0FBQUEsRUFFQTtBQUFBLEVBR0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFnQlAsTUFBTSxtQkFBMkM7QUFBQSxFQUNoRCxZQUFZO0FBQUEsRUFDWixZQUFZO0FBQUEsRUFDWixZQUFZO0FBQUEsRUFDWixZQUFZO0FBQUEsRUFDWixZQUFZO0FBQ2I7QUFZTyxJQUFNLDZCQUFOLGNBQXlDLFdBQVc7QUFBQSxFQXNDMUQsWUFDK0IsUUFDQyxhQUNDLGNBQ0ksa0JBQ1Msb0JBQ1IsbUJBQ3BDO0FBQ0QsVUFBTTtBQVB3QjtBQUNDO0FBQ0M7QUFDSTtBQUNTO0FBQ1I7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
