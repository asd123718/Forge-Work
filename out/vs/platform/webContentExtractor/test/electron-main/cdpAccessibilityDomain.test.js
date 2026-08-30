import * as assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { convertAXTreeToMarkdown } from "../../electron-main/cdpAccessibilityDomain.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("CDP Accessibility Domain", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const testUri = URI.parse("https://example.com/test");
  function createAXValue(type, value) {
    return { type, value };
  }
  function createAXProperty(name, value, type = "string") {
    return {
      name,
      value: createAXValue(type, value)
    };
  }
  test("empty tree returns empty string", () => {
    const result = convertAXTreeToMarkdown(testUri, []);
    assert.strictEqual(result, "");
  });
  test("simple heading conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        childIds: ["node2"],
        ignored: false,
        role: createAXValue("role", "heading"),
        name: createAXValue("string", "Test Heading"),
        properties: [
          createAXProperty("level", 2, "integer")
        ]
      },
      {
        nodeId: "node2",
        childIds: [],
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Test Heading")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), "## Test Heading");
  });
  test("paragraph with text conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "paragraph"),
        childIds: ["node2"]
      },
      {
        nodeId: "node2",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "This is a paragraph of text.")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), "This is a paragraph of text.");
  });
  test("really long paragraph should insert newlines at the space before 80 characters", () => {
    const longStr = [
      "This is a paragraph of text. It is really long. Like really really really really",
      "really really really really really really really long. That long."
    ];
    const nodes = [
      {
        nodeId: "node2",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", longStr.join(" "))
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), longStr.join("\n"));
  });
  test("list conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "list"),
        childIds: ["node2", "node3"]
      },
      {
        nodeId: "node2",
        ignored: false,
        role: createAXValue("role", "listitem"),
        childIds: ["node4", "node6"]
      },
      {
        nodeId: "node3",
        ignored: false,
        role: createAXValue("role", "listitem"),
        childIds: ["node5", "node7"]
      },
      {
        nodeId: "node4",
        ignored: false,
        role: createAXValue("role", "ListMarker"),
        name: createAXValue("string", "1. ")
      },
      {
        nodeId: "node5",
        ignored: false,
        role: createAXValue("role", "ListMarker"),
        name: createAXValue("string", "2. ")
      },
      {
        nodeId: "node6",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Item 1")
      },
      {
        nodeId: "node7",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Item 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
1. Item 1
2. Item 2

`;
    assert.strictEqual(result, expected);
  });
  test("nested list conversion", () => {
    const nodes = [
      {
        nodeId: "list1",
        ignored: false,
        role: createAXValue("role", "list"),
        childIds: ["item1", "item2"]
      },
      {
        nodeId: "item1",
        ignored: false,
        role: createAXValue("role", "listitem"),
        childIds: ["marker1", "text1", "nestedList"],
        properties: [
          createAXProperty("level", 1, "integer")
        ]
      },
      {
        nodeId: "marker1",
        ignored: false,
        role: createAXValue("role", "ListMarker"),
        name: createAXValue("string", "- ")
      },
      {
        nodeId: "text1",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Item 1")
      },
      {
        nodeId: "nestedList",
        ignored: false,
        role: createAXValue("role", "list"),
        childIds: ["nestedItem"]
      },
      {
        nodeId: "nestedItem",
        ignored: false,
        role: createAXValue("role", "listitem"),
        childIds: ["nestedMarker", "nestedText"],
        properties: [
          createAXProperty("level", 2, "integer")
        ]
      },
      {
        nodeId: "nestedMarker",
        ignored: false,
        role: createAXValue("role", "ListMarker"),
        name: createAXValue("string", "- ")
      },
      {
        nodeId: "nestedText",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Item 1a")
      },
      {
        nodeId: "item2",
        ignored: false,
        role: createAXValue("role", "listitem"),
        childIds: ["marker2", "text2"],
        properties: [
          createAXProperty("level", 1, "integer")
        ]
      },
      {
        nodeId: "marker2",
        ignored: false,
        role: createAXValue("role", "ListMarker"),
        name: createAXValue("string", "- ")
      },
      {
        nodeId: "text2",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Item 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const indent = "  ";
    const expected = `
- Item 1
${indent}- Item 1a
- Item 2

`;
    assert.strictEqual(result, expected);
  });
  test("links conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "paragraph"),
        childIds: ["node2"]
      },
      {
        nodeId: "node2",
        ignored: false,
        role: createAXValue("role", "link"),
        name: createAXValue("string", "Test Link"),
        properties: [
          createAXProperty("url", "https://test.com")
        ]
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), "[Test Link](https://test.com)");
  });
  test("links to same page are not converted to markdown links", () => {
    const pageUri = URI.parse("https://example.com/page");
    const nodes = [
      {
        nodeId: "link",
        ignored: false,
        role: createAXValue("role", "link"),
        name: createAXValue("string", "Current page link"),
        properties: [createAXProperty("url", "https://example.com/page?section=1#header")]
      }
    ];
    const result = convertAXTreeToMarkdown(pageUri, nodes);
    assert.strictEqual(result.includes("Current page link"), true);
    assert.strictEqual(result.includes("[Current page link]"), false);
  });
  test("image conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "image"),
        name: createAXValue("string", "Alt text"),
        properties: [
          createAXProperty("url", "https://test.com/image.png")
        ]
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), "![Alt text](https://test.com/image.png)");
  });
  test("image without URL shows alt text", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "image"),
        name: createAXValue("string", "Alt text")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), "[Image: Alt text]");
  });
  test("description list conversion", () => {
    const nodes = [
      {
        nodeId: "dl",
        ignored: false,
        role: createAXValue("role", "DescriptionList"),
        childIds: ["term1", "def1", "term2", "def2"]
      },
      {
        nodeId: "term1",
        ignored: false,
        role: createAXValue("role", "term"),
        childIds: ["termText1"]
      },
      {
        nodeId: "termText1",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Term 1")
      },
      {
        nodeId: "def1",
        ignored: false,
        role: createAXValue("role", "definition"),
        childIds: ["defText1"]
      },
      {
        nodeId: "defText1",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Definition 1")
      },
      {
        nodeId: "term2",
        ignored: false,
        role: createAXValue("role", "term"),
        childIds: ["termText2"]
      },
      {
        nodeId: "termText2",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Term 2")
      },
      {
        nodeId: "def2",
        ignored: false,
        role: createAXValue("role", "definition"),
        childIds: ["defText2"]
      },
      {
        nodeId: "defText2",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Definition 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.includes("- **Term 1** Definition 1"), true);
    assert.strictEqual(result.includes("- **Term 2** Definition 2"), true);
  });
  test("blockquote conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "blockquote"),
        name: createAXValue("string", "This is a blockquote\nWith multiple lines")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `> This is a blockquote
> With multiple lines`;
    assert.strictEqual(result.trim(), expected);
  });
  test("preformatted text conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "pre"),
        name: createAXValue("string", "function test() {\n  return true;\n}")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = "```\nfunction test() {\n  return true;\n}\n```";
    assert.strictEqual(result.trim(), expected);
  });
  test("code block conversion", () => {
    const nodes = [
      {
        nodeId: "code",
        ignored: false,
        role: createAXValue("role", "code"),
        childIds: ["codeText"]
      },
      {
        nodeId: "codeText",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "const x = 42;\nconsole.log(x);")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.includes("```"), true);
    assert.strictEqual(result.includes("const x = 42;"), true);
    assert.strictEqual(result.includes("console.log(x);"), true);
  });
  test("inline code conversion", () => {
    const nodes = [
      {
        nodeId: "code",
        ignored: false,
        role: createAXValue("role", "code"),
        childIds: ["codeText"]
      },
      {
        nodeId: "codeText",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "const x = 42;")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.includes("`const x = 42;`"), true);
  });
  test("table conversion", () => {
    const nodes = [
      {
        nodeId: "table1",
        ignored: false,
        role: createAXValue("role", "table"),
        childIds: ["row1", "row2"]
      },
      {
        nodeId: "row1",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["cell1", "cell2"]
      },
      {
        nodeId: "row2",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["cell3", "cell4"]
      },
      {
        nodeId: "cell1",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Header 1")
      },
      {
        nodeId: "cell2",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Header 2")
      },
      {
        nodeId: "cell3",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 1")
      },
      {
        nodeId: "cell4",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
| Header 1 | Header 2 |
| --- | --- |
| Data 1 | Data 2 |
`;
    assert.strictEqual(result.trim(), expected.trim());
  });
  test("table with columnheader role (th elements)", () => {
    const nodes = [
      {
        nodeId: "table1",
        ignored: false,
        role: createAXValue("role", "table"),
        childIds: ["row1", "row2"]
      },
      {
        nodeId: "row1",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["header1", "header2"]
      },
      {
        nodeId: "row2",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["cell3", "cell4"]
      },
      {
        nodeId: "header1",
        ignored: false,
        role: createAXValue("role", "columnheader"),
        name: createAXValue("string", "Header 1")
      },
      {
        nodeId: "header2",
        ignored: false,
        role: createAXValue("role", "columnheader"),
        name: createAXValue("string", "Header 2")
      },
      {
        nodeId: "cell3",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 1")
      },
      {
        nodeId: "cell4",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
| Header 1 | Header 2 |
| --- | --- |
| Data 1 | Data 2 |
`;
    assert.strictEqual(result.trim(), expected.trim());
  });
  test("table with rowheader role", () => {
    const nodes = [
      {
        nodeId: "table1",
        ignored: false,
        role: createAXValue("role", "table"),
        childIds: ["row1", "row2"]
      },
      {
        nodeId: "row1",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["rowheader1", "cell2"]
      },
      {
        nodeId: "row2",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["rowheader2", "cell4"]
      },
      {
        nodeId: "rowheader1",
        ignored: false,
        role: createAXValue("role", "rowheader"),
        name: createAXValue("string", "Row 1")
      },
      {
        nodeId: "cell2",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 1")
      },
      {
        nodeId: "rowheader2",
        ignored: false,
        role: createAXValue("role", "rowheader"),
        name: createAXValue("string", "Row 2")
      },
      {
        nodeId: "cell4",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
| Row 1 | Data 1 |
| --- | --- |
| Row 2 | Data 2 |
`;
    assert.strictEqual(result.trim(), expected.trim());
  });
  test("table with mixed cell types", () => {
    const nodes = [
      {
        nodeId: "table1",
        ignored: false,
        role: createAXValue("role", "table"),
        childIds: ["row1", "row2", "row3"]
      },
      {
        nodeId: "row1",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["header1", "header2", "header3"]
      },
      {
        nodeId: "row2",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["rowheader1", "cell2", "cell3"]
      },
      {
        nodeId: "row3",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["rowheader2", "cell4", "cell5"]
      },
      {
        nodeId: "header1",
        ignored: false,
        role: createAXValue("role", "columnheader"),
        name: createAXValue("string", "Name")
      },
      {
        nodeId: "header2",
        ignored: false,
        role: createAXValue("role", "columnheader"),
        name: createAXValue("string", "Age")
      },
      {
        nodeId: "header3",
        ignored: false,
        role: createAXValue("role", "columnheader"),
        name: createAXValue("string", "City")
      },
      {
        nodeId: "rowheader1",
        ignored: false,
        role: createAXValue("role", "rowheader"),
        name: createAXValue("string", "John")
      },
      {
        nodeId: "cell2",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "25")
      },
      {
        nodeId: "cell3",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "NYC")
      },
      {
        nodeId: "rowheader2",
        ignored: false,
        role: createAXValue("role", "rowheader"),
        name: createAXValue("string", "Jane")
      },
      {
        nodeId: "cell4",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "30")
      },
      {
        nodeId: "cell5",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "LA")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
| Name | Age | City |
| --- | --- | --- |
| John | 25 | NYC |
| Jane | 30 | LA |
`;
    assert.strictEqual(result.trim(), expected.trim());
  });
  test("table with gridcell role", () => {
    const nodes = [
      {
        nodeId: "table1",
        ignored: false,
        role: createAXValue("role", "table"),
        childIds: ["row1", "row2"]
      },
      {
        nodeId: "row1",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["cell1", "cell2"]
      },
      {
        nodeId: "row2",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["cell3", "cell4"]
      },
      {
        nodeId: "cell1",
        ignored: false,
        role: createAXValue("role", "gridcell"),
        name: createAXValue("string", "Header 1")
      },
      {
        nodeId: "cell2",
        ignored: false,
        role: createAXValue("role", "gridcell"),
        name: createAXValue("string", "Header 2")
      },
      {
        nodeId: "cell3",
        ignored: false,
        role: createAXValue("role", "gridcell"),
        name: createAXValue("string", "Data 1")
      },
      {
        nodeId: "cell4",
        ignored: false,
        role: createAXValue("role", "gridcell"),
        name: createAXValue("string", "Data 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
| Header 1 | Header 2 |
| --- | --- |
| Data 1 | Data 2 |
`;
    assert.strictEqual(result.trim(), expected.trim());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd2ViQ29udGVudEV4dHJhY3RvclxcdGVzdFxcZWxlY3Ryb24tbWFpblxcY2RwQWNjZXNzaWJpbGl0eURvbWFpbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQVhOb2RlLCBBWFByb3BlcnR5LCBBWFByb3BlcnR5TmFtZSwgQVhWYWx1ZVR5cGUsIGNvbnZlcnRBWFRyZWVUb01hcmtkb3duIH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tbWFpbi9jZHBBY2Nlc3NpYmlsaXR5RG9tYWluLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnQ0RQIEFjY2Vzc2liaWxpdHkgRG9tYWluJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB0ZXN0VXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3Rlc3QnKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVBWFZhbHVlKHR5cGU6IEFYVmFsdWVUeXBlLCB2YWx1ZTogYW55KSB7XG5cdFx0cmV0dXJuIHsgdHlwZSwgdmFsdWUgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUFYUHJvcGVydHkobmFtZTogQVhQcm9wZXJ0eU5hbWUsIHZhbHVlOiBhbnksIHR5cGU6IEFYVmFsdWVUeXBlID0gJ3N0cmluZycpOiBBWFByb3BlcnR5IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZSxcblx0XHRcdHZhbHVlOiBjcmVhdGVBWFZhbHVlKHR5cGUsIHZhbHVlKVxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdlbXB0eSB0cmVlIHJldHVybnMgZW1wdHkgc3RyaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnJyk7XG5cdH0pO1xuXG5cdC8vI3JlZ2lvbiBIZWFkaW5nIFRlc3RzXG5cblx0dGVzdCgnc2ltcGxlIGhlYWRpbmcgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnbm9kZTInXSxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnaGVhZGluZycpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnVGVzdCBIZWFkaW5nJyksXG5cdFx0XHRcdHByb3BlcnRpZXM6IFtcblx0XHRcdFx0XHRjcmVhdGVBWFByb3BlcnR5KCdsZXZlbCcsIDIsICdpbnRlZ2VyJylcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTInLFxuXHRcdFx0XHRjaGlsZElkczogW10sXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ1N0YXRpY1RleHQnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ1Rlc3QgSGVhZGluZycpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRyaW0oKSwgJyMjIFRlc3QgSGVhZGluZycpO1xuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUGFyYWdyYXBoIFRlc3RzXG5cblx0dGVzdCgncGFyYWdyYXBoIHdpdGggdGV4dCBjb252ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdwYXJhZ3JhcGgnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnbm9kZTInXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdUaGlzIGlzIGEgcGFyYWdyYXBoIG9mIHRleHQuJylcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCAnVGhpcyBpcyBhIHBhcmFncmFwaCBvZiB0ZXh0LicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFsbHkgbG9uZyBwYXJhZ3JhcGggc2hvdWxkIGluc2VydCBuZXdsaW5lcyBhdCB0aGUgc3BhY2UgYmVmb3JlIDgwIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9uZ1N0ciA9IFtcblx0XHRcdCdUaGlzIGlzIGEgcGFyYWdyYXBoIG9mIHRleHQuIEl0IGlzIHJlYWxseSBsb25nLiBMaWtlIHJlYWxseSByZWFsbHkgcmVhbGx5IHJlYWxseScsXG5cdFx0XHQncmVhbGx5IHJlYWxseSByZWFsbHkgcmVhbGx5IHJlYWxseSByZWFsbHkgcmVhbGx5IGxvbmcuIFRoYXQgbG9uZy4nXG5cdFx0XTtcblxuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsIGxvbmdTdHIuam9pbignICcpKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50cmltKCksIGxvbmdTdHIuam9pbignXFxuJykpO1xuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTGlzdCBUZXN0c1xuXG5cdHRlc3QoJ2xpc3QgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnbGlzdCcpLFxuXHRcdFx0XHRjaGlsZElkczogWydub2RlMicsICdub2RlMyddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdub2RlMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2xpc3RpdGVtJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ25vZGU0JywgJ25vZGU2J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUzJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnbGlzdGl0ZW0nKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnbm9kZTUnLCAnbm9kZTcnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTQnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdMaXN0TWFya2VyJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICcxLiAnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTUnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdMaXN0TWFya2VyJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICcyLiAnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTYnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdJdGVtIDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTcnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdJdGVtIDInKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPVxuXHRcdFx0YFxuMS4gSXRlbSAxXG4yLiBJdGVtIDJcblxuYDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25lc3RlZCBsaXN0IGNvbnZlcnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdsaXN0MScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2xpc3QnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnaXRlbTEnLCAnaXRlbTInXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnaXRlbTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdsaXN0aXRlbScpLFxuXHRcdFx0XHRjaGlsZElkczogWydtYXJrZXIxJywgJ3RleHQxJywgJ25lc3RlZExpc3QnXSxcblx0XHRcdFx0cHJvcGVydGllczogW1xuXHRcdFx0XHRcdGNyZWF0ZUFYUHJvcGVydHkoJ2xldmVsJywgMSwgJ2ludGVnZXInKVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdtYXJrZXIxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnTGlzdE1hcmtlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnLSAnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAndGV4dDEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdJdGVtIDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbmVzdGVkTGlzdCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2xpc3QnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnbmVzdGVkSXRlbSddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICduZXN0ZWRJdGVtJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnbGlzdGl0ZW0nKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnbmVzdGVkTWFya2VyJywgJ25lc3RlZFRleHQnXSxcblx0XHRcdFx0cHJvcGVydGllczogW1xuXHRcdFx0XHRcdGNyZWF0ZUFYUHJvcGVydHkoJ2xldmVsJywgMiwgJ2ludGVnZXInKVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICduZXN0ZWRNYXJrZXInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdMaXN0TWFya2VyJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICctICcpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICduZXN0ZWRUZXh0Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnU3RhdGljVGV4dCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnSXRlbSAxYScpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdpdGVtMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2xpc3RpdGVtJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ21hcmtlcjInLCAndGV4dDInXSxcblx0XHRcdFx0cHJvcGVydGllczogW1xuXHRcdFx0XHRcdGNyZWF0ZUFYUHJvcGVydHkoJ2xldmVsJywgMSwgJ2ludGVnZXInKVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdtYXJrZXIyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnTGlzdE1hcmtlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnLSAnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAndGV4dDInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdJdGVtIDInKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0Y29uc3QgaW5kZW50ID0gJyAgJztcblx0XHRjb25zdCBleHBlY3RlZCA9XG5cdFx0XHRgXG4tIEl0ZW0gMVxuJHtpbmRlbnR9LSBJdGVtIDFhXG4tIEl0ZW0gMlxuXG5gO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIExpbmtzIFRlc3RzXG5cblx0dGVzdCgnbGlua3MgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncGFyYWdyYXBoJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ25vZGUyJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnbGluaycpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnVGVzdCBMaW5rJyksXG5cdFx0XHRcdHByb3BlcnRpZXM6IFtcblx0XHRcdFx0XHRjcmVhdGVBWFByb3BlcnR5KCd1cmwnLCAnaHR0cHM6Ly90ZXN0LmNvbScpXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCAnW1Rlc3QgTGlua10oaHR0cHM6Ly90ZXN0LmNvbSknKTtcblx0fSk7XG5cblx0dGVzdCgnbGlua3MgdG8gc2FtZSBwYWdlIGFyZSBub3QgY29udmVydGVkIHRvIG1hcmtkb3duIGxpbmtzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhZ2VVcmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpO1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbGluaycsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2xpbmsnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0N1cnJlbnQgcGFnZSBsaW5rJyksXG5cdFx0XHRcdHByb3BlcnRpZXM6IFtjcmVhdGVBWFByb3BlcnR5KCd1cmwnLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlP3NlY3Rpb249MSNoZWFkZXInKV1cblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24ocGFnZVVyaSwgbm9kZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5jbHVkZXMoJ0N1cnJlbnQgcGFnZSBsaW5rJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5jbHVkZXMoJ1tDdXJyZW50IHBhZ2UgbGlua10nKSwgZmFsc2UpO1xuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gSW1hZ2UgVGVzdHNcblxuXHR0ZXN0KCdpbWFnZSBjb252ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdpbWFnZScpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnQWx0IHRleHQnKSxcblx0XHRcdFx0cHJvcGVydGllczogW1xuXHRcdFx0XHRcdGNyZWF0ZUFYUHJvcGVydHkoJ3VybCcsICdodHRwczovL3Rlc3QuY29tL2ltYWdlLnBuZycpXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCAnIVtBbHQgdGV4dF0oaHR0cHM6Ly90ZXN0LmNvbS9pbWFnZS5wbmcpJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ltYWdlIHdpdGhvdXQgVVJMIHNob3dzIGFsdCB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdpbWFnZScpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnQWx0IHRleHQnKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50cmltKCksICdbSW1hZ2U6IEFsdCB0ZXh0XScpO1xuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRGVzY3JpcHRpb24gTGlzdCBUZXN0c1xuXG5cdHRlc3QoJ2Rlc2NyaXB0aW9uIGxpc3QgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2RsJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnRGVzY3JpcHRpb25MaXN0JyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ3Rlcm0xJywgJ2RlZjEnLCAndGVybTInLCAnZGVmMiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICd0ZXJtMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3Rlcm0nKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsndGVybVRleHQxJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3Rlcm1UZXh0MScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ1N0YXRpY1RleHQnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ1Rlcm0gMScpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdkZWYxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnZGVmaW5pdGlvbicpLFxuXHRcdFx0XHRjaGlsZElkczogWydkZWZUZXh0MSddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdkZWZUZXh0MScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ1N0YXRpY1RleHQnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0RlZmluaXRpb24gMScpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICd0ZXJtMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3Rlcm0nKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsndGVybVRleHQyJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3Rlcm1UZXh0MicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ1N0YXRpY1RleHQnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ1Rlcm0gMicpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdkZWYyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnZGVmaW5pdGlvbicpLFxuXHRcdFx0XHRjaGlsZElkczogWydkZWZUZXh0MiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdkZWZUZXh0MicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ1N0YXRpY1RleHQnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0RlZmluaXRpb24gMicpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmluY2x1ZGVzKCctICoqVGVybSAxKiogRGVmaW5pdGlvbiAxJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5jbHVkZXMoJy0gKipUZXJtIDIqKiBEZWZpbml0aW9uIDInKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBCbG9ja3F1b3RlIFRlc3RzXG5cblx0dGVzdCgnYmxvY2txdW90ZSBjb252ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdibG9ja3F1b3RlJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdUaGlzIGlzIGEgYmxvY2txdW90ZVxcbldpdGggbXVsdGlwbGUgbGluZXMnKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPVxuXHRcdFx0YD4gVGhpcyBpcyBhIGJsb2NrcXVvdGVcbj4gV2l0aCBtdWx0aXBsZSBsaW5lc2A7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50cmltKCksIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIENvZGUgVGVzdHNcblxuXHR0ZXN0KCdwcmVmb3JtYXR0ZWQgdGV4dCBjb252ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdwcmUnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ2Z1bmN0aW9uIHRlc3QoKSB7XFxuICByZXR1cm4gdHJ1ZTtcXG59Jylcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID1cblx0XHRcdCdgYGBcXG5mdW5jdGlvbiB0ZXN0KCkge1xcbiAgcmV0dXJuIHRydWU7XFxufVxcbmBgYCc7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50cmltKCksIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnY29kZSBibG9jayBjb252ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY29kZScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NvZGUnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnY29kZVRleHQnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY29kZVRleHQnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdjb25zdCB4ID0gNDI7XFxuY29uc29sZS5sb2coeCk7Jylcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5jbHVkZXMoJ2BgYCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmluY2x1ZGVzKCdjb25zdCB4ID0gNDI7JyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5jbHVkZXMoJ2NvbnNvbGUubG9nKHgpOycpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaW5saW5lIGNvZGUgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NvZGUnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjb2RlJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ2NvZGVUZXh0J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NvZGVUZXh0Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnU3RhdGljVGV4dCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnY29uc3QgeCA9IDQyOycpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmluY2x1ZGVzKCdgY29uc3QgeCA9IDQyO2AnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBUYWJsZSBUZXN0c1xuXG5cdHRlc3QoJ3RhYmxlIGNvbnZlcnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICd0YWJsZTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICd0YWJsZScpLFxuXHRcdFx0XHRjaGlsZElkczogWydyb3cxJywgJ3JvdzInXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93MScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3JvdycpLFxuXHRcdFx0XHRjaGlsZElkczogWydjZWxsMScsICdjZWxsMiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdyb3cyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncm93JyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ2NlbGwzJywgJ2NlbGw0J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NlbGwxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnY2VsbCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnSGVhZGVyIDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdIZWFkZXIgMicpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsMycsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0RhdGEgMScpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsNCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0RhdGEgMicpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRjb25zdCBleHBlY3RlZCA9XG5cdFx0XHRgXG58IEhlYWRlciAxIHwgSGVhZGVyIDIgfFxufCAtLS0gfCAtLS0gfFxufCBEYXRhIDEgfCBEYXRhIDIgfFxuYDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRyaW0oKSwgZXhwZWN0ZWQudHJpbSgpKTtcblx0fSk7XG5cblx0dGVzdCgndGFibGUgd2l0aCBjb2x1bW5oZWFkZXIgcm9sZSAodGggZWxlbWVudHMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAndGFibGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAndGFibGUnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsncm93MScsICdyb3cyJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3JvdzEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdyb3cnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnaGVhZGVyMScsICdoZWFkZXIyJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3JvdzInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdyb3cnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnY2VsbDMnLCAnY2VsbDQnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnaGVhZGVyMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NvbHVtbmhlYWRlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnSGVhZGVyIDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnaGVhZGVyMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NvbHVtbmhlYWRlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnSGVhZGVyIDInKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDMnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdEYXRhIDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDQnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdEYXRhIDInKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPVxuXHRcdFx0YFxufCBIZWFkZXIgMSB8IEhlYWRlciAyIHxcbnwgLS0tIHwgLS0tIHxcbnwgRGF0YSAxIHwgRGF0YSAyIHxcbmA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50cmltKCksIGV4cGVjdGVkLnRyaW0oKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RhYmxlIHdpdGggcm93aGVhZGVyIHJvbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICd0YWJsZTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICd0YWJsZScpLFxuXHRcdFx0XHRjaGlsZElkczogWydyb3cxJywgJ3JvdzInXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93MScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3JvdycpLFxuXHRcdFx0XHRjaGlsZElkczogWydyb3doZWFkZXIxJywgJ2NlbGwyJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3JvdzInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdyb3cnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsncm93aGVhZGVyMicsICdjZWxsNCddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdyb3doZWFkZXIxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncm93aGVhZGVyJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdSb3cgMScpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0RhdGEgMScpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdyb3doZWFkZXIyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncm93aGVhZGVyJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdSb3cgMicpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsNCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0RhdGEgMicpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRjb25zdCBleHBlY3RlZCA9XG5cdFx0XHRgXG58IFJvdyAxIHwgRGF0YSAxIHxcbnwgLS0tIHwgLS0tIHxcbnwgUm93IDIgfCBEYXRhIDIgfFxuYDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRyaW0oKSwgZXhwZWN0ZWQudHJpbSgpKTtcblx0fSk7XG5cblx0dGVzdCgndGFibGUgd2l0aCBtaXhlZCBjZWxsIHR5cGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAndGFibGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAndGFibGUnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsncm93MScsICdyb3cyJywgJ3JvdzMnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93MScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3JvdycpLFxuXHRcdFx0XHRjaGlsZElkczogWydoZWFkZXIxJywgJ2hlYWRlcjInLCAnaGVhZGVyMyddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdyb3cyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncm93JyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ3Jvd2hlYWRlcjEnLCAnY2VsbDInLCAnY2VsbDMnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93MycsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3JvdycpLFxuXHRcdFx0XHRjaGlsZElkczogWydyb3doZWFkZXIyJywgJ2NlbGw0JywgJ2NlbGw1J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2hlYWRlcjEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjb2x1bW5oZWFkZXInKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ05hbWUnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnaGVhZGVyMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NvbHVtbmhlYWRlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnQWdlJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2hlYWRlcjMnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjb2x1bW5oZWFkZXInKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0NpdHknKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93aGVhZGVyMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3Jvd2hlYWRlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnSm9obicpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJzI1Jylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NlbGwzJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnY2VsbCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnTllDJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3Jvd2hlYWRlcjInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdyb3doZWFkZXInKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0phbmUnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDQnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICczMCcpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsNScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0xBJylcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID1cblx0XHRcdGBcbnwgTmFtZSB8IEFnZSB8IENpdHkgfFxufCAtLS0gfCAtLS0gfCAtLS0gfFxufCBKb2huIHwgMjUgfCBOWUMgfFxufCBKYW5lIHwgMzAgfCBMQSB8XG5gO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCBleHBlY3RlZC50cmltKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YWJsZSB3aXRoIGdyaWRjZWxsIHJvbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICd0YWJsZTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICd0YWJsZScpLFxuXHRcdFx0XHRjaGlsZElkczogWydyb3cxJywgJ3JvdzInXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93MScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3JvdycpLFxuXHRcdFx0XHRjaGlsZElkczogWydjZWxsMScsICdjZWxsMiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdyb3cyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncm93JyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ2NlbGwzJywgJ2NlbGw0J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NlbGwxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnZ3JpZGNlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0hlYWRlciAxJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NlbGwyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnZ3JpZGNlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0hlYWRlciAyJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NlbGwzJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnZ3JpZGNlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0RhdGEgMScpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsNCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2dyaWRjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdEYXRhIDInKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPVxuXHRcdFx0YFxufCBIZWFkZXIgMSB8IEhlYWRlciAyIHxcbnwgLS0tIHwgLS0tIHxcbnwgRGF0YSAxIHwgRGF0YSAyIHxcbmA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50cmltKCksIGV4cGVjdGVkLnRyaW0oKSk7XG5cdH0pO1xuXG5cdC8vI2VuZHJlZ2lvblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQTBELCtCQUErQjtBQUN6RixTQUFTLCtDQUErQztBQUV4RCxNQUFNLDRCQUE0QixNQUFNO0FBQ3ZDLDBDQUF3QztBQUV4QyxRQUFNLFVBQVUsSUFBSSxNQUFNLDBCQUEwQjtBQUVwRCxXQUFTLGNBQWMsTUFBbUIsT0FBWTtBQUNyRCxXQUFPLEVBQUUsTUFBTSxNQUFNO0FBQUEsRUFDdEI7QUFFQSxXQUFTLGlCQUFpQixNQUFzQixPQUFZLE9BQW9CLFVBQXNCO0FBQ3JHLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQSxPQUFPLGNBQWMsTUFBTSxLQUFLO0FBQUEsSUFDakM7QUFBQSxFQUNEO0FBRUEsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxVQUFNLFNBQVMsd0JBQXdCLFNBQVMsQ0FBQyxDQUFDO0FBQ2xELFdBQU8sWUFBWSxRQUFRLEVB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LFVBQVUsQ0FBQyxjQUFjLFNBQVMsT0FBTztBQUFBLE1BQzFDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFFBQ1QsTUFBTSxjQUFjLFFBQVEsS0FBSztBQUFBLFFBQ2pDLFVBQVUsQ0FBQyxjQUFjLFNBQVMsT0FBTztBQUFBLE1BQzFDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFFBQ1QsTUFBTSxjQUFjLFFBQVEsY0FBYztBQUFBLFFBQzFDLE1BQU0sY0FBYyxVQUFVLE1BQU07QUFBQSxNQUNyQztBQUFBLE1BQ0E7QUFBQSxRQUNDLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxRQUNULE1BQU0sY0FBYyxRQUFRLGNBQWM7QUFBQSxRQUMxQyxNQUFNLGNBQWMsVUFBVSxLQUFLO0FBQUEsTUFDcEM7QUFBQSxNQUNBO0FBQUEsUUFDQyxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsUUFDVCxNQUFNLGNBQWMsUUFBUSxjQUFjO0FBQUEsUUFDMUMsTUFBTSxjQUFjLFVBQVUsTUFBTTtBQUFBLE1BQ3JDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFFBQ1QsTUFBTSxjQUFjLFFBQVEsV0FBVztBQUFBLFFBQ3ZDLE1BQU0sY0FBYyxVQUFVLE1BQU07QUFBQSxNQUNyQztBQUFBLE1BQ0E7QUFBQSxRQUNDLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxRQUNULE1BQU0sY0FBYyxRQUFRLE1BQU07QUFBQSxRQUNsQyxNQUFNLGNBQWMsVUFBVSxJQUFJO0FBQUEsTUFDbkM7QUFBQSxNQUNBO0FBQUEsUUFDQyxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsUUFDVCxNQUFNLGNBQWMsUUFBUSxNQUFNO0FBQUEsUUFDbEMsTUFBTSxjQUFjLFVBQVUsS0FBSztBQUFBLE1BQ3BDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFFBQ1QsTUFBTSxjQUFjLFFBQVEsV0FBVztBQUFBLFFBQ3ZDLE1BQU0sY0FBYyxVQUFVLE1BQU07QUFBQSxNQUNyQztBQUFBLE1BQ0E7QUFBQSxRQUNDLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxRQUNULE1BQU0sY0FBYyxRQUFRLE1BQU07QUFBQSxRQUNsQyxNQUFNLGNBQWMsVUFBVSxJQUFJO0FBQUEsTUFDbkM7QUFBQSxNQUNBO0FBQUEsUUFDQyxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsUUFDVCxNQUFNLGNBQWMsUUFBUSxNQUFNO0FBQUEsUUFDbEMsTUFBTSxjQUFjLFVBQVUsSUFBSTtBQUFBLE1BQ25DO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBUyx3QkFBd0IsU0FBUyxLQUFLO0FBQ3JELFVBQU0sV0FDTDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFNRCxXQUFPLFlBQVksT0FBTyxLQUFLLEdBQUcsU0FBUyxLQUFLLENBQUM7QUFBQSxFQUNsRCxDQUFDO0FBRUQsT0FBSyw0QkFBNEIsTUFBTTtBQUN0QyxVQUFNLFFBQWtCO0FBQUEsTUFDdkI7QUFBQSxRQUNDLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxRQUNULE1BQU0sY0FBYyxRQUFRLE9BQU87QUFBQSxRQUNuQyxVQUFVLENBQUMsUUFBUSxNQUFNO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUEsUUFDQyxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsUUFDVCxNQUFNLGNBQWMsUUFBUSxLQUFLO0FBQUEsUUFDakMsVUFBVSxDQUFDLFNBQVMsT0FBTztBQUFBLE1BQzVCO0FBQUEsTUFDQTtBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFFBQ1QsTUFBTSxjQUFjLFFBQVEsS0FBSztBQUFBLFFBQ2pDLFVBQVUsQ0FBQyxTQUFTLE9BQU87QUFBQSxNQUM1QjtBQUFBLE1BQ0E7QUFBQSxRQUNDLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxRQUNULE1BQU0sY0FBYyxRQUFRLFVBQVU7QUFBQSxRQUN0QyxNQUFNLGNBQWMsVUFBVSxVQUFVO0FBQUEsTUFDekM7QUFBQSxNQUNBO0FBQUEsUUFDQyxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsUUFDVCxNQUFNLGNBQWMsUUFBUSxVQUFVO0FBQUEsUUFDdEMsTUFBTSxjQUFjLFVBQVUsVUFBVTtBQUFBLE1BQ3pDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFFBQ1QsTUFBTSxjQUFjLFFBQVEsVUFBVTtBQUFBLFFBQ3RDLE1BQU0sY0FBYyxVQUFVLFFBQVE7QUFBQSxNQUN2QztBQUFBLE1BQ0E7QUFBQSxRQUNDLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxRQUNULE1BQU0sY0FBYyxRQUFRLFVBQVU7QUFBQSxRQUN0QyxNQUFNLGNBQWMsVUFBVSxRQUFRO0FBQUEsTUFDdkM7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLHdCQUF3QixTQUFTLEtBQUs7QUFDckQsVUFBTSxXQUNMO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFLRCxXQUFPLFlBQVksT0FBTyxLQUFLLEdBQUcsU0FBUyxLQUFLLENBQUM7QUFBQSxFQUNsRCxDQUFDO0FBR0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
