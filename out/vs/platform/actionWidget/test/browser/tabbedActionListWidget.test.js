import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IContextViewService } from "../../../contextview/browser/contextView.js";
import { IHoverService } from "../../../hover/browser/hover.js";
import { NullHoverService } from "../../../hover/test/browser/nullHoverService.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { IKeybindingService } from "../../../keybinding/common/keybinding.js";
import { MockKeybindingService } from "../../../keybinding/test/common/mockKeybindingService.js";
import { ILayoutService } from "../../../layout/browser/layoutService.js";
import { IOpenerService } from "../../../opener/common/opener.js";
import { NullOpenerService } from "../../../opener/test/common/nullOpenerService.js";
import { ActionListItemKind } from "../../browser/actionList.js";
import { TabbedActionListWidget } from "../../browser/tabbedActionListWidget.js";
function action(id) {
  return { kind: ActionListItemKind.Action, label: id, item: { id } };
}
class FakeContextViewService {
  get isVisible() {
    return !!this._activeDelegate;
  }
  showContextView(delegate, container) {
    this.hideContextView();
    this._activeDelegate = delegate;
    this.lastContainer = container;
    this._container = document.createElement("div");
    (container ?? document.body).appendChild(this._container);
    const result = delegate.render(this._container);
    if (result && typeof result.dispose === "function") {
      this._activeRenderDisposables = result;
    }
    return { close: () => this.hideContextView() };
  }
  hideContextView() {
    const delegate = this._activeDelegate;
    const renderDisposables = this._activeRenderDisposables;
    const container = this._container;
    this._activeDelegate = void 0;
    this._activeRenderDisposables = void 0;
    this._container = void 0;
    delegate?.onHide?.();
    renderDisposables?.dispose();
    container?.remove();
  }
  layout() {
  }
  getContextViewElement() {
    return this._container ?? document.body;
  }
}
function createWidget(disposables) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const contextView = new FakeContextViewService();
  instantiationService.stub(IContextViewService, contextView);
  instantiationService.set(IKeybindingService, new MockKeybindingService());
  instantiationService.set(IHoverService, NullHoverService);
  instantiationService.set(IOpenerService, NullOpenerService);
  instantiationService.stub(ILayoutService, { getContainer: () => document.body, mainContainer: document.body, onDidChangeMainContainer: () => ({ dispose: () => {
  } }) });
  const widget = disposables.add(instantiationService.createInstance(TabbedActionListWidget));
  return { widget, contextView };
}
suite("TabbedActionListWidget", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("construct + dispose without crashing", () => {
    const { widget } = createWidget(disposables);
    assert.strictEqual(widget.isVisible, false);
  });
  test("show() makes the popup visible and hide() dismisses it", () => {
    const { widget } = createWidget(disposables);
    const anchor = document.createElement("div");
    document.body.appendChild(anchor);
    disposables.add({ dispose: () => anchor.remove() });
    widget.show({
      user: "test",
      anchor,
      tabs: [{ id: "Local" }, { id: "Remote" }],
      initialTab: "Local",
      createActionList: () => ({ items: [action("a")] }),
      delegate: { onSelect: () => {
      }, onHide: () => {
      } }
    });
    assert.strictEqual(widget.isVisible, true);
    widget.hide();
    assert.strictEqual(widget.isVisible, false);
  });
  test("buildItems is called with the initial tab", () => {
    const { widget } = createWidget(disposables);
    const anchor = document.createElement("div");
    document.body.appendChild(anchor);
    disposables.add({ dispose: () => anchor.remove() });
    const calls = [];
    widget.show({
      user: "test",
      anchor,
      tabs: [{ id: "Local" }, { id: "Remote" }],
      initialTab: "Remote",
      createActionList: (tab) => {
        calls.push(tab);
        return { items: [action(tab)] };
      },
      delegate: { onSelect: () => {
      }, onHide: () => {
      } }
    });
    assert.deepStrictEqual(calls, ["Remote"]);
  });
  test("hide() then show() resets visibility cleanly", () => {
    const { widget } = createWidget(disposables);
    const anchor = document.createElement("div");
    document.body.appendChild(anchor);
    disposables.add({ dispose: () => anchor.remove() });
    const showOnce = () => widget.show({
      user: "test",
      anchor,
      tabs: [{ id: "Local" }],
      initialTab: "Local",
      createActionList: () => ({ items: [action("a")] }),
      delegate: { onSelect: () => {
      }, onHide: () => {
      } }
    });
    showOnce();
    widget.hide();
    assert.strictEqual(widget.isVisible, false);
    showOnce();
    assert.strictEqual(widget.isVisible, true);
    widget.hide();
  });
  test("onDidHide fires when the popup dismisses", () => {
    const { widget, contextView } = createWidget(disposables);
    const anchor = document.createElement("div");
    document.body.appendChild(anchor);
    disposables.add({ dispose: () => anchor.remove() });
    let hidden = 0;
    disposables.add(widget.onDidHide(() => {
      hidden++;
    }));
    widget.show({
      user: "test",
      anchor,
      tabs: [{ id: "Local" }],
      initialTab: "Local",
      createActionList: () => ({ items: [action("a")] }),
      delegate: { onSelect: () => {
      }, onHide: () => {
      } }
    });
    contextView.hideContextView();
    assert.strictEqual(hidden, 1, `expected onDidHide to fire once, got ${hidden}; widget visible: ${widget.isVisible}`);
    assert.strictEqual(widget.isVisible, false);
  });
  test("supports an explicit popup container and coordinate anchor", () => {
    const { widget, contextView } = createWidget(disposables);
    const popupContainer = document.createElement("div");
    document.body.appendChild(popupContainer);
    disposables.add({ dispose: () => popupContainer.remove() });
    const anchor = { x: 10, y: 20, width: 30, height: 1 };
    widget.show({
      user: "test",
      anchor,
      container: popupContainer,
      tabs: [{ id: "Local" }, { id: "Remote" }],
      initialTab: "Local",
      createActionList: () => ({ items: [action("a")] }),
      delegate: { onSelect: () => {
      }, onHide: () => {
      } }
    });
    assert.deepStrictEqual({
      container: contextView.lastContainer === popupContainer,
      anchor: contextView.getContextViewElement().parentElement === popupContainer
    }, {
      container: true,
      anchor: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uV2lkZ2V0XFx0ZXN0XFxicm93c2VyXFx0YWJiZWRBY3Rpb25MaXN0V2lkZ2V0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld0RlbGVnYXRlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBOdWxsSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaG92ZXIvdGVzdC9icm93c2VyL251bGxIb3ZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNb2NrS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBOdWxsT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL29wZW5lci90ZXN0L2NvbW1vbi9udWxsT3BlbmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0SXRlbSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90YWJiZWRBY3Rpb25MaXN0V2lkZ2V0LmpzJztcblxuaW50ZXJmYWNlIElUZXN0SXRlbSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGFjdGlvbihpZDogc3RyaW5nKTogSUFjdGlvbkxpc3RJdGVtPElUZXN0SXRlbT4ge1xuXHRyZXR1cm4geyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLCBsYWJlbDogaWQsIGl0ZW06IHsgaWQgfSB9O1xufVxuXG4vKipcbiAqIE1pbmltYWwgZmFrZSBgSUNvbnRleHRWaWV3U2VydmljZWAgdGhhdCBjYXB0dXJlcyB0aGUgbW9zdCByZWNlbnQgZGVsZWdhdGVcbiAqIGFuZCBzeW5jaHJvbm91c2x5IGNhbGxzIGByZW5kZXIoKWAgc28gd2UgY2FuIGRyaXZlIHRoZSB3aWRnZXQgd2l0aG91dCBhXG4gKiByZWFsIERPTS1iYWNrZWQgY29udGV4dCB2aWV3LlxuICovXG5jbGFzcyBGYWtlQ29udGV4dFZpZXdTZXJ2aWNlIGltcGxlbWVudHMgUGFydGlhbDxJQ29udGV4dFZpZXdTZXJ2aWNlPiB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjdGl2ZURlbGVnYXRlOiBJQ29udGV4dFZpZXdEZWxlZ2F0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWN0aXZlUmVuZGVyRGlzcG9zYWJsZXM6IHsgZGlzcG9zZSgpOiB2b2lkIH0gfCB1bmRlZmluZWQ7XG5cdGxhc3RDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fYWN0aXZlRGVsZWdhdGU7XG5cdH1cblxuXHRzaG93Q29udGV4dFZpZXcoZGVsZWdhdGU6IElDb250ZXh0Vmlld0RlbGVnYXRlLCBjb250YWluZXI/OiBIVE1MRWxlbWVudCk6IHsgY2xvc2U6ICgpID0+IHZvaWQgfSB7XG5cdFx0Ly8gVGVhciBkb3duIGFueSBwcmV2aW91cyByZW5kZXIgYmVmb3JlIHNob3dpbmcgYSBuZXcgb25lLlxuXHRcdHRoaXMuaGlkZUNvbnRleHRWaWV3KCk7XG5cdFx0dGhpcy5fYWN0aXZlRGVsZWdhdGUgPSBkZWxlZ2F0ZTtcblx0XHR0aGlzLmxhc3RDb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0KGNvbnRhaW5lciA/PyBkb2N1bWVudC5ib2R5KS5hcHBlbmRDaGlsZCh0aGlzLl9jb250YWluZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGRlbGVnYXRlLnJlbmRlcih0aGlzLl9jb250YWluZXIpO1xuXHRcdGlmIChyZXN1bHQgJiYgdHlwZW9mIChyZXN1bHQgYXMgeyBkaXNwb3NlPzogKCkgPT4gdm9pZCB9KS5kaXNwb3NlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVSZW5kZXJEaXNwb3NhYmxlcyA9IHJlc3VsdCBhcyB7IGRpc3Bvc2UoKTogdm9pZCB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBjbG9zZTogKCkgPT4gdGhpcy5oaWRlQ29udGV4dFZpZXcoKSB9O1xuXHR9XG5cblx0aGlkZUNvbnRleHRWaWV3KCk6IHZvaWQge1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gdGhpcy5fYWN0aXZlRGVsZWdhdGU7XG5cdFx0Y29uc3QgcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9hY3RpdmVSZW5kZXJEaXNwb3NhYmxlcztcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLl9jb250YWluZXI7XG5cdFx0dGhpcy5fYWN0aXZlRGVsZWdhdGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYWN0aXZlUmVuZGVyRGlzcG9zYWJsZXMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdC8vIE5vdGlmeSB0aGUgZGVsZWdhdGUgZmlyc3Qgc28gaXRzIGBvbkhpZGVgIHJ1bnMgYWdhaW5zdCB0aGUgc3RpbGwtXG5cdFx0Ly8gbW91bnRlZCBET00sIG1pcnJvcmluZyB0aGUgcmVhbCBgQ29udGV4dFZpZXdgIG9yZGVyLiBUaGUgd2lkZ2V0XG5cdFx0Ly8gdXNlcyB0aGlzIHRvIGZpcmUgaXRzIGNvbnN1bWVyIGBvbkhpZGVgIGNhbGxiYWNrLlxuXHRcdGRlbGVnYXRlPy5vbkhpZGU/LigpO1xuXHRcdHJlbmRlckRpc3Bvc2FibGVzPy5kaXNwb3NlKCk7XG5cdFx0Y29udGFpbmVyPy5yZW1vdmUoKTtcblx0fVxuXG5cdGxheW91dCgpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRnZXRDb250ZXh0Vmlld0VsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXIgPz8gZG9jdW1lbnQuYm9keTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVXaWRnZXQoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHsgd2lkZ2V0OiBUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0OyBjb250ZXh0VmlldzogRmFrZUNvbnRleHRWaWV3U2VydmljZSB9IHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0Y29uc3QgY29udGV4dFZpZXcgPSBuZXcgRmFrZUNvbnRleHRWaWV3U2VydmljZSgpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0Vmlld1NlcnZpY2UsIGNvbnRleHRWaWV3IGFzIElDb250ZXh0Vmlld1NlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUtleWJpbmRpbmdTZXJ2aWNlLCBuZXcgTW9ja0tleWJpbmRpbmdTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUhvdmVyU2VydmljZSwgTnVsbEhvdmVyU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJT3BlbmVyU2VydmljZSwgTnVsbE9wZW5lclNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYXlvdXRTZXJ2aWNlLCB7IGdldENvbnRhaW5lcjogKCkgPT4gZG9jdW1lbnQuYm9keSwgbWFpbkNvbnRhaW5lcjogZG9jdW1lbnQuYm9keSwgb25EaWRDaGFuZ2VNYWluQ29udGFpbmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSkgfSBhcyB1bmtub3duIGFzIElMYXlvdXRTZXJ2aWNlKTtcblxuXHRjb25zdCB3aWRnZXQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGFiYmVkQWN0aW9uTGlzdFdpZGdldCkpO1xuXHRyZXR1cm4geyB3aWRnZXQsIGNvbnRleHRWaWV3IH07XG59XG5cbnN1aXRlKCdUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY29uc3RydWN0ICsgZGlzcG9zZSB3aXRob3V0IGNyYXNoaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0IH0gPSBjcmVhdGVXaWRnZXQoZGlzcG9zYWJsZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuaXNWaXNpYmxlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3coKSBtYWtlcyB0aGUgcG9wdXAgdmlzaWJsZSBhbmQgaGlkZSgpIGRpc21pc3NlcyBpdCcsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCB9ID0gY3JlYXRlV2lkZ2V0KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBhbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGFuY2hvcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gYW5jaG9yLnJlbW92ZSgpIH0pO1xuXG5cdFx0d2lkZ2V0LnNob3c8SVRlc3RJdGVtPih7XG5cdFx0XHR1c2VyOiAndGVzdCcsXG5cdFx0XHRhbmNob3IsXG5cdFx0XHR0YWJzOiBbeyBpZDogJ0xvY2FsJyB9LCB7IGlkOiAnUmVtb3RlJyB9XSxcblx0XHRcdGluaXRpYWxUYWI6ICdMb2NhbCcsXG5cdFx0XHRjcmVhdGVBY3Rpb25MaXN0OiAoKSA9PiAoeyBpdGVtczogW2FjdGlvbignYScpXSB9KSxcblx0XHRcdGRlbGVnYXRlOiB7IG9uU2VsZWN0OiAoKSA9PiB7IH0sIG9uSGlkZTogKCkgPT4geyB9IH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5pc1Zpc2libGUsIHRydWUpO1xuXG5cdFx0d2lkZ2V0LmhpZGUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmlzVmlzaWJsZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZEl0ZW1zIGlzIGNhbGxlZCB3aXRoIHRoZSBpbml0aWFsIHRhYicsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCB9ID0gY3JlYXRlV2lkZ2V0KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBhbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGFuY2hvcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gYW5jaG9yLnJlbW92ZSgpIH0pO1xuXG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0d2lkZ2V0LnNob3c8SVRlc3RJdGVtPih7XG5cdFx0XHR1c2VyOiAndGVzdCcsXG5cdFx0XHRhbmNob3IsXG5cdFx0XHR0YWJzOiBbeyBpZDogJ0xvY2FsJyB9LCB7IGlkOiAnUmVtb3RlJyB9XSxcblx0XHRcdGluaXRpYWxUYWI6ICdSZW1vdGUnLFxuXHRcdFx0Y3JlYXRlQWN0aW9uTGlzdDogKHRhYikgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKHRhYik7XG5cdFx0XHRcdHJldHVybiB7IGl0ZW1zOiBbYWN0aW9uKHRhYildIH07XG5cdFx0XHR9LFxuXHRcdFx0ZGVsZWdhdGU6IHsgb25TZWxlY3Q6ICgpID0+IHsgfSwgb25IaWRlOiAoKSA9PiB7IH0gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnUmVtb3RlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlKCkgdGhlbiBzaG93KCkgcmVzZXRzIHZpc2liaWxpdHkgY2xlYW5seScsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCB9ID0gY3JlYXRlV2lkZ2V0KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBhbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGFuY2hvcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gYW5jaG9yLnJlbW92ZSgpIH0pO1xuXG5cdFx0Y29uc3Qgc2hvd09uY2UgPSAoKSA9PiB3aWRnZXQuc2hvdzxJVGVzdEl0ZW0+KHtcblx0XHRcdHVzZXI6ICd0ZXN0Jyxcblx0XHRcdGFuY2hvcixcblx0XHRcdHRhYnM6IFt7IGlkOiAnTG9jYWwnIH1dLFxuXHRcdFx0aW5pdGlhbFRhYjogJ0xvY2FsJyxcblx0XHRcdGNyZWF0ZUFjdGlvbkxpc3Q6ICgpID0+ICh7IGl0ZW1zOiBbYWN0aW9uKCdhJyldIH0pLFxuXHRcdFx0ZGVsZWdhdGU6IHsgb25TZWxlY3Q6ICgpID0+IHsgfSwgb25IaWRlOiAoKSA9PiB7IH0gfSxcblx0XHR9KTtcblxuXHRcdHNob3dPbmNlKCk7XG5cdFx0d2lkZ2V0LmhpZGUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmlzVmlzaWJsZSwgZmFsc2UpO1xuXHRcdHNob3dPbmNlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5pc1Zpc2libGUsIHRydWUpO1xuXHRcdHdpZGdldC5oaWRlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkSGlkZSBmaXJlcyB3aGVuIHRoZSBwb3B1cCBkaXNtaXNzZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIGNvbnRleHRWaWV3IH0gPSBjcmVhdGVXaWRnZXQoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGFuY2hvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYW5jaG9yKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiBhbmNob3IucmVtb3ZlKCkgfSk7XG5cblx0XHRsZXQgaGlkZGVuID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQod2lkZ2V0Lm9uRGlkSGlkZSgoKSA9PiB7IGhpZGRlbisrOyB9KSk7XG5cdFx0d2lkZ2V0LnNob3c8SVRlc3RJdGVtPih7XG5cdFx0XHR1c2VyOiAndGVzdCcsXG5cdFx0XHRhbmNob3IsXG5cdFx0XHR0YWJzOiBbeyBpZDogJ0xvY2FsJyB9XSxcblx0XHRcdGluaXRpYWxUYWI6ICdMb2NhbCcsXG5cdFx0XHRjcmVhdGVBY3Rpb25MaXN0OiAoKSA9PiAoeyBpdGVtczogW2FjdGlvbignYScpXSB9KSxcblx0XHRcdGRlbGVnYXRlOiB7IG9uU2VsZWN0OiAoKSA9PiB7IH0sIG9uSGlkZTogKCkgPT4geyB9IH0sXG5cdFx0fSk7XG5cblx0XHQvLyBTaW11bGF0ZSBhbiBleHRlcm5hbCBkaXNtaXNzYWwgKGUuZy4gdXNlciBjbGlja2VkIG91dHNpZGUpLlxuXHRcdGNvbnRleHRWaWV3LmhpZGVDb250ZXh0VmlldygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaWRkZW4sIDEsIGBleHBlY3RlZCBvbkRpZEhpZGUgdG8gZmlyZSBvbmNlLCBnb3QgJHtoaWRkZW59OyB3aWRnZXQgdmlzaWJsZTogJHt3aWRnZXQuaXNWaXNpYmxlfWApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuaXNWaXNpYmxlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1cHBvcnRzIGFuIGV4cGxpY2l0IHBvcHVwIGNvbnRhaW5lciBhbmQgY29vcmRpbmF0ZSBhbmNob3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIGNvbnRleHRWaWV3IH0gPSBjcmVhdGVXaWRnZXQoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHBvcHVwQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwb3B1cENvbnRhaW5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gcG9wdXBDb250YWluZXIucmVtb3ZlKCkgfSk7XG5cdFx0Y29uc3QgYW5jaG9yOiBJQW5jaG9yID0geyB4OiAxMCwgeTogMjAsIHdpZHRoOiAzMCwgaGVpZ2h0OiAxIH07XG5cblx0XHR3aWRnZXQuc2hvdzxJVGVzdEl0ZW0+KHtcblx0XHRcdHVzZXI6ICd0ZXN0Jyxcblx0XHRcdGFuY2hvcixcblx0XHRcdGNvbnRhaW5lcjogcG9wdXBDb250YWluZXIsXG5cdFx0XHR0YWJzOiBbeyBpZDogJ0xvY2FsJyB9LCB7IGlkOiAnUmVtb3RlJyB9XSxcblx0XHRcdGluaXRpYWxUYWI6ICdMb2NhbCcsXG5cdFx0XHRjcmVhdGVBY3Rpb25MaXN0OiAoKSA9PiAoeyBpdGVtczogW2FjdGlvbignYScpXSB9KSxcblx0XHRcdGRlbGVnYXRlOiB7IG9uU2VsZWN0OiAoKSA9PiB7IH0sIG9uSGlkZTogKCkgPT4geyB9IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbnRhaW5lcjogY29udGV4dFZpZXcubGFzdENvbnRhaW5lciA9PT0gcG9wdXBDb250YWluZXIsXG5cdFx0XHRhbmNob3I6IGNvbnRleHRWaWV3LmdldENvbnRleHRWaWV3RWxlbWVudCgpLnBhcmVudEVsZW1lbnQgPT09IHBvcHVwQ29udGFpbmVyLFxuXHRcdH0sIHtcblx0XHRcdGNvbnRhaW5lcjogdHJ1ZSxcblx0XHRcdGFuY2hvcjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUErQiwyQkFBMkI7QUFDMUQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMkM7QUFDcEQsU0FBUyw4QkFBOEI7QUFNdkMsU0FBUyxPQUFPLElBQXdDO0FBQ3ZELFNBQU8sRUFBRSxNQUFNLG1CQUFtQixRQUFRLE9BQU8sSUFBSSxNQUFNLEVBQUUsR0FBRyxFQUFFO0FBQ25FO0FBT0EsTUFBTSx1QkFBK0Q7QUFBQSxFQVFwRSxJQUFJLFlBQXFCO0FBQ3hCLFdBQU8sQ0FBQyxDQUFDLEtBQUs7QUFBQSxFQUNmO0FBQUEsRUFFQSxnQkFBZ0IsVUFBZ0MsV0FBZ0Q7QUFFL0YsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxhQUFhLFNBQVMsY0FBYyxLQUFLO0FBQzlDLEtBQUMsYUFBYSxTQUFTLE1BQU0sWUFBWSxLQUFLLFVBQVU7QUFDeEQsVUFBTSxTQUFTLFNBQVMsT0FBTyxLQUFLLFVBQVU7QUFDOUMsUUFBSSxVQUFVLE9BQVEsT0FBb0MsWUFBWSxZQUFZO0FBQ2pGLFdBQUssMkJBQTJCO0FBQUEsSUFDakM7QUFDQSxXQUFPLEVBQUUsT0FBTyxNQUFNLEtBQUssZ0JBQWdCLEVBQUU7QUFBQSxFQUM5QztBQUFBLEVBRUEsa0JBQXdCO0FB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
