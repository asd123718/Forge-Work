import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { getGitHubRepositoryFromRemoteUrl } from "../../../../../workbench/contrib/git/common/utils.js";
import { parseGitHubRepositoryFromGitConfig, resolveGitHubRepositoryFromGitConfig } from "../../browser/gitHubRepositoryResolver.js";
const ROOT = URI.from({ scheme: "vscode-tests", path: "/workspace" });
suite("GitHubRepositoryResolver", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("prefers the origin GitHub remote from git config", () => {
    assert.deepStrictEqual(parseGitHubRepositoryFromGitConfig(`
			[remote "upstream"]
				url = https://github.com/upstream/project.git
			[remote "origin"]
				url = git@github.com:owner/project.git
		`), {
      owner: "owner",
      repo: "project"
    });
  });
  test("does not normalize HTTP hosts that merely end in github.com", () => {
    assert.deepStrictEqual({
      lookalike: getGitHubRepositoryFromRemoteUrl("https://evil-github.com/owner/project.git"),
      sshAlias: getGitHubRepositoryFromRemoteUrl("ssh://work-github.com/owner/project.git")
    }, {
      lookalike: void 0,
      sshAlias: { owner: "owner", repo: "project" }
    });
  });
  test("uses the configured GitHub Enterprise host exclusively", () => {
    assert.deepStrictEqual({
      https: getGitHubRepositoryFromRemoteUrl("https://ghe.example.com/owner/project.git", ["ghe.example.com"]),
      ssh: getGitHubRepositoryFromRemoteUrl("git@ghe.example.com:owner/project.git", ["ghe.example.com"]),
      lookalike: getGitHubRepositoryFromRemoteUrl("https://evil-ghe.example.com/owner/project.git", ["ghe.example.com"]),
      githubDotCom: getGitHubRepositoryFromRemoteUrl("https://github.com/owner/project.git", ["ghe.example.com"]),
      unconfigured: getGitHubRepositoryFromRemoteUrl("https://ghe.example.com/owner/project.git")
    }, {
      https: { owner: "owner", repo: "project" },
      ssh: { owner: "owner", repo: "project" },
      lookalike: void 0,
      githubDotCom: void 0,
      unconfigured: void 0
    });
  });
  test("resolves the configured GitHub Enterprise origin from git config", () => {
    assert.deepStrictEqual(parseGitHubRepositoryFromGitConfig(`
			[remote "origin"]
				url = https://ghe.example.com/owner/project.git
		`, ["ghe.example.com"]), {
      owner: "owner",
      repo: "project"
    });
  });
  test("finds git config above a nested selected workspace folder", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    const provider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(ROOT.scheme, provider));
    await fileService.createFolder(joinPath(ROOT, ".git"));
    await fileService.createFolder(joinPath(ROOT, "src", "feature"));
    await fileService.writeFile(joinPath(ROOT, ".git", "config"), VSBuffer.fromString(`
			[remote "origin"]
				url = https://github.com/microsoft/vscode.git
		`));
    assert.deepStrictEqual(await resolveGitHubRepositoryFromGitConfig(fileService, joinPath(ROOT, "src", "feature")), {
      owner: "microsoft",
      repo: "vscode"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcb25ib2FyZGluZ1RvdXJzXFx0ZXN0XFxicm93c2VyXFxnaXRIdWJSZXBvc2l0b3J5UmVzb2x2ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgZ2V0R2l0SHViUmVwb3NpdG9yeUZyb21SZW1vdGVVcmwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9naXQvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHBhcnNlR2l0SHViUmVwb3NpdG9yeUZyb21HaXRDb25maWcsIHJlc29sdmVHaXRIdWJSZXBvc2l0b3J5RnJvbUdpdENvbmZpZyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZ2l0SHViUmVwb3NpdG9yeVJlc29sdmVyLmpzJztcblxuY29uc3QgUk9PVCA9IFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXRlc3RzJywgcGF0aDogJy93b3Jrc3BhY2UnIH0pO1xuXG5zdWl0ZSgnR2l0SHViUmVwb3NpdG9yeVJlc29sdmVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3ByZWZlcnMgdGhlIG9yaWdpbiBHaXRIdWIgcmVtb3RlIGZyb20gZ2l0IGNvbmZpZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlR2l0SHViUmVwb3NpdG9yeUZyb21HaXRDb25maWcoYFxuXHRcdFx0W3JlbW90ZSBcInVwc3RyZWFtXCJdXG5cdFx0XHRcdHVybCA9IGh0dHBzOi8vZ2l0aHViLmNvbS91cHN0cmVhbS9wcm9qZWN0LmdpdFxuXHRcdFx0W3JlbW90ZSBcIm9yaWdpblwiXVxuXHRcdFx0XHR1cmwgPSBnaXRAZ2l0aHViLmNvbTpvd25lci9wcm9qZWN0LmdpdFxuXHRcdGApLCB7XG5cdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdHJlcG86ICdwcm9qZWN0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgbm9ybWFsaXplIEhUVFAgaG9zdHMgdGhhdCBtZXJlbHkgZW5kIGluIGdpdGh1Yi5jb20nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsb29rYWxpa2U6IGdldEdpdEh1YlJlcG9zaXRvcnlGcm9tUmVtb3RlVXJsKCdodHRwczovL2V2aWwtZ2l0aHViLmNvbS9vd25lci9wcm9qZWN0LmdpdCcpLFxuXHRcdFx0c3NoQWxpYXM6IGdldEdpdEh1YlJlcG9zaXRvcnlGcm9tUmVtb3RlVXJsKCdzc2g6Ly93b3JrLWdpdGh1Yi5jb20vb3duZXIvcHJvamVjdC5naXQnKSxcblx0XHR9LCB7XG5cdFx0XHRsb29rYWxpa2U6IHVuZGVmaW5lZCxcblx0XHRcdHNzaEFsaWFzOiB7IG93bmVyOiAnb3duZXInLCByZXBvOiAncHJvamVjdCcgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0aGUgY29uZmlndXJlZCBHaXRIdWIgRW50ZXJwcmlzZSBob3N0IGV4Y2x1c2l2ZWx5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aHR0cHM6IGdldEdpdEh1YlJlcG9zaXRvcnlGcm9tUmVtb3RlVXJsKCdodHRwczovL2doZS5leGFtcGxlLmNvbS9vd25lci9wcm9qZWN0LmdpdCcsIFsnZ2hlLmV4YW1wbGUuY29tJ10pLFxuXHRcdFx0c3NoOiBnZXRHaXRIdWJSZXBvc2l0b3J5RnJvbVJlbW90ZVVybCgnZ2l0QGdoZS5leGFtcGxlLmNvbTpvd25lci9wcm9qZWN0LmdpdCcsIFsnZ2hlLmV4YW1wbGUuY29tJ10pLFxuXHRcdFx0bG9va2FsaWtlOiBnZXRHaXRIdWJSZXBvc2l0b3J5RnJvbVJlbW90ZVVybCgnaHR0cHM6Ly9ldmlsLWdoZS5leGFtcGxlLmNvbS9vd25lci9wcm9qZWN0LmdpdCcsIFsnZ2hlLmV4YW1wbGUuY29tJ10pLFxuXHRcdFx0Z2l0aHViRG90Q29tOiBnZXRHaXRIdWJSZXBvc2l0b3J5RnJvbVJlbW90ZVVybCgnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3Byb2plY3QuZ2l0JywgWydnaGUuZXhhbXBsZS5jb20nXSksXG5cdFx0XHR1bmNvbmZpZ3VyZWQ6IGdldEdpdEh1YlJlcG9zaXRvcnlGcm9tUmVtb3RlVXJsKCdodHRwczovL2doZS5leGFtcGxlLmNvbS9vd25lci9wcm9qZWN0LmdpdCcpLFxuXHRcdH0sIHtcblx0XHRcdGh0dHBzOiB7IG93bmVyOiAnb3duZXInLCByZXBvOiAncHJvamVjdCcgfSxcblx0XHRcdHNzaDogeyBvd25lcjogJ293bmVyJywgcmVwbzogJ3Byb2plY3QnIH0sXG5cdFx0XHRsb29rYWxpa2U6IHVuZGVmaW5lZCxcblx0XHRcdGdpdGh1YkRvdENvbTogdW5kZWZpbmVkLFxuXHRcdFx0dW5jb25maWd1cmVkOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHRoZSBjb25maWd1cmVkIEdpdEh1YiBFbnRlcnByaXNlIG9yaWdpbiBmcm9tIGdpdCBjb25maWcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUdpdEh1YlJlcG9zaXRvcnlGcm9tR2l0Q29uZmlnKGBcblx0XHRcdFtyZW1vdGUgXCJvcmlnaW5cIl1cblx0XHRcdFx0dXJsID0gaHR0cHM6Ly9naGUuZXhhbXBsZS5jb20vb3duZXIvcHJvamVjdC5naXRcblx0XHRgLCBbJ2doZS5leGFtcGxlLmNvbSddKSwge1xuXHRcdFx0b3duZXI6ICdvd25lcicsXG5cdFx0XHRyZXBvOiAncHJvamVjdCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRzIGdpdCBjb25maWcgYWJvdmUgYSBuZXN0ZWQgc2VsZWN0ZWQgd29ya3NwYWNlIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoUk9PVC5zY2hlbWUsIHByb3ZpZGVyKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGpvaW5QYXRoKFJPT1QsICcuZ2l0JykpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihqb2luUGF0aChST09ULCAnc3JjJywgJ2ZlYXR1cmUnKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGpvaW5QYXRoKFJPT1QsICcuZ2l0JywgJ2NvbmZpZycpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGBcblx0XHRcdFtyZW1vdGUgXCJvcmlnaW5cIl1cblx0XHRcdFx0dXJsID0gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0XG5cdFx0YCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlR2l0SHViUmVwb3NpdG9yeUZyb21HaXRDb25maWcoZmlsZVNlcnZpY2UsIGpvaW5QYXRoKFJPT1QsICdzcmMnLCAnZmVhdHVyZScpKSwge1xuXHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0cmVwbzogJ3ZzY29kZScsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNB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
