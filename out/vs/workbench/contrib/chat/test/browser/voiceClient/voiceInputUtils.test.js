import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { combineVoiceInput } from "../../../browser/voiceClient/voiceInputUtils.js";
suite("combineVoiceInput", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps typed input and appends the transcript", () => {
    assert.deepStrictEqual(
      [
        combineVoiceInput("", "hello world"),
        combineVoiceInput("please", "run the tests"),
        combineVoiceInput("please ", "run the tests"),
        combineVoiceInput("please\n", "run the tests"),
        combineVoiceInput("draft", "")
      ],
      [
        "hello world",
        "please run the tests",
        "please run the tests",
        "please\nrun the tests",
        "draft"
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHZvaWNlQ2xpZW50XFx2b2ljZUlucHV0VXRpbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY29tYmluZVZvaWNlSW5wdXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlSW5wdXRVdGlscy5qcyc7XG5cbnN1aXRlKCdjb21iaW5lVm9pY2VJbnB1dCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgna2VlcHMgdHlwZWQgaW5wdXQgYW5kIGFwcGVuZHMgdGhlIHRyYW5zY3JpcHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtcblx0XHRcdFx0Y29tYmluZVZvaWNlSW5wdXQoJycsICdoZWxsbyB3b3JsZCcpLFxuXHRcdFx0XHRjb21iaW5lVm9pY2VJbnB1dCgncGxlYXNlJywgJ3J1biB0aGUgdGVzdHMnKSxcblx0XHRcdFx0Y29tYmluZVZvaWNlSW5wdXQoJ3BsZWFzZSAnLCAncnVuIHRoZSB0ZXN0cycpLFxuXHRcdFx0XHRjb21iaW5lVm9pY2VJbnB1dCgncGxlYXNlXFxuJywgJ3J1biB0aGUgdGVzdHMnKSxcblx0XHRcdFx0Y29tYmluZVZvaWNlSW5wdXQoJ2RyYWZ0JywgJycpLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0J3BsZWFzZSBydW4gdGhlIHRlc3RzJyxcblx0XHRcdFx0J3BsZWFzZSBydW4gdGhlIHRlc3RzJyxcblx0XHRcdFx0J3BsZWFzZVxcbnJ1biB0aGUgdGVzdHMnLFxuXHRcdFx0XHQnZHJhZnQnLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSxxQkFBcUIsTUFBTTtBQUNoQywwQ0FBd0M7QUFFeEMsT0FBSyxnREFBZ0QsTUFBTTtBQUMxRCxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0Msa0JBQWtCLElBQUksYUFBYTtBQUFBLFFBQ25DLGtCQUFrQixVQUFVLGVBQWU7QUFBQSxRQUMzQyxrQkFBa0IsV0FBVyxlQUFlO0FBQUEsUUFDNUMsa0JBQWtCLFlBQVksZUFBZTtBQUFBLFFBQzdDLGtCQUFrQixTQUFTLEVBQUU7QUFBQSxNQUM5QjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
