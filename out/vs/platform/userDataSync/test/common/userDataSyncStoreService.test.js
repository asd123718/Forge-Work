import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { newWriteableBufferStream } from "../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { isWeb } from "../../../../base/common/platform.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { IUserDataSyncStoreService, SyncResource, UserDataSyncErrorCode, UserDataSyncStoreError } from "../../common/userDataSync.js";
import { RequestsSession, UserDataSyncStoreService } from "../../common/userDataSyncStoreService.js";
import { UserDataSyncClient, UserDataSyncTestServer } from "./userDataSyncClient.js";
suite("UserDataSyncStoreService", () => {
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  test("test read manifest for the first time", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    const productService = client.instantiationService.get(IProductService);
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Client-Name"], `${productService.applicationName}${isWeb ? "-web" : ""}`);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Client-Version"], productService.version);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test read manifest for the second time when session is not yet created", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test session id header is not set in the first manifest request after session is created", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test session id header is set from the second manifest request after session is created", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test headers are send for write request", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    await testObject.manifest(null);
    target.reset();
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test headers are send for read request", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    await testObject.manifest(null);
    target.reset();
    await testObject.readResource(SyncResource.Settings, null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test headers are reset after session is cleared ", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    await testObject.manifest(null);
    await testObject.clear();
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test old headers are sent after session is changed on server ", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    const userSessionId = target.requestsWithAllHeaders[0].headers["X-User-Session-Id"];
    await target.clear();
    const client2 = disposableStore.add(new UserDataSyncClient(target));
    await client2.setUp();
    const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
    await testObject2.writeResource(SyncResource.Settings, "some content", null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], userSessionId);
  });
  test("test old headers are reset from second request after session is changed on server ", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    const userSessionId = target.requestsWithAllHeaders[0].headers["X-User-Session-Id"];
    await target.clear();
    const client2 = disposableStore.add(new UserDataSyncClient(target));
    await client2.setUp();
    const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
    await testObject2.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], userSessionId);
  });
  test("test old headers are sent after session is cleared from another server ", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    const userSessionId = target.requestsWithAllHeaders[0].headers["X-User-Session-Id"];
    const client2 = disposableStore.add(new UserDataSyncClient(target));
    await client2.setUp();
    const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
    await testObject2.clear();
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], userSessionId);
  });
  test("test headers are reset after session is cleared from another server ", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    const client2 = disposableStore.add(new UserDataSyncClient(target));
    await client2.setUp();
    const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
    await testObject2.clear();
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.strictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test headers are reset after session is cleared from another server - started syncing again", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    const machineSessionId = target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"];
    const userSessionId = target.requestsWithAllHeaders[0].headers["X-User-Session-Id"];
    const client2 = disposableStore.add(new UserDataSyncClient(target));
    await client2.setUp();
    const testObject2 = client2.instantiationService.get(IUserDataSyncStoreService);
    await testObject2.clear();
    await testObject.manifest(null);
    await testObject.writeResource(SyncResource.Settings, "some content", null);
    await testObject.manifest(null);
    target.reset();
    await testObject.manifest(null);
    assert.strictEqual(target.requestsWithAllHeaders.length, 1);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], void 0);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-Machine-Session-Id"], machineSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], userSessionId);
    assert.notStrictEqual(target.requestsWithAllHeaders[0].headers["X-User-Session-Id"], void 0);
  });
  test("test rate limit on server with retry after", async () => {
    const target = new UserDataSyncTestServer(1, 1);
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    const promise = Event.toPromise(testObject.onDidChangeDonotMakeRequestsUntil);
    try {
      await testObject.manifest(null);
      assert.fail("should fail");
    } catch (e) {
      assert.ok(e instanceof UserDataSyncStoreError);
      assert.deepStrictEqual(e.code, UserDataSyncErrorCode.TooManyRequestsAndRetryAfter);
      await promise;
      assert.ok(!!testObject.donotMakeRequestsUntil);
    }
  });
  test("test donotMakeRequestsUntil is reset after retry time is finished", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const client = disposableStore.add(new UserDataSyncClient(new UserDataSyncTestServer(1, 0.25)));
      await client.setUp();
      const testObject = client.instantiationService.get(IUserDataSyncStoreService);
      await testObject.manifest(null);
      try {
        await testObject.manifest(null);
        assert.fail("should fail");
      } catch (e) {
      }
      const promise = Event.toPromise(testObject.onDidChangeDonotMakeRequestsUntil);
      await timeout(300);
      await promise;
      assert.ok(!testObject.donotMakeRequestsUntil);
    });
  });
  test("test donotMakeRequestsUntil is retrieved", async () => {
    const client = disposableStore.add(new UserDataSyncClient(new UserDataSyncTestServer(1, 1)));
    await client.setUp();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    await testObject.manifest(null);
    try {
      await testObject.manifest(null);
    } catch (e) {
    }
    const target = disposableStore.add(client.instantiationService.createInstance(UserDataSyncStoreService));
    assert.strictEqual(target.donotMakeRequestsUntil?.getTime(), testObject.donotMakeRequestsUntil?.getTime());
  });
  test("test donotMakeRequestsUntil is checked and reset after retreived", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const client = disposableStore.add(new UserDataSyncClient(new UserDataSyncTestServer(1, 0.25)));
      await client.setUp();
      const testObject = client.instantiationService.get(IUserDataSyncStoreService);
      await testObject.manifest(null);
      try {
        await testObject.manifest(null);
        assert.fail("should fail");
      } catch (e) {
      }
      await timeout(300);
      const target = disposableStore.add(client.instantiationService.createInstance(UserDataSyncStoreService));
      assert.ok(!target.donotMakeRequestsUntil);
    });
  });
  test("test read resource request handles 304", async () => {
    const target = new UserDataSyncTestServer();
    const client = disposableStore.add(new UserDataSyncClient(target));
    await client.setUp();
    await client.sync();
    const testObject = client.instantiationService.get(IUserDataSyncStoreService);
    const expected = await testObject.readResource(SyncResource.Settings, null);
    const actual = await testObject.readResource(SyncResource.Settings, expected);
    assert.strictEqual(actual, expected);
  });
});
suite("UserDataSyncRequestsSession", () => {
  const requestService = {
    _serviceBrand: void 0,
    onDidCompleteRequest: Event.None,
    async request() {
      return { res: { headers: {} }, stream: newWriteableBufferStream() };
    },
    async resolveProxy() {
      return void 0;
    },
    async lookupAuthorization() {
      return void 0;
    },
    async lookupKerberosAuthorization() {
      return void 0;
    },
    async loadCertificates() {
      return [];
    }
  };
  ensureNoDisposablesAreLeakedInTestSuite();
  test("too many requests are thrown when limit exceeded", async () => {
    const testObject = new RequestsSession(1, 500, requestService, new NullLogService());
    await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    try {
      await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    } catch (error) {
      assert.ok(error instanceof UserDataSyncStoreError);
      assert.strictEqual(error.code, UserDataSyncErrorCode.LocalTooManyRequests);
      return;
    }
    assert.fail("Should fail with limit exceeded");
  });
  test("requests are handled after session is expired", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const testObject = new RequestsSession(1, 100, requestService, new NullLogService());
    await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    await timeout(125);
    await testObject.request("url", { callSite: "test" }, CancellationToken.None);
  }));
  test("too many requests are thrown after session is expired", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const testObject = new RequestsSession(1, 100, requestService, new NullLogService());
    await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    await timeout(125);
    await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    try {
      await testObject.request("url", { callSite: "test" }, CancellationToken.None);
    } catch (error) {
      assert.ok(error instanceof UserDataSyncStoreError);
      assert.strictEqual(error.code, UserDataSyncErrorCode.LocalTooManyRequests);
      return;
    }
    assert.fail("Should fail with limit exceeded");
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXNlckRhdGFTeW5jXFx0ZXN0XFxjb21tb25cXHVzZXJEYXRhU3luY1N0b3JlU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG5ld1dyaXRlYWJsZUJ1ZmZlclN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdENvbXBsZXRlRXZlbnQsIElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgU3luY1Jlc291cmNlLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUsIFVzZXJEYXRhU3luY1N0b3JlRXJyb3IgfSBmcm9tICcuLi8uLi9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IFJlcXVlc3RzU2Vzc2lvbiwgVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luY1N0b3JlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNDbGllbnQsIFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIgfSBmcm9tICcuL3VzZXJEYXRhU3luY0NsaWVudC5qcyc7XG5cbnN1aXRlKCdVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndGVzdCByZWFkIG1hbmlmZXN0IGZvciB0aGUgZmlyc3QgdGltZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLUNsaWVudC1OYW1lJ10sIGAke3Byb2R1Y3RTZXJ2aWNlLmFwcGxpY2F0aW9uTmFtZX0ke2lzV2ViID8gJy13ZWInIDogJyd9YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLUNsaWVudC1WZXJzaW9uJ10sIHByb2R1Y3RTZXJ2aWNlLnZlcnNpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgcmVhZCBtYW5pZmVzdCBmb3IgdGhlIHNlY29uZCB0aW1lIHdoZW4gc2Vzc2lvbiBpcyBub3QgeWV0IGNyZWF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRjb25zdCBtYWNoaW5lU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ107XG5cblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCBtYWNoaW5lU2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3Qgc2Vzc2lvbiBpZCBoZWFkZXIgaXMgbm90IHNldCBpbiB0aGUgZmlyc3QgbWFuaWZlc3QgcmVxdWVzdCBhZnRlciBzZXNzaW9uIGlzIGNyZWF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRjb25zdCBtYWNoaW5lU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ107XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgJ3NvbWUgY29udGVudCcsIG51bGwpO1xuXG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgbWFjaGluZVNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IHNlc3Npb24gaWQgaGVhZGVyIGlzIHNldCBmcm9tIHRoZSBzZWNvbmQgbWFuaWZlc3QgcmVxdWVzdCBhZnRlciBzZXNzaW9uIGlzIGNyZWF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRjb25zdCBtYWNoaW5lU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ107XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgJ3NvbWUgY29udGVudCcsIG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCBtYWNoaW5lU2Vzc2lvbklkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgaGVhZGVycyBhcmUgc2VuZCBmb3Igd3JpdGUgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGNvbnN0IG1hY2hpbmVTZXNzaW9uSWQgPSB0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCAnc29tZSBjb250ZW50JywgbnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgJ3NvbWUgY29udGVudCcsIG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCBtYWNoaW5lU2Vzc2lvbklkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgaGVhZGVycyBhcmUgc2VuZCBmb3IgcmVhZCByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldHVwIHRoZSBjbGllbnRcblx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0Y29uc3QgbWFjaGluZVNlc3Npb25JZCA9IHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsICdzb21lIGNvbnRlbnQnLCBudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnJlYWRSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCBtYWNoaW5lU2Vzc2lvbklkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgaGVhZGVycyBhcmUgcmVzZXQgYWZ0ZXIgc2Vzc2lvbiBpcyBjbGVhcmVkICcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGNvbnN0IG1hY2hpbmVTZXNzaW9uSWQgPSB0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCAnc29tZSBjb250ZW50JywgbnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuY2xlYXIoKTtcblxuXHRcdHRhcmdldC5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCBtYWNoaW5lU2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3Qgb2xkIGhlYWRlcnMgYXJlIHNlbnQgYWZ0ZXIgc2Vzc2lvbiBpcyBjaGFuZ2VkIG9uIHNlcnZlciAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgdGhlIGNsaWVudFxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCAnc29tZSBjb250ZW50JywgbnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGNvbnN0IG1hY2hpbmVTZXNzaW9uSWQgPSB0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXTtcblx0XHRjb25zdCB1c2VyU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ107XG5cdFx0YXdhaXQgdGFyZ2V0LmNsZWFyKCk7XG5cblx0XHQvLyBjbGllbnQgMlxuXHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdDIud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsICdzb21lIGNvbnRlbnQnLCBudWxsKTtcblxuXHRcdHRhcmdldC5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCBtYWNoaW5lU2Vzc2lvbklkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1c2VyU2Vzc2lvbklkKTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCBvbGQgaGVhZGVycyBhcmUgcmVzZXQgZnJvbSBzZWNvbmQgcmVxdWVzdCBhZnRlciBzZXNzaW9uIGlzIGNoYW5nZWQgb24gc2VydmVyICcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsICdzb21lIGNvbnRlbnQnLCBudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdHRhcmdldC5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0Y29uc3QgbWFjaGluZVNlc3Npb25JZCA9IHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddO1xuXHRcdGNvbnN0IHVzZXJTZXNzaW9uSWQgPSB0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXTtcblx0XHRhd2FpdCB0YXJnZXQuY2xlYXIoKTtcblxuXHRcdC8vIGNsaWVudCAyXG5cdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRhd2FpdCBjbGllbnQyLnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdDIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Mi53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgJ3NvbWUgY29udGVudCcsIG51bGwpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgbWFjaGluZVNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXSwgdXNlclNlc3Npb25JZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3Qgb2xkIGhlYWRlcnMgYXJlIHNlbnQgYWZ0ZXIgc2Vzc2lvbiBpcyBjbGVhcmVkIGZyb20gYW5vdGhlciBzZXJ2ZXIgJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldHVwIHRoZSBjbGllbnRcblx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgJ3NvbWUgY29udGVudCcsIG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRjb25zdCBtYWNoaW5lU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ107XG5cdFx0Y29uc3QgdXNlclNlc3Npb25JZCA9IHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddO1xuXG5cdFx0Ly8gY2xpZW50IDJcblx0XHRjb25zdCBjbGllbnQyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KHRhcmdldCkpO1xuXHRcdGF3YWl0IGNsaWVudDIuc2V0VXAoKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0MiA9IGNsaWVudDIuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QyLmNsZWFyKCk7XG5cblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgbWFjaGluZVNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXSwgdXNlclNlc3Npb25JZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgaGVhZGVycyBhcmUgcmVzZXQgYWZ0ZXIgc2Vzc2lvbiBpcyBjbGVhcmVkIGZyb20gYW5vdGhlciBzZXJ2ZXIgJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldHVwIHRoZSBjbGllbnRcblx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRhd2FpdCBjbGllbnQuc2V0VXAoKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gY2xpZW50Lmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZVJlc291cmNlKFN5bmNSZXNvdXJjZS5TZXR0aW5ncywgJ3NvbWUgY29udGVudCcsIG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRjb25zdCBtYWNoaW5lU2Vzc2lvbklkID0gdGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ107XG5cblx0XHQvLyBjbGllbnQgMlxuXHRcdGNvbnN0IGNsaWVudDIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50Mi5zZXRVcCgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QyID0gY2xpZW50Mi5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdDIuY2xlYXIoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0dGFyZ2V0LnJlc2V0KCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ10sIG1hY2hpbmVTZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCBoZWFkZXJzIGFyZSByZXNldCBhZnRlciBzZXNzaW9uIGlzIGNsZWFyZWQgZnJvbSBhbm90aGVyIHNlcnZlciAtIHN0YXJ0ZWQgc3luY2luZyBhZ2FpbicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsICdzb21lIGNvbnRlbnQnLCBudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdHRhcmdldC5yZXNldCgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0Y29uc3QgbWFjaGluZVNlc3Npb25JZCA9IHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddO1xuXHRcdGNvbnN0IHVzZXJTZXNzaW9uSWQgPSB0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1Vc2VyLVNlc3Npb24tSWQnXTtcblxuXHRcdC8vIGNsaWVudCAyXG5cdFx0Y29uc3QgY2xpZW50MiA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVzZXJEYXRhU3luY0NsaWVudCh0YXJnZXQpKTtcblx0XHRhd2FpdCBjbGllbnQyLnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdDIgPSBjbGllbnQyLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Mi5jbGVhcigpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCAnc29tZSBjb250ZW50JywgbnVsbCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5tYW5pZmVzdChudWxsKTtcblx0XHR0YXJnZXQucmVzZXQoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLU1hY2hpbmUtU2Vzc2lvbi1JZCddLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0YXJnZXQucmVxdWVzdHNXaXRoQWxsSGVhZGVyc1swXS5oZWFkZXJzIVsnWC1NYWNoaW5lLVNlc3Npb24tSWQnXSwgbWFjaGluZVNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRhcmdldC5yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzWzBdLmhlYWRlcnMhWydYLVVzZXItU2Vzc2lvbi1JZCddLCB1c2VyU2Vzc2lvbklkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGFyZ2V0LnJlcXVlc3RzV2l0aEFsbEhlYWRlcnNbMF0uaGVhZGVycyFbJ1gtVXNlci1TZXNzaW9uLUlkJ10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgcmF0ZSBsaW1pdCBvbiBzZXJ2ZXIgd2l0aCByZXRyeSBhZnRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigxLCAxKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlRG9ub3RNYWtlUmVxdWVzdHNVbnRpbCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnc2hvdWxkIGZhaWwnKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRhc3NlcnQub2soZSBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY1N0b3JlRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoPFVzZXJEYXRhU3luY1N0b3JlRXJyb3I+ZSkuY29kZSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlRvb01hbnlSZXF1ZXN0c0FuZFJldHJ5QWZ0ZXIpO1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRcdGFzc2VydC5vayghIXRlc3RPYmplY3QuZG9ub3RNYWtlUmVxdWVzdHNVbnRpbCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IGRvbm90TWFrZVJlcXVlc3RzVW50aWwgaXMgcmVzZXQgYWZ0ZXIgcmV0cnkgdGltZSBpcyBmaW5pc2hlZCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQobmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoMSwgMC4yNSkpKTtcblx0XHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnc2hvdWxkIGZhaWwnKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHsgfVxuXG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VEb25vdE1ha2VSZXF1ZXN0c1VudGlsKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMzAwKTtcblx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0XHRhc3NlcnQub2soIXRlc3RPYmplY3QuZG9ub3RNYWtlUmVxdWVzdHNVbnRpbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QgZG9ub3RNYWtlUmVxdWVzdHNVbnRpbCBpcyByZXRyaWV2ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2xpZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFTeW5jQ2xpZW50KG5ldyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyKDEsIDEpKSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdH0gY2F0Y2ggKGUpIHsgfVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5kb25vdE1ha2VSZXF1ZXN0c1VudGlsPy5nZXRUaW1lKCksIHRlc3RPYmplY3QuZG9ub3RNYWtlUmVxdWVzdHNVbnRpbD8uZ2V0VGltZSgpKTtcblx0fSk7XG5cblx0dGVzdCgndGVzdCBkb25vdE1ha2VSZXF1ZXN0c1VudGlsIGlzIGNoZWNrZWQgYW5kIHJlc2V0IGFmdGVyIHJldHJlaXZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQobmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoMSwgMC4yNSkpKTtcblx0XHRcdGF3YWl0IGNsaWVudC5zZXRVcCgpO1xuXHRcdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSk7XG5cblx0XHRcdGF3YWl0IHRlc3RPYmplY3QubWFuaWZlc3QobnVsbCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0ZXN0T2JqZWN0Lm1hbmlmZXN0KG51bGwpO1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnc2hvdWxkIGZhaWwnKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHsgfVxuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDMwMCk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNsaWVudC5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpKTtcblx0XHRcdGFzc2VydC5vayghdGFyZ2V0LmRvbm90TWFrZVJlcXVlc3RzVW50aWwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0IHJlYWQgcmVzb3VyY2UgcmVxdWVzdCBoYW5kbGVzIDMwNCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXR1cCB0aGUgY2xpZW50XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbmV3IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIoKTtcblx0XHRjb25zdCBjbGllbnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBVc2VyRGF0YVN5bmNDbGllbnQodGFyZ2V0KSk7XG5cdFx0YXdhaXQgY2xpZW50LnNldFVwKCk7XG5cdFx0YXdhaXQgY2xpZW50LnN5bmMoKTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjbGllbnQuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gYXdhaXQgdGVzdE9iamVjdC5yZWFkUmVzb3VyY2UoU3luY1Jlc291cmNlLlNldHRpbmdzLCBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRSZXNvdXJjZShTeW5jUmVzb3VyY2UuU2V0dGluZ3MsIGV4cGVjdGVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cbn0pO1xuXG5zdWl0ZSgnVXNlckRhdGFTeW5jUmVxdWVzdHNTZXNzaW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UgPSB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ29tcGxldGVSZXF1ZXN0OiBFdmVudC5Ob25lIGFzIEV2ZW50PElSZXF1ZXN0Q29tcGxldGVFdmVudD4sXG5cdFx0YXN5bmMgcmVxdWVzdCgpIHsgcmV0dXJuIHsgcmVzOiB7IGhlYWRlcnM6IHt9IH0sIHN0cmVhbTogbmV3V3JpdGVhYmxlQnVmZmVyU3RyZWFtKCkgfTsgfSxcblx0XHRhc3luYyByZXNvbHZlUHJveHkoKSB7IHJldHVybiB1bmRlZmluZWQ7IH0sXG5cdFx0YXN5bmMgbG9va3VwQXV0aG9yaXphdGlvbigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfSxcblx0XHRhc3luYyBsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24oKSB7IHJldHVybiB1bmRlZmluZWQ7IH0sXG5cdFx0YXN5bmMgbG9hZENlcnRpZmljYXRlcygpIHsgcmV0dXJuIFtdOyB9XG5cdH07XG5cblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd0b28gbWFueSByZXF1ZXN0cyBhcmUgdGhyb3duIHdoZW4gbGltaXQgZXhjZWVkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBSZXF1ZXN0c1Nlc3Npb24oMSwgNTAwLCByZXF1ZXN0U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QucmVxdWVzdCgndXJsJywgeyBjYWxsU2l0ZTogJ3Rlc3QnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QucmVxdWVzdCgndXJsJywgeyBjYWxsU2l0ZTogJ3Rlc3QnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPFVzZXJEYXRhU3luY1N0b3JlRXJyb3I+ZXJyb3IpLmNvZGUsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Mb2NhbFRvb01hbnlSZXF1ZXN0cyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFzc2VydC5mYWlsKCdTaG91bGQgZmFpbCB3aXRoIGxpbWl0IGV4Y2VlZGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVlc3RzIGFyZSBoYW5kbGVkIGFmdGVyIHNlc3Npb24gaXMgZXhwaXJlZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgUmVxdWVzdHNTZXNzaW9uKDEsIDEwMCwgcmVxdWVzdFNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnJlcXVlc3QoJ3VybCcsIHsgY2FsbFNpdGU6ICd0ZXN0JyB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEyNSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5yZXF1ZXN0KCd1cmwnLCB7IGNhbGxTaXRlOiAndGVzdCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH0pKTtcblxuXHR0ZXN0KCd0b28gbWFueSByZXF1ZXN0cyBhcmUgdGhyb3duIGFmdGVyIHNlc3Npb24gaXMgZXhwaXJlZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgUmVxdWVzdHNTZXNzaW9uKDEsIDEwMCwgcmVxdWVzdFNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnJlcXVlc3QoJ3VybCcsIHsgY2FsbFNpdGU6ICd0ZXN0JyB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEyNSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5yZXF1ZXN0KCd1cmwnLCB7IGNhbGxTaXRlOiAndGVzdCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5yZXF1ZXN0KCd1cmwnLCB7IGNhbGxTaXRlOiAndGVzdCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY1N0b3JlRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8VXNlckRhdGFTeW5jU3RvcmVFcnJvcj5lcnJvcikuY29kZSwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsVG9vTWFueVJlcXVlc3RzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCBmYWlsIHdpdGggbGltaXQgZXhjZWVkZWQnKTtcblx0fSkpO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLDJCQUEyQixjQUFjLHVCQUF1Qiw4QkFBOEI7QUFDdkcsU0FBUyxpQkFBaUIsZ0NBQWdDO0FBQzFELFNBQVMsb0JBQW9CLDhCQUE4QjtBQUUzRCxNQUFNLDRCQUE0QixNQUFNO0FBRXZDLFFBQU0sa0JBQWtCLHdDQUF3QztBQUVoRSxPQUFLLHlDQUF5QyxZQUFZO0FBRXpELFVBQU0sU0FBUyxJQUFJLHVCQUF1QjtBQUMxQyxVQUFNLFNBQVMsZ0JBQWdCLElBQUksSUFBSSxtQkFBbUIsTUFBTSxDQUFDO0FBQ2pFLFVBQU0sT0FBTyxNQUFNO0FBQ25CLFVBQU0sYUFBYSxPQUFPLHFCQUFxQixJQUFJLHlCQUF5QjtBQUM1RSxVQUFNLGlCQUFpQixPQUFPLHFCQUFxQixJQUFJLGVBQWU7QUFFdEUsVUFBTSxXQUFXLFNBQVMsSUFBSTtBQUU5QixXQUFPLFlBQVksT0FBTyx1QkFBdUIsUUFBUSxDQUFDO0FBQzFELFdBQU8sWUFBWSxPQUFPLHVCQUF1QixDQUFDLEVBQUUsUUFBUyxlQUFlLEdBQUcsR0FBRyxlQUFlLGVBQWUsR0FBRyxRQUFRLFNBQVMsRUFBRSxFQUFFO0FBQ3hJLFdBQU8sWUFBWSxPQUFPLHVCQUF1QixDQUFDLEVBQUUsUUFBUyxrQkFBa0IsR0FBRyxlQUFlLE9BQU87QUFDeEcsV0FBTyxlQUFlLE9BQU8sdUJBQXVCLENBQUMsRUFBRSxRQUFTLHNCQUFzQixHQUFHLE1BQVM7QUFDbEcsV0FBTyxZQUFZLE9BQU8sdUJBQXVC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
