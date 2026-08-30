import assert from "assert";
import { Event } from "../../../../../../base/common/event.js";
import { hash } from "../../../../../../base/common/hash.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullTelemetryServiceShape } from "../../../../../../platform/telemetry/common/telemetryUtils.js";
import { ChatMode, CustomChatMode } from "../../../../../../workbench/contrib/chat/common/chatModes.js";
import { PromptsStorage } from "../../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js";
import { Target } from "../../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js";
import { ModePicker, ModePickerModel } from "../../browser/modePicker.js";
class TestTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(eventName, data) {
    if (eventName) {
      this.events.push({ name: eventName, data });
    }
  }
}
suite("ModePicker", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("reports chat.modeChange for the scoped active chat", () => {
    const telemetryService = new TestTelemetryService();
    const sessionResource = URI.parse("agent-host-copilotcli:/session-1");
    const chatResource = sessionResource.with({ fragment: "peer-chat" });
    const customAgent = new CustomChatMode({
      id: "reviewer",
      uri: URI.parse("file:///workspace/.github/agents/reviewer.agent.md"),
      name: "Reviewer",
      agentInstructions: { content: "", toolReferences: [] },
      source: { storage: PromptsStorage.local },
      target: Target.Undefined,
      visibility: { userInvocable: true, agentInvocable: true },
      enabled: true,
      tools: ["read"]
    });
    const modes = {
      onDidChange: Event.None,
      builtin: [ChatMode.Agent],
      custom: [customAgent],
      findModeById: (id) => id === customAgent.id ? customAgent : ChatMode.Agent.id === id ? ChatMode.Agent : void 0,
      findModeByName: (name) => name === customAgent.name.get() ? customAgent : void 0,
      waitForPendingUpdates: async () => {
      },
      dispose: () => {
      }
    };
    const model = store.add(new ModePickerModel(
      new class extends mock() {
        getCustomAgentTargetForSessionType() {
          return Target.Undefined;
        }
      }(),
      new class extends mock() {
        createModes() {
          return modes;
        }
      }()
    ));
    model.setSession(new class extends mock() {
      constructor() {
        super(...arguments);
        this.resource = sessionResource;
      }
    }(), customAgent.id);
    const activeChat = new class extends mock() {
      constructor() {
        super(...arguments);
        this.resource = chatResource;
        this.mode = observableValue("mode", { id: ChatMode.Agent.id, kind: ChatMode.Agent.kind });
      }
    }();
    const scopedSession = observableValue("session", new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeChat = observableValue("activeChat", activeChat);
      }
    }());
    let selectCustomAgent;
    const requestedChatResources = [];
    const picker = store.add(new ModePicker(
      model,
      scopedSession,
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.isVisible = false;
        }
        show(_user, _supportsPreview, items, delegate) {
          const item = items.find((item2) => {
            if (!item2.item) {
              return false;
            }
            const value = item2.item;
            return value.kind === "mode" && value.mode?.id === customAgent.id;
          });
          assert.ok(item?.item);
          const modeItem = item.item;
          selectCustomAgent = () => delegate.onSelect(modeItem);
        }
        hide() {
        }
      }(),
      new class extends mock() {
      }(),
      telemetryService,
      new class extends mock() {
        getSession(resource) {
          requestedChatResources.push(resource.toString());
          return new class extends mock() {
            getRequests() {
              return [
                new class extends mock() {
                }(),
                new class extends mock() {
                }(),
                new class extends mock() {
                }()
              ];
            }
          }();
        }
      }()
    ));
    const container = document.createElement("div");
    picker.render(container);
    container.querySelector("a.action-label")?.click();
    assert.ok(selectCustomAgent);
    selectCustomAgent();
    assert.deepStrictEqual({
      events: telemetryService.events.filter((event) => event.name === "chat.modeChange"),
      requestedChatResources
    }, {
      events: [{
        name: "chat.modeChange",
        data: {
          fromMode: "agent",
          mode: String(hash(customAgent.name.get())),
          requestCount: 3,
          storage: "local",
          extensionId: void 0,
          toolsCount: 1,
          handoffsCount: 0,
          isClaudeAgent: false
        }
      }],
      requestedChatResources: [chatResource.toString()]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxjb3BpbG90Q2hhdFNlc3Npb25zXFx0ZXN0XFxicm93c2VyXFxtb2RlUGlja2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uTGlzdERlbGVnYXRlLCBJQWN0aW9uTGlzdEl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVTZXJ2aWNlLCBJQ2hhdE1vZGVzLCBDaGF0TW9kZSwgQ3VzdG9tQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwsIElDaGF0UmVxdWVzdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElDaGF0LCBJU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBNb2RlUGlja2VyLCBNb2RlUGlja2VyTW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL21vZGVQaWNrZXIuanMnO1xuXG5jbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRyZWFkb25seSBldmVudHM6IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIHB1YmxpY0xvZzIoZXZlbnROYW1lPzogc3RyaW5nLCBkYXRhPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmIChldmVudE5hbWUpIHtcblx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0fVxuXHR9XG59XG5cbnN1aXRlKCdNb2RlUGlja2VyJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlcG9ydHMgY2hhdC5tb2RlQ2hhbmdlIGZvciB0aGUgc2NvcGVkIGFjdGl2ZSBjaGF0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovc2Vzc2lvbi0xJyk7XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlID0gc2Vzc2lvblJlc291cmNlLndpdGgoeyBmcmFnbWVudDogJ3BlZXItY2hhdCcgfSk7XG5cdFx0Y29uc3QgY3VzdG9tQWdlbnQgPSBuZXcgQ3VzdG9tQ2hhdE1vZGUoe1xuXHRcdFx0aWQ6ICdyZXZpZXdlcicsXG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvcmV2aWV3ZXIuYWdlbnQubWQnKSxcblx0XHRcdG5hbWU6ICdSZXZpZXdlcicsXG5cdFx0XHRhZ2VudEluc3RydWN0aW9uczogeyBjb250ZW50OiAnJywgdG9vbFJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHR0b29sczogWydyZWFkJ10sXG5cdFx0fSk7XG5cdFx0Y29uc3QgbW9kZXM6IElDaGF0TW9kZXMgJiBJRGlzcG9zYWJsZSA9IHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0YnVpbHRpbjogW0NoYXRNb2RlLkFnZW50XSxcblx0XHRcdGN1c3RvbTogW2N1c3RvbUFnZW50XSxcblx0XHRcdGZpbmRNb2RlQnlJZDogaWQgPT4gaWQgPT09IGN1c3RvbUFnZW50LmlkID8gY3VzdG9tQWdlbnQgOiBDaGF0TW9kZS5BZ2VudC5pZCA9PT0gaWQgPyBDaGF0TW9kZS5BZ2VudCA6IHVuZGVmaW5lZCxcblx0XHRcdGZpbmRNb2RlQnlOYW1lOiBuYW1lID0+IG5hbWUgPT09IGN1c3RvbUFnZW50Lm5hbWUuZ2V0KCkgPyBjdXN0b21BZ2VudCA6IHVuZGVmaW5lZCxcblx0XHRcdHdhaXRGb3JQZW5kaW5nVXBkYXRlczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IE1vZGVQaWNrZXJNb2RlbChcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBnZXRDdXN0b21BZ2VudFRhcmdldEZvclNlc3Npb25UeXBlKCk6IFRhcmdldCB7XG5cdFx0XHRcdFx0cmV0dXJuIFRhcmdldC5VbmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRNb2RlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGNyZWF0ZU1vZGVzKCk6IElDaGF0TW9kZXMgJiBJRGlzcG9zYWJsZSB7XG5cdFx0XHRcdFx0cmV0dXJuIG1vZGVzO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCksXG5cdFx0KSk7XG5cdFx0bW9kZWwuc2V0U2Vzc2lvbihuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdH0oKSwgY3VzdG9tQWdlbnQuaWQpO1xuXHRcdGNvbnN0IGFjdGl2ZUNoYXQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0PigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gY2hhdFJlc291cmNlO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbW9kZSA9IG9ic2VydmFibGVWYWx1ZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPignbW9kZScsIHsgaWQ6IENoYXRNb2RlLkFnZW50LmlkLCBraW5kOiBDaGF0TW9kZS5BZ2VudC5raW5kIH0pO1xuXHRcdH0oKTtcblx0XHRjb25zdCBzY29wZWRTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGl2ZVNlc3Npb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlQ2hhdCA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4oJ2FjdGl2ZUNoYXQnLCBhY3RpdmVDaGF0KTtcblx0XHR9KCkpO1xuXG5cdFx0bGV0IHNlbGVjdEN1c3RvbUFnZW50OiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVxdWVzdGVkQ2hhdFJlc291cmNlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwaWNrZXIgPSBzdG9yZS5hZGQobmV3IE1vZGVQaWNrZXIoXG5cdFx0XHRtb2RlbCxcblx0XHRcdHNjb3BlZFNlc3Npb24sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBY3Rpb25XaWRnZXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdG92ZXJyaWRlIHNob3c8VD4oX3VzZXI6IHN0cmluZywgX3N1cHBvcnRzUHJldmlldzogYm9vbGVhbiwgaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdLCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxUPik6IHZvaWQge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSBpdGVtcy5maW5kKGl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFpdGVtLml0ZW0pIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBpdGVtLml0ZW0gYXMgeyByZWFkb25seSBraW5kPzogc3RyaW5nOyByZWFkb25seSBtb2RlPzogeyByZWFkb25seSBpZDogc3RyaW5nIH0gfTtcblx0XHRcdFx0XHRcdHJldHVybiB2YWx1ZS5raW5kID09PSAnbW9kZScgJiYgdmFsdWUubW9kZT8uaWQgPT09IGN1c3RvbUFnZW50LmlkO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGFzc2VydC5vayhpdGVtPy5pdGVtKTtcblx0XHRcdFx0XHRjb25zdCBtb2RlSXRlbSA9IGl0ZW0uaXRlbTtcblx0XHRcdFx0XHRzZWxlY3RDdXN0b21BZ2VudCA9ICgpID0+IGRlbGVnYXRlLm9uU2VsZWN0KG1vZGVJdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBoaWRlKCk6IHZvaWQgeyB9XG5cdFx0XHR9KCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDb21tYW5kU2VydmljZT4oKSB7IH0oKSxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElDaGF0TW9kZWwge1xuXHRcdFx0XHRcdHJlcXVlc3RlZENoYXRSZXNvdXJjZXMucHVzaChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdE1vZGVsPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIGdldFJlcXVlc3RzKCk6IElDaGF0UmVxdWVzdE1vZGVsW10ge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRSZXF1ZXN0TW9kZWw+KCkgeyB9KCksXG5cdFx0XHRcdFx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFJlcXVlc3RNb2RlbD4oKSB7IH0oKSxcblx0XHRcdFx0XHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0UmVxdWVzdE1vZGVsPigpIHsgfSgpLFxuXHRcdFx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSgpLFxuXHRcdCkpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHBpY2tlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2EuYWN0aW9uLWxhYmVsJyk/LmNsaWNrKCk7XG5cdFx0YXNzZXJ0Lm9rKHNlbGVjdEN1c3RvbUFnZW50KTtcblx0XHRzZWxlY3RDdXN0b21BZ2VudCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRldmVudHM6IHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLmZpbHRlcihldmVudCA9PiBldmVudC5uYW1lID09PSAnY2hhdC5tb2RlQ2hhbmdlJyksXG5cdFx0XHRyZXF1ZXN0ZWRDaGF0UmVzb3VyY2VzLFxuXHRcdH0sIHtcblx0XHRcdGV2ZW50czogW3tcblx0XHRcdFx0bmFtZTogJ2NoYXQubW9kZUNoYW5nZScsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRmcm9tTW9kZTogJ2FnZW50Jyxcblx0XHRcdFx0XHRtb2RlOiBTdHJpbmcoaGFzaChjdXN0b21BZ2VudC5uYW1lLmdldCgpKSksXG5cdFx0XHRcdFx0cmVxdWVzdENvdW50OiAzLFxuXHRcdFx0XHRcdHN0b3JhZ2U6ICdsb2NhbCcsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sc0NvdW50OiAxLFxuXHRcdFx0XHRcdGhhbmRvZmZzQ291bnQ6IDAsXG5cdFx0XHRcdFx0aXNDbGF1ZGVBZ2VudDogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHRcdHJlcXVlc3RlZENoYXRSZXNvdXJjZXM6IFtjaGF0UmVzb3VyY2UudG9TdHJpbmcoKV0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWTtBQUVyQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBSXhELFNBQVMsaUNBQWlDO0FBQzFDLFNBQXVDLFVBQVUsc0JBQXNCO0FBSXZFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYztBQUd2QixTQUFTLFlBQVksdUJBQXVCO0FBRTVDLE1BQU0sNkJBQTZCLDBCQUEwQjtBQUFBLEVBQTdEO0FBQUE7QUFDQyxTQUFTLFNBQThELENBQUM7QUFBQTtBQUFBLEVBRS9ELFdBQVcsV0FBb0IsTUFBc0I7QUFDN0QsUUFBSSxXQUFXO0FBQ2QsV0FBSyxPQUFPLEtBQUssRUFBRSxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLGNBQWMsTUFBTTtBQUN6QixRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxtQkFBbUIsSUFBSSxxQkFBcUI7QUFDbEQsVUFBTSxrQkFBa0IsSUFBSSxNQUFNLGtDQUFrQztBQUNwRSxVQUFNLGVBQWUsZ0JBQWdCLEtBQUssRUFBRSxV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
