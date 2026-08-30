import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { prepareCommand } from "../../node/terminals.js";
suite("Debug - prepareCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("bash", () => {
    assert.strictEqual(
      prepareCommand("bash", ["{$} ("], false).trim(),
      "\\{\\$\\}\\ \\("
    );
    assert.strictEqual(
      prepareCommand("bash", ["hello", "world", "--flag=true"], false).trim(),
      "hello world --flag=true"
    );
    assert.strictEqual(
      prepareCommand("bash", [" space arg "], false).trim(),
      "\\ space\\ arg\\"
    );
    assert.strictEqual(
      prepareCommand("bash", ["{$} ("], true).trim(),
      "{$} ("
    );
    assert.strictEqual(
      prepareCommand("bash", ["hello", "world", "--flag=true"], true).trim(),
      "hello world --flag=true"
    );
    assert.strictEqual(
      prepareCommand("bash", [" space arg "], true).trim(),
      "space arg"
    );
  });
  test("bash - do not escape > and <", () => {
    assert.strictEqual(
      prepareCommand("bash", ["arg1", ">", "> hello.txt", "<", "<input.in"], false).trim(),
      "arg1 > \\>\\ hello.txt < \\<input.in"
    );
  });
  test("cmd", () => {
    assert.strictEqual(
      prepareCommand("cmd.exe", ["^!< "], false).trim(),
      '"^^^!^< "'
    );
    assert.strictEqual(
      prepareCommand("cmd.exe", ["hello", "world", "--flag=true"], false).trim(),
      "hello world --flag=true"
    );
    assert.strictEqual(
      prepareCommand("cmd.exe", [" space arg "], false).trim(),
      '" space arg "'
    );
    assert.strictEqual(
      prepareCommand("cmd.exe", ['"A>0"'], false).trim(),
      '"""A^>0"""'
    );
    assert.strictEqual(
      prepareCommand("cmd.exe", [""], false).trim(),
      '""'
    );
    assert.strictEqual(
      prepareCommand("cmd.exe", ["^!< "], true).trim(),
      "^!<"
    );
    assert.strictEqual(
      prepareCommand("cmd.exe", ["hello", "world", "--flag=true"], true).trim(),
      "hello world --flag=true"
    );
    assert.strictEqual(
      prepareCommand("cmd.exe", [" space arg "], true).trim(),
      "space arg"
    );
    assert.strictEqual(
      prepareCommand("cmd.exe", ['"A>0"'], true).trim(),
      '"A>0"'
    );
    assert.strictEqual(
      prepareCommand("cmd.exe", [""], true).trim(),
      ""
    );
  });
  test("cmd - do not escape > and <", () => {
    assert.strictEqual(
      prepareCommand("cmd.exe", ["arg1", ">", "> hello.txt", "<", "<input.in"], false).trim(),
      'arg1 > "^> hello.txt" < ^<input.in'
    );
  });
  test("powershell", () => {
    assert.strictEqual(
      prepareCommand("powershell", ["!< "], false).trim(),
      `& '!< '`
    );
    assert.strictEqual(
      prepareCommand("powershell", ["hello", "world", "--flag=true"], false).trim(),
      `& 'hello' 'world' '--flag=true'`
    );
    assert.strictEqual(
      prepareCommand("powershell", [" space arg "], false).trim(),
      `& ' space arg '`
    );
    assert.strictEqual(
      prepareCommand("powershell", ['"A>0"'], false).trim(),
      `& '"A>0"'`
    );
    assert.strictEqual(
      prepareCommand("powershell", [""], false).trim(),
      `& ''`
    );
    assert.strictEqual(
      prepareCommand("powershell", ["!< "], true).trim(),
      "!<"
    );
    assert.strictEqual(
      prepareCommand("powershell", ["hello", "world", "--flag=true"], true).trim(),
      "hello world --flag=true"
    );
    assert.strictEqual(
      prepareCommand("powershell", [" space arg "], true).trim(),
      "space arg"
    );
    assert.strictEqual(
      prepareCommand("powershell", ['"A>0"'], true).trim(),
      '"A>0"'
    );
    assert.strictEqual(
      prepareCommand("powershell", [""], true).trim(),
      ``
    );
  });
  test("powershell - do not escape > and <", () => {
    assert.strictEqual(
      prepareCommand("powershell", ["arg1", ">", "> hello.txt", "<", "<input.in"], false).trim(),
      `& 'arg1' > '> hello.txt' < '<input.in'`
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxub2RlXFx0ZXJtaW5hbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcHJlcGFyZUNvbW1hbmQgfSBmcm9tICcuLi8uLi9ub2RlL3Rlcm1pbmFscy5qcyc7XG5cblxuc3VpdGUoJ0RlYnVnIC0gcHJlcGFyZUNvbW1hbmQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Jhc2gnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cHJlcGFyZUNvbW1hbmQoJ2Jhc2gnLCBbJ3skfSAoJ10sIGZhbHNlKS50cmltKCksXG5cdFx0XHQnXFxcXHtcXFxcJFxcXFx9XFxcXCBcXFxcKCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdiYXNoJywgWydoZWxsbycsICd3b3JsZCcsICctLWZsYWc9dHJ1ZSddLCBmYWxzZSkudHJpbSgpLFxuXHRcdFx0J2hlbGxvIHdvcmxkIC0tZmxhZz10cnVlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cHJlcGFyZUNvbW1hbmQoJ2Jhc2gnLCBbJyBzcGFjZSBhcmcgJ10sIGZhbHNlKS50cmltKCksXG5cdFx0XHQnXFxcXCBzcGFjZVxcXFwgYXJnXFxcXCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cHJlcGFyZUNvbW1hbmQoJ2Jhc2gnLCBbJ3skfSAoJ10sIHRydWUpLnRyaW0oKSxcblx0XHRcdCd7JH0gKCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdiYXNoJywgWydoZWxsbycsICd3b3JsZCcsICctLWZsYWc9dHJ1ZSddLCB0cnVlKS50cmltKCksXG5cdFx0XHQnaGVsbG8gd29ybGQgLS1mbGFnPXRydWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwcmVwYXJlQ29tbWFuZCgnYmFzaCcsIFsnIHNwYWNlIGFyZyAnXSwgdHJ1ZSkudHJpbSgpLFxuXHRcdFx0J3NwYWNlIGFyZycpO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXNoIC0gZG8gbm90IGVzY2FwZSA+IGFuZCA8JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdiYXNoJywgWydhcmcxJywgJz4nLCAnPiBoZWxsby50eHQnLCAnPCcsICc8aW5wdXQuaW4nXSwgZmFsc2UpLnRyaW0oKSxcblx0XHRcdCdhcmcxID4gXFxcXD5cXFxcIGhlbGxvLnR4dCA8IFxcXFw8aW5wdXQuaW4nKTtcblx0fSk7XG5cblx0dGVzdCgnY21kJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdjbWQuZXhlJywgWydeITwgJ10sIGZhbHNlKS50cmltKCksXG5cdFx0XHQnXCJeXl4hXjwgXCInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwcmVwYXJlQ29tbWFuZCgnY21kLmV4ZScsIFsnaGVsbG8nLCAnd29ybGQnLCAnLS1mbGFnPXRydWUnXSwgZmFsc2UpLnRyaW0oKSxcblx0XHRcdCdoZWxsbyB3b3JsZCAtLWZsYWc9dHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdjbWQuZXhlJywgWycgc3BhY2UgYXJnICddLCBmYWxzZSkudHJpbSgpLFxuXHRcdFx0J1wiIHNwYWNlIGFyZyBcIicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdjbWQuZXhlJywgWydcIkE+MFwiJ10sIGZhbHNlKS50cmltKCksXG5cdFx0XHQnXCJcIlwiQV4+MFwiXCJcIicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdjbWQuZXhlJywgWycnXSwgZmFsc2UpLnRyaW0oKSxcblx0XHRcdCdcIlwiJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwcmVwYXJlQ29tbWFuZCgnY21kLmV4ZScsIFsnXiE8ICddLCB0cnVlKS50cmltKCksXG5cdFx0XHQnXiE8Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cHJlcGFyZUNvbW1hbmQoJ2NtZC5leGUnLCBbJ2hlbGxvJywgJ3dvcmxkJywgJy0tZmxhZz10cnVlJ10sIHRydWUpLnRyaW0oKSxcblx0XHRcdCdoZWxsbyB3b3JsZCAtLWZsYWc9dHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdjbWQuZXhlJywgWycgc3BhY2UgYXJnICddLCB0cnVlKS50cmltKCksXG5cdFx0XHQnc3BhY2UgYXJnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cHJlcGFyZUNvbW1hbmQoJ2NtZC5leGUnLCBbJ1wiQT4wXCInXSwgdHJ1ZSkudHJpbSgpLFxuXHRcdFx0J1wiQT4wXCInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwcmVwYXJlQ29tbWFuZCgnY21kLmV4ZScsIFsnJ10sIHRydWUpLnRyaW0oKSxcblx0XHRcdCcnKTtcblx0fSk7XG5cblx0dGVzdCgnY21kIC0gZG8gbm90IGVzY2FwZSA+IGFuZCA8JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdjbWQuZXhlJywgWydhcmcxJywgJz4nLCAnPiBoZWxsby50eHQnLCAnPCcsICc8aW5wdXQuaW4nXSwgZmFsc2UpLnRyaW0oKSxcblx0XHRcdCdhcmcxID4gXCJePiBoZWxsby50eHRcIiA8IF48aW5wdXQuaW4nKTtcblx0fSk7XG5cblx0dGVzdCgncG93ZXJzaGVsbCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwcmVwYXJlQ29tbWFuZCgncG93ZXJzaGVsbCcsIFsnITwgJ10sIGZhbHNlKS50cmltKCksXG5cdFx0XHRgJiAnITwgJ2ApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdwb3dlcnNoZWxsJywgWydoZWxsbycsICd3b3JsZCcsICctLWZsYWc9dHJ1ZSddLCBmYWxzZSkudHJpbSgpLFxuXHRcdFx0YCYgJ2hlbGxvJyAnd29ybGQnICctLWZsYWc9dHJ1ZSdgKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwcmVwYXJlQ29tbWFuZCgncG93ZXJzaGVsbCcsIFsnIHNwYWNlIGFyZyAnXSwgZmFsc2UpLnRyaW0oKSxcblx0XHRcdGAmICcgc3BhY2UgYXJnICdgKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwcmVwYXJlQ29tbWFuZCgncG93ZXJzaGVsbCcsIFsnXCJBPjBcIiddLCBmYWxzZSkudHJpbSgpLFxuXHRcdFx0YCYgJ1wiQT4wXCInYCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cHJlcGFyZUNvbW1hbmQoJ3Bvd2Vyc2hlbGwnLCBbJyddLCBmYWxzZSkudHJpbSgpLFxuXHRcdFx0YCYgJydgKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdwb3dlcnNoZWxsJywgWychPCAnXSwgdHJ1ZSkudHJpbSgpLFxuXHRcdFx0JyE8Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cHJlcGFyZUNvbW1hbmQoJ3Bvd2Vyc2hlbGwnLCBbJ2hlbGxvJywgJ3dvcmxkJywgJy0tZmxhZz10cnVlJ10sIHRydWUpLnRyaW0oKSxcblx0XHRcdCdoZWxsbyB3b3JsZCAtLWZsYWc9dHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByZXBhcmVDb21tYW5kKCdwb3dlcnNoZWxsJywgWycgc3BhY2UgYXJnICddLCB0cnVlKS50cmltKCksXG5cdFx0XHQnc3BhY2UgYXJnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cHJlcGFyZUNvbW1hbmQoJ3Bvd2Vyc2hlbGwnLCBbJ1wiQT4wXCInXSwgdHJ1ZSkudHJpbSgpLFxuXHRcdFx0J1wiQT4wXCInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwcmVwYXJlQ29tbWFuZCgncG93ZXJzaGVsbCcsIFsnJ10sIHRydWUpLnRyaW0oKSxcblx0XHRcdGBgKTtcblx0fSk7XG5cblx0dGVzdCgncG93ZXJzaGVsbCAtIGRvIG5vdCBlc2NhcGUgPiBhbmQgPCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwcmVwYXJlQ29tbWFuZCgncG93ZXJzaGVsbCcsIFsnYXJnMScsICc+JywgJz4gaGVsbG8udHh0JywgJzwnLCAnPGlucHV0LmluJ10sIGZhbHNlKS50cmltKCksXG5cdFx0XHRgJiAnYXJnMScgPiAnPiBoZWxsby50eHQnIDwgJzxpbnB1dC5pbidgKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUcvQixNQUFNLDBCQUEwQixNQUFNO0FBQ3JDLDBDQUF3QztBQUV4QyxPQUFLLFFBQVEsTUFBTTtBQUNsQixXQUFPO0FBQUEsTUFDTixlQUFlLFFBQVEsQ0FBQyxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQUs7QUFBQSxNQUM5QztBQUFBLElBQWlCO0FBQ2xCLFdBQU87QUFBQSxNQUNOLGVBQWUsUUFBUSxDQUFDLFNBQVMsU0FBUyxhQUFhLEdBQUcsS0FBSyxFQUFFLEtBQUs7QUFBQSxNQUN0RTtBQUFBLElBQXlCO0FBQzFCLFdBQU87QUFBQSxNQUNOLGVBQWUsUUFBUSxDQUFDLGFBQWEsR0FBRyxLQUFLLEVBQUUsS0FBSztBQUFBLE1BQ3BEO0FBQUEsSUFBa0I7QUFFbkIsV0FBTztBQUFBLE1BQ04sZUFBZSxRQUFRLENBQUMsT0FBTyxHQUFHLElBQUksRUFBRSxLQUFLO0FBQUEsTUFDN0M7QUFBQSxJQUFPO0FBQ1IsV0FBTztBQUFBLE1BQ04sZUFBZSxRQUFRLENBQUMsU0FBUyxTQUFTLGFBQWEsR0FBRyxJQUFJLEVBQUUsS0FBSztBQUFBLE1BQ3JFO0FBQUEsSUFBeUI7QUFDMUIsV0FBTztBQUFBLE1BQ04sZUFBZSxRQUFRLENBQUMsYUFBYSxHQUFHLElBQUksRUFBRSxLQUFLO0FBQUEsTUFDbkQ7QUFBQSxJQUFXO0FBQUEsRUFDYixDQUFDO0FBRUQsT0FBSyxnQ0FBZ0MsTUFBTTtBQUMxQyxXQUFPO0FBQUEsTUFDTixlQUFlLFFBQVEsQ0FBQyxRQUFRLEtBQUssZUFBZSxLQUFLLFdBQVcsR0FBRyxLQUFLLEVBQUUsS0FBSztBQUFBLE1BQ25GO0FBQUEsSUFBc0M7QUFBQSxFQUN4QyxDQUFDO0FBRUQsT0FBSyxP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
