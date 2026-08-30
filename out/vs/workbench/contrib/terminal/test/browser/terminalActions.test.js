import { deepStrictEqual } from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { shrinkWorkspaceFolderCwdPairs } from "../../browser/terminalActions.js";
function makeFakeFolder(name, uri) {
  return {
    name,
    uri,
    index: 0,
    toResource: () => uri
  };
}
function makePair(folder, cwd, isAbsolute) {
  return {
    folder,
    cwd: !cwd ? folder.uri : cwd instanceof URI ? cwd : cwd.uri,
    isAbsolute: !!isAbsolute,
    isOverridden: !!cwd && cwd.toString() !== folder.uri.toString()
  };
}
suite("terminalActions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const root = URI.file("/some-root");
  const a = makeFakeFolder("a", URI.joinPath(root, "a"));
  const b = makeFakeFolder("b", URI.joinPath(root, "b"));
  const c = makeFakeFolder("c", URI.joinPath(root, "c"));
  const d = makeFakeFolder("d", URI.joinPath(root, "d"));
  suite("shrinkWorkspaceFolderCwdPairs", () => {
    test("should return empty when given array is empty", () => {
      deepStrictEqual(shrinkWorkspaceFolderCwdPairs([]), []);
    });
    test("should return the only single pair when given argument is a single element array", () => {
      const pairs = [makePair(a)];
      deepStrictEqual(shrinkWorkspaceFolderCwdPairs(pairs), pairs);
    });
    test("should return all pairs when no repeated cwds", () => {
      const pairs = [makePair(a), makePair(b), makePair(c)];
      deepStrictEqual(shrinkWorkspaceFolderCwdPairs(pairs), pairs);
    });
    suite("should select the pair that has the same URI when repeated cwds exist", () => {
      test("all repeated", () => {
        const pairA = makePair(a);
        const pairB = makePair(b, a);
        const pairC = makePair(c, a);
        deepStrictEqual(shrinkWorkspaceFolderCwdPairs([pairA, pairB, pairC]), [pairA]);
      });
      test("two repeated + one different", () => {
        const pairA = makePair(a);
        const pairB = makePair(b, a);
        const pairC = makePair(c);
        deepStrictEqual(shrinkWorkspaceFolderCwdPairs([pairA, pairB, pairC]), [pairA, pairC]);
      });
      test("two repeated + two repeated", () => {
        const pairA = makePair(a);
        const pairB = makePair(b, a);
        const pairC = makePair(c);
        const pairD = makePair(d, c);
        deepStrictEqual(shrinkWorkspaceFolderCwdPairs([pairA, pairB, pairC, pairD]), [pairA, pairC]);
      });
      test("two repeated + two repeated (reverse order)", () => {
        const pairB = makePair(b, a);
        const pairA = makePair(a);
        const pairD = makePair(d, c);
        const pairC = makePair(c);
        deepStrictEqual(shrinkWorkspaceFolderCwdPairs([pairA, pairB, pairC, pairD]), [pairA, pairC]);
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFx0ZXJtaW5hbEFjdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlRm9sZGVyQ3dkUGFpciwgc2hyaW5rV29ya3NwYWNlRm9sZGVyQ3dkUGFpcnMgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsQWN0aW9ucy5qcyc7XG5cbmZ1bmN0aW9uIG1ha2VGYWtlRm9sZGVyKG5hbWU6IHN0cmluZywgdXJpOiBVUkkpOiBJV29ya3NwYWNlRm9sZGVyIHtcblx0cmV0dXJuIHtcblx0XHRuYW1lLFxuXHRcdHVyaSxcblx0XHRpbmRleDogMCxcblx0XHR0b1Jlc291cmNlOiAoKSA9PiB1cmksXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VQYWlyKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciwgY3dkPzogVVJJIHwgSVdvcmtzcGFjZUZvbGRlciwgaXNBYnNvbHV0ZT86IGJvb2xlYW4pOiBXb3Jrc3BhY2VGb2xkZXJDd2RQYWlyIHtcblx0cmV0dXJuIHtcblx0XHRmb2xkZXIsXG5cdFx0Y3dkOiAhY3dkID8gZm9sZGVyLnVyaSA6IChjd2QgaW5zdGFuY2VvZiBVUkkgPyBjd2QgOiBjd2QudXJpKSxcblx0XHRpc0Fic29sdXRlOiAhIWlzQWJzb2x1dGUsXG5cdFx0aXNPdmVycmlkZGVuOiAhIWN3ZCAmJiBjd2QudG9TdHJpbmcoKSAhPT0gZm9sZGVyLnVyaS50b1N0cmluZygpLFxuXHR9O1xufVxuXG5zdWl0ZSgndGVybWluYWxBY3Rpb25zJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCByb290OiBVUkkgPSBVUkkuZmlsZSgnL3NvbWUtcm9vdCcpO1xuXHRjb25zdCBhID0gbWFrZUZha2VGb2xkZXIoJ2EnLCBVUkkuam9pblBhdGgocm9vdCwgJ2EnKSk7XG5cdGNvbnN0IGIgPSBtYWtlRmFrZUZvbGRlcignYicsIFVSSS5qb2luUGF0aChyb290LCAnYicpKTtcblx0Y29uc3QgYyA9IG1ha2VGYWtlRm9sZGVyKCdjJywgVVJJLmpvaW5QYXRoKHJvb3QsICdjJykpO1xuXHRjb25zdCBkID0gbWFrZUZha2VGb2xkZXIoJ2QnLCBVUkkuam9pblBhdGgocm9vdCwgJ2QnKSk7XG5cblx0c3VpdGUoJ3Nocmlua1dvcmtzcGFjZUZvbGRlckN3ZFBhaXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZW1wdHkgd2hlbiBnaXZlbiBhcnJheSBpcyBlbXB0eScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChzaHJpbmtXb3Jrc3BhY2VGb2xkZXJDd2RQYWlycyhbXSksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdGhlIG9ubHkgc2luZ2xlIHBhaXIgd2hlbiBnaXZlbiBhcmd1bWVudCBpcyBhIHNpbmdsZSBlbGVtZW50IGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFpcnMgPSBbbWFrZVBhaXIoYSldO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHNocmlua1dvcmtzcGFjZUZvbGRlckN3ZFBhaXJzKHBhaXJzKSwgcGFpcnMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBhbGwgcGFpcnMgd2hlbiBubyByZXBlYXRlZCBjd2RzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFpcnMgPSBbbWFrZVBhaXIoYSksIG1ha2VQYWlyKGIpLCBtYWtlUGFpcihjKV07XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoc2hyaW5rV29ya3NwYWNlRm9sZGVyQ3dkUGFpcnMocGFpcnMpLCBwYWlycyk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnc2hvdWxkIHNlbGVjdCB0aGUgcGFpciB0aGF0IGhhcyB0aGUgc2FtZSBVUkkgd2hlbiByZXBlYXRlZCBjd2RzIGV4aXN0JywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnYWxsIHJlcGVhdGVkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwYWlyQSA9IG1ha2VQYWlyKGEpO1xuXHRcdFx0XHRjb25zdCBwYWlyQiA9IG1ha2VQYWlyKGIsIGEpOyAvLyBDV0QgcG9pbnRzIHRvIEFcblx0XHRcdFx0Y29uc3QgcGFpckMgPSBtYWtlUGFpcihjLCBhKTsgLy8gQ1dEIHBvaW50cyB0byBBXG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChzaHJpbmtXb3Jrc3BhY2VGb2xkZXJDd2RQYWlycyhbcGFpckEsIHBhaXJCLCBwYWlyQ10pLCBbcGFpckFdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCd0d28gcmVwZWF0ZWQgKyBvbmUgZGlmZmVyZW50JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwYWlyQSA9IG1ha2VQYWlyKGEpO1xuXHRcdFx0XHRjb25zdCBwYWlyQiA9IG1ha2VQYWlyKGIsIGEpOyAvLyBDV0QgcG9pbnRzIHRvIEFcblx0XHRcdFx0Y29uc3QgcGFpckMgPSBtYWtlUGFpcihjKTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKHNocmlua1dvcmtzcGFjZUZvbGRlckN3ZFBhaXJzKFtwYWlyQSwgcGFpckIsIHBhaXJDXSksIFtwYWlyQSwgcGFpckNdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCd0d28gcmVwZWF0ZWQgKyB0d28gcmVwZWF0ZWQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhaXJBID0gbWFrZVBhaXIoYSk7XG5cdFx0XHRcdGNvbnN0IHBhaXJCID0gbWFrZVBhaXIoYiwgYSk7IC8vIENXRCBwb2ludHMgdG8gQVxuXHRcdFx0XHRjb25zdCBwYWlyQyA9IG1ha2VQYWlyKGMpO1xuXHRcdFx0XHRjb25zdCBwYWlyRCA9IG1ha2VQYWlyKGQsIGMpO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoc2hyaW5rV29ya3NwYWNlRm9sZGVyQ3dkUGFpcnMoW3BhaXJBLCBwYWlyQiwgcGFpckMsIHBhaXJEXSksIFtwYWlyQSwgcGFpckNdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCd0d28gcmVwZWF0ZWQgKyB0d28gcmVwZWF0ZWQgKHJldmVyc2Ugb3JkZXIpJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwYWlyQiA9IG1ha2VQYWlyKGIsIGEpOyAvLyBDV0QgcG9pbnRzIHRvIEFcblx0XHRcdFx0Y29uc3QgcGFpckEgPSBtYWtlUGFpcihhKTtcblx0XHRcdFx0Y29uc3QgcGFpckQgPSBtYWtlUGFpcihkLCBjKTtcblx0XHRcdFx0Y29uc3QgcGFpckMgPSBtYWtlUGFpcihjKTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKHNocmlua1dvcmtzcGFjZUZvbGRlckN3ZFBhaXJzKFtwYWlyQSwgcGFpckIsIHBhaXJDLCBwYWlyRF0pLCBbcGFpckEsIHBhaXJDXSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxTQUFpQyxxQ0FBcUM7QUFFdEUsU0FBUyxlQUFlLE1BQWMsS0FBNEI7QUFDakUsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBO0FBQUEsSUFDQSxPQUFPO0FBQUEsSUFDUCxZQUFZLE1BQU07QUFBQSxFQUNuQjtBQUNEO0FBRUEsU0FBUyxTQUFTLFFBQTBCLEtBQThCLFlBQThDO0FBQ3ZILFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxLQUFLLENBQUMsTUFBTSxPQUFPLE1BQU8sZUFBZSxNQUFNLE1BQU0sSUFBSTtBQUFBLElBQ3pELFlBQVksQ0FBQyxDQUFDO0FBQUEsSUFDZCxjQUFjLENBQUMsQ0FBQyxPQUFPLElBQUksU0FBUyxNQUFNLE9BQU8sSUFBSSxTQUFTO0FBQUEsRUFDL0Q7QUFDRDtBQUVBLE1BQU0sbUJBQW1CLE1BQU07QUFDOUIsMENBQXdDO0FBRXhDLFFBQU0sT0FBWSxJQUFJLEtBQUssWUFBWTtBQUN2QyxRQUFNLElBQUksZUFBZSxLQUFLLElBQUksU0FBUyxNQUFNLEdBQUcsQ0FBQztBQUNyRCxRQUFNLElBQUksZUFBZSxLQUFLLElBQUksU0FBUyxNQUFNLEdBQUcsQ0FBQztBQUNyRCxRQUFNLElBQUksZUFBZSxLQUFLLElBQUksU0FBUyxNQUFNLEdBQUcsQ0FBQztBQUNyRCxRQUFNLElBQUksZUFBZSxLQUFLLElBQUksU0FBUyxNQUFNLEdBQUcsQ0FBQztBQUVyRCxRQUFNLGlDQUFpQyxNQUFNO0FBQzVDLFNBQUssaURBQWlELE1BQU07QUFDM0Qsc0JBQWdCLDhCQUE4QixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUN0RCxDQUFDO0FBRUQsU0FBSyxvRkFBb0YsTUFBTTtBQUM5RixZQUFNLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUMxQixzQkFBZ0IsOEJBQThCLEtBQUssR0FBRyxLQUFLO0FBQUEsSUFDNUQsQ0FBQztBQUVELFNBQUssaURBQWlELE1BQU07QUFDM0QsWUFBTSxRQUFRLENBQUMsU0FBUyxDQUFDLEdBQUcsU0FBUyxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUM7QUFDcEQsc0JBQWdCLDhCQUE4QixLQUFLLEdBQUcsS0FBSztBQUFBLElBQzVELENBQUM7QUFFRCxVQUFNLHlFQUF5RSxNQUFNO0FBQ3BGLFdBQUssZ0JBQWdCLE1BQU07QUFDMUIsY0FBTSxRQUFRLFNBQVMsQ0FBQztBQUN4QixjQUFNLFFBQVEsU0FBUyxHQUFHLENBQUM7QUFDM0IsY0FBTSxRQUFRLFNBQVMsR0FBRyxDQUFDO0FBQzNCLHdCQUFnQiw4QkFBOEIsQ0FBQyxPQUFPLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7QUFBQSxNQUM5RSxDQUFDO0FBRUQsV0FBSyxnQ0FBZ0MsTUFBTTtBQUMxQyxjQUFNLFFBQVEsU0FBUyxDQUFDO0FBQ3hCLGNBQU0sUUFBUSxTQUFTLEdBQUcsQ0FBQztBQUMzQixjQUFNLFFBQVEsU0FBUyxDQUFDO0FBQ3hCLHdCQUFnQiw4QkFBOEIsQ0FBQyxPQUFPLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEtBQUssQ0FBQztBQUFBLE1BQ3JGLENBQUM7QUFFRCxXQUFLLCtCQUErQixNQUFNO0FBQ3pDLGNBQU0sUUFBUSxTQUFTLENBQUM7QUFDeEIsY0FBTSxRQUFRLFNBQVMsR0FBRyxDQUFDO0FBQzNCLGNBQU0sUUFBUSxTQUFTLENBQUM7QUFDeEIsY0FBTSxRQUFRLFNBQVMsR0FBRyxDQUFDO0FBQzNCLHdCQUFnQiw4QkFBOEIsQ0FBQyxPQUFPLE9BQU8sT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sS0FBSyxDQUFDO0FBQUEsTUFDNUYsQ0FBQztBQUVELFdBQUssK0NBQStDLE1BQU07QUFDekQsY0FBTSxRQUFRLFNBQVMsR0FBRyxDQUFDO0FBQzNCLGNBQU0sUUFBUSxTQUFTLENBQUM7QUFDeEIsY0FBTSxRQUFRLFNBQVMsR0FBRyxDQUFDO0FBQzNCLGNBQU0sUUFBUSxTQUFTLENBQUM7QUFDeEIsd0JBQWdCLDhCQUE4QixDQUFDLE9BQU8sT0FBTyxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxLQUFLLENBQUM7QUFBQSxNQUM1RixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
