import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { SedFileWriteParser } from "../../../common/autoApprove/sedFileWriteParser.js";
suite("SedFileWriteParser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const parser = new SedFileWriteParser();
  test("detects supported in-place options", () => {
    const commandLines = [
      'sed -i "s/foo/bar/" file.txt',
      'sed -I "s/foo/bar/" file.txt',
      'sed -ni "s/foo/bar/" file.txt',
      'sed -i.bak "s/foo/bar/" file.txt',
      `sed -i '' "s/foo/bar/" file.txt`,
      'sed --in-place "s/foo/bar/" file.txt',
      'sed --in-place=.bak "s/foo/bar/" file.txt'
    ];
    assert.deepStrictEqual(commandLines.map((commandLine) => parser.canHandle(commandLine)), commandLines.map(() => true));
  });
  test("does not classify non-in-place commands", () => {
    const commandLines = [
      'sed "s/foo/bar/" file.txt',
      'sed -n "s/foo/bar/p" file.txt',
      "echo sed -i file.txt"
    ];
    assert.deepStrictEqual(commandLines.map((commandLine) => parser.canHandle(commandLine)), commandLines.map(() => false));
  });
  test("extracts in-place file targets", () => {
    assert.deepStrictEqual({
      single: parser.extractFileWrites('sed -i "s/foo/bar/" file.txt'),
      multiple: parser.extractFileWrites('sed -i "s/foo/bar/" file1.txt file2.txt'),
      bsd: parser.extractFileWrites(`sed -i '' "s/foo/bar/" file.txt`)
    }, {
      single: ["file.txt"],
      multiple: ["file1.txt", "file2.txt"],
      bsd: ["file.txt"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXHRlc3RcXGNvbW1vblxcYXV0b0FwcHJvdmVcXHNlZEZpbGVXcml0ZVBhcnNlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBTZWRGaWxlV3JpdGVQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXV0b0FwcHJvdmUvc2VkRmlsZVdyaXRlUGFyc2VyLmpzJztcblxuc3VpdGUoJ1NlZEZpbGVXcml0ZVBhcnNlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBwYXJzZXIgPSBuZXcgU2VkRmlsZVdyaXRlUGFyc2VyKCk7XG5cblx0dGVzdCgnZGV0ZWN0cyBzdXBwb3J0ZWQgaW4tcGxhY2Ugb3B0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kTGluZXMgPSBbXG5cdFx0XHQnc2VkIC1pIFwicy9mb28vYmFyL1wiIGZpbGUudHh0Jyxcblx0XHRcdCdzZWQgLUkgXCJzL2Zvby9iYXIvXCIgZmlsZS50eHQnLFxuXHRcdFx0J3NlZCAtbmkgXCJzL2Zvby9iYXIvXCIgZmlsZS50eHQnLFxuXHRcdFx0J3NlZCAtaS5iYWsgXCJzL2Zvby9iYXIvXCIgZmlsZS50eHQnLFxuXHRcdFx0J3NlZCAtaSBcXCdcXCcgXCJzL2Zvby9iYXIvXCIgZmlsZS50eHQnLFxuXHRcdFx0J3NlZCAtLWluLXBsYWNlIFwicy9mb28vYmFyL1wiIGZpbGUudHh0Jyxcblx0XHRcdCdzZWQgLS1pbi1wbGFjZT0uYmFrIFwicy9mb28vYmFyL1wiIGZpbGUudHh0Jyxcblx0XHRdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tbWFuZExpbmVzLm1hcChjb21tYW5kTGluZSA9PiBwYXJzZXIuY2FuSGFuZGxlKGNvbW1hbmRMaW5lKSksIGNvbW1hbmRMaW5lcy5tYXAoKCkgPT4gdHJ1ZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBjbGFzc2lmeSBub24taW4tcGxhY2UgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZExpbmVzID0gW1xuXHRcdFx0J3NlZCBcInMvZm9vL2Jhci9cIiBmaWxlLnR4dCcsXG5cdFx0XHQnc2VkIC1uIFwicy9mb28vYmFyL3BcIiBmaWxlLnR4dCcsXG5cdFx0XHQnZWNobyBzZWQgLWkgZmlsZS50eHQnLFxuXHRcdF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21tYW5kTGluZXMubWFwKGNvbW1hbmRMaW5lID0+IHBhcnNlci5jYW5IYW5kbGUoY29tbWFuZExpbmUpKSwgY29tbWFuZExpbmVzLm1hcCgoKSA9PiBmYWxzZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0cyBpbi1wbGFjZSBmaWxlIHRhcmdldHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaW5nbGU6IHBhcnNlci5leHRyYWN0RmlsZVdyaXRlcygnc2VkIC1pIFwicy9mb28vYmFyL1wiIGZpbGUudHh0JyksXG5cdFx0XHRtdWx0aXBsZTogcGFyc2VyLmV4dHJhY3RGaWxlV3JpdGVzKCdzZWQgLWkgXCJzL2Zvby9iYXIvXCIgZmlsZTEudHh0IGZpbGUyLnR4dCcpLFxuXHRcdFx0YnNkOiBwYXJzZXIuZXh0cmFjdEZpbGVXcml0ZXMoJ3NlZCAtaSBcXCdcXCcgXCJzL2Zvby9iYXIvXCIgZmlsZS50eHQnKSxcblx0XHR9LCB7XG5cdFx0XHRzaW5nbGU6IFsnZmlsZS50eHQnXSxcblx0XHRcdG11bHRpcGxlOiBbJ2ZpbGUxLnR4dCcsICdmaWxlMi50eHQnXSxcblx0XHRcdGJzZDogWydmaWxlLnR4dCddLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBRW5DLE1BQU0sc0JBQXNCLE1BQU07QUFFakMsMENBQXdDO0FBRXhDLFFBQU0sU0FBUyxJQUFJLG1CQUFtQjtBQUV0QyxPQUFLLHNDQUFzQyxNQUFNO0FBQ2hELFVBQU0sZUFBZTtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFdBQU8sZ0JBQWdCLGFBQWEsSUFBSSxpQkFBZSxPQUFPLFVBQVUsV0FBVyxDQUFDLEdBQUcsYUFBYSxJQUFJLE1BQU0sSUFBSSxDQUFDO0FBQUEsRUFDcEgsQ0FBQztBQUVELE9BQUssMkNBQTJDLE1BQU07QUFDckQsVUFBTSxlQUFlO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxXQUFPLGdCQUFnQixhQUFhLElBQUksaUJBQWUsT0FBTyxVQUFVLFdBQVcsQ0FBQyxHQUFHLGFBQWEsSUFBSSxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQ3JILENBQUM7QUFFRCxPQUFLLGtDQUFrQyxNQUFNO0FBQzVDLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxPQUFPLGtCQUFrQiw4QkFBOEI7QUFBQSxNQUMvRCxVQUFVLE9BQU8sa0JBQWtCLHlDQUF5QztBQUFBLE1BQzVFLEtBQUssT0FBTyxrQkFBa0IsaUNBQW1DO0FBQUEsSUFDbEUsR0FBRztBQUFBLE1BQ0YsUUFBUSxDQUFDLFVBQVU7QUFBQSxNQUNuQixVQUFVLENBQUMsYUFBYSxXQUFXO0FBQUEsTUFDbkMsS0FBSyxDQUFDLFVBQVU7QUFBQSxJQUNqQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
