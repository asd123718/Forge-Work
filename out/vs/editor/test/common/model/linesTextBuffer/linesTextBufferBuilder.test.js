import assert from "assert";
import * as strings from "../../../../../base/common/strings.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DefaultEndOfLine } from "../../../../common/model.js";
import { createTextBufferFactory } from "../../../../common/model/textModel.js";
function testTextBufferFactory(text, eol, mightContainNonBasicASCII, mightContainRTL) {
  const { disposable, textBuffer } = createTextBufferFactory(text).create(DefaultEndOfLine.LF);
  assert.strictEqual(textBuffer.mightContainNonBasicASCII(), mightContainNonBasicASCII);
  assert.strictEqual(textBuffer.mightContainRTL(), mightContainRTL);
  assert.strictEqual(textBuffer.getEOL(), eol);
  disposable.dispose();
}
suite("ModelBuilder", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("t1", () => {
    testTextBufferFactory("", "\n", false, false);
  });
  test("t2", () => {
    testTextBufferFactory("Hello world", "\n", false, false);
  });
  test("t3", () => {
    testTextBufferFactory("Hello world\nHow are you?", "\n", false, false);
  });
  test("t4", () => {
    testTextBufferFactory("Hello world\nHow are you?\nIs everything good today?\nDo you enjoy the weather?", "\n", false, false);
  });
  test("carriage return detection (1 \\r\\n 2 \\n)", () => {
    testTextBufferFactory("Hello world\r\nHow are you?\nIs everything good today?\nDo you enjoy the weather?", "\n", false, false);
  });
  test("carriage return detection (2 \\r\\n 1 \\n)", () => {
    testTextBufferFactory("Hello world\r\nHow are you?\r\nIs everything good today?\nDo you enjoy the weather?", "\r\n", false, false);
  });
  test("carriage return detection (3 \\r\\n 0 \\n)", () => {
    testTextBufferFactory("Hello world\r\nHow are you?\r\nIs everything good today?\r\nDo you enjoy the weather?", "\r\n", false, false);
  });
  test("BOM handling", () => {
    testTextBufferFactory(strings.UTF8_BOM_CHARACTER + "Hello world!", "\n", false, false);
  });
  test("RTL handling 2", () => {
    testTextBufferFactory("Hello world!\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5", "\n", true, true);
  });
  test("RTL handling 3", () => {
    testTextBufferFactory("Hello world!\u05D6\u05D5\u05D4\u05D9 \n\u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5", "\n", true, true);
  });
  test("ASCII handling 1", () => {
    testTextBufferFactory("Hello world!!\nHow do you do?", "\n", false, false);
  });
  test("ASCII handling 2", () => {
    testTextBufferFactory("Hello world!!\nHow do you do?Z\xFCricha\u{1F4DA}\u{1F4DA}b", "\n", true, false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGxpbmVzVGV4dEJ1ZmZlclxcbGluZXNUZXh0QnVmZmVyQnVpbGRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGVmYXVsdEVuZE9mTGluZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuXG5mdW5jdGlvbiB0ZXN0VGV4dEJ1ZmZlckZhY3RvcnkodGV4dDogc3RyaW5nLCBlb2w6IHN0cmluZywgbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSTogYm9vbGVhbiwgbWlnaHRDb250YWluUlRMOiBib29sZWFuKTogdm9pZCB7XG5cdGNvbnN0IHsgZGlzcG9zYWJsZSwgdGV4dEJ1ZmZlciB9ID0gY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkodGV4dCkuY3JlYXRlKERlZmF1bHRFbmRPZkxpbmUuTEYpO1xuXG5cdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0QnVmZmVyLm1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKSwgbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0QnVmZmVyLm1pZ2h0Q29udGFpblJUTCgpLCBtaWdodENvbnRhaW5SVEwpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEJ1ZmZlci5nZXRFT0woKSwgZW9sKTtcblx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG59XG5cbnN1aXRlKCdNb2RlbEJ1aWxkZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndDEnLCAoKSA9PiB7XG5cdFx0dGVzdFRleHRCdWZmZXJGYWN0b3J5KCcnLCAnXFxuJywgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgndDInLCAoKSA9PiB7XG5cdFx0dGVzdFRleHRCdWZmZXJGYWN0b3J5KCdIZWxsbyB3b3JsZCcsICdcXG4nLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd0MycsICgpID0+IHtcblx0XHR0ZXN0VGV4dEJ1ZmZlckZhY3RvcnkoJ0hlbGxvIHdvcmxkXFxuSG93IGFyZSB5b3U/JywgJ1xcbicsIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Q0JywgKCkgPT4ge1xuXHRcdHRlc3RUZXh0QnVmZmVyRmFjdG9yeSgnSGVsbG8gd29ybGRcXG5Ib3cgYXJlIHlvdT9cXG5JcyBldmVyeXRoaW5nIGdvb2QgdG9kYXk/XFxuRG8geW91IGVuam95IHRoZSB3ZWF0aGVyPycsICdcXG4nLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWFnZSByZXR1cm4gZGV0ZWN0aW9uICgxIFxcXFxyXFxcXG4gMiBcXFxcbiknLCAoKSA9PiB7XG5cdFx0dGVzdFRleHRCdWZmZXJGYWN0b3J5KCdIZWxsbyB3b3JsZFxcclxcbkhvdyBhcmUgeW91P1xcbklzIGV2ZXJ5dGhpbmcgZ29vZCB0b2RheT9cXG5EbyB5b3UgZW5qb3kgdGhlIHdlYXRoZXI/JywgJ1xcbicsIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhcnJpYWdlIHJldHVybiBkZXRlY3Rpb24gKDIgXFxcXHJcXFxcbiAxIFxcXFxuKScsICgpID0+IHtcblx0XHR0ZXN0VGV4dEJ1ZmZlckZhY3RvcnkoJ0hlbGxvIHdvcmxkXFxyXFxuSG93IGFyZSB5b3U/XFxyXFxuSXMgZXZlcnl0aGluZyBnb29kIHRvZGF5P1xcbkRvIHlvdSBlbmpveSB0aGUgd2VhdGhlcj8nLCAnXFxyXFxuJywgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY2FycmlhZ2UgcmV0dXJuIGRldGVjdGlvbiAoMyBcXFxcclxcXFxuIDAgXFxcXG4pJywgKCkgPT4ge1xuXHRcdHRlc3RUZXh0QnVmZmVyRmFjdG9yeSgnSGVsbG8gd29ybGRcXHJcXG5Ib3cgYXJlIHlvdT9cXHJcXG5JcyBldmVyeXRoaW5nIGdvb2QgdG9kYXk/XFxyXFxuRG8geW91IGVuam95IHRoZSB3ZWF0aGVyPycsICdcXHJcXG4nLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdCT00gaGFuZGxpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdFRleHRCdWZmZXJGYWN0b3J5KHN0cmluZ3MuVVRGOF9CT01fQ0hBUkFDVEVSICsgJ0hlbGxvIHdvcmxkIScsICdcXG4nLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdSVEwgaGFuZGxpbmcgMicsICgpID0+IHtcblx0XHR0ZXN0VGV4dEJ1ZmZlckZhY3RvcnkoJ0hlbGxvIHdvcmxkIVx1MDVENlx1MDVENVx1MDVENFx1MDVEOSBcdTA1RTJcdTA1RDVcdTA1RDFcdTA1RDNcdTA1RDQgXHUwNURFXHUwNUQxXHUwNUQ1XHUwNUUxXHUwNUUxXHUwNUVBIFx1MDVFOVx1MDVEM1x1MDVFMlx1MDVFQVx1MDVENScsICdcXG4nLCB0cnVlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnUlRMIGhhbmRsaW5nIDMnLCAoKSA9PiB7XG5cdFx0dGVzdFRleHRCdWZmZXJGYWN0b3J5KCdIZWxsbyB3b3JsZCFcdTA1RDZcdTA1RDVcdTA1RDRcdTA1RDkgXFxuXHUwNUUyXHUwNUQ1XHUwNUQxXHUwNUQzXHUwNUQ0IFx1MDVERVx1MDVEMVx1MDVENVx1MDVFMVx1MDVFMVx1MDVFQSBcdTA1RTlcdTA1RDNcdTA1RTJcdTA1RUFcdTA1RDUnLCAnXFxuJywgdHJ1ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0FTQ0lJIGhhbmRsaW5nIDEnLCAoKSA9PiB7XG5cdFx0dGVzdFRleHRCdWZmZXJGYWN0b3J5KCdIZWxsbyB3b3JsZCEhXFxuSG93IGRvIHlvdSBkbz8nLCAnXFxuJywgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cdHRlc3QoJ0FTQ0lJIGhhbmRsaW5nIDInLCAoKSA9PiB7XG5cdFx0dGVzdFRleHRCdWZmZXJGYWN0b3J5KCdIZWxsbyB3b3JsZCEhXFxuSG93IGRvIHlvdSBkbz9aXHUwMEZDcmljaGFcdUQ4M0RcdURDREFcdUQ4M0RcdURDREFiJywgJ1xcbicsIHRydWUsIGZhbHNlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLGFBQWE7QUFDekIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyxzQkFBc0IsTUFBYyxLQUFhLDJCQUFvQyxpQkFBZ0M7QUFDN0gsUUFBTSxFQUFFLFlBQVksV0FBVyxJQUFJLHdCQUF3QixJQUFJLEVBQUUsT0FBTyxpQkFBaUIsRUFBRTtBQUUzRixTQUFPLFlBQVksV0FBVywwQkFBMEIsR0FBRyx5QkFBeUI7QUFDcEYsU0FBTyxZQUFZLFdBQVcsZ0JBQWdCLEdBQUcsZUFBZTtBQUNoRSxTQUFPLFlBQVksV0FBVyxPQUFPLEdBQUcsR0FBRztBQUMzQyxhQUFXLFFBQVE7QUFDcEI7QUFFQSxNQUFNLGdCQUFnQixNQUFNO0FBRTNCLDBDQUF3QztBQUV4QyxPQUFLLE1BQU0sTUFBTTtBQUNoQiwwQkFBc0IsSUFBSSxNQUFNLE9BQU8sS0FBSztBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLE1BQU0sTUFBTTtBQUNoQiwwQkFBc0IsZUFBZSxNQUFNLE9BQU8sS0FBSztBQUFBLEVBQ3hELENBQUM7QUFFRCxPQUFLLE1BQU0sTUFBTTtBQUNoQiwwQkFBc0IsNkJBQTZCLE1BQU0sT0FBTyxLQUFLO0FBQUEsRUFDdEUsQ0FBQztBQUVELE9BQUssTUFBTSxNQUFNO0FBQ2hCLDBCQUFzQixtRkFBbUYsTUFBTSxPQUFPLEtBQUs7QUFBQSxFQUM1SCxDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCwwQkFBc0IscUZBQXFGLE1BQU0sT0FBTyxLQUFLO0FBQUEsRUFDOUgsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsMEJBQXNCLHVGQUF1RixRQUFRLE9BQU8sS0FBSztBQUFBLEVBQ2xJLENBQUM7QUFFRCxPQUFLLDhDQUE4QyxNQUFNO0FBQ3hELDBCQUFzQix5RkFBeUYsUUFBUSxPQUFPLEtBQUs7QUFBQSxFQUNwSSxDQUFDO0FBRUQsT0FBSyxnQkFBZ0IsTUFBTTtBQUMxQiwwQkFBc0IsUUFBUSxxQkFBcUIsZ0JBQWdCLE1BQU0sT0FBTyxLQUFLO0FBQUEsRUFDdEYsQ0FBQztBQUVELE9BQUssa0JBQWtCLE1BQU07QUFDNUIsMEJBQXNCLDJJQUF1QyxNQUFNLE1BQU0sSUFBSTtBQUFBLEVBQzlFLENBQUM7QUFFRCxPQUFLLGtCQUFrQixNQUFNO0FBQzVCLDBCQUFzQiw2SUFBeUMsTUFBTSxNQUFNLElBQUk7QUFBQSxFQUNoRixDQUFDO0FBRUQsT0FBSyxvQkFBb0IsTUFBTTtBQUM5QiwwQkFBc0IsaUNBQWlDLE1BQU0sT0FBTyxLQUFLO0FBQUEsRUFDMUUsQ0FBQztBQUNELE9BQUssb0JBQW9CLE1BQU07QUFDOUIsMEJBQXNCLDhEQUE2QyxNQUFNLE1BQU0sS0FBSztBQUFBLEVBQ3JGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
