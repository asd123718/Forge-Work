import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { scrubUserName } from "./e2e/harness/userNameScrub.js";
suite("userNameScrub", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("scrubs the account name in path segments", () => {
    assert.deepStrictEqual([
      "/home/runner/work/file.txt",
      "C:\\Users\\runner\\AppData\\Local",
      "file:///home/runner/x",
      "/home/runner",
      "/home/runner\nnext line",
      "path: '/home/runner'",
      "path: `/home/runner`",
      "path: /home/runner,",
      // Embedded JSON escapes the separator.
      '{"path":"C:\\\\Users\\\\runner\\\\x"}',
      '{"path":"/home/runner"}'
    ].map((text) => scrubUserName(text, "runner")), [
      "/home/${user}/work/file.txt",
      "C:\\Users\\${user}\\AppData\\Local",
      "file:///home/${user}/x",
      "/home/${user}",
      "/home/${user}\nnext line",
      "path: '/home/${user}'",
      "path: `/home/${user}`",
      "path: /home/${user},",
      '{"path":"C:\\\\Users\\\\${user}\\\\x"}',
      '{"path":"/home/${user}"}'
    ]);
  });
  test("scrubs the owner and group columns of an ls -l listing", () => {
    const listing = [
      "drwx------     4 runner  staff     128 Jan  1 12:00 .",
      "-rw-r--r--     1 runner  runner      5 Jan  1 12:00 file-a.txt",
      "-rw-r--r--@    1 other   staff       4 Jan  1 12:00 file-b.txt"
    ].join("\n");
    assert.strictEqual(scrubUserName(listing, "runner"), [
      "drwx------     4 ${user}  staff     128 Jan  1 12:00 .",
      "-rw-r--r--     1 ${user}  ${user}      5 Jan  1 12:00 file-a.txt",
      "-rw-r--r--@    1 other   staff       4 Jan  1 12:00 file-b.txt"
    ].join("\n"));
  });
  test("leaves the account name alone when it is an ordinary word", () => {
    const prose = [
      "the runner completed successfully",
      "Test runner exited with code 0",
      "runner.js",
      "forerunner",
      "runneradmin",
      "a runner-up value",
      "/tmp/runner.js",
      "C:\\Users\\runner-admin\\AppData"
    ];
    assert.deepStrictEqual(prose.map((text) => scrubUserName(text, "runner")), prose);
  });
  test("is a no-op without an account name", () => {
    assert.strictEqual(scrubUserName("/home/runner/x", ""), "/home/runner/x");
  });
  test("escapes regular expression characters in the account name", () => {
    assert.strictEqual(scrubUserName("/home/a.b/x", "a.b"), "/home/${user}/x");
    assert.strictEqual(scrubUserName("/home/axb/x", "a.b"), "/home/axb/x");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFx1c2VyTmFtZVNjcnViLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHNjcnViVXNlck5hbWUgfSBmcm9tICcuL2UyZS9oYXJuZXNzL3VzZXJOYW1lU2NydWIuanMnO1xuXG4vKipcbiAqIGBydW5uZXJgIGlzIHVzZWQgdGhyb3VnaG91dCBiZWNhdXNlIGl0IGlzIHRoZSBHaXRIdWIgQWN0aW9ucyBMaW51eCBhY2NvdW50XG4gKiBuYW1lICphbmQqIGFuIG9yZGluYXJ5IEVuZ2xpc2ggd29yZCBcdTIwMTQgdGhlIGNhc2UgYSBwbGFpbiBzdWJzdHJpbmcgcmVwbGFjZSBnZXRzXG4gKiB3cm9uZywgYW5kIHRoZSBvbmUgdGhhdCBtYXR0ZXJzIG1vc3Qgc2luY2UgaXQgb25seSBtaXNiZWhhdmVzIG9uIHNvbWVcbiAqIHBsYXRmb3Jtcy5cbiAqL1xuc3VpdGUoJ3VzZXJOYW1lU2NydWInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2NydWJzIHRoZSBhY2NvdW50IG5hbWUgaW4gcGF0aCBzZWdtZW50cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdCcvaG9tZS9ydW5uZXIvd29yay9maWxlLnR4dCcsXG5cdFx0XHQnQzpcXFxcVXNlcnNcXFxccnVubmVyXFxcXEFwcERhdGFcXFxcTG9jYWwnLFxuXHRcdFx0J2ZpbGU6Ly8vaG9tZS9ydW5uZXIveCcsXG5cdFx0XHQnL2hvbWUvcnVubmVyJyxcblx0XHRcdCcvaG9tZS9ydW5uZXJcXG5uZXh0IGxpbmUnLFxuXHRcdFx0J3BhdGg6IFxcJy9ob21lL3J1bm5lclxcJycsXG5cdFx0XHQncGF0aDogYC9ob21lL3J1bm5lcmAnLFxuXHRcdFx0J3BhdGg6IC9ob21lL3J1bm5lciwnLFxuXHRcdFx0Ly8gRW1iZWRkZWQgSlNPTiBlc2NhcGVzIHRoZSBzZXBhcmF0b3IuXG5cdFx0XHQne1wicGF0aFwiOlwiQzpcXFxcXFxcXFVzZXJzXFxcXFxcXFxydW5uZXJcXFxcXFxcXHhcIn0nLFxuXHRcdFx0J3tcInBhdGhcIjpcIi9ob21lL3J1bm5lclwifScsXG5cdFx0XS5tYXAodGV4dCA9PiBzY3J1YlVzZXJOYW1lKHRleHQsICdydW5uZXInKSksIFtcblx0XHRcdCcvaG9tZS8ke3VzZXJ9L3dvcmsvZmlsZS50eHQnLFxuXHRcdFx0J0M6XFxcXFVzZXJzXFxcXCR7dXNlcn1cXFxcQXBwRGF0YVxcXFxMb2NhbCcsXG5cdFx0XHQnZmlsZTovLy9ob21lLyR7dXNlcn0veCcsXG5cdFx0XHQnL2hvbWUvJHt1c2VyfScsXG5cdFx0XHQnL2hvbWUvJHt1c2VyfVxcbm5leHQgbGluZScsXG5cdFx0XHQncGF0aDogXFwnL2hvbWUvJHt1c2VyfVxcJycsXG5cdFx0XHQncGF0aDogYC9ob21lLyR7dXNlcn1gJyxcblx0XHRcdCdwYXRoOiAvaG9tZS8ke3VzZXJ9LCcsXG5cdFx0XHQne1wicGF0aFwiOlwiQzpcXFxcXFxcXFVzZXJzXFxcXFxcXFwke3VzZXJ9XFxcXFxcXFx4XCJ9Jyxcblx0XHRcdCd7XCJwYXRoXCI6XCIvaG9tZS8ke3VzZXJ9XCJ9Jyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2NydWJzIHRoZSBvd25lciBhbmQgZ3JvdXAgY29sdW1ucyBvZiBhbiBscyAtbCBsaXN0aW5nJywgKCkgPT4ge1xuXHRcdC8vIEV4YWN0bHkgdGhlIHNoYXBlIHJlY29yZGVkIGluIHRoZSBjb21taXR0ZWQgc3ViYWdlbnQgY2FwdHVyZS5cblx0XHRjb25zdCBsaXN0aW5nID0gW1xuXHRcdFx0J2Ryd3gtLS0tLS0gICAgIDQgcnVubmVyICBzdGFmZiAgICAgMTI4IEphbiAgMSAxMjowMCAuJyxcblx0XHRcdCctcnctci0tci0tICAgICAxIHJ1bm5lciAgcnVubmVyICAgICAgNSBKYW4gIDEgMTI6MDAgZmlsZS1hLnR4dCcsXG5cdFx0XHQnLXJ3LXItLXItLUAgICAgMSBvdGhlciAgIHN0YWZmICAgICAgIDQgSmFuICAxIDEyOjAwIGZpbGUtYi50eHQnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjcnViVXNlck5hbWUobGlzdGluZywgJ3J1bm5lcicpLCBbXG5cdFx0XHQnZHJ3eC0tLS0tLSAgICAgNCAke3VzZXJ9ICBzdGFmZiAgICAgMTI4IEphbiAgMSAxMjowMCAuJyxcblx0XHRcdCctcnctci0tci0tICAgICAxICR7dXNlcn0gICR7dXNlcn0gICAgICA1IEphbiAgMSAxMjowMCBmaWxlLWEudHh0Jyxcblx0XHRcdCctcnctci0tci0tQCAgICAxIG90aGVyICAgc3RhZmYgICAgICAgNCBKYW4gIDEgMTI6MDAgZmlsZS1iLnR4dCcsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyB0aGUgYWNjb3VudCBuYW1lIGFsb25lIHdoZW4gaXQgaXMgYW4gb3JkaW5hcnkgd29yZCcsICgpID0+IHtcblx0XHQvLyBUaGUgcmVncmVzc2lvbiB0aGlzIGV4aXN0cyB0byBwcmV2ZW50OiBhIHBsYWluIHN1YnN0cmluZyByZXBsYWNlIHR1cm5zXG5cdFx0Ly8gZXZlcnkgb25lIG9mIHRoZXNlIGludG8gYCR7dXNlcn1gLlxuXHRcdGNvbnN0IHByb3NlID0gW1xuXHRcdFx0J3RoZSBydW5uZXIgY29tcGxldGVkIHN1Y2Nlc3NmdWxseScsXG5cdFx0XHQnVGVzdCBydW5uZXIgZXhpdGVkIHdpdGggY29kZSAwJyxcblx0XHRcdCdydW5uZXIuanMnLFxuXHRcdFx0J2ZvcmVydW5uZXInLFxuXHRcdFx0J3J1bm5lcmFkbWluJyxcblx0XHRcdCdhIHJ1bm5lci11cCB2YWx1ZScsXG5cdFx0XHQnL3RtcC9ydW5uZXIuanMnLFxuXHRcdFx0J0M6XFxcXFVzZXJzXFxcXHJ1bm5lci1hZG1pblxcXFxBcHBEYXRhJyxcblx0XHRdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvc2UubWFwKHRleHQgPT4gc2NydWJVc2VyTmFtZSh0ZXh0LCAncnVubmVyJykpLCBwcm9zZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzIGEgbm8tb3Agd2l0aG91dCBhbiBhY2NvdW50IG5hbWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjcnViVXNlck5hbWUoJy9ob21lL3J1bm5lci94JywgJycpLCAnL2hvbWUvcnVubmVyL3gnKTtcblx0fSk7XG5cblx0dGVzdCgnZXNjYXBlcyByZWd1bGFyIGV4cHJlc3Npb24gY2hhcmFjdGVycyBpbiB0aGUgYWNjb3VudCBuYW1lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY3J1YlVzZXJOYW1lKCcvaG9tZS9hLmIveCcsICdhLmInKSwgJy9ob21lLyR7dXNlcn0veCcpO1xuXHRcdC8vIFRoZSBgLmAgbXVzdCBub3QgYmVoYXZlIGFzIGEgd2lsZGNhcmQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjcnViVXNlck5hbWUoJy9ob21lL2F4Yi94JywgJ2EuYicpLCAnL2hvbWUvYXhiL3gnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFCQUFxQjtBQVE5QixNQUFNLGlCQUFpQixNQUFNO0FBRTVCLDBDQUF3QztBQUV4QyxPQUFLLDRDQUE0QyxNQUFNO0FBQ3RELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUVBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxJQUFJLFVBQVEsY0FBYyxNQUFNLFFBQVEsQ0FBQyxHQUFHO0FBQUEsTUFDN0M7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBEQUEwRCxNQUFNO0FBRXBFLFVBQU0sVUFBVTtBQUFBLE1BQ2Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUk7QUFDWCxXQUFPLFlBQVksY0FBYyxTQUFTLFFBQVEsR0FBRztBQUFBLE1BQ3BEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJLENBQUM7QUFBQSxFQUNiLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBR3ZFLFVBQU0sUUFBUTtBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFdBQU8sZ0JBQWdCLE1BQU0sSUFBSSxVQUFRLGNBQWMsTUFBTSxRQUFRLENBQUMsR0FBRyxLQUFLO0FBQUEsRUFDL0UsQ0FBQztBQUVELE9BQUssc0NBQXNDLE1BQU07QUFDaEQsV0FBTyxZQUFZLGNBQWMsa0JBQWtCLEVBQUUsR0FBRyxnQkFBZ0I7QUFBQSxFQUN6RSxDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxXQUFPLFlBQVksY0FBYyxlQUFlLEtBQUssR0FBRyxpQkFBaUI7QUFFekUsV0FBTyxZQUFZLGNBQWMsZUFBZSxLQUFLLEdBQUcsYUFBYTtBQUFBLEVBQ3RFLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
