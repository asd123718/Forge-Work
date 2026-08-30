import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { findDeepestContainingWorkingDirectory } from "../../common/agentHostWorkingDirectories.js";
import { resolveAgentHostFileCompletionRoots } from "../../node/agentHostFileCompletionUtils.js";
suite("AgentHostFileCompletionUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const toPaths = (resources) => resources.map((resource) => resource.path);
  test("normalizes and deduplicates local roots while preserving order", () => {
    const result = resolveAgentHostFileCompletionRoots([
      URI.file("/project/a/"),
      URI.file("/project/b"),
      URI.file("/project/a"),
      URI.parse("vscode-vfs://github/project/c")
    ]);
    assert.deepStrictEqual({
      logical: toPaths(result.logicalRoots),
      enumeration: toPaths(result.enumerationRoots)
    }, {
      logical: ["/project/a", "/project/b"],
      enumeration: ["/project/a", "/project/b"]
    });
  });
  test("enumerates only the outermost declared roots", () => {
    const result = resolveAgentHostFileCompletionRoots([
      URI.file("/project/a/sub/one"),
      URI.file("/project/b"),
      URI.file("/project/a"),
      URI.file("/project/a/sub")
    ]);
    assert.deepStrictEqual({
      logical: toPaths(result.logicalRoots),
      enumeration: toPaths(result.enumerationRoots)
    }, {
      logical: ["/project/a/sub/one", "/project/b", "/project/a", "/project/a/sub"],
      enumeration: ["/project/b", "/project/a"]
    });
  });
  test("does not synthesize a common ancestor for sibling roots", () => {
    const result = resolveAgentHostFileCompletionRoots([
      URI.file("/project/a"),
      URI.file("/project/b")
    ]);
    assert.deepStrictEqual(toPaths(result.enumerationRoots), ["/project/a", "/project/b"]);
  });
  test("attributes resources to the deepest containing logical root", () => {
    const roots = [
      URI.file("/project/a"),
      URI.file("/project/a/sub"),
      URI.file("/project/b")
    ];
    assert.deepStrictEqual({
      nested: findDeepestContainingWorkingDirectory(URI.file("/project/a/sub/file.ts"), roots)?.path,
      parent: findDeepestContainingWorkingDirectory(URI.file("/project/a/other.ts"), roots)?.path,
      sibling: findDeepestContainingWorkingDirectory(URI.file("/project/b/file.ts"), roots)?.path,
      outside: findDeepestContainingWorkingDirectory(URI.file("/project/c/file.ts"), roots)?.path
    }, {
      nested: "/project/a/sub",
      parent: "/project/a",
      sibling: "/project/b",
      outside: void 0
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RGaWxlQ29tcGxldGlvblV0aWxzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBmaW5kRGVlcGVzdENvbnRhaW5pbmdXb3JraW5nRGlyZWN0b3J5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFdvcmtpbmdEaXJlY3Rvcmllcy5qcyc7XG5pbXBvcnQgeyByZXNvbHZlQWdlbnRIb3N0RmlsZUNvbXBsZXRpb25Sb290cyB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0RmlsZUNvbXBsZXRpb25VdGlscy5qcyc7XG5cbnN1aXRlKCdBZ2VudEhvc3RGaWxlQ29tcGxldGlvblV0aWxzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB0b1BhdGhzID0gKHJlc291cmNlczogcmVhZG9ubHkgVVJJW10pID0+IHJlc291cmNlcy5tYXAocmVzb3VyY2UgPT4gcmVzb3VyY2UucGF0aCk7XG5cblx0dGVzdCgnbm9ybWFsaXplcyBhbmQgZGVkdXBsaWNhdGVzIGxvY2FsIHJvb3RzIHdoaWxlIHByZXNlcnZpbmcgb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUFnZW50SG9zdEZpbGVDb21wbGV0aW9uUm9vdHMoW1xuXHRcdFx0VVJJLmZpbGUoJy9wcm9qZWN0L2EvJyksXG5cdFx0XHRVUkkuZmlsZSgnL3Byb2plY3QvYicpLFxuXHRcdFx0VVJJLmZpbGUoJy9wcm9qZWN0L2EnKSxcblx0XHRcdFVSSS5wYXJzZSgndnNjb2RlLXZmczovL2dpdGh1Yi9wcm9qZWN0L2MnKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9naWNhbDogdG9QYXRocyhyZXN1bHQubG9naWNhbFJvb3RzKSxcblx0XHRcdGVudW1lcmF0aW9uOiB0b1BhdGhzKHJlc3VsdC5lbnVtZXJhdGlvblJvb3RzKSxcblx0XHR9LCB7XG5cdFx0XHRsb2dpY2FsOiBbJy9wcm9qZWN0L2EnLCAnL3Byb2plY3QvYiddLFxuXHRcdFx0ZW51bWVyYXRpb246IFsnL3Byb2plY3QvYScsICcvcHJvamVjdC9iJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VudW1lcmF0ZXMgb25seSB0aGUgb3V0ZXJtb3N0IGRlY2xhcmVkIHJvb3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVBZ2VudEhvc3RGaWxlQ29tcGxldGlvblJvb3RzKFtcblx0XHRcdFVSSS5maWxlKCcvcHJvamVjdC9hL3N1Yi9vbmUnKSxcblx0XHRcdFVSSS5maWxlKCcvcHJvamVjdC9iJyksXG5cdFx0XHRVUkkuZmlsZSgnL3Byb2plY3QvYScpLFxuXHRcdFx0VVJJLmZpbGUoJy9wcm9qZWN0L2Evc3ViJyksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxvZ2ljYWw6IHRvUGF0aHMocmVzdWx0LmxvZ2ljYWxSb290cyksXG5cdFx0XHRlbnVtZXJhdGlvbjogdG9QYXRocyhyZXN1bHQuZW51bWVyYXRpb25Sb290cyksXG5cdFx0fSwge1xuXHRcdFx0bG9naWNhbDogWycvcHJvamVjdC9hL3N1Yi9vbmUnLCAnL3Byb2plY3QvYicsICcvcHJvamVjdC9hJywgJy9wcm9qZWN0L2Evc3ViJ10sXG5cdFx0XHRlbnVtZXJhdGlvbjogWycvcHJvamVjdC9iJywgJy9wcm9qZWN0L2EnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc3ludGhlc2l6ZSBhIGNvbW1vbiBhbmNlc3RvciBmb3Igc2libGluZyByb290cycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlQWdlbnRIb3N0RmlsZUNvbXBsZXRpb25Sb290cyhbXG5cdFx0XHRVUkkuZmlsZSgnL3Byb2plY3QvYScpLFxuXHRcdFx0VVJJLmZpbGUoJy9wcm9qZWN0L2InKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9QYXRocyhyZXN1bHQuZW51bWVyYXRpb25Sb290cyksIFsnL3Byb2plY3QvYScsICcvcHJvamVjdC9iJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdHRyaWJ1dGVzIHJlc291cmNlcyB0byB0aGUgZGVlcGVzdCBjb250YWluaW5nIGxvZ2ljYWwgcm9vdCcsICgpID0+IHtcblx0XHRjb25zdCByb290cyA9IFtcblx0XHRcdFVSSS5maWxlKCcvcHJvamVjdC9hJyksXG5cdFx0XHRVUkkuZmlsZSgnL3Byb2plY3QvYS9zdWInKSxcblx0XHRcdFVSSS5maWxlKCcvcHJvamVjdC9iJyksXG5cdFx0XTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bmVzdGVkOiBmaW5kRGVlcGVzdENvbnRhaW5pbmdXb3JraW5nRGlyZWN0b3J5KFVSSS5maWxlKCcvcHJvamVjdC9hL3N1Yi9maWxlLnRzJyksIHJvb3RzKT8ucGF0aCxcblx0XHRcdHBhcmVudDogZmluZERlZXBlc3RDb250YWluaW5nV29ya2luZ0RpcmVjdG9yeShVUkkuZmlsZSgnL3Byb2plY3QvYS9vdGhlci50cycpLCByb290cyk/LnBhdGgsXG5cdFx0XHRzaWJsaW5nOiBmaW5kRGVlcGVzdENvbnRhaW5pbmdXb3JraW5nRGlyZWN0b3J5KFVSSS5maWxlKCcvcHJvamVjdC9iL2ZpbGUudHMnKSwgcm9vdHMpPy5wYXRoLFxuXHRcdFx0b3V0c2lkZTogZmluZERlZXBlc3RDb250YWluaW5nV29ya2luZ0RpcmVjdG9yeShVUkkuZmlsZSgnL3Byb2plY3QvYy9maWxlLnRzJyksIHJvb3RzKT8ucGF0aCxcblx0XHR9LCB7XG5cdFx0XHRuZXN0ZWQ6ICcvcHJvamVjdC9hL3N1YicsXG5cdFx0XHRwYXJlbnQ6ICcvcHJvamVjdC9hJyxcblx0XHRcdHNpYmxpbmc6ICcvcHJvamVjdC9iJyxcblx0XHRcdG91dHNpZGU6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2Q0FBNkM7QUFDdEQsU0FBUywyQ0FBMkM7QUFFcEQsTUFBTSxnQ0FBZ0MsTUFBTTtBQUMzQywwQ0FBd0M7QUFFeEMsUUFBTSxVQUFVLENBQUMsY0FBOEIsVUFBVSxJQUFJLGNBQVksU0FBUyxJQUFJO0FBRXRGLE9BQUssa0VBQWtFLE1BQU07QUFDNUUsVUFBTSxTQUFTLG9DQUFvQztBQUFBLE1BQ2xELElBQUksS0FBSyxhQUFhO0FBQUEsTUFDdEIsSUFBSSxLQUFLLFlBQVk7QUFBQSxNQUNyQixJQUFJLEtBQUssWUFBWTtBQUFBLE1BQ3JCLElBQUksTUFBTSwrQkFBK0I7QUFBQSxJQUMxQyxDQUFDO0FBRUQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixTQUFTLFFBQVEsT0FBTyxZQUFZO0FBQUEsTUFDcEMsYUFBYSxRQUFRLE9BQU8sZ0JBQWdCO0FBQUEsSUFDN0MsR0FBRztBQUFBLE1BQ0YsU0FBUyxDQUFDLGNBQWMsWUFBWTtBQUFBLE1BQ3BDLGFBQWEsQ0FBQyxjQUFjLFlBQVk7QUFBQSxJQUN6QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnREFBZ0QsTUFBTTtBQUMxRCxVQUFNLFNBQVMsb0NBQW9DO0FBQUEsTUFDbEQsSUFBSSxLQUFLLG9CQUFvQjtBQUFBLE1BQzdCLElBQUksS0FBSyxZQUFZO0FBQUEsTUFDckIsSUFBSSxLQUFLLFlBQVk7QUFBQSxNQUNyQixJQUFJLEtBQUssZ0JBQWdCO0FBQUEsSUFDMUIsQ0FBQztBQUVELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsU0FBUyxRQUFRLE9BQU8sWUFBWTtBQUFBLE1BQ3BDLGFBQWEsUUFBUSxPQUFPLGdCQUFnQjtBQUFBLElBQzdDLEdBQUc7QUFBQSxNQUNGLFNBQVMsQ0FBQyxzQkFBc0IsY0FBYyxjQUFjLGdCQUFnQjtBQUFBLE1BQzVFLGFBQWEsQ0FBQyxjQUFjLFlBQVk7QUFBQSxJQUN6QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxVQUFNLFNBQVMsb0NBQW9DO0FBQUEsTUFDbEQsSUFBSSxLQUFLLFlBQVk7QUFBQSxNQUNyQixJQUFJLEtBQUssWUFBWTtBQUFBLElBQ3RCLENBQUM7QUFFRCxXQUFPLGdCQUFnQixRQUFRLE9BQU8sZ0JBQWdCLEdBQUcsQ0FBQyxjQUFjLFlBQVksQ0FBQztBQUFBLEVBQ3RGLENBQUM7QUFFRCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFVBQU0sUUFBUTtBQUFBLE1BQ2IsSUFBSSxLQUFLLFlBQVk7QUFBQSxNQUNyQixJQUFJLEtBQUssZ0JBQWdCO0FBQUEsTUFDekIsSUFBSSxLQUFLLFlBQVk7QUFBQSxJQUN0QjtBQUVBLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxzQ0FBc0MsSUFBSSxLQUFLLHdCQUF3QixHQUFHLEtBQUssR0FBRztBQUFBLE1BQzFGLFFBQVEsc0NBQXNDLElBQUksS0FBSyxxQkFBcUIsR0FBRyxLQUFLLEdBQUc7QUFBQSxNQUN2RixTQUFTLHNDQUFzQyxJQUFJLEtBQUssb0JBQW9CLEdBQUcsS0FBSyxHQUFHO0FBQUEsTUFDdkYsU0FBUyxzQ0FBc0MsSUFBSSxLQUFLLG9CQUFvQixHQUFHLEtBQUssR0FBRztBQUFBLElBQ3hGLEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxNQUNSLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxJQUNWLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
