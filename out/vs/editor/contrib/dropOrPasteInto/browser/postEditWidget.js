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
import * as dom from "../../../../base/browser/dom.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { raceCancellationError } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { IBulkEditService } from "../../../browser/services/bulkEditService.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from "../../editorState/browser/editorState.js";
import { createCombinedWorkspaceEdit } from "./edit.js";
import "./postEditWidget.css";
let PostEditWidget = class extends Disposable {
  constructor(typeId, editor, visibleContext, showCommand, range, edits, onSelectNewEdit, additionalActions, contextKeyService, _keybindingService, _actionWidgetService) {
    super();
    this.typeId = typeId;
    this.editor = editor;
    this.showCommand = showCommand;
    this.range = range;
    this.edits = edits;
    this.onSelectNewEdit = onSelectNewEdit;
    this.additionalActions = additionalActions;
    this._keybindingService = _keybindingService;
    this._actionWidgetService = _actionWidgetService;
    this.allowEditorOverflow = true;
    this.suppressMouseDown = true;
    this.create();
    this.visibleContext = visibleContext.bindTo(contextKeyService);
    this.visibleContext.set(true);
    this._register(toDisposable(() => this.visibleContext.reset()));
    this.editor.addContentWidget(this);
    this.editor.layoutContentWidget(this);
    this._register(toDisposable((() => this.editor.removeContentWidget(this))));
    this._register(this.editor.onDidChangeCursorPosition((e) => {
      this.dispose();
    }));
    this._register(Event.runAndSubscribe(_keybindingService.onDidUpdateKeybindings, () => {
      this._updateButtonTitle();
    }));
  }
  _updateButtonTitle() {
    this.button.element.title = this._keybindingService.appendKeybinding(this.showCommand.label, this.showCommand.id);
  }
  create() {
    this.domNode = dom.$(".post-edit-widget");
    this.button = this._register(new Button(this.domNode, {
      supportIcons: true
    }));
    this.button.label = "$(insert)";
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, () => this.showSelector()));
  }
  getId() {
    return PostEditWidget.baseId + "." + this.typeId;
  }
  getDomNode() {
    return this.domNode;
  }
  getPosition() {
    return {
      position: this.range.getEndPosition(),
      preference: [ContentWidgetPositionPreference.BELOW]
    };
  }
  showSelector() {
    const pos = dom.getDomNodePagePosition(this.button.element);
    const anchor = { x: pos.left + pos.width, y: pos.top + pos.height };
    this._actionWidgetService.show(
      "postEditWidget",
      false,
      this.edits.allEdits.map((edit, i) => {
        return {
          kind: ActionListItemKind.Action,
          item: edit,
          label: edit.title,
          disabled: false,
          canPreview: false,
          group: { title: "", icon: ThemeIcon.fromId(i === this.edits.activeEditIndex ? Codicon.check.id : Codicon.blank.id) }
        };
      }),
      {
        onHide: () => {
          this.editor.focus();
        },
        onSelect: (item) => {
          this._actionWidgetService.hide(false);
          const i = this.edits.allEdits.findIndex((edit) => edit === item);
          if (i !== this.edits.activeEditIndex) {
            return this.onSelectNewEdit(i);
          }
        }
      },
      anchor,
      this.editor.getDomNode() ?? void 0,
      this.additionalActions
    );
  }
};
PostEditWidget.baseId = "editor.widget.postEditWidget";
PostEditWidget = __decorateClass([
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IActionWidgetService)
], PostEditWidget);
let PostEditWidgetManager = class extends Disposable {
  constructor(_id, _editor, _visibleContext, _showCommand, _getAdditionalActions, _instantiationService, _bulkEditService, _notificationService) {
    super();
    this._id = _id;
    this._editor = _editor;
    this._visibleContext = _visibleContext;
    this._showCommand = _showCommand;
    this._getAdditionalActions = _getAdditionalActions;
    this._instantiationService = _instantiationService;
    this._bulkEditService = _bulkEditService;
    this._notificationService = _notificationService;
    this._currentWidget = this._register(new MutableDisposable());
    this._register(Event.any(
      _editor.onDidChangeModel,
      _editor.onDidChangeModelContent
    )(() => this.clear()));
  }
  async applyEditAndShowIfNeeded(ranges, edits, canShowWidget, resolve, token) {
    if (!ranges.length || !this._editor.hasModel()) {
      return;
    }
    const model = this._editor.getModel();
    const edit = edits.allEdits.at(edits.activeEditIndex);
    if (!edit) {
      return;
    }
    const onDidSelectEdit = async (newEditIndex) => {
      const model2 = this._editor.getModel();
      if (!model2) {
        return;
      }
      await model2.undo();
      this.applyEditAndShowIfNeeded(ranges, { activeEditIndex: newEditIndex, allEdits: edits.allEdits }, canShowWidget, resolve, token);
    };
    const handleError = (e, message) => {
      if (isCancellationError(e)) {
        return;
      }
      this._notificationService.error(message);
      if (canShowWidget) {
        this.show(ranges[0], edits, onDidSelectEdit);
      }
    };
    const editorStateCts = new EditorStateCancellationTokenSource(this._editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, void 0, token);
    let resolvedEdit;
    try {
      resolvedEdit = await raceCancellationError(resolve(edit, editorStateCts.token), editorStateCts.token);
    } catch (e) {
      return handleError(e, localize("resolveError", "Error resolving edit '{0}':\n{1}", edit.title, toErrorMessage(e)));
    } finally {
      editorStateCts.dispose();
    }
    if (token.isCancellationRequested) {
      return;
    }
    const combinedWorkspaceEdit = createCombinedWorkspaceEdit(model.uri, ranges, resolvedEdit);
    const primaryRange = ranges[0];
    const editTrackingDecoration = model.deltaDecorations([], [{
      range: primaryRange,
      options: { description: "paste-line-suffix", stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }
    }]);
    this._editor.focus();
    let editResult;
    let editRange;
    try {
      editResult = await this._bulkEditService.apply(combinedWorkspaceEdit, { editor: this._editor, token });
      editRange = model.getDecorationRange(editTrackingDecoration[0]);
    } catch (e) {
      return handleError(e, localize("applyError", "Error applying edit '{0}':\n{1}", edit.title, toErrorMessage(e)));
    } finally {
      model.deltaDecorations(editTrackingDecoration, []);
    }
    if (token.isCancellationRequested) {
      return;
    }
    if (canShowWidget && editResult.isApplied && edits.allEdits.length > 1) {
      this.show(editRange ?? primaryRange, edits, onDidSelectEdit);
    }
  }
  show(range, edits, onDidSelectEdit) {
    this.clear();
    if (this._editor.hasModel()) {
      this._currentWidget.value = this._instantiationService.createInstance(PostEditWidget, this._id, this._editor, this._visibleContext, this._showCommand, range, edits, onDidSelectEdit, this._getAdditionalActions());
    }
  }
  clear() {
    this._currentWidget.clear();
  }
  tryShowSelector() {
    this._currentWidget.value?.showSelector();
  }
};
PostEditWidgetManager = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IBulkEditService),
  __decorateParam(7, INotificationService)
], PostEditWidgetManager);
export {
  PostEditWidgetManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGRyb3BPclBhc3RlSW50b1xcYnJvd3NlclxccG9zdEVkaXRXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbkxpc3RJdGVtS2luZCwgSUFjdGlvbkxpc3RJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0UmVzdWx0LCBJQnVsa0VkaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudERyb3BFZGl0LCBEb2N1bWVudFBhc3RlRWRpdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yU3RhdGVGbGFnLCBFZGl0b3JTdGF0ZUNhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yU3RhdGUvYnJvd3Nlci9lZGl0b3JTdGF0ZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb21iaW5lZFdvcmtzcGFjZUVkaXQgfSBmcm9tICcuL2VkaXQuanMnO1xuaW1wb3J0ICcuL3Bvc3RFZGl0V2lkZ2V0LmNzcyc7XG5cblxuaW50ZXJmYWNlIEVkaXRTZXQ8RWRpdCBleHRlbmRzIERvY3VtZW50UGFzdGVFZGl0IHwgRG9jdW1lbnREcm9wRWRpdD4ge1xuXHRyZWFkb25seSBhY3RpdmVFZGl0SW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgYWxsRWRpdHM6IFJlYWRvbmx5QXJyYXk8RWRpdD47XG59XG5cbmludGVyZmFjZSBTaG93Q29tbWFuZCB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG59XG5cbmNsYXNzIFBvc3RFZGl0V2lkZ2V0PFQgZXh0ZW5kcyBEb2N1bWVudFBhc3RlRWRpdCB8IERvY3VtZW50RHJvcEVkaXQ+IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb250ZW50V2lkZ2V0IHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgYmFzZUlkID0gJ2VkaXRvci53aWRnZXQucG9zdEVkaXRXaWRnZXQnO1xuXG5cdHJlYWRvbmx5IGFsbG93RWRpdG9yT3ZlcmZsb3cgPSB0cnVlO1xuXHRyZWFkb25seSBzdXBwcmVzc01vdXNlRG93biA9IHRydWU7XG5cblx0cHJpdmF0ZSBkb21Ob2RlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgYnV0dG9uITogQnV0dG9uO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJsZUNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdHlwZUlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHZpc2libGVDb250ZXh0OiBSYXdDb250ZXh0S2V5PGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2hvd0NvbW1hbmQ6IFNob3dDb21tYW5kLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmFuZ2U6IFJhbmdlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdHM6IEVkaXRTZXQ8VD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvblNlbGVjdE5ld0VkaXQ6IChlZGl0SW5kZXg6IG51bWJlcikgPT4gdm9pZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFkZGl0aW9uYWxBY3Rpb25zOiByZWFkb25seSBJQWN0aW9uW10sXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNyZWF0ZSgpO1xuXG5cdFx0dGhpcy52aXNpYmxlQ29udGV4dCA9IHZpc2libGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy52aXNpYmxlQ29udGV4dC5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMudmlzaWJsZUNvbnRleHQucmVzZXQoKSkpO1xuXG5cdFx0dGhpcy5lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgoKSA9PiB0aGlzLmVkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbihlID0+IHtcblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShfa2V5YmluZGluZ1NlcnZpY2Uub25EaWRVcGRhdGVLZXliaW5kaW5ncywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9uVGl0bGUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVCdXR0b25UaXRsZSgpIHtcblx0XHR0aGlzLmJ1dHRvbi5lbGVtZW50LnRpdGxlID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyh0aGlzLnNob3dDb21tYW5kLmxhYmVsLCB0aGlzLnNob3dDb21tYW5kLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS4kKCcucG9zdC1lZGl0LXdpZGdldCcpO1xuXG5cdFx0dGhpcy5idXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuZG9tTm9kZSwge1xuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdH0pKTtcblx0XHR0aGlzLmJ1dHRvbi5sYWJlbCA9ICckKGluc2VydCknO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuc2hvd1NlbGVjdG9yKCkpKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFBvc3RFZGl0V2lkZ2V0LmJhc2VJZCArICcuJyArIHRoaXMudHlwZUlkO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHRoaXMucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSxcblx0XHRcdHByZWZlcmVuY2U6IFtDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkJFTE9XXVxuXHRcdH07XG5cdH1cblxuXHRzaG93U2VsZWN0b3IoKSB7XG5cdFx0Y29uc3QgcG9zID0gZG9tLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy5idXR0b24uZWxlbWVudCk7XG5cdFx0Y29uc3QgYW5jaG9yID0geyB4OiBwb3MubGVmdCArIHBvcy53aWR0aCwgeTogcG9zLnRvcCArIHBvcy5oZWlnaHQgfTtcblxuXHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2Uuc2hvdygncG9zdEVkaXRXaWRnZXQnLCBmYWxzZSxcblx0XHRcdHRoaXMuZWRpdHMuYWxsRWRpdHMubWFwKChlZGl0LCBpKTogSUFjdGlvbkxpc3RJdGVtPFQ+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRcdGl0ZW06IGVkaXQsXG5cdFx0XHRcdFx0bGFiZWw6IGVkaXQudGl0bGUsXG5cdFx0XHRcdFx0ZGlzYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGNhblByZXZpZXc6IGZhbHNlLFxuXHRcdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogVGhlbWVJY29uLmZyb21JZChpID09PSB0aGlzLmVkaXRzLmFjdGl2ZUVkaXRJbmRleCA/IENvZGljb24uY2hlY2suaWQgOiBDb2RpY29uLmJsYW5rLmlkKSB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSksIHtcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0fSxcblx0XHRcdG9uU2VsZWN0OiAoaXRlbSkgPT4ge1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoZmFsc2UpO1xuXG5cdFx0XHRcdGNvbnN0IGkgPSB0aGlzLmVkaXRzLmFsbEVkaXRzLmZpbmRJbmRleChlZGl0ID0+IGVkaXQgPT09IGl0ZW0pO1xuXHRcdFx0XHRpZiAoaSAhPT0gdGhpcy5lZGl0cy5hY3RpdmVFZGl0SW5kZXgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5vblNlbGVjdE5ld0VkaXQoaSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSwgYW5jaG9yLCB0aGlzLmVkaXRvci5nZXREb21Ob2RlKCkgPz8gdW5kZWZpbmVkLCB0aGlzLmFkZGl0aW9uYWxBY3Rpb25zKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUG9zdEVkaXRXaWRnZXRNYW5hZ2VyPFQgZXh0ZW5kcyBEb2N1bWVudFBhc3RlRWRpdCB8IERvY3VtZW50RHJvcEVkaXQ+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxQb3N0RWRpdFdpZGdldDxUPj4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2libGVDb250ZXh0OiBSYXdDb250ZXh0S2V5PGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dDb21tYW5kOiBTaG93Q29tbWFuZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRBZGRpdGlvbmFsQWN0aW9uczogKCkgPT4gcmVhZG9ubHkgSUFjdGlvbltdLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUJ1bGtFZGl0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9idWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KFxuXHRcdFx0X2VkaXRvci5vbkRpZENoYW5nZU1vZGVsLFxuXHRcdFx0X2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCxcblx0XHQpKCgpID0+IHRoaXMuY2xlYXIoKSkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGFwcGx5RWRpdEFuZFNob3dJZk5lZWRlZChyYW5nZXM6IHJlYWRvbmx5IFJhbmdlW10sIGVkaXRzOiBFZGl0U2V0PFQ+LCBjYW5TaG93V2lkZ2V0OiBib29sZWFuLCByZXNvbHZlOiAoZWRpdDogVCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPFQ+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRpZiAoIXJhbmdlcy5sZW5ndGggfHwgIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBlZGl0ID0gZWRpdHMuYWxsRWRpdHMuYXQoZWRpdHMuYWN0aXZlRWRpdEluZGV4KTtcblx0XHRpZiAoIWVkaXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvbkRpZFNlbGVjdEVkaXQgPSBhc3luYyAobmV3RWRpdEluZGV4OiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgbW9kZWwudW5kbygpO1xuXHRcdFx0dGhpcy5hcHBseUVkaXRBbmRTaG93SWZOZWVkZWQocmFuZ2VzLCB7IGFjdGl2ZUVkaXRJbmRleDogbmV3RWRpdEluZGV4LCBhbGxFZGl0czogZWRpdHMuYWxsRWRpdHMgfSwgY2FuU2hvd1dpZGdldCwgcmVzb2x2ZSwgdG9rZW4pO1xuXHRcdH07XG5cblx0XHRjb25zdCBoYW5kbGVFcnJvciA9IChlOiBFcnJvciwgbWVzc2FnZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobWVzc2FnZSk7XG5cdFx0XHRpZiAoY2FuU2hvd1dpZGdldCkge1xuXHRcdFx0XHR0aGlzLnNob3cocmFuZ2VzWzBdLCBlZGl0cywgb25EaWRTZWxlY3RFZGl0KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZWRpdG9yU3RhdGVDdHMgPSBuZXcgRWRpdG9yU3RhdGVDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0aGlzLl9lZGl0b3IsIENvZGVFZGl0b3JTdGF0ZUZsYWcuVmFsdWUgfCBDb2RlRWRpdG9yU3RhdGVGbGFnLlNlbGVjdGlvbiwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdFx0bGV0IHJlc29sdmVkRWRpdDogVDtcblx0XHR0cnkge1xuXHRcdFx0cmVzb2x2ZWRFZGl0ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHJlc29sdmUoZWRpdCwgZWRpdG9yU3RhdGVDdHMudG9rZW4pLCBlZGl0b3JTdGF0ZUN0cy50b2tlbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIGhhbmRsZUVycm9yKGUsIGxvY2FsaXplKCdyZXNvbHZlRXJyb3InLCBcIkVycm9yIHJlc29sdmluZyBlZGl0ICd7MH0nOlxcbnsxfVwiLCBlZGl0LnRpdGxlLCB0b0Vycm9yTWVzc2FnZShlKSkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRlZGl0b3JTdGF0ZUN0cy5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tYmluZWRXb3Jrc3BhY2VFZGl0ID0gY3JlYXRlQ29tYmluZWRXb3Jrc3BhY2VFZGl0KG1vZGVsLnVyaSwgcmFuZ2VzLCByZXNvbHZlZEVkaXQpO1xuXG5cdFx0Ly8gVXNlIGEgZGVjb3JhdGlvbiB0byB0cmFjayBlZGl0cyBhcm91bmQgdGhlIHRyaWdnZXIgcmFuZ2Vcblx0XHRjb25zdCBwcmltYXJ5UmFuZ2UgPSByYW5nZXNbMF07XG5cdFx0Y29uc3QgZWRpdFRyYWNraW5nRGVjb3JhdGlvbiA9IG1vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIFt7XG5cdFx0XHRyYW5nZTogcHJpbWFyeVJhbmdlLFxuXHRcdFx0b3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Bhc3RlLWxpbmUtc3VmZml4Jywgc3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzIH1cblx0XHR9XSk7XG5cblx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHRsZXQgZWRpdFJlc3VsdDogSUJ1bGtFZGl0UmVzdWx0O1xuXHRcdGxldCBlZGl0UmFuZ2U6IFJhbmdlIHwgbnVsbDtcblx0XHR0cnkge1xuXHRcdFx0ZWRpdFJlc3VsdCA9IGF3YWl0IHRoaXMuX2J1bGtFZGl0U2VydmljZS5hcHBseShjb21iaW5lZFdvcmtzcGFjZUVkaXQsIHsgZWRpdG9yOiB0aGlzLl9lZGl0b3IsIHRva2VuIH0pO1xuXHRcdFx0ZWRpdFJhbmdlID0gbW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGVkaXRUcmFja2luZ0RlY29yYXRpb25bMF0pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBoYW5kbGVFcnJvcihlLCBsb2NhbGl6ZSgnYXBwbHlFcnJvcicsIFwiRXJyb3IgYXBwbHlpbmcgZWRpdCAnezB9JzpcXG57MX1cIiwgZWRpdC50aXRsZSwgdG9FcnJvck1lc3NhZ2UoZSkpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bW9kZWwuZGVsdGFEZWNvcmF0aW9ucyhlZGl0VHJhY2tpbmdEZWNvcmF0aW9uLCBbXSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGNhblNob3dXaWRnZXQgJiYgZWRpdFJlc3VsdC5pc0FwcGxpZWQgJiYgZWRpdHMuYWxsRWRpdHMubGVuZ3RoID4gMSkge1xuXHRcdFx0dGhpcy5zaG93KGVkaXRSYW5nZSA/PyBwcmltYXJ5UmFuZ2UsIGVkaXRzLCBvbkRpZFNlbGVjdEVkaXQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzaG93KHJhbmdlOiBSYW5nZSwgZWRpdHM6IEVkaXRTZXQ8VD4sIG9uRGlkU2VsZWN0RWRpdDogKG5ld0luZGV4OiBudW1iZXIpID0+IHZvaWQpIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cblx0XHRpZiAodGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRXaWRnZXQudmFsdWUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQb3N0RWRpdFdpZGdldDxUPiwgdGhpcy5faWQsIHRoaXMuX2VkaXRvciwgdGhpcy5fdmlzaWJsZUNvbnRleHQsIHRoaXMuX3Nob3dDb21tYW5kLCByYW5nZSwgZWRpdHMsIG9uRGlkU2VsZWN0RWRpdCwgdGhpcy5fZ2V0QWRkaXRpb25hbEFjdGlvbnMoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNsZWFyKCkge1xuXHRcdHRoaXMuX2N1cnJlbnRXaWRnZXQuY2xlYXIoKTtcblx0fVxuXG5cdHB1YmxpYyB0cnlTaG93U2VsZWN0b3IoKSB7XG5cdFx0dGhpcy5fY3VycmVudFdpZGdldC52YWx1ZT8uc2hvd1NlbGVjdG9yKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUV2QixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxtQkFBbUIsb0JBQW9CO0FBQzVELFNBQVMsaUJB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
