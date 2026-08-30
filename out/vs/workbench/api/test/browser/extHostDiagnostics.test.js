import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { DiagnosticCollection, ExtHostDiagnostics } from "../../common/extHostDiagnostics.js";
import { Diagnostic, DiagnosticSeverity, Range, DiagnosticRelatedInformation, Location } from "../../common/extHostTypes.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { mock } from "../../../../base/test/common/mock.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { nullExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { ExtUri, extUri } from "../../../../base/common/resources.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostDiagnostics", () => {
  class DiagnosticsShape extends mock() {
    $changeMany(owner, entries) {
    }
    $clear(owner) {
    }
  }
  const fileSystemInfoService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.extUri = extUri;
    }
  }();
  const versionProvider = (uri) => {
    return void 0;
  };
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("disposeCheck", () => {
    const collection = new DiagnosticCollection("test", "test", 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
    collection.dispose();
    collection.dispose();
    assert.throws(() => collection.name);
    assert.throws(() => collection.clear());
    assert.throws(() => collection.delete(URI.parse("aa:bb")));
    assert.throws(() => collection.forEach(() => {
    }));
    assert.throws(() => collection.get(URI.parse("aa:bb")));
    assert.throws(() => collection.has(URI.parse("aa:bb")));
    assert.throws(() => collection.set(URI.parse("aa:bb"), []));
    assert.throws(() => collection.set(URI.parse("aa:bb"), void 0));
  });
  test("diagnostic collection, forEach, clear, has", function() {
    let collection = new DiagnosticCollection("test", "test", 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
    assert.strictEqual(collection.name, "test");
    collection.dispose();
    assert.throws(() => collection.name);
    let c = 0;
    collection = new DiagnosticCollection("test", "test", 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
    collection.forEach(() => c++);
    assert.strictEqual(c, 0);
    collection.set(URI.parse("foo:bar"), [
      new Diagnostic(new Range(0, 0, 1, 1), "message-1"),
      new Diagnostic(new Range(0, 0, 1, 1), "message-2")
    ]);
    collection.forEach(() => c++);
    assert.strictEqual(c, 1);
    c = 0;
    collection.clear();
    collection.forEach(() => c++);
    assert.strictEqual(c, 0);
    collection.set(URI.parse("foo:bar1"), [
      new Diagnostic(new Range(0, 0, 1, 1), "message-1"),
      new Diagnostic(new Range(0, 0, 1, 1), "message-2")
    ]);
    collection.set(URI.parse("foo:bar2"), [
      new Diagnostic(new Range(0, 0, 1, 1), "message-1"),
      new Diagnostic(new Range(0, 0, 1, 1), "message-2")
    ]);
    collection.forEach(() => c++);
    assert.strictEqual(c, 2);
    assert.ok(collection.has(URI.parse("foo:bar1")));
    assert.ok(collection.has(URI.parse("foo:bar2")));
    assert.ok(!collection.has(URI.parse("foo:bar3")));
    collection.delete(URI.parse("foo:bar1"));
    assert.ok(!collection.has(URI.parse("foo:bar1")));
    collection.dispose();
  });
  test("diagnostic collection, immutable read", function() {
    const collection = new DiagnosticCollection("test", "test", 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
    collection.set(URI.parse("foo:bar"), [
      new Diagnostic(new Range(0, 0, 1, 1), "message-1"),
      new Diagnostic(new Range(0, 0, 1, 1), "message-2")
    ]);
    let array = collection.get(URI.parse("foo:bar"));
    assert.throws(() => array.length = 0);
    assert.throws(() => array.pop());
    assert.throws(() => array[0] = new Diagnostic(new Range(0, 0, 0, 0), "evil"));
    collection.forEach((uri, array2) => {
      assert.throws(() => array2.length = 0);
      assert.throws(() => array2.pop());
      assert.throws(() => array2[0] = new Diagnostic(new Range(0, 0, 0, 0), "evil"));
    });
    array = collection.get(URI.parse("foo:bar"));
    assert.strictEqual(array.length, 2);
    collection.dispose();
  });
  test("diagnostics collection, set with dupliclated tuples", function() {
    const collection = new DiagnosticCollection("test", "test", 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
    const uri = URI.parse("sc:hightower");
    collection.set([
      [uri, [new Diagnostic(new Range(0, 0, 0, 1), "message-1")]],
      [URI.parse("some:thing"), [new Diagnostic(new Range(0, 0, 1, 1), "something")]],
      [uri, [new Diagnostic(new Range(0, 0, 0, 1), "message-2")]]
    ]);
    let array = collection.get(uri);
    assert.strictEqual(array.length, 2);
    let [first, second] = array;
    assert.strictEqual(first.message, "message-1");
    assert.strictEqual(second.message, "message-2");
    collection.delete(uri);
    assert.ok(!collection.has(uri));
    collection.set([
      [uri, [new Diagnostic(new Range(0, 0, 0, 1), "message-1")]],
      [URI.parse("some:thing"), [new Diagnostic(new Range(0, 0, 1, 1), "something")]],
      [uri, void 0]
    ]);
    assert.ok(!collection.has(uri));
    collection.delete(uri);
    assert.ok(!collection.has(uri));
    collection.set([
      [uri, [new Diagnostic(new Range(0, 0, 0, 1), "message-1")]],
      [URI.parse("some:thing"), [new Diagnostic(new Range(0, 0, 1, 1), "something")]],
      [uri, void 0],
      [uri, [new Diagnostic(new Range(0, 0, 0, 1), "message-2")]],
      [uri, [new Diagnostic(new Range(0, 0, 0, 1), "message-3")]]
    ]);
    array = collection.get(uri);
    assert.strictEqual(array.length, 2);
    [first, second] = array;
    assert.strictEqual(first.message, "message-2");
    assert.strictEqual(second.message, "message-3");
    collection.dispose();
  });
  test("diagnostics collection, set tuple overrides, #11547", function() {
    let lastEntries;
    const collection = new DiagnosticCollection("test", "test", 100, 100, versionProvider, extUri, new class extends DiagnosticsShape {
      $changeMany(owner, entries) {
        lastEntries = entries;
        return super.$changeMany(owner, entries);
      }
    }(), new Emitter());
    const uri = URI.parse("sc:hightower");
    collection.set([[uri, [new Diagnostic(new Range(0, 0, 1, 1), "error")]]]);
    assert.strictEqual(collection.get(uri).length, 1);
    assert.strictEqual(collection.get(uri)[0].message, "error");
    assert.strictEqual(lastEntries.length, 1);
    const [[, data1]] = lastEntries;
    assert.strictEqual(data1.length, 1);
    assert.strictEqual(data1[0].message, "error");
    lastEntries = void 0;
    collection.set([[uri, [new Diagnostic(new Range(0, 0, 1, 1), "warning")]]]);
    assert.strictEqual(collection.get(uri).length, 1);
    assert.strictEqual(collection.get(uri)[0].message, "warning");
    assert.strictEqual(lastEntries.length, 1);
    const [[, data2]] = lastEntries;
    assert.strictEqual(data2.length, 1);
    assert.strictEqual(data2[0].message, "warning");
    lastEntries = void 0;
  });
  test("do send message when not making a change", function() {
    let changeCount = 0;
    let eventCount = 0;
    const emitter = new Emitter();
    store.add(emitter.event((_) => eventCount += 1));
    const collection = new DiagnosticCollection("test", "test", 100, 100, versionProvider, extUri, new class extends DiagnosticsShape {
      $changeMany() {
        changeCount += 1;
      }
    }(), emitter);
    const uri = URI.parse("sc:hightower");
    const diag = new Diagnostic(new Range(0, 0, 0, 1), "ffff");
    collection.set(uri, [diag]);
    assert.strictEqual(changeCount, 1);
    assert.strictEqual(eventCount, 1);
    collection.set(uri, [diag]);
    assert.strictEqual(changeCount, 2);
    assert.strictEqual(eventCount, 2);
  });
  test("diagnostics collection, tuples and undefined (small array), #15585", function() {
    const collection = new DiagnosticCollection("test", "test", 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
    const uri = URI.parse("sc:hightower");
    const uri2 = URI.parse("sc:nomad");
    const diag = new Diagnostic(new Range(0, 0, 0, 1), "ffff");
    collection.set([
      [uri, [diag, diag, diag]],
      [uri, void 0],
      [uri, [diag]],
      [uri2, [diag, diag]],
      [uri2, void 0],
      [uri2, [diag]]
    ]);
    assert.strictEqual(collection.get(uri).length, 1);
    assert.strictEqual(collection.get(uri2).length, 1);
  });
  test("diagnostics collection, tuples and undefined (large array), #15585", function() {
    const collection = new DiagnosticCollection("test", "test", 100, 100, versionProvider, extUri, new DiagnosticsShape(), new Emitter());
    const tuples = [];
    for (let i = 0; i < 500; i++) {
      const uri = URI.parse("sc:hightower#" + i);
      const diag = new Diagnostic(new Range(0, 0, 0, 1), i.toString());
      tuples.push([uri, [diag, diag, diag]]);
      tuples.push([uri, void 0]);
      tuples.push([uri, [diag]]);
    }
    collection.set(tuples);
    for (let i = 0; i < 500; i++) {
      const uri = URI.parse("sc:hightower#" + i);
      assert.strictEqual(collection.has(uri), true);
      assert.strictEqual(collection.get(uri).length, 1);
    }
  });
  test("diagnostic capping (max per file)", function() {
    let lastEntries;
    const collection = new DiagnosticCollection("test", "test", 100, 250, versionProvider, extUri, new class extends DiagnosticsShape {
      $changeMany(owner, entries) {
        lastEntries = entries;
        return super.$changeMany(owner, entries);
      }
    }(), new Emitter());
    const uri = URI.parse("aa:bb");
    const diagnostics = [];
    for (let i = 0; i < 500; i++) {
      diagnostics.push(new Diagnostic(new Range(i, 0, i + 1, 0), `error#${i}`, i < 300 ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error));
    }
    collection.set(uri, diagnostics);
    assert.strictEqual(collection.get(uri).length, 500);
    assert.strictEqual(lastEntries.length, 1);
    assert.strictEqual(lastEntries[0][1].length, 251);
    assert.strictEqual(lastEntries[0][1][0].severity, MarkerSeverity.Error);
    assert.strictEqual(lastEntries[0][1][200].severity, MarkerSeverity.Warning);
    assert.strictEqual(lastEntries[0][1][250].severity, MarkerSeverity.Info);
  });
  test("diagnostic capping (max files)", function() {
    let lastEntries;
    const collection = new DiagnosticCollection("test", "test", 2, 1, versionProvider, extUri, new class extends DiagnosticsShape {
      $changeMany(owner, entries) {
        lastEntries = entries;
        return super.$changeMany(owner, entries);
      }
    }(), new Emitter());
    const diag = new Diagnostic(new Range(0, 0, 1, 1), "Hello");
    collection.set([
      [URI.parse("aa:bb1"), [diag]],
      [URI.parse("aa:bb2"), [diag]],
      [URI.parse("aa:bb3"), [diag]],
      [URI.parse("aa:bb4"), [diag]]
    ]);
    assert.strictEqual(lastEntries.length, 3);
  });
  test("diagnostic eventing", async function() {
    const emitter = new Emitter();
    const collection = new DiagnosticCollection("ddd", "test", 100, 100, versionProvider, extUri, new DiagnosticsShape(), emitter);
    const diag1 = new Diagnostic(new Range(1, 1, 2, 3), "diag1");
    const diag2 = new Diagnostic(new Range(1, 1, 2, 3), "diag2");
    const diag3 = new Diagnostic(new Range(1, 1, 2, 3), "diag3");
    let p = Event.toPromise(emitter.event).then((a) => {
      assert.strictEqual(a.length, 1);
      assert.strictEqual(a[0].toString(), "aa:bb");
      assert.ok(URI.isUri(a[0]));
    });
    collection.set(URI.parse("aa:bb"), []);
    await p;
    p = Event.toPromise(emitter.event).then((e) => {
      assert.strictEqual(e.length, 2);
      assert.ok(URI.isUri(e[0]));
      assert.ok(URI.isUri(e[1]));
      assert.strictEqual(e[0].toString(), "aa:bb");
      assert.strictEqual(e[1].toString(), "aa:cc");
    });
    collection.set([
      [URI.parse("aa:bb"), [diag1]],
      [URI.parse("aa:cc"), [diag2, diag3]]
    ]);
    await p;
    p = Event.toPromise(emitter.event).then((e) => {
      assert.strictEqual(e.length, 2);
      assert.ok(URI.isUri(e[0]));
      assert.ok(URI.isUri(e[1]));
    });
    collection.clear();
    await p;
  });
  test("vscode.languages.onDidChangeDiagnostics Does Not Provide Document URI #49582", async function() {
    const emitter = new Emitter();
    const collection = new DiagnosticCollection("ddd", "test", 100, 100, versionProvider, extUri, new DiagnosticsShape(), emitter);
    const diag1 = new Diagnostic(new Range(1, 1, 2, 3), "diag1");
    collection.set(URI.parse("aa:bb"), [diag1]);
    let p = Event.toPromise(emitter.event).then((e) => {
      assert.strictEqual(e[0].toString(), "aa:bb");
    });
    collection.delete(URI.parse("aa:bb"));
    await p;
    collection.set(URI.parse("aa:bb"), [diag1]);
    p = Event.toPromise(emitter.event).then((e) => {
      assert.strictEqual(e[0].toString(), "aa:bb");
    });
    collection.set(URI.parse("aa:bb"), void 0);
    await p;
  });
  test("diagnostics with related information", function(done) {
    const collection = new DiagnosticCollection("ddd", "test", 100, 100, versionProvider, extUri, new class extends DiagnosticsShape {
      $changeMany(owner, entries) {
        const [[, data]] = entries;
        assert.strictEqual(entries.length, 1);
        assert.strictEqual(data.length, 1);
        const [diag2] = data;
        assert.strictEqual(diag2.relatedInformation.length, 2);
        assert.strictEqual(diag2.relatedInformation[0].message, "more1");
        assert.strictEqual(diag2.relatedInformation[1].message, "more2");
        done();
      }
    }(), new Emitter());
    const diag = new Diagnostic(new Range(0, 0, 1, 1), "Foo");
    diag.relatedInformation = [
      new DiagnosticRelatedInformation(new Location(URI.parse("cc:dd"), new Range(0, 0, 0, 0)), "more1"),
      new DiagnosticRelatedInformation(new Location(URI.parse("cc:ee"), new Range(0, 0, 0, 0)), "more2")
    ];
    collection.set(URI.parse("aa:bb"), [diag]);
  });
  test("vscode.languages.getDiagnostics appears to return old diagnostics in some circumstances #54359", function() {
    const ownerHistory = [];
    const diags = new ExtHostDiagnostics(new class {
      getProxy(id) {
        return new class DiagnosticsShape {
          $clear(owner) {
            ownerHistory.push(owner);
          }
        }();
      }
      set() {
        return null;
      }
      dispose() {
      }
      assertRegistered() {
      }
      drain() {
        return void 0;
      }
    }(), new NullLogService(), fileSystemInfoService, new class extends mock() {
      getDocument() {
        return void 0;
      }
    }());
    const collection1 = diags.createDiagnosticCollection(nullExtensionDescription.identifier, "foo");
    const collection2 = diags.createDiagnosticCollection(nullExtensionDescription.identifier, "foo");
    collection1.clear();
    collection2.clear();
    assert.strictEqual(ownerHistory.length, 2);
    assert.strictEqual(ownerHistory[0], "foo");
    assert.strictEqual(ownerHistory[1], "foo0");
  });
  test("Error updating diagnostics from extension #60394", function() {
    let callCount = 0;
    const collection = new DiagnosticCollection("ddd", "test", 100, 100, versionProvider, extUri, new class extends DiagnosticsShape {
      $changeMany(owner, entries) {
        callCount += 1;
      }
    }(), new Emitter());
    const array = [];
    const diag1 = new Diagnostic(new Range(0, 0, 1, 1), "Foo");
    const diag2 = new Diagnostic(new Range(0, 0, 1, 1), "Bar");
    array.push(diag1, diag2);
    collection.set(URI.parse("test:me"), array);
    assert.strictEqual(callCount, 1);
    collection.set(URI.parse("test:me"), array);
    assert.strictEqual(callCount, 2);
    array.push(diag2);
    collection.set(URI.parse("test:me"), array);
    assert.strictEqual(callCount, 3);
  });
  test("getDiagnostics does not tolerate sparse diagnostic arrays", function() {
    const diags = new ExtHostDiagnostics(new class {
      getProxy() {
        return new DiagnosticsShape();
      }
      set() {
        return null;
      }
      dispose() {
      }
      assertRegistered() {
      }
      drain() {
        return void 0;
      }
    }(), new NullLogService(), fileSystemInfoService, new class extends mock() {
      getDocument() {
        return void 0;
      }
    }());
    const collection = diags.createDiagnosticCollection(nullExtensionDescription.identifier, "sparse");
    const uri = URI.parse("sparse:uri");
    const diag = new Diagnostic(new Range(0, 0, 0, 0), "holey");
    const sparseDiagnostics = new Array(3);
    sparseDiagnostics[1] = diag;
    collection.set(uri, sparseDiagnostics);
    const result = diags.getDiagnostics(uri);
    assert.strictEqual(result.length, 1);
    const resultWithPossibleHoles = [...result];
    assert.strictEqual(resultWithPossibleHoles.some((item) => item === void 0), false);
  });
  test("Version id is set whenever possible", function() {
    const all = [];
    const collection = new DiagnosticCollection("ddd", "test", 100, 100, (uri) => {
      return 7;
    }, extUri, new class extends DiagnosticsShape {
      $changeMany(_owner, entries) {
        all.push(...entries);
      }
    }(), new Emitter());
    const array = [];
    const diag1 = new Diagnostic(new Range(0, 0, 1, 1), "Foo");
    const diag2 = new Diagnostic(new Range(0, 0, 1, 1), "Bar");
    array.push(diag1, diag2);
    collection.set(URI.parse("test:one"), array);
    collection.set(URI.parse("test:two"), [diag1]);
    collection.set(URI.parse("test:three"), [diag2]);
    const allVersions = all.map((tuple) => tuple[1].map((t) => t.modelVersionId)).flat();
    assert.deepStrictEqual(allVersions, [7, 7, 7, 7]);
  });
  test("Diagnostics created by tasks aren't accessible to extensions #47292", async function() {
    return runWithFakedTimers({}, async function() {
      const diags = new ExtHostDiagnostics(new class {
        getProxy(id) {
          return {};
        }
        set() {
          return null;
        }
        dispose() {
        }
        assertRegistered() {
        }
        drain() {
          return void 0;
        }
      }(), new NullLogService(), fileSystemInfoService, new class extends mock() {
        getDocument() {
          return void 0;
        }
      }());
      const uri = URI.parse("foo:bar");
      const data = [{
        message: "message",
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
        severity: MarkerSeverity.Info
      }];
      const p1 = Event.toPromise(diags.onDidChangeDiagnostics);
      diags.$acceptMarkersChange([[uri, data]]);
      await p1;
      assert.strictEqual(diags.getDiagnostics(uri).length, 1);
      const p2 = Event.toPromise(diags.onDidChangeDiagnostics);
      diags.$acceptMarkersChange([[uri, []]]);
      await p2;
      assert.strictEqual(diags.getDiagnostics(uri).length, 0);
    });
  });
  test("languages.getDiagnostics doesn't handle case insensitivity correctly #128198", function() {
    const diags = new ExtHostDiagnostics(new class {
      getProxy(id) {
        return new DiagnosticsShape();
      }
      set() {
        return null;
      }
      dispose() {
      }
      assertRegistered() {
      }
      drain() {
        return void 0;
      }
    }(), new NullLogService(), new class extends mock() {
      constructor() {
        super(...arguments);
        this.extUri = new ExtUri((uri) => uri.scheme === "insensitive");
      }
    }(), new class extends mock() {
      getDocument() {
        return void 0;
      }
    }());
    const col = diags.createDiagnosticCollection(nullExtensionDescription.identifier);
    const uriSensitive = URI.from({ scheme: "foo", path: "/SOME/path" });
    const uriSensitiveCaseB = uriSensitive.with({ path: uriSensitive.path.toUpperCase() });
    const uriInSensitive = URI.from({ scheme: "insensitive", path: "/SOME/path" });
    const uriInSensitiveUpper = uriInSensitive.with({ path: uriInSensitive.path.toUpperCase() });
    col.set(uriSensitive, [new Diagnostic(new Range(0, 0, 0, 0), "sensitive")]);
    col.set(uriInSensitive, [new Diagnostic(new Range(0, 0, 0, 0), "insensitive")]);
    assert.strictEqual(col.get(uriSensitive)?.length, 1);
    assert.strictEqual(col.get(uriSensitiveCaseB)?.length, 0);
    assert.strictEqual(col.get(uriInSensitive)?.length, 1);
    assert.strictEqual(col.get(uriInSensitiveUpper)?.length, 1);
    assert.strictEqual(diags.getDiagnostics(uriSensitive)?.length, 1);
    assert.strictEqual(diags.getDiagnostics(uriSensitiveCaseB)?.length, 0);
    assert.strictEqual(diags.getDiagnostics(uriInSensitive)?.length, 1);
    assert.strictEqual(diags.getDiagnostics(uriInSensitiveUpper)?.length, 1);
    const fromForEach = [];
    col.forEach((uri) => fromForEach.push(uri));
    assert.strictEqual(fromForEach.length, 2);
    assert.strictEqual(fromForEach[0].toString(), uriSensitive.toString());
    assert.strictEqual(fromForEach[1].toString(), uriInSensitive.toString());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdERpYWdub3N0aWNzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRGlhZ25vc3RpY0NvbGxlY3Rpb24sIEV4dEhvc3REaWFnbm9zdGljcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RGlhZ25vc3RpY3MuanMnO1xuaW1wb3J0IHsgRGlhZ25vc3RpYywgRGlhZ25vc3RpY1NldmVyaXR5LCBSYW5nZSwgRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbiwgTG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWREaWFnbm9zdGljc1NoYXBlLCBJTWFpbkNvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dFVyaSwgZXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RmlsZVN5c3RlbUluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdFeHRIb3N0RGlhZ25vc3RpY3MnLCAoKSA9PiB7XG5cblx0Y2xhc3MgRGlhZ25vc3RpY3NTaGFwZSBleHRlbmRzIG1vY2s8TWFpblRocmVhZERpYWdub3N0aWNzU2hhcGU+KCkge1xuXHRcdG92ZXJyaWRlICRjaGFuZ2VNYW55KG93bmVyOiBzdHJpbmcsIGVudHJpZXM6IFtVcmlDb21wb25lbnRzLCBJTWFya2VyRGF0YVtdXVtdKTogdm9pZCB7XG5cdFx0XHQvL1xuXHRcdH1cblx0XHRvdmVycmlkZSAkY2xlYXIob3duZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0Ly9cblx0XHR9XG5cdH1cblxuXHRjb25zdCBmaWxlU3lzdGVtSW5mb1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0RmlsZVN5c3RlbUluZm8+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGV4dFVyaSA9IGV4dFVyaTtcblx0fTtcblxuXHRjb25zdCB2ZXJzaW9uUHJvdmlkZXIgPSAodXJpOiBVUkkpOiBudW1iZXIgfCB1bmRlZmluZWQgPT4ge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH07XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkaXNwb3NlQ2hlY2snLCAoKSA9PiB7XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IERpYWdub3N0aWNDb2xsZWN0aW9uKCd0ZXN0JywgJ3Rlc3QnLCAxMDAsIDEwMCwgdmVyc2lvblByb3ZpZGVyLCBleHRVcmksIG5ldyBEaWFnbm9zdGljc1NoYXBlKCksIG5ldyBFbWl0dGVyKCkpO1xuXG5cdFx0Y29sbGVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0Y29sbGVjdGlvbi5kaXNwb3NlKCk7IC8vIHRoYXQncyBPS1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gY29sbGVjdGlvbi5uYW1lKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNvbGxlY3Rpb24uY2xlYXIoKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBjb2xsZWN0aW9uLmRlbGV0ZShVUkkucGFyc2UoJ2FhOmJiJykpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNvbGxlY3Rpb24uZm9yRWFjaCgoKSA9PiB7IH0pKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNvbGxlY3Rpb24uZ2V0KFVSSS5wYXJzZSgnYWE6YmInKSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gY29sbGVjdGlvbi5oYXMoVVJJLnBhcnNlKCdhYTpiYicpKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBjb2xsZWN0aW9uLnNldChVUkkucGFyc2UoJ2FhOmJiJyksIFtdKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBjb2xsZWN0aW9uLnNldChVUkkucGFyc2UoJ2FhOmJiJyksIHVuZGVmaW5lZCEpKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdkaWFnbm9zdGljIGNvbGxlY3Rpb24sIGZvckVhY2gsIGNsZWFyLCBoYXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGNvbGxlY3Rpb24gPSBuZXcgRGlhZ25vc3RpY0NvbGxlY3Rpb24oJ3Rlc3QnLCAndGVzdCcsIDEwMCwgMTAwLCB2ZXJzaW9uUHJvdmlkZXIsIGV4dFVyaSwgbmV3IERpYWdub3N0aWNzU2hhcGUoKSwgbmV3IEVtaXR0ZXIoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxlY3Rpb24ubmFtZSwgJ3Rlc3QnKTtcblx0XHRjb2xsZWN0aW9uLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNvbGxlY3Rpb24ubmFtZSk7XG5cblx0XHRsZXQgYyA9IDA7XG5cdFx0Y29sbGVjdGlvbiA9IG5ldyBEaWFnbm9zdGljQ29sbGVjdGlvbigndGVzdCcsICd0ZXN0JywgMTAwLCAxMDAsIHZlcnNpb25Qcm92aWRlciwgZXh0VXJpLCBuZXcgRGlhZ25vc3RpY3NTaGFwZSgpLCBuZXcgRW1pdHRlcigpKTtcblx0XHRjb2xsZWN0aW9uLmZvckVhY2goKCkgPT4gYysrKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYywgMCk7XG5cblx0XHRjb2xsZWN0aW9uLnNldChVUkkucGFyc2UoJ2ZvbzpiYXInKSwgW1xuXHRcdFx0bmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDEsIDEpLCAnbWVzc2FnZS0xJyksXG5cdFx0XHRuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMSwgMSksICdtZXNzYWdlLTInKVxuXHRcdF0pO1xuXHRcdGNvbGxlY3Rpb24uZm9yRWFjaCgoKSA9PiBjKyspO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjLCAxKTtcblxuXHRcdGMgPSAwO1xuXHRcdGNvbGxlY3Rpb24uY2xlYXIoKTtcblx0XHRjb2xsZWN0aW9uLmZvckVhY2goKCkgPT4gYysrKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYywgMCk7XG5cblx0XHRjb2xsZWN0aW9uLnNldChVUkkucGFyc2UoJ2ZvbzpiYXIxJyksIFtcblx0XHRcdG5ldyBEaWFnbm9zdGljKG5ldyBSYW5nZSgwLCAwLCAxLCAxKSwgJ21lc3NhZ2UtMScpLFxuXHRcdFx0bmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDEsIDEpLCAnbWVzc2FnZS0yJylcblx0XHRdKTtcblx0XHRjb2xsZWN0aW9uLnNldChVUkkucGFyc2UoJ2ZvbzpiYXIyJyksIFtcblx0XHRcdG5ldyBEaWFnbm9zdGljKG5ldyBSYW5nZSgwLCAwLCAxLCAxKSwgJ21lc3NhZ2UtMScpLFxuXHRcdFx0bmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDEsIDEpLCAnbWVzc2FnZS0yJylcblx0XHRdKTtcblx0XHRjb2xsZWN0aW9uLmZvckVhY2goKCkgPT4gYysrKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYywgMik7XG5cblx0XHRhc3NlcnQub2soY29sbGVjdGlvbi5oYXMoVVJJLnBhcnNlKCdmb286YmFyMScpKSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbGxlY3Rpb24uaGFzKFVSSS5wYXJzZSgnZm9vOmJhcjInKSkpO1xuXHRcdGFzc2VydC5vayghY29sbGVjdGlvbi5oYXMoVVJJLnBhcnNlKCdmb286YmFyMycpKSk7XG5cdFx0Y29sbGVjdGlvbi5kZWxldGUoVVJJLnBhcnNlKCdmb286YmFyMScpKTtcblx0XHRhc3NlcnQub2soIWNvbGxlY3Rpb24uaGFzKFVSSS5wYXJzZSgnZm9vOmJhcjEnKSkpO1xuXG5cdFx0Y29sbGVjdGlvbi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpYWdub3N0aWMgY29sbGVjdGlvbiwgaW1tdXRhYmxlIHJlYWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBEaWFnbm9zdGljQ29sbGVjdGlvbigndGVzdCcsICd0ZXN0JywgMTAwLCAxMDAsIHZlcnNpb25Qcm92aWRlciwgZXh0VXJpLCBuZXcgRGlhZ25vc3RpY3NTaGFwZSgpLCBuZXcgRW1pdHRlcigpKTtcblx0XHRjb2xsZWN0aW9uLnNldChVUkkucGFyc2UoJ2ZvbzpiYXInKSwgW1xuXHRcdFx0bmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDEsIDEpLCAnbWVzc2FnZS0xJyksXG5cdFx0XHRuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMSwgMSksICdtZXNzYWdlLTInKVxuXHRcdF0pO1xuXG5cdFx0bGV0IGFycmF5ID0gY29sbGVjdGlvbi5nZXQoVVJJLnBhcnNlKCdmb286YmFyJykpIGFzIERpYWdub3N0aWNbXTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGFycmF5Lmxlbmd0aCA9IDApO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYXJyYXkucG9wKCkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYXJyYXlbMF0gPSBuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMCwgMCksICdldmlsJykpO1xuXG5cdFx0Y29sbGVjdGlvbi5mb3JFYWNoKCh1cmk6IFVSSSwgYXJyYXk6IHJlYWRvbmx5IHZzY29kZS5EaWFnbm9zdGljW10pOiBhbnkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiAoYXJyYXkgYXMgRGlhZ25vc3RpY1tdKS5sZW5ndGggPSAwKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gKGFycmF5IGFzIERpYWdub3N0aWNbXSkucG9wKCkpO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiAoYXJyYXkgYXMgRGlhZ25vc3RpY1tdKVswXSA9IG5ldyBEaWFnbm9zdGljKG5ldyBSYW5nZSgwLCAwLCAwLCAwKSwgJ2V2aWwnKSk7XG5cdFx0fSk7XG5cblx0XHRhcnJheSA9IGNvbGxlY3Rpb24uZ2V0KFVSSS5wYXJzZSgnZm9vOmJhcicpKSBhcyBEaWFnbm9zdGljW107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5Lmxlbmd0aCwgMik7XG5cblx0XHRjb2xsZWN0aW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdkaWFnbm9zdGljcyBjb2xsZWN0aW9uLCBzZXQgd2l0aCBkdXBsaWNsYXRlZCB0dXBsZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBEaWFnbm9zdGljQ29sbGVjdGlvbigndGVzdCcsICd0ZXN0JywgMTAwLCAxMDAsIHZlcnNpb25Qcm92aWRlciwgZXh0VXJpLCBuZXcgRGlhZ25vc3RpY3NTaGFwZSgpLCBuZXcgRW1pdHRlcigpKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3NjOmhpZ2h0b3dlcicpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KFtcblx0XHRcdFt1cmksIFtuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMCwgMSksICdtZXNzYWdlLTEnKV1dLFxuXHRcdFx0W1VSSS5wYXJzZSgnc29tZTp0aGluZycpLCBbbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDEsIDEpLCAnc29tZXRoaW5nJyldXSxcblx0XHRcdFt1cmksIFtuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMCwgMSksICdtZXNzYWdlLTInKV1dLFxuXHRcdF0pO1xuXG5cdFx0bGV0IGFycmF5ID0gY29sbGVjdGlvbi5nZXQodXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXkubGVuZ3RoLCAyKTtcblx0XHRsZXQgW2ZpcnN0LCBzZWNvbmRdID0gYXJyYXk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Lm1lc3NhZ2UsICdtZXNzYWdlLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLm1lc3NhZ2UsICdtZXNzYWdlLTInKTtcblxuXHRcdC8vIGNsZWFyXG5cdFx0Y29sbGVjdGlvbi5kZWxldGUodXJpKTtcblx0XHRhc3NlcnQub2soIWNvbGxlY3Rpb24uaGFzKHVyaSkpO1xuXG5cdFx0Ly8gYmFkIHR1cGxlIGNsZWFycyAxLzJcblx0XHRjb2xsZWN0aW9uLnNldChbXG5cdFx0XHRbdXJpLCBbbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDAsIDEpLCAnbWVzc2FnZS0xJyldXSxcblx0XHRcdFtVUkkucGFyc2UoJ3NvbWU6dGhpbmcnKSwgW25ldyBEaWFnbm9zdGljKG5ldyBSYW5nZSgwLCAwLCAxLCAxKSwgJ3NvbWV0aGluZycpXV0sXG5cdFx0XHRbdXJpLCB1bmRlZmluZWQhXVxuXHRcdF0pO1xuXHRcdGFzc2VydC5vayghY29sbGVjdGlvbi5oYXModXJpKSk7XG5cblx0XHQvLyBjbGVhclxuXHRcdGNvbGxlY3Rpb24uZGVsZXRlKHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKCFjb2xsZWN0aW9uLmhhcyh1cmkpKTtcblxuXHRcdC8vIGJhZCB0dXBsZSBjbGVhcnMgMi8yXG5cdFx0Y29sbGVjdGlvbi5zZXQoW1xuXHRcdFx0W3VyaSwgW25ldyBEaWFnbm9zdGljKG5ldyBSYW5nZSgwLCAwLCAwLCAxKSwgJ21lc3NhZ2UtMScpXV0sXG5cdFx0XHRbVVJJLnBhcnNlKCdzb21lOnRoaW5nJyksIFtuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMSwgMSksICdzb21ldGhpbmcnKV1dLFxuXHRcdFx0W3VyaSwgdW5kZWZpbmVkIV0sXG5cdFx0XHRbdXJpLCBbbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDAsIDEpLCAnbWVzc2FnZS0yJyldXSxcblx0XHRcdFt1cmksIFtuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMCwgMSksICdtZXNzYWdlLTMnKV1dLFxuXHRcdF0pO1xuXG5cdFx0YXJyYXkgPSBjb2xsZWN0aW9uLmdldCh1cmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheS5sZW5ndGgsIDIpO1xuXHRcdFtmaXJzdCwgc2Vjb25kXSA9IGFycmF5O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5tZXNzYWdlLCAnbWVzc2FnZS0yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5tZXNzYWdlLCAnbWVzc2FnZS0zJyk7XG5cblx0XHRjb2xsZWN0aW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGlhZ25vc3RpY3MgY29sbGVjdGlvbiwgc2V0IHR1cGxlIG92ZXJyaWRlcywgIzExNTQ3JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IGxhc3RFbnRyaWVzITogW1VyaUNvbXBvbmVudHMsIElNYXJrZXJEYXRhW11dW107XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBEaWFnbm9zdGljQ29sbGVjdGlvbigndGVzdCcsICd0ZXN0JywgMTAwLCAxMDAsIHZlcnNpb25Qcm92aWRlciwgZXh0VXJpLCBuZXcgY2xhc3MgZXh0ZW5kcyBEaWFnbm9zdGljc1NoYXBlIHtcblx0XHRcdG92ZXJyaWRlICRjaGFuZ2VNYW55KG93bmVyOiBzdHJpbmcsIGVudHJpZXM6IFtVcmlDb21wb25lbnRzLCBJTWFya2VyRGF0YVtdXVtdKTogdm9pZCB7XG5cdFx0XHRcdGxhc3RFbnRyaWVzID0gZW50cmllcztcblx0XHRcdFx0cmV0dXJuIHN1cGVyLiRjaGFuZ2VNYW55KG93bmVyLCBlbnRyaWVzKTtcblx0XHRcdH1cblx0XHR9LCBuZXcgRW1pdHRlcigpKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3NjOmhpZ2h0b3dlcicpO1xuXG5cdFx0Y29sbGVjdGlvbi5zZXQoW1t1cmksIFtuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMSwgMSksICdlcnJvcicpXV1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbi5nZXQodXJpKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsZWN0aW9uLmdldCh1cmkpWzBdLm1lc3NhZ2UsICdlcnJvcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0RW50cmllcy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtbLCBkYXRhMV1dID0gbGFzdEVudHJpZXM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGExLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGExWzBdLm1lc3NhZ2UsICdlcnJvcicpO1xuXHRcdGxhc3RFbnRyaWVzID0gdW5kZWZpbmVkITtcblxuXHRcdGNvbGxlY3Rpb24uc2V0KFtbdXJpLCBbbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDEsIDEpLCAnd2FybmluZycpXV1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbi5nZXQodXJpKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsZWN0aW9uLmdldCh1cmkpWzBdLm1lc3NhZ2UsICd3YXJuaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RFbnRyaWVzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW1ssIGRhdGEyXV0gPSBsYXN0RW50cmllcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YTIubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YTJbMF0ubWVzc2FnZSwgJ3dhcm5pbmcnKTtcblx0XHRsYXN0RW50cmllcyA9IHVuZGVmaW5lZCE7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvIHNlbmQgbWVzc2FnZSB3aGVuIG5vdCBtYWtpbmcgYSBjaGFuZ2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgY2hhbmdlQ291bnQgPSAwO1xuXHRcdGxldCBldmVudENvdW50ID0gMDtcblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxhbnk+KCk7XG5cdFx0c3RvcmUuYWRkKGVtaXR0ZXIuZXZlbnQoXyA9PiBldmVudENvdW50ICs9IDEpKTtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IERpYWdub3N0aWNDb2xsZWN0aW9uKCd0ZXN0JywgJ3Rlc3QnLCAxMDAsIDEwMCwgdmVyc2lvblByb3ZpZGVyLCBleHRVcmksIG5ldyBjbGFzcyBleHRlbmRzIERpYWdub3N0aWNzU2hhcGUge1xuXHRcdFx0b3ZlcnJpZGUgJGNoYW5nZU1hbnkoKSB7XG5cdFx0XHRcdGNoYW5nZUNvdW50ICs9IDE7XG5cdFx0XHR9XG5cdFx0fSwgZW1pdHRlcik7XG5cblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3NjOmhpZ2h0b3dlcicpO1xuXHRcdGNvbnN0IGRpYWcgPSBuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMCwgMSksICdmZmZmJyk7XG5cblx0XHRjb2xsZWN0aW9uLnNldCh1cmksIFtkaWFnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMSk7XG5cblx0XHRjb2xsZWN0aW9uLnNldCh1cmksIFtkaWFnXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMik7XG5cblx0fSk7XG5cblx0dGVzdCgnZGlhZ25vc3RpY3MgY29sbGVjdGlvbiwgdHVwbGVzIGFuZCB1bmRlZmluZWQgKHNtYWxsIGFycmF5KSwgIzE1NTg1JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBEaWFnbm9zdGljQ29sbGVjdGlvbigndGVzdCcsICd0ZXN0JywgMTAwLCAxMDAsIHZlcnNpb25Qcm92aWRlciwgZXh0VXJpLCBuZXcgRGlhZ25vc3RpY3NTaGFwZSgpLCBuZXcgRW1pdHRlcigpKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3NjOmhpZ2h0b3dlcicpO1xuXHRcdGNvbnN0IHVyaTIgPSBVUkkucGFyc2UoJ3NjOm5vbWFkJyk7XG5cdFx0Y29uc3QgZGlhZyA9IG5ldyBEaWFnbm9zdGljKG5ldyBSYW5nZSgwLCAwLCAwLCAxKSwgJ2ZmZmYnKTtcblxuXHRcdGNvbGxlY3Rpb24uc2V0KFtcblx0XHRcdFt1cmksIFtkaWFnLCBkaWFnLCBkaWFnXV0sXG5cdFx0XHRbdXJpLCB1bmRlZmluZWQhXSxcblx0XHRcdFt1cmksIFtkaWFnXV0sXG5cblx0XHRcdFt1cmkyLCBbZGlhZywgZGlhZ11dLFxuXHRcdFx0W3VyaTIsIHVuZGVmaW5lZCFdLFxuXHRcdFx0W3VyaTIsIFtkaWFnXV0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbi5nZXQodXJpKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsZWN0aW9uLmdldCh1cmkyKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWFnbm9zdGljcyBjb2xsZWN0aW9uLCB0dXBsZXMgYW5kIHVuZGVmaW5lZCAobGFyZ2UgYXJyYXkpLCAjMTU1ODUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IERpYWdub3N0aWNDb2xsZWN0aW9uKCd0ZXN0JywgJ3Rlc3QnLCAxMDAsIDEwMCwgdmVyc2lvblByb3ZpZGVyLCBleHRVcmksIG5ldyBEaWFnbm9zdGljc1NoYXBlKCksIG5ldyBFbWl0dGVyKCkpO1xuXHRcdGNvbnN0IHR1cGxlczogW1VSSSwgRGlhZ25vc3RpY1tdXVtdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwMDsgaSsrKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3NjOmhpZ2h0b3dlciMnICsgaSk7XG5cdFx0XHRjb25zdCBkaWFnID0gbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDAsIDEpLCBpLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHR0dXBsZXMucHVzaChbdXJpLCBbZGlhZywgZGlhZywgZGlhZ11dKTtcblx0XHRcdHR1cGxlcy5wdXNoKFt1cmksIHVuZGVmaW5lZCFdKTtcblx0XHRcdHR1cGxlcy5wdXNoKFt1cmksIFtkaWFnXV0pO1xuXHRcdH1cblxuXHRcdGNvbGxlY3Rpb24uc2V0KHR1cGxlcyk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwMDsgaSsrKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3NjOmhpZ2h0b3dlciMnICsgaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbi5oYXModXJpKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbi5nZXQodXJpKS5sZW5ndGgsIDEpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZGlhZ25vc3RpYyBjYXBwaW5nIChtYXggcGVyIGZpbGUpJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IGxhc3RFbnRyaWVzITogW1VyaUNvbXBvbmVudHMsIElNYXJrZXJEYXRhW11dW107XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBEaWFnbm9zdGljQ29sbGVjdGlvbigndGVzdCcsICd0ZXN0JywgMTAwLCAyNTAsIHZlcnNpb25Qcm92aWRlciwgZXh0VXJpLCBuZXcgY2xhc3MgZXh0ZW5kcyBEaWFnbm9zdGljc1NoYXBlIHtcblx0XHRcdG92ZXJyaWRlICRjaGFuZ2VNYW55KG93bmVyOiBzdHJpbmcsIGVudHJpZXM6IFtVcmlDb21wb25lbnRzLCBJTWFya2VyRGF0YVtdXVtdKTogdm9pZCB7XG5cdFx0XHRcdGxhc3RFbnRyaWVzID0gZW50cmllcztcblx0XHRcdFx0cmV0dXJuIHN1cGVyLiRjaGFuZ2VNYW55KG93bmVyLCBlbnRyaWVzKTtcblx0XHRcdH1cblx0XHR9LCBuZXcgRW1pdHRlcigpKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2FhOmJiJyk7XG5cblx0XHRjb25zdCBkaWFnbm9zdGljczogRGlhZ25vc3RpY1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MDA7IGkrKykge1xuXHRcdFx0ZGlhZ25vc3RpY3MucHVzaChuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoaSwgMCwgaSArIDEsIDApLCBgZXJyb3IjJHtpfWAsIGkgPCAzMDBcblx0XHRcdFx0PyBEaWFnbm9zdGljU2V2ZXJpdHkuV2FybmluZ1xuXHRcdFx0XHQ6IERpYWdub3N0aWNTZXZlcml0eS5FcnJvcikpO1xuXHRcdH1cblxuXHRcdGNvbGxlY3Rpb24uc2V0KHVyaSwgZGlhZ25vc3RpY3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsZWN0aW9uLmdldCh1cmkpLmxlbmd0aCwgNTAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEVudHJpZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEVudHJpZXNbMF1bMV0ubGVuZ3RoLCAyNTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0RW50cmllc1swXVsxXVswXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0RW50cmllc1swXVsxXVsyMDBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEVudHJpZXNbMF1bMV1bMjUwXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuSW5mbyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpYWdub3N0aWMgY2FwcGluZyAobWF4IGZpbGVzKScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCBsYXN0RW50cmllcyE6IFtVcmlDb21wb25lbnRzLCBJTWFya2VyRGF0YVtdXVtdO1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgRGlhZ25vc3RpY0NvbGxlY3Rpb24oJ3Rlc3QnLCAndGVzdCcsIDIsIDEsIHZlcnNpb25Qcm92aWRlciwgZXh0VXJpLCBuZXcgY2xhc3MgZXh0ZW5kcyBEaWFnbm9zdGljc1NoYXBlIHtcblx0XHRcdG92ZXJyaWRlICRjaGFuZ2VNYW55KG93bmVyOiBzdHJpbmcsIGVudHJpZXM6IFtVcmlDb21wb25lbnRzLCBJTWFya2VyRGF0YVtdXVtdKTogdm9pZCB7XG5cdFx0XHRcdGxhc3RFbnRyaWVzID0gZW50cmllcztcblx0XHRcdFx0cmV0dXJuIHN1cGVyLiRjaGFuZ2VNYW55KG93bmVyLCBlbnRyaWVzKTtcblx0XHRcdH1cblx0XHR9LCBuZXcgRW1pdHRlcigpKTtcblxuXHRcdGNvbnN0IGRpYWcgPSBuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMSwgMSksICdIZWxsbycpO1xuXG5cblx0XHRjb2xsZWN0aW9uLnNldChbXG5cdFx0XHRbVVJJLnBhcnNlKCdhYTpiYjEnKSwgW2RpYWddXSxcblx0XHRcdFtVUkkucGFyc2UoJ2FhOmJiMicpLCBbZGlhZ11dLFxuXHRcdFx0W1VSSS5wYXJzZSgnYWE6YmIzJyksIFtkaWFnXV0sXG5cdFx0XHRbVVJJLnBhcnNlKCdhYTpiYjQnKSwgW2RpYWddXSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEVudHJpZXMubGVuZ3RoLCAzKTsgLy8gZ29lcyBhYm92ZSB0aGUgbGltaXQgYW5kIHRoZW4gc3RvcHNcblx0fSk7XG5cblx0dGVzdCgnZGlhZ25vc3RpYyBldmVudGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8cmVhZG9ubHkgVVJJW10+KCk7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBEaWFnbm9zdGljQ29sbGVjdGlvbignZGRkJywgJ3Rlc3QnLCAxMDAsIDEwMCwgdmVyc2lvblByb3ZpZGVyLCBleHRVcmksIG5ldyBEaWFnbm9zdGljc1NoYXBlKCksIGVtaXR0ZXIpO1xuXG5cdFx0Y29uc3QgZGlhZzEgPSBuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMSwgMSwgMiwgMyksICdkaWFnMScpO1xuXHRcdGNvbnN0IGRpYWcyID0gbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDEsIDEsIDIsIDMpLCAnZGlhZzInKTtcblx0XHRjb25zdCBkaWFnMyA9IG5ldyBEaWFnbm9zdGljKG5ldyBSYW5nZSgxLCAxLCAyLCAzKSwgJ2RpYWczJyk7XG5cblx0XHRsZXQgcCA9IEV2ZW50LnRvUHJvbWlzZShlbWl0dGVyLmV2ZW50KS50aGVuKGEgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhWzBdLnRvU3RyaW5nKCksICdhYTpiYicpO1xuXHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShhWzBdKSk7XG5cdFx0fSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoVVJJLnBhcnNlKCdhYTpiYicpLCBbXSk7XG5cdFx0YXdhaXQgcDtcblxuXHRcdHAgPSBFdmVudC50b1Byb21pc2UoZW1pdHRlci5ldmVudCkudGhlbihlID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQub2soVVJJLmlzVXJpKGVbMF0pKTtcblx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkoZVsxXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVbMF0udG9TdHJpbmcoKSwgJ2FhOmJiJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZVsxXS50b1N0cmluZygpLCAnYWE6Y2MnKTtcblx0XHR9KTtcblx0XHRjb2xsZWN0aW9uLnNldChbXG5cdFx0XHRbVVJJLnBhcnNlKCdhYTpiYicpLCBbZGlhZzFdXSxcblx0XHRcdFtVUkkucGFyc2UoJ2FhOmNjJyksIFtkaWFnMiwgZGlhZzNdXSxcblx0XHRdKTtcblx0XHRhd2FpdCBwO1xuXG5cdFx0cCA9IEV2ZW50LnRvUHJvbWlzZShlbWl0dGVyLmV2ZW50KS50aGVuKGUgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkoZVswXSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShlWzFdKSk7XG5cdFx0fSk7XG5cdFx0Y29sbGVjdGlvbi5jbGVhcigpO1xuXHRcdGF3YWl0IHA7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZzY29kZS5sYW5ndWFnZXMub25EaWRDaGFuZ2VEaWFnbm9zdGljcyBEb2VzIE5vdCBQcm92aWRlIERvY3VtZW50IFVSSSAjNDk1ODInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IFVSSVtdPigpO1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgRGlhZ25vc3RpY0NvbGxlY3Rpb24oJ2RkZCcsICd0ZXN0JywgMTAwLCAxMDAsIHZlcnNpb25Qcm92aWRlciwgZXh0VXJpLCBuZXcgRGlhZ25vc3RpY3NTaGFwZSgpLCBlbWl0dGVyKTtcblxuXHRcdGNvbnN0IGRpYWcxID0gbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDEsIDEsIDIsIDMpLCAnZGlhZzEnKTtcblxuXHRcdC8vIGRlbGV0ZVxuXHRcdGNvbGxlY3Rpb24uc2V0KFVSSS5wYXJzZSgnYWE6YmInKSwgW2RpYWcxXSk7XG5cdFx0bGV0IHAgPSBFdmVudC50b1Byb21pc2UoZW1pdHRlci5ldmVudCkudGhlbihlID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlWzBdLnRvU3RyaW5nKCksICdhYTpiYicpO1xuXHRcdH0pO1xuXHRcdGNvbGxlY3Rpb24uZGVsZXRlKFVSSS5wYXJzZSgnYWE6YmInKSk7XG5cdFx0YXdhaXQgcDtcblxuXHRcdC8vIHNldC0+dW5kZWZpbmVkIChhcyBkZWxldGUpXG5cdFx0Y29sbGVjdGlvbi5zZXQoVVJJLnBhcnNlKCdhYTpiYicpLCBbZGlhZzFdKTtcblx0XHRwID0gRXZlbnQudG9Qcm9taXNlKGVtaXR0ZXIuZXZlbnQpLnRoZW4oZSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZVswXS50b1N0cmluZygpLCAnYWE6YmInKTtcblx0XHR9KTtcblx0XHRjb2xsZWN0aW9uLnNldChVUkkucGFyc2UoJ2FhOmJiJyksIHVuZGVmaW5lZCEpO1xuXHRcdGF3YWl0IHA7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpYWdub3N0aWNzIHdpdGggcmVsYXRlZCBpbmZvcm1hdGlvbicsIGZ1bmN0aW9uIChkb25lKSB7XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IERpYWdub3N0aWNDb2xsZWN0aW9uKCdkZGQnLCAndGVzdCcsIDEwMCwgMTAwLCB2ZXJzaW9uUHJvdmlkZXIsIGV4dFVyaSwgbmV3IGNsYXNzIGV4dGVuZHMgRGlhZ25vc3RpY3NTaGFwZSB7XG5cdFx0XHRvdmVycmlkZSAkY2hhbmdlTWFueShvd25lcjogc3RyaW5nLCBlbnRyaWVzOiBbVXJpQ29tcG9uZW50cywgSU1hcmtlckRhdGFbXV1bXSkge1xuXG5cdFx0XHRcdGNvbnN0IFtbLCBkYXRhXV0gPSBlbnRyaWVzO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cmllcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5sZW5ndGgsIDEpO1xuXG5cdFx0XHRcdGNvbnN0IFtkaWFnXSA9IGRhdGE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWFnLnJlbGF0ZWRJbmZvcm1hdGlvbiEubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpYWcucmVsYXRlZEluZm9ybWF0aW9uIVswXS5tZXNzYWdlLCAnbW9yZTEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpYWcucmVsYXRlZEluZm9ybWF0aW9uIVsxXS5tZXNzYWdlLCAnbW9yZTInKTtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0fVxuXHRcdH0sIG5ldyBFbWl0dGVyPGFueT4oKSk7XG5cblx0XHRjb25zdCBkaWFnID0gbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDEsIDEpLCAnRm9vJyk7XG5cdFx0ZGlhZy5yZWxhdGVkSW5mb3JtYXRpb24gPSBbXG5cdFx0XHRuZXcgRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbihuZXcgTG9jYXRpb24oVVJJLnBhcnNlKCdjYzpkZCcpLCBuZXcgUmFuZ2UoMCwgMCwgMCwgMCkpLCAnbW9yZTEnKSxcblx0XHRcdG5ldyBEaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uKG5ldyBMb2NhdGlvbihVUkkucGFyc2UoJ2NjOmVlJyksIG5ldyBSYW5nZSgwLCAwLCAwLCAwKSksICdtb3JlMicpXG5cdFx0XTtcblxuXHRcdGNvbGxlY3Rpb24uc2V0KFVSSS5wYXJzZSgnYWE6YmInKSwgW2RpYWddKTtcblx0fSk7XG5cblx0dGVzdCgndnNjb2RlLmxhbmd1YWdlcy5nZXREaWFnbm9zdGljcyBhcHBlYXJzIHRvIHJldHVybiBvbGQgZGlhZ25vc3RpY3MgaW4gc29tZSBjaXJjdW1zdGFuY2VzICM1NDM1OScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBvd25lckhpc3Rvcnk6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgZGlhZ3MgPSBuZXcgRXh0SG9zdERpYWdub3N0aWNzKG5ldyBjbGFzcyBpbXBsZW1lbnRzIElNYWluQ29udGV4dCB7XG5cdFx0XHRnZXRQcm94eShpZDogYW55KTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBEaWFnbm9zdGljc1NoYXBlIHtcblx0XHRcdFx0XHQkY2xlYXIob3duZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHRcdFx0b3duZXJIaXN0b3J5LnB1c2gob3duZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHNldCgpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2UoKSB7IH1cblx0XHRcdGFzc2VydFJlZ2lzdGVyZWQoKTogdm9pZCB7XG5cblx0XHRcdH1cblx0XHRcdGRyYWluKCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkITtcblx0XHRcdH1cblx0XHR9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVN5c3RlbUluZm9TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycz4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXREb2N1bWVudCgpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbGxlY3Rpb24xID0gZGlhZ3MuY3JlYXRlRGlhZ25vc3RpY0NvbGxlY3Rpb24obnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsICdmb28nKTtcblx0XHRjb25zdCBjb2xsZWN0aW9uMiA9IGRpYWdzLmNyZWF0ZURpYWdub3N0aWNDb2xsZWN0aW9uKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLCAnZm9vJyk7IC8vIHdhcm5zLCB1c2VzIGEgZGlmZmVyZW50IG93bmVyXG5cblx0XHRjb2xsZWN0aW9uMS5jbGVhcigpO1xuXHRcdGNvbGxlY3Rpb24yLmNsZWFyKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3duZXJIaXN0b3J5Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG93bmVySGlzdG9yeVswXSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvd25lckhpc3RvcnlbMV0sICdmb28wJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Vycm9yIHVwZGF0aW5nIGRpYWdub3N0aWNzIGZyb20gZXh0ZW5zaW9uICM2MDM5NCcsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IERpYWdub3N0aWNDb2xsZWN0aW9uKCdkZGQnLCAndGVzdCcsIDEwMCwgMTAwLCB2ZXJzaW9uUHJvdmlkZXIsIGV4dFVyaSwgbmV3IGNsYXNzIGV4dGVuZHMgRGlhZ25vc3RpY3NTaGFwZSB7XG5cdFx0XHRvdmVycmlkZSAkY2hhbmdlTWFueShvd25lcjogc3RyaW5nLCBlbnRyaWVzOiBbVXJpQ29tcG9uZW50cywgSU1hcmtlckRhdGFbXV1bXSkge1xuXHRcdFx0XHRjYWxsQ291bnQgKz0gMTtcblx0XHRcdH1cblx0XHR9LCBuZXcgRW1pdHRlcjxhbnk+KCkpO1xuXG5cdFx0Y29uc3QgYXJyYXk6IERpYWdub3N0aWNbXSA9IFtdO1xuXHRcdGNvbnN0IGRpYWcxID0gbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDEsIDEpLCAnRm9vJyk7XG5cdFx0Y29uc3QgZGlhZzIgPSBuZXcgRGlhZ25vc3RpYyhuZXcgUmFuZ2UoMCwgMCwgMSwgMSksICdCYXInKTtcblxuXHRcdGFycmF5LnB1c2goZGlhZzEsIGRpYWcyKTtcblxuXHRcdGNvbGxlY3Rpb24uc2V0KFVSSS5wYXJzZSgndGVzdDptZScpLCBhcnJheSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMSk7XG5cblx0XHRjb2xsZWN0aW9uLnNldChVUkkucGFyc2UoJ3Rlc3Q6bWUnKSwgYXJyYXkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnQsIDIpOyAvLyBlcXVhbCBhcnJheVxuXG5cdFx0YXJyYXkucHVzaChkaWFnMik7XG5cdFx0Y29sbGVjdGlvbi5zZXQoVVJJLnBhcnNlKCd0ZXN0Om1lJyksIGFycmF5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAzKTsgLy8gc2FtZSBidXQgdW4tZXF1YWwgYXJyYXlcblx0fSk7XG5cblx0dGVzdCgnZ2V0RGlhZ25vc3RpY3MgZG9lcyBub3QgdG9sZXJhdGUgc3BhcnNlIGRpYWdub3N0aWMgYXJyYXlzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGRpYWdzID0gbmV3IEV4dEhvc3REaWFnbm9zdGljcyhuZXcgY2xhc3MgaW1wbGVtZW50cyBJTWFpbkNvbnRleHQge1xuXHRcdFx0Z2V0UHJveHkoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBEaWFnbm9zdGljc1NoYXBlKCk7XG5cdFx0XHR9XG5cdFx0XHRzZXQoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRkaXNwb3NlKCk6IHZvaWQgeyB9XG5cdFx0XHRhc3NlcnRSZWdpc3RlcmVkKCk6IHZvaWQgeyB9XG5cdFx0XHRkcmFpbigpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZCE7XG5cdFx0XHR9XG5cdFx0fSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTeXN0ZW1JbmZvU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnM+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0RG9jdW1lbnQoKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uID0gZGlhZ3MuY3JlYXRlRGlhZ25vc3RpY0NvbGxlY3Rpb24obnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsICdzcGFyc2UnKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3NwYXJzZTp1cmknKTtcblx0XHRjb25zdCBkaWFnID0gbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDAsIDApLCAnaG9sZXknKTtcblx0XHRjb25zdCBzcGFyc2VEaWFnbm9zdGljczogRGlhZ25vc3RpY1tdID0gbmV3IEFycmF5KDMpO1xuXHRcdHNwYXJzZURpYWdub3N0aWNzWzFdID0gZGlhZztcblxuXHRcdGNvbGxlY3Rpb24uc2V0KHVyaSwgc3BhcnNlRGlhZ25vc3RpY3MpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZGlhZ3MuZ2V0RGlhZ25vc3RpY3ModXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgcmVzdWx0V2l0aFBvc3NpYmxlSG9sZXMgPSBbLi4ucmVzdWx0XSBhcyAodnNjb2RlLkRpYWdub3N0aWMgfCB1bmRlZmluZWQpW107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFdpdGhQb3NzaWJsZUhvbGVzLnNvbWUoaXRlbSA9PiBpdGVtID09PSB1bmRlZmluZWQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ZlcnNpb24gaWQgaXMgc2V0IHdoZW5ldmVyIHBvc3NpYmxlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgYWxsOiBbVXJpQ29tcG9uZW50cywgSU1hcmtlckRhdGFbXV1bXSA9IFtdO1xuXG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBEaWFnbm9zdGljQ29sbGVjdGlvbignZGRkJywgJ3Rlc3QnLCAxMDAsIDEwMCwgdXJpID0+IHtcblx0XHRcdHJldHVybiA3O1xuXHRcdH0sIGV4dFVyaSwgbmV3IGNsYXNzIGV4dGVuZHMgRGlhZ25vc3RpY3NTaGFwZSB7XG5cdFx0XHRvdmVycmlkZSAkY2hhbmdlTWFueShfb3duZXI6IHN0cmluZywgZW50cmllczogW1VyaUNvbXBvbmVudHMsIElNYXJrZXJEYXRhW11dW10pIHtcblx0XHRcdFx0YWxsLnB1c2goLi4uZW50cmllcyk7XG5cdFx0XHR9XG5cdFx0fSwgbmV3IEVtaXR0ZXI8YW55PigpKTtcblxuXHRcdGNvbnN0IGFycmF5OiBEaWFnbm9zdGljW10gPSBbXTtcblx0XHRjb25zdCBkaWFnMSA9IG5ldyBEaWFnbm9zdGljKG5ldyBSYW5nZSgwLCAwLCAxLCAxKSwgJ0ZvbycpO1xuXHRcdGNvbnN0IGRpYWcyID0gbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDEsIDEpLCAnQmFyJyk7XG5cblx0XHRhcnJheS5wdXNoKGRpYWcxLCBkaWFnMik7XG5cblx0XHRjb2xsZWN0aW9uLnNldChVUkkucGFyc2UoJ3Rlc3Q6b25lJyksIGFycmF5KTtcblx0XHRjb2xsZWN0aW9uLnNldChVUkkucGFyc2UoJ3Rlc3Q6dHdvJyksIFtkaWFnMV0pO1xuXHRcdGNvbGxlY3Rpb24uc2V0KFVSSS5wYXJzZSgndGVzdDp0aHJlZScpLCBbZGlhZzJdKTtcblxuXHRcdGNvbnN0IGFsbFZlcnNpb25zID0gYWxsLm1hcCh0dXBsZSA9PiB0dXBsZVsxXS5tYXAodCA9PiB0Lm1vZGVsVmVyc2lvbklkKSkuZmxhdCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWxsVmVyc2lvbnMsIFs3LCA3LCA3LCA3XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RpYWdub3N0aWNzIGNyZWF0ZWQgYnkgdGFza3MgYXJlblxcJ3QgYWNjZXNzaWJsZSB0byBleHRlbnNpb25zICM0NzI5MicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdGNvbnN0IGRpYWdzID0gbmV3IEV4dEhvc3REaWFnbm9zdGljcyhuZXcgY2xhc3MgaW1wbGVtZW50cyBJTWFpbkNvbnRleHQge1xuXHRcdFx0XHRnZXRQcm94eShpZDogYW55KTogYW55IHtcblx0XHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHRcdH1cblx0XHRcdFx0c2V0KCk6IGFueSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzcG9zZSgpIHsgfVxuXHRcdFx0XHRhc3NlcnRSZWdpc3RlcmVkKCk6IHZvaWQge1xuXG5cdFx0XHRcdH1cblx0XHRcdFx0ZHJhaW4oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZCE7XG5cdFx0XHRcdH1cblx0XHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU3lzdGVtSW5mb1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0RG9jdW1lbnQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblxuXHRcdFx0Ly9cblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZm9vOmJhcicpO1xuXHRcdFx0Y29uc3QgZGF0YTogSU1hcmtlckRhdGFbXSA9IFt7XG5cdFx0XHRcdG1lc3NhZ2U6ICdtZXNzYWdlJyxcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxLFxuXHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSW5mb1xuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IHAxID0gRXZlbnQudG9Qcm9taXNlKGRpYWdzLm9uRGlkQ2hhbmdlRGlhZ25vc3RpY3MpO1xuXHRcdFx0ZGlhZ3MuJGFjY2VwdE1hcmtlcnNDaGFuZ2UoW1t1cmksIGRhdGFdXSk7XG5cdFx0XHRhd2FpdCBwMTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWFncy5nZXREaWFnbm9zdGljcyh1cmkpLmxlbmd0aCwgMSk7XG5cblx0XHRcdGNvbnN0IHAyID0gRXZlbnQudG9Qcm9taXNlKGRpYWdzLm9uRGlkQ2hhbmdlRGlhZ25vc3RpY3MpO1xuXHRcdFx0ZGlhZ3MuJGFjY2VwdE1hcmtlcnNDaGFuZ2UoW1t1cmksIFtdXV0pO1xuXHRcdFx0YXdhaXQgcDI7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlhZ3MuZ2V0RGlhZ25vc3RpY3ModXJpKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsYW5ndWFnZXMuZ2V0RGlhZ25vc3RpY3MgZG9lc25cXCd0IGhhbmRsZSBjYXNlIGluc2Vuc2l0aXZpdHkgY29ycmVjdGx5ICMxMjgxOTgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBkaWFncyA9IG5ldyBFeHRIb3N0RGlhZ25vc3RpY3MobmV3IGNsYXNzIGltcGxlbWVudHMgSU1haW5Db250ZXh0IHtcblx0XHRcdGdldFByb3h5KGlkOiBhbnkpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IERpYWdub3N0aWNzU2hhcGUoKTtcblx0XHRcdH1cblx0XHRcdHNldCgpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2UoKSB7IH1cblx0XHRcdGFzc2VydFJlZ2lzdGVyZWQoKTogdm9pZCB7XG5cblx0XHRcdH1cblx0XHRcdGRyYWluKCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkITtcblx0XHRcdH1cblx0XHR9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvPigpIHtcblxuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZXh0VXJpID0gbmV3IEV4dFVyaSh1cmkgPT4gdXJpLnNjaGVtZSA9PT0gJ2luc2Vuc2l0aXZlJyk7XG5cdFx0fSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnM+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0RG9jdW1lbnQoKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb2wgPSBkaWFncy5jcmVhdGVEaWFnbm9zdGljQ29sbGVjdGlvbihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcik7XG5cblx0XHRjb25zdCB1cmlTZW5zaXRpdmUgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2ZvbycsIHBhdGg6ICcvU09NRS9wYXRoJyB9KTtcblx0XHRjb25zdCB1cmlTZW5zaXRpdmVDYXNlQiA9IHVyaVNlbnNpdGl2ZS53aXRoKHsgcGF0aDogdXJpU2Vuc2l0aXZlLnBhdGgudG9VcHBlckNhc2UoKSB9KTtcblxuXHRcdGNvbnN0IHVyaUluU2Vuc2l0aXZlID0gVVJJLmZyb20oeyBzY2hlbWU6ICdpbnNlbnNpdGl2ZScsIHBhdGg6ICcvU09NRS9wYXRoJyB9KTtcblx0XHRjb25zdCB1cmlJblNlbnNpdGl2ZVVwcGVyID0gdXJpSW5TZW5zaXRpdmUud2l0aCh7IHBhdGg6IHVyaUluU2Vuc2l0aXZlLnBhdGgudG9VcHBlckNhc2UoKSB9KTtcblxuXHRcdGNvbC5zZXQodXJpU2Vuc2l0aXZlLCBbbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDAsIDApLCAnc2Vuc2l0aXZlJyldKTtcblx0XHRjb2wuc2V0KHVyaUluU2Vuc2l0aXZlLCBbbmV3IERpYWdub3N0aWMobmV3IFJhbmdlKDAsIDAsIDAsIDApLCAnaW5zZW5zaXRpdmUnKV0pO1xuXG5cdFx0Ly8gY29sbGVjdGlvbiBpdHNlbGYgaG9ub3VycyBjYXNpbmdcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sLmdldCh1cmlTZW5zaXRpdmUpPy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2wuZ2V0KHVyaVNlbnNpdGl2ZUNhc2VCKT8ubGVuZ3RoLCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2wuZ2V0KHVyaUluU2Vuc2l0aXZlKT8ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sLmdldCh1cmlJblNlbnNpdGl2ZVVwcGVyKT8ubGVuZ3RoLCAxKTtcblxuXHRcdC8vIGxhbmd1YWdlcy5nZXREaWFnbm9zdGljcyBob25vdXJzIGNhc2luZ1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWFncy5nZXREaWFnbm9zdGljcyh1cmlTZW5zaXRpdmUpPy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWFncy5nZXREaWFnbm9zdGljcyh1cmlTZW5zaXRpdmVDYXNlQik/Lmxlbmd0aCwgMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlhZ3MuZ2V0RGlhZ25vc3RpY3ModXJpSW5TZW5zaXRpdmUpPy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWFncy5nZXREaWFnbm9zdGljcyh1cmlJblNlbnNpdGl2ZVVwcGVyKT8ubGVuZ3RoLCAxKTtcblxuXG5cdFx0Y29uc3QgZnJvbUZvckVhY2g6IFVSSVtdID0gW107XG5cdFx0Y29sLmZvckVhY2godXJpID0+IGZyb21Gb3JFYWNoLnB1c2godXJpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZyb21Gb3JFYWNoLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZyb21Gb3JFYWNoWzBdLnRvU3RyaW5nKCksIHVyaVNlbnNpdGl2ZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZnJvbUZvckVhY2hbMV0udG9TdHJpbmcoKSwgdXJpSW5TZW5zaXRpdmUudG9TdHJpbmcoKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLHNCQUFzQiwwQkFBMEI7QUFDekQsU0FBUyxZQUFZLG9CQUFvQixPQUFPLDhCQUE4QixnQkFBZ0I7QUFFOUYsU0FBc0Isc0JBQXNCO0FBQzVDLFNBQVMsWUFBWTtBQUNyQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLFFBQVEsY0FBYztBQUUvQixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLHNCQUFzQixNQUFNO0FBQUEsRUFFakMsTUFBTSx5QkFBeUIsS0FBaUMsRUFBRTtBQUFBLElBQ3hELFlBQVksT0FBZSxTQUFpRDtBQUFBLElBRXJGO0FBQUEsSUFDUyxPQUFPLE9BQXFCO0FBQUEsSUFFckM7QUFBQSxFQUNEO0FBRUEsUUFBTSx3QkFBd0IsSUFBSSxjQUFjLEtBQTZCLEVBQUU7QUFBQSxJQUE3QztBQUFBO0FBQ2pDLFdBQWtCLFNBQVM7QUFBQTtBQUFBLEVBQzVCO0FBRUEsUUFBTSxrQkFBa0IsQ0FBQyxRQUFpQztBQUN6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
