import assert from "assert";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { bufferToReadable, bufferToStream, VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { consumeStream, newWriteableStream } from "../../../../base/common/stream.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileSystemProviderCapabilities, FileType, isFileSystemWatcher, FileChangeType } from "../../common/files.js";
import { FileService } from "../../common/fileService.js";
import { NullFileSystemProvider } from "../common/nullFileSystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
suite("File Service", () => {
  const disposables = new DisposableStore();
  teardown(() => {
    disposables.clear();
  });
  test("provider registration", async () => {
    const service = disposables.add(new FileService(new NullLogService()));
    const resource = URI.parse("test://foo/bar");
    const provider = new NullFileSystemProvider();
    assert.strictEqual(await service.canHandleResource(resource), false);
    assert.strictEqual(service.hasProvider(resource), false);
    assert.strictEqual(service.getProvider(resource.scheme), void 0);
    const registrations = [];
    disposables.add(service.onDidChangeFileSystemProviderRegistrations((e) => {
      registrations.push(e);
    }));
    const capabilityChanges = [];
    disposables.add(service.onDidChangeFileSystemProviderCapabilities((e) => {
      capabilityChanges.push(e);
    }));
    let registrationDisposable;
    let callCount = 0;
    disposables.add(service.onWillActivateFileSystemProvider((e) => {
      callCount++;
      if (e.scheme === "test" && callCount === 1) {
        e.join(new Promise((resolve) => {
          registrationDisposable = service.registerProvider("test", provider);
          resolve();
        }));
      }
    }));
    assert.strictEqual(await service.canHandleResource(resource), true);
    assert.strictEqual(service.hasProvider(resource), true);
    assert.strictEqual(service.getProvider(resource.scheme), provider);
    assert.strictEqual(registrations.length, 1);
    assert.strictEqual(registrations[0].scheme, "test");
    assert.strictEqual(registrations[0].added, true);
    assert.ok(registrationDisposable);
    assert.strictEqual(capabilityChanges.length, 0);
    provider.setCapabilities(FileSystemProviderCapabilities.FileFolderCopy);
    assert.strictEqual(capabilityChanges.length, 1);
    provider.setCapabilities(FileSystemProviderCapabilities.Readonly);
    assert.strictEqual(capabilityChanges.length, 2);
    await service.activateProvider("test");
    assert.strictEqual(callCount, 2);
    assert.strictEqual(service.hasCapability(resource, FileSystemProviderCapabilities.Readonly), true);
    assert.strictEqual(service.hasCapability(resource, FileSystemProviderCapabilities.FileOpenReadWriteClose), false);
    registrationDisposable.dispose();
    assert.strictEqual(await service.canHandleResource(resource), false);
    assert.strictEqual(service.hasProvider(resource), false);
    assert.strictEqual(registrations.length, 2);
    assert.strictEqual(registrations[1].scheme, "test");
    assert.strictEqual(registrations[1].added, false);
  });
  test("watch", async () => {
    const service = disposables.add(new FileService(new NullLogService()));
    let disposeCounter = 0;
    disposables.add(service.registerProvider("test", new NullFileSystemProvider(() => {
      return toDisposable(() => {
        disposeCounter++;
      });
    })));
    await service.activateProvider("test");
    const resource1 = URI.parse("test://foo/bar1");
    const watcher1Disposable = service.watch(resource1);
    await timeout(0);
    assert.strictEqual(disposeCounter, 0);
    watcher1Disposable.dispose();
    assert.strictEqual(disposeCounter, 1);
    disposeCounter = 0;
    const resource2 = URI.parse("test://foo/bar2");
    const watcher2Disposable1 = service.watch(resource2);
    const watcher2Disposable2 = service.watch(resource2);
    const watcher2Disposable3 = service.watch(resource2);
    await timeout(0);
    assert.strictEqual(disposeCounter, 0);
    watcher2Disposable1.dispose();
    assert.strictEqual(disposeCounter, 0);
    watcher2Disposable2.dispose();
    assert.strictEqual(disposeCounter, 0);
    watcher2Disposable3.dispose();
    assert.strictEqual(disposeCounter, 1);
    disposeCounter = 0;
    const resource3 = URI.parse("test://foo/bar3");
    const watcher3Disposable1 = service.watch(resource3);
    const watcher3Disposable2 = service.watch(resource3, { recursive: true, excludes: [] });
    const watcher3Disposable3 = service.watch(resource3, { recursive: false, excludes: [], includes: [] });
    await timeout(0);
    assert.strictEqual(disposeCounter, 0);
    watcher3Disposable1.dispose();
    assert.strictEqual(disposeCounter, 1);
    watcher3Disposable2.dispose();
    assert.strictEqual(disposeCounter, 2);
    watcher3Disposable3.dispose();
    assert.strictEqual(disposeCounter, 3);
    service.dispose();
  });
  test("watch - with corelation", async () => {
    const service = disposables.add(new FileService(new NullLogService()));
    const provider = new class extends NullFileSystemProvider {
      constructor() {
        super(...arguments);
        this._testOnDidChangeFile = new Emitter();
        this.onDidChangeFile = this._testOnDidChangeFile.event;
      }
      fireFileChange(changes) {
        this._testOnDidChangeFile.fire(changes);
      }
    }();
    disposables.add(service.registerProvider("test", provider));
    await service.activateProvider("test");
    const globalEvents = [];
    disposables.add(service.onDidFilesChange((e) => {
      globalEvents.push(e);
    }));
    const watcher0 = disposables.add(service.watch(URI.parse("test://watch/folder1"), { recursive: true, excludes: [], includes: [] }));
    assert.strictEqual(isFileSystemWatcher(watcher0), false);
    const watcher1 = disposables.add(service.watch(URI.parse("test://watch/folder2"), { recursive: true, excludes: [], includes: [], correlationId: 100 }));
    assert.strictEqual(isFileSystemWatcher(watcher1), true);
    const watcher2 = disposables.add(service.watch(URI.parse("test://watch/folder3"), { recursive: true, excludes: [], includes: [], correlationId: 200 }));
    assert.strictEqual(isFileSystemWatcher(watcher2), true);
    const watcher1Events = [];
    disposables.add(watcher1.onDidChange((e) => {
      watcher1Events.push(e);
    }));
    const watcher2Events = [];
    disposables.add(watcher2.onDidChange((e) => {
      watcher2Events.push(e);
    }));
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder1"), type: FileChangeType.ADDED }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder2"), type: FileChangeType.ADDED, cId: 100 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder2"), type: FileChangeType.ADDED, cId: 100 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder3/file"), type: FileChangeType.UPDATED, cId: 200 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder3"), type: FileChangeType.UPDATED, cId: 200 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder4"), type: FileChangeType.ADDED, cId: 50 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder4"), type: FileChangeType.ADDED, cId: 60 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder4"), type: FileChangeType.ADDED, cId: 70 }]);
    assert.strictEqual(globalEvents.length, 1);
    assert.strictEqual(watcher1Events.length, 2);
    assert.strictEqual(watcher2Events.length, 2);
  });
  test("error from readFile bubbles through (https://github.com/microsoft/vscode/issues/118060) - async", async () => {
    testReadErrorBubbles(true);
  });
  test("error from readFile bubbles through (https://github.com/microsoft/vscode/issues/118060)", async () => {
    testReadErrorBubbles(false);
  });
  async function testReadErrorBubbles(async) {
    const service = disposables.add(new FileService(new NullLogService()));
    const provider = new class extends NullFileSystemProvider {
      async stat(resource) {
        return {
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
          type: FileType.File
        };
      }
      readFile(resource) {
        if (async) {
          return timeout(5, CancellationToken.None).then(() => {
            throw new Error("failed");
          });
        }
        throw new Error("failed");
      }
      open(resource, opts) {
        if (async) {
          return timeout(5, CancellationToken.None).then(() => {
            throw new Error("failed");
          });
        }
        throw new Error("failed");
      }
      readFileStream(resource, opts, token) {
        if (async) {
          const stream = newWriteableStream((chunk) => chunk[0]);
          timeout(5, CancellationToken.None).then(() => stream.error(new Error("failed")));
          return stream;
        }
        throw new Error("failed");
      }
    }();
    disposables.add(service.registerProvider("test", provider));
    for (const capabilities of [FileSystemProviderCapabilities.FileReadWrite, FileSystemProviderCapabilities.FileReadStream, FileSystemProviderCapabilities.FileOpenReadWriteClose]) {
      provider.setCapabilities(capabilities);
      let e1;
      try {
        await service.readFile(URI.parse("test://foo/bar"));
      } catch (error) {
        e1 = error;
      }
      assert.ok(e1);
      let e2;
      try {
        const stream = await service.readFileStream(URI.parse("test://foo/bar"));
        await consumeStream(stream.value, (chunk) => chunk[0]);
      } catch (error) {
        e2 = error;
      }
      assert.ok(e2);
    }
  }
  test("readFile/readFileStream supports cancellation (https://github.com/microsoft/vscode/issues/138805)", async () => {
    const service = disposables.add(new FileService(new NullLogService()));
    let readFileStreamReady = void 0;
    const provider = new class extends NullFileSystemProvider {
      async stat(resource) {
        return {
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
          type: FileType.File
        };
      }
      readFileStream(resource, opts, token) {
        const stream = newWriteableStream((chunk) => chunk[0]);
        disposables.add(token.onCancellationRequested(() => {
          stream.error(new Error("Expected cancellation"));
          stream.end();
        }));
        readFileStreamReady.complete();
        return stream;
      }
    }();
    disposables.add(service.registerProvider("test", provider));
    provider.setCapabilities(FileSystemProviderCapabilities.FileReadStream);
    let e1;
    try {
      const cts = new CancellationTokenSource();
      readFileStreamReady = new DeferredPromise();
      const promise = service.readFile(URI.parse("test://foo/bar"), void 0, cts.token);
      await Promise.all([readFileStreamReady.p.then(() => cts.cancel()), promise]);
    } catch (error) {
      e1 = error;
    }
    assert.ok(e1);
    let e2;
    try {
      const cts = new CancellationTokenSource();
      readFileStreamReady = new DeferredPromise();
      const stream = await service.readFileStream(URI.parse("test://foo/bar"), void 0, cts.token);
      await Promise.all([readFileStreamReady.p.then(() => cts.cancel()), consumeStream(stream.value, (chunk) => chunk[0])]);
    } catch (error) {
      e2 = error;
    }
    assert.ok(e2);
  });
  test("enforced atomic read/write/delete", async () => {
    const service = disposables.add(new FileService(new NullLogService()));
    const atomicResource = URI.parse("test://foo/bar/atomic");
    const nonAtomicResource = URI.parse("test://foo/nonatomic");
    let atomicReadCounter = 0;
    let atomicWriteCounter = 0;
    let atomicDeleteCounter = 0;
    const provider = new class extends NullFileSystemProvider {
      async stat(resource) {
        return {
          type: FileType.File,
          ctime: Date.now(),
          mtime: Date.now(),
          size: 0
        };
      }
      async readFile(resource, opts) {
        if (opts?.atomic) {
          atomicReadCounter++;
        }
        return new Uint8Array();
      }
      readFileStream(resource, opts, token) {
        return newWriteableStream((chunk) => chunk[0]);
      }
      enforceAtomicReadFile(resource) {
        return isEqual(resource, atomicResource);
      }
      async writeFile(resource, content, opts) {
        if (opts.atomic) {
          atomicWriteCounter++;
        }
      }
      enforceAtomicWriteFile(resource) {
        return isEqual(resource, atomicResource) ? { postfix: ".tmp" } : false;
      }
      async delete(resource, opts) {
        if (opts.atomic) {
          atomicDeleteCounter++;
        }
      }
      enforceAtomicDelete(resource) {
        return isEqual(resource, atomicResource) ? { postfix: ".tmp" } : false;
      }
    }();
    provider.setCapabilities(
      FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileReadStream | FileSystemProviderCapabilities.FileAtomicRead | FileSystemProviderCapabilities.FileAtomicWrite | FileSystemProviderCapabilities.FileAtomicDelete
    );
    disposables.add(service.registerProvider("test", provider));
    await service.readFile(atomicResource);
    await service.readFile(nonAtomicResource);
    await service.readFileStream(atomicResource);
    await service.readFileStream(nonAtomicResource);
    await service.writeFile(atomicResource, VSBuffer.fromString(""));
    await service.writeFile(nonAtomicResource, VSBuffer.fromString(""));
    await service.writeFile(atomicResource, bufferToStream(VSBuffer.fromString("")));
    await service.writeFile(nonAtomicResource, bufferToStream(VSBuffer.fromString("")));
    await service.writeFile(atomicResource, bufferToReadable(VSBuffer.fromString("")));
    await service.writeFile(nonAtomicResource, bufferToReadable(VSBuffer.fromString("")));
    await service.del(atomicResource);
    await service.del(nonAtomicResource);
    assert.strictEqual(atomicReadCounter, 2);
    assert.strictEqual(atomicWriteCounter, 3);
    assert.strictEqual(atomicDeleteCounter, 1);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXHRlc3RcXGJyb3dzZXJcXGZpbGVTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBidWZmZXJUb1JlYWRhYmxlLCBidWZmZXJUb1N0cmVhbSwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgY29uc3VtZVN0cmVhbSwgbmV3V3JpdGVhYmxlU3RyZWFtLCBSZWFkYWJsZVN0cmVhbUV2ZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRmlsZU9wZW5PcHRpb25zLCBJRmlsZVJlYWRTdHJlYW1PcHRpb25zLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIEZpbGVUeXBlLCBJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQsIElGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25FdmVudCwgSVN0YXQsIElGaWxlQXRvbWljUmVhZE9wdGlvbnMsIElGaWxlQXRvbWljV3JpdGVPcHRpb25zLCBJRmlsZUF0b21pY0RlbGV0ZU9wdGlvbnMsIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5LCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNEZWxldGVDYXBhYmlsaXR5LCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNXcml0ZUNhcGFiaWxpdHksIElGaWxlQXRvbWljT3B0aW9ucywgSUZpbGVDaGFuZ2UsIGlzRmlsZVN5c3RlbVdhdGNoZXIsIEZpbGVDaGFuZ2VzRXZlbnQsIEZpbGVDaGFuZ2VUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi9jb21tb24vbnVsbEZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcblxuc3VpdGUoJ0ZpbGUgU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgcmVnaXN0cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9mb28vYmFyJyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTnVsbEZpbGVTeXN0ZW1Qcm92aWRlcigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuSGFuZGxlUmVzb3VyY2UocmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzUHJvdmlkZXIocmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0UHJvdmlkZXIocmVzb3VyY2Uuc2NoZW1lKSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbnM6IElGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25FdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zKGUgPT4ge1xuXHRcdFx0cmVnaXN0cmF0aW9ucy5wdXNoKGUpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNhcGFiaWxpdHlDaGFuZ2VzOiBJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzKGUgPT4ge1xuXHRcdFx0Y2FwYWJpbGl0eUNoYW5nZXMucHVzaChlKTtcblx0XHR9KSk7XG5cblx0XHRsZXQgcmVnaXN0cmF0aW9uRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25XaWxsQWN0aXZhdGVGaWxlU3lzdGVtUHJvdmlkZXIoZSA9PiB7XG5cdFx0XHRjYWxsQ291bnQrKztcblxuXHRcdFx0aWYgKGUuc2NoZW1lID09PSAndGVzdCcgJiYgY2FsbENvdW50ID09PSAxKSB7XG5cdFx0XHRcdGUuam9pbihuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRyZWdpc3RyYXRpb25EaXNwb3NhYmxlID0gc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCd0ZXN0JywgcHJvdmlkZXIpO1xuXG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuSGFuZGxlUmVzb3VyY2UocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNQcm92aWRlcihyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFByb3ZpZGVyKHJlc291cmNlLnNjaGVtZSksIHByb3ZpZGVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJhdGlvbnNbMF0uc2NoZW1lLCAndGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyYXRpb25zWzBdLmFkZGVkLCB0cnVlKTtcblx0XHRhc3NlcnQub2socmVnaXN0cmF0aW9uRGlzcG9zYWJsZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwYWJpbGl0eUNoYW5nZXMubGVuZ3RoLCAwKTtcblxuXHRcdHByb3ZpZGVyLnNldENhcGFiaWxpdGllcyhGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUZvbGRlckNvcHkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXBhYmlsaXR5Q2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdHByb3ZpZGVyLnNldENhcGFiaWxpdGllcyhGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUmVhZG9ubHkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXBhYmlsaXR5Q2hhbmdlcy5sZW5ndGgsIDIpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5hY3RpdmF0ZVByb3ZpZGVyKCd0ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMik7IC8vIGFjdGl2YXRpb24gaXMgY2FsbGVkIGFnYWluXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNDYXBhYmlsaXR5KHJlc291cmNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUmVhZG9ubHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNDYXBhYmlsaXR5KHJlc291cmNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSksIGZhbHNlKTtcblxuXHRcdHJlZ2lzdHJhdGlvbkRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuSGFuZGxlUmVzb3VyY2UocmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzUHJvdmlkZXIocmVzb3VyY2UpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cmF0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyYXRpb25zWzFdLnNjaGVtZSwgJ3Rlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cmF0aW9uc1sxXS5hZGRlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0bGV0IGRpc3Bvc2VDb3VudGVyID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCd0ZXN0JywgbmV3IE51bGxGaWxlU3lzdGVtUHJvdmlkZXIoKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2VDb3VudGVyKys7XG5cdFx0XHR9KTtcblx0XHR9KSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuYWN0aXZhdGVQcm92aWRlcigndGVzdCcpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UxID0gVVJJLnBhcnNlKCd0ZXN0Oi8vZm9vL2JhcjEnKTtcblx0XHRjb25zdCB3YXRjaGVyMURpc3Bvc2FibGUgPSBzZXJ2aWNlLndhdGNoKHJlc291cmNlMSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApOyAvLyBzZXJ2aWNlLndhdGNoKCkgaXMgYXN5bmNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZUNvdW50ZXIsIDApO1xuXHRcdHdhdGNoZXIxRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VDb3VudGVyLCAxKTtcblxuXHRcdGRpc3Bvc2VDb3VudGVyID0gMDtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9mb28vYmFyMicpO1xuXHRcdGNvbnN0IHdhdGNoZXIyRGlzcG9zYWJsZTEgPSBzZXJ2aWNlLndhdGNoKHJlc291cmNlMik7XG5cdFx0Y29uc3Qgd2F0Y2hlcjJEaXNwb3NhYmxlMiA9IHNlcnZpY2Uud2F0Y2gocmVzb3VyY2UyKTtcblx0XHRjb25zdCB3YXRjaGVyMkRpc3Bvc2FibGUzID0gc2VydmljZS53YXRjaChyZXNvdXJjZTIpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gc2VydmljZS53YXRjaCgpIGlzIGFzeW5jXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VDb3VudGVyLCAwKTtcblx0XHR3YXRjaGVyMkRpc3Bvc2FibGUxLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZUNvdW50ZXIsIDApO1xuXHRcdHdhdGNoZXIyRGlzcG9zYWJsZTIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQ291bnRlciwgMCk7XG5cdFx0d2F0Y2hlcjJEaXNwb3NhYmxlMy5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VDb3VudGVyLCAxKTtcblxuXHRcdGRpc3Bvc2VDb3VudGVyID0gMDtcblx0XHRjb25zdCByZXNvdXJjZTMgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9mb28vYmFyMycpO1xuXHRcdGNvbnN0IHdhdGNoZXIzRGlzcG9zYWJsZTEgPSBzZXJ2aWNlLndhdGNoKHJlc291cmNlMyk7XG5cdFx0Y29uc3Qgd2F0Y2hlcjNEaXNwb3NhYmxlMiA9IHNlcnZpY2Uud2F0Y2gocmVzb3VyY2UzLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZXhjbHVkZXM6IFtdIH0pO1xuXHRcdGNvbnN0IHdhdGNoZXIzRGlzcG9zYWJsZTMgPSBzZXJ2aWNlLndhdGNoKHJlc291cmNlMywgeyByZWN1cnNpdmU6IGZhbHNlLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbXSB9KTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIHNlcnZpY2Uud2F0Y2goKSBpcyBhc3luY1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQ291bnRlciwgMCk7XG5cdFx0d2F0Y2hlcjNEaXNwb3NhYmxlMS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VDb3VudGVyLCAxKTtcblx0XHR3YXRjaGVyM0Rpc3Bvc2FibGUyLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZUNvdW50ZXIsIDIpO1xuXHRcdHdhdGNoZXIzRGlzcG9zYWJsZTMuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQ291bnRlciwgMyk7XG5cblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2ggLSB3aXRoIGNvcmVsYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgTnVsbEZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXN0T25EaWRDaGFuZ2VGaWxlID0gbmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT4oKTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmlsZTogRXZlbnQ8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT4gPSB0aGlzLl90ZXN0T25EaWRDaGFuZ2VGaWxlLmV2ZW50O1xuXG5cdFx0XHRmaXJlRmlsZUNoYW5nZShjaGFuZ2VzOiByZWFkb25seSBJRmlsZUNoYW5nZVtdKSB7XG5cdFx0XHRcdHRoaXMuX3Rlc3RPbkRpZENoYW5nZUZpbGUuZmlyZShjaGFuZ2VzKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndGVzdCcsIHByb3ZpZGVyKSk7XG5cdFx0YXdhaXQgc2VydmljZS5hY3RpdmF0ZVByb3ZpZGVyKCd0ZXN0Jyk7XG5cblx0XHRjb25zdCBnbG9iYWxFdmVudHM6IEZpbGVDaGFuZ2VzRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB7XG5cdFx0XHRnbG9iYWxFdmVudHMucHVzaChlKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB3YXRjaGVyMCA9IGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLndhdGNoKFVSSS5wYXJzZSgndGVzdDovL3dhdGNoL2ZvbGRlcjEnKSwgeyByZWN1cnNpdmU6IHRydWUsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFtdIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWxlU3lzdGVtV2F0Y2hlcih3YXRjaGVyMCksIGZhbHNlKTtcblx0XHRjb25zdCB3YXRjaGVyMSA9IGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLndhdGNoKFVSSS5wYXJzZSgndGVzdDovL3dhdGNoL2ZvbGRlcjInKSwgeyByZWN1cnNpdmU6IHRydWUsIGV4Y2x1ZGVzOiBbXSwgaW5jbHVkZXM6IFtdLCBjb3JyZWxhdGlvbklkOiAxMDAgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbGVTeXN0ZW1XYXRjaGVyKHdhdGNoZXIxKSwgdHJ1ZSk7XG5cdFx0Y29uc3Qgd2F0Y2hlcjIgPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS53YXRjaChVUkkucGFyc2UoJ3Rlc3Q6Ly93YXRjaC9mb2xkZXIzJyksIHsgcmVjdXJzaXZlOiB0cnVlLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbXSwgY29ycmVsYXRpb25JZDogMjAwIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWxlU3lzdGVtV2F0Y2hlcih3YXRjaGVyMiksIHRydWUpO1xuXG5cdFx0Y29uc3Qgd2F0Y2hlcjFFdmVudHM6IEZpbGVDaGFuZ2VzRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3YXRjaGVyMS5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdHdhdGNoZXIxRXZlbnRzLnB1c2goZSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgd2F0Y2hlcjJFdmVudHM6IEZpbGVDaGFuZ2VzRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh3YXRjaGVyMi5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdHdhdGNoZXIyRXZlbnRzLnB1c2goZSk7XG5cdFx0fSkpO1xuXG5cdFx0cHJvdmlkZXIuZmlyZUZpbGVDaGFuZ2UoW3sgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3dhdGNoL2ZvbGRlcjEnKSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfV0pO1xuXHRcdHByb3ZpZGVyLmZpcmVGaWxlQ2hhbmdlKFt7IHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly93YXRjaC9mb2xkZXIyJyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVELCBjSWQ6IDEwMCB9XSk7XG5cdFx0cHJvdmlkZXIuZmlyZUZpbGVDaGFuZ2UoW3sgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3dhdGNoL2ZvbGRlcjInKSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQsIGNJZDogMTAwIH1dKTtcblx0XHRwcm92aWRlci5maXJlRmlsZUNoYW5nZShbeyByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vd2F0Y2gvZm9sZGVyMy9maWxlJyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsIGNJZDogMjAwIH1dKTtcblx0XHRwcm92aWRlci5maXJlRmlsZUNoYW5nZShbeyByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vd2F0Y2gvZm9sZGVyMycpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCBjSWQ6IDIwMCB9XSk7XG5cblx0XHRwcm92aWRlci5maXJlRmlsZUNoYW5nZShbeyByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vd2F0Y2gvZm9sZGVyNCcpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRCwgY0lkOiA1MCB9XSk7XG5cdFx0cHJvdmlkZXIuZmlyZUZpbGVDaGFuZ2UoW3sgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3dhdGNoL2ZvbGRlcjQnKSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQsIGNJZDogNjAgfV0pO1xuXHRcdHByb3ZpZGVyLmZpcmVGaWxlQ2hhbmdlKFt7IHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly93YXRjaC9mb2xkZXI0JyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVELCBjSWQ6IDcwIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iYWxFdmVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlcjFFdmVudHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlcjJFdmVudHMubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZXJyb3IgZnJvbSByZWFkRmlsZSBidWJibGVzIHRocm91Z2ggKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTgwNjApIC0gYXN5bmMnLCBhc3luYyAoKSA9PiB7XG5cdFx0dGVzdFJlYWRFcnJvckJ1YmJsZXModHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vycm9yIGZyb20gcmVhZEZpbGUgYnViYmxlcyB0aHJvdWdoIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4MDYwKScsIGFzeW5jICgpID0+IHtcblx0XHR0ZXN0UmVhZEVycm9yQnViYmxlcyhmYWxzZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RSZWFkRXJyb3JCdWJibGVzKGFzeW5jOiBib29sZWFuKSB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgTnVsbEZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTdGF0PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bXRpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0Y3RpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0c2l6ZTogMTAwLFxuXHRcdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkZpbGVcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdFx0XHRpZiAoYXN5bmMpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGltZW91dCg1LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdmYWlsZWQnKTsgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ZhaWxlZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBvcGVuKHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlT3Blbk9wdGlvbnMpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdFx0XHRpZiAoYXN5bmMpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGltZW91dCg1LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdmYWlsZWQnKTsgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ZhaWxlZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSByZWFkRmlsZVN0cmVhbShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZVJlYWRTdHJlYW1PcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBSZWFkYWJsZVN0cmVhbUV2ZW50czxVaW50OEFycmF5PiB7XG5cdFx0XHRcdGlmIChhc3luYykge1xuXHRcdFx0XHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxVaW50OEFycmF5PihjaHVuayA9PiBjaHVua1swXSk7XG5cdFx0XHRcdFx0dGltZW91dCg1LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKCgpID0+IHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoJ2ZhaWxlZCcpKSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gc3RyZWFtO1xuXG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ZhaWxlZCcpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCd0ZXN0JywgcHJvdmlkZXIpKTtcblxuXHRcdGZvciAoY29uc3QgY2FwYWJpbGl0aWVzIG9mIFtGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkU3RyZWFtLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZV0pIHtcblx0XHRcdHByb3ZpZGVyLnNldENhcGFiaWxpdGllcyhjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRsZXQgZTE7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKFVSSS5wYXJzZSgndGVzdDovL2Zvby9iYXInKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRlMSA9IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQub2soZTEpO1xuXG5cdFx0XHRsZXQgZTI7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdHJlYW0gPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKFVSSS5wYXJzZSgndGVzdDovL2Zvby9iYXInKSk7XG5cdFx0XHRcdGF3YWl0IGNvbnN1bWVTdHJlYW0oc3RyZWFtLnZhbHVlLCBjaHVuayA9PiBjaHVua1swXSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRlMiA9IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQub2soZTIpO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ3JlYWRGaWxlL3JlYWRGaWxlU3RyZWFtIHN1cHBvcnRzIGNhbmNlbGxhdGlvbiAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzODgwNSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGxldCByZWFkRmlsZVN0cmVhbVJlYWR5OiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIE51bGxGaWxlU3lzdGVtUHJvdmlkZXIge1xuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTdGF0PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bXRpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0Y3RpbWU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0c2l6ZTogMTAwLFxuXHRcdFx0XHRcdHR5cGU6IEZpbGVUeXBlLkZpbGVcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgcmVhZEZpbGVTdHJlYW0ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUmVhZGFibGVTdHJlYW1FdmVudHM8VWludDhBcnJheT4ge1xuXHRcdFx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08VWludDhBcnJheT4oY2h1bmsgPT4gY2h1bmtbMF0pO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmVhbS5lcnJvcihuZXcgRXJyb3IoJ0V4cGVjdGVkIGNhbmNlbGxhdGlvbicpKTtcblx0XHRcdFx0XHRzdHJlYW0uZW5kKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRyZWFkRmlsZVN0cmVhbVJlYWR5IS5jb21wbGV0ZSgpO1xuXG5cdFx0XHRcdHJldHVybiBzdHJlYW07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ3Rlc3QnLCBwcm92aWRlcikpO1xuXG5cdFx0cHJvdmlkZXIuc2V0Q2FwYWJpbGl0aWVzKEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSk7XG5cblx0XHRsZXQgZTE7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0cmVhZEZpbGVTdHJlYW1SZWFkeSA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBzZXJ2aWNlLnJlYWRGaWxlKFVSSS5wYXJzZSgndGVzdDovL2Zvby9iYXInKSwgdW5kZWZpbmVkLCBjdHMudG9rZW4pO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3JlYWRGaWxlU3RyZWFtUmVhZHkucC50aGVuKCgpID0+IGN0cy5jYW5jZWwoKSksIHByb21pc2VdKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZTEgPSBlcnJvcjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZTEpO1xuXG5cdFx0bGV0IGUyO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHJlYWRGaWxlU3RyZWFtUmVhZHkgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG5cdFx0XHRjb25zdCBzdHJlYW0gPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKFVSSS5wYXJzZSgndGVzdDovL2Zvby9iYXInKSwgdW5kZWZpbmVkLCBjdHMudG9rZW4pO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3JlYWRGaWxlU3RyZWFtUmVhZHkucC50aGVuKCgpID0+IGN0cy5jYW5jZWwoKSksIGNvbnN1bWVTdHJlYW0oc3RyZWFtLnZhbHVlLCBjaHVuayA9PiBjaHVua1swXSldKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZTIgPSBlcnJvcjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmZvcmNlZCBhdG9taWMgcmVhZC93cml0ZS9kZWxldGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGNvbnN0IGF0b21pY1Jlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0Oi8vZm9vL2Jhci9hdG9taWMnKTtcblx0XHRjb25zdCBub25BdG9taWNSZXNvdXJjZSA9IFVSSS5wYXJzZSgndGVzdDovL2Zvby9ub25hdG9taWMnKTtcblxuXHRcdGxldCBhdG9taWNSZWFkQ291bnRlciA9IDA7XG5cdFx0bGV0IGF0b21pY1dyaXRlQ291bnRlciA9IDA7XG5cdFx0bGV0IGF0b21pY0RlbGV0ZUNvdW50ZXIgPSAwO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsRmlsZVN5c3RlbVByb3ZpZGVyIGltcGxlbWVudHMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQXRvbWljUmVhZENhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY1dyaXRlQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQXRvbWljRGVsZXRlQ2FwYWJpbGl0eSB7XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHN0YXQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVN0YXQ+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBGaWxlVHlwZS5GaWxlLFxuXHRcdFx0XHRcdGN0aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdG10aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdHNpemU6IDBcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSwgb3B0cz86IElGaWxlQXRvbWljUmVhZE9wdGlvbnMpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRcdFx0aWYgKG9wdHM/LmF0b21pYykge1xuXHRcdFx0XHRcdGF0b21pY1JlYWRDb3VudGVyKys7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBVaW50OEFycmF5KCk7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIHJlYWRGaWxlU3RyZWFtKHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlUmVhZFN0cmVhbU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFJlYWRhYmxlU3RyZWFtRXZlbnRzPFVpbnQ4QXJyYXk+IHtcblx0XHRcdFx0cmV0dXJuIG5ld1dyaXRlYWJsZVN0cmVhbTxVaW50OEFycmF5PihjaHVuayA9PiBjaHVua1swXSk7XG5cdFx0XHR9XG5cblx0XHRcdGVuZm9yY2VBdG9taWNSZWFkRmlsZShyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiBpc0VxdWFsKHJlc291cmNlLCBhdG9taWNSZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHdyaXRlRmlsZShyZXNvdXJjZTogVVJJLCBjb250ZW50OiBVaW50OEFycmF5LCBvcHRzOiBJRmlsZUF0b21pY1dyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRpZiAob3B0cy5hdG9taWMpIHtcblx0XHRcdFx0XHRhdG9taWNXcml0ZUNvdW50ZXIrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRlbmZvcmNlQXRvbWljV3JpdGVGaWxlKHJlc291cmNlOiBVUkkpOiBJRmlsZUF0b21pY09wdGlvbnMgfCBmYWxzZSB7XG5cdFx0XHRcdHJldHVybiBpc0VxdWFsKHJlc291cmNlLCBhdG9taWNSZXNvdXJjZSkgPyB7IHBvc3RmaXg6ICcudG1wJyB9IDogZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIGRlbGV0ZShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZUF0b21pY0RlbGV0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0aWYgKG9wdHMuYXRvbWljKSB7XG5cdFx0XHRcdFx0YXRvbWljRGVsZXRlQ291bnRlcisrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGVuZm9yY2VBdG9taWNEZWxldGUocmVzb3VyY2U6IFVSSSk6IElGaWxlQXRvbWljT3B0aW9ucyB8IGZhbHNlIHtcblx0XHRcdFx0cmV0dXJuIGlzRXF1YWwocmVzb3VyY2UsIGF0b21pY1Jlc291cmNlKSA/IHsgcG9zdGZpeDogJy50bXAnIH0gOiBmYWxzZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cHJvdmlkZXIuc2V0Q2FwYWJpbGl0aWVzKFxuXHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfFxuXHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgfFxuXHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkU3RyZWFtIHxcblx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXRvbWljUmVhZCB8XG5cdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1dyaXRlIHxcblx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXRvbWljRGVsZXRlXG5cdFx0KTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ3Rlc3QnLCBwcm92aWRlcikpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZShhdG9taWNSZXNvdXJjZSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZShub25BdG9taWNSZXNvdXJjZSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZVN0cmVhbShhdG9taWNSZXNvdXJjZSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZVN0cmVhbShub25BdG9taWNSZXNvdXJjZSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShhdG9taWNSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnJykpO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKG5vbkF0b21pY1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShhdG9taWNSZXNvdXJjZSwgYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZygnJykpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShub25BdG9taWNSZXNvdXJjZSwgYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZygnJykpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKGF0b21pY1Jlc291cmNlLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJycpKSk7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUobm9uQXRvbWljUmVzb3VyY2UsIGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZygnJykpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZGVsKGF0b21pY1Jlc291cmNlKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmRlbChub25BdG9taWNSZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXRvbWljUmVhZENvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdG9taWNXcml0ZUNvdW50ZXIsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdG9taWNEZWxldGVDb3VudGVyLCAxKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsa0JBQWtCLGdCQUFnQixnQkFBZ0I7QUFDM0QsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxpQkFBOEIsb0JBQW9CO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWUsMEJBQWdEO0FBQ3hFLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFtRCxnQ0FBZ0MsVUFBcVcscUJBQXVDLHNCQUFzQjtBQUNyZixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHNCQUFzQjtBQUUvQixNQUFNLGdCQUFnQixNQUFNO0FBRTNCLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxXQUFTLE1BQU07QUFDZCxnQkFBWSxNQUFNO0FBQUEsRUFDbkIsQ0FBQztBQUVELE9BQUsseUJBQXlCLFlBQVk7QUFDekMsVUFBTSxVQUFVLFlBQVksSUFB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
