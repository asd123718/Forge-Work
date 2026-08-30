import assert from "assert";
import * as sinon from "sinon";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { KnownStorageProvider } from "../../../encryption/common/encryptionService.js";
import { NullLogService } from "../../../log/common/log.js";
import { BaseSecretStorageService, CROSS_APP_SHARED_SECRET_KEYS, secretStorageKey } from "../../common/secrets.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../storage/common/storage.js";
class TestEncryptionService {
  constructor() {
    this.encryptedPrefix = "encrypted+";
  }
  // prefix to simulate encryption
  setUsePlainTextEncryption() {
    return Promise.resolve();
  }
  getKeyStorageProvider() {
    return Promise.resolve(KnownStorageProvider.basicText);
  }
  encrypt(value) {
    return Promise.resolve(this.encryptedPrefix + value);
  }
  decrypt(value) {
    return Promise.resolve(value.substring(this.encryptedPrefix.length));
  }
  isEncryptionAvailable() {
    return Promise.resolve(true);
  }
}
class TestFailingEncryptionService extends TestEncryptionService {
  constructor() {
    super(...arguments);
    this.decryptCalls = 0;
  }
  decrypt(_value) {
    this.decryptCalls++;
    return Promise.reject(new Error("Cannot decrypt stale secret"));
  }
}
class TestNoEncryptionService {
  setUsePlainTextEncryption() {
    throw new Error("Method not implemented.");
  }
  getKeyStorageProvider() {
    throw new Error("Method not implemented.");
  }
  encrypt(value) {
    throw new Error("Method not implemented.");
  }
  decrypt(value) {
    throw new Error("Method not implemented.");
  }
  isEncryptionAvailable() {
    return Promise.resolve(false);
  }
}
suite("secrets", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("BaseSecretStorageService useInMemoryStorage=true", () => {
    let service;
    let spyEncryptionService;
    let sandbox;
    setup(() => {
      sandbox = sinon.createSandbox();
      spyEncryptionService = sandbox.spy(new TestEncryptionService());
      service = store.add(new BaseSecretStorageService(
        true,
        store.add(new InMemoryStorageService()),
        spyEncryptionService,
        store.add(new NullLogService())
      ));
    });
    teardown(() => {
      sandbox.restore();
    });
    test("type", async () => {
      assert.strictEqual(service.type, "unknown");
      await service.set("my-secret", "my-secret-value");
      assert.strictEqual(service.type, "in-memory");
    });
    test("set and get", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      await service.set(key, value);
      const result = await service.get(key);
      assert.strictEqual(result, value);
      assert.strictEqual(spyEncryptionService.encrypt.callCount, 0);
      assert.strictEqual(spyEncryptionService.decrypt.callCount, 0);
    });
    test("delete", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      await service.set(key, value);
      await service.delete(key);
      const result = await service.get(key);
      assert.strictEqual(result, void 0);
    });
    test("onDidChangeSecret", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      let eventFired = false;
      store.add(service.onDidChangeSecret((changedKey) => {
        assert.strictEqual(changedKey, key);
        eventFired = true;
      }));
      await service.set(key, value);
      assert.strictEqual(eventFired, true);
    });
  });
  suite("BaseSecretStorageService useInMemoryStorage=false", () => {
    let service;
    let spyEncryptionService;
    let sandbox;
    setup(() => {
      sandbox = sinon.createSandbox();
      spyEncryptionService = sandbox.spy(new TestEncryptionService());
      service = store.add(
        new BaseSecretStorageService(
          false,
          store.add(new InMemoryStorageService()),
          spyEncryptionService,
          store.add(new NullLogService())
        )
      );
    });
    teardown(() => {
      sandbox.restore();
    });
    test("type", async () => {
      assert.strictEqual(service.type, "unknown");
      await service.set("my-secret", "my-secret-value");
      assert.strictEqual(service.type, "persisted");
    });
    test("set and get", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      await service.set(key, value);
      const result = await service.get(key);
      assert.strictEqual(result, value);
      assert.strictEqual(spyEncryptionService.encrypt.callCount, 1);
      assert.strictEqual(spyEncryptionService.decrypt.callCount, 1);
    });
    test("delete", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      await service.set(key, value);
      await service.delete(key);
      const result = await service.get(key);
      assert.strictEqual(result, void 0);
    });
    test("get removes stale persisted secret when decryption fails", async () => {
      const key = "my-secret";
      const fullKey = secretStorageKey(key);
      const storageService = store.add(new InMemoryStorageService());
      const encryptionService = new TestFailingEncryptionService();
      const failingService = store.add(
        new BaseSecretStorageService(
          false,
          storageService,
          encryptionService,
          store.add(new NullLogService())
        )
      );
      storageService.store(fullKey, "encrypted+my-secret-value", StorageScope.APPLICATION, StorageTarget.MACHINE);
      assert.strictEqual(await failingService.get(key), void 0);
      assert.strictEqual(encryptionService.decryptCalls, 1);
      assert.strictEqual(storageService.get(fullKey, StorageScope.APPLICATION), void 0);
      assert.strictEqual(await failingService.get(key), void 0);
      assert.strictEqual(encryptionService.decryptCalls, 1);
    });
    test("onDidChangeSecret", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      let eventFired = false;
      store.add(service.onDidChangeSecret((changedKey) => {
        assert.strictEqual(changedKey, key);
        eventFired = true;
      }));
      await service.set(key, value);
      assert.strictEqual(eventFired, true);
    });
  });
  suite("BaseSecretStorageService useInMemoryStorage=false, encryption not available", () => {
    let service;
    let spyNoEncryptionService;
    let sandbox;
    setup(() => {
      sandbox = sinon.createSandbox();
      spyNoEncryptionService = sandbox.spy(new TestNoEncryptionService());
      service = store.add(
        new BaseSecretStorageService(
          false,
          store.add(new InMemoryStorageService()),
          spyNoEncryptionService,
          store.add(new NullLogService())
        )
      );
    });
    teardown(() => {
      sandbox.restore();
    });
    test("type", async () => {
      assert.strictEqual(service.type, "unknown");
      await service.set("my-secret", "my-secret-value");
      assert.strictEqual(service.type, "in-memory");
    });
    test("set and get", async () => {
      const key = "my-secret";
      const value = "my-secret-value";
      await service.set(key, value);
      const result = await service.get(key);
      assert.strictEqual(result, value);
      assert.strictEqual(spyNoEncryptionService.encrypt.callCount, 0);
      assert.strictEqual(spyNoEncryptionService.decrypt.callCount, 0);
    });
  });
  suite("BaseSecretStorageService cross-app shared secrets", () => {
    class TestSharedSecretStorageService extends BaseSecretStorageService {
      useSharedStorage(key) {
        return CROSS_APP_SHARED_SECRET_KEYS.includes(key);
      }
    }
    let service;
    let storageService;
    let sandbox;
    setup(() => {
      sandbox = sinon.createSandbox();
      storageService = store.add(new InMemoryStorageService());
      service = store.add(
        new TestSharedSecretStorageService(
          false,
          storageService,
          sandbox.spy(new TestEncryptionService()),
          store.add(new NullLogService())
        )
      );
    });
    teardown(() => {
      sandbox.restore();
    });
    test("shared keys are stored and read from APPLICATION_SHARED", async () => {
      const sharedKey = CROSS_APP_SHARED_SECRET_KEYS[0];
      const value = "shared-secret-value";
      await service.set(sharedKey, value);
      const result = await service.get(sharedKey);
      assert.strictEqual(result, value);
      const regularKey = "regular-secret";
      await service.set(regularKey, "regular-value");
      assert.strictEqual(await service.get(regularKey), "regular-value");
    });
    test("onDidChangeSecret fires for APPLICATION_SHARED changes", async () => {
      const sharedKey = CROSS_APP_SHARED_SECRET_KEYS[0];
      let eventFired = false;
      store.add(service.onDidChangeSecret((changedKey) => {
        assert.strictEqual(changedKey, sharedKey);
        eventFired = true;
      }));
      await service.set(sharedKey, "value");
      assert.strictEqual(eventFired, true);
    });
    test("deleting a shared key removes it", async () => {
      const sharedKey = CROSS_APP_SHARED_SECRET_KEYS[0];
      await service.set(sharedKey, "value");
      assert.strictEqual(await service.get(sharedKey), "value");
      await service.delete(sharedKey);
      assert.strictEqual(await service.get(sharedKey), void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcc2VjcmV0c1xcdGVzdFxcY29tbW9uXFxzZWNyZXRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElFbmNyeXB0aW9uU2VydmljZSwgS25vd25TdG9yYWdlUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9lbmNyeXB0aW9uL2NvbW1vbi9lbmNyeXB0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEJhc2VTZWNyZXRTdG9yYWdlU2VydmljZSwgQ1JPU1NfQVBQX1NIQVJFRF9TRUNSRVRfS0VZUywgc2VjcmV0U3RvcmFnZUtleSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZWNyZXRzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuXG5jbGFzcyBUZXN0RW5jcnlwdGlvblNlcnZpY2UgaW1wbGVtZW50cyBJRW5jcnlwdGlvblNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZW5jcnlwdGVkUHJlZml4ID0gJ2VuY3J5cHRlZCsnOyAvLyBwcmVmaXggdG8gc2ltdWxhdGUgZW5jcnlwdGlvblxuXHRzZXRVc2VQbGFpblRleHRFbmNyeXB0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXHRnZXRLZXlTdG9yYWdlUHJvdmlkZXIoKTogUHJvbWlzZTxLbm93blN0b3JhZ2VQcm92aWRlcj4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoS25vd25TdG9yYWdlUHJvdmlkZXIuYmFzaWNUZXh0KTtcblx0fVxuXHRlbmNyeXB0KHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5lbmNyeXB0ZWRQcmVmaXggKyB2YWx1ZSk7XG5cdH1cblx0ZGVjcnlwdCh2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHZhbHVlLnN1YnN0cmluZyh0aGlzLmVuY3J5cHRlZFByZWZpeC5sZW5ndGgpKTtcblx0fVxuXHRpc0VuY3J5cHRpb25BdmFpbGFibGUoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0RmFpbGluZ0VuY3J5cHRpb25TZXJ2aWNlIGV4dGVuZHMgVGVzdEVuY3J5cHRpb25TZXJ2aWNlIHtcblx0ZGVjcnlwdENhbGxzID0gMDtcblxuXHRvdmVycmlkZSBkZWNyeXB0KF92YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0aGlzLmRlY3J5cHRDYWxscysrO1xuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ0Nhbm5vdCBkZWNyeXB0IHN0YWxlIHNlY3JldCcpKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0Tm9FbmNyeXB0aW9uU2VydmljZSBpbXBsZW1lbnRzIElFbmNyeXB0aW9uU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0c2V0VXNlUGxhaW5UZXh0RW5jcnlwdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0Z2V0S2V5U3RvcmFnZVByb3ZpZGVyKCk6IFByb21pc2U8S25vd25TdG9yYWdlUHJvdmlkZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0ZW5jcnlwdCh2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0ZGVjcnlwdCh2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0aXNFbmNyeXB0aW9uQXZhaWxhYmxlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHR9XG59XG5cbnN1aXRlKCdzZWNyZXRzJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2UgdXNlSW5NZW1vcnlTdG9yYWdlPXRydWUnLCAoKSA9PiB7XG5cdFx0bGV0IHNlcnZpY2U6IEJhc2VTZWNyZXRTdG9yYWdlU2VydmljZTtcblx0XHRsZXQgc3B5RW5jcnlwdGlvblNlcnZpY2U6IHNpbm9uLlNpbm9uU3BpZWRJbnN0YW5jZTxUZXN0RW5jcnlwdGlvblNlcnZpY2U+O1xuXHRcdGxldCBzYW5kYm94OiBzaW5vbi5TaW5vblNhbmRib3g7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzYW5kYm94ID0gc2lub24uY3JlYXRlU2FuZGJveCgpO1xuXHRcdFx0c3B5RW5jcnlwdGlvblNlcnZpY2UgPSBzYW5kYm94LnNweShuZXcgVGVzdEVuY3J5cHRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0c2VydmljZSA9IHN0b3JlLmFkZChuZXcgQmFzZVNlY3JldFN0b3JhZ2VTZXJ2aWNlKFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSksXG5cdFx0XHRcdHNweUVuY3J5cHRpb25TZXJ2aWNlLFxuXHRcdFx0XHRzdG9yZS5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpXG5cdFx0XHQpKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHNhbmRib3gucmVzdG9yZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHlwZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnR5cGUsICd1bmtub3duJyk7XG5cdFx0XHQvLyB0cmlnZ2VyIGxhenkgaW5pdGlhbGl6YXRpb25cblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2V0KCdteS1zZWNyZXQnLCAnbXktc2VjcmV0LXZhbHVlJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnR5cGUsICdpbi1tZW1vcnknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NldCBhbmQgZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gJ215LXNlY3JldCc7XG5cdFx0XHRjb25zdCB2YWx1ZSA9ICdteS1zZWNyZXQtdmFsdWUnO1xuXHRcdFx0YXdhaXQgc2VydmljZS5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldChrZXkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdmFsdWUpO1xuXG5cdFx0XHQvLyBBZGRpdGlvbmFsbHkgZW5zdXJlIHRoZSBlbmNyeXB0aW9uc2VydmljZSB3YXMgbm90IHVzZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcHlFbmNyeXB0aW9uU2VydmljZS5lbmNyeXB0LmNhbGxDb3VudCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3B5RW5jcnlwdGlvblNlcnZpY2UuZGVjcnlwdC5jYWxsQ291bnQsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gJ215LXNlY3JldCc7XG5cdFx0XHRjb25zdCB2YWx1ZSA9ICdteS1zZWNyZXQtdmFsdWUnO1xuXHRcdFx0YXdhaXQgc2VydmljZS5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmRlbGV0ZShrZXkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXQoa2V5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbkRpZENoYW5nZVNlY3JldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9ICdteS1zZWNyZXQnO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAnbXktc2VjcmV0LXZhbHVlJztcblx0XHRcdGxldCBldmVudEZpcmVkID0gZmFsc2U7XG5cdFx0XHRzdG9yZS5hZGQoc2VydmljZS5vbkRpZENoYW5nZVNlY3JldCgoY2hhbmdlZEtleSkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZEtleSwga2V5KTtcblx0XHRcdFx0ZXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldChrZXksIHZhbHVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudEZpcmVkLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0Jhc2VTZWNyZXRTdG9yYWdlU2VydmljZSB1c2VJbk1lbW9yeVN0b3JhZ2U9ZmFsc2UnLCAoKSA9PiB7XG5cdFx0bGV0IHNlcnZpY2U6IEJhc2VTZWNyZXRTdG9yYWdlU2VydmljZTtcblx0XHRsZXQgc3B5RW5jcnlwdGlvblNlcnZpY2U6IHNpbm9uLlNpbm9uU3BpZWRJbnN0YW5jZTxUZXN0RW5jcnlwdGlvblNlcnZpY2U+O1xuXHRcdGxldCBzYW5kYm94OiBzaW5vbi5TaW5vblNhbmRib3g7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzYW5kYm94ID0gc2lub24uY3JlYXRlU2FuZGJveCgpO1xuXHRcdFx0c3B5RW5jcnlwdGlvblNlcnZpY2UgPSBzYW5kYm94LnNweShuZXcgVGVzdEVuY3J5cHRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0c2VydmljZSA9IHN0b3JlLmFkZChuZXcgQmFzZVNlY3JldFN0b3JhZ2VTZXJ2aWNlKFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0c3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpLFxuXHRcdFx0XHRzcHlFbmNyeXB0aW9uU2VydmljZSxcblx0XHRcdFx0c3RvcmUuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSlcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRzYW5kYm94LnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3R5cGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50eXBlLCAndW5rbm93bicpO1xuXHRcdFx0Ly8gdHJpZ2dlciBsYXp5IGluaXRpYWxpemF0aW9uXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldCgnbXktc2VjcmV0JywgJ215LXNlY3JldC12YWx1ZScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50eXBlLCAncGVyc2lzdGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXQgYW5kIGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9ICdteS1zZWNyZXQnO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAnbXktc2VjcmV0LXZhbHVlJztcblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXQoa2V5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHZhbHVlKTtcblxuXHRcdFx0Ly8gQWRkaXRpb25hbGx5IGVuc3VyZSB0aGUgZW5jcnlwdGlvbnNlcnZpY2Ugd2FzIG5vdCB1c2VkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3B5RW5jcnlwdGlvblNlcnZpY2UuZW5jcnlwdC5jYWxsQ291bnQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNweUVuY3J5cHRpb25TZXJ2aWNlLmRlY3J5cHQuY2FsbENvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9ICdteS1zZWNyZXQnO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAnbXktc2VjcmV0LXZhbHVlJztcblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5kZWxldGUoa2V5KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0KGtleSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0IHJlbW92ZXMgc3RhbGUgcGVyc2lzdGVkIHNlY3JldCB3aGVuIGRlY3J5cHRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSAnbXktc2VjcmV0Jztcblx0XHRcdGNvbnN0IGZ1bGxLZXkgPSBzZWNyZXRTdG9yYWdlS2V5KGtleSk7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGVuY3J5cHRpb25TZXJ2aWNlID0gbmV3IFRlc3RGYWlsaW5nRW5jcnlwdGlvblNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGZhaWxpbmdTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2UoXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdFx0ZW5jcnlwdGlvblNlcnZpY2UsXG5cdFx0XHRcdHN0b3JlLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSkpXG5cdFx0XHQpO1xuXG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShmdWxsS2V5LCAnZW5jcnlwdGVkK215LXNlY3JldC12YWx1ZScsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBmYWlsaW5nU2VydmljZS5nZXQoa2V5KSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmNyeXB0aW9uU2VydmljZS5kZWNyeXB0Q2FsbHMsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JhZ2VTZXJ2aWNlLmdldChmdWxsS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZmFpbGluZ1NlcnZpY2UuZ2V0KGtleSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5jcnlwdGlvblNlcnZpY2UuZGVjcnlwdENhbGxzLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29uRGlkQ2hhbmdlU2VjcmV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gJ215LXNlY3JldCc7XG5cdFx0XHRjb25zdCB2YWx1ZSA9ICdteS1zZWNyZXQtdmFsdWUnO1xuXHRcdFx0bGV0IGV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlU2VjcmV0KChjaGFuZ2VkS2V5KSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkS2V5LCBrZXkpO1xuXHRcdFx0XHRldmVudEZpcmVkID0gdHJ1ZTtcblx0XHRcdH0pKTtcblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RmlyZWQsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQmFzZVNlY3JldFN0b3JhZ2VTZXJ2aWNlIHVzZUluTWVtb3J5U3RvcmFnZT1mYWxzZSwgZW5jcnlwdGlvbiBub3QgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdGxldCBzZXJ2aWNlOiBCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2U7XG5cdFx0bGV0IHNweU5vRW5jcnlwdGlvblNlcnZpY2U6IHNpbm9uLlNpbm9uU3BpZWRJbnN0YW5jZTxUZXN0RW5jcnlwdGlvblNlcnZpY2U+O1xuXHRcdGxldCBzYW5kYm94OiBzaW5vbi5TaW5vblNhbmRib3g7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzYW5kYm94ID0gc2lub24uY3JlYXRlU2FuZGJveCgpO1xuXHRcdFx0c3B5Tm9FbmNyeXB0aW9uU2VydmljZSA9IHNhbmRib3guc3B5KG5ldyBUZXN0Tm9FbmNyeXB0aW9uU2VydmljZSgpKTtcblx0XHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEJhc2VTZWNyZXRTdG9yYWdlU2VydmljZShcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdFx0c3B5Tm9FbmNyeXB0aW9uU2VydmljZSxcblx0XHRcdFx0c3RvcmUuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSlcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRzYW5kYm94LnJlc3RvcmUoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3R5cGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50eXBlLCAndW5rbm93bicpO1xuXHRcdFx0Ly8gdHJpZ2dlciBsYXp5IGluaXRpYWxpemF0aW9uXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldCgnbXktc2VjcmV0JywgJ215LXNlY3JldC12YWx1ZScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50eXBlLCAnaW4tbWVtb3J5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXQgYW5kIGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9ICdteS1zZWNyZXQnO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAnbXktc2VjcmV0LXZhbHVlJztcblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXQoa2V5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHZhbHVlKTtcblxuXHRcdFx0Ly8gQWRkaXRpb25hbGx5IGVuc3VyZSB0aGUgZW5jcnlwdGlvbnNlcnZpY2Ugd2FzIG5vdCB1c2VkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3B5Tm9FbmNyeXB0aW9uU2VydmljZS5lbmNyeXB0LmNhbGxDb3VudCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3B5Tm9FbmNyeXB0aW9uU2VydmljZS5kZWNyeXB0LmNhbGxDb3VudCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2UgY3Jvc3MtYXBwIHNoYXJlZCBzZWNyZXRzJywgKCkgPT4ge1xuXG5cdFx0Y2xhc3MgVGVzdFNoYXJlZFNlY3JldFN0b3JhZ2VTZXJ2aWNlIGV4dGVuZHMgQmFzZVNlY3JldFN0b3JhZ2VTZXJ2aWNlIHtcblx0XHRcdHByb3RlY3RlZCBvdmVycmlkZSB1c2VTaGFyZWRTdG9yYWdlKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiBDUk9TU19BUFBfU0hBUkVEX1NFQ1JFVF9LRVlTLmluY2x1ZGVzKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHNlcnZpY2U6IEJhc2VTZWNyZXRTdG9yYWdlU2VydmljZTtcblx0XHRsZXQgc3RvcmFnZVNlcnZpY2U6IEluTWVtb3J5U3RvcmFnZVNlcnZpY2U7XG5cdFx0bGV0IHNhbmRib3g6IHNpbm9uLlNpbm9uU2FuZGJveDtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdHNhbmRib3ggPSBzaW5vbi5jcmVhdGVTYW5kYm94KCk7XG5cdFx0XHRzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RTaGFyZWRTZWNyZXRTdG9yYWdlU2VydmljZShcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0XHRzYW5kYm94LnNweShuZXcgVGVzdEVuY3J5cHRpb25TZXJ2aWNlKCkpLFxuXHRcdFx0XHRzdG9yZS5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpKVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHNhbmRib3gucmVzdG9yZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hhcmVkIGtleXMgYXJlIHN0b3JlZCBhbmQgcmVhZCBmcm9tIEFQUExJQ0FUSU9OX1NIQVJFRCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNoYXJlZEtleSA9IENST1NTX0FQUF9TSEFSRURfU0VDUkVUX0tFWVNbMF07XG5cdFx0XHRjb25zdCB2YWx1ZSA9ICdzaGFyZWQtc2VjcmV0LXZhbHVlJztcblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2V0KHNoYXJlZEtleSwgdmFsdWUpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXQoc2hhcmVkS2V5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHZhbHVlKTtcblxuXHRcdFx0Ly8gTm9uLXNoYXJlZCBrZXkgc2hvdWxkIHN0aWxsIHdvcmsgdmlhIEFQUExJQ0FUSU9OIHNjb3BlXG5cdFx0XHRjb25zdCByZWd1bGFyS2V5ID0gJ3JlZ3VsYXItc2VjcmV0Jztcblx0XHRcdGF3YWl0IHNlcnZpY2Uuc2V0KHJlZ3VsYXJLZXksICdyZWd1bGFyLXZhbHVlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5nZXQocmVndWxhcktleSksICdyZWd1bGFyLXZhbHVlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbkRpZENoYW5nZVNlY3JldCBmaXJlcyBmb3IgQVBQTElDQVRJT05fU0hBUkVEIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzaGFyZWRLZXkgPSBDUk9TU19BUFBfU0hBUkVEX1NFQ1JFVF9LRVlTWzBdO1xuXHRcdFx0bGV0IGV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlU2VjcmV0KGNoYW5nZWRLZXkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZEtleSwgc2hhcmVkS2V5KTtcblx0XHRcdFx0ZXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0XHR9KSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnNldChzaGFyZWRLZXksICd2YWx1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RmlyZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRpbmcgYSBzaGFyZWQga2V5IHJlbW92ZXMgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzaGFyZWRLZXkgPSBDUk9TU19BUFBfU0hBUkVEX1NFQ1JFVF9LRVlTWzBdO1xuXHRcdFx0YXdhaXQgc2VydmljZS5zZXQoc2hhcmVkS2V5LCAndmFsdWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmdldChzaGFyZWRLZXkpLCAndmFsdWUnKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuZGVsZXRlKHNoYXJlZEtleSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5nZXQoc2hhcmVkS2V5KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFdBQVc7QUFDdkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBNkIsNEJBQTRCO0FBQ3pELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCLDhCQUE4Qix3QkFBd0I7QUFDekYsU0FBUyx3QkFBd0IsY0FBYyxxQkFBcUI7QUFFcEUsTUFBTSxzQkFBb0Q7QUFBQSxFQUExRDtBQUVDLFNBQVEsa0JBQWtCO0FBQUE7QUFBQTtBQUFBLEVBQzFCLDRCQUEyQztBQUMxQyxXQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ3hCO0FBQUEsRUFDQSx3QkFBdUQ7QUFDdEQsV0FBTyxRQUFRLFFBQVEscUJBQXFCLFNBQVM7QUFBQSxFQUN0RDtBQUFBLEVBQ0EsUUFBUSxPQUFnQztBQUN2QyxXQUFPLFFBQVEsUUFBUSxLQUFLLGtCQUFrQixLQUFLO0FBQUEs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
