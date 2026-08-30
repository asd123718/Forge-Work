import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ChatSubmitRequestHandlerService } from "../../browser/chatSubmitRequestHandlerService.js";
suite("ChatSubmitRequestHandlerService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("returns the first handler result", async () => {
    const service = new ChatSubmitRequestHandlerService();
    const calls = [];
    store.add(service.register({
      id: "first",
      async tryHandle() {
        calls.push("first");
        return false;
      }
    }));
    store.add(service.register({
      id: "second",
      async tryHandle() {
        calls.push("second");
        return true;
      }
    }));
    store.add(service.register({
      id: "third",
      async tryHandle() {
        calls.push("third");
        return true;
      }
    }));
    const result = await service.tryHandle({
      sessionResource: URI.parse("agent-host-copilotcli:/test"),
      input: "/yolo on"
    });
    assert.deepStrictEqual({ result, calls }, {
      result: true,
      calls: ["first", "second"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgdGhlIGZpcnN0IGhhbmRsZXIgcmVzdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSgpO1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyKHtcblx0XHRcdGlkOiAnZmlyc3QnLFxuXHRcdFx0YXN5bmMgdHJ5SGFuZGxlKCkge1xuXHRcdFx0XHRjYWxscy5wdXNoKCdmaXJzdCcpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3Rlcih7XG5cdFx0XHRpZDogJ3NlY29uZCcsXG5cdFx0XHRhc3luYyB0cnlIYW5kbGUoKSB7XG5cdFx0XHRcdGNhbGxzLnB1c2goJ3NlY29uZCcpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyKHtcblx0XHRcdGlkOiAndGhpcmQnLFxuXHRcdFx0YXN5bmMgdHJ5SGFuZGxlKCkge1xuXHRcdFx0XHRjYWxscy5wdXNoKCd0aGlyZCcpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS50cnlIYW5kbGUoe1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovdGVzdCcpLFxuXHRcdFx0aW5wdXQ6ICcveW9sbyBvbicsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCBjYWxscyB9LCB7XG5cdFx0XHRyZXN1bHQ6IHRydWUsXG5cdFx0XHRjYWxsczogWydmaXJzdCcsICdzZWNvbmQnXSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1Q0FBdUM7QUFFaEQsTUFBTSxtQ0FBbUMsTUFBTTtBQUU5QyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE9BQUssb0NBQW9DLFlBQVk7QUFDcEQsVUFBTSxVQUFVLElBQUksZ0NBQWdDO0FBQ3BELFVBQU0sUUFBa0IsQ0FBQztBQUN6QixVQUFNLElBQUksUUFBUSxTQUFTO0FBQUEsTUFDMUIsSUFBSTtBQUFBLE1BQ0osTUFBTSxZQUFZO0FBQ2pCLGNBQU0sS0FBSyxPQUFPO0FBQ2xCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixVQUFNLElBQUksUUFBUSxTQUFTO0FBQUEsTUFDMUIsSUFBSTtBQUFBLE1BQ0osTUFBTSxZQUFZO0FBQ2pCLGNBQU0sS0FBSyxRQUFRO0FBQ25CLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixVQUFNLElBQUksUUFBUSxTQUFTO0FBQUEsTUFDMUIsSUFBSTtBQUFBLE1BQ0osTUFBTSxZQUFZO0FBQ2pCLGNBQU0sS0FBSyxPQUFPO0FBQ2xCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFNBQVMsTUFBTSxRQUFRLFVBQVU7QUFBQSxNQUN0QyxpQkFBaUIsSUFBSSxNQUFNLDZCQUE2QjtBQUFBLE1BQ3hELE9BQU87QUFBQSxJQUNSLENBQUM7QUFFRCxXQUFPLGdCQUFnQixFQUFFLFFBQVEsTUFBTSxHQUFHO0FBQUEsTUFDekMsUUFBUTtBQUFBLE1BQ1IsT0FBTyxDQUFDLFNBQVMsUUFBUTtBQUFBLElBQzFCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
