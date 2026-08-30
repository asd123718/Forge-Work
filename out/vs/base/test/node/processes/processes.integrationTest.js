import assert from "assert";
import * as cp from "child_process";
import { FileAccess } from "../../../common/network.js";
import * as objects from "../../../common/objects.js";
import * as platform from "../../../common/platform.js";
import * as processes from "../../../node/processes.js";
function fork(id) {
  const opts = {
    env: objects.mixin(objects.deepClone(process.env), {
      VSCODE_ESM_ENTRYPOINT: id,
      VSCODE_PIPE_LOGGING: "true",
      VSCODE_VERBOSE_LOGGING: true
    })
  };
  return cp.fork(FileAccess.asFileUri("bootstrap-fork").fsPath, ["--type=processTests"], opts);
}
suite("Processes", () => {
  test("buffered sending - simple data", function(done) {
    if (process.env["VSCODE_PID"]) {
      return done();
    }
    const child = fork("vs/base/test/node/processes/fixtures/fork");
    const sender = processes.createQueuedSender(child);
    let counter = 0;
    const msg1 = "Hello One";
    const msg2 = "Hello Two";
    const msg3 = "Hello Three";
    child.on("message", (msgFromChild) => {
      if (msgFromChild === "ready") {
        sender.send(msg1);
        sender.send(msg2);
        sender.send(msg3);
      } else {
        counter++;
        if (counter === 1) {
          assert.strictEqual(msgFromChild, msg1);
        } else if (counter === 2) {
          assert.strictEqual(msgFromChild, msg2);
        } else if (counter === 3) {
          assert.strictEqual(msgFromChild, msg3);
          child.kill();
          done();
        }
      }
    });
  });
  (!platform.isWindows || process.env["VSCODE_PID"] ? test.skip : test)("buffered sending - lots of data (potential deadlock on win32)", function(done) {
    const child = fork("vs/base/test/node/processes/fixtures/fork_large");
    const sender = processes.createQueuedSender(child);
    const largeObj = /* @__PURE__ */ Object.create(null);
    for (let i = 0; i < 1e4; i++) {
      largeObj[i] = "some data";
    }
    const msg = JSON.stringify(largeObj);
    child.on("message", (msgFromChild) => {
      if (msgFromChild === "ready") {
        sender.send(msg);
        sender.send(msg);
        sender.send(msg);
      } else if (msgFromChild === "done") {
        child.kill();
        done();
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxub2RlXFxwcm9jZXNzZXNcXHByb2Nlc3Nlcy5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBwcm9jZXNzZXMgZnJvbSAnLi4vLi4vLi4vbm9kZS9wcm9jZXNzZXMuanMnO1xuXG5mdW5jdGlvbiBmb3JrKGlkOiBzdHJpbmcpOiBjcC5DaGlsZFByb2Nlc3Mge1xuXHRjb25zdCBvcHRzOiBhbnkgPSB7XG5cdFx0ZW52OiBvYmplY3RzLm1peGluKG9iamVjdHMuZGVlcENsb25lKHByb2Nlc3MuZW52KSwge1xuXHRcdFx0VlNDT0RFX0VTTV9FTlRSWVBPSU5UOiBpZCxcblx0XHRcdFZTQ09ERV9QSVBFX0xPR0dJTkc6ICd0cnVlJyxcblx0XHRcdFZTQ09ERV9WRVJCT1NFX0xPR0dJTkc6IHRydWVcblx0XHR9KVxuXHR9O1xuXG5cdHJldHVybiBjcC5mb3JrKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCdib290c3RyYXAtZm9yaycpLmZzUGF0aCwgWyctLXR5cGU9cHJvY2Vzc1Rlc3RzJ10sIG9wdHMpO1xufVxuXG5zdWl0ZSgnUHJvY2Vzc2VzJywgKCkgPT4ge1xuXHR0ZXN0KCdidWZmZXJlZCBzZW5kaW5nIC0gc2ltcGxlIGRhdGEnLCBmdW5jdGlvbiAoZG9uZTogKCkgPT4gdm9pZCkge1xuXHRcdGlmIChwcm9jZXNzLmVudlsnVlNDT0RFX1BJRCddKSB7XG5cdFx0XHRyZXR1cm4gZG9uZSgpOyAvLyB0aGlzIHRlc3QgZmFpbHMgd2hlbiBydW4gZnJvbSB3aXRoaW4gVlMgQ29kZVxuXHRcdH1cblxuXHRcdGNvbnN0IGNoaWxkID0gZm9yaygndnMvYmFzZS90ZXN0L25vZGUvcHJvY2Vzc2VzL2ZpeHR1cmVzL2ZvcmsnKTtcblx0XHRjb25zdCBzZW5kZXIgPSBwcm9jZXNzZXMuY3JlYXRlUXVldWVkU2VuZGVyKGNoaWxkKTtcblxuXHRcdGxldCBjb3VudGVyID0gMDtcblxuXHRcdGNvbnN0IG1zZzEgPSAnSGVsbG8gT25lJztcblx0XHRjb25zdCBtc2cyID0gJ0hlbGxvIFR3byc7XG5cdFx0Y29uc3QgbXNnMyA9ICdIZWxsbyBUaHJlZSc7XG5cblx0XHRjaGlsZC5vbignbWVzc2FnZScsIG1zZ0Zyb21DaGlsZCA9PiB7XG5cdFx0XHRpZiAobXNnRnJvbUNoaWxkID09PSAncmVhZHknKSB7XG5cdFx0XHRcdHNlbmRlci5zZW5kKG1zZzEpO1xuXHRcdFx0XHRzZW5kZXIuc2VuZChtc2cyKTtcblx0XHRcdFx0c2VuZGVyLnNlbmQobXNnMyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb3VudGVyKys7XG5cblx0XHRcdFx0aWYgKGNvdW50ZXIgPT09IDEpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXNnRnJvbUNoaWxkLCBtc2cxKTtcblx0XHRcdFx0fSBlbHNlIGlmIChjb3VudGVyID09PSAyKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1zZ0Zyb21DaGlsZCwgbXNnMik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY291bnRlciA9PT0gMykge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtc2dGcm9tQ2hpbGQsIG1zZzMpO1xuXG5cdFx0XHRcdFx0Y2hpbGQua2lsbCgpO1xuXHRcdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQoIXBsYXRmb3JtLmlzV2luZG93cyB8fCBwcm9jZXNzLmVudlsnVlNDT0RFX1BJRCddID8gdGVzdC5za2lwIDogdGVzdCkoJ2J1ZmZlcmVkIHNlbmRpbmcgLSBsb3RzIG9mIGRhdGEgKHBvdGVudGlhbCBkZWFkbG9jayBvbiB3aW4zMiknLCBmdW5jdGlvbiAoZG9uZTogKCkgPT4gdm9pZCkgeyAvLyB0ZXN0IGlzIG9ubHkgcmVsZXZhbnQgZm9yIFdpbmRvd3MgYW5kIHNlZW1zIHRvIGNyYXNoIHJhbmRvbWx5IG9uIHNvbWUgTGludXggYnVpbGRzXG5cdFx0Y29uc3QgY2hpbGQgPSBmb3JrKCd2cy9iYXNlL3Rlc3Qvbm9kZS9wcm9jZXNzZXMvZml4dHVyZXMvZm9ya19sYXJnZScpO1xuXHRcdGNvbnN0IHNlbmRlciA9IHByb2Nlc3Nlcy5jcmVhdGVRdWV1ZWRTZW5kZXIoY2hpbGQpO1xuXG5cdFx0Y29uc3QgbGFyZ2VPYmogPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwMDA7IGkrKykge1xuXHRcdFx0bGFyZ2VPYmpbaV0gPSAnc29tZSBkYXRhJztcblx0XHR9XG5cblx0XHRjb25zdCBtc2cgPSBKU09OLnN0cmluZ2lmeShsYXJnZU9iaik7XG5cdFx0Y2hpbGQub24oJ21lc3NhZ2UnLCBtc2dGcm9tQ2hpbGQgPT4ge1xuXHRcdFx0aWYgKG1zZ0Zyb21DaGlsZCA9PT0gJ3JlYWR5Jykge1xuXHRcdFx0XHRzZW5kZXIuc2VuZChtc2cpO1xuXHRcdFx0XHRzZW5kZXIuc2VuZChtc2cpO1xuXHRcdFx0XHRzZW5kZXIuc2VuZChtc2cpO1xuXHRcdFx0fSBlbHNlIGlmIChtc2dGcm9tQ2hpbGQgPT09ICdkb25lJykge1xuXHRcdFx0XHRjaGlsZC5raWxsKCk7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFFBQVE7QUFDcEIsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxhQUFhO0FBQ3pCLFlBQVksY0FBYztBQUMxQixZQUFZLGVBQWU7QUFFM0IsU0FBUyxLQUFLLElBQTZCO0FBQzFDLFFBQU0sT0FBWTtBQUFBLElBQ2pCLEtBQUssUUFBUSxNQUFNLFFBQVEsVUFBVSxRQUFRLEdBQUcsR0FBRztBQUFBLE1BQ2xELHVCQUF1QjtBQUFBLE1BQ3ZCLHFCQUFxQjtBQUFBLE1BQ3JCLHdCQUF3QjtBQUFBLElBQ3pCLENBQUM7QUFBQSxFQUNGO0FBRUEsU0FBTyxHQUFHLEtBQUssV0FBVyxVQUFVLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsR0FBRyxJQUFJO0FBQzVGO0FBRUEsTUFBTSxhQUFhLE1BQU07QUFDeEIsT0FBSyxrQ0FBa0MsU0FBVSxNQUFrQjtBQUNsRSxRQUFJLFFBQVEsSUFBSSxZQUFZLEdBQUc7QUFDOUIsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUVBLFVBQU0sUUFBUSxLQUFLLDJDQUEyQztBQUM5RCxVQUFNLFNBQVMsVUFBVSxtQkFBbUIsS0FBSztBQUVqRCxRQUFJLFVBQVU7QUFFZCxVQUFNLE9BQU87QUFDYixVQUFNLE9BQU87QUFDYixVQUFNLE9BQU87QUFFYixVQUFNLEdBQUcsV0FBVyxrQkFBZ0I7QUFDbkMsVUFBSSxpQkFBaUIsU0FBUztBQUM3QixlQUFPLEtBQUssSUFBSTtBQUNoQixlQUFPLEtBQUssSUFBSTtBQUNoQixlQUFPLEtBQUssSUFBSTtBQUFBLE1BQ2pCLE9BQU87QUFDTjtBQUVBLFlBQUksWUFBWSxHQUFHO0FBQ2xCLGlCQUFPLFlBQVksY0FBYyxJQUFJO0FBQUEsUUFDdEMsV0FBVyxZQUFZLEdBQUc7QUFDekIsaUJBQU8sWUFBWSxjQUFjLElBQUk7QUFBQSxRQUN0QyxXQUFXLFlBQVksR0FBRztBQUN6QixpQkFBTyxZQUFZLGNBQWMsSUFBSTtBQUVyQyxnQkFBTSxLQUFLO0FBQ1gsZUFBSztBQUFBLFFBQ047QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsR0FBQyxDQUFDLFNBQVMsYUFBYSxRQUFRLElBQUksWUFBWSxJQUFJLEtBQUssT0FBTyxNQUFNLGlFQUFpRSxTQUFVLE1BQWtCO0FBQ2xLLFVBQU0sUUFBUSxLQUFLLGlEQUFpRDtBQUNwRSxVQUFNLFNBQVMsVUFBVSxtQkFBbUIsS0FBSztBQUVqRCxVQUFNLFdBQVcsdUJBQU8sT0FBTyxJQUFJO0FBQ25DLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBTyxLQUFLO0FBQy9CLGVBQVMsQ0FBQyxJQUFJO0FBQUEsSUFDZjtBQUVBLFVBQU0sTUFBTSxLQUFLLFVBQVUsUUFBUTtBQUNuQyxVQUFNLEdBQUcsV0FBVyxrQkFBZ0I7QUFDbkMsVUFBSSxpQkFBaUIsU0FBUztBQUM3QixlQUFPLEtBQUssR0FBRztBQUNmLGVBQU8sS0FBSyxHQUFHO0FBQ2YsZUFBTyxLQUFLLEdBQUc7QUFBQSxNQUNoQixXQUFXLGlCQUFpQixRQUFRO0FBQ25DLGNBQU0sS0FBSztBQUNYLGFBQUs7QUFBQSxNQUNOO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
