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
import { dirname, basename } from "../../../../base/common/resources.js";
import { IConfigurationService, isConfigured } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorResourceAccessor, Verbosity, SideBySideEditor } from "../../../common/editor.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { isWindows, isWeb, isMacintosh, isNative } from "../../../../base/common/platform.js";
import { trim } from "../../../../base/common/strings.js";
import { template } from "../../../../base/common/labels.js";
import { ILabelService, Verbosity as LabelVerbosity } from "../../../../platform/label/common/label.js";
import { Emitter } from "../../../../base/common/event.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Schemas } from "../../../../base/common/network.js";
import { getVirtualWorkspaceLocation } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { getWindowById } from "../../../../base/browser/dom.js";
import { IDecorationsService } from "../../../services/decorations/common/decorations.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
var WindowSettingNames = /* @__PURE__ */ ((WindowSettingNames2) => {
  WindowSettingNames2["titleSeparator"] = "window.titleSeparator";
  WindowSettingNames2["title"] = "window.title";
  return WindowSettingNames2;
})(WindowSettingNames || {});
const defaultWindowTitle = (() => {
  if (isMacintosh && isNative) {
    return "${activeEditorShort}${separator}${rootName}${separator}${profileName}";
  }
  const base = "${dirty}${activeEditorShort}${separator}${rootName}${separator}${profileName}${separator}${appName}";
  if (isWeb) {
    return base + "${separator}${remoteName}";
  }
  return base;
})();
const defaultWindowTitleSeparator = isMacintosh ? " \u2014 " : " - ";
let WindowTitle = class extends Disposable {
  constructor(targetWindow, configurationService, contextKeyService, editorService, environmentService, contextService, labelService, userDataProfileService, productService, viewsService, decorationsService, accessibilityService) {
    super();
    this.configurationService = configurationService;
    this.contextKeyService = contextKeyService;
    this.editorService = editorService;
    this.environmentService = environmentService;
    this.contextService = contextService;
    this.labelService = labelService;
    this.userDataProfileService = userDataProfileService;
    this.productService = productService;
    this.viewsService = viewsService;
    this.decorationsService = decorationsService;
    this.accessibilityService = accessibilityService;
    this.properties = { isPure: true, isAdmin: false, prefix: void 0 };
    this.variables = /* @__PURE__ */ new Map();
    this.activeEditorListeners = this._register(new DisposableStore());
    this.titleUpdater = this._register(new RunOnceScheduler(() => this.doUpdateTitle(), 0));
    this.onDidChangeEmitter = this._register(new Emitter());
    this.onDidChange = this.onDidChangeEmitter.event;
    this.titleIncludesFocusedView = false;
    this.titleIncludesEditorState = false;
    this.windowId = targetWindow.vscodeWindowId;
    this.checkTitleVariables();
    this.registerListeners();
  }
  get value() {
    return this.title ?? "";
  }
  get workspaceName() {
    return this.labelService.getWorkspaceLabel(this.contextService.getWorkspace());
  }
  get fileName() {
    const activeEditor = this.editorService.activeEditor;
    if (!activeEditor) {
      return void 0;
    }
    const fileName = activeEditor.getTitle(Verbosity.SHORT);
    const dirty = activeEditor?.isDirty() && !activeEditor.isSaving() ? WindowTitle.TITLE_DIRTY : "";
    return `${dirty}${fileName}`;
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationChanged(e)));
    this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChange()));
    this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.titleUpdater.schedule()));
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.titleUpdater.schedule()));
    this._register(this.contextService.onDidChangeWorkspaceName(() => this.titleUpdater.schedule()));
    this._register(this.labelService.onDidChangeFormatters(() => this.titleUpdater.schedule()));
    this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.titleUpdater.schedule()));
    this._register(this.viewsService.onDidChangeFocusedView(() => {
      if (this.titleIncludesFocusedView) {
        this.titleUpdater.schedule();
      }
    }));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(this.variables)) {
        this.titleUpdater.schedule();
      }
    }));
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.titleUpdater.schedule()));
  }
  onConfigurationChanged(event) {
    const affectsTitleConfiguration = event.affectsConfiguration("window.title" /* title */);
    if (affectsTitleConfiguration) {
      this.checkTitleVariables();
    }
    if (affectsTitleConfiguration || event.affectsConfiguration("window.titleSeparator" /* titleSeparator */)) {
      this.titleUpdater.schedule();
    }
  }
  checkTitleVariables() {
    const titleTemplate = this.configurationService.getValue("window.title" /* title */);
    if (typeof titleTemplate === "string") {
      this.titleIncludesFocusedView = titleTemplate.includes("${focusedView}");
      this.titleIncludesEditorState = titleTemplate.includes("${activeEditorState}");
    }
  }
  onActiveEditorChange() {
    this.activeEditorListeners.clear();
    this.titleUpdater.schedule();
    const activeEditor = this.editorService.activeEditor;
    if (activeEditor) {
      this.activeEditorListeners.add(activeEditor.onDidChangeDirty(() => this.titleUpdater.schedule()));
      this.activeEditorListeners.add(activeEditor.onDidChangeLabel(() => this.titleUpdater.schedule()));
    }
    if (this.titleIncludesFocusedView) {
      const activeTextEditorControl = this.editorService.activeTextEditorControl;
      const textEditorControls = [];
      if (isCodeEditor(activeTextEditorControl)) {
        textEditorControls.push(activeTextEditorControl);
      } else if (isDiffEditor(activeTextEditorControl)) {
        textEditorControls.push(activeTextEditorControl.getOriginalEditor(), activeTextEditorControl.getModifiedEditor());
      }
      for (const textEditorControl of textEditorControls) {
        this.activeEditorListeners.add(textEditorControl.onDidBlurEditorText(() => this.titleUpdater.schedule()));
        this.activeEditorListeners.add(textEditorControl.onDidFocusEditorText(() => this.titleUpdater.schedule()));
      }
    }
    if (this.titleIncludesEditorState) {
      this.activeEditorListeners.add(this.decorationsService.onDidChangeDecorations(() => this.titleUpdater.schedule()));
    }
  }
  doUpdateTitle() {
    const title = this.getFullWindowTitle();
    if (title !== this.title) {
      let nativeTitle = title;
      if (!trim(nativeTitle)) {
        nativeTitle = this.productService.nameLong;
      }
      const window = getWindowById(this.windowId, true).window;
      if (!window.document.title && isMacintosh && nativeTitle === this.productService.nameLong) {
        window.document.title = `${this.productService.nameLong} ${WindowTitle.TITLE_DIRTY}`;
      }
      window.document.title = nativeTitle;
      this.title = title;
      this.onDidChangeEmitter.fire();
    }
  }
  getFullWindowTitle() {
    const { prefix, suffix } = this.getTitleDecorations();
    let title = this.getWindowTitle() || this.productService.nameLong;
    if (prefix) {
      title = `${prefix} ${title}`;
    }
    if (suffix) {
      title = `${title} ${suffix}`;
    }
    return title.replace(/[^\S ]/g, " ");
  }
  getTitleDecorations() {
    let prefix;
    let suffix;
    if (this.properties.prefix) {
      prefix = this.properties.prefix;
    }
    if (this.environmentService.isExtensionDevelopment) {
      prefix = !prefix ? WindowTitle.NLS_EXTENSION_HOST : `${WindowTitle.NLS_EXTENSION_HOST} - ${prefix}`;
    }
    if (this.properties.isAdmin) {
      suffix = WindowTitle.NLS_USER_IS_ADMIN;
    }
    return { prefix, suffix };
  }
  updateProperties(properties) {
    const isAdmin = typeof properties.isAdmin === "boolean" ? properties.isAdmin : this.properties.isAdmin;
    const isPure = typeof properties.isPure === "boolean" ? properties.isPure : this.properties.isPure;
    const prefix = typeof properties.prefix === "string" ? properties.prefix : this.properties.prefix;
    if (isAdmin !== this.properties.isAdmin || isPure !== this.properties.isPure || prefix !== this.properties.prefix) {
      this.properties.isAdmin = isAdmin;
      this.properties.isPure = isPure;
      this.properties.prefix = prefix;
      this.titleUpdater.schedule();
    }
  }
  registerVariables(variables) {
    let changed = false;
    for (const { name, contextKey } of variables) {
      if (!this.variables.has(contextKey)) {
        this.variables.set(contextKey, name);
        changed = true;
      }
    }
    if (changed) {
      this.titleUpdater.schedule();
    }
  }
  /**
   * Possible template values:
   *
   * {activeEditorLong}: e.g. /Users/Development/myFolder/myFileFolder/myFile.txt
   * {activeEditorMedium}: e.g. myFolder/myFileFolder/myFile.txt
   * {activeEditorShort}: e.g. myFile.txt
   * {activeEditorLanguageId}: e.g. typescript
   * {activeFolderLong}: e.g. /Users/Development/myFolder/myFileFolder
   * {activeFolderMedium}: e.g. myFolder/myFileFolder
   * {activeFolderShort}: e.g. myFileFolder
   * {rootName}: e.g. myFolder1, myFolder2, myFolder3
   * {rootPath}: e.g. /Users/Development
   * {folderName}: e.g. myFolder
   * {folderPath}: e.g. /Users/Development/myFolder
   * {appName}: e.g. VS Code
   * {remoteName}: e.g. SSH
   * {dirty}: indicator
   * {focusedView}: e.g. Terminal
   * {separator}: conditional separator
   * {activeEditorState}: e.g. Modified
   */
  getWindowTitle() {
    const editor = this.editorService.activeEditor;
    const workspace = this.contextService.getWorkspace();
    let root;
    if (workspace.configuration) {
      root = workspace.configuration;
    } else if (workspace.folders.length) {
      root = workspace.folders[0].uri;
    }
    const editorResource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
    let editorFolderResource = editorResource ? dirname(editorResource) : void 0;
    if (editorFolderResource?.path === ".") {
      editorFolderResource = void 0;
    }
    let folder = void 0;
    if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
      folder = workspace.folders[0];
    } else if (editorResource) {
      folder = this.contextService.getWorkspaceFolder(editorResource) ?? void 0;
    }
    let remoteName = void 0;
    if (this.environmentService.remoteAuthority && !isWeb) {
      remoteName = this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority);
    } else {
      const virtualWorkspaceLocation = getVirtualWorkspaceLocation(workspace);
      if (virtualWorkspaceLocation) {
        remoteName = this.labelService.getHostLabel(virtualWorkspaceLocation.scheme, virtualWorkspaceLocation.authority);
      }
    }
    const activeEditorShort = editor ? editor.getTitle(Verbosity.SHORT) : "";
    const activeEditorMedium = editor ? editor.getTitle(Verbosity.MEDIUM) : activeEditorShort;
    const activeEditorLong = editor ? editor.getTitle(Verbosity.LONG) : activeEditorMedium;
    const activeFolderShort = editorFolderResource ? basename(editorFolderResource) : "";
    const activeFolderMedium = editorFolderResource ? this.labelService.getUriLabel(editorFolderResource, { relative: true }) : "";
    const activeFolderLong = editorFolderResource ? this.labelService.getUriLabel(editorFolderResource) : "";
    const rootName = this.labelService.getWorkspaceLabel(workspace);
    const rootNameShort = this.labelService.getWorkspaceLabel(workspace, { verbose: LabelVerbosity.SHORT });
    const rootPath = root ? this.labelService.getUriLabel(root) : "";
    const folderName = folder ? folder.name : "";
    const folderPath = folder ? this.labelService.getUriLabel(folder.uri) : "";
    const dirty = editor?.isDirty() && !editor.isSaving() ? WindowTitle.TITLE_DIRTY : "";
    const appName = this.productService.nameLong;
    const profileName = this.userDataProfileService.currentProfile.isDefault ? "" : this.userDataProfileService.currentProfile.name;
    const focusedView = this.viewsService.getFocusedViewName();
    const activeEditorState = editorResource ? this.decorationsService.getDecoration(editorResource, false)?.tooltip : void 0;
    const activeEditorLanguageId = this.editorService.activeTextEditorLanguageId;
    const variables = {};
    for (const [contextKey, name] of this.variables) {
      variables[name] = this.contextKeyService.getContextKeyValue(contextKey) ?? "";
    }
    let titleTemplate = this.configurationService.getValue("window.title" /* title */);
    if (typeof titleTemplate !== "string") {
      titleTemplate = defaultWindowTitle;
    }
    if (!this.titleIncludesEditorState && this.accessibilityService.isScreenReaderOptimized() && this.configurationService.getValue("accessibility.windowTitleOptimized")) {
      titleTemplate += "${separator}${activeEditorState}";
    }
    let separator = this.configurationService.getValue("window.titleSeparator" /* titleSeparator */);
    if (typeof separator !== "string") {
      separator = defaultWindowTitleSeparator;
    }
    return template(titleTemplate, {
      ...variables,
      activeEditorShort,
      activeEditorLong,
      activeEditorMedium,
      activeEditorLanguageId,
      activeFolderShort,
      activeFolderMedium,
      activeFolderLong,
      rootName,
      rootPath,
      rootNameShort,
      folderName,
      folderPath,
      dirty,
      appName,
      remoteName,
      profileName,
      focusedView,
      activeEditorState,
      separator: { label: separator }
    });
  }
  isCustomTitleFormat() {
    if (this.accessibilityService.isScreenReaderOptimized() || this.titleIncludesEditorState) {
      return true;
    }
    const title = this.configurationService.inspect("window.title" /* title */);
    const titleSeparator = this.configurationService.inspect("window.titleSeparator" /* titleSeparator */);
    if (isConfigured(title) || isConfigured(titleSeparator)) {
      return true;
    }
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    const configurationProperties = configurationRegistry.getConfigurationProperties();
    return title.defaultValue !== configurationProperties["window.title" /* title */]?.defaultDefaultValue;
  }
};
WindowTitle.NLS_USER_IS_ADMIN = isWindows ? localize("userIsAdmin", "[Administrator]") : localize("userIsSudo", "[Superuser]");
WindowTitle.NLS_EXTENSION_HOST = localize("devExtensionWindowTitlePrefix", "[Extension Development Host]");
WindowTitle.TITLE_DIRTY = "\u25CF ";
WindowTitle = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IBrowserWorkbenchEnvironmentService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IUserDataProfileService),
  __decorateParam(8, IProductService),
  __decorateParam(9, IViewsService),
  __decorateParam(10, IDecorationsService),
  __decorateParam(11, IAccessibilityService)
], WindowTitle);
export {
  WindowTitle,
  defaultWindowTitle,
  defaultWindowTitleSeparator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFx0aXRsZWJhclxcd2luZG93VGl0bGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJVGl0bGVQcm9wZXJ0aWVzLCBJVGl0bGVWYXJpYWJsZSB9IGZyb20gJy4vdGl0bGViYXJQYXJ0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSwgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgaXNDb25maWd1cmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBWZXJib3NpdHksIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGlzV2luZG93cywgaXNXZWIsIGlzTWFjaW50b3NoLCBpc05hdGl2ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB0cmltIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyB0ZW1wbGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlLCBWZXJib3NpdHkgYXMgTGFiZWxWZXJib3NpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBnZXRWaXJ0dWFsV29ya3NwYWNlTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yLCBpc0RpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgZ2V0V2luZG93QnlJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ29kZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2RlY29yYXRpb25zL2NvbW1vbi9kZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcblxuY29uc3QgZW51bSBXaW5kb3dTZXR0aW5nTmFtZXMge1xuXHR0aXRsZVNlcGFyYXRvciA9ICd3aW5kb3cudGl0bGVTZXBhcmF0b3InLFxuXHR0aXRsZSA9ICd3aW5kb3cudGl0bGUnLFxufVxuXG5leHBvcnQgY29uc3QgZGVmYXVsdFdpbmRvd1RpdGxlID0gKCgpID0+IHtcblx0aWYgKGlzTWFjaW50b3NoICYmIGlzTmF0aXZlKSB7XG5cdFx0cmV0dXJuICcke2FjdGl2ZUVkaXRvclNob3J0fSR7c2VwYXJhdG9yfSR7cm9vdE5hbWV9JHtzZXBhcmF0b3J9JHtwcm9maWxlTmFtZX0nOyAvLyBtYWNPUyBoYXMgbmF0aXZlIGRpcnR5IGluZGljYXRvclxuXHR9XG5cblx0Y29uc3QgYmFzZSA9ICcke2RpcnR5fSR7YWN0aXZlRWRpdG9yU2hvcnR9JHtzZXBhcmF0b3J9JHtyb290TmFtZX0ke3NlcGFyYXRvcn0ke3Byb2ZpbGVOYW1lfSR7c2VwYXJhdG9yfSR7YXBwTmFtZX0nO1xuXHRpZiAoaXNXZWIpIHtcblx0XHRyZXR1cm4gYmFzZSArICcke3NlcGFyYXRvcn0ke3JlbW90ZU5hbWV9JzsgLy8gV2ViOiBhbHdheXMgc2hvdyByZW1vdGUgbmFtZVxuXHR9XG5cblx0cmV0dXJuIGJhc2U7XG59KSgpO1xuZXhwb3J0IGNvbnN0IGRlZmF1bHRXaW5kb3dUaXRsZVNlcGFyYXRvciA9IGlzTWFjaW50b3NoID8gJyBcXHUyMDE0ICcgOiAnIC0gJztcblxuZXhwb3J0IGNsYXNzIFdpbmRvd1RpdGxlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTkxTX1VTRVJfSVNfQURNSU4gPSBpc1dpbmRvd3MgPyBsb2NhbGl6ZSgndXNlcklzQWRtaW4nLCBcIltBZG1pbmlzdHJhdG9yXVwiKSA6IGxvY2FsaXplKCd1c2VySXNTdWRvJywgXCJbU3VwZXJ1c2VyXVwiKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTkxTX0VYVEVOU0lPTl9IT1NUID0gbG9jYWxpemUoJ2RldkV4dGVuc2lvbldpbmRvd1RpdGxlUHJlZml4JywgXCJbRXh0ZW5zaW9uIERldmVsb3BtZW50IEhvc3RdXCIpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBUSVRMRV9ESVJUWSA9ICdcXHUyNWNmICc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm9wZXJ0aWVzOiBJVGl0bGVQcm9wZXJ0aWVzID0geyBpc1B1cmU6IHRydWUsIGlzQWRtaW46IGZhbHNlLCBwcmVmaXg6IHVuZGVmaW5lZCB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IHZhcmlhYmxlcyA9IG5ldyBNYXA8c3RyaW5nIC8qIGNvbnRleHQga2V5ICovLCBzdHJpbmcgLyogbmFtZSAqLz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZUVkaXRvckxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGl0bGVVcGRhdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5kb1VwZGF0ZVRpdGxlKCksIDApKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMub25EaWRDaGFuZ2VFbWl0dGVyLmV2ZW50O1xuXG5cdGdldCB2YWx1ZSgpIHsgcmV0dXJuIHRoaXMudGl0bGUgPz8gJyc7IH1cblx0Z2V0IHdvcmtzcGFjZU5hbWUoKSB7IHJldHVybiB0aGlzLmxhYmVsU2VydmljZS5nZXRXb3Jrc3BhY2VMYWJlbCh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKTsgfVxuXHRnZXQgZmlsZU5hbWUoKSB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZmlsZU5hbWUgPSBhY3RpdmVFZGl0b3IuZ2V0VGl0bGUoVmVyYm9zaXR5LlNIT1JUKTtcblx0XHRjb25zdCBkaXJ0eSA9IGFjdGl2ZUVkaXRvcj8uaXNEaXJ0eSgpICYmICFhY3RpdmVFZGl0b3IuaXNTYXZpbmcoKSA/IFdpbmRvd1RpdGxlLlRJVExFX0RJUlRZIDogJyc7XG5cdFx0cmV0dXJuIGAke2RpcnR5fSR7ZmlsZU5hbWV9YDtcblx0fVxuXG5cdHByaXZhdGUgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHRpdGxlSW5jbHVkZXNGb2N1c2VkVmlldzogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHRpdGxlSW5jbHVkZXNFZGl0b3JTdGF0ZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2luZG93SWQ6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0YXJnZXRXaW5kb3c6IENvZGVXaW5kb3csXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElEZWNvcmF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9uc1NlcnZpY2U6IElEZWNvcmF0aW9uc1NlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMud2luZG93SWQgPSB0YXJnZXRXaW5kb3cudnNjb2RlV2luZG93SWQ7XG5cblx0XHR0aGlzLmNoZWNrVGl0bGVWYXJpYWJsZXMoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLm9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gdGhpcy5vbkFjdGl2ZUVkaXRvckNoYW5nZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4gdGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSgoKSA9PiB0aGlzLnRpdGxlVXBkYXRlci5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZU5hbWUoKCkgPT4gdGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFiZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9ybWF0dGVycygoKSA9PiB0aGlzLnRpdGxlVXBkYXRlci5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGUoKCkgPT4gdGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld3NTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXNlZFZpZXcoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMudGl0bGVJbmNsdWRlc0ZvY3VzZWRWaWV3KSB7XG5cdFx0XHRcdHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUodGhpcy52YXJpYWJsZXMpKSB7XG5cdFx0XHRcdHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKCkgPT4gdGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGV2ZW50OiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgYWZmZWN0c1RpdGxlQ29uZmlndXJhdGlvbiA9IGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKFdpbmRvd1NldHRpbmdOYW1lcy50aXRsZSk7XG5cdFx0aWYgKGFmZmVjdHNUaXRsZUNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHRoaXMuY2hlY2tUaXRsZVZhcmlhYmxlcygpO1xuXHRcdH1cblxuXHRcdGlmIChhZmZlY3RzVGl0bGVDb25maWd1cmF0aW9uIHx8IGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKFdpbmRvd1NldHRpbmdOYW1lcy50aXRsZVNlcGFyYXRvcikpIHtcblx0XHRcdHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjaGVja1RpdGxlVmFyaWFibGVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRpdGxlVGVtcGxhdGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHVua25vd24+KFdpbmRvd1NldHRpbmdOYW1lcy50aXRsZSk7XG5cdFx0aWYgKHR5cGVvZiB0aXRsZVRlbXBsYXRlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy50aXRsZUluY2x1ZGVzRm9jdXNlZFZpZXcgPSB0aXRsZVRlbXBsYXRlLmluY2x1ZGVzKCcke2ZvY3VzZWRWaWV3fScpO1xuXHRcdFx0dGhpcy50aXRsZUluY2x1ZGVzRWRpdG9yU3RhdGUgPSB0aXRsZVRlbXBsYXRlLmluY2x1ZGVzKCcke2FjdGl2ZUVkaXRvclN0YXRlfScpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25BY3RpdmVFZGl0b3JDaGFuZ2UoKTogdm9pZCB7XG5cblx0XHQvLyBEaXNwb3NlIG9sZCBsaXN0ZW5lcnNcblx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5jbGVhcigpO1xuXG5cdFx0Ly8gQ2FsY3VsYXRlIE5ldyBXaW5kb3cgVGl0bGVcblx0XHR0aGlzLnRpdGxlVXBkYXRlci5zY2hlZHVsZSgpO1xuXG5cdFx0Ly8gQXBwbHkgbGlzdGVuZXIgZm9yIGRpcnR5IGFuZCBsYWJlbCBjaGFuZ2VzXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRpZiAoYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5hZGQoYWN0aXZlRWRpdG9yLm9uRGlkQ2hhbmdlRGlydHkoKCkgPT4gdGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKSkpO1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuYWRkKGFjdGl2ZUVkaXRvci5vbkRpZENoYW5nZUxhYmVsKCgpID0+IHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCkpKTtcblx0XHR9XG5cblx0XHQvLyBBcHBseSBsaXN0ZW5lcnMgZm9yIHRyYWNraW5nIGZvY3VzZWQgY29kZSBlZGl0b3Jcblx0XHRpZiAodGhpcy50aXRsZUluY2x1ZGVzRm9jdXNlZFZpZXcpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdFx0Y29uc3QgdGV4dEVkaXRvckNvbnRyb2xzOiBJQ29kZUVkaXRvcltdID0gW107XG5cdFx0XHRpZiAoaXNDb2RlRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0XHR0ZXh0RWRpdG9yQ29udHJvbHMucHVzaChhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzRGlmZkVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdFx0dGV4dEVkaXRvckNvbnRyb2xzLnB1c2goYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0T3JpZ2luYWxFZGl0b3IoKSwgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0TW9kaWZpZWRFZGl0b3IoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgdGV4dEVkaXRvckNvbnRyb2wgb2YgdGV4dEVkaXRvckNvbnRyb2xzKSB7XG5cdFx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZCh0ZXh0RWRpdG9yQ29udHJvbC5vbkRpZEJsdXJFZGl0b3JUZXh0KCgpID0+IHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCkpKTtcblx0XHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuYWRkKHRleHRFZGl0b3JDb250cm9sLm9uRGlkRm9jdXNFZGl0b3JUZXh0KCgpID0+IHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBcHBseSBsaXN0ZW5lciBmb3IgZGVjb3JhdGlvbnMgdG8gdHJhY2sgZWRpdG9yIHN0YXRlXG5cdFx0aWYgKHRoaXMudGl0bGVJbmNsdWRlc0VkaXRvclN0YXRlKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5hZGQodGhpcy5kZWNvcmF0aW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VEZWNvcmF0aW9ucygoKSA9PiB0aGlzLnRpdGxlVXBkYXRlci5zY2hlZHVsZSgpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZVRpdGxlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy5nZXRGdWxsV2luZG93VGl0bGUoKTtcblx0XHRpZiAodGl0bGUgIT09IHRoaXMudGl0bGUpIHtcblxuXHRcdFx0Ly8gQWx3YXlzIHNldCB0aGUgbmF0aXZlIHdpbmRvdyB0aXRsZSB0byBpZGVudGlmeSB1cyBwcm9wZXJseSB0byB0aGUgT1Ncblx0XHRcdGxldCBuYXRpdmVUaXRsZSA9IHRpdGxlO1xuXHRcdFx0aWYgKCF0cmltKG5hdGl2ZVRpdGxlKSkge1xuXHRcdFx0XHRuYXRpdmVUaXRsZSA9IHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmc7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdpbmRvdyA9IGdldFdpbmRvd0J5SWQodGhpcy53aW5kb3dJZCwgdHJ1ZSkud2luZG93O1xuXHRcdFx0aWYgKCF3aW5kb3cuZG9jdW1lbnQudGl0bGUgJiYgaXNNYWNpbnRvc2ggJiYgbmF0aXZlVGl0bGUgPT09IHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpIHtcblx0XHRcdFx0Ly8gVE9ET0BlbGVjdHJvbiBtYWNPUzogaWYgd2Ugc2V0IGEgd2luZG93IHRpdGxlIGZvclxuXHRcdFx0XHQvLyB0aGUgZmlyc3QgdGltZSBhbmQgaXQgbWF0Y2hlcyB0aGUgb25lIHdlIHNldCBpblxuXHRcdFx0XHQvLyBgd2luZG93SW1wbC50c2Agc29tZWhvdyB0aGUgd2luZG93IGRvZXMgbm90IGFwcGVhclxuXHRcdFx0XHQvLyBpbiB0aGUgXCJXaW5kb3dzXCIgbWVudS4gQXMgc3VjaCwgd2Ugc2V0IHRoZSB0aXRsZVxuXHRcdFx0XHQvLyBicmllZmx5IHRvIHNvbWV0aGluZyBkaWZmZXJlbnQgdG8gZW5zdXJlIG1hY09TXG5cdFx0XHRcdC8vIHJlY29nbml6ZXMgd2UgaGF2ZSBhIHdpbmRvdy5cblx0XHRcdFx0Ly8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTkxMjg4XG5cdFx0XHRcdHdpbmRvdy5kb2N1bWVudC50aXRsZSA9IGAke3RoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmd9ICR7V2luZG93VGl0bGUuVElUTEVfRElSVFl9YDtcblx0XHRcdH1cblxuXHRcdFx0d2luZG93LmRvY3VtZW50LnRpdGxlID0gbmF0aXZlVGl0bGU7XG5cdFx0XHR0aGlzLnRpdGxlID0gdGl0bGU7XG5cblx0XHRcdHRoaXMub25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEZ1bGxXaW5kb3dUaXRsZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHsgcHJlZml4LCBzdWZmaXggfSA9IHRoaXMuZ2V0VGl0bGVEZWNvcmF0aW9ucygpO1xuXG5cdFx0bGV0IHRpdGxlID0gdGhpcy5nZXRXaW5kb3dUaXRsZSgpIHx8IHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmc7XG5cdFx0aWYgKHByZWZpeCkge1xuXHRcdFx0dGl0bGUgPSBgJHtwcmVmaXh9ICR7dGl0bGV9YDtcblx0XHR9XG5cblx0XHRpZiAoc3VmZml4KSB7XG5cdFx0XHR0aXRsZSA9IGAke3RpdGxlfSAke3N1ZmZpeH1gO1xuXHRcdH1cblxuXHRcdC8vIFJlcGxhY2Ugbm9uLXNwYWNlIHdoaXRlc3BhY2Vcblx0XHRyZXR1cm4gdGl0bGUucmVwbGFjZSgvW15cXFMgXS9nLCAnICcpO1xuXHR9XG5cblx0Z2V0VGl0bGVEZWNvcmF0aW9ucygpIHtcblx0XHRsZXQgcHJlZml4OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHN1ZmZpeDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHRoaXMucHJvcGVydGllcy5wcmVmaXgpIHtcblx0XHRcdHByZWZpeCA9IHRoaXMucHJvcGVydGllcy5wcmVmaXg7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQpIHtcblx0XHRcdHByZWZpeCA9ICFwcmVmaXhcblx0XHRcdFx0PyBXaW5kb3dUaXRsZS5OTFNfRVhURU5TSU9OX0hPU1Rcblx0XHRcdFx0OiBgJHtXaW5kb3dUaXRsZS5OTFNfRVhURU5TSU9OX0hPU1R9IC0gJHtwcmVmaXh9YDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5wcm9wZXJ0aWVzLmlzQWRtaW4pIHtcblx0XHRcdHN1ZmZpeCA9IFdpbmRvd1RpdGxlLk5MU19VU0VSX0lTX0FETUlOO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHByZWZpeCwgc3VmZml4IH07XG5cdH1cblxuXHR1cGRhdGVQcm9wZXJ0aWVzKHByb3BlcnRpZXM6IElUaXRsZVByb3BlcnRpZXMpOiB2b2lkIHtcblx0XHRjb25zdCBpc0FkbWluID0gdHlwZW9mIHByb3BlcnRpZXMuaXNBZG1pbiA9PT0gJ2Jvb2xlYW4nID8gcHJvcGVydGllcy5pc0FkbWluIDogdGhpcy5wcm9wZXJ0aWVzLmlzQWRtaW47XG5cdFx0Y29uc3QgaXNQdXJlID0gdHlwZW9mIHByb3BlcnRpZXMuaXNQdXJlID09PSAnYm9vbGVhbicgPyBwcm9wZXJ0aWVzLmlzUHVyZSA6IHRoaXMucHJvcGVydGllcy5pc1B1cmU7XG5cdFx0Y29uc3QgcHJlZml4ID0gdHlwZW9mIHByb3BlcnRpZXMucHJlZml4ID09PSAnc3RyaW5nJyA/IHByb3BlcnRpZXMucHJlZml4IDogdGhpcy5wcm9wZXJ0aWVzLnByZWZpeDtcblxuXHRcdGlmIChpc0FkbWluICE9PSB0aGlzLnByb3BlcnRpZXMuaXNBZG1pbiB8fCBpc1B1cmUgIT09IHRoaXMucHJvcGVydGllcy5pc1B1cmUgfHwgcHJlZml4ICE9PSB0aGlzLnByb3BlcnRpZXMucHJlZml4KSB7XG5cdFx0XHR0aGlzLnByb3BlcnRpZXMuaXNBZG1pbiA9IGlzQWRtaW47XG5cdFx0XHR0aGlzLnByb3BlcnRpZXMuaXNQdXJlID0gaXNQdXJlO1xuXHRcdFx0dGhpcy5wcm9wZXJ0aWVzLnByZWZpeCA9IHByZWZpeDtcblxuXHRcdFx0dGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlclZhcmlhYmxlcyh2YXJpYWJsZXM6IElUaXRsZVZhcmlhYmxlW10pOiB2b2lkIHtcblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCB7IG5hbWUsIGNvbnRleHRLZXkgfSBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdGlmICghdGhpcy52YXJpYWJsZXMuaGFzKGNvbnRleHRLZXkpKSB7XG5cdFx0XHRcdHRoaXMudmFyaWFibGVzLnNldChjb250ZXh0S2V5LCBuYW1lKTtcblxuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0dGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUG9zc2libGUgdGVtcGxhdGUgdmFsdWVzOlxuXHQgKlxuXHQgKiB7YWN0aXZlRWRpdG9yTG9uZ306IGUuZy4gL1VzZXJzL0RldmVsb3BtZW50L215Rm9sZGVyL215RmlsZUZvbGRlci9teUZpbGUudHh0XG5cdCAqIHthY3RpdmVFZGl0b3JNZWRpdW19OiBlLmcuIG15Rm9sZGVyL215RmlsZUZvbGRlci9teUZpbGUudHh0XG5cdCAqIHthY3RpdmVFZGl0b3JTaG9ydH06IGUuZy4gbXlGaWxlLnR4dFxuXHQgKiB7YWN0aXZlRWRpdG9yTGFuZ3VhZ2VJZH06IGUuZy4gdHlwZXNjcmlwdFxuXHQgKiB7YWN0aXZlRm9sZGVyTG9uZ306IGUuZy4gL1VzZXJzL0RldmVsb3BtZW50L215Rm9sZGVyL215RmlsZUZvbGRlclxuXHQgKiB7YWN0aXZlRm9sZGVyTWVkaXVtfTogZS5nLiBteUZvbGRlci9teUZpbGVGb2xkZXJcblx0ICoge2FjdGl2ZUZvbGRlclNob3J0fTogZS5nLiBteUZpbGVGb2xkZXJcblx0ICoge3Jvb3ROYW1lfTogZS5nLiBteUZvbGRlcjEsIG15Rm9sZGVyMiwgbXlGb2xkZXIzXG5cdCAqIHtyb290UGF0aH06IGUuZy4gL1VzZXJzL0RldmVsb3BtZW50XG5cdCAqIHtmb2xkZXJOYW1lfTogZS5nLiBteUZvbGRlclxuXHQgKiB7Zm9sZGVyUGF0aH06IGUuZy4gL1VzZXJzL0RldmVsb3BtZW50L215Rm9sZGVyXG5cdCAqIHthcHBOYW1lfTogZS5nLiBWUyBDb2RlXG5cdCAqIHtyZW1vdGVOYW1lfTogZS5nLiBTU0hcblx0ICoge2RpcnR5fTogaW5kaWNhdG9yXG5cdCAqIHtmb2N1c2VkVmlld306IGUuZy4gVGVybWluYWxcblx0ICoge3NlcGFyYXRvcn06IGNvbmRpdGlvbmFsIHNlcGFyYXRvclxuXHQgKiB7YWN0aXZlRWRpdG9yU3RhdGV9OiBlLmcuIE1vZGlmaWVkXG5cdCAqL1xuXHRnZXRXaW5kb3dUaXRsZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblxuXHRcdC8vIENvbXB1dGUgcm9vdFxuXHRcdGxldCByb290OiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHRyb290ID0gd29ya3NwYWNlLmNvbmZpZ3VyYXRpb247XG5cdFx0fSBlbHNlIGlmICh3b3Jrc3BhY2UuZm9sZGVycy5sZW5ndGgpIHtcblx0XHRcdHJvb3QgPSB3b3Jrc3BhY2UuZm9sZGVyc1swXS51cmk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29tcHV0ZSBhY3RpdmUgZWRpdG9yIGZvbGRlclxuXHRcdGNvbnN0IGVkaXRvclJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRsZXQgZWRpdG9yRm9sZGVyUmVzb3VyY2UgPSBlZGl0b3JSZXNvdXJjZSA/IGRpcm5hbWUoZWRpdG9yUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChlZGl0b3JGb2xkZXJSZXNvdXJjZT8ucGF0aCA9PT0gJy4nKSB7XG5cdFx0XHRlZGl0b3JGb2xkZXJSZXNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBDb21wdXRlIGZvbGRlciByZXNvdXJjZVxuXHRcdC8vIFNpbmdsZSBSb290IFdvcmtzcGFjZTogYWx3YXlzIHRoZSByb290IHNpbmdsZSB3b3Jrc3BhY2UgaW4gdGhpcyBjYXNlXG5cdFx0Ly8gT3RoZXJ3aXNlOiByb290IGZvbGRlciBvZiB0aGUgY3VycmVudGx5IGFjdGl2ZSBmaWxlIGlmIGFueVxuXHRcdGxldCBmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRk9MREVSKSB7XG5cdFx0XHRmb2xkZXIgPSB3b3Jrc3BhY2UuZm9sZGVyc1swXTtcblx0XHR9IGVsc2UgaWYgKGVkaXRvclJlc291cmNlKSB7XG5cdFx0XHRmb2xkZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihlZGl0b3JSZXNvdXJjZSkgPz8gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIENvbXB1dGUgcmVtb3RlXG5cdFx0Ly8gdnNjb2RlLXJlbXRvZTogdXNlIGFzIGlzXG5cdFx0Ly8gb3RoZXJ3aXNlIGZpZ3VyZSBvdXQgaWYgd2UgaGF2ZSBhIHZpcnR1YWwgZm9sZGVyIG9wZW5lZFxuXHRcdGxldCByZW1vdGVOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiAhaXNXZWIpIHtcblx0XHRcdHJlbW90ZU5hbWUgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRIb3N0TGFiZWwoU2NoZW1hcy52c2NvZGVSZW1vdGUsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbiA9IGdldFZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbih3b3Jrc3BhY2UpO1xuXHRcdFx0aWYgKHZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbikge1xuXHRcdFx0XHRyZW1vdGVOYW1lID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0SG9zdExhYmVsKHZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbi5zY2hlbWUsIHZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbi5hdXRob3JpdHkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFZhcmlhYmxlc1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclNob3J0ID0gZWRpdG9yID8gZWRpdG9yLmdldFRpdGxlKFZlcmJvc2l0eS5TSE9SVCkgOiAnJztcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JNZWRpdW0gPSBlZGl0b3IgPyBlZGl0b3IuZ2V0VGl0bGUoVmVyYm9zaXR5Lk1FRElVTSkgOiBhY3RpdmVFZGl0b3JTaG9ydDtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JMb25nID0gZWRpdG9yID8gZWRpdG9yLmdldFRpdGxlKFZlcmJvc2l0eS5MT05HKSA6IGFjdGl2ZUVkaXRvck1lZGl1bTtcblx0XHRjb25zdCBhY3RpdmVGb2xkZXJTaG9ydCA9IGVkaXRvckZvbGRlclJlc291cmNlID8gYmFzZW5hbWUoZWRpdG9yRm9sZGVyUmVzb3VyY2UpIDogJyc7XG5cdFx0Y29uc3QgYWN0aXZlRm9sZGVyTWVkaXVtID0gZWRpdG9yRm9sZGVyUmVzb3VyY2UgPyB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlZGl0b3JGb2xkZXJSZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSA6ICcnO1xuXHRcdGNvbnN0IGFjdGl2ZUZvbGRlckxvbmcgPSBlZGl0b3JGb2xkZXJSZXNvdXJjZSA/IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGVkaXRvckZvbGRlclJlc291cmNlKSA6ICcnO1xuXHRcdGNvbnN0IHJvb3ROYW1lID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0V29ya3NwYWNlTGFiZWwod29ya3NwYWNlKTtcblx0XHRjb25zdCByb290TmFtZVNob3J0ID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0V29ya3NwYWNlTGFiZWwod29ya3NwYWNlLCB7IHZlcmJvc2U6IExhYmVsVmVyYm9zaXR5LlNIT1JUIH0pO1xuXHRcdGNvbnN0IHJvb3RQYXRoID0gcm9vdCA/IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJvb3QpIDogJyc7XG5cdFx0Y29uc3QgZm9sZGVyTmFtZSA9IGZvbGRlciA/IGZvbGRlci5uYW1lIDogJyc7XG5cdFx0Y29uc3QgZm9sZGVyUGF0aCA9IGZvbGRlciA/IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGZvbGRlci51cmkpIDogJyc7XG5cdFx0Y29uc3QgZGlydHkgPSBlZGl0b3I/LmlzRGlydHkoKSAmJiAhZWRpdG9yLmlzU2F2aW5nKCkgPyBXaW5kb3dUaXRsZS5USVRMRV9ESVJUWSA6ICcnO1xuXHRcdGNvbnN0IGFwcE5hbWUgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nO1xuXHRcdGNvbnN0IHByb2ZpbGVOYW1lID0gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlzRGVmYXVsdCA/ICcnIDogdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm5hbWU7XG5cdFx0Y29uc3QgZm9jdXNlZFZpZXc6IHN0cmluZyA9IHRoaXMudmlld3NTZXJ2aWNlLmdldEZvY3VzZWRWaWV3TmFtZSgpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclN0YXRlID0gZWRpdG9yUmVzb3VyY2UgPyB0aGlzLmRlY29yYXRpb25zU2VydmljZS5nZXREZWNvcmF0aW9uKGVkaXRvclJlc291cmNlLCBmYWxzZSk/LnRvb2x0aXAgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yTGFuZ3VhZ2VJZCA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZDtcblxuXHRcdGNvbnN0IHZhcmlhYmxlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgW2NvbnRleHRLZXksIG5hbWVdIG9mIHRoaXMudmFyaWFibGVzKSB7XG5cdFx0XHR2YXJpYWJsZXNbbmFtZV0gPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShjb250ZXh0S2V5KSA/PyAnJztcblx0XHR9XG5cblx0XHRsZXQgdGl0bGVUZW1wbGF0ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihXaW5kb3dTZXR0aW5nTmFtZXMudGl0bGUpO1xuXHRcdGlmICh0eXBlb2YgdGl0bGVUZW1wbGF0ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRpdGxlVGVtcGxhdGUgPSBkZWZhdWx0V2luZG93VGl0bGU7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnRpdGxlSW5jbHVkZXNFZGl0b3JTdGF0ZSAmJiB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnYWNjZXNzaWJpbGl0eS53aW5kb3dUaXRsZU9wdGltaXplZCcpKSB7XG5cdFx0XHR0aXRsZVRlbXBsYXRlICs9ICcke3NlcGFyYXRvcn0ke2FjdGl2ZUVkaXRvclN0YXRlfSc7XG5cdFx0fVxuXG5cdFx0bGV0IHNlcGFyYXRvciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihXaW5kb3dTZXR0aW5nTmFtZXMudGl0bGVTZXBhcmF0b3IpO1xuXHRcdGlmICh0eXBlb2Ygc2VwYXJhdG9yICE9PSAnc3RyaW5nJykge1xuXHRcdFx0c2VwYXJhdG9yID0gZGVmYXVsdFdpbmRvd1RpdGxlU2VwYXJhdG9yO1xuXHRcdH1cblxuXHRcdHJldHVybiB0ZW1wbGF0ZSh0aXRsZVRlbXBsYXRlLCB7XG5cdFx0XHQuLi52YXJpYWJsZXMsXG5cdFx0XHRhY3RpdmVFZGl0b3JTaG9ydCxcblx0XHRcdGFjdGl2ZUVkaXRvckxvbmcsXG5cdFx0XHRhY3RpdmVFZGl0b3JNZWRpdW0sXG5cdFx0XHRhY3RpdmVFZGl0b3JMYW5ndWFnZUlkLFxuXHRcdFx0YWN0aXZlRm9sZGVyU2hvcnQsXG5cdFx0XHRhY3RpdmVGb2xkZXJNZWRpdW0sXG5cdFx0XHRhY3RpdmVGb2xkZXJMb25nLFxuXHRcdFx0cm9vdE5hbWUsXG5cdFx0XHRyb290UGF0aCxcblx0XHRcdHJvb3ROYW1lU2hvcnQsXG5cdFx0XHRmb2xkZXJOYW1lLFxuXHRcdFx0Zm9sZGVyUGF0aCxcblx0XHRcdGRpcnR5LFxuXHRcdFx0YXBwTmFtZSxcblx0XHRcdHJlbW90ZU5hbWUsXG5cdFx0XHRwcm9maWxlTmFtZSxcblx0XHRcdGZvY3VzZWRWaWV3LFxuXHRcdFx0YWN0aXZlRWRpdG9yU3RhdGUsXG5cdFx0XHRzZXBhcmF0b3I6IHsgbGFiZWw6IHNlcGFyYXRvciB9XG5cdFx0fSk7XG5cdH1cblxuXHRpc0N1c3RvbVRpdGxlRm9ybWF0KCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkgfHwgdGhpcy50aXRsZUluY2x1ZGVzRWRpdG9yU3RhdGUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCB0aXRsZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxzdHJpbmc+KFdpbmRvd1NldHRpbmdOYW1lcy50aXRsZSk7XG5cdFx0Y29uc3QgdGl0bGVTZXBhcmF0b3IgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8c3RyaW5nPihXaW5kb3dTZXR0aW5nTmFtZXMudGl0bGVTZXBhcmF0b3IpO1xuXG5cdFx0aWYgKGlzQ29uZmlndXJlZCh0aXRsZSkgfHwgaXNDb25maWd1cmVkKHRpdGxlU2VwYXJhdG9yKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGRlZmF1bHQgdmFsdWUgaXMgb3ZlcnJpZGRlbiBmcm9tIHRoZSBjb25maWd1cmF0aW9uIHJlZ2lzdHJ5XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRyZXR1cm4gdGl0bGUuZGVmYXVsdFZhbHVlICE9PSBjb25maWd1cmF0aW9uUHJvcGVydGllc1tXaW5kb3dTZXR0aW5nTmFtZXMudGl0bGVdPy5kZWZhdWx0RGVmYXVsdFZhbHVlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxnQkFBZ0I7QUFFbEMsU0FBUyx1QkFBa0Qsb0JBQW9CO0FBQy9FLFNBQVMsY0FBYywrQkFBdUQ7QUFDOUUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLHdCQUF3QixXQUFXLHdCQUF3QjtBQUNwRSxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLDBCQUEwQixzQkFBd0M7QUFDM0Us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
