import assert from "assert";
import { BaseActionViewItem } from "../../../../browser/ui/actionbar/actionViewItems.js";
import { ToggleMenuAction, ToolBar } from "../../../../browser/ui/toolbar/toolbar.js";
import { Action } from "../../../../common/actions.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
class FixedWidthActionViewItem extends BaseActionViewItem {
  constructor(action, width) {
    super(void 0, action);
    this.width = width;
  }
  render(container) {
    super.render(container);
    container.style.width = `${this.width}px`;
    container.style.boxSizing = "border-box";
    container.style.overflow = "hidden";
    container.style.whiteSpace = "nowrap";
    container.textContent = this.action.label;
  }
}
class TestToolBar extends ToolBar {
  get actionBarForTest() {
    return this.actionBar;
  }
}
const contextMenuProvider = {
  showContextMenu: () => {
  }
};
suite("ToolBar", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let container;
  setup(() => {
    container = document.createElement("div");
    container.style.width = "273px";
    document.body.appendChild(container);
  });
  teardown(() => {
    container.remove();
  });
  test("keeps the last primary action shrinkable when overflow is inserted", () => {
    const widths = /* @__PURE__ */ new Map([
      ["workbench.action.chat.attachContext", 22],
      ["workbench.action.chat.openModePicker", 75],
      ["workbench.action.chat.openModelPicker", 271],
      ["workbench.action.chat.configureTools", 22],
      [ToggleMenuAction.ID, 22]
    ]);
    const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
      responsiveBehavior: {
        enabled: true,
        kind: "last",
        minItems: 1,
        actionMinWidth: 22
      },
      actionViewItemProvider: (action) => {
        const width = widths.get(action.id);
        return typeof width === "number" ? new FixedWidthActionViewItem(action, width) : void 0;
      }
    }));
    const actionBar = toolbar.actionBarForTest;
    const originalGetWidth = actionBar.getWidth.bind(actionBar);
    actionBar.getWidth = (index) => {
      const action = actionBar.getAction(index);
      return action ? widths.get(action.id) ?? originalGetWidth(index) : originalGetWidth(index);
    };
    const originalGetBoundingClientRect = toolbar.getElement().getBoundingClientRect.bind(toolbar.getElement());
    toolbar.getElement().getBoundingClientRect = () => ({
      ...originalGetBoundingClientRect(),
      width: 273,
      right: 273,
      left: 0,
      x: 0,
      y: 0,
      top: 0,
      bottom: 0,
      height: 0,
      toJSON() {
        return {};
      }
    });
    const actions = [
      store.add(new Action("workbench.action.chat.attachContext", "Add Context...")),
      store.add(new Action("workbench.action.chat.openModePicker", "Open Agent Picker")),
      store.add(new Action("workbench.action.chat.openModelPicker", "Open Model Picker")),
      store.add(new Action("workbench.action.chat.configureTools", "Configure Tools..."))
    ];
    toolbar.setActions(actions);
    assert.strictEqual(toolbar.getItemsLength(), 4);
    assert.strictEqual(toolbar.getItemAction(0)?.id, "workbench.action.chat.attachContext");
    assert.strictEqual(toolbar.getItemAction(1)?.id, "workbench.action.chat.openModePicker");
    assert.strictEqual(toolbar.getItemAction(2)?.id, "workbench.action.chat.openModelPicker");
    assert.strictEqual(toolbar.getItemAction(3)?.id, ToggleMenuAction.ID);
    assert.strictEqual(toolbar.getElement().querySelector(".monaco-action-bar")?.classList.contains("has-overflow"), true);
  });
  test("applies per-action responsive min widths", () => {
    const toolbar = store.add(new ToolBar(container, contextMenuProvider, {
      responsiveBehavior: {
        enabled: true,
        kind: "last",
        minItems: 1,
        actionMinWidth: 22,
        getActionMinWidth: (action) => action.id === "workbench.action.chat.openModelPicker" ? 28 : void 0
      },
      actionViewItemProvider: (action) => new FixedWidthActionViewItem(action, 22)
    }));
    const actions = [
      store.add(new Action("workbench.action.chat.attachContext", "Add Context...")),
      store.add(new Action("workbench.action.chat.openModePicker", "Open Agent Picker")),
      store.add(new Action("workbench.action.chat.openModelPicker", "Open Model Picker"))
    ];
    toolbar.setActions(actions);
    assert.strictEqual(toolbar.getElement().style.getPropertyValue("--vscode-toolbar-action-min-width"), "28px");
  });
  test("relayout re-evaluates responsive overflow after action width changes", () => {
    const widths = /* @__PURE__ */ new Map([
      ["workbench.action.chat.attachContext", 22],
      ["workbench.action.chat.openModePicker", 22],
      ["workbench.action.chat.openModelPicker", 50],
      [ToggleMenuAction.ID, 22]
    ]);
    const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
      responsiveBehavior: {
        enabled: true,
        kind: "last",
        minItems: 1,
        actionMinWidth: 22
      },
      actionViewItemProvider: (action) => {
        const width = widths.get(action.id);
        return typeof width === "number" ? new FixedWidthActionViewItem(action, width) : void 0;
      }
    }));
    const actionBar = toolbar.actionBarForTest;
    const originalGetWidth = actionBar.getWidth.bind(actionBar);
    actionBar.getWidth = (index) => {
      const action = actionBar.getAction(index);
      return action ? widths.get(action.id) ?? originalGetWidth(index) : originalGetWidth(index);
    };
    const originalGetBoundingClientRect = toolbar.getElement().getBoundingClientRect.bind(toolbar.getElement());
    toolbar.getElement().getBoundingClientRect = () => ({
      ...originalGetBoundingClientRect(),
      width: 110,
      right: 110,
      left: 0,
      x: 0,
      y: 0,
      top: 0,
      bottom: 0,
      height: 0,
      toJSON() {
        return {};
      }
    });
    const actions = [
      store.add(new Action("workbench.action.chat.attachContext", "Add Context...")),
      store.add(new Action("workbench.action.chat.openModePicker", "Open Mode Picker")),
      store.add(new Action("workbench.action.chat.openModelPicker", "Open Model Picker"))
    ];
    toolbar.setActions(actions);
    assert.strictEqual(toolbar.getItemsLength(), 3);
    assert.strictEqual(toolbar.getItemAction(2)?.id, "workbench.action.chat.openModelPicker");
    assert.strictEqual(toolbar.getElement().querySelector(".monaco-action-bar")?.classList.contains("has-overflow"), false);
    widths.set("workbench.action.chat.openModePicker", 80);
    toolbar.relayout();
    assert.strictEqual(toolbar.getItemsLength(), 3);
    assert.strictEqual(toolbar.getItemAction(0)?.id, "workbench.action.chat.attachContext");
    assert.strictEqual(toolbar.getItemAction(1)?.id, "workbench.action.chat.openModePicker");
    assert.strictEqual(toolbar.getItemAction(2)?.id, ToggleMenuAction.ID);
    assert.strictEqual(toolbar.getElement().querySelector(".monaco-action-bar")?.classList.contains("has-overflow"), true);
  });
  test("does not repeatedly restore an action below its required width", () => {
    const widths = /* @__PURE__ */ new Map([
      ["primary.a", 56],
      ["primary.b", 48]
    ]);
    const renderCounts = /* @__PURE__ */ new Map();
    let availableWidth = 128;
    const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
      responsiveBehavior: {
        enabled: true,
        kind: "last",
        minItems: 1,
        actionMinWidth: 48,
        getAvailableWidth: () => availableWidth
      },
      actionViewItemProvider: (action) => {
        renderCounts.set(action.id, (renderCounts.get(action.id) ?? 0) + 1);
        const width = widths.get(action.id);
        return typeof width === "number" ? new FixedWidthActionViewItem(action, width) : void 0;
      }
    }));
    const primaryActions = [
      store.add(new Action("primary.a", "Primary A")),
      store.add(new Action("primary.b", "Primary B"))
    ];
    const secondaryActions = [store.add(new Action("secondary", "Secondary"))];
    const getActionIds = () => Array.from({ length: toolbar.getItemsLength() }, (_, index) => toolbar.getItemAction(index)?.id);
    toolbar.setActions(primaryActions, secondaryActions);
    const afterInitialLayout = getActionIds();
    toolbar.relayout();
    const afterRepeatedLayout = getActionIds();
    availableWidth = 136;
    toolbar.relayout();
    const afterGrowing = getActionIds();
    availableWidth = 128;
    toolbar.relayout();
    toolbar.relayout();
    const afterShrinkingAgain = getActionIds();
    assert.deepStrictEqual({
      afterInitialLayout,
      afterRepeatedLayout,
      afterGrowing,
      afterShrinkingAgain,
      primaryBRenderCount: renderCounts.get("primary.b")
    }, {
      afterInitialLayout: ["primary.a", ToggleMenuAction.ID],
      afterRepeatedLayout: ["primary.a", ToggleMenuAction.ID],
      afterGrowing: ["primary.a", "primary.b", ToggleMenuAction.ID],
      afterShrinkingAgain: ["primary.a", ToggleMenuAction.ID],
      primaryBRenderCount: 2
    });
  });
  test("ignores the responsive minimum when measuring an action that will stop shrinking", () => {
    const widths = /* @__PURE__ */ new Map([
      ["primary.a", 22],
      ["primary.b", 48]
    ]);
    let availableWidth = 90;
    const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
      responsiveBehavior: {
        enabled: true,
        kind: "last",
        minItems: 1,
        actionMinWidth: 48,
        getAvailableWidth: () => availableWidth
      },
      actionViewItemProvider: (action) => {
        const width = widths.get(action.id);
        return typeof width === "number" ? new FixedWidthActionViewItem(action, width) : void 0;
      }
    }));
    const primaryActions = [
      store.add(new Action("primary.a", "Primary A")),
      store.add(new Action("primary.b", "Primary B"))
    ];
    const secondaryActions = [store.add(new Action("secondary", "Secondary"))];
    const getActionIds = () => Array.from({ length: toolbar.getItemsLength() }, (_, index) => toolbar.getItemAction(index)?.id);
    toolbar.setActions(primaryActions, secondaryActions);
    const beforeGrowing = getActionIds();
    availableWidth = 110;
    toolbar.relayout();
    const afterGrowing = getActionIds();
    assert.deepStrictEqual({
      beforeGrowing,
      afterGrowing
    }, {
      beforeGrowing: ["primary.a", ToggleMenuAction.ID],
      afterGrowing: ["primary.a", "primary.b", ToggleMenuAction.ID]
    });
  });
  test("restores a hidden action after a visible action shrinks", () => {
    const availableWidth = 128;
    const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
      responsiveBehavior: {
        enabled: true,
        kind: "last",
        minItems: 1,
        actionMinWidth: 48,
        getAvailableWidth: () => availableWidth
      },
      actionViewItemProvider: (action) => {
        switch (action.id) {
          case "primary.a":
            return new FixedWidthActionViewItem(action, 100);
          case "primary.b":
            return new FixedWidthActionViewItem(action, 48);
          default:
            return void 0;
        }
      }
    }));
    const primaryActions = [
      store.add(new Action("primary.a", "Primary A")),
      store.add(new Action("primary.b", "Primary B"))
    ];
    const secondaryActions = [store.add(new Action("secondary", "Secondary"))];
    const getActionIds = () => Array.from({ length: toolbar.getItemsLength() }, (_, index) => toolbar.getItemAction(index)?.id);
    toolbar.setActions(primaryActions, secondaryActions);
    const beforeShrinking = getActionIds();
    const primaryAItem = toolbar.getElement().querySelector(".action-item");
    assert.ok(primaryAItem);
    primaryAItem.style.width = "48px";
    toolbar.relayout();
    const afterShrinking = getActionIds();
    assert.deepStrictEqual({
      beforeShrinking,
      afterShrinking
    }, {
      beforeShrinking: ["primary.a", ToggleMenuAction.ID],
      afterShrinking: ["primary.a", "primary.b", ToggleMenuAction.ID]
    });
  });
  test("uses getAvailableWidth override instead of the element width", () => {
    const widths = /* @__PURE__ */ new Map([
      ["a", 50],
      ["b", 50],
      ["c", 50],
      [ToggleMenuAction.ID, 22]
    ]);
    let availableWidth = 200;
    const toolbar = store.add(new TestToolBar(container, contextMenuProvider, {
      responsiveBehavior: {
        enabled: true,
        kind: "last",
        minItems: 1,
        actionMinWidth: 22,
        getAvailableWidth: () => availableWidth
      },
      actionViewItemProvider: (action) => {
        const width = widths.get(action.id);
        return typeof width === "number" ? new FixedWidthActionViewItem(action, width) : void 0;
      }
    }));
    const actionBar = toolbar.actionBarForTest;
    const originalGetWidth = actionBar.getWidth.bind(actionBar);
    actionBar.getWidth = (index) => {
      const action = actionBar.getAction(index);
      return action ? widths.get(action.id) ?? originalGetWidth(index) : originalGetWidth(index);
    };
    const originalGetBoundingClientRect = toolbar.getElement().getBoundingClientRect.bind(toolbar.getElement());
    toolbar.getElement().getBoundingClientRect = () => ({
      ...originalGetBoundingClientRect(),
      width: 0,
      right: 0,
      left: 0,
      x: 0,
      y: 0,
      top: 0,
      bottom: 0,
      height: 0,
      toJSON() {
        return {};
      }
    });
    const actions = [
      store.add(new Action("a", "A")),
      store.add(new Action("b", "B")),
      store.add(new Action("c", "C"))
    ];
    toolbar.setActions(actions);
    assert.strictEqual(toolbar.getItemsLength(), 3);
    assert.strictEqual(toolbar.getElement().querySelector(".monaco-action-bar")?.classList.contains("has-overflow"), false);
    availableWidth = 60;
    toolbar.relayout();
    assert.strictEqual(toolbar.getItemAction(toolbar.getItemsLength() - 1)?.id, ToggleMenuAction.ID);
    assert.strictEqual(toolbar.getElement().querySelector(".monaco-action-bar")?.classList.contains("has-overflow"), true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcdG9vbGJhclxcdG9vbGJhci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgVG9nZ2xlTWVudUFjdGlvbiwgVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdWkvdG9vbGJhci90b29sYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi91dGlscy5qcyc7XG5cbmNsYXNzIEZpeGVkV2lkdGhBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoYWN0aW9uOiBJQWN0aW9uLCBwcml2YXRlIHJlYWRvbmx5IHdpZHRoOiBudW1iZXIpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbik7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3RoaXMud2lkdGh9cHhgO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5ib3hTaXppbmcgPSAnYm9yZGVyLWJveCc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cdFx0Y29udGFpbmVyLnN0eWxlLndoaXRlU3BhY2UgPSAnbm93cmFwJztcblx0XHRjb250YWluZXIudGV4dENvbnRlbnQgPSB0aGlzLmFjdGlvbi5sYWJlbDtcblx0fVxufVxuXG5jbGFzcyBUZXN0VG9vbEJhciBleHRlbmRzIFRvb2xCYXIge1xuXHRnZXQgYWN0aW9uQmFyRm9yVGVzdCgpOiBQaWNrPEFjdGlvbkJhciwgJ2dldFdpZHRoJyB8ICdnZXRBY3Rpb24nPiB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uQmFyO1xuXHR9XG59XG5cbmNvbnN0IGNvbnRleHRNZW51UHJvdmlkZXI6IElDb250ZXh0TWVudVByb3ZpZGVyID0ge1xuXHRzaG93Q29udGV4dE1lbnU6ICgpID0+IHsgfVxufTtcblxuc3VpdGUoJ1Rvb2xCYXInLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICcyNzNweCc7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0Y29udGFpbmVyLnJlbW92ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgbGFzdCBwcmltYXJ5IGFjdGlvbiBzaHJpbmthYmxlIHdoZW4gb3ZlcmZsb3cgaXMgaW5zZXJ0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2lkdGhzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oW1xuXHRcdFx0Wyd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoQ29udGV4dCcsIDIyXSxcblx0XHRcdFsnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5Nb2RlUGlja2VyJywgNzVdLFxuXHRcdFx0Wyd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVsUGlja2VyJywgMjcxXSxcblx0XHRcdFsnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmNvbmZpZ3VyZVRvb2xzJywgMjJdLFxuXHRcdFx0W1RvZ2dsZU1lbnVBY3Rpb24uSUQsIDIyXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHRvb2xiYXIgPSBzdG9yZS5hZGQobmV3IFRlc3RUb29sQmFyKGNvbnRhaW5lciwgY29udGV4dE1lbnVQcm92aWRlciwge1xuXHRcdFx0cmVzcG9uc2l2ZUJlaGF2aW9yOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGtpbmQ6ICdsYXN0Jyxcblx0XHRcdFx0bWluSXRlbXM6IDEsXG5cdFx0XHRcdGFjdGlvbk1pbldpZHRoOiAyMixcblx0XHRcdH0sXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBhY3Rpb24gPT4ge1xuXHRcdFx0XHRjb25zdCB3aWR0aCA9IHdpZHRocy5nZXQoYWN0aW9uLmlkKTtcblx0XHRcdFx0cmV0dXJuIHR5cGVvZiB3aWR0aCA9PT0gJ251bWJlcicgPyBuZXcgRml4ZWRXaWR0aEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgd2lkdGgpIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0b29sYmFyLmFjdGlvbkJhckZvclRlc3Q7XG5cdFx0Y29uc3Qgb3JpZ2luYWxHZXRXaWR0aCA9IGFjdGlvbkJhci5nZXRXaWR0aC5iaW5kKGFjdGlvbkJhcik7XG5cdFx0YWN0aW9uQmFyLmdldFdpZHRoID0gKGluZGV4OiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGFjdGlvbkJhci5nZXRBY3Rpb24oaW5kZXgpO1xuXHRcdFx0cmV0dXJuIGFjdGlvbiA/ICh3aWR0aHMuZ2V0KGFjdGlvbi5pZCkgPz8gb3JpZ2luYWxHZXRXaWR0aChpbmRleCkpIDogb3JpZ2luYWxHZXRXaWR0aChpbmRleCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IG9yaWdpbmFsR2V0Qm91bmRpbmdDbGllbnRSZWN0ID0gdG9vbGJhci5nZXRFbGVtZW50KCkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0LmJpbmQodG9vbGJhci5nZXRFbGVtZW50KCkpO1xuXHRcdCh0b29sYmFyLmdldEVsZW1lbnQoKSBhcyBIVE1MRWxlbWVudCAmIHsgZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk6IERPTVJlY3QgfSkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0ID0gKCkgPT4gKHtcblx0XHRcdC4uLm9yaWdpbmFsR2V0Qm91bmRpbmdDbGllbnRSZWN0KCksXG5cdFx0XHR3aWR0aDogMjczLFxuXHRcdFx0cmlnaHQ6IDI3Myxcblx0XHRcdGxlZnQ6IDAsXG5cdFx0XHR4OiAwLFxuXHRcdFx0eTogMCxcblx0XHRcdHRvcDogMCxcblx0XHRcdGJvdHRvbTogMCxcblx0XHRcdGhlaWdodDogMCxcblx0XHRcdHRvSlNPTigpIHtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IFtcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoQ29udGV4dCcsICdBZGQgQ29udGV4dC4uLicpKSxcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVQaWNrZXInLCAnT3BlbiBBZ2VudCBQaWNrZXInKSksXG5cdFx0XHRzdG9yZS5hZGQobmV3IEFjdGlvbignd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5Nb2RlbFBpY2tlcicsICdPcGVuIE1vZGVsIFBpY2tlcicpKSxcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY29uZmlndXJlVG9vbHMnLCAnQ29uZmlndXJlIFRvb2xzLi4uJykpLFxuXHRcdF07XG5cblx0XHR0b29sYmFyLnNldEFjdGlvbnMoYWN0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbGJhci5nZXRJdGVtc0xlbmd0aCgpLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbGJhci5nZXRJdGVtQWN0aW9uKDApPy5pZCwgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hdHRhY2hDb250ZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xiYXIuZ2V0SXRlbUFjdGlvbigxKT8uaWQsICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVQaWNrZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbGJhci5nZXRJdGVtQWN0aW9uKDIpPy5pZCwgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZWxQaWNrZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbGJhci5nZXRJdGVtQWN0aW9uKDMpPy5pZCwgVG9nZ2xlTWVudUFjdGlvbi5JRCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xiYXIuZ2V0RWxlbWVudCgpLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYWN0aW9uLWJhcicpPy5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1vdmVyZmxvdycpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbGllcyBwZXItYWN0aW9uIHJlc3BvbnNpdmUgbWluIHdpZHRocycsICgpID0+IHtcblx0XHRjb25zdCB0b29sYmFyID0gc3RvcmUuYWRkKG5ldyBUb29sQmFyKGNvbnRhaW5lciwgY29udGV4dE1lbnVQcm92aWRlciwge1xuXHRcdFx0cmVzcG9uc2l2ZUJlaGF2aW9yOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGtpbmQ6ICdsYXN0Jyxcblx0XHRcdFx0bWluSXRlbXM6IDEsXG5cdFx0XHRcdGFjdGlvbk1pbldpZHRoOiAyMixcblx0XHRcdFx0Z2V0QWN0aW9uTWluV2lkdGg6IGFjdGlvbiA9PiBhY3Rpb24uaWQgPT09ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVsUGlja2VyJyA/IDI4IDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGFjdGlvbiA9PiBuZXcgRml4ZWRXaWR0aEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgMjIpXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IFtcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoQ29udGV4dCcsICdBZGQgQ29udGV4dC4uLicpKSxcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVQaWNrZXInLCAnT3BlbiBBZ2VudCBQaWNrZXInKSksXG5cdFx0XHRzdG9yZS5hZGQobmV3IEFjdGlvbignd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5Nb2RlbFBpY2tlcicsICdPcGVuIE1vZGVsIFBpY2tlcicpKSxcblx0XHRdO1xuXG5cdFx0dG9vbGJhci5zZXRBY3Rpb25zKGFjdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xiYXIuZ2V0RWxlbWVudCgpLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJy0tdnNjb2RlLXRvb2xiYXItYWN0aW9uLW1pbi13aWR0aCcpLCAnMjhweCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxheW91dCByZS1ldmFsdWF0ZXMgcmVzcG9uc2l2ZSBvdmVyZmxvdyBhZnRlciBhY3Rpb24gd2lkdGggY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCB3aWR0aHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPihbXG5cdFx0XHRbJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hdHRhY2hDb250ZXh0JywgMjJdLFxuXHRcdFx0Wyd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVQaWNrZXInLCAyMl0sXG5cdFx0XHRbJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZWxQaWNrZXInLCA1MF0sXG5cdFx0XHRbVG9nZ2xlTWVudUFjdGlvbi5JRCwgMjJdLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IHN0b3JlLmFkZChuZXcgVGVzdFRvb2xCYXIoY29udGFpbmVyLCBjb250ZXh0TWVudVByb3ZpZGVyLCB7XG5cdFx0XHRyZXNwb25zaXZlQmVoYXZpb3I6IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0a2luZDogJ2xhc3QnLFxuXHRcdFx0XHRtaW5JdGVtczogMSxcblx0XHRcdFx0YWN0aW9uTWluV2lkdGg6IDIyLFxuXHRcdFx0fSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGFjdGlvbiA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZHRoID0gd2lkdGhzLmdldChhY3Rpb24uaWQpO1xuXHRcdFx0XHRyZXR1cm4gdHlwZW9mIHdpZHRoID09PSAnbnVtYmVyJyA/IG5ldyBGaXhlZFdpZHRoQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCB3aWR0aCkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IHRvb2xiYXIuYWN0aW9uQmFyRm9yVGVzdDtcblx0XHRjb25zdCBvcmlnaW5hbEdldFdpZHRoID0gYWN0aW9uQmFyLmdldFdpZHRoLmJpbmQoYWN0aW9uQmFyKTtcblx0XHRhY3Rpb25CYXIuZ2V0V2lkdGggPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gYWN0aW9uQmFyLmdldEFjdGlvbihpbmRleCk7XG5cdFx0XHRyZXR1cm4gYWN0aW9uID8gKHdpZHRocy5nZXQoYWN0aW9uLmlkKSA/PyBvcmlnaW5hbEdldFdpZHRoKGluZGV4KSkgOiBvcmlnaW5hbEdldFdpZHRoKGluZGV4KTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxHZXRCb3VuZGluZ0NsaWVudFJlY3QgPSB0b29sYmFyLmdldEVsZW1lbnQoKS5nZXRCb3VuZGluZ0NsaWVudFJlY3QuYmluZCh0b29sYmFyLmdldEVsZW1lbnQoKSk7XG5cdFx0KHRvb2xiYXIuZ2V0RWxlbWVudCgpIGFzIEhUTUxFbGVtZW50ICYgeyBnZXRCb3VuZGluZ0NsaWVudFJlY3QoKTogRE9NUmVjdCB9KS5nZXRCb3VuZGluZ0NsaWVudFJlY3QgPSAoKSA9PiAoe1xuXHRcdFx0Li4ub3JpZ2luYWxHZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcblx0XHRcdHdpZHRoOiAxMTAsXG5cdFx0XHRyaWdodDogMTEwLFxuXHRcdFx0bGVmdDogMCxcblx0XHRcdHg6IDAsXG5cdFx0XHR5OiAwLFxuXHRcdFx0dG9wOiAwLFxuXHRcdFx0Ym90dG9tOiAwLFxuXHRcdFx0aGVpZ2h0OiAwLFxuXHRcdFx0dG9KU09OKCkge1xuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gW1xuXHRcdFx0c3RvcmUuYWRkKG5ldyBBY3Rpb24oJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hdHRhY2hDb250ZXh0JywgJ0FkZCBDb250ZXh0Li4uJykpLFxuXHRcdFx0c3RvcmUuYWRkKG5ldyBBY3Rpb24oJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZVBpY2tlcicsICdPcGVuIE1vZGUgUGlja2VyJykpLFxuXHRcdFx0c3RvcmUuYWRkKG5ldyBBY3Rpb24oJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZWxQaWNrZXInLCAnT3BlbiBNb2RlbCBQaWNrZXInKSksXG5cdFx0XTtcblxuXHRcdHRvb2xiYXIuc2V0QWN0aW9ucyhhY3Rpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sYmFyLmdldEl0ZW1zTGVuZ3RoKCksIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sYmFyLmdldEl0ZW1BY3Rpb24oMik/LmlkLCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5Nb2RlbFBpY2tlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sYmFyLmdldEVsZW1lbnQoKS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWFjdGlvbi1iYXInKT8uY2xhc3NMaXN0LmNvbnRhaW5zKCdoYXMtb3ZlcmZsb3cnKSwgZmFsc2UpO1xuXG5cdFx0d2lkdGhzLnNldCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5Nb2RlUGlja2VyJywgODApO1xuXHRcdHRvb2xiYXIucmVsYXlvdXQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sYmFyLmdldEl0ZW1zTGVuZ3RoKCksIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sYmFyLmdldEl0ZW1BY3Rpb24oMCk/LmlkLCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaENvbnRleHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbGJhci5nZXRJdGVtQWN0aW9uKDEpPy5pZCwgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZVBpY2tlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sYmFyLmdldEl0ZW1BY3Rpb24oMik/LmlkLCBUb2dnbGVNZW51QWN0aW9uLklEKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbGJhci5nZXRFbGVtZW50KCkucXVlcnlTZWxlY3RvcignLm1vbmFjby1hY3Rpb24tYmFyJyk/LmNsYXNzTGlzdC5jb250YWlucygnaGFzLW92ZXJmbG93JyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXBlYXRlZGx5IHJlc3RvcmUgYW4gYWN0aW9uIGJlbG93IGl0cyByZXF1aXJlZCB3aWR0aCcsICgpID0+IHtcblx0XHRjb25zdCB3aWR0aHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPihbXG5cdFx0XHRbJ3ByaW1hcnkuYScsIDU2XSxcblx0XHRcdFsncHJpbWFyeS5iJywgNDhdLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbmRlckNvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0bGV0IGF2YWlsYWJsZVdpZHRoID0gMTI4O1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IHN0b3JlLmFkZChuZXcgVGVzdFRvb2xCYXIoY29udGFpbmVyLCBjb250ZXh0TWVudVByb3ZpZGVyLCB7XG5cdFx0XHRyZXNwb25zaXZlQmVoYXZpb3I6IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0a2luZDogJ2xhc3QnLFxuXHRcdFx0XHRtaW5JdGVtczogMSxcblx0XHRcdFx0YWN0aW9uTWluV2lkdGg6IDQ4LFxuXHRcdFx0XHRnZXRBdmFpbGFibGVXaWR0aDogKCkgPT4gYXZhaWxhYmxlV2lkdGgsXG5cdFx0XHR9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogYWN0aW9uID0+IHtcblx0XHRcdFx0cmVuZGVyQ291bnRzLnNldChhY3Rpb24uaWQsIChyZW5kZXJDb3VudHMuZ2V0KGFjdGlvbi5pZCkgPz8gMCkgKyAxKTtcblx0XHRcdFx0Y29uc3Qgd2lkdGggPSB3aWR0aHMuZ2V0KGFjdGlvbi5pZCk7XG5cdFx0XHRcdHJldHVybiB0eXBlb2Ygd2lkdGggPT09ICdudW1iZXInID8gbmV3IEZpeGVkV2lkdGhBY3Rpb25WaWV3SXRlbShhY3Rpb24sIHdpZHRoKSA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnMgPSBbXG5cdFx0XHRzdG9yZS5hZGQobmV3IEFjdGlvbigncHJpbWFyeS5hJywgJ1ByaW1hcnkgQScpKSxcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKCdwcmltYXJ5LmInLCAnUHJpbWFyeSBCJykpLFxuXHRcdF07XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aW9ucyA9IFtzdG9yZS5hZGQobmV3IEFjdGlvbignc2Vjb25kYXJ5JywgJ1NlY29uZGFyeScpKV07XG5cdFx0Y29uc3QgZ2V0QWN0aW9uSWRzID0gKCkgPT4gQXJyYXkuZnJvbSh7IGxlbmd0aDogdG9vbGJhci5nZXRJdGVtc0xlbmd0aCgpIH0sIChfLCBpbmRleCkgPT4gdG9vbGJhci5nZXRJdGVtQWN0aW9uKGluZGV4KT8uaWQpO1xuXG5cdFx0dG9vbGJhci5zZXRBY3Rpb25zKHByaW1hcnlBY3Rpb25zLCBzZWNvbmRhcnlBY3Rpb25zKTtcblx0XHRjb25zdCBhZnRlckluaXRpYWxMYXlvdXQgPSBnZXRBY3Rpb25JZHMoKTtcblx0XHR0b29sYmFyLnJlbGF5b3V0KCk7XG5cdFx0Y29uc3QgYWZ0ZXJSZXBlYXRlZExheW91dCA9IGdldEFjdGlvbklkcygpO1xuXG5cdFx0YXZhaWxhYmxlV2lkdGggPSAxMzY7XG5cdFx0dG9vbGJhci5yZWxheW91dCgpO1xuXHRcdGNvbnN0IGFmdGVyR3Jvd2luZyA9IGdldEFjdGlvbklkcygpO1xuXG5cdFx0YXZhaWxhYmxlV2lkdGggPSAxMjg7XG5cdFx0dG9vbGJhci5yZWxheW91dCgpO1xuXHRcdHRvb2xiYXIucmVsYXlvdXQoKTtcblx0XHRjb25zdCBhZnRlclNocmlua2luZ0FnYWluID0gZ2V0QWN0aW9uSWRzKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFmdGVySW5pdGlhbExheW91dCxcblx0XHRcdGFmdGVyUmVwZWF0ZWRMYXlvdXQsXG5cdFx0XHRhZnRlckdyb3dpbmcsXG5cdFx0XHRhZnRlclNocmlua2luZ0FnYWluLFxuXHRcdFx0cHJpbWFyeUJSZW5kZXJDb3VudDogcmVuZGVyQ291bnRzLmdldCgncHJpbWFyeS5iJyksXG5cdFx0fSwge1xuXHRcdFx0YWZ0ZXJJbml0aWFsTGF5b3V0OiBbJ3ByaW1hcnkuYScsIFRvZ2dsZU1lbnVBY3Rpb24uSURdLFxuXHRcdFx0YWZ0ZXJSZXBlYXRlZExheW91dDogWydwcmltYXJ5LmEnLCBUb2dnbGVNZW51QWN0aW9uLklEXSxcblx0XHRcdGFmdGVyR3Jvd2luZzogWydwcmltYXJ5LmEnLCAncHJpbWFyeS5iJywgVG9nZ2xlTWVudUFjdGlvbi5JRF0sXG5cdFx0XHRhZnRlclNocmlua2luZ0FnYWluOiBbJ3ByaW1hcnkuYScsIFRvZ2dsZU1lbnVBY3Rpb24uSURdLFxuXHRcdFx0cHJpbWFyeUJSZW5kZXJDb3VudDogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyB0aGUgcmVzcG9uc2l2ZSBtaW5pbXVtIHdoZW4gbWVhc3VyaW5nIGFuIGFjdGlvbiB0aGF0IHdpbGwgc3RvcCBzaHJpbmtpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2lkdGhzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oW1xuXHRcdFx0WydwcmltYXJ5LmEnLCAyMl0sXG5cdFx0XHRbJ3ByaW1hcnkuYicsIDQ4XSxcblx0XHRdKTtcblx0XHRsZXQgYXZhaWxhYmxlV2lkdGggPSA5MDtcblxuXHRcdGNvbnN0IHRvb2xiYXIgPSBzdG9yZS5hZGQobmV3IFRlc3RUb29sQmFyKGNvbnRhaW5lciwgY29udGV4dE1lbnVQcm92aWRlciwge1xuXHRcdFx0cmVzcG9uc2l2ZUJlaGF2aW9yOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGtpbmQ6ICdsYXN0Jyxcblx0XHRcdFx0bWluSXRlbXM6IDEsXG5cdFx0XHRcdGFjdGlvbk1pbldpZHRoOiA0OCxcblx0XHRcdFx0Z2V0QXZhaWxhYmxlV2lkdGg6ICgpID0+IGF2YWlsYWJsZVdpZHRoLFxuXHRcdFx0fSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGFjdGlvbiA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZHRoID0gd2lkdGhzLmdldChhY3Rpb24uaWQpO1xuXHRcdFx0XHRyZXR1cm4gdHlwZW9mIHdpZHRoID09PSAnbnVtYmVyJyA/IG5ldyBGaXhlZFdpZHRoQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCB3aWR0aCkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zID0gW1xuXHRcdFx0c3RvcmUuYWRkKG5ldyBBY3Rpb24oJ3ByaW1hcnkuYScsICdQcmltYXJ5IEEnKSksXG5cdFx0XHRzdG9yZS5hZGQobmV3IEFjdGlvbigncHJpbWFyeS5iJywgJ1ByaW1hcnkgQicpKSxcblx0XHRdO1xuXHRcdGNvbnN0IHNlY29uZGFyeUFjdGlvbnMgPSBbc3RvcmUuYWRkKG5ldyBBY3Rpb24oJ3NlY29uZGFyeScsICdTZWNvbmRhcnknKSldO1xuXHRcdGNvbnN0IGdldEFjdGlvbklkcyA9ICgpID0+IEFycmF5LmZyb20oeyBsZW5ndGg6IHRvb2xiYXIuZ2V0SXRlbXNMZW5ndGgoKSB9LCAoXywgaW5kZXgpID0+IHRvb2xiYXIuZ2V0SXRlbUFjdGlvbihpbmRleCk/LmlkKTtcblxuXHRcdHRvb2xiYXIuc2V0QWN0aW9ucyhwcmltYXJ5QWN0aW9ucywgc2Vjb25kYXJ5QWN0aW9ucyk7XG5cdFx0Y29uc3QgYmVmb3JlR3Jvd2luZyA9IGdldEFjdGlvbklkcygpO1xuXG5cdFx0YXZhaWxhYmxlV2lkdGggPSAxMTA7XG5cdFx0dG9vbGJhci5yZWxheW91dCgpO1xuXHRcdGNvbnN0IGFmdGVyR3Jvd2luZyA9IGdldEFjdGlvbklkcygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVHcm93aW5nLFxuXHRcdFx0YWZ0ZXJHcm93aW5nLFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZUdyb3dpbmc6IFsncHJpbWFyeS5hJywgVG9nZ2xlTWVudUFjdGlvbi5JRF0sXG5cdFx0XHRhZnRlckdyb3dpbmc6IFsncHJpbWFyeS5hJywgJ3ByaW1hcnkuYicsIFRvZ2dsZU1lbnVBY3Rpb24uSURdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBhIGhpZGRlbiBhY3Rpb24gYWZ0ZXIgYSB2aXNpYmxlIGFjdGlvbiBzaHJpbmtzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF2YWlsYWJsZVdpZHRoID0gMTI4O1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IHN0b3JlLmFkZChuZXcgVGVzdFRvb2xCYXIoY29udGFpbmVyLCBjb250ZXh0TWVudVByb3ZpZGVyLCB7XG5cdFx0XHRyZXNwb25zaXZlQmVoYXZpb3I6IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0a2luZDogJ2xhc3QnLFxuXHRcdFx0XHRtaW5JdGVtczogMSxcblx0XHRcdFx0YWN0aW9uTWluV2lkdGg6IDQ4LFxuXHRcdFx0XHRnZXRBdmFpbGFibGVXaWR0aDogKCkgPT4gYXZhaWxhYmxlV2lkdGgsXG5cdFx0XHR9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogYWN0aW9uID0+IHtcblx0XHRcdFx0c3dpdGNoIChhY3Rpb24uaWQpIHtcblx0XHRcdFx0XHRjYXNlICdwcmltYXJ5LmEnOiByZXR1cm4gbmV3IEZpeGVkV2lkdGhBY3Rpb25WaWV3SXRlbShhY3Rpb24sIDEwMCk7XG5cdFx0XHRcdFx0Y2FzZSAncHJpbWFyeS5iJzogcmV0dXJuIG5ldyBGaXhlZFdpZHRoQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCA0OCk7XG5cdFx0XHRcdFx0ZGVmYXVsdDogcmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBwcmltYXJ5QWN0aW9ucyA9IFtcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKCdwcmltYXJ5LmEnLCAnUHJpbWFyeSBBJykpLFxuXHRcdFx0c3RvcmUuYWRkKG5ldyBBY3Rpb24oJ3ByaW1hcnkuYicsICdQcmltYXJ5IEInKSksXG5cdFx0XTtcblx0XHRjb25zdCBzZWNvbmRhcnlBY3Rpb25zID0gW3N0b3JlLmFkZChuZXcgQWN0aW9uKCdzZWNvbmRhcnknLCAnU2Vjb25kYXJ5JykpXTtcblx0XHRjb25zdCBnZXRBY3Rpb25JZHMgPSAoKSA9PiBBcnJheS5mcm9tKHsgbGVuZ3RoOiB0b29sYmFyLmdldEl0ZW1zTGVuZ3RoKCkgfSwgKF8sIGluZGV4KSA9PiB0b29sYmFyLmdldEl0ZW1BY3Rpb24oaW5kZXgpPy5pZCk7XG5cblx0XHR0b29sYmFyLnNldEFjdGlvbnMocHJpbWFyeUFjdGlvbnMsIHNlY29uZGFyeUFjdGlvbnMpO1xuXHRcdGNvbnN0IGJlZm9yZVNocmlua2luZyA9IGdldEFjdGlvbklkcygpO1xuXG5cdFx0Y29uc3QgcHJpbWFyeUFJdGVtID0gdG9vbGJhci5nZXRFbGVtZW50KCkucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hY3Rpb24taXRlbScpO1xuXHRcdGFzc2VydC5vayhwcmltYXJ5QUl0ZW0pO1xuXHRcdHByaW1hcnlBSXRlbS5zdHlsZS53aWR0aCA9ICc0OHB4Jztcblx0XHR0b29sYmFyLnJlbGF5b3V0KCk7XG5cdFx0Y29uc3QgYWZ0ZXJTaHJpbmtpbmcgPSBnZXRBY3Rpb25JZHMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YmVmb3JlU2hyaW5raW5nLFxuXHRcdFx0YWZ0ZXJTaHJpbmtpbmcsXG5cdFx0fSwge1xuXHRcdFx0YmVmb3JlU2hyaW5raW5nOiBbJ3ByaW1hcnkuYScsIFRvZ2dsZU1lbnVBY3Rpb24uSURdLFxuXHRcdFx0YWZ0ZXJTaHJpbmtpbmc6IFsncHJpbWFyeS5hJywgJ3ByaW1hcnkuYicsIFRvZ2dsZU1lbnVBY3Rpb24uSURdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGdldEF2YWlsYWJsZVdpZHRoIG92ZXJyaWRlIGluc3RlYWQgb2YgdGhlIGVsZW1lbnQgd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2lkdGhzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oW1xuXHRcdFx0WydhJywgNTBdLFxuXHRcdFx0WydiJywgNTBdLFxuXHRcdFx0WydjJywgNTBdLFxuXHRcdFx0W1RvZ2dsZU1lbnVBY3Rpb24uSUQsIDIyXSxcblx0XHRdKTtcblxuXHRcdGxldCBhdmFpbGFibGVXaWR0aCA9IDIwMDtcblxuXHRcdGNvbnN0IHRvb2xiYXIgPSBzdG9yZS5hZGQobmV3IFRlc3RUb29sQmFyKGNvbnRhaW5lciwgY29udGV4dE1lbnVQcm92aWRlciwge1xuXHRcdFx0cmVzcG9uc2l2ZUJlaGF2aW9yOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGtpbmQ6ICdsYXN0Jyxcblx0XHRcdFx0bWluSXRlbXM6IDEsXG5cdFx0XHRcdGFjdGlvbk1pbldpZHRoOiAyMixcblx0XHRcdFx0Z2V0QXZhaWxhYmxlV2lkdGg6ICgpID0+IGF2YWlsYWJsZVdpZHRoLFxuXHRcdFx0fSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGFjdGlvbiA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZHRoID0gd2lkdGhzLmdldChhY3Rpb24uaWQpO1xuXHRcdFx0XHRyZXR1cm4gdHlwZW9mIHdpZHRoID09PSAnbnVtYmVyJyA/IG5ldyBGaXhlZFdpZHRoQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCB3aWR0aCkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IHRvb2xiYXIuYWN0aW9uQmFyRm9yVGVzdDtcblx0XHRjb25zdCBvcmlnaW5hbEdldFdpZHRoID0gYWN0aW9uQmFyLmdldFdpZHRoLmJpbmQoYWN0aW9uQmFyKTtcblx0XHRhY3Rpb25CYXIuZ2V0V2lkdGggPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gYWN0aW9uQmFyLmdldEFjdGlvbihpbmRleCk7XG5cdFx0XHRyZXR1cm4gYWN0aW9uID8gKHdpZHRocy5nZXQoYWN0aW9uLmlkKSA/PyBvcmlnaW5hbEdldFdpZHRoKGluZGV4KSkgOiBvcmlnaW5hbEdldFdpZHRoKGluZGV4KTtcblx0XHR9O1xuXG5cdFx0Ly8gRm9yY2UgdGhlIGVsZW1lbnQncyBib3VuZGluZyByZWN0IHRvIGEgdmFsdWUgdGhhdCB3b3VsZCBvdGhlcndpc2UgaGlkZSBldmVyeXRoaW5nXG5cdFx0Ly8gdG8gcHJvdmUgdGhlIHRvb2xiYXIgdXNlcyB0aGUgb3ZlcnJpZGUgY2FsbGJhY2sgaW5zdGVhZC5cblx0XHRjb25zdCBvcmlnaW5hbEdldEJvdW5kaW5nQ2xpZW50UmVjdCA9IHRvb2xiYXIuZ2V0RWxlbWVudCgpLmdldEJvdW5kaW5nQ2xpZW50UmVjdC5iaW5kKHRvb2xiYXIuZ2V0RWxlbWVudCgpKTtcblx0XHQodG9vbGJhci5nZXRFbGVtZW50KCkgYXMgSFRNTEVsZW1lbnQgJiB7IGdldEJvdW5kaW5nQ2xpZW50UmVjdCgpOiBET01SZWN0IH0pLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9ICgpID0+ICh7XG5cdFx0XHQuLi5vcmlnaW5hbEdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLFxuXHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRyaWdodDogMCxcblx0XHRcdGxlZnQ6IDAsXG5cdFx0XHR4OiAwLFxuXHRcdFx0eTogMCxcblx0XHRcdHRvcDogMCxcblx0XHRcdGJvdHRvbTogMCxcblx0XHRcdGhlaWdodDogMCxcblx0XHRcdHRvSlNPTigpIHtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IFtcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKCdhJywgJ0EnKSksXG5cdFx0XHRzdG9yZS5hZGQobmV3IEFjdGlvbignYicsICdCJykpLFxuXHRcdFx0c3RvcmUuYWRkKG5ldyBBY3Rpb24oJ2MnLCAnQycpKSxcblx0XHRdO1xuXG5cdFx0dG9vbGJhci5zZXRBY3Rpb25zKGFjdGlvbnMpO1xuXG5cdFx0Ly8gYXZhaWxhYmxlV2lkdGggPSAyMDAgaXMgcGxlbnR5IGZvciBhbGwgMyBhY3Rpb25zOyB0aGUgZWxlbWVudCdzIDAgd2lkdGggaXMgaWdub3JlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sYmFyLmdldEl0ZW1zTGVuZ3RoKCksIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sYmFyLmdldEVsZW1lbnQoKS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWFjdGlvbi1iYXInKT8uY2xhc3NMaXN0LmNvbnRhaW5zKCdoYXMtb3ZlcmZsb3cnKSwgZmFsc2UpO1xuXG5cdFx0YXZhaWxhYmxlV2lkdGggPSA2MDtcblx0XHR0b29sYmFyLnJlbGF5b3V0KCk7XG5cblx0XHQvLyBhdmFpbGFibGVXaWR0aCBzaHJhbmsgXHUyMDE0IGFjdGlvbnMgb3ZlcmZsb3cgaW50byB0aGUgdG9nZ2xlIG1lbnVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbGJhci5nZXRJdGVtQWN0aW9uKHRvb2xiYXIuZ2V0SXRlbXNMZW5ndGgoKSAtIDEpPy5pZCwgVG9nZ2xlTWVudUFjdGlvbi5JRCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xiYXIuZ2V0RWxlbWVudCgpLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYWN0aW9uLWJhcicpPy5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1vdmVyZmxvdycpLCB0cnVlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUduQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUFrQixlQUFlO0FBQzFDLFNBQVMsY0FBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxpQ0FBaUMsbUJBQW1CO0FBQUEsRUFFekQsWUFBWSxRQUFrQyxP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
