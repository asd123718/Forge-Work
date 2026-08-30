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
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { RawContextKey, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { AutoSaveConfiguration, HotExitConfiguration, FILES_READONLY_INCLUDE_CONFIG, FILES_READONLY_EXCLUDE_CONFIG, IFileService, hasReadonlyCapability } from "../../../../platform/files/common/files.js";
import { equals } from "../../../../base/common/objects.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ResourceGlobMatcher } from "../../../common/resources.js";
import { GlobalIdleValue } from "../../../../base/common/async.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { LRUCache, ResourceMap } from "../../../../base/common/map.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { EditorResourceAccessor, SaveReason, SideBySideEditor } from "../../../common/editor.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
const AutoSaveAfterShortDelayContext = new RawContextKey("autoSaveAfterShortDelayContext", false, true);
var AutoSaveMode = /* @__PURE__ */ ((AutoSaveMode2) => {
  AutoSaveMode2[AutoSaveMode2["OFF"] = 0] = "OFF";
  AutoSaveMode2[AutoSaveMode2["AFTER_SHORT_DELAY"] = 1] = "AFTER_SHORT_DELAY";
  AutoSaveMode2[AutoSaveMode2["AFTER_LONG_DELAY"] = 2] = "AFTER_LONG_DELAY";
  AutoSaveMode2[AutoSaveMode2["ON_FOCUS_CHANGE"] = 3] = "ON_FOCUS_CHANGE";
  AutoSaveMode2[AutoSaveMode2["ON_WINDOW_CHANGE"] = 4] = "ON_WINDOW_CHANGE";
  return AutoSaveMode2;
})(AutoSaveMode || {});
var AutoSaveDisabledReason = /* @__PURE__ */ ((AutoSaveDisabledReason2) => {
  AutoSaveDisabledReason2[AutoSaveDisabledReason2["SETTINGS"] = 1] = "SETTINGS";
  AutoSaveDisabledReason2[AutoSaveDisabledReason2["OUT_OF_WORKSPACE"] = 2] = "OUT_OF_WORKSPACE";
  AutoSaveDisabledReason2[AutoSaveDisabledReason2["ERRORS"] = 3] = "ERRORS";
  AutoSaveDisabledReason2[AutoSaveDisabledReason2["DISABLED"] = 4] = "DISABLED";
  return AutoSaveDisabledReason2;
})(AutoSaveDisabledReason || {});
const IFilesConfigurationService = createDecorator("filesConfigurationService");
let FilesConfigurationService = class extends Disposable {
  constructor(contextKeyService, configurationService, contextService, environmentService, uriIdentityService, fileService, markerService, textResourceConfigurationService) {
    super();
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.environmentService = environmentService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.markerService = markerService;
    this.textResourceConfigurationService = textResourceConfigurationService;
    this._onDidChangeAutoSaveConfiguration = this._register(new Emitter());
    this.onDidChangeAutoSaveConfiguration = this._onDidChangeAutoSaveConfiguration.event;
    this._onDidChangeAutoSaveDisabled = this._register(new Emitter());
    this.onDidChangeAutoSaveDisabled = this._onDidChangeAutoSaveDisabled.event;
    this._onDidChangeFilesAssociation = this._register(new Emitter());
    this.onDidChangeFilesAssociation = this._onDidChangeFilesAssociation.event;
    this._onDidChangeReadonly = this._register(new Emitter());
    this.onDidChangeReadonly = this._onDidChangeReadonly.event;
    this.autoSaveConfigurationCache = new LRUCache(1e3);
    this.autoSaveAfterShortDelayOverrides = new ResourceMap();
    this.autoSaveDisabledOverrides = new ResourceMap();
    this.readonlyIncludeMatcher = this._register(new GlobalIdleValue(() => this.createReadonlyMatcher(FILES_READONLY_INCLUDE_CONFIG)));
    this.readonlyExcludeMatcher = this._register(new GlobalIdleValue(() => this.createReadonlyMatcher(FILES_READONLY_EXCLUDE_CONFIG)));
    this.sessionReadonlyOverrides = new ResourceMap((resource) => this.uriIdentityService.extUri.getComparisonKey(resource));
    this.autoSaveAfterShortDelayContext = AutoSaveAfterShortDelayContext.bindTo(contextKeyService);
    const configuration = configurationService.getValue();
    this.currentGlobalAutoSaveConfiguration = this.computeAutoSaveConfiguration(void 0, configuration.files);
    this.currentFilesAssociationConfiguration = configuration?.files?.associations;
    this.currentHotExitConfiguration = configuration?.files?.hotExit || HotExitConfiguration.ON_EXIT;
    this.onFilesConfigurationChange(configuration, false);
    this.registerListeners();
  }
  createReadonlyMatcher(config) {
    const matcher = this._register(new ResourceGlobMatcher(
      (resource) => this.configurationService.getValue(config, { resource }),
      (event) => event.affectsConfiguration(config),
      this.contextService,
      this.configurationService
    ));
    this._register(matcher.onExpressionChange(() => this._onDidChangeReadonly.fire()));
    return matcher;
  }
  isReadonly(resource, stat) {
    const provider = this.fileService.getProvider(resource.scheme);
    if (provider && hasReadonlyCapability(provider)) {
      return provider.readOnlyMessage ?? FilesConfigurationService.READONLY_MESSAGES.providerReadonly;
    }
    const sessionReadonlyOverride = this.sessionReadonlyOverrides.get(resource);
    if (typeof sessionReadonlyOverride === "boolean") {
      return sessionReadonlyOverride === true ? FilesConfigurationService.READONLY_MESSAGES.sessionReadonly : false;
    }
    if (this.uriIdentityService.extUri.isEqualOrParent(resource, this.environmentService.userRoamingDataHome) || this.uriIdentityService.extUri.isEqual(resource, this.contextService.getWorkspace().configuration ?? void 0)) {
      return false;
    }
    if (this.readonlyIncludeMatcher.value.matches(resource)) {
      return !this.readonlyExcludeMatcher.value.matches(resource) ? FilesConfigurationService.READONLY_MESSAGES.configuredReadonly : false;
    }
    if (this.configuredReadonlyFromPermissions && stat?.locked) {
      return FilesConfigurationService.READONLY_MESSAGES.fileLocked;
    }
    if (stat?.readonly) {
      return FilesConfigurationService.READONLY_MESSAGES.fileReadonly;
    }
    return false;
  }
  async updateReadonly(resource, readonly) {
    if (Array.isArray(resource)) {
      for (const r of resource) {
        this.applyReadonly(r, readonly);
      }
      if (resource.length > 0) {
        this._onDidChangeReadonly.fire();
      }
      return;
    }
    if (readonly === "toggle") {
      let stat = void 0;
      try {
        stat = await this.fileService.resolve(resource, { resolveMetadata: true });
      } catch (error) {
      }
      readonly = !this.isReadonly(resource, stat);
    }
    this.applyReadonly(resource, readonly);
    this._onDidChangeReadonly.fire();
  }
  applyReadonly(resource, readonly) {
    if (readonly === "reset") {
      this.sessionReadonlyOverrides.delete(resource);
    } else {
      this.sessionReadonlyOverrides.set(resource, readonly);
    }
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("files")) {
        this.onFilesConfigurationChange(this.configurationService.getValue(), true);
      }
    }));
  }
  onFilesConfigurationChange(configuration, fromEvent) {
    this.currentGlobalAutoSaveConfiguration = this.computeAutoSaveConfiguration(void 0, configuration.files);
    this.autoSaveConfigurationCache.clear();
    this.autoSaveAfterShortDelayContext.set(this.getAutoSaveMode(void 0).mode === 1 /* AFTER_SHORT_DELAY */);
    if (fromEvent) {
      this._onDidChangeAutoSaveConfiguration.fire();
    }
    const filesAssociation = configuration?.files?.associations;
    if (!equals(this.currentFilesAssociationConfiguration, filesAssociation)) {
      this.currentFilesAssociationConfiguration = filesAssociation;
      if (fromEvent) {
        this._onDidChangeFilesAssociation.fire();
      }
    }
    const hotExitMode = configuration?.files?.hotExit;
    if (hotExitMode === HotExitConfiguration.OFF || hotExitMode === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
      this.currentHotExitConfiguration = hotExitMode;
    } else {
      this.currentHotExitConfiguration = HotExitConfiguration.ON_EXIT;
    }
    const readonlyFromPermissions = Boolean(configuration?.files?.readonlyFromPermissions);
    if (readonlyFromPermissions !== Boolean(this.configuredReadonlyFromPermissions)) {
      this.configuredReadonlyFromPermissions = readonlyFromPermissions;
      if (fromEvent) {
        this._onDidChangeReadonly.fire();
      }
    }
  }
  getAutoSaveConfiguration(resourceOrEditor) {
    const resource = this.toResource(resourceOrEditor);
    if (resource) {
      let resourceAutoSaveConfiguration = this.autoSaveConfigurationCache.get(resource);
      if (!resourceAutoSaveConfiguration) {
        resourceAutoSaveConfiguration = this.computeAutoSaveConfiguration(resource, this.textResourceConfigurationService.getValue(resource, "files"));
        this.autoSaveConfigurationCache.set(resource, resourceAutoSaveConfiguration);
      }
      return resourceAutoSaveConfiguration;
    }
    return this.currentGlobalAutoSaveConfiguration;
  }
  computeAutoSaveConfiguration(resource, filesConfiguration) {
    let autoSave;
    let autoSaveDelay;
    let autoSaveWorkspaceFilesOnly;
    let autoSaveWhenNoErrors;
    let isOutOfWorkspace;
    let isShortAutoSaveDelay;
    switch (filesConfiguration?.autoSave ?? FilesConfigurationService.DEFAULT_AUTO_SAVE_MODE) {
      case AutoSaveConfiguration.AFTER_DELAY: {
        autoSave = "afterDelay";
        autoSaveDelay = typeof filesConfiguration?.autoSaveDelay === "number" && filesConfiguration.autoSaveDelay >= 0 ? filesConfiguration.autoSaveDelay : FilesConfigurationService.DEFAULT_AUTO_SAVE_DELAY;
        isShortAutoSaveDelay = autoSaveDelay <= FilesConfigurationService.DEFAULT_AUTO_SAVE_DELAY;
        break;
      }
      case AutoSaveConfiguration.ON_FOCUS_CHANGE:
        autoSave = "onFocusChange";
        break;
      case AutoSaveConfiguration.ON_WINDOW_CHANGE:
        autoSave = "onWindowChange";
        break;
    }
    if (filesConfiguration?.autoSaveWorkspaceFilesOnly === true) {
      autoSaveWorkspaceFilesOnly = true;
      if (resource && !this.contextService.isInsideWorkspace(resource)) {
        isOutOfWorkspace = true;
        isShortAutoSaveDelay = void 0;
      }
    }
    if (filesConfiguration?.autoSaveWhenNoErrors === true) {
      autoSaveWhenNoErrors = true;
      isShortAutoSaveDelay = void 0;
    }
    return {
      autoSave,
      autoSaveDelay,
      autoSaveWorkspaceFilesOnly,
      autoSaveWhenNoErrors,
      isOutOfWorkspace,
      isShortAutoSaveDelay
    };
  }
  toResource(resourceOrEditor) {
    if (resourceOrEditor instanceof EditorInput) {
      return EditorResourceAccessor.getOriginalUri(resourceOrEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    }
    return resourceOrEditor;
  }
  hasShortAutoSaveDelay(resourceOrEditor) {
    const resource = this.toResource(resourceOrEditor);
    if (resource && this.autoSaveAfterShortDelayOverrides.has(resource)) {
      return true;
    }
    if (this.getAutoSaveConfiguration(resource).isShortAutoSaveDelay) {
      return !resource || !this.autoSaveDisabledOverrides.has(resource);
    }
    return false;
  }
  getAutoSaveMode(resourceOrEditor, saveReason) {
    const resource = this.toResource(resourceOrEditor);
    if (resource && this.autoSaveAfterShortDelayOverrides.has(resource)) {
      return { mode: 1 /* AFTER_SHORT_DELAY */ };
    }
    if (resource && this.autoSaveDisabledOverrides.has(resource)) {
      return { mode: 0 /* OFF */, reason: 4 /* DISABLED */ };
    }
    const autoSaveConfiguration = this.getAutoSaveConfiguration(resource);
    if (typeof autoSaveConfiguration.autoSave === "undefined") {
      return { mode: 0 /* OFF */, reason: 1 /* SETTINGS */ };
    }
    if (typeof saveReason === "number") {
      if (autoSaveConfiguration.autoSave === "afterDelay" && saveReason !== SaveReason.AUTO || autoSaveConfiguration.autoSave === "onFocusChange" && saveReason !== SaveReason.FOCUS_CHANGE && saveReason !== SaveReason.WINDOW_CHANGE || autoSaveConfiguration.autoSave === "onWindowChange" && saveReason !== SaveReason.WINDOW_CHANGE) {
        return { mode: 0 /* OFF */, reason: 1 /* SETTINGS */ };
      }
    }
    if (resource) {
      if (autoSaveConfiguration.autoSaveWorkspaceFilesOnly && autoSaveConfiguration.isOutOfWorkspace) {
        return { mode: 0 /* OFF */, reason: 2 /* OUT_OF_WORKSPACE */ };
      }
      if (autoSaveConfiguration.autoSaveWhenNoErrors && this.markerService.read({ resource, take: 1, severities: MarkerSeverity.Error }).length > 0) {
        return { mode: 0 /* OFF */, reason: 3 /* ERRORS */ };
      }
    }
    switch (autoSaveConfiguration.autoSave) {
      case "afterDelay":
        if (typeof autoSaveConfiguration.autoSaveDelay === "number" && autoSaveConfiguration.autoSaveDelay <= FilesConfigurationService.DEFAULT_AUTO_SAVE_DELAY) {
          return { mode: autoSaveConfiguration.autoSaveWhenNoErrors ? 2 /* AFTER_LONG_DELAY */ : 1 /* AFTER_SHORT_DELAY */ };
        }
        return { mode: 2 /* AFTER_LONG_DELAY */ };
      case "onFocusChange":
        return { mode: 3 /* ON_FOCUS_CHANGE */ };
      case "onWindowChange":
        return { mode: 4 /* ON_WINDOW_CHANGE */ };
    }
  }
  async toggleAutoSave() {
    const currentSetting = this.configurationService.getValue("files.autoSave");
    let newAutoSaveValue;
    if ([AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE].some((setting) => setting === currentSetting)) {
      newAutoSaveValue = AutoSaveConfiguration.OFF;
    } else {
      newAutoSaveValue = AutoSaveConfiguration.AFTER_DELAY;
    }
    return this.configurationService.updateValue("files.autoSave", newAutoSaveValue);
  }
  enableAutoSaveAfterShortDelay(resourceOrEditor) {
    const resource = this.toResource(resourceOrEditor);
    if (!resource) {
      return Disposable.None;
    }
    const counter = this.autoSaveAfterShortDelayOverrides.get(resource) ?? 0;
    this.autoSaveAfterShortDelayOverrides.set(resource, counter + 1);
    return toDisposable(() => {
      const counter2 = this.autoSaveAfterShortDelayOverrides.get(resource) ?? 0;
      if (counter2 <= 1) {
        this.autoSaveAfterShortDelayOverrides.delete(resource);
      } else {
        this.autoSaveAfterShortDelayOverrides.set(resource, counter2 - 1);
      }
    });
  }
  disableAutoSave(resourceOrEditor) {
    const resource = this.toResource(resourceOrEditor);
    if (!resource) {
      return Disposable.None;
    }
    const counter = this.autoSaveDisabledOverrides.get(resource) ?? 0;
    this.autoSaveDisabledOverrides.set(resource, counter + 1);
    if (counter === 0) {
      this._onDidChangeAutoSaveDisabled.fire(resource);
    }
    return toDisposable(() => {
      const counter2 = this.autoSaveDisabledOverrides.get(resource) ?? 0;
      if (counter2 <= 1) {
        this.autoSaveDisabledOverrides.delete(resource);
        this._onDidChangeAutoSaveDisabled.fire(resource);
      } else {
        this.autoSaveDisabledOverrides.set(resource, counter2 - 1);
      }
    });
  }
  get isHotExitEnabled() {
    if (this.contextService.getWorkspace().transient) {
      return false;
    }
    return this.currentHotExitConfiguration !== HotExitConfiguration.OFF;
  }
  get hotExitConfiguration() {
    return this.currentHotExitConfiguration;
  }
  preventSaveConflicts(resource, language) {
    return this.configurationService.getValue("files.saveConflictResolution", { resource, overrideIdentifier: language }) !== "overwriteFileOnDisk";
  }
};
FilesConfigurationService.DEFAULT_AUTO_SAVE_MODE = isWeb ? AutoSaveConfiguration.AFTER_DELAY : AutoSaveConfiguration.OFF;
FilesConfigurationService.DEFAULT_AUTO_SAVE_DELAY = 1e3;
FilesConfigurationService.READONLY_MESSAGES = {
  providerReadonly: { value: localize("providerReadonly", "Editor is read-only because the file system of the file is read-only."), isTrusted: true },
  sessionReadonly: { value: localize({ key: "sessionReadonly", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Editor is read-only because the file was set read-only in this session. [Click here](command:{0}) to set writeable.", "workbench.action.files.setActiveEditorWriteableInSession"), isTrusted: true },
  configuredReadonly: { value: localize({ key: "configuredReadonly", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Editor is read-only because the file was set read-only via settings. [Click here](command:{0}) to configure or [toggle for this session](command:{1}).", `workbench.action.openSettings?${encodeURIComponent('["files.readonly"]')}`, "workbench.action.files.toggleActiveEditorReadonlyInSession"), isTrusted: true },
  fileLocked: { value: localize({ key: "fileLocked", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Editor is read-only because of file permissions. [Click here](command:{0}) to set writeable anyway.", "workbench.action.files.setActiveEditorWriteableInSession"), isTrusted: true },
  fileReadonly: { value: localize("fileReadonly", "Editor is read-only because the file is read-only."), isTrusted: true }
};
FilesConfigurationService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IMarkerService),
  __decorateParam(7, ITextResourceConfigurationService)
], FilesConfigurationService);
registerSingleton(IFilesConfigurationService, FilesConfigurationService, InstantiationType.Eager);
export {
  AutoSaveAfterShortDelayContext,
  AutoSaveDisabledReason,
  AutoSaveMode,
  FilesConfigurationService,
  IFilesConfigurationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxmaWxlc0NvbmZpZ3VyYXRpb25cXGNvbW1vblxcZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmF3Q29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBJQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uLCBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24sIEhvdEV4aXRDb25maWd1cmF0aW9uLCBGSUxFU19SRUFET05MWV9JTkNMVURFX0NPTkZJRywgRklMRVNfUkVBRE9OTFlfRVhDTFVERV9DT05GSUcsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgSUZpbGVTZXJ2aWNlLCBJQmFzZUZpbGVTdGF0LCBoYXNSZWFkb25seUNhcGFiaWxpdHksIElGaWxlc0NvbmZpZ3VyYXRpb25Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VHbG9iTWF0Y2hlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgR2xvYmFsSWRsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IExSVUNhY2hlLCBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2F2ZVJlYXNvbiwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UsIE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5cbmV4cG9ydCBjb25zdCBBdXRvU2F2ZUFmdGVyU2hvcnREZWxheUNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYXV0b1NhdmVBZnRlclNob3J0RGVsYXlDb250ZXh0JywgZmFsc2UsIHRydWUpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBdXRvU2F2ZUNvbmZpZ3VyYXRpb24ge1xuXHRhdXRvU2F2ZT86ICdhZnRlckRlbGF5JyB8ICdvbkZvY3VzQ2hhbmdlJyB8ICdvbldpbmRvd0NoYW5nZSc7XG5cdGF1dG9TYXZlRGVsYXk/OiBudW1iZXI7XG5cdGF1dG9TYXZlV29ya3NwYWNlRmlsZXNPbmx5PzogYm9vbGVhbjtcblx0YXV0b1NhdmVXaGVuTm9FcnJvcnM/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUNhY2hlZEF1dG9TYXZlQ29uZmlndXJhdGlvbiBleHRlbmRzIElBdXRvU2F2ZUNvbmZpZ3VyYXRpb24ge1xuXG5cdC8vIFNvbWUgZXh0cmEgc3RhdGUgdGhhdCB3ZSBjYWNoZSB0byByZWR1Y2UgdGhlIGFtb3VudFxuXHQvLyBvZiBsb29rdXAgd2UgaGF2ZSB0byBkbyBzaW5jZSBhdXRvIHNhdmUgbWV0aG9kc1xuXHQvLyBhcmUgYmVpbmcgY2FsbGVkIHZlcnkgb2Z0ZW4sIGUuZy4gd2hlbiBjb250ZW50IGNoYW5nZXNcblxuXHRpc091dE9mV29ya3NwYWNlPzogYm9vbGVhbjtcblx0aXNTaG9ydEF1dG9TYXZlRGVsYXk/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBBdXRvU2F2ZU1vZGUge1xuXHRPRkYsXG5cdEFGVEVSX1NIT1JUX0RFTEFZLFxuXHRBRlRFUl9MT05HX0RFTEFZLFxuXHRPTl9GT0NVU19DSEFOR0UsXG5cdE9OX1dJTkRPV19DSEFOR0Vcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQXV0b1NhdmVEaXNhYmxlZFJlYXNvbiB7XG5cdFNFVFRJTkdTID0gMSxcblx0T1VUX09GX1dPUktTUEFDRSxcblx0RVJST1JTLFxuXHRESVNBQkxFRFxufVxuXG5leHBvcnQgdHlwZSBJQXV0b1NhdmVNb2RlID0gSUVuYWJsZWRBdXRvU2F2ZU1vZGUgfCBJRGlzYWJsZWRBdXRvU2F2ZU1vZGU7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVuYWJsZWRBdXRvU2F2ZU1vZGUge1xuXHRyZWFkb25seSBtb2RlOiBBdXRvU2F2ZU1vZGUuQUZURVJfU0hPUlRfREVMQVkgfCBBdXRvU2F2ZU1vZGUuQUZURVJfTE9OR19ERUxBWSB8IEF1dG9TYXZlTW9kZS5PTl9GT0NVU19DSEFOR0UgfCBBdXRvU2F2ZU1vZGUuT05fV0lORE9XX0NIQU5HRTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlzYWJsZWRBdXRvU2F2ZU1vZGUge1xuXHRyZWFkb25seSBtb2RlOiBBdXRvU2F2ZU1vZGUuT0ZGO1xuXHRyZWFkb25seSByZWFzb246IEF1dG9TYXZlRGlzYWJsZWRSZWFzb247XG59XG5cbmV4cG9ydCBjb25zdCBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZT4oJ2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8vI3JlZ2lvbiBBdXRvIFNhdmVcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUF1dG9TYXZlQ29uZmlndXJhdGlvbjogRXZlbnQ8dm9pZD47XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBdXRvU2F2ZURpc2FibGVkOiBFdmVudDxVUkk+O1xuXG5cdGdldEF1dG9TYXZlQ29uZmlndXJhdGlvbihyZXNvdXJjZU9yRWRpdG9yOiBFZGl0b3JJbnB1dCB8IFVSSSB8IHVuZGVmaW5lZCk6IElBdXRvU2F2ZUNvbmZpZ3VyYXRpb247XG5cblx0aGFzU2hvcnRBdXRvU2F2ZURlbGF5KHJlc291cmNlT3JFZGl0b3I6IEVkaXRvcklucHV0IHwgVVJJIHwgdW5kZWZpbmVkKTogYm9vbGVhbjtcblxuXHRnZXRBdXRvU2F2ZU1vZGUocmVzb3VyY2VPckVkaXRvcjogRWRpdG9ySW5wdXQgfCBVUkkgfCB1bmRlZmluZWQsIHNhdmVSZWFzb24/OiBTYXZlUmVhc29uKTogSUF1dG9TYXZlTW9kZTtcblxuXHR0b2dnbGVBdXRvU2F2ZSgpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdGVuYWJsZUF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5KHJlc291cmNlT3JFZGl0b3I6IEVkaXRvcklucHV0IHwgVVJJKTogSURpc3Bvc2FibGU7XG5cdGRpc2FibGVBdXRvU2F2ZShyZXNvdXJjZU9yRWRpdG9yOiBFZGl0b3JJbnB1dCB8IFVSSSk6IElEaXNwb3NhYmxlO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBDb25maWd1cmVkIFJlYWRvbmx5XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWFkb25seTogRXZlbnQ8dm9pZD47XG5cblx0aXNSZWFkb25seShyZXNvdXJjZTogVVJJLCBzdGF0PzogSUJhc2VGaWxlU3RhdCk6IGJvb2xlYW4gfCBJTWFya2Rvd25TdHJpbmc7XG5cblx0dXBkYXRlUmVhZG9ubHkocmVzb3VyY2U6IFVSSSwgcmVhZG9ubHk6IHRydWUgfCBmYWxzZSB8ICd0b2dnbGUnIHwgJ3Jlc2V0Jyk6IFByb21pc2U8dm9pZD47XG5cdHVwZGF0ZVJlYWRvbmx5KHJlc291cmNlOiBVUklbXSwgcmVhZG9ubHk6IHRydWUgfCBmYWxzZSB8ICdyZXNldCcpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmlsZXNBc3NvY2lhdGlvbjogRXZlbnQ8dm9pZD47XG5cblx0cmVhZG9ubHkgaXNIb3RFeGl0RW5hYmxlZDogYm9vbGVhbjtcblxuXHRyZWFkb25seSBob3RFeGl0Q29uZmlndXJhdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByZXZlbnRTYXZlQ29uZmxpY3RzKHJlc291cmNlOiBVUkksIGxhbmd1YWdlPzogc3RyaW5nKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFRkFVTFRfQVVUT19TQVZFX01PREUgPSBpc1dlYiA/IEF1dG9TYXZlQ29uZmlndXJhdGlvbi5BRlRFUl9ERUxBWSA6IEF1dG9TYXZlQ29uZmlndXJhdGlvbi5PRkY7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFRkFVTFRfQVVUT19TQVZFX0RFTEFZID0gMTAwMDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUFET05MWV9NRVNTQUdFUyA9IHtcblx0XHRwcm92aWRlclJlYWRvbmx5OiB7IHZhbHVlOiBsb2NhbGl6ZSgncHJvdmlkZXJSZWFkb25seScsIFwiRWRpdG9yIGlzIHJlYWQtb25seSBiZWNhdXNlIHRoZSBmaWxlIHN5c3RlbSBvZiB0aGUgZmlsZSBpcyByZWFkLW9ubHkuXCIpLCBpc1RydXN0ZWQ6IHRydWUgfSxcblx0XHRzZXNzaW9uUmVhZG9ubHk6IHsgdmFsdWU6IGxvY2FsaXplKHsga2V5OiAnc2Vzc2lvblJlYWRvbmx5JywgY29tbWVudDogWydQbGVhc2UgZG8gbm90IHRyYW5zbGF0ZSB0aGUgd29yZCBcImNvbW1hbmRcIiwgaXQgaXMgcGFydCBvZiBvdXIgaW50ZXJuYWwgc3ludGF4IHdoaWNoIG11c3Qgbm90IGNoYW5nZScsICd7TG9ja2VkPVwiXShjb21tYW5kOnswfSlcIn0nXSB9LCBcIkVkaXRvciBpcyByZWFkLW9ubHkgYmVjYXVzZSB0aGUgZmlsZSB3YXMgc2V0IHJlYWQtb25seSBpbiB0aGlzIHNlc3Npb24uIFtDbGljayBoZXJlXShjb21tYW5kOnswfSkgdG8gc2V0IHdyaXRlYWJsZS5cIiwgJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMuc2V0QWN0aXZlRWRpdG9yV3JpdGVhYmxlSW5TZXNzaW9uJyksIGlzVHJ1c3RlZDogdHJ1ZSB9LFxuXHRcdGNvbmZpZ3VyZWRSZWFkb25seTogeyB2YWx1ZTogbG9jYWxpemUoeyBrZXk6ICdjb25maWd1cmVkUmVhZG9ubHknLCBjb21tZW50OiBbJ1BsZWFzZSBkbyBub3QgdHJhbnNsYXRlIHRoZSB3b3JkIFwiY29tbWFuZFwiLCBpdCBpcyBwYXJ0IG9mIG91ciBpbnRlcm5hbCBzeW50YXggd2hpY2ggbXVzdCBub3QgY2hhbmdlJywgJ3tMb2NrZWQ9XCJdKGNvbW1hbmQ6ezB9KVwifSddIH0sIFwiRWRpdG9yIGlzIHJlYWQtb25seSBiZWNhdXNlIHRoZSBmaWxlIHdhcyBzZXQgcmVhZC1vbmx5IHZpYSBzZXR0aW5ncy4gW0NsaWNrIGhlcmVdKGNvbW1hbmQ6ezB9KSB0byBjb25maWd1cmUgb3IgW3RvZ2dsZSBmb3IgdGhpcyBzZXNzaW9uXShjb21tYW5kOnsxfSkuXCIsIGB3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncz8ke2VuY29kZVVSSUNvbXBvbmVudCgnW1wiZmlsZXMucmVhZG9ubHlcIl0nKX1gLCAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy50b2dnbGVBY3RpdmVFZGl0b3JSZWFkb25seUluU2Vzc2lvbicpLCBpc1RydXN0ZWQ6IHRydWUgfSxcblx0XHRmaWxlTG9ja2VkOiB7IHZhbHVlOiBsb2NhbGl6ZSh7IGtleTogJ2ZpbGVMb2NrZWQnLCBjb21tZW50OiBbJ1BsZWFzZSBkbyBub3QgdHJhbnNsYXRlIHRoZSB3b3JkIFwiY29tbWFuZFwiLCBpdCBpcyBwYXJ0IG9mIG91ciBpbnRlcm5hbCBzeW50YXggd2hpY2ggbXVzdCBub3QgY2hhbmdlJywgJ3tMb2NrZWQ9XCJdKGNvbW1hbmQ6ezB9KVwifSddIH0sIFwiRWRpdG9yIGlzIHJlYWQtb25seSBiZWNhdXNlIG9mIGZpbGUgcGVybWlzc2lvbnMuIFtDbGljayBoZXJlXShjb21tYW5kOnswfSkgdG8gc2V0IHdyaXRlYWJsZSBhbnl3YXkuXCIsICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnNldEFjdGl2ZUVkaXRvcldyaXRlYWJsZUluU2Vzc2lvbicpLCBpc1RydXN0ZWQ6IHRydWUgfSxcblx0XHRmaWxlUmVhZG9ubHk6IHsgdmFsdWU6IGxvY2FsaXplKCdmaWxlUmVhZG9ubHknLCBcIkVkaXRvciBpcyByZWFkLW9ubHkgYmVjYXVzZSB0aGUgZmlsZSBpcyByZWFkLW9ubHkuXCIpLCBpc1RydXN0ZWQ6IHRydWUgfVxuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQXV0b1NhdmVDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXV0b1NhdmVDb25maWd1cmF0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBdXRvU2F2ZURpc2FibGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBdXRvU2F2ZURpc2FibGVkID0gdGhpcy5fb25EaWRDaGFuZ2VBdXRvU2F2ZURpc2FibGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRmlsZXNBc3NvY2lhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGVzQXNzb2NpYXRpb24gPSB0aGlzLl9vbkRpZENoYW5nZUZpbGVzQXNzb2NpYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZWFkb25seSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlYWRvbmx5ID0gdGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5ldmVudDtcblxuXHRwcml2YXRlIGN1cnJlbnRHbG9iYWxBdXRvU2F2ZUNvbmZpZ3VyYXRpb246IElBdXRvU2F2ZUNvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgY3VycmVudEZpbGVzQXNzb2NpYXRpb25Db25maWd1cmF0aW9uOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRIb3RFeGl0Q29uZmlndXJhdGlvbjogc3RyaW5nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYXV0b1NhdmVDb25maWd1cmF0aW9uQ2FjaGUgPSBuZXcgTFJVQ2FjaGU8VVJJLCBJQ2FjaGVkQXV0b1NhdmVDb25maWd1cmF0aW9uPigxMDAwKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5T3ZlcnJpZGVzID0gbmV3IFJlc291cmNlTWFwPG51bWJlciAvKiBjb3VudGVyICovPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGF1dG9TYXZlRGlzYWJsZWRPdmVycmlkZXMgPSBuZXcgUmVzb3VyY2VNYXA8bnVtYmVyIC8qIGNvdW50ZXIgKi8+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhdXRvU2F2ZUFmdGVyU2hvcnREZWxheUNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVhZG9ubHlJbmNsdWRlTWF0Y2hlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHbG9iYWxJZGxlVmFsdWUoKCkgPT4gdGhpcy5jcmVhdGVSZWFkb25seU1hdGNoZXIoRklMRVNfUkVBRE9OTFlfSU5DTFVERV9DT05GSUcpKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVhZG9ubHlFeGNsdWRlTWF0Y2hlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHbG9iYWxJZGxlVmFsdWUoKCkgPT4gdGhpcy5jcmVhdGVSZWFkb25seU1hdGNoZXIoRklMRVNfUkVBRE9OTFlfRVhDTFVERV9DT05GSUcpKSk7XG5cdHByaXZhdGUgY29uZmlndXJlZFJlYWRvbmx5RnJvbVBlcm1pc3Npb25zOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvblJlYWRvbmx5T3ZlcnJpZGVzID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KHJlc291cmNlID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHJlc291cmNlKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5Q29udGV4dCA9IEF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5Q29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KCk7XG5cblx0XHR0aGlzLmN1cnJlbnRHbG9iYWxBdXRvU2F2ZUNvbmZpZ3VyYXRpb24gPSB0aGlzLmNvbXB1dGVBdXRvU2F2ZUNvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCBjb25maWd1cmF0aW9uLmZpbGVzKTtcblx0XHR0aGlzLmN1cnJlbnRGaWxlc0Fzc29jaWF0aW9uQ29uZmlndXJhdGlvbiA9IGNvbmZpZ3VyYXRpb24/LmZpbGVzPy5hc3NvY2lhdGlvbnM7XG5cdFx0dGhpcy5jdXJyZW50SG90RXhpdENvbmZpZ3VyYXRpb24gPSBjb25maWd1cmF0aW9uPy5maWxlcz8uaG90RXhpdCB8fCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUO1xuXG5cdFx0dGhpcy5vbkZpbGVzQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uLCBmYWxzZSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlYWRvbmx5TWF0Y2hlcihjb25maWc6IHN0cmluZykge1xuXHRcdGNvbnN0IG1hdGNoZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVzb3VyY2VHbG9iTWF0Y2hlcihcblx0XHRcdHJlc291cmNlID0+IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoY29uZmlnLCB7IHJlc291cmNlIH0pLFxuXHRcdFx0ZXZlbnQgPT4gZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oY29uZmlnKSxcblx0XHRcdHRoaXMuY29udGV4dFNlcnZpY2UsXG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihtYXRjaGVyLm9uRXhwcmVzc2lvbkNoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmZpcmUoKSkpO1xuXG5cdFx0cmV0dXJuIG1hdGNoZXI7XG5cdH1cblxuXHRpc1JlYWRvbmx5KHJlc291cmNlOiBVUkksIHN0YXQ/OiBJQmFzZUZpbGVTdGF0KTogYm9vbGVhbiB8IElNYXJrZG93blN0cmluZyB7XG5cblx0XHQvLyBpZiB0aGUgZW50aXJlIGZpbGUgc3lzdGVtIHByb3ZpZGVyIGlzIHJlYWRvbmx5LCB3ZSByZXNwZWN0IHRoYXRcblx0XHQvLyBhbmQgZG8gbm90IGFsbG93IHRvIGNoYW5nZSByZWFkb25seS4gd2UgdGFrZSB0aGlzIGFzIGEgaGludCB0aGF0XG5cdFx0Ly8gdGhlIHByb3ZpZGVyIGhhcyBubyBjYXBhYmlsaXRpZXMgb2Ygd3JpdGluZy5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZmlsZVNlcnZpY2UuZ2V0UHJvdmlkZXIocmVzb3VyY2Uuc2NoZW1lKTtcblx0XHRpZiAocHJvdmlkZXIgJiYgaGFzUmVhZG9ubHlDYXBhYmlsaXR5KHByb3ZpZGVyKSkge1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyLnJlYWRPbmx5TWVzc2FnZSA/PyBGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLlJFQURPTkxZX01FU1NBR0VTLnByb3ZpZGVyUmVhZG9ubHk7XG5cdFx0fVxuXG5cdFx0Ly8gc2Vzc2lvbiBvdmVycmlkZSBhbHdheXMgd2lucyBvdmVyIHRoZSBvdGhlcnNcblx0XHRjb25zdCBzZXNzaW9uUmVhZG9ubHlPdmVycmlkZSA9IHRoaXMuc2Vzc2lvblJlYWRvbmx5T3ZlcnJpZGVzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKHR5cGVvZiBzZXNzaW9uUmVhZG9ubHlPdmVycmlkZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvblJlYWRvbmx5T3ZlcnJpZGUgPT09IHRydWUgPyBGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLlJFQURPTkxZX01FU1NBR0VTLnNlc3Npb25SZWFkb25seSA6IGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJSb2FtaW5nRGF0YUhvbWUpIHx8XG5cdFx0XHR0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChyZXNvdXJjZSwgdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uID8/IHVuZGVmaW5lZClcblx0XHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gZXhwbGljaXRseSBleGNsdWRlIHNvbWUgcGF0aHMgZnJvbSByZWFkb25seSB0aGF0IHdlIG5lZWQgZm9yIGNvbmZpZ3VyYXRpb25cblx0XHR9XG5cblx0XHQvLyBjb25maWd1cmVkIGdsb2IgcGF0dGVybnMgd2luIG92ZXIgc3RhdCBpbmZvcm1hdGlvblxuXHRcdGlmICh0aGlzLnJlYWRvbmx5SW5jbHVkZU1hdGNoZXIudmFsdWUubWF0Y2hlcyhyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiAhdGhpcy5yZWFkb25seUV4Y2x1ZGVNYXRjaGVyLnZhbHVlLm1hdGNoZXMocmVzb3VyY2UpID8gRmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5SRUFET05MWV9NRVNTQUdFUy5jb25maWd1cmVkUmVhZG9ubHkgOiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBjaGVjayBpZiBmaWxlIGlzIGxvY2tlZCBhbmQgY29uZmlndXJlZCB0byB0cmVhdCBhcyByZWFkb25seVxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyZWRSZWFkb25seUZyb21QZXJtaXNzaW9ucyAmJiBzdGF0Py5sb2NrZWQpIHtcblx0XHRcdHJldHVybiBGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLlJFQURPTkxZX01FU1NBR0VTLmZpbGVMb2NrZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgaWYgZmlsZSBpcyBtYXJrZWQgcmVhZG9ubHkgZnJvbSB0aGUgZmlsZSBzeXN0ZW0gcHJvdmlkZXJcblx0XHRpZiAoc3RhdD8ucmVhZG9ubHkpIHtcblx0XHRcdHJldHVybiBGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLlJFQURPTkxZX01FU1NBR0VTLmZpbGVSZWFkb25seTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVSZWFkb25seShyZXNvdXJjZTogVVJJIHwgVVJJW10sIHJlYWRvbmx5OiB0cnVlIHwgZmFsc2UgfCAndG9nZ2xlJyB8ICdyZXNldCcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShyZXNvdXJjZSkpIHtcblx0XHRcdGZvciAoY29uc3QgciBvZiByZXNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLmFwcGx5UmVhZG9ubHkociwgcmVhZG9ubHkgYXMgdHJ1ZSB8IGZhbHNlIHwgJ3Jlc2V0Jyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzb3VyY2UubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmZpcmUoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocmVhZG9ubHkgPT09ICd0b2dnbGUnKSB7XG5cdFx0XHRsZXQgc3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdH1cblxuXHRcdFx0cmVhZG9ubHkgPSAhdGhpcy5pc1JlYWRvbmx5KHJlc291cmNlLCBzdGF0KTtcblx0XHR9XG5cblx0XHR0aGlzLmFwcGx5UmVhZG9ubHkocmVzb3VyY2UsIHJlYWRvbmx5KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlSZWFkb25seShyZXNvdXJjZTogVVJJLCByZWFkb25seTogdHJ1ZSB8IGZhbHNlIHwgJ3Jlc2V0Jyk6IHZvaWQge1xuXHRcdGlmIChyZWFkb25seSA9PT0gJ3Jlc2V0Jykge1xuXHRcdFx0dGhpcy5zZXNzaW9uUmVhZG9ubHlPdmVycmlkZXMuZGVsZXRlKHJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXNzaW9uUmVhZG9ubHlPdmVycmlkZXMuc2V0KHJlc291cmNlLCByZWFkb25seSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIEZpbGVzIGNvbmZpZ3VyYXRpb24gY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZpbGVzJykpIHtcblx0XHRcdFx0dGhpcy5vbkZpbGVzQ29uZmlndXJhdGlvbkNoYW5nZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KCksIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkZpbGVzQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uOiBJRmlsZXNDb25maWd1cmF0aW9uLCBmcm9tRXZlbnQ6IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIEF1dG8gU2F2ZVxuXHRcdHRoaXMuY3VycmVudEdsb2JhbEF1dG9TYXZlQ29uZmlndXJhdGlvbiA9IHRoaXMuY29tcHV0ZUF1dG9TYXZlQ29uZmlndXJhdGlvbih1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb24uZmlsZXMpO1xuXHRcdHRoaXMuYXV0b1NhdmVDb25maWd1cmF0aW9uQ2FjaGUuY2xlYXIoKTtcblx0XHR0aGlzLmF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5Q29udGV4dC5zZXQodGhpcy5nZXRBdXRvU2F2ZU1vZGUodW5kZWZpbmVkKS5tb2RlID09PSBBdXRvU2F2ZU1vZGUuQUZURVJfU0hPUlRfREVMQVkpO1xuXHRcdGlmIChmcm9tRXZlbnQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQXV0b1NhdmVDb25maWd1cmF0aW9uLmZpcmUoKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgY2hhbmdlIGluIGZpbGVzIGFzc29jaWF0aW9uc1xuXHRcdGNvbnN0IGZpbGVzQXNzb2NpYXRpb24gPSBjb25maWd1cmF0aW9uPy5maWxlcz8uYXNzb2NpYXRpb25zO1xuXHRcdGlmICghZXF1YWxzKHRoaXMuY3VycmVudEZpbGVzQXNzb2NpYXRpb25Db25maWd1cmF0aW9uLCBmaWxlc0Fzc29jaWF0aW9uKSkge1xuXHRcdFx0dGhpcy5jdXJyZW50RmlsZXNBc3NvY2lhdGlvbkNvbmZpZ3VyYXRpb24gPSBmaWxlc0Fzc29jaWF0aW9uO1xuXHRcdFx0aWYgKGZyb21FdmVudCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZpbGVzQXNzb2NpYXRpb24uZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhvdCBleGl0XG5cdFx0Y29uc3QgaG90RXhpdE1vZGUgPSBjb25maWd1cmF0aW9uPy5maWxlcz8uaG90RXhpdDtcblx0XHRpZiAoaG90RXhpdE1vZGUgPT09IEhvdEV4aXRDb25maWd1cmF0aW9uLk9GRiB8fCBob3RFeGl0TW9kZSA9PT0gSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnRIb3RFeGl0Q29uZmlndXJhdGlvbiA9IGhvdEV4aXRNb2RlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmN1cnJlbnRIb3RFeGl0Q29uZmlndXJhdGlvbiA9IEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmVhZG9ubHlcblx0XHRjb25zdCByZWFkb25seUZyb21QZXJtaXNzaW9ucyA9IEJvb2xlYW4oY29uZmlndXJhdGlvbj8uZmlsZXM/LnJlYWRvbmx5RnJvbVBlcm1pc3Npb25zKTtcblx0XHRpZiAocmVhZG9ubHlGcm9tUGVybWlzc2lvbnMgIT09IEJvb2xlYW4odGhpcy5jb25maWd1cmVkUmVhZG9ubHlGcm9tUGVybWlzc2lvbnMpKSB7XG5cdFx0XHR0aGlzLmNvbmZpZ3VyZWRSZWFkb25seUZyb21QZXJtaXNzaW9ucyA9IHJlYWRvbmx5RnJvbVBlcm1pc3Npb25zO1xuXHRcdFx0aWYgKGZyb21FdmVudCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJlYWRvbmx5LmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRBdXRvU2F2ZUNvbmZpZ3VyYXRpb24ocmVzb3VyY2VPckVkaXRvcjogRWRpdG9ySW5wdXQgfCBVUkkgfCB1bmRlZmluZWQpOiBJQ2FjaGVkQXV0b1NhdmVDb25maWd1cmF0aW9uIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMudG9SZXNvdXJjZShyZXNvdXJjZU9yRWRpdG9yKTtcblx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdGxldCByZXNvdXJjZUF1dG9TYXZlQ29uZmlndXJhdGlvbiA9IHRoaXMuYXV0b1NhdmVDb25maWd1cmF0aW9uQ2FjaGUuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmICghcmVzb3VyY2VBdXRvU2F2ZUNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0cmVzb3VyY2VBdXRvU2F2ZUNvbmZpZ3VyYXRpb24gPSB0aGlzLmNvbXB1dGVBdXRvU2F2ZUNvbmZpZ3VyYXRpb24ocmVzb3VyY2UsIHRoaXMudGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbk5vZGU+KHJlc291cmNlLCAnZmlsZXMnKSk7XG5cdFx0XHRcdHRoaXMuYXV0b1NhdmVDb25maWd1cmF0aW9uQ2FjaGUuc2V0KHJlc291cmNlLCByZXNvdXJjZUF1dG9TYXZlQ29uZmlndXJhdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXNvdXJjZUF1dG9TYXZlQ29uZmlndXJhdGlvbjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50R2xvYmFsQXV0b1NhdmVDb25maWd1cmF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlQXV0b1NhdmVDb25maWd1cmF0aW9uKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGZpbGVzQ29uZmlndXJhdGlvbjogSUZpbGVzQ29uZmlndXJhdGlvbk5vZGUgfCB1bmRlZmluZWQpOiBJQ2FjaGVkQXV0b1NhdmVDb25maWd1cmF0aW9uIHtcblx0XHRsZXQgYXV0b1NhdmU6ICdhZnRlckRlbGF5JyB8ICdvbkZvY3VzQ2hhbmdlJyB8ICdvbldpbmRvd0NoYW5nZScgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGF1dG9TYXZlRGVsYXk6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYXV0b1NhdmVXb3Jrc3BhY2VGaWxlc09ubHk6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGF1dG9TYXZlV2hlbk5vRXJyb3JzOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGlzT3V0T2ZXb3Jrc3BhY2U6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGlzU2hvcnRBdXRvU2F2ZURlbGF5OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdFx0c3dpdGNoIChmaWxlc0NvbmZpZ3VyYXRpb24/LmF1dG9TYXZlID8/IEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuREVGQVVMVF9BVVRPX1NBVkVfTU9ERSkge1xuXHRcdFx0Y2FzZSBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uQUZURVJfREVMQVk6IHtcblx0XHRcdFx0YXV0b1NhdmUgPSAnYWZ0ZXJEZWxheSc7XG5cdFx0XHRcdGF1dG9TYXZlRGVsYXkgPSB0eXBlb2YgZmlsZXNDb25maWd1cmF0aW9uPy5hdXRvU2F2ZURlbGF5ID09PSAnbnVtYmVyJyAmJiBmaWxlc0NvbmZpZ3VyYXRpb24uYXV0b1NhdmVEZWxheSA+PSAwID8gZmlsZXNDb25maWd1cmF0aW9uLmF1dG9TYXZlRGVsYXkgOiBGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLkRFRkFVTFRfQVVUT19TQVZFX0RFTEFZO1xuXHRcdFx0XHRpc1Nob3J0QXV0b1NhdmVEZWxheSA9IGF1dG9TYXZlRGVsYXkgPD0gRmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5ERUZBVUxUX0FVVE9fU0FWRV9ERUxBWTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgQXV0b1NhdmVDb25maWd1cmF0aW9uLk9OX0ZPQ1VTX0NIQU5HRTpcblx0XHRcdFx0YXV0b1NhdmUgPSAnb25Gb2N1c0NoYW5nZSc7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5PTl9XSU5ET1dfQ0hBTkdFOlxuXHRcdFx0XHRhdXRvU2F2ZSA9ICdvbldpbmRvd0NoYW5nZSc7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChmaWxlc0NvbmZpZ3VyYXRpb24/LmF1dG9TYXZlV29ya3NwYWNlRmlsZXNPbmx5ID09PSB0cnVlKSB7XG5cdFx0XHRhdXRvU2F2ZVdvcmtzcGFjZUZpbGVzT25seSA9IHRydWU7XG5cblx0XHRcdGlmIChyZXNvdXJjZSAmJiAhdGhpcy5jb250ZXh0U2VydmljZS5pc0luc2lkZVdvcmtzcGFjZShyZXNvdXJjZSkpIHtcblx0XHRcdFx0aXNPdXRPZldvcmtzcGFjZSA9IHRydWU7XG5cdFx0XHRcdGlzU2hvcnRBdXRvU2F2ZURlbGF5ID0gdW5kZWZpbmVkOyAvLyBvdXQgb2Ygd29ya3NwYWNlIGZpbGUgYXJlIG5vdCBhdXRvIHNhdmVkIHdpdGggdGhpcyBjb25maWd1cmF0aW9uXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGZpbGVzQ29uZmlndXJhdGlvbj8uYXV0b1NhdmVXaGVuTm9FcnJvcnMgPT09IHRydWUpIHtcblx0XHRcdGF1dG9TYXZlV2hlbk5vRXJyb3JzID0gdHJ1ZTtcblx0XHRcdGlzU2hvcnRBdXRvU2F2ZURlbGF5ID0gdW5kZWZpbmVkOyAvLyB0aGlzIGNvbmZpZ3VyYXRpb24gZGlzYWJsZXMgc2hvcnQgYXV0byBzYXZlIGRlbGF5XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGF1dG9TYXZlLFxuXHRcdFx0YXV0b1NhdmVEZWxheSxcblx0XHRcdGF1dG9TYXZlV29ya3NwYWNlRmlsZXNPbmx5LFxuXHRcdFx0YXV0b1NhdmVXaGVuTm9FcnJvcnMsXG5cdFx0XHRpc091dE9mV29ya3NwYWNlLFxuXHRcdFx0aXNTaG9ydEF1dG9TYXZlRGVsYXlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSB0b1Jlc291cmNlKHJlc291cmNlT3JFZGl0b3I6IEVkaXRvcklucHV0IHwgVVJJIHwgdW5kZWZpbmVkKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmVzb3VyY2VPckVkaXRvciBpbnN0YW5jZW9mIEVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShyZXNvdXJjZU9yRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc291cmNlT3JFZGl0b3I7XG5cdH1cblxuXHRoYXNTaG9ydEF1dG9TYXZlRGVsYXkocmVzb3VyY2VPckVkaXRvcjogRWRpdG9ySW5wdXQgfCBVUkkgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMudG9SZXNvdXJjZShyZXNvdXJjZU9yRWRpdG9yKTtcblxuXHRcdGlmIChyZXNvdXJjZSAmJiB0aGlzLmF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5T3ZlcnJpZGVzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBvdmVycmlkZGVuIHRvIGJlIGVuYWJsZWQgYWZ0ZXIgc2hvcnQgZGVsYXlcblx0XHR9XG5cblx0XHRpZiAodGhpcy5nZXRBdXRvU2F2ZUNvbmZpZ3VyYXRpb24ocmVzb3VyY2UpLmlzU2hvcnRBdXRvU2F2ZURlbGF5KSB7XG5cdFx0XHRyZXR1cm4gIXJlc291cmNlIHx8ICF0aGlzLmF1dG9TYXZlRGlzYWJsZWRPdmVycmlkZXMuaGFzKHJlc291cmNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXRBdXRvU2F2ZU1vZGUocmVzb3VyY2VPckVkaXRvcjogRWRpdG9ySW5wdXQgfCBVUkkgfCB1bmRlZmluZWQsIHNhdmVSZWFzb24/OiBTYXZlUmVhc29uKTogSUF1dG9TYXZlTW9kZSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLnRvUmVzb3VyY2UocmVzb3VyY2VPckVkaXRvcik7XG5cdFx0aWYgKHJlc291cmNlICYmIHRoaXMuYXV0b1NhdmVBZnRlclNob3J0RGVsYXlPdmVycmlkZXMuaGFzKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHsgbW9kZTogQXV0b1NhdmVNb2RlLkFGVEVSX1NIT1JUX0RFTEFZIH07IC8vIG92ZXJyaWRkZW4gdG8gYmUgZW5hYmxlZCBhZnRlciBzaG9ydCBkZWxheVxuXHRcdH1cblxuXHRcdGlmIChyZXNvdXJjZSAmJiB0aGlzLmF1dG9TYXZlRGlzYWJsZWRPdmVycmlkZXMuaGFzKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHsgbW9kZTogQXV0b1NhdmVNb2RlLk9GRiwgcmVhc29uOiBBdXRvU2F2ZURpc2FibGVkUmVhc29uLkRJU0FCTEVEIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0b1NhdmVDb25maWd1cmF0aW9uID0gdGhpcy5nZXRBdXRvU2F2ZUNvbmZpZ3VyYXRpb24ocmVzb3VyY2UpO1xuXHRcdGlmICh0eXBlb2YgYXV0b1NhdmVDb25maWd1cmF0aW9uLmF1dG9TYXZlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHsgbW9kZTogQXV0b1NhdmVNb2RlLk9GRiwgcmVhc29uOiBBdXRvU2F2ZURpc2FibGVkUmVhc29uLlNFVFRJTkdTIH07XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBzYXZlUmVhc29uID09PSAnbnVtYmVyJykge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHQoYXV0b1NhdmVDb25maWd1cmF0aW9uLmF1dG9TYXZlID09PSAnYWZ0ZXJEZWxheScgJiYgc2F2ZVJlYXNvbiAhPT0gU2F2ZVJlYXNvbi5BVVRPKSB8fFxuXHRcdFx0XHQoYXV0b1NhdmVDb25maWd1cmF0aW9uLmF1dG9TYXZlID09PSAnb25Gb2N1c0NoYW5nZScgJiYgc2F2ZVJlYXNvbiAhPT0gU2F2ZVJlYXNvbi5GT0NVU19DSEFOR0UgJiYgc2F2ZVJlYXNvbiAhPT0gU2F2ZVJlYXNvbi5XSU5ET1dfQ0hBTkdFKSB8fFxuXHRcdFx0XHQoYXV0b1NhdmVDb25maWd1cmF0aW9uLmF1dG9TYXZlID09PSAnb25XaW5kb3dDaGFuZ2UnICYmIHNhdmVSZWFzb24gIT09IFNhdmVSZWFzb24uV0lORE9XX0NIQU5HRSlcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4geyBtb2RlOiBBdXRvU2F2ZU1vZGUuT0ZGLCByZWFzb246IEF1dG9TYXZlRGlzYWJsZWRSZWFzb24uU0VUVElOR1MgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdGlmIChhdXRvU2F2ZUNvbmZpZ3VyYXRpb24uYXV0b1NhdmVXb3Jrc3BhY2VGaWxlc09ubHkgJiYgYXV0b1NhdmVDb25maWd1cmF0aW9uLmlzT3V0T2ZXb3Jrc3BhY2UpIHtcblx0XHRcdFx0cmV0dXJuIHsgbW9kZTogQXV0b1NhdmVNb2RlLk9GRiwgcmVhc29uOiBBdXRvU2F2ZURpc2FibGVkUmVhc29uLk9VVF9PRl9XT1JLU1BBQ0UgfTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGF1dG9TYXZlQ29uZmlndXJhdGlvbi5hdXRvU2F2ZVdoZW5Ob0Vycm9ycyAmJiB0aGlzLm1hcmtlclNlcnZpY2UucmVhZCh7IHJlc291cmNlLCB0YWtlOiAxLCBzZXZlcml0aWVzOiBNYXJrZXJTZXZlcml0eS5FcnJvciB9KS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiB7IG1vZGU6IEF1dG9TYXZlTW9kZS5PRkYsIHJlYXNvbjogQXV0b1NhdmVEaXNhYmxlZFJlYXNvbi5FUlJPUlMgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzd2l0Y2ggKGF1dG9TYXZlQ29uZmlndXJhdGlvbi5hdXRvU2F2ZSkge1xuXHRcdFx0Y2FzZSAnYWZ0ZXJEZWxheSc6XG5cdFx0XHRcdGlmICh0eXBlb2YgYXV0b1NhdmVDb25maWd1cmF0aW9uLmF1dG9TYXZlRGVsYXkgPT09ICdudW1iZXInICYmIGF1dG9TYXZlQ29uZmlndXJhdGlvbi5hdXRvU2F2ZURlbGF5IDw9IEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuREVGQVVMVF9BVVRPX1NBVkVfREVMQVkpIHtcblx0XHRcdFx0XHQvLyBFeHBsaWNpdGx5IG1hcmsgYXV0byBzYXZlIGNvbmZpZ3VyYXRpb25zIGFzIGxvbmcgcnVubmluZ1xuXHRcdFx0XHRcdC8vIGlmIHRoZXkgYXJlIGNvbmZpZ3VyZWQgdG8gbm90IHJ1biB3aGVuIHRoZXJlIGFyZSBlcnJvcnMuXG5cdFx0XHRcdFx0Ly8gVGhlIHJhdGlvbmFsZSBoZXJlIGlzIHRoYXQgZXJyb3JzIG1heSBjb21lIGluIGFmdGVyIGF1dG9cblx0XHRcdFx0XHQvLyBzYXZlIGhhcyBiZWVuIHNjaGVkdWxlZCBhbmQgdGhlbiBmdXJ0aGVyIGRlbGF5IHRoZSBhdXRvXG5cdFx0XHRcdFx0Ly8gc2F2ZSB1bnRpbCByZXNvbHZlZC5cblx0XHRcdFx0XHRyZXR1cm4geyBtb2RlOiBhdXRvU2F2ZUNvbmZpZ3VyYXRpb24uYXV0b1NhdmVXaGVuTm9FcnJvcnMgPyBBdXRvU2F2ZU1vZGUuQUZURVJfTE9OR19ERUxBWSA6IEF1dG9TYXZlTW9kZS5BRlRFUl9TSE9SVF9ERUxBWSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IG1vZGU6IEF1dG9TYXZlTW9kZS5BRlRFUl9MT05HX0RFTEFZIH07XG5cdFx0XHRjYXNlICdvbkZvY3VzQ2hhbmdlJzpcblx0XHRcdFx0cmV0dXJuIHsgbW9kZTogQXV0b1NhdmVNb2RlLk9OX0ZPQ1VTX0NIQU5HRSB9O1xuXHRcdFx0Y2FzZSAnb25XaW5kb3dDaGFuZ2UnOlxuXHRcdFx0XHRyZXR1cm4geyBtb2RlOiBBdXRvU2F2ZU1vZGUuT05fV0lORE9XX0NIQU5HRSB9O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHRvZ2dsZUF1dG9TYXZlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1cnJlbnRTZXR0aW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZmlsZXMuYXV0b1NhdmUnKTtcblxuXHRcdGxldCBuZXdBdXRvU2F2ZVZhbHVlOiBzdHJpbmc7XG5cdFx0aWYgKFtBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uQUZURVJfREVMQVksIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5PTl9GT0NVU19DSEFOR0UsIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5PTl9XSU5ET1dfQ0hBTkdFXS5zb21lKHNldHRpbmcgPT4gc2V0dGluZyA9PT0gY3VycmVudFNldHRpbmcpKSB7XG5cdFx0XHRuZXdBdXRvU2F2ZVZhbHVlID0gQXV0b1NhdmVDb25maWd1cmF0aW9uLk9GRjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV3QXV0b1NhdmVWYWx1ZSA9IEF1dG9TYXZlQ29uZmlndXJhdGlvbi5BRlRFUl9ERUxBWTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnZmlsZXMuYXV0b1NhdmUnLCBuZXdBdXRvU2F2ZVZhbHVlKTtcblx0fVxuXG5cdGVuYWJsZUF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5KHJlc291cmNlT3JFZGl0b3I6IEVkaXRvcklucHV0IHwgVVJJKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy50b1Jlc291cmNlKHJlc291cmNlT3JFZGl0b3IpO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY291bnRlciA9IHRoaXMuYXV0b1NhdmVBZnRlclNob3J0RGVsYXlPdmVycmlkZXMuZ2V0KHJlc291cmNlKSA/PyAwO1xuXHRcdHRoaXMuYXV0b1NhdmVBZnRlclNob3J0RGVsYXlPdmVycmlkZXMuc2V0KHJlc291cmNlLCBjb3VudGVyICsgMSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnN0IGNvdW50ZXIgPSB0aGlzLmF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5T3ZlcnJpZGVzLmdldChyZXNvdXJjZSkgPz8gMDtcblx0XHRcdGlmIChjb3VudGVyIDw9IDEpIHtcblx0XHRcdFx0dGhpcy5hdXRvU2F2ZUFmdGVyU2hvcnREZWxheU92ZXJyaWRlcy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5hdXRvU2F2ZUFmdGVyU2hvcnREZWxheU92ZXJyaWRlcy5zZXQocmVzb3VyY2UsIGNvdW50ZXIgLSAxKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGRpc2FibGVBdXRvU2F2ZShyZXNvdXJjZU9yRWRpdG9yOiBFZGl0b3JJbnB1dCB8IFVSSSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMudG9SZXNvdXJjZShyZXNvdXJjZU9yRWRpdG9yKTtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvdW50ZXIgPSB0aGlzLmF1dG9TYXZlRGlzYWJsZWRPdmVycmlkZXMuZ2V0KHJlc291cmNlKSA/PyAwO1xuXHRcdHRoaXMuYXV0b1NhdmVEaXNhYmxlZE92ZXJyaWRlcy5zZXQocmVzb3VyY2UsIGNvdW50ZXIgKyAxKTtcblxuXHRcdGlmIChjb3VudGVyID09PSAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUF1dG9TYXZlRGlzYWJsZWQuZmlyZShyZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBjb3VudGVyID0gdGhpcy5hdXRvU2F2ZURpc2FibGVkT3ZlcnJpZGVzLmdldChyZXNvdXJjZSkgPz8gMDtcblx0XHRcdGlmIChjb3VudGVyIDw9IDEpIHtcblx0XHRcdFx0dGhpcy5hdXRvU2F2ZURpc2FibGVkT3ZlcnJpZGVzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQXV0b1NhdmVEaXNhYmxlZC5maXJlKHJlc291cmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYXV0b1NhdmVEaXNhYmxlZE92ZXJyaWRlcy5zZXQocmVzb3VyY2UsIGNvdW50ZXIgLSAxKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGdldCBpc0hvdEV4aXRFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLnRyYW5zaWVudCkge1xuXHRcdFx0Ly8gVHJhbnNpZW50IHdvcmtzcGFjZTogaG90IGV4aXQgaXMgZGlzYWJsZWQgYmVjYXVzZVxuXHRcdFx0Ly8gdHJhbnNpZW50IHdvcmtzcGFjZXMgYXJlIG5vdCByZXN0b3JlZCB1cG9uIHJlc3RhcnRcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50SG90RXhpdENvbmZpZ3VyYXRpb24gIT09IEhvdEV4aXRDb25maWd1cmF0aW9uLk9GRjtcblx0fVxuXG5cdGdldCBob3RFeGl0Q29uZmlndXJhdGlvbigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnRIb3RFeGl0Q29uZmlndXJhdGlvbjtcblx0fVxuXG5cdHByZXZlbnRTYXZlQ29uZmxpY3RzKHJlc291cmNlOiBVUkksIGxhbmd1YWdlPzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2ZpbGVzLnNhdmVDb25mbGljdFJlc29sdXRpb24nLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlIH0pICE9PSAnb3ZlcndyaXRlRmlsZU9uRGlzayc7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQWdCLGVBQWU7QUFDL0IsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBUyxlQUFlLDBCQUF1QztBQUMvRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUE4Qix1QkFBdUIsc0JBQXNCLCtCQUErQiwrQkFBc0QsY0FBNkIsNkJBQXNEO0FBQ25QLFNBQVMsY0FBYztBQUV2QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxVQUFVLG1CQUFtQjtBQUV0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHdCQUF3QixZQUFZLHdCQUF3QjtBQUNyRSxTQUFTLGdCQUFnQixzQkFBc0I7QUFDL0MsU0FBUyx5Q0FBeUM7QUFHM0MsTUFBTSxpQ0FBaUMsSUFBSSxjQUF1QixrQ0FBa0MsT0FBTyxJQUFJO0FBbUIvRyxJQUFX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QUFVQSxXQUFVLENBQUM7QUFBQSxNQUN6RDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLElBQUksbUJBQTRCO0FBQy9CLFFBQUksS0FBSyxlQUFlLGFBQWEsRUFBRSxXQUFXO0FBR2pELGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxLQUFLLGdDQUFnQyxxQkFBcUI7QUFBQSxFQUNsRTtBQUFBLEVBRUEsSUFBSSx1QkFBK0I7QUFDbEMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEscUJBQXFCLFVBQWUsVUFBNEI7QUFDL0QsV0FBTyxLQUFLLHFCQUFxQixTQUFTLGdDQUFnQyxFQUFFLFVBQVUsb0JBQW9CLFNBQVMsQ0FBQyxNQUFNO0FBQUEsRUFDM0g7QUFDRDtBQWphYSwwQkFJWSx5QkFBeUIsUUFBUSxzQkFBc0IsY0FBYyxzQkFBc0I7QUFKdkcsMEJBS1ksMEJBQTBCO0FBTHRDLDBCQU9ZLG9CQUFvQjtBQUFBLEVBQzNDLGtCQUFrQixFQUFFLE9BQU8sU0FBUyxvQkFBb0IsdUVBQXVFLEdBQUcsV0FBVyxLQUFLO0FBQUEsRUFDbEosaUJBQWlCLEVBQUUsT0FBTyxTQUFTLEVBQUUsS0FBSyxtQkFBbUIsU0FBUyxDQUFDLHVHQUF1RywyQkFBMkIsRUFBRSxHQUFHLHVIQUF1SCwwREFBMEQsR0FBRyxXQUFXLEtBQUs7QUFBQSxFQUNsWixvQkFBb0IsRUFBRSxPQUFPLFNBQVMsRUFBRSxLQUFLLHNCQUFzQixTQUFTLENBQUMsdUdBQXVHLDJCQUEyQixFQUFFLEdBQUcsMEpBQTBKLGlDQUFpQyxtQkFBbUIsb0JBQW9CLENBQUMsSUFBSSw0REFBNEQsR0FBRyxXQUFXLEtBQUs7QUFBQSxFQUMxZ0IsWUFBWSxFQUFFLE9BQU8sU0FBUyxFQUFFLEtBQUssY0FBYyxTQUFTLENBQUMsdUdBQXVHLDJCQUEyQixFQUFFLEdBQUcsdUdBQXVHLDBEQUEwRCxHQUFHLFdBQVcsS0FBSztBQUFBLEVBQ3hYLGNBQWMsRUFBRSxPQUFPLFNBQVMsZ0JBQWdCLG9EQUFvRCxHQUFHLFdBQVcsS0FBSztBQUN4SDtBQWJZLDRCQUFOO0FBQUEsRUE2Q0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FwRFU7QUFtYWIsa0JBQWtCLDRCQUE0QiwyQkFBMkIsa0JBQWtCLEtBQUs7IiwKICAibmFtZXMiOiBbIkF1dG9TYXZlTW9kZSIsICJBdXRvU2F2ZURpc2FibGVkUmVhc29uIiwgImNvdW50ZXIiXQp9Cg==
