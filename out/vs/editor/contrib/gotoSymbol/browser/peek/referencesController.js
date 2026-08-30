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
import { createCancelablePromise } from "../../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ICodeEditorService } from "../../../../browser/services/codeEditorService.js";
import { EditorOption } from "../../../../common/config/editorOptions.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { PeekContext } from "../../../peekView/browser/peekView.js";
import { getOuterEditor } from "../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import * as nls from "../../../../../nls.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { TextEditorSelectionSource } from "../../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IListService, WorkbenchListFocusContextKey, WorkbenchTreeElementCanCollapse, WorkbenchTreeElementCanExpand } from "../../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { OneReference } from "../referencesModel.js";
import { LayoutData, ReferenceWidget } from "./referencesWidget.js";
import { EditorContextKeys } from "../../../../common/editorContextKeys.js";
import { InputFocusedContext } from "../../../../../platform/contextkey/common/contextkeys.js";
const ctxReferenceSearchVisible = new RawContextKey("referenceSearchVisible", false, nls.localize("referenceSearchVisible", "Whether reference peek is visible, like 'Peek References' or 'Peek Definition'"));
let ReferencesController = class {
  constructor(_defaultTreeKeyboardSupport, _editor, contextKeyService, _editorService, _notificationService, _instantiationService, _storageService, _configurationService) {
    this._defaultTreeKeyboardSupport = _defaultTreeKeyboardSupport;
    this._editor = _editor;
    this._editorService = _editorService;
    this._notificationService = _notificationService;
    this._instantiationService = _instantiationService;
    this._storageService = _storageService;
    this._configurationService = _configurationService;
    this._disposables = new DisposableStore();
    this._requestIdPool = 0;
    this._ignoreModelChangeEvent = false;
    this._referenceSearchVisible = ctxReferenceSearchVisible.bindTo(contextKeyService);
  }
  static get(editor) {
    return editor.getContribution(ReferencesController.ID);
  }
  dispose() {
    this._referenceSearchVisible.reset();
    this._disposables.dispose();
    this._widget?.dispose();
    this._model?.dispose();
    this._widget = void 0;
    this._model = void 0;
  }
  toggleWidget(range, modelPromise, peekMode) {
    let widgetPosition;
    if (this._widget) {
      widgetPosition = this._widget.position;
    }
    this.closeWidget();
    if (!!widgetPosition && range.containsPosition(widgetPosition)) {
      return;
    }
    this._peekMode = peekMode;
    this._referenceSearchVisible.set(true);
    this._disposables.add(this._editor.onDidChangeModelLanguage(() => {
      this.closeWidget();
    }));
    this._disposables.add(this._editor.onDidChangeModel(() => {
      if (!this._ignoreModelChangeEvent) {
        this.closeWidget();
      }
    }));
    const storageKey = "peekViewLayout";
    const data = LayoutData.fromJSON(this._storageService.get(storageKey, StorageScope.PROFILE, "{}"));
    this._widget = this._instantiationService.createInstance(ReferenceWidget, this._editor, this._defaultTreeKeyboardSupport, data);
    this._widget.setTitle(nls.localize("labelLoading", "Loading..."));
    this._widget.show(range);
    this._disposables.add(this._widget.onDidClose(() => {
      modelPromise.cancel();
      if (this._widget) {
        this._storageService.store(storageKey, JSON.stringify(this._widget.layoutData), StorageScope.PROFILE, StorageTarget.MACHINE);
        if (!this._widget.isClosing) {
          this.closeWidget();
        }
        this._widget = void 0;
      } else {
        this.closeWidget();
      }
    }));
    this._disposables.add(this._widget.onDidSelectReference((event) => {
      const { element, kind } = event;
      if (!element) {
        return;
      }
      switch (kind) {
        case "open":
          if (event.source !== "editor" || !this._configurationService.getValue("editor.stablePeek")) {
            this.openReference(element, false, false);
          }
          break;
        case "side":
          this.openReference(element, true, false);
          break;
        case "goto":
          if (peekMode) {
            this._gotoReference(element, true);
          } else {
            this.openReference(element, false, true);
          }
          break;
      }
    }));
    const requestId = ++this._requestIdPool;
    modelPromise.then((model) => {
      if (requestId !== this._requestIdPool || !this._widget) {
        model.dispose();
        return void 0;
      }
      this._model?.dispose();
      this._model = model;
      return this._widget.setModel(this._model).then(() => {
        if (this._widget && this._model && this._editor.hasModel()) {
          if (!this._model.isEmpty) {
            this._widget.setMetaTitle(nls.localize("metaTitle.N", "{0} ({1})", this._model.title, this._model.references.length));
          } else {
            this._widget.setMetaTitle("");
          }
          const uri = this._editor.getModel().uri;
          const pos = new Position(range.startLineNumber, range.startColumn);
          const selection = this._model.nearestReference(uri, pos);
          if (selection) {
            return this._widget.setSelection(selection).then(() => {
              if (this._widget && this._editor.getOption(EditorOption.peekWidgetDefaultFocus) === "editor") {
                this._widget.focusOnPreviewEditor();
              }
            });
          }
        }
        return void 0;
      });
    }, (error) => {
      this._notificationService.error(error);
    });
  }
  changeFocusBetweenPreviewAndReferences() {
    if (!this._widget) {
      return;
    }
    if (this._widget.isPreviewEditorFocused()) {
      this._widget.focusOnReferenceTree();
    } else {
      this._widget.focusOnPreviewEditor();
    }
  }
  async goToNextOrPreviousReference(fwd) {
    if (!this._editor.hasModel() || !this._model || !this._widget) {
      return;
    }
    const currentPosition = this._widget.position;
    if (!currentPosition) {
      return;
    }
    const source = this._model.nearestReference(this._editor.getModel().uri, currentPosition);
    if (!source) {
      return;
    }
    const target = this._model.nextOrPreviousReference(source, fwd);
    const editorFocus = this._editor.hasTextFocus();
    const previewEditorFocus = this._widget.isPreviewEditorFocused();
    await this._widget.setSelection(target);
    await this._gotoReference(target, false);
    if (editorFocus) {
      this._editor.focus();
    } else if (this._widget && previewEditorFocus) {
      this._widget.focusOnPreviewEditor();
    }
  }
  async revealReference(reference) {
    if (!this._editor.hasModel() || !this._model || !this._widget) {
      return;
    }
    await this._widget.revealReference(reference);
  }
  closeWidget(focusEditor = true) {
    this._widget?.dispose();
    this._model?.dispose();
    this._referenceSearchVisible.reset();
    this._disposables.clear();
    this._widget = void 0;
    this._model = void 0;
    if (focusEditor) {
      this._editor.focus();
    }
    this._requestIdPool += 1;
  }
  _gotoReference(ref, pinned) {
    this._widget?.hide();
    this._ignoreModelChangeEvent = true;
    const range = Range.lift(ref.range).collapseToStart();
    return this._editorService.openCodeEditor({
      resource: ref.uri,
      options: { selection: range, selectionSource: TextEditorSelectionSource.JUMP, pinned }
    }, this._editor).then((openedEditor) => {
      this._ignoreModelChangeEvent = false;
      if (!openedEditor || !this._widget) {
        this.closeWidget();
        return;
      }
      if (this._editor === openedEditor) {
        this._widget.show(range);
        this._widget.focusOnReferenceTree();
      } else {
        const other = ReferencesController.get(openedEditor);
        const model = this._model.clone();
        this.closeWidget();
        openedEditor.focus();
        other?.toggleWidget(
          range,
          createCancelablePromise((_) => Promise.resolve(model)),
          this._peekMode ?? false
        );
      }
    }, (err) => {
      this._ignoreModelChangeEvent = false;
      onUnexpectedError(err);
    });
  }
  openReference(ref, sideBySide, pinned) {
    if (!sideBySide) {
      this.closeWidget();
    }
    const { uri, range } = ref;
    this._editorService.openCodeEditor({
      resource: uri,
      options: { selection: range, selectionSource: TextEditorSelectionSource.JUMP, pinned }
    }, this._editor, sideBySide);
  }
};
ReferencesController.ID = "editor.contrib.referencesController";
ReferencesController = __decorateClass([
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IConfigurationService)
], ReferencesController);
function withController(accessor, fn) {
  const outerEditor = getOuterEditor(accessor);
  if (!outerEditor) {
    return;
  }
  const controller = ReferencesController.get(outerEditor);
  if (controller) {
    fn(controller);
  }
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "togglePeekWidgetFocus",
  weight: KeybindingWeight.EditorContrib,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.F2),
  when: ContextKeyExpr.or(ctxReferenceSearchVisible, PeekContext.inPeekEditor),
  handler(accessor) {
    withController(accessor, (controller) => {
      controller.changeFocusBetweenPreviewAndReferences();
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "goToNextReference",
  weight: KeybindingWeight.EditorContrib - 10,
  primary: KeyCode.F4,
  secondary: [KeyCode.F12],
  when: ContextKeyExpr.or(ctxReferenceSearchVisible, PeekContext.inPeekEditor),
  handler(accessor) {
    withController(accessor, (controller) => {
      controller.goToNextOrPreviousReference(true);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "goToPreviousReference",
  weight: KeybindingWeight.EditorContrib - 10,
  primary: KeyMod.Shift | KeyCode.F4,
  secondary: [KeyMod.Shift | KeyCode.F12],
  when: ContextKeyExpr.or(ctxReferenceSearchVisible, PeekContext.inPeekEditor),
  handler(accessor) {
    withController(accessor, (controller) => {
      controller.goToNextOrPreviousReference(false);
    });
  }
});
CommandsRegistry.registerCommandAlias("goToNextReferenceFromEmbeddedEditor", "goToNextReference");
CommandsRegistry.registerCommandAlias("goToPreviousReferenceFromEmbeddedEditor", "goToPreviousReference");
CommandsRegistry.registerCommandAlias("closeReferenceSearchEditor", "closeReferenceSearch");
CommandsRegistry.registerCommand(
  "closeReferenceSearch",
  (accessor) => withController(accessor, (controller) => controller.closeWidget())
);
KeybindingsRegistry.registerKeybindingRule({
  id: "closeReferenceSearch",
  weight: KeybindingWeight.EditorContrib - 101,
  primary: KeyCode.Escape,
  secondary: [KeyMod.Shift | KeyCode.Escape],
  when: ContextKeyExpr.and(PeekContext.inPeekEditor, ContextKeyExpr.not("config.editor.stablePeek"))
});
KeybindingsRegistry.registerKeybindingRule({
  id: "closeReferenceSearch",
  weight: KeybindingWeight.WorkbenchContrib + 50,
  primary: KeyCode.Escape,
  secondary: [KeyMod.Shift | KeyCode.Escape],
  when: ContextKeyExpr.and(
    ctxReferenceSearchVisible,
    ContextKeyExpr.not("config.editor.stablePeek"),
    ContextKeyExpr.or(
      EditorContextKeys.editorTextFocus,
      InputFocusedContext.negate()
    )
  )
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "revealReference",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.Enter,
  mac: {
    primary: KeyCode.Enter,
    secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
  },
  when: ContextKeyExpr.and(ctxReferenceSearchVisible, WorkbenchListFocusContextKey, WorkbenchTreeElementCanCollapse.negate(), WorkbenchTreeElementCanExpand.negate()),
  handler(accessor) {
    const listService = accessor.get(IListService);
    const focus = listService.lastFocusedList?.getFocus();
    if (Array.isArray(focus) && focus[0] instanceof OneReference) {
      withController(accessor, (controller) => controller.revealReference(focus[0]));
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "openReferenceToSide",
  weight: KeybindingWeight.EditorContrib,
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  mac: {
    primary: KeyMod.WinCtrl | KeyCode.Enter
  },
  when: ContextKeyExpr.and(ctxReferenceSearchVisible, WorkbenchListFocusContextKey, WorkbenchTreeElementCanCollapse.negate(), WorkbenchTreeElementCanExpand.negate()),
  handler(accessor) {
    const listService = accessor.get(IListService);
    const focus = listService.lastFocusedList?.getFocus();
    if (Array.isArray(focus) && focus[0] instanceof OneReference) {
      withController(accessor, (controller) => controller.openReference(focus[0], true, true));
    }
  }
});
CommandsRegistry.registerCommand("openReference", (accessor) => {
  const listService = accessor.get(IListService);
  const focus = listService.lastFocusedList?.getFocus();
  if (Array.isArray(focus) && focus[0] instanceof OneReference) {
    withController(accessor, (controller) => controller.openReference(focus[0], false, true));
  }
});
export {
  ReferencesController,
  ctxReferenceSearchVisible
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGdvdG9TeW1ib2xcXGJyb3dzZXJcXHBlZWtcXHJlZmVyZW5jZXNDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFBlZWtDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vcGVla1ZpZXcvYnJvd3Nlci9wZWVrVmlldy5qcyc7XG5pbXBvcnQgeyBnZXRPdXRlckVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksIFdvcmtiZW5jaFRyZWVFbGVtZW50Q2FuQ29sbGFwc2UsIFdvcmtiZW5jaFRyZWVFbGVtZW50Q2FuRXhwYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE9uZVJlZmVyZW5jZSwgUmVmZXJlbmNlc01vZGVsIH0gZnJvbSAnLi4vcmVmZXJlbmNlc01vZGVsLmpzJztcbmltcG9ydCB7IExheW91dERhdGEsIFJlZmVyZW5jZVdpZGdldCB9IGZyb20gJy4vcmVmZXJlbmNlc1dpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJbnB1dEZvY3VzZWRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuXG5leHBvcnQgY29uc3QgY3R4UmVmZXJlbmNlU2VhcmNoVmlzaWJsZSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdyZWZlcmVuY2VTZWFyY2hWaXNpYmxlJywgZmFsc2UsIG5scy5sb2NhbGl6ZSgncmVmZXJlbmNlU2VhcmNoVmlzaWJsZScsIFwiV2hldGhlciByZWZlcmVuY2UgcGVlayBpcyB2aXNpYmxlLCBsaWtlICdQZWVrIFJlZmVyZW5jZXMnIG9yICdQZWVrIERlZmluaXRpb24nXCIpKTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFJlZmVyZW5jZXNDb250cm9sbGVyIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLnJlZmVyZW5jZXNDb250cm9sbGVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIF93aWRnZXQ/OiBSZWZlcmVuY2VXaWRnZXQ7XG5cdHByaXZhdGUgX21vZGVsPzogUmVmZXJlbmNlc01vZGVsO1xuXHRwcml2YXRlIF9wZWVrTW9kZT86IGJvb2xlYW47XG5cdHByaXZhdGUgX3JlcXVlc3RJZFBvb2wgPSAwO1xuXHRwcml2YXRlIF9pZ25vcmVNb2RlbENoYW5nZUV2ZW50ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVmZXJlbmNlU2VhcmNoVmlzaWJsZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0c3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogUmVmZXJlbmNlc0NvbnRyb2xsZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxSZWZlcmVuY2VzQ29udHJvbGxlcj4oUmVmZXJlbmNlc0NvbnRyb2xsZXIuSUQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdFRyZWVLZXlib2FyZFN1cHBvcnQ6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHRoaXMuX3JlZmVyZW5jZVNlYXJjaFZpc2libGUgPSBjdHhSZWZlcmVuY2VTZWFyY2hWaXNpYmxlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZmVyZW5jZVNlYXJjaFZpc2libGUucmVzZXQoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fd2lkZ2V0Py5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbW9kZWw/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl93aWRnZXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbW9kZWwgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHR0b2dnbGVXaWRnZXQocmFuZ2U6IFJhbmdlLCBtb2RlbFByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPFJlZmVyZW5jZXNNb2RlbD4sIHBlZWtNb2RlOiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBjbG9zZSBjdXJyZW50IHdpZGdldCBhbmQgcmV0dXJuIGVhcmx5IGlzIHBvc2l0aW9uIGRpZG4ndCBjaGFuZ2Vcblx0XHRsZXQgd2lkZ2V0UG9zaXRpb246IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl93aWRnZXQpIHtcblx0XHRcdHdpZGdldFBvc2l0aW9uID0gdGhpcy5fd2lkZ2V0LnBvc2l0aW9uO1xuXHRcdH1cblx0XHR0aGlzLmNsb3NlV2lkZ2V0KCk7XG5cdFx0aWYgKCEhd2lkZ2V0UG9zaXRpb24gJiYgcmFuZ2UuY29udGFpbnNQb3NpdGlvbih3aWRnZXRQb3NpdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9wZWVrTW9kZSA9IHBlZWtNb2RlO1xuXHRcdHRoaXMuX3JlZmVyZW5jZVNlYXJjaFZpc2libGUuc2V0KHRydWUpO1xuXG5cdFx0Ly8gY2xvc2UgdGhlIHdpZGdldCBvbiBtb2RlbC9tb2RlIGNoYW5nZXNcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoKSA9PiB7IHRoaXMuY2xvc2VXaWRnZXQoKTsgfSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lnbm9yZU1vZGVsQ2hhbmdlRXZlbnQpIHtcblx0XHRcdFx0dGhpcy5jbG9zZVdpZGdldCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBzdG9yYWdlS2V5ID0gJ3BlZWtWaWV3TGF5b3V0Jztcblx0XHRjb25zdCBkYXRhID0gTGF5b3V0RGF0YS5mcm9tSlNPTih0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICd7fScpKTtcblx0XHR0aGlzLl93aWRnZXQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZWZlcmVuY2VXaWRnZXQsIHRoaXMuX2VkaXRvciwgdGhpcy5fZGVmYXVsdFRyZWVLZXlib2FyZFN1cHBvcnQsIGRhdGEpO1xuXHRcdHRoaXMuX3dpZGdldC5zZXRUaXRsZShubHMubG9jYWxpemUoJ2xhYmVsTG9hZGluZycsIFwiTG9hZGluZy4uLlwiKSk7XG5cdFx0dGhpcy5fd2lkZ2V0LnNob3cocmFuZ2UpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3dpZGdldC5vbkRpZENsb3NlKCgpID0+IHtcblx0XHRcdG1vZGVsUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdGlmICh0aGlzLl93aWRnZXQpIHtcblx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkodGhpcy5fd2lkZ2V0LmxheW91dERhdGEpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0aWYgKCF0aGlzLl93aWRnZXQuaXNDbG9zaW5nKSB7XG5cdFx0XHRcdFx0Ly8gdG8gcHJldmVudCBjYWxsaW5nIHRoaXMgdG9vIG1hbnkgdGltZXMsIGNoZWNrIHdoZXRoZXIgaXQgd2FzIGFscmVhZHkgY2xvc2luZy5cblx0XHRcdFx0XHR0aGlzLmNsb3NlV2lkZ2V0KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fd2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jbG9zZVdpZGdldCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl93aWRnZXQub25EaWRTZWxlY3RSZWZlcmVuY2UoZXZlbnQgPT4ge1xuXHRcdFx0Y29uc3QgeyBlbGVtZW50LCBraW5kIH0gPSBldmVudDtcblx0XHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdFx0Y2FzZSAnb3Blbic6XG5cdFx0XHRcdFx0aWYgKGV2ZW50LnNvdXJjZSAhPT0gJ2VkaXRvcicgfHwgIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3Iuc3RhYmxlUGVlaycpKSB7XG5cdFx0XHRcdFx0XHQvLyB3aGVuIHN0YWJsZSBwZWVrIGlzIGNvbmZpZ3VyZWQgd2UgZG9uJ3QgY2xvc2Vcblx0XHRcdFx0XHRcdC8vIHRoZSBwZWVrIHdpbmRvdyBvbiBzZWxlY3RpbmcgdGhlIGVkaXRvclxuXHRcdFx0XHRcdFx0dGhpcy5vcGVuUmVmZXJlbmNlKGVsZW1lbnQsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdzaWRlJzpcblx0XHRcdFx0XHR0aGlzLm9wZW5SZWZlcmVuY2UoZWxlbWVudCwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdnb3RvJzpcblx0XHRcdFx0XHRpZiAocGVla01vZGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2dvdG9SZWZlcmVuY2UoZWxlbWVudCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMub3BlblJlZmVyZW5jZShlbGVtZW50LCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RJZCA9ICsrdGhpcy5fcmVxdWVzdElkUG9vbDtcblxuXHRcdG1vZGVsUHJvbWlzZS50aGVuKG1vZGVsID0+IHtcblxuXHRcdFx0Ly8gc3RpbGwgY3VycmVudCByZXF1ZXN0PyB3aWRnZXQgc3RpbGwgb3Blbj9cblx0XHRcdGlmIChyZXF1ZXN0SWQgIT09IHRoaXMuX3JlcXVlc3RJZFBvb2wgfHwgIXRoaXMuX3dpZGdldCkge1xuXHRcdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX21vZGVsPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tb2RlbCA9IG1vZGVsO1xuXG5cdFx0XHQvLyBzaG93IHdpZGdldFxuXHRcdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5zZXRNb2RlbCh0aGlzLl9tb2RlbCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl93aWRnZXQgJiYgdGhpcy5fbW9kZWwgJiYgdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHsgLy8gbWlnaHQgaGF2ZSBiZWVuIGNsb3NlZFxuXG5cdFx0XHRcdFx0Ly8gc2V0IHRpdGxlXG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9tb2RlbC5pc0VtcHR5KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl93aWRnZXQuc2V0TWV0YVRpdGxlKG5scy5sb2NhbGl6ZSgnbWV0YVRpdGxlLk4nLCBcInswfSAoezF9KVwiLCB0aGlzLl9tb2RlbC50aXRsZSwgdGhpcy5fbW9kZWwucmVmZXJlbmNlcy5sZW5ndGgpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNldE1ldGFUaXRsZSgnJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gc2V0ICdiZXN0JyBzZWxlY3Rpb25cblx0XHRcdFx0XHRjb25zdCB1cmkgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKS51cmk7XG5cdFx0XHRcdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX21vZGVsLm5lYXJlc3RSZWZlcmVuY2UodXJpLCBwb3MpO1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl93aWRnZXQuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbikudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLl93aWRnZXQgJiYgdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucGVla1dpZGdldERlZmF1bHRGb2N1cykgPT09ICdlZGl0b3InKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fd2lkZ2V0LmZvY3VzT25QcmV2aWV3RWRpdG9yKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cblx0XHR9LCBlcnJvciA9PiB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9KTtcblx0fVxuXG5cdGNoYW5nZUZvY3VzQmV0d2VlblByZXZpZXdBbmRSZWZlcmVuY2VzKCkge1xuXHRcdGlmICghdGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHQvLyBjYW4gYmUgY2FsbGVkIHdoaWxlIHN0aWxsIHJlc29sdmluZy4uLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fd2lkZ2V0LmlzUHJldmlld0VkaXRvckZvY3VzZWQoKSkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LmZvY3VzT25SZWZlcmVuY2VUcmVlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3dpZGdldC5mb2N1c09uUHJldmlld0VkaXRvcigpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdvVG9OZXh0T3JQcmV2aW91c1JlZmVyZW5jZShmd2Q6IGJvb2xlYW4pIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpIHx8ICF0aGlzLl9tb2RlbCB8fCAhdGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHQvLyBjYW4gYmUgY2FsbGVkIHdoaWxlIHN0aWxsIHJlc29sdmluZy4uLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50UG9zaXRpb24gPSB0aGlzLl93aWRnZXQucG9zaXRpb247XG5cdFx0aWYgKCFjdXJyZW50UG9zaXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc291cmNlID0gdGhpcy5fbW9kZWwubmVhcmVzdFJlZmVyZW5jZSh0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKS51cmksIGN1cnJlbnRQb3NpdGlvbik7XG5cdFx0aWYgKCFzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fbW9kZWwubmV4dE9yUHJldmlvdXNSZWZlcmVuY2Uoc291cmNlLCBmd2QpO1xuXHRcdGNvbnN0IGVkaXRvckZvY3VzID0gdGhpcy5fZWRpdG9yLmhhc1RleHRGb2N1cygpO1xuXHRcdGNvbnN0IHByZXZpZXdFZGl0b3JGb2N1cyA9IHRoaXMuX3dpZGdldC5pc1ByZXZpZXdFZGl0b3JGb2N1c2VkKCk7XG5cdFx0YXdhaXQgdGhpcy5fd2lkZ2V0LnNldFNlbGVjdGlvbih0YXJnZXQpO1xuXHRcdGF3YWl0IHRoaXMuX2dvdG9SZWZlcmVuY2UodGFyZ2V0LCBmYWxzZSk7XG5cdFx0aWYgKGVkaXRvckZvY3VzKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX3dpZGdldCAmJiBwcmV2aWV3RWRpdG9yRm9jdXMpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5mb2N1c09uUHJldmlld0VkaXRvcigpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJldmVhbFJlZmVyZW5jZShyZWZlcmVuY2U6IE9uZVJlZmVyZW5jZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgIXRoaXMuX21vZGVsIHx8ICF0aGlzLl93aWRnZXQpIHtcblx0XHRcdC8vIGNhbiBiZSBjYWxsZWQgd2hpbGUgc3RpbGwgcmVzb2x2aW5nLi4uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fd2lkZ2V0LnJldmVhbFJlZmVyZW5jZShyZWZlcmVuY2UpO1xuXHR9XG5cblx0Y2xvc2VXaWRnZXQoZm9jdXNFZGl0b3IgPSB0cnVlKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0Py5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbW9kZWw/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yZWZlcmVuY2VTZWFyY2hWaXNpYmxlLnJlc2V0KCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl93aWRnZXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGZvY3VzRWRpdG9yKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVxdWVzdElkUG9vbCArPSAxOyAvLyBDYW5jZWwgcGVuZGluZyByZXF1ZXN0c1xuXHR9XG5cblx0cHJpdmF0ZSBfZ290b1JlZmVyZW5jZShyZWY6IExvY2F0aW9uLCBwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHR0aGlzLl93aWRnZXQ/LmhpZGUoKTtcblxuXHRcdHRoaXMuX2lnbm9yZU1vZGVsQ2hhbmdlRXZlbnQgPSB0cnVlO1xuXHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UubGlmdChyZWYucmFuZ2UpLmNvbGxhcHNlVG9TdGFydCgpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkNvZGVFZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHJlZi51cmksXG5cdFx0XHRvcHRpb25zOiB7IHNlbGVjdGlvbjogcmFuZ2UsIHNlbGVjdGlvblNvdXJjZTogVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZS5KVU1QLCBwaW5uZWQgfVxuXHRcdH0sIHRoaXMuX2VkaXRvcikudGhlbihvcGVuZWRFZGl0b3IgPT4ge1xuXHRcdFx0dGhpcy5faWdub3JlTW9kZWxDaGFuZ2VFdmVudCA9IGZhbHNlO1xuXG5cdFx0XHRpZiAoIW9wZW5lZEVkaXRvciB8fCAhdGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHRcdC8vIHNvbWV0aGluZyB3ZW50IHdyb25nLi4uXG5cdFx0XHRcdHRoaXMuY2xvc2VXaWRnZXQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fZWRpdG9yID09PSBvcGVuZWRFZGl0b3IpIHtcblx0XHRcdFx0Ly9cblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNob3cocmFuZ2UpO1xuXHRcdFx0XHR0aGlzLl93aWRnZXQuZm9jdXNPblJlZmVyZW5jZVRyZWUoKTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gd2Ugb3BlbmVkIGEgZGlmZmVyZW50IGVkaXRvciBpbnN0YW5jZSB3aGljaCBtZWFucyBhIGRpZmZlcmVudCBjb250cm9sbGVyIGluc3RhbmNlLlxuXHRcdFx0XHQvLyB0aGVyZWZvcmUgd2Ugc3RvcCB3aXRoIHRoaXMgY29udHJvbGxlciBhbmQgY29udGludWUgd2l0aCB0aGUgb3RoZXJcblx0XHRcdFx0Y29uc3Qgb3RoZXIgPSBSZWZlcmVuY2VzQ29udHJvbGxlci5nZXQob3BlbmVkRWRpdG9yKTtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbCEuY2xvbmUoKTtcblxuXHRcdFx0XHR0aGlzLmNsb3NlV2lkZ2V0KCk7XG5cdFx0XHRcdG9wZW5lZEVkaXRvci5mb2N1cygpO1xuXG5cdFx0XHRcdG90aGVyPy50b2dnbGVXaWRnZXQoXG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0Y3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoXyA9PiBQcm9taXNlLnJlc29sdmUobW9kZWwpKSxcblx0XHRcdFx0XHR0aGlzLl9wZWVrTW9kZSA/PyBmYWxzZVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0fSwgKGVycikgPT4ge1xuXHRcdFx0dGhpcy5faWdub3JlTW9kZWxDaGFuZ2VFdmVudCA9IGZhbHNlO1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHR9KTtcblx0fVxuXG5cdG9wZW5SZWZlcmVuY2UocmVmOiBMb2NhdGlvbiwgc2lkZUJ5U2lkZTogYm9vbGVhbiwgcGlubmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gY2xlYXIgc3RhZ2Vcblx0XHRpZiAoIXNpZGVCeVNpZGUpIHtcblx0XHRcdHRoaXMuY2xvc2VXaWRnZXQoKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHVyaSwgcmFuZ2UgfSA9IHJlZjtcblx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5Db2RlRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiB1cmksXG5cdFx0XHRvcHRpb25zOiB7IHNlbGVjdGlvbjogcmFuZ2UsIHNlbGVjdGlvblNvdXJjZTogVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZS5KVU1QLCBwaW5uZWQgfVxuXHRcdH0sIHRoaXMuX2VkaXRvciwgc2lkZUJ5U2lkZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gd2l0aENvbnRyb2xsZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGZuOiAoY29udHJvbGxlcjogUmVmZXJlbmNlc0NvbnRyb2xsZXIpID0+IHZvaWQpOiB2b2lkIHtcblx0Y29uc3Qgb3V0ZXJFZGl0b3IgPSBnZXRPdXRlckVkaXRvcihhY2Nlc3Nvcik7XG5cdGlmICghb3V0ZXJFZGl0b3IpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgY29udHJvbGxlciA9IFJlZmVyZW5jZXNDb250cm9sbGVyLmdldChvdXRlckVkaXRvcik7XG5cdGlmIChjb250cm9sbGVyKSB7XG5cdFx0Zm4oY29udHJvbGxlcik7XG5cdH1cbn1cblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAndG9nZ2xlUGVla1dpZGdldEZvY3VzJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLkYyKSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoY3R4UmVmZXJlbmNlU2VhcmNoVmlzaWJsZSwgUGVla0NvbnRleHQuaW5QZWVrRWRpdG9yKSxcblx0aGFuZGxlcihhY2Nlc3Nvcikge1xuXHRcdHdpdGhDb250cm9sbGVyKGFjY2Vzc29yLCBjb250cm9sbGVyID0+IHtcblx0XHRcdGNvbnRyb2xsZXIuY2hhbmdlRm9jdXNCZXR3ZWVuUHJldmlld0FuZFJlZmVyZW5jZXMoKTtcblx0XHR9KTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2dvVG9OZXh0UmVmZXJlbmNlJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgLSAxMCxcblx0cHJpbWFyeTogS2V5Q29kZS5GNCxcblx0c2Vjb25kYXJ5OiBbS2V5Q29kZS5GMTJdLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihjdHhSZWZlcmVuY2VTZWFyY2hWaXNpYmxlLCBQZWVrQ29udGV4dC5pblBlZWtFZGl0b3IpLFxuXHRoYW5kbGVyKGFjY2Vzc29yKSB7XG5cdFx0d2l0aENvbnRyb2xsZXIoYWNjZXNzb3IsIGNvbnRyb2xsZXIgPT4ge1xuXHRcdFx0Y29udHJvbGxlci5nb1RvTmV4dE9yUHJldmlvdXNSZWZlcmVuY2UodHJ1ZSk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdnb1RvUHJldmlvdXNSZWZlcmVuY2UnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiAtIDEwLFxuXHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkY0LFxuXHRzZWNvbmRhcnk6IFtLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkYxMl0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLm9yKGN0eFJlZmVyZW5jZVNlYXJjaFZpc2libGUsIFBlZWtDb250ZXh0LmluUGVla0VkaXRvciksXG5cdGhhbmRsZXIoYWNjZXNzb3IpIHtcblx0XHR3aXRoQ29udHJvbGxlcihhY2Nlc3NvciwgY29udHJvbGxlciA9PiB7XG5cdFx0XHRjb250cm9sbGVyLmdvVG9OZXh0T3JQcmV2aW91c1JlZmVyZW5jZShmYWxzZSk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG4vLyBjb21tYW5kcyB0aGF0IGFyZW4ndCBuZWVkZWQgYW55bW9yZSBiZWNhdXNlIHRoZXJlIGlzIG5vdyBDb250ZXh0S2V5RXhwci5PUlxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbGlhcygnZ29Ub05leHRSZWZlcmVuY2VGcm9tRW1iZWRkZWRFZGl0b3InLCAnZ29Ub05leHRSZWZlcmVuY2UnKTtcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQWxpYXMoJ2dvVG9QcmV2aW91c1JlZmVyZW5jZUZyb21FbWJlZGRlZEVkaXRvcicsICdnb1RvUHJldmlvdXNSZWZlcmVuY2UnKTtcblxuLy8gY2xvc2VcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQWxpYXMoJ2Nsb3NlUmVmZXJlbmNlU2VhcmNoRWRpdG9yJywgJ2Nsb3NlUmVmZXJlbmNlU2VhcmNoJyk7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChcblx0J2Nsb3NlUmVmZXJlbmNlU2VhcmNoJyxcblx0YWNjZXNzb3IgPT4gd2l0aENvbnRyb2xsZXIoYWNjZXNzb3IsIGNvbnRyb2xsZXIgPT4gY29udHJvbGxlci5jbG9zZVdpZGdldCgpKVxuKTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnY2xvc2VSZWZlcmVuY2VTZWFyY2gnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiAtIDEwMSxcblx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuRXNjYXBlXSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFBlZWtDb250ZXh0LmluUGVla0VkaXRvciwgQ29udGV4dEtleUV4cHIubm90KCdjb25maWcuZWRpdG9yLnN0YWJsZVBlZWsnKSlcbn0pO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdjbG9zZVJlZmVyZW5jZVNlYXJjaCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNTAsXG5cdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRzZWNvbmRhcnk6IFtLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVzY2FwZV0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRjdHhSZWZlcmVuY2VTZWFyY2hWaXNpYmxlLFxuXHRcdENvbnRleHRLZXlFeHByLm5vdCgnY29uZmlnLmVkaXRvci5zdGFibGVQZWVrJyksXG5cdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRJbnB1dEZvY3VzZWRDb250ZXh0Lm5lZ2F0ZSgpXG5cdFx0KVxuXHQpXG59KTtcblxuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdyZXZlYWxSZWZlcmVuY2UnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93XVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoY3R4UmVmZXJlbmNlU2VhcmNoVmlzaWJsZSwgV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5Db2xsYXBzZS5uZWdhdGUoKSwgV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5FeHBhbmQubmVnYXRlKCkpLFxuXHRoYW5kbGVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBmb2N1cyA9IDx1bmtub3duW10+bGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0Py5nZXRGb2N1cygpO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGZvY3VzKSAmJiBmb2N1c1swXSBpbnN0YW5jZW9mIE9uZVJlZmVyZW5jZSkge1xuXHRcdFx0d2l0aENvbnRyb2xsZXIoYWNjZXNzb3IsIGNvbnRyb2xsZXIgPT4gY29udHJvbGxlci5yZXZlYWxSZWZlcmVuY2UoZm9jdXNbMF0gYXMgT25lUmVmZXJlbmNlKSk7XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnb3BlblJlZmVyZW5jZVRvU2lkZScsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5FbnRlclxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoY3R4UmVmZXJlbmNlU2VhcmNoVmlzaWJsZSwgV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5Db2xsYXBzZS5uZWdhdGUoKSwgV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5FeHBhbmQubmVnYXRlKCkpLFxuXHRoYW5kbGVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBmb2N1cyA9IDx1bmtub3duW10+bGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0Py5nZXRGb2N1cygpO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGZvY3VzKSAmJiBmb2N1c1swXSBpbnN0YW5jZW9mIE9uZVJlZmVyZW5jZSkge1xuXHRcdFx0d2l0aENvbnRyb2xsZXIoYWNjZXNzb3IsIGNvbnRyb2xsZXIgPT4gY29udHJvbGxlci5vcGVuUmVmZXJlbmNlKGZvY3VzWzBdIGFzIE9uZVJlZmVyZW5jZSwgdHJ1ZSwgdHJ1ZSkpO1xuXHRcdH1cblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdvcGVuUmVmZXJlbmNlJywgKGFjY2Vzc29yKSA9PiB7XG5cdGNvbnN0IGxpc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSk7XG5cdGNvbnN0IGZvY3VzID0gPHVua25vd25bXT5saXN0U2VydmljZS5sYXN0Rm9jdXNlZExpc3Q/LmdldEZvY3VzKCk7XG5cdGlmIChBcnJheS5pc0FycmF5KGZvY3VzKSAmJiBmb2N1c1swXSBpbnN0YW5jZW9mIE9uZVJlZmVyZW5jZSkge1xuXHRcdHdpdGhDb250cm9sbGVyKGFjY2Vzc29yLCBjb250cm9sbGVyID0+IGNvbnRyb2xsZXIub3BlblJlZmVyZW5jZShmb2N1c1swXSBhcyBPbmVSZWZlcmVuY2UsIGZhbHNlLCB0cnVlKSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFHdEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQTZCLG9CQUFvQixxQkFBcUI7QUFDL0UsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxxQkFBcUIsd0JBQXdCO0FBQ3RELFNBQVMsY0FBYyw4QkFBOEIsaUNBQWlDLHFDQUFxQztBQUMzSCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLG9CQUFxQztBQUM5QyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBRTdCLE1BQU0sNEJBQTRCLElBQUksY0FBdUIsMEJBQTBCLE9BQU8sSUFBSSxTQUFTLDBCQUEwQixnRkFBZ0YsQ0FBQztBQUV0TixJQUFlLHVCQUFmLE1BQW1FO0FBQUEsRUFrQnpFLFlBQ2tCLDZCQUNBLFNBQ0csbUJBQ2lCLGdCQUNFLHNCQUNDLHVCQUNOLGlCQUNNLHVCQUN2QztBQVJnQjtBQUNBO0FBRW9CO0FBQ0U7QUFDQztBQUNOO0FBQ007QUF0QnpDLFNBQWlCLGVBQWUsSUFBSSxnQkFBZ0I7QUFLcEQsU0FBUSxpQkFBaUI7QUFDekIsU0FBUSwwQkFBMEI7QUFtQmpDLFNBQUssMEJBQTBCLDBCQUEwQixPQUFPLGlCQUFpQjtBQUFBLEVBQ2xGO0FBQUEsRUFoQkEsT0FBTyxJQUFJLFFBQWtEO0FBQzVELFdBQU8sT0FBTyxnQkFBc0MscUJBQXFCLEVBQUU7QUFBQSxFQUM1RTtBQUFBLEVBZ0JBLFVBQWdCO0FBQ2YsU0FBSyx3QkFBd0IsTUFBTTtBQUNuQyxTQUFLLGFBQWEsUUFBUTtBQUMxQixTQUFLLFNBQVMsUUFBUTtBQUN0QixTQUFLLFFBQVEsUUFBUTtBQUNyQixTQUFLLFVBQVU7QUFDZixTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQUEsRUFFQSxhQUFhLE9BQWMsY0FBa0QsVUFBeUI7QUFHckcsUUFBSTtBQUNKLFFBQUksS0FBSyxTQUFTO0FBQ2pCLHVCQUFpQixLQUFLLFFBQVE7QUFBQSxJQUMvQjtBQUNBLFNBQUssWUFBWTtBQUNqQixRQUFJLENBQUMsQ0FBQyxrQkFBa0IsTUFBTSxpQkFBaUIsY0FBYyxHQUFHO0FBQy9EO0FBQUEsSUFDRDtBQUVBLFNBQUssWUFBWTtBQUNqQixTQUFLLHdCQUF3QixJQUFJLElBQUk7QUFHckMsU0FBSyxhQUFhLElBQUksS0FBSyxRQUFRLHlCQUF5QixNQUFNO0FBQUUsV0FBSyxZQUFZO0FBQUEsSUFBRyxDQUFDLENBQUM7QUFDMUYsU0FBSyxhQUFhLElBQUksS0FBSyxRQUFRLGlCQUFpQixNQUFNO0FBQ3pELFVBQUksQ0FBQyxLQUFLLHlCQUF5QjtBQUNsQyxhQUFLLFlBQVk7QUFBQSxNQUNsQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxhQUFhO0FBQ25CLFVBQU0sT0FBTyxXQUFXLFNBQVMsS0FBSyxnQkFBZ0IsSUFBSSxZQUFZLGFBQWEsU0FBUyxJQUFJLENBQUM7QUFDakcsU0FBSyxVQUFVLEtBQUssc0JBQXNCLGVBQWUsaUJBQWlCLEtBQUssU0FBUyxLQUFLLDZCQUE2QixJQUFJO0FBQzlILFNBQUssUUFBUSxTQUFTLElBQUksU0FBUyxnQkFBZ0IsWUFBWSxDQUFDO0FBQ2hFLFNBQUssUUFBUSxLQUFLLEtBQUs7QUFFdkIsU0FBSyxhQUFhLElBQUksS0FBSyxRQUFRLFdBQVcsTUFBTTtBQUNuRCxtQkFBYSxPQUFPO0FBQ3BCLFVBQUksS0FBSyxTQUFTO0FBQ2pCLGFBQUssZ0JBQWdCLE1BQU0sWUFBWSxLQUFLLFVBQVUsS0FBSyxRQUFRLFVBQVUsR0FBRyxhQUFhLFNBQVMsY0FBYyxPQUFPO0FBQzNILFlBQUksQ0FBQyxLQUFLLFFBQVEsV0FBVztBQUU1QixlQUFLLFlBQVk7QUFBQSxRQUNsQjtBQUNBLGFBQUssVUFBVTtBQUFBLE1BQ2hCLE9BQU87QUFDTixhQUFLLFlBQVk7QUFBQSxNQUNsQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxhQUFhLElBQUksS0FBSyxRQUFRLHFCQUFxQixXQUFTO0FBQ2hFLFlBQU0sRUFBRSxTQUFTLEtBQUssSUFBSTtBQUMxQixVQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsTUFDRDtBQUNBLGNBQVEsTUFBTTtBQUFBLFFBQ2IsS0FBSztBQUNKLGNBQUksTUFBTSxXQUFXLFlBQVksQ0FBQyxLQUFLLHNCQUFzQixTQUFTLG1CQUFtQixHQUFHO0FBRzNGLGlCQUFLLGNBQWMsU0FBUyxPQUFPLEtBQUs7QUFBQSxVQUN6QztBQUNBO0FBQUEsUUFDRCxLQUFLO0FBQ0osZUFBSyxjQUFjLFNBQVMsTUFBTSxLQUFLO0FBQ3ZDO0FBQUEsUUFDRCxLQUFLO0FBQ0osY0FBSSxVQUFVO0FBQ2IsaUJBQUssZUFBZSxTQUFTLElBQUk7QUFBQSxVQUNsQyxPQUFPO0FBQ04saUJBQUssY0FBYyxTQUFTLE9BQU8sSUFBSTtBQUFBLFVBQ3hDO0FBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFlBQVksRUFBRSxLQUFLO0FBRXpCLGlCQUFhLEtBQUssV0FBUztBQUcxQixVQUFJLGNBQWMsS0FBSyxrQkFBa0IsQ0FBQyxLQUFLLFNBQVM7QUFDdkQsY0FBTSxRQUFRO0FBQ2QsZUFBTztBQUFBLE1BQ1I7QUFFQSxXQUFLLFFBQVEsUUFBUTtBQUNyQixXQUFLLFNBQVM7QUFHZCxhQUFPLEtBQUssUUFBUSxTQUFTLEtBQUssTUFBTSxFQUFFLEtBQUssTUFBTTtBQUNwRCxZQUFJLEtBQUssV0FBVyxLQUFLLFVBQVUsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUczRCxjQUFJLENBQUMsS0FBSyxPQUFPLFNBQVM7QUFDekIsaUJBQUssUUFBUSxhQUFhLElBQUksU0FBUyxlQUFlLGFBQWEsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLFdBQVcsTUFBTSxDQUFDO0FBQUEsVUFDckgsT0FBTztBQUNOLGlCQUFLLFFBQVEsYUFBYSxFQUFFO0FBQUEsVUFDN0I7QUFHQSxnQkFBTSxNQUFNLEtBQUssUUFBUSxTQUFTLEVBQUU7QUFDcEMsZ0JBQU0sTUFBTSxJQUFJLFNBQVMsTUFBTSxpQkFBaUIsTUFBTSxXQUFXO0FBQ2pFLGdCQUFNLFlBQVksS0FBSyxPQUFPLGlCQUFpQixLQUFLLEdBQUc7QUFDdkQsY0FBSSxXQUFXO0FBQ2QsbUJBQU8sS0FBSyxRQUFRLGFBQWEsU0FBUyxFQUFFLEtBQUssTUFBTTtBQUN0RCxrQkFBSSxLQUFLLFdBQVcsS0FBSyxRQUFRLFVBQVUsYUFBYSxzQkFBc0IsTUFBTSxVQUFVO0FBQzdGLHFCQUFLLFFBQVEscUJBQXFCO0FBQUEsY0FDbkM7QUFBQSxZQUNELENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRDtBQUNBLGVBQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUVGLEdBQUcsV0FBUztBQUNYLFdBQUsscUJBQXFCLE1BQU0sS0FBSztBQUFBLElBQ3RDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSx5Q0FBeUM7QUFDeEMsUUFBSSxDQUFDLEtBQUssU0FBUztBQUVsQjtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssUUFBUSx1QkFBdUIsR0FBRztBQUMxQyxXQUFLLFFBQVEscUJBQXFCO0FBQUEsSUFDbkMsT0FBTztBQUNOLFdBQUssUUFBUSxxQkFBcUI7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sNEJBQTRCLEtBQWM7QUFDL0MsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEtBQUssQ0FBQyxLQUFLLFVBQVUsQ0FBQyxLQUFLLFNBQVM7QUFFOUQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxrQkFBa0IsS0FBSyxRQUFRO0FBQ3JDLFFBQUksQ0FBQyxpQkFBaUI7QUFDckI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxTQUFTLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxRQUFRLFNBQVMsRUFBRSxLQUFLLGVBQWU7QUFDeEYsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVMsS0FBSyxPQUFPLHdCQUF3QixRQUFRLEdBQUc7QUFDOUQsVUFBTSxjQUFjLEtBQUssUUFBUSxhQUFhO0FBQzlDLFVBQU0scUJBQXFCLEtBQUssUUFBUSx1QkFBdUI7QUFDL0QsVUFBTSxLQUFLLFFBQVEsYUFBYSxNQUFNO0FBQ3RDLFVBQU0sS0FBSyxlQUFlLFFBQVEsS0FBSztBQUN2QyxRQUFJLGFBQWE7QUFDaEIsV0FBSyxRQUFRLE1BQU07QUFBQSxJQUNwQixXQUFXLEtBQUssV0FBVyxvQkFBb0I7QUFDOUMsV0FBSyxRQUFRLHFCQUFxQjtBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxnQkFBZ0IsV0FBd0M7QUFDN0QsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEtBQUssQ0FBQyxLQUFLLFVBQVUsQ0FBQyxLQUFLLFNBQVM7QUFFOUQ7QUFBQSxJQUNEO0FBRUEsVUFBTSxLQUFLLFFBQVEsZ0JBQWdCLFNBQVM7QUFBQSxFQUM3QztBQUFBLEVBRUEsWUFBWSxjQUFjLE1BQVk7QUFDckMsU0FBSyxTQUFTLFFBQVE7QUFDdEIsU0FBSyxRQUFRLFFBQVE7QUFDckIsU0FBSyx3QkFBd0IsTUFBTTtBQUNuQyxTQUFLLGFBQWEsTUFBTTtBQUN4QixTQUFLLFVBQVU7QUFDZixTQUFLLFNBQVM7QUFDZCxRQUFJLGFBQWE7QUFDaEIsV0FBSyxRQUFRLE1BQU07QUFBQSxJQUNwQjtBQUNBLFNBQUssa0JBQWtCO0FBQUEsRUFDeEI7QUFBQSxFQUVRLGVBQWUsS0FBZSxRQUFtQztBQUN4RSxTQUFLLFNBQVMsS0FBSztBQUVuQixTQUFLLDBCQUEwQjtBQUMvQixVQUFNLFFBQVEsTUFBTSxLQUFLLElBQUksS0FBSyxFQUFFLGdCQUFnQjtBQUVwRCxXQUFPLEtBQUssZUFBZSxlQUFlO0FBQUEsTUFDekMsVUFBVSxJQUFJO0FBQUEsTUFDZCxTQUFTLEVBQUUsV0FBVyxPQUFPLGlCQUFpQiwwQkFBMEIsTUFBTSxPQUFPO0FBQUEsSUFDdEYsR0FBRyxLQUFLLE9BQU8sRUFBRSxLQUFLLGtCQUFnQjtBQUNyQyxXQUFLLDBCQUEwQjtBQUUvQixVQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxTQUFTO0FBRW5DLGFBQUssWUFBWTtBQUNqQjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLEtBQUssWUFBWSxjQUFjO0FBRWxDLGFBQUssUUFBUSxLQUFLLEtBQUs7QUFDdkIsYUFBSyxRQUFRLHFCQUFxQjtBQUFBLE1BRW5DLE9BQU87QUFHTixjQUFNLFFBQVEscUJBQXFCLElBQUksWUFBWTtBQUNuRCxjQUFNLFFBQVEsS0FBSyxPQUFRLE1BQU07QUFFakMsYUFBSyxZQUFZO0FBQ2pCLHFCQUFhLE1BQU07QUFFbkIsZUFBTztBQUFBLFVBQ047QUFBQSxVQUNBLHdCQUF3QixPQUFLLFFBQVEsUUFBUSxLQUFLLENBQUM7QUFBQSxVQUNuRCxLQUFLLGFBQWE7QUFBQSxRQUNuQjtBQUFBLE1BQ0Q7QUFBQSxJQUVELEdBQUcsQ0FBQyxRQUFRO0FBQ1gsV0FBSywwQkFBMEI7QUFDL0Isd0JBQWtCLEdBQUc7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsY0FBYyxLQUFlLFlBQXFCLFFBQXVCO0FBRXhFLFFBQUksQ0FBQyxZQUFZO0FBQ2hCLFdBQUssWUFBWTtBQUFBLElBQ2xCO0FBRUEsVUFBTSxFQUFFLEtBQUssTUFBTSxJQUFJO0FBQ3ZCLFNBQUssZUFBZSxlQUFlO0FBQUEsTUFDbEMsVUFBVTtBQUFBLE1BQ1YsU0FBUyxFQUFFLFdBQVcsT0FBTyxpQkFBaUIsMEJBQTBCLE1BQU0sT0FBTztBQUFBLElBQ3RGLEdBQUcsS0FBSyxTQUFTLFVBQVU7QUFBQSxFQUM1QjtBQUNEO0FBN1FzQixxQkFFTCxLQUFLO0FBRkEsdUJBQWY7QUFBQSxFQXFCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0ExQm1CO0FBK1F0QixTQUFTLGVBQWUsVUFBNEIsSUFBc0Q7QUFDekcsUUFBTSxjQUFjLGVBQWUsUUFBUTtBQUMzQyxNQUFJLENBQUMsYUFBYTtBQUNqQjtBQUFBLEVBQ0Q7QUFDQSxRQUFNLGFBQWEscUJBQXFCLElBQUksV0FBVztBQUN2RCxNQUFJLFlBQVk7QUFDZixPQUFHLFVBQVU7QUFBQSxFQUNkO0FBQ0Q7QUFFQSxvQkFBb0IsaUNBQWlDO0FBQUEsRUFDcEQsSUFBSTtBQUFBLEVBQ0osUUFBUSxpQkFBaUI7QUFBQSxFQUN6QixTQUFTLFNBQVMsT0FBTyxVQUFVLFFBQVEsTUFBTSxRQUFRLEVBQUU7QUFBQSxFQUMzRCxNQUFNLGVBQWUsR0FBRywyQkFBMkIsWUFBWSxZQUFZO0FBQUEsRUFDM0UsUUFBUSxVQUFVO0FBQ2pCLG1CQUFlLFVBQVUsZ0JBQWM7QUFDdEMsaUJBQVcsdUNBQXVDO0FBQUEsSUFDbkQsQ0FBQztBQUFBLEVBQ0Y7QUFDRCxDQUFDO0FBRUQsb0JBQW9CLGlDQUFpQztBQUFBLEVBQ3BELElBQUk7QUFBQSxFQUNKLFFBQVEsaUJBQWlCLGdCQUFnQjtBQUFBLEVBQ3pDLFNBQVMsUUFBUTtBQUFBLEVBQ2pCLFdBQVcsQ0FBQyxRQUFRLEdBQUc7QUFBQSxFQUN2QixNQUFNLGVBQWUsR0FBRywyQkFBMkIsWUFBWSxZQUFZO0FBQUEsRUFDM0UsUUFBUSxVQUFVO0FBQ2pCLG1CQUFlLFVBQVUsZ0JBQWM7QUFDdEMsaUJBQVcsNEJBQTRCLElBQUk7QUFBQSxJQUM1QyxDQUFDO0FBQUEsRUFDRjtBQUNELENBQUM7QUFFRCxvQkFBb0IsaUNBQWlDO0FBQUEsRUFDcEQsSUFBSTtBQUFBLEVBQ0osUUFBUSxpQkFBaUIsZ0JBQWdCO0FBQUEsRUFDekMsU0FBUyxPQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ2hDLFdBQVcsQ0FBQyxPQUFPLFFBQVEsUUFBUSxHQUFHO0FBQUEsRUFDdEMsTUFBTSxlQUFlLEdBQUcsMkJBQTJCLFlBQVksWUFBWTtBQUFBLEVBQzNFLFFBQVEsVUFBVTtBQUNqQixtQkFBZSxVQUFVLGdCQUFjO0FBQ3RDLGlCQUFXLDRCQUE0QixLQUFLO0FBQUEsSUFDN0MsQ0FBQztBQUFBLEVBQ0Y7QUFDRCxDQUFDO0FBR0QsaUJBQWlCLHFCQUFxQix1Q0FBdUMsbUJBQW1CO0FBQ2hHLGlCQUFpQixxQkFBcUIsMkNBQTJDLHVCQUF1QjtBQUd4RyxpQkFBaUIscUJBQXFCLDhCQUE4QixzQkFBc0I7QUFDMUYsaUJBQWlCO0FBQUEsRUFDaEI7QUFBQSxFQUNBLGNBQVksZUFBZSxVQUFVLGdCQUFjLFdBQVcsWUFBWSxDQUFDO0FBQzVFO0FBQ0Esb0JBQW9CLHVCQUF1QjtBQUFBLEVBQzFDLElBQUk7QUFBQSxFQUNKLFFBQVEsaUJBQWlCLGdCQUFnQjtBQUFBLEVBQ3pDLFNBQVMsUUFBUTtBQUFBLEVBQ2pCLFdBQVcsQ0FBQyxPQUFPLFFBQVEsUUFBUSxNQUFNO0FBQUEsRUFDekMsTUFBTSxlQUFlLElBQUksWUFBWSxjQUFjLGVBQWUsSUFBSSwwQkFBMEIsQ0FBQztBQUNsRyxDQUFDO0FBQ0Qsb0JBQW9CLHVCQUF1QjtBQUFBLEVBQzFDLElBQUk7QUFBQSxFQUNKLFFBQVEsaUJBQWlCLG1CQUFtQjtBQUFBLEVBQzVDLFNBQVMsUUFBUTtBQUFBLEVBQ2pCLFdBQVcsQ0FBQyxPQUFPLFFBQVEsUUFBUSxNQUFNO0FBQUEsRUFDekMsTUFBTSxlQUFlO0FBQUEsSUFDcEI7QUFBQSxJQUNBLGVBQWUsSUFBSSwwQkFBMEI7QUFBQSxJQUM3QyxlQUFlO0FBQUEsTUFDZCxrQkFBa0I7QUFBQSxNQUNsQixvQkFBb0IsT0FBTztBQUFBLElBQzVCO0FBQUEsRUFDRDtBQUNELENBQUM7QUFHRCxvQkFBb0IsaUNBQWlDO0FBQUEsRUFDcEQsSUFBSTtBQUFBLEVBQ0osUUFBUSxpQkFBaUI7QUFBQSxFQUN6QixTQUFTLFFBQVE7QUFBQSxFQUNqQixLQUFLO0FBQUEsSUFDSixTQUFTLFFBQVE7QUFBQSxJQUNqQixXQUFXLENBQUMsT0FBTyxVQUFVLFFBQVEsU0FBUztBQUFBLEVBQy9DO0FBQUEsRUFDQSxNQUFNLGVBQWUsSUFBSSwyQkFBMkIsOEJBQThCLGdDQUFnQyxPQUFPLEdBQUcsOEJBQThCLE9BQU8sQ0FBQztBQUFBLEVBQ2xLLFFBQVEsVUFBNEI7QUFDbkMsVUFBTSxjQUFjLFNBQVMsSUFBSSxZQUFZO0FBQzdDLFVBQU0sUUFBbUIsWUFBWSxpQkFBaUIsU0FBUztBQUMvRCxRQUFJLE1BQU0sUUFBUSxLQUFLLEtBQUssTUFBTSxDQUFDLGFBQWEsY0FBYztBQUM3RCxxQkFBZSxVQUFVLGdCQUFjLFdBQVcsZ0JBQWdCLE1BQU0sQ0FBQyxDQUFpQixDQUFDO0FBQUEsSUFDNUY7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUVELG9CQUFvQixpQ0FBaUM7QUFBQSxFQUNwRCxJQUFJO0FBQUEsRUFDSixRQUFRLGlCQUFpQjtBQUFBLEVBQ3pCLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxFQUNsQyxLQUFLO0FBQUEsSUFDSixTQUFTLE9BQU8sVUFBVSxRQUFRO0FBQUEsRUFDbkM7QUFBQSxFQUNBLE1BQU0sZUFBZSxJQUFJLDJCQUEyQiw4QkFBOEIsZ0NBQWdDLE9BQU8sR0FBRyw4QkFBOEIsT0FBTyxDQUFDO0FBQUEsRUFDbEssUUFBUSxVQUE0QjtBQUNuQyxVQUFNLGNBQWMsU0FBUyxJQUFJLFlBQVk7QUFDN0MsVUFBTSxRQUFtQixZQUFZLGlCQUFpQixTQUFTO0FBQy9ELFFBQUksTUFBTSxRQUFRLEtBQUssS0FBSyxNQUFNLENBQUMsYUFBYSxjQUFjO0FBQzdELHFCQUFlLFVBQVUsZ0JBQWMsV0FBVyxjQUFjLE1BQU0sQ0FBQyxHQUFtQixNQUFNLElBQUksQ0FBQztBQUFBLElBQ3RHO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxpQkFBaUIsZ0JBQWdCLGlCQUFpQixDQUFDLGFBQWE7QUFDL0QsUUFBTSxjQUFjLFNBQVMsSUFBSSxZQUFZO0FBQzdDLFFBQU0sUUFBbUIsWUFBWSxpQkFBaUIsU0FBUztBQUMvRCxNQUFJLE1BQU0sUUFBUSxLQUFLLEtBQUssTUFBTSxDQUFDLGFBQWEsY0FBYztBQUM3RCxtQkFBZSxVQUFVLGdCQUFjLFdBQVcsY0FBYyxNQUFNLENBQUMsR0FBbUIsT0FBTyxJQUFJLENBQUM7QUFBQSxFQUN2RztBQUNELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
