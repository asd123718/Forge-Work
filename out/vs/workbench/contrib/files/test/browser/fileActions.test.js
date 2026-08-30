import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { incrementFileName } from "../../browser/fileActions.js";
suite("Files - Increment file name simple", () => {
  test("Increment file name without any version", function() {
    const name = "test.js";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, "test copy.js");
  });
  test("Increment file name with suffix version", function() {
    const name = "test copy.js";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, "test copy 2.js");
  });
  test("Increment file name with suffix version with leading zeros", function() {
    const name = "test copy 005.js";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, "test copy 6.js");
  });
  test("Increment file name with suffix version, too big number", function() {
    const name = "test copy 9007199254740992.js";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, "test copy 9007199254740992 copy.js");
  });
  test("Increment file name with just version in name", function() {
    const name = "copy.js";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, "copy copy.js");
  });
  test("Increment file name with just version in name, v2", function() {
    const name = "copy 2.js";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, "copy 2 copy.js");
  });
  test("Increment file name without any extension or version", function() {
    const name = "test";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, "test copy");
  });
  test("Increment file name without any extension or version, trailing dot", function() {
    const name = "test.";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, "test copy.");
  });
  test("Increment file name without any extension or version, leading dot", function() {
    const name = ".test";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, ".test copy");
  });
  test("Increment file name without any extension or version, leading dot v2", function() {
    const name = "..test";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, ". copy.test");
  });
  test("Increment file name without any extension but with suffix version", function() {
    const name = "test copy 5";
    const result = incrementFileName(name, false, "simple");
    assert.strictEqual(result, "test copy 6");
  });
  test("Increment folder name without any version", function() {
    const name = "test";
    const result = incrementFileName(name, true, "simple");
    assert.strictEqual(result, "test copy");
  });
  test("Increment folder name with suffix version", function() {
    const name = "test copy";
    const result = incrementFileName(name, true, "simple");
    assert.strictEqual(result, "test copy 2");
  });
  test("Increment folder name with suffix version, leading zeros", function() {
    const name = "test copy 005";
    const result = incrementFileName(name, true, "simple");
    assert.strictEqual(result, "test copy 6");
  });
  test("Increment folder name with suffix version, too big number", function() {
    const name = "test copy 9007199254740992";
    const result = incrementFileName(name, true, "simple");
    assert.strictEqual(result, "test copy 9007199254740992 copy");
  });
  test("Increment folder name with just version in name", function() {
    const name = "copy";
    const result = incrementFileName(name, true, "simple");
    assert.strictEqual(result, "copy copy");
  });
  test("Increment folder name with just version in name, v2", function() {
    const name = "copy 2";
    const result = incrementFileName(name, true, "simple");
    assert.strictEqual(result, "copy 2 copy");
  });
  test('Increment folder name "with extension" but without any version', function() {
    const name = "test.js";
    const result = incrementFileName(name, true, "simple");
    assert.strictEqual(result, "test.js copy");
  });
  test('Increment folder name "with extension" and with suffix version', function() {
    const name = "test.js copy 5";
    const result = incrementFileName(name, true, "simple");
    assert.strictEqual(result, "test.js copy 6");
  });
  test("Increment file/folder name with suffix version, special case 1", function() {
    const name = "test copy 0";
    const result = incrementFileName(name, true, "simple");
    assert.strictEqual(result, "test copy");
  });
  test("Increment file/folder name with suffix version, special case 2", function() {
    const name = "test copy 1";
    const result = incrementFileName(name, true, "simple");
    assert.strictEqual(result, "test copy 2");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
suite("Files - Increment file name smart", () => {
  test("Increment file name without any version", function() {
    const name = "test.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "test.1.js");
  });
  test("Increment folder name without any version", function() {
    const name = "test";
    const result = incrementFileName(name, true, "smart");
    assert.strictEqual(result, "test.1");
  });
  test("Increment file name with suffix version", function() {
    const name = "test.1.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "test.2.js");
  });
  test("Increment file name with suffix version with trailing zeros", function() {
    const name = "test.001.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "test.002.js");
  });
  test("Increment file name with suffix version with trailing zeros, changing length", function() {
    const name = "test.009.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "test.010.js");
  });
  test("Increment file name with suffix version with `-` as separator", function() {
    const name = "test-1.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "test-2.js");
  });
  test("Increment file name with suffix version with `-` as separator, trailing zeros", function() {
    const name = "test-001.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "test-002.js");
  });
  test("Increment file name with suffix version with `-` as separator, trailing zeros, changnig length", function() {
    const name = "test-099.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "test-100.js");
  });
  test("Increment file name with suffix version with `_` as separator", function() {
    const name = "test_1.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "test_2.js");
  });
  test("Increment folder name with suffix version", function() {
    const name = "test.1";
    const result = incrementFileName(name, true, "smart");
    assert.strictEqual(result, "test.2");
  });
  test("Increment folder name with suffix version, trailing zeros", function() {
    const name = "test.001";
    const result = incrementFileName(name, true, "smart");
    assert.strictEqual(result, "test.002");
  });
  test("Increment folder name with suffix version with `-` as separator", function() {
    const name = "test-1";
    const result = incrementFileName(name, true, "smart");
    assert.strictEqual(result, "test-2");
  });
  test("Increment folder name with suffix version with `_` as separator", function() {
    const name = "test_1";
    const result = incrementFileName(name, true, "smart");
    assert.strictEqual(result, "test_2");
  });
  test("Increment file name with suffix version, too big number", function() {
    const name = "test.9007199254740992.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "test.9007199254740992.1.js");
  });
  test("Increment folder name with suffix version, too big number", function() {
    const name = "test.9007199254740992";
    const result = incrementFileName(name, true, "smart");
    assert.strictEqual(result, "test.9007199254740992.1");
  });
  test("Increment file name with prefix version", function() {
    const name = "1.test.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "2.test.js");
  });
  test("Increment file name with just version in name", function() {
    const name = "1.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "2.js");
  });
  test("Increment file name with just version in name, too big number", function() {
    const name = "9007199254740992.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "9007199254740992.1.js");
  });
  test("Increment file name with prefix version, trailing zeros", function() {
    const name = "001.test.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "002.test.js");
  });
  test("Increment file name with prefix version with `-` as separator", function() {
    const name = "1-test.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "2-test.js");
  });
  test("Increment file name with prefix version with `_` as separator", function() {
    const name = "1_test.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "2_test.js");
  });
  test("Increment file name with prefix version, too big number", function() {
    const name = "9007199254740992.test.js";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "9007199254740992.test.1.js");
  });
  test("Increment file name with just version and no extension", function() {
    const name = "001004";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "001005");
  });
  test("Increment file name with just version and no extension, too big number", function() {
    const name = "9007199254740992";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "9007199254740992.1");
  });
  test("Increment file name with no extension and no version", function() {
    const name = "file";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "file1");
  });
  test("Increment file name with no extension", function() {
    const name = "file1";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "file2");
  });
  test("Increment file name with no extension, too big number", function() {
    const name = "file9007199254740992";
    const result = incrementFileName(name, false, "smart");
    assert.strictEqual(result, "file9007199254740992.1");
  });
  test("Increment folder name with prefix version", function() {
    const name = "1.test";
    const result = incrementFileName(name, true, "smart");
    assert.strictEqual(result, "2.test");
  });
  test("Increment folder name with prefix version, too big number", function() {
    const name = "9007199254740992.test";
    const result = incrementFileName(name, true, "smart");
    assert.strictEqual(result, "9007199254740992.test.1");
  });
  test("Increment folder name with prefix version, trailing zeros", function() {
    const name = "001.test";
    const result = incrementFileName(name, true, "smart");
    assert.strictEqual(result, "002.test");
  });
  test("Increment folder name with prefix version  with `-` as separator", function() {
    const name = "1-test";
    const result = incrementFileName(name, true, "smart");
    assert.strictEqual(result, "2-test");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFx0ZXN0XFxicm93c2VyXFxmaWxlQWN0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBpbmNyZW1lbnRGaWxlTmFtZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZmlsZUFjdGlvbnMuanMnO1xuXG5zdWl0ZSgnRmlsZXMgLSBJbmNyZW1lbnQgZmlsZSBuYW1lIHNpbXBsZScsICgpID0+IHtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGhvdXQgYW55IHZlcnNpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICd0ZXN0LmpzJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NpbXBsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0IGNvcHkuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRoIHN1ZmZpeCB2ZXJzaW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdCBjb3B5LmpzJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NpbXBsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0IGNvcHkgMi5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGggc3VmZml4IHZlcnNpb24gd2l0aCBsZWFkaW5nIHplcm9zJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdCBjb3B5IDAwNS5qcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzaW1wbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAndGVzdCBjb3B5IDYuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRoIHN1ZmZpeCB2ZXJzaW9uLCB0b28gYmlnIG51bWJlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ3Rlc3QgY29weSA5MDA3MTk5MjU0NzQwOTkyLmpzJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NpbXBsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0IGNvcHkgOTAwNzE5OTI1NDc0MDk5MiBjb3B5LmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmaWxlIG5hbWUgd2l0aCBqdXN0IHZlcnNpb24gaW4gbmFtZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ2NvcHkuanMnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIGZhbHNlLCAnc2ltcGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ2NvcHkgY29weS5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGgganVzdCB2ZXJzaW9uIGluIG5hbWUsIHYyJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAnY29weSAyLmpzJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NpbXBsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdjb3B5IDIgY29weS5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGhvdXQgYW55IGV4dGVuc2lvbiBvciB2ZXJzaW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdCc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzaW1wbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAndGVzdCBjb3B5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmaWxlIG5hbWUgd2l0aG91dCBhbnkgZXh0ZW5zaW9uIG9yIHZlcnNpb24sIHRyYWlsaW5nIGRvdCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ3Rlc3QuJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NpbXBsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0IGNvcHkuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmaWxlIG5hbWUgd2l0aG91dCBhbnkgZXh0ZW5zaW9uIG9yIHZlcnNpb24sIGxlYWRpbmcgZG90JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAnLnRlc3QnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIGZhbHNlLCAnc2ltcGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJy50ZXN0IGNvcHknKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRob3V0IGFueSBleHRlbnNpb24gb3IgdmVyc2lvbiwgbGVhZGluZyBkb3QgdjInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICcuLnRlc3QnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIGZhbHNlLCAnc2ltcGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJy4gY29weS50ZXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmaWxlIG5hbWUgd2l0aG91dCBhbnkgZXh0ZW5zaW9uIGJ1dCB3aXRoIHN1ZmZpeCB2ZXJzaW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdCBjb3B5IDUnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIGZhbHNlLCAnc2ltcGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ3Rlc3QgY29weSA2Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmb2xkZXIgbmFtZSB3aXRob3V0IGFueSB2ZXJzaW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdCc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgdHJ1ZSwgJ3NpbXBsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0IGNvcHknKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGggc3VmZml4IHZlcnNpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICd0ZXN0IGNvcHknO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIHRydWUsICdzaW1wbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAndGVzdCBjb3B5IDInKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGggc3VmZml4IHZlcnNpb24sIGxlYWRpbmcgemVyb3MnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICd0ZXN0IGNvcHkgMDA1Jztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCB0cnVlLCAnc2ltcGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ3Rlc3QgY29weSA2Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmb2xkZXIgbmFtZSB3aXRoIHN1ZmZpeCB2ZXJzaW9uLCB0b28gYmlnIG51bWJlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ3Rlc3QgY29weSA5MDA3MTk5MjU0NzQwOTkyJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCB0cnVlLCAnc2ltcGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ3Rlc3QgY29weSA5MDA3MTk5MjU0NzQwOTkyIGNvcHknKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGgganVzdCB2ZXJzaW9uIGluIG5hbWUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICdjb3B5Jztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCB0cnVlLCAnc2ltcGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ2NvcHkgY29weScpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZm9sZGVyIG5hbWUgd2l0aCBqdXN0IHZlcnNpb24gaW4gbmFtZSwgdjInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICdjb3B5IDInO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIHRydWUsICdzaW1wbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnY29weSAyIGNvcHknKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIFwid2l0aCBleHRlbnNpb25cIiBidXQgd2l0aG91dCBhbnkgdmVyc2lvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ3Rlc3QuanMnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIHRydWUsICdzaW1wbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAndGVzdC5qcyBjb3B5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmb2xkZXIgbmFtZSBcIndpdGggZXh0ZW5zaW9uXCIgYW5kIHdpdGggc3VmZml4IHZlcnNpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICd0ZXN0LmpzIGNvcHkgNSc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgdHJ1ZSwgJ3NpbXBsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0LmpzIGNvcHkgNicpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZS9mb2xkZXIgbmFtZSB3aXRoIHN1ZmZpeCB2ZXJzaW9uLCBzcGVjaWFsIGNhc2UgMScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ3Rlc3QgY29weSAwJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCB0cnVlLCAnc2ltcGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ3Rlc3QgY29weScpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZS9mb2xkZXIgbmFtZSB3aXRoIHN1ZmZpeCB2ZXJzaW9uLCBzcGVjaWFsIGNhc2UgMicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ3Rlc3QgY29weSAxJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCB0cnVlLCAnc2ltcGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ3Rlc3QgY29weSAyJyk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG5cbnN1aXRlKCdGaWxlcyAtIEluY3JlbWVudCBmaWxlIG5hbWUgc21hcnQnLCAoKSA9PiB7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRob3V0IGFueSB2ZXJzaW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdC5qcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0LjEuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGhvdXQgYW55IHZlcnNpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICd0ZXN0Jztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCB0cnVlLCAnc21hcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAndGVzdC4xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmaWxlIG5hbWUgd2l0aCBzdWZmaXggdmVyc2lvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ3Rlc3QuMS5qcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0LjIuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRoIHN1ZmZpeCB2ZXJzaW9uIHdpdGggdHJhaWxpbmcgemVyb3MnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICd0ZXN0LjAwMS5qcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0LjAwMi5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGggc3VmZml4IHZlcnNpb24gd2l0aCB0cmFpbGluZyB6ZXJvcywgY2hhbmdpbmcgbGVuZ3RoJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdC4wMDkuanMnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIGZhbHNlLCAnc21hcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAndGVzdC4wMTAuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRoIHN1ZmZpeCB2ZXJzaW9uIHdpdGggYC1gIGFzIHNlcGFyYXRvcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ3Rlc3QtMS5qcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0LTIuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRoIHN1ZmZpeCB2ZXJzaW9uIHdpdGggYC1gIGFzIHNlcGFyYXRvciwgdHJhaWxpbmcgemVyb3MnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICd0ZXN0LTAwMS5qcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0LTAwMi5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGggc3VmZml4IHZlcnNpb24gd2l0aCBgLWAgYXMgc2VwYXJhdG9yLCB0cmFpbGluZyB6ZXJvcywgY2hhbmduaWcgbGVuZ3RoJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdC0wOTkuanMnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIGZhbHNlLCAnc21hcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAndGVzdC0xMDAuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRoIHN1ZmZpeCB2ZXJzaW9uIHdpdGggYF9gIGFzIHNlcGFyYXRvcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ3Rlc3RfMS5qcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0XzIuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGggc3VmZml4IHZlcnNpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICd0ZXN0LjEnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIHRydWUsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0LjInKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGggc3VmZml4IHZlcnNpb24sIHRyYWlsaW5nIHplcm9zJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdC4wMDEnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIHRydWUsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0LjAwMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZm9sZGVyIG5hbWUgd2l0aCBzdWZmaXggdmVyc2lvbiB3aXRoIGAtYCBhcyBzZXBhcmF0b3InLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICd0ZXN0LTEnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIHRydWUsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICd0ZXN0LTInKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGggc3VmZml4IHZlcnNpb24gd2l0aCBgX2AgYXMgc2VwYXJhdG9yJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdF8xJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCB0cnVlLCAnc21hcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAndGVzdF8yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmaWxlIG5hbWUgd2l0aCBzdWZmaXggdmVyc2lvbiwgdG9vIGJpZyBudW1iZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICd0ZXN0LjkwMDcxOTkyNTQ3NDA5OTIuanMnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIGZhbHNlLCAnc21hcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAndGVzdC45MDA3MTk5MjU0NzQwOTkyLjEuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGggc3VmZml4IHZlcnNpb24sIHRvbyBiaWcgbnVtYmVyJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAndGVzdC45MDA3MTk5MjU0NzQwOTkyJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCB0cnVlLCAnc21hcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAndGVzdC45MDA3MTk5MjU0NzQwOTkyLjEnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRoIHByZWZpeCB2ZXJzaW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAnMS50ZXN0LmpzJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NtYXJ0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJzIudGVzdC5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGgganVzdCB2ZXJzaW9uIGluIG5hbWUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICcxLmpzJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NtYXJ0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJzIuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRoIGp1c3QgdmVyc2lvbiBpbiBuYW1lLCB0b28gYmlnIG51bWJlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJzkwMDcxOTkyNTQ3NDA5OTIuanMnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIGZhbHNlLCAnc21hcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnOTAwNzE5OTI1NDc0MDk5Mi4xLmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmaWxlIG5hbWUgd2l0aCBwcmVmaXggdmVyc2lvbiwgdHJhaWxpbmcgemVyb3MnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICcwMDEudGVzdC5qcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICcwMDIudGVzdC5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGggcHJlZml4IHZlcnNpb24gd2l0aCBgLWAgYXMgc2VwYXJhdG9yJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAnMS10ZXN0LmpzJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NtYXJ0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJzItdGVzdC5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGggcHJlZml4IHZlcnNpb24gd2l0aCBgX2AgYXMgc2VwYXJhdG9yJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAnMV90ZXN0LmpzJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NtYXJ0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJzJfdGVzdC5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGggcHJlZml4IHZlcnNpb24sIHRvbyBiaWcgbnVtYmVyJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAnOTAwNzE5OTI1NDc0MDk5Mi50ZXN0LmpzJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NtYXJ0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJzkwMDcxOTkyNTQ3NDA5OTIudGVzdC4xLmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmaWxlIG5hbWUgd2l0aCBqdXN0IHZlcnNpb24gYW5kIG5vIGV4dGVuc2lvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJzAwMTAwNCc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICcwMDEwMDUnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZpbGUgbmFtZSB3aXRoIGp1c3QgdmVyc2lvbiBhbmQgbm8gZXh0ZW5zaW9uLCB0b28gYmlnIG51bWJlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJzkwMDcxOTkyNTQ3NDA5OTInO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIGZhbHNlLCAnc21hcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnOTAwNzE5OTI1NDc0MDk5Mi4xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmaWxlIG5hbWUgd2l0aCBubyBleHRlbnNpb24gYW5kIG5vIHZlcnNpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICdmaWxlJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NtYXJ0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ2ZpbGUxJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luY3JlbWVudCBmaWxlIG5hbWUgd2l0aCBubyBleHRlbnNpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICdmaWxlMSc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gaW5jcmVtZW50RmlsZU5hbWUobmFtZSwgZmFsc2UsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdmaWxlMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZmlsZSBuYW1lIHdpdGggbm8gZXh0ZW5zaW9uLCB0b28gYmlnIG51bWJlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBuYW1lID0gJ2ZpbGU5MDA3MTk5MjU0NzQwOTkyJztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCBmYWxzZSwgJ3NtYXJ0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ2ZpbGU5MDA3MTk5MjU0NzQwOTkyLjEnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGggcHJlZml4IHZlcnNpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbmFtZSA9ICcxLnRlc3QnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIHRydWUsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICcyLnRlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGggcHJlZml4IHZlcnNpb24sIHRvbyBiaWcgbnVtYmVyJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAnOTAwNzE5OTI1NDc0MDk5Mi50ZXN0Jztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCB0cnVlLCAnc21hcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnOTAwNzE5OTI1NDc0MDk5Mi50ZXN0LjEnKTtcblx0fSk7XG5cblx0dGVzdCgnSW5jcmVtZW50IGZvbGRlciBuYW1lIHdpdGggcHJlZml4IHZlcnNpb24sIHRyYWlsaW5nIHplcm9zJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAnMDAxLnRlc3QnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGluY3JlbWVudEZpbGVOYW1lKG5hbWUsIHRydWUsICdzbWFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICcwMDIudGVzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbmNyZW1lbnQgZm9sZGVyIG5hbWUgd2l0aCBwcmVmaXggdmVyc2lvbiAgd2l0aCBgLWAgYXMgc2VwYXJhdG9yJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5hbWUgPSAnMS10ZXN0Jztcblx0XHRjb25zdCByZXN1bHQgPSBpbmNyZW1lbnRGaWxlTmFtZShuYW1lLCB0cnVlLCAnc21hcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnMi10ZXN0Jyk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSxzQ0FBc0MsTUFBTTtBQUVqRCxPQUFLLDJDQUEyQyxXQUFZO0FBQzNELFVBQU0sT0FBTztBQUNiLFVBQU0sU0FBUyxrQkFBa0IsTUFBTSxPQUFPLFFBQVE7QUFDdEQsV0FBTyxZQUFZLFFBQVEsY0FBYztBQUFBLEVBQzFDLENBQUM7QUFFRCxPQUFLLDJDQUEyQyxXQUFZO0FBQzNELFVBQU0sT0FBTztBQUNiLFVBQU0sU0FBUyxrQkFBa0IsTUFBTSxPQUFPLFFBQVE7QUFDdEQsV0FBTyxZQUFZLFFBQVEsZ0JBQWdCO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUssOERBQThELFdBQVk7QUFDOUUsVUFBTSxPQUFPO0FBQ2IsVUFBTSxTQUFTLGtCQUFrQixNQUFNLE9BQU8sUUFBUTtBQUN0RCxXQUFPLFlBQVksUUFBUSxnQkFBZ0I7QUFB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
