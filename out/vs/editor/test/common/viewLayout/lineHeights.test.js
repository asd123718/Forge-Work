import assert from "assert";
import { CustomLineHeightData, LineHeightsManager } from "../../../common/viewLayout/lineHeights.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("Editor ViewLayout - LineHeightsManager", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("default line height is used when no custom heights exist", () => {
    const manager = new LineHeightsManager(10, []);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.heightForLineNumber(100), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 50);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(10), 100);
  });
  test("can change default line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.defaultLineHeight = 20;
    assert.strictEqual(manager.heightForLineNumber(1), 20);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 20);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 100);
  });
  test("can add single custom line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 20);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 40);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 50);
  });
  test("can add multiple custom line heights", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 2, 15);
    manager.insertOrChangeCustomLineHeight("dec2", 4, 4, 25);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 15);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 25);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 25);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 35);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
  });
  test("can add range of custom line heights", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 4, 15);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 15);
    assert.strictEqual(manager.heightForLineNumber(3), 15);
    assert.strictEqual(manager.heightForLineNumber(4), 15);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 25);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 40);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 55);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 65);
  });
  test("can change existing custom line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 30);
    assert.strictEqual(manager.heightForLineNumber(3), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 50);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
  });
  test("can remove custom line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    manager.removeCustomLineHeight("dec1");
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 40);
  });
  test("handles overlapping custom line heights (last one wins)", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 5, 20);
    manager.insertOrChangeCustomLineHeight("dec2", 4, 6, 30);
    assert.strictEqual(manager.heightForLineNumber(2), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    assert.strictEqual(manager.heightForLineNumber(4), 30);
    assert.strictEqual(manager.heightForLineNumber(5), 30);
    assert.strictEqual(manager.heightForLineNumber(6), 30);
    assert.strictEqual(manager.heightForLineNumber(7), 10);
  });
  test("handles deleting lines before custom line heights", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 10, 12, 20);
    manager.onLinesDeleted(5, 7);
    assert.strictEqual(manager.heightForLineNumber(7), 20);
    assert.strictEqual(manager.heightForLineNumber(8), 20);
    assert.strictEqual(manager.heightForLineNumber(9), 20);
    assert.strictEqual(manager.heightForLineNumber(10), 10);
  });
  test("handles deleting lines overlapping with custom line heights", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 10, 20);
    manager.onLinesDeleted(7, 12);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
    assert.strictEqual(manager.heightForLineNumber(6), 20);
    assert.strictEqual(manager.heightForLineNumber(7), 10);
  });
  test("handles deleting lines containing custom line heights completely", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 7, 20);
    manager.onLinesDeleted(4, 8);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 20);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
  });
  test("handles deleting lines at the very beginning", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decA", 1, 1, 40);
    manager.onLinesDeleted(2, 4);
    assert.strictEqual(manager.heightForLineNumber(1), 40);
  });
  test("handles inserting lines before custom line heights", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 7, 20);
    manager.onLinesInserted(3, 4);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.heightForLineNumber(6), 10);
    assert.strictEqual(manager.heightForLineNumber(7), 20);
    assert.strictEqual(manager.heightForLineNumber(8), 20);
    assert.strictEqual(manager.heightForLineNumber(9), 20);
  });
  test("handles inserting lines inside custom line heights range", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 7, 20);
    manager.onLinesInserted(6, 7);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
    assert.strictEqual(manager.heightForLineNumber(6), 20);
    assert.strictEqual(manager.heightForLineNumber(7), 20);
    assert.strictEqual(manager.heightForLineNumber(8), 20);
    assert.strictEqual(manager.heightForLineNumber(9), 20);
  });
  test("changing decoration id maintains custom line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 7, 20);
    manager.removeCustomLineHeight("dec1");
    manager.insertOrChangeCustomLineHeight("dec2", 5, 7, 20);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
    assert.strictEqual(manager.heightForLineNumber(6), 20);
    assert.strictEqual(manager.heightForLineNumber(7), 20);
  });
  test("accumulates heights correctly with complex setup", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 15);
    manager.insertOrChangeCustomLineHeight("dec2", 5, 7, 20);
    manager.insertOrChangeCustomLineHeight("dec3", 10, 10, 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 20);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 35);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 45);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 65);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(7), 105);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(9), 125);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(10), 155);
  });
  test("partial deletion with multiple lines for the same decoration ID", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decSame", 5, 5, 20);
    manager.insertOrChangeCustomLineHeight("decSame", 6, 6, 25);
    manager.onLinesDeleted(6, 6);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.heightForLineNumber(6), 25);
  });
  test("overlapping decorations use maximum line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decA", 3, 5, 40);
    manager.insertOrChangeCustomLineHeight("decB", 4, 6, 30);
    assert.strictEqual(manager.heightForLineNumber(3), 40);
    assert.strictEqual(manager.heightForLineNumber(4), 40);
    assert.strictEqual(manager.heightForLineNumber(5), 40);
    assert.strictEqual(manager.heightForLineNumber(6), 30);
  });
  test("onLinesInserted with same decoration ID extending to inserted line", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decA", 1, 1, 30);
    assert.strictEqual(manager.heightForLineNumber(1), 30);
    assert.strictEqual(manager.heightForLineNumber(2), 10);
    manager.onLinesInserted(2, 2);
    manager.insertOrChangeCustomLineHeight("decA", 2, 2, 30);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 30);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
  });
});
suite("Editor ViewLayout - LineHeightsManager (auto-commit on read)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("read after single insert without commit", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 40);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 50);
  });
  test("read after multiple inserts without commit", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 2, 15);
    manager.insertOrChangeCustomLineHeight("dec2", 4, 4, 25);
    assert.strictEqual(manager.heightForLineNumber(2), 15);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 25);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
  });
  test("read after remove without commit", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    manager.removeCustomLineHeight("dec1");
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 30);
  });
  test("insert then remove same decoration without commit", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.removeCustomLineHeight("dec1");
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 30);
  });
  test("insert same decoration ID twice without commit replaces first", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 5, 30);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(5), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
  });
  test("interleaved callers: remove must cancel queued inserts before first flush", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decA", 3, 3, 20);
    manager.insertOrChangeCustomLineHeight("decB", 4, 4, 30);
    manager.removeCustomLineHeight("decA");
    manager.onLinesInserted(1, 1);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
    assert.strictEqual(manager.heightForLineNumber(5), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
  });
  test("interleaved callers: remove must cancel queued inserts before delete flush", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decA", 3, 3, 20);
    manager.insertOrChangeCustomLineHeight("decB", 5, 5, 30);
    manager.removeCustomLineHeight("decA");
    manager.onLinesDeleted(1, 1);
    assert.strictEqual(manager.heightForLineNumber(2), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
  });
  test("interleaved: insert, insert, onLinesInserted, onLinesDeleted, remove, remove, insert, insert, read", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 2, 20);
    manager.insertOrChangeCustomLineHeight("dec2", 5, 5, 30);
    manager.onLinesInserted(3, 4);
    manager.onLinesDeleted(1, 1);
    manager.removeCustomLineHeight("dec1");
    manager.removeCustomLineHeight("dec2");
    manager.insertOrChangeCustomLineHeight("dec3", 3, 3, 40);
    manager.insertOrChangeCustomLineHeight("dec4", 5, 5, 50);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 40);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
    assert.strictEqual(manager.heightForLineNumber(5), 50);
    assert.strictEqual(manager.heightForLineNumber(6), 10);
  });
  test("interleaved: insert, onLinesInserted, remove, read", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesInserted(1, 1);
    manager.removeCustomLineHeight("dec1");
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
  });
  test("interleaved: onLinesDeleted, insert, read", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 5, 20);
    manager.onLinesDeleted(1, 2);
    manager.insertOrChangeCustomLineHeight("dec2", 1, 1, 30);
    assert.strictEqual(manager.heightForLineNumber(1), 30);
    assert.strictEqual(manager.heightForLineNumber(2), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
  });
  test("interleaved: insert, onLinesDeleted, insert, read", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesDeleted(1, 1);
    manager.insertOrChangeCustomLineHeight("dec2", 5, 5, 30);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 20);
    assert.strictEqual(manager.heightForLineNumber(5), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 80);
  });
  test("onLinesInserted then onLinesDeleted without reads between", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesInserted(1, 2);
    manager.onLinesDeleted(1, 1);
    assert.strictEqual(manager.heightForLineNumber(4), 20);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 50);
  });
  test("multiple onLinesInserted without reads between", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesInserted(1, 1);
    manager.onLinesInserted(1, 1);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
  });
  test("multiple onLinesDeleted without reads between", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 10, 10, 20);
    manager.onLinesDeleted(1, 2);
    manager.onLinesDeleted(1, 2);
    assert.strictEqual(manager.heightForLineNumber(6), 20);
    assert.strictEqual(manager.heightForLineNumber(7), 10);
  });
  test("pending insert then onLinesDeleted affecting that line", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesDeleted(3, 3);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
  });
  test("pending insert then onLinesInserted shifting that line", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesInserted(1, 2);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
  });
  test("accumulated heights correct after interleaved ops without commit", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 2, 15);
    manager.insertOrChangeCustomLineHeight("dec2", 4, 4, 25);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 25);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 35);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
  });
  test("constructor with initial data works without explicit commit", () => {
    const data = [
      new CustomLineHeightData("dec1", 2, 4, 20),
      new CustomLineHeightData("dec2", 6, 6, 30)
    ];
    const manager = new LineHeightsManager(10, data);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 20);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    assert.strictEqual(manager.heightForLineNumber(4), 20);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.heightForLineNumber(6), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(6), 110);
  });
  test("deleting line 2 with lineHeightsRemoved re-adding at line 1 moves special line to line 1", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 2, 20);
    assert.strictEqual(manager.heightForLineNumber(2), 20);
    manager.onLinesDeleted(2, 2);
    manager.insertOrChangeCustomLineHeight("dec1", 1, 1, 20);
    assert.strictEqual(manager.heightForLineNumber(1), 20);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcdmlld0xheW91dFxcbGluZUhlaWdodHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEN1c3RvbUxpbmVIZWlnaHREYXRhLCBMaW5lSGVpZ2h0c01hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC9saW5lSGVpZ2h0cy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ0VkaXRvciBWaWV3TGF5b3V0IC0gTGluZUhlaWdodHNNYW5hZ2VyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2RlZmF1bHQgbGluZSBoZWlnaHQgaXMgdXNlZCB3aGVuIG5vIGN1c3RvbSBoZWlnaHRzIGV4aXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cblx0XHQvLyBDaGVjayBpbmRpdmlkdWFsIGxpbmUgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxMDApLCAxMCk7XG5cblx0XHQvLyBDaGVjayBhY2N1bXVsYXRlZCBoZWlnaHRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig1KSwgNTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDEwKSwgMTAwKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGNoYW5nZSBkZWZhdWx0IGxpbmUgaGVpZ2h0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5kZWZhdWx0TGluZUhlaWdodCA9IDIwO1xuXG5cdFx0Ly8gQ2hlY2sgaW5kaXZpZHVhbCBsaW5lIGhlaWdodHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDEpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMjApO1xuXG5cdFx0Ly8gQ2hlY2sgYWNjdW11bGF0ZWQgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDEpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNSksIDEwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBhZGQgc2luZ2xlIGN1c3RvbSBsaW5lIGhlaWdodCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMywgMywgMjApO1xuXG5cdFx0Ly8gQ2hlY2sgaW5kaXZpZHVhbCBsaW5lIGhlaWdodHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigyKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCAxMCk7XG5cblx0XHQvLyBDaGVjayBhY2N1bXVsYXRlZCBoZWlnaHRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigyKSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDMpLCA0MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNCksIDUwKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGFkZCBtdWx0aXBsZSBjdXN0b20gbGluZSBoZWlnaHRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAyLCAyLCAxNSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzInLCA0LCA0LCAyNSk7XG5cblx0XHQvLyBDaGVjayBpbmRpdmlkdWFsIGxpbmUgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDIpLCAxNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDI1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAxMCk7XG5cblx0XHQvLyBDaGVjayBhY2N1bXVsYXRlZCBoZWlnaHRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigyKSwgMjUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDMpLCAzNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNCksIDYwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig1KSwgNzApO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gYWRkIHJhbmdlIG9mIGN1c3RvbSBsaW5lIGhlaWdodHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDIsIDQsIDE1KTtcblxuXHRcdC8vIENoZWNrIGluZGl2aWR1YWwgbGluZSBoZWlnaHRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMiksIDE1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAxNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig0KSwgMTUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNSksIDEwKTtcblxuXHRcdC8vIENoZWNrIGFjY3VtdWxhdGVkIGhlaWdodHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigxKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDIpLCAyNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMyksIDQwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig0KSwgNTUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDUpLCA2NSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBjaGFuZ2UgZXhpc3RpbmcgY3VzdG9tIGxpbmUgaGVpZ2h0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMjApO1xuXG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAzMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMzApO1xuXG5cdFx0Ly8gQ2hlY2sgYWNjdW11bGF0ZWQgaGVpZ2h0cyBhZnRlciBjaGFuZ2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigzKSwgNTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDQpLCA2MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiByZW1vdmUgY3VzdG9tIGxpbmUgaGVpZ2h0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMjApO1xuXG5cdFx0bWFuYWdlci5yZW1vdmVDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXG5cdFx0Ly8gQ2hlY2sgYWNjdW11bGF0ZWQgaGVpZ2h0cyBhZnRlciByZW1vdmFsXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMyksIDMwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig0KSwgNDApO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG92ZXJsYXBwaW5nIGN1c3RvbSBsaW5lIGhlaWdodHMgKGxhc3Qgb25lIHdpbnMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCA1LCAyMCk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzInLCA0LCA2LCAzMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDIpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDMwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAzMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig2KSwgMzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNyksIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBkZWxldGluZyBsaW5lcyBiZWZvcmUgY3VzdG9tIGxpbmUgaGVpZ2h0cycsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMTAsIDEyLCAyMCk7XG5cblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDUsIDcpOyAvLyBEZWxldGUgbGluZXMgNS03XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDcpLCAyMCk7IC8vIFdhcyBsaW5lIDEwXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig4KSwgMjApOyAvLyBXYXMgbGluZSAxMVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoOSksIDIwKTsgLy8gV2FzIGxpbmUgMTJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDEwKSwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGRlbGV0aW5nIGxpbmVzIG92ZXJsYXBwaW5nIHdpdGggY3VzdG9tIGxpbmUgaGVpZ2h0cycsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgNSwgMTAsIDIwKTtcblxuXHRcdG1hbmFnZXIub25MaW5lc0RlbGV0ZWQoNywgMTIpOyAvLyBEZWxldGUgbGluZXMgNy0xMiwgaW5jbHVkaW5nIHBhcnQgb2YgZGVjb3JhdGlvblxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNiksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDcpLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgZGVsZXRpbmcgbGluZXMgY29udGFpbmluZyBjdXN0b20gbGluZSBoZWlnaHRzIGNvbXBsZXRlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDUsIDcsIDIwKTtcblxuXHRcdG1hbmFnZXIub25MaW5lc0RlbGV0ZWQoNCwgOCk7IC8vIERlbGV0ZSBsaW5lcyA0LTgsIGNvbXBsZXRlbHkgY29udGFpbnMgZGVjb3JhdGlvblxuXG5cdFx0Ly8gVGhlIGRlY29yYXRpb24gY29sbGFwc2VzIHRvIGEgc2luZ2xlIGxpbmUgd2hpY2ggbWF0Y2hlcyB0aGUgYmVoYXZpb3IgaW4gdGhlIHRleHQgYnVmZmVyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgZGVsZXRpbmcgbGluZXMgYXQgdGhlIHZlcnkgYmVnaW5uaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlY0EnLCAxLCAxLCA0MCk7XG5cblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDIsIDQpOyAvLyBEZWxldGUgbGluZXMgMi00IGFmdGVyIHRoZSB2YXJpYWJsZSBsaW5lIGhlaWdodFxuXG5cdFx0Ly8gQ2hlY2sgaW5kaXZpZHVhbCBsaW5lIGhlaWdodHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDEpLCA0MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgaW5zZXJ0aW5nIGxpbmVzIGJlZm9yZSBjdXN0b20gbGluZSBoZWlnaHRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCA1LCA3LCAyMCk7XG5cblx0XHRtYW5hZ2VyLm9uTGluZXNJbnNlcnRlZCgzLCA0KTsgLy8gSW5zZXJ0IDIgbGluZXMgYXQgbGluZSAzXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig2KSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNyksIDIwKTsgLy8gV2FzIGxpbmUgNVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoOCksIDIwKTsgLy8gV2FzIGxpbmUgNlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoOSksIDIwKTsgLy8gV2FzIGxpbmUgN1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGluc2VydGluZyBsaW5lcyBpbnNpZGUgY3VzdG9tIGxpbmUgaGVpZ2h0cyByYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgNSwgNywgMjApO1xuXG5cdFx0bWFuYWdlci5vbkxpbmVzSW5zZXJ0ZWQoNiwgNyk7IC8vIEluc2VydCAyIGxpbmVzIGF0IGxpbmUgNlxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNiksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDcpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig4KSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoOSksIDIwKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdpbmcgZGVjb3JhdGlvbiBpZCBtYWludGFpbnMgY3VzdG9tIGxpbmUgaGVpZ2h0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCA1LCA3LCAyMCk7XG5cblx0XHRtYW5hZ2VyLnJlbW92ZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMicsIDUsIDcsIDIwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNSksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDYpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig3KSwgMjApO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2N1bXVsYXRlcyBoZWlnaHRzIGNvcnJlY3RseSB3aXRoIGNvbXBsZXggc2V0dXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDMsIDMsIDE1KTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMicsIDUsIDcsIDIwKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMycsIDEwLCAxMCwgMzApO1xuXG5cdFx0Ly8gQ2hlY2sgYWNjdW11bGF0ZWQgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMiksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigzKSwgMzUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDQpLCA0NSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNSksIDY1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig3KSwgMTA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig5KSwgMTI1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigxMCksIDE1NSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnRpYWwgZGVsZXRpb24gd2l0aCBtdWx0aXBsZSBsaW5lcyBmb3IgdGhlIHNhbWUgZGVjb3JhdGlvbiBJRCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWNTYW1lJywgNSwgNSwgMjApO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWNTYW1lJywgNiwgNiwgMjUpO1xuXG5cdFx0Ly8gRGVsZXRlIG9uZSBsaW5lIHRoYXQgcGFydGlhbGx5IGludGVyc2VjdHMgdGhlIHNhbWUgZGVjb3JhdGlvblxuXHRcdG1hbmFnZXIub25MaW5lc0RlbGV0ZWQoNiwgNik7XG5cblx0XHQvLyBDaGVjayBpbmRpdmlkdWFsIGxpbmUgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDYpLCAyNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ292ZXJsYXBwaW5nIGRlY29yYXRpb25zIHVzZSBtYXhpbXVtIGxpbmUgaGVpZ2h0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlY0EnLCAzLCA1LCA0MCk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlY0InLCA0LCA2LCAzMCk7XG5cblx0XHQvLyBDaGVjayBpbmRpdmlkdWFsIGxpbmUgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDQwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCA0MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgNDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNiksIDMwKTtcblx0fSk7XG5cblx0dGVzdCgnb25MaW5lc0luc2VydGVkIHdpdGggc2FtZSBkZWNvcmF0aW9uIElEIGV4dGVuZGluZyB0byBpbnNlcnRlZCBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0Ly8gU2V0IHVwIGEgc3BlY2lhbCBsaW5lIGF0IGxpbmUgMSB3aXRoIGRlY29yYXRpb24gJ2RlY0EnXG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlY0EnLCAxLCAxLCAzMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDEpLCAzMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigyKSwgMTApO1xuXG5cdFx0Ly8gSW5zZXJ0IGxpbmUgMiB0byBsaW5lIDIsIHdpdGggdGhlIHNhbWUgZGVjb3JhdGlvbiBJRCAnZGVjQScgY292ZXJpbmcgbGluZSAyXG5cdFx0bWFuYWdlci5vbkxpbmVzSW5zZXJ0ZWQoMiwgMik7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlY0EnLCAyLCAyLCAzMCk7XG5cblx0XHQvLyBBZnRlciBpbnNlcnRpb24sIHRoZSBkZWNvcmF0aW9uICdkZWNBJyBub3cgY292ZXJzIGxpbmUgMlxuXHRcdC8vIFNpbmNlIGluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCByZW1vdmVzIHRoZSBvbGQgZGVjb3JhdGlvbiBmaXJzdCxcblx0XHQvLyBsaW5lIDEgbm8gbG9uZ2VyIGhhcyB0aGUgY3VzdG9tIGhlaWdodCwgYW5kIGxpbmUgMiBnZXRzIGl0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMiksIDMwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAxMCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdFZGl0b3IgVmlld0xheW91dCAtIExpbmVIZWlnaHRzTWFuYWdlciAoYXV0by1jb21taXQgb24gcmVhZCknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tIEF1dG8tY29tbWl0IG9uIHJlYWQ6IHJlYWRzIHdpdGhvdXQgZXhwbGljaXQgY29tbWl0KCkgLS0tXG5cblx0dGVzdCgncmVhZCBhZnRlciBzaW5nbGUgaW5zZXJ0IHdpdGhvdXQgY29tbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0Ly8gTm8gY29tbWl0KCkgY2FsbCBcdTIwMTQgcmVhZCBzaG91bGQgc3RpbGwgd29ya1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig0KSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDMpLCA0MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNCksIDUwKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZCBhZnRlciBtdWx0aXBsZSBpbnNlcnRzIHdpdGhvdXQgY29tbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAyLCAyLCAxNSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzInLCA0LCA0LCAyNSk7XG5cdFx0Ly8gTm8gY29tbWl0KCkgY2FsbFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMiksIDE1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig0KSwgMjUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDQpLCA2MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNSksIDcwKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZCBhZnRlciByZW1vdmUgd2l0aG91dCBjb21taXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDMsIDMsIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAyMCk7XG5cblx0XHRtYW5hZ2VyLnJlbW92ZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnKTtcblx0XHQvLyBObyBjb21taXQoKSBjYWxsXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDMpLCAzMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCB0aGVuIHJlbW92ZSBzYW1lIGRlY29yYXRpb24gd2l0aG91dCBjb21taXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDMsIDMsIDIwKTtcblx0XHRtYW5hZ2VyLnJlbW92ZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnKTtcblx0XHQvLyBObyBjb21taXQoKSBjYWxsIFx1MjAxNCBzaG91bGQgc2VlIGRlZmF1bHQgaGVpZ2h0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDMpLCAzMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCBzYW1lIGRlY29yYXRpb24gSUQgdHdpY2Ugd2l0aG91dCBjb21taXQgcmVwbGFjZXMgZmlyc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDMsIDMsIDIwKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDUsIDUsIDMwKTtcblx0XHQvLyBObyBjb21taXQoKSBcdTIwMTQgc2Vjb25kIGNhbGwgc2hvdWxkIHJlcGxhY2UgZmlyc3Rcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDUpLCA3MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludGVybGVhdmVkIGNhbGxlcnM6IHJlbW92ZSBtdXN0IGNhbmNlbCBxdWV1ZWQgaW5zZXJ0cyBiZWZvcmUgZmlyc3QgZmx1c2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblxuXHRcdC8vIENhbGxlciBBIHF1ZXVlcyBkZWNvcmF0aW9uIGluc2VydC5cblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjQScsIDMsIDMsIDIwKTtcblx0XHQvLyBDYWxsZXIgQiBxdWV1ZXMgaW5kZXBlbmRlbnQgaW5zZXJ0LlxuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWNCJywgNCwgNCwgMzApO1xuXHRcdC8vIENhbGxlciBBIHJlbW92ZXMgaXRzIGRlY29yYXRpb24gYmVmb3JlIGFueSBmbHVzaCBvY2N1cnMuXG5cdFx0bWFuYWdlci5yZW1vdmVDdXN0b21MaW5lSGVpZ2h0KCdkZWNBJyk7XG5cdFx0Ly8gQ2FsbGVyIEIgdHJpZ2dlcnMgYSBzdHJ1Y3R1cmFsIGNoYW5nZSB0aGF0IGNhdXNlcyBxdWV1ZSBmbHVzaCBpbiB0aGUgbWlkZGxlIG9mIGNvbW1pdC5cblx0XHRtYW5hZ2VyLm9uTGluZXNJbnNlcnRlZCgxLCAxKTtcblxuXHRcdC8vIGRlY0EgbXVzdCBzdGF5IHJlbW92ZWQuIElmIHF1ZXVlZCBpbnNlcnRzIGFyZSBub3QgY2FuY2VsZWQgb24gcmVtb3ZlLCBkZWNBIGluY29ycmVjdGx5IHN1cnZpdmVzLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAzMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNSksIDcwKTtcblx0fSk7XG5cblx0dGVzdCgnaW50ZXJsZWF2ZWQgY2FsbGVyczogcmVtb3ZlIG11c3QgY2FuY2VsIHF1ZXVlZCBpbnNlcnRzIGJlZm9yZSBkZWxldGUgZmx1c2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblxuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWNBJywgMywgMywgMjApO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWNCJywgNSwgNSwgMzApO1xuXHRcdG1hbmFnZXIucmVtb3ZlQ3VzdG9tTGluZUhlaWdodCgnZGVjQScpO1xuXHRcdG1hbmFnZXIub25MaW5lc0RlbGV0ZWQoMSwgMSk7XG5cblx0XHQvLyBBZnRlciBkZWxldGluZyBsaW5lIDEsIGRlY0Igc2hpZnRzIGZyb20gbGluZSA1IHRvIGxpbmUgNC5cblx0XHQvLyBkZWNBIG11c3QgcmVtYWluIHJlbW92ZWQgZXZlbiB0aG91Z2ggaXRzIGluc2VydCB3YXMgcXVldWVkIGJlZm9yZSB0aGUgcmVtb3ZlLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMiksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig0KSwgMzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDQpLCA2MCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBJbnRlcmxlYXZlZCBvcGVyYXRpb25zIC0tLVxuXG5cdHRlc3QoJ2ludGVybGVhdmVkOiBpbnNlcnQsIGluc2VydCwgb25MaW5lc0luc2VydGVkLCBvbkxpbmVzRGVsZXRlZCwgcmVtb3ZlLCByZW1vdmUsIGluc2VydCwgaW5zZXJ0LCByZWFkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0Ly8gU3RlcCAxLTI6IHR3byBpbnNlcnRzXG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAyLCAyLCAyMCk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzInLCA1LCA1LCAzMCk7XG5cdFx0Ly8gU3RlcCAzOiBpbnNlcnQgMiBsaW5lcyBhdCBsaW5lIDMgKHNoaWZ0cyBkZWMyIGZyb20gbGluZSA1IFx1MjE5MiA3KVxuXHRcdG1hbmFnZXIub25MaW5lc0luc2VydGVkKDMsIDQpO1xuXHRcdC8vIFN0ZXAgNDogZGVsZXRlIGxpbmUgMSAoc2hpZnRzIGRlYzEgZnJvbSBsaW5lIDIgXHUyMTkyIDEsIGRlYzIgZnJvbSBsaW5lIDcgXHUyMTkyIDYpXG5cdFx0bWFuYWdlci5vbkxpbmVzRGVsZXRlZCgxLCAxKTtcblx0XHQvLyBTdGVwIDUtNjogcmVtb3ZlIHRoZSB0d28gZGVjb3JhdGlvbnNcblx0XHRtYW5hZ2VyLnJlbW92ZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnKTtcblx0XHRtYW5hZ2VyLnJlbW92ZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzInKTtcblx0XHQvLyBTdGVwIDctODogdHdvIG5ldyBpbnNlcnRzXG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzMnLCAzLCAzLCA0MCk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzQnLCA1LCA1LCA1MCk7XG5cdFx0Ly8gUmVhZCBcdTIwMTQgbm8gZXhwbGljaXQgY29tbWl0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDQwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgNTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNiksIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnaW50ZXJsZWF2ZWQ6IGluc2VydCwgb25MaW5lc0luc2VydGVkLCByZW1vdmUsIHJlYWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDMsIDMsIDIwKTtcblx0XHQvLyBJbnNlcnQgMSBsaW5lIGF0IGxpbmUgMSBcdTIxOTIgZGVjMSBzaGlmdHMgZnJvbSAzIFx1MjE5MiA0XG5cdFx0bWFuYWdlci5vbkxpbmVzSW5zZXJ0ZWQoMSwgMSk7XG5cdFx0bWFuYWdlci5yZW1vdmVDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJyk7XG5cdFx0Ly8gUmVhZCBcdTIwMTQgbm8gZXhwbGljaXQgY29tbWl0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnaW50ZXJsZWF2ZWQ6IG9uTGluZXNEZWxldGVkLCBpbnNlcnQsIHJlYWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDUsIDUsIDIwKTtcblx0XHQvLyBEZWxldGUgbGluZXMgMS0yIFx1MjE5MiBkZWMxIHNoaWZ0cyBmcm9tIDUgXHUyMTkyIDNcblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDEsIDIpO1xuXHRcdC8vIEluc2VydCBhIG5ldyBkZWNvcmF0aW9uXG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzInLCAxLCAxLCAzMCk7XG5cdFx0Ly8gUmVhZCBcdTIwMTQgbm8gZXhwbGljaXQgY29tbWl0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxKSwgMzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMiksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAyMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludGVybGVhdmVkOiBpbnNlcnQsIG9uTGluZXNEZWxldGVkLCBpbnNlcnQsIHJlYWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDMsIDMsIDIwKTtcblx0XHQvLyBEZWxldGUgbGluZSAxIFx1MjE5MiBkZWMxIHNob3VsZCBzaGlmdCBmcm9tIDMgXHUyMTkyIDJcblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDEsIDEpO1xuXHRcdC8vIEFkZCBhbm90aGVyIGRlY29yYXRpb25cblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMicsIDUsIDUsIDMwKTtcblx0XHQvLyBSZWFkIFx1MjAxNCBubyBleHBsaWNpdCBjb21taXRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigyKSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNSksIDMwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig1KSwgODApO1xuXHR9KTtcblxuXHQvLyAtLS0gRWRnZSBjYXNlcyAtLS1cblxuXHR0ZXN0KCdvbkxpbmVzSW5zZXJ0ZWQgdGhlbiBvbkxpbmVzRGVsZXRlZCB3aXRob3V0IHJlYWRzIGJldHdlZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDMsIDMsIDIwKTtcblx0XHQvLyBJbnNlcnQgMiBsaW5lcyBhdCBsaW5lIDEgXHUyMTkyIGRlYzEgbW92ZXMgZnJvbSAzIFx1MjE5MiA1XG5cdFx0bWFuYWdlci5vbkxpbmVzSW5zZXJ0ZWQoMSwgMik7XG5cdFx0Ly8gRGVsZXRlIGxpbmUgMSBcdTIxOTIgZGVjMSBtb3ZlcyBmcm9tIDUgXHUyMTkyIDRcblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDEsIDEpO1xuXHRcdC8vIFJlYWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDQpLCA1MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIG9uTGluZXNJbnNlcnRlZCB3aXRob3V0IHJlYWRzIGJldHdlZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDMsIDMsIDIwKTtcblx0XHQvLyBJbnNlcnQgMSBsaW5lIGF0IGxpbmUgMSBcdTIxOTIgZGVjMSBhdCAzIFx1MjE5MiA0XG5cdFx0bWFuYWdlci5vbkxpbmVzSW5zZXJ0ZWQoMSwgMSk7XG5cdFx0Ly8gSW5zZXJ0IDEgbGluZSBhdCBsaW5lIDEgXHUyMTkyIGRlYzEgYXQgNCBcdTIxOTIgNVxuXHRcdG1hbmFnZXIub25MaW5lc0luc2VydGVkKDEsIDEpO1xuXHRcdC8vIFJlYWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgb25MaW5lc0RlbGV0ZWQgd2l0aG91dCByZWFkcyBiZXR3ZWVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAxMCwgMTAsIDIwKTtcblx0XHQvLyBEZWxldGUgbGluZXMgMS0yIFx1MjE5MiBkZWMxIGF0IDEwIFx1MjE5MiA4XG5cdFx0bWFuYWdlci5vbkxpbmVzRGVsZXRlZCgxLCAyKTtcblx0XHQvLyBEZWxldGUgbGluZXMgMS0yIFx1MjE5MiBkZWMxIGF0IDggXHUyMTkyIDZcblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDEsIDIpO1xuXHRcdC8vIFJlYWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDYpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig3KSwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdwZW5kaW5nIGluc2VydCB0aGVuIG9uTGluZXNEZWxldGVkIGFmZmVjdGluZyB0aGF0IGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHQvLyBJbnNlcnQgYSBkZWNvcmF0aW9uIGF0IGxpbmUgMyAocGVuZGluZywgbm90IGNvbW1pdHRlZClcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDMsIDMsIDIwKTtcblx0XHQvLyBEZWxldGUgbGluZSAzIFx1MjAxNCBzaG91bGQgcmVtb3ZlL2NvbGxhcHNlIHRoZSBwZW5kaW5nIGRlY29yYXRpb25cblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDMsIDMpO1xuXHRcdC8vIFJlYWQgXHUyMDE0IHRoZSBkZWNvcmF0aW9uIHdhcyBvbiB0aGUgZGVsZXRlZCBsaW5lXG5cdFx0Ly8gVGhlIGRlY29yYXRpb24gY29sbGFwc2VzIHRvIGxpbmUgMyAoZnJvbUxpbmVOdW1iZXIpIHBlciBvbkxpbmVzRGVsZXRlZCBiZWhhdmlvclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDIwKTtcblx0fSk7XG5cblx0dGVzdCgncGVuZGluZyBpbnNlcnQgdGhlbiBvbkxpbmVzSW5zZXJ0ZWQgc2hpZnRpbmcgdGhhdCBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0Ly8gSW5zZXJ0IGEgZGVjb3JhdGlvbiBhdCBsaW5lIDMgKHBlbmRpbmcsIG5vdCBjb21taXR0ZWQpXG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0Ly8gSW5zZXJ0IDIgbGluZXMgYmVmb3JlIGl0IGF0IGxpbmUgMSBcdTIxOTIgc2hvdWxkIHNoaWZ0IGRlYzEgZnJvbSAzIFx1MjE5MiA1XG5cdFx0bWFuYWdlci5vbkxpbmVzSW5zZXJ0ZWQoMSwgMik7XG5cdFx0Ly8gUmVhZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAyMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY3VtdWxhdGVkIGhlaWdodHMgY29ycmVjdCBhZnRlciBpbnRlcmxlYXZlZCBvcHMgd2l0aG91dCBjb21taXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDIsIDIsIDE1KTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMicsIDQsIDQsIDI1KTtcblx0XHQvLyBObyBjb21taXQgXHUyMDE0IHZlcmlmeSBhY2N1bXVsYXRlZCBoZWlnaHRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigyKSwgMjUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDMpLCAzNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNCksIDYwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig1KSwgNzApO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zdHJ1Y3RvciB3aXRoIGluaXRpYWwgZGF0YSB3b3JrcyB3aXRob3V0IGV4cGxpY2l0IGNvbW1pdCcsICgpID0+IHtcblx0XHRjb25zdCBkYXRhID0gW1xuXHRcdFx0bmV3IEN1c3RvbUxpbmVIZWlnaHREYXRhKCdkZWMxJywgMiwgNCwgMjApLFxuXHRcdFx0bmV3IEN1c3RvbUxpbmVIZWlnaHREYXRhKCdkZWMyJywgNiwgNiwgMzApLFxuXHRcdF07XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDIpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig2KSwgMzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDYpLCAxMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGluZyBsaW5lIDIgd2l0aCBsaW5lSGVpZ2h0c1JlbW92ZWQgcmUtYWRkaW5nIGF0IGxpbmUgMSBtb3ZlcyBzcGVjaWFsIGxpbmUgdG8gbGluZSAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAyLCAyLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigyKSwgMjApO1xuXHRcdG1hbmFnZXIub25MaW5lc0RlbGV0ZWQoMiwgMik7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAxLCAxLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxKSwgMjApO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsc0JBQXNCLDBCQUEwQjtBQUN6RCxTQUFTLCtDQUErQztBQUV4RCxNQUFNLDBDQUEwQyxNQUFNO0FBRXJELDBDQUF3QztBQUV4QyxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFVBQU0sVUFBVSxJQUFJLG1CQUFtQixJQUFJLENBQUMsQ0FBQztBQUc3QyxXQUFPLFlBQVksUUFBUSxvQkFBb0IsQ0FBQyxHQUFHLEVBQUU7QUFDckQsV0FBTyxZQUFZLFFB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
