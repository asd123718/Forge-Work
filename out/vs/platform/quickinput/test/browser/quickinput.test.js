import assert from "assert";
import sinon from "sinon";
import { unthemedInboxStyles } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { unthemedButtonStyles } from "../../../../base/browser/ui/button/button.js";
import { unthemedListStyles } from "../../../../base/browser/ui/list/listWidget.js";
import { unthemedToggleStyles } from "../../../../base/browser/ui/toggle/toggle.js";
import { Event } from "../../../../base/common/event.js";
import { raceTimeout } from "../../../../base/common/async.js";
import { unthemedCountStyles } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { unthemedKeybindingLabelOptions } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { unthemedProgressBarOptions } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { QuickInputController } from "../../browser/quickInputController.js";
import { TestThemeService } from "../../../theme/test/common/testThemeService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { ItemActivation, isKeyModified, NO_KEY_MODS } from "../../common/quickInput.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { IThemeService } from "../../../theme/common/themeService.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { ILayoutService } from "../../../layout/browser/layoutService.js";
import { IContextViewService } from "../../../contextview/browser/contextView.js";
import { IListService, ListService } from "../../../list/browser/listService.js";
import { IContextKeyService } from "../../../contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../contextkey/browser/contextKeyService.js";
import { NoMatchingKb } from "../../../keybinding/common/keybindingResolver.js";
import { IKeybindingService } from "../../../keybinding/common/keybinding.js";
import { ContextViewService } from "../../../contextview/browser/contextViewService.js";
import { IAccessibilityService } from "../../../accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../accessibility/test/common/testAccessibilityService.js";
async function setupWaitTilShownListener(controller) {
  const result = await raceTimeout(new Promise((resolve) => {
    const event = controller.onShow((_) => {
      event.dispose();
      resolve(true);
    });
  }), 2e3);
  if (!result) {
    throw new Error("Cancelled");
  }
}
suite("QuickInput", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let controller;
  let fixture;
  setup(() => {
    fixture = document.createElement("div");
    mainWindow.document.body.appendChild(fixture);
    store.add(toDisposable(() => fixture.remove()));
    const instantiationService = new TestInstantiationService();
    instantiationService.stub(IThemeService, new TestThemeService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
    instantiationService.stub(IListService, store.add(new ListService()));
    instantiationService.stub(ILayoutService, {
      _serviceBrand: void 0,
      activeContainer: fixture,
      onDidLayoutContainer: Event.None,
      getContainer: () => fixture
    });
    instantiationService.stub(IContextViewService, store.add(instantiationService.createInstance(ContextViewService)));
    instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
    instantiationService.stub(IKeybindingService, {
      mightProducePrintableCharacter() {
        return false;
      },
      softDispatch() {
        return NoMatchingKb;
      }
    });
    controller = store.add(instantiationService.createInstance(
      QuickInputController,
      {
        container: fixture,
        idPrefix: "testQuickInput",
        ignoreFocusOut() {
          return true;
        },
        returnFocus() {
        },
        backKeybindingLabel() {
          return void 0;
        },
        setContextKey() {
          return void 0;
        },
        linkOpenerDelegate(content) {
        },
        hoverDelegate: {
          showHover(options, focus) {
            return void 0;
          },
          delay: 200
        },
        styles: {
          button: unthemedButtonStyles,
          countBadge: unthemedCountStyles,
          inputBox: unthemedInboxStyles,
          toggle: unthemedToggleStyles,
          keybindingLabel: unthemedKeybindingLabelOptions,
          list: unthemedListStyles,
          progressBar: unthemedProgressBarOptions,
          widget: {
            quickInputBackground: void 0,
            quickInputForeground: void 0,
            quickInputTitleBackground: void 0,
            widgetBorder: void 0,
            widgetShadow: void 0
          },
          pickerGroup: {
            pickerGroupBorder: void 0,
            pickerGroupForeground: void 0
          }
        }
      }
    ));
    controller.layout({ height: 20, width: 40 }, 0);
  });
  teardown(() => {
    sinon.restore();
  });
  test("close motion requires modern UI with motion enabled", () => {
    const clock = sinon.useFakeTimers();
    const quickpick = store.add(controller.createQuickPick());
    const widget = fixture.querySelector(".quick-input-widget");
    const states = [];
    const recordState = () => states.push({
      display: widget.style.display,
      closing: widget.classList.contains("quick-input-widget-closing"),
      inert: widget.inert,
      visible: controller.isVisible()
    });
    fixture.classList.add("style-override", "monaco-reduce-motion");
    quickpick.show();
    quickpick.hide();
    recordState();
    fixture.classList.replace("monaco-reduce-motion", "monaco-enable-motion");
    quickpick.show();
    quickpick.hide();
    recordState();
    quickpick.show();
    recordState();
    quickpick.hide();
    clock.tick(150);
    recordState();
    assert.deepStrictEqual(states, [
      { display: "none", closing: false, inert: false, visible: false },
      { display: "", closing: true, inert: true, visible: false },
      { display: "", closing: false, inert: false, visible: true },
      { display: "none", closing: false, inert: false, visible: false }
    ]);
  });
  test("overlay picker aligns its input with the anchor and bypasses motion", () => {
    fixture.style.width = "600px";
    fixture.style.height = "400px";
    fixture.classList.add("style-override", "monaco-enable-motion");
    controller.layout({ width: 600, height: 400 }, 0);
    const anchor = document.createElement("div");
    anchor.style.position = "absolute";
    anchor.style.left = "80px";
    anchor.style.top = "40px";
    anchor.style.width = "300px";
    anchor.style.height = "26px";
    fixture.appendChild(anchor);
    const quickpick = store.add(controller.createQuickPick());
    quickpick.anchor = anchor;
    quickpick.anchorPosition = "overlay";
    quickpick.show();
    const widget = fixture.querySelector(".quick-input-widget");
    const input = fixture.querySelector(".quick-input-filter .monaco-inputbox");
    const anchorRect = anchor.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const openState = {
      alignmentDelta: {
        left: inputRect.left - anchorRect.left,
        top: inputRect.top - anchorRect.top,
        width: inputRect.width - anchorRect.width,
        height: inputRect.height - anchorRect.height
      },
      animationName: mainWindow.getComputedStyle(widget).animationName,
      overlay: widget.classList.contains("quick-input-widget-overlay")
    };
    quickpick.hide();
    assert.deepStrictEqual({
      openState,
      closeState: {
        display: widget.style.display,
        closing: widget.classList.contains("quick-input-widget-closing"),
        inert: widget.inert
      }
    }, {
      openState: {
        alignmentDelta: { left: 0, top: 0, width: 0, height: 0 },
        animationName: "none",
        overlay: true
      },
      closeState: {
        display: "none",
        closing: false,
        inert: false
      }
    });
  });
  test("pick - basecase", async () => {
    const item = { label: "foo" };
    const wait = setupWaitTilShownListener(controller);
    const pickPromise = controller.pick([item, { label: "bar" }]);
    await wait;
    controller.accept();
    const pick = await raceTimeout(pickPromise, 2e3);
    assert.strictEqual(pick, item);
  });
  test("pick - activeItem is honored", async () => {
    const item = { label: "foo" };
    const wait = setupWaitTilShownListener(controller);
    const pickPromise = controller.pick([{ label: "bar" }, item], { activeItem: item });
    await wait;
    controller.accept();
    const pick = await pickPromise;
    assert.strictEqual(pick, item);
  });
  test("input - basecase", async () => {
    const wait = setupWaitTilShownListener(controller);
    const inputPromise = controller.input({ value: "foo" });
    await wait;
    controller.accept();
    const value = await raceTimeout(inputPromise, 2e3);
    assert.strictEqual(value, "foo");
  });
  test("onDidChangeValue - gets triggered when .value is set", async () => {
    const quickpick = store.add(controller.createQuickPick());
    let value = void 0;
    store.add(quickpick.onDidChangeValue((e) => value = e));
    quickpick.value = "changed";
    try {
      assert.strictEqual(value, quickpick.value);
    } finally {
      quickpick.dispose();
    }
  });
  test("keepScrollPosition - works with activeItems", async () => {
    const quickpick = store.add(controller.createQuickPick());
    const items = [];
    for (let i = 0; i < 1e3; i++) {
      items.push({ label: `item ${i}` });
    }
    quickpick.items = items;
    quickpick.activeItems = [items[items.length - 1]];
    quickpick.show();
    const cursorTop = quickpick.scrollTop;
    assert.notStrictEqual(cursorTop, 0);
    quickpick.keepScrollPosition = true;
    quickpick.activeItems = [items[0]];
    assert.strictEqual(cursorTop, quickpick.scrollTop);
    quickpick.keepScrollPosition = false;
    quickpick.activeItems = [items[0]];
    assert.strictEqual(quickpick.scrollTop, 0);
  });
  test("keepScrollPosition - works with items", async () => {
    const quickpick = store.add(controller.createQuickPick());
    const items = [];
    for (let i = 0; i < 1e3; i++) {
      items.push({ label: `item ${i}` });
    }
    quickpick.items = items;
    quickpick.activeItems = [items[items.length - 1]];
    quickpick.show();
    const cursorTop = quickpick.scrollTop;
    assert.notStrictEqual(cursorTop, 0);
    quickpick.keepScrollPosition = true;
    quickpick.items = items;
    assert.strictEqual(cursorTop, quickpick.scrollTop);
    quickpick.keepScrollPosition = false;
    quickpick.items = items;
    assert.strictEqual(quickpick.scrollTop, 0);
  });
  test("selectedItems - verify previous selectedItems does not hang over to next set of items", async () => {
    const quickpick = store.add(controller.createQuickPick());
    quickpick.items = [{ label: "step 1" }];
    quickpick.show();
    void await new Promise((resolve) => {
      store.add(quickpick.onDidAccept(() => {
        quickpick.canSelectMany = true;
        quickpick.items = [{ label: "a" }, { label: "b" }, { label: "c" }];
        resolve();
      }));
      controller.accept();
    });
    controller.accept();
    assert.strictEqual(quickpick.selectedItems.length, 0);
  });
  test("activeItems - verify onDidChangeActive is triggered after setting items", async () => {
    const quickpick = store.add(controller.createQuickPick());
    const activeItemsFromEvent = [];
    store.add(quickpick.onDidChangeActive((items) => activeItemsFromEvent.push(...items)));
    quickpick.show();
    const item = { label: "step 1" };
    quickpick.items = [item];
    assert.strictEqual(activeItemsFromEvent.length, 1);
    assert.strictEqual(activeItemsFromEvent[0], item);
    assert.strictEqual(quickpick.activeItems.length, 1);
    assert.strictEqual(quickpick.activeItems[0], item);
  });
  test("activeItems - verify setting itemActivation to None still triggers onDidChangeActive after selection #207832", async () => {
    const quickpick = store.add(controller.createQuickPick());
    const item = { label: "step 1" };
    quickpick.items = [item];
    quickpick.show();
    assert.strictEqual(quickpick.activeItems[0], item);
    const activeItemsFromEvent = [];
    store.add(quickpick.onDidChangeActive((items) => activeItemsFromEvent.push(...items)));
    quickpick.itemActivation = ItemActivation.NONE;
    quickpick.items = [item];
    assert.strictEqual(activeItemsFromEvent.length, 0);
    assert.strictEqual(quickpick.activeItems.length, 0);
  });
  test("isKeyModified - returns false when no modifiers are pressed", () => {
    assert.strictEqual(isKeyModified(NO_KEY_MODS), false);
    assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: false, shift: false }), false);
  });
  test("isKeyModified - returns true when any modifier is pressed", () => {
    assert.strictEqual(isKeyModified({ ctrlCmd: true, alt: false, shift: false }), true);
    assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: true, shift: false }), true);
    assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: false, shift: true }), true);
    assert.strictEqual(isKeyModified({ ctrlCmd: true, alt: true, shift: true }), true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccXVpY2tpbnB1dFxcdGVzdFxcYnJvd3NlclxccXVpY2tpbnB1dC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IHVudGhlbWVkSW5ib3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgdW50aGVtZWRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyB1bnRoZW1lZExpc3RTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IHVudGhlbWVkVG9nZ2xlU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHVudGhlbWVkQ291bnRTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY291bnRCYWRnZS9jb3VudEJhZGdlLmpzJztcbmltcG9ydCB7IHVudGhlbWVkS2V5YmluZGluZ0xhYmVsT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IHVudGhlbWVkUHJvZ3Jlc3NCYXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Byb2dyZXNzYmFyL3Byb2dyZXNzYmFyLmpzJztcbmltcG9ydCB7IFF1aWNrSW5wdXRDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9xdWlja0lucHV0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBRdWlja1BpY2sgfSBmcm9tICcuLi8uLi9icm93c2VyL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVF1aWNrUGlja0l0ZW0sIEl0ZW1BY3RpdmF0aW9uLCBpc0tleU1vZGlmaWVkLCBOT19LRVlfTU9EUyB9IGZyb20gJy4uLy4uL2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb01hdGNoaW5nS2IgfSBmcm9tICcuLi8uLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvdGVzdC9jb21tb24vdGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLmpzJztcblxuLy8gU2V0cyB1cCBhbiBgb25TaG93YCBsaXN0ZW5lciB0byBhbGxvdyB1cyB0byB3YWl0IHVudGlsIHRoZSBxdWljayBwaWNrIGlzIHNob3duICh1c2VmdWwgd2hlbiB0cmlnZ2VyaW5nIGFuIGBhY2NlcHQoKWAgcmlnaHQgYWZ0ZXIgbGF1bmNoaW5nIGEgcXVpY2sgcGljaylcbi8vIGtpY2sgdGhpcyBvZmYgYmVmb3JlIHlvdSBsYXVuY2ggdGhlIHBpY2tlciBhbmQgdGhlbiBhd2FpdCB0aGUgcHJvbWlzZSByZXR1cm5lZCBhZnRlciB5b3UgbGF1bmNoIHRoZSBwaWNrZXIuXG5hc3luYyBmdW5jdGlvbiBzZXR1cFdhaXRUaWxTaG93bkxpc3RlbmVyKGNvbnRyb2xsZXI6IFF1aWNrSW5wdXRDb250cm9sbGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJhY2VUaW1lb3V0KG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4ge1xuXHRcdGNvbnN0IGV2ZW50ID0gY29udHJvbGxlci5vblNob3coXyA9PiB7XG5cdFx0XHRldmVudC5kaXNwb3NlKCk7XG5cdFx0XHRyZXNvbHZlKHRydWUpO1xuXHRcdH0pO1xuXHR9KSwgMjAwMCk7XG5cblx0aWYgKCFyZXN1bHQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhbmNlbGxlZCcpO1xuXHR9XG59XG5cbnN1aXRlKCdRdWlja0lucHV0JywgKCkgPT4geyAvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTQ3NTQzXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBjb250cm9sbGVyOiBRdWlja0lucHV0Q29udHJvbGxlcjtcblx0bGV0IGZpeHR1cmU6IEhUTUxFbGVtZW50O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRmaXh0dXJlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGZpeHR1cmUpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZml4dHVyZS5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cblx0XHQvLyBTdHViIHRoZSBzZXJ2aWNlcyB0aGUgcXVpY2sgaW5wdXQgY29udHJvbGxlciBuZWVkcyB0byBmdW5jdGlvblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRoZW1lU2VydmljZSwgbmV3IFRlc3RUaGVtZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIG5ldyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGlzdFNlcnZpY2UsIHN0b3JlLmFkZChuZXcgTGlzdFNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxheW91dFNlcnZpY2UsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGFjdGl2ZUNvbnRhaW5lcjogZml4dHVyZSxcblx0XHRcdG9uRGlkTGF5b3V0Q29udGFpbmVyOiBFdmVudC5Ob25lLFxuXHRcdFx0Z2V0Q29udGFpbmVyOiAoKSA9PiBmaXh0dXJlLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRWaWV3U2VydmljZSwgc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbnRleHRWaWV3U2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbnRleHRLZXlTZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUtleWJpbmRpbmdTZXJ2aWNlLCB7XG5cdFx0XHRtaWdodFByb2R1Y2VQcmludGFibGVDaGFyYWN0ZXIoKSB7IHJldHVybiBmYWxzZTsgfSxcblx0XHRcdHNvZnREaXNwYXRjaCgpIHsgcmV0dXJuIE5vTWF0Y2hpbmdLYjsgfSxcblx0XHR9KTtcblxuXHRcdGNvbnRyb2xsZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRRdWlja0lucHV0Q29udHJvbGxlcixcblx0XHRcdHtcblx0XHRcdFx0Y29udGFpbmVyOiBmaXh0dXJlLFxuXHRcdFx0XHRpZFByZWZpeDogJ3Rlc3RRdWlja0lucHV0Jyxcblx0XHRcdFx0aWdub3JlRm9jdXNPdXQoKSB7IHJldHVybiB0cnVlOyB9LFxuXHRcdFx0XHRyZXR1cm5Gb2N1cygpIHsgfSxcblx0XHRcdFx0YmFja0tleWJpbmRpbmdMYWJlbCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfSxcblx0XHRcdFx0c2V0Q29udGV4dEtleSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfSxcblx0XHRcdFx0bGlua09wZW5lckRlbGVnYXRlKGNvbnRlbnQpIHsgfSxcblx0XHRcdFx0aG92ZXJEZWxlZ2F0ZToge1xuXHRcdFx0XHRcdHNob3dIb3ZlcihvcHRpb25zLCBmb2N1cykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlbGF5OiAyMDBcblx0XHRcdFx0fSxcblx0XHRcdFx0c3R5bGVzOiB7XG5cdFx0XHRcdFx0YnV0dG9uOiB1bnRoZW1lZEJ1dHRvblN0eWxlcyxcblx0XHRcdFx0XHRjb3VudEJhZGdlOiB1bnRoZW1lZENvdW50U3R5bGVzLFxuXHRcdFx0XHRcdGlucHV0Qm94OiB1bnRoZW1lZEluYm94U3R5bGVzLFxuXHRcdFx0XHRcdHRvZ2dsZTogdW50aGVtZWRUb2dnbGVTdHlsZXMsXG5cdFx0XHRcdFx0a2V5YmluZGluZ0xhYmVsOiB1bnRoZW1lZEtleWJpbmRpbmdMYWJlbE9wdGlvbnMsXG5cdFx0XHRcdFx0bGlzdDogdW50aGVtZWRMaXN0U3R5bGVzLFxuXHRcdFx0XHRcdHByb2dyZXNzQmFyOiB1bnRoZW1lZFByb2dyZXNzQmFyT3B0aW9ucyxcblx0XHRcdFx0XHR3aWRnZXQ6IHtcblx0XHRcdFx0XHRcdHF1aWNrSW5wdXRCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRxdWlja0lucHV0Rm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cXVpY2tJbnB1dFRpdGxlQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0d2lkZ2V0Qm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR3aWRnZXRTaGFkb3c6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHBpY2tlckdyb3VwOiB7XG5cdFx0XHRcdFx0XHRwaWNrZXJHcm91cEJvcmRlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cGlja2VyR3JvdXBGb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHQvLyBpbml0aWFsIGxheW91dFxuXHRcdGNvbnRyb2xsZXIubGF5b3V0KHsgaGVpZ2h0OiAyMCwgd2lkdGg6IDQwIH0sIDApO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZSBtb3Rpb24gcmVxdWlyZXMgbW9kZXJuIFVJIHdpdGggbW90aW9uIGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKCk7XG5cdFx0Y29uc3QgcXVpY2twaWNrID0gc3RvcmUuYWRkKGNvbnRyb2xsZXIuY3JlYXRlUXVpY2tQaWNrKCkpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGZpeHR1cmUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5xdWljay1pbnB1dC13aWRnZXQnKSE7XG5cdFx0Y29uc3Qgc3RhdGVzOiB7IGRpc3BsYXk6IHN0cmluZzsgY2xvc2luZzogYm9vbGVhbjsgaW5lcnQ6IGJvb2xlYW47IHZpc2libGU6IGJvb2xlYW4gfVtdID0gW107XG5cdFx0Y29uc3QgcmVjb3JkU3RhdGUgPSAoKSA9PiBzdGF0ZXMucHVzaCh7XG5cdFx0XHRkaXNwbGF5OiB3aWRnZXQuc3R5bGUuZGlzcGxheSxcblx0XHRcdGNsb3Npbmc6IHdpZGdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3F1aWNrLWlucHV0LXdpZGdldC1jbG9zaW5nJyksXG5cdFx0XHRpbmVydDogd2lkZ2V0LmluZXJ0LFxuXHRcdFx0dmlzaWJsZTogY29udHJvbGxlci5pc1Zpc2libGUoKSxcblx0XHR9KTtcblxuXHRcdGZpeHR1cmUuY2xhc3NMaXN0LmFkZCgnc3R5bGUtb3ZlcnJpZGUnLCAnbW9uYWNvLXJlZHVjZS1tb3Rpb24nKTtcblx0XHRxdWlja3BpY2suc2hvdygpO1xuXHRcdHF1aWNrcGljay5oaWRlKCk7XG5cdFx0cmVjb3JkU3RhdGUoKTtcblxuXHRcdGZpeHR1cmUuY2xhc3NMaXN0LnJlcGxhY2UoJ21vbmFjby1yZWR1Y2UtbW90aW9uJywgJ21vbmFjby1lbmFibGUtbW90aW9uJyk7XG5cdFx0cXVpY2twaWNrLnNob3coKTtcblx0XHRxdWlja3BpY2suaGlkZSgpO1xuXHRcdHJlY29yZFN0YXRlKCk7XG5cblx0XHRxdWlja3BpY2suc2hvdygpO1xuXHRcdHJlY29yZFN0YXRlKCk7XG5cblx0XHRxdWlja3BpY2suaGlkZSgpO1xuXHRcdGNsb2NrLnRpY2soMTUwKTtcblx0XHRyZWNvcmRTdGF0ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZXMsIFtcblx0XHRcdHsgZGlzcGxheTogJ25vbmUnLCBjbG9zaW5nOiBmYWxzZSwgaW5lcnQ6IGZhbHNlLCB2aXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0eyBkaXNwbGF5OiAnJywgY2xvc2luZzogdHJ1ZSwgaW5lcnQ6IHRydWUsIHZpc2libGU6IGZhbHNlIH0sXG5cdFx0XHR7IGRpc3BsYXk6ICcnLCBjbG9zaW5nOiBmYWxzZSwgaW5lcnQ6IGZhbHNlLCB2aXNpYmxlOiB0cnVlIH0sXG5cdFx0XHR7IGRpc3BsYXk6ICdub25lJywgY2xvc2luZzogZmFsc2UsIGluZXJ0OiBmYWxzZSwgdmlzaWJsZTogZmFsc2UgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnb3ZlcmxheSBwaWNrZXIgYWxpZ25zIGl0cyBpbnB1dCB3aXRoIHRoZSBhbmNob3IgYW5kIGJ5cGFzc2VzIG1vdGlvbicsICgpID0+IHtcblx0XHRmaXh0dXJlLnN0eWxlLndpZHRoID0gJzYwMHB4Jztcblx0XHRmaXh0dXJlLnN0eWxlLmhlaWdodCA9ICc0MDBweCc7XG5cdFx0Zml4dHVyZS5jbGFzc0xpc3QuYWRkKCdzdHlsZS1vdmVycmlkZScsICdtb25hY28tZW5hYmxlLW1vdGlvbicpO1xuXHRcdGNvbnRyb2xsZXIubGF5b3V0KHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiA0MDAgfSwgMCk7XG5cblx0XHRjb25zdCBhbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRhbmNob3Iuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGFuY2hvci5zdHlsZS5sZWZ0ID0gJzgwcHgnO1xuXHRcdGFuY2hvci5zdHlsZS50b3AgPSAnNDBweCc7XG5cdFx0YW5jaG9yLnN0eWxlLndpZHRoID0gJzMwMHB4Jztcblx0XHRhbmNob3Iuc3R5bGUuaGVpZ2h0ID0gJzI2cHgnO1xuXHRcdGZpeHR1cmUuYXBwZW5kQ2hpbGQoYW5jaG9yKTtcblxuXHRcdGNvbnN0IHF1aWNrcGljayA9IHN0b3JlLmFkZChjb250cm9sbGVyLmNyZWF0ZVF1aWNrUGljaygpKTtcblx0XHRxdWlja3BpY2suYW5jaG9yID0gYW5jaG9yO1xuXHRcdHF1aWNrcGljay5hbmNob3JQb3NpdGlvbiA9ICdvdmVybGF5Jztcblx0XHRxdWlja3BpY2suc2hvdygpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gZml4dHVyZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnF1aWNrLWlucHV0LXdpZGdldCcpITtcblx0XHRjb25zdCBpbnB1dCA9IGZpeHR1cmUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5xdWljay1pbnB1dC1maWx0ZXIgLm1vbmFjby1pbnB1dGJveCcpITtcblx0XHRjb25zdCBhbmNob3JSZWN0ID0gYW5jaG9yLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IGlucHV0UmVjdCA9IGlucHV0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IG9wZW5TdGF0ZSA9IHtcblx0XHRcdGFsaWdubWVudERlbHRhOiB7XG5cdFx0XHRcdGxlZnQ6IGlucHV0UmVjdC5sZWZ0IC0gYW5jaG9yUmVjdC5sZWZ0LFxuXHRcdFx0XHR0b3A6IGlucHV0UmVjdC50b3AgLSBhbmNob3JSZWN0LnRvcCxcblx0XHRcdFx0d2lkdGg6IGlucHV0UmVjdC53aWR0aCAtIGFuY2hvclJlY3Qud2lkdGgsXG5cdFx0XHRcdGhlaWdodDogaW5wdXRSZWN0LmhlaWdodCAtIGFuY2hvclJlY3QuaGVpZ2h0LFxuXHRcdFx0fSxcblx0XHRcdGFuaW1hdGlvbk5hbWU6IG1haW5XaW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSh3aWRnZXQpLmFuaW1hdGlvbk5hbWUsXG5cdFx0XHRvdmVybGF5OiB3aWRnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdxdWljay1pbnB1dC13aWRnZXQtb3ZlcmxheScpLFxuXHRcdH07XG5cblx0XHRxdWlja3BpY2suaGlkZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcGVuU3RhdGUsXG5cdFx0XHRjbG9zZVN0YXRlOiB7XG5cdFx0XHRcdGRpc3BsYXk6IHdpZGdldC5zdHlsZS5kaXNwbGF5LFxuXHRcdFx0XHRjbG9zaW5nOiB3aWRnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdxdWljay1pbnB1dC13aWRnZXQtY2xvc2luZycpLFxuXHRcdFx0XHRpbmVydDogd2lkZ2V0LmluZXJ0LFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRvcGVuU3RhdGU6IHtcblx0XHRcdFx0YWxpZ25tZW50RGVsdGE6IHsgbGVmdDogMCwgdG9wOiAwLCB3aWR0aDogMCwgaGVpZ2h0OiAwIH0sXG5cdFx0XHRcdGFuaW1hdGlvbk5hbWU6ICdub25lJyxcblx0XHRcdFx0b3ZlcmxheTogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRjbG9zZVN0YXRlOiB7XG5cdFx0XHRcdGRpc3BsYXk6ICdub25lJyxcblx0XHRcdFx0Y2xvc2luZzogZmFsc2UsXG5cdFx0XHRcdGluZXJ0OiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BpY2sgLSBiYXNlY2FzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpdGVtID0geyBsYWJlbDogJ2ZvbycgfTtcblxuXHRcdGNvbnN0IHdhaXQgPSBzZXR1cFdhaXRUaWxTaG93bkxpc3RlbmVyKGNvbnRyb2xsZXIpO1xuXHRcdGNvbnN0IHBpY2tQcm9taXNlID0gY29udHJvbGxlci5waWNrKFtpdGVtLCB7IGxhYmVsOiAnYmFyJyB9XSk7XG5cdFx0YXdhaXQgd2FpdDtcblxuXHRcdGNvbnRyb2xsZXIuYWNjZXB0KCk7XG5cdFx0Y29uc3QgcGljayA9IGF3YWl0IHJhY2VUaW1lb3V0KHBpY2tQcm9taXNlLCAyMDAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrLCBpdGVtKTtcblx0fSk7XG5cblx0dGVzdCgncGljayAtIGFjdGl2ZUl0ZW0gaXMgaG9ub3JlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpdGVtID0geyBsYWJlbDogJ2ZvbycgfTtcblxuXHRcdGNvbnN0IHdhaXQgPSBzZXR1cFdhaXRUaWxTaG93bkxpc3RlbmVyKGNvbnRyb2xsZXIpO1xuXHRcdGNvbnN0IHBpY2tQcm9taXNlID0gY29udHJvbGxlci5waWNrKFt7IGxhYmVsOiAnYmFyJyB9LCBpdGVtXSwgeyBhY3RpdmVJdGVtOiBpdGVtIH0pO1xuXHRcdGF3YWl0IHdhaXQ7XG5cblx0XHRjb250cm9sbGVyLmFjY2VwdCgpO1xuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBwaWNrUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrLCBpdGVtKTtcblx0fSk7XG5cblx0dGVzdCgnaW5wdXQgLSBiYXNlY2FzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3YWl0ID0gc2V0dXBXYWl0VGlsU2hvd25MaXN0ZW5lcihjb250cm9sbGVyKTtcblx0XHRjb25zdCBpbnB1dFByb21pc2UgPSBjb250cm9sbGVyLmlucHV0KHsgdmFsdWU6ICdmb28nIH0pO1xuXHRcdGF3YWl0IHdhaXQ7XG5cblx0XHRjb250cm9sbGVyLmFjY2VwdCgpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgcmFjZVRpbWVvdXQoaW5wdXRQcm9taXNlLCAyMDAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgJ2ZvbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZVZhbHVlIC0gZ2V0cyB0cmlnZ2VyZWQgd2hlbiAudmFsdWUgaXMgc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHF1aWNrcGljayA9IHN0b3JlLmFkZChjb250cm9sbGVyLmNyZWF0ZVF1aWNrUGljaygpKTtcblxuXHRcdGxldCB2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHN0b3JlLmFkZChxdWlja3BpY2sub25EaWRDaGFuZ2VWYWx1ZSgoZSkgPT4gdmFsdWUgPSBlKSk7XG5cblx0XHQvLyBUcmlnZ2VyIGEgY2hhbmdlXG5cdFx0cXVpY2twaWNrLnZhbHVlID0gJ2NoYW5nZWQnO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgcXVpY2twaWNrLnZhbHVlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cXVpY2twaWNrLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBTY3JvbGxQb3NpdGlvbiAtIHdvcmtzIHdpdGggYWN0aXZlSXRlbXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcXVpY2twaWNrID0gc3RvcmUuYWRkKGNvbnRyb2xsZXIuY3JlYXRlUXVpY2tQaWNrKCkgYXMgUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPik7XG5cblx0XHRjb25zdCBpdGVtcyA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwMDsgaSsrKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHsgbGFiZWw6IGBpdGVtICR7aX1gIH0pO1xuXHRcdH1cblx0XHRxdWlja3BpY2suaXRlbXMgPSBpdGVtcztcblx0XHQvLyBzZXR0aW5nIHRoZSBhY3RpdmUgaXRlbSBzaG91bGQgY2F1c2UgdGhlIHF1aWNrIHBpY2sgdG8gc2Nyb2xsIHRvIHRoZSBib3R0b21cblx0XHRxdWlja3BpY2suYWN0aXZlSXRlbXMgPSBbaXRlbXNbaXRlbXMubGVuZ3RoIC0gMV1dO1xuXHRcdHF1aWNrcGljay5zaG93KCk7XG5cblx0XHRjb25zdCBjdXJzb3JUb3AgPSBxdWlja3BpY2suc2Nyb2xsVG9wO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGN1cnNvclRvcCwgMCk7XG5cblx0XHRxdWlja3BpY2sua2VlcFNjcm9sbFBvc2l0aW9uID0gdHJ1ZTtcblx0XHRxdWlja3BpY2suYWN0aXZlSXRlbXMgPSBbaXRlbXNbMF1dO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdXJzb3JUb3AsIHF1aWNrcGljay5zY3JvbGxUb3ApO1xuXG5cdFx0cXVpY2twaWNrLmtlZXBTY3JvbGxQb3NpdGlvbiA9IGZhbHNlO1xuXHRcdHF1aWNrcGljay5hY3RpdmVJdGVtcyA9IFtpdGVtc1swXV07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1aWNrcGljay5zY3JvbGxUb3AsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwU2Nyb2xsUG9zaXRpb24gLSB3b3JrcyB3aXRoIGl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHF1aWNrcGljayA9IHN0b3JlLmFkZChjb250cm9sbGVyLmNyZWF0ZVF1aWNrUGljaygpIGFzIFF1aWNrUGljazxJUXVpY2tQaWNrSXRlbT4pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDA7IGkrKykge1xuXHRcdFx0aXRlbXMucHVzaCh7IGxhYmVsOiBgaXRlbSAke2l9YCB9KTtcblx0XHR9XG5cdFx0cXVpY2twaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0Ly8gc2V0dGluZyB0aGUgYWN0aXZlIGl0ZW0gc2hvdWxkIGNhdXNlIHRoZSBxdWljayBwaWNrIHRvIHNjcm9sbCB0byB0aGUgYm90dG9tXG5cdFx0cXVpY2twaWNrLmFjdGl2ZUl0ZW1zID0gW2l0ZW1zW2l0ZW1zLmxlbmd0aCAtIDFdXTtcblx0XHRxdWlja3BpY2suc2hvdygpO1xuXG5cdFx0Y29uc3QgY3Vyc29yVG9wID0gcXVpY2twaWNrLnNjcm9sbFRvcDtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY3Vyc29yVG9wLCAwKTtcblxuXHRcdHF1aWNrcGljay5rZWVwU2Nyb2xsUG9zaXRpb24gPSB0cnVlO1xuXHRcdHF1aWNrcGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdXJzb3JUb3AsIHF1aWNrcGljay5zY3JvbGxUb3ApO1xuXG5cdFx0cXVpY2twaWNrLmtlZXBTY3JvbGxQb3NpdGlvbiA9IGZhbHNlO1xuXHRcdHF1aWNrcGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWlja3BpY2suc2Nyb2xsVG9wLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0ZWRJdGVtcyAtIHZlcmlmeSBwcmV2aW91cyBzZWxlY3RlZEl0ZW1zIGRvZXMgbm90IGhhbmcgb3ZlciB0byBuZXh0IHNldCBvZiBpdGVtcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBxdWlja3BpY2sgPSBzdG9yZS5hZGQoY29udHJvbGxlci5jcmVhdGVRdWlja1BpY2soKSk7XG5cdFx0cXVpY2twaWNrLml0ZW1zID0gW3sgbGFiZWw6ICdzdGVwIDEnIH1dO1xuXHRcdHF1aWNrcGljay5zaG93KCk7XG5cblx0XHR2b2lkIChhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdHN0b3JlLmFkZChxdWlja3BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRxdWlja3BpY2suY2FuU2VsZWN0TWFueSA9IHRydWU7XG5cdFx0XHRcdHF1aWNrcGljay5pdGVtcyA9IFt7IGxhYmVsOiAnYScgfSwgeyBsYWJlbDogJ2InIH0sIHsgbGFiZWw6ICdjJyB9XTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBhY2NlcHQgJ3N0ZXAgMSdcblx0XHRcdGNvbnRyb2xsZXIuYWNjZXB0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gYWNjZXB0IGluIG11bHRpLXNlbGVjdFxuXHRcdGNvbnRyb2xsZXIuYWNjZXB0KCk7XG5cblx0XHQvLyBTaW5jZSB3ZSBkb24ndCBzZWxlY3QgYW55IGl0ZW1zLCB0aGUgc2VsZWN0ZWQgaXRlbXMgc2hvdWxkIGJlIGVtcHR5XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1aWNrcGljay5zZWxlY3RlZEl0ZW1zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZUl0ZW1zIC0gdmVyaWZ5IG9uRGlkQ2hhbmdlQWN0aXZlIGlzIHRyaWdnZXJlZCBhZnRlciBzZXR0aW5nIGl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHF1aWNrcGljayA9IHN0b3JlLmFkZChjb250cm9sbGVyLmNyZWF0ZVF1aWNrUGljaygpKTtcblxuXHRcdC8vIFNldHVwIGxpc3RlbmVyIGZvciB2ZXJpZmljYXRpb25cblx0XHRjb25zdCBhY3RpdmVJdGVtc0Zyb21FdmVudDogSVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChxdWlja3BpY2sub25EaWRDaGFuZ2VBY3RpdmUoaXRlbXMgPT4gYWN0aXZlSXRlbXNGcm9tRXZlbnQucHVzaCguLi5pdGVtcykpKTtcblxuXHRcdHF1aWNrcGljay5zaG93KCk7XG5cblx0XHRjb25zdCBpdGVtID0geyBsYWJlbDogJ3N0ZXAgMScgfTtcblx0XHRxdWlja3BpY2suaXRlbXMgPSBbaXRlbV07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlSXRlbXNGcm9tRXZlbnQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlSXRlbXNGcm9tRXZlbnRbMF0sIGl0ZW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWlja3BpY2suYWN0aXZlSXRlbXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVpY2twaWNrLmFjdGl2ZUl0ZW1zWzBdLCBpdGVtKTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aXZlSXRlbXMgLSB2ZXJpZnkgc2V0dGluZyBpdGVtQWN0aXZhdGlvbiB0byBOb25lIHN0aWxsIHRyaWdnZXJzIG9uRGlkQ2hhbmdlQWN0aXZlIGFmdGVyIHNlbGVjdGlvbiAjMjA3ODMyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHF1aWNrcGljayA9IHN0b3JlLmFkZChjb250cm9sbGVyLmNyZWF0ZVF1aWNrUGljaygpKTtcblx0XHRjb25zdCBpdGVtID0geyBsYWJlbDogJ3N0ZXAgMScgfTtcblx0XHRxdWlja3BpY2suaXRlbXMgPSBbaXRlbV07XG5cdFx0cXVpY2twaWNrLnNob3coKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVpY2twaWNrLmFjdGl2ZUl0ZW1zWzBdLCBpdGVtKTtcblxuXHRcdC8vIFNldHVwIGxpc3RlbmVyIGZvciB2ZXJpZmljYXRpb25cblx0XHRjb25zdCBhY3RpdmVJdGVtc0Zyb21FdmVudDogSVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChxdWlja3BpY2sub25EaWRDaGFuZ2VBY3RpdmUoaXRlbXMgPT4gYWN0aXZlSXRlbXNGcm9tRXZlbnQucHVzaCguLi5pdGVtcykpKTtcblxuXHRcdC8vIFRyaWdnZXIgYSBjaGFuZ2Vcblx0XHRxdWlja3BpY2suaXRlbUFjdGl2YXRpb24gPSBJdGVtQWN0aXZhdGlvbi5OT05FO1xuXHRcdHF1aWNrcGljay5pdGVtcyA9IFtpdGVtXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVJdGVtc0Zyb21FdmVudC5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWlja3BpY2suYWN0aXZlSXRlbXMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnaXNLZXlNb2RpZmllZCAtIHJldHVybnMgZmFsc2Ugd2hlbiBubyBtb2RpZmllcnMgYXJlIHByZXNzZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzS2V5TW9kaWZpZWQoTk9fS0VZX01PRFMpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzS2V5TW9kaWZpZWQoeyBjdHJsQ21kOiBmYWxzZSwgYWx0OiBmYWxzZSwgc2hpZnQ6IGZhbHNlIH0pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzS2V5TW9kaWZpZWQgLSByZXR1cm5zIHRydWUgd2hlbiBhbnkgbW9kaWZpZXIgaXMgcHJlc3NlZCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNLZXlNb2RpZmllZCh7IGN0cmxDbWQ6IHRydWUsIGFsdDogZmFsc2UsIHNoaWZ0OiBmYWxzZSB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzS2V5TW9kaWZpZWQoeyBjdHJsQ21kOiBmYWxzZSwgYWx0OiB0cnVlLCBzaGlmdDogZmFsc2UgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0tleU1vZGlmaWVkKHsgY3RybENtZDogZmFsc2UsIGFsdDogZmFsc2UsIHNoaWZ0OiB0cnVlIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNLZXlNb2RpZmllZCh7IGN0cmxDbWQ6IHRydWUsIGFsdDogdHJ1ZSwgc2hpZnQ6IHRydWUgfSksIHRydWUpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLE9BQU8sV0FBVztBQUNsQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw0QkFBNEI7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
