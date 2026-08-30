import assert from "assert";
import { Client as MessagePortClient } from "../../browser/ipc.mp.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../test/common/utils.js";
suite("IPC, MessagePorts", () => {
  test("message passing", async () => {
    const { port1, port2 } = new MessageChannel();
    const client1 = new MessagePortClient(port1, "client1");
    const client2 = new MessagePortClient(port2, "client2");
    client1.registerChannel("client1", {
      call(_, command, arg, cancellationToken) {
        switch (command) {
          case "testMethodClient1":
            return Promise.resolve("success1");
          default:
            return Promise.reject(new Error("not implemented"));
        }
      },
      listen(_, event, arg) {
        switch (event) {
          default:
            throw new Error("not implemented");
        }
      }
    });
    client2.registerChannel("client2", {
      call(_, command, arg, cancellationToken) {
        switch (command) {
          case "testMethodClient2":
            return Promise.resolve("success2");
          default:
            return Promise.reject(new Error("not implemented"));
        }
      },
      listen(_, event, arg) {
        switch (event) {
          default:
            throw new Error("not implemented");
        }
      }
    });
    const channelClient1 = client2.getChannel("client1");
    assert.strictEqual(await channelClient1.call("testMethodClient1"), "success1");
    const channelClient2 = client1.getChannel("client2");
    assert.strictEqual(await channelClient2.call("testMethodClient2"), "success2");
    client1.dispose();
    client2.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xcaXBjXFx0ZXN0XFxicm93c2VyXFxpcGMubXAudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDbGllbnQgYXMgTWVzc2FnZVBvcnRDbGllbnQgfSBmcm9tICcuLi8uLi9icm93c2VyL2lwYy5tcC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdJUEMsIE1lc3NhZ2VQb3J0cycsICgpID0+IHtcblxuXHR0ZXN0KCdtZXNzYWdlIHBhc3NpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwb3J0MSwgcG9ydDIgfSA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuXG5cdFx0Y29uc3QgY2xpZW50MSA9IG5ldyBNZXNzYWdlUG9ydENsaWVudChwb3J0MSwgJ2NsaWVudDEnKTtcblx0XHRjb25zdCBjbGllbnQyID0gbmV3IE1lc3NhZ2VQb3J0Q2xpZW50KHBvcnQyLCAnY2xpZW50MicpO1xuXG5cdFx0Y2xpZW50MS5yZWdpc3RlckNoYW5uZWwoJ2NsaWVudDEnLCB7XG5cdFx0XHRjYWxsKF86IHVua25vd24sIGNvbW1hbmQ6IHN0cmluZywgYXJnOiBhbnksIGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8YW55PiB7XG5cdFx0XHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0XHRcdGNhc2UgJ3Rlc3RNZXRob2RDbGllbnQxJzogcmV0dXJuIFByb21pc2UucmVzb2x2ZSgnc3VjY2VzczEnKTtcblx0XHRcdFx0XHRkZWZhdWx0OiByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdGxpc3RlbihfOiB1bmtub3duLCBldmVudDogc3RyaW5nLCBhcmc/OiBhbnkpOiBFdmVudDxhbnk+IHtcblx0XHRcdFx0c3dpdGNoIChldmVudCkge1xuXHRcdFx0XHRcdGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNsaWVudDIucmVnaXN0ZXJDaGFubmVsKCdjbGllbnQyJywge1xuXHRcdFx0Y2FsbChfOiB1bmtub3duLCBjb21tYW5kOiBzdHJpbmcsIGFyZzogYW55LCBjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGFueT4ge1xuXHRcdFx0XHRzd2l0Y2ggKGNvbW1hbmQpIHtcblx0XHRcdFx0XHRjYXNlICd0ZXN0TWV0aG9kQ2xpZW50Mic6IHJldHVybiBQcm9taXNlLnJlc29sdmUoJ3N1Y2Nlc3MyJyk7XG5cdFx0XHRcdFx0ZGVmYXVsdDogcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHRsaXN0ZW4oXzogdW5rbm93biwgZXZlbnQ6IHN0cmluZywgYXJnPzogYW55KTogRXZlbnQ8YW55PiB7XG5cdFx0XHRcdHN3aXRjaCAoZXZlbnQpIHtcblx0XHRcdFx0XHRkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjaGFubmVsQ2xpZW50MSA9IGNsaWVudDIuZ2V0Q2hhbm5lbCgnY2xpZW50MScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBjaGFubmVsQ2xpZW50MS5jYWxsKCd0ZXN0TWV0aG9kQ2xpZW50MScpLCAnc3VjY2VzczEnKTtcblxuXHRcdGNvbnN0IGNoYW5uZWxDbGllbnQyID0gY2xpZW50MS5nZXRDaGFubmVsKCdjbGllbnQyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNoYW5uZWxDbGllbnQyLmNhbGwoJ3Rlc3RNZXRob2RDbGllbnQyJyksICdzdWNjZXNzMicpO1xuXG5cdFx0Y2xpZW50MS5kaXNwb3NlKCk7XG5cdFx0Y2xpZW50Mi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFHbkIsU0FBUyxVQUFVLHlCQUF5QjtBQUM1QyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLHFCQUFxQixNQUFNO0FBRWhDLE9BQUssbUJBQW1CLFlBQVk7QUFDbkMsVUFBTSxFQUFFLE9BQU8sTUFBTSxJQUFJLElBQUksZUFBZTtBQUU1QyxVQUFNLFVBQVUsSUFBSSxrQkFBa0IsT0FBTyxTQUFTO0FBQ3RELFVBQU0sVUFBVSxJQUFJLGtCQUFrQixPQUFPLFNBQVM7QUFFdEQsWUFBUSxnQkFBZ0IsV0FBVztBQUFBLE1BQ2xDLEtBQUssR0FBWSxTQUFpQixLQUFVLG1CQUFvRDtBQUMvRixnQkFBUSxTQUFTO0FBQUEsVUFDaEIsS0FBSztBQUFxQixtQkFBTyxRQUFRLFFBQVEsVUFBVTtBQUFBLFVBQzNEO0FBQVMsbUJBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxpQkFBaUIsQ0FBQztBQUFBLFFBQzVEO0FBQUEsTUFDRDtBQUFBLE1BRUEsT0FBTyxHQUFZLE9BQWUsS0FBdUI7QUFDeEQsZ0JBQVEsT0FBTztBQUFBLFVBQ2Q7QUFBUyxrQkFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsUUFDM0M7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsWUFBUSxnQkFBZ0IsV0FBVztBQUFBLE1BQ2xDLEtBQUssR0FBWSxTQUFpQixLQUFVLG1CQUFvRDtBQUMvRixnQkFBUSxTQUFTO0FBQUEsVUFDaEIsS0FBSztBQUFxQixtQkFBTyxRQUFRLFFBQVEsVUFBVTtBQUFBLFVBQzNEO0FBQVMsbUJBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxpQkFBaUIsQ0FBQztBQUFBLFFBQzVEO0FBQUEsTUFDRDtBQUFBLE1BRUEsT0FBTyxHQUFZLE9BQWUsS0FBdUI7QUFDeEQsZ0JBQVEsT0FBTztBQUFBLFVBQ2Q7QUFBUyxrQkFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsUUFDM0M7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxpQkFBaUIsUUFBUSxXQUFXLFNBQVM7QUFDbkQsV0FBTyxZQUFZLE1BQU0sZUFBZSxLQUFLLG1CQUFtQixHQUFHLFVBQVU7QUFFN0UsVUFBTSxpQkFBaUIsUUFBUSxXQUFXLFNBQVM7QUFDbkQsV0FBTyxZQUFZLE1BQU0sZUFBZSxLQUFLLG1CQUFtQixHQUFHLFVBQVU7QUFFN0UsWUFBUSxRQUFRO0FBQ2hCLFlBQVEsUUFBUTtBQUFBLEVBQ2pCLENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
