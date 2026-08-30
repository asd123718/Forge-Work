import { importAMDNodeModule } from "../../../amdX.js";
import * as filters from "../../common/filters.js";
import { FileAccess } from "../../common/network.js";
const patterns = ["cci", "ida", "pos", "CCI", "enbled", "callback", "gGame", "cons", "zyx", "aBc"];
const _enablePerf = false;
function perfSuite(name, callback) {
  if (_enablePerf) {
    suite(name, callback);
  }
}
perfSuite("Performance - fuzzyMatch", async function() {
  const uri = FileAccess.asBrowserUri("vs/base/test/common/filters.perf.data").toString(true);
  const { data } = await importAMDNodeModule(uri, "");
  console.log(`Matching ${data.length} items against ${patterns.length} patterns (${data.length * patterns.length} operations) `);
  function perfTest(name, match) {
    test(name, () => {
      const t1 = Date.now();
      let count = 0;
      for (let i = 0; i < 2; i++) {
        for (const pattern of patterns) {
          const patternLow = pattern.toLowerCase();
          for (const item of data) {
            count += 1;
            match(pattern, patternLow, 0, item, item.toLowerCase(), 0);
          }
        }
      }
      const d = Date.now() - t1;
      console.log(name, `${d}ms, ${Math.round(count / d) * 15}/15ms, ${Math.round(count / d)}/1ms`);
    });
  }
  perfTest("fuzzyScore", filters.fuzzyScore);
  perfTest("fuzzyScoreGraceful", filters.fuzzyScoreGraceful);
  perfTest("fuzzyScoreGracefulAggressive", filters.fuzzyScoreGracefulAggressive);
});
perfSuite("Performance - IFilter", async function() {
  const uri = FileAccess.asBrowserUri("vs/base/test/common/filters.perf.data").toString(true);
  const { data } = await importAMDNodeModule(uri, "");
  function perfTest(name, match) {
    test(name, () => {
      const t1 = Date.now();
      let count = 0;
      for (let i = 0; i < 2; i++) {
        for (const pattern of patterns) {
          for (const item of data) {
            count += 1;
            match(pattern, item);
          }
        }
      }
      const d = Date.now() - t1;
      console.log(name, `${d}ms, ${Math.round(count / d) * 15}/15ms, ${Math.round(count / d)}/1ms`);
    });
  }
  perfTest("matchesFuzzy", filters.matchesFuzzy);
  perfTest("matchesFuzzy2", filters.matchesFuzzy2);
  perfTest("matchesPrefix", filters.matchesPrefix);
  perfTest("matchesContiguousSubString", filters.matchesContiguousSubString);
  perfTest("matchesCamelCase", filters.matchesCamelCase);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGZpbHRlcnMucGVyZi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCAqIGFzIGZpbHRlcnMgZnJvbSAnLi4vLi4vY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9uZXR3b3JrLmpzJztcblxuY29uc3QgcGF0dGVybnMgPSBbJ2NjaScsICdpZGEnLCAncG9zJywgJ0NDSScsICdlbmJsZWQnLCAnY2FsbGJhY2snLCAnZ0dhbWUnLCAnY29ucycsICd6eXgnLCAnYUJjJ107XG5cbmNvbnN0IF9lbmFibGVQZXJmID0gZmFsc2U7XG5cbmZ1bmN0aW9uIHBlcmZTdWl0ZShuYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAodGhpczogTW9jaGEuU3VpdGUpID0+IHZvaWQpIHtcblx0aWYgKF9lbmFibGVQZXJmKSB7XG5cdFx0c3VpdGUobmFtZSwgY2FsbGJhY2spO1xuXHR9XG59XG5cbnBlcmZTdWl0ZSgnUGVyZm9ybWFuY2UgLSBmdXp6eU1hdGNoJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IHVyaSA9IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKCd2cy9iYXNlL3Rlc3QvY29tbW9uL2ZpbHRlcnMucGVyZi5kYXRhJykudG9TdHJpbmcodHJ1ZSk7XG5cdGNvbnN0IHsgZGF0YSB9ID0gYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCcuL2ZpbHRlcnMucGVyZi5kYXRhLmpzJyk+KHVyaSwgJycpO1xuXG5cdC8vIHN1aXRlU2V0dXAoKCkgPT4gY29uc29sZS5wcm9maWxlKCkpO1xuXHQvLyBzdWl0ZVRlYXJkb3duKCgpID0+IGNvbnNvbGUucHJvZmlsZUVuZCgpKTtcblxuXHRjb25zb2xlLmxvZyhgTWF0Y2hpbmcgJHtkYXRhLmxlbmd0aH0gaXRlbXMgYWdhaW5zdCAke3BhdHRlcm5zLmxlbmd0aH0gcGF0dGVybnMgKCR7ZGF0YS5sZW5ndGggKiBwYXR0ZXJucy5sZW5ndGh9IG9wZXJhdGlvbnMpIGApO1xuXG5cdGZ1bmN0aW9uIHBlcmZUZXN0KG5hbWU6IHN0cmluZywgbWF0Y2g6IGZpbHRlcnMuRnV6enlTY29yZXIpIHtcblx0XHR0ZXN0KG5hbWUsICgpID0+IHtcblxuXHRcdFx0Y29uc3QgdDEgPSBEYXRlLm5vdygpO1xuXHRcdFx0bGV0IGNvdW50ID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjsgaSsrKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiBwYXR0ZXJucykge1xuXHRcdFx0XHRcdGNvbnN0IHBhdHRlcm5Mb3cgPSBwYXR0ZXJuLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGRhdGEpIHtcblx0XHRcdFx0XHRcdGNvdW50ICs9IDE7XG5cdFx0XHRcdFx0XHRtYXRjaChwYXR0ZXJuLCBwYXR0ZXJuTG93LCAwLCBpdGVtLCBpdGVtLnRvTG93ZXJDYXNlKCksIDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZCA9IERhdGUubm93KCkgLSB0MTtcblx0XHRcdGNvbnNvbGUubG9nKG5hbWUsIGAke2R9bXMsICR7TWF0aC5yb3VuZChjb3VudCAvIGQpICogMTV9LzE1bXMsICR7TWF0aC5yb3VuZChjb3VudCAvIGQpfS8xbXNgKTtcblx0XHR9KTtcblx0fVxuXG5cdHBlcmZUZXN0KCdmdXp6eVNjb3JlJywgZmlsdGVycy5mdXp6eVNjb3JlKTtcblx0cGVyZlRlc3QoJ2Z1enp5U2NvcmVHcmFjZWZ1bCcsIGZpbHRlcnMuZnV6enlTY29yZUdyYWNlZnVsKTtcblx0cGVyZlRlc3QoJ2Z1enp5U2NvcmVHcmFjZWZ1bEFnZ3Jlc3NpdmUnLCBmaWx0ZXJzLmZ1enp5U2NvcmVHcmFjZWZ1bEFnZ3Jlc3NpdmUpO1xufSk7XG5cblxucGVyZlN1aXRlKCdQZXJmb3JtYW5jZSAtIElGaWx0ZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3QgdXJpID0gRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoJ3ZzL2Jhc2UvdGVzdC9jb21tb24vZmlsdGVycy5wZXJmLmRhdGEnKS50b1N0cmluZyh0cnVlKTtcblx0Y29uc3QgeyBkYXRhIH0gPSBhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJy4vZmlsdGVycy5wZXJmLmRhdGEuanMnKT4odXJpLCAnJyk7XG5cblx0ZnVuY3Rpb24gcGVyZlRlc3QobmFtZTogc3RyaW5nLCBtYXRjaDogZmlsdGVycy5JRmlsdGVyKSB7XG5cdFx0dGVzdChuYW1lLCAoKSA9PiB7XG5cblx0XHRcdGNvbnN0IHQxID0gRGF0ZS5ub3coKTtcblx0XHRcdGxldCBjb3VudCA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDI7IGkrKykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgcGF0dGVybnMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xuXHRcdFx0XHRcdFx0Y291bnQgKz0gMTtcblx0XHRcdFx0XHRcdG1hdGNoKHBhdHRlcm4sIGl0ZW0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZCA9IERhdGUubm93KCkgLSB0MTtcblx0XHRcdGNvbnNvbGUubG9nKG5hbWUsIGAke2R9bXMsICR7TWF0aC5yb3VuZChjb3VudCAvIGQpICogMTV9LzE1bXMsICR7TWF0aC5yb3VuZChjb3VudCAvIGQpfS8xbXNgKTtcblx0XHR9KTtcblx0fVxuXG5cdHBlcmZUZXN0KCdtYXRjaGVzRnV6enknLCBmaWx0ZXJzLm1hdGNoZXNGdXp6eSk7XG5cdHBlcmZUZXN0KCdtYXRjaGVzRnV6enkyJywgZmlsdGVycy5tYXRjaGVzRnV6enkyKTtcblx0cGVyZlRlc3QoJ21hdGNoZXNQcmVmaXgnLCBmaWx0ZXJzLm1hdGNoZXNQcmVmaXgpO1xuXHRwZXJmVGVzdCgnbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcnLCBmaWx0ZXJzLm1hdGNoZXNDb250aWd1b3VzU3ViU3RyaW5nKTtcblx0cGVyZlRlc3QoJ21hdGNoZXNDYW1lbENhc2UnLCBmaWx0ZXJzLm1hdGNoZXNDYW1lbENhc2UpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxTQUFTLDJCQUEyQjtBQUNwQyxZQUFZLGFBQWE7QUFDekIsU0FBUyxrQkFBa0I7QUFFM0IsTUFBTSxXQUFXLENBQUMsT0FBTyxPQUFPLE9BQU8sT0FBTyxVQUFVLFlBQVksU0FBUyxRQUFRLE9BQU8sS0FBSztBQUVqRyxNQUFNLGNBQWM7QUFFcEIsU0FBUyxVQUFVLE1BQWMsVUFBdUM7QUFDdkUsTUFBSSxhQUFhO0FBQ2hCLFVBQU0sTUFBTSxRQUFRO0FBQUEsRUFDckI7QUFDRDtBQUVBLFVBQVUsNEJBQTRCLGlCQUFrQjtBQUV2RCxRQUFNLE1BQU0sV0FBVyxhQUFhLHVDQUF1QyxFQUFFLFNBQVMsSUFBSTtBQUMxRixRQUFNLEVBQUUsS0FBSyxJQUFJLE1BQU0sb0JBQTZELEtBQUssRUFBRTtBQUszRixVQUFRLElBQUksWUFBWSxLQUFLLE1BQU0sa0JBQWtCLFNBQVMsTUFBTSxjQUFjLEtBQUssU0FBUyxTQUFTLE1BQU0sZUFBZTtBQUU5SCxXQUFTLFNBQVMsTUFBYyxPQUE0QjtBQUMzRCxTQUFLLE1BQU0sTUFBTTtBQUVoQixZQUFNLEtBQUssS0FBSyxJQUFJO0FBQ3BCLFVBQUksUUFBUTtBQUNaLGVBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzNCLG1CQUFXLFdBQVcsVUFBVTtBQUMvQixnQkFBTSxhQUFhLFFBQVEsWUFBWTtBQUN2QyxxQkFBVyxRQUFRLE1BQU07QUFDeEIscUJBQVM7QUFDVCxrQkFBTSxTQUFTLFlBQVksR0FBRyxNQUFNLEtBQUssWUFBWSxHQUFHLENBQUM7QUFBQSxVQUMxRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsWUFBTSxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQ3ZCLGNBQVEsSUFBSSxNQUFNLEdBQUcsQ0FBQyxPQUFPLEtBQUssTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsS0FBSyxNQUFNLFFBQVEsQ0FBQyxDQUFDLE1BQU07QUFBQSxJQUM3RixDQUFDO0FBQUEsRUFDRjtBQUVBLFdBQVMsY0FBYyxRQUFRLFVBQVU7QUFDekMsV0FBUyxzQkFBc0IsUUFBUSxrQkFBa0I7QUFDekQsV0FBUyxnQ0FBZ0MsUUFBUSw0QkFBNEI7QUFDOUUsQ0FBQztBQUdELFVBQVUseUJBQXlCLGlCQUFrQjtBQUVwRCxRQUFNLE1BQU0sV0FBVyxhQUFhLHVDQUF1QyxFQUFFLFNBQVMsSUFBSTtBQUMxRixRQUFNLEVBQUUsS0FBSyxJQUFJLE1BQU0sb0JBQTZELEtBQUssRUFBRTtBQUUzRixXQUFTLFNBQVMsTUFBYyxPQUF3QjtBQUN2RCxTQUFLLE1BQU0sTUFBTTtBQUVoQixZQUFNLEtBQUssS0FBSyxJQUFJO0FBQ3BCLFVBQUksUUFBUTtBQUNaLGVBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzNCLG1CQUFXLFdBQVcsVUFBVTtBQUMvQixxQkFBVyxRQUFRLE1BQU07QUFDeEIscUJBQVM7QUFDVCxrQkFBTSxTQUFTLElBQUk7QUFBQSxVQUNwQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsWUFBTSxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQ3ZCLGNBQVEsSUFBSSxNQUFNLEdBQUcsQ0FBQyxPQUFPLEtBQUssTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsS0FBSyxNQUFNLFFBQVEsQ0FBQyxDQUFDLE1BQU07QUFBQSxJQUM3RixDQUFDO0FBQUEsRUFDRjtBQUVBLFdBQVMsZ0JBQWdCLFFBQVEsWUFBWTtBQUM3QyxXQUFTLGlCQUFpQixRQUFRLGFBQWE7QUFDL0MsV0FBUyxpQkFBaUIsUUFBUSxhQUFhO0FBQy9DLFdBQVMsOEJBQThCLFFBQVEsMEJBQTBCO0FBQ3pFLFdBQVMsb0JBQW9CLFFBQVEsZ0JBQWdCO0FBQ3RELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
