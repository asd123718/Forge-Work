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
import "./media/chatEditingEditorOverlay.css";
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, derived, derivedOpts, observableFromEvent, observableSignalFromEvent, observableValue, transaction } from "../../../../../base/common/observable.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IChatEditingService, ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { ActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { $, addDisposableGenericMouseMoveListener, append } from "../../../../../base/browser/dom.js";
import { assertType } from "../../../../../base/common/types.js";
import { localize } from "../../../../../nls.js";
import { AcceptAction, navigationBearingFakeActionId, RejectAction } from "./chatEditingEditorActions.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { EditorGroupView } from "../../../../browser/parts/editor/editorGroupView.js";
import { Event } from "../../../../../base/common/event.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../common/editor.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { getCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
class ChatEditingAcceptRejectActionViewItem extends ActionViewItem {
  constructor(action, options, _entry, _editor, _keybindingService, _primaryActionIds = [AcceptAction.ID]) {
    super(void 0, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
    this._entry = _entry;
    this._editor = _editor;
    this._keybindingService = _keybindingService;
    this._primaryActionIds = _primaryActionIds;
    this._reveal = this._store.add(new MutableDisposable());
  }
  render(container) {
    super.render(container);
    if (this._primaryActionIds.includes(this._action.id)) {
      this.element?.classList.add("primary");
    }
    if (this._action.id === AcceptAction.ID) {
      const listener = this._store.add(new MutableDisposable());
      this._store.add(autorun((r) => {
        assertType(this.label);
        assertType(this.element);
        const ctrl = this._entry.read(r)?.autoAcceptController.read(r);
        if (ctrl) {
          const ratio = -100 * (ctrl.remaining / ctrl.total);
          this.element.style.setProperty("--vscode-action-item-auto-timeout", `${ratio}%`);
          this.element.classList.toggle("auto", true);
          listener.value = addDisposableGenericMouseMoveListener(this.element, () => ctrl.cancel());
        } else {
          this.element.classList.toggle("auto", false);
          listener.clear();
        }
      }));
    }
  }
  set actionRunner(actionRunner) {
    super.actionRunner = actionRunner;
    if (this._editor) {
      this._reveal.value = actionRunner.onWillRun((_e) => {
        this._editor.focus();
      });
    }
  }
  get actionRunner() {
    return super.actionRunner;
  }
  getTooltip() {
    const value = super.getTooltip();
    if (!value) {
      return value;
    }
    return this._keybindingService.appendKeybinding(value, this._action.id);
  }
}
let ChatEditorOverlayWidget = class extends Disposable {
  constructor(_editor, _keybindingService, _instaService) {
    super();
    this._editor = _editor;
    this._keybindingService = _keybindingService;
    this._instaService = _instaService;
    this._showStore = this._store.add(new DisposableStore());
    this._session = observableValue(this, void 0);
    this._entry = observableValue(this, void 0);
    this._navigationBearings = observableValue(this, { changeCount: -1, activeIdx: -1, entriesCount: -1 });
    this._domNode = document.createElement("div");
    this._domNode.classList.add("chat-editor-overlay-widget");
    this._isBusy = derived((r) => {
      const entry = this._entry.read(r);
      return entry?.waitsForLastEdits.read(r);
    });
    const progressNode = document.createElement("div");
    progressNode.classList.add("chat-editor-overlay-progress");
    append(progressNode, renderIcon(ThemeIcon.modify(Codicon.loading, "spin")));
    const textProgress = append(progressNode, $("span.progress-message"));
    this._domNode.appendChild(progressNode);
    this._store.add(autorun((r) => {
      const busy = this._isBusy.read(r);
      this._domNode.classList.toggle("busy", busy);
      textProgress.innerText = "";
    }));
    this._toolbarNode = document.createElement("div");
    this._toolbarNode.classList.add("chat-editor-overlay-toolbar");
  }
  dispose() {
    this.hide();
    super.dispose();
  }
  getDomNode() {
    return this._domNode;
  }
  show(session, entry, indicies) {
    this._showStore.clear();
    transaction((tx) => {
      this._session.set(session, tx);
      this._entry.set(entry, tx);
    });
    this._showStore.add(autorun((r) => {
      const entryIndex = indicies.entryIndex.read(r);
      const changeIndex = indicies.changeIndex.read(r);
      const entries = session.entries.read(r);
      let activeIdx = entryIndex !== void 0 && changeIndex !== void 0 ? changeIndex : -1;
      let totalChangesCount = 0;
      for (let i = 0; i < entries.length; i++) {
        const changesCount = entries[i].changesCount.read(r);
        totalChangesCount += changesCount;
        if (entryIndex !== void 0 && i < entryIndex) {
          activeIdx += changesCount;
        }
      }
      this._navigationBearings.set({ changeCount: totalChangesCount, activeIdx, entriesCount: entries.length }, void 0);
    }));
    this._domNode.appendChild(this._toolbarNode);
    this._showStore.add(toDisposable(() => this._toolbarNode.remove()));
    this._showStore.add(this._instaService.createInstance(MenuWorkbenchToolBar, this._toolbarNode, MenuId.ChatEditingEditorContent, {
      telemetrySource: "chatEditor.overlayToolbar",
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      toolbarOptions: {
        primaryGroup: () => true,
        useSeparatorsInPrimaryActions: true
      },
      menuOptions: { renderShortTitle: true },
      actionViewItemProvider: (action, options) => {
        const that = this;
        if (action.id === navigationBearingFakeActionId) {
          return new class extends ActionViewItem {
            constructor() {
              super(void 0, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
            }
            render(container) {
              super.render(container);
              container.classList.add("label-item");
              this._store.add(autorun((r) => {
                assertType(this.label);
                const { changeCount, activeIdx } = that._navigationBearings.read(r);
                if (changeCount > 0) {
                  const n = activeIdx === -1 ? "1" : `${activeIdx + 1}`;
                  this.label.innerText = localize("nOfM", "{0} of {1}", n, changeCount);
                } else {
                  this.label.innerText = localize("0Of0", "\u2014");
                }
                this.updateTooltip();
              }));
            }
            getTooltip() {
              const { changeCount, entriesCount } = that._navigationBearings.get();
              if (changeCount === -1 || entriesCount === -1) {
                return void 0;
              }
              let result;
              if (changeCount === 1 && entriesCount === 1) {
                result = localize("tooltip_11", "1 change in 1 file");
              } else if (changeCount === 1) {
                result = localize("tooltip_1n", "1 change in {0} files", entriesCount);
              } else if (entriesCount === 1) {
                result = localize("tooltip_n1", "{0} changes in 1 file", changeCount);
              } else {
                result = localize("tooltip_nm", "{0} changes in {1} files", changeCount, entriesCount);
              }
              if (!that._isBusy.get()) {
                return result;
              }
              return localize("tooltip_busy", "{0} - Working...", result);
            }
          }();
        }
        if (action.id === AcceptAction.ID || action.id === RejectAction.ID) {
          return new ChatEditingAcceptRejectActionViewItem(action, options, that._entry, that._editor, that._keybindingService);
        }
        return void 0;
      }
    }));
  }
  hide() {
    transaction((tx) => {
      this._session.set(void 0, tx);
      this._entry.set(void 0, tx);
      this._navigationBearings.set({ changeCount: -1, activeIdx: -1, entriesCount: -1 }, tx);
    });
    this._showStore.clear();
  }
};
ChatEditorOverlayWidget = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IInstantiationService)
], ChatEditorOverlayWidget);
let ChatEditingOverlayController = class {
  constructor(container, group, instaService, chatEditingService) {
    this._store = new DisposableStore();
    this._domNode = document.createElement("div");
    this._domNode.classList.add("chat-editing-editor-overlay");
    this._domNode.style.position = "absolute";
    this._domNode.style.bottom = `24px`;
    this._domNode.style.right = `24px`;
    this._domNode.style.zIndex = `100`;
    const widget = instaService.createInstance(ChatEditorOverlayWidget, group);
    this._domNode.appendChild(widget.getDomNode());
    this._store.add(toDisposable(() => this._domNode.remove()));
    this._store.add(widget);
    const show = () => {
      if (!container.contains(this._domNode)) {
        container.appendChild(this._domNode);
      }
    };
    const hide = () => {
      if (container.contains(this._domNode)) {
        widget.hide();
        this._domNode.remove();
      }
    };
    const activeEditorSignal = observableSignalFromEvent(this, Event.any(group.onDidActiveEditorChange, group.onDidModelChange));
    const activeUriObs = derivedOpts({ equalsFn: isEqual }, (r) => {
      activeEditorSignal.read(r);
      const editor = group.activeEditorPane;
      if (!getCodeEditor(editor?.getControl())) {
        return void 0;
      }
      const uri = EditorResourceAccessor.getOriginalUri(editor?.input, { supportSideBySide: SideBySideEditor.PRIMARY });
      return uri;
    });
    const sessionAndEntry = derived((r) => {
      activeEditorSignal.read(r);
      const uri = activeUriObs.read(r);
      if (!uri) {
        return void 0;
      }
      for (const session of chatEditingService.editingSessionsObs.read(r)) {
        if (!session.isGlobalEditingSession) {
          continue;
        }
        const entry = session.readEntry(uri, r);
        if (entry) {
          return { session, entry };
        }
      }
      return void 0;
    });
    this._store.add(autorun((r) => {
      const data = sessionAndEntry.read(r);
      if (!data) {
        hide();
        return;
      }
      const { session, entry } = data;
      if (entry?.state.read(r) === ModifiedFileEntryState.Modified) {
        const editorPane = group.activeEditorPane;
        assertType(editorPane);
        const changeIndex = derived((r2) => entry ? entry.getEditorIntegration(editorPane).currentIndex.read(r2) : 0);
        const entryIndex = derived(
          (r2) => entry ? session.entries.read(r2).indexOf(entry) : 0
        );
        widget.show(session, entry, { entryIndex, changeIndex });
        show();
      } else {
        hide();
      }
    }));
  }
  dispose() {
    this._store.dispose();
  }
};
ChatEditingOverlayController = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IChatEditingService)
], ChatEditingOverlayController);
let ChatEditingEditorOverlay = class {
  constructor(editorGroupsService, instantiationService, environmentService) {
    this._store = new DisposableStore();
    const editorGroups = observableFromEvent(
      this,
      Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup),
      () => editorGroupsService.groups
    );
    const overlayWidgets = this._store.add(new DisposableMap());
    this._store.add(autorun((r) => {
      if (environmentService.isSessionsWindow) {
        return;
      }
      const toDelete = new Set(overlayWidgets.keys());
      const groups = editorGroups.read(r);
      for (const group of groups) {
        if (!(group instanceof EditorGroupView)) {
          continue;
        }
        toDelete.delete(group);
        if (!overlayWidgets.has(group)) {
          const scopedInstaService = instantiationService.createChild(
            new ServiceCollection([IContextKeyService, group.scopedContextKeyService])
          );
          const container = group.element;
          const ctrl = scopedInstaService.createInstance(ChatEditingOverlayController, container, group);
          overlayWidgets.set(group, combinedDisposable(ctrl, scopedInstaService));
        }
      }
      for (const group of toDelete) {
        overlayWidgets.deleteAndDispose(group);
      }
    }));
  }
  dispose() {
    this._store.dispose();
  }
};
ChatEditingEditorOverlay.ID = "chat.edits.editorOverlay";
ChatEditingEditorOverlay = __decorateClass([
  __decorateParam(0, IEditorGroupsService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IWorkbenchEnvironmentService)
], ChatEditingEditorOverlay);
export {
  ChatEditingAcceptRejectActionViewItem,
  ChatEditingEditorOverlay
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ0VkaXRvck92ZXJsYXkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdEVkaXRpbmdFZGl0b3JPdmVybGF5LmNzcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ1NlcnZpY2UsIElDaGF0RWRpdGluZ1Nlc3Npb24sIElNb2RpZmllZEZpbGVFbnRyeSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgSUFjdGlvblJ1bm5lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZU1vdmVMaXN0ZW5lciwgYXBwZW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWNjZXB0QWN0aW9uLCBuYXZpZ2F0aW9uQmVhcmluZ0Zha2VBY3Rpb25JZCwgUmVqZWN0QWN0aW9uIH0gZnJvbSAnLi9jaGF0RWRpdGluZ0VkaXRvckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yR3JvdXBWaWV3LmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRpbmdBY2NlcHRSZWplY3RBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXZlYWwgPSB0aGlzLl9zdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VudHJ5OiBJT2JzZXJ2YWJsZTxJTW9kaWZpZWRGaWxlRW50cnkgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogeyBmb2N1cygpOiB2b2lkIH0gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcmltYXJ5QWN0aW9uSWRzOiByZWFkb25seSBzdHJpbmdbXSA9IFtBY2NlcHRBY3Rpb24uSURdLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBpY29uOiBmYWxzZSwgbGFiZWw6IHRydWUsIGtleWJpbmRpbmdOb3RSZW5kZXJlZFdpdGhMYWJlbDogdHJ1ZSB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRpZiAodGhpcy5fcHJpbWFyeUFjdGlvbklkcy5pbmNsdWRlcyh0aGlzLl9hY3Rpb24uaWQpKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoJ3ByaW1hcnknKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fYWN0aW9uLmlkID09PSBBY2NlcHRBY3Rpb24uSUQpIHtcblxuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLl9zdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblxuXHRcdFx0XHRhc3NlcnRUeXBlKHRoaXMubGFiZWwpO1xuXHRcdFx0XHRhc3NlcnRUeXBlKHRoaXMuZWxlbWVudCk7XG5cblx0XHRcdFx0Y29uc3QgY3RybCA9IHRoaXMuX2VudHJ5LnJlYWQocik/LmF1dG9BY2NlcHRDb250cm9sbGVyLnJlYWQocik7XG5cdFx0XHRcdGlmIChjdHJsKSB7XG5cblx0XHRcdFx0XHRjb25zdCByYXRpbyA9IC0xMDAgKiAoY3RybC5yZW1haW5pbmcgLyBjdHJsLnRvdGFsKTtcblxuXHRcdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtYWN0aW9uLWl0ZW0tYXV0by10aW1lb3V0JywgYCR7cmF0aW99JWApO1xuXG5cdFx0XHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2F1dG8nLCB0cnVlKTtcblx0XHRcdFx0XHRsaXN0ZW5lci52YWx1ZSA9IGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VNb3ZlTGlzdGVuZXIodGhpcy5lbGVtZW50LCAoKSA9PiBjdHJsLmNhbmNlbCgpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnYXV0bycsIGZhbHNlKTtcblx0XHRcdFx0XHRsaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2V0IGFjdGlvblJ1bm5lcihhY3Rpb25SdW5uZXI6IElBY3Rpb25SdW5uZXIpIHtcblx0XHRzdXBlci5hY3Rpb25SdW5uZXIgPSBhY3Rpb25SdW5uZXI7XG5cdFx0aWYgKHRoaXMuX2VkaXRvcikge1xuXHRcdFx0dGhpcy5fcmV2ZWFsLnZhbHVlID0gYWN0aW9uUnVubmVyLm9uV2lsbFJ1bihfZSA9PiB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvciEuZm9jdXMoKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGdldCBhY3Rpb25SdW5uZXIoKTogSUFjdGlvblJ1bm5lciB7XG5cdFx0cmV0dXJuIHN1cGVyLmFjdGlvblJ1bm5lcjtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSBzdXBlci5nZXRUb29sdGlwKCk7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyh2YWx1ZSwgdGhpcy5fYWN0aW9uLmlkKTtcblx0fVxufVxuXG5jbGFzcyBDaGF0RWRpdG9yT3ZlcmxheVdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sYmFyTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2hvd1N0b3JlID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdEVkaXRpbmdTZXNzaW9uIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyeSA9IG9ic2VydmFibGVWYWx1ZTxJTW9kaWZpZWRGaWxlRW50cnkgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzQnVzeTogSU9ic2VydmFibGU8Ym9vbGVhbiB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbmF2aWdhdGlvbkJlYXJpbmdzID0gb2JzZXJ2YWJsZVZhbHVlPHsgY2hhbmdlQ291bnQ6IG51bWJlcjsgYWN0aXZlSWR4OiBudW1iZXI7IGVudHJpZXNDb3VudDogbnVtYmVyIH0+KHRoaXMsIHsgY2hhbmdlQ291bnQ6IC0xLCBhY3RpdmVJZHg6IC0xLCBlbnRyaWVzQ291bnQ6IC0xIH0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogeyBmb2N1cygpOiB2b2lkIH0sXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC1lZGl0b3Itb3ZlcmxheS13aWRnZXQnKTtcblxuXHRcdHRoaXMuX2lzQnVzeSA9IGRlcml2ZWQociA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJ5LnJlYWQocik7XG5cdFx0XHRyZXR1cm4gZW50cnk/LndhaXRzRm9yTGFzdEVkaXRzLnJlYWQocik7XG5cdFx0fSk7XG5cblxuXHRcdGNvbnN0IHByb2dyZXNzTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHByb2dyZXNzTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LWVkaXRvci1vdmVybGF5LXByb2dyZXNzJyk7XG5cdFx0YXBwZW5kKHByb2dyZXNzTm9kZSwgcmVuZGVySWNvbihUaGVtZUljb24ubW9kaWZ5KENvZGljb24ubG9hZGluZywgJ3NwaW4nKSkpO1xuXHRcdGNvbnN0IHRleHRQcm9ncmVzcyA9IGFwcGVuZChwcm9ncmVzc05vZGUsICQoJ3NwYW4ucHJvZ3Jlc3MtbWVzc2FnZScpKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHByb2dyZXNzTm9kZSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IGJ1c3kgPSB0aGlzLl9pc0J1c3kucmVhZChyKTtcblxuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdidXN5JywgYnVzeSk7XG5cdFx0XHR0ZXh0UHJvZ3Jlc3MuaW5uZXJUZXh0ID0gJyc7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdG9vbGJhck5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl90b29sYmFyTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LWVkaXRvci1vdmVybGF5LXRvb2xiYXInKTtcblxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLmhpZGUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdHNob3coc2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgZW50cnk6IElNb2RpZmllZEZpbGVFbnRyeSB8IHVuZGVmaW5lZCwgaW5kaWNpZXM6IHsgZW50cnlJbmRleDogSU9ic2VydmFibGU8bnVtYmVyPjsgY2hhbmdlSW5kZXg6IElPYnNlcnZhYmxlPG51bWJlcj4gfSkge1xuXG5cdFx0dGhpcy5fc2hvd1N0b3JlLmNsZWFyKCk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uLnNldChzZXNzaW9uLCB0eCk7XG5cdFx0XHR0aGlzLl9lbnRyeS5zZXQoZW50cnksIHR4KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3Nob3dTdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblxuXHRcdFx0Y29uc3QgZW50cnlJbmRleCA9IGluZGljaWVzLmVudHJ5SW5kZXgucmVhZChyKTtcblx0XHRcdGNvbnN0IGNoYW5nZUluZGV4ID0gaW5kaWNpZXMuY2hhbmdlSW5kZXgucmVhZChyKTtcblxuXHRcdFx0Y29uc3QgZW50cmllcyA9IHNlc3Npb24uZW50cmllcy5yZWFkKHIpO1xuXG5cdFx0XHRsZXQgYWN0aXZlSWR4ID0gZW50cnlJbmRleCAhPT0gdW5kZWZpbmVkICYmIGNoYW5nZUluZGV4ICE9PSB1bmRlZmluZWRcblx0XHRcdFx0PyBjaGFuZ2VJbmRleFxuXHRcdFx0XHQ6IC0xO1xuXG5cdFx0XHRsZXQgdG90YWxDaGFuZ2VzQ291bnQgPSAwO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZXNDb3VudCA9IGVudHJpZXNbaV0uY2hhbmdlc0NvdW50LnJlYWQocik7XG5cdFx0XHRcdHRvdGFsQ2hhbmdlc0NvdW50ICs9IGNoYW5nZXNDb3VudDtcblxuXHRcdFx0XHRpZiAoZW50cnlJbmRleCAhPT0gdW5kZWZpbmVkICYmIGkgPCBlbnRyeUluZGV4KSB7XG5cdFx0XHRcdFx0YWN0aXZlSWR4ICs9IGNoYW5nZXNDb3VudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9uYXZpZ2F0aW9uQmVhcmluZ3Muc2V0KHsgY2hhbmdlQ291bnQ6IHRvdGFsQ2hhbmdlc0NvdW50LCBhY3RpdmVJZHgsIGVudHJpZXNDb3VudDogZW50cmllcy5sZW5ndGggfSwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fdG9vbGJhck5vZGUpO1xuXHRcdHRoaXMuX3Nob3dTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3Rvb2xiYXJOb2RlLnJlbW92ZSgpKSk7XG5cblx0XHR0aGlzLl9zaG93U3RvcmUuYWRkKHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5fdG9vbGJhck5vZGUsIE1lbnVJZC5DaGF0RWRpdGluZ0VkaXRvckNvbnRlbnQsIHtcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2NoYXRFZGl0b3Iub3ZlcmxheVRvb2xiYXInLFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHR1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9uczogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gbmF2aWdhdGlvbkJlYXJpbmdGYWtlQWN0aW9uSWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlLCBrZXliaW5kaW5nTm90UmVuZGVyZWRXaXRoTGFiZWw6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0XHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdsYWJlbC1pdGVtJyk7XG5cblx0XHRcdFx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0YXNzZXJ0VHlwZSh0aGlzLmxhYmVsKTtcblxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHsgY2hhbmdlQ291bnQsIGFjdGl2ZUlkeCB9ID0gdGhhdC5fbmF2aWdhdGlvbkJlYXJpbmdzLnJlYWQocik7XG5cblx0XHRcdFx0XHRcdFx0XHRpZiAoY2hhbmdlQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBuID0gYWN0aXZlSWR4ID09PSAtMSA/ICcxJyA6IGAke2FjdGl2ZUlkeCArIDF9YDtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubGFiZWwuaW5uZXJUZXh0ID0gbG9jYWxpemUoJ25PZk0nLCBcInswfSBvZiB7MX1cIiwgbiwgY2hhbmdlQ291bnQpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBhbGxvdy1hbnktdW5pY29kZS1uZXh0LWxpbmVcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubGFiZWwuaW5uZXJUZXh0ID0gbG9jYWxpemUoJzBPZjAnLCBcIlx1MjAxNFwiKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVRvb2x0aXAoKTtcblx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB7IGNoYW5nZUNvdW50LCBlbnRyaWVzQ291bnQgfSA9IHRoYXQuX25hdmlnYXRpb25CZWFyaW5ncy5nZXQoKTtcblx0XHRcdFx0XHRcdFx0aWYgKGNoYW5nZUNvdW50ID09PSAtMSB8fCBlbnRyaWVzQ291bnQgPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRsZXQgcmVzdWx0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdGlmIChjaGFuZ2VDb3VudCA9PT0gMSAmJiBlbnRyaWVzQ291bnQgPT09IDEpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHQgPSBsb2NhbGl6ZSgndG9vbHRpcF8xMScsIFwiMSBjaGFuZ2UgaW4gMSBmaWxlXCIpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGNoYW5nZUNvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0ID0gbG9jYWxpemUoJ3Rvb2x0aXBfMW4nLCBcIjEgY2hhbmdlIGluIHswfSBmaWxlc1wiLCBlbnRyaWVzQ291bnQpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGVudHJpZXNDb3VudCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0XHRcdHJlc3VsdCA9IGxvY2FsaXplKCd0b29sdGlwX24xJywgXCJ7MH0gY2hhbmdlcyBpbiAxIGZpbGVcIiwgY2hhbmdlQ291bnQpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHJlc3VsdCA9IGxvY2FsaXplKCd0b29sdGlwX25tJywgXCJ7MH0gY2hhbmdlcyBpbiB7MX0gZmlsZXNcIiwgY2hhbmdlQ291bnQsIGVudHJpZXNDb3VudCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKCF0aGF0Ll9pc0J1c3kuZ2V0KCkpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbHRpcF9idXN5JywgXCJ7MH0gLSBXb3JraW5nLi4uXCIsIHJlc3VsdCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IEFjY2VwdEFjdGlvbi5JRCB8fCBhY3Rpb24uaWQgPT09IFJlamVjdEFjdGlvbi5JRCkge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQ2hhdEVkaXRpbmdBY2NlcHRSZWplY3RBY3Rpb25WaWV3SXRlbShhY3Rpb24sIG9wdGlvbnMsIHRoYXQuX2VudHJ5LCB0aGF0Ll9lZGl0b3IsIHRoYXQuX2tleWJpbmRpbmdTZXJ2aWNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdH1cblxuXHRoaWRlKCkge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX3Nlc3Npb24uc2V0KHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0dGhpcy5fZW50cnkuc2V0KHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0dGhpcy5fbmF2aWdhdGlvbkJlYXJpbmdzLnNldCh7IGNoYW5nZUNvdW50OiAtMSwgYWN0aXZlSWR4OiAtMSwgZW50cmllc0NvdW50OiAtMSB9LCB0eCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fc2hvd1N0b3JlLmNsZWFyKCk7XG5cdH1cbn1cblxuY2xhc3MgQ2hhdEVkaXRpbmdPdmVybGF5Q29udHJvbGxlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdEVkaXRpbmdTZXJ2aWNlIGNoYXRFZGl0aW5nU2VydmljZTogSUNoYXRFZGl0aW5nU2VydmljZSxcblx0KSB7XG5cblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtZWRpdGluZy1lZGl0b3Itb3ZlcmxheScpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuYm90dG9tID0gYDI0cHhgO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUucmlnaHQgPSBgMjRweGA7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS56SW5kZXggPSBgMTAwYDtcblxuXHRcdGNvbnN0IHdpZGdldCA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdG9yT3ZlcmxheVdpZGdldCwgZ3JvdXApO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQod2lkZ2V0LmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9kb21Ob2RlLnJlbW92ZSgpKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHdpZGdldCk7XG5cblx0XHRjb25zdCBzaG93ID0gKCkgPT4ge1xuXHRcdFx0aWYgKCFjb250YWluZXIuY29udGFpbnModGhpcy5fZG9tTm9kZSkpIHtcblx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2RvbU5vZGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBoaWRlID0gKCkgPT4ge1xuXHRcdFx0aWYgKGNvbnRhaW5lci5jb250YWlucyh0aGlzLl9kb21Ob2RlKSkge1xuXHRcdFx0XHR3aWRnZXQuaGlkZSgpO1xuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIEV2ZW50LmFueShncm91cC5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgZ3JvdXAub25EaWRNb2RlbENoYW5nZSkpO1xuXG5cdFx0Y29uc3QgYWN0aXZlVXJpT2JzID0gZGVyaXZlZE9wdHMoeyBlcXVhbHNGbjogaXNFcXVhbCB9LCByID0+IHtcblxuXHRcdFx0YWN0aXZlRWRpdG9yU2lnbmFsLnJlYWQocik7IC8vIHNpZ25hbFxuXG5cdFx0XHRjb25zdCBlZGl0b3IgPSBncm91cC5hY3RpdmVFZGl0b3JQYW5lO1xuXG5cdFx0XHRpZiAoIWdldENvZGVFZGl0b3IoZWRpdG9yPy5nZXRDb250cm9sKCkpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHVyaSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yPy5pbnB1dCwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkFuZEVudHJ5ID0gZGVyaXZlZChyID0+IHtcblxuXHRcdFx0YWN0aXZlRWRpdG9yU2lnbmFsLnJlYWQocik7IC8vIHNpZ25hbCB0byBlbnN1cmUgYWN0aXZlRWRpdG9yIGFuZCBhY3RpdmVFZGl0b3JQYW5lIGRvbid0IGdvIG91dCBvZiBzeW5jXG5cblx0XHRcdGNvbnN0IHVyaSA9IGFjdGl2ZVVyaU9icy5yZWFkKHIpO1xuXHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGlyZWN0bHkgcXVlcnkgZ2xvYmFsIGVkaXRpbmcgc2Vzc2lvbnMgKGlubGluZSBjaGF0IGhhcyBpdHMgb3duIG92ZXJsYXkpXG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgY2hhdEVkaXRpbmdTZXJ2aWNlLmVkaXRpbmdTZXNzaW9uc09icy5yZWFkKHIpKSB7XG5cdFx0XHRcdGlmICghc2Vzc2lvbi5pc0dsb2JhbEVkaXRpbmdTZXNzaW9uKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW50cnkgPSBzZXNzaW9uLnJlYWRFbnRyeSh1cmksIHIpO1xuXHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uLCBlbnRyeSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cblx0XHRcdGNvbnN0IGRhdGEgPSBzZXNzaW9uQW5kRW50cnkucmVhZChyKTtcblxuXHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdGhpZGUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IHNlc3Npb24sIGVudHJ5IH0gPSBkYXRhO1xuXG5cdFx0XHRpZiAoZW50cnk/LnN0YXRlLnJlYWQocikgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpIHtcblx0XHRcdFx0Ly8gYW55IHNlc3Npb24gd2l0aCBjaGFuZ2VzXG5cdFx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSBncm91cC5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvclBhbmUpO1xuXG5cdFx0XHRcdGNvbnN0IGNoYW5nZUluZGV4ID0gZGVyaXZlZChyID0+IGVudHJ5XG5cdFx0XHRcdFx0PyBlbnRyeS5nZXRFZGl0b3JJbnRlZ3JhdGlvbihlZGl0b3JQYW5lKS5jdXJyZW50SW5kZXgucmVhZChyKVxuXHRcdFx0XHRcdDogMCk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnlJbmRleCA9IGRlcml2ZWQociA9PiBlbnRyeVxuXHRcdFx0XHRcdD8gc2Vzc2lvbi5lbnRyaWVzLnJlYWQocikuaW5kZXhPZihlbnRyeSlcblx0XHRcdFx0XHQ6IDBcblx0XHRcdFx0KTtcblxuXHRcdFx0XHR3aWRnZXQuc2hvdyhzZXNzaW9uLCBlbnRyeSwgeyBlbnRyeUluZGV4LCBjaGFuZ2VJbmRleCB9KTtcblx0XHRcdFx0c2hvdygpO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBub3RoaW5nXG5cdFx0XHRcdGhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRpbmdFZGl0b3JPdmVybGF5IGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2NoYXQuZWRpdHMuZWRpdG9yT3ZlcmxheSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIGVkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzID0gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHRcdHRoaXMsXG5cdFx0XHRFdmVudC5hbnkoZWRpdG9yR3JvdXBzU2VydmljZS5vbkRpZEFkZEdyb3VwLCBlZGl0b3JHcm91cHNTZXJ2aWNlLm9uRGlkUmVtb3ZlR3JvdXApLFxuXHRcdFx0KCkgPT4gZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHNcblx0XHQpO1xuXG5cdFx0Y29uc3Qgb3ZlcmxheVdpZGdldHMgPSB0aGlzLl9zdG9yZS5hZGQobmV3IERpc3Bvc2FibGVNYXA8SUVkaXRvckdyb3VwPigpKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXG5cdFx0XHRpZiAoZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0b0RlbGV0ZSA9IG5ldyBTZXQob3ZlcmxheVdpZGdldHMua2V5cygpKTtcblx0XHRcdGNvbnN0IGdyb3VwcyA9IGVkaXRvckdyb3Vwcy5yZWFkKHIpO1xuXG5cblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cblx0XHRcdFx0aWYgKCEoZ3JvdXAgaW5zdGFuY2VvZiBFZGl0b3JHcm91cFZpZXcpKSB7XG5cdFx0XHRcdFx0Ly8gVE9ET0Bqcmlla2VuIGJldHRlciB3aXRoIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3RyZWUvYmVuL2xheW91dC1ncm91cC1jb250YWluZXJcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRvRGVsZXRlLmRlbGV0ZShncm91cCk7IC8vIHdlIGtlZXAgdGhlIHdpZGdldCBmb3IgdGhpcyBncm91cCFcblxuXHRcdFx0XHRpZiAoIW92ZXJsYXlXaWRnZXRzLmhhcyhncm91cCkpIHtcblxuXHRcdFx0XHRcdGNvbnN0IHNjb3BlZEluc3RhU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKFxuXHRcdFx0XHRcdFx0bmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGdyb3VwLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSlcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gZ3JvdXAuZWxlbWVudDtcblxuXHRcdFx0XHRcdGNvbnN0IGN0cmwgPSBzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdPdmVybGF5Q29udHJvbGxlciwgY29udGFpbmVyLCBncm91cCk7XG5cdFx0XHRcdFx0b3ZlcmxheVdpZGdldHMuc2V0KGdyb3VwLCBjb21iaW5lZERpc3Bvc2FibGUoY3RybCwgc2NvcGVkSW5zdGFTZXJ2aWNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiB0b0RlbGV0ZSkge1xuXHRcdFx0XHRvdmVybGF5V2lkZ2V0cy5kZWxldGVBbmREaXNwb3NlKGdyb3VwKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxvQkFBb0IsWUFBWSxlQUFlLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQ2hILFNBQVMsU0FBUyxTQUFTLGFBQTBCLHFCQUFxQiwyQkFBMkIsaUJBQWlCLG1CQUFtQjtBQUN6SSxTQUFTLG9CQUFvQiw0QkFBNEI7QUFDekQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBOEQsOEJBQThCO0FBQ3JHLFNBQVMsY0FBYztBQUN2QixTQUFTLHNCQUE4QztBQUV2RCxTQUFTLEdBQUcsdUNBQXVDLGNBQWM7QUFDakUsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjLCtCQUErQixvQkFBb0I7QUFFMUUsU0FBdUIsNEJBQTRCO0FBQ25ELFNBQVMsdUJB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
