import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DirectedGraph } from "../../browser/model/graph.js";
suite("DirectedGraph", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("from - creates empty graph", () => {
    const graph = DirectedGraph.from([], () => []);
    assert.deepStrictEqual(graph.getOutgoing("a"), []);
  });
  test("from - creates graph with single node", () => {
    const graph = DirectedGraph.from(["a"], () => []);
    assert.deepStrictEqual(graph.getOutgoing("a"), []);
  });
  test("from - creates graph with nodes and edges", () => {
    const nodes = ["a", "b", "c"];
    const getOutgoing = (node) => {
      switch (node) {
        case "a":
          return ["b", "c"];
        case "b":
          return ["c"];
        case "c":
          return [];
        default:
          return [];
      }
    };
    const graph = DirectedGraph.from(nodes, getOutgoing);
    assert.deepStrictEqual([...graph.getOutgoing("a")].sort(), ["b", "c"]);
    assert.deepStrictEqual(graph.getOutgoing("b"), ["c"]);
    assert.deepStrictEqual(graph.getOutgoing("c"), []);
  });
  test("from - handles duplicate edges", () => {
    const nodes = ["a", "b"];
    const getOutgoing = (node) => {
      switch (node) {
        case "a":
          return ["b", "b"];
        // Duplicate edge
        case "b":
          return [];
        default:
          return [];
      }
    };
    const graph = DirectedGraph.from(nodes, getOutgoing);
    assert.deepStrictEqual(graph.getOutgoing("a"), ["b"]);
    assert.deepStrictEqual(graph.getOutgoing("b"), []);
  });
  test("removeCycles - no cycles", () => {
    const nodes = ["a", "b", "c"];
    const getOutgoing = (node) => {
      switch (node) {
        case "a":
          return ["b"];
        case "b":
          return ["c"];
        case "c":
          return [];
        default:
          return [];
      }
    };
    const graph = DirectedGraph.from(nodes, getOutgoing);
    const result = graph.removeCycles();
    assert.deepStrictEqual(result.foundCycles, []);
    assert.deepStrictEqual(graph.getOutgoing("a"), ["b"]);
    assert.deepStrictEqual(graph.getOutgoing("b"), ["c"]);
    assert.deepStrictEqual(graph.getOutgoing("c"), []);
  });
  test("removeCycles - simple cycle", () => {
    const nodes = ["a", "b"];
    const getOutgoing = (node) => {
      switch (node) {
        case "a":
          return ["b"];
        case "b":
          return ["a"];
        // Creates cycle
        default:
          return [];
      }
    };
    const graph = DirectedGraph.from(nodes, getOutgoing);
    const result = graph.removeCycles();
    assert.strictEqual(result.foundCycles.length, 1);
    assert.ok(
      result.foundCycles.includes("a") || result.foundCycles.includes("b")
    );
    const aOutgoing = graph.getOutgoing("a");
    const bOutgoing = graph.getOutgoing("b");
    assert.ok(
      aOutgoing.length === 0 && bOutgoing.length === 1 || aOutgoing.length === 1 && bOutgoing.length === 0
    );
  });
  test("removeCycles - self loop", () => {
    const nodes = ["a"];
    const getOutgoing = (node) => {
      switch (node) {
        case "a":
          return ["a"];
        // Self loop
        default:
          return [];
      }
    };
    const graph = DirectedGraph.from(nodes, getOutgoing);
    const result = graph.removeCycles();
    assert.deepStrictEqual(result.foundCycles, ["a"]);
    assert.deepStrictEqual(graph.getOutgoing("a"), []);
  });
  test("removeCycles - complex cycle", () => {
    const nodes = ["a", "b", "c", "d"];
    const getOutgoing = (node) => {
      switch (node) {
        case "a":
          return ["b"];
        case "b":
          return ["c"];
        case "c":
          return ["d", "a"];
        // Creates cycle back to 'a'
        case "d":
          return [];
        default:
          return [];
      }
    };
    const graph = DirectedGraph.from(nodes, getOutgoing);
    const result = graph.removeCycles();
    assert.ok(result.foundCycles.length >= 1);
    const cOutgoing = graph.getOutgoing("c");
    assert.ok(!cOutgoing.includes("a"));
  });
  test("removeCycles - multiple disconnected cycles", () => {
    const nodes = ["a", "b", "c", "d"];
    const getOutgoing = (node) => {
      switch (node) {
        case "a":
          return ["b"];
        case "b":
          return ["a"];
        // Cycle 1: a <-> b
        case "c":
          return ["d"];
        case "d":
          return ["c"];
        // Cycle 2: c <-> d
        default:
          return [];
      }
    };
    const graph = DirectedGraph.from(nodes, getOutgoing);
    const result = graph.removeCycles();
    assert.ok(result.foundCycles.length >= 2);
    const aOutgoing = graph.getOutgoing("a");
    const bOutgoing = graph.getOutgoing("b");
    const cOutgoing = graph.getOutgoing("c");
    const dOutgoing = graph.getOutgoing("d");
    assert.ok(
      aOutgoing.length === 0 && bOutgoing.length === 1 || aOutgoing.length === 1 && bOutgoing.length === 0
    );
    assert.ok(
      cOutgoing.length === 0 && dOutgoing.length === 1 || cOutgoing.length === 1 && dOutgoing.length === 0
    );
  });
  test("getOutgoing - non-existent node", () => {
    const graph = DirectedGraph.from(["a"], () => []);
    assert.deepStrictEqual(graph.getOutgoing("b"), []);
  });
  test("with number nodes", () => {
    const nodes = [1, 2, 3];
    const getOutgoing = (node) => {
      switch (node) {
        case 1:
          return [2, 3];
        case 2:
          return [3];
        case 3:
          return [];
        default:
          return [];
      }
    };
    const graph = DirectedGraph.from(nodes, getOutgoing);
    assert.deepStrictEqual([...graph.getOutgoing(1)].sort(), [2, 3]);
    assert.deepStrictEqual(graph.getOutgoing(2), [3]);
    assert.deepStrictEqual(graph.getOutgoing(3), []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFx0ZXN0XFxicm93c2VyXFxncmFwaC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEaXJlY3RlZEdyYXBoIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tb2RlbC9ncmFwaC5qcyc7XG5cbnN1aXRlKCdEaXJlY3RlZEdyYXBoJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmcm9tIC0gY3JlYXRlcyBlbXB0eSBncmFwaCcsICgpID0+IHtcblx0XHRjb25zdCBncmFwaCA9IERpcmVjdGVkR3JhcGguZnJvbTxzdHJpbmc+KFtdLCAoKSA9PiBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmFwaC5nZXRPdXRnb2luZygnYScpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zyb20gLSBjcmVhdGVzIGdyYXBoIHdpdGggc2luZ2xlIG5vZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ3JhcGggPSBEaXJlY3RlZEdyYXBoLmZyb20oWydhJ10sICgpID0+IFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyYXBoLmdldE91dGdvaW5nKCdhJyksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZnJvbSAtIGNyZWF0ZXMgZ3JhcGggd2l0aCBub2RlcyBhbmQgZWRnZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXMgPSBbJ2EnLCAnYicsICdjJ107XG5cdFx0Y29uc3QgZ2V0T3V0Z29pbmcgPSAobm9kZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRzd2l0Y2ggKG5vZGUpIHtcblx0XHRcdFx0Y2FzZSAnYSc6XG5cdFx0XHRcdFx0cmV0dXJuIFsnYicsICdjJ107XG5cdFx0XHRcdGNhc2UgJ2InOlxuXHRcdFx0XHRcdHJldHVybiBbJ2MnXTtcblx0XHRcdFx0Y2FzZSAnYyc6XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZ3JhcGggPSBEaXJlY3RlZEdyYXBoLmZyb20obm9kZXMsIGdldE91dGdvaW5nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmdyYXBoLmdldE91dGdvaW5nKCdhJyldLnNvcnQoKSwgWydiJywgJ2MnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmFwaC5nZXRPdXRnb2luZygnYicpLCBbJ2MnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmFwaC5nZXRPdXRnb2luZygnYycpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zyb20gLSBoYW5kbGVzIGR1cGxpY2F0ZSBlZGdlcycsICgpID0+IHtcblx0XHRjb25zdCBub2RlcyA9IFsnYScsICdiJ107XG5cdFx0Y29uc3QgZ2V0T3V0Z29pbmcgPSAobm9kZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRzd2l0Y2ggKG5vZGUpIHtcblx0XHRcdFx0Y2FzZSAnYSc6XG5cdFx0XHRcdFx0cmV0dXJuIFsnYicsICdiJ107IC8vIER1cGxpY2F0ZSBlZGdlXG5cdFx0XHRcdGNhc2UgJ2InOlxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdyYXBoID0gRGlyZWN0ZWRHcmFwaC5mcm9tKG5vZGVzLCBnZXRPdXRnb2luZyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyYXBoLmdldE91dGdvaW5nKCdhJyksIFsnYiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyYXBoLmdldE91dGdvaW5nKCdiJyksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlQ3ljbGVzIC0gbm8gY3ljbGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzID0gWydhJywgJ2InLCAnYyddO1xuXHRcdGNvbnN0IGdldE91dGdvaW5nID0gKG5vZGU6IHN0cmluZykgPT4ge1xuXHRcdFx0c3dpdGNoIChub2RlKSB7XG5cdFx0XHRcdGNhc2UgJ2EnOlxuXHRcdFx0XHRcdHJldHVybiBbJ2InXTtcblx0XHRcdFx0Y2FzZSAnYic6XG5cdFx0XHRcdFx0cmV0dXJuIFsnYyddO1xuXHRcdFx0XHRjYXNlICdjJzpcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBncmFwaCA9IERpcmVjdGVkR3JhcGguZnJvbShub2RlcywgZ2V0T3V0Z29pbmcpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdyYXBoLnJlbW92ZUN5Y2xlcygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZm91bmRDeWNsZXMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyYXBoLmdldE91dGdvaW5nKCdhJyksIFsnYiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyYXBoLmdldE91dGdvaW5nKCdiJyksIFsnYyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyYXBoLmdldE91dGdvaW5nKCdjJyksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlQ3ljbGVzIC0gc2ltcGxlIGN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzID0gWydhJywgJ2InXTtcblx0XHRjb25zdCBnZXRPdXRnb2luZyA9IChub2RlOiBzdHJpbmcpID0+IHtcblx0XHRcdHN3aXRjaCAobm9kZSkge1xuXHRcdFx0XHRjYXNlICdhJzpcblx0XHRcdFx0XHRyZXR1cm4gWydiJ107XG5cdFx0XHRcdGNhc2UgJ2InOlxuXHRcdFx0XHRcdHJldHVybiBbJ2EnXTsgLy8gQ3JlYXRlcyBjeWNsZVxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZ3JhcGggPSBEaXJlY3RlZEdyYXBoLmZyb20obm9kZXMsIGdldE91dGdvaW5nKTtcblx0XHRjb25zdCByZXN1bHQgPSBncmFwaC5yZW1vdmVDeWNsZXMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZm91bmRDeWNsZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHRyZXN1bHQuZm91bmRDeWNsZXMuaW5jbHVkZXMoJ2EnKSB8fCByZXN1bHQuZm91bmRDeWNsZXMuaW5jbHVkZXMoJ2InKVxuXHRcdCk7XG5cblx0XHQvLyBBZnRlciByZW1vdmluZyBjeWNsZXMsIG9uZSBvZiB0aGUgZWRnZXMgc2hvdWxkIGJlIHJlbW92ZWRcblx0XHRjb25zdCBhT3V0Z29pbmcgPSBncmFwaC5nZXRPdXRnb2luZygnYScpO1xuXHRcdGNvbnN0IGJPdXRnb2luZyA9IGdyYXBoLmdldE91dGdvaW5nKCdiJyk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0KGFPdXRnb2luZy5sZW5ndGggPT09IDAgJiYgYk91dGdvaW5nLmxlbmd0aCA9PT0gMSkgfHxcblx0XHRcdChhT3V0Z29pbmcubGVuZ3RoID09PSAxICYmIGJPdXRnb2luZy5sZW5ndGggPT09IDApXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlQ3ljbGVzIC0gc2VsZiBsb29wJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzID0gWydhJ107XG5cdFx0Y29uc3QgZ2V0T3V0Z29pbmcgPSAobm9kZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRzd2l0Y2ggKG5vZGUpIHtcblx0XHRcdFx0Y2FzZSAnYSc6XG5cdFx0XHRcdFx0cmV0dXJuIFsnYSddOyAvLyBTZWxmIGxvb3Bcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdyYXBoID0gRGlyZWN0ZWRHcmFwaC5mcm9tKG5vZGVzLCBnZXRPdXRnb2luZyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ3JhcGgucmVtb3ZlQ3ljbGVzKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5mb3VuZEN5Y2xlcywgWydhJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JhcGguZ2V0T3V0Z29pbmcoJ2EnKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVDeWNsZXMgLSBjb21wbGV4IGN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzID0gWydhJywgJ2InLCAnYycsICdkJ107XG5cdFx0Y29uc3QgZ2V0T3V0Z29pbmcgPSAobm9kZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRzd2l0Y2ggKG5vZGUpIHtcblx0XHRcdFx0Y2FzZSAnYSc6XG5cdFx0XHRcdFx0cmV0dXJuIFsnYiddO1xuXHRcdFx0XHRjYXNlICdiJzpcblx0XHRcdFx0XHRyZXR1cm4gWydjJ107XG5cdFx0XHRcdGNhc2UgJ2MnOlxuXHRcdFx0XHRcdHJldHVybiBbJ2QnLCAnYSddOyAvLyBDcmVhdGVzIGN5Y2xlIGJhY2sgdG8gJ2EnXG5cdFx0XHRcdGNhc2UgJ2QnOlxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdyYXBoID0gRGlyZWN0ZWRHcmFwaC5mcm9tKG5vZGVzLCBnZXRPdXRnb2luZyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ3JhcGgucmVtb3ZlQ3ljbGVzKCk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0LmZvdW5kQ3ljbGVzLmxlbmd0aCA+PSAxKTtcblxuXHRcdC8vIEFmdGVyIHJlbW92aW5nIGN5Y2xlcywgdGhlcmUgc2hvdWxkIGJlIG5vIHBhdGggYmFjayB0byAnYScgZnJvbSAnYydcblx0XHRjb25zdCBjT3V0Z29pbmcgPSBncmFwaC5nZXRPdXRnb2luZygnYycpO1xuXHRcdGFzc2VydC5vayghY091dGdvaW5nLmluY2x1ZGVzKCdhJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVDeWNsZXMgLSBtdWx0aXBsZSBkaXNjb25uZWN0ZWQgY3ljbGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzID0gWydhJywgJ2InLCAnYycsICdkJ107XG5cdFx0Y29uc3QgZ2V0T3V0Z29pbmcgPSAobm9kZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRzd2l0Y2ggKG5vZGUpIHtcblx0XHRcdFx0Y2FzZSAnYSc6XG5cdFx0XHRcdFx0cmV0dXJuIFsnYiddO1xuXHRcdFx0XHRjYXNlICdiJzpcblx0XHRcdFx0XHRyZXR1cm4gWydhJ107IC8vIEN5Y2xlIDE6IGEgPC0+IGJcblx0XHRcdFx0Y2FzZSAnYyc6XG5cdFx0XHRcdFx0cmV0dXJuIFsnZCddO1xuXHRcdFx0XHRjYXNlICdkJzpcblx0XHRcdFx0XHRyZXR1cm4gWydjJ107IC8vIEN5Y2xlIDI6IGMgPC0+IGRcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdyYXBoID0gRGlyZWN0ZWRHcmFwaC5mcm9tKG5vZGVzLCBnZXRPdXRnb2luZyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ3JhcGgucmVtb3ZlQ3ljbGVzKCk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0LmZvdW5kQ3ljbGVzLmxlbmd0aCA+PSAyKTtcblxuXHRcdC8vIEFmdGVyIHJlbW92aW5nIGN5Y2xlcywgZWFjaCBwYWlyIHNob3VsZCBoYXZlIG9ubHkgb25lIGRpcmVjdGlvblxuXHRcdGNvbnN0IGFPdXRnb2luZyA9IGdyYXBoLmdldE91dGdvaW5nKCdhJyk7XG5cdFx0Y29uc3QgYk91dGdvaW5nID0gZ3JhcGguZ2V0T3V0Z29pbmcoJ2InKTtcblx0XHRjb25zdCBjT3V0Z29pbmcgPSBncmFwaC5nZXRPdXRnb2luZygnYycpO1xuXHRcdGNvbnN0IGRPdXRnb2luZyA9IGdyYXBoLmdldE91dGdvaW5nKCdkJyk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHQoYU91dGdvaW5nLmxlbmd0aCA9PT0gMCAmJiBiT3V0Z29pbmcubGVuZ3RoID09PSAxKSB8fFxuXHRcdFx0KGFPdXRnb2luZy5sZW5ndGggPT09IDEgJiYgYk91dGdvaW5nLmxlbmd0aCA9PT0gMClcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdChjT3V0Z29pbmcubGVuZ3RoID09PSAwICYmIGRPdXRnb2luZy5sZW5ndGggPT09IDEpIHx8XG5cdFx0XHQoY091dGdvaW5nLmxlbmd0aCA9PT0gMSAmJiBkT3V0Z29pbmcubGVuZ3RoID09PSAwKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE91dGdvaW5nIC0gbm9uLWV4aXN0ZW50IG5vZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ3JhcGggPSBEaXJlY3RlZEdyYXBoLmZyb20oWydhJ10sICgpID0+IFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyYXBoLmdldE91dGdvaW5nKCdiJyksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnd2l0aCBudW1iZXIgbm9kZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXMgPSBbMSwgMiwgM107XG5cdFx0Y29uc3QgZ2V0T3V0Z29pbmcgPSAobm9kZTogbnVtYmVyKSA9PiB7XG5cdFx0XHRzd2l0Y2ggKG5vZGUpIHtcblx0XHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHRcdHJldHVybiBbMiwgM107XG5cdFx0XHRcdGNhc2UgMjpcblx0XHRcdFx0XHRyZXR1cm4gWzNdO1xuXHRcdFx0XHRjYXNlIDM6XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZ3JhcGggPSBEaXJlY3RlZEdyYXBoLmZyb20obm9kZXMsIGdldE91dGdvaW5nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmdyYXBoLmdldE91dGdvaW5nKDEpXS5zb3J0KCksIFsyLCAzXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmFwaC5nZXRPdXRnb2luZygyKSwgWzNdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyYXBoLmdldE91dGdvaW5nKDMpLCBbXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFFOUIsTUFBTSxpQkFBaUIsTUFBTTtBQUM1QiwwQ0FBd0M7QUFFeEMsT0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxVQUFNLFFBQVEsY0FBYyxLQUFhLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQztBQUNyRCxXQUFPLGdCQUFnQixNQUFNLFlBQVksR0FBRyxHQUFHLENBQUMsQ0FBQztB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
