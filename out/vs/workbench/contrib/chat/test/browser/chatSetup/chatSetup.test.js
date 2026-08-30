import assert from "assert";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TelemetryLevel } from "../../../../../../platform/telemetry/common/telemetry.js";
import { ChatEntitlement } from "../../../../../services/chat/common/chatEntitlementService.js";
import { buildUpgradeUrlWithRedirect, ChatSetupStrategy } from "../../../browser/chatSetup/chatSetup.js";
import { ChatSetup, getChatSetupDialogButtons, getChatSetupDialogFooter, showChatSetupDialogWithCancellation } from "../../../browser/chatSetup/chatSetupRunner.js";
function parseRedirectUrl(url) {
  const questionIdx = url.indexOf("return_to=");
  const returnTo = decodeURIComponent(url.slice(questionIdx + "return_to=".length));
  const redirectUrl = new URL(returnTo);
  const vscodeUri = decodeURIComponent(redirectUrl.searchParams.get("url"));
  return { returnTo, redirectHost: redirectUrl.host, vscodeUri };
}
suite("buildUpgradeUrlWithRedirect", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("stable quality uses vscode.dev host", () => {
    const result = buildUpgradeUrlWithRedirect(
      "https://github.com/github-copilot/upgrade?utm_source=vscode",
      "vscode",
      "stable"
    );
    const { redirectHost, vscodeUri } = parseRedirectUrl(result);
    assert.strictEqual(redirectHost, "vscode.dev");
    assert.strictEqual(vscodeUri, "vscode://GitHub.copilot-chat/upgrade-success");
  });
  test("insider quality uses insiders.vscode.dev host", () => {
    const result = buildUpgradeUrlWithRedirect(
      "https://github.com/github-copilot/upgrade?utm_source=vscode",
      "vscode-insiders",
      "insider"
    );
    const { redirectHost, vscodeUri } = parseRedirectUrl(result);
    assert.strictEqual(redirectHost, "insiders.vscode.dev");
    assert.strictEqual(vscodeUri, "vscode-insiders://GitHub.copilot-chat/upgrade-success");
  });
  test("undefined quality defaults to insiders.vscode.dev host", () => {
    const result = buildUpgradeUrlWithRedirect(
      "https://github.com/github-copilot/upgrade?utm_source=vscode",
      "code-oss",
      void 0
    );
    const { redirectHost, vscodeUri } = parseRedirectUrl(result);
    assert.strictEqual(redirectHost, "insiders.vscode.dev");
    assert.strictEqual(vscodeUri, "code-oss://GitHub.copilot-chat/upgrade-success");
  });
  test("appends with & when base URL already has query params", () => {
    const result = buildUpgradeUrlWithRedirect(
      "https://github.com/github-copilot/upgrade?utm_source=vscode",
      "vscode",
      "stable"
    );
    assert.ok(result.startsWith("https://github.com/github-copilot/upgrade?utm_source=vscode&return_to="));
  });
  test("appends with ? when base URL has no query params", () => {
    const result = buildUpgradeUrlWithRedirect(
      "https://github.com/github-copilot/upgrade",
      "vscode",
      "stable"
    );
    assert.ok(result.startsWith("https://github.com/github-copilot/upgrade?return_to="));
  });
  test("GHE URL is handled correctly", () => {
    const result = buildUpgradeUrlWithRedirect(
      "https://github.example.com/github-copilot/upgrade?utm_source=vscode",
      "vscode",
      "stable"
    );
    assert.ok(result.startsWith("https://github.example.com/github-copilot/upgrade?utm_source=vscode&return_to="));
    const { vscodeUri } = parseRedirectUrl(result);
    assert.strictEqual(vscodeUri, "vscode://GitHub.copilot-chat/upgrade-success");
  });
});
suite("Chat setup dialog presentation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("places signed-out continuation after providers", () => {
    const buttons = getChatSetupDialogButtons(ChatEntitlement.Unknown, { allowContinueWithoutSignIn: true }, false, {
      default: { name: "GitHub" },
      enterprise: { name: "GHE" },
      google: { name: "Google" },
      apple: { name: "Apple" }
    });
    const footer = getChatSetupDialogFooter(void 0, TelemetryLevel.USAGE, "https://example.com/settings", {
      providerName: "GitHub",
      termsStatementUrl: "https://example.com/terms",
      privacyStatementUrl: "https://example.com/privacy",
      publicCodeMatchesUrl: "https://example.com/public-code"
    });
    assert.deepStrictEqual({
      buttonLabels: buttons.map((button) => button.label),
      lastButton: buttons.at(-1),
      footer
    }, {
      buttonLabels: ["Continue with GitHub", "Continue with Google", "Continue with Apple", "Continue with GHE", "Continue Without Signing In"],
      lastButton: {
        label: "Continue Without Signing In",
        strategy: ChatSetupStrategy.Canceled,
        classes: ["link-button"]
      },
      footer: "By continuing, you agree to GitHub's [Terms](https://example.com/terms) and [Privacy Statement](https://example.com/privacy). GitHub Copilot may show [public code](https://example.com/public-code) suggestions and use your data to improve the product. You can change these [settings](https://example.com/settings) anytime."
    });
  });
});
suite("Chat setup dialog cancellation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("disposes an open dialog when the caller cancels", async () => {
    const cancellation = new CancellationTokenSource();
    let disposed = false;
    let dismissed = false;
    let resolveShow;
    const dialog = {
      show: () => new Promise((resolve) => resolveShow = resolve),
      dispose: () => {
        if (!disposed) {
          disposed = true;
          resolveShow?.(ChatSetupStrategy.Canceled);
        }
      }
    };
    const result = showChatSetupDialogWithCancellation(dialog, cancellation.token, () => dismissed = true);
    cancellation.cancel();
    assert.deepStrictEqual({
      result: await result,
      disposed,
      dismissed
    }, {
      result: ChatSetupStrategy.Canceled,
      disposed: true,
      dismissed: false
    });
    cancellation.dispose();
  });
  test("reports an explicit dialog dismissal", async () => {
    let dismissed = false;
    const dialog = {
      show: async () => ChatSetupStrategy.Canceled,
      dispose: () => {
      }
    };
    const result = await showChatSetupDialogWithCancellation(dialog, void 0, () => dismissed = true);
    assert.deepStrictEqual({ result, dismissed }, {
      result: ChatSetupStrategy.Canceled,
      dismissed: true
    });
  });
  test("cancels in-flight setup when the caller cancels", async () => {
    const cancellation = new CancellationTokenSource();
    const setupStarted = new DeferredPromise();
    let setupToken;
    const setup = new ChatSetup(
      { update() {
      } },
      {
        value: {
          setup: (options) => {
            setupToken = options.cancellationToken;
            setupStarted.complete();
            return new Promise((resolve) => {
              const listener = setupToken.onCancellationRequested(() => {
                listener.dispose();
                resolve(void 0);
              });
            });
          }
        }
      },
      void 0,
      void 0,
      void 0,
      void 0,
      { revealWidget() {
      } },
      { requestWorkspaceTrust: async () => true },
      { getDefaultAccountAuthenticationProvider: () => ({ enterprise: false }) },
      void 0,
      { isWorkspaceTrusted: () => true },
      void 0
    );
    const result = setup.run({ setupStrategy: ChatSetupStrategy.DefaultSetup, cancellationToken: cancellation.token });
    await setupStarted.p;
    cancellation.cancel();
    assert.strictEqual((await result).success, void 0);
    assert.strictEqual(setupToken?.isCancellationRequested, true);
    cancellation.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRTZXR1cFxcY2hhdFNldHVwLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRVcGdyYWRlVXJsV2l0aFJlZGlyZWN0LCBDaGF0U2V0dXBTdHJhdGVneSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdFNldHVwL2NoYXRTZXR1cC5qcyc7XG5pbXBvcnQgeyBDaGF0U2V0dXAsIGdldENoYXRTZXR1cERpYWxvZ0J1dHRvbnMsIGdldENoYXRTZXR1cERpYWxvZ0Zvb3Rlciwgc2hvd0NoYXRTZXR1cERpYWxvZ1dpdGhDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXRTZXR1cC9jaGF0U2V0dXBSdW5uZXIuanMnO1xuXG4vKipcbiAqIFBhcnNlcyB0aGUgZmluYWwgVVJMIGFuZCBleHRyYWN0cyB0aGUgZGVjb2RlZCByZXR1cm5fdG8gdmFsdWUsXG4gKiB0aGVuIGV4dHJhY3RzIHRoZSBkZWNvZGVkIHZzY29kZSBVUkkgZnJvbSB0aGUgcmV0dXJuX3RvIHJlZGlyZWN0LlxuICovXG5mdW5jdGlvbiBwYXJzZVJlZGlyZWN0VXJsKHVybDogc3RyaW5nKTogeyByZXR1cm5Ubzogc3RyaW5nOyByZWRpcmVjdEhvc3Q6IHN0cmluZzsgdnNjb2RlVXJpOiBzdHJpbmcgfSB7XG5cdGNvbnN0IHF1ZXN0aW9uSWR4ID0gdXJsLmluZGV4T2YoJ3JldHVybl90bz0nKTtcblx0Y29uc3QgcmV0dXJuVG8gPSBkZWNvZGVVUklDb21wb25lbnQodXJsLnNsaWNlKHF1ZXN0aW9uSWR4ICsgJ3JldHVybl90bz0nLmxlbmd0aCkpO1xuXHRjb25zdCByZWRpcmVjdFVybCA9IG5ldyBVUkwocmV0dXJuVG8pO1xuXHRjb25zdCB2c2NvZGVVcmkgPSBkZWNvZGVVUklDb21wb25lbnQocmVkaXJlY3RVcmwuc2VhcmNoUGFyYW1zLmdldCgndXJsJykhKTtcblx0cmV0dXJuIHsgcmV0dXJuVG8sIHJlZGlyZWN0SG9zdDogcmVkaXJlY3RVcmwuaG9zdCwgdnNjb2RlVXJpIH07XG59XG5cbnN1aXRlKCdidWlsZFVwZ3JhZGVVcmxXaXRoUmVkaXJlY3QnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc3RhYmxlIHF1YWxpdHkgdXNlcyB2c2NvZGUuZGV2IGhvc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRVcGdyYWRlVXJsV2l0aFJlZGlyZWN0KFxuXHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9naXRodWItY29waWxvdC91cGdyYWRlP3V0bV9zb3VyY2U9dnNjb2RlJyxcblx0XHRcdCd2c2NvZGUnLFxuXHRcdFx0J3N0YWJsZSdcblx0XHQpO1xuXHRcdGNvbnN0IHsgcmVkaXJlY3RIb3N0LCB2c2NvZGVVcmkgfSA9IHBhcnNlUmVkaXJlY3RVcmwocmVzdWx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkaXJlY3RIb3N0LCAndnNjb2RlLmRldicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2c2NvZGVVcmksICd2c2NvZGU6Ly9HaXRIdWIuY29waWxvdC1jaGF0L3VwZ3JhZGUtc3VjY2VzcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNpZGVyIHF1YWxpdHkgdXNlcyBpbnNpZGVycy52c2NvZGUuZGV2IGhvc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRVcGdyYWRlVXJsV2l0aFJlZGlyZWN0KFxuXHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9naXRodWItY29waWxvdC91cGdyYWRlP3V0bV9zb3VyY2U9dnNjb2RlJyxcblx0XHRcdCd2c2NvZGUtaW5zaWRlcnMnLFxuXHRcdFx0J2luc2lkZXInXG5cdFx0KTtcblx0XHRjb25zdCB7IHJlZGlyZWN0SG9zdCwgdnNjb2RlVXJpIH0gPSBwYXJzZVJlZGlyZWN0VXJsKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZGlyZWN0SG9zdCwgJ2luc2lkZXJzLnZzY29kZS5kZXYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodnNjb2RlVXJpLCAndnNjb2RlLWluc2lkZXJzOi8vR2l0SHViLmNvcGlsb3QtY2hhdC91cGdyYWRlLXN1Y2Nlc3MnKTtcblx0fSk7XG5cblx0dGVzdCgndW5kZWZpbmVkIHF1YWxpdHkgZGVmYXVsdHMgdG8gaW5zaWRlcnMudnNjb2RlLmRldiBob3N0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGJ1aWxkVXBncmFkZVVybFdpdGhSZWRpcmVjdChcblx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vZ2l0aHViLWNvcGlsb3QvdXBncmFkZT91dG1fc291cmNlPXZzY29kZScsXG5cdFx0XHQnY29kZS1vc3MnLFxuXHRcdFx0dW5kZWZpbmVkXG5cdFx0KTtcblx0XHRjb25zdCB7IHJlZGlyZWN0SG9zdCwgdnNjb2RlVXJpIH0gPSBwYXJzZVJlZGlyZWN0VXJsKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZGlyZWN0SG9zdCwgJ2luc2lkZXJzLnZzY29kZS5kZXYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodnNjb2RlVXJpLCAnY29kZS1vc3M6Ly9HaXRIdWIuY29waWxvdC1jaGF0L3VwZ3JhZGUtc3VjY2VzcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRzIHdpdGggJiB3aGVuIGJhc2UgVVJMIGFscmVhZHkgaGFzIHF1ZXJ5IHBhcmFtcycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBidWlsZFVwZ3JhZGVVcmxXaXRoUmVkaXJlY3QoXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL2dpdGh1Yi1jb3BpbG90L3VwZ3JhZGU/dXRtX3NvdXJjZT12c2NvZGUnLFxuXHRcdFx0J3ZzY29kZScsXG5cdFx0XHQnc3RhYmxlJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5zdGFydHNXaXRoKCdodHRwczovL2dpdGh1Yi5jb20vZ2l0aHViLWNvcGlsb3QvdXBncmFkZT91dG1fc291cmNlPXZzY29kZSZyZXR1cm5fdG89JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRzIHdpdGggPyB3aGVuIGJhc2UgVVJMIGhhcyBubyBxdWVyeSBwYXJhbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRVcGdyYWRlVXJsV2l0aFJlZGlyZWN0KFxuXHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9naXRodWItY29waWxvdC91cGdyYWRlJyxcblx0XHRcdCd2c2NvZGUnLFxuXHRcdFx0J3N0YWJsZSdcblx0XHQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuc3RhcnRzV2l0aCgnaHR0cHM6Ly9naXRodWIuY29tL2dpdGh1Yi1jb3BpbG90L3VwZ3JhZGU/cmV0dXJuX3RvPScpKTtcblx0fSk7XG5cblx0dGVzdCgnR0hFIFVSTCBpcyBoYW5kbGVkIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBidWlsZFVwZ3JhZGVVcmxXaXRoUmVkaXJlY3QoXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuZXhhbXBsZS5jb20vZ2l0aHViLWNvcGlsb3QvdXBncmFkZT91dG1fc291cmNlPXZzY29kZScsXG5cdFx0XHQndnNjb2RlJyxcblx0XHRcdCdzdGFibGUnXG5cdFx0KTtcblx0XHRhc3NlcnQub2socmVzdWx0LnN0YXJ0c1dpdGgoJ2h0dHBzOi8vZ2l0aHViLmV4YW1wbGUuY29tL2dpdGh1Yi1jb3BpbG90L3VwZ3JhZGU/dXRtX3NvdXJjZT12c2NvZGUmcmV0dXJuX3RvPScpKTtcblx0XHRjb25zdCB7IHZzY29kZVVyaSB9ID0gcGFyc2VSZWRpcmVjdFVybChyZXN1bHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2c2NvZGVVcmksICd2c2NvZGU6Ly9HaXRIdWIuY29waWxvdC1jaGF0L3VwZ3JhZGUtc3VjY2VzcycpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdCBzZXR1cCBkaWFsb2cgcHJlc2VudGF0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3BsYWNlcyBzaWduZWQtb3V0IGNvbnRpbnVhdGlvbiBhZnRlciBwcm92aWRlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnV0dG9ucyA9IGdldENoYXRTZXR1cERpYWxvZ0J1dHRvbnMoQ2hhdEVudGl0bGVtZW50LlVua25vd24sIHsgYWxsb3dDb250aW51ZVdpdGhvdXRTaWduSW46IHRydWUgfSwgZmFsc2UsIHtcblx0XHRcdGRlZmF1bHQ6IHsgbmFtZTogJ0dpdEh1YicgfSxcblx0XHRcdGVudGVycHJpc2U6IHsgbmFtZTogJ0dIRScgfSxcblx0XHRcdGdvb2dsZTogeyBuYW1lOiAnR29vZ2xlJyB9LFxuXHRcdFx0YXBwbGU6IHsgbmFtZTogJ0FwcGxlJyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGZvb3RlciA9IGdldENoYXRTZXR1cERpYWxvZ0Zvb3Rlcih1bmRlZmluZWQsIFRlbGVtZXRyeUxldmVsLlVTQUdFLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9zZXR0aW5ncycsIHtcblx0XHRcdHByb3ZpZGVyTmFtZTogJ0dpdEh1YicsXG5cdFx0XHR0ZXJtc1N0YXRlbWVudFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vdGVybXMnLFxuXHRcdFx0cHJpdmFjeVN0YXRlbWVudFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcHJpdmFjeScsXG5cdFx0XHRwdWJsaWNDb2RlTWF0Y2hlc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcHVibGljLWNvZGUnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRidXR0b25MYWJlbHM6IGJ1dHRvbnMubWFwKGJ1dHRvbiA9PiBidXR0b24ubGFiZWwpLFxuXHRcdFx0bGFzdEJ1dHRvbjogYnV0dG9ucy5hdCgtMSksXG5cdFx0XHRmb290ZXIsXG5cdFx0fSwge1xuXHRcdFx0YnV0dG9uTGFiZWxzOiBbJ0NvbnRpbnVlIHdpdGggR2l0SHViJywgJ0NvbnRpbnVlIHdpdGggR29vZ2xlJywgJ0NvbnRpbnVlIHdpdGggQXBwbGUnLCAnQ29udGludWUgd2l0aCBHSEUnLCAnQ29udGludWUgV2l0aG91dCBTaWduaW5nIEluJ10sXG5cdFx0XHRsYXN0QnV0dG9uOiB7XG5cdFx0XHRcdGxhYmVsOiAnQ29udGludWUgV2l0aG91dCBTaWduaW5nIEluJyxcblx0XHRcdFx0c3RyYXRlZ3k6IENoYXRTZXR1cFN0cmF0ZWd5LkNhbmNlbGVkLFxuXHRcdFx0XHRjbGFzc2VzOiBbJ2xpbmstYnV0dG9uJ10sXG5cdFx0XHR9LFxuXHRcdFx0Zm9vdGVyOiAnQnkgY29udGludWluZywgeW91IGFncmVlIHRvIEdpdEh1YlxcJ3MgW1Rlcm1zXShodHRwczovL2V4YW1wbGUuY29tL3Rlcm1zKSBhbmQgW1ByaXZhY3kgU3RhdGVtZW50XShodHRwczovL2V4YW1wbGUuY29tL3ByaXZhY3kpLiBHaXRIdWIgQ29waWxvdCBtYXkgc2hvdyBbcHVibGljIGNvZGVdKGh0dHBzOi8vZXhhbXBsZS5jb20vcHVibGljLWNvZGUpIHN1Z2dlc3Rpb25zIGFuZCB1c2UgeW91ciBkYXRhIHRvIGltcHJvdmUgdGhlIHByb2R1Y3QuIFlvdSBjYW4gY2hhbmdlIHRoZXNlIFtzZXR0aW5nc10oaHR0cHM6Ly9leGFtcGxlLmNvbS9zZXR0aW5ncykgYW55dGltZS4nLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdCBzZXR1cCBkaWFsb2cgY2FuY2VsbGF0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Rpc3Bvc2VzIGFuIG9wZW4gZGlhbG9nIHdoZW4gdGhlIGNhbGxlciBjYW5jZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGxldCBkaXNtaXNzZWQgPSBmYWxzZTtcblx0XHRsZXQgcmVzb2x2ZVNob3c6ICgodmFsdWU6IENoYXRTZXR1cFN0cmF0ZWd5KSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBkaWFsb2cgPSB7XG5cdFx0XHRzaG93OiAoKSA9PiBuZXcgUHJvbWlzZTxDaGF0U2V0dXBTdHJhdGVneT4ocmVzb2x2ZSA9PiByZXNvbHZlU2hvdyA9IHJlc29sdmUpLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0ZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJlc29sdmVTaG93Py4oQ2hhdFNldHVwU3RyYXRlZ3kuQ2FuY2VsZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCByZXN1bHQgPSBzaG93Q2hhdFNldHVwRGlhbG9nV2l0aENhbmNlbGxhdGlvbihkaWFsb2csIGNhbmNlbGxhdGlvbi50b2tlbiwgKCkgPT4gZGlzbWlzc2VkID0gdHJ1ZSk7XG5cdFx0Y2FuY2VsbGF0aW9uLmNhbmNlbCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IGF3YWl0IHJlc3VsdCxcblx0XHRcdGRpc3Bvc2VkLFxuXHRcdFx0ZGlzbWlzc2VkLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogQ2hhdFNldHVwU3RyYXRlZ3kuQ2FuY2VsZWQsXG5cdFx0XHRkaXNwb3NlZDogdHJ1ZSxcblx0XHRcdGRpc21pc3NlZDogZmFsc2UsXG5cdFx0fSk7XG5cdFx0Y2FuY2VsbGF0aW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBhbiBleHBsaWNpdCBkaWFsb2cgZGlzbWlzc2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBkaXNtaXNzZWQgPSBmYWxzZTtcblx0XHRjb25zdCBkaWFsb2cgPSB7XG5cdFx0XHRzaG93OiBhc3luYyAoKSA9PiBDaGF0U2V0dXBTdHJhdGVneS5DYW5jZWxlZCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2hvd0NoYXRTZXR1cERpYWxvZ1dpdGhDYW5jZWxsYXRpb24oZGlhbG9nLCB1bmRlZmluZWQsICgpID0+IGRpc21pc3NlZCA9IHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdCwgZGlzbWlzc2VkIH0sIHtcblx0XHRcdHJlc3VsdDogQ2hhdFNldHVwU3RyYXRlZ3kuQ2FuY2VsZWQsXG5cdFx0XHRkaXNtaXNzZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbHMgaW4tZmxpZ2h0IHNldHVwIHdoZW4gdGhlIGNhbGxlciBjYW5jZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHNldHVwU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRsZXQgc2V0dXBUb2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2V0dXAgPSBuZXcgQ2hhdFNldHVwKFxuXHRcdFx0eyB1cGRhdGUoKSB7IH0gfSBhcyBuZXZlcixcblx0XHRcdHtcblx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRzZXR1cDogKG9wdGlvbnM6IHsgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiB9KSA9PiB7XG5cdFx0XHRcdFx0XHRzZXR1cFRva2VuID0gb3B0aW9ucy5jYW5jZWxsYXRpb25Ub2tlbjtcblx0XHRcdFx0XHRcdHNldHVwU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gc2V0dXBUb2tlbiEub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR1bmRlZmluZWQgYXMgbmV2ZXIsXG5cdFx0XHR1bmRlZmluZWQgYXMgbmV2ZXIsXG5cdFx0XHR1bmRlZmluZWQgYXMgbmV2ZXIsXG5cdFx0XHR1bmRlZmluZWQgYXMgbmV2ZXIsXG5cdFx0XHR7IHJldmVhbFdpZGdldCgpIHsgfSB9IGFzIG5ldmVyLFxuXHRcdFx0eyByZXF1ZXN0V29ya3NwYWNlVHJ1c3Q6IGFzeW5jICgpID0+IHRydWUgfSBhcyBuZXZlcixcblx0XHRcdHsgZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyOiAoKSA9PiAoeyBlbnRlcnByaXNlOiBmYWxzZSB9KSB9IGFzIG5ldmVyLFxuXHRcdFx0dW5kZWZpbmVkIGFzIG5ldmVyLFxuXHRcdFx0eyBpc1dvcmtzcGFjZVRydXN0ZWQ6ICgpID0+IHRydWUgfSBhcyBuZXZlcixcblx0XHRcdHVuZGVmaW5lZCBhcyBuZXZlcixcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc2V0dXAucnVuKHsgc2V0dXBTdHJhdGVneTogQ2hhdFNldHVwU3RyYXRlZ3kuRGVmYXVsdFNldHVwLCBjYW5jZWxsYXRpb25Ub2tlbjogY2FuY2VsbGF0aW9uLnRva2VuIH0pO1xuXHRcdGF3YWl0IHNldHVwU3RhcnRlZC5wO1xuXHRcdGNhbmNlbGxhdGlvbi5jYW5jZWwoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgcmVzdWx0KS5zdWNjZXNzLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXR1cFRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgdHJ1ZSk7XG5cdFx0Y2FuY2VsbGF0aW9uLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkIseUJBQXlCO0FBQy9ELFNBQVMsV0FBVywyQkFBMkIsMEJBQTBCLDJDQUEyQztBQU1wSCxTQUFTLGlCQUFpQixLQUE0RTtBQUNyRyxRQUFNLGNBQWMsSUFBSSxRQUFRLFlBQVk7QUFDNUMsUUFBTSxXQUFXLG1CQUFtQixJQUFJLE1BQU0sY0FBYyxhQUFhLE1BQU0sQ0FBQztBQUNoRixRQUFNLGNBQWMsSUFBSSxJQUFJLFFBQVE7QUFDcEMsUUFBTSxZQUFZLG1CQUFtQixZQUFZLGFBQWEsSUFBSSxLQUFLLENBQUU7QUFDekUsU0FBTyxFQUFFLFVBQVUsY0FBYyxZQUFZLE1BQU0sVUFBVTtBQUM5RDtBQUVBLE1BQU0sK0JBQStCLE1BQU07QUFFMUMsMENBQXdDO0FBRXhDLE9BQUssdUNBQXVDLE1BQU07QUFDakQsVUFBTSxTQUFTO0FBQUEsTUFDZDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sRUFBRSxjQUFjLFVBQVUsSUFBSSxpQkFBaUIsTUFBTTtBQUMzRCxXQUFPLFlBQVksY0FBYyxZQUFZO0FBQzdDLFdBQU8sWUFBWSxXQUFXLDhDQUE4QztBQUFBLEVBQzdFLENBQUM7QUFFRCxPQUFLLGlEQUFpRCxNQUFNO0FBQzNELFVBQU0sU0FBUztBQUFBLE1BQ2Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLEVBQUUsY0FBYyxVQUFVLElBQUksaUJBQWlCLE1BQU07QUFDM0QsV0FBTyxZQUFZLGNBQWMscUJBQXFCO0FBQ3RELFdBQU8sWUFBWSxXQUFXLHVE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
