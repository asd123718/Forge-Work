import assert from "assert";
import * as crypto from "crypto";
import * as net from "net";
import * as platform from "../../../../../base/common/platform.js";
import { tmpdir } from "os";
import { join } from "../../../../../base/common/path.js";
import * as ports from "../../../../../base/node/ports.js";
import { SocketDebugAdapter, NamedPipeDebugAdapter } from "../../node/debugAdapter.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
function sendInitializeRequest(debugAdapter) {
  return new Promise((resolve, reject) => {
    debugAdapter.sendRequest("initialize", { adapterID: "test" }, (result) => {
      resolve(result);
    }, 3e3);
  });
}
function serverConnection(socket) {
  socket.on("data", (data) => {
    const str = data.toString().split("\r\n")[2];
    const request = JSON.parse(str);
    const response = {
      seq: request.seq,
      request_seq: request.seq,
      type: "response",
      command: request.command
    };
    if (request.arguments.adapterID === "test") {
      response.success = true;
    } else {
      response.success = false;
      response.message = "failed";
    }
    const responsePayload = JSON.stringify(response);
    socket.write(`Content-Length: ${responsePayload.length}\r
\r
${responsePayload}`);
  });
}
suite("Debug - StreamDebugAdapter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test(`StreamDebugAdapter (NamedPipeDebugAdapter) can initialize a connection`, async () => {
    const pipeName = crypto.randomBytes(10).toString("hex");
    const pipePath = platform.isWindows ? join("\\\\.\\pipe\\", pipeName) : join(tmpdir(), pipeName);
    const server = await new Promise((resolve, reject) => {
      const server2 = net.createServer(serverConnection);
      server2.once("listening", () => resolve(server2));
      server2.once("error", reject);
      server2.listen(pipePath);
    });
    const debugAdapter = new NamedPipeDebugAdapter({
      type: "pipeServer",
      path: pipePath
    });
    try {
      await debugAdapter.startSession();
      const response = await sendInitializeRequest(debugAdapter);
      assert.strictEqual(response.command, "initialize");
      assert.strictEqual(response.request_seq, 1);
      assert.strictEqual(response.success, true, response.message);
    } finally {
      await debugAdapter.stopSession();
      server.close();
      debugAdapter.dispose();
    }
  });
  test(`StreamDebugAdapter (SocketDebugAdapter) can initialize a connection`, async () => {
    const rndPort = Math.floor(Math.random() * 1e3 + 8e3);
    const port = await ports.findFreePort(
      rndPort,
      10,
      3e3,
      87
      /* skip 87 ports between attempts */
    );
    const server = net.createServer(serverConnection).listen(port);
    const debugAdapter = new SocketDebugAdapter({
      type: "server",
      port
    });
    try {
      await debugAdapter.startSession();
      const response = await sendInitializeRequest(debugAdapter);
      assert.strictEqual(response.command, "initialize");
      assert.strictEqual(response.request_seq, 1);
      assert.strictEqual(response.success, true, response.message);
    } finally {
      await debugAdapter.stopSession();
      server.close();
      debugAdapter.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxub2RlXFxzdHJlYW1EZWJ1Z0FkYXB0ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xuaW1wb3J0ICogYXMgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBwb3J0cyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL25vZGUvcG9ydHMuanMnO1xuaW1wb3J0IHsgU29ja2V0RGVidWdBZGFwdGVyLCBOYW1lZFBpcGVEZWJ1Z0FkYXB0ZXIsIFN0cmVhbURlYnVnQWRhcHRlciB9IGZyb20gJy4uLy4uL25vZGUvZGVidWdBZGFwdGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5cbmZ1bmN0aW9uIHNlbmRJbml0aWFsaXplUmVxdWVzdChkZWJ1Z0FkYXB0ZXI6IFN0cmVhbURlYnVnQWRhcHRlcik6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXNwb25zZT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGRlYnVnQWRhcHRlci5zZW5kUmVxdWVzdCgnaW5pdGlhbGl6ZScsIHsgYWRhcHRlcklEOiAndGVzdCcgfSwgKHJlc3VsdCkgPT4ge1xuXHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdH0sIDMwMDApO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gc2VydmVyQ29ubmVjdGlvbihzb2NrZXQ6IG5ldC5Tb2NrZXQpIHtcblx0c29ja2V0Lm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4ge1xuXHRcdGNvbnN0IHN0ciA9IGRhdGEudG9TdHJpbmcoKS5zcGxpdCgnXFxyXFxuJylbMl07XG5cdFx0Y29uc3QgcmVxdWVzdCA9IEpTT04ucGFyc2Uoc3RyKTtcblx0XHRjb25zdCByZXNwb25zZTogYW55ID0ge1xuXHRcdFx0c2VxOiByZXF1ZXN0LnNlcSxcblx0XHRcdHJlcXVlc3Rfc2VxOiByZXF1ZXN0LnNlcSxcblx0XHRcdHR5cGU6ICdyZXNwb25zZScsXG5cdFx0XHRjb21tYW5kOiByZXF1ZXN0LmNvbW1hbmRcblx0XHR9O1xuXHRcdGlmIChyZXF1ZXN0LmFyZ3VtZW50cy5hZGFwdGVySUQgPT09ICd0ZXN0Jykge1xuXHRcdFx0cmVzcG9uc2Uuc3VjY2VzcyA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3BvbnNlLnN1Y2Nlc3MgPSBmYWxzZTtcblx0XHRcdHJlc3BvbnNlLm1lc3NhZ2UgPSAnZmFpbGVkJztcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZVBheWxvYWQgPSBKU09OLnN0cmluZ2lmeShyZXNwb25zZSk7XG5cdFx0c29ja2V0LndyaXRlKGBDb250ZW50LUxlbmd0aDogJHtyZXNwb25zZVBheWxvYWQubGVuZ3RofVxcclxcblxcclxcbiR7cmVzcG9uc2VQYXlsb2FkfWApO1xuXHR9KTtcbn1cblxuc3VpdGUoJ0RlYnVnIC0gU3RyZWFtRGVidWdBZGFwdGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoYFN0cmVhbURlYnVnQWRhcHRlciAoTmFtZWRQaXBlRGVidWdBZGFwdGVyKSBjYW4gaW5pdGlhbGl6ZSBhIGNvbm5lY3Rpb25gLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBwaXBlTmFtZSA9IGNyeXB0by5yYW5kb21CeXRlcygxMCkudG9TdHJpbmcoJ2hleCcpO1xuXHRcdGNvbnN0IHBpcGVQYXRoID0gcGxhdGZvcm0uaXNXaW5kb3dzID8gam9pbignXFxcXFxcXFwuXFxcXHBpcGVcXFxcJywgcGlwZU5hbWUpIDogam9pbih0bXBkaXIoKSwgcGlwZU5hbWUpO1xuXHRcdGNvbnN0IHNlcnZlciA9IGF3YWl0IG5ldyBQcm9taXNlPG5ldC5TZXJ2ZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZlciA9IG5ldC5jcmVhdGVTZXJ2ZXIoc2VydmVyQ29ubmVjdGlvbik7XG5cdFx0XHRzZXJ2ZXIub25jZSgnbGlzdGVuaW5nJywgKCkgPT4gcmVzb2x2ZShzZXJ2ZXIpKTtcblx0XHRcdHNlcnZlci5vbmNlKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRzZXJ2ZXIubGlzdGVuKHBpcGVQYXRoKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRlYnVnQWRhcHRlciA9IG5ldyBOYW1lZFBpcGVEZWJ1Z0FkYXB0ZXIoe1xuXHRcdFx0dHlwZTogJ3BpcGVTZXJ2ZXInLFxuXHRcdFx0cGF0aDogcGlwZVBhdGhcblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZGVidWdBZGFwdGVyLnN0YXJ0U2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuUmVzcG9uc2UgPSBhd2FpdCBzZW5kSW5pdGlhbGl6ZVJlcXVlc3QoZGVidWdBZGFwdGVyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5jb21tYW5kLCAnaW5pdGlhbGl6ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnJlcXVlc3Rfc2VxLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdWNjZXNzLCB0cnVlLCByZXNwb25zZS5tZXNzYWdlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGVidWdBZGFwdGVyLnN0b3BTZXNzaW9uKCk7XG5cdFx0XHRzZXJ2ZXIuY2xvc2UoKTtcblx0XHRcdGRlYnVnQWRhcHRlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KGBTdHJlYW1EZWJ1Z0FkYXB0ZXIgKFNvY2tldERlYnVnQWRhcHRlcikgY2FuIGluaXRpYWxpemUgYSBjb25uZWN0aW9uYCwgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgcm5kUG9ydCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAgKyA4MDAwKTtcblx0XHRjb25zdCBwb3J0ID0gYXdhaXQgcG9ydHMuZmluZEZyZWVQb3J0KHJuZFBvcnQsIDEwIC8qIHRyeSAxMCBwb3J0cyAqLywgMzAwMCAvKiB0cnkgdXAgdG8gMyBzZWNvbmRzICovLCA4NyAvKiBza2lwIDg3IHBvcnRzIGJldHdlZW4gYXR0ZW1wdHMgKi8pO1xuXHRcdGNvbnN0IHNlcnZlciA9IG5ldC5jcmVhdGVTZXJ2ZXIoc2VydmVyQ29ubmVjdGlvbikubGlzdGVuKHBvcnQpO1xuXHRcdGNvbnN0IGRlYnVnQWRhcHRlciA9IG5ldyBTb2NrZXREZWJ1Z0FkYXB0ZXIoe1xuXHRcdFx0dHlwZTogJ3NlcnZlcicsXG5cdFx0XHRwb3J0XG5cdFx0fSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGRlYnVnQWRhcHRlci5zdGFydFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlID0gYXdhaXQgc2VuZEluaXRpYWxpemVSZXF1ZXN0KGRlYnVnQWRhcHRlcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuY29tbWFuZCwgJ2luaXRpYWxpemUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5yZXF1ZXN0X3NlcSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2Uuc3VjY2VzcywgdHJ1ZSwgcmVzcG9uc2UubWVzc2FnZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRlYnVnQWRhcHRlci5zdG9wU2Vzc2lvbigpO1xuXHRcdFx0c2VydmVyLmNsb3NlKCk7XG5cdFx0XHRkZWJ1Z0FkYXB0ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFlBQVk7QUFDeEIsWUFBWSxTQUFTO0FBQ3JCLFlBQVksY0FBYztBQUMxQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxZQUFZO0FBQ3JCLFlBQVksV0FBVztBQUN2QixTQUFTLG9CQUFvQiw2QkFBaUQ7QUFDOUUsU0FBUywrQ0FBK0M7QUFHeEQsU0FBUyxzQkFBc0IsY0FBbUU7QUFDakcsU0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsaUJBQWEsWUFBWSxjQUFjLEVBQUUsV0FBVyxPQUFPLEdBQUcsQ0FBQyxXQUFXO0FBQ3pFLGNBQVEsTUFBTTtBQUFBLElBQ2YsR0FBRyxHQUFJO0FBQUEsRUFDUixDQUFDO0FBQ0Y7QUFFQSxTQUFTLGlCQUFpQixRQUFvQjtBQUM3QyxTQUFP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
