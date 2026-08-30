import assert from "assert";
import { mainWindow } from "../../../base/browser/window.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { runWithFakedTimers } from "../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { BaseWindow } from "../../browser/window.js";
import { TestContextMenuService, TestEnvironmentService, TestHostService, TestLayoutService } from "./workbenchTestServices.js";
suite("Window", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class TestWindow extends BaseWindow {
    constructor(window, dom) {
      super(window, dom, new TestHostService(), TestEnvironmentService, new TestContextMenuService(), new TestLayoutService());
    }
    enableWindowFocusOnElementFocus() {
    }
  }
  test("multi window aware setTimeout()", async function() {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const disposables = new DisposableStore();
      let windows = [];
      const dom = {
        getWindowsCount: () => windows.length,
        getWindows: () => windows
      };
      const setTimeoutCalls = [];
      const clearTimeoutCalls = [];
      function createWindow(id, slow) {
        const res = {
          setTimeout: function(callback, delay, ...args) {
            setTimeoutCalls.push(id);
            return mainWindow.setTimeout(() => callback(id), slow ? delay * 2 : delay, ...args);
          },
          clearTimeout: function(timeoutId) {
            clearTimeoutCalls.push(id);
            return mainWindow.clearTimeout(timeoutId);
          }
        };
        disposables.add(new TestWindow(res, dom));
        return res;
      }
      const window1 = createWindow(1);
      windows = [{ window: window1, disposables }];
      let called = false;
      await new Promise((resolve, reject) => {
        window1.setTimeout(() => {
          if (!called) {
            called = true;
            resolve();
          } else {
            reject(new Error("timeout called twice"));
          }
        }, 1);
      });
      assert.strictEqual(called, true);
      assert.deepStrictEqual(setTimeoutCalls, [1]);
      assert.deepStrictEqual(clearTimeoutCalls, []);
      called = false;
      setTimeoutCalls.length = 0;
      clearTimeoutCalls.length = 0;
      await new Promise((resolve, reject) => {
        window1.setTimeout(() => {
          if (!called) {
            called = true;
            resolve();
          } else {
            reject(new Error("timeout called twice"));
          }
        }, 0);
      });
      assert.strictEqual(called, true);
      assert.deepStrictEqual(setTimeoutCalls, [1]);
      assert.deepStrictEqual(clearTimeoutCalls, []);
      called = false;
      setTimeoutCalls.length = 0;
      clearTimeoutCalls.length = 0;
      let window2 = createWindow(2);
      const window3 = createWindow(3);
      windows = [
        { window: window2, disposables },
        { window: window1, disposables },
        { window: window3, disposables }
      ];
      await new Promise((resolve, reject) => {
        window1.setTimeout(() => {
          if (!called) {
            called = true;
            resolve();
          } else {
            reject(new Error("timeout called twice"));
          }
        }, 1);
      });
      assert.strictEqual(called, true);
      assert.deepStrictEqual(setTimeoutCalls, [2, 1, 3]);
      assert.deepStrictEqual(clearTimeoutCalls, [2, 1, 3]);
      called = false;
      setTimeoutCalls.length = 0;
      clearTimeoutCalls.length = 0;
      window2 = createWindow(2, true);
      windows = [
        { window: window2, disposables },
        { window: window1, disposables }
      ];
      await new Promise((resolve, reject) => {
        window1.setTimeout((windowId) => {
          if (!called && windowId === 1) {
            called = true;
            resolve();
          } else if (called) {
            reject(new Error("timeout called twice"));
          } else {
            reject(new Error("timeout called for wrong window"));
          }
        }, 1);
      });
      assert.strictEqual(called, true);
      assert.deepStrictEqual(setTimeoutCalls, [2, 1]);
      assert.deepStrictEqual(clearTimeoutCalls, [2, 1]);
      called = false;
      setTimeoutCalls.length = 0;
      clearTimeoutCalls.length = 0;
      disposables.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXHdpbmRvdy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSVJlZ2lzdGVyZWRDb2RlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2RlV2luZG93LCBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQmFzZVdpbmRvdyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0TWVudVNlcnZpY2UsIFRlc3RFbnZpcm9ubWVudFNlcnZpY2UsIFRlc3RIb3N0U2VydmljZSwgVGVzdExheW91dFNlcnZpY2UgfSBmcm9tICcuL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5cbnN1aXRlKCdXaW5kb3cnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgVGVzdFdpbmRvdyBleHRlbmRzIEJhc2VXaW5kb3cge1xuXG5cdFx0Y29uc3RydWN0b3Iod2luZG93OiBDb2RlV2luZG93LCBkb206IHsgZ2V0V2luZG93c0NvdW50OiAoKSA9PiBudW1iZXI7IGdldFdpbmRvd3M6ICgpID0+IEl0ZXJhYmxlPElSZWdpc3RlcmVkQ29kZVdpbmRvdz4gfSkge1xuXHRcdFx0c3VwZXIod2luZG93LCBkb20sIG5ldyBUZXN0SG9zdFNlcnZpY2UoKSwgVGVzdEVudmlyb25tZW50U2VydmljZSwgbmV3IFRlc3RDb250ZXh0TWVudVNlcnZpY2UoKSwgbmV3IFRlc3RMYXlvdXRTZXJ2aWNlKCkpO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBvdmVycmlkZSBlbmFibGVXaW5kb3dGb2N1c09uRWxlbWVudEZvY3VzKCk6IHZvaWQgeyB9XG5cdH1cblxuXHR0ZXN0KCdtdWx0aSB3aW5kb3cgYXdhcmUgc2V0VGltZW91dCgpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRsZXQgd2luZG93czogSVJlZ2lzdGVyZWRDb2RlV2luZG93W10gPSBbXTtcblx0XHRcdGNvbnN0IGRvbSA9IHtcblx0XHRcdFx0Z2V0V2luZG93c0NvdW50OiAoKSA9PiB3aW5kb3dzLmxlbmd0aCxcblx0XHRcdFx0Z2V0V2luZG93czogKCkgPT4gd2luZG93c1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc2V0VGltZW91dENhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgY2xlYXJUaW1lb3V0Q2FsbHM6IG51bWJlcltdID0gW107XG5cblx0XHRcdGZ1bmN0aW9uIGNyZWF0ZVdpbmRvdyhpZDogbnVtYmVyLCBzbG93PzogYm9vbGVhbikge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0Y29uc3QgcmVzID0ge1xuXHRcdFx0XHRcdHNldFRpbWVvdXQ6IGZ1bmN0aW9uIChjYWxsYmFjazogRnVuY3Rpb24sIGRlbGF5OiBudW1iZXIsIC4uLmFyZ3M6IHVua25vd25bXSk6IG51bWJlciB7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0Q2FsbHMucHVzaChpZCk7XG5cblx0XHRcdFx0XHRcdHJldHVybiBtYWluV2luZG93LnNldFRpbWVvdXQoKCkgPT4gY2FsbGJhY2soaWQpLCBzbG93ID8gZGVsYXkgKiAyIDogZGVsYXksIC4uLmFyZ3MpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0OiBmdW5jdGlvbiAodGltZW91dElkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRcdFx0XHRcdGNsZWFyVGltZW91dENhbGxzLnB1c2goaWQpO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gbWFpbldpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dElkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gYXMgYW55O1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFdpbmRvdyhyZXMsIGRvbSkpO1xuXG5cdFx0XHRcdHJldHVybiByZXM7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdpbmRvdzEgPSBjcmVhdGVXaW5kb3coMSk7XG5cdFx0XHR3aW5kb3dzID0gW3sgd2luZG93OiB3aW5kb3cxLCBkaXNwb3NhYmxlcyB9XTtcblxuXHRcdFx0Ly8gV2luZG93IENvdW50OiAxXG5cblx0XHRcdGxldCBjYWxsZWQgPSBmYWxzZTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0d2luZG93MS5zZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIWNhbGxlZCkge1xuXHRcdFx0XHRcdFx0Y2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcigndGltZW91dCBjYWxsZWQgdHdpY2UnKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAxKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0VGltZW91dENhbGxzLCBbMV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhclRpbWVvdXRDYWxscywgW10pO1xuXHRcdFx0Y2FsbGVkID0gZmFsc2U7XG5cdFx0XHRzZXRUaW1lb3V0Q2FsbHMubGVuZ3RoID0gMDtcblx0XHRcdGNsZWFyVGltZW91dENhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0d2luZG93MS5zZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIWNhbGxlZCkge1xuXHRcdFx0XHRcdFx0Y2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcigndGltZW91dCBjYWxsZWQgdHdpY2UnKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAwKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0VGltZW91dENhbGxzLCBbMV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhclRpbWVvdXRDYWxscywgW10pO1xuXHRcdFx0Y2FsbGVkID0gZmFsc2U7XG5cdFx0XHRzZXRUaW1lb3V0Q2FsbHMubGVuZ3RoID0gMDtcblx0XHRcdGNsZWFyVGltZW91dENhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHRcdC8vIFdpbmRvdyBDb3VudDogM1xuXG5cdFx0XHRsZXQgd2luZG93MiA9IGNyZWF0ZVdpbmRvdygyKTtcblx0XHRcdGNvbnN0IHdpbmRvdzMgPSBjcmVhdGVXaW5kb3coMyk7XG5cdFx0XHR3aW5kb3dzID0gW1xuXHRcdFx0XHR7IHdpbmRvdzogd2luZG93MiwgZGlzcG9zYWJsZXMgfSxcblx0XHRcdFx0eyB3aW5kb3c6IHdpbmRvdzEsIGRpc3Bvc2FibGVzIH0sXG5cdFx0XHRcdHsgd2luZG93OiB3aW5kb3czLCBkaXNwb3NhYmxlcyB9XG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHdpbmRvdzEuc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFjYWxsZWQpIHtcblx0XHRcdFx0XHRcdGNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ3RpbWVvdXQgY2FsbGVkIHR3aWNlJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNldFRpbWVvdXRDYWxscywgWzIsIDEsIDNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xlYXJUaW1lb3V0Q2FsbHMsIFsyLCAxLCAzXSk7XG5cdFx0XHRjYWxsZWQgPSBmYWxzZTtcblx0XHRcdHNldFRpbWVvdXRDYWxscy5sZW5ndGggPSAwO1xuXHRcdFx0Y2xlYXJUaW1lb3V0Q2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdFx0Ly8gV2luZG93IENvdW50OiAyICgxIGZhc3QsIDEgc2xvdylcblxuXHRcdFx0d2luZG93MiA9IGNyZWF0ZVdpbmRvdygyLCB0cnVlKTtcblx0XHRcdHdpbmRvd3MgPSBbXG5cdFx0XHRcdHsgd2luZG93OiB3aW5kb3cyLCBkaXNwb3NhYmxlcyB9LFxuXHRcdFx0XHR7IHdpbmRvdzogd2luZG93MSwgZGlzcG9zYWJsZXMgfSxcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0d2luZG93MS5zZXRUaW1lb3V0KCh3aW5kb3dJZDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFjYWxsZWQgJiYgd2luZG93SWQgPT09IDEpIHtcblx0XHRcdFx0XHRcdGNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjYWxsZWQpIHtcblx0XHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ3RpbWVvdXQgY2FsbGVkIHR3aWNlJykpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKCd0aW1lb3V0IGNhbGxlZCBmb3Igd3Jvbmcgd2luZG93JykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNldFRpbWVvdXRDYWxscywgWzIsIDFdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xlYXJUaW1lb3V0Q2FsbHMsIFsyLCAxXSk7XG5cdFx0XHRjYWxsZWQgPSBmYWxzZTtcblx0XHRcdHNldFRpbWVvdXRDYWxscy5sZW5ndGggPSAwO1xuXHRcdFx0Y2xlYXJUaW1lb3V0Q2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQXFCLGtCQUFrQjtBQUN2QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHdCQUF3Qix3QkFBd0IsaUJBQWlCLHlCQUF5QjtBQUVuRyxNQUFNLFVBQVUsTUFBTTtBQUVyQiwwQ0FBd0M7QUFBQSxFQUV4QyxNQUFNLG1CQUFtQixXQUFXO0FBQUEsSUFFbkMsWUFBWSxRQUFvQixLQUEyRjtBQUMxSCxZQUFNLFFBQVEsS0FBSyxJQUFJLGdCQUFnQixHQUFHLHdCQUF3QixJQUFJLHVCQUF1QixHQUFHLElBQUksa0JBQWtCLENBQUM7QUFBQSxJQUN4SDtBQUFBLElBRW1CLGtDQUF3QztBQUFBLElBQUU7QUFBQSxFQUM5RDtBQUVBLE9BQUssbUNBQW1DLGlCQUFrQjtBQUN6RCxXQUFPLG1CQUFtQixFQUFFLGVBQWUsS0FBSyxHQUFHLFlBQVk7QUFDOUQsWUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFVBQUksVUFBbUMsQ0FBQztBQUN4QyxZQUFNLE1BQU07QUFBQSxRQUNYLGlCQUFpQixNQUFNLFFBQVE7QUFBQSxRQUMvQixZQUFZLE1BQU07QUFBQSxNQUNuQjtBQUVBLFlBQU0sa0JBQTRCLENBQUM7QUFDbkMsWUFBTSxvQkFBOEIsQ0FBQztBQUVyQyxlQUFTLGFBQWEsSUFBWSxNQUFnQjtBQUVqRCxj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
