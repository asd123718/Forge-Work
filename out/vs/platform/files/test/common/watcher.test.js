import assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isLinux, isWindows } from "../../../../base/common/platform.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileChangeFilter, FileChangesEvent, FileChangeType } from "../../common/files.js";
import { coalesceEvents, reviveFileChanges, parseWatcherPatterns, isFiltered } from "../../common/watcher.js";
class TestFileWatcher extends Disposable {
  constructor() {
    super();
    this._onDidFilesChange = this._register(new Emitter());
  }
  get onDidFilesChange() {
    return this._onDidFilesChange.event;
  }
  report(changes) {
    this.onRawFileEvents(changes);
  }
  onRawFileEvents(events) {
    const coalescedEvents = coalesceEvents(events);
    if (coalescedEvents.length > 0) {
      this._onDidFilesChange.fire({ raw: reviveFileChanges(coalescedEvents), event: this.toFileChangesEvent(coalescedEvents) });
    }
  }
  toFileChangesEvent(changes) {
    return new FileChangesEvent(reviveFileChanges(changes), !isLinux);
  }
}
var Path = /* @__PURE__ */ ((Path2) => {
  Path2[Path2["UNIX"] = 0] = "UNIX";
  Path2[Path2["WINDOWS"] = 1] = "WINDOWS";
  Path2[Path2["UNC"] = 2] = "UNC";
  return Path2;
})(Path || {});
suite("Watcher", () => {
  (isWindows ? test.skip : test)("parseWatcherPatterns - posix", () => {
    const path = "/users/data/src";
    let parsedPattern = parseWatcherPatterns(path, ["*.js"], false)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    assert.strictEqual(parsedPattern("/users/data/src/bar/foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["/users/data/src/*.js"], false)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    assert.strictEqual(parsedPattern("/users/data/src/bar/foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["/users/data/src/bar/*.js"], false)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), false);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    assert.strictEqual(parsedPattern("/users/data/src/bar/foo.js"), true);
    parsedPattern = parseWatcherPatterns(path, ["**/*.js"], false)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    assert.strictEqual(parsedPattern("/users/data/src/bar/foo.js"), true);
  });
  (!isWindows ? test.skip : test)("parseWatcherPatterns - windows", () => {
    const path = "c:\\users\\data\\src";
    let parsedPattern = parseWatcherPatterns(path, ["*.js"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar/foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["c:\\users\\data\\src\\*.js"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["c:\\users\\data\\src\\bar/*.js"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\foo.js"), true);
    parsedPattern = parseWatcherPatterns(path, ["**/*.js"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\foo.js"), true);
  });
  (isWindows ? test.skip : test)("parseWatcherPatterns - posix (case insensitive)", () => {
    const path = "/users/data/src";
    let parsedPattern = parseWatcherPatterns(path, ["*.JS"], false)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), false);
    assert.strictEqual(parsedPattern("/users/data/src/foo.JS"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.Js"), false);
    parsedPattern = parseWatcherPatterns(path, ["*.JS"], true)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.JS"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.Js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    parsedPattern = parseWatcherPatterns(path, ["/users/data/src/*.JS"], true)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.JS"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    assert.strictEqual(parsedPattern("/users/data/src/bar/foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["**/Test*.JS"], true)[0];
    assert.strictEqual(parsedPattern("/users/data/src/test1.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/Test1.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/TEST1.JS"), true);
    assert.strictEqual(parsedPattern("/users/data/src/bar/test2.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/bar/TEST2.JS"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), false);
  });
  (!isWindows ? test.skip : test)("parseWatcherPatterns - windows (case insensitive)", () => {
    const path = "c:\\users\\data\\src";
    let parsedPattern = parseWatcherPatterns(path, ["*.JS"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.Js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    parsedPattern = parseWatcherPatterns(path, ["*.JS"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.Js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    parsedPattern = parseWatcherPatterns(path, ["c:\\users\\data\\src\\*.JS"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["**/Test*.JS"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\test1.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\Test1.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\TEST1.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\test2.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\TEST2.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["*.JS"], false)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.Js"), false);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
suite("Watcher Events Normalizer", () => {
  const disposables = new DisposableStore();
  teardown(() => {
    disposables.clear();
  });
  test("simple add/update/delete", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const added = URI.file("/users/data/src/added.txt");
    const updated = URI.file("/users/data/src/updated.txt");
    const deleted = URI.file("/users/data/src/deleted.txt");
    const raw = [
      { resource: added, type: FileChangeType.ADDED },
      { resource: updated, type: FileChangeType.UPDATED },
      { resource: deleted, type: FileChangeType.DELETED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 3);
      assert.ok(event.contains(added, FileChangeType.ADDED));
      assert.ok(event.contains(updated, FileChangeType.UPDATED));
      assert.ok(event.contains(deleted, FileChangeType.DELETED));
      done();
    }));
    watch.report(raw);
  });
  (isWindows ? [1 /* WINDOWS */, 2 /* UNC */] : [0 /* UNIX */]).forEach((path) => {
    test(`delete only reported for top level folder (${path})`, (done) => {
      const watch = disposables.add(new TestFileWatcher());
      const deletedFolderA = URI.file(path === 0 /* UNIX */ ? "/users/data/src/todelete1" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\todelete1" : "\\\\localhost\\users\\data\\src\\todelete1");
      const deletedFolderB = URI.file(path === 0 /* UNIX */ ? "/users/data/src/todelete2" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\todelete2" : "\\\\localhost\\users\\data\\src\\todelete2");
      const deletedFolderBF1 = URI.file(path === 0 /* UNIX */ ? "/users/data/src/todelete2/file.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\todelete2\\file.txt" : "\\\\localhost\\users\\data\\src\\todelete2\\file.txt");
      const deletedFolderBF2 = URI.file(path === 0 /* UNIX */ ? "/users/data/src/todelete2/more/test.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\todelete2\\more\\test.txt" : "\\\\localhost\\users\\data\\src\\todelete2\\more\\test.txt");
      const deletedFolderBF3 = URI.file(path === 0 /* UNIX */ ? "/users/data/src/todelete2/super/bar/foo.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\todelete2\\super\\bar\\foo.txt" : "\\\\localhost\\users\\data\\src\\todelete2\\super\\bar\\foo.txt");
      const deletedFileA = URI.file(path === 0 /* UNIX */ ? "/users/data/src/deleteme.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\deleteme.txt" : "\\\\localhost\\users\\data\\src\\deleteme.txt");
      const addedFile = URI.file(path === 0 /* UNIX */ ? "/users/data/src/added.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\added.txt" : "\\\\localhost\\users\\data\\src\\added.txt");
      const updatedFile = URI.file(path === 0 /* UNIX */ ? "/users/data/src/updated.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\updated.txt" : "\\\\localhost\\users\\data\\src\\updated.txt");
      const raw = [
        { resource: deletedFolderA, type: FileChangeType.DELETED },
        { resource: deletedFolderB, type: FileChangeType.DELETED },
        { resource: deletedFolderBF1, type: FileChangeType.DELETED },
        { resource: deletedFolderBF2, type: FileChangeType.DELETED },
        { resource: deletedFolderBF3, type: FileChangeType.DELETED },
        { resource: deletedFileA, type: FileChangeType.DELETED },
        { resource: addedFile, type: FileChangeType.ADDED },
        { resource: updatedFile, type: FileChangeType.UPDATED }
      ];
      disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
        assert.ok(event);
        assert.strictEqual(raw2.length, 5);
        assert.ok(event.contains(deletedFolderA, FileChangeType.DELETED));
        assert.ok(event.contains(deletedFolderB, FileChangeType.DELETED));
        assert.ok(event.contains(deletedFileA, FileChangeType.DELETED));
        assert.ok(event.contains(addedFile, FileChangeType.ADDED));
        assert.ok(event.contains(updatedFile, FileChangeType.UPDATED));
        done();
      }));
      watch.report(raw);
    });
  });
  test("event coalescer: ignore CREATE followed by DELETE", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const created = URI.file("/users/data/src/related");
    const deleted = URI.file("/users/data/src/related");
    const unrelated = URI.file("/users/data/src/unrelated");
    const raw = [
      { resource: created, type: FileChangeType.ADDED },
      { resource: deleted, type: FileChangeType.DELETED },
      { resource: unrelated, type: FileChangeType.UPDATED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 1);
      assert.ok(event.contains(unrelated, FileChangeType.UPDATED));
      done();
    }));
    watch.report(raw);
  });
  test("event coalescer: flatten DELETE followed by CREATE into CHANGE", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const deleted = URI.file("/users/data/src/related");
    const created = URI.file("/users/data/src/related");
    const unrelated = URI.file("/users/data/src/unrelated");
    const raw = [
      { resource: deleted, type: FileChangeType.DELETED },
      { resource: created, type: FileChangeType.ADDED },
      { resource: unrelated, type: FileChangeType.UPDATED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 2);
      assert.ok(event.contains(deleted, FileChangeType.UPDATED));
      assert.ok(event.contains(unrelated, FileChangeType.UPDATED));
      done();
    }));
    watch.report(raw);
  });
  test("event coalescer: ignore UPDATE when CREATE received", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const created = URI.file("/users/data/src/related");
    const updated = URI.file("/users/data/src/related");
    const unrelated = URI.file("/users/data/src/unrelated");
    const raw = [
      { resource: created, type: FileChangeType.ADDED },
      { resource: updated, type: FileChangeType.UPDATED },
      { resource: unrelated, type: FileChangeType.UPDATED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 2);
      assert.ok(event.contains(created, FileChangeType.ADDED));
      assert.ok(!event.contains(created, FileChangeType.UPDATED));
      assert.ok(event.contains(unrelated, FileChangeType.UPDATED));
      done();
    }));
    watch.report(raw);
  });
  test("event coalescer: apply DELETE", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const updated = URI.file("/users/data/src/related");
    const updated2 = URI.file("/users/data/src/related");
    const deleted = URI.file("/users/data/src/related");
    const unrelated = URI.file("/users/data/src/unrelated");
    const raw = [
      { resource: updated, type: FileChangeType.UPDATED },
      { resource: updated2, type: FileChangeType.UPDATED },
      { resource: unrelated, type: FileChangeType.UPDATED },
      { resource: updated, type: FileChangeType.DELETED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 2);
      assert.ok(event.contains(deleted, FileChangeType.DELETED));
      assert.ok(!event.contains(updated, FileChangeType.UPDATED));
      assert.ok(event.contains(unrelated, FileChangeType.UPDATED));
      done();
    }));
    watch.report(raw);
  });
  test("event coalescer: track case renames", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const oldPath = URI.file("/users/data/src/added");
    const newPath = URI.file("/users/data/src/ADDED");
    const raw = [
      { resource: newPath, type: FileChangeType.ADDED },
      { resource: oldPath, type: FileChangeType.DELETED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 2);
      for (const r of raw2) {
        if (isEqual(r.resource, oldPath)) {
          assert.strictEqual(r.type, FileChangeType.DELETED);
        } else if (isEqual(r.resource, newPath)) {
          assert.strictEqual(r.type, FileChangeType.ADDED);
        } else {
          assert.fail();
        }
      }
      done();
    }));
    watch.report(raw);
  });
  test("event type filter", () => {
    const resource = URI.file("/users/data/src/related");
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, void 0), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, void 0), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, void 0), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.UPDATED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.UPDATED | FileChangeFilter.DELETED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.ADDED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.ADDED | FileChangeFilter.UPDATED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.ADDED | FileChangeFilter.UPDATED | FileChangeFilter.DELETED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.UPDATED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.UPDATED | FileChangeFilter.ADDED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.DELETED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.ADDED | FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.ADDED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.DELETED | FileChangeFilter.ADDED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.UPDATED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.ADDED | FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZmlsZXNcXHRlc3RcXGNvbW1vblxcd2F0Y2hlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlRmlsdGVyLCBGaWxlQ2hhbmdlc0V2ZW50LCBGaWxlQ2hhbmdlVHlwZSwgSUZpbGVDaGFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgY29hbGVzY2VFdmVudHMsIHJldml2ZUZpbGVDaGFuZ2VzLCBwYXJzZVdhdGNoZXJQYXR0ZXJucywgaXNGaWx0ZXJlZCB9IGZyb20gJy4uLy4uL2NvbW1vbi93YXRjaGVyLmpzJztcblxuY2xhc3MgVGVzdEZpbGVXYXRjaGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRmlsZXNDaGFuZ2U6IEVtaXR0ZXI8eyByYXc6IElGaWxlQ2hhbmdlW107IGV2ZW50OiBGaWxlQ2hhbmdlc0V2ZW50IH0+O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9vbkRpZEZpbGVzQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByYXc6IElGaWxlQ2hhbmdlW107IGV2ZW50OiBGaWxlQ2hhbmdlc0V2ZW50IH0+KCkpO1xuXHR9XG5cblx0Z2V0IG9uRGlkRmlsZXNDaGFuZ2UoKTogRXZlbnQ8eyByYXc6IElGaWxlQ2hhbmdlW107IGV2ZW50OiBGaWxlQ2hhbmdlc0V2ZW50IH0+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRGaWxlc0NoYW5nZS5ldmVudDtcblx0fVxuXG5cdHJlcG9ydChjaGFuZ2VzOiBJRmlsZUNoYW5nZVtdKTogdm9pZCB7XG5cdFx0dGhpcy5vblJhd0ZpbGVFdmVudHMoY2hhbmdlcyk7XG5cdH1cblxuXHRwcml2YXRlIG9uUmF3RmlsZUV2ZW50cyhldmVudHM6IElGaWxlQ2hhbmdlW10pOiB2b2lkIHtcblxuXHRcdC8vIENvYWxlc2NlXG5cdFx0Y29uc3QgY29hbGVzY2VkRXZlbnRzID0gY29hbGVzY2VFdmVudHMoZXZlbnRzKTtcblxuXHRcdC8vIEVtaXQgdGhyb3VnaCBldmVudCBlbWl0dGVyXG5cdFx0aWYgKGNvYWxlc2NlZEV2ZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZEZpbGVzQ2hhbmdlLmZpcmUoeyByYXc6IHJldml2ZUZpbGVDaGFuZ2VzKGNvYWxlc2NlZEV2ZW50cyksIGV2ZW50OiB0aGlzLnRvRmlsZUNoYW5nZXNFdmVudChjb2FsZXNjZWRFdmVudHMpIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9GaWxlQ2hhbmdlc0V2ZW50KGNoYW5nZXM6IElGaWxlQ2hhbmdlW10pOiBGaWxlQ2hhbmdlc0V2ZW50IHtcblx0XHRyZXR1cm4gbmV3IEZpbGVDaGFuZ2VzRXZlbnQocmV2aXZlRmlsZUNoYW5nZXMoY2hhbmdlcyksICFpc0xpbnV4KTtcblx0fVxufVxuXG5lbnVtIFBhdGgge1xuXHRVTklYLFxuXHRXSU5ET1dTLFxuXHRVTkNcbn1cblxuc3VpdGUoJ1dhdGNoZXInLCAoKSA9PiB7XG5cblx0KGlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdwYXJzZVdhdGNoZXJQYXR0ZXJucyAtIHBvc2l4JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhdGggPSAnL3VzZXJzL2RhdGEvc3JjJztcblx0XHRsZXQgcGFyc2VkUGF0dGVybiA9IHBhcnNlV2F0Y2hlclBhdHRlcm5zKHBhdGgsIFsnKi5qcyddLCBmYWxzZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby50cycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9iYXIvZm9vLmpzJyksIGZhbHNlKTtcblxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJy91c2Vycy9kYXRhL3NyYy8qLmpzJ10sIGZhbHNlKVswXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLnRzJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Jhci9mb28uanMnKSwgZmFsc2UpO1xuXG5cdFx0cGFyc2VkUGF0dGVybiA9IHBhcnNlV2F0Y2hlclBhdHRlcm5zKHBhdGgsIFsnL3VzZXJzL2RhdGEvc3JjL2Jhci8qLmpzJ10sIGZhbHNlKVswXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLmpzJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby50cycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9iYXIvZm9vLmpzJyksIHRydWUpO1xuXG5cdFx0cGFyc2VkUGF0dGVybiA9IHBhcnNlV2F0Y2hlclBhdHRlcm5zKHBhdGgsIFsnKiovKi5qcyddLCBmYWxzZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby50cycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9iYXIvZm9vLmpzJyksIHRydWUpO1xuXHR9KTtcblxuXHQoIWlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdwYXJzZVdhdGNoZXJQYXR0ZXJucyAtIHdpbmRvd3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGF0aCA9ICdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyYyc7XG5cdFx0bGV0IHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJyouanMnXSwgdHJ1ZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28udHMnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxiYXIvZm9vLmpzJyksIGZhbHNlKTtcblxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXCouanMnXSwgdHJ1ZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28udHMnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxiYXJcXFxcZm9vLmpzJyksIGZhbHNlKTtcblxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGJhci8qLmpzJ10sIHRydWUpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5qcycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby50cycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGJhclxcXFxmb28uanMnKSwgdHJ1ZSk7XG5cblx0XHRwYXJzZWRQYXR0ZXJuID0gcGFyc2VXYXRjaGVyUGF0dGVybnMocGF0aCwgWycqKi8qLmpzJ10sIHRydWUpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLnRzJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcYmFyXFxcXGZvby5qcycpLCB0cnVlKTtcblx0fSk7XG5cblx0KGlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdwYXJzZVdhdGNoZXJQYXR0ZXJucyAtIHBvc2l4IChjYXNlIGluc2Vuc2l0aXZlKScsICgpID0+IHtcblx0XHRjb25zdCBwYXRoID0gJy91c2Vycy9kYXRhL3NyYyc7XG5cdFx0bGV0IHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJyouSlMnXSwgZmFsc2UpWzBdO1xuXG5cdFx0Ly8gQ2FzZSBzZW5zaXRpdmUgYnkgZGVmYXVsdCBvbiBwb3NpeFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLmpzJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5KUycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5KcycpLCBmYWxzZSk7XG5cblx0XHQvLyBOb3cgdGVzdCB3aXRoIEdsb2JDYXNlU2Vuc2l0aXZpdHkuY2FzZUluc2Vuc2l0aXZlXG5cdFx0cGFyc2VkUGF0dGVybiA9IHBhcnNlV2F0Y2hlclBhdHRlcm5zKHBhdGgsIFsnKi5KUyddLCB0cnVlKVswXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLkpTJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLkpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLnRzJyksIGZhbHNlKTtcblxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJy91c2Vycy9kYXRhL3NyYy8qLkpTJ10sIHRydWUpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9mb28uanMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9mb28uSlMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9mb28udHMnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvYmFyL2Zvby5qcycpLCBmYWxzZSk7XG5cblx0XHRwYXJzZWRQYXR0ZXJuID0gcGFyc2VXYXRjaGVyUGF0dGVybnMocGF0aCwgWycqKi9UZXN0Ki5KUyddLCB0cnVlKVswXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvdGVzdDEuanMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9UZXN0MS5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL1RFU1QxLkpTJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvYmFyL3Rlc3QyLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvYmFyL1RFU1QyLkpTJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLmpzJyksIGZhbHNlKTtcblx0fSk7XG5cblx0KCFpc1dpbmRvd3MgPyB0ZXN0LnNraXAgOiB0ZXN0KSgncGFyc2VXYXRjaGVyUGF0dGVybnMgLSB3aW5kb3dzIChjYXNlIGluc2Vuc2l0aXZlKScsICgpID0+IHtcblx0XHRjb25zdCBwYXRoID0gJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjJztcblx0XHRsZXQgcGFyc2VkUGF0dGVybiA9IHBhcnNlV2F0Y2hlclBhdHRlcm5zKHBhdGgsIFsnKi5KUyddLCB0cnVlKVswXTtcblxuXHRcdC8vIFdpbmRvd3MgaXMgY2FzZSBpbnNlbnNpdGl2ZSBieSBkZWZhdWx0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLkpTJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28uSnMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby50cycpLCBmYWxzZSk7XG5cblx0XHQvLyBFeHBsaWNpdCBHbG9iQ2FzZVNlbnNpdGl2aXR5LmNhc2VJbnNlbnNpdGl2ZSBzaG91bGQgd29yayB0aGUgc2FtZVxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJyouSlMnXSwgdHJ1ZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28uSlMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5KcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLnRzJyksIGZhbHNlKTtcblxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXCouSlMnXSwgdHJ1ZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28uSlMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby50cycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGJhclxcXFxmb28uanMnKSwgZmFsc2UpO1xuXG5cdFx0cGFyc2VkUGF0dGVybiA9IHBhcnNlV2F0Y2hlclBhdHRlcm5zKHBhdGgsIFsnKiovVGVzdCouSlMnXSwgdHJ1ZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcdGVzdDEuanMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXFRlc3QxLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxURVNUMS5KUycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcYmFyXFxcXHRlc3QyLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxiYXJcXFxcVEVTVDIuSlMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5qcycpLCBmYWxzZSk7XG5cblx0XHQvLyBUZXN0IHdpdGggY2FzZSBzZW5zaXRpdmUgbW9kZSBleHBsaWNpdGx5XG5cdFx0cGFyc2VkUGF0dGVybiA9IHBhcnNlV2F0Y2hlclBhdHRlcm5zKHBhdGgsIFsnKi5KUyddLCBmYWxzZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLmpzJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLkpTJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28uSnMnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuXG5zdWl0ZSgnV2F0Y2hlciBFdmVudHMgTm9ybWFsaXplcicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlIGFkZC91cGRhdGUvZGVsZXRlJywgZG9uZSA9PiB7XG5cdFx0Y29uc3Qgd2F0Y2ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RGaWxlV2F0Y2hlcigpKTtcblxuXHRcdGNvbnN0IGFkZGVkID0gVVJJLmZpbGUoJy91c2Vycy9kYXRhL3NyYy9hZGRlZC50eHQnKTtcblx0XHRjb25zdCB1cGRhdGVkID0gVVJJLmZpbGUoJy91c2Vycy9kYXRhL3NyYy91cGRhdGVkLnR4dCcpO1xuXHRcdGNvbnN0IGRlbGV0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL2RlbGV0ZWQudHh0Jyk7XG5cblx0XHRjb25zdCByYXc6IElGaWxlQ2hhbmdlW10gPSBbXG5cdFx0XHR7IHJlc291cmNlOiBhZGRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSxcblx0XHRcdHsgcmVzb3VyY2U6IHVwZGF0ZWQsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSxcblx0XHRcdHsgcmVzb3VyY2U6IGRlbGV0ZWQsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfSxcblx0XHRdO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdhdGNoLm9uRGlkRmlsZXNDaGFuZ2UoKHsgZXZlbnQsIHJhdyB9KSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhdy5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50LmNvbnRhaW5zKGFkZGVkLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50LmNvbnRhaW5zKHVwZGF0ZWQsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpKTtcblx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyhkZWxldGVkLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSk7XG5cblx0XHRcdGRvbmUoKTtcblx0XHR9KSk7XG5cblx0XHR3YXRjaC5yZXBvcnQocmF3KTtcblx0fSk7XG5cblx0KGlzV2luZG93cyA/IFtQYXRoLldJTkRPV1MsIFBhdGguVU5DXSA6IFtQYXRoLlVOSVhdKS5mb3JFYWNoKHBhdGggPT4ge1xuXHRcdHRlc3QoYGRlbGV0ZSBvbmx5IHJlcG9ydGVkIGZvciB0b3AgbGV2ZWwgZm9sZGVyICgke3BhdGh9KWAsIGRvbmUgPT4ge1xuXHRcdFx0Y29uc3Qgd2F0Y2ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RGaWxlV2F0Y2hlcigpKTtcblxuXHRcdFx0Y29uc3QgZGVsZXRlZEZvbGRlckEgPSBVUkkuZmlsZShwYXRoID09PSBQYXRoLlVOSVggPyAnL3VzZXJzL2RhdGEvc3JjL3RvZGVsZXRlMScgOiBwYXRoID09PSBQYXRoLldJTkRPV1MgPyAnQzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcdG9kZWxldGUxJyA6ICdcXFxcXFxcXGxvY2FsaG9zdFxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFx0b2RlbGV0ZTEnKTtcblx0XHRcdGNvbnN0IGRlbGV0ZWRGb2xkZXJCID0gVVJJLmZpbGUocGF0aCA9PT0gUGF0aC5VTklYID8gJy91c2Vycy9kYXRhL3NyYy90b2RlbGV0ZTInIDogcGF0aCA9PT0gUGF0aC5XSU5ET1dTID8gJ0M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHRvZGVsZXRlMicgOiAnXFxcXFxcXFxsb2NhbGhvc3RcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcdG9kZWxldGUyJyk7XG5cdFx0XHRjb25zdCBkZWxldGVkRm9sZGVyQkYxID0gVVJJLmZpbGUocGF0aCA9PT0gUGF0aC5VTklYID8gJy91c2Vycy9kYXRhL3NyYy90b2RlbGV0ZTIvZmlsZS50eHQnIDogcGF0aCA9PT0gUGF0aC5XSU5ET1dTID8gJ0M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHRvZGVsZXRlMlxcXFxmaWxlLnR4dCcgOiAnXFxcXFxcXFxsb2NhbGhvc3RcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcdG9kZWxldGUyXFxcXGZpbGUudHh0Jyk7XG5cdFx0XHRjb25zdCBkZWxldGVkRm9sZGVyQkYyID0gVVJJLmZpbGUocGF0aCA9PT0gUGF0aC5VTklYID8gJy91c2Vycy9kYXRhL3NyYy90b2RlbGV0ZTIvbW9yZS90ZXN0LnR4dCcgOiBwYXRoID09PSBQYXRoLldJTkRPV1MgPyAnQzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcdG9kZWxldGUyXFxcXG1vcmVcXFxcdGVzdC50eHQnIDogJ1xcXFxcXFxcbG9jYWxob3N0XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHRvZGVsZXRlMlxcXFxtb3JlXFxcXHRlc3QudHh0Jyk7XG5cdFx0XHRjb25zdCBkZWxldGVkRm9sZGVyQkYzID0gVVJJLmZpbGUocGF0aCA9PT0gUGF0aC5VTklYID8gJy91c2Vycy9kYXRhL3NyYy90b2RlbGV0ZTIvc3VwZXIvYmFyL2Zvby50eHQnIDogcGF0aCA9PT0gUGF0aC5XSU5ET1dTID8gJ0M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHRvZGVsZXRlMlxcXFxzdXBlclxcXFxiYXJcXFxcZm9vLnR4dCcgOiAnXFxcXFxcXFxsb2NhbGhvc3RcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcdG9kZWxldGUyXFxcXHN1cGVyXFxcXGJhclxcXFxmb28udHh0Jyk7XG5cdFx0XHRjb25zdCBkZWxldGVkRmlsZUEgPSBVUkkuZmlsZShwYXRoID09PSBQYXRoLlVOSVggPyAnL3VzZXJzL2RhdGEvc3JjL2RlbGV0ZW1lLnR4dCcgOiBwYXRoID09PSBQYXRoLldJTkRPV1MgPyAnQzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZGVsZXRlbWUudHh0JyA6ICdcXFxcXFxcXGxvY2FsaG9zdFxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxkZWxldGVtZS50eHQnKTtcblxuXHRcdFx0Y29uc3QgYWRkZWRGaWxlID0gVVJJLmZpbGUocGF0aCA9PT0gUGF0aC5VTklYID8gJy91c2Vycy9kYXRhL3NyYy9hZGRlZC50eHQnIDogcGF0aCA9PT0gUGF0aC5XSU5ET1dTID8gJ0M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGFkZGVkLnR4dCcgOiAnXFxcXFxcXFxsb2NhbGhvc3RcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcYWRkZWQudHh0Jyk7XG5cdFx0XHRjb25zdCB1cGRhdGVkRmlsZSA9IFVSSS5maWxlKHBhdGggPT09IFBhdGguVU5JWCA/ICcvdXNlcnMvZGF0YS9zcmMvdXBkYXRlZC50eHQnIDogcGF0aCA9PT0gUGF0aC5XSU5ET1dTID8gJ0M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHVwZGF0ZWQudHh0JyA6ICdcXFxcXFxcXGxvY2FsaG9zdFxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFx1cGRhdGVkLnR4dCcpO1xuXG5cdFx0XHRjb25zdCByYXc6IElGaWxlQ2hhbmdlW10gPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IGRlbGV0ZWRGb2xkZXJBLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IGRlbGV0ZWRGb2xkZXJCLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IGRlbGV0ZWRGb2xkZXJCRjEsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogZGVsZXRlZEZvbGRlckJGMiwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBkZWxldGVkRm9sZGVyQkYzLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IGRlbGV0ZWRGaWxlQSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBhZGRlZEZpbGUsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IHVwZGF0ZWRGaWxlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH1cblx0XHRcdF07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh3YXRjaC5vbkRpZEZpbGVzQ2hhbmdlKCh7IGV2ZW50LCByYXcgfSkgPT4ge1xuXHRcdFx0XHRhc3NlcnQub2soZXZlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmF3Lmxlbmd0aCwgNSk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKGV2ZW50LmNvbnRhaW5zKGRlbGV0ZWRGb2xkZXJBLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSk7XG5cdFx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyhkZWxldGVkRm9sZGVyQiwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCkpO1xuXHRcdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnMoZGVsZXRlZEZpbGVBLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSk7XG5cdFx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyhhZGRlZEZpbGUsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKSk7XG5cdFx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyh1cGRhdGVkRmlsZSwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCkpO1xuXG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0d2F0Y2gucmVwb3J0KHJhdyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGNvYWxlc2NlcjogaWdub3JlIENSRUFURSBmb2xsb3dlZCBieSBERUxFVEUnLCBkb25lID0+IHtcblx0XHRjb25zdCB3YXRjaCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVXYXRjaGVyKCkpO1xuXG5cdFx0Y29uc3QgY3JlYXRlZCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvcmVsYXRlZCcpO1xuXHRcdGNvbnN0IGRlbGV0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3JlbGF0ZWQnKTtcblx0XHRjb25zdCB1bnJlbGF0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3VucmVsYXRlZCcpO1xuXG5cdFx0Y29uc3QgcmF3OiBJRmlsZUNoYW5nZVtdID0gW1xuXHRcdFx0eyByZXNvdXJjZTogY3JlYXRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSxcblx0XHRcdHsgcmVzb3VyY2U6IGRlbGV0ZWQsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfSxcblx0XHRcdHsgcmVzb3VyY2U6IHVucmVsYXRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9LFxuXHRcdF07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQod2F0Y2gub25EaWRGaWxlc0NoYW5nZSgoeyBldmVudCwgcmF3IH0pID0+IHtcblx0XHRcdGFzc2VydC5vayhldmVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmF3Lmxlbmd0aCwgMSk7XG5cblx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyh1bnJlbGF0ZWQsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpKTtcblxuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pKTtcblxuXHRcdHdhdGNoLnJlcG9ydChyYXcpO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBjb2FsZXNjZXI6IGZsYXR0ZW4gREVMRVRFIGZvbGxvd2VkIGJ5IENSRUFURSBpbnRvIENIQU5HRScsIGRvbmUgPT4ge1xuXHRcdGNvbnN0IHdhdGNoID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RmlsZVdhdGNoZXIoKSk7XG5cblx0XHRjb25zdCBkZWxldGVkID0gVVJJLmZpbGUoJy91c2Vycy9kYXRhL3NyYy9yZWxhdGVkJyk7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvcmVsYXRlZCcpO1xuXHRcdGNvbnN0IHVucmVsYXRlZCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvdW5yZWxhdGVkJyk7XG5cblx0XHRjb25zdCByYXc6IElGaWxlQ2hhbmdlW10gPSBbXG5cdFx0XHR7IHJlc291cmNlOiBkZWxldGVkLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sXG5cdFx0XHR7IHJlc291cmNlOiBjcmVhdGVkLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRCB9LFxuXHRcdFx0eyByZXNvdXJjZTogdW5yZWxhdGVkLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sXG5cdFx0XTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh3YXRjaC5vbkRpZEZpbGVzQ2hhbmdlKCh7IGV2ZW50LCByYXcgfSkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYXcubGVuZ3RoLCAyKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50LmNvbnRhaW5zKGRlbGV0ZWQsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpKTtcblx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyh1bnJlbGF0ZWQsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpKTtcblxuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pKTtcblxuXHRcdHdhdGNoLnJlcG9ydChyYXcpO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBjb2FsZXNjZXI6IGlnbm9yZSBVUERBVEUgd2hlbiBDUkVBVEUgcmVjZWl2ZWQnLCBkb25lID0+IHtcblx0XHRjb25zdCB3YXRjaCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVXYXRjaGVyKCkpO1xuXG5cdFx0Y29uc3QgY3JlYXRlZCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvcmVsYXRlZCcpO1xuXHRcdGNvbnN0IHVwZGF0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3JlbGF0ZWQnKTtcblx0XHRjb25zdCB1bnJlbGF0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3VucmVsYXRlZCcpO1xuXG5cdFx0Y29uc3QgcmF3OiBJRmlsZUNoYW5nZVtdID0gW1xuXHRcdFx0eyByZXNvdXJjZTogY3JlYXRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSxcblx0XHRcdHsgcmVzb3VyY2U6IHVwZGF0ZWQsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSxcblx0XHRcdHsgcmVzb3VyY2U6IHVucmVsYXRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9LFxuXHRcdF07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQod2F0Y2gub25EaWRGaWxlc0NoYW5nZSgoeyBldmVudCwgcmF3IH0pID0+IHtcblx0XHRcdGFzc2VydC5vayhldmVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmF3Lmxlbmd0aCwgMik7XG5cblx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyhjcmVhdGVkLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFldmVudC5jb250YWlucyhjcmVhdGVkLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSk7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnModW5yZWxhdGVkLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSk7XG5cblx0XHRcdGRvbmUoKTtcblx0XHR9KSk7XG5cblx0XHR3YXRjaC5yZXBvcnQocmF3KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgY29hbGVzY2VyOiBhcHBseSBERUxFVEUnLCBkb25lID0+IHtcblx0XHRjb25zdCB3YXRjaCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVXYXRjaGVyKCkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlZCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvcmVsYXRlZCcpO1xuXHRcdGNvbnN0IHVwZGF0ZWQyID0gVVJJLmZpbGUoJy91c2Vycy9kYXRhL3NyYy9yZWxhdGVkJyk7XG5cdFx0Y29uc3QgZGVsZXRlZCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvcmVsYXRlZCcpO1xuXHRcdGNvbnN0IHVucmVsYXRlZCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvdW5yZWxhdGVkJyk7XG5cblx0XHRjb25zdCByYXc6IElGaWxlQ2hhbmdlW10gPSBbXG5cdFx0XHR7IHJlc291cmNlOiB1cGRhdGVkLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sXG5cdFx0XHR7IHJlc291cmNlOiB1cGRhdGVkMiwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9LFxuXHRcdFx0eyByZXNvdXJjZTogdW5yZWxhdGVkLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sXG5cdFx0XHR7IHJlc291cmNlOiB1cGRhdGVkLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH1cblx0XHRdO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdhdGNoLm9uRGlkRmlsZXNDaGFuZ2UoKHsgZXZlbnQsIHJhdyB9KSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhdy5sZW5ndGgsIDIpO1xuXG5cdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnMoZGVsZXRlZCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFldmVudC5jb250YWlucyh1cGRhdGVkLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSk7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnModW5yZWxhdGVkLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSk7XG5cblx0XHRcdGRvbmUoKTtcblx0XHR9KSk7XG5cblx0XHR3YXRjaC5yZXBvcnQocmF3KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgY29hbGVzY2VyOiB0cmFjayBjYXNlIHJlbmFtZXMnLCBkb25lID0+IHtcblx0XHRjb25zdCB3YXRjaCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVXYXRjaGVyKCkpO1xuXG5cdFx0Y29uc3Qgb2xkUGF0aCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvYWRkZWQnKTtcblx0XHRjb25zdCBuZXdQYXRoID0gVVJJLmZpbGUoJy91c2Vycy9kYXRhL3NyYy9BRERFRCcpO1xuXG5cdFx0Y29uc3QgcmF3OiBJRmlsZUNoYW5nZVtdID0gW1xuXHRcdFx0eyByZXNvdXJjZTogbmV3UGF0aCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSxcblx0XHRcdHsgcmVzb3VyY2U6IG9sZFBhdGgsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfVxuXHRcdF07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQod2F0Y2gub25EaWRGaWxlc0NoYW5nZSgoeyBldmVudCwgcmF3IH0pID0+IHtcblx0XHRcdGFzc2VydC5vayhldmVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmF3Lmxlbmd0aCwgMik7XG5cblx0XHRcdGZvciAoY29uc3QgciBvZiByYXcpIHtcblx0XHRcdFx0aWYgKGlzRXF1YWwoci5yZXNvdXJjZSwgb2xkUGF0aCkpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoci50eXBlLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc0VxdWFsKHIucmVzb3VyY2UsIG5ld1BhdGgpKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIudHlwZSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pKTtcblxuXHRcdHdhdGNoLnJlcG9ydChyYXcpO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCB0eXBlIGZpbHRlcicsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvcmVsYXRlZCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSwgdW5kZWZpbmVkKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSwgdW5kZWZpbmVkKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfSwgdW5kZWZpbmVkKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSwgRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSwgRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEIHwgRmlsZUNoYW5nZUZpbHRlci5ERUxFVEVEKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRCB9LCBGaWxlQ2hhbmdlRmlsdGVyLkFEREVEKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuQURERUQgfCBGaWxlQ2hhbmdlRmlsdGVyLlVQREFURUQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSwgRmlsZUNoYW5nZUZpbHRlci5BRERFRCB8IEZpbGVDaGFuZ2VGaWx0ZXIuVVBEQVRFRCB8IEZpbGVDaGFuZ2VGaWx0ZXIuREVMRVRFRCksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfSwgRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9LCBGaWxlQ2hhbmdlRmlsdGVyLlVQREFURUQgfCBGaWxlQ2hhbmdlRmlsdGVyLkFEREVEKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuREVMRVRFRCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuREVMRVRFRCB8IEZpbGVDaGFuZ2VGaWx0ZXIuVVBEQVRFRCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuQURERUQgfCBGaWxlQ2hhbmdlRmlsdGVyLkRFTEVURUQgfCBGaWxlQ2hhbmdlRmlsdGVyLlVQREFURUQpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuQURERUQpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuREVMRVRFRCB8IEZpbGVDaGFuZ2VGaWx0ZXIuQURERUQpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSwgRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSwgRmlsZUNoYW5nZUZpbHRlci5ERUxFVEVEIHwgRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSwgRmlsZUNoYW5nZUZpbHRlci5BRERFRCB8IEZpbGVDaGFuZ2VGaWx0ZXIuREVMRVRFRCB8IEZpbGVDaGFuZ2VGaWx0ZXIuVVBEQVRFRCksIGZhbHNlKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxTQUFTLGlCQUFpQjtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQWtCLGtCQUFrQixzQkFBbUM7QUFDaEYsU0FBUyxnQkFBZ0IsbUJBQW1CLHNCQUFzQixrQkFBa0I7QUFFcEYsTUFBTSx3QkFBd0IsV0FBVztBQUFBLEVBR3hDLGNBQWM7QUFDYixVQUFNO0FBRU4sU0FBSyxvQkFBb0IsS0FBSyxVQUFVLElBQUksUUFBeUQsQ0FBQztBQUFBLEVBQ3ZHO0FBQUEsRUFFQSxJQUFJLG1CQUEyRTtBQUM5RSxXQUFPLEtBQUssa0JBQWtCO0FBQUEsRUFDL0I7QUFBQSxFQUVBLE9BQU8sU0FBOEI7QUFDcEMsU0FBSyxnQkFBZ0IsT0FBTztBQUFBLEVBQzdCO0FBQUEsRUFFUSxnQkFBZ0IsUUFBNkI7QUFHcEQsVUFBTSxrQkFBa0IsZUFBZSxNQUFNO0FBRzdDLFFBQUksZ0JBQWdCLFNBQVMsR0FBRztBQUMvQixXQUFLLGtCQUFrQixLQUFLLEVBQUUsS0FBSyxrQkFBa0IsZUFBZSxHQUFHLE9BQU8sS0FBSyxtQkFBbUIsZUFBZSxFQUFFLENBQUM7QUFB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
