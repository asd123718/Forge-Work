import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../test/common/utils.js";
import { request } from "../../common/requestImpl.js";
import { streamToBuffer } from "../../../../common/buffer.js";
import { runWithFakedTimers } from "../../../../test/common/timeTravelScheduler.js";
suite("Request", () => {
  let port;
  let server;
  setup(async () => {
    const http = await import("http");
    port = await new Promise((resolvePort, rejectPort) => {
      server = http.createServer((req, res) => {
        if (req.url === "/noreply") {
          return;
        }
        res.setHeader("Content-Type", "application/json");
        if (req.headers["echo-header"]) {
          res.setHeader("echo-header", req.headers["echo-header"]);
        }
        const data = [];
        req.on("data", (chunk) => data.push(chunk));
        req.on("end", () => {
          res.end(JSON.stringify({
            method: req.method,
            url: req.url,
            data: Buffer.concat(data).toString()
          }));
        });
      }).listen(0, "127.0.0.1", () => {
        const address = server.address();
        resolvePort(address.port);
      }).on("error", (err) => {
        rejectPort(err);
      });
    });
  });
  teardown(async () => {
    await new Promise((resolve, reject) => {
      server.closeAllConnections();
      server.close((err) => err ? reject(err) : resolve());
    });
  });
  test("GET", async () => {
    const context = await request({
      url: `http://127.0.0.1:${port}`,
      headers: {
        "echo-header": "echo-value"
      },
      callSite: "request.test.GET"
    }, CancellationToken.None);
    assert.strictEqual(context.res.statusCode, 200);
    assert.strictEqual(context.res.headers["content-type"], "application/json");
    assert.strictEqual(context.res.headers["echo-header"], "echo-value");
    const buffer = await streamToBuffer(context.stream);
    const body = JSON.parse(buffer.toString());
    assert.strictEqual(body.method, "GET");
    assert.strictEqual(body.url, "/");
  });
  test("POST", async () => {
    const context = await request({
      type: "POST",
      url: `http://127.0.0.1:${port}/postpath`,
      data: "Some data",
      callSite: "request.test.POST"
    }, CancellationToken.None);
    assert.strictEqual(context.res.statusCode, 200);
    assert.strictEqual(context.res.headers["content-type"], "application/json");
    const buffer = await streamToBuffer(context.stream);
    const body = JSON.parse(buffer.toString());
    assert.strictEqual(body.method, "POST");
    assert.strictEqual(body.url, "/postpath");
    assert.strictEqual(body.data, "Some data");
  });
  test("timeout", async () => {
    return runWithFakedTimers({}, async () => {
      try {
        await request({
          type: "GET",
          url: `http://127.0.0.1:${port}/noreply`,
          timeout: 123,
          callSite: "request.test.timeout"
        }, CancellationToken.None);
        assert.fail("Should fail with timeout");
      } catch (err) {
        assert.strictEqual(err.message, "Fetch timeout: 123ms");
      }
    });
  });
  test("cancel", async () => {
    return runWithFakedTimers({}, async () => {
      try {
        const source = new CancellationTokenSource();
        const res = request({
          type: "GET",
          url: `http://127.0.0.1:${port}/noreply`,
          callSite: "request.test.cancel"
        }, source.token);
        await new Promise((resolve) => setTimeout(resolve, 100));
        source.cancel();
        await res;
        assert.fail("Should fail with cancellation");
      } catch (err) {
        assert.strictEqual(err.message, "Canceled");
      }
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xccmVxdWVzdFxcdGVzdFxcZWxlY3Ryb24tbWFpblxccmVxdWVzdC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgQWRkcmVzc0luZm8gfSBmcm9tICduZXQnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyByZXF1ZXN0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlcXVlc3RJbXBsLmpzJztcbmltcG9ydCB7IHN0cmVhbVRvQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcblxuXG5zdWl0ZSgnUmVxdWVzdCcsICgpID0+IHtcblxuXHRsZXQgcG9ydDogbnVtYmVyO1xuXHRsZXQgc2VydmVyOiBodHRwLlNlcnZlcjtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaHR0cCA9IGF3YWl0IGltcG9ydCgnaHR0cCcpO1xuXHRcdHBvcnQgPSBhd2FpdCBuZXcgUHJvbWlzZTxudW1iZXI+KChyZXNvbHZlUG9ydCwgcmVqZWN0UG9ydCkgPT4ge1xuXHRcdFx0c2VydmVyID0gaHR0cC5jcmVhdGVTZXJ2ZXIoKHJlcSwgcmVzKSA9PiB7XG5cdFx0XHRcdGlmIChyZXEudXJsID09PSAnL25vcmVwbHknKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBuZXZlciByZXNwb25kXG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblx0XHRcdFx0aWYgKHJlcS5oZWFkZXJzWydlY2hvLWhlYWRlciddKSB7XG5cdFx0XHRcdFx0cmVzLnNldEhlYWRlcignZWNoby1oZWFkZXInLCByZXEuaGVhZGVyc1snZWNoby1oZWFkZXInXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZGF0YTogQnVmZmVyW10gPSBbXTtcblx0XHRcdFx0cmVxLm9uKCdkYXRhJywgY2h1bmsgPT4gZGF0YS5wdXNoKGNodW5rKSk7XG5cdFx0XHRcdHJlcS5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRcdHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdFx0bWV0aG9kOiByZXEubWV0aG9kLFxuXHRcdFx0XHRcdFx0dXJsOiByZXEudXJsLFxuXHRcdFx0XHRcdFx0ZGF0YTogQnVmZmVyLmNvbmNhdChkYXRhKS50b1N0cmluZygpXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pLmxpc3RlbigwLCAnMTI3LjAuMC4xJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhZGRyZXNzID0gc2VydmVyLmFkZHJlc3MoKTtcblx0XHRcdFx0cmVzb2x2ZVBvcnQoKGFkZHJlc3MgYXMgQWRkcmVzc0luZm8pLnBvcnQpO1xuXHRcdFx0fSkub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdFx0cmVqZWN0UG9ydChlcnIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRzZXJ2ZXIuY2xvc2VBbGxDb25uZWN0aW9ucygpO1xuXHRcdFx0c2VydmVyLmNsb3NlKGVyciA9PiBlcnIgPyByZWplY3QoZXJyKSA6IHJlc29sdmUoKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0dFVCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgcmVxdWVzdCh7XG5cdFx0XHR1cmw6IGBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH1gLFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHQnZWNoby1oZWFkZXInOiAnZWNoby12YWx1ZSdcblx0XHRcdH0sXG5cdFx0XHRjYWxsU2l0ZTogJ3JlcXVlc3QudGVzdC5HRVQnXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQucmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0LnJlcy5oZWFkZXJzWydlY2hvLWhlYWRlciddLCAnZWNoby12YWx1ZScpO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHN0cmVhbVRvQnVmZmVyKGNvbnRleHQuc3RyZWFtKTtcblx0XHRjb25zdCBib2R5ID0gSlNPTi5wYXJzZShidWZmZXIudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkubWV0aG9kLCAnR0VUJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkudXJsLCAnLycpO1xuXHR9KTtcblxuXHR0ZXN0KCdQT1NUJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCByZXF1ZXN0KHtcblx0XHRcdHR5cGU6ICdQT1NUJyxcblx0XHRcdHVybDogYGh0dHA6Ly8xMjcuMC4wLjE6JHtwb3J0fS9wb3N0cGF0aGAsXG5cdFx0XHRkYXRhOiAnU29tZSBkYXRhJyxcblx0XHRcdGNhbGxTaXRlOiAncmVxdWVzdC50ZXN0LlBPU1QnXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQucmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHN0cmVhbVRvQnVmZmVyKGNvbnRleHQuc3RyZWFtKTtcblx0XHRjb25zdCBib2R5ID0gSlNPTi5wYXJzZShidWZmZXIudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkubWV0aG9kLCAnUE9TVCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LnVybCwgJy9wb3N0cGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmRhdGEsICdTb21lIGRhdGEnKTtcblx0fSk7XG5cblx0dGVzdCgndGltZW91dCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCByZXF1ZXN0KHtcblx0XHRcdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdFx0XHR1cmw6IGBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH0vbm9yZXBseWAsXG5cdFx0XHRcdFx0dGltZW91dDogMTIzLFxuXHRcdFx0XHRcdGNhbGxTaXRlOiAncmVxdWVzdC50ZXN0LnRpbWVvdXQnXG5cdFx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGZhaWwgd2l0aCB0aW1lb3V0Jyk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVyci5tZXNzYWdlLCAnRmV0Y2ggdGltZW91dDogMTIzbXMnKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FuY2VsJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0XHRjb25zdCByZXMgPSByZXF1ZXN0KHtcblx0XHRcdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdFx0XHR1cmw6IGBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH0vbm9yZXBseWAsXG5cdFx0XHRcdFx0Y2FsbFNpdGU6ICdyZXF1ZXN0LnRlc3QuY2FuY2VsJ1xuXHRcdFx0XHR9LCBzb3VyY2UudG9rZW4pO1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG5cdFx0XHRcdHNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdFx0YXdhaXQgcmVzO1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGZhaWwgd2l0aCBjYW5jZWxsYXRpb24nKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyLm1lc3NhZ2UsICdDYW5jZWxlZCcpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFHbkMsTUFBTSxXQUFXLE1BQU07QUFFdEIsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLFlBQVk7QUFDakIsVUFBTSxPQUFPLE1BQU0sT0FBTyxNQUFNO0FBQ2hDLFdBQU8sTUFBTSxJQUFJLFFBQWdCLENBQUMsYUFBYSxlQUFlO0FBQzdELGVBQVMsS0FBSyxhQUFhLENBQUMsS0FBSyxRQUFRO0FBQ3hDLFlBQUksSUFBSSxRQUFRLFlBQVk7QUFDM0I7QUFBQSxRQUNEO0FBQ0EsWUFBSSxVQUFVLGdCQUFnQixrQkFBa0I7QUFDaEQsWUFBSSxJQUFJLFFBQVEsYUFBYSxHQUFHO0FBQy9CLGNBQUksVUFBVSxlQUFlLElBQUksUUFBUSxhQUFhLENBQUM7QUFBQSxRQUN4RDtBQUNBLGNBQU0sT0FBaUIsQ0FBQztBQUN4QixZQUFJLEdBQUcsUUFBUSxXQUFTLEtBQUssS0FBSyxLQUFLLENBQUM7QUFDeEMsWUFBSSxHQUFHLE9BQU8sTUFBTTtBQUNuQixjQUFJLElBQUksS0FBSyxVQUFVO0FBQUEsWUFDdEIsUUFBUSxJQUFJO0FBQUEsWUFDWixLQUFLLElBQUk7QUFBQSxZQUNULE1BQU0sT0FBTyxPQUFPLElBQUksRUFBRSxTQUFTO0FBQUEsVUFDcEMsQ0FBQyxDQUFDO0FBQUEsUUFDSCxDQUFDO0FBQUEsTUFDRixDQUFDLEVBQUUsT0FBTyxHQUFHLGFBQWEsTUFBTTtBQUMvQixjQUFNLFVBQVUs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
