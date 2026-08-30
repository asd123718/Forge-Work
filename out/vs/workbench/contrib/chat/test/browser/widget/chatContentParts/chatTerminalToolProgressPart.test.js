import assert from "assert";
import { importAMDNodeModule } from "../../../../../../../amdX.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../../../../base/common/async.js";
import { IAccessibleViewService } from "../../../../../../../platform/accessibility/browser/accessibleView.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { InlineTextModelCollection } from "../../../../browser/widget/chatContentParts/chatContentParts.js";
import { DiffEditorPool, EditorPool } from "../../../../browser/widget/chatContentParts/chatContentCodePools.js";
import { ChatTerminalThinkingCollapsibleWrapper, ChatTerminalToolOutputSection } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.js";
import { TerminalToolAutoExpand, TerminalToolAutoExpandTimeout } from "../../../../browser/widget/chatContentParts/toolInvocationParts/terminalToolAutoExpand.js";
import { ITerminalConfigurationService, ITerminalService } from "../../../../../terminal/browser/terminal.js";
import { createFakeDetachedTerminal } from "../../../../../terminal/test/browser/chatTerminalMirrorTestUtils.js";
suite("ChatTerminalToolProgressPart Auto-Expand Logic", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let onCommandExecuted;
  let onCommandFinished;
  let onWillData;
  let isExpanded;
  let userToggledOutput;
  let hasRealOutputValue;
  function shouldAutoExpand() {
    return !isExpanded && !userToggledOutput;
  }
  function hasRealOutput() {
    return hasRealOutputValue;
  }
  function setupAutoExpandLogic() {
    const autoExpand = store.add(new TerminalToolAutoExpand({
      onCommandExecuted: onCommandExecuted.event,
      onCommandFinished: onCommandFinished.event,
      onWillData: onWillData.event,
      shouldAutoExpand,
      hasRealOutput
    }));
    store.add(autoExpand.onDidRequestExpand(() => {
      isExpanded = true;
    }));
  }
  setup(() => {
    onCommandExecuted = store.add(new Emitter());
    onCommandFinished = store.add(new Emitter());
    onWillData = store.add(new Emitter());
    isExpanded = false;
    userToggledOutput = false;
    hasRealOutputValue = false;
  });
  suite("ChatTerminalThinkingCollapsibleWrapper", () => {
    test("animates terminal content and keeps collapsed content inert", () => {
      const context = {
        element: Object.assign(/* @__PURE__ */ Object.create(null), {
          id: "response",
          sessionResource: URI.parse("chat-session://test/session")
        }),
        elementIndex: 0,
        container: mainWindow.document.createElement("div"),
        content: [],
        contentIndex: 0,
        inlineTextModels: Object.create(InlineTextModelCollection.prototype),
        editorPool: Object.create(EditorPool.prototype),
        codeBlockStartIndex: 0,
        treeStartIndex: 0,
        diffEditorPool: Object.create(DiffEditorPool.prototype),
        currentWidth: observableValue("testWidth", 500),
        onDidChangeVisibility: Event.None
      };
      const terminalContent = mainWindow.document.createElement("div");
      terminalContent.textContent = "terminal output";
      const instantiationService = workbenchInstantiationService(void 0, store);
      const part = store.add(instantiationService.createInstance(
        ChatTerminalThinkingCollapsibleWrapper,
        "echo test",
        void 0,
        false,
        terminalContent,
        context,
        false,
        false,
        false,
        true,
        void 0
      ));
      mainWindow.document.body.appendChild(part.domNode);
      store.add(toDisposable(() => part.domNode.remove()));
      const button = part.domNode.querySelector(".monaco-button");
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      const animationContent = part.domNode.querySelector(".chat-collapsible-content-animation-inner");
      assert.ok(button);
      assert.ok(animationContainer);
      assert.ok(animationContent);
      const initiallyInert = animationContent.inert;
      button.click();
      assert.deepStrictEqual({
        hasAnimationClass: part.domNode.classList.contains("chat-collapsible-content-animated"),
        animationDisplay: mainWindow.getComputedStyle(animationContainer).display,
        initiallyInert,
        expandedInert: animationContent.inert,
        containsTerminal: animationContent.contains(terminalContent),
        hasShowLink: !!part.domNode.querySelector(".chat-terminal-show-link")
      }, {
        hasAnimationClass: true,
        animationDisplay: "grid",
        initiallyInert: true,
        expandedInert: false,
        containsTerminal: true,
        hasShowLink: false
      });
    });
  });
  test("fast command without data should not auto-expand (finishes before timeout)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onCommandFinished.fire(void 0);
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand for fast command without data");
  }));
  test("fast command with quick data should not auto-expand (data + finish before timeout)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("output");
    onCommandFinished.fire(void 0);
    await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand when command finishes within timeout of first data");
  }));
  test("long-running command with data should auto-expand (data received, command still running after timeout)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = true;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("output");
    await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);
    assert.strictEqual(isExpanded, true, "Should expand when command still running after first data timeout");
    onCommandFinished.fire(void 0);
  }));
  test("long-running command with data but no real output should NOT auto-expand (like sleep with shell sequences)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = false;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("shell-sequence");
    await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand when data is shell sequences, not real output");
    onCommandFinished.fire(void 0);
  }));
  test("long-running command without data should NOT auto-expand if no real output (like sleep)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = false;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand when no real output even after timeout");
    onCommandFinished.fire(void 0);
  }));
  test("long-running command without data SHOULD auto-expand if real output exists", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = true;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, true, "Should expand when real output exists after timeout");
    onCommandFinished.fire(void 0);
  }));
  test("data arriving after command finish should not trigger expand", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onCommandFinished.fire(void 0);
    onWillData.fire("late output");
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand when data arrives after command finished");
  }));
  test("user toggled output prevents auto-expand", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    userToggledOutput = true;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("output");
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand when user has manually toggled output");
    onCommandFinished.fire(void 0);
  }));
  test("already expanded output prevents additional auto-expand", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    isExpanded = true;
    let eventFired = false;
    const autoExpand = store.add(new TerminalToolAutoExpand({
      onCommandExecuted: onCommandExecuted.event,
      onCommandFinished: onCommandFinished.event,
      onWillData: onWillData.event,
      shouldAutoExpand: () => !isExpanded && !userToggledOutput,
      hasRealOutput: () => hasRealOutputValue
    }));
    store.add(autoExpand.onDidRequestExpand(() => {
      eventFired = true;
    }));
    onCommandExecuted.fire(void 0);
    onWillData.fire("output");
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(eventFired, false, "Should NOT fire expand event when already expanded");
    onCommandFinished.fire(void 0);
  }));
  test("data arriving cancels no-data timeout", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = true;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("output");
    onCommandFinished.fire(void 0);
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, false, "No-data timeout should be cancelled when data arrives");
  }));
  test("multiple data events only trigger one timeout", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = true;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("output 1");
    onWillData.fire("output 2");
    onWillData.fire("output 3");
    await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);
    assert.strictEqual(isExpanded, true, "Should expand exactly once after first data");
    onCommandFinished.fire(void 0);
  }));
});
suite("ChatTerminalToolOutputSection layout", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let XTermBaseCtor;
  let fakes;
  let mirrorFont;
  let container;
  setup(async () => {
    instantiationService = workbenchInstantiationService(void 0, store);
    XTermBaseCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    fakes = [];
    mirrorFont = { fontFamily: "monospace", fontSize: 12, letterSpacing: 0, lineHeight: 1, charWidth: 10, charHeight: 20 };
    instantiationService.stub(ITerminalService, {
      createDetachedTerminal: async (options) => {
        const fake = createFakeDetachedTerminal(XTermBaseCtor, options, mirrorFont);
        fakes.push(fake);
        return fake.instance;
      }
    });
    instantiationService.stub(ITerminalConfigurationService, {
      getFont: () => ({ fontFamily: "monospace", fontSize: 10, letterSpacing: 0, lineHeight: 1, charWidth: 6, charHeight: 10 })
    });
    instantiationService.stub(IAccessibleViewService, {
      getOpenAriaHint: () => null
    });
    container = mainWindow.document.createElement("div");
    container.style.width = "800px";
    mainWindow.document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
  });
  function createSection(output) {
    const section = store.add(instantiationService.createInstance(
      ChatTerminalToolOutputSection,
      async () => void 0,
      () => void 0,
      () => void 0,
      () => output,
      () => "echo test",
      () => void 0,
      () => false,
      false
    ));
    container.appendChild(section.domNode);
    return section;
  }
  function boxHeight(section) {
    const scrollable = section.domNode.querySelector(".monaco-scrollable-element");
    return scrollable?.style.height ?? "";
  }
  function expectedHeight(section, rows, rowHeight) {
    const body = section.domNode.querySelector(".chat-terminal-output-body");
    const style = mainWindow.getComputedStyle(body);
    const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    return `${rows * rowHeight + padding}px`;
  }
  test("box height uses the mirror row height, not the config estimate", async () => {
    const section = createSection({ text: "l1\r\nl2\r\nl3" });
    await section.toggle(true);
    assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 20));
  });
  test("falls back to the config-font estimate while mirror metrics are unavailable", async () => {
    mirrorFont = { ...mirrorFont, charHeight: 0 };
    const section = createSection({ text: "l1\r\nl2\r\nl3" });
    await section.toggle(true);
    assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 10));
  });
  test("relayouts when the mirror announces changed cell metrics", async () => {
    const section = createSection({ text: "l1\r\nl2\r\nl3" });
    await section.toggle(true);
    assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 20));
    mirrorFont.charHeight = 30;
    const fake = fakes[0];
    const renderFired = new Promise((resolve) => {
      const listener = fake.raw.onRender(() => {
        listener.dispose();
        resolve();
      });
    });
    const host = mainWindow.document.createElement("div");
    container.appendChild(host);
    fake.raw.open(host);
    await renderFired;
    assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 30));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2libGVWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIElubGluZVRleHRNb2RlbENvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvclBvb2wsIEVkaXRvclBvb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50Q29kZVBvb2xzLmpzJztcbmltcG9ydCB7IENoYXRUZXJtaW5hbFRoaW5raW5nQ29sbGFwc2libGVXcmFwcGVyLCBDaGF0VGVybWluYWxUb29sT3V0cHV0U2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0LmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xBdXRvRXhwYW5kLCBUZXJtaW5hbFRvb2xBdXRvRXhwYW5kVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy90ZXJtaW5hbFRvb2xBdXRvRXhwYW5kLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGVybWluYWxTZXJ2aWNlLCB0eXBlIElEZXRhY2hlZFhUZXJtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxGb250IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZha2VEZXRhY2hlZFRlcm1pbmFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVybWluYWwvdGVzdC9icm93c2VyL2NoYXRUZXJtaW5hbE1pcnJvclRlc3RVdGlscy5qcyc7XG5cbnN1aXRlKCdDaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0IEF1dG8tRXhwYW5kIExvZ2ljJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIE1vY2tlZCBldmVudHNcblx0bGV0IG9uQ29tbWFuZEV4ZWN1dGVkOiBFbWl0dGVyPHVua25vd24+O1xuXHRsZXQgb25Db21tYW5kRmluaXNoZWQ6IEVtaXR0ZXI8dW5rbm93bj47XG5cdGxldCBvbldpbGxEYXRhOiBFbWl0dGVyPHN0cmluZz47XG5cblx0Ly8gU3RhdGUgdHJhY2tpbmdcblx0bGV0IGlzRXhwYW5kZWQ6IGJvb2xlYW47XG5cdGxldCB1c2VyVG9nZ2xlZE91dHB1dDogYm9vbGVhbjtcblx0bGV0IGhhc1JlYWxPdXRwdXRWYWx1ZTogYm9vbGVhbjtcblxuXHRmdW5jdGlvbiBzaG91bGRBdXRvRXhwYW5kKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhaXNFeHBhbmRlZCAmJiAhdXNlclRvZ2dsZWRPdXRwdXQ7XG5cdH1cblxuXHRmdW5jdGlvbiBoYXNSZWFsT3V0cHV0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBoYXNSZWFsT3V0cHV0VmFsdWU7XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR1cEF1dG9FeHBhbmRMb2dpYygpOiB2b2lkIHtcblx0XHQvLyBVc2UgdGhlIHJlYWwgVGVybWluYWxUb29sQXV0b0V4cGFuZCBjbGFzcyB3aXRoIGV2ZW50LWJhc2VkIGludGVyZmFjZVxuXHRcdGNvbnN0IGF1dG9FeHBhbmQgPSBzdG9yZS5hZGQobmV3IFRlcm1pbmFsVG9vbEF1dG9FeHBhbmQoe1xuXHRcdFx0b25Db21tYW5kRXhlY3V0ZWQ6IG9uQ29tbWFuZEV4ZWN1dGVkLmV2ZW50LFxuXHRcdFx0b25Db21tYW5kRmluaXNoZWQ6IG9uQ29tbWFuZEZpbmlzaGVkLmV2ZW50LFxuXHRcdFx0b25XaWxsRGF0YTogb25XaWxsRGF0YS5ldmVudCxcblx0XHRcdHNob3VsZEF1dG9FeHBhbmQsXG5cdFx0XHRoYXNSZWFsT3V0cHV0LFxuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQoYXV0b0V4cGFuZC5vbkRpZFJlcXVlc3RFeHBhbmQoKCkgPT4ge1xuXHRcdFx0aXNFeHBhbmRlZCA9IHRydWU7XG5cdFx0fSkpO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHVua25vd24+KCkpO1xuXHRcdG9uQ29tbWFuZEZpbmlzaGVkID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHVua25vd24+KCkpO1xuXHRcdG9uV2lsbERhdGEgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblxuXHRcdGlzRXhwYW5kZWQgPSBmYWxzZTtcblx0XHR1c2VyVG9nZ2xlZE91dHB1dCA9IGZhbHNlO1xuXHRcdGhhc1JlYWxPdXRwdXRWYWx1ZSA9IGZhbHNlO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ2hhdFRlcm1pbmFsVGhpbmtpbmdDb2xsYXBzaWJsZVdyYXBwZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnYW5pbWF0ZXMgdGVybWluYWwgY29udGVudCBhbmQga2VlcHMgY29sbGFwc2VkIGNvbnRlbnQgaW5lcnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCA9IHtcblx0XHRcdFx0ZWxlbWVudDogT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG51bGwpIGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIHtcblx0XHRcdFx0XHRpZDogJ3Jlc3BvbnNlJyxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uJyksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRlbGVtZW50SW5kZXg6IDAsXG5cdFx0XHRcdGNvbnRhaW5lcjogbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcblx0XHRcdFx0Y29udGVudDogW10sXG5cdFx0XHRcdGNvbnRlbnRJbmRleDogMCxcblx0XHRcdFx0aW5saW5lVGV4dE1vZGVsczogT2JqZWN0LmNyZWF0ZShJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uLnByb3RvdHlwZSkgYXMgSW5saW5lVGV4dE1vZGVsQ29sbGVjdGlvbixcblx0XHRcdFx0ZWRpdG9yUG9vbDogT2JqZWN0LmNyZWF0ZShFZGl0b3JQb29sLnByb3RvdHlwZSkgYXMgRWRpdG9yUG9vbCxcblx0XHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleDogMCxcblx0XHRcdFx0dHJlZVN0YXJ0SW5kZXg6IDAsXG5cdFx0XHRcdGRpZmZFZGl0b3JQb29sOiBPYmplY3QuY3JlYXRlKERpZmZFZGl0b3JQb29sLnByb3RvdHlwZSkgYXMgRGlmZkVkaXRvclBvb2wsXG5cdFx0XHRcdGN1cnJlbnRXaWR0aDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0V2lkdGgnLCA1MDApLFxuXHRcdFx0XHRvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50Lk5vbmUsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdGVybWluYWxDb250ZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHRlcm1pbmFsQ29udGVudC50ZXh0Q29udGVudCA9ICd0ZXJtaW5hbCBvdXRwdXQnO1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUZXJtaW5hbFRoaW5raW5nQ29sbGFwc2libGVXcmFwcGVyLFxuXHRcdFx0XHQnZWNobyB0ZXN0Jyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0dGVybWluYWxDb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpKTtcblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcubW9uYWNvLWJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgYW5pbWF0aW9uQ29udGFpbmVyID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGlvbicpO1xuXHRcdFx0Y29uc3QgYW5pbWF0aW9uQ29udGVudCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRpb24taW5uZXInKTtcblx0XHRcdGFzc2VydC5vayhidXR0b24pO1xuXHRcdFx0YXNzZXJ0Lm9rKGFuaW1hdGlvbkNvbnRhaW5lcik7XG5cdFx0XHRhc3NlcnQub2soYW5pbWF0aW9uQ29udGVudCk7XG5cdFx0XHRjb25zdCBpbml0aWFsbHlJbmVydCA9IGFuaW1hdGlvbkNvbnRlbnQuaW5lcnQ7XG5cdFx0XHRidXR0b24uY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc0FuaW1hdGlvbkNsYXNzOiBwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0ZWQnKSxcblx0XHRcdFx0YW5pbWF0aW9uRGlzcGxheTogbWFpbldpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGFuaW1hdGlvbkNvbnRhaW5lcikuZGlzcGxheSxcblx0XHRcdFx0aW5pdGlhbGx5SW5lcnQsXG5cdFx0XHRcdGV4cGFuZGVkSW5lcnQ6IGFuaW1hdGlvbkNvbnRlbnQuaW5lcnQsXG5cdFx0XHRcdGNvbnRhaW5zVGVybWluYWw6IGFuaW1hdGlvbkNvbnRlbnQuY29udGFpbnModGVybWluYWxDb250ZW50KSxcblx0XHRcdFx0aGFzU2hvd0xpbms6ICEhcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXRlcm1pbmFsLXNob3ctbGluaycpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRoYXNBbmltYXRpb25DbGFzczogdHJ1ZSxcblx0XHRcdFx0YW5pbWF0aW9uRGlzcGxheTogJ2dyaWQnLFxuXHRcdFx0XHRpbml0aWFsbHlJbmVydDogdHJ1ZSxcblx0XHRcdFx0ZXhwYW5kZWRJbmVydDogZmFsc2UsXG5cdFx0XHRcdGNvbnRhaW5zVGVybWluYWw6IHRydWUsXG5cdFx0XHRcdGhhc1Nob3dMaW5rOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYXN0IGNvbW1hbmQgd2l0aG91dCBkYXRhIHNob3VsZCBub3QgYXV0by1leHBhbmQgKGZpbmlzaGVzIGJlZm9yZSB0aW1lb3V0KScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdHNldHVwQXV0b0V4cGFuZExvZ2ljKCk7XG5cblx0XHQvLyBDb21tYW5kIGV4ZWN1dGVzXG5cdFx0b25Db21tYW5kRXhlY3V0ZWQuZmlyZSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gQ29tbWFuZCBmaW5pc2hlcyBxdWlja2x5IChiZWZvcmUgdGltZW91dClcblx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBXYWl0IHBhc3QgYWxsIHRpbWVvdXRzIChmYWtlZCB0aW1lcnMgYWR2YW5jZSBpbnN0YW50bHkpXG5cdFx0YXdhaXQgdGltZW91dChUZXJtaW5hbFRvb2xBdXRvRXhwYW5kVGltZW91dC5Ob0RhdGEgKyAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwYW5kZWQsIGZhbHNlLCAnU2hvdWxkIE5PVCBleHBhbmQgZm9yIGZhc3QgY29tbWFuZCB3aXRob3V0IGRhdGEnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2Zhc3QgY29tbWFuZCB3aXRoIHF1aWNrIGRhdGEgc2hvdWxkIG5vdCBhdXRvLWV4cGFuZCAoZGF0YSArIGZpbmlzaCBiZWZvcmUgdGltZW91dCknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRzZXR1cEF1dG9FeHBhbmRMb2dpYygpO1xuXG5cdFx0Ly8gQ29tbWFuZCBleGVjdXRlc1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIERhdGEgYXJyaXZlc1xuXHRcdG9uV2lsbERhdGEuZmlyZSgnb3V0cHV0Jyk7XG5cblx0XHQvLyBDb21tYW5kIGZpbmlzaGVzIHF1aWNrbHkgKGJlZm9yZSB0aW1lb3V0KVxuXHRcdG9uQ29tbWFuZEZpbmlzaGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIFdhaXQgcGFzdCBhbGwgdGltZW91dHMgKGZha2VkIHRpbWVycyBhZHZhbmNlIGluc3RhbnRseSlcblx0XHRhd2FpdCB0aW1lb3V0KFRlcm1pbmFsVG9vbEF1dG9FeHBhbmRUaW1lb3V0LkRhdGFFdmVudCArIDEwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNFeHBhbmRlZCwgZmFsc2UsICdTaG91bGQgTk9UIGV4cGFuZCB3aGVuIGNvbW1hbmQgZmluaXNoZXMgd2l0aGluIHRpbWVvdXQgb2YgZmlyc3QgZGF0YScpO1xuXHR9KSk7XG5cblx0dGVzdCgnbG9uZy1ydW5uaW5nIGNvbW1hbmQgd2l0aCBkYXRhIHNob3VsZCBhdXRvLWV4cGFuZCAoZGF0YSByZWNlaXZlZCwgY29tbWFuZCBzdGlsbCBydW5uaW5nIGFmdGVyIHRpbWVvdXQpJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0aGFzUmVhbE91dHB1dFZhbHVlID0gdHJ1ZTsgLy8gSGFzIHJlYWwgb3V0cHV0XG5cdFx0c2V0dXBBdXRvRXhwYW5kTG9naWMoKTtcblxuXHRcdC8vIENvbW1hbmQgZXhlY3V0ZXNcblx0XHRvbkNvbW1hbmRFeGVjdXRlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBEYXRhIGFycml2ZXNcblx0XHRvbldpbGxEYXRhLmZpcmUoJ291dHB1dCcpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGltZW91dCB0byBmaXJlIChmYWtlZCB0aW1lcnMgYWR2YW5jZSBpbnN0YW50bHkpXG5cdFx0YXdhaXQgdGltZW91dChUZXJtaW5hbFRvb2xBdXRvRXhwYW5kVGltZW91dC5EYXRhRXZlbnQgKyAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwYW5kZWQsIHRydWUsICdTaG91bGQgZXhwYW5kIHdoZW4gY29tbWFuZCBzdGlsbCBydW5uaW5nIGFmdGVyIGZpcnN0IGRhdGEgdGltZW91dCcpO1xuXG5cdFx0b25Db21tYW5kRmluaXNoZWQuZmlyZSh1bmRlZmluZWQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbG9uZy1ydW5uaW5nIGNvbW1hbmQgd2l0aCBkYXRhIGJ1dCBubyByZWFsIG91dHB1dCBzaG91bGQgTk9UIGF1dG8tZXhwYW5kIChsaWtlIHNsZWVwIHdpdGggc2hlbGwgc2VxdWVuY2VzKScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGhhc1JlYWxPdXRwdXRWYWx1ZSA9IGZhbHNlOyAvLyBTaGVsbCBpbnRlZ3JhdGlvbiBzZXF1ZW5jZXMsIG5vdCByZWFsIG91dHB1dFxuXHRcdHNldHVwQXV0b0V4cGFuZExvZ2ljKCk7XG5cblx0XHQvLyBDb21tYW5kIGV4ZWN1dGVzXG5cdFx0b25Db21tYW5kRXhlY3V0ZWQuZmlyZSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gU2hlbGwgaW50ZWdyYXRpb24gZGF0YSBhcnJpdmVzIChub3QgcmVhbCBvdXRwdXQpXG5cdFx0b25XaWxsRGF0YS5maXJlKCdzaGVsbC1zZXF1ZW5jZScpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGltZW91dCB0byBmaXJlIChmYWtlZCB0aW1lcnMgYWR2YW5jZSBpbnN0YW50bHkpXG5cdFx0YXdhaXQgdGltZW91dChUZXJtaW5hbFRvb2xBdXRvRXhwYW5kVGltZW91dC5EYXRhRXZlbnQgKyAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwYW5kZWQsIGZhbHNlLCAnU2hvdWxkIE5PVCBleHBhbmQgd2hlbiBkYXRhIGlzIHNoZWxsIHNlcXVlbmNlcywgbm90IHJlYWwgb3V0cHV0Jyk7XG5cblx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKHVuZGVmaW5lZCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdsb25nLXJ1bm5pbmcgY29tbWFuZCB3aXRob3V0IGRhdGEgc2hvdWxkIE5PVCBhdXRvLWV4cGFuZCBpZiBubyByZWFsIG91dHB1dCAobGlrZSBzbGVlcCknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRoYXNSZWFsT3V0cHV0VmFsdWUgPSBmYWxzZTsgLy8gTm8gcmVhbCBvdXRwdXQgbGlrZSBgc2xlZXAgMWBcblx0XHRzZXR1cEF1dG9FeHBhbmRMb2dpYygpO1xuXG5cdFx0Ly8gQ29tbWFuZCBleGVjdXRlc1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRpbWVvdXQgdG8gZmlyZSAoZmFrZWQgdGltZXJzIGFkdmFuY2UgaW5zdGFudGx5KVxuXHRcdGF3YWl0IHRpbWVvdXQoVGVybWluYWxUb29sQXV0b0V4cGFuZFRpbWVvdXQuTm9EYXRhICsgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cGFuZGVkLCBmYWxzZSwgJ1Nob3VsZCBOT1QgZXhwYW5kIHdoZW4gbm8gcmVhbCBvdXRwdXQgZXZlbiBhZnRlciB0aW1lb3V0Jyk7XG5cblx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKHVuZGVmaW5lZCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdsb25nLXJ1bm5pbmcgY29tbWFuZCB3aXRob3V0IGRhdGEgU0hPVUxEIGF1dG8tZXhwYW5kIGlmIHJlYWwgb3V0cHV0IGV4aXN0cycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGhhc1JlYWxPdXRwdXRWYWx1ZSA9IHRydWU7IC8vIEhhcyByZWFsIG91dHB1dCBpbiBidWZmZXJcblx0XHRzZXR1cEF1dG9FeHBhbmRMb2dpYygpO1xuXG5cdFx0Ly8gQ29tbWFuZCBleGVjdXRlc1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRpbWVvdXQgdG8gZmlyZSAoZmFrZWQgdGltZXJzIGFkdmFuY2UgaW5zdGFudGx5KVxuXHRcdGF3YWl0IHRpbWVvdXQoVGVybWluYWxUb29sQXV0b0V4cGFuZFRpbWVvdXQuTm9EYXRhICsgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cGFuZGVkLCB0cnVlLCAnU2hvdWxkIGV4cGFuZCB3aGVuIHJlYWwgb3V0cHV0IGV4aXN0cyBhZnRlciB0aW1lb3V0Jyk7XG5cblx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKHVuZGVmaW5lZCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkYXRhIGFycml2aW5nIGFmdGVyIGNvbW1hbmQgZmluaXNoIHNob3VsZCBub3QgdHJpZ2dlciBleHBhbmQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRzZXR1cEF1dG9FeHBhbmRMb2dpYygpO1xuXG5cdFx0Ly8gQ29tbWFuZCBleGVjdXRlcyBhbmQgZmluaXNoZXMgaW1tZWRpYXRlbHlcblx0XHRvbkNvbW1hbmRFeGVjdXRlZC5maXJlKHVuZGVmaW5lZCk7XG5cdFx0b25Db21tYW5kRmluaXNoZWQuZmlyZSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gRGF0YSBhcnJpdmVzIGFmdGVyIGNvbW1hbmQgZmluaXNoZWRcblx0XHRvbldpbGxEYXRhLmZpcmUoJ2xhdGUgb3V0cHV0Jyk7XG5cblx0XHQvLyBXYWl0IHBhc3QgYWxsIHRpbWVvdXRzIChmYWtlZCB0aW1lcnMgYWR2YW5jZSBpbnN0YW50bHkpXG5cdFx0YXdhaXQgdGltZW91dChUZXJtaW5hbFRvb2xBdXRvRXhwYW5kVGltZW91dC5Ob0RhdGEgKyAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwYW5kZWQsIGZhbHNlLCAnU2hvdWxkIE5PVCBleHBhbmQgd2hlbiBkYXRhIGFycml2ZXMgYWZ0ZXIgY29tbWFuZCBmaW5pc2hlZCcpO1xuXHR9KSk7XG5cblx0dGVzdCgndXNlciB0b2dnbGVkIG91dHB1dCBwcmV2ZW50cyBhdXRvLWV4cGFuZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdHVzZXJUb2dnbGVkT3V0cHV0ID0gdHJ1ZTtcblx0XHRzZXR1cEF1dG9FeHBhbmRMb2dpYygpO1xuXG5cdFx0Ly8gQ29tbWFuZCBleGVjdXRlc1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIERhdGEgYXJyaXZlc1xuXHRcdG9uV2lsbERhdGEuZmlyZSgnb3V0cHV0Jyk7XG5cblx0XHQvLyBXYWl0IHBhc3QgYWxsIHRpbWVvdXRzIChmYWtlZCB0aW1lcnMgYWR2YW5jZSBpbnN0YW50bHkpXG5cdFx0YXdhaXQgdGltZW91dChUZXJtaW5hbFRvb2xBdXRvRXhwYW5kVGltZW91dC5Ob0RhdGEgKyAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwYW5kZWQsIGZhbHNlLCAnU2hvdWxkIE5PVCBleHBhbmQgd2hlbiB1c2VyIGhhcyBtYW51YWxseSB0b2dnbGVkIG91dHB1dCcpO1xuXHRcdG9uQ29tbWFuZEZpbmlzaGVkLmZpcmUodW5kZWZpbmVkKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2FscmVhZHkgZXhwYW5kZWQgb3V0cHV0IHByZXZlbnRzIGFkZGl0aW9uYWwgYXV0by1leHBhbmQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRpc0V4cGFuZGVkID0gdHJ1ZTtcblxuXHRcdC8vIFRyYWNrIGlmIGV2ZW50IHdhcyBmaXJlZFxuXHRcdGxldCBldmVudEZpcmVkID0gZmFsc2U7XG5cdFx0Y29uc3QgYXV0b0V4cGFuZCA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxUb29sQXV0b0V4cGFuZCh7XG5cdFx0XHRvbkNvbW1hbmRFeGVjdXRlZDogb25Db21tYW5kRXhlY3V0ZWQuZXZlbnQsXG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogb25Db21tYW5kRmluaXNoZWQuZXZlbnQsXG5cdFx0XHRvbldpbGxEYXRhOiBvbldpbGxEYXRhLmV2ZW50LFxuXHRcdFx0c2hvdWxkQXV0b0V4cGFuZDogKCkgPT4gIWlzRXhwYW5kZWQgJiYgIXVzZXJUb2dnbGVkT3V0cHV0LFxuXHRcdFx0aGFzUmVhbE91dHB1dDogKCkgPT4gaGFzUmVhbE91dHB1dFZhbHVlLFxuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQoYXV0b0V4cGFuZC5vbkRpZFJlcXVlc3RFeHBhbmQoKCkgPT4ge1xuXHRcdFx0ZXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29tbWFuZCBleGVjdXRlc1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIERhdGEgYXJyaXZlc1xuXHRcdG9uV2lsbERhdGEuZmlyZSgnb3V0cHV0Jyk7XG5cblx0XHQvLyBXYWl0IHBhc3QgYWxsIHRpbWVvdXRzIChmYWtlZCB0aW1lcnMgYWR2YW5jZSBpbnN0YW50bHkpXG5cdFx0YXdhaXQgdGltZW91dChUZXJtaW5hbFRvb2xBdXRvRXhwYW5kVGltZW91dC5Ob0RhdGEgKyAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RmlyZWQsIGZhbHNlLCAnU2hvdWxkIE5PVCBmaXJlIGV4cGFuZCBldmVudCB3aGVuIGFscmVhZHkgZXhwYW5kZWQnKTtcblx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKHVuZGVmaW5lZCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkYXRhIGFycml2aW5nIGNhbmNlbHMgbm8tZGF0YSB0aW1lb3V0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0aGFzUmVhbE91dHB1dFZhbHVlID0gdHJ1ZTsgLy8gV291bGQgaGF2ZSBleHBhbmRlZCBpZiBuby1kYXRhIHRpbWVvdXQgZmlyZWRcblx0XHRzZXR1cEF1dG9FeHBhbmRMb2dpYygpO1xuXG5cdFx0Ly8gQ29tbWFuZCBleGVjdXRlc1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIERhdGEgYXJyaXZlcyAoY2FuY2VscyBuby1kYXRhIHRpbWVvdXQpXG5cdFx0b25XaWxsRGF0YS5maXJlKCdvdXRwdXQnKTtcblxuXHRcdC8vIENvbW1hbmQgZmluaXNoZXMgaW1tZWRpYXRlbHkgYWZ0ZXIgZGF0YSAoYmVmb3JlIGRhdGEgdGltZW91dCB3b3VsZCBmaXJlKVxuXHRcdG9uQ29tbWFuZEZpbmlzaGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIFdhaXQgcGFzdCBhbGwgdGltZW91dHMgKGZha2VkIHRpbWVycyBhZHZhbmNlIGluc3RhbnRseSlcblx0XHRhd2FpdCB0aW1lb3V0KFRlcm1pbmFsVG9vbEF1dG9FeHBhbmRUaW1lb3V0Lk5vRGF0YSArIDEwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNFeHBhbmRlZCwgZmFsc2UsICdOby1kYXRhIHRpbWVvdXQgc2hvdWxkIGJlIGNhbmNlbGxlZCB3aGVuIGRhdGEgYXJyaXZlcycpO1xuXHR9KSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgZGF0YSBldmVudHMgb25seSB0cmlnZ2VyIG9uZSB0aW1lb3V0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0aGFzUmVhbE91dHB1dFZhbHVlID0gdHJ1ZTsgLy8gSGFzIHJlYWwgb3V0cHV0XG5cdFx0c2V0dXBBdXRvRXhwYW5kTG9naWMoKTtcblxuXHRcdC8vIENvbW1hbmQgZXhlY3V0ZXNcblx0XHRvbkNvbW1hbmRFeGVjdXRlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBNdWx0aXBsZSBkYXRhIGV2ZW50c1xuXHRcdG9uV2lsbERhdGEuZmlyZSgnb3V0cHV0IDEnKTtcblx0XHRvbldpbGxEYXRhLmZpcmUoJ291dHB1dCAyJyk7XG5cdFx0b25XaWxsRGF0YS5maXJlKCdvdXRwdXQgMycpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGltZW91dCB0byBmaXJlIChmYWtlZCB0aW1lcnMgYWR2YW5jZSBpbnN0YW50bHkpXG5cdFx0YXdhaXQgdGltZW91dChUZXJtaW5hbFRvb2xBdXRvRXhwYW5kVGltZW91dC5EYXRhRXZlbnQgKyAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwYW5kZWQsIHRydWUsICdTaG91bGQgZXhwYW5kIGV4YWN0bHkgb25jZSBhZnRlciBmaXJzdCBkYXRhJyk7XG5cdFx0b25Db21tYW5kRmluaXNoZWQuZmlyZSh1bmRlZmluZWQpO1xuXHR9KSk7XG59KTtcblxuc3VpdGUoJ0NoYXRUZXJtaW5hbFRvb2xPdXRwdXRTZWN0aW9uIGxheW91dCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyBNb3VudHMgdGhlIHJlYWwgc2VjdGlvbiB3aXRoIHRoZSByZWFsIHNuYXBzaG90IG1pcnJvciBvdmVyIGEgZmFrZWQgZGV0YWNoZWQgdGVybWluYWwsXG5cdC8vIHNvIHRoZSBhc3NlcnRlZCBoZWlnaHRzIGFyZSB3aGF0IGFjdHVhbGx5IHJlYWNoZXMgdGhlIERPTS4gUmVncmVzc2lvbiBjb3ZlcmFnZSBmb3IgdGhlXG5cdC8vIHNsaWNlZC1sYXN0LXJvdyBzeW1wdG9tIG9mICMzMjgyOTk6IHRoZSBib3ggaGVpZ2h0IG11c3QgZGVyaXZlIGZyb20gdGhlIG1pcnJvcidzXG5cdC8vIHBhaW50ZWQgY2VsbCBoZWlnaHQsIG5vdCB0aGUgY29uZmlndXJhdGlvbi1mb250IGVzdGltYXRlLlxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IFhUZXJtQmFzZUN0b3I6IHR5cGVvZiBUZXJtaW5hbDtcblx0bGV0IGZha2VzOiBSZXR1cm5UeXBlPHR5cGVvZiBjcmVhdGVGYWtlRGV0YWNoZWRUZXJtaW5hbD5bXTtcblx0bGV0IG1pcnJvckZvbnQ6IElUZXJtaW5hbEZvbnQ7XG5cdGxldCBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdFhUZXJtQmFzZUN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cdFx0ZmFrZXMgPSBbXTtcblx0XHQvLyBNaXJyb3IgbWV0cmljcyBkZWxpYmVyYXRlbHkgZGlmZmVyIGZyb20gdGhlIGNvbmZpZyBlc3RpbWF0ZSBiZWxvdyBzbyB0aGUgdGVzdHMgY2FuXG5cdFx0Ly8gdGVsbCB3aGljaCBzb3VyY2UgdGhlIGxheW91dCB1c2VkXG5cdFx0bWlycm9yRm9udCA9IHsgZm9udEZhbWlseTogJ21vbm9zcGFjZScsIGZvbnRTaXplOiAxMiwgbGV0dGVyU3BhY2luZzogMCwgbGluZUhlaWdodDogMSwgY2hhcldpZHRoOiAxMCwgY2hhckhlaWdodDogMjAgfTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFNlcnZpY2UsIHtcblx0XHRcdGNyZWF0ZURldGFjaGVkVGVybWluYWw6IGFzeW5jIChvcHRpb25zOiBJRGV0YWNoZWRYVGVybU9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y29uc3QgZmFrZSA9IGNyZWF0ZUZha2VEZXRhY2hlZFRlcm1pbmFsKFhUZXJtQmFzZUN0b3IsIG9wdGlvbnMsIG1pcnJvckZvbnQpO1xuXHRcdFx0XHRmYWtlcy5wdXNoKGZha2UpO1xuXHRcdFx0XHRyZXR1cm4gZmFrZS5pbnN0YW5jZTtcblx0XHRcdH1cblx0XHR9IGFzIFBhcnRpYWw8SVRlcm1pbmFsU2VydmljZT4pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsIHtcblx0XHRcdGdldEZvbnQ6ICgpID0+ICh7IGZvbnRGYW1pbHk6ICdtb25vc3BhY2UnLCBmb250U2l6ZTogMTAsIGxldHRlclNwYWNpbmc6IDAsIGxpbmVIZWlnaHQ6IDEsIGNoYXJXaWR0aDogNiwgY2hhckhlaWdodDogMTAgfSlcblx0XHR9IGFzIFBhcnRpYWw8SVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsIHtcblx0XHRcdGdldE9wZW5BcmlhSGludDogKCkgPT4gbnVsbFxuXHRcdH0gYXMgUGFydGlhbDxJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlPik7XG5cdFx0Y29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnODAwcHgnO1xuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY29udGFpbmVyLnJlbW92ZSgpKSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlY3Rpb24ob3V0cHV0OiB7IHRleHQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkKTogQ2hhdFRlcm1pbmFsVG9vbE91dHB1dFNlY3Rpb24ge1xuXHRcdGNvbnN0IHNlY3Rpb24gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VGVybWluYWxUb29sT3V0cHV0U2VjdGlvbixcblx0XHRcdGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdCgpID0+IHVuZGVmaW5lZCxcblx0XHRcdCgpID0+IHVuZGVmaW5lZCxcblx0XHRcdCgpID0+IG91dHB1dCxcblx0XHRcdCgpID0+ICdlY2hvIHRlc3QnLFxuXHRcdFx0KCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0KCkgPT4gZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHQpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc2VjdGlvbi5kb21Ob2RlKTtcblx0XHRyZXR1cm4gc2VjdGlvbjtcblx0fVxuXG5cdGZ1bmN0aW9uIGJveEhlaWdodChzZWN0aW9uOiBDaGF0VGVybWluYWxUb29sT3V0cHV0U2VjdGlvbik6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZSA9IHNlY3Rpb24uZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCcpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRyZXR1cm4gc2Nyb2xsYWJsZT8uc3R5bGUuaGVpZ2h0ID8/ICcnO1xuXHR9XG5cblx0LyoqIFRoZSBleHBlY3RlZCBib3ggaGVpZ2h0IGZvciBgcm93c2Agcm93czogcm93cyBcdTAwRDcgcm93SGVpZ2h0IHBsdXMgdGhlIGJvZHkncyByZWFsIHBhZGRpbmcuICovXG5cdGZ1bmN0aW9uIGV4cGVjdGVkSGVpZ2h0KHNlY3Rpb246IENoYXRUZXJtaW5hbFRvb2xPdXRwdXRTZWN0aW9uLCByb3dzOiBudW1iZXIsIHJvd0hlaWdodDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBib2R5ID0gc2VjdGlvbi5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXRlcm1pbmFsLW91dHB1dC1ib2R5JykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0Y29uc3Qgc3R5bGUgPSBtYWluV2luZG93LmdldENvbXB1dGVkU3R5bGUoYm9keSk7XG5cdFx0Y29uc3QgcGFkZGluZyA9IChOdW1iZXIucGFyc2VGbG9hdChzdHlsZS5wYWRkaW5nVG9wKSB8fCAwKSArIChOdW1iZXIucGFyc2VGbG9hdChzdHlsZS5wYWRkaW5nQm90dG9tKSB8fCAwKTtcblx0XHRyZXR1cm4gYCR7cm93cyAqIHJvd0hlaWdodCArIHBhZGRpbmd9cHhgO1xuXHR9XG5cblx0dGVzdCgnYm94IGhlaWdodCB1c2VzIHRoZSBtaXJyb3Igcm93IGhlaWdodCwgbm90IHRoZSBjb25maWcgZXN0aW1hdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IGNyZWF0ZVNlY3Rpb24oeyB0ZXh0OiAnbDFcXHJcXG5sMlxcclxcbmwzJyB9KTtcblx0XHRhd2FpdCBzZWN0aW9uLnRvZ2dsZSh0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm94SGVpZ2h0KHNlY3Rpb24pLCBleHBlY3RlZEhlaWdodChzZWN0aW9uLCAzLCAyMCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSBjb25maWctZm9udCBlc3RpbWF0ZSB3aGlsZSBtaXJyb3IgbWV0cmljcyBhcmUgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bWlycm9yRm9udCA9IHsgLi4ubWlycm9yRm9udCwgY2hhckhlaWdodDogMCB9O1xuXHRcdGNvbnN0IHNlY3Rpb24gPSBjcmVhdGVTZWN0aW9uKHsgdGV4dDogJ2wxXFxyXFxubDJcXHJcXG5sMycgfSk7XG5cdFx0YXdhaXQgc2VjdGlvbi50b2dnbGUodHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJveEhlaWdodChzZWN0aW9uKSwgZXhwZWN0ZWRIZWlnaHQoc2VjdGlvbiwgMywgMTApKTtcblx0fSk7XG5cblx0dGVzdCgncmVsYXlvdXRzIHdoZW4gdGhlIG1pcnJvciBhbm5vdW5jZXMgY2hhbmdlZCBjZWxsIG1ldHJpY3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IGNyZWF0ZVNlY3Rpb24oeyB0ZXh0OiAnbDFcXHJcXG5sMlxcclxcbmwzJyB9KTtcblx0XHRhd2FpdCBzZWN0aW9uLnRvZ2dsZSh0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm94SGVpZ2h0KHNlY3Rpb24pLCBleHBlY3RlZEhlaWdodChzZWN0aW9uLCAzLCAyMCkpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdGhlIHJlbmRlcmVyIHJlcG9ydGluZyBkaWZmZXJlbnQgbWV0cmljcyAoZmlyc3QgcmVuZGVyIHJlcGxhY2luZyB0aGVcblx0XHQvLyBlc3RpbWF0ZSwgb3IgYSBEUFIgY2hhbmdlKTogbXV0YXRlIHRoZSBmb250IHRoZSBmYWtlIHJlcG9ydHMsIHRoZW4gb3BlbiB0aGUgcmF3XG5cdFx0Ly8gdGVybWluYWwgc28geHRlcm0gZmlyZXMgYSByZWFsIHJlbmRlciBldmVudFxuXHRcdG1pcnJvckZvbnQuY2hhckhlaWdodCA9IDMwO1xuXHRcdGNvbnN0IGZha2UgPSBmYWtlc1swXTtcblx0XHRjb25zdCByZW5kZXJGaXJlZCA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBmYWtlLnJhdy5vblJlbmRlcigoKSA9PiB7XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0Y29uc3QgaG9zdCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGhvc3QpO1xuXHRcdGZha2UucmF3Lm9wZW4oaG9zdCk7XG5cdFx0YXdhaXQgcmVuZGVyRmlyZWQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm94SGVpZ2h0KHNlY3Rpb24pLCBleHBlY3RlZEhlaWdodChzZWN0aW9uLCAzLCAzMCkpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBd0MsaUNBQWlDO0FBQ3pFLFNBQVMsZ0JBQWdCLGtCQUFrQjtBQUMzQyxTQUFTLHdDQUF3QyxxQ0FBcUM7QUFFdEYsU0FBUyx3QkFBd0IscUNBQXFDO0FBQ3RFLFNBQVMsK0JBQStCLHdCQUFvRDtBQUU1RixTQUFTLGtDQUFrQztBQUUzQyxNQUFNLGtEQUFrRCxNQUFNO0FBQzdELFFBQU0sUUFBUSx3Q0FBd0M7QUFHdEQsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBR0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBRUosV0FBUyxtQkFBNEI7QUFDcEMsV0FBTyxDQUFDLGNBQWMs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
