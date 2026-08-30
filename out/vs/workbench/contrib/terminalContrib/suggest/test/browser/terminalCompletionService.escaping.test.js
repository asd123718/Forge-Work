import { escapeTerminalCompletionLabel } from "../../browser/terminalCompletionService.js";
import { GeneralShellType, PosixShellType, WindowsShellType } from "../../../../../../platform/terminal/common/terminal.js";
import { strict as assert } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("escapeTerminalCompletionLabel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const shellType = PosixShellType.Bash;
  const pathSeparator = "/";
  const cases = [
    { char: "[", label: "[abc", expected: "\\[abc" },
    { char: "]", label: "abc]", expected: "abc\\]" },
    { char: "(", label: "(abc", expected: "\\(abc" },
    { char: ")", label: "abc)", expected: "abc\\)" },
    { char: "'", label: `'abc`, expected: `\\'abc` },
    { char: '"', label: '"abc', expected: '\\"abc' },
    { char: "\\", label: "abc\\", expected: "abc\\\\" },
    { char: "`", label: "`abc", expected: "\\`abc" },
    { char: "*", label: "*abc", expected: "\\*abc" },
    { char: "?", label: "?abc", expected: "\\?abc" },
    { char: ";", label: ";abc", expected: "\\;abc" },
    { char: "&", label: "&abc", expected: "\\&abc" },
    { char: "|", label: "|abc", expected: "\\|abc" },
    { char: "<", label: "<abc", expected: "\\<abc" },
    { char: ">", label: ">abc", expected: "\\>abc" }
  ];
  for (const { char, label, expected } of cases) {
    test(`should escape '${char}' in "${label}"`, () => {
      const result = escapeTerminalCompletionLabel(label, shellType, pathSeparator);
      assert.equal(result, expected);
    });
  }
  test("should not escape when no special chars", () => {
    const result = escapeTerminalCompletionLabel("abc", shellType, pathSeparator);
    assert.equal(result, "abc");
  });
  test("should not escape for PowerShell", () => {
    const result = escapeTerminalCompletionLabel("[abc", GeneralShellType.PowerShell, pathSeparator);
    assert.equal(result, "[abc");
  });
  test("should not escape for CommandPrompt", () => {
    const result = escapeTerminalCompletionLabel("[abc", WindowsShellType.CommandPrompt, pathSeparator);
    assert.equal(result, "[abc");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcc3VnZ2VzdFxcdGVzdFxcYnJvd3NlclxcdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5lc2NhcGluZy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZXNjYXBlVGVybWluYWxDb21wbGV0aW9uTGFiZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2VuZXJhbFNoZWxsVHlwZSwgUG9zaXhTaGVsbFR5cGUsIFRlcm1pbmFsU2hlbGxUeXBlLCBXaW5kb3dzU2hlbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IHN0cmljdCBhcyBhc3NlcnQgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdlc2NhcGVUZXJtaW5hbENvbXBsZXRpb25MYWJlbCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGNvbnN0IHNoZWxsVHlwZTogVGVybWluYWxTaGVsbFR5cGUgPSBQb3NpeFNoZWxsVHlwZS5CYXNoO1xuXHRjb25zdCBwYXRoU2VwYXJhdG9yID0gJy8nO1xuXHRjb25zdCBjYXNlcyA9IFtcblx0XHR7IGNoYXI6ICdbJywgbGFiZWw6ICdbYWJjJywgZXhwZWN0ZWQ6ICdcXFxcW2FiYycgfSxcblx0XHR7IGNoYXI6ICddJywgbGFiZWw6ICdhYmNdJywgZXhwZWN0ZWQ6ICdhYmNcXFxcXScgfSxcblx0XHR7IGNoYXI6ICcoJywgbGFiZWw6ICcoYWJjJywgZXhwZWN0ZWQ6ICdcXFxcKGFiYycgfSxcblx0XHR7IGNoYXI6ICcpJywgbGFiZWw6ICdhYmMpJywgZXhwZWN0ZWQ6ICdhYmNcXFxcKScgfSxcblx0XHR7IGNoYXI6ICdcXCcnLCBsYWJlbDogYCdhYmNgLCBleHBlY3RlZDogYFxcXFwnYWJjYCB9LFxuXHRcdHsgY2hhcjogJ1wiJywgbGFiZWw6ICdcImFiYycsIGV4cGVjdGVkOiAnXFxcXFwiYWJjJyB9LFxuXHRcdHsgY2hhcjogJ1xcXFwnLCBsYWJlbDogJ2FiY1xcXFwnLCBleHBlY3RlZDogJ2FiY1xcXFxcXFxcJyB9LFxuXHRcdHsgY2hhcjogJ2AnLCBsYWJlbDogJ2BhYmMnLCBleHBlY3RlZDogJ1xcXFxgYWJjJyB9LFxuXHRcdHsgY2hhcjogJyonLCBsYWJlbDogJyphYmMnLCBleHBlY3RlZDogJ1xcXFwqYWJjJyB9LFxuXHRcdHsgY2hhcjogJz8nLCBsYWJlbDogJz9hYmMnLCBleHBlY3RlZDogJ1xcXFw/YWJjJyB9LFxuXHRcdHsgY2hhcjogJzsnLCBsYWJlbDogJzthYmMnLCBleHBlY3RlZDogJ1xcXFw7YWJjJyB9LFxuXHRcdHsgY2hhcjogJyYnLCBsYWJlbDogJyZhYmMnLCBleHBlY3RlZDogJ1xcXFwmYWJjJyB9LFxuXHRcdHsgY2hhcjogJ3wnLCBsYWJlbDogJ3xhYmMnLCBleHBlY3RlZDogJ1xcXFx8YWJjJyB9LFxuXHRcdHsgY2hhcjogJzwnLCBsYWJlbDogJzxhYmMnLCBleHBlY3RlZDogJ1xcXFw8YWJjJyB9LFxuXHRcdHsgY2hhcjogJz4nLCBsYWJlbDogJz5hYmMnLCBleHBlY3RlZDogJ1xcXFw+YWJjJyB9LFxuXHRdO1xuXG5cdGZvciAoY29uc3QgeyBjaGFyLCBsYWJlbCwgZXhwZWN0ZWQgfSBvZiBjYXNlcykge1xuXHRcdHRlc3QoYHNob3VsZCBlc2NhcGUgJyR7Y2hhcn0nIGluIFwiJHtsYWJlbH1cImAsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGVzY2FwZVRlcm1pbmFsQ29tcGxldGlvbkxhYmVsKGxhYmVsLCBzaGVsbFR5cGUsIHBhdGhTZXBhcmF0b3IpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdCwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBlc2NhcGUgd2hlbiBubyBzcGVjaWFsIGNoYXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGVzY2FwZVRlcm1pbmFsQ29tcGxldGlvbkxhYmVsKCdhYmMnLCBzaGVsbFR5cGUsIHBhdGhTZXBhcmF0b3IpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHQsICdhYmMnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBlc2NhcGUgZm9yIFBvd2VyU2hlbGwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZXNjYXBlVGVybWluYWxDb21wbGV0aW9uTGFiZWwoJ1thYmMnLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwsIHBhdGhTZXBhcmF0b3IpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHQsICdbYWJjJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBub3QgZXNjYXBlIGZvciBDb21tYW5kUHJvbXB0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGVzY2FwZVRlcm1pbmFsQ29tcGxldGlvbkxhYmVsKCdbYWJjJywgV2luZG93c1NoZWxsVHlwZS5Db21tYW5kUHJvbXB0LCBwYXRoU2VwYXJhdG9yKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0LCAnW2FiYycpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxrQkFBa0IsZ0JBQW1DLHdCQUF3QjtBQUN0RixTQUFTLFVBQVUsY0FBYztBQUNqQyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLGlDQUFpQyxNQUFNO0FBQzVDLDBDQUF3QztBQUN4QyxRQUFNLFlBQStCLGVBQWU7QUFDcEQsUUFBTSxnQkFBZ0I7QUFDdEIsUUFBTSxRQUFRO0FBQUEsSUFDYixFQUFFLE1BQU0sS0FBSyxPQUFPLFFBQVEsVUFBVSxTQUFTO0FBQUEsSUFDL0MsRUFBRSxNQUFNLEtBQUssT0FBTyxRQUFRLFVBQVUsU0FBUztBQUFBLElBQy9DLEVBQUUsTUFBTSxLQUFLLE9BQU8sUUFBUSxVQUFVLFNBQVM7QUFBQSxJQUMvQyxFQUFFLE1BQU0sS0FBSyxPQUFPLFFBQVEsVUFBVSxTQUFTO0FBQUEsSUFDL0MsRUFBRSxNQUFNLEtBQU0sT0FBTyxRQUFRLFVBQVUsU0FBUztBQUFBLElBQ2hELEVBQUUsTUFBTSxLQUFLLE9BQU8sUUFBUSxVQUFVLFNBQVM7QUFBQSxJQUMvQyxFQUFFLE1BQU0sTUFBTSxPQUFPLFNBQVMsVUFBVSxVQUFVO0FBQUEsSUFDbEQsRUFBRSxNQUFNLEtBQUssT0FBTyxRQUFRLFVBQVUsU0FBUztBQUFBLElBQy9DLEVBQUUsTUFBTSxLQUFLLE9BQU8sUUFBUSxVQUFVLFNBQVM7QUFBQSxJQUMvQyxFQUFFLE1BQU0sS0FBSyxPQUFPLFFBQVEsVUFBVSxTQUFTO0FBQUEsSUFDL0MsRUFBRSxNQUFNLEtBQUssT0FBTyxRQUFRLFVBQVUsU0FBUztBQUFBLElBQy9DLEVBQUUsTUFBTSxLQUFLLE9BQU8sUUFBUSxVQUFVLFNBQVM7QUFBQSxJQUMvQyxFQUFFLE1BQU0sS0FBSyxPQUFPLFFBQVEsVUFBVSxTQUFTO0FBQUEsSUFDL0MsRUFBRSxNQUFNLEtBQUssT0FBTyxRQUFRLFVBQVUsU0FBUztBQUFBLElBQy9DLEVBQUUsTUFBTSxLQUFLLE9BQU8sUUFBUSxVQUFVLFNBQVM7QUFBQSxFQUNoRDtBQUVBLGFBQVcsRUFBRSxNQUFNLE9BQU8sU0FBUyxLQUFLLE9BQU87QUFDOUMsU0FBSyxrQkFBa0IsSUFBSSxTQUFTLEtBQUssS0FBSyxNQUFNO0FBQ25ELFlBQU0sU0FBUyw4QkFBOEIsT0FBTyxXQUFXLGFBQWE7QUFDNUUsYUFBTyxNQUFNLFFBQVEsUUFBUTtBQUFBLElBQzlCLENBQUM7QUFBQSxFQUNGO0FBRUEsT0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxVQUFNLFNBQVMsOEJBQThCLE9BQU8sV0FBVyxhQUFhO0FBQzVFLFdBQU8sTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUMzQixDQUFDO0FBRUQsT0FBSyxvQ0FBb0MsTUFBTTtBQUM5QyxVQUFNLFNBQVMsOEJBQThCLFFBQVEsaUJBQWlCLFlBQVksYUFBYTtBQUMvRixXQUFPLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDNUIsQ0FBQztBQUVELE9BQUssdUNBQXVDLE1BQU07QUFDakQsVUFBTSxTQUFTLDhCQUE4QixRQUFRLGlCQUFpQixlQUFlLGFBQWE7QUFDbEcsV0FBTyxNQUFNLFFBQVEsTUFBTTtBQUFBLEVBQzVCLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
