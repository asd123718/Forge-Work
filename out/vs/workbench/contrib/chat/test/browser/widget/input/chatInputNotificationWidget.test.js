import assert from "assert";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { SyncDescriptor } from "../../../../../../../platform/instantiation/common/descriptors.js";
import { getSingletonServiceDescriptors } from "../../../../../../../platform/instantiation/common/extensions.js";
import { ServiceCollection } from "../../../../../../../platform/instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService, NullTelemetryServiceShape } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from "../../../../browser/widget/input/chatInputNotificationService.js";
import { ChatInputPart } from "../../../../browser/widget/input/chatInputPart.js";
import { ChatInputNotificationWidget } from "../../../../browser/widget/input/chatInputNotificationWidget.js";
import { localChatSessionType, SessionType } from "../../../../common/chatSessionsService.js";
import { getChatSessionType } from "../../../../common/model/chatUri.js";
class TestCommandService {
  constructor() {
    this.onWillExecuteCommand = Event.None;
    this.onDidExecuteCommand = Event.None;
    this.executed = [];
  }
  async executeCommand(id, ...args) {
    this.executed.push({ id, args });
    return void 0;
  }
}
class RecordingLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this._onError = new Emitter();
    this.onError = this._onError.event;
  }
  error() {
    this._onError.fire();
  }
  dispose() {
    this._onError.dispose();
    super.dispose();
  }
}
class RecordingTelemetryService extends NullTelemetryServiceShape {
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
suite("ChatInputNotificationWidget", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createNotificationService() {
    const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatInputNotificationService)?.[1];
    assert.ok(descriptor);
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const childInstantiationService = store.add(instantiationService.createChild(new ServiceCollection(
      [IChatInputNotificationService, new SyncDescriptor(descriptor.ctor, descriptor.staticArguments)]
    )));
    const notificationService = childInstantiationService.get(IChatInputNotificationService);
    store.add(notificationService);
    return notificationService;
  }
  test("reactively applies session type filter when pending delegation target changes", () => {
    const currentSessionType = observableValue("currentSessionType", localChatSessionType);
    const notificationService = createNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService);
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, { modelTargetChatSessionType: currentSessionType }));
    notificationService.setNotification({
      id: "local-only",
      severity: ChatInputNotificationSeverity.Info,
      message: "Local only",
      description: void 0,
      actions: [],
      dismissible: false,
      autoDismissOnMessage: false,
      sessionTypes: [localChatSessionType]
    });
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification-header")?.textContent, "Local only");
    currentSessionType.set(SessionType.AgentHostCopilot, void 0);
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification-header"), null);
    currentSessionType.set(localChatSessionType, void 0);
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification-header")?.textContent, "Local only");
  });
  test("reports visibility changes when a notification is shown and hidden", () => {
    const currentSessionType = observableValue("currentSessionType", localChatSessionType);
    const visibilityChanges = [];
    const notificationService = createNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService);
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    store.add(instantiationService.createInstance(ChatInputNotificationWidget, {
      modelTargetChatSessionType: currentSessionType,
      onDidChangeVisibility: (visible) => visibilityChanges.push(visible)
    }));
    notificationService.setNotification({
      id: "local-only",
      severity: ChatInputNotificationSeverity.Info,
      message: "Local only",
      description: void 0,
      actions: [],
      dismissible: false,
      autoDismissOnMessage: false,
      sessionTypes: [localChatSessionType]
    });
    currentSessionType.set(SessionType.AgentHostCopilot, void 0);
    assert.deepStrictEqual(visibilityChanges, [true, false]);
  });
  test("reactively applies session resource filter when the session changes", () => {
    const firstSession = URI.parse("vscode-chat-session://agent-host-copilotcli/session-1");
    const secondSession = URI.parse("vscode-chat-session://agent-host-copilotcli/session-2");
    const currentSessionType = observableValue("currentSessionType", SessionType.AgentHostCopilot);
    const currentSessionResource = observableValue("currentSessionResource", firstSession);
    const notificationService = createNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService);
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, {
      modelTargetChatSessionType: currentSessionType,
      sessionResource: currentSessionResource
    }));
    notificationService.setNotification({
      id: "first-session-only",
      severity: ChatInputNotificationSeverity.Info,
      message: "First session only",
      description: void 0,
      actions: [],
      dismissible: false,
      autoDismissOnMessage: false,
      sessionResources: [firstSession]
    });
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification-header")?.textContent, "First session only");
    currentSessionResource.set(secondSession, void 0);
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification-header"), null);
  });
  test("reactively filters notifications deferred for new users without hiding other notifications", () => {
    const deferredNotificationsEnabled = observableValue("deferredNotificationsEnabled", false);
    const notificationService = createNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService);
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, { deferredNotificationsEnabled }));
    notificationService.setNotification({
      id: "ordinary",
      severity: ChatInputNotificationSeverity.Info,
      message: "Ordinary notification",
      description: void 0,
      actions: [],
      dismissible: false,
      autoDismissOnMessage: false
    });
    notificationService.setNotification({
      id: "promotion",
      severity: ChatInputNotificationSeverity.Info,
      message: "Model promotion",
      description: void 0,
      actions: [],
      dismissible: false,
      autoDismissOnMessage: false,
      deferForNewUsers: true
    });
    const renderedText = () => widget.domNode.querySelector(".chat-input-notification-header")?.textContent;
    const before = renderedText();
    deferredNotificationsEnabled.set(true, void 0);
    assert.deepStrictEqual({ before, after: renderedText() }, {
      before: "Ordinary notification",
      after: "Model promotion"
    });
  });
  test("standard workbench defers notifications for the first session only", () => {
    const deferredNotificationsEnabled = observableValue("deferredNotificationsEnabled", true);
    let hasSessions = false;
    const harness = {
      options: {},
      environmentService: { isSessionsWindow: false },
      chatService: { hasSessions: () => hasSessions },
      _deferredNotificationsEnabled: deferredNotificationsEnabled,
      _isFirstWorkbenchSession: void 0
    };
    const update = Reflect.get(ChatInputPart.prototype, "updateDeferredNotificationsEligibility");
    const untitled = URI.parse("agent-host-copilotcli:/untitled-1");
    const materialized = URI.parse("agent-host-copilotcli:/session-1");
    const second = URI.parse("agent-host-copilotcli:/session-2");
    update.call(harness);
    const firstSession = deferredNotificationsEnabled.get();
    hasSessions = true;
    update.call(harness, { previousSessionResource: untitled, currentSessionResource: materialized });
    const materializedFirstSession = deferredNotificationsEnabled.get();
    update.call(harness, { previousSessionResource: materialized, currentSessionResource: second });
    assert.deepStrictEqual({
      firstSession,
      materializedFirstSession,
      secondSession: deferredNotificationsEnabled.get()
    }, {
      firstSession: false,
      materializedFirstSession: false,
      secondSession: true
    });
  });
  test("Agents window bypasses the workbench first-session gate", () => {
    const deferredNotificationsEnabled = observableValue("deferredNotificationsEnabled", false);
    const harness = {
      options: {},
      environmentService: { isSessionsWindow: true },
      chatService: { hasSessions: () => false },
      _deferredNotificationsEnabled: deferredNotificationsEnabled,
      _isFirstWorkbenchSession: void 0
    };
    const update = Reflect.get(ChatInputPart.prototype, "updateDeferredNotificationsEligibility");
    update.call(harness);
    assert.strictEqual(deferredNotificationsEnabled.get(), true);
  });
  test("widget option disables deferred notifications", () => {
    const deferredNotificationsEnabled = observableValue("deferredNotificationsEnabled", true);
    const harness = {
      options: { deferredNotificationsEnabled: false },
      environmentService: { isSessionsWindow: true },
      chatService: { hasSessions: () => true },
      _deferredNotificationsEnabled: deferredNotificationsEnabled,
      _isFirstWorkbenchSession: void 0
    };
    const update = Reflect.get(ChatInputPart.prototype, "updateDeferredNotificationsEligibility");
    update.call(harness);
    assert.strictEqual(deferredNotificationsEnabled.get(), false);
  });
  test("renders markdown descriptions as rich content", () => {
    const notificationService = createNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService);
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, void 0));
    notificationService.setNotification({
      id: "markdown-description",
      severity: ChatInputNotificationSeverity.Info,
      message: "Cache is stale",
      description: new MarkdownString("Consider a new chat. [Learn more](https://aka.ms/learn)"),
      actions: [],
      dismissible: false,
      autoDismissOnMessage: false
    });
    const description = widget.domNode.querySelector(".chat-input-notification-description");
    const link = description?.querySelector("a");
    assert.deepStrictEqual({
      text: description?.textContent,
      markdown: !!description?.querySelector(".chat-input-notification-description-markdown"),
      linkText: link?.textContent,
      linkHref: link?.getAttribute("data-href") ?? link?.getAttribute("href")
    }, {
      text: "Consider a new chat. Learn more",
      markdown: true,
      linkText: "Learn more",
      linkHref: "https://aka.ms/learn"
    });
  });
  test("auto-dismiss on message only applies to the sending session", () => {
    const firstSession = URI.parse("vscode-chat-session://agent-host-copilotcli/session-1");
    const secondSession = URI.parse("vscode-chat-session://agent-host-copilotcli/session-2");
    const notificationService = createNotificationService();
    for (const [id, sessionResource] of [["first", firstSession], ["second", secondSession]]) {
      notificationService.setNotification({
        id,
        severity: ChatInputNotificationSeverity.Info,
        message: "Cache is stale",
        description: void 0,
        actions: [],
        dismissible: true,
        autoDismissOnMessage: true,
        sessionResources: [sessionResource]
      });
    }
    notificationService.handleMessageSent({ sessionType: SessionType.AgentHostCopilot, sessionResource: firstSession });
    assert.deepStrictEqual({
      inFirstSession: notificationService.getActiveNotification((n) => n.id === "first")?.id,
      inSecondSession: notificationService.getActiveNotification((n) => n.id === "second")?.id
    }, {
      inFirstSession: void 0,
      inSecondSession: "second"
    });
  });
  function createRecordingNotificationService() {
    const notifications = /* @__PURE__ */ new Map();
    const announced = [];
    const dismissed = [];
    const onDidChange = store.add(new Emitter());
    const onDidDismiss = store.add(new Emitter());
    const service = {
      _serviceBrand: void 0,
      onDidChange: onDidChange.event,
      onDidDismiss: onDidDismiss.event,
      setNotification(notification) {
        notifications.set(notification.id, notification);
        onDidChange.fire();
      },
      deleteNotification(id) {
        if (notifications.delete(id)) {
          onDidChange.fire();
        }
      },
      dismissNotification(id) {
        dismissed.push(id);
        onDidDismiss.fire(id);
      },
      getActiveNotification(filter) {
        let active;
        for (const notification of notifications.values()) {
          if (filter && !filter(notification)) {
            continue;
          }
          active = notification;
        }
        return active;
      },
      handleMessageSent() {
      },
      announceRendered(notification) {
        announced.push(notification);
      }
    };
    return { service, announced, dismissed, set: (notification) => service.setNotification(notification) };
  }
  function createWidget(options = {}) {
    const notificationService = createRecordingNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService.service);
    instantiationService.stub(ICommandService, options.commandService ?? new TestCommandService());
    instantiationService.stub(ITelemetryService, options.telemetryService ?? NullTelemetryService);
    if (options.logService) {
      instantiationService.stub(ILogService, options.logService);
    }
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, options.delegate));
    return { notificationService, widget };
  }
  function clickAction(widget) {
    const button = widget.domNode.querySelector(".chat-input-notification-action-button");
    assert.ok(button);
    button.click();
  }
  function showNotification(notificationService, notification) {
    notificationService.set({
      severity: ChatInputNotificationSeverity.Info,
      description: void 0,
      dismissible: true,
      autoDismissOnMessage: false,
      ...notification
    });
  }
  test("action commands execute with provided args", async () => {
    const commandService = new TestCommandService();
    const { notificationService, widget } = createWidget({ commandService });
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ kind: ChatInputNotificationActionKind.Command, label: "Use", commandId: "test.usePromo", commandArgs: [{ modelIdentifier: "m" }] }]
    });
    const didDismiss = Event.toPromise(notificationService.service.onDidDismiss);
    clickAction(widget);
    await didDismiss;
    assert.deepStrictEqual(commandService.executed, [{ id: "test.usePromo", args: [{ modelIdentifier: "m" }] }]);
    assert.strictEqual(notificationService.dismissed.join(","), "promo");
  });
  test("actions without explicit commandArgs are executed with empty args", async () => {
    const commandService = new TestCommandService();
    const { notificationService, widget } = createWidget({ commandService });
    showNotification(notificationService, {
      id: "info",
      message: "Info",
      actions: [{ kind: ChatInputNotificationActionKind.Command, label: "Upgrade", commandId: "test.upgrade" }]
    });
    const didDismiss = Event.toPromise(notificationService.service.onDidDismiss);
    clickAction(widget);
    await didDismiss;
    assert.deepStrictEqual(commandService.executed, [{ id: "test.upgrade", args: [] }]);
    assert.strictEqual(notificationService.dismissed.join(","), "info");
  });
  test("keep-open actions execute without dismissing the notification", async () => {
    const commandService = new TestCommandService();
    const { notificationService, widget } = createWidget({ commandService });
    showNotification(notificationService, {
      id: "setup",
      message: "Setup",
      actions: [{ kind: ChatInputNotificationActionKind.Command, label: "Sign In", commandId: "test.signIn", keepOpen: true }]
    });
    clickAction(widget);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual({
      executed: commandService.executed,
      dismissed: notificationService.dismissed
    }, {
      executed: [{ id: "test.signIn", args: [] }],
      dismissed: []
    });
  });
  test("catches rejected command actions", async () => {
    const logService = store.add(new RecordingLogService());
    const commandService = new class extends TestCommandService {
      async executeCommand(id, ...args) {
        await super.executeCommand(id, ...args);
        throw new Error("command failed");
      }
    }();
    const { notificationService, widget } = createWidget({ commandService, logService });
    showNotification(notificationService, {
      id: "rejected-command",
      message: "Rejected command",
      actions: [{ kind: ChatInputNotificationActionKind.Command, label: "Run", commandId: "test.reject" }],
      dismissible: false
    });
    const didLogError = Event.toPromise(logService.onError);
    clickAction(widget);
    await didLogError;
    assert.deepStrictEqual(commandService.executed, [{ id: "test.reject", args: [] }]);
  });
  test("switch-to-model actions use the rendering input delegate", async () => {
    const telemetryService = new RecordingTelemetryService();
    const switchedModels = [];
    let pickerOpenCount = 0;
    const { notificationService, widget } = createWidget({
      telemetryService,
      delegate: {
        switchToModel: (modelIdentifier) => {
          switchedModels.push(modelIdentifier);
          return true;
        },
        openModelPicker: () => pickerOpenCount++
      }
    });
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ label: "Try Model", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "vendor/model" }]
    });
    clickAction(widget);
    await Promise.resolve();
    assert.deepStrictEqual({
      switchedModels,
      pickerOpenCount,
      actionEvents: telemetryService.events.filter((event) => event.name === "chatInputNotificationAction").map((event) => event.data)
    }, {
      switchedModels: ["vendor/model"],
      pickerOpenCount: 0,
      actionEvents: [{ id: "promo", telemetryId: void 0, actionKind: ChatInputNotificationActionKind.SwitchToModel }]
    });
  });
  test("opens the local model picker when the requested model is unavailable", async () => {
    let pickerOpenCount = 0;
    const { notificationService, widget } = createWidget({
      delegate: {
        switchToModel: () => false,
        openModelPicker: () => pickerOpenCount++
      }
    });
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ label: "Try Model", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "missing/model" }]
    });
    clickAction(widget);
    await Promise.resolve();
    assert.strictEqual(pickerOpenCount, 1);
  });
  test("opens the local model picker when direct selection fails", async () => {
    let pickerOpenCount = 0;
    const logService = store.add(new RecordingLogService());
    const { notificationService, widget } = createWidget({
      logService,
      delegate: {
        switchToModel: () => {
          throw new Error("selection failed");
        },
        openModelPicker: () => pickerOpenCount++
      }
    });
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ label: "Try Model", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "vendor/model" }]
    });
    const didLogError = Event.toPromise(logService.onError);
    clickAction(widget);
    await didLogError;
    assert.strictEqual(pickerOpenCount, 1);
  });
  test("attempts the model picker fallback only once when it fails", async () => {
    const logService = store.add(new RecordingLogService());
    let pickerOpenCount = 0;
    const { notificationService, widget } = createWidget({
      logService,
      delegate: {
        switchToModel: () => false,
        openModelPicker: () => {
          pickerOpenCount++;
          throw new Error("picker failed");
        }
      }
    });
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ label: "Try Model", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "missing/model" }]
    });
    const didLogError = Event.toPromise(logService.onError);
    clickAction(widget);
    await didLogError;
    assert.strictEqual(pickerOpenCount, 1);
  });
  test("does not render semantic actions unsupported by the input", () => {
    const { notificationService, widget } = createWidget();
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ label: "Try Model", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "vendor/model" }]
    });
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification-action-button"), null);
  });
  test("matches Agent Host notifications against the resource scheme", () => {
    const sessionResource = URI.from({ scheme: "agent-host-copilotcli", path: "/untitled-session" });
    const { notificationService, widget } = createWidget({
      delegate: { modelTargetChatSessionType: constObservable(getChatSessionType(sessionResource)) }
    });
    showNotification(notificationService, {
      id: "agent-host-promo",
      message: "Agent Host promo",
      actions: [],
      sessionTypes: ["agent-host-copilotcli"]
    });
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification-header")?.textContent, "Agent Host promo");
  });
  test("matches a notification scoped to both Copilot model targets", () => {
    const currentSessionType = observableValue("currentSessionType", SessionType.AgentHostCopilot);
    const { notificationService, widget } = createWidget({
      delegate: { modelTargetChatSessionType: currentSessionType }
    });
    showNotification(notificationService, {
      id: "copilot-model-setup",
      message: "Choose how you want to use Copilot.",
      actions: [],
      sessionTypes: [SessionType.AgentHostCopilot, SessionType.CopilotCLI]
    });
    const text = () => widget.domNode.querySelector(".chat-input-notification-header")?.textContent;
    const agentHostText = text();
    currentSessionType.set(SessionType.CopilotCLI, void 0);
    const copilotCliText = text();
    assert.deepStrictEqual({
      agentHostText,
      copilotCliText
    }, {
      agentHostText: "Choose how you want to use Copilot.",
      copilotCliText: "Choose how you want to use Copilot."
    });
  });
  test("announces only the notification rendered in the current session", () => {
    const currentSessionType = observableValue("currentSessionType", localChatSessionType);
    const notificationService = createRecordingNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService.service);
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    store.add(instantiationService.createInstance(ChatInputNotificationWidget, { modelTargetChatSessionType: currentSessionType }));
    const lastAnnounced = () => notificationService.announced[notificationService.announced.length - 1];
    notificationService.set({
      id: "copilot-promo",
      severity: ChatInputNotificationSeverity.Info,
      message: "Copilot promo",
      description: void 0,
      actions: [],
      dismissible: true,
      autoDismissOnMessage: false,
      sessionTypes: [SessionType.AgentHostCopilot]
    });
    assert.strictEqual(lastAnnounced(), void 0, "nothing should be announced in a non-matching session");
    currentSessionType.set(SessionType.AgentHostCopilot, void 0);
    assert.strictEqual(lastAnnounced()?.id, "copilot-promo", "the promo should be announced once its session is active");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEV2ZW50LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBnZXRTaW5nbGV0b25TZXJ2aWNlRGVzY3JpcHRvcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQsIENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LCBJQ2hhdElucHV0Tm90aWZpY2F0aW9uLCBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LCBJQ2hhdElucHV0Tm90aWZpY2F0aW9uRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgbG9jYWxDaGF0U2Vzc2lvblR5cGUsIFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuXG5jbGFzcyBUZXN0Q29tbWFuZFNlcnZpY2UgaW1wbGVtZW50cyBJQ29tbWFuZFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbldpbGxFeGVjdXRlQ29tbWFuZDogRXZlbnQ8SUNvbW1hbmRFdmVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEV4ZWN1dGVDb21tYW5kOiBFdmVudDxJQ29tbWFuZEV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cblx0cmVhZG9ubHkgZXhlY3V0ZWQ6IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkgYXJnczogcmVhZG9ubHkgdW5rbm93bltdIH1bXSA9IFtdO1xuXG5cdGFzeW5jIGV4ZWN1dGVDb21tYW5kKGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5leGVjdXRlZC5wdXNoKHsgaWQsIGFyZ3MgfSk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBSZWNvcmRpbmdMb2dTZXJ2aWNlIGV4dGVuZHMgTnVsbExvZ1NlcnZpY2Uge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkVycm9yID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25FcnJvciA9IHRoaXMuX29uRXJyb3IuZXZlbnQ7XG5cblx0b3ZlcnJpZGUgZXJyb3IoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25FcnJvci5maXJlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRXJyb3IuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBSZWNvcmRpbmdUZWxlbWV0cnlTZXJ2aWNlIGV4dGVuZHMgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB7XG5cdHJlYWRvbmx5IGV2ZW50czogeyBuYW1lOiBzdHJpbmc7IGRhdGE6IHVua25vd24gfVtdID0gW107XG5cblx0b3ZlcnJpZGUgcHVibGljTG9nMihldmVudE5hbWU/OiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKGV2ZW50TmFtZSkge1xuXHRcdFx0dGhpcy5ldmVudHMucHVzaCh7IG5hbWU6IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0XHR9XG5cdH1cbn1cblxuc3VpdGUoJ0NoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVOb3RpZmljYXRpb25TZXJ2aWNlKCk6IElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIHtcblx0XHRjb25zdCBkZXNjcmlwdG9yID0gZ2V0U2luZ2xldG9uU2VydmljZURlc2NyaXB0b3JzKCkuZmluZCgoW2lkXSkgPT4gaWQgPT09IElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlKT8uWzFdO1xuXHRcdGFzc2VydC5vayhkZXNjcmlwdG9yKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihkZXNjcmlwdG9yLmN0b3IsIGRlc2NyaXB0b3Iuc3RhdGljQXJndW1lbnRzKV1cblx0XHQpKSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGNoaWxkSW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRzdG9yZS5hZGQobm90aWZpY2F0aW9uU2VydmljZSBhcyBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSAmIElEaXNwb3NhYmxlKTtcblx0XHRyZXR1cm4gbm90aWZpY2F0aW9uU2VydmljZTtcblx0fVxuXG5cdHRlc3QoJ3JlYWN0aXZlbHkgYXBwbGllcyBzZXNzaW9uIHR5cGUgZmlsdGVyIHdoZW4gcGVuZGluZyBkZWxlZ2F0aW9uIHRhcmdldCBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uVHlwZSA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KCdjdXJyZW50U2Vzc2lvblR5cGUnLCBsb2NhbENoYXRTZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCwgeyBtb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZTogY3VycmVudFNlc3Npb25UeXBlIH0pKTtcblxuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0Tm90aWZpY2F0aW9uKHtcblx0XHRcdGlkOiAnbG9jYWwtb25seScsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6ICdMb2NhbCBvbmx5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb25zOiBbXSxcblx0XHRcdGRpc21pc3NpYmxlOiBmYWxzZSxcblx0XHRcdGF1dG9EaXNtaXNzT25NZXNzYWdlOiBmYWxzZSxcblx0XHRcdHNlc3Npb25UeXBlczogW2xvY2FsQ2hhdFNlc3Npb25UeXBlXSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24taGVhZGVyJyk/LnRleHRDb250ZW50LCAnTG9jYWwgb25seScpO1xuXG5cdFx0Y3VycmVudFNlc3Npb25UeXBlLnNldChTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24taGVhZGVyJyksIG51bGwpO1xuXG5cdFx0Y3VycmVudFNlc3Npb25UeXBlLnNldChsb2NhbENoYXRTZXNzaW9uVHlwZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWhlYWRlcicpPy50ZXh0Q29udGVudCwgJ0xvY2FsIG9ubHknKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyB2aXNpYmlsaXR5IGNoYW5nZXMgd2hlbiBhIG5vdGlmaWNhdGlvbiBpcyBzaG93biBhbmQgaGlkZGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uVHlwZSA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KCdjdXJyZW50U2Vzc2lvblR5cGUnLCBsb2NhbENoYXRTZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgdmlzaWJpbGl0eUNoYW5nZXM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBjcmVhdGVOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQsIHtcblx0XHRcdG1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiBjdXJyZW50U2Vzc2lvblR5cGUsXG5cdFx0XHRvbkRpZENoYW5nZVZpc2liaWxpdHk6IHZpc2libGUgPT4gdmlzaWJpbGl0eUNoYW5nZXMucHVzaCh2aXNpYmxlKSxcblx0XHR9KSk7XG5cblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnNldE5vdGlmaWNhdGlvbih7XG5cdFx0XHRpZDogJ2xvY2FsLW9ubHknLFxuXHRcdFx0c2V2ZXJpdHk6IENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiAnTG9jYWwgb25seScsXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRkaXNtaXNzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogZmFsc2UsXG5cdFx0XHRzZXNzaW9uVHlwZXM6IFtsb2NhbENoYXRTZXNzaW9uVHlwZV0sXG5cdFx0fSk7XG5cdFx0Y3VycmVudFNlc3Npb25UeXBlLnNldChTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aXNpYmlsaXR5Q2hhbmdlcywgW3RydWUsIGZhbHNlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWN0aXZlbHkgYXBwbGllcyBzZXNzaW9uIHJlc291cmNlIGZpbHRlciB3aGVuIHRoZSBzZXNzaW9uIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vYWdlbnQtaG9zdC1jb3BpbG90Y2xpL3Nlc3Npb24tMScpO1xuXHRcdGNvbnN0IHNlY29uZFNlc3Npb24gPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9hZ2VudC1ob3N0LWNvcGlsb3RjbGkvc2Vzc2lvbi0yJyk7XG5cdFx0Y29uc3QgY3VycmVudFNlc3Npb25UeXBlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oJ2N1cnJlbnRTZXNzaW9uVHlwZScsIFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPignY3VycmVudFNlc3Npb25SZXNvdXJjZScsIGZpcnN0U2Vzc2lvbik7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCwge1xuXHRcdFx0bW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGU6IGN1cnJlbnRTZXNzaW9uVHlwZSxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogY3VycmVudFNlc3Npb25SZXNvdXJjZSxcblx0XHR9KSk7XG5cblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnNldE5vdGlmaWNhdGlvbih7XG5cdFx0XHRpZDogJ2ZpcnN0LXNlc3Npb24tb25seScsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6ICdGaXJzdCBzZXNzaW9uIG9ubHknLFxuXHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0ZGlzbWlzc2libGU6IGZhbHNlLFxuXHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IGZhbHNlLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlczogW2ZpcnN0U2Vzc2lvbl0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWhlYWRlcicpPy50ZXh0Q29udGVudCwgJ0ZpcnN0IHNlc3Npb24gb25seScpO1xuXHRcdGN1cnJlbnRTZXNzaW9uUmVzb3VyY2Uuc2V0KHNlY29uZFNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWlucHV0LW5vdGlmaWNhdGlvbi1oZWFkZXInKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWN0aXZlbHkgZmlsdGVycyBub3RpZmljYXRpb25zIGRlZmVycmVkIGZvciBuZXcgdXNlcnMgd2l0aG91dCBoaWRpbmcgb3RoZXIgbm90aWZpY2F0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkID0gb2JzZXJ2YWJsZVZhbHVlKCdkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkJywgZmFsc2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBjcmVhdGVOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHdpZGdldCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQsIHsgZGVmZXJyZWROb3RpZmljYXRpb25zRW5hYmxlZCB9KSk7XG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5zZXROb3RpZmljYXRpb24oe1xuXHRcdFx0aWQ6ICdvcmRpbmFyeScsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6ICdPcmRpbmFyeSBub3RpZmljYXRpb24nLFxuXHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0ZGlzbWlzc2libGU6IGZhbHNlLFxuXHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0Tm90aWZpY2F0aW9uKHtcblx0XHRcdGlkOiAncHJvbW90aW9uJyxcblx0XHRcdHNldmVyaXR5OiBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogJ01vZGVsIHByb21vdGlvbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRkaXNtaXNzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogZmFsc2UsXG5cdFx0XHRkZWZlckZvck5ld1VzZXJzOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVuZGVyZWRUZXh0ID0gKCkgPT4gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWhlYWRlcicpPy50ZXh0Q29udGVudDtcblx0XHRjb25zdCBiZWZvcmUgPSByZW5kZXJlZFRleHQoKTtcblx0XHRkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGJlZm9yZSwgYWZ0ZXI6IHJlbmRlcmVkVGV4dCgpIH0sIHtcblx0XHRcdGJlZm9yZTogJ09yZGluYXJ5IG5vdGlmaWNhdGlvbicsXG5cdFx0XHRhZnRlcjogJ01vZGVsIHByb21vdGlvbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YW5kYXJkIHdvcmtiZW5jaCBkZWZlcnMgbm90aWZpY2F0aW9ucyBmb3IgdGhlIGZpcnN0IHNlc3Npb24gb25seScsICgpID0+IHtcblx0XHRjb25zdCBkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkID0gb2JzZXJ2YWJsZVZhbHVlKCdkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkJywgdHJ1ZSk7XG5cdFx0bGV0IGhhc1Nlc3Npb25zID0gZmFsc2U7XG5cdFx0Y29uc3QgaGFybmVzcyA9IHtcblx0XHRcdG9wdGlvbnM6IHt9LFxuXHRcdFx0ZW52aXJvbm1lbnRTZXJ2aWNlOiB7IGlzU2Vzc2lvbnNXaW5kb3c6IGZhbHNlIH0sXG5cdFx0XHRjaGF0U2VydmljZTogeyBoYXNTZXNzaW9uczogKCkgPT4gaGFzU2Vzc2lvbnMgfSxcblx0XHRcdF9kZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkOiBkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkLFxuXHRcdFx0X2lzRmlyc3RXb3JrYmVuY2hTZXNzaW9uOiB1bmRlZmluZWQgYXMgYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IHVwZGF0ZSA9IFJlZmxlY3QuZ2V0KENoYXRJbnB1dFBhcnQucHJvdG90eXBlLCAndXBkYXRlRGVmZXJyZWROb3RpZmljYXRpb25zRWxpZ2liaWxpdHknKSBhcyAoXG5cdFx0XHR0aGlzOiB0eXBlb2YgaGFybmVzcyxcblx0XHRcdGV2ZW50PzogeyBwcmV2aW91c1Nlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkOyBjdXJyZW50U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQgfSxcblx0XHQpID0+IHZvaWQ7XG5cdFx0Y29uc3QgdW50aXRsZWQgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovdW50aXRsZWQtMScpO1xuXHRcdGNvbnN0IG1hdGVyaWFsaXplZCA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9zZXNzaW9uLTEnKTtcblx0XHRjb25zdCBzZWNvbmQgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovc2Vzc2lvbi0yJyk7XG5cblx0XHR1cGRhdGUuY2FsbChoYXJuZXNzKTtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkLmdldCgpO1xuXHRcdGhhc1Nlc3Npb25zID0gdHJ1ZTtcblx0XHR1cGRhdGUuY2FsbChoYXJuZXNzLCB7IHByZXZpb3VzU2Vzc2lvblJlc291cmNlOiB1bnRpdGxlZCwgY3VycmVudFNlc3Npb25SZXNvdXJjZTogbWF0ZXJpYWxpemVkIH0pO1xuXHRcdGNvbnN0IG1hdGVyaWFsaXplZEZpcnN0U2Vzc2lvbiA9IGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQuZ2V0KCk7XG5cdFx0dXBkYXRlLmNhbGwoaGFybmVzcywgeyBwcmV2aW91c1Nlc3Npb25SZXNvdXJjZTogbWF0ZXJpYWxpemVkLCBjdXJyZW50U2Vzc2lvblJlc291cmNlOiBzZWNvbmQgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0U2Vzc2lvbixcblx0XHRcdG1hdGVyaWFsaXplZEZpcnN0U2Vzc2lvbixcblx0XHRcdHNlY29uZFNlc3Npb246IGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3RTZXNzaW9uOiBmYWxzZSxcblx0XHRcdG1hdGVyaWFsaXplZEZpcnN0U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRzZWNvbmRTZXNzaW9uOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZ2VudHMgd2luZG93IGJ5cGFzc2VzIHRoZSB3b3JrYmVuY2ggZmlyc3Qtc2Vzc2lvbiBnYXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQgPSBvYnNlcnZhYmxlVmFsdWUoJ2RlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQnLCBmYWxzZSk7XG5cdFx0Y29uc3QgaGFybmVzcyA9IHtcblx0XHRcdG9wdGlvbnM6IHt9LFxuXHRcdFx0ZW52aXJvbm1lbnRTZXJ2aWNlOiB7IGlzU2Vzc2lvbnNXaW5kb3c6IHRydWUgfSxcblx0XHRcdGNoYXRTZXJ2aWNlOiB7IGhhc1Nlc3Npb25zOiAoKSA9PiBmYWxzZSB9LFxuXHRcdFx0X2RlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQ6IGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQsXG5cdFx0XHRfaXNGaXJzdFdvcmtiZW5jaFNlc3Npb246IHVuZGVmaW5lZCBhcyBib29sZWFuIHwgdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgdXBkYXRlID0gUmVmbGVjdC5nZXQoQ2hhdElucHV0UGFydC5wcm90b3R5cGUsICd1cGRhdGVEZWZlcnJlZE5vdGlmaWNhdGlvbnNFbGlnaWJpbGl0eScpIGFzIChcblx0XHRcdHRoaXM6IHR5cGVvZiBoYXJuZXNzLFxuXHRcdFx0ZXZlbnQ/OiB7IHByZXZpb3VzU2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7IGN1cnJlbnRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCB9LFxuXHRcdCkgPT4gdm9pZDtcblxuXHRcdHVwZGF0ZS5jYWxsKGhhcm5lc3MpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQuZ2V0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aWRnZXQgb3B0aW9uIGRpc2FibGVzIGRlZmVycmVkIG5vdGlmaWNhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGVmZXJyZWROb3RpZmljYXRpb25zRW5hYmxlZCA9IG9ic2VydmFibGVWYWx1ZSgnZGVmZXJyZWROb3RpZmljYXRpb25zRW5hYmxlZCcsIHRydWUpO1xuXHRcdGNvbnN0IGhhcm5lc3MgPSB7XG5cdFx0XHRvcHRpb25zOiB7IGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRlbnZpcm9ubWVudFNlcnZpY2U6IHsgaXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSB9LFxuXHRcdFx0Y2hhdFNlcnZpY2U6IHsgaGFzU2Vzc2lvbnM6ICgpID0+IHRydWUgfSxcblx0XHRcdF9kZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkOiBkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkLFxuXHRcdFx0X2lzRmlyc3RXb3JrYmVuY2hTZXNzaW9uOiB1bmRlZmluZWQgYXMgYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IHVwZGF0ZSA9IFJlZmxlY3QuZ2V0KENoYXRJbnB1dFBhcnQucHJvdG90eXBlLCAndXBkYXRlRGVmZXJyZWROb3RpZmljYXRpb25zRWxpZ2liaWxpdHknKSBhcyAoXG5cdFx0XHR0aGlzOiB0eXBlb2YgaGFybmVzcyxcblx0XHRcdGV2ZW50PzogeyBwcmV2aW91c1Nlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkOyBjdXJyZW50U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQgfSxcblx0XHQpID0+IHZvaWQ7XG5cblx0XHR1cGRhdGUuY2FsbChoYXJuZXNzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgbWFya2Rvd24gZGVzY3JpcHRpb25zIGFzIHJpY2ggY29udGVudCcsICgpID0+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gY3JlYXRlTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgbmV3IFRlc3RDb21tYW5kU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRjb25zdCB3aWRnZXQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LCB1bmRlZmluZWQpKTtcblxuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0Tm90aWZpY2F0aW9uKHtcblx0XHRcdGlkOiAnbWFya2Rvd24tZGVzY3JpcHRpb24nLFxuXHRcdFx0c2V2ZXJpdHk6IENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiAnQ2FjaGUgaXMgc3RhbGUnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5ldyBNYXJrZG93blN0cmluZygnQ29uc2lkZXIgYSBuZXcgY2hhdC4gW0xlYXJuIG1vcmVdKGh0dHBzOi8vYWthLm1zL2xlYXJuKScpLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRkaXNtaXNzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWlucHV0LW5vdGlmaWNhdGlvbi1kZXNjcmlwdGlvbicpO1xuXHRcdGNvbnN0IGxpbmsgPSBkZXNjcmlwdGlvbj8ucXVlcnlTZWxlY3RvcignYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGV4dDogZGVzY3JpcHRpb24/LnRleHRDb250ZW50LFxuXHRcdFx0bWFya2Rvd246ICEhZGVzY3JpcHRpb24/LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWlucHV0LW5vdGlmaWNhdGlvbi1kZXNjcmlwdGlvbi1tYXJrZG93bicpLFxuXHRcdFx0bGlua1RleHQ6IGxpbms/LnRleHRDb250ZW50LFxuXHRcdFx0bGlua0hyZWY6IGxpbms/LmdldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJykgPz8gbGluaz8uZ2V0QXR0cmlidXRlKCdocmVmJyksXG5cdFx0fSwge1xuXHRcdFx0dGV4dDogJ0NvbnNpZGVyIGEgbmV3IGNoYXQuIExlYXJuIG1vcmUnLFxuXHRcdFx0bWFya2Rvd246IHRydWUsXG5cdFx0XHRsaW5rVGV4dDogJ0xlYXJuIG1vcmUnLFxuXHRcdFx0bGlua0hyZWY6ICdodHRwczovL2FrYS5tcy9sZWFybicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG8tZGlzbWlzcyBvbiBtZXNzYWdlIG9ubHkgYXBwbGllcyB0byB0aGUgc2VuZGluZyBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2FnZW50LWhvc3QtY29waWxvdGNsaS9zZXNzaW9uLTEnKTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vYWdlbnQtaG9zdC1jb3BpbG90Y2xpL3Nlc3Npb24tMicpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBjcmVhdGVOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cblx0XHRmb3IgKGNvbnN0IFtpZCwgc2Vzc2lvblJlc291cmNlXSBvZiBbWydmaXJzdCcsIGZpcnN0U2Vzc2lvbl0sIFsnc2Vjb25kJywgc2Vjb25kU2Vzc2lvbl1dIGFzIGNvbnN0KSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnNldE5vdGlmaWNhdGlvbih7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZTogJ0NhY2hlIGlzIHN0YWxlJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRcdGRpc21pc3NpYmxlOiB0cnVlLFxuXHRcdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogdHJ1ZSxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlczogW3Nlc3Npb25SZXNvdXJjZV0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmhhbmRsZU1lc3NhZ2VTZW50KHsgc2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsIHNlc3Npb25SZXNvdXJjZTogZmlyc3RTZXNzaW9uIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbkZpcnN0U2Vzc2lvbjogbm90aWZpY2F0aW9uU2VydmljZS5nZXRBY3RpdmVOb3RpZmljYXRpb24obiA9PiBuLmlkID09PSAnZmlyc3QnKT8uaWQsXG5cdFx0XHRpblNlY29uZFNlc3Npb246IG5vdGlmaWNhdGlvblNlcnZpY2UuZ2V0QWN0aXZlTm90aWZpY2F0aW9uKG4gPT4gbi5pZCA9PT0gJ3NlY29uZCcpPy5pZCxcblx0XHR9LCB7XG5cdFx0XHRpbkZpcnN0U2Vzc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0aW5TZWNvbmRTZXNzaW9uOiAnc2Vjb25kJyxcblx0XHR9KTtcblx0fSk7XG5cblx0LyoqXG5cdCAqIEEgbm90aWZpY2F0aW9uIHNlcnZpY2UgbW9jayB0aGF0IHJlY29yZHMgdGhlIG5vdGlmaWNhdGlvbnMgZm9yd2FyZGVkIHRvXG5cdCAqIHtAbGluayBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5hbm5vdW5jZVJlbmRlcmVkfSBhbmQgYXBwbGllcyB0aGVcblx0ICogYGdldEFjdGl2ZU5vdGlmaWNhdGlvbmAgZmlsdGVyLCBzbyB0ZXN0cyBjYW4gb2JzZXJ2ZSBleGFjdGx5IHdoYXQgYSBjaGF0XG5cdCAqIGlucHV0IHdvdWxkIHJlbmRlciBhbmQgYW5ub3VuY2UgZm9yIGl0cyBzZXNzaW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gY3JlYXRlUmVjb3JkaW5nTm90aWZpY2F0aW9uU2VydmljZSgpIHtcblx0XHRjb25zdCBub3RpZmljYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0SW5wdXROb3RpZmljYXRpb24+KCk7XG5cdFx0Y29uc3QgYW5ub3VuY2VkOiAoSUNoYXRJbnB1dE5vdGlmaWNhdGlvbiB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdGNvbnN0IGRpc21pc3NlZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBvbkRpZENoYW5nZSA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBvbkRpZERpc21pc3MgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBzZXJ2aWNlOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZS5ldmVudCxcblx0XHRcdG9uRGlkRGlzbWlzczogb25EaWREaXNtaXNzLmV2ZW50LFxuXHRcdFx0c2V0Tm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbikgeyBub3RpZmljYXRpb25zLnNldChub3RpZmljYXRpb24uaWQsIG5vdGlmaWNhdGlvbik7IG9uRGlkQ2hhbmdlLmZpcmUoKTsgfSxcblx0XHRcdGRlbGV0ZU5vdGlmaWNhdGlvbihpZCkgeyBpZiAobm90aWZpY2F0aW9ucy5kZWxldGUoaWQpKSB7IG9uRGlkQ2hhbmdlLmZpcmUoKTsgfSB9LFxuXHRcdFx0ZGlzbWlzc05vdGlmaWNhdGlvbihpZCkgeyBkaXNtaXNzZWQucHVzaChpZCk7IG9uRGlkRGlzbWlzcy5maXJlKGlkKTsgfSxcblx0XHRcdGdldEFjdGl2ZU5vdGlmaWNhdGlvbihmaWx0ZXIpIHtcblx0XHRcdFx0bGV0IGFjdGl2ZTogSUNoYXRJbnB1dE5vdGlmaWNhdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Zm9yIChjb25zdCBub3RpZmljYXRpb24gb2Ygbm90aWZpY2F0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdGlmIChmaWx0ZXIgJiYgIWZpbHRlcihub3RpZmljYXRpb24pKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YWN0aXZlID0gbm90aWZpY2F0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhY3RpdmU7XG5cdFx0XHR9LFxuXHRcdFx0aGFuZGxlTWVzc2FnZVNlbnQoKSB7IH0sXG5cdFx0XHRhbm5vdW5jZVJlbmRlcmVkKG5vdGlmaWNhdGlvbikgeyBhbm5vdW5jZWQucHVzaChub3RpZmljYXRpb24pOyB9LFxuXHRcdH07XG5cdFx0cmV0dXJuIHsgc2VydmljZSwgYW5ub3VuY2VkLCBkaXNtaXNzZWQsIHNldDogKG5vdGlmaWNhdGlvbjogSUNoYXRJbnB1dE5vdGlmaWNhdGlvbikgPT4gc2VydmljZS5zZXROb3RpZmljYXRpb24obm90aWZpY2F0aW9uKSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlV2lkZ2V0KG9wdGlvbnM6IHtcblx0XHRkZWxlZ2F0ZT86IElDaGF0SW5wdXROb3RpZmljYXRpb25EZWxlZ2F0ZTtcblx0XHRjb21tYW5kU2VydmljZT86IElDb21tYW5kU2VydmljZTtcblx0XHR0ZWxlbWV0cnlTZXJ2aWNlPzogSVRlbGVtZXRyeVNlcnZpY2U7XG5cdFx0bG9nU2VydmljZT86IElMb2dTZXJ2aWNlO1xuXHR9ID0ge30pIHtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gY3JlYXRlUmVjb3JkaW5nTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLnNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCBvcHRpb25zLmNvbW1hbmRTZXJ2aWNlID8/IG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgb3B0aW9ucy50ZWxlbWV0cnlTZXJ2aWNlID8/IE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRpZiAob3B0aW9ucy5sb2dTZXJ2aWNlKSB7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBvcHRpb25zLmxvZ1NlcnZpY2UpO1xuXHRcdH1cblx0XHRjb25zdCB3aWRnZXQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LCBvcHRpb25zLmRlbGVnYXRlKSk7XG5cdFx0cmV0dXJuIHsgbm90aWZpY2F0aW9uU2VydmljZSwgd2lkZ2V0IH07XG5cdH1cblxuXHRmdW5jdGlvbiBjbGlja0FjdGlvbih3aWRnZXQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tYWN0aW9uLWJ1dHRvbicpO1xuXHRcdGFzc2VydC5vayhidXR0b24pO1xuXHRcdGJ1dHRvbi5jbGljaygpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2hvd05vdGlmaWNhdGlvbihcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlOiBSZXR1cm5UeXBlPHR5cGVvZiBjcmVhdGVSZWNvcmRpbmdOb3RpZmljYXRpb25TZXJ2aWNlPixcblx0XHRub3RpZmljYXRpb246IFBpY2s8SUNoYXRJbnB1dE5vdGlmaWNhdGlvbiwgJ2lkJyB8ICdtZXNzYWdlJyB8ICdhY3Rpb25zJz4gJiBQYXJ0aWFsPElDaGF0SW5wdXROb3RpZmljYXRpb24+LFxuXHQpOiB2b2lkIHtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnNldCh7XG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRkaXNtaXNzaWJsZTogdHJ1ZSxcblx0XHRcdGF1dG9EaXNtaXNzT25NZXNzYWdlOiBmYWxzZSxcblx0XHRcdC4uLm5vdGlmaWNhdGlvbixcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ2FjdGlvbiBjb21tYW5kcyBleGVjdXRlIHdpdGggcHJvdmlkZWQgYXJncycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IG5vdGlmaWNhdGlvblNlcnZpY2UsIHdpZGdldCB9ID0gY3JlYXRlV2lkZ2V0KHsgY29tbWFuZFNlcnZpY2UgfSk7XG5cdFx0c2hvd05vdGlmaWNhdGlvbihub3RpZmljYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ3Byb21vJyxcblx0XHRcdG1lc3NhZ2U6ICdQcm9tbycsXG5cdFx0XHRhY3Rpb25zOiBbeyBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLkNvbW1hbmQsIGxhYmVsOiAnVXNlJywgY29tbWFuZElkOiAndGVzdC51c2VQcm9tbycsIGNvbW1hbmRBcmdzOiBbeyBtb2RlbElkZW50aWZpZXI6ICdtJyB9XSB9XSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpZERpc21pc3MgPSBFdmVudC50b1Byb21pc2Uobm90aWZpY2F0aW9uU2VydmljZS5zZXJ2aWNlLm9uRGlkRGlzbWlzcyk7XG5cdFx0Y2xpY2tBY3Rpb24od2lkZ2V0KTtcblx0XHRhd2FpdCBkaWREaXNtaXNzO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21tYW5kU2VydmljZS5leGVjdXRlZCwgW3sgaWQ6ICd0ZXN0LnVzZVByb21vJywgYXJnczogW3sgbW9kZWxJZGVudGlmaWVyOiAnbScgfV0gfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25TZXJ2aWNlLmRpc21pc3NlZC5qb2luKCcsJyksICdwcm9tbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3Rpb25zIHdpdGhvdXQgZXhwbGljaXQgY29tbWFuZEFyZ3MgYXJlIGV4ZWN1dGVkIHdpdGggZW1wdHkgYXJncycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IG5vdGlmaWNhdGlvblNlcnZpY2UsIHdpZGdldCB9ID0gY3JlYXRlV2lkZ2V0KHsgY29tbWFuZFNlcnZpY2UgfSk7XG5cdFx0c2hvd05vdGlmaWNhdGlvbihub3RpZmljYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ2luZm8nLFxuXHRcdFx0bWVzc2FnZTogJ0luZm8nLFxuXHRcdFx0YWN0aW9uczogW3sga2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Db21tYW5kLCBsYWJlbDogJ1VwZ3JhZGUnLCBjb21tYW5kSWQ6ICd0ZXN0LnVwZ3JhZGUnIH1dLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlkRGlzbWlzcyA9IEV2ZW50LnRvUHJvbWlzZShub3RpZmljYXRpb25TZXJ2aWNlLnNlcnZpY2Uub25EaWREaXNtaXNzKTtcblx0XHRjbGlja0FjdGlvbih3aWRnZXQpO1xuXHRcdGF3YWl0IGRpZERpc21pc3M7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVkLCBbeyBpZDogJ3Rlc3QudXBncmFkZScsIGFyZ3M6IFtdIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uU2VydmljZS5kaXNtaXNzZWQuam9pbignLCcpLCAnaW5mbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwLW9wZW4gYWN0aW9ucyBleGVjdXRlIHdpdGhvdXQgZGlzbWlzc2luZyB0aGUgbm90aWZpY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gbmV3IFRlc3RDb21tYW5kU2VydmljZSgpO1xuXHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBjcmVhdGVXaWRnZXQoeyBjb21tYW5kU2VydmljZSB9KTtcblx0XHRzaG93Tm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvblNlcnZpY2UsIHtcblx0XHRcdGlkOiAnc2V0dXAnLFxuXHRcdFx0bWVzc2FnZTogJ1NldHVwJyxcblx0XHRcdGFjdGlvbnM6IFt7IGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZCwgbGFiZWw6ICdTaWduIEluJywgY29tbWFuZElkOiAndGVzdC5zaWduSW4nLCBrZWVwT3BlbjogdHJ1ZSB9XSxcblx0XHR9KTtcblxuXHRcdGNsaWNrQWN0aW9uKHdpZGdldCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGV4ZWN1dGVkOiBjb21tYW5kU2VydmljZS5leGVjdXRlZCxcblx0XHRcdGRpc21pc3NlZDogbm90aWZpY2F0aW9uU2VydmljZS5kaXNtaXNzZWQsXG5cdFx0fSwge1xuXHRcdFx0ZXhlY3V0ZWQ6IFt7IGlkOiAndGVzdC5zaWduSW4nLCBhcmdzOiBbXSB9XSxcblx0XHRcdGRpc21pc3NlZDogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhdGNoZXMgcmVqZWN0ZWQgY29tbWFuZCBhY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFJlY29yZGluZ0xvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0Q29tbWFuZFNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgZXhlY3V0ZUNvbW1hbmQoaWQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRcdFx0YXdhaXQgc3VwZXIuZXhlY3V0ZUNvbW1hbmQoaWQsIC4uLmFyZ3MpO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NvbW1hbmQgZmFpbGVkJyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBjcmVhdGVXaWRnZXQoeyBjb21tYW5kU2VydmljZSwgbG9nU2VydmljZSB9KTtcblx0XHRzaG93Tm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvblNlcnZpY2UsIHtcblx0XHRcdGlkOiAncmVqZWN0ZWQtY29tbWFuZCcsXG5cdFx0XHRtZXNzYWdlOiAnUmVqZWN0ZWQgY29tbWFuZCcsXG5cdFx0XHRhY3Rpb25zOiBbeyBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLkNvbW1hbmQsIGxhYmVsOiAnUnVuJywgY29tbWFuZElkOiAndGVzdC5yZWplY3QnIH1dLFxuXHRcdFx0ZGlzbWlzc2libGU6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlkTG9nRXJyb3IgPSBFdmVudC50b1Byb21pc2UobG9nU2VydmljZS5vbkVycm9yKTtcblx0XHRjbGlja0FjdGlvbih3aWRnZXQpO1xuXHRcdGF3YWl0IGRpZExvZ0Vycm9yO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21tYW5kU2VydmljZS5leGVjdXRlZCwgW3sgaWQ6ICd0ZXN0LnJlamVjdCcsIGFyZ3M6IFtdIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc3dpdGNoLXRvLW1vZGVsIGFjdGlvbnMgdXNlIHRoZSByZW5kZXJpbmcgaW5wdXQgZGVsZWdhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBSZWNvcmRpbmdUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3dpdGNoZWRNb2RlbHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IHBpY2tlck9wZW5Db3VudCA9IDA7XG5cdFx0Y29uc3QgeyBub3RpZmljYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IGNyZWF0ZVdpZGdldCh7XG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0ZGVsZWdhdGU6IHtcblx0XHRcdFx0c3dpdGNoVG9Nb2RlbDogbW9kZWxJZGVudGlmaWVyID0+IHtcblx0XHRcdFx0XHRzd2l0Y2hlZE1vZGVscy5wdXNoKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9wZW5Nb2RlbFBpY2tlcjogKCkgPT4gcGlja2VyT3BlbkNvdW50KyssXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0c2hvd05vdGlmaWNhdGlvbihub3RpZmljYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ3Byb21vJyxcblx0XHRcdG1lc3NhZ2U6ICdQcm9tbycsXG5cdFx0XHRhY3Rpb25zOiBbeyBsYWJlbDogJ1RyeSBNb2RlbCcsIGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuU3dpdGNoVG9Nb2RlbCwgbW9kZWxJZGVudGlmaWVyOiAndmVuZG9yL21vZGVsJyB9XSxcblx0XHR9KTtcblxuXHRcdGNsaWNrQWN0aW9uKHdpZGdldCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN3aXRjaGVkTW9kZWxzLFxuXHRcdFx0cGlja2VyT3BlbkNvdW50LFxuXHRcdFx0YWN0aW9uRXZlbnRzOiB0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cy5maWx0ZXIoZXZlbnQgPT4gZXZlbnQubmFtZSA9PT0gJ2NoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbicpLm1hcChldmVudCA9PiBldmVudC5kYXRhKSxcblx0XHR9LCB7XG5cdFx0XHRzd2l0Y2hlZE1vZGVsczogWyd2ZW5kb3IvbW9kZWwnXSxcblx0XHRcdHBpY2tlck9wZW5Db3VudDogMCxcblx0XHRcdGFjdGlvbkV2ZW50czogW3sgaWQ6ICdwcm9tbycsIHRlbGVtZXRyeUlkOiB1bmRlZmluZWQsIGFjdGlvbktpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuU3dpdGNoVG9Nb2RlbCB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbnMgdGhlIGxvY2FsIG1vZGVsIHBpY2tlciB3aGVuIHRoZSByZXF1ZXN0ZWQgbW9kZWwgaXMgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHBpY2tlck9wZW5Db3VudCA9IDA7XG5cdFx0Y29uc3QgeyBub3RpZmljYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IGNyZWF0ZVdpZGdldCh7XG5cdFx0XHRkZWxlZ2F0ZToge1xuXHRcdFx0XHRzd2l0Y2hUb01vZGVsOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0b3Blbk1vZGVsUGlja2VyOiAoKSA9PiBwaWNrZXJPcGVuQ291bnQrKyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRzaG93Tm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvblNlcnZpY2UsIHtcblx0XHRcdGlkOiAncHJvbW8nLFxuXHRcdFx0bWVzc2FnZTogJ1Byb21vJyxcblx0XHRcdGFjdGlvbnM6IFt7IGxhYmVsOiAnVHJ5IE1vZGVsJywga2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Td2l0Y2hUb01vZGVsLCBtb2RlbElkZW50aWZpZXI6ICdtaXNzaW5nL21vZGVsJyB9XSxcblx0XHR9KTtcblxuXHRcdGNsaWNrQWN0aW9uKHdpZGdldCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyT3BlbkNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbnMgdGhlIGxvY2FsIG1vZGVsIHBpY2tlciB3aGVuIGRpcmVjdCBzZWxlY3Rpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHBpY2tlck9wZW5Db3VudCA9IDA7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IHN0b3JlLmFkZChuZXcgUmVjb3JkaW5nTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCB7IG5vdGlmaWNhdGlvblNlcnZpY2UsIHdpZGdldCB9ID0gY3JlYXRlV2lkZ2V0KHtcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRkZWxlZ2F0ZToge1xuXHRcdFx0XHRzd2l0Y2hUb01vZGVsOiAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignc2VsZWN0aW9uIGZhaWxlZCcpOyB9LFxuXHRcdFx0XHRvcGVuTW9kZWxQaWNrZXI6ICgpID0+IHBpY2tlck9wZW5Db3VudCsrLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHNob3dOb3RpZmljYXRpb24obm90aWZpY2F0aW9uU2VydmljZSwge1xuXHRcdFx0aWQ6ICdwcm9tbycsXG5cdFx0XHRtZXNzYWdlOiAnUHJvbW8nLFxuXHRcdFx0YWN0aW9uczogW3sgbGFiZWw6ICdUcnkgTW9kZWwnLCBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLlN3aXRjaFRvTW9kZWwsIG1vZGVsSWRlbnRpZmllcjogJ3ZlbmRvci9tb2RlbCcgfV0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaWRMb2dFcnJvciA9IEV2ZW50LnRvUHJvbWlzZShsb2dTZXJ2aWNlLm9uRXJyb3IpO1xuXHRcdGNsaWNrQWN0aW9uKHdpZGdldCk7XG5cdFx0YXdhaXQgZGlkTG9nRXJyb3I7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyT3BlbkNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnYXR0ZW1wdHMgdGhlIG1vZGVsIHBpY2tlciBmYWxsYmFjayBvbmx5IG9uY2Ugd2hlbiBpdCBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBSZWNvcmRpbmdMb2dTZXJ2aWNlKCkpO1xuXHRcdGxldCBwaWNrZXJPcGVuQ291bnQgPSAwO1xuXHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBjcmVhdGVXaWRnZXQoe1xuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdGRlbGVnYXRlOiB7XG5cdFx0XHRcdHN3aXRjaFRvTW9kZWw6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRvcGVuTW9kZWxQaWNrZXI6ICgpID0+IHtcblx0XHRcdFx0XHRwaWNrZXJPcGVuQ291bnQrKztcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3BpY2tlciBmYWlsZWQnKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0c2hvd05vdGlmaWNhdGlvbihub3RpZmljYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ3Byb21vJyxcblx0XHRcdG1lc3NhZ2U6ICdQcm9tbycsXG5cdFx0XHRhY3Rpb25zOiBbeyBsYWJlbDogJ1RyeSBNb2RlbCcsIGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuU3dpdGNoVG9Nb2RlbCwgbW9kZWxJZGVudGlmaWVyOiAnbWlzc2luZy9tb2RlbCcgfV0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaWRMb2dFcnJvciA9IEV2ZW50LnRvUHJvbWlzZShsb2dTZXJ2aWNlLm9uRXJyb3IpO1xuXHRcdGNsaWNrQWN0aW9uKHdpZGdldCk7XG5cdFx0YXdhaXQgZGlkTG9nRXJyb3I7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyT3BlbkNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVuZGVyIHNlbWFudGljIGFjdGlvbnMgdW5zdXBwb3J0ZWQgYnkgdGhlIGlucHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBjcmVhdGVXaWRnZXQoKTtcblxuXHRcdHNob3dOb3RpZmljYXRpb24obm90aWZpY2F0aW9uU2VydmljZSwge1xuXHRcdFx0aWQ6ICdwcm9tbycsXG5cdFx0XHRtZXNzYWdlOiAnUHJvbW8nLFxuXHRcdFx0YWN0aW9uczogW3sgbGFiZWw6ICdUcnkgTW9kZWwnLCBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLlN3aXRjaFRvTW9kZWwsIG1vZGVsSWRlbnRpZmllcjogJ3ZlbmRvci9tb2RlbCcgfV0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWFjdGlvbi1idXR0b24nKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgQWdlbnQgSG9zdCBub3RpZmljYXRpb25zIGFnYWluc3QgdGhlIHJlc291cmNlIHNjaGVtZScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIHBhdGg6ICcvdW50aXRsZWQtc2Vzc2lvbicgfSk7XG5cdFx0Y29uc3QgeyBub3RpZmljYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IGNyZWF0ZVdpZGdldCh7XG5cdFx0XHRkZWxlZ2F0ZTogeyBtb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZTogY29uc3RPYnNlcnZhYmxlKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKSB9LFxuXHRcdH0pO1xuXG5cdFx0c2hvd05vdGlmaWNhdGlvbihub3RpZmljYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ2FnZW50LWhvc3QtcHJvbW8nLFxuXHRcdFx0bWVzc2FnZTogJ0FnZW50IEhvc3QgcHJvbW8nLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRzZXNzaW9uVHlwZXM6IFsnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJ10sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWhlYWRlcicpPy50ZXh0Q29udGVudCwgJ0FnZW50IEhvc3QgcHJvbW8nKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBhIG5vdGlmaWNhdGlvbiBzY29wZWQgdG8gYm90aCBDb3BpbG90IG1vZGVsIHRhcmdldHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY3VycmVudFNlc3Npb25UeXBlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oJ2N1cnJlbnRTZXNzaW9uVHlwZScsIFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBjcmVhdGVXaWRnZXQoe1xuXHRcdFx0ZGVsZWdhdGU6IHsgbW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGU6IGN1cnJlbnRTZXNzaW9uVHlwZSB9LFxuXHRcdH0pO1xuXG5cdFx0c2hvd05vdGlmaWNhdGlvbihub3RpZmljYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ2NvcGlsb3QtbW9kZWwtc2V0dXAnLFxuXHRcdFx0bWVzc2FnZTogJ0Nob29zZSBob3cgeW91IHdhbnQgdG8gdXNlIENvcGlsb3QuJyxcblx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBbU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgU2Vzc2lvblR5cGUuQ29waWxvdENMSV0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgdGV4dCA9ICgpID0+IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWlucHV0LW5vdGlmaWNhdGlvbi1oZWFkZXInKT8udGV4dENvbnRlbnQ7XG5cdFx0Y29uc3QgYWdlbnRIb3N0VGV4dCA9IHRleHQoKTtcblx0XHRjdXJyZW50U2Vzc2lvblR5cGUuc2V0KFNlc3Npb25UeXBlLkNvcGlsb3RDTEksIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgY29waWxvdENsaVRleHQgPSB0ZXh0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFnZW50SG9zdFRleHQsXG5cdFx0XHRjb3BpbG90Q2xpVGV4dCxcblx0XHR9LCB7XG5cdFx0XHRhZ2VudEhvc3RUZXh0OiAnQ2hvb3NlIGhvdyB5b3Ugd2FudCB0byB1c2UgQ29waWxvdC4nLFxuXHRcdFx0Y29waWxvdENsaVRleHQ6ICdDaG9vc2UgaG93IHlvdSB3YW50IHRvIHVzZSBDb3BpbG90LicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fubm91bmNlcyBvbmx5IHRoZSBub3RpZmljYXRpb24gcmVuZGVyZWQgaW4gdGhlIGN1cnJlbnQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblR5cGUgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignY3VycmVudFNlc3Npb25UeXBlJywgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBjcmVhdGVSZWNvcmRpbmdOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZS5zZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgbmV3IFRlc3RDb21tYW5kU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LCB7IG1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiBjdXJyZW50U2Vzc2lvblR5cGUgfSkpO1xuXHRcdGNvbnN0IGxhc3RBbm5vdW5jZWQgPSAoKSA9PiBub3RpZmljYXRpb25TZXJ2aWNlLmFubm91bmNlZFtub3RpZmljYXRpb25TZXJ2aWNlLmFubm91bmNlZC5sZW5ndGggLSAxXTtcblxuXHRcdC8vIEEgcHJvbW8gc2NvcGVkIHRvIHRoZSBDb3BpbG90IGhhcm5lc3MgbXVzdCBub3QgYmUgYW5ub3VuY2VkIHdoaWxlIHRoZVxuXHRcdC8vIGlucHV0IGlzIGluIHRoZSBsb2NhbCBzZXNzaW9uLlxuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0KHtcblx0XHRcdGlkOiAnY29waWxvdC1wcm9tbycsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6ICdDb3BpbG90IHByb21vJyxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb25zOiBbXSxcblx0XHRcdGRpc21pc3NpYmxlOiB0cnVlLFxuXHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IGZhbHNlLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBbU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdF0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RBbm5vdW5jZWQoKSwgdW5kZWZpbmVkLCAnbm90aGluZyBzaG91bGQgYmUgYW5ub3VuY2VkIGluIGEgbm9uLW1hdGNoaW5nIHNlc3Npb24nKTtcblxuXHRcdGN1cnJlbnRTZXNzaW9uVHlwZS5zZXQoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEFubm91bmNlZCgpPy5pZCwgJ2NvcGlsb3QtcHJvbW8nLCAndGhlIHByb21vIHNob3VsZCBiZSBhbm5vdW5jZWQgb25jZSBpdHMgc2Vzc2lvbiBpcyBhY3RpdmUnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUUvQixTQUFTLGlCQUFpQix1QkFBdUI7QUFDakQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQXdCLHVCQUF1QjtBQUMvQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCLGlDQUFpQztBQUNoRSxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGlDQUFpQywrQkFBdUQscUNBQXFDO0FBQ3RJLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUNBQW1FO0FBQzVFLFNBQVMsc0JBQXNCLG1CQUFtQjtBQUNsRCxTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLG1CQUE4QztBQUFBLEVBQXBEO0FBR0MsU0FBUyx1QkFBNkMsTUFBTTtBQUM1RCxTQUFTLHNCQUE0QyxNQUFNO0FBRTNELFNBQVMsV0FBeUUsQ0FBQztBQUFBO0FBQUEsRUFFbkYsTUFBTSxlQUFlLE9BQWUsTUFBcUM7QUFDeEUsU0FBSyxTQUFTLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQztBQUMvQixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsTUFBTSw0QkFBNEIsZUFBZTtBQUFBLEVBQWpEO0FBQUE7QUFDQyxTQUFpQixXQUFXLElBQUksUUFBYztBQUM5QyxTQUFTLFVBQVUsS0FBSyxTQUFTO0FBQUE7QUFBQSxFQUV4QixRQUFjO0FBQ3RCLFNBQUssU0FBUyxLQUFLO0FBQUEsRUFDcEI7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFNBQUssU0FBUyxRQUFRO0FBQ3RCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQUVBLE1BQU0sa0NBQWtDLDBCQUEwQjtBQUFBLEVBQWxFO0FBQUE7QUFDQyxTQUFTLFNBQTRDLENBQUM7QUFBQTtBQUFBLEVBRTdDLFdBQVcsV0FBb0IsTUFBc0I7QUFDN0QsUUFBSSxXQUFXO0FBQ2QsV0FBSyxPQUFPLEtBQUssRUFBRSxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLCtCQUErQixNQUFNO0FBQzFDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsV0FBUyw0QkFBMkQ7QUFDbkUsVUFBTSxhQUFhLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDLEVBQUUsTUFBTSxPQUFPLDZCQUE2QixJQUFJLENBQUM7QUFDNUcsV0FBTyxHQUFHLFVBQVU7QUFDcEIsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLDhCQUE4QixRQUFXLEtBQUssQ0FBQztBQUN0Rix5QkFBcUIsS0FBSyxpQkFBaUIsSUFBSSxtQkFBbUIsQ0FBQztBQUNuRSx5QkFBcUIsS0FBSyxtQkFBbUIsb0JBQW9CO0FBRWpFLFVBQU0sNEJBQTRCLE1BQU0sSUFBSSxxQkFBcUIsWUFBWSxJQUFJO0FBQUEsTUFDaEYsQ0FBQywrQkFBK0IsSUFBSSxlQUFlLFdBQVcsTUFBTSxXQUFXLGVBQWUsQ0FBQztBQUFBLElBQ2hHLENBQUMsQ0FBQztBQUNGLFVBQU0sc0JBQXNCLDBCQUEwQixJQUFJLDZCQUE2QjtBQUN2RixVQUFNLElBQUksbUJBQWtFO0FBQzVFLFdBQU87QUFBQSxFQUNSO0FBRUEsT0FBSyxpRkFBaUYsTUFBTTtBQUMzRixVQUFNLHFCQUFxQixnQkFBb0Msc0JBQXNCLG9CQUFvQjtBQUN6RyxVQUFNLHNCQUFzQiwwQkFBMEI7QUFDdEQsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLDhCQUE4QixRQUFXLEtBQUssQ0FBQztBQUN0Rix5QkFBcUIsS0FBSywrQkFBK0IsbUJBQW1CO0FBQzVFLHlCQUFxQixLQUFLLGlCQUFpQixJQUFJLG1CQUFtQixDQUFDO0FBQ25FLHlCQUFxQixLQUFLLG1CQUFtQixvQkFBb0I7QUFFakUsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSw2QkFBNkIsRUFBRSw0QkFBNEIsbUJBQW1CLENBQUMsQ0FBQztBQUU3SSx3QkFBb0IsZ0JBQWdCO0FBQUEsTUFDbkMsSUFBSTtBQUFBLE1BQ0osVUFBVSw4QkFBOEI7QUFBQSxNQUN4QyxTQUFTO0FBQUEsTUFDVCxhQUFhO0FBQUEsTUFDYixTQUFTLENBQUM7QUFBQSxNQUNWLGFBQWE7QUFBQSxNQUNiLHNCQUFzQjtBQUFBLE1BQ3RCLGNBQWMsQ0FBQyxvQkFBb0I7QUFBQSxJQUNwQyxDQUFDO0FBRUQsV0FBTyxZQUFZLE9BQU8sUUFBUSxjQUFjLGlDQUFpQyxHQUFHLGFBQWEsWUFBWTtBQUU3Ryx1QkFBbUIsSUFBSSxZQUFZLGtCQUFrQixNQUFTO0FBQzlELFdBQU8sWUFBWSxPQUFPLFFBQVEsY0FBYyxpQ0FBaUMsR0FBRyxJQUFJO0FBRXhGLHVCQUFtQixJQUFJLHNCQUFzQixNQUFTO0FBQ3RELFdBQU8sWUFBWSxPQUFPLFFBQVEsY0FBYyxpQ0FBaUMsR0FBRyxhQUFhLFlBQVk7QUFBQSxFQUM5RyxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLHFCQUFxQixnQkFBb0Msc0JBQXNCLG9CQUFvQjtBQUN6RyxVQUFNLG9CQUErQixDQUFDO0FBQ3RDLFVBQU0sc0JBQXNCLDBCQUEwQjtBQUN0RCxVQUFNLHVCQUF1QixNQUFNLElBQUksOEJBQThCLFFBQVcsS0FBSyxDQUFDO0FBQ3RGLHlCQUFxQixLQUFLLCtCQUErQixtQkFBbUI7QUFDNUUseUJBQXFCLEtBQUssaUJBQWlCLElBQUksbUJBQW1CLENBQUM7QUFDbkUseUJBQXFCLEtBQUssbUJBQW1CLG9CQUFvQjtBQUVqRSxVQUFNLElBQUkscUJBQXFCLGVBQWUsNkJBQTZCO0FBQUEsTUFDMUUsNEJBQTRCO0FBQUEsTUFDNUIsdUJBQXVCLGFBQVcsa0JBQWtCLEtBQUssT0FBTztBQUFBLElBQ2pFLENBQUMsQ0FBQztBQUVGLHdCQUFvQixnQkFBZ0I7QUFBQSxNQUNuQyxJQUFJO0FBQUEsTUFDSixVQUFVLDhCQUE4QjtBQUFBLE1BQ3hDLFNBQVM7QUFBQSxNQUNULGFBQWE7QUFBQSxNQUNiLFNBQVMsQ0FBQztBQUFBLE1BQ1YsYUFBYTtBQUFBLE1BQ2Isc0JBQXNCO0FBQUEsTUFDdEIsY0FBYyxDQUFDLG9CQUFvQjtBQUFBLElBQ3BDLENBQUM7QUFDRCx1QkFBbUIsSUFBSSxZQUFZLGtCQUFrQixNQUFTO0FBRTlELFdBQU8sZ0JBQWdCLG1CQUFtQixDQUFDLE1BQU0sS0FBSyxDQUFDO0FBQUEsRUFDeEQsQ0FBQztBQUVELE9BQUssdUVBQXVFLE1BQU07QUFDakYsVUFBTSxlQUFlLElBQUksTUFBTSx1REFBdUQ7QUFDdEYsVUFBTSxnQkFBZ0IsSUFBSSxNQUFNLHVEQUF1RDtBQUN2RixVQUFNLHFCQUFxQixnQkFBb0Msc0JBQXNCLFlBQVksZ0JBQWdCO0FBQ2pILFVBQU0seUJBQXlCLGdCQUFpQywwQkFBMEIsWUFBWTtBQUN0RyxVQUFNLHNCQUFzQiwwQkFBMEI7QUFDdEQsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLDhCQUE4QixRQUFXLEtBQUssQ0FBQztBQUN0Rix5QkFBcUIsS0FBSywrQkFBK0IsbUJBQW1CO0FBQzVFLHlCQUFxQixLQUFLLGlCQUFpQixJQUFJLG1CQUFtQixDQUFDO0FBQ25FLHlCQUFxQixLQUFLLG1CQUFtQixvQkFBb0I7QUFFakUsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSw2QkFBNkI7QUFBQSxNQUN6Riw0QkFBNEI7QUFBQSxNQUM1QixpQkFBaUI7QUFBQSxJQUNsQixDQUFDLENBQUM7QUFFRix3QkFBb0IsZ0JBQWdCO0FBQUEsTUFDbkMsSUFBSTtBQUFBLE1BQ0osVUFBVSw4QkFBOEI7QUFBQSxNQUN4QyxTQUFTO0FBQUEsTUFDVCxhQUFhO0FBQUEsTUFDYixTQUFTLENBQUM7QUFBQSxNQUNWLGFBQWE7QUFBQSxNQUNiLHNCQUFzQjtBQUFBLE1BQ3RCLGtCQUFrQixDQUFDLFlBQVk7QUFBQSxJQUNoQyxDQUFDO0FBRUQsV0FBTyxZQUFZLE9BQU8sUUFBUSxjQUFjLGlDQUFpQyxHQUFHLGFBQWEsb0JBQW9CO0FBQ3JILDJCQUF1QixJQUFJLGVBQWUsTUFBUztBQUNuRCxXQUFPLFlBQVksT0FBTyxRQUFRLGNBQWMsaUNBQWlDLEdBQUcsSUFBSTtBQUFBLEVBQ3pGLENBQUM7QUFFRCxPQUFLLDhGQUE4RixNQUFNO0FBQ3hHLFVBQU0sK0JBQStCLGdCQUFnQixnQ0FBZ0MsS0FBSztBQUMxRixVQUFNLHNCQUFzQiwwQkFBMEI7QUFDdEQsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLDhCQUE4QixRQUFXLEtBQUssQ0FBQztBQUN0Rix5QkFBcUIsS0FBSywrQkFBK0IsbUJBQW1CO0FBQzVFLHlCQUFxQixLQUFLLGlCQUFpQixJQUFJLG1CQUFtQixDQUFDO0FBQ25FLHlCQUFxQixLQUFLLG1CQUFtQixvQkFBb0I7QUFFakUsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSw2QkFBNkIsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO0FBQzNILHdCQUFvQixnQkFBZ0I7QUFBQSxNQUNuQyxJQUFJO0FBQUEsTUFDSixVQUFVLDhCQUE4QjtBQUFBLE1BQ3hDLFNBQVM7QUFBQSxNQUNULGFBQWE7QUFBQSxNQUNiLFNBQVMsQ0FBQztBQUFBLE1BQ1YsYUFBYTtBQUFBLE1BQ2Isc0JBQXNCO0FBQUEsSUFDdkIsQ0FBQztBQUNELHdCQUFvQixnQkFBZ0I7QUFBQSxNQUNuQyxJQUFJO0FBQUEsTUFDSixVQUFVLDhCQUE4QjtBQUFBLE1BQ3hDLFNBQVM7QUFBQSxNQUNULGFBQWE7QUFBQSxNQUNiLFNBQVMsQ0FBQztBQUFBLE1BQ1YsYUFBYTtBQUFBLE1BQ2Isc0JBQXNCO0FBQUEsTUFDdEIsa0JBQWtCO0FBQUEsSUFDbkIsQ0FBQztBQUVELFVBQU0sZUFBZSxNQUFNLE9BQU8sUUFBUSxjQUFjLGlDQUFpQyxHQUFHO0FBQzVGLFVBQU0sU0FBUyxhQUFhO0FBQzVCLGlDQUE2QixJQUFJLE1BQU0sTUFBUztBQUVoRCxXQUFPLGdCQUFnQixFQUFFLFFBQVEsT0FBTyxhQUFhLEVBQUUsR0FBRztBQUFBLE1BQ3pELFFBQVE7QUFBQSxNQUNSLE9BQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFVBQU0sK0JBQStCLGdCQUFnQixnQ0FBZ0MsSUFBSTtBQUN6RixRQUFJLGNBQWM7QUFDbEIsVUFBTSxVQUFVO0FBQUEsTUFDZixTQUFTLENBQUM7QUFBQSxNQUNWLG9CQUFvQixFQUFFLGtCQUFrQixNQUFNO0FBQUEsTUFDOUMsYUFBYSxFQUFFLGFBQWEsTUFBTSxZQUFZO0FBQUEsTUFDOUMsK0JBQStCO0FBQUEsTUFDL0IsMEJBQTBCO0FBQUEsSUFDM0I7QUFDQSxVQUFNLFNBQVMsUUFBUSxJQUFJLGNBQWMsV0FBVyx3Q0FBd0M7QUFJNUYsVUFBTSxXQUFXLElBQUksTUFBTSxtQ0FBbUM7QUFDOUQsVUFBTSxlQUFlLElBQUksTUFBTSxrQ0FBa0M7QUFDakUsVUFBTSxTQUFTLElBQUksTUFBTSxrQ0FBa0M7QUFFM0QsV0FBTyxLQUFLLE9BQU87QUFDbkIsVUFBTSxlQUFlLDZCQUE2QixJQUFJO0FBQ3RELGtCQUFjO0FBQ2QsV0FBTyxLQUFLLFNBQVMsRUFBRSx5QkFBeUIsVUFBVSx3QkFBd0IsYUFBYSxDQUFDO0FBQ2hHLFVBQU0sMkJBQTJCLDZCQUE2QixJQUFJO0FBQ2xFLFdBQU8sS0FBSyxTQUFTLEVBQUUseUJBQXlCLGNBQWMsd0JBQXdCLE9BQU8sQ0FBQztBQUU5RixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsZUFBZSw2QkFBNkIsSUFBSTtBQUFBLElBQ2pELEdBQUc7QUFBQSxNQUNGLGNBQWM7QUFBQSxNQUNkLDBCQUEwQjtBQUFBLE1BQzFCLGVBQWU7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxVQUFNLCtCQUErQixnQkFBZ0IsZ0NBQWdDLEtBQUs7QUFDMUYsVUFBTSxVQUFVO0FBQUEsTUFDZixTQUFTLENBQUM7QUFBQSxNQUNWLG9CQUFvQixFQUFFLGtCQUFrQixLQUFLO0FBQUEsTUFDN0MsYUFBYSxFQUFFLGFBQWEsTUFBTSxNQUFNO0FBQUEsTUFDeEMsK0JBQStCO0FBQUEsTUFDL0IsMEJBQTBCO0FBQUEsSUFDM0I7QUFDQSxVQUFNLFNBQVMsUUFBUSxJQUFJLGNBQWMsV0FBVyx3Q0FBd0M7QUFLNUYsV0FBTyxLQUFLLE9BQU87QUFFbkIsV0FBTyxZQUFZLDZCQUE2QixJQUFJLEdBQUcsSUFBSTtBQUFBLEVBQzVELENBQUM7QUFFRCxPQUFLLGlEQUFpRCxNQUFNO0FBQzNELFVBQU0sK0JBQStCLGdCQUFnQixnQ0FBZ0MsSUFBSTtBQUN6RixVQUFNLFVBQVU7QUFBQSxNQUNmLFNBQVMsRUFBRSw4QkFBOEIsTUFBTTtBQUFBLE1BQy9DLG9CQUFvQixFQUFFLGtCQUFrQixLQUFLO0FBQUEsTUFDN0MsYUFBYSxFQUFFLGFBQWEsTUFBTSxLQUFLO0FBQUEsTUFDdkMsK0JBQStCO0FBQUEsTUFDL0IsMEJBQTBCO0FBQUEsSUFDM0I7QUFDQSxVQUFNLFNBQVMsUUFBUSxJQUFJLGNBQWMsV0FBVyx3Q0FBd0M7QUFLNUYsV0FBTyxLQUFLLE9BQU87QUFFbkIsV0FBTyxZQUFZLDZCQUE2QixJQUFJLEdBQUcsS0FBSztBQUFBLEVBQzdELENBQUM7QUFFRCxPQUFLLGlEQUFpRCxNQUFNO0FBQzNELFVBQU0sc0JBQXNCLDBCQUEwQjtBQUN0RCxVQUFNLHVCQUF1QixNQUFNLElBQUksOEJBQThCLFFBQVcsS0FBSyxDQUFDO0FBQ3RGLHlCQUFxQixLQUFLLCtCQUErQixtQkFBbUI7QUFDNUUseUJBQXFCLEtBQUssaUJBQWlCLElBQUksbUJBQW1CLENBQUM7QUFDbkUseUJBQXFCLEtBQUssbUJBQW1CLG9CQUFvQjtBQUVqRSxVQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLDZCQUE2QixNQUFTLENBQUM7QUFFcEcsd0JBQW9CLGdCQUFnQjtBQUFBLE1BQ25DLElBQUk7QUFBQSxNQUNKLFVBQVUsOEJBQThCO0FBQUEsTUFDeEMsU0FBUztBQUFBLE1BQ1QsYUFBYSxJQUFJLGVBQWUseURBQXlEO0FBQUEsTUFDekYsU0FBUyxDQUFDO0FBQUEsTUFDVixhQUFhO0FBQUEsTUFDYixzQkFBc0I7QUFBQSxJQUN2QixDQUFDO0FBRUQsVUFBTSxjQUFjLE9BQU8sUUFBUSxjQUFjLHNDQUFzQztBQUN2RixVQUFNLE9BQU8sYUFBYSxjQUFjLEdBQUc7QUFDM0MsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixNQUFNLGFBQWE7QUFBQSxNQUNuQixVQUFVLENBQUMsQ0FBQyxhQUFhLGNBQWMsK0NBQStDO0FBQUEsTUFDdEYsVUFBVSxNQUFNO0FBQUEsTUFDaEIsVUFBVSxNQUFNLGFBQWEsV0FBVyxLQUFLLE1BQU0sYUFBYSxNQUFNO0FBQUEsSUFDdkUsR0FBRztBQUFBLE1BQ0YsTUFBTTtBQUFBLE1BQ04sVUFBVTtBQUFBLE1BQ1YsVUFBVTtBQUFBLE1BQ1YsVUFBVTtBQUFBLElBQ1gsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0RBQStELE1BQU07QUFDekUsVUFBTSxlQUFlLElBQUksTUFBTSx1REFBdUQ7QUFDdEYsVUFBTSxnQkFBZ0IsSUFBSSxNQUFNLHVEQUF1RDtBQUN2RixVQUFNLHNCQUFzQiwwQkFBMEI7QUFFdEQsZUFBVyxDQUFDLElBQUksZUFBZSxLQUFLLENBQUMsQ0FBQyxTQUFTLFlBQVksR0FBRyxDQUFDLFVBQVUsYUFBYSxDQUFDLEdBQVk7QUFDbEcsMEJBQW9CLGdCQUFnQjtBQUFBLFFBQ25DO0FBQUEsUUFDQSxVQUFVLDhCQUE4QjtBQUFBLFFBQ3hDLFNBQVM7QUFBQSxRQUNULGFBQWE7QUFBQSxRQUNiLFNBQVMsQ0FBQztBQUFBLFFBQ1YsYUFBYTtBQUFBLFFBQ2Isc0JBQXNCO0FBQUEsUUFDdEIsa0JBQWtCLENBQUMsZUFBZTtBQUFBLE1BQ25DLENBQUM7QUFBQSxJQUNGO0FBRUEsd0JBQW9CLGtCQUFrQixFQUFFLGFBQWEsWUFBWSxrQkFBa0IsaUJBQWlCLGFBQWEsQ0FBQztBQUVsSCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGdCQUFnQixvQkFBb0Isc0JBQXNCLE9BQUssRUFBRSxPQUFPLE9BQU8sR0FBRztBQUFBLE1BQ2xGLGlCQUFpQixvQkFBb0Isc0JBQXNCLE9BQUssRUFBRSxPQUFPLFFBQVEsR0FBRztBQUFBLElBQ3JGLEdBQUc7QUFBQSxNQUNGLGdCQUFnQjtBQUFBLE1BQ2hCLGlCQUFpQjtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFRRCxXQUFTLHFDQUFxQztBQUM3QyxVQUFNLGdCQUFnQixvQkFBSSxJQUFvQztBQUM5RCxVQUFNLFlBQW9ELENBQUM7QUFDM0QsVUFBTSxZQUFzQixDQUFDO0FBQzdCLFVBQU0sY0FBYyxNQUFNLElBQUksSUFBSSxRQUFjLENBQUM7QUFDakQsVUFBTSxlQUFlLE1BQU0sSUFBSSxJQUFJLFFBQWdCLENBQUM7QUFDcEQsVUFBTSxVQUF5QztBQUFBLE1BQzlDLGVBQWU7QUFBQSxNQUNmLGFBQWEsWUFBWTtBQUFBLE1BQ3pCLGNBQWMsYUFBYTtBQUFBLE1BQzNCLGdCQUFnQixjQUFjO0FBQUUsc0JBQWMsSUFBSSxhQUFhLElBQUksWUFBWTtBQUFHLG9CQUFZLEtBQUs7QUFBQSxNQUFHO0FBQUEsTUFDdEcsbUJBQW1CLElBQUk7QUFBRSxZQUFJLGNBQWMsT0FBTyxFQUFFLEdBQUc7QUFBRSxzQkFBWSxLQUFLO0FBQUEsUUFBRztBQUFBLE1BQUU7QUFBQSxNQUMvRSxvQkFBb0IsSUFBSTtBQUFFLGtCQUFVLEtBQUssRUFBRTtBQUFHLHFCQUFhLEtBQUssRUFBRTtBQUFBLE1BQUc7QUFBQSxNQUNyRSxzQkFBc0IsUUFBUTtBQUM3QixZQUFJO0FBQ0osbUJBQVcsZ0JBQWdCLGNBQWMsT0FBTyxHQUFHO0FBQ2xELGNBQUksVUFBVSxDQUFDLE9BQU8sWUFBWSxHQUFHO0FBQ3BDO0FBQUEsVUFDRDtBQUNBLG1CQUFTO0FBQUEsUUFDVjtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxvQkFBb0I7QUFBQSxNQUFFO0FBQUEsTUFDdEIsaUJBQWlCLGNBQWM7QUFBRSxrQkFBVSxLQUFLLFlBQVk7QUFBQSxNQUFHO0FBQUEsSUFDaEU7QUFDQSxXQUFPLEVBQUUsU0FBUyxXQUFXLFdBQVcsS0FBSyxDQUFDLGlCQUF5QyxRQUFRLGdCQUFnQixZQUFZLEVBQUU7QUFBQSxFQUM5SDtBQUVBLFdBQVMsYUFBYSxVQUtsQixDQUFDLEdBQUc7QUFDUCxVQUFNLHNCQUFzQixtQ0FBbUM7QUFDL0QsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLDhCQUE4QixRQUFXLEtBQUssQ0FBQztBQUN0Rix5QkFBcUIsS0FBSywrQkFBK0Isb0JBQW9CLE9BQU87QUFDcEYseUJBQXFCLEtBQUssaUJBQWlCLFFBQVEsa0JBQWtCLElBQUksbUJBQW1CLENBQUM7QUFDN0YseUJBQXFCLEtBQUssbUJBQW1CLFFBQVEsb0JBQW9CLG9CQUFvQjtBQUM3RixRQUFJLFFBQVEsWUFBWTtBQUN2QiwyQkFBcUIsS0FBSyxhQUFhLFFBQVEsVUFBVTtBQUFBLElBQzFEO0FBQ0EsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSw2QkFBNkIsUUFBUSxRQUFRLENBQUM7QUFDM0csV0FBTyxFQUFFLHFCQUFxQixPQUFPO0FBQUEsRUFDdEM7QUFFQSxXQUFTLFlBQVksUUFBMkM7QUFDL0QsVUFBTSxTQUFTLE9BQU8sUUFBUSxjQUEyQix3Q0FBd0M7QUFDakcsV0FBTyxHQUFHLE1BQU07QUFDaEIsV0FBTyxNQUFNO0FBQUEsRUFDZDtBQUVBLFdBQVMsaUJBQ1IscUJBQ0EsY0FDTztBQUNQLHdCQUFvQixJQUFJO0FBQUEsTUFDdkIsVUFBVSw4QkFBOEI7QUFBQSxNQUN4QyxhQUFhO0FBQUEsTUFDYixhQUFhO0FBQUEsTUFDYixzQkFBc0I7QUFBQSxNQUN0QixHQUFHO0FBQUEsSUFDSixDQUFDO0FBQUEsRUFDRjtBQUVBLE9BQUssOENBQThDLFlBQVk7QUFDOUQsVUFBTSxpQkFBaUIsSUFBSSxtQkFBbUI7QUFDOUMsVUFBTSxFQUFFLHFCQUFxQixPQUFPLElBQUksYUFBYSxFQUFFLGVBQWUsQ0FBQztBQUN2RSxxQkFBaUIscUJBQXFCO0FBQUEsTUFDckMsSUFBSTtBQUFBLE1BQ0osU0FBUztBQUFBLE1BQ1QsU0FBUyxDQUFDLEVBQUUsTUFBTSxnQ0FBZ0MsU0FBUyxPQUFPLE9BQU8sV0FBVyxpQkFBaUIsYUFBYSxDQUFDLEVBQUUsaUJBQWlCLElBQUksQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUMvSSxDQUFDO0FBRUQsVUFBTSxhQUFhLE1BQU0sVUFBVSxvQkFBb0IsUUFBUSxZQUFZO0FBQzNFLGdCQUFZLE1BQU07QUFDbEIsVUFBTTtBQUVOLFdBQU8sZ0JBQWdCLGVBQWUsVUFBVSxDQUFDLEVBQUUsSUFBSSxpQkFBaUIsTUFBTSxDQUFDLEVBQUUsaUJBQWlCLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUMzRyxXQUFPLFlBQVksb0JBQW9CLFVBQVUsS0FBSyxHQUFHLEdBQUcsT0FBTztBQUFBLEVBQ3BFLENBQUM7QUFFRCxPQUFLLHFFQUFxRSxZQUFZO0FBQ3JGLFVBQU0saUJBQWlCLElBQUksbUJBQW1CO0FBQzlDLFVBQU0sRUFBRSxxQkFBcUIsT0FBTyxJQUFJLGFBQWEsRUFBRSxlQUFlLENBQUM7QUFDdkUscUJBQWlCLHFCQUFxQjtBQUFBLE1BQ3JDLElBQUk7QUFBQSxNQUNKLFNBQVM7QUFBQSxNQUNULFNBQVMsQ0FBQyxFQUFFLE1BQU0sZ0NBQWdDLFNBQVMsT0FBTyxXQUFXLFdBQVcsZUFBZSxDQUFDO0FBQUEsSUFDekcsQ0FBQztBQUVELFVBQU0sYUFBYSxNQUFNLFVBQVUsb0JBQW9CLFFBQVEsWUFBWTtBQUMzRSxnQkFBWSxNQUFNO0FBQ2xCLFVBQU07QUFFTixXQUFPLGdCQUFnQixlQUFlLFVBQVUsQ0FBQyxFQUFFLElBQUksZ0JBQWdCLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNsRixXQUFPLFlBQVksb0JBQW9CLFVBQVUsS0FBSyxHQUFHLEdBQUcsTUFBTTtBQUFBLEVBQ25FLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxZQUFZO0FBQ2pGLFVBQU0saUJBQWlCLElBQUksbUJBQW1CO0FBQzlDLFVBQU0sRUFBRSxxQkFBcUIsT0FBTyxJQUFJLGFBQWEsRUFBRSxlQUFlLENBQUM7QUFDdkUscUJBQWlCLHFCQUFxQjtBQUFBLE1BQ3JDLElBQUk7QUFBQSxNQUNKLFNBQVM7QUFBQSxNQUNULFNBQVMsQ0FBQyxFQUFFLE1BQU0sZ0NBQWdDLFNBQVMsT0FBTyxXQUFXLFdBQVcsZUFBZSxVQUFVLEtBQUssQ0FBQztBQUFBLElBQ3hILENBQUM7QUFFRCxnQkFBWSxNQUFNO0FBQ2xCLFVBQU0sUUFBUSxRQUFRO0FBQ3RCLFVBQU0sUUFBUSxRQUFRO0FBRXRCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsVUFBVSxlQUFlO0FBQUEsTUFDekIsV0FBVyxvQkFBb0I7QUFBQSxJQUNoQyxHQUFHO0FBQUEsTUFDRixVQUFVLENBQUMsRUFBRSxJQUFJLGVBQWUsTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQzFDLFdBQVcsQ0FBQztBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0NBQW9DLFlBQVk7QUFDcEQsVUFBTSxhQUFhLE1BQU0sSUFBSSxJQUFJLG9CQUFvQixDQUFDO0FBQ3RELFVBQU0saUJBQWlCLElBQUksY0FBYyxtQkFBbUI7QUFBQSxNQUMzRCxNQUFlLGVBQWUsT0FBZSxNQUFxQztBQUNqRixjQUFNLE1BQU0sZUFBZSxJQUFJLEdBQUcsSUFBSTtBQUN0QyxjQUFNLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxNQUNqQztBQUFBLElBQ0Q7QUFFQSxVQUFNLEVBQUUscUJBQXFCLE9BQU8sSUFBSSxhQUFhLEVBQUUsZ0JBQWdCLFdBQVcsQ0FBQztBQUNuRixxQkFBaUIscUJBQXFCO0FBQUEsTUFDckMsSUFBSTtBQUFBLE1BQ0osU0FBUztBQUFBLE1BQ1QsU0FBUyxDQUFDLEVBQUUsTUFBTSxnQ0FBZ0MsU0FBUyxPQUFPLE9BQU8sV0FBVyxjQUFjLENBQUM7QUFBQSxNQUNuRyxhQUFhO0FBQUEsSUFDZCxDQUFDO0FBRUQsVUFBTSxjQUFjLE1BQU0sVUFBVSxXQUFXLE9BQU87QUFDdEQsZ0JBQVksTUFBTTtBQUNsQixVQUFNO0FBRU4sV0FBTyxnQkFBZ0IsZUFBZSxVQUFVLENBQUMsRUFBRSxJQUFJLGVBQWUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQUEsRUFDbEYsQ0FBQztBQUVELE9BQUssNERBQTRELFlBQVk7QUFDNUUsVUFBTSxtQkFBbUIsSUFBSSwwQkFBMEI7QUFDdkQsVUFBTSxpQkFBMkIsQ0FBQztBQUNsQyxRQUFJLGtCQUFrQjtBQUN0QixVQUFNLEVBQUUscUJBQXFCLE9BQU8sSUFBSSxhQUFhO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULGVBQWUscUJBQW1CO0FBQ2pDLHlCQUFlLEtBQUssZUFBZTtBQUNuQyxpQkFBTztBQUFBLFFBQ1I7QUFBQSxRQUNBLGlCQUFpQixNQUFNO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUM7QUFFRCxxQkFBaUIscUJBQXFCO0FBQUEsTUFDckMsSUFBSTtBQUFBLE1BQ0osU0FBUztBQUFBLE1BQ1QsU0FBUyxDQUFDLEVBQUUsT0FBTyxhQUFhLE1BQU0sZ0NBQWdDLGVBQWUsaUJBQWlCLGVBQWUsQ0FBQztBQUFBLElBQ3ZILENBQUM7QUFFRCxnQkFBWSxNQUFNO0FBQ2xCLFVBQU0sUUFBUSxRQUFRO0FBRXRCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBO0FBQUEsTUFDQSxjQUFjLGlCQUFpQixPQUFPLE9BQU8sV0FBUyxNQUFNLFNBQVMsNkJBQTZCLEVBQUUsSUFBSSxXQUFTLE1BQU0sSUFBSTtBQUFBLElBQzVILEdBQUc7QUFBQSxNQUNGLGdCQUFnQixDQUFDLGNBQWM7QUFBQSxNQUMvQixpQkFBaUI7QUFBQSxNQUNqQixjQUFjLENBQUMsRUFBRSxJQUFJLFNBQVMsYUFBYSxRQUFXLFlBQVksZ0NBQWdDLGNBQWMsQ0FBQztBQUFBLElBQ2xILENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdFQUF3RSxZQUFZO0FBQ3hGLFFBQUksa0JBQWtCO0FBQ3RCLFVBQU0sRUFBRSxxQkFBcUIsT0FBTyxJQUFJLGFBQWE7QUFBQSxNQUNwRCxVQUFVO0FBQUEsUUFDVCxlQUFlLE1BQU07QUFBQSxRQUNyQixpQkFBaUIsTUFBTTtBQUFBLE1BQ3hCO0FBQUEsSUFDRCxDQUFDO0FBRUQscUJBQWlCLHFCQUFxQjtBQUFBLE1BQ3JDLElBQUk7QUFBQSxNQUNKLFNBQVM7QUFBQSxNQUNULFNBQVMsQ0FBQyxFQUFFLE9BQU8sYUFBYSxNQUFNLGdDQUFnQyxlQUFlLGlCQUFpQixnQkFBZ0IsQ0FBQztBQUFBLElBQ3hILENBQUM7QUFFRCxnQkFBWSxNQUFNO0FBQ2xCLFVBQU0sUUFBUSxRQUFRO0FBRXRCLFdBQU8sWUFBWSxpQkFBaUIsQ0FBQztBQUFBLEVBQ3RDLENBQUM7QUFFRCxPQUFLLDREQUE0RCxZQUFZO0FBQzVFLFFBQUksa0JBQWtCO0FBQ3RCLFVBQU0sYUFBYSxNQUFNLElBQUksSUFBSSxvQkFBb0IsQ0FBQztBQUN0RCxVQUFNLEVBQUUscUJBQXFCLE9BQU8sSUFBSSxhQUFhO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULGVBQWUsTUFBTTtBQUFFLGdCQUFNLElBQUksTUFBTSxrQkFBa0I7QUFBQSxRQUFHO0FBQUEsUUFDNUQsaUJBQWlCLE1BQU07QUFBQSxNQUN4QjtBQUFBLElBQ0QsQ0FBQztBQUVELHFCQUFpQixxQkFBcUI7QUFBQSxNQUNyQyxJQUFJO0FBQUEsTUFDSixTQUFTO0FBQUEsTUFDVCxTQUFTLENBQUMsRUFBRSxPQUFPLGFBQWEsTUFBTSxnQ0FBZ0MsZUFBZSxpQkFBaUIsZUFBZSxDQUFDO0FBQUEsSUFDdkgsQ0FBQztBQUVELFVBQU0sY0FBYyxNQUFNLFVBQVUsV0FBVyxPQUFPO0FBQ3RELGdCQUFZLE1BQU07QUFDbEIsVUFBTTtBQUVOLFdBQU8sWUFBWSxpQkFBaUIsQ0FBQztBQUFBLEVBQ3RDLENBQUM7QUFFRCxPQUFLLDhEQUE4RCxZQUFZO0FBQzlFLFVBQU0sYUFBYSxNQUFNLElBQUksSUFBSSxvQkFBb0IsQ0FBQztBQUN0RCxRQUFJLGtCQUFrQjtBQUN0QixVQUFNLEVBQUUscUJBQXFCLE9BQU8sSUFBSSxhQUFhO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULGVBQWUsTUFBTTtBQUFBLFFBQ3JCLGlCQUFpQixNQUFNO0FBQ3RCO0FBQ0EsZ0JBQU0sSUFBSSxNQUFNLGVBQWU7QUFBQSxRQUNoQztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxxQkFBaUIscUJBQXFCO0FBQUEsTUFDckMsSUFBSTtBQUFBLE1BQ0osU0FBUztBQUFBLE1BQ1QsU0FBUyxDQUFDLEVBQUUsT0FBTyxhQUFhLE1BQU0sZ0NBQWdDLGVBQWUsaUJBQWlCLGdCQUFnQixDQUFDO0FBQUEsSUFDeEgsQ0FBQztBQUVELFVBQU0sY0FBYyxNQUFNLFVBQVUsV0FBVyxPQUFPO0FBQ3RELGdCQUFZLE1BQU07QUFDbEIsVUFBTTtBQUVOLFdBQU8sWUFBWSxpQkFBaUIsQ0FBQztBQUFBLEVBQ3RDLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFVBQU0sRUFBRSxxQkFBcUIsT0FBTyxJQUFJLGFBQWE7QUFFckQscUJBQWlCLHFCQUFxQjtBQUFBLE1BQ3JDLElBQUk7QUFBQSxNQUNKLFNBQVM7QUFBQSxNQUNULFNBQVMsQ0FBQyxFQUFFLE9BQU8sYUFBYSxNQUFNLGdDQUFnQyxlQUFlLGlCQUFpQixlQUFlLENBQUM7QUFBQSxJQUN2SCxDQUFDO0FBRUQsV0FBTyxZQUFZLE9BQU8sUUFBUSxjQUFjLHdDQUF3QyxHQUFHLElBQUk7QUFBQSxFQUNoRyxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxVQUFNLGtCQUFrQixJQUFJLEtBQUssRUFBRSxRQUFRLHlCQUF5QixNQUFNLG9CQUFvQixDQUFDO0FBQy9GLFVBQU0sRUFBRSxxQkFBcUIsT0FBTyxJQUFJLGFBQWE7QUFBQSxNQUNwRCxVQUFVLEVBQUUsNEJBQTRCLGdCQUFnQixtQkFBbUIsZUFBZSxDQUFDLEVBQUU7QUFBQSxJQUM5RixDQUFDO0FBRUQscUJBQWlCLHFCQUFxQjtBQUFBLE1BQ3JDLElBQUk7QUFBQSxNQUNKLFNBQVM7QUFBQSxNQUNULFNBQVMsQ0FBQztBQUFBLE1BQ1YsY0FBYyxDQUFDLHVCQUF1QjtBQUFBLElBQ3ZDLENBQUM7QUFFRCxXQUFPLFlBQVksT0FBTyxRQUFRLGNBQWMsaUNBQWlDLEdBQUcsYUFBYSxrQkFBa0I7QUFBQSxFQUNwSCxDQUFDO0FBRUQsT0FBSywrREFBK0QsTUFBTTtBQUN6RSxVQUFNLHFCQUFxQixnQkFBb0Msc0JBQXNCLFlBQVksZ0JBQWdCO0FBQ2pILFVBQU0sRUFBRSxxQkFBcUIsT0FBTyxJQUFJLGFBQWE7QUFBQSxNQUNwRCxVQUFVLEVBQUUsNEJBQTRCLG1CQUFtQjtBQUFBLElBQzVELENBQUM7QUFFRCxxQkFBaUIscUJBQXFCO0FBQUEsTUFDckMsSUFBSTtBQUFBLE1BQ0osU0FBUztBQUFBLE1BQ1QsU0FBUyxDQUFDO0FBQUEsTUFDVixjQUFjLENBQUMsWUFBWSxrQkFBa0IsWUFBWSxVQUFVO0FBQUEsSUFDcEUsQ0FBQztBQUNELFVBQU0sT0FBTyxNQUFNLE9BQU8sUUFBUSxjQUFjLGlDQUFpQyxHQUFHO0FBQ3BGLFVBQU0sZ0JBQWdCLEtBQUs7QUFDM0IsdUJBQW1CLElBQUksWUFBWSxZQUFZLE1BQVM7QUFDeEQsVUFBTSxpQkFBaUIsS0FBSztBQUU1QixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsZUFBZTtBQUFBLE1BQ2YsZ0JBQWdCO0FBQUEsSUFDakIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbUVBQW1FLE1BQU07QUFDN0UsVUFBTSxxQkFBcUIsZ0JBQW9DLHNCQUFzQixvQkFBb0I7QUFDekcsVUFBTSxzQkFBc0IsbUNBQW1DO0FBRS9ELFVBQU0sdUJBQXVCLE1BQU0sSUFBSSw4QkFBOEIsUUFBVyxLQUFLLENBQUM7QUFDdEYseUJBQXFCLEtBQUssK0JBQStCLG9CQUFvQixPQUFPO0FBQ3BGLHlCQUFxQixLQUFLLGlCQUFpQixJQUFJLG1CQUFtQixDQUFDO0FBQ25FLHlCQUFxQixLQUFLLG1CQUFtQixvQkFBb0I7QUFFakUsVUFBTSxJQUFJLHFCQUFxQixlQUFlLDZCQUE2QixFQUFFLDRCQUE0QixtQkFBbUIsQ0FBQyxDQUFDO0FBQzlILFVBQU0sZ0JBQWdCLE1BQU0sb0JBQW9CLFVBQVUsb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBSWxHLHdCQUFvQixJQUFJO0FBQUEsTUFDdkIsSUFBSTtBQUFBLE1BQ0osVUFBVSw4QkFBOEI7QUFBQSxNQUN4QyxTQUFTO0FBQUEsTUFDVCxhQUFhO0FBQUEsTUFDYixTQUFTLENBQUM7QUFBQSxNQUNWLGFBQWE7QUFBQSxNQUNiLHNCQUFzQjtBQUFBLE1BQ3RCLGNBQWMsQ0FBQyxZQUFZLGdCQUFnQjtBQUFBLElBQzVDLENBQUM7QUFDRCxXQUFPLFlBQVksY0FBYyxHQUFHLFFBQVcsdURBQXVEO0FBRXRHLHVCQUFtQixJQUFJLFlBQVksa0JBQWtCLE1BQVM7QUFDOUQsV0FBTyxZQUFZLGNBQWMsR0FBRyxJQUFJLGlCQUFpQiwwREFBMEQ7QUFBQSxFQUNwSCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
