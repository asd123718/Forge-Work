import assert from "assert";
import * as platform from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { fixDriveC, getAbsoluteGlob } from "../../node/ripgrepFileSearch.js";
suite("RipgrepFileSearch - etc", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testGetAbsGlob(params) {
    const [folder, glob, expectedResult] = params;
    assert.strictEqual(fixDriveC(getAbsoluteGlob(folder, glob)), expectedResult, JSON.stringify(params));
  }
  (!platform.isWindows ? test.skip : test)("getAbsoluteGlob_win", () => {
    [
      ["C:/foo/bar", "glob/**", "/foo\\bar\\glob\\**"],
      ["c:/", "glob/**", "/glob\\**"],
      ["C:\\foo\\bar", "glob\\**", "/foo\\bar\\glob\\**"],
      ["c:\\foo\\bar", "glob\\**", "/foo\\bar\\glob\\**"],
      ["c:\\", "glob\\**", "/glob\\**"],
      ["\\\\localhost\\c$\\foo\\bar", "glob/**", "\\\\localhost\\c$\\foo\\bar\\glob\\**"],
      // absolute paths are not resolved further
      ["c:/foo/bar", "/path/something", "/path/something"],
      ["c:/foo/bar", "c:\\project\\folder", "/project\\folder"]
    ].forEach(testGetAbsGlob);
  });
  (platform.isWindows ? test.skip : test)("getAbsoluteGlob_posix", () => {
    [
      ["/foo/bar", "glob/**", "/foo/bar/glob/**"],
      ["/", "glob/**", "/glob/**"],
      // absolute paths are not resolved further
      ["/", "/project/folder", "/project/folder"]
    ].forEach(testGetAbsGlob);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXHRlc3RcXG5vZGVcXHJpcGdyZXBGaWxlU2VhcmNoLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGZpeERyaXZlQywgZ2V0QWJzb2x1dGVHbG9iIH0gZnJvbSAnLi4vLi4vbm9kZS9yaXBncmVwRmlsZVNlYXJjaC5qcyc7XG5cbnN1aXRlKCdSaXBncmVwRmlsZVNlYXJjaCAtIGV0YycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGZ1bmN0aW9uIHRlc3RHZXRBYnNHbG9iKHBhcmFtczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBbZm9sZGVyLCBnbG9iLCBleHBlY3RlZFJlc3VsdF0gPSBwYXJhbXM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpeERyaXZlQyhnZXRBYnNvbHV0ZUdsb2IoZm9sZGVyLCBnbG9iKSksIGV4cGVjdGVkUmVzdWx0LCBKU09OLnN0cmluZ2lmeShwYXJhbXMpKTtcblx0fVxuXG5cdCghcGxhdGZvcm0uaXNXaW5kb3dzID8gdGVzdC5za2lwIDogdGVzdCkoJ2dldEFic29sdXRlR2xvYl93aW4nLCAoKSA9PiB7XG5cdFx0W1xuXHRcdFx0WydDOi9mb28vYmFyJywgJ2dsb2IvKionLCAnL2Zvb1xcXFxiYXJcXFxcZ2xvYlxcXFwqKiddLFxuXHRcdFx0WydjOi8nLCAnZ2xvYi8qKicsICcvZ2xvYlxcXFwqKiddLFxuXHRcdFx0WydDOlxcXFxmb29cXFxcYmFyJywgJ2dsb2JcXFxcKionLCAnL2Zvb1xcXFxiYXJcXFxcZ2xvYlxcXFwqKiddLFxuXHRcdFx0WydjOlxcXFxmb29cXFxcYmFyJywgJ2dsb2JcXFxcKionLCAnL2Zvb1xcXFxiYXJcXFxcZ2xvYlxcXFwqKiddLFxuXHRcdFx0WydjOlxcXFwnLCAnZ2xvYlxcXFwqKicsICcvZ2xvYlxcXFwqKiddLFxuXHRcdFx0WydcXFxcXFxcXGxvY2FsaG9zdFxcXFxjJFxcXFxmb29cXFxcYmFyJywgJ2dsb2IvKionLCAnXFxcXFxcXFxsb2NhbGhvc3RcXFxcYyRcXFxcZm9vXFxcXGJhclxcXFxnbG9iXFxcXCoqJ10sXG5cblx0XHRcdC8vIGFic29sdXRlIHBhdGhzIGFyZSBub3QgcmVzb2x2ZWQgZnVydGhlclxuXHRcdFx0WydjOi9mb28vYmFyJywgJy9wYXRoL3NvbWV0aGluZycsICcvcGF0aC9zb21ldGhpbmcnXSxcblx0XHRcdFsnYzovZm9vL2JhcicsICdjOlxcXFxwcm9qZWN0XFxcXGZvbGRlcicsICcvcHJvamVjdFxcXFxmb2xkZXInXVxuXHRcdF0uZm9yRWFjaCh0ZXN0R2V0QWJzR2xvYik7XG5cdH0pO1xuXG5cdChwbGF0Zm9ybS5pc1dpbmRvd3MgPyB0ZXN0LnNraXAgOiB0ZXN0KSgnZ2V0QWJzb2x1dGVHbG9iX3Bvc2l4JywgKCkgPT4ge1xuXHRcdFtcblx0XHRcdFsnL2Zvby9iYXInLCAnZ2xvYi8qKicsICcvZm9vL2Jhci9nbG9iLyoqJ10sXG5cdFx0XHRbJy8nLCAnZ2xvYi8qKicsICcvZ2xvYi8qKiddLFxuXG5cdFx0XHQvLyBhYnNvbHV0ZSBwYXRocyBhcmUgbm90IHJlc29sdmVkIGZ1cnRoZXJcblx0XHRcdFsnLycsICcvcHJvamVjdC9mb2xkZXInLCAnL3Byb2plY3QvZm9sZGVyJ10sXG5cdFx0XS5mb3JFYWNoKHRlc3RHZXRBYnNHbG9iKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLGNBQWM7QUFDMUIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxXQUFXLHVCQUF1QjtBQUUzQyxNQUFNLDJCQUEyQixNQUFNO0FBQ3RDLDBDQUF3QztBQUN4QyxXQUFTLGVBQWUsUUFBd0I7QUFDL0MsVUFBTSxDQUFDLFFBQVEsTUFBTSxjQUFjLElBQUk7QUFDdkMsV0FBTyxZQUFZLFVBQVUsZ0JBQWdCLFFBQVEsSUFBSSxDQUFDLEdBQUcsZ0JBQWdCLEtBQUssVUFBVSxNQUFNLENBQUM7QUFBQSxFQUNwRztBQUVBLEdBQUMsQ0FBQyxTQUFTLFlBQVksS0FBSyxPQUFPLE1BQU0sdUJBQXVCLE1BQU07QUFDckU7QUFBQSxNQUNDLENBQUMsY0FBYyxXQUFXLHFCQUFxQjtBQUFBLE1BQy9DLENBQUMsT0FBTyxXQUFXLFdBQVc7QUFBQSxNQUM5QixDQUFDLGdCQUFnQixZQUFZLHFCQUFxQjtBQUFBLE1BQ2xELENBQUMsZ0JBQWdCLFlBQVkscUJBQXFCO0FBQUEsTUFDbEQsQ0FBQyxRQUFRLFlBQVksV0FBVztBQUFBLE1BQ2hDLENBQUMsK0JBQStCLFdBQVcsdUNBQXVDO0FBQUE7QUFBQSxNQUdsRixDQUFDLGNBQWMsbUJBQW1CLGlCQUFpQjtBQUFBLE1BQ25ELENBQUMsY0FBYyx1QkFBdUIsa0JBQWtCO0FBQUEsSUFDekQsRUFBRSxRQUFRLGNBQWM7QUFBQSxFQUN6QixDQUFDO0FBRUQsR0FBQyxTQUFTLFlBQVksS0FBSyxPQUFPLE1BQU0seUJBQXlCLE1BQU07QUFDdEU7QUFBQSxNQUNDLENBQUMsWUFBWSxXQUFXLGtCQUFrQjtBQUFBLE1BQzFDLENBQUMsS0FBSyxXQUFXLFVBQVU7QUFBQTtBQUFBLE1BRzNCLENBQUMsS0FBSyxtQkFBbUIsaUJBQWlCO0FBQUEsSUFDM0MsRUFBRSxRQUFRLGNBQWM7QUFBQSxFQUN6QixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
