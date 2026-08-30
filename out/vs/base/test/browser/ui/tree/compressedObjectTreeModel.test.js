import assert from "assert";
import { compress, CompressedObjectTreeModel, decompress } from "../../../../browser/ui/tree/compressedObjectTreeModel.js";
import { Iterable } from "../../../../common/iterator.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
function resolve(treeElement) {
  const result = { element: treeElement.element };
  const children = Array.from(Iterable.from(treeElement.children), resolve);
  if (treeElement.incompressible) {
    result.incompressible = true;
  }
  if (children.length > 0) {
    result.children = children;
  }
  return result;
}
suite("CompressedObjectTree", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("compress & decompress", function() {
    test("small", function() {
      const decompressed = { element: 1 };
      const compressed = { element: { elements: [1], incompressible: false } };
      assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
      assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
    });
    test("no compression", function() {
      const decompressed = {
        element: 1,
        children: [
          { element: 11 },
          { element: 12 },
          { element: 13 }
        ]
      };
      const compressed = {
        element: { elements: [1], incompressible: false },
        children: [
          { element: { elements: [11], incompressible: false } },
          { element: { elements: [12], incompressible: false } },
          { element: { elements: [13], incompressible: false } }
        ]
      };
      assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
      assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
    });
    test("single hierarchy", function() {
      const decompressed = {
        element: 1,
        children: [
          {
            element: 11,
            children: [
              {
                element: 111,
                children: [
                  { element: 1111 }
                ]
              }
            ]
          }
        ]
      };
      const compressed = {
        element: { elements: [1, 11, 111, 1111], incompressible: false }
      };
      assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
      assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
    });
    test("deep compression", function() {
      const decompressed = {
        element: 1,
        children: [
          {
            element: 11,
            children: [
              {
                element: 111,
                children: [
                  { element: 1111 },
                  { element: 1112 },
                  { element: 1113 },
                  { element: 1114 }
                ]
              }
            ]
          }
        ]
      };
      const compressed = {
        element: { elements: [1, 11, 111], incompressible: false },
        children: [
          { element: { elements: [1111], incompressible: false } },
          { element: { elements: [1112], incompressible: false } },
          { element: { elements: [1113], incompressible: false } },
          { element: { elements: [1114], incompressible: false } }
        ]
      };
      assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
      assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
    });
    test("double deep compression", function() {
      const decompressed = {
        element: 1,
        children: [
          {
            element: 11,
            children: [
              {
                element: 111,
                children: [
                  { element: 1112 },
                  { element: 1113 }
                ]
              }
            ]
          },
          {
            element: 12,
            children: [
              {
                element: 121,
                children: [
                  { element: 1212 },
                  { element: 1213 }
                ]
              }
            ]
          }
        ]
      };
      const compressed = {
        element: { elements: [1], incompressible: false },
        children: [
          {
            element: { elements: [11, 111], incompressible: false },
            children: [
              { element: { elements: [1112], incompressible: false } },
              { element: { elements: [1113], incompressible: false } }
            ]
          },
          {
            element: { elements: [12, 121], incompressible: false },
            children: [
              { element: { elements: [1212], incompressible: false } },
              { element: { elements: [1213], incompressible: false } }
            ]
          }
        ]
      };
      assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
      assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
    });
    test("incompressible leaf", function() {
      const decompressed = {
        element: 1,
        children: [
          {
            element: 11,
            children: [
              {
                element: 111,
                children: [
                  { element: 1111, incompressible: true }
                ]
              }
            ]
          }
        ]
      };
      const compressed = {
        element: { elements: [1, 11, 111], incompressible: false },
        children: [
          { element: { elements: [1111], incompressible: true } }
        ]
      };
      assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
      assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
    });
    test("incompressible branch", function() {
      const decompressed = {
        element: 1,
        children: [
          {
            element: 11,
            children: [
              {
                element: 111,
                incompressible: true,
                children: [
                  { element: 1111 }
                ]
              }
            ]
          }
        ]
      };
      const compressed = {
        element: { elements: [1, 11], incompressible: false },
        children: [
          { element: { elements: [111, 1111], incompressible: true } }
        ]
      };
      assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
      assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
    });
    test("incompressible chain", function() {
      const decompressed = {
        element: 1,
        children: [
          {
            element: 11,
            children: [
              {
                element: 111,
                incompressible: true,
                children: [
                  { element: 1111, incompressible: true }
                ]
              }
            ]
          }
        ]
      };
      const compressed = {
        element: { elements: [1, 11], incompressible: false },
        children: [
          {
            element: { elements: [111], incompressible: true },
            children: [
              { element: { elements: [1111], incompressible: true } }
            ]
          }
        ]
      };
      assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
      assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
    });
    test("incompressible tree", function() {
      const decompressed = {
        element: 1,
        children: [
          {
            element: 11,
            incompressible: true,
            children: [
              {
                element: 111,
                incompressible: true,
                children: [
                  { element: 1111, incompressible: true }
                ]
              }
            ]
          }
        ]
      };
      const compressed = {
        element: { elements: [1], incompressible: false },
        children: [
          {
            element: { elements: [11], incompressible: true },
            children: [
              {
                element: { elements: [111], incompressible: true },
                children: [
                  { element: { elements: [1111], incompressible: true } }
                ]
              }
            ]
          }
        ]
      };
      assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
      assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
    });
  });
  function bindListToModel(list, model) {
    return model.onDidSpliceRenderedNodes(({ start, deleteCount, elements }) => {
      list.splice(start, deleteCount, ...elements);
    });
  }
  function toArray(list) {
    return list.map((i) => i.element.elements);
  }
  suite("CompressedObjectTreeModel", function() {
    function withSmartSplice(fn) {
      fn({});
      fn({ diffIdentityProvider: { getId: (n) => String(n) } });
    }
    test("ctor", () => {
      const model = new CompressedObjectTreeModel("test");
      assert(model);
      assert.strictEqual(model.size, 0);
    });
    test("flat", () => withSmartSplice((options) => {
      const list = [];
      const model = new CompressedObjectTreeModel("test");
      const disposable = bindListToModel(list, model);
      model.setChildren(null, [
        { element: 0 },
        { element: 1 },
        { element: 2 }
      ], options);
      assert.deepStrictEqual(toArray(list), [[0], [1], [2]]);
      assert.strictEqual(model.size, 3);
      model.setChildren(null, [
        { element: 3 },
        { element: 4 },
        { element: 5 }
      ], options);
      assert.deepStrictEqual(toArray(list), [[3], [4], [5]]);
      assert.strictEqual(model.size, 3);
      model.setChildren(null, [], options);
      assert.deepStrictEqual(toArray(list), []);
      assert.strictEqual(model.size, 0);
      disposable.dispose();
    }));
    test("nested", () => withSmartSplice((options) => {
      const list = [];
      const model = new CompressedObjectTreeModel("test");
      const disposable = bindListToModel(list, model);
      model.setChildren(null, [
        {
          element: 0,
          children: [
            { element: 10 },
            { element: 11 },
            { element: 12 }
          ]
        },
        { element: 1 },
        { element: 2 }
      ], options);
      assert.deepStrictEqual(toArray(list), [[0], [10], [11], [12], [1], [2]]);
      assert.strictEqual(model.size, 6);
      model.setChildren(12, [
        { element: 120 },
        { element: 121 }
      ], options);
      assert.deepStrictEqual(toArray(list), [[0], [10], [11], [12], [120], [121], [1], [2]]);
      assert.strictEqual(model.size, 8);
      model.setChildren(0, [], options);
      assert.deepStrictEqual(toArray(list), [[0], [1], [2]]);
      assert.strictEqual(model.size, 3);
      model.setChildren(null, [], options);
      assert.deepStrictEqual(toArray(list), []);
      assert.strictEqual(model.size, 0);
      disposable.dispose();
    }));
    test("compressed", () => withSmartSplice((options) => {
      const list = [];
      const model = new CompressedObjectTreeModel("test");
      const disposable = bindListToModel(list, model);
      model.setChildren(null, [
        {
          element: 1,
          children: [{
            element: 11,
            children: [{
              element: 111,
              children: [
                { element: 1111 },
                { element: 1112 },
                { element: 1113 }
              ]
            }]
          }]
        }
      ], options);
      assert.deepStrictEqual(toArray(list), [[1, 11, 111], [1111], [1112], [1113]]);
      assert.strictEqual(model.size, 6);
      model.setChildren(11, [
        { element: 111 },
        { element: 112 },
        { element: 113 }
      ], options);
      assert.deepStrictEqual(toArray(list), [[1, 11], [111], [112], [113]]);
      assert.strictEqual(model.size, 5);
      model.setChildren(113, [
        { element: 1131 }
      ], options);
      assert.deepStrictEqual(toArray(list), [[1, 11], [111], [112], [113, 1131]]);
      assert.strictEqual(model.size, 6);
      model.setChildren(1131, [
        { element: 1132 }
      ], options);
      assert.deepStrictEqual(toArray(list), [[1, 11], [111], [112], [113, 1131, 1132]]);
      assert.strictEqual(model.size, 7);
      model.setChildren(1131, [
        { element: 1132 },
        { element: 1133 }
      ], options);
      assert.deepStrictEqual(toArray(list), [[1, 11], [111], [112], [113, 1131], [1132], [1133]]);
      assert.strictEqual(model.size, 8);
      disposable.dispose();
    }));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcdHJlZVxcY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgY29tcHJlc3MsIENvbXByZXNzZWRPYmplY3RUcmVlTW9kZWwsIGRlY29tcHJlc3MsIElDb21wcmVzc2VkVHJlZUVsZW1lbnQsIElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL3RyZWUvY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJT2JqZWN0VHJlZU1vZGVsU2V0Q2hpbGRyZW5PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci91aS90cmVlL29iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVHJlZU1vZGVsLCBJVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuaW50ZXJmYWNlIElSZXNvbHZlZENvbXByZXNzZWRUcmVlRWxlbWVudDxUPiBleHRlbmRzIElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD4ge1xuXHRyZWFkb25seSBlbGVtZW50OiBUO1xuXHRyZWFkb25seSBjaGlsZHJlbj86IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8VD5bXTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZTxUPih0cmVlRWxlbWVudDogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxUPik6IElSZXNvbHZlZENvbXByZXNzZWRUcmVlRWxlbWVudDxUPiB7XG5cdGNvbnN0IHJlc3VsdDogYW55ID0geyBlbGVtZW50OiB0cmVlRWxlbWVudC5lbGVtZW50IH07XG5cdGNvbnN0IGNoaWxkcmVuID0gQXJyYXkuZnJvbShJdGVyYWJsZS5mcm9tKHRyZWVFbGVtZW50LmNoaWxkcmVuKSwgcmVzb2x2ZSk7XG5cblx0aWYgKHRyZWVFbGVtZW50LmluY29tcHJlc3NpYmxlKSB7XG5cdFx0cmVzdWx0LmluY29tcHJlc3NpYmxlID0gdHJ1ZTtcblx0fVxuXG5cdGlmIChjaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0cmVzdWx0LmNoaWxkcmVuID0gY2hpbGRyZW47XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5zdWl0ZSgnQ29tcHJlc3NlZE9iamVjdFRyZWUnLCBmdW5jdGlvbiAoKSB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2NvbXByZXNzICYgZGVjb21wcmVzcycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdHRlc3QoJ3NtYWxsJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgZGVjb21wcmVzc2VkOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PG51bWJlcj4gPSB7IGVsZW1lbnQ6IDEgfTtcblx0XHRcdGNvbnN0IGNvbXByZXNzZWQ6IElSZXNvbHZlZENvbXByZXNzZWRUcmVlRWxlbWVudDxJQ29tcHJlc3NlZFRyZWVOb2RlPG51bWJlcj4+ID1cblx0XHRcdFx0eyBlbGVtZW50OiB7IGVsZW1lbnRzOiBbMV0sIGluY29tcHJlc3NpYmxlOiBmYWxzZSB9IH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZShjb21wcmVzcyhkZWNvbXByZXNzZWQpKSwgY29tcHJlc3NlZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmUoZGVjb21wcmVzcyhjb21wcmVzc2VkKSksIGRlY29tcHJlc3NlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBjb21wcmVzc2lvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGRlY29tcHJlc3NlZDogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxudW1iZXI+ID0ge1xuXHRcdFx0XHRlbGVtZW50OiAxLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgZWxlbWVudDogMTEgfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDEyIH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxMyB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGNvbXByZXNzZWQ6IElSZXNvbHZlZENvbXByZXNzZWRUcmVlRWxlbWVudDxJQ29tcHJlc3NlZFRyZWVOb2RlPG51bWJlcj4+ID0ge1xuXHRcdFx0XHRlbGVtZW50OiB7IGVsZW1lbnRzOiBbMV0sIGluY29tcHJlc3NpYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgZWxlbWVudDogeyBlbGVtZW50czogWzExXSwgaW5jb21wcmVzc2libGU6IGZhbHNlIH0gfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IHsgZWxlbWVudHM6IFsxMl0sIGluY29tcHJlc3NpYmxlOiBmYWxzZSB9IH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiB7IGVsZW1lbnRzOiBbMTNdLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZShjb21wcmVzcyhkZWNvbXByZXNzZWQpKSwgY29tcHJlc3NlZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmUoZGVjb21wcmVzcyhjb21wcmVzc2VkKSksIGRlY29tcHJlc3NlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUgaGllcmFyY2h5JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgZGVjb21wcmVzc2VkOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PG51bWJlcj4gPSB7XG5cdFx0XHRcdGVsZW1lbnQ6IDEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogMTEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRlbGVtZW50OiAxMTEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDExMTEgfVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY29tcHJlc3NlZDogSVJlc29sdmVkQ29tcHJlc3NlZFRyZWVFbGVtZW50PElDb21wcmVzc2VkVHJlZU5vZGU8bnVtYmVyPj4gPSB7XG5cdFx0XHRcdGVsZW1lbnQ6IHsgZWxlbWVudHM6IFsxLCAxMSwgMTExLCAxMTExXSwgaW5jb21wcmVzc2libGU6IGZhbHNlIH1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZShjb21wcmVzcyhkZWNvbXByZXNzZWQpKSwgY29tcHJlc3NlZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmUoZGVjb21wcmVzcyhjb21wcmVzc2VkKSksIGRlY29tcHJlc3NlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWVwIGNvbXByZXNzaW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgZGVjb21wcmVzc2VkOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PG51bWJlcj4gPSB7XG5cdFx0XHRcdGVsZW1lbnQ6IDEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogMTEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRlbGVtZW50OiAxMTEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDExMTEgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTExMiB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMTEzIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDExMTQgfSxcblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGNvbXByZXNzZWQ6IElSZXNvbHZlZENvbXByZXNzZWRUcmVlRWxlbWVudDxJQ29tcHJlc3NlZFRyZWVOb2RlPG51bWJlcj4+ID0ge1xuXHRcdFx0XHRlbGVtZW50OiB7IGVsZW1lbnRzOiBbMSwgMTEsIDExMV0sIGluY29tcHJlc3NpYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgZWxlbWVudDogeyBlbGVtZW50czogWzExMTFdLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfSB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogeyBlbGVtZW50czogWzExMTJdLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfSB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogeyBlbGVtZW50czogWzExMTNdLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfSB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogeyBlbGVtZW50czogWzExMTRdLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfSB9LFxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmUoY29tcHJlc3MoZGVjb21wcmVzc2VkKSksIGNvbXByZXNzZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlKGRlY29tcHJlc3MoY29tcHJlc3NlZCkpLCBkZWNvbXByZXNzZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG91YmxlIGRlZXAgY29tcHJlc3Npb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBkZWNvbXByZXNzZWQ6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8bnVtYmVyPiA9IHtcblx0XHRcdFx0ZWxlbWVudDogMSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiAxMSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGVsZW1lbnQ6IDExMSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTExMiB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMTEzIH0sXG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiAxMiwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGVsZW1lbnQ6IDEyMSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTIxMiB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMjEzIH0sXG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBjb21wcmVzc2VkOiBJUmVzb2x2ZWRDb21wcmVzc2VkVHJlZUVsZW1lbnQ8SUNvbXByZXNzZWRUcmVlTm9kZTxudW1iZXI+PiA9IHtcblx0XHRcdFx0ZWxlbWVudDogeyBlbGVtZW50czogWzFdLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfSxcblx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiB7IGVsZW1lbnRzOiBbMTEsIDExMV0sIGluY29tcHJlc3NpYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiB7IGVsZW1lbnRzOiBbMTExMl0sIGluY29tcHJlc3NpYmxlOiBmYWxzZSB9IH0sXG5cdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogeyBlbGVtZW50czogWzExMTNdLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfSB9LFxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogeyBlbGVtZW50czogWzEyLCAxMjFdLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfSxcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogeyBlbGVtZW50czogWzEyMTJdLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfSB9LFxuXHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IHsgZWxlbWVudHM6IFsxMjEzXSwgaW5jb21wcmVzc2libGU6IGZhbHNlIH0gfSxcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZShjb21wcmVzcyhkZWNvbXByZXNzZWQpKSwgY29tcHJlc3NlZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmUoZGVjb21wcmVzcyhjb21wcmVzc2VkKSksIGRlY29tcHJlc3NlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNvbXByZXNzaWJsZSBsZWFmJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgZGVjb21wcmVzc2VkOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PG51bWJlcj4gPSB7XG5cdFx0XHRcdGVsZW1lbnQ6IDEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogMTEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRlbGVtZW50OiAxMTEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDExMTEsIGluY29tcHJlc3NpYmxlOiB0cnVlIH1cblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGNvbXByZXNzZWQ6IElSZXNvbHZlZENvbXByZXNzZWRUcmVlRWxlbWVudDxJQ29tcHJlc3NlZFRyZWVOb2RlPG51bWJlcj4+ID0ge1xuXHRcdFx0XHRlbGVtZW50OiB7IGVsZW1lbnRzOiBbMSwgMTEsIDExMV0sIGluY29tcHJlc3NpYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgZWxlbWVudDogeyBlbGVtZW50czogWzExMTFdLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSB9IH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlKGNvbXByZXNzKGRlY29tcHJlc3NlZCkpLCBjb21wcmVzc2VkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZShkZWNvbXByZXNzKGNvbXByZXNzZWQpKSwgZGVjb21wcmVzc2VkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY29tcHJlc3NpYmxlIGJyYW5jaCcsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGRlY29tcHJlc3NlZDogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxudW1iZXI+ID0ge1xuXHRcdFx0XHRlbGVtZW50OiAxLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVsZW1lbnQ6IDExLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0ZWxlbWVudDogMTExLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTExMSB9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBjb21wcmVzc2VkOiBJUmVzb2x2ZWRDb21wcmVzc2VkVHJlZUVsZW1lbnQ8SUNvbXByZXNzZWRUcmVlTm9kZTxudW1iZXI+PiA9IHtcblx0XHRcdFx0ZWxlbWVudDogeyBlbGVtZW50czogWzEsIDExXSwgaW5jb21wcmVzc2libGU6IGZhbHNlIH0sXG5cdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyBlbGVtZW50OiB7IGVsZW1lbnRzOiBbMTExLCAxMTExXSwgaW5jb21wcmVzc2libGU6IHRydWUgfSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZShjb21wcmVzcyhkZWNvbXByZXNzZWQpKSwgY29tcHJlc3NlZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmUoZGVjb21wcmVzcyhjb21wcmVzc2VkKSksIGRlY29tcHJlc3NlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNvbXByZXNzaWJsZSBjaGFpbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGRlY29tcHJlc3NlZDogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxudW1iZXI+ID0ge1xuXHRcdFx0XHRlbGVtZW50OiAxLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVsZW1lbnQ6IDExLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0ZWxlbWVudDogMTExLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTExMSwgaW5jb21wcmVzc2libGU6IHRydWUgfVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY29tcHJlc3NlZDogSVJlc29sdmVkQ29tcHJlc3NlZFRyZWVFbGVtZW50PElDb21wcmVzc2VkVHJlZU5vZGU8bnVtYmVyPj4gPSB7XG5cdFx0XHRcdGVsZW1lbnQ6IHsgZWxlbWVudHM6IFsxLCAxMV0sIGluY29tcHJlc3NpYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVsZW1lbnQ6IHsgZWxlbWVudHM6IFsxMTFdLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiB7IGVsZW1lbnRzOiBbMTExMV0sIGluY29tcHJlc3NpYmxlOiB0cnVlIH0gfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlKGNvbXByZXNzKGRlY29tcHJlc3NlZCkpLCBjb21wcmVzc2VkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZShkZWNvbXByZXNzKGNvbXByZXNzZWQpKSwgZGVjb21wcmVzc2VkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY29tcHJlc3NpYmxlIHRyZWUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBkZWNvbXByZXNzZWQ6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8bnVtYmVyPiA9IHtcblx0XHRcdFx0ZWxlbWVudDogMSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiAxMSwgaW5jb21wcmVzc2libGU6IHRydWUsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRlbGVtZW50OiAxMTEsIGluY29tcHJlc3NpYmxlOiB0cnVlLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMTExLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSB9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBjb21wcmVzc2VkOiBJUmVzb2x2ZWRDb21wcmVzc2VkVHJlZUVsZW1lbnQ8SUNvbXByZXNzZWRUcmVlTm9kZTxudW1iZXI+PiA9IHtcblx0XHRcdFx0ZWxlbWVudDogeyBlbGVtZW50czogWzFdLCBpbmNvbXByZXNzaWJsZTogZmFsc2UgfSxcblx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiB7IGVsZW1lbnRzOiBbMTFdLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGVsZW1lbnQ6IHsgZWxlbWVudHM6IFsxMTFdLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IHsgZWxlbWVudHM6IFsxMTExXSwgaW5jb21wcmVzc2libGU6IHRydWUgfSB9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmUoY29tcHJlc3MoZGVjb21wcmVzc2VkKSksIGNvbXByZXNzZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlKGRlY29tcHJlc3MoY29tcHJlc3NlZCkpLCBkZWNvbXByZXNzZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBiaW5kTGlzdFRvTW9kZWw8VD4obGlzdDogSVRyZWVOb2RlPFQ+W10sIG1vZGVsOiBJVHJlZU1vZGVsPFQsIGFueSwgYW55Pik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gbW9kZWwub25EaWRTcGxpY2VSZW5kZXJlZE5vZGVzKCh7IHN0YXJ0LCBkZWxldGVDb3VudCwgZWxlbWVudHMgfSkgPT4ge1xuXHRcdFx0bGlzdC5zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50LCAuLi5lbGVtZW50cyk7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b0FycmF5PFQ+KGxpc3Q6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFQ+PltdKTogVFtdW10ge1xuXHRcdHJldHVybiBsaXN0Lm1hcChpID0+IGkuZWxlbWVudC5lbGVtZW50cyk7XG5cdH1cblxuXHRzdWl0ZSgnQ29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdC8qKlxuXHRcdCAqIENhbGxzIHRoYXQgdGVzdCBmdW5jdGlvbiB0d2ljZSwgb25jZSB3aXRoIGFuIGVtcHR5IG9wdGlvbnMgYW5kXG5cdFx0ICogb25jZSB3aXRoIGBkaWZmSWRlbnRpdHlQcm92aWRlcmAuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gd2l0aFNtYXJ0U3BsaWNlKGZuOiAob3B0aW9uczogSU9iamVjdFRyZWVNb2RlbFNldENoaWxkcmVuT3B0aW9uczxudW1iZXIsIGFueT4pID0+IHZvaWQpIHtcblx0XHRcdGZuKHt9KTtcblx0XHRcdGZuKHsgZGlmZklkZW50aXR5UHJvdmlkZXI6IHsgZ2V0SWQ6IG4gPT4gU3RyaW5nKG4pIH0gfSk7XG5cdFx0fVxuXG5cblx0XHR0ZXN0KCdjdG9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgQ29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbDxudW1iZXI+KCd0ZXN0Jyk7XG5cdFx0XHRhc3NlcnQobW9kZWwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnNpemUsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmxhdCcsICgpID0+IHdpdGhTbWFydFNwbGljZShvcHRpb25zID0+IHtcblx0XHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPG51bWJlcj4+W10gPSBbXTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IENvbXByZXNzZWRPYmplY3RUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRcdG1vZGVsLnNldENoaWxkcmVuKG51bGwsIFtcblx0XHRcdFx0eyBlbGVtZW50OiAwIH0sXG5cdFx0XHRcdHsgZWxlbWVudDogMSB9LFxuXHRcdFx0XHR7IGVsZW1lbnQ6IDIgfVxuXHRcdFx0XSwgb3B0aW9ucyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgW1swXSwgWzFdLCBbMl1dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5zaXplLCAzKTtcblxuXHRcdFx0bW9kZWwuc2V0Q2hpbGRyZW4obnVsbCwgW1xuXHRcdFx0XHR7IGVsZW1lbnQ6IDMgfSxcblx0XHRcdFx0eyBlbGVtZW50OiA0IH0sXG5cdFx0XHRcdHsgZWxlbWVudDogNSB9LFxuXHRcdFx0XSwgb3B0aW9ucyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgW1szXSwgWzRdLCBbNV1dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5zaXplLCAzKTtcblxuXHRcdFx0bW9kZWwuc2V0Q2hpbGRyZW4obnVsbCwgW10sIG9wdGlvbnMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuc2l6ZSwgMCk7XG5cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ25lc3RlZCcsICgpID0+IHdpdGhTbWFydFNwbGljZShvcHRpb25zID0+IHtcblx0XHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPG51bWJlcj4+W10gPSBbXTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IENvbXByZXNzZWRPYmplY3RUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRcdG1vZGVsLnNldENoaWxkcmVuKG51bGwsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVsZW1lbnQ6IDAsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDEwIH0sXG5cdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDExIH0sXG5cdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDEyIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IGVsZW1lbnQ6IDEgfSxcblx0XHRcdFx0eyBlbGVtZW50OiAyIH1cblx0XHRcdF0sIG9wdGlvbnMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFtbMF0sIFsxMF0sIFsxMV0sIFsxMl0sIFsxXSwgWzJdXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuc2l6ZSwgNik7XG5cblx0XHRcdG1vZGVsLnNldENoaWxkcmVuKDEyLCBbXG5cdFx0XHRcdHsgZWxlbWVudDogMTIwIH0sXG5cdFx0XHRcdHsgZWxlbWVudDogMTIxIH1cblx0XHRcdF0sIG9wdGlvbnMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFtbMF0sIFsxMF0sIFsxMV0sIFsxMl0sIFsxMjBdLCBbMTIxXSwgWzFdLCBbMl1dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5zaXplLCA4KTtcblxuXHRcdFx0bW9kZWwuc2V0Q2hpbGRyZW4oMCwgW10sIG9wdGlvbnMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbWzBdLCBbMV0sIFsyXV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnNpemUsIDMpO1xuXG5cdFx0XHRtb2RlbC5zZXRDaGlsZHJlbihudWxsLCBbXSwgb3B0aW9ucyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5zaXplLCAwKTtcblxuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnY29tcHJlc3NlZCcsICgpID0+IHdpdGhTbWFydFNwbGljZShvcHRpb25zID0+IHtcblx0XHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPG51bWJlcj4+W10gPSBbXTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IENvbXByZXNzZWRPYmplY3RUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRcdG1vZGVsLnNldENoaWxkcmVuKG51bGwsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVsZW1lbnQ6IDEsIGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogMTEsIGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRcdFx0XHRlbGVtZW50OiAxMTEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMTExIH0sXG5cdFx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMTEyIH0sXG5cdFx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMTEzIH0sXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fVxuXHRcdFx0XSwgb3B0aW9ucyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgW1sxLCAxMSwgMTExXSwgWzExMTFdLCBbMTExMl0sIFsxMTEzXV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnNpemUsIDYpO1xuXG5cdFx0XHRtb2RlbC5zZXRDaGlsZHJlbigxMSwgW1xuXHRcdFx0XHR7IGVsZW1lbnQ6IDExMSB9LFxuXHRcdFx0XHR7IGVsZW1lbnQ6IDExMiB9LFxuXHRcdFx0XHR7IGVsZW1lbnQ6IDExMyB9LFxuXHRcdFx0XSwgb3B0aW9ucyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgW1sxLCAxMV0sIFsxMTFdLCBbMTEyXSwgWzExM11dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5zaXplLCA1KTtcblxuXHRcdFx0bW9kZWwuc2V0Q2hpbGRyZW4oMTEzLCBbXG5cdFx0XHRcdHsgZWxlbWVudDogMTEzMSB9XG5cdFx0XHRdLCBvcHRpb25zKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbWzEsIDExXSwgWzExMV0sIFsxMTJdLCBbMTEzLCAxMTMxXV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnNpemUsIDYpO1xuXG5cdFx0XHRtb2RlbC5zZXRDaGlsZHJlbigxMTMxLCBbXG5cdFx0XHRcdHsgZWxlbWVudDogMTEzMiB9XG5cdFx0XHRdLCBvcHRpb25zKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbWzEsIDExXSwgWzExMV0sIFsxMTJdLCBbMTEzLCAxMTMxLCAxMTMyXV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnNpemUsIDcpO1xuXG5cdFx0XHRtb2RlbC5zZXRDaGlsZHJlbigxMTMxLCBbXG5cdFx0XHRcdHsgZWxlbWVudDogMTEzMiB9LFxuXHRcdFx0XHR7IGVsZW1lbnQ6IDExMzMgfSxcblx0XHRcdF0sIG9wdGlvbnMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFtbMSwgMTFdLCBbMTExXSwgWzExMl0sIFsxMTMsIDExMzFdLCBbMTEzMl0sIFsxMTMzXV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnNpemUsIDgpO1xuXG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxVQUFVLDJCQUEyQixrQkFBK0Q7QUFHN0csU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywrQ0FBK0M7QUFReEQsU0FBUyxRQUFXLGFBQTJFO0FBQzlGLFFBQU0sU0FBYyxFQUFFLFNBQVMsWUFBWSxRQUFRO0FBQ25ELFFBQU0sV0FBVyxNQUFNLEtBQUssU0FBUyxLQUFLLFlBQVksUUFBUSxHQUFHLE9BQU87QUFFeEUsTUFBSSxZ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
