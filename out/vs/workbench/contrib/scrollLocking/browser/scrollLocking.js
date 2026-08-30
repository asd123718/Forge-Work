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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { SideBySideEditor } from "../../../browser/parts/editor/sideBySideEditor.js";
import { isEditorPaneWithScrolling } from "../../../common/editor.js";
import { ReentrancyBarrier } from "../../../../base/common/controlFlow.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
let SyncScroll = class extends Disposable {
  constructor(editorService, statusbarService) {
    super();
    this.editorService = editorService;
    this.statusbarService = statusbarService;
    this.paneInitialScrollTop = /* @__PURE__ */ new Map();
    this.syncScrollDispoasbles = this._register(new DisposableStore());
    this.paneDisposables = this._register(new DisposableStore());
    this.statusBarEntry = this._register(new MutableDisposable());
    this.isActive = false;
    // makes sure that the onDidEditorPaneScroll is not called multiple times for the same event
    this._reentrancyBarrier = new ReentrancyBarrier();
    this.registerActions();
  }
  registerActiveListeners() {
    this.syncScrollDispoasbles.add(this.editorService.onDidVisibleEditorsChange(() => this.trackVisiblePanes()));
  }
  activate() {
    this.registerActiveListeners();
    this.trackVisiblePanes();
  }
  toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
    this.isActive = !this.isActive;
    this.toggleStatusbarItem(this.isActive);
  }
  trackVisiblePanes() {
    this.paneDisposables.clear();
    this.paneInitialScrollTop.clear();
    for (const pane of this.getAllVisiblePanes()) {
      if (!isEditorPaneWithScrolling(pane)) {
        continue;
      }
      this.paneInitialScrollTop.set(pane, pane.getScrollPosition());
      this.paneDisposables.add(pane.onDidChangeScroll(
        () => this._reentrancyBarrier.runExclusivelyOrSkip(() => {
          this.onDidEditorPaneScroll(pane);
        })
      ));
    }
  }
  onDidEditorPaneScroll(scrolledPane) {
    const scrolledPaneInitialOffset = this.paneInitialScrollTop.get(scrolledPane);
    if (scrolledPaneInitialOffset === void 0) {
      throw new Error("Scrolled pane not tracked");
    }
    if (!isEditorPaneWithScrolling(scrolledPane)) {
      throw new Error("Scrolled pane does not support scrolling");
    }
    const scrolledPaneCurrentPosition = scrolledPane.getScrollPosition();
    const scrolledFromInitial = {
      scrollTop: scrolledPaneCurrentPosition.scrollTop - scrolledPaneInitialOffset.scrollTop,
      scrollLeft: scrolledPaneCurrentPosition.scrollLeft !== void 0 && scrolledPaneInitialOffset.scrollLeft !== void 0 ? scrolledPaneCurrentPosition.scrollLeft - scrolledPaneInitialOffset.scrollLeft : void 0
    };
    for (const pane of this.getAllVisiblePanes()) {
      if (pane === scrolledPane) {
        continue;
      }
      if (!isEditorPaneWithScrolling(pane)) {
        continue;
      }
      const initialOffset = this.paneInitialScrollTop.get(pane);
      if (initialOffset === void 0) {
        throw new Error("Could not find initial offset for pane");
      }
      const currentPanePosition = pane.getScrollPosition();
      const newPaneScrollPosition = {
        scrollTop: initialOffset.scrollTop + scrolledFromInitial.scrollTop,
        scrollLeft: initialOffset.scrollLeft !== void 0 && scrolledFromInitial.scrollLeft !== void 0 ? initialOffset.scrollLeft + scrolledFromInitial.scrollLeft : void 0
      };
      if (currentPanePosition.scrollTop === newPaneScrollPosition.scrollTop && currentPanePosition.scrollLeft === newPaneScrollPosition.scrollLeft) {
        continue;
      }
      pane.setScrollPosition(newPaneScrollPosition);
    }
  }
  getAllVisiblePanes() {
    const panes = [];
    for (const pane of this.editorService.visibleEditorPanes) {
      if (pane instanceof SideBySideEditor) {
        const primaryPane = pane.getPrimaryEditorPane();
        const secondaryPane = pane.getSecondaryEditorPane();
        if (primaryPane) {
          panes.push(primaryPane);
        }
        if (secondaryPane) {
          panes.push(secondaryPane);
        }
        continue;
      }
      panes.push(pane);
    }
    return panes;
  }
  deactivate() {
    this.paneDisposables.clear();
    this.syncScrollDispoasbles.clear();
    this.paneInitialScrollTop.clear();
  }
  // Actions & Commands
  toggleStatusbarItem(active) {
    if (active) {
      if (!this.statusBarEntry.value) {
        const text = localize("mouseScrolllingLocked", "Scrolling Locked");
        const tooltip = localize("mouseLockScrollingEnabled", "Lock Scrolling Enabled");
        this.statusBarEntry.value = this.statusbarService.addEntry({
          name: text,
          text,
          tooltip,
          ariaLabel: text,
          command: {
            id: "workbench.action.toggleLockedScrolling",
            title: ""
          },
          kind: "prominent",
          showInAllWindows: true
        }, "status.scrollLockingEnabled", StatusbarAlignment.RIGHT, 102);
      }
    } else {
      this.statusBarEntry.clear();
    }
  }
  registerActions() {
    const $this = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.toggleLockedScrolling",
          title: {
            ...localize2("toggleLockedScrolling", "Toggle Locked Scrolling Across Editors"),
            mnemonicTitle: localize({ key: "miToggleLockedScrolling", comment: ["&& denotes a mnemonic"] }, "Locked Scrolling")
          },
          category: Categories.View,
          f1: true,
          metadata: {
            description: localize("synchronizeScrolling", "Synchronize Scrolling Editors")
          }
        });
      }
      run() {
        $this.toggle();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.holdLockedScrolling",
          title: {
            ...localize2("holdLockedScrolling", "Hold Locked Scrolling Across Editors"),
            mnemonicTitle: localize({ key: "miHoldLockedScrolling", comment: ["&& denotes a mnemonic"] }, "Locked Scrolling")
          },
          category: Categories.View
        });
      }
      run(accessor) {
        const keybindingService = accessor.get(IKeybindingService);
        $this.toggle();
        const holdMode = keybindingService.enableKeybindingHoldMode("workbench.action.holdLockedScrolling");
        if (!holdMode) {
          return;
        }
        holdMode.finally(() => {
          $this.toggle();
        });
      }
    }));
  }
  dispose() {
    this.deactivate();
    super.dispose();
  }
};
SyncScroll.ID = "workbench.contrib.syncScrolling";
SyncScroll = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IStatusbarService)
], SyncScroll);
export {
  SyncScroll
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjcm9sbExvY2tpbmdcXGJyb3dzZXJcXHNjcm9sbExvY2tpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lLCBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uLCBpc0VkaXRvclBhbmVXaXRoU2Nyb2xsaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBSZWVudHJhbmN5QmFycmllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbnRyb2xGbG93LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yLCBJU3RhdHVzYmFyU2VydmljZSwgU3RhdHVzYmFyQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcblxuZXhwb3J0IGNsYXNzIFN5bmNTY3JvbGwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnN5bmNTY3JvbGxpbmcnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGFuZUluaXRpYWxTY3JvbGxUb3AgPSBuZXcgTWFwPElFZGl0b3JQYW5lLCBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uIHwgdW5kZWZpbmVkPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3luY1Njcm9sbERpc3BvYXNibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBwYW5lRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzQmFyRW50cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXG5cdHByaXZhdGUgaXNBY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckFjdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY3RpdmVMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5zeW5jU2Nyb2xsRGlzcG9hc2JsZXMuYWRkKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZFZpc2libGVFZGl0b3JzQ2hhbmdlKCgpID0+IHRoaXMudHJhY2tWaXNpYmxlUGFuZXMoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhY3RpdmF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlZ2lzdGVyQWN0aXZlTGlzdGVuZXJzKCk7XG5cblx0XHR0aGlzLnRyYWNrVmlzaWJsZVBhbmVzKCk7XG5cdH1cblxuXHR0b2dnbGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNBY3RpdmUpIHtcblx0XHRcdHRoaXMuZGVhY3RpdmF0ZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFjdGl2YXRlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5pc0FjdGl2ZSA9ICF0aGlzLmlzQWN0aXZlO1xuXG5cdFx0dGhpcy50b2dnbGVTdGF0dXNiYXJJdGVtKHRoaXMuaXNBY3RpdmUpO1xuXHR9XG5cblx0Ly8gbWFrZXMgc3VyZSB0aGF0IHRoZSBvbkRpZEVkaXRvclBhbmVTY3JvbGwgaXMgbm90IGNhbGxlZCBtdWx0aXBsZSB0aW1lcyBmb3IgdGhlIHNhbWUgZXZlbnRcblx0cHJpdmF0ZSBfcmVlbnRyYW5jeUJhcnJpZXIgPSBuZXcgUmVlbnRyYW5jeUJhcnJpZXIoKTtcblxuXHRwcml2YXRlIHRyYWNrVmlzaWJsZVBhbmVzKCk6IHZvaWQge1xuXHRcdHRoaXMucGFuZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5wYW5lSW5pdGlhbFNjcm9sbFRvcC5jbGVhcigpO1xuXG5cdFx0Zm9yIChjb25zdCBwYW5lIG9mIHRoaXMuZ2V0QWxsVmlzaWJsZVBhbmVzKCkpIHtcblxuXHRcdFx0aWYgKCFpc0VkaXRvclBhbmVXaXRoU2Nyb2xsaW5nKHBhbmUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnBhbmVJbml0aWFsU2Nyb2xsVG9wLnNldChwYW5lLCBwYW5lLmdldFNjcm9sbFBvc2l0aW9uKCkpO1xuXHRcdFx0dGhpcy5wYW5lRGlzcG9zYWJsZXMuYWRkKHBhbmUub25EaWRDaGFuZ2VTY3JvbGwoKCkgPT5cblx0XHRcdFx0dGhpcy5fcmVlbnRyYW5jeUJhcnJpZXIucnVuRXhjbHVzaXZlbHlPclNraXAoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMub25EaWRFZGl0b3JQYW5lU2Nyb2xsKHBhbmUpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEVkaXRvclBhbmVTY3JvbGwoc2Nyb2xsZWRQYW5lOiBJRWRpdG9yUGFuZSkge1xuXG5cdFx0Y29uc3Qgc2Nyb2xsZWRQYW5lSW5pdGlhbE9mZnNldCA9IHRoaXMucGFuZUluaXRpYWxTY3JvbGxUb3AuZ2V0KHNjcm9sbGVkUGFuZSk7XG5cdFx0aWYgKHNjcm9sbGVkUGFuZUluaXRpYWxPZmZzZXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTY3JvbGxlZCBwYW5lIG5vdCB0cmFja2VkJyk7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc0VkaXRvclBhbmVXaXRoU2Nyb2xsaW5nKHNjcm9sbGVkUGFuZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU2Nyb2xsZWQgcGFuZSBkb2VzIG5vdCBzdXBwb3J0IHNjcm9sbGluZycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbGVkUGFuZUN1cnJlbnRQb3NpdGlvbiA9IHNjcm9sbGVkUGFuZS5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdGNvbnN0IHNjcm9sbGVkRnJvbUluaXRpYWwgPSB7XG5cdFx0XHRzY3JvbGxUb3A6IHNjcm9sbGVkUGFuZUN1cnJlbnRQb3NpdGlvbi5zY3JvbGxUb3AgLSBzY3JvbGxlZFBhbmVJbml0aWFsT2Zmc2V0LnNjcm9sbFRvcCxcblx0XHRcdHNjcm9sbExlZnQ6IHNjcm9sbGVkUGFuZUN1cnJlbnRQb3NpdGlvbi5zY3JvbGxMZWZ0ICE9PSB1bmRlZmluZWQgJiYgc2Nyb2xsZWRQYW5lSW5pdGlhbE9mZnNldC5zY3JvbGxMZWZ0ICE9PSB1bmRlZmluZWQgPyBzY3JvbGxlZFBhbmVDdXJyZW50UG9zaXRpb24uc2Nyb2xsTGVmdCAtIHNjcm9sbGVkUGFuZUluaXRpYWxPZmZzZXQuc2Nyb2xsTGVmdCA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBwYW5lIG9mIHRoaXMuZ2V0QWxsVmlzaWJsZVBhbmVzKCkpIHtcblx0XHRcdGlmIChwYW5lID09PSBzY3JvbGxlZFBhbmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaXNFZGl0b3JQYW5lV2l0aFNjcm9sbGluZyhwYW5lKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW5pdGlhbE9mZnNldCA9IHRoaXMucGFuZUluaXRpYWxTY3JvbGxUb3AuZ2V0KHBhbmUpO1xuXHRcdFx0aWYgKGluaXRpYWxPZmZzZXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBmaW5kIGluaXRpYWwgb2Zmc2V0IGZvciBwYW5lJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRQYW5lUG9zaXRpb24gPSBwYW5lLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCBuZXdQYW5lU2Nyb2xsUG9zaXRpb24gPSB7XG5cdFx0XHRcdHNjcm9sbFRvcDogaW5pdGlhbE9mZnNldC5zY3JvbGxUb3AgKyBzY3JvbGxlZEZyb21Jbml0aWFsLnNjcm9sbFRvcCxcblx0XHRcdFx0c2Nyb2xsTGVmdDogaW5pdGlhbE9mZnNldC5zY3JvbGxMZWZ0ICE9PSB1bmRlZmluZWQgJiYgc2Nyb2xsZWRGcm9tSW5pdGlhbC5zY3JvbGxMZWZ0ICE9PSB1bmRlZmluZWQgPyBpbml0aWFsT2Zmc2V0LnNjcm9sbExlZnQgKyBzY3JvbGxlZEZyb21Jbml0aWFsLnNjcm9sbExlZnQgOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoY3VycmVudFBhbmVQb3NpdGlvbi5zY3JvbGxUb3AgPT09IG5ld1BhbmVTY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3AgJiYgY3VycmVudFBhbmVQb3NpdGlvbi5zY3JvbGxMZWZ0ID09PSBuZXdQYW5lU2Nyb2xsUG9zaXRpb24uc2Nyb2xsTGVmdCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0cGFuZS5zZXRTY3JvbGxQb3NpdGlvbihuZXdQYW5lU2Nyb2xsUG9zaXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0QWxsVmlzaWJsZVBhbmVzKCk6IElFZGl0b3JQYW5lW10ge1xuXHRcdGNvbnN0IHBhbmVzOiBJRWRpdG9yUGFuZVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHBhbmUgb2YgdGhpcy5lZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JQYW5lcykge1xuXG5cdFx0XHRpZiAocGFuZSBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3IpIHtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeVBhbmUgPSBwYW5lLmdldFByaW1hcnlFZGl0b3JQYW5lKCk7XG5cdFx0XHRcdGNvbnN0IHNlY29uZGFyeVBhbmUgPSBwYW5lLmdldFNlY29uZGFyeUVkaXRvclBhbmUoKTtcblx0XHRcdFx0aWYgKHByaW1hcnlQYW5lKSB7XG5cdFx0XHRcdFx0cGFuZXMucHVzaChwcmltYXJ5UGFuZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlY29uZGFyeVBhbmUpIHtcblx0XHRcdFx0XHRwYW5lcy5wdXNoKHNlY29uZGFyeVBhbmUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRwYW5lcy5wdXNoKHBhbmUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYW5lcztcblx0fVxuXG5cdHByaXZhdGUgZGVhY3RpdmF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnBhbmVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuc3luY1Njcm9sbERpc3BvYXNibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5wYW5lSW5pdGlhbFNjcm9sbFRvcC5jbGVhcigpO1xuXHR9XG5cblx0Ly8gQWN0aW9ucyAmIENvbW1hbmRzXG5cblx0cHJpdmF0ZSB0b2dnbGVTdGF0dXNiYXJJdGVtKGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChhY3RpdmUpIHtcblx0XHRcdGlmICghdGhpcy5zdGF0dXNCYXJFbnRyeS52YWx1ZSkge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gbG9jYWxpemUoJ21vdXNlU2Nyb2xsbGluZ0xvY2tlZCcsICdTY3JvbGxpbmcgTG9ja2VkJyk7XG5cdFx0XHRcdGNvbnN0IHRvb2x0aXAgPSBsb2NhbGl6ZSgnbW91c2VMb2NrU2Nyb2xsaW5nRW5hYmxlZCcsICdMb2NrIFNjcm9sbGluZyBFbmFibGVkJyk7XG5cdFx0XHRcdHRoaXMuc3RhdHVzQmFyRW50cnkudmFsdWUgPSB0aGlzLnN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoe1xuXHRcdFx0XHRcdG5hbWU6IHRleHQsXG5cdFx0XHRcdFx0dGV4dCxcblx0XHRcdFx0XHR0b29sdGlwLFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlTG9ja2VkU2Nyb2xsaW5nJyxcblx0XHRcdFx0XHRcdHRpdGxlOiAnJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0a2luZDogJ3Byb21pbmVudCcsXG5cdFx0XHRcdFx0c2hvd0luQWxsV2luZG93czogdHJ1ZVxuXHRcdFx0XHR9LCAnc3RhdHVzLnNjcm9sbExvY2tpbmdFbmFibGVkJywgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCAxMDIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0YXR1c0JhckVudHJ5LmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKSB7XG5cdFx0Y29uc3QgJHRoaXMgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlTG9ja2VkU2Nyb2xsaW5nJyxcblx0XHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdFx0Li4ubG9jYWxpemUyKCd0b2dnbGVMb2NrZWRTY3JvbGxpbmcnLCBcIlRvZ2dsZSBMb2NrZWQgU2Nyb2xsaW5nIEFjcm9zcyBFZGl0b3JzXCIpLFxuXHRcdFx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVRvZ2dsZUxvY2tlZFNjcm9sbGluZycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJMb2NrZWQgU2Nyb2xsaW5nXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzeW5jaHJvbml6ZVNjcm9sbGluZycsIFwiU3luY2hyb25pemUgU2Nyb2xsaW5nIEVkaXRvcnNcIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cnVuKCk6IHZvaWQge1xuXHRcdFx0XHQkdGhpcy50b2dnbGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5ob2xkTG9ja2VkU2Nyb2xsaW5nJyxcblx0XHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdFx0Li4ubG9jYWxpemUyKCdob2xkTG9ja2VkU2Nyb2xsaW5nJywgXCJIb2xkIExvY2tlZCBTY3JvbGxpbmcgQWNyb3NzIEVkaXRvcnNcIiksXG5cdFx0XHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pSG9sZExvY2tlZFNjcm9sbGluZycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJMb2NrZWQgU2Nyb2xsaW5nXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJS2V5YmluZGluZ1NlcnZpY2UpO1xuXG5cdFx0XHRcdC8vIEVuYWJsZSBTeW5jIFNjcm9sbGluZyB3aGlsZSBwcmVzc2VkXG5cdFx0XHRcdCR0aGlzLnRvZ2dsZSgpO1xuXG5cdFx0XHRcdGNvbnN0IGhvbGRNb2RlID0ga2V5YmluZGluZ1NlcnZpY2UuZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKCd3b3JrYmVuY2guYWN0aW9uLmhvbGRMb2NrZWRTY3JvbGxpbmcnKTtcblx0XHRcdFx0aWYgKCFob2xkTW9kZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGhvbGRNb2RlLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdCR0aGlzLnRvZ2dsZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGVhY3RpdmF0ZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUUvRCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFFakMsU0FBaUQsaUNBQWlDO0FBQ2xGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQWtDLG1CQUFtQiwwQkFBMEI7QUFFeEUsSUFBTSxhQUFOLGNBQXlCLFdBQTZDO0FBQUEsRUFhNUUsWUFDa0MsZUFDRyxrQkFDbkM7QUFDRCxVQUFNO0FBSDJCO0FBQ0c7QUFY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
