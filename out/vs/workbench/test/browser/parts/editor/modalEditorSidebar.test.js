import assert from "assert";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
const MODAL_MIN_WIDTH = 400;
const MODAL_SIDEBAR_MIN_WIDTH = 160;
const MODAL_SIDEBAR_DEFAULT_WIDTH = 220;
class TestModalEditorSidebarHost extends Disposable {
  constructor(customWidth, sidebarHidden) {
    super();
    this._onDidResize = this._register(new Emitter());
    this.onDidResize = this._onDidResize.event;
    this._onDidLayout = this._register(new Emitter());
    this.contentDisposable = this._register(new MutableDisposable());
    this.contextKeyService = this._register(new MockContextKeyService());
    this._sidebarWidth = MODAL_SIDEBAR_DEFAULT_WIDTH;
    this._hasSidebar = false;
    this._sidebarVisible = true;
    this._renderCount = 0;
    /** Container width the modal occupies (simulates container.clientWidth). */
    this.containerWidth = 800;
    this._customWidth = customWidth;
    this._sidebarVisible = !sidebarHidden;
  }
  get sidebarWidth() {
    return this._sidebarWidth;
  }
  get hasSidebar() {
    return this._hasSidebar;
  }
  get sidebarVisible() {
    return this._sidebarVisible;
  }
  get renderCount() {
    return this._renderCount;
  }
  get customWidth() {
    return this._customWidth;
  }
  // --- sidebar management (mirrors createSidebar / updateContent) ---------
  addSidebar(content) {
    this._hasSidebar = true;
    this._sidebarWidth = this._customWidth ?? MODAL_SIDEBAR_DEFAULT_WIDTH;
    this.renderContent(content);
  }
  updateSidebarContent(content) {
    this.contentDisposable.clear();
    this.renderContent(content);
  }
  removeSidebar() {
    this._hasSidebar = false;
    this._sidebarWidth = 0;
    this.contentDisposable.clear();
  }
  toggleSidebarVisible() {
    this._sidebarVisible = !this._sidebarVisible;
    this._onDidResize.fire();
  }
  /** Returns actual width taking visibility into account (mirrors getWidth in controller). */
  get effectiveSidebarWidth() {
    return this._sidebarVisible ? this._sidebarWidth : 0;
  }
  renderContent(content) {
    this._renderCount++;
    this.contentDisposable.value = content.render({}, this._onDidLayout.event, this.contextKeyService);
  }
  // --- resize (mirrors sash logic) ----------------------------------------
  resizeSidebar(delta) {
    const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, this.containerWidth - MODAL_MIN_WIDTH);
    this._sidebarWidth = Math.min(maxWidth, Math.max(MODAL_SIDEBAR_MIN_WIDTH, this._sidebarWidth + delta));
    this._customWidth = this._sidebarWidth;
    this._onDidResize.fire();
  }
  resetSidebarWidth() {
    const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, this.containerWidth - MODAL_MIN_WIDTH);
    this._sidebarWidth = Math.min(maxWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
    this._customWidth = void 0;
    this._onDidResize.fire();
  }
  clampWidth(modalWidth) {
    if (this._sidebarWidth + MODAL_MIN_WIDTH > modalWidth) {
      this._sidebarWidth = Math.min(MODAL_SIDEBAR_DEFAULT_WIDTH, Math.max(MODAL_SIDEBAR_MIN_WIDTH, modalWidth - MODAL_MIN_WIDTH));
      this._customWidth = void 0;
      this._onDidResize.fire();
    }
  }
  // --- min-size computation (mirrors create method) -----------------------
  get effectiveMinWidth() {
    return MODAL_MIN_WIDTH + (this._hasSidebar ? MODAL_SIDEBAR_MIN_WIDTH : 0);
  }
  // --- option propagation (mirrors updateOptions behaviour) ---------------
  updateOptions(options) {
    if (options.sidebar) {
      if (!this._hasSidebar) {
        this.addSidebar(options.sidebar);
      } else {
        this.updateSidebarContent(options.sidebar);
      }
    } else if (options.sidebar === void 0 && this._hasSidebar) {
    }
  }
  layout(height) {
    this._onDidLayout.fire({ height, width: this._sidebarWidth });
  }
}
function stubSidebarContent() {
  return {
    render: (_container, _onDidLayout) => {
      return { dispose: () => {
      } };
    }
  };
}
suite("Modal Editor Sidebar", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("addSidebar sets hasSidebar and default width", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    assert.deepStrictEqual(
      { hasSidebar: host.hasSidebar, sidebarWidth: host.sidebarWidth, renderCount: host.renderCount },
      { hasSidebar: true, sidebarWidth: MODAL_SIDEBAR_DEFAULT_WIDTH, renderCount: 1 }
    );
  });
  test("removeSidebar clears sidebar state", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    host.removeSidebar();
    assert.deepStrictEqual(
      { hasSidebar: host.hasSidebar, sidebarWidth: host.sidebarWidth, renderCount: host.renderCount },
      { hasSidebar: false, sidebarWidth: 0, renderCount: 1 }
    );
  });
  test("updateSidebarContent disposes previous content and re-renders", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    let firstDisposed = false;
    const firstContent = {
      render: () => ({ dispose: () => {
        firstDisposed = true;
      } })
    };
    host.addSidebar(firstContent);
    let secondRendered = false;
    const secondContent = {
      render: () => {
        secondRendered = true;
        return { dispose: () => {
        } };
      }
    };
    host.updateSidebarContent(secondContent);
    assert.deepStrictEqual(
      { firstDisposed, secondRendered, renderCount: host.renderCount },
      { firstDisposed: true, secondRendered: true, renderCount: 2 }
    );
  });
  test("updateOptions adds sidebar when not present", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.updateOptions({ sidebar: stubSidebarContent() });
    assert.deepStrictEqual(
      { hasSidebar: host.hasSidebar, renderCount: host.renderCount },
      { hasSidebar: true, renderCount: 1 }
    );
  });
  test("updateOptions updates sidebar content when already present", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    host.updateOptions({ sidebar: stubSidebarContent() });
    assert.deepStrictEqual(
      { hasSidebar: host.hasSidebar, renderCount: host.renderCount },
      { hasSidebar: true, renderCount: 2 }
    );
  });
  test("effectiveMinWidth accounts for sidebar", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    const withoutSidebar = host.effectiveMinWidth;
    host.addSidebar(stubSidebarContent());
    const withSidebar = host.effectiveMinWidth;
    assert.deepStrictEqual(
      { withoutSidebar, withSidebar },
      { withoutSidebar: MODAL_MIN_WIDTH, withSidebar: MODAL_MIN_WIDTH + MODAL_SIDEBAR_MIN_WIDTH }
    );
  });
  test("effectiveMinWidth reverts after sidebar removal", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    host.removeSidebar();
    assert.strictEqual(host.effectiveMinWidth, MODAL_MIN_WIDTH);
  });
  test("resizeSidebar clamps to min width", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    host.resizeSidebar(-9999);
    assert.strictEqual(host.sidebarWidth, MODAL_SIDEBAR_MIN_WIDTH);
  });
  test("resizeSidebar clamps to max width (container - modal min)", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.containerWidth = 800;
    host.addSidebar(stubSidebarContent());
    host.resizeSidebar(9999);
    assert.strictEqual(host.sidebarWidth, host.containerWidth - MODAL_MIN_WIDTH);
  });
  test("resizeSidebar applies delta within bounds", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.containerWidth = 1e3;
    host.addSidebar(stubSidebarContent());
    host.resizeSidebar(30);
    assert.strictEqual(host.sidebarWidth, MODAL_SIDEBAR_DEFAULT_WIDTH + 30);
  });
  test("resizeSidebar fires onDidResize", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    let fired = false;
    disposables.add(host.onDidResize(() => {
      fired = true;
    }));
    host.resizeSidebar(10);
    assert.strictEqual(fired, true);
  });
  test("resetSidebarWidth restores default width", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.containerWidth = 1e3;
    host.addSidebar(stubSidebarContent());
    host.resizeSidebar(100);
    host.resetSidebarWidth();
    assert.strictEqual(host.sidebarWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
  });
  test("resetSidebarWidth clamps if container shrunk", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.containerWidth = 1e3;
    host.addSidebar(stubSidebarContent());
    host.containerWidth = MODAL_MIN_WIDTH + MODAL_SIDEBAR_MIN_WIDTH;
    host.resetSidebarWidth();
    assert.strictEqual(host.sidebarWidth, MODAL_SIDEBAR_MIN_WIDTH);
  });
  test("addSidebar restores custom width when present", () => {
    const host = disposables.add(new TestModalEditorSidebarHost(300));
    host.containerWidth = 1e3;
    host.addSidebar(stubSidebarContent());
    assert.strictEqual(host.sidebarWidth, 300);
  });
  test("addSidebar uses default width when no custom width", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    assert.strictEqual(host.sidebarWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
  });
  test("resizeSidebar sets custom width", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.containerWidth = 1e3;
    host.addSidebar(stubSidebarContent());
    host.resizeSidebar(50);
    assert.strictEqual(host.customWidth, MODAL_SIDEBAR_DEFAULT_WIDTH + 50);
  });
  test("resetSidebarWidth clears custom width", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.containerWidth = 1e3;
    host.addSidebar(stubSidebarContent());
    host.resizeSidebar(50);
    host.resetSidebarWidth();
    assert.strictEqual(host.customWidth, void 0);
  });
  test("clampWidth resets to default when sidebar is too wide for modal", () => {
    const host = disposables.add(new TestModalEditorSidebarHost(500));
    host.containerWidth = 1e3;
    host.addSidebar(stubSidebarContent());
    assert.strictEqual(host.sidebarWidth, 500);
    host.clampWidth(800);
    assert.deepStrictEqual(
      { sidebarWidth: host.sidebarWidth, customWidth: host.customWidth },
      { sidebarWidth: MODAL_SIDEBAR_DEFAULT_WIDTH, customWidth: void 0 }
    );
  });
  test("clampWidth keeps width when sidebar fits within modal", () => {
    const host = disposables.add(new TestModalEditorSidebarHost(300));
    host.containerWidth = 1e3;
    host.addSidebar(stubSidebarContent());
    host.clampWidth(1e3);
    assert.deepStrictEqual(
      { sidebarWidth: host.sidebarWidth, customWidth: host.customWidth },
      { sidebarWidth: 300, customWidth: 300 }
    );
  });
  test("clampWidth fires onDidResize when clamping", () => {
    const host = disposables.add(new TestModalEditorSidebarHost(500));
    host.addSidebar(stubSidebarContent());
    let fired = false;
    disposables.add(host.onDidResize(() => {
      fired = true;
    }));
    host.clampWidth(600);
    assert.strictEqual(fired, true);
  });
  test("clampWidth does not fire onDidResize when not clamping", () => {
    const host = disposables.add(new TestModalEditorSidebarHost(200));
    host.addSidebar(stubSidebarContent());
    let fired = false;
    disposables.add(host.onDidResize(() => {
      fired = true;
    }));
    host.clampWidth(1e3);
    assert.strictEqual(fired, false);
  });
  test("clampWidth uses constrained width when modal is very narrow", () => {
    const host = disposables.add(new TestModalEditorSidebarHost(400));
    host.addSidebar(stubSidebarContent());
    host.clampWidth(500);
    assert.deepStrictEqual(
      { sidebarWidth: host.sidebarWidth, customWidth: host.customWidth },
      { sidebarWidth: MODAL_SIDEBAR_MIN_WIDTH, customWidth: void 0 }
    );
  });
  test("layout fires onDidLayout with current dimensions", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    const layouts = [];
    const trackedContent = {
      render: (_container, onDidLayout) => {
        const sub = onDidLayout((e) => layouts.push(e));
        return sub;
      }
    };
    host.updateSidebarContent(trackedContent);
    host.layout(500);
    assert.deepStrictEqual(layouts, [{ height: 500, width: MODAL_SIDEBAR_DEFAULT_WIDTH }]);
  });
  test("sidebar is visible by default", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    assert.deepStrictEqual(
      { visible: host.sidebarVisible, effectiveWidth: host.effectiveSidebarWidth },
      { visible: true, effectiveWidth: MODAL_SIDEBAR_DEFAULT_WIDTH }
    );
  });
  test("toggleSidebarVisible hides sidebar and returns zero width", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    host.toggleSidebarVisible();
    assert.deepStrictEqual(
      { visible: host.sidebarVisible, effectiveWidth: host.effectiveSidebarWidth },
      { visible: false, effectiveWidth: 0 }
    );
  });
  test("toggleSidebarVisible twice restores sidebar", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    host.toggleSidebarVisible();
    host.toggleSidebarVisible();
    assert.deepStrictEqual(
      { visible: host.sidebarVisible, effectiveWidth: host.effectiveSidebarWidth },
      { visible: true, effectiveWidth: MODAL_SIDEBAR_DEFAULT_WIDTH }
    );
  });
  test("toggleSidebarVisible fires onDidResize", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.addSidebar(stubSidebarContent());
    let fired = false;
    disposables.add(host.onDidResize(() => {
      fired = true;
    }));
    host.toggleSidebarVisible();
    assert.strictEqual(fired, true);
  });
  test("sidebar hidden state persists via constructor", () => {
    const host = disposables.add(new TestModalEditorSidebarHost(void 0, true));
    host.addSidebar(stubSidebarContent());
    assert.deepStrictEqual(
      { visible: host.sidebarVisible, effectiveWidth: host.effectiveSidebarWidth },
      { visible: false, effectiveWidth: 0 }
    );
  });
  test("hidden sidebar preserves width for when restored", () => {
    const host = disposables.add(new TestModalEditorSidebarHost());
    host.containerWidth = 1e3;
    host.addSidebar(stubSidebarContent());
    host.resizeSidebar(50);
    host.toggleSidebarVisible();
    assert.deepStrictEqual(
      { effectiveWidth: host.effectiveSidebarWidth, sidebarWidth: host.sidebarWidth },
      { effectiveWidth: 0, sidebarWidth: MODAL_SIDEBAR_DEFAULT_WIDTH + 50 }
    );
    host.toggleSidebarVisible();
    assert.deepStrictEqual(
      { effectiveWidth: host.effectiveSidebarWidth, sidebarWidth: host.sidebarWidth },
      { effectiveWidth: MODAL_SIDEBAR_DEFAULT_WIDTH + 50, sidebarWidth: MODAL_SIDEBAR_DEFAULT_WIDTH + 50 }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXG1vZGFsRWRpdG9yU2lkZWJhci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElNb2RhbEVkaXRvclBhcnRPcHRpb25zLCBJTW9kYWxFZGl0b3JTaWRlYmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuXG5jb25zdCBNT0RBTF9NSU5fV0lEVEggPSA0MDA7XG5jb25zdCBNT0RBTF9TSURFQkFSX01JTl9XSURUSCA9IDE2MDtcbmNvbnN0IE1PREFMX1NJREVCQVJfREVGQVVMVF9XSURUSCA9IDIyMDtcblxuLyoqXG4gKiBNaW5pbWFsIHNpZGViYXIgbW9kZWwgdGhhdCBtaXJyb3JzIHRoZSBgY3JlYXRlU2lkZWJhcmAgLyBgdXBkYXRlT3B0aW9uc2BcbiAqIGxvZ2ljIGluIE1vZGFsRWRpdG9yUGFydCB3aXRob3V0IHJlcXVpcmluZyBET00gb3IgaW5zdGFudGlhdGlvbiBzZXJ2aWNlcy5cbiAqL1xuY2xhc3MgVGVzdE1vZGFsRWRpdG9yU2lkZWJhckhvc3QgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc2l6ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlc2l6ZSA9IHRoaXMuX29uRGlkUmVzaXplLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBoZWlnaHQ6IG51bWJlcjsgcmVhZG9ubHkgd2lkdGg6IG51bWJlciB9PigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRlbnREaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXG5cdHByaXZhdGUgX3NpZGViYXJXaWR0aCA9IE1PREFMX1NJREVCQVJfREVGQVVMVF9XSURUSDtcblx0Z2V0IHNpZGViYXJXaWR0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fc2lkZWJhcldpZHRoOyB9XG5cblx0cHJpdmF0ZSBfaGFzU2lkZWJhciA9IGZhbHNlO1xuXHRnZXQgaGFzU2lkZWJhcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hhc1NpZGViYXI7IH1cblxuXHRwcml2YXRlIF9zaWRlYmFyVmlzaWJsZSA9IHRydWU7XG5cdGdldCBzaWRlYmFyVmlzaWJsZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3NpZGViYXJWaXNpYmxlOyB9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQ291bnQgPSAwO1xuXHRnZXQgcmVuZGVyQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX3JlbmRlckNvdW50OyB9XG5cblx0LyoqIENvbnRhaW5lciB3aWR0aCB0aGUgbW9kYWwgb2NjdXBpZXMgKHNpbXVsYXRlcyBjb250YWluZXIuY2xpZW50V2lkdGgpLiAqL1xuXHRjb250YWluZXJXaWR0aCA9IDgwMDtcblxuXHQvKiogUmVtZW1iZXJlZCBzaWRlYmFyIHdpZHRoIGZyb20gcHJldmlvdXMgbW9kYWwgc2Vzc2lvbiAobWlycm9ycyBlZGl0b3JQYXJ0LnNpZGViYXJXaWR0aCkuICovXG5cdHByaXZhdGUgX2N1c3RvbVdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGdldCBjdXN0b21XaWR0aCgpOiBudW1iZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY3VzdG9tV2lkdGg7IH1cblxuXHRjb25zdHJ1Y3RvcihjdXN0b21XaWR0aD86IG51bWJlciwgc2lkZWJhckhpZGRlbj86IGJvb2xlYW4pIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2N1c3RvbVdpZHRoID0gY3VzdG9tV2lkdGg7XG5cdFx0dGhpcy5fc2lkZWJhclZpc2libGUgPSAhc2lkZWJhckhpZGRlbjtcblx0fVxuXG5cdC8vIC0tLSBzaWRlYmFyIG1hbmFnZW1lbnQgKG1pcnJvcnMgY3JlYXRlU2lkZWJhciAvIHVwZGF0ZUNvbnRlbnQpIC0tLS0tLS0tLVxuXG5cdGFkZFNpZGViYXIoY29udGVudDogSU1vZGFsRWRpdG9yU2lkZWJhcik6IHZvaWQge1xuXHRcdHRoaXMuX2hhc1NpZGViYXIgPSB0cnVlO1xuXHRcdHRoaXMuX3NpZGViYXJXaWR0aCA9IHRoaXMuX2N1c3RvbVdpZHRoID8/IE1PREFMX1NJREVCQVJfREVGQVVMVF9XSURUSDtcblx0XHR0aGlzLnJlbmRlckNvbnRlbnQoY29udGVudCk7XG5cdH1cblxuXHR1cGRhdGVTaWRlYmFyQ29udGVudChjb250ZW50OiBJTW9kYWxFZGl0b3JTaWRlYmFyKTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHRoaXMucmVuZGVyQ29udGVudChjb250ZW50KTtcblx0fVxuXG5cdHJlbW92ZVNpZGViYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5faGFzU2lkZWJhciA9IGZhbHNlO1xuXHRcdHRoaXMuX3NpZGViYXJXaWR0aCA9IDA7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHR9XG5cblx0dG9nZ2xlU2lkZWJhclZpc2libGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2lkZWJhclZpc2libGUgPSAhdGhpcy5fc2lkZWJhclZpc2libGU7XG5cdFx0dGhpcy5fb25EaWRSZXNpemUuZmlyZSgpO1xuXHR9XG5cblx0LyoqIFJldHVybnMgYWN0dWFsIHdpZHRoIHRha2luZyB2aXNpYmlsaXR5IGludG8gYWNjb3VudCAobWlycm9ycyBnZXRXaWR0aCBpbiBjb250cm9sbGVyKS4gKi9cblx0Z2V0IGVmZmVjdGl2ZVNpZGViYXJXaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zaWRlYmFyVmlzaWJsZSA/IHRoaXMuX3NpZGViYXJXaWR0aCA6IDA7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbnRlbnQoY29udGVudDogSU1vZGFsRWRpdG9yU2lkZWJhcik6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlckNvdW50Kys7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZS52YWx1ZSA9IGNvbnRlbnQucmVuZGVyKHt9IC8qIHN0dWIgY29udGFpbmVyICovLCB0aGlzLl9vbkRpZExheW91dC5ldmVudCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHQvLyAtLS0gcmVzaXplIChtaXJyb3JzIHNhc2ggbG9naWMpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRyZXNpemVTaWRlYmFyKGRlbHRhOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBtYXhXaWR0aCA9IE1hdGgubWF4KE1PREFMX1NJREVCQVJfTUlOX1dJRFRILCB0aGlzLmNvbnRhaW5lcldpZHRoIC0gTU9EQUxfTUlOX1dJRFRIKTtcblx0XHR0aGlzLl9zaWRlYmFyV2lkdGggPSBNYXRoLm1pbihtYXhXaWR0aCwgTWF0aC5tYXgoTU9EQUxfU0lERUJBUl9NSU5fV0lEVEgsIHRoaXMuX3NpZGViYXJXaWR0aCArIGRlbHRhKSk7XG5cdFx0dGhpcy5fY3VzdG9tV2lkdGggPSB0aGlzLl9zaWRlYmFyV2lkdGg7XG5cdFx0dGhpcy5fb25EaWRSZXNpemUuZmlyZSgpO1xuXHR9XG5cblx0cmVzZXRTaWRlYmFyV2lkdGgoKTogdm9pZCB7XG5cdFx0Y29uc3QgbWF4V2lkdGggPSBNYXRoLm1heChNT0RBTF9TSURFQkFSX01JTl9XSURUSCwgdGhpcy5jb250YWluZXJXaWR0aCAtIE1PREFMX01JTl9XSURUSCk7XG5cdFx0dGhpcy5fc2lkZWJhcldpZHRoID0gTWF0aC5taW4obWF4V2lkdGgsIE1PREFMX1NJREVCQVJfREVGQVVMVF9XSURUSCk7XG5cdFx0dGhpcy5fY3VzdG9tV2lkdGggPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWRSZXNpemUuZmlyZSgpO1xuXHR9XG5cblx0Y2xhbXBXaWR0aChtb2RhbFdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2lkZWJhcldpZHRoICsgTU9EQUxfTUlOX1dJRFRIID4gbW9kYWxXaWR0aCkge1xuXHRcdFx0dGhpcy5fc2lkZWJhcldpZHRoID0gTWF0aC5taW4oTU9EQUxfU0lERUJBUl9ERUZBVUxUX1dJRFRILCBNYXRoLm1heChNT0RBTF9TSURFQkFSX01JTl9XSURUSCwgbW9kYWxXaWR0aCAtIE1PREFMX01JTl9XSURUSCkpO1xuXHRcdFx0dGhpcy5fY3VzdG9tV2lkdGggPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZFJlc2l6ZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIG1pbi1zaXplIGNvbXB1dGF0aW9uIChtaXJyb3JzIGNyZWF0ZSBtZXRob2QpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Z2V0IGVmZmVjdGl2ZU1pbldpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1PREFMX01JTl9XSURUSCArICh0aGlzLl9oYXNTaWRlYmFyID8gTU9EQUxfU0lERUJBUl9NSU5fV0lEVEggOiAwKTtcblx0fVxuXG5cdC8vIC0tLSBvcHRpb24gcHJvcGFnYXRpb24gKG1pcnJvcnMgdXBkYXRlT3B0aW9ucyBiZWhhdmlvdXIpIC0tLS0tLS0tLS0tLS0tLVxuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSU1vZGFsRWRpdG9yUGFydE9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAob3B0aW9ucy5zaWRlYmFyKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2hhc1NpZGViYXIpIHtcblx0XHRcdFx0dGhpcy5hZGRTaWRlYmFyKG9wdGlvbnMuc2lkZWJhcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNpZGViYXJDb250ZW50KG9wdGlvbnMuc2lkZWJhcik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zLnNpZGViYXIgPT09IHVuZGVmaW5lZCAmJiB0aGlzLl9oYXNTaWRlYmFyKSB7XG5cdFx0XHQvLyBzaWRlYmFyIGV4cGxpY2l0bHkgcmVtb3ZlZCB3aGVuIGtleSBpcyBhYnNlbnQgYW5kIGhvc3QgaGFzIG9uZVxuXHRcdH1cblx0fVxuXG5cdGxheW91dChoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkTGF5b3V0LmZpcmUoeyBoZWlnaHQsIHdpZHRoOiB0aGlzLl9zaWRlYmFyV2lkdGggfSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc3R1YlNpZGViYXJDb250ZW50KCk6IElNb2RhbEVkaXRvclNpZGViYXIge1xuXHRyZXR1cm4ge1xuXHRcdHJlbmRlcjogKF9jb250YWluZXI6IHVua25vd24sIF9vbkRpZExheW91dDogRXZlbnQ8eyByZWFkb25seSBoZWlnaHQ6IG51bWJlcjsgcmVhZG9ubHkgd2lkdGg6IG51bWJlciB9Pik6IElEaXNwb3NhYmxlID0+IHtcblx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblx0fTtcbn1cblxuc3VpdGUoJ01vZGFsIEVkaXRvciBTaWRlYmFyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLSBvcHRpb24gcHJvcGFnYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ2FkZFNpZGViYXIgc2V0cyBoYXNTaWRlYmFyIGFuZCBkZWZhdWx0IHdpZHRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KCkpO1xuXG5cdFx0aG9zdC5hZGRTaWRlYmFyKHN0dWJTaWRlYmFyQ29udGVudCgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGhhc1NpZGViYXI6IGhvc3QuaGFzU2lkZWJhciwgc2lkZWJhcldpZHRoOiBob3N0LnNpZGViYXJXaWR0aCwgcmVuZGVyQ291bnQ6IGhvc3QucmVuZGVyQ291bnQgfSxcblx0XHRcdHsgaGFzU2lkZWJhcjogdHJ1ZSwgc2lkZWJhcldpZHRoOiBNT0RBTF9TSURFQkFSX0RFRkFVTFRfV0lEVEgsIHJlbmRlckNvdW50OiAxIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVTaWRlYmFyIGNsZWFycyBzaWRlYmFyIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KCkpO1xuXG5cdFx0aG9zdC5hZGRTaWRlYmFyKHN0dWJTaWRlYmFyQ29udGVudCgpKTtcblx0XHRob3N0LnJlbW92ZVNpZGViYXIoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGhhc1NpZGViYXI6IGhvc3QuaGFzU2lkZWJhciwgc2lkZWJhcldpZHRoOiBob3N0LnNpZGViYXJXaWR0aCwgcmVuZGVyQ291bnQ6IGhvc3QucmVuZGVyQ291bnQgfSxcblx0XHRcdHsgaGFzU2lkZWJhcjogZmFsc2UsIHNpZGViYXJXaWR0aDogMCwgcmVuZGVyQ291bnQ6IDEgfVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVNpZGViYXJDb250ZW50IGRpc3Bvc2VzIHByZXZpb3VzIGNvbnRlbnQgYW5kIHJlLXJlbmRlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdE1vZGFsRWRpdG9yU2lkZWJhckhvc3QoKSk7XG5cblx0XHRsZXQgZmlyc3REaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGZpcnN0Q29udGVudDogSU1vZGFsRWRpdG9yU2lkZWJhciA9IHtcblx0XHRcdHJlbmRlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyBmaXJzdERpc3Bvc2VkID0gdHJ1ZTsgfSB9KVxuXHRcdH07XG5cdFx0aG9zdC5hZGRTaWRlYmFyKGZpcnN0Q29udGVudCk7XG5cblx0XHRsZXQgc2Vjb25kUmVuZGVyZWQgPSBmYWxzZTtcblx0XHRjb25zdCBzZWNvbmRDb250ZW50OiBJTW9kYWxFZGl0b3JTaWRlYmFyID0ge1xuXHRcdFx0cmVuZGVyOiAoKSA9PiB7IHNlY29uZFJlbmRlcmVkID0gdHJ1ZTsgcmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07IH1cblx0XHR9O1xuXHRcdGhvc3QudXBkYXRlU2lkZWJhckNvbnRlbnQoc2Vjb25kQ29udGVudCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBmaXJzdERpc3Bvc2VkLCBzZWNvbmRSZW5kZXJlZCwgcmVuZGVyQ291bnQ6IGhvc3QucmVuZGVyQ291bnQgfSxcblx0XHRcdHsgZmlyc3REaXNwb3NlZDogdHJ1ZSwgc2Vjb25kUmVuZGVyZWQ6IHRydWUsIHJlbmRlckNvdW50OiAyIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVPcHRpb25zIGFkZHMgc2lkZWJhciB3aGVuIG5vdCBwcmVzZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KCkpO1xuXG5cdFx0aG9zdC51cGRhdGVPcHRpb25zKHsgc2lkZWJhcjogc3R1YlNpZGViYXJDb250ZW50KCkgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBoYXNTaWRlYmFyOiBob3N0Lmhhc1NpZGViYXIsIHJlbmRlckNvdW50OiBob3N0LnJlbmRlckNvdW50IH0sXG5cdFx0XHR7IGhhc1NpZGViYXI6IHRydWUsIHJlbmRlckNvdW50OiAxIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVPcHRpb25zIHVwZGF0ZXMgc2lkZWJhciBjb250ZW50IHdoZW4gYWxyZWFkeSBwcmVzZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KCkpO1xuXG5cdFx0aG9zdC5hZGRTaWRlYmFyKHN0dWJTaWRlYmFyQ29udGVudCgpKTtcblx0XHRob3N0LnVwZGF0ZU9wdGlvbnMoeyBzaWRlYmFyOiBzdHViU2lkZWJhckNvbnRlbnQoKSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGhhc1NpZGViYXI6IGhvc3QuaGFzU2lkZWJhciwgcmVuZGVyQ291bnQ6IGhvc3QucmVuZGVyQ291bnQgfSxcblx0XHRcdHsgaGFzU2lkZWJhcjogdHJ1ZSwgcmVuZGVyQ291bnQ6IDIgfVxuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBtaW4tc2l6ZSBjb25zdHJhaW50cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ2VmZmVjdGl2ZU1pbldpZHRoIGFjY291bnRzIGZvciBzaWRlYmFyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KCkpO1xuXG5cdFx0Y29uc3Qgd2l0aG91dFNpZGViYXIgPSBob3N0LmVmZmVjdGl2ZU1pbldpZHRoO1xuXG5cdFx0aG9zdC5hZGRTaWRlYmFyKHN0dWJTaWRlYmFyQ29udGVudCgpKTtcblx0XHRjb25zdCB3aXRoU2lkZWJhciA9IGhvc3QuZWZmZWN0aXZlTWluV2lkdGg7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyB3aXRob3V0U2lkZWJhciwgd2l0aFNpZGViYXIgfSxcblx0XHRcdHsgd2l0aG91dFNpZGViYXI6IE1PREFMX01JTl9XSURUSCwgd2l0aFNpZGViYXI6IE1PREFMX01JTl9XSURUSCArIE1PREFMX1NJREVCQVJfTUlOX1dJRFRIIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlZmZlY3RpdmVNaW5XaWR0aCByZXZlcnRzIGFmdGVyIHNpZGViYXIgcmVtb3ZhbCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCgpKTtcblxuXHRcdGhvc3QuYWRkU2lkZWJhcihzdHViU2lkZWJhckNvbnRlbnQoKSk7XG5cdFx0aG9zdC5yZW1vdmVTaWRlYmFyKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdC5lZmZlY3RpdmVNaW5XaWR0aCwgTU9EQUxfTUlOX1dJRFRIKTtcblx0fSk7XG5cblx0Ly8gLS0tIHJlc2l6ZSBjb25zdHJhaW50cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgncmVzaXplU2lkZWJhciBjbGFtcHMgdG8gbWluIHdpZHRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KCkpO1xuXHRcdGhvc3QuYWRkU2lkZWJhcihzdHViU2lkZWJhckNvbnRlbnQoKSk7XG5cblx0XHRob3N0LnJlc2l6ZVNpZGViYXIoLTk5OTkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvc3Quc2lkZWJhcldpZHRoLCBNT0RBTF9TSURFQkFSX01JTl9XSURUSCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2l6ZVNpZGViYXIgY2xhbXBzIHRvIG1heCB3aWR0aCAoY29udGFpbmVyIC0gbW9kYWwgbWluKScsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCgpKTtcblx0XHRob3N0LmNvbnRhaW5lcldpZHRoID0gODAwO1xuXHRcdGhvc3QuYWRkU2lkZWJhcihzdHViU2lkZWJhckNvbnRlbnQoKSk7XG5cblx0XHRob3N0LnJlc2l6ZVNpZGViYXIoOTk5OSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdC5zaWRlYmFyV2lkdGgsIGhvc3QuY29udGFpbmVyV2lkdGggLSBNT0RBTF9NSU5fV0lEVEgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNpemVTaWRlYmFyIGFwcGxpZXMgZGVsdGEgd2l0aGluIGJvdW5kcycsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCgpKTtcblx0XHRob3N0LmNvbnRhaW5lcldpZHRoID0gMTAwMDtcblx0XHRob3N0LmFkZFNpZGViYXIoc3R1YlNpZGViYXJDb250ZW50KCkpO1xuXG5cdFx0aG9zdC5yZXNpemVTaWRlYmFyKDMwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0LnNpZGViYXJXaWR0aCwgTU9EQUxfU0lERUJBUl9ERUZBVUxUX1dJRFRIICsgMzApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNpemVTaWRlYmFyIGZpcmVzIG9uRGlkUmVzaXplJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KCkpO1xuXHRcdGhvc3QuYWRkU2lkZWJhcihzdHViU2lkZWJhckNvbnRlbnQoKSk7XG5cblx0XHRsZXQgZmlyZWQgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaG9zdC5vbkRpZFJlc2l6ZSgoKSA9PiB7IGZpcmVkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0aG9zdC5yZXNpemVTaWRlYmFyKDEwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2V0U2lkZWJhcldpZHRoIHJlc3RvcmVzIGRlZmF1bHQgd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdE1vZGFsRWRpdG9yU2lkZWJhckhvc3QoKSk7XG5cdFx0aG9zdC5jb250YWluZXJXaWR0aCA9IDEwMDA7XG5cdFx0aG9zdC5hZGRTaWRlYmFyKHN0dWJTaWRlYmFyQ29udGVudCgpKTtcblxuXHRcdGhvc3QucmVzaXplU2lkZWJhcigxMDApO1xuXHRcdGhvc3QucmVzZXRTaWRlYmFyV2lkdGgoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0LnNpZGViYXJXaWR0aCwgTU9EQUxfU0lERUJBUl9ERUZBVUxUX1dJRFRIKTtcblx0fSk7XG5cblx0dGVzdCgncmVzZXRTaWRlYmFyV2lkdGggY2xhbXBzIGlmIGNvbnRhaW5lciBzaHJ1bmsnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdE1vZGFsRWRpdG9yU2lkZWJhckhvc3QoKSk7XG5cdFx0aG9zdC5jb250YWluZXJXaWR0aCA9IDEwMDA7XG5cdFx0aG9zdC5hZGRTaWRlYmFyKHN0dWJTaWRlYmFyQ29udGVudCgpKTtcblxuXHRcdC8vIFNocmluayBjb250YWluZXIgc28gdGhhdCBkZWZhdWx0IHdpZHRoIGV4Y2VlZHMgbWF4XG5cdFx0aG9zdC5jb250YWluZXJXaWR0aCA9IE1PREFMX01JTl9XSURUSCArIE1PREFMX1NJREVCQVJfTUlOX1dJRFRIO1xuXHRcdGhvc3QucmVzZXRTaWRlYmFyV2lkdGgoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0LnNpZGViYXJXaWR0aCwgTU9EQUxfU0lERUJBUl9NSU5fV0lEVEgpO1xuXHR9KTtcblxuXHQvLyAtLS0gd2lkdGggcGVyc2lzdGVuY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnYWRkU2lkZWJhciByZXN0b3JlcyBjdXN0b20gd2lkdGggd2hlbiBwcmVzZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KDMwMCkpO1xuXHRcdGhvc3QuY29udGFpbmVyV2lkdGggPSAxMDAwO1xuXG5cdFx0aG9zdC5hZGRTaWRlYmFyKHN0dWJTaWRlYmFyQ29udGVudCgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0LnNpZGViYXJXaWR0aCwgMzAwKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkU2lkZWJhciB1c2VzIGRlZmF1bHQgd2lkdGggd2hlbiBubyBjdXN0b20gd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdE1vZGFsRWRpdG9yU2lkZWJhckhvc3QoKSk7XG5cblx0XHRob3N0LmFkZFNpZGViYXIoc3R1YlNpZGViYXJDb250ZW50KCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvc3Quc2lkZWJhcldpZHRoLCBNT0RBTF9TSURFQkFSX0RFRkFVTFRfV0lEVEgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNpemVTaWRlYmFyIHNldHMgY3VzdG9tIHdpZHRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KCkpO1xuXHRcdGhvc3QuY29udGFpbmVyV2lkdGggPSAxMDAwO1xuXHRcdGhvc3QuYWRkU2lkZWJhcihzdHViU2lkZWJhckNvbnRlbnQoKSk7XG5cblx0XHRob3N0LnJlc2l6ZVNpZGViYXIoNTApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvc3QuY3VzdG9tV2lkdGgsIE1PREFMX1NJREVCQVJfREVGQVVMVF9XSURUSCArIDUwKTtcblx0fSk7XG5cblx0dGVzdCgncmVzZXRTaWRlYmFyV2lkdGggY2xlYXJzIGN1c3RvbSB3aWR0aCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCgpKTtcblx0XHRob3N0LmNvbnRhaW5lcldpZHRoID0gMTAwMDtcblx0XHRob3N0LmFkZFNpZGViYXIoc3R1YlNpZGViYXJDb250ZW50KCkpO1xuXG5cdFx0aG9zdC5yZXNpemVTaWRlYmFyKDUwKTtcblx0XHRob3N0LnJlc2V0U2lkZWJhcldpZHRoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdC5jdXN0b21XaWR0aCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0Ly8gLS0tIGNsYW1wV2lkdGggLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnY2xhbXBXaWR0aCByZXNldHMgdG8gZGVmYXVsdCB3aGVuIHNpZGViYXIgaXMgdG9vIHdpZGUgZm9yIG1vZGFsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KDUwMCkpO1xuXHRcdGhvc3QuY29udGFpbmVyV2lkdGggPSAxMDAwO1xuXHRcdGhvc3QuYWRkU2lkZWJhcihzdHViU2lkZWJhckNvbnRlbnQoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdC5zaWRlYmFyV2lkdGgsIDUwMCk7XG5cblx0XHRob3N0LmNsYW1wV2lkdGgoODAwKTsgLy8gNTAwICsgNDAwIChNT0RBTF9NSU5fV0lEVEgpID4gODAwLCBkZWZhdWx0IDI2MCBmaXRzXG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBzaWRlYmFyV2lkdGg6IGhvc3Quc2lkZWJhcldpZHRoLCBjdXN0b21XaWR0aDogaG9zdC5jdXN0b21XaWR0aCB9LFxuXHRcdFx0eyBzaWRlYmFyV2lkdGg6IE1PREFMX1NJREVCQVJfREVGQVVMVF9XSURUSCwgY3VzdG9tV2lkdGg6IHVuZGVmaW5lZCB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY2xhbXBXaWR0aCBrZWVwcyB3aWR0aCB3aGVuIHNpZGViYXIgZml0cyB3aXRoaW4gbW9kYWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdE1vZGFsRWRpdG9yU2lkZWJhckhvc3QoMzAwKSk7XG5cdFx0aG9zdC5jb250YWluZXJXaWR0aCA9IDEwMDA7XG5cdFx0aG9zdC5hZGRTaWRlYmFyKHN0dWJTaWRlYmFyQ29udGVudCgpKTtcblxuXHRcdGhvc3QuY2xhbXBXaWR0aCgxMDAwKTsgLy8gMzAwICsgNDAwIChNT0RBTF9NSU5fV0lEVEgpIDw9IDEwMDBcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHNpZGViYXJXaWR0aDogaG9zdC5zaWRlYmFyV2lkdGgsIGN1c3RvbVdpZHRoOiBob3N0LmN1c3RvbVdpZHRoIH0sXG5cdFx0XHR7IHNpZGViYXJXaWR0aDogMzAwLCBjdXN0b21XaWR0aDogMzAwIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGFtcFdpZHRoIGZpcmVzIG9uRGlkUmVzaXplIHdoZW4gY2xhbXBpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdE1vZGFsRWRpdG9yU2lkZWJhckhvc3QoNTAwKSk7XG5cdFx0aG9zdC5hZGRTaWRlYmFyKHN0dWJTaWRlYmFyQ29udGVudCgpKTtcblxuXHRcdGxldCBmaXJlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChob3N0Lm9uRGlkUmVzaXplKCgpID0+IHsgZmlyZWQgPSB0cnVlOyB9KSk7XG5cblx0XHRob3N0LmNsYW1wV2lkdGgoNjAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsYW1wV2lkdGggZG9lcyBub3QgZmlyZSBvbkRpZFJlc2l6ZSB3aGVuIG5vdCBjbGFtcGluZycsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCgyMDApKTtcblx0XHRob3N0LmFkZFNpZGViYXIoc3R1YlNpZGViYXJDb250ZW50KCkpO1xuXG5cdFx0bGV0IGZpcmVkID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGhvc3Qub25EaWRSZXNpemUoKCkgPT4geyBmaXJlZCA9IHRydWU7IH0pKTtcblxuXHRcdGhvc3QuY2xhbXBXaWR0aCgxMDAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGFtcFdpZHRoIHVzZXMgY29uc3RyYWluZWQgd2lkdGggd2hlbiBtb2RhbCBpcyB2ZXJ5IG5hcnJvdycsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCg0MDApKTtcblx0XHRob3N0LmFkZFNpZGViYXIoc3R1YlNpZGViYXJDb250ZW50KCkpO1xuXG5cdFx0aG9zdC5jbGFtcFdpZHRoKDUwMCk7IC8vIDQwMCArIDQwMCA+IDUwMCwgZGVmYXVsdCAyNjAgKyA0MDAgPiA1MDAgdG9vXG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBzaWRlYmFyV2lkdGg6IGhvc3Quc2lkZWJhcldpZHRoLCBjdXN0b21XaWR0aDogaG9zdC5jdXN0b21XaWR0aCB9LFxuXHRcdFx0eyBzaWRlYmFyV2lkdGg6IE1PREFMX1NJREVCQVJfTUlOX1dJRFRILCBjdXN0b21XaWR0aDogdW5kZWZpbmVkIH1cblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0gbGF5b3V0IHByb3BhZ2F0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdsYXlvdXQgZmlyZXMgb25EaWRMYXlvdXQgd2l0aCBjdXJyZW50IGRpbWVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdE1vZGFsRWRpdG9yU2lkZWJhckhvc3QoKSk7XG5cdFx0aG9zdC5hZGRTaWRlYmFyKHN0dWJTaWRlYmFyQ29udGVudCgpKTtcblxuXHRcdC8vIENhcHR1cmUgbGF5b3V0IGV2ZW50IGJ5IHJlLWFkZGluZyBjb250ZW50IHRoYXQgdHJhY2tzIGl0XG5cdFx0Y29uc3QgbGF5b3V0czogeyBoZWlnaHQ6IG51bWJlcjsgd2lkdGg6IG51bWJlciB9W10gPSBbXTtcblx0XHRjb25zdCB0cmFja2VkQ29udGVudDogSU1vZGFsRWRpdG9yU2lkZWJhciA9IHtcblx0XHRcdHJlbmRlcjogKF9jb250YWluZXIsIG9uRGlkTGF5b3V0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN1YiA9IG9uRGlkTGF5b3V0KGUgPT4gbGF5b3V0cy5wdXNoKGUpKTtcblx0XHRcdFx0cmV0dXJuIHN1Yjtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGhvc3QudXBkYXRlU2lkZWJhckNvbnRlbnQodHJhY2tlZENvbnRlbnQpO1xuXG5cdFx0aG9zdC5sYXlvdXQoNTAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF5b3V0cywgW3sgaGVpZ2h0OiA1MDAsIHdpZHRoOiBNT0RBTF9TSURFQkFSX0RFRkFVTFRfV0lEVEggfV0pO1xuXHR9KTtcblxuXHQvLyAtLS0gc2lkZWJhciB2aXNpYmlsaXR5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdzaWRlYmFyIGlzIHZpc2libGUgYnkgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCgpKTtcblx0XHRob3N0LmFkZFNpZGViYXIoc3R1YlNpZGViYXJDb250ZW50KCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgdmlzaWJsZTogaG9zdC5zaWRlYmFyVmlzaWJsZSwgZWZmZWN0aXZlV2lkdGg6IGhvc3QuZWZmZWN0aXZlU2lkZWJhcldpZHRoIH0sXG5cdFx0XHR7IHZpc2libGU6IHRydWUsIGVmZmVjdGl2ZVdpZHRoOiBNT0RBTF9TSURFQkFSX0RFRkFVTFRfV0lEVEggfVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvZ2dsZVNpZGViYXJWaXNpYmxlIGhpZGVzIHNpZGViYXIgYW5kIHJldHVybnMgemVybyB3aWR0aCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCgpKTtcblx0XHRob3N0LmFkZFNpZGViYXIoc3R1YlNpZGViYXJDb250ZW50KCkpO1xuXG5cdFx0aG9zdC50b2dnbGVTaWRlYmFyVmlzaWJsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgdmlzaWJsZTogaG9zdC5zaWRlYmFyVmlzaWJsZSwgZWZmZWN0aXZlV2lkdGg6IGhvc3QuZWZmZWN0aXZlU2lkZWJhcldpZHRoIH0sXG5cdFx0XHR7IHZpc2libGU6IGZhbHNlLCBlZmZlY3RpdmVXaWR0aDogMCB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndG9nZ2xlU2lkZWJhclZpc2libGUgdHdpY2UgcmVzdG9yZXMgc2lkZWJhcicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCgpKTtcblx0XHRob3N0LmFkZFNpZGViYXIoc3R1YlNpZGViYXJDb250ZW50KCkpO1xuXG5cdFx0aG9zdC50b2dnbGVTaWRlYmFyVmlzaWJsZSgpO1xuXHRcdGhvc3QudG9nZ2xlU2lkZWJhclZpc2libGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHZpc2libGU6IGhvc3Quc2lkZWJhclZpc2libGUsIGVmZmVjdGl2ZVdpZHRoOiBob3N0LmVmZmVjdGl2ZVNpZGViYXJXaWR0aCB9LFxuXHRcdFx0eyB2aXNpYmxlOiB0cnVlLCBlZmZlY3RpdmVXaWR0aDogTU9EQUxfU0lERUJBUl9ERUZBVUxUX1dJRFRIIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b2dnbGVTaWRlYmFyVmlzaWJsZSBmaXJlcyBvbkRpZFJlc2l6ZScsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCgpKTtcblx0XHRob3N0LmFkZFNpZGViYXIoc3R1YlNpZGViYXJDb250ZW50KCkpO1xuXG5cdFx0bGV0IGZpcmVkID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGhvc3Qub25EaWRSZXNpemUoKCkgPT4geyBmaXJlZCA9IHRydWU7IH0pKTtcblxuXHRcdGhvc3QudG9nZ2xlU2lkZWJhclZpc2libGUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpZGViYXIgaGlkZGVuIHN0YXRlIHBlcnNpc3RzIHZpYSBjb25zdHJ1Y3RvcicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TW9kYWxFZGl0b3JTaWRlYmFySG9zdCh1bmRlZmluZWQsIHRydWUpKTtcblx0XHRob3N0LmFkZFNpZGViYXIoc3R1YlNpZGViYXJDb250ZW50KCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgdmlzaWJsZTogaG9zdC5zaWRlYmFyVmlzaWJsZSwgZWZmZWN0aXZlV2lkdGg6IGhvc3QuZWZmZWN0aXZlU2lkZWJhcldpZHRoIH0sXG5cdFx0XHR7IHZpc2libGU6IGZhbHNlLCBlZmZlY3RpdmVXaWR0aDogMCB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaGlkZGVuIHNpZGViYXIgcHJlc2VydmVzIHdpZHRoIGZvciB3aGVuIHJlc3RvcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNb2RhbEVkaXRvclNpZGViYXJIb3N0KCkpO1xuXHRcdGhvc3QuY29udGFpbmVyV2lkdGggPSAxMDAwO1xuXHRcdGhvc3QuYWRkU2lkZWJhcihzdHViU2lkZWJhckNvbnRlbnQoKSk7XG5cblx0XHRob3N0LnJlc2l6ZVNpZGViYXIoNTApO1xuXHRcdGhvc3QudG9nZ2xlU2lkZWJhclZpc2libGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGVmZmVjdGl2ZVdpZHRoOiBob3N0LmVmZmVjdGl2ZVNpZGViYXJXaWR0aCwgc2lkZWJhcldpZHRoOiBob3N0LnNpZGViYXJXaWR0aCB9LFxuXHRcdFx0eyBlZmZlY3RpdmVXaWR0aDogMCwgc2lkZWJhcldpZHRoOiBNT0RBTF9TSURFQkFSX0RFRkFVTFRfV0lEVEggKyA1MCB9XG5cdFx0KTtcblxuXHRcdGhvc3QudG9nZ2xlU2lkZWJhclZpc2libGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGVmZmVjdGl2ZVdpZHRoOiBob3N0LmVmZmVjdGl2ZVNpZGViYXJXaWR0aCwgc2lkZWJhcldpZHRoOiBob3N0LnNpZGViYXJXaWR0aCB9LFxuXHRcdFx0eyBlZmZlY3RpdmVXaWR0aDogTU9EQUxfU0lERUJBUl9ERUZBVUxUX1dJRFRIICsgNTAsIHNpZGViYXJXaWR0aDogTU9EQUxfU0lERUJBUl9ERUZBVUxUX1dJRFRIICsgNTAgfVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQThCLHlCQUF5QjtBQUM1RSxTQUFTLCtDQUErQztBQUV4RCxTQUFTLDZCQUE2QjtBQUV0QyxNQUFNLGtCQUFrQjtBQUN4QixNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLDhCQUE4QjtBQU1wQyxNQUFNLG1DQUFtQyxXQUFXO0FBQUEsRUE4Qm5ELFlBQVksYUFBc0IsZUFBeUI7QUFDMUQsVUFBTTtBQTdCUCxTQUFpQixlQUFlLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNsRSxTQUFTLGNBQWMsS0FBSyxhQUFhO0FB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
