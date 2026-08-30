import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileChangesEvent, FileChangeType } from "../../../files/common/files.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostFileMonitorService } from "../../node/agentHostFileMonitorService.js";
suite("AgentHostFileMonitorService", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function acquire(monitor, folder, callback, options) {
    const registration = monitor.acquire(folder, callback, options);
    assert.ok(registration, "expected file monitor acquisition to succeed");
    return registration;
  }
  test("shares one recursive watcher per folder/options and refcounts callbacks", () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const fileService = new TestFileService();
      const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
      const folder = URI.file("/repo");
      let first = 0;
      let second = 0;
      const firstRegistration = acquire(monitor, folder, () => first++, { debounceMs: 10 });
      const secondRegistration = acquire(monitor, folder, () => second++, { debounceMs: 10 });
      assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 0 });
      fileService.fire(URI.file("/repo/src/a.ts"));
      await timeout(11);
      assert.deepStrictEqual({ first, second }, { first: 1, second: 1 });
      firstRegistration.dispose();
      fileService.fire(URI.file("/repo/src/b.ts"));
      await timeout(11);
      assert.deepStrictEqual({ first, second, snapshot: fileService.snapshot() }, { first: 1, second: 2, snapshot: { watches: 1, disposed: 0 } });
      secondRegistration.dispose();
      assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 1 });
    });
  });
  test("filters known repository metadata noise before debouncing", () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const fileService = new TestFileService();
      const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
      let calls = 0;
      disposables.add(acquire(monitor, URI.file("/repo"), () => calls++, { debounceMs: 10 }));
      fileService.fire(URI.file("/repo/.git/objects/12/abcdef"));
      fileService.fire(URI.file("/repo/.git/index.lock"));
      fileService.fire(URI.file("/repo/.watchman-cookie-123"));
      await timeout(11);
      assert.strictEqual(calls, 0);
      fileService.fire(URI.file("/repo/src/a.ts"));
      await timeout(11);
      assert.strictEqual(calls, 1);
    });
  });
  test("filters custom excludes before debouncing", () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const fileService = new TestFileService();
      const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
      let calls = 0;
      disposables.add(acquire(monitor, URI.file("/repo"), () => calls++, { excludes: ["**/generated/**"], debounceMs: 10 }));
      fileService.fire(URI.file("/repo/generated/a.ts"));
      await timeout(11);
      assert.strictEqual(calls, 0);
      fileService.fire(URI.file("/repo/src/a.ts"));
      await timeout(11);
      assert.strictEqual(calls, 1);
    });
  });
  test("sorts excludes when sharing watchers", () => {
    const fileService = new TestFileService();
    const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
    const folder = URI.file("/repo");
    disposables.add(acquire(monitor, folder, () => {
    }, { excludes: ["**/b/**", "**/a/**"], debounceMs: 10 }));
    disposables.add(acquire(monitor, folder, () => {
    }, { excludes: ["**/a/**", "**/b/**"], debounceMs: 10 }));
    assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 0 });
  });
  test("canonicalizes equivalent folder keys when sharing watchers", () => {
    const fileService = new TestFileService();
    const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
    disposables.add(acquire(monitor, URI.file("/repo"), () => {
    }, { debounceMs: 10 }));
    disposables.add(acquire(monitor, URI.file("/repo/../repo/"), () => {
    }, { debounceMs: 10 }));
    assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 0 });
  });
  test("returns undefined when watcher acquisition fails", () => {
    const fileService = new TestFileService();
    fileService.failWatch = true;
    const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
    const registration = monitor.acquire(URI.file("/repo"), () => {
    }, { debounceMs: 10 });
    assert.deepStrictEqual({ registration, snapshot: fileService.snapshot() }, { registration: void 0, snapshot: { watches: 1, disposed: 0 } });
  });
  test("uses one file-change listener across monitor entries", () => {
    const fileService = new TestFileService();
    const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
    disposables.add(acquire(monitor, URI.file("/repo-a"), () => {
    }, { debounceMs: 10 }));
    disposables.add(acquire(monitor, URI.file("/repo-b"), () => {
    }, { debounceMs: 10 }));
    assert.deepStrictEqual({ snapshot: fileService.snapshot(), listeners: fileService.fileChangeListenerCount }, {
      snapshot: { watches: 2, disposed: 0 },
      listeners: 1
    });
  });
  test("disposing service cleans up active watchers and pending debounce callbacks", () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const fileService = new TestFileService();
      const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
      let calls = 0;
      const registration = acquire(monitor, URI.file("/repo"), () => calls++, { debounceMs: 10 });
      fileService.fire(URI.file("/repo/src/a.ts"));
      monitor.dispose();
      registration.dispose();
      await timeout(11);
      fileService.fire(URI.file("/repo/src/b.ts"));
      await timeout(11);
      assert.deepStrictEqual({ calls, snapshot: fileService.snapshot() }, { calls: 0, snapshot: { watches: 1, disposed: 1 } });
    });
  });
});
class TestFileService {
  constructor() {
    this._onDidFilesChange = new Emitter();
    this._onDidWatchError = new Emitter();
    this._watchCount = 0;
    this._disposeCount = 0;
    this._fileChangeListenerCount = 0;
    this.failWatch = false;
    this._onDidFilesChangeEvent = (listener, thisArgs, disposables) => {
      this._fileChangeListenerCount++;
      return this._onDidFilesChange.event(listener, thisArgs, disposables);
    };
    this.service = {
      _serviceBrand: void 0,
      onDidChangeFileSystemProviderRegistrations: Event.None,
      onDidChangeFileSystemProviderCapabilities: Event.None,
      onWillActivateFileSystemProvider: Event.None,
      onDidFilesChange: this._onDidFilesChangeEvent,
      onDidWatchError: this._onDidWatchError.event,
      watch: (_resource, _options) => {
        this._watchCount++;
        if (this.failWatch) {
          throw new Error("watch failed");
        }
        return toDisposable(() => this._disposeCount++);
      },
      dispose: () => {
      }
    };
  }
  fire(resource, type = FileChangeType.UPDATED) {
    this._onDidFilesChange.fire(new FileChangesEvent([{ resource, type }], false));
  }
  snapshot() {
    return { watches: this._watchCount, disposed: this._disposeCount };
  }
  get fileChangeListenerCount() {
    return this._fileChangeListenerCount;
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZXNFdmVudCwgRmlsZUNoYW5nZVR5cGUsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ0FnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gYWNxdWlyZShtb25pdG9yOiBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UsIGZvbGRlcjogVVJJLCBjYWxsYmFjazogKCkgPT4gdm9pZCwgb3B0aW9ucz86IHsgcmVhZG9ubHkgZXhjbHVkZXM/OiByZWFkb25seSBzdHJpbmdbXTsgcmVhZG9ubHkgZGVib3VuY2VNcz86IG51bWJlciB9KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IG1vbml0b3IuYWNxdWlyZShmb2xkZXIsIGNhbGxiYWNrLCBvcHRpb25zKTtcblx0XHRhc3NlcnQub2socmVnaXN0cmF0aW9uLCAnZXhwZWN0ZWQgZmlsZSBtb25pdG9yIGFjcXVpc2l0aW9uIHRvIHN1Y2NlZWQnKTtcblx0XHRyZXR1cm4gcmVnaXN0cmF0aW9uO1xuXHR9XG5cblx0dGVzdCgnc2hhcmVzIG9uZSByZWN1cnNpdmUgd2F0Y2hlciBwZXIgZm9sZGVyL29wdGlvbnMgYW5kIHJlZmNvdW50cyBjYWxsYmFja3MnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IFRlc3RGaWxlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgbW9uaXRvciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlKGZpbGVTZXJ2aWNlLnNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBVUkkuZmlsZSgnL3JlcG8nKTtcblx0XHRcdGxldCBmaXJzdCA9IDA7XG5cdFx0XHRsZXQgc2Vjb25kID0gMDtcblxuXHRcdFx0Y29uc3QgZmlyc3RSZWdpc3RyYXRpb24gPSBhY3F1aXJlKG1vbml0b3IsIGZvbGRlciwgKCkgPT4gZmlyc3QrKywgeyBkZWJvdW5jZU1zOiAxMCB9KTtcblx0XHRcdGNvbnN0IHNlY29uZFJlZ2lzdHJhdGlvbiA9IGFjcXVpcmUobW9uaXRvciwgZm9sZGVyLCAoKSA9PiBzZWNvbmQrKywgeyBkZWJvdW5jZU1zOiAxMCB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlsZVNlcnZpY2Uuc25hcHNob3QoKSwgeyB3YXRjaGVzOiAxLCBkaXNwb3NlZDogMCB9KTtcblxuXHRcdFx0ZmlsZVNlcnZpY2UuZmlyZShVUkkuZmlsZSgnL3JlcG8vc3JjL2EudHMnKSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDExKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBmaXJzdCwgc2Vjb25kIH0sIHsgZmlyc3Q6IDEsIHNlY29uZDogMSB9KTtcblxuXHRcdFx0Zmlyc3RSZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0ZmlsZVNlcnZpY2UuZmlyZShVUkkuZmlsZSgnL3JlcG8vc3JjL2IudHMnKSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDExKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBmaXJzdCwgc2Vjb25kLCBzbmFwc2hvdDogZmlsZVNlcnZpY2Uuc25hcHNob3QoKSB9LCB7IGZpcnN0OiAxLCBzZWNvbmQ6IDIsIHNuYXBzaG90OiB7IHdhdGNoZXM6IDEsIGRpc3Bvc2VkOiAwIH0gfSk7XG5cblx0XHRcdHNlY29uZFJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbGVTZXJ2aWNlLnNuYXBzaG90KCksIHsgd2F0Y2hlczogMSwgZGlzcG9zZWQ6IDEgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbHRlcnMga25vd24gcmVwb3NpdG9yeSBtZXRhZGF0YSBub2lzZSBiZWZvcmUgZGVib3VuY2luZycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgVGVzdEZpbGVTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBtb25pdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UoZmlsZVNlcnZpY2Uuc2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGxldCBjYWxscyA9IDA7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhY3F1aXJlKG1vbml0b3IsIFVSSS5maWxlKCcvcmVwbycpLCAoKSA9PiBjYWxscysrLCB7IGRlYm91bmNlTXM6IDEwIH0pKTtcblx0XHRcdGZpbGVTZXJ2aWNlLmZpcmUoVVJJLmZpbGUoJy9yZXBvLy5naXQvb2JqZWN0cy8xMi9hYmNkZWYnKSk7XG5cdFx0XHRmaWxlU2VydmljZS5maXJlKFVSSS5maWxlKCcvcmVwby8uZ2l0L2luZGV4LmxvY2snKSk7XG5cdFx0XHRmaWxlU2VydmljZS5maXJlKFVSSS5maWxlKCcvcmVwby8ud2F0Y2htYW4tY29va2llLTEyMycpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLCAwKTtcblxuXHRcdFx0ZmlsZVNlcnZpY2UuZmlyZShVUkkuZmlsZSgnL3JlcG8vc3JjL2EudHMnKSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDExKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscywgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbHRlcnMgY3VzdG9tIGV4Y2x1ZGVzIGJlZm9yZSBkZWJvdW5jaW5nJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBUZXN0RmlsZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IG1vbml0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZShmaWxlU2VydmljZS5zZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0bGV0IGNhbGxzID0gMDtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFjcXVpcmUobW9uaXRvciwgVVJJLmZpbGUoJy9yZXBvJyksICgpID0+IGNhbGxzKyssIHsgZXhjbHVkZXM6IFsnKiovZ2VuZXJhdGVkLyoqJ10sIGRlYm91bmNlTXM6IDEwIH0pKTtcblx0XHRcdGZpbGVTZXJ2aWNlLmZpcmUoVVJJLmZpbGUoJy9yZXBvL2dlbmVyYXRlZC9hLnRzJykpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMsIDApO1xuXG5cdFx0XHRmaWxlU2VydmljZS5maXJlKFVSSS5maWxlKCcvcmVwby9zcmMvYS50cycpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc29ydHMgZXhjbHVkZXMgd2hlbiBzaGFyaW5nIHdhdGNoZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IFRlc3RGaWxlU2VydmljZSgpO1xuXHRcdGNvbnN0IG1vbml0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZShmaWxlU2VydmljZS5zZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGZvbGRlciA9IFVSSS5maWxlKCcvcmVwbycpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjcXVpcmUobW9uaXRvciwgZm9sZGVyLCAoKSA9PiB7IH0sIHsgZXhjbHVkZXM6IFsnKiovYi8qKicsICcqKi9hLyoqJ10sIGRlYm91bmNlTXM6IDEwIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWNxdWlyZShtb25pdG9yLCBmb2xkZXIsICgpID0+IHsgfSwgeyBleGNsdWRlczogWycqKi9hLyoqJywgJyoqL2IvKionXSwgZGVib3VuY2VNczogMTAgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlU2VydmljZS5zbmFwc2hvdCgpLCB7IHdhdGNoZXM6IDEsIGRpc3Bvc2VkOiAwIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5vbmljYWxpemVzIGVxdWl2YWxlbnQgZm9sZGVyIGtleXMgd2hlbiBzaGFyaW5nIHdhdGNoZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IFRlc3RGaWxlU2VydmljZSgpO1xuXHRcdGNvbnN0IG1vbml0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZShmaWxlU2VydmljZS5zZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjcXVpcmUobW9uaXRvciwgVVJJLmZpbGUoJy9yZXBvJyksICgpID0+IHsgfSwgeyBkZWJvdW5jZU1zOiAxMCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjcXVpcmUobW9uaXRvciwgVVJJLmZpbGUoJy9yZXBvLy4uL3JlcG8vJyksICgpID0+IHsgfSwgeyBkZWJvdW5jZU1zOiAxMCB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbGVTZXJ2aWNlLnNuYXBzaG90KCksIHsgd2F0Y2hlczogMSwgZGlzcG9zZWQ6IDAgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gd2F0Y2hlciBhY3F1aXNpdGlvbiBmYWlscycsICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBUZXN0RmlsZVNlcnZpY2UoKTtcblx0XHRmaWxlU2VydmljZS5mYWlsV2F0Y2ggPSB0cnVlO1xuXHRcdGNvbnN0IG1vbml0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZShmaWxlU2VydmljZS5zZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gbW9uaXRvci5hY3F1aXJlKFVSSS5maWxlKCcvcmVwbycpLCAoKSA9PiB7IH0sIHsgZGVib3VuY2VNczogMTAgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVnaXN0cmF0aW9uLCBzbmFwc2hvdDogZmlsZVNlcnZpY2Uuc25hcHNob3QoKSB9LCB7IHJlZ2lzdHJhdGlvbjogdW5kZWZpbmVkLCBzbmFwc2hvdDogeyB3YXRjaGVzOiAxLCBkaXNwb3NlZDogMCB9IH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIG9uZSBmaWxlLWNoYW5nZSBsaXN0ZW5lciBhY3Jvc3MgbW9uaXRvciBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IFRlc3RGaWxlU2VydmljZSgpO1xuXHRcdGNvbnN0IG1vbml0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZShmaWxlU2VydmljZS5zZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjcXVpcmUobW9uaXRvciwgVVJJLmZpbGUoJy9yZXBvLWEnKSwgKCkgPT4geyB9LCB7IGRlYm91bmNlTXM6IDEwIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWNxdWlyZShtb25pdG9yLCBVUkkuZmlsZSgnL3JlcG8tYicpLCAoKSA9PiB7IH0sIHsgZGVib3VuY2VNczogMTAgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHNuYXBzaG90OiBmaWxlU2VydmljZS5zbmFwc2hvdCgpLCBsaXN0ZW5lcnM6IGZpbGVTZXJ2aWNlLmZpbGVDaGFuZ2VMaXN0ZW5lckNvdW50IH0sIHtcblx0XHRcdHNuYXBzaG90OiB7IHdhdGNoZXM6IDIsIGRpc3Bvc2VkOiAwIH0sXG5cdFx0XHRsaXN0ZW5lcnM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2luZyBzZXJ2aWNlIGNsZWFucyB1cCBhY3RpdmUgd2F0Y2hlcnMgYW5kIHBlbmRpbmcgZGVib3VuY2UgY2FsbGJhY2tzJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBUZXN0RmlsZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IG1vbml0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZShmaWxlU2VydmljZS5zZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0bGV0IGNhbGxzID0gMDtcblxuXHRcdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gYWNxdWlyZShtb25pdG9yLCBVUkkuZmlsZSgnL3JlcG8nKSwgKCkgPT4gY2FsbHMrKywgeyBkZWJvdW5jZU1zOiAxMCB9KTtcblx0XHRcdGZpbGVTZXJ2aWNlLmZpcmUoVVJJLmZpbGUoJy9yZXBvL3NyYy9hLnRzJykpO1xuXHRcdFx0bW9uaXRvci5kaXNwb3NlKCk7XG5cdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMSk7XG5cblx0XHRcdGZpbGVTZXJ2aWNlLmZpcmUoVVJJLmZpbGUoJy9yZXBvL3NyYy9iLnRzJykpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY2FsbHMsIHNuYXBzaG90OiBmaWxlU2VydmljZS5zbmFwc2hvdCgpIH0sIHsgY2FsbHM6IDAsIHNuYXBzaG90OiB7IHdhdGNoZXM6IDEsIGRpc3Bvc2VkOiAxIH0gfSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmNsYXNzIFRlc3RGaWxlU2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRmlsZXNDaGFuZ2UgPSBuZXcgRW1pdHRlcjxGaWxlQ2hhbmdlc0V2ZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFdhdGNoRXJyb3IgPSBuZXcgRW1pdHRlcjxFcnJvcj4oKTtcblx0cHJpdmF0ZSBfd2F0Y2hDb3VudCA9IDA7XG5cdHByaXZhdGUgX2Rpc3Bvc2VDb3VudCA9IDA7XG5cdHByaXZhdGUgX2ZpbGVDaGFuZ2VMaXN0ZW5lckNvdW50ID0gMDtcblx0ZmFpbFdhdGNoID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGaWxlc0NoYW5nZUV2ZW50OiBFdmVudDxGaWxlQ2hhbmdlc0V2ZW50PiA9IChsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0dGhpcy5fZmlsZUNoYW5nZUxpc3RlbmVyQ291bnQrKztcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRGaWxlc0NoYW5nZS5ldmVudChsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0fTtcblxuXHRyZWFkb25seSBzZXJ2aWNlID0ge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRvbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXM6IEV2ZW50Lk5vbmUsXG5cdFx0b25XaWxsQWN0aXZhdGVGaWxlU3lzdGVtUHJvdmlkZXI6IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRGaWxlc0NoYW5nZTogdGhpcy5fb25EaWRGaWxlc0NoYW5nZUV2ZW50LFxuXHRcdG9uRGlkV2F0Y2hFcnJvcjogdGhpcy5fb25EaWRXYXRjaEVycm9yLmV2ZW50LFxuXHRcdHdhdGNoOiAoX3Jlc291cmNlOiBVUkksIF9vcHRpb25zPzogUGFyYW1ldGVyczxJRmlsZVNlcnZpY2VbJ3dhdGNoJ10+WzFdKTogSURpc3Bvc2FibGUgPT4ge1xuXHRcdFx0dGhpcy5fd2F0Y2hDb3VudCsrO1xuXHRcdFx0aWYgKHRoaXMuZmFpbFdhdGNoKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignd2F0Y2ggZmFpbGVkJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2Rpc3Bvc2VDb3VudCsrKTtcblx0XHR9LFxuXHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0fSBhcyBQYXJ0aWFsPElGaWxlU2VydmljZT4gYXMgSUZpbGVTZXJ2aWNlO1xuXG5cdGZpcmUocmVzb3VyY2U6IFVSSSwgdHlwZTogRmlsZUNoYW5nZVR5cGUgPSBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRGaWxlc0NoYW5nZS5maXJlKG5ldyBGaWxlQ2hhbmdlc0V2ZW50KFt7IHJlc291cmNlLCB0eXBlIH1dLCBmYWxzZSkpO1xuXHR9XG5cblx0c25hcHNob3QoKTogeyB3YXRjaGVzOiBudW1iZXI7IGRpc3Bvc2VkOiBudW1iZXIgfSB7XG5cdFx0cmV0dXJuIHsgd2F0Y2hlczogdGhpcy5fd2F0Y2hDb3VudCwgZGlzcG9zZWQ6IHRoaXMuX2Rpc3Bvc2VDb3VudCB9O1xuXHR9XG5cblx0Z2V0IGZpbGVDaGFuZ2VMaXN0ZW5lckNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbGVDaGFuZ2VMaXN0ZW5lckNvdW50O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQkFBa0Isc0JBQW9DO0FBQy9ELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUNBQW1DO0FBRTVDLE1BQU0sK0JBQStCLE1BQU07QUFFMUMsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFdBQVMsTUFBTSxZQUFZLE1BQU0sQ0FBQztBQUNsQywwQ0FBd0M7QUFFeEMsV0FBUyxRQUFRLFNBQXNDLFFBQWEsVUFBc0IsU0FBZ0c7QUFDekwsVUFBTSxlQUFlLFFBQVEsUUFBUSxRQUFRLFVBQVUsT0FBTztBQUM5RCxXQUFPLEdBQUcsY0FBYyw4Q0FBOEM7QUFDdEUsV0FBTztBQUFBLEVBQ1I7QUFFQSxPQUFLLDJFQUEyRSxNQUFNO0FBQ3JGLFdBQU8sbUJBQW1CLEVBQUUsZUFBZSxNQUFNLGNBQWMsSUFBTyxHQUFHLFlBQVk7QUFDcEYsWUFBTSxjQUFjLElBQUksZ0JBQWdCO0FB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
