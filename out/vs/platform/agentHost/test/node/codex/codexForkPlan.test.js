import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { planForkedTurnIdMap, resolveForkBoundary } from "../../../node/codex/codexForkPlan.js";
suite("codexForkPlan", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("resolveForkBoundary", () => {
    test("locates the boundary by codex turn id (first / middle / last)", () => {
      const ids = ["t0", "t1", "t2"];
      assert.deepStrictEqual({
        first: resolveForkBoundary(ids, "t0", -1),
        middle: resolveForkBoundary(ids, "t1", -1),
        last: resolveForkBoundary(ids, "t2", -1)
      }, {
        // Fork at t0 keeps 1 turn, drops the 2 trailing turns.
        first: { resolved: true, keepThroughIndex: 0, numTurnsToDrop: 2 },
        middle: { resolved: true, keepThroughIndex: 1, numTurnsToDrop: 1 },
        // Fork at the tip keeps everything, drops nothing.
        last: { resolved: true, keepThroughIndex: 2, numTurnsToDrop: 0 }
      });
    });
    test("falls back to turnIndex when the id is not found", () => {
      const ids = ["t0", "t1", "t2"];
      assert.deepStrictEqual(
        resolveForkBoundary(ids, "missing", 1),
        { resolved: true, keepThroughIndex: 1, numTurnsToDrop: 1 }
      );
    });
    test("rejects an unresolvable boundary instead of keeping full history", () => {
      const ids = ["t0", "t1", "t2"];
      assert.deepStrictEqual({
        // id missing AND fallback index out of range → unresolved
        negativeFallback: resolveForkBoundary(ids, "missing", -1),
        tooLargeFallback: resolveForkBoundary(ids, "missing", 5)
      }, {
        negativeFallback: { resolved: false },
        tooLargeFallback: { resolved: false }
      });
    });
    test("treats an empty source thread as a valid empty fork", () => {
      assert.deepStrictEqual(
        resolveForkBoundary([], "anything", -1),
        { resolved: true, keepThroughIndex: -1, numTurnsToDrop: 0 }
      );
    });
  });
  suite("planForkedTurnIdMap", () => {
    test("maps new host ids to the forked thread's (regenerated) codex ids for a live source", () => {
      const sourceTurnIds = ["c0", "c1", "c2"];
      const forkedTurnIds = ["f0", "f1"];
      const hostBySourceCodex = /* @__PURE__ */ new Map([["c0", "h0"], ["c1", "h1"], ["c2", "h2"]]);
      const turnIdMapping = /* @__PURE__ */ new Map([["h0", "n0"], ["h1", "n1"], ["h2", "n2"]]);
      assert.deepStrictEqual(
        planForkedTurnIdMap(
          sourceTurnIds,
          forkedTurnIds,
          /*keepThroughIndex*/
          1,
          hostBySourceCodex,
          turnIdMapping
        ),
        [["n0", "f0"], ["n1", "f1"]]
      );
    });
    test("uses the source codex id as the host id for a restored source (no host map)", () => {
      const sourceTurnIds = ["c0", "c1"];
      const forkedTurnIds = ["c0", "c1"];
      const turnIdMapping = /* @__PURE__ */ new Map([["c0", "n0"], ["c1", "n1"]]);
      assert.deepStrictEqual(
        planForkedTurnIdMap(
          sourceTurnIds,
          forkedTurnIds,
          /*keepThroughIndex*/
          1,
          void 0,
          turnIdMapping
        ),
        [["n0", "c0"], ["n1", "c1"]]
      );
    });
    test("returns nothing when there is no turn-id mapping to apply", () => {
      assert.deepStrictEqual({
        undefinedMapping: planForkedTurnIdMap(["c0"], ["c0"], 0, void 0, void 0),
        emptyMapping: planForkedTurnIdMap(["c0"], ["c0"], 0, void 0, /* @__PURE__ */ new Map())
      }, {
        undefinedMapping: [],
        emptyMapping: []
      });
    });
    test("clamps to the number of forked turns actually present", () => {
      const turnIdMapping = /* @__PURE__ */ new Map([["c0", "n0"], ["c1", "n1"], ["c2", "n2"]]);
      assert.deepStrictEqual(
        planForkedTurnIdMap(
          ["c0", "c1", "c2"],
          ["c0", "c1"],
          /*keepThroughIndex*/
          2,
          void 0,
          turnIdMapping
        ),
        [["n0", "c0"], ["n1", "c1"]]
      );
    });
    test("falls back to the old host id when the mapping lacks an entry", () => {
      const turnIdMapping = /* @__PURE__ */ new Map([["c0", "n0"]]);
      assert.deepStrictEqual(
        planForkedTurnIdMap(
          ["c0", "c1"],
          ["c0", "c1"],
          /*keepThroughIndex*/
          1,
          void 0,
          turnIdMapping
        ),
        [["n0", "c0"], ["c1", "c1"]]
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhGb3JrUGxhbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBwbGFuRm9ya2VkVHVybklkTWFwLCByZXNvbHZlRm9ya0JvdW5kYXJ5IH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleEZvcmtQbGFuLmpzJztcblxuc3VpdGUoJ2NvZGV4Rm9ya1BsYW4nLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3Jlc29sdmVGb3JrQm91bmRhcnknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdsb2NhdGVzIHRoZSBib3VuZGFyeSBieSBjb2RleCB0dXJuIGlkIChmaXJzdCAvIG1pZGRsZSAvIGxhc3QpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWRzID0gWyd0MCcsICd0MScsICd0MiddO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGZpcnN0OiByZXNvbHZlRm9ya0JvdW5kYXJ5KGlkcywgJ3QwJywgLTEpLFxuXHRcdFx0XHRtaWRkbGU6IHJlc29sdmVGb3JrQm91bmRhcnkoaWRzLCAndDEnLCAtMSksXG5cdFx0XHRcdGxhc3Q6IHJlc29sdmVGb3JrQm91bmRhcnkoaWRzLCAndDInLCAtMSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdC8vIEZvcmsgYXQgdDAga2VlcHMgMSB0dXJuLCBkcm9wcyB0aGUgMiB0cmFpbGluZyB0dXJucy5cblx0XHRcdFx0Zmlyc3Q6IHsgcmVzb2x2ZWQ6IHRydWUsIGtlZXBUaHJvdWdoSW5kZXg6IDAsIG51bVR1cm5zVG9Ecm9wOiAyIH0sXG5cdFx0XHRcdG1pZGRsZTogeyByZXNvbHZlZDogdHJ1ZSwga2VlcFRocm91Z2hJbmRleDogMSwgbnVtVHVybnNUb0Ryb3A6IDEgfSxcblx0XHRcdFx0Ly8gRm9yayBhdCB0aGUgdGlwIGtlZXBzIGV2ZXJ5dGhpbmcsIGRyb3BzIG5vdGhpbmcuXG5cdFx0XHRcdGxhc3Q6IHsgcmVzb2x2ZWQ6IHRydWUsIGtlZXBUaHJvdWdoSW5kZXg6IDIsIG51bVR1cm5zVG9Ecm9wOiAwIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdHVybkluZGV4IHdoZW4gdGhlIGlkIGlzIG5vdCBmb3VuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGlkcyA9IFsndDAnLCAndDEnLCAndDInXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVGb3JrQm91bmRhcnkoaWRzLCAnbWlzc2luZycsIDEpLFxuXHRcdFx0XHR7IHJlc29sdmVkOiB0cnVlLCBrZWVwVGhyb3VnaEluZGV4OiAxLCBudW1UdXJuc1RvRHJvcDogMSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgYW4gdW5yZXNvbHZhYmxlIGJvdW5kYXJ5IGluc3RlYWQgb2Yga2VlcGluZyBmdWxsIGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpZHMgPSBbJ3QwJywgJ3QxJywgJ3QyJ107XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Ly8gaWQgbWlzc2luZyBBTkQgZmFsbGJhY2sgaW5kZXggb3V0IG9mIHJhbmdlIFx1MjE5MiB1bnJlc29sdmVkXG5cdFx0XHRcdG5lZ2F0aXZlRmFsbGJhY2s6IHJlc29sdmVGb3JrQm91bmRhcnkoaWRzLCAnbWlzc2luZycsIC0xKSxcblx0XHRcdFx0dG9vTGFyZ2VGYWxsYmFjazogcmVzb2x2ZUZvcmtCb3VuZGFyeShpZHMsICdtaXNzaW5nJywgNSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG5lZ2F0aXZlRmFsbGJhY2s6IHsgcmVzb2x2ZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdHRvb0xhcmdlRmFsbGJhY2s6IHsgcmVzb2x2ZWQ6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyZWF0cyBhbiBlbXB0eSBzb3VyY2UgdGhyZWFkIGFzIGEgdmFsaWQgZW1wdHkgZm9yaycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVGb3JrQm91bmRhcnkoW10sICdhbnl0aGluZycsIC0xKSxcblx0XHRcdFx0eyByZXNvbHZlZDogdHJ1ZSwga2VlcFRocm91Z2hJbmRleDogLTEsIG51bVR1cm5zVG9Ecm9wOiAwIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGxhbkZvcmtlZFR1cm5JZE1hcCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ21hcHMgbmV3IGhvc3QgaWRzIHRvIHRoZSBmb3JrZWQgdGhyZWFkXFwncyAocmVnZW5lcmF0ZWQpIGNvZGV4IGlkcyBmb3IgYSBsaXZlIHNvdXJjZScsICgpID0+IHtcblx0XHRcdC8vIExpdmUgc291cmNlOiBzb3VyY2Ugc2Vzc2lvbiB0cmFja3MgY29kZXhcdTIxOTJob3N0IGlkczsgdGhlIGZvcmsgcmVtYXBzXG5cdFx0XHQvLyBvbGQgaG9zdCBpZHMgdG8gbmV3IG9uZXMgYW5kIHJlZ2VuZXJhdGVzIHRoZSBjb2RleCB0dXJuIGlkcy5cblx0XHRcdGNvbnN0IHNvdXJjZVR1cm5JZHMgPSBbJ2MwJywgJ2MxJywgJ2MyJ107XG5cdFx0XHRjb25zdCBmb3JrZWRUdXJuSWRzID0gWydmMCcsICdmMSddOyAvLyB0MiB3YXMgcm9sbGVkIGJhY2tcblx0XHRcdGNvbnN0IGhvc3RCeVNvdXJjZUNvZGV4ID0gbmV3IE1hcChbWydjMCcsICdoMCddLCBbJ2MxJywgJ2gxJ10sIFsnYzInLCAnaDInXV0pO1xuXHRcdFx0Y29uc3QgdHVybklkTWFwcGluZyA9IG5ldyBNYXAoW1snaDAnLCAnbjAnXSwgWydoMScsICduMSddLCBbJ2gyJywgJ24yJ11dKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGxhbkZvcmtlZFR1cm5JZE1hcChzb3VyY2VUdXJuSWRzLCBmb3JrZWRUdXJuSWRzLCAvKmtlZXBUaHJvdWdoSW5kZXgqLyAxLCBob3N0QnlTb3VyY2VDb2RleCwgdHVybklkTWFwcGluZyksXG5cdFx0XHRcdFtbJ24wJywgJ2YwJ10sIFsnbjEnLCAnZjEnXV0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyB0aGUgc291cmNlIGNvZGV4IGlkIGFzIHRoZSBob3N0IGlkIGZvciBhIHJlc3RvcmVkIHNvdXJjZSAobm8gaG9zdCBtYXApJywgKCkgPT4ge1xuXHRcdFx0Ly8gUmVzdG9yZWQgc291cmNlOiBubyBsaXZlIGhvc3QgbWFwLCBzbyBvbGQgaG9zdCBpZCA9PSBzb3VyY2UgY29kZXggaWQuXG5cdFx0XHRjb25zdCBzb3VyY2VUdXJuSWRzID0gWydjMCcsICdjMSddO1xuXHRcdFx0Y29uc3QgZm9ya2VkVHVybklkcyA9IFsnYzAnLCAnYzEnXTtcblx0XHRcdGNvbnN0IHR1cm5JZE1hcHBpbmcgPSBuZXcgTWFwKFtbJ2MwJywgJ24wJ10sIFsnYzEnLCAnbjEnXV0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwbGFuRm9ya2VkVHVybklkTWFwKHNvdXJjZVR1cm5JZHMsIGZvcmtlZFR1cm5JZHMsIC8qa2VlcFRocm91Z2hJbmRleCovIDEsIHVuZGVmaW5lZCwgdHVybklkTWFwcGluZyksXG5cdFx0XHRcdFtbJ24wJywgJ2MwJ10sIFsnbjEnLCAnYzEnXV0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBub3RoaW5nIHdoZW4gdGhlcmUgaXMgbm8gdHVybi1pZCBtYXBwaW5nIHRvIGFwcGx5JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHVuZGVmaW5lZE1hcHBpbmc6IHBsYW5Gb3JrZWRUdXJuSWRNYXAoWydjMCddLCBbJ2MwJ10sIDAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0ZW1wdHlNYXBwaW5nOiBwbGFuRm9ya2VkVHVybklkTWFwKFsnYzAnXSwgWydjMCddLCAwLCB1bmRlZmluZWQsIG5ldyBNYXAoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHVuZGVmaW5lZE1hcHBpbmc6IFtdLFxuXHRcdFx0XHRlbXB0eU1hcHBpbmc6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGFtcHMgdG8gdGhlIG51bWJlciBvZiBmb3JrZWQgdHVybnMgYWN0dWFsbHkgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdC8vIGtlZXBUaHJvdWdoSW5kZXggY2xhaW1zIDMga2VwdCB0dXJucyBidXQgdGhlIGZvcmtlZCByZWFkIG9ubHlcblx0XHRcdC8vIHJldHVybmVkIDIgXHUyMTkyIG9ubHkgcGFpciB0aGUgdHVybnMgd2UgY2FuIHJlc29sdmUuXG5cdFx0XHRjb25zdCB0dXJuSWRNYXBwaW5nID0gbmV3IE1hcChbWydjMCcsICduMCddLCBbJ2MxJywgJ24xJ10sIFsnYzInLCAnbjInXV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGxhbkZvcmtlZFR1cm5JZE1hcChbJ2MwJywgJ2MxJywgJ2MyJ10sIFsnYzAnLCAnYzEnXSwgLyprZWVwVGhyb3VnaEluZGV4Ki8gMiwgdW5kZWZpbmVkLCB0dXJuSWRNYXBwaW5nKSxcblx0XHRcdFx0W1snbjAnLCAnYzAnXSwgWyduMScsICdjMSddXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSBvbGQgaG9zdCBpZCB3aGVuIHRoZSBtYXBwaW5nIGxhY2tzIGFuIGVudHJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybklkTWFwcGluZyA9IG5ldyBNYXAoW1snYzAnLCAnbjAnXV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGxhbkZvcmtlZFR1cm5JZE1hcChbJ2MwJywgJ2MxJ10sIFsnYzAnLCAnYzEnXSwgLyprZWVwVGhyb3VnaEluZGV4Ki8gMSwgdW5kZWZpbmVkLCB0dXJuSWRNYXBwaW5nKSxcblx0XHRcdFx0W1snbjAnLCAnYzAnXSwgWydjMScsICdjMSddXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUIsMkJBQTJCO0FBRXpELE1BQU0saUJBQWlCLE1BQU07QUFFNUIsMENBQXdDO0FBRXhDLFFBQU0sdUJBQXVCLE1BQU07QUFFbEMsU0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxZQUFNLE1BQU0sQ0FBQyxNQUFNLE1BQU0sSUFBSTtBQUM3QixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLE9BQU8sb0JBQW9CLEtBQUssTUFBTSxFQUFFO0FBQUEsUUFDeEMsUUFBUSxvQkFBb0IsS0FBSyxNQUFNLEVBQUU7QUFBQSxRQUN6QyxNQUFNLG9CQUFvQixLQUFLLE1BQU0sRUFBRTtBQUFBLE1BQ3hDLEdBQUc7QUFBQTtBQUFBLFFBRUYsT0FBTyxFQUFFLFVBQVUsTUFBTSxrQkFBa0IsR0FBRyxnQkFBZ0IsRUFBRTtBQUFBLFFBQ2hFLFFBQVEsRUFBRSxVQUFVLE1BQU0sa0JBQWtCLEdBQUcsZ0JBQWdCLEVBQUU7QUFBQTtBQUFBLFFBRWpFLE1BQU0sRUFBRSxVQUFVLE1BQU0sa0JBQWtCLEdBQUcsZ0JBQWdCLEVBQUU7QUFBQSxNQUNoRSxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxvREFBb0QsTUFBTTtBQUM5RCxZQUFNLE1BQU0sQ0FBQyxNQUFNLE1BQU0sSUFBSTtBQUM3QixhQUFPO0FBQUEsUUFDTixvQkFBb0IsS0FBSyxXQUFXLENBQUM7QUFBQSxRQUNyQyxFQUFFLFVBQVUsTUFBTSxrQkFBa0IsR0FBRyxnQkFBZ0IsRUFBRTtBQUFBLE1BQzFEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxvRUFBb0UsTUFBTTtBQUM5RSxZQUFNLE1BQU0sQ0FBQyxNQUFNLE1BQU0sSUFBSTtBQUM3QixhQUFPLGdCQUFnQjtBQUFBO0FBQUEsUUFFdEIsa0JBQWtCLG9CQUFvQixLQUFLLFdBQVcsRUFBRTtBQUFBLFFBQ3hELGtCQUFrQixvQkFBb0IsS0FBSyxXQUFXLENBQUM7QUFBQSxNQUN4RCxHQUFHO0FBQUEsUUFDRixrQkFBa0IsRUFBRSxVQUFVLE1BQU07QUFBQSxRQUNwQyxrQkFBa0IsRUFBRSxVQUFVLE1BQU07QUFBQSxNQUNyQyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyx1REFBdUQsTUFBTTtBQUNqRSxhQUFPO0FBQUEsUUFDTixvQkFBb0IsQ0FBQyxHQUFHLFlBQVksRUFBRTtBQUFBLFFBQ3RDLEVBQUUsVUFBVSxNQUFNLGtCQUFrQixJQUFJLGdCQUFnQixFQUFFO0FBQUEsTUFDM0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHVCQUF1QixNQUFNO0FBRWxDLFNBQUssc0ZBQXVGLE1BQU07QUFHakcsWUFBTSxnQkFBZ0IsQ0FBQyxNQUFNLE1BQU0sSUFBSTtBQUN2QyxZQUFNLGdCQUFnQixDQUFDLE1BQU0sSUFBSTtBQUNqQyxZQUFNLG9CQUFvQixvQkFBSSxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQztBQUM1RSxZQUFNLGdCQUFnQixvQkFBSSxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQztBQUV4RSxhQUFPO0FBQUEsUUFDTjtBQUFBLFVBQW9CO0FBQUEsVUFBZTtBQUFBO0FBQUEsVUFBb0M7QUFBQSxVQUFHO0FBQUEsVUFBbUI7QUFBQSxRQUFhO0FBQUEsUUFDMUcsQ0FBQyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUM1QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssK0VBQStFLE1BQU07QUFFekYsWUFBTSxnQkFBZ0IsQ0FBQyxNQUFNLElBQUk7QUFDakMsWUFBTSxnQkFBZ0IsQ0FBQyxNQUFNLElBQUk7QUFDakMsWUFBTSxnQkFBZ0Isb0JBQUksSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDO0FBRTFELGFBQU87QUFBQSxRQUNOO0FBQUEsVUFBb0I7QUFBQSxVQUFlO0FBQUE7QUFBQSxVQUFvQztBQUFBLFVBQUc7QUFBQSxVQUFXO0FBQUEsUUFBYTtBQUFBLFFBQ2xHLENBQUMsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFDNUI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsa0JBQWtCLG9CQUFvQixDQUFDLElBQUksR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLFFBQVcsTUFBUztBQUFBLFFBQzdFLGNBQWMsb0JBQW9CLENBQUMsSUFBSSxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsUUFBVyxvQkFBSSxJQUFJLENBQUM7QUFBQSxNQUMxRSxHQUFHO0FBQUEsUUFDRixrQkFBa0IsQ0FBQztBQUFBLFFBQ25CLGNBQWMsQ0FBQztBQUFBLE1BQ2hCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHlEQUF5RCxNQUFNO0FBR25FLFlBQU0sZ0JBQWdCLG9CQUFJLElBQUksQ0FBQyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDO0FBQ3hFLGFBQU87QUFBQSxRQUNOO0FBQUEsVUFBb0IsQ0FBQyxNQUFNLE1BQU0sSUFBSTtBQUFBLFVBQUcsQ0FBQyxNQUFNLElBQUk7QUFBQTtBQUFBLFVBQXdCO0FBQUEsVUFBRztBQUFBLFVBQVc7QUFBQSxRQUFhO0FBQUEsUUFDdEcsQ0FBQyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUM1QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssaUVBQWlFLE1BQU07QUFDM0UsWUFBTSxnQkFBZ0Isb0JBQUksSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQztBQUM1QyxhQUFPO0FBQUEsUUFDTjtBQUFBLFVBQW9CLENBQUMsTUFBTSxJQUFJO0FBQUEsVUFBRyxDQUFDLE1BQU0sSUFBSTtBQUFBO0FBQUEsVUFBd0I7QUFBQSxVQUFHO0FBQUEsVUFBVztBQUFBLFFBQWE7QUFBQSxRQUNoRyxDQUFDLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQztBQUFBLE1BQzVCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
