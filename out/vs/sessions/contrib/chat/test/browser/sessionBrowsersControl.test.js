import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Event } from "../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { BrowserViewSharingState } from "../../../../../workbench/contrib/browserView/common/browserView.js";
import { ChatOriginKind, SessionStatus } from "../../../../services/sessions/common/session.js";
import { SessionBrowsersControl } from "../../browser/sessionBrowsersControl.js";
function createControl(spec, store) {
  const mainChat = new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse("chat:main");
      this.title = constObservable("Main");
      this.status = constObservable(SessionStatus.InProgress);
    }
  }();
  const subagent = new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse("chat:subagent-0");
      this.title = constObservable("Research");
      this.status = constObservable(SessionStatus.InProgress);
      this.origin = { kind: ChatOriginKind.Tool, parentChat: mainChat.resource };
    }
  }();
  const chats = observableValue("chats", spec.withoutSubagent ? [mainChat] : [mainChat, subagent]);
  const session = new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse("session:main");
      this.chats = chats;
    }
  }();
  const inputs = (spec.browsers ?? []).map((browser, index) => {
    const ownerId = browser.owner === "subagent" ? subagent.resource.toString() : browser.owner === "other" ? "chat:other" : browser.owner === "unowned" ? void 0 : mainChat.resource.toString();
    const model = new class extends mock() {
      constructor() {
        super(...arguments);
        this.owner = ownerId ? { mainWindowId: 1, sessionId: ownerId } : { mainWindowId: 1 };
        this.sharingState = browser.sharingState ?? BrowserViewSharingState.NotShared;
      }
    }();
    return new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLabel = Event.None;
      }
      get id() {
        return `browser-${index}`;
      }
      get model() {
        return model;
      }
      get title() {
        return browser.title;
      }
      get url() {
        return browser.url;
      }
    }();
  });
  const knownBrowsers = new Map(inputs.map((input) => [input.id, input]));
  const browserViewService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeBrowserViews = Event.None;
    }
    getKnownBrowserViews() {
      return knownBrowsers;
    }
    getContextualBrowserViews() {
      return knownBrowsers;
    }
    async getPreferredGroup() {
      return void 0;
    }
  }();
  let pickerItems = [];
  const actionWidgetService = new class extends mock() {
    get isVisible() {
      return false;
    }
    hide() {
    }
    show(_user, _supportsPreview, items, delegate) {
      pickerItems = items.map((item) => {
        const value = item.item;
        return {
          kind: item.kind,
          label: item.label ?? "",
          category: item.group?.title ?? "",
          icon: item.group?.icon?.id ?? "",
          select: value === void 0 ? void 0 : () => delegate.onSelect(value)
        };
      });
    }
  }();
  const selectPickerItem = (label) => {
    const item = pickerItems.find((item2) => item2.label === label && item2.select);
    if (!item?.select) {
      throw new Error(`Picker item '${label}' not found`);
    }
    item.select();
  };
  let browserOpenCount = 0;
  let openedBrowserId;
  const browserIds = new Map(inputs.map((input) => [input, input.id]));
  const editorService = new class extends mock() {
    findEditors() {
      return [];
    }
    async openEditor(editor) {
      browserOpenCount++;
      openedBrowserId = browserIds.get(editor);
      return void 0;
    }
  }();
  const control = store.add(new SessionBrowsersControl(
    constObservable(session),
    constObservable(mainChat),
    constObservable(spec.enabled ?? true),
    browserViewService,
    actionWidgetService,
    editorService
  ));
  return {
    control,
    getPickerItems: () => pickerItems,
    selectPickerItem,
    getBrowserOpenCount: () => browserOpenCount,
    getOpenedBrowserId: () => openedBrowserId,
    addSubagent: () => chats.set([mainChat, subagent], void 0)
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
suite("SessionBrowsersControl", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("renders single and aggregate labels, icons, and fallback", () => {
    const cases = [
      { browsers: [{ title: "Visual Studio Code" }] },
      { browsers: [{}] },
      { browsers: [{ title: "Docs" }, { title: "Preview" }] }
    ];
    const disabled = createControl({ browsers: [{ title: "Hidden browser" }], enabled: false }, store);
    assert.deepStrictEqual({
      enabled: cases.map((spec) => summarize(createControl(spec, store).control)),
      disabledVisible: disabled.control.isVisible.get()
    }, {
      enabled: [
        { text: "Visual Studio Code", ariaLabel: "Open Visual Studio Code", icons: ["globe"] },
        { text: "Browser", ariaLabel: "Open Browser", icons: ["globe"] },
        { text: "2 Active Browsers", ariaLabel: "Show 2 browsers", icons: ["globe", "chevron-down"] }
      ],
      disabledVisible: false
    });
  });
  test("debug data forces browsers while disabled and clears cleanly", () => {
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
      forced: { text: "Debug Browser", ariaLabel: "Open Debug Browser", icons: ["globe"] },
      visibleAfterClear: false
    });
  });
  test("lists browsers of the chat and its subagents, but not of other chats", async () => {
    const harness = createControl({
      browsers: [
        { title: "Docs" },
        { title: "Subagent Preview", owner: "subagent" },
        { title: "Other Session", owner: "other" }
      ]
    }, store);
    click(harness.control);
    harness.selectPickerItem("Subagent Preview");
    await Promise.resolve();
    assert.deepStrictEqual({
      items: harness.getPickerItems().map(({ select: _select, ...item }) => item),
      openedBrowser: harness.getOpenedBrowserId()
    }, {
      items: [
        { kind: ActionListItemKind.Header, label: "Browsers", category: "Browsers", icon: "" },
        { kind: ActionListItemKind.Action, label: "Docs", category: "", icon: Codicon.globe.id },
        { kind: ActionListItemKind.Action, label: "Subagent Preview", category: "", icon: Codicon.globe.id }
      ],
      openedBrowser: "browser-1"
    });
  });
  test("shows a subagent browser registered before the subagent joins the session", () => {
    const harness = createControl({ browsers: [{ title: "Subagent Preview", owner: "subagent" }], withoutSubagent: true }, store);
    const beforeJoin = harness.control.isVisible.get();
    harness.addSubagent();
    assert.deepStrictEqual({ beforeJoin, afterJoin: summarize(harness.control) }, {
      beforeJoin: false,
      afterJoin: { text: "Subagent Preview", ariaLabel: "Open Subagent Preview", icons: ["globe"] }
    });
  });
  test("opens a single browser directly", async () => {
    const harness = createControl({ browsers: [{ title: "Preview" }] }, store);
    click(harness.control);
    await Promise.resolve();
    assert.deepStrictEqual({
      openCount: harness.getBrowserOpenCount(),
      openedBrowser: harness.getOpenedBrowserId()
    }, {
      openCount: 1,
      openedBrowser: "browser-0"
    });
  });
  test("prefers a shared browser for the same destination and otherwise opens the normal browser", async () => {
    const sharedHost = createControl({
      browsers: [
        { title: "Normal", url: "https://example.com/start" },
        { title: "Shared Host", url: "https://example.com/live", owner: "unowned", sharingState: BrowserViewSharingState.Shared }
      ]
    }, store);
    click(sharedHost.control);
    await Promise.resolve();
    const sharedExact = createControl({
      browsers: [
        { title: "Normal", url: "https://example.com/start" },
        { title: "Shared Host", url: "https://example.com/live", owner: "unowned", sharingState: BrowserViewSharingState.Shared },
        { title: "Shared Exact", url: "https://example.com/start", owner: "unowned", sharingState: BrowserViewSharingState.Shared }
      ]
    }, store);
    click(sharedExact.control);
    await Promise.resolve();
    const fallback = createControl({
      browsers: [
        { title: "Normal", url: "https://example.com/start" },
        { title: "Unrelated Shared", url: "https://other.test/live", owner: "unowned", sharingState: BrowserViewSharingState.Shared }
      ]
    }, store);
    click(fallback.control);
    await Promise.resolve();
    assert.deepStrictEqual({
      sharedHost: sharedHost.getOpenedBrowserId(),
      sharedExact: sharedExact.getOpenedBrowserId(),
      fallback: fallback.getOpenedBrowserId()
    }, {
      sharedHost: "browser-1",
      sharedExact: "browser-2",
      fallback: "browser-0"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3Nlclxcc2Vzc2lvbkJyb3dzZXJzQ29udHJvbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdEl0ZW1LaW5kLCBJQWN0aW9uTGlzdERlbGVnYXRlLCBJQWN0aW9uTGlzdEl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUsIElCcm93c2VyVmlld01vZGVsLCBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0T3JpZ2luS2luZCwgSUNoYXQsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkJyb3dzZXJzQ29udHJvbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2Vzc2lvbkJyb3dzZXJzQ29udHJvbC5qcyc7XG5cbmludGVyZmFjZSBJQ29udHJvbFNwZWMge1xuXHRyZWFkb25seSBicm93c2Vycz86IHJlYWRvbmx5IHtcblx0XHRyZWFkb25seSB0aXRsZT86IHN0cmluZztcblx0XHRyZWFkb25seSB1cmw/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgb3duZXI/OiAnbWFpbicgfCAnc3ViYWdlbnQnIHwgJ290aGVyJyB8ICd1bm93bmVkJztcblx0XHRyZWFkb25seSBzaGFyaW5nU3RhdGU/OiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZTtcblx0fVtdO1xuXHRyZWFkb25seSBlbmFibGVkPzogYm9vbGVhbjtcblx0LyoqIFN0YXJ0IHdpdGggb25seSB0aGUgbWFpbiBjaGF0LCBzbyB0aGUgc3ViYWdlbnQgY2FuIGJlIGFkZGVkIGxhdGVyLiAqL1xuXHRyZWFkb25seSB3aXRob3V0U3ViYWdlbnQ/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUNvbnRyb2xIYXJuZXNzIHtcblx0cmVhZG9ubHkgY29udHJvbDogU2Vzc2lvbkJyb3dzZXJzQ29udHJvbDtcblx0cmVhZG9ubHkgZ2V0UGlja2VySXRlbXM6ICgpID0+IHJlYWRvbmx5IElDYXB0dXJlZFBpY2tlckl0ZW1bXTtcblx0cmVhZG9ubHkgc2VsZWN0UGlja2VySXRlbTogKGxhYmVsOiBzdHJpbmcpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IGdldEJyb3dzZXJPcGVuQ291bnQ6ICgpID0+IG51bWJlcjtcblx0cmVhZG9ubHkgZ2V0T3BlbmVkQnJvd3NlcklkOiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGFkZFN1YmFnZW50OiAoKSA9PiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSUNhcHR1cmVkUGlja2VySXRlbSB7XG5cdHJlYWRvbmx5IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZDtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgY2F0ZWdvcnk6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogc3RyaW5nO1xuXHRyZWFkb25seSBzZWxlY3Q/OiAoKSA9PiB2b2lkO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDb250cm9sKHNwZWM6IElDb250cm9sU3BlYywgc3RvcmU6IFJldHVyblR5cGU8dHlwZW9mIGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZT4pOiBJQ29udHJvbEhhcm5lc3Mge1xuXHRjb25zdCBtYWluQ2hhdCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXQ+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0Om1haW4nKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB0aXRsZSA9IGNvbnN0T2JzZXJ2YWJsZSgnTWFpbicpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXR1cyA9IGNvbnN0T2JzZXJ2YWJsZShTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHR9KCk7XG5cdGNvbnN0IHN1YmFnZW50ID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdD4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQ6c3ViYWdlbnQtMCcpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHRpdGxlID0gY29uc3RPYnNlcnZhYmxlKCdSZXNlYXJjaCcpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXR1cyA9IGNvbnN0T2JzZXJ2YWJsZShTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9yaWdpbiA9IHsga2luZDogQ2hhdE9yaWdpbktpbmQuVG9vbCwgcGFyZW50Q2hhdDogbWFpbkNoYXQucmVzb3VyY2UgfTtcblx0fSgpO1xuXHRjb25zdCBjaGF0cyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQ2hhdFtdPignY2hhdHMnLCBzcGVjLndpdGhvdXRTdWJhZ2VudCA/IFttYWluQ2hhdF0gOiBbbWFpbkNoYXQsIHN1YmFnZW50XSk7XG5cdGNvbnN0IHNlc3Npb24gPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBY3RpdmVTZXNzaW9uPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IFVSSS5wYXJzZSgnc2Vzc2lvbjptYWluJyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2hhdHMgPSBjaGF0cztcblx0fSgpO1xuXG5cdGNvbnN0IGlucHV0cyA9IChzcGVjLmJyb3dzZXJzID8/IFtdKS5tYXAoKGJyb3dzZXIsIGluZGV4KSA9PiB7XG5cdFx0Y29uc3Qgb3duZXJJZCA9IGJyb3dzZXIub3duZXIgPT09ICdzdWJhZ2VudCdcblx0XHRcdD8gc3ViYWdlbnQucmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdFx0OiBicm93c2VyLm93bmVyID09PSAnb3RoZXInID8gJ2NoYXQ6b3RoZXInIDogYnJvd3Nlci5vd25lciA9PT0gJ3Vub3duZWQnID8gdW5kZWZpbmVkIDogbWFpbkNoYXQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUJyb3dzZXJWaWV3TW9kZWw+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3duZXIgPSBvd25lcklkID8geyBtYWluV2luZG93SWQ6IDEsIHNlc3Npb25JZDogb3duZXJJZCB9IDogeyBtYWluV2luZG93SWQ6IDEgfTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNoYXJpbmdTdGF0ZSA9IGJyb3dzZXIuc2hhcmluZ1N0YXRlID8/IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLk5vdFNoYXJlZDtcblx0XHR9KCk7XG5cdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8QnJvd3NlckVkaXRvcklucHV0PigpIHtcblx0XHRcdG92ZXJyaWRlIGdldCBpZCgpOiBzdHJpbmcgeyByZXR1cm4gYGJyb3dzZXItJHtpbmRleH1gOyB9XG5cdFx0XHRvdmVycmlkZSBnZXQgbW9kZWwoKTogSUJyb3dzZXJWaWV3TW9kZWwgeyByZXR1cm4gbW9kZWw7IH1cblx0XHRcdG92ZXJyaWRlIGdldCB0aXRsZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gYnJvd3Nlci50aXRsZTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0IHVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gYnJvd3Nlci51cmw7IH1cblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFiZWwgPSBFdmVudC5Ob25lO1xuXHRcdH0oKTtcblx0fSk7XG5cdGNvbnN0IGtub3duQnJvd3NlcnMgPSBuZXcgTWFwKGlucHV0cy5tYXAoaW5wdXQgPT4gW2lucHV0LmlkLCBpbnB1dF0pKTtcblx0Y29uc3QgYnJvd3NlclZpZXdTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUJyb3dzZXJWaWV3cyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0S25vd25Ccm93c2VyVmlld3MoKSB7IHJldHVybiBrbm93bkJyb3dzZXJzOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0Q29udGV4dHVhbEJyb3dzZXJWaWV3cygpIHsgcmV0dXJuIGtub3duQnJvd3NlcnM7IH1cblx0XHRvdmVycmlkZSBhc3luYyBnZXRQcmVmZXJyZWRHcm91cCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHR9KCk7XG5cblx0bGV0IHBpY2tlckl0ZW1zOiBJQ2FwdHVyZWRQaWNrZXJJdGVtW10gPSBbXTtcblx0Y29uc3QgYWN0aW9uV2lkZ2V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGlvbldpZGdldFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldCBpc1Zpc2libGUoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdG92ZXJyaWRlIGhpZGUoKTogdm9pZCB7IH1cblx0XHRvdmVycmlkZSBzaG93PFQ+KF91c2VyOiBzdHJpbmcsIF9zdXBwb3J0c1ByZXZpZXc6IGJvb2xlYW4sIGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXSwgZGVsZWdhdGU6IElBY3Rpb25MaXN0RGVsZWdhdGU8VD4pOiB2b2lkIHtcblx0XHRcdHBpY2tlckl0ZW1zID0gaXRlbXMubWFwKGl0ZW0gPT4ge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGl0ZW0uaXRlbTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiBpdGVtLmtpbmQsXG5cdFx0XHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwgPz8gJycsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IGl0ZW0uZ3JvdXA/LnRpdGxlID8/ICcnLFxuXHRcdFx0XHRcdGljb246IGl0ZW0uZ3JvdXA/Lmljb24/LmlkID8/ICcnLFxuXHRcdFx0XHRcdHNlbGVjdDogdmFsdWUgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6ICgpID0+IGRlbGVnYXRlLm9uU2VsZWN0KHZhbHVlKSxcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fSgpO1xuXHRjb25zdCBzZWxlY3RQaWNrZXJJdGVtID0gKGxhYmVsOiBzdHJpbmcpID0+IHtcblx0XHRjb25zdCBpdGVtID0gcGlja2VySXRlbXMuZmluZChpdGVtID0+IGl0ZW0ubGFiZWwgPT09IGxhYmVsICYmIGl0ZW0uc2VsZWN0KTtcblx0XHRpZiAoIWl0ZW0/LnNlbGVjdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQaWNrZXIgaXRlbSAnJHtsYWJlbH0nIG5vdCBmb3VuZGApO1xuXHRcdH1cblx0XHRpdGVtLnNlbGVjdCgpO1xuXHR9O1xuXG5cdGxldCBicm93c2VyT3BlbkNvdW50ID0gMDtcblx0bGV0IG9wZW5lZEJyb3dzZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBicm93c2VySWRzID0gbmV3IE1hcDxvYmplY3QsIHN0cmluZz4oaW5wdXRzLm1hcChpbnB1dCA9PiBbaW5wdXQsIGlucHV0LmlkXSkpO1xuXHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgZmluZEVkaXRvcnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5FZGl0b3IoZWRpdG9yOiBvYmplY3QpIHtcblx0XHRcdGJyb3dzZXJPcGVuQ291bnQrKztcblx0XHRcdG9wZW5lZEJyb3dzZXJJZCA9IGJyb3dzZXJJZHMuZ2V0KGVkaXRvcik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fSgpO1xuXG5cdGNvbnN0IGNvbnRyb2wgPSBzdG9yZS5hZGQobmV3IFNlc3Npb25Ccm93c2Vyc0NvbnRyb2woXG5cdFx0Y29uc3RPYnNlcnZhYmxlKHNlc3Npb24pLFxuXHRcdGNvbnN0T2JzZXJ2YWJsZShtYWluQ2hhdCksXG5cdFx0Y29uc3RPYnNlcnZhYmxlKHNwZWMuZW5hYmxlZCA/PyB0cnVlKSxcblx0XHRicm93c2VyVmlld1NlcnZpY2UsXG5cdFx0YWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRlZGl0b3JTZXJ2aWNlLFxuXHQpKTtcblxuXHRyZXR1cm4ge1xuXHRcdGNvbnRyb2wsXG5cdFx0Z2V0UGlja2VySXRlbXM6ICgpID0+IHBpY2tlckl0ZW1zLFxuXHRcdHNlbGVjdFBpY2tlckl0ZW0sXG5cdFx0Z2V0QnJvd3Nlck9wZW5Db3VudDogKCkgPT4gYnJvd3Nlck9wZW5Db3VudCxcblx0XHRnZXRPcGVuZWRCcm93c2VySWQ6ICgpID0+IG9wZW5lZEJyb3dzZXJJZCxcblx0XHRhZGRTdWJhZ2VudDogKCkgPT4gY2hhdHMuc2V0KFttYWluQ2hhdCwgc3ViYWdlbnRdLCB1bmRlZmluZWQpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzdW1tYXJpemUoY29udHJvbDogU2Vzc2lvbkJyb3dzZXJzQ29udHJvbCk6IHsgcmVhZG9ubHkgdGV4dDogc3RyaW5nOyByZWFkb25seSBhcmlhTGFiZWw6IHN0cmluZyB8IG51bGw7IHJlYWRvbmx5IGljb25zOiByZWFkb25seSBzdHJpbmdbXSB9IHtcblx0Y29uc3QgYnV0dG9uID0gY29udHJvbC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbi1hY3Rpdml0eS1waWxsLWJ1dHRvbicpITtcblx0Y29uc3Qga25vd25JY29ucyA9IFtDb2RpY29uLmdsb2JlLCBDb2RpY29uLmFnZW50LCBDb2RpY29uLnNlc3Npb25JblByb2dyZXNzLCBDb2RpY29uLmNoZXZyb25Eb3duXTtcblx0cmV0dXJuIHtcblx0XHR0ZXh0OiBidXR0b24udGV4dENvbnRlbnQgPz8gJycsXG5cdFx0YXJpYUxhYmVsOiBidXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0aWNvbnM6IFsuLi5idXR0b24ucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5jb2RpY29uJyldXG5cdFx0XHQubWFwKGVsZW1lbnQgPT4ga25vd25JY29ucy5maW5kKGljb24gPT4gZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoYGNvZGljb24tJHtpY29uLmlkfWApKT8uaWQgPz8gJ3Vua25vd24nKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY2xpY2soY29udHJvbDogU2Vzc2lvbkJyb3dzZXJzQ29udHJvbCk6IHZvaWQge1xuXHRjb250cm9sLmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5zZXNzaW9uLWFjdGl2aXR5LXBpbGwtYnV0dG9uJykhLmNsaWNrKCk7XG59XG5cbnN1aXRlKCdTZXNzaW9uQnJvd3NlcnNDb250cm9sJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVuZGVycyBzaW5nbGUgYW5kIGFnZ3JlZ2F0ZSBsYWJlbHMsIGljb25zLCBhbmQgZmFsbGJhY2snLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FzZXM6IElDb250cm9sU3BlY1tdID0gW1xuXHRcdFx0eyBicm93c2VyczogW3sgdGl0bGU6ICdWaXN1YWwgU3R1ZGlvIENvZGUnIH1dIH0sXG5cdFx0XHR7IGJyb3dzZXJzOiBbe31dIH0sXG5cdFx0XHR7IGJyb3dzZXJzOiBbeyB0aXRsZTogJ0RvY3MnIH0sIHsgdGl0bGU6ICdQcmV2aWV3JyB9XSB9LFxuXHRcdF07XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBjcmVhdGVDb250cm9sKHsgYnJvd3NlcnM6IFt7IHRpdGxlOiAnSGlkZGVuIGJyb3dzZXInIH1dLCBlbmFibGVkOiBmYWxzZSB9LCBzdG9yZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVuYWJsZWQ6IGNhc2VzLm1hcChzcGVjID0+IHN1bW1hcml6ZShjcmVhdGVDb250cm9sKHNwZWMsIHN0b3JlKS5jb250cm9sKSksXG5cdFx0XHRkaXNhYmxlZFZpc2libGU6IGRpc2FibGVkLmNvbnRyb2wuaXNWaXNpYmxlLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdGVuYWJsZWQ6IFtcblx0XHRcdFx0eyB0ZXh0OiAnVmlzdWFsIFN0dWRpbyBDb2RlJywgYXJpYUxhYmVsOiAnT3BlbiBWaXN1YWwgU3R1ZGlvIENvZGUnLCBpY29uczogWydnbG9iZSddIH0sXG5cdFx0XHRcdHsgdGV4dDogJ0Jyb3dzZXInLCBhcmlhTGFiZWw6ICdPcGVuIEJyb3dzZXInLCBpY29uczogWydnbG9iZSddIH0sXG5cdFx0XHRcdHsgdGV4dDogJzIgQWN0aXZlIEJyb3dzZXJzJywgYXJpYUxhYmVsOiAnU2hvdyAyIGJyb3dzZXJzJywgaWNvbnM6IFsnZ2xvYmUnLCAnY2hldnJvbi1kb3duJ10gfSxcblx0XHRcdF0sXG5cdFx0XHRkaXNhYmxlZFZpc2libGU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWJ1ZyBkYXRhIGZvcmNlcyBicm93c2VycyB3aGlsZSBkaXNhYmxlZCBhbmQgY2xlYXJzIGNsZWFubHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFybmVzcyA9IGNyZWF0ZUNvbnRyb2woeyBlbmFibGVkOiBmYWxzZSB9LCBzdG9yZSk7XG5cdFx0aGFybmVzcy5jb250cm9sLnNldERlYnVnRGF0YSh7XG5cdFx0XHRzdGF0czogeyBmaWxlczogMiwgaW5zZXJ0aW9uczogMTAsIGRlbGV0aW9uczogMyB9LFxuXHRcdFx0bWFya2Rvd25GaWxlczogWydSRUFETUUubWQnXSxcblx0XHRcdGJyb3dzZXJzOiBbJ0RlYnVnIEJyb3dzZXInXSxcblx0XHRcdHN1YmFnZW50czogWydEZWJ1ZyBTdWJhZ2VudCddLFxuXHRcdFx0Y2lGYWlsZWQ6IDIsXG5cdFx0XHRjaVBlbmRpbmc6IDEsXG5cdFx0XHRwckZlZWRiYWNrOiAzLFxuXHRcdFx0YWdlbnRGZWVkYmFjazogNCxcblx0XHRcdGF1dG9JbmNyZW1lbnRDaGFuZ2VzOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBmb3JjZWQgPSBzdW1tYXJpemUoaGFybmVzcy5jb250cm9sKTtcblx0XHRoYXJuZXNzLmNvbnRyb2wuc2V0RGVidWdEYXRhKHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZm9yY2VkLCB2aXNpYmxlQWZ0ZXJDbGVhcjogaGFybmVzcy5jb250cm9sLmlzVmlzaWJsZS5nZXQoKSB9LCB7XG5cdFx0XHRmb3JjZWQ6IHsgdGV4dDogJ0RlYnVnIEJyb3dzZXInLCBhcmlhTGFiZWw6ICdPcGVuIERlYnVnIEJyb3dzZXInLCBpY29uczogWydnbG9iZSddIH0sXG5cdFx0XHR2aXNpYmxlQWZ0ZXJDbGVhcjogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RzIGJyb3dzZXJzIG9mIHRoZSBjaGF0IGFuZCBpdHMgc3ViYWdlbnRzLCBidXQgbm90IG9mIG90aGVyIGNoYXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhhcm5lc3MgPSBjcmVhdGVDb250cm9sKHtcblx0XHRcdGJyb3dzZXJzOiBbXG5cdFx0XHRcdHsgdGl0bGU6ICdEb2NzJyB9LFxuXHRcdFx0XHR7IHRpdGxlOiAnU3ViYWdlbnQgUHJldmlldycsIG93bmVyOiAnc3ViYWdlbnQnIH0sXG5cdFx0XHRcdHsgdGl0bGU6ICdPdGhlciBTZXNzaW9uJywgb3duZXI6ICdvdGhlcicgfSxcblx0XHRcdF0sXG5cdFx0fSwgc3RvcmUpO1xuXG5cdFx0Y2xpY2soaGFybmVzcy5jb250cm9sKTtcblx0XHRoYXJuZXNzLnNlbGVjdFBpY2tlckl0ZW0oJ1N1YmFnZW50IFByZXZpZXcnKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXRlbXM6IGhhcm5lc3MuZ2V0UGlja2VySXRlbXMoKS5tYXAoKHsgc2VsZWN0OiBfc2VsZWN0LCAuLi5pdGVtIH0pID0+IGl0ZW0pLFxuXHRcdFx0b3BlbmVkQnJvd3NlcjogaGFybmVzcy5nZXRPcGVuZWRCcm93c2VySWQoKSxcblx0XHR9LCB7XG5cdFx0XHRpdGVtczogW1xuXHRcdFx0XHR7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIsIGxhYmVsOiAnQnJvd3NlcnMnLCBjYXRlZ29yeTogJ0Jyb3dzZXJzJywgaWNvbjogJycgfSxcblx0XHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLCBsYWJlbDogJ0RvY3MnLCBjYXRlZ29yeTogJycsIGljb246IENvZGljb24uZ2xvYmUuaWQgfSxcblx0XHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLCBsYWJlbDogJ1N1YmFnZW50IFByZXZpZXcnLCBjYXRlZ29yeTogJycsIGljb246IENvZGljb24uZ2xvYmUuaWQgfSxcblx0XHRcdF0sXG5cdFx0XHRvcGVuZWRCcm93c2VyOiAnYnJvd3Nlci0xJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgYSBzdWJhZ2VudCBicm93c2VyIHJlZ2lzdGVyZWQgYmVmb3JlIHRoZSBzdWJhZ2VudCBqb2lucyB0aGUgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gY3JlYXRlQ29udHJvbCh7IGJyb3dzZXJzOiBbeyB0aXRsZTogJ1N1YmFnZW50IFByZXZpZXcnLCBvd25lcjogJ3N1YmFnZW50JyB9XSwgd2l0aG91dFN1YmFnZW50OiB0cnVlIH0sIHN0b3JlKTtcblx0XHRjb25zdCBiZWZvcmVKb2luID0gaGFybmVzcy5jb250cm9sLmlzVmlzaWJsZS5nZXQoKTtcblx0XHRoYXJuZXNzLmFkZFN1YmFnZW50KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYmVmb3JlSm9pbiwgYWZ0ZXJKb2luOiBzdW1tYXJpemUoaGFybmVzcy5jb250cm9sKSB9LCB7XG5cdFx0XHRiZWZvcmVKb2luOiBmYWxzZSxcblx0XHRcdGFmdGVySm9pbjogeyB0ZXh0OiAnU3ViYWdlbnQgUHJldmlldycsIGFyaWFMYWJlbDogJ09wZW4gU3ViYWdlbnQgUHJldmlldycsIGljb25zOiBbJ2dsb2JlJ10gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbnMgYSBzaW5nbGUgYnJvd3NlciBkaXJlY3RseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gY3JlYXRlQ29udHJvbCh7IGJyb3dzZXJzOiBbeyB0aXRsZTogJ1ByZXZpZXcnIH1dIH0sIHN0b3JlKTtcblx0XHRjbGljayhoYXJuZXNzLmNvbnRyb2wpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcGVuQ291bnQ6IGhhcm5lc3MuZ2V0QnJvd3Nlck9wZW5Db3VudCgpLFxuXHRcdFx0b3BlbmVkQnJvd3NlcjogaGFybmVzcy5nZXRPcGVuZWRCcm93c2VySWQoKSxcblx0XHR9LCB7XG5cdFx0XHRvcGVuQ291bnQ6IDEsXG5cdFx0XHRvcGVuZWRCcm93c2VyOiAnYnJvd3Nlci0wJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVycyBhIHNoYXJlZCBicm93c2VyIGZvciB0aGUgc2FtZSBkZXN0aW5hdGlvbiBhbmQgb3RoZXJ3aXNlIG9wZW5zIHRoZSBub3JtYWwgYnJvd3NlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzaGFyZWRIb3N0ID0gY3JlYXRlQ29udHJvbCh7XG5cdFx0XHRicm93c2VyczogW1xuXHRcdFx0XHR7IHRpdGxlOiAnTm9ybWFsJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zdGFydCcgfSxcblx0XHRcdFx0eyB0aXRsZTogJ1NoYXJlZCBIb3N0JywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9saXZlJywgb3duZXI6ICd1bm93bmVkJywgc2hhcmluZ1N0YXRlOiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWQgfSxcblx0XHRcdF0sXG5cdFx0fSwgc3RvcmUpO1xuXHRcdGNsaWNrKHNoYXJlZEhvc3QuY29udHJvbCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRjb25zdCBzaGFyZWRFeGFjdCA9IGNyZWF0ZUNvbnRyb2woe1xuXHRcdFx0YnJvd3NlcnM6IFtcblx0XHRcdFx0eyB0aXRsZTogJ05vcm1hbCcsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc3RhcnQnIH0sXG5cdFx0XHRcdHsgdGl0bGU6ICdTaGFyZWQgSG9zdCcsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vbGl2ZScsIG93bmVyOiAndW5vd25lZCcsIHNoYXJpbmdTdGF0ZTogQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuU2hhcmVkIH0sXG5cdFx0XHRcdHsgdGl0bGU6ICdTaGFyZWQgRXhhY3QnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N0YXJ0Jywgb3duZXI6ICd1bm93bmVkJywgc2hhcmluZ1N0YXRlOiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWQgfSxcblx0XHRcdF0sXG5cdFx0fSwgc3RvcmUpO1xuXHRcdGNsaWNrKHNoYXJlZEV4YWN0LmNvbnRyb2wpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBjcmVhdGVDb250cm9sKHtcblx0XHRcdGJyb3dzZXJzOiBbXG5cdFx0XHRcdHsgdGl0bGU6ICdOb3JtYWwnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3N0YXJ0JyB9LFxuXHRcdFx0XHR7IHRpdGxlOiAnVW5yZWxhdGVkIFNoYXJlZCcsIHVybDogJ2h0dHBzOi8vb3RoZXIudGVzdC9saXZlJywgb3duZXI6ICd1bm93bmVkJywgc2hhcmluZ1N0YXRlOiBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWQgfSxcblx0XHRcdF0sXG5cdFx0fSwgc3RvcmUpO1xuXHRcdGNsaWNrKGZhbGxiYWNrLmNvbnRyb2wpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaGFyZWRIb3N0OiBzaGFyZWRIb3N0LmdldE9wZW5lZEJyb3dzZXJJZCgpLFxuXHRcdFx0c2hhcmVkRXhhY3Q6IHNoYXJlZEV4YWN0LmdldE9wZW5lZEJyb3dzZXJJZCgpLFxuXHRcdFx0ZmFsbGJhY2s6IGZhbGxiYWNrLmdldE9wZW5lZEJyb3dzZXJJZCgpLFxuXHRcdH0sIHtcblx0XHRcdHNoYXJlZEhvc3Q6ICdicm93c2VyLTEnLFxuXHRcdFx0c2hhcmVkRXhhY3Q6ICdicm93c2VyLTInLFxuXHRcdFx0ZmFsbGJhY2s6ICdicm93c2VyLTAnLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUIsdUJBQXVCO0FBQ2pELFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBZ0U7QUFH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
