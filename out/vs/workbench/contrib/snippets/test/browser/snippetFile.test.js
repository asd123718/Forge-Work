import assert from "assert";
import { SnippetFile, Snippet, SnippetSource } from "../../browser/snippetsFile.js";
import { URI } from "../../../../../base/common/uri.js";
import { SnippetParser } from "../../../../../editor/contrib/snippet/browser/snippetParser.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("Snippets", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  class TestSnippetFile extends SnippetFile {
    constructor(filepath, snippets) {
      super(SnippetSource.Extension, filepath, void 0, void 0, void 0, void 0);
      this.data.push(...snippets);
    }
  }
  test("SnippetFile#select", () => {
    let file = new TestSnippetFile(URI.file("somepath/foo.code-snippets"), []);
    let bucket = [];
    file.select("", bucket);
    assert.strictEqual(bucket.length, 0);
    file = new TestSnippetFile(URI.file("somepath/foo.code-snippets"), [
      new Snippet(false, ["foo"], "FooSnippet1", "foo", "", "snippet", "test", SnippetSource.User, generateUuid()),
      new Snippet(false, ["foo"], "FooSnippet2", "foo", "", "snippet", "test", SnippetSource.User, generateUuid()),
      new Snippet(false, ["bar"], "BarSnippet1", "foo", "", "snippet", "test", SnippetSource.User, generateUuid()),
      new Snippet(false, ["bar.comment"], "BarSnippet2", "foo", "", "snippet", "test", SnippetSource.User, generateUuid()),
      new Snippet(false, ["bar.strings"], "BarSnippet2", "foo", "", "snippet", "test", SnippetSource.User, generateUuid()),
      new Snippet(false, ["bazz", "bazz"], "BazzSnippet1", "foo", "", "snippet", "test", SnippetSource.User, generateUuid())
    ]);
    bucket = [];
    file.select("foo", bucket);
    assert.strictEqual(bucket.length, 2);
    bucket = [];
    file.select("fo", bucket);
    assert.strictEqual(bucket.length, 0);
    bucket = [];
    file.select("bar", bucket);
    assert.strictEqual(bucket.length, 1);
    bucket = [];
    file.select("bar.comment", bucket);
    assert.strictEqual(bucket.length, 2);
    bucket = [];
    file.select("bazz", bucket);
    assert.strictEqual(bucket.length, 1);
  });
  test("SnippetFile#select - any scope", function() {
    const file = new TestSnippetFile(URI.file("somepath/foo.code-snippets"), [
      new Snippet(false, [], "AnySnippet1", "foo", "", "snippet", "test", SnippetSource.User, generateUuid()),
      new Snippet(false, ["foo"], "FooSnippet1", "foo", "", "snippet", "test", SnippetSource.User, generateUuid())
    ]);
    const bucket = [];
    file.select("foo", bucket);
    assert.strictEqual(bucket.length, 2);
  });
  test("Snippet#needsClipboard", function() {
    function assertNeedsClipboard(body, expected) {
      const snippet = new Snippet(false, ["foo"], "FooSnippet1", "foo", "", body, "test", SnippetSource.User, generateUuid());
      assert.strictEqual(snippet.needsClipboard, expected);
      assert.strictEqual(SnippetParser.guessNeedsClipboard(body), expected);
    }
    assertNeedsClipboard("foo$CLIPBOARD", true);
    assertNeedsClipboard("${CLIPBOARD}", true);
    assertNeedsClipboard("foo${CLIPBOARD}bar", true);
    assertNeedsClipboard("foo$clipboard", false);
    assertNeedsClipboard("foo${clipboard}", false);
    assertNeedsClipboard("baba", false);
  });
  test("Snippet#isTrivial", function() {
    function assertIsTrivial(body, expected) {
      const snippet = new Snippet(false, ["foo"], "FooSnippet1", "foo", "", body, "test", SnippetSource.User, generateUuid());
      assert.strictEqual(snippet.isTrivial, expected);
    }
    assertIsTrivial("foo", true);
    assertIsTrivial("foo$0", true);
    assertIsTrivial("foo$0bar", false);
    assertIsTrivial("foo$1", false);
    assertIsTrivial("foo$1$0", false);
    assertIsTrivial("${1:foo}", false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNuaXBwZXRzXFx0ZXN0XFxicm93c2VyXFxzbmlwcGV0RmlsZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgU25pcHBldEZpbGUsIFNuaXBwZXQsIFNuaXBwZXRTb3VyY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3NuaXBwZXRzRmlsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU25pcHBldFBhcnNlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0UGFyc2VyLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdTbmlwcGV0cycsIGZ1bmN0aW9uICgpIHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBUZXN0U25pcHBldEZpbGUgZXh0ZW5kcyBTbmlwcGV0RmlsZSB7XG5cdFx0Y29uc3RydWN0b3IoZmlsZXBhdGg6IFVSSSwgc25pcHBldHM6IFNuaXBwZXRbXSkge1xuXHRcdFx0c3VwZXIoU25pcHBldFNvdXJjZS5FeHRlbnNpb24sIGZpbGVwYXRoLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkISwgdW5kZWZpbmVkISk7XG5cdFx0XHR0aGlzLmRhdGEucHVzaCguLi5zbmlwcGV0cyk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnU25pcHBldEZpbGUjc2VsZWN0JywgKCkgPT4ge1xuXHRcdGxldCBmaWxlID0gbmV3IFRlc3RTbmlwcGV0RmlsZShVUkkuZmlsZSgnc29tZXBhdGgvZm9vLmNvZGUtc25pcHBldHMnKSwgW10pO1xuXHRcdGxldCBidWNrZXQ6IFNuaXBwZXRbXSA9IFtdO1xuXHRcdGZpbGUuc2VsZWN0KCcnLCBidWNrZXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWNrZXQubGVuZ3RoLCAwKTtcblxuXHRcdGZpbGUgPSBuZXcgVGVzdFNuaXBwZXRGaWxlKFVSSS5maWxlKCdzb21lcGF0aC9mb28uY29kZS1zbmlwcGV0cycpLCBbXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb28nXSwgJ0Zvb1NuaXBwZXQxJywgJ2ZvbycsICcnLCAnc25pcHBldCcsICd0ZXN0JywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSksXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydmb28nXSwgJ0Zvb1NuaXBwZXQyJywgJ2ZvbycsICcnLCAnc25pcHBldCcsICd0ZXN0JywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSksXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydiYXInXSwgJ0JhclNuaXBwZXQxJywgJ2ZvbycsICcnLCAnc25pcHBldCcsICd0ZXN0JywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSksXG5cdFx0XHRuZXcgU25pcHBldChmYWxzZSwgWydiYXIuY29tbWVudCddLCAnQmFyU25pcHBldDInLCAnZm9vJywgJycsICdzbmlwcGV0JywgJ3Rlc3QnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2Jhci5zdHJpbmdzJ10sICdCYXJTbmlwcGV0MicsICdmb28nLCAnJywgJ3NuaXBwZXQnLCAndGVzdCcsIFNuaXBwZXRTb3VyY2UuVXNlciwgZ2VuZXJhdGVVdWlkKCkpLFxuXHRcdFx0bmV3IFNuaXBwZXQoZmFsc2UsIFsnYmF6eicsICdiYXp6J10sICdCYXp6U25pcHBldDEnLCAnZm9vJywgJycsICdzbmlwcGV0JywgJ3Rlc3QnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRdKTtcblxuXHRcdGJ1Y2tldCA9IFtdO1xuXHRcdGZpbGUuc2VsZWN0KCdmb28nLCBidWNrZXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWNrZXQubGVuZ3RoLCAyKTtcblxuXHRcdGJ1Y2tldCA9IFtdO1xuXHRcdGZpbGUuc2VsZWN0KCdmbycsIGJ1Y2tldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1Y2tldC5sZW5ndGgsIDApO1xuXG5cdFx0YnVja2V0ID0gW107XG5cdFx0ZmlsZS5zZWxlY3QoJ2JhcicsIGJ1Y2tldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1Y2tldC5sZW5ndGgsIDEpO1xuXG5cdFx0YnVja2V0ID0gW107XG5cdFx0ZmlsZS5zZWxlY3QoJ2Jhci5jb21tZW50JywgYnVja2V0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVja2V0Lmxlbmd0aCwgMik7XG5cblx0XHRidWNrZXQgPSBbXTtcblx0XHRmaWxlLnNlbGVjdCgnYmF6eicsIGJ1Y2tldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1Y2tldC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0RmlsZSNzZWxlY3QgLSBhbnkgc2NvcGUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBmaWxlID0gbmV3IFRlc3RTbmlwcGV0RmlsZShVUkkuZmlsZSgnc29tZXBhdGgvZm9vLmNvZGUtc25pcHBldHMnKSwgW1xuXHRcdFx0bmV3IFNuaXBwZXQoZmFsc2UsIFtdLCAnQW55U25pcHBldDEnLCAnZm9vJywgJycsICdzbmlwcGV0JywgJ3Rlc3QnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRcdG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2ZvbyddLCAnRm9vU25pcHBldDEnLCAnZm9vJywgJycsICdzbmlwcGV0JywgJ3Rlc3QnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGJ1Y2tldDogU25pcHBldFtdID0gW107XG5cdFx0ZmlsZS5zZWxlY3QoJ2ZvbycsIGJ1Y2tldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1Y2tldC5sZW5ndGgsIDIpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ1NuaXBwZXQjbmVlZHNDbGlwYm9hcmQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnROZWVkc0NsaXBib2FyZChib2R5OiBzdHJpbmcsIGV4cGVjdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRjb25zdCBzbmlwcGV0ID0gbmV3IFNuaXBwZXQoZmFsc2UsIFsnZm9vJ10sICdGb29TbmlwcGV0MScsICdmb28nLCAnJywgYm9keSwgJ3Rlc3QnLCBTbmlwcGV0U291cmNlLlVzZXIsIGdlbmVyYXRlVXVpZCgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0Lm5lZWRzQ2xpcGJvYXJkLCBleHBlY3RlZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChTbmlwcGV0UGFyc2VyLmd1ZXNzTmVlZHNDbGlwYm9hcmQoYm9keSksIGV4cGVjdGVkKTtcblx0XHR9XG5cblx0XHRhc3NlcnROZWVkc0NsaXBib2FyZCgnZm9vJENMSVBCT0FSRCcsIHRydWUpO1xuXHRcdGFzc2VydE5lZWRzQ2xpcGJvYXJkKCcke0NMSVBCT0FSRH0nLCB0cnVlKTtcblx0XHRhc3NlcnROZWVkc0NsaXBib2FyZCgnZm9vJHtDTElQQk9BUkR9YmFyJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0TmVlZHNDbGlwYm9hcmQoJ2ZvbyRjbGlwYm9hcmQnLCBmYWxzZSk7XG5cdFx0YXNzZXJ0TmVlZHNDbGlwYm9hcmQoJ2ZvbyR7Y2xpcGJvYXJkfScsIGZhbHNlKTtcblx0XHRhc3NlcnROZWVkc0NsaXBib2FyZCgnYmFiYScsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCNpc1RyaXZpYWwnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnRJc1RyaXZpYWwoYm9keTogc3RyaW5nLCBleHBlY3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2ZvbyddLCAnRm9vU25pcHBldDEnLCAnZm9vJywgJycsIGJvZHksICd0ZXN0JywgU25pcHBldFNvdXJjZS5Vc2VyLCBnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldC5pc1RyaXZpYWwsIGV4cGVjdGVkKTtcblx0XHR9XG5cblx0XHRhc3NlcnRJc1RyaXZpYWwoJ2ZvbycsIHRydWUpO1xuXHRcdGFzc2VydElzVHJpdmlhbCgnZm9vJDAnLCB0cnVlKTtcblx0XHRhc3NlcnRJc1RyaXZpYWwoJ2ZvbyQwYmFyJywgZmFsc2UpO1xuXHRcdGFzc2VydElzVHJpdmlhbCgnZm9vJDEnLCBmYWxzZSk7XG5cdFx0YXNzZXJ0SXNUcml2aWFsKCdmb28kMSQwJywgZmFsc2UpO1xuXHRcdGFzc2VydElzVHJpdmlhbCgnJHsxOmZvb30nLCBmYWxzZSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWEsU0FBUyxxQkFBcUI7QUFDcEQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sWUFBWSxXQUFZO0FBRTdCLDBDQUF3QztBQUFBLEVBRXhDLE1BQU0sd0JBQXdCLFlBQVk7QUFBQSxJQUN6QyxZQUFZLFVBQWUsVUFBcUI7QUFDL0MsWUFBTSxjQUFjLFdBQVcsVUFBVSxRQUFXLFFBQVcsUUFBWSxNQUFVO0FBQ3JGLFdBQUssS0FBSyxLQUFLLEdBQUcsUUFBUTtBQUFBLElBQzNCO0FBQUEsRUFDRDtBQUVBLE9BQUssc0JBQXNCLE1BQU07QUFDaEMsUUFBSSxPQUFPLElBQUksZ0JBQWdCLElBQUksS0FBSyw0QkFBNEIsR0FBRyxDQUFDLENBQUM7QUFDekUsUUFBSSxTQUFvQixDQUFDO0FBQ3pCLFNBQUssT0FBTyxJQUFJLE1BQU07QUFDdEIsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBRW5DLFdBQU8sSUFBSSxnQkFBZ0IsSUFBSSxLQUFLLDRCQUE0QixHQUFHO0FBQUEsTUFDbEUsSUFBSSxRQUFRLE9BQU8sQ0FBQyxLQUFLLEdBQUcsZUFBZSxPQUFPLElBQUksV0FBVyxRQUFRLGNBQWMsTUFBTSxhQUFhLENBQUM7QUFBQSxNQUMzRyxJQUFJLFFBQVEsT0FBTyxDQUFDLEtBQUssR0FBRyxlQUFlLE9BQU8sSUFBSSxXQUFXLFFBQVEsY0FBYyxNQUFNLGFBQWEsQ0FBQztBQUFBLE1BQzNHLElBQUksUUFBUSxPQUFPLENBQUMsS0FBSyxHQUFHLGVBQWUsT0FBTyxJQUFJLFdBQVcsUUFBUSxjQUFjLE1BQU0sYUFBYSxDQUFDO0FBQUEsTUFDM0csSUFB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
