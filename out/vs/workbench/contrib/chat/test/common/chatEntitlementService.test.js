import assert from "assert";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { ChatEntitlementService, parseQuotas } from "../../../../services/chat/common/chatEntitlementService.js";
import { TestStorageService } from "../../../../test/common/workbenchTestServices.js";
suite("parseQuotas", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeEntitlementsData(overrides) {
    return {
      access_type_sku: "plus_monthly_subscriber_quota",
      chat_enabled: true,
      assigned_date: "2026-04-17T12:53:45-07:00",
      can_signup_for_limited: false,
      copilot_plan: "individual_pro",
      organization_login_list: [],
      analytics_tracking_id: "test",
      ...overrides
    };
  }
  test("reads token_based_billing from top-level, not from quota snapshot", () => {
    const data = makeEntitlementsData({
      token_based_billing: true,
      quota_snapshots: {
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: true,
          percent_remaining: 97.4,
          unlimited: false
          // no token_based_billing here — paid users don't have it per-snapshot
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.premiumChat?.usageBasedBilling, true);
  });
  test("usageBasedBilling is undefined when top-level token_based_billing is absent", () => {
    const data = makeEntitlementsData({
      quota_snapshots: {
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 80,
          unlimited: false
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.premiumChat?.usageBasedBilling, void 0);
  });
  test("all quota types receive top-level token_based_billing", () => {
    const data = makeEntitlementsData({
      token_based_billing: true,
      quota_snapshots: {
        chat: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true
        },
        completions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true
        },
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: true,
          percent_remaining: 97.4,
          unlimited: false
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.usageBasedBilling, true);
    assert.strictEqual(quotas.chat?.usageBasedBilling, true);
    assert.strictEqual(quotas.completions?.usageBasedBilling, true);
    assert.strictEqual(quotas.premiumChat?.usageBasedBilling, true);
  });
  test("parses paid user response correctly (top-level token_based_billing only)", () => {
    const data = makeEntitlementsData({
      quota_reset_date: "2026-06-01",
      quota_reset_date_utc: "2026-06-01T00:00:00.000Z",
      token_based_billing: true,
      quota_snapshots: {
        chat: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true,
          entitlement: "0"
        },
        completions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true,
          entitlement: "0"
        },
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: true,
          percent_remaining: 97.4,
          unlimited: false,
          entitlement: "3900"
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.deepStrictEqual(quotas, {
      resetDate: "2026-06-01T00:00:00.000Z",
      resetDateHasTime: true,
      usageBasedBilling: true,
      canUpgradePlan: void 0,
      chat: {
        percentRemaining: 100,
        unlimited: true,
        hasQuota: void 0,
        usageBasedBilling: true,
        resetAt: void 0,
        entitlement: 0,
        quotaRemaining: void 0,
        creditsUsed: void 0
      },
      completions: {
        percentRemaining: 100,
        unlimited: true,
        hasQuota: void 0,
        usageBasedBilling: true,
        resetAt: void 0,
        entitlement: 0,
        quotaRemaining: void 0,
        creditsUsed: void 0
      },
      premiumChat: {
        percentRemaining: 97.4,
        unlimited: false,
        hasQuota: void 0,
        usageBasedBilling: true,
        resetAt: void 0,
        entitlement: 3900,
        quotaRemaining: void 0,
        creditsUsed: void 0
      },
      additionalUsageEnabled: true,
      additionalUsageCount: 0,
      additionalUsageEntitlement: 0
    });
  });
  test("parses free user CFI response with per-snapshot token_based_billing", () => {
    const data = makeEntitlementsData({
      access_type_sku: "free_limited_copilot",
      copilot_plan: "free",
      token_based_billing: true,
      quota_snapshots: {
        chat: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 98.7,
          unlimited: false
        },
        completions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: false
        },
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 0,
          unlimited: false
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.chat?.usageBasedBilling, true);
    assert.strictEqual(quotas.completions?.usageBasedBilling, true);
    assert.strictEqual(quotas.premiumChat?.usageBasedBilling, true);
    assert.strictEqual(quotas.premiumChat?.percentRemaining, 0);
    assert.strictEqual(quotas.additionalUsageEnabled, false);
  });
  test("keeps TBB snapshots: unlimited with zero entitlement and finite with nonzero entitlement (has_quota is always false)", () => {
    const data = makeEntitlementsData({
      access_type_sku: "monthly_subscriber_quota",
      copilot_plan: "individual",
      token_based_billing: true,
      quota_snapshots: {
        chat: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true,
          entitlement: "0",
          has_quota: false
        },
        completions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true,
          entitlement: "0",
          has_quota: false
        },
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 5.5,
          unlimited: false,
          entitlement: "1000",
          has_quota: false
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.chat?.percentRemaining, 100);
    assert.strictEqual(quotas.chat?.unlimited, true);
    assert.strictEqual(quotas.completions?.percentRemaining, 100);
    assert.strictEqual(quotas.completions?.unlimited, true);
    assert.strictEqual(quotas.premiumChat?.percentRemaining, 5.5);
    assert.strictEqual(quotas.premiumChat?.entitlement, 1e3);
  });
  test("keeps all snapshots for CB/CE users where all categories are unlimited", () => {
    const data = makeEntitlementsData({
      access_type_sku: "copilot_enterprise_seat_multi_quota",
      copilot_plan: "enterprise",
      token_based_billing: true,
      quota_snapshots: {
        chat: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true,
          entitlement: "0",
          has_quota: false
        },
        completions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true,
          entitlement: "0",
          has_quota: false
        },
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true,
          entitlement: "0",
          has_quota: false
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.chat?.unlimited, true);
    assert.strictEqual(quotas.completions?.unlimited, true);
    assert.strictEqual(quotas.premiumChat?.unlimited, true);
  });
  test("skips quota snapshots with zero entitlement and not unlimited (e.g. free tier premium_interactions)", () => {
    const data = makeEntitlementsData({
      access_type_sku: "free_limited_copilot",
      copilot_plan: "free",
      token_based_billing: true,
      quota_snapshots: {
        chat: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 98.7,
          unlimited: false,
          entitlement: "200",
          has_quota: false
        },
        completions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: false,
          entitlement: "4000",
          has_quota: false
        },
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 0,
          unlimited: false,
          entitlement: "0",
          has_quota: false
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.chat?.percentRemaining, 98.7);
    assert.strictEqual(quotas.chat?.entitlement, 200);
    assert.strictEqual(quotas.completions?.percentRemaining, 100);
    assert.strictEqual(quotas.completions?.entitlement, 4e3);
    assert.strictEqual(quotas.premiumChat, void 0);
  });
  test("pooled entitlements exhausted when has_quota is false and overages are disabled", () => {
    const data = makeEntitlementsData({
      access_type_sku: "copilot_enterprise_seat_multi_quota",
      copilot_plan: "enterprise",
      token_based_billing: true,
      quota_snapshots: {
        chat: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true,
          entitlement: "0",
          has_quota: false
        },
        completions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 100,
          unlimited: true,
          entitlement: "0",
          has_quota: false
        },
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 0,
          unlimited: true,
          entitlement: "0",
          has_quota: false
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.premiumChat?.hasQuota, false);
    assert.strictEqual(quotas.premiumChat?.unlimited, true);
    assert.strictEqual(quotas.additionalUsageEnabled, false);
  });
  test("pooled entitlements not exhausted when has_quota is true", () => {
    const data = makeEntitlementsData({
      access_type_sku: "copilot_enterprise_seat_multi_quota",
      copilot_plan: "enterprise",
      token_based_billing: true,
      quota_snapshots: {
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 50,
          unlimited: true,
          entitlement: "0",
          has_quota: true
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.premiumChat?.hasQuota, true);
    assert.strictEqual(quotas.premiumChat?.unlimited, true);
    assert.strictEqual(quotas.additionalUsageEnabled, false);
  });
  test("parses quota_remaining from snapshot data", () => {
    const data = makeEntitlementsData({
      token_based_billing: true,
      quota_snapshots: {
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          credits_used: 499,
          percent_remaining: 7.5,
          unlimited: false,
          entitlement: "20000",
          quota_remaining: 1501
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.premiumChat?.quotaRemaining, 1501);
    assert.strictEqual(quotas.premiumChat?.entitlement, 2e4);
    assert.strictEqual(quotas.premiumChat?.creditsUsed, 499);
  });
  test("quotaRemaining is undefined when not present in snapshot", () => {
    const data = makeEntitlementsData({
      quota_snapshots: {
        premium_interactions: {
          overage_count: 0,
          overage_entitlement: 0,
          overage_permitted: false,
          percent_remaining: 50,
          unlimited: false,
          entitlement: "1000"
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.premiumChat?.quotaRemaining, void 0);
  });
  test("pooled entitlements not exhausted when overages are enabled even if has_quota is false", () => {
    const data = makeEntitlementsData({
      access_type_sku: "copilot_enterprise_seat_multi_quota",
      copilot_plan: "enterprise",
      token_based_billing: true,
      quota_snapshots: {
        premium_interactions: {
          overage_count: 5,
          overage_entitlement: 0,
          overage_permitted: true,
          percent_remaining: 0,
          unlimited: true,
          entitlement: "0",
          has_quota: false
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.premiumChat?.hasQuota, false);
    assert.strictEqual(quotas.additionalUsageEnabled, true);
  });
  test("parses overage_entitlement from premium_interactions snapshot", () => {
    const data = makeEntitlementsData({
      token_based_billing: true,
      quota_snapshots: {
        premium_interactions: {
          overage_count: 3,
          overage_entitlement: 50,
          overage_permitted: true,
          percent_remaining: 0,
          unlimited: false,
          entitlement: "3900"
        }
      }
    });
    const quotas = parseQuotas(data);
    assert.strictEqual(quotas.additionalUsageEntitlement, 50);
    assert.strictEqual(quotas.additionalUsageCount, 3);
    assert.strictEqual(quotas.additionalUsageEnabled, true);
  });
});
suite("ChatEntitlementService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createService() {
    return store.add(new ChatEntitlementService(
      store.add(new TestInstantiationService()),
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      store.add(new MockContextKeyService()),
      new TestConfigurationService(),
      NullTelemetryService,
      new NullLogService(),
      store.add(new TestStorageService())
    ));
  }
  test("merges defined snapshot fields until the snapshot is removed", () => {
    const service = createService();
    service.acceptQuotas({
      premiumChat: {
        percentRemaining: 90,
        unlimited: true,
        hasQuota: true,
        resetAt: 100,
        usageBasedBilling: true,
        entitlement: 1e3,
        quotaRemaining: 900,
        creditsUsed: 100
      }
    });
    service.acceptQuotas({
      premiumChat: {
        percentRemaining: 80,
        unlimited: true,
        hasQuota: void 0,
        resetAt: void 0,
        usageBasedBilling: void 0,
        entitlement: void 0,
        quotaRemaining: void 0,
        creditsUsed: void 0
      }
    });
    const merged = service.quotas.premiumChat;
    service.acceptQuotas({
      premiumChat: {
        percentRemaining: 70,
        unlimited: false,
        hasQuota: false,
        resetAt: 200,
        usageBasedBilling: false,
        entitlement: 2e3,
        quotaRemaining: 1300,
        creditsUsed: 700
      }
    });
    const updated = service.quotas.premiumChat;
    service.acceptQuotas({});
    assert.deepStrictEqual({ merged, updated, removed: service.quotas.premiumChat }, {
      merged: {
        percentRemaining: 80,
        unlimited: true,
        hasQuota: true,
        resetAt: 100,
        usageBasedBilling: true,
        entitlement: 1e3,
        quotaRemaining: 900,
        creditsUsed: 100
      },
      updated: {
        percentRemaining: 70,
        unlimited: false,
        hasQuota: false,
        resetAt: 200,
        usageBasedBilling: false,
        entitlement: 2e3,
        quotaRemaining: 1300,
        creditsUsed: 700
      },
      removed: void 0
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcY2hhdEVudGl0bGVtZW50U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSUVudGl0bGVtZW50c0RhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50U2VydmljZSwgcGFyc2VRdW90YXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5cbnN1aXRlKCdwYXJzZVF1b3RhcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBtYWtlRW50aXRsZW1lbnRzRGF0YShvdmVycmlkZXM6IFBhcnRpYWw8SUVudGl0bGVtZW50c0RhdGE+KTogSUVudGl0bGVtZW50c0RhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRhY2Nlc3NfdHlwZV9za3U6ICdwbHVzX21vbnRobHlfc3Vic2NyaWJlcl9xdW90YScsXG5cdFx0XHRjaGF0X2VuYWJsZWQ6IHRydWUsXG5cdFx0XHRhc3NpZ25lZF9kYXRlOiAnMjAyNi0wNC0xN1QxMjo1Mzo0NS0wNzowMCcsXG5cdFx0XHRjYW5fc2lnbnVwX2Zvcl9saW1pdGVkOiBmYWxzZSxcblx0XHRcdGNvcGlsb3RfcGxhbjogJ2luZGl2aWR1YWxfcHJvJyxcblx0XHRcdG9yZ2FuaXphdGlvbl9sb2dpbl9saXN0OiBbXSxcblx0XHRcdGFuYWx5dGljc190cmFja2luZ19pZDogJ3Rlc3QnLFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdyZWFkcyB0b2tlbl9iYXNlZF9iaWxsaW5nIGZyb20gdG9wLWxldmVsLCBub3QgZnJvbSBxdW90YSBzbmFwc2hvdCcsICgpID0+IHtcblx0XHRjb25zdCBkYXRhID0gbWFrZUVudGl0bGVtZW50c0RhdGEoe1xuXHRcdFx0dG9rZW5fYmFzZWRfYmlsbGluZzogdHJ1ZSxcblx0XHRcdHF1b3RhX3NuYXBzaG90czoge1xuXHRcdFx0XHRwcmVtaXVtX2ludGVyYWN0aW9uczoge1xuXHRcdFx0XHRcdG92ZXJhZ2VfY291bnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9lbnRpdGxlbWVudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX3Blcm1pdHRlZDogdHJ1ZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogOTcuNCxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdC8vIG5vIHRva2VuX2Jhc2VkX2JpbGxpbmcgaGVyZSBcdTIwMTQgcGFpZCB1c2VycyBkb24ndCBoYXZlIGl0IHBlci1zbmFwc2hvdFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHF1b3RhcyA9IHBhcnNlUXVvdGFzKGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMucHJlbWl1bUNoYXQ/LnVzYWdlQmFzZWRCaWxsaW5nLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgndXNhZ2VCYXNlZEJpbGxpbmcgaXMgdW5kZWZpbmVkIHdoZW4gdG9wLWxldmVsIHRva2VuX2Jhc2VkX2JpbGxpbmcgaXMgYWJzZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhdGEgPSBtYWtlRW50aXRsZW1lbnRzRGF0YSh7XG5cdFx0XHRxdW90YV9zbmFwc2hvdHM6IHtcblx0XHRcdFx0cHJlbWl1bV9pbnRlcmFjdGlvbnM6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBlcmNlbnRfcmVtYWluaW5nOiA4MCxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHF1b3RhcyA9IHBhcnNlUXVvdGFzKGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMucHJlbWl1bUNoYXQ/LnVzYWdlQmFzZWRCaWxsaW5nLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGwgcXVvdGEgdHlwZXMgcmVjZWl2ZSB0b3AtbGV2ZWwgdG9rZW5fYmFzZWRfYmlsbGluZycsICgpID0+IHtcblx0XHRjb25zdCBkYXRhID0gbWFrZUVudGl0bGVtZW50c0RhdGEoe1xuXHRcdFx0dG9rZW5fYmFzZWRfYmlsbGluZzogdHJ1ZSxcblx0XHRcdHF1b3RhX3NuYXBzaG90czoge1xuXHRcdFx0XHRjaGF0OiB7XG5cdFx0XHRcdFx0b3ZlcmFnZV9jb3VudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX2VudGl0bGVtZW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfcGVybWl0dGVkOiBmYWxzZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogMTAwLFxuXHRcdFx0XHRcdHVubGltaXRlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tcGxldGlvbnM6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBlcmNlbnRfcmVtYWluaW5nOiAxMDAsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcmVtaXVtX2ludGVyYWN0aW9uczoge1xuXHRcdFx0XHRcdG92ZXJhZ2VfY291bnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9lbnRpdGxlbWVudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX3Blcm1pdHRlZDogdHJ1ZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogOTcuNCxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHF1b3RhcyA9IHBhcnNlUXVvdGFzKGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMudXNhZ2VCYXNlZEJpbGxpbmcsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuY2hhdD8udXNhZ2VCYXNlZEJpbGxpbmcsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuY29tcGxldGlvbnM/LnVzYWdlQmFzZWRCaWxsaW5nLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLnByZW1pdW1DaGF0Py51c2FnZUJhc2VkQmlsbGluZywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBwYWlkIHVzZXIgcmVzcG9uc2UgY29ycmVjdGx5ICh0b3AtbGV2ZWwgdG9rZW5fYmFzZWRfYmlsbGluZyBvbmx5KScsICgpID0+IHtcblx0XHRjb25zdCBkYXRhID0gbWFrZUVudGl0bGVtZW50c0RhdGEoe1xuXHRcdFx0cXVvdGFfcmVzZXRfZGF0ZTogJzIwMjYtMDYtMDEnLFxuXHRcdFx0cXVvdGFfcmVzZXRfZGF0ZV91dGM6ICcyMDI2LTA2LTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0dG9rZW5fYmFzZWRfYmlsbGluZzogdHJ1ZSxcblx0XHRcdHF1b3RhX3NuYXBzaG90czoge1xuXHRcdFx0XHRjaGF0OiB7XG5cdFx0XHRcdFx0b3ZlcmFnZV9jb3VudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX2VudGl0bGVtZW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfcGVybWl0dGVkOiBmYWxzZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogMTAwLFxuXHRcdFx0XHRcdHVubGltaXRlZDogdHJ1ZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogJzAnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb21wbGV0aW9uczoge1xuXHRcdFx0XHRcdG92ZXJhZ2VfY291bnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9lbnRpdGxlbWVudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX3Blcm1pdHRlZDogZmFsc2UsXG5cdFx0XHRcdFx0cGVyY2VudF9yZW1haW5pbmc6IDEwMCxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0ZW50aXRsZW1lbnQ6ICcwJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJlbWl1bV9pbnRlcmFjdGlvbnM6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0cGVyY2VudF9yZW1haW5pbmc6IDk3LjQsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogJzM5MDAnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHF1b3RhcyA9IHBhcnNlUXVvdGFzKGRhdGEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVvdGFzLCB7XG5cdFx0XHRyZXNldERhdGU6ICcyMDI2LTA2LTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0cmVzZXREYXRlSGFzVGltZTogdHJ1ZSxcblx0XHRcdHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLFxuXHRcdFx0Y2FuVXBncmFkZVBsYW46IHVuZGVmaW5lZCxcblx0XHRcdGNoYXQ6IHtcblx0XHRcdFx0cGVyY2VudFJlbWFpbmluZzogMTAwLFxuXHRcdFx0XHR1bmxpbWl0ZWQ6IHRydWUsXG5cdFx0XHRcdGhhc1F1b3RhOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLFxuXHRcdFx0XHRyZXNldEF0OiB1bmRlZmluZWQsXG5cdFx0XHRcdGVudGl0bGVtZW50OiAwLFxuXHRcdFx0XHRxdW90YVJlbWFpbmluZzogdW5kZWZpbmVkLFxuXHRcdFx0XHRjcmVkaXRzVXNlZDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdGNvbXBsZXRpb25zOiB7XG5cdFx0XHRcdHBlcmNlbnRSZW1haW5pbmc6IDEwMCxcblx0XHRcdFx0dW5saW1pdGVkOiB0cnVlLFxuXHRcdFx0XHRoYXNRdW90YTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSxcblx0XHRcdFx0cmVzZXRBdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRlbnRpdGxlbWVudDogMCxcblx0XHRcdFx0cXVvdGFSZW1haW5pbmc6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y3JlZGl0c1VzZWQ6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRwcmVtaXVtQ2hhdDoge1xuXHRcdFx0XHRwZXJjZW50UmVtYWluaW5nOiA5Ny40LFxuXHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRoYXNRdW90YTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2FnZUJhc2VkQmlsbGluZzogdHJ1ZSxcblx0XHRcdFx0cmVzZXRBdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRlbnRpdGxlbWVudDogMzkwMCxcblx0XHRcdFx0cXVvdGFSZW1haW5pbmc6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y3JlZGl0c1VzZWQ6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbmFibGVkOiB0cnVlLFxuXHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IDAsXG5cdFx0XHRhZGRpdGlvbmFsVXNhZ2VFbnRpdGxlbWVudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIGZyZWUgdXNlciBDRkkgcmVzcG9uc2Ugd2l0aCBwZXItc25hcHNob3QgdG9rZW5fYmFzZWRfYmlsbGluZycsICgpID0+IHtcblx0XHRjb25zdCBkYXRhID0gbWFrZUVudGl0bGVtZW50c0RhdGEoe1xuXHRcdFx0YWNjZXNzX3R5cGVfc2t1OiAnZnJlZV9saW1pdGVkX2NvcGlsb3QnLFxuXHRcdFx0Y29waWxvdF9wbGFuOiAnZnJlZScsXG5cdFx0XHR0b2tlbl9iYXNlZF9iaWxsaW5nOiB0cnVlLFxuXHRcdFx0cXVvdGFfc25hcHNob3RzOiB7XG5cdFx0XHRcdGNoYXQ6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBlcmNlbnRfcmVtYWluaW5nOiA5OC43LFxuXHRcdFx0XHRcdHVubGltaXRlZDogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbXBsZXRpb25zOiB7XG5cdFx0XHRcdFx0b3ZlcmFnZV9jb3VudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX2VudGl0bGVtZW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfcGVybWl0dGVkOiBmYWxzZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogMTAwLFxuXHRcdFx0XHRcdHVubGltaXRlZDogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByZW1pdW1faW50ZXJhY3Rpb25zOiB7XG5cdFx0XHRcdFx0b3ZlcmFnZV9jb3VudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX2VudGl0bGVtZW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfcGVybWl0dGVkOiBmYWxzZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogMCxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHF1b3RhcyA9IHBhcnNlUXVvdGFzKGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuY2hhdD8udXNhZ2VCYXNlZEJpbGxpbmcsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuY29tcGxldGlvbnM/LnVzYWdlQmFzZWRCaWxsaW5nLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLnByZW1pdW1DaGF0Py51c2FnZUJhc2VkQmlsbGluZywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5wcmVtaXVtQ2hhdD8ucGVyY2VudFJlbWFpbmluZywgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VFbmFibGVkLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIFRCQiBzbmFwc2hvdHM6IHVubGltaXRlZCB3aXRoIHplcm8gZW50aXRsZW1lbnQgYW5kIGZpbml0ZSB3aXRoIG5vbnplcm8gZW50aXRsZW1lbnQgKGhhc19xdW90YSBpcyBhbHdheXMgZmFsc2UpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhdGEgPSBtYWtlRW50aXRsZW1lbnRzRGF0YSh7XG5cdFx0XHRhY2Nlc3NfdHlwZV9za3U6ICdtb250aGx5X3N1YnNjcmliZXJfcXVvdGEnLFxuXHRcdFx0Y29waWxvdF9wbGFuOiAnaW5kaXZpZHVhbCcsXG5cdFx0XHR0b2tlbl9iYXNlZF9iaWxsaW5nOiB0cnVlLFxuXHRcdFx0cXVvdGFfc25hcHNob3RzOiB7XG5cdFx0XHRcdGNoYXQ6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBlcmNlbnRfcmVtYWluaW5nOiAxMDAsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiB0cnVlLFxuXHRcdFx0XHRcdGVudGl0bGVtZW50OiAnMCcsXG5cdFx0XHRcdFx0aGFzX3F1b3RhOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tcGxldGlvbnM6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBlcmNlbnRfcmVtYWluaW5nOiAxMDAsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiB0cnVlLFxuXHRcdFx0XHRcdGVudGl0bGVtZW50OiAnMCcsXG5cdFx0XHRcdFx0aGFzX3F1b3RhOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJlbWl1bV9pbnRlcmFjdGlvbnM6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBlcmNlbnRfcmVtYWluaW5nOiA1LjUsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogJzEwMDAnLFxuXHRcdFx0XHRcdGhhc19xdW90YTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcXVvdGFzID0gcGFyc2VRdW90YXMoZGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5jaGF0Py5wZXJjZW50UmVtYWluaW5nLCAxMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuY2hhdD8udW5saW1pdGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLmNvbXBsZXRpb25zPy5wZXJjZW50UmVtYWluaW5nLCAxMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuY29tcGxldGlvbnM/LnVubGltaXRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5wcmVtaXVtQ2hhdD8ucGVyY2VudFJlbWFpbmluZywgNS41KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLnByZW1pdW1DaGF0Py5lbnRpdGxlbWVudCwgMTAwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGFsbCBzbmFwc2hvdHMgZm9yIENCL0NFIHVzZXJzIHdoZXJlIGFsbCBjYXRlZ29yaWVzIGFyZSB1bmxpbWl0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGF0YSA9IG1ha2VFbnRpdGxlbWVudHNEYXRhKHtcblx0XHRcdGFjY2Vzc190eXBlX3NrdTogJ2NvcGlsb3RfZW50ZXJwcmlzZV9zZWF0X211bHRpX3F1b3RhJyxcblx0XHRcdGNvcGlsb3RfcGxhbjogJ2VudGVycHJpc2UnLFxuXHRcdFx0dG9rZW5fYmFzZWRfYmlsbGluZzogdHJ1ZSxcblx0XHRcdHF1b3RhX3NuYXBzaG90czoge1xuXHRcdFx0XHRjaGF0OiB7XG5cdFx0XHRcdFx0b3ZlcmFnZV9jb3VudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX2VudGl0bGVtZW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfcGVybWl0dGVkOiBmYWxzZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogMTAwLFxuXHRcdFx0XHRcdHVubGltaXRlZDogdHJ1ZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogJzAnLFxuXHRcdFx0XHRcdGhhc19xdW90YTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbXBsZXRpb25zOiB7XG5cdFx0XHRcdFx0b3ZlcmFnZV9jb3VudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX2VudGl0bGVtZW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfcGVybWl0dGVkOiBmYWxzZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogMTAwLFxuXHRcdFx0XHRcdHVubGltaXRlZDogdHJ1ZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogJzAnLFxuXHRcdFx0XHRcdGhhc19xdW90YTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByZW1pdW1faW50ZXJhY3Rpb25zOiB7XG5cdFx0XHRcdFx0b3ZlcmFnZV9jb3VudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX2VudGl0bGVtZW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfcGVybWl0dGVkOiBmYWxzZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogMTAwLFxuXHRcdFx0XHRcdHVubGltaXRlZDogdHJ1ZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogJzAnLFxuXHRcdFx0XHRcdGhhc19xdW90YTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcXVvdGFzID0gcGFyc2VRdW90YXMoZGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5jaGF0Py51bmxpbWl0ZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuY29tcGxldGlvbnM/LnVubGltaXRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5wcmVtaXVtQ2hhdD8udW5saW1pdGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgcXVvdGEgc25hcHNob3RzIHdpdGggemVybyBlbnRpdGxlbWVudCBhbmQgbm90IHVubGltaXRlZCAoZS5nLiBmcmVlIHRpZXIgcHJlbWl1bV9pbnRlcmFjdGlvbnMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhdGEgPSBtYWtlRW50aXRsZW1lbnRzRGF0YSh7XG5cdFx0XHRhY2Nlc3NfdHlwZV9za3U6ICdmcmVlX2xpbWl0ZWRfY29waWxvdCcsXG5cdFx0XHRjb3BpbG90X3BsYW46ICdmcmVlJyxcblx0XHRcdHRva2VuX2Jhc2VkX2JpbGxpbmc6IHRydWUsXG5cdFx0XHRxdW90YV9zbmFwc2hvdHM6IHtcblx0XHRcdFx0Y2hhdDoge1xuXHRcdFx0XHRcdG92ZXJhZ2VfY291bnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9lbnRpdGxlbWVudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX3Blcm1pdHRlZDogZmFsc2UsXG5cdFx0XHRcdFx0cGVyY2VudF9yZW1haW5pbmc6IDk4LjcsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogJzIwMCcsXG5cdFx0XHRcdFx0aGFzX3F1b3RhOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tcGxldGlvbnM6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBlcmNlbnRfcmVtYWluaW5nOiAxMDAsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogJzQwMDAnLFxuXHRcdFx0XHRcdGhhc19xdW90YTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByZW1pdW1faW50ZXJhY3Rpb25zOiB7XG5cdFx0XHRcdFx0b3ZlcmFnZV9jb3VudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX2VudGl0bGVtZW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfcGVybWl0dGVkOiBmYWxzZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogMCxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGVudGl0bGVtZW50OiAnMCcsXG5cdFx0XHRcdFx0aGFzX3F1b3RhOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBxdW90YXMgPSBwYXJzZVF1b3RhcyhkYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLmNoYXQ/LnBlcmNlbnRSZW1haW5pbmcsIDk4LjcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuY2hhdD8uZW50aXRsZW1lbnQsIDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5jb21wbGV0aW9ucz8ucGVyY2VudFJlbWFpbmluZywgMTAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLmNvbXBsZXRpb25zPy5lbnRpdGxlbWVudCwgNDAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5wcmVtaXVtQ2hhdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncG9vbGVkIGVudGl0bGVtZW50cyBleGhhdXN0ZWQgd2hlbiBoYXNfcXVvdGEgaXMgZmFsc2UgYW5kIG92ZXJhZ2VzIGFyZSBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBkYXRhID0gbWFrZUVudGl0bGVtZW50c0RhdGEoe1xuXHRcdFx0YWNjZXNzX3R5cGVfc2t1OiAnY29waWxvdF9lbnRlcnByaXNlX3NlYXRfbXVsdGlfcXVvdGEnLFxuXHRcdFx0Y29waWxvdF9wbGFuOiAnZW50ZXJwcmlzZScsXG5cdFx0XHR0b2tlbl9iYXNlZF9iaWxsaW5nOiB0cnVlLFxuXHRcdFx0cXVvdGFfc25hcHNob3RzOiB7XG5cdFx0XHRcdGNoYXQ6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBlcmNlbnRfcmVtYWluaW5nOiAxMDAsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiB0cnVlLFxuXHRcdFx0XHRcdGVudGl0bGVtZW50OiAnMCcsXG5cdFx0XHRcdFx0aGFzX3F1b3RhOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tcGxldGlvbnM6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBlcmNlbnRfcmVtYWluaW5nOiAxMDAsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiB0cnVlLFxuXHRcdFx0XHRcdGVudGl0bGVtZW50OiAnMCcsXG5cdFx0XHRcdFx0aGFzX3F1b3RhOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJlbWl1bV9pbnRlcmFjdGlvbnM6IHtcblx0XHRcdFx0XHRvdmVyYWdlX2NvdW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfZW50aXRsZW1lbnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHBlcmNlbnRfcmVtYWluaW5nOiAwLFxuXHRcdFx0XHRcdHVubGltaXRlZDogdHJ1ZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogJzAnLFxuXHRcdFx0XHRcdGhhc19xdW90YTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcXVvdGFzID0gcGFyc2VRdW90YXMoZGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5wcmVtaXVtQ2hhdD8uaGFzUXVvdGEsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLnByZW1pdW1DaGF0Py51bmxpbWl0ZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuYWRkaXRpb25hbFVzYWdlRW5hYmxlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdwb29sZWQgZW50aXRsZW1lbnRzIG5vdCBleGhhdXN0ZWQgd2hlbiBoYXNfcXVvdGEgaXMgdHJ1ZScsICgpID0+IHtcblx0XHRjb25zdCBkYXRhID0gbWFrZUVudGl0bGVtZW50c0RhdGEoe1xuXHRcdFx0YWNjZXNzX3R5cGVfc2t1OiAnY29waWxvdF9lbnRlcnByaXNlX3NlYXRfbXVsdGlfcXVvdGEnLFxuXHRcdFx0Y29waWxvdF9wbGFuOiAnZW50ZXJwcmlzZScsXG5cdFx0XHR0b2tlbl9iYXNlZF9iaWxsaW5nOiB0cnVlLFxuXHRcdFx0cXVvdGFfc25hcHNob3RzOiB7XG5cdFx0XHRcdHByZW1pdW1faW50ZXJhY3Rpb25zOiB7XG5cdFx0XHRcdFx0b3ZlcmFnZV9jb3VudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX2VudGl0bGVtZW50OiAwLFxuXHRcdFx0XHRcdG92ZXJhZ2VfcGVybWl0dGVkOiBmYWxzZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogNTAsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiB0cnVlLFxuXHRcdFx0XHRcdGVudGl0bGVtZW50OiAnMCcsXG5cdFx0XHRcdFx0aGFzX3F1b3RhOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHF1b3RhcyA9IHBhcnNlUXVvdGFzKGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMucHJlbWl1bUNoYXQ/Lmhhc1F1b3RhLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLnByZW1pdW1DaGF0Py51bmxpbWl0ZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuYWRkaXRpb25hbFVzYWdlRW5hYmxlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgcXVvdGFfcmVtYWluaW5nIGZyb20gc25hcHNob3QgZGF0YScsICgpID0+IHtcblx0XHRjb25zdCBkYXRhID0gbWFrZUVudGl0bGVtZW50c0RhdGEoe1xuXHRcdFx0dG9rZW5fYmFzZWRfYmlsbGluZzogdHJ1ZSxcblx0XHRcdHF1b3RhX3NuYXBzaG90czoge1xuXHRcdFx0XHRwcmVtaXVtX2ludGVyYWN0aW9uczoge1xuXHRcdFx0XHRcdG92ZXJhZ2VfY291bnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9lbnRpdGxlbWVudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX3Blcm1pdHRlZDogZmFsc2UsXG5cdFx0XHRcdFx0Y3JlZGl0c191c2VkOiA0OTksXG5cdFx0XHRcdFx0cGVyY2VudF9yZW1haW5pbmc6IDcuNSxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGVudGl0bGVtZW50OiAnMjAwMDAnLFxuXHRcdFx0XHRcdHF1b3RhX3JlbWFpbmluZzogMTUwMSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBxdW90YXMgPSBwYXJzZVF1b3RhcyhkYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLnByZW1pdW1DaGF0Py5xdW90YVJlbWFpbmluZywgMTUwMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5wcmVtaXVtQ2hhdD8uZW50aXRsZW1lbnQsIDIwMDAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLnByZW1pdW1DaGF0Py5jcmVkaXRzVXNlZCwgNDk5KTtcblx0fSk7XG5cblx0dGVzdCgncXVvdGFSZW1haW5pbmcgaXMgdW5kZWZpbmVkIHdoZW4gbm90IHByZXNlbnQgaW4gc25hcHNob3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGF0YSA9IG1ha2VFbnRpdGxlbWVudHNEYXRhKHtcblx0XHRcdHF1b3RhX3NuYXBzaG90czoge1xuXHRcdFx0XHRwcmVtaXVtX2ludGVyYWN0aW9uczoge1xuXHRcdFx0XHRcdG92ZXJhZ2VfY291bnQ6IDAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9lbnRpdGxlbWVudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX3Blcm1pdHRlZDogZmFsc2UsXG5cdFx0XHRcdFx0cGVyY2VudF9yZW1haW5pbmc6IDUwLFxuXHRcdFx0XHRcdHVubGltaXRlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZW50aXRsZW1lbnQ6ICcxMDAwJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBxdW90YXMgPSBwYXJzZVF1b3RhcyhkYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLnByZW1pdW1DaGF0Py5xdW90YVJlbWFpbmluZywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncG9vbGVkIGVudGl0bGVtZW50cyBub3QgZXhoYXVzdGVkIHdoZW4gb3ZlcmFnZXMgYXJlIGVuYWJsZWQgZXZlbiBpZiBoYXNfcXVvdGEgaXMgZmFsc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGF0YSA9IG1ha2VFbnRpdGxlbWVudHNEYXRhKHtcblx0XHRcdGFjY2Vzc190eXBlX3NrdTogJ2NvcGlsb3RfZW50ZXJwcmlzZV9zZWF0X211bHRpX3F1b3RhJyxcblx0XHRcdGNvcGlsb3RfcGxhbjogJ2VudGVycHJpc2UnLFxuXHRcdFx0dG9rZW5fYmFzZWRfYmlsbGluZzogdHJ1ZSxcblx0XHRcdHF1b3RhX3NuYXBzaG90czoge1xuXHRcdFx0XHRwcmVtaXVtX2ludGVyYWN0aW9uczoge1xuXHRcdFx0XHRcdG92ZXJhZ2VfY291bnQ6IDUsXG5cdFx0XHRcdFx0b3ZlcmFnZV9lbnRpdGxlbWVudDogMCxcblx0XHRcdFx0XHRvdmVyYWdlX3Blcm1pdHRlZDogdHJ1ZSxcblx0XHRcdFx0XHRwZXJjZW50X3JlbWFpbmluZzogMCxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0ZW50aXRsZW1lbnQ6ICcwJyxcblx0XHRcdFx0XHRoYXNfcXVvdGE6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHF1b3RhcyA9IHBhcnNlUXVvdGFzKGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMucHJlbWl1bUNoYXQ/Lmhhc1F1b3RhLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1b3Rhcy5hZGRpdGlvbmFsVXNhZ2VFbmFibGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIG92ZXJhZ2VfZW50aXRsZW1lbnQgZnJvbSBwcmVtaXVtX2ludGVyYWN0aW9ucyBzbmFwc2hvdCcsICgpID0+IHtcblx0XHRjb25zdCBkYXRhID0gbWFrZUVudGl0bGVtZW50c0RhdGEoe1xuXHRcdFx0dG9rZW5fYmFzZWRfYmlsbGluZzogdHJ1ZSxcblx0XHRcdHF1b3RhX3NuYXBzaG90czoge1xuXHRcdFx0XHRwcmVtaXVtX2ludGVyYWN0aW9uczoge1xuXHRcdFx0XHRcdG92ZXJhZ2VfY291bnQ6IDMsXG5cdFx0XHRcdFx0b3ZlcmFnZV9lbnRpdGxlbWVudDogNTAsXG5cdFx0XHRcdFx0b3ZlcmFnZV9wZXJtaXR0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0cGVyY2VudF9yZW1haW5pbmc6IDAsXG5cdFx0XHRcdFx0dW5saW1pdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRlbnRpdGxlbWVudDogJzM5MDAnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHF1b3RhcyA9IHBhcnNlUXVvdGFzKGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdW90YXMuYWRkaXRpb25hbFVzYWdlRW50aXRsZW1lbnQsIDUwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLmFkZGl0aW9uYWxVc2FnZUNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVvdGFzLmFkZGl0aW9uYWxVc2FnZUVuYWJsZWQsIHRydWUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdEVudGl0bGVtZW50U2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKCk6IENoYXRFbnRpdGxlbWVudFNlcnZpY2Uge1xuXHRcdHJldHVybiBzdG9yZS5hZGQobmV3IENoYXRFbnRpdGxlbWVudFNlcnZpY2UoXG5cdFx0XHRzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb2R1Y3RTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZT4oKSB7IH0sXG5cdFx0XHRzdG9yZS5hZGQobmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRzdG9yZS5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSxcblx0XHQpKTtcblx0fVxuXG5cdHRlc3QoJ21lcmdlcyBkZWZpbmVkIHNuYXBzaG90IGZpZWxkcyB1bnRpbCB0aGUgc25hcHNob3QgaXMgcmVtb3ZlZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2UuYWNjZXB0UXVvdGFzKHtcblx0XHRcdHByZW1pdW1DaGF0OiB7XG5cdFx0XHRcdHBlcmNlbnRSZW1haW5pbmc6IDkwLFxuXHRcdFx0XHR1bmxpbWl0ZWQ6IHRydWUsXG5cdFx0XHRcdGhhc1F1b3RhOiB0cnVlLFxuXHRcdFx0XHRyZXNldEF0OiAxMDAsXG5cdFx0XHRcdHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLFxuXHRcdFx0XHRlbnRpdGxlbWVudDogMTAwMCxcblx0XHRcdFx0cXVvdGFSZW1haW5pbmc6IDkwMCxcblx0XHRcdFx0Y3JlZGl0c1VzZWQ6IDEwMCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRzZXJ2aWNlLmFjY2VwdFF1b3Rhcyh7XG5cdFx0XHRwcmVtaXVtQ2hhdDoge1xuXHRcdFx0XHRwZXJjZW50UmVtYWluaW5nOiA4MCxcblx0XHRcdFx0dW5saW1pdGVkOiB0cnVlLFxuXHRcdFx0XHRoYXNRdW90YTogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXNldEF0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzYWdlQmFzZWRCaWxsaW5nOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVudGl0bGVtZW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdHF1b3RhUmVtYWluaW5nOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNyZWRpdHNVc2VkOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IG1lcmdlZCA9IHNlcnZpY2UucXVvdGFzLnByZW1pdW1DaGF0O1xuXG5cdFx0c2VydmljZS5hY2NlcHRRdW90YXMoe1xuXHRcdFx0cHJlbWl1bUNoYXQ6IHtcblx0XHRcdFx0cGVyY2VudFJlbWFpbmluZzogNzAsXG5cdFx0XHRcdHVubGltaXRlZDogZmFsc2UsXG5cdFx0XHRcdGhhc1F1b3RhOiBmYWxzZSxcblx0XHRcdFx0cmVzZXRBdDogMjAwLFxuXHRcdFx0XHR1c2FnZUJhc2VkQmlsbGluZzogZmFsc2UsXG5cdFx0XHRcdGVudGl0bGVtZW50OiAyMDAwLFxuXHRcdFx0XHRxdW90YVJlbWFpbmluZzogMTMwMCxcblx0XHRcdFx0Y3JlZGl0c1VzZWQ6IDcwMCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgdXBkYXRlZCA9IHNlcnZpY2UucXVvdGFzLnByZW1pdW1DaGF0O1xuXG5cdFx0c2VydmljZS5hY2NlcHRRdW90YXMoe30pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG1lcmdlZCwgdXBkYXRlZCwgcmVtb3ZlZDogc2VydmljZS5xdW90YXMucHJlbWl1bUNoYXQgfSwge1xuXHRcdFx0bWVyZ2VkOiB7XG5cdFx0XHRcdHBlcmNlbnRSZW1haW5pbmc6IDgwLFxuXHRcdFx0XHR1bmxpbWl0ZWQ6IHRydWUsXG5cdFx0XHRcdGhhc1F1b3RhOiB0cnVlLFxuXHRcdFx0XHRyZXNldEF0OiAxMDAsXG5cdFx0XHRcdHVzYWdlQmFzZWRCaWxsaW5nOiB0cnVlLFxuXHRcdFx0XHRlbnRpdGxlbWVudDogMTAwMCxcblx0XHRcdFx0cXVvdGFSZW1haW5pbmc6IDkwMCxcblx0XHRcdFx0Y3JlZGl0c1VzZWQ6IDEwMCxcblx0XHRcdH0sXG5cdFx0XHR1cGRhdGVkOiB7XG5cdFx0XHRcdHBlcmNlbnRSZW1haW5pbmc6IDcwLFxuXHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRoYXNRdW90YTogZmFsc2UsXG5cdFx0XHRcdHJlc2V0QXQ6IDIwMCxcblx0XHRcdFx0dXNhZ2VCYXNlZEJpbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRlbnRpdGxlbWVudDogMjAwMCxcblx0XHRcdFx0cXVvdGFSZW1haW5pbmc6IDEzMDAsXG5cdFx0XHRcdGNyZWRpdHNVc2VkOiA3MDAsXG5cdFx0XHR9LFxuXHRcdFx0cmVtb3ZlZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHdCQUF3QixtQkFBbUI7QUFFcEQsU0FBUywwQkFBMEI7QUFFbkMsTUFBTSxlQUFlLE1BQU07QUFFMUIsMENBQXdDO0FBRXhDLFdBQVMscUJBQXFCLFdBQTBEO0FBQ3ZGLFdBQU87QUFBQSxNQUNOLGlCQUFpQjtBQUFBLE1BQ2pCLGNBQWM7QUFB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
