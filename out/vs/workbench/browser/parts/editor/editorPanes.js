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
import { Emitter } from "../../../../base/common/event.js";
import Severity from "../../../../base/common/severity.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorExtensions, EditorInputCapabilities, isEditorOpenError } from "../../../common/editor.js";
import { Dimension, show, hide, isAncestor, getActiveElement, getWindowById, isEditableElement, $ } from "../../../../base/browser/dom.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IEditorProgressService, LongRunningOperation } from "../../../../platform/progress/common/progress.js";
import { DEFAULT_EDITOR_MIN_DIMENSIONS, DEFAULT_EDITOR_MAX_DIMENSIONS } from "./editor.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { ErrorPlaceholderEditor, WorkspaceTrustRequiredPlaceholderEditor } from "./editorPlaceholder.js";
import { EditorOpenSource } from "../../../../platform/editor/common/editor.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IHostService } from "../../../services/host/browser/host.js";
let EditorPanes = class extends Disposable {
  constructor(editorGroupParent, editorPanesParent, groupView, layoutService, instantiationService, editorProgressService, workspaceTrustService, logService, dialogService, hostService) {
    super();
    this.editorGroupParent = editorGroupParent;
    this.editorPanesParent = editorPanesParent;
    this.groupView = groupView;
    this.layoutService = layoutService;
    this.instantiationService = instantiationService;
    this.workspaceTrustService = workspaceTrustService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.hostService = hostService;
    //#region Events
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidChangeSizeConstraints = this._register(new Emitter());
    this.onDidChangeSizeConstraints = this._onDidChangeSizeConstraints.event;
    this._activeEditorPane = null;
    this.editorPanes = [];
    this.mapEditorPaneToPendingSetInput = /* @__PURE__ */ new Map();
    this.activeEditorPaneDisposables = this._register(new DisposableStore());
    this.editorPanesRegistry = Registry.as(EditorExtensions.EditorPane);
    this.editorOperation = this._register(new LongRunningOperation(editorProgressService));
    this.registerListeners();
  }
  //#endregion
  get minimumWidth() {
    return this._activeEditorPane?.minimumWidth ?? DEFAULT_EDITOR_MIN_DIMENSIONS.width;
  }
  get minimumHeight() {
    return this._activeEditorPane?.minimumHeight ?? DEFAULT_EDITOR_MIN_DIMENSIONS.height;
  }
  get maximumWidth() {
    return this._activeEditorPane?.maximumWidth ?? DEFAULT_EDITOR_MAX_DIMENSIONS.width;
  }
  get maximumHeight() {
    return this._activeEditorPane?.maximumHeight ?? DEFAULT_EDITOR_MAX_DIMENSIONS.height;
  }
  get activeEditorPane() {
    return this._activeEditorPane;
  }
  registerListeners() {
    this._register(this.workspaceTrustService.onDidChangeTrust(() => this.onDidChangeWorkspaceTrust()));
  }
  onDidChangeWorkspaceTrust() {
    const editor = this._activeEditorPane?.input;
    const options = this._activeEditorPane?.options;
    if (editor?.hasCapability(EditorInputCapabilities.RequiresTrust)) {
      this.groupView.openEditor(editor, options);
    }
  }
  async openEditor(editor, options, internalOptions, context = /* @__PURE__ */ Object.create(null)) {
    try {
      return await this.doOpenEditor(this.getEditorPaneDescriptor(editor), editor, options, internalOptions, context);
    } catch (error) {
      if (options?.ignoreError) {
        return { error };
      }
      return this.doShowError(error, editor, options, internalOptions, context);
    }
  }
  async doShowError(error, editor, options, internalOptions, context) {
    this.logService.error(error);
    let errorHandled = false;
    if (options?.source === EditorOpenSource.USER && (!isEditorOpenError(error) || error.allowDialog)) {
      errorHandled = await this.doShowErrorDialog(error, editor);
    }
    if (errorHandled) {
      return { error };
    }
    const editorPlaceholderOptions = { ...options };
    if (!isCancellationError(error)) {
      editorPlaceholderOptions.error = error;
    }
    return {
      ...await this.doOpenEditor(ErrorPlaceholderEditor.DESCRIPTOR, editor, editorPlaceholderOptions, internalOptions, context),
      error
    };
  }
  async doShowErrorDialog(error, editor) {
    let severity = Severity.Error;
    let message = void 0;
    let detail = toErrorMessage(error);
    let errorActions = void 0;
    if (isEditorOpenError(error)) {
      errorActions = error.actions;
      severity = error.forceSeverity ?? Severity.Error;
      if (error.forceMessage) {
        message = error.message;
        detail = void 0;
      }
    }
    if (!message) {
      message = localize("editorOpenErrorDialog", "Unable to open '{0}'", editor.getName());
    }
    const buttons = [];
    if (errorActions && errorActions.length > 0) {
      for (const errorAction of errorActions) {
        buttons.push({
          label: errorAction.label,
          run: () => errorAction
        });
      }
    } else {
      buttons.push({
        label: localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
        run: () => void 0
      });
    }
    let cancelButton = void 0;
    if (buttons.length === 1) {
      cancelButton = {
        run: () => {
          errorHandled = true;
          return void 0;
        }
      };
    }
    let errorHandled = false;
    const { result } = await this.dialogService.prompt({
      type: severity,
      message,
      detail,
      buttons,
      cancelButton
    });
    if (result) {
      const errorActionResult = result.run();
      if (errorActionResult instanceof Promise) {
        errorActionResult.catch((error2) => this.dialogService.error(toErrorMessage(error2)));
      }
      errorHandled = true;
    }
    return errorHandled;
  }
  async doOpenEditor(descriptor, editor, options, internalOptions, context = /* @__PURE__ */ Object.create(null)) {
    const pane = this.doShowEditorPane(descriptor);
    const activeElement = getActiveElement();
    const { changed, cancelled } = await this.doSetInput(pane, editor, options, context);
    if (!cancelled) {
      const focus = !options?.preserveFocus;
      if (focus && this.shouldRestoreFocus(activeElement)) {
        pane.focus();
      } else if (!internalOptions?.preserveWindowOrder) {
        this.hostService.moveTop(getWindowById(this.groupView.windowId, true).window);
      }
    }
    return { pane, changed, cancelled };
  }
  shouldRestoreFocus(expectedActiveElement) {
    if (!this.layoutService.isRestored()) {
      return true;
    }
    if (!expectedActiveElement) {
      return true;
    }
    const activeElement = getActiveElement();
    if (!activeElement || activeElement === expectedActiveElement.ownerDocument.body) {
      return true;
    }
    const same = expectedActiveElement === activeElement;
    if (same) {
      return true;
    }
    if (!isEditableElement(activeElement)) {
      return true;
    }
    if (isAncestor(activeElement, this.editorGroupParent)) {
      return true;
    }
    return false;
  }
  getEditorPaneDescriptor(editor) {
    if (editor.hasCapability(EditorInputCapabilities.RequiresTrust) && !this.workspaceTrustService.isWorkspaceTrusted()) {
      return WorkspaceTrustRequiredPlaceholderEditor.DESCRIPTOR;
    }
    return assertReturnsDefined(this.editorPanesRegistry.getEditorPane(editor));
  }
  doShowEditorPane(descriptor) {
    if (this._activeEditorPane && descriptor.describes(this._activeEditorPane)) {
      return this._activeEditorPane;
    }
    this.doHideActiveEditorPane();
    const editorPane = this.doCreateEditorPane(descriptor);
    this.doSetActiveEditorPane(editorPane);
    const container = assertReturnsDefined(editorPane.getContainer());
    this.editorPanesParent.appendChild(container);
    show(container);
    editorPane.setVisible(true);
    if (this.pagePosition) {
      editorPane.layout(new Dimension(this.pagePosition.width, this.pagePosition.height), { top: this.pagePosition.top, left: this.pagePosition.left });
    }
    if (this.boundarySashes) {
      editorPane.setBoundarySashes(this.boundarySashes);
    }
    return editorPane;
  }
  doCreateEditorPane(descriptor) {
    const editorPane = this.doInstantiateEditorPane(descriptor);
    if (!editorPane.getContainer()) {
      const editorPaneContainer = $(".editor-instance");
      this.editorPanesParent.appendChild(editorPaneContainer);
      try {
        editorPane.create(editorPaneContainer);
      } catch (error) {
        editorPaneContainer.remove();
        hide(editorPaneContainer);
        throw error;
      }
    }
    return editorPane;
  }
  doInstantiateEditorPane(descriptor) {
    const existingEditorPane = this.editorPanes.find((editorPane2) => descriptor.describes(editorPane2));
    if (existingEditorPane) {
      return existingEditorPane;
    }
    const editorPane = this._register(descriptor.instantiate(this.instantiationService, this.groupView));
    this.editorPanes.push(editorPane);
    return editorPane;
  }
  doSetActiveEditorPane(editorPane) {
    this._activeEditorPane = editorPane;
    this.activeEditorPaneDisposables.clear();
    if (editorPane) {
      this.activeEditorPaneDisposables.add(editorPane.onDidChangeSizeConstraints((e) => this._onDidChangeSizeConstraints.fire(e)));
      this.activeEditorPaneDisposables.add(editorPane.onDidFocus(() => this._onDidFocus.fire()));
    }
    this._onDidChangeSizeConstraints.fire(void 0);
  }
  async doSetInput(editorPane, editor, options, context) {
    let inputMatches = editorPane.input?.matches(editor);
    if (inputMatches && !options?.forceReload) {
      if (this.mapEditorPaneToPendingSetInput.has(editorPane)) {
        await this.mapEditorPaneToPendingSetInput.get(editorPane);
      }
      inputMatches = editorPane.input?.matches(editor);
      if (inputMatches) {
        editorPane.setOptions(options);
      }
      return { changed: false, cancelled: !inputMatches };
    }
    const operation = this.editorOperation.start(this.layoutService.isRestored() ? 800 : 3200);
    let cancelled = false;
    try {
      editorPane.clearInput();
      const pendingSetInput = editorPane.setInput(editor, options, context, operation.token);
      this.mapEditorPaneToPendingSetInput.set(editorPane, pendingSetInput);
      await pendingSetInput;
      if (!operation.isCurrent()) {
        cancelled = true;
      }
    } catch (error) {
      if (!operation.isCurrent()) {
        cancelled = true;
      } else {
        throw error;
      }
    } finally {
      if (operation.isCurrent()) {
        this.mapEditorPaneToPendingSetInput.delete(editorPane);
      }
      operation.stop();
    }
    return { changed: !inputMatches, cancelled };
  }
  doHideActiveEditorPane() {
    if (!this._activeEditorPane) {
      return;
    }
    this.editorOperation.stop();
    this.safeRun(() => this._activeEditorPane?.clearInput());
    this.safeRun(() => this._activeEditorPane?.setVisible(false));
    this.mapEditorPaneToPendingSetInput.delete(this._activeEditorPane);
    const editorPaneContainer = this._activeEditorPane.getContainer();
    if (editorPaneContainer) {
      editorPaneContainer.remove();
      hide(editorPaneContainer);
    }
    this.doSetActiveEditorPane(null);
  }
  closeEditor(editor) {
    if (this._activeEditorPane?.input && editor.matches(this._activeEditorPane.input)) {
      this.doHideActiveEditorPane();
    }
  }
  setVisible(visible) {
    this.safeRun(() => this._activeEditorPane?.setVisible(visible));
  }
  layout(pagePosition) {
    this.pagePosition = pagePosition;
    this.safeRun(() => this._activeEditorPane?.layout(new Dimension(pagePosition.width, pagePosition.height), pagePosition));
  }
  setBoundarySashes(sashes) {
    this.boundarySashes = sashes;
    this.safeRun(() => this._activeEditorPane?.setBoundarySashes(sashes));
  }
  safeRun(fn) {
    try {
      fn();
    } catch (error) {
      this.logService.error(error);
    }
  }
};
EditorPanes = __decorateClass([
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IEditorProgressService),
  __decorateParam(6, IWorkspaceTrustManagementService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IHostService)
], EditorPanes);
export {
  EditorPanes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvclBhbmVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucywgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMsIElFZGl0b3JPcGVuQ29udGV4dCwgSVZpc2libGVFZGl0b3JQYW5lLCBpc0VkaXRvck9wZW5FcnJvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IERpbWVuc2lvbiwgc2hvdywgaGlkZSwgSURvbU5vZGVQYWdlUG9zaXRpb24sIGlzQW5jZXN0b3IsIGdldEFjdGl2ZUVsZW1lbnQsIGdldFdpbmRvd0J5SWQsIGlzRWRpdGFibGVFbGVtZW50LCAkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZVJlZ2lzdHJ5LCBJRWRpdG9yUGFuZURlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCBMb25nUnVubmluZ09wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBWaWV3LCBERUZBVUxUX0VESVRPUl9NSU5fRElNRU5TSU9OUywgREVGQVVMVF9FRElUT1JfTUFYX0RJTUVOU0lPTlMsIElJbnRlcm5hbEVkaXRvck9wZW5PcHRpb25zIH0gZnJvbSAnLi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgRXJyb3JQbGFjZWhvbGRlckVkaXRvciwgSUVycm9yRWRpdG9yUGxhY2Vob2xkZXJPcHRpb25zLCBXb3Jrc3BhY2VUcnVzdFJlcXVpcmVkUGxhY2Vob2xkZXJFZGl0b3IgfSBmcm9tICcuL2VkaXRvclBsYWNlaG9sZGVyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wZW5Tb3VyY2UsIElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJUHJvbXB0QnV0dG9uLCBJUHJvbXB0Q2FuY2VsQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJQm91bmRhcnlTYXNoZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJT3BlbkVkaXRvclJlc3VsdCB7XG5cblx0LyoqXG5cdCAqIFRoZSBlZGl0b3IgcGFuZSB1c2VkIGZvciBvcGVuaW5nLiBUaGlzIGNhbiBiZSBhIGdlbmVyaWNcblx0ICogcGxhY2Vob2xkZXIgaW4gY2VydGFpbiBjYXNlcywgZS5nLiB3aGVuIHdvcmtzcGFjZSB0cnVzdFxuXHQgKiBpcyByZXF1aXJlZCwgb3IgYW4gZWRpdG9yIGZhaWxzIHRvIHJlc3RvcmUuXG5cdCAqXG5cdCAqIFdpbGwgYmUgYHVuZGVmaW5lZGAgaWYgYW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgdHJ5aW5nIHRvXG5cdCAqIG9wZW4gdGhlIGVkaXRvciBhbmQgaW4gY2FzZXMgd2hlcmUgbm8gcGxhY2Vob2xkZXIgaXMgYmVpbmdcblx0ICogdXNlZC5cblx0ICovXG5cdHJlYWRvbmx5IHBhbmU/OiBFZGl0b3JQYW5lO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBlZGl0b3IgY2hhbmdlZCBhcyBhIHJlc3VsdCBvZiBvcGVuaW5nLlxuXHQgKi9cblx0cmVhZG9ubHkgY2hhbmdlZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoaXMgcHJvcGVydHkgaXMgc2V0IHdoZW4gYW4gZWRpdG9yIGZhaWxzIHRvIHJlc3RvcmUgYW5kXG5cdCAqIGlzIHNob3duIHdpdGggYSBnZW5lcmljIHBsYWNlIGhvbGRlci4gSXQgYWxsb3dzIGNhbGxlcnNcblx0ICogdG8gc3RpbGwgcHJlc2VudCB0aGUgZXJyb3IgdG8gdGhlIHVzZXIgaW4gdGhhdCBjYXNlLlxuXHQgKi9cblx0cmVhZG9ubHkgZXJyb3I/OiBFcnJvcjtcblxuXHQvKipcblx0ICogVGhpcyBwcm9wZXJ0eSBpbmRpY2F0ZXMgd2hldGhlciB0aGUgb3BlbiBlZGl0b3Igb3BlcmF0aW9uIHdhc1xuXHQgKiBjYW5jZWxsZWQgb3Igbm90LiBUaGUgb3BlcmF0aW9uIG1heSBoYXZlIGJlZW4gY2FuY2VsbGVkXG5cdCAqIGluIGNhc2UgYW5vdGhlciBlZGl0b3Igb3BlbiBvcGVyYXRpb24gd2FzIHRyaWdnZXJlZCByaWdodFxuXHQgKiBhZnRlciBjYW5jZWxsaW5nIHRoaXMgb25lIG91dC5cblx0ICovXG5cdHJlYWRvbmx5IGNhbmNlbGxlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JQYW5lcyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8vI3JlZ2lvbiBFdmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXMgPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMgPSB0aGlzLl9vbkRpZENoYW5nZVNpemVDb25zdHJhaW50cy5ldmVudDtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRnZXQgbWluaW11bVdpZHRoKCkgeyByZXR1cm4gdGhpcy5fYWN0aXZlRWRpdG9yUGFuZT8ubWluaW11bVdpZHRoID8/IERFRkFVTFRfRURJVE9SX01JTl9ESU1FTlNJT05TLndpZHRoOyB9XG5cdGdldCBtaW5pbXVtSGVpZ2h0KCkgeyByZXR1cm4gdGhpcy5fYWN0aXZlRWRpdG9yUGFuZT8ubWluaW11bUhlaWdodCA/PyBERUZBVUxUX0VESVRPUl9NSU5fRElNRU5TSU9OUy5oZWlnaHQ7IH1cblx0Z2V0IG1heGltdW1XaWR0aCgpIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/Lm1heGltdW1XaWR0aCA/PyBERUZBVUxUX0VESVRPUl9NQVhfRElNRU5TSU9OUy53aWR0aDsgfVxuXHRnZXQgbWF4aW11bUhlaWdodCgpIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/Lm1heGltdW1IZWlnaHQgPz8gREVGQVVMVF9FRElUT1JfTUFYX0RJTUVOU0lPTlMuaGVpZ2h0OyB9XG5cblx0cHJpdmF0ZSBfYWN0aXZlRWRpdG9yUGFuZTogRWRpdG9yUGFuZSB8IG51bGwgPSBudWxsO1xuXHRnZXQgYWN0aXZlRWRpdG9yUGFuZSgpOiBJVmlzaWJsZUVkaXRvclBhbmUgfCBudWxsIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZUVkaXRvclBhbmUgYXMgSVZpc2libGVFZGl0b3JQYW5lIHwgbnVsbDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUGFuZXM6IEVkaXRvclBhbmVbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hcEVkaXRvclBhbmVUb1BlbmRpbmdTZXRJbnB1dCA9IG5ldyBNYXA8RWRpdG9yUGFuZSwgUHJvbWlzZTx2b2lkPj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZUVkaXRvclBhbmVEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBwYWdlUG9zaXRpb246IElEb21Ob2RlUGFnZVBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGJvdW5kYXJ5U2FzaGVzOiBJQm91bmRhcnlTYXNoZXMgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JPcGVyYXRpb246IExvbmdSdW5uaW5nT3BlcmF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclBhbmVzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBQYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUGFuZXNQYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ3JvdXBWaWV3OiBJRWRpdG9yR3JvdXBWaWV3LFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIGVkaXRvclByb2dyZXNzU2VydmljZTogSUVkaXRvclByb2dyZXNzU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVkaXRvck9wZXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBMb25nUnVubmluZ09wZXJhdGlvbihlZGl0b3JQcm9ncmVzc1NlcnZpY2UpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdCgoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlV29ya3NwYWNlVHJ1c3QoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVdvcmtzcGFjZVRydXN0KCkge1xuXG5cdFx0Ly8gSWYgdGhlIGFjdGl2ZSBlZGl0b3IgcGFuZSByZXF1aXJlcyB3b3Jrc3BhY2UgdHJ1c3Rcblx0XHQvLyB3ZSBuZWVkIHRvIHJlLW9wZW4gaXQgYW55dGltZSB0cnVzdCBjaGFuZ2VzIHRvXG5cdFx0Ly8gYWNjb3VudCBmb3IgaXQuXG5cdFx0Ly8gRm9yIHRoYXQgd2UgZXhwbGljaXRseSBjYWxsIGludG8gdGhlIGdyb3VwLXZpZXdcblx0XHQvLyB0byBoYW5kbGUgZXJyb3JzIHByb3Blcmx5LlxuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/LmlucHV0O1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9hY3RpdmVFZGl0b3JQYW5lPy5vcHRpb25zO1xuXHRcdGlmIChlZGl0b3I/Lmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVxdWlyZXNUcnVzdCkpIHtcblx0XHRcdHRoaXMuZ3JvdXBWaWV3Lm9wZW5FZGl0b3IoZWRpdG9yLCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBvcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBpbnRlcm5hbE9wdGlvbnM6IElJbnRlcm5hbEVkaXRvck9wZW5PcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQgPSBPYmplY3QuY3JlYXRlKG51bGwpKTogUHJvbWlzZTxJT3BlbkVkaXRvclJlc3VsdD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5kb09wZW5FZGl0b3IodGhpcy5nZXRFZGl0b3JQYW5lRGVzY3JpcHRvcihlZGl0b3IpLCBlZGl0b3IsIG9wdGlvbnMsIGludGVybmFsT3B0aW9ucywgY29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0Ly8gRmlyc3QgY2hlY2sgaWYgY2FsbGVyIGluc3RydWN0ZWQgdXMgdG8gaWdub3JlIGVycm9yIGhhbmRsaW5nXG5cdFx0XHRpZiAob3B0aW9ucz8uaWdub3JlRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHsgZXJyb3IgfTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW4gY2FzZSBvZiBhbiBlcnJvciB3aGVuIG9wZW5pbmcgYW4gZWRpdG9yLCB3ZSBzdGlsbCB3YW50IHRvIHNob3dcblx0XHRcdC8vIGFuIGVkaXRvciBpbiB0aGUgZGVzaXJlZCBsb2NhdGlvbiB0byBwcmVzZXJ2ZSB0aGUgdXNlciBpbnRlbnQgYW5kXG5cdFx0XHQvLyB2aWV3IHN0YXRlIChlLmcuIHdoZW4gcmVzdG9yaW5nKS5cblx0XHRcdC8vXG5cdFx0XHQvLyBGb3IgdGhhdCByZWFzb24gd2UgaGF2ZSBwbGFjZSBob2xkZXIgZWRpdG9ycyB0aGF0IGNhbiBjb252ZXkgYVxuXHRcdFx0Ly8gbWVzc2FnZSB3aXRoIGFjdGlvbnMgdGhlIHVzZXIgY2FuIGNsaWNrIG9uLlxuXG5cdFx0XHRyZXR1cm4gdGhpcy5kb1Nob3dFcnJvcihlcnJvciwgZWRpdG9yLCBvcHRpb25zLCBpbnRlcm5hbE9wdGlvbnMsIGNvbnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TaG93RXJyb3IoZXJyb3I6IEVycm9yLCBlZGl0b3I6IEVkaXRvcklucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgaW50ZXJuYWxPcHRpb25zOiBJSW50ZXJuYWxFZGl0b3JPcGVuT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dD86IElFZGl0b3JPcGVuQ29udGV4dCk6IFByb21pc2U8SU9wZW5FZGl0b3JSZXN1bHQ+IHtcblxuXHRcdC8vIEFsd2F5cyBsb2cgdGhlIGVycm9yIHRvIGZpZ3VyZSBvdXQgd2hhdCBpcyBnb2luZyBvblxuXHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cblx0XHQvLyBTaG93IGFzIG1vZGFsIGRpYWxvZyB3aGVuIGV4cGxpY2l0IHVzZXIgYWN0aW9uIHVubGVzcyBkaXNhYmxlZFxuXHRcdGxldCBlcnJvckhhbmRsZWQgPSBmYWxzZTtcblx0XHRpZiAob3B0aW9ucz8uc291cmNlID09PSBFZGl0b3JPcGVuU291cmNlLlVTRVIgJiYgKCFpc0VkaXRvck9wZW5FcnJvcihlcnJvcikgfHwgZXJyb3IuYWxsb3dEaWFsb2cpKSB7XG5cdFx0XHRlcnJvckhhbmRsZWQgPSBhd2FpdCB0aGlzLmRvU2hvd0Vycm9yRGlhbG9nKGVycm9yLCBlZGl0b3IpO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB0aGUgdXNlciBkZWFsdCB3aXRoIHRoZSBlcnJvciBhbHJlYWR5XG5cdFx0aWYgKGVycm9ySGFuZGxlZCkge1xuXHRcdFx0cmV0dXJuIHsgZXJyb3IgfTtcblx0XHR9XG5cblx0XHQvLyBTaG93IGFzIGVkaXRvciBwbGFjZWhvbGRlcjogcGFzcyBvdmVyIHRoZSBlcnJvciB0byBkaXNwbGF5XG5cdFx0Y29uc3QgZWRpdG9yUGxhY2Vob2xkZXJPcHRpb25zOiBJRXJyb3JFZGl0b3JQbGFjZWhvbGRlck9wdGlvbnMgPSB7IC4uLm9wdGlvbnMgfTtcblx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRlZGl0b3JQbGFjZWhvbGRlck9wdGlvbnMuZXJyb3IgPSBlcnJvcjtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uKGF3YWl0IHRoaXMuZG9PcGVuRWRpdG9yKEVycm9yUGxhY2Vob2xkZXJFZGl0b3IuREVTQ1JJUFRPUiwgZWRpdG9yLCBlZGl0b3JQbGFjZWhvbGRlck9wdGlvbnMsIGludGVybmFsT3B0aW9ucywgY29udGV4dCkpLFxuXHRcdFx0ZXJyb3Jcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Nob3dFcnJvckRpYWxvZyhlcnJvcjogRXJyb3IsIGVkaXRvcjogRWRpdG9ySW5wdXQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgc2V2ZXJpdHkgPSBTZXZlcml0eS5FcnJvcjtcblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBkZXRhaWw6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHRvRXJyb3JNZXNzYWdlKGVycm9yKTtcblx0XHRsZXQgZXJyb3JBY3Rpb25zOiByZWFkb25seSBJQWN0aW9uW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoaXNFZGl0b3JPcGVuRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRlcnJvckFjdGlvbnMgPSBlcnJvci5hY3Rpb25zO1xuXHRcdFx0c2V2ZXJpdHkgPSBlcnJvci5mb3JjZVNldmVyaXR5ID8/IFNldmVyaXR5LkVycm9yO1xuXHRcdFx0aWYgKGVycm9yLmZvcmNlTWVzc2FnZSkge1xuXHRcdFx0XHRtZXNzYWdlID0gZXJyb3IubWVzc2FnZTtcblx0XHRcdFx0ZGV0YWlsID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdlZGl0b3JPcGVuRXJyb3JEaWFsb2cnLCBcIlVuYWJsZSB0byBvcGVuICd7MH0nXCIsIGVkaXRvci5nZXROYW1lKCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJ1dHRvbnM6IElQcm9tcHRCdXR0b248SUFjdGlvbiB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdGlmIChlcnJvckFjdGlvbnMgJiYgZXJyb3JBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgZXJyb3JBY3Rpb24gb2YgZXJyb3JBY3Rpb25zKSB7XG5cdFx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGVycm9yQWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gZXJyb3JBY3Rpb25cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ29rJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT0tcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4gdW5kZWZpbmVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRsZXQgY2FuY2VsQnV0dG9uOiBJUHJvbXB0Q2FuY2VsQnV0dG9uPHVuZGVmaW5lZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGJ1dHRvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjYW5jZWxCdXR0b24gPSB7XG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdGVycm9ySGFuZGxlZCA9IHRydWU7IC8vIHRyZWF0IGNhbmNlbCBhcyBoYW5kbGVkIGFuZCBkbyBub3Qgc2hvdyBwbGFjZWhvbGRlclxuXG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRsZXQgZXJyb3JIYW5kbGVkID0gZmFsc2U7ICAvLyBieSBkZWZhdWx0LCBzaG93IHBsYWNlaG9sZGVyXG5cblx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHR0eXBlOiBzZXZlcml0eSxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRkZXRhaWwsXG5cdFx0XHRidXR0b25zLFxuXHRcdFx0Y2FuY2VsQnV0dG9uXG5cdFx0fSk7XG5cblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRjb25zdCBlcnJvckFjdGlvblJlc3VsdCA9IHJlc3VsdC5ydW4oKTtcblx0XHRcdGlmIChlcnJvckFjdGlvblJlc3VsdCBpbnN0YW5jZW9mIFByb21pc2UpIHtcblx0XHRcdFx0ZXJyb3JBY3Rpb25SZXN1bHQuY2F0Y2goZXJyb3IgPT4gdGhpcy5kaWFsb2dTZXJ2aWNlLmVycm9yKHRvRXJyb3JNZXNzYWdlKGVycm9yKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRlcnJvckhhbmRsZWQgPSB0cnVlOyAvLyB0cmVhdCBjdXN0b20gZXJyb3IgYWN0aW9uIGFzIGhhbmRsZWQgYW5kIGRvIG5vdCBzaG93IHBsYWNlaG9sZGVyXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVycm9ySGFuZGxlZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuRWRpdG9yKGRlc2NyaXB0b3I6IElFZGl0b3JQYW5lRGVzY3JpcHRvciwgZWRpdG9yOiBFZGl0b3JJbnB1dCwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGludGVybmFsT3B0aW9uczogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCA9IE9iamVjdC5jcmVhdGUobnVsbCkpOiBQcm9taXNlPElPcGVuRWRpdG9yUmVzdWx0PiB7XG5cblx0XHQvLyBFZGl0b3IgcGFuZVxuXHRcdGNvbnN0IHBhbmUgPSB0aGlzLmRvU2hvd0VkaXRvclBhbmUoZGVzY3JpcHRvcik7XG5cblx0XHQvLyBSZW1lbWJlciBjdXJyZW50IGFjdGl2ZSBlbGVtZW50IGZvciBkZWNpZGluZyB0byByZXN0b3JlIGZvY3VzIGxhdGVyXG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGdldEFjdGl2ZUVsZW1lbnQoKTtcblxuXHRcdC8vIEFwcGx5IGlucHV0IHRvIHBhbmVcblx0XHRjb25zdCB7IGNoYW5nZWQsIGNhbmNlbGxlZCB9ID0gYXdhaXQgdGhpcy5kb1NldElucHV0KHBhbmUsIGVkaXRvciwgb3B0aW9ucywgY29udGV4dCk7XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gcGFzcyBmb2N1cyB0byB0aGUgcGFuZSBvciBvdGhlcndpc2Vcblx0XHQvLyBtYWtlIHN1cmUgdGhhdCB0aGUgcGFuZSB3aW5kb3cgaXMgdmlzaWJsZSB1bmxlc3Ncblx0XHQvLyB0aGlzIGhhcyBiZWVuIGV4cGxpY2l0bHkgZGlzYWJsZWQuXG5cdFx0aWYgKCFjYW5jZWxsZWQpIHtcblx0XHRcdGNvbnN0IGZvY3VzID0gIW9wdGlvbnM/LnByZXNlcnZlRm9jdXM7XG5cdFx0XHRpZiAoZm9jdXMgJiYgdGhpcy5zaG91bGRSZXN0b3JlRm9jdXMoYWN0aXZlRWxlbWVudCkpIHtcblx0XHRcdFx0cGFuZS5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIGlmICghaW50ZXJuYWxPcHRpb25zPy5wcmVzZXJ2ZVdpbmRvd09yZGVyKSB7XG5cdFx0XHRcdHRoaXMuaG9zdFNlcnZpY2UubW92ZVRvcChnZXRXaW5kb3dCeUlkKHRoaXMuZ3JvdXBWaWV3LndpbmRvd0lkLCB0cnVlKS53aW5kb3cpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHBhbmUsIGNoYW5nZWQsIGNhbmNlbGxlZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRSZXN0b3JlRm9jdXMoZXhwZWN0ZWRBY3RpdmVFbGVtZW50OiBFbGVtZW50IHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5sYXlvdXRTZXJ2aWNlLmlzUmVzdG9yZWQoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIHJlc3RvcmUgZm9jdXMgaWYgd2UgYXJlIG5vdCByZXN0b3JlZCB5ZXQgb24gc3RhcnR1cFxuXHRcdH1cblxuXHRcdGlmICghZXhwZWN0ZWRBY3RpdmVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gcmVzdG9yZSBmb2N1cyBpZiBub3RoaW5nIHdhcyBmb2N1c2VkXG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRpZiAoIWFjdGl2ZUVsZW1lbnQgfHwgYWN0aXZlRWxlbWVudCA9PT0gZXhwZWN0ZWRBY3RpdmVFbGVtZW50Lm93bmVyRG9jdW1lbnQuYm9keSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIHJlc3RvcmUgZm9jdXMgaWYgbm90aGluZyBpcyBmb2N1c2VkIGN1cnJlbnRseVxuXHRcdH1cblxuXHRcdGNvbnN0IHNhbWUgPSBleHBlY3RlZEFjdGl2ZUVsZW1lbnQgPT09IGFjdGl2ZUVsZW1lbnQ7XG5cdFx0aWYgKHNhbWUpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyByZXN0b3JlIGZvY3VzIGlmIHNhbWUgZWxlbWVudCBpcyBzdGlsbCBhY3RpdmVcblx0XHR9XG5cblx0XHRpZiAoIWlzRWRpdGFibGVFbGVtZW50KGFjdGl2ZUVsZW1lbnQpKSB7XG5cblx0XHRcdC8vIFRoaXMgaXMgdG8gYXZvaWQgcmVncmVzc2lvbnMgZnJvbSBub3QgcmVzdG9yaW5nIGZvY3VzIGFzIHdlIHVzZWQgdG86XG5cdFx0XHQvLyBPbmx5IGFsbG93IGEgZGlmZmVyZW50IGlucHV0IGVsZW1lbnQgKG9yIHRleHRhcmVhKSB0byByZW1haW4gZm9jdXNlZFxuXHRcdFx0Ly8gYnV0IG5vdCBvdGhlciBlbGVtZW50cyB0aGF0IGRvIG5vdCBhY2NlcHQgdGV4dCBpbnB1dC5cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGlzQW5jZXN0b3IoYWN0aXZlRWxlbWVudCwgdGhpcy5lZGl0b3JHcm91cFBhcmVudCkpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyByZXN0b3JlIGZvY3VzIGlmIGFjdGl2ZSBlbGVtZW50IGlzIHN0aWxsIGluc2lkZSBvdXIgZWRpdG9yIGdyb3VwXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlOyAvLyBkbyBub3QgcmVzdG9yZSBmb2N1c1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZGl0b3JQYW5lRGVzY3JpcHRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogSUVkaXRvclBhbmVEZXNjcmlwdG9yIHtcblx0XHRpZiAoZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVxdWlyZXNUcnVzdCkgJiYgIXRoaXMud29ya3NwYWNlVHJ1c3RTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHQvLyBXb3Jrc3BhY2UgdHJ1c3Q6IGlmIGFuIGVkaXRvciBzaWduYWxzIGl0IG5lZWRzIHdvcmtzcGFjZSB0cnVzdFxuXHRcdFx0Ly8gYnV0IHRoZSBjdXJyZW50IHdvcmtzcGFjZSBpcyB1bnRydXN0ZWQsIHdlIGZhbGxiYWNrIHRvIGEgZ2VuZXJpY1xuXHRcdFx0Ly8gZWRpdG9yIGRlc2NyaXB0b3IgdG8gaW5kaWNhdGUgdGhpcyBhbiBkbyBOT1QgbG9hZCB0aGUgcmVnaXN0ZXJlZFxuXHRcdFx0Ly8gZWRpdG9yLlxuXHRcdFx0cmV0dXJuIFdvcmtzcGFjZVRydXN0UmVxdWlyZWRQbGFjZWhvbGRlckVkaXRvci5ERVNDUklQVE9SO1xuXHRcdH1cblxuXHRcdHJldHVybiBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmVkaXRvclBhbmVzUmVnaXN0cnkuZ2V0RWRpdG9yUGFuZShlZGl0b3IpKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TaG93RWRpdG9yUGFuZShkZXNjcmlwdG9yOiBJRWRpdG9yUGFuZURlc2NyaXB0b3IpOiBFZGl0b3JQYW5lIHtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB0aGUgY3VycmVudGx5IGFjdGl2ZSBlZGl0b3IgcGFuZSBjYW4gaGFuZGxlIHRoZSBpbnB1dFxuXHRcdGlmICh0aGlzLl9hY3RpdmVFZGl0b3JQYW5lICYmIGRlc2NyaXB0b3IuZGVzY3JpYmVzKHRoaXMuX2FjdGl2ZUVkaXRvclBhbmUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlRWRpdG9yUGFuZTtcblx0XHR9XG5cblx0XHQvLyBIaWRlIGFjdGl2ZSBvbmUgZmlyc3Rcblx0XHR0aGlzLmRvSGlkZUFjdGl2ZUVkaXRvclBhbmUoKTtcblxuXHRcdC8vIENyZWF0ZSBlZGl0b3IgcGFuZVxuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSB0aGlzLmRvQ3JlYXRlRWRpdG9yUGFuZShkZXNjcmlwdG9yKTtcblxuXHRcdC8vIFNldCBlZGl0b3IgYXMgYWN0aXZlXG5cdFx0dGhpcy5kb1NldEFjdGl2ZUVkaXRvclBhbmUoZWRpdG9yUGFuZSk7XG5cblx0XHQvLyBTaG93IGVkaXRvclxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKGVkaXRvclBhbmUuZ2V0Q29udGFpbmVyKCkpO1xuXHRcdHRoaXMuZWRpdG9yUGFuZXNQYXJlbnQuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRzaG93KGNvbnRhaW5lcik7XG5cblx0XHQvLyBJbmRpY2F0ZSB0byBlZGl0b3IgdGhhdCBpdCBpcyBub3cgdmlzaWJsZVxuXHRcdGVkaXRvclBhbmUuc2V0VmlzaWJsZSh0cnVlKTtcblxuXHRcdC8vIExheW91dFxuXHRcdGlmICh0aGlzLnBhZ2VQb3NpdGlvbikge1xuXHRcdFx0ZWRpdG9yUGFuZS5sYXlvdXQobmV3IERpbWVuc2lvbih0aGlzLnBhZ2VQb3NpdGlvbi53aWR0aCwgdGhpcy5wYWdlUG9zaXRpb24uaGVpZ2h0KSwgeyB0b3A6IHRoaXMucGFnZVBvc2l0aW9uLnRvcCwgbGVmdDogdGhpcy5wYWdlUG9zaXRpb24ubGVmdCB9KTtcblx0XHR9XG5cblx0XHQvLyBCb3VuZGFyeSBzYXNoZXNcblx0XHRpZiAodGhpcy5ib3VuZGFyeVNhc2hlcykge1xuXHRcdFx0ZWRpdG9yUGFuZS5zZXRCb3VuZGFyeVNhc2hlcyh0aGlzLmJvdW5kYXJ5U2FzaGVzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yUGFuZTtcblx0fVxuXG5cdHByaXZhdGUgZG9DcmVhdGVFZGl0b3JQYW5lKGRlc2NyaXB0b3I6IElFZGl0b3JQYW5lRGVzY3JpcHRvcik6IEVkaXRvclBhbmUge1xuXG5cdFx0Ly8gSW5zdGFudGlhdGUgZWRpdG9yXG5cdFx0Y29uc3QgZWRpdG9yUGFuZSA9IHRoaXMuZG9JbnN0YW50aWF0ZUVkaXRvclBhbmUoZGVzY3JpcHRvcik7XG5cblx0XHQvLyBDcmVhdGUgZWRpdG9yIGNvbnRhaW5lciBhcyBuZWVkZWRcblx0XHRpZiAoIWVkaXRvclBhbmUuZ2V0Q29udGFpbmVyKCkpIHtcblx0XHRcdGNvbnN0IGVkaXRvclBhbmVDb250YWluZXIgPSAkKCcuZWRpdG9yLWluc3RhbmNlJyk7XG5cblx0XHRcdC8vIEl0IGlzIGNydWljaWFsIHRvIGFwcGVuZCB0aGUgY29udGFpbmVyIHRvIGl0cyBwYXJlbnQgYmVmb3JlXG5cdFx0XHQvLyBwYXNzaW5nIG9uIHRvIHRoZSBjcmVhdGUoKSBtZXRob2Qgb2YgdGhlIHBhbmUgc28gdGhhdCB0aGVcblx0XHRcdC8vIHJpZ2h0IGB3aW5kb3dgIGNhbiBiZSBkZXRlcm1pbmVkIGluIGZsb2F0aW5nIHdpbmRvdyBjYXNlcy5cblx0XHRcdHRoaXMuZWRpdG9yUGFuZXNQYXJlbnQuYXBwZW5kQ2hpbGQoZWRpdG9yUGFuZUNvbnRhaW5lcik7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGVkaXRvclBhbmUuY3JlYXRlKGVkaXRvclBhbmVDb250YWluZXIpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0XHQvLyBBdCB0aGlzIHBvaW50IHRoZSBlZGl0b3IgcGFuZSBjb250YWluZXIgaXMgbm90IGhlYWx0aHlcblx0XHRcdFx0Ly8gYW5kIGFzIHN1Y2gsIHdlIHJlbW92ZSBpdCBmcm9tIHRoZSBwYW5lIHBhcmVudCBhbmQgaGlkZVxuXHRcdFx0XHQvLyBpdCBzbyB0aGF0IHdlIGhhdmUgYSBjaGFuY2UgdG8gc2hvdyBhbiBlcnJvciBwbGFjZWhvbGRlci5cblx0XHRcdFx0Ly8gTm90IGRvaW5nIHNvIHdvdWxkIHJlc3VsdCBpbiBtdWx0aXBsZSBgLmVkaXRvci1pbnN0YW5jZWBcblx0XHRcdFx0Ly8gbGluZ2VyaW5nIGFyb3VuZCBpbiB0aGUgRE9NLlxuXG5cdFx0XHRcdGVkaXRvclBhbmVDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRcdGhpZGUoZWRpdG9yUGFuZUNvbnRhaW5lcik7XG5cblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvclBhbmU7XG5cdH1cblxuXHRwcml2YXRlIGRvSW5zdGFudGlhdGVFZGl0b3JQYW5lKGRlc2NyaXB0b3I6IElFZGl0b3JQYW5lRGVzY3JpcHRvcik6IEVkaXRvclBhbmUge1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIGFscmVhZHkgaW5zdGFudGlhdGVkXG5cdFx0Y29uc3QgZXhpc3RpbmdFZGl0b3JQYW5lID0gdGhpcy5lZGl0b3JQYW5lcy5maW5kKGVkaXRvclBhbmUgPT4gZGVzY3JpcHRvci5kZXNjcmliZXMoZWRpdG9yUGFuZSkpO1xuXHRcdGlmIChleGlzdGluZ0VkaXRvclBhbmUpIHtcblx0XHRcdHJldHVybiBleGlzdGluZ0VkaXRvclBhbmU7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIGluc3RhbnRpYXRlIG5ld1xuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSB0aGlzLl9yZWdpc3RlcihkZXNjcmlwdG9yLmluc3RhbnRpYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuZ3JvdXBWaWV3KSk7XG5cdFx0dGhpcy5lZGl0b3JQYW5lcy5wdXNoKGVkaXRvclBhbmUpO1xuXG5cdFx0cmV0dXJuIGVkaXRvclBhbmU7XG5cdH1cblxuXHRwcml2YXRlIGRvU2V0QWN0aXZlRWRpdG9yUGFuZShlZGl0b3JQYW5lOiBFZGl0b3JQYW5lIHwgbnVsbCkge1xuXHRcdHRoaXMuX2FjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JQYW5lO1xuXG5cdFx0Ly8gQ2xlYXIgb3V0IHByZXZpb3VzIGFjdGl2ZSBlZGl0b3IgcGFuZSBsaXN0ZW5lcnNcblx0XHR0aGlzLmFjdGl2ZUVkaXRvclBhbmVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGVkaXRvciBwYW5lIGNoYW5nZXNcblx0XHRpZiAoZWRpdG9yUGFuZSkge1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JQYW5lRGlzcG9zYWJsZXMuYWRkKGVkaXRvclBhbmUub25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMoZSA9PiB0aGlzLl9vbkRpZENoYW5nZVNpemVDb25zdHJhaW50cy5maXJlKGUpKSk7XG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvclBhbmVEaXNwb3NhYmxlcy5hZGQoZWRpdG9yUGFuZS5vbkRpZEZvY3VzKCgpID0+IHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5kaWNhdGUgdGhhdCBzaXplIGNvbnN0cmFpbnRzIGNvdWxkIGhhdmUgY2hhbmdlZCBkdWUgdG8gbmV3IGVkaXRvclxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzLmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TZXRJbnB1dChlZGl0b3JQYW5lOiBFZGl0b3JQYW5lLCBlZGl0b3I6IEVkaXRvcklucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0KTogUHJvbWlzZTx7IGNoYW5nZWQ6IGJvb2xlYW47IGNhbmNlbGxlZDogYm9vbGVhbiB9PiB7XG5cblx0XHQvLyBJZiB0aGUgaW5wdXQgZGlkIG5vdCBjaGFuZ2UsIHJldHVybiBlYXJseSBhbmQgb25seVxuXHRcdC8vIGFwcGx5IHRoZSBvcHRpb25zIHVubGVzcyB0aGUgb3B0aW9ucyBpbnN0cnVjdCB1cyB0b1xuXHRcdC8vIGZvcmNlIG9wZW4gaXQgZXZlbiBpZiBpdCBpcyB0aGUgc2FtZVxuXHRcdGxldCBpbnB1dE1hdGNoZXMgPSBlZGl0b3JQYW5lLmlucHV0Py5tYXRjaGVzKGVkaXRvcik7XG5cdFx0aWYgKGlucHV0TWF0Y2hlcyAmJiAhb3B0aW9ucz8uZm9yY2VSZWxvYWQpIHtcblxuXHRcdFx0Ly8gV2UgaGF2ZSB0byBhd2FpdCBhIHBlbmRpbmcgYHNldElucHV0KClgIGNhbGwgZm9yIHRoaXNcblx0XHRcdC8vIHBhbmUgYmVmb3JlIHdlIGNhbiBjYWxsIGludG8gYHNldE9wdGlvbnMoKWAsIG90aGVyd2lzZVxuXHRcdFx0Ly8gd2UgcmlzayBjYWxsaW5nIHdoZW4gdGhlIGlucHV0IGlzIG5vdCB5ZXQgZnVsbHkgYXBwbGllZC5cblx0XHRcdGlmICh0aGlzLm1hcEVkaXRvclBhbmVUb1BlbmRpbmdTZXRJbnB1dC5oYXMoZWRpdG9yUGFuZSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5tYXBFZGl0b3JQYW5lVG9QZW5kaW5nU2V0SW5wdXQuZ2V0KGVkaXRvclBhbmUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdCB0aGlzIHBvaW50LCB0aGUgaW5wdXQgbWlnaHQgaGF2ZSBjaGFuZ2VkLCBzbyB3ZSBjaGVjayBhZ2FpblxuXHRcdFx0aW5wdXRNYXRjaGVzID0gZWRpdG9yUGFuZS5pbnB1dD8ubWF0Y2hlcyhlZGl0b3IpO1xuXHRcdFx0aWYgKGlucHV0TWF0Y2hlcykge1xuXHRcdFx0XHRlZGl0b3JQYW5lLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGNoYW5nZWQ6IGZhbHNlLCBjYW5jZWxsZWQ6ICFpbnB1dE1hdGNoZXMgfTtcblx0XHR9XG5cblx0XHQvLyBTdGFydCBhIG5ldyBlZGl0b3IgaW5wdXQgb3BlcmF0aW9uIHRvIHJlcG9ydCBwcm9ncmVzc1xuXHRcdC8vIGFuZCB0byBzdXBwb3J0IGNhbmNlbGxhdGlvbi4gQW55IG5ldyBvcGVyYXRpb24gdGhhdCBpc1xuXHRcdC8vIHN0YXJ0ZWQgd2lsbCBjYW5jZWwgdGhlIHByZXZpb3VzIG9uZS5cblx0XHRjb25zdCBvcGVyYXRpb24gPSB0aGlzLmVkaXRvck9wZXJhdGlvbi5zdGFydCh0aGlzLmxheW91dFNlcnZpY2UuaXNSZXN0b3JlZCgpID8gODAwIDogMzIwMCk7XG5cblx0XHRsZXQgY2FuY2VsbGVkID0gZmFsc2U7XG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gQ2xlYXIgdGhlIGN1cnJlbnQgaW5wdXQgYmVmb3JlIHNldHRpbmcgbmV3IGlucHV0XG5cdFx0XHQvLyBUaGlzIGVuc3VyZXMgdGhhdCBhIHNsb3cgbG9hZGluZyBpbnB1dCB3aWxsIG5vdFxuXHRcdFx0Ly8gYmUgdmlzaWJsZSBmb3IgdGhlIGR1cmF0aW9uIG9mIHRoZSBuZXcgaW5wdXQgdG9cblx0XHRcdC8vIGxvYWQgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zNDY5Nylcblx0XHRcdGVkaXRvclBhbmUuY2xlYXJJbnB1dCgpO1xuXG5cdFx0XHQvLyBTZXQgdGhlIGlucHV0IHRvIHRoZSBlZGl0b3IgcGFuZSBhbmQga2VlcCB0cmFjayBvZiBpdFxuXHRcdFx0Y29uc3QgcGVuZGluZ1NldElucHV0ID0gZWRpdG9yUGFuZS5zZXRJbnB1dChlZGl0b3IsIG9wdGlvbnMsIGNvbnRleHQsIG9wZXJhdGlvbi50b2tlbik7XG5cdFx0XHR0aGlzLm1hcEVkaXRvclBhbmVUb1BlbmRpbmdTZXRJbnB1dC5zZXQoZWRpdG9yUGFuZSwgcGVuZGluZ1NldElucHV0KTtcblx0XHRcdGF3YWl0IHBlbmRpbmdTZXRJbnB1dDtcblxuXHRcdFx0aWYgKCFvcGVyYXRpb24uaXNDdXJyZW50KCkpIHtcblx0XHRcdFx0Y2FuY2VsbGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCFvcGVyYXRpb24uaXNDdXJyZW50KCkpIHtcblx0XHRcdFx0Y2FuY2VsbGVkID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAob3BlcmF0aW9uLmlzQ3VycmVudCgpKSB7XG5cdFx0XHRcdHRoaXMubWFwRWRpdG9yUGFuZVRvUGVuZGluZ1NldElucHV0LmRlbGV0ZShlZGl0b3JQYW5lKTtcblx0XHRcdH1cblx0XHRcdG9wZXJhdGlvbi5zdG9wKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgY2hhbmdlZDogIWlucHV0TWF0Y2hlcywgY2FuY2VsbGVkIH07XG5cdH1cblxuXHRwcml2YXRlIGRvSGlkZUFjdGl2ZUVkaXRvclBhbmUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3RvcCBhbnkgcnVubmluZyBvcGVyYXRpb25cblx0XHR0aGlzLmVkaXRvck9wZXJhdGlvbi5zdG9wKCk7XG5cblx0XHQvLyBJbmRpY2F0ZSB0byBlZGl0b3IgcGFuZSBiZWZvcmUgcmVtb3ZpbmcgdGhlIGVkaXRvciBmcm9tXG5cdFx0Ly8gdGhlIERPTSB0byBnaXZlIGEgY2hhbmNlIHRvIHBlcnNpc3QgY2VydGFpbiBzdGF0ZSB0aGF0XG5cdFx0Ly8gbWlnaHQgZGVwZW5kIG9uIHN0aWxsIGJlaW5nIHRoZSBhY3RpdmUgRE9NIGVsZW1lbnQuXG5cdFx0dGhpcy5zYWZlUnVuKCgpID0+IHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/LmNsZWFySW5wdXQoKSk7XG5cdFx0dGhpcy5zYWZlUnVuKCgpID0+IHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/LnNldFZpc2libGUoZmFsc2UpKTtcblxuXHRcdC8vIENsZWFyIGFueSBwZW5kaW5nIHNldElucHV0IHByb21pc2Vcblx0XHR0aGlzLm1hcEVkaXRvclBhbmVUb1BlbmRpbmdTZXRJbnB1dC5kZWxldGUodGhpcy5fYWN0aXZlRWRpdG9yUGFuZSk7XG5cblx0XHQvLyBSZW1vdmUgZWRpdG9yIHBhbmUgZnJvbSBwYXJlbnRcblx0XHRjb25zdCBlZGl0b3JQYW5lQ29udGFpbmVyID0gdGhpcy5fYWN0aXZlRWRpdG9yUGFuZS5nZXRDb250YWluZXIoKTtcblx0XHRpZiAoZWRpdG9yUGFuZUNvbnRhaW5lcikge1xuXHRcdFx0ZWRpdG9yUGFuZUNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdGhpZGUoZWRpdG9yUGFuZUNvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgYWN0aXZlIGVkaXRvciBwYW5lXG5cdFx0dGhpcy5kb1NldEFjdGl2ZUVkaXRvclBhbmUobnVsbCk7XG5cdH1cblxuXHRjbG9zZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/LmlucHV0ICYmIGVkaXRvci5tYXRjaGVzKHRoaXMuX2FjdGl2ZUVkaXRvclBhbmUuaW5wdXQpKSB7XG5cdFx0XHR0aGlzLmRvSGlkZUFjdGl2ZUVkaXRvclBhbmUoKTtcblx0XHR9XG5cdH1cblxuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnNhZmVSdW4oKCkgPT4gdGhpcy5fYWN0aXZlRWRpdG9yUGFuZT8uc2V0VmlzaWJsZSh2aXNpYmxlKSk7XG5cdH1cblxuXHRsYXlvdXQocGFnZVBvc2l0aW9uOiBJRG9tTm9kZVBhZ2VQb3NpdGlvbik6IHZvaWQge1xuXHRcdHRoaXMucGFnZVBvc2l0aW9uID0gcGFnZVBvc2l0aW9uO1xuXG5cdFx0dGhpcy5zYWZlUnVuKCgpID0+IHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/LmxheW91dChuZXcgRGltZW5zaW9uKHBhZ2VQb3NpdGlvbi53aWR0aCwgcGFnZVBvc2l0aW9uLmhlaWdodCksIHBhZ2VQb3NpdGlvbikpO1xuXHR9XG5cblx0c2V0Qm91bmRhcnlTYXNoZXMoc2FzaGVzOiBJQm91bmRhcnlTYXNoZXMpOiB2b2lkIHtcblx0XHR0aGlzLmJvdW5kYXJ5U2FzaGVzID0gc2FzaGVzO1xuXG5cdFx0dGhpcy5zYWZlUnVuKCgpID0+IHRoaXMuX2FjdGl2ZUVkaXRvclBhbmU/LnNldEJvdW5kYXJ5U2FzaGVzKHNhc2hlcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBzYWZlUnVuKGZuOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cblx0XHQvLyBXZSBkZWxlZ2F0ZSBtYW55IGNhbGxzIHRvIHRoZSBhY3RpdmUgZWRpdG9yIHBhbmUgd2hpY2hcblx0XHQvLyBjYW4gYmUgYW55IGtpbmQgb2YgZWRpdG9yLiBXZSBtdXN0IGVuc3VyZSB0aGF0IG91ciBjYWxsc1xuXHRcdC8vIGRvIG5vdCB0aHJvdywgZm9yIGV4YW1wbGUgaW4gYGxheW91dCgpYCBiZWNhdXNlIHRoYXQgY2FuXG5cdFx0Ly8gbWVzcyB3aXRoIHRoZSBncmlkIGxheW91dC5cblxuXHRcdHRyeSB7XG5cdFx0XHRmbigpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGVBQWU7QUFDeEIsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxrQkFBa0IseUJBQWlFLHlCQUF5QjtBQUVySCxTQUFTLFdBQVcsTUFBTSxNQUE0QixZQUFZLGtCQUFrQixlQUFlLG1CQUFtQixTQUFTO0FBQy9ILFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCLDRCQUE0QjtBQUM3RCxTQUEyQiwrQkFBK0IscUNBQWlFO0FBQzNILFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsd0JBQXdELCtDQUErQztBQUNoSCxTQUFTLHdCQUF3QztBQUNqRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUEwRDtBQUVuRSxTQUFTLG9CQUFvQjtBQW9DdEIsSUFBTSxjQUFOLGNBQTBCLFdBQVc7QUFBQSxFQStCM0MsWUFDa0IsbUJBQ0EsbUJBQ0EsV0FDeUIsZUFDRixzQkFDaEIsdUJBQzJCLHVCQUNyQixZQUNHLGVBQ0YsYUFDOUI7QUFDRCxVQUFNO0FBWFc7QUFDQTtBQUNBO0FBQ3lCO0FBQ0Y7QUFFVztBQUNyQjtBQUNHO0FBQ0Y7QUFyQ2hDO0FBQUEsU0FBaUIsY0FBYyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDakUsU0FBUyxhQUFhLEtBQUssWUFBWTtBQUV2QyxTQUFRLDhCQUE4QixLQUFLLFVBQVUsSUFBSSxRQUF1RCxDQUFDO0FBQ2pILFNBQVMs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
