import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ActionType } from "../../../../../platform/agentHost/common/state/sessionActions.js";
import { ROOT_STATE_URI } from "../../../../../platform/agentHost/common/state/sessionState.js";
import {
  clearDialecticOrchestrationPending,
  isDialecticOrchestrationPending,
  markDialecticOrchestrationPending
} from "../../common/forgeOrchestrationRun.js";
import { trySendDialecticOrchestration } from "../../common/forgeOrchestrationSend.js";
suite("Forge orchestration send", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    clearDialecticOrchestrationPending();
  });
  test("trySendDialecticOrchestration dispatches and marks pending on success", () => {
    const dispatches = [];
    const notifications = [];
    const sessionResource = URI.parse("agent-host-codex:/session-1");
    const requests = [];
    const widget = {
      viewModel: {
        sessionResource,
        model: {
          sessionResource,
          addRequest: (message) => {
            requests.push(message);
            return {
              response: {
                isComplete: false,
                complete: () => void 0
              }
            };
          },
          acceptResponseProgress: () => void 0
        }
      },
      setInput: (value) => {
        inputValue = value;
      },
      getInput: () => inputValue
    };
    let inputValue = "build a feature";
    const agentHostService = {
      dispatch: (_channel, action2) => {
        dispatches.push(action2);
      },
      rootState: { value: { config: { values: {} } } }
    };
    const configurationService = {
      getValue: () => ({})
    };
    const instantiationService = {
      createInstance: () => ({ parseChatRequest: (_resource, text) => ({ text, parts: [] }) })
    };
    const notificationService = {
      info: (message) => notifications.push(message),
      error: (message) => notifications.push(message)
    };
    const result = trySendDialecticOrchestration({
      widget,
      goal: "build a feature",
      workspacePath: "C:\\workspace",
      agentHostService,
      configurationService,
      setup: { logos: {}, dialectic: {} },
      instantiationService,
      notificationService
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(inputValue, "");
    assert.strictEqual(isDialecticOrchestrationPending(), true);
    assert.strictEqual(dispatches.length, 1);
    const action = dispatches[0];
    assert.strictEqual(action.type, ActionType.RootConfigChanged);
    assert.ok(action.config["forge.orchestration.request"]);
    assert.strictEqual(notifications.length, 1);
    assert.match(notifications[0], /编排已开始/);
    assert.strictEqual(ROOT_STATE_URI, "ahp-root://");
  });
  test("trySendDialecticOrchestration reports empty goal", () => {
    const notifications = [];
    const widget = {
      viewModel: {
        sessionResource: URI.parse("agent-host-codex:/session-1"),
        model: {
          sessionResource: URI.parse("agent-host-codex:/session-1"),
          addRequest: () => {
            throw new Error("should not add request");
          }
        }
      },
      setInput: () => void 0,
      getInput: () => ""
    };
    const result = trySendDialecticOrchestration({
      widget,
      goal: "   ",
      workspacePath: "C:\\workspace",
      agentHostService: { dispatch: () => void 0, rootState: { value: { config: { values: {} } } } },
      configurationService: { getValue: () => ({}) },
      setup: { logos: {}, dialectic: {} },
      instantiationService: { createInstance: () => ({ parseChatRequest: (_resource, text) => ({ text, parts: [] }) }) },
      notificationService: {
        info: (message) => notifications.push(message),
        error: (message) => notifications.push(message)
      }
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "no-goal");
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(isDialecticOrchestrationPending(), false);
  });
  test("pending flag can be cleared", () => {
    markDialecticOrchestrationPending();
    assert.strictEqual(isDialecticOrchestrationPending(), true);
    clearDialecticOrchestrationPending();
    assert.strictEqual(isDialecticOrchestrationPending(), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZvcmdlXFx0ZXN0XFxjb21tb25cXGZvcmdlT3JjaGVzdHJhdGlvblNlbmQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFJPT1RfU1RBVEVfVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgSUNoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQge1xuXHRjbGVhckRpYWxlY3RpY09yY2hlc3RyYXRpb25QZW5kaW5nLFxuXHRpc0RpYWxlY3RpY09yY2hlc3RyYXRpb25QZW5kaW5nLFxuXHRtYXJrRGlhbGVjdGljT3JjaGVzdHJhdGlvblBlbmRpbmcsXG59IGZyb20gJy4uLy4uL2NvbW1vbi9mb3JnZU9yY2hlc3RyYXRpb25SdW4uanMnO1xuaW1wb3J0IHsgdHJ5U2VuZERpYWxlY3RpY09yY2hlc3RyYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vZm9yZ2VPcmNoZXN0cmF0aW9uU2VuZC5qcyc7XG5cbnN1aXRlKCdGb3JnZSBvcmNoZXN0cmF0aW9uIHNlbmQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjbGVhckRpYWxlY3RpY09yY2hlc3RyYXRpb25QZW5kaW5nKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyeVNlbmREaWFsZWN0aWNPcmNoZXN0cmF0aW9uIGRpc3BhdGNoZXMgYW5kIG1hcmtzIHBlbmRpbmcgb24gc3VjY2VzcycsICgpID0+IHtcblx0XHRjb25zdCBkaXNwYXRjaGVzOiB1bmtub3duW10gPSBbXTtcblx0XHRjb25zdCBub3RpZmljYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb2RleDovc2Vzc2lvbi0xJyk7XG5cdFx0Y29uc3QgcmVxdWVzdHM6IHVua25vd25bXSA9IFtdO1xuXHRcdGNvbnN0IHdpZGdldCA9IHtcblx0XHRcdHZpZXdNb2RlbDoge1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdG1vZGVsOiB7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGFkZFJlcXVlc3Q6IChtZXNzYWdlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0cy5wdXNoKG1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHRcdFx0XHRpc0NvbXBsZXRlOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRjb21wbGV0ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3M6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRzZXRJbnB1dDogKHZhbHVlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aW5wdXRWYWx1ZSA9IHZhbHVlO1xuXHRcdFx0fSxcblx0XHRcdGdldElucHV0OiAoKSA9PiBpbnB1dFZhbHVlLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcblx0XHRsZXQgaW5wdXRWYWx1ZSA9ICdidWlsZCBhIGZlYXR1cmUnO1xuXHRcdGNvbnN0IGFnZW50SG9zdFNlcnZpY2UgPSB7XG5cdFx0XHRkaXNwYXRjaDogKF9jaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRkaXNwYXRjaGVzLnB1c2goYWN0aW9uKTtcblx0XHRcdH0sXG5cdFx0XHRyb290U3RhdGU6IHsgdmFsdWU6IHsgY29uZmlnOiB7IHZhbHVlczoge30gfSB9IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RTZXJ2aWNlO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0ge1xuXHRcdFx0Z2V0VmFsdWU6ICgpID0+ICh7fSksXG5cdFx0fSBhcyB1bmtub3duIGFzIElDb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHtcblx0XHRcdGNyZWF0ZUluc3RhbmNlOiAoKSA9PiAoeyBwYXJzZUNoYXRSZXF1ZXN0OiAoX3Jlc291cmNlOiBVUkksIHRleHQ6IHN0cmluZykgPT4gKHsgdGV4dCwgcGFydHM6IFtdIH0pIH0pLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IHtcblx0XHRcdGluZm86IChtZXNzYWdlOiBzdHJpbmcpID0+IG5vdGlmaWNhdGlvbnMucHVzaChtZXNzYWdlKSxcblx0XHRcdGVycm9yOiAobWVzc2FnZTogc3RyaW5nKSA9PiBub3RpZmljYXRpb25zLnB1c2gobWVzc2FnZSksXG5cdFx0fSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdHJ5U2VuZERpYWxlY3RpY09yY2hlc3RyYXRpb24oe1xuXHRcdFx0d2lkZ2V0LFxuXHRcdFx0Z29hbDogJ2J1aWxkIGEgZmVhdHVyZScsXG5cdFx0XHR3b3Jrc3BhY2VQYXRoOiAnQzpcXFxcd29ya3NwYWNlJyxcblx0XHRcdGFnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHNldHVwOiB7IGxvZ29zOiB7fSwgZGlhbGVjdGljOiB7fSB9LFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5vaywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0VmFsdWUsICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNEaWFsZWN0aWNPcmNoZXN0cmF0aW9uUGVuZGluZygpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGF0Y2hlcy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IGRpc3BhdGNoZXNbMF0gYXMgeyB0eXBlOiBzdHJpbmc7IGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQpO1xuXHRcdGFzc2VydC5vayhhY3Rpb24uY29uZmlnWydmb3JnZS5vcmNoZXN0cmF0aW9uLnJlcXVlc3QnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQubWF0Y2gobm90aWZpY2F0aW9uc1swXSwgL1x1N0YxNlx1NjM5Mlx1NURGMlx1NUYwMFx1NTlDQi8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChST09UX1NUQVRFX1VSSSwgJ2FocC1yb290Oi8vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyeVNlbmREaWFsZWN0aWNPcmNoZXN0cmF0aW9uIHJlcG9ydHMgZW1wdHkgZ29hbCcsICgpID0+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHdpZGdldCA9IHtcblx0XHRcdHZpZXdNb2RlbDoge1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb2RleDovc2Vzc2lvbi0xJyksXG5cdFx0XHRcdG1vZGVsOiB7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29kZXg6L3Nlc3Npb24tMScpLFxuXHRcdFx0XHRcdGFkZFJlcXVlc3Q6ICgpID0+IHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignc2hvdWxkIG5vdCBhZGQgcmVxdWVzdCcpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0c2V0SW5wdXQ6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGdldElucHV0OiAoKSA9PiAnJyxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0cnlTZW5kRGlhbGVjdGljT3JjaGVzdHJhdGlvbih7XG5cdFx0XHR3aWRnZXQsXG5cdFx0XHRnb2FsOiAnICAgJyxcblx0XHRcdHdvcmtzcGFjZVBhdGg6ICdDOlxcXFx3b3Jrc3BhY2UnLFxuXHRcdFx0YWdlbnRIb3N0U2VydmljZTogeyBkaXNwYXRjaDogKCkgPT4gdW5kZWZpbmVkLCByb290U3RhdGU6IHsgdmFsdWU6IHsgY29uZmlnOiB7IHZhbHVlczoge30gfSB9IH0gfSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IHsgZ2V0VmFsdWU6ICgpID0+ICh7fSkgfSBhcyB1bmtub3duIGFzIElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHNldHVwOiB7IGxvZ29zOiB7fSwgZGlhbGVjdGljOiB7fSB9LFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IHsgY3JlYXRlSW5zdGFuY2U6ICgpID0+ICh7IHBhcnNlQ2hhdFJlcXVlc3Q6IChfcmVzb3VyY2U6IFVSSSwgdGV4dDogc3RyaW5nKSA9PiAoeyB0ZXh0LCBwYXJ0czogW10gfSkgfSkgfSBhcyB1bmtub3duIGFzIElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2U6IHtcblx0XHRcdFx0aW5mbzogKG1lc3NhZ2U6IHN0cmluZykgPT4gbm90aWZpY2F0aW9ucy5wdXNoKG1lc3NhZ2UpLFxuXHRcdFx0XHRlcnJvcjogKG1lc3NhZ2U6IHN0cmluZykgPT4gbm90aWZpY2F0aW9ucy5wdXNoKG1lc3NhZ2UpLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5vaywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVhc29uLCAnbm8tZ29hbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRGlhbGVjdGljT3JjaGVzdHJhdGlvblBlbmRpbmcoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZW5kaW5nIGZsYWcgY2FuIGJlIGNsZWFyZWQnLCAoKSA9PiB7XG5cdFx0bWFya0RpYWxlY3RpY09yY2hlc3RyYXRpb25QZW5kaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRGlhbGVjdGljT3JjaGVzdHJhdGlvblBlbmRpbmcoKSwgdHJ1ZSk7XG5cdFx0Y2xlYXJEaWFsZWN0aWNPcmNoZXN0cmF0aW9uUGVuZGluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0RpYWxlY3RpY09yY2hlc3RyYXRpb25QZW5kaW5nKCksIGZhbHNlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFD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
