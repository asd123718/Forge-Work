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
import * as aria from "../../../base/browser/ui/aria/aria.js";
import { Disposable, toDisposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { ICodeEditorService } from "../../browser/services/codeEditorService.js";
import { CodeEditorWidget } from "../../browser/widget/codeEditor/codeEditorWidget.js";
import { InternalEditorAction } from "../../common/editorAction.js";
import { StandaloneKeybindingService, updateConfigurationService } from "./standaloneServices.js";
import { IStandaloneThemeService } from "../common/standaloneTheme.js";
import { MenuId, MenuRegistry } from "../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { INotificationService } from "../../../platform/notification/common/notification.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { IAccessibilityService } from "../../../platform/accessibility/common/accessibility.js";
import { StandaloneCodeEditorNLS } from "../../common/standaloneStrings.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { IEditorProgressService } from "../../../platform/progress/common/progress.js";
import { IModelService } from "../../common/services/model.js";
import { ILanguageService } from "../../common/languages/language.js";
import { StandaloneCodeEditorService } from "./standaloneCodeEditorService.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../common/languages/modesRegistry.js";
import { ILanguageConfigurationService } from "../../common/languages/languageConfigurationRegistry.js";
import { ILanguageFeaturesService } from "../../common/services/languageFeatures.js";
import { DiffEditorWidget } from "../../browser/widget/diffEditor/diffEditorWidget.js";
import { IAccessibilitySignalService } from "../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { mainWindow } from "../../../base/browser/window.js";
import { setHoverDelegateFactory } from "../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../platform/hover/browser/hover.js";
import { setBaseLayerHoverDelegate } from "../../../base/browser/ui/hover/hoverDelegate2.js";
import { IMarkdownRendererService } from "../../../platform/markdown/browser/markdownRenderer.js";
import { EditorMarkdownCodeBlockRenderer } from "../../browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js";
import { IUserInteractionService } from "../../../platform/userInteraction/browser/userInteractionService.js";
let LAST_GENERATED_COMMAND_ID = 0;
let ariaDomNodeCreated = false;
function createAriaDomNode(parent) {
  if (!parent) {
    if (ariaDomNodeCreated) {
      return;
    }
    ariaDomNodeCreated = true;
  }
  aria.setARIAContainer(parent || mainWindow.document.body);
}
let StandaloneCodeEditor = class extends CodeEditorWidget {
  constructor(domElement, _options, instantiationService, codeEditorService, commandService, contextKeyService, hoverService, keybindingService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, markdownRendererService, userInteractionService) {
    const options = { ..._options };
    options.ariaLabel = options.ariaLabel || StandaloneCodeEditorNLS.editorViewAccessibleLabel;
    super(domElement, options, {}, instantiationService, codeEditorService, commandService, contextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, userInteractionService);
    if (keybindingService instanceof StandaloneKeybindingService) {
      this._standaloneKeybindingService = keybindingService;
    } else {
      this._standaloneKeybindingService = null;
    }
    createAriaDomNode(options.ariaContainerElement);
    setHoverDelegateFactory((placement, enableInstantHover) => instantiationService.createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));
    setBaseLayerHoverDelegate(hoverService);
    markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
  }
  addCommand(keybinding, handler, context) {
    if (!this._standaloneKeybindingService) {
      console.warn("Cannot add command because the editor is configured with an unrecognized KeybindingService");
      return null;
    }
    const commandId = "DYNAMIC_" + ++LAST_GENERATED_COMMAND_ID;
    const whenExpression = ContextKeyExpr.deserialize(context);
    this._standaloneKeybindingService.addDynamicKeybinding(commandId, keybinding, handler, whenExpression);
    return commandId;
  }
  createContextKey(key, defaultValue) {
    return this._contextKeyService.createKey(key, defaultValue);
  }
  addAction(_descriptor) {
    if (typeof _descriptor.id !== "string" || typeof _descriptor.label !== "string" || typeof _descriptor.run !== "function") {
      throw new Error("Invalid action descriptor, `id`, `label` and `run` are required properties!");
    }
    if (!this._standaloneKeybindingService) {
      console.warn("Cannot add keybinding because the editor is configured with an unrecognized KeybindingService");
      return Disposable.None;
    }
    const id = _descriptor.id;
    const label = _descriptor.label;
    const precondition = ContextKeyExpr.and(
      ContextKeyExpr.equals("editorId", this.getId()),
      ContextKeyExpr.deserialize(_descriptor.precondition)
    );
    const keybindings = _descriptor.keybindings;
    const keybindingsWhen = ContextKeyExpr.and(
      precondition,
      ContextKeyExpr.deserialize(_descriptor.keybindingContext)
    );
    const contextMenuGroupId = _descriptor.contextMenuGroupId || null;
    const contextMenuOrder = _descriptor.contextMenuOrder || 0;
    const run = (_accessor, ...args) => {
      return Promise.resolve(_descriptor.run(this, ...args));
    };
    const toDispose = new DisposableStore();
    const uniqueId = this.getId() + ":" + id;
    toDispose.add(CommandsRegistry.registerCommand(uniqueId, run));
    if (contextMenuGroupId) {
      const menuItem = {
        command: {
          id: uniqueId,
          title: label
        },
        when: precondition,
        group: contextMenuGroupId,
        order: contextMenuOrder
      };
      toDispose.add(MenuRegistry.appendMenuItem(MenuId.EditorContext, menuItem));
    }
    if (Array.isArray(keybindings)) {
      for (const kb of keybindings) {
        toDispose.add(this._standaloneKeybindingService.addDynamicKeybinding(uniqueId, kb, run, keybindingsWhen));
      }
    }
    const internalAction = new InternalEditorAction(
      uniqueId,
      label,
      label,
      void 0,
      precondition,
      (...args) => Promise.resolve(_descriptor.run(this, ...args)),
      this._contextKeyService
    );
    this._actions.set(id, internalAction);
    toDispose.add(toDisposable(() => {
      this._actions.delete(id);
    }));
    return toDispose;
  }
  _triggerCommand(handlerId, payload) {
    if (this._codeEditorService instanceof StandaloneCodeEditorService) {
      try {
        this._codeEditorService.setActiveCodeEditor(this);
        super._triggerCommand(handlerId, payload);
      } finally {
        this._codeEditorService.setActiveCodeEditor(null);
      }
    } else {
      super._triggerCommand(handlerId, payload);
    }
  }
};
StandaloneCodeEditor = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IAccessibilityService),
  __decorateParam(11, ILanguageConfigurationService),
  __decorateParam(12, ILanguageFeaturesService),
  __decorateParam(13, IMarkdownRendererService),
  __decorateParam(14, IUserInteractionService)
], StandaloneCodeEditor);
let StandaloneEditor = class extends StandaloneCodeEditor {
  constructor(domElement, _options, instantiationService, codeEditorService, commandService, contextKeyService, hoverService, keybindingService, themeService, notificationService, configurationService, accessibilityService, modelService, languageService, languageConfigurationService, languageFeaturesService, markdownRendererService, userInteractionService) {
    const options = { ..._options };
    updateConfigurationService(configurationService, options, false);
    const themeDomRegistration = themeService.registerEditorContainer(domElement);
    if (typeof options.theme === "string") {
      themeService.setTheme(options.theme);
    }
    if (typeof options.autoDetectHighContrast !== "undefined") {
      themeService.setAutoDetectHighContrast(Boolean(options.autoDetectHighContrast));
    }
    const _model = options.model;
    delete options.model;
    super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService, hoverService, keybindingService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, markdownRendererService, userInteractionService);
    this._configurationService = configurationService;
    this._standaloneThemeService = themeService;
    this._register(themeDomRegistration);
    let model;
    if (typeof _model === "undefined") {
      const languageId = languageService.getLanguageIdByMimeType(options.language) || options.language || PLAINTEXT_LANGUAGE_ID;
      model = createTextModel(modelService, languageService, options.value || "", languageId, void 0);
      this._ownsModel = true;
    } else {
      model = _model;
      this._ownsModel = false;
    }
    this._attachModel(model);
    if (model) {
      const e = {
        oldModelUrl: null,
        newModelUrl: model.uri
      };
      this._onDidChangeModel.fire(e);
    }
  }
  updateOptions(newOptions) {
    updateConfigurationService(this._configurationService, newOptions, false);
    if (typeof newOptions.theme === "string") {
      this._standaloneThemeService.setTheme(newOptions.theme);
    }
    if (typeof newOptions.autoDetectHighContrast !== "undefined") {
      this._standaloneThemeService.setAutoDetectHighContrast(Boolean(newOptions.autoDetectHighContrast));
    }
    super.updateOptions(newOptions);
  }
  _postDetachModelCleanup(detachedModel) {
    super._postDetachModelCleanup(detachedModel);
    if (detachedModel && this._ownsModel) {
      detachedModel.dispose();
      this._ownsModel = false;
    }
  }
};
StandaloneEditor = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IStandaloneThemeService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, IModelService),
  __decorateParam(13, ILanguageService),
  __decorateParam(14, ILanguageConfigurationService),
  __decorateParam(15, ILanguageFeaturesService),
  __decorateParam(16, IMarkdownRendererService),
  __decorateParam(17, IUserInteractionService)
], StandaloneEditor);
let StandaloneDiffEditor2 = class extends DiffEditorWidget {
  constructor(domElement, _options, instantiationService, contextKeyService, codeEditorService, themeService, notificationService, configurationService, contextMenuService, editorProgressService, clipboardService, accessibilitySignalService) {
    const options = { ..._options };
    updateConfigurationService(configurationService, options, true);
    const themeDomRegistration = themeService.registerEditorContainer(domElement);
    if (typeof options.theme === "string") {
      themeService.setTheme(options.theme);
    }
    if (typeof options.autoDetectHighContrast !== "undefined") {
      themeService.setAutoDetectHighContrast(Boolean(options.autoDetectHighContrast));
    }
    super(
      domElement,
      options,
      {},
      contextKeyService,
      instantiationService,
      codeEditorService,
      accessibilitySignalService,
      editorProgressService
    );
    this._configurationService = configurationService;
    this._standaloneThemeService = themeService;
    this._register(themeDomRegistration);
  }
  updateOptions(newOptions) {
    updateConfigurationService(this._configurationService, newOptions, true);
    if (typeof newOptions.theme === "string") {
      this._standaloneThemeService.setTheme(newOptions.theme);
    }
    if (typeof newOptions.autoDetectHighContrast !== "undefined") {
      this._standaloneThemeService.setAutoDetectHighContrast(Boolean(newOptions.autoDetectHighContrast));
    }
    super.updateOptions(newOptions);
  }
  _createInnerEditor(instantiationService, container, options) {
    return instantiationService.createInstance(StandaloneCodeEditor, container, options);
  }
  getOriginalEditor() {
    return super.getOriginalEditor();
  }
  getModifiedEditor() {
    return super.getModifiedEditor();
  }
  addCommand(keybinding, handler, context) {
    return this.getModifiedEditor().addCommand(keybinding, handler, context);
  }
  createContextKey(key, defaultValue) {
    return this.getModifiedEditor().createContextKey(key, defaultValue);
  }
  addAction(descriptor) {
    return this.getModifiedEditor().addAction(descriptor);
  }
};
StandaloneDiffEditor2 = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IStandaloneThemeService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IEditorProgressService),
  __decorateParam(10, IClipboardService),
  __decorateParam(11, IAccessibilitySignalService)
], StandaloneDiffEditor2);
function createTextModel(modelService, languageService, value, languageId, uri) {
  value = value || "";
  if (!languageId) {
    const firstLF = value.indexOf("\n");
    let firstLine = value;
    if (firstLF !== -1) {
      firstLine = value.substring(0, firstLF);
    }
    return doCreateModel(modelService, value, languageService.createByFilepathOrFirstLine(uri || null, firstLine), uri);
  }
  return doCreateModel(modelService, value, languageService.createById(languageId), uri);
}
function doCreateModel(modelService, value, languageSelection, uri) {
  return modelService.createModel(value, languageSelection, uri);
}
export {
  StandaloneCodeEditor,
  StandaloneDiffEditor2,
  StandaloneEditor,
  createTextModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHN0YW5kYWxvbmVcXGJyb3dzZXJcXHN0YW5kYWxvbmVDb2RlRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXJpYSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSURpZmZFZGl0b3IsIElEaWZmRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3JPcHRpb25zLCBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJbnRlcm5hbEVkaXRvckFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3JBY3Rpb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFN0YW5kYWxvbmVLZXliaW5kaW5nU2VydmljZSwgdXBkYXRlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuL3N0YW5kYWxvbmVTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zdGFuZGFsb25lVGhlbWUuanMnO1xuaW1wb3J0IHsgSU1lbnVJdGVtLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRIYW5kbGVyLCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleVZhbHVlLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IFN0YW5kYWxvbmVDb2RlRWRpdG9yTkxTIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YW5kYWxvbmVTdHJpbmdzLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4vc3RhbmRhbG9uZVRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlbGVjdGlvbiwgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFN0YW5kYWxvbmVDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4vc3RhbmRhbG9uZUNvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi9icm93c2VyL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2RpZmZFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IHNldEhvdmVyRGVsZWdhdGVGYWN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UsIFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IHNldEJhc2VMYXllckhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZTIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEVkaXRvck1hcmtkb3duQ29kZUJsb2NrUmVuZGVyZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3dpZGdldC9tYXJrZG93blJlbmRlcmVyL2Jyb3dzZXIvZWRpdG9yTWFya2Rvd25Db2RlQmxvY2tSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJVXNlckludGVyYWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJJbnRlcmFjdGlvbi9icm93c2VyL3VzZXJJbnRlcmFjdGlvblNlcnZpY2UuanMnO1xuXG4vKipcbiAqIERlc2NyaXB0aW9uIG9mIGFuIGFjdGlvbiBjb250cmlidXRpb25cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uRGVzY3JpcHRvciB7XG5cdC8qKlxuXHQgKiBBbiB1bmlxdWUgaWRlbnRpZmllciBvZiB0aGUgY29udHJpYnV0ZWQgYWN0aW9uLlxuXHQgKi9cblx0aWQ6IHN0cmluZztcblx0LyoqXG5cdCAqIEEgbGFiZWwgb2YgdGhlIGFjdGlvbiB0aGF0IHdpbGwgYmUgcHJlc2VudGVkIHRvIHRoZSB1c2VyLlxuXHQgKi9cblx0bGFiZWw6IHN0cmluZztcblx0LyoqXG5cdCAqIFByZWNvbmRpdGlvbiBydWxlLiBUaGUgdmFsdWUgc2hvdWxkIGJlIGEgW2NvbnRleHQga2V5IGV4cHJlc3Npb25dKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZ2V0c3RhcnRlZC9rZXliaW5kaW5ncyNfd2hlbi1jbGF1c2UtY29udGV4dHMpLlxuXHQgKi9cblx0cHJlY29uZGl0aW9uPzogc3RyaW5nO1xuXHQvKipcblx0ICogQW4gYXJyYXkgb2Yga2V5YmluZGluZ3MgZm9yIHRoZSBhY3Rpb24uXG5cdCAqL1xuXHRrZXliaW5kaW5ncz86IG51bWJlcltdO1xuXHQvKipcblx0ICogVGhlIGtleWJpbmRpbmcgcnVsZSAoY29uZGl0aW9uIG9uIHRvcCBvZiBwcmVjb25kaXRpb24pLlxuXHQgKi9cblx0a2V5YmluZGluZ0NvbnRleHQ/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBDb250cm9sIGlmIHRoZSBhY3Rpb24gc2hvdWxkIHNob3cgdXAgaW4gdGhlIGNvbnRleHQgbWVudSBhbmQgd2hlcmUuXG5cdCAqIFRoZSBjb250ZXh0IG1lbnUgb2YgdGhlIGVkaXRvciBoYXMgdGhlc2UgZGVmYXVsdDpcblx0ICogICBuYXZpZ2F0aW9uIC0gVGhlIG5hdmlnYXRpb24gZ3JvdXAgY29tZXMgZmlyc3QgaW4gYWxsIGNhc2VzLlxuXHQgKiAgIDFfbW9kaWZpY2F0aW9uIC0gVGhpcyBncm91cCBjb21lcyBuZXh0IGFuZCBjb250YWlucyBjb21tYW5kcyB0aGF0IG1vZGlmeSB5b3VyIGNvZGUuXG5cdCAqICAgOV9jdXRjb3B5cGFzdGUgLSBUaGUgbGFzdCBkZWZhdWx0IGdyb3VwIHdpdGggdGhlIGJhc2ljIGVkaXRpbmcgY29tbWFuZHMuXG5cdCAqIFlvdSBjYW4gYWxzbyBjcmVhdGUgeW91ciBvd24gZ3JvdXAuXG5cdCAqIERlZmF1bHRzIHRvIG51bGwgKGRvbid0IHNob3cgaW4gY29udGV4dCBtZW51KS5cblx0ICovXG5cdGNvbnRleHRNZW51R3JvdXBJZD86IHN0cmluZztcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIG9yZGVyIGluIHRoZSBjb250ZXh0IG1lbnUgZ3JvdXAuXG5cdCAqL1xuXHRjb250ZXh0TWVudU9yZGVyPzogbnVtYmVyO1xuXHQvKipcblx0ICogTWV0aG9kIHRoYXQgd2lsbCBiZSBleGVjdXRlZCB3aGVuIHRoZSBhY3Rpb24gaXMgdHJpZ2dlcmVkLlxuXHQgKiBAcGFyYW0gZWRpdG9yIFRoZSBlZGl0b3IgaW5zdGFuY2UgaXMgcGFzc2VkIGluIGFzIGEgY29udmVuaWVuY2Vcblx0ICovXG5cdHJ1bihlZGl0b3I6IElDb2RlRWRpdG9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcbn1cblxuLyoqXG4gKiBPcHRpb25zIHdoaWNoIGFwcGx5IGZvciBhbGwgZWRpdG9ycy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJR2xvYmFsRWRpdG9yT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBUaGUgbnVtYmVyIG9mIHNwYWNlcyBhIHRhYiBpcyBlcXVhbCB0by5cblx0ICogVGhpcyBzZXR0aW5nIGlzIG92ZXJyaWRkZW4gYmFzZWQgb24gdGhlIGZpbGUgY29udGVudHMgd2hlbiBgZGV0ZWN0SW5kZW50YXRpb25gIGlzIG9uLlxuXHQgKiBEZWZhdWx0cyB0byA0LlxuXHQgKi9cblx0dGFiU2l6ZT86IG51bWJlcjtcblx0LyoqXG5cdCAqIEluc2VydCBzcGFjZXMgd2hlbiBwcmVzc2luZyBgVGFiYC5cblx0ICogVGhpcyBzZXR0aW5nIGlzIG92ZXJyaWRkZW4gYmFzZWQgb24gdGhlIGZpbGUgY29udGVudHMgd2hlbiBgZGV0ZWN0SW5kZW50YXRpb25gIGlzIG9uLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0aW5zZXJ0U3BhY2VzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgYHRhYlNpemVgIGFuZCBgaW5zZXJ0U3BhY2VzYCB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgZGV0ZWN0ZWQgd2hlbiBhIGZpbGUgaXMgb3BlbmVkIGJhc2VkIG9uIHRoZSBmaWxlIGNvbnRlbnRzLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0ZGV0ZWN0SW5kZW50YXRpb24/OiBib29sZWFuO1xuXHQvKipcblx0ICogUmVtb3ZlIHRyYWlsaW5nIGF1dG8gaW5zZXJ0ZWQgd2hpdGVzcGFjZS5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHRyaW1BdXRvV2hpdGVzcGFjZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTcGVjaWFsIGhhbmRsaW5nIGZvciBsYXJnZSBmaWxlcyB0byBkaXNhYmxlIGNlcnRhaW4gbWVtb3J5IGludGVuc2l2ZSBmZWF0dXJlcy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGxhcmdlRmlsZU9wdGltaXphdGlvbnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciBjb21wbGV0aW9ucyBzaG91bGQgYmUgY29tcHV0ZWQgYmFzZWQgb24gd29yZHMgaW4gdGhlIGRvY3VtZW50LlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0d29yZEJhc2VkU3VnZ2VzdGlvbnM/OiAnb2ZmJyB8ICdjdXJyZW50RG9jdW1lbnQnIHwgJ21hdGNoaW5nRG9jdW1lbnRzJyB8ICdhbGxEb2N1bWVudHMnO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB3b3JkIGJhc2VkIGNvbXBsZXRpb25zIHNob3VsZCBiZSBpbmNsdWRlZCBmcm9tIG9wZW5lZCBkb2N1bWVudHMgb2YgdGhlIHNhbWUgbGFuZ3VhZ2Ugb3IgYW55IGxhbmd1YWdlLlxuXHQgKi9cblx0d29yZEJhc2VkU3VnZ2VzdGlvbnNPbmx5U2FtZUxhbmd1YWdlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIHNlbWFudGljSGlnaGxpZ2h0aW5nIGlzIHNob3duIGZvciB0aGUgbGFuZ3VhZ2VzIHRoYXQgc3VwcG9ydCBpdC5cblx0ICogdHJ1ZTogc2VtYW50aWNIaWdobGlnaHRpbmcgaXMgZW5hYmxlZCBmb3IgYWxsIHRoZW1lc1xuXHQgKiBmYWxzZTogc2VtYW50aWNIaWdobGlnaHRpbmcgaXMgZGlzYWJsZWQgZm9yIGFsbCB0aGVtZXNcblx0ICogJ2NvbmZpZ3VyZWRCeVRoZW1lJzogc2VtYW50aWNIaWdobGlnaHRpbmcgaXMgY29udHJvbGxlZCBieSB0aGUgY3VycmVudCBjb2xvciB0aGVtZSdzIHNlbWFudGljSGlnaGxpZ2h0aW5nIHNldHRpbmcuXG5cdCAqIERlZmF1bHRzIHRvICdieVRoZW1lJy5cblx0ICovXG5cdCdzZW1hbnRpY0hpZ2hsaWdodGluZy5lbmFibGVkJz86IHRydWUgfCBmYWxzZSB8ICdjb25maWd1cmVkQnlUaGVtZSc7XG5cdC8qKlxuXHQgKiBLZWVwIHBlZWsgZWRpdG9ycyBvcGVuIGV2ZW4gd2hlbiBkb3VibGUtY2xpY2tpbmcgdGhlaXIgY29udGVudCBvciB3aGVuIGhpdHRpbmcgYEVzY2FwZWAuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0c3RhYmxlUGVlaz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBMaW5lcyBhYm92ZSB0aGlzIGxlbmd0aCB3aWxsIG5vdCBiZSB0b2tlbml6ZWQgZm9yIHBlcmZvcm1hbmNlIHJlYXNvbnMuXG5cdCAqIERlZmF1bHRzIHRvIDIwMDAwLlxuXHQgKi9cblx0bWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aD86IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZW1lIHRvIGJlIHVzZWQgZm9yIHJlbmRlcmluZy5cblx0ICogVGhlIGN1cnJlbnQgb3V0LW9mLXRoZS1ib3ggYXZhaWxhYmxlIHRoZW1lcyBhcmU6ICd2cycgKGRlZmF1bHQpLCAndnMtZGFyaycsICdoYy1ibGFjaycsICdoYy1saWdodCcuXG5cdCAqIFlvdSBjYW4gY3JlYXRlIGN1c3RvbSB0aGVtZXMgdmlhIGBtb25hY28uZWRpdG9yLmRlZmluZVRoZW1lYC5cblx0ICogVG8gc3dpdGNoIGEgdGhlbWUsIHVzZSBgbW9uYWNvLmVkaXRvci5zZXRUaGVtZWAuXG5cdCAqICoqTk9URSoqOiBUaGUgdGhlbWUgbWlnaHQgYmUgb3ZlcndyaXR0ZW4gaWYgdGhlIE9TIGlzIGluIGhpZ2ggY29udHJhc3QgbW9kZSwgdW5sZXNzIGBhdXRvRGV0ZWN0SGlnaENvbnRyYXN0YCBpcyBzZXQgdG8gZmFsc2UuXG5cdCAqL1xuXHR0aGVtZT86IHN0cmluZztcblx0LyoqXG5cdCAqIElmIGVuYWJsZWQsIHdpbGwgYXV0b21hdGljYWxseSBjaGFuZ2UgdG8gaGlnaCBjb250cmFzdCB0aGVtZSBpZiB0aGUgT1MgaXMgdXNpbmcgYSBoaWdoIGNvbnRyYXN0IHRoZW1lLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0YXV0b0RldGVjdEhpZ2hDb250cmFzdD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogVGhlIG9wdGlvbnMgdG8gY3JlYXRlIGFuIGVkaXRvci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU3RhbmRhbG9uZUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgZXh0ZW5kcyBJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucywgSUdsb2JhbEVkaXRvck9wdGlvbnMge1xuXHQvKipcblx0ICogVGhlIGluaXRpYWwgbW9kZWwgYXNzb2NpYXRlZCB3aXRoIHRoaXMgY29kZSBlZGl0b3IuXG5cdCAqL1xuXHRtb2RlbD86IElUZXh0TW9kZWwgfCBudWxsO1xuXHQvKipcblx0ICogVGhlIGluaXRpYWwgdmFsdWUgb2YgdGhlIGF1dG8gY3JlYXRlZCBtb2RlbCBpbiB0aGUgZWRpdG9yLlxuXHQgKiBUbyBub3QgYXV0b21hdGljYWxseSBjcmVhdGUgYSBtb2RlbCwgdXNlIGBtb2RlbDogbnVsbGAuXG5cdCAqL1xuXHR2YWx1ZT86IHN0cmluZztcblx0LyoqXG5cdCAqIFRoZSBpbml0aWFsIGxhbmd1YWdlIG9mIHRoZSBhdXRvIGNyZWF0ZWQgbW9kZWwgaW4gdGhlIGVkaXRvci5cblx0ICogVG8gbm90IGF1dG9tYXRpY2FsbHkgY3JlYXRlIGEgbW9kZWwsIHVzZSBgbW9kZWw6IG51bGxgLlxuXHQgKi9cblx0bGFuZ3VhZ2U/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBJbml0aWFsIHRoZW1lIHRvIGJlIHVzZWQgZm9yIHJlbmRlcmluZy5cblx0ICogVGhlIGN1cnJlbnQgb3V0LW9mLXRoZS1ib3ggYXZhaWxhYmxlIHRoZW1lcyBhcmU6ICd2cycgKGRlZmF1bHQpLCAndnMtZGFyaycsICdoYy1ibGFjaycsICdoYy1saWdodC5cblx0ICogWW91IGNhbiBjcmVhdGUgY3VzdG9tIHRoZW1lcyB2aWEgYG1vbmFjby5lZGl0b3IuZGVmaW5lVGhlbWVgLlxuXHQgKiBUbyBzd2l0Y2ggYSB0aGVtZSwgdXNlIGBtb25hY28uZWRpdG9yLnNldFRoZW1lYC5cblx0ICogKipOT1RFKio6IFRoZSB0aGVtZSBtaWdodCBiZSBvdmVyd3JpdHRlbiBpZiB0aGUgT1MgaXMgaW4gaGlnaCBjb250cmFzdCBtb2RlLCB1bmxlc3MgYGF1dG9EZXRlY3RIaWdoQ29udHJhc3RgIGlzIHNldCB0byBmYWxzZS5cblx0ICovXG5cdHRoZW1lPzogc3RyaW5nO1xuXHQvKipcblx0ICogSWYgZW5hYmxlZCwgd2lsbCBhdXRvbWF0aWNhbGx5IGNoYW5nZSB0byBoaWdoIGNvbnRyYXN0IHRoZW1lIGlmIHRoZSBPUyBpcyB1c2luZyBhIGhpZ2ggY29udHJhc3QgdGhlbWUuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRhdXRvRGV0ZWN0SGlnaENvbnRyYXN0PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEFuIFVSTCB0byBvcGVuIHdoZW4gQ3RybCtIIChXaW5kb3dzIGFuZCBMaW51eCkgb3IgQ21kK0ggKE9TWCkgaXMgcHJlc3NlZCBpblxuXHQgKiB0aGUgYWNjZXNzaWJpbGl0eSBoZWxwIGRpYWxvZyBpbiB0aGUgZWRpdG9yLlxuXHQgKlxuXHQgKiBEZWZhdWx0cyB0byBcImh0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP2xpbmtpZD04NTI0NTBcIlxuXHQgKi9cblx0YWNjZXNzaWJpbGl0eUhlbHBVcmw/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBDb250YWluZXIgZWxlbWVudCB0byB1c2UgZm9yIEFSSUEgbWVzc2FnZXMuXG5cdCAqIERlZmF1bHRzIHRvIGRvY3VtZW50LmJvZHkuXG5cdCAqL1xuXHRhcmlhQ29udGFpbmVyRWxlbWVudD86IEhUTUxFbGVtZW50O1xufVxuXG4vKipcbiAqIFRoZSBvcHRpb25zIHRvIGNyZWF0ZSBhIGRpZmYgZWRpdG9yLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTdGFuZGFsb25lRGlmZkVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgZXh0ZW5kcyBJRGlmZkVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMge1xuXHQvKipcblx0ICogSW5pdGlhbCB0aGVtZSB0byBiZSB1c2VkIGZvciByZW5kZXJpbmcuXG5cdCAqIFRoZSBjdXJyZW50IG91dC1vZi10aGUtYm94IGF2YWlsYWJsZSB0aGVtZXMgYXJlOiAndnMnIChkZWZhdWx0KSwgJ3ZzLWRhcmsnLCAnaGMtYmxhY2snLCAnaGMtbGlnaHQuXG5cdCAqIFlvdSBjYW4gY3JlYXRlIGN1c3RvbSB0aGVtZXMgdmlhIGBtb25hY28uZWRpdG9yLmRlZmluZVRoZW1lYC5cblx0ICogVG8gc3dpdGNoIGEgdGhlbWUsIHVzZSBgbW9uYWNvLmVkaXRvci5zZXRUaGVtZWAuXG5cdCAqICoqTk9URSoqOiBUaGUgdGhlbWUgbWlnaHQgYmUgb3ZlcndyaXR0ZW4gaWYgdGhlIE9TIGlzIGluIGhpZ2ggY29udHJhc3QgbW9kZSwgdW5sZXNzIGBhdXRvRGV0ZWN0SGlnaENvbnRyYXN0YCBpcyBzZXQgdG8gZmFsc2UuXG5cdCAqL1xuXHR0aGVtZT86IHN0cmluZztcblx0LyoqXG5cdCAqIElmIGVuYWJsZWQsIHdpbGwgYXV0b21hdGljYWxseSBjaGFuZ2UgdG8gaGlnaCBjb250cmFzdCB0aGVtZSBpZiB0aGUgT1MgaXMgdXNpbmcgYSBoaWdoIGNvbnRyYXN0IHRoZW1lLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0YXV0b0RldGVjdEhpZ2hDb250cmFzdD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0YW5kYWxvbmVDb2RlRWRpdG9yIGV4dGVuZHMgSUNvZGVFZGl0b3Ige1xuXHR1cGRhdGVPcHRpb25zKG5ld09wdGlvbnM6IElFZGl0b3JPcHRpb25zICYgSUdsb2JhbEVkaXRvck9wdGlvbnMpOiB2b2lkO1xuXHRhZGRDb21tYW5kKGtleWJpbmRpbmc6IG51bWJlciwgaGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyLCBjb250ZXh0Pzogc3RyaW5nKTogc3RyaW5nIHwgbnVsbDtcblx0Y3JlYXRlQ29udGV4dEtleTxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlID0gQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUKTogSUNvbnRleHRLZXk8VD47XG5cdGFkZEFjdGlvbihkZXNjcmlwdG9yOiBJQWN0aW9uRGVzY3JpcHRvcik6IElEaXNwb3NhYmxlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdGFuZGFsb25lRGlmZkVkaXRvciBleHRlbmRzIElEaWZmRWRpdG9yIHtcblx0YWRkQ29tbWFuZChrZXliaW5kaW5nOiBudW1iZXIsIGhhbmRsZXI6IElDb21tYW5kSGFuZGxlciwgY29udGV4dD86IHN0cmluZyk6IHN0cmluZyB8IG51bGw7XG5cdGNyZWF0ZUNvbnRleHRLZXk8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZSA9IENvbnRleHRLZXlWYWx1ZT4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogVCk6IElDb250ZXh0S2V5PFQ+O1xuXHRhZGRBY3Rpb24oZGVzY3JpcHRvcjogSUFjdGlvbkRlc2NyaXB0b3IpOiBJRGlzcG9zYWJsZTtcblxuXHRnZXRPcmlnaW5hbEVkaXRvcigpOiBJU3RhbmRhbG9uZUNvZGVFZGl0b3I7XG5cdGdldE1vZGlmaWVkRWRpdG9yKCk6IElTdGFuZGFsb25lQ29kZUVkaXRvcjtcbn1cblxubGV0IExBU1RfR0VORVJBVEVEX0NPTU1BTkRfSUQgPSAwO1xuXG5sZXQgYXJpYURvbU5vZGVDcmVhdGVkID0gZmFsc2U7XG4vKipcbiAqIENyZWF0ZSBBUklBIGRvbSBub2RlIGluc2lkZSBwYXJlbnQsXG4gKiBvciBvbmx5IGZvciB0aGUgZmlyc3QgZWRpdG9yIGluc3RhbnRpYXRpb24gaW5zaWRlIGRvY3VtZW50LmJvZHkuXG4gKiBAcGFyYW0gcGFyZW50IGNvbnRhaW5lciBlbGVtZW50IGZvciBBUklBIGRvbSBub2RlXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUFyaWFEb21Ob2RlKHBhcmVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQpIHtcblx0aWYgKCFwYXJlbnQpIHtcblx0XHRpZiAoYXJpYURvbU5vZGVDcmVhdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFyaWFEb21Ob2RlQ3JlYXRlZCA9IHRydWU7XG5cdH1cblx0YXJpYS5zZXRBUklBQ29udGFpbmVyKHBhcmVudCB8fCBtYWluV2luZG93LmRvY3VtZW50LmJvZHkpO1xufVxuXG4vKipcbiAqIEEgY29kZSBlZGl0b3IgdG8gYmUgdXNlZCBib3RoIGJ5IHRoZSBzdGFuZGFsb25lIGVkaXRvciBhbmQgdGhlIHN0YW5kYWxvbmUgZGlmZiBlZGl0b3IuXG4gKi9cbmV4cG9ydCBjbGFzcyBTdGFuZGFsb25lQ29kZUVkaXRvciBleHRlbmRzIENvZGVFZGl0b3JXaWRnZXQgaW1wbGVtZW50cyBJU3RhbmRhbG9uZUNvZGVFZGl0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YW5kYWxvbmVLZXliaW5kaW5nU2VydmljZTogU3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkb21FbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRfb3B0aW9uczogUmVhZG9ubHk8SVN0YW5kYWxvbmVFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASVVzZXJJbnRlcmFjdGlvblNlcnZpY2UgdXNlckludGVyYWN0aW9uU2VydmljZTogSVVzZXJJbnRlcmFjdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB7IC4uLl9vcHRpb25zIH07XG5cdFx0b3B0aW9ucy5hcmlhTGFiZWwgPSBvcHRpb25zLmFyaWFMYWJlbCB8fCBTdGFuZGFsb25lQ29kZUVkaXRvck5MUy5lZGl0b3JWaWV3QWNjZXNzaWJsZUxhYmVsO1xuXHRcdHN1cGVyKGRvbUVsZW1lbnQsIG9wdGlvbnMsIHt9LCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29kZUVkaXRvclNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBhY2Nlc3NpYmlsaXR5U2VydmljZSwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIHVzZXJJbnRlcmFjdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKGtleWJpbmRpbmdTZXJ2aWNlIGluc3RhbmNlb2YgU3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlKSB7XG5cdFx0XHR0aGlzLl9zdGFuZGFsb25lS2V5YmluZGluZ1NlcnZpY2UgPSBrZXliaW5kaW5nU2VydmljZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlID0gbnVsbDtcblx0XHR9XG5cblx0XHRjcmVhdGVBcmlhRG9tTm9kZShvcHRpb25zLmFyaWFDb250YWluZXJFbGVtZW50KTtcblxuXHRcdHNldEhvdmVyRGVsZWdhdGVGYWN0b3J5KChwbGFjZW1lbnQsIGVuYWJsZUluc3RhbnRIb3ZlcikgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSwgcGxhY2VtZW50LCB7IGluc3RhbnRIb3ZlcjogZW5hYmxlSW5zdGFudEhvdmVyIH0sIHt9KSk7XG5cdFx0c2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZShob3ZlclNlcnZpY2UpO1xuXG5cdFx0bWFya2Rvd25SZW5kZXJlclNlcnZpY2Uuc2V0RGVmYXVsdENvZGVCbG9ja1JlbmRlcmVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvck1hcmtkb3duQ29kZUJsb2NrUmVuZGVyZXIpKTtcblx0fVxuXG5cdHB1YmxpYyBhZGRDb21tYW5kKGtleWJpbmRpbmc6IG51bWJlciwgaGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyLCBjb250ZXh0Pzogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9zdGFuZGFsb25lS2V5YmluZGluZ1NlcnZpY2UpIHtcblx0XHRcdGNvbnNvbGUud2FybignQ2Fubm90IGFkZCBjb21tYW5kIGJlY2F1c2UgdGhlIGVkaXRvciBpcyBjb25maWd1cmVkIHdpdGggYW4gdW5yZWNvZ25pemVkIEtleWJpbmRpbmdTZXJ2aWNlJyk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZElkID0gJ0RZTkFNSUNfJyArICgrK0xBU1RfR0VORVJBVEVEX0NPTU1BTkRfSUQpO1xuXHRcdGNvbnN0IHdoZW5FeHByZXNzaW9uID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoY29udGV4dCk7XG5cdFx0dGhpcy5fc3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlLmFkZER5bmFtaWNLZXliaW5kaW5nKGNvbW1hbmRJZCwga2V5YmluZGluZywgaGFuZGxlciwgd2hlbkV4cHJlc3Npb24pO1xuXHRcdHJldHVybiBjb21tYW5kSWQ7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlQ29udGV4dEtleTxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlID0gQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUKTogSUNvbnRleHRLZXk8VD4ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoa2V5LCBkZWZhdWx0VmFsdWUpO1xuXHR9XG5cblx0cHVibGljIGFkZEFjdGlvbihfZGVzY3JpcHRvcjogSUFjdGlvbkRlc2NyaXB0b3IpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKCh0eXBlb2YgX2Rlc2NyaXB0b3IuaWQgIT09ICdzdHJpbmcnKSB8fCAodHlwZW9mIF9kZXNjcmlwdG9yLmxhYmVsICE9PSAnc3RyaW5nJykgfHwgKHR5cGVvZiBfZGVzY3JpcHRvci5ydW4gIT09ICdmdW5jdGlvbicpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYWN0aW9uIGRlc2NyaXB0b3IsIGBpZGAsIGBsYWJlbGAgYW5kIGBydW5gIGFyZSByZXF1aXJlZCBwcm9wZXJ0aWVzIScpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3N0YW5kYWxvbmVLZXliaW5kaW5nU2VydmljZSkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdDYW5ub3QgYWRkIGtleWJpbmRpbmcgYmVjYXVzZSB0aGUgZWRpdG9yIGlzIGNvbmZpZ3VyZWQgd2l0aCBhbiB1bnJlY29nbml6ZWQgS2V5YmluZGluZ1NlcnZpY2UnKTtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXG5cdFx0Ly8gUmVhZCBkZXNjcmlwdG9yIG9wdGlvbnNcblx0XHRjb25zdCBpZCA9IF9kZXNjcmlwdG9yLmlkO1xuXHRcdGNvbnN0IGxhYmVsID0gX2Rlc2NyaXB0b3IubGFiZWw7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdlZGl0b3JJZCcsIHRoaXMuZ2V0SWQoKSksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShfZGVzY3JpcHRvci5wcmVjb25kaXRpb24pXG5cdFx0KTtcblx0XHRjb25zdCBrZXliaW5kaW5ncyA9IF9kZXNjcmlwdG9yLmtleWJpbmRpbmdzO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdzV2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdHByZWNvbmRpdGlvbixcblx0XHRcdENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKF9kZXNjcmlwdG9yLmtleWJpbmRpbmdDb250ZXh0KVxuXHRcdCk7XG5cdFx0Y29uc3QgY29udGV4dE1lbnVHcm91cElkID0gX2Rlc2NyaXB0b3IuY29udGV4dE1lbnVHcm91cElkIHx8IG51bGw7XG5cdFx0Y29uc3QgY29udGV4dE1lbnVPcmRlciA9IF9kZXNjcmlwdG9yLmNvbnRleHRNZW51T3JkZXIgfHwgMDtcblx0XHRjb25zdCBydW4gPSAoX2FjY2Vzc29yPzogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKF9kZXNjcmlwdG9yLnJ1bih0aGlzLCAuLi5hcmdzKSk7XG5cdFx0fTtcblxuXG5cdFx0Y29uc3QgdG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gR2VuZXJhdGUgYSB1bmlxdWUgaWQgdG8gYWxsb3cgdGhlIHNhbWUgZGVzY3JpcHRvci5pZCBhY3Jvc3MgbXVsdGlwbGUgZWRpdG9yIGluc3RhbmNlc1xuXHRcdGNvbnN0IHVuaXF1ZUlkID0gdGhpcy5nZXRJZCgpICsgJzonICsgaWQ7XG5cblx0XHQvLyBSZWdpc3RlciB0aGUgY29tbWFuZFxuXHRcdHRvRGlzcG9zZS5hZGQoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQodW5pcXVlSWQsIHJ1bikpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGNvbnRleHQgbWVudSBpdGVtXG5cdFx0aWYgKGNvbnRleHRNZW51R3JvdXBJZCkge1xuXHRcdFx0Y29uc3QgbWVudUl0ZW06IElNZW51SXRlbSA9IHtcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiB1bmlxdWVJZCxcblx0XHRcdFx0XHR0aXRsZTogbGFiZWxcblx0XHRcdFx0fSxcblx0XHRcdFx0d2hlbjogcHJlY29uZGl0aW9uLFxuXHRcdFx0XHRncm91cDogY29udGV4dE1lbnVHcm91cElkLFxuXHRcdFx0XHRvcmRlcjogY29udGV4dE1lbnVPcmRlclxuXHRcdFx0fTtcblx0XHRcdHRvRGlzcG9zZS5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JDb250ZXh0LCBtZW51SXRlbSkpO1xuXHRcdH1cblxuXHRcdC8vIFJlZ2lzdGVyIHRoZSBrZXliaW5kaW5nc1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGtleWJpbmRpbmdzKSkge1xuXHRcdFx0Zm9yIChjb25zdCBrYiBvZiBrZXliaW5kaW5ncykge1xuXHRcdFx0XHR0b0Rpc3Bvc2UuYWRkKHRoaXMuX3N0YW5kYWxvbmVLZXliaW5kaW5nU2VydmljZS5hZGREeW5hbWljS2V5YmluZGluZyh1bmlxdWVJZCwga2IsIHJ1biwga2V5YmluZGluZ3NXaGVuKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmluYWxseSwgcmVnaXN0ZXIgYW4gaW50ZXJuYWwgZWRpdG9yIGFjdGlvblxuXHRcdGNvbnN0IGludGVybmFsQWN0aW9uID0gbmV3IEludGVybmFsRWRpdG9yQWN0aW9uKFxuXHRcdFx0dW5pcXVlSWQsXG5cdFx0XHRsYWJlbCxcblx0XHRcdGxhYmVsLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0cHJlY29uZGl0aW9uLFxuXHRcdFx0KC4uLmFyZ3M6IHVua25vd25bXSkgPT4gUHJvbWlzZS5yZXNvbHZlKF9kZXNjcmlwdG9yLnJ1bih0aGlzLCAuLi5hcmdzKSksXG5cdFx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZVxuXHRcdCk7XG5cblx0XHQvLyBTdG9yZSBpdCB1bmRlciB0aGUgb3JpZ2luYWwgaWQsIHN1Y2ggdGhhdCB0cmlnZ2VyIHdpdGggdGhlIG9yaWdpbmFsIGlkIHdpbGwgd29ya1xuXHRcdHRoaXMuX2FjdGlvbnMuc2V0KGlkLCBpbnRlcm5hbEFjdGlvbik7XG5cdFx0dG9EaXNwb3NlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYWN0aW9ucy5kZWxldGUoaWQpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3RyaWdnZXJDb21tYW5kKGhhbmRsZXJJZDogc3RyaW5nLCBwYXlsb2FkOiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlIGluc3RhbmNlb2YgU3RhbmRhbG9uZUNvZGVFZGl0b3JTZXJ2aWNlKSB7XG5cdFx0XHQvLyBIZWxwIGNvbW1hbmRzIGZpbmQgdGhpcyBlZGl0b3IgYXMgdGhlIGFjdGl2ZSBlZGl0b3Jcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLnNldEFjdGl2ZUNvZGVFZGl0b3IodGhpcyk7XG5cdFx0XHRcdHN1cGVyLl90cmlnZ2VyQ29tbWFuZChoYW5kbGVySWQsIHBheWxvYWQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5fY29kZUVkaXRvclNlcnZpY2Uuc2V0QWN0aXZlQ29kZUVkaXRvcihudWxsKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0c3VwZXIuX3RyaWdnZXJDb21tYW5kKGhhbmRsZXJJZCwgcGF5bG9hZCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdGFuZGFsb25lRWRpdG9yIGV4dGVuZHMgU3RhbmRhbG9uZUNvZGVFZGl0b3IgaW1wbGVtZW50cyBJU3RhbmRhbG9uZUNvZGVFZGl0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YW5kYWxvbmVUaGVtZVNlcnZpY2U6IElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlO1xuXHRwcml2YXRlIF9vd25zTW9kZWw6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZG9tRWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0X29wdGlvbnM6IFJlYWRvbmx5PElTdGFuZGFsb25lRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucz4gfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASVVzZXJJbnRlcmFjdGlvblNlcnZpY2UgdXNlckludGVyYWN0aW9uU2VydmljZTogSVVzZXJJbnRlcmFjdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB7IC4uLl9vcHRpb25zIH07XG5cdFx0dXBkYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoY29uZmlndXJhdGlvblNlcnZpY2UsIG9wdGlvbnMsIGZhbHNlKTtcblx0XHRjb25zdCB0aGVtZURvbVJlZ2lzdHJhdGlvbiA9ICg8U3RhbmRhbG9uZVRoZW1lU2VydmljZT50aGVtZVNlcnZpY2UpLnJlZ2lzdGVyRWRpdG9yQ29udGFpbmVyKGRvbUVsZW1lbnQpO1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy50aGVtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoZW1lU2VydmljZS5zZXRUaGVtZShvcHRpb25zLnRoZW1lKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLmF1dG9EZXRlY3RIaWdoQ29udHJhc3QgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGVtZVNlcnZpY2Uuc2V0QXV0b0RldGVjdEhpZ2hDb250cmFzdChCb29sZWFuKG9wdGlvbnMuYXV0b0RldGVjdEhpZ2hDb250cmFzdCkpO1xuXHRcdH1cblx0XHRjb25zdCBfbW9kZWw6IElUZXh0TW9kZWwgfCBudWxsIHwgdW5kZWZpbmVkID0gb3B0aW9ucy5tb2RlbDtcblx0XHRkZWxldGUgb3B0aW9ucy5tb2RlbDtcblx0XHRzdXBlcihkb21FbGVtZW50LCBvcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29kZUVkaXRvclNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgaG92ZXJTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBhY2Nlc3NpYmlsaXR5U2VydmljZSwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCB1c2VySW50ZXJhY3Rpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5fc3RhbmRhbG9uZVRoZW1lU2VydmljZSA9IHRoZW1lU2VydmljZTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGVtZURvbVJlZ2lzdHJhdGlvbik7XG5cblx0XHRsZXQgbW9kZWw6IElUZXh0TW9kZWwgfCBudWxsO1xuXHRcdGlmICh0eXBlb2YgX21vZGVsID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlNaW1lVHlwZShvcHRpb25zLmxhbmd1YWdlKSB8fCBvcHRpb25zLmxhbmd1YWdlIHx8IFBMQUlOVEVYVF9MQU5HVUFHRV9JRDtcblx0XHRcdG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKG1vZGVsU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBvcHRpb25zLnZhbHVlIHx8ICcnLCBsYW5ndWFnZUlkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fb3duc01vZGVsID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kZWwgPSBfbW9kZWw7XG5cdFx0XHR0aGlzLl9vd25zTW9kZWwgPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9hdHRhY2hNb2RlbChtb2RlbCk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRjb25zdCBlOiBJTW9kZWxDaGFuZ2VkRXZlbnQgPSB7XG5cdFx0XHRcdG9sZE1vZGVsVXJsOiBudWxsLFxuXHRcdFx0XHRuZXdNb2RlbFVybDogbW9kZWwudXJpXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbC5maXJlKGUpO1xuXHRcdH1cblx0fVxuXG5cblx0cHVibGljIG92ZXJyaWRlIHVwZGF0ZU9wdGlvbnMobmV3T3B0aW9uczogUmVhZG9ubHk8SUVkaXRvck9wdGlvbnMgJiBJR2xvYmFsRWRpdG9yT3B0aW9ucz4pOiB2b2lkIHtcblx0XHR1cGRhdGVDb25maWd1cmF0aW9uU2VydmljZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgbmV3T3B0aW9ucywgZmFsc2UpO1xuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy50aGVtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuX3N0YW5kYWxvbmVUaGVtZVNlcnZpY2Uuc2V0VGhlbWUobmV3T3B0aW9ucy50aGVtZSk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy5hdXRvRGV0ZWN0SGlnaENvbnRyYXN0ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fc3RhbmRhbG9uZVRoZW1lU2VydmljZS5zZXRBdXRvRGV0ZWN0SGlnaENvbnRyYXN0KEJvb2xlYW4obmV3T3B0aW9ucy5hdXRvRGV0ZWN0SGlnaENvbnRyYXN0KSk7XG5cdFx0fVxuXHRcdHN1cGVyLnVwZGF0ZU9wdGlvbnMobmV3T3B0aW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3Bvc3REZXRhY2hNb2RlbENsZWFudXAoZGV0YWNoZWRNb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXHRcdHN1cGVyLl9wb3N0RGV0YWNoTW9kZWxDbGVhbnVwKGRldGFjaGVkTW9kZWwpO1xuXHRcdGlmIChkZXRhY2hlZE1vZGVsICYmIHRoaXMuX293bnNNb2RlbCkge1xuXHRcdFx0ZGV0YWNoZWRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9vd25zTW9kZWwgPSBmYWxzZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0YW5kYWxvbmVEaWZmRWRpdG9yMiBleHRlbmRzIERpZmZFZGl0b3JXaWRnZXQgaW1wbGVtZW50cyBJU3RhbmRhbG9uZURpZmZFZGl0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YW5kYWxvbmVUaGVtZVNlcnZpY2U6IElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRvbUVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdF9vcHRpb25zOiBSZWFkb25seTxJU3RhbmRhbG9uZURpZmZFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zPiB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUVkaXRvclByb2dyZXNzU2VydmljZSBlZGl0b3JQcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHsgLi4uX29wdGlvbnMgfTtcblx0XHR1cGRhdGVDb25maWd1cmF0aW9uU2VydmljZShjb25maWd1cmF0aW9uU2VydmljZSwgb3B0aW9ucywgdHJ1ZSk7XG5cdFx0Y29uc3QgdGhlbWVEb21SZWdpc3RyYXRpb24gPSAoPFN0YW5kYWxvbmVUaGVtZVNlcnZpY2U+dGhlbWVTZXJ2aWNlKS5yZWdpc3RlckVkaXRvckNvbnRhaW5lcihkb21FbGVtZW50KTtcblx0XHRpZiAodHlwZW9mIG9wdGlvbnMudGhlbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGVtZVNlcnZpY2Uuc2V0VGhlbWUob3B0aW9ucy50aGVtZSk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5hdXRvRGV0ZWN0SGlnaENvbnRyYXN0ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhlbWVTZXJ2aWNlLnNldEF1dG9EZXRlY3RIaWdoQ29udHJhc3QoQm9vbGVhbihvcHRpb25zLmF1dG9EZXRlY3RIaWdoQ29udHJhc3QpKTtcblx0XHR9XG5cblx0XHRzdXBlcihcblx0XHRcdGRvbUVsZW1lbnQsXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0e30sXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0Y29kZUVkaXRvclNlcnZpY2UsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRcdGVkaXRvclByb2dyZXNzU2VydmljZSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UgPSBjb25maWd1cmF0aW9uU2VydmljZTtcblx0XHR0aGlzLl9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlID0gdGhlbWVTZXJ2aWNlO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhlbWVEb21SZWdpc3RyYXRpb24pO1xuXHR9XG5cblxuXHRwdWJsaWMgb3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhuZXdPcHRpb25zOiBSZWFkb25seTxJRGlmZkVkaXRvck9wdGlvbnMgJiBJR2xvYmFsRWRpdG9yT3B0aW9ucz4pOiB2b2lkIHtcblx0XHR1cGRhdGVDb25maWd1cmF0aW9uU2VydmljZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgbmV3T3B0aW9ucywgdHJ1ZSk7XG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLnRoZW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5fc3RhbmRhbG9uZVRoZW1lU2VydmljZS5zZXRUaGVtZShuZXdPcHRpb25zLnRoZW1lKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLmF1dG9EZXRlY3RIaWdoQ29udHJhc3QgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlLnNldEF1dG9EZXRlY3RIaWdoQ29udHJhc3QoQm9vbGVhbihuZXdPcHRpb25zLmF1dG9EZXRlY3RIaWdoQ29udHJhc3QpKTtcblx0XHR9XG5cdFx0c3VwZXIudXBkYXRlT3B0aW9ucyhuZXdPcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfY3JlYXRlSW5uZXJFZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9uczogUmVhZG9ubHk8SUVkaXRvck9wdGlvbnM+KTogQ29kZUVkaXRvcldpZGdldCB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0YW5kYWxvbmVDb2RlRWRpdG9yLCBjb250YWluZXIsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldE9yaWdpbmFsRWRpdG9yKCk6IElTdGFuZGFsb25lQ29kZUVkaXRvciB7XG5cdFx0cmV0dXJuIDxTdGFuZGFsb25lQ29kZUVkaXRvcj5zdXBlci5nZXRPcmlnaW5hbEVkaXRvcigpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldE1vZGlmaWVkRWRpdG9yKCk6IElTdGFuZGFsb25lQ29kZUVkaXRvciB7XG5cdFx0cmV0dXJuIDxTdGFuZGFsb25lQ29kZUVkaXRvcj5zdXBlci5nZXRNb2RpZmllZEVkaXRvcigpO1xuXHR9XG5cblx0cHVibGljIGFkZENvbW1hbmQoa2V5YmluZGluZzogbnVtYmVyLCBoYW5kbGVyOiBJQ29tbWFuZEhhbmRsZXIsIGNvbnRleHQ/OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRNb2RpZmllZEVkaXRvcigpLmFkZENvbW1hbmQoa2V5YmluZGluZywgaGFuZGxlciwgY29udGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlQ29udGV4dEtleTxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlID0gQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUKTogSUNvbnRleHRLZXk8VD4ge1xuXHRcdHJldHVybiB0aGlzLmdldE1vZGlmaWVkRWRpdG9yKCkuY3JlYXRlQ29udGV4dEtleShrZXksIGRlZmF1bHRWYWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgYWRkQWN0aW9uKGRlc2NyaXB0b3I6IElBY3Rpb25EZXNjcmlwdG9yKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLmdldE1vZGlmaWVkRWRpdG9yKCkuYWRkQWN0aW9uKGRlc2NyaXB0b3IpO1xuXHR9XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXh0TW9kZWwobW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsIHZhbHVlOiBzdHJpbmcsIGxhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdXJpOiBVUkkgfCB1bmRlZmluZWQpOiBJVGV4dE1vZGVsIHtcblx0dmFsdWUgPSB2YWx1ZSB8fCAnJztcblx0aWYgKCFsYW5ndWFnZUlkKSB7XG5cdFx0Y29uc3QgZmlyc3RMRiA9IHZhbHVlLmluZGV4T2YoJ1xcbicpO1xuXHRcdGxldCBmaXJzdExpbmUgPSB2YWx1ZTtcblx0XHRpZiAoZmlyc3RMRiAhPT0gLTEpIHtcblx0XHRcdGZpcnN0TGluZSA9IHZhbHVlLnN1YnN0cmluZygwLCBmaXJzdExGKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRvQ3JlYXRlTW9kZWwobW9kZWxTZXJ2aWNlLCB2YWx1ZSwgbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5RmlsZXBhdGhPckZpcnN0TGluZSh1cmkgfHwgbnVsbCwgZmlyc3RMaW5lKSwgdXJpKTtcblx0fVxuXHRyZXR1cm4gZG9DcmVhdGVNb2RlbChtb2RlbFNlcnZpY2UsIHZhbHVlLCBsYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChsYW5ndWFnZUlkKSwgdXJpKTtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZnVuY3Rpb24gZG9DcmVhdGVNb2RlbChtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsIHZhbHVlOiBzdHJpbmcsIGxhbmd1YWdlU2VsZWN0aW9uOiBJTGFuZ3VhZ2VTZWxlY3Rpb24sIHVyaTogVVJJIHwgdW5kZWZpbmVkKTogSVRleHRNb2RlbCB7XG5cdHJldHVybiBtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwodmFsdWUsIGxhbmd1YWdlU2VsZWN0aW9uLCB1cmkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZ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
