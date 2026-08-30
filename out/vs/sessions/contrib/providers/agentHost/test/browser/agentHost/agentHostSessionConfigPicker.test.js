import assert from "assert";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { mock } from "../../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../../../../../../platform/actions/common/actions.js";
import { IActionWidgetService } from "../../../../../../../platform/actionWidget/browser/actionWidget.js";
import { SessionConfigKey } from "../../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService } from "../../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { IWorkbenchLayoutService } from "../../../../../../../workbench/services/layout/browser/layoutService.js";
import { Menus } from "../../../../../../browser/menus.js";
import { LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../../../../common/agentHostSessionsProvider.js";
import { ISessionsProvidersService } from "../../../../../../services/sessions/browser/sessionsProvidersService.js";
import { AgentHostSessionConfigPicker } from "../../../browser/agentHostSessionConfigPicker.js";
const SESSION_ID = "local-agent-host:s1";
function makeRepoConfig(branchValue, isolation = "worktree") {
  return {
    schema: {
      type: "object",
      properties: {
        [SessionConfigKey.Isolation]: {
          title: "Isolation",
          description: "",
          type: "string",
          enum: ["folder", "worktree"],
          enumLabels: ["Folder", "Worktree"],
          default: "worktree"
        },
        [SessionConfigKey.Branch]: {
          title: "Base Branch",
          description: "",
          type: "string",
          enum: ["main", "dev"]
        }
      }
    },
    values: { [SessionConfigKey.Isolation]: isolation, ...branchValue ? { [SessionConfigKey.Branch]: branchValue } : {} }
  };
}
function makeDynamicBranchConfig(branchValue) {
  return {
    schema: {
      type: "object",
      properties: {
        [SessionConfigKey.Isolation]: {
          title: "Isolation",
          description: "",
          type: "string",
          enum: ["folder", "worktree"],
          enumLabels: ["Folder", "Worktree"],
          default: "worktree"
        },
        [SessionConfigKey.Branch]: {
          title: "Base Branch",
          description: "",
          type: "string",
          enumDynamic: true
        }
      }
    },
    values: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: branchValue }
  };
}
function makeNoGitConfig() {
  return {
    schema: {
      type: "object",
      properties: {
        [SessionConfigKey.Isolation]: {
          title: "Isolation",
          description: "",
          type: "string",
          enum: ["folder"],
          enumLabels: ["Folder"],
          default: "folder",
          readOnly: true
        }
      }
    },
    values: { [SessionConfigKey.Isolation]: "folder" }
  };
}
class FakeProvider {
  constructor(_emitter) {
    this._emitter = _emitter;
    this.id = LOCAL_AGENT_HOST_PROVIDER_ID;
    this.config = makeRepoConfig("main");
    this.resolving = observableValue("resolving", false);
    this.isNew = true;
    /** Completions returned by `getSessionConfigCompletions`, e.g. for the dynamic branch picker. */
    this.completions = [];
    this.onDidChangeSessionConfig = _emitter.event;
  }
  getSessionConfig() {
    return this.config;
  }
  getCreateSessionConfig() {
    return this.isNew ? {} : void 0;
  }
  isSessionConfigResolving() {
    return this.resolving;
  }
  async setSessionConfigValue() {
  }
  async getSessionConfigCompletions() {
    return this.completions;
  }
  /** Swap the config + resolving flag and pulse, as the real provider does. */
  set(config, resolving) {
    this.config = config;
    this.resolving.set(resolving, void 0);
    this._emitter.fire(SESSION_ID);
  }
}
class AlwaysRenderConfigPicker extends AgentHostSessionConfigPicker {
  _shouldRenderProperty(_property, _schema, _isNewSession) {
    return true;
  }
}
function isolationSlot(container) {
  return container.querySelector(".sessions-chat-isolation-checkbox");
}
function branchSlot(container) {
  return Array.from(container.querySelectorAll(".sessions-chat-picker-slot")).find((slot) => !slot.classList.contains("sessions-chat-isolation-checkbox"));
}
function branchLabel(container) {
  return branchSlot(container)?.querySelector(".sessions-chat-dropdown-label")?.textContent ?? void 0;
}
class CapturingActionWidgetHolder {
}
function setupServices(store) {
  const emitter = store.add(new Emitter());
  const provider = new FakeProvider(emitter);
  const actionWidget = new CapturingActionWidgetHolder();
  const instantiationService = store.add(new TestInstantiationService());
  instantiationService.stub(IActionWidgetService, {
    isVisible: false,
    hide: () => {
    },
    show: (_user, _supportsPreview, _items, delegate) => {
      actionWidget.delegate = delegate;
    }
  });
  instantiationService.stub(IHoverService, { setupDelayedHover: () => ({ dispose: () => {
  } }) });
  instantiationService.stub(ITelemetryService, NullTelemetryService);
  instantiationService.stub(IConfigurationService, new class extends mock() {
  }());
  instantiationService.stub(IDialogService, new class extends mock() {
  }());
  instantiationService.stub(IStorageService, new class extends mock() {
  }());
  instantiationService.stub(IContextKeyService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeContext = Event.None;
    }
  }());
  instantiationService.stub(IWorkbenchLayoutService, new class extends mock() {
    constructor() {
      super(...arguments);
      // No `phone-layout` class → `isPhoneLayout` is false → isolation renders as a checkbox.
      this.mainContainer = document.createElement("div");
    }
  }());
  instantiationService.set(ISessionsProvidersService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeProviders = Event.None;
    }
    getProviders() {
      return [provider];
    }
    getProvider(id) {
      return id === provider.id ? provider : void 0;
    }
  }());
  const sessionObs = observableValue("activeSession", { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionId: SESSION_ID });
  return { instantiationService, provider, sessionObs, actionWidget };
}
function renderPicker(store, services) {
  const picker = store.add(services.instantiationService.createInstance(AgentHostSessionConfigPicker, services.sessionObs));
  const container = document.createElement("div");
  picker.render(container);
  return { picker, container };
}
suite("Agent Host Session Config Picker", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("places mode immediately before approvals in secondary toolbars", () => {
    const summarize = (menu, ids) => MenuRegistry.getMenuItems(menu).filter(isIMenuItem).filter((item) => ids.includes(item.command.id)).map((item) => ({ id: item.command.id, order: item.order })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const newSessionIds = [
      "sessions.agentHost.newSessionModePicker",
      "sessions.agentHost.newSessionApprovePicker",
      "sessions.agentHost.newSessionPermissionModePicker"
    ];
    const runningSessionIds = [
      "sessions.agentHost.runningSessionModePicker",
      "sessions.agentHost.runningSessionConfigPicker",
      "sessions.agentHost.runningSessionPermissionModePicker"
    ];
    assert.deepStrictEqual({
      newSessionPrimary: summarize(Menus.NewSessionConfig, newSessionIds),
      newSessionSecondary: summarize(Menus.NewSessionControl, newSessionIds),
      runningSessionPrimary: summarize(MenuId.ChatInput, runningSessionIds),
      runningSessionSecondary: summarize(MenuId.ChatInputSecondary, runningSessionIds)
    }, {
      newSessionPrimary: [],
      newSessionSecondary: [
        { id: "sessions.agentHost.newSessionModePicker", order: 0 },
        { id: "sessions.agentHost.newSessionApprovePicker", order: 1 },
        { id: "sessions.agentHost.newSessionPermissionModePicker", order: 2 }
      ],
      runningSessionPrimary: [],
      runningSessionSecondary: [
        { id: "sessions.agentHost.runningSessionModePicker", order: 9 },
        { id: "sessions.agentHost.runningSessionConfigPicker", order: 10 },
        { id: "sessions.agentHost.runningSessionPermissionModePicker", order: 11 }
      ]
    });
  });
  test("a picker recreated on a session switch still renders the provider-seeded chips (disabled) while resolving", () => {
    const services = setupServices(store);
    const { provider } = services;
    provider.set(makeRepoConfig("main"), false);
    const first = renderPicker(store, services);
    assert.ok(isolationSlot(first.container), "isolation checkbox renders for a resolved schema");
    assert.ok(branchSlot(first.container), "branch chip renders for a resolved schema");
    assert.strictEqual(isolationSlot(first.container).classList.contains("disabled"), false);
    first.picker.dispose();
    provider.set(makeRepoConfig(), true);
    const second = renderPicker(store, services);
    assert.ok(isolationSlot(second.container), "isolation visible on a freshly created picker");
    assert.ok(branchSlot(second.container), "branch visible on a freshly created picker");
    assert.strictEqual(isolationSlot(second.container).classList.contains("resolving"), true, "isolation blocks interaction without dimming while resolving");
    assert.strictEqual(isolationSlot(second.container).classList.contains("disabled"), false, "isolation keeps its normal presentation while resolving");
    assert.strictEqual(branchSlot(second.container).classList.contains("resolving"), true, "branch blocks interaction without dimming while resolving");
    assert.strictEqual(branchSlot(second.container).classList.contains("disabled"), false, "branch keeps its normal presentation while resolving");
    assert.strictEqual(isolationSlot(second.container).querySelector(".monaco-checkbox")?.getAttribute("aria-disabled"), "true");
    assert.strictEqual(branchSlot(second.container).querySelector("a.action-label")?.getAttribute("aria-disabled"), "true");
    provider.set(makeRepoConfig("dev"), false);
    assert.strictEqual(isolationSlot(second.container).classList.contains("resolving"), false, "isolation re-enables after resolve");
    assert.strictEqual(branchSlot(second.container).classList.contains("resolving"), false, "branch re-enables after resolve");
    assert.strictEqual(branchLabel(second.container), "dev", "branch label reflects the resolved value");
  });
  test("keeps the isolation checkbox node and focus stable while config resolves", () => {
    const services = setupServices(store);
    const { provider } = services;
    provider.set(makeRepoConfig("main"), false);
    const { container } = renderPicker(store, services);
    document.body.appendChild(container);
    store.add({ dispose: () => container.remove() });
    const checkbox = isolationSlot(container).querySelector(".monaco-checkbox");
    checkbox.focus();
    provider.set(makeRepoConfig("main", "folder"), true);
    const resolvingCheckbox = isolationSlot(container).querySelector(".monaco-checkbox");
    const resolvingState = {
      sameNode: resolvingCheckbox === checkbox,
      focused: document.activeElement === checkbox,
      checked: resolvingCheckbox.getAttribute("aria-checked"),
      disabled: resolvingCheckbox.getAttribute("aria-disabled"),
      disabledPalette: resolvingCheckbox.classList.contains("disabled"),
      resolving: isolationSlot(container).classList.contains("resolving"),
      dimmed: isolationSlot(container).classList.contains("disabled")
    };
    provider.set(makeRepoConfig("main", "folder"), false);
    const resolvedCheckbox = isolationSlot(container).querySelector(".monaco-checkbox");
    assert.deepStrictEqual({
      resolving: resolvingState,
      resolved: {
        sameNode: resolvedCheckbox === checkbox,
        focused: document.activeElement === checkbox,
        checked: resolvedCheckbox.getAttribute("aria-checked"),
        disabled: resolvedCheckbox.getAttribute("aria-disabled"),
        resolving: isolationSlot(container).classList.contains("resolving"),
        count: container.querySelectorAll(".sessions-chat-isolation-checkbox").length
      }
    }, {
      resolving: {
        sameNode: true,
        focused: true,
        checked: "false",
        disabled: "true",
        disabledPalette: false,
        resolving: true,
        dimmed: false
      },
      resolved: {
        sameNode: true,
        focused: true,
        checked: "false",
        disabled: "false",
        resolving: false,
        count: 1
      }
    });
  });
  test("branch picker keeps the display label for a dynamic (enumDynamic) selection, not just the persisted value", async () => {
    const services = setupServices(store);
    const { provider, actionWidget } = services;
    provider.config = makeDynamicBranchConfig("main");
    const { picker, container } = renderPicker(store, services);
    provider.completions = [{ value: "feature/x", label: "Feature X" }];
    const trigger = branchSlot(container).querySelector("a.action-label");
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve));
    assert.ok(actionWidget.delegate, "opening the picker fetches completions and shows the action widget");
    actionWidget.delegate.onSelect({ value: "feature/x", label: "Feature X" });
    await new Promise((resolve) => setTimeout(resolve));
    provider.set(makeDynamicBranchConfig("feature/x"), false);
    assert.strictEqual(branchLabel(container), "Feature X", "branch label uses the cached completion label, not the raw value");
    picker.dispose();
  });
  test("evicts dynamic-value label cache entries once the picker moves to a different session", async () => {
    const services = setupServices(store);
    const { provider, actionWidget, sessionObs } = services;
    provider.config = makeDynamicBranchConfig("main");
    const { picker, container } = renderPicker(store, services);
    provider.completions = [{ value: "feature/x", label: "Feature X" }];
    const trigger = branchSlot(container).querySelector("a.action-label");
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve));
    actionWidget.delegate.onSelect({ value: "feature/x", label: "Feature X" });
    await new Promise((resolve) => setTimeout(resolve));
    provider.set(makeDynamicBranchConfig("feature/x"), false);
    const cache = picker._dynamicValueLabels;
    assert.ok(Array.from(cache.keys()).some((key) => key.startsWith(`${SESSION_ID}\0`)), "cache holds an entry for the first session");
    const OTHER_SESSION_ID = "local-agent-host:s2";
    provider.config = makeDynamicBranchConfig("main");
    sessionObs.set({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionId: OTHER_SESSION_ID }, void 0);
    assert.strictEqual(Array.from(cache.keys()).some((key) => key.startsWith(`${SESSION_ID}\0`)), false, "stale entries for the previous session are evicted");
    picker.dispose();
  });
  test("does not render folder isolation when the workspace has no Git repository", () => {
    const services = setupServices(store);
    services.provider.config = makeNoGitConfig();
    const picker = store.add(services.instantiationService.createInstance(AlwaysRenderConfigPicker, services.sessionObs));
    const container = document.createElement("div");
    picker.render(container);
    assert.strictEqual(isolationSlot(container), null);
  });
  test("never renders a chip for the hidden worktreeBranchTrack carrier property", () => {
    const services = setupServices(store);
    services.provider.config = {
      schema: {
        type: "object",
        properties: {
          [SessionConfigKey.Isolation]: {
            title: "Isolation",
            description: "",
            type: "string",
            enum: ["folder", "worktree"],
            enumLabels: ["Folder", "Worktree"],
            default: "worktree"
          },
          [SessionConfigKey.WorktreeBranchTrack]: {
            title: "Track Branch",
            description: "",
            type: "boolean",
            default: false,
            readOnly: true,
            sessionMutable: false
          }
        }
      },
      values: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.WorktreeBranchTrack]: false }
    };
    const picker = store.add(services.instantiationService.createInstance(AlwaysRenderConfigPicker, services.sessionObs));
    const container = document.createElement("div");
    picker.render(container);
    assert.strictEqual(container.querySelectorAll(".sessions-chat-picker-slot").length, 1, "only the isolation checkbox renders, not a worktreeBranchTrack chip");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdFxcYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBpc0lNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY3Rpb25MaXN0RGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIFNlc3Npb25Db25maWdWYWx1ZUl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciwgTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2VyLCBJQ29uZmlnUGlja2VySXRlbSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlci5qcyc7XG5cbmNvbnN0IFNFU1NJT05fSUQgPSAnbG9jYWwtYWdlbnQtaG9zdDpzMSc7XG5cbi8qKiBBIGNvbmZpZyBleHBvc2luZyB0aGUgdHdvIHNoYXJlZCByZXBvLWNvbmZpZyBjaGlwcyAoaXNvbGF0aW9uICsgYnJhbmNoKS4gKi9cbmZ1bmN0aW9uIG1ha2VSZXBvQ29uZmlnKGJyYW5jaFZhbHVlPzogc3RyaW5nLCBpc29sYXRpb246ICdmb2xkZXInIHwgJ3dvcmt0cmVlJyA9ICd3b3JrdHJlZScpOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB7XG5cdHJldHVybiB7XG5cdFx0c2NoZW1hOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXToge1xuXHRcdFx0XHRcdHRpdGxlOiAnSXNvbGF0aW9uJywgZGVzY3JpcHRpb246ICcnLCB0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ2ZvbGRlcicsICd3b3JrdHJlZSddLCBlbnVtTGFiZWxzOiBbJ0ZvbGRlcicsICdXb3JrdHJlZSddLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd3b3JrdHJlZScsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06IHtcblx0XHRcdFx0XHR0aXRsZTogJ0Jhc2UgQnJhbmNoJywgZGVzY3JpcHRpb246ICcnLCB0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ21haW4nLCAnZGV2J10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0dmFsdWVzOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06IGlzb2xhdGlvbiwgLi4uKGJyYW5jaFZhbHVlID8geyBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiBicmFuY2hWYWx1ZSB9IDoge30pIH0sXG5cdH0gYXMgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ7XG59XG5cbi8qKiBBIGNvbmZpZyB3aG9zZSBCcmFuY2ggcHJvcGVydHkgaXMgcmVzb2x2ZWQgZHluYW1pY2FsbHkgKG5vIHN0YXRpYyBgZW51bWApLCBhcyB0aGUgcmVhbCBicmFuY2ggcGlja2VyIGlzLiAqL1xuZnVuY3Rpb24gbWFrZUR5bmFtaWNCcmFuY2hDb25maWcoYnJhbmNoVmFsdWU6IHN0cmluZyk6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IHtcblx0cmV0dXJuIHtcblx0XHRzY2hlbWE6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiB7XG5cdFx0XHRcdFx0dGl0bGU6ICdJc29sYXRpb24nLCBkZXNjcmlwdGlvbjogJycsIHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnZm9sZGVyJywgJ3dvcmt0cmVlJ10sIGVudW1MYWJlbHM6IFsnRm9sZGVyJywgJ1dvcmt0cmVlJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3dvcmt0cmVlJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXToge1xuXHRcdFx0XHRcdHRpdGxlOiAnQmFzZSBCcmFuY2gnLCBkZXNjcmlwdGlvbjogJycsIHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW1EeW5hbWljOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdHZhbHVlczogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiBicmFuY2hWYWx1ZSB9LFxuXHR9IGFzIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0O1xufVxuXG5mdW5jdGlvbiBtYWtlTm9HaXRDb25maWcoKTogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQge1xuXHRyZXR1cm4ge1xuXHRcdHNjaGVtYToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06IHtcblx0XHRcdFx0XHR0aXRsZTogJ0lzb2xhdGlvbicsIGRlc2NyaXB0aW9uOiAnJywgdHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydmb2xkZXInXSwgZW51bUxhYmVsczogWydGb2xkZXInXSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnZm9sZGVyJywgcmVhZE9ubHk6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0dmFsdWVzOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICdmb2xkZXInIH0sXG5cdH0gYXMgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ7XG59XG5cbi8qKlxuICogRmFrZSBwcm92aWRlciB3aG9zZSBgZ2V0U2Vzc2lvbkNvbmZpZ2AgcmV0dXJucyB3aGF0ZXZlciBjb25maWcgaXMgc2V0LiBUaGVcbiAqIHByb3ZpZGVyIChub3QgdGhlIHBpY2tlcikgb3ducyB0aGUgc2VlZGVkIHNjaGVtYSwgc28gYSBwaWNrZXIgcmVjcmVhdGVkIGJ5IGFcbiAqIHRvb2xiYXIgcmVidWlsZCBzdGlsbCByZWFkcyB0aGUgc2VlZGVkIGNoaXBzIGZyb20gaGVyZS5cbiAqL1xuY2xhc3MgRmFrZVByb3ZpZGVyIGltcGxlbWVudHMgUGljazxJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciwgJ2lkJyB8ICdvbkRpZENoYW5nZVNlc3Npb25Db25maWcnIHwgJ2dldFNlc3Npb25Db25maWcnIHwgJ2dldENyZWF0ZVNlc3Npb25Db25maWcnIHwgJ2lzU2Vzc2lvbkNvbmZpZ1Jlc29sdmluZycgfCAnc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlJyB8ICdnZXRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMnPiB7XG5cdHJlYWRvbmx5IGlkID0gTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnOiBFdmVudDxzdHJpbmc+O1xuXHRjb25maWc6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0gbWFrZVJlcG9Db25maWcoJ21haW4nKTtcblx0cmVhZG9ubHkgcmVzb2x2aW5nID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdyZXNvbHZpbmcnLCBmYWxzZSk7XG5cdGlzTmV3ID0gdHJ1ZTtcblx0LyoqIENvbXBsZXRpb25zIHJldHVybmVkIGJ5IGBnZXRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNgLCBlLmcuIGZvciB0aGUgZHluYW1pYyBicmFuY2ggcGlja2VyLiAqL1xuXHRjb21wbGV0aW9uczogcmVhZG9ubHkgU2Vzc2lvbkNvbmZpZ1ZhbHVlSXRlbVtdID0gW107XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZW1pdHRlcjogRW1pdHRlcjxzdHJpbmc+KSB7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVNlc3Npb25Db25maWcgPSBfZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdGdldFNlc3Npb25Db25maWcoKTogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5jb25maWc7IH1cblx0Z2V0Q3JlYXRlU2Vzc2lvbkNvbmZpZygpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLmlzTmV3ID8ge30gOiB1bmRlZmluZWQ7IH1cblx0aXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKCkgeyByZXR1cm4gdGhpcy5yZXNvbHZpbmc7IH1cblx0YXN5bmMgc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGdldFNlc3Npb25Db25maWdDb21wbGV0aW9ucygpOiBQcm9taXNlPHJlYWRvbmx5IFNlc3Npb25Db25maWdWYWx1ZUl0ZW1bXT4geyByZXR1cm4gdGhpcy5jb21wbGV0aW9uczsgfVxuXG5cdC8qKiBTd2FwIHRoZSBjb25maWcgKyByZXNvbHZpbmcgZmxhZyBhbmQgcHVsc2UsIGFzIHRoZSByZWFsIHByb3ZpZGVyIGRvZXMuICovXG5cdHNldChjb25maWc6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCByZXNvbHZpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmNvbmZpZyA9IGNvbmZpZztcblx0XHR0aGlzLnJlc29sdmluZy5zZXQocmVzb2x2aW5nLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2VtaXR0ZXIuZmlyZShTRVNTSU9OX0lEKTtcblx0fVxufVxuXG5jbGFzcyBBbHdheXNSZW5kZXJDb25maWdQaWNrZXIgZXh0ZW5kcyBBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2VyIHtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9zaG91bGRSZW5kZXJQcm9wZXJ0eShfcHJvcGVydHk6IHN0cmluZywgX3NjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCBfaXNOZXdTZXNzaW9uOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNvbGF0aW9uU2xvdChjb250YWluZXI6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0cmV0dXJuIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnNlc3Npb25zLWNoYXQtaXNvbGF0aW9uLWNoZWNrYm94Jyk7XG59XG5cbmZ1bmN0aW9uIGJyYW5jaFNsb3QoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbnMtY2hhdC1waWNrZXItc2xvdCcpKVxuXHRcdC5maW5kKHNsb3QgPT4gIXNsb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdzZXNzaW9ucy1jaGF0LWlzb2xhdGlvbi1jaGVja2JveCcpKTtcbn1cblxuZnVuY3Rpb24gYnJhbmNoTGFiZWwoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBicmFuY2hTbG90KGNvbnRhaW5lcik/LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbnMtY2hhdC1kcm9wZG93bi1sYWJlbCcpPy50ZXh0Q29udGVudCA/PyB1bmRlZmluZWQ7XG59XG5cbi8qKiBDYXB0dXJlcyB0aGUgZGVsZWdhdGUgcGFzc2VkIHRvIHRoZSBsYXN0IGBJQWN0aW9uV2lkZ2V0U2VydmljZS5zaG93YCBjYWxsLCBzbyB0ZXN0cyBjYW4gZHJpdmUgYSBzZWxlY3Rpb24uICovXG5jbGFzcyBDYXB0dXJpbmdBY3Rpb25XaWRnZXRIb2xkZXIge1xuXHRkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxJQ29uZmlnUGlja2VySXRlbT4gfCB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNldHVwU2VydmljZXMoc3RvcmU6IFBpY2s8UmV0dXJuVHlwZTx0eXBlb2YgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlPiwgJ2FkZCc+KSB7XG5cdGNvbnN0IGVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgRmFrZVByb3ZpZGVyKGVtaXR0ZXIpO1xuXHRjb25zdCBhY3Rpb25XaWRnZXQgPSBuZXcgQ2FwdHVyaW5nQWN0aW9uV2lkZ2V0SG9sZGVyKCk7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWN0aW9uV2lkZ2V0U2VydmljZSwge1xuXHRcdGlzVmlzaWJsZTogZmFsc2UsXG5cdFx0aGlkZTogKCkgPT4geyB9LFxuXHRcdHNob3c6IChfdXNlciwgX3N1cHBvcnRzUHJldmlldywgX2l0ZW1zLCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxJQ29uZmlnUGlja2VySXRlbT4pID0+IHsgYWN0aW9uV2lkZ2V0LmRlbGVnYXRlID0gZGVsZWdhdGU7IH0sXG5cdH0gYXMgUGFydGlhbDxJQWN0aW9uV2lkZ2V0U2VydmljZT4gYXMgSUFjdGlvbldpZGdldFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIb3ZlclNlcnZpY2UsIHsgc2V0dXBEZWxheWVkSG92ZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSB9IGFzIFBhcnRpYWw8SUhvdmVyU2VydmljZT4gYXMgSUhvdmVyU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyAoY2xhc3MgZXh0ZW5kcyBtb2NrPElDb25maWd1cmF0aW9uU2VydmljZT4oKSB7IH0pKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCBuZXcgKGNsYXNzIGV4dGVuZHMgbW9jazxJRGlhbG9nU2VydmljZT4oKSB7IH0pKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgbmV3IChjbGFzcyBleHRlbmRzIG1vY2s8SVN0b3JhZ2VTZXJ2aWNlPigpIHsgfSkoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgKGNsYXNzIGV4dGVuZHMgbW9jazxJQ29udGV4dEtleVNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGV4dCA9IEV2ZW50Lk5vbmU7XG5cdH0pKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBuZXcgKGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7XG5cdFx0Ly8gTm8gYHBob25lLWxheW91dGAgY2xhc3MgXHUyMTkyIGBpc1Bob25lTGF5b3V0YCBpcyBmYWxzZSBcdTIxOTIgaXNvbGF0aW9uIHJlbmRlcnMgYXMgYSBjaGVja2JveC5cblx0XHRvdmVycmlkZSByZWFkb25seSBtYWluQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdH0pKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IChjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUHJvdmlkZXJzU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldFByb3ZpZGVycygpOiBJU2Vzc2lvbnNQcm92aWRlcltdIHsgcmV0dXJuIFtwcm92aWRlciBhcyB1bmtub3duIGFzIElTZXNzaW9uc1Byb3ZpZGVyXTsgfVxuXHRcdG92ZXJyaWRlIGdldFByb3ZpZGVyPFQgZXh0ZW5kcyBJU2Vzc2lvbnNQcm92aWRlcj4oaWQ6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIGlkID09PSBwcm92aWRlci5pZCA/IHByb3ZpZGVyIGFzIHVua25vd24gYXMgVCA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pKCkpO1xuXG5cdGNvbnN0IHNlc3Npb25PYnMgPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgeyBwcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBzZXNzaW9uSWQ6IFNFU1NJT05fSUQgfSBhcyBJQWN0aXZlU2Vzc2lvbik7XG5cdHJldHVybiB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCBwcm92aWRlciwgc2Vzc2lvbk9icywgYWN0aW9uV2lkZ2V0IH07XG59XG5cbi8qKiBDcmVhdGUgYW5kIHJlbmRlciBhIGZyZXNoIHBpY2tlciBpbnN0YW5jZSwgYXMgdGhlIHRvb2xiYXIgZG9lcyBvbiBhIHJlYnVpbGQuICovXG5mdW5jdGlvbiByZW5kZXJQaWNrZXIoc3RvcmU6IFBpY2s8UmV0dXJuVHlwZTx0eXBlb2YgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlPiwgJ2FkZCc+LCBzZXJ2aWNlczogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0dXBTZXJ2aWNlcz4pIHtcblx0Y29uc3QgcGlja2VyID0gc3RvcmUuYWRkKHNlcnZpY2VzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIsIHNlcnZpY2VzLnNlc3Npb25PYnMpKTtcblx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdHBpY2tlci5yZW5kZXIoY29udGFpbmVyKTtcblx0cmV0dXJuIHsgcGlja2VyLCBjb250YWluZXIgfTtcbn1cblxuc3VpdGUoJ0FnZW50IEhvc3QgU2Vzc2lvbiBDb25maWcgUGlja2VyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGxhY2VzIG1vZGUgaW1tZWRpYXRlbHkgYmVmb3JlIGFwcHJvdmFscyBpbiBzZWNvbmRhcnkgdG9vbGJhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3VtbWFyaXplID0gKG1lbnU6IE1lbnVJZCwgaWRzOiByZWFkb25seSBzdHJpbmdbXSkgPT4gTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhtZW51KVxuXHRcdFx0LmZpbHRlcihpc0lNZW51SXRlbSlcblx0XHRcdC5maWx0ZXIoaXRlbSA9PiBpZHMuaW5jbHVkZXMoaXRlbS5jb21tYW5kLmlkKSlcblx0XHRcdC5tYXAoaXRlbSA9PiAoeyBpZDogaXRlbS5jb21tYW5kLmlkLCBvcmRlcjogaXRlbS5vcmRlciB9KSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiAoYS5vcmRlciA/PyAwKSAtIChiLm9yZGVyID8/IDApKTtcblxuXHRcdGNvbnN0IG5ld1Nlc3Npb25JZHMgPSBbXG5cdFx0XHQnc2Vzc2lvbnMuYWdlbnRIb3N0Lm5ld1Nlc3Npb25Nb2RlUGlja2VyJyxcblx0XHRcdCdzZXNzaW9ucy5hZ2VudEhvc3QubmV3U2Vzc2lvbkFwcHJvdmVQaWNrZXInLFxuXHRcdFx0J3Nlc3Npb25zLmFnZW50SG9zdC5uZXdTZXNzaW9uUGVybWlzc2lvbk1vZGVQaWNrZXInLFxuXHRcdF07XG5cdFx0Y29uc3QgcnVubmluZ1Nlc3Npb25JZHMgPSBbXG5cdFx0XHQnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uTW9kZVBpY2tlcicsXG5cdFx0XHQnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uQ29uZmlnUGlja2VyJyxcblx0XHRcdCdzZXNzaW9ucy5hZ2VudEhvc3QucnVubmluZ1Nlc3Npb25QZXJtaXNzaW9uTW9kZVBpY2tlcicsXG5cdFx0XTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bmV3U2Vzc2lvblByaW1hcnk6IHN1bW1hcml6ZShNZW51cy5OZXdTZXNzaW9uQ29uZmlnLCBuZXdTZXNzaW9uSWRzKSxcblx0XHRcdG5ld1Nlc3Npb25TZWNvbmRhcnk6IHN1bW1hcml6ZShNZW51cy5OZXdTZXNzaW9uQ29udHJvbCwgbmV3U2Vzc2lvbklkcyksXG5cdFx0XHRydW5uaW5nU2Vzc2lvblByaW1hcnk6IHN1bW1hcml6ZShNZW51SWQuQ2hhdElucHV0LCBydW5uaW5nU2Vzc2lvbklkcyksXG5cdFx0XHRydW5uaW5nU2Vzc2lvblNlY29uZGFyeTogc3VtbWFyaXplKE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksIHJ1bm5pbmdTZXNzaW9uSWRzKSxcblx0XHR9LCB7XG5cdFx0XHRuZXdTZXNzaW9uUHJpbWFyeTogW10sXG5cdFx0XHRuZXdTZXNzaW9uU2Vjb25kYXJ5OiBbXG5cdFx0XHRcdHsgaWQ6ICdzZXNzaW9ucy5hZ2VudEhvc3QubmV3U2Vzc2lvbk1vZGVQaWNrZXInLCBvcmRlcjogMCB9LFxuXHRcdFx0XHR7IGlkOiAnc2Vzc2lvbnMuYWdlbnRIb3N0Lm5ld1Nlc3Npb25BcHByb3ZlUGlja2VyJywgb3JkZXI6IDEgfSxcblx0XHRcdFx0eyBpZDogJ3Nlc3Npb25zLmFnZW50SG9zdC5uZXdTZXNzaW9uUGVybWlzc2lvbk1vZGVQaWNrZXInLCBvcmRlcjogMiB9LFxuXHRcdFx0XSxcblx0XHRcdHJ1bm5pbmdTZXNzaW9uUHJpbWFyeTogW10sXG5cdFx0XHRydW5uaW5nU2Vzc2lvblNlY29uZGFyeTogW1xuXHRcdFx0XHR7IGlkOiAnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uTW9kZVBpY2tlcicsIG9yZGVyOiA5IH0sXG5cdFx0XHRcdHsgaWQ6ICdzZXNzaW9ucy5hZ2VudEhvc3QucnVubmluZ1Nlc3Npb25Db25maWdQaWNrZXInLCBvcmRlcjogMTAgfSxcblx0XHRcdFx0eyBpZDogJ3Nlc3Npb25zLmFnZW50SG9zdC5ydW5uaW5nU2Vzc2lvblBlcm1pc3Npb25Nb2RlUGlja2VyJywgb3JkZXI6IDExIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHBpY2tlciByZWNyZWF0ZWQgb24gYSBzZXNzaW9uIHN3aXRjaCBzdGlsbCByZW5kZXJzIHRoZSBwcm92aWRlci1zZWVkZWQgY2hpcHMgKGRpc2FibGVkKSB3aGlsZSByZXNvbHZpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBzZXR1cFNlcnZpY2VzKHN0b3JlKTtcblx0XHRjb25zdCB7IHByb3ZpZGVyIH0gPSBzZXJ2aWNlcztcblxuXHRcdC8vIERyYWZ0IHJlc29sdmVkIFx1MjE5MiBjaGlwcyBwcmVzZW50IGFuZCBlbmFibGVkLlxuXHRcdHByb3ZpZGVyLnNldChtYWtlUmVwb0NvbmZpZygnbWFpbicpLCBmYWxzZSk7XG5cdFx0Y29uc3QgZmlyc3QgPSByZW5kZXJQaWNrZXIoc3RvcmUsIHNlcnZpY2VzKTtcblx0XHRhc3NlcnQub2soaXNvbGF0aW9uU2xvdChmaXJzdC5jb250YWluZXIpLCAnaXNvbGF0aW9uIGNoZWNrYm94IHJlbmRlcnMgZm9yIGEgcmVzb2x2ZWQgc2NoZW1hJyk7XG5cdFx0YXNzZXJ0Lm9rKGJyYW5jaFNsb3QoZmlyc3QuY29udGFpbmVyKSwgJ2JyYW5jaCBjaGlwIHJlbmRlcnMgZm9yIGEgcmVzb2x2ZWQgc2NoZW1hJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzb2xhdGlvblNsb3QoZmlyc3QuY29udGFpbmVyKSEuY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpLCBmYWxzZSk7XG5cblx0XHQvLyBBIHNlc3Npb24tdHlwZSBzd2l0Y2ggZGlzcG9zZXMgdGhlIHRvb2xiYXIncyBwaWNrZXI7IHRoZSBwcm92aWRlciBzZWVkcyB0aGVcblx0XHQvLyBuZXcgKHN0aWxsLXJlc29sdmluZykgZHJhZnQncyBjb25maWcgd2l0aCB0aGUgY2FjaGVkIGNoaXBzLlxuXHRcdGZpcnN0LnBpY2tlci5kaXNwb3NlKCk7XG5cdFx0cHJvdmlkZXIuc2V0KG1ha2VSZXBvQ29uZmlnKCksIHRydWUpO1xuXG5cdFx0Ly8gVGhlIGZyZXNobHkgY3JlYXRlZCBwaWNrZXIgc3RpbGwgc2hvd3MgdGhlIGNoaXBzIChkaXNhYmxlZCkgXHUyMDE0IHRoZSBjYWNoZVxuXHRcdC8vIGxpdmVzIG9uIHRoZSBwcm92aWRlciwgbm90IHRoZSBkaXNwb3NlZCBwaWNrZXIgaW5zdGFuY2UuXG5cdFx0Y29uc3Qgc2Vjb25kID0gcmVuZGVyUGlja2VyKHN0b3JlLCBzZXJ2aWNlcyk7XG5cdFx0YXNzZXJ0Lm9rKGlzb2xhdGlvblNsb3Qoc2Vjb25kLmNvbnRhaW5lciksICdpc29sYXRpb24gdmlzaWJsZSBvbiBhIGZyZXNobHkgY3JlYXRlZCBwaWNrZXInKTtcblx0XHRhc3NlcnQub2soYnJhbmNoU2xvdChzZWNvbmQuY29udGFpbmVyKSwgJ2JyYW5jaCB2aXNpYmxlIG9uIGEgZnJlc2hseSBjcmVhdGVkIHBpY2tlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc29sYXRpb25TbG90KHNlY29uZC5jb250YWluZXIpIS5jbGFzc0xpc3QuY29udGFpbnMoJ3Jlc29sdmluZycpLCB0cnVlLCAnaXNvbGF0aW9uIGJsb2NrcyBpbnRlcmFjdGlvbiB3aXRob3V0IGRpbW1pbmcgd2hpbGUgcmVzb2x2aW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzb2xhdGlvblNsb3Qoc2Vjb25kLmNvbnRhaW5lcikhLmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSwgZmFsc2UsICdpc29sYXRpb24ga2VlcHMgaXRzIG5vcm1hbCBwcmVzZW50YXRpb24gd2hpbGUgcmVzb2x2aW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJyYW5jaFNsb3Qoc2Vjb25kLmNvbnRhaW5lcikhLmNsYXNzTGlzdC5jb250YWlucygncmVzb2x2aW5nJyksIHRydWUsICdicmFuY2ggYmxvY2tzIGludGVyYWN0aW9uIHdpdGhvdXQgZGltbWluZyB3aGlsZSByZXNvbHZpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJhbmNoU2xvdChzZWNvbmQuY29udGFpbmVyKSEuY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpLCBmYWxzZSwgJ2JyYW5jaCBrZWVwcyBpdHMgbm9ybWFsIHByZXNlbnRhdGlvbiB3aGlsZSByZXNvbHZpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNvbGF0aW9uU2xvdChzZWNvbmQuY29udGFpbmVyKSEucXVlcnlTZWxlY3RvcignLm1vbmFjby1jaGVja2JveCcpPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSwgJ3RydWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJhbmNoU2xvdChzZWNvbmQuY29udGFpbmVyKSEucXVlcnlTZWxlY3RvcignYS5hY3Rpb24tbGFiZWwnKT8uZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyksICd0cnVlJyk7XG5cblx0XHQvLyBSZXNvbHZlIGxhbmRzIFx1MjE5MiBjaGlwcyByZS1lbmFibGUgYW5kIHJlZmxlY3QgdGhlIHJlc29sdmVkIHZhbHVlLlxuXHRcdHByb3ZpZGVyLnNldChtYWtlUmVwb0NvbmZpZygnZGV2JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNvbGF0aW9uU2xvdChzZWNvbmQuY29udGFpbmVyKSEuY2xhc3NMaXN0LmNvbnRhaW5zKCdyZXNvbHZpbmcnKSwgZmFsc2UsICdpc29sYXRpb24gcmUtZW5hYmxlcyBhZnRlciByZXNvbHZlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJyYW5jaFNsb3Qoc2Vjb25kLmNvbnRhaW5lcikhLmNsYXNzTGlzdC5jb250YWlucygncmVzb2x2aW5nJyksIGZhbHNlLCAnYnJhbmNoIHJlLWVuYWJsZXMgYWZ0ZXIgcmVzb2x2ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChicmFuY2hMYWJlbChzZWNvbmQuY29udGFpbmVyKSwgJ2RldicsICdicmFuY2ggbGFiZWwgcmVmbGVjdHMgdGhlIHJlc29sdmVkIHZhbHVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHRoZSBpc29sYXRpb24gY2hlY2tib3ggbm9kZSBhbmQgZm9jdXMgc3RhYmxlIHdoaWxlIGNvbmZpZyByZXNvbHZlcycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IHNldHVwU2VydmljZXMoc3RvcmUpO1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIgfSA9IHNlcnZpY2VzO1xuXHRcdHByb3ZpZGVyLnNldChtYWtlUmVwb0NvbmZpZygnbWFpbicpLCBmYWxzZSk7XG5cdFx0Y29uc3QgeyBjb250YWluZXIgfSA9IHJlbmRlclBpY2tlcihzdG9yZSwgc2VydmljZXMpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiBjb250YWluZXIucmVtb3ZlKCkgfSk7XG5cblx0XHRjb25zdCBjaGVja2JveCA9IGlzb2xhdGlvblNsb3QoY29udGFpbmVyKSEucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tY2hlY2tib3gnKSE7XG5cdFx0Y2hlY2tib3guZm9jdXMoKTtcblx0XHRwcm92aWRlci5zZXQobWFrZVJlcG9Db25maWcoJ21haW4nLCAnZm9sZGVyJyksIHRydWUpO1xuXHRcdGNvbnN0IHJlc29sdmluZ0NoZWNrYm94ID0gaXNvbGF0aW9uU2xvdChjb250YWluZXIpIS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLm1vbmFjby1jaGVja2JveCcpITtcblx0XHRjb25zdCByZXNvbHZpbmdTdGF0ZSA9IHtcblx0XHRcdHNhbWVOb2RlOiByZXNvbHZpbmdDaGVja2JveCA9PT0gY2hlY2tib3gsXG5cdFx0XHRmb2N1c2VkOiBkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBjaGVja2JveCxcblx0XHRcdGNoZWNrZWQ6IHJlc29sdmluZ0NoZWNrYm94LmdldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJyksXG5cdFx0XHRkaXNhYmxlZDogcmVzb2x2aW5nQ2hlY2tib3guZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyksXG5cdFx0XHRkaXNhYmxlZFBhbGV0dGU6IHJlc29sdmluZ0NoZWNrYm94LmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSxcblx0XHRcdHJlc29sdmluZzogaXNvbGF0aW9uU2xvdChjb250YWluZXIpIS5jbGFzc0xpc3QuY29udGFpbnMoJ3Jlc29sdmluZycpLFxuXHRcdFx0ZGltbWVkOiBpc29sYXRpb25TbG90KGNvbnRhaW5lcikhLmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSxcblx0XHR9O1xuXG5cdFx0cHJvdmlkZXIuc2V0KG1ha2VSZXBvQ29uZmlnKCdtYWluJywgJ2ZvbGRlcicpLCBmYWxzZSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRDaGVja2JveCA9IGlzb2xhdGlvblNsb3QoY29udGFpbmVyKSEucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tY2hlY2tib3gnKSE7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNvbHZpbmc6IHJlc29sdmluZ1N0YXRlLFxuXHRcdFx0cmVzb2x2ZWQ6IHtcblx0XHRcdFx0c2FtZU5vZGU6IHJlc29sdmVkQ2hlY2tib3ggPT09IGNoZWNrYm94LFxuXHRcdFx0XHRmb2N1c2VkOiBkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBjaGVja2JveCxcblx0XHRcdFx0Y2hlY2tlZDogcmVzb2x2ZWRDaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpLFxuXHRcdFx0XHRkaXNhYmxlZDogcmVzb2x2ZWRDaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSxcblx0XHRcdFx0cmVzb2x2aW5nOiBpc29sYXRpb25TbG90KGNvbnRhaW5lcikhLmNsYXNzTGlzdC5jb250YWlucygncmVzb2x2aW5nJyksXG5cdFx0XHRcdGNvdW50OiBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnNlc3Npb25zLWNoYXQtaXNvbGF0aW9uLWNoZWNrYm94JykubGVuZ3RoLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRyZXNvbHZpbmc6IHtcblx0XHRcdFx0c2FtZU5vZGU6IHRydWUsXG5cdFx0XHRcdGZvY3VzZWQ6IHRydWUsXG5cdFx0XHRcdGNoZWNrZWQ6ICdmYWxzZScsXG5cdFx0XHRcdGRpc2FibGVkOiAndHJ1ZScsXG5cdFx0XHRcdGRpc2FibGVkUGFsZXR0ZTogZmFsc2UsXG5cdFx0XHRcdHJlc29sdmluZzogdHJ1ZSxcblx0XHRcdFx0ZGltbWVkOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHRyZXNvbHZlZDoge1xuXHRcdFx0XHRzYW1lTm9kZTogdHJ1ZSxcblx0XHRcdFx0Zm9jdXNlZDogdHJ1ZSxcblx0XHRcdFx0Y2hlY2tlZDogJ2ZhbHNlJyxcblx0XHRcdFx0ZGlzYWJsZWQ6ICdmYWxzZScsXG5cdFx0XHRcdHJlc29sdmluZzogZmFsc2UsXG5cdFx0XHRcdGNvdW50OiAxLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnJhbmNoIHBpY2tlciBrZWVwcyB0aGUgZGlzcGxheSBsYWJlbCBmb3IgYSBkeW5hbWljIChlbnVtRHluYW1pYykgc2VsZWN0aW9uLCBub3QganVzdCB0aGUgcGVyc2lzdGVkIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gc2V0dXBTZXJ2aWNlcyhzdG9yZSk7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgYWN0aW9uV2lkZ2V0IH0gPSBzZXJ2aWNlcztcblxuXHRcdHByb3ZpZGVyLmNvbmZpZyA9IG1ha2VEeW5hbWljQnJhbmNoQ29uZmlnKCdtYWluJyk7XG5cdFx0Y29uc3QgeyBwaWNrZXIsIGNvbnRhaW5lciB9ID0gcmVuZGVyUGlja2VyKHN0b3JlLCBzZXJ2aWNlcyk7XG5cblx0XHQvLyBPbmx5IGB2YWx1ZWAgZ2V0cyBwZXJzaXN0ZWQgc2VydmVyLXNpZGUgZm9yIGVudW1EeW5hbWljIHByb3BlcnRpZXMsIHNvIHRoZVxuXHRcdC8vIGRpc3BsYXkgbGFiZWwgZm9yIGEgZnJlc2hseSBzZWxlY3RlZCBicmFuY2ggbXVzdCBjb21lIGZyb20gdGhlIHBpY2tlcidzXG5cdFx0Ly8gb3duIGNhY2hlIG9mIHRoZSBsYXN0LWZldGNoZWQgY29tcGxldGlvbnMsIG5vdCBmcm9tIHRoZSBzY2hlbWEgKHRoZXJlIGlzXG5cdFx0Ly8gbm8gc3RhdGljIGBlbnVtYC9gZW51bUxhYmVsc2AgZm9yIGEgZHluYW1pYyBwcm9wZXJ0eSkgb3IgdGhlIHJhdyB2YWx1ZS5cblx0XHRwcm92aWRlci5jb21wbGV0aW9ucyA9IFt7IHZhbHVlOiAnZmVhdHVyZS94JywgbGFiZWw6ICdGZWF0dXJlIFgnIH1dO1xuXG5cdFx0Y29uc3QgdHJpZ2dlciA9IGJyYW5jaFNsb3QoY29udGFpbmVyKSEucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2EuYWN0aW9uLWxhYmVsJykhO1xuXHRcdHRyaWdnZXIuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlKSk7XG5cblx0XHRhc3NlcnQub2soYWN0aW9uV2lkZ2V0LmRlbGVnYXRlLCAnb3BlbmluZyB0aGUgcGlja2VyIGZldGNoZXMgY29tcGxldGlvbnMgYW5kIHNob3dzIHRoZSBhY3Rpb24gd2lkZ2V0Jyk7XG5cdFx0YWN0aW9uV2lkZ2V0LmRlbGVnYXRlIS5vblNlbGVjdCh7IHZhbHVlOiAnZmVhdHVyZS94JywgbGFiZWw6ICdGZWF0dXJlIFgnIH0pO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlKSk7XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgcHJvdmlkZXIgcGVyc2lzdGluZyB0aGUgbmV3IHZhbHVlIGFuZCBub3RpZnlpbmcgbGlzdGVuZXJzLFxuXHRcdC8vIGFzIHRoZSByZWFsIHByb3ZpZGVyIGRvZXMgb25jZSBgc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlYCByZXNvbHZlcy5cblx0XHRwcm92aWRlci5zZXQobWFrZUR5bmFtaWNCcmFuY2hDb25maWcoJ2ZlYXR1cmUveCcpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJhbmNoTGFiZWwoY29udGFpbmVyKSwgJ0ZlYXR1cmUgWCcsICdicmFuY2ggbGFiZWwgdXNlcyB0aGUgY2FjaGVkIGNvbXBsZXRpb24gbGFiZWwsIG5vdCB0aGUgcmF3IHZhbHVlJyk7XG5cdFx0cGlja2VyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZXZpY3RzIGR5bmFtaWMtdmFsdWUgbGFiZWwgY2FjaGUgZW50cmllcyBvbmNlIHRoZSBwaWNrZXIgbW92ZXMgdG8gYSBkaWZmZXJlbnQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IHNldHVwU2VydmljZXMoc3RvcmUpO1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGFjdGlvbldpZGdldCwgc2Vzc2lvbk9icyB9ID0gc2VydmljZXM7XG5cblx0XHQvLyBUaGUgbmV3LXNlc3Npb24gY29tcG9zZXIncyBgX3Nlc3Npb25gIG9ic2VydmFibGUgdHJhY2tzIHRoZSBnbG9iYWxseVxuXHRcdC8vIGFjdGl2ZSBzZXNzaW9uLCBzbyB0aGUgKnNhbWUqIHBpY2tlciBpbnN0YW5jZSBjYW4gYmUgc2hvd24gYSBzZXF1ZW5jZSBvZlxuXHRcdC8vIGRpZmZlcmVudCBkcmFmdCBzZXNzaW9ucyBvdmVyIGl0cyBsaWZldGltZSAoc2VlIGBOZXdDaGF0V2lkZ2V0Ll9zZXNzaW9uYCkuXG5cdFx0Ly8gU2ltdWxhdGUgdGhhdCBoZXJlIGJ5IG11dGF0aW5nIGBzZXNzaW9uT2JzYCBpbiBwbGFjZSBpbnN0ZWFkIG9mIGRpc3Bvc2luZy5cblx0XHRwcm92aWRlci5jb25maWcgPSBtYWtlRHluYW1pY0JyYW5jaENvbmZpZygnbWFpbicpO1xuXHRcdGNvbnN0IHsgcGlja2VyLCBjb250YWluZXIgfSA9IHJlbmRlclBpY2tlcihzdG9yZSwgc2VydmljZXMpO1xuXG5cdFx0cHJvdmlkZXIuY29tcGxldGlvbnMgPSBbeyB2YWx1ZTogJ2ZlYXR1cmUveCcsIGxhYmVsOiAnRmVhdHVyZSBYJyB9XTtcblx0XHRjb25zdCB0cmlnZ2VyID0gYnJhbmNoU2xvdChjb250YWluZXIpIS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignYS5hY3Rpb24tbGFiZWwnKSE7XG5cdFx0dHJpZ2dlci5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUpKTtcblx0XHRhY3Rpb25XaWRnZXQuZGVsZWdhdGUhLm9uU2VsZWN0KHsgdmFsdWU6ICdmZWF0dXJlL3gnLCBsYWJlbDogJ0ZlYXR1cmUgWCcgfSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUpKTtcblx0XHRwcm92aWRlci5zZXQobWFrZUR5bmFtaWNCcmFuY2hDb25maWcoJ2ZlYXR1cmUveCcpLCBmYWxzZSk7XG5cblx0XHRjb25zdCBjYWNoZSA9IChwaWNrZXIgYXMgdW5rbm93biBhcyB7IF9keW5hbWljVmFsdWVMYWJlbHM6IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIHN0cmluZz4+IH0pLl9keW5hbWljVmFsdWVMYWJlbHM7XG5cdFx0YXNzZXJ0Lm9rKEFycmF5LmZyb20oY2FjaGUua2V5cygpKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aChgJHtTRVNTSU9OX0lEfVxcMGApKSwgJ2NhY2hlIGhvbGRzIGFuIGVudHJ5IGZvciB0aGUgZmlyc3Qgc2Vzc2lvbicpO1xuXG5cdFx0Ly8gTW92ZSB0aGUgcGlja2VyIHRvIGEgZGlmZmVyZW50IHNlc3Npb24sIGFzIHdvdWxkIGhhcHBlbiB3aGVuIHRoZVxuXHRcdC8vIGNvbXBvc2VyJ3MgYWN0aXZlIHNlc3Npb24gY2hhbmdlcyB3aXRob3V0IHRoZSBwaWNrZXIgYmVpbmcgcmVjcmVhdGVkLlxuXHRcdGNvbnN0IE9USEVSX1NFU1NJT05fSUQgPSAnbG9jYWwtYWdlbnQtaG9zdDpzMic7XG5cdFx0cHJvdmlkZXIuY29uZmlnID0gbWFrZUR5bmFtaWNCcmFuY2hDb25maWcoJ21haW4nKTtcblx0XHRzZXNzaW9uT2JzLnNldCh7IHByb3ZpZGVySWQ6IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQsIHNlc3Npb25JZDogT1RIRVJfU0VTU0lPTl9JRCB9IGFzIElBY3RpdmVTZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEFycmF5LmZyb20oY2FjaGUua2V5cygpKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aChgJHtTRVNTSU9OX0lEfVxcMGApKSwgZmFsc2UsICdzdGFsZSBlbnRyaWVzIGZvciB0aGUgcHJldmlvdXMgc2Vzc2lvbiBhcmUgZXZpY3RlZCcpO1xuXHRcdHBpY2tlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlbmRlciBmb2xkZXIgaXNvbGF0aW9uIHdoZW4gdGhlIHdvcmtzcGFjZSBoYXMgbm8gR2l0IHJlcG9zaXRvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBzZXR1cFNlcnZpY2VzKHN0b3JlKTtcblx0XHRzZXJ2aWNlcy5wcm92aWRlci5jb25maWcgPSBtYWtlTm9HaXRDb25maWcoKTtcblx0XHRjb25zdCBwaWNrZXIgPSBzdG9yZS5hZGQoc2VydmljZXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWx3YXlzUmVuZGVyQ29uZmlnUGlja2VyLCBzZXJ2aWNlcy5zZXNzaW9uT2JzKSk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0cGlja2VyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzb2xhdGlvblNsb3QoY29udGFpbmVyKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldmVyIHJlbmRlcnMgYSBjaGlwIGZvciB0aGUgaGlkZGVuIHdvcmt0cmVlQnJhbmNoVHJhY2sgY2FycmllciBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IHNldHVwU2VydmljZXMoc3RvcmUpO1xuXHRcdHNlcnZpY2VzLnByb3ZpZGVyLmNvbmZpZyA9IHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06IHtcblx0XHRcdFx0XHRcdHRpdGxlOiAnSXNvbGF0aW9uJywgZGVzY3JpcHRpb246ICcnLCB0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGVudW06IFsnZm9sZGVyJywgJ3dvcmt0cmVlJ10sIGVudW1MYWJlbHM6IFsnRm9sZGVyJywgJ1dvcmt0cmVlJ10sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnd29ya3RyZWUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja106IHtcblx0XHRcdFx0XHRcdHRpdGxlOiAnVHJhY2sgQnJhbmNoJywgZGVzY3JpcHRpb246ICcnLCB0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSwgcmVhZE9ubHk6IHRydWUsIHNlc3Npb25NdXRhYmxlOiBmYWxzZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXTogZmFsc2UgfSxcblx0XHR9IGFzIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0O1xuXHRcdGNvbnN0IHBpY2tlciA9IHN0b3JlLmFkZChzZXJ2aWNlcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBbHdheXNSZW5kZXJDb25maWdQaWNrZXIsIHNlcnZpY2VzLnNlc3Npb25PYnMpKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRwaWNrZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5zZXNzaW9ucy1jaGF0LXBpY2tlci1zbG90JykubGVuZ3RoLCAxLCAnb25seSB0aGUgaXNvbGF0aW9uIGNoZWNrYm94IHJlbmRlcnMsIG5vdCBhIHdvcmt0cmVlQnJhbmNoVHJhY2sgY2hpcCcpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWEsUUFBUSxvQkFBb0I7QUFFbEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxhQUFhO0FBQ3RCLFNBQXFDLG9DQUFvQztBQUN6RSxTQUFTLGlDQUFpQztBQUcxQyxTQUFTLG9DQUF1RDtBQUVoRSxNQUFNLGFBQWE7QUFHbkIsU0FBUyxlQUFlLGFBQXNCLFlBQW1DLFlBQXdDO0FBQ3hILFNBQU87QUFBQSxJQUNOLFFBQVE7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
