import assert from "assert";
import { shuffle } from "../../common/arrays.js";
import { randomPath } from "../../common/extpath.js";
import { StopWatch } from "../../common/stopwatch.js";
import { ConfigKeysIterator, PathIterator, StringIterator, TernarySearchTree, UriIterator } from "../../common/ternarySearchTree.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Ternary Search Tree", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("PathIterator", () => {
    const iter = new PathIterator();
    iter.reset("file:///usr/bin/file.txt");
    assert.strictEqual(iter.value(), "file:");
    assert.strictEqual(iter.hasNext(), true);
    assert.strictEqual(iter.cmp("file:"), 0);
    assert.ok(iter.cmp("a") < 0);
    assert.ok(iter.cmp("aile:") < 0);
    assert.ok(iter.cmp("z") > 0);
    assert.ok(iter.cmp("zile:") > 0);
    iter.next();
    assert.strictEqual(iter.value(), "usr");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "bin");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "file.txt");
    assert.strictEqual(iter.hasNext(), false);
    iter.next();
    assert.strictEqual(iter.value(), "");
    assert.strictEqual(iter.hasNext(), false);
    iter.next();
    assert.strictEqual(iter.value(), "");
    assert.strictEqual(iter.hasNext(), false);
    iter.reset("/foo/bar/");
    assert.strictEqual(iter.value(), "foo");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "bar");
    assert.strictEqual(iter.hasNext(), false);
  });
  test("URIIterator", function() {
    const iter = new UriIterator(() => false, () => false);
    iter.reset(URI.parse("file:///usr/bin/file.txt"));
    assert.strictEqual(iter.value(), "file");
    assert.strictEqual(iter.cmp("file"), 0);
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "usr");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "bin");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "file.txt");
    assert.strictEqual(iter.hasNext(), false);
    iter.reset(URI.parse("file://share/usr/bin/file.txt?foo"));
    assert.strictEqual(iter.value(), "file");
    assert.strictEqual(iter.cmp("file"), 0);
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "share");
    assert.strictEqual(iter.cmp("SHARe"), 0);
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "usr");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "bin");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "file.txt");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "foo");
    assert.strictEqual(iter.cmp("z") > 0, true);
    assert.strictEqual(iter.cmp("a") < 0, true);
    assert.strictEqual(iter.hasNext(), false);
  });
  test("URIIterator - ignore query/fragment", function() {
    const iter = new UriIterator(() => false, () => true);
    iter.reset(URI.parse("file:///usr/bin/file.txt"));
    assert.strictEqual(iter.value(), "file");
    assert.strictEqual(iter.cmp("file"), 0);
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "usr");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "bin");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "file.txt");
    assert.strictEqual(iter.hasNext(), false);
    iter.reset(URI.parse("file://share/usr/bin/file.txt?foo"));
    assert.strictEqual(iter.value(), "file");
    assert.strictEqual(iter.cmp("file"), 0);
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "share");
    assert.strictEqual(iter.cmp("SHARe"), 0);
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "usr");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "bin");
    assert.strictEqual(iter.hasNext(), true);
    iter.next();
    assert.strictEqual(iter.value(), "file.txt");
    assert.strictEqual(iter.hasNext(), false);
  });
  function assertTstDfs(trie, ...elements) {
    assert.ok(trie._isBalanced(), "TST is not balanced");
    let i = 0;
    for (const [key, value] of trie) {
      const expected = elements[i++];
      assert.ok(expected);
      assert.strictEqual(key, expected[0]);
      assert.strictEqual(value, expected[1]);
    }
    assert.strictEqual(i, elements.length);
    const map = /* @__PURE__ */ new Map();
    for (const [key, value] of elements) {
      map.set(key, value);
    }
    map.forEach((value, key) => {
      assert.strictEqual(trie.get(key), value);
    });
    let forEachCount = 0;
    trie.forEach((element, key) => {
      assert.strictEqual(element, map.get(key));
      forEachCount++;
    });
    assert.strictEqual(map.size, forEachCount);
    let iterCount = 0;
    for (const [key, value] of trie) {
      assert.strictEqual(value, map.get(key));
      iterCount++;
    }
    assert.strictEqual(map.size, iterCount);
  }
  test("TernarySearchTree - set", function() {
    let trie = TernarySearchTree.forStrings();
    trie.set("foobar", 1);
    trie.set("foobaz", 2);
    assertTstDfs(trie, ["foobar", 1], ["foobaz", 2]);
    trie = TernarySearchTree.forStrings();
    trie.set("foobar", 1);
    trie.set("fooba", 2);
    assertTstDfs(trie, ["fooba", 2], ["foobar", 1]);
    trie = TernarySearchTree.forStrings();
    trie.set("foo", 1);
    trie.set("foo", 2);
    assertTstDfs(trie, ["foo", 2]);
    trie = TernarySearchTree.forStrings();
    trie.set("foo", 1);
    trie.set("foobar", 2);
    trie.set("bar", 3);
    trie.set("foob", 4);
    trie.set("bazz", 5);
    assertTstDfs(
      trie,
      ["bar", 3],
      ["bazz", 5],
      ["foo", 1],
      ["foob", 4],
      ["foobar", 2]
    );
  });
  test("TernarySearchTree - set w/ undefined", function() {
    const trie = TernarySearchTree.forStrings();
    trie.set("foobar", void 0);
    trie.set("foobaz", 2);
    assert.strictEqual(trie.get("foobar"), void 0);
    assert.strictEqual(trie.get("foobaz"), 2);
    assert.strictEqual(trie.get("NOT HERE"), void 0);
    assert.ok(trie.has("foobaz"));
    assert.ok(trie.has("foobar"));
    assert.ok(!trie.has("NOT HERE"));
    assertTstDfs(trie, ["foobar", void 0], ["foobaz", 2]);
    const oldValue = trie.set("foobar", 3);
    assert.strictEqual(oldValue, void 0);
    assert.strictEqual(trie.get("foobar"), 3);
  });
  test("TernarySearchTree - findLongestMatch", function() {
    const trie = TernarySearchTree.forStrings();
    trie.set("foo", 1);
    trie.set("foobar", 2);
    trie.set("foobaz", 3);
    assertTstDfs(trie, ["foo", 1], ["foobar", 2], ["foobaz", 3]);
    assert.strictEqual(trie.findSubstr("f"), void 0);
    assert.strictEqual(trie.findSubstr("z"), void 0);
    assert.strictEqual(trie.findSubstr("foo"), 1);
    assert.strictEqual(trie.findSubstr("foo\xF6"), 1);
    assert.strictEqual(trie.findSubstr("fooba"), 1);
    assert.strictEqual(trie.findSubstr("foobarr"), 2);
    assert.strictEqual(trie.findSubstr("foobazrr"), 3);
  });
  test("TernarySearchTree - basics", function() {
    const trie = new TernarySearchTree(new StringIterator());
    trie.set("foo", 1);
    trie.set("bar", 2);
    trie.set("foobar", 3);
    assertTstDfs(trie, ["bar", 2], ["foo", 1], ["foobar", 3]);
    assert.strictEqual(trie.get("foo"), 1);
    assert.strictEqual(trie.get("bar"), 2);
    assert.strictEqual(trie.get("foobar"), 3);
    assert.strictEqual(trie.get("foobaz"), void 0);
    assert.strictEqual(trie.get("foobarr"), void 0);
    assert.strictEqual(trie.findSubstr("fo"), void 0);
    assert.strictEqual(trie.findSubstr("foo"), 1);
    assert.strictEqual(trie.findSubstr("foooo"), 1);
    trie.delete("foobar");
    trie.delete("bar");
    assert.strictEqual(trie.get("foobar"), void 0);
    assert.strictEqual(trie.get("bar"), void 0);
    trie.set("foobar", 17);
    trie.set("barr", 18);
    assert.strictEqual(trie.get("foobar"), 17);
    assert.strictEqual(trie.get("barr"), 18);
    assert.strictEqual(trie.get("bar"), void 0);
  });
  test("TernarySearchTree - delete & cleanup", function() {
    let trie = new TernarySearchTree(new StringIterator());
    trie.set("foo", 1);
    trie.set("foobar", 2);
    trie.set("bar", 3);
    assertTstDfs(trie, ["bar", 3], ["foo", 1], ["foobar", 2]);
    trie.delete("foo");
    assertTstDfs(trie, ["bar", 3], ["foobar", 2]);
    trie.delete("foobar");
    assertTstDfs(trie, ["bar", 3]);
    trie = new TernarySearchTree(new StringIterator());
    trie.set("foo", 1);
    trie.set("foobar", 2);
    trie.set("bar", 3);
    trie.set("foobarbaz", 4);
    trie.deleteSuperstr("foo");
    assertTstDfs(trie, ["bar", 3], ["foo", 1]);
    trie = new TernarySearchTree(new StringIterator());
    trie.set("foo", 1);
    trie.set("foobar", 2);
    trie.set("bar", 3);
    trie.set("foobarbaz", 4);
    trie.deleteSuperstr("fo");
    assertTstDfs(trie, ["bar", 3]);
  });
  test("TernarySearchTree (PathSegments) - basics", function() {
    const trie = new TernarySearchTree(new PathIterator());
    trie.set("/user/foo/bar", 1);
    trie.set("/user/foo", 2);
    trie.set("/user/foo/flip/flop", 3);
    assert.strictEqual(trie.get("/user/foo/bar"), 1);
    assert.strictEqual(trie.get("/user/foo"), 2);
    assert.strictEqual(trie.get("/user//foo"), 2);
    assert.strictEqual(trie.get("/user\\foo"), 2);
    assert.strictEqual(trie.get("/user/foo/flip/flop"), 3);
    assert.strictEqual(trie.findSubstr("/user/bar"), void 0);
    assert.strictEqual(trie.findSubstr("/user/foo"), 2);
    assert.strictEqual(trie.findSubstr("\\user\\foo"), 2);
    assert.strictEqual(trie.findSubstr("/user//foo"), 2);
    assert.strictEqual(trie.findSubstr("/user/foo/ba"), 2);
    assert.strictEqual(trie.findSubstr("/user/foo/far/boo"), 2);
    assert.strictEqual(trie.findSubstr("/user/foo/bar"), 1);
    assert.strictEqual(trie.findSubstr("/user/foo/bar/far/boo"), 1);
  });
  test("TernarySearchTree - (AVL) set", function() {
    {
      const trie = new TernarySearchTree(new PathIterator());
      trie.set("/fileA", 1);
      trie.set("/fileB", 2);
      trie.set("/fileC", 3);
      assertTstDfs(trie, ["/fileA", 1], ["/fileB", 2], ["/fileC", 3]);
    }
    {
      const trie = new TernarySearchTree(new PathIterator());
      trie.set("/foo/fileA", 1);
      trie.set("/foo/fileB", 2);
      trie.set("/foo/fileC", 3);
      assertTstDfs(trie, ["/foo/fileA", 1], ["/foo/fileB", 2], ["/foo/fileC", 3]);
    }
    {
      const trie = new TernarySearchTree(new PathIterator());
      trie.set("/fileC", 3);
      trie.set("/fileB", 2);
      trie.set("/fileA", 1);
      assertTstDfs(trie, ["/fileA", 1], ["/fileB", 2], ["/fileC", 3]);
    }
    {
      const trie = new TernarySearchTree(new PathIterator());
      trie.set("/mid/fileC", 3);
      trie.set("/mid/fileB", 2);
      trie.set("/mid/fileA", 1);
      assertTstDfs(trie, ["/mid/fileA", 1], ["/mid/fileB", 2], ["/mid/fileC", 3]);
    }
    {
      const trie = new TernarySearchTree(new PathIterator());
      trie.set("/fileD", 7);
      trie.set("/fileB", 2);
      trie.set("/fileG", 42);
      trie.set("/fileF", 24);
      trie.set("/fileZ", 73);
      trie.set("/fileE", 15);
      assertTstDfs(trie, ["/fileB", 2], ["/fileD", 7], ["/fileE", 15], ["/fileF", 24], ["/fileG", 42], ["/fileZ", 73]);
    }
    {
      const trie = new TernarySearchTree(new PathIterator());
      trie.set("/fileJ", 42);
      trie.set("/fileZ", 73);
      trie.set("/fileE", 15);
      trie.set("/fileB", 2);
      trie.set("/fileF", 7);
      trie.set("/fileG", 1);
      assertTstDfs(trie, ["/fileB", 2], ["/fileE", 15], ["/fileF", 7], ["/fileG", 1], ["/fileJ", 42], ["/fileZ", 73]);
    }
  });
  test("TernarySearchTree - (BST) delete", function() {
    const trie = new TernarySearchTree(new StringIterator());
    trie.set("d", 1);
    assertTstDfs(trie, ["d", 1]);
    trie.delete("d");
    assertTstDfs(trie);
    trie.clear();
    trie.set("d", 1);
    trie.set("b", 1);
    trie.set("f", 1);
    assertTstDfs(trie, ["b", 1], ["d", 1], ["f", 1]);
    trie.delete("d");
    assertTstDfs(trie, ["b", 1], ["f", 1]);
    trie.clear();
    trie.set("d", 1);
    trie.set("b", 1);
    trie.set("f", 1);
    trie.set("e", 1);
    assertTstDfs(trie, ["b", 1], ["d", 1], ["e", 1], ["f", 1]);
    trie.delete("f");
    assertTstDfs(trie, ["b", 1], ["d", 1], ["e", 1]);
  });
  test("TernarySearchTree - (AVL) delete", function() {
    const trie = new TernarySearchTree(new StringIterator());
    trie.clear();
    trie.set("d", 1);
    trie.set("b", 1);
    trie.set("f", 1);
    trie.set("e", 1);
    trie.set("z", 1);
    assertTstDfs(trie, ["b", 1], ["d", 1], ["e", 1], ["f", 1], ["z", 1]);
    trie.delete("b");
    assertTstDfs(trie, ["d", 1], ["e", 1], ["f", 1], ["z", 1]);
    trie.clear();
    trie.set("d", 1);
    trie.set("c", 1);
    trie.set("f", 1);
    trie.set("a", 1);
    trie.set("b", 1);
    assertTstDfs(trie, ["a", 1], ["b", 1], ["c", 1], ["d", 1], ["f", 1]);
    trie.delete("f");
    assertTstDfs(trie, ["a", 1], ["b", 1], ["c", 1], ["d", 1]);
    trie.clear();
    trie.set("a", 1);
    trie.set("ad", 1);
    trie.set("ab", 1);
    trie.set("af", 1);
    trie.set("ae", 1);
    trie.set("az", 1);
    assertTstDfs(trie, ["a", 1], ["ab", 1], ["ad", 1], ["ae", 1], ["af", 1], ["az", 1]);
    trie.delete("ab");
    assertTstDfs(trie, ["a", 1], ["ad", 1], ["ae", 1], ["af", 1], ["az", 1]);
    trie.delete("a");
    assertTstDfs(trie, ["ad", 1], ["ae", 1], ["af", 1], ["az", 1]);
  });
  test("TernarySearchTree: Cannot read property '1' of undefined #138284", function() {
    const keys = [
      URI.parse("fake-fs:/C"),
      URI.parse("fake-fs:/A"),
      URI.parse("fake-fs:/D"),
      URI.parse("fake-fs:/B")
    ];
    const tst = TernarySearchTree.forUris();
    for (const item of keys) {
      tst.set(item, true);
    }
    assert.ok(tst._isBalanced());
    tst.delete(keys[0]);
    assert.ok(tst._isBalanced());
  });
  test("TernarySearchTree: Cannot read property '1' of undefined #138284 (simple)", function() {
    const keys = ["C", "A", "D", "B"];
    const tst = TernarySearchTree.forStrings();
    for (const item of keys) {
      tst.set(item, true);
    }
    assertTstDfs(tst, ["A", true], ["B", true], ["C", true], ["D", true]);
    tst.delete(keys[0]);
    assertTstDfs(tst, ["A", true], ["B", true], ["D", true]);
    {
      const tst2 = TernarySearchTree.forStrings();
      tst2.set("C", true);
      tst2.set("A", true);
      tst2.set("B", true);
      assertTstDfs(tst2, ["A", true], ["B", true], ["C", true]);
    }
  });
  test("TernarySearchTree: Cannot read property '1' of undefined #138284 (random)", function() {
    for (let round = 10; round >= 0; round--) {
      const keys = [];
      for (let i = 0; i < 100; i++) {
        keys.push(URI.from({ scheme: "fake-fs", path: randomPath(void 0, void 0, 10) }));
      }
      const tst = TernarySearchTree.forUris();
      try {
        for (const item of keys) {
          tst.set(item, true);
          assert.ok(tst._isBalanced(), `SET${item}|${keys.map(String).join()}`);
        }
        for (const item of keys) {
          tst.delete(item);
          assert.ok(tst._isBalanced(), `DEL${item}|${keys.map(String).join()}`);
        }
      } catch (err) {
        assert.ok(false, `FAILED with keys: ${keys.map(String).join()}`);
      }
    }
  });
  test("https://github.com/microsoft/vscode/issues/227147", function() {
    const raw = `fake-fs:CAOnRvUuxO,fake-fs:1qcbfq54rg,fake-fs:UtDstYUQ56,fake-fs:d5ktqDysll,fake-fs:w5NSAKA4Ch,fake-fs:QcIIIY6WHX,fake-fs:WCedQu9Ogd,fake-fs:cKUC5LunBr,fake-fs:XrIIYjI3HB,fake-fs:xgTkoneFzF,fake-fs:QYkCVx2nYC,fake-fs:ePrIDEKEpJ,fake-fs:nrOPYCW81a,fake-fs:MQbkFLcDsA,fake-fs:wXG8YiOrBI,fake-fs:4tHTWi240D,fake-fs:5uQWjgZGGJ,fake-fs:famP6pZXyx,fake-fs:aB9sUhwP1J,fake-fs:DlS0CssyhG,fake-fs:9vK2k3rL2V,fake-fs:iqWeu7zF6t,fake-fs:8vC6bQX2WH,fake-fs:nFILXMQTRg,fake-fs:miiV72aajE,fake-fs:9VRbqvaw0q,fake-fs:WnEHS1arfZ,fake-fs:Fco75PJ5pM,fake-fs:6CsEpoZ7VW,fake-fs:B2PrCtDpWu,fake-fs:y8Hi94Oekg,fake-fs:wyEjPNa5lo,fake-fs:zw1Ljv0erc,fake-fs:y4KWPUOMx0,fake-fs:1basrPTlTp,fake-fs:5iErr4YM34,fake-fs:Q2TQaujh8Q,fake-fs:QxcYzNNxZw,fake-fs:3QUDHjU55a,fake-fs:23ymf9ggMV,fake-fs:qQhuKFdy29,fake-fs:JuwmxA33oJ,fake-fs:NQeUyfMNUo,fake-fs:2Vo3eR1jxM,fake-fs:NzUXQidwel,fake-fs:aESYKGPxIx,fake-fs:mxLdeJartN,fake-fs:PhSd2xLwVe,fake-fs:9nmWjUUMRz,fake-fs:Wc6a4RsGhn,fake-fs:5a0AlFHALQ,fake-fs:Q93jnNZBxJ,fake-fs:4CuVkbfPSG,fake-fs:mdFlJ7WQva,fake-fs:fgVsaRm1KG,fake-fs:P7UXWiRJYj,fake-fs:q6nz5Q9BEW,fake-fs:1UZmGkvNTn,fake-fs:AKY8cnUQFl,fake-fs:RezYuPU7FD,fake-fs:5zaYc72Bit,fake-fs:yh8FTxFfQq,fake-fs:ayNPgEuc2q,fake-fs:EdOb27cRhF,fake-fs:h4c2uNyI4l,fake-fs:BhzOLNL4JO,fake-fs:HVPTdAMWpS,fake-fs:7K7IlacaZe,fake-fs:iUKJonC5eq,fake-fs:Y9E3NX3eJD,fake-fs:66h80uK32I,fake-fs:gFXpry1Y09,fake-fs:qOqvvXPcu4,fake-fs:UbbLn2NFSJ,fake-fs:TzJ07HsAGz,fake-fs:nQngmvgx4m,fake-fs:6bZQCR8epb,fake-fs:xb3SJKX1bi,fake-fs:GF3DPK4zDj,fake-fs:HmxgAqEegt,fake-fs:yT2OAMQYal,fake-fs:MiVX4VYXHk,fake-fs:QMbsUbjJTI,fake-fs:KzAbDNsmPc,fake-fs:m6CGOwOcdT,fake-fs:0cyHx9zsA3,fake-fs:SIwjWfFLSY,fake-fs:uZSDXCEqLY,fake-fs:HuoTL3nK7k,fake-fs:oyoejYE0CI,fake-fs:56WLhiCxbz,fake-fs:SqYOi0z5sM,fake-fs:LZq3ei28Ez,fake-fs:pTc4pCtwk8,fake-fs:AAJSFf0RHS,fake-fs:up6EHkEbO9,fake-fs:GB1Pesdnxd,fake-fs:Oyvq4Z96S4,fake-fs:rYXrhklgf6,fake-fs:g1HdUkQziH`;
    const keys = raw.split(",").map((value) => URI.parse(value, true));
    const tst = TernarySearchTree.forUris();
    for (const item of keys) {
      tst.set(item, true);
      assert.ok(tst._isBalanced(), `SET${item}|${keys.map(String).join()}`);
    }
    const lengthNow = Array.from(tst).length;
    assert.strictEqual(lengthNow, keys.length);
    const keys2 = keys.slice(0);
    for (const [index, item] of keys.entries()) {
      tst.delete(item);
      assert.ok(tst._isBalanced(), `DEL${item}|${keys.map(String).join()}`);
      const idx = keys2.indexOf(item);
      assert.ok(idx >= 0);
      keys2.splice(idx, 1);
      const actualKeys = Array.from(tst).map((value) => value[0]);
      assert.strictEqual(
        actualKeys.length,
        keys2.length,
        `FAILED with ${index} -> ${item.toString()}
WANTED:${keys2.map(String).sort().join()}
ACTUAL:${actualKeys.map(String).sort().join()}`
      );
    }
    assert.strictEqual(Array.from(tst).length, 0);
  });
  test("TernarySearchTree: Cannot read properties of undefined (reading 'length'): #161618 (simple)", function() {
    const raw = "config.debug.toolBarLocation,floating,config.editor.renderControlCharacters,true,config.editor.renderWhitespace,selection,config.files.autoSave,off,config.git.enabled,true,config.notebook.globalToolbar,true,config.terminal.integrated.tabs.enabled,true,config.terminal.integrated.tabs.showActions,singleTerminalOrNarrow,config.terminal.integrated.tabs.showActiveTerminal,singleTerminalOrNarrow,config.workbench.activityBar.visible,true,config.workbench.experimental.settingsProfiles.enabled,true,config.workbench.layoutControl.type,both,config.workbench.sideBar.location,left,config.workbench.statusBar.visible,true";
    const array = raw.split(",");
    const tuples = [];
    for (let i = 0; i < array.length; i += 2) {
      tuples.push([array[i], array[i + 1]]);
    }
    const map = TernarySearchTree.forConfigKeys();
    map.fill(tuples);
    assert.strictEqual([...map].join(), raw);
    assert.ok(map.has("config.editor.renderWhitespace"));
    const len = [...map].length;
    map.delete("config.editor.renderWhitespace");
    assert.ok(map._isBalanced());
    assert.strictEqual([...map].length, len - 1);
  });
  test("TernarySearchTree: Cannot read properties of undefined (reading 'length'): #161618 (random)", function() {
    const raw = "config.debug.toolBarLocation,floating,config.editor.renderControlCharacters,true,config.editor.renderWhitespace,selection,config.files.autoSave,off,config.git.enabled,true,config.notebook.globalToolbar,true,config.terminal.integrated.tabs.enabled,true,config.terminal.integrated.tabs.showActions,singleTerminalOrNarrow,config.terminal.integrated.tabs.showActiveTerminal,singleTerminalOrNarrow,config.workbench.activityBar.visible,true,config.workbench.experimental.settingsProfiles.enabled,true,config.workbench.layoutControl.type,both,config.workbench.sideBar.location,left,config.workbench.statusBar.visible,true";
    const array = raw.split(",");
    const tuples = [];
    for (let i = 0; i < array.length; i += 2) {
      tuples.push([array[i], array[i + 1]]);
    }
    for (let round = 100; round >= 0; round--) {
      shuffle(tuples);
      const map = TernarySearchTree.forConfigKeys();
      map.fill(tuples);
      assert.strictEqual([...map].join(), raw);
      assert.ok(map.has("config.editor.renderWhitespace"));
      const len = [...map].length;
      map.delete("config.editor.renderWhitespace");
      assert.ok(map._isBalanced());
      assert.strictEqual([...map].length, len - 1);
    }
  });
  test("TernarySearchTree (PathSegments) - lookup", function() {
    const map = new TernarySearchTree(new PathIterator());
    map.set("/user/foo/bar", 1);
    map.set("/user/foo", 2);
    map.set("/user/foo/flip/flop", 3);
    assert.strictEqual(map.get("/foo"), void 0);
    assert.strictEqual(map.get("/user"), void 0);
    assert.strictEqual(map.get("/user/foo"), 2);
    assert.strictEqual(map.get("/user/foo/bar"), 1);
    assert.strictEqual(map.get("/user/foo/bar/boo"), void 0);
  });
  test("TernarySearchTree (PathSegments) - superstr", function() {
    const map = new TernarySearchTree(new PathIterator());
    map.set("/user/foo/bar", 1);
    map.set("/user/foo", 2);
    map.set("/user/foo/flip/flop", 3);
    map.set("/usr/foo", 4);
    let item;
    let iter = map.findSuperstr("/user");
    item = iter.next();
    assert.strictEqual(item.value[1], 2);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value[1], 1);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value[1], 3);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value, void 0);
    assert.strictEqual(item.done, true);
    iter = map.findSuperstr("/usr");
    item = iter.next();
    assert.strictEqual(item.value[1], 4);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value, void 0);
    assert.strictEqual(item.done, true);
    assert.strictEqual(map.findSuperstr("/not"), void 0);
    assert.strictEqual(map.findSuperstr("/us"), void 0);
    assert.strictEqual(map.findSuperstr("/usrr"), void 0);
    assert.strictEqual(map.findSuperstr("/userr"), void 0);
  });
  test("TernarySearchTree (PathSegments) - delete_superstr", function() {
    const map = new TernarySearchTree(new PathIterator());
    map.set("/user/foo/bar", 1);
    map.set("/user/foo", 2);
    map.set("/user/foo/flip/flop", 3);
    map.set("/usr/foo", 4);
    assertTstDfs(
      map,
      ["/user/foo", 2],
      ["/user/foo/bar", 1],
      ["/user/foo/flip/flop", 3],
      ["/usr/foo", 4]
    );
    map.deleteSuperstr("/user/fo");
    assertTstDfs(
      map,
      ["/user/foo", 2],
      ["/user/foo/bar", 1],
      ["/user/foo/flip/flop", 3],
      ["/usr/foo", 4]
    );
    map.set("/user/foo/bar", 1);
    map.set("/user/foo", 2);
    map.set("/user/foo/flip/flop", 3);
    map.set("/usr/foo", 4);
    map.deleteSuperstr("/user/foo");
    assertTstDfs(
      map,
      ["/user/foo", 2],
      ["/usr/foo", 4]
    );
  });
  test("TernarySearchTree (URI) - basics", function() {
    const trie = new TernarySearchTree(new UriIterator(() => false, () => false));
    trie.set(URI.file("/user/foo/bar"), 1);
    trie.set(URI.file("/user/foo"), 2);
    trie.set(URI.file("/user/foo/flip/flop"), 3);
    assert.strictEqual(trie.get(URI.file("/user/foo/bar")), 1);
    assert.strictEqual(trie.get(URI.file("/user/foo")), 2);
    assert.strictEqual(trie.get(URI.file("/user/foo/flip/flop")), 3);
    assert.strictEqual(trie.findSubstr(URI.file("/user/bar")), void 0);
    assert.strictEqual(trie.findSubstr(URI.file("/user/foo")), 2);
    assert.strictEqual(trie.findSubstr(URI.file("/user/foo/ba")), 2);
    assert.strictEqual(trie.findSubstr(URI.file("/user/foo/far/boo")), 2);
    assert.strictEqual(trie.findSubstr(URI.file("/user/foo/bar")), 1);
    assert.strictEqual(trie.findSubstr(URI.file("/user/foo/bar/far/boo")), 1);
  });
  test("TernarySearchTree (URI) - query parameters", function() {
    const trie = new TernarySearchTree(new UriIterator(() => false, () => true));
    const root = URI.parse("memfs:/?param=1");
    trie.set(root, 1);
    assert.strictEqual(trie.get(URI.parse("memfs:/?param=1")), 1);
    assert.strictEqual(trie.findSubstr(URI.parse("memfs:/?param=1")), 1);
    assert.strictEqual(trie.findSubstr(URI.parse("memfs:/aaa?param=1")), 1);
  });
  test("TernarySearchTree (URI) - lookup", function() {
    const map = new TernarySearchTree(new UriIterator(() => false, () => false));
    map.set(URI.parse("http://foo.bar/user/foo/bar"), 1);
    map.set(URI.parse("http://foo.bar/user/foo?query"), 2);
    map.set(URI.parse("http://foo.bar/user/foo?QUERY"), 3);
    map.set(URI.parse("http://foo.bar/user/foo/flip/flop"), 3);
    assert.strictEqual(map.get(URI.parse("http://foo.bar/foo")), void 0);
    assert.strictEqual(map.get(URI.parse("http://foo.bar/user")), void 0);
    assert.strictEqual(map.get(URI.parse("http://foo.bar/user/foo/bar")), 1);
    assert.strictEqual(map.get(URI.parse("http://foo.bar/user/foo?query")), 2);
    assert.strictEqual(map.get(URI.parse("http://foo.bar/user/foo?Query")), void 0);
    assert.strictEqual(map.get(URI.parse("http://foo.bar/user/foo?QUERY")), 3);
    assert.strictEqual(map.get(URI.parse("http://foo.bar/user/foo/bar/boo")), void 0);
  });
  test("TernarySearchTree (URI) - lookup, casing", function() {
    const map = new TernarySearchTree(new UriIterator((uri) => /^https?$/.test(uri.scheme), () => false));
    map.set(URI.parse("http://foo.bar/user/foo/bar"), 1);
    assert.strictEqual(map.get(URI.parse("http://foo.bar/USER/foo/bar")), 1);
    map.set(URI.parse("foo://foo.bar/user/foo/bar"), 1);
    assert.strictEqual(map.get(URI.parse("foo://foo.bar/USER/foo/bar")), void 0);
  });
  test("TernarySearchTree (URI) - superstr", function() {
    const map = new TernarySearchTree(new UriIterator(() => false, () => false));
    map.set(URI.file("/user/foo/bar"), 1);
    map.set(URI.file("/user/foo"), 2);
    map.set(URI.file("/user/foo/flip/flop"), 3);
    map.set(URI.file("/usr/foo"), 4);
    let item;
    let iter = map.findSuperstr(URI.file("/user"));
    item = iter.next();
    assert.strictEqual(item.value[1], 2);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value[1], 1);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value[1], 3);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value, void 0);
    assert.strictEqual(item.done, true);
    iter = map.findSuperstr(URI.file("/usr"));
    item = iter.next();
    assert.strictEqual(item.value[1], 4);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value, void 0);
    assert.strictEqual(item.done, true);
    iter = map.findSuperstr(URI.file("/"));
    item = iter.next();
    assert.strictEqual(item.value[1], 2);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value[1], 1);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value[1], 3);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value[1], 4);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value, void 0);
    assert.strictEqual(item.done, true);
    assert.strictEqual(map.findSuperstr(URI.file("/not")), void 0);
    assert.strictEqual(map.findSuperstr(URI.file("/us")), void 0);
    assert.strictEqual(map.findSuperstr(URI.file("/usrr")), void 0);
    assert.strictEqual(map.findSuperstr(URI.file("/userr")), void 0);
  });
  test("TernarySearchTree (ConfigKeySegments) - basics", function() {
    const trie = new TernarySearchTree(new ConfigKeysIterator());
    trie.set("config.foo.bar", 1);
    trie.set("config.foo", 2);
    trie.set("config.foo.flip.flop", 3);
    assert.strictEqual(trie.get("config.foo.bar"), 1);
    assert.strictEqual(trie.get("config.foo"), 2);
    assert.strictEqual(trie.get("config.foo.flip.flop"), 3);
    assert.strictEqual(trie.findSubstr("config.bar"), void 0);
    assert.strictEqual(trie.findSubstr("config.foo"), 2);
    assert.strictEqual(trie.findSubstr("config.foo.ba"), 2);
    assert.strictEqual(trie.findSubstr("config.foo.far.boo"), 2);
    assert.strictEqual(trie.findSubstr("config.foo.bar"), 1);
    assert.strictEqual(trie.findSubstr("config.foo.bar.far.boo"), 1);
  });
  test("TernarySearchTree (ConfigKeySegments) - lookup", function() {
    const map = new TernarySearchTree(new ConfigKeysIterator());
    map.set("config.foo.bar", 1);
    map.set("config.foo", 2);
    map.set("config.foo.flip.flop", 3);
    assert.strictEqual(map.get("foo"), void 0);
    assert.strictEqual(map.get("config"), void 0);
    assert.strictEqual(map.get("config.foo"), 2);
    assert.strictEqual(map.get("config.foo.bar"), 1);
    assert.strictEqual(map.get("config.foo.bar.boo"), void 0);
  });
  test("TernarySearchTree (ConfigKeySegments) - superstr", function() {
    const map = new TernarySearchTree(new ConfigKeysIterator());
    map.set("config.foo.bar", 1);
    map.set("config.foo", 2);
    map.set("config.foo.flip.flop", 3);
    map.set("boo", 4);
    let item;
    const iter = map.findSuperstr("config");
    item = iter.next();
    assert.strictEqual(item.value[1], 2);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value[1], 1);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value[1], 3);
    assert.strictEqual(item.done, false);
    item = iter.next();
    assert.strictEqual(item.value, void 0);
    assert.strictEqual(item.done, true);
    assert.strictEqual(map.findSuperstr("foo"), void 0);
    assert.strictEqual(map.findSuperstr("config.foo.no"), void 0);
    assert.strictEqual(map.findSuperstr("config.foop"), void 0);
  });
  test("TernarySearchTree (ConfigKeySegments) - delete_superstr", function() {
    const map = new TernarySearchTree(new ConfigKeysIterator());
    map.set("config.foo.bar", 1);
    map.set("config.foo", 2);
    map.set("config.foo.flip.flop", 3);
    map.set("boo", 4);
    assertTstDfs(
      map,
      ["boo", 4],
      ["config.foo", 2],
      ["config.foo.bar", 1],
      ["config.foo.flip.flop", 3]
    );
    map.deleteSuperstr("config.fo");
    assertTstDfs(
      map,
      ["boo", 4],
      ["config.foo", 2],
      ["config.foo.bar", 1],
      ["config.foo.flip.flop", 3]
    );
    map.set("config.foo.bar", 1);
    map.set("config.foo", 2);
    map.set("config.foo.flip.flop", 3);
    map.set("config.boo", 4);
    map.deleteSuperstr("config.foo");
    assertTstDfs(
      map,
      ["boo", 4],
      ["config.foo", 2]
    );
  });
  test("TST, fill", function() {
    const tst = TernarySearchTree.forStrings();
    const keys = ["foo", "bar", "bang", "bazz"];
    Object.freeze(keys);
    tst.fill(true, keys);
    for (const key of keys) {
      assert.ok(tst.get(key), key);
    }
  });
});
suite.skip("TST, perf", function() {
  function createRandomUris(n) {
    const uris = [];
    function randomWord() {
      let result = "";
      const length = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < length; i++) {
        result += (Math.random() * 26 + 65).toString(36);
      }
      return result;
    }
    const words = [];
    for (let i = 0; i < 1e4; i++) {
      words.push(randomWord());
    }
    for (let i = 0; i < n; i++) {
      let len = 4 + Math.floor(Math.random() * 4);
      const segments = [];
      for (; len >= 0; len--) {
        segments.push(words[Math.floor(Math.random() * words.length)]);
      }
      uris.push(URI.from({ scheme: "file", path: segments.join("/") }));
    }
    return uris;
  }
  let tree;
  let sampleUris = [];
  let candidates = [];
  suiteSetup(() => {
    const len = 5e4;
    sampleUris = createRandomUris(len);
    candidates = [...sampleUris.slice(0, len / 2), ...createRandomUris(len / 2)];
    shuffle(candidates);
  });
  setup(() => {
    tree = TernarySearchTree.forUris();
    for (const uri of sampleUris) {
      tree.set(uri, true);
    }
  });
  const _profile = false;
  function perfTest(name, callback) {
    test(name, function() {
      if (_profile) {
        console.profile(name);
      }
      const sw = new StopWatch();
      callback();
      console.log(name, sw.elapsed());
      if (_profile) {
        console.profileEnd();
      }
    });
  }
  perfTest("TST, clear", function() {
    tree.clear();
  });
  perfTest("TST, insert", function() {
    const insertTree = TernarySearchTree.forUris();
    for (const uri of sampleUris) {
      insertTree.set(uri, true);
    }
  });
  perfTest("TST, lookup", function() {
    let match = 0;
    for (const candidate of candidates) {
      if (tree.has(candidate)) {
        match += 1;
      }
    }
    assert.strictEqual(match, sampleUris.length / 2);
  });
  perfTest("TST, substr", function() {
    let match = 0;
    for (const candidate of candidates) {
      if (tree.findSubstr(candidate)) {
        match += 1;
      }
    }
    assert.strictEqual(match, sampleUris.length / 2);
  });
  perfTest("TST, superstr", function() {
    for (const candidate of candidates) {
      tree.findSuperstr(candidate);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXHRlcm5hcnlTZWFyY2h0cmVlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBzaHVmZmxlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyByYW5kb21QYXRoIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBDb25maWdLZXlzSXRlcmF0b3IsIFBhdGhJdGVyYXRvciwgU3RyaW5nSXRlcmF0b3IsIFRlcm5hcnlTZWFyY2hUcmVlLCBVcmlJdGVyYXRvciB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJuYXJ5U2VhcmNoVHJlZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5zdWl0ZSgnVGVybmFyeSBTZWFyY2ggVHJlZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdQYXRoSXRlcmF0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlciA9IG5ldyBQYXRoSXRlcmF0b3IoKTtcblx0XHRpdGVyLnJlc2V0KCdmaWxlOi8vL3Vzci9iaW4vZmlsZS50eHQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICdmaWxlOicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmhhc05leHQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuY21wKCdmaWxlOicpLCAwKTtcblx0XHRhc3NlcnQub2soaXRlci5jbXAoJ2EnKSA8IDApO1xuXHRcdGFzc2VydC5vayhpdGVyLmNtcCgnYWlsZTonKSA8IDApO1xuXHRcdGFzc2VydC5vayhpdGVyLmNtcCgneicpID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKGl0ZXIuY21wKCd6aWxlOicpID4gMCk7XG5cblx0XHRpdGVyLm5leHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci52YWx1ZSgpLCAndXNyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuaGFzTmV4dCgpLCB0cnVlKTtcblxuXHRcdGl0ZXIubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICdiaW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXG5cdFx0aXRlci5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIudmFsdWUoKSwgJ2ZpbGUudHh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuaGFzTmV4dCgpLCBmYWxzZSk7XG5cblx0XHRpdGVyLm5leHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci52YWx1ZSgpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuaGFzTmV4dCgpLCBmYWxzZSk7XG5cdFx0aXRlci5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIudmFsdWUoKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmhhc05leHQoKSwgZmFsc2UpO1xuXG5cdFx0Ly9cblx0XHRpdGVyLnJlc2V0KCcvZm9vL2Jhci8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci52YWx1ZSgpLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuaGFzTmV4dCgpLCB0cnVlKTtcblxuXHRcdGl0ZXIubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnVVJJSXRlcmF0b3InLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaXRlciA9IG5ldyBVcmlJdGVyYXRvcigoKSA9PiBmYWxzZSwgKCkgPT4gZmFsc2UpO1xuXHRcdGl0ZXIucmVzZXQoVVJJLnBhcnNlKCdmaWxlOi8vL3Vzci9iaW4vZmlsZS50eHQnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci52YWx1ZSgpLCAnZmlsZScpO1xuXHRcdC8vIGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmNtcCgnRklMRScpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5jbXAoJ2ZpbGUnKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuaGFzTmV4dCgpLCB0cnVlKTtcblx0XHRpdGVyLm5leHQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICd1c3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXHRcdGl0ZXIubmV4dCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIudmFsdWUoKSwgJ2JpbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmhhc05leHQoKSwgdHJ1ZSk7XG5cdFx0aXRlci5uZXh0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci52YWx1ZSgpLCAnZmlsZS50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIGZhbHNlKTtcblxuXG5cdFx0aXRlci5yZXNldChVUkkucGFyc2UoJ2ZpbGU6Ly9zaGFyZS91c3IvYmluL2ZpbGUudHh0P2ZvbycpKTtcblxuXHRcdC8vIHNjaGVtZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICdmaWxlJyk7XG5cdFx0Ly8gYXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuY21wKCdGSUxFJyksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmNtcCgnZmlsZScpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXHRcdGl0ZXIubmV4dCgpO1xuXG5cdFx0Ly8gYXV0aG9yaXR5XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIudmFsdWUoKSwgJ3NoYXJlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuY21wKCdTSEFSZScpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXHRcdGl0ZXIubmV4dCgpO1xuXG5cdFx0Ly8gcGF0aFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICd1c3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXHRcdGl0ZXIubmV4dCgpO1xuXG5cdFx0Ly8gcGF0aFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICdiaW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXHRcdGl0ZXIubmV4dCgpO1xuXG5cdFx0Ly8gcGF0aFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICdmaWxlLnR4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmhhc05leHQoKSwgdHJ1ZSk7XG5cdFx0aXRlci5uZXh0KCk7XG5cblx0XHQvLyBxdWVyeVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5jbXAoJ3onKSA+IDAsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmNtcCgnYScpIDwgMCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuaGFzTmV4dCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSUl0ZXJhdG9yIC0gaWdub3JlIHF1ZXJ5L2ZyYWdtZW50JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGl0ZXIgPSBuZXcgVXJpSXRlcmF0b3IoKCkgPT4gZmFsc2UsICgpID0+IHRydWUpO1xuXHRcdGl0ZXIucmVzZXQoVVJJLnBhcnNlKCdmaWxlOi8vL3Vzci9iaW4vZmlsZS50eHQnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci52YWx1ZSgpLCAnZmlsZScpO1xuXHRcdC8vIGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmNtcCgnRklMRScpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5jbXAoJ2ZpbGUnKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuaGFzTmV4dCgpLCB0cnVlKTtcblx0XHRpdGVyLm5leHQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICd1c3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXHRcdGl0ZXIubmV4dCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIudmFsdWUoKSwgJ2JpbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmhhc05leHQoKSwgdHJ1ZSk7XG5cdFx0aXRlci5uZXh0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci52YWx1ZSgpLCAnZmlsZS50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIGZhbHNlKTtcblxuXG5cdFx0aXRlci5yZXNldChVUkkucGFyc2UoJ2ZpbGU6Ly9zaGFyZS91c3IvYmluL2ZpbGUudHh0P2ZvbycpKTtcblxuXHRcdC8vIHNjaGVtZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICdmaWxlJyk7XG5cdFx0Ly8gYXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuY21wKCdGSUxFJyksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmNtcCgnZmlsZScpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXHRcdGl0ZXIubmV4dCgpO1xuXG5cdFx0Ly8gYXV0aG9yaXR5XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIudmFsdWUoKSwgJ3NoYXJlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZXIuY21wKCdTSEFSZScpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXHRcdGl0ZXIubmV4dCgpO1xuXG5cdFx0Ly8gcGF0aFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICd1c3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXHRcdGl0ZXIubmV4dCgpO1xuXG5cdFx0Ly8gcGF0aFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICdiaW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlci5oYXNOZXh0KCksIHRydWUpO1xuXHRcdGl0ZXIubmV4dCgpO1xuXG5cdFx0Ly8gcGF0aFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLnZhbHVlKCksICdmaWxlLnR4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVyLmhhc05leHQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBhc3NlcnRUc3REZnM8RT4odHJpZTogVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBFPiwgLi4uZWxlbWVudHM6IFtzdHJpbmcsIEVdW10pIHtcblxuXHRcdGFzc2VydC5vayh0cmllLl9pc0JhbGFuY2VkKCksICdUU1QgaXMgbm90IGJhbGFuY2VkJyk7XG5cblx0XHRsZXQgaSA9IDA7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdHJpZSkge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBlbGVtZW50c1tpKytdO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4cGVjdGVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChrZXksIGV4cGVjdGVkWzBdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgZXhwZWN0ZWRbMV0pO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpLCBlbGVtZW50cy5sZW5ndGgpO1xuXG5cdFx0Y29uc3QgbWFwID0gbmV3IE1hcDxzdHJpbmcsIEU+KCk7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgZWxlbWVudHMpIHtcblx0XHRcdG1hcC5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0fVxuXHRcdG1hcC5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5nZXQoa2V5KSwgdmFsdWUpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gZm9yRWFjaFxuXHRcdGxldCBmb3JFYWNoQ291bnQgPSAwO1xuXHRcdHRyaWUuZm9yRWFjaCgoZWxlbWVudCwga2V5KSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudCwgbWFwLmdldChrZXkpKTtcblx0XHRcdGZvckVhY2hDb3VudCsrO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgZm9yRWFjaENvdW50KTtcblxuXHRcdC8vIGl0ZXJhdG9yXG5cdFx0bGV0IGl0ZXJDb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdHJpZSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCBtYXAuZ2V0KGtleSkpO1xuXHRcdFx0aXRlckNvdW50Kys7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgaXRlckNvdW50KTtcblxuXHR9XG5cblx0dGVzdCgnVGVybmFyeVNlYXJjaFRyZWUgLSBzZXQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgdHJpZSA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclN0cmluZ3M8bnVtYmVyPigpO1xuXHRcdHRyaWUuc2V0KCdmb29iYXInLCAxKTtcblx0XHR0cmllLnNldCgnZm9vYmF6JywgMik7XG5cblx0XHRhc3NlcnRUc3REZnModHJpZSwgWydmb29iYXInLCAxXSwgWydmb29iYXonLCAyXSk7IC8vIGxvbmdlclxuXG5cdFx0dHJpZSA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclN0cmluZ3M8bnVtYmVyPigpO1xuXHRcdHRyaWUuc2V0KCdmb29iYXInLCAxKTtcblx0XHR0cmllLnNldCgnZm9vYmEnLCAyKTtcblx0XHRhc3NlcnRUc3REZnModHJpZSwgWydmb29iYScsIDJdLCBbJ2Zvb2JhcicsIDFdKTsgLy8gc2hvcnRlclxuXG5cdFx0dHJpZSA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclN0cmluZ3M8bnVtYmVyPigpO1xuXHRcdHRyaWUuc2V0KCdmb28nLCAxKTtcblx0XHR0cmllLnNldCgnZm9vJywgMik7XG5cdFx0YXNzZXJ0VHN0RGZzKHRyaWUsIFsnZm9vJywgMl0pO1xuXG5cdFx0dHJpZSA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclN0cmluZ3M8bnVtYmVyPigpO1xuXHRcdHRyaWUuc2V0KCdmb28nLCAxKTtcblx0XHR0cmllLnNldCgnZm9vYmFyJywgMik7XG5cdFx0dHJpZS5zZXQoJ2JhcicsIDMpO1xuXHRcdHRyaWUuc2V0KCdmb29iJywgNCk7XG5cdFx0dHJpZS5zZXQoJ2JhenonLCA1KTtcblxuXHRcdGFzc2VydFRzdERmcyh0cmllLFxuXHRcdFx0WydiYXInLCAzXSxcblx0XHRcdFsnYmF6eicsIDVdLFxuXHRcdFx0Wydmb28nLCAxXSxcblx0XHRcdFsnZm9vYicsIDRdLFxuXHRcdFx0Wydmb29iYXInLCAyXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXJuYXJ5U2VhcmNoVHJlZSAtIHNldCB3LyB1bmRlZmluZWQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCB0cmllID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yU3RyaW5nczxhbnk+KCk7XG5cdFx0dHJpZS5zZXQoJ2Zvb2JhcicsIHVuZGVmaW5lZCk7XG5cdFx0dHJpZS5zZXQoJ2Zvb2JheicsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZ2V0KCdmb29iYXInKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5nZXQoJ2Zvb2JheicpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5nZXQoJ05PVCBIRVJFJyksIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2sodHJpZS5oYXMoJ2Zvb2JheicpKTtcblx0XHRhc3NlcnQub2sodHJpZS5oYXMoJ2Zvb2JhcicpKTtcblx0XHRhc3NlcnQub2soIXRyaWUuaGFzKCdOT1QgSEVSRScpKTtcblxuXHRcdGFzc2VydFRzdERmcyh0cmllLCBbJ2Zvb2JhcicsIHVuZGVmaW5lZF0sIFsnZm9vYmF6JywgMl0pOyAvLyBzaG91bGQgY2hlY2sgZm9yIHVuZGVmaW5lZCB2YWx1ZVxuXG5cdFx0Y29uc3Qgb2xkVmFsdWUgPSB0cmllLnNldCgnZm9vYmFyJywgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9sZFZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnZm9vYmFyJyksIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXJuYXJ5U2VhcmNoVHJlZSAtIGZpbmRMb25nZXN0TWF0Y2gnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCB0cmllID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yU3RyaW5nczxudW1iZXI+KCk7XG5cdFx0dHJpZS5zZXQoJ2ZvbycsIDEpO1xuXHRcdHRyaWUuc2V0KCdmb29iYXInLCAyKTtcblx0XHR0cmllLnNldCgnZm9vYmF6JywgMyk7XG5cdFx0YXNzZXJ0VHN0RGZzKHRyaWUsIFsnZm9vJywgMV0sIFsnZm9vYmFyJywgMl0sIFsnZm9vYmF6JywgM10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cignZicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmZpbmRTdWJzdHIoJ3onKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKCdmb28nKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cignZm9vXHUwMEY2JyksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmZpbmRTdWJzdHIoJ2Zvb2JhJyksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmZpbmRTdWJzdHIoJ2Zvb2JhcnInKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cignZm9vYmF6cnInKSwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm5hcnlTZWFyY2hUcmVlIC0gYmFzaWNzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRyaWUgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBudW1iZXI+KG5ldyBTdHJpbmdJdGVyYXRvcigpKTtcblxuXHRcdHRyaWUuc2V0KCdmb28nLCAxKTtcblx0XHR0cmllLnNldCgnYmFyJywgMik7XG5cdFx0dHJpZS5zZXQoJ2Zvb2JhcicsIDMpO1xuXHRcdGFzc2VydFRzdERmcyh0cmllLCBbJ2JhcicsIDJdLCBbJ2ZvbycsIDFdLCBbJ2Zvb2JhcicsIDNdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnZm9vJyksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnYmFyJyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnZm9vYmFyJyksIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnZm9vYmF6JyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZ2V0KCdmb29iYXJyJyksIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKCdmbycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmZpbmRTdWJzdHIoJ2ZvbycpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKCdmb29vbycpLCAxKTtcblxuXG5cdFx0dHJpZS5kZWxldGUoJ2Zvb2JhcicpO1xuXHRcdHRyaWUuZGVsZXRlKCdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5nZXQoJ2Zvb2JhcicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnYmFyJyksIHVuZGVmaW5lZCk7XG5cblx0XHR0cmllLnNldCgnZm9vYmFyJywgMTcpO1xuXHRcdHRyaWUuc2V0KCdiYXJyJywgMTgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnZm9vYmFyJyksIDE3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5nZXQoJ2JhcnInKSwgMTgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnYmFyJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm5hcnlTZWFyY2hUcmVlIC0gZGVsZXRlICYgY2xlYW51cCcsIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBub3JtYWwgZGVsZXRlXG5cdFx0bGV0IHRyaWUgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBudW1iZXI+KG5ldyBTdHJpbmdJdGVyYXRvcigpKTtcblx0XHR0cmllLnNldCgnZm9vJywgMSk7XG5cdFx0dHJpZS5zZXQoJ2Zvb2JhcicsIDIpO1xuXHRcdHRyaWUuc2V0KCdiYXInLCAzKTtcblx0XHRhc3NlcnRUc3REZnModHJpZSwgWydiYXInLCAzXSwgWydmb28nLCAxXSwgWydmb29iYXInLCAyXSk7XG5cdFx0dHJpZS5kZWxldGUoJ2ZvbycpO1xuXHRcdGFzc2VydFRzdERmcyh0cmllLCBbJ2JhcicsIDNdLCBbJ2Zvb2JhcicsIDJdKTtcblx0XHR0cmllLmRlbGV0ZSgnZm9vYmFyJyk7XG5cdFx0YXNzZXJ0VHN0RGZzKHRyaWUsIFsnYmFyJywgM10pO1xuXG5cdFx0Ly8gc3VwZXJzdHItZGVsZXRlXG5cdFx0dHJpZSA9IG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxzdHJpbmcsIG51bWJlcj4obmV3IFN0cmluZ0l0ZXJhdG9yKCkpO1xuXHRcdHRyaWUuc2V0KCdmb28nLCAxKTtcblx0XHR0cmllLnNldCgnZm9vYmFyJywgMik7XG5cdFx0dHJpZS5zZXQoJ2JhcicsIDMpO1xuXHRcdHRyaWUuc2V0KCdmb29iYXJiYXonLCA0KTtcblx0XHR0cmllLmRlbGV0ZVN1cGVyc3RyKCdmb28nKTtcblx0XHRhc3NlcnRUc3REZnModHJpZSwgWydiYXInLCAzXSwgWydmb28nLCAxXSk7XG5cblx0XHR0cmllID0gbmV3IFRlcm5hcnlTZWFyY2hUcmVlPHN0cmluZywgbnVtYmVyPihuZXcgU3RyaW5nSXRlcmF0b3IoKSk7XG5cdFx0dHJpZS5zZXQoJ2ZvbycsIDEpO1xuXHRcdHRyaWUuc2V0KCdmb29iYXInLCAyKTtcblx0XHR0cmllLnNldCgnYmFyJywgMyk7XG5cdFx0dHJpZS5zZXQoJ2Zvb2JhcmJheicsIDQpO1xuXHRcdHRyaWUuZGVsZXRlU3VwZXJzdHIoJ2ZvJyk7XG5cdFx0YXNzZXJ0VHN0RGZzKHRyaWUsIFsnYmFyJywgM10pO1xuXG5cdFx0Ly8gdHJpZSA9IG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxzdHJpbmcsIG51bWJlcj4obmV3IFN0cmluZ0l0ZXJhdG9yKCkpO1xuXHRcdC8vIHRyaWUuc2V0KCdmb28nLCAxKTtcblx0XHQvLyB0cmllLnNldCgnZm9vYmFyJywgMik7XG5cdFx0Ly8gdHJpZS5zZXQoJ2JhcicsIDMpO1xuXHRcdC8vIHRyaWUuZGVsZXRlU3VwZXJTdHIoJ2YnKTtcblx0XHQvLyBhc3NlcnRUZXJuYXJ5U2VhcmNoVHJlZSh0cmllLCBbJ2JhcicsIDNdKTtcblx0fSk7XG5cblx0dGVzdCgnVGVybmFyeVNlYXJjaFRyZWUgKFBhdGhTZWdtZW50cykgLSBiYXNpY3MnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdHJpZSA9IG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxzdHJpbmcsIG51bWJlcj4obmV3IFBhdGhJdGVyYXRvcigpKTtcblxuXHRcdHRyaWUuc2V0KCcvdXNlci9mb28vYmFyJywgMSk7XG5cdFx0dHJpZS5zZXQoJy91c2VyL2ZvbycsIDIpO1xuXHRcdHRyaWUuc2V0KCcvdXNlci9mb28vZmxpcC9mbG9wJywgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5nZXQoJy91c2VyL2Zvby9iYXInKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZ2V0KCcvdXNlci9mb28nKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZ2V0KCcvdXNlci8vZm9vJyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnL3VzZXJcXFxcZm9vJyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnL3VzZXIvZm9vL2ZsaXAvZmxvcCcpLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmZpbmRTdWJzdHIoJy91c2VyL2JhcicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmZpbmRTdWJzdHIoJy91c2VyL2ZvbycpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKCdcXFxcdXNlclxcXFxmb28nKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cignL3VzZXIvL2ZvbycpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKCcvdXNlci9mb28vYmEnKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cignL3VzZXIvZm9vL2Zhci9ib28nKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cignL3VzZXIvZm9vL2JhcicpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKCcvdXNlci9mb28vYmFyL2Zhci9ib28nKSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm5hcnlTZWFyY2hUcmVlIC0gKEFWTCkgc2V0JywgZnVuY3Rpb24gKCkge1xuXHRcdHtcblx0XHRcdC8vIHJvdGF0ZSBsZWZ0XG5cdFx0XHRjb25zdCB0cmllID0gbmV3IFRlcm5hcnlTZWFyY2hUcmVlPHN0cmluZywgbnVtYmVyPihuZXcgUGF0aEl0ZXJhdG9yKCkpO1xuXHRcdFx0dHJpZS5zZXQoJy9maWxlQScsIDEpO1xuXHRcdFx0dHJpZS5zZXQoJy9maWxlQicsIDIpO1xuXHRcdFx0dHJpZS5zZXQoJy9maWxlQycsIDMpO1xuXHRcdFx0YXNzZXJ0VHN0RGZzKHRyaWUsIFsnL2ZpbGVBJywgMV0sIFsnL2ZpbGVCJywgMl0sIFsnL2ZpbGVDJywgM10pO1xuXHRcdH1cblxuXHRcdHtcblx0XHRcdC8vIHJvdGF0ZSBsZWZ0IChpbnNpZGUgbWlkZGxlKVxuXHRcdFx0Y29uc3QgdHJpZSA9IG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxzdHJpbmcsIG51bWJlcj4obmV3IFBhdGhJdGVyYXRvcigpKTtcblx0XHRcdHRyaWUuc2V0KCcvZm9vL2ZpbGVBJywgMSk7XG5cdFx0XHR0cmllLnNldCgnL2Zvby9maWxlQicsIDIpO1xuXHRcdFx0dHJpZS5zZXQoJy9mb28vZmlsZUMnLCAzKTtcblx0XHRcdGFzc2VydFRzdERmcyh0cmllLCBbJy9mb28vZmlsZUEnLCAxXSwgWycvZm9vL2ZpbGVCJywgMl0sIFsnL2Zvby9maWxlQycsIDNdKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHQvLyByb3RhdGUgcmlnaHRcblx0XHRcdGNvbnN0IHRyaWUgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBudW1iZXI+KG5ldyBQYXRoSXRlcmF0b3IoKSk7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVDJywgMyk7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVCJywgMik7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVBJywgMSk7XG5cdFx0XHRhc3NlcnRUc3REZnModHJpZSwgWycvZmlsZUEnLCAxXSwgWycvZmlsZUInLCAyXSwgWycvZmlsZUMnLCAzXSk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0Ly8gcm90YXRlIHJpZ2h0IChpbnNpZGUgbWlkZGxlKVxuXHRcdFx0Y29uc3QgdHJpZSA9IG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxzdHJpbmcsIG51bWJlcj4obmV3IFBhdGhJdGVyYXRvcigpKTtcblx0XHRcdHRyaWUuc2V0KCcvbWlkL2ZpbGVDJywgMyk7XG5cdFx0XHR0cmllLnNldCgnL21pZC9maWxlQicsIDIpO1xuXHRcdFx0dHJpZS5zZXQoJy9taWQvZmlsZUEnLCAxKTtcblx0XHRcdGFzc2VydFRzdERmcyh0cmllLCBbJy9taWQvZmlsZUEnLCAxXSwgWycvbWlkL2ZpbGVCJywgMl0sIFsnL21pZC9maWxlQycsIDNdKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHQvLyByb3RhdGUgcmlnaHQsIGxlZnRcblx0XHRcdGNvbnN0IHRyaWUgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBudW1iZXI+KG5ldyBQYXRoSXRlcmF0b3IoKSk7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVEJywgNyk7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVCJywgMik7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVHJywgNDIpO1xuXHRcdFx0dHJpZS5zZXQoJy9maWxlRicsIDI0KTtcblx0XHRcdHRyaWUuc2V0KCcvZmlsZVonLCA3Myk7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVFJywgMTUpO1xuXHRcdFx0YXNzZXJ0VHN0RGZzKHRyaWUsIFsnL2ZpbGVCJywgMl0sIFsnL2ZpbGVEJywgN10sIFsnL2ZpbGVFJywgMTVdLCBbJy9maWxlRicsIDI0XSwgWycvZmlsZUcnLCA0Ml0sIFsnL2ZpbGVaJywgNzNdKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHQvLyByb3RhdGUgbGVmdCwgcmlnaHRcblx0XHRcdGNvbnN0IHRyaWUgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBudW1iZXI+KG5ldyBQYXRoSXRlcmF0b3IoKSk7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVKJywgNDIpO1xuXHRcdFx0dHJpZS5zZXQoJy9maWxlWicsIDczKTtcblx0XHRcdHRyaWUuc2V0KCcvZmlsZUUnLCAxNSk7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVCJywgMik7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVGJywgNyk7XG5cdFx0XHR0cmllLnNldCgnL2ZpbGVHJywgMSk7XG5cdFx0XHRhc3NlcnRUc3REZnModHJpZSwgWycvZmlsZUInLCAyXSwgWycvZmlsZUUnLCAxNV0sIFsnL2ZpbGVGJywgN10sIFsnL2ZpbGVHJywgMV0sIFsnL2ZpbGVKJywgNDJdLCBbJy9maWxlWicsIDczXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdUZXJuYXJ5U2VhcmNoVHJlZSAtIChCU1QpIGRlbGV0ZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHRyaWUgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBudW1iZXI+KG5ldyBTdHJpbmdJdGVyYXRvcigpKTtcblxuXHRcdC8vIGRlbGV0ZSByb290XG5cdFx0dHJpZS5zZXQoJ2QnLCAxKTtcblx0XHRhc3NlcnRUc3REZnModHJpZSwgWydkJywgMV0pO1xuXHRcdHRyaWUuZGVsZXRlKCdkJyk7XG5cdFx0YXNzZXJ0VHN0RGZzKHRyaWUpO1xuXG5cdFx0Ly8gZGVsZXRlIG5vZGUgd2l0aCB0d28gZWxlbWVudFxuXHRcdHRyaWUuY2xlYXIoKTtcblx0XHR0cmllLnNldCgnZCcsIDEpO1xuXHRcdHRyaWUuc2V0KCdiJywgMSk7XG5cdFx0dHJpZS5zZXQoJ2YnLCAxKTtcblx0XHRhc3NlcnRUc3REZnModHJpZSwgWydiJywgMV0sIFsnZCcsIDFdLCBbJ2YnLCAxXSk7XG5cdFx0dHJpZS5kZWxldGUoJ2QnKTtcblx0XHRhc3NlcnRUc3REZnModHJpZSwgWydiJywgMV0sIFsnZicsIDFdKTtcblxuXHRcdC8vIHNpbmdsZSBjaGlsZCBub2RlXG5cdFx0dHJpZS5jbGVhcigpO1xuXHRcdHRyaWUuc2V0KCdkJywgMSk7XG5cdFx0dHJpZS5zZXQoJ2InLCAxKTtcblx0XHR0cmllLnNldCgnZicsIDEpO1xuXHRcdHRyaWUuc2V0KCdlJywgMSk7XG5cdFx0YXNzZXJ0VHN0RGZzKHRyaWUsIFsnYicsIDFdLCBbJ2QnLCAxXSwgWydlJywgMV0sIFsnZicsIDFdKTtcblx0XHR0cmllLmRlbGV0ZSgnZicpO1xuXHRcdGFzc2VydFRzdERmcyh0cmllLCBbJ2InLCAxXSwgWydkJywgMV0sIFsnZScsIDFdKTtcblx0fSk7XG5cblx0dGVzdCgnVGVybmFyeVNlYXJjaFRyZWUgLSAoQVZMKSBkZWxldGUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCB0cmllID0gbmV3IFRlcm5hcnlTZWFyY2hUcmVlPHN0cmluZywgbnVtYmVyPihuZXcgU3RyaW5nSXRlcmF0b3IoKSk7XG5cblx0XHR0cmllLmNsZWFyKCk7XG5cdFx0dHJpZS5zZXQoJ2QnLCAxKTtcblx0XHR0cmllLnNldCgnYicsIDEpO1xuXHRcdHRyaWUuc2V0KCdmJywgMSk7XG5cdFx0dHJpZS5zZXQoJ2UnLCAxKTtcblx0XHR0cmllLnNldCgneicsIDEpO1xuXHRcdGFzc2VydFRzdERmcyh0cmllLCBbJ2InLCAxXSwgWydkJywgMV0sIFsnZScsIDFdLCBbJ2YnLCAxXSwgWyd6JywgMV0pO1xuXG5cdFx0Ly8gcmlnaHQsIHJpZ2h0XG5cdFx0dHJpZS5kZWxldGUoJ2InKTtcblx0XHRhc3NlcnRUc3REZnModHJpZSwgWydkJywgMV0sIFsnZScsIDFdLCBbJ2YnLCAxXSwgWyd6JywgMV0pO1xuXG5cdFx0dHJpZS5jbGVhcigpO1xuXHRcdHRyaWUuc2V0KCdkJywgMSk7XG5cdFx0dHJpZS5zZXQoJ2MnLCAxKTtcblx0XHR0cmllLnNldCgnZicsIDEpO1xuXHRcdHRyaWUuc2V0KCdhJywgMSk7XG5cdFx0dHJpZS5zZXQoJ2InLCAxKTtcblx0XHRhc3NlcnRUc3REZnModHJpZSwgWydhJywgMV0sIFsnYicsIDFdLCBbJ2MnLCAxXSwgWydkJywgMV0sIFsnZicsIDFdKTtcblxuXHRcdC8vIGxlZnQsIGxlZnRcblx0XHR0cmllLmRlbGV0ZSgnZicpO1xuXHRcdGFzc2VydFRzdERmcyh0cmllLCBbJ2EnLCAxXSwgWydiJywgMV0sIFsnYycsIDFdLCBbJ2QnLCAxXSk7XG5cblx0XHQvLyBtaWRcblx0XHR0cmllLmNsZWFyKCk7XG5cdFx0dHJpZS5zZXQoJ2EnLCAxKTtcblx0XHR0cmllLnNldCgnYWQnLCAxKTtcblx0XHR0cmllLnNldCgnYWInLCAxKTtcblx0XHR0cmllLnNldCgnYWYnLCAxKTtcblx0XHR0cmllLnNldCgnYWUnLCAxKTtcblx0XHR0cmllLnNldCgnYXonLCAxKTtcblx0XHRhc3NlcnRUc3REZnModHJpZSwgWydhJywgMV0sIFsnYWInLCAxXSwgWydhZCcsIDFdLCBbJ2FlJywgMV0sIFsnYWYnLCAxXSwgWydheicsIDFdKTtcblxuXHRcdHRyaWUuZGVsZXRlKCdhYicpO1xuXHRcdGFzc2VydFRzdERmcyh0cmllLCBbJ2EnLCAxXSwgWydhZCcsIDFdLCBbJ2FlJywgMV0sIFsnYWYnLCAxXSwgWydheicsIDFdKTtcblxuXHRcdHRyaWUuZGVsZXRlKCdhJyk7XG5cdFx0YXNzZXJ0VHN0RGZzKHRyaWUsIFsnYWQnLCAxXSwgWydhZScsIDFdLCBbJ2FmJywgMV0sIFsnYXonLCAxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm5hcnlTZWFyY2hUcmVlOiBDYW5ub3QgcmVhZCBwcm9wZXJ0eSBcXCcxXFwnIG9mIHVuZGVmaW5lZCAjMTM4Mjg0JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qga2V5cyA9IFtcblx0XHRcdFVSSS5wYXJzZSgnZmFrZS1mczovQycpLFxuXHRcdFx0VVJJLnBhcnNlKCdmYWtlLWZzOi9BJyksXG5cdFx0XHRVUkkucGFyc2UoJ2Zha2UtZnM6L0QnKSxcblx0XHRcdFVSSS5wYXJzZSgnZmFrZS1mczovQicpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0c3QgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JVcmlzPGJvb2xlYW4+KCk7XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Yga2V5cykge1xuXHRcdFx0dHN0LnNldChpdGVtLCB0cnVlKTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2sodHN0Ll9pc0JhbGFuY2VkKCkpO1xuXHRcdHRzdC5kZWxldGUoa2V5c1swXSk7XG5cdFx0YXNzZXJ0Lm9rKHRzdC5faXNCYWxhbmNlZCgpKTtcblx0fSk7XG5cblx0dGVzdCgnVGVybmFyeVNlYXJjaFRyZWU6IENhbm5vdCByZWFkIHByb3BlcnR5IFxcJzFcXCcgb2YgdW5kZWZpbmVkICMxMzgyODQgKHNpbXBsZSknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBrZXlzID0gWydDJywgJ0EnLCAnRCcsICdCJyxdO1xuXHRcdGNvbnN0IHRzdCA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclN0cmluZ3M8Ym9vbGVhbj4oKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Yga2V5cykge1xuXHRcdFx0dHN0LnNldChpdGVtLCB0cnVlKTtcblx0XHR9XG5cdFx0YXNzZXJ0VHN0RGZzKHRzdCwgWydBJywgdHJ1ZV0sIFsnQicsIHRydWVdLCBbJ0MnLCB0cnVlXSwgWydEJywgdHJ1ZV0pO1xuXG5cdFx0dHN0LmRlbGV0ZShrZXlzWzBdKTtcblx0XHRhc3NlcnRUc3REZnModHN0LCBbJ0EnLCB0cnVlXSwgWydCJywgdHJ1ZV0sIFsnRCcsIHRydWVdKTtcblxuXHRcdHtcblx0XHRcdGNvbnN0IHRzdCA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclN0cmluZ3M8Ym9vbGVhbj4oKTtcblx0XHRcdHRzdC5zZXQoJ0MnLCB0cnVlKTtcblx0XHRcdHRzdC5zZXQoJ0EnLCB0cnVlKTtcblx0XHRcdHRzdC5zZXQoJ0InLCB0cnVlKTtcblx0XHRcdGFzc2VydFRzdERmcyh0c3QsIFsnQScsIHRydWVdLCBbJ0InLCB0cnVlXSwgWydDJywgdHJ1ZV0pO1xuXHRcdH1cblxuXHR9KTtcblxuXHR0ZXN0KCdUZXJuYXJ5U2VhcmNoVHJlZTogQ2Fubm90IHJlYWQgcHJvcGVydHkgXFwnMVxcJyBvZiB1bmRlZmluZWQgIzEzODI4NCAocmFuZG9tKScsIGZ1bmN0aW9uICgpIHtcblx0XHRmb3IgKGxldCByb3VuZCA9IDEwOyByb3VuZCA+PSAwOyByb3VuZC0tKSB7XG5cdFx0XHRjb25zdCBrZXlzOiBVUklbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDA7IGkrKykge1xuXHRcdFx0XHRrZXlzLnB1c2goVVJJLmZyb20oeyBzY2hlbWU6ICdmYWtlLWZzJywgcGF0aDogcmFuZG9tUGF0aCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgMTApIH0pKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRzdCA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclVyaXM8Ym9vbGVhbj4oKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGtleXMpIHtcblx0XHRcdFx0XHR0c3Quc2V0KGl0ZW0sIHRydWUpO1xuXHRcdFx0XHRcdGFzc2VydC5vayh0c3QuX2lzQmFsYW5jZWQoKSwgYFNFVCR7aXRlbX18JHtrZXlzLm1hcChTdHJpbmcpLmpvaW4oKX1gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBrZXlzKSB7XG5cdFx0XHRcdFx0dHN0LmRlbGV0ZShpdGVtKTtcblx0XHRcdFx0XHRhc3NlcnQub2sodHN0Ll9pc0JhbGFuY2VkKCksIGBERUwke2l0ZW19fCR7a2V5cy5tYXAoU3RyaW5nKS5qb2luKCl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRhc3NlcnQub2soZmFsc2UsIGBGQUlMRUQgd2l0aCBrZXlzOiAke2tleXMubWFwKFN0cmluZykuam9pbigpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIyNzE0NycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHJhdyA9IGBmYWtlLWZzOkNBT25SdlV1eE8sZmFrZS1mczoxcWNiZnE1NHJnLGZha2UtZnM6VXREc3RZVVE1NixmYWtlLWZzOmQ1a3RxRHlzbGwsZmFrZS1mczp3NU5TQUtBNENoLGZha2UtZnM6UWNJSUlZNldIWCxmYWtlLWZzOldDZWRRdTlPZ2QsZmFrZS1mczpjS1VDNUx1bkJyLGZha2UtZnM6WHJJSVlqSTNIQixmYWtlLWZzOnhnVGtvbmVGekYsZmFrZS1mczpRWWtDVngybllDLGZha2UtZnM6ZVBySURFS0VwSixmYWtlLWZzOm5yT1BZQ1c4MWEsZmFrZS1mczpNUWJrRkxjRHNBLGZha2UtZnM6d1hHOFlpT3JCSSxmYWtlLWZzOjR0SFRXaTI0MEQsZmFrZS1mczo1dVFXamdaR0dKLGZha2UtZnM6ZmFtUDZwWlh5eCxmYWtlLWZzOmFCOXNVaHdQMUosZmFrZS1mczpEbFMwQ3NzeWhHLGZha2UtZnM6OXZLMmszckwyVixmYWtlLWZzOmlxV2V1N3pGNnQsZmFrZS1mczo4dkM2YlFYMldILGZha2UtZnM6bkZJTFhNUVRSZyxmYWtlLWZzOm1paVY3MmFhakUsZmFrZS1mczo5VlJicXZhdzBxLGZha2UtZnM6V25FSFMxYXJmWixmYWtlLWZzOkZjbzc1UEo1cE0sZmFrZS1mczo2Q3NFcG9aN1ZXLGZha2UtZnM6QjJQckN0RHBXdSxmYWtlLWZzOnk4SGk5NE9la2csZmFrZS1mczp3eUVqUE5hNWxvLGZha2UtZnM6encxTGp2MGVyYyxmYWtlLWZzOnk0S1dQVU9NeDAsZmFrZS1mczoxYmFzclBUbFRwLGZha2UtZnM6NWlFcnI0WU0zNCxmYWtlLWZzOlEyVFFhdWpoOFEsZmFrZS1mczpReGNZek5OeFp3LGZha2UtZnM6M1FVREhqVTU1YSxmYWtlLWZzOjIzeW1mOWdnTVYsZmFrZS1mczpxUWh1S0ZkeTI5LGZha2UtZnM6SnV3bXhBMzNvSixmYWtlLWZzOk5RZVV5Zk1OVW8sZmFrZS1mczoyVm8zZVIxanhNLGZha2UtZnM6TnpVWFFpZHdlbCxmYWtlLWZzOmFFU1lLR1B4SXgsZmFrZS1mczpteExkZUphcnROLGZha2UtZnM6UGhTZDJ4THdWZSxmYWtlLWZzOjlubVdqVVVNUnosZmFrZS1mczpXYzZhNFJzR2huLGZha2UtZnM6NWEwQWxGSEFMUSxmYWtlLWZzOlE5M2puTlpCeEosZmFrZS1mczo0Q3VWa2JmUFNHLGZha2UtZnM6bWRGbEo3V1F2YSxmYWtlLWZzOmZnVnNhUm0xS0csZmFrZS1mczpQN1VYV2lSSllqLGZha2UtZnM6cTZuejVROUJFVyxmYWtlLWZzOjFVWm1Ha3ZOVG4sZmFrZS1mczpBS1k4Y25VUUZsLGZha2UtZnM6UmV6WXVQVTdGRCxmYWtlLWZzOjV6YVljNzJCaXQsZmFrZS1mczp5aDhGVHhGZlFxLGZha2UtZnM6YXlOUGdFdWMycSxmYWtlLWZzOkVkT2IyN2NSaEYsZmFrZS1mczpoNGMydU55STRsLGZha2UtZnM6Qmh6T0xOTDRKTyxmYWtlLWZzOkhWUFRkQU1XcFMsZmFrZS1mczo3SzdJbGFjYVplLGZha2UtZnM6aVVLSm9uQzVlcSxmYWtlLWZzOlk5RTNOWDNlSkQsZmFrZS1mczo2Nmg4MHVLMzJJLGZha2UtZnM6Z0ZYcHJ5MVkwOSxmYWtlLWZzOnFPcXZ2WFBjdTQsZmFrZS1mczpVYmJMbjJORlNKLGZha2UtZnM6VHpKMDdIc0FHeixmYWtlLWZzOm5Rbmdtdmd4NG0sZmFrZS1mczo2YlpRQ1I4ZXBiLGZha2UtZnM6eGIzU0pLWDFiaSxmYWtlLWZzOkdGM0RQSzR6RGosZmFrZS1mczpIbXhnQXFFZWd0LGZha2UtZnM6eVQyT0FNUVlhbCxmYWtlLWZzOk1pVlg0VllYSGssZmFrZS1mczpRTWJzVWJqSlRJLGZha2UtZnM6S3pBYkROc21QYyxmYWtlLWZzOm02Q0dPd09jZFQsZmFrZS1mczowY3lIeDl6c0EzLGZha2UtZnM6U0l3aldmRkxTWSxmYWtlLWZzOnVaU0RYQ0VxTFksZmFrZS1mczpIdW9UTDNuSzdrLGZha2UtZnM6b3lvZWpZRTBDSSxmYWtlLWZzOjU2V0xoaUN4YnosZmFrZS1mczpTcVlPaTB6NXNNLGZha2UtZnM6TFpxM2VpMjhFeixmYWtlLWZzOnBUYzRwQ3R3azgsZmFrZS1mczpBQUpTRmYwUkhTLGZha2UtZnM6dXA2RUhrRWJPOSxmYWtlLWZzOkdCMVBlc2RueGQsZmFrZS1mczpPeXZxNFo5NlM0LGZha2UtZnM6cllYcmhrbGdmNixmYWtlLWZzOmcxSGRVa1F6aUhgO1xuXHRcdGNvbnN0IGtleXM6IFVSSVtdID0gcmF3LnNwbGl0KCcsJykubWFwKHZhbHVlID0+IFVSSS5wYXJzZSh2YWx1ZSwgdHJ1ZSkpO1xuXG5cblx0XHRjb25zdCB0c3QgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JVcmlzPGJvb2xlYW4+KCk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGtleXMpIHtcblx0XHRcdHRzdC5zZXQoaXRlbSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQub2sodHN0Ll9pc0JhbGFuY2VkKCksIGBTRVQke2l0ZW19fCR7a2V5cy5tYXAoU3RyaW5nKS5qb2luKCl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGVuZ3RoTm93ID0gQXJyYXkuZnJvbSh0c3QpLmxlbmd0aDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVuZ3RoTm93LCBrZXlzLmxlbmd0aCk7XG5cblx0XHRjb25zdCBrZXlzMiA9IGtleXMuc2xpY2UoMCk7XG5cblx0XHRmb3IgKGNvbnN0IFtpbmRleCwgaXRlbV0gb2Yga2V5cy5lbnRyaWVzKCkpIHtcblx0XHRcdHRzdC5kZWxldGUoaXRlbSk7XG5cdFx0XHRhc3NlcnQub2sodHN0Ll9pc0JhbGFuY2VkKCksIGBERUwke2l0ZW19fCR7a2V5cy5tYXAoU3RyaW5nKS5qb2luKCl9YCk7XG5cblx0XHRcdGNvbnN0IGlkeCA9IGtleXMyLmluZGV4T2YoaXRlbSk7XG5cdFx0XHRhc3NlcnQub2soaWR4ID49IDApO1xuXHRcdFx0a2V5czIuc3BsaWNlKGlkeCwgMSk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbEtleXMgPSBBcnJheS5mcm9tKHRzdCkubWFwKHZhbHVlID0+IHZhbHVlWzBdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRhY3R1YWxLZXlzLmxlbmd0aCxcblx0XHRcdFx0a2V5czIubGVuZ3RoLFxuXHRcdFx0XHRgRkFJTEVEIHdpdGggJHtpbmRleH0gLT4gJHtpdGVtLnRvU3RyaW5nKCl9XFxuV0FOVEVEOiR7a2V5czIubWFwKFN0cmluZykuc29ydCgpLmpvaW4oKX1cXG5BQ1RVQUw6JHthY3R1YWxLZXlzLm1hcChTdHJpbmcpLnNvcnQoKS5qb2luKCl9YFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQXJyYXkuZnJvbSh0c3QpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm5hcnlTZWFyY2hUcmVlOiBDYW5ub3QgcmVhZCBwcm9wZXJ0aWVzIG9mIHVuZGVmaW5lZCAocmVhZGluZyBcXCdsZW5ndGhcXCcpOiAjMTYxNjE4IChzaW1wbGUpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJhdyA9ICdjb25maWcuZGVidWcudG9vbEJhckxvY2F0aW9uLGZsb2F0aW5nLGNvbmZpZy5lZGl0b3IucmVuZGVyQ29udHJvbENoYXJhY3RlcnMsdHJ1ZSxjb25maWcuZWRpdG9yLnJlbmRlcldoaXRlc3BhY2Usc2VsZWN0aW9uLGNvbmZpZy5maWxlcy5hdXRvU2F2ZSxvZmYsY29uZmlnLmdpdC5lbmFibGVkLHRydWUsY29uZmlnLm5vdGVib29rLmdsb2JhbFRvb2xiYXIsdHJ1ZSxjb25maWcudGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmVuYWJsZWQsdHJ1ZSxjb25maWcudGVybWluYWwuaW50ZWdyYXRlZC50YWJzLnNob3dBY3Rpb25zLHNpbmdsZVRlcm1pbmFsT3JOYXJyb3csY29uZmlnLnRlcm1pbmFsLmludGVncmF0ZWQudGFicy5zaG93QWN0aXZlVGVybWluYWwsc2luZ2xlVGVybWluYWxPck5hcnJvdyxjb25maWcud29ya2JlbmNoLmFjdGl2aXR5QmFyLnZpc2libGUsdHJ1ZSxjb25maWcud29ya2JlbmNoLmV4cGVyaW1lbnRhbC5zZXR0aW5nc1Byb2ZpbGVzLmVuYWJsZWQsdHJ1ZSxjb25maWcud29ya2JlbmNoLmxheW91dENvbnRyb2wudHlwZSxib3RoLGNvbmZpZy53b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbixsZWZ0LGNvbmZpZy53b3JrYmVuY2guc3RhdHVzQmFyLnZpc2libGUsdHJ1ZSc7XG5cdFx0Y29uc3QgYXJyYXkgPSByYXcuc3BsaXQoJywnKTtcblx0XHRjb25zdCB0dXBsZXM6IFtzdHJpbmcsIHN0cmluZ11bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpICs9IDIpIHtcblx0XHRcdHR1cGxlcy5wdXNoKFthcnJheVtpXSwgYXJyYXlbaSArIDFdXSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFwID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yQ29uZmlnS2V5czxzdHJpbmc+KCk7XG5cdFx0bWFwLmZpbGwodHVwbGVzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChbLi4ubWFwXS5qb2luKCksIHJhdyk7XG5cdFx0YXNzZXJ0Lm9rKG1hcC5oYXMoJ2NvbmZpZy5lZGl0b3IucmVuZGVyV2hpdGVzcGFjZScpKTtcblxuXHRcdGNvbnN0IGxlbiA9IFsuLi5tYXBdLmxlbmd0aDtcblx0XHRtYXAuZGVsZXRlKCdjb25maWcuZWRpdG9yLnJlbmRlcldoaXRlc3BhY2UnKTtcblx0XHRhc3NlcnQub2sobWFwLl9pc0JhbGFuY2VkKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChbLi4ubWFwXS5sZW5ndGgsIGxlbiAtIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXJuYXJ5U2VhcmNoVHJlZTogQ2Fubm90IHJlYWQgcHJvcGVydGllcyBvZiB1bmRlZmluZWQgKHJlYWRpbmcgXFwnbGVuZ3RoXFwnKTogIzE2MTYxOCAocmFuZG9tKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByYXcgPSAnY29uZmlnLmRlYnVnLnRvb2xCYXJMb2NhdGlvbixmbG9hdGluZyxjb25maWcuZWRpdG9yLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzLHRydWUsY29uZmlnLmVkaXRvci5yZW5kZXJXaGl0ZXNwYWNlLHNlbGVjdGlvbixjb25maWcuZmlsZXMuYXV0b1NhdmUsb2ZmLGNvbmZpZy5naXQuZW5hYmxlZCx0cnVlLGNvbmZpZy5ub3RlYm9vay5nbG9iYWxUb29sYmFyLHRydWUsY29uZmlnLnRlcm1pbmFsLmludGVncmF0ZWQudGFicy5lbmFibGVkLHRydWUsY29uZmlnLnRlcm1pbmFsLmludGVncmF0ZWQudGFicy5zaG93QWN0aW9ucyxzaW5nbGVUZXJtaW5hbE9yTmFycm93LGNvbmZpZy50ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuc2hvd0FjdGl2ZVRlcm1pbmFsLHNpbmdsZVRlcm1pbmFsT3JOYXJyb3csY29uZmlnLndvcmtiZW5jaC5hY3Rpdml0eUJhci52aXNpYmxlLHRydWUsY29uZmlnLndvcmtiZW5jaC5leHBlcmltZW50YWwuc2V0dGluZ3NQcm9maWxlcy5lbmFibGVkLHRydWUsY29uZmlnLndvcmtiZW5jaC5sYXlvdXRDb250cm9sLnR5cGUsYm90aCxjb25maWcud29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24sbGVmdCxjb25maWcud29ya2JlbmNoLnN0YXR1c0Jhci52aXNpYmxlLHRydWUnO1xuXHRcdGNvbnN0IGFycmF5ID0gcmF3LnNwbGl0KCcsJyk7XG5cdFx0Y29uc3QgdHVwbGVzOiBbc3RyaW5nLCBzdHJpbmddW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSArPSAyKSB7XG5cdFx0XHR0dXBsZXMucHVzaChbYXJyYXlbaV0sIGFycmF5W2kgKyAxXV0pO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IHJvdW5kID0gMTAwOyByb3VuZCA+PSAwOyByb3VuZC0tKSB7XG5cdFx0XHRzaHVmZmxlKHR1cGxlcyk7XG5cdFx0XHRjb25zdCBtYXAgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JDb25maWdLZXlzPHN0cmluZz4oKTtcblx0XHRcdG1hcC5maWxsKHR1cGxlcyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChbLi4ubWFwXS5qb2luKCksIHJhdyk7XG5cdFx0XHRhc3NlcnQub2sobWFwLmhhcygnY29uZmlnLmVkaXRvci5yZW5kZXJXaGl0ZXNwYWNlJykpO1xuXG5cdFx0XHRjb25zdCBsZW4gPSBbLi4ubWFwXS5sZW5ndGg7XG5cdFx0XHRtYXAuZGVsZXRlKCdjb25maWcuZWRpdG9yLnJlbmRlcldoaXRlc3BhY2UnKTtcblx0XHRcdGFzc2VydC5vayhtYXAuX2lzQmFsYW5jZWQoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoWy4uLm1hcF0ubGVuZ3RoLCBsZW4gLSAxKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm5hcnlTZWFyY2hUcmVlIChQYXRoU2VnbWVudHMpIC0gbG9va3VwJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbWFwID0gbmV3IFRlcm5hcnlTZWFyY2hUcmVlPHN0cmluZywgbnVtYmVyPihuZXcgUGF0aEl0ZXJhdG9yKCkpO1xuXHRcdG1hcC5zZXQoJy91c2VyL2Zvby9iYXInLCAxKTtcblx0XHRtYXAuc2V0KCcvdXNlci9mb28nLCAyKTtcblx0XHRtYXAuc2V0KCcvdXNlci9mb28vZmxpcC9mbG9wJywgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnL2ZvbycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCcvdXNlcicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCcvdXNlci9mb28nKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJy91c2VyL2Zvby9iYXInKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJy91c2VyL2Zvby9iYXIvYm9vJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm5hcnlTZWFyY2hUcmVlIChQYXRoU2VnbWVudHMpIC0gc3VwZXJzdHInLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtYXAgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBudW1iZXI+KG5ldyBQYXRoSXRlcmF0b3IoKSk7XG5cdFx0bWFwLnNldCgnL3VzZXIvZm9vL2JhcicsIDEpO1xuXHRcdG1hcC5zZXQoJy91c2VyL2ZvbycsIDIpO1xuXHRcdG1hcC5zZXQoJy91c2VyL2Zvby9mbGlwL2Zsb3AnLCAzKTtcblx0XHRtYXAuc2V0KCcvdXNyL2ZvbycsIDQpO1xuXG5cdFx0bGV0IGl0ZW06IEl0ZXJhdG9yUmVzdWx0PFtzdHJpbmcsIG51bWJlcl0+O1xuXHRcdGxldCBpdGVyID0gbWFwLmZpbmRTdXBlcnN0cignL3VzZXInKTtcblxuXHRcdGl0ZW0gPSBpdGVyIS5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWVbMV0sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLmRvbmUsIGZhbHNlKTtcblx0XHRpdGVtID0gaXRlciEubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLnZhbHVlWzFdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5kb25lLCBmYWxzZSk7XG5cdFx0aXRlbSA9IGl0ZXIhLm5leHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS52YWx1ZVsxXSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0uZG9uZSwgZmFsc2UpO1xuXHRcdGl0ZW0gPSBpdGVyIS5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0uZG9uZSwgdHJ1ZSk7XG5cblx0XHRpdGVyID0gbWFwLmZpbmRTdXBlcnN0cignL3VzcicpO1xuXHRcdGl0ZW0gPSBpdGVyIS5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWVbMV0sIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLmRvbmUsIGZhbHNlKTtcblxuXHRcdGl0ZW0gPSBpdGVyIS5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0uZG9uZSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmZpbmRTdXBlcnN0cignL25vdCcpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZmluZFN1cGVyc3RyKCcvdXMnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmZpbmRTdXBlcnN0cignL3VzcnInKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmZpbmRTdXBlcnN0cignL3VzZXJyJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cblx0dGVzdCgnVGVybmFyeVNlYXJjaFRyZWUgKFBhdGhTZWdtZW50cykgLSBkZWxldGVfc3VwZXJzdHInLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtYXAgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWU8c3RyaW5nLCBudW1iZXI+KG5ldyBQYXRoSXRlcmF0b3IoKSk7XG5cdFx0bWFwLnNldCgnL3VzZXIvZm9vL2JhcicsIDEpO1xuXHRcdG1hcC5zZXQoJy91c2VyL2ZvbycsIDIpO1xuXHRcdG1hcC5zZXQoJy91c2VyL2Zvby9mbGlwL2Zsb3AnLCAzKTtcblx0XHRtYXAuc2V0KCcvdXNyL2ZvbycsIDQpO1xuXG5cdFx0YXNzZXJ0VHN0RGZzKG1hcCxcblx0XHRcdFsnL3VzZXIvZm9vJywgMl0sXG5cdFx0XHRbJy91c2VyL2Zvby9iYXInLCAxXSxcblx0XHRcdFsnL3VzZXIvZm9vL2ZsaXAvZmxvcCcsIDNdLFxuXHRcdFx0WycvdXNyL2ZvbycsIDRdLFxuXHRcdCk7XG5cblx0XHQvLyBub3QgYSBzZWdtZW50XG5cdFx0bWFwLmRlbGV0ZVN1cGVyc3RyKCcvdXNlci9mbycpO1xuXHRcdGFzc2VydFRzdERmcyhtYXAsXG5cdFx0XHRbJy91c2VyL2ZvbycsIDJdLFxuXHRcdFx0WycvdXNlci9mb28vYmFyJywgMV0sXG5cdFx0XHRbJy91c2VyL2Zvby9mbGlwL2Zsb3AnLCAzXSxcblx0XHRcdFsnL3Vzci9mb28nLCA0XSxcblx0XHQpO1xuXG5cdFx0Ly8gZGVsZXRlIGEgc2VnbWVudFxuXHRcdG1hcC5zZXQoJy91c2VyL2Zvby9iYXInLCAxKTtcblx0XHRtYXAuc2V0KCcvdXNlci9mb28nLCAyKTtcblx0XHRtYXAuc2V0KCcvdXNlci9mb28vZmxpcC9mbG9wJywgMyk7XG5cdFx0bWFwLnNldCgnL3Vzci9mb28nLCA0KTtcblx0XHRtYXAuZGVsZXRlU3VwZXJzdHIoJy91c2VyL2ZvbycpO1xuXHRcdGFzc2VydFRzdERmcyhtYXAsXG5cdFx0XHRbJy91c2VyL2ZvbycsIDJdLFxuXHRcdFx0WycvdXNyL2ZvbycsIDRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm5hcnlTZWFyY2hUcmVlIChVUkkpIC0gYmFzaWNzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRyaWUgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWU8VVJJLCBudW1iZXI+KG5ldyBVcmlJdGVyYXRvcigoKSA9PiBmYWxzZSwgKCkgPT4gZmFsc2UpKTtcblxuXHRcdHRyaWUuc2V0KFVSSS5maWxlKCcvdXNlci9mb28vYmFyJyksIDEpO1xuXHRcdHRyaWUuc2V0KFVSSS5maWxlKCcvdXNlci9mb28nKSwgMik7XG5cdFx0dHJpZS5zZXQoVVJJLmZpbGUoJy91c2VyL2Zvby9mbGlwL2Zsb3AnKSwgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5nZXQoVVJJLmZpbGUoJy91c2VyL2Zvby9iYXInKSksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldChVUkkuZmlsZSgnL3VzZXIvZm9vJykpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5nZXQoVVJJLmZpbGUoJy91c2VyL2Zvby9mbGlwL2Zsb3AnKSksIDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cihVUkkuZmlsZSgnL3VzZXIvYmFyJykpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmZpbmRTdWJzdHIoVVJJLmZpbGUoJy91c2VyL2ZvbycpKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cihVUkkuZmlsZSgnL3VzZXIvZm9vL2JhJykpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKFVSSS5maWxlKCcvdXNlci9mb28vZmFyL2JvbycpKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cihVUkkuZmlsZSgnL3VzZXIvZm9vL2JhcicpKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cihVUkkuZmlsZSgnL3VzZXIvZm9vL2Jhci9mYXIvYm9vJykpLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnVGVybmFyeVNlYXJjaFRyZWUgKFVSSSkgLSBxdWVyeSBwYXJhbWV0ZXJzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRyaWUgPSBuZXcgVGVybmFyeVNlYXJjaFRyZWU8VVJJLCBudW1iZXI+KG5ldyBVcmlJdGVyYXRvcigoKSA9PiBmYWxzZSwgKCkgPT4gdHJ1ZSkpO1xuXHRcdGNvbnN0IHJvb3QgPSBVUkkucGFyc2UoJ21lbWZzOi8/cGFyYW09MScpO1xuXHRcdHRyaWUuc2V0KHJvb3QsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZ2V0KFVSSS5wYXJzZSgnbWVtZnM6Lz9wYXJhbT0xJykpLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmZpbmRTdWJzdHIoVVJJLnBhcnNlKCdtZW1mczovP3BhcmFtPTEnKSksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmZpbmRTdWJzdHIoVVJJLnBhcnNlKCdtZW1mczovYWFhP3BhcmFtPTEnKSksIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXJuYXJ5U2VhcmNoVHJlZSAoVVJJKSAtIGxvb2t1cCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1hcCA9IG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIG51bWJlcj4obmV3IFVyaUl0ZXJhdG9yKCgpID0+IGZhbHNlLCAoKSA9PiBmYWxzZSkpO1xuXHRcdG1hcC5zZXQoVVJJLnBhcnNlKCdodHRwOi8vZm9vLmJhci91c2VyL2Zvby9iYXInKSwgMSk7XG5cdFx0bWFwLnNldChVUkkucGFyc2UoJ2h0dHA6Ly9mb28uYmFyL3VzZXIvZm9vP3F1ZXJ5JyksIDIpO1xuXHRcdG1hcC5zZXQoVVJJLnBhcnNlKCdodHRwOi8vZm9vLmJhci91c2VyL2Zvbz9RVUVSWScpLCAzKTtcblx0XHRtYXAuc2V0KFVSSS5wYXJzZSgnaHR0cDovL2Zvby5iYXIvdXNlci9mb28vZmxpcC9mbG9wJyksIDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoVVJJLnBhcnNlKCdodHRwOi8vZm9vLmJhci9mb28nKSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoVVJJLnBhcnNlKCdodHRwOi8vZm9vLmJhci91c2VyJykpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KFVSSS5wYXJzZSgnaHR0cDovL2Zvby5iYXIvdXNlci9mb28vYmFyJykpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChVUkkucGFyc2UoJ2h0dHA6Ly9mb28uYmFyL3VzZXIvZm9vP3F1ZXJ5JykpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChVUkkucGFyc2UoJ2h0dHA6Ly9mb28uYmFyL3VzZXIvZm9vP1F1ZXJ5JykpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KFVSSS5wYXJzZSgnaHR0cDovL2Zvby5iYXIvdXNlci9mb28/UVVFUlknKSksIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KFVSSS5wYXJzZSgnaHR0cDovL2Zvby5iYXIvdXNlci9mb28vYmFyL2JvbycpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnVGVybmFyeVNlYXJjaFRyZWUgKFVSSSkgLSBsb29rdXAsIGNhc2luZycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1hcCA9IG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIG51bWJlcj4obmV3IFVyaUl0ZXJhdG9yKHVyaSA9PiAvXmh0dHBzPyQvLnRlc3QodXJpLnNjaGVtZSksICgpID0+IGZhbHNlKSk7XG5cdFx0bWFwLnNldChVUkkucGFyc2UoJ2h0dHA6Ly9mb28uYmFyL3VzZXIvZm9vL2JhcicpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChVUkkucGFyc2UoJ2h0dHA6Ly9mb28uYmFyL1VTRVIvZm9vL2JhcicpKSwgMSk7XG5cblx0XHRtYXAuc2V0KFVSSS5wYXJzZSgnZm9vOi8vZm9vLmJhci91c2VyL2Zvby9iYXInKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoVVJJLnBhcnNlKCdmb286Ly9mb28uYmFyL1VTRVIvZm9vL2JhcicpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnVGVybmFyeVNlYXJjaFRyZWUgKFVSSSkgLSBzdXBlcnN0cicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1hcCA9IG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIG51bWJlcj4obmV3IFVyaUl0ZXJhdG9yKCgpID0+IGZhbHNlLCAoKSA9PiBmYWxzZSkpO1xuXHRcdG1hcC5zZXQoVVJJLmZpbGUoJy91c2VyL2Zvby9iYXInKSwgMSk7XG5cdFx0bWFwLnNldChVUkkuZmlsZSgnL3VzZXIvZm9vJyksIDIpO1xuXHRcdG1hcC5zZXQoVVJJLmZpbGUoJy91c2VyL2Zvby9mbGlwL2Zsb3AnKSwgMyk7XG5cdFx0bWFwLnNldChVUkkuZmlsZSgnL3Vzci9mb28nKSwgNCk7XG5cblx0XHRsZXQgaXRlbTogSXRlcmF0b3JSZXN1bHQ8W1VSSSwgbnVtYmVyXT47XG5cdFx0bGV0IGl0ZXIgPSBtYXAuZmluZFN1cGVyc3RyKFVSSS5maWxlKCcvdXNlcicpKSE7XG5cblx0XHRpdGVtID0gaXRlci5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWVbMV0sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLmRvbmUsIGZhbHNlKTtcblx0XHRpdGVtID0gaXRlci5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWVbMV0sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLmRvbmUsIGZhbHNlKTtcblx0XHRpdGVtID0gaXRlci5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWVbMV0sIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLmRvbmUsIGZhbHNlKTtcblx0XHRpdGVtID0gaXRlci5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0uZG9uZSwgdHJ1ZSk7XG5cblx0XHRpdGVyID0gbWFwLmZpbmRTdXBlcnN0cihVUkkuZmlsZSgnL3VzcicpKSE7XG5cdFx0aXRlbSA9IGl0ZXIubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLnZhbHVlWzFdLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5kb25lLCBmYWxzZSk7XG5cblx0XHRpdGVtID0gaXRlci5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0uZG9uZSwgdHJ1ZSk7XG5cblx0XHRpdGVyID0gbWFwLmZpbmRTdXBlcnN0cihVUkkuZmlsZSgnLycpKSE7XG5cdFx0aXRlbSA9IGl0ZXIubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLnZhbHVlWzFdLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5kb25lLCBmYWxzZSk7XG5cdFx0aXRlbSA9IGl0ZXIubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLnZhbHVlWzFdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5kb25lLCBmYWxzZSk7XG5cdFx0aXRlbSA9IGl0ZXIubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLnZhbHVlWzFdLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5kb25lLCBmYWxzZSk7XG5cdFx0aXRlbSA9IGl0ZXIubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLnZhbHVlWzFdLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5kb25lLCBmYWxzZSk7XG5cdFx0aXRlbSA9IGl0ZXIubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLnZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLmRvbmUsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5maW5kU3VwZXJzdHIoVVJJLmZpbGUoJy9ub3QnKSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5maW5kU3VwZXJzdHIoVVJJLmZpbGUoJy91cycpKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmZpbmRTdXBlcnN0cihVUkkuZmlsZSgnL3VzcnInKSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5maW5kU3VwZXJzdHIoVVJJLmZpbGUoJy91c2VycicpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnVGVybmFyeVNlYXJjaFRyZWUgKENvbmZpZ0tleVNlZ21lbnRzKSAtIGJhc2ljcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0cmllID0gbmV3IFRlcm5hcnlTZWFyY2hUcmVlPHN0cmluZywgbnVtYmVyPihuZXcgQ29uZmlnS2V5c0l0ZXJhdG9yKCkpO1xuXG5cdFx0dHJpZS5zZXQoJ2NvbmZpZy5mb28uYmFyJywgMSk7XG5cdFx0dHJpZS5zZXQoJ2NvbmZpZy5mb28nLCAyKTtcblx0XHR0cmllLnNldCgnY29uZmlnLmZvby5mbGlwLmZsb3AnLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnY29uZmlnLmZvby5iYXInKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZ2V0KCdjb25maWcuZm9vJyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmdldCgnY29uZmlnLmZvby5mbGlwLmZsb3AnKSwgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKCdjb25maWcuYmFyJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWUuZmluZFN1YnN0cignY29uZmlnLmZvbycpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKCdjb25maWcuZm9vLmJhJyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmllLmZpbmRTdWJzdHIoJ2NvbmZpZy5mb28uZmFyLmJvbycpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKCdjb25maWcuZm9vLmJhcicpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZS5maW5kU3Vic3RyKCdjb25maWcuZm9vLmJhci5mYXIuYm9vJyksIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXJuYXJ5U2VhcmNoVHJlZSAoQ29uZmlnS2V5U2VnbWVudHMpIC0gbG9va3VwJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbWFwID0gbmV3IFRlcm5hcnlTZWFyY2hUcmVlPHN0cmluZywgbnVtYmVyPihuZXcgQ29uZmlnS2V5c0l0ZXJhdG9yKCkpO1xuXHRcdG1hcC5zZXQoJ2NvbmZpZy5mb28uYmFyJywgMSk7XG5cdFx0bWFwLnNldCgnY29uZmlnLmZvbycsIDIpO1xuXHRcdG1hcC5zZXQoJ2NvbmZpZy5mb28uZmxpcC5mbG9wJywgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnZm9vJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ2NvbmZpZycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCdjb25maWcuZm9vJyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCdjb25maWcuZm9vLmJhcicpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnY29uZmlnLmZvby5iYXIuYm9vJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm5hcnlTZWFyY2hUcmVlIChDb25maWdLZXlTZWdtZW50cykgLSBzdXBlcnN0cicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1hcCA9IG5ldyBUZXJuYXJ5U2VhcmNoVHJlZTxzdHJpbmcsIG51bWJlcj4obmV3IENvbmZpZ0tleXNJdGVyYXRvcigpKTtcblx0XHRtYXAuc2V0KCdjb25maWcuZm9vLmJhcicsIDEpO1xuXHRcdG1hcC5zZXQoJ2NvbmZpZy5mb28nLCAyKTtcblx0XHRtYXAuc2V0KCdjb25maWcuZm9vLmZsaXAuZmxvcCcsIDMpO1xuXHRcdG1hcC5zZXQoJ2JvbycsIDQpO1xuXG5cdFx0bGV0IGl0ZW06IEl0ZXJhdG9yUmVzdWx0PFtzdHJpbmcsIG51bWJlcl0+O1xuXHRcdGNvbnN0IGl0ZXIgPSBtYXAuZmluZFN1cGVyc3RyKCdjb25maWcnKTtcblxuXHRcdGl0ZW0gPSBpdGVyIS5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWVbMV0sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLmRvbmUsIGZhbHNlKTtcblx0XHRpdGVtID0gaXRlciEubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtLnZhbHVlWzFdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5kb25lLCBmYWxzZSk7XG5cdFx0aXRlbSA9IGl0ZXIhLm5leHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS52YWx1ZVsxXSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0uZG9uZSwgZmFsc2UpO1xuXHRcdGl0ZW0gPSBpdGVyIS5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0uZG9uZSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmZpbmRTdXBlcnN0cignZm9vJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5maW5kU3VwZXJzdHIoJ2NvbmZpZy5mb28ubm8nKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmZpbmRTdXBlcnN0cignY29uZmlnLmZvb3AnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdUZXJuYXJ5U2VhcmNoVHJlZSAoQ29uZmlnS2V5U2VnbWVudHMpIC0gZGVsZXRlX3N1cGVyc3RyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbWFwID0gbmV3IFRlcm5hcnlTZWFyY2hUcmVlPHN0cmluZywgbnVtYmVyPihuZXcgQ29uZmlnS2V5c0l0ZXJhdG9yKCkpO1xuXHRcdG1hcC5zZXQoJ2NvbmZpZy5mb28uYmFyJywgMSk7XG5cdFx0bWFwLnNldCgnY29uZmlnLmZvbycsIDIpO1xuXHRcdG1hcC5zZXQoJ2NvbmZpZy5mb28uZmxpcC5mbG9wJywgMyk7XG5cdFx0bWFwLnNldCgnYm9vJywgNCk7XG5cblx0XHRhc3NlcnRUc3REZnMobWFwLFxuXHRcdFx0Wydib28nLCA0XSxcblx0XHRcdFsnY29uZmlnLmZvbycsIDJdLFxuXHRcdFx0Wydjb25maWcuZm9vLmJhcicsIDFdLFxuXHRcdFx0Wydjb25maWcuZm9vLmZsaXAuZmxvcCcsIDNdLFxuXHRcdCk7XG5cblx0XHQvLyBub3QgYSBzZWdtZW50XG5cdFx0bWFwLmRlbGV0ZVN1cGVyc3RyKCdjb25maWcuZm8nKTtcblx0XHRhc3NlcnRUc3REZnMobWFwLFxuXHRcdFx0Wydib28nLCA0XSxcblx0XHRcdFsnY29uZmlnLmZvbycsIDJdLFxuXHRcdFx0Wydjb25maWcuZm9vLmJhcicsIDFdLFxuXHRcdFx0Wydjb25maWcuZm9vLmZsaXAuZmxvcCcsIDNdLFxuXHRcdCk7XG5cblx0XHQvLyBkZWxldGUgYSBzZWdtZW50XG5cdFx0bWFwLnNldCgnY29uZmlnLmZvby5iYXInLCAxKTtcblx0XHRtYXAuc2V0KCdjb25maWcuZm9vJywgMik7XG5cdFx0bWFwLnNldCgnY29uZmlnLmZvby5mbGlwLmZsb3AnLCAzKTtcblx0XHRtYXAuc2V0KCdjb25maWcuYm9vJywgNCk7XG5cdFx0bWFwLmRlbGV0ZVN1cGVyc3RyKCdjb25maWcuZm9vJyk7XG5cdFx0YXNzZXJ0VHN0RGZzKG1hcCxcblx0XHRcdFsnYm9vJywgNF0sXG5cdFx0XHRbJ2NvbmZpZy5mb28nLCAyXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdUU1QsIGZpbGwnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdHN0ID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yU3RyaW5ncygpO1xuXG5cdFx0Y29uc3Qga2V5cyA9IFsnZm9vJywgJ2JhcicsICdiYW5nJywgJ2JhenonXTtcblx0XHRPYmplY3QuZnJlZXplKGtleXMpO1xuXHRcdHRzdC5maWxsKHRydWUsIGtleXMpO1xuXG5cdFx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdFx0YXNzZXJ0Lm9rKHRzdC5nZXQoa2V5KSwga2V5KTtcblx0XHR9XG5cdH0pO1xufSk7XG5cblxuc3VpdGUuc2tpcCgnVFNULCBwZXJmJywgZnVuY3Rpb24gKCkge1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVJhbmRvbVVyaXMobjogbnVtYmVyKTogVVJJW10ge1xuXHRcdGNvbnN0IHVyaXM6IFVSSVtdID0gW107XG5cdFx0ZnVuY3Rpb24gcmFuZG9tV29yZCgpOiBzdHJpbmcge1xuXHRcdFx0bGV0IHJlc3VsdCA9ICcnO1xuXHRcdFx0Y29uc3QgbGVuZ3RoID0gNCArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDQpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0XHRyZXN1bHQgKz0gKE1hdGgucmFuZG9tKCkgKiAyNiArIDY1KS50b1N0cmluZygzNik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIGdlbmVyYXRlIDEwMDAwIHJhbmRvbSB3b3Jkc1xuXHRcdGNvbnN0IHdvcmRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwMDA7IGkrKykge1xuXHRcdFx0d29yZHMucHVzaChyYW5kb21Xb3JkKCkpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cblx0XHRcdGxldCBsZW4gPSA0ICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogNCk7XG5cblx0XHRcdGNvbnN0IHNlZ21lbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yICg7IGxlbiA+PSAwOyBsZW4tLSkge1xuXHRcdFx0XHRzZWdtZW50cy5wdXNoKHdvcmRzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHdvcmRzLmxlbmd0aCldKTtcblx0XHRcdH1cblxuXHRcdFx0dXJpcy5wdXNoKFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6IHNlZ21lbnRzLmpvaW4oJy8nKSB9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVyaXM7XG5cdH1cblxuXHRsZXQgdHJlZTogVGVybmFyeVNlYXJjaFRyZWU8VVJJLCBib29sZWFuPjtcblx0bGV0IHNhbXBsZVVyaXM6IFVSSVtdID0gW107XG5cdGxldCBjYW5kaWRhdGVzOiBVUklbXSA9IFtdO1xuXG5cdHN1aXRlU2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGxlbiA9IDUwXzAwMDtcblx0XHRzYW1wbGVVcmlzID0gY3JlYXRlUmFuZG9tVXJpcyhsZW4pO1xuXHRcdGNhbmRpZGF0ZXMgPSBbLi4uc2FtcGxlVXJpcy5zbGljZSgwLCBsZW4gLyAyKSwgLi4uY3JlYXRlUmFuZG9tVXJpcyhsZW4gLyAyKV07XG5cdFx0c2h1ZmZsZShjYW5kaWRhdGVzKTtcblx0fSk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHRyZWUgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JVcmlzKCk7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2Ygc2FtcGxlVXJpcykge1xuXHRcdFx0dHJlZS5zZXQodXJpLCB0cnVlKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbnN0IF9wcm9maWxlID0gZmFsc2U7XG5cblx0ZnVuY3Rpb24gcGVyZlRlc3QobmFtZTogc3RyaW5nLCBjYWxsYmFjazogRnVuY3Rpb24pIHtcblx0XHR0ZXN0KG5hbWUsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmIChfcHJvZmlsZSkgeyBjb25zb2xlLnByb2ZpbGUobmFtZSk7IH1cblx0XHRcdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdFx0Y2FsbGJhY2soKTtcblx0XHRcdGNvbnNvbGUubG9nKG5hbWUsIHN3LmVsYXBzZWQoKSk7XG5cdFx0XHRpZiAoX3Byb2ZpbGUpIHsgY29uc29sZS5wcm9maWxlRW5kKCk7IH1cblx0XHR9KTtcblx0fVxuXG5cdHBlcmZUZXN0KCdUU1QsIGNsZWFyJywgZnVuY3Rpb24gKCkge1xuXHRcdHRyZWUuY2xlYXIoKTtcblx0fSk7XG5cblx0cGVyZlRlc3QoJ1RTVCwgaW5zZXJ0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGluc2VydFRyZWUgPSBUZXJuYXJ5U2VhcmNoVHJlZS5mb3JVcmlzKCk7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2Ygc2FtcGxlVXJpcykge1xuXHRcdFx0aW5zZXJ0VHJlZS5zZXQodXJpLCB0cnVlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHBlcmZUZXN0KCdUU1QsIGxvb2t1cCcsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgbWF0Y2ggPSAwO1xuXHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcblx0XHRcdGlmICh0cmVlLmhhcyhjYW5kaWRhdGUpKSB7XG5cdFx0XHRcdG1hdGNoICs9IDE7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaCwgc2FtcGxlVXJpcy5sZW5ndGggLyAyKTtcblx0fSk7XG5cblx0cGVyZlRlc3QoJ1RTVCwgc3Vic3RyJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBtYXRjaCA9IDA7XG5cdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuXHRcdFx0aWYgKHRyZWUuZmluZFN1YnN0cihjYW5kaWRhdGUpKSB7XG5cdFx0XHRcdG1hdGNoICs9IDE7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaCwgc2FtcGxlVXJpcy5sZW5ndGggLyAyKTtcblx0fSk7XG5cblx0cGVyZlRlc3QoJ1RTVCwgc3VwZXJzdHInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuXHRcdFx0dHJlZS5maW5kU3VwZXJzdHIoY2FuZGlkYXRlKTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQW9CLGNBQWMsZ0JBQWdCLG1CQUFtQixtQkFBbUI7QUFDakcsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sdUJBQXVCLE1BQU07QUFFbEMsMENBQXdDO0FBRXhDLE9BQUssZ0JBQWdCLE1BQU07QUFDMUIsVUFBTSxPQUFPLElBQUksYUFBYTtBQUM5QixTQUFLLE1BQU0sMEJBQTBCO0FBRXJDLFdBQU8sWUFBWSxLQUFLLE1BQU0sR0FBRyxPQUFPO0FBQ3hDLFdBQU8sWUFBWSxLQUFLLFFBQVEsR0FBRyxJQUFJO0FBQ3ZDLFdBQU8sWUFBWSxLQUFLLElBQUksT0FBTyxHQUFHLENBQUM7QUFDdkMsV0FBTyxHQUFHLEtBQUssSUFBSSxHQUFHLElBQUksQ0FBQztBQUMzQixXQUFPLEdBQUcsS0FBSyxJQUFJLE9BQU8sSUFBSSxDQUFDO0FBQy9CLFdBQU8sR0FBRyxLQUFLLElBQUks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
