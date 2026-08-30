import assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostIpcChannelTransport } from "../../browser/agentHostIpcChannelTransport.js";
import { AhpJsonlLogger } from "../../common/ahpJsonlLogger.js";
class FakeChannel extends Disposable {
  constructor() {
    super(...arguments);
    this.frameEmitter = this._register(new Emitter());
    this.closeEmitter = this._register(new Emitter());
    this.calls = [];
    this.connectResult = Promise.resolve();
    this.sendResult = Promise.resolve();
  }
  call(command, arg) {
    this.calls.push({ command, arg });
    if (command === "connect") {
      return this.connectResult;
    }
    if (command === "send") {
      return this.sendResult;
    }
    return Promise.resolve(void 0);
  }
  listen(event) {
    if (event === "frame") {
      return this.frameEmitter.event;
    }
    if (event === "close") {
      return this.closeEmitter.event;
    }
    throw new Error(`Unknown event: ${event}`);
  }
}
suite("AgentHostIpcChannelTransport", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("round-trips frames in both directions", async () => {
    const channel = ds.add(new FakeChannel());
    const transport = ds.add(new AgentHostIpcChannelTransport(channel));
    const received = [];
    ds.add(transport.onMessage((msg) => received.push(msg)));
    let closed = 0;
    ds.add(transport.onClose(() => closed++));
    await transport.connect();
    assert.deepStrictEqual(channel.calls, [{ command: "connect", arg: void 0 }]);
    assert.strictEqual(transport.isOpen, true);
    channel.frameEmitter.fire('{"jsonrpc":"2.0","id":1,"result":{}}');
    assert.deepStrictEqual(received, [{ jsonrpc: "2.0", id: 1, result: {} }]);
    transport.send({ jsonrpc: "2.0", id: 2, result: {} });
    assert.deepStrictEqual(channel.calls.at(-1), {
      command: "send",
      arg: '{"jsonrpc":"2.0","id":2,"result":{}}'
    });
    channel.closeEmitter.fire();
    assert.strictEqual(closed, 1);
    assert.strictEqual(transport.isOpen, false);
  });
  test("drops send when transport is not open", async () => {
    const channel = ds.add(new FakeChannel());
    const transport = ds.add(new AgentHostIpcChannelTransport(channel));
    let closed = 0;
    ds.add(transport.onClose(() => closed++));
    transport.send({ jsonrpc: "2.0", id: 1, result: {} });
    assert.strictEqual(closed, 1);
    assert.strictEqual(channel.calls.find((c) => c.command === "send"), void 0);
  });
  test("logs real frames and redacts authentication tokens", async () => {
    const channel = ds.add(new FakeChannel());
    const fileService = ds.add(new FileService(new NullLogService()));
    ds.add(fileService.registerProvider("file", ds.add(new InMemoryFileSystemProvider())));
    const logger = ds.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "local-client", transport: "local" },
      fileService,
      new NullLogService()
    ));
    const transport = ds.add(new AgentHostIpcChannelTransport(channel, logger));
    await transport.connect();
    transport.send({ jsonrpc: "2.0", id: 1, method: "authenticate", params: { channel: "ahp-root://", resource: "https://example.com", token: "secret-token" } });
    channel.frameEmitter.fire('{"jsonrpc":"2.0","id":1,"result":{}}');
    await logger.flush();
    const entries = (await fileService.readFile(logger.resource)).value.toString().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.deepStrictEqual(entries.map((entry) => ({
      id: entry.id,
      method: entry.method,
      params: entry.params,
      dir: entry._ahpLog.dir,
      byteLength: entry._ahpLog.byteLength
    })), [
      { id: 1, method: "authenticate", params: { channel: "ahp-root://", resource: "https://example.com", token: "<redacted>" }, dir: "c2s", byteLength: 139 },
      { id: 1, method: void 0, params: void 0, dir: "s2c", byteLength: 36 }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxicm93c2VyXFxhZ2VudEhvc3RJcGNDaGFubmVsVHJhbnNwb3J0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJcGNDaGFubmVsVHJhbnNwb3J0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hZ2VudEhvc3RJcGNDaGFubmVsVHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IEFocEpzb25sTG9nZ2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FocEpzb25sTG9nZ2VyLmpzJztcblxuY2xhc3MgRmFrZUNoYW5uZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYW5uZWwge1xuXHRyZWFkb25seSBmcmFtZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBjbG9zZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgY2FsbHM6IHsgY29tbWFuZDogc3RyaW5nOyBhcmc6IHVua25vd24gfVtdID0gW107XG5cdGNvbm5lY3RSZXN1bHQ6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblx0c2VuZFJlc3VsdDogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdGNhbGw8VD4oY29tbWFuZDogc3RyaW5nLCBhcmc/OiB1bmtub3duKTogUHJvbWlzZTxUPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKHsgY29tbWFuZCwgYXJnIH0pO1xuXHRcdGlmIChjb21tYW5kID09PSAnY29ubmVjdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmNvbm5lY3RSZXN1bHQgYXMgUHJvbWlzZTxUPjtcblx0XHR9XG5cdFx0aWYgKGNvbW1hbmQgPT09ICdzZW5kJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZFJlc3VsdCBhcyBQcm9taXNlPFQ+O1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCBhcyBUKTtcblx0fVxuXG5cdGxpc3RlbjxUPihldmVudDogc3RyaW5nKTogRXZlbnQ8VD4ge1xuXHRcdGlmIChldmVudCA9PT0gJ2ZyYW1lJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZnJhbWVFbWl0dGVyLmV2ZW50IGFzIEV2ZW50PHVua25vd24+IGFzIEV2ZW50PFQ+O1xuXHRcdH1cblx0XHRpZiAoZXZlbnQgPT09ICdjbG9zZScpIHtcblx0XHRcdHJldHVybiB0aGlzLmNsb3NlRW1pdHRlci5ldmVudCBhcyBFdmVudDx1bmtub3duPiBhcyBFdmVudDxUPjtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGV2ZW50OiAke2V2ZW50fWApO1xuXHR9XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RJcGNDaGFubmVsVHJhbnNwb3J0JywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIGZyYW1lcyBpbiBib3RoIGRpcmVjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IGRzLmFkZChuZXcgRmFrZUNoYW5uZWwoKSk7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RJcGNDaGFubmVsVHJhbnNwb3J0KGNoYW5uZWwpKTtcblxuXHRcdGNvbnN0IHJlY2VpdmVkOiB1bmtub3duW10gPSBbXTtcblx0XHRkcy5hZGQodHJhbnNwb3J0Lm9uTWVzc2FnZShtc2cgPT4gcmVjZWl2ZWQucHVzaChtc2cpKSk7XG5cblx0XHRsZXQgY2xvc2VkID0gMDtcblx0XHRkcy5hZGQodHJhbnNwb3J0Lm9uQ2xvc2UoKCkgPT4gY2xvc2VkKyspKTtcblxuXHRcdGF3YWl0IHRyYW5zcG9ydC5jb25uZWN0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFubmVsLmNhbGxzLCBbeyBjb21tYW5kOiAnY29ubmVjdCcsIGFyZzogdW5kZWZpbmVkIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNwb3J0LmlzT3BlbiwgdHJ1ZSk7XG5cblx0XHQvLyBJbmJvdW5kIGZyYW1lIGZyb20gc2VydmVyXG5cdFx0Y2hhbm5lbC5mcmFtZUVtaXR0ZXIuZmlyZSgne1wianNvbnJwY1wiOlwiMi4wXCIsXCJpZFwiOjEsXCJyZXN1bHRcIjp7fX0nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY2VpdmVkLCBbeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDoge30gfV0pO1xuXG5cdFx0Ly8gT3V0Ym91bmQgc2VuZCBpcyBzZXJpYWxpemVkIHRvIGEgc3RyaW5nXG5cdFx0dHJhbnNwb3J0LnNlbmQoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDIsIHJlc3VsdDoge30gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFubmVsLmNhbGxzLmF0KC0xKSwge1xuXHRcdFx0Y29tbWFuZDogJ3NlbmQnLFxuXHRcdFx0YXJnOiAne1wianNvbnJwY1wiOlwiMi4wXCIsXCJpZFwiOjIsXCJyZXN1bHRcIjp7fX0nLFxuXHRcdH0pO1xuXG5cdFx0Ly8gU2VydmVyLWluaXRpYXRlZCBjbG9zZVxuXHRcdGNoYW5uZWwuY2xvc2VFbWl0dGVyLmZpcmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VkLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNwb3J0LmlzT3BlbiwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBzZW5kIHdoZW4gdHJhbnNwb3J0IGlzIG5vdCBvcGVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBkcy5hZGQobmV3IEZha2VDaGFubmVsKCkpO1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRzLmFkZChuZXcgQWdlbnRIb3N0SXBjQ2hhbm5lbFRyYW5zcG9ydChjaGFubmVsKSk7XG5cblx0XHRsZXQgY2xvc2VkID0gMDtcblx0XHRkcy5hZGQodHJhbnNwb3J0Lm9uQ2xvc2UoKCkgPT4gY2xvc2VkKyspKTtcblxuXHRcdC8vIHNlbmQgYmVmb3JlIGNvbm5lY3QgXHUyMTkyIGRyb3BzICsgZm9yY2VzIGNsb3NlIG9uY2Vcblx0XHR0cmFuc3BvcnQuc2VuZCh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgcmVzdWx0OiB7fSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VkLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbm5lbC5jYWxscy5maW5kKGMgPT4gYy5jb21tYW5kID09PSAnc2VuZCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2dzIHJlYWwgZnJhbWVzIGFuZCByZWRhY3RzIGF1dGhlbnRpY2F0aW9uIHRva2VucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGFubmVsID0gZHMuYWRkKG5ldyBGYWtlQ2hhbm5lbCgpKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCBsb2dnZXIgPSBkcy5hZGQobmV3IEFocEpzb25sTG9nZ2VyKFxuXHRcdFx0eyBsb2dzSG9tZTogVVJJLmZpbGUoJy9sb2dzJyksIGNvbm5lY3Rpb25JZDogJ2xvY2FsLWNsaWVudCcsIHRyYW5zcG9ydDogJ2xvY2FsJyB9LFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBkcy5hZGQobmV3IEFnZW50SG9zdElwY0NoYW5uZWxUcmFuc3BvcnQoY2hhbm5lbCwgbG9nZ2VyKSk7XG5cblx0XHRhd2FpdCB0cmFuc3BvcnQuY29ubmVjdCgpO1xuXHRcdHRyYW5zcG9ydC5zZW5kKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBtZXRob2Q6ICdhdXRoZW50aWNhdGUnLCBwYXJhbXM6IHsgY2hhbm5lbDogJ2FocC1yb290Oi8vJywgcmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tJywgdG9rZW46ICdzZWNyZXQtdG9rZW4nIH0gfSk7XG5cdFx0Y2hhbm5lbC5mcmFtZUVtaXR0ZXIuZmlyZSgne1wianNvbnJwY1wiOlwiMi4wXCIsXCJpZFwiOjEsXCJyZXN1bHRcIjp7fX0nKTtcblx0XHRhd2FpdCBsb2dnZXIuZmx1c2goKTtcblxuXHRcdGNvbnN0IGVudHJpZXMgPSAoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUobG9nZ2VyLnJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKS5zcGxpdCgnXFxuJykuZmlsdGVyKEJvb2xlYW4pLm1hcChsaW5lID0+IEpTT04ucGFyc2UobGluZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cmllcy5tYXAoZW50cnkgPT4gKHtcblx0XHRcdGlkOiBlbnRyeS5pZCxcblx0XHRcdG1ldGhvZDogZW50cnkubWV0aG9kLFxuXHRcdFx0cGFyYW1zOiBlbnRyeS5wYXJhbXMsXG5cdFx0XHRkaXI6IGVudHJ5Ll9haHBMb2cuZGlyLFxuXHRcdFx0Ynl0ZUxlbmd0aDogZW50cnkuX2FocExvZy5ieXRlTGVuZ3RoLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBpZDogMSwgbWV0aG9kOiAnYXV0aGVudGljYXRlJywgcGFyYW1zOiB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsIHRva2VuOiAnPHJlZGFjdGVkPicgfSwgZGlyOiAnYzJzJywgYnl0ZUxlbmd0aDogMTM5IH0sXG5cdFx0XHR7IGlkOiAxLCBtZXRob2Q6IHVuZGVmaW5lZCwgcGFyYW1zOiB1bmRlZmluZWQsIGRpcjogJ3MyYycsIGJ5dGVMZW5ndGg6IDM2IH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSxvQkFBb0IsV0FBK0I7QUFBQSxFQUF6RDtBQUFBO0FBQ0MsU0FBUyxlQUFlLEtBQUssVUFBVSxJQUFJLFFBQWdCLENBQUM7QUFDNUQsU0FBUyxlQUFlLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUMxRCxTQUFTLFFBQTZDLENBQUM7QUFDdkQseUJBQStCLFFBQVEsUUFBUTtBQUMvQyxzQkFBNEIsUUFBUSxRQUFRO0FBQUE7QUFBQSxFQUU1QyxLQUFRLFNBQWlCLEtBQTJCO0FBQ25ELFNBQUssTUFBTSxLQUFLLEVBQUUsU0FBUyxJQUFJLENBQUM7QUFDaEMsUUFBSSxZQUFZLFdBQVc7QUFDMUIsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFFBQUksWUFBWSxRQUFRO0FBQ3ZCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxXQUFPLFFBQVEsUUFBUSxNQUFjO0FBQUEsRUFDdEM7QUFBQSxFQUVBLE9BQVUsT0FBeUI7QUFDbEMsUUFBSSxVQUFVLFNBQVM7QUFDdEIsYUFBTyxLQUFLLGFBQWE7QUFBQSxJQUMxQjtBQUNBLFFBQUksVUFBVSxTQUFTO0FBQ3RCLGFBQU8sS0FBSyxhQUFhO0FBQUEsSUFDMUI7QUFDQSxVQUFNLElBQUksTUFBTSxrQkFB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
