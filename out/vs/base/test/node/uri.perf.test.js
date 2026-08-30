import assert from "assert";
import { readFileSync } from "fs";
import { FileAccess } from "../../common/network.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("URI - perf", function() {
  if (1) {
    return;
  }
  ensureNoDisposablesAreLeakedInTestSuite();
  let manyFileUris;
  setup(function() {
    manyFileUris = [];
    const data = readFileSync(FileAccess.asFileUri("vs/base/test/node/uri.perf.data.txt").fsPath).toString();
    const lines = data.split("\n");
    for (const line of lines) {
      manyFileUris.push(URI.file(line));
    }
  });
  function perfTest(name, callback) {
    test(name, (_done) => {
      const t1 = Date.now();
      callback();
      const d = Date.now() - t1;
      console.log(`${name} took ${d}ms (${(d / manyFileUris.length).toPrecision(3)} ms/uri) (${manyFileUris.length} uris)`);
      _done();
    });
  }
  perfTest("toString", function() {
    for (const uri of manyFileUris) {
      const data = uri.toString();
      assert.ok(data);
    }
  });
  perfTest("toString(skipEncoding)", function() {
    for (const uri of manyFileUris) {
      const data = uri.toString(true);
      assert.ok(data);
    }
  });
  perfTest("fsPath", function() {
    for (const uri of manyFileUris) {
      const data = uri.fsPath;
      assert.ok(data);
    }
  });
  perfTest("toJSON", function() {
    for (const uri of manyFileUris) {
      const data = uri.toJSON();
      assert.ok(data);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxub2RlXFx1cmkucGVyZi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgcmVhZEZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ1VSSSAtIHBlcmYnLCBmdW5jdGlvbiAoKSB7XG5cblx0Ly8gQ09NTUVOVCBUSElTIE9VVCBUTyBSVU4gVEVTVFxuXHRpZiAoMSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBtYW55RmlsZVVyaXM6IFVSSVtdO1xuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0bWFueUZpbGVVcmlzID0gW107XG5cdFx0Y29uc3QgZGF0YSA9IHJlYWRGaWxlU3luYyhGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvYmFzZS90ZXN0L25vZGUvdXJpLnBlcmYuZGF0YS50eHQnKS5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgbGluZXMgPSBkYXRhLnNwbGl0KCdcXG4nKTtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdG1hbnlGaWxlVXJpcy5wdXNoKFVSSS5maWxlKGxpbmUpKTtcblx0XHR9XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHBlcmZUZXN0KG5hbWU6IHN0cmluZywgY2FsbGJhY2s6IEZ1bmN0aW9uKSB7XG5cdFx0dGVzdChuYW1lLCBfZG9uZSA9PiB7XG5cdFx0XHRjb25zdCB0MSA9IERhdGUubm93KCk7XG5cdFx0XHRjYWxsYmFjaygpO1xuXHRcdFx0Y29uc3QgZCA9IERhdGUubm93KCkgLSB0MTtcblx0XHRcdGNvbnNvbGUubG9nKGAke25hbWV9IHRvb2sgJHtkfW1zICgkeyhkIC8gbWFueUZpbGVVcmlzLmxlbmd0aCkudG9QcmVjaXNpb24oMyl9IG1zL3VyaSkgKCR7bWFueUZpbGVVcmlzLmxlbmd0aH0gdXJpcylgKTtcblx0XHRcdF9kb25lKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwZXJmVGVzdCgndG9TdHJpbmcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgbWFueUZpbGVVcmlzKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRhc3NlcnQub2soZGF0YSk7XG5cdFx0fVxuXHR9KTtcblxuXHRwZXJmVGVzdCgndG9TdHJpbmcoc2tpcEVuY29kaW5nKScsIGZ1bmN0aW9uICgpIHtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiBtYW55RmlsZVVyaXMpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB1cmkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRhc3NlcnQub2soZGF0YSk7XG5cdFx0fVxuXHR9KTtcblxuXHRwZXJmVGVzdCgnZnNQYXRoJywgZnVuY3Rpb24gKCkge1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIG1hbnlGaWxlVXJpcykge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHVyaS5mc1BhdGg7XG5cdFx0XHRhc3NlcnQub2soZGF0YSk7XG5cdFx0fVxuXHR9KTtcblxuXHRwZXJmVGVzdCgndG9KU09OJywgZnVuY3Rpb24gKCkge1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIG1hbnlGaWxlVXJpcykge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHVyaS50b0pTT04oKTtcblx0XHRcdGFzc2VydC5vayhkYXRhKTtcblx0XHR9XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxjQUFjLFdBQVk7QUFHL0IsTUFBSSxHQUFHO0FBQ047QUFBQSxFQUNEO0FBRUEsMENBQXdDO0FBRXhDLE1BQUk7QUFDSixRQUFNLFdBQVk7QUFDakIsbUJBQWUsQ0FBQztBQUNoQixVQUFNLE9BQU8sYUFBYSxXQUFXLFVBQVUscUNBQXFDLEVBQUUsTUFBTSxFQUFFLFNBQVM7QUFDdkcsVUFBTSxRQUFRLEtBQUssTUFBTSxJQUFJO0FBQzdCLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLG1CQUFhLEtBQUssSUFBSSxLQUFLLElBQUksQ0FBQztBQUFBLElBQ2pDO0FBQUEsRUFDRCxDQUFDO0FBRUQsV0FBUyxTQUFTLE1BQWMsVUFBb0I7QUFDbkQsU0FBSyxNQUFNLFdBQVM7QUFDbkIsWUFBTSxLQUFLLEtBQUssSUFBSTtBQUNwQixlQUFTO0FBQ1QsWUFBTSxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQ3ZCLGNBQVEsSUFBSSxHQUFHLElBQUksU0FBUyxDQUFDLFFBQVEsSUFBSSxhQUFhLFFBQVEsWUFBWSxDQUFDLENBQUMsYUFBYSxhQUFhLE1BQU0sUUFBUTtBQUNwSCxZQUFNO0FBQUEsSUFDUCxDQUFDO0FBQUEsRUFDRjtBQUVBLFdBQVMsWUFBWSxXQUFZO0FBQ2hDLGVBQVcsT0FBTyxjQUFjO0FBQy9CLFlBQU0sT0FBTyxJQUFJLFNBQVM7QUFDMUIsYUFBTyxHQUFHLElBQUk7QUFBQSxJQUNmO0FBQUEsRUFDRCxDQUFDO0FBRUQsV0FBUywwQkFBMEIsV0FBWTtBQUM5QyxlQUFXLE9BQU8sY0FBYztBQUMvQixZQUFNLE9BQU8sSUFBSSxTQUFTLElBQUk7QUFDOUIsYUFBTyxHQUFHLElBQUk7QUFBQSxJQUNmO0FBQUEsRUFDRCxDQUFDO0FBRUQsV0FBUyxVQUFVLFdBQVk7QUFDOUIsZUFBVyxPQUFPLGNBQWM7QUFDL0IsWUFBTSxPQUFPLElBQUk7QUFDakIsYUFBTyxHQUFHLElBQUk7QUFBQSxJQUNmO0FBQUEsRUFDRCxDQUFDO0FBRUQsV0FBUyxVQUFVLFdBQVk7QUFDOUIsZUFBVyxPQUFPLGNBQWM7QUFDL0IsWUFBTSxPQUFPLElBQUksT0FBTztBQUN4QixhQUFPLEdBQUcsSUFBSTtBQUFBLElBQ2Y7QUFBQSxFQUNELENBQUM7QUFFRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
