import assert from "assert";
import { parse, stripComments } from "../../common/jsonc.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("JSON Parse", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Line comment", () => {
    const content = [
      "{",
      '  "prop": 10 // a comment',
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "prop": 10 ',
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Line comment - EOF", () => {
    const content = [
      "{",
      "}",
      "// a comment"
    ].join("\n");
    const expected = [
      "{",
      "}",
      ""
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Line comment - \\r\\n", () => {
    const content = [
      "{",
      '  "prop": 10 // a comment',
      "}"
    ].join("\r\n");
    const expected = [
      "{",
      '  "prop": 10 ',
      "}"
    ].join("\r\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Line comment - EOF - \\r\\n", () => {
    const content = [
      "{",
      "}",
      "// a comment"
    ].join("\r\n");
    const expected = [
      "{",
      "}",
      ""
    ].join("\r\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Block comment - single line", () => {
    const content = [
      "{",
      '  /* before */"prop": 10/* after */',
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "prop": 10',
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Block comment - multi line", () => {
    const content = [
      "{",
      "  /**",
      "   * Some comment",
      "   */",
      '  "prop": 10',
      "}"
    ].join("\n");
    const expected = [
      "{",
      "  ",
      '  "prop": 10',
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Block comment - shortest match", () => {
    const content = "/* abc */ */";
    const expected = " */";
    assert.strictEqual(stripComments(content), expected);
  });
  test("No strings - double quote", () => {
    const content = [
      "{",
      '  "/* */": 10',
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "/* */": 10',
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("No strings - single quote", () => {
    const content = [
      "{",
      `  '/* */': 10`,
      "}"
    ].join("\n");
    const expected = [
      "{",
      `  '/* */': 10`,
      "}"
    ].join("\n");
    assert.strictEqual(stripComments(content), expected);
  });
  test("Trailing comma in object", () => {
    const content = [
      "{",
      `  "a": 10,`,
      "}"
    ].join("\n");
    const expected = [
      "{",
      `  "a": 10`,
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Trailing comma in array", () => {
    const content = [
      `[ "a", "b", "c", ]`
    ].join("\n");
    const expected = [
      `[ "a", "b", "c" ]`
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Trailing comma", () => {
    const content = [
      "{",
      '  "propA": 10, // a comment',
      '  "propB": false, // a trailing comma',
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "propA": 10,',
      '  "propB": false',
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Trailing comma - EOF", () => {
    const content = `
// This configuration file allows you to pass permanent command line arguments to VS Code.
// Only a subset of arguments is currently supported to reduce the likelihood of breaking
// the installation.
//
// PLEASE DO NOT CHANGE WITHOUT UNDERSTANDING THE IMPACT
//
// NOTE: Changing this file requires a restart of VS Code.
{
	// Use software rendering instead of hardware accelerated rendering.
	// This can help in cases where you see rendering issues in VS Code.
	// "disable-hardware-acceleration": true,
	// Allows to disable crash reporting.
	// Should restart the app if the value is changed.
	"enable-crash-reporter": true,
	// Unique id used for correlating crash reports sent from this instance.
	// Do not edit this value.
	"crash-reporter-id": "aaaaab31-7453-4506-97d0-93411b2c21c7",
	"locale": "en",
	// "log-level": "trace"
}
`;
    assert.deepEqual(parse(content), {
      "enable-crash-reporter": true,
      "crash-reporter-id": "aaaaab31-7453-4506-97d0-93411b2c21c7",
      "locale": "en"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGpzb25QYXJzZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcblxuaW1wb3J0IHsgcGFyc2UsIHN0cmlwQ29tbWVudHMgfSBmcm9tICcuLi8uLi9jb21tb24vanNvbmMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdKU09OIFBhcnNlJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdMaW5lIGNvbW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudDogc3RyaW5nID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJwcm9wXCI6IDEwIC8vIGEgY29tbWVudCcsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwicHJvcFwiOiAxMCAnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChwYXJzZShjb250ZW50KSwgSlNPTi5wYXJzZShleHBlY3RlZCkpO1xuXHR9KTtcblx0dGVzdCgnTGluZSBjb21tZW50IC0gRU9GJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCd9Jyxcblx0XHRcdCcvLyBhIGNvbW1lbnQnXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCd9Jyxcblx0XHRcdCcnXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHBhcnNlKGNvbnRlbnQpLCBKU09OLnBhcnNlKGV4cGVjdGVkKSk7XG5cdH0pO1xuXHR0ZXN0KCdMaW5lIGNvbW1lbnQgLSBcXFxcclxcXFxuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwicHJvcFwiOiAxMCAvLyBhIGNvbW1lbnQnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxyXFxuJyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnICBcInByb3BcIjogMTAgJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcclxcbicpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocGFyc2UoY29udGVudCksIEpTT04ucGFyc2UoZXhwZWN0ZWQpKTtcblx0fSk7XG5cdHRlc3QoJ0xpbmUgY29tbWVudCAtIEVPRiAtIFxcXFxyXFxcXG4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudDogc3RyaW5nID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0J30nLFxuXHRcdFx0Jy8vIGEgY29tbWVudCdcblx0XHRdLmpvaW4oJ1xcclxcbicpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0J30nLFxuXHRcdFx0Jydcblx0XHRdLmpvaW4oJ1xcclxcbicpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocGFyc2UoY29udGVudCksIEpTT04ucGFyc2UoZXhwZWN0ZWQpKTtcblx0fSk7XG5cdHRlc3QoJ0Jsb2NrIGNvbW1lbnQgLSBzaW5nbGUgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50OiBzdHJpbmcgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnICAvKiBiZWZvcmUgKi9cInByb3BcIjogMTAvKiBhZnRlciAqLycsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwicHJvcFwiOiAxMCcsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHBhcnNlKGNvbnRlbnQpLCBKU09OLnBhcnNlKGV4cGVjdGVkKSk7XG5cdH0pO1xuXHR0ZXN0KCdCbG9jayBjb21tZW50IC0gbXVsdGkgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50OiBzdHJpbmcgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnICAvKionLFxuXHRcdFx0JyAgICogU29tZSBjb21tZW50Jyxcblx0XHRcdCcgICAqLycsXG5cdFx0XHQnICBcInByb3BcIjogMTAnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnICAnLFxuXHRcdFx0JyAgXCJwcm9wXCI6IDEwJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocGFyc2UoY29udGVudCksIEpTT04ucGFyc2UoZXhwZWN0ZWQpKTtcblx0fSk7XG5cdHRlc3QoJ0Jsb2NrIGNvbW1lbnQgLSBzaG9ydGVzdCBtYXRjaCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJy8qIGFiYyAqLyAqLyc7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSAnICovJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaXBDb21tZW50cyhjb250ZW50KSwgZXhwZWN0ZWQpO1xuXHR9KTtcblx0dGVzdCgnTm8gc3RyaW5ncyAtIGRvdWJsZSBxdW90ZScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50OiBzdHJpbmcgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnICBcIi8qICovXCI6IDEwJyxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwiLyogKi9cIjogMTAnLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHBhcnNlKGNvbnRlbnQpLCBKU09OLnBhcnNlKGV4cGVjdGVkKSk7XG5cdH0pO1xuXHR0ZXN0KCdObyBzdHJpbmdzIC0gc2luZ2xlIHF1b3RlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdGAgICcvKiAqLyc6IDEwYCxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdGAgICcvKiAqLyc6IDEwYCxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmlwQ29tbWVudHMoY29udGVudCksIGV4cGVjdGVkKTtcblx0fSk7XG5cdHRlc3QoJ1RyYWlsaW5nIGNvbW1hIGluIG9iamVjdCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50OiBzdHJpbmcgPSBbXG5cdFx0XHQneycsXG5cdFx0XHRgICBcImFcIjogMTAsYCxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdGAgIFwiYVwiOiAxMGAsXG5cdFx0XHQnfSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocGFyc2UoY29udGVudCksIEpTT04ucGFyc2UoZXhwZWN0ZWQpKTtcblx0fSk7XG5cdHRlc3QoJ1RyYWlsaW5nIGNvbW1hIGluIGFycmF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdGBbIFwiYVwiLCBcImJcIiwgXCJjXCIsIF1gXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBleHBlY3RlZDogc3RyaW5nID0gW1xuXHRcdFx0YFsgXCJhXCIsIFwiYlwiLCBcImNcIiBdYFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChwYXJzZShjb250ZW50KSwgSlNPTi5wYXJzZShleHBlY3RlZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdUcmFpbGluZyBjb21tYScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50OiBzdHJpbmcgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnICBcInByb3BBXCI6IDEwLCAvLyBhIGNvbW1lbnQnLFxuXHRcdFx0JyAgXCJwcm9wQlwiOiBmYWxzZSwgLy8gYSB0cmFpbGluZyBjb21tYScsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwicHJvcEFcIjogMTAsJyxcblx0XHRcdCcgIFwicHJvcEJcIjogZmFsc2UnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChwYXJzZShjb250ZW50KSwgSlNPTi5wYXJzZShleHBlY3RlZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdUcmFpbGluZyBjb21tYSAtIEVPRicsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYFxuLy8gVGhpcyBjb25maWd1cmF0aW9uIGZpbGUgYWxsb3dzIHlvdSB0byBwYXNzIHBlcm1hbmVudCBjb21tYW5kIGxpbmUgYXJndW1lbnRzIHRvIFZTIENvZGUuXG4vLyBPbmx5IGEgc3Vic2V0IG9mIGFyZ3VtZW50cyBpcyBjdXJyZW50bHkgc3VwcG9ydGVkIHRvIHJlZHVjZSB0aGUgbGlrZWxpaG9vZCBvZiBicmVha2luZ1xuLy8gdGhlIGluc3RhbGxhdGlvbi5cbi8vXG4vLyBQTEVBU0UgRE8gTk9UIENIQU5HRSBXSVRIT1VUIFVOREVSU1RBTkRJTkcgVEhFIElNUEFDVFxuLy9cbi8vIE5PVEU6IENoYW5naW5nIHRoaXMgZmlsZSByZXF1aXJlcyBhIHJlc3RhcnQgb2YgVlMgQ29kZS5cbntcblx0Ly8gVXNlIHNvZnR3YXJlIHJlbmRlcmluZyBpbnN0ZWFkIG9mIGhhcmR3YXJlIGFjY2VsZXJhdGVkIHJlbmRlcmluZy5cblx0Ly8gVGhpcyBjYW4gaGVscCBpbiBjYXNlcyB3aGVyZSB5b3Ugc2VlIHJlbmRlcmluZyBpc3N1ZXMgaW4gVlMgQ29kZS5cblx0Ly8gXCJkaXNhYmxlLWhhcmR3YXJlLWFjY2VsZXJhdGlvblwiOiB0cnVlLFxuXHQvLyBBbGxvd3MgdG8gZGlzYWJsZSBjcmFzaCByZXBvcnRpbmcuXG5cdC8vIFNob3VsZCByZXN0YXJ0IHRoZSBhcHAgaWYgdGhlIHZhbHVlIGlzIGNoYW5nZWQuXG5cdFwiZW5hYmxlLWNyYXNoLXJlcG9ydGVyXCI6IHRydWUsXG5cdC8vIFVuaXF1ZSBpZCB1c2VkIGZvciBjb3JyZWxhdGluZyBjcmFzaCByZXBvcnRzIHNlbnQgZnJvbSB0aGlzIGluc3RhbmNlLlxuXHQvLyBEbyBub3QgZWRpdCB0aGlzIHZhbHVlLlxuXHRcImNyYXNoLXJlcG9ydGVyLWlkXCI6IFwiYWFhYWFiMzEtNzQ1My00NTA2LTk3ZDAtOTM0MTFiMmMyMWM3XCIsXG5cdFwibG9jYWxlXCI6IFwiZW5cIixcblx0Ly8gXCJsb2ctbGV2ZWxcIjogXCJ0cmFjZVwiXG59XG5gO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocGFyc2UoY29udGVudCksIHtcblx0XHRcdCdlbmFibGUtY3Jhc2gtcmVwb3J0ZXInOiB0cnVlLFxuXHRcdFx0J2NyYXNoLXJlcG9ydGVyLWlkJzogJ2FhYWFhYjMxLTc0NTMtNDUwNi05N2QwLTkzNDExYjJjMjFjNycsXG5cdFx0XHQnbG9jYWxlJzogJ2VuJ1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBRW5CLFNBQVMsT0FBTyxxQkFBcUI7QUFDckMsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxjQUFjLE1BQU07QUFDekIsMENBQXdDO0FBRXhDLE9BQUssZ0JBQWdCLE1BQU07QUFDMUIsVUFBTSxVQUFrQjtBQUFBLE1BQ3ZCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUk7QUFDWCxXQUFPLFVBQVUsTUFBTSxPQUFPLEdBQUcsS0FBSyxNQUFNLFFBQVEsQ0FBQztBQUFBLEVBQ3RELENBQUM7QUFDRCxPQUFLLHNCQUFzQixNQUFNO0FBQ2hDLFVBQU0sVUFBa0I7QUFBQSxNQUN2QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsV0FBTyxVQUFVLE1BQU0sT0FBTyxHQUFHLEtBQUssTUFBTSxRQUFRLENBQUM7QUFBQSxFQUN0RCxDQUFDO0FBQ0QsT0FBSyx5QkFBeUIsTUFBTTtBQUNuQyxVQUFNLFVBQWtCO0FBQUEsTUFDdkI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLE1BQU07QUFDYixVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLE1B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
