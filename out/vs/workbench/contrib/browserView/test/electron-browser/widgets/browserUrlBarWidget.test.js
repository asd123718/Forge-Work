import assert from "assert";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { NullHoverService } from "../../../../../../platform/hover/test/browser/nullHoverService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import {
  IQuickInputService,
  QuickInputHideReason
} from "../../../../../../platform/quickinput/common/quickInput.js";
import { BrowserUrlBarWidget } from "../../../electron-browser/widgets/browserUrlBarWidget.js";
class FakeQuickPick extends Disposable {
  constructor() {
    super(...arguments);
    this.ignoreFocusOut = false;
    this.sortByLabel = true;
    this.matchOnDescription = false;
    this.buttons = [];
    this._value = "";
    this._items = [];
    this._activeItems = [];
    this.itemsAssignmentCount = 0;
    this.activeItemsAssignmentCount = 0;
    this.visible = false;
    this._onWillHide = this._register(new Emitter());
    this.onWillHide = this._onWillHide.event;
    this._onDidChangeValue = this._register(new Emitter());
    this.onDidChangeValue = this._onDidChangeValue.event;
    this._onDidTriggerButton = this._register(new Emitter());
    this.onDidTriggerButton = this._onDidTriggerButton.event;
    this._onDidTriggerItemButton = this._register(new Emitter());
    this.onDidTriggerItemButton = this._onDidTriggerItemButton.event;
    this._onDidTriggerSeparatorButton = this._register(new Emitter());
    this.onDidTriggerSeparatorButton = this._onDidTriggerSeparatorButton.event;
    this._onDidAccept = this._register(new Emitter());
    this.onDidAccept = this._onDidAccept.event;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
  }
  get items() {
    return this._items;
  }
  set items(items) {
    this._items = items;
    this.itemsAssignmentCount++;
    if (this.visible) {
      this._activeItems = items.filter((item) => item.type !== "separator").slice(0, 1);
    }
  }
  get activeItems() {
    return this._activeItems;
  }
  set activeItems(activeItems) {
    this._activeItems = activeItems;
    this.activeItemsAssignmentCount++;
  }
  get value() {
    return this._value;
  }
  set value(value) {
    if (this._value !== value) {
      this._value = value;
      this._onDidChangeValue.fire(value);
    }
  }
  show() {
    this.visible = true;
  }
  hide(reason = QuickInputHideReason.Other) {
    if (!this.visible) {
      return;
    }
    this.visible = false;
    this._onWillHide.fire({ reason });
    this._onDidHide.fire({ reason });
  }
  type(value) {
    this.value = value;
  }
  accept() {
    this._onDidAccept.fire({ inBackground: false });
  }
  triggerButton(button) {
    this._onDidTriggerButton.fire(button);
  }
  triggerItemButton(item, button) {
    this._onDidTriggerItemButton.fire({ item, button });
  }
  triggerSeparatorButton(separator, button) {
    this._onDidTriggerSeparatorButton.fire({ separator, button });
  }
}
function asPicker(fake) {
  return fake;
}
function asInput(state) {
  return state;
}
suite("BrowserUrlBarWidget", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function makeHarness(readonly = false) {
    const picker = new FakeQuickPick();
    store.add({
      dispose: () => {
        if (picker.visible) {
          picker.hide();
        }
        picker.dispose();
      }
    });
    let replacementActive = false;
    const quickInputService = {
      get currentQuickInput() {
        if (replacementActive) {
          return {};
        }
        return picker.visible ? asPicker(picker) : void 0;
      },
      createQuickPick: ((..._args) => asPicker(picker))
    };
    const navigated = [];
    const inputState = {
      url: "https://example.com/",
      navigate(url) {
        navigated.push(url);
      }
    };
    let ensureBrowserFocusCalls = 0;
    const host = {
      get input() {
        return asInput(inputState);
      },
      isReadonly: readonly,
      ensureBrowserFocus() {
        ensureBrowserFocusCalls++;
      }
    };
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IQuickInputService, quickInputService);
    instantiationService.stub(IHoverService, NullHoverService);
    const widget = store.add(instantiationService.createInstance(BrowserUrlBarWidget, host));
    widget.mountContributions([]);
    mainWindow.document.body.appendChild(widget.element);
    store.add({ dispose: () => widget.element.remove() });
    const display = widget.element.querySelector(".browser-url-display");
    return {
      widget,
      picker,
      display,
      inputState,
      navigated,
      ensureBrowserFocusCalls: () => ensureBrowserFocusCalls,
      setReplaced: (active) => {
        replacementActive = active;
      }
    };
  }
  function mountSuggestionProvider(widget, provider) {
    const contribution = {
      widgets: [],
      urlRenderers: [],
      urlSuggestionProviders: [provider],
      urlPickerActionProviders: []
    };
    widget.mountContributions([contribution]);
  }
  test("readonly URL bar remains focusable without opening the picker", () => {
    const harness = makeHarness(true);
    harness.widget.openUrlPicker();
    harness.display.dispatchEvent(new FocusEvent("focus", { relatedTarget: mainWindow.document.body }));
    harness.display.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.deepStrictEqual({
      activeElement: mainWindow.document.activeElement === harness.display,
      contentEditable: harness.display.contentEditable,
      ariaReadonly: harness.display.getAttribute("aria-readonly"),
      ariaLabel: harness.display.getAttribute("aria-label"),
      pickerVisible: harness.picker.visible,
      navigated: harness.navigated
    }, {
      activeElement: true,
      contentEditable: "false",
      ariaReadonly: "true",
      ariaLabel: "Address. This address cannot be changed because the browser is locked to a file resource.",
      pickerVisible: false,
      navigated: []
    });
  });
  function mountPickerActionProvider(widget, provider) {
    const contribution = {
      widgets: [],
      urlRenderers: [],
      urlSuggestionProviders: [],
      urlPickerActionProviders: [provider]
    };
    widget.mountContributions([contribution]);
  }
  async function waitForProviderRender(delay = 0) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    await Promise.resolve();
    await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
  }
  test("initial render shows the canonical URL", () => {
    const { display } = makeHarness();
    assert.strictEqual(display.textContent, "https://example.com/");
  });
  test("refreshUrl updates the display when the input URL changes", () => {
    const { widget, display, inputState } = makeHarness();
    inputState.url = "https://newsite.test/path";
    widget.refreshUrl();
    assert.strictEqual(display.textContent, "https://newsite.test/path");
  });
  test("previewUrl renders an override URL while not editing", () => {
    const { widget, display } = makeHarness();
    widget.previewUrl("https://preview.test/");
    assert.strictEqual(display.textContent, "https://preview.test/");
  });
  test("previewUrl is a no-op while the picker is open", () => {
    const { widget, display } = makeHarness();
    widget.openUrlPicker();
    widget.previewUrl("https://should-not-show.test/");
    assert.strictEqual(display.textContent, "https://example.com/");
  });
  test("openUrlPicker shows a picker pre-filled with the canonical URL", () => {
    const { widget, picker } = makeHarness();
    widget.openUrlPicker();
    assert.deepStrictEqual(
      {
        visible: picker.visible,
        value: picker.value,
        valueSelection: picker.valueSelection,
        anchorPosition: picker.anchorPosition
      },
      {
        visible: true,
        value: "https://example.com/",
        valueSelection: [0, "https://example.com/".length],
        anchorPosition: "overlay"
      }
    );
  });
  test("clicking the already-focused display does not auto-open the picker", () => {
    const { widget, picker, display } = makeHarness();
    widget.focusUrlInput();
    display.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.strictEqual(picker.visible, false);
  });
  test("first click after mouse focus opens the picker", () => {
    const { picker, display } = makeHarness();
    display.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    display.focus();
    display.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.strictEqual(picker.visible, true);
  });
  test('accepting the "Go to" item navigates to the typed value', () => {
    const { widget, picker, navigated } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://target.test/page");
    picker.activeItems = [picker.items.find((i) => i.type !== "separator")];
    picker.accept();
    assert.deepStrictEqual(navigated, ["https://target.test/page"]);
  });
  test("accepting a contributed suggestion calls its apply with the input", async () => {
    const harness = makeHarness();
    const { widget, picker, inputState } = harness;
    const applyCalls = [];
    mountSuggestionProvider(widget, {
      async getSuggestions() {
        return [{
          id: "sugg-1",
          label: "Suggestion",
          apply(input) {
            applyCalls.push(input);
          }
        }];
      }
    });
    widget.openUrlPicker();
    await waitForProviderRender();
    const suggestion = picker.items.find((i) => i.type !== "separator" && i.id === "sugg-1");
    assert.ok(suggestion, "suggestion item should be present");
    picker.activeItems = [suggestion];
    picker.accept();
    assert.strictEqual(applyCalls.length, 1);
    assert.strictEqual(applyCalls[0], asInput(inputState));
  });
  test("hiding after an accept reverts to canonical and releases focus to the page", () => {
    const harness = makeHarness();
    const { widget, picker, display } = harness;
    widget.openUrlPicker();
    picker.type("https://typed.test/");
    picker.accept();
    assert.deepStrictEqual(
      {
        display: display.textContent,
        visible: picker.visible,
        ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls()
      },
      {
        display: "https://example.com/",
        visible: false,
        ensureBrowserFocusCalls: 1
      }
    );
  });
  test("hiding on Blur reverts to canonical without releasing focus to the page", () => {
    const harness = makeHarness();
    const { widget, picker, display } = harness;
    widget.openUrlPicker();
    picker.type("https://abandoned.test/");
    picker.hide(QuickInputHideReason.Blur);
    assert.deepStrictEqual(
      {
        display: display.textContent,
        visible: picker.visible,
        ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls()
      },
      {
        display: "https://example.com/",
        visible: false,
        ensureBrowserFocusCalls: 0
      }
    );
  });
  test("clear hides the picker and reverts the display", () => {
    const { widget, picker, display } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://wip.test/");
    widget.clear();
    assert.deepStrictEqual(
      { display: display.textContent, visible: picker.visible },
      { display: "https://example.com/", visible: false }
    );
  });
  test("typing in the picker mirrors into the display", () => {
    const { widget, picker, display } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://typing.test/");
    assert.strictEqual(display.textContent, "https://typing.test/");
  });
  test("dismissal without action refocuses the display and preserves the typed text", () => {
    const harness = makeHarness();
    const { widget, picker, display } = harness;
    widget.openUrlPicker();
    picker.type("https://in-progress.test/");
    picker.hide(QuickInputHideReason.Other);
    assert.deepStrictEqual(
      {
        display: display.textContent,
        active: display.ownerDocument.activeElement === display,
        ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls()
      },
      {
        display: "https://in-progress.test/",
        active: true,
        ensureBrowserFocusCalls: 0
      }
    );
  });
  test("a replaced picker reverts the display and suppresses the next focus-open", () => {
    const { widget, picker, display, setReplaced } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://abandoned.test/");
    setReplaced(true);
    picker.hide(QuickInputHideReason.Other);
    display.focus();
    assert.deepStrictEqual(
      { display: display.textContent, pickerVisible: picker.visible },
      { display: "https://example.com/", pickerVisible: false }
    );
  });
  test("accept with no active item navigates to the picker value", () => {
    const { widget, picker, navigated } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://fallback.test/");
    picker.activeItems = [];
    picker.accept();
    assert.deepStrictEqual(navigated, ["https://fallback.test/"]);
  });
  test("refreshUrl keeps an unedited picker synchronized with the canonical URL", () => {
    const { widget, picker, inputState } = makeHarness();
    widget.openUrlPicker();
    inputState.url = "https://changed.test/";
    widget.refreshUrl();
    inputState.url = "https://changed-again.test/";
    widget.refreshUrl();
    assert.strictEqual(picker.value, "https://changed-again.test/");
  });
  test("refreshUrl does not overwrite picker input after the user types", () => {
    const { widget, picker, inputState } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://typed.test/");
    inputState.url = "https://changed.test/";
    widget.refreshUrl();
    assert.strictEqual(picker.value, "https://typed.test/");
  });
  test("refreshUrl does not overwrite picker input after the user returns to the canonical URL", () => {
    const { widget, picker, inputState } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://typed.test/");
    picker.type("https://example.com/");
    inputState.url = "https://changed.test/";
    widget.refreshUrl();
    assert.strictEqual(picker.value, "https://example.com/");
  });
  test("refreshUrl synchronizes a picker opened by clicking without editing", () => {
    const { picker, display, inputState, widget } = makeHarness();
    display.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    display.focus();
    display.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    inputState.url = "https://changed.test/";
    widget.refreshUrl();
    assert.strictEqual(picker.value, "https://changed.test/");
  });
  test("refreshUrl preserves an edit promoted from the URL display", () => {
    const { picker, display, inputState, widget } = makeHarness();
    display.focus();
    display.textContent = "https://typed.test/";
    display.dispatchEvent(new Event("input", { bubbles: true }));
    inputState.url = "https://changed.test/";
    widget.refreshUrl();
    assert.strictEqual(picker.value, "https://typed.test/");
  });
  test("triggering a picker chrome button runs the action and releases focus on hide", () => {
    const harness = makeHarness();
    const { widget, picker } = harness;
    const runCalls = [];
    const action = {
      id: "bookmark-toggle",
      tooltip: "Toggle bookmark",
      iconClass: "icon",
      run(input) {
        runCalls.push(input);
      }
    };
    mountPickerActionProvider(widget, { getActions: () => [action] });
    widget.openUrlPicker();
    picker.triggerButton(action);
    picker.hide(QuickInputHideReason.Other);
    assert.deepStrictEqual(
      {
        runCount: runCalls.length,
        calledWithInput: runCalls[0] === asInput(harness.inputState),
        ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls()
      },
      { runCount: 1, calledWithInput: true, ensureBrowserFocusCalls: 1 }
    );
  });
  test("triggering a per-item button runs the action without dismissing the picker", async () => {
    const harness = makeHarness();
    const { widget, picker, inputState } = harness;
    const runCalls = [];
    const itemAction = {
      id: "delete-bookmark",
      tooltip: "Delete bookmark",
      iconClass: "icon",
      run(input) {
        runCalls.push(input);
      }
    };
    mountSuggestionProvider(widget, {
      async getSuggestions() {
        return [{
          id: "sugg-2",
          label: "Bookmark",
          apply() {
          },
          actions: [itemAction]
        }];
      }
    });
    widget.openUrlPicker();
    await waitForProviderRender();
    const suggestion = picker.items.find((i) => i.type !== "separator" && i.id === "sugg-2");
    picker.triggerItemButton(suggestion, itemAction);
    assert.deepStrictEqual(
      {
        runCount: runCalls.length,
        calledWithInput: runCalls[0] === asInput(inputState),
        pickerVisible: picker.visible
      },
      { runCount: 1, calledWithInput: true, pickerVisible: true }
    );
  });
  test("pressing Enter on the display navigates and preserves the typed text through the subsequent blur", () => {
    const harness = makeHarness();
    const { widget, display, navigated } = harness;
    widget.focusUrlInput();
    display.textContent = "https://typed-into-display.test/";
    display.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 13, key: "Enter", bubbles: true, cancelable: true }));
    display.blur();
    assert.deepStrictEqual(
      {
        navigated: [...navigated],
        display: display.textContent,
        ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls()
      },
      {
        navigated: ["https://typed-into-display.test/"],
        display: "https://typed-into-display.test/",
        ensureBrowserFocusCalls: 1
      }
    );
  });
  test("suggestion provider onDidChange reruns the load", async () => {
    const { widget, picker } = makeHarness();
    const refresh = new Emitter();
    store.add(refresh);
    let counter = 0;
    mountSuggestionProvider(widget, {
      onDidChange: refresh.event,
      async getSuggestions() {
        counter++;
        return [{
          id: `sugg-${counter}`,
          label: `Suggestion ${counter}`,
          apply() {
          }
        }];
      }
    });
    widget.openUrlPicker();
    await waitForProviderRender();
    assert.ok(picker.items.some((i) => i.type !== "separator" && i.id === "sugg-1"), "initial suggestion present");
    refresh.fire();
    await waitForProviderRender();
    assert.ok(picker.items.some((i) => i.type !== "separator" && i.id === "sugg-2"), "refreshed suggestion present");
  });
  test("coalesces provider results into one picker render", async () => {
    const { widget, picker } = makeHarness();
    mountSuggestionProvider(widget, {
      async getSuggestions() {
        return [{ id: "sugg-1", label: "Suggestion 1", apply() {
        } }];
      }
    });
    mountSuggestionProvider(widget, {
      async getSuggestions() {
        return [{ id: "sugg-2", label: "Suggestion 2", apply() {
        } }];
      }
    });
    widget.openUrlPicker();
    await waitForProviderRender();
    assert.deepStrictEqual(
      {
        itemsAssignmentCount: picker.itemsAssignmentCount,
        activeItemsAssignmentCount: picker.activeItemsAssignmentCount,
        itemIds: picker.items.filter((item) => item.type !== "separator").map((item) => item.id)
      },
      {
        itemsAssignmentCount: 2,
        activeItemsAssignmentCount: 1,
        itemIds: ["https://example.com/", "sugg-1", "sugg-2"]
      }
    );
  });
  test("typing immediately refreshes providers and cancels stale work", () => {
    const { widget, picker } = makeHarness();
    const calls = [];
    const complete = [];
    mountSuggestionProvider(widget, {
      getSuggestions({ text }, token) {
        calls.push({ text, cancelled: () => token.isCancellationRequested });
        return new Promise((resolve) => complete.push(() => resolve([])));
      }
    });
    widget.openUrlPicker();
    picker.type("https://example.test/");
    assert.deepStrictEqual(
      calls.map((call) => ({ text: call.text, cancelled: call.cancelled() })),
      [
        { text: "https://example.com/", cancelled: true },
        { text: "https://example.test/", cancelled: false }
      ]
    );
    complete.forEach((resolve) => resolve());
  });
  test("refreshes providers for each typed value", () => {
    const { widget, picker } = makeHarness();
    const values = [];
    mountSuggestionProvider(widget, {
      async getSuggestions({ text }) {
        values.push(text);
        return [];
      }
    });
    widget.openUrlPicker();
    picker.type("h");
    picker.type("ht");
    picker.type("https://example.test/");
    assert.deepStrictEqual(values, ["https://example.com/", "h", "ht", "https://example.test/"]);
  });
  test("streamed-in suggestions are never auto-focused; the default item stays active", async () => {
    const { widget, picker } = makeHarness();
    mountSuggestionProvider(widget, {
      async getSuggestions() {
        return [{ id: "tab-1", label: "A tab", apply() {
        } }];
      }
    });
    widget.openUrlPicker();
    picker.type("https://typed.test/");
    assert.strictEqual(picker.activeItems[0]?.id, "https://typed.test/");
    await waitForProviderRender();
    assert.ok(picker.items.some((i) => i.type !== "separator" && i.id === "tab-1"), "suggestion streamed in");
    assert.strictEqual(picker.activeItems[0]?.id, "https://typed.test/");
  });
  test("background refresh preserves the user selection but typing resets to the default", async () => {
    const { widget, picker } = makeHarness();
    const refresh = new Emitter();
    store.add(refresh);
    mountSuggestionProvider(widget, {
      onDidChange: refresh.event,
      async getSuggestions() {
        return [{ id: "tab-1", label: "A tab", apply() {
        } }];
      }
    });
    widget.openUrlPicker();
    picker.type("https://typed.test/");
    await waitForProviderRender();
    const suggestion = picker.items.find((i) => i.type !== "separator" && i.id === "tab-1");
    picker.activeItems = [suggestion];
    refresh.fire();
    await waitForProviderRender();
    assert.strictEqual(picker.activeItems[0]?.id, "tab-1", "background refresh preserves selection");
    picker.type("https://typed.test/x");
    assert.strictEqual(picker.activeItems[0]?.id, "https://typed.test/x", "typing resets to the default item");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFx0ZXN0XFxlbGVjdHJvbi1icm93c2VyXFx3aWRnZXRzXFxicm93c2VyVXJsQmFyV2lkZ2V0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IE51bGxIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci90ZXN0L2Jyb3dzZXIvbnVsbEhvdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQge1xuXHRJUXVpY2tJbnB1dCxcblx0SVF1aWNrSW5wdXRCdXR0b24sXG5cdElRdWlja0lucHV0U2VydmljZSxcblx0SVF1aWNrUGljayxcblx0SVF1aWNrUGlja0RpZEFjY2VwdEV2ZW50LFxuXHRJUXVpY2tQaWNrSXRlbSxcblx0SVF1aWNrUGlja0l0ZW1CdXR0b25FdmVudCxcblx0SVF1aWNrUGlja1NlcGFyYXRvcixcblx0SVF1aWNrUGlja1NlcGFyYXRvckJ1dHRvbkV2ZW50LFxuXHRRdWlja0lucHV0SGlkZVJlYXNvbixcbn0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uLCBJQnJvd3NlclVybFBpY2tlckFjdGlvblByb3ZpZGVyLCBJQnJvd3NlclVybFN1Z2dlc3Rpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2VsZWN0cm9uLWJyb3dzZXIvYnJvd3NlckVkaXRvci5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYnJvd3NlckVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEJyb3dzZXJVcmxCYXJXaWRnZXQsIElCcm93c2VyVXJsQmFySG9zdCB9IGZyb20gJy4uLy4uLy4uL2VsZWN0cm9uLWJyb3dzZXIvd2lkZ2V0cy9icm93c2VyVXJsQmFyV2lkZ2V0LmpzJztcblxuY2xhc3MgRmFrZVF1aWNrUGljazxUIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHBsYWNlaG9sZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGlnbm9yZUZvY3VzT3V0ID0gZmFsc2U7XG5cdHNvcnRCeUxhYmVsID0gdHJ1ZTtcblx0bWF0Y2hPbkRlc2NyaXB0aW9uID0gZmFsc2U7XG5cdGFuY2hvcjogSFRNTEVsZW1lbnQgfCB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdGFuY2hvclBvc2l0aW9uOiAnYWJvdmUnIHwgJ2JlbG93JyB8ICdvdmVybGF5JyB8IHVuZGVmaW5lZDtcblx0dmFsdWVTZWxlY3Rpb246IFJlYWRvbmx5PFtudW1iZXIsIG51bWJlcl0+IHwgdW5kZWZpbmVkO1xuXHRidXR0b25zOiBSZWFkb25seUFycmF5PElRdWlja0lucHV0QnV0dG9uPiA9IFtdO1xuXG5cdHByaXZhdGUgX3ZhbHVlID0gJyc7XG5cdHByaXZhdGUgX2l0ZW1zOiBSZWFkb25seUFycmF5PFQgfCBJUXVpY2tQaWNrU2VwYXJhdG9yPiA9IFtdO1xuXHRwcml2YXRlIF9hY3RpdmVJdGVtczogUmVhZG9ubHlBcnJheTxUPiA9IFtdO1xuXHRpdGVtc0Fzc2lnbm1lbnRDb3VudCA9IDA7XG5cdGFjdGl2ZUl0ZW1zQXNzaWdubWVudENvdW50ID0gMDtcblxuXHRnZXQgaXRlbXMoKTogUmVhZG9ubHlBcnJheTxUIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4ge1xuXHRcdHJldHVybiB0aGlzLl9pdGVtcztcblx0fVxuXG5cdHNldCBpdGVtcyhpdGVtczogUmVhZG9ubHlBcnJheTxUIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4pIHtcblx0XHR0aGlzLl9pdGVtcyA9IGl0ZW1zO1xuXHRcdHRoaXMuaXRlbXNBc3NpZ25tZW50Q291bnQrKztcblx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVJdGVtcyA9IGl0ZW1zLmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgVCA9PiBpdGVtLnR5cGUgIT09ICdzZXBhcmF0b3InKS5zbGljZSgwLCAxKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgYWN0aXZlSXRlbXMoKTogUmVhZG9ubHlBcnJheTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUl0ZW1zO1xuXHR9XG5cblx0c2V0IGFjdGl2ZUl0ZW1zKGFjdGl2ZUl0ZW1zOiBSZWFkb25seUFycmF5PFQ+KSB7XG5cdFx0dGhpcy5fYWN0aXZlSXRlbXMgPSBhY3RpdmVJdGVtcztcblx0XHR0aGlzLmFjdGl2ZUl0ZW1zQXNzaWdubWVudENvdW50Kys7XG5cdH1cblxuXHR2aXNpYmxlID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsSGlkZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhc29uOiBRdWlja0lucHV0SGlkZVJlYXNvbiB9PigpKTtcblx0cmVhZG9ubHkgb25XaWxsSGlkZSA9IHRoaXMuX29uV2lsbEhpZGUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmFsdWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZhbHVlID0gdGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUcmlnZ2VyQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVF1aWNrSW5wdXRCdXR0b24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFRyaWdnZXJCdXR0b24gPSB0aGlzLl9vbkRpZFRyaWdnZXJCdXR0b24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVHJpZ2dlckl0ZW1CdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tQaWNrSXRlbUJ1dHRvbkV2ZW50PFQ+PigpKTtcblx0cmVhZG9ubHkgb25EaWRUcmlnZ2VySXRlbUJ1dHRvbiA9IHRoaXMuX29uRGlkVHJpZ2dlckl0ZW1CdXR0b24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVHJpZ2dlclNlcGFyYXRvckJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElRdWlja1BpY2tTZXBhcmF0b3JCdXR0b25FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVHJpZ2dlclNlcGFyYXRvckJ1dHRvbiA9IHRoaXMuX29uRGlkVHJpZ2dlclNlcGFyYXRvckJ1dHRvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBY2NlcHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFjY2VwdCA9IHRoaXMuX29uRGlkQWNjZXB0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYXNvbjogUXVpY2tJbnB1dEhpZGVSZWFzb24gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSGlkZSA9IHRoaXMuX29uRGlkSGlkZS5ldmVudDtcblxuXHRnZXQgdmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsdWU7XG5cdH1cblxuXHRzZXQgdmFsdWUodmFsdWU6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl92YWx1ZSAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuX3ZhbHVlID0gdmFsdWU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZhbHVlLmZpcmUodmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHNob3coKTogdm9pZCB7IHRoaXMudmlzaWJsZSA9IHRydWU7IH1cblx0aGlkZShyZWFzb246IFF1aWNrSW5wdXRIaWRlUmVhc29uID0gUXVpY2tJbnB1dEhpZGVSZWFzb24uT3RoZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnZpc2libGUgPSBmYWxzZTtcblx0XHR0aGlzLl9vbldpbGxIaWRlLmZpcmUoeyByZWFzb24gfSk7XG5cdFx0dGhpcy5fb25EaWRIaWRlLmZpcmUoeyByZWFzb24gfSk7XG5cdH1cblxuXHR0eXBlKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHRhY2NlcHQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRBY2NlcHQuZmlyZSh7IGluQmFja2dyb3VuZDogZmFsc2UgfSk7XG5cdH1cblxuXHR0cmlnZ2VyQnV0dG9uKGJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFRyaWdnZXJCdXR0b24uZmlyZShidXR0b24pO1xuXHR9XG5cblx0dHJpZ2dlckl0ZW1CdXR0b24oaXRlbTogVCwgYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkVHJpZ2dlckl0ZW1CdXR0b24uZmlyZSh7IGl0ZW0sIGJ1dHRvbiB9KTtcblx0fVxuXG5cdHRyaWdnZXJTZXBhcmF0b3JCdXR0b24oc2VwYXJhdG9yOiBJUXVpY2tQaWNrU2VwYXJhdG9yLCBidXR0b246IElRdWlja0lucHV0QnV0dG9uKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRUcmlnZ2VyU2VwYXJhdG9yQnV0dG9uLmZpcmUoeyBzZXBhcmF0b3IsIGJ1dHRvbiB9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBhc1BpY2tlcjxUIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0+KGZha2U6IEZha2VRdWlja1BpY2s8VD4pOiBJUXVpY2tQaWNrPFQsIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiB7XG5cdHJldHVybiBmYWtlIGFzIHVua25vd24gYXMgSVF1aWNrUGljazxULCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT47XG59XG5cbmZ1bmN0aW9uIGFzSW5wdXQoc3RhdGU6IHsgdXJsOiBzdHJpbmc7IG5hdmlnYXRlKHVybDogc3RyaW5nKTogdm9pZCB9KTogQnJvd3NlckVkaXRvcklucHV0IHtcblx0cmV0dXJuIHN0YXRlIGFzIHVua25vd24gYXMgQnJvd3NlckVkaXRvcklucHV0O1xufVxuXG5zdWl0ZSgnQnJvd3NlclVybEJhcldpZGdldCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRpbnRlcmZhY2UgSVRlc3RIYXJuZXNzIHtcblx0XHRyZWFkb25seSB3aWRnZXQ6IEJyb3dzZXJVcmxCYXJXaWRnZXQ7XG5cdFx0cmVhZG9ubHkgcGlja2VyOiBGYWtlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPjtcblx0XHRyZWFkb25seSBkaXNwbGF5OiBIVE1MRWxlbWVudDtcblx0XHRyZWFkb25seSBpbnB1dFN0YXRlOiB7IHVybDogc3RyaW5nOyBuYXZpZ2F0ZSh1cmw6IHN0cmluZyk6IHZvaWQgfTtcblx0XHRyZWFkb25seSBuYXZpZ2F0ZWQ6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRcdHJlYWRvbmx5IGVuc3VyZUJyb3dzZXJGb2N1c0NhbGxzOiAoKSA9PiBudW1iZXI7XG5cdFx0LyoqIFNpbXVsYXRlIGFub3RoZXIgcGlja2VyIChlLmcuIGNvbW1hbmQgcGFsZXR0ZSkgdGFraW5nIG92ZXIuICovXG5cdFx0c2V0UmVwbGFjZWQoYWN0aXZlOiBib29sZWFuKTogdm9pZDtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VIYXJuZXNzKHJlYWRvbmx5ID0gZmFsc2UpOiBJVGVzdEhhcm5lc3Mge1xuXHRcdGNvbnN0IHBpY2tlciA9IG5ldyBGYWtlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPigpO1xuXHRcdC8vIEVuc3VyZSB0aGUgcGlja2VyIGhpZGVzIGJlZm9yZSB0aGUgd2lkZ2V0IGlzIGRpc3Bvc2VkIHNvIHRoZSB3aWRnZXQnc1xuXHRcdC8vIHBlci1waWNrZXIgRGlzcG9zYWJsZVN0b3JlIChyZWxlYXNlZCBpbiBvbkRpZEhpZGUpIGRvZXNuJ3QgbGVhay5cblx0XHRzdG9yZS5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAocGlja2VyLnZpc2libGUpIHtcblx0XHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBpY2tlci5kaXNwb3NlKCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0bGV0IHJlcGxhY2VtZW50QWN0aXZlID0gZmFsc2U7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2U6IFBhcnRpYWw8SVF1aWNrSW5wdXRTZXJ2aWNlPiA9IHtcblx0XHRcdGdldCBjdXJyZW50UXVpY2tJbnB1dCgpOiBJUXVpY2tJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGlmIChyZXBsYWNlbWVudEFjdGl2ZSkge1xuXHRcdFx0XHRcdHJldHVybiB7fSBhcyB1bmtub3duIGFzIElRdWlja0lucHV0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwaWNrZXIudmlzaWJsZSA/IGFzUGlja2VyKHBpY2tlcikgYXMgdW5rbm93biBhcyBJUXVpY2tJbnB1dCA6IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVRdWlja1BpY2s6ICgoLi4uX2FyZ3M6IHVua25vd25bXSkgPT4gYXNQaWNrZXIocGlja2VyKSkgYXMgSVF1aWNrSW5wdXRTZXJ2aWNlWydjcmVhdGVRdWlja1BpY2snXSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbmF2aWdhdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGlucHV0U3RhdGUgPSB7XG5cdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tLycsXG5cdFx0XHRuYXZpZ2F0ZSh1cmw6IHN0cmluZykgeyBuYXZpZ2F0ZWQucHVzaCh1cmwpOyB9LFxuXHRcdH07XG5cblx0XHRsZXQgZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IGhvc3Q6IElCcm93c2VyVXJsQmFySG9zdCA9IHtcblx0XHRcdGdldCBpbnB1dCgpIHsgcmV0dXJuIGFzSW5wdXQoaW5wdXRTdGF0ZSk7IH0sXG5cdFx0XHRpc1JlYWRvbmx5OiByZWFkb25seSxcblx0XHRcdGVuc3VyZUJyb3dzZXJGb2N1cygpIHsgZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHMrKzsgfSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElRdWlja0lucHV0U2VydmljZSwgcXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvdmVyU2VydmljZSwgTnVsbEhvdmVyU2VydmljZSk7XG5cblx0XHRjb25zdCB3aWRnZXQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJvd3NlclVybEJhcldpZGdldCwgaG9zdCkpO1xuXHRcdHdpZGdldC5tb3VudENvbnRyaWJ1dGlvbnMoW10pO1xuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3aWRnZXQuZWxlbWVudCk7XG5cdFx0c3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gd2lkZ2V0LmVsZW1lbnQucmVtb3ZlKCkgfSk7XG5cblx0XHRjb25zdCBkaXNwbGF5ID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmJyb3dzZXItdXJsLWRpc3BsYXknKSBhcyBIVE1MRWxlbWVudDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR3aWRnZXQsXG5cdFx0XHRwaWNrZXIsXG5cdFx0XHRkaXNwbGF5LFxuXHRcdFx0aW5wdXRTdGF0ZSxcblx0XHRcdG5hdmlnYXRlZCxcblx0XHRcdGVuc3VyZUJyb3dzZXJGb2N1c0NhbGxzOiAoKSA9PiBlbnN1cmVCcm93c2VyRm9jdXNDYWxscyxcblx0XHRcdHNldFJlcGxhY2VkOiAoYWN0aXZlOiBib29sZWFuKSA9PiB7IHJlcGxhY2VtZW50QWN0aXZlID0gYWN0aXZlOyB9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBtb3VudFN1Z2dlc3Rpb25Qcm92aWRlcih3aWRnZXQ6IEJyb3dzZXJVcmxCYXJXaWRnZXQsIHByb3ZpZGVyOiBJQnJvd3NlclVybFN1Z2dlc3Rpb25Qcm92aWRlcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHtcblx0XHRcdHdpZGdldHM6IFtdLFxuXHRcdFx0dXJsUmVuZGVyZXJzOiBbXSxcblx0XHRcdHVybFN1Z2dlc3Rpb25Qcm92aWRlcnM6IFtwcm92aWRlcl0sXG5cdFx0XHR1cmxQaWNrZXJBY3Rpb25Qcm92aWRlcnM6IFtdLFxuXHRcdH0gYXMgdW5rbm93biBhcyBCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uO1xuXHRcdHdpZGdldC5tb3VudENvbnRyaWJ1dGlvbnMoW2NvbnRyaWJ1dGlvbl0pO1xuXHR9XG5cblx0dGVzdCgncmVhZG9ubHkgVVJMIGJhciByZW1haW5zIGZvY3VzYWJsZSB3aXRob3V0IG9wZW5pbmcgdGhlIHBpY2tlcicsICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gbWFrZUhhcm5lc3ModHJ1ZSk7XG5cblx0XHRoYXJuZXNzLndpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0aGFybmVzcy5kaXNwbGF5LmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2ZvY3VzJywgeyByZWxhdGVkVGFyZ2V0OiBtYWluV2luZG93LmRvY3VtZW50LmJvZHkgfSkpO1xuXHRcdGhhcm5lc3MuZGlzcGxheS5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICdFbnRlcicsIGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhY3RpdmVFbGVtZW50OiBtYWluV2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGhhcm5lc3MuZGlzcGxheSxcblx0XHRcdGNvbnRlbnRFZGl0YWJsZTogaGFybmVzcy5kaXNwbGF5LmNvbnRlbnRFZGl0YWJsZSxcblx0XHRcdGFyaWFSZWFkb25seTogaGFybmVzcy5kaXNwbGF5LmdldEF0dHJpYnV0ZSgnYXJpYS1yZWFkb25seScpLFxuXHRcdFx0YXJpYUxhYmVsOiBoYXJuZXNzLmRpc3BsYXkuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHRwaWNrZXJWaXNpYmxlOiBoYXJuZXNzLnBpY2tlci52aXNpYmxlLFxuXHRcdFx0bmF2aWdhdGVkOiBoYXJuZXNzLm5hdmlnYXRlZFxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQ6IHRydWUsXG5cdFx0XHRjb250ZW50RWRpdGFibGU6ICdmYWxzZScsXG5cdFx0XHRhcmlhUmVhZG9ubHk6ICd0cnVlJyxcblx0XHRcdGFyaWFMYWJlbDogJ0FkZHJlc3MuIFRoaXMgYWRkcmVzcyBjYW5ub3QgYmUgY2hhbmdlZCBiZWNhdXNlIHRoZSBicm93c2VyIGlzIGxvY2tlZCB0byBhIGZpbGUgcmVzb3VyY2UuJyxcblx0XHRcdHBpY2tlclZpc2libGU6IGZhbHNlLFxuXHRcdFx0bmF2aWdhdGVkOiBbXVxuXHRcdH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBtb3VudFBpY2tlckFjdGlvblByb3ZpZGVyKHdpZGdldDogQnJvd3NlclVybEJhcldpZGdldCwgcHJvdmlkZXI6IElCcm93c2VyVXJsUGlja2VyQWN0aW9uUHJvdmlkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSB7XG5cdFx0XHR3aWRnZXRzOiBbXSxcblx0XHRcdHVybFJlbmRlcmVyczogW10sXG5cdFx0XHR1cmxTdWdnZXN0aW9uUHJvdmlkZXJzOiBbXSxcblx0XHRcdHVybFBpY2tlckFjdGlvblByb3ZpZGVyczogW3Byb3ZpZGVyXSxcblx0XHR9IGFzIHVua25vd24gYXMgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbjtcblx0XHR3aWRnZXQubW91bnRDb250cmlidXRpb25zKFtjb250cmlidXRpb25dKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JQcm92aWRlclJlbmRlcihkZWxheSA9IDApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZGVsYXkgPiAwKSB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXkpKTtcblx0XHR9XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBtYWluV2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiByZXNvbHZlKCkpKTtcblx0fVxuXG5cdHRlc3QoJ2luaXRpYWwgcmVuZGVyIHNob3dzIHRoZSBjYW5vbmljYWwgVVJMJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGlzcGxheSB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGxheS50ZXh0Q29udGVudCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hVcmwgdXBkYXRlcyB0aGUgZGlzcGxheSB3aGVuIHRoZSBpbnB1dCBVUkwgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgZGlzcGxheSwgaW5wdXRTdGF0ZSB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHRpbnB1dFN0YXRlLnVybCA9ICdodHRwczovL25ld3NpdGUudGVzdC9wYXRoJztcblx0XHR3aWRnZXQucmVmcmVzaFVybCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwbGF5LnRleHRDb250ZW50LCAnaHR0cHM6Ly9uZXdzaXRlLnRlc3QvcGF0aCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV2aWV3VXJsIHJlbmRlcnMgYW4gb3ZlcnJpZGUgVVJMIHdoaWxlIG5vdCBlZGl0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBkaXNwbGF5IH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5wcmV2aWV3VXJsKCdodHRwczovL3ByZXZpZXcudGVzdC8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGxheS50ZXh0Q29udGVudCwgJ2h0dHBzOi8vcHJldmlldy50ZXN0LycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV2aWV3VXJsIGlzIGEgbm8tb3Agd2hpbGUgdGhlIHBpY2tlciBpcyBvcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBkaXNwbGF5IH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0d2lkZ2V0LnByZXZpZXdVcmwoJ2h0dHBzOi8vc2hvdWxkLW5vdC1zaG93LnRlc3QvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3BsYXkudGV4dENvbnRlbnQsICdodHRwczovL2V4YW1wbGUuY29tLycpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVuVXJsUGlja2VyIHNob3dzIGEgcGlja2VyIHByZS1maWxsZWQgd2l0aCB0aGUgY2Fub25pY2FsIFVSTCcsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0dmlzaWJsZTogcGlja2VyLnZpc2libGUsXG5cdFx0XHRcdHZhbHVlOiBwaWNrZXIudmFsdWUsXG5cdFx0XHRcdHZhbHVlU2VsZWN0aW9uOiBwaWNrZXIudmFsdWVTZWxlY3Rpb24sXG5cdFx0XHRcdGFuY2hvclBvc2l0aW9uOiBwaWNrZXIuYW5jaG9yUG9zaXRpb24sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR2aXNpYmxlOiB0cnVlLFxuXHRcdFx0XHR2YWx1ZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyxcblx0XHRcdFx0dmFsdWVTZWxlY3Rpb246IFswLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLmxlbmd0aF0sXG5cdFx0XHRcdGFuY2hvclBvc2l0aW9uOiAnb3ZlcmxheScsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWNraW5nIHRoZSBhbHJlYWR5LWZvY3VzZWQgZGlzcGxheSBkb2VzIG5vdCBhdXRvLW9wZW4gdGhlIHBpY2tlcicsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBkaXNwbGF5IH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5mb2N1c1VybElucHV0KCk7XG5cdFx0ZGlzcGxheS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci52aXNpYmxlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IGNsaWNrIGFmdGVyIG1vdXNlIGZvY3VzIG9wZW5zIHRoZSBwaWNrZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwaWNrZXIsIGRpc3BsYXkgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0ZGlzcGxheS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgncG9pbnRlcmRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGRpc3BsYXkuZm9jdXMoKTtcblx0XHRkaXNwbGF5LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyLnZpc2libGUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRpbmcgdGhlIFwiR28gdG9cIiBpdGVtIG5hdmlnYXRlcyB0byB0aGUgdHlwZWQgdmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHBpY2tlciwgbmF2aWdhdGVkIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vdGFyZ2V0LnRlc3QvcGFnZScpO1xuXHRcdHBpY2tlci5hY3RpdmVJdGVtcyA9IFtwaWNrZXIuaXRlbXMuZmluZCgoaSk6IGkgaXMgSVF1aWNrUGlja0l0ZW0gPT4gaS50eXBlICE9PSAnc2VwYXJhdG9yJykhXTtcblx0XHRwaWNrZXIuYWNjZXB0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuYXZpZ2F0ZWQsIFsnaHR0cHM6Ly90YXJnZXQudGVzdC9wYWdlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRpbmcgYSBjb250cmlidXRlZCBzdWdnZXN0aW9uIGNhbGxzIGl0cyBhcHBseSB3aXRoIHRoZSBpbnB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gbWFrZUhhcm5lc3MoKTtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBpbnB1dFN0YXRlIH0gPSBoYXJuZXNzO1xuXHRcdGNvbnN0IGFwcGx5Q2FsbHM6IEJyb3dzZXJFZGl0b3JJbnB1dFtdID0gW107XG5cdFx0bW91bnRTdWdnZXN0aW9uUHJvdmlkZXIod2lkZ2V0LCB7XG5cdFx0XHRhc3luYyBnZXRTdWdnZXN0aW9ucygpIHtcblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0aWQ6ICdzdWdnLTEnLFxuXHRcdFx0XHRcdGxhYmVsOiAnU3VnZ2VzdGlvbicsXG5cdFx0XHRcdFx0YXBwbHkoaW5wdXQpIHsgYXBwbHlDYWxscy5wdXNoKGlucHV0KTsgfSxcblx0XHRcdFx0fV07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRhd2FpdCB3YWl0Rm9yUHJvdmlkZXJSZW5kZXIoKTtcblx0XHRjb25zdCBzdWdnZXN0aW9uID0gcGlja2VyLml0ZW1zLmZpbmQoKGkpOiBpIGlzIElRdWlja1BpY2tJdGVtID0+IGkudHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgaS5pZCA9PT0gJ3N1Z2ctMScpO1xuXHRcdGFzc2VydC5vayhzdWdnZXN0aW9uLCAnc3VnZ2VzdGlvbiBpdGVtIHNob3VsZCBiZSBwcmVzZW50Jyk7XG5cdFx0cGlja2VyLmFjdGl2ZUl0ZW1zID0gW3N1Z2dlc3Rpb25dO1xuXHRcdHBpY2tlci5hY2NlcHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbHlDYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBseUNhbGxzWzBdLCBhc0lucHV0KGlucHV0U3RhdGUpKTtcblx0fSk7XG5cblx0dGVzdCgnaGlkaW5nIGFmdGVyIGFuIGFjY2VwdCByZXZlcnRzIHRvIGNhbm9uaWNhbCBhbmQgcmVsZWFzZXMgZm9jdXMgdG8gdGhlIHBhZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFybmVzcyA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHBpY2tlciwgZGlzcGxheSB9ID0gaGFybmVzcztcblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdHBpY2tlci50eXBlKCdodHRwczovL3R5cGVkLnRlc3QvJyk7XG5cdFx0cGlja2VyLmFjY2VwdCgpOyAvLyBvbkRpZEFjY2VwdCBoYW5kbGVyIGNhbGxzIHBpY2tlci5oaWRlKCkgc3luY2hyb25vdXNseVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGRpc3BsYXk6IGRpc3BsYXkudGV4dENvbnRlbnQsXG5cdFx0XHRcdHZpc2libGU6IHBpY2tlci52aXNpYmxlLFxuXHRcdFx0XHRlbnN1cmVCcm93c2VyRm9jdXNDYWxsczogaGFybmVzcy5lbnN1cmVCcm93c2VyRm9jdXNDYWxscygpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0ZGlzcGxheTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyxcblx0XHRcdFx0dmlzaWJsZTogZmFsc2UsXG5cdFx0XHRcdGVuc3VyZUJyb3dzZXJGb2N1c0NhbGxzOiAxLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRpbmcgb24gQmx1ciByZXZlcnRzIHRvIGNhbm9uaWNhbCB3aXRob3V0IHJlbGVhc2luZyBmb2N1cyB0byB0aGUgcGFnZScsICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gbWFrZUhhcm5lc3MoKTtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBkaXNwbGF5IH0gPSBoYXJuZXNzO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vYWJhbmRvbmVkLnRlc3QvJyk7XG5cdFx0cGlja2VyLmhpZGUoUXVpY2tJbnB1dEhpZGVSZWFzb24uQmx1cik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0ZGlzcGxheTogZGlzcGxheS50ZXh0Q29udGVudCxcblx0XHRcdFx0dmlzaWJsZTogcGlja2VyLnZpc2libGUsXG5cdFx0XHRcdGVuc3VyZUJyb3dzZXJGb2N1c0NhbGxzOiBoYXJuZXNzLmVuc3VyZUJyb3dzZXJGb2N1c0NhbGxzKCksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRkaXNwbGF5OiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHR2aXNpYmxlOiBmYWxzZSxcblx0XHRcdFx0ZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHM6IDAsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyIGhpZGVzIHRoZSBwaWNrZXIgYW5kIHJldmVydHMgdGhlIGRpc3BsYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHBpY2tlciwgZGlzcGxheSB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdHBpY2tlci50eXBlKCdodHRwczovL3dpcC50ZXN0LycpO1xuXHRcdHdpZGdldC5jbGVhcigpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGRpc3BsYXk6IGRpc3BsYXkudGV4dENvbnRlbnQsIHZpc2libGU6IHBpY2tlci52aXNpYmxlIH0sXG5cdFx0XHR7IGRpc3BsYXk6ICdodHRwczovL2V4YW1wbGUuY29tLycsIHZpc2libGU6IGZhbHNlIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndHlwaW5nIGluIHRoZSBwaWNrZXIgbWlycm9ycyBpbnRvIHRoZSBkaXNwbGF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIsIGRpc3BsYXkgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRwaWNrZXIudHlwZSgnaHR0cHM6Ly90eXBpbmcudGVzdC8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGxheS50ZXh0Q29udGVudCwgJ2h0dHBzOi8vdHlwaW5nLnRlc3QvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc21pc3NhbCB3aXRob3V0IGFjdGlvbiByZWZvY3VzZXMgdGhlIGRpc3BsYXkgYW5kIHByZXNlcnZlcyB0aGUgdHlwZWQgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gbWFrZUhhcm5lc3MoKTtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBkaXNwbGF5IH0gPSBoYXJuZXNzO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vaW4tcHJvZ3Jlc3MudGVzdC8nKTtcblx0XHRwaWNrZXIuaGlkZShRdWlja0lucHV0SGlkZVJlYXNvbi5PdGhlcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0ZGlzcGxheTogZGlzcGxheS50ZXh0Q29udGVudCxcblx0XHRcdFx0YWN0aXZlOiBkaXNwbGF5Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gZGlzcGxheSxcblx0XHRcdFx0ZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHM6IGhhcm5lc3MuZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHMoKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGRpc3BsYXk6ICdodHRwczovL2luLXByb2dyZXNzLnRlc3QvJyxcblx0XHRcdFx0YWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRlbnN1cmVCcm93c2VyRm9jdXNDYWxsczogMCxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYSByZXBsYWNlZCBwaWNrZXIgcmV2ZXJ0cyB0aGUgZGlzcGxheSBhbmQgc3VwcHJlc3NlcyB0aGUgbmV4dCBmb2N1cy1vcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIsIGRpc3BsYXksIHNldFJlcGxhY2VkIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vYWJhbmRvbmVkLnRlc3QvJyk7XG5cdFx0c2V0UmVwbGFjZWQodHJ1ZSk7XG5cdFx0cGlja2VyLmhpZGUoUXVpY2tJbnB1dEhpZGVSZWFzb24uT3RoZXIpO1xuXHRcdC8vIERpc3BsYXkgaGFzIHJldmVydGVkIHRvIGNhbm9uaWNhbDsgcmVmb2N1c2luZyB0aGUgZGlzcGxheSAod2hpY2ggaXNcblx0XHQvLyB3aGF0IHRoZSBRdWlja0lucHV0Q29udHJvbGxlciBkb2VzIG9uIHRoZSByZXBsYWNlbWVudCdzIGhpZGUpIG11c3Rcblx0XHQvLyBOT1QgcmVvcGVuIHRoZSBwaWNrZXIgdGhhbmtzIHRvIHRoZSBhcm1lZCBzdXBwcmVzcyBmbGFnLlxuXHRcdGRpc3BsYXkuZm9jdXMoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBkaXNwbGF5OiBkaXNwbGF5LnRleHRDb250ZW50LCBwaWNrZXJWaXNpYmxlOiBwaWNrZXIudmlzaWJsZSB9LFxuXHRcdFx0eyBkaXNwbGF5OiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLCBwaWNrZXJWaXNpYmxlOiBmYWxzZSB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdCB3aXRoIG5vIGFjdGl2ZSBpdGVtIG5hdmlnYXRlcyB0byB0aGUgcGlja2VyIHZhbHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIsIG5hdmlnYXRlZCB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdHBpY2tlci50eXBlKCdodHRwczovL2ZhbGxiYWNrLnRlc3QvJyk7XG5cdFx0cGlja2VyLmFjdGl2ZUl0ZW1zID0gW107XG5cdFx0cGlja2VyLmFjY2VwdCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmF2aWdhdGVkLCBbJ2h0dHBzOi8vZmFsbGJhY2sudGVzdC8nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hVcmwga2VlcHMgYW4gdW5lZGl0ZWQgcGlja2VyIHN5bmNocm9uaXplZCB3aXRoIHRoZSBjYW5vbmljYWwgVVJMJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIsIGlucHV0U3RhdGUgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRpbnB1dFN0YXRlLnVybCA9ICdodHRwczovL2NoYW5nZWQudGVzdC8nO1xuXHRcdHdpZGdldC5yZWZyZXNoVXJsKCk7XG5cdFx0aW5wdXRTdGF0ZS51cmwgPSAnaHR0cHM6Ly9jaGFuZ2VkLWFnYWluLnRlc3QvJztcblx0XHR3aWRnZXQucmVmcmVzaFVybCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIudmFsdWUsICdodHRwczovL2NoYW5nZWQtYWdhaW4udGVzdC8nKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaFVybCBkb2VzIG5vdCBvdmVyd3JpdGUgcGlja2VyIGlucHV0IGFmdGVyIHRoZSB1c2VyIHR5cGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIsIGlucHV0U3RhdGUgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRwaWNrZXIudHlwZSgnaHR0cHM6Ly90eXBlZC50ZXN0LycpO1xuXHRcdGlucHV0U3RhdGUudXJsID0gJ2h0dHBzOi8vY2hhbmdlZC50ZXN0Lyc7XG5cdFx0d2lkZ2V0LnJlZnJlc2hVcmwoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyLnZhbHVlLCAnaHR0cHM6Ly90eXBlZC50ZXN0LycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoVXJsIGRvZXMgbm90IG92ZXJ3cml0ZSBwaWNrZXIgaW5wdXQgYWZ0ZXIgdGhlIHVzZXIgcmV0dXJucyB0byB0aGUgY2Fub25pY2FsIFVSTCcsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBpbnB1dFN0YXRlIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vdHlwZWQudGVzdC8nKTtcblx0XHRwaWNrZXIudHlwZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS8nKTtcblx0XHRpbnB1dFN0YXRlLnVybCA9ICdodHRwczovL2NoYW5nZWQudGVzdC8nO1xuXHRcdHdpZGdldC5yZWZyZXNoVXJsKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci52YWx1ZSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hVcmwgc3luY2hyb25pemVzIGEgcGlja2VyIG9wZW5lZCBieSBjbGlja2luZyB3aXRob3V0IGVkaXRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwaWNrZXIsIGRpc3BsYXksIGlucHV0U3RhdGUsIHdpZGdldCB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHRkaXNwbGF5LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0ZGlzcGxheS5mb2N1cygpO1xuXHRcdGRpc3BsYXkuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGlucHV0U3RhdGUudXJsID0gJ2h0dHBzOi8vY2hhbmdlZC50ZXN0Lyc7XG5cdFx0d2lkZ2V0LnJlZnJlc2hVcmwoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyLnZhbHVlLCAnaHR0cHM6Ly9jaGFuZ2VkLnRlc3QvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hVcmwgcHJlc2VydmVzIGFuIGVkaXQgcHJvbW90ZWQgZnJvbSB0aGUgVVJMIGRpc3BsYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwaWNrZXIsIGRpc3BsYXksIGlucHV0U3RhdGUsIHdpZGdldCB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHRkaXNwbGF5LmZvY3VzKCk7XG5cdFx0ZGlzcGxheS50ZXh0Q29udGVudCA9ICdodHRwczovL3R5cGVkLnRlc3QvJztcblx0XHRkaXNwbGF5LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0aW5wdXRTdGF0ZS51cmwgPSAnaHR0cHM6Ly9jaGFuZ2VkLnRlc3QvJztcblx0XHR3aWRnZXQucmVmcmVzaFVybCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIudmFsdWUsICdodHRwczovL3R5cGVkLnRlc3QvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaWdnZXJpbmcgYSBwaWNrZXIgY2hyb21lIGJ1dHRvbiBydW5zIHRoZSBhY3Rpb24gYW5kIHJlbGVhc2VzIGZvY3VzIG9uIGhpZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFybmVzcyA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHBpY2tlciB9ID0gaGFybmVzcztcblx0XHRjb25zdCBydW5DYWxsczogQnJvd3NlckVkaXRvcklucHV0W10gPSBbXTtcblx0XHRjb25zdCBhY3Rpb246IElRdWlja0lucHV0QnV0dG9uICYgeyBpZDogc3RyaW5nOyBydW4oaW5wdXQ6IEJyb3dzZXJFZGl0b3JJbnB1dCk6IHZvaWQgfSA9IHtcblx0XHRcdGlkOiAnYm9va21hcmstdG9nZ2xlJyxcblx0XHRcdHRvb2x0aXA6ICdUb2dnbGUgYm9va21hcmsnLFxuXHRcdFx0aWNvbkNsYXNzOiAnaWNvbicsXG5cdFx0XHRydW4oaW5wdXQpIHsgcnVuQ2FsbHMucHVzaChpbnB1dCk7IH0sXG5cdFx0fTtcblx0XHRtb3VudFBpY2tlckFjdGlvblByb3ZpZGVyKHdpZGdldCwgeyBnZXRBY3Rpb25zOiAoKSA9PiBbYWN0aW9uXSB9KTtcblxuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnRyaWdnZXJCdXR0b24oYWN0aW9uKTtcblx0XHRwaWNrZXIuaGlkZShRdWlja0lucHV0SGlkZVJlYXNvbi5PdGhlcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0cnVuQ291bnQ6IHJ1bkNhbGxzLmxlbmd0aCxcblx0XHRcdFx0Y2FsbGVkV2l0aElucHV0OiBydW5DYWxsc1swXSA9PT0gYXNJbnB1dChoYXJuZXNzLmlucHV0U3RhdGUpLFxuXHRcdFx0XHRlbnN1cmVCcm93c2VyRm9jdXNDYWxsczogaGFybmVzcy5lbnN1cmVCcm93c2VyRm9jdXNDYWxscygpLFxuXHRcdFx0fSxcblx0XHRcdHsgcnVuQ291bnQ6IDEsIGNhbGxlZFdpdGhJbnB1dDogdHJ1ZSwgZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHM6IDEgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmlnZ2VyaW5nIGEgcGVyLWl0ZW0gYnV0dG9uIHJ1bnMgdGhlIGFjdGlvbiB3aXRob3V0IGRpc21pc3NpbmcgdGhlIHBpY2tlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gbWFrZUhhcm5lc3MoKTtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBpbnB1dFN0YXRlIH0gPSBoYXJuZXNzO1xuXHRcdGNvbnN0IHJ1bkNhbGxzOiBCcm93c2VyRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdGNvbnN0IGl0ZW1BY3Rpb24gPSB7XG5cdFx0XHRpZDogJ2RlbGV0ZS1ib29rbWFyaycsXG5cdFx0XHR0b29sdGlwOiAnRGVsZXRlIGJvb2ttYXJrJyxcblx0XHRcdGljb25DbGFzczogJ2ljb24nLFxuXHRcdFx0cnVuKGlucHV0OiBCcm93c2VyRWRpdG9ySW5wdXQpIHsgcnVuQ2FsbHMucHVzaChpbnB1dCk7IH0sXG5cdFx0fTtcblx0XHRtb3VudFN1Z2dlc3Rpb25Qcm92aWRlcih3aWRnZXQsIHtcblx0XHRcdGFzeW5jIGdldFN1Z2dlc3Rpb25zKCkge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRpZDogJ3N1Z2ctMicsXG5cdFx0XHRcdFx0bGFiZWw6ICdCb29rbWFyaycsXG5cdFx0XHRcdFx0YXBwbHkoKSB7IH0sXG5cdFx0XHRcdFx0YWN0aW9uczogW2l0ZW1BY3Rpb25dLFxuXHRcdFx0XHR9XTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRhd2FpdCB3YWl0Rm9yUHJvdmlkZXJSZW5kZXIoKTtcblx0XHRjb25zdCBzdWdnZXN0aW9uID0gcGlja2VyLml0ZW1zLmZpbmQoKGkpOiBpIGlzIElRdWlja1BpY2tJdGVtID0+IGkudHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgaS5pZCA9PT0gJ3N1Z2ctMicpITtcblx0XHRwaWNrZXIudHJpZ2dlckl0ZW1CdXR0b24oc3VnZ2VzdGlvbiwgaXRlbUFjdGlvbik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0cnVuQ291bnQ6IHJ1bkNhbGxzLmxlbmd0aCxcblx0XHRcdFx0Y2FsbGVkV2l0aElucHV0OiBydW5DYWxsc1swXSA9PT0gYXNJbnB1dChpbnB1dFN0YXRlKSxcblx0XHRcdFx0cGlja2VyVmlzaWJsZTogcGlja2VyLnZpc2libGUsXG5cdFx0XHR9LFxuXHRcdFx0eyBydW5Db3VudDogMSwgY2FsbGVkV2l0aElucHV0OiB0cnVlLCBwaWNrZXJWaXNpYmxlOiB0cnVlIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc3NpbmcgRW50ZXIgb24gdGhlIGRpc3BsYXkgbmF2aWdhdGVzIGFuZCBwcmVzZXJ2ZXMgdGhlIHR5cGVkIHRleHQgdGhyb3VnaCB0aGUgc3Vic2VxdWVudCBibHVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhcm5lc3MgPSBtYWtlSGFybmVzcygpO1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBkaXNwbGF5LCBuYXZpZ2F0ZWQgfSA9IGhhcm5lc3M7XG5cdFx0d2lkZ2V0LmZvY3VzVXJsSW5wdXQoKTtcblx0XHRkaXNwbGF5LnRleHRDb250ZW50ID0gJ2h0dHBzOi8vdHlwZWQtaW50by1kaXNwbGF5LnRlc3QvJztcblx0XHQvLyBgU3RhbmRhcmRLZXlib2FyZEV2ZW50YCByZWFkcyB0aGUgKGRlcHJlY2F0ZWQpIG51bWVyaWMgYGtleUNvZGVgLFxuXHRcdC8vIHNvIHBhc3MgaXQgZXhwbGljaXRseSAoRW50ZXIgPT0gMTMpIHJhdGhlciB0aGFuIHJlbHlpbmcgb24gYGtleWAuXG5cdFx0ZGlzcGxheS5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXlDb2RlOiAxMywga2V5OiAnRW50ZXInLCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0gYXMgS2V5Ym9hcmRFdmVudEluaXQpKTtcblx0XHRkaXNwbGF5LmJsdXIoKTtcblx0XHQvLyBgbW9kZWwudXJsYCAoY2Fub25pY2FsKSBoYXNuJ3QgY2F1Z2h0IHVwIHRvIHRoZSB0eXBlZCBVUkwgeWV0LCBidXRcblx0XHQvLyB0aGUgQkxVUi1yZXZlcnQgc2hvdWxkIGJlIHN1cHByZXNzZWQgZm9yIGFuIEVudGVyLWNvbW1pdCBzbyB0aGVcblx0XHQvLyBkZXN0aW5hdGlvbiBzdGF5cyB2aXNpYmxlIHVudGlsIHRoZSBuYXZpZ2F0aW9uIGNvbW1pdHMuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0bmF2aWdhdGVkOiBbLi4ubmF2aWdhdGVkXSxcblx0XHRcdFx0ZGlzcGxheTogZGlzcGxheS50ZXh0Q29udGVudCxcblx0XHRcdFx0ZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHM6IGhhcm5lc3MuZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHMoKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hdmlnYXRlZDogWydodHRwczovL3R5cGVkLWludG8tZGlzcGxheS50ZXN0LyddLFxuXHRcdFx0XHRkaXNwbGF5OiAnaHR0cHM6Ly90eXBlZC1pbnRvLWRpc3BsYXkudGVzdC8nLFxuXHRcdFx0XHRlbnN1cmVCcm93c2VyRm9jdXNDYWxsczogMSxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3VnZ2VzdGlvbiBwcm92aWRlciBvbkRpZENoYW5nZSByZXJ1bnMgdGhlIGxvYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHBpY2tlciB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHRjb25zdCByZWZyZXNoID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRzdG9yZS5hZGQocmVmcmVzaCk7XG5cdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdG1vdW50U3VnZ2VzdGlvblByb3ZpZGVyKHdpZGdldCwge1xuXHRcdFx0b25EaWRDaGFuZ2U6IHJlZnJlc2guZXZlbnQsXG5cdFx0XHRhc3luYyBnZXRTdWdnZXN0aW9ucygpIHtcblx0XHRcdFx0Y291bnRlcisrO1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRpZDogYHN1Z2ctJHtjb3VudGVyfWAsXG5cdFx0XHRcdFx0bGFiZWw6IGBTdWdnZXN0aW9uICR7Y291bnRlcn1gLFxuXHRcdFx0XHRcdGFwcGx5KCkgeyB9LFxuXHRcdFx0XHR9XTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdGF3YWl0IHdhaXRGb3JQcm92aWRlclJlbmRlcigpO1xuXHRcdGFzc2VydC5vayhwaWNrZXIuaXRlbXMuc29tZShpID0+IGkudHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgaS5pZCA9PT0gJ3N1Z2ctMScpLCAnaW5pdGlhbCBzdWdnZXN0aW9uIHByZXNlbnQnKTtcblxuXHRcdHJlZnJlc2guZmlyZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JQcm92aWRlclJlbmRlcigpO1xuXHRcdGFzc2VydC5vayhwaWNrZXIuaXRlbXMuc29tZShpID0+IGkudHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgaS5pZCA9PT0gJ3N1Z2ctMicpLCAncmVmcmVzaGVkIHN1Z2dlc3Rpb24gcHJlc2VudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2FsZXNjZXMgcHJvdmlkZXIgcmVzdWx0cyBpbnRvIG9uZSBwaWNrZXIgcmVuZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0bW91bnRTdWdnZXN0aW9uUHJvdmlkZXIod2lkZ2V0LCB7XG5cdFx0XHRhc3luYyBnZXRTdWdnZXN0aW9ucygpIHtcblx0XHRcdFx0cmV0dXJuIFt7IGlkOiAnc3VnZy0xJywgbGFiZWw6ICdTdWdnZXN0aW9uIDEnLCBhcHBseSgpIHsgfSB9XTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0bW91bnRTdWdnZXN0aW9uUHJvdmlkZXIod2lkZ2V0LCB7XG5cdFx0XHRhc3luYyBnZXRTdWdnZXN0aW9ucygpIHtcblx0XHRcdFx0cmV0dXJuIFt7IGlkOiAnc3VnZy0yJywgbGFiZWw6ICdTdWdnZXN0aW9uIDInLCBhcHBseSgpIHsgfSB9XTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdGF3YWl0IHdhaXRGb3JQcm92aWRlclJlbmRlcigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0aXRlbXNBc3NpZ25tZW50Q291bnQ6IHBpY2tlci5pdGVtc0Fzc2lnbm1lbnRDb3VudCxcblx0XHRcdFx0YWN0aXZlSXRlbXNBc3NpZ25tZW50Q291bnQ6IHBpY2tlci5hY3RpdmVJdGVtc0Fzc2lnbm1lbnRDb3VudCxcblx0XHRcdFx0aXRlbUlkczogcGlja2VyLml0ZW1zLmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgSVF1aWNrUGlja0l0ZW0gPT4gaXRlbS50eXBlICE9PSAnc2VwYXJhdG9yJykubWFwKGl0ZW0gPT4gaXRlbS5pZCksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpdGVtc0Fzc2lnbm1lbnRDb3VudDogMixcblx0XHRcdFx0YWN0aXZlSXRlbXNBc3NpZ25tZW50Q291bnQ6IDEsXG5cdFx0XHRcdGl0ZW1JZHM6IFsnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLCAnc3VnZy0xJywgJ3N1Z2ctMiddLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0eXBpbmcgaW1tZWRpYXRlbHkgcmVmcmVzaGVzIHByb3ZpZGVycyBhbmQgY2FuY2VscyBzdGFsZSB3b3JrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0Y29uc3QgY2FsbHM6IHsgdGV4dDogc3RyaW5nOyBjYW5jZWxsZWQ6ICgpID0+IGJvb2xlYW4gfVtdID0gW107XG5cdFx0Y29uc3QgY29tcGxldGU6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cdFx0bW91bnRTdWdnZXN0aW9uUHJvdmlkZXIod2lkZ2V0LCB7XG5cdFx0XHRnZXRTdWdnZXN0aW9ucyh7IHRleHQgfSwgdG9rZW4pIHtcblx0XHRcdFx0Y2FsbHMucHVzaCh7IHRleHQsIGNhbmNlbGxlZDogKCkgPT4gdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfSk7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IGNvbXBsZXRlLnB1c2goKCkgPT4gcmVzb2x2ZShbXSkpKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdHBpY2tlci50eXBlKCdodHRwczovL2V4YW1wbGUudGVzdC8nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjYWxscy5tYXAoY2FsbCA9PiAoeyB0ZXh0OiBjYWxsLnRleHQsIGNhbmNlbGxlZDogY2FsbC5jYW5jZWxsZWQoKSB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgdGV4dDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vJywgY2FuY2VsbGVkOiB0cnVlIH0sXG5cdFx0XHRcdHsgdGV4dDogJ2h0dHBzOi8vZXhhbXBsZS50ZXN0LycsIGNhbmNlbGxlZDogZmFsc2UgfSxcblx0XHRcdF0sXG5cdFx0KTtcblx0XHRjb21wbGV0ZS5mb3JFYWNoKHJlc29sdmUgPT4gcmVzb2x2ZSgpKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaGVzIHByb3ZpZGVycyBmb3IgZWFjaCB0eXBlZCB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdGNvbnN0IHZhbHVlczogc3RyaW5nW10gPSBbXTtcblx0XHRtb3VudFN1Z2dlc3Rpb25Qcm92aWRlcih3aWRnZXQsIHtcblx0XHRcdGFzeW5jIGdldFN1Z2dlc3Rpb25zKHsgdGV4dCB9KSB7XG5cdFx0XHRcdHZhbHVlcy5wdXNoKHRleHQpO1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRwaWNrZXIudHlwZSgnaCcpO1xuXHRcdHBpY2tlci50eXBlKCdodCcpO1xuXHRcdHBpY2tlci50eXBlKCdodHRwczovL2V4YW1wbGUudGVzdC8nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWVzLCBbJ2h0dHBzOi8vZXhhbXBsZS5jb20vJywgJ2gnLCAnaHQnLCAnaHR0cHM6Ly9leGFtcGxlLnRlc3QvJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJlYW1lZC1pbiBzdWdnZXN0aW9ucyBhcmUgbmV2ZXIgYXV0by1mb2N1c2VkOyB0aGUgZGVmYXVsdCBpdGVtIHN0YXlzIGFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdG1vdW50U3VnZ2VzdGlvblByb3ZpZGVyKHdpZGdldCwge1xuXHRcdFx0YXN5bmMgZ2V0U3VnZ2VzdGlvbnMoKSB7XG5cdFx0XHRcdHJldHVybiBbeyBpZDogJ3RhYi0xJywgbGFiZWw6ICdBIHRhYicsIGFwcGx5KCkgeyB9IH1dO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vdHlwZWQudGVzdC8nKTtcblx0XHQvLyBUaGUgc3luY2hyb25vdXMgZGVmYXVsdCBpdGVtIChcIkdvIHRvIDx2YWx1ZT5cIikgaXMgdGhlIGFjdGl2ZSBpdGVtLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuYWN0aXZlSXRlbXNbMF0/LmlkLCAnaHR0cHM6Ly90eXBlZC50ZXN0LycpO1xuXG5cdFx0Ly8gT25jZSB0aGUgYXN5bmNocm9ub3VzIHN1Z2dlc3Rpb24gc3RyZWFtcyBpbiwgZm9jdXMgbXVzdCBOT1QganVtcCB0byBpdC5cblx0XHRhd2FpdCB3YWl0Rm9yUHJvdmlkZXJSZW5kZXIoKTtcblx0XHRhc3NlcnQub2socGlja2VyLml0ZW1zLnNvbWUoaSA9PiBpLnR5cGUgIT09ICdzZXBhcmF0b3InICYmIGkuaWQgPT09ICd0YWItMScpLCAnc3VnZ2VzdGlvbiBzdHJlYW1lZCBpbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuYWN0aXZlSXRlbXNbMF0/LmlkLCAnaHR0cHM6Ly90eXBlZC50ZXN0LycpO1xuXHR9KTtcblxuXHR0ZXN0KCdiYWNrZ3JvdW5kIHJlZnJlc2ggcHJlc2VydmVzIHRoZSB1c2VyIHNlbGVjdGlvbiBidXQgdHlwaW5nIHJlc2V0cyB0byB0aGUgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdGNvbnN0IHJlZnJlc2ggPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdHN0b3JlLmFkZChyZWZyZXNoKTtcblx0XHRtb3VudFN1Z2dlc3Rpb25Qcm92aWRlcih3aWRnZXQsIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiByZWZyZXNoLmV2ZW50LFxuXHRcdFx0YXN5bmMgZ2V0U3VnZ2VzdGlvbnMoKSB7XG5cdFx0XHRcdHJldHVybiBbeyBpZDogJ3RhYi0xJywgbGFiZWw6ICdBIHRhYicsIGFwcGx5KCkgeyB9IH1dO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vdHlwZWQudGVzdC8nKTtcblx0XHRhd2FpdCB3YWl0Rm9yUHJvdmlkZXJSZW5kZXIoKTtcblxuXHRcdC8vIFVzZXIgYXJyb3cta2V5cyBvbnRvIHRoZSBzdHJlYW1lZC1pbiBzdWdnZXN0aW9uLlxuXHRcdGNvbnN0IHN1Z2dlc3Rpb24gPSBwaWNrZXIuaXRlbXMuZmluZCgoaSk6IGkgaXMgSVF1aWNrUGlja0l0ZW0gPT4gaS50eXBlICE9PSAnc2VwYXJhdG9yJyAmJiBpLmlkID09PSAndGFiLTEnKSE7XG5cdFx0cGlja2VyLmFjdGl2ZUl0ZW1zID0gW3N1Z2dlc3Rpb25dO1xuXG5cdFx0Ly8gQSBiYWNrZ3JvdW5kIHByb3ZpZGVyIHJlZnJlc2ggbXVzdCBrZWVwIHRoZSB1c2VyJ3Mgc2VsZWN0aW9uLlxuXHRcdHJlZnJlc2guZmlyZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JQcm92aWRlclJlbmRlcigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuYWN0aXZlSXRlbXNbMF0/LmlkLCAndGFiLTEnLCAnYmFja2dyb3VuZCByZWZyZXNoIHByZXNlcnZlcyBzZWxlY3Rpb24nKTtcblxuXHRcdC8vIFR5cGluZywgaG93ZXZlciwgcmVzZXRzIGZvY3VzIGJhY2sgdG8gdGhlIGRlZmF1bHQgXCJHbyB0b1wiIGl0ZW0uXG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vdHlwZWQudGVzdC94Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci5hY3RpdmVJdGVtc1swXT8uaWQsICdodHRwczovL3R5cGVkLnRlc3QveCcsICd0eXBpbmcgcmVzZXRzIHRvIHRoZSBkZWZhdWx0IGl0ZW0nKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQ0FBZ0M7QUFDekM7QUFBQSxFQUdDO0FBQUEsRUFPQTtBQUFBLE9BQ007QUFHUCxTQUFTLDJCQUErQztBQUV4RCxNQUFNLHNCQUFnRCxXQUFXO0FBQUEsRUFBakU7QUFBQTtBQUVDLDBCQUFpQjtBQUNqQix1QkFBYztBQUNkLDhCQUFxQjtBQUlyQixtQkFBNEMsQ0FBQztBQUU3QyxTQUFRLFNBQVM7QUFDakIsU0FBUSxTQUFpRCxDQUFDO0FBQzFELFNBQVEsZUFBaUMsQ0FBQztBQUMxQyxnQ0FBdUI7QUFDdkIsc0NBQTZCO0FBdUI3QixtQkFBVTtBQUVWLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksUUFBMEMsQ0FBQztBQUM3RixTQUFTLGFBQWEsS0FBSyxZQUFZO0FBQ3ZDLFNBQWlCLG9CQUFvQixLQUFLLFVBQVUsSUFBSSxRQUFnQixDQUFDO0FBQ3pFLFNBQVMsbUJBQW1CLEtBQUssa0JBQWtCO0FBQ25ELFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxRQUEyQixDQUFDO0FBQ3RGLFNBQVMscUJBQXFCLEtBQUssb0JBQW9CO0FBQ3ZELFNBQWlCLDBCQUEwQixLQUFLLFVBQVUsSUFB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
