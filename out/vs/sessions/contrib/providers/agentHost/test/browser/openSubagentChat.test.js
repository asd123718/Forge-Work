import assert from "assert";
import { Action } from "../../../../../../base/common/actions.js";
import { Event } from "../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ILanguageModelsService } from "../../../../../../workbench/contrib/chat/common/languageModels.js";
import { workbenchInstantiationService } from "../../../../../../workbench/test/browser/workbenchTestServices.js";
import { ISessionsService } from "../../../../../services/sessions/browser/sessionsService.js";
import { OpenSubagentChatActionViewItem, shouldShowSubagentModel } from "../../browser/openSubagentChat.js";
class TestOpenSubagentChatActionViewItem extends OpenSubagentChatActionViewItem {
  get tooltip() {
    return this.getTooltip();
  }
}
suite("OpenSubagentChatActionViewItem", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("shows the subagent model unless it matches the parent model", () => {
    assert.deepStrictEqual([
      shouldShowSubagentModel(void 0, "agent-host-copilotcli:gpt-5.6-sol", "GPT-5.6 Sol", "gpt-5.6-sol"),
      shouldShowSubagentModel("GPT-5.6 Sol", void 0, void 0, void 0),
      shouldShowSubagentModel("gpt-5.6-sol", "agent-host-copilotcli:gpt-5.6-sol", "GPT-5.6 Sol", "gpt-5.6-sol"),
      shouldShowSubagentModel("GPT-5.6 Sol", "agent-host-copilotcli:gpt-5.6-sol", "GPT-5.6 Sol", "gpt-5.6-sol"),
      shouldShowSubagentModel("Claude Opus 4.8", "agent-host-copilotcli:gpt-5.6-sol", "GPT-5.6 Sol", "gpt-5.6-sol")
    ], [
      false,
      true,
      false,
      false,
      true
    ]);
  });
  test("disables and hides the action until its peer chat resolves", () => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    instantiationService.stub(ISessionsService, {
      activeSession: observableValue("activeSession", void 0),
      visibleSessions: observableValue("visibleSessions", [])
    });
    instantiationService.stub(ILanguageModelsService, {
      onDidChangeLanguageModels: Event.None,
      lookupLanguageModel: () => void 0
    });
    const action = store.add(new Action("openSubagent", "Open Subagent"));
    const viewItem = store.add(instantiationService.createInstance(
      OpenSubagentChatActionViewItem,
      { chatResource: "ahp-chat://subagent/session/tool-call" },
      action,
      {},
      false
    ));
    const container = document.createElement("div");
    viewItem.render(container);
    assert.deepStrictEqual({
      enabled: viewItem.action.enabled,
      sourceActionEnabled: action.enabled,
      hidden: container.classList.contains("hidden"),
      ariaHidden: container.getAttribute("aria-hidden"),
      modelHidden: container.querySelector(".chat-subagent-pill-model")?.classList.contains("hidden")
    }, {
      enabled: false,
      sourceActionEnabled: false,
      hidden: true,
      ariaHidden: "true",
      modelHidden: true
    });
  });
  test("refreshes accessible metadata when the active tool clears", () => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    instantiationService.stub(ISessionsService, {
      activeSession: observableValue("activeSession", void 0),
      visibleSessions: observableValue("visibleSessions", [])
    });
    instantiationService.stub(ILanguageModelsService, {
      onDidChangeLanguageModels: Event.None,
      lookupLanguageModel: () => void 0
    });
    const action = store.add(new Action("openSubagent", "Open Subagent"));
    const viewItem = store.add(instantiationService.createInstance(
      TestOpenSubagentChatActionViewItem,
      { chatResource: "ahp-chat://subagent/session/tool-call", isActive: true, activeToolLabel: "Reading files" },
      action,
      {},
      false
    ));
    const container = document.createElement("div");
    viewItem.render(container);
    const withActiveTool = {
      tooltip: viewItem.tooltip,
      ariaLabel: container.getAttribute("aria-label")
    };
    viewItem.setActionContext({ chatResource: "ahp-chat://subagent/session/tool-call" });
    assert.deepStrictEqual({
      withActiveTool,
      withoutActiveTool: {
        tooltip: viewItem.tooltip,
        ariaLabel: container.getAttribute("aria-label")
      }
    }, {
      withActiveTool: {
        tooltip: "Open Subagent\nActive tool: Reading files",
        ariaLabel: "Open Subagent. Subagent is working. Active tool Reading files"
      },
      withoutActiveTool: {
        tooltip: "Open Subagent",
        ariaLabel: "Open Subagent"
      }
    });
  });
  test("keeps matching model metadata in the hover while hiding it inline", () => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    instantiationService.stub(ISessionsService, {
      activeSession: observableValue("activeSession", void 0),
      visibleSessions: observableValue("visibleSessions", [])
    });
    instantiationService.stub(ILanguageModelsService, {
      onDidChangeLanguageModels: Event.None,
      lookupLanguageModel: () => void 0
    });
    const action = store.add(new Action("openSubagent", "Open Subagent"));
    const viewItem = store.add(instantiationService.createInstance(
      TestOpenSubagentChatActionViewItem,
      {
        chatResource: "ahp-chat://subagent/session/tool-call",
        modelName: "GPT-5.6 Sol",
        parentModelName: "GPT-5.6 Sol"
      },
      action,
      {},
      false
    ));
    const container = document.createElement("div");
    viewItem.render(container);
    assert.deepStrictEqual({
      modelHidden: container.querySelector(".chat-subagent-pill-model")?.classList.contains("hidden"),
      tooltip: viewItem.tooltip,
      ariaLabel: container.getAttribute("aria-label")
    }, {
      modelHidden: true,
      tooltip: "Open Subagent\nModel: GPT-5.6 Sol",
      ariaLabel: "Open Subagent. Model GPT-5.6 Sol"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXG9wZW5TdWJhZ2VudENoYXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW0sIHNob3VsZFNob3dTdWJhZ2VudE1vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9vcGVuU3ViYWdlbnRDaGF0LmpzJztcblxuY2xhc3MgVGVzdE9wZW5TdWJhZ2VudENoYXRBY3Rpb25WaWV3SXRlbSBleHRlbmRzIE9wZW5TdWJhZ2VudENoYXRBY3Rpb25WaWV3SXRlbSB7XG5cdGdldCB0b29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VG9vbHRpcCgpO1xuXHR9XG59XG5cbnN1aXRlKCdPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW0nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2hvd3MgdGhlIHN1YmFnZW50IG1vZGVsIHVubGVzcyBpdCBtYXRjaGVzIHRoZSBwYXJlbnQgbW9kZWwnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRzaG91bGRTaG93U3ViYWdlbnRNb2RlbCh1bmRlZmluZWQsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Z3B0LTUuNi1zb2wnLCAnR1BULTUuNiBTb2wnLCAnZ3B0LTUuNi1zb2wnKSxcblx0XHRcdHNob3VsZFNob3dTdWJhZ2VudE1vZGVsKCdHUFQtNS42IFNvbCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLFxuXHRcdFx0c2hvdWxkU2hvd1N1YmFnZW50TW9kZWwoJ2dwdC01LjYtc29sJywgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpncHQtNS42LXNvbCcsICdHUFQtNS42IFNvbCcsICdncHQtNS42LXNvbCcpLFxuXHRcdFx0c2hvdWxkU2hvd1N1YmFnZW50TW9kZWwoJ0dQVC01LjYgU29sJywgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpncHQtNS42LXNvbCcsICdHUFQtNS42IFNvbCcsICdncHQtNS42LXNvbCcpLFxuXHRcdFx0c2hvdWxkU2hvd1N1YmFnZW50TW9kZWwoJ0NsYXVkZSBPcHVzIDQuOCcsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Z3B0LTUuNi1zb2wnLCAnR1BULTUuNiBTb2wnLCAnZ3B0LTUuNi1zb2wnKSxcblx0XHRdLCBbXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRydWUsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dHJ1ZSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZXMgYW5kIGhpZGVzIHRoZSBhY3Rpb24gdW50aWwgaXRzIHBlZXIgY2hhdCByZXNvbHZlcycsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwge1xuXHRcdFx0YWN0aXZlU2Vzc2lvbjogb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCksXG5cdFx0XHR2aXNpYmxlU2Vzc2lvbnM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+KCd2aXNpYmxlU2Vzc2lvbnMnLCBbXSksXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzOiBFdmVudC5Ob25lLFxuXHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGlvbiA9IHN0b3JlLmFkZChuZXcgQWN0aW9uKCdvcGVuU3ViYWdlbnQnLCAnT3BlbiBTdWJhZ2VudCcpKTtcblx0XHRjb25zdCB2aWV3SXRlbSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE9wZW5TdWJhZ2VudENoYXRBY3Rpb25WaWV3SXRlbSxcblx0XHRcdHsgY2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC9zZXNzaW9uL3Rvb2wtY2FsbCcgfSxcblx0XHRcdGFjdGlvbixcblx0XHRcdHt9LFxuXHRcdFx0ZmFsc2UsXG5cdFx0KSk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHR2aWV3SXRlbS5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZW5hYmxlZDogdmlld0l0ZW0uYWN0aW9uLmVuYWJsZWQsXG5cdFx0XHRzb3VyY2VBY3Rpb25FbmFibGVkOiBhY3Rpb24uZW5hYmxlZCxcblx0XHRcdGhpZGRlbjogY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGlkZGVuJyksXG5cdFx0XHRhcmlhSGlkZGVuOiBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicpLFxuXHRcdFx0bW9kZWxIaWRkZW46IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1zdWJhZ2VudC1waWxsLW1vZGVsJyk/LmNsYXNzTGlzdC5jb250YWlucygnaGlkZGVuJyksXG5cdFx0fSwge1xuXHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRzb3VyY2VBY3Rpb25FbmFibGVkOiBmYWxzZSxcblx0XHRcdGhpZGRlbjogdHJ1ZSxcblx0XHRcdGFyaWFIaWRkZW46ICd0cnVlJyxcblx0XHRcdG1vZGVsSGlkZGVuOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoZXMgYWNjZXNzaWJsZSBtZXRhZGF0YSB3aGVuIHRoZSBhY3RpdmUgdG9vbCBjbGVhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRcdGFjdGl2ZVNlc3Npb246IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ2FjdGl2ZVNlc3Npb24nLCB1bmRlZmluZWQpLFxuXHRcdFx0dmlzaWJsZVNlc3Npb25zOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPigndmlzaWJsZVNlc3Npb25zJywgW10pLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwge1xuXHRcdFx0b25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsczogRXZlbnQuTm9uZSxcblx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb24gPSBzdG9yZS5hZGQobmV3IEFjdGlvbignb3BlblN1YmFnZW50JywgJ09wZW4gU3ViYWdlbnQnKSk7XG5cdFx0Y29uc3Qgdmlld0l0ZW0gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRUZXN0T3BlblN1YmFnZW50Q2hhdEFjdGlvblZpZXdJdGVtLFxuXHRcdFx0eyBjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Nlc3Npb24vdG9vbC1jYWxsJywgaXNBY3RpdmU6IHRydWUsIGFjdGl2ZVRvb2xMYWJlbDogJ1JlYWRpbmcgZmlsZXMnIH0sXG5cdFx0XHRhY3Rpb24sXG5cdFx0XHR7fSxcblx0XHRcdGZhbHNlLFxuXHRcdCkpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHZpZXdJdGVtLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgd2l0aEFjdGl2ZVRvb2wgPSB7XG5cdFx0XHR0b29sdGlwOiB2aWV3SXRlbS50b29sdGlwLFxuXHRcdFx0YXJpYUxhYmVsOiBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0fTtcblx0XHR2aWV3SXRlbS5zZXRBY3Rpb25Db250ZXh0KHsgY2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC9zZXNzaW9uL3Rvb2wtY2FsbCcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdpdGhBY3RpdmVUb29sLFxuXHRcdFx0d2l0aG91dEFjdGl2ZVRvb2w6IHtcblx0XHRcdFx0dG9vbHRpcDogdmlld0l0ZW0udG9vbHRpcCxcblx0XHRcdFx0YXJpYUxhYmVsOiBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdHdpdGhBY3RpdmVUb29sOiB7XG5cdFx0XHRcdHRvb2x0aXA6ICdPcGVuIFN1YmFnZW50XFxuQWN0aXZlIHRvb2w6IFJlYWRpbmcgZmlsZXMnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdPcGVuIFN1YmFnZW50LiBTdWJhZ2VudCBpcyB3b3JraW5nLiBBY3RpdmUgdG9vbCBSZWFkaW5nIGZpbGVzJyxcblx0XHRcdH0sXG5cdFx0XHR3aXRob3V0QWN0aXZlVG9vbDoge1xuXHRcdFx0XHR0b29sdGlwOiAnT3BlbiBTdWJhZ2VudCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ09wZW4gU3ViYWdlbnQnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgbWF0Y2hpbmcgbW9kZWwgbWV0YWRhdGEgaW4gdGhlIGhvdmVyIHdoaWxlIGhpZGluZyBpdCBpbmxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRcdGFjdGl2ZVNlc3Npb246IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ2FjdGl2ZVNlc3Npb24nLCB1bmRlZmluZWQpLFxuXHRcdFx0dmlzaWJsZVNlc3Npb25zOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPigndmlzaWJsZVNlc3Npb25zJywgW10pLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwge1xuXHRcdFx0b25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsczogRXZlbnQuTm9uZSxcblx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb24gPSBzdG9yZS5hZGQobmV3IEFjdGlvbignb3BlblN1YmFnZW50JywgJ09wZW4gU3ViYWdlbnQnKSk7XG5cdFx0Y29uc3Qgdmlld0l0ZW0gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRUZXN0T3BlblN1YmFnZW50Q2hhdEFjdGlvblZpZXdJdGVtLFxuXHRcdFx0e1xuXHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Nlc3Npb24vdG9vbC1jYWxsJyxcblx0XHRcdFx0bW9kZWxOYW1lOiAnR1BULTUuNiBTb2wnLFxuXHRcdFx0XHRwYXJlbnRNb2RlbE5hbWU6ICdHUFQtNS42IFNvbCcsXG5cdFx0XHR9LFxuXHRcdFx0YWN0aW9uLFxuXHRcdFx0e30sXG5cdFx0XHRmYWxzZSxcblx0XHQpKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRcdHZpZXdJdGVtLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlbEhpZGRlbjogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXN1YmFnZW50LXBpbGwtbW9kZWwnKT8uY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW4nKSxcblx0XHRcdHRvb2x0aXA6IHZpZXdJdGVtLnRvb2x0aXAsXG5cdFx0XHRhcmlhTGFiZWw6IGNvbnRhaW5lci5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSxcblx0XHR9LCB7XG5cdFx0XHRtb2RlbEhpZGRlbjogdHJ1ZSxcblx0XHRcdHRvb2x0aXA6ICdPcGVuIFN1YmFnZW50XFxuTW9kZWw6IEdQVC01LjYgU29sJyxcblx0XHRcdGFyaWFMYWJlbDogJ09wZW4gU3ViYWdlbnQuIE1vZGVsIEdQVC01LjYgU29sJyxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMs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
