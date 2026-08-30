import assert from "assert";
import { Emitter } from "../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { InMemoryStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { ChatPromoNotificationContribution } from "../../browser/chatPromoNotification.js";
import { ChatInputNotificationActionKind, isChatInputNotificationApplicableToSessionType } from "../../browser/widget/input/chatInputNotificationService.js";
function createMockNotificationService(disposables) {
  const notifications = /* @__PURE__ */ new Map();
  const dismissed = /* @__PURE__ */ new Set();
  const onDidChange = disposables.add(new Emitter());
  const onDidDismiss = disposables.add(new Emitter());
  const service = {
    _serviceBrand: void 0,
    onDidChange: onDidChange.event,
    onDidDismiss: onDidDismiss.event,
    setNotification(notification) {
      notifications.set(notification.id, notification);
      dismissed.delete(notification.id);
      onDidChange.fire();
    },
    deleteNotification(id) {
      if (notifications.delete(id)) {
        dismissed.delete(id);
        onDidChange.fire();
      }
    },
    dismissNotification(id) {
      if (!notifications.has(id) || dismissed.has(id)) {
        return;
      }
      dismissed.add(id);
      onDidDismiss.fire(id);
      onDidChange.fire();
    },
    getActiveNotification(filter) {
      let active;
      for (const notification of notifications.values()) {
        if (dismissed.has(notification.id) || filter && !filter(notification)) {
          continue;
        }
        active = notification;
      }
      return active;
    },
    handleMessageSent() {
    },
    announceRendered() {
    }
  };
  return {
    service,
    onDidDismiss,
    /** The active notification, ignoring session scoping. */
    getNotification() {
      return service.getActiveNotification();
    },
    /** The active notification a chat input of the given session type would render. */
    getNotificationForSession(sessionType) {
      return service.getActiveNotification((n) => isChatInputNotificationApplicableToSessionType(n, sessionType));
    },
    /** All notifications that are currently set and not dismissed. */
    getAllNotifications() {
      return [...notifications.values()].filter((n) => !dismissed.has(n.id));
    },
    dismiss(id) {
      const notificationId = id ?? [...notifications.keys()].reverse().find((k) => !dismissed.has(k));
      if (notificationId) {
        service.dismissNotification(notificationId);
      }
    }
  };
}
function createMockLanguageModelsService(models, disposables) {
  const onDidChangeLanguageModels = disposables.add(new Emitter());
  const service = {
    _serviceBrand: void 0,
    onDidChangeLanguageModels: onDidChangeLanguageModels.event,
    getLanguageModelIds() {
      return models.map((m) => m.identifier);
    },
    lookupLanguageModel(id) {
      const match = models.find((m) => m.identifier === id);
      return match?.metadata;
    }
  };
  return { service, onDidChangeLanguageModels };
}
suite("ChatPromoNotificationContribution", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("shows notification for model with promo", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([{
      identifier: "copilot:gpt-5.5",
      metadata: { name: "GPT-5.5", id: "gpt-5.5", promo: { id: "promo-1", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "Get 20% off" } }
    }], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    const contribution = disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.ok(contribution);
    const notification = notifService.getNotification();
    assert.ok(notification, "Expected a notification to be shown");
    assert.ok(notification.message.toString().includes("20% off"));
    assert.ok(notification.description?.toString().includes("2026"), "Expected the end date to be rendered");
    assert.strictEqual(notification.deferForNewUsers, true);
    assert.deepStrictEqual(notification.actions, [{
      label: "Try GPT-5.5",
      kind: ChatInputNotificationActionKind.SwitchToModel,
      modelIdentifier: "copilot:gpt-5.5"
    }]);
  });
  test("renders the server message for a 0% promo", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([{
      identifier: "copilot:zero-discount",
      metadata: { name: "Zero Discount", id: "zero-discount", promo: { id: "promo-zero", discountPercent: 0, endsAt: "2026-07-20T23:59:59Z", message: "Featured model" } }
    }], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    const notification = notifService.getNotification();
    assert.ok(notification, "Expected a notification for the 0% promo");
    assert.strictEqual(notification.message, "Featured model");
  });
  test("prefers a discounted promo over a 0% one in the same harness", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([
      { identifier: "copilot:featured", metadata: { name: "Featured", id: "featured", promo: { id: "promo-zero", discountPercent: 0, message: "Featured model" } } },
      { identifier: "copilot:discounted", metadata: { name: "Discounted", id: "discounted", promo: { id: "promo-discount", discountPercent: 20, message: "Get 20% off" } } }
    ], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    const notification = notifService.getNotification();
    assert.ok(notification);
    assert.strictEqual(notification.message, "Get 20% off");
  });
  test("does not show notification for negative promo discounts", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([{
      identifier: "copilot:negative-discount",
      metadata: { name: "Negative Discount", id: "negative-discount", promo: { id: "promo-negative", discountPercent: -10, endsAt: "2026-07-20T23:59:59Z", message: "Featured model" } }
    }], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.strictEqual(notifService.getNotification(), void 0);
  });
  test("omits the end date when the promo has none", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([
      { identifier: "local:no-end-date", metadata: { name: "Open Ended", id: "no-end-date", promo: { id: "promo-open", discountPercent: 20, message: "Get 20% off" } } },
      { identifier: "copilot:bad-end-date", metadata: { name: "Bad Date", id: "bad-end-date", targetChatSessionType: "copilotcli", promo: { id: "promo-bad-date", discountPercent: 20, endsAt: "not a date", message: "Get 20% off" } } }
    ], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.deepStrictEqual(
      notifService.getAllNotifications().map((n) => ({ message: n.message, description: n.description })),
      [
        { message: "Get 20% off", description: void 0 },
        { message: "Get 20% off", description: void 0 }
      ]
    );
  });
  test("does not show notification for already-dismissed promo", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([{
      identifier: "copilot:gpt-5.5",
      metadata: { name: "GPT-5.5", id: "gpt-5.5", promo: { id: "promo-1", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "Get 20% off" } }
    }], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(
      "chat.dismissedPromoIds",
      JSON.stringify(["promo-1"]),
      StorageScope.APPLICATION,
      0
      /* StorageTarget.USER */
    );
    const contribution = disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.ok(contribution);
    const notification = notifService.getNotification();
    assert.strictEqual(notification, void 0, "Should not show notification for dismissed promo");
  });
  test("persists promo id on dismiss", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([{
      identifier: "copilot:gpt-5.5",
      metadata: { name: "GPT-5.5", id: "gpt-5.5", promo: { id: "promo-2", discountPercent: 15, endsAt: "2026-08-01T00:00:00Z", message: "Summer promo" } }
    }], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    const contribution = disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.ok(contribution);
    assert.ok(notifService.getNotification(), "Notification should be shown initially");
    notifService.dismiss();
    const stored = storageService.get("chat.dismissedPromoIds", StorageScope.APPLICATION);
    assert.ok(stored);
    const parsed = JSON.parse(stored);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.includes("promo-2"));
  });
  test("does not show notification when no models have promo", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([{
      identifier: "copilot:gpt-4o",
      metadata: { name: "GPT-4o", id: "gpt-4o" }
    }], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    const contribution = disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.ok(contribution);
    assert.strictEqual(notifService.getNotification(), void 0);
  });
  test("handles malformed stored JSON gracefully", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([{
      identifier: "copilot:gpt-5.5",
      metadata: { name: "GPT-5.5", id: "gpt-5.5", promo: { id: "promo-3", discountPercent: 10, endsAt: "2026-07-20T23:59:59Z", message: "Promo" } }
    }], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store("chat.dismissedPromoIds", "{not valid json", StorageScope.APPLICATION, 0);
    const contribution = disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.ok(contribution);
    assert.ok(notifService.getNotification());
  });
  test("removes notification when promo model disappears", () => {
    const models = [{
      identifier: "copilot:gpt-5.5",
      metadata: { name: "GPT-5.5", id: "gpt-5.5", promo: { id: "promo-4", discountPercent: 25, endsAt: "2026-07-20T23:59:59Z", message: "Flash sale" } }
    }];
    const notifService = createMockNotificationService(disposables);
    const { service: lmService, onDidChangeLanguageModels } = createMockLanguageModelsService(models, disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    const contribution = disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.ok(contribution);
    assert.ok(notifService.getNotification());
    models.length = 0;
    onDidChangeLanguageModels.fire(void 0);
    assert.strictEqual(notifService.getNotification(), void 0, "Notification should be removed when promo model is gone");
  });
  test("skips second promo if first is not dismissed", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([
      { identifier: "copilot:gpt-5.5", metadata: { name: "GPT-5.5", id: "gpt-5.5", promo: { id: "promo-a", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "First promo" } } },
      { identifier: "copilot:claude", metadata: { name: "Claude", id: "claude", promo: { id: "promo-b", discountPercent: 10, endsAt: "2026-08-01T00:00:00Z", message: "Second promo" } } }
    ], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    const contribution = disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.ok(contribution);
    const notification = notifService.getNotification();
    assert.ok(notification);
    assert.ok(notification.message.toString().includes("First promo"));
  });
  test("shows a scoped promo per harness", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([
      { identifier: "local:gpt-5.5", metadata: { name: "GPT-5.5", id: "gpt-5.5", promo: { id: "promo-local", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "Local promo" } } },
      { identifier: "copilot:claude", metadata: { name: "Claude", id: "claude", targetChatSessionType: "copilotcli", promo: { id: "promo-copilot", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "Copilot promo" } } },
      { identifier: "codex:o4", metadata: { name: "o4", id: "o4", targetChatSessionType: "openai-codex", promo: { id: "promo-codex", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "Codex promo" } } }
    ], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    const contribution = disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.ok(contribution);
    assert.strictEqual(notifService.getAllNotifications().length, 3);
    const local = notifService.getNotificationForSession("local");
    assert.ok(local, "Expected a local promo");
    assert.ok(local.message.toString().includes("Local promo"));
    assert.deepStrictEqual(local.actions, [{ label: "Try GPT-5.5", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "local:gpt-5.5" }]);
    const copilot = notifService.getNotificationForSession("copilotcli");
    assert.ok(copilot, "Expected a Copilot promo");
    assert.ok(copilot.message.toString().includes("Copilot promo"));
    assert.deepStrictEqual(copilot.actions, [{ label: "Try Claude", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "copilot:claude" }]);
    const codex = notifService.getNotificationForSession("openai-codex");
    assert.ok(codex, "Expected a Codex promo");
    assert.ok(codex.message.toString().includes("Codex promo"));
    assert.deepStrictEqual(codex.actions, [{ label: "Try o4", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "codex:o4" }]);
  });
  test("does not leak a harness promo into a different session type", () => {
    const notifService = createMockNotificationService(disposables);
    const { service: lmService } = createMockLanguageModelsService([
      { identifier: "copilot:claude", metadata: { name: "Claude", id: "claude", targetChatSessionType: "copilotcli", promo: { id: "promo-copilot", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "Copilot promo" } } }
    ], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    const contribution = disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.ok(contribution);
    assert.ok(notifService.getNotificationForSession("copilotcli"), "Promo should show in its own harness");
    assert.strictEqual(notifService.getNotificationForSession("local"), void 0, "Promo should not leak into the local harness");
    assert.strictEqual(notifService.getNotificationForSession("openai-codex"), void 0, "Promo should not leak into another harness");
  });
  test("dismissing a promo in one harness hides the same promo in the others", () => {
    const notifService = createMockNotificationService(disposables);
    const sharedPromo = { id: "promo-shared", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "Shared promo" };
    const { service: lmService } = createMockLanguageModelsService([
      { identifier: "copilot:claude", metadata: { name: "Claude", id: "claude", targetChatSessionType: "copilotcli", promo: sharedPromo } },
      { identifier: "codex:o4", metadata: { name: "o4", id: "o4", targetChatSessionType: "openai-codex", promo: sharedPromo } }
    ], disposables);
    const storageService = disposables.add(new InMemoryStorageService());
    const contribution = disposables.add(new ChatPromoNotificationContribution(
      lmService,
      notifService.service,
      storageService
    ));
    assert.ok(contribution);
    assert.strictEqual(notifService.getAllNotifications().length, 2);
    const copilot = notifService.getNotificationForSession("copilotcli");
    assert.ok(copilot);
    notifService.dismiss(copilot.id);
    assert.strictEqual(notifService.getAllNotifications().length, 0);
    const stored = JSON.parse(storageService.get("chat.dismissedPromoIds", StorageScope.APPLICATION) ?? "[]");
    assert.deepStrictEqual(stored, ["promo-shared"]);
  });
  test("dismissing a promo in one window hides it in other windows", () => {
    const promo = { id: "promo-1", discountPercent: 20, endsAt: "2026-07-20T23:59:59Z", message: "Get 20% off" };
    const models = [{ identifier: "copilot:gpt-5.5", metadata: { name: "GPT-5.5", id: "gpt-5.5", promo } }];
    const storageService = disposables.add(new InMemoryStorageService());
    const windowA = createMockNotificationService(disposables);
    const windowB = createMockNotificationService(disposables);
    disposables.add(new ChatPromoNotificationContribution(createMockLanguageModelsService(models, disposables).service, windowA.service, storageService));
    disposables.add(new ChatPromoNotificationContribution(createMockLanguageModelsService(models, disposables).service, windowB.service, storageService));
    assert.ok(windowA.getNotification());
    assert.ok(windowB.getNotification());
    windowA.dismiss();
    assert.strictEqual(windowA.getNotification(), void 0, "Dismissing window should hide the promo");
    assert.strictEqual(windowB.getNotification(), void 0, "Other windows should hide the promo too");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRQcm9tb05vdGlmaWNhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jaGF0UHJvbW9Ob3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZCwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvbiwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UsIGlzQ2hhdElucHV0Tm90aWZpY2F0aW9uQXBwbGljYWJsZVRvU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlTW9ja05vdGlmaWNhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4pIHtcblx0Y29uc3Qgbm90aWZpY2F0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdElucHV0Tm90aWZpY2F0aW9uPigpO1xuXHRjb25zdCBkaXNtaXNzZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdCBvbkRpZENoYW5nZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Y29uc3Qgb25EaWREaXNtaXNzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cblx0Y29uc3Qgc2VydmljZTogSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UgPSB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZS5ldmVudCxcblx0XHRvbkRpZERpc21pc3M6IG9uRGlkRGlzbWlzcy5ldmVudCxcblx0XHRzZXROb3RpZmljYXRpb24obm90aWZpY2F0aW9uOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uKSB7XG5cdFx0XHRub3RpZmljYXRpb25zLnNldChub3RpZmljYXRpb24uaWQsIG5vdGlmaWNhdGlvbik7XG5cdFx0XHRkaXNtaXNzZWQuZGVsZXRlKG5vdGlmaWNhdGlvbi5pZCk7XG5cdFx0XHRvbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fSxcblx0XHRkZWxldGVOb3RpZmljYXRpb24oaWQ6IHN0cmluZykge1xuXHRcdFx0aWYgKG5vdGlmaWNhdGlvbnMuZGVsZXRlKGlkKSkge1xuXHRcdFx0XHRkaXNtaXNzZWQuZGVsZXRlKGlkKTtcblx0XHRcdFx0b25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZGlzbWlzc05vdGlmaWNhdGlvbihpZDogc3RyaW5nKSB7XG5cdFx0XHRpZiAoIW5vdGlmaWNhdGlvbnMuaGFzKGlkKSB8fCBkaXNtaXNzZWQuaGFzKGlkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRkaXNtaXNzZWQuYWRkKGlkKTtcblx0XHRcdG9uRGlkRGlzbWlzcy5maXJlKGlkKTtcblx0XHRcdG9uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9LFxuXHRcdGdldEFjdGl2ZU5vdGlmaWNhdGlvbihmaWx0ZXI/OiAobm90aWZpY2F0aW9uOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uKSA9PiBib29sZWFuKSB7XG5cdFx0XHRsZXQgYWN0aXZlOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBub3RpZmljYXRpb24gb2Ygbm90aWZpY2F0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0XHRpZiAoZGlzbWlzc2VkLmhhcyhub3RpZmljYXRpb24uaWQpIHx8IChmaWx0ZXIgJiYgIWZpbHRlcihub3RpZmljYXRpb24pKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFjdGl2ZSA9IG5vdGlmaWNhdGlvbjsgLy8gTWFwIHByZXNlcnZlcyBpbnNlcnRpb24gb3JkZXI6IGxhc3QgbWF0Y2ggd2lucy5cblx0XHRcdH1cblx0XHRcdHJldHVybiBhY3RpdmU7XG5cdFx0fSxcblx0XHRoYW5kbGVNZXNzYWdlU2VudCgpIHsgfSxcblx0XHRhbm5vdW5jZVJlbmRlcmVkKCkgeyB9LFxuXHR9O1xuXG5cdHJldHVybiB7XG5cdFx0c2VydmljZSxcblx0XHRvbkRpZERpc21pc3MsXG5cdFx0LyoqIFRoZSBhY3RpdmUgbm90aWZpY2F0aW9uLCBpZ25vcmluZyBzZXNzaW9uIHNjb3BpbmcuICovXG5cdFx0Z2V0Tm90aWZpY2F0aW9uKCk6IElDaGF0SW5wdXROb3RpZmljYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHNlcnZpY2UuZ2V0QWN0aXZlTm90aWZpY2F0aW9uKCk7XG5cdFx0fSxcblx0XHQvKiogVGhlIGFjdGl2ZSBub3RpZmljYXRpb24gYSBjaGF0IGlucHV0IG9mIHRoZSBnaXZlbiBzZXNzaW9uIHR5cGUgd291bGQgcmVuZGVyLiAqL1xuXHRcdGdldE5vdGlmaWNhdGlvbkZvclNlc3Npb24oc2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElDaGF0SW5wdXROb3RpZmljYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHNlcnZpY2UuZ2V0QWN0aXZlTm90aWZpY2F0aW9uKG4gPT4gaXNDaGF0SW5wdXROb3RpZmljYXRpb25BcHBsaWNhYmxlVG9TZXNzaW9uVHlwZShuLCBzZXNzaW9uVHlwZSkpO1xuXHRcdH0sXG5cdFx0LyoqIEFsbCBub3RpZmljYXRpb25zIHRoYXQgYXJlIGN1cnJlbnRseSBzZXQgYW5kIG5vdCBkaXNtaXNzZWQuICovXG5cdFx0Z2V0QWxsTm90aWZpY2F0aW9ucygpOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uW10ge1xuXHRcdFx0cmV0dXJuIFsuLi5ub3RpZmljYXRpb25zLnZhbHVlcygpXS5maWx0ZXIobiA9PiAhZGlzbWlzc2VkLmhhcyhuLmlkKSk7XG5cdFx0fSxcblx0XHRkaXNtaXNzKGlkPzogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25JZCA9IGlkID8/IFsuLi5ub3RpZmljYXRpb25zLmtleXMoKV0ucmV2ZXJzZSgpLmZpbmQoayA9PiAhZGlzbWlzc2VkLmhhcyhrKSk7XG5cdFx0XHRpZiAobm90aWZpY2F0aW9uSWQpIHtcblx0XHRcdFx0c2VydmljZS5kaXNtaXNzTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbklkKTtcblx0XHRcdH1cblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKG1vZGVsczogeyBpZGVudGlmaWVyOiBzdHJpbmc7IG1ldGFkYXRhOiBQYXJ0aWFsPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPiB9W10sIGRpc3Bvc2FibGVzOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+KSB7XG5cdGNvbnN0IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nIHwgdW5kZWZpbmVkPigpKTtcblx0Y29uc3Qgc2VydmljZSA9IHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsczogb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscy5ldmVudCxcblx0XHRnZXRMYW5ndWFnZU1vZGVsSWRzKCkgeyByZXR1cm4gbW9kZWxzLm1hcChtID0+IG0uaWRlbnRpZmllcik7IH0sXG5cdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbChpZDogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IG1vZGVscy5maW5kKG0gPT4gbS5pZGVudGlmaWVyID09PSBpZCk7XG5cdFx0XHRyZXR1cm4gbWF0Y2g/Lm1ldGFkYXRhIGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRcdH0sXG5cdH0gYXMgdW5rbm93biBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlO1xuXG5cdHJldHVybiB7IHNlcnZpY2UsIG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMgfTtcbn1cblxuc3VpdGUoJ0NoYXRQcm9tb05vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Nob3dzIG5vdGlmaWNhdGlvbiBmb3IgbW9kZWwgd2l0aCBwcm9tbycsICgpID0+IHtcblx0XHRjb25zdCBub3RpZlNlcnZpY2UgPSBjcmVhdGVNb2NrTm90aWZpY2F0aW9uU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlOiBsbVNlcnZpY2UgfSA9IGNyZWF0ZU1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2UoW3tcblx0XHRcdGlkZW50aWZpZXI6ICdjb3BpbG90OmdwdC01LjUnLFxuXHRcdFx0bWV0YWRhdGE6IHsgbmFtZTogJ0dQVC01LjUnLCBpZDogJ2dwdC01LjUnLCBwcm9tbzogeyBpZDogJ3Byb21vLTEnLCBkaXNjb3VudFBlcmNlbnQ6IDIwLCBlbmRzQXQ6ICcyMDI2LTA3LTIwVDIzOjU5OjU5WicsIG1lc3NhZ2U6ICdHZXQgMjAlIG9mZicgfSB9LFxuXHRcdH1dLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRQcm9tb05vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbihcblx0XHRcdGxtU2VydmljZSxcblx0XHRcdG5vdGlmU2VydmljZS5zZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRyaWJ1dGlvbik7XG5cblx0XHRjb25zdCBub3RpZmljYXRpb24gPSBub3RpZlNlcnZpY2UuZ2V0Tm90aWZpY2F0aW9uKCk7XG5cdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbiwgJ0V4cGVjdGVkIGEgbm90aWZpY2F0aW9uIHRvIGJlIHNob3duJyk7XG5cdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbi5tZXNzYWdlLnRvU3RyaW5nKCkuaW5jbHVkZXMoJzIwJSBvZmYnKSk7XG5cdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbi5kZXNjcmlwdGlvbj8udG9TdHJpbmcoKS5pbmNsdWRlcygnMjAyNicpLCAnRXhwZWN0ZWQgdGhlIGVuZCBkYXRlIHRvIGJlIHJlbmRlcmVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbi5kZWZlckZvck5ld1VzZXJzLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbi5hY3Rpb25zLCBbe1xuXHRcdFx0bGFiZWw6ICdUcnkgR1BULTUuNScsXG5cdFx0XHRraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLlN3aXRjaFRvTW9kZWwsXG5cdFx0XHRtb2RlbElkZW50aWZpZXI6ICdjb3BpbG90OmdwdC01LjUnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyB0aGUgc2VydmVyIG1lc3NhZ2UgZm9yIGEgMCUgcHJvbW8nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm90aWZTZXJ2aWNlID0gY3JlYXRlTW9ja05vdGlmaWNhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHsgc2VydmljZTogbG1TZXJ2aWNlIH0gPSBjcmVhdGVNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFt7XG5cdFx0XHRpZGVudGlmaWVyOiAnY29waWxvdDp6ZXJvLWRpc2NvdW50Jyxcblx0XHRcdG1ldGFkYXRhOiB7IG5hbWU6ICdaZXJvIERpc2NvdW50JywgaWQ6ICd6ZXJvLWRpc2NvdW50JywgcHJvbW86IHsgaWQ6ICdwcm9tby16ZXJvJywgZGlzY291bnRQZXJjZW50OiAwLCBlbmRzQXQ6ICcyMDI2LTA3LTIwVDIzOjU5OjU5WicsIG1lc3NhZ2U6ICdGZWF0dXJlZCBtb2RlbCcgfSB9LFxuXHRcdH1dLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRQcm9tb05vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbihcblx0XHRcdGxtU2VydmljZSxcblx0XHRcdG5vdGlmU2VydmljZS5zZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0KSk7XG5cblx0XHRjb25zdCBub3RpZmljYXRpb24gPSBub3RpZlNlcnZpY2UuZ2V0Tm90aWZpY2F0aW9uKCk7XG5cdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbiwgJ0V4cGVjdGVkIGEgbm90aWZpY2F0aW9uIGZvciB0aGUgMCUgcHJvbW8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uLm1lc3NhZ2UsICdGZWF0dXJlZCBtb2RlbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVmZXJzIGEgZGlzY291bnRlZCBwcm9tbyBvdmVyIGEgMCUgb25lIGluIHRoZSBzYW1lIGhhcm5lc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm90aWZTZXJ2aWNlID0gY3JlYXRlTW9ja05vdGlmaWNhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHsgc2VydmljZTogbG1TZXJ2aWNlIH0gPSBjcmVhdGVNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFtcblx0XHRcdHsgaWRlbnRpZmllcjogJ2NvcGlsb3Q6ZmVhdHVyZWQnLCBtZXRhZGF0YTogeyBuYW1lOiAnRmVhdHVyZWQnLCBpZDogJ2ZlYXR1cmVkJywgcHJvbW86IHsgaWQ6ICdwcm9tby16ZXJvJywgZGlzY291bnRQZXJjZW50OiAwLCBtZXNzYWdlOiAnRmVhdHVyZWQgbW9kZWwnIH0gfSB9LFxuXHRcdFx0eyBpZGVudGlmaWVyOiAnY29waWxvdDpkaXNjb3VudGVkJywgbWV0YWRhdGE6IHsgbmFtZTogJ0Rpc2NvdW50ZWQnLCBpZDogJ2Rpc2NvdW50ZWQnLCBwcm9tbzogeyBpZDogJ3Byb21vLWRpc2NvdW50JywgZGlzY291bnRQZXJjZW50OiAyMCwgbWVzc2FnZTogJ0dldCAyMCUgb2ZmJyB9IH0gfSxcblx0XHRdLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRQcm9tb05vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbihcblx0XHRcdGxtU2VydmljZSxcblx0XHRcdG5vdGlmU2VydmljZS5zZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0KSk7XG5cblx0XHRjb25zdCBub3RpZmljYXRpb24gPSBub3RpZlNlcnZpY2UuZ2V0Tm90aWZpY2F0aW9uKCk7XG5cdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbi5tZXNzYWdlLCAnR2V0IDIwJSBvZmYnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc2hvdyBub3RpZmljYXRpb24gZm9yIG5lZ2F0aXZlIHByb21vIGRpc2NvdW50cycsICgpID0+IHtcblx0XHRjb25zdCBub3RpZlNlcnZpY2UgPSBjcmVhdGVNb2NrTm90aWZpY2F0aW9uU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlOiBsbVNlcnZpY2UgfSA9IGNyZWF0ZU1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2UoW3tcblx0XHRcdGlkZW50aWZpZXI6ICdjb3BpbG90Om5lZ2F0aXZlLWRpc2NvdW50Jyxcblx0XHRcdG1ldGFkYXRhOiB7IG5hbWU6ICdOZWdhdGl2ZSBEaXNjb3VudCcsIGlkOiAnbmVnYXRpdmUtZGlzY291bnQnLCBwcm9tbzogeyBpZDogJ3Byb21vLW5lZ2F0aXZlJywgZGlzY291bnRQZXJjZW50OiAtMTAsIGVuZHNBdDogJzIwMjYtMDctMjBUMjM6NTk6NTlaJywgbWVzc2FnZTogJ0ZlYXR1cmVkIG1vZGVsJyB9IH0sXG5cdFx0fV0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uKFxuXHRcdFx0bG1TZXJ2aWNlLFxuXHRcdFx0bm90aWZTZXJ2aWNlLnNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZlNlcnZpY2UuZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIHRoZSBlbmQgZGF0ZSB3aGVuIHRoZSBwcm9tbyBoYXMgbm9uZScsICgpID0+IHtcblx0XHRjb25zdCBub3RpZlNlcnZpY2UgPSBjcmVhdGVNb2NrTm90aWZpY2F0aW9uU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlOiBsbVNlcnZpY2UgfSA9IGNyZWF0ZU1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2UoW1xuXHRcdFx0eyBpZGVudGlmaWVyOiAnbG9jYWw6bm8tZW5kLWRhdGUnLCBtZXRhZGF0YTogeyBuYW1lOiAnT3BlbiBFbmRlZCcsIGlkOiAnbm8tZW5kLWRhdGUnLCBwcm9tbzogeyBpZDogJ3Byb21vLW9wZW4nLCBkaXNjb3VudFBlcmNlbnQ6IDIwLCBtZXNzYWdlOiAnR2V0IDIwJSBvZmYnIH0gfSB9LFxuXHRcdFx0eyBpZGVudGlmaWVyOiAnY29waWxvdDpiYWQtZW5kLWRhdGUnLCBtZXRhZGF0YTogeyBuYW1lOiAnQmFkIERhdGUnLCBpZDogJ2JhZC1lbmQtZGF0ZScsIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2NvcGlsb3RjbGknLCBwcm9tbzogeyBpZDogJ3Byb21vLWJhZC1kYXRlJywgZGlzY291bnRQZXJjZW50OiAyMCwgZW5kc0F0OiAnbm90IGEgZGF0ZScsIG1lc3NhZ2U6ICdHZXQgMjAlIG9mZicgfSB9IH0sXG5cdFx0XSwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0UHJvbW9Ob3RpZmljYXRpb25Db250cmlidXRpb24oXG5cdFx0XHRsbVNlcnZpY2UsXG5cdFx0XHRub3RpZlNlcnZpY2Uuc2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG5vdGlmU2VydmljZS5nZXRBbGxOb3RpZmljYXRpb25zKCkubWFwKG4gPT4gKHsgbWVzc2FnZTogbi5tZXNzYWdlLCBkZXNjcmlwdGlvbjogbi5kZXNjcmlwdGlvbiB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgbWVzc2FnZTogJ0dldCAyMCUgb2ZmJywgZGVzY3JpcHRpb246IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IG1lc3NhZ2U6ICdHZXQgMjAlIG9mZicsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfSxcblx0XHRcdF0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc2hvdyBub3RpZmljYXRpb24gZm9yIGFscmVhZHktZGlzbWlzc2VkIHByb21vJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vdGlmU2VydmljZSA9IGNyZWF0ZU1vY2tOb3RpZmljYXRpb25TZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCB7IHNlcnZpY2U6IGxtU2VydmljZSB9ID0gY3JlYXRlTW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZShbe1xuXHRcdFx0aWRlbnRpZmllcjogJ2NvcGlsb3Q6Z3B0LTUuNScsXG5cdFx0XHRtZXRhZGF0YTogeyBuYW1lOiAnR1BULTUuNScsIGlkOiAnZ3B0LTUuNScsIHByb21vOiB7IGlkOiAncHJvbW8tMScsIGRpc2NvdW50UGVyY2VudDogMjAsIGVuZHNBdDogJzIwMjYtMDctMjBUMjM6NTk6NTlaJywgbWVzc2FnZTogJ0dldCAyMCUgb2ZmJyB9IH0sXG5cdFx0fV0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHQvLyBQcmUtc2VlZCBkaXNtaXNzZWQgcHJvbW9cblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnY2hhdC5kaXNtaXNzZWRQcm9tb0lkcycsIEpTT04uc3RyaW5naWZ5KFsncHJvbW8tMSddKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCAwIC8qIFN0b3JhZ2VUYXJnZXQuVVNFUiAqLyk7XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRQcm9tb05vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbihcblx0XHRcdGxtU2VydmljZSxcblx0XHRcdG5vdGlmU2VydmljZS5zZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRyaWJ1dGlvbik7XG5cblx0XHRjb25zdCBub3RpZmljYXRpb24gPSBub3RpZlNlcnZpY2UuZ2V0Tm90aWZpY2F0aW9uKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbiwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCBzaG93IG5vdGlmaWNhdGlvbiBmb3IgZGlzbWlzc2VkIHByb21vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIHByb21vIGlkIG9uIGRpc21pc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm90aWZTZXJ2aWNlID0gY3JlYXRlTW9ja05vdGlmaWNhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHsgc2VydmljZTogbG1TZXJ2aWNlIH0gPSBjcmVhdGVNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFt7XG5cdFx0XHRpZGVudGlmaWVyOiAnY29waWxvdDpncHQtNS41Jyxcblx0XHRcdG1ldGFkYXRhOiB7IG5hbWU6ICdHUFQtNS41JywgaWQ6ICdncHQtNS41JywgcHJvbW86IHsgaWQ6ICdwcm9tby0yJywgZGlzY291bnRQZXJjZW50OiAxNSwgZW5kc0F0OiAnMjAyNi0wOC0wMVQwMDowMDowMFonLCBtZXNzYWdlOiAnU3VtbWVyIHByb21vJyB9IH0sXG5cdFx0fV0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uKFxuXHRcdFx0bG1TZXJ2aWNlLFxuXHRcdFx0bm90aWZTZXJ2aWNlLnNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHQpKTtcblx0XHRhc3NlcnQub2soY29udHJpYnV0aW9uKTtcblx0XHRhc3NlcnQub2sobm90aWZTZXJ2aWNlLmdldE5vdGlmaWNhdGlvbigpLCAnTm90aWZpY2F0aW9uIHNob3VsZCBiZSBzaG93biBpbml0aWFsbHknKTtcblxuXHRcdC8vIFNpbXVsYXRlIHVzZXIgZGlzbWlzc2luZyB0aGUgbm90aWZpY2F0aW9uXG5cdFx0bm90aWZTZXJ2aWNlLmRpc21pc3MoKTtcblxuXHRcdC8vIFZlcmlmeSBwZXJzaXN0ZWRcblx0XHRjb25zdCBzdG9yZWQgPSBzdG9yYWdlU2VydmljZS5nZXQoJ2NoYXQuZGlzbWlzc2VkUHJvbW9JZHMnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGFzc2VydC5vayhzdG9yZWQpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2Uoc3RvcmVkKTtcblx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheShwYXJzZWQpKTtcblx0XHRhc3NlcnQub2socGFyc2VkLmluY2x1ZGVzKCdwcm9tby0yJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBzaG93IG5vdGlmaWNhdGlvbiB3aGVuIG5vIG1vZGVscyBoYXZlIHByb21vJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vdGlmU2VydmljZSA9IGNyZWF0ZU1vY2tOb3RpZmljYXRpb25TZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCB7IHNlcnZpY2U6IGxtU2VydmljZSB9ID0gY3JlYXRlTW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZShbe1xuXHRcdFx0aWRlbnRpZmllcjogJ2NvcGlsb3Q6Z3B0LTRvJyxcblx0XHRcdG1ldGFkYXRhOiB7IG5hbWU6ICdHUFQtNG8nLCBpZDogJ2dwdC00bycgfSxcblx0XHR9XSwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0UHJvbW9Ob3RpZmljYXRpb25Db250cmlidXRpb24oXG5cdFx0XHRsbVNlcnZpY2UsXG5cdFx0XHRub3RpZlNlcnZpY2Uuc2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdGFzc2VydC5vayhjb250cmlidXRpb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmU2VydmljZS5nZXROb3RpZmljYXRpb24oKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBtYWxmb3JtZWQgc3RvcmVkIEpTT04gZ3JhY2VmdWxseScsICgpID0+IHtcblx0XHRjb25zdCBub3RpZlNlcnZpY2UgPSBjcmVhdGVNb2NrTm90aWZpY2F0aW9uU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlOiBsbVNlcnZpY2UgfSA9IGNyZWF0ZU1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2UoW3tcblx0XHRcdGlkZW50aWZpZXI6ICdjb3BpbG90OmdwdC01LjUnLFxuXHRcdFx0bWV0YWRhdGE6IHsgbmFtZTogJ0dQVC01LjUnLCBpZDogJ2dwdC01LjUnLCBwcm9tbzogeyBpZDogJ3Byb21vLTMnLCBkaXNjb3VudFBlcmNlbnQ6IDEwLCBlbmRzQXQ6ICcyMDI2LTA3LTIwVDIzOjU5OjU5WicsIG1lc3NhZ2U6ICdQcm9tbycgfSB9LFxuXHRcdH1dLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Ly8gU3RvcmUgbWFsZm9ybWVkIEpTT05cblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnY2hhdC5kaXNtaXNzZWRQcm9tb0lkcycsICd7bm90IHZhbGlkIGpzb24nLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIDApO1xuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0UHJvbW9Ob3RpZmljYXRpb25Db250cmlidXRpb24oXG5cdFx0XHRsbVNlcnZpY2UsXG5cdFx0XHRub3RpZlNlcnZpY2Uuc2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdGFzc2VydC5vayhjb250cmlidXRpb24pO1xuXG5cdFx0Ly8gU2hvdWxkIHN0aWxsIHNob3cgdGhlIG5vdGlmaWNhdGlvbiAobWFsZm9ybWVkIGRhdGEgaWdub3JlZClcblx0XHRhc3NlcnQub2sobm90aWZTZXJ2aWNlLmdldE5vdGlmaWNhdGlvbigpKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyBub3RpZmljYXRpb24gd2hlbiBwcm9tbyBtb2RlbCBkaXNhcHBlYXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVscyA9IFt7XG5cdFx0XHRpZGVudGlmaWVyOiAnY29waWxvdDpncHQtNS41Jyxcblx0XHRcdG1ldGFkYXRhOiB7IG5hbWU6ICdHUFQtNS41JywgaWQ6ICdncHQtNS41JywgcHJvbW86IHsgaWQ6ICdwcm9tby00JywgZGlzY291bnRQZXJjZW50OiAyNSwgZW5kc0F0OiAnMjAyNi0wNy0yMFQyMzo1OTo1OVonLCBtZXNzYWdlOiAnRmxhc2ggc2FsZScgfSB9LFxuXHRcdH1dO1xuXHRcdGNvbnN0IG5vdGlmU2VydmljZSA9IGNyZWF0ZU1vY2tOb3RpZmljYXRpb25TZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCB7IHNlcnZpY2U6IGxtU2VydmljZSwgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyB9ID0gY3JlYXRlTW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZShtb2RlbHMsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uKFxuXHRcdFx0bG1TZXJ2aWNlLFxuXHRcdFx0bm90aWZTZXJ2aWNlLnNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHQpKTtcblx0XHRhc3NlcnQub2soY29udHJpYnV0aW9uKTtcblx0XHRhc3NlcnQub2sobm90aWZTZXJ2aWNlLmdldE5vdGlmaWNhdGlvbigpKTtcblxuXHRcdC8vIFJlbW92ZSB0aGUgcHJvbW8gbW9kZWxcblx0XHRtb2RlbHMubGVuZ3RoID0gMDtcblx0XHRvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZlNlcnZpY2UuZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCwgJ05vdGlmaWNhdGlvbiBzaG91bGQgYmUgcmVtb3ZlZCB3aGVuIHByb21vIG1vZGVsIGlzIGdvbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgc2Vjb25kIHByb21vIGlmIGZpcnN0IGlzIG5vdCBkaXNtaXNzZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm90aWZTZXJ2aWNlID0gY3JlYXRlTW9ja05vdGlmaWNhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHsgc2VydmljZTogbG1TZXJ2aWNlIH0gPSBjcmVhdGVNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFtcblx0XHRcdHsgaWRlbnRpZmllcjogJ2NvcGlsb3Q6Z3B0LTUuNScsIG1ldGFkYXRhOiB7IG5hbWU6ICdHUFQtNS41JywgaWQ6ICdncHQtNS41JywgcHJvbW86IHsgaWQ6ICdwcm9tby1hJywgZGlzY291bnRQZXJjZW50OiAyMCwgZW5kc0F0OiAnMjAyNi0wNy0yMFQyMzo1OTo1OVonLCBtZXNzYWdlOiAnRmlyc3QgcHJvbW8nIH0gfSB9LFxuXHRcdFx0eyBpZGVudGlmaWVyOiAnY29waWxvdDpjbGF1ZGUnLCBtZXRhZGF0YTogeyBuYW1lOiAnQ2xhdWRlJywgaWQ6ICdjbGF1ZGUnLCBwcm9tbzogeyBpZDogJ3Byb21vLWInLCBkaXNjb3VudFBlcmNlbnQ6IDEwLCBlbmRzQXQ6ICcyMDI2LTA4LTAxVDAwOjAwOjAwWicsIG1lc3NhZ2U6ICdTZWNvbmQgcHJvbW8nIH0gfSB9LFxuXHRcdF0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uKFxuXHRcdFx0bG1TZXJ2aWNlLFxuXHRcdFx0bm90aWZTZXJ2aWNlLnNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHQpKTtcblx0XHRhc3NlcnQub2soY29udHJpYnV0aW9uKTtcblxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IG5vdGlmU2VydmljZS5nZXROb3RpZmljYXRpb24oKTtcblx0XHRhc3NlcnQub2sobm90aWZpY2F0aW9uKTtcblx0XHQvLyBTaG91bGQgc2hvdyB0aGUgZmlyc3QgcHJvbW8sIG5vdCB0aGUgc2Vjb25kXG5cdFx0YXNzZXJ0Lm9rKG5vdGlmaWNhdGlvbi5tZXNzYWdlLnRvU3RyaW5nKCkuaW5jbHVkZXMoJ0ZpcnN0IHByb21vJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBhIHNjb3BlZCBwcm9tbyBwZXIgaGFybmVzcycsICgpID0+IHtcblx0XHRjb25zdCBub3RpZlNlcnZpY2UgPSBjcmVhdGVNb2NrTm90aWZpY2F0aW9uU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlOiBsbVNlcnZpY2UgfSA9IGNyZWF0ZU1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2UoW1xuXHRcdFx0eyBpZGVudGlmaWVyOiAnbG9jYWw6Z3B0LTUuNScsIG1ldGFkYXRhOiB7IG5hbWU6ICdHUFQtNS41JywgaWQ6ICdncHQtNS41JywgcHJvbW86IHsgaWQ6ICdwcm9tby1sb2NhbCcsIGRpc2NvdW50UGVyY2VudDogMjAsIGVuZHNBdDogJzIwMjYtMDctMjBUMjM6NTk6NTlaJywgbWVzc2FnZTogJ0xvY2FsIHByb21vJyB9IH0gfSxcblx0XHRcdHsgaWRlbnRpZmllcjogJ2NvcGlsb3Q6Y2xhdWRlJywgbWV0YWRhdGE6IHsgbmFtZTogJ0NsYXVkZScsIGlkOiAnY2xhdWRlJywgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnY29waWxvdGNsaScsIHByb21vOiB7IGlkOiAncHJvbW8tY29waWxvdCcsIGRpc2NvdW50UGVyY2VudDogMjAsIGVuZHNBdDogJzIwMjYtMDctMjBUMjM6NTk6NTlaJywgbWVzc2FnZTogJ0NvcGlsb3QgcHJvbW8nIH0gfSB9LFxuXHRcdFx0eyBpZGVudGlmaWVyOiAnY29kZXg6bzQnLCBtZXRhZGF0YTogeyBuYW1lOiAnbzQnLCBpZDogJ280JywgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnb3BlbmFpLWNvZGV4JywgcHJvbW86IHsgaWQ6ICdwcm9tby1jb2RleCcsIGRpc2NvdW50UGVyY2VudDogMjAsIGVuZHNBdDogJzIwMjYtMDctMjBUMjM6NTk6NTlaJywgbWVzc2FnZTogJ0NvZGV4IHByb21vJyB9IH0gfSxcblx0XHRdLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRQcm9tb05vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbihcblx0XHRcdGxtU2VydmljZSxcblx0XHRcdG5vdGlmU2VydmljZS5zZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRyaWJ1dGlvbik7XG5cblx0XHQvLyBPbmUgbm90aWZpY2F0aW9uIHBlciBoYXJuZXNzLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZlNlcnZpY2UuZ2V0QWxsTm90aWZpY2F0aW9ucygpLmxlbmd0aCwgMyk7XG5cblx0XHQvLyBFYWNoIHNlc3Npb24gb25seSBzZWVzIHRoZSBwcm9tbyBmb3IgdGhlIG1vZGVsIHRoYXQgYmVsb25ncyB0byBpdC5cblx0XHRjb25zdCBsb2NhbCA9IG5vdGlmU2VydmljZS5nZXROb3RpZmljYXRpb25Gb3JTZXNzaW9uKCdsb2NhbCcpO1xuXHRcdGFzc2VydC5vayhsb2NhbCwgJ0V4cGVjdGVkIGEgbG9jYWwgcHJvbW8nKTtcblx0XHRhc3NlcnQub2sobG9jYWwubWVzc2FnZS50b1N0cmluZygpLmluY2x1ZGVzKCdMb2NhbCBwcm9tbycpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvY2FsLmFjdGlvbnMsIFt7IGxhYmVsOiAnVHJ5IEdQVC01LjUnLCBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLlN3aXRjaFRvTW9kZWwsIG1vZGVsSWRlbnRpZmllcjogJ2xvY2FsOmdwdC01LjUnIH1dKTtcblxuXHRcdGNvbnN0IGNvcGlsb3QgPSBub3RpZlNlcnZpY2UuZ2V0Tm90aWZpY2F0aW9uRm9yU2Vzc2lvbignY29waWxvdGNsaScpO1xuXHRcdGFzc2VydC5vayhjb3BpbG90LCAnRXhwZWN0ZWQgYSBDb3BpbG90IHByb21vJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvcGlsb3QubWVzc2FnZS50b1N0cmluZygpLmluY2x1ZGVzKCdDb3BpbG90IHByb21vJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29waWxvdC5hY3Rpb25zLCBbeyBsYWJlbDogJ1RyeSBDbGF1ZGUnLCBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLlN3aXRjaFRvTW9kZWwsIG1vZGVsSWRlbnRpZmllcjogJ2NvcGlsb3Q6Y2xhdWRlJyB9XSk7XG5cblx0XHRjb25zdCBjb2RleCA9IG5vdGlmU2VydmljZS5nZXROb3RpZmljYXRpb25Gb3JTZXNzaW9uKCdvcGVuYWktY29kZXgnKTtcblx0XHRhc3NlcnQub2soY29kZXgsICdFeHBlY3RlZCBhIENvZGV4IHByb21vJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvZGV4Lm1lc3NhZ2UudG9TdHJpbmcoKS5pbmNsdWRlcygnQ29kZXggcHJvbW8nKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2RleC5hY3Rpb25zLCBbeyBsYWJlbDogJ1RyeSBvNCcsIGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuU3dpdGNoVG9Nb2RlbCwgbW9kZWxJZGVudGlmaWVyOiAnY29kZXg6bzQnIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgbGVhayBhIGhhcm5lc3MgcHJvbW8gaW50byBhIGRpZmZlcmVudCBzZXNzaW9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm90aWZTZXJ2aWNlID0gY3JlYXRlTW9ja05vdGlmaWNhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHsgc2VydmljZTogbG1TZXJ2aWNlIH0gPSBjcmVhdGVNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFtcblx0XHRcdHsgaWRlbnRpZmllcjogJ2NvcGlsb3Q6Y2xhdWRlJywgbWV0YWRhdGE6IHsgbmFtZTogJ0NsYXVkZScsIGlkOiAnY2xhdWRlJywgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnY29waWxvdGNsaScsIHByb21vOiB7IGlkOiAncHJvbW8tY29waWxvdCcsIGRpc2NvdW50UGVyY2VudDogMjAsIGVuZHNBdDogJzIwMjYtMDctMjBUMjM6NTk6NTlaJywgbWVzc2FnZTogJ0NvcGlsb3QgcHJvbW8nIH0gfSB9LFxuXHRcdF0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uKFxuXHRcdFx0bG1TZXJ2aWNlLFxuXHRcdFx0bm90aWZTZXJ2aWNlLnNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHQpKTtcblx0XHRhc3NlcnQub2soY29udHJpYnV0aW9uKTtcblxuXHRcdGFzc2VydC5vayhub3RpZlNlcnZpY2UuZ2V0Tm90aWZpY2F0aW9uRm9yU2Vzc2lvbignY29waWxvdGNsaScpLCAnUHJvbW8gc2hvdWxkIHNob3cgaW4gaXRzIG93biBoYXJuZXNzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmU2VydmljZS5nZXROb3RpZmljYXRpb25Gb3JTZXNzaW9uKCdsb2NhbCcpLCB1bmRlZmluZWQsICdQcm9tbyBzaG91bGQgbm90IGxlYWsgaW50byB0aGUgbG9jYWwgaGFybmVzcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZlNlcnZpY2UuZ2V0Tm90aWZpY2F0aW9uRm9yU2Vzc2lvbignb3BlbmFpLWNvZGV4JyksIHVuZGVmaW5lZCwgJ1Byb21vIHNob3VsZCBub3QgbGVhayBpbnRvIGFub3RoZXIgaGFybmVzcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNtaXNzaW5nIGEgcHJvbW8gaW4gb25lIGhhcm5lc3MgaGlkZXMgdGhlIHNhbWUgcHJvbW8gaW4gdGhlIG90aGVycycsICgpID0+IHtcblx0XHRjb25zdCBub3RpZlNlcnZpY2UgPSBjcmVhdGVNb2NrTm90aWZpY2F0aW9uU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc2hhcmVkUHJvbW8gPSB7IGlkOiAncHJvbW8tc2hhcmVkJywgZGlzY291bnRQZXJjZW50OiAyMCwgZW5kc0F0OiAnMjAyNi0wNy0yMFQyMzo1OTo1OVonLCBtZXNzYWdlOiAnU2hhcmVkIHByb21vJyB9O1xuXHRcdGNvbnN0IHsgc2VydmljZTogbG1TZXJ2aWNlIH0gPSBjcmVhdGVNb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFtcblx0XHRcdHsgaWRlbnRpZmllcjogJ2NvcGlsb3Q6Y2xhdWRlJywgbWV0YWRhdGE6IHsgbmFtZTogJ0NsYXVkZScsIGlkOiAnY2xhdWRlJywgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnY29waWxvdGNsaScsIHByb21vOiBzaGFyZWRQcm9tbyB9IH0sXG5cdFx0XHR7IGlkZW50aWZpZXI6ICdjb2RleDpvNCcsIG1ldGFkYXRhOiB7IG5hbWU6ICdvNCcsIGlkOiAnbzQnLCB0YXJnZXRDaGF0U2Vzc2lvblR5cGU6ICdvcGVuYWktY29kZXgnLCBwcm9tbzogc2hhcmVkUHJvbW8gfSB9LFxuXHRcdF0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uKFxuXHRcdFx0bG1TZXJ2aWNlLFxuXHRcdFx0bm90aWZTZXJ2aWNlLnNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHQpKTtcblx0XHRhc3NlcnQub2soY29udHJpYnV0aW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZTZXJ2aWNlLmdldEFsbE5vdGlmaWNhdGlvbnMoKS5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gRGlzbWlzcyB0aGUgQ29waWxvdCBub3RpZmljYXRpb24uXG5cdFx0Y29uc3QgY29waWxvdCA9IG5vdGlmU2VydmljZS5nZXROb3RpZmljYXRpb25Gb3JTZXNzaW9uKCdjb3BpbG90Y2xpJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvcGlsb3QpO1xuXHRcdG5vdGlmU2VydmljZS5kaXNtaXNzKGNvcGlsb3QuaWQpO1xuXG5cdFx0Ly8gQm90aCBub3RpZmljYXRpb25zIGNhcnJ5IHRoZSBzYW1lIHByb21vIGlkLCBzbyBkaXNtaXNzaW5nIG9uZSByZW1vdmVzIGJvdGguXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmU2VydmljZS5nZXRBbGxOb3RpZmljYXRpb25zKCkubGVuZ3RoLCAwKTtcblx0XHRjb25zdCBzdG9yZWQgPSBKU09OLnBhcnNlKHN0b3JhZ2VTZXJ2aWNlLmdldCgnY2hhdC5kaXNtaXNzZWRQcm9tb0lkcycsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikgPz8gJ1tdJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yZWQsIFsncHJvbW8tc2hhcmVkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNtaXNzaW5nIGEgcHJvbW8gaW4gb25lIHdpbmRvdyBoaWRlcyBpdCBpbiBvdGhlciB3aW5kb3dzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb21vID0geyBpZDogJ3Byb21vLTEnLCBkaXNjb3VudFBlcmNlbnQ6IDIwLCBlbmRzQXQ6ICcyMDI2LTA3LTIwVDIzOjU5OjU5WicsIG1lc3NhZ2U6ICdHZXQgMjAlIG9mZicgfTtcblx0XHRjb25zdCBtb2RlbHMgPSBbeyBpZGVudGlmaWVyOiAnY29waWxvdDpncHQtNS41JywgbWV0YWRhdGE6IHsgbmFtZTogJ0dQVC01LjUnLCBpZDogJ2dwdC01LjUnLCBwcm9tbyB9IH1dO1xuXHRcdC8vIEJvdGggd2luZG93cyBvZiB0aGUgc2FtZSBhcHAgc2hhcmUgYXBwbGljYXRpb24tc2NvcGVkIHN0b3JhZ2UuXG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCB3aW5kb3dBID0gY3JlYXRlTW9ja05vdGlmaWNhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHdpbmRvd0IgPSBjcmVhdGVNb2NrTm90aWZpY2F0aW9uU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0UHJvbW9Ob3RpZmljYXRpb25Db250cmlidXRpb24oY3JlYXRlTW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZShtb2RlbHMsIGRpc3Bvc2FibGVzKS5zZXJ2aWNlLCB3aW5kb3dBLnNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0UHJvbW9Ob3RpZmljYXRpb25Db250cmlidXRpb24oY3JlYXRlTW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZShtb2RlbHMsIGRpc3Bvc2FibGVzKS5zZXJ2aWNlLCB3aW5kb3dCLnNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKSk7XG5cblx0XHRhc3NlcnQub2sod2luZG93QS5nZXROb3RpZmljYXRpb24oKSk7XG5cdFx0YXNzZXJ0Lm9rKHdpbmRvd0IuZ2V0Tm90aWZpY2F0aW9uKCkpO1xuXG5cdFx0d2luZG93QS5kaXNtaXNzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2luZG93QS5nZXROb3RpZmljYXRpb24oKSwgdW5kZWZpbmVkLCAnRGlzbWlzc2luZyB3aW5kb3cgc2hvdWxkIGhpZGUgdGhlIHByb21vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpbmRvd0IuZ2V0Tm90aWZpY2F0aW9uKCksIHVuZGVmaW5lZCwgJ090aGVyIHdpbmRvd3Mgc2hvdWxkIGhpZGUgdGhlIHByb21vIHRvbycpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUV4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdCQUF3QixvQkFBb0I7QUFDckQsU0FBUyx5Q0FBeUM7QUFFbEQsU0FBUyxpQ0FBd0Ysc0RBQXNEO0FBRXZKLFNBQVMsOEJBQThCLGFBQTJDO0FBQ2pGLFFBQU0sZ0JBQWdCLG9CQUFJLElBQW9DO0FBQzlELFFBQU0sWUFBWSxvQkFBSSxJQUFZO0FBRWxDLFFBQU0sY0FBYyxZQUFZLElBQUksSUFBSSxRQUFjLENBQUM7QUFDdkQsUUFBTSxlQUFlLFlBQVksSUFBSSxJQUFJLFFBQWdCLENBQUM7QUFFMUQsUUFBTSxVQUF5QztBQUFBLElBQzlDLGVBQWU7QUFBQSxJQUNmLGFBQWEsWUFBWTtBQUFBLElBQ3pCLGNBQWMsYUFBYTtBQUFBLElBQzNCLGdCQUFnQixjQUFzQztBQUNyRCxvQkFBYyxJQUFJLGFBQWEsSUFBSSxZQUFZO0FBQy9DLGdCQUFVLE9BQU8sYUFBYSxFQUFFO0FBQ2hDLGtCQUFZLEtBQUs7QUFBQSxJQUNsQjtBQUFBLElBQ0EsbUJBQW1CLElBQVk7QUFDOUIsVUFBSSxjQUFjLE9BQU8sRUFBRSxHQUFHO0FBQzdCLGtCQUFVLE9BQU8sRUFBRTtBQUNuQixvQkFBWSxLQUFLO0FBQUEsTUFDbEI7QUFBQSxJQUNEO0FBQUEsSUFDQSxvQkFBb0IsSUFBWTtBQUMvQixVQUFJLENBQUMsY0FBYyxJQUFJLEVBQUUsS0FBSyxV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
