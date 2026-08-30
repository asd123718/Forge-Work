import assert from "assert";
import { decodeBase64, encodeBase64, VSBuffer } from "../../../../../base/common/buffer.js";
import { Emitter } from "../../../../../base/common/event.js";
import { mockObject } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MemoryRangeType } from "../../common/debug.js";
import { MemoryRegion } from "../../common/debugModel.js";
suite("Debug - Memory", () => {
  const dapResponseCommon = {
    command: "someCommand",
    type: "response",
    seq: 1,
    request_seq: 1,
    success: true
  };
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("MemoryRegion", () => {
    let memory;
    let unreadable;
    let invalidateMemoryEmitter;
    let session;
    let region;
    setup(() => {
      const memoryBuf = new Uint8Array(1024);
      for (let i = 0; i < memoryBuf.length; i++) {
        memoryBuf[i] = i;
      }
      memory = VSBuffer.wrap(memoryBuf);
      invalidateMemoryEmitter = new Emitter();
      unreadable = 0;
      session = mockObject()({
        onDidInvalidateMemory: invalidateMemoryEmitter.event
      });
      session.readMemory.callsFake((ref, fromOffset, count) => {
        const res = {
          ...dapResponseCommon,
          body: {
            address: "0",
            data: encodeBase64(memory.slice(fromOffset, fromOffset + Math.max(0, count - unreadable))),
            unreadableBytes: unreadable
          }
        };
        unreadable = 0;
        return Promise.resolve(res);
      });
      session.writeMemory.callsFake((ref, fromOffset, data) => {
        const decoded = decodeBase64(data);
        for (let i = 0; i < decoded.byteLength; i++) {
          memory.buffer[fromOffset + i] = decoded.buffer[i];
        }
        return {
          ...dapResponseCommon,
          body: {
            bytesWritten: decoded.byteLength,
            offset: fromOffset
          }
        };
      });
      region = new MemoryRegion("ref", session);
    });
    teardown(() => {
      region.dispose();
    });
    test("reads a simple range", async () => {
      assert.deepStrictEqual(await region.read(10, 14), [
        { type: MemoryRangeType.Valid, offset: 10, length: 4, data: VSBuffer.wrap(new Uint8Array([10, 11, 12, 13])) }
      ]);
    });
    test("reads a non-contiguous range", async () => {
      unreadable = 3;
      assert.deepStrictEqual(await region.read(10, 14), [
        { type: MemoryRangeType.Valid, offset: 10, length: 1, data: VSBuffer.wrap(new Uint8Array([10])) },
        { type: MemoryRangeType.Unreadable, offset: 11, length: 3 }
      ]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxicm93c2VyXFxkZWJ1Z01lbW9yeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZGVjb2RlQmFzZTY0LCBlbmNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBtb2NrT2JqZWN0LCBNb2NrT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTWVtb3J5UmFuZ2VUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IE1lbW9yeVJlZ2lvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IE1vY2tTZXNzaW9uIH0gZnJvbSAnLi4vY29tbW9uL21vY2tEZWJ1Zy5qcyc7XG5cbnN1aXRlKCdEZWJ1ZyAtIE1lbW9yeScsICgpID0+IHtcblx0Y29uc3QgZGFwUmVzcG9uc2VDb21tb24gPSB7XG5cdFx0Y29tbWFuZDogJ3NvbWVDb21tYW5kJyxcblx0XHR0eXBlOiAncmVzcG9uc2UnLFxuXHRcdHNlcTogMSxcblx0XHRyZXF1ZXN0X3NlcTogMSxcblx0XHRzdWNjZXNzOiB0cnVlLFxuXHR9O1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdNZW1vcnlSZWdpb24nLCAoKSA9PiB7XG5cdFx0bGV0IG1lbW9yeTogVlNCdWZmZXI7XG5cdFx0bGV0IHVucmVhZGFibGU6IG51bWJlcjtcblx0XHRsZXQgaW52YWxpZGF0ZU1lbW9yeUVtaXR0ZXI6IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5NZW1vcnlFdmVudD47XG5cdFx0bGV0IHNlc3Npb246IE1vY2tPYmplY3Q8TW9ja1Nlc3Npb24sICdvbkRpZEludmFsaWRhdGVNZW1vcnknPjtcblx0XHRsZXQgcmVnaW9uOiBNZW1vcnlSZWdpb247XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRjb25zdCBtZW1vcnlCdWYgPSBuZXcgVWludDhBcnJheSgxMDI0KTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWVtb3J5QnVmLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdG1lbW9yeUJ1ZltpXSA9IGk7IC8vIHdpbGwgYmUgMC0yNTVcblx0XHRcdH1cblx0XHRcdG1lbW9yeSA9IFZTQnVmZmVyLndyYXAobWVtb3J5QnVmKTtcblx0XHRcdGludmFsaWRhdGVNZW1vcnlFbWl0dGVyID0gbmV3IEVtaXR0ZXIoKTtcblx0XHRcdHVucmVhZGFibGUgPSAwO1xuXG5cdFx0XHRzZXNzaW9uID0gbW9ja09iamVjdDxNb2NrU2Vzc2lvbj4oKSh7XG5cdFx0XHRcdG9uRGlkSW52YWxpZGF0ZU1lbW9yeTogaW52YWxpZGF0ZU1lbW9yeUVtaXR0ZXIuZXZlbnRcblx0XHRcdH0pO1xuXG5cdFx0XHRzZXNzaW9uLnJlYWRNZW1vcnkuY2FsbHNGYWtlKChyZWY6IHN0cmluZywgZnJvbU9mZnNldDogbnVtYmVyLCBjb3VudDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlczogRGVidWdQcm90b2NvbC5SZWFkTWVtb3J5UmVzcG9uc2UgPSAoe1xuXHRcdFx0XHRcdC4uLmRhcFJlc3BvbnNlQ29tbW9uLFxuXHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdGFkZHJlc3M6ICcwJyxcblx0XHRcdFx0XHRcdGRhdGE6IGVuY29kZUJhc2U2NChtZW1vcnkuc2xpY2UoZnJvbU9mZnNldCwgZnJvbU9mZnNldCArIE1hdGgubWF4KDAsIGNvdW50IC0gdW5yZWFkYWJsZSkpKSxcblx0XHRcdFx0XHRcdHVucmVhZGFibGVCeXRlczogdW5yZWFkYWJsZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dW5yZWFkYWJsZSA9IDA7XG5cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNlc3Npb24ud3JpdGVNZW1vcnkuY2FsbHNGYWtlKChyZWY6IHN0cmluZywgZnJvbU9mZnNldDogbnVtYmVyLCBkYXRhOiBzdHJpbmcpOiBEZWJ1Z1Byb3RvY29sLldyaXRlTWVtb3J5UmVzcG9uc2UgPT4ge1xuXHRcdFx0XHRjb25zdCBkZWNvZGVkID0gZGVjb2RlQmFzZTY0KGRhdGEpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRlY29kZWQuYnl0ZUxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0bWVtb3J5LmJ1ZmZlcltmcm9tT2Zmc2V0ICsgaV0gPSBkZWNvZGVkLmJ1ZmZlcltpXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiAoe1xuXHRcdFx0XHRcdC4uLmRhcFJlc3BvbnNlQ29tbW9uLFxuXHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdGJ5dGVzV3JpdHRlbjogZGVjb2RlZC5ieXRlTGVuZ3RoLFxuXHRcdFx0XHRcdFx0b2Zmc2V0OiBmcm9tT2Zmc2V0LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZWdpb24gPSBuZXcgTWVtb3J5UmVnaW9uKCdyZWYnLCBzZXNzaW9uIGFzIGFueSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRyZWdpb24uZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZHMgYSBzaW1wbGUgcmFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlZ2lvbi5yZWFkKDEwLCAxNCksIFtcblx0XHRcdFx0eyB0eXBlOiBNZW1vcnlSYW5nZVR5cGUuVmFsaWQsIG9mZnNldDogMTAsIGxlbmd0aDogNCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbMTAsIDExLCAxMiwgMTNdKSkgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkcyBhIG5vbi1jb250aWd1b3VzIHJhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dW5yZWFkYWJsZSA9IDM7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlZ2lvbi5yZWFkKDEwLCAxNCksIFtcblx0XHRcdFx0eyB0eXBlOiBNZW1vcnlSYW5nZVR5cGUuVmFsaWQsIG9mZnNldDogMTAsIGxlbmd0aDogMSwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbMTBdKSkgfSxcblx0XHRcdFx0eyB0eXBlOiBNZW1vcnlSYW5nZVR5cGUuVW5yZWFkYWJsZSwgb2Zmc2V0OiAxMSwgbGVuZ3RoOiAzIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGNBQWMsY0FBYyxnQkFBZ0I7QUFDckQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQThCO0FBQ3ZDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBRzdCLE1BQU0sa0JBQWtCLE1BQU07QUFDN0IsUUFBTSxvQkFBb0I7QUFBQSxJQUN6QixTQUFTO0FBQUEsSUFDVCxNQUFNO0FBQUEsSUFDTixLQUFLO0FBQUEsSUFDTCxhQUFhO0FBQUEsSUFDYixTQUFTO0FBQUEsRUFDVjtBQUVBLDBDQUF3QztBQUV4QyxRQUFNLGdCQUFnQixNQUFNO0FBQzNCLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBRUosVUFBTSxNQUFNO0FBQ1gsWUFBTSxZQUFZLElBQUksV0FBVyxJQUFJO0FBQ3JDLGVBQVMsSUFBSSxHQUFHLElBQUksVUFBVSxRQUFRLEtBQUs7QUFDMUMsa0JBQVUsQ0FBQyxJQUFJO0FBQUEsTUFDaEI7QUFDQSxlQUFTLFNBQVMsS0FBSyxTQUFTO0FBQ2hDLGdDQUEwQixJQUFJLFFBQVE7QUFDdEMsbUJBQWE7QUFFYixnQkFBVSxXQUF3QixFQUFFO0FBQUEsUUFDbkMsdUJBQXVCLHdCQUF3QjtBQUFBLE1BQ2hELENBQUM7QUFFRCxjQUFRLFdBQVcsVUFBVSxDQUFDLEtBQWEsWUFBb0IsVUFBa0I7QUFDaEYsY0FBTSxNQUF5QztBQUFBLFVBQzlDLEdBQUc7QUFBQSxVQUNILE1BQU07QUFBQSxZQUNMLFNBQVM7QUFBQSxZQUNULE1BQU0sYUFBYSxPQUFPLE1BQU0sWUFBWSxhQUFhLEtBQUssSUFBSSxHQUFHLFFBQVEsVUFBVSxDQUFDLENBQUM7QUFBQSxZQUN6RixpQkFBaUI7QUFBQSxVQUNsQjtBQUFBLFFBQ0Q7QUFFQSxxQkFBYTtBQUViLGVBQU8sUUFBUSxRQUFRLEdBQUc7QUFBQSxNQUMzQixDQUFDO0FBRUQsY0FBUSxZQUFZLFVBQVUsQ0FBQyxLQUFhLFlBQW9CLFNBQW9EO0FBQ25ILGNBQU0sVUFBVSxhQUFhLElBQUk7QUFDakMsaUJBQVMsSUFBSSxHQUFHLElBQUksUUFBUSxZQUFZLEtBQUs7QUFDNUMsaUJBQU8sT0FBTyxhQUFhLENBQUMsSUFBSSxRQUFRLE9BQU8sQ0FBQztBQUFBLFFBQ2pEO0FBRUEsZUFBUTtBQUFBLFVBQ1AsR0FBRztBQUFBLFVBQ0gsTUFBTTtBQUFBLFlBQ0wsY0FBYyxRQUFRO0FBQUEsWUFDdEIsUUFBUTtBQUFBLFVBQ1Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBR0QsZUFBUyxJQUFJLGFBQWEsT0FBTyxPQUFjO0FBQUEsSUFDaEQsQ0FBQztBQUVELGFBQVMsTUFBTTtBQUNkLGFBQU8sUUFBUTtBQUFBLElBQ2hCLENBQUM7QUFFRCxTQUFLLHdCQUF3QixZQUFZO0FBQ3hDLGFBQU8sZ0JBQWdCLE1BQU0sT0FBTyxLQUFLLElBQUksRUFBRSxHQUFHO0FBQUEsUUFDakQsRUFBRSxNQUFNLGdCQUFnQixPQUFPLFFBQVEsSUFBSSxRQUFRLEdBQUcsTUFBTSxTQUFTLEtBQUssSUFBSSxXQUFXLENBQUMsSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRTtBQUFBLE1BQzdHLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGdDQUFnQyxZQUFZO0FBQ2hELG1CQUFhO0FBQ2IsYUFBTyxnQkFBZ0IsTUFBTSxPQUFPLEtBQUssSUFBSSxFQUFFLEdBQUc7QUFBQSxRQUNqRCxFQUFFLE1BQU0sZ0JBQWdCLE9BQU8sUUFBUSxJQUFJLFFBQVEsR0FBRyxNQUFNLFNBQVMsS0FBSyxJQUFJLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFO0FBQUEsUUFDaEcsRUFBRSxNQUFNLGdCQUFnQixZQUFZLFFBQVEsSUFBSSxRQUFRLEVBQUU7QUFBQSxNQUMzRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
