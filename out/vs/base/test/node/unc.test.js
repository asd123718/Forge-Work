import { strictEqual } from "assert";
import { getUNCHost } from "../../node/unc.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("UNC", () => {
  test("getUNCHost", () => {
    strictEqual(getUNCHost(void 0), void 0);
    strictEqual(getUNCHost(null), void 0);
    strictEqual(getUNCHost("/"), void 0);
    strictEqual(getUNCHost("/foo"), void 0);
    strictEqual(getUNCHost("c:"), void 0);
    strictEqual(getUNCHost("c:\\"), void 0);
    strictEqual(getUNCHost("c:\\foo"), void 0);
    strictEqual(getUNCHost("c:\\foo\\\\server\\path"), void 0);
    strictEqual(getUNCHost("\\"), void 0);
    strictEqual(getUNCHost("\\\\"), void 0);
    strictEqual(getUNCHost("\\\\localhost"), void 0);
    strictEqual(getUNCHost("\\\\localhost\\"), "localhost");
    strictEqual(getUNCHost("\\\\localhost\\a"), "localhost");
    strictEqual(getUNCHost("\\\\."), void 0);
    strictEqual(getUNCHost("\\\\?"), void 0);
    strictEqual(getUNCHost("\\\\.\\localhost"), ".");
    strictEqual(getUNCHost("\\\\?\\localhost"), "?");
    strictEqual(getUNCHost("\\\\.\\UNC\\localhost"), ".");
    strictEqual(getUNCHost("\\\\?\\UNC\\localhost"), "?");
    strictEqual(getUNCHost("\\\\.\\UNC\\localhost\\"), "localhost");
    strictEqual(getUNCHost("\\\\?\\UNC\\localhost\\"), "localhost");
    strictEqual(getUNCHost("\\\\.\\UNC\\localhost\\a"), "localhost");
    strictEqual(getUNCHost("\\\\?\\UNC\\localhost\\a"), "localhost");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxub2RlXFx1bmMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGdldFVOQ0hvc3QgfSBmcm9tICcuLi8uLi9ub2RlL3VuYy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnVU5DJywgKCkgPT4ge1xuXG5cdHRlc3QoJ2dldFVOQ0hvc3QnLCAoKSA9PiB7XG5cblx0XHRzdHJpY3RFcXVhbChnZXRVTkNIb3N0KHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0c3RyaWN0RXF1YWwoZ2V0VU5DSG9zdChudWxsKSwgdW5kZWZpbmVkKTtcblxuXHRcdHN0cmljdEVxdWFsKGdldFVOQ0hvc3QoJy8nKSwgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChnZXRVTkNIb3N0KCcvZm9vJyksIHVuZGVmaW5lZCk7XG5cblx0XHRzdHJpY3RFcXVhbChnZXRVTkNIb3N0KCdjOicpLCB1bmRlZmluZWQpO1xuXHRcdHN0cmljdEVxdWFsKGdldFVOQ0hvc3QoJ2M6XFxcXCcpLCB1bmRlZmluZWQpO1xuXHRcdHN0cmljdEVxdWFsKGdldFVOQ0hvc3QoJ2M6XFxcXGZvbycpLCB1bmRlZmluZWQpO1xuXHRcdHN0cmljdEVxdWFsKGdldFVOQ0hvc3QoJ2M6XFxcXGZvb1xcXFxcXFxcc2VydmVyXFxcXHBhdGgnKSwgdW5kZWZpbmVkKTtcblxuXHRcdHN0cmljdEVxdWFsKGdldFVOQ0hvc3QoJ1xcXFwnKSwgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChnZXRVTkNIb3N0KCdcXFxcXFxcXCcpLCB1bmRlZmluZWQpO1xuXHRcdHN0cmljdEVxdWFsKGdldFVOQ0hvc3QoJ1xcXFxcXFxcbG9jYWxob3N0JyksIHVuZGVmaW5lZCk7XG5cblx0XHRzdHJpY3RFcXVhbChnZXRVTkNIb3N0KCdcXFxcXFxcXGxvY2FsaG9zdFxcXFwnKSwgJ2xvY2FsaG9zdCcpO1xuXHRcdHN0cmljdEVxdWFsKGdldFVOQ0hvc3QoJ1xcXFxcXFxcbG9jYWxob3N0XFxcXGEnKSwgJ2xvY2FsaG9zdCcpO1xuXG5cdFx0c3RyaWN0RXF1YWwoZ2V0VU5DSG9zdCgnXFxcXFxcXFwuJyksIHVuZGVmaW5lZCk7XG5cdFx0c3RyaWN0RXF1YWwoZ2V0VU5DSG9zdCgnXFxcXFxcXFw/JyksIHVuZGVmaW5lZCk7XG5cblx0XHRzdHJpY3RFcXVhbChnZXRVTkNIb3N0KCdcXFxcXFxcXC5cXFxcbG9jYWxob3N0JyksICcuJyk7XG5cdFx0c3RyaWN0RXF1YWwoZ2V0VU5DSG9zdCgnXFxcXFxcXFw/XFxcXGxvY2FsaG9zdCcpLCAnPycpO1xuXG5cdFx0c3RyaWN0RXF1YWwoZ2V0VU5DSG9zdCgnXFxcXFxcXFwuXFxcXFVOQ1xcXFxsb2NhbGhvc3QnKSwgJy4nKTtcblx0XHRzdHJpY3RFcXVhbChnZXRVTkNIb3N0KCdcXFxcXFxcXD9cXFxcVU5DXFxcXGxvY2FsaG9zdCcpLCAnPycpO1xuXG5cdFx0c3RyaWN0RXF1YWwoZ2V0VU5DSG9zdCgnXFxcXFxcXFwuXFxcXFVOQ1xcXFxsb2NhbGhvc3RcXFxcJyksICdsb2NhbGhvc3QnKTtcblx0XHRzdHJpY3RFcXVhbChnZXRVTkNIb3N0KCdcXFxcXFxcXD9cXFxcVU5DXFxcXGxvY2FsaG9zdFxcXFwnKSwgJ2xvY2FsaG9zdCcpO1xuXG5cdFx0c3RyaWN0RXF1YWwoZ2V0VU5DSG9zdCgnXFxcXFxcXFwuXFxcXFVOQ1xcXFxsb2NhbGhvc3RcXFxcYScpLCAnbG9jYWxob3N0Jyk7XG5cdFx0c3RyaWN0RXF1YWwoZ2V0VU5DSG9zdCgnXFxcXFxcXFw/XFxcXFVOQ1xcXFxsb2NhbGhvc3RcXFxcYScpLCAnbG9jYWxob3N0Jyk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLCtDQUErQztBQUV4RCxNQUFNLE9BQU8sTUFBTTtBQUVsQixPQUFLLGNBQWMsTUFBTTtBQUV4QixnQkFBWSxXQUFXLE1BQVMsR0FBRyxNQUFTO0FBQzVDLGdCQUFZLFdBQVcsSUFBSSxHQUFHLE1BQVM7QUFFdkMsZ0JBQVksV0FBVyxHQUFHLEdBQUcsTUFBUztBQUN0QyxnQkFBWSxXQUFXLE1BQU0sR0FBRyxNQUFTO0FBRXpDLGdCQUFZLFdBQVcsSUFBSSxHQUFHLE1BQVM7QUFDdkMsZ0JBQVksV0FBVyxNQUFNLEdBQUcsTUFBUztBQUN6QyxnQkFBWSxXQUFXLFNBQVMsR0FBRyxNQUFTO0FBQzVDLGdCQUFZLFdBQVcseUJBQXlCLEdBQUcsTUFBUztBQUU1RCxnQkFBWSxXQUFXLElBQUksR0FBRyxNQUFTO0FBQ3ZDLGdCQUFZLFdBQVcsTUFBTSxHQUFHLE1BQVM7QUFDekMsZ0JBQVksV0FBVyxlQUFlLEdBQUcsTUFBUztBQUVsRCxnQkFBWSxXQUFXLGlCQUFpQixHQUFHLFdBQVc7QUFDdEQsZ0JBQVksV0FBVyxrQkFBa0IsR0FBRyxXQUFXO0FBRXZELGdCQUFZLFdBQVcsT0FBTyxHQUFHLE1BQVM7QUFDMUMsZ0JBQVksV0FBVyxPQUFPLEdBQUcsTUFBUztBQUUxQyxnQkFBWSxXQUFXLGtCQUFrQixHQUFHLEdBQUc7QUFDL0MsZ0JBQVksV0FBVyxrQkFBa0IsR0FBRyxHQUFHO0FBRS9DLGdCQUFZLFdBQVcsdUJBQXVCLEdBQUcsR0FBRztBQUNwRCxnQkFBWSxXQUFXLHVCQUF1QixHQUFHLEdBQUc7QUFFcEQsZ0JBQVksV0FBVyx5QkFBeUIsR0FBRyxXQUFXO0FBQzlELGdCQUFZLFdBQVcseUJBQXlCLEdBQUcsV0FBVztBQUU5RCxnQkFBWSxXQUFXLDBCQUEwQixHQUFHLFdBQVc7QUFDL0QsZ0JBQVksV0FBVywwQkFBMEIsR0FBRyxXQUFXO0FBQUEsRUFDaEUsQ0FBQztBQUVELDBDQUF3QztBQUN6QyxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
