import assert from "assert";
import * as net from "net";
import { Event } from "../../../../base/common/event.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { connectionTokenQueryName } from "../../../../base/common/network.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { WebSocketProtocolServer } from "../../node/webSocketTransport.js";
suite("WebSocketProtocolServer", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("validates the decoded connection token", async () => {
    const validatedTokens = [];
    const server = store.add(await WebSocketProtocolServer.create({
      port: 0,
      connectionTokenValidate: (token) => {
        validatedTokens.push(token);
        return token === "valid token";
      }
    }, new NullLogService()));
    await server.whenListening;
    const transport = Event.toPromise(server.onConnection);
    const socket = await connect(`ws://127.0.0.1:${server.boundPort}/?${connectionTokenQueryName}=valid+token`);
    store.add(toDisposable(() => socket.close()));
    store.add(await transport);
    assert.deepStrictEqual(validatedTokens, ["valid token"]);
  });
  test("rejects a malformed request URL without stopping the server", async () => {
    const server = store.add(await WebSocketProtocolServer.create({
      port: 0,
      connectionTokenValidate: (token) => token === "valid"
    }, new NullLogService()));
    await server.whenListening;
    const response = await sendUpgradeRequest(server.boundPort, "http://[invalid");
    const transport = Event.toPromise(server.onConnection);
    const socket = await connect(`ws://127.0.0.1:${server.boundPort}/?${connectionTokenQueryName}=valid`);
    store.add(toDisposable(() => socket.close()));
    store.add(await transport);
    assert.strictEqual(response.split("\r\n", 1)[0], "HTTP/1.1 400 Bad Request");
  });
});
async function connect(url) {
  const { WebSocket } = await import("ws");
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}
function sendUpgradeRequest(port, requestTarget) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.end([
        `GET ${requestTarget} HTTP/1.1`,
        "Host: localhost",
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "",
        ""
      ].join("\r\n"));
    });
    const chunks = [];
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString()));
    socket.on("error", reject);
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFx3ZWJTb2NrZXRUcmFuc3BvcnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IHR5cGUgKiBhcyB3c1R5cGVzIGZyb20gJ3dzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbm5lY3Rpb25Ub2tlblF1ZXJ5TmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFdlYlNvY2tldFByb3RvY29sU2VydmVyIH0gZnJvbSAnLi4vLi4vbm9kZS93ZWJTb2NrZXRUcmFuc3BvcnQuanMnO1xuXG5zdWl0ZSgnV2ViU29ja2V0UHJvdG9jb2xTZXJ2ZXInLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndmFsaWRhdGVzIHRoZSBkZWNvZGVkIGNvbm5lY3Rpb24gdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdmFsaWRhdGVkVG9rZW5zOiB1bmtub3duW10gPSBbXTtcblx0XHRjb25zdCBzZXJ2ZXIgPSBzdG9yZS5hZGQoYXdhaXQgV2ViU29ja2V0UHJvdG9jb2xTZXJ2ZXIuY3JlYXRlKHtcblx0XHRcdHBvcnQ6IDAsXG5cdFx0XHRjb25uZWN0aW9uVG9rZW5WYWxpZGF0ZTogdG9rZW4gPT4ge1xuXHRcdFx0XHR2YWxpZGF0ZWRUb2tlbnMucHVzaCh0b2tlbik7XG5cdFx0XHRcdHJldHVybiB0b2tlbiA9PT0gJ3ZhbGlkIHRva2VuJztcblx0XHRcdH0sXG5cdFx0fSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBzZXJ2ZXIud2hlbkxpc3RlbmluZztcblxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IEV2ZW50LnRvUHJvbWlzZShzZXJ2ZXIub25Db25uZWN0aW9uKTtcblx0XHRjb25zdCBzb2NrZXQgPSBhd2FpdCBjb25uZWN0KGB3czovLzEyNy4wLjAuMToke3NlcnZlci5ib3VuZFBvcnR9Lz8ke2Nvbm5lY3Rpb25Ub2tlblF1ZXJ5TmFtZX09dmFsaWQrdG9rZW5gKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNvY2tldC5jbG9zZSgpKSk7XG5cdFx0c3RvcmUuYWRkKGF3YWl0IHRyYW5zcG9ydCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbGlkYXRlZFRva2VucywgWyd2YWxpZCB0b2tlbiddKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBhIG1hbGZvcm1lZCByZXF1ZXN0IFVSTCB3aXRob3V0IHN0b3BwaW5nIHRoZSBzZXJ2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gc3RvcmUuYWRkKGF3YWl0IFdlYlNvY2tldFByb3RvY29sU2VydmVyLmNyZWF0ZSh7XG5cdFx0XHRwb3J0OiAwLFxuXHRcdFx0Y29ubmVjdGlvblRva2VuVmFsaWRhdGU6IHRva2VuID0+IHRva2VuID09PSAndmFsaWQnLFxuXHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgc2VydmVyLndoZW5MaXN0ZW5pbmc7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlbmRVcGdyYWRlUmVxdWVzdChzZXJ2ZXIuYm91bmRQb3J0ISwgJ2h0dHA6Ly9baW52YWxpZCcpO1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IEV2ZW50LnRvUHJvbWlzZShzZXJ2ZXIub25Db25uZWN0aW9uKTtcblx0XHRjb25zdCBzb2NrZXQgPSBhd2FpdCBjb25uZWN0KGB3czovLzEyNy4wLjAuMToke3NlcnZlci5ib3VuZFBvcnR9Lz8ke2Nvbm5lY3Rpb25Ub2tlblF1ZXJ5TmFtZX09dmFsaWRgKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNvY2tldC5jbG9zZSgpKSk7XG5cdFx0c3RvcmUuYWRkKGF3YWl0IHRyYW5zcG9ydCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2Uuc3BsaXQoJ1xcclxcbicsIDEpWzBdLCAnSFRUUC8xLjEgNDAwIEJhZCBSZXF1ZXN0Jyk7XG5cdH0pO1xufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGNvbm5lY3QodXJsOiBzdHJpbmcpOiBQcm9taXNlPHdzVHlwZXMuV2ViU29ja2V0PiB7XG5cdGNvbnN0IHsgV2ViU29ja2V0IH0gPSBhd2FpdCBpbXBvcnQoJ3dzJyk7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3Qgc29ja2V0ID0gbmV3IFdlYlNvY2tldCh1cmwpO1xuXHRcdHNvY2tldC5vbmNlKCdvcGVuJywgKCkgPT4gcmVzb2x2ZShzb2NrZXQpKTtcblx0XHRzb2NrZXQub25jZSgnZXJyb3InLCByZWplY3QpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gc2VuZFVwZ3JhZGVSZXF1ZXN0KHBvcnQ6IG51bWJlciwgcmVxdWVzdFRhcmdldDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBzb2NrZXQgPSBuZXQuY3JlYXRlQ29ubmVjdGlvbih7IGhvc3Q6ICcxMjcuMC4wLjEnLCBwb3J0IH0sICgpID0+IHtcblx0XHRcdHNvY2tldC5lbmQoW1xuXHRcdFx0XHRgR0VUICR7cmVxdWVzdFRhcmdldH0gSFRUUC8xLjFgLFxuXHRcdFx0XHQnSG9zdDogbG9jYWxob3N0Jyxcblx0XHRcdFx0J0Nvbm5lY3Rpb246IFVwZ3JhZGUnLFxuXHRcdFx0XHQnVXBncmFkZTogd2Vic29ja2V0Jyxcblx0XHRcdFx0J1NlYy1XZWJTb2NrZXQtVmVyc2lvbjogMTMnLFxuXHRcdFx0XHQnU2VjLVdlYlNvY2tldC1LZXk6IGRHaGxJSE5oYlhCc1pTQnViMjVqWlE9PScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdF0uam9pbignXFxyXFxuJykpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRzb2NrZXQub24oJ2RhdGEnLCBjaHVuayA9PiBjaHVua3MucHVzaChCdWZmZXIuZnJvbShjaHVuaykpKTtcblx0XHRzb2NrZXQub24oJ2VuZCcsICgpID0+IHJlc29sdmUoQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCkpKTtcblx0XHRzb2NrZXQub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxTQUFTO0FBRXJCLFNBQVMsYUFBYTtBQUN0QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUV4QyxNQUFNLDJCQUEyQixNQUFNO0FBQ3RDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSywwQ0FBMEMsWUFBWTtBQUMxRCxVQUFNLGtCQUE2QixDQUFDO0FBQ3BDLFVBQU0sU0FBUyxNQUFNLElBQUksTUFBTSx3QkFBd0IsT0FBTztBQUFBLE1BQzdELE1BQU07QUFBQSxNQUNOLHlCQUF5QixXQUFTO0FBQ2pDLHdCQUFnQixLQUFLLEtBQUs7QUFDMUIsZUFBTyxVQUFVO0FBQUEsTUFDbEI7QUFBQSxJQUNELEdBQUcsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUN4QixVQUFNLE9BQU87QUFFYixVQUFNLFlBQVksTUFBTSxVQUFVLE9BQU8sWUFBWTtBQUNyRCxVQUFNLFNBQVMsTUFBTSxRQUFRLGtCQUFrQixPQUFPLFNBQVMsS0FBSyx3QkFBd0IsY0FBYztBQUMxRyxVQUFNLElBQUksYUFBYSxNQUFNLE9BQU8sTUFBTSxDQUFDLENBQUM7QUFDNUMsVUFBTSxJQUFJLE1BQU0sU0FBUztBQUV6QixXQUFPLGdCQUFnQixpQkFBaUIsQ0FBQyxhQUFhLENBQUM7QUFBQSxFQUN4RCxDQUFDO0FBRUQsT0FBSywrREFBK0QsWUFBWTtBQUMvRSxVQUFNLFNBQVMsTUFBTSxJQUFJLE1BQU0sd0JBQXdCLE9BQU87QUFBQSxNQUM3RCxNQUFNO0FBQUEsTUFDTix5QkFBeUIsV0FBUyxVQUFVO0FBQUEsSUFDN0MsR0FBRyxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQ3hCLFVBQU0sT0FBTztBQUViLFVBQU0sV0FBVyxNQUFNLG1CQUFtQixPQUFPLFdBQVksaUJBQWlCO0FBQzlFLFVBQU0sWUFBWSxNQUFNLFVBQVUsT0FBTyxZQUFZO0FBQ3JELFVBQU0sU0FBUyxNQUFNLFFBQVEsa0JBQWtCLE9BQU8sU0FBUyxLQUFLLHdCQUF3QixRQUFRO0FBQ3BHLFVBQU0sSUFBSSxhQUFhLE1BQU0sT0FBTyxNQUFNLENBQUMsQ0FBQztBQUM1QyxVQUFNLElBQUksTUFBTSxTQUFTO0FBRXpCLFdBQU8sWUFBWSxTQUFTLE1BQU0sUUFBUSxDQUFDLEVBQUUsQ0FBQyxHQUFHLDBCQUEwQjtBQUFBLEVBQzVFLENBQUM7QUFDRixDQUFDO0FBRUQsZUFBZSxRQUFRLEtBQXlDO0FBQy9ELFFBQU0sRUFBRSxVQUFVLElBQUksTUFBTSxPQUFPLElBQUk7QUFDdkMsU0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsVUFBTSxTQUFTLElBQUksVUFBVSxHQUFHO0FBQ2hDLFdBQU8sS0FBSyxRQUFRLE1BQU0sUUFBUSxNQUFNLENBQUM7QUFDekMsV0FBTyxLQUFLLFNBQVMsTUFBTTtBQUFBLEVBQzVCLENBQUM7QUFDRjtBQUVBLFNBQVMsbUJBQW1CLE1BQWMsZUFBd0M7QUFDakYsU0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsVUFBTSxTQUFTLElBQUksaUJBQWlCLEVBQUUsTUFBTSxhQUFhLEtBQUssR0FBRyxNQUFNO0FBQ3RFLGFBQU8sSUFBSTtBQUFBLFFBQ1YsT0FBTyxhQUFhO0FBQUEsUUFDcEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxNQUFNLENBQUM7QUFBQSxJQUNmLENBQUM7QUFDRCxVQUFNLFNBQW1CLENBQUM7QUFDMUIsV0FBTyxHQUFHLFFBQVEsV0FBUyxPQUFPLEtBQUssT0FBTyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQzFELFdBQU8sR0FBRyxPQUFPLE1BQU0sUUFBUSxPQUFPLE9BQU8sTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQ2hFLFdBQU8sR0FBRyxTQUFTLE1BQU07QUFBQSxFQUMxQixDQUFDO0FBQ0Y7IiwKICAibmFtZXMiOiBbXQp9Cg==
