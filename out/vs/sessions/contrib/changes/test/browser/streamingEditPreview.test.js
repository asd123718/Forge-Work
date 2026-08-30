import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { URI } from "../../../../../base/common/uri.js";
import { buildStreamingEditAnimation, buildStreamingEditFrames, DialecticLiveEditSlotMap, liveEditPreviewShouldOpenEditor } from "../../browser/streamingEditPreview.js";
suite("StreamingEditPreview", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("writes a newly created file one line at a time", () => {
    const frames = buildStreamingEditFrames("", "first\nsecond\nthird");
    assert.deepStrictEqual(frames.map((frame) => frame.content), [
      "first",
      "first\nsecond",
      "first\nsecond\nthird"
    ]);
    assert.deepStrictEqual(frames.map((frame) => frame.activeLine), [0, 1, 2]);
    assert.ok(frames.every((frame) => !frame.zip));
  });
  test("preserves unchanged prefix and suffix while replacing lines", () => {
    const frames = buildStreamingEditFrames(
      "const before = true;\nold one\nold two\nexport {};",
      "const before = true;\nnew one\nnew two\nexport {};"
    );
    assert.strictEqual(frames[0].content, "const before = true;\nold one\nold two\nexport {};");
    assert.strictEqual(frames.at(-1)?.content, "const before = true;\nnew one\nnew two\nexport {};");
    assert.strictEqual(frames[0].zip, true);
    assert.ok(frames.slice(1, -1).some((frame) => !frame.zip));
  });
  test("animates deletions and converges exactly including trailing newline", () => {
    const target = "keep\nlast\n";
    const frames = buildStreamingEditFrames("keep\nremove one\nremove two\nlast\n", target);
    assert.ok(frames.length > 1);
    assert.strictEqual(frames.at(-1)?.content, target);
  });
  test("coalesces very large changes into a bounded number of frames", () => {
    const target = Array.from({ length: 1e3 }, (_, index) => `line ${index}`).join("\n");
    const frames = buildStreamingEditFrames("", target);
    assert.ok(frames.length <= 200);
    assert.strictEqual(frames.at(-1)?.content, target);
  });
  test("slows at multiple hunks and exposes the first changed line", () => {
    const original = ["same 0", "old 1", ...Array.from({ length: 30 }, (_, index) => `same ${index + 2}`), "old 32"].join("\n");
    const modified = ["same 0", "new 1", ...Array.from({ length: 30 }, (_, index) => `same ${index + 2}`), "new 32"].join("\n");
    const animation = buildStreamingEditAnimation(original, modified);
    assert.strictEqual(animation.firstChangedLine, 1);
    assert.ok(animation.frames.some((frame) => frame.zip));
    assert.ok(animation.frames.filter((frame) => !frame.zip).length >= 2);
    assert.strictEqual(animation.frames.at(-1)?.content, modified);
  });
  test("does not open a two-pane Diff when live preview is marked unavailable", () => {
    const update = {
      contextKey: "chat\0req",
      chatKey: "chat",
      resource: URI.file("/repo/a.ts"),
      snapshotUri: URI.parse("git-blob://guessed"),
      isFinal: false,
      unavailable: true
    };
    assert.strictEqual(liveEditPreviewShouldOpenEditor(update), false);
    assert.strictEqual(liveEditPreviewShouldOpenEditor({ ...update, unavailable: false }), true);
  });
  test("pins the first two Dialectic sources to left and right panes", () => {
    const slots = new DialecticLiveEditSlotMap();
    assert.strictEqual(slots.slotFor("worker-a"), 0);
    assert.strictEqual(slots.slotFor("worker-b"), 1);
    assert.strictEqual(slots.slotFor("worker-a"), 0);
    assert.strictEqual(slots.slotFor("worker-c"), 0);
    slots.reset();
    assert.strictEqual(slots.slotFor("worker-c"), 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcdGVzdFxcYnJvd3Nlclxcc3RyZWFtaW5nRWRpdFByZXZpZXcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGJ1aWxkU3RyZWFtaW5nRWRpdEFuaW1hdGlvbiwgYnVpbGRTdHJlYW1pbmdFZGl0RnJhbWVzLCBEaWFsZWN0aWNMaXZlRWRpdFNsb3RNYXAsIGxpdmVFZGl0UHJldmlld1Nob3VsZE9wZW5FZGl0b3IgfSBmcm9tICcuLi8uLi9icm93c2VyL3N0cmVhbWluZ0VkaXRQcmV2aWV3LmpzJztcblxuc3VpdGUoJ1N0cmVhbWluZ0VkaXRQcmV2aWV3JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd3cml0ZXMgYSBuZXdseSBjcmVhdGVkIGZpbGUgb25lIGxpbmUgYXQgYSB0aW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZyYW1lcyA9IGJ1aWxkU3RyZWFtaW5nRWRpdEZyYW1lcygnJywgJ2ZpcnN0XFxuc2Vjb25kXFxudGhpcmQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZyYW1lcy5tYXAoZnJhbWUgPT4gZnJhbWUuY29udGVudCksIFtcblx0XHRcdCdmaXJzdCcsXG5cdFx0XHQnZmlyc3RcXG5zZWNvbmQnLFxuXHRcdFx0J2ZpcnN0XFxuc2Vjb25kXFxudGhpcmQnLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnJhbWVzLm1hcChmcmFtZSA9PiBmcmFtZS5hY3RpdmVMaW5lKSwgWzAsIDEsIDJdKTtcblx0XHRhc3NlcnQub2soZnJhbWVzLmV2ZXJ5KGZyYW1lID0+ICFmcmFtZS56aXApKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIHVuY2hhbmdlZCBwcmVmaXggYW5kIHN1ZmZpeCB3aGlsZSByZXBsYWNpbmcgbGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZnJhbWVzID0gYnVpbGRTdHJlYW1pbmdFZGl0RnJhbWVzKFxuXHRcdFx0J2NvbnN0IGJlZm9yZSA9IHRydWU7XFxub2xkIG9uZVxcbm9sZCB0d29cXG5leHBvcnQge307Jyxcblx0XHRcdCdjb25zdCBiZWZvcmUgPSB0cnVlO1xcbm5ldyBvbmVcXG5uZXcgdHdvXFxuZXhwb3J0IHt9OycsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZnJhbWVzWzBdLmNvbnRlbnQsICdjb25zdCBiZWZvcmUgPSB0cnVlO1xcbm9sZCBvbmVcXG5vbGQgdHdvXFxuZXhwb3J0IHt9OycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcmFtZXMuYXQoLTEpPy5jb250ZW50LCAnY29uc3QgYmVmb3JlID0gdHJ1ZTtcXG5uZXcgb25lXFxubmV3IHR3b1xcbmV4cG9ydCB7fTsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZnJhbWVzWzBdLnppcCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKGZyYW1lcy5zbGljZSgxLCAtMSkuc29tZShmcmFtZSA9PiAhZnJhbWUuemlwKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuaW1hdGVzIGRlbGV0aW9ucyBhbmQgY29udmVyZ2VzIGV4YWN0bHkgaW5jbHVkaW5nIHRyYWlsaW5nIG5ld2xpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gJ2tlZXBcXG5sYXN0XFxuJztcblx0XHRjb25zdCBmcmFtZXMgPSBidWlsZFN0cmVhbWluZ0VkaXRGcmFtZXMoJ2tlZXBcXG5yZW1vdmUgb25lXFxucmVtb3ZlIHR3b1xcbmxhc3RcXG4nLCB0YXJnZXQpO1xuXHRcdGFzc2VydC5vayhmcmFtZXMubGVuZ3RoID4gMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZyYW1lcy5hdCgtMSk/LmNvbnRlbnQsIHRhcmdldCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvYWxlc2NlcyB2ZXJ5IGxhcmdlIGNoYW5nZXMgaW50byBhIGJvdW5kZWQgbnVtYmVyIG9mIGZyYW1lcycsICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxXzAwMCB9LCAoXywgaW5kZXgpID0+IGBsaW5lICR7aW5kZXh9YCkuam9pbignXFxuJyk7XG5cdFx0Y29uc3QgZnJhbWVzID0gYnVpbGRTdHJlYW1pbmdFZGl0RnJhbWVzKCcnLCB0YXJnZXQpO1xuXHRcdGFzc2VydC5vayhmcmFtZXMubGVuZ3RoIDw9IDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZyYW1lcy5hdCgtMSk/LmNvbnRlbnQsIHRhcmdldCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nsb3dzIGF0IG11bHRpcGxlIGh1bmtzIGFuZCBleHBvc2VzIHRoZSBmaXJzdCBjaGFuZ2VkIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ3NhbWUgMCcsICdvbGQgMScsIC4uLkFycmF5LmZyb20oeyBsZW5ndGg6IDMwIH0sIChfLCBpbmRleCkgPT4gYHNhbWUgJHtpbmRleCArIDJ9YCksICdvbGQgMzInXS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnc2FtZSAwJywgJ25ldyAxJywgLi4uQXJyYXkuZnJvbSh7IGxlbmd0aDogMzAgfSwgKF8sIGluZGV4KSA9PiBgc2FtZSAke2luZGV4ICsgMn1gKSwgJ25ldyAzMiddLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IGFuaW1hdGlvbiA9IGJ1aWxkU3RyZWFtaW5nRWRpdEFuaW1hdGlvbihvcmlnaW5hbCwgbW9kaWZpZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbmltYXRpb24uZmlyc3RDaGFuZ2VkTGluZSwgMSk7XG5cdFx0YXNzZXJ0Lm9rKGFuaW1hdGlvbi5mcmFtZXMuc29tZShmcmFtZSA9PiBmcmFtZS56aXApKTtcblx0XHRhc3NlcnQub2soYW5pbWF0aW9uLmZyYW1lcy5maWx0ZXIoZnJhbWUgPT4gIWZyYW1lLnppcCkubGVuZ3RoID49IDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbmltYXRpb24uZnJhbWVzLmF0KC0xKT8uY29udGVudCwgbW9kaWZpZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBvcGVuIGEgdHdvLXBhbmUgRGlmZiB3aGVuIGxpdmUgcHJldmlldyBpcyBtYXJrZWQgdW5hdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXBkYXRlID0ge1xuXHRcdFx0Y29udGV4dEtleTogJ2NoYXRcXDByZXEnLFxuXHRcdFx0Y2hhdEtleTogJ2NoYXQnLFxuXHRcdFx0cmVzb3VyY2U6IFVSSS5maWxlKCcvcmVwby9hLnRzJyksXG5cdFx0XHRzbmFwc2hvdFVyaTogVVJJLnBhcnNlKCdnaXQtYmxvYjovL2d1ZXNzZWQnKSxcblx0XHRcdGlzRmluYWw6IGZhbHNlLFxuXHRcdFx0dW5hdmFpbGFibGU6IHRydWUsXG5cdFx0fTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGl2ZUVkaXRQcmV2aWV3U2hvdWxkT3BlbkVkaXRvcih1cGRhdGUpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpdmVFZGl0UHJldmlld1Nob3VsZE9wZW5FZGl0b3IoeyAuLi51cGRhdGUsIHVuYXZhaWxhYmxlOiBmYWxzZSB9KSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BpbnMgdGhlIGZpcnN0IHR3byBEaWFsZWN0aWMgc291cmNlcyB0byBsZWZ0IGFuZCByaWdodCBwYW5lcycsICgpID0+IHtcblx0XHRjb25zdCBzbG90cyA9IG5ldyBEaWFsZWN0aWNMaXZlRWRpdFNsb3RNYXAoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2xvdHMuc2xvdEZvcignd29ya2VyLWEnKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsb3RzLnNsb3RGb3IoJ3dvcmtlci1iJyksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbG90cy5zbG90Rm9yKCd3b3JrZXItYScpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2xvdHMuc2xvdEZvcignd29ya2VyLWMnKSwgMCk7XG5cdFx0c2xvdHMucmVzZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2xvdHMuc2xvdEZvcignd29ya2VyLWMnKSwgMCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCLDBCQUEwQiwwQkFBMEIsdUNBQXVDO0FBRWpJLE1BQU0sd0JBQXdCLE1BQU07QUFDbkMsMENBQXdDO0FBRXhDLE9BQUssa0RBQWtELE1BQU07QUFDNUQsVUFBTSxTQUFTLHlCQUF5QixJQUFJLHNCQUFzQjtBQUNsRSxXQUFPLGdCQUFnQixPQUFPLElBQUksV0FBUyxNQUFNLE9BQU8sR0FBRztBQUFBLE1BQzFEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFDRCxXQUFPLGdCQUFnQixPQUFPLElBQUksV0FBUyxNQUFNLFVBQVUsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDdkUsV0FBTyxHQUFHLE9BQU8sTUFBTSxXQUFTLENBQUMsTUFBTSxHQUFHLENBQUM7QUFBQSxFQUM1QyxDQUFDO0FBRUQsT0FBSywrREFBK0QsTUFBTTtBQUN6RSxVQUFNLFNBQVM7QUFBQSxNQUNkO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsU0FBUyxvREFBb0Q7QUFDMUYsV0FBTyxZQUFZLE9BQU8sR0FBRyxFQUFFLEdBQUcsU0FBUyxvREFBb0Q7QUFDL0YsV0FBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLEtBQUssSUFBSTtBQUN0QyxXQUFPLEdBQUcsT0FBTyxNQUFNLEdBQUcsRUFBRSxFQUFFLEtBQUssV0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDO0FBQUEsRUFDeEQsQ0FBQztBQUVELE9BQUssdUVBQXVFLE1BQU07QUFDakYsVUFBTSxTQUFTO0FBQ2YsVUFBTSxTQUFTLHlCQUF5Qix3Q0FBd0MsTUFBTTtBQUN0RixXQUFPLEdBQUcsT0FBTyxTQUFTLENBQUM7QUFDM0IsV0FBTyxZQUFZLE9BQU8sR0FBRyxFQUFFLEdBQUcsU0FBUyxNQUFNO0FBQUEsRUFDbEQsQ0FBQztBQUVELE9BQUssZ0VBQWdFLE1BQU07QUFDMUUsVUFBTSxTQUFTLE1BQU0sS0FBSyxFQUFFLFFBQVEsSUFBTSxHQUFHLENBQUMsR0FBRyxVQUFVLFFBQVEsS0FBSyxFQUFFLEVBQUUsS0FBSyxJQUFJO0FBQ3JGLFVBQU0sU0FBUyx5QkFBeUIsSUFBSSxNQUFNO0FBQ2xELFdBQU8sR0FBRyxPQUFPLFVBQVUsR0FBRztBQUM5QixXQUFPLFlBQVksT0FBTyxHQUFHLEVBQUUsR0FBRyxTQUFTLE1BQU07QUFBQSxFQUNsRCxDQUFDO0FBRUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLFdBQVcsQ0FBQyxVQUFVLFNBQVMsR0FBRyxNQUFNLEtBQUssRUFBRSxRQUFRLEdBQUcsR0FBRyxDQUFDLEdBQUcsVUFBVSxRQUFRLFFBQVEsQ0FBQyxFQUFFLEdBQUcsUUFBUSxFQUFFLEtBQUssSUFBSTtBQUMxSCxVQUFNLFdBQVcsQ0FBQyxVQUFVLFNBQVMsR0FBRyxNQUFNLEtBQUssRUFBRSxRQUFRLEdBQUcsR0FBRyxDQUFDLEdBQUcsVUFBVSxRQUFRLFFBQVEsQ0FBQyxFQUFFLEdBQUcsUUFBUSxFQUFFLEtBQUssSUFBSTtBQUMxSCxVQUFNLFlBQVksNEJBQTRCLFVBQVUsUUFBUTtBQUNoRSxXQUFPLFlBQVksVUFBVSxrQkFBa0IsQ0FBQztBQUNoRCxXQUFPLEdBQUcsVUFBVSxPQUFPLEtBQUssV0FBUyxNQUFNLEdBQUcsQ0FBQztBQUNuRCxXQUFPLEdBQUcsVUFBVSxPQUFPLE9BQU8sV0FBUyxDQUFDLE1BQU0sR0FBRyxFQUFFLFVBQVUsQ0FBQztBQUNsRSxXQUFPLFlBQVksVUFBVSxPQUFPLEdBQUcsRUFBRSxHQUFHLFNBQVMsUUFBUTtBQUFBLEVBQzlELENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBQ25GLFVBQU0sU0FBUztBQUFBLE1BQ2QsWUFBWTtBQUFBLE1BQ1osU0FBUztBQUFBLE1BQ1QsVUFBVSxJQUFJLEtBQUssWUFBWTtBQUFBLE1BQy9CLGFBQWEsSUFBSSxNQUFNLG9CQUFvQjtBQUFBLE1BQzNDLFNBQVM7QUFBQSxNQUNULGFBQWE7QUFBQSxJQUNkO0FBQ0EsV0FBTyxZQUFZLGdDQUFnQyxNQUFNLEdBQUcsS0FBSztBQUNqRSxXQUFPLFlBQVksZ0NBQWdDLEVBQUUsR0FBRyxRQUFRLGFBQWEsTUFBTSxDQUFDLEdBQUcsSUFBSTtBQUFBLEVBQzVGLENBQUM7QUFFRCxPQUFLLGdFQUFnRSxNQUFNO0FBQzFFLFVBQU0sUUFBUSxJQUFJLHlCQUF5QjtBQUMzQyxXQUFPLFlBQVksTUFBTSxRQUFRLFVBQVUsR0FBRyxDQUFDO0FBQy9DLFdBQU8sWUFBWSxNQUFNLFFBQVEsVUFBVSxHQUFHLENBQUM7QUFDL0MsV0FBTyxZQUFZLE1BQU0sUUFBUSxVQUFVLEdBQUcsQ0FBQztBQUMvQyxXQUFPLFlBQVksTUFBTSxRQUFRLFVBQVUsR0FBRyxDQUFDO0FBQy9DLFVBQU0sTUFBTTtBQUNaLFdBQU8sWUFBWSxNQUFNLFFBQVEsVUFBVSxHQUFHLENBQUM7QUFBQSxFQUNoRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
