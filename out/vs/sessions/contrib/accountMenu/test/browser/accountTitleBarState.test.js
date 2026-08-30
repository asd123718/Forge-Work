import assert from "assert";
import { FileAccess } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ChatEntitlement } from "../../../../../workbench/services/chat/common/chatEntitlementService.js";
import { getAccountProfileImageUrl, getAccountTitleBarBadgeKey, getAccountTitleBarState, resolveAccountInfo } from "../../../../browser/accountTitleBarState.js";
suite("Sessions - Account Title Bar State", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createState(overrides = {}) {
    return {
      isAccountLoading: false,
      accountName: "lee@example.com",
      accountProviderLabel: "GitHub",
      entitlement: ChatEntitlement.Pro,
      sentiment: {},
      quotas: {},
      allowSignedOutWhenUsable: false,
      ...overrides
    };
  }
  test("shows low token badge for Copilot Free users", () => {
    const state = getAccountTitleBarState(createState({
      entitlement: ChatEntitlement.Free,
      quotas: { chat: { percentRemaining: 10, unlimited: false } }
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      badge: state.badge,
      dotBadge: state.dotBadge,
      kind: state.kind
    }, {
      source: "copilot",
      label: "Tokens Remaining",
      badge: "10%",
      dotBadge: "error",
      kind: "warning"
    });
    assert.strictEqual(getAccountTitleBarBadgeKey(state), "copilot:error:10%");
  });
  test("shows warning dot badge for low but non-critical tokens", () => {
    const state = getAccountTitleBarState(createState({
      entitlement: ChatEntitlement.Free,
      quotas: { chat: { percentRemaining: 20, unlimited: false } }
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      badge: state.badge,
      dotBadge: state.dotBadge,
      kind: state.kind
    }, {
      source: "copilot",
      label: "Tokens Remaining",
      badge: "20%",
      dotBadge: "warning",
      kind: "accent"
    });
  });
  test("shows quota reached warning when free quota is exhausted", () => {
    const state = getAccountTitleBarState(createState({
      entitlement: ChatEntitlement.Free,
      quotas: { completions: { percentRemaining: 0, unlimited: false } }
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      dotBadge: state.dotBadge,
      kind: state.kind
    }, {
      source: "copilot",
      label: "Quota Reached",
      dotBadge: "error",
      kind: "warning"
    });
    assert.strictEqual(getAccountTitleBarBadgeKey(state), "copilot:error:");
  });
  test("falls back to signed-in account label when no higher-priority state exists", () => {
    const state = getAccountTitleBarState(createState());
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      kind: state.kind,
      revealLabelOnHover: state.revealLabelOnHover
    }, {
      source: "account",
      label: "lee@example.com",
      kind: "default",
      revealLabelOnHover: true
    });
  });
  test("reveals loading account label only on hover", () => {
    const state = getAccountTitleBarState(createState({
      isAccountLoading: true,
      accountName: void 0,
      accountProviderLabel: void 0,
      entitlement: ChatEntitlement.Unknown
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      kind: state.kind,
      revealLabelOnHover: state.revealLabelOnHover
    }, {
      source: "account",
      label: "Loading Account...",
      kind: "default",
      revealLabelOnHover: true
    });
  });
  test("shows sign in state when no account is available", () => {
    const state = getAccountTitleBarState(createState({
      accountName: void 0,
      accountProviderLabel: void 0,
      entitlement: ChatEntitlement.Unknown
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      kind: state.kind
    }, {
      source: "copilot",
      label: "Agents Signed Out",
      kind: "prominent"
    });
  });
  test("offers a calm opt-in sign-in when signed-out operation is enabled", () => {
    const state = getAccountTitleBarState(createState({
      accountName: void 0,
      accountProviderLabel: void 0,
      entitlement: ChatEntitlement.Unknown,
      allowSignedOutWhenUsable: true
    }));
    assert.deepStrictEqual({
      source: state.source,
      label: state.label,
      kind: state.kind
    }, {
      source: "copilot",
      label: "Sign In",
      kind: "default"
    });
  });
  test("returns a GitHub profile image URL for GitHub accounts", () => {
    assert.strictEqual(
      getAccountProfileImageUrl("github", "mona lisa"),
      "https://github.com/mona%20lisa.png?size=64"
    );
  });
  test("prefers the account icon supplied by the authentication provider", () => {
    assert.strictEqual(
      getAccountProfileImageUrl("github", "mona lisa", URI.parse("https://avatars.githubusercontent.com/u/1?v=4")),
      "https://avatars.githubusercontent.com/u/1?v=4"
    );
    assert.strictEqual(
      getAccountProfileImageUrl("github-enterprise", "octocat", URI.parse("https://example.com/avatar.png")),
      "https://example.com/avatar.png"
    );
  });
  test("converts a provider supplied file icon into a browser safe URL", () => {
    const icon = URI.file("/home/octocat/avatar.png");
    assert.strictEqual(
      getAccountProfileImageUrl("github", "octocat", icon),
      FileAccess.uriToBrowserUri(icon).toString(true)
    );
  });
  test("falls back to the codicon when no GitHub profile image URL is available", () => {
    assert.strictEqual(getAccountProfileImageUrl(void 0, "octocat"), void 0);
    assert.strictEqual(getAccountProfileImageUrl("github-enterprise", "octocat"), void 0);
    assert.strictEqual(getAccountProfileImageUrl("github", void 0), void 0);
  });
  test("resolves the default account icon by session id, not by label", async () => {
    const sessions = [
      { id: "stale-session", accessToken: "token", scopes: ["scope"], account: { id: "account", label: "octocat", icon: URI.parse("https://example.com/stale.png") } },
      { id: "default-session", accessToken: "token", scopes: ["scope"], account: { id: "account", label: "octocat", icon: URI.parse("https://example.com/default.png") } }
    ];
    const defaultAccountService = new class extends mock() {
      async getDefaultAccount() {
        return {
          authenticationProvider: { id: "github", name: "GitHub", enterprise: false },
          accountName: "octocat",
          sessionId: "default-session",
          enterprise: false
        };
      }
    }();
    const authenticationService = new class extends mock() {
      async getSessions() {
        return sessions;
      }
    }();
    assert.deepStrictEqual(
      await resolveAccountInfo(defaultAccountService, authenticationService),
      {
        accountName: "octocat",
        accountProviderId: "github",
        accountProviderLabel: "GitHub",
        accountIcon: URI.parse("https://example.com/default.png")
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWNjb3VudE1lbnVcXHRlc3RcXGJyb3dzZXJcXGFjY291bnRUaXRsZUJhclN0YXRlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uLCBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRBY2NvdW50UHJvZmlsZUltYWdlVXJsLCBnZXRBY2NvdW50VGl0bGVCYXJCYWRnZUtleSwgZ2V0QWNjb3VudFRpdGxlQmFyU3RhdGUsIElBY2NvdW50VGl0bGVCYXJTdGF0ZUNvbnRleHQsIHJlc29sdmVBY2NvdW50SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvYWNjb3VudFRpdGxlQmFyU3RhdGUuanMnO1xuXG5zdWl0ZSgnU2Vzc2lvbnMgLSBBY2NvdW50IFRpdGxlIEJhciBTdGF0ZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTdGF0ZShvdmVycmlkZXM6IFBhcnRpYWw8SUFjY291bnRUaXRsZUJhclN0YXRlQ29udGV4dD4gPSB7fSk6IElBY2NvdW50VGl0bGVCYXJTdGF0ZUNvbnRleHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpc0FjY291bnRMb2FkaW5nOiBmYWxzZSxcblx0XHRcdGFjY291bnROYW1lOiAnbGVlQGV4YW1wbGUuY29tJyxcblx0XHRcdGFjY291bnRQcm92aWRlckxhYmVsOiAnR2l0SHViJyxcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuUHJvLFxuXHRcdFx0c2VudGltZW50OiB7fSxcblx0XHRcdHF1b3Rhczoge30sXG5cdFx0XHRhbGxvd1NpZ25lZE91dFdoZW5Vc2FibGU6IGZhbHNlLFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdzaG93cyBsb3cgdG9rZW4gYmFkZ2UgZm9yIENvcGlsb3QgRnJlZSB1c2VycycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGdldEFjY291bnRUaXRsZUJhclN0YXRlKGNyZWF0ZVN0YXRlKHtcblx0XHRcdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHRcdHF1b3RhczogeyBjaGF0OiB7IHBlcmNlbnRSZW1haW5pbmc6IDEwLCB1bmxpbWl0ZWQ6IGZhbHNlIH0gfSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNvdXJjZTogc3RhdGUuc291cmNlLFxuXHRcdFx0bGFiZWw6IHN0YXRlLmxhYmVsLFxuXHRcdFx0YmFkZ2U6IHN0YXRlLmJhZGdlLFxuXHRcdFx0ZG90QmFkZ2U6IHN0YXRlLmRvdEJhZGdlLFxuXHRcdFx0a2luZDogc3RhdGUua2luZCxcblx0XHR9LCB7XG5cdFx0XHRzb3VyY2U6ICdjb3BpbG90Jyxcblx0XHRcdGxhYmVsOiAnVG9rZW5zIFJlbWFpbmluZycsXG5cdFx0XHRiYWRnZTogJzEwJScsXG5cdFx0XHRkb3RCYWRnZTogJ2Vycm9yJyxcblx0XHRcdGtpbmQ6ICd3YXJuaW5nJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBY2NvdW50VGl0bGVCYXJCYWRnZUtleShzdGF0ZSksICdjb3BpbG90OmVycm9yOjEwJScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyB3YXJuaW5nIGRvdCBiYWRnZSBmb3IgbG93IGJ1dCBub24tY3JpdGljYWwgdG9rZW5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gZ2V0QWNjb3VudFRpdGxlQmFyU3RhdGUoY3JlYXRlU3RhdGUoe1xuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5GcmVlLFxuXHRcdFx0cXVvdGFzOiB7IGNoYXQ6IHsgcGVyY2VudFJlbWFpbmluZzogMjAsIHVubGltaXRlZDogZmFsc2UgfSB9LFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c291cmNlOiBzdGF0ZS5zb3VyY2UsXG5cdFx0XHRsYWJlbDogc3RhdGUubGFiZWwsXG5cdFx0XHRiYWRnZTogc3RhdGUuYmFkZ2UsXG5cdFx0XHRkb3RCYWRnZTogc3RhdGUuZG90QmFkZ2UsXG5cdFx0XHRraW5kOiBzdGF0ZS5raW5kLFxuXHRcdH0sIHtcblx0XHRcdHNvdXJjZTogJ2NvcGlsb3QnLFxuXHRcdFx0bGFiZWw6ICdUb2tlbnMgUmVtYWluaW5nJyxcblx0XHRcdGJhZGdlOiAnMjAlJyxcblx0XHRcdGRvdEJhZGdlOiAnd2FybmluZycsXG5cdFx0XHRraW5kOiAnYWNjZW50Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgcXVvdGEgcmVhY2hlZCB3YXJuaW5nIHdoZW4gZnJlZSBxdW90YSBpcyBleGhhdXN0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZShjcmVhdGVTdGF0ZSh7XG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkZyZWUsXG5cdFx0XHRxdW90YXM6IHsgY29tcGxldGlvbnM6IHsgcGVyY2VudFJlbWFpbmluZzogMCwgdW5saW1pdGVkOiBmYWxzZSB9IH0sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzb3VyY2U6IHN0YXRlLnNvdXJjZSxcblx0XHRcdGxhYmVsOiBzdGF0ZS5sYWJlbCxcblx0XHRcdGRvdEJhZGdlOiBzdGF0ZS5kb3RCYWRnZSxcblx0XHRcdGtpbmQ6IHN0YXRlLmtpbmQsXG5cdFx0fSwge1xuXHRcdFx0c291cmNlOiAnY29waWxvdCcsXG5cdFx0XHRsYWJlbDogJ1F1b3RhIFJlYWNoZWQnLFxuXHRcdFx0ZG90QmFkZ2U6ICdlcnJvcicsXG5cdFx0XHRraW5kOiAnd2FybmluZycsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QWNjb3VudFRpdGxlQmFyQmFkZ2VLZXkoc3RhdGUpLCAnY29waWxvdDplcnJvcjonKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBzaWduZWQtaW4gYWNjb3VudCBsYWJlbCB3aGVuIG5vIGhpZ2hlci1wcmlvcml0eSBzdGF0ZSBleGlzdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZShjcmVhdGVTdGF0ZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c291cmNlOiBzdGF0ZS5zb3VyY2UsXG5cdFx0XHRsYWJlbDogc3RhdGUubGFiZWwsXG5cdFx0XHRraW5kOiBzdGF0ZS5raW5kLFxuXHRcdFx0cmV2ZWFsTGFiZWxPbkhvdmVyOiBzdGF0ZS5yZXZlYWxMYWJlbE9uSG92ZXIsXG5cdFx0fSwge1xuXHRcdFx0c291cmNlOiAnYWNjb3VudCcsXG5cdFx0XHRsYWJlbDogJ2xlZUBleGFtcGxlLmNvbScsXG5cdFx0XHRraW5kOiAnZGVmYXVsdCcsXG5cdFx0XHRyZXZlYWxMYWJlbE9uSG92ZXI6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVhbHMgbG9hZGluZyBhY2NvdW50IGxhYmVsIG9ubHkgb24gaG92ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBnZXRBY2NvdW50VGl0bGVCYXJTdGF0ZShjcmVhdGVTdGF0ZSh7XG5cdFx0XHRpc0FjY291bnRMb2FkaW5nOiB0cnVlLFxuXHRcdFx0YWNjb3VudE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdGFjY291bnRQcm92aWRlckxhYmVsOiB1bmRlZmluZWQsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlVua25vd24sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzb3VyY2U6IHN0YXRlLnNvdXJjZSxcblx0XHRcdGxhYmVsOiBzdGF0ZS5sYWJlbCxcblx0XHRcdGtpbmQ6IHN0YXRlLmtpbmQsXG5cdFx0XHRyZXZlYWxMYWJlbE9uSG92ZXI6IHN0YXRlLnJldmVhbExhYmVsT25Ib3Zlcixcblx0XHR9LCB7XG5cdFx0XHRzb3VyY2U6ICdhY2NvdW50Jyxcblx0XHRcdGxhYmVsOiAnTG9hZGluZyBBY2NvdW50Li4uJyxcblx0XHRcdGtpbmQ6ICdkZWZhdWx0Jyxcblx0XHRcdHJldmVhbExhYmVsT25Ib3ZlcjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3Mgc2lnbiBpbiBzdGF0ZSB3aGVuIG5vIGFjY291bnQgaXMgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gZ2V0QWNjb3VudFRpdGxlQmFyU3RhdGUoY3JlYXRlU3RhdGUoe1xuXHRcdFx0YWNjb3VudE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdGFjY291bnRQcm92aWRlckxhYmVsOiB1bmRlZmluZWQsXG5cdFx0XHRlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlVua25vd24sXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzb3VyY2U6IHN0YXRlLnNvdXJjZSxcblx0XHRcdGxhYmVsOiBzdGF0ZS5sYWJlbCxcblx0XHRcdGtpbmQ6IHN0YXRlLmtpbmQsXG5cdFx0fSwge1xuXHRcdFx0c291cmNlOiAnY29waWxvdCcsXG5cdFx0XHRsYWJlbDogJ0FnZW50cyBTaWduZWQgT3V0Jyxcblx0XHRcdGtpbmQ6ICdwcm9taW5lbnQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvZmZlcnMgYSBjYWxtIG9wdC1pbiBzaWduLWluIHdoZW4gc2lnbmVkLW91dCBvcGVyYXRpb24gaXMgZW5hYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGdldEFjY291bnRUaXRsZUJhclN0YXRlKGNyZWF0ZVN0YXRlKHtcblx0XHRcdGFjY291bnROYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRhY2NvdW50UHJvdmlkZXJMYWJlbDogdW5kZWZpbmVkLFxuXHRcdFx0ZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudC5Vbmtub3duLFxuXHRcdFx0YWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlOiB0cnVlLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c291cmNlOiBzdGF0ZS5zb3VyY2UsXG5cdFx0XHRsYWJlbDogc3RhdGUubGFiZWwsXG5cdFx0XHRraW5kOiBzdGF0ZS5raW5kLFxuXHRcdH0sIHtcblx0XHRcdHNvdXJjZTogJ2NvcGlsb3QnLFxuXHRcdFx0bGFiZWw6ICdTaWduIEluJyxcblx0XHRcdGtpbmQ6ICdkZWZhdWx0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhIEdpdEh1YiBwcm9maWxlIGltYWdlIFVSTCBmb3IgR2l0SHViIGFjY291bnRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGdldEFjY291bnRQcm9maWxlSW1hZ2VVcmwoJ2dpdGh1YicsICdtb25hIGxpc2EnKSxcblx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbW9uYSUyMGxpc2EucG5nP3NpemU9NjQnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVycyB0aGUgYWNjb3VudCBpY29uIHN1cHBsaWVkIGJ5IHRoZSBhdXRoZW50aWNhdGlvbiBwcm92aWRlcicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRnZXRBY2NvdW50UHJvZmlsZUltYWdlVXJsKCdnaXRodWInLCAnbW9uYSBsaXNhJywgVVJJLnBhcnNlKCdodHRwczovL2F2YXRhcnMuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3UvMT92PTQnKSksXG5cdFx0XHQnaHR0cHM6Ly9hdmF0YXJzLmdpdGh1YnVzZXJjb250ZW50LmNvbS91LzE/dj00J1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Z2V0QWNjb3VudFByb2ZpbGVJbWFnZVVybCgnZ2l0aHViLWVudGVycHJpc2UnLCAnb2N0b2NhdCcsIFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9hdmF0YXIucG5nJykpLFxuXHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20vYXZhdGFyLnBuZydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBhIHByb3ZpZGVyIHN1cHBsaWVkIGZpbGUgaWNvbiBpbnRvIGEgYnJvd3NlciBzYWZlIFVSTCcsICgpID0+IHtcblx0XHRjb25zdCBpY29uID0gVVJJLmZpbGUoJy9ob21lL29jdG9jYXQvYXZhdGFyLnBuZycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Z2V0QWNjb3VudFByb2ZpbGVJbWFnZVVybCgnZ2l0aHViJywgJ29jdG9jYXQnLCBpY29uKSxcblx0XHRcdEZpbGVBY2Nlc3MudXJpVG9Ccm93c2VyVXJpKGljb24pLnRvU3RyaW5nKHRydWUpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgY29kaWNvbiB3aGVuIG5vIEdpdEh1YiBwcm9maWxlIGltYWdlIFVSTCBpcyBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFjY291bnRQcm9maWxlSW1hZ2VVcmwodW5kZWZpbmVkLCAnb2N0b2NhdCcpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBY2NvdW50UHJvZmlsZUltYWdlVXJsKCdnaXRodWItZW50ZXJwcmlzZScsICdvY3RvY2F0JyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFjY291bnRQcm9maWxlSW1hZ2VVcmwoJ2dpdGh1YicsIHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHRoZSBkZWZhdWx0IGFjY291bnQgaWNvbiBieSBzZXNzaW9uIGlkLCBub3QgYnkgbGFiZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnM6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdID0gW1xuXHRcdFx0eyBpZDogJ3N0YWxlLXNlc3Npb24nLCBhY2Nlc3NUb2tlbjogJ3Rva2VuJywgc2NvcGVzOiBbJ3Njb3BlJ10sIGFjY291bnQ6IHsgaWQ6ICdhY2NvdW50JywgbGFiZWw6ICdvY3RvY2F0JywgaWNvbjogVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3N0YWxlLnBuZycpIH0gfSxcblx0XHRcdHsgaWQ6ICdkZWZhdWx0LXNlc3Npb24nLCBhY2Nlc3NUb2tlbjogJ3Rva2VuJywgc2NvcGVzOiBbJ3Njb3BlJ10sIGFjY291bnQ6IHsgaWQ6ICdhY2NvdW50JywgbGFiZWw6ICdvY3RvY2F0JywgaWNvbjogVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL2RlZmF1bHQucG5nJykgfSB9LFxuXHRcdF07XG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGVmYXVsdEFjY291bnRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldERlZmF1bHRBY2NvdW50KCk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0YXV0aGVudGljYXRpb25Qcm92aWRlcjogeyBpZDogJ2dpdGh1YicsIG5hbWU6ICdHaXRIdWInLCBlbnRlcnByaXNlOiBmYWxzZSB9LFxuXHRcdFx0XHRcdGFjY291bnROYW1lOiAnb2N0b2NhdCcsXG5cdFx0XHRcdFx0c2Vzc2lvbklkOiAnZGVmYXVsdC1zZXNzaW9uJyxcblx0XHRcdFx0XHRlbnRlcnByaXNlOiBmYWxzZSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dGhlbnRpY2F0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBnZXRTZXNzaW9ucygpOiBQcm9taXNlPFJlYWRvbmx5QXJyYXk8QXV0aGVudGljYXRpb25TZXNzaW9uPj4ge1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbnM7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCByZXNvbHZlQWNjb3VudEluZm8oZGVmYXVsdEFjY291bnRTZXJ2aWNlLCBhdXRoZW50aWNhdGlvblNlcnZpY2UpLFxuXHRcdFx0e1xuXHRcdFx0XHRhY2NvdW50TmFtZTogJ29jdG9jYXQnLFxuXHRcdFx0XHRhY2NvdW50UHJvdmlkZXJJZDogJ2dpdGh1YicsXG5cdFx0XHRcdGFjY291bnRQcm92aWRlckxhYmVsOiAnR2l0SHViJyxcblx0XHRcdFx0YWNjb3VudEljb246IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9kZWZhdWx0LnBuZycpLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUd4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQiw0QkFBNEIseUJBQXVELDBCQUEwQjtBQUVqSixNQUFNLHNDQUFzQyxNQUFNO0FBRWpELDBDQUF3QztBQUV4QyxXQUFTLFlBQVksWUFBbUQsQ0FBQyxHQUFpQztBQUN6RyxXQUFPO0FBQUEsTUFDTixrQkFBa0I7QUFBQSxNQUNsQixhQUFhO0FBQUEsTUFDYixzQkFBc0I7QUFBQSxNQUN0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
