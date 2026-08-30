import assert from "assert";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { PromptTimelineGutterRail, restDotCount } from "../../../browser/promptTimeline/promptTimelineGutterRail.js";
suite("PromptTimelineGutterRail", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function tick(index, stat) {
    const requestId = String(index);
    return { requestId, allRequestIds: [requestId], text: requestId, timestamp: index, count: 1, ariaLabel: requestId, stat };
  }
  function createRail(ticks) {
    const rail = store.add(new PromptTimelineGutterRail());
    document.body.appendChild(rail.domNode);
    store.add(toDisposable(() => rail.domNode.remove()));
    rail.setTicks(ticks);
    return rail;
  }
  function rowParts(rail) {
    return Array.from(rail.domNode.querySelectorAll(".prompt-timeline-gutter-row")).map((row) => ({
      row,
      jump: row.querySelector(".prompt-timeline-gutter-row-jump"),
      diff: row.querySelector(".prompt-timeline-gutter-row-diff")
    }));
  }
  function keydown(target, key, keyCode) {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode, bubbles: true, cancelable: true }));
  }
  test("highlights a row previewed from a dot, but leaves a row under the pointer to its own halves", () => {
    const rail = createRail(Array.from({ length: 3 }, (_, index) => tick(index)));
    const rows = Array.from(rail.domNode.querySelectorAll(".prompt-timeline-gutter-row"));
    const dots = Array.from(rail.domNode.querySelectorAll(".prompt-timeline-gutter-dot"));
    rows[1].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const rowHover = {
      rows: rows.map((row) => row.classList.contains("preview")),
      dots: dots.map((dot) => dot.classList.contains("preview"))
    };
    dots[2].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const dotHover = {
      rows: rows.map((row) => row.classList.contains("preview")),
      dots: dots.map((dot) => dot.classList.contains("preview"))
    };
    assert.deepStrictEqual({ rowHover, dotHover }, {
      rowHover: {
        // The pointer is on the row, so its own half lights up instead. The dot still pairs.
        rows: [false, false, false],
        dots: [false, true, false]
      },
      dotHover: {
        // The pointer is over on the dot column, so the row itself highlights to point it out.
        rows: [false, false, true],
        dots: [false, false, true]
      }
    });
  });
  test("maps row hover to the nearest sampled dot when capped", () => {
    const rail = store.add(new PromptTimelineGutterRail());
    rail.setTicks(Array.from({ length: 51 }, (_, index) => tick(index)));
    const rows = Array.from(rail.domNode.querySelectorAll(".prompt-timeline-gutter-row"));
    const dots = Array.from(rail.domNode.querySelectorAll(".prompt-timeline-gutter-dot"));
    rows[25].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    assert.deepStrictEqual({
      dotCount: dots.length,
      previewDot: dots.findIndex((dot) => dot.classList.contains("preview"))
    }, {
      dotCount: 50,
      previewDot: 24
    });
  });
  test("splits a row into jump and review targets, hiding review when the prompt changed nothing", () => {
    const edited = tick(1, { added: 3, removed: 1, fileCount: 2 });
    const rail = createRail([tick(0), edited]);
    const selected = [];
    const reviewed = [];
    store.add(rail.onDidSelect((id) => selected.push(id)));
    store.add(rail.onDidReview((t) => reviewed.push(t.requestId)));
    const rows = rowParts(rail);
    rows[1].jump.click();
    rows[1].diff.click();
    assert.deepStrictEqual({
      reviewable: rows.map((row) => row.row.classList.contains("reviewable")),
      selected,
      reviewed
    }, {
      // Only the prompt that edited files offers the review target.
      reviewable: [false, true],
      selected: ["1"],
      reviewed: ["1"]
    });
  });
  test("moves between rows with Up/Down and between a row's targets with Left/Right", () => {
    const stat = { added: 1, removed: 0, fileCount: 1 };
    const rail = createRail([tick(0, stat), tick(1), tick(2, stat)]);
    const rows = rowParts(rail);
    const list = rail.domNode.querySelector(".prompt-timeline-gutter-panel");
    const focus = () => {
      const index = rows.findIndex((r) => r.jump === document.activeElement || r.diff === document.activeElement);
      return index < 0 ? "none" : `${index}:${rows[index].diff === document.activeElement ? "diff" : "jump"}`;
    };
    rows[0].jump.focus();
    const path = [focus()];
    keydown(list, "ArrowRight", 39);
    path.push(focus());
    keydown(list, "ArrowDown", 40);
    path.push(focus());
    keydown(list, "ArrowDown", 40);
    path.push(focus());
    keydown(list, "ArrowRight", 39);
    path.push(focus());
    keydown(list, "ArrowLeft", 37);
    path.push(focus());
    keydown(list, "Home", 36);
    path.push(focus());
    keydown(list, "End", 35);
    path.push(focus());
    assert.deepStrictEqual({
      path,
      // Exactly one target across the whole flyout stays tabbable, so it is a single Tab stop.
      tabbable: rows.flatMap((r) => [r.jump, r.diff]).filter((b) => b.tabIndex === 0).length
    }, {
      path: ["0:jump", "0:diff", "1:jump", "2:jump", "2:diff", "2:jump", "0:jump", "2:jump"],
      tabbable: 1
    });
  });
  test("keeps focus in the flyout when a streaming update removes the focused review target", () => {
    const stat = { added: 1, removed: 0, fileCount: 1 };
    const rail = createRail([tick(0, stat)]);
    const rows = rowParts(rail);
    rows[0].diff.focus();
    rail.setTicks([tick(0)]);
    assert.deepStrictEqual({
      focused: document.activeElement === rows[0].jump ? "jump" : document.activeElement === rows[0].diff ? "diff" : "lost",
      reviewable: rows[0].row.classList.contains("reviewable"),
      tabbable: [rows[0].jump, rows[0].diff].filter((b) => b.tabIndex === 0).length
    }, {
      focused: "jump",
      reviewable: false,
      tabbable: 1
    });
  });
});
suite("restDotCount", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function drawnHeight(dots, sampled) {
    return 16 + dots * 4 + (dots - 1) * 4 + (sampled ? 12 : 0);
  }
  function fits(dots, railHeight, sampled = true) {
    return drawnHeight(dots, sampled) <= railHeight - 24;
  }
  test("draws one dot per prompt while they fit, sampling only past the fixed cap", () => {
    assert.deepStrictEqual([
      restDotCount(0, 800),
      restDotCount(1, 800),
      restDotCount(12, 800),
      restDotCount(50, 800),
      restDotCount(400, 800)
    ], [0, 1, 12, 50, 50]);
  });
  test("samples down to what a short rail can hold, and stays inside it", () => {
    const counts = [restDotCount(40, 200), restDotCount(40, 120), restDotCount(40, 60)];
    assert.deepStrictEqual({
      counts,
      fits: counts.map((dots, i) => fits(dots, [200, 120, 60][i]))
    }, {
      counts: [19, 9, 2],
      // A rail too short for even the two-dot minimum is degenerate; the handle clips there (CSS).
      fits: [true, true, false]
    });
  });
  test("reserves room for the marker when the fixed cap forces sampling", () => {
    const dots = restDotCount(51, 444);
    assert.deepStrictEqual({
      dots,
      fits: fits(dots, 444),
      // A rail with room for all 50 plus the marker still draws all 50.
      roomy: restDotCount(51, 448)
    }, {
      dots: 49,
      fits: true,
      roomy: 50
    });
  });
  test("falls back to the fixed cap when the rail has not been measured yet", () => {
    assert.deepStrictEqual([restDotCount(30, 0), restDotCount(400, 0)], [30, 50]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHByb21wdFRpbWVsaW5lXFxwcm9tcHRUaW1lbGluZUd1dHRlclJhaWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFByb21wdFRpbWVsaW5lR3V0dGVyUmFpbCwgcmVzdERvdENvdW50IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wcm9tcHRUaW1lbGluZS9wcm9tcHRUaW1lbGluZUd1dHRlclJhaWwuanMnO1xuaW1wb3J0IHsgUHJvbXB0VGljayB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcHJvbXB0VGltZWxpbmUvcHJvbXB0VGltZWxpbmVNb2RlbC5qcyc7XG5cbnN1aXRlKCdQcm9tcHRUaW1lbGluZUd1dHRlclJhaWwnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gdGljayhpbmRleDogbnVtYmVyLCBzdGF0PzogUHJvbXB0VGlja1snc3RhdCddKTogUHJvbXB0VGljayB7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gU3RyaW5nKGluZGV4KTtcblx0XHRyZXR1cm4geyByZXF1ZXN0SWQsIGFsbFJlcXVlc3RJZHM6IFtyZXF1ZXN0SWRdLCB0ZXh0OiByZXF1ZXN0SWQsIHRpbWVzdGFtcDogaW5kZXgsIGNvdW50OiAxLCBhcmlhTGFiZWw6IHJlcXVlc3RJZCwgc3RhdCB9O1xuXHR9XG5cblx0LyoqIE1vdW50cyBhIHJhaWwgd2l0aCBgdGlja3NgIGluIHRoZSBkb2N1bWVudCwgc28gZm9jdXMgYW5kIGtleWJvYXJkIG5hdmlnYXRpb24gYmVoYXZlIGZvciByZWFsLiAqL1xuXHRmdW5jdGlvbiBjcmVhdGVSYWlsKHRpY2tzOiByZWFkb25seSBQcm9tcHRUaWNrW10pOiBQcm9tcHRUaW1lbGluZUd1dHRlclJhaWwge1xuXHRcdGNvbnN0IHJhaWwgPSBzdG9yZS5hZGQobmV3IFByb21wdFRpbWVsaW5lR3V0dGVyUmFpbCgpKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHJhaWwuZG9tTm9kZSk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByYWlsLmRvbU5vZGUucmVtb3ZlKCkpKTtcblx0XHRyYWlsLnNldFRpY2tzKHRpY2tzKTtcblx0XHRyZXR1cm4gcmFpbDtcblx0fVxuXG5cdGZ1bmN0aW9uIHJvd1BhcnRzKHJhaWw6IFByb21wdFRpbWVsaW5lR3V0dGVyUmFpbCkge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHJhaWwuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLnByb21wdC10aW1lbGluZS1ndXR0ZXItcm93JykpLm1hcChyb3cgPT4gKHtcblx0XHRcdHJvdyxcblx0XHRcdGp1bXA6IHJvdy5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignLnByb21wdC10aW1lbGluZS1ndXR0ZXItcm93LWp1bXAnKSEsXG5cdFx0XHRkaWZmOiByb3cucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5wcm9tcHQtdGltZWxpbmUtZ3V0dGVyLXJvdy1kaWZmJykhLFxuXHRcdH0pKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGtleWRvd24odGFyZ2V0OiBIVE1MRWxlbWVudCwga2V5OiBzdHJpbmcsIGtleUNvZGU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXksIGtleUNvZGUsIGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSkpO1xuXHR9XG5cblx0dGVzdCgnaGlnaGxpZ2h0cyBhIHJvdyBwcmV2aWV3ZWQgZnJvbSBhIGRvdCwgYnV0IGxlYXZlcyBhIHJvdyB1bmRlciB0aGUgcG9pbnRlciB0byBpdHMgb3duIGhhbHZlcycsICgpID0+IHtcblx0XHRjb25zdCByYWlsID0gY3JlYXRlUmFpbChBcnJheS5mcm9tKHsgbGVuZ3RoOiAzIH0sIChfLCBpbmRleCkgPT4gdGljayhpbmRleCkpKTtcblxuXHRcdGNvbnN0IHJvd3MgPSBBcnJheS5mcm9tKHJhaWwuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLnByb21wdC10aW1lbGluZS1ndXR0ZXItcm93JykpO1xuXHRcdGNvbnN0IGRvdHMgPSBBcnJheS5mcm9tKHJhaWwuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLnByb21wdC10aW1lbGluZS1ndXR0ZXItZG90JykpO1xuXG5cdFx0cm93c1sxXS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZW92ZXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHJvd0hvdmVyID0ge1xuXHRcdFx0cm93czogcm93cy5tYXAocm93ID0+IHJvdy5jbGFzc0xpc3QuY29udGFpbnMoJ3ByZXZpZXcnKSksXG5cdFx0XHRkb3RzOiBkb3RzLm1hcChkb3QgPT4gZG90LmNsYXNzTGlzdC5jb250YWlucygncHJldmlldycpKSxcblx0XHR9O1xuXG5cdFx0ZG90c1syXS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZW92ZXInLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IGRvdEhvdmVyID0ge1xuXHRcdFx0cm93czogcm93cy5tYXAocm93ID0+IHJvdy5jbGFzc0xpc3QuY29udGFpbnMoJ3ByZXZpZXcnKSksXG5cdFx0XHRkb3RzOiBkb3RzLm1hcChkb3QgPT4gZG90LmNsYXNzTGlzdC5jb250YWlucygncHJldmlldycpKSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJvd0hvdmVyLCBkb3RIb3ZlciB9LCB7XG5cdFx0XHRyb3dIb3Zlcjoge1xuXHRcdFx0XHQvLyBUaGUgcG9pbnRlciBpcyBvbiB0aGUgcm93LCBzbyBpdHMgb3duIGhhbGYgbGlnaHRzIHVwIGluc3RlYWQuIFRoZSBkb3Qgc3RpbGwgcGFpcnMuXG5cdFx0XHRcdHJvd3M6IFtmYWxzZSwgZmFsc2UsIGZhbHNlXSxcblx0XHRcdFx0ZG90czogW2ZhbHNlLCB0cnVlLCBmYWxzZV0sXG5cdFx0XHR9LFxuXHRcdFx0ZG90SG92ZXI6IHtcblx0XHRcdFx0Ly8gVGhlIHBvaW50ZXIgaXMgb3ZlciBvbiB0aGUgZG90IGNvbHVtbiwgc28gdGhlIHJvdyBpdHNlbGYgaGlnaGxpZ2h0cyB0byBwb2ludCBpdCBvdXQuXG5cdFx0XHRcdHJvd3M6IFtmYWxzZSwgZmFsc2UsIHRydWVdLFxuXHRcdFx0XHRkb3RzOiBbZmFsc2UsIGZhbHNlLCB0cnVlXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgcm93IGhvdmVyIHRvIHRoZSBuZWFyZXN0IHNhbXBsZWQgZG90IHdoZW4gY2FwcGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhaWwgPSBzdG9yZS5hZGQobmV3IFByb21wdFRpbWVsaW5lR3V0dGVyUmFpbCgpKTtcblx0XHRyYWlsLnNldFRpY2tzKEFycmF5LmZyb20oeyBsZW5ndGg6IDUxIH0sIChfLCBpbmRleCkgPT4gdGljayhpbmRleCkpKTtcblxuXHRcdGNvbnN0IHJvd3MgPSBBcnJheS5mcm9tKHJhaWwuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLnByb21wdC10aW1lbGluZS1ndXR0ZXItcm93JykpO1xuXHRcdGNvbnN0IGRvdHMgPSBBcnJheS5mcm9tKHJhaWwuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLnByb21wdC10aW1lbGluZS1ndXR0ZXItZG90JykpO1xuXHRcdHJvd3NbMjVdLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlb3ZlcicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRvdENvdW50OiBkb3RzLmxlbmd0aCxcblx0XHRcdHByZXZpZXdEb3Q6IGRvdHMuZmluZEluZGV4KGRvdCA9PiBkb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdwcmV2aWV3JykpLFxuXHRcdH0sIHtcblx0XHRcdGRvdENvdW50OiA1MCxcblx0XHRcdHByZXZpZXdEb3Q6IDI0LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzcGxpdHMgYSByb3cgaW50byBqdW1wIGFuZCByZXZpZXcgdGFyZ2V0cywgaGlkaW5nIHJldmlldyB3aGVuIHRoZSBwcm9tcHQgY2hhbmdlZCBub3RoaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRlZCA9IHRpY2soMSwgeyBhZGRlZDogMywgcmVtb3ZlZDogMSwgZmlsZUNvdW50OiAyIH0pO1xuXHRcdGNvbnN0IHJhaWwgPSBjcmVhdGVSYWlsKFt0aWNrKDApLCBlZGl0ZWRdKTtcblx0XHRjb25zdCBzZWxlY3RlZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCByZXZpZXdlZDogc3RyaW5nW10gPSBbXTtcblx0XHRzdG9yZS5hZGQocmFpbC5vbkRpZFNlbGVjdChpZCA9PiBzZWxlY3RlZC5wdXNoKGlkKSkpO1xuXHRcdHN0b3JlLmFkZChyYWlsLm9uRGlkUmV2aWV3KHQgPT4gcmV2aWV3ZWQucHVzaCh0LnJlcXVlc3RJZCkpKTtcblxuXHRcdGNvbnN0IHJvd3MgPSByb3dQYXJ0cyhyYWlsKTtcblx0XHRyb3dzWzFdLmp1bXAuY2xpY2soKTtcblx0XHRyb3dzWzFdLmRpZmYuY2xpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmV2aWV3YWJsZTogcm93cy5tYXAocm93ID0+IHJvdy5yb3cuY2xhc3NMaXN0LmNvbnRhaW5zKCdyZXZpZXdhYmxlJykpLFxuXHRcdFx0c2VsZWN0ZWQsXG5cdFx0XHRyZXZpZXdlZCxcblx0XHR9LCB7XG5cdFx0XHQvLyBPbmx5IHRoZSBwcm9tcHQgdGhhdCBlZGl0ZWQgZmlsZXMgb2ZmZXJzIHRoZSByZXZpZXcgdGFyZ2V0LlxuXHRcdFx0cmV2aWV3YWJsZTogW2ZhbHNlLCB0cnVlXSxcblx0XHRcdHNlbGVjdGVkOiBbJzEnXSxcblx0XHRcdHJldmlld2VkOiBbJzEnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZXMgYmV0d2VlbiByb3dzIHdpdGggVXAvRG93biBhbmQgYmV0d2VlbiBhIHJvd1xcJ3MgdGFyZ2V0cyB3aXRoIExlZnQvUmlnaHQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdCA9IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAsIGZpbGVDb3VudDogMSB9O1xuXHRcdC8vIFJvdyAxIGhhcyBubyBjaGFuZ2VzLCBzbyBpdCBoYXMgbm8gcmV2aWV3IHRhcmdldCB0byBsYW5kIG9uLlxuXHRcdGNvbnN0IHJhaWwgPSBjcmVhdGVSYWlsKFt0aWNrKDAsIHN0YXQpLCB0aWNrKDEpLCB0aWNrKDIsIHN0YXQpXSk7XG5cdFx0Y29uc3Qgcm93cyA9IHJvd1BhcnRzKHJhaWwpO1xuXHRcdGNvbnN0IGxpc3QgPSByYWlsLmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5wcm9tcHQtdGltZWxpbmUtZ3V0dGVyLXBhbmVsJykhO1xuXG5cdFx0LyoqIFdoZXJlIGZvY3VzIHNpdHMsIGFzIGByb3c6Y29sdW1uYC4gKi9cblx0XHRjb25zdCBmb2N1cyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gcm93cy5maW5kSW5kZXgociA9PiByLmp1bXAgPT09IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgfHwgci5kaWZmID09PSBkb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcblx0XHRcdHJldHVybiBpbmRleCA8IDAgPyAnbm9uZScgOiBgJHtpbmRleH06JHtyb3dzW2luZGV4XS5kaWZmID09PSBkb2N1bWVudC5hY3RpdmVFbGVtZW50ID8gJ2RpZmYnIDogJ2p1bXAnfWA7XG5cdFx0fTtcblxuXHRcdHJvd3NbMF0uanVtcC5mb2N1cygpO1xuXHRcdGNvbnN0IHBhdGggPSBbZm9jdXMoKV07XG5cdFx0a2V5ZG93bihsaXN0LCAnQXJyb3dSaWdodCcsIDM5KTsgcGF0aC5wdXNoKGZvY3VzKCkpO1xuXHRcdGtleWRvd24obGlzdCwgJ0Fycm93RG93bicsIDQwKTsgcGF0aC5wdXNoKGZvY3VzKCkpOyAgLy8gcm93IDEgaGFzIG5vIGRpZmY6IGZhbGxzIGJhY2sgdG8gdGhlIGxhYmVsXG5cdFx0a2V5ZG93bihsaXN0LCAnQXJyb3dEb3duJywgNDApOyBwYXRoLnB1c2goZm9jdXMoKSk7ICAvLyByb3cgMiBoYXMgb25lOiBEb3duIGtlZXBzIHRoZSBsYWJlbCBjb2x1bW5cblx0XHRrZXlkb3duKGxpc3QsICdBcnJvd1JpZ2h0JywgMzkpOyBwYXRoLnB1c2goZm9jdXMoKSk7XG5cdFx0a2V5ZG93bihsaXN0LCAnQXJyb3dMZWZ0JywgMzcpOyBwYXRoLnB1c2goZm9jdXMoKSk7XG5cdFx0a2V5ZG93bihsaXN0LCAnSG9tZScsIDM2KTsgcGF0aC5wdXNoKGZvY3VzKCkpO1xuXHRcdGtleWRvd24obGlzdCwgJ0VuZCcsIDM1KTsgcGF0aC5wdXNoKGZvY3VzKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwYXRoLFxuXHRcdFx0Ly8gRXhhY3RseSBvbmUgdGFyZ2V0IGFjcm9zcyB0aGUgd2hvbGUgZmx5b3V0IHN0YXlzIHRhYmJhYmxlLCBzbyBpdCBpcyBhIHNpbmdsZSBUYWIgc3RvcC5cblx0XHRcdHRhYmJhYmxlOiByb3dzLmZsYXRNYXAociA9PiBbci5qdW1wLCByLmRpZmZdKS5maWx0ZXIoYiA9PiBiLnRhYkluZGV4ID09PSAwKS5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0cGF0aDogWycwOmp1bXAnLCAnMDpkaWZmJywgJzE6anVtcCcsICcyOmp1bXAnLCAnMjpkaWZmJywgJzI6anVtcCcsICcwOmp1bXAnLCAnMjpqdW1wJ10sXG5cdFx0XHR0YWJiYWJsZTogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgZm9jdXMgaW4gdGhlIGZseW91dCB3aGVuIGEgc3RyZWFtaW5nIHVwZGF0ZSByZW1vdmVzIHRoZSBmb2N1c2VkIHJldmlldyB0YXJnZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdCA9IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAsIGZpbGVDb3VudDogMSB9O1xuXHRcdGNvbnN0IHJhaWwgPSBjcmVhdGVSYWlsKFt0aWNrKDAsIHN0YXQpXSk7XG5cdFx0Y29uc3Qgcm93cyA9IHJvd1BhcnRzKHJhaWwpO1xuXHRcdHJvd3NbMF0uZGlmZi5mb2N1cygpO1xuXG5cdFx0Ly8gVGhlIHByb21wdCdzIGVkaXRzIG5ldCBiYWNrIHRvIHplcm8gbWlkLXN0cmVhbSwgc28gaXRzIHJldmlldyB0YXJnZXQgZ29lcyBhd2F5IHVuZGVyIGZvY3VzLlxuXHRcdHJhaWwuc2V0VGlja3MoW3RpY2soMCldKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zm9jdXNlZDogZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gcm93c1swXS5qdW1wID8gJ2p1bXAnIDogZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gcm93c1swXS5kaWZmID8gJ2RpZmYnIDogJ2xvc3QnLFxuXHRcdFx0cmV2aWV3YWJsZTogcm93c1swXS5yb3cuY2xhc3NMaXN0LmNvbnRhaW5zKCdyZXZpZXdhYmxlJyksXG5cdFx0XHR0YWJiYWJsZTogW3Jvd3NbMF0uanVtcCwgcm93c1swXS5kaWZmXS5maWx0ZXIoYiA9PiBiLnRhYkluZGV4ID09PSAwKS5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0Zm9jdXNlZDogJ2p1bXAnLFxuXHRcdFx0cmV2aWV3YWJsZTogZmFsc2UsXG5cdFx0XHR0YWJiYWJsZTogMSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3Jlc3REb3RDb3VudCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0LyoqIEhlaWdodCAocHgpIHRoZSBkcmF3biBjb2x1bW4gbmVlZHM6IGRvdHMgKDRweCkgc2VwYXJhdGVkIGJ5IGdhcHMgKDRweCksIHBsdXMgdGhlIGhhbmRsZSdzIDhweCBwYWRkaW5nIGFuZCwgd2hlbiBzYW1wbGVkLCB0aGUgOHB4IG1hcmtlciBhbmQgaXRzIGdhcC4gKi9cblx0ZnVuY3Rpb24gZHJhd25IZWlnaHQoZG90czogbnVtYmVyLCBzYW1wbGVkOiBib29sZWFuKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMTYgKyBkb3RzICogNCArIChkb3RzIC0gMSkgKiA0ICsgKHNhbXBsZWQgPyAxMiA6IDApO1xuXHR9XG5cblx0LyoqIFRoZSBjb2x1bW4gbXVzdCBmaXQgdGhlIHJhaWwgd2l0aCB0aGUgMTJweC1wZXItZWRnZSBjbGVhcmFuY2UgdGhlIGhhbmRsZSBrZWVwcyBmcm9tIHRoZSB0cmFuc2NyaXB0LiAqL1xuXHRmdW5jdGlvbiBmaXRzKGRvdHM6IG51bWJlciwgcmFpbEhlaWdodDogbnVtYmVyLCBzYW1wbGVkID0gdHJ1ZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBkcmF3bkhlaWdodChkb3RzLCBzYW1wbGVkKSA8PSByYWlsSGVpZ2h0IC0gMjQ7XG5cdH1cblxuXHR0ZXN0KCdkcmF3cyBvbmUgZG90IHBlciBwcm9tcHQgd2hpbGUgdGhleSBmaXQsIHNhbXBsaW5nIG9ubHkgcGFzdCB0aGUgZml4ZWQgY2FwJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0cmVzdERvdENvdW50KDAsIDgwMCksXG5cdFx0XHRyZXN0RG90Q291bnQoMSwgODAwKSxcblx0XHRcdHJlc3REb3RDb3VudCgxMiwgODAwKSxcblx0XHRcdHJlc3REb3RDb3VudCg1MCwgODAwKSxcblx0XHRcdHJlc3REb3RDb3VudCg0MDAsIDgwMCksXG5cdFx0XSwgWzAsIDEsIDEyLCA1MCwgNTBdKTtcblx0fSk7XG5cblx0dGVzdCgnc2FtcGxlcyBkb3duIHRvIHdoYXQgYSBzaG9ydCByYWlsIGNhbiBob2xkLCBhbmQgc3RheXMgaW5zaWRlIGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvdW50cyA9IFtyZXN0RG90Q291bnQoNDAsIDIwMCksIHJlc3REb3RDb3VudCg0MCwgMTIwKSwgcmVzdERvdENvdW50KDQwLCA2MCldO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y291bnRzLFxuXHRcdFx0Zml0czogY291bnRzLm1hcCgoZG90cywgaSkgPT4gZml0cyhkb3RzLCBbMjAwLCAxMjAsIDYwXVtpXSkpLFxuXHRcdH0sIHtcblx0XHRcdGNvdW50czogWzE5LCA5LCAyXSxcblx0XHRcdC8vIEEgcmFpbCB0b28gc2hvcnQgZm9yIGV2ZW4gdGhlIHR3by1kb3QgbWluaW11bSBpcyBkZWdlbmVyYXRlOyB0aGUgaGFuZGxlIGNsaXBzIHRoZXJlIChDU1MpLlxuXHRcdFx0Zml0czogW3RydWUsIHRydWUsIGZhbHNlXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzZXJ2ZXMgcm9vbSBmb3IgdGhlIG1hcmtlciB3aGVuIHRoZSBmaXhlZCBjYXAgZm9yY2VzIHNhbXBsaW5nJywgKCkgPT4ge1xuXHRcdC8vIDUxIHByb21wdHMgaW4gYSA0NDRweCByYWlsOiBhbGwgNTEgZG90cyB3b3VsZCBmaXQgb24gdGhlaXIgb3duLCBidXQgTUFYX1JFU1RfRE9UUyBjYXBzIHRoZW0gYXRcblx0XHQvLyA1MCwgd2hpY2ggbWFrZXMgdGhlIHRyYWlsaW5nIG1hcmtlciBhcHBlYXIgXHUyMDE0IGFuZCA1MCBkb3RzIHBsdXMgaXQgbmVlZCA0MjRweCBvZiB0aGUgNDIwcHggQ1NTXG5cdFx0Ly8gYWxsb3dzLiBUaGUgY291bnQgbXVzdCBkcm9wIHRvIGxlYXZlIHRoZSBtYXJrZXIgcm9vbS5cblx0XHRjb25zdCBkb3RzID0gcmVzdERvdENvdW50KDUxLCA0NDQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZG90cyxcblx0XHRcdGZpdHM6IGZpdHMoZG90cywgNDQ0KSxcblx0XHRcdC8vIEEgcmFpbCB3aXRoIHJvb20gZm9yIGFsbCA1MCBwbHVzIHRoZSBtYXJrZXIgc3RpbGwgZHJhd3MgYWxsIDUwLlxuXHRcdFx0cm9vbXk6IHJlc3REb3RDb3VudCg1MSwgNDQ4KSxcblx0XHR9LCB7XG5cdFx0XHRkb3RzOiA0OSxcblx0XHRcdGZpdHM6IHRydWUsXG5cdFx0XHRyb29teTogNTAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIGZpeGVkIGNhcCB3aGVuIHRoZSByYWlsIGhhcyBub3QgYmVlbiBtZWFzdXJlZCB5ZXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbcmVzdERvdENvdW50KDMwLCAwKSwgcmVzdERvdENvdW50KDQwMCwgMCldLCBbMzAs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
