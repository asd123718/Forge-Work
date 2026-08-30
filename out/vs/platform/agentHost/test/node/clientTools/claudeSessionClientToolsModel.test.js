import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { SessionClientToolsDiff } from "../../../node/claude/clientTools/claudeSessionClientToolsModel.js";
const tool = (over = {}) => ({
  name: "echo",
  description: "echoes",
  inputSchema: { type: "object", properties: { msg: { type: "string" } }, required: ["msg"] },
  ...over
});
suite("SessionClientToolsDiff", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("fresh diff: merged empty, no difference", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    assert.deepStrictEqual(diff.model.merged.get(), []);
    assert.strictEqual(diff.hasDifference, false);
  });
  test("setTools(c1, []) does NOT flip dirty (undefined \u2261 [])", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", []);
    assert.strictEqual(diff.hasDifference, false);
  });
  test("setTools with a real snapshot flips dirty", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool()]);
    assert.strictEqual(diff.hasDifference, true);
  });
  test("consume() returns the merged tools and clears dirty", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool()]);
    const merged = diff.consume();
    assert.deepStrictEqual(merged, [tool()]);
    assert.strictEqual(diff.hasDifference, false);
  });
  test("setTools with a structurally-equal snapshot does NOT re-flip dirty after consume", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool()]);
    diff.consume();
    diff.model.setTools("c1", [{ name: "echo", description: "echoes", inputSchema: { type: "object", properties: { msg: { type: "string" } }, required: ["msg"] } }]);
    assert.strictEqual(diff.hasDifference, false);
  });
  test("C6: setTools racing async work after consume re-flips dirty via autorun", async () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool({ name: "original" })]);
    const merged = diff.consume();
    assert.deepStrictEqual(merged, [tool({ name: "original" })]);
    await Promise.resolve();
    diff.model.setTools("c1", [tool({ name: "racer" })]);
    assert.strictEqual(diff.hasDifference, true);
  });
  test("markDirty re-flips after a failed downstream build", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool()]);
    diff.consume();
    assert.strictEqual(diff.hasDifference, false);
    diff.markDirty();
    assert.strictEqual(diff.hasDifference, true);
  });
  test("hasDifference detects rename / description / inputSchema; ignores title", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool({ name: "a" })]);
    diff.consume();
    diff.model.setTools("c1", [tool({ name: "b" })]);
    assert.strictEqual(diff.hasDifference, true);
    diff.consume();
    diff.model.setTools("c1", [tool({ name: "b", description: "new" })]);
    assert.strictEqual(diff.hasDifference, true);
    diff.consume();
    diff.model.setTools("c1", [tool({ name: "b", description: "new", inputSchema: { type: "object", properties: { msg: { type: "number" } }, required: ["msg"] } })]);
    assert.strictEqual(diff.hasDifference, true);
    diff.consume();
    diff.model.setTools("c1", [tool({ name: "b", description: "new", inputSchema: { type: "object", properties: { msg: { type: "number" } }, required: ["msg"] }, title: "X" })]);
    assert.strictEqual(diff.hasDifference, false, "title is outside the diff scope");
  });
  test("order-insensitive: reordering tools does not flip dirty", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool({ name: "a" }), tool({ name: "b" })]);
    diff.consume();
    diff.model.setTools("c1", [tool({ name: "b" }), tool({ name: "a" })]);
    assert.strictEqual(diff.hasDifference, false);
  });
  test("ownerOf reflects which client contributed a tool; getTools returns a client slice", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool({ name: "a" })]);
    diff.model.setTools("c2", [tool({ name: "b" })]);
    assert.strictEqual(diff.model.ownerOf("a"), "c1");
    assert.strictEqual(diff.model.ownerOf("b"), "c2");
    assert.strictEqual(diff.model.ownerOf("missing"), void 0);
    assert.deepStrictEqual(diff.model.getTools("c1"), [tool({ name: "a" })]);
    assert.deepStrictEqual(diff.model.getTools("c2"), [tool({ name: "b" })]);
  });
  test("merged unions multiple clients and dedupes by name (first client wins)", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool({ name: "shared", description: "from c1" }), tool({ name: "a" })]);
    diff.model.setTools("c2", [tool({ name: "shared", description: "from c2" }), tool({ name: "b" })]);
    assert.deepStrictEqual(diff.model.merged.get().map((t) => t.name), ["shared", "a", "b"]);
    assert.strictEqual(diff.model.ownerOf("shared"), "c1", "first-inserted client wins the shared name");
  });
  test("ownerOf prefers the requested client when it provides the shared tool", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool({ name: "shared", description: "from c1" })]);
    diff.model.setTools("c2", [tool({ name: "shared", description: "from c2" })]);
    assert.deepStrictEqual({
      defaultOwner: diff.model.ownerOf("shared"),
      preferredOwner: diff.model.ownerOf("shared", "c2"),
      missingPreferredOwner: diff.model.ownerOf("shared", "missing")
    }, {
      defaultOwner: "c1",
      preferredOwner: "c2",
      missingPreferredOwner: "c1"
    });
  });
  test("removeClient drops that client and re-flips dirty when the merged set changes", () => {
    const diff = disposables.add(new SessionClientToolsDiff());
    diff.model.setTools("c1", [tool({ name: "a" })]);
    diff.model.setTools("c2", [tool({ name: "b" })]);
    diff.consume();
    assert.strictEqual(diff.hasDifference, false);
    diff.model.removeClient("c2");
    assert.strictEqual(diff.hasDifference, true);
    assert.deepStrictEqual(diff.model.merged.get().map((t) => t.name), ["a"]);
    assert.strictEqual(diff.model.ownerOf("b"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGllbnRUb29sc1xcY2xhdWRlU2Vzc2lvbkNsaWVudFRvb2xzTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jbGF1ZGUvY2xpZW50VG9vbHMvY2xhdWRlU2Vzc2lvbkNsaWVudFRvb2xzTW9kZWwuanMnO1xuXG5jb25zdCB0b29sID0gKG92ZXI6IFBhcnRpYWw8VG9vbERlZmluaXRpb24+ID0ge30pOiBUb29sRGVmaW5pdGlvbiA9PiAoe1xuXHRuYW1lOiAnZWNobycsXG5cdGRlc2NyaXB0aW9uOiAnZWNob2VzJyxcblx0aW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgbXNnOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSwgcmVxdWlyZWQ6IFsnbXNnJ10gfSxcblx0Li4ub3Zlcixcbn0pO1xuXG5zdWl0ZSgnU2Vzc2lvbkNsaWVudFRvb2xzRGlmZicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZyZXNoIGRpZmY6IG1lcmdlZCBlbXB0eSwgbm8gZGlmZmVyZW5jZScsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZi5tb2RlbC5tZXJnZWQuZ2V0KCksIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZi5oYXNEaWZmZXJlbmNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFRvb2xzKGMxLCBbXSkgZG9lcyBOT1QgZmxpcCBkaXJ0eSAodW5kZWZpbmVkIFx1MjI2MSBbXSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlmZiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbkNsaWVudFRvb2xzRGlmZigpKTtcblx0XHRkaWZmLm1vZGVsLnNldFRvb2xzKCdjMScsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZi5oYXNEaWZmZXJlbmNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFRvb2xzIHdpdGggYSByZWFsIHNuYXBzaG90IGZsaXBzIGRpcnR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpZmYgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25DbGllbnRUb29sc0RpZmYoKSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRUb29scygnYzEnLCBbdG9vbCgpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmYuaGFzRGlmZmVyZW5jZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnN1bWUoKSByZXR1cm5zIHRoZSBtZXJnZWQgdG9vbHMgYW5kIGNsZWFycyBkaXJ0eScsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmKCkpO1xuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MxJywgW3Rvb2woKV0pO1xuXHRcdGNvbnN0IG1lcmdlZCA9IGRpZmYuY29uc3VtZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVyZ2VkLCBbdG9vbCgpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmYuaGFzRGlmZmVyZW5jZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRUb29scyB3aXRoIGEgc3RydWN0dXJhbGx5LWVxdWFsIHNuYXBzaG90IGRvZXMgTk9UIHJlLWZsaXAgZGlydHkgYWZ0ZXIgY29uc3VtZScsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmKCkpO1xuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MxJywgW3Rvb2woKV0pO1xuXHRcdGRpZmYuY29uc3VtZSgpO1xuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MxJywgW3sgbmFtZTogJ2VjaG8nLCBkZXNjcmlwdGlvbjogJ2VjaG9lcycsIGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IG1zZzogeyB0eXBlOiAnc3RyaW5nJyB9IH0sIHJlcXVpcmVkOiBbJ21zZyddIH0gfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmhhc0RpZmZlcmVuY2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnQzY6IHNldFRvb2xzIHJhY2luZyBhc3luYyB3b3JrIGFmdGVyIGNvbnN1bWUgcmUtZmxpcHMgZGlydHkgdmlhIGF1dG9ydW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlmZiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbkNsaWVudFRvb2xzRGlmZigpKTtcblx0XHRkaWZmLm1vZGVsLnNldFRvb2xzKCdjMScsIFt0b29sKHsgbmFtZTogJ29yaWdpbmFsJyB9KV0pO1xuXHRcdGNvbnN0IG1lcmdlZCA9IGRpZmYuY29uc3VtZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVyZ2VkLCBbdG9vbCh7IG5hbWU6ICdvcmlnaW5hbCcgfSldKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRkaWZmLm1vZGVsLnNldFRvb2xzKCdjMScsIFt0b29sKHsgbmFtZTogJ3JhY2VyJyB9KV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmhhc0RpZmZlcmVuY2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrRGlydHkgcmUtZmxpcHMgYWZ0ZXIgYSBmYWlsZWQgZG93bnN0cmVhbSBidWlsZCcsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmKCkpO1xuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MxJywgW3Rvb2woKV0pO1xuXHRcdGRpZmYuY29uc3VtZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmhhc0RpZmZlcmVuY2UsIGZhbHNlKTtcblx0XHRkaWZmLm1hcmtEaXJ0eSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmhhc0RpZmZlcmVuY2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXNEaWZmZXJlbmNlIGRldGVjdHMgcmVuYW1lIC8gZGVzY3JpcHRpb24gLyBpbnB1dFNjaGVtYTsgaWdub3JlcyB0aXRsZScsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmKCkpO1xuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MxJywgW3Rvb2woeyBuYW1lOiAnYScgfSldKTtcblx0XHRkaWZmLmNvbnN1bWUoKTtcblxuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MxJywgW3Rvb2woeyBuYW1lOiAnYicgfSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZi5oYXNEaWZmZXJlbmNlLCB0cnVlKTtcblx0XHRkaWZmLmNvbnN1bWUoKTtcblxuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MxJywgW3Rvb2woeyBuYW1lOiAnYicsIGRlc2NyaXB0aW9uOiAnbmV3JyB9KV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmhhc0RpZmZlcmVuY2UsIHRydWUpO1xuXHRcdGRpZmYuY29uc3VtZSgpO1xuXG5cdFx0ZGlmZi5tb2RlbC5zZXRUb29scygnYzEnLCBbdG9vbCh7IG5hbWU6ICdiJywgZGVzY3JpcHRpb246ICduZXcnLCBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyBtc2c6IHsgdHlwZTogJ251bWJlcicgfSB9LCByZXF1aXJlZDogWydtc2cnXSB9IH0pXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmYuaGFzRGlmZmVyZW5jZSwgdHJ1ZSk7XG5cdFx0ZGlmZi5jb25zdW1lKCk7XG5cblx0XHRkaWZmLm1vZGVsLnNldFRvb2xzKCdjMScsIFt0b29sKHsgbmFtZTogJ2InLCBkZXNjcmlwdGlvbjogJ25ldycsIGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IG1zZzogeyB0eXBlOiAnbnVtYmVyJyB9IH0sIHJlcXVpcmVkOiBbJ21zZyddIH0sIHRpdGxlOiAnWCcgfSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZi5oYXNEaWZmZXJlbmNlLCBmYWxzZSwgJ3RpdGxlIGlzIG91dHNpZGUgdGhlIGRpZmYgc2NvcGUnKTtcblx0fSk7XG5cblx0dGVzdCgnb3JkZXItaW5zZW5zaXRpdmU6IHJlb3JkZXJpbmcgdG9vbHMgZG9lcyBub3QgZmxpcCBkaXJ0eScsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmKCkpO1xuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MxJywgW3Rvb2woeyBuYW1lOiAnYScgfSksIHRvb2woeyBuYW1lOiAnYicgfSldKTtcblx0XHRkaWZmLmNvbnN1bWUoKTtcblx0XHRkaWZmLm1vZGVsLnNldFRvb2xzKCdjMScsIFt0b29sKHsgbmFtZTogJ2InIH0pLCB0b29sKHsgbmFtZTogJ2EnIH0pXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmYuaGFzRGlmZmVyZW5jZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdvd25lck9mIHJlZmxlY3RzIHdoaWNoIGNsaWVudCBjb250cmlidXRlZCBhIHRvb2w7IGdldFRvb2xzIHJldHVybnMgYSBjbGllbnQgc2xpY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlmZiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbkNsaWVudFRvb2xzRGlmZigpKTtcblx0XHRkaWZmLm1vZGVsLnNldFRvb2xzKCdjMScsIFt0b29sKHsgbmFtZTogJ2EnIH0pXSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRUb29scygnYzInLCBbdG9vbCh7IG5hbWU6ICdiJyB9KV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLm1vZGVsLm93bmVyT2YoJ2EnKSwgJ2MxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmYubW9kZWwub3duZXJPZignYicpLCAnYzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZi5tb2RlbC5vd25lck9mKCdtaXNzaW5nJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWZmLm1vZGVsLmdldFRvb2xzKCdjMScpLCBbdG9vbCh7IG5hbWU6ICdhJyB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZi5tb2RlbC5nZXRUb29scygnYzInKSwgW3Rvb2woeyBuYW1lOiAnYicgfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2VkIHVuaW9ucyBtdWx0aXBsZSBjbGllbnRzIGFuZCBkZWR1cGVzIGJ5IG5hbWUgKGZpcnN0IGNsaWVudCB3aW5zKScsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmKCkpO1xuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MxJywgW3Rvb2woeyBuYW1lOiAnc2hhcmVkJywgZGVzY3JpcHRpb246ICdmcm9tIGMxJyB9KSwgdG9vbCh7IG5hbWU6ICdhJyB9KV0pO1xuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MyJywgW3Rvb2woeyBuYW1lOiAnc2hhcmVkJywgZGVzY3JpcHRpb246ICdmcm9tIGMyJyB9KSwgdG9vbCh7IG5hbWU6ICdiJyB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZi5tb2RlbC5tZXJnZWQuZ2V0KCkubWFwKHQgPT4gdC5uYW1lKSwgWydzaGFyZWQnLCAnYScsICdiJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLm1vZGVsLm93bmVyT2YoJ3NoYXJlZCcpLCAnYzEnLCAnZmlyc3QtaW5zZXJ0ZWQgY2xpZW50IHdpbnMgdGhlIHNoYXJlZCBuYW1lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ293bmVyT2YgcHJlZmVycyB0aGUgcmVxdWVzdGVkIGNsaWVudCB3aGVuIGl0IHByb3ZpZGVzIHRoZSBzaGFyZWQgdG9vbCcsICgpID0+IHtcblx0XHRjb25zdCBkaWZmID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmKCkpO1xuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MxJywgW3Rvb2woeyBuYW1lOiAnc2hhcmVkJywgZGVzY3JpcHRpb246ICdmcm9tIGMxJyB9KV0pO1xuXHRcdGRpZmYubW9kZWwuc2V0VG9vbHMoJ2MyJywgW3Rvb2woeyBuYW1lOiAnc2hhcmVkJywgZGVzY3JpcHRpb246ICdmcm9tIGMyJyB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGVmYXVsdE93bmVyOiBkaWZmLm1vZGVsLm93bmVyT2YoJ3NoYXJlZCcpLFxuXHRcdFx0cHJlZmVycmVkT3duZXI6IGRpZmYubW9kZWwub3duZXJPZignc2hhcmVkJywgJ2MyJyksXG5cdFx0XHRtaXNzaW5nUHJlZmVycmVkT3duZXI6IGRpZmYubW9kZWwub3duZXJPZignc2hhcmVkJywgJ21pc3NpbmcnKSxcblx0XHR9LCB7XG5cdFx0XHRkZWZhdWx0T3duZXI6ICdjMScsXG5cdFx0XHRwcmVmZXJyZWRPd25lcjogJ2MyJyxcblx0XHRcdG1pc3NpbmdQcmVmZXJyZWRPd25lcjogJ2MxJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlQ2xpZW50IGRyb3BzIHRoYXQgY2xpZW50IGFuZCByZS1mbGlwcyBkaXJ0eSB3aGVuIHRoZSBtZXJnZWQgc2V0IGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlmZiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbkNsaWVudFRvb2xzRGlmZigpKTtcblx0XHRkaWZmLm1vZGVsLnNldFRvb2xzKCdjMScsIFt0b29sKHsgbmFtZTogJ2EnIH0pXSk7XG5cdFx0ZGlmZi5tb2RlbC5zZXRUb29scygnYzInLCBbdG9vbCh7IG5hbWU6ICdiJyB9KV0pO1xuXHRcdGRpZmYuY29uc3VtZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmhhc0RpZmZlcmVuY2UsIGZhbHNlKTtcblxuXHRcdGRpZmYubW9kZWwucmVtb3ZlQ2xpZW50KCdjMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmhhc0RpZmZlcmVuY2UsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZi5tb2RlbC5tZXJnZWQuZ2V0KCkubWFwKHQgPT4gdC5uYW1lKSwgWydhJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLm1vZGVsLm93bmVyT2YoJ2InKSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLDhCQUE4QjtBQUV2QyxNQUFNLE9BQU8sQ0FBQyxPQUFnQyxDQUFDLE9BQXVCO0FBQUEsRUFDckUsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsYUFBYSxFQUFFLE1BQU0sVUFBVSxZQUFZLEVBQUUsS0FBSyxFQUFFLE1BQU0sU0FBUyxFQUFFLEdBQUcsVUFBVSxDQUFDLEtBQUssRUFBRTtBQUFBLEVBQzFGLEdBQUc7QUFDSjtBQUVBLE1BQU0sMEJBQTBCLE1BQU07QUFFckMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxPQUFLLDJDQUEyQyxNQUFNO0FBQ3JELFVBQU0sT0FBTyxZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN6RCxXQUFPLGdCQUFnQixLQUFLLE1BQU0sT0FBTyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQ2xELFdBQU8sWUFBWSxLQUFLLGVBQWUsS0FBSztBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLDhEQUF5RCxNQUFNO0FBQ25FLFVBQU0sT0FBTyxZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN6RCxTQUFLLE1BQU0sU0FBUyxNQUFNLENBQUMsQ0FBQztBQUM1QixXQUFPLFlBQVksS0FBSyxlQUFlLEtBQUs7QUFBQSxFQUM3QyxDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsTUFBTTtBQUN2RCxVQUFNLE9BQU8sWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDekQsU0FBSyxNQUFNLFNBQVMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ2xDLFdBQU8sWUFBWSxLQUFLLGVBQWUsSUFBSTtBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFVBQU0sT0FBTyxZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN6RCxTQUFLLE1BQU0sU0FBUyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDbEMsVUFBTSxTQUFTLEtBQUssUUFBUTtBQUM1QixXQUFPLGdCQUFnQixRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDdkMsV0FBTyxZQUFZLEtBQUssZUFBZSxLQUFLO0FBQUEsRUFDN0MsQ0FBQztBQUVELE9BQUssb0ZBQW9GLE1BQU07QUFDOUYsVUFBTSxPQUFPLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3pELFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNsQyxTQUFLLFFBQVE7QUFDYixTQUFLLE1BQU0sU0FBUyxNQUFNLENBQUMsRUFBRSxNQUFNLFFBQVEsYUFBYSxVQUFVLGFBQWEsRUFBRSxNQUFNLFVBQVUsWUFBWSxFQUFFLEtBQUssRUFBRSxNQUFNLFNBQVMsRUFBRSxHQUFHLFVBQVUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDaEssV0FBTyxZQUFZLEtBQUssZUFBZSxLQUFLO0FBQUEsRUFDN0MsQ0FBQztBQUVELE9BQUssMkVBQTJFLFlBQVk7QUFDM0YsVUFBTSxPQUFPLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3pELFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxXQUFXLENBQUMsQ0FBQyxDQUFDO0FBQ3RELFVBQU0sU0FBUyxLQUFLLFFBQVE7QUFDNUIsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDLEtBQUssRUFBRSxNQUFNLFdBQVcsQ0FBQyxDQUFDLENBQUM7QUFDM0QsVUFBTSxRQUFRLFFBQVE7QUFDdEIsU0FBSyxNQUFNLFNBQVMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLFFBQVEsQ0FBQyxDQUFDLENBQUM7QUFDbkQsV0FBTyxZQUFZLEtBQUssZUFBZSxJQUFJO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxPQUFPLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3pELFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNsQyxTQUFLLFFBQVE7QUFDYixXQUFPLFlBQVksS0FBSyxlQUFlLEtBQUs7QUFDNUMsU0FBSyxVQUFVO0FBQ2YsV0FBTyxZQUFZLEtBQUssZUFBZSxJQUFJO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUssMkVBQTJFLE1BQU07QUFDckYsVUFBTSxPQUFPLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3pELFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQy9DLFNBQUssUUFBUTtBQUViLFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQy9DLFdBQU8sWUFBWSxLQUFLLGVBQWUsSUFBSTtBQUMzQyxTQUFLLFFBQVE7QUFFYixTQUFLLE1BQU0sU0FBUyxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sS0FBSyxhQUFhLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDbkUsV0FBTyxZQUFZLEtBQUssZUFBZSxJQUFJO0FBQzNDLFNBQUssUUFBUTtBQUViLFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxLQUFLLGFBQWEsT0FBTyxhQUFhLEVBQUUsTUFBTSxVQUFVLFlBQVksRUFBRSxLQUFLLEVBQUUsTUFBTSxTQUFTLEVBQUUsR0FBRyxVQUFVLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDaEssV0FBTyxZQUFZLEtBQUssZUFBZSxJQUFJO0FBQzNDLFNBQUssUUFBUTtBQUViLFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxLQUFLLGFBQWEsT0FBTyxhQUFhLEVBQUUsTUFBTSxVQUFVLFlBQVksRUFBRSxLQUFLLEVBQUUsTUFBTSxTQUFTLEVBQUUsR0FBRyxVQUFVLENBQUMsS0FBSyxFQUFFLEdBQUcsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQzVLLFdBQU8sWUFBWSxLQUFLLGVBQWUsT0FBTyxpQ0FBaUM7QUFBQSxFQUNoRixDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxVQUFNLE9BQU8sWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDekQsU0FBSyxNQUFNLFNBQVMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQyxHQUFHLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDcEUsU0FBSyxRQUFRO0FBQ2IsU0FBSyxNQUFNLFNBQVMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQyxHQUFHLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDcEUsV0FBTyxZQUFZLEtBQUssZUFBZSxLQUFLO0FBQUEsRUFDN0MsQ0FBQztBQUVELE9BQUsscUZBQXFGLE1BQU07QUFDL0YsVUFBTSxPQUFPLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3pELFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQy9DLFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQy9DLFdBQU8sWUFBWSxLQUFLLE1BQU0sUUFBUSxHQUFHLEdBQUcsSUFBSTtBQUNoRCxXQUFPLFlBQVksS0FBSyxNQUFNLFFBQVEsR0FBRyxHQUFHLElBQUk7QUFDaEQsV0FBTyxZQUFZLEtBQUssTUFBTSxRQUFRLFNBQVMsR0FBRyxNQUFTO0FBQzNELFdBQU8sZ0JBQWdCLEtBQUssTUFBTSxTQUFTLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDdkUsV0FBTyxnQkFBZ0IsS0FBSyxNQUFNLFNBQVMsSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ3hFLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFVBQU0sT0FBTyxZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN6RCxTQUFLLE1BQU0sU0FBUyxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sVUFBVSxhQUFhLFVBQVUsQ0FBQyxHQUFHLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDakcsU0FBSyxNQUFNLFNBQVMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLFVBQVUsYUFBYSxVQUFVLENBQUMsR0FBRyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ2pHLFdBQU8sZ0JBQWdCLEtBQUssTUFBTSxPQUFPLElBQUksRUFBRSxJQUFJLE9BQUssRUFBRSxJQUFJLEdBQUcsQ0FBQyxVQUFVLEtBQUssR0FBRyxDQUFDO0FBQ3JGLFdBQU8sWUFBWSxLQUFLLE1BQU0sUUFBUSxRQUFRLEdBQUcsTUFBTSw0Q0FBNEM7QUFBQSxFQUNwRyxDQUFDO0FBRUQsT0FBSyx5RUFBeUUsTUFBTTtBQUNuRixVQUFNLE9BQU8sWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDekQsU0FBSyxNQUFNLFNBQVMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLFVBQVUsYUFBYSxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBQzVFLFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxVQUFVLGFBQWEsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUM1RSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGNBQWMsS0FBSyxNQUFNLFFBQVEsUUFBUTtBQUFBLE1BQ3pDLGdCQUFnQixLQUFLLE1BQU0sUUFBUSxVQUFVLElBQUk7QUFBQSxNQUNqRCx1QkFBdUIsS0FBSyxNQUFNLFFBQVEsVUFBVSxTQUFTO0FBQUEsSUFDOUQsR0FBRztBQUFBLE1BQ0YsY0FBYztBQUFBLE1BQ2QsZ0JBQWdCO0FBQUEsTUFDaEIsdUJBQXVCO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaUZBQWlGLE1BQU07QUFDM0YsVUFBTSxPQUFPLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3pELFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQy9DLFNBQUssTUFBTSxTQUFTLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQy9DLFNBQUssUUFBUTtBQUNiLFdBQU8sWUFBWSxLQUFLLGVBQWUsS0FBSztBQUU1QyxTQUFLLE1BQU0sYUFBYSxJQUFJO0FBQzVCLFdBQU8sWUFBWSxLQUFLLGVBQWUsSUFBSTtBQUMzQyxXQUFPLGdCQUFnQixLQUFLLE1BQU0sT0FBTyxJQUFJLEVBQUUsSUFBSSxPQUFLLEVBQUUsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQ3RFLFdBQU8sWUFBWSxLQUFLLE1BQU0sUUFBUSxHQUFHLEdBQUcsTUFBUztBQUFBLEVBQ3RELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
