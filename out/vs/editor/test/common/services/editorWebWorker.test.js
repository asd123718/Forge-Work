import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { EditorWorker } from "../../../common/services/editorWebWorker.js";
suite("EditorWebWorker", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class WorkerWithModels extends EditorWorker {
    getModel(uri) {
      return this._getModel(uri);
    }
    addModel(lines, eol = "\n") {
      const uri = "test:file#" + Date.now();
      this.$acceptNewModel({
        url: uri,
        versionId: 1,
        lines,
        EOL: eol
      });
      return this._getModel(uri);
    }
  }
  let worker;
  let model;
  setup(() => {
    worker = new WorkerWithModels();
    model = worker.addModel([
      "This is line one",
      //16
      "and this is line number two",
      //27
      "it is followed by #3",
      //20
      "and finished with the fourth."
      //29
    ]);
  });
  function assertPositionAt(offset, line, column) {
    const position = model.positionAt(offset);
    assert.strictEqual(position.lineNumber, line);
    assert.strictEqual(position.column, column);
  }
  function assertOffsetAt(lineNumber, column, offset) {
    const actual = model.offsetAt({ lineNumber, column });
    assert.strictEqual(actual, offset);
  }
  test("ICommonModel#offsetAt", () => {
    assertOffsetAt(1, 1, 0);
    assertOffsetAt(1, 2, 1);
    assertOffsetAt(1, 17, 16);
    assertOffsetAt(2, 1, 17);
    assertOffsetAt(2, 4, 20);
    assertOffsetAt(3, 1, 45);
    assertOffsetAt(5, 30, 95);
    assertOffsetAt(5, 31, 95);
    assertOffsetAt(5, Number.MAX_VALUE, 95);
    assertOffsetAt(6, 30, 95);
    assertOffsetAt(Number.MAX_VALUE, 30, 95);
    assertOffsetAt(Number.MAX_VALUE, Number.MAX_VALUE, 95);
  });
  test("ICommonModel#positionAt", () => {
    assertPositionAt(0, 1, 1);
    assertPositionAt(Number.MIN_VALUE, 1, 1);
    assertPositionAt(1, 1, 2);
    assertPositionAt(16, 1, 17);
    assertPositionAt(17, 2, 1);
    assertPositionAt(20, 2, 4);
    assertPositionAt(45, 3, 1);
    assertPositionAt(95, 4, 30);
    assertPositionAt(96, 4, 30);
    assertPositionAt(99, 4, 30);
    assertPositionAt(Number.MAX_VALUE, 4, 30);
  });
  test("ICommonModel#validatePosition, issue #15882", function() {
    const model2 = worker.addModel(['{"id": "0001","type": "donut","name": "Cake","image":{"url": "images/0001.jpg","width": 200,"height": 200},"thumbnail":{"url": "images/thumbnails/0001.jpg","width": 32,"height": 32}}']);
    assert.strictEqual(model2.offsetAt({ lineNumber: 1, column: 2 }), 1);
  });
  test("MoreMinimal", () => {
    return worker.$computeMoreMinimalEdits(model.uri.toString(), [{ text: "This is line One", range: new Range(1, 1, 1, 17) }], false).then((edits) => {
      assert.strictEqual(edits.length, 1);
      const [first] = edits;
      assert.strictEqual(first.text, "O");
      assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 14, endLineNumber: 1, endColumn: 15 });
    });
  });
  test("MoreMinimal, merge adjacent edits", async function() {
    const model2 = worker.addModel([
      "one",
      "two",
      "three",
      "four",
      "five"
    ], "\n");
    const newEdits = await worker.$computeMoreMinimalEdits(model2.uri.toString(), [
      {
        range: new Range(1, 1, 2, 1),
        text: "one\ntwo\nthree\n"
      },
      {
        range: new Range(2, 1, 3, 1),
        text: ""
      },
      {
        range: new Range(3, 1, 4, 1),
        text: ""
      },
      {
        range: new Range(4, 2, 4, 3),
        text: "4"
      },
      {
        range: new Range(5, 3, 5, 5),
        text: "5"
      }
    ], false);
    assert.strictEqual(newEdits.length, 2);
    assert.strictEqual(newEdits[0].text, "4");
    assert.strictEqual(newEdits[1].text, "5");
  });
  test("MoreMinimal, issue #15385 newline changes only", function() {
    const model2 = worker.addModel([
      "{",
      '	"a":1',
      "}"
    ], "\n");
    return worker.$computeMoreMinimalEdits(model2.uri.toString(), [{ text: '{\r\n	"a":1\r\n}', range: new Range(1, 1, 3, 2) }], false).then((edits) => {
      assert.strictEqual(edits.length, 0);
    });
  });
  test("MoreMinimal, issue #15385 newline changes and other", function() {
    const model2 = worker.addModel([
      "{",
      '	"a":1',
      "}"
    ], "\n");
    return worker.$computeMoreMinimalEdits(model2.uri.toString(), [{ text: '{\r\n	"b":1\r\n}', range: new Range(1, 1, 3, 2) }], false).then((edits) => {
      assert.strictEqual(edits.length, 1);
      const [first] = edits;
      assert.strictEqual(first.text, "b");
      assert.deepStrictEqual(first.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 4 });
    });
  });
  test("MoreMinimal, issue #15385 newline changes and other 2/2", function() {
    const model2 = worker.addModel([
      "package main",
      // 1
      "func foo() {",
      // 2
      "}"
      // 3
    ]);
    return worker.$computeMoreMinimalEdits(model2.uri.toString(), [{ text: "\n", range: new Range(3, 2, 4, 1e3) }], false).then((edits) => {
      assert.strictEqual(edits.length, 1);
      const [first] = edits;
      assert.strictEqual(first.text, "\n");
      assert.deepStrictEqual(first.range, { startLineNumber: 3, startColumn: 2, endLineNumber: 3, endColumn: 2 });
    });
  });
  async function testEdits(lines, edits) {
    const model2 = worker.addModel(lines);
    const smallerEdits = await worker.$computeHumanReadableDiff(
      model2.uri.toString(),
      edits,
      { ignoreTrimWhitespace: false, maxComputationTimeMs: 0, computeMoves: false }
    );
    const t1 = applyEdits(model2.getValue(), edits);
    const t2 = applyEdits(model2.getValue(), smallerEdits);
    assert.deepStrictEqual(t1, t2);
    return smallerEdits.map((e) => ({ range: Range.lift(e.range).toString(), text: e.text }));
  }
  test("computeHumanReadableDiff 1", async () => {
    assert.deepStrictEqual(
      await testEdits(
        [
          "function test() {}"
        ],
        [{
          text: "\n/** Some Comment */\n",
          range: new Range(1, 1, 1, 1)
        }]
      ),
      [{ range: "[1,1 -> 1,1]", text: "\n/** Some Comment */\n" }]
    );
  });
  test("computeHumanReadableDiff 2", async () => {
    assert.deepStrictEqual(
      await testEdits(
        [
          "function test() {}"
        ],
        [{
          text: "function test(myParam: number) { console.log(myParam); }",
          range: new Range(1, 1, 1, Number.MAX_SAFE_INTEGER)
        }]
      ),
      [{ range: "[1,15 -> 1,15]", text: "myParam: number" }, { range: "[1,18 -> 1,18]", text: " console.log(myParam); " }]
    );
  });
  test("computeHumanReadableDiff 3", async () => {
    assert.deepStrictEqual(
      await testEdits(
        [
          "",
          "",
          "",
          ""
        ],
        [{
          text: "function test(myParam: number) { console.log(myParam); }\n\n",
          range: new Range(2, 1, 3, 20)
        }]
      ),
      [{ range: "[2,1 -> 2,1]", text: "function test(myParam: number) { console.log(myParam); }\n" }]
    );
  });
  test("computeHumanReadableDiff 4", async () => {
    assert.deepStrictEqual(
      await testEdits(
        [
          "function algorithm() {}"
        ],
        [{
          text: "function alm() {}",
          range: new Range(1, 1, 1, Number.MAX_SAFE_INTEGER)
        }]
      ),
      [{ range: "[1,10 -> 1,19]", text: "alm" }]
    );
  });
  test('[Bug] Getting Message "Overlapping ranges are not allowed" and nothing happens with Inline-Chat ', async function() {
    await testEdits(
      "const API = require('../src/api');\n\ndescribe('API', () => {\n  let api;\n  let database;\n\n  beforeAll(() => {\n    database = {\n      getAllBooks: jest.fn(),\n      getBooksByAuthor: jest.fn(),\n      getBooksByTitle: jest.fn(),\n    };\n    api = new API(database);\n  });\n\n  describe('GET /books', () => {\n    it('should return all books', async () => {\n      const mockBooks = [{ title: 'Book 1' }, { title: 'Book 2' }];\n      database.getAllBooks.mockResolvedValue(mockBooks);\n\n      const req = {};\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === '/books') {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getAllBooks).toHaveBeenCalled();\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n\n  describe('GET /books/author/:author', () => {\n    it('should return books by author', async () => {\n      const mockAuthor = 'John Doe';\n      const mockBooks = [{ title: 'Book 1', author: mockAuthor }, { title: 'Book 2', author: mockAuthor }];\n      database.getBooksByAuthor.mockResolvedValue(mockBooks);\n\n      const req = {\n        params: {\n          author: mockAuthor,\n        },\n      };\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === `/books/author/${mockAuthor}`) {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getBooksByAuthor).toHaveBeenCalledWith(mockAuthor);\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n\n  describe('GET /books/title/:title', () => {\n    it('should return books by title', async () => {\n      const mockTitle = 'Book 1';\n      const mockBooks = [{ title: mockTitle, author: 'John Doe' }];\n      database.getBooksByTitle.mockResolvedValue(mockBooks);\n\n      const req = {\n        params: {\n          title: mockTitle,\n        },\n      };\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === `/books/title/${mockTitle}`) {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getBooksByTitle).toHaveBeenCalledWith(mockTitle);\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n});\n".split("\n"),
      [{
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 96, endColumn: 1 },
        text: `const request = require('supertest');
const API = require('../src/api');

describe('API', () => {
  let api;
  let database;

  beforeAll(() => {
    database = {
      getAllBooks: jest.fn(),
      getBooksByAuthor: jest.fn(),
      getBooksByTitle: jest.fn(),
    };
    api = new API(database);
  });

  describe('GET /books', () => {
    it('should return all books', async () => {
      const mockBooks = [{ title: 'Book 1' }, { title: 'Book 2' }];
      database.getAllBooks.mockResolvedValue(mockBooks);

      const response = await request(api.app).get('/books');

      expect(database.getAllBooks).toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooks);
    });
  });

  describe('GET /books/author/:author', () => {
    it('should return books by author', async () => {
      const mockAuthor = 'John Doe';
      const mockBooks = [{ title: 'Book 1', author: mockAuthor }, { title: 'Book 2', author: mockAuthor }];
      database.getBooksByAuthor.mockResolvedValue(mockBooks);

      const response = await request(api.app).get(\`/books/author/\${mockAuthor}\`);

      expect(database.getBooksByAuthor).toHaveBeenCalledWith(mockAuthor);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooks);
    });
  });

  describe('GET /books/title/:title', () => {
    it('should return books by title', async () => {
      const mockTitle = 'Book 1';
      const mockBooks = [{ title: mockTitle, author: 'John Doe' }];
      database.getBooksByTitle.mockResolvedValue(mockBooks);

      const response = await request(api.app).get(\`/books/title/\${mockTitle}\`);

      expect(database.getBooksByTitle).toHaveBeenCalledWith(mockTitle);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooks);
    });
  });
});
`
      }]
    );
  });
  test("ICommonModel#getValueInRange, issue #17424", function() {
    const model2 = worker.addModel([
      "package main",
      // 1
      "func foo() {",
      // 2
      "}"
      // 3
    ]);
    const value = model2.getValueInRange({ startLineNumber: 3, startColumn: 1, endLineNumber: 4, endColumn: 1 });
    assert.strictEqual(value, "}");
  });
  test("textualSuggest, issue #17785", function() {
    const model2 = worker.addModel([
      "foobar",
      // 1
      "f f"
      // 2
    ]);
    return worker.$textualSuggest([model2.uri.toString()], "f", "[a-z]+", "img").then((result) => {
      if (!result) {
        assert.ok(false);
      }
      assert.strictEqual(result.words.length, 1);
      assert.strictEqual(typeof result.duration, "number");
      assert.strictEqual(result.words[0], "foobar");
    });
  });
  test("get words via iterator, issue #46930", function() {
    const model2 = worker.addModel([
      "one line",
      // 1
      "two line",
      // 2
      "",
      "past empty",
      "single",
      "",
      "and now we are done"
    ]);
    const words = [...model2.words(/[a-z]+/img)];
    assert.deepStrictEqual(words, ["one", "line", "two", "line", "past", "empty", "single", "and", "now", "we", "are", "done"]);
  });
});
function applyEdits(text, edits) {
  const transformer = new PositionOffsetTransformer(text);
  const offsetEdits = edits.map((e) => {
    const range = Range.lift(e.range);
    return {
      startOffset: transformer.getOffset(range.getStartPosition()),
      endOffset: transformer.getOffset(range.getEndPosition()),
      text: e.text
    };
  });
  offsetEdits.sort((a, b) => b.startOffset - a.startOffset);
  for (const edit of offsetEdits) {
    text = text.substring(0, edit.startOffset) + edit.text + text.substring(edit.endOffset);
  }
  return text;
}
class PositionOffsetTransformer {
  constructor(text) {
    this.text = text;
    this.lineStartOffsetByLineIdx = [];
    this.lineStartOffsetByLineIdx.push(0);
    for (let i = 0; i < text.length; i++) {
      if (text.charAt(i) === "\n") {
        this.lineStartOffsetByLineIdx.push(i + 1);
      }
    }
    this.lineStartOffsetByLineIdx.push(text.length + 1);
  }
  getOffset(position) {
    const maxLineOffset = position.lineNumber >= this.lineStartOffsetByLineIdx.length ? this.text.length : this.lineStartOffsetByLineIdx[position.lineNumber] - 1;
    return Math.min(this.lineStartOffsetByLineIdx[position.lineNumber - 1] + position.column - 1, maxLineOffset);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcc2VydmljZXNcXGVkaXRvcldlYldvcmtlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yV29ya2VyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2VkaXRvcldlYldvcmtlci5qcyc7XG5pbXBvcnQgeyBJQ29tbW9uTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvdGV4dE1vZGVsU3luYy90ZXh0TW9kZWxTeW5jLmltcGwuanMnO1xuXG5zdWl0ZSgnRWRpdG9yV2ViV29ya2VyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIFdvcmtlcldpdGhNb2RlbHMgZXh0ZW5kcyBFZGl0b3JXb3JrZXIge1xuXG5cdFx0Z2V0TW9kZWwodXJpOiBzdHJpbmcpIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRNb2RlbCh1cmkpO1xuXHRcdH1cblxuXHRcdGFkZE1vZGVsKGxpbmVzOiBzdHJpbmdbXSwgZW9sOiBzdHJpbmcgPSAnXFxuJykge1xuXHRcdFx0Y29uc3QgdXJpID0gJ3Rlc3Q6ZmlsZSMnICsgRGF0ZS5ub3coKTtcblx0XHRcdHRoaXMuJGFjY2VwdE5ld01vZGVsKHtcblx0XHRcdFx0dXJsOiB1cmksXG5cdFx0XHRcdHZlcnNpb25JZDogMSxcblx0XHRcdFx0bGluZXM6IGxpbmVzLFxuXHRcdFx0XHRFT0w6IGVvbFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0TW9kZWwodXJpKSE7XG5cdFx0fVxuXHR9XG5cblx0bGV0IHdvcmtlcjogV29ya2VyV2l0aE1vZGVscztcblx0bGV0IG1vZGVsOiBJQ29tbW9uTW9kZWw7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHdvcmtlciA9IG5ldyBXb3JrZXJXaXRoTW9kZWxzKCk7XG5cdFx0bW9kZWwgPSB3b3JrZXIuYWRkTW9kZWwoW1xuXHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLCAvLzE2XG5cdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJywgLy8yN1xuXHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJywgLy8yMFxuXHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJywgLy8yOVxuXHRcdF0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBhc3NlcnRQb3NpdGlvbkF0KG9mZnNldDogbnVtYmVyLCBsaW5lOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKSB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBtb2RlbC5wb3NpdGlvbkF0KG9mZnNldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvc2l0aW9uLmxpbmVOdW1iZXIsIGxpbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb3NpdGlvbi5jb2x1bW4sIGNvbHVtbik7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRPZmZzZXRBdChsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBvZmZzZXQ6IG51bWJlcikge1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1vZGVsLm9mZnNldEF0KHsgbGluZU51bWJlciwgY29sdW1uIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIG9mZnNldCk7XG5cdH1cblxuXHR0ZXN0KCdJQ29tbW9uTW9kZWwjb2Zmc2V0QXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMSwgMSwgMCk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMSwgMiwgMSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMSwgMTcsIDE2KTtcblx0XHRhc3NlcnRPZmZzZXRBdCgyLCAxLCAxNyk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMiwgNCwgMjApO1xuXHRcdGFzc2VydE9mZnNldEF0KDMsIDEsIDQ1KTtcblx0XHRhc3NlcnRPZmZzZXRBdCg1LCAzMCwgOTUpO1xuXHRcdGFzc2VydE9mZnNldEF0KDUsIDMxLCA5NSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoNSwgTnVtYmVyLk1BWF9WQUxVRSwgOTUpO1xuXHRcdGFzc2VydE9mZnNldEF0KDYsIDMwLCA5NSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoTnVtYmVyLk1BWF9WQUxVRSwgMzAsIDk1KTtcblx0XHRhc3NlcnRPZmZzZXRBdChOdW1iZXIuTUFYX1ZBTFVFLCBOdW1iZXIuTUFYX1ZBTFVFLCA5NSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0lDb21tb25Nb2RlbCNwb3NpdGlvbkF0JywgKCkgPT4ge1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoMCwgMSwgMSk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdChOdW1iZXIuTUlOX1ZBTFVFLCAxLCAxKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDEsIDEsIDIpO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoMTYsIDEsIDE3KTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDE3LCAyLCAxKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDIwLCAyLCA0KTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDQ1LCAzLCAxKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDk1LCA0LCAzMCk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdCg5NiwgNCwgMzApO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoOTksIDQsIDMwKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KE51bWJlci5NQVhfVkFMVUUsIDQsIDMwKTtcblx0fSk7XG5cblx0dGVzdCgnSUNvbW1vbk1vZGVsI3ZhbGlkYXRlUG9zaXRpb24sIGlzc3VlICMxNTg4MicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbCA9IHdvcmtlci5hZGRNb2RlbChbJ3tcImlkXCI6IFwiMDAwMVwiLFwidHlwZVwiOiBcImRvbnV0XCIsXCJuYW1lXCI6IFwiQ2FrZVwiLFwiaW1hZ2VcIjp7XCJ1cmxcIjogXCJpbWFnZXMvMDAwMS5qcGdcIixcIndpZHRoXCI6IDIwMCxcImhlaWdodFwiOiAyMDB9LFwidGh1bWJuYWlsXCI6e1widXJsXCI6IFwiaW1hZ2VzL3RodW1ibmFpbHMvMDAwMS5qcGdcIixcIndpZHRoXCI6IDMyLFwiaGVpZ2h0XCI6IDMyfX0nXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm9mZnNldEF0KHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAyIH0pLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnTW9yZU1pbmltYWwnLCAoKSA9PiB7XG5cblx0XHRyZXR1cm4gd29ya2VyLiRjb21wdXRlTW9yZU1pbmltYWxFZGl0cyhtb2RlbC51cmkudG9TdHJpbmcoKSwgW3sgdGV4dDogJ1RoaXMgaXMgbGluZSBPbmUnLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDE3KSB9XSwgZmFsc2UpLnRoZW4oZWRpdHMgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBbZmlyc3RdID0gZWRpdHM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dCwgJ08nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMTQsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMTUgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ01vcmVNaW5pbWFsLCBtZXJnZSBhZGphY2VudCBlZGl0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1vZGVsID0gd29ya2VyLmFkZE1vZGVsKFtcblx0XHRcdCdvbmUnLFxuXHRcdFx0J3R3bycsXG5cdFx0XHQndGhyZWUnLFxuXHRcdFx0J2ZvdXInLFxuXHRcdFx0J2ZpdmUnXG5cdFx0XSwgJ1xcbicpO1xuXG5cblx0XHRjb25zdCBuZXdFZGl0cyA9IGF3YWl0IHdvcmtlci4kY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMobW9kZWwudXJpLnRvU3RyaW5nKCksIFtcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAyLCAxKSxcblx0XHRcdFx0dGV4dDogJ29uZVxcbnR3b1xcbnRocmVlXFxuJyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAzLCAxKSxcblx0XHRcdFx0dGV4dDogJycsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMywgMSwgNCwgMSksXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDQsIDIsIDQsIDMpLFxuXHRcdFx0XHR0ZXh0OiAnNCcsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoNSwgMywgNSwgNSksXG5cdFx0XHRcdHRleHQ6ICc1Jyxcblx0XHRcdH1cblx0XHRdLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3RWRpdHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3RWRpdHNbMF0udGV4dCwgJzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3RWRpdHNbMV0udGV4dCwgJzUnKTtcblx0fSk7XG5cblx0dGVzdCgnTW9yZU1pbmltYWwsIGlzc3VlICMxNTM4NSBuZXdsaW5lIGNoYW5nZXMgb25seScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1vZGVsID0gd29ya2VyLmFkZE1vZGVsKFtcblx0XHRcdCd7Jyxcblx0XHRcdCdcXHRcImFcIjoxJyxcblx0XHRcdCd9J1xuXHRcdF0sICdcXG4nKTtcblxuXHRcdHJldHVybiB3b3JrZXIuJGNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKG1vZGVsLnVyaS50b1N0cmluZygpLCBbeyB0ZXh0OiAne1xcclxcblxcdFwiYVwiOjFcXHJcXG59JywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAzLCAyKSB9XSwgZmFsc2UpLnRoZW4oZWRpdHMgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ01vcmVNaW5pbWFsLCBpc3N1ZSAjMTUzODUgbmV3bGluZSBjaGFuZ2VzIGFuZCBvdGhlcicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1vZGVsID0gd29ya2VyLmFkZE1vZGVsKFtcblx0XHRcdCd7Jyxcblx0XHRcdCdcXHRcImFcIjoxJyxcblx0XHRcdCd9J1xuXHRcdF0sICdcXG4nKTtcblxuXHRcdHJldHVybiB3b3JrZXIuJGNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKG1vZGVsLnVyaS50b1N0cmluZygpLCBbeyB0ZXh0OiAne1xcclxcblxcdFwiYlwiOjFcXHJcXG59JywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAzLCAyKSB9XSwgZmFsc2UpLnRoZW4oZWRpdHMgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBbZmlyc3RdID0gZWRpdHM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dCwgJ2InKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMywgZW5kTGluZU51bWJlcjogMiwgZW5kQ29sdW1uOiA0IH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNb3JlTWluaW1hbCwgaXNzdWUgIzE1Mzg1IG5ld2xpbmUgY2hhbmdlcyBhbmQgb3RoZXIgMi8yJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB3b3JrZXIuYWRkTW9kZWwoW1xuXHRcdFx0J3BhY2thZ2UgbWFpbicsXHQvLyAxXG5cdFx0XHQnZnVuYyBmb28oKSB7JyxcdC8vIDJcblx0XHRcdCd9J1x0XHRcdFx0Ly8gM1xuXHRcdF0pO1xuXG5cdFx0cmV0dXJuIHdvcmtlci4kY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMobW9kZWwudXJpLnRvU3RyaW5nKCksIFt7IHRleHQ6ICdcXG4nLCByYW5nZTogbmV3IFJhbmdlKDMsIDIsIDQsIDEwMDApIH1dLCBmYWxzZSkudGhlbihlZGl0cyA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IFtmaXJzdF0gPSBlZGl0cztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50ZXh0LCAnXFxuJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMywgc3RhcnRDb2x1bW46IDIsIGVuZExpbmVOdW1iZXI6IDMsIGVuZENvbHVtbjogMiB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdEVkaXRzKGxpbmVzOiBzdHJpbmdbXSwgZWRpdHM6IFRleHRFZGl0W10pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBtb2RlbCA9IHdvcmtlci5hZGRNb2RlbChsaW5lcyk7XG5cblx0XHRjb25zdCBzbWFsbGVyRWRpdHMgPSBhd2FpdCB3b3JrZXIuJGNvbXB1dGVIdW1hblJlYWRhYmxlRGlmZihcblx0XHRcdG1vZGVsLnVyaS50b1N0cmluZygpLFxuXHRcdFx0ZWRpdHMsXG5cdFx0XHR7IGlnbm9yZVRyaW1XaGl0ZXNwYWNlOiBmYWxzZSwgbWF4Q29tcHV0YXRpb25UaW1lTXM6IDAsIGNvbXB1dGVNb3ZlczogZmFsc2UgfVxuXHRcdCk7XG5cblx0XHRjb25zdCB0MSA9IGFwcGx5RWRpdHMobW9kZWwuZ2V0VmFsdWUoKSwgZWRpdHMpO1xuXHRcdGNvbnN0IHQyID0gYXBwbHlFZGl0cyhtb2RlbC5nZXRWYWx1ZSgpLCBzbWFsbGVyRWRpdHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodDEsIHQyKTtcblxuXHRcdHJldHVybiBzbWFsbGVyRWRpdHMubWFwKGUgPT4gKHsgcmFuZ2U6IFJhbmdlLmxpZnQoZS5yYW5nZSkudG9TdHJpbmcoKSwgdGV4dDogZS50ZXh0IH0pKTtcblx0fVxuXG5cblx0dGVzdCgnY29tcHV0ZUh1bWFuUmVhZGFibGVEaWZmIDEnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGF3YWl0IHRlc3RFZGl0cyhcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdmdW5jdGlvbiB0ZXN0KCkge30nXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0dGV4dDogJ1xcbi8qKiBTb21lIENvbW1lbnQgKi9cXG4nLFxuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSlcblx0XHRcdFx0fV0pLFxuXHRcdFx0KFt7IHJhbmdlOiAnWzEsMSAtPiAxLDFdJywgdGV4dDogJ1xcbi8qKiBTb21lIENvbW1lbnQgKi9cXG4nIH1dKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXB1dGVIdW1hblJlYWRhYmxlRGlmZiAyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCB0ZXN0RWRpdHMoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnZnVuY3Rpb24gdGVzdCgpIHt9J1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdHRleHQ6ICdmdW5jdGlvbiB0ZXN0KG15UGFyYW06IG51bWJlcikgeyBjb25zb2xlLmxvZyhteVBhcmFtKTsgfScsXG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUilcblx0XHRcdFx0fV0pLFxuXHRcdFx0KFt7IHJhbmdlOiAnWzEsMTUgLT4gMSwxNV0nLCB0ZXh0OiAnbXlQYXJhbTogbnVtYmVyJyB9LCB7IHJhbmdlOiAnWzEsMTggLT4gMSwxOF0nLCB0ZXh0OiAnIGNvbnNvbGUubG9nKG15UGFyYW0pOyAnIH1dKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXB1dGVIdW1hblJlYWRhYmxlRGlmZiAzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCB0ZXN0RWRpdHMoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnJ1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdHRleHQ6ICdmdW5jdGlvbiB0ZXN0KG15UGFyYW06IG51bWJlcikgeyBjb25zb2xlLmxvZyhteVBhcmFtKTsgfVxcblxcbicsXG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAzLCAyMClcblx0XHRcdFx0fV0pLFxuXHRcdFx0KFt7IHJhbmdlOiAnWzIsMSAtPiAyLDFdJywgdGV4dDogJ2Z1bmN0aW9uIHRlc3QobXlQYXJhbTogbnVtYmVyKSB7IGNvbnNvbGUubG9nKG15UGFyYW0pOyB9XFxuJyB9XSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlSHVtYW5SZWFkYWJsZURpZmYgNCcsIGFzeW5jICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YXdhaXQgdGVzdEVkaXRzKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2Z1bmN0aW9uIGFsZ29yaXRobSgpIHt9Jyxcblx0XHRcdFx0XSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHR0ZXh0OiAnZnVuY3Rpb24gYWxtKCkge30nLFxuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpXG5cdFx0XHRcdH1dKSxcblx0XHRcdChbeyByYW5nZTogJ1sxLDEwIC0+IDEsMTldJywgdGV4dDogJ2FsbScgfV0pXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0J1Z10gR2V0dGluZyBNZXNzYWdlIFwiT3ZlcmxhcHBpbmcgcmFuZ2VzIGFyZSBub3QgYWxsb3dlZFwiIGFuZCBub3RoaW5nIGhhcHBlbnMgd2l0aCBJbmxpbmUtQ2hhdCAnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgdGVzdEVkaXRzKCgnY29uc3QgQVBJID0gcmVxdWlyZShcXCcuLi9zcmMvYXBpXFwnKTtcXG5cXG5kZXNjcmliZShcXCdBUElcXCcsICgpID0+IHtcXG4gIGxldCBhcGk7XFxuICBsZXQgZGF0YWJhc2U7XFxuXFxuICBiZWZvcmVBbGwoKCkgPT4ge1xcbiAgICBkYXRhYmFzZSA9IHtcXG4gICAgICBnZXRBbGxCb29rczogamVzdC5mbigpLFxcbiAgICAgIGdldEJvb2tzQnlBdXRob3I6IGplc3QuZm4oKSxcXG4gICAgICBnZXRCb29rc0J5VGl0bGU6IGplc3QuZm4oKSxcXG4gICAgfTtcXG4gICAgYXBpID0gbmV3IEFQSShkYXRhYmFzZSk7XFxuICB9KTtcXG5cXG4gIGRlc2NyaWJlKFxcJ0dFVCAvYm9va3NcXCcsICgpID0+IHtcXG4gICAgaXQoXFwnc2hvdWxkIHJldHVybiBhbGwgYm9va3NcXCcsIGFzeW5jICgpID0+IHtcXG4gICAgICBjb25zdCBtb2NrQm9va3MgPSBbeyB0aXRsZTogXFwnQm9vayAxXFwnIH0sIHsgdGl0bGU6IFxcJ0Jvb2sgMlxcJyB9XTtcXG4gICAgICBkYXRhYmFzZS5nZXRBbGxCb29rcy5tb2NrUmVzb2x2ZWRWYWx1ZShtb2NrQm9va3MpO1xcblxcbiAgICAgIGNvbnN0IHJlcSA9IHt9O1xcbiAgICAgIGNvbnN0IHJlcyA9IHtcXG4gICAgICAgIGpzb246IGplc3QuZm4oKSxcXG4gICAgICB9O1xcblxcbiAgICAgIGF3YWl0IGFwaS5yZWdpc3Rlcih7XFxuICAgICAgICBnZXQ6IChwYXRoLCBoYW5kbGVyKSA9PiB7XFxuICAgICAgICAgIGlmIChwYXRoID09PSBcXCcvYm9va3NcXCcpIHtcXG4gICAgICAgICAgICBoYW5kbGVyKHJlcSwgcmVzKTtcXG4gICAgICAgICAgfVxcbiAgICAgICAgfSxcXG4gICAgICB9KTtcXG5cXG4gICAgICBleHBlY3QoZGF0YWJhc2UuZ2V0QWxsQm9va3MpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcXG4gICAgICBleHBlY3QocmVzLmpzb24pLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKG1vY2tCb29rcyk7XFxuICAgIH0pO1xcbiAgfSk7XFxuXFxuICBkZXNjcmliZShcXCdHRVQgL2Jvb2tzL2F1dGhvci86YXV0aG9yXFwnLCAoKSA9PiB7XFxuICAgIGl0KFxcJ3Nob3VsZCByZXR1cm4gYm9va3MgYnkgYXV0aG9yXFwnLCBhc3luYyAoKSA9PiB7XFxuICAgICAgY29uc3QgbW9ja0F1dGhvciA9IFxcJ0pvaG4gRG9lXFwnO1xcbiAgICAgIGNvbnN0IG1vY2tCb29rcyA9IFt7IHRpdGxlOiBcXCdCb29rIDFcXCcsIGF1dGhvcjogbW9ja0F1dGhvciB9LCB7IHRpdGxlOiBcXCdCb29rIDJcXCcsIGF1dGhvcjogbW9ja0F1dGhvciB9XTtcXG4gICAgICBkYXRhYmFzZS5nZXRCb29rc0J5QXV0aG9yLm1vY2tSZXNvbHZlZFZhbHVlKG1vY2tCb29rcyk7XFxuXFxuICAgICAgY29uc3QgcmVxID0ge1xcbiAgICAgICAgcGFyYW1zOiB7XFxuICAgICAgICAgIGF1dGhvcjogbW9ja0F1dGhvcixcXG4gICAgICAgIH0sXFxuICAgICAgfTtcXG4gICAgICBjb25zdCByZXMgPSB7XFxuICAgICAgICBqc29uOiBqZXN0LmZuKCksXFxuICAgICAgfTtcXG5cXG4gICAgICBhd2FpdCBhcGkucmVnaXN0ZXIoe1xcbiAgICAgICAgZ2V0OiAocGF0aCwgaGFuZGxlcikgPT4ge1xcbiAgICAgICAgICBpZiAocGF0aCA9PT0gYC9ib29rcy9hdXRob3IvJHttb2NrQXV0aG9yfWApIHtcXG4gICAgICAgICAgICBoYW5kbGVyKHJlcSwgcmVzKTtcXG4gICAgICAgICAgfVxcbiAgICAgICAgfSxcXG4gICAgICB9KTtcXG5cXG4gICAgICBleHBlY3QoZGF0YWJhc2UuZ2V0Qm9va3NCeUF1dGhvcikudG9IYXZlQmVlbkNhbGxlZFdpdGgobW9ja0F1dGhvcik7XFxuICAgICAgZXhwZWN0KHJlcy5qc29uKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChtb2NrQm9va3MpO1xcbiAgICB9KTtcXG4gIH0pO1xcblxcbiAgZGVzY3JpYmUoXFwnR0VUIC9ib29rcy90aXRsZS86dGl0bGVcXCcsICgpID0+IHtcXG4gICAgaXQoXFwnc2hvdWxkIHJldHVybiBib29rcyBieSB0aXRsZVxcJywgYXN5bmMgKCkgPT4ge1xcbiAgICAgIGNvbnN0IG1vY2tUaXRsZSA9IFxcJ0Jvb2sgMVxcJztcXG4gICAgICBjb25zdCBtb2NrQm9va3MgPSBbeyB0aXRsZTogbW9ja1RpdGxlLCBhdXRob3I6IFxcJ0pvaG4gRG9lXFwnIH1dO1xcbiAgICAgIGRhdGFiYXNlLmdldEJvb2tzQnlUaXRsZS5tb2NrUmVzb2x2ZWRWYWx1ZShtb2NrQm9va3MpO1xcblxcbiAgICAgIGNvbnN0IHJlcSA9IHtcXG4gICAgICAgIHBhcmFtczoge1xcbiAgICAgICAgICB0aXRsZTogbW9ja1RpdGxlLFxcbiAgICAgICAgfSxcXG4gICAgICB9O1xcbiAgICAgIGNvbnN0IHJlcyA9IHtcXG4gICAgICAgIGpzb246IGplc3QuZm4oKSxcXG4gICAgICB9O1xcblxcbiAgICAgIGF3YWl0IGFwaS5yZWdpc3Rlcih7XFxuICAgICAgICBnZXQ6IChwYXRoLCBoYW5kbGVyKSA9PiB7XFxuICAgICAgICAgIGlmIChwYXRoID09PSBgL2Jvb2tzL3RpdGxlLyR7bW9ja1RpdGxlfWApIHtcXG4gICAgICAgICAgICBoYW5kbGVyKHJlcSwgcmVzKTtcXG4gICAgICAgICAgfVxcbiAgICAgICAgfSxcXG4gICAgICB9KTtcXG5cXG4gICAgICBleHBlY3QoZGF0YWJhc2UuZ2V0Qm9va3NCeVRpdGxlKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChtb2NrVGl0bGUpO1xcbiAgICAgIGV4cGVjdChyZXMuanNvbikudG9IYXZlQmVlbkNhbGxlZFdpdGgobW9ja0Jvb2tzKTtcXG4gICAgfSk7XFxuICB9KTtcXG59KTtcXG4nKS5zcGxpdCgnXFxuJyksXG5cdFx0XHRbe1xuXHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA5NiwgZW5kQ29sdW1uOiAxIH0sXG5cdFx0XHRcdHRleHQ6IGBjb25zdCByZXF1ZXN0ID0gcmVxdWlyZSgnc3VwZXJ0ZXN0Jyk7XFxuY29uc3QgQVBJID0gcmVxdWlyZSgnLi4vc3JjL2FwaScpO1xcblxcbmRlc2NyaWJlKCdBUEknLCAoKSA9PiB7XFxuICBsZXQgYXBpO1xcbiAgbGV0IGRhdGFiYXNlO1xcblxcbiAgYmVmb3JlQWxsKCgpID0+IHtcXG4gICAgZGF0YWJhc2UgPSB7XFxuICAgICAgZ2V0QWxsQm9va3M6IGplc3QuZm4oKSxcXG4gICAgICBnZXRCb29rc0J5QXV0aG9yOiBqZXN0LmZuKCksXFxuICAgICAgZ2V0Qm9va3NCeVRpdGxlOiBqZXN0LmZuKCksXFxuICAgIH07XFxuICAgIGFwaSA9IG5ldyBBUEkoZGF0YWJhc2UpO1xcbiAgfSk7XFxuXFxuICBkZXNjcmliZSgnR0VUIC9ib29rcycsICgpID0+IHtcXG4gICAgaXQoJ3Nob3VsZCByZXR1cm4gYWxsIGJvb2tzJywgYXN5bmMgKCkgPT4ge1xcbiAgICAgIGNvbnN0IG1vY2tCb29rcyA9IFt7IHRpdGxlOiAnQm9vayAxJyB9LCB7IHRpdGxlOiAnQm9vayAyJyB9XTtcXG4gICAgICBkYXRhYmFzZS5nZXRBbGxCb29rcy5tb2NrUmVzb2x2ZWRWYWx1ZShtb2NrQm9va3MpO1xcblxcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdChhcGkuYXBwKS5nZXQoJy9ib29rcycpO1xcblxcbiAgICAgIGV4cGVjdChkYXRhYmFzZS5nZXRBbGxCb29rcykudG9IYXZlQmVlbkNhbGxlZCgpO1xcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXMpLnRvQmUoMjAwKTtcXG4gICAgICBleHBlY3QocmVzcG9uc2UuYm9keSkudG9FcXVhbChtb2NrQm9va3MpO1xcbiAgICB9KTtcXG4gIH0pO1xcblxcbiAgZGVzY3JpYmUoJ0dFVCAvYm9va3MvYXV0aG9yLzphdXRob3InLCAoKSA9PiB7XFxuICAgIGl0KCdzaG91bGQgcmV0dXJuIGJvb2tzIGJ5IGF1dGhvcicsIGFzeW5jICgpID0+IHtcXG4gICAgICBjb25zdCBtb2NrQXV0aG9yID0gJ0pvaG4gRG9lJztcXG4gICAgICBjb25zdCBtb2NrQm9va3MgPSBbeyB0aXRsZTogJ0Jvb2sgMScsIGF1dGhvcjogbW9ja0F1dGhvciB9LCB7IHRpdGxlOiAnQm9vayAyJywgYXV0aG9yOiBtb2NrQXV0aG9yIH1dO1xcbiAgICAgIGRhdGFiYXNlLmdldEJvb2tzQnlBdXRob3IubW9ja1Jlc29sdmVkVmFsdWUobW9ja0Jvb2tzKTtcXG5cXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QoYXBpLmFwcCkuZ2V0KFxcYC9ib29rcy9hdXRob3IvXFwke21vY2tBdXRob3J9XFxgKTtcXG5cXG4gICAgICBleHBlY3QoZGF0YWJhc2UuZ2V0Qm9va3NCeUF1dGhvcikudG9IYXZlQmVlbkNhbGxlZFdpdGgobW9ja0F1dGhvcik7XFxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1cykudG9CZSgyMDApO1xcbiAgICAgIGV4cGVjdChyZXNwb25zZS5ib2R5KS50b0VxdWFsKG1vY2tCb29rcyk7XFxuICAgIH0pO1xcbiAgfSk7XFxuXFxuICBkZXNjcmliZSgnR0VUIC9ib29rcy90aXRsZS86dGl0bGUnLCAoKSA9PiB7XFxuICAgIGl0KCdzaG91bGQgcmV0dXJuIGJvb2tzIGJ5IHRpdGxlJywgYXN5bmMgKCkgPT4ge1xcbiAgICAgIGNvbnN0IG1vY2tUaXRsZSA9ICdCb29rIDEnO1xcbiAgICAgIGNvbnN0IG1vY2tCb29rcyA9IFt7IHRpdGxlOiBtb2NrVGl0bGUsIGF1dGhvcjogJ0pvaG4gRG9lJyB9XTtcXG4gICAgICBkYXRhYmFzZS5nZXRCb29rc0J5VGl0bGUubW9ja1Jlc29sdmVkVmFsdWUobW9ja0Jvb2tzKTtcXG5cXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QoYXBpLmFwcCkuZ2V0KFxcYC9ib29rcy90aXRsZS9cXCR7bW9ja1RpdGxlfVxcYCk7XFxuXFxuICAgICAgZXhwZWN0KGRhdGFiYXNlLmdldEJvb2tzQnlUaXRsZSkudG9IYXZlQmVlbkNhbGxlZFdpdGgobW9ja1RpdGxlKTtcXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzKS50b0JlKDIwMCk7XFxuICAgICAgZXhwZWN0KHJlc3BvbnNlLmJvZHkpLnRvRXF1YWwobW9ja0Jvb2tzKTtcXG4gICAgfSk7XFxuICB9KTtcXG59KTtcXG5gLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJQ29tbW9uTW9kZWwjZ2V0VmFsdWVJblJhbmdlLCBpc3N1ZSAjMTc0MjQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IHdvcmtlci5hZGRNb2RlbChbXG5cdFx0XHQncGFja2FnZSBtYWluJyxcdC8vIDFcblx0XHRcdCdmdW5jIGZvbygpIHsnLFx0Ly8gMlxuXHRcdFx0J30nXHRcdFx0XHQvLyAzXG5cdFx0XSk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZSh7IHN0YXJ0TGluZU51bWJlcjogMywgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDQsIGVuZENvbHVtbjogMSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsICd9Jyk7XG5cdH0pO1xuXG5cblx0dGVzdCgndGV4dHVhbFN1Z2dlc3QsIGlzc3VlICMxNzc4NScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1vZGVsID0gd29ya2VyLmFkZE1vZGVsKFtcblx0XHRcdCdmb29iYXInLFx0Ly8gMVxuXHRcdFx0J2YgZidcdC8vIDJcblx0XHRdKTtcblxuXHRcdHJldHVybiB3b3JrZXIuJHRleHR1YWxTdWdnZXN0KFttb2RlbC51cmkudG9TdHJpbmcoKV0sICdmJywgJ1thLXpdKycsICdpbWcnKS50aGVuKChyZXN1bHQpID0+IHtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdGFzc2VydC5vayhmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LndvcmRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdC5kdXJhdGlvbiwgJ251bWJlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC53b3Jkc1swXSwgJ2Zvb2JhcicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXQgd29yZHMgdmlhIGl0ZXJhdG9yLCBpc3N1ZSAjNDY5MzAnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IHdvcmtlci5hZGRNb2RlbChbXG5cdFx0XHQnb25lIGxpbmUnLFx0Ly8gMVxuXHRcdFx0J3R3byBsaW5lJyxcdC8vIDJcblx0XHRcdCcnLFxuXHRcdFx0J3Bhc3QgZW1wdHknLFxuXHRcdFx0J3NpbmdsZScsXG5cdFx0XHQnJyxcblx0XHRcdCdhbmQgbm93IHdlIGFyZSBkb25lJ1xuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgd29yZHM6IHN0cmluZ1tdID0gWy4uLm1vZGVsLndvcmRzKC9bYS16XSsvaW1nKV07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHdvcmRzLCBbJ29uZScsICdsaW5lJywgJ3R3bycsICdsaW5lJywgJ3Bhc3QnLCAnZW1wdHknLCAnc2luZ2xlJywgJ2FuZCcsICdub3cnLCAnd2UnLCAnYXJlJywgJ2RvbmUnXSk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIGFwcGx5RWRpdHModGV4dDogc3RyaW5nLCBlZGl0czogeyByYW5nZTogSVJhbmdlOyB0ZXh0OiBzdHJpbmcgfVtdKTogc3RyaW5nIHtcblx0Y29uc3QgdHJhbnNmb3JtZXIgPSBuZXcgUG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lcih0ZXh0KTtcblx0Y29uc3Qgb2Zmc2V0RWRpdHMgPSBlZGl0cy5tYXAoZSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5saWZ0KGUucmFuZ2UpO1xuXHRcdHJldHVybiAoe1xuXHRcdFx0c3RhcnRPZmZzZXQ6IHRyYW5zZm9ybWVyLmdldE9mZnNldChyYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpLFxuXHRcdFx0ZW5kT2Zmc2V0OiB0cmFuc2Zvcm1lci5nZXRPZmZzZXQocmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSksXG5cdFx0XHR0ZXh0OiBlLnRleHRcblx0XHR9KTtcblx0fSk7XG5cblx0b2Zmc2V0RWRpdHMuc29ydCgoYSwgYikgPT4gYi5zdGFydE9mZnNldCAtIGEuc3RhcnRPZmZzZXQpO1xuXG5cdGZvciAoY29uc3QgZWRpdCBvZiBvZmZzZXRFZGl0cykge1xuXHRcdHRleHQgPSB0ZXh0LnN1YnN0cmluZygwLCBlZGl0LnN0YXJ0T2Zmc2V0KSArIGVkaXQudGV4dCArIHRleHQuc3Vic3RyaW5nKGVkaXQuZW5kT2Zmc2V0KTtcblx0fVxuXG5cdHJldHVybiB0ZXh0O1xufVxuXG5jbGFzcyBQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBsaW5lU3RhcnRPZmZzZXRCeUxpbmVJZHg6IG51bWJlcltdO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgdGV4dDogc3RyaW5nKSB7XG5cdFx0dGhpcy5saW5lU3RhcnRPZmZzZXRCeUxpbmVJZHggPSBbXTtcblx0XHR0aGlzLmxpbmVTdGFydE9mZnNldEJ5TGluZUlkeC5wdXNoKDApO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHRleHQuY2hhckF0KGkpID09PSAnXFxuJykge1xuXHRcdFx0XHR0aGlzLmxpbmVTdGFydE9mZnNldEJ5TGluZUlkeC5wdXNoKGkgKyAxKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5saW5lU3RhcnRPZmZzZXRCeUxpbmVJZHgucHVzaCh0ZXh0Lmxlbmd0aCArIDEpO1xuXHR9XG5cblx0Z2V0T2Zmc2V0KHBvc2l0aW9uOiBQb3NpdGlvbik6IG51bWJlciB7XG5cdFx0Y29uc3QgbWF4TGluZU9mZnNldCA9IHBvc2l0aW9uLmxpbmVOdW1iZXIgPj0gdGhpcy5saW5lU3RhcnRPZmZzZXRCeUxpbmVJZHgubGVuZ3RoID8gdGhpcy50ZXh0Lmxlbmd0aCA6ICh0aGlzLmxpbmVTdGFydE9mZnNldEJ5TGluZUlkeFtwb3NpdGlvbi5saW5lTnVtYmVyXSAtIDEpO1xuXHRcdHJldHVybiBNYXRoLm1pbih0aGlzLmxpbmVTdGFydE9mZnNldEJ5TGluZUlkeFtwb3NpdGlvbi5saW5lTnVtYmVyIC0gMV0gKyBwb3NpdGlvbi5jb2x1bW4gLSAxLCBtYXhMaW5lT2Zmc2V0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBRXhELFNBQWlCLGFBQWE7QUFFOUIsU0FBUyxvQkFBb0I7QUFHN0IsTUFBTSxtQkFBbUIsTUFBTTtBQUU5QiwwQ0FBd0M7QUFBQSxFQUV4QyxNQUFNLHlCQUF5QixhQUFhO0FBQUEsSUFFM0MsU0FBUyxLQUFhO0FBQ3JCLGFBQU8sS0FBSyxVQUFVLEdBQUc7QUFBQSxJQUMxQjtBQUFBLElBRUEsU0FBUyxPQUFpQixNQUFjLE1BQU07QUFDN0MsWUFBTSxNQUFNLGVBQWUsS0FBSyxJQUFJO0FBQ3BDLFdBQUssZ0JBQWdCO0FBQUEsUUFDcEIsS0FBSztBQUFBLFFBQ0wsV0FBVztBQUFBLFFBQ1g7QUFBQSxRQUNBLEtBQUs7QUFBQSxNQUNOLENBQUM7QUFDRCxhQUFPLEtBQUssVUFBVSxHQUFHO0FBQUEsSUFDMUI7QUFBQSxFQUNEO0FBRUEsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxhQUFTLElBQUksaUJBQWlCO0FBQzlCLFlBQVEsT0FBTyxTQUFTO0FBQUEsTUFDdkI7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFdBQVMsaUJBQWlCLFFBQWdCLE1BQWMsUUFBZ0I7QUFDdkUsVUFBTSxXQUFXLE1BQU0sV0FBVyxNQUFNO0FBQ3hDLFdBQU8sWUFBWSxTQUFTLFlBQVksSUFBSTtBQUM1QyxXQUFPLFlBQVksU0FBUyxRQUFRLE1BQU07QUFBQSxFQUMzQztBQUVBLFdBQVMsZUFBZSxZQUFvQixRQUFnQixRQUFnQjtBQUMzRSxVQUFNLFNBQVMsTUFBTSxTQUFTLEVBQUUsWUFBWSxPQUFPLENBQUM7QUFDcEQsV0FBTyxZQUFZLFFBQVEsTUFBTTtBQUFBLEVBQ2xDO0FBRUEsT0FBSyx5QkFBeUIsTUFBTTtBQUNuQyxtQkFBZSxHQUFHLEdBQUcsQ0FBQztBQUN0QixtQkFBZSxHQUFHLEdBQUcsQ0FBQztBQUN0QixtQkFBZSxHQUFHLElBQUksRUFBRTtBQUN4QixtQkFBZSxHQUFHLEdBQUcsRUFBRTtBQUN2QixtQkFBZSxHQUFHLEdBQUcsRUFBRTtBQUN2QixtQkFBZSxHQUFHLEdBQUcsRUFBRTtBQUN2QixtQkFBZSxHQUFHLElBQUksRUFBRTtBQUN4QixtQkFBZSxHQUFHLElBQUksRUFBRTtBQUN4QixtQkFBZSxHQUFHLE9BQU8sV0FBVyxFQUFFO0FBQ3RDLG1CQUFlLEdBQUcsSUFBSSxFQUFFO0FBQ3hCLG1CQUFlLE9BQU8sV0FBVyxJQUFJLEVBQUU7QUFDdkMsbUJBQWUsT0FBTyxXQUFXLE9BQU8sV0FBVyxFQUFFO0FBQUEsRUFDdEQsQ0FBQztBQUVELE9BQUssMkJBQTJCLE1BQU07QUFDckMscUJBQWlCLEdBQUcsR0FBRyxDQUFDO0FBQ3hCLHFCQUFpQixPQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3ZDLHFCQUFpQixHQUFHLEdBQUcsQ0FBQztBQUN4QixxQkFBaUIsSUFBSSxHQUFHLEVBQUU7QUFDMUIscUJBQWlCLElBQUksR0FBRyxDQUFDO0FBQ3pCLHFCQUFpQixJQUFJLEdBQUcsQ0FBQztBQUN6QixxQkFBaUIsSUFBSSxHQUFHLENBQUM7QUFDekIscUJBQWlCLElBQUksR0FBRyxFQUFFO0FBQzFCLHFCQUFpQixJQUFJLEdBQUcsRUFBRTtBQUMxQixxQkFBaUIsSUFBSSxHQUFHLEVBQUU7QUFDMUIscUJBQWlCLE9BQU8sV0FBVyxHQUFHLEVBQUU7QUFBQSxFQUN6QyxDQUFDO0FBRUQsT0FBSywrQ0FBK0MsV0FBWTtBQUMvRCxVQUFNQSxTQUFRLE9BQU8sU0FBUyxDQUFDLHdMQUF3TCxDQUFDO0FBQ3hOLFdBQU8sWUFBWUEsT0FBTSxTQUFTLEVBQUUsWUFBWSxHQUFHLFFBQVEsRUFBRSxDQUFDLEdBQUcsQ0FBQztBQUFBLEVBQ25FLENBQUM7QUFFRCxPQUFLLGVBQWUsTUFBTTtBQUV6QixXQUFPLE9BQU8seUJBQXlCLE1BQU0sSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUFFLE1BQU0sb0JBQW9CLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSyxFQUFFLEtBQUssV0FBUztBQUNoSixhQUFPLFlBQVksTUFBTSxRQUFRLENBQUM7QUFDbEMsWUFBTSxDQUFDLEtBQUssSUFBSTtBQUNoQixhQUFPLFlBQVksTUFBTSxNQUFNLEdBQUc7QUFDbEMsYUFBTyxnQkFBZ0IsTUFBTSxPQUFPLEVBQUUsaUJBQWlCLEdBQUcsYUFBYSxJQUFJLGVBQWUsR0FBRyxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzdHLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxpQkFBa0I7QUFFM0QsVUFBTUEsU0FBUSxPQUFPLFNBQVM7QUFBQSxNQUM3QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsSUFBSTtBQUdQLFVBQU0sV0FBVyxNQUFNLE9BQU8seUJBQXlCQSxPQUFNLElBQUksU0FBUyxHQUFHO0FBQUEsTUFDNUU7QUFBQSxRQUNDLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQUc7QUFBQSxRQUNGLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQUc7QUFBQSxRQUNGLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQUc7QUFBQSxRQUNGLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQUc7QUFBQSxRQUNGLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMzQixNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0QsR0FBRyxLQUFLO0FBRVIsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxNQUFNLEdBQUc7QUFDeEMsV0FBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLE1BQU0sR0FBRztBQUFBLEVBQ3pDLENBQUM7QUFFRCxPQUFLLGtEQUFrRCxXQUFZO0FBRWxFLFVBQU1BLFNBQVEsT0FBTyxTQUFTO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxJQUFJO0FBRVAsV0FBTyxPQUFPLHlCQUF5QkEsT0FBTSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUUsTUFBTSxvQkFBcUIsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLEVBQUUsS0FBSyxXQUFTO0FBQ2hKLGFBQU8sWUFBWSxNQUFNLFFBQVEsQ0FBQztBQUFBLElBQ25DLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVEQUF1RCxXQUFZO0FBRXZFLFVBQU1BLFNBQVEsT0FBTyxTQUFTO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxJQUFJO0FBRVAsV0FBTyxPQUFPLHlCQUF5QkEsT0FBTSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUUsTUFBTSxvQkFBcUIsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLEVBQUUsS0FBSyxXQUFTO0FBQ2hKLGFBQU8sWUFBWSxNQUFNLFFBQVEsQ0FBQztBQUNsQyxZQUFNLENBQUMsS0FBSyxJQUFJO0FBQ2hCLGFBQU8sWUFBWSxNQUFNLE1BQU0sR0FBRztBQUNsQyxhQUFPLGdCQUFnQixNQUFNLE9BQU8sRUFBRSxpQkFBaUIsR0FBRyxhQUFhLEdBQUcsZUFBZSxHQUFHLFdBQVcsRUFBRSxDQUFDO0FBQUEsSUFDM0csQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkRBQTJELFdBQVk7QUFFM0UsVUFBTUEsU0FBUSxPQUFPLFNBQVM7QUFBQSxNQUM3QjtBQUFBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFDQTtBQUFBO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxPQUFPLHlCQUF5QkEsT0FBTSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUUsTUFBTSxNQUFNLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEdBQUksRUFBRSxDQUFDLEdBQUcsS0FBSyxFQUFFLEtBQUssV0FBUztBQUNwSSxhQUFPLFlBQVksTUFBTSxRQUFRLENBQUM7QUFDbEMsWUFBTSxDQUFDLEtBQUssSUFBSTtBQUNoQixhQUFPLFlBQVksTUFBTSxNQUFNLElBQUk7QUFDbkMsYUFBTyxnQkFBZ0IsTUFBTSxPQUFPLEVBQUUsaUJBQWlCLEdBQUcsYUFBYSxHQUFHLGVBQWUsR0FBRyxXQUFXLEVBQUUsQ0FBQztBQUFBLElBQzNHLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxpQkFBZSxVQUFVLE9BQWlCLE9BQXFDO0FBQzlFLFVBQU1BLFNBQVEsT0FBTyxTQUFTLEtBQUs7QUFFbkMsVUFBTSxlQUFlLE1BQU0sT0FBTztBQUFBLE1BQ2pDQSxPQUFNLElBQUksU0FBUztBQUFBLE1BQ25CO0FBQUEsTUFDQSxFQUFFLHNCQUFzQixPQUFPLHNCQUFzQixHQUFHLGNBQWMsTUFBTTtBQUFBLElBQzdFO0FBRUEsVUFBTSxLQUFLLFdBQVdBLE9BQU0sU0FBUyxHQUFHLEtBQUs7QUFDN0MsVUFBTSxLQUFLLFdBQVdBLE9BQU0sU0FBUyxHQUFHLFlBQVk7QUFDcEQsV0FBTyxnQkFBZ0IsSUFBSSxFQUFFO0FBRTdCLFdBQU8sYUFBYSxJQUFJLFFBQU0sRUFBRSxPQUFPLE1BQU0sS0FBSyxFQUFFLEtBQUssRUFBRSxTQUFTLEdBQUcsTUFBTSxFQUFFLEtBQUssRUFBRTtBQUFBLEVBQ3ZGO0FBR0EsT0FBSyw4QkFBOEIsWUFBWTtBQUM5QyxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsUUFDTDtBQUFBLFVBQ0M7QUFBQSxRQUNEO0FBQUEsUUFDQSxDQUFDO0FBQUEsVUFDQSxNQUFNO0FBQUEsVUFDTixPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDNUIsQ0FBQztBQUFBLE1BQUM7QUFBQSxNQUNGLENBQUMsRUFBRSxPQUFPLGdCQUFnQixNQUFNLDBCQUEwQixDQUFDO0FBQUEsSUFDN0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDhCQUE4QixZQUFZO0FBQzlDLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxRQUNMO0FBQUEsVUFDQztBQUFBLFFBQ0Q7QUFBQSxRQUNBLENBQUM7QUFBQSxVQUNBLE1BQU07QUFBQSxVQUNOLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLE9BQU8sZ0JBQWdCO0FBQUEsUUFDbEQsQ0FBQztBQUFBLE1BQUM7QUFBQSxNQUNGLENBQUMsRUFBRSxPQUFPLGtCQUFrQixNQUFNLGtCQUFrQixHQUFHLEVBQUUsT0FBTyxrQkFBa0IsTUFBTSwwQkFBMEIsQ0FBQztBQUFBLElBQ3JIO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw4QkFBOEIsWUFBWTtBQUM5QyxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsUUFDTDtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQSxDQUFDO0FBQUEsVUFDQSxNQUFNO0FBQUEsVUFDTixPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDN0IsQ0FBQztBQUFBLE1BQUM7QUFBQSxNQUNGLENBQUMsRUFBRSxPQUFPLGdCQUFnQixNQUFNLDZEQUE2RCxDQUFDO0FBQUEsSUFDaEc7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDhCQUE4QixZQUFZO0FBQzlDLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxRQUNMO0FBQUEsVUFDQztBQUFBLFFBQ0Q7QUFBQSxRQUNBLENBQUM7QUFBQSxVQUNBLE1BQU07QUFBQSxVQUNOLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLE9BQU8sZ0JBQWdCO0FBQUEsUUFDbEQsQ0FBQztBQUFBLE1BQUM7QUFBQSxNQUNGLENBQUMsRUFBRSxPQUFPLGtCQUFrQixNQUFNLE1BQU0sQ0FBQztBQUFBLElBQzNDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvR0FBb0csaUJBQWtCO0FBQzFILFVBQU07QUFBQSxNQUFXLDY0RUFBODZFLE1BQU0sSUFBSTtBQUFBLE1BQ3g4RSxDQUFDO0FBQUEsUUFDQSxPQUFPLEVBQUUsaUJBQWlCLEdBQUcsYUFBYSxHQUFHLGVBQWUsSUFBSSxXQUFXLEVBQUU7QUFBQSxRQUM3RSxNQUFNO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFDUCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssOENBQThDLFdBQVk7QUFFOUQsVUFBTUEsU0FBUSxPQUFPLFNBQVM7QUFBQSxNQUM3QjtBQUFBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFDQTtBQUFBO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxRQUFRQSxPQUFNLGdCQUFnQixFQUFFLGlCQUFpQixHQUFHLGFBQWEsR0FBRyxlQUFlLEdBQUcsV0FBVyxFQUFFLENBQUM7QUFDMUcsV0FBTyxZQUFZLE9BQU8sR0FBRztBQUFBLEVBQzlCLENBQUM7QUFHRCxPQUFLLGdDQUFnQyxXQUFZO0FBRWhELFVBQU1BLFNBQVEsT0FBTyxTQUFTO0FBQUEsTUFDN0I7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sT0FBTyxnQkFBZ0IsQ0FBQ0EsT0FBTSxJQUFJLFNBQVMsQ0FBQyxHQUFHLEtBQUssVUFBVSxLQUFLLEVBQUUsS0FBSyxDQUFDLFdBQVc7QUFDNUYsVUFBSSxDQUFDLFFBQVE7QUFDWixlQUFPLEdBQUcsS0FBSztBQUFBLE1BQ2hCO0FBQ0EsYUFBTyxZQUFZLE9BQU8sTUFBTSxRQUFRLENBQUM7QUFDekMsYUFBTyxZQUFZLE9BQU8sT0FBTyxVQUFVLFFBQVE7QUFDbkQsYUFBTyxZQUFZLE9BQU8sTUFBTSxDQUFDLEdBQUcsUUFBUTtBQUFBLElBQzdDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdDQUF3QyxXQUFZO0FBRXhELFVBQU1BLFNBQVEsT0FBTyxTQUFTO0FBQUEsTUFDN0I7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxRQUFrQixDQUFDLEdBQUdBLE9BQU0sTUFBTSxXQUFXLENBQUM7QUFFcEQsV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLE9BQU8sUUFBUSxPQUFPLFFBQVEsUUFBUSxTQUFTLFVBQVUsT0FBTyxPQUFPLE1BQU0sT0FBTyxNQUFNLENBQUM7QUFBQSxFQUMzSCxDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsV0FBVyxNQUFjLE9BQWtEO0FBQ25GLFFBQU0sY0FBYyxJQUFJLDBCQUEwQixJQUFJO0FBQ3RELFFBQU0sY0FBYyxNQUFNLElBQUksT0FBSztBQUNsQyxVQUFNLFFBQVEsTUFBTSxLQUFLLEVBQUUsS0FBSztBQUNoQyxXQUFRO0FBQUEsTUFDUCxhQUFhLFlBQVksVUFBVSxNQUFNLGlCQUFpQixDQUFDO0FBQUEsTUFDM0QsV0FBVyxZQUFZLFVBQVUsTUFBTSxlQUFlLENBQUM7QUFBQSxNQUN2RCxNQUFNLEVBQUU7QUFBQSxJQUNUO0FBQUEsRUFDRCxDQUFDO0FBRUQsY0FBWSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxFQUFFLFdBQVc7QUFFeEQsYUFBVyxRQUFRLGFBQWE7QUFDL0IsV0FBTyxLQUFLLFVBQVUsR0FBRyxLQUFLLFdBQVcsSUFBSSxLQUFLLE9BQU8sS0FBSyxVQUFVLEtBQUssU0FBUztBQUFBLEVBQ3ZGO0FBRUEsU0FBTztBQUNSO0FBRUEsTUFBTSwwQkFBMEI7QUFBQSxFQUcvQixZQUE2QixNQUFjO0FBQWQ7QUFDNUIsU0FBSywyQkFBMkIsQ0FBQztBQUNqQyxTQUFLLHlCQUF5QixLQUFLLENBQUM7QUFDcEMsYUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFFBQVEsS0FBSztBQUNyQyxVQUFJLEtBQUssT0FBTyxDQUFDLE1BQU0sTUFBTTtBQUM1QixhQUFLLHlCQUF5QixLQUFLLElBQUksQ0FBQztBQUFBLE1BQ3pDO0FBQUEsSUFDRDtBQUNBLFNBQUsseUJBQXlCLEtBQUssS0FBSyxTQUFTLENBQUM7QUFBQSxFQUNuRDtBQUFBLEVBRUEsVUFBVSxVQUE0QjtBQUNyQyxVQUFNLGdCQUFnQixTQUFTLGNBQWMsS0FBSyx5QkFBeUIsU0FBUyxLQUFLLEtBQUssU0FBVSxLQUFLLHlCQUF5QixTQUFTLFVBQVUsSUFBSTtBQUM3SixXQUFPLEtBQUssSUFBSSxLQUFLLHlCQUF5QixTQUFTLGFBQWEsQ0FBQyxJQUFJLFNBQVMsU0FBUyxHQUFHLGFBQWE7QUFBQSxFQUM1RztBQUNEOyIsCiAgIm5hbWVzIjogWyJtb2RlbCJdCn0K
