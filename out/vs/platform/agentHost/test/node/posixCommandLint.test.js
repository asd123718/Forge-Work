import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { findPosixOnlyCommands, getRecordedShellCommand } from "./e2e/harness/posixCommandLint.js";
function check(commands) {
  const recorded = commands.map((command) => ({ command, toolName: "bash" }));
  return findPosixOnlyCommands(recorded).map((finding) => finding.command);
}
suite("posixCommandLint", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("flags the POSIX commands models actually reach for", () => {
    const flagged = [
      `wc -l < lines.txt`,
      `printf '%s\\n' "SHELL_VALUE_73"`,
      `ls -1`,
      `ls -la \${workdir}/`,
      `rm \${workdir}/before.txt`,
      `mv before.txt after.txt && ls -la after.txt`,
      `cat missing.txt 2>&1`,
      `mkdir -p output && printf 'NESTED' > output/report.txt`,
      `find / -maxdepth 6 -iname "edit.txt" 2>/dev/null`,
      `xxd \${workdir}/after.txt`,
      `test -f peer-edit.txt && echo EXISTS || echo MISSING`,
      `echo "$HOME"`
    ];
    assert.deepStrictEqual(check(flagged), flagged);
  });
  test("extracts provider shell command fields", () => {
    assert.deepStrictEqual([
      getRecordedShellCommand({ command: "cat command.txt" }),
      getRecordedShellCommand({ cmd: "cat cmd.txt" }),
      getRecordedShellCommand({ command: 1, cmd: "cat fallback.txt" }),
      getRecordedShellCommand(void 0)
    ], [
      "cat command.txt",
      "cat cmd.txt",
      "cat fallback.txt",
      void 0
    ]);
  });
  test("accepts the portable forms the suite standardizes on", () => {
    assert.deepStrictEqual(check([
      `echo SHELL_VALUE_73`,
      `echo "hello from test"`,
      `git status --porcelain`,
      `node -e "console.log(process.cwd())"`,
      `node -e "require('fs').renameSync('before.txt','after.txt')"`,
      `node -e "require('fs').unlinkSync('delete-me.txt')"`,
      `node -e "console.log(require('fs').readdirSync('.').join(' '))"`,
      `node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/report.txt','X')"`,
      `node script.js`,
      // PowerShell defines `pwd` as an alias for `Get-Location`.
      `pwd`
    ]), []);
  });
  test("does not flag POSIX command names appearing as arguments", () => {
    assert.deepStrictEqual(check([
      `node -e "console.log('ls')"`,
      `echo cat`,
      `node -e "require('fs').writeFileSync('rm.txt','x')"`,
      `node -e "console.log(require('fs').readdirSync('.'))"`,
      `git status --find-renames`
    ]), []);
  });
  test("ignores recorder placeholders that look like variable expansions", () => {
    assert.deepStrictEqual(check([
      `node -e "console.log(1)" \${workdir}`,
      `echo \${homedir}`,
      `node script.js \${temp}`
    ]), []);
  });
  test("reports the reason and tool for each finding", () => {
    assert.deepStrictEqual(findPosixOnlyCommands([
      { command: `wc -l lines.txt`, toolName: "bash" },
      { command: `echo ok`, toolName: "bash" },
      { command: `cat x 2>/dev/null`, toolName: "powershell" }
    ]), [
      { command: `wc -l lines.txt`, toolName: "bash", reason: "uses a POSIX coreutil or shell builtin that is not portable to Windows shells" },
      { command: `cat x 2>/dev/null`, toolName: "powershell", reason: "uses a POSIX coreutil or shell builtin that is not portable to Windows shells" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxwb3NpeENvbW1hbmRMaW50LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGZpbmRQb3NpeE9ubHlDb21tYW5kcywgZ2V0UmVjb3JkZWRTaGVsbENvbW1hbmQsIHR5cGUgSVJlY29yZGVkQ29tbWFuZCB9IGZyb20gJy4vZTJlL2hhcm5lc3MvcG9zaXhDb21tYW5kTGludC5qcyc7XG5cbmZ1bmN0aW9uIGNoZWNrKGNvbW1hbmRzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgcmVjb3JkZWQ6IElSZWNvcmRlZENvbW1hbmRbXSA9IGNvbW1hbmRzLm1hcChjb21tYW5kID0+ICh7IGNvbW1hbmQsIHRvb2xOYW1lOiAnYmFzaCcgfSkpO1xuXHRyZXR1cm4gZmluZFBvc2l4T25seUNvbW1hbmRzKHJlY29yZGVkKS5tYXAoZmluZGluZyA9PiBmaW5kaW5nLmNvbW1hbmQpO1xufVxuXG5zdWl0ZSgncG9zaXhDb21tYW5kTGludCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmbGFncyB0aGUgUE9TSVggY29tbWFuZHMgbW9kZWxzIGFjdHVhbGx5IHJlYWNoIGZvcicsICgpID0+IHtcblx0XHQvLyBFdmVyeSBvbmUgb2YgdGhlc2Ugd2FzIHJlY29yZGVkIGludG8gYSByZWFsIGZpeHR1cmUgYnkgYSBwcm92aWRlciBhbmRcblx0XHQvLyBkaXNhYmxlZCBpdHMgdGVzdCBvbiBXaW5kb3dzLlxuXHRcdGNvbnN0IGZsYWdnZWQgPSBbXG5cdFx0XHRgd2MgLWwgPCBsaW5lcy50eHRgLFxuXHRcdFx0YHByaW50ZiAnJXNcXFxcbicgXCJTSEVMTF9WQUxVRV83M1wiYCxcblx0XHRcdGBscyAtMWAsXG5cdFx0XHRgbHMgLWxhIFxcJHt3b3JrZGlyfS9gLFxuXHRcdFx0YHJtIFxcJHt3b3JrZGlyfS9iZWZvcmUudHh0YCxcblx0XHRcdGBtdiBiZWZvcmUudHh0IGFmdGVyLnR4dCAmJiBscyAtbGEgYWZ0ZXIudHh0YCxcblx0XHRcdGBjYXQgbWlzc2luZy50eHQgMj4mMWAsXG5cdFx0XHRgbWtkaXIgLXAgb3V0cHV0ICYmIHByaW50ZiAnTkVTVEVEJyA+IG91dHB1dC9yZXBvcnQudHh0YCxcblx0XHRcdGBmaW5kIC8gLW1heGRlcHRoIDYgLWluYW1lIFwiZWRpdC50eHRcIiAyPi9kZXYvbnVsbGAsXG5cdFx0XHRgeHhkIFxcJHt3b3JrZGlyfS9hZnRlci50eHRgLFxuXHRcdFx0YHRlc3QgLWYgcGVlci1lZGl0LnR4dCAmJiBlY2hvIEVYSVNUUyB8fCBlY2hvIE1JU1NJTkdgLFxuXHRcdFx0YGVjaG8gXCIkSE9NRVwiYCxcblx0XHRdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hlY2soZmxhZ2dlZCksIGZsYWdnZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0cyBwcm92aWRlciBzaGVsbCBjb21tYW5kIGZpZWxkcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldFJlY29yZGVkU2hlbGxDb21tYW5kKHsgY29tbWFuZDogJ2NhdCBjb21tYW5kLnR4dCcgfSksXG5cdFx0XHRnZXRSZWNvcmRlZFNoZWxsQ29tbWFuZCh7IGNtZDogJ2NhdCBjbWQudHh0JyB9KSxcblx0XHRcdGdldFJlY29yZGVkU2hlbGxDb21tYW5kKHsgY29tbWFuZDogMSwgY21kOiAnY2F0IGZhbGxiYWNrLnR4dCcgfSksXG5cdFx0XHRnZXRSZWNvcmRlZFNoZWxsQ29tbWFuZCh1bmRlZmluZWQpLFxuXHRcdF0sIFtcblx0XHRcdCdjYXQgY29tbWFuZC50eHQnLFxuXHRcdFx0J2NhdCBjbWQudHh0Jyxcblx0XHRcdCdjYXQgZmFsbGJhY2sudHh0Jyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXB0cyB0aGUgcG9ydGFibGUgZm9ybXMgdGhlIHN1aXRlIHN0YW5kYXJkaXplcyBvbicsICgpID0+IHtcblx0XHQvLyBBIGZhbHNlIHBvc2l0aXZlIGlzIHdvcnNlIHRoYW4gbm8gbGludDogaXQgd291bGQgYmxvY2sgYSBjb3JyZWN0XG5cdFx0Ly8gcmVjb3JkaW5nIGFuZCBwdXNoIGF1dGhvcnMgdG93YXJkIGRpc2FibGluZyB0aGUgY2hlY2suXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGVjayhbXG5cdFx0XHRgZWNobyBTSEVMTF9WQUxVRV83M2AsXG5cdFx0XHRgZWNobyBcImhlbGxvIGZyb20gdGVzdFwiYCxcblx0XHRcdGBnaXQgc3RhdHVzIC0tcG9yY2VsYWluYCxcblx0XHRcdGBub2RlIC1lIFwiY29uc29sZS5sb2cocHJvY2Vzcy5jd2QoKSlcImAsXG5cdFx0XHRgbm9kZSAtZSBcInJlcXVpcmUoJ2ZzJykucmVuYW1lU3luYygnYmVmb3JlLnR4dCcsJ2FmdGVyLnR4dCcpXCJgLFxuXHRcdFx0YG5vZGUgLWUgXCJyZXF1aXJlKCdmcycpLnVubGlua1N5bmMoJ2RlbGV0ZS1tZS50eHQnKVwiYCxcblx0XHRcdGBub2RlIC1lIFwiY29uc29sZS5sb2cocmVxdWlyZSgnZnMnKS5yZWFkZGlyU3luYygnLicpLmpvaW4oJyAnKSlcImAsXG5cdFx0XHRgbm9kZSAtZSBcImNvbnN0IGZzPXJlcXVpcmUoJ2ZzJyk7ZnMubWtkaXJTeW5jKCdvdXRwdXQnLHtyZWN1cnNpdmU6dHJ1ZX0pO2ZzLndyaXRlRmlsZVN5bmMoJ291dHB1dC9yZXBvcnQudHh0JywnWCcpXCJgLFxuXHRcdFx0YG5vZGUgc2NyaXB0LmpzYCxcblx0XHRcdC8vIFBvd2VyU2hlbGwgZGVmaW5lcyBgcHdkYCBhcyBhbiBhbGlhcyBmb3IgYEdldC1Mb2NhdGlvbmAuXG5cdFx0XHRgcHdkYCxcblx0XHRdKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBmbGFnIFBPU0lYIGNvbW1hbmQgbmFtZXMgYXBwZWFyaW5nIGFzIGFyZ3VtZW50cycsICgpID0+IHtcblx0XHQvLyBUaGUgcGF0dGVybnMgYXJlIGFuY2hvcmVkIHRvIGEgY29tbWFuZCBwb3NpdGlvbiwgc28gYSBjb3JldXRpbCBuYW1lXG5cdFx0Ly8gaW5zaWRlIGEgcXVvdGVkIHN0cmluZyBvciBhcyBwYXJ0IG9mIGEgbG9uZ2VyIHdvcmQgaXMgbm90IGEgY29tbWFuZC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoZWNrKFtcblx0XHRcdGBub2RlIC1lIFwiY29uc29sZS5sb2coJ2xzJylcImAsXG5cdFx0XHRgZWNobyBjYXRgLFxuXHRcdFx0YG5vZGUgLWUgXCJyZXF1aXJlKCdmcycpLndyaXRlRmlsZVN5bmMoJ3JtLnR4dCcsJ3gnKVwiYCxcblx0XHRcdGBub2RlIC1lIFwiY29uc29sZS5sb2cocmVxdWlyZSgnZnMnKS5yZWFkZGlyU3luYygnLicpKVwiYCxcblx0XHRcdGBnaXQgc3RhdHVzIC0tZmluZC1yZW5hbWVzYCxcblx0XHRdKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIHJlY29yZGVyIHBsYWNlaG9sZGVycyB0aGF0IGxvb2sgbGlrZSB2YXJpYWJsZSBleHBhbnNpb25zJywgKCkgPT4ge1xuXHRcdC8vIGAke3dvcmtkaXJ9YCBhbmQgZnJpZW5kcyBhcmUgc3Vic3RpdHV0ZWQgYmFjayBiZWZvcmUgcmVwbGF5LCBzbyB0aGV5XG5cdFx0Ly8gYXJlIG5vdCBQT1NJWCBleHBhbnNpb25zIGV2ZW4gdGhvdWdoIHRoZXkgbG9vayBsaWtlIHRoZW0uXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGVjayhbXG5cdFx0XHRgbm9kZSAtZSBcImNvbnNvbGUubG9nKDEpXCIgXFwke3dvcmtkaXJ9YCxcblx0XHRcdGBlY2hvIFxcJHtob21lZGlyfWAsXG5cdFx0XHRgbm9kZSBzY3JpcHQuanMgXFwke3RlbXB9YCxcblx0XHRdKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIHRoZSByZWFzb24gYW5kIHRvb2wgZm9yIGVhY2ggZmluZGluZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbmRQb3NpeE9ubHlDb21tYW5kcyhbXG5cdFx0XHR7IGNvbW1hbmQ6IGB3YyAtbCBsaW5lcy50eHRgLCB0b29sTmFtZTogJ2Jhc2gnIH0sXG5cdFx0XHR7IGNvbW1hbmQ6IGBlY2hvIG9rYCwgdG9vbE5hbWU6ICdiYXNoJyB9LFxuXHRcdFx0eyBjb21tYW5kOiBgY2F0IHggMj4vZGV2L251bGxgLCB0b29sTmFtZTogJ3Bvd2Vyc2hlbGwnIH0sXG5cdFx0XSksIFtcblx0XHRcdHsgY29tbWFuZDogYHdjIC1sIGxpbmVzLnR4dGAsIHRvb2xOYW1lOiAnYmFzaCcsIHJlYXNvbjogJ3VzZXMgYSBQT1NJWCBjb3JldXRpbCBvciBzaGVsbCBidWlsdGluIHRoYXQgaXMgbm90IHBvcnRhYmxlIHRvIFdpbmRvd3Mgc2hlbGxzJyB9LFxuXHRcdFx0eyBjb21tYW5kOiBgY2F0IHggMj4vZGV2L251bGxgLCB0b29sTmFtZTogJ3Bvd2Vyc2hlbGwnLCByZWFzb246ICd1c2VzIGEgUE9TSVggY29yZXV0aWwgb3Igc2hlbGwgYnVpbHRpbiB0aGF0IGlzIG5vdCBwb3J0YWJsZSB0byBXaW5kb3dzIHNoZWxscycgfSxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QiwrQkFBc0Q7QUFFdEYsU0FBUyxNQUFNLFVBQXVDO0FBQ3JELFFBQU0sV0FBK0IsU0FBUyxJQUFJLGNBQVksRUFBRSxTQUFTLFVBQVUsT0FBTyxFQUFFO0FBQzVGLFNBQU8sc0JBQXNCLFFBQVEsRUFBRSxJQUFJLGFBQVcsUUFBUSxPQUFPO0FBQ3RFO0FBRUEsTUFBTSxvQkFBb0IsTUFBTTtBQUUvQiwwQ0FBd0M7QUFFeEMsT0FBSyxzREFBc0QsTUFBTTtBQUdoRSxVQUFNLFVBQVU7QUFBQSxNQUNmO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsV0FBTyxnQkFBZ0IsTUFBTSxPQUFPLEdBQUcsT0FBTztBQUFBLEVBQy9DLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxNQUFNO0FBQ3BELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsd0JBQXdCLEVBQUUsU0FBUyxrQkFBa0IsQ0FBQztBQUFBLE1BQ3RELHdCQUF3QixFQUFFLEtBQUssY0FBYyxDQUFDO0FBQUEsTUFDOUMsd0JBQXdCLEVBQUUsU0FBUyxHQUFHLEtBQUssbUJBQW1CLENBQUM7QUFBQSxNQUMvRCx3QkFBd0IsTUFBUztBQUFBLElBQ2xDLEdBQUc7QUFBQSxNQUNGO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx3REFBd0QsTUFBTTtBQUdsRSxXQUFPLGdCQUFnQixNQUFNO0FBQUEsTUFDNUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFFQTtBQUFBLElBQ0QsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQ1AsQ0FBQztBQUVELE9BQUssNERBQTRELE1BQU07QUFHdEUsV0FBTyxnQkFBZ0IsTUFBTTtBQUFBLE1BQzVCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQ1AsQ0FBQztBQUVELE9BQUssb0VBQW9FLE1BQU07QUFHOUUsV0FBTyxnQkFBZ0IsTUFBTTtBQUFBLE1BQzVCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUNQLENBQUM7QUFFRCxPQUFLLGdEQUFnRCxNQUFNO0FBQzFELFdBQU8sZ0JBQWdCLHNCQUFzQjtBQUFBLE1BQzVDLEVBQUUsU0FBUyxtQkFBbUIsVUFBVSxPQUFPO0FBQUEsTUFDL0MsRUFBRSxTQUFTLFdBQVcsVUFBVSxPQUFPO0FBQUEsTUFDdkMsRUFBRSxTQUFTLHFCQUFxQixVQUFVLGFBQWE7QUFBQSxJQUN4RCxDQUFDLEdBQUc7QUFBQSxNQUNILEVBQUUsU0FBUyxtQkFBbUIsVUFBVSxRQUFRLFFBQVEsZ0ZBQWdGO0FBQUEsTUFDeEksRUFBRSxTQUFTLHFCQUFxQixVQUFVLGNBQWMsUUFBUSxnRkFBZ0Y7QUFBQSxJQUNqSixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
