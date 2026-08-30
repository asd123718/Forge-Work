import assert from "assert";
import { disposableTimeout, timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { MainThreadManagedSocket } from "../../browser/mainThreadManagedSockets.js";
suite("MainThreadManagedSockets", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  suite("ManagedSocket", () => {
    let extHost;
    let half;
    class ExtHostMock extends mock() {
      constructor() {
        super(...arguments);
        this.onDidFire = new Emitter();
        this.events = [];
      }
      $remoteSocketWrite(socketId, buffer) {
        this.events.push({ socketId, data: buffer.toString() });
        this.onDidFire.fire();
      }
      $remoteSocketDrain(socketId) {
        this.events.push({ socketId, event: "drain" });
        this.onDidFire.fire();
        return Promise.resolve();
      }
      $remoteSocketEnd(socketId) {
        this.events.push({ socketId, event: "end" });
        this.onDidFire.fire();
      }
      expectEvent(test2, message) {
        if (this.events.some(test2)) {
          return;
        }
        const d = new DisposableStore();
        return new Promise((resolve) => {
          d.add(this.onDidFire.event(() => {
            if (this.events.some(test2)) {
              return;
            }
          }));
          d.add(disposableTimeout(() => {
            throw new Error(`Expected ${message} but only had ${JSON.stringify(this.events, null, 2)}`);
          }, 1e3));
        }).finally(() => d.dispose());
      }
    }
    setup(() => {
      extHost = new ExtHostMock();
      half = {
        onClose: new Emitter(),
        onData: new Emitter(),
        onEnd: new Emitter()
      };
    });
    async function doConnect() {
      const socket = MainThreadManagedSocket.connect(1, extHost, "/hello", "world=true", "", half);
      await extHost.expectEvent((evt) => evt.data && evt.data.startsWith("GET ws://localhost/hello?world=true&skipWebSocketFrames=true HTTP/1.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key:"), "websocket open event");
      half.onData.fire(VSBuffer.fromString("Opened successfully ;)\r\n\r\n"));
      return ds.add(await socket);
    }
    test("connects", async () => {
      await doConnect();
    });
    test("includes trailing connection data", async () => {
      const socketProm = MainThreadManagedSocket.connect(1, extHost, "/hello", "world=true", "", half);
      await extHost.expectEvent((evt) => evt.data && evt.data.includes("GET ws://localhost"), "websocket open event");
      half.onData.fire(VSBuffer.fromString("Opened successfully ;)\r\n\r\nSome trailing data"));
      const socket = ds.add(await socketProm);
      const data = [];
      ds.add(socket.onData((d) => data.push(d.toString())));
      await timeout(1);
      assert.deepStrictEqual(data, ["Some trailing data"]);
    });
    test("round trips data", async () => {
      const socket = await doConnect();
      const data = [];
      ds.add(socket.onData((d) => data.push(d.toString())));
      socket.write(VSBuffer.fromString("ping"));
      await extHost.expectEvent((evt) => evt.data === "ping", "expected ping");
      half.onData.fire(VSBuffer.fromString("pong"));
      assert.deepStrictEqual(data, ["pong"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcbWFpblRocmVhZE1hbmFnZWRTb2NrZXRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU29ja2V0Q2xvc2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSZW1vdGVTb2NrZXRIYWxmIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9tYW5hZ2VkU29ja2V0LmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRNYW5hZ2VkU29ja2V0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkTWFuYWdlZFNvY2tldHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdE1hbmFnZWRTb2NrZXRzU2hhcGUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5cbnN1aXRlKCdNYWluVGhyZWFkTWFuYWdlZFNvY2tldHMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnTWFuYWdlZFNvY2tldCcsICgpID0+IHtcblx0XHRsZXQgZXh0SG9zdDogRXh0SG9zdE1vY2s7XG5cdFx0bGV0IGhhbGY6IFJlbW90ZVNvY2tldEhhbGY7XG5cblx0XHRjbGFzcyBFeHRIb3N0TW9jayBleHRlbmRzIG1vY2s8RXh0SG9zdE1hbmFnZWRTb2NrZXRzU2hhcGU+KCkge1xuXHRcdFx0cHJpdmF0ZSBvbkRpZEZpcmUgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdFx0cHVibGljIHJlYWRvbmx5IGV2ZW50czogYW55W10gPSBbXTtcblxuXHRcdFx0b3ZlcnJpZGUgJHJlbW90ZVNvY2tldFdyaXRlKHNvY2tldElkOiBudW1iZXIsIGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5ldmVudHMucHVzaCh7IHNvY2tldElkLCBkYXRhOiBidWZmZXIudG9TdHJpbmcoKSB9KTtcblx0XHRcdFx0dGhpcy5vbkRpZEZpcmUuZmlyZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSAkcmVtb3RlU29ja2V0RHJhaW4oc29ja2V0SWQ6IG51bWJlcikge1xuXHRcdFx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgc29ja2V0SWQsIGV2ZW50OiAnZHJhaW4nIH0pO1xuXHRcdFx0XHR0aGlzLm9uRGlkRmlyZS5maXJlKCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgJHJlbW90ZVNvY2tldEVuZChzb2NrZXRJZDogbnVtYmVyKSB7XG5cdFx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBzb2NrZXRJZCwgZXZlbnQ6ICdlbmQnIH0pO1xuXHRcdFx0XHR0aGlzLm9uRGlkRmlyZS5maXJlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGV4cGVjdEV2ZW50KHRlc3Q6IChldnQ6IGFueSkgPT4gdm9pZCwgbWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0XHRcdGlmICh0aGlzLmV2ZW50cy5zb21lKHRlc3QpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZCA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGQuYWRkKHRoaXMub25EaWRGaXJlLmV2ZW50KCgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmV2ZW50cy5zb21lKHRlc3QpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0ZC5hZGQoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCAke21lc3NhZ2V9IGJ1dCBvbmx5IGhhZCAke0pTT04uc3RyaW5naWZ5KHRoaXMuZXZlbnRzLCBudWxsLCAyKX1gKTtcblx0XHRcdFx0XHR9LCAxMDAwKSk7XG5cdFx0XHRcdH0pLmZpbmFsbHkoKCkgPT4gZC5kaXNwb3NlKCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGV4dEhvc3QgPSBuZXcgRXh0SG9zdE1vY2soKTtcblx0XHRcdGhhbGYgPSB7XG5cdFx0XHRcdG9uQ2xvc2U6IG5ldyBFbWl0dGVyPFNvY2tldENsb3NlRXZlbnQ+KCksXG5cdFx0XHRcdG9uRGF0YTogbmV3IEVtaXR0ZXI8VlNCdWZmZXI+KCksXG5cdFx0XHRcdG9uRW5kOiBuZXcgRW1pdHRlcjx2b2lkPigpLFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIGRvQ29ubmVjdCgpIHtcblx0XHRcdGNvbnN0IHNvY2tldCA9IE1haW5UaHJlYWRNYW5hZ2VkU29ja2V0LmNvbm5lY3QoMSwgZXh0SG9zdCwgJy9oZWxsbycsICd3b3JsZD10cnVlJywgJycsIGhhbGYpO1xuXHRcdFx0YXdhaXQgZXh0SG9zdC5leHBlY3RFdmVudChldnQgPT4gZXZ0LmRhdGEgJiYgZXZ0LmRhdGEuc3RhcnRzV2l0aCgnR0VUIHdzOi8vbG9jYWxob3N0L2hlbGxvP3dvcmxkPXRydWUmc2tpcFdlYlNvY2tldEZyYW1lcz10cnVlIEhUVFAvMS4xXFxyXFxuQ29ubmVjdGlvbjogVXBncmFkZVxcclxcblVwZ3JhZGU6IHdlYnNvY2tldFxcclxcblNlYy1XZWJTb2NrZXQtS2V5OicpLCAnd2Vic29ja2V0IG9wZW4gZXZlbnQnKTtcblx0XHRcdGhhbGYub25EYXRhLmZpcmUoVlNCdWZmZXIuZnJvbVN0cmluZygnT3BlbmVkIHN1Y2Nlc3NmdWxseSA7KVxcclxcblxcclxcbicpKTtcblx0XHRcdHJldHVybiBkcy5hZGQoYXdhaXQgc29ja2V0KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdjb25uZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGRvQ29ubmVjdCgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgdHJhaWxpbmcgY29ubmVjdGlvbiBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc29ja2V0UHJvbSA9IE1haW5UaHJlYWRNYW5hZ2VkU29ja2V0LmNvbm5lY3QoMSwgZXh0SG9zdCwgJy9oZWxsbycsICd3b3JsZD10cnVlJywgJycsIGhhbGYpO1xuXHRcdFx0YXdhaXQgZXh0SG9zdC5leHBlY3RFdmVudChldnQgPT4gZXZ0LmRhdGEgJiYgZXZ0LmRhdGEuaW5jbHVkZXMoJ0dFVCB3czovL2xvY2FsaG9zdCcpLCAnd2Vic29ja2V0IG9wZW4gZXZlbnQnKTtcblx0XHRcdGhhbGYub25EYXRhLmZpcmUoVlNCdWZmZXIuZnJvbVN0cmluZygnT3BlbmVkIHN1Y2Nlc3NmdWxseSA7KVxcclxcblxcclxcblNvbWUgdHJhaWxpbmcgZGF0YScpKTtcblx0XHRcdGNvbnN0IHNvY2tldCA9IGRzLmFkZChhd2FpdCBzb2NrZXRQcm9tKTtcblxuXHRcdFx0Y29uc3QgZGF0YTogc3RyaW5nW10gPSBbXTtcblx0XHRcdGRzLmFkZChzb2NrZXQub25EYXRhKGQgPT4gZGF0YS5wdXNoKGQudG9TdHJpbmcoKSkpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7IC8vIGFsbG93IG1pY3JvdGFza3MgdG8gZmx1c2hcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWydTb21lIHRyYWlsaW5nIGRhdGEnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyb3VuZCB0cmlwcyBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc29ja2V0ID0gYXdhaXQgZG9Db25uZWN0KCk7XG5cdFx0XHRjb25zdCBkYXRhOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0ZHMuYWRkKHNvY2tldC5vbkRhdGEoZCA9PiBkYXRhLnB1c2goZC50b1N0cmluZygpKSkpO1xuXG5cdFx0XHRzb2NrZXQud3JpdGUoVlNCdWZmZXIuZnJvbVN0cmluZygncGluZycpKTtcblx0XHRcdGF3YWl0IGV4dEhvc3QuZXhwZWN0RXZlbnQoZXZ0ID0+IGV2dC5kYXRhID09PSAncGluZycsICdleHBlY3RlZCBwaW5nJyk7XG5cdFx0XHRoYWxmLm9uRGF0YS5maXJlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3BvbmcnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsncG9uZyddKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG1CQUFtQixlQUFlO0FBQzNDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUywrQkFBK0I7QUFHeEMsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QyxRQUFNLEtBQUssd0NBQXdDO0FBRW5ELFFBQU0saUJBQWlCLE1BQU07QUFDNUIsUUFBSTtBQUNKLFFBQUk7QUFBQSxJQUVKLE1BQU0sb0JBQW9CLEtBQWlDLEVBQUU7QUFBQSxNQUE3RDtBQUFBO0FBQ0MsYUFBUSxZQUFZLElBQUksUUFBYztBQUN0QyxhQUFnQixTQUFnQixDQUFDO0FBQUE7QUFBQSxNQUV4QixtQkFBbUIsVUFBa0IsUUFBd0I7QUFDckUsYUFBSyxPQUFPLEtBQUssRUFBRSxVQUFVLE1BQU0sT0FBTyxTQUFTLEVBQUUsQ0FBQztBQUN0RCxhQUFLLFVBQVUsS0FBSztBQUFBLE1BQ3JCO0FBQUEsTUFFUyxtQkFBbUIsVUFBa0I7QUFDN0MsYUFBSyxPQUFPLEtBQUssRUFBRSxVQUFVLE9BQU8sUUFBUSxDQUFDO0FBQzdDLGFBQUssVUFBVSxLQUFLO0FBQ3BCLGVBQU8sUUFBUSxRQUFRO0FBQUEsTUFDeEI7QUFBQSxNQUVTLGlCQUFpQixVQUFrQjtBQUMzQyxhQUFLLE9BQU8sS0FBSyxFQUFFLFVBQVUsT0FBTyxNQUFNLENBQUM7QUFDM0MsYUFBSyxVQUFVLEtBQUs7QUFB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
