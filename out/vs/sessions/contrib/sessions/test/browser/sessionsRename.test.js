import assert from "assert";
import { mainWindow } from "../../../../../base/browser/window.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { RENAME_SESSION_COMMAND_ID } from "../../../../common/sessionCommands.js";
import { ISessionsPartService } from "../../../../services/sessions/browser/sessionsPartService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { SessionsChatAccessibilityHelp } from "../../../chat/browser/sessionsChatAccessibilityHelp.js";
import { SessionsFlatList, SessionsGrouping, SessionsList, SessionsSorting } from "../../browser/views/sessionsList.js";
import { createListHarness, createTestSession, TestSessionsManagementService } from "./sessionsListTestUtils.js";
import "../../browser/views/sessionsViewActions.js";
class TestQuickInputService extends mock() {
  constructor() {
    super(...arguments);
    this.calls = 0;
  }
  async input(options) {
    this.calls++;
    this.options = options;
    return this.result;
  }
}
function dispatchDoubleClick(target, options = {}) {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1, ...options }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 2, ...options }));
  const doubleClick = new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0, detail: 2, ...options });
  target.dispatchEvent(doubleClick);
  return doubleClick;
}
suite("Sessions rename", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  suite("list interaction", () => {
    test("title double-click opens once and requests rename once", () => {
      const { session } = createTestSession("First");
      const harness = createListHarness(disposables, [session]);
      const openCalls = [];
      const container = harness.createContainer();
      const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
        grouping: () => SessionsGrouping.Date,
        sorting: () => SessionsSorting.Created,
        onSessionOpen: (resource) => openCalls.push(resource)
      }));
      list.layout(300, 400);
      const title = container.querySelector(".session-item .monaco-highlighted-label");
      assert.ok(title);
      let bubbled = 0;
      container.addEventListener("dblclick", () => bubbled++);
      const doubleClick = dispatchDoubleClick(title);
      assert.deepStrictEqual({
        openCalls: openCalls.map((resource) => resource.toString()),
        renameCalls: harness.commandService.calls.filter((call) => call.commandId === RENAME_SESSION_COMMAND_ID),
        defaultPrevented: doubleClick.defaultPrevented,
        bubbled
      }, {
        openCalls: [session.resource.toString()],
        renameCalls: [{ commandId: RENAME_SESSION_COMMAND_ID, args: [session] }],
        defaultPrevented: true,
        bubbled: 0
      });
    });
    test("rename is title-only, unmodified, capability-gated, and rebound safely", () => {
      const first = createTestSession("First", { resourceId: "shared" });
      const harness = createListHarness(disposables, [first.session]);
      const container = harness.createContainer();
      const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
        grouping: () => SessionsGrouping.Date,
        sorting: () => SessionsSorting.Created,
        onSessionOpen: () => {
        }
      }));
      list.layout(300, 400);
      for (const selector of [".session-icon", ".session-title", ".session-details-row", ".session-title-toolbar"]) {
        const target = container.querySelector(`.session-item ${selector}`);
        assert.ok(target);
        dispatchDoubleClick(target);
      }
      const title = container.querySelector(".session-item .monaco-highlighted-label");
      assert.ok(title);
      dispatchDoubleClick(title, { altKey: true });
      assert.strictEqual(harness.commandService.calls.filter((call) => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);
      first.capabilities.set({ supportsMultipleChats: false, supportsRename: false }, void 0);
      const unsupported = dispatchDoubleClick(title);
      assert.strictEqual(unsupported.defaultPrevented, false);
      assert.strictEqual(harness.commandService.calls.filter((call) => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);
      const replacement = createTestSession("Replacement", { resourceId: "shared" });
      harness.managementService.sessions = [replacement.session];
      list.refresh();
      list.layout(300, 400);
      const replacementTitle = container.querySelector(".session-item .monaco-highlighted-label");
      assert.ok(replacementTitle);
      assert.strictEqual(replacementTitle.textContent, "Replacement");
      dispatchDoubleClick(replacementTitle);
      assert.deepStrictEqual(
        harness.commandService.calls.filter((call) => call.commandId === RENAME_SESSION_COMMAND_ID),
        [{ commandId: RENAME_SESSION_COMMAND_ID, args: [replacement.session] }]
      );
    });
    test("flat session lists do not request rename", () => {
      const { session } = createTestSession("Flat");
      const harness = createListHarness(disposables, [session]);
      const container = harness.createContainer();
      const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
        showSessionHover: false,
        onSessionOpen: () => {
        }
      }));
      list.setSessions([session]);
      list.layout(100, 400);
      const title = container.querySelector(".session-item .monaco-highlighted-label");
      assert.ok(title);
      dispatchDoubleClick(title);
      assert.strictEqual(harness.commandService.calls.filter((call) => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);
    });
  });
  suite("action", () => {
    function createActionHarness(title = "Existing", supportsRename = true) {
      const instantiationService = disposables.add(new TestInstantiationService());
      const quickInputService = new TestQuickInputService();
      const managementService = new TestSessionsManagementService([]);
      const sessionData = createTestSession(title);
      sessionData.capabilities.set({ supportsMultipleChats: false, supportsRename }, void 0);
      instantiationService.stub(IQuickInputService, quickInputService);
      instantiationService.stub(ISessionsManagementService, managementService);
      const handler = CommandsRegistry.getCommand(RENAME_SESSION_COMMAND_ID)?.handler;
      assert.ok(handler);
      return { handler, instantiationService, quickInputService, managementService, session: sessionData.session };
    }
    test("direct invocation is capability-gated", async () => {
      const harness = createActionHarness("Existing", false);
      await harness.handler(harness.instantiationService, harness.session);
      assert.deepStrictEqual({ inputCalls: harness.quickInputService.calls, renamed: harness.managementService.renamed }, { inputCalls: 0, renamed: [] });
    });
    test("validates input and ignores cancellation, whitespace, and unchanged titles", async () => {
      const cancelled = createActionHarness();
      cancelled.quickInputService.result = void 0;
      await cancelled.handler(cancelled.instantiationService, cancelled.session);
      const whitespace = createActionHarness();
      whitespace.quickInputService.result = "   ";
      await whitespace.handler(whitespace.instantiationService, whitespace.session);
      const validationMessage = await whitespace.quickInputService.options?.validateInput?.("   ");
      const unchanged = createActionHarness();
      unchanged.quickInputService.result = " Existing ";
      await unchanged.handler(unchanged.instantiationService, unchanged.session);
      assert.deepStrictEqual({
        cancelled: cancelled.managementService.renamed,
        whitespace: whitespace.managementService.renamed,
        validationMessage,
        unchanged: unchanged.managementService.renamed
      }, {
        cancelled: [],
        whitespace: [],
        validationMessage: "Title cannot be empty",
        unchanged: []
      });
    });
    test("trims changed titles and propagates provider errors", async () => {
      const success = createActionHarness();
      success.quickInputService.result = " New title ";
      await success.handler(success.instantiationService, success.session);
      const failure = createActionHarness();
      failure.quickInputService.result = "Fails";
      failure.managementService.renameError = new Error("rename failed");
      await assert.rejects(async () => {
        await failure.handler(failure.instantiationService, failure.session);
      }, failure.managementService.renameError);
      assert.deepStrictEqual({
        success: success.managementService.renamed,
        failure: failure.managementService.renamed
      }, {
        success: [{ session: success.session, title: "New title" }],
        failure: [{ session: failure.session, title: "Fails" }]
      });
    });
  });
  suite("accessibility help", () => {
    function createHelpProvider(origin, removeOrigin = false) {
      const instantiationService = disposables.add(new TestInstantiationService());
      let fallbackFocusCount = 0;
      const fallbackView = new class extends mock() {
        focus() {
          fallbackFocusCount++;
        }
      }();
      const activeSession = new class extends mock() {
        constructor() {
          super(...arguments);
          this.sessionId = "active";
        }
      }();
      instantiationService.stub(ISessionsPartService, new class extends mock() {
        getSessionView() {
          return fallbackView;
        }
      }());
      instantiationService.stub(ISessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSession = constObservable(activeSession);
        }
      }());
      mainWindow.document.body.appendChild(origin);
      disposables.add({ dispose: () => origin.remove() });
      origin.focus();
      const provider = disposables.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
      if (removeOrigin) {
        origin.remove();
      }
      return { provider, fallbackFocusCount: () => fallbackFocusCount };
    }
    test("documents pointer and keyboard rename paths and restores originating focus", () => {
      const origin = mainWindow.document.createElement("button");
      const { provider, fallbackFocusCount } = createHelpProvider(origin);
      const content = provider.provideContent();
      provider.onClose();
      assert.deepStrictEqual({
        hasDoubleClick: content.includes("double-click its title"),
        hasContextMenu: content.includes("open its context menu"),
        activeElement: mainWindow.document.activeElement,
        fallbackFocusCount: fallbackFocusCount()
      }, {
        hasDoubleClick: true,
        hasContextMenu: true,
        activeElement: origin,
        fallbackFocusCount: 0
      });
    });
    test("falls back to the active session when the originating element is gone", () => {
      const origin = mainWindow.document.createElement("button");
      const { provider, fallbackFocusCount } = createHelpProvider(origin, true);
      provider.onClose();
      assert.strictEqual(fallbackFocusCount(), 1);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXHRlc3RcXGJyb3dzZXJcXHNlc3Npb25zUmVuYW1lLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJSW5wdXRPcHRpb25zLCBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFJFTkFNRV9TRVNTSU9OX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2Vzc2lvbkNvbW1hbmRzLmpzJztcbmltcG9ydCB7IFNlc3Npb25WaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9zZXNzaW9uVmlldy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQYXJ0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0NoYXRBY2Nlc3NpYmlsaXR5SGVscCB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9zZXNzaW9uc0NoYXRBY2Nlc3NpYmlsaXR5SGVscC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0ZsYXRMaXN0LCBTZXNzaW9uc0dyb3VwaW5nLCBTZXNzaW9uc0xpc3QsIFNlc3Npb25zU29ydGluZyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld3Mvc2Vzc2lvbnNMaXN0LmpzJztcbmltcG9ydCB7IGNyZWF0ZUxpc3RIYXJuZXNzLCBjcmVhdGVUZXN0U2Vzc2lvbiwgVGVzdFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuL3Nlc3Npb25zTGlzdFRlc3RVdGlscy5qcyc7XG5pbXBvcnQgJy4uLy4uL2Jyb3dzZXIvdmlld3Mvc2Vzc2lvbnNWaWV3QWN0aW9ucy5qcyc7XG5cbmNsYXNzIFRlc3RRdWlja0lucHV0U2VydmljZSBleHRlbmRzIG1vY2s8SVF1aWNrSW5wdXRTZXJ2aWNlPigpIHtcblx0cmVzdWx0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdG9wdGlvbnM6IElJbnB1dE9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdGNhbGxzID0gMDtcblxuXHRvdmVycmlkZSBhc3luYyBpbnB1dChvcHRpb25zPzogSUlucHV0T3B0aW9ucyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5jYWxscysrO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0cmV0dXJuIHRoaXMucmVzdWx0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGRpc3BhdGNoRG91YmxlQ2xpY2sodGFyZ2V0OiBIVE1MRWxlbWVudCwgb3B0aW9uczogTW91c2VFdmVudEluaXQgPSB7fSk6IE1vdXNlRXZlbnQge1xuXHR0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUsIGJ1dHRvbjogMCwgZGV0YWlsOiAxLCAuLi5vcHRpb25zIH0pKTtcblx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlLCBidXR0b246IDAsIGRldGFpbDogMiwgLi4ub3B0aW9ucyB9KSk7XG5cdGNvbnN0IGRvdWJsZUNsaWNrID0gbmV3IE1vdXNlRXZlbnQoJ2RibGNsaWNrJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlLCBidXR0b246IDAsIGRldGFpbDogMiwgLi4ub3B0aW9ucyB9KTtcblx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQoZG91YmxlQ2xpY2spO1xuXHRyZXR1cm4gZG91YmxlQ2xpY2s7XG59XG5cbnN1aXRlKCdTZXNzaW9ucyByZW5hbWUnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2xpc3QgaW50ZXJhY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgndGl0bGUgZG91YmxlLWNsaWNrIG9wZW5zIG9uY2UgYW5kIHJlcXVlc3RzIHJlbmFtZSBvbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBjcmVhdGVUZXN0U2Vzc2lvbignRmlyc3QnKTtcblx0XHRcdGNvbnN0IGhhcm5lc3MgPSBjcmVhdGVMaXN0SGFybmVzcyhkaXNwb3NhYmxlcywgW3Nlc3Npb25dKTtcblx0XHRcdGNvbnN0IG9wZW5DYWxsczogVVJJW10gPSBbXTtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGhhcm5lc3MuY3JlYXRlQ29udGFpbmVyKCk7XG5cdFx0XHRjb25zdCBsaXN0ID0gaGFybmVzcy5zdG9yZS5hZGQoaGFybmVzcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc0xpc3QsIGNvbnRhaW5lciwge1xuXHRcdFx0XHRncm91cGluZzogKCkgPT4gU2Vzc2lvbnNHcm91cGluZy5EYXRlLFxuXHRcdFx0XHRzb3J0aW5nOiAoKSA9PiBTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCxcblx0XHRcdFx0b25TZXNzaW9uT3BlbjogcmVzb3VyY2UgPT4gb3BlbkNhbGxzLnB1c2gocmVzb3VyY2UpLFxuXHRcdFx0fSkpO1xuXHRcdFx0bGlzdC5sYXlvdXQoMzAwLCA0MDApO1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5zZXNzaW9uLWl0ZW0gLm1vbmFjby1oaWdobGlnaHRlZC1sYWJlbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlKTtcblxuXHRcdFx0bGV0IGJ1YmJsZWQgPSAwO1xuXHRcdFx0Y29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoJ2RibGNsaWNrJywgKCkgPT4gYnViYmxlZCsrKTtcblx0XHRcdGNvbnN0IGRvdWJsZUNsaWNrID0gZGlzcGF0Y2hEb3VibGVDbGljayh0aXRsZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRvcGVuQ2FsbHM6IG9wZW5DYWxscy5tYXAocmVzb3VyY2UgPT4gcmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRcdHJlbmFtZUNhbGxzOiBoYXJuZXNzLmNvbW1hbmRTZXJ2aWNlLmNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwuY29tbWFuZElkID09PSBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEKSxcblx0XHRcdFx0ZGVmYXVsdFByZXZlbnRlZDogZG91YmxlQ2xpY2suZGVmYXVsdFByZXZlbnRlZCxcblx0XHRcdFx0YnViYmxlZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0b3BlbkNhbGxzOiBbc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpXSxcblx0XHRcdFx0cmVuYW1lQ2FsbHM6IFt7IGNvbW1hbmRJZDogUkVOQU1FX1NFU1NJT05fQ09NTUFORF9JRCwgYXJnczogW3Nlc3Npb25dIH1dLFxuXHRcdFx0XHRkZWZhdWx0UHJldmVudGVkOiB0cnVlLFxuXHRcdFx0XHRidWJibGVkOiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5hbWUgaXMgdGl0bGUtb25seSwgdW5tb2RpZmllZCwgY2FwYWJpbGl0eS1nYXRlZCwgYW5kIHJlYm91bmQgc2FmZWx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBjcmVhdGVUZXN0U2Vzc2lvbignRmlyc3QnLCB7IHJlc291cmNlSWQ6ICdzaGFyZWQnIH0pO1xuXHRcdFx0Y29uc3QgaGFybmVzcyA9IGNyZWF0ZUxpc3RIYXJuZXNzKGRpc3Bvc2FibGVzLCBbZmlyc3Quc2Vzc2lvbl0pO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gaGFybmVzcy5jcmVhdGVDb250YWluZXIoKTtcblx0XHRcdGNvbnN0IGxpc3QgPSBoYXJuZXNzLnN0b3JlLmFkZChoYXJuZXNzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTGlzdCwgY29udGFpbmVyLCB7XG5cdFx0XHRcdGdyb3VwaW5nOiAoKSA9PiBTZXNzaW9uc0dyb3VwaW5nLkRhdGUsXG5cdFx0XHRcdHNvcnRpbmc6ICgpID0+IFNlc3Npb25zU29ydGluZy5DcmVhdGVkLFxuXHRcdFx0XHRvblNlc3Npb25PcGVuOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRsaXN0LmxheW91dCgzMDAsIDQwMCk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgWycuc2Vzc2lvbi1pY29uJywgJy5zZXNzaW9uLXRpdGxlJywgJy5zZXNzaW9uLWRldGFpbHMtcm93JywgJy5zZXNzaW9uLXRpdGxlLXRvb2xiYXInXSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oYC5zZXNzaW9uLWl0ZW0gJHtzZWxlY3Rvcn1gKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRhcmdldCk7XG5cdFx0XHRcdGRpc3BhdGNoRG91YmxlQ2xpY2sodGFyZ2V0KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRpdGxlID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbi1pdGVtIC5tb25hY28taGlnaGxpZ2h0ZWQtbGFiZWwnKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZSk7XG5cdFx0XHRkaXNwYXRjaERvdWJsZUNsaWNrKHRpdGxlLCB7IGFsdEtleTogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLmNvbW1hbmRTZXJ2aWNlLmNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwuY29tbWFuZElkID09PSBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEKS5sZW5ndGgsIDApO1xuXG5cdFx0XHRmaXJzdC5jYXBhYmlsaXRpZXMuc2V0KHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSwgc3VwcG9ydHNSZW5hbWU6IGZhbHNlIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB1bnN1cHBvcnRlZCA9IGRpc3BhdGNoRG91YmxlQ2xpY2sodGl0bGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3VwcG9ydGVkLmRlZmF1bHRQcmV2ZW50ZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLmNvbW1hbmRTZXJ2aWNlLmNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwuY29tbWFuZElkID09PSBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEKS5sZW5ndGgsIDApO1xuXG5cdFx0XHRjb25zdCByZXBsYWNlbWVudCA9IGNyZWF0ZVRlc3RTZXNzaW9uKCdSZXBsYWNlbWVudCcsIHsgcmVzb3VyY2VJZDogJ3NoYXJlZCcgfSk7XG5cdFx0XHRoYXJuZXNzLm1hbmFnZW1lbnRTZXJ2aWNlLnNlc3Npb25zID0gW3JlcGxhY2VtZW50LnNlc3Npb25dO1xuXHRcdFx0bGlzdC5yZWZyZXNoKCk7XG5cdFx0XHRsaXN0LmxheW91dCgzMDAsIDQwMCk7XG5cdFx0XHRjb25zdCByZXBsYWNlbWVudFRpdGxlID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbi1pdGVtIC5tb25hY28taGlnaGxpZ2h0ZWQtbGFiZWwnKTtcblx0XHRcdGFzc2VydC5vayhyZXBsYWNlbWVudFRpdGxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXBsYWNlbWVudFRpdGxlLnRleHRDb250ZW50LCAnUmVwbGFjZW1lbnQnKTtcblx0XHRcdGRpc3BhdGNoRG91YmxlQ2xpY2socmVwbGFjZW1lbnRUaXRsZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGhhcm5lc3MuY29tbWFuZFNlcnZpY2UuY2FsbHMuZmlsdGVyKGNhbGwgPT4gY2FsbC5jb21tYW5kSWQgPT09IFJFTkFNRV9TRVNTSU9OX0NPTU1BTkRfSUQpLFxuXHRcdFx0XHRbeyBjb21tYW5kSWQ6IFJFTkFNRV9TRVNTSU9OX0NPTU1BTkRfSUQsIGFyZ3M6IFtyZXBsYWNlbWVudC5zZXNzaW9uXSB9XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmbGF0IHNlc3Npb24gbGlzdHMgZG8gbm90IHJlcXVlc3QgcmVuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBjcmVhdGVUZXN0U2Vzc2lvbignRmxhdCcpO1xuXHRcdFx0Y29uc3QgaGFybmVzcyA9IGNyZWF0ZUxpc3RIYXJuZXNzKGRpc3Bvc2FibGVzLCBbc2Vzc2lvbl0pO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gaGFybmVzcy5jcmVhdGVDb250YWluZXIoKTtcblx0XHRcdGNvbnN0IGxpc3QgPSBoYXJuZXNzLnN0b3JlLmFkZChoYXJuZXNzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zRmxhdExpc3QsIGNvbnRhaW5lciwge1xuXHRcdFx0XHRzaG93U2Vzc2lvbkhvdmVyOiBmYWxzZSxcblx0XHRcdFx0b25TZXNzaW9uT3BlbjogKCkgPT4geyB9LFxuXHRcdFx0fSkpO1xuXHRcdFx0bGlzdC5zZXRTZXNzaW9ucyhbc2Vzc2lvbl0pO1xuXHRcdFx0bGlzdC5sYXlvdXQoMTAwLCA0MDApO1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5zZXNzaW9uLWl0ZW0gLm1vbmFjby1oaWdobGlnaHRlZC1sYWJlbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlKTtcblxuXHRcdFx0ZGlzcGF0Y2hEb3VibGVDbGljayh0aXRsZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLmNvbW1hbmRTZXJ2aWNlLmNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwuY29tbWFuZElkID09PSBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYWN0aW9uJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZUFjdGlvbkhhcm5lc3ModGl0bGUgPSAnRXhpc3RpbmcnLCBzdXBwb3J0c1JlbmFtZSA9IHRydWUpIHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IG5ldyBUZXN0UXVpY2tJbnB1dFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IG1hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IFRlc3RTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKFtdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhID0gY3JlYXRlVGVzdFNlc3Npb24odGl0bGUpO1xuXHRcdFx0c2Vzc2lvbkRhdGEuY2FwYWJpbGl0aWVzLnNldCh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UsIHN1cHBvcnRzUmVuYW1lIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElRdWlja0lucHV0U2VydmljZSwgcXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgbWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEKT8uaGFuZGxlcjtcblx0XHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblx0XHRcdHJldHVybiB7IGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBxdWlja0lucHV0U2VydmljZSwgbWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb246IHNlc3Npb25EYXRhLnNlc3Npb24gfTtcblx0XHR9XG5cblx0XHR0ZXN0KCdkaXJlY3QgaW52b2NhdGlvbiBpcyBjYXBhYmlsaXR5LWdhdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGFybmVzcyA9IGNyZWF0ZUFjdGlvbkhhcm5lc3MoJ0V4aXN0aW5nJywgZmFsc2UpO1xuXG5cdFx0XHRhd2FpdCBoYXJuZXNzLmhhbmRsZXIoaGFybmVzcy5pbnN0YW50aWF0aW9uU2VydmljZSwgaGFybmVzcy5zZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGlucHV0Q2FsbHM6IGhhcm5lc3MucXVpY2tJbnB1dFNlcnZpY2UuY2FsbHMsIHJlbmFtZWQ6IGhhcm5lc3MubWFuYWdlbWVudFNlcnZpY2UucmVuYW1lZCB9LCB7IGlucHV0Q2FsbHM6IDAsIHJlbmFtZWQ6IFtdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWRhdGVzIGlucHV0IGFuZCBpZ25vcmVzIGNhbmNlbGxhdGlvbiwgd2hpdGVzcGFjZSwgYW5kIHVuY2hhbmdlZCB0aXRsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYW5jZWxsZWQgPSBjcmVhdGVBY3Rpb25IYXJuZXNzKCk7XG5cdFx0XHRjYW5jZWxsZWQucXVpY2tJbnB1dFNlcnZpY2UucmVzdWx0ID0gdW5kZWZpbmVkO1xuXHRcdFx0YXdhaXQgY2FuY2VsbGVkLmhhbmRsZXIoY2FuY2VsbGVkLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBjYW5jZWxsZWQuc2Vzc2lvbik7XG5cblx0XHRcdGNvbnN0IHdoaXRlc3BhY2UgPSBjcmVhdGVBY3Rpb25IYXJuZXNzKCk7XG5cdFx0XHR3aGl0ZXNwYWNlLnF1aWNrSW5wdXRTZXJ2aWNlLnJlc3VsdCA9ICcgICAnO1xuXHRcdFx0YXdhaXQgd2hpdGVzcGFjZS5oYW5kbGVyKHdoaXRlc3BhY2UuaW5zdGFudGlhdGlvblNlcnZpY2UsIHdoaXRlc3BhY2Uuc2Vzc2lvbik7XG5cdFx0XHRjb25zdCB2YWxpZGF0aW9uTWVzc2FnZSA9IGF3YWl0IHdoaXRlc3BhY2UucXVpY2tJbnB1dFNlcnZpY2Uub3B0aW9ucz8udmFsaWRhdGVJbnB1dD8uKCcgICAnKTtcblxuXHRcdFx0Y29uc3QgdW5jaGFuZ2VkID0gY3JlYXRlQWN0aW9uSGFybmVzcygpO1xuXHRcdFx0dW5jaGFuZ2VkLnF1aWNrSW5wdXRTZXJ2aWNlLnJlc3VsdCA9ICcgRXhpc3RpbmcgJztcblx0XHRcdGF3YWl0IHVuY2hhbmdlZC5oYW5kbGVyKHVuY2hhbmdlZC5pbnN0YW50aWF0aW9uU2VydmljZSwgdW5jaGFuZ2VkLnNlc3Npb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2FuY2VsbGVkOiBjYW5jZWxsZWQubWFuYWdlbWVudFNlcnZpY2UucmVuYW1lZCxcblx0XHRcdFx0d2hpdGVzcGFjZTogd2hpdGVzcGFjZS5tYW5hZ2VtZW50U2VydmljZS5yZW5hbWVkLFxuXHRcdFx0XHR2YWxpZGF0aW9uTWVzc2FnZSxcblx0XHRcdFx0dW5jaGFuZ2VkOiB1bmNoYW5nZWQubWFuYWdlbWVudFNlcnZpY2UucmVuYW1lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2FuY2VsbGVkOiBbXSxcblx0XHRcdFx0d2hpdGVzcGFjZTogW10sXG5cdFx0XHRcdHZhbGlkYXRpb25NZXNzYWdlOiAnVGl0bGUgY2Fubm90IGJlIGVtcHR5Jyxcblx0XHRcdFx0dW5jaGFuZ2VkOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJpbXMgY2hhbmdlZCB0aXRsZXMgYW5kIHByb3BhZ2F0ZXMgcHJvdmlkZXIgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3VjY2VzcyA9IGNyZWF0ZUFjdGlvbkhhcm5lc3MoKTtcblx0XHRcdHN1Y2Nlc3MucXVpY2tJbnB1dFNlcnZpY2UucmVzdWx0ID0gJyBOZXcgdGl0bGUgJztcblx0XHRcdGF3YWl0IHN1Y2Nlc3MuaGFuZGxlcihzdWNjZXNzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBzdWNjZXNzLnNlc3Npb24pO1xuXG5cdFx0XHRjb25zdCBmYWlsdXJlID0gY3JlYXRlQWN0aW9uSGFybmVzcygpO1xuXHRcdFx0ZmFpbHVyZS5xdWlja0lucHV0U2VydmljZS5yZXN1bHQgPSAnRmFpbHMnO1xuXHRcdFx0ZmFpbHVyZS5tYW5hZ2VtZW50U2VydmljZS5yZW5hbWVFcnJvciA9IG5ldyBFcnJvcigncmVuYW1lIGZhaWxlZCcpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IGZhaWx1cmUuaGFuZGxlcihmYWlsdXJlLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBmYWlsdXJlLnNlc3Npb24pO1xuXHRcdFx0fSwgZmFpbHVyZS5tYW5hZ2VtZW50U2VydmljZS5yZW5hbWVFcnJvcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3VjY2Vzczogc3VjY2Vzcy5tYW5hZ2VtZW50U2VydmljZS5yZW5hbWVkLFxuXHRcdFx0XHRmYWlsdXJlOiBmYWlsdXJlLm1hbmFnZW1lbnRTZXJ2aWNlLnJlbmFtZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN1Y2Nlc3M6IFt7IHNlc3Npb246IHN1Y2Nlc3Muc2Vzc2lvbiwgdGl0bGU6ICdOZXcgdGl0bGUnIH1dLFxuXHRcdFx0XHRmYWlsdXJlOiBbeyBzZXNzaW9uOiBmYWlsdXJlLnNlc3Npb24sIHRpdGxlOiAnRmFpbHMnIH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhY2Nlc3NpYmlsaXR5IGhlbHAnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gY3JlYXRlSGVscFByb3ZpZGVyKG9yaWdpbjogSFRNTEVsZW1lbnQsIHJlbW92ZU9yaWdpbiA9IGZhbHNlKSB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0bGV0IGZhbGxiYWNrRm9jdXNDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBmYWxsYmFja1ZpZXcgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPFNlc3Npb25WaWV3PigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7IGZhbGxiYWNrRm9jdXNDb3VudCsrOyB9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGl2ZVNlc3Npb24+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uSWQgPSAnYWN0aXZlJztcblx0XHRcdH07XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1BhcnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1BhcnRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvblZpZXcoKSB7IHJldHVybiBmYWxsYmFja1ZpZXc7IH1cblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gY29uc3RPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPihhY3RpdmVTZXNzaW9uKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3JpZ2luKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IG9yaWdpbi5yZW1vdmUoKSB9KTtcblx0XHRcdG9yaWdpbi5mb2N1cygpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25zQ2hhdEFjY2Vzc2liaWxpdHlIZWxwKCkuZ2V0UHJvdmlkZXIoaW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblx0XHRcdGlmIChyZW1vdmVPcmlnaW4pIHtcblx0XHRcdFx0b3JpZ2luLnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgcHJvdmlkZXIsIGZhbGxiYWNrRm9jdXNDb3VudDogKCkgPT4gZmFsbGJhY2tGb2N1c0NvdW50IH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnZG9jdW1lbnRzIHBvaW50ZXIgYW5kIGtleWJvYXJkIHJlbmFtZSBwYXRocyBhbmQgcmVzdG9yZXMgb3JpZ2luYXRpbmcgZm9jdXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvcmlnaW4gPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuXHRcdFx0Y29uc3QgeyBwcm92aWRlciwgZmFsbGJhY2tGb2N1c0NvdW50IH0gPSBjcmVhdGVIZWxwUHJvdmlkZXIob3JpZ2luKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IHByb3ZpZGVyLnByb3ZpZGVDb250ZW50KCk7XG5cdFx0XHRwcm92aWRlci5vbkNsb3NlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRoYXNEb3VibGVDbGljazogY29udGVudC5pbmNsdWRlcygnZG91YmxlLWNsaWNrIGl0cyB0aXRsZScpLFxuXHRcdFx0XHRoYXNDb250ZXh0TWVudTogY29udGVudC5pbmNsdWRlcygnb3BlbiBpdHMgY29udGV4dCBtZW51JyksXG5cdFx0XHRcdGFjdGl2ZUVsZW1lbnQ6IG1haW5XaW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCxcblx0XHRcdFx0ZmFsbGJhY2tGb2N1c0NvdW50OiBmYWxsYmFja0ZvY3VzQ291bnQoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aGFzRG91YmxlQ2xpY2s6IHRydWUsXG5cdFx0XHRcdGhhc0NvbnRleHRNZW51OiB0cnVlLFxuXHRcdFx0XHRhY3RpdmVFbGVtZW50OiBvcmlnaW4sXG5cdFx0XHRcdGZhbGxiYWNrRm9jdXNDb3VudDogMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgYWN0aXZlIHNlc3Npb24gd2hlbiB0aGUgb3JpZ2luYXRpbmcgZWxlbWVudCBpcyBnb25lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3JpZ2luID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcblx0XHRcdGNvbnN0IHsgcHJvdmlkZXIsIGZhbGxiYWNrRm9jdXNDb3VudCB9ID0gY3JlYXRlSGVscFByb3ZpZGVyKG9yaWdpbiwgdHJ1ZSk7XG5cblx0XHRcdHByb3ZpZGVyLm9uQ2xvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhbGxiYWNrRm9jdXNDb3VudCgpLCAxKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBd0IsMEJBQTBCO0FBQ2xELFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQXlCLGtDQUFrQztBQUMzRCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGtC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
