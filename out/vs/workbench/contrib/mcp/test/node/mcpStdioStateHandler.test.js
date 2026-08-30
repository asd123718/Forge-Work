import { spawn } from "child_process";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import * as assert from "assert";
import { McpStdioStateHandler } from "../../node/mcpStdioStateHandler.js";
import { isWindows } from "../../../../../base/common/platform.js";
const GRACE_TIME = 100;
suite("McpStdioStateHandler", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function run(code) {
    const child = spawn("node", ["-e", code], {
      stdio: "pipe",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    });
    return {
      child,
      handler: store.add(new McpStdioStateHandler(child, GRACE_TIME)),
      processId: new Promise((resolve) => {
        child.on("spawn", () => resolve(child.pid));
      }),
      output: new Promise((resolve, reject) => {
        let output = "";
        child.stderr.setEncoding("utf-8").on("data", (data) => {
          output += data.toString();
        });
        child.stdout.setEncoding("utf-8").on("data", (data) => {
          output += data.toString();
        });
        child.on("error", reject);
        child.on("close", () => resolve(output));
      })
    };
  }
  test.skip("stdin ends process", async () => {
    const { child, handler, output } = run(`
			const data = require('fs').readFileSync(0, 'utf-8');
			process.stdout.write('Data received: ' + data);
			process.on('SIGTERM', () => process.stdout.write('SIGTERM received'));
		`);
    await new Promise((r) => child.stdin.write("Hello MCP!", () => r()));
    handler.stop();
    const result = await output;
    assert.strictEqual(result.trim(), "Data received: Hello MCP!");
  });
  if (!isWindows) {
    test.skip("sigterm after grace", async () => {
      const { handler, output } = run(`
			setInterval(() => {}, 1000);
			process.stdin.on('end', () => process.stdout.write('stdin ended\\n'));
			process.stdin.resume();
			process.on('SIGTERM', () => {
				process.stdout.write('SIGTERM received', () => {
					process.stdout.end(() => process.exit(0));
				});
			});
		`);
      const before = Date.now();
      handler.stop();
      const result = await output;
      const delay = Date.now() - before;
      assert.strictEqual(result.trim(), "stdin ended\nSIGTERM received");
      assert.ok(delay >= GRACE_TIME, `Expected at least ${GRACE_TIME}ms delay, got ${delay}ms`);
    });
  }
  test("sigkill after grace", async () => {
    const { handler, output } = run(`
			setInterval(() => {}, 1000);
			process.stdin.on('end', () => process.stdout.write('stdin ended\\n'));
			process.stdin.resume();
			process.on('SIGTERM', () => {
				process.stdout.write('SIGTERM received');
			});
		`);
    const before = Date.now();
    handler.stop();
    const result = await output;
    const delay = Date.now() - before;
    if (!isWindows) {
      assert.strictEqual(result.trim(), "stdin ended\nSIGTERM received");
    } else {
      assert.strictEqual(result.trim(), "stdin ended");
    }
    assert.ok(delay >= GRACE_TIME * 2, `Expected at least ${GRACE_TIME * 2}ms delay, got ${delay}ms`);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcbm9kZVxcbWNwU3RkaW9TdGF0ZUhhbmRsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHNwYXduIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgTWNwU3RkaW9TdGF0ZUhhbmRsZXIgfSBmcm9tICcuLi8uLi9ub2RlL21jcFN0ZGlvU3RhdGVIYW5kbGVyLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuY29uc3QgR1JBQ0VfVElNRSA9IDEwMDtcblxuc3VpdGUoJ01jcFN0ZGlvU3RhdGVIYW5kbGVyJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHJ1bihjb2RlOiBzdHJpbmcpIHtcblx0XHRjb25zdCBjaGlsZCA9IHNwYXduKCdub2RlJywgWyctZScsIGNvZGVdLCB7XG5cdFx0XHRzdGRpbzogJ3BpcGUnLFxuXHRcdFx0ZW52OiB7IC4uLnByb2Nlc3MuZW52LCBFTEVDVFJPTl9SVU5fQVNfTk9ERTogJzEnIH0sXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2hpbGQsXG5cdFx0XHRoYW5kbGVyOiBzdG9yZS5hZGQobmV3IE1jcFN0ZGlvU3RhdGVIYW5kbGVyKGNoaWxkLCBHUkFDRV9USU1FKSksXG5cdFx0XHRwcm9jZXNzSWQ6IG5ldyBQcm9taXNlPG51bWJlcj4oKHJlc29sdmUpID0+IHtcblx0XHRcdFx0Y2hpbGQub24oJ3NwYXduJywgKCkgPT4gcmVzb2x2ZShjaGlsZC5waWQhKSk7XG5cdFx0XHR9KSxcblx0XHRcdG91dHB1dDogbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGxldCBvdXRwdXQgPSAnJztcblx0XHRcdFx0Y2hpbGQuc3RkZXJyLnNldEVuY29kaW5nKCd1dGYtOCcpLm9uKCdkYXRhJywgKGRhdGEpID0+IHtcblx0XHRcdFx0XHRvdXRwdXQgKz0gZGF0YS50b1N0cmluZygpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y2hpbGQuc3Rkb3V0LnNldEVuY29kaW5nKCd1dGYtOCcpLm9uKCdkYXRhJywgKGRhdGEpID0+IHtcblx0XHRcdFx0XHRvdXRwdXQgKz0gZGF0YS50b1N0cmluZygpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y2hpbGQub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdFx0Y2hpbGQub24oJ2Nsb3NlJywgKCkgPT4gcmVzb2x2ZShvdXRwdXQpKTtcblx0XHRcdH0pLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0LnNraXAoJ3N0ZGluIGVuZHMgcHJvY2VzcycsIGFzeW5jICgpID0+IHsgLy8gVE9ETzogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMzMDEzNFxuXHRcdGNvbnN0IHsgY2hpbGQsIGhhbmRsZXIsIG91dHB1dCB9ID0gcnVuKGBcblx0XHRcdGNvbnN0IGRhdGEgPSByZXF1aXJlKCdmcycpLnJlYWRGaWxlU3luYygwLCAndXRmLTgnKTtcblx0XHRcdHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdEYXRhIHJlY2VpdmVkOiAnICsgZGF0YSk7XG5cdFx0XHRwcm9jZXNzLm9uKCdTSUdURVJNJywgKCkgPT4gcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1NJR1RFUk0gcmVjZWl2ZWQnKSk7XG5cdFx0YCk7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IGNoaWxkLnN0ZGluLndyaXRlKCdIZWxsbyBNQ1AhJywgKCkgPT4gcigpKSk7XG5cdFx0aGFuZGxlci5zdG9wKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgb3V0cHV0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCAnRGF0YSByZWNlaXZlZDogSGVsbG8gTUNQIScpO1xuXHR9KTtcblxuXHRpZiAoIWlzV2luZG93cykge1xuXHRcdHRlc3Quc2tpcCgnc2lndGVybSBhZnRlciBncmFjZScsIGFzeW5jICgpID0+IHsgLy8gVE9ET0Bjb25ub3I0MzEyIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMzAxMzRcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgb3V0cHV0IH0gPSBydW4oYFxuXHRcdFx0c2V0SW50ZXJ2YWwoKCkgPT4ge30sIDEwMDApO1xuXHRcdFx0cHJvY2Vzcy5zdGRpbi5vbignZW5kJywgKCkgPT4gcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ3N0ZGluIGVuZGVkXFxcXG4nKSk7XG5cdFx0XHRwcm9jZXNzLnN0ZGluLnJlc3VtZSgpO1xuXHRcdFx0cHJvY2Vzcy5vbignU0lHVEVSTScsICgpID0+IHtcblx0XHRcdFx0cHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1NJR1RFUk0gcmVjZWl2ZWQnLCAoKSA9PiB7XG5cdFx0XHRcdFx0cHJvY2Vzcy5zdGRvdXQuZW5kKCgpID0+IHByb2Nlc3MuZXhpdCgwKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0YCk7XG5cblx0XHRcdGNvbnN0IGJlZm9yZSA9IERhdGUubm93KCk7XG5cdFx0XHRoYW5kbGVyLnN0b3AoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG91dHB1dDtcblx0XHRcdGNvbnN0IGRlbGF5ID0gRGF0ZS5ub3coKSAtIGJlZm9yZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCAnc3RkaW4gZW5kZWRcXG5TSUdURVJNIHJlY2VpdmVkJyk7XG5cdFx0XHRhc3NlcnQub2soZGVsYXkgPj0gR1JBQ0VfVElNRSwgYEV4cGVjdGVkIGF0IGxlYXN0ICR7R1JBQ0VfVElNRX1tcyBkZWxheSwgZ290ICR7ZGVsYXl9bXNgKTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ3NpZ2tpbGwgYWZ0ZXIgZ3JhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBvdXRwdXQgfSA9IHJ1bihgXG5cdFx0XHRzZXRJbnRlcnZhbCgoKSA9PiB7fSwgMTAwMCk7XG5cdFx0XHRwcm9jZXNzLnN0ZGluLm9uKCdlbmQnLCAoKSA9PiBwcm9jZXNzLnN0ZG91dC53cml0ZSgnc3RkaW4gZW5kZWRcXFxcbicpKTtcblx0XHRcdHByb2Nlc3Muc3RkaW4ucmVzdW1lKCk7XG5cdFx0XHRwcm9jZXNzLm9uKCdTSUdURVJNJywgKCkgPT4ge1xuXHRcdFx0XHRwcm9jZXNzLnN0ZG91dC53cml0ZSgnU0lHVEVSTSByZWNlaXZlZCcpO1xuXHRcdFx0fSk7XG5cdFx0YCk7XG5cblx0XHRjb25zdCBiZWZvcmUgPSBEYXRlLm5vdygpO1xuXHRcdGhhbmRsZXIuc3RvcCgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG91dHB1dDtcblx0XHRjb25zdCBkZWxheSA9IERhdGUubm93KCkgLSBiZWZvcmU7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCAnc3RkaW4gZW5kZWRcXG5TSUdURVJNIHJlY2VpdmVkJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCAnc3RkaW4gZW5kZWQnKTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKGRlbGF5ID49IEdSQUNFX1RJTUUgKiAyLCBgRXhwZWN0ZWQgYXQgbGVhc3QgJHtHUkFDRV9USU1FICogMn1tcyBkZWxheSwgZ290ICR7ZGVsYXl9bXNgKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLCtDQUErQztBQUN4RCxZQUFZLFlBQVk7QUFDeEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxpQkFBaUI7QUFFMUIsTUFBTSxhQUFhO0FBRW5CLE1BQU0sd0JBQXdCLE1BQU07QUFDbkMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxXQUFTLElBQUksTUFBYztBQUMxQixVQUFNLFFBQVEsTUFBTSxRQUFRLENBQUMsTUFBTSxJQUFJLEdBQUc7QUFBQSxNQUN6QyxPQUFPO0FBQUEsTUFDUCxLQUFLLEVBQUUsR0FBRyxRQUFRLEtBQUssc0JBQXNCLElBQUk7QUFBQSxJQUNsRCxDQUFDO0FBRUQsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBLFNBQVMsTUFBTSxJQUFJLElBQUkscUJBQXFCLE9BQU8sVUFBVSxDQUFDO0FBQUEsTUFDOUQsV0FBVyxJQUFJLFFBQWdCLENBQUMsWUFBWTtBQUMzQyxjQUFNLEdBQUcsU0FBUyxNQUFNLFFBQVEsTUFBTSxHQUFJLENBQUM7QUFBQSxNQUM1QyxDQUFDO0FBQUEsTUFDRCxRQUFRLElBQUksUUFBZ0IsQ0FBQyxTQUFTLFdBQVc7QUFDaEQsWUFBSSxTQUFTO0FBQ2IsY0FBTSxPQUFPLFlBQVksT0FBTyxFQUFFLEdBQUcsUUFBUSxDQUFDLFNBQVM7QUFDdEQsb0JBQVUsS0FBSyxTQUFTO0FBQUEsUUFDekIsQ0FBQztBQUNELGNBQU0sT0FBTyxZQUFZLE9BQU8sRUFBRSxHQUFHLFFBQVEsQ0FBQyxTQUFTO0FBQ3RELG9CQUFVLEtBQUssU0FBUztBQUFBLFFBQ3pCLENBQUM7QUFDRCxjQUFNLEdBQUcsU0FBUyxNQUFNO0FBQ3hCLGNBQU0sR0FBRyxTQUFTLE1BQU0sUUFBUSxNQUFNLENBQUM7QUFBQSxNQUN4QyxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFFQSxPQUFLLEtBQUssc0JBQXNCLFlBQVk7QUFDM0MsVUFBTSxFQUFFLE9BQU8sU0FBUyxPQUFPLElBQUksSUFBSTtBQUFBO0FBQUE7QUFBQTtBQUFBLEdBSXRDO0FBRUQsVUFBTSxJQUFJLFFBQWMsT0FBSyxNQUFNLE1BQU0sTUFBTSxjQUFjLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFDdkUsWUFBUSxLQUFLO0FBQ2IsVUFBTSxTQUFTLE1BQU07QUFDckIsV0FBTyxZQUFZLE9BQU8sS0FBSyxHQUFHLDJCQUEyQjtBQUFBLEVBQzlELENBQUM7QUFFRCxNQUFJLENBQUMsV0FBVztBQUNmLFNBQUssS0FBSyx1QkFBdUIsWUFBWTtBQUM1QyxZQUFNLEVBQUUsU0FBUyxPQUFPLElBQUksSUFBSTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxHQVNoQztBQUVBLFlBQU0sU0FBUyxLQUFLLElBQUk7QUFDeEIsY0FBUSxLQUFLO0FBQ2IsWUFBTSxTQUFTLE1BQU07QUFDckIsWUFBTSxRQUFRLEtBQUssSUFBSSxJQUFJO0FBQzNCLGFBQU8sWUFBWSxPQUFPLEtBQUssR0FBRywrQkFBK0I7QUFDakUsYUFBTyxHQUFHLFNBQVMsWUFBWSxxQkFBcUIsVUFBVSxpQkFBaUIsS0FBSyxJQUFJO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxPQUFLLHVCQUF1QixZQUFZO0FBQ3ZDLFVBQU0sRUFBRSxTQUFTLE9BQU8sSUFBSSxJQUFJO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsR0FPL0I7QUFFRCxVQUFNLFNBQVMsS0FBSyxJQUFJO0FBQ3hCLFlBQVEsS0FBSztBQUNiLFVBQU0sU0FBUyxNQUFNO0FBQ3JCLFVBQU0sUUFBUSxLQUFLLElBQUksSUFBSTtBQUMzQixRQUFJLENBQUMsV0FBVztBQUNmLGFBQU8sWUFBWSxPQUFPLEtBQUssR0FBRywrQkFBK0I7QUFBQSxJQUNsRSxPQUFPO0FBQ04sYUFBTyxZQUFZLE9BQU8sS0FBSyxHQUFHLGFBQWE7QUFBQSxJQUNoRDtBQUNBLFdBQU8sR0FBRyxTQUFTLGFBQWEsR0FBRyxxQkFBcUIsYUFBYSxDQUFDLGlCQUFpQixLQUFLLElBQUk7QUFBQSxFQUNqRyxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
