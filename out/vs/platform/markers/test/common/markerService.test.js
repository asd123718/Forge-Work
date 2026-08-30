import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { MarkerSeverity } from "../../common/markers.js";
import * as markerService from "../../common/markerService.js";
function randomMarkerData(severity = MarkerSeverity.Error) {
  return {
    severity,
    message: Math.random().toString(16),
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 1
  };
}
suite("Marker Service", () => {
  let service;
  teardown(function() {
    service.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("query", () => {
    service = new markerService.MarkerService();
    service.changeAll("far", [{
      resource: URI.parse("file:///c/test/file.cs"),
      marker: randomMarkerData(MarkerSeverity.Error)
    }]);
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
    assert.strictEqual(service.read({ resource: URI.parse("file:///c/test/file.cs") }).length, 1);
    assert.strictEqual(service.read({ owner: "far", resource: URI.parse("file:///c/test/file.cs") }).length, 1);
    service.changeAll("boo", [{
      resource: URI.parse("file:///c/test/file.cs"),
      marker: randomMarkerData(MarkerSeverity.Warning)
    }]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
    assert.strictEqual(service.read({ owner: "boo" }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Error }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Warning }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Hint }).length, 0);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning }).length, 2);
  });
  test("changeOne override", () => {
    service = new markerService.MarkerService();
    service.changeOne("far", URI.parse("file:///path/only.cs"), [randomMarkerData()]);
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
    service.changeOne("boo", URI.parse("file:///path/only.cs"), [randomMarkerData()]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
    assert.strictEqual(service.read({ owner: "boo" }).length, 1);
    service.changeOne("far", URI.parse("file:///path/only.cs"), [randomMarkerData(), randomMarkerData()]);
    assert.strictEqual(service.read({ owner: "far" }).length, 2);
    assert.strictEqual(service.read({ owner: "boo" }).length, 1);
  });
  test("changeOne/All clears", () => {
    service = new markerService.MarkerService();
    service.changeOne("far", URI.parse("file:///path/only.cs"), [randomMarkerData()]);
    service.changeOne("boo", URI.parse("file:///path/only.cs"), [randomMarkerData()]);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
    assert.strictEqual(service.read({ owner: "boo" }).length, 1);
    assert.strictEqual(service.read().length, 2);
    service.changeOne("far", URI.parse("file:///path/only.cs"), []);
    assert.strictEqual(service.read({ owner: "far" }).length, 0);
    assert.strictEqual(service.read({ owner: "boo" }).length, 1);
    assert.strictEqual(service.read().length, 1);
    service.changeAll("boo", []);
    assert.strictEqual(service.read({ owner: "far" }).length, 0);
    assert.strictEqual(service.read({ owner: "boo" }).length, 0);
    assert.strictEqual(service.read().length, 0);
  });
  test("changeAll sends event for cleared", () => {
    service = new markerService.MarkerService();
    service.changeAll("far", [{
      resource: URI.parse("file:///d/path"),
      marker: randomMarkerData()
    }, {
      resource: URI.parse("file:///d/path"),
      marker: randomMarkerData()
    }]);
    assert.strictEqual(service.read({ owner: "far" }).length, 2);
    const d = service.onMarkerChanged((changedResources) => {
      assert.strictEqual(changedResources.length, 1);
      changedResources.forEach((u) => assert.strictEqual(u.toString(), "file:///d/path"));
      assert.strictEqual(service.read({ owner: "far" }).length, 0);
    });
    service.changeAll("far", []);
    d.dispose();
  });
  test("changeAll merges", () => {
    service = new markerService.MarkerService();
    service.changeAll("far", [{
      resource: URI.parse("file:///c/test/file.cs"),
      marker: randomMarkerData()
    }, {
      resource: URI.parse("file:///c/test/file.cs"),
      marker: randomMarkerData()
    }]);
    assert.strictEqual(service.read({ owner: "far" }).length, 2);
  });
  test("changeAll must not break integrety, issue #12635", () => {
    service = new markerService.MarkerService();
    service.changeAll("far", [{
      resource: URI.parse("scheme:path1"),
      marker: randomMarkerData()
    }, {
      resource: URI.parse("scheme:path2"),
      marker: randomMarkerData()
    }]);
    service.changeAll("boo", [{
      resource: URI.parse("scheme:path1"),
      marker: randomMarkerData()
    }]);
    service.changeAll("far", [{
      resource: URI.parse("scheme:path1"),
      marker: randomMarkerData()
    }, {
      resource: URI.parse("scheme:path2"),
      marker: randomMarkerData()
    }]);
    assert.strictEqual(service.read({ owner: "far" }).length, 2);
    assert.strictEqual(service.read({ resource: URI.parse("scheme:path1") }).length, 2);
  });
  test("invalid marker data", () => {
    const data = randomMarkerData();
    service = new markerService.MarkerService();
    data.message = void 0;
    service.changeOne("far", URI.parse("some:uri/path"), [data]);
    assert.strictEqual(service.read({ owner: "far" }).length, 0);
    data.message = null;
    service.changeOne("far", URI.parse("some:uri/path"), [data]);
    assert.strictEqual(service.read({ owner: "far" }).length, 0);
    data.message = "null";
    service.changeOne("far", URI.parse("some:uri/path"), [data]);
    assert.strictEqual(service.read({ owner: "far" }).length, 1);
  });
  test("MapMap#remove returns bad values, https://github.com/microsoft/vscode/issues/13548", () => {
    service = new markerService.MarkerService();
    service.changeOne("o", URI.parse("some:uri/1"), [randomMarkerData()]);
    service.changeOne("o", URI.parse("some:uri/2"), []);
  });
  test("Error code of zero in markers get removed, #31275", function() {
    const data = {
      code: "0",
      startLineNumber: 1,
      startColumn: 2,
      endLineNumber: 1,
      endColumn: 5,
      message: "test",
      severity: 0,
      source: "me"
    };
    service = new markerService.MarkerService();
    service.changeOne("far", URI.parse("some:thing"), [data]);
    const marker = service.read({ resource: URI.parse("some:thing") });
    assert.strictEqual(marker.length, 1);
    assert.strictEqual(marker[0].code, "0");
  });
  test("modelVersionId is preserved on IMarker when present in IMarkerData", () => {
    service = new markerService.MarkerService();
    const resource = URI.parse("file:///path/file.ts");
    const dataWithVersion = {
      ...randomMarkerData(),
      modelVersionId: 42
    };
    service.changeOne("owner", resource, [dataWithVersion]);
    const markersWithVersion = service.read({ resource });
    assert.strictEqual(markersWithVersion.length, 1);
    assert.strictEqual(markersWithVersion[0].modelVersionId, 42);
    const dataWithoutVersion = randomMarkerData();
    service.changeOne("owner", resource, [dataWithoutVersion]);
    const markersWithoutVersion = service.read({ resource });
    assert.strictEqual(markersWithoutVersion.length, 1);
    assert.strictEqual(markersWithoutVersion[0].modelVersionId, void 0);
  });
  test("resource filter hides markers for the filtered resource", () => {
    service = new markerService.MarkerService();
    const resource1 = URI.parse("file:///path/file1.cs");
    const resource2 = URI.parse("file:///path/file2.cs");
    service.changeOne("owner1", resource1, [randomMarkerData()]);
    service.changeOne("owner1", resource2, [randomMarkerData()]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource: resource1 }).length, 1);
    assert.strictEqual(service.read({ resource: resource2 }).length, 1);
    const filter = service.installResourceFilter(resource1, "Test filter");
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource: resource1 }).length, 1);
    assert.strictEqual(service.read({ resource: resource2 }).length, 1);
    filter.dispose();
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource: resource1 }).length, 1);
    assert.strictEqual(service.read({ resource: resource2 }).length, 1);
  });
  test("resource filter hides markers for the filtered resource UNLESS explicit read", () => {
    service = new markerService.MarkerService();
    const resource1 = URI.parse("file:///path/file1.cs");
    const resource2 = URI.parse("file:///path/file2.cs");
    service.changeOne("owner1", resource1, [randomMarkerData()]);
    service.changeOne("owner1", resource2, [randomMarkerData()]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource: resource1 }).length, 1);
    assert.strictEqual(service.read({ resource: resource2 }).length, 1);
    const filter = service.installResourceFilter(resource1, "Test filter");
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource: resource1 }).length, 1);
    assert.strictEqual(service.read({ resource: resource2 }).length, 1);
    assert.strictEqual(service.read({ ignoreResourceFilters: true }).length, 2);
    assert.strictEqual(service.read({ resource: resource1, ignoreResourceFilters: true }).length, 1);
    assert.strictEqual(service.read({ resource: resource1, ignoreResourceFilters: true })[0].severity, MarkerSeverity.Error);
    assert.strictEqual(service.read({ resource: resource2, ignoreResourceFilters: true }).length, 1);
    assert.strictEqual(service.read({ resource: resource2, ignoreResourceFilters: true })[0].severity, MarkerSeverity.Error);
    filter.dispose();
  });
  test("resource filter affects all filter combinations", () => {
    service = new markerService.MarkerService();
    const resource = URI.parse("file:///path/file.cs");
    service.changeOne("owner1", resource, [randomMarkerData(MarkerSeverity.Error)]);
    service.changeOne("owner2", resource, [randomMarkerData(MarkerSeverity.Warning)]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource }).length, 2);
    assert.strictEqual(service.read({ owner: "owner1" }).length, 1);
    assert.strictEqual(service.read({ owner: "owner2" }).length, 1);
    assert.strictEqual(service.read({ owner: "owner1", resource }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Error }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Warning }).length, 1);
    const filter = service.installResourceFilter(resource, "Filter reason");
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    assert.strictEqual(service.read({ owner: "owner1" }).length, 1);
    assert.strictEqual(service.read({ owner: "owner2" }).length, 1);
    const ownerResourceMarkers = service.read({ owner: "owner1", resource });
    assert.strictEqual(ownerResourceMarkers.length, 1);
    assert.strictEqual(ownerResourceMarkers[0].severity, MarkerSeverity.Info);
    assert.strictEqual(ownerResourceMarkers[0].owner, "markersFilter");
    assert.strictEqual(service.read({ severities: MarkerSeverity.Error }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Warning }).length, 1);
    assert.strictEqual(service.read({ severities: MarkerSeverity.Info }).length, 1);
    filter.dispose();
    assert.strictEqual(service.read().length, 2);
  });
  test("multiple filters for same resource are handled correctly", () => {
    service = new markerService.MarkerService();
    const resource = URI.parse("file:///path/file.cs");
    service.changeOne("owner1", resource, [randomMarkerData()]);
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    const filter1 = service.installResourceFilter(resource, "First filter");
    const filter2 = service.installResourceFilter(resource, "Second filter");
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    filter1.dispose();
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    filter2.dispose();
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
  });
  test("resource filter with reason shows info marker when markers are filtered", () => {
    service = new markerService.MarkerService();
    const resource = URI.parse("file:///path/file.cs");
    service.changeOne("owner1", resource, [
      randomMarkerData(MarkerSeverity.Error),
      randomMarkerData(MarkerSeverity.Warning)
    ]);
    assert.strictEqual(service.read().length, 2);
    assert.strictEqual(service.read({ resource }).length, 2);
    const filterReason = "Test filter reason";
    const filter = service.installResourceFilter(resource, filterReason);
    const markers = service.read({ resource });
    assert.strictEqual(markers.length, 1);
    assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
    assert.ok(markers[0].message.includes(filterReason));
    filter.dispose();
    assert.strictEqual(service.read({ resource }).length, 2);
  });
  test("reading all markers shows info marker for filtered resources", () => {
    service = new markerService.MarkerService();
    const resource1 = URI.parse("file:///path/file1.cs");
    const resource2 = URI.parse("file:///path/file2.cs");
    service.changeOne("owner1", resource1, [randomMarkerData()]);
    service.changeOne("owner1", resource2, [randomMarkerData()]);
    assert.strictEqual(service.read().length, 2);
    const filterReason = "Resource is being edited";
    const filter = service.installResourceFilter(resource1, filterReason);
    const allMarkers = service.read();
    assert.strictEqual(allMarkers.length, 2);
    const infoMarker = allMarkers.find(
      (marker) => marker.owner === "markersFilter" && marker.severity === MarkerSeverity.Info
    );
    assert.ok(infoMarker);
    assert.strictEqual(infoMarker?.resource.toString(), resource1.toString());
    assert.ok(infoMarker?.message.includes(filterReason));
    filter.dispose();
  });
  test("out of order filter disposal works correctly", () => {
    service = new markerService.MarkerService();
    const resource = URI.parse("file:///path/file.cs");
    service.changeOne("owner1", resource, [randomMarkerData()]);
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    const filter1 = service.installResourceFilter(resource, "First filter");
    const filter2 = service.installResourceFilter(resource, "Second filter");
    const filter3 = service.installResourceFilter(resource, "Third filter");
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    filter2.dispose();
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
    const markers = service.read({ resource });
    assert.ok(markers[0].message.includes("Problems are paused because"));
    filter3.dispose();
    filter1.dispose();
    assert.strictEqual(service.read().length, 1);
    assert.strictEqual(service.read({ resource }).length, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWFya2Vyc1xcdGVzdFxcY29tbW9uXFxtYXJrZXJTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgKiBhcyBtYXJrZXJTZXJ2aWNlIGZyb20gJy4uLy4uL2NvbW1vbi9tYXJrZXJTZXJ2aWNlLmpzJztcblxuZnVuY3Rpb24gcmFuZG9tTWFya2VyRGF0YShzZXZlcml0eSA9IE1hcmtlclNldmVyaXR5LkVycm9yKTogSU1hcmtlckRhdGEge1xuXHRyZXR1cm4ge1xuXHRcdHNldmVyaXR5LFxuXHRcdG1lc3NhZ2U6IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMTYpLFxuXHRcdHN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRzdGFydENvbHVtbjogMSxcblx0XHRlbmRMaW5lTnVtYmVyOiAxLFxuXHRcdGVuZENvbHVtbjogMVxuXHR9O1xufVxuXG5zdWl0ZSgnTWFya2VyIFNlcnZpY2UnLCAoKSA9PiB7XG5cblx0bGV0IHNlcnZpY2U6IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3F1ZXJ5JywgKCkgPT4ge1xuXG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblxuXHRcdHNlcnZpY2UuY2hhbmdlQWxsKCdmYXInLCBbe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9jL3Rlc3QvZmlsZS5jcycpLFxuXHRcdFx0bWFya2VyOiByYW5kb21NYXJrZXJEYXRhKE1hcmtlclNldmVyaXR5LkVycm9yKVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9jL3Rlc3QvZmlsZS5jcycpIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJywgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9jL3Rlc3QvZmlsZS5jcycpIH0pLmxlbmd0aCwgMSk7XG5cblxuXHRcdHNlcnZpY2UuY2hhbmdlQWxsKCdib28nLCBbe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9jL3Rlc3QvZmlsZS5jcycpLFxuXHRcdFx0bWFya2VyOiByYW5kb21NYXJrZXJEYXRhKE1hcmtlclNldmVyaXR5Lldhcm5pbmcpXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2JvbycgfSkubGVuZ3RoLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBzZXZlcml0aWVzOiBNYXJrZXJTZXZlcml0eS5FcnJvciB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBzZXZlcml0aWVzOiBNYXJrZXJTZXZlcml0eS5XYXJuaW5nIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkhpbnQgfSkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgc2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuRXJyb3IgfCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nIH0pLmxlbmd0aCwgMik7XG5cblx0fSk7XG5cblxuXHR0ZXN0KCdjaGFuZ2VPbmUgb3ZlcnJpZGUnLCAoKSA9PiB7XG5cblx0XHRzZXJ2aWNlID0gbmV3IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZSgpO1xuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdmYXInLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9vbmx5LmNzJyksIFtyYW5kb21NYXJrZXJEYXRhKCldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdmYXInIH0pLmxlbmd0aCwgMSk7XG5cblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnYm9vJywgVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvb25seS5jcycpLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2JvbycgfSkubGVuZ3RoLCAxKTtcblxuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdmYXInLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9vbmx5LmNzJyksIFtyYW5kb21NYXJrZXJEYXRhKCksIHJhbmRvbU1hcmtlckRhdGEoKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdib28nIH0pLmxlbmd0aCwgMSk7XG5cblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlT25lL0FsbCBjbGVhcnMnLCAoKSA9PiB7XG5cblx0XHRzZXJ2aWNlID0gbmV3IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZSgpO1xuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdmYXInLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9vbmx5LmNzJyksIFtyYW5kb21NYXJrZXJEYXRhKCldKTtcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnYm9vJywgVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvb25seS5jcycpLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2JvbycgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAyKTtcblxuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdmYXInLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9vbmx5LmNzJyksIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdmYXInIH0pLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnYm9vJyB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDEpO1xuXG5cdFx0c2VydmljZS5jaGFuZ2VBbGwoJ2JvbycsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdmYXInIH0pLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnYm9vJyB9KS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2VBbGwgc2VuZHMgZXZlbnQgZm9yIGNsZWFyZWQnLCAoKSA9PiB7XG5cblx0XHRzZXJ2aWNlID0gbmV3IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZSgpO1xuXHRcdHNlcnZpY2UuY2hhbmdlQWxsKCdmYXInLCBbe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9kL3BhdGgnKSxcblx0XHRcdG1hcmtlcjogcmFuZG9tTWFya2VyRGF0YSgpXG5cdFx0fSwge1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9kL3BhdGgnKSxcblx0XHRcdG1hcmtlcjogcmFuZG9tTWFya2VyRGF0YSgpXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDIpO1xuXG5cdFx0Y29uc3QgZCA9IHNlcnZpY2Uub25NYXJrZXJDaGFuZ2VkKGNoYW5nZWRSZXNvdXJjZXMgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWRSZXNvdXJjZXMubGVuZ3RoLCAxKTtcblx0XHRcdGNoYW5nZWRSZXNvdXJjZXMuZm9yRWFjaCh1ID0+IGFzc2VydC5zdHJpY3RFcXVhbCh1LnRvU3RyaW5nKCksICdmaWxlOi8vL2QvcGF0aCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHNlcnZpY2UuY2hhbmdlQWxsKCdmYXInLCBbXSk7XG5cblx0XHRkLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlQWxsIG1lcmdlcycsICgpID0+IHtcblx0XHRzZXJ2aWNlID0gbmV3IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZSgpO1xuXG5cdFx0c2VydmljZS5jaGFuZ2VBbGwoJ2ZhcicsIFt7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL2MvdGVzdC9maWxlLmNzJyksXG5cdFx0XHRtYXJrZXI6IHJhbmRvbU1hcmtlckRhdGEoKVxuXHRcdH0sIHtcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYy90ZXN0L2ZpbGUuY3MnKSxcblx0XHRcdG1hcmtlcjogcmFuZG9tTWFya2VyRGF0YSgpXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2VBbGwgbXVzdCBub3QgYnJlYWsgaW50ZWdyZXR5LCBpc3N1ZSAjMTI2MzUnLCAoKSA9PiB7XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblxuXHRcdHNlcnZpY2UuY2hhbmdlQWxsKCdmYXInLCBbe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnc2NoZW1lOnBhdGgxJyksXG5cdFx0XHRtYXJrZXI6IHJhbmRvbU1hcmtlckRhdGEoKVxuXHRcdH0sIHtcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3NjaGVtZTpwYXRoMicpLFxuXHRcdFx0bWFya2VyOiByYW5kb21NYXJrZXJEYXRhKClcblx0XHR9XSk7XG5cblx0XHRzZXJ2aWNlLmNoYW5nZUFsbCgnYm9vJywgW3tcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3NjaGVtZTpwYXRoMScpLFxuXHRcdFx0bWFya2VyOiByYW5kb21NYXJrZXJEYXRhKClcblx0XHR9XSk7XG5cblx0XHRzZXJ2aWNlLmNoYW5nZUFsbCgnZmFyJywgW3tcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3NjaGVtZTpwYXRoMScpLFxuXHRcdFx0bWFya2VyOiByYW5kb21NYXJrZXJEYXRhKClcblx0XHR9LCB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdzY2hlbWU6cGF0aDInKSxcblx0XHRcdG1hcmtlcjogcmFuZG9tTWFya2VyRGF0YSgpXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogVVJJLnBhcnNlKCdzY2hlbWU6cGF0aDEnKSB9KS5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIG1hcmtlciBkYXRhJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgZGF0YSA9IHJhbmRvbU1hcmtlckRhdGEoKTtcblx0XHRzZXJ2aWNlID0gbmV3IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZSgpO1xuXG5cdFx0ZGF0YS5tZXNzYWdlID0gdW5kZWZpbmVkITtcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnZmFyJywgVVJJLnBhcnNlKCdzb21lOnVyaS9wYXRoJyksIFtkYXRhXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDApO1xuXG5cdFx0ZGF0YS5tZXNzYWdlID0gbnVsbCE7XG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ2ZhcicsIFVSSS5wYXJzZSgnc29tZTp1cmkvcGF0aCcpLCBbZGF0YV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ2ZhcicgfSkubGVuZ3RoLCAwKTtcblxuXHRcdGRhdGEubWVzc2FnZSA9ICdudWxsJztcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnZmFyJywgVVJJLnBhcnNlKCdzb21lOnVyaS9wYXRoJyksIFtkYXRhXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnZmFyJyB9KS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdNYXBNYXAjcmVtb3ZlIHJldHVybnMgYmFkIHZhbHVlcywgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzNTQ4JywgKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBuZXcgbWFya2VyU2VydmljZS5NYXJrZXJTZXJ2aWNlKCk7XG5cblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnbycsIFVSSS5wYXJzZSgnc29tZTp1cmkvMScpLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ28nLCBVUkkucGFyc2UoJ3NvbWU6dXJpLzInKSwgW10pO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ0Vycm9yIGNvZGUgb2YgemVybyBpbiBtYXJrZXJzIGdldCByZW1vdmVkLCAjMzEyNzUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGF0YSA9IDxJTWFya2VyRGF0YT57XG5cdFx0XHRjb2RlOiAnMCcsXG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRzdGFydENvbHVtbjogMixcblx0XHRcdGVuZExpbmVOdW1iZXI6IDEsXG5cdFx0XHRlbmRDb2x1bW46IDUsXG5cdFx0XHRtZXNzYWdlOiAndGVzdCcsXG5cdFx0XHRzZXZlcml0eTogMCBhcyBNYXJrZXJTZXZlcml0eSxcblx0XHRcdHNvdXJjZTogJ21lJ1xuXHRcdH07XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblxuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdmYXInLCBVUkkucGFyc2UoJ3NvbWU6dGhpbmcnKSwgW2RhdGFdKTtcblx0XHRjb25zdCBtYXJrZXIgPSBzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogVVJJLnBhcnNlKCdzb21lOnRoaW5nJykgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlclswXS5jb2RlLCAnMCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbFZlcnNpb25JZCBpcyBwcmVzZXJ2ZWQgb24gSU1hcmtlciB3aGVuIHByZXNlbnQgaW4gSU1hcmtlckRhdGEnLCAoKSA9PiB7XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wYXRoL2ZpbGUudHMnKTtcblxuXHRcdC8vIFRlc3Qgd2l0aCBtb2RlbFZlcnNpb25JZCBwcmVzZW50XG5cdFx0Y29uc3QgZGF0YVdpdGhWZXJzaW9uOiBJTWFya2VyRGF0YSA9IHtcblx0XHRcdC4uLnJhbmRvbU1hcmtlckRhdGEoKSxcblx0XHRcdG1vZGVsVmVyc2lvbklkOiA0MlxuXHRcdH07XG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ293bmVyJywgcmVzb3VyY2UsIFtkYXRhV2l0aFZlcnNpb25dKTtcblxuXHRcdGNvbnN0IG1hcmtlcnNXaXRoVmVyc2lvbiA9IHNlcnZpY2UucmVhZCh7IHJlc291cmNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzV2l0aFZlcnNpb24ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1dpdGhWZXJzaW9uWzBdLm1vZGVsVmVyc2lvbklkLCA0Mik7XG5cblx0XHQvLyBUZXN0IHdpdGhvdXQgbW9kZWxWZXJzaW9uSWQgKHNob3VsZCBiZSB1bmRlZmluZWQpXG5cdFx0Y29uc3QgZGF0YVdpdGhvdXRWZXJzaW9uOiBJTWFya2VyRGF0YSA9IHJhbmRvbU1hcmtlckRhdGEoKTtcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnb3duZXInLCByZXNvdXJjZSwgW2RhdGFXaXRob3V0VmVyc2lvbl0pO1xuXG5cdFx0Y29uc3QgbWFya2Vyc1dpdGhvdXRWZXJzaW9uID0gc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNXaXRob3V0VmVyc2lvbi5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzV2l0aG91dFZlcnNpb25bMF0ubW9kZWxWZXJzaW9uSWQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlIGZpbHRlciBoaWRlcyBtYXJrZXJzIGZvciB0aGUgZmlsdGVyZWQgcmVzb3VyY2UnLCAoKSA9PiB7XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9maWxlMS5jcycpO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5wYXJzZSgnZmlsZTovLy9wYXRoL2ZpbGUyLmNzJyk7XG5cblx0XHQvLyBBZGQgbWFya2VycyB0byBib3RoIHJlc291cmNlc1xuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdvd25lcjEnLCByZXNvdXJjZTEsIFtyYW5kb21NYXJrZXJEYXRhKCldKTtcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnb3duZXIxJywgcmVzb3VyY2UyLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cblx0XHQvLyBWZXJpZnkgYm90aCByZXNvdXJjZXMgaGF2ZSBtYXJrZXJzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlOiByZXNvdXJjZTEgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IHJlc291cmNlMiB9KS5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gSW5zdGFsbCBmaWx0ZXIgZm9yIHJlc291cmNlMVxuXHRcdGNvbnN0IGZpbHRlciA9IHNlcnZpY2UuaW5zdGFsbFJlc291cmNlRmlsdGVyKHJlc291cmNlMSwgJ1Rlc3QgZmlsdGVyJyk7XG5cblx0XHQvLyBWZXJpZnkgcmVzb3VyY2UxIG1hcmtlcnMgYXJlIGZpbHRlcmVkIG91dCwgYnV0IGhhdmUgMSBpbmZvIG1hcmtlciBpbnN0ZWFkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMik7IC8vIDEgcmVhbCArIDEgaW5mb1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogcmVzb3VyY2UxIH0pLmxlbmd0aCwgMSk7IC8vIDEgaW5mb1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogcmVzb3VyY2UyIH0pLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBEaXNwb3NlIGZpbHRlclxuXHRcdGZpbHRlci5kaXNwb3NlKCk7XG5cblx0XHQvLyBWZXJpZnkgcmVzb3VyY2UxIG1hcmtlcnMgYXJlIHZpc2libGUgYWdhaW5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IHJlc291cmNlMSB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogcmVzb3VyY2UyIH0pLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlIGZpbHRlciBoaWRlcyBtYXJrZXJzIGZvciB0aGUgZmlsdGVyZWQgcmVzb3VyY2UgVU5MRVNTIGV4cGxpY2l0IHJlYWQnLCAoKSA9PiB7XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9maWxlMS5jcycpO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5wYXJzZSgnZmlsZTovLy9wYXRoL2ZpbGUyLmNzJyk7XG5cblx0XHQvLyBBZGQgbWFya2VycyB0byBib3RoIHJlc291cmNlc1xuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdvd25lcjEnLCByZXNvdXJjZTEsIFtyYW5kb21NYXJrZXJEYXRhKCldKTtcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnb3duZXIxJywgcmVzb3VyY2UyLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cblx0XHQvLyBWZXJpZnkgYm90aCByZXNvdXJjZXMgaGF2ZSBtYXJrZXJzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlOiByZXNvdXJjZTEgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IHJlc291cmNlMiB9KS5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gSW5zdGFsbCBmaWx0ZXIgZm9yIHJlc291cmNlMVxuXHRcdGNvbnN0IGZpbHRlciA9IHNlcnZpY2UuaW5zdGFsbFJlc291cmNlRmlsdGVyKHJlc291cmNlMSwgJ1Rlc3QgZmlsdGVyJyk7XG5cblx0XHQvLyBWZXJpZnkgcmVzb3VyY2UxIG1hcmtlcnMgYXJlIGZpbHRlcmVkIG91dCwgYnV0IGhhdmUgMSBpbmZvIG1hcmtlciBpbnN0ZWFkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMik7IC8vIDEgcmVhbCArIDEgaW5mb1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogcmVzb3VyY2UxIH0pLmxlbmd0aCwgMSk7IC8vIDEgaW5mb1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogcmVzb3VyY2UyIH0pLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBWZXJpZnkgcmVzb3VyY2UxIG1hcmtlcnMgYXJlIHZpc2libGUgYWdhaW5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgaWdub3JlUmVzb3VyY2VGaWx0ZXJzOiB0cnVlIH0pLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlOiByZXNvdXJjZTEsIGlnbm9yZVJlc291cmNlRmlsdGVyczogdHJ1ZSB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogcmVzb3VyY2UxLCBpZ25vcmVSZXNvdXJjZUZpbHRlcnM6IHRydWUgfSlbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IHJlc291cmNlMiwgaWdub3JlUmVzb3VyY2VGaWx0ZXJzOiB0cnVlIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlOiByZXNvdXJjZTIsIGlnbm9yZVJlc291cmNlRmlsdGVyczogdHJ1ZSB9KVswXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXG5cdFx0Ly8gRGlzcG9zZSBmaWx0ZXJcblx0XHRmaWx0ZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZSBmaWx0ZXIgYWZmZWN0cyBhbGwgZmlsdGVyIGNvbWJpbmF0aW9ucycsICgpID0+IHtcblx0XHRzZXJ2aWNlID0gbmV3IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvZmlsZS5jcycpO1xuXG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ293bmVyMScsIHJlc291cmNlLCBbcmFuZG9tTWFya2VyRGF0YShNYXJrZXJTZXZlcml0eS5FcnJvcildKTtcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnb3duZXIyJywgcmVzb3VyY2UsIFtyYW5kb21NYXJrZXJEYXRhKE1hcmtlclNldmVyaXR5Lldhcm5pbmcpXSk7XG5cblx0XHQvLyBWZXJpZnkgaW5pdGlhbCBzdGF0ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ293bmVyMScgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgb3duZXI6ICdvd25lcjInIH0pLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnb3duZXIxJywgcmVzb3VyY2UgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgc2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuRXJyb3IgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgc2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuV2FybmluZyB9KS5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gSW5zdGFsbCBmaWx0ZXJcblx0XHRjb25zdCBmaWx0ZXIgPSBzZXJ2aWNlLmluc3RhbGxSZXNvdXJjZUZpbHRlcihyZXNvdXJjZSwgJ0ZpbHRlciByZWFzb24nKTtcblxuXHRcdC8vIFZlcmlmeSBpbmZvcm1hdGlvbiBtYXJrZXIgaXMgc2hvd24gZm9yIHJlc291cmNlIHF1ZXJpZXNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAxKTsgLy8gMSBpbmZvIG1hcmtlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KS5sZW5ndGgsIDEpOyAvLyAxIGluZm8gbWFya2VyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnb3duZXIxJyB9KS5sZW5ndGgsIDEpOyAvLyAxIGluZm8gbWFya2VyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IG93bmVyOiAnb3duZXIyJyB9KS5sZW5ndGgsIDEpOyAvLyAxIGluZm8gbWFya2VyXG5cblx0XHQvLyBWZXJpZnkgb3duZXIrcmVzb3VyY2UgcXVlcnkgcmV0dXJucyBhbiBpbmZvIG1hcmtlciBmb3IgZmlsdGVyZWQgcmVzb3VyY2VzXG5cdFx0Y29uc3Qgb3duZXJSZXNvdXJjZU1hcmtlcnMgPSBzZXJ2aWNlLnJlYWQoeyBvd25lcjogJ293bmVyMScsIHJlc291cmNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvd25lclJlc291cmNlTWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvd25lclJlc291cmNlTWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuSW5mbyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG93bmVyUmVzb3VyY2VNYXJrZXJzWzBdLm93bmVyLCAnbWFya2Vyc0ZpbHRlcicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkVycm9yIH0pLmxlbmd0aCwgMSk7IC8vIDEgaW5mbyBtYXJrZXJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgc2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuV2FybmluZyB9KS5sZW5ndGgsIDEpOyAvLyAxIGluZm8gbWFya2VyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkluZm8gfSkubGVuZ3RoLCAxKTsgLy8gT3VyIGluZm8gbWFya2VyXG5cblx0XHQvLyBSZW1vdmUgZmlsdGVyIGFuZCB2ZXJpZnkgbWFya2VycyBhcmUgdmlzaWJsZSBhZ2FpblxuXHRcdGZpbHRlci5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIGZpbHRlcnMgZm9yIHNhbWUgcmVzb3VyY2UgYXJlIGhhbmRsZWQgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdHNlcnZpY2UgPSBuZXcgbWFya2VyU2VydmljZS5NYXJrZXJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC9maWxlLmNzJyk7XG5cblx0XHQvLyBBZGQgbWFya2VyIHRvIHJlc291cmNlXG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ293bmVyMScsIHJlc291cmNlLCBbcmFuZG9tTWFya2VyRGF0YSgpXSk7XG5cblx0XHQvLyBWZXJpZnkgcmVzb3VyY2UgaGFzIG1hcmtlcnNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSkubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEluc3RhbGwgdHdvIGZpbHRlcnMgZm9yIHRoZSBzYW1lIHJlc291cmNlXG5cdFx0Y29uc3QgZmlsdGVyMSA9IHNlcnZpY2UuaW5zdGFsbFJlc291cmNlRmlsdGVyKHJlc291cmNlLCAnRmlyc3QgZmlsdGVyJyk7XG5cdFx0Y29uc3QgZmlsdGVyMiA9IHNlcnZpY2UuaW5zdGFsbFJlc291cmNlRmlsdGVyKHJlc291cmNlLCAnU2Vjb25kIGZpbHRlcicpO1xuXG5cdFx0Ly8gVmVyaWZ5IHJlc291cmNlIG1hcmtlcnMgYXJlIGZpbHRlcmVkIG91dCBidXQgaW5mbyBtYXJrZXIgaXMgc2hvd25cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAxKTsgLy8gMSBpbmZvIG1hcmtlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KS5sZW5ndGgsIDEpOyAvLyAxIGluZm8gbWFya2VyXG5cblx0XHQvLyBEaXNwb3NlIG9ubHkgb25lIGZpbHRlclxuXHRcdGZpbHRlcjEuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gVmVyaWZ5IHJlc291cmNlIG1hcmtlcnMgYXJlIHN0aWxsIGZpbHRlcmVkIG91dCBiZWNhdXNlIG9uZSBmaWx0ZXIgcmVtYWluc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDEpOyAvLyBzdGlsbCAxIGluZm8gbWFya2VyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlIH0pLmxlbmd0aCwgMSk7IC8vIHN0aWxsIDEgaW5mbyBtYXJrZXJcblxuXHRcdC8vIERpc3Bvc2UgdGhlIHNlY29uZCBmaWx0ZXJcblx0XHRmaWx0ZXIyLmRpc3Bvc2UoKTtcblxuXHRcdC8vIE5vdyBhbGwgZmlsdGVycyBhcmUgZ29uZSwgc28gbWFya2VycyBzaG91bGQgYmUgdmlzaWJsZSBhZ2FpblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZSBmaWx0ZXIgd2l0aCByZWFzb24gc2hvd3MgaW5mbyBtYXJrZXIgd2hlbiBtYXJrZXJzIGFyZSBmaWx0ZXJlZCcsICgpID0+IHtcblx0XHRzZXJ2aWNlID0gbmV3IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvZmlsZS5jcycpO1xuXG5cdFx0Ly8gQWRkIGVycm9yIGFuZCB3YXJuaW5nIHRvIHRoZSByZXNvdXJjZVxuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdvd25lcjEnLCByZXNvdXJjZSwgW1xuXHRcdFx0cmFuZG9tTWFya2VyRGF0YShNYXJrZXJTZXZlcml0eS5FcnJvciksXG5cdFx0XHRyYW5kb21NYXJrZXJEYXRhKE1hcmtlclNldmVyaXR5Lldhcm5pbmcpXG5cdFx0XSk7XG5cblx0XHQvLyBWZXJpZnkgaW5pdGlhbCBzdGF0ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KS5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gQXBwbHkgYSBmaWx0ZXIgd2l0aCByZWFzb25cblx0XHRjb25zdCBmaWx0ZXJSZWFzb24gPSAnVGVzdCBmaWx0ZXIgcmVhc29uJztcblx0XHRjb25zdCBmaWx0ZXIgPSBzZXJ2aWNlLmluc3RhbGxSZXNvdXJjZUZpbHRlcihyZXNvdXJjZSwgZmlsdGVyUmVhc29uKTtcblxuXHRcdC8vIFZlcmlmeSB0aGF0IHdlIGdldCBhIHNpbmdsZSBpbmZvIG1hcmtlciB3aXRoIG91ciByZWFzb25cblx0XHRjb25zdCBtYXJrZXJzID0gc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuSW5mbyk7XG5cdFx0YXNzZXJ0Lm9rKG1hcmtlcnNbMF0ubWVzc2FnZS5pbmNsdWRlcyhmaWx0ZXJSZWFzb24pKTtcblxuXHRcdC8vIFJlbW92ZSBmaWx0ZXIgYW5kIHZlcmlmeSB0aGUgb3JpZ2luYWwgbWFya2VycyBhcmUgYmFja1xuXHRcdGZpbHRlci5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCh7IHJlc291cmNlIH0pLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRpbmcgYWxsIG1hcmtlcnMgc2hvd3MgaW5mbyBtYXJrZXIgZm9yIGZpbHRlcmVkIHJlc291cmNlcycsICgpID0+IHtcblx0XHRzZXJ2aWNlID0gbmV3IG1hcmtlclNlcnZpY2UuTWFya2VyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wYXRoL2ZpbGUxLmNzJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2UyID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvZmlsZTIuY3MnKTtcblxuXHRcdC8vIEFkZCBtYXJrZXJzIHRvIGJvdGggcmVzb3VyY2VzXG5cdFx0c2VydmljZS5jaGFuZ2VPbmUoJ293bmVyMScsIHJlc291cmNlMSwgW3JhbmRvbU1hcmtlckRhdGEoKV0pO1xuXHRcdHNlcnZpY2UuY2hhbmdlT25lKCdvd25lcjEnLCByZXNvdXJjZTIsIFtyYW5kb21NYXJrZXJEYXRhKCldKTtcblxuXHRcdC8vIFZlcmlmeSBpbml0aWFsIHN0YXRlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMik7XG5cblx0XHQvLyBGaWx0ZXIgb25lIHJlc291cmNlIHdpdGggYSByZWFzb25cblx0XHRjb25zdCBmaWx0ZXJSZWFzb24gPSAnUmVzb3VyY2UgaXMgYmVpbmcgZWRpdGVkJztcblx0XHRjb25zdCBmaWx0ZXIgPSBzZXJ2aWNlLmluc3RhbGxSZXNvdXJjZUZpbHRlcihyZXNvdXJjZTEsIGZpbHRlclJlYXNvbik7XG5cblx0XHQvLyBSZWFkIGFsbCBtYXJrZXJzXG5cdFx0Y29uc3QgYWxsTWFya2VycyA9IHNlcnZpY2UucmVhZCgpO1xuXG5cdFx0Ly8gU2hvdWxkIGhhdmUgMiBtYXJrZXJzIC0gb25lIHJlYWwgbWFya2VyIGFuZCBvbmUgaW5mbyBtYXJrZXJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWxsTWFya2Vycy5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gRmluZCB0aGUgaW5mbyBtYXJrZXJcblx0XHRjb25zdCBpbmZvTWFya2VyID0gYWxsTWFya2Vycy5maW5kKG1hcmtlciA9PlxuXHRcdFx0bWFya2VyLm93bmVyID09PSAnbWFya2Vyc0ZpbHRlcicgJiZcblx0XHRcdG1hcmtlci5zZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuSW5mb1xuXHRcdCk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIGluZm8gbWFya2VyXG5cdFx0YXNzZXJ0Lm9rKGluZm9NYXJrZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZvTWFya2VyPy5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZTEudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0Lm9rKGluZm9NYXJrZXI/Lm1lc3NhZ2UuaW5jbHVkZXMoZmlsdGVyUmVhc29uKSk7XG5cblx0XHQvLyBSZW1vdmUgZmlsdGVyXG5cdFx0ZmlsdGVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnb3V0IG9mIG9yZGVyIGZpbHRlciBkaXNwb3NhbCB3b3JrcyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0c2VydmljZSA9IG5ldyBtYXJrZXJTZXJ2aWNlLk1hcmtlclNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wYXRoL2ZpbGUuY3MnKTtcblxuXHRcdC8vIEFkZCBtYXJrZXIgdG8gcmVzb3VyY2Vcblx0XHRzZXJ2aWNlLmNoYW5nZU9uZSgnb3duZXIxJywgcmVzb3VyY2UsIFtyYW5kb21NYXJrZXJEYXRhKCldKTtcblxuXHRcdC8vIFZlcmlmeSByZXNvdXJjZSBoYXMgbWFya2Vyc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KS5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gSW5zdGFsbCB0aHJlZSBmaWx0ZXJzIGZvciB0aGUgc2FtZSByZXNvdXJjZVxuXHRcdGNvbnN0IGZpbHRlcjEgPSBzZXJ2aWNlLmluc3RhbGxSZXNvdXJjZUZpbHRlcihyZXNvdXJjZSwgJ0ZpcnN0IGZpbHRlcicpO1xuXHRcdGNvbnN0IGZpbHRlcjIgPSBzZXJ2aWNlLmluc3RhbGxSZXNvdXJjZUZpbHRlcihyZXNvdXJjZSwgJ1NlY29uZCBmaWx0ZXInKTtcblx0XHRjb25zdCBmaWx0ZXIzID0gc2VydmljZS5pbnN0YWxsUmVzb3VyY2VGaWx0ZXIocmVzb3VyY2UsICdUaGlyZCBmaWx0ZXInKTtcblxuXHRcdC8vIFZlcmlmeSByZXNvdXJjZSBtYXJrZXJzIGFyZSBmaWx0ZXJlZCBvdXQgYnV0IGluZm8gbWFya2VyIGlzIHNob3duXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMSk7IC8vIDEgaW5mbyBtYXJrZXJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSkubGVuZ3RoLCAxKTsgLy8gMSBpbmZvIG1hcmtlclxuXG5cdFx0Ly8gRGlzcG9zZSBmaWx0ZXJzIGluIGEgZGlmZmVyZW50IG9yZGVyIHRoYW4gdGhleSB3ZXJlIGNyZWF0ZWRcblx0XHRmaWx0ZXIyLmRpc3Bvc2UoKTsgIC8vIFJlbW92ZSB0aGUgc2Vjb25kIGZpbHRlciBmaXJzdFxuXG5cdFx0Ly8gVmVyaWZ5IHJlc291cmNlIG1hcmtlcnMgYXJlIHN0aWxsIGZpbHRlcmVkIG91dCB3aXRoIDIgZmlsdGVycyByZW1haW5pbmdcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5yZWFkKCkubGVuZ3RoLCAxKTsgLy8gc3RpbGwgMSBpbmZvIG1hcmtlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KS5sZW5ndGgsIDEpOyAvLyBzdGlsbCAxIGluZm8gbWFya2VyXG5cblx0XHQvLyBDaGVjayBpZiBtZXNzYWdlIGNvbnRhaW5zIHRoZSBjb3JyZWN0IGNvdW50IG9mIGZpbHRlcnNcblx0XHRjb25zdCBtYXJrZXJzID0gc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSk7XG5cdFx0YXNzZXJ0Lm9rKG1hcmtlcnNbMF0ubWVzc2FnZS5pbmNsdWRlcygnUHJvYmxlbXMgYXJlIHBhdXNlZCBiZWNhdXNlJykpO1xuXG5cdFx0Ly8gUmVtb3ZlIHJlbWFpbmluZyBmaWx0ZXJzIGluIGFueSBvcmRlclxuXHRcdGZpbHRlcjMuZGlzcG9zZSgpO1xuXHRcdGZpbHRlcjEuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gTm93IGFsbCBmaWx0ZXJzIGFyZSBnb25lLCBzbyBtYXJrZXJzIHNob3VsZCBiZSB2aXNpYmxlIGFnYWluXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucmVhZCgpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFs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
