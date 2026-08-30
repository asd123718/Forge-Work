import * as assert from "assert";
import { Event } from "../../../../base/common/event.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { timeout } from "../../../../base/common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { HoverService } from "../../browser/hoverService.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../browser/hover.js";
import { IContextMenuService } from "../../../contextview/browser/contextView.js";
import { IKeybindingService } from "../../../keybinding/common/keybinding.js";
import { ILayoutService } from "../../../layout/browser/layoutService.js";
import { IAccessibilityService } from "../../../accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../accessibility/test/common/testAccessibilityService.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { NoMatchingKb } from "../../../keybinding/common/keybindingResolver.js";
import { IMarkdownRendererService } from "../../../markdown/browser/markdownRenderer.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { AnchorAlignment } from "../../../../base/common/layout.js";
suite("HoverService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let hoverService;
  let fixture;
  let instantiationService;
  setup(() => {
    fixture = document.createElement("div");
    mainWindow.document.body.appendChild(fixture);
    store.add(toDisposable(() => fixture.remove()));
    instantiationService = store.add(new TestInstantiationService());
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration("workbench.hover.delay", 0);
    configurationService.setUserConfiguration("workbench.hover.reducedDelay", 0);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IContextMenuService, {
      onDidShowContextMenu: Event.None
    });
    instantiationService.stub(IKeybindingService, {
      mightProducePrintableCharacter() {
        return false;
      },
      softDispatch() {
        return NoMatchingKb;
      },
      resolveKeyboardEvent() {
        return {
          getLabel() {
            return "";
          },
          getAriaLabel() {
            return "";
          },
          getElectronAccelerator() {
            return null;
          },
          getUserSettingsLabel() {
            return null;
          },
          isWYSIWYG() {
            return false;
          },
          hasMultipleChords() {
            return false;
          },
          getDispatchChords() {
            return [null];
          },
          getSingleModifierDispatchChords() {
            return [];
          },
          getChords() {
            return [];
          }
        };
      }
    });
    instantiationService.stub(ILayoutService, {
      activeContainer: fixture,
      mainContainer: fixture,
      getContainer() {
        return fixture;
      },
      onDidLayoutContainer: Event.None
    });
    instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
    instantiationService.stub(IMarkdownRendererService, {
      render() {
        return { element: document.createElement("div"), dispose() {
        } };
      },
      setDefaultCodeBlockRenderer() {
      }
    });
    hoverService = store.add(instantiationService.createInstance(HoverService));
    instantiationService.stub(IHoverService, hoverService);
  });
  function createTarget() {
    const target = document.createElement("div");
    target.style.width = "100px";
    target.style.height = "100px";
    fixture.appendChild(target);
    return target;
  }
  function showHover(content, target, options) {
    const hover = hoverService.showInstantHover({
      content,
      target: target ?? createTarget(),
      ...options
    });
    assert.ok(hover, `Hover with content "${content}" should be created`);
    return hover;
  }
  function asHoverWidget(hover) {
    return hover;
  }
  function isInDOM(hover) {
    return mainWindow.document.body.contains(asHoverWidget(hover).domNode);
  }
  function assertInDOM(hover, message) {
    assert.ok(isInDOM(hover), message ?? "Hover should be in the DOM");
  }
  function assertNotInDOM(hover, message) {
    assert.ok(!isInDOM(hover), message ?? "Hover should not be in the DOM");
  }
  function createNestedHover(parentHover, content) {
    const nestedTarget = document.createElement("div");
    asHoverWidget(parentHover).domNode.appendChild(nestedTarget);
    return showHover(content, nestedTarget);
  }
  function createHoverChain(depth) {
    const hovers = [];
    let currentTarget = createTarget();
    for (let i = 0; i < depth; i++) {
      const hover = hoverService.showInstantHover({
        content: `Hover ${i + 1}`,
        target: currentTarget
      });
      if (!hover) {
        break;
      }
      hovers.push(asHoverWidget(hover));
      currentTarget = document.createElement("div");
      asHoverWidget(hover).domNode.appendChild(currentTarget);
    }
    return hovers;
  }
  function disposeHovers(hovers) {
    for (const h of [...hovers].reverse()) {
      h?.dispose();
    }
  }
  suite("showInstantHover", () => {
    test("should not show hover with empty content", () => {
      const target = createTarget();
      const hover = hoverService.showInstantHover({
        content: "",
        target
      });
      assert.strictEqual(hover, void 0, "Hover should not be created for empty content");
    });
    test("should align the right edge of a hover with its target", () => {
      const target = createTarget();
      target.getBoundingClientRect = () => new DOMRect(300, 100, 100, 20);
      const hover = showHover("Right aligned hover", target, {
        position: {
          hoverPosition: HoverPosition.BELOW,
          anchorAlignment: AnchorAlignment.RIGHT
        },
        appearance: { showPointer: true }
      });
      const hoverWidget = asHoverWidget(hover);
      Object.defineProperty(hoverWidget.domNode, "clientWidth", { configurable: true, value: 200 });
      hoverWidget.layout();
      assert.strictEqual(hoverWidget.x, 198);
      hover.dispose();
    });
    test("should constrain a right-aligned hover to the available width", () => {
      const target = createTarget();
      let targetLeft = 100;
      target.getBoundingClientRect = () => new DOMRect(targetLeft, 100, 50, 20);
      const hover = showHover("Constrained right aligned hover", target, {
        position: {
          hoverPosition: HoverPosition.BELOW,
          anchorAlignment: AnchorAlignment.RIGHT
        },
        appearance: { showPointer: true }
      });
      const hoverWidget = asHoverWidget(hover);
      Object.defineProperty(hoverWidget.domNode, "clientWidth", {
        configurable: true,
        get: () => Math.min(200, Number.parseFloat(hoverWidget.domNode.style.maxWidth) || 200)
      });
      hoverWidget.layout();
      const constrainedMaxWidth = hoverWidget.domNode.style.maxWidth;
      targetLeft = 300;
      hoverWidget.layout();
      assert.deepStrictEqual({
        constrainedMaxWidth,
        restoredMaxWidth: hoverWidget.domNode.style.maxWidth
      }, {
        constrainedMaxWidth: "146px",
        restoredMaxWidth: ""
      });
      hover.dispose();
    });
    test("should call onDidShow callback when hover is shown", () => {
      const target = createTarget();
      let didShowCalled = false;
      const hover = hoverService.showInstantHover({
        content: "Test",
        target,
        onDidShow: () => {
          didShowCalled = true;
        }
      });
      assert.ok(didShowCalled, "onDidShow should be called");
      assert.ok(hover);
      assertInDOM(hover, "Hover should be in DOM after showing");
      hover.dispose();
      assertNotInDOM(hover, "Hover should be removed from DOM after dispose");
    });
    test("should call onDidHide exactly once when hover is disposed", () => {
      const target = createTarget();
      let didHideCount = 0;
      const hover = hoverService.showInstantHover({
        content: "Test",
        target,
        onDidHide: () => {
          didHideCount++;
        }
      });
      assert.ok(hover);
      hover.dispose();
      hover.dispose();
      assert.strictEqual(didHideCount, 1);
    });
    test("should call onDidHide when hover is hidden during onDidShow", () => {
      const target = createTarget();
      const calls = [];
      hoverService.showInstantHover({
        content: "Test",
        target,
        onDidShow: () => {
          calls.push("show");
          hoverService.hideHover(true);
        },
        onDidHide: () => {
          calls.push("hide");
        }
      });
      assert.deepStrictEqual(calls, ["show", "hide"]);
    });
    test("should deduplicate hovers by id", () => {
      const target = createTarget();
      const hover1 = hoverService.showInstantHover({
        content: "Same content",
        target,
        id: "same-id"
      });
      const hover2 = hoverService.showInstantHover({
        content: "Same content",
        target,
        id: "same-id"
      });
      assert.ok(hover1, "First hover should be created");
      assertInDOM(hover1, "First hover should be in DOM");
      assert.strictEqual(hover2, void 0, "Second hover with same id should not be created");
      const hover3 = hoverService.showInstantHover({
        content: "Content 3",
        target,
        id: "different-id"
      });
      assert.ok(hover3, "Hover with different id should be created");
      assertInDOM(hover3, "Third hover should be in DOM");
      hover1?.dispose();
      hover3?.dispose();
    });
    test("should apply additional classes to hover DOM", () => {
      const hover = showHover("Test", void 0, {
        additionalClasses: ["custom-class-1", "custom-class-2"]
      });
      const domNode = asHoverWidget(hover).domNode;
      assertInDOM(hover, "Hover should be in DOM");
      assert.ok(domNode.classList.contains("custom-class-1"), "Should have custom-class-1");
      assert.ok(domNode.classList.contains("custom-class-2"), "Should have custom-class-2");
      hover.dispose();
      assertNotInDOM(hover, "Hover should be removed from DOM after dispose");
    });
  });
  suite("hideHover", () => {
    test("should hide non-locked hover", () => {
      const hover = showHover("Test");
      assertInDOM(hover, "Hover should be in DOM initially");
      hoverService.hideHover();
      assert.strictEqual(hover.isDisposed, true, "Hover should be disposed after hideHover");
      assertNotInDOM(hover, "Hover should be removed from DOM after hideHover");
    });
    test("should not hide locked hover without force flag", () => {
      const hover = showHover("Test", void 0, {
        persistence: { sticky: true }
      });
      assertInDOM(hover, "Locked hover should be in DOM");
      hoverService.hideHover();
      assert.strictEqual(hover.isDisposed, false, "Locked hover should not be disposed without force");
      assertInDOM(hover, "Locked hover should remain in DOM");
      hoverService.hideHover(true);
      assert.strictEqual(hover.isDisposed, true, "Locked hover should be disposed with force=true");
      assertNotInDOM(hover, "Locked hover should be removed from DOM with force");
    });
  });
  suite("nested hovers", () => {
    test("should keep parent hover visible when nested hover is created", () => {
      const parentHover = showHover("Parent");
      assertInDOM(parentHover, "Parent hover should be in DOM");
      const nestedHover = createNestedHover(parentHover, "Nested");
      assertInDOM(nestedHover, "Nested hover should be in DOM");
      assertInDOM(parentHover, "Parent hover should still be in DOM after nested hover created");
      assert.strictEqual(parentHover.isDisposed, false, "Parent hover should remain visible");
      assert.strictEqual(nestedHover.isDisposed, false, "Nested hover should be visible");
      nestedHover.dispose();
      assertNotInDOM(nestedHover, "Nested hover should be removed from DOM after dispose");
      assertInDOM(parentHover, "Parent hover should remain in DOM after nested is disposed");
      parentHover.dispose();
      assertNotInDOM(parentHover, "Parent hover should be removed from DOM after dispose");
    });
    test("should dispose nested hover when parent is disposed", () => {
      const parentHover = showHover("Parent");
      const nestedHover = createNestedHover(parentHover, "Nested");
      assertInDOM(parentHover, "Parent hover should be in DOM");
      assertInDOM(nestedHover, "Nested hover should be in DOM");
      parentHover.dispose();
      assert.strictEqual(nestedHover.isDisposed, true, "Nested hover should be disposed when parent is disposed");
      assertNotInDOM(parentHover, "Parent hover should be removed from DOM");
      assertNotInDOM(nestedHover, "Nested hover should be removed from DOM when parent is disposed");
    });
    test("should dispose entire hover chain when root is disposed", () => {
      const hovers = createHoverChain(3);
      assert.strictEqual(hovers.length, 3, "Should create 3 hovers");
      for (let i = 0; i < hovers.length; i++) {
        assert.ok(mainWindow.document.body.contains(hovers[i].domNode), `Hover ${i + 1} should be in DOM`);
      }
      hovers[0].dispose();
      for (let i = 0; i < hovers.length; i++) {
        assert.strictEqual(hovers[i].isDisposed, true, `Hover ${i + 1} should be disposed`);
        assert.ok(!mainWindow.document.body.contains(hovers[i].domNode), `Hover ${i + 1} should be removed from DOM`);
      }
    });
    test("should dispose only nested hovers when middle hover is disposed", () => {
      const hovers = createHoverChain(3);
      assert.strictEqual(hovers.length, 3, "Should create 3 hovers");
      for (const h of hovers) {
        assert.ok(mainWindow.document.body.contains(h.domNode), "All hovers should be in DOM initially");
      }
      hovers[1].dispose();
      assert.strictEqual(hovers[0].isDisposed, false, "Root hover should remain");
      assert.ok(mainWindow.document.body.contains(hovers[0].domNode), "Root hover should remain in DOM");
      assert.strictEqual(hovers[1].isDisposed, true, "Middle hover should be disposed");
      assert.ok(!mainWindow.document.body.contains(hovers[1].domNode), "Middle hover should be removed from DOM");
      assert.strictEqual(hovers[2].isDisposed, true, "Innermost hover should be disposed");
      assert.ok(!mainWindow.document.body.contains(hovers[2].domNode), "Innermost hover should be removed from DOM");
      hovers[0].dispose();
    });
    test("should enforce maximum nesting depth", () => {
      const hovers = createHoverChain(3);
      assert.strictEqual(hovers.length, 3, "Should create exactly 3 hovers (max depth)");
      for (const h of hovers) {
        assert.ok(mainWindow.document.body.contains(h.domNode), "Hover should be in DOM");
      }
      const nestedTarget = document.createElement("div");
      hovers[2].domNode.appendChild(nestedTarget);
      const fourthHover = hoverService.showInstantHover({
        content: "Hover 4",
        target: nestedTarget
      });
      assert.strictEqual(fourthHover, void 0, "Fourth hover should not be created due to max nesting depth");
      disposeHovers(hovers);
    });
    test("should allow new hover chain after disposing previous chain", () => {
      const firstChain = createHoverChain(3);
      for (const h of firstChain) {
        assert.ok(mainWindow.document.body.contains(h.domNode), "First chain hover should be in DOM");
      }
      disposeHovers(firstChain);
      for (const h of firstChain) {
        assert.ok(!mainWindow.document.body.contains(h.domNode), "First chain hover should be removed from DOM");
      }
      const secondChain = createHoverChain(3);
      assert.strictEqual(secondChain.length, 3, "Should create new chain after disposing previous");
      for (const h of secondChain) {
        assert.ok(mainWindow.document.body.contains(h.domNode), "Second chain hover should be in DOM");
      }
      disposeHovers(secondChain);
    });
    test("hideHover should close innermost hover first", () => {
      const hovers = createHoverChain(2);
      assert.ok(mainWindow.document.body.contains(hovers[0].domNode), "Outer hover should be in DOM");
      assert.ok(mainWindow.document.body.contains(hovers[1].domNode), "Inner hover should be in DOM");
      hoverService.hideHover();
      assert.strictEqual(hovers[1].isDisposed, true, "Innermost hover should be disposed");
      assert.ok(!mainWindow.document.body.contains(hovers[1].domNode), "Innermost hover should be removed from DOM");
      assert.strictEqual(hovers[0].isDisposed, false, "Outer hover should remain");
      assert.ok(mainWindow.document.body.contains(hovers[0].domNode), "Outer hover should remain in DOM");
      hoverService.hideHover();
      assert.strictEqual(hovers[0].isDisposed, true, "Outer hover should be disposed on second call");
      assert.ok(!mainWindow.document.body.contains(hovers[0].domNode), "Outer hover should be removed from DOM");
    });
  });
  suite("setupDelayedHover", () => {
    test("should evaluate function options on mouseover", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      let callCount = 0;
      const disposable = hoverService.setupDelayedHover(target, () => {
        callCount++;
        return { content: `Call ${callCount}` };
      });
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      assert.strictEqual(callCount, 1, "Options function should be called on first mouseover");
      await timeout(0);
      hoverService.hideHover(true);
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      assert.strictEqual(callCount, 2, "Options function should be called on second mouseover");
      await timeout(0);
      disposable.dispose();
      hoverService.hideHover(true);
    }));
    test("should not call onDidHide when delayed hover is never shown", () => {
      const target = createTarget();
      let didHideCount = 0;
      const disposable = hoverService.setupDelayedHover(target, {
        content: "Test",
        onDidHide: () => {
          didHideCount++;
        }
      });
      disposable.dispose();
      assert.strictEqual(didHideCount, 0);
    });
    test("should use reduced delay when reducedDelay is true", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      instantiationService.get(IConfigurationService).setUserConfiguration("workbench.hover.reducedDelay", 150);
      const disposable = hoverService.setupDelayedHover(target, { content: "Reduced delay" }, { reducedDelay: true });
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await timeout(75);
      const hoversBefore = mainWindow.document.querySelectorAll(".monaco-hover");
      assert.strictEqual(hoversBefore.length, 0, "Hover should not be visible before delay completes");
      await timeout(150);
      const hoversAfter = mainWindow.document.querySelectorAll(".monaco-hover");
      assert.strictEqual(hoversAfter.length, 1, "Hover should be visible after reduced delay");
      disposable.dispose();
      hoverService.hideHover(true);
    }));
  });
  suite("setupManagedHover", () => {
    test("should use native title attribute when showNativeHover is true", () => {
      const target = createTarget();
      const hover = hoverService.setupManagedHover(
        { showHover: () => void 0, delay: 0, showNativeHover: true },
        target,
        "Native hover content"
      );
      assert.strictEqual(target.getAttribute("title"), "Native hover content");
      hover.dispose();
      assert.strictEqual(target.getAttribute("title"), null, "Title should be removed on dispose");
    });
    test("should update content dynamically", async () => {
      const target = createTarget();
      const hover = hoverService.setupManagedHover(
        { showHover: () => void 0, delay: 0, showNativeHover: true },
        target,
        "Initial"
      );
      assert.strictEqual(target.getAttribute("title"), "Initial");
      await hover.update("Updated");
      assert.strictEqual(target.getAttribute("title"), "Updated");
      await hover.update("Final");
      assert.strictEqual(target.getAttribute("title"), "Final");
      hover.dispose();
    });
    test("should not re-show hover on focus when relatedTarget is from a dismissed hover", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const delegate = store.add(instantiationService.createInstance(WorkbenchHoverDelegate, "element", void 0, {}));
      store.add(hoverService.setupManagedHover(delegate, target, "Test"));
      target.dispatchEvent(new FocusEvent("focus", { bubbles: true, relatedTarget: document.body }));
      await timeout(500);
      const hoversBefore = fixture.querySelectorAll(".monaco-hover");
      assert.ok(hoversBefore.length > 0, "Hover should be visible after focus");
      hoverService.hideHover(true);
      await timeout(0);
      const hoverElement = document.createElement("div");
      hoverElement.classList.add("monaco-hover");
      target.dispatchEvent(new FocusEvent("focus", { bubbles: true, relatedTarget: hoverElement }));
      await timeout(500);
      const hoversAfter = fixture.querySelectorAll(".monaco-hover");
      assert.strictEqual(hoversAfter.length, 0, "Hover should not re-show when focus comes from dismissed hover");
    }));
    test("should not re-show hover on focus when relatedTarget is null (window reactivation)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const delegate = store.add(instantiationService.createInstance(WorkbenchHoverDelegate, "element", void 0, {}));
      store.add(hoverService.setupManagedHover(delegate, target, "Test"));
      target.dispatchEvent(new FocusEvent("focus", { bubbles: true, relatedTarget: document.body }));
      await timeout(500);
      hoverService.hideHover(true);
      await timeout(0);
      target.dispatchEvent(new FocusEvent("focus", { bubbles: true, relatedTarget: null }));
      await timeout(500);
      const hovers = fixture.querySelectorAll(".monaco-hover");
      assert.strictEqual(hovers.length, 0, "Hover should not re-show on window reactivation");
    }));
  });
  suite("showDelayedHover", () => {
    test("should reject hover when current hover is locked and target is outside", () => {
      const lockedHover = showHover("Locked", void 0, {
        persistence: { sticky: true }
      });
      assertInDOM(lockedHover, "Locked hover should be in DOM");
      const otherTarget = createTarget();
      const rejectedHover = hoverService.showDelayedHover({
        content: "Should not show",
        target: otherTarget
      }, {});
      assert.strictEqual(rejectedHover, void 0, "Should reject hover when locked hover exists");
      assertInDOM(lockedHover, "Locked hover should remain in DOM after rejection");
      lockedHover.dispose();
      assertNotInDOM(lockedHover, "Locked hover should be removed from DOM after dispose");
    });
    test("should use reduced delay when reducedDelay is true", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const reducedDelay = 100;
      instantiationService.get(IConfigurationService).setUserConfiguration("workbench.hover.reducedDelay", reducedDelay);
      const hover = hoverService.showDelayedHover({
        content: "Reduced delay hover",
        target
      }, { reducedDelay: true });
      assert.ok(hover, "Hover should be created");
      assertNotInDOM(hover, "Hover should not be visible immediately");
      await timeout(reducedDelay / 2);
      assertNotInDOM(hover, "Hover should not be visible before delay completes");
      await timeout(reducedDelay);
      assertInDOM(hover, "Hover should be visible after reduced delay");
      hover.dispose();
    }));
    test("should use default delay when custom delay is undefined", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const hover = hoverService.showDelayedHover({
        content: "Default delay hover",
        target
      }, {});
      assert.ok(hover, "Hover should be created");
      await timeout(0);
      assertInDOM(hover, "Hover should be visible with default delay");
      hover.dispose();
    }));
  });
  suite("hover locking", () => {
    test("isLocked should be settable on hover widget", () => {
      const hover = showHover("Test");
      const widget = asHoverWidget(hover);
      assertInDOM(hover, "Hover should be in DOM");
      assert.strictEqual(widget.isLocked, false, "Should not be locked initially");
      widget.isLocked = true;
      assert.strictEqual(widget.isLocked, true, "Should be locked after setting");
      assertInDOM(hover, "Hover should remain in DOM after locking");
      widget.isLocked = false;
      assert.strictEqual(widget.isLocked, false, "Should be unlocked after unsetting");
      hover.dispose();
      assertNotInDOM(hover, "Hover should be removed from DOM after dispose");
    });
    test("sticky option should set isLocked to true", () => {
      const hover = showHover("Test", void 0, {
        persistence: { sticky: true }
      });
      assertInDOM(hover, "Sticky hover should be in DOM");
      assert.strictEqual(asHoverWidget(hover).isLocked, true, "Should be locked when sticky");
      hover.dispose();
      assertNotInDOM(hover, "Sticky hover should be removed from DOM after dispose");
    });
  });
  suite("showAndFocusLastHover", () => {
    test("should recreate last disposed hover", () => {
      const target = createTarget();
      const hover = hoverService.showInstantHover({
        content: "Remember me",
        target
      });
      assert.ok(hover);
      assertInDOM(hover, "Initial hover should be in DOM");
      hover.dispose();
      assertNotInDOM(hover, "Hover should be removed from DOM after dispose");
      hoverService.showAndFocusLastHover();
      const hoverElements = mainWindow.document.querySelectorAll(".monaco-hover");
      assert.ok(hoverElements.length > 0, "A hover should be recreated and in the DOM");
      hoverService.hideHover(true);
      const remainingHovers = mainWindow.document.querySelectorAll(".monaco-hover");
      assert.strictEqual(remainingHovers.length, 0, "No hovers should remain in DOM after cleanup");
    });
  });
  suite("layout and resize", () => {
    test("layout should suppress pending mouseout so content resize does not dismiss hover", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const content = document.createElement("div");
      content.textContent = "Resizable content";
      const hover = hoverService.showInstantHover({
        content,
        target
      });
      assert.ok(hover);
      assertInDOM(hover, "Hover should be in DOM");
      const widget = asHoverWidget(hover);
      widget.domNode.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      widget.layout();
      await timeout(300);
      assertInDOM(hover, "Hover should remain in DOM after layout suppresses mouseout");
      hover.dispose();
      assertNotInDOM(hover, "Hover should be removed from DOM after dispose");
    }));
    test.skip("hover should still dismiss on mouseout when no layout occurs", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const content = document.createElement("div");
      content.textContent = "Content";
      const hover = hoverService.showInstantHover({
        content,
        target
      });
      assert.ok(hover);
      assertInDOM(hover, "Hover should be in DOM");
      const widget = asHoverWidget(hover);
      widget.domNode.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      await timeout(300);
      assertNotInDOM(hover, "Hover should be dismissed after mouseout without layout");
    }));
    test.skip("suppression clears after mouse re-enters and a new mouseleave dismisses normally", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const content = document.createElement("div");
      content.textContent = "Resizable content";
      const hover = hoverService.showInstantHover({
        content,
        target
      });
      assert.ok(hover);
      assertInDOM(hover, "Hover should be in DOM");
      const widget = asHoverWidget(hover);
      widget.domNode.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      widget.layout();
      await timeout(300);
      assertInDOM(hover, "Hover should remain after suppressed mouseout");
      widget.domNode.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      widget.domNode.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      await timeout(300);
      assertNotInDOM(hover, "Hover should dismiss on normal mouseout after suppression was cleared");
    }));
    test("clicking outside should dismiss non-sticky hover", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const content = document.createElement("div");
      content.textContent = "Content";
      const hover = hoverService.showInstantHover({
        content,
        target
      });
      assert.ok(hover);
      assertInDOM(hover, "Hover should be in DOM");
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      assertNotInDOM(hover, "Non-sticky hover should be dismissed after clicking outside");
    }));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcaG92ZXJcXHRlc3RcXGJyb3dzZXJcXGhvdmVyU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2hvdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlLCBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlcldpZGdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L3Rlc3QvY29tbW9uL3Rlc3RBY2Nlc3NpYmlsaXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBOb01hdGNoaW5nS2IgfSBmcm9tICcuLi8uLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB0eXBlIHsgSUhvdmVyV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF5b3V0LmpzJztcblxuc3VpdGUoJ0hvdmVyU2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0bGV0IGhvdmVyU2VydmljZTogSG92ZXJTZXJ2aWNlO1xuXHRsZXQgZml4dHVyZTogSFRNTEVsZW1lbnQ7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRmaXh0dXJlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGZpeHR1cmUpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZml4dHVyZS5yZW1vdmUoKSkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guaG92ZXIuZGVsYXknLCAwKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmhvdmVyLnJlZHVjZWREZWxheScsIDApO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0TWVudVNlcnZpY2UsIHtcblx0XHRcdG9uRGlkU2hvd0NvbnRleHRNZW51OiBFdmVudC5Ob25lXG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElLZXliaW5kaW5nU2VydmljZSwge1xuXHRcdFx0bWlnaHRQcm9kdWNlUHJpbnRhYmxlQ2hhcmFjdGVyKCkgeyByZXR1cm4gZmFsc2U7IH0sXG5cdFx0XHRzb2Z0RGlzcGF0Y2goKSB7IHJldHVybiBOb01hdGNoaW5nS2I7IH0sXG5cdFx0XHRyZXNvbHZlS2V5Ym9hcmRFdmVudCgpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRnZXRMYWJlbCgpIHsgcmV0dXJuICcnOyB9LFxuXHRcdFx0XHRcdGdldEFyaWFMYWJlbCgpIHsgcmV0dXJuICcnOyB9LFxuXHRcdFx0XHRcdGdldEVsZWN0cm9uQWNjZWxlcmF0b3IoKSB7IHJldHVybiBudWxsOyB9LFxuXHRcdFx0XHRcdGdldFVzZXJTZXR0aW5nc0xhYmVsKCkgeyByZXR1cm4gbnVsbDsgfSxcblx0XHRcdFx0XHRpc1dZU0lXWUcoKSB7IHJldHVybiBmYWxzZTsgfSxcblx0XHRcdFx0XHRoYXNNdWx0aXBsZUNob3JkcygpIHsgcmV0dXJuIGZhbHNlOyB9LFxuXHRcdFx0XHRcdGdldERpc3BhdGNoQ2hvcmRzKCkgeyByZXR1cm4gW251bGxdOyB9LFxuXHRcdFx0XHRcdGdldFNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hDaG9yZHMoKSB7IHJldHVybiBbXTsgfSxcblx0XHRcdFx0XHRnZXRDaG9yZHMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGF5b3V0U2VydmljZSwge1xuXHRcdFx0YWN0aXZlQ29udGFpbmVyOiBmaXh0dXJlLFxuXHRcdFx0bWFpbkNvbnRhaW5lcjogZml4dHVyZSxcblx0XHRcdGdldENvbnRhaW5lcigpIHsgcmV0dXJuIGZpeHR1cmU7IH0sXG5cdFx0XHRvbkRpZExheW91dENvbnRhaW5lcjogRXZlbnQuTm9uZVxuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIG5ldyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UoKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNYXJrZG93blJlbmRlcmVyU2VydmljZSwge1xuXHRcdFx0cmVuZGVyKCkgeyByZXR1cm4geyBlbGVtZW50OiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSwgZGlzcG9zZSgpIHsgfSB9OyB9LFxuXHRcdFx0c2V0RGVmYXVsdENvZGVCbG9ja1JlbmRlcmVyKCkgeyB9XG5cdFx0fSk7XG5cblx0XHRob3ZlclNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSG92ZXJTZXJ2aWNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSG92ZXJTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHR9KTtcblxuXHQvLyAjcmVnaW9uIEhlbHBlciBmdW5jdGlvbnNcblxuXHRmdW5jdGlvbiBjcmVhdGVUYXJnZXQoKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IHRhcmdldCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRhcmdldC5zdHlsZS53aWR0aCA9ICcxMDBweCc7XG5cdFx0dGFyZ2V0LnN0eWxlLmhlaWdodCA9ICcxMDBweCc7XG5cdFx0Zml4dHVyZS5hcHBlbmRDaGlsZCh0YXJnZXQpO1xuXHRcdHJldHVybiB0YXJnZXQ7XG5cdH1cblxuXHRmdW5jdGlvbiBzaG93SG92ZXIoY29udGVudDogc3RyaW5nLCB0YXJnZXQ/OiBIVE1MRWxlbWVudCwgb3B0aW9ucz86IFBhcnRpYWw8UGFyYW1ldGVyczx0eXBlb2YgaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXI+WzBdPik6IElIb3ZlcldpZGdldCB7XG5cdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRjb250ZW50LFxuXHRcdFx0dGFyZ2V0OiB0YXJnZXQgPz8gY3JlYXRlVGFyZ2V0KCksXG5cdFx0XHQuLi5vcHRpb25zXG5cdFx0fSk7XG5cdFx0YXNzZXJ0Lm9rKGhvdmVyLCBgSG92ZXIgd2l0aCBjb250ZW50IFwiJHtjb250ZW50fVwiIHNob3VsZCBiZSBjcmVhdGVkYCk7XG5cdFx0cmV0dXJuIGhvdmVyO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNIb3ZlcldpZGdldChob3ZlcjogSUhvdmVyV2lkZ2V0KTogSG92ZXJXaWRnZXQge1xuXHRcdHJldHVybiBob3ZlciBhcyBIb3ZlcldpZGdldDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVja3MgaWYgYSBob3ZlcidzIERPTSBub2RlIGlzIHByZXNlbnQgaW4gdGhlIGRvY3VtZW50LlxuXHQgKi9cblx0ZnVuY3Rpb24gaXNJbkRPTShob3ZlcjogSUhvdmVyV2lkZ2V0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhhc0hvdmVyV2lkZ2V0KGhvdmVyKS5kb21Ob2RlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBc3NlcnRzIHRoYXQgYSBob3ZlciBpcyBpbiB0aGUgRE9NLlxuXHQgKi9cblx0ZnVuY3Rpb24gYXNzZXJ0SW5ET00oaG92ZXI6IElIb3ZlcldpZGdldCwgbWVzc2FnZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGFzc2VydC5vayhpc0luRE9NKGhvdmVyKSwgbWVzc2FnZSA/PyAnSG92ZXIgc2hvdWxkIGJlIGluIHRoZSBET00nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBc3NlcnRzIHRoYXQgYSBob3ZlciBpcyBOT1QgaW4gdGhlIERPTS5cblx0ICovXG5cdGZ1bmN0aW9uIGFzc2VydE5vdEluRE9NKGhvdmVyOiBJSG92ZXJXaWRnZXQsIG1lc3NhZ2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRhc3NlcnQub2soIWlzSW5ET00oaG92ZXIpLCBtZXNzYWdlID8/ICdIb3ZlciBzaG91bGQgbm90IGJlIGluIHRoZSBET00nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmVzdGVkIGhvdmVyIGJ5IGFwcGVuZGluZyBhIHRhcmdldCBlbGVtZW50IGluc2lkZSB0aGUgcGFyZW50IGhvdmVyJ3MgRE9NLlxuXHQgKi9cblx0ZnVuY3Rpb24gY3JlYXRlTmVzdGVkSG92ZXIocGFyZW50SG92ZXI6IElIb3ZlcldpZGdldCwgY29udGVudDogc3RyaW5nKTogSUhvdmVyV2lkZ2V0IHtcblx0XHRjb25zdCBuZXN0ZWRUYXJnZXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRhc0hvdmVyV2lkZ2V0KHBhcmVudEhvdmVyKS5kb21Ob2RlLmFwcGVuZENoaWxkKG5lc3RlZFRhcmdldCk7XG5cdFx0cmV0dXJuIHNob3dIb3Zlcihjb250ZW50LCBuZXN0ZWRUYXJnZXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBjaGFpbiBvZiBuZXN0ZWQgaG92ZXJzIHVwIHRvIHRoZSBzcGVjaWZpZWQgZGVwdGguXG5cdCAqIFJldHVybnMgdGhlIGFycmF5IG9mIGhvdmVycyBmcm9tIG91dGVybW9zdCB0byBpbm5lcm1vc3QuXG5cdCAqL1xuXHRmdW5jdGlvbiBjcmVhdGVIb3ZlckNoYWluKGRlcHRoOiBudW1iZXIpOiBIb3ZlcldpZGdldFtdIHtcblx0XHRjb25zdCBob3ZlcnM6IEhvdmVyV2lkZ2V0W10gPSBbXTtcblx0XHRsZXQgY3VycmVudFRhcmdldDogSFRNTEVsZW1lbnQgPSBjcmVhdGVUYXJnZXQoKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGVwdGg7IGkrKykge1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6IGBIb3ZlciAke2kgKyAxfWAsXG5cdFx0XHRcdHRhcmdldDogY3VycmVudFRhcmdldFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIWhvdmVyKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aG92ZXJzLnB1c2goYXNIb3ZlcldpZGdldChob3ZlcikpO1xuXHRcdFx0Y3VycmVudFRhcmdldCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0YXNIb3ZlcldpZGdldChob3ZlcikuZG9tTm9kZS5hcHBlbmRDaGlsZChjdXJyZW50VGFyZ2V0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaG92ZXJzO1xuXHR9XG5cblx0ZnVuY3Rpb24gZGlzcG9zZUhvdmVycyhob3ZlcnM6IEhvdmVyV2lkZ2V0W10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGggb2YgWy4uLmhvdmVyc10ucmV2ZXJzZSgpKSB7XG5cdFx0XHRoPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdHN1aXRlKCdzaG93SW5zdGFudEhvdmVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBub3Qgc2hvdyBob3ZlciB3aXRoIGVtcHR5IGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdFx0dGFyZ2V0XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCB1bmRlZmluZWQsICdIb3ZlciBzaG91bGQgbm90IGJlIGNyZWF0ZWQgZm9yIGVtcHR5IGNvbnRlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhbGlnbiB0aGUgcmlnaHQgZWRnZSBvZiBhIGhvdmVyIHdpdGggaXRzIHRhcmdldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0dGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9ICgpID0+IG5ldyBET01SZWN0KDMwMCwgMTAwLCAxMDAsIDIwKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gc2hvd0hvdmVyKCdSaWdodCBhbGlnbmVkIGhvdmVyJywgdGFyZ2V0LCB7XG5cdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0aG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5CRUxPVyxcblx0XHRcdFx0XHRhbmNob3JBbGlnbm1lbnQ6IEFuY2hvckFsaWdubWVudC5SSUdIVCxcblx0XHRcdFx0fSxcblx0XHRcdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogdHJ1ZSB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGhvdmVyV2lkZ2V0ID0gYXNIb3ZlcldpZGdldChob3Zlcik7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoaG92ZXJXaWRnZXQuZG9tTm9kZSwgJ2NsaWVudFdpZHRoJywgeyBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiAyMDAgfSk7XG5cblx0XHRcdGhvdmVyV2lkZ2V0LmxheW91dCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJXaWRnZXQueCwgMTk4KTtcblx0XHRcdGhvdmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb25zdHJhaW4gYSByaWdodC1hbGlnbmVkIGhvdmVyIHRvIHRoZSBhdmFpbGFibGUgd2lkdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGxldCB0YXJnZXRMZWZ0ID0gMTAwO1xuXHRcdFx0dGFyZ2V0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9ICgpID0+IG5ldyBET01SZWN0KHRhcmdldExlZnQsIDEwMCwgNTAsIDIwKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gc2hvd0hvdmVyKCdDb25zdHJhaW5lZCByaWdodCBhbGlnbmVkIGhvdmVyJywgdGFyZ2V0LCB7XG5cdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0aG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5CRUxPVyxcblx0XHRcdFx0XHRhbmNob3JBbGlnbm1lbnQ6IEFuY2hvckFsaWdubWVudC5SSUdIVCxcblx0XHRcdFx0fSxcblx0XHRcdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogdHJ1ZSB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGhvdmVyV2lkZ2V0ID0gYXNIb3ZlcldpZGdldChob3Zlcik7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoaG92ZXJXaWRnZXQuZG9tTm9kZSwgJ2NsaWVudFdpZHRoJywge1xuXHRcdFx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0XHRcdGdldDogKCkgPT4gTWF0aC5taW4oMjAwLCBOdW1iZXIucGFyc2VGbG9hdChob3ZlcldpZGdldC5kb21Ob2RlLnN0eWxlLm1heFdpZHRoKSB8fCAyMDApXG5cdFx0XHR9KTtcblxuXHRcdFx0aG92ZXJXaWRnZXQubGF5b3V0KCk7XG5cdFx0XHRjb25zdCBjb25zdHJhaW5lZE1heFdpZHRoID0gaG92ZXJXaWRnZXQuZG9tTm9kZS5zdHlsZS5tYXhXaWR0aDtcblx0XHRcdHRhcmdldExlZnQgPSAzMDA7XG5cdFx0XHRob3ZlcldpZGdldC5sYXlvdXQoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvbnN0cmFpbmVkTWF4V2lkdGgsXG5cdFx0XHRcdHJlc3RvcmVkTWF4V2lkdGg6IGhvdmVyV2lkZ2V0LmRvbU5vZGUuc3R5bGUubWF4V2lkdGhcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29uc3RyYWluZWRNYXhXaWR0aDogJzE0NnB4Jyxcblx0XHRcdFx0cmVzdG9yZWRNYXhXaWR0aDogJydcblx0XHRcdH0pO1xuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNhbGwgb25EaWRTaG93IGNhbGxiYWNrIHdoZW4gaG92ZXIgaXMgc2hvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGxldCBkaWRTaG93Q2FsbGVkID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IGhvdmVyID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiAnVGVzdCcsXG5cdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0b25EaWRTaG93OiAoKSA9PiB7IGRpZFNob3dDYWxsZWQgPSB0cnVlOyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGRpZFNob3dDYWxsZWQsICdvbkRpZFNob3cgc2hvdWxkIGJlIGNhbGxlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGhvdmVyKTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGJlIGluIERPTSBhZnRlciBzaG93aW5nJyk7XG5cblx0XHRcdGhvdmVyLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydE5vdEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00gYWZ0ZXIgZGlzcG9zZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNhbGwgb25EaWRIaWRlIGV4YWN0bHkgb25jZSB3aGVuIGhvdmVyIGlzIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRsZXQgZGlkSGlkZUNvdW50ID0gMDtcblxuXHRcdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6ICdUZXN0Jyxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRvbkRpZEhpZGU6ICgpID0+IHsgZGlkSGlkZUNvdW50Kys7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soaG92ZXIpO1xuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkSGlkZUNvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjYWxsIG9uRGlkSGlkZSB3aGVuIGhvdmVyIGlzIGhpZGRlbiBkdXJpbmcgb25EaWRTaG93JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0aG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiAnVGVzdCcsXG5cdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0b25EaWRTaG93OiAoKSA9PiB7XG5cdFx0XHRcdFx0Y2FsbHMucHVzaCgnc2hvdycpO1xuXHRcdFx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRGlkSGlkZTogKCkgPT4geyBjYWxscy5wdXNoKCdoaWRlJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbJ3Nob3cnLCAnaGlkZSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZWR1cGxpY2F0ZSBob3ZlcnMgYnkgaWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblxuXHRcdFx0Y29uc3QgaG92ZXIxID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiAnU2FtZSBjb250ZW50Jyxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRpZDogJ3NhbWUtaWQnXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaG92ZXIyID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiAnU2FtZSBjb250ZW50Jyxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRpZDogJ3NhbWUtaWQnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGhvdmVyMSwgJ0ZpcnN0IGhvdmVyIHNob3VsZCBiZSBjcmVhdGVkJyk7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlcjEsICdGaXJzdCBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIyLCB1bmRlZmluZWQsICdTZWNvbmQgaG92ZXIgd2l0aCBzYW1lIGlkIHNob3VsZCBub3QgYmUgY3JlYXRlZCcpO1xuXG5cdFx0XHQvLyBEaWZmZXJlbnQgaWQgc2hvdWxkIGNyZWF0ZSBuZXcgaG92ZXJcblx0XHRcdGNvbnN0IGhvdmVyMyA9IGhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0Y29udGVudDogJ0NvbnRlbnQgMycsXG5cdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0aWQ6ICdkaWZmZXJlbnQtaWQnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGhvdmVyMywgJ0hvdmVyIHdpdGggZGlmZmVyZW50IGlkIHNob3VsZCBiZSBjcmVhdGVkJyk7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlcjMsICdUaGlyZCBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdGhvdmVyMT8uZGlzcG9zZSgpO1xuXHRcdFx0aG92ZXIzPy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYXBwbHkgYWRkaXRpb25hbCBjbGFzc2VzIHRvIGhvdmVyIERPTScsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvdmVyID0gc2hvd0hvdmVyKCdUZXN0JywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGFkZGl0aW9uYWxDbGFzc2VzOiBbJ2N1c3RvbS1jbGFzcy0xJywgJ2N1c3RvbS1jbGFzcy0yJ11cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBkb21Ob2RlID0gYXNIb3ZlcldpZGdldChob3ZlcikuZG9tTm9kZTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGJlIGluIERPTScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjdXN0b20tY2xhc3MtMScpLCAnU2hvdWxkIGhhdmUgY3VzdG9tLWNsYXNzLTEnKTtcblx0XHRcdGFzc2VydC5vayhkb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY3VzdG9tLWNsYXNzLTInKSwgJ1Nob3VsZCBoYXZlIGN1c3RvbS1jbGFzcy0yJyk7XG5cblx0XHRcdGhvdmVyLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydE5vdEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00gYWZ0ZXIgZGlzcG9zZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaGlkZUhvdmVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBoaWRlIG5vbi1sb2NrZWQgaG92ZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob3ZlciA9IHNob3dIb3ZlcignVGVzdCcpO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgaW4gRE9NIGluaXRpYWxseScpO1xuXG5cdFx0XHRob3ZlclNlcnZpY2UuaGlkZUhvdmVyKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3Zlci5pc0Rpc3Bvc2VkLCB0cnVlLCAnSG92ZXIgc2hvdWxkIGJlIGRpc3Bvc2VkIGFmdGVyIGhpZGVIb3ZlcicpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSBhZnRlciBoaWRlSG92ZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgaGlkZSBsb2NrZWQgaG92ZXIgd2l0aG91dCBmb3JjZSBmbGFnJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBzaG93SG92ZXIoJ1Rlc3QnLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0cGVyc2lzdGVuY2U6IHsgc3RpY2t5OiB0cnVlIH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdMb2NrZWQgaG92ZXIgc2hvdWxkIGJlIGluIERPTScpO1xuXG5cdFx0XHRob3ZlclNlcnZpY2UuaGlkZUhvdmVyKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIuaXNEaXNwb3NlZCwgZmFsc2UsICdMb2NrZWQgaG92ZXIgc2hvdWxkIG5vdCBiZSBkaXNwb3NlZCB3aXRob3V0IGZvcmNlJyk7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0xvY2tlZCBob3ZlciBzaG91bGQgcmVtYWluIGluIERPTScpO1xuXG5cdFx0XHRob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLmlzRGlzcG9zZWQsIHRydWUsICdMb2NrZWQgaG92ZXIgc2hvdWxkIGJlIGRpc3Bvc2VkIHdpdGggZm9yY2U9dHJ1ZScpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdMb2NrZWQgaG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00gd2l0aCBmb3JjZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbmVzdGVkIGhvdmVycycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQga2VlcCBwYXJlbnQgaG92ZXIgdmlzaWJsZSB3aGVuIG5lc3RlZCBob3ZlciBpcyBjcmVhdGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50SG92ZXIgPSBzaG93SG92ZXIoJ1BhcmVudCcpO1xuXHRcdFx0YXNzZXJ0SW5ET00ocGFyZW50SG92ZXIsICdQYXJlbnQgaG92ZXIgc2hvdWxkIGJlIGluIERPTScpO1xuXG5cdFx0XHRjb25zdCBuZXN0ZWRIb3ZlciA9IGNyZWF0ZU5lc3RlZEhvdmVyKHBhcmVudEhvdmVyLCAnTmVzdGVkJyk7XG5cdFx0XHRhc3NlcnRJbkRPTShuZXN0ZWRIb3ZlciwgJ05lc3RlZCBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cdFx0XHRhc3NlcnRJbkRPTShwYXJlbnRIb3ZlciwgJ1BhcmVudCBob3ZlciBzaG91bGQgc3RpbGwgYmUgaW4gRE9NIGFmdGVyIG5lc3RlZCBob3ZlciBjcmVhdGVkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJlbnRIb3Zlci5pc0Rpc3Bvc2VkLCBmYWxzZSwgJ1BhcmVudCBob3ZlciBzaG91bGQgcmVtYWluIHZpc2libGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXN0ZWRIb3Zlci5pc0Rpc3Bvc2VkLCBmYWxzZSwgJ05lc3RlZCBob3ZlciBzaG91bGQgYmUgdmlzaWJsZScpO1xuXG5cdFx0XHRuZXN0ZWRIb3Zlci5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnROb3RJbkRPTShuZXN0ZWRIb3ZlciwgJ05lc3RlZCBob3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0XHRhc3NlcnRJbkRPTShwYXJlbnRIb3ZlciwgJ1BhcmVudCBob3ZlciBzaG91bGQgcmVtYWluIGluIERPTSBhZnRlciBuZXN0ZWQgaXMgZGlzcG9zZWQnKTtcblxuXHRcdFx0cGFyZW50SG92ZXIuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00ocGFyZW50SG92ZXIsICdQYXJlbnQgaG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00gYWZ0ZXIgZGlzcG9zZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc3Bvc2UgbmVzdGVkIGhvdmVyIHdoZW4gcGFyZW50IGlzIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50SG92ZXIgPSBzaG93SG92ZXIoJ1BhcmVudCcpO1xuXHRcdFx0Y29uc3QgbmVzdGVkSG92ZXIgPSBjcmVhdGVOZXN0ZWRIb3ZlcihwYXJlbnRIb3ZlciwgJ05lc3RlZCcpO1xuXG5cdFx0XHRhc3NlcnRJbkRPTShwYXJlbnRIb3ZlciwgJ1BhcmVudCBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cdFx0XHRhc3NlcnRJbkRPTShuZXN0ZWRIb3ZlciwgJ05lc3RlZCBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdHBhcmVudEhvdmVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5lc3RlZEhvdmVyLmlzRGlzcG9zZWQsIHRydWUsICdOZXN0ZWQgaG92ZXIgc2hvdWxkIGJlIGRpc3Bvc2VkIHdoZW4gcGFyZW50IGlzIGRpc3Bvc2VkJyk7XG5cdFx0XHRhc3NlcnROb3RJbkRPTShwYXJlbnRIb3ZlciwgJ1BhcmVudCBob3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTScpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00obmVzdGVkSG92ZXIsICdOZXN0ZWQgaG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00gd2hlbiBwYXJlbnQgaXMgZGlzcG9zZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkaXNwb3NlIGVudGlyZSBob3ZlciBjaGFpbiB3aGVuIHJvb3QgaXMgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob3ZlcnMgPSBjcmVhdGVIb3ZlckNoYWluKDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVycy5sZW5ndGgsIDMsICdTaG91bGQgY3JlYXRlIDMgaG92ZXJzJyk7XG5cblx0XHRcdC8vIFZlcmlmeSBhbGwgaG92ZXJzIGFyZSBpbiBET01cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaG92ZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGFzc2VydC5vayhtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoaG92ZXJzW2ldLmRvbU5vZGUpLCBgSG92ZXIgJHtpICsgMX0gc2hvdWxkIGJlIGluIERPTWApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEaXNwb3NlIHRoZSByb290IGhvdmVyXG5cdFx0XHRob3ZlcnNbMF0uZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyBBbGwgaG92ZXJzIGluIHRoZSBjaGFpbiBzaG91bGQgYmUgZGlzcG9zZWQgYW5kIHJlbW92ZWQgZnJvbSBET01cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaG92ZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnNbaV0uaXNEaXNwb3NlZCwgdHJ1ZSwgYEhvdmVyICR7aSArIDF9IHNob3VsZCBiZSBkaXNwb3NlZGApO1xuXHRcdFx0XHRhc3NlcnQub2soIW1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhob3ZlcnNbaV0uZG9tTm9kZSksIGBIb3ZlciAke2kgKyAxfSBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc3Bvc2Ugb25seSBuZXN0ZWQgaG92ZXJzIHdoZW4gbWlkZGxlIGhvdmVyIGlzIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG92ZXJzID0gY3JlYXRlSG92ZXJDaGFpbigzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnMubGVuZ3RoLCAzLCAnU2hvdWxkIGNyZWF0ZSAzIGhvdmVycycpO1xuXG5cdFx0XHQvLyBWZXJpZnkgYWxsIGhvdmVycyBhcmUgaW4gRE9NXG5cdFx0XHRmb3IgKGNvbnN0IGggb2YgaG92ZXJzKSB7XG5cdFx0XHRcdGFzc2VydC5vayhtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoaC5kb21Ob2RlKSwgJ0FsbCBob3ZlcnMgc2hvdWxkIGJlIGluIERPTSBpbml0aWFsbHknKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGlzcG9zZSB0aGUgbWlkZGxlIGhvdmVyXG5cdFx0XHRob3ZlcnNbMV0uZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzWzBdLmlzRGlzcG9zZWQsIGZhbHNlLCAnUm9vdCBob3ZlciBzaG91bGQgcmVtYWluJyk7XG5cdFx0XHRhc3NlcnQub2sobWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmNvbnRhaW5zKGhvdmVyc1swXS5kb21Ob2RlKSwgJ1Jvb3QgaG92ZXIgc2hvdWxkIHJlbWFpbiBpbiBET00nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyc1sxXS5pc0Rpc3Bvc2VkLCB0cnVlLCAnTWlkZGxlIGhvdmVyIHNob3VsZCBiZSBkaXNwb3NlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoaG92ZXJzWzFdLmRvbU5vZGUpLCAnTWlkZGxlIGhvdmVyIHNob3VsZCBiZSByZW1vdmVkIGZyb20gRE9NJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnNbMl0uaXNEaXNwb3NlZCwgdHJ1ZSwgJ0lubmVybW9zdCBob3ZlciBzaG91bGQgYmUgZGlzcG9zZWQnKTtcblx0XHRcdGFzc2VydC5vayghbWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmNvbnRhaW5zKGhvdmVyc1syXS5kb21Ob2RlKSwgJ0lubmVybW9zdCBob3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTScpO1xuXG5cdFx0XHRob3ZlcnNbMF0uZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGVuZm9yY2UgbWF4aW11bSBuZXN0aW5nIGRlcHRoJywgKCkgPT4ge1xuXHRcdFx0Ly8gQ3JlYXRlIGhvdmVycyB1cCB0byB0aGUgbWF4IGRlcHRoICgzKVxuXHRcdFx0Y29uc3QgaG92ZXJzID0gY3JlYXRlSG92ZXJDaGFpbigzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnMubGVuZ3RoLCAzLCAnU2hvdWxkIGNyZWF0ZSBleGFjdGx5IDMgaG92ZXJzIChtYXggZGVwdGgpJyk7XG5cblx0XHRcdC8vIFZlcmlmeSBhbGwgMyBob3ZlcnMgYXJlIGluIERPTVxuXHRcdFx0Zm9yIChjb25zdCBoIG9mIGhvdmVycykge1xuXHRcdFx0XHRhc3NlcnQub2sobWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmNvbnRhaW5zKGguZG9tTm9kZSksICdIb3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRyeSB0byBjcmVhdGUgYSA0dGggbmVzdGVkIGhvdmVyIC0gc2hvdWxkIGZhaWxcblx0XHRcdGNvbnN0IG5lc3RlZFRhcmdldCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0aG92ZXJzWzJdLmRvbU5vZGUuYXBwZW5kQ2hpbGQobmVzdGVkVGFyZ2V0KTtcblx0XHRcdGNvbnN0IGZvdXJ0aEhvdmVyID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiAnSG92ZXIgNCcsXG5cdFx0XHRcdHRhcmdldDogbmVzdGVkVGFyZ2V0XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdXJ0aEhvdmVyLCB1bmRlZmluZWQsICdGb3VydGggaG92ZXIgc2hvdWxkIG5vdCBiZSBjcmVhdGVkIGR1ZSB0byBtYXggbmVzdGluZyBkZXB0aCcpO1xuXG5cdFx0XHRkaXNwb3NlSG92ZXJzKGhvdmVycyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYWxsb3cgbmV3IGhvdmVyIGNoYWluIGFmdGVyIGRpc3Bvc2luZyBwcmV2aW91cyBjaGFpbicsICgpID0+IHtcblx0XHRcdC8vIENyZWF0ZSBhbmQgZGlzcG9zZSBhIGNoYWluXG5cdFx0XHRjb25zdCBmaXJzdENoYWluID0gY3JlYXRlSG92ZXJDaGFpbigzKTtcblx0XHRcdGZvciAoY29uc3QgaCBvZiBmaXJzdENoYWluKSB7XG5cdFx0XHRcdGFzc2VydC5vayhtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoaC5kb21Ob2RlKSwgJ0ZpcnN0IGNoYWluIGhvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2VIb3ZlcnMoZmlyc3RDaGFpbik7XG5cdFx0XHRmb3IgKGNvbnN0IGggb2YgZmlyc3RDaGFpbikge1xuXHRcdFx0XHRhc3NlcnQub2soIW1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhoLmRvbU5vZGUpLCAnRmlyc3QgY2hhaW4gaG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hvdWxkIGJlIGFibGUgdG8gY3JlYXRlIGEgbmV3IGNoYWluXG5cdFx0XHRjb25zdCBzZWNvbmRDaGFpbiA9IGNyZWF0ZUhvdmVyQ2hhaW4oMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kQ2hhaW4ubGVuZ3RoLCAzLCAnU2hvdWxkIGNyZWF0ZSBuZXcgY2hhaW4gYWZ0ZXIgZGlzcG9zaW5nIHByZXZpb3VzJyk7XG5cdFx0XHRmb3IgKGNvbnN0IGggb2Ygc2Vjb25kQ2hhaW4pIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhoLmRvbU5vZGUpLCAnU2Vjb25kIGNoYWluIGhvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblx0XHRcdH1cblxuXHRcdFx0ZGlzcG9zZUhvdmVycyhzZWNvbmRDaGFpbik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoaWRlSG92ZXIgc2hvdWxkIGNsb3NlIGlubmVybW9zdCBob3ZlciBmaXJzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvdmVycyA9IGNyZWF0ZUhvdmVyQ2hhaW4oMik7XG5cblx0XHRcdC8vIFZlcmlmeSBib3RoIGFyZSBpbiBET01cblx0XHRcdGFzc2VydC5vayhtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoaG92ZXJzWzBdLmRvbU5vZGUpLCAnT3V0ZXIgaG92ZXIgc2hvdWxkIGJlIGluIERPTScpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhob3ZlcnNbMV0uZG9tTm9kZSksICdJbm5lciBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIoKTtcblxuXHRcdFx0Ly8gSW5uZXJtb3N0IGhvdmVyIHNob3VsZCBiZSBkaXNwb3NlZCBhbmQgcmVtb3ZlZCBmcm9tIERPTVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyc1sxXS5pc0Rpc3Bvc2VkLCB0cnVlLCAnSW5uZXJtb3N0IGhvdmVyIHNob3VsZCBiZSBkaXNwb3NlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoaG92ZXJzWzFdLmRvbU5vZGUpLCAnSW5uZXJtb3N0IGhvdmVyIHNob3VsZCBiZSByZW1vdmVkIGZyb20gRE9NJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzWzBdLmlzRGlzcG9zZWQsIGZhbHNlLCAnT3V0ZXIgaG92ZXIgc2hvdWxkIHJlbWFpbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhob3ZlcnNbMF0uZG9tTm9kZSksICdPdXRlciBob3ZlciBzaG91bGQgcmVtYWluIGluIERPTScpO1xuXG5cdFx0XHRob3ZlclNlcnZpY2UuaGlkZUhvdmVyKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnNbMF0uaXNEaXNwb3NlZCwgdHJ1ZSwgJ091dGVyIGhvdmVyIHNob3VsZCBiZSBkaXNwb3NlZCBvbiBzZWNvbmQgY2FsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoaG92ZXJzWzBdLmRvbU5vZGUpLCAnT3V0ZXIgaG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NldHVwRGVsYXllZEhvdmVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBldmFsdWF0ZSBmdW5jdGlvbiBvcHRpb25zIG9uIG1vdXNlb3ZlcicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRsZXQgY2FsbENvdW50ID0gMDtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0YXJnZXQsICgpID0+IHtcblx0XHRcdFx0Y2FsbENvdW50Kys7XG5cdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IGBDYWxsICR7Y2FsbENvdW50fWAgfTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBGaXJzdCBtb3VzZW92ZXJcblx0XHRcdHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZW92ZXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMSwgJ09wdGlvbnMgZnVuY3Rpb24gc2hvdWxkIGJlIGNhbGxlZCBvbiBmaXJzdCBtb3VzZW92ZXInKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cblx0XHRcdC8vIFNlY29uZCBtb3VzZW92ZXIgc2hvdWxkIGNhbGwgZnVuY3Rpb24gYWdhaW5cblx0XHRcdHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZW92ZXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMiwgJ09wdGlvbnMgZnVuY3Rpb24gc2hvdWxkIGJlIGNhbGxlZCBvbiBzZWNvbmQgbW91c2VvdmVyJyk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBjYWxsIG9uRGlkSGlkZSB3aGVuIGRlbGF5ZWQgaG92ZXIgaXMgbmV2ZXIgc2hvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGxldCBkaWRIaWRlQ291bnQgPSAwO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRhcmdldCwge1xuXHRcdFx0XHRjb250ZW50OiAnVGVzdCcsXG5cdFx0XHRcdG9uRGlkSGlkZTogKCkgPT4geyBkaWRIaWRlQ291bnQrKzsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkSGlkZUNvdW50LCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgcmVkdWNlZCBkZWxheSB3aGVuIHJlZHVjZWREZWxheSBpcyB0cnVlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblxuXHRcdFx0Ly8gQ29uZmlndXJlIHJlZHVjZWREZWxheSB0byAxNTBtcyBmb3IgdGhpcyB0ZXN0XG5cdFx0XHQoaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKS5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmhvdmVyLnJlZHVjZWREZWxheScsIDE1MCk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGFyZ2V0LCB7IGNvbnRlbnQ6ICdSZWR1Y2VkIGRlbGF5JyB9LCB7IHJlZHVjZWREZWxheTogdHJ1ZSB9KTtcblxuXHRcdFx0Ly8gVHJpZ2dlciBtb3VzZW92ZXJcblx0XHRcdHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZW92ZXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0XHQvLyBIb3ZlciBzaG91bGQgbm90IGJlIHZpc2libGUgYmVmb3JlIGRlbGF5XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDc1KTtcblx0XHRcdGNvbnN0IGhvdmVyc0JlZm9yZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1ob3ZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyc0JlZm9yZS5sZW5ndGgsIDAsICdIb3ZlciBzaG91bGQgbm90IGJlIHZpc2libGUgYmVmb3JlIGRlbGF5IGNvbXBsZXRlcycpO1xuXG5cdFx0XHQvLyBIb3ZlciBzaG91bGQgYmUgdmlzaWJsZSBhZnRlciBkZWxheVxuXHRcdFx0YXdhaXQgdGltZW91dCgxNTApO1xuXHRcdFx0Y29uc3QgaG92ZXJzQWZ0ZXIgPSBtYWluV2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28taG92ZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnNBZnRlci5sZW5ndGgsIDEsICdIb3ZlciBzaG91bGQgYmUgdmlzaWJsZSBhZnRlciByZWR1Y2VkIGRlbGF5Jyk7XG5cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0aG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHR9KSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZXR1cE1hbmFnZWRIb3ZlcicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgdXNlIG5hdGl2ZSB0aXRsZSBhdHRyaWJ1dGUgd2hlbiBzaG93TmF0aXZlSG92ZXIgaXMgdHJ1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoXG5cdFx0XHRcdHsgc2hvd0hvdmVyOiAoKSA9PiB1bmRlZmluZWQsIGRlbGF5OiAwLCBzaG93TmF0aXZlSG92ZXI6IHRydWUgfSxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHQnTmF0aXZlIGhvdmVyIGNvbnRlbnQnXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmdldEF0dHJpYnV0ZSgndGl0bGUnKSwgJ05hdGl2ZSBob3ZlciBjb250ZW50Jyk7XG5cblx0XHRcdGhvdmVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJyksIG51bGwsICdUaXRsZSBzaG91bGQgYmUgcmVtb3ZlZCBvbiBkaXNwb3NlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXBkYXRlIGNvbnRlbnQgZHluYW1pY2FsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKFxuXHRcdFx0XHR7IHNob3dIb3ZlcjogKCkgPT4gdW5kZWZpbmVkLCBkZWxheTogMCwgc2hvd05hdGl2ZUhvdmVyOiB0cnVlIH0sXG5cdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0J0luaXRpYWwnXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmdldEF0dHJpYnV0ZSgndGl0bGUnKSwgJ0luaXRpYWwnKTtcblxuXHRcdFx0YXdhaXQgaG92ZXIudXBkYXRlKCdVcGRhdGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmdldEF0dHJpYnV0ZSgndGl0bGUnKSwgJ1VwZGF0ZWQnKTtcblxuXHRcdFx0YXdhaXQgaG92ZXIudXBkYXRlKCdGaW5hbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJyksICdGaW5hbCcpO1xuXG5cdFx0XHRob3Zlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJlLXNob3cgaG92ZXIgb24gZm9jdXMgd2hlbiByZWxhdGVkVGFyZ2V0IGlzIGZyb20gYSBkaXNtaXNzZWQgaG92ZXInLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0Y29uc3QgZGVsZWdhdGUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSwgJ2VsZW1lbnQnLCB1bmRlZmluZWQsIHt9KSk7XG5cdFx0XHRzdG9yZS5hZGQoaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGRlbGVnYXRlLCB0YXJnZXQsICdUZXN0JykpO1xuXG5cdFx0XHQvLyBTaG93IGhvdmVyIGV4cGxpY2l0bHlcblx0XHRcdHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBGb2N1c0V2ZW50KCdmb2N1cycsIHsgYnViYmxlczogdHJ1ZSwgcmVsYXRlZFRhcmdldDogZG9jdW1lbnQuYm9keSB9KSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cdFx0XHRjb25zdCBob3ZlcnNCZWZvcmUgPSBmaXh0dXJlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28taG92ZXInKTtcblx0XHRcdGFzc2VydC5vayhob3ZlcnNCZWZvcmUubGVuZ3RoID4gMCwgJ0hvdmVyIHNob3VsZCBiZSB2aXNpYmxlIGFmdGVyIGZvY3VzJyk7XG5cblx0XHRcdC8vIERpc21pc3MgdmlhIGhvdmVyU2VydmljZSAoc2ltdWxhdGVzIEVzYyAvIGV4dGVybmFsIGRpc21pc3NhbClcblx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBmb2N1cyByZXR1cm5pbmcgZnJvbSB0aGUgaG92ZXIgZWxlbWVudFxuXHRcdFx0Y29uc3QgaG92ZXJFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRob3ZlckVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLWhvdmVyJyk7XG5cdFx0XHR0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgRm9jdXNFdmVudCgnZm9jdXMnLCB7IGJ1YmJsZXM6IHRydWUsIHJlbGF0ZWRUYXJnZXQ6IGhvdmVyRWxlbWVudCB9KSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cblx0XHRcdGNvbnN0IGhvdmVyc0FmdGVyID0gZml4dHVyZS5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWhvdmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzQWZ0ZXIubGVuZ3RoLCAwLCAnSG92ZXIgc2hvdWxkIG5vdCByZS1zaG93IHdoZW4gZm9jdXMgY29tZXMgZnJvbSBkaXNtaXNzZWQgaG92ZXInKTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJlLXNob3cgaG92ZXIgb24gZm9jdXMgd2hlbiByZWxhdGVkVGFyZ2V0IGlzIG51bGwgKHdpbmRvdyByZWFjdGl2YXRpb24pJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGNvbnN0IGRlbGVnYXRlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUsICdlbGVtZW50JywgdW5kZWZpbmVkLCB7fSkpO1xuXHRcdFx0c3RvcmUuYWRkKGhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihkZWxlZ2F0ZSwgdGFyZ2V0LCAnVGVzdCcpKTtcblxuXHRcdFx0Ly8gU2hvdyBob3ZlciB2aWEgZm9jdXMgYW5kIGRpc21pc3MgZXh0ZXJuYWxseVxuXHRcdFx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2ZvY3VzJywgeyBidWJibGVzOiB0cnVlLCByZWxhdGVkVGFyZ2V0OiBkb2N1bWVudC5ib2R5IH0pKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwKTtcblx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBmb2N1cyBmcm9tIHdpbmRvdyByZWFjdGl2YXRpb24gKHJlbGF0ZWRUYXJnZXQgaXMgbnVsbClcblx0XHRcdHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBGb2N1c0V2ZW50KCdmb2N1cycsIHsgYnViYmxlczogdHJ1ZSwgcmVsYXRlZFRhcmdldDogbnVsbCB9KSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cblx0XHRcdGNvbnN0IGhvdmVycyA9IGZpeHR1cmUucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1ob3ZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVycy5sZW5ndGgsIDAsICdIb3ZlciBzaG91bGQgbm90IHJlLXNob3cgb24gd2luZG93IHJlYWN0aXZhdGlvbicpO1xuXHRcdH0pKTtcblx0fSk7XG5cblx0c3VpdGUoJ3Nob3dEZWxheWVkSG92ZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJlamVjdCBob3ZlciB3aGVuIGN1cnJlbnQgaG92ZXIgaXMgbG9ja2VkIGFuZCB0YXJnZXQgaXMgb3V0c2lkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvY2tlZEhvdmVyID0gc2hvd0hvdmVyKCdMb2NrZWQnLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0cGVyc2lzdGVuY2U6IHsgc3RpY2t5OiB0cnVlIH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0SW5ET00obG9ja2VkSG92ZXIsICdMb2NrZWQgaG92ZXIgc2hvdWxkIGJlIGluIERPTScpO1xuXG5cdFx0XHRjb25zdCBvdGhlclRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0Y29uc3QgcmVqZWN0ZWRIb3ZlciA9IGhvdmVyU2VydmljZS5zaG93RGVsYXllZEhvdmVyKHtcblx0XHRcdFx0Y29udGVudDogJ1Nob3VsZCBub3Qgc2hvdycsXG5cdFx0XHRcdHRhcmdldDogb3RoZXJUYXJnZXRcblx0XHRcdH0sIHt9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlamVjdGVkSG92ZXIsIHVuZGVmaW5lZCwgJ1Nob3VsZCByZWplY3QgaG92ZXIgd2hlbiBsb2NrZWQgaG92ZXIgZXhpc3RzJyk7XG5cdFx0XHRhc3NlcnRJbkRPTShsb2NrZWRIb3ZlciwgJ0xvY2tlZCBob3ZlciBzaG91bGQgcmVtYWluIGluIERPTSBhZnRlciByZWplY3Rpb24nKTtcblxuXHRcdFx0bG9ja2VkSG92ZXIuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00obG9ja2VkSG92ZXIsICdMb2NrZWQgaG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00gYWZ0ZXIgZGlzcG9zZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSByZWR1Y2VkIGRlbGF5IHdoZW4gcmVkdWNlZERlbGF5IGlzIHRydWUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0Y29uc3QgcmVkdWNlZERlbGF5ID0gMTAwO1xuXG5cdFx0XHQvLyBDb25maWd1cmUgcmVkdWNlZERlbGF5IHNldHRpbmcgZm9yIHRoaXMgdGVzdFxuXHRcdFx0KGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpIGFzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSkuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5ob3Zlci5yZWR1Y2VkRGVsYXknLCByZWR1Y2VkRGVsYXkpO1xuXG5cdFx0XHRjb25zdCBob3ZlciA9IGhvdmVyU2VydmljZS5zaG93RGVsYXllZEhvdmVyKHtcblx0XHRcdFx0Y29udGVudDogJ1JlZHVjZWQgZGVsYXkgaG92ZXInLFxuXHRcdFx0XHR0YXJnZXRcblx0XHRcdH0sIHsgcmVkdWNlZERlbGF5OiB0cnVlIH0pO1xuXG5cdFx0XHRhc3NlcnQub2soaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgY3JlYXRlZCcpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgbm90IGJlIHZpc2libGUgaW1tZWRpYXRlbHknKTtcblxuXHRcdFx0Ly8gV2FpdCBsZXNzIHRoYW4gcmVkdWNlZCBkZWxheSAtIGhvdmVyIHNob3VsZCBzdGlsbCBub3QgYmUgdmlzaWJsZVxuXHRcdFx0YXdhaXQgdGltZW91dChyZWR1Y2VkRGVsYXkgLyAyKTtcblx0XHRcdGFzc2VydE5vdEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIG5vdCBiZSB2aXNpYmxlIGJlZm9yZSBkZWxheSBjb21wbGV0ZXMnKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgZnVsbCBkZWxheSAtIGhvdmVyIHNob3VsZCBub3cgYmUgdmlzaWJsZVxuXHRcdFx0YXdhaXQgdGltZW91dChyZWR1Y2VkRGVsYXkpO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgdmlzaWJsZSBhZnRlciByZWR1Y2VkIGRlbGF5Jyk7XG5cblx0XHRcdGhvdmVyLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGRlZmF1bHQgZGVsYXkgd2hlbiBjdXN0b20gZGVsYXkgaXMgdW5kZWZpbmVkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdC8vIERlZmF1bHQgZGVsYXkgaXMgc2V0IHRvIDAgaW4gdGVzdCBzZXR1cFxuXHRcdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2hvd0RlbGF5ZWRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6ICdEZWZhdWx0IGRlbGF5IGhvdmVyJyxcblx0XHRcdFx0dGFyZ2V0XG5cdFx0XHR9LCB7fSk7XG5cblx0XHRcdGFzc2VydC5vayhob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSBjcmVhdGVkJyk7XG5cblx0XHRcdC8vIFNpbmNlIGRlZmF1bHQgZGVsYXkgaXMgMCBpbiB0ZXN0cywgaG92ZXIgc2hvdWxkIGFwcGVhciBhZnRlciBtaW5pbWFsIHRpbWVvdXRcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSB2aXNpYmxlIHdpdGggZGVmYXVsdCBkZWxheScpO1xuXG5cdFx0XHRob3Zlci5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHR9KTtcblxuXHRzdWl0ZSgnaG92ZXIgbG9ja2luZycsICgpID0+IHtcblx0XHR0ZXN0KCdpc0xvY2tlZCBzaG91bGQgYmUgc2V0dGFibGUgb24gaG92ZXIgd2lkZ2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBzaG93SG92ZXIoJ1Rlc3QnKTtcblx0XHRcdGNvbnN0IHdpZGdldCA9IGFzSG92ZXJXaWRnZXQoaG92ZXIpO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuaXNMb2NrZWQsIGZhbHNlLCAnU2hvdWxkIG5vdCBiZSBsb2NrZWQgaW5pdGlhbGx5Jyk7XG5cblx0XHRcdHdpZGdldC5pc0xvY2tlZCA9IHRydWU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmlzTG9ja2VkLCB0cnVlLCAnU2hvdWxkIGJlIGxvY2tlZCBhZnRlciBzZXR0aW5nJyk7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCByZW1haW4gaW4gRE9NIGFmdGVyIGxvY2tpbmcnKTtcblxuXHRcdFx0d2lkZ2V0LmlzTG9ja2VkID0gZmFsc2U7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmlzTG9ja2VkLCBmYWxzZSwgJ1Nob3VsZCBiZSB1bmxvY2tlZCBhZnRlciB1bnNldHRpbmcnKTtcblxuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdGlja3kgb3B0aW9uIHNob3VsZCBzZXQgaXNMb2NrZWQgdG8gdHJ1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvdmVyID0gc2hvd0hvdmVyKCdUZXN0JywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHBlcnNpc3RlbmNlOiB7IHN0aWNreTogdHJ1ZSB9XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnU3RpY2t5IGhvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFzSG92ZXJXaWRnZXQoaG92ZXIpLmlzTG9ja2VkLCB0cnVlLCAnU2hvdWxkIGJlIGxvY2tlZCB3aGVuIHN0aWNreScpO1xuXG5cdFx0XHRob3Zlci5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnROb3RJbkRPTShob3ZlciwgJ1N0aWNreSBob3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaG93QW5kRm9jdXNMYXN0SG92ZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJlY3JlYXRlIGxhc3QgZGlzcG9zZWQgaG92ZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiAnUmVtZW1iZXIgbWUnLFxuXHRcdFx0XHR0YXJnZXRcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGhvdmVyKTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnSW5pdGlhbCBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdGhvdmVyLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydE5vdEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00gYWZ0ZXIgZGlzcG9zZScpO1xuXG5cdFx0XHQvLyBTaG91bGQgcmVjcmVhdGUgdGhlIGhvdmVyIC0gdmVyaWZ5IGEgbmV3IGhvdmVyIGlzIHNob3duXG5cdFx0XHRob3ZlclNlcnZpY2Uuc2hvd0FuZEZvY3VzTGFzdEhvdmVyKCk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGVyZSBpcyBhIGhvdmVyIGluIHRoZSBET00gKGl0J3MgYSBuZXcgaG92ZXIgaW5zdGFuY2UpXG5cdFx0XHRjb25zdCBob3ZlckVsZW1lbnRzID0gbWFpbldpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWhvdmVyJyk7XG5cdFx0XHRhc3NlcnQub2soaG92ZXJFbGVtZW50cy5sZW5ndGggPiAwLCAnQSBob3ZlciBzaG91bGQgYmUgcmVjcmVhdGVkIGFuZCBpbiB0aGUgRE9NJyk7XG5cblx0XHRcdC8vIENsZWFuIHVwXG5cdFx0XHRob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXG5cdFx0XHQvLyBWZXJpZnkgY2xlYW51cFxuXHRcdFx0Y29uc3QgcmVtYWluaW5nSG92ZXJzID0gbWFpbldpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWhvdmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtYWluaW5nSG92ZXJzLmxlbmd0aCwgMCwgJ05vIGhvdmVycyBzaG91bGQgcmVtYWluIGluIERPTSBhZnRlciBjbGVhbnVwJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdsYXlvdXQgYW5kIHJlc2l6ZScsICgpID0+IHtcblx0XHR0ZXN0KCdsYXlvdXQgc2hvdWxkIHN1cHByZXNzIHBlbmRpbmcgbW91c2VvdXQgc28gY29udGVudCByZXNpemUgZG9lcyBub3QgZGlzbWlzcyBob3ZlcicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjb250ZW50LnRleHRDb250ZW50ID0gJ1Jlc2l6YWJsZSBjb250ZW50JztcblxuXHRcdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdHRhcmdldFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQub2soaG92ZXIpO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IGFzSG92ZXJXaWRnZXQoaG92ZXIpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBhIG1vdXNlbGVhdmUgb24gdGhlIGhvdmVyIGNvbnRhaW5lciAoYXMgaGFwcGVucyB3aGVuIGNvbnRlbnQgc2hyaW5rcylcblx0XHRcdHdpZGdldC5kb21Ob2RlLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlbGVhdmUnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0XHQvLyBCZWZvcmUgdGhlIGRlYm91bmNlIHRpbWVyIGZpcmVzLCB0cmlnZ2VyIGEgbGF5b3V0IChhcyBSZXNpemVPYnNlcnZlciB3b3VsZClcblx0XHRcdHdpZGdldC5sYXlvdXQoKTtcblxuXHRcdFx0Ly8gV2FpdCBsb25nZXIgdGhhbiB0aGUgQ29tcG9zaXRlTW91c2VUcmFja2VyIGRlYm91bmNlICgyMDBtcylcblx0XHRcdGF3YWl0IHRpbWVvdXQoMzAwKTtcblxuXHRcdFx0Ly8gVGhlIGhvdmVyIHNob3VsZCBzdGlsbCBiZSBpbiB0aGUgRE9NIGJlY2F1c2UgbGF5b3V0KCkgY2FuY2VsbGVkIHRoZSBwZW5kaW5nIG1vdXNlb3V0XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCByZW1haW4gaW4gRE9NIGFmdGVyIGxheW91dCBzdXBwcmVzc2VzIG1vdXNlb3V0Jyk7XG5cblx0XHRcdGhvdmVyLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydE5vdEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00gYWZ0ZXIgZGlzcG9zZScpO1xuXHRcdH0pKTtcblxuXHRcdHRlc3Quc2tpcCgnaG92ZXIgc2hvdWxkIHN0aWxsIGRpc21pc3Mgb24gbW91c2VvdXQgd2hlbiBubyBsYXlvdXQgb2NjdXJzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGNvbnRlbnQudGV4dENvbnRlbnQgPSAnQ29udGVudCc7XG5cblx0XHRcdGNvbnN0IGhvdmVyID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHR0YXJnZXRcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGhvdmVyKTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGJlIGluIERPTScpO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSBhc0hvdmVyV2lkZ2V0KGhvdmVyKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgYSBtb3VzZWxlYXZlIHdpdGhvdXQgYSBzdWJzZXF1ZW50IGxheW91dFxuXHRcdFx0d2lkZ2V0LmRvbU5vZGUuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VsZWF2ZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRcdC8vIFdhaXQgZm9yIHRoZSBkZWJvdW5jZSB0byBmaXJlXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDMwMCk7XG5cblx0XHRcdC8vIFdpdGhvdXQgbGF5b3V0IHN1cHByZXNzaW9uLCB0aGUgaG92ZXIgc2hvdWxkIGJlIGRpc21pc3NlZFxuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgZGlzbWlzc2VkIGFmdGVyIG1vdXNlb3V0IHdpdGhvdXQgbGF5b3V0Jyk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdC5za2lwKCdzdXBwcmVzc2lvbiBjbGVhcnMgYWZ0ZXIgbW91c2UgcmUtZW50ZXJzIGFuZCBhIG5ldyBtb3VzZWxlYXZlIGRpc21pc3NlcyBub3JtYWxseScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjb250ZW50LnRleHRDb250ZW50ID0gJ1Jlc2l6YWJsZSBjb250ZW50JztcblxuXHRcdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdHRhcmdldFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQub2soaG92ZXIpO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IGFzSG92ZXJXaWRnZXQoaG92ZXIpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBtb3VzZWxlYXZlICsgbGF5b3V0IHRvIHN1cHByZXNzXG5cdFx0XHR3aWRnZXQuZG9tTm9kZS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWxlYXZlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRcdHdpZGdldC5sYXlvdXQoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMzAwKTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIHJlbWFpbiBhZnRlciBzdXBwcmVzc2VkIG1vdXNlb3V0Jyk7XG5cblx0XHRcdC8vIE1vdXNlIHJlLWVudGVycywgY2xlYXJpbmcgdGhlIHN1cHByZXNzaW9uIGZsYWdcblx0XHRcdHdpZGdldC5kb21Ob2RlLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlb3ZlcicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRcdC8vIE1vdXNlIGxlYXZlcyBhZ2FpbiBcdTIwMTQgdGhpcyB0aW1lIG5vIGxheW91dCwgc28gaXQgc2hvdWxkIGRpc21pc3Ncblx0XHRcdHdpZGdldC5kb21Ob2RlLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlbGVhdmUnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgzMDApO1xuXG5cdFx0XHRhc3NlcnROb3RJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBkaXNtaXNzIG9uIG5vcm1hbCBtb3VzZW91dCBhZnRlciBzdXBwcmVzc2lvbiB3YXMgY2xlYXJlZCcpO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ2NsaWNraW5nIG91dHNpZGUgc2hvdWxkIGRpc21pc3Mgbm9uLXN0aWNreSBob3ZlcicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjb250ZW50LnRleHRDb250ZW50ID0gJ0NvbnRlbnQnO1xuXG5cdFx0XHRjb25zdCBob3ZlciA9IGhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0dGFyZ2V0XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5vayhob3Zlcik7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblxuXHRcdFx0Ly8gQ2xpY2sgb3V0c2lkZSB0aGUgaG92ZXJcblx0XHRcdGRvY3VtZW50LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRcdGFzc2VydE5vdEluRE9NKGhvdmVyLCAnTm9uLXN0aWNreSBob3ZlciBzaG91bGQgYmUgZGlzbWlzc2VkIGFmdGVyIGNsaWNraW5nIG91dHNpZGUnKTtcblx0XHR9KSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZ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
