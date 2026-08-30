import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { ChatOriginKind, SessionStatus } from "../../../../services/sessions/common/session.js";
import { SessionBackgroundActivitiesControl } from "../../browser/sessionBackgroundActivitiesControl.js";
import { isNonNegativeIntegerInput, weightedRandomDebugIncrement } from "../../browser/sessionChatInputToolbarDebug.js";
function createControl(spec, store) {
  const mainChat = new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse("chat:main");
      this.title = constObservable("Main");
      this.status = constObservable(SessionStatus.InProgress);
    }
  }();
  const subagents = (spec.subagents ?? []).map((title, index) => new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse(`chat:subagent-${index}`);
      this.title = constObservable(title);
      this.status = constObservable(spec.subagentStatus ?? SessionStatus.InProgress);
      this.origin = { kind: ChatOriginKind.Tool, parentChat: mainChat.resource };
    }
  }());
  const session = new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse("session:main");
      this.chats = constObservable([mainChat, ...subagents]);
    }
  }();
  let pickerItems = [];
  const actionWidgetService = new class extends mock() {
    get isVisible() {
      return false;
    }
    hide() {
    }
    show(_user, _supportsPreview, items, _delegate) {
      pickerItems = items.map((item) => ({
        kind: item.kind,
        label: item.label ?? "",
        category: item.group?.title ?? "",
        icon: item.group?.icon?.id ?? ""
      }));
    }
  }();
  let openedChat;
  const sessionsService = new class extends mock() {
    async openChat(_session, chatUri) {
      openedChat = chatUri;
    }
  }();
  const control = store.add(new SessionBackgroundActivitiesControl(
    constObservable(session),
    constObservable(mainChat),
    constObservable(spec.enabled ?? true),
    actionWidgetService,
    sessionsService
  ));
  return {
    control,
    getPickerItems: () => pickerItems,
    getOpenedChat: () => openedChat
  };
}
function summarize(control) {
  const button = control.element.querySelector(".session-activity-pill-button");
  const knownIcons = [Codicon.globe, Codicon.agent, Codicon.sessionInProgress, Codicon.chevronDown];
  return {
    text: button.textContent ?? "",
    ariaLabel: button.getAttribute("aria-label"),
    icons: [...button.querySelectorAll(".codicon")].map((element) => knownIcons.find((icon) => element.classList.contains(`codicon-${icon.id}`))?.id ?? "unknown")
  };
}
function click(control) {
  control.element.querySelector(".session-activity-pill-button").click();
}
suite("SessionBackgroundActivitiesControl", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("weights smaller random change increments more heavily", () => {
    const frequencies = Array.from({ length: 16 }, () => 0);
    for (let first = 0; first < 16; first++) {
      for (let second = 0; second < 16; second++) {
        frequencies[weightedRandomDebugIncrement((first + 0.5) / 16, (second + 0.5) / 16)]++;
      }
    }
    assert.deepStrictEqual(frequencies, [31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1]);
  });
  test("rejects empty and invalid numeric debug fields", () => {
    assert.deepStrictEqual({
      empty: isNonNegativeIntegerInput(""),
      whitespace: isNonNegativeIntegerInput("  "),
      zero: isNonNegativeIntegerInput("0"),
      integer: isNonNegativeIntegerInput("12"),
      negative: isNonNegativeIntegerInput("-1"),
      decimal: isNonNegativeIntegerInput("1.5"),
      text: isNonNegativeIntegerInput("one")
    }, {
      empty: false,
      whitespace: false,
      zero: true,
      integer: true,
      negative: false,
      decimal: false,
      text: false
    });
  });
  test("renders single and aggregate labels, icons, and subagent truncation", () => {
    const cases = [
      { subagents: ["Research"] },
      { subagents: ["Investigate the authentication failure in production"] },
      { subagents: ["Research", "Review"] }
    ];
    const disabled = createControl({ subagents: ["Research"], enabled: false }, store);
    assert.deepStrictEqual({
      enabled: cases.map((spec) => summarize(createControl(spec, store).control)),
      disabledVisible: disabled.control.isVisible.get()
    }, {
      enabled: [
        { text: "Research", ariaLabel: "Open Research", icons: ["agent"] },
        { text: "Investigate the authentication...", ariaLabel: "Open Investigate the authentication...", icons: ["agent"] },
        { text: "2 Active Subagents", ariaLabel: "Show 2 background activities", icons: ["agent", "chevron-down"] }
      ],
      disabledVisible: false
    });
  });
  test("keeps subagents visible while they need input", () => {
    const harness = createControl({ subagents: ["Waiting"], subagentStatus: SessionStatus.NeedsInput }, store);
    assert.deepStrictEqual({
      visible: harness.control.isVisible.get(),
      summary: summarize(harness.control)
    }, {
      visible: true,
      summary: { text: "Waiting", ariaLabel: "Open Waiting", icons: ["agent"] }
    });
  });
  test("ignores browsers from debug data and shows only fake subagents", () => {
    const harness = createControl({ enabled: false }, store);
    harness.control.setDebugData({
      stats: { files: 2, insertions: 10, deletions: 3 },
      markdownFiles: ["README.md"],
      browsers: ["Debug Browser"],
      subagents: ["Debug Subagent"],
      ciFailed: 2,
      ciPending: 1,
      prFeedback: 3,
      agentFeedback: 4,
      autoIncrementChanges: false
    });
    const forced = summarize(harness.control);
    harness.control.setDebugData(void 0);
    assert.deepStrictEqual({ forced, visibleAfterClear: harness.control.isVisible.get() }, {
      forced: { text: "Debug Subagent", ariaLabel: "Open Debug Subagent", icons: ["agent"] },
      visibleAfterClear: false
    });
  });
  test("lists subagents in a picker under a category header", () => {
    const harness = createControl({ subagents: ["Research", "Review"] }, store);
    click(harness.control);
    assert.deepStrictEqual(harness.getPickerItems(), [
      { kind: ActionListItemKind.Header, label: "Subagents", category: "Subagents", icon: "" },
      { kind: ActionListItemKind.Action, label: "Research", category: "", icon: Codicon.agent.id },
      { kind: ActionListItemKind.Action, label: "Review", category: "", icon: Codicon.agent.id }
    ]);
  });
  test("opens a single subagent directly", () => {
    const harness = createControl({ subagents: ["Research"] }, store);
    click(harness.control);
    assert.deepStrictEqual(harness.getOpenedChat()?.toString(), "chat:subagent-0");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3Nlclxcc2Vzc2lvbkJhY2tncm91bmRBY3Rpdml0aWVzQ29udHJvbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRPcmlnaW5LaW5kLCBJQ2hhdCwgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkJhY2tncm91bmRBY3Rpdml0aWVzQ29udHJvbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2Vzc2lvbkJhY2tncm91bmRBY3Rpdml0aWVzQ29udHJvbC5qcyc7XG5pbXBvcnQgeyBpc05vbk5lZ2F0aXZlSW50ZWdlcklucHV0LCB3ZWlnaHRlZFJhbmRvbURlYnVnSW5jcmVtZW50IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uQ2hhdElucHV0VG9vbGJhckRlYnVnLmpzJztcblxuaW50ZXJmYWNlIElDb250cm9sU3BlYyB7XG5cdHJlYWRvbmx5IHN1YmFnZW50cz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBzdWJhZ2VudFN0YXR1cz86IFNlc3Npb25TdGF0dXM7XG5cdHJlYWRvbmx5IGVuYWJsZWQ/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUNvbnRyb2xIYXJuZXNzIHtcblx0cmVhZG9ubHkgY29udHJvbDogU2Vzc2lvbkJhY2tncm91bmRBY3Rpdml0aWVzQ29udHJvbDtcblx0cmVhZG9ubHkgZ2V0UGlja2VySXRlbXM6ICgpID0+IHJlYWRvbmx5IElDYXB0dXJlZFBpY2tlckl0ZW1bXTtcblx0cmVhZG9ubHkgZ2V0T3BlbmVkQ2hhdDogKCkgPT4gVVJJIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSUNhcHR1cmVkUGlja2VySXRlbSB7XG5cdHJlYWRvbmx5IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZDtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgY2F0ZWdvcnk6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDb250cm9sKHNwZWM6IElDb250cm9sU3BlYywgc3RvcmU6IFJldHVyblR5cGU8dHlwZW9mIGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZT4pOiBJQ29udHJvbEhhcm5lc3Mge1xuXHRjb25zdCBtYWluQ2hhdCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXQ+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0Om1haW4nKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB0aXRsZSA9IGNvbnN0T2JzZXJ2YWJsZSgnTWFpbicpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXR1cyA9IGNvbnN0T2JzZXJ2YWJsZShTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHR9KCk7XG5cdGNvbnN0IHN1YmFnZW50cyA9IChzcGVjLnN1YmFnZW50cyA/PyBbXSkubWFwKCh0aXRsZSwgaW5kZXgpID0+IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXQ+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gVVJJLnBhcnNlKGBjaGF0OnN1YmFnZW50LSR7aW5kZXh9YCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdGl0bGUgPSBjb25zdE9ic2VydmFibGUodGl0bGUpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXR1cyA9IGNvbnN0T2JzZXJ2YWJsZShzcGVjLnN1YmFnZW50U3RhdHVzID8/IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3JpZ2luID0geyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sLCBwYXJlbnRDaGF0OiBtYWluQ2hhdC5yZXNvdXJjZSB9O1xuXHR9KCkpO1xuXHRjb25zdCBzZXNzaW9uID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWN0aXZlU2Vzc2lvbj4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3Nlc3Npb246bWFpbicpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYXRzID0gY29uc3RPYnNlcnZhYmxlKFttYWluQ2hhdCwgLi4uc3ViYWdlbnRzXSk7XG5cdH0oKTtcblxuXHRsZXQgcGlja2VySXRlbXM6IElDYXB0dXJlZFBpY2tlckl0ZW1bXSA9IFtdO1xuXHRjb25zdCBhY3Rpb25XaWRnZXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWN0aW9uV2lkZ2V0U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0IGlzVmlzaWJsZSgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0b3ZlcnJpZGUgaGlkZSgpOiB2b2lkIHsgfVxuXHRcdG92ZXJyaWRlIHNob3c8VD4oX3VzZXI6IHN0cmluZywgX3N1cHBvcnRzUHJldmlldzogYm9vbGVhbiwgaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdLCBfZGVsZWdhdGU6IElBY3Rpb25MaXN0RGVsZWdhdGU8VD4pOiB2b2lkIHtcblx0XHRcdHBpY2tlckl0ZW1zID0gaXRlbXMubWFwKGl0ZW0gPT4gKHtcblx0XHRcdFx0a2luZDogaXRlbS5raW5kLFxuXHRcdFx0XHRsYWJlbDogaXRlbS5sYWJlbCA/PyAnJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IGl0ZW0uZ3JvdXA/LnRpdGxlID8/ICcnLFxuXHRcdFx0XHRpY29uOiBpdGVtLmdyb3VwPy5pY29uPy5pZCA/PyAnJyxcblx0XHRcdH0pKTtcblx0XHR9XG5cdH0oKTtcblxuXHRsZXQgb3BlbmVkQ2hhdDogVVJJIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5DaGF0KF9zZXNzaW9uOiBJU2Vzc2lvbiwgY2hhdFVyaTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRvcGVuZWRDaGF0ID0gY2hhdFVyaTtcblx0XHR9XG5cdH0oKTtcblxuXHRjb25zdCBjb250cm9sID0gc3RvcmUuYWRkKG5ldyBTZXNzaW9uQmFja2dyb3VuZEFjdGl2aXRpZXNDb250cm9sKFxuXHRcdGNvbnN0T2JzZXJ2YWJsZShzZXNzaW9uKSxcblx0XHRjb25zdE9ic2VydmFibGUobWFpbkNoYXQpLFxuXHRcdGNvbnN0T2JzZXJ2YWJsZShzcGVjLmVuYWJsZWQgPz8gdHJ1ZSksXG5cdFx0YWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRzZXNzaW9uc1NlcnZpY2UsXG5cdCkpO1xuXG5cdHJldHVybiB7XG5cdFx0Y29udHJvbCxcblx0XHRnZXRQaWNrZXJJdGVtczogKCkgPT4gcGlja2VySXRlbXMsXG5cdFx0Z2V0T3BlbmVkQ2hhdDogKCkgPT4gb3BlbmVkQ2hhdCxcblx0fTtcbn1cblxuZnVuY3Rpb24gc3VtbWFyaXplKGNvbnRyb2w6IFNlc3Npb25CYWNrZ3JvdW5kQWN0aXZpdGllc0NvbnRyb2wpOiB7IHJlYWRvbmx5IHRleHQ6IHN0cmluZzsgcmVhZG9ubHkgYXJpYUxhYmVsOiBzdHJpbmcgfCBudWxsOyByZWFkb25seSBpY29uczogcmVhZG9ubHkgc3RyaW5nW10gfSB7XG5cdGNvbnN0IGJ1dHRvbiA9IGNvbnRyb2wuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnNlc3Npb24tYWN0aXZpdHktcGlsbC1idXR0b24nKSE7XG5cdGNvbnN0IGtub3duSWNvbnMgPSBbQ29kaWNvbi5nbG9iZSwgQ29kaWNvbi5hZ2VudCwgQ29kaWNvbi5zZXNzaW9uSW5Qcm9ncmVzcywgQ29kaWNvbi5jaGV2cm9uRG93bl07XG5cdHJldHVybiB7XG5cdFx0dGV4dDogYnV0dG9uLnRleHRDb250ZW50ID8/ICcnLFxuXHRcdGFyaWFMYWJlbDogYnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdGljb25zOiBbLi4uYnV0dG9uLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuY29kaWNvbicpXVxuXHRcdFx0Lm1hcChlbGVtZW50ID0+IGtub3duSWNvbnMuZmluZChpY29uID0+IGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKGBjb2RpY29uLSR7aWNvbi5pZH1gKSk/LmlkID8/ICd1bmtub3duJyksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNsaWNrKGNvbnRyb2w6IFNlc3Npb25CYWNrZ3JvdW5kQWN0aXZpdGllc0NvbnRyb2wpOiB2b2lkIHtcblx0Y29udHJvbC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbi1hY3Rpdml0eS1waWxsLWJ1dHRvbicpIS5jbGljaygpO1xufVxuXG5zdWl0ZSgnU2Vzc2lvbkJhY2tncm91bmRBY3Rpdml0aWVzQ29udHJvbCcsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3dlaWdodHMgc21hbGxlciByYW5kb20gY2hhbmdlIGluY3JlbWVudHMgbW9yZSBoZWF2aWx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGZyZXF1ZW5jaWVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTYgfSwgKCkgPT4gMCk7XG5cdFx0Zm9yIChsZXQgZmlyc3QgPSAwOyBmaXJzdCA8IDE2OyBmaXJzdCsrKSB7XG5cdFx0XHRmb3IgKGxldCBzZWNvbmQgPSAwOyBzZWNvbmQgPCAxNjsgc2Vjb25kKyspIHtcblx0XHRcdFx0ZnJlcXVlbmNpZXNbd2VpZ2h0ZWRSYW5kb21EZWJ1Z0luY3JlbWVudCgoZmlyc3QgKyAwLjUpIC8gMTYsIChzZWNvbmQgKyAwLjUpIC8gMTYpXSsrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnJlcXVlbmNpZXMsIFszMSwgMjksIDI3LCAyNSwgMjMsIDIxLCAxOSwgMTcsIDE1LCAxMywgMTEsIDksIDcsIDUsIDMsIDFdKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBlbXB0eSBhbmQgaW52YWxpZCBudW1lcmljIGRlYnVnIGZpZWxkcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVtcHR5OiBpc05vbk5lZ2F0aXZlSW50ZWdlcklucHV0KCcnKSxcblx0XHRcdHdoaXRlc3BhY2U6IGlzTm9uTmVnYXRpdmVJbnRlZ2VySW5wdXQoJyAgJyksXG5cdFx0XHR6ZXJvOiBpc05vbk5lZ2F0aXZlSW50ZWdlcklucHV0KCcwJyksXG5cdFx0XHRpbnRlZ2VyOiBpc05vbk5lZ2F0aXZlSW50ZWdlcklucHV0KCcxMicpLFxuXHRcdFx0bmVnYXRpdmU6IGlzTm9uTmVnYXRpdmVJbnRlZ2VySW5wdXQoJy0xJyksXG5cdFx0XHRkZWNpbWFsOiBpc05vbk5lZ2F0aXZlSW50ZWdlcklucHV0KCcxLjUnKSxcblx0XHRcdHRleHQ6IGlzTm9uTmVnYXRpdmVJbnRlZ2VySW5wdXQoJ29uZScpLFxuXHRcdH0sIHtcblx0XHRcdGVtcHR5OiBmYWxzZSxcblx0XHRcdHdoaXRlc3BhY2U6IGZhbHNlLFxuXHRcdFx0emVybzogdHJ1ZSxcblx0XHRcdGludGVnZXI6IHRydWUsXG5cdFx0XHRuZWdhdGl2ZTogZmFsc2UsXG5cdFx0XHRkZWNpbWFsOiBmYWxzZSxcblx0XHRcdHRleHQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIHNpbmdsZSBhbmQgYWdncmVnYXRlIGxhYmVscywgaWNvbnMsIGFuZCBzdWJhZ2VudCB0cnVuY2F0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhc2VzOiBJQ29udHJvbFNwZWNbXSA9IFtcblx0XHRcdHsgc3ViYWdlbnRzOiBbJ1Jlc2VhcmNoJ10gfSxcblx0XHRcdHsgc3ViYWdlbnRzOiBbJ0ludmVzdGlnYXRlIHRoZSBhdXRoZW50aWNhdGlvbiBmYWlsdXJlIGluIHByb2R1Y3Rpb24nXSB9LFxuXHRcdFx0eyBzdWJhZ2VudHM6IFsnUmVzZWFyY2gnLCAnUmV2aWV3J10gfSxcblx0XHRdO1xuXHRcdGNvbnN0IGRpc2FibGVkID0gY3JlYXRlQ29udHJvbCh7IHN1YmFnZW50czogWydSZXNlYXJjaCddLCBlbmFibGVkOiBmYWxzZSB9LCBzdG9yZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVuYWJsZWQ6IGNhc2VzLm1hcChzcGVjID0+IHN1bW1hcml6ZShjcmVhdGVDb250cm9sKHNwZWMsIHN0b3JlKS5jb250cm9sKSksXG5cdFx0XHRkaXNhYmxlZFZpc2libGU6IGRpc2FibGVkLmNvbnRyb2wuaXNWaXNpYmxlLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdGVuYWJsZWQ6IFtcblx0XHRcdFx0eyB0ZXh0OiAnUmVzZWFyY2gnLCBhcmlhTGFiZWw6ICdPcGVuIFJlc2VhcmNoJywgaWNvbnM6IFsnYWdlbnQnXSB9LFxuXHRcdFx0XHR7IHRleHQ6ICdJbnZlc3RpZ2F0ZSB0aGUgYXV0aGVudGljYXRpb24uLi4nLCBhcmlhTGFiZWw6ICdPcGVuIEludmVzdGlnYXRlIHRoZSBhdXRoZW50aWNhdGlvbi4uLicsIGljb25zOiBbJ2FnZW50J10gfSxcblx0XHRcdFx0eyB0ZXh0OiAnMiBBY3RpdmUgU3ViYWdlbnRzJywgYXJpYUxhYmVsOiAnU2hvdyAyIGJhY2tncm91bmQgYWN0aXZpdGllcycsIGljb25zOiBbJ2FnZW50JywgJ2NoZXZyb24tZG93biddIH0sXG5cdFx0XHRdLFxuXHRcdFx0ZGlzYWJsZWRWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgc3ViYWdlbnRzIHZpc2libGUgd2hpbGUgdGhleSBuZWVkIGlucHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhcm5lc3MgPSBjcmVhdGVDb250cm9sKHsgc3ViYWdlbnRzOiBbJ1dhaXRpbmcnXSwgc3ViYWdlbnRTdGF0dXM6IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCB9LCBzdG9yZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHZpc2libGU6IGhhcm5lc3MuY29udHJvbC5pc1Zpc2libGUuZ2V0KCksXG5cdFx0XHRzdW1tYXJ5OiBzdW1tYXJpemUoaGFybmVzcy5jb250cm9sKSxcblx0XHR9LCB7XG5cdFx0XHR2aXNpYmxlOiB0cnVlLFxuXHRcdFx0c3VtbWFyeTogeyB0ZXh0OiAnV2FpdGluZycsIGFyaWFMYWJlbDogJ09wZW4gV2FpdGluZycsIGljb25zOiBbJ2FnZW50J10gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBicm93c2VycyBmcm9tIGRlYnVnIGRhdGEgYW5kIHNob3dzIG9ubHkgZmFrZSBzdWJhZ2VudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFybmVzcyA9IGNyZWF0ZUNvbnRyb2woeyBlbmFibGVkOiBmYWxzZSB9LCBzdG9yZSk7XG5cdFx0aGFybmVzcy5jb250cm9sLnNldERlYnVnRGF0YSh7XG5cdFx0XHRzdGF0czogeyBmaWxlczogMiwgaW5zZXJ0aW9uczogMTAsIGRlbGV0aW9uczogMyB9LFxuXHRcdFx0bWFya2Rvd25GaWxlczogWydSRUFETUUubWQnXSxcblx0XHRcdGJyb3dzZXJzOiBbJ0RlYnVnIEJyb3dzZXInXSxcblx0XHRcdHN1YmFnZW50czogWydEZWJ1ZyBTdWJhZ2VudCddLFxuXHRcdFx0Y2lGYWlsZWQ6IDIsXG5cdFx0XHRjaVBlbmRpbmc6IDEsXG5cdFx0XHRwckZlZWRiYWNrOiAzLFxuXHRcdFx0YWdlbnRGZWVkYmFjazogNCxcblx0XHRcdGF1dG9JbmNyZW1lbnRDaGFuZ2VzOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBmb3JjZWQgPSBzdW1tYXJpemUoaGFybmVzcy5jb250cm9sKTtcblx0XHRoYXJuZXNzLmNvbnRyb2wuc2V0RGVidWdEYXRhKHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZm9yY2VkLCB2aXNpYmxlQWZ0ZXJDbGVhcjogaGFybmVzcy5jb250cm9sLmlzVmlzaWJsZS5nZXQoKSB9LCB7XG5cdFx0XHRmb3JjZWQ6IHsgdGV4dDogJ0RlYnVnIFN1YmFnZW50JywgYXJpYUxhYmVsOiAnT3BlbiBEZWJ1ZyBTdWJhZ2VudCcsIGljb25zOiBbJ2FnZW50J10gfSxcblx0XHRcdHZpc2libGVBZnRlckNsZWFyOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdHMgc3ViYWdlbnRzIGluIGEgcGlja2VyIHVuZGVyIGEgY2F0ZWdvcnkgaGVhZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhcm5lc3MgPSBjcmVhdGVDb250cm9sKHsgc3ViYWdlbnRzOiBbJ1Jlc2VhcmNoJywgJ1JldmlldyddIH0sIHN0b3JlKTtcblxuXHRcdGNsaWNrKGhhcm5lc3MuY29udHJvbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhcm5lc3MuZ2V0UGlja2VySXRlbXMoKSwgW1xuXHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyLCBsYWJlbDogJ1N1YmFnZW50cycsIGNhdGVnb3J5OiAnU3ViYWdlbnRzJywgaWNvbjogJycgfSxcblx0XHRcdHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiwgbGFiZWw6ICdSZXNlYXJjaCcsIGNhdGVnb3J5OiAnJywgaWNvbjogQ29kaWNvbi5hZ2VudC5pZCB9LFxuXHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLCBsYWJlbDogJ1JldmlldycsIGNhdGVnb3J5OiAnJywgaWNvbjogQ29kaWNvbi5hZ2VudC5pZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVucyBhIHNpbmdsZSBzdWJhZ2VudCBkaXJlY3RseScsICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gY3JlYXRlQ29udHJvbCh7IHN1YmFnZW50czogWydSZXNlYXJjaCddIH0sIHN0b3JlKTtcblxuXHRcdGNsaWNrKGhhcm5lc3MuY29udHJvbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhcm5lc3MuZ2V0T3BlbmVkQ2hhdCgpPy50b1N0cmluZygpLCAnY2hhdDpzdWJhZ2VudC0wJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBZ0U7QUFHekUsU0FBUyxnQkFBaUMscUJBQXFCO0FBRS9ELFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsMkJBQTJCLG9DQUFvQztBQXFCeEUsU0FBUyxjQUFjLE1BQW9CLE9BQW9GO0FBQzlILFFBQU0sV0FBVyxJQUFJLGNBQWMsS0FBWSxFQUFFO0FBQUEsSUFBNUI7QUFBQTtBQUNwQixXQUFrQixXQUFXLElBQUksTUFBTSxXQUFXO0FBQ2xELFdBQWtCLFFBQVEsZ0JBQWdCLE1BQU07QUFDaEQsV0FBa0IsU0FBUyxnQkFBZ0IsY0FBYyxVQUFVO0FBQUE7QUFBQSxFQUNwRSxFQUFFO0FBQ0YsUUFBTSxhQUFhLEtBQUssYUFBYSxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sVUFBVSxJQUFJ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
