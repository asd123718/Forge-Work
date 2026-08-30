import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { mockObject, upcastDeepPartial, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { DebugModel, ExceptionBreakpoint, FunctionBreakpoint } from "../../common/debugModel.js";
import { MockDebugStorage } from "./mockDebug.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
suite("DebugModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("FunctionBreakpoint", () => {
    test("Id is saved", () => {
      const fbp = new FunctionBreakpoint({ name: "function", enabled: true, hitCondition: "hit condition", condition: "condition", logMessage: "log message" });
      const strigified = JSON.stringify(fbp);
      const parsed = JSON.parse(strigified);
      assert.equal(parsed.id, fbp.getId());
    });
  });
  suite("InstructionBreakpoint", () => {
    function createModel(disposable) {
      const storage = disposable.add(new TestStorageService());
      const model = new DebugModel(
        disposable.add(new MockDebugStorage(storage)),
        upcastPartial({ isDirty: (_) => false }),
        void 0,
        new NullLogService()
      );
      disposable.add(model);
      return model;
    }
    test("removeInstructionBreakpoints prefers address match when instructionReference has changed", () => {
      const disposable = new DisposableStore();
      try {
        const model = createModel(disposable);
        const address = BigInt(4096);
        model.addInstructionBreakpoint({
          instructionReference: "oldRef",
          offset: 0,
          address,
          canPersist: false,
          enabled: true,
          hitCondition: void 0,
          condition: void 0,
          logMessage: void 0
        });
        assert.strictEqual(model.getInstructionBreakpoints().length, 1);
        model.removeInstructionBreakpoints("newRef", 0, address);
        assert.strictEqual(model.getInstructionBreakpoints().length, 0);
      } finally {
        disposable.dispose();
      }
    });
    test("removeInstructionBreakpoints falls back to instructionReference+offset when address not supplied", () => {
      const disposable = new DisposableStore();
      try {
        const model = createModel(disposable);
        model.addInstructionBreakpoint({
          instructionReference: "ref",
          offset: 4,
          address: BigInt(8192),
          canPersist: false,
          enabled: true,
          hitCondition: void 0,
          condition: void 0,
          logMessage: void 0
        });
        model.removeInstructionBreakpoints("other", 4);
        assert.strictEqual(model.getInstructionBreakpoints().length, 1);
        model.removeInstructionBreakpoints("ref", 4);
        assert.strictEqual(model.getInstructionBreakpoints().length, 0);
      } finally {
        disposable.dispose();
      }
    });
    test("removeInstructionBreakpoints with only address removes the matching entry and leaves others", () => {
      const disposable = new DisposableStore();
      try {
        const model = createModel(disposable);
        const keep = [];
        model.addInstructionBreakpoint({
          instructionReference: "refA",
          offset: 0,
          address: BigInt(12288),
          canPersist: false,
          enabled: true,
          hitCondition: void 0,
          condition: void 0,
          logMessage: void 0
        });
        model.addInstructionBreakpoint({
          instructionReference: "refB",
          offset: 0,
          address: BigInt(16384),
          canPersist: false,
          enabled: true,
          hitCondition: void 0,
          condition: void 0,
          logMessage: void 0
        });
        model.removeInstructionBreakpoints(void 0, void 0, BigInt(12288));
        const remaining = model.getInstructionBreakpoints();
        assert.strictEqual(remaining.length, 1);
        assert.strictEqual(remaining[0].address, BigInt(16384));
        keep.push(...remaining);
        assert.strictEqual(keep.length, 1);
      } finally {
        disposable.dispose();
      }
    });
  });
  suite("ExceptionBreakpoint", () => {
    test("Restored matches new", () => {
      const ebp = new ExceptionBreakpoint({
        conditionDescription: "condition description",
        description: "description",
        filter: "condition",
        label: "label",
        supportsCondition: true,
        enabled: true
      }, "id");
      const strigified = JSON.stringify(ebp);
      const parsed = JSON.parse(strigified);
      const newEbp = new ExceptionBreakpoint(parsed);
      assert.ok(ebp.matches(newEbp));
    });
  });
  suite("DebugModel", () => {
    test("refreshTopOfCallstack resolves all returned promises when called multiple times", async () => {
      return runWithFakedTimers({}, async () => {
        const topFrameDeferred = new DeferredPromise();
        const wholeStackDeferred = new DeferredPromise();
        const fakeThread = mockObject()({
          session: upcastDeepPartial({ capabilities: { supportsDelayedStackTraceLoading: true } }),
          getCallStack: () => [],
          getStaleCallStack: () => []
        });
        fakeThread.fetchCallStack.callsFake((levels) => {
          return levels === 1 ? topFrameDeferred.p : wholeStackDeferred.p;
        });
        fakeThread.getId.returns(1);
        const disposable = new DisposableStore();
        const storage = disposable.add(new TestStorageService());
        const model = new DebugModel(disposable.add(new MockDebugStorage(storage)), upcastPartial({ isDirty: (e) => false }), void 0, new NullLogService());
        disposable.add(model);
        let top1Resolved = false;
        let whole1Resolved = false;
        let top2Resolved = false;
        let whole2Resolved = false;
        const result1 = model.refreshTopOfCallstack(fakeThread);
        result1.topCallStack.then(() => top1Resolved = true);
        result1.wholeCallStack.then(() => whole1Resolved = true);
        const result2 = model.refreshTopOfCallstack(fakeThread);
        result2.topCallStack.then(() => top2Resolved = true);
        result2.wholeCallStack.then(() => whole2Resolved = true);
        assert.ok(!top1Resolved);
        assert.ok(!whole1Resolved);
        assert.ok(!top2Resolved);
        assert.ok(!whole2Resolved);
        await topFrameDeferred.complete();
        await result1.topCallStack;
        await result2.topCallStack;
        assert.ok(!whole1Resolved);
        assert.ok(!whole2Resolved);
        await wholeStackDeferred.complete();
        await result1.wholeCallStack;
        await result2.wholeCallStack;
        disposable.dispose();
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxjb21tb25cXGRlYnVnTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtb2NrT2JqZWN0LCB1cGNhc3REZWVwUGFydGlhbCwgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElEZWJ1Z1Nlc3Npb24sIElJbnN0cnVjdGlvbkJyZWFrcG9pbnQgfSBmcm9tICcuLi8uLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgRGVidWdNb2RlbCwgRXhjZXB0aW9uQnJlYWtwb2ludCwgRnVuY3Rpb25CcmVha3BvaW50LCBUaHJlYWQgfSBmcm9tICcuLi8uLi9jb21tb24vZGVidWdNb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2NrRGVidWdTdG9yYWdlIH0gZnJvbSAnLi9tb2NrRGVidWcuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcblxuc3VpdGUoJ0RlYnVnTW9kZWwnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdGdW5jdGlvbkJyZWFrcG9pbnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnSWQgaXMgc2F2ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYnAgPSBuZXcgRnVuY3Rpb25CcmVha3BvaW50KHsgbmFtZTogJ2Z1bmN0aW9uJywgZW5hYmxlZDogdHJ1ZSwgaGl0Q29uZGl0aW9uOiAnaGl0IGNvbmRpdGlvbicsIGNvbmRpdGlvbjogJ2NvbmRpdGlvbicsIGxvZ01lc3NhZ2U6ICdsb2cgbWVzc2FnZScgfSk7XG5cdFx0XHRjb25zdCBzdHJpZ2lmaWVkID0gSlNPTi5zdHJpbmdpZnkoZmJwKTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2Uoc3RyaWdpZmllZCk7XG5cdFx0XHRhc3NlcnQuZXF1YWwocGFyc2VkLmlkLCBmYnAuZ2V0SWQoKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdJbnN0cnVjdGlvbkJyZWFrcG9pbnQnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gY3JlYXRlTW9kZWwoZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRGVidWdNb2RlbCB7XG5cdFx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZS5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IERlYnVnTW9kZWwoXG5cdFx0XHRcdGRpc3Bvc2FibGUuYWRkKG5ldyBNb2NrRGVidWdTdG9yYWdlKHN0b3JhZ2UpKSxcblx0XHRcdFx0dXBjYXN0UGFydGlhbDxJVGV4dEZpbGVTZXJ2aWNlPih7IGlzRGlydHk6IChfOiB1bmtub3duKSA9PiBmYWxzZSB9KSxcblx0XHRcdFx0dW5kZWZpbmVkISxcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKClcblx0XHRcdCk7XG5cdFx0XHRkaXNwb3NhYmxlLmFkZChtb2RlbCk7XG5cdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0fVxuXG5cdFx0Ly8gUmVncmVzc2lvbiB0ZXN0IGZvciBtaWNyb3NvZnQvdnNjb2RlIzI4OTY3ODogaWYgdGhlIGRlYnVnIGFkYXB0ZXIgaGFuZHNcblx0XHQvLyBvdXQgYSBuZXcgYGluc3RydWN0aW9uUmVmZXJlbmNlYCBmb3IgdGhlIHNhbWUgbWVtb3J5IGxvY2F0aW9uIChlLmcuXG5cdFx0Ly8gYWZ0ZXIgYSBzeW1ib2wgcmVsb2FkIG9yIGNlcnRhaW4gc3RlcHBpbmcgb3BlcmF0aW9ucyksIHJlbW92YWwgYnlcblx0XHQvLyByZWZlcmVuY2Urb2Zmc2V0IG11c3Qgc3RpbGwgc3VjY2VlZCB3aGVuIHRoZSBjYWxsZXIgc3VwcGxpZXMgdGhlXG5cdFx0Ly8gcmVzb2x2ZWQgYWRkcmVzcy5cblx0XHR0ZXN0KCdyZW1vdmVJbnN0cnVjdGlvbkJyZWFrcG9pbnRzIHByZWZlcnMgYWRkcmVzcyBtYXRjaCB3aGVuIGluc3RydWN0aW9uUmVmZXJlbmNlIGhhcyBjaGFuZ2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoZGlzcG9zYWJsZSk7XG5cdFx0XHRcdGNvbnN0IGFkZHJlc3MgPSBCaWdJbnQoMHgxMDAwKTtcblx0XHRcdFx0bW9kZWwuYWRkSW5zdHJ1Y3Rpb25CcmVha3BvaW50KHtcblx0XHRcdFx0XHRpbnN0cnVjdGlvblJlZmVyZW5jZTogJ29sZFJlZicsXG5cdFx0XHRcdFx0b2Zmc2V0OiAwLFxuXHRcdFx0XHRcdGFkZHJlc3MsXG5cdFx0XHRcdFx0Y2FuUGVyc2lzdDogZmFsc2UsXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRoaXRDb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsb2dNZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCkubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHQvLyBTaW11bGF0ZSB0aGUgZGlzYXNzZW1ibHkgdmlldyBhc2tpbmcgZm9yIHJlbW92YWwgYWZ0ZXIgdGhlXG5cdFx0XHRcdC8vIGRlYnVnIGFkYXB0ZXIgaGFuZGVkIG91dCBhIG5ldyBpbnN0cnVjdGlvbiByZWZlcmVuY2UuXG5cdFx0XHRcdG1vZGVsLnJlbW92ZUluc3RydWN0aW9uQnJlYWtwb2ludHMoJ25ld1JlZicsIDAsIGFkZHJlc3MpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCkubGVuZ3RoLCAwKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyBmYWxscyBiYWNrIHRvIGluc3RydWN0aW9uUmVmZXJlbmNlK29mZnNldCB3aGVuIGFkZHJlc3Mgbm90IHN1cHBsaWVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoZGlzcG9zYWJsZSk7XG5cdFx0XHRcdG1vZGVsLmFkZEluc3RydWN0aW9uQnJlYWtwb2ludCh7XG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25SZWZlcmVuY2U6ICdyZWYnLFxuXHRcdFx0XHRcdG9mZnNldDogNCxcblx0XHRcdFx0XHRhZGRyZXNzOiBCaWdJbnQoMHgyMDAwKSxcblx0XHRcdFx0XHRjYW5QZXJzaXN0OiBmYWxzZSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGhpdENvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGxvZ01lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gTm9uLW1hdGNoaW5nIHJlZmVyZW5jZSBsZWF2ZXMgdGhlIGJyZWFrcG9pbnQgaW4gcGxhY2UuXG5cdFx0XHRcdG1vZGVsLnJlbW92ZUluc3RydWN0aW9uQnJlYWtwb2ludHMoJ290aGVyJywgNCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCkubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHQvLyBNYXRjaGluZyByZWZlcmVuY2Urb2Zmc2V0IHJlbW92ZXMgaXQuXG5cdFx0XHRcdG1vZGVsLnJlbW92ZUluc3RydWN0aW9uQnJlYWtwb2ludHMoJ3JlZicsIDQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0SW5zdHJ1Y3Rpb25CcmVha3BvaW50cygpLmxlbmd0aCwgMCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZUluc3RydWN0aW9uQnJlYWtwb2ludHMgd2l0aCBvbmx5IGFkZHJlc3MgcmVtb3ZlcyB0aGUgbWF0Y2hpbmcgZW50cnkgYW5kIGxlYXZlcyBvdGhlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbChkaXNwb3NhYmxlKTtcblx0XHRcdFx0Y29uc3Qga2VlcDogSUluc3RydWN0aW9uQnJlYWtwb2ludFtdID0gW107XG5cblx0XHRcdFx0bW9kZWwuYWRkSW5zdHJ1Y3Rpb25CcmVha3BvaW50KHtcblx0XHRcdFx0XHRpbnN0cnVjdGlvblJlZmVyZW5jZTogJ3JlZkEnLFxuXHRcdFx0XHRcdG9mZnNldDogMCxcblx0XHRcdFx0XHRhZGRyZXNzOiBCaWdJbnQoMHgzMDAwKSxcblx0XHRcdFx0XHRjYW5QZXJzaXN0OiBmYWxzZSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGhpdENvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGxvZ01lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdG1vZGVsLmFkZEluc3RydWN0aW9uQnJlYWtwb2ludCh7XG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25SZWZlcmVuY2U6ICdyZWZCJyxcblx0XHRcdFx0XHRvZmZzZXQ6IDAsXG5cdFx0XHRcdFx0YWRkcmVzczogQmlnSW50KDB4NDAwMCksXG5cdFx0XHRcdFx0Y2FuUGVyc2lzdDogZmFsc2UsXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRoaXRDb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsb2dNZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdG1vZGVsLnJlbW92ZUluc3RydWN0aW9uQnJlYWtwb2ludHModW5kZWZpbmVkLCB1bmRlZmluZWQsIEJpZ0ludCgweDMwMDApKTtcblxuXHRcdFx0XHRjb25zdCByZW1haW5pbmcgPSBtb2RlbC5nZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1haW5pbmcubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbWFpbmluZ1swXS5hZGRyZXNzLCBCaWdJbnQoMHg0MDAwKSk7XG5cdFx0XHRcdGtlZXAucHVzaCguLi5yZW1haW5pbmcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoa2VlcC5sZW5ndGgsIDEpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdFeGNlcHRpb25CcmVha3BvaW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ1Jlc3RvcmVkIG1hdGNoZXMgbmV3JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWJwID0gbmV3IEV4Y2VwdGlvbkJyZWFrcG9pbnQoe1xuXHRcdFx0XHRjb25kaXRpb25EZXNjcmlwdGlvbjogJ2NvbmRpdGlvbiBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRmaWx0ZXI6ICdjb25kaXRpb24nLFxuXHRcdFx0XHRsYWJlbDogJ2xhYmVsJyxcblx0XHRcdFx0c3VwcG9ydHNDb25kaXRpb246IHRydWUsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHR9LCAnaWQnKTtcblx0XHRcdGNvbnN0IHN0cmlnaWZpZWQgPSBKU09OLnN0cmluZ2lmeShlYnApO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShzdHJpZ2lmaWVkKTtcblx0XHRcdGNvbnN0IG5ld0VicCA9IG5ldyBFeGNlcHRpb25CcmVha3BvaW50KHBhcnNlZCk7XG5cdFx0XHRhc3NlcnQub2soZWJwLm1hdGNoZXMobmV3RWJwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdEZWJ1Z01vZGVsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlZnJlc2hUb3BPZkNhbGxzdGFjayByZXNvbHZlcyBhbGwgcmV0dXJuZWQgcHJvbWlzZXMgd2hlbiBjYWxsZWQgbXVsdGlwbGUgdGltZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRvcEZyYW1lRGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdGNvbnN0IHdob2xlU3RhY2tEZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdFx0Y29uc3QgZmFrZVRocmVhZCA9IG1vY2tPYmplY3Q8VGhyZWFkPigpKHtcblx0XHRcdFx0XHRzZXNzaW9uOiB1cGNhc3REZWVwUGFydGlhbDxJRGVidWdTZXNzaW9uPih7IGNhcGFiaWxpdGllczogeyBzdXBwb3J0c0RlbGF5ZWRTdGFja1RyYWNlTG9hZGluZzogdHJ1ZSB9IH0pLFxuXHRcdFx0XHRcdGdldENhbGxTdGFjazogKCkgPT4gW10sXG5cdFx0XHRcdFx0Z2V0U3RhbGVDYWxsU3RhY2s6ICgpID0+IFtdLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZmFrZVRocmVhZC5mZXRjaENhbGxTdGFjay5jYWxsc0Zha2UoKGxldmVsczogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGxldmVscyA9PT0gMSA/IHRvcEZyYW1lRGVmZXJyZWQucCA6IHdob2xlU3RhY2tEZWZlcnJlZC5wO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZmFrZVRocmVhZC5nZXRJZC5yZXR1cm5zKDEpO1xuXG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBEZWJ1Z01vZGVsKGRpc3Bvc2FibGUuYWRkKG5ldyBNb2NrRGVidWdTdG9yYWdlKHN0b3JhZ2UpKSwgdXBjYXN0UGFydGlhbDxJVGV4dEZpbGVTZXJ2aWNlPih7IGlzRGlydHk6IChlOiB1bmtub3duKSA9PiBmYWxzZSB9KSwgdW5kZWZpbmVkISwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0XHRkaXNwb3NhYmxlLmFkZChtb2RlbCk7XG5cblx0XHRcdFx0bGV0IHRvcDFSZXNvbHZlZCA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgd2hvbGUxUmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRcdFx0bGV0IHRvcDJSZXNvbHZlZCA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgd2hvbGUyUmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGNvbnN0IHJlc3VsdDEgPSBtb2RlbC5yZWZyZXNoVG9wT2ZDYWxsc3RhY2soZmFrZVRocmVhZCBhcyBhbnkpO1xuXHRcdFx0XHRyZXN1bHQxLnRvcENhbGxTdGFjay50aGVuKCgpID0+IHRvcDFSZXNvbHZlZCA9IHRydWUpO1xuXHRcdFx0XHRyZXN1bHQxLndob2xlQ2FsbFN0YWNrLnRoZW4oKCkgPT4gd2hvbGUxUmVzb2x2ZWQgPSB0cnVlKTtcblxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0Y29uc3QgcmVzdWx0MiA9IG1vZGVsLnJlZnJlc2hUb3BPZkNhbGxzdGFjayhmYWtlVGhyZWFkIGFzIGFueSk7XG5cdFx0XHRcdHJlc3VsdDIudG9wQ2FsbFN0YWNrLnRoZW4oKCkgPT4gdG9wMlJlc29sdmVkID0gdHJ1ZSk7XG5cdFx0XHRcdHJlc3VsdDIud2hvbGVDYWxsU3RhY2sudGhlbigoKSA9PiB3aG9sZTJSZXNvbHZlZCA9IHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5vayghdG9wMVJlc29sdmVkKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF3aG9sZTFSZXNvbHZlZCk7XG5cdFx0XHRcdGFzc2VydC5vayghdG9wMlJlc29sdmVkKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF3aG9sZTJSZXNvbHZlZCk7XG5cblx0XHRcdFx0YXdhaXQgdG9wRnJhbWVEZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCByZXN1bHQxLnRvcENhbGxTdGFjaztcblx0XHRcdFx0YXdhaXQgcmVzdWx0Mi50b3BDYWxsU3RhY2s7XG5cdFx0XHRcdGFzc2VydC5vayghd2hvbGUxUmVzb2x2ZWQpO1xuXHRcdFx0XHRhc3NlcnQub2soIXdob2xlMlJlc29sdmVkKTtcblxuXHRcdFx0XHRhd2FpdCB3aG9sZVN0YWNrRGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgcmVzdWx0MS53aG9sZUNhbGxTdGFjaztcblx0XHRcdFx0YXdhaXQgcmVzdWx0Mi53aG9sZUNhbGxTdGFjaztcblxuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVC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
