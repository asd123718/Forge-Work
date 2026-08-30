import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { Range } from "../../../../common/core/range.js";
import { SymbolKind } from "../../../../common/languages.js";
import { LanguageFeatureDebounceService } from "../../../../common/services/languageFeatureDebounce.js";
import { LanguageFeaturesService } from "../../../../common/services/languageFeaturesService.js";
import { IModelService } from "../../../../common/services/model.js";
import { createModelServices, createTextModel } from "../../../../test/common/testTextModel.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { MarkerSeverity } from "../../../../../platform/markers/common/markers.js";
import { OutlineElement, OutlineGroup, OutlineModel, OutlineModelService } from "../../browser/outlineModel.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("OutlineModel", function() {
  const disposables = new DisposableStore();
  const languageFeaturesService = new LanguageFeaturesService();
  teardown(function() {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("OutlineModel#create, cached", async function() {
    const insta = createModelServices(disposables);
    const modelService = insta.get(IModelService);
    const envService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.isBuilt = true;
        this.isExtensionDevelopment = false;
      }
    }();
    const service = new OutlineModelService(languageFeaturesService, new LanguageFeatureDebounceService(new NullLogService(), envService), modelService);
    const model = createTextModel("foo", void 0, void 0, URI.file("/fome/path.foo"));
    let count = 0;
    const reg = languageFeaturesService.documentSymbolProvider.register({ pattern: "**/path.foo" }, {
      provideDocumentSymbols() {
        count += 1;
        return [];
      }
    });
    await service.getOrCreate(model, CancellationToken.None);
    assert.strictEqual(count, 1);
    await service.getOrCreate(model, CancellationToken.None);
    assert.strictEqual(count, 1);
    model.applyEdits([{ text: "XXX", range: new Range(1, 1, 1, 1) }]);
    await service.getOrCreate(model, CancellationToken.None);
    assert.strictEqual(count, 2);
    reg.dispose();
    model.dispose();
    service.dispose();
  });
  test("OutlineModel#create, cached/cancel", async function() {
    const insta = createModelServices(disposables);
    const modelService = insta.get(IModelService);
    const envService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.isBuilt = true;
        this.isExtensionDevelopment = false;
      }
    }();
    const service = new OutlineModelService(languageFeaturesService, new LanguageFeatureDebounceService(new NullLogService(), envService), modelService);
    const model = createTextModel("foo", void 0, void 0, URI.file("/fome/path.foo"));
    let isCancelled = false;
    const reg = languageFeaturesService.documentSymbolProvider.register({ pattern: "**/path.foo" }, {
      provideDocumentSymbols(d, token) {
        return new Promise((resolve) => {
          const l = token.onCancellationRequested((_) => {
            isCancelled = true;
            resolve(null);
            l.dispose();
          });
        });
      }
    });
    assert.strictEqual(isCancelled, false);
    const s1 = new CancellationTokenSource();
    service.getOrCreate(model, s1.token);
    const s2 = new CancellationTokenSource();
    service.getOrCreate(model, s2.token);
    s1.cancel();
    assert.strictEqual(isCancelled, false);
    s2.cancel();
    assert.strictEqual(isCancelled, true);
    reg.dispose();
    model.dispose();
    service.dispose();
  });
  function fakeSymbolInformation(range, name = "foo") {
    return {
      name,
      detail: "fake",
      kind: SymbolKind.Boolean,
      tags: [],
      selectionRange: range,
      range
    };
  }
  function fakeMarker(range) {
    return { ...range, owner: "ffff", message: "test", severity: MarkerSeverity.Error, resource: null };
  }
  test("OutlineElement - updateMarker", function() {
    const e0 = new OutlineElement("foo1", null, fakeSymbolInformation(new Range(1, 1, 1, 10)));
    const e1 = new OutlineElement("foo2", null, fakeSymbolInformation(new Range(2, 1, 5, 1)));
    const e2 = new OutlineElement("foo3", null, fakeSymbolInformation(new Range(6, 1, 10, 10)));
    const group = new OutlineGroup("group", null, null, 1);
    group.children.set(e0.id, e0);
    group.children.set(e1.id, e1);
    group.children.set(e2.id, e2);
    const data = [fakeMarker(new Range(6, 1, 6, 7)), fakeMarker(new Range(1, 1, 1, 4)), fakeMarker(new Range(10, 2, 14, 1))];
    data.sort(Range.compareRangesUsingStarts);
    group.updateMarker(data);
    assert.strictEqual(data.length, 0);
    assert.strictEqual(e0.marker.count, 1);
    assert.strictEqual(e1.marker, void 0);
    assert.strictEqual(e2.marker.count, 2);
    group.updateMarker([]);
    assert.strictEqual(e0.marker, void 0);
    assert.strictEqual(e1.marker, void 0);
    assert.strictEqual(e2.marker, void 0);
  });
  test("OutlineElement - updateMarker, 2", function() {
    const p = new OutlineElement("A", null, fakeSymbolInformation(new Range(1, 1, 11, 1)));
    const c1 = new OutlineElement("A/B", null, fakeSymbolInformation(new Range(2, 4, 5, 4)));
    const c2 = new OutlineElement("A/C", null, fakeSymbolInformation(new Range(6, 4, 9, 4)));
    const group = new OutlineGroup("group", null, null, 1);
    group.children.set(p.id, p);
    p.children.set(c1.id, c1);
    p.children.set(c2.id, c2);
    let data = [
      fakeMarker(new Range(2, 4, 5, 4))
    ];
    group.updateMarker(data);
    assert.strictEqual(p.marker.count, 0);
    assert.strictEqual(c1.marker.count, 1);
    assert.strictEqual(c2.marker, void 0);
    data = [
      fakeMarker(new Range(2, 4, 5, 4)),
      fakeMarker(new Range(2, 6, 2, 8)),
      fakeMarker(new Range(7, 6, 7, 8))
    ];
    group.updateMarker(data);
    assert.strictEqual(p.marker.count, 0);
    assert.strictEqual(c1.marker.count, 2);
    assert.strictEqual(c2.marker.count, 1);
    data = [
      fakeMarker(new Range(1, 4, 1, 11)),
      fakeMarker(new Range(7, 6, 7, 8))
    ];
    group.updateMarker(data);
    assert.strictEqual(p.marker.count, 1);
    assert.strictEqual(c1.marker, void 0);
    assert.strictEqual(c2.marker.count, 1);
  });
  test("OutlineElement - updateMarker/multiple groups", function() {
    const model = new class extends OutlineModel {
      constructor() {
        super(null);
      }
      readyForTesting() {
        this._groups = this.children;
      }
    }();
    model.children.set("g1", new OutlineGroup("g1", model, null, 1));
    model.children.get("g1").children.set("c1", new OutlineElement("c1", model.children.get("g1"), fakeSymbolInformation(new Range(1, 1, 11, 1))));
    model.children.set("g2", new OutlineGroup("g2", model, null, 1));
    model.children.get("g2").children.set("c2", new OutlineElement("c2", model.children.get("g2"), fakeSymbolInformation(new Range(1, 1, 7, 1))));
    model.children.get("g2").children.get("c2").children.set("c2.1", new OutlineElement("c2.1", model.children.get("g2").children.get("c2"), fakeSymbolInformation(new Range(1, 3, 2, 19))));
    model.children.get("g2").children.get("c2").children.set("c2.2", new OutlineElement("c2.2", model.children.get("g2").children.get("c2"), fakeSymbolInformation(new Range(4, 1, 6, 10))));
    model.readyForTesting();
    const data = [
      fakeMarker(new Range(1, 1, 2, 8)),
      fakeMarker(new Range(6, 1, 6, 98))
    ];
    model.updateMarker(data);
    assert.strictEqual(model.children.get("g1").children.get("c1").marker.count, 2);
    assert.strictEqual(model.children.get("g2").children.get("c2").children.get("c2.1").marker.count, 1);
    assert.strictEqual(model.children.get("g2").children.get("c2").children.get("c2.2").marker.count, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGRvY3VtZW50U3ltYm9sc1xcdGVzdFxcYnJvd3Nlclxcb3V0bGluZU1vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IERvY3VtZW50U3ltYm9sLCBTeW1ib2xLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNb2RlbFNlcnZpY2VzLCBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1hcmtlciwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IE91dGxpbmVFbGVtZW50LCBPdXRsaW5lR3JvdXAsIE91dGxpbmVNb2RlbCwgT3V0bGluZU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvb3V0bGluZU1vZGVsLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ091dGxpbmVNb2RlbCcsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UoKTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnT3V0bGluZU1vZGVsI2NyZWF0ZSwgY2FjaGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgaW5zdGEgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBtb2RlbFNlcnZpY2UgPSBpbnN0YS5nZXQoSU1vZGVsU2VydmljZSk7XG5cdFx0Y29uc3QgZW52U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVudmlyb25tZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBpc0J1aWx0OiBib29sZWFuID0gdHJ1ZTtcblx0XHRcdG92ZXJyaWRlIGlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHR9O1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgT3V0bGluZU1vZGVsU2VydmljZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbmV3IExhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZW52U2VydmljZSksIG1vZGVsU2VydmljZSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnZm9vJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIFVSSS5maWxlKCcvZm9tZS9wYXRoLmZvbycpKTtcblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGNvbnN0IHJlZyA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIucmVnaXN0ZXIoeyBwYXR0ZXJuOiAnKiovcGF0aC5mb28nIH0sIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudFN5bWJvbHMoKSB7XG5cdFx0XHRcdGNvdW50ICs9IDE7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZ2V0T3JDcmVhdGUobW9kZWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cblx0XHQvLyBjYWNoZWRcblx0XHRhd2FpdCBzZXJ2aWNlLmdldE9yQ3JlYXRlKG1vZGVsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDEpO1xuXG5cdFx0Ly8gbmV3IHZlcnNpb25cblx0XHRtb2RlbC5hcHBseUVkaXRzKFt7IHRleHQ6ICdYWFgnLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpIH1dKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmdldE9yQ3JlYXRlKG1vZGVsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDIpO1xuXG5cdFx0cmVnLmRpc3Bvc2UoKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ091dGxpbmVNb2RlbCNjcmVhdGUsIGNhY2hlZC9jYW5jZWwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBpbnN0YSA9IGNyZWF0ZU1vZGVsU2VydmljZXMoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGluc3RhLmdldChJTW9kZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBlbnZTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRW52aXJvbm1lbnRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGlzQnVpbHQ6IGJvb2xlYW4gPSB0cnVlO1xuXHRcdFx0b3ZlcnJpZGUgaXNFeHRlbnNpb25EZXZlbG9wbWVudDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdH07XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBPdXRsaW5lTW9kZWxTZXJ2aWNlKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBuZXcgTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBlbnZTZXJ2aWNlKSwgbW9kZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnZm9vJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIFVSSS5maWxlKCcvZm9tZS9wYXRoLmZvbycpKTtcblx0XHRsZXQgaXNDYW5jZWxsZWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IHJlZyA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIucmVnaXN0ZXIoeyBwYXR0ZXJuOiAnKiovcGF0aC5mb28nIH0sIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudFN5bWJvbHMoZCwgdG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGwgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChfID0+IHtcblx0XHRcdFx0XHRcdGlzQ2FuY2VsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHJlc29sdmUobnVsbCk7XG5cdFx0XHRcdFx0XHRsLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDYW5jZWxsZWQsIGZhbHNlKTtcblx0XHRjb25zdCBzMSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHNlcnZpY2UuZ2V0T3JDcmVhdGUobW9kZWwsIHMxLnRva2VuKTtcblx0XHRjb25zdCBzMiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHNlcnZpY2UuZ2V0T3JDcmVhdGUobW9kZWwsIHMyLnRva2VuKTtcblxuXHRcdHMxLmNhbmNlbCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NhbmNlbGxlZCwgZmFsc2UpO1xuXG5cdFx0czIuY2FuY2VsKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ2FuY2VsbGVkLCB0cnVlKTtcblxuXHRcdHJlZy5kaXNwb3NlKCk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGZha2VTeW1ib2xJbmZvcm1hdGlvbihyYW5nZTogUmFuZ2UsIG5hbWU6IHN0cmluZyA9ICdmb28nKTogRG9jdW1lbnRTeW1ib2wge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lLFxuXHRcdFx0ZGV0YWlsOiAnZmFrZScsXG5cdFx0XHRraW5kOiBTeW1ib2xLaW5kLkJvb2xlYW4sXG5cdFx0XHR0YWdzOiBbXSxcblx0XHRcdHNlbGVjdGlvblJhbmdlOiByYW5nZSxcblx0XHRcdHJhbmdlOiByYW5nZVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBmYWtlTWFya2VyKHJhbmdlOiBSYW5nZSk6IElNYXJrZXIge1xuXHRcdHJldHVybiB7IC4uLnJhbmdlLCBvd25lcjogJ2ZmZmYnLCBtZXNzYWdlOiAndGVzdCcsIHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgcmVzb3VyY2U6IG51bGwhIH07XG5cdH1cblxuXHR0ZXN0KCdPdXRsaW5lRWxlbWVudCAtIHVwZGF0ZU1hcmtlcicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGUwID0gbmV3IE91dGxpbmVFbGVtZW50KCdmb28xJywgbnVsbCEsIGZha2VTeW1ib2xJbmZvcm1hdGlvbihuZXcgUmFuZ2UoMSwgMSwgMSwgMTApKSk7XG5cdFx0Y29uc3QgZTEgPSBuZXcgT3V0bGluZUVsZW1lbnQoJ2ZvbzInLCBudWxsISwgZmFrZVN5bWJvbEluZm9ybWF0aW9uKG5ldyBSYW5nZSgyLCAxLCA1LCAxKSkpO1xuXHRcdGNvbnN0IGUyID0gbmV3IE91dGxpbmVFbGVtZW50KCdmb28zJywgbnVsbCEsIGZha2VTeW1ib2xJbmZvcm1hdGlvbihuZXcgUmFuZ2UoNiwgMSwgMTAsIDEwKSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBuZXcgT3V0bGluZUdyb3VwKCdncm91cCcsIG51bGwhLCBudWxsISwgMSk7XG5cdFx0Z3JvdXAuY2hpbGRyZW4uc2V0KGUwLmlkLCBlMCk7XG5cdFx0Z3JvdXAuY2hpbGRyZW4uc2V0KGUxLmlkLCBlMSk7XG5cdFx0Z3JvdXAuY2hpbGRyZW4uc2V0KGUyLmlkLCBlMik7XG5cblx0XHRjb25zdCBkYXRhID0gW2Zha2VNYXJrZXIobmV3IFJhbmdlKDYsIDEsIDYsIDcpKSwgZmFrZU1hcmtlcihuZXcgUmFuZ2UoMSwgMSwgMSwgNCkpLCBmYWtlTWFya2VyKG5ldyBSYW5nZSgxMCwgMiwgMTQsIDEpKV07XG5cdFx0ZGF0YS5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7IC8vIG1vZGVsIGRvZXMgdGhpc1xuXG5cdFx0Z3JvdXAudXBkYXRlTWFya2VyKGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLmxlbmd0aCwgMCk7IC8vIGFsbCAnc3RvbGVuJ1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlMC5tYXJrZXIhLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZTEubWFya2VyLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlMi5tYXJrZXIhLmNvdW50LCAyKTtcblxuXHRcdGdyb3VwLnVwZGF0ZU1hcmtlcihbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUwLm1hcmtlciwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZTEubWFya2VyLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlMi5tYXJrZXIsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ091dGxpbmVFbGVtZW50IC0gdXBkYXRlTWFya2VyLCAyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcCA9IG5ldyBPdXRsaW5lRWxlbWVudCgnQScsIG51bGwhLCBmYWtlU3ltYm9sSW5mb3JtYXRpb24obmV3IFJhbmdlKDEsIDEsIDExLCAxKSkpO1xuXHRcdGNvbnN0IGMxID0gbmV3IE91dGxpbmVFbGVtZW50KCdBL0InLCBudWxsISwgZmFrZVN5bWJvbEluZm9ybWF0aW9uKG5ldyBSYW5nZSgyLCA0LCA1LCA0KSkpO1xuXHRcdGNvbnN0IGMyID0gbmV3IE91dGxpbmVFbGVtZW50KCdBL0MnLCBudWxsISwgZmFrZVN5bWJvbEluZm9ybWF0aW9uKG5ldyBSYW5nZSg2LCA0LCA5LCA0KSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBuZXcgT3V0bGluZUdyb3VwKCdncm91cCcsIG51bGwhLCBudWxsISwgMSk7XG5cdFx0Z3JvdXAuY2hpbGRyZW4uc2V0KHAuaWQsIHApO1xuXHRcdHAuY2hpbGRyZW4uc2V0KGMxLmlkLCBjMSk7XG5cdFx0cC5jaGlsZHJlbi5zZXQoYzIuaWQsIGMyKTtcblxuXHRcdGxldCBkYXRhID0gW1xuXHRcdFx0ZmFrZU1hcmtlcihuZXcgUmFuZ2UoMiwgNCwgNSwgNCkpXG5cdFx0XTtcblxuXHRcdGdyb3VwLnVwZGF0ZU1hcmtlcihkYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocC5tYXJrZXIhLmNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYzEubWFya2VyIS5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGMyLm1hcmtlciwgdW5kZWZpbmVkKTtcblxuXHRcdGRhdGEgPSBbXG5cdFx0XHRmYWtlTWFya2VyKG5ldyBSYW5nZSgyLCA0LCA1LCA0KSksXG5cdFx0XHRmYWtlTWFya2VyKG5ldyBSYW5nZSgyLCA2LCAyLCA4KSksXG5cdFx0XHRmYWtlTWFya2VyKG5ldyBSYW5nZSg3LCA2LCA3LCA4KSksXG5cdFx0XTtcblx0XHRncm91cC51cGRhdGVNYXJrZXIoZGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHAubWFya2VyIS5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGMxLm1hcmtlciEuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjMi5tYXJrZXIhLmNvdW50LCAxKTtcblxuXHRcdGRhdGEgPSBbXG5cdFx0XHRmYWtlTWFya2VyKG5ldyBSYW5nZSgxLCA0LCAxLCAxMSkpLFxuXHRcdFx0ZmFrZU1hcmtlcihuZXcgUmFuZ2UoNywgNiwgNywgOCkpLFxuXHRcdF07XG5cdFx0Z3JvdXAudXBkYXRlTWFya2VyKGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwLm1hcmtlciEuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjMS5tYXJrZXIsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGMyLm1hcmtlciEuY291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdPdXRsaW5lRWxlbWVudCAtIHVwZGF0ZU1hcmtlci9tdWx0aXBsZSBncm91cHMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IG5ldyBjbGFzcyBleHRlbmRzIE91dGxpbmVNb2RlbCB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIobnVsbCEpO1xuXHRcdFx0fVxuXHRcdFx0cmVhZHlGb3JUZXN0aW5nKCkge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0dGhpcy5fZ3JvdXBzID0gdGhpcy5jaGlsZHJlbiBhcyBhbnk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRtb2RlbC5jaGlsZHJlbi5zZXQoJ2cxJywgbmV3IE91dGxpbmVHcm91cCgnZzEnLCBtb2RlbCwgbnVsbCEsIDEpKTtcblx0XHRtb2RlbC5jaGlsZHJlbi5nZXQoJ2cxJykhLmNoaWxkcmVuLnNldCgnYzEnLCBuZXcgT3V0bGluZUVsZW1lbnQoJ2MxJywgbW9kZWwuY2hpbGRyZW4uZ2V0KCdnMScpISwgZmFrZVN5bWJvbEluZm9ybWF0aW9uKG5ldyBSYW5nZSgxLCAxLCAxMSwgMSkpKSk7XG5cblx0XHRtb2RlbC5jaGlsZHJlbi5zZXQoJ2cyJywgbmV3IE91dGxpbmVHcm91cCgnZzInLCBtb2RlbCwgbnVsbCEsIDEpKTtcblx0XHRtb2RlbC5jaGlsZHJlbi5nZXQoJ2cyJykhLmNoaWxkcmVuLnNldCgnYzInLCBuZXcgT3V0bGluZUVsZW1lbnQoJ2MyJywgbW9kZWwuY2hpbGRyZW4uZ2V0KCdnMicpISwgZmFrZVN5bWJvbEluZm9ybWF0aW9uKG5ldyBSYW5nZSgxLCAxLCA3LCAxKSkpKTtcblx0XHRtb2RlbC5jaGlsZHJlbi5nZXQoJ2cyJykhLmNoaWxkcmVuLmdldCgnYzInKSEuY2hpbGRyZW4uc2V0KCdjMi4xJywgbmV3IE91dGxpbmVFbGVtZW50KCdjMi4xJywgbW9kZWwuY2hpbGRyZW4uZ2V0KCdnMicpIS5jaGlsZHJlbi5nZXQoJ2MyJykhLCBmYWtlU3ltYm9sSW5mb3JtYXRpb24obmV3IFJhbmdlKDEsIDMsIDIsIDE5KSkpKTtcblx0XHRtb2RlbC5jaGlsZHJlbi5nZXQoJ2cyJykhLmNoaWxkcmVuLmdldCgnYzInKSEuY2hpbGRyZW4uc2V0KCdjMi4yJywgbmV3IE91dGxpbmVFbGVtZW50KCdjMi4yJywgbW9kZWwuY2hpbGRyZW4uZ2V0KCdnMicpIS5jaGlsZHJlbi5nZXQoJ2MyJykhLCBmYWtlU3ltYm9sSW5mb3JtYXRpb24obmV3IFJhbmdlKDQsIDEsIDYsIDEwKSkpKTtcblxuXHRcdG1vZGVsLnJlYWR5Rm9yVGVzdGluZygpO1xuXG5cdFx0Y29uc3QgZGF0YSA9IFtcblx0XHRcdGZha2VNYXJrZXIobmV3IFJhbmdlKDEsIDEsIDIsIDgpKSxcblx0XHRcdGZha2VNYXJrZXIobmV3IFJhbmdlKDYsIDEsIDYsIDk4KSksXG5cdFx0XTtcblxuXHRcdG1vZGVsLnVwZGF0ZU1hcmtlcihkYXRhKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jaGlsZHJlbi5nZXQoJ2cxJykhLmNoaWxkcmVuLmdldCgnYzEnKSEubWFya2VyIS5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNoaWxkcmVuLmdldCgnZzInKSEuY2hpbGRyZW4uZ2V0KCdjMicpIS5jaGlsZHJlbi5nZXQoJ2MyLjEnKSEubWFya2VyIS5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNoaWxkcmVuLmdldCgnZzInKSEuY2hpbGRyZW4uZ2V0KCdjMicpIS5jaGlsZHJlbi5nZXQoJ2MyLjInKSEubWFya2VyIS5jb3VudCwgMSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsYUFBYTtBQUN0QixTQUF5QixrQkFBa0I7QUFDM0MsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUIsdUJBQXVCO0FBQ3JELFNBQVMsc0JBQXNCO0FBQy9CLFNBQWtCLHNCQUFzQjtBQUN4QyxTQUFTLGdCQUFnQixjQUFjLGNBQWMsMkJBQTJCO0FBQ2hGLFNBQVMsWUFBWTtBQUVyQixTQUFTLCtDQUErQztBQUV4RCxNQUFNLGdCQUFnQixXQUFZO0FBRWpDLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxRQUFNLDBCQUEwQixJQUFJLHdCQUF3QjtBQUU1RCxXQUFTLFdBQVk7QUFDcEIsZ0JBQVksTUFBTTtBQUFBLEVBQ25CLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMs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
