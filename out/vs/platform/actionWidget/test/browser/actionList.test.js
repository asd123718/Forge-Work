import assert from "assert";
import { mainWindow } from "../../../../base/browser/window.js";
import { toAction } from "../../../../base/common/actions.js";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { Event as CommonEvent } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { IContextViewService } from "../../../contextview/browser/contextView.js";
import { IHoverService } from "../../../hover/browser/hover.js";
import { NullHoverService } from "../../../hover/test/browser/nullHoverService.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { MockKeybindingService } from "../../../keybinding/test/common/mockKeybindingService.js";
import { IKeybindingService } from "../../../keybinding/common/keybinding.js";
import { ILayoutService } from "../../../layout/browser/layoutService.js";
import { IOpenerService } from "../../../opener/common/opener.js";
import { NullOpenerService } from "../../../opener/test/common/nullOpenerService.js";
import { URI } from "../../../../base/common/uri.js";
import { ActionList, ActionListItemKind, ActionListWidget } from "../../browser/actionList.js";
import { AnchorPosition } from "../../../../base/common/layout.js";
function action(id) {
  return { kind: ActionListItemKind.Action, label: id, item: { id } };
}
function separator(label) {
  return { kind: ActionListItemKind.Separator, label };
}
function createActionListWidget(disposables, options) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.set(IKeybindingService, new MockKeybindingService());
  instantiationService.set(IHoverService, NullHoverService);
  instantiationService.set(IOpenerService, NullOpenerService);
  const delegate = options.onFilter ? {
    onHide: options.onHide ?? (() => {
    }),
    onSelect: () => {
    },
    onFilter: options.onFilter
  } : {
    onHide: options.onHide ?? (() => {
    }),
    onSelect: () => {
    }
  };
  const widget = disposables.add(instantiationService.createInstance(
    ActionListWidget,
    "testActionList",
    false,
    options.items ?? [action("initial")],
    delegate,
    void 0,
    { showFilter: true, ...options.listOptions }
  ));
  if (widget.filterContainer) {
    document.body.appendChild(widget.filterContainer);
    disposables.add({ dispose: () => widget.filterContainer?.remove() });
  }
  const headerContainer = widget.headerContainer;
  if (headerContainer) {
    document.body.appendChild(headerContainer);
    disposables.add({ dispose: () => headerContainer.remove() });
  }
  document.body.appendChild(widget.domNode);
  disposables.add({ dispose: () => widget.domNode.remove() });
  widget.layout(200, 200);
  return widget;
}
function typeFilter(widget, value) {
  assert.ok(widget.filterInput);
  widget.filterInput.value = value;
  widget.filterInput.dispatchEvent(new Event("input"));
}
function getVisibleRowText(widget) {
  return Array.from(widget.domNode.querySelectorAll(".monaco-list-row")).map((row) => row.textContent ?? "").filter((text) => text.length > 0);
}
function withWindowInnerHeight(height, callback) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(mainWindow, "innerHeight");
  Object.defineProperty(mainWindow, "innerHeight", { configurable: true, value: height });
  try {
    return callback();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(mainWindow, "innerHeight", originalDescriptor);
    } else {
      Reflect.deleteProperty(mainWindow, "innerHeight");
    }
  }
}
function createActionList(disposables, items, options) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.set(IKeybindingService, new MockKeybindingService());
  instantiationService.set(IHoverService, NullHoverService);
  instantiationService.set(IOpenerService, NullOpenerService);
  instantiationService.stub(IContextViewService, {
    layout: () => {
    },
    hideContextView: () => {
    },
    getContextViewElement: () => document.body
  });
  instantiationService.stub(ILayoutService, {
    getContainer: () => document.body,
    mainContainer: document.body,
    activeContainer: document.body,
    onDidLayoutMainContainer: CommonEvent.None,
    onDidLayoutContainer: CommonEvent.None,
    onDidLayoutActiveContainer: CommonEvent.None,
    onDidAddContainer: CommonEvent.None,
    onDidChangeActiveContainer: CommonEvent.None
  });
  const list = disposables.add(instantiationService.createInstance(
    ActionList,
    "testActionList",
    false,
    items,
    {
      onHide: () => {
      },
      onSelect: () => {
      }
    },
    void 0,
    { showFilter: true, ...options?.listOptions },
    options?.anchor ?? { x: 10, y: 150, width: 20, height: 20 }
  ));
  const widget = document.createElement("div");
  widget.classList.add("action-widget");
  document.body.appendChild(widget);
  disposables.add({ dispose: () => widget.remove() });
  if (list.filterContainer) {
    widget.appendChild(list.filterContainer);
  }
  widget.appendChild(list.domNode);
  return list;
}
suite("ActionListWidget", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("Escape from a submenu hides the action list", () => {
    let hideCount = 0;
    const widget = createActionListWidget(disposables, {
      items: [{
        ...action("parent"),
        submenuActions: [toAction({ id: "child", label: "Child", run: () => {
        } })]
      }],
      onHide: () => hideCount++
    });
    widget.domNode.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const submenu = widget.domNode.querySelector(".action-list-submenu-panel > .actionList");
    assert.ok(submenu);
    submenu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.strictEqual(hideCount, 1);
  });
  test("runs dynamic filter updates immediately", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const filters = [];
    const widget = createActionListWidget(disposables, {
      onFilter: async (filter) => {
        filters.push(filter);
        return [action(`server-${filter === "ma" ? "ranked" : filter}-result`)];
      }
    });
    typeFilter(widget, "m");
    typeFilter(widget, "ma");
    assert.deepStrictEqual(filters, ["m", "ma"]);
    await timeout(0);
    assert.ok(widget.domNode.textContent?.includes("server-ranked-result"));
  }));
  test("ignores stale dynamic filter results", async () => {
    const firstResult = new DeferredPromise();
    const secondResult = new DeferredPromise();
    const filters = [];
    const widget = createActionListWidget(disposables, {
      onFilter: (filter) => {
        filters.push(filter);
        return filter === "m" ? firstResult.p : secondResult.p;
      }
    });
    typeFilter(widget, "m");
    typeFilter(widget, "ma");
    assert.deepStrictEqual(filters, ["m", "ma"]);
    firstResult.complete([action("ma-stale-result")]);
    await timeout(0);
    assert.ok(!widget.domNode.textContent?.includes("ma-stale-result"));
    secondResult.complete([action("ma-fresh-result")]);
    await timeout(0);
    assert.ok(widget.domNode.textContent?.includes("ma-fresh-result"));
  });
  test("does not filter while an IME composition is in progress", () => {
    const filters = [];
    const widget = createActionListWidget(disposables, {
      onFilter: async (filter) => {
        filters.push(filter);
        return [action(`result-${filter}`)];
      }
    });
    assert.ok(widget.filterInput);
    widget.filterInput.dispatchEvent(new Event("compositionstart"));
    typeFilter(widget, "d");
    typeFilter(widget, "deepseek");
    widget.filterInput.value = "DeepSeek";
    widget.filterInput.dispatchEvent(new Event("compositionend"));
    typeFilter(widget, "DeepSeek");
    assert.deepStrictEqual(filters, ["DeepSeek"]);
  });
  test("cancels an in-flight dynamic filter when a composition starts", async () => {
    const pending = new DeferredPromise();
    const widget = createActionListWidget(disposables, {
      onFilter: () => pending.p
    });
    typeFilter(widget, "d");
    assert.ok(widget.filterInput);
    widget.filterInput.dispatchEvent(new Event("compositionstart"));
    pending.complete([action("stale-result")]);
    await timeout(0);
    assert.ok(!widget.domNode.textContent?.includes("stale-result"));
  });
  test("batches row width writes before reading layout", () => {
    const widget = createActionListWidget(disposables, {
      items: [
        action("first"),
        { ...action("second"), toolbarActions: [toAction({ id: "toolbar", label: "Toolbar", run: () => {
        } })] },
        action("third")
      ]
    });
    const rows = Array.from(widget.domNode.querySelectorAll(".monaco-list-row"));
    const allRowsAutoAtRead = [];
    const measuredWidths = [120, 240, 180];
    for (let i = 0; i < rows.length; i++) {
      rows[i].getBoundingClientRect = () => {
        allRowsAutoAtRead.push(rows.every((row) => row.style.width === "auto"));
        return new mainWindow.DOMRect(0, 0, measuredWidths[i], 24);
      };
    }
    const width = widget.computeMaxWidth(0);
    assert.deepStrictEqual({
      width,
      allRowsAutoAtRead,
      restoredWidths: rows.map((row) => row.style.width)
    }, {
      width: 268,
      allRowsAutoAtRead: [true, true, true],
      restoredWidths: ["", "", ""]
    });
  });
  test("keeps titled separator above first filtered match", () => {
    const widget = createActionListWidget(disposables, {
      items: [
        separator("Provider A"),
        action("alpha"),
        separator("Provider B"),
        action("beta")
      ]
    });
    typeFilter(widget, "alpha");
    assert.deepStrictEqual(getVisibleRowText(widget), ["Provider A", "alpha"]);
  });
  test("keeps only titled separators for sections with filtered matches", () => {
    const widget = createActionListWidget(disposables, {
      items: [
        separator("Provider A"),
        action("alpha"),
        separator("Provider B"),
        action("beta"),
        separator("Provider C"),
        action("gamma")
      ]
    });
    typeFilter(widget, "beta");
    assert.deepStrictEqual(getVisibleRowText(widget), ["Provider B", "beta"]);
  });
  test("leaves room for action widget chrome when clamping dynamic height", () => withWindowInnerHeight(300, () => {
    const list = createActionList(disposables, Array.from({ length: 50 }, (_, i) => action(`item-${i}`)));
    list.layout(200);
    const filterHeight = 36;
    const widget = list.domNode.parentElement;
    const style = mainWindow.getComputedStyle(widget);
    const toPixels = (value) => Number.parseFloat(value) || 0;
    const actionWidgetVerticalChromeHeight = toPixels(style.paddingTop) + toPixels(style.paddingBottom) + toPixels(style.borderTopWidth) + toPixels(style.borderBottomWidth);
    const availableSpaceAboveAnchor = 150;
    const listHeight = parseFloat(list.domNode.style.height);
    assert.ok(listHeight + filterHeight + actionWidgetVerticalChromeHeight <= availableSpaceAboveAnchor);
  }));
  test("forced above anchor position can clamp dynamic height without the default minimum floor", () => withWindowInnerHeight(300, () => {
    const list = createActionList(disposables, Array.from({ length: 50 }, (_, i) => action(`item-${i}`)), {
      listOptions: { anchorPosition: AnchorPosition.ABOVE },
      anchor: { x: 10, y: 20, width: 20, height: 20 }
    });
    list.layout(200);
    assert.deepStrictEqual(
      { anchorPosition: list.anchorPosition, listHeight: parseFloat(list.domNode.style.height) },
      { anchorPosition: AnchorPosition.ABOVE, listHeight: 0 }
    );
  }));
  test("header dismiss removes the banner and requests a re-layout", () => {
    let dismissed = false;
    let layoutRequested = false;
    const widget = createActionListWidget(disposables, {
      listOptions: { headerText: "Cache hint", headerDismiss: () => {
        dismissed = true;
      } }
    });
    disposables.add(widget.onDidRequestLayout(() => {
      layoutRequested = true;
    }));
    const header = widget.headerContainer;
    assert.ok(header, "header banner should render when headerText + headerDismiss are set");
    const dismissButton = header.querySelector(".action-list-header-dismiss");
    assert.ok(dismissButton, "dismiss button should render");
    dismissButton.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    assert.deepStrictEqual(
      { dismissed, layoutRequested, headerCleared: widget.headerContainer === void 0, headerStillInDom: header.isConnected },
      { dismissed: true, layoutRequested: true, headerCleared: true, headerStillInDom: false }
    );
  });
  test("shows a row hover panel once the hover delay elapses", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const widget = createActionListWidget(disposables, {
      items: [{ ...action("auto"), hover: { content: "Auto routes based on your task" } }, action("other")],
      listOptions: { headerText: "Cache hint" }
    });
    const panel = widget.domNode.querySelector(".action-list-submenu-panel");
    widget.domNode.querySelector(".monaco-list-row").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await timeout(1e3);
    assert.deepStrictEqual({ display: panel.style.display, text: panel.textContent }, { display: "", text: "Auto routes based on your task" });
  }));
  test("does not open a row hover panel once the pointer has left the list", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const widget = createActionListWidget(disposables, {
      items: [{ ...action("auto"), hover: { content: "Auto routes based on your task" } }, action("other")],
      listOptions: { headerText: "Cache hint" }
    });
    const panel = widget.domNode.querySelector(".action-list-submenu-panel");
    widget.domNode.querySelector(".monaco-list-row").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    widget.domNode.dispatchEvent(new MouseEvent("mouseleave"));
    await timeout(1e3);
    assert.deepStrictEqual({ display: panel.style.display, text: panel.textContent }, { display: "none", text: "" });
  }));
  test("dismisses an open row hover panel when the pointer reaches the header banner", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const widget = createActionListWidget(disposables, {
      items: [{ ...action("auto"), hover: { content: "Auto routes based on your task" } }, action("other")],
      listOptions: { headerText: "Cache hint" }
    });
    const panel = widget.domNode.querySelector(".action-list-submenu-panel");
    widget.domNode.querySelector(".monaco-list-row").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await timeout(600);
    const openedWhileOnRow = panel.textContent;
    widget.domNode.dispatchEvent(new MouseEvent("mouseleave"));
    widget.headerContainer.dispatchEvent(new MouseEvent("mouseenter"));
    assert.deepStrictEqual(
      { openedWhileOnRow, display: panel.style.display, text: panel.textContent },
      { openedWhileOnRow: "Auto routes based on your task", display: "none", text: "" }
    );
  }));
  test('header renders a "Learn more" link to the given uri', () => {
    const widget = createActionListWidget(disposables, {
      listOptions: { headerText: "Cache hint", headerLink: { label: "Learn more", uri: URI.parse("https://aka.ms/test") } }
    });
    const link = widget.headerContainer?.querySelector("a.monaco-link");
    assert.ok(link, 'a "Learn more" link should render in the header');
    assert.deepStrictEqual(
      { text: link.textContent, href: link.getAttribute("href") },
      { text: "Learn more", href: "https://aka.ms/test" }
    );
  });
  test("focuses the configured initial item when opened", () => {
    const widget = createActionListWidget(disposables, {
      items: [action("first"), action("active"), action("last")],
      listOptions: { initialFocusItemId: "active" }
    });
    widget.focus();
    assert.strictEqual(widget.getFocusedElement()?.item?.id, "active");
  });
  test("consumes initial focus before later filtering and refocusing", () => {
    const widget = createActionListWidget(disposables, {
      items: [action("match-first"), action("match-initial"), action("other")],
      listOptions: { initialFocusItemId: "match-initial" }
    });
    widget.focus();
    widget.focusPrevious();
    typeFilter(widget, "match");
    widget.focus();
    assert.strictEqual(widget.getFocusedElement()?.item?.id, "match-first");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uV2lkZ2V0XFx0ZXN0XFxicm93c2VyXFxhY3Rpb25MaXN0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgYXMgQ29tbW9uRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBOdWxsSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaG92ZXIvdGVzdC9icm93c2VyL251bGxIb3ZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgTW9ja0tleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBOdWxsT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL29wZW5lci90ZXN0L2NvbW1vbi9udWxsT3BlbmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdCwgQWN0aW9uTGlzdEl0ZW1LaW5kLCBBY3Rpb25MaXN0V2lkZ2V0LCBJQWN0aW9uTGlzdEl0ZW0sIElBY3Rpb25MaXN0T3B0aW9ucyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBBbmNob3JQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xheW91dC5qcyc7XG5cbmludGVyZmFjZSBJVGVzdEFjdGlvbkl0ZW0ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBhY3Rpb24oaWQ6IHN0cmluZyk6IElBY3Rpb25MaXN0SXRlbTxJVGVzdEFjdGlvbkl0ZW0+IHtcblx0cmV0dXJuIHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiwgbGFiZWw6IGlkLCBpdGVtOiB7IGlkIH0gfTtcbn1cblxuZnVuY3Rpb24gc2VwYXJhdG9yKGxhYmVsPzogc3RyaW5nKTogSUFjdGlvbkxpc3RJdGVtPElUZXN0QWN0aW9uSXRlbT4ge1xuXHRyZXR1cm4geyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbCB9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzOiBSZXR1cm5UeXBlPHR5cGVvZiBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGU+LCBvcHRpb25zOiB7XG5cdHJlYWRvbmx5IGl0ZW1zPzogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPElUZXN0QWN0aW9uSXRlbT5bXTtcblx0cmVhZG9ubHkgb25GaWx0ZXI/OiAoZmlsdGVyOiBzdHJpbmcsIGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxyZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08SVRlc3RBY3Rpb25JdGVtPltdPjtcblx0cmVhZG9ubHkgb25IaWRlPzogKCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgbGlzdE9wdGlvbnM/OiBQYXJ0aWFsPElBY3Rpb25MaXN0T3B0aW9ucz47XG59KTogQWN0aW9uTGlzdFdpZGdldDxJVGVzdEFjdGlvbkl0ZW0+IHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElLZXliaW5kaW5nU2VydmljZSwgbmV3IE1vY2tLZXliaW5kaW5nU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElIb3ZlclNlcnZpY2UsIE51bGxIb3ZlclNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSU9wZW5lclNlcnZpY2UsIE51bGxPcGVuZXJTZXJ2aWNlKTtcblx0Y29uc3QgZGVsZWdhdGUgPSBvcHRpb25zLm9uRmlsdGVyXG5cdFx0PyB7XG5cdFx0XHRvbkhpZGU6IG9wdGlvbnMub25IaWRlID8/ICgoKSA9PiB7IH0pLFxuXHRcdFx0b25TZWxlY3Q6ICgpID0+IHsgfSxcblx0XHRcdG9uRmlsdGVyOiBvcHRpb25zLm9uRmlsdGVyLFxuXHRcdH1cblx0XHQ6IHtcblx0XHRcdG9uSGlkZTogb3B0aW9ucy5vbkhpZGUgPz8gKCgpID0+IHsgfSksXG5cdFx0XHRvblNlbGVjdDogKCkgPT4geyB9LFxuXHRcdH07XG5cblx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdEFjdGlvbkxpc3RXaWRnZXQ8SVRlc3RBY3Rpb25JdGVtPixcblx0XHQndGVzdEFjdGlvbkxpc3QnLFxuXHRcdGZhbHNlLFxuXHRcdG9wdGlvbnMuaXRlbXMgPz8gW2FjdGlvbignaW5pdGlhbCcpXSxcblx0XHRkZWxlZ2F0ZSxcblx0XHR1bmRlZmluZWQsXG5cdFx0eyBzaG93RmlsdGVyOiB0cnVlLCAuLi5vcHRpb25zLmxpc3RPcHRpb25zIH0sXG5cdCkpO1xuXG5cdGlmICh3aWRnZXQuZmlsdGVyQ29udGFpbmVyKSB7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3aWRnZXQuZmlsdGVyQ29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiB3aWRnZXQuZmlsdGVyQ29udGFpbmVyPy5yZW1vdmUoKSB9KTtcblx0fVxuXHQvLyBUaGUgaGVhZGVyIGJhbm5lciBpcyBhIHN0YW5kYWxvbmUgZWxlbWVudCB0aGUgY2FsbGVyIGF0dGFjaGVzIChsaWtlIHRoZVxuXHQvLyBmaWx0ZXIgY29udGFpbmVyKSwgc28gdGhlIHRlc3QgYXBwZW5kcyBpdCB0byBleGVyY2lzZSBoZWFkZXIgYmVoYXZpb3JzLlxuXHRjb25zdCBoZWFkZXJDb250YWluZXIgPSB3aWRnZXQuaGVhZGVyQ29udGFpbmVyO1xuXHRpZiAoaGVhZGVyQ29udGFpbmVyKSB7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChoZWFkZXJDb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGhlYWRlckNvbnRhaW5lci5yZW1vdmUoKSB9KTtcblx0fVxuXHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gd2lkZ2V0LmRvbU5vZGUucmVtb3ZlKCkgfSk7XG5cdHdpZGdldC5sYXlvdXQoMjAwLCAyMDApO1xuXG5cdHJldHVybiB3aWRnZXQ7XG59XG5cbmZ1bmN0aW9uIHR5cGVGaWx0ZXIod2lkZ2V0OiBBY3Rpb25MaXN0V2lkZ2V0PElUZXN0QWN0aW9uSXRlbT4sIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0YXNzZXJ0Lm9rKHdpZGdldC5maWx0ZXJJbnB1dCk7XG5cdHdpZGdldC5maWx0ZXJJbnB1dC52YWx1ZSA9IHZhbHVlO1xuXHR3aWRnZXQuZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JykpO1xufVxuXG5mdW5jdGlvbiBnZXRWaXNpYmxlUm93VGV4dCh3aWRnZXQ6IEFjdGlvbkxpc3RXaWRnZXQ8SVRlc3RBY3Rpb25JdGVtPik6IHN0cmluZ1tdIHtcblx0cmV0dXJuIEFycmF5LmZyb20od2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5tb25hY28tbGlzdC1yb3cnKSlcblx0XHQubWFwKHJvdyA9PiByb3cudGV4dENvbnRlbnQgPz8gJycpXG5cdFx0LmZpbHRlcih0ZXh0ID0+IHRleHQubGVuZ3RoID4gMCk7XG59XG5cbmZ1bmN0aW9uIHdpdGhXaW5kb3dJbm5lckhlaWdodDxUPihoZWlnaHQ6IG51bWJlciwgY2FsbGJhY2s6ICgpID0+IFQpOiBUIHtcblx0Y29uc3Qgb3JpZ2luYWxEZXNjcmlwdG9yID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihtYWluV2luZG93LCAnaW5uZXJIZWlnaHQnKTtcblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG1haW5XaW5kb3csICdpbm5lckhlaWdodCcsIHsgY29uZmlndXJhYmxlOiB0cnVlLCB2YWx1ZTogaGVpZ2h0IH0pO1xuXHR0cnkge1xuXHRcdHJldHVybiBjYWxsYmFjaygpO1xuXHR9IGZpbmFsbHkge1xuXHRcdGlmIChvcmlnaW5hbERlc2NyaXB0b3IpIHtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShtYWluV2luZG93LCAnaW5uZXJIZWlnaHQnLCBvcmlnaW5hbERlc2NyaXB0b3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRSZWZsZWN0LmRlbGV0ZVByb3BlcnR5KG1haW5XaW5kb3csICdpbm5lckhlaWdodCcpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVBY3Rpb25MaXN0KGRpc3Bvc2FibGVzOiBSZXR1cm5UeXBlPHR5cGVvZiBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGU+LCBpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPElUZXN0QWN0aW9uSXRlbT5bXSwgb3B0aW9ucz86IHtcblx0cmVhZG9ubHkgbGlzdE9wdGlvbnM/OiBQYXJ0aWFsPElBY3Rpb25MaXN0T3B0aW9ucz47XG5cdHJlYWRvbmx5IGFuY2hvcj86IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH07XG59KTogQWN0aW9uTGlzdDxJVGVzdEFjdGlvbkl0ZW0+IHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElLZXliaW5kaW5nU2VydmljZSwgbmV3IE1vY2tLZXliaW5kaW5nU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElIb3ZlclNlcnZpY2UsIE51bGxIb3ZlclNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSU9wZW5lclNlcnZpY2UsIE51bGxPcGVuZXJTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0bGF5b3V0OiAoKSA9PiB7IH0sXG5cdFx0aGlkZUNvbnRleHRWaWV3OiAoKSA9PiB7IH0sXG5cdFx0Z2V0Q29udGV4dFZpZXdFbGVtZW50OiAoKSA9PiBkb2N1bWVudC5ib2R5LFxuXHR9IGFzIFBhcnRpYWw8SUNvbnRleHRWaWV3U2VydmljZT4gYXMgSUNvbnRleHRWaWV3U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxheW91dFNlcnZpY2UsIHtcblx0XHRnZXRDb250YWluZXI6ICgpID0+IGRvY3VtZW50LmJvZHksXG5cdFx0bWFpbkNvbnRhaW5lcjogZG9jdW1lbnQuYm9keSxcblx0XHRhY3RpdmVDb250YWluZXI6IGRvY3VtZW50LmJvZHksXG5cdFx0b25EaWRMYXlvdXRNYWluQ29udGFpbmVyOiBDb21tb25FdmVudC5Ob25lLFxuXHRcdG9uRGlkTGF5b3V0Q29udGFpbmVyOiBDb21tb25FdmVudC5Ob25lLFxuXHRcdG9uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyOiBDb21tb25FdmVudC5Ob25lLFxuXHRcdG9uRGlkQWRkQ29udGFpbmVyOiBDb21tb25FdmVudC5Ob25lLFxuXHRcdG9uRGlkQ2hhbmdlQWN0aXZlQ29udGFpbmVyOiBDb21tb25FdmVudC5Ob25lLFxuXHR9IGFzIFBhcnRpYWw8SUxheW91dFNlcnZpY2U+IGFzIElMYXlvdXRTZXJ2aWNlKTtcblxuXHRjb25zdCBsaXN0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdEFjdGlvbkxpc3Q8SVRlc3RBY3Rpb25JdGVtPixcblx0XHQndGVzdEFjdGlvbkxpc3QnLFxuXHRcdGZhbHNlLFxuXHRcdGl0ZW1zLFxuXHRcdHtcblx0XHRcdG9uSGlkZTogKCkgPT4geyB9LFxuXHRcdFx0b25TZWxlY3Q6ICgpID0+IHsgfSxcblx0XHR9LFxuXHRcdHVuZGVmaW5lZCxcblx0XHR7IHNob3dGaWx0ZXI6IHRydWUsIC4uLm9wdGlvbnM/Lmxpc3RPcHRpb25zIH0sXG5cdFx0b3B0aW9ucz8uYW5jaG9yID8/IHsgeDogMTAsIHk6IDE1MCwgd2lkdGg6IDIwLCBoZWlnaHQ6IDIwIH0sXG5cdCkpO1xuXG5cdGNvbnN0IHdpZGdldCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHR3aWRnZXQuY2xhc3NMaXN0LmFkZCgnYWN0aW9uLXdpZGdldCcpO1xuXHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHdpZGdldCk7XG5cdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHdpZGdldC5yZW1vdmUoKSB9KTtcblx0aWYgKGxpc3QuZmlsdGVyQ29udGFpbmVyKSB7XG5cdFx0d2lkZ2V0LmFwcGVuZENoaWxkKGxpc3QuZmlsdGVyQ29udGFpbmVyKTtcblx0fVxuXHR3aWRnZXQuYXBwZW5kQ2hpbGQobGlzdC5kb21Ob2RlKTtcblxuXHRyZXR1cm4gbGlzdDtcbn1cblxuc3VpdGUoJ0FjdGlvbkxpc3RXaWRnZXQnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnRXNjYXBlIGZyb20gYSBzdWJtZW51IGhpZGVzIHRoZSBhY3Rpb24gbGlzdCcsICgpID0+IHtcblx0XHRsZXQgaGlkZUNvdW50ID0gMDtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRpdGVtczogW3tcblx0XHRcdFx0Li4uYWN0aW9uKCdwYXJlbnQnKSxcblx0XHRcdFx0c3VibWVudUFjdGlvbnM6IFt0b0FjdGlvbih7IGlkOiAnY2hpbGQnLCBsYWJlbDogJ0NoaWxkJywgcnVuOiAoKSA9PiB7IH0gfSldLFxuXHRcdFx0fV0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IGhpZGVDb3VudCsrLFxuXHRcdH0pO1xuXG5cdFx0d2lkZ2V0LmRvbU5vZGUuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnQXJyb3dSaWdodCcsIGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHN1Ym1lbnUgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmFjdGlvbi1saXN0LXN1Ym1lbnUtcGFuZWwgPiAuYWN0aW9uTGlzdCcpO1xuXHRcdGFzc2VydC5vayhzdWJtZW51KTtcblx0XHRzdWJtZW51LmRpc3BhdGNoRXZlbnQobmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJ0VzY2FwZScsIGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpZGVDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bnMgZHluYW1pYyBmaWx0ZXIgdXBkYXRlcyBpbW1lZGlhdGVseScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbHRlcnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlQWN0aW9uTGlzdFdpZGdldChkaXNwb3NhYmxlcywge1xuXHRcdFx0b25GaWx0ZXI6IGFzeW5jIGZpbHRlciA9PiB7XG5cdFx0XHRcdGZpbHRlcnMucHVzaChmaWx0ZXIpO1xuXHRcdFx0XHRyZXR1cm4gW2FjdGlvbihgc2VydmVyLSR7ZmlsdGVyID09PSAnbWEnID8gJ3JhbmtlZCcgOiBmaWx0ZXJ9LXJlc3VsdGApXTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR0eXBlRmlsdGVyKHdpZGdldCwgJ20nKTtcblx0XHR0eXBlRmlsdGVyKHdpZGdldCwgJ21hJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWx0ZXJzLCBbJ20nLCAnbWEnXSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdzZXJ2ZXItcmFua2VkLXJlc3VsdCcpKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2lnbm9yZXMgc3RhbGUgZHluYW1pYyBmaWx0ZXIgcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaXJzdFJlc3VsdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8cmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPElUZXN0QWN0aW9uSXRlbT5bXT4oKTtcblx0XHRjb25zdCBzZWNvbmRSZXN1bHQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxJVGVzdEFjdGlvbkl0ZW0+W10+KCk7XG5cdFx0Y29uc3QgZmlsdGVyczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRvbkZpbHRlcjogZmlsdGVyID0+IHtcblx0XHRcdFx0ZmlsdGVycy5wdXNoKGZpbHRlcik7XG5cdFx0XHRcdHJldHVybiBmaWx0ZXIgPT09ICdtJyA/IGZpcnN0UmVzdWx0LnAgOiBzZWNvbmRSZXN1bHQucDtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR0eXBlRmlsdGVyKHdpZGdldCwgJ20nKTtcblx0XHR0eXBlRmlsdGVyKHdpZGdldCwgJ21hJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWx0ZXJzLCBbJ20nLCAnbWEnXSk7XG5cblx0XHRmaXJzdFJlc3VsdC5jb21wbGV0ZShbYWN0aW9uKCdtYS1zdGFsZS1yZXN1bHQnKV0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0Lm9rKCF3aWRnZXQuZG9tTm9kZS50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ21hLXN0YWxlLXJlc3VsdCcpKTtcblxuXHRcdHNlY29uZFJlc3VsdC5jb21wbGV0ZShbYWN0aW9uKCdtYS1mcmVzaC1yZXN1bHQnKV0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLnRleHRDb250ZW50Py5pbmNsdWRlcygnbWEtZnJlc2gtcmVzdWx0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBmaWx0ZXIgd2hpbGUgYW4gSU1FIGNvbXBvc2l0aW9uIGlzIGluIHByb2dyZXNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbHRlcnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlQWN0aW9uTGlzdFdpZGdldChkaXNwb3NhYmxlcywge1xuXHRcdFx0b25GaWx0ZXI6IGFzeW5jIGZpbHRlciA9PiB7XG5cdFx0XHRcdGZpbHRlcnMucHVzaChmaWx0ZXIpO1xuXHRcdFx0XHRyZXR1cm4gW2FjdGlvbihgcmVzdWx0LSR7ZmlsdGVyfWApXTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2sod2lkZ2V0LmZpbHRlcklucHV0KTtcblx0XHR3aWRnZXQuZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NvbXBvc2l0aW9uc3RhcnQnKSk7XG5cdFx0dHlwZUZpbHRlcih3aWRnZXQsICdkJyk7XG5cdFx0dHlwZUZpbHRlcih3aWRnZXQsICdkZWVwc2VlaycpO1xuXHRcdHdpZGdldC5maWx0ZXJJbnB1dC52YWx1ZSA9ICdEZWVwU2Vlayc7XG5cdFx0d2lkZ2V0LmZpbHRlcklucHV0LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdjb21wb3NpdGlvbmVuZCcpKTtcblx0XHQvLyBDaHJvbWl1bSBmaXJlcyBhIHRyYWlsaW5nIGBpbnB1dGAgZm9yIHRoZSBjb21taXR0ZWQgdGV4dCwgd2hpY2ggbXVzdCBub3QgcmUtZmlsdGVyLlxuXHRcdHR5cGVGaWx0ZXIod2lkZ2V0LCAnRGVlcFNlZWsnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlsdGVycywgWydEZWVwU2VlayddKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuY2VscyBhbiBpbi1mbGlnaHQgZHluYW1pYyBmaWx0ZXIgd2hlbiBhIGNvbXBvc2l0aW9uIHN0YXJ0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwZW5kaW5nID0gbmV3IERlZmVycmVkUHJvbWlzZTxyZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08SVRlc3RBY3Rpb25JdGVtPltdPigpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZUFjdGlvbkxpc3RXaWRnZXQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdG9uRmlsdGVyOiAoKSA9PiBwZW5kaW5nLnAsXG5cdFx0fSk7XG5cblx0XHR0eXBlRmlsdGVyKHdpZGdldCwgJ2QnKTtcblx0XHRhc3NlcnQub2sod2lkZ2V0LmZpbHRlcklucHV0KTtcblx0XHR3aWRnZXQuZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NvbXBvc2l0aW9uc3RhcnQnKSk7XG5cblx0XHQvLyBSZXNvbHZpbmcgbm93IG11c3Qgbm90IHNwbGljZS9yZS1sYXlvdXQgdGhlIGxpc3QgdW5kZXJuZWF0aCB0aGUgSU1FIGNhbmRpZGF0ZSB3aW5kb3cuXG5cdFx0cGVuZGluZy5jb21wbGV0ZShbYWN0aW9uKCdzdGFsZS1yZXN1bHQnKV0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0Lm9rKCF3aWRnZXQuZG9tTm9kZS50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ3N0YWxlLXJlc3VsdCcpKTtcblx0fSk7XG5cblx0dGVzdCgnYmF0Y2hlcyByb3cgd2lkdGggd3JpdGVzIGJlZm9yZSByZWFkaW5nIGxheW91dCcsICgpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRpdGVtczogW1xuXHRcdFx0XHRhY3Rpb24oJ2ZpcnN0JyksXG5cdFx0XHRcdHsgLi4uYWN0aW9uKCdzZWNvbmQnKSwgdG9vbGJhckFjdGlvbnM6IFt0b0FjdGlvbih7IGlkOiAndG9vbGJhcicsIGxhYmVsOiAnVG9vbGJhcicsIHJ1bjogKCkgPT4geyB9IH0pXSB9LFxuXHRcdFx0XHRhY3Rpb24oJ3RoaXJkJyksXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJvd3MgPSBBcnJheS5mcm9tKHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcubW9uYWNvLWxpc3Qtcm93JykpO1xuXHRcdGNvbnN0IGFsbFJvd3NBdXRvQXRSZWFkOiBib29sZWFuW10gPSBbXTtcblx0XHRjb25zdCBtZWFzdXJlZFdpZHRocyA9IFsxMjAsIDI0MCwgMTgwXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdHJvd3NbaV0uZ2V0Qm91bmRpbmdDbGllbnRSZWN0ID0gKCkgPT4ge1xuXHRcdFx0XHRhbGxSb3dzQXV0b0F0UmVhZC5wdXNoKHJvd3MuZXZlcnkocm93ID0+IHJvdy5zdHlsZS53aWR0aCA9PT0gJ2F1dG8nKSk7XG5cdFx0XHRcdHJldHVybiBuZXcgbWFpbldpbmRvdy5ET01SZWN0KDAsIDAsIG1lYXN1cmVkV2lkdGhzW2ldLCAyNCk7XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpZHRoID0gd2lkZ2V0LmNvbXB1dGVNYXhXaWR0aCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2lkdGgsXG5cdFx0XHRhbGxSb3dzQXV0b0F0UmVhZCxcblx0XHRcdHJlc3RvcmVkV2lkdGhzOiByb3dzLm1hcChyb3cgPT4gcm93LnN0eWxlLndpZHRoKSxcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogMjY4LFxuXHRcdFx0YWxsUm93c0F1dG9BdFJlYWQ6IFt0cnVlLCB0cnVlLCB0cnVlXSxcblx0XHRcdHJlc3RvcmVkV2lkdGhzOiBbJycsICcnLCAnJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHRpdGxlZCBzZXBhcmF0b3IgYWJvdmUgZmlyc3QgZmlsdGVyZWQgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlQWN0aW9uTGlzdFdpZGdldChkaXNwb3NhYmxlcywge1xuXHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0c2VwYXJhdG9yKCdQcm92aWRlciBBJyksXG5cdFx0XHRcdGFjdGlvbignYWxwaGEnKSxcblx0XHRcdFx0c2VwYXJhdG9yKCdQcm92aWRlciBCJyksXG5cdFx0XHRcdGFjdGlvbignYmV0YScpLFxuXHRcdFx0XSxcblx0XHR9KTtcblxuXHRcdHR5cGVGaWx0ZXIod2lkZ2V0LCAnYWxwaGEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0VmlzaWJsZVJvd1RleHQod2lkZ2V0KSwgWydQcm92aWRlciBBJywgJ2FscGhhJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBvbmx5IHRpdGxlZCBzZXBhcmF0b3JzIGZvciBzZWN0aW9ucyB3aXRoIGZpbHRlcmVkIG1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlQWN0aW9uTGlzdFdpZGdldChkaXNwb3NhYmxlcywge1xuXHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0c2VwYXJhdG9yKCdQcm92aWRlciBBJyksXG5cdFx0XHRcdGFjdGlvbignYWxwaGEnKSxcblx0XHRcdFx0c2VwYXJhdG9yKCdQcm92aWRlciBCJyksXG5cdFx0XHRcdGFjdGlvbignYmV0YScpLFxuXHRcdFx0XHRzZXBhcmF0b3IoJ1Byb3ZpZGVyIEMnKSxcblx0XHRcdFx0YWN0aW9uKCdnYW1tYScpLFxuXHRcdFx0XSxcblx0XHR9KTtcblxuXHRcdHR5cGVGaWx0ZXIod2lkZ2V0LCAnYmV0YScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRWaXNpYmxlUm93VGV4dCh3aWRnZXQpLCBbJ1Byb3ZpZGVyIEInLCAnYmV0YSddKTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHJvb20gZm9yIGFjdGlvbiB3aWRnZXQgY2hyb21lIHdoZW4gY2xhbXBpbmcgZHluYW1pYyBoZWlnaHQnLCAoKSA9PiB3aXRoV2luZG93SW5uZXJIZWlnaHQoMzAwLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGlzdCA9IGNyZWF0ZUFjdGlvbkxpc3QoZGlzcG9zYWJsZXMsIEFycmF5LmZyb20oeyBsZW5ndGg6IDUwIH0sIChfLCBpKSA9PiBhY3Rpb24oYGl0ZW0tJHtpfWApKSk7XG5cblx0XHRsaXN0LmxheW91dCgyMDApO1xuXG5cdFx0Y29uc3QgZmlsdGVySGVpZ2h0ID0gMzY7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gbGlzdC5kb21Ob2RlLnBhcmVudEVsZW1lbnQhO1xuXHRcdGNvbnN0IHN0eWxlID0gbWFpbldpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHdpZGdldCk7XG5cdFx0Y29uc3QgdG9QaXhlbHMgPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciA9PiBOdW1iZXIucGFyc2VGbG9hdCh2YWx1ZSkgfHwgMDtcblx0XHRjb25zdCBhY3Rpb25XaWRnZXRWZXJ0aWNhbENocm9tZUhlaWdodCA9IHRvUGl4ZWxzKHN0eWxlLnBhZGRpbmdUb3ApICsgdG9QaXhlbHMoc3R5bGUucGFkZGluZ0JvdHRvbSkgKyB0b1BpeGVscyhzdHlsZS5ib3JkZXJUb3BXaWR0aCkgKyB0b1BpeGVscyhzdHlsZS5ib3JkZXJCb3R0b21XaWR0aCk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlU3BhY2VBYm92ZUFuY2hvciA9IDE1MDtcblx0XHRjb25zdCBsaXN0SGVpZ2h0ID0gcGFyc2VGbG9hdChsaXN0LmRvbU5vZGUuc3R5bGUuaGVpZ2h0KTtcblx0XHRhc3NlcnQub2sobGlzdEhlaWdodCArIGZpbHRlckhlaWdodCArIGFjdGlvbldpZGdldFZlcnRpY2FsQ2hyb21lSGVpZ2h0IDw9IGF2YWlsYWJsZVNwYWNlQWJvdmVBbmNob3IpO1xuXHR9KSk7XG5cblx0dGVzdCgnZm9yY2VkIGFib3ZlIGFuY2hvciBwb3NpdGlvbiBjYW4gY2xhbXAgZHluYW1pYyBoZWlnaHQgd2l0aG91dCB0aGUgZGVmYXVsdCBtaW5pbXVtIGZsb29yJywgKCkgPT4gd2l0aFdpbmRvd0lubmVySGVpZ2h0KDMwMCwgKCkgPT4ge1xuXHRcdGNvbnN0IGxpc3QgPSBjcmVhdGVBY3Rpb25MaXN0KGRpc3Bvc2FibGVzLCBBcnJheS5mcm9tKHsgbGVuZ3RoOiA1MCB9LCAoXywgaSkgPT4gYWN0aW9uKGBpdGVtLSR7aX1gKSksIHtcblx0XHRcdGxpc3RPcHRpb25zOiB7IGFuY2hvclBvc2l0aW9uOiBBbmNob3JQb3NpdGlvbi5BQk9WRSB9LFxuXHRcdFx0YW5jaG9yOiB7IHg6IDEwLCB5OiAyMCwgd2lkdGg6IDIwLCBoZWlnaHQ6IDIwIH0sXG5cdFx0fSk7XG5cblx0XHRsaXN0LmxheW91dCgyMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgYW5jaG9yUG9zaXRpb246IGxpc3QuYW5jaG9yUG9zaXRpb24sIGxpc3RIZWlnaHQ6IHBhcnNlRmxvYXQobGlzdC5kb21Ob2RlLnN0eWxlLmhlaWdodCkgfSxcblx0XHRcdHsgYW5jaG9yUG9zaXRpb246IEFuY2hvclBvc2l0aW9uLkFCT1ZFLCBsaXN0SGVpZ2h0OiAwIH0sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2hlYWRlciBkaXNtaXNzIHJlbW92ZXMgdGhlIGJhbm5lciBhbmQgcmVxdWVzdHMgYSByZS1sYXlvdXQnLCAoKSA9PiB7XG5cdFx0bGV0IGRpc21pc3NlZCA9IGZhbHNlO1xuXHRcdGxldCBsYXlvdXRSZXF1ZXN0ZWQgPSBmYWxzZTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRsaXN0T3B0aW9uczogeyBoZWFkZXJUZXh0OiAnQ2FjaGUgaGludCcsIGhlYWRlckRpc21pc3M6ICgpID0+IHsgZGlzbWlzc2VkID0gdHJ1ZTsgfSB9LFxuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3aWRnZXQub25EaWRSZXF1ZXN0TGF5b3V0KCgpID0+IHsgbGF5b3V0UmVxdWVzdGVkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0Y29uc3QgaGVhZGVyID0gd2lkZ2V0LmhlYWRlckNvbnRhaW5lcjtcblx0XHRhc3NlcnQub2soaGVhZGVyLCAnaGVhZGVyIGJhbm5lciBzaG91bGQgcmVuZGVyIHdoZW4gaGVhZGVyVGV4dCArIGhlYWRlckRpc21pc3MgYXJlIHNldCcpO1xuXHRcdGNvbnN0IGRpc21pc3NCdXR0b24gPSBoZWFkZXIhLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYWN0aW9uLWxpc3QtaGVhZGVyLWRpc21pc3MnKTtcblx0XHRhc3NlcnQub2soZGlzbWlzc0J1dHRvbiwgJ2Rpc21pc3MgYnV0dG9uIHNob3VsZCByZW5kZXInKTtcblxuXHRcdGRpc21pc3NCdXR0b24hLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNldXAnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgZGlzbWlzc2VkLCBsYXlvdXRSZXF1ZXN0ZWQsIGhlYWRlckNsZWFyZWQ6IHdpZGdldC5oZWFkZXJDb250YWluZXIgPT09IHVuZGVmaW5lZCwgaGVhZGVyU3RpbGxJbkRvbTogaGVhZGVyIS5pc0Nvbm5lY3RlZCB9LFxuXHRcdFx0eyBkaXNtaXNzZWQ6IHRydWUsIGxheW91dFJlcXVlc3RlZDogdHJ1ZSwgaGVhZGVyQ2xlYXJlZDogdHJ1ZSwgaGVhZGVyU3RpbGxJbkRvbTogZmFsc2UgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBhIHJvdyBob3ZlciBwYW5lbCBvbmNlIHRoZSBob3ZlciBkZWxheSBlbGFwc2VzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlQWN0aW9uTGlzdFdpZGdldChkaXNwb3NhYmxlcywge1xuXHRcdFx0aXRlbXM6IFt7IC4uLmFjdGlvbignYXV0bycpLCBob3ZlcjogeyBjb250ZW50OiAnQXV0byByb3V0ZXMgYmFzZWQgb24geW91ciB0YXNrJyB9IH0sIGFjdGlvbignb3RoZXInKV0sXG5cdFx0XHRsaXN0T3B0aW9uczogeyBoZWFkZXJUZXh0OiAnQ2FjaGUgaGludCcgfSxcblx0XHR9KTtcblx0XHRjb25zdCBwYW5lbCA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYWN0aW9uLWxpc3Qtc3VibWVudS1wYW5lbCcpITtcblxuXHRcdHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcubW9uYWNvLWxpc3Qtcm93JykhLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlb3ZlcicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMDAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBkaXNwbGF5OiBwYW5lbC5zdHlsZS5kaXNwbGF5LCB0ZXh0OiBwYW5lbC50ZXh0Q29udGVudCB9LCB7IGRpc3BsYXk6ICcnLCB0ZXh0OiAnQXV0byByb3V0ZXMgYmFzZWQgb24geW91ciB0YXNrJyB9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RvZXMgbm90IG9wZW4gYSByb3cgaG92ZXIgcGFuZWwgb25jZSB0aGUgcG9pbnRlciBoYXMgbGVmdCB0aGUgbGlzdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZUFjdGlvbkxpc3RXaWRnZXQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGl0ZW1zOiBbeyAuLi5hY3Rpb24oJ2F1dG8nKSwgaG92ZXI6IHsgY29udGVudDogJ0F1dG8gcm91dGVzIGJhc2VkIG9uIHlvdXIgdGFzaycgfSB9LCBhY3Rpb24oJ290aGVyJyldLFxuXHRcdFx0bGlzdE9wdGlvbnM6IHsgaGVhZGVyVGV4dDogJ0NhY2hlIGhpbnQnIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcGFuZWwgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmFjdGlvbi1saXN0LXN1Ym1lbnUtcGFuZWwnKSE7XG5cblx0XHQvLyBUaGUgYmFubmVyIGlzIGEgc2libGluZyBvZiB0aGUgbGlzdCwgc28gcmVhY2hpbmcgaXQgZHJhZ3MgdGhlIHBvaW50ZXIgYWNyb3NzIGEgcm93LlxuXHRcdHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcubW9uYWNvLWxpc3Qtcm93JykhLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlb3ZlcicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0d2lkZ2V0LmRvbU5vZGUuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VsZWF2ZScpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGRpc3BsYXk6IHBhbmVsLnN0eWxlLmRpc3BsYXksIHRleHQ6IHBhbmVsLnRleHRDb250ZW50IH0sIHsgZGlzcGxheTogJ25vbmUnLCB0ZXh0OiAnJyB9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2Rpc21pc3NlcyBhbiBvcGVuIHJvdyBob3ZlciBwYW5lbCB3aGVuIHRoZSBwb2ludGVyIHJlYWNoZXMgdGhlIGhlYWRlciBiYW5uZXInLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRpdGVtczogW3sgLi4uYWN0aW9uKCdhdXRvJyksIGhvdmVyOiB7IGNvbnRlbnQ6ICdBdXRvIHJvdXRlcyBiYXNlZCBvbiB5b3VyIHRhc2snIH0gfSwgYWN0aW9uKCdvdGhlcicpXSxcblx0XHRcdGxpc3RPcHRpb25zOiB7IGhlYWRlclRleHQ6ICdDYWNoZSBoaW50JyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBhbmVsID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hY3Rpb24tbGlzdC1zdWJtZW51LXBhbmVsJykhO1xuXG5cdFx0Ly8gRHdlbGxpbmcgb24gdGhlIHJvdyBsb25nIGVub3VnaCBmb3IgdGhlIHBhbmVsIHRvIG9wZW4sIHRoZW4gY29udGludWluZyB0byB0aGUgYmFubmVyLlxuXHRcdHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcubW9uYWNvLWxpc3Qtcm93JykhLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlb3ZlcicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0YXdhaXQgdGltZW91dCg2MDApO1xuXHRcdGNvbnN0IG9wZW5lZFdoaWxlT25Sb3cgPSBwYW5lbC50ZXh0Q29udGVudDtcblxuXHRcdHdpZGdldC5kb21Ob2RlLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlbGVhdmUnKSk7XG5cdFx0d2lkZ2V0LmhlYWRlckNvbnRhaW5lciEuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VlbnRlcicpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IG9wZW5lZFdoaWxlT25Sb3csIGRpc3BsYXk6IHBhbmVsLnN0eWxlLmRpc3BsYXksIHRleHQ6IHBhbmVsLnRleHRDb250ZW50IH0sXG5cdFx0XHR7IG9wZW5lZFdoaWxlT25Sb3c6ICdBdXRvIHJvdXRlcyBiYXNlZCBvbiB5b3VyIHRhc2snLCBkaXNwbGF5OiAnbm9uZScsIHRleHQ6ICcnIH0sXG5cdFx0KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2hlYWRlciByZW5kZXJzIGEgXCJMZWFybiBtb3JlXCIgbGluayB0byB0aGUgZ2l2ZW4gdXJpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZUFjdGlvbkxpc3RXaWRnZXQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGxpc3RPcHRpb25zOiB7IGhlYWRlclRleHQ6ICdDYWNoZSBoaW50JywgaGVhZGVyTGluazogeyBsYWJlbDogJ0xlYXJuIG1vcmUnLCB1cmk6IFVSSS5wYXJzZSgnaHR0cHM6Ly9ha2EubXMvdGVzdCcpIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGxpbmsgPSB3aWRnZXQuaGVhZGVyQ29udGFpbmVyPy5xdWVyeVNlbGVjdG9yPEhUTUxBbmNob3JFbGVtZW50PignYS5tb25hY28tbGluaycpO1xuXHRcdGFzc2VydC5vayhsaW5rLCAnYSBcIkxlYXJuIG1vcmVcIiBsaW5rIHNob3VsZCByZW5kZXIgaW4gdGhlIGhlYWRlcicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHRleHQ6IGxpbmshLnRleHRDb250ZW50LCBocmVmOiBsaW5rIS5nZXRBdHRyaWJ1dGUoJ2hyZWYnKSB9LFxuXHRcdFx0eyB0ZXh0OiAnTGVhcm4gbW9yZScsIGhyZWY6ICdodHRwczovL2FrYS5tcy90ZXN0JyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvY3VzZXMgdGhlIGNvbmZpZ3VyZWQgaW5pdGlhbCBpdGVtIHdoZW4gb3BlbmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZUFjdGlvbkxpc3RXaWRnZXQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGl0ZW1zOiBbYWN0aW9uKCdmaXJzdCcpLCBhY3Rpb24oJ2FjdGl2ZScpLCBhY3Rpb24oJ2xhc3QnKV0sXG5cdFx0XHRsaXN0T3B0aW9uczogeyBpbml0aWFsRm9jdXNJdGVtSWQ6ICdhY3RpdmUnIH0sXG5cdFx0fSk7XG5cblx0XHR3aWRnZXQuZm9jdXMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZ2V0Rm9jdXNlZEVsZW1lbnQoKT8uaXRlbT8uaWQsICdhY3RpdmUnKTtcblx0fSk7XG5cblx0dGVzdCgnY29uc3VtZXMgaW5pdGlhbCBmb2N1cyBiZWZvcmUgbGF0ZXIgZmlsdGVyaW5nIGFuZCByZWZvY3VzaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZUFjdGlvbkxpc3RXaWRnZXQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGl0ZW1zOiBbYWN0aW9uKCdtYXRjaC1maXJzdCcpLCBhY3Rpb24oJ21hdGNoLWluaXRpYWwnKSwgYWN0aW9uKCdvdGhlcicpXSxcblx0XHRcdGxpc3RPcHRpb25zOiB7IGluaXRpYWxGb2N1c0l0ZW1JZDogJ21hdGNoLWluaXRpYWwnIH0sXG5cdFx0fSk7XG5cblx0XHR3aWRnZXQuZm9jdXMoKTtcblx0XHR3aWRnZXQuZm9jdXNQcmV2aW91cygpO1xuXHRcdHR5cGVGaWx0ZXIod2lkZ2V0LCAnbWF0Y2gnKTtcblx0XHR3aWRnZXQuZm9jdXMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZ2V0Rm9jdXNlZEVsZW1lbnQoKT8uaXRlbT8uaWQsICdtYXRjaC1maXJzdCcpO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsZUFBZTtBQUV6QyxTQUFTLFNBQVMsbUJBQW1CO0FBQ3JDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVksb0JBQW9CLHdCQUE2RDtBQUN0RyxTQUFTLHNCQUFzQjtBQU0vQixTQUFTLE9BQU8sSUFBOEM7QUFDN0QsU0FBTyxFQUFFLE1BQU0sbUJBQW1CLFFBQVEsT0FBTyxJQUFJLE1BQU0sRUFBRSxHQUFHLEVBQUU7QUFDbkU7QUFFQSxTQUFTLFVBQVUsT0FBa0Q7QUFDcEUsU0FBTyxFQUFFLE1BQU0sbUJBQW1CLFdBQVcsTUFBTTtBQUNwRDtBQUVBLFNBQVMsdUJBQXVCLGFBQXlFLFNBS25FO0FBQ3JDLFFBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLHVCQUFxQixJQUFJLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBQ3hFLHVCQUFxQixJQUFJLGVBQWUsZ0JBQWdCO0FBQ3hELHVCQUFxQixJQUFJLGdCQUFnQixpQkFBaUI7QUFDMUQsUUFBTSxXQUFXLFFBQVEsV0FDdEI7QUFBQSxJQUNELFFBQVEsUUFBUSxXQUFXLE1BQU07QUFBQSxJQUFFO0FBQUEsSUFDbkMsVUFBVSxNQUFNO0FBQUEsSUFBRTtBQUFBLElBQ2xCLFVBQVUsUUFBUTtBQUFBLEVBQ25CLElBQ0U7QUFBQSxJQUNELFFBQVEsUUFBUSxXQUFXLE1BQU07QUFBQSxJQUFFO0FBQUEsSUFDbkMsVUFBVSxNQUFNO0FBQUEsSUFBRTtBQUFBLEVBQ25CO0FBRUQsUUFBTSxTQUFTLFlBQVksSUFBSSxxQkFBcUI7QUFBQSxJQUNuRDtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQSxRQUFRLFNBQVMsQ0FBQyxPQUFPLFNBQVMsQ0FBQztBQUFBLElBQ25DO0FBQUEsSUFDQTtBQUFBLElBQ0EsRUFBRSxZQUFZLE1BQU0sR0FBRyxRQUFRLFlBQVk7QUFBQSxFQUM1QyxDQUFDO0FBRUQsTUFBSSxPQUFPLGlCQUFpQjtBQUMzQixhQUFTLEtBQUssWUFBWSxPQUFPLGVBQWU7QUFDaEQsZ0JBQVksSUFBSSxFQUFFLFNBQVMsTUFBTSxPQUFPLGlCQUFpQixPQUFPLEVBQUUsQ0FBQztBQUFBLEVBQ3BFO0FBR0EsUUFBTSxrQkFBa0IsT0FBTztBQUMvQixNQUFJLGlCQUFpQjtBQUNwQixhQUFTLEtBQUssWUFBWSxlQUFlO0FBQ3pDLGdCQUFZLElBQUksRUFBRSxTQUFTLE1BQU0sZ0JBQWdCLE9BQU8sRUFBRSxDQUFDO0FBQUEsRUFDNUQ7QUFDQSxXQUFTLEtBQUssWUFBWSxPQUFPLE9BQU87QUFDeEMsY0FBWSxJQUFJLEVBQUUsU0FBUyxNQUFNLE9BQU8sUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUMxRCxTQUFPLE9BQU8sS0FBSyxHQUFHO0FBRXRCLFNBQU87QUFDUjtBQUVBLFNBQVMsV0FBVyxRQUEyQyxPQUFxQjtBQUNuRixTQUFPLEdBQUcsT0FBTyxXQUFXO0FBQzVCLFNBQU8sWUFBWSxRQUFRO0FBQzNCLFNBQU8sWUFBWSxjQUFjLElBQUksTUFBTSxPQUFPLENBQUM7QUFDcEQ7QUFFQSxTQUFTLGtCQUFrQixRQUFxRDtBQUMvRSxTQUFPLE1BQU0sS0FBSyxPQUFPLFFBQVEsaUJBQThCLGtCQUFrQixDQUFDLEVBQ2hGLElBQUksU0FBTyxJQUFJLGVBQWUsRUFBRSxFQUNoQyxPQUFPLFVBQVEsS0FBSyxTQUFTLENBQUM7QUFDakM7QUFFQSxTQUFTLHNCQUF5QixRQUFnQixVQUFzQjtBQUN2RSxRQUFNLHFCQUFxQixPQUFPLHlCQUF5QixZQUFZLGFBQWE7QUFDcEYsU0FBTyxlQUFlLFlBQVksZUFBZSxFQUFFLGNBQWMsTUFBTSxPQUFPLE9BQU8sQ0FBQztBQUN0RixNQUFJO0FBQ0gsV0FBTyxTQUFTO0FBQUEsRUFDakIsVUFBRTtBQUNELFFBQUksb0JBQW9CO0FBQ3ZCLGFBQU8sZUFBZSxZQUFZLGVBQWUsa0JBQWtCO0FBQUEsSUFDcEUsT0FBTztBQUNOLGNBQVEsZUFBZSxZQUFZLGFBQWE7QUFBQSxJQUNqRDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsaUJBQWlCLGFBQXlFLE9BQW9ELFNBR3ZIO0FBQy9CLFFBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLHVCQUFxQixJQUFJLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBQ3hFLHVCQUFxQixJQUFJLGVBQWUsZ0JBQWdCO0FBQ3hELHVCQUFxQixJQUFJLGdCQUFnQixpQkFBaUI7QUFDMUQsdUJBQXFCLEtBQUsscUJBQXFCO0FBQUEsSUFDOUMsUUFBUSxNQUFNO0FBQUEsSUFBRTtBQUFBLElBQ2hCLGlCQUFpQixNQUFNO0FBQUEsSUFBRTtBQUFBLElBQ3pCLHVCQUF1QixNQUFNLFNBQVM7QUFBQSxFQUN2QyxDQUF3RDtBQUN4RCx1QkFBcUIsS0FBSyxnQkFBZ0I7QUFBQSxJQUN6QyxjQUFjLE1BQU0sU0FBUztBQUFBLElBQzdCLGVBQWUsU0FBUztBQUFBLElBQ3hCLGlCQUFpQixTQUFTO0FBQUEsSUFDMUIsMEJBQTBCLFlBQVk7QUFBQSxJQUN0QyxzQkFBc0IsWUFBWTtBQUFBLElBQ2xDLDRCQUE0QixZQUFZO0FBQUEsSUFDeEMsbUJBQW1CLFlBQVk7QUFBQSxJQUMvQiw0QkFBNEIsWUFBWTtBQUFBLEVBQ3pDLENBQThDO0FBRTlDLFFBQU0sT0FBTyxZQUFZLElBQUkscUJBQXFCO0FBQUEsSUFDakQ7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsTUFDQyxRQUFRLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDaEIsVUFBVSxNQUFNO0FBQUEsTUFBRTtBQUFBLElBQ25CO0FBQUEsSUFDQTtBQUFBLElBQ0EsRUFBRSxZQUFZLE1BQU0sR0FBRyxTQUFTLFlBQVk7QUFBQSxJQUM1QyxTQUFTLFVBQVUsRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLLE9BQU8sSUFBSSxRQUFRLEdBQUc7QUFBQSxFQUMzRCxDQUFDO0FBRUQsUUFBTSxTQUFTLFNBQVMsY0FBYyxLQUFLO0FBQzNDLFNBQU8sVUFBVSxJQUFJLGVBQWU7QUFDcEMsV0FBUyxLQUFLLFlBQVksTUFBTTtBQUNoQyxjQUFZLElBQUksRUFBRSxTQUFTLE1BQU0sT0FBTyxPQUFPLEVBQUUsQ0FBQztBQUNsRCxNQUFJLEtBQUssaUJBQWlCO0FBQ3pCLFdBQU8sWUFBWSxLQUFLLGVBQWU7QUFBQSxFQUN4QztBQUNBLFNBQU8sWUFBWSxLQUFLLE9BQU87QUFFL0IsU0FBTztBQUNSO0FBRUEsTUFBTSxvQkFBb0IsTUFBTTtBQUMvQixRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUssK0NBQStDLE1BQU07QUFDekQsUUFBSSxZQUFZO0FBQ2hCLFVBQU0sU0FBUyx1QkFBdUIsYUFBYTtBQUFBLE1BQ2xELE9BQU8sQ0FBQztBQUFBLFFBQ1AsR0FBRyxPQUFPLFFBQVE7QUFBQSxRQUNsQixnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxTQUFTLE9BQU8sU0FBUyxLQUFLLE1BQU07QUFBQSxRQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQUEsTUFDM0UsQ0FBQztBQUFBLE1BQ0QsUUFBUSxNQUFNO0FBQUEsSUFDZixDQUFDO0FBRUQsV0FBTyxRQUFRLGNBQWMsSUFBSSxjQUFjLFdBQVcsRUFBRSxLQUFLLGNBQWMsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUMvRixVQUFNLFVBQVUsT0FBTyxRQUFRLGNBQTJCLDBDQUEwQztBQUNwRyxXQUFPLEdBQUcsT0FBTztBQUNqQixZQUFRLGNBQWMsSUFBSSxjQUFjLFdBQVcsRUFBRSxLQUFLLFVBQVUsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUVwRixXQUFPLFlBQVksV0FBVyxDQUFDO0FBQUEsRUFDaEMsQ0FBQztBQUVELE9BQUssMkNBQTJDLE1BQU0sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsWUFBWTtBQUM3RyxVQUFNLFVBQW9CLENBQUM7QUFDM0IsVUFBTSxTQUFTLHVCQUF1QixhQUFhO0FBQUEsTUFDbEQsVUFBVSxPQUFNLFdBQVU7QUFDekIsZ0JBQVEsS0FBSyxNQUFNO0FBQ25CLGVBQU8sQ0FBQyxPQUFPLFVBQVUsV0FBVyxPQUFPLFdBQVcsTUFBTSxTQUFTLENBQUM7QUFBQSxNQUN2RTtBQUFBLElBQ0QsQ0FBQztBQUVELGVBQVcsUUFBUSxHQUFHO0FBQ3RCLGVBQVcsUUFBUSxJQUFJO0FBQ3ZCLFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQyxLQUFLLElBQUksQ0FBQztBQUMzQyxVQUFNLFFBQVEsQ0FBQztBQUNmLFdBQU8sR0FBRyxPQUFPLFFBQVEsYUFBYSxTQUFTLHNCQUFzQixDQUFDO0FBQUEsRUFDdkUsQ0FBQyxDQUFDO0FBRUYsT0FBSyx3Q0FBd0MsWUFBWTtBQUN4RCxVQUFNLGNBQWMsSUFBSSxnQkFBNkQ7QUFDckYsVUFBTSxlQUFlLElBQUksZ0JBQTZEO0FBQ3RGLFVBQU0sVUFBb0IsQ0FBQztBQUMzQixVQUFNLFNBQVMsdUJBQXVCLGFBQWE7QUFBQSxNQUNsRCxVQUFVLFlBQVU7QUFDbkIsZ0JBQVEsS0FBSyxNQUFNO0FBQ25CLGVBQU8sV0FBVyxNQUFNLFlBQVksSUFBSSxhQUFhO0FBQUEsTUFDdEQ7QUFBQSxJQUNELENBQUM7QUFFRCxlQUFXLFFBQVEsR0FBRztBQUN0QixlQUFXLFFBQVEsSUFBSTtBQUN2QixXQUFPLGdCQUFnQixTQUFTLENBQUMsS0FBSyxJQUFJLENBQUM7QUFFM0MsZ0JBQVksU0FBUyxDQUFDLE9BQU8saUJBQWlCLENBQUMsQ0FBQztBQUNoRCxVQUFNLFFBQVEsQ0FBQztBQUNmLFdBQU8sR0FBRyxDQUFDLE9BQU8sUUFBUSxhQUFhLFNBQVMsaUJBQWlCLENBQUM7QUFFbEUsaUJBQWEsU0FBUyxDQUFDLE9BQU8saUJBQWlCLENBQUMsQ0FBQztBQUNqRCxVQUFNLFFBQVEsQ0FBQztBQUNmLFdBQU8sR0FBRyxPQUFPLFFBQVEsYUFBYSxTQUFTLGlCQUFpQixDQUFDO0FBQUEsRUFDbEUsQ0FBQztBQUVELE9BQUssMkRBQTJELE1BQU07QUFDckUsVUFBTSxVQUFvQixDQUFDO0FBQzNCLFVBQU0sU0FBUyx1QkFBdUIsYUFBYTtBQUFBLE1BQ2xELFVBQVUsT0FBTSxXQUFVO0FBQ3pCLGdCQUFRLEtBQUssTUFBTTtBQUNuQixlQUFPLENBQUMsT0FBTyxVQUFVLE1BQU0sRUFBRSxDQUFDO0FBQUEsTUFDbkM7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLEdBQUcsT0FBTyxXQUFXO0FBQzVCLFdBQU8sWUFBWSxjQUFjLElBQUksTUFBTSxrQkFBa0IsQ0FBQztBQUM5RCxlQUFXLFFBQVEsR0FBRztBQUN0QixlQUFXLFFBQVEsVUFBVTtBQUM3QixXQUFPLFlBQVksUUFBUTtBQUMzQixXQUFPLFlBQVksY0FBYyxJQUFJLE1BQU0sZ0JBQWdCLENBQUM7QUFFNUQsZUFBVyxRQUFRLFVBQVU7QUFFN0IsV0FBTyxnQkFBZ0IsU0FBUyxDQUFDLFVBQVUsQ0FBQztBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxZQUFZO0FBQ2pGLFVBQU0sVUFBVSxJQUFJLGdCQUE2RDtBQUNqRixVQUFNLFNBQVMsdUJBQXVCLGFBQWE7QUFBQSxNQUNsRCxVQUFVLE1BQU0sUUFBUTtBQUFBLElBQ3pCLENBQUM7QUFFRCxlQUFXLFFBQVEsR0FBRztBQUN0QixXQUFPLEdBQUcsT0FBTyxXQUFXO0FBQzVCLFdBQU8sWUFBWSxjQUFjLElBQUksTUFBTSxrQkFBa0IsQ0FBQztBQUc5RCxZQUFRLFNBQVMsQ0FBQyxPQUFPLGNBQWMsQ0FBQyxDQUFDO0FBQ3pDLFVBQU0sUUFBUSxDQUFDO0FBQ2YsV0FBTyxHQUFHLENBQUMsT0FBTyxRQUFRLGFBQWEsU0FBUyxjQUFjLENBQUM7QUFBQSxFQUNoRSxDQUFDO0FBRUQsT0FBSyxrREFBa0QsTUFBTTtBQUM1RCxVQUFNLFNBQVMsdUJBQXVCLGFBQWE7QUFBQSxNQUNsRCxPQUFPO0FBQUEsUUFDTixPQUFPLE9BQU87QUFBQSxRQUNkLEVBQUUsR0FBRyxPQUFPLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxLQUFLLE1BQU07QUFBQSxRQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUU7QUFBQSxRQUN2RyxPQUFPLE9BQU87QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxPQUFPLE1BQU0sS0FBSyxPQUFPLFFBQVEsaUJBQThCLGtCQUFrQixDQUFDO0FBQ3hGLFVBQU0sb0JBQStCLENBQUM7QUFDdEMsVUFBTSxpQkFBaUIsQ0FBQyxLQUFLLEtBQUssR0FBRztBQUNyQyxhQUFTLElBQUksR0FBRyxJQUFJLEtBQUssUUFBUSxLQUFLO0FBQ3JDLFdBQUssQ0FBQyxFQUFFLHdCQUF3QixNQUFNO0FBQ3JDLDBCQUFrQixLQUFLLEtBQUssTUFBTSxTQUFPLElBQUksTUFBTSxVQUFVLE1BQU0sQ0FBQztBQUNwRSxlQUFPLElBQUksV0FBVyxRQUFRLEdBQUcsR0FBRyxlQUFlLENBQUMsR0FBRyxFQUFFO0FBQUEsTUFDMUQ7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLE9BQU8sZ0JBQWdCLENBQUM7QUFFdEMsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0E7QUFBQSxNQUNBLGdCQUFnQixLQUFLLElBQUksU0FBTyxJQUFJLE1BQU0sS0FBSztBQUFBLElBQ2hELEdBQUc7QUFBQSxNQUNGLE9BQU87QUFBQSxNQUNQLG1CQUFtQixDQUFDLE1BQU0sTUFBTSxJQUFJO0FBQUEsTUFDcEMsZ0JBQWdCLENBQUMsSUFBSSxJQUFJLEVBQUU7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxVQUFNLFNBQVMsdUJBQXVCLGFBQWE7QUFBQSxNQUNsRCxPQUFPO0FBQUEsUUFDTixVQUFVLFlBQVk7QUFBQSxRQUN0QixPQUFPLE9BQU87QUFBQSxRQUNkLFVBQVUsWUFBWTtBQUFBLFFBQ3RCLE9BQU8sTUFBTTtBQUFBLE1BQ2Q7QUFBQSxJQUNELENBQUM7QUFFRCxlQUFXLFFBQVEsT0FBTztBQUUxQixXQUFPLGdCQUFnQixrQkFBa0IsTUFBTSxHQUFHLENBQUMsY0FBYyxPQUFPLENBQUM7QUFBQSxFQUMxRSxDQUFDO0FBRUQsT0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxVQUFNLFNBQVMsdUJBQXVCLGFBQWE7QUFBQSxNQUNsRCxPQUFPO0FBQUEsUUFDTixVQUFVLFlBQVk7QUFBQSxRQUN0QixPQUFPLE9BQU87QUFBQSxRQUNkLFVBQVUsWUFBWTtBQUFBLFFBQ3RCLE9BQU8sTUFBTTtBQUFBLFFBQ2IsVUFBVSxZQUFZO0FBQUEsUUFDdEIsT0FBTyxPQUFPO0FBQUEsTUFDZjtBQUFBLElBQ0QsQ0FBQztBQUVELGVBQVcsUUFBUSxNQUFNO0FBRXpCLFdBQU8sZ0JBQWdCLGtCQUFrQixNQUFNLEdBQUcsQ0FBQyxjQUFjLE1BQU0sQ0FBQztBQUFBLEVBQ3pFLENBQUM7QUFFRCxPQUFLLHFFQUFxRSxNQUFNLHNCQUFzQixLQUFLLE1BQU07QUFDaEgsVUFBTSxPQUFPLGlCQUFpQixhQUFhLE1BQU0sS0FBSyxFQUFFLFFBQVEsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLE9BQU8sUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRXBHLFNBQUssT0FBTyxHQUFHO0FBRWYsVUFBTSxlQUFlO0FBQ3JCLFVBQU0sU0FBUyxLQUFLLFFBQVE7QUFDNUIsVUFBTSxRQUFRLFdBQVcsaUJBQWlCLE1BQU07QUFDaEQsVUFBTSxXQUFXLENBQUMsVUFBMEIsT0FBTyxXQUFXLEtBQUssS0FBSztBQUN4RSxVQUFNLG1DQUFtQyxTQUFTLE1BQU0sVUFBVSxJQUFJLFNBQVMsTUFBTSxhQUFhLElBQUksU0FBUyxNQUFNLGNBQWMsSUFBSSxTQUFTLE1BQU0saUJBQWlCO0FBQ3ZLLFVBQU0sNEJBQTRCO0FBQ2xDLFVBQU0sYUFBYSxXQUFXLEtBQUssUUFBUSxNQUFNLE1BQU07QUFDdkQsV0FBTyxHQUFHLGFBQWEsZUFBZSxvQ0FBb0MseUJBQXlCO0FBQUEsRUFDcEcsQ0FBQyxDQUFDO0FBRUYsT0FBSywyRkFBMkYsTUFBTSxzQkFBc0IsS0FBSyxNQUFNO0FBQ3RJLFVBQU0sT0FBTyxpQkFBaUIsYUFBYSxNQUFNLEtBQUssRUFBRSxRQUFRLEdBQUcsR0FBRyxDQUFDLEdBQUcsTUFBTSxPQUFPLFFBQVEsQ0FBQyxFQUFFLENBQUMsR0FBRztBQUFBLE1BQ3JHLGFBQWEsRUFBRSxnQkFBZ0IsZUFBZSxNQUFNO0FBQUEsTUFDcEQsUUFBUSxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksT0FBTyxJQUFJLFFBQVEsR0FBRztBQUFBLElBQy9DLENBQUM7QUFFRCxTQUFLLE9BQU8sR0FBRztBQUVmLFdBQU87QUFBQSxNQUNOLEVBQUUsZ0JBQWdCLEtBQUssZ0JBQWdCLFlBQVksV0FBVyxLQUFLLFFBQVEsTUFBTSxNQUFNLEVBQUU7QUFBQSxNQUN6RixFQUFFLGdCQUFnQixlQUFlLE9BQU8sWUFBWSxFQUFFO0FBQUEsSUFDdkQ7QUFBQSxFQUNELENBQUMsQ0FBQztBQUVGLE9BQUssOERBQThELE1BQU07QUFDeEUsUUFBSSxZQUFZO0FBQ2hCLFFBQUksa0JBQWtCO0FBQ3RCLFVBQU0sU0FBUyx1QkFBdUIsYUFBYTtBQUFBLE1BQ2xELGFBQWEsRUFBRSxZQUFZLGNBQWMsZUFBZSxNQUFNO0FBQUUsb0JBQVk7QUFBQSxNQUFNLEVBQUU7QUFBQSxJQUNyRixDQUFDO0FBQ0QsZ0JBQVksSUFBSSxPQUFPLG1CQUFtQixNQUFNO0FBQUUsd0JBQWtCO0FBQUEsSUFBTSxDQUFDLENBQUM7QUFFNUUsVUFBTSxTQUFTLE9BQU87QUFDdEIsV0FBTyxHQUFHLFFBQVEscUVBQXFFO0FBQ3ZGLFVBQU0sZ0JBQWdCLE9BQVEsY0FBMkIsNkJBQTZCO0FBQ3RGLFdBQU8sR0FBRyxlQUFlLDhCQUE4QjtBQUV2RCxrQkFBZSxjQUFjLElBQUksV0FBVyxXQUFXLEVBQUUsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUV6RSxXQUFPO0FBQUEsTUFDTixFQUFFLFdBQVcsaUJBQWlCLGVBQWUsT0FBTyxvQkFBb0IsUUFBVyxrQkFBa0IsT0FBUSxZQUFZO0FBQUEsTUFDekgsRUFBRSxXQUFXLE1BQU0saUJBQWlCLE1BQU0sZUFBZSxNQUFNLGtCQUFrQixNQUFNO0FBQUEsSUFDeEY7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHdEQUF3RCxNQUFNLG1CQUFtQixFQUFFLGVBQWUsS0FBSyxHQUFHLFlBQVk7QUFDMUgsVUFBTSxTQUFTLHVCQUF1QixhQUFhO0FBQUEsTUFDbEQsT0FBTyxDQUFDLEVBQUUsR0FBRyxPQUFPLE1BQU0sR0FBRyxPQUFPLEVBQUUsU0FBUyxpQ0FBaUMsRUFBRSxHQUFHLE9BQU8sT0FBTyxDQUFDO0FBQUEsTUFDcEcsYUFBYSxFQUFFLFlBQVksYUFBYTtBQUFBLElBQ3pDLENBQUM7QUFDRCxVQUFNLFFBQVEsT0FBTyxRQUFRLGNBQTJCLDRCQUE0QjtBQUVwRixXQUFPLFFBQVEsY0FBMkIsa0JBQWtCLEVBQUcsY0FBYyxJQUFJLFdBQVcsYUFBYSxFQUFFLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFDM0gsVUFBTSxRQUFRLEdBQUk7QUFFbEIsV0FBTyxnQkFBZ0IsRUFBRSxTQUFTLE1BQU0sTUFBTSxTQUFTLE1BQU0sTUFBTSxZQUFZLEdBQUcsRUFBRSxTQUFTLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUFBLEVBQzFJLENBQUMsQ0FBQztBQUVGLE9BQUssc0VBQXNFLE1BQU0sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsWUFBWTtBQUN4SSxVQUFNLFNBQVMsdUJBQXVCLGFBQWE7QUFBQSxNQUNsRCxPQUFPLENBQUMsRUFBRSxHQUFHLE9BQU8sTUFBTSxHQUFHLE9BQU8sRUFBRSxTQUFTLGlDQUFpQyxFQUFFLEdBQUcsT0FBTyxPQUFPLENBQUM7QUFBQSxNQUNwRyxhQUFhLEVBQUUsWUFBWSxhQUFhO0FBQUEsSUFDekMsQ0FBQztBQUNELFVBQU0sUUFBUSxPQUFPLFFBQVEsY0FBMkIsNEJBQTRCO0FBR3BGLFdBQU8sUUFBUSxjQUEyQixrQkFBa0IsRUFBRyxjQUFjLElBQUksV0FBVyxhQUFhLEVBQUUsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUMzSCxXQUFPLFFBQVEsY0FBYyxJQUFJLFdBQVcsWUFBWSxDQUFDO0FBQ3pELFVBQU0sUUFBUSxHQUFJO0FBRWxCLFdBQU8sZ0JBQWdCLEVBQUUsU0FBUyxNQUFNLE1BQU0sU0FBUyxNQUFNLE1BQU0sWUFBWSxHQUFHLEVBQUUsU0FBUyxRQUFRLE1BQU0sR0FBRyxDQUFDO0FBQUEsRUFDaEgsQ0FBQyxDQUFDO0FBRUYsT0FBSyxnRkFBZ0YsTUFBTSxtQkFBbUIsRUFBRSxlQUFlLEtBQUssR0FBRyxZQUFZO0FBQ2xKLFVBQU0sU0FBUyx1QkFBdUIsYUFBYTtBQUFBLE1BQ2xELE9BQU8sQ0FBQyxFQUFFLEdBQUcsT0FBTyxNQUFNLEdBQUcsT0FBTyxFQUFFLFNBQVMsaUNBQWlDLEVBQUUsR0FBRyxPQUFPLE9BQU8sQ0FBQztBQUFBLE1BQ3BHLGFBQWEsRUFBRSxZQUFZLGFBQWE7QUFBQSxJQUN6QyxDQUFDO0FBQ0QsVUFBTSxRQUFRLE9BQU8sUUFBUSxjQUEyQiw0QkFBNEI7QUFHcEYsV0FBTyxRQUFRLGNBQTJCLGtCQUFrQixFQUFHLGNBQWMsSUFBSSxXQUFXLGFBQWEsRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQzNILFVBQU0sUUFBUSxHQUFHO0FBQ2pCLFVBQU0sbUJBQW1CLE1BQU07QUFFL0IsV0FBTyxRQUFRLGNBQWMsSUFBSSxXQUFXLFlBQVksQ0FBQztBQUN6RCxXQUFPLGdCQUFpQixjQUFjLElBQUksV0FBVyxZQUFZLENBQUM7QUFFbEUsV0FBTztBQUFBLE1BQ04sRUFBRSxrQkFBa0IsU0FBUyxNQUFNLE1BQU0sU0FBUyxNQUFNLE1BQU0sWUFBWTtBQUFBLE1BQzFFLEVBQUUsa0JBQWtCLGtDQUFrQyxTQUFTLFFBQVEsTUFBTSxHQUFHO0FBQUEsSUFDakY7QUFBQSxFQUNELENBQUMsQ0FBQztBQUVGLE9BQUssdURBQXVELE1BQU07QUFDakUsVUFBTSxTQUFTLHVCQUF1QixhQUFhO0FBQUEsTUFDbEQsYUFBYSxFQUFFLFlBQVksY0FBYyxZQUFZLEVBQUUsT0FBTyxjQUFjLEtBQUssSUFBSSxNQUFNLHFCQUFxQixFQUFFLEVBQUU7QUFBQSxJQUNySCxDQUFDO0FBRUQsVUFBTSxPQUFPLE9BQU8saUJBQWlCLGNBQWlDLGVBQWU7QUFDckYsV0FBTyxHQUFHLE1BQU0saURBQWlEO0FBQ2pFLFdBQU87QUFBQSxNQUNOLEVBQUUsTUFBTSxLQUFNLGFBQWEsTUFBTSxLQUFNLGFBQWEsTUFBTSxFQUFFO0FBQUEsTUFDNUQsRUFBRSxNQUFNLGNBQWMsTUFBTSxzQkFBc0I7QUFBQSxJQUNuRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssbURBQW1ELE1BQU07QUFDN0QsVUFBTSxTQUFTLHVCQUF1QixhQUFhO0FBQUEsTUFDbEQsT0FBTyxDQUFDLE9BQU8sT0FBTyxHQUFHLE9BQU8sUUFBUSxHQUFHLE9BQU8sTUFBTSxDQUFDO0FBQUEsTUFDekQsYUFBYSxFQUFFLG9CQUFvQixTQUFTO0FBQUEsSUFDN0MsQ0FBQztBQUVELFdBQU8sTUFBTTtBQUViLFdBQU8sWUFBWSxPQUFPLGtCQUFrQixHQUFHLE1BQU0sSUFBSSxRQUFRO0FBQUEsRUFDbEUsQ0FBQztBQUVELE9BQUssZ0VBQWdFLE1BQU07QUFDMUUsVUFBTSxTQUFTLHVCQUF1QixhQUFhO0FBQUEsTUFDbEQsT0FBTyxDQUFDLE9BQU8sYUFBYSxHQUFHLE9BQU8sZUFBZSxHQUFHLE9BQU8sT0FBTyxDQUFDO0FBQUEsTUFDdkUsYUFBYSxFQUFFLG9CQUFvQixnQkFBZ0I7QUFBQSxJQUNwRCxDQUFDO0FBRUQsV0FBTyxNQUFNO0FBQ2IsV0FBTyxjQUFjO0FBQ3JCLGVBQVcsUUFBUSxPQUFPO0FBQzFCLFdBQU8sTUFBTTtBQUViLFdBQU8sWUFBWSxPQUFPLGtCQUFrQixHQUFHLE1BQU0sSUFBSSxhQUFhO0FBQUEsRUFDdkUsQ0FBQztBQUVGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
