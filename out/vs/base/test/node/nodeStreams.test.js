import { Writable } from "stream";
import assert from "assert";
import { StreamSplitter } from "../../node/nodeStreams.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("StreamSplitter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should split a stream on a single character splitter", (done) => {
    const chunks = [];
    const splitter = new StreamSplitter("\n");
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      }
    });
    splitter.pipe(writable);
    splitter.write("hello\nwor");
    splitter.write("ld\n");
    splitter.write("foo\nbar\nz");
    splitter.end(() => {
      assert.deepStrictEqual(chunks, ["hello\n", "world\n", "foo\n", "bar\n", "z"]);
      done();
    });
  });
  test("should split a stream on a multi-character splitter", (done) => {
    const chunks = [];
    const splitter = new StreamSplitter("---");
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      }
    });
    splitter.pipe(writable);
    splitter.write("hello---wor");
    splitter.write("ld---");
    splitter.write("foo---bar---z");
    splitter.end(() => {
      assert.deepStrictEqual(chunks, ["hello---", "world---", "foo---", "bar---", "z"]);
      done();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxub2RlXFxub2RlU3RyZWFtcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXG5pbXBvcnQgeyBXcml0YWJsZSB9IGZyb20gJ3N0cmVhbSc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBTdHJlYW1TcGxpdHRlciB9IGZyb20gJy4uLy4uL25vZGUvbm9kZVN0cmVhbXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ1N0cmVhbVNwbGl0dGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzaG91bGQgc3BsaXQgYSBzdHJlYW0gb24gYSBzaW5nbGUgY2hhcmFjdGVyIHNwbGl0dGVyJywgKGRvbmUpID0+IHtcblx0XHRjb25zdCBjaHVua3M6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgc3BsaXR0ZXIgPSBuZXcgU3RyZWFtU3BsaXR0ZXIoJ1xcbicpO1xuXHRcdGNvbnN0IHdyaXRhYmxlID0gbmV3IFdyaXRhYmxlKHtcblx0XHRcdHdyaXRlKGNodW5rLCBfZW5jb2RpbmcsIGNhbGxiYWNrKSB7XG5cdFx0XHRcdGNodW5rcy5wdXNoKGNodW5rLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjYWxsYmFjaygpO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHNwbGl0dGVyLnBpcGUod3JpdGFibGUpO1xuXHRcdHNwbGl0dGVyLndyaXRlKCdoZWxsb1xcbndvcicpO1xuXHRcdHNwbGl0dGVyLndyaXRlKCdsZFxcbicpO1xuXHRcdHNwbGl0dGVyLndyaXRlKCdmb29cXG5iYXJcXG56Jyk7XG5cdFx0c3BsaXR0ZXIuZW5kKCgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2h1bmtzLCBbJ2hlbGxvXFxuJywgJ3dvcmxkXFxuJywgJ2Zvb1xcbicsICdiYXJcXG4nLCAneiddKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHNwbGl0IGEgc3RyZWFtIG9uIGEgbXVsdGktY2hhcmFjdGVyIHNwbGl0dGVyJywgKGRvbmUpID0+IHtcblx0XHRjb25zdCBjaHVua3M6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgc3BsaXR0ZXIgPSBuZXcgU3RyZWFtU3BsaXR0ZXIoJy0tLScpO1xuXHRcdGNvbnN0IHdyaXRhYmxlID0gbmV3IFdyaXRhYmxlKHtcblx0XHRcdHdyaXRlKGNodW5rLCBfZW5jb2RpbmcsIGNhbGxiYWNrKSB7XG5cdFx0XHRcdGNodW5rcy5wdXNoKGNodW5rLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjYWxsYmFjaygpO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHNwbGl0dGVyLnBpcGUod3JpdGFibGUpO1xuXHRcdHNwbGl0dGVyLndyaXRlKCdoZWxsby0tLXdvcicpO1xuXHRcdHNwbGl0dGVyLndyaXRlKCdsZC0tLScpO1xuXHRcdHNwbGl0dGVyLndyaXRlKCdmb28tLS1iYXItLS16Jyk7XG5cdFx0c3BsaXR0ZXIuZW5kKCgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2h1bmtzLCBbJ2hlbGxvLS0tJywgJ3dvcmxkLS0tJywgJ2Zvby0tLScsICdiYXItLS0nLCAneiddKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsZ0JBQWdCO0FBQ3pCLE9BQU8sWUFBWTtBQUNuQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtDQUErQztBQUV4RCxNQUFNLGtCQUFrQixNQUFNO0FBQzdCLDBDQUF3QztBQUV4QyxPQUFLLHdEQUF3RCxDQUFDLFNBQVM7QUFDdEUsVUFBTSxTQUFtQixDQUFDO0FBQzFCLFVBQU0sV0FBVyxJQUFJLGVBQWUsSUFBSTtBQUN4QyxVQUFNLFdBQVcsSUFBSSxTQUFTO0FBQUEsTUFDN0IsTUFBTSxPQUFPLFdBQVcsVUFBVTtBQUNqQyxlQUFPLEtBQUssTUFBTSxTQUFTLENBQUM7QUFDNUIsaUJBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRCxDQUFDO0FBRUQsYUFBUyxLQUFLLFFBQVE7QUFDdEIsYUFBUyxNQUFNLFlBQVk7QUFDM0IsYUFBUyxNQUFNLE1BQU07QUFDckIsYUFBUyxNQUFNLGFBQWE7QUFDNUIsYUFBUyxJQUFJLE1BQU07QUFDbEIsYUFBTyxnQkFBZ0IsUUFBUSxDQUFDLFdBQVcsV0FBVyxTQUFTLFNBQVMsR0FBRyxDQUFDO0FBQzVFLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVEQUF1RCxDQUFDLFNBQVM7QUFDckUsVUFBTSxTQUFtQixDQUFDO0FBQzFCLFVBQU0sV0FBVyxJQUFJLGVBQWUsS0FBSztBQUN6QyxVQUFNLFdBQVcsSUFBSSxTQUFTO0FBQUEsTUFDN0IsTUFBTSxPQUFPLFdBQVcsVUFBVTtBQUNqQyxlQUFPLEtBQUssTUFBTSxTQUFTLENBQUM7QUFDNUIsaUJBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRCxDQUFDO0FBRUQsYUFBUyxLQUFLLFFBQVE7QUFDdEIsYUFBUyxNQUFNLGFBQWE7QUFDNUIsYUFBUyxNQUFNLE9BQU87QUFDdEIsYUFBUyxNQUFNLGVBQWU7QUFDOUIsYUFBUyxJQUFJLE1BQU07QUFDbEIsYUFBTyxnQkFBZ0IsUUFBUSxDQUFDLFlBQVksWUFBWSxVQUFVLFVBQVUsR0FBRyxDQUFDO0FBQ2hGLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
