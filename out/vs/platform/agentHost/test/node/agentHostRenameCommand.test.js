import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { CompletionItemKind } from "../../common/state/protocol/commands.js";
import { MessageAttachmentKind } from "../../common/state/protocol/state.js";
import { AgentHostRenameCompletionProvider, parseRenameCommand } from "../../node/agentHostRenameCommand.js";
suite("agentHostRenameCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseRenameCommand", () => {
    test("matches lone /rename as empty title", () => {
      assert.strictEqual(parseRenameCommand("/rename"), "");
    });
    test("captures the trimmed title after a space", () => {
      assert.strictEqual(parseRenameCommand("/rename My New Title"), "My New Title");
    });
    test("trims surrounding whitespace from the title", () => {
      assert.strictEqual(parseRenameCommand("/rename   spaced   "), "spaced");
    });
    test("rejects /renamed (longer command)", () => {
      assert.strictEqual(parseRenameCommand("/renamed"), void 0);
    });
    test("rejects /rename-foo (no separator)", () => {
      assert.strictEqual(parseRenameCommand("/rename-foo"), void 0);
    });
    test("rejects leading whitespace", () => {
      assert.strictEqual(parseRenameCommand(" /rename x"), void 0);
    });
    test("case-sensitive", () => {
      assert.strictEqual(parseRenameCommand("/RENAME x"), void 0);
    });
  });
  suite("AgentHostRenameCompletionProvider", () => {
    const session = "mock:/abc";
    function run(text, hasHistory = true, offset = text.length) {
      const provider = new AgentHostRenameCompletionProvider(() => hasHistory);
      return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
    }
    test('offers /rename for a lone "/" when the session has history', async () => {
      const items = await run("/");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/rename "]);
    });
    test('offers /rename when "/r" is typed', async () => {
      const items = await run("/r");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/rename "]);
    });
    test("offers /rename when fuzzily matched", async () => {
      const items = await run("/rae");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/rename "]);
    });
    test("omits /rename when the session has no history", async () => {
      const items = await run("/", false);
      assert.deepStrictEqual(items, []);
    });
    test("returns nothing when the typed prefix does not match", async () => {
      const items = await run("/zz");
      assert.deepStrictEqual(items, []);
    });
    test("returns nothing when input does not start with /", async () => {
      const items = await run("hello", true, 5);
      assert.deepStrictEqual(items, []);
    });
    test("attachment is Simple with command + description meta", async () => {
      const items = await run("/");
      assert.deepStrictEqual(items.map((i) => i.attachment), [{
        type: MessageAttachmentKind.Simple,
        label: "/rename",
        _meta: { command: "rename", description: "Rename this chat" }
      }]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RSZW5hbWVDb21tYW5kLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQXR0YWNobWVudEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UmVuYW1lQ29tcGxldGlvblByb3ZpZGVyLCBwYXJzZVJlbmFtZUNvbW1hbmQgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFJlbmFtZUNvbW1hbmQuanMnO1xuXG5zdWl0ZSgnYWdlbnRIb3N0UmVuYW1lQ29tbWFuZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgncGFyc2VSZW5hbWVDb21tYW5kJywgKCkgPT4ge1xuXHRcdHRlc3QoJ21hdGNoZXMgbG9uZSAvcmVuYW1lIGFzIGVtcHR5IHRpdGxlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUmVuYW1lQ29tbWFuZCgnL3JlbmFtZScpLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXB0dXJlcyB0aGUgdHJpbW1lZCB0aXRsZSBhZnRlciBhIHNwYWNlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUmVuYW1lQ29tbWFuZCgnL3JlbmFtZSBNeSBOZXcgVGl0bGUnKSwgJ015IE5ldyBUaXRsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJpbXMgc3Vycm91bmRpbmcgd2hpdGVzcGFjZSBmcm9tIHRoZSB0aXRsZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVJlbmFtZUNvbW1hbmQoJy9yZW5hbWUgICBzcGFjZWQgICAnKSwgJ3NwYWNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyAvcmVuYW1lZCAobG9uZ2VyIGNvbW1hbmQpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUmVuYW1lQ29tbWFuZCgnL3JlbmFtZWQnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgL3JlbmFtZS1mb28gKG5vIHNlcGFyYXRvciknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VSZW5hbWVDb21tYW5kKCcvcmVuYW1lLWZvbycpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBsZWFkaW5nIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VSZW5hbWVDb21tYW5kKCcgL3JlbmFtZSB4JyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXNlLXNlbnNpdGl2ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVJlbmFtZUNvbW1hbmQoJy9SRU5BTUUgeCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRIb3N0UmVuYW1lQ29tcGxldGlvblByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSAnbW9jazovYWJjJztcblxuXHRcdGZ1bmN0aW9uIHJ1bih0ZXh0OiBzdHJpbmcsIGhhc0hpc3RvcnkgPSB0cnVlLCBvZmZzZXQgPSB0ZXh0Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgQWdlbnRIb3N0UmVuYW1lQ29tcGxldGlvblByb3ZpZGVyKCgpID0+IGhhc0hpc3RvcnkpO1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoeyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb24sIHRleHQsIG9mZnNldCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdvZmZlcnMgL3JlbmFtZSBmb3IgYSBsb25lIFwiL1wiIHdoZW4gdGhlIHNlc3Npb24gaGFzIGhpc3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignLycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaSA9PiBpLmluc2VydFRleHQpLCBbJy9yZW5hbWUgJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb2ZmZXJzIC9yZW5hbWUgd2hlbiBcIi9yXCIgaXMgdHlwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignL3InKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvcmVuYW1lICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29mZmVycyAvcmVuYW1lIHdoZW4gZnV6emlseSBtYXRjaGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy9yYWUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvcmVuYW1lICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIC9yZW5hbWUgd2hlbiB0aGUgc2Vzc2lvbiBoYXMgbm8gaGlzdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvJywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBub3RoaW5nIHdoZW4gdGhlIHR5cGVkIHByZWZpeCBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvenonKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgbm90aGluZyB3aGVuIGlucHV0IGRvZXMgbm90IHN0YXJ0IHdpdGggLycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCdoZWxsbycsIHRydWUsIDUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXR0YWNobWVudCBpcyBTaW1wbGUgd2l0aCBjb21tYW5kICsgZGVzY3JpcHRpb24gbWV0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuYXR0YWNobWVudCksIFt7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdGxhYmVsOiAnL3JlbmFtZScsXG5cdFx0XHRcdF9tZXRhOiB7IGNvbW1hbmQ6ICdyZW5hbWUnLCBkZXNjcmlwdGlvbjogJ1JlbmFtZSB0aGlzIGNoYXQnIH0sXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQ0FBbUMsMEJBQTBCO0FBRXRFLE1BQU0sMEJBQTBCLE1BQU07QUFFckMsMENBQXdDO0FBRXhDLFFBQU0sc0JBQXNCLE1BQU07QUFDakMsU0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxhQUFPLFlBQVksbUJBQW1CLFNBQVMsR0FBRyxFQUFFO0FBQUEsSUFDckQsQ0FBQztBQUVELFNBQUssNENBQTRDLE1BQU07QUFDdEQsYUFBTyxZQUFZLG1CQUFtQixzQkFBc0IsR0FBRyxjQUFjO0FBQUEsSUFDOUUsQ0FBQztBQUVELFNBQUssK0NBQStDLE1BQU07QUFDekQsYUFBTyxZQUFZLG1CQUFtQixxQkFBcUIsR0FBRyxRQUFRO0FBQUEsSUFDdkUsQ0FBQztBQUVELFNBQUsscUNBQXFDLE1BQU07QUFDL0MsYUFBTyxZQUFZLG1CQUFtQixVQUFVLEdBQUcsTUFBUztBQUFBLElBQzdELENBQUM7QUFFRCxTQUFLLHNDQUFzQyxNQUFNO0FBQ2hELGFBQU8sWUFBWSxtQkFBbUIsYUFBYSxHQUFHLE1BQVM7QUFBQSxJQUNoRSxDQUFDO0FBRUQsU0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxhQUFPLFlBQVksbUJBQW1CLFlBQVksR0FBRyxNQUFTO0FBQUEsSUFDL0QsQ0FBQztBQUVELFNBQUssa0JBQWtCLE1BQU07QUFDNUIsYUFBTyxZQUFZLG1CQUFtQixXQUFXLEdBQUcsTUFBUztBQUFBLElBQzlELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHFDQUFxQyxNQUFNO0FBQ2hELFVBQU0sVUFBVTtBQUVoQixhQUFTLElBQUksTUFBYyxhQUFhLE1BQU0sU0FBUyxLQUFLLFFBQVE7QUFDbkUsWUFBTSxXQUFXLElBQUksa0NBQWtDLE1BQU0sVUFBVTtBQUN2RSxhQUFPLFNBQVMsdUJBQXVCLEVBQUUsTUFBTSxtQkFBbUIsYUFBYSxTQUFTLFNBQVMsTUFBTSxPQUFPLEdBQUcsa0JBQWtCLElBQUk7QUFBQSxJQUN4STtBQUVBLFNBQUssOERBQThELFlBQVk7QUFDOUUsWUFBTSxRQUFRLE1BQU0sSUFBSSxHQUFHO0FBQzNCLGFBQU8sZ0JBQWdCLE1BQU0sSUFBSSxPQUFLLEVBQUUsVUFBVSxHQUFHLENBQUMsVUFBVSxDQUFDO0FBQUEsSUFDbEUsQ0FBQztBQUVELFNBQUsscUNBQXFDLFlBQVk7QUFDckQsWUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJO0FBQzVCLGFBQU8sZ0JBQWdCLE1BQU0sSUFBSSxPQUFLLEVBQUUsVUFBVSxHQUFHLENBQUMsVUFBVSxDQUFDO0FBQUEsSUFDbEUsQ0FBQztBQUVELFNBQUssdUNBQXVDLFlBQVk7QUFDdkQsWUFBTSxRQUFRLE1BQU0sSUFBSSxNQUFNO0FBQzlCLGFBQU8sZ0JBQWdCLE1BQU0sSUFBSSxPQUFLLEVBQUUsVUFBVSxHQUFHLENBQUMsVUFBVSxDQUFDO0FBQUEsSUFDbEUsQ0FBQztBQUVELFNBQUssaURBQWlELFlBQVk7QUFDakUsWUFBTSxRQUFRLE1BQU0sSUFBSSxLQUFLLEtBQUs7QUFDbEMsYUFBTyxnQkFBZ0IsT0FBTyxDQUFDLENBQUM7QUFBQSxJQUNqQyxDQUFDO0FBRUQsU0FBSyx3REFBd0QsWUFBWTtBQUN4RSxZQUFNLFFBQVEsTUFBTSxJQUFJLEtBQUs7QUFDN0IsYUFBTyxnQkFBZ0IsT0FBTyxDQUFDLENBQUM7QUFBQSxJQUNqQyxDQUFDO0FBRUQsU0FBSyxvREFBb0QsWUFBWTtBQUNwRSxZQUFNLFFBQVEsTUFBTSxJQUFJLFNBQVMsTUFBTSxDQUFDO0FBQ3hDLGFBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxDQUFDO0FBQUEsSUFDakMsQ0FBQztBQUVELFNBQUssd0RBQXdELFlBQVk7QUFDeEUsWUFBTSxRQUFRLE1BQU0sSUFBSSxHQUFHO0FBQzNCLGFBQU8sZ0JBQWdCLE1BQU0sSUFBSSxPQUFLLEVBQUUsVUFBVSxHQUFHLENBQUM7QUFBQSxRQUNyRCxNQUFNLHNCQUFzQjtBQUFBLFFBQzVCLE9BQU87QUFBQSxRQUNQLE9BQU8sRUFBRSxTQUFTLFVBQVUsYUFBYSxtQkFBbUI7QUFBQSxNQUM3RCxDQUFDLENBQUM7QUFBQSxJQUNILENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
