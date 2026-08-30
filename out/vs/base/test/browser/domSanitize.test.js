import * as assert from "assert";
import { sanitizeHtml } from "../../browser/domSanitize.js";
import { Schemas } from "../../common/network.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("DomSanitize", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("removes unsupported tags by default", () => {
    const html = "<div>safe<script>alert(1)<\/script>content</div>";
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes("<div>"));
    assert.ok(str.includes("safe"));
    assert.ok(str.includes("content"));
    assert.ok(!str.includes("<script>"));
    assert.ok(!str.includes("alert(1)"));
  });
  test("removes unsupported attributes by default", () => {
    const html = '<div onclick="alert(1)" title="safe">content</div>';
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes('<div title="safe">'));
    assert.ok(!str.includes("onclick"));
    assert.ok(!str.includes("alert(1)"));
  });
  test("allows custom tags via config", () => {
    {
      const html = "<div>removed</div><custom-tag>hello</custom-tag>";
      const result = sanitizeHtml(html, {
        allowedTags: { override: ["custom-tag"] }
      });
      assert.strictEqual(result.toString(), "removed<custom-tag>hello</custom-tag>");
    }
    {
      const html = "<div>kept</div><augmented-tag>world</augmented-tag>";
      const result = sanitizeHtml(html, {
        allowedTags: { augment: ["augmented-tag"] }
      });
      assert.strictEqual(result.toString(), "<div>kept</div><augmented-tag>world</augmented-tag>");
    }
  });
  test("allows custom attributes via config", () => {
    const html = '<div custom-attr="value">content</div>';
    const result = sanitizeHtml(html, {
      allowedAttributes: { override: ["custom-attr"] }
    });
    const str = result.toString();
    assert.ok(str.includes('custom-attr="value"'));
  });
  test("Attributes in config should be case insensitive", () => {
    const html = '<div Custom-Attr="value">content</div>';
    {
      const result = sanitizeHtml(html, {
        allowedAttributes: { override: ["custom-attr"] }
      });
      assert.ok(result.toString().includes('custom-attr="value"'));
    }
    {
      const result = sanitizeHtml(html, {
        allowedAttributes: { override: ["CUSTOM-ATTR"] }
      });
      assert.ok(result.toString().includes('custom-attr="value"'));
    }
  });
  test("removes unsupported protocols for href by default", () => {
    const html = '<a href="javascript:alert(1)">bad link</a>';
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes("<a>bad link</a>"));
    assert.ok(!str.includes("javascript:"));
  });
  test("removes unsupported protocols for src by default", () => {
    const html = '<img alt="text" src="javascript:alert(1)">';
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes('<img alt="text">'));
    assert.ok(!str.includes("javascript:"));
  });
  test("allows safe protocols for href", () => {
    const html = '<a href="https://example.com">safe link</a>';
    const result = sanitizeHtml(html);
    assert.ok(result.toString().includes('href="https://example.com"'));
  });
  test("allows fragment links", () => {
    const html = '<a href="#section">fragment link</a>';
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes('href="#section"'));
  });
  test("removes data images by default", () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==">';
    const result = sanitizeHtml(html);
    const str = result.toString();
    assert.ok(str.includes("<img>"));
    assert.ok(!str.includes('src="data:'));
  });
  test("allows data images when enabled", () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==">';
    const result = sanitizeHtml(html, {
      allowedMediaProtocols: { override: [Schemas.data] }
    });
    assert.ok(result.toString().includes('src="data:image/png;base64,'));
  });
  test("Removes relative paths for img src by default", () => {
    const html = '<img src="path/img.png">';
    const result = sanitizeHtml(html);
    assert.strictEqual(result.toString(), "<img>");
  });
  test("Can allow relative paths for image", () => {
    const html = '<img src="path/img.png">';
    const result = sanitizeHtml(html, {
      allowRelativeMediaPaths: true
    });
    assert.strictEqual(result.toString(), '<img src="path/img.png">');
  });
  test("Supports dynamic attribute sanitization", () => {
    const html = '<div title="a" other="1">text1</div><div title="b" other="2">text2</div>';
    const result = sanitizeHtml(html, {
      allowedAttributes: {
        override: [
          {
            attributeName: "title",
            shouldKeep: (_el, data) => {
              return data.attrValue.includes("b");
            }
          }
        ]
      }
    });
    assert.strictEqual(result.toString(), '<div>text1</div><div title="b">text2</div>');
  });
  test("Supports changing attributes in dynamic sanitization", () => {
    const html = '<div title="abc" other="1">text1</div><div title="xyz" other="2">text2</div>';
    const result = sanitizeHtml(html, {
      allowedAttributes: {
        override: [
          {
            attributeName: "title",
            shouldKeep: (_el, data) => {
              if (data.attrValue === "abc") {
                return false;
              }
              return data.attrValue + data.attrValue;
            }
          }
        ]
      }
    });
    assert.strictEqual(result.toString(), '<div>text1</div><div title="xyzxyz">text2</div>');
  });
  test("Attr name should clear previously set dynamic sanitizer", () => {
    const html = '<div title="abc" other="1">text1</div><div title="xyz" other="2">text2</div>';
    const result = sanitizeHtml(html, {
      allowedAttributes: {
        override: [
          {
            attributeName: "title",
            shouldKeep: () => false
          },
          "title"
          // Should allow everything since it comes after custom rule
        ]
      }
    });
    assert.strictEqual(result.toString(), '<div title="abc">text1</div><div title="xyz">text2</div>');
  });
  suite("replaceWithPlaintext", () => {
    test("replaces unsupported tags with plaintext representation", () => {
      const html = "<div>safe<script>alert(1)<\/script>content</div>";
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      const str = result.toString();
      assert.strictEqual(str, `<div>safe&lt;script&gt;alert(1)&lt;/script&gt;content</div>`);
    });
    test("handles self-closing tags correctly", () => {
      const html = '<div><input type="text"><custom-input /></div>';
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      assert.strictEqual(result.toString(), '<div>&lt;input type="text"&gt;&lt;custom-input&gt;&lt;/custom-input&gt;</div>');
    });
    test("handles tags with attributes", () => {
      const html = '<div><unknown-tag class="test" id="myid">content</unknown-tag></div>';
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      assert.strictEqual(result.toString(), '<div>&lt;unknown-tag class="test" id="myid"&gt;content&lt;/unknown-tag&gt;</div>');
    });
    test("handles nested unsupported tags", () => {
      const html = "<div><outer><inner>nested</inner></outer></div>";
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      assert.strictEqual(result.toString(), "<div>&lt;outer&gt;&lt;inner&gt;nested&lt;/inner&gt;&lt;/outer&gt;</div>");
    });
    test("handles comments correctly", () => {
      const html = "<div><!-- this is a comment -->content</div>";
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      assert.strictEqual(result.toString(), "<div>&lt;!-- this is a comment --&gt;content</div>");
    });
    test("handles empty tags", () => {
      const html = "<div><empty></empty></div>";
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true
      });
      assert.strictEqual(result.toString(), "<div>&lt;empty&gt;&lt;/empty&gt;</div>");
    });
    test("works with custom allowed tags configuration", () => {
      const html = "<div><custom>allowed</custom><forbidden>not allowed</forbidden></div>";
      const result = sanitizeHtml(html, {
        replaceWithPlaintext: true,
        allowedTags: { augment: ["custom"] }
      });
      assert.strictEqual(result.toString(), "<div><custom>allowed</custom>&lt;forbidden&gt;not allowed&lt;/forbidden&gt;</div>");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFxkb21TYW5pdGl6ZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBzYW5pdGl6ZUh0bWwgfSBmcm9tICcuLi8uLi9icm93c2VyL2RvbVNhbml0aXplLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnRG9tU2FuaXRpemUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVtb3ZlcyB1bnN1cHBvcnRlZCB0YWdzIGJ5IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8ZGl2PnNhZmU8c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+Y29udGVudDwvZGl2Pic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwpO1xuXHRcdGNvbnN0IHN0ciA9IHJlc3VsdC50b1N0cmluZygpO1xuXG5cdFx0YXNzZXJ0Lm9rKHN0ci5pbmNsdWRlcygnPGRpdj4nKSk7XG5cdFx0YXNzZXJ0Lm9rKHN0ci5pbmNsdWRlcygnc2FmZScpKTtcblx0XHRhc3NlcnQub2soc3RyLmluY2x1ZGVzKCdjb250ZW50JykpO1xuXHRcdGFzc2VydC5vayghc3RyLmluY2x1ZGVzKCc8c2NyaXB0PicpKTtcblx0XHRhc3NlcnQub2soIXN0ci5pbmNsdWRlcygnYWxlcnQoMSknKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgdW5zdXBwb3J0ZWQgYXR0cmlidXRlcyBieSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGRpdiBvbmNsaWNrPVwiYWxlcnQoMSlcIiB0aXRsZT1cInNhZmVcIj5jb250ZW50PC9kaXY+Jztcblx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCk7XG5cdFx0Y29uc3Qgc3RyID0gcmVzdWx0LnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQub2soc3RyLmluY2x1ZGVzKCc8ZGl2IHRpdGxlPVwic2FmZVwiPicpKTtcblx0XHRhc3NlcnQub2soIXN0ci5pbmNsdWRlcygnb25jbGljaycpKTtcblx0XHRhc3NlcnQub2soIXN0ci5pbmNsdWRlcygnYWxlcnQoMSknKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyBjdXN0b20gdGFncyB2aWEgY29uZmlnJywgKCkgPT4ge1xuXHRcdHtcblx0XHRcdGNvbnN0IGh0bWwgPSAnPGRpdj5yZW1vdmVkPC9kaXY+PGN1c3RvbS10YWc+aGVsbG88L2N1c3RvbS10YWc+Jztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRcdGFsbG93ZWRUYWdzOiB7IG92ZXJyaWRlOiBbJ2N1c3RvbS10YWcnXSB9XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9TdHJpbmcoKSwgJ3JlbW92ZWQ8Y3VzdG9tLXRhZz5oZWxsbzwvY3VzdG9tLXRhZz4nKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgaHRtbCA9ICc8ZGl2PmtlcHQ8L2Rpdj48YXVnbWVudGVkLXRhZz53b3JsZDwvYXVnbWVudGVkLXRhZz4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdFx0YWxsb3dlZFRhZ3M6IHsgYXVnbWVudDogWydhdWdtZW50ZWQtdGFnJ10gfVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksICc8ZGl2PmtlcHQ8L2Rpdj48YXVnbWVudGVkLXRhZz53b3JsZDwvYXVnbWVudGVkLXRhZz4nKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyBjdXN0b20gYXR0cmlidXRlcyB2aWEgY29uZmlnJywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGRpdiBjdXN0b20tYXR0cj1cInZhbHVlXCI+Y29udGVudDwvZGl2Pic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdGFsbG93ZWRBdHRyaWJ1dGVzOiB7IG92ZXJyaWRlOiBbJ2N1c3RvbS1hdHRyJ10gfVxuXHRcdH0pO1xuXHRcdGNvbnN0IHN0ciA9IHJlc3VsdC50b1N0cmluZygpO1xuXG5cdFx0YXNzZXJ0Lm9rKHN0ci5pbmNsdWRlcygnY3VzdG9tLWF0dHI9XCJ2YWx1ZVwiJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdBdHRyaWJ1dGVzIGluIGNvbmZpZyBzaG91bGQgYmUgY2FzZSBpbnNlbnNpdGl2ZScsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gJzxkaXYgQ3VzdG9tLUF0dHI9XCJ2YWx1ZVwiPmNvbnRlbnQ8L2Rpdj4nO1xuXG5cdFx0e1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdFx0YWxsb3dlZEF0dHJpYnV0ZXM6IHsgb3ZlcnJpZGU6IFsnY3VzdG9tLWF0dHInXSB9XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQudG9TdHJpbmcoKS5pbmNsdWRlcygnY3VzdG9tLWF0dHI9XCJ2YWx1ZVwiJykpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuXHRcdFx0XHRhbGxvd2VkQXR0cmlidXRlczogeyBvdmVycmlkZTogWydDVVNUT00tQVRUUiddIH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC50b1N0cmluZygpLmluY2x1ZGVzKCdjdXN0b20tYXR0cj1cInZhbHVlXCInKSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVzIHVuc3VwcG9ydGVkIHByb3RvY29scyBmb3IgaHJlZiBieSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGEgaHJlZj1cImphdmFzY3JpcHQ6YWxlcnQoMSlcIj5iYWQgbGluazwvYT4nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sKTtcblx0XHRjb25zdCBzdHIgPSByZXN1bHQudG9TdHJpbmcoKTtcblxuXHRcdGFzc2VydC5vayhzdHIuaW5jbHVkZXMoJzxhPmJhZCBsaW5rPC9hPicpKTtcblx0XHRhc3NlcnQub2soIXN0ci5pbmNsdWRlcygnamF2YXNjcmlwdDonKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgdW5zdXBwb3J0ZWQgcHJvdG9jb2xzIGZvciBzcmMgYnkgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gJzxpbWcgYWx0PVwidGV4dFwiIHNyYz1cImphdmFzY3JpcHQ6YWxlcnQoMSlcIj4nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sKTtcblx0XHRjb25zdCBzdHIgPSByZXN1bHQudG9TdHJpbmcoKTtcblxuXHRcdGFzc2VydC5vayhzdHIuaW5jbHVkZXMoJzxpbWcgYWx0PVwidGV4dFwiPicpKTtcblx0XHRhc3NlcnQub2soIXN0ci5pbmNsdWRlcygnamF2YXNjcmlwdDonKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyBzYWZlIHByb3RvY29scyBmb3IgaHJlZicsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gJzxhIGhyZWY9XCJodHRwczovL2V4YW1wbGUuY29tXCI+c2FmZSBsaW5rPC9hPic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC50b1N0cmluZygpLmluY2x1ZGVzKCdocmVmPVwiaHR0cHM6Ly9leGFtcGxlLmNvbVwiJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3MgZnJhZ21lbnQgbGlua3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8YSBocmVmPVwiI3NlY3Rpb25cIj5mcmFnbWVudCBsaW5rPC9hPic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwpO1xuXHRcdGNvbnN0IHN0ciA9IHJlc3VsdC50b1N0cmluZygpO1xuXG5cdFx0YXNzZXJ0Lm9rKHN0ci5pbmNsdWRlcygnaHJlZj1cIiNzZWN0aW9uXCInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgZGF0YSBpbWFnZXMgYnkgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gJzxpbWcgc3JjPVwiZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFBRUFBQUFCQ0FZQUFBQWZGY1NKQUFBQURVbEVRVlI0Mm1QOC81K2hIZ0FIZ2dKL1BjaEk3d0FBQUFCSlJVNUVya0pnZ2c9PVwiPic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwpO1xuXHRcdGNvbnN0IHN0ciA9IHJlc3VsdC50b1N0cmluZygpO1xuXG5cdFx0YXNzZXJ0Lm9rKHN0ci5pbmNsdWRlcygnPGltZz4nKSk7XG5cdFx0YXNzZXJ0Lm9rKCFzdHIuaW5jbHVkZXMoJ3NyYz1cImRhdGE6JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3MgZGF0YSBpbWFnZXMgd2hlbiBlbmFibGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGltZyBzcmM9XCJkYXRhOmltYWdlL3BuZztiYXNlNjQsaVZCT1J3MEtHZ29BQUFBTlNVaEVVZ0FBQUFFQUFBQUJDQVlBQUFBZkZjU0pBQUFBRFVsRVFWUjQybVA4LzUraEhnQUhnZ0ovUGNoSTd3QUFBQUJKUlU1RXJrSmdnZz09XCI+Jztcblx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuXHRcdFx0YWxsb3dlZE1lZGlhUHJvdG9jb2xzOiB7IG92ZXJyaWRlOiBbU2NoZW1hcy5kYXRhXSB9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0LnRvU3RyaW5nKCkuaW5jbHVkZXMoJ3NyYz1cImRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JlbW92ZXMgcmVsYXRpdmUgcGF0aHMgZm9yIGltZyBzcmMgYnkgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gJzxpbWcgc3JjPVwicGF0aC9pbWcucG5nXCI+Jztcblx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCAnPGltZz4nKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FuIGFsbG93IHJlbGF0aXZlIHBhdGhzIGZvciBpbWFnZScsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gJzxpbWcgc3JjPVwicGF0aC9pbWcucG5nXCI+Jztcblx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuXHRcdFx0YWxsb3dSZWxhdGl2ZU1lZGlhUGF0aHM6IHRydWUsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCAnPGltZyBzcmM9XCJwYXRoL2ltZy5wbmdcIj4nKTtcblx0fSk7XG5cblx0dGVzdCgnU3VwcG9ydHMgZHluYW1pYyBhdHRyaWJ1dGUgc2FuaXRpemF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPGRpdiB0aXRsZT1cImFcIiBvdGhlcj1cIjFcIj50ZXh0MTwvZGl2PjxkaXYgdGl0bGU9XCJiXCIgb3RoZXI9XCIyXCI+dGV4dDI8L2Rpdj4nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRhbGxvd2VkQXR0cmlidXRlczoge1xuXHRcdFx0XHRvdmVycmlkZTogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGF0dHJpYnV0ZU5hbWU6ICd0aXRsZScsXG5cdFx0XHRcdFx0XHRzaG91bGRLZWVwOiAoX2VsLCBkYXRhKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBkYXRhLmF0dHJWYWx1ZS5pbmNsdWRlcygnYicpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9TdHJpbmcoKSwgJzxkaXY+dGV4dDE8L2Rpdj48ZGl2IHRpdGxlPVwiYlwiPnRleHQyPC9kaXY+Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N1cHBvcnRzIGNoYW5naW5nIGF0dHJpYnV0ZXMgaW4gZHluYW1pYyBzYW5pdGl6YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8ZGl2IHRpdGxlPVwiYWJjXCIgb3RoZXI9XCIxXCI+dGV4dDE8L2Rpdj48ZGl2IHRpdGxlPVwieHl6XCIgb3RoZXI9XCIyXCI+dGV4dDI8L2Rpdj4nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRhbGxvd2VkQXR0cmlidXRlczoge1xuXHRcdFx0XHRvdmVycmlkZTogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGF0dHJpYnV0ZU5hbWU6ICd0aXRsZScsXG5cdFx0XHRcdFx0XHRzaG91bGRLZWVwOiAoX2VsLCBkYXRhKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChkYXRhLmF0dHJWYWx1ZSA9PT0gJ2FiYycpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGRhdGEuYXR0clZhbHVlICsgZGF0YS5hdHRyVmFsdWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Ly8geHl6IHRpdGxlIHNob3VsZCBiZSBwcmVzZXJ2ZWQgYW5kIGRvdWJsZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksICc8ZGl2PnRleHQxPC9kaXY+PGRpdiB0aXRsZT1cInh5enh5elwiPnRleHQyPC9kaXY+Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0F0dHIgbmFtZSBzaG91bGQgY2xlYXIgcHJldmlvdXNseSBzZXQgZHluYW1pYyBzYW5pdGl6ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8ZGl2IHRpdGxlPVwiYWJjXCIgb3RoZXI9XCIxXCI+dGV4dDE8L2Rpdj48ZGl2IHRpdGxlPVwieHl6XCIgb3RoZXI9XCIyXCI+dGV4dDI8L2Rpdj4nO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRhbGxvd2VkQXR0cmlidXRlczoge1xuXHRcdFx0XHRvdmVycmlkZTogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGF0dHJpYnV0ZU5hbWU6ICd0aXRsZScsXG5cdFx0XHRcdFx0XHRzaG91bGRLZWVwOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J3RpdGxlJyAvLyBTaG91bGQgYWxsb3cgZXZlcnl0aGluZyBzaW5jZSBpdCBjb21lcyBhZnRlciBjdXN0b20gcnVsZVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCAnPGRpdiB0aXRsZT1cImFiY1wiPnRleHQxPC9kaXY+PGRpdiB0aXRsZT1cInh5elwiPnRleHQyPC9kaXY+Jyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXBsYWNlV2l0aFBsYWludGV4dCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlcGxhY2VzIHVuc3VwcG9ydGVkIHRhZ3Mgd2l0aCBwbGFpbnRleHQgcmVwcmVzZW50YXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBodG1sID0gJzxkaXY+c2FmZTxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD5jb250ZW50PC9kaXY+Jztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRcdHJlcGxhY2VXaXRoUGxhaW50ZXh0OiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHN0ciA9IHJlc3VsdC50b1N0cmluZygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ciwgYDxkaXY+c2FmZSZsdDtzY3JpcHQmZ3Q7YWxlcnQoMSkmbHQ7L3NjcmlwdCZndDtjb250ZW50PC9kaXY+YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHNlbGYtY2xvc2luZyB0YWdzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRcdGNvbnN0IGh0bWwgPSAnPGRpdj48aW5wdXQgdHlwZT1cInRleHRcIj48Y3VzdG9tLWlucHV0IC8+PC9kaXY+Jztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRcdHJlcGxhY2VXaXRoUGxhaW50ZXh0OiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9TdHJpbmcoKSwgJzxkaXY+Jmx0O2lucHV0IHR5cGU9XCJ0ZXh0XCImZ3Q7Jmx0O2N1c3RvbS1pbnB1dCZndDsmbHQ7L2N1c3RvbS1pbnB1dCZndDs8L2Rpdj4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgdGFncyB3aXRoIGF0dHJpYnV0ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBodG1sID0gJzxkaXY+PHVua25vd24tdGFnIGNsYXNzPVwidGVzdFwiIGlkPVwibXlpZFwiPmNvbnRlbnQ8L3Vua25vd24tdGFnPjwvZGl2Pic7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuXHRcdFx0XHRyZXBsYWNlV2l0aFBsYWludGV4dDogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksICc8ZGl2PiZsdDt1bmtub3duLXRhZyBjbGFzcz1cInRlc3RcIiBpZD1cIm15aWRcIiZndDtjb250ZW50Jmx0Oy91bmtub3duLXRhZyZndDs8L2Rpdj4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgbmVzdGVkIHVuc3VwcG9ydGVkIHRhZ3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBodG1sID0gJzxkaXY+PG91dGVyPjxpbm5lcj5uZXN0ZWQ8L2lubmVyPjwvb3V0ZXI+PC9kaXY+Jztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNhbml0aXplSHRtbChodG1sLCB7XG5cdFx0XHRcdHJlcGxhY2VXaXRoUGxhaW50ZXh0OiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9TdHJpbmcoKSwgJzxkaXY+Jmx0O291dGVyJmd0OyZsdDtpbm5lciZndDtuZXN0ZWQmbHQ7L2lubmVyJmd0OyZsdDsvb3V0ZXImZ3Q7PC9kaXY+Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGNvbW1lbnRzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRcdGNvbnN0IGh0bWwgPSAnPGRpdj48IS0tIHRoaXMgaXMgYSBjb21tZW50IC0tPmNvbnRlbnQ8L2Rpdj4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdFx0cmVwbGFjZVdpdGhQbGFpbnRleHQ6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCAnPGRpdj4mbHQ7IS0tIHRoaXMgaXMgYSBjb21tZW50IC0tJmd0O2NvbnRlbnQ8L2Rpdj4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgdGFncycsICgpID0+IHtcblx0XHRcdGNvbnN0IGh0bWwgPSAnPGRpdj48ZW1wdHk+PC9lbXB0eT48L2Rpdj4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdFx0cmVwbGFjZVdpdGhQbGFpbnRleHQ6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCAnPGRpdj4mbHQ7ZW1wdHkmZ3Q7Jmx0Oy9lbXB0eSZndDs8L2Rpdj4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dvcmtzIHdpdGggY3VzdG9tIGFsbG93ZWQgdGFncyBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaHRtbCA9ICc8ZGl2PjxjdXN0b20+YWxsb3dlZDwvY3VzdG9tPjxmb3JiaWRkZW4+bm90IGFsbG93ZWQ8L2ZvcmJpZGRlbj48L2Rpdj4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2FuaXRpemVIdG1sKGh0bWwsIHtcblx0XHRcdFx0cmVwbGFjZVdpdGhQbGFpbnRleHQ6IHRydWUsXG5cdFx0XHRcdGFsbG93ZWRUYWdzOiB7IGF1Z21lbnQ6IFsnY3VzdG9tJ10gfVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksICc8ZGl2PjxjdXN0b20+YWxsb3dlZDwvY3VzdG9tPiZsdDtmb3JiaWRkZW4mZ3Q7bm90IGFsbG93ZWQmbHQ7L2ZvcmJpZGRlbiZndDs8L2Rpdj4nKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJd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
