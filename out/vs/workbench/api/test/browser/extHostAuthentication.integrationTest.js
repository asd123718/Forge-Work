import assert from "assert";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../../platform/dialogs/test/common/testDialogService.js";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../platform/notification/test/common/testNotificationService.js";
import { IQuickInputService, QuickInputHideReason } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { MainThreadAuthentication } from "../../browser/mainThreadAuthentication.js";
import { ExtHostContext, MainContext } from "../../common/extHost.protocol.js";
import { ExtHostAuthentication } from "../../common/extHostAuthentication.js";
import { IActivityService } from "../../../services/activity/common/activity.js";
import { AuthenticationService } from "../../../services/authentication/browser/authenticationService.js";
import { IAuthenticationExtensionsService, IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { IExtensionService, nullExtensionDescription as extensionDescription } from "../../../services/extensions/common/extensions.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { TestEnvironmentService, TestHostService, TestQuickInputService, TestRemoteAgentService } from "../../../test/browser/workbenchTestServices.js";
import { TestActivityService, TestExtensionService, TestLoggerService, TestProductService, TestStorageService } from "../../../test/common/workbenchTestServices.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { AuthenticationAccessService, IAuthenticationAccessService } from "../../../services/authentication/browser/authenticationAccessService.js";
import { IAuthenticationUsageService } from "../../../services/authentication/browser/authenticationUsageService.js";
import { AuthenticationExtensionsService } from "../../../services/authentication/browser/authenticationExtensionsService.js";
import { ILogService, NullLogService } from "../../../../platform/log/common/log.js";
import { ExtHostWindow } from "../../common/extHostWindow.js";
import { MainThreadWindow } from "../../browser/mainThreadWindow.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IUserActivityService, UserActivityService } from "../../../services/userActivity/common/userActivityService.js";
import { ExtHostUrls } from "../../common/extHostUrls.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { TestSecretStorageService } from "../../../../platform/secrets/test/common/testSecretStorageService.js";
import { IDynamicAuthenticationProviderStorageService } from "../../../services/authentication/common/dynamicAuthenticationProviderStorage.js";
import { DynamicAuthenticationProviderStorageService } from "../../../services/authentication/browser/dynamicAuthenticationProviderStorageService.js";
import { ExtHostProgress } from "../../common/extHostProgress.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
class AuthQuickPick {
  constructor() {
    this.items = [];
  }
  get selectedItems() {
    return this.items;
  }
  onDidAccept(listener) {
    this.accept = listener;
  }
  onDidHide(listener) {
    this.hide = listener;
  }
  dispose() {
  }
  show() {
    this.accept?.({ inBackground: false });
    this.hide?.({ reason: QuickInputHideReason.Other });
  }
}
class AuthTestQuickInputService extends TestQuickInputService {
  createQuickPick() {
    return new AuthQuickPick();
  }
}
class TestAuthUsageService {
  initializeExtensionUsageCache() {
    return Promise.resolve();
  }
  extensionUsesAuth(extensionId) {
    return Promise.resolve(false);
  }
  readAccountUsages(providerId, accountName) {
    return [];
  }
  removeAccountUsage(providerId, accountName) {
  }
  addAccountUsage(providerId, accountName, scopes, extensionId, extensionName) {
  }
}
class TestAuthProvider {
  constructor(authProviderName) {
    this.authProviderName = authProviderName;
    this.id = 1;
    this.sessions = /* @__PURE__ */ new Map();
    this.onDidChangeSessions = () => {
      return { dispose() {
      } };
    };
  }
  async getSessions(scopes) {
    if (!scopes) {
      return [...this.sessions.values()];
    }
    if (scopes[0] === "return multiple") {
      return [...this.sessions.values()];
    }
    const sessions = this.sessions.get(scopes.join(" "));
    return sessions ? [sessions] : [];
  }
  async createSession(scopes) {
    const scopesStr = scopes.join(" ");
    const session = {
      scopes,
      id: `${this.id}`,
      account: {
        label: this.authProviderName,
        id: `${this.id}`
      },
      accessToken: Math.random() + ""
    };
    this.sessions.set(scopesStr, session);
    this.id++;
    return session;
  }
  async removeSession(sessionId) {
    this.sessions.delete(sessionId);
  }
}
suite("ExtHostAuthentication", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let extHostAuthentication;
  let mainInstantiationService;
  setup(async () => {
    const services = new ServiceCollection();
    services.set(ILogService, new SyncDescriptor(NullLogService));
    services.set(IDialogService, new SyncDescriptor(TestDialogService, [{ confirmed: true }]));
    services.set(IStorageService, new SyncDescriptor(TestStorageService));
    services.set(ISecretStorageService, new SyncDescriptor(TestSecretStorageService));
    services.set(IDynamicAuthenticationProviderStorageService, new SyncDescriptor(DynamicAuthenticationProviderStorageService));
    services.set(IQuickInputService, new SyncDescriptor(AuthTestQuickInputService));
    services.set(IExtensionService, new SyncDescriptor(TestExtensionService));
    services.set(IActivityService, new SyncDescriptor(TestActivityService));
    services.set(IRemoteAgentService, new SyncDescriptor(TestRemoteAgentService));
    services.set(INotificationService, new SyncDescriptor(TestNotificationService));
    services.set(IHostService, new SyncDescriptor(TestHostService));
    services.set(IUserActivityService, new SyncDescriptor(UserActivityService));
    services.set(IAuthenticationAccessService, new SyncDescriptor(AuthenticationAccessService));
    services.set(IAuthenticationService, new SyncDescriptor(AuthenticationService));
    services.set(IAuthenticationUsageService, new SyncDescriptor(TestAuthUsageService));
    services.set(IAuthenticationExtensionsService, new SyncDescriptor(AuthenticationExtensionsService));
    mainInstantiationService = disposables.add(new TestInstantiationService(services, void 0, void 0, true));
    mainInstantiationService.stub(IOpenerService, {});
    mainInstantiationService.stub(ITelemetryService, NullTelemetryService);
    mainInstantiationService.stub(IBrowserWorkbenchEnvironmentService, TestEnvironmentService);
    mainInstantiationService.stub(IProductService, TestProductService);
    const rpcProtocol = disposables.add(new TestRPCProtocol());
    rpcProtocol.set(MainContext.MainThreadAuthentication, disposables.add(mainInstantiationService.createInstance(MainThreadAuthentication, rpcProtocol)));
    rpcProtocol.set(MainContext.MainThreadWindow, disposables.add(mainInstantiationService.createInstance(MainThreadWindow, rpcProtocol)));
    const initData = {
      environment: {
        appUriScheme: "test",
        appName: "Test"
      }
    };
    extHostAuthentication = new ExtHostAuthentication(
      rpcProtocol,
      // eslint-disable-next-line local/code-no-any-casts
      {
        environment: {
          appUriScheme: "test",
          appName: "Test"
        }
      },
      new ExtHostWindow(initData, rpcProtocol),
      new ExtHostUrls(rpcProtocol),
      new ExtHostProgress(rpcProtocol),
      disposables.add(new TestLoggerService()),
      new NullLogService()
    );
    rpcProtocol.set(ExtHostContext.ExtHostAuthentication, extHostAuthentication);
    disposables.add(extHostAuthentication.registerAuthenticationProvider("test", "test provider", new TestAuthProvider("test")));
    disposables.add(extHostAuthentication.registerAuthenticationProvider(
      "test-multiple",
      "test multiple provider",
      new TestAuthProvider("test-multiple"),
      { supportsMultipleAccounts: true }
    ));
  });
  test("createIfNone - true", async () => {
    const scopes = ["foo"];
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
  });
  test("createIfNone - false", async () => {
    const scopes = ["foo"];
    const nosession = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {}
    );
    assert.strictEqual(nosession, void 0);
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {}
    );
    assert.strictEqual(session2?.id, session.id);
    assert.strictEqual(session2?.scopes[0], session.scopes[0]);
    assert.strictEqual(session2?.accessToken, session.accessToken);
  });
  test("silent - true", async () => {
    const scopes = ["foo"];
    const nosession = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        silent: true
      }
    );
    assert.strictEqual(nosession, void 0);
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        silent: true
      }
    );
    assert.strictEqual(session.id, session2?.id);
    assert.strictEqual(session.scopes[0], session2?.scopes[0]);
  });
  test("forceNewSession - true - existing session", async () => {
    const scopes = ["foo"];
    const session1 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        createIfNone: true
      }
    );
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        forceNewSession: true
      }
    );
    assert.strictEqual(session2?.id, "2");
    assert.strictEqual(session2?.scopes[0], "foo");
    assert.notStrictEqual(session1.accessToken, session2?.accessToken);
  });
  test("forceNewSession - true - no existing session", async () => {
    const scopes = ["foo"];
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        forceNewSession: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
  });
  test("forceNewSession - detail", async () => {
    const scopes = ["foo"];
    const session1 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        createIfNone: true
      }
    );
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        forceNewSession: { detail: "bar" }
      }
    );
    assert.strictEqual(session2?.id, "2");
    assert.strictEqual(session2?.scopes[0], "foo");
    assert.notStrictEqual(session1.accessToken, session2?.accessToken);
  });
  test("clearSessionPreference - true", async () => {
    const scopes = ["foo"];
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], scopes[0]);
    const scopes2 = ["bar"];
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes2,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session2?.id, "2");
    assert.strictEqual(session2?.scopes[0], scopes2[0]);
    const session3 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["return multiple"],
      {
        clearSessionPreference: true,
        createIfNone: true
      }
    );
    assert.strictEqual(session3?.id, session.id);
    assert.strictEqual(session3?.scopes[0], session.scopes[0]);
    assert.strictEqual(session3?.accessToken, session.accessToken);
  });
  test("silently getting session should return a session (if any) regardless of preference - fixes #137819", async () => {
    const scopes = ["foo"];
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], scopes[0]);
    const scopes2 = ["bar"];
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes2,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session2?.id, "2");
    assert.strictEqual(session2?.scopes[0], scopes2[0]);
    const shouldBeSession1 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes,
      {}
    );
    assert.strictEqual(shouldBeSession1?.id, session.id);
    assert.strictEqual(shouldBeSession1?.scopes[0], session.scopes[0]);
    assert.strictEqual(shouldBeSession1?.accessToken, session.accessToken);
    const shouldBeSession2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes2,
      {}
    );
    assert.strictEqual(shouldBeSession2?.id, session2.id);
    assert.strictEqual(shouldBeSession2?.scopes[0], session2.scopes[0]);
    assert.strictEqual(shouldBeSession2?.accessToken, session2.accessToken);
  });
  test("createIfNone and forceNewSession", async () => {
    try {
      await extHostAuthentication.getSession(
        extensionDescription,
        "test",
        ["foo"],
        {
          createIfNone: true,
          forceNewSession: true
        }
      );
      assert.fail("should have thrown an Error.");
    } catch (e) {
      assert.ok(e);
    }
  });
  test("forceNewSession and silent", async () => {
    try {
      await extHostAuthentication.getSession(
        extensionDescription,
        "test",
        ["foo"],
        {
          forceNewSession: true,
          silent: true
        }
      );
      assert.fail("should have thrown an Error.");
    } catch (e) {
      assert.ok(e);
    }
  });
  test("createIfNone and silent", async () => {
    try {
      await extHostAuthentication.getSession(
        extensionDescription,
        "test",
        ["foo"],
        {
          createIfNone: true,
          silent: true
        }
      );
      assert.fail("should have thrown an Error.");
    } catch (e) {
      assert.ok(e);
    }
  });
  test("Can get multiple sessions (with different scopes) in one extension", async () => {
    let session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["foo"],
      {
        createIfNone: true
      }
    );
    session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["bar"],
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "2");
    assert.strictEqual(session?.scopes[0], "bar");
    session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["foo"],
      {
        createIfNone: false
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
  });
  test("Can get multiple sessions (from different providers) in one extension", async () => {
    let session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["foo"],
      {
        createIfNone: true
      }
    );
    session = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      ["foo"],
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
    assert.strictEqual(session?.account.label, "test");
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["foo"],
      {
        createIfNone: false
      }
    );
    assert.strictEqual(session2?.id, "1");
    assert.strictEqual(session2?.scopes[0], "foo");
    assert.strictEqual(session2?.account.label, "test-multiple");
  });
  test("Can get multiple sessions (from different providers) in one extension at the same time", async () => {
    const sessionP = extHostAuthentication.getSession(
      extensionDescription,
      "test",
      ["foo"],
      {
        createIfNone: true
      }
    );
    const session2P = extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["foo"],
      {
        createIfNone: true
      }
    );
    const session = await sessionP;
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
    assert.strictEqual(session?.account.label, "test");
    const session2 = await session2P;
    assert.strictEqual(session2?.id, "1");
    assert.strictEqual(session2?.scopes[0], "foo");
    assert.strictEqual(session2?.account.label, "test-multiple");
  });
  test("concurrent operations on same provider are serialized", async () => {
    const provider = new TestAuthProvider("concurrent-test");
    const operationOrder = [];
    const originalCreateSession = provider.createSession.bind(provider);
    const originalGetSessions = provider.getSessions.bind(provider);
    provider.createSession = async (scopes) => {
      operationOrder.push(`create-start-${scopes[0]}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = await originalCreateSession(scopes);
      operationOrder.push(`create-end-${scopes[0]}`);
      return result;
    };
    provider.getSessions = async (scopes) => {
      const scopeKey = scopes ? scopes[0] : "all";
      operationOrder.push(`get-start-${scopeKey}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result = await originalGetSessions(scopes);
      operationOrder.push(`get-end-${scopeKey}`);
      return result;
    };
    const disposable = extHostAuthentication.registerAuthenticationProvider("concurrent-test", "Concurrent Test", provider);
    disposables.add(disposable);
    const promises = [
      extHostAuthentication.getSession(extensionDescription, "concurrent-test", ["scope1"], { createIfNone: true }),
      extHostAuthentication.getSession(extensionDescription, "concurrent-test", ["scope2"], { createIfNone: true }),
      extHostAuthentication.getSession(extensionDescription, "concurrent-test", ["scope1"], {})
      // This should get the existing session
    ];
    await Promise.all(promises);
    const operationPairs = [];
    for (let i = 0; i < operationOrder.length; i++) {
      const current = operationOrder[i];
      if (current.includes("-start-")) {
        const scope = current.split("-start-")[1];
        const operationType = current.split("-start-")[0];
        const endOperation = `${operationType}-end-${scope}`;
        const endIndex = operationOrder.indexOf(endOperation, i + 1);
        if (endIndex !== -1) {
          operationPairs.push({
            start: i,
            end: endIndex,
            operation: `${operationType}-${scope}`
          });
        }
      }
    }
    for (let i = 0; i < operationPairs.length; i++) {
      for (let j = i + 1; j < operationPairs.length; j++) {
        const op1 = operationPairs[i];
        const op2 = operationPairs[j];
        const op1EndsBeforeOp2Starts = op1.end < op2.start;
        const op2EndsBeforeOp1Starts = op2.end < op1.start;
        assert.ok(
          op1EndsBeforeOp2Starts || op2EndsBeforeOp1Starts,
          `Operations ${op1.operation} and ${op2.operation} should not overlap. Op1: ${op1.start}-${op1.end}, Op2: ${op2.start}-${op2.end}. Order: [${operationOrder.join(", ")}]`
        );
      }
    }
    assert.ok(operationOrder.includes("create-start-scope1"), "Should have created session for scope1");
    assert.ok(operationOrder.includes("create-end-scope1"), "Should have completed creating session for scope1");
    assert.ok(operationOrder.includes("create-start-scope2"), "Should have created session for scope2");
    assert.ok(operationOrder.includes("create-end-scope2"), "Should have completed creating session for scope2");
    assert.ok(operationOrder.includes("get-start-scope1"), "Should have called getSessions for existing scope1 session");
    assert.ok(operationOrder.includes("get-end-scope1"), "Should have completed getSessions for existing scope1 session");
  });
  test("provider registration and immediate disposal race condition", async () => {
    const provider = new TestAuthProvider("race-test");
    const disposable = extHostAuthentication.registerAuthenticationProvider("race-test", "Race Test", provider);
    disposable.dispose();
    try {
      await extHostAuthentication.getSession(extensionDescription, "race-test", ["scope"], { createIfNone: true });
      assert.fail("Should have thrown an error for non-existent provider");
    } catch (error) {
      assert.ok(error);
    }
  });
  test("provider re-registration after proper disposal", async () => {
    const provider1 = new TestAuthProvider("reregister-test-1");
    const provider2 = new TestAuthProvider("reregister-test-2");
    const disposable1 = extHostAuthentication.registerAuthenticationProvider("reregister-test", "Provider 1", provider1);
    const session1 = await extHostAuthentication.getSession(extensionDescription, "reregister-test", ["scope"], { createIfNone: true });
    assert.strictEqual(session1?.account.label, "reregister-test-1");
    disposable1.dispose();
    const disposable2 = extHostAuthentication.registerAuthenticationProvider("reregister-test", "Provider 2", provider2);
    disposables.add(disposable2);
    const session2 = await extHostAuthentication.getSession(extensionDescription, "reregister-test", ["scope"], { createIfNone: true });
    assert.strictEqual(session2?.account.label, "reregister-test-2");
    assert.notStrictEqual(session1?.accessToken, session2?.accessToken);
  });
  test("operations on different providers run concurrently", async () => {
    const provider1 = new TestAuthProvider("concurrent-1");
    const provider2 = new TestAuthProvider("concurrent-2");
    let provider1Started = false;
    let provider2Started = false;
    let provider1Finished = false;
    let provider2Finished = false;
    let concurrencyVerified = false;
    const originalCreate1 = provider1.createSession.bind(provider1);
    const originalCreate2 = provider2.createSession.bind(provider2);
    provider1.createSession = async (scopes) => {
      provider1Started = true;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = await originalCreate1(scopes);
      provider1Finished = true;
      return result;
    };
    provider2.createSession = async (scopes) => {
      provider2Started = true;
      if (provider1Started && !provider1Finished) {
        concurrencyVerified = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result = await originalCreate2(scopes);
      provider2Finished = true;
      return result;
    };
    const disposable1 = extHostAuthentication.registerAuthenticationProvider("concurrent-1", "Concurrent 1", provider1);
    const disposable2 = extHostAuthentication.registerAuthenticationProvider("concurrent-2", "Concurrent 2", provider2);
    disposables.add(disposable1);
    disposables.add(disposable2);
    const [session1, session2] = await Promise.all([
      extHostAuthentication.getSession(extensionDescription, "concurrent-1", ["scope"], { createIfNone: true }),
      extHostAuthentication.getSession(extensionDescription, "concurrent-2", ["scope"], { createIfNone: true })
    ]);
    assert.ok(session1);
    assert.ok(session2);
    assert.ok(provider1Started, "Provider 1 should have started");
    assert.ok(provider2Started, "Provider 2 should have started");
    assert.ok(provider1Finished, "Provider 1 should have finished");
    assert.ok(provider2Finished, "Provider 2 should have finished");
    assert.strictEqual(session1.account.label, "concurrent-1");
    assert.strictEqual(session2.account.label, "concurrent-2");
    assert.ok(concurrencyVerified, "Operations should have run concurrently - provider 2 should start while provider 1 is still running");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmludGVncmF0aW9uVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBUZXN0RGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvdGVzdC9jb21tb24vdGVzdERpYWxvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Tm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dEhpZGVFdmVudCwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQsIElRdWlja1BpY2tJdGVtLCBRdWlja0lucHV0SGlkZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkQXV0aGVudGljYXRpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWRBdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgTWFpbkNvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0QXV0aGVudGljYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UsIElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiBhcyBleHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgVGVzdEVudmlyb25tZW50U2VydmljZSwgVGVzdEhvc3RTZXJ2aWNlLCBUZXN0UXVpY2tJbnB1dFNlcnZpY2UsIFRlc3RSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RBY3Rpdml0eVNlcnZpY2UsIFRlc3RFeHRlbnNpb25TZXJ2aWNlLCBUZXN0TG9nZ2VyU2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBBdXRoZW50aWNhdGlvblNlc3Npb24gfSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UsIElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjb3VudFVzYWdlLCBJQXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0V2luZG93IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RXaW5kb3cuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZFdpbmRvdyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFpblRocmVhZFdpbmRvdy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElVc2VyQWN0aXZpdHlTZXJ2aWNlLCBVc2VyQWN0aXZpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckFjdGl2aXR5L2NvbW1vbi91c2VyQWN0aXZpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RVcmxzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RVcmxzLmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuaW1wb3J0IHsgVGVzdFNlY3JldFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy90ZXN0L2NvbW1vbi90ZXN0U2VjcmV0U3RvcmFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlLmpzJztcbmltcG9ydCB7IER5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RQcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5cbmNsYXNzIEF1dGhRdWlja1BpY2sge1xuXHRwcml2YXRlIGFjY2VwdDogKChlOiBJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQpID0+IGFueSkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGlkZTogKChlOiBJUXVpY2tJbnB1dEhpZGVFdmVudCkgPT4gYW55KSB8IHVuZGVmaW5lZDtcblx0cHVibGljIGl0ZW1zID0gW107XG5cdHB1YmxpYyBnZXQgc2VsZWN0ZWRJdGVtcygpOiBJUXVpY2tQaWNrSXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtcztcblx0fVxuXG5cdG9uRGlkQWNjZXB0KGxpc3RlbmVyOiAoZTogSVF1aWNrUGlja0RpZEFjY2VwdEV2ZW50KSA9PiBhbnkpIHtcblx0XHR0aGlzLmFjY2VwdCA9IGxpc3RlbmVyO1xuXHR9XG5cdG9uRGlkSGlkZShsaXN0ZW5lcjogKGU6IElRdWlja0lucHV0SGlkZUV2ZW50KSA9PiBhbnkpIHtcblx0XHR0aGlzLmhpZGUgPSBsaXN0ZW5lcjtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cblx0fVxuXHRzaG93KCkge1xuXHRcdHRoaXMuYWNjZXB0Py4oeyBpbkJhY2tncm91bmQ6IGZhbHNlIH0pO1xuXHRcdHRoaXMuaGlkZT8uKHsgcmVhc29uOiBRdWlja0lucHV0SGlkZVJlYXNvbi5PdGhlciB9KTtcblx0fVxufVxuY2xhc3MgQXV0aFRlc3RRdWlja0lucHV0U2VydmljZSBleHRlbmRzIFRlc3RRdWlja0lucHV0U2VydmljZSB7XG5cdG92ZXJyaWRlIGNyZWF0ZVF1aWNrUGljaygpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZXR1cm4gPGFueT5uZXcgQXV0aFF1aWNrUGljaygpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RBdXRoVXNhZ2VTZXJ2aWNlIGltcGxlbWVudHMgSUF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRpbml0aWFsaXplRXh0ZW5zaW9uVXNhZ2VDYWNoZSgpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG5cdGV4dGVuc2lvblVzZXNBdXRoKGV4dGVuc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7IH1cblx0cmVhZEFjY291bnRVc2FnZXMocHJvdmlkZXJJZDogc3RyaW5nLCBhY2NvdW50TmFtZTogc3RyaW5nKTogSUFjY291bnRVc2FnZVtdIHsgcmV0dXJuIFtdOyB9XG5cdHJlbW92ZUFjY291bnRVc2FnZShwcm92aWRlcklkOiBzdHJpbmcsIGFjY291bnROYW1lOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRhZGRBY2NvdW50VXNhZ2UocHJvdmlkZXJJZDogc3RyaW5nLCBhY2NvdW50TmFtZTogc3RyaW5nLCBzY29wZXM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPiwgZXh0ZW5zaW9uSWQ6IHN0cmluZywgZXh0ZW5zaW9uTmFtZTogc3RyaW5nKTogdm9pZCB7IH1cbn1cblxuY2xhc3MgVGVzdEF1dGhQcm92aWRlciBpbXBsZW1lbnRzIEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIge1xuXHRwcml2YXRlIGlkID0gMTtcblx0cHJpdmF0ZSBzZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBBdXRoZW50aWNhdGlvblNlc3Npb24+KCk7XG5cdG9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSAoKSA9PiB7IHJldHVybiB7IGRpc3Bvc2UoKSB7IH0gfTsgfTtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBhdXRoUHJvdmlkZXJOYW1lOiBzdHJpbmcpIHsgfVxuXHRhc3luYyBnZXRTZXNzaW9ucyhzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uW10+IHtcblx0XHRpZiAoIXNjb3Blcykge1xuXHRcdFx0cmV0dXJuIFsuLi50aGlzLnNlc3Npb25zLnZhbHVlcygpXTtcblx0XHR9XG5cblx0XHRpZiAoc2NvcGVzWzBdID09PSAncmV0dXJuIG11bHRpcGxlJykge1xuXHRcdFx0cmV0dXJuIFsuLi50aGlzLnNlc3Npb25zLnZhbHVlcygpXTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLnNlc3Npb25zLmdldChzY29wZXMuam9pbignICcpKTtcblx0XHRyZXR1cm4gc2Vzc2lvbnMgPyBbc2Vzc2lvbnNdIDogW107XG5cdH1cblx0YXN5bmMgY3JlYXRlU2Vzc2lvbihzY29wZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTxBdXRoZW50aWNhdGlvblNlc3Npb24+IHtcblx0XHRjb25zdCBzY29wZXNTdHIgPSBzY29wZXMuam9pbignICcpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB7XG5cdFx0XHRzY29wZXMsXG5cdFx0XHRpZDogYCR7dGhpcy5pZH1gLFxuXHRcdFx0YWNjb3VudDoge1xuXHRcdFx0XHRsYWJlbDogdGhpcy5hdXRoUHJvdmlkZXJOYW1lLFxuXHRcdFx0XHRpZDogYCR7dGhpcy5pZH1gLFxuXHRcdFx0fSxcblx0XHRcdGFjY2Vzc1Rva2VuOiBNYXRoLnJhbmRvbSgpICsgJycsXG5cdFx0fTtcblx0XHR0aGlzLnNlc3Npb25zLnNldChzY29wZXNTdHIsIHNlc3Npb24pO1xuXHRcdHRoaXMuaWQrKztcblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXHRhc3luYyByZW1vdmVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZXNzaW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcblx0fVxuXG59XG5cbnN1aXRlKCdFeHRIb3N0QXV0aGVudGljYXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGV4dEhvc3RBdXRoZW50aWNhdGlvbjogRXh0SG9zdEF1dGhlbnRpY2F0aW9uO1xuXHRsZXQgbWFpbkluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdC8vIHNlcnZpY2VzXG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihOdWxsTG9nU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJRGlhbG9nU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFRlc3REaWFsb2dTZXJ2aWNlLCBbeyBjb25maXJtZWQ6IHRydWUgfV0pKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVN0b3JhZ2VTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdFN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElTZWNyZXRTdG9yYWdlU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFRlc3RTZWNyZXRTdG9yYWdlU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKER5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVF1aWNrSW5wdXRTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQXV0aFRlc3RRdWlja0lucHV0U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJRXh0ZW5zaW9uU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFRlc3RFeHRlbnNpb25TZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBY3Rpdml0eVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihUZXN0QWN0aXZpdHlTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElSZW1vdGVBZ2VudFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihUZXN0UmVtb3RlQWdlbnRTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElOb3RpZmljYXRpb25TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUhvc3RTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdEhvc3RTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElVc2VyQWN0aXZpdHlTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVXNlckFjdGl2aXR5U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBdXRoZW50aWNhdGlvblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihBdXRoZW50aWNhdGlvblNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdEF1dGhVc2FnZVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uc1NlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlKSk7XG5cdFx0bWFpbkluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKSk7XG5cblx0XHQvLyBzdHVic1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRtYWluSW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJT3BlbmVyU2VydmljZSwge30gYXMgUGFydGlhbDxJT3BlbmVyU2VydmljZT4pO1xuXHRcdG1haW5JbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0bWFpbkluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIFRlc3RFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdG1haW5JbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9kdWN0U2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJwY1Byb3RvY29sID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0UlBDUHJvdG9jb2woKSk7XG5cblx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uLCBkaXNwb3NhYmxlcy5hZGQobWFpbkluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRBdXRoZW50aWNhdGlvbiwgcnBjUHJvdG9jb2wpKSk7XG5cdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXaW5kb3csIGRpc3Bvc2FibGVzLmFkZChtYWluSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFpblRocmVhZFdpbmRvdywgcnBjUHJvdG9jb2wpKSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgaW5pdERhdGE6IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlID0ge1xuXHRcdFx0ZW52aXJvbm1lbnQ6IHtcblx0XHRcdFx0YXBwVXJpU2NoZW1lOiAndGVzdCcsXG5cdFx0XHRcdGFwcE5hbWU6ICdUZXN0J1xuXHRcdFx0fVxuXHRcdH0gYXMgYW55O1xuXHRcdGV4dEhvc3RBdXRoZW50aWNhdGlvbiA9IG5ldyBFeHRIb3N0QXV0aGVudGljYXRpb24oXG5cdFx0XHRycGNQcm90b2NvbCxcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0e1xuXHRcdFx0XHRlbnZpcm9ubWVudDoge1xuXHRcdFx0XHRcdGFwcFVyaVNjaGVtZTogJ3Rlc3QnLFxuXHRcdFx0XHRcdGFwcE5hbWU6ICdUZXN0J1xuXHRcdFx0XHR9XG5cdFx0XHR9IGFzIGFueSxcblx0XHRcdG5ldyBFeHRIb3N0V2luZG93KGluaXREYXRhLCBycGNQcm90b2NvbCksXG5cdFx0XHRuZXcgRXh0SG9zdFVybHMocnBjUHJvdG9jb2wpLFxuXHRcdFx0bmV3IEV4dEhvc3RQcm9ncmVzcyhycGNQcm90b2NvbCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMb2dnZXJTZXJ2aWNlKCkpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKClcblx0XHQpO1xuXHRcdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0QXV0aGVudGljYXRpb24sIGV4dEhvc3RBdXRoZW50aWNhdGlvbik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3RBdXRoZW50aWNhdGlvbi5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoJ3Rlc3QnLCAndGVzdCBwcm92aWRlcicsIG5ldyBUZXN0QXV0aFByb3ZpZGVyKCd0ZXN0JykpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdEF1dGhlbnRpY2F0aW9uLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihcblx0XHRcdCd0ZXN0LW11bHRpcGxlJyxcblx0XHRcdCd0ZXN0IG11bHRpcGxlIHByb3ZpZGVyJyxcblx0XHRcdG5ldyBUZXN0QXV0aFByb3ZpZGVyKCd0ZXN0LW11bHRpcGxlJyksXG5cdFx0XHR7IHN1cHBvcnRzTXVsdGlwbGVBY2NvdW50czogdHJ1ZSB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUlmTm9uZSAtIHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2NvcGVzID0gWydmb28nXTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHNjb3Blcyxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uaWQsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LnNjb3Blc1swXSwgJ2ZvbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVJZk5vbmUgLSBmYWxzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzY29wZXMgPSBbJ2ZvbyddO1xuXHRcdGNvbnN0IG5vc2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIE5vdyBjcmVhdGUgdGhlIHNlc3Npb25cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHNjb3Blcyxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5pZCwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uc2NvcGVzWzBdLCAnZm9vJyk7XG5cblx0XHRjb25zdCBzZXNzaW9uMiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LmlkLCBzZXNzaW9uLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LnNjb3Blc1swXSwgc2Vzc2lvbi5zY29wZXNbMF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uYWNjZXNzVG9rZW4sIHNlc3Npb24uYWNjZXNzVG9rZW4pO1xuXHR9KTtcblxuXHQvLyBzaG91bGQgYmVoYXZlIHRoZSBzYW1lIGFzIGNyZWF0ZUlmTm9uZTogZmFsc2Vcblx0dGVzdCgnc2lsZW50IC0gdHJ1ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzY29wZXMgPSBbJ2ZvbyddO1xuXHRcdGNvbnN0IG5vc2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7XG5cdFx0XHRcdHNpbGVudDogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIE5vdyBjcmVhdGUgdGhlIHNlc3Npb25cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHNjb3Blcyxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5pZCwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uc2NvcGVzWzBdLCAnZm9vJyk7XG5cblx0XHRjb25zdCBzZXNzaW9uMiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7XG5cdFx0XHRcdHNpbGVudDogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pZCwgc2Vzc2lvbjI/LmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5zY29wZXNbMF0sIHNlc3Npb24yPy5zY29wZXNbMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JjZU5ld1Nlc3Npb24gLSB0cnVlIC0gZXhpc3Rpbmcgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzY29wZXMgPSBbJ2ZvbyddO1xuXHRcdGNvbnN0IHNlc3Npb24xID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHNjb3Blcyxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdC8vIE5vdyBjcmVhdGUgdGhlIHNlc3Npb25cblx0XHRjb25zdCBzZXNzaW9uMiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7XG5cdFx0XHRcdGZvcmNlTmV3U2Vzc2lvbjogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LmlkLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uc2NvcGVzWzBdLCAnZm9vJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNlc3Npb24xLmFjY2Vzc1Rva2VuLCBzZXNzaW9uMj8uYWNjZXNzVG9rZW4pO1xuXHR9KTtcblxuXHQvLyBTaG91bGQgYmVoYXZlIGxpa2UgY3JlYXRlSWZOb25lOiB0cnVlXG5cdHRlc3QoJ2ZvcmNlTmV3U2Vzc2lvbiAtIHRydWUgLSBubyBleGlzdGluZyBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNjb3BlcyA9IFsnZm9vJ107XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7XG5cdFx0XHRcdGZvcmNlTmV3U2Vzc2lvbjogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LmlkLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5zY29wZXNbMF0sICdmb28nKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yY2VOZXdTZXNzaW9uIC0gZGV0YWlsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNjb3BlcyA9IFsnZm9vJ107XG5cdFx0Y29uc3Qgc2Vzc2lvbjEgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVJZk5vbmU6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0Ly8gTm93IGNyZWF0ZSB0aGUgc2Vzc2lvblxuXHRcdGNvbnN0IHNlc3Npb24yID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHNjb3Blcyxcblx0XHRcdHtcblx0XHRcdFx0Zm9yY2VOZXdTZXNzaW9uOiB7IGRldGFpbDogJ2JhcicgfVxuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LmlkLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uc2NvcGVzWzBdLCAnZm9vJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNlc3Npb24xLmFjY2Vzc1Rva2VuLCBzZXNzaW9uMj8uYWNjZXNzVG9rZW4pO1xuXHR9KTtcblxuXHQvLyNyZWdpb24gTXVsdGktQWNjb3VudCBBdXRoUHJvdmlkZXJcblxuXHR0ZXN0KCdjbGVhclNlc3Npb25QcmVmZXJlbmNlIC0gdHJ1ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzY29wZXMgPSBbJ2ZvbyddO1xuXHRcdC8vIE5vdyBjcmVhdGUgdGhlIHNlc3Npb25cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0LW11bHRpcGxlJyxcblx0XHRcdHNjb3Blcyxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5pZCwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uc2NvcGVzWzBdLCBzY29wZXNbMF0pO1xuXG5cdFx0Y29uc3Qgc2NvcGVzMiA9IFsnYmFyJ107XG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QtbXVsdGlwbGUnLFxuXHRcdFx0c2NvcGVzMixcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LmlkLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uc2NvcGVzWzBdLCBzY29wZXMyWzBdKTtcblxuXHRcdGNvbnN0IHNlc3Npb24zID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0LW11bHRpcGxlJyxcblx0XHRcdFsncmV0dXJuIG11bHRpcGxlJ10sXG5cdFx0XHR7XG5cdFx0XHRcdGNsZWFyU2Vzc2lvblByZWZlcmVuY2U6IHRydWUsXG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHQvLyBjbGVhcmluZyBzZXNzaW9uIHByZWZlcmVuY2UgY2F1c2VzIHVzIHRvIGdldCB0aGUgZmlyc3Qgc2Vzc2lvblxuXHRcdC8vIGJlY2F1c2UgaXQgd291bGQgbm9ybWFsbHkgc2hvdyBhIHF1aWNrIHBpY2sgZm9yIHRoZSB1c2VyIHRvIGNob29zZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMz8uaWQsIHNlc3Npb24uaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMz8uc2NvcGVzWzBdLCBzZXNzaW9uLnNjb3Blc1swXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24zPy5hY2Nlc3NUb2tlbiwgc2Vzc2lvbi5hY2Nlc3NUb2tlbik7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbGVudGx5IGdldHRpbmcgc2Vzc2lvbiBzaG91bGQgcmV0dXJuIGEgc2Vzc2lvbiAoaWYgYW55KSByZWdhcmRsZXNzIG9mIHByZWZlcmVuY2UgLSBmaXhlcyAjMTM3ODE5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNjb3BlcyA9IFsnZm9vJ107XG5cdFx0Ly8gTm93IGNyZWF0ZSB0aGUgc2Vzc2lvblxuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QtbXVsdGlwbGUnLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVJZk5vbmU6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LmlkLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5zY29wZXNbMF0sIHNjb3Blc1swXSk7XG5cblx0XHRjb25zdCBzY29wZXMyID0gWydiYXInXTtcblx0XHRjb25zdCBzZXNzaW9uMiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdC1tdWx0aXBsZScsXG5cdFx0XHRzY29wZXMyLFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVJZk5vbmU6IHRydWVcblx0XHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uaWQsICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5zY29wZXNbMF0sIHNjb3BlczJbMF0pO1xuXG5cdFx0Y29uc3Qgc2hvdWxkQmVTZXNzaW9uMSA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdC1tdWx0aXBsZScsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZEJlU2Vzc2lvbjE/LmlkLCBzZXNzaW9uLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkQmVTZXNzaW9uMT8uc2NvcGVzWzBdLCBzZXNzaW9uLnNjb3Blc1swXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZEJlU2Vzc2lvbjE/LmFjY2Vzc1Rva2VuLCBzZXNzaW9uLmFjY2Vzc1Rva2VuKTtcblxuXHRcdGNvbnN0IHNob3VsZEJlU2Vzc2lvbjIgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QtbXVsdGlwbGUnLFxuXHRcdFx0c2NvcGVzMixcblx0XHRcdHt9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkQmVTZXNzaW9uMj8uaWQsIHNlc3Npb24yLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkQmVTZXNzaW9uMj8uc2NvcGVzWzBdLCBzZXNzaW9uMi5zY29wZXNbMF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRCZVNlc3Npb24yPy5hY2Nlc3NUb2tlbiwgc2Vzc2lvbjIuYWNjZXNzVG9rZW4pO1xuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gZXJyb3IgY2FzZXNcblxuXHR0ZXN0KCdjcmVhdGVJZk5vbmUgYW5kIGZvcmNlTmV3U2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0XHQndGVzdCcsXG5cdFx0XHRcdFsnZm9vJ10sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjcmVhdGVJZk5vbmU6IHRydWUsXG5cdFx0XHRcdFx0Zm9yY2VOZXdTZXNzaW9uOiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ3Nob3VsZCBoYXZlIHRocm93biBhbiBFcnJvci4nKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRhc3NlcnQub2soZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdmb3JjZU5ld1Nlc3Npb24gYW5kIHNpbGVudCcsIGFzeW5jICgpID0+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0XHQndGVzdCcsXG5cdFx0XHRcdFsnZm9vJ10sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRmb3JjZU5ld1Nlc3Npb246IHRydWUsXG5cdFx0XHRcdFx0c2lsZW50OiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ3Nob3VsZCBoYXZlIHRocm93biBhbiBFcnJvci4nKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRhc3NlcnQub2soZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVJZk5vbmUgYW5kIHNpbGVudCcsIGFzeW5jICgpID0+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0XHQndGVzdCcsXG5cdFx0XHRcdFsnZm9vJ10sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjcmVhdGVJZk5vbmU6IHRydWUsXG5cdFx0XHRcdFx0c2lsZW50OiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ3Nob3VsZCBoYXZlIHRocm93biBhbiBFcnJvci4nKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRhc3NlcnQub2soZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdDYW4gZ2V0IG11bHRpcGxlIHNlc3Npb25zICh3aXRoIGRpZmZlcmVudCBzY29wZXMpIGluIG9uZSBleHRlbnNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNlc3Npb246IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZCA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdC1tdWx0aXBsZScsXG5cdFx0XHRbJ2ZvbyddLFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVJZk5vbmU6IHRydWVcblx0XHRcdH0pO1xuXHRcdHNlc3Npb24gPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QtbXVsdGlwbGUnLFxuXHRcdFx0WydiYXInXSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uaWQsICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LnNjb3Blc1swXSwgJ2JhcicpO1xuXG5cdFx0c2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdC1tdWx0aXBsZScsXG5cdFx0XHRbJ2ZvbyddLFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVJZk5vbmU6IGZhbHNlXG5cdFx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uaWQsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LnNjb3Blc1swXSwgJ2ZvbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdDYW4gZ2V0IG11bHRpcGxlIHNlc3Npb25zIChmcm9tIGRpZmZlcmVudCBwcm92aWRlcnMpIGluIG9uZSBleHRlbnNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNlc3Npb246IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZCA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdC1tdWx0aXBsZScsXG5cdFx0XHRbJ2ZvbyddLFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVJZk5vbmU6IHRydWVcblx0XHRcdH0pO1xuXHRcdHNlc3Npb24gPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0Wydmb28nXSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uaWQsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LnNjb3Blc1swXSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5hY2NvdW50LmxhYmVsLCAndGVzdCcpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QtbXVsdGlwbGUnLFxuXHRcdFx0Wydmb28nXSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5pZCwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LnNjb3Blc1swXSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uYWNjb3VudC5sYWJlbCwgJ3Rlc3QtbXVsdGlwbGUnKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FuIGdldCBtdWx0aXBsZSBzZXNzaW9ucyAoZnJvbSBkaWZmZXJlbnQgcHJvdmlkZXJzKSBpbiBvbmUgZXh0ZW5zaW9uIGF0IHRoZSBzYW1lIHRpbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblA6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uIHwgdW5kZWZpbmVkPiA9IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRbJ2ZvbyddLFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVJZk5vbmU6IHRydWVcblx0XHRcdH0pO1xuXHRcdGNvbnN0IHNlc3Npb24yUDogUHJvbWlzZTxBdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQ+ID0gZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0LW11bHRpcGxlJyxcblx0XHRcdFsnZm9vJ10sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlc3Npb25QO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5pZCwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uc2NvcGVzWzBdLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LmFjY291bnQubGFiZWwsICd0ZXN0Jyk7XG5cblx0XHRjb25zdCBzZXNzaW9uMiA9IGF3YWl0IHNlc3Npb24yUDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LmlkLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uc2NvcGVzWzBdLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5hY2NvdW50LmxhYmVsLCAndGVzdC1tdWx0aXBsZScpO1xuXHR9KTtcblxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBSYWNlIENvbmRpdGlvbiBhbmQgU2VxdWVuY2luZyBUZXN0c1xuXG5cdHRlc3QoJ2NvbmN1cnJlbnQgb3BlcmF0aW9ucyBvbiBzYW1lIHByb3ZpZGVyIGFyZSBzZXJpYWxpemVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFRlc3RBdXRoUHJvdmlkZXIoJ2NvbmN1cnJlbnQtdGVzdCcpO1xuXHRcdGNvbnN0IG9wZXJhdGlvbk9yZGVyOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Ly8gTW9jayB0aGUgcHJvdmlkZXIgbWV0aG9kcyB0byB0cmFjayBvcGVyYXRpb24gb3JkZXJcblx0XHRjb25zdCBvcmlnaW5hbENyZWF0ZVNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVTZXNzaW9uLmJpbmQocHJvdmlkZXIpO1xuXHRcdGNvbnN0IG9yaWdpbmFsR2V0U2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucy5iaW5kKHByb3ZpZGVyKTtcblxuXHRcdHByb3ZpZGVyLmNyZWF0ZVNlc3Npb24gPSBhc3luYyAoc2NvcGVzKSA9PiB7XG5cdFx0XHRvcGVyYXRpb25PcmRlci5wdXNoKGBjcmVhdGUtc3RhcnQtJHtzY29wZXNbMF19YCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMjApKTsgLy8gU2ltdWxhdGUgYXN5bmMgd29ya1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgb3JpZ2luYWxDcmVhdGVTZXNzaW9uKHNjb3Blcyk7XG5cdFx0XHRvcGVyYXRpb25PcmRlci5wdXNoKGBjcmVhdGUtZW5kLSR7c2NvcGVzWzBdfWApO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9O1xuXG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMgPSBhc3luYyAoc2NvcGVzKSA9PiB7XG5cdFx0XHRjb25zdCBzY29wZUtleSA9IHNjb3BlcyA/IHNjb3Blc1swXSA6ICdhbGwnO1xuXHRcdFx0b3BlcmF0aW9uT3JkZXIucHVzaChgZ2V0LXN0YXJ0LSR7c2NvcGVLZXl9YCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTsgLy8gU2ltdWxhdGUgYXN5bmMgd29ya1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgb3JpZ2luYWxHZXRTZXNzaW9ucyhzY29wZXMpO1xuXHRcdFx0b3BlcmF0aW9uT3JkZXIucHVzaChgZ2V0LWVuZC0ke3Njb3BlS2V5fWApO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoJ2NvbmN1cnJlbnQtdGVzdCcsICdDb25jdXJyZW50IFRlc3QnLCBwcm92aWRlcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGUpO1xuXG5cdFx0Ly8gU3RhcnQgbXVsdGlwbGUgb3BlcmF0aW9ucyBzaW11bHRhbmVvdXNseSBvbiB0aGUgc2FtZSBwcm92aWRlclxuXHRcdGNvbnN0IHByb21pc2VzID0gW1xuXHRcdFx0ZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oZXh0ZW5zaW9uRGVzY3JpcHRpb24sICdjb25jdXJyZW50LXRlc3QnLCBbJ3Njb3BlMSddLCB7IGNyZWF0ZUlmTm9uZTogdHJ1ZSB9KSxcblx0XHRcdGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uLCAnY29uY3VycmVudC10ZXN0JywgWydzY29wZTInXSwgeyBjcmVhdGVJZk5vbmU6IHRydWUgfSksXG5cdFx0XHRleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbiwgJ2NvbmN1cnJlbnQtdGVzdCcsIFsnc2NvcGUxJ10sIHt9KSAvLyBUaGlzIHNob3VsZCBnZXQgdGhlIGV4aXN0aW5nIHNlc3Npb25cblx0XHRdO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoYXQgb3BlcmF0aW9ucyB3ZXJlIHNlcmlhbGl6ZWQgLSBubyBvdmVybGFwcGluZyBvcGVyYXRpb25zXG5cdFx0Ly8gQnVpbGQgYSBtYXAgb2Ygb3BlcmF0aW9uIHN0YXJ0cyB0byB0aGVpciBjb3JyZXNwb25kaW5nIGVuZHNcblx0XHRjb25zdCBvcGVyYXRpb25QYWlyczogQXJyYXk8eyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlcjsgb3BlcmF0aW9uOiBzdHJpbmcgfT4gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgb3BlcmF0aW9uT3JkZXIubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBvcGVyYXRpb25PcmRlcltpXTtcblx0XHRcdGlmIChjdXJyZW50LmluY2x1ZGVzKCctc3RhcnQtJykpIHtcblx0XHRcdFx0Y29uc3Qgc2NvcGUgPSBjdXJyZW50LnNwbGl0KCctc3RhcnQtJylbMV07XG5cdFx0XHRcdGNvbnN0IG9wZXJhdGlvblR5cGUgPSBjdXJyZW50LnNwbGl0KCctc3RhcnQtJylbMF07XG5cdFx0XHRcdGNvbnN0IGVuZE9wZXJhdGlvbiA9IGAke29wZXJhdGlvblR5cGV9LWVuZC0ke3Njb3BlfWA7XG5cdFx0XHRcdGNvbnN0IGVuZEluZGV4ID0gb3BlcmF0aW9uT3JkZXIuaW5kZXhPZihlbmRPcGVyYXRpb24sIGkgKyAxKTtcblxuXHRcdFx0XHRpZiAoZW5kSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0b3BlcmF0aW9uUGFpcnMucHVzaCh7XG5cdFx0XHRcdFx0XHRzdGFydDogaSxcblx0XHRcdFx0XHRcdGVuZDogZW5kSW5kZXgsXG5cdFx0XHRcdFx0XHRvcGVyYXRpb246IGAke29wZXJhdGlvblR5cGV9LSR7c2NvcGV9YFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVmVyaWZ5IG5vIG9wZXJhdGlvbnMgb3ZlcmxhcCAoc2VyaWFsaXphdGlvbilcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG9wZXJhdGlvblBhaXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRmb3IgKGxldCBqID0gaSArIDE7IGogPCBvcGVyYXRpb25QYWlycy5sZW5ndGg7IGorKykge1xuXHRcdFx0XHRjb25zdCBvcDEgPSBvcGVyYXRpb25QYWlyc1tpXTtcblx0XHRcdFx0Y29uc3Qgb3AyID0gb3BlcmF0aW9uUGFpcnNbal07XG5cblx0XHRcdFx0Ly8gT3BlcmF0aW9ucyBzaG91bGQgbm90IG92ZXJsYXAgLSBvbmUgc2hvdWxkIGNvbXBsZXRlbHkgZmluaXNoIGJlZm9yZSB0aGUgb3RoZXIgc3RhcnRzXG5cdFx0XHRcdGNvbnN0IG9wMUVuZHNCZWZvcmVPcDJTdGFydHMgPSBvcDEuZW5kIDwgb3AyLnN0YXJ0O1xuXHRcdFx0XHRjb25zdCBvcDJFbmRzQmVmb3JlT3AxU3RhcnRzID0gb3AyLmVuZCA8IG9wMS5zdGFydDtcblxuXHRcdFx0XHRhc3NlcnQub2sob3AxRW5kc0JlZm9yZU9wMlN0YXJ0cyB8fCBvcDJFbmRzQmVmb3JlT3AxU3RhcnRzLFxuXHRcdFx0XHRcdGBPcGVyYXRpb25zICR7b3AxLm9wZXJhdGlvbn0gYW5kICR7b3AyLm9wZXJhdGlvbn0gc2hvdWxkIG5vdCBvdmVybGFwLiBgICtcblx0XHRcdFx0XHRgT3AxOiAke29wMS5zdGFydH0tJHtvcDEuZW5kfSwgT3AyOiAke29wMi5zdGFydH0tJHtvcDIuZW5kfS4gYCArXG5cdFx0XHRcdFx0YE9yZGVyOiBbJHtvcGVyYXRpb25PcmRlci5qb2luKCcsICcpfV1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBWZXJpZnkgd2UgaGF2ZSB0aGUgZXhwZWN0ZWQgb3BlcmF0aW9uc1xuXHRcdGFzc2VydC5vayhvcGVyYXRpb25PcmRlci5pbmNsdWRlcygnY3JlYXRlLXN0YXJ0LXNjb3BlMScpLCAnU2hvdWxkIGhhdmUgY3JlYXRlZCBzZXNzaW9uIGZvciBzY29wZTEnKTtcblx0XHRhc3NlcnQub2sob3BlcmF0aW9uT3JkZXIuaW5jbHVkZXMoJ2NyZWF0ZS1lbmQtc2NvcGUxJyksICdTaG91bGQgaGF2ZSBjb21wbGV0ZWQgY3JlYXRpbmcgc2Vzc2lvbiBmb3Igc2NvcGUxJyk7XG5cdFx0YXNzZXJ0Lm9rKG9wZXJhdGlvbk9yZGVyLmluY2x1ZGVzKCdjcmVhdGUtc3RhcnQtc2NvcGUyJyksICdTaG91bGQgaGF2ZSBjcmVhdGVkIHNlc3Npb24gZm9yIHNjb3BlMicpO1xuXHRcdGFzc2VydC5vayhvcGVyYXRpb25PcmRlci5pbmNsdWRlcygnY3JlYXRlLWVuZC1zY29wZTInKSwgJ1Nob3VsZCBoYXZlIGNvbXBsZXRlZCBjcmVhdGluZyBzZXNzaW9uIGZvciBzY29wZTInKTtcblxuXHRcdC8vIFRoZSB0aGlyZCBjYWxsIHNob3VsZCB1c2UgZ2V0U2Vzc2lvbnMgdG8gZmluZCB0aGUgZXhpc3Rpbmcgc2NvcGUxIHNlc3Npb25cblx0XHRhc3NlcnQub2sob3BlcmF0aW9uT3JkZXIuaW5jbHVkZXMoJ2dldC1zdGFydC1zY29wZTEnKSwgJ1Nob3VsZCBoYXZlIGNhbGxlZCBnZXRTZXNzaW9ucyBmb3IgZXhpc3Rpbmcgc2NvcGUxIHNlc3Npb24nKTtcblx0XHRhc3NlcnQub2sob3BlcmF0aW9uT3JkZXIuaW5jbHVkZXMoJ2dldC1lbmQtc2NvcGUxJyksICdTaG91bGQgaGF2ZSBjb21wbGV0ZWQgZ2V0U2Vzc2lvbnMgZm9yIGV4aXN0aW5nIHNjb3BlMSBzZXNzaW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVyIHJlZ2lzdHJhdGlvbiBhbmQgaW1tZWRpYXRlIGRpc3Bvc2FsIHJhY2UgY29uZGl0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFRlc3RBdXRoUHJvdmlkZXIoJ3JhY2UtdGVzdCcpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgYW5kIGltbWVkaWF0ZWx5IGRpc3Bvc2Vcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gZXh0SG9zdEF1dGhlbnRpY2F0aW9uLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcigncmFjZS10ZXN0JywgJ1JhY2UgVGVzdCcsIHByb3ZpZGVyKTtcblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdC8vIFRyeSB0byB1c2UgdGhlIHByb3ZpZGVyIGFmdGVyIGRpc3Bvc2FsIC0gc2hvdWxkIGZhaWwgZ3JhY2VmdWxseVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbiwgJ3JhY2UtdGVzdCcsIFsnc2NvcGUnXSwgeyBjcmVhdGVJZk5vbmU6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGhhdmUgdGhyb3duIGFuIGVycm9yIGZvciBub24tZXhpc3RlbnQgcHJvdmlkZXInKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gRXhwZWN0ZWQgLSBwcm92aWRlciBzaG91bGQgYmUgdW5hdmFpbGFibGVcblx0XHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciByZS1yZWdpc3RyYXRpb24gYWZ0ZXIgcHJvcGVyIGRpc3Bvc2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyMSA9IG5ldyBUZXN0QXV0aFByb3ZpZGVyKCdyZXJlZ2lzdGVyLXRlc3QtMScpO1xuXHRcdGNvbnN0IHByb3ZpZGVyMiA9IG5ldyBUZXN0QXV0aFByb3ZpZGVyKCdyZXJlZ2lzdGVyLXRlc3QtMicpO1xuXG5cdFx0Ly8gRmlyc3QgcmVnaXN0cmF0aW9uXG5cdFx0Y29uc3QgZGlzcG9zYWJsZTEgPSBleHRIb3N0QXV0aGVudGljYXRpb24ucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKCdyZXJlZ2lzdGVyLXRlc3QnLCAnUHJvdmlkZXIgMScsIHByb3ZpZGVyMSk7XG5cblx0XHQvLyBDcmVhdGUgYSBzZXNzaW9uIHdpdGggZmlyc3QgcHJvdmlkZXJcblx0XHRjb25zdCBzZXNzaW9uMSA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uLCAncmVyZWdpc3Rlci10ZXN0JywgWydzY29wZSddLCB7IGNyZWF0ZUlmTm9uZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjE/LmFjY291bnQubGFiZWwsICdyZXJlZ2lzdGVyLXRlc3QtMScpO1xuXG5cdFx0Ly8gRGlzcG9zZSBmaXJzdCBwcm92aWRlclxuXHRcdGRpc3Bvc2FibGUxLmRpc3Bvc2UoKTtcblxuXHRcdC8vIFJlLXJlZ2lzdGVyIHdpdGggZGlmZmVyZW50IHByb3ZpZGVyXG5cdFx0Y29uc3QgZGlzcG9zYWJsZTIgPSBleHRIb3N0QXV0aGVudGljYXRpb24ucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKCdyZXJlZ2lzdGVyLXRlc3QnLCAnUHJvdmlkZXIgMicsIHByb3ZpZGVyMik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGUyKTtcblxuXHRcdC8vIENyZWF0ZSBzZXNzaW9uIHdpdGggc2Vjb25kIHByb3ZpZGVyXG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbiwgJ3JlcmVnaXN0ZXItdGVzdCcsIFsnc2NvcGUnXSwgeyBjcmVhdGVJZk5vbmU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5hY2NvdW50LmxhYmVsLCAncmVyZWdpc3Rlci10ZXN0LTInKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc2Vzc2lvbjE/LmFjY2Vzc1Rva2VuLCBzZXNzaW9uMj8uYWNjZXNzVG9rZW4pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVyYXRpb25zIG9uIGRpZmZlcmVudCBwcm92aWRlcnMgcnVuIGNvbmN1cnJlbnRseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlcjEgPSBuZXcgVGVzdEF1dGhQcm92aWRlcignY29uY3VycmVudC0xJyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIyID0gbmV3IFRlc3RBdXRoUHJvdmlkZXIoJ2NvbmN1cnJlbnQtMicpO1xuXG5cdFx0bGV0IHByb3ZpZGVyMVN0YXJ0ZWQgPSBmYWxzZTtcblx0XHRsZXQgcHJvdmlkZXIyU3RhcnRlZCA9IGZhbHNlO1xuXHRcdGxldCBwcm92aWRlcjFGaW5pc2hlZCA9IGZhbHNlO1xuXHRcdGxldCBwcm92aWRlcjJGaW5pc2hlZCA9IGZhbHNlO1xuXHRcdGxldCBjb25jdXJyZW5jeVZlcmlmaWVkID0gZmFsc2U7XG5cblx0XHQvLyBPdmVycmlkZSBjcmVhdGVTZXNzaW9uIHRvIHRyYWNrIHRpbWluZ1xuXHRcdGNvbnN0IG9yaWdpbmFsQ3JlYXRlMSA9IHByb3ZpZGVyMS5jcmVhdGVTZXNzaW9uLmJpbmQocHJvdmlkZXIxKTtcblx0XHRjb25zdCBvcmlnaW5hbENyZWF0ZTIgPSBwcm92aWRlcjIuY3JlYXRlU2Vzc2lvbi5iaW5kKHByb3ZpZGVyMik7XG5cblx0XHRwcm92aWRlcjEuY3JlYXRlU2Vzc2lvbiA9IGFzeW5jIChzY29wZXMpID0+IHtcblx0XHRcdHByb3ZpZGVyMVN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDIwKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBvcmlnaW5hbENyZWF0ZTEoc2NvcGVzKTtcblx0XHRcdHByb3ZpZGVyMUZpbmlzaGVkID0gdHJ1ZTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fTtcblxuXHRcdHByb3ZpZGVyMi5jcmVhdGVTZXNzaW9uID0gYXN5bmMgKHNjb3BlcykgPT4ge1xuXHRcdFx0cHJvdmlkZXIyU3RhcnRlZCA9IHRydWU7XG5cdFx0XHQvLyBQcm92aWRlciAyIHNob3VsZCBzdGFydCBiZWZvcmUgcHJvdmlkZXIgMSBmaW5pc2hlcyAoY29uY3VycmVudCBleGVjdXRpb24pXG5cdFx0XHRpZiAocHJvdmlkZXIxU3RhcnRlZCAmJiAhcHJvdmlkZXIxRmluaXNoZWQpIHtcblx0XHRcdFx0Y29uY3VycmVuY3lWZXJpZmllZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9yaWdpbmFsQ3JlYXRlMihzY29wZXMpO1xuXHRcdFx0cHJvdmlkZXIyRmluaXNoZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZTEgPSBleHRIb3N0QXV0aGVudGljYXRpb24ucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKCdjb25jdXJyZW50LTEnLCAnQ29uY3VycmVudCAxJywgcHJvdmlkZXIxKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlMiA9IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoJ2NvbmN1cnJlbnQtMicsICdDb25jdXJyZW50IDInLCBwcm92aWRlcjIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlMSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGUyKTtcblxuXHRcdC8vIFN0YXJ0IG9wZXJhdGlvbnMgb24gYm90aCBwcm92aWRlcnMgc2ltdWx0YW5lb3VzbHlcblx0XHRjb25zdCBbc2Vzc2lvbjEsIHNlc3Npb24yXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uLCAnY29uY3VycmVudC0xJywgWydzY29wZSddLCB7IGNyZWF0ZUlmTm9uZTogdHJ1ZSB9KSxcblx0XHRcdGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uLCAnY29uY3VycmVudC0yJywgWydzY29wZSddLCB7IGNyZWF0ZUlmTm9uZTogdHJ1ZSB9KVxuXHRcdF0pO1xuXG5cdFx0Ly8gVmVyaWZ5IGJvdGggb3BlcmF0aW9ucyBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24xKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbjIpO1xuXHRcdGFzc2VydC5vayhwcm92aWRlcjFTdGFydGVkLCAnUHJvdmlkZXIgMSBzaG91bGQgaGF2ZSBzdGFydGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyMlN0YXJ0ZWQsICdQcm92aWRlciAyIHNob3VsZCBoYXZlIHN0YXJ0ZWQnKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIxRmluaXNoZWQsICdQcm92aWRlciAxIHNob3VsZCBoYXZlIGZpbmlzaGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyMkZpbmlzaGVkLCAnUHJvdmlkZXIgMiBzaG91bGQgaGF2ZSBmaW5pc2hlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMS5hY2NvdW50LmxhYmVsLCAnY29uY3VycmVudC0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yLmFjY291bnQubGFiZWwsICdjb25jdXJyZW50LTInKTtcblxuXHRcdC8vIFZlcmlmeSB0aGF0IG9wZXJhdGlvbnMgcmFuIGNvbmN1cnJlbnRseSAocHJvdmlkZXIgMiBzdGFydGVkIHdoaWxlIHByb3ZpZGVyIDEgd2FzIHN0aWxsIHJ1bm5pbmcpXG5cdFx0YXNzZXJ0Lm9rKGNvbmN1cnJlbmN5VmVyaWZpZWQsICdPcGVyYXRpb25zIHNob3VsZCBoYXZlIHJ1biBjb25jdXJyZW50bHkgLSBwcm92aWRlciAyIHNob3VsZCBzdGFydCB3aGlsZSBwcm92aWRlciAxIGlzIHN0aWxsIHJ1bm5pbmcnKTtcblx0fSk7XG5cblx0Ly8jZW5kcmVnaW9uXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLCtCQUErQjtBQUN4QyxTQUErQixvQkFBOEQsNEJBQTRCO0FBQ3pILFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCLG1CQUFtQjtBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtDQUFrQyw4QkFBOEI7QUFDekUsU0FBUyxtQkFBbUIsNEJBQTRCLDRCQUE0QjtBQUNwRixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QixpQkFBaUIsdUJBQXVCLDhCQUE4QjtBQUN2RyxTQUFTLHFCQUFxQixzQkFBc0IsbUJBQW1CLG9CQUFvQiwwQkFBMEI7QUFFckgsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkIsb0NBQW9DO0FBQzFFLFNBQXdCLG1DQUFtQztBQUMzRCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGFBQWEsc0JBQXNCO0FBRTVDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCLDJCQUEyQjtBQUMxRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2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
