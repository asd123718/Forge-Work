import assert from "assert";
import { rewriteMarkdownLinks } from "../../common/markdownLinks.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("rewriteMarkdownLinks", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const rewriteToMarker = { rewriteLink: () => "REWRITTEN" };
  test("edits the token that produced the source, not the first lookalike", () => {
    assert.deepStrictEqual(
      [
        rewriteMarkdownLinks("Use `[a](./x.txt)` then a real [a](./x.txt) link.", rewriteToMarker),
        rewriteMarkdownLinks("```\n[a](./x.txt)\n```\n\n[a](./x.txt)", rewriteToMarker)
      ],
      [
        "Use `[a](./x.txt)` then a real REWRITTEN link.",
        "```\n[a](./x.txt)\n```\n\nREWRITTEN"
      ]
    );
  });
  test("keeps tokens the rewriter declines", () => {
    const markdown = "See [a](./x.txt) and ![b](./y.png).";
    assert.strictEqual(rewriteMarkdownLinks(markdown, { rewriteLink: () => void 0 }), markdown);
  });
  test("returns the source unchanged when it cannot be parsed as markdown", () => {
    assert.strictEqual(rewriteMarkdownLinks("", rewriteToMarker), "");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXG1hcmtkb3duTGlua3MudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHJld3JpdGVNYXJrZG93bkxpbmtzIH0gZnJvbSAnLi4vLi4vY29tbW9uL21hcmtkb3duTGlua3MuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdyZXdyaXRlTWFya2Rvd25MaW5rcycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgcmV3cml0ZVRvTWFya2VyID0geyByZXdyaXRlTGluazogKCkgPT4gJ1JFV1JJVFRFTicgfTtcblxuXHR0ZXN0KCdlZGl0cyB0aGUgdG9rZW4gdGhhdCBwcm9kdWNlZCB0aGUgc291cmNlLCBub3QgdGhlIGZpcnN0IGxvb2thbGlrZScsICgpID0+IHtcblx0XHQvLyBTZWFyY2hpbmcgZm9yIGEgdG9rZW4ncyBzb3VyY2UgdGV4dCB3b3VsZCBtYXRjaCB0aGUgc2FtcGxlIGluc2lkZSB0aGUgY29kZSBzcGFuLFxuXHRcdC8vIGNvcnJ1cHRpbmcgaXQgYW5kIGxlYXZpbmcgdGhlIHJlYWwgbGluayBpbiBwbGFjZS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRyZXdyaXRlTWFya2Rvd25MaW5rcygnVXNlIGBbYV0oLi94LnR4dClgIHRoZW4gYSByZWFsIFthXSguL3gudHh0KSBsaW5rLicsIHJld3JpdGVUb01hcmtlciksXG5cdFx0XHRcdHJld3JpdGVNYXJrZG93bkxpbmtzKCdgYGBcXG5bYV0oLi94LnR4dClcXG5gYGBcXG5cXG5bYV0oLi94LnR4dCknLCByZXdyaXRlVG9NYXJrZXIpLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J1VzZSBgW2FdKC4veC50eHQpYCB0aGVuIGEgcmVhbCBSRVdSSVRURU4gbGluay4nLFxuXHRcdFx0XHQnYGBgXFxuW2FdKC4veC50eHQpXFxuYGBgXFxuXFxuUkVXUklUVEVOJyxcblx0XHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0b2tlbnMgdGhlIHJld3JpdGVyIGRlY2xpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcmtkb3duID0gJ1NlZSBbYV0oLi94LnR4dCkgYW5kICFbYl0oLi95LnBuZykuJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV3cml0ZU1hcmtkb3duTGlua3MobWFya2Rvd24sIHsgcmV3cml0ZUxpbms6ICgpID0+IHVuZGVmaW5lZCB9KSwgbWFya2Rvd24pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHRoZSBzb3VyY2UgdW5jaGFuZ2VkIHdoZW4gaXQgY2Fubm90IGJlIHBhcnNlZCBhcyBtYXJrZG93bicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV3cml0ZU1hcmtkb3duTGlua3MoJycsIHJld3JpdGVUb01hcmtlciksICcnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLHdCQUF3QixNQUFNO0FBQ25DLDBDQUF3QztBQUV4QyxRQUFNLGtCQUFrQixFQUFFLGFBQWEsTUFBTSxZQUFZO0FBRXpELE9BQUsscUVBQXFFLE1BQU07QUFHL0UsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLHFCQUFxQixxREFBcUQsZUFBZTtBQUFBLFFBQ3pGLHFCQUFxQiwwQ0FBMEMsZUFBZTtBQUFBLE1BQy9FO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLHNDQUFzQyxNQUFNO0FBQ2hELFVBQU0sV0FBVztBQUNqQixXQUFPLFlBQVkscUJBQXFCLFVBQVUsRUFBRSxhQUFhLE1BQU0sT0FBVSxDQUFDLEdBQUcsUUFBUTtBQUFBLEVBQzlGLENBQUM7QUFFRCxPQUFLLHFFQUFxRSxNQUFNO0FBQy9FLFdBQU8sWUFBWSxxQkFBcUIsSUFBSSxlQUFlLEdBQUcsRUFBRTtBQUFBLEVBQ2pFLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
