import assert from "assert";
import { WordCharacterClassifier } from "../../../../common/core/wordCharacterClassifier.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { DefaultEndOfLine, SearchData } from "../../../../common/model.js";
import { PieceTreeTextBufferBuilder } from "../../../../common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js";
import { NodeColor, SENTINEL } from "../../../../common/model/pieceTreeTextBuffer/rbTreeBase.js";
import { createTextModel } from "../../testTextModel.js";
import { splitLines } from "../../../../../base/common/strings.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n";
function randomChar() {
  return alphabet[randomInt(alphabet.length)];
}
function randomInt(bound) {
  return Math.floor(Math.random() * bound);
}
function randomStr(len) {
  if (len === null) {
    len = 10;
  }
  return (function() {
    let j, ref;
    const results = [];
    for (j = 1, ref = len; 1 <= ref ? j < ref : j > ref; 1 <= ref ? j++ : j--) {
      results.push(randomChar());
    }
    return results;
  })().join("");
}
function trimLineFeed(text) {
  if (text.length === 0) {
    return text;
  }
  if (text.length === 1) {
    if (text.charCodeAt(text.length - 1) === 10 || text.charCodeAt(text.length - 1) === 13) {
      return "";
    }
    return text;
  }
  if (text.charCodeAt(text.length - 1) === 10) {
    if (text.charCodeAt(text.length - 2) === 13) {
      return text.slice(0, -2);
    }
    return text.slice(0, -1);
  }
  if (text.charCodeAt(text.length - 1) === 13) {
    return text.slice(0, -1);
  }
  return text;
}
function testLinesContent(str, pieceTable) {
  const lines = splitLines(str);
  assert.strictEqual(pieceTable.getLineCount(), lines.length);
  assert.strictEqual(pieceTable.getLinesRawContent(), str);
  for (let i = 0; i < lines.length; i++) {
    assert.strictEqual(pieceTable.getLineContent(i + 1), lines[i]);
    assert.strictEqual(
      trimLineFeed(
        pieceTable.getValueInRange(
          new Range(
            i + 1,
            1,
            i + 1,
            lines[i].length + (i === lines.length - 1 ? 1 : 2)
          )
        )
      ),
      lines[i]
    );
  }
}
function testLineStarts(str, pieceTable) {
  const lineStarts = [0];
  const _regex = new RegExp(/\r\n|\r|\n/g);
  _regex.lastIndex = 0;
  let prevMatchStartIndex = -1;
  let prevMatchLength = 0;
  let m;
  do {
    if (prevMatchStartIndex + prevMatchLength === str.length) {
      break;
    }
    m = _regex.exec(str);
    if (!m) {
      break;
    }
    const matchStartIndex = m.index;
    const matchLength = m[0].length;
    if (matchStartIndex === prevMatchStartIndex && matchLength === prevMatchLength) {
      break;
    }
    prevMatchStartIndex = matchStartIndex;
    prevMatchLength = matchLength;
    lineStarts.push(matchStartIndex + matchLength);
  } while (m);
  for (let i = 0; i < lineStarts.length; i++) {
    assert.deepStrictEqual(
      pieceTable.getPositionAt(lineStarts[i]),
      new Position(i + 1, 1)
    );
    assert.strictEqual(pieceTable.getOffsetAt(i + 1, 1), lineStarts[i]);
  }
  for (let i = 1; i < lineStarts.length; i++) {
    const pos = pieceTable.getPositionAt(lineStarts[i] - 1);
    assert.strictEqual(
      pieceTable.getOffsetAt(pos.lineNumber, pos.column),
      lineStarts[i] - 1
    );
  }
}
function createTextBuffer(val, normalizeEOL = true) {
  const bufferBuilder = new PieceTreeTextBufferBuilder();
  for (const chunk of val) {
    bufferBuilder.acceptChunk(chunk);
  }
  const factory = bufferBuilder.finish(normalizeEOL);
  return factory.create(DefaultEndOfLine.LF).textBuffer;
}
function assertTreeInvariants(T) {
  assert(SENTINEL.color === NodeColor.Black);
  assert(SENTINEL.parent === SENTINEL);
  assert(SENTINEL.left === SENTINEL);
  assert(SENTINEL.right === SENTINEL);
  assert(SENTINEL.size_left === 0);
  assert(SENTINEL.lf_left === 0);
  assertValidTree(T);
}
function depth(n) {
  if (n === SENTINEL) {
    return 1;
  }
  assert(depth(n.left) === depth(n.right));
  return (n.color === NodeColor.Black ? 1 : 0) + depth(n.left);
}
function assertValidNode(n) {
  if (n === SENTINEL) {
    return { size: 0, lf_cnt: 0 };
  }
  const l = n.left;
  const r = n.right;
  if (n.color === NodeColor.Red) {
    assert(l.color === NodeColor.Black);
    assert(r.color === NodeColor.Black);
  }
  const actualLeft = assertValidNode(l);
  assert(actualLeft.lf_cnt === n.lf_left);
  assert(actualLeft.size === n.size_left);
  const actualRight = assertValidNode(r);
  return { size: n.size_left + n.piece.length + actualRight.size, lf_cnt: n.lf_left + n.piece.lineFeedCnt + actualRight.lf_cnt };
}
function assertValidTree(T) {
  if (T.root === SENTINEL) {
    return;
  }
  assert(T.root.color === NodeColor.Black);
  assert(depth(T.root.left) === depth(T.root.right));
  assertValidNode(T.root);
}
suite("inserts and deletes", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("basic insert/delete", () => {
    const pieceTree = createTextBuffer([
      "This is a document with some text."
    ]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(34, "This is some more text to insert at offset 34.");
    assert.strictEqual(
      pieceTable.getLinesRawContent(),
      "This is a document with some text.This is some more text to insert at offset 34."
    );
    pieceTable.delete(42, 5);
    assert.strictEqual(
      pieceTable.getLinesRawContent(),
      "This is a document with some text.This is more text to insert at offset 34."
    );
    assertTreeInvariants(pieceTable);
  });
  test("more inserts", () => {
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pt = pieceTree.getPieceTree();
    pt.insert(0, "AAA");
    assert.strictEqual(pt.getLinesRawContent(), "AAA");
    pt.insert(0, "BBB");
    assert.strictEqual(pt.getLinesRawContent(), "BBBAAA");
    pt.insert(6, "CCC");
    assert.strictEqual(pt.getLinesRawContent(), "BBBAAACCC");
    pt.insert(5, "DDD");
    assert.strictEqual(pt.getLinesRawContent(), "BBBAADDDACCC");
    assertTreeInvariants(pt);
  });
  test("more deletes", () => {
    const pieceTree = createTextBuffer(["012345678"]);
    ds.add(pieceTree);
    const pt = pieceTree.getPieceTree();
    pt.delete(8, 1);
    assert.strictEqual(pt.getLinesRawContent(), "01234567");
    pt.delete(0, 1);
    assert.strictEqual(pt.getLinesRawContent(), "1234567");
    pt.delete(5, 1);
    assert.strictEqual(pt.getLinesRawContent(), "123457");
    pt.delete(5, 1);
    assert.strictEqual(pt.getLinesRawContent(), "12345");
    pt.delete(0, 5);
    assert.strictEqual(pt.getLinesRawContent(), "");
    assertTreeInvariants(pt);
  });
  test("random test 1", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "ceLPHmFzvCtFeHkCBej ");
    str = str.substring(0, 0) + "ceLPHmFzvCtFeHkCBej " + str.substring(0);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    pieceTable.insert(8, "gDCEfNYiBUNkSwtvB K ");
    str = str.substring(0, 8) + "gDCEfNYiBUNkSwtvB K " + str.substring(8);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    pieceTable.insert(38, "cyNcHxjNPPoehBJldLS ");
    str = str.substring(0, 38) + "cyNcHxjNPPoehBJldLS " + str.substring(38);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    pieceTable.insert(59, "ejMx\nOTgWlbpeDExjOk ");
    str = str.substring(0, 59) + "ejMx\nOTgWlbpeDExjOk " + str.substring(59);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    assertTreeInvariants(pieceTable);
  });
  test("random test 2", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "VgPG ");
    str = str.substring(0, 0) + "VgPG " + str.substring(0);
    pieceTable.insert(2, "DdWF ");
    str = str.substring(0, 2) + "DdWF " + str.substring(2);
    pieceTable.insert(0, "hUJc ");
    str = str.substring(0, 0) + "hUJc " + str.substring(0);
    pieceTable.insert(8, "lQEq ");
    str = str.substring(0, 8) + "lQEq " + str.substring(8);
    pieceTable.insert(10, "Gbtp ");
    str = str.substring(0, 10) + "Gbtp " + str.substring(10);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    assertTreeInvariants(pieceTable);
  });
  test("random test 3", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "gYSz");
    str = str.substring(0, 0) + "gYSz" + str.substring(0);
    pieceTable.insert(1, "mDQe");
    str = str.substring(0, 1) + "mDQe" + str.substring(1);
    pieceTable.insert(1, "DTMQ");
    str = str.substring(0, 1) + "DTMQ" + str.substring(1);
    pieceTable.insert(2, "GGZB");
    str = str.substring(0, 2) + "GGZB" + str.substring(2);
    pieceTable.insert(12, "wXpq");
    str = str.substring(0, 12) + "wXpq" + str.substring(12);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
  });
  test("random delete 1", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "vfb");
    str = str.substring(0, 0) + "vfb" + str.substring(0);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    pieceTable.insert(0, "zRq");
    str = str.substring(0, 0) + "zRq" + str.substring(0);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    pieceTable.delete(5, 1);
    str = str.substring(0, 5) + str.substring(5 + 1);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    pieceTable.insert(1, "UNw");
    str = str.substring(0, 1) + "UNw" + str.substring(1);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    pieceTable.delete(4, 3);
    str = str.substring(0, 4) + str.substring(4 + 3);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    pieceTable.delete(1, 4);
    str = str.substring(0, 1) + str.substring(1 + 4);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    pieceTable.delete(0, 1);
    str = str.substring(0, 0) + str.substring(0 + 1);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    assertTreeInvariants(pieceTable);
  });
  test("random delete 2", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "IDT");
    str = str.substring(0, 0) + "IDT" + str.substring(0);
    pieceTable.insert(3, "wwA");
    str = str.substring(0, 3) + "wwA" + str.substring(3);
    pieceTable.insert(3, "Gnr");
    str = str.substring(0, 3) + "Gnr" + str.substring(3);
    pieceTable.delete(6, 3);
    str = str.substring(0, 6) + str.substring(6 + 3);
    pieceTable.insert(4, "eHp");
    str = str.substring(0, 4) + "eHp" + str.substring(4);
    pieceTable.insert(1, "UAi");
    str = str.substring(0, 1) + "UAi" + str.substring(1);
    pieceTable.insert(2, "FrR");
    str = str.substring(0, 2) + "FrR" + str.substring(2);
    pieceTable.delete(6, 7);
    str = str.substring(0, 6) + str.substring(6 + 7);
    pieceTable.delete(3, 5);
    str = str.substring(0, 3) + str.substring(3 + 5);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    assertTreeInvariants(pieceTable);
  });
  test("random delete 3", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "PqM");
    str = str.substring(0, 0) + "PqM" + str.substring(0);
    pieceTable.delete(1, 2);
    str = str.substring(0, 1) + str.substring(1 + 2);
    pieceTable.insert(1, "zLc");
    str = str.substring(0, 1) + "zLc" + str.substring(1);
    pieceTable.insert(0, "MEX");
    str = str.substring(0, 0) + "MEX" + str.substring(0);
    pieceTable.insert(0, "jZh");
    str = str.substring(0, 0) + "jZh" + str.substring(0);
    pieceTable.insert(8, "GwQ");
    str = str.substring(0, 8) + "GwQ" + str.substring(8);
    pieceTable.delete(5, 6);
    str = str.substring(0, 5) + str.substring(5 + 6);
    pieceTable.insert(4, "ktw");
    str = str.substring(0, 4) + "ktw" + str.substring(4);
    pieceTable.insert(5, "GVu");
    str = str.substring(0, 5) + "GVu" + str.substring(5);
    pieceTable.insert(9, "jdm");
    str = str.substring(0, 9) + "jdm" + str.substring(9);
    pieceTable.insert(15, "na\n");
    str = str.substring(0, 15) + "na\n" + str.substring(15);
    pieceTable.delete(5, 8);
    str = str.substring(0, 5) + str.substring(5 + 8);
    pieceTable.delete(3, 4);
    str = str.substring(0, 3) + str.substring(3 + 4);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    assertTreeInvariants(pieceTable);
  });
  test("random insert/delete \\r bug 1", () => {
    let str = "a";
    const pieceTree = createTextBuffer(["a"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(0, 1);
    str = str.substring(0, 0) + str.substring(0 + 1);
    pieceTable.insert(0, "\r\r\n\n");
    str = str.substring(0, 0) + "\r\r\n\n" + str.substring(0);
    pieceTable.delete(3, 1);
    str = str.substring(0, 3) + str.substring(3 + 1);
    pieceTable.insert(2, "\n\n\ra");
    str = str.substring(0, 2) + "\n\n\ra" + str.substring(2);
    pieceTable.delete(4, 3);
    str = str.substring(0, 4) + str.substring(4 + 3);
    pieceTable.insert(2, "\na\r\r");
    str = str.substring(0, 2) + "\na\r\r" + str.substring(2);
    pieceTable.insert(6, "\ra\n\n");
    str = str.substring(0, 6) + "\ra\n\n" + str.substring(6);
    pieceTable.insert(0, "aa\n\n");
    str = str.substring(0, 0) + "aa\n\n" + str.substring(0);
    pieceTable.insert(5, "\n\na\r");
    str = str.substring(0, 5) + "\n\na\r" + str.substring(5);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    assertTreeInvariants(pieceTable);
  });
  test("random insert/delete \\r bug 2", () => {
    let str = "a";
    const pieceTree = createTextBuffer(["a"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(1, "\naa\r");
    str = str.substring(0, 1) + "\naa\r" + str.substring(1);
    pieceTable.delete(0, 4);
    str = str.substring(0, 0) + str.substring(0 + 4);
    pieceTable.insert(1, "\r\r\na");
    str = str.substring(0, 1) + "\r\r\na" + str.substring(1);
    pieceTable.insert(2, "\n\r\ra");
    str = str.substring(0, 2) + "\n\r\ra" + str.substring(2);
    pieceTable.delete(4, 1);
    str = str.substring(0, 4) + str.substring(4 + 1);
    pieceTable.insert(8, "\r\n\r\r");
    str = str.substring(0, 8) + "\r\n\r\r" + str.substring(8);
    pieceTable.insert(7, "\n\n\na");
    str = str.substring(0, 7) + "\n\n\na" + str.substring(7);
    pieceTable.insert(13, "a\n\na");
    str = str.substring(0, 13) + "a\n\na" + str.substring(13);
    pieceTable.delete(17, 3);
    str = str.substring(0, 17) + str.substring(17 + 3);
    pieceTable.insert(2, "a\ra\n");
    str = str.substring(0, 2) + "a\ra\n" + str.substring(2);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    assertTreeInvariants(pieceTable);
  });
  test("random insert/delete \\r bug 3", () => {
    let str = "a";
    const pieceTree = createTextBuffer(["a"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\r\na\r");
    str = str.substring(0, 0) + "\r\na\r" + str.substring(0);
    pieceTable.delete(2, 3);
    str = str.substring(0, 2) + str.substring(2 + 3);
    pieceTable.insert(2, "a\r\n\r");
    str = str.substring(0, 2) + "a\r\n\r" + str.substring(2);
    pieceTable.delete(4, 2);
    str = str.substring(0, 4) + str.substring(4 + 2);
    pieceTable.insert(4, "a\n\r\n");
    str = str.substring(0, 4) + "a\n\r\n" + str.substring(4);
    pieceTable.insert(1, "aa\n\r");
    str = str.substring(0, 1) + "aa\n\r" + str.substring(1);
    pieceTable.insert(7, "\na\r\n");
    str = str.substring(0, 7) + "\na\r\n" + str.substring(7);
    pieceTable.insert(5, "\n\na\r");
    str = str.substring(0, 5) + "\n\na\r" + str.substring(5);
    pieceTable.insert(10, "\r\r\n\r");
    str = str.substring(0, 10) + "\r\r\n\r" + str.substring(10);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    pieceTable.delete(21, 3);
    str = str.substring(0, 21) + str.substring(21 + 3);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    assertTreeInvariants(pieceTable);
  });
  test("random insert/delete \\r bug 4s", () => {
    let str = "a";
    const pieceTree = createTextBuffer(["a"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(0, 1);
    str = str.substring(0, 0) + str.substring(0 + 1);
    pieceTable.insert(0, "\naaa");
    str = str.substring(0, 0) + "\naaa" + str.substring(0);
    pieceTable.insert(2, "\n\naa");
    str = str.substring(0, 2) + "\n\naa" + str.substring(2);
    pieceTable.delete(1, 4);
    str = str.substring(0, 1) + str.substring(1 + 4);
    pieceTable.delete(3, 1);
    str = str.substring(0, 3) + str.substring(3 + 1);
    pieceTable.delete(1, 2);
    str = str.substring(0, 1) + str.substring(1 + 2);
    pieceTable.delete(0, 1);
    str = str.substring(0, 0) + str.substring(0 + 1);
    pieceTable.insert(0, "a\n\n\r");
    str = str.substring(0, 0) + "a\n\n\r" + str.substring(0);
    pieceTable.insert(2, "aa\r\n");
    str = str.substring(0, 2) + "aa\r\n" + str.substring(2);
    pieceTable.insert(3, "a\naa");
    str = str.substring(0, 3) + "a\naa" + str.substring(3);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    assertTreeInvariants(pieceTable);
  });
  test("random insert/delete \\r bug 5", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\n\n\n\r");
    str = str.substring(0, 0) + "\n\n\n\r" + str.substring(0);
    pieceTable.insert(1, "\n\n\n\r");
    str = str.substring(0, 1) + "\n\n\n\r" + str.substring(1);
    pieceTable.insert(2, "\n\r\r\r");
    str = str.substring(0, 2) + "\n\r\r\r" + str.substring(2);
    pieceTable.insert(8, "\n\r\n\r");
    str = str.substring(0, 8) + "\n\r\n\r" + str.substring(8);
    pieceTable.delete(5, 2);
    str = str.substring(0, 5) + str.substring(5 + 2);
    pieceTable.insert(4, "\n\r\r\r");
    str = str.substring(0, 4) + "\n\r\r\r" + str.substring(4);
    pieceTable.insert(8, "\n\n\n\r");
    str = str.substring(0, 8) + "\n\n\n\r" + str.substring(8);
    pieceTable.delete(0, 7);
    str = str.substring(0, 0) + str.substring(0 + 7);
    pieceTable.insert(1, "\r\n\r\r");
    str = str.substring(0, 1) + "\r\n\r\r" + str.substring(1);
    pieceTable.insert(15, "\n\r\r\r");
    str = str.substring(0, 15) + "\n\r\r\r" + str.substring(15);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    assertTreeInvariants(pieceTable);
  });
});
suite("prefix sum for line feed", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("basic", () => {
    const pieceTree = createTextBuffer(["1\n2\n3\n4"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    assert.strictEqual(pieceTable.getLineCount(), 4);
    assert.deepStrictEqual(pieceTable.getPositionAt(0), new Position(1, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(1), new Position(1, 2));
    assert.deepStrictEqual(pieceTable.getPositionAt(2), new Position(2, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(3), new Position(2, 2));
    assert.deepStrictEqual(pieceTable.getPositionAt(4), new Position(3, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(5), new Position(3, 2));
    assert.deepStrictEqual(pieceTable.getPositionAt(6), new Position(4, 1));
    assert.strictEqual(pieceTable.getOffsetAt(1, 1), 0);
    assert.strictEqual(pieceTable.getOffsetAt(1, 2), 1);
    assert.strictEqual(pieceTable.getOffsetAt(2, 1), 2);
    assert.strictEqual(pieceTable.getOffsetAt(2, 2), 3);
    assert.strictEqual(pieceTable.getOffsetAt(3, 1), 4);
    assert.strictEqual(pieceTable.getOffsetAt(3, 2), 5);
    assert.strictEqual(pieceTable.getOffsetAt(4, 1), 6);
    assertTreeInvariants(pieceTable);
  });
  test("append", () => {
    const pieceTree = createTextBuffer(["a\nb\nc\nde"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(8, "fh\ni\njk");
    assert.strictEqual(pieceTable.getLineCount(), 6);
    assert.deepStrictEqual(pieceTable.getPositionAt(9), new Position(4, 4));
    assert.strictEqual(pieceTable.getOffsetAt(1, 1), 0);
    assertTreeInvariants(pieceTable);
  });
  test("insert", () => {
    const pieceTree = createTextBuffer(["a\nb\nc\nde"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(7, "fh\ni\njk");
    assert.strictEqual(pieceTable.getLineCount(), 6);
    assert.deepStrictEqual(pieceTable.getPositionAt(6), new Position(4, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(7), new Position(4, 2));
    assert.deepStrictEqual(pieceTable.getPositionAt(8), new Position(4, 3));
    assert.deepStrictEqual(pieceTable.getPositionAt(9), new Position(4, 4));
    assert.deepStrictEqual(pieceTable.getPositionAt(12), new Position(6, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(13), new Position(6, 2));
    assert.deepStrictEqual(pieceTable.getPositionAt(14), new Position(6, 3));
    assert.strictEqual(pieceTable.getOffsetAt(4, 1), 6);
    assert.strictEqual(pieceTable.getOffsetAt(4, 2), 7);
    assert.strictEqual(pieceTable.getOffsetAt(4, 3), 8);
    assert.strictEqual(pieceTable.getOffsetAt(4, 4), 9);
    assert.strictEqual(pieceTable.getOffsetAt(6, 1), 12);
    assert.strictEqual(pieceTable.getOffsetAt(6, 2), 13);
    assert.strictEqual(pieceTable.getOffsetAt(6, 3), 14);
    assertTreeInvariants(pieceTable);
  });
  test("delete", () => {
    const pieceTree = createTextBuffer(["a\nb\nc\ndefh\ni\njk"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(7, 2);
    assert.strictEqual(pieceTable.getLinesRawContent(), "a\nb\nc\ndh\ni\njk");
    assert.strictEqual(pieceTable.getLineCount(), 6);
    assert.deepStrictEqual(pieceTable.getPositionAt(6), new Position(4, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(7), new Position(4, 2));
    assert.deepStrictEqual(pieceTable.getPositionAt(8), new Position(4, 3));
    assert.deepStrictEqual(pieceTable.getPositionAt(9), new Position(5, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(11), new Position(6, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(12), new Position(6, 2));
    assert.deepStrictEqual(pieceTable.getPositionAt(13), new Position(6, 3));
    assert.strictEqual(pieceTable.getOffsetAt(4, 1), 6);
    assert.strictEqual(pieceTable.getOffsetAt(4, 2), 7);
    assert.strictEqual(pieceTable.getOffsetAt(4, 3), 8);
    assert.strictEqual(pieceTable.getOffsetAt(5, 1), 9);
    assert.strictEqual(pieceTable.getOffsetAt(6, 1), 11);
    assert.strictEqual(pieceTable.getOffsetAt(6, 2), 12);
    assert.strictEqual(pieceTable.getOffsetAt(6, 3), 13);
    assertTreeInvariants(pieceTable);
  });
  test("add+delete 1", () => {
    const pieceTree = createTextBuffer(["a\nb\nc\nde"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(8, "fh\ni\njk");
    pieceTable.delete(7, 2);
    assert.strictEqual(pieceTable.getLinesRawContent(), "a\nb\nc\ndh\ni\njk");
    assert.strictEqual(pieceTable.getLineCount(), 6);
    assert.deepStrictEqual(pieceTable.getPositionAt(6), new Position(4, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(7), new Position(4, 2));
    assert.deepStrictEqual(pieceTable.getPositionAt(8), new Position(4, 3));
    assert.deepStrictEqual(pieceTable.getPositionAt(9), new Position(5, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(11), new Position(6, 1));
    assert.deepStrictEqual(pieceTable.getPositionAt(12), new Position(6, 2));
    assert.deepStrictEqual(pieceTable.getPositionAt(13), new Position(6, 3));
    assert.strictEqual(pieceTable.getOffsetAt(4, 1), 6);
    assert.strictEqual(pieceTable.getOffsetAt(4, 2), 7);
    assert.strictEqual(pieceTable.getOffsetAt(4, 3), 8);
    assert.strictEqual(pieceTable.getOffsetAt(5, 1), 9);
    assert.strictEqual(pieceTable.getOffsetAt(6, 1), 11);
    assert.strictEqual(pieceTable.getOffsetAt(6, 2), 12);
    assert.strictEqual(pieceTable.getOffsetAt(6, 3), 13);
    assertTreeInvariants(pieceTable);
  });
  test("insert random bug 1: prefixSumComputer.removeValues(start, cnt) cnt is 1 based.", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, " ZX \n Z\nZ\n YZ\nY\nZXX ");
    str = str.substring(0, 0) + " ZX \n Z\nZ\n YZ\nY\nZXX " + str.substring(0);
    pieceTable.insert(14, "X ZZ\nYZZYZXXY Y XY\n ");
    str = str.substring(0, 14) + "X ZZ\nYZZYZXXY Y XY\n " + str.substring(14);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("insert random bug 2: prefixSumComputer initialize does not do deep copy of UInt32Array.", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "ZYZ\nYY XY\nX \nZ Y \nZ ");
    str = str.substring(0, 0) + "ZYZ\nYY XY\nX \nZ Y \nZ " + str.substring(0);
    pieceTable.insert(3, "XXY \n\nY Y YYY  ZYXY ");
    str = str.substring(0, 3) + "XXY \n\nY Y YYY  ZYXY " + str.substring(3);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("delete random bug 1: I forgot to update the lineFeedCnt when deletion is on one single piece.", () => {
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "ba\na\nca\nba\ncbab\ncaa ");
    pieceTable.insert(13, "cca\naabb\ncac\nccc\nab ");
    pieceTable.delete(5, 8);
    pieceTable.delete(30, 2);
    pieceTable.insert(24, "cbbacccbac\nbaaab\n\nc ");
    pieceTable.delete(29, 3);
    pieceTable.delete(23, 9);
    pieceTable.delete(21, 5);
    pieceTable.delete(30, 3);
    pieceTable.insert(3, "cb\nac\nc\n\nacc\nbb\nb\nc ");
    pieceTable.delete(19, 5);
    pieceTable.insert(18, "\nbb\n\nacbc\ncbb\nc\nbb\n ");
    pieceTable.insert(65, "cbccbac\nbc\n\nccabba\n ");
    pieceTable.insert(77, "a\ncacb\n\nac\n\n\n\n\nabab ");
    pieceTable.delete(30, 9);
    pieceTable.insert(45, "b\n\nc\nba\n\nbbbba\n\naa\n ");
    pieceTable.insert(82, "ab\nbb\ncabacab\ncbc\na ");
    pieceTable.delete(123, 9);
    pieceTable.delete(71, 2);
    pieceTable.insert(33, "acaa\nacb\n\naa\n\nc\n\n\n\n ");
    const str = pieceTable.getLinesRawContent();
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("delete random bug rb tree 1", () => {
    let str = "";
    const pieceTree = createTextBuffer([str]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "YXXZ\n\nYY\n");
    str = str.substring(0, 0) + "YXXZ\n\nYY\n" + str.substring(0);
    pieceTable.delete(0, 5);
    str = str.substring(0, 0) + str.substring(0 + 5);
    pieceTable.insert(0, "ZXYY\nX\nZ\n");
    str = str.substring(0, 0) + "ZXYY\nX\nZ\n" + str.substring(0);
    pieceTable.insert(10, "\nXY\nYXYXY");
    str = str.substring(0, 10) + "\nXY\nYXYXY" + str.substring(10);
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("delete random bug rb tree 2", () => {
    let str = "";
    const pieceTree = createTextBuffer([str]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "YXXZ\n\nYY\n");
    str = str.substring(0, 0) + "YXXZ\n\nYY\n" + str.substring(0);
    pieceTable.insert(0, "ZXYY\nX\nZ\n");
    str = str.substring(0, 0) + "ZXYY\nX\nZ\n" + str.substring(0);
    pieceTable.insert(10, "\nXY\nYXYXY");
    str = str.substring(0, 10) + "\nXY\nYXYXY" + str.substring(10);
    pieceTable.insert(8, "YZXY\nZ\nYX");
    str = str.substring(0, 8) + "YZXY\nZ\nYX" + str.substring(8);
    pieceTable.insert(12, "XX\nXXYXYZ");
    str = str.substring(0, 12) + "XX\nXXYXYZ" + str.substring(12);
    pieceTable.delete(0, 4);
    str = str.substring(0, 0) + str.substring(0 + 4);
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("delete random bug rb tree 3", () => {
    let str = "";
    const pieceTree = createTextBuffer([str]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "YXXZ\n\nYY\n");
    str = str.substring(0, 0) + "YXXZ\n\nYY\n" + str.substring(0);
    pieceTable.delete(7, 2);
    str = str.substring(0, 7) + str.substring(7 + 2);
    pieceTable.delete(6, 1);
    str = str.substring(0, 6) + str.substring(6 + 1);
    pieceTable.delete(0, 5);
    str = str.substring(0, 0) + str.substring(0 + 5);
    pieceTable.insert(0, "ZXYY\nX\nZ\n");
    str = str.substring(0, 0) + "ZXYY\nX\nZ\n" + str.substring(0);
    pieceTable.insert(10, "\nXY\nYXYXY");
    str = str.substring(0, 10) + "\nXY\nYXYXY" + str.substring(10);
    pieceTable.insert(8, "YZXY\nZ\nYX");
    str = str.substring(0, 8) + "YZXY\nZ\nYX" + str.substring(8);
    pieceTable.insert(12, "XX\nXXYXYZ");
    str = str.substring(0, 12) + "XX\nXXYXYZ" + str.substring(12);
    pieceTable.delete(0, 4);
    str = str.substring(0, 0) + str.substring(0 + 4);
    pieceTable.delete(30, 3);
    str = str.substring(0, 30) + str.substring(30 + 3);
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
});
suite("offset 2 position", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("random tests bug 1", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "huuyYzUfKOENwGgZLqn ");
    str = str.substring(0, 0) + "huuyYzUfKOENwGgZLqn " + str.substring(0);
    pieceTable.delete(18, 2);
    str = str.substring(0, 18) + str.substring(18 + 2);
    pieceTable.delete(3, 1);
    str = str.substring(0, 3) + str.substring(3 + 1);
    pieceTable.delete(12, 4);
    str = str.substring(0, 12) + str.substring(12 + 4);
    pieceTable.insert(3, "hMbnVEdTSdhLlPevXKF ");
    str = str.substring(0, 3) + "hMbnVEdTSdhLlPevXKF " + str.substring(3);
    pieceTable.delete(22, 8);
    str = str.substring(0, 22) + str.substring(22 + 8);
    pieceTable.insert(4, "S umSnYrqOmOAV\nEbZJ ");
    str = str.substring(0, 4) + "S umSnYrqOmOAV\nEbZJ " + str.substring(4);
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
});
suite("get text in range", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("getContentInRange", () => {
    const pieceTree = createTextBuffer(["a\nb\nc\nde"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(8, "fh\ni\njk");
    pieceTable.delete(7, 2);
    assert.strictEqual(pieceTable.getValueInRange(new Range(1, 1, 1, 3)), "a\n");
    assert.strictEqual(pieceTable.getValueInRange(new Range(2, 1, 2, 3)), "b\n");
    assert.strictEqual(pieceTable.getValueInRange(new Range(3, 1, 3, 3)), "c\n");
    assert.strictEqual(pieceTable.getValueInRange(new Range(4, 1, 4, 4)), "dh\n");
    assert.strictEqual(pieceTable.getValueInRange(new Range(5, 1, 5, 3)), "i\n");
    assert.strictEqual(pieceTable.getValueInRange(new Range(6, 1, 6, 3)), "jk");
    assertTreeInvariants(pieceTable);
  });
  test("random test value in range", () => {
    let str = "";
    const pieceTree = createTextBuffer([str]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "ZXXY");
    str = str.substring(0, 0) + "ZXXY" + str.substring(0);
    pieceTable.insert(1, "XZZY");
    str = str.substring(0, 1) + "XZZY" + str.substring(1);
    pieceTable.insert(5, "\nX\n\n");
    str = str.substring(0, 5) + "\nX\n\n" + str.substring(5);
    pieceTable.insert(3, "\nXX\n");
    str = str.substring(0, 3) + "\nXX\n" + str.substring(3);
    pieceTable.insert(12, "YYYX");
    str = str.substring(0, 12) + "YYYX" + str.substring(12);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random test value in range exception", () => {
    let str = "";
    const pieceTree = createTextBuffer([str]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "XZ\nZ");
    str = str.substring(0, 0) + "XZ\nZ" + str.substring(0);
    pieceTable.delete(0, 3);
    str = str.substring(0, 0) + str.substring(0 + 3);
    pieceTable.delete(0, 1);
    str = str.substring(0, 0) + str.substring(0 + 1);
    pieceTable.insert(0, "ZYX\n");
    str = str.substring(0, 0) + "ZYX\n" + str.substring(0);
    pieceTable.delete(0, 4);
    str = str.substring(0, 0) + str.substring(0 + 4);
    pieceTable.getValueInRange(new Range(1, 1, 1, 1));
    assertTreeInvariants(pieceTable);
  });
  test("random tests bug 1", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "huuyYzUfKOENwGgZLqn ");
    str = str.substring(0, 0) + "huuyYzUfKOENwGgZLqn " + str.substring(0);
    pieceTable.delete(18, 2);
    str = str.substring(0, 18) + str.substring(18 + 2);
    pieceTable.delete(3, 1);
    str = str.substring(0, 3) + str.substring(3 + 1);
    pieceTable.delete(12, 4);
    str = str.substring(0, 12) + str.substring(12 + 4);
    pieceTable.insert(3, "hMbnVEdTSdhLlPevXKF ");
    str = str.substring(0, 3) + "hMbnVEdTSdhLlPevXKF " + str.substring(3);
    pieceTable.delete(22, 8);
    str = str.substring(0, 22) + str.substring(22 + 8);
    pieceTable.insert(4, "S umSnYrqOmOAV\nEbZJ ");
    str = str.substring(0, 4) + "S umSnYrqOmOAV\nEbZJ " + str.substring(4);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random tests bug 2", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "xfouRDZwdAHjVXJAMV\n ");
    str = str.substring(0, 0) + "xfouRDZwdAHjVXJAMV\n " + str.substring(0);
    pieceTable.insert(16, "dBGndxpFZBEAIKykYYx ");
    str = str.substring(0, 16) + "dBGndxpFZBEAIKykYYx " + str.substring(16);
    pieceTable.delete(7, 6);
    str = str.substring(0, 7) + str.substring(7 + 6);
    pieceTable.delete(9, 7);
    str = str.substring(0, 9) + str.substring(9 + 7);
    pieceTable.delete(17, 6);
    str = str.substring(0, 17) + str.substring(17 + 6);
    pieceTable.delete(0, 4);
    str = str.substring(0, 0) + str.substring(0 + 4);
    pieceTable.insert(9, "qvEFXCNvVkWgvykahYt ");
    str = str.substring(0, 9) + "qvEFXCNvVkWgvykahYt " + str.substring(9);
    pieceTable.delete(4, 6);
    str = str.substring(0, 4) + str.substring(4 + 6);
    pieceTable.insert(11, "OcSChUYT\nzPEBOpsGmR ");
    str = str.substring(0, 11) + "OcSChUYT\nzPEBOpsGmR " + str.substring(11);
    pieceTable.insert(15, "KJCozaXTvkE\nxnqAeTz ");
    str = str.substring(0, 15) + "KJCozaXTvkE\nxnqAeTz " + str.substring(15);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("get line content", () => {
    const pieceTree = createTextBuffer(["1"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    assert.strictEqual(pieceTable.getLineRawContent(1), "1");
    pieceTable.insert(1, "2");
    assert.strictEqual(pieceTable.getLineRawContent(1), "12");
    assertTreeInvariants(pieceTable);
  });
  test("get line content basic", () => {
    const pieceTree = createTextBuffer(["1\n2\n3\n4"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    assert.strictEqual(pieceTable.getLineRawContent(1), "1\n");
    assert.strictEqual(pieceTable.getLineRawContent(2), "2\n");
    assert.strictEqual(pieceTable.getLineRawContent(3), "3\n");
    assert.strictEqual(pieceTable.getLineRawContent(4), "4");
    assertTreeInvariants(pieceTable);
  });
  test("get line content after inserts/deletes", () => {
    const pieceTree = createTextBuffer(["a\nb\nc\nde"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(8, "fh\ni\njk");
    pieceTable.delete(7, 2);
    assert.strictEqual(pieceTable.getLineRawContent(1), "a\n");
    assert.strictEqual(pieceTable.getLineRawContent(2), "b\n");
    assert.strictEqual(pieceTable.getLineRawContent(3), "c\n");
    assert.strictEqual(pieceTable.getLineRawContent(4), "dh\n");
    assert.strictEqual(pieceTable.getLineRawContent(5), "i\n");
    assert.strictEqual(pieceTable.getLineRawContent(6), "jk");
    assertTreeInvariants(pieceTable);
  });
  test("random 1", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "J eNnDzQpnlWyjmUu\ny ");
    str = str.substring(0, 0) + "J eNnDzQpnlWyjmUu\ny " + str.substring(0);
    pieceTable.insert(0, "QPEeRAQmRwlJqtZSWhQ ");
    str = str.substring(0, 0) + "QPEeRAQmRwlJqtZSWhQ " + str.substring(0);
    pieceTable.delete(5, 1);
    str = str.substring(0, 5) + str.substring(5 + 1);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random 2", () => {
    let str = "";
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "DZoQ tglPCRHMltejRI ");
    str = str.substring(0, 0) + "DZoQ tglPCRHMltejRI " + str.substring(0);
    pieceTable.insert(10, "JRXiyYqJ qqdcmbfkKX ");
    str = str.substring(0, 10) + "JRXiyYqJ qqdcmbfkKX " + str.substring(10);
    pieceTable.delete(16, 3);
    str = str.substring(0, 16) + str.substring(16 + 3);
    pieceTable.delete(25, 1);
    str = str.substring(0, 25) + str.substring(25 + 1);
    pieceTable.insert(18, "vH\nNlvfqQJPm\nSFkhMc ");
    str = str.substring(0, 18) + "vH\nNlvfqQJPm\nSFkhMc " + str.substring(18);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
});
suite("CRLF", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("delete CR in CRLF 1", () => {
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "a\r\nb");
    pieceTable.delete(0, 2);
    assert.strictEqual(pieceTable.getLineCount(), 2);
    assertTreeInvariants(pieceTable);
  });
  test("delete CR in CRLF 2", () => {
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "a\r\nb");
    pieceTable.delete(2, 2);
    assert.strictEqual(pieceTable.getLineCount(), 2);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 1", () => {
    let str = "";
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\n\n\r\r");
    str = str.substring(0, 0) + "\n\n\r\r" + str.substring(0);
    pieceTable.insert(1, "\r\n\r\n");
    str = str.substring(0, 1) + "\r\n\r\n" + str.substring(1);
    pieceTable.delete(5, 3);
    str = str.substring(0, 5) + str.substring(5 + 3);
    pieceTable.delete(2, 3);
    str = str.substring(0, 2) + str.substring(2 + 3);
    const lines = splitLines(str);
    assert.strictEqual(pieceTable.getLineCount(), lines.length);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 2", () => {
    let str = "";
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\n\r\n\r");
    str = str.substring(0, 0) + "\n\r\n\r" + str.substring(0);
    pieceTable.insert(2, "\n\r\r\r");
    str = str.substring(0, 2) + "\n\r\r\r" + str.substring(2);
    pieceTable.delete(4, 1);
    str = str.substring(0, 4) + str.substring(4 + 1);
    const lines = splitLines(str);
    assert.strictEqual(pieceTable.getLineCount(), lines.length);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 3", () => {
    let str = "";
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\n\n\n\r");
    str = str.substring(0, 0) + "\n\n\n\r" + str.substring(0);
    pieceTable.delete(2, 2);
    str = str.substring(0, 2) + str.substring(2 + 2);
    pieceTable.delete(0, 2);
    str = str.substring(0, 0) + str.substring(0 + 2);
    pieceTable.insert(0, "\r\r\r\r");
    str = str.substring(0, 0) + "\r\r\r\r" + str.substring(0);
    pieceTable.insert(2, "\r\n\r\r");
    str = str.substring(0, 2) + "\r\n\r\r" + str.substring(2);
    pieceTable.insert(3, "\r\r\r\n");
    str = str.substring(0, 3) + "\r\r\r\n" + str.substring(3);
    const lines = splitLines(str);
    assert.strictEqual(pieceTable.getLineCount(), lines.length);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 4", () => {
    let str = "";
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\n\n\n\n");
    str = str.substring(0, 0) + "\n\n\n\n" + str.substring(0);
    pieceTable.delete(3, 1);
    str = str.substring(0, 3) + str.substring(3 + 1);
    pieceTable.insert(1, "\r\r\r\r");
    str = str.substring(0, 1) + "\r\r\r\r" + str.substring(1);
    pieceTable.insert(6, "\r\n\n\r");
    str = str.substring(0, 6) + "\r\n\n\r" + str.substring(6);
    pieceTable.delete(5, 3);
    str = str.substring(0, 5) + str.substring(5 + 3);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 5", () => {
    let str = "";
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\n\n\n\n");
    str = str.substring(0, 0) + "\n\n\n\n" + str.substring(0);
    pieceTable.delete(3, 1);
    str = str.substring(0, 3) + str.substring(3 + 1);
    pieceTable.insert(0, "\n\r\r\n");
    str = str.substring(0, 0) + "\n\r\r\n" + str.substring(0);
    pieceTable.insert(4, "\n\r\r\n");
    str = str.substring(0, 4) + "\n\r\r\n" + str.substring(4);
    pieceTable.delete(4, 3);
    str = str.substring(0, 4) + str.substring(4 + 3);
    pieceTable.insert(5, "\r\r\n\r");
    str = str.substring(0, 5) + "\r\r\n\r" + str.substring(5);
    pieceTable.insert(12, "\n\n\n\r");
    str = str.substring(0, 12) + "\n\n\n\r" + str.substring(12);
    pieceTable.insert(5, "\r\r\r\n");
    str = str.substring(0, 5) + "\r\r\r\n" + str.substring(5);
    pieceTable.insert(20, "\n\n\r\n");
    str = str.substring(0, 20) + "\n\n\r\n" + str.substring(20);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 6", () => {
    let str = "";
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\n\r\r\n");
    str = str.substring(0, 0) + "\n\r\r\n" + str.substring(0);
    pieceTable.insert(4, "\r\n\n\r");
    str = str.substring(0, 4) + "\r\n\n\r" + str.substring(4);
    pieceTable.insert(3, "\r\n\n\n");
    str = str.substring(0, 3) + "\r\n\n\n" + str.substring(3);
    pieceTable.delete(4, 8);
    str = str.substring(0, 4) + str.substring(4 + 8);
    pieceTable.insert(4, "\r\n\n\r");
    str = str.substring(0, 4) + "\r\n\n\r" + str.substring(4);
    pieceTable.insert(0, "\r\n\n\r");
    str = str.substring(0, 0) + "\r\n\n\r" + str.substring(0);
    pieceTable.delete(4, 0);
    str = str.substring(0, 4) + str.substring(4 + 0);
    pieceTable.delete(8, 4);
    str = str.substring(0, 8) + str.substring(8 + 4);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 8", () => {
    let str = "";
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\r\n\n\r");
    str = str.substring(0, 0) + "\r\n\n\r" + str.substring(0);
    pieceTable.delete(1, 0);
    str = str.substring(0, 1) + str.substring(1 + 0);
    pieceTable.insert(3, "\n\n\n\r");
    str = str.substring(0, 3) + "\n\n\n\r" + str.substring(3);
    pieceTable.insert(7, "\n\n\r\n");
    str = str.substring(0, 7) + "\n\n\r\n" + str.substring(7);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 7", () => {
    let str = "";
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\r\r\n\n");
    str = str.substring(0, 0) + "\r\r\n\n" + str.substring(0);
    pieceTable.insert(4, "\r\n\n\r");
    str = str.substring(0, 4) + "\r\n\n\r" + str.substring(4);
    pieceTable.insert(7, "\n\r\r\r");
    str = str.substring(0, 7) + "\n\r\r\r" + str.substring(7);
    pieceTable.insert(11, "\n\n\r\n");
    str = str.substring(0, 11) + "\n\n\r\n" + str.substring(11);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 10", () => {
    let str = "";
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "qneW");
    str = str.substring(0, 0) + "qneW" + str.substring(0);
    pieceTable.insert(0, "YhIl");
    str = str.substring(0, 0) + "YhIl" + str.substring(0);
    pieceTable.insert(0, "qdsm");
    str = str.substring(0, 0) + "qdsm" + str.substring(0);
    pieceTable.delete(7, 0);
    str = str.substring(0, 7) + str.substring(7 + 0);
    pieceTable.insert(12, "iiPv");
    str = str.substring(0, 12) + "iiPv" + str.substring(12);
    pieceTable.insert(9, "V\rSA");
    str = str.substring(0, 9) + "V\rSA" + str.substring(9);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 9", () => {
    let str = "";
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "\n\n\n\n");
    str = str.substring(0, 0) + "\n\n\n\n" + str.substring(0);
    pieceTable.insert(3, "\n\r\n\r");
    str = str.substring(0, 3) + "\n\r\n\r" + str.substring(3);
    pieceTable.insert(2, "\n\r\n\n");
    str = str.substring(0, 2) + "\n\r\n\n" + str.substring(2);
    pieceTable.insert(0, "\n\n\r\r");
    str = str.substring(0, 0) + "\n\n\r\r" + str.substring(0);
    pieceTable.insert(3, "\r\r\r\r");
    str = str.substring(0, 3) + "\r\r\r\r" + str.substring(3);
    pieceTable.insert(3, "\n\n\r\r");
    str = str.substring(0, 3) + "\n\n\r\r" + str.substring(3);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
});
suite("centralized lineStarts with CRLF", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("delete CR in CRLF 1", () => {
    const pieceTree = createTextBuffer(["a\r\nb"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(2, 2);
    assert.strictEqual(pieceTable.getLineCount(), 2);
    assertTreeInvariants(pieceTable);
  });
  test("delete CR in CRLF 2", () => {
    const pieceTree = createTextBuffer(["a\r\nb"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(0, 2);
    assert.strictEqual(pieceTable.getLineCount(), 2);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 1", () => {
    let str = "\n\n\r\r";
    const pieceTree = createTextBuffer(["\n\n\r\r"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(1, "\r\n\r\n");
    str = str.substring(0, 1) + "\r\n\r\n" + str.substring(1);
    pieceTable.delete(5, 3);
    str = str.substring(0, 5) + str.substring(5 + 3);
    pieceTable.delete(2, 3);
    str = str.substring(0, 2) + str.substring(2 + 3);
    const lines = splitLines(str);
    assert.strictEqual(pieceTable.getLineCount(), lines.length);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 2", () => {
    let str = "\n\r\n\r";
    const pieceTree = createTextBuffer(["\n\r\n\r"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(2, "\n\r\r\r");
    str = str.substring(0, 2) + "\n\r\r\r" + str.substring(2);
    pieceTable.delete(4, 1);
    str = str.substring(0, 4) + str.substring(4 + 1);
    const lines = splitLines(str);
    assert.strictEqual(pieceTable.getLineCount(), lines.length);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 3", () => {
    let str = "\n\n\n\r";
    const pieceTree = createTextBuffer(["\n\n\n\r"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(2, 2);
    str = str.substring(0, 2) + str.substring(2 + 2);
    pieceTable.delete(0, 2);
    str = str.substring(0, 0) + str.substring(0 + 2);
    pieceTable.insert(0, "\r\r\r\r");
    str = str.substring(0, 0) + "\r\r\r\r" + str.substring(0);
    pieceTable.insert(2, "\r\n\r\r");
    str = str.substring(0, 2) + "\r\n\r\r" + str.substring(2);
    pieceTable.insert(3, "\r\r\r\n");
    str = str.substring(0, 3) + "\r\r\r\n" + str.substring(3);
    const lines = splitLines(str);
    assert.strictEqual(pieceTable.getLineCount(), lines.length);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 4", () => {
    let str = "\n\n\n\n";
    const pieceTree = createTextBuffer(["\n\n\n\n"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(3, 1);
    str = str.substring(0, 3) + str.substring(3 + 1);
    pieceTable.insert(1, "\r\r\r\r");
    str = str.substring(0, 1) + "\r\r\r\r" + str.substring(1);
    pieceTable.insert(6, "\r\n\n\r");
    str = str.substring(0, 6) + "\r\n\n\r" + str.substring(6);
    pieceTable.delete(5, 3);
    str = str.substring(0, 5) + str.substring(5 + 3);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 5", () => {
    let str = "\n\n\n\n";
    const pieceTree = createTextBuffer(["\n\n\n\n"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(3, 1);
    str = str.substring(0, 3) + str.substring(3 + 1);
    pieceTable.insert(0, "\n\r\r\n");
    str = str.substring(0, 0) + "\n\r\r\n" + str.substring(0);
    pieceTable.insert(4, "\n\r\r\n");
    str = str.substring(0, 4) + "\n\r\r\n" + str.substring(4);
    pieceTable.delete(4, 3);
    str = str.substring(0, 4) + str.substring(4 + 3);
    pieceTable.insert(5, "\r\r\n\r");
    str = str.substring(0, 5) + "\r\r\n\r" + str.substring(5);
    pieceTable.insert(12, "\n\n\n\r");
    str = str.substring(0, 12) + "\n\n\n\r" + str.substring(12);
    pieceTable.insert(5, "\r\r\r\n");
    str = str.substring(0, 5) + "\r\r\r\n" + str.substring(5);
    pieceTable.insert(20, "\n\n\r\n");
    str = str.substring(0, 20) + "\n\n\r\n" + str.substring(20);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 6", () => {
    let str = "\n\r\r\n";
    const pieceTree = createTextBuffer(["\n\r\r\n"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(4, "\r\n\n\r");
    str = str.substring(0, 4) + "\r\n\n\r" + str.substring(4);
    pieceTable.insert(3, "\r\n\n\n");
    str = str.substring(0, 3) + "\r\n\n\n" + str.substring(3);
    pieceTable.delete(4, 8);
    str = str.substring(0, 4) + str.substring(4 + 8);
    pieceTable.insert(4, "\r\n\n\r");
    str = str.substring(0, 4) + "\r\n\n\r" + str.substring(4);
    pieceTable.insert(0, "\r\n\n\r");
    str = str.substring(0, 0) + "\r\n\n\r" + str.substring(0);
    pieceTable.delete(4, 0);
    str = str.substring(0, 4) + str.substring(4 + 0);
    pieceTable.delete(8, 4);
    str = str.substring(0, 8) + str.substring(8 + 4);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 7", () => {
    let str = "\r\n\n\r";
    const pieceTree = createTextBuffer(["\r\n\n\r"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(1, 0);
    str = str.substring(0, 1) + str.substring(1 + 0);
    pieceTable.insert(3, "\n\n\n\r");
    str = str.substring(0, 3) + "\n\n\n\r" + str.substring(3);
    pieceTable.insert(7, "\n\n\r\n");
    str = str.substring(0, 7) + "\n\n\r\n" + str.substring(7);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 8", () => {
    let str = "\r\r\n\n";
    const pieceTree = createTextBuffer(["\r\r\n\n"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(4, "\r\n\n\r");
    str = str.substring(0, 4) + "\r\n\n\r" + str.substring(4);
    pieceTable.insert(7, "\n\r\r\r");
    str = str.substring(0, 7) + "\n\r\r\r" + str.substring(7);
    pieceTable.insert(11, "\n\n\r\n");
    str = str.substring(0, 11) + "\n\n\r\n" + str.substring(11);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 9", () => {
    let str = "qneW";
    const pieceTree = createTextBuffer(["qneW"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(0, "YhIl");
    str = str.substring(0, 0) + "YhIl" + str.substring(0);
    pieceTable.insert(0, "qdsm");
    str = str.substring(0, 0) + "qdsm" + str.substring(0);
    pieceTable.delete(7, 0);
    str = str.substring(0, 7) + str.substring(7 + 0);
    pieceTable.insert(12, "iiPv");
    str = str.substring(0, 12) + "iiPv" + str.substring(12);
    pieceTable.insert(9, "V\rSA");
    str = str.substring(0, 9) + "V\rSA" + str.substring(9);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random bug 10", () => {
    let str = "\n\n\n\n";
    const pieceTree = createTextBuffer(["\n\n\n\n"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.insert(3, "\n\r\n\r");
    str = str.substring(0, 3) + "\n\r\n\r" + str.substring(3);
    pieceTable.insert(2, "\n\r\n\n");
    str = str.substring(0, 2) + "\n\r\n\n" + str.substring(2);
    pieceTable.insert(0, "\n\n\r\r");
    str = str.substring(0, 0) + "\n\n\r\r" + str.substring(0);
    pieceTable.insert(3, "\r\r\r\r");
    str = str.substring(0, 3) + "\r\r\r\r" + str.substring(3);
    pieceTable.insert(3, "\n\n\r\r");
    str = str.substring(0, 3) + "\n\n\r\r" + str.substring(3);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random chunk bug 1", () => {
    const pieceTree = createTextBuffer(["\n\r\r\n\n\n\r\n\r"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = "\n\r\r\n\n\n\r\n\r";
    pieceTable.delete(0, 2);
    str = str.substring(0, 0) + str.substring(0 + 2);
    pieceTable.insert(1, "\r\r\n\n");
    str = str.substring(0, 1) + "\r\r\n\n" + str.substring(1);
    pieceTable.insert(7, "\r\r\r\r");
    str = str.substring(0, 7) + "\r\r\r\r" + str.substring(7);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random chunk bug 2", () => {
    const pieceTree = createTextBuffer([
      "\n\r\n\n\n\r\n\r\n\r\r\n\n\n\r\r\n\r\n"
    ], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = "\n\r\n\n\n\r\n\r\n\r\r\n\n\n\r\r\n\r\n";
    pieceTable.insert(16, "\r\n\r\r");
    str = str.substring(0, 16) + "\r\n\r\r" + str.substring(16);
    pieceTable.insert(13, "\n\n\r\r");
    str = str.substring(0, 13) + "\n\n\r\r" + str.substring(13);
    pieceTable.insert(19, "\n\n\r\n");
    str = str.substring(0, 19) + "\n\n\r\n" + str.substring(19);
    pieceTable.delete(5, 0);
    str = str.substring(0, 5) + str.substring(5 + 0);
    pieceTable.delete(11, 2);
    str = str.substring(0, 11) + str.substring(11 + 2);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random chunk bug 3", () => {
    const pieceTree = createTextBuffer(["\r\n\n\n\n\n\n\r\n"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = "\r\n\n\n\n\n\n\r\n";
    pieceTable.insert(4, "\n\n\r\n\r\r\n\n\r");
    str = str.substring(0, 4) + "\n\n\r\n\r\r\n\n\r" + str.substring(4);
    pieceTable.delete(4, 4);
    str = str.substring(0, 4) + str.substring(4 + 4);
    pieceTable.insert(11, "\r\n\r\n\n\r\r\n\n");
    str = str.substring(0, 11) + "\r\n\r\n\n\r\r\n\n" + str.substring(11);
    pieceTable.delete(1, 2);
    str = str.substring(0, 1) + str.substring(1 + 2);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random chunk bug 4", () => {
    const pieceTree = createTextBuffer(["\n\r\n\r"], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = "\n\r\n\r";
    pieceTable.insert(4, "\n\n\r\n");
    str = str.substring(0, 4) + "\n\n\r\n" + str.substring(4);
    pieceTable.insert(3, "\r\n\n\n");
    str = str.substring(0, 3) + "\r\n\n\n" + str.substring(3);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    testLineStarts(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
});
suite("random is unsupervised", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("splitting large change buffer", function() {
    const pieceTree = createTextBuffer([""], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = "";
    pieceTable.insert(0, "WUZ\nXVZY\n");
    str = str.substring(0, 0) + "WUZ\nXVZY\n" + str.substring(0);
    pieceTable.insert(8, "\r\r\nZXUWVW");
    str = str.substring(0, 8) + "\r\r\nZXUWVW" + str.substring(8);
    pieceTable.delete(10, 7);
    str = str.substring(0, 10) + str.substring(10 + 7);
    pieceTable.delete(10, 1);
    str = str.substring(0, 10) + str.substring(10 + 1);
    pieceTable.insert(4, "VX\r\r\nWZVZ");
    str = str.substring(0, 4) + "VX\r\r\nWZVZ" + str.substring(4);
    pieceTable.delete(11, 3);
    str = str.substring(0, 11) + str.substring(11 + 3);
    pieceTable.delete(12, 4);
    str = str.substring(0, 12) + str.substring(12 + 4);
    pieceTable.delete(8, 0);
    str = str.substring(0, 8) + str.substring(8 + 0);
    pieceTable.delete(10, 2);
    str = str.substring(0, 10) + str.substring(10 + 2);
    pieceTable.insert(0, "VZXXZYZX\r");
    str = str.substring(0, 0) + "VZXXZYZX\r" + str.substring(0);
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    testLineStarts(str, pieceTable);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random insert delete", function() {
    this.timeout(5e5);
    let str = "";
    const pieceTree = createTextBuffer([str], false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    for (let i = 0; i < 1e3; i++) {
      if (Math.random() < 0.6) {
        const text = randomStr(100);
        const pos = randomInt(str.length + 1);
        pieceTable.insert(pos, text);
        str = str.substring(0, pos) + text + str.substring(pos);
      } else {
        const pos = randomInt(str.length);
        const length = Math.min(
          str.length - pos,
          Math.floor(Math.random() * 10)
        );
        pieceTable.delete(pos, length);
        str = str.substring(0, pos) + str.substring(pos + length);
      }
    }
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    testLineStarts(str, pieceTable);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random chunks", function() {
    this.timeout(5e5);
    const chunks = [];
    for (let i = 0; i < 5; i++) {
      chunks.push(randomStr(1e3));
    }
    const pieceTree = createTextBuffer(chunks, false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = chunks.join("");
    for (let i = 0; i < 1e3; i++) {
      if (Math.random() < 0.6) {
        const text = randomStr(100);
        const pos = randomInt(str.length + 1);
        pieceTable.insert(pos, text);
        str = str.substring(0, pos) + text + str.substring(pos);
      } else {
        const pos = randomInt(str.length);
        const length = Math.min(
          str.length - pos,
          Math.floor(Math.random() * 10)
        );
        pieceTable.delete(pos, length);
        str = str.substring(0, pos) + str.substring(pos + length);
      }
    }
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    testLineStarts(str, pieceTable);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("random chunks 2", function() {
    this.timeout(5e5);
    const chunks = [];
    chunks.push(randomStr(1e3));
    const pieceTree = createTextBuffer(chunks, false);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = chunks.join("");
    for (let i = 0; i < 50; i++) {
      if (Math.random() < 0.6) {
        const text = randomStr(30);
        const pos = randomInt(str.length + 1);
        pieceTable.insert(pos, text);
        str = str.substring(0, pos) + text + str.substring(pos);
      } else {
        const pos = randomInt(str.length);
        const length = Math.min(
          str.length - pos,
          Math.floor(Math.random() * 10)
        );
        pieceTable.delete(pos, length);
        str = str.substring(0, pos) + str.substring(pos + length);
      }
      testLinesContent(str, pieceTable);
    }
    assert.strictEqual(pieceTable.getLinesRawContent(), str);
    testLineStarts(str, pieceTable);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
});
suite("buffer api", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("equal", () => {
    const a = createTextBuffer(["abc"]);
    const b = createTextBuffer(["ab", "c"]);
    const c = createTextBuffer(["abd"]);
    const d = createTextBuffer(["abcd"]);
    ds.add(a);
    ds.add(b);
    ds.add(c);
    ds.add(d);
    assert(a.getPieceTree().equal(b.getPieceTree()));
    assert(!a.getPieceTree().equal(c.getPieceTree()));
    assert(!a.getPieceTree().equal(d.getPieceTree()));
  });
  test("equal with more chunks", () => {
    const a = createTextBuffer(["ab", "cd", "e"]);
    const b = createTextBuffer(["ab", "c", "de"]);
    ds.add(a);
    ds.add(b);
    assert(a.getPieceTree().equal(b.getPieceTree()));
  });
  test("equal 2, empty buffer", () => {
    const a = createTextBuffer([""]);
    const b = createTextBuffer([""]);
    ds.add(a);
    ds.add(b);
    assert(a.getPieceTree().equal(b.getPieceTree()));
  });
  test("equal 3, empty buffer", () => {
    const a = createTextBuffer(["a"]);
    const b = createTextBuffer([""]);
    ds.add(a);
    ds.add(b);
    assert(!a.getPieceTree().equal(b.getPieceTree()));
  });
  test("getLineCharCode - issue #45735", () => {
    const pieceTree = createTextBuffer(["LINE1\nline2"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    assert.strictEqual(pieceTable.getLineCharCode(1, 0), "L".charCodeAt(0), "L");
    assert.strictEqual(pieceTable.getLineCharCode(1, 1), "I".charCodeAt(0), "I");
    assert.strictEqual(pieceTable.getLineCharCode(1, 2), "N".charCodeAt(0), "N");
    assert.strictEqual(pieceTable.getLineCharCode(1, 3), "E".charCodeAt(0), "E");
    assert.strictEqual(pieceTable.getLineCharCode(1, 4), "1".charCodeAt(0), "1");
    assert.strictEqual(pieceTable.getLineCharCode(1, 5), "\n".charCodeAt(0), "\\n");
    assert.strictEqual(pieceTable.getLineCharCode(2, 0), "l".charCodeAt(0), "l");
    assert.strictEqual(pieceTable.getLineCharCode(2, 1), "i".charCodeAt(0), "i");
    assert.strictEqual(pieceTable.getLineCharCode(2, 2), "n".charCodeAt(0), "n");
    assert.strictEqual(pieceTable.getLineCharCode(2, 3), "e".charCodeAt(0), "e");
    assert.strictEqual(pieceTable.getLineCharCode(2, 4), "2".charCodeAt(0), "2");
  });
  test("getLineCharCode - issue #47733", () => {
    const pieceTree = createTextBuffer(["", "LINE1\n", "line2"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    assert.strictEqual(pieceTable.getLineCharCode(1, 0), "L".charCodeAt(0), "L");
    assert.strictEqual(pieceTable.getLineCharCode(1, 1), "I".charCodeAt(0), "I");
    assert.strictEqual(pieceTable.getLineCharCode(1, 2), "N".charCodeAt(0), "N");
    assert.strictEqual(pieceTable.getLineCharCode(1, 3), "E".charCodeAt(0), "E");
    assert.strictEqual(pieceTable.getLineCharCode(1, 4), "1".charCodeAt(0), "1");
    assert.strictEqual(pieceTable.getLineCharCode(1, 5), "\n".charCodeAt(0), "\\n");
    assert.strictEqual(pieceTable.getLineCharCode(2, 0), "l".charCodeAt(0), "l");
    assert.strictEqual(pieceTable.getLineCharCode(2, 1), "i".charCodeAt(0), "i");
    assert.strictEqual(pieceTable.getLineCharCode(2, 2), "n".charCodeAt(0), "n");
    assert.strictEqual(pieceTable.getLineCharCode(2, 3), "e".charCodeAt(0), "e");
    assert.strictEqual(pieceTable.getLineCharCode(2, 4), "2".charCodeAt(0), "2");
  });
  test("getNearestChunk", () => {
    const pieceTree = createTextBuffer(["012345678"]);
    ds.add(pieceTree);
    const pt = pieceTree.getPieceTree();
    pt.insert(3, "ABC");
    assert.equal(pt.getLineContent(1), "012ABC345678");
    assert.equal(pt.getNearestChunk(3), "ABC");
    assert.equal(pt.getNearestChunk(6), "345678");
    pt.delete(9, 1);
    assert.equal(pt.getLineContent(1), "012ABC34578");
    assert.equal(pt.getNearestChunk(6), "345");
    assert.equal(pt.getNearestChunk(9), "78");
  });
});
suite("search offset cache", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("render white space exception", () => {
    const pieceTree = createTextBuffer(["class Name{\n	\n			get() {\n\n			}\n		}"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = "class Name{\n	\n			get() {\n\n			}\n		}";
    pieceTable.insert(12, "s");
    str = str.substring(0, 12) + "s" + str.substring(12);
    pieceTable.insert(13, "e");
    str = str.substring(0, 13) + "e" + str.substring(13);
    pieceTable.insert(14, "t");
    str = str.substring(0, 14) + "t" + str.substring(14);
    pieceTable.insert(15, "()");
    str = str.substring(0, 15) + "()" + str.substring(15);
    pieceTable.delete(16, 1);
    str = str.substring(0, 16) + str.substring(16 + 1);
    pieceTable.insert(17, "()");
    str = str.substring(0, 17) + "()" + str.substring(17);
    pieceTable.delete(18, 1);
    str = str.substring(0, 18) + str.substring(18 + 1);
    pieceTable.insert(18, "}");
    str = str.substring(0, 18) + "}" + str.substring(18);
    pieceTable.insert(12, "\n");
    str = str.substring(0, 12) + "\n" + str.substring(12);
    pieceTable.delete(12, 1);
    str = str.substring(0, 12) + str.substring(12 + 1);
    pieceTable.delete(18, 1);
    str = str.substring(0, 18) + str.substring(18 + 1);
    pieceTable.insert(18, "}");
    str = str.substring(0, 18) + "}" + str.substring(18);
    pieceTable.delete(17, 2);
    str = str.substring(0, 17) + str.substring(17 + 2);
    pieceTable.delete(16, 1);
    str = str.substring(0, 16) + str.substring(16 + 1);
    pieceTable.insert(16, ")");
    str = str.substring(0, 16) + ")" + str.substring(16);
    pieceTable.delete(15, 2);
    str = str.substring(0, 15) + str.substring(15 + 2);
    const content = pieceTable.getLinesRawContent();
    assert(content === str);
  });
  test("Line breaks replacement is not necessary when EOL is normalized", () => {
    const pieceTree = createTextBuffer(["abc"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = "abc";
    pieceTable.insert(3, "def\nabc");
    str = str + "def\nabc";
    testLineStarts(str, pieceTable);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("Line breaks replacement is not necessary when EOL is normalized 2", () => {
    const pieceTree = createTextBuffer(["abc\n"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = "abc\n";
    pieceTable.insert(4, "def\nabc");
    str = str + "def\nabc";
    testLineStarts(str, pieceTable);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("Line breaks replacement is not necessary when EOL is normalized 3", () => {
    const pieceTree = createTextBuffer(["abc\n"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = "abc\n";
    pieceTable.insert(2, "def\nabc");
    str = str.substring(0, 2) + "def\nabc" + str.substring(2);
    testLineStarts(str, pieceTable);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
  test("Line breaks replacement is not necessary when EOL is normalized 4", () => {
    const pieceTree = createTextBuffer(["abc\n"]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    let str = "abc\n";
    pieceTable.insert(3, "def\nabc");
    str = str.substring(0, 3) + "def\nabc" + str.substring(3);
    testLineStarts(str, pieceTable);
    testLinesContent(str, pieceTable);
    assertTreeInvariants(pieceTable);
  });
});
function getValueInSnapshot(snapshot) {
  let ret = "";
  let tmp = snapshot.read();
  while (tmp !== null) {
    ret += tmp;
    tmp = snapshot.read();
  }
  return ret;
}
suite("snapshot", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("bug #45564, piece tree pieces should be immutable", () => {
    const model = createTextModel("\n");
    model.applyEdits([
      {
        range: new Range(2, 1, 2, 1),
        text: "!"
      }
    ]);
    const snapshot = model.createSnapshot();
    const snapshot1 = model.createSnapshot();
    assert.strictEqual(model.getLinesContent().join("\n"), getValueInSnapshot(snapshot));
    model.applyEdits([
      {
        range: new Range(2, 1, 2, 2),
        text: ""
      }
    ]);
    model.applyEdits([
      {
        range: new Range(2, 1, 2, 1),
        text: "!"
      }
    ]);
    assert.strictEqual(model.getLinesContent().join("\n"), getValueInSnapshot(snapshot1));
    model.dispose();
  });
  test("immutable snapshot 1", () => {
    const model = createTextModel("abc\ndef");
    const snapshot = model.createSnapshot();
    model.applyEdits([
      {
        range: new Range(2, 1, 2, 4),
        text: ""
      }
    ]);
    model.applyEdits([
      {
        range: new Range(1, 1, 2, 1),
        text: "abc\ndef"
      }
    ]);
    assert.strictEqual(model.getLinesContent().join("\n"), getValueInSnapshot(snapshot));
    model.dispose();
  });
  test("immutable snapshot 2", () => {
    const model = createTextModel("abc\ndef");
    const snapshot = model.createSnapshot();
    model.applyEdits([
      {
        range: new Range(2, 1, 2, 1),
        text: "!"
      }
    ]);
    model.applyEdits([
      {
        range: new Range(2, 1, 2, 2),
        text: ""
      }
    ]);
    assert.strictEqual(model.getLinesContent().join("\n"), getValueInSnapshot(snapshot));
    model.dispose();
  });
  test("immutable snapshot 3", () => {
    const model = createTextModel("abc\ndef");
    model.applyEdits([
      {
        range: new Range(2, 4, 2, 4),
        text: "!"
      }
    ]);
    const snapshot = model.createSnapshot();
    model.applyEdits([
      {
        range: new Range(2, 5, 2, 5),
        text: "!"
      }
    ]);
    assert.notStrictEqual(model.getLinesContent().join("\n"), getValueInSnapshot(snapshot));
    model.dispose();
  });
});
suite("chunk based search", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("#45892. For some cases, the buffer is empty but we still try to search", () => {
    const pieceTree = createTextBuffer([""]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(0, 1);
    const ret = pieceTree.findMatchesLineByLine(new Range(1, 1, 1, 1), new SearchData(/abc/, new WordCharacterClassifier(",./", []), "abc"), true, 1e3);
    assert.strictEqual(ret.length, 0);
  });
  test("#45770. FindInNode should not cross node boundary.", () => {
    const pieceTree = createTextBuffer([
      [
        "balabalababalabalababalabalaba",
        "balabalababalabalababalabalaba",
        "",
        "* [ ] task1",
        "* [x] task2 balabalaba",
        "* [ ] task 3"
      ].join("\n")
    ]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(0, 62);
    pieceTable.delete(16, 1);
    pieceTable.insert(16, " ");
    const ret = pieceTable.findMatchesLineByLine(new Range(1, 1, 4, 13), new SearchData(/\[/gi, new WordCharacterClassifier(",./", []), "["), true, 1e3);
    assert.strictEqual(ret.length, 3);
    assert.deepStrictEqual(ret[0].range, new Range(2, 3, 2, 4));
    assert.deepStrictEqual(ret[1].range, new Range(3, 3, 3, 4));
    assert.deepStrictEqual(ret[2].range, new Range(4, 3, 4, 4));
  });
  test("search searching from the middle", () => {
    const pieceTree = createTextBuffer([
      [
        "def",
        "dbcabc"
      ].join("\n")
    ]);
    ds.add(pieceTree);
    const pieceTable = pieceTree.getPieceTree();
    pieceTable.delete(4, 1);
    let ret = pieceTable.findMatchesLineByLine(new Range(2, 3, 2, 6), new SearchData(/a/gi, null, "a"), true, 1e3);
    assert.strictEqual(ret.length, 1);
    assert.deepStrictEqual(ret[0].range, new Range(2, 3, 2, 4));
    pieceTable.delete(4, 1);
    ret = pieceTable.findMatchesLineByLine(new Range(2, 2, 2, 5), new SearchData(/a/gi, null, "a"), true, 1e3);
    assert.strictEqual(ret.length, 1);
    assert.deepStrictEqual(ret[0].range, new Range(2, 2, 2, 3));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXHBpZWNlVHJlZVRleHRCdWZmZXJcXHBpZWNlVHJlZVRleHRCdWZmZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvd29yZENoYXJhY3RlckNsYXNzaWZpZXIuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IERlZmF1bHRFbmRPZkxpbmUsIElUZXh0U25hcHNob3QsIFNlYXJjaERhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgUGllY2VUcmVlQmFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9waWVjZVRyZWVUZXh0QnVmZmVyL3BpZWNlVHJlZUJhc2UuanMnO1xuaW1wb3J0IHsgUGllY2VUcmVlVGV4dEJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9waWVjZVRyZWVUZXh0QnVmZmVyL3BpZWNlVHJlZVRleHRCdWZmZXIuanMnO1xuaW1wb3J0IHsgUGllY2VUcmVlVGV4dEJ1ZmZlckJ1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvcGllY2VUcmVlVGV4dEJ1ZmZlci9waWVjZVRyZWVUZXh0QnVmZmVyQnVpbGRlci5qcyc7XG5pbXBvcnQgeyBOb2RlQ29sb3IsIFNFTlRJTkVMLCBUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9waWVjZVRyZWVUZXh0QnVmZmVyL3JiVHJlZUJhc2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBzcGxpdExpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuY29uc3QgYWxwaGFiZXQgPSAnYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWlxcclxcbic7XG5cbmZ1bmN0aW9uIHJhbmRvbUNoYXIoKSB7XG5cdHJldHVybiBhbHBoYWJldFtyYW5kb21JbnQoYWxwaGFiZXQubGVuZ3RoKV07XG59XG5cbmZ1bmN0aW9uIHJhbmRvbUludChib3VuZDogbnVtYmVyKSB7XG5cdHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBib3VuZCk7XG59XG5cbmZ1bmN0aW9uIHJhbmRvbVN0cihsZW46IG51bWJlcikge1xuXHRpZiAobGVuID09PSBudWxsKSB7XG5cdFx0bGVuID0gMTA7XG5cdH1cblx0cmV0dXJuIChmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGosIHJlZjtcblx0XHRjb25zdCByZXN1bHRzID0gW107XG5cdFx0Zm9yIChcblx0XHRcdGogPSAxLCByZWYgPSBsZW47XG5cdFx0XHQxIDw9IHJlZiA/IGogPCByZWYgOiBqID4gcmVmO1xuXHRcdFx0MSA8PSByZWYgPyBqKysgOiBqLS1cblx0XHQpIHtcblx0XHRcdHJlc3VsdHMucHVzaChyYW5kb21DaGFyKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fSkoKS5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gdHJpbUxpbmVGZWVkKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICh0ZXh0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0aWYgKHRleHQubGVuZ3RoID09PSAxKSB7XG5cdFx0aWYgKFxuXHRcdFx0dGV4dC5jaGFyQ29kZUF0KHRleHQubGVuZ3RoIC0gMSkgPT09IDEwIHx8XG5cdFx0XHR0ZXh0LmNoYXJDb2RlQXQodGV4dC5sZW5ndGggLSAxKSA9PT0gMTNcblx0XHQpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH1cblxuXHRpZiAodGV4dC5jaGFyQ29kZUF0KHRleHQubGVuZ3RoIC0gMSkgPT09IDEwKSB7XG5cdFx0aWYgKHRleHQuY2hhckNvZGVBdCh0ZXh0Lmxlbmd0aCAtIDIpID09PSAxMykge1xuXHRcdFx0cmV0dXJuIHRleHQuc2xpY2UoMCwgLTIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGV4dC5zbGljZSgwLCAtMSk7XG5cdH1cblxuXHRpZiAodGV4dC5jaGFyQ29kZUF0KHRleHQubGVuZ3RoIC0gMSkgPT09IDEzKSB7XG5cdFx0cmV0dXJuIHRleHQuc2xpY2UoMCwgLTEpO1xuXHR9XG5cblx0cmV0dXJuIHRleHQ7XG59XG5cbi8vI3JlZ2lvbiBBc3NlcnRpb25cblxuZnVuY3Rpb24gdGVzdExpbmVzQ29udGVudChzdHI6IHN0cmluZywgcGllY2VUYWJsZTogUGllY2VUcmVlQmFzZSkge1xuXHRjb25zdCBsaW5lcyA9IHNwbGl0TGluZXMoc3RyKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNvdW50KCksIGxpbmVzLmxlbmd0aCk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVzUmF3Q29udGVudCgpLCBzdHIpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNvbnRlbnQoaSArIDEpLCBsaW5lc1tpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0dHJpbUxpbmVGZWVkKFxuXHRcdFx0XHRwaWVjZVRhYmxlLmdldFZhbHVlSW5SYW5nZShcblx0XHRcdFx0XHRuZXcgUmFuZ2UoXG5cdFx0XHRcdFx0XHRpICsgMSxcblx0XHRcdFx0XHRcdDEsXG5cdFx0XHRcdFx0XHRpICsgMSxcblx0XHRcdFx0XHRcdGxpbmVzW2ldLmxlbmd0aCArIChpID09PSBsaW5lcy5sZW5ndGggLSAxID8gMSA6IDIpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpXG5cdFx0XHQpLFxuXHRcdFx0bGluZXNbaV1cblx0XHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRlc3RMaW5lU3RhcnRzKHN0cjogc3RyaW5nLCBwaWVjZVRhYmxlOiBQaWVjZVRyZWVCYXNlKSB7XG5cdGNvbnN0IGxpbmVTdGFydHMgPSBbMF07XG5cblx0Ly8gUmVzZXQgcmVnZXggdG8gc2VhcmNoIGZyb20gdGhlIGJlZ2lubmluZ1xuXHRjb25zdCBfcmVnZXggPSBuZXcgUmVnRXhwKC9cXHJcXG58XFxyfFxcbi9nKTtcblx0X3JlZ2V4Lmxhc3RJbmRleCA9IDA7XG5cdGxldCBwcmV2TWF0Y2hTdGFydEluZGV4ID0gLTE7XG5cdGxldCBwcmV2TWF0Y2hMZW5ndGggPSAwO1xuXG5cdGxldCBtOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXHRkbyB7XG5cdFx0aWYgKHByZXZNYXRjaFN0YXJ0SW5kZXggKyBwcmV2TWF0Y2hMZW5ndGggPT09IHN0ci5sZW5ndGgpIHtcblx0XHRcdC8vIFJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgbGluZVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0bSA9IF9yZWdleC5leGVjKHN0cik7XG5cdFx0aWYgKCFtKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRjb25zdCBtYXRjaFN0YXJ0SW5kZXggPSBtLmluZGV4O1xuXHRcdGNvbnN0IG1hdGNoTGVuZ3RoID0gbVswXS5sZW5ndGg7XG5cblx0XHRpZiAoXG5cdFx0XHRtYXRjaFN0YXJ0SW5kZXggPT09IHByZXZNYXRjaFN0YXJ0SW5kZXggJiZcblx0XHRcdG1hdGNoTGVuZ3RoID09PSBwcmV2TWF0Y2hMZW5ndGhcblx0XHQpIHtcblx0XHRcdC8vIEV4aXQgZWFybHkgaWYgdGhlIHJlZ2V4IG1hdGNoZXMgdGhlIHNhbWUgcmFuZ2UgdHdpY2Vcblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHByZXZNYXRjaFN0YXJ0SW5kZXggPSBtYXRjaFN0YXJ0SW5kZXg7XG5cdFx0cHJldk1hdGNoTGVuZ3RoID0gbWF0Y2hMZW5ndGg7XG5cblx0XHRsaW5lU3RhcnRzLnB1c2gobWF0Y2hTdGFydEluZGV4ICsgbWF0Y2hMZW5ndGgpO1xuXHR9IHdoaWxlIChtKTtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVTdGFydHMubGVuZ3RoOyBpKyspIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KGxpbmVTdGFydHNbaV0pLFxuXHRcdFx0bmV3IFBvc2l0aW9uKGkgKyAxLCAxKVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoaSArIDEsIDEpLCBsaW5lU3RhcnRzW2ldKTtcblx0fVxuXG5cdGZvciAobGV0IGkgPSAxOyBpIDwgbGluZVN0YXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IHBvcyA9IHBpZWNlVGFibGUuZ2V0UG9zaXRpb25BdChsaW5lU3RhcnRzW2ldIC0gMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cGllY2VUYWJsZS5nZXRPZmZzZXRBdChwb3MubGluZU51bWJlciwgcG9zLmNvbHVtbiksXG5cdFx0XHRsaW5lU3RhcnRzW2ldIC0gMVxuXHRcdCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlVGV4dEJ1ZmZlcih2YWw6IHN0cmluZ1tdLCBub3JtYWxpemVFT0w6IGJvb2xlYW4gPSB0cnVlKTogUGllY2VUcmVlVGV4dEJ1ZmZlciB7XG5cdGNvbnN0IGJ1ZmZlckJ1aWxkZXIgPSBuZXcgUGllY2VUcmVlVGV4dEJ1ZmZlckJ1aWxkZXIoKTtcblx0Zm9yIChjb25zdCBjaHVuayBvZiB2YWwpIHtcblx0XHRidWZmZXJCdWlsZGVyLmFjY2VwdENodW5rKGNodW5rKTtcblx0fVxuXHRjb25zdCBmYWN0b3J5ID0gYnVmZmVyQnVpbGRlci5maW5pc2gobm9ybWFsaXplRU9MKTtcblx0cmV0dXJuICg8UGllY2VUcmVlVGV4dEJ1ZmZlcj5mYWN0b3J5LmNyZWF0ZShEZWZhdWx0RW5kT2ZMaW5lLkxGKS50ZXh0QnVmZmVyKTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0VHJlZUludmFyaWFudHMoVDogUGllY2VUcmVlQmFzZSk6IHZvaWQge1xuXHRhc3NlcnQoU0VOVElORUwuY29sb3IgPT09IE5vZGVDb2xvci5CbGFjayk7XG5cdGFzc2VydChTRU5USU5FTC5wYXJlbnQgPT09IFNFTlRJTkVMKTtcblx0YXNzZXJ0KFNFTlRJTkVMLmxlZnQgPT09IFNFTlRJTkVMKTtcblx0YXNzZXJ0KFNFTlRJTkVMLnJpZ2h0ID09PSBTRU5USU5FTCk7XG5cdGFzc2VydChTRU5USU5FTC5zaXplX2xlZnQgPT09IDApO1xuXHRhc3NlcnQoU0VOVElORUwubGZfbGVmdCA9PT0gMCk7XG5cdGFzc2VydFZhbGlkVHJlZShUKTtcbn1cblxuZnVuY3Rpb24gZGVwdGgobjogVHJlZU5vZGUpOiBudW1iZXIge1xuXHRpZiAobiA9PT0gU0VOVElORUwpIHtcblx0XHQvLyBUaGUgbGVhZnMgYXJlIGJsYWNrXG5cdFx0cmV0dXJuIDE7XG5cdH1cblx0YXNzZXJ0KGRlcHRoKG4ubGVmdCkgPT09IGRlcHRoKG4ucmlnaHQpKTtcblx0cmV0dXJuIChuLmNvbG9yID09PSBOb2RlQ29sb3IuQmxhY2sgPyAxIDogMCkgKyBkZXB0aChuLmxlZnQpO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRWYWxpZE5vZGUobjogVHJlZU5vZGUpOiB7IHNpemU6IG51bWJlcjsgbGZfY250OiBudW1iZXIgfSB7XG5cdGlmIChuID09PSBTRU5USU5FTCkge1xuXHRcdHJldHVybiB7IHNpemU6IDAsIGxmX2NudDogMCB9O1xuXHR9XG5cblx0Y29uc3QgbCA9IG4ubGVmdDtcblx0Y29uc3QgciA9IG4ucmlnaHQ7XG5cblx0aWYgKG4uY29sb3IgPT09IE5vZGVDb2xvci5SZWQpIHtcblx0XHRhc3NlcnQobC5jb2xvciA9PT0gTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRhc3NlcnQoci5jb2xvciA9PT0gTm9kZUNvbG9yLkJsYWNrKTtcblx0fVxuXG5cdGNvbnN0IGFjdHVhbExlZnQgPSBhc3NlcnRWYWxpZE5vZGUobCk7XG5cdGFzc2VydChhY3R1YWxMZWZ0LmxmX2NudCA9PT0gbi5sZl9sZWZ0KTtcblx0YXNzZXJ0KGFjdHVhbExlZnQuc2l6ZSA9PT0gbi5zaXplX2xlZnQpO1xuXHRjb25zdCBhY3R1YWxSaWdodCA9IGFzc2VydFZhbGlkTm9kZShyKTtcblxuXHRyZXR1cm4geyBzaXplOiBuLnNpemVfbGVmdCArIG4ucGllY2UubGVuZ3RoICsgYWN0dWFsUmlnaHQuc2l6ZSwgbGZfY250OiBuLmxmX2xlZnQgKyBuLnBpZWNlLmxpbmVGZWVkQ250ICsgYWN0dWFsUmlnaHQubGZfY250IH07XG59XG5cbmZ1bmN0aW9uIGFzc2VydFZhbGlkVHJlZShUOiBQaWVjZVRyZWVCYXNlKTogdm9pZCB7XG5cdGlmIChULnJvb3QgPT09IFNFTlRJTkVMKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGFzc2VydChULnJvb3QuY29sb3IgPT09IE5vZGVDb2xvci5CbGFjayk7XG5cdGFzc2VydChkZXB0aChULnJvb3QubGVmdCkgPT09IGRlcHRoKFQucm9vdC5yaWdodCkpO1xuXHRhc3NlcnRWYWxpZE5vZGUoVC5yb290KTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbnN1aXRlKCdpbnNlcnRzIGFuZCBkZWxldGVzJywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Jhc2ljIGluc2VydC9kZWxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbXG5cdFx0XHQnVGhpcyBpcyBhIGRvY3VtZW50IHdpdGggc29tZSB0ZXh0Lidcblx0XHRdKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMzQsICdUaGlzIGlzIHNvbWUgbW9yZSB0ZXh0IHRvIGluc2VydCBhdCBvZmZzZXQgMzQuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSxcblx0XHRcdCdUaGlzIGlzIGEgZG9jdW1lbnQgd2l0aCBzb21lIHRleHQuVGhpcyBpcyBzb21lIG1vcmUgdGV4dCB0byBpbnNlcnQgYXQgb2Zmc2V0IDM0Lidcblx0XHQpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDQyLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwaWVjZVRhYmxlLmdldExpbmVzUmF3Q29udGVudCgpLFxuXHRcdFx0J1RoaXMgaXMgYSBkb2N1bWVudCB3aXRoIHNvbWUgdGV4dC5UaGlzIGlzIG1vcmUgdGV4dCB0byBpbnNlcnQgYXQgb2Zmc2V0IDM0Lidcblx0XHQpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3JlIGluc2VydHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwdCA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRwdC5pbnNlcnQoMCwgJ0FBQScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwdC5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgJ0FBQScpO1xuXHRcdHB0Lmluc2VydCgwLCAnQkJCJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHB0LmdldExpbmVzUmF3Q29udGVudCgpLCAnQkJCQUFBJyk7XG5cdFx0cHQuaW5zZXJ0KDYsICdDQ0MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHQuZ2V0TGluZXNSYXdDb250ZW50KCksICdCQkJBQUFDQ0MnKTtcblx0XHRwdC5pbnNlcnQoNSwgJ0RERCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwdC5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgJ0JCQkFBREREQUNDQycpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHB0KTtcblx0fSk7XG5cblx0dGVzdCgnbW9yZSBkZWxldGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWycwMTIzNDU2NzgnXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcHQgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRwdC5kZWxldGUoOCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHB0LmdldExpbmVzUmF3Q29udGVudCgpLCAnMDEyMzQ1NjcnKTtcblx0XHRwdC5kZWxldGUoMCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHB0LmdldExpbmVzUmF3Q29udGVudCgpLCAnMTIzNDU2NycpO1xuXHRcdHB0LmRlbGV0ZSg1LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHQuZ2V0TGluZXNSYXdDb250ZW50KCksICcxMjM0NTcnKTtcblx0XHRwdC5kZWxldGUoNSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHB0LmdldExpbmVzUmF3Q29udGVudCgpLCAnMTIzNDUnKTtcblx0XHRwdC5kZWxldGUoMCwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHB0LmdldExpbmVzUmF3Q29udGVudCgpLCAnJyk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5kb20gdGVzdCAxJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnY2VMUEhtRnp2Q3RGZUhrQ0JlaiAnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ2NlTFBIbUZ6dkN0RmVIa0NCZWogJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoOCwgJ2dEQ0VmTllpQlVOa1N3dHZCIEsgJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA4KSArICdnRENFZk5ZaUJVTmtTd3R2QiBLICcgKyBzdHIuc3Vic3RyaW5nKDgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVzUmF3Q29udGVudCgpLCBzdHIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDM4LCAnY3lOY0h4ak5QUG9laEJKbGRMUyAnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDM4KSArICdjeU5jSHhqTlBQb2VoQkpsZExTICcgKyBzdHIuc3Vic3RyaW5nKDM4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgc3RyKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg1OSwgJ2VqTXhcXG5PVGdXbGJwZURFeGpPayAnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDU5KSArICdlak14XFxuT1RnV2xicGVERXhqT2sgJyArIHN0ci5zdWJzdHJpbmcoNTkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSB0ZXN0IDInLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICcnO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWycnXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnVmdQRyAnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1ZnUEcgJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMiwgJ0RkV0YgJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAyKSArICdEZFdGICcgKyBzdHIuc3Vic3RyaW5nKDIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdoVUpjICcpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnaFVKYyAnICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg4LCAnbFFFcSAnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDgpICsgJ2xRRXEgJyArIHN0ci5zdWJzdHJpbmcoOCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTAsICdHYnRwICcpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTApICsgJ0didHAgJyArIHN0ci5zdWJzdHJpbmcoMTApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSB0ZXN0IDMnLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICcnO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWycnXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnZ1lTeicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnZ1lTeicgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEsICdtRFFlJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxKSArICdtRFFlJyArIHN0ci5zdWJzdHJpbmcoMSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMSwgJ0RUTVEnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgJ0RUTVEnICsgc3RyLnN1YnN0cmluZygxKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgyLCAnR0daQicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMikgKyAnR0daQicgKyBzdHIuc3Vic3RyaW5nKDIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEyLCAnd1hwcScpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTIpICsgJ3dYcHEnICsgc3RyLnN1YnN0cmluZygxMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSBkZWxldGUgMScsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ3ZmYicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAndmZiJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ3pScScpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnelJxJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg1LCAxKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDUpICsgc3RyLnN1YnN0cmluZyg1ICsgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgxLCAnVU53Jyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxKSArICdVTncnICsgc3RyLnN1YnN0cmluZygxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgc3RyKTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDQsIDMpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNCkgKyBzdHIuc3Vic3RyaW5nKDQgKyAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgc3RyKTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDEsIDQpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMSkgKyBzdHIuc3Vic3RyaW5nKDEgKyA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgc3RyKTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDAsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyBzdHIuc3Vic3RyaW5nKDAgKyAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgc3RyKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIGRlbGV0ZSAyJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnSURUJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdJRFQnICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnd3dBJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICd3d0EnICsgc3RyLnN1YnN0cmluZygzKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnR25yJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdHbnInICsgc3RyLnN1YnN0cmluZygzKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg2LCAzKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDYpICsgc3RyLnN1YnN0cmluZyg2ICsgMyk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNCwgJ2VIcCcpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNCkgKyAnZUhwJyArIHN0ci5zdWJzdHJpbmcoNCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMSwgJ1VBaScpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMSkgKyAnVUFpJyArIHN0ci5zdWJzdHJpbmcoMSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMiwgJ0ZyUicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMikgKyAnRnJSJyArIHN0ci5zdWJzdHJpbmcoMik7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNiwgNyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA2KSArIHN0ci5zdWJzdHJpbmcoNiArIDcpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDMsIDUpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyBzdHIuc3Vic3RyaW5nKDMgKyA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgc3RyKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIGRlbGV0ZSAzJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ1BxTScpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnUHFNJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMSwgMik7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxKSArIHN0ci5zdWJzdHJpbmcoMSArIDIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEsICd6TGMnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgJ3pMYycgKyBzdHIuc3Vic3RyaW5nKDEpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdNRVgnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ01FWCcgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdqWmgnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ2paaCcgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDgsICdHd1EnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDgpICsgJ0d3UScgKyBzdHIuc3Vic3RyaW5nKDgpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDUsIDYpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyBzdHIuc3Vic3RyaW5nKDUgKyA2KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg0LCAna3R3Jyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA0KSArICdrdHcnICsgc3RyLnN1YnN0cmluZyg0KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg1LCAnR1Z1Jyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA1KSArICdHVnUnICsgc3RyLnN1YnN0cmluZyg1KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg5LCAnamRtJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA5KSArICdqZG0nICsgc3RyLnN1YnN0cmluZyg5KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxNSwgJ25hXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxNSkgKyAnbmFcXG4nICsgc3RyLnN1YnN0cmluZygxNSk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNSwgOCk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA1KSArIHN0ci5zdWJzdHJpbmcoNSArIDgpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDMsIDQpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyBzdHIuc3Vic3RyaW5nKDMgKyA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgc3RyKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIGluc2VydC9kZWxldGUgXFxcXHIgYnVnIDEnLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICdhJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnYSddKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDAsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyBzdHIuc3Vic3RyaW5nKDAgKyAxKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnXFxyXFxyXFxuXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdcXHJcXHJcXG5cXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgzLCAxKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDMpICsgc3RyLnN1YnN0cmluZygzICsgMSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMiwgJ1xcblxcblxccmEnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgJ1xcblxcblxccmEnICsgc3RyLnN1YnN0cmluZygyKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg0LCAzKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgc3RyLnN1YnN0cmluZyg0ICsgMyk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMiwgJ1xcbmFcXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgJ1xcbmFcXHJcXHInICsgc3RyLnN1YnN0cmluZygyKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg2LCAnXFxyYVxcblxcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNikgKyAnXFxyYVxcblxcbicgKyBzdHIuc3Vic3RyaW5nKDYpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdhYVxcblxcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnYWFcXG5cXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg1LCAnXFxuXFxuYVxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyAnXFxuXFxuYVxccicgKyBzdHIuc3Vic3RyaW5nKDUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSBpbnNlcnQvZGVsZXRlIFxcXFxyIGJ1ZyAyJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnYSc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2EnXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxLCAnXFxuYWFcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgJ1xcbmFhXFxyJyArIHN0ci5zdWJzdHJpbmcoMSk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMCwgNCk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArIHN0ci5zdWJzdHJpbmcoMCArIDQpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEsICdcXHJcXHJcXG5hJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxKSArICdcXHJcXHJcXG5hJyArIHN0ci5zdWJzdHJpbmcoMSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMiwgJ1xcblxcclxccmEnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgJ1xcblxcclxccmEnICsgc3RyLnN1YnN0cmluZygyKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg0LCAxKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgc3RyLnN1YnN0cmluZyg0ICsgMSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoOCwgJ1xcclxcblxcclxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgOCkgKyAnXFxyXFxuXFxyXFxyJyArIHN0ci5zdWJzdHJpbmcoOCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNywgJ1xcblxcblxcbmEnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDcpICsgJ1xcblxcblxcbmEnICsgc3RyLnN1YnN0cmluZyg3KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxMywgJ2FcXG5cXG5hJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxMykgKyAnYVxcblxcbmEnICsgc3RyLnN1YnN0cmluZygxMyk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMTcsIDMpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTcpICsgc3RyLnN1YnN0cmluZygxNyArIDMpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDIsICdhXFxyYVxcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMikgKyAnYVxccmFcXG4nICsgc3RyLnN1YnN0cmluZygyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVzUmF3Q29udGVudCgpLCBzdHIpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5kb20gaW5zZXJ0L2RlbGV0ZSBcXFxcciBidWcgMycsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJ2EnO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWydhJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ1xcclxcbmFcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1xcclxcbmFcXHInICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgyLCAzKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgc3RyLnN1YnN0cmluZygyICsgMyk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMiwgJ2FcXHJcXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgJ2FcXHJcXG5cXHInICsgc3RyLnN1YnN0cmluZygyKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg0LCAyKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgc3RyLnN1YnN0cmluZyg0ICsgMik7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNCwgJ2FcXG5cXHJcXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgJ2FcXG5cXHJcXG4nICsgc3RyLnN1YnN0cmluZyg0KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxLCAnYWFcXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgJ2FhXFxuXFxyJyArIHN0ci5zdWJzdHJpbmcoMSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNywgJ1xcbmFcXHJcXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDcpICsgJ1xcbmFcXHJcXG4nICsgc3RyLnN1YnN0cmluZyg3KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg1LCAnXFxuXFxuYVxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyAnXFxuXFxuYVxccicgKyBzdHIuc3Vic3RyaW5nKDUpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEwLCAnXFxyXFxyXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxMCkgKyAnXFxyXFxyXFxuXFxyJyArIHN0ci5zdWJzdHJpbmcoMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVzUmF3Q29udGVudCgpLCBzdHIpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDIxLCAzKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIxKSArIHN0ci5zdWJzdHJpbmcoMjEgKyAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVzUmF3Q29udGVudCgpLCBzdHIpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5kb20gaW5zZXJ0L2RlbGV0ZSBcXFxcciBidWcgNHMnLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICdhJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnYSddKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDAsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyBzdHIuc3Vic3RyaW5nKDAgKyAxKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnXFxuYWFhJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdcXG5hYWEnICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgyLCAnXFxuXFxuYWEnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgJ1xcblxcbmFhJyArIHN0ci5zdWJzdHJpbmcoMik7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMSwgNCk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxKSArIHN0ci5zdWJzdHJpbmcoMSArIDQpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDMsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyBzdHIuc3Vic3RyaW5nKDMgKyAxKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgxLCAyKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgc3RyLnN1YnN0cmluZygxICsgMik7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMCwgMSk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArIHN0ci5zdWJzdHJpbmcoMCArIDEpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdhXFxuXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdhXFxuXFxuXFxyJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMiwgJ2FhXFxyXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAyKSArICdhYVxcclxcbicgKyBzdHIuc3Vic3RyaW5nKDIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDMsICdhXFxuYWEnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDMpICsgJ2FcXG5hYScgKyBzdHIuc3Vic3RyaW5nKDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXHR0ZXN0KCdyYW5kb20gaW5zZXJ0L2RlbGV0ZSBcXFxcciBidWcgNScsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdcXG5cXG5cXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1xcblxcblxcblxccicgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEsICdcXG5cXG5cXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgJ1xcblxcblxcblxccicgKyBzdHIuc3Vic3RyaW5nKDEpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDIsICdcXG5cXHJcXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgJ1xcblxcclxcclxccicgKyBzdHIuc3Vic3RyaW5nKDIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDgsICdcXG5cXHJcXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDgpICsgJ1xcblxcclxcblxccicgKyBzdHIuc3Vic3RyaW5nKDgpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDUsIDIpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyBzdHIuc3Vic3RyaW5nKDUgKyAyKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg0LCAnXFxuXFxyXFxyXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA0KSArICdcXG5cXHJcXHJcXHInICsgc3RyLnN1YnN0cmluZyg0KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg4LCAnXFxuXFxuXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA4KSArICdcXG5cXG5cXG5cXHInICsgc3RyLnN1YnN0cmluZyg4KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgwLCA3KTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgc3RyLnN1YnN0cmluZygwICsgNyk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMSwgJ1xcclxcblxcclxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMSkgKyAnXFxyXFxuXFxyXFxyJyArIHN0ci5zdWJzdHJpbmcoMSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTUsICdcXG5cXHJcXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE1KSArICdcXG5cXHJcXHJcXHInICsgc3RyLnN1YnN0cmluZygxNSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgc3RyKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3ByZWZpeCBzdW0gZm9yIGxpbmUgZmVlZCcsICgpID0+IHtcblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdiYXNpYycsICgpID0+IHtcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnMVxcbjJcXG4zXFxuNCddKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNvdW50KCksIDQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDApLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDEpLCBuZXcgUG9zaXRpb24oMSwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDIpLCBuZXcgUG9zaXRpb24oMiwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDMpLCBuZXcgUG9zaXRpb24oMiwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDQpLCBuZXcgUG9zaXRpb24oMywgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDUpLCBuZXcgUG9zaXRpb24oMywgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDYpLCBuZXcgUG9zaXRpb24oNCwgMSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoMSwgMSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldE9mZnNldEF0KDEsIDIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRPZmZzZXRBdCgyLCAxKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoMiwgMiksIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldE9mZnNldEF0KDMsIDEpLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRPZmZzZXRBdCgzLCAyKSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoNCwgMSksIDYpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2FcXG5iXFxuY1xcbmRlJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoOCwgJ2ZoXFxuaVxcbmprJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ291bnQoKSwgNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldFBvc2l0aW9uQXQoOSksIG5ldyBQb3NpdGlvbig0LCA0KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoMSwgMSksIDApO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2FcXG5iXFxuY1xcbmRlJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNywgJ2ZoXFxuaVxcbmprJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ291bnQoKSwgNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldFBvc2l0aW9uQXQoNiksIG5ldyBQb3NpdGlvbig0LCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldFBvc2l0aW9uQXQoNyksIG5ldyBQb3NpdGlvbig0LCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldFBvc2l0aW9uQXQoOCksIG5ldyBQb3NpdGlvbig0LCAzKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldFBvc2l0aW9uQXQoOSksIG5ldyBQb3NpdGlvbig0LCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldFBvc2l0aW9uQXQoMTIpLCBuZXcgUG9zaXRpb24oNiwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDEzKSwgbmV3IFBvc2l0aW9uKDYsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0UG9zaXRpb25BdCgxNCksIG5ldyBQb3NpdGlvbig2LCAzKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRPZmZzZXRBdCg0LCAxKSwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoNCwgMiksIDcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldE9mZnNldEF0KDQsIDMpLCA4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRPZmZzZXRBdCg0LCA0KSwgOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoNiwgMSksIDEyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRPZmZzZXRBdCg2LCAyKSwgMTMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldE9mZnNldEF0KDYsIDMpLCAxNCk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZScsICgpID0+IHtcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnYVxcbmJcXG5jXFxuZGVmaFxcbmlcXG5qayddKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNywgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgJ2FcXG5iXFxuY1xcbmRoXFxuaVxcbmprJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNvdW50KCksIDYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDYpLCBuZXcgUG9zaXRpb24oNCwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDcpLCBuZXcgUG9zaXRpb24oNCwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDgpLCBuZXcgUG9zaXRpb24oNCwgMykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDkpLCBuZXcgUG9zaXRpb24oNSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDExKSwgbmV3IFBvc2l0aW9uKDYsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0UG9zaXRpb25BdCgxMiksIG5ldyBQb3NpdGlvbig2LCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldFBvc2l0aW9uQXQoMTMpLCBuZXcgUG9zaXRpb24oNiwgMykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoNCwgMSksIDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldE9mZnNldEF0KDQsIDIpLCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRPZmZzZXRBdCg0LCAzKSwgOCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoNSwgMSksIDkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldE9mZnNldEF0KDYsIDEpLCAxMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoNiwgMiksIDEyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRPZmZzZXRBdCg2LCAzKSwgMTMpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGQrZGVsZXRlIDEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2FcXG5iXFxuY1xcbmRlJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoOCwgJ2ZoXFxuaVxcbmprJyk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNywgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgJ2FcXG5iXFxuY1xcbmRoXFxuaVxcbmprJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNvdW50KCksIDYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDYpLCBuZXcgUG9zaXRpb24oNCwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDcpLCBuZXcgUG9zaXRpb24oNCwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDgpLCBuZXcgUG9zaXRpb24oNCwgMykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDkpLCBuZXcgUG9zaXRpb24oNSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRQb3NpdGlvbkF0KDExKSwgbmV3IFBvc2l0aW9uKDYsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0UG9zaXRpb25BdCgxMiksIG5ldyBQb3NpdGlvbig2LCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldFBvc2l0aW9uQXQoMTMpLCBuZXcgUG9zaXRpb24oNiwgMykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoNCwgMSksIDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldE9mZnNldEF0KDQsIDIpLCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRPZmZzZXRBdCg0LCAzKSwgOCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoNSwgMSksIDkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldE9mZnNldEF0KDYsIDEpLCAxMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0T2Zmc2V0QXQoNiwgMiksIDEyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRPZmZzZXRBdCg2LCAzKSwgMTMpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgcmFuZG9tIGJ1ZyAxOiBwcmVmaXhTdW1Db21wdXRlci5yZW1vdmVWYWx1ZXMoc3RhcnQsIGNudCkgY250IGlzIDEgYmFzZWQuJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJyBaWCBcXG4gWlxcblpcXG4gWVpcXG5ZXFxuWlhYICcpO1xuXHRcdHN0ciA9XG5cdFx0XHRzdHIuc3Vic3RyaW5nKDAsIDApICtcblx0XHRcdCcgWlggXFxuIFpcXG5aXFxuIFlaXFxuWVxcblpYWCAnICtcblx0XHRcdHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTQsICdYIFpaXFxuWVpaWVpYWFkgWSBYWVxcbiAnKTtcblx0XHRzdHIgPVxuXHRcdFx0c3RyLnN1YnN0cmluZygwLCAxNCkgKyAnWCBaWlxcbllaWllaWFhZIFkgWFlcXG4gJyArIHN0ci5zdWJzdHJpbmcoMTQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0dGVzdExpbmVTdGFydHMoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IHJhbmRvbSBidWcgMjogcHJlZml4U3VtQ29tcHV0ZXIgaW5pdGlhbGl6ZSBkb2VzIG5vdCBkbyBkZWVwIGNvcHkgb2YgVUludDMyQXJyYXkuJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ1pZWlxcbllZIFhZXFxuWCBcXG5aIFkgXFxuWiAnKTtcblx0XHRzdHIgPVxuXHRcdFx0c3RyLnN1YnN0cmluZygwLCAwKSArICdaWVpcXG5ZWSBYWVxcblggXFxuWiBZIFxcblogJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMywgJ1hYWSBcXG5cXG5ZIFkgWVlZICBaWVhZICcpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyAnWFhZIFxcblxcblkgWSBZWVkgIFpZWFkgJyArIHN0ci5zdWJzdHJpbmcoMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lc1Jhd0NvbnRlbnQoKSwgc3RyKTtcblx0XHR0ZXN0TGluZVN0YXJ0cyhzdHIsIHBpZWNlVGFibGUpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgcmFuZG9tIGJ1ZyAxOiBJIGZvcmdvdCB0byB1cGRhdGUgdGhlIGxpbmVGZWVkQ250IHdoZW4gZGVsZXRpb24gaXMgb24gb25lIHNpbmdsZSBwaWVjZS4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdiYVxcbmFcXG5jYVxcbmJhXFxuY2JhYlxcbmNhYSAnKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxMywgJ2NjYVxcbmFhYmJcXG5jYWNcXG5jY2NcXG5hYiAnKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg1LCA4KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgzMCwgMik7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMjQsICdjYmJhY2NjYmFjXFxuYmFhYWJcXG5cXG5jICcpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDI5LCAzKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgyMywgOSk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMjEsIDUpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDMwLCAzKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnY2JcXG5hY1xcbmNcXG5cXG5hY2NcXG5iYlxcbmJcXG5jICcpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDE5LCA1KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxOCwgJ1xcbmJiXFxuXFxuYWNiY1xcbmNiYlxcbmNcXG5iYlxcbiAnKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg2NSwgJ2NiY2NiYWNcXG5iY1xcblxcbmNjYWJiYVxcbiAnKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg3NywgJ2FcXG5jYWNiXFxuXFxuYWNcXG5cXG5cXG5cXG5cXG5hYmFiICcpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDMwLCA5KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg0NSwgJ2JcXG5cXG5jXFxuYmFcXG5cXG5iYmJiYVxcblxcbmFhXFxuICcpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDgyLCAnYWJcXG5iYlxcbmNhYmFjYWJcXG5jYmNcXG5hICcpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDEyMywgOSk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNzEsIDIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDMzLCAnYWNhYVxcbmFjYlxcblxcbmFhXFxuXFxuY1xcblxcblxcblxcbiAnKTtcblxuXHRcdGNvbnN0IHN0ciA9IHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCk7XG5cdFx0dGVzdExpbmVTdGFydHMoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIHJhbmRvbSBidWcgcmIgdHJlZSAxJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFtzdHJdKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdZWFhaXFxuXFxuWVlcXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1lYWFpcXG5cXG5ZWVxcbicgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDAsIDUpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyBzdHIuc3Vic3RyaW5nKDAgKyA1KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnWlhZWVxcblhcXG5aXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdaWFlZXFxuWFxcblpcXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxMCwgJ1xcblhZXFxuWVhZWFknKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEwKSArICdcXG5YWVxcbllYWVhZJyArIHN0ci5zdWJzdHJpbmcoMTApO1xuXHRcdHRlc3RMaW5lU3RhcnRzKHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSByYW5kb20gYnVnIHJiIHRyZWUgMicsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbc3RyXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnWVhYWlxcblxcbllZXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdZWFhaXFxuXFxuWVlcXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnWlhZWVxcblhcXG5aXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdaWFlZXFxuWFxcblpcXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxMCwgJ1xcblhZXFxuWVhZWFknKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEwKSArICdcXG5YWVxcbllYWVhZJyArIHN0ci5zdWJzdHJpbmcoMTApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDgsICdZWlhZXFxuWlxcbllYJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA4KSArICdZWlhZXFxuWlxcbllYJyArIHN0ci5zdWJzdHJpbmcoOCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTIsICdYWFxcblhYWVhZWicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTIpICsgJ1hYXFxuWFhZWFlaJyArIHN0ci5zdWJzdHJpbmcoMTIpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDAsIDQpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyBzdHIuc3Vic3RyaW5nKDAgKyA0KTtcblxuXHRcdHRlc3RMaW5lU3RhcnRzKHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSByYW5kb20gYnVnIHJiIHRyZWUgMycsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbc3RyXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnWVhYWlxcblxcbllZXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdZWFhaXFxuXFxuWVlcXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg3LCAyKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDcpICsgc3RyLnN1YnN0cmluZyg3ICsgMik7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNiwgMSk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA2KSArIHN0ci5zdWJzdHJpbmcoNiArIDEpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDAsIDUpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyBzdHIuc3Vic3RyaW5nKDAgKyA1KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnWlhZWVxcblhcXG5aXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdaWFlZXFxuWFxcblpcXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxMCwgJ1xcblhZXFxuWVhZWFknKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEwKSArICdcXG5YWVxcbllYWVhZJyArIHN0ci5zdWJzdHJpbmcoMTApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDgsICdZWlhZXFxuWlxcbllYJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA4KSArICdZWlhZXFxuWlxcbllYJyArIHN0ci5zdWJzdHJpbmcoOCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTIsICdYWFxcblhYWVhZWicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTIpICsgJ1hYXFxuWFhZWFlaJyArIHN0ci5zdWJzdHJpbmcoMTIpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDAsIDQpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyBzdHIuc3Vic3RyaW5nKDAgKyA0KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgzMCwgMyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzMCkgKyBzdHIuc3Vic3RyaW5nKDMwICsgMyk7XG5cblx0XHR0ZXN0TGluZVN0YXJ0cyhzdHIsIHBpZWNlVGFibGUpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnb2Zmc2V0IDIgcG9zaXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmFuZG9tIHRlc3RzIGJ1ZyAxJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ2h1dXlZelVmS09FTndHZ1pMcW4gJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdodXV5WXpVZktPRU53R2daTHFuICcgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDE4LCAyKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE4KSArIHN0ci5zdWJzdHJpbmcoMTggKyAyKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgzLCAxKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDMpICsgc3RyLnN1YnN0cmluZygzICsgMSk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMTIsIDQpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTIpICsgc3RyLnN1YnN0cmluZygxMiArIDQpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDMsICdoTWJuVkVkVFNkaExsUGV2WEtGICcpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyAnaE1iblZFZFRTZGhMbFBldlhLRiAnICsgc3RyLnN1YnN0cmluZygzKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgyMiwgOCk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAyMikgKyBzdHIuc3Vic3RyaW5nKDIyICsgOCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNCwgJ1MgdW1TbllycU9tT0FWXFxuRWJaSiAnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgJ1MgdW1TbllycU9tT0FWXFxuRWJaSiAnICsgc3RyLnN1YnN0cmluZyg0KTtcblxuXHRcdHRlc3RMaW5lU3RhcnRzKHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnZXQgdGV4dCBpbiByYW5nZScsICgpID0+IHtcblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdnZXRDb250ZW50SW5SYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnYVxcbmJcXG5jXFxuZGUnXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg4LCAnZmhcXG5pXFxuamsnKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg3LCAyKTtcblx0XHQvLyAnYVxcbmJcXG5jXFxuZGhcXG5pXFxuamsnXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDMpKSwgJ2FcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDIsIDEsIDIsIDMpKSwgJ2JcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDMsIDEsIDMsIDMpKSwgJ2NcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDQsIDEsIDQsIDQpKSwgJ2RoXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSg1LCAxLCA1LCAzKSksICdpXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSg2LCAxLCA2LCAzKSksICdqaycpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5kb20gdGVzdCB2YWx1ZSBpbiByYW5nZScsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbc3RyXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdaWFhZJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdaWFhZJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMSwgJ1haWlknKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgJ1haWlknICsgc3RyLnN1YnN0cmluZygxKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg1LCAnXFxuWFxcblxcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyAnXFxuWFxcblxcbicgKyBzdHIuc3Vic3RyaW5nKDUpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDMsICdcXG5YWFxcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyAnXFxuWFhcXG4nICsgc3RyLnN1YnN0cmluZygzKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxMiwgJ1lZWVgnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEyKSArICdZWVlYJyArIHN0ci5zdWJzdHJpbmcoMTIpO1xuXG5cdFx0dGVzdExpbmVzQ29udGVudChzdHIsIHBpZWNlVGFibGUpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblx0dGVzdCgncmFuZG9tIHRlc3QgdmFsdWUgaW4gcmFuZ2UgZXhjZXB0aW9uJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFtzdHJdKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ1haXFxuWicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnWFpcXG5aJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMCwgMyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArIHN0ci5zdWJzdHJpbmcoMCArIDMpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDAsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyBzdHIuc3Vic3RyaW5nKDAgKyAxKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnWllYXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdaWVhcXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgwLCA0KTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgc3RyLnN1YnN0cmluZygwICsgNCk7XG5cblx0XHRwaWVjZVRhYmxlLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5kb20gdGVzdHMgYnVnIDEnLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICcnO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWycnXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnaHV1eVl6VWZLT0VOd0dnWkxxbiAnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ2h1dXlZelVmS09FTndHZ1pMcW4gJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMTgsIDIpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTgpICsgc3RyLnN1YnN0cmluZygxOCArIDIpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDMsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyBzdHIuc3Vic3RyaW5nKDMgKyAxKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgxMiwgNCk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxMikgKyBzdHIuc3Vic3RyaW5nKDEyICsgNCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMywgJ2hNYm5WRWRUU2RoTGxQZXZYS0YgJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdoTWJuVkVkVFNkaExsUGV2WEtGICcgKyBzdHIuc3Vic3RyaW5nKDMpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDIyLCA4KTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIyKSArIHN0ci5zdWJzdHJpbmcoMjIgKyA4KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg0LCAnUyB1bVNuWXJxT21PQVZcXG5FYlpKICcpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNCkgKyAnUyB1bVNuWXJxT21PQVZcXG5FYlpKICcgKyBzdHIuc3Vic3RyaW5nKDQpO1xuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIHRlc3RzIGJ1ZyAyJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ3hmb3VSRFp3ZEFIalZYSkFNVlxcbiAnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ3hmb3VSRFp3ZEFIalZYSkFNVlxcbiAnICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxNiwgJ2RCR25keHBGWkJFQUlLeWtZWXggJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxNikgKyAnZEJHbmR4cEZaQkVBSUt5a1lZeCAnICsgc3RyLnN1YnN0cmluZygxNik7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNywgNik7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA3KSArIHN0ci5zdWJzdHJpbmcoNyArIDYpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDksIDcpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgOSkgKyBzdHIuc3Vic3RyaW5nKDkgKyA3KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgxNywgNik7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxNykgKyBzdHIuc3Vic3RyaW5nKDE3ICsgNik7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMCwgNCk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArIHN0ci5zdWJzdHJpbmcoMCArIDQpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDksICdxdkVGWENOdlZrV2d2eWthaFl0ICcpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgOSkgKyAncXZFRlhDTnZWa1dndnlrYWhZdCAnICsgc3RyLnN1YnN0cmluZyg5KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg0LCA2KTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgc3RyLnN1YnN0cmluZyg0ICsgNik7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTEsICdPY1NDaFVZVFxcbnpQRUJPcHNHbVIgJyk7XG5cdFx0c3RyID1cblx0XHRcdHN0ci5zdWJzdHJpbmcoMCwgMTEpICsgJ09jU0NoVVlUXFxuelBFQk9wc0dtUiAnICsgc3RyLnN1YnN0cmluZygxMSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTUsICdLSkNvemFYVHZrRVxcbnhucUFlVHogJyk7XG5cdFx0c3RyID1cblx0XHRcdHN0ci5zdWJzdHJpbmcoMCwgMTUpICsgJ0tKQ296YVhUdmtFXFxueG5xQWVUeiAnICsgc3RyLnN1YnN0cmluZygxNSk7XG5cblx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldCBsaW5lIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJzEnXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVSYXdDb250ZW50KDEpLCAnMScpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEsICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZVJhd0NvbnRlbnQoMSksICcxMicpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXQgbGluZSBjb250ZW50IGJhc2ljJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWycxXFxuMlxcbjNcXG40J10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lUmF3Q29udGVudCgxKSwgJzFcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lUmF3Q29udGVudCgyKSwgJzJcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lUmF3Q29udGVudCgzKSwgJzNcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lUmF3Q29udGVudCg0KSwgJzQnKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0IGxpbmUgY29udGVudCBhZnRlciBpbnNlcnRzL2RlbGV0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2FcXG5iXFxuY1xcbmRlJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoOCwgJ2ZoXFxuaVxcbmprJyk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNywgMik7XG5cdFx0Ly8gJ2FcXG5iXFxuY1xcbmRoXFxuaVxcbmprJ1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZVJhd0NvbnRlbnQoMSksICdhXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZVJhd0NvbnRlbnQoMiksICdiXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZVJhd0NvbnRlbnQoMyksICdjXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZVJhd0NvbnRlbnQoNCksICdkaFxcbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVSYXdDb250ZW50KDUpLCAnaVxcbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVSYXdDb250ZW50KDYpLCAnamsnKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIDEnLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICcnO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWycnXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdKIGVObkR6UXBubFd5am1VdVxcbnkgJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdKIGVObkR6UXBubFd5am1VdVxcbnkgJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ1FQRWVSQVFtUndsSnF0WlNXaFEgJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdRUEVlUkFRbVJ3bEpxdFpTV2hRICcgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDUsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyBzdHIuc3Vic3RyaW5nKDUgKyAxKTtcblxuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIDInLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICcnO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWycnXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnRFpvUSB0Z2xQQ1JITWx0ZWpSSSAnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ0Rab1EgdGdsUENSSE1sdGVqUkkgJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTAsICdKUlhpeVlxSiBxcWRjbWJma0tYICcpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTApICsgJ0pSWGl5WXFKIHFxZGNtYmZrS1ggJyArIHN0ci5zdWJzdHJpbmcoMTApO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDE2LCAzKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE2KSArIHN0ci5zdWJzdHJpbmcoMTYgKyAzKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgyNSwgMSk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAyNSkgKyBzdHIuc3Vic3RyaW5nKDI1ICsgMSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTgsICd2SFxcbk5sdmZxUUpQbVxcblNGa2hNYyAnKTtcblx0XHRzdHIgPVxuXHRcdFx0c3RyLnN1YnN0cmluZygwLCAxOCkgKyAndkhcXG5ObHZmcVFKUG1cXG5TRmtoTWMgJyArIHN0ci5zdWJzdHJpbmcoMTgpO1xuXG5cdFx0dGVzdExpbmVzQ29udGVudChzdHIsIHBpZWNlVGFibGUpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ1JMRicsICgpID0+IHtcblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkZWxldGUgQ1IgaW4gQ1JMRiAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWycnXSwgZmFsc2UpO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ2FcXHJcXG5iJyk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMCwgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ291bnQoKSwgMik7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBDUiBpbiBDUkxGIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnYVxcclxcbmInKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgyLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDb3VudCgpLCAyKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIGJ1ZyAxJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10sIGZhbHNlKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdcXG5cXG5cXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1xcblxcblxcclxccicgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEsICdcXHJcXG5cXHJcXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgJ1xcclxcblxcclxcbicgKyBzdHIuc3Vic3RyaW5nKDEpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDUsIDMpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyBzdHIuc3Vic3RyaW5nKDUgKyAzKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgyLCAzKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgc3RyLnN1YnN0cmluZygyICsgMyk7XG5cblx0XHRjb25zdCBsaW5lcyA9IHNwbGl0TGluZXMoc3RyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ291bnQoKSwgbGluZXMubGVuZ3RoKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cdHRlc3QoJ3JhbmRvbSBidWcgMicsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdcXG5cXHJcXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1xcblxcclxcblxccicgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDIsICdcXG5cXHJcXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgJ1xcblxcclxcclxccicgKyBzdHIuc3Vic3RyaW5nKDIpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDQsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNCkgKyBzdHIuc3Vic3RyaW5nKDQgKyAxKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gc3BsaXRMaW5lcyhzdHIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDb3VudCgpLCBsaW5lcy5sZW5ndGgpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblx0dGVzdCgncmFuZG9tIGJ1ZyAzJywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10sIGZhbHNlKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ1xcblxcblxcblxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnXFxuXFxuXFxuXFxyJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMiwgMik7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAyKSArIHN0ci5zdWJzdHJpbmcoMiArIDIpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDAsIDIpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyBzdHIuc3Vic3RyaW5nKDAgKyAyKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnXFxyXFxyXFxyXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdcXHJcXHJcXHJcXHInICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgyLCAnXFxyXFxuXFxyXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAyKSArICdcXHJcXG5cXHJcXHInICsgc3RyLnN1YnN0cmluZygyKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnXFxyXFxyXFxyXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdcXHJcXHJcXHJcXG4nICsgc3RyLnN1YnN0cmluZygzKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gc3BsaXRMaW5lcyhzdHIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDb3VudCgpLCBsaW5lcy5sZW5ndGgpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblx0dGVzdCgncmFuZG9tIGJ1ZyA0JywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10sIGZhbHNlKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ1xcblxcblxcblxcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnXFxuXFxuXFxuXFxuJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMywgMSk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArIHN0ci5zdWJzdHJpbmcoMyArIDEpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEsICdcXHJcXHJcXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgJ1xcclxcclxcclxccicgKyBzdHIuc3Vic3RyaW5nKDEpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDYsICdcXHJcXG5cXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDYpICsgJ1xcclxcblxcblxccicgKyBzdHIuc3Vic3RyaW5nKDYpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDUsIDMpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyBzdHIuc3Vic3RyaW5nKDUgKyAzKTtcblxuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cdHRlc3QoJ3JhbmRvbSBidWcgNScsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdcXG5cXG5cXG5cXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1xcblxcblxcblxcbicgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDMsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyBzdHIuc3Vic3RyaW5nKDMgKyAxKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnXFxuXFxyXFxyXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdcXG5cXHJcXHJcXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg0LCAnXFxuXFxyXFxyXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA0KSArICdcXG5cXHJcXHJcXG4nICsgc3RyLnN1YnN0cmluZyg0KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg0LCAzKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgc3RyLnN1YnN0cmluZyg0ICsgMyk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNSwgJ1xcclxcclxcblxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyAnXFxyXFxyXFxuXFxyJyArIHN0ci5zdWJzdHJpbmcoNSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTIsICdcXG5cXG5cXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEyKSArICdcXG5cXG5cXG5cXHInICsgc3RyLnN1YnN0cmluZygxMik7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNSwgJ1xcclxcclxcclxcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyAnXFxyXFxyXFxyXFxuJyArIHN0ci5zdWJzdHJpbmcoNSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMjAsICdcXG5cXG5cXHJcXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIwKSArICdcXG5cXG5cXHJcXG4nICsgc3RyLnN1YnN0cmluZygyMCk7XG5cblx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXHR0ZXN0KCdyYW5kb20gYnVnIDYnLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICcnO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWycnXSwgZmFsc2UpO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnXFxuXFxyXFxyXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdcXG5cXHJcXHJcXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg0LCAnXFxyXFxuXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA0KSArICdcXHJcXG5cXG5cXHInICsgc3RyLnN1YnN0cmluZyg0KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnXFxyXFxuXFxuXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdcXHJcXG5cXG5cXG4nICsgc3RyLnN1YnN0cmluZygzKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg0LCA4KTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgc3RyLnN1YnN0cmluZyg0ICsgOCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNCwgJ1xcclxcblxcblxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNCkgKyAnXFxyXFxuXFxuXFxyJyArIHN0ci5zdWJzdHJpbmcoNCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ1xcclxcblxcblxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnXFxyXFxuXFxuXFxyJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNCwgMCk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA0KSArIHN0ci5zdWJzdHJpbmcoNCArIDApO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDgsIDQpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgOCkgKyBzdHIuc3Vic3RyaW5nKDggKyA0KTtcblxuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cdHRlc3QoJ3JhbmRvbSBidWcgOCcsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdcXHJcXG5cXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1xcclxcblxcblxccicgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDEsIDApO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMSkgKyBzdHIuc3Vic3RyaW5nKDEgKyAwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnXFxuXFxuXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdcXG5cXG5cXG5cXHInICsgc3RyLnN1YnN0cmluZygzKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg3LCAnXFxuXFxuXFxyXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA3KSArICdcXG5cXG5cXHJcXG4nICsgc3RyLnN1YnN0cmluZyg3KTtcblxuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cdHRlc3QoJ3JhbmRvbSBidWcgNycsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdcXHJcXHJcXG5cXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1xcclxcclxcblxcbicgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDQsICdcXHJcXG5cXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgJ1xcclxcblxcblxccicgKyBzdHIuc3Vic3RyaW5nKDQpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDcsICdcXG5cXHJcXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDcpICsgJ1xcblxcclxcclxccicgKyBzdHIuc3Vic3RyaW5nKDcpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDExLCAnXFxuXFxuXFxyXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxMSkgKyAnXFxuXFxuXFxyXFxuJyArIHN0ci5zdWJzdHJpbmcoMTEpO1xuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIGJ1ZyAxMCcsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdxbmVXJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdxbmVXJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMCwgJ1loSWwnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1loSWwnICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAncWRzbScpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAncWRzbScgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDcsIDApO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNykgKyBzdHIuc3Vic3RyaW5nKDcgKyAwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxMiwgJ2lpUHYnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEyKSArICdpaVB2JyArIHN0ci5zdWJzdHJpbmcoMTIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDksICdWXFxyU0EnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDkpICsgJ1ZcXHJTQScgKyBzdHIuc3Vic3RyaW5nKDkpO1xuXG5cdFx0dGVzdExpbmVzQ29udGVudChzdHIsIHBpZWNlVGFibGUpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5kb20gYnVnIDknLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICcnO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWycnXSwgZmFsc2UpO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnXFxuXFxuXFxuXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdcXG5cXG5cXG5cXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnXFxuXFxyXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdcXG5cXHJcXG5cXHInICsgc3RyLnN1YnN0cmluZygzKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgyLCAnXFxuXFxyXFxuXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAyKSArICdcXG5cXHJcXG5cXG4nICsgc3RyLnN1YnN0cmluZygyKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnXFxuXFxuXFxyXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdcXG5cXG5cXHJcXHInICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnXFxyXFxyXFxyXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdcXHJcXHJcXHJcXHInICsgc3RyLnN1YnN0cmluZygzKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnXFxuXFxuXFxyXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdcXG5cXG5cXHJcXHInICsgc3RyLnN1YnN0cmluZygzKTtcblxuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NlbnRyYWxpemVkIGxpbmVTdGFydHMgd2l0aCBDUkxGJywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2RlbGV0ZSBDUiBpbiBDUkxGIDEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2FcXHJcXG5iJ10sIGZhbHNlKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDb3VudCgpLCAyKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cdHRlc3QoJ2RlbGV0ZSBDUiBpbiBDUkxGIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2FcXHJcXG5iJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMCwgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ291bnQoKSwgMik7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSBidWcgMScsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJ1xcblxcblxcclxccic7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ1xcblxcblxcclxcciddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEsICdcXHJcXG5cXHJcXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgJ1xcclxcblxcclxcbicgKyBzdHIuc3Vic3RyaW5nKDEpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDUsIDMpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyBzdHIuc3Vic3RyaW5nKDUgKyAzKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgyLCAzKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgc3RyLnN1YnN0cmluZygyICsgMyk7XG5cblx0XHRjb25zdCBsaW5lcyA9IHNwbGl0TGluZXMoc3RyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ291bnQoKSwgbGluZXMubGVuZ3RoKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cdHRlc3QoJ3JhbmRvbSBidWcgMicsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJ1xcblxcclxcblxccic7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ1xcblxcclxcblxcciddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDIsICdcXG5cXHJcXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgJ1xcblxcclxcclxccicgKyBzdHIuc3Vic3RyaW5nKDIpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDQsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNCkgKyBzdHIuc3Vic3RyaW5nKDQgKyAxKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gc3BsaXRMaW5lcyhzdHIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDb3VudCgpLCBsaW5lcy5sZW5ndGgpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5kb20gYnVnIDMnLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICdcXG5cXG5cXG5cXHInO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWydcXG5cXG5cXG5cXHInXSwgZmFsc2UpO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgyLCAyKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgc3RyLnN1YnN0cmluZygyICsgMik7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMCwgMik7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArIHN0ci5zdWJzdHJpbmcoMCArIDIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdcXHJcXHJcXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDApICsgJ1xcclxcclxcclxccicgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDIsICdcXHJcXG5cXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgJ1xcclxcblxcclxccicgKyBzdHIuc3Vic3RyaW5nKDIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDMsICdcXHJcXHJcXHJcXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDMpICsgJ1xcclxcclxcclxcbicgKyBzdHIuc3Vic3RyaW5nKDMpO1xuXG5cdFx0Y29uc3QgbGluZXMgPSBzcGxpdExpbmVzKHN0cik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNvdW50KCksIGxpbmVzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSBidWcgNCcsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJ1xcblxcblxcblxcbic7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ1xcblxcblxcblxcbiddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDMsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyBzdHIuc3Vic3RyaW5nKDMgKyAxKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgxLCAnXFxyXFxyXFxyXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxKSArICdcXHJcXHJcXHJcXHInICsgc3RyLnN1YnN0cmluZygxKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg2LCAnXFxyXFxuXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA2KSArICdcXHJcXG5cXG5cXHInICsgc3RyLnN1YnN0cmluZyg2KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg1LCAzKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDUpICsgc3RyLnN1YnN0cmluZyg1ICsgMyk7XG5cblx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSBidWcgNScsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJ1xcblxcblxcblxcbic7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ1xcblxcblxcblxcbiddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDMsIDEpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyBzdHIuc3Vic3RyaW5nKDMgKyAxKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnXFxuXFxyXFxyXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdcXG5cXHJcXHJcXG4nICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg0LCAnXFxuXFxyXFxyXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA0KSArICdcXG5cXHJcXHJcXG4nICsgc3RyLnN1YnN0cmluZyg0KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg0LCAzKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgc3RyLnN1YnN0cmluZyg0ICsgMyk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNSwgJ1xcclxcclxcblxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyAnXFxyXFxyXFxuXFxyJyArIHN0ci5zdWJzdHJpbmcoNSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTIsICdcXG5cXG5cXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEyKSArICdcXG5cXG5cXG5cXHInICsgc3RyLnN1YnN0cmluZygxMik7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNSwgJ1xcclxcclxcclxcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNSkgKyAnXFxyXFxyXFxyXFxuJyArIHN0ci5zdWJzdHJpbmcoNSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMjAsICdcXG5cXG5cXHJcXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIwKSArICdcXG5cXG5cXHJcXG4nICsgc3RyLnN1YnN0cmluZygyMCk7XG5cblx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSBidWcgNicsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJ1xcblxcclxcclxcbic7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ1xcblxcclxcclxcbiddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDQsICdcXHJcXG5cXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgJ1xcclxcblxcblxccicgKyBzdHIuc3Vic3RyaW5nKDQpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDMsICdcXHJcXG5cXG5cXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDMpICsgJ1xcclxcblxcblxcbicgKyBzdHIuc3Vic3RyaW5nKDMpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDQsIDgpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNCkgKyBzdHIuc3Vic3RyaW5nKDQgKyA4KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCg0LCAnXFxyXFxuXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA0KSArICdcXHJcXG5cXG5cXHInICsgc3RyLnN1YnN0cmluZyg0KTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnXFxyXFxuXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdcXHJcXG5cXG5cXHInICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg0LCAwKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgc3RyLnN1YnN0cmluZyg0ICsgMCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoOCwgNCk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA4KSArIHN0ci5zdWJzdHJpbmcoOCArIDQpO1xuXG5cdFx0dGVzdExpbmVzQ29udGVudChzdHIsIHBpZWNlVGFibGUpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5kb20gYnVnIDcnLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICdcXHJcXG5cXG5cXHInO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWydcXHJcXG5cXG5cXHInXSwgZmFsc2UpO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgxLCAwKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgc3RyLnN1YnN0cmluZygxICsgMCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMywgJ1xcblxcblxcblxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMykgKyAnXFxuXFxuXFxuXFxyJyArIHN0ci5zdWJzdHJpbmcoMyk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNywgJ1xcblxcblxcclxcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNykgKyAnXFxuXFxuXFxyXFxuJyArIHN0ci5zdWJzdHJpbmcoNyk7XG5cblx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSBidWcgOCcsICgpID0+IHtcblx0XHRsZXQgc3RyID0gJ1xcclxcclxcblxcbic7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ1xcclxcclxcblxcbiddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDQsICdcXHJcXG5cXG5cXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgJ1xcclxcblxcblxccicgKyBzdHIuc3Vic3RyaW5nKDQpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDcsICdcXG5cXHJcXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDcpICsgJ1xcblxcclxcclxccicgKyBzdHIuc3Vic3RyaW5nKDcpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDExLCAnXFxuXFxuXFxyXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxMSkgKyAnXFxuXFxuXFxyXFxuJyArIHN0ci5zdWJzdHJpbmcoMTEpO1xuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIGJ1ZyA5JywgKCkgPT4ge1xuXHRcdGxldCBzdHIgPSAncW5lVyc7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ3FuZVcnXSwgZmFsc2UpO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnWWhJbCcpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnWWhJbCcgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdxZHNtJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdxZHNtJyArIHN0ci5zdWJzdHJpbmcoMCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNywgMCk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA3KSArIHN0ci5zdWJzdHJpbmcoNyArIDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEyLCAnaWlQdicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTIpICsgJ2lpUHYnICsgc3RyLnN1YnN0cmluZygxMik7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoOSwgJ1ZcXHJTQScpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgOSkgKyAnVlxcclNBJyArIHN0ci5zdWJzdHJpbmcoOSk7XG5cblx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSBidWcgMTAnLCAoKSA9PiB7XG5cdFx0bGV0IHN0ciA9ICdcXG5cXG5cXG5cXG4nO1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWydcXG5cXG5cXG5cXG4nXSwgZmFsc2UpO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnXFxuXFxyXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdcXG5cXHJcXG5cXHInICsgc3RyLnN1YnN0cmluZygzKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgyLCAnXFxuXFxyXFxuXFxuJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAyKSArICdcXG5cXHJcXG5cXG4nICsgc3RyLnN1YnN0cmluZygyKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnXFxuXFxuXFxyXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArICdcXG5cXG5cXHJcXHInICsgc3RyLnN1YnN0cmluZygwKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnXFxyXFxyXFxyXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdcXHJcXHJcXHJcXHInICsgc3RyLnN1YnN0cmluZygzKTtcblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnXFxuXFxuXFxyXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdcXG5cXG5cXHJcXHInICsgc3RyLnN1YnN0cmluZygzKTtcblxuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIGNodW5rIGJ1ZyAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWydcXG5cXHJcXHJcXG5cXG5cXG5cXHJcXG5cXHInXSwgZmFsc2UpO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cblx0XHRsZXQgc3RyID0gJ1xcblxcclxcclxcblxcblxcblxcclxcblxccic7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMCwgMik7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAwKSArIHN0ci5zdWJzdHJpbmcoMCArIDIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEsICdcXHJcXHJcXG5cXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEpICsgJ1xcclxcclxcblxcbicgKyBzdHIuc3Vic3RyaW5nKDEpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDcsICdcXHJcXHJcXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDcpICsgJ1xcclxcclxcclxccicgKyBzdHIuc3Vic3RyaW5nKDcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0dGVzdExpbmVTdGFydHMoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIGNodW5rIGJ1ZyAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoW1xuXHRcdFx0J1xcblxcclxcblxcblxcblxcclxcblxcclxcblxcclxcclxcblxcblxcblxcclxcclxcblxcclxcbidcblx0XHRdLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRsZXQgc3RyID0gJ1xcblxcclxcblxcblxcblxcclxcblxcclxcblxcclxcclxcblxcblxcblxcclxcclxcblxcclxcbic7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTYsICdcXHJcXG5cXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE2KSArICdcXHJcXG5cXHJcXHInICsgc3RyLnN1YnN0cmluZygxNik7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTMsICdcXG5cXG5cXHJcXHInKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEzKSArICdcXG5cXG5cXHJcXHInICsgc3RyLnN1YnN0cmluZygxMyk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTksICdcXG5cXG5cXHJcXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE5KSArICdcXG5cXG5cXHJcXG4nICsgc3RyLnN1YnN0cmluZygxOSk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNSwgMCk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA1KSArIHN0ci5zdWJzdHJpbmcoNSArIDApO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDExLCAyKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDExKSArIHN0ci5zdWJzdHJpbmcoMTEgKyAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVzUmF3Q29udGVudCgpLCBzdHIpO1xuXHRcdHRlc3RMaW5lU3RhcnRzKHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSBjaHVuayBidWcgMycsICgpID0+IHtcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnXFxyXFxuXFxuXFxuXFxuXFxuXFxuXFxyXFxuJ10sIGZhbHNlKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXHRcdGxldCBzdHIgPSAnXFxyXFxuXFxuXFxuXFxuXFxuXFxuXFxyXFxuJztcblx0XHRwaWVjZVRhYmxlLmluc2VydCg0LCAnXFxuXFxuXFxyXFxuXFxyXFxyXFxuXFxuXFxyJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCA0KSArICdcXG5cXG5cXHJcXG5cXHJcXHJcXG5cXG5cXHInICsgc3RyLnN1YnN0cmluZyg0KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg0LCA0KTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgc3RyLnN1YnN0cmluZyg0ICsgNCk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTEsICdcXHJcXG5cXHJcXG5cXG5cXHJcXHJcXG5cXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDExKSArICdcXHJcXG5cXHJcXG5cXG5cXHJcXHJcXG5cXG4nICsgc3RyLnN1YnN0cmluZygxMSk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMSwgMik7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxKSArIHN0ci5zdWJzdHJpbmcoMSArIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0dGVzdExpbmVTdGFydHMoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIGNodW5rIGJ1ZyA0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWydcXG5cXHJcXG5cXHInXSwgZmFsc2UpO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0bGV0IHN0ciA9ICdcXG5cXHJcXG5cXHInO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDQsICdcXG5cXG5cXHJcXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDQpICsgJ1xcblxcblxcclxcbicgKyBzdHIuc3Vic3RyaW5nKDQpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDMsICdcXHJcXG5cXG5cXG4nKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDMpICsgJ1xcclxcblxcblxcbicgKyBzdHIuc3Vic3RyaW5nKDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0dGVzdExpbmVTdGFydHMoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3JhbmRvbSBpcyB1bnN1cGVydmlzZWQnLCAoKSA9PiB7XG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc3BsaXR0aW5nIGxhcmdlIGNoYW5nZSBidWZmZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRsZXQgc3RyID0gJyc7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgwLCAnV1VaXFxuWFZaWVxcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnV1VaXFxuWFZaWVxcbicgKyBzdHIuc3Vic3RyaW5nKDApO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDgsICdcXHJcXHJcXG5aWFVXVlcnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDgpICsgJ1xcclxcclxcblpYVVdWVycgKyBzdHIuc3Vic3RyaW5nKDgpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDEwLCA3KTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEwKSArIHN0ci5zdWJzdHJpbmcoMTAgKyA3KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgxMCwgMSk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxMCkgKyBzdHIuc3Vic3RyaW5nKDEwICsgMSk7XG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoNCwgJ1ZYXFxyXFxyXFxuV1pWWicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgNCkgKyAnVlhcXHJcXHJcXG5XWlZaJyArIHN0ci5zdWJzdHJpbmcoNCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMTEsIDMpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTEpICsgc3RyLnN1YnN0cmluZygxMSArIDMpO1xuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDEyLCA0KTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEyKSArIHN0ci5zdWJzdHJpbmcoMTIgKyA0KTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSg4LCAwKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDgpICsgc3RyLnN1YnN0cmluZyg4ICsgMCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMTAsIDIpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTApICsgc3RyLnN1YnN0cmluZygxMCArIDIpO1xuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDAsICdWWlhYWllaWFxccicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMCkgKyAnVlpYWFpZWlhcXHInICsgc3RyLnN1YnN0cmluZygwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVzUmF3Q29udGVudCgpLCBzdHIpO1xuXG5cdFx0dGVzdExpbmVTdGFydHMoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbSBpbnNlcnQgZGVsZXRlJywgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCg1MDAwMDApO1xuXHRcdGxldCBzdHIgPSAnJztcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFtzdHJdLCBmYWxzZSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHQvLyBsZXQgb3V0cHV0ID0gJyc7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDAwOyBpKyspIHtcblx0XHRcdGlmIChNYXRoLnJhbmRvbSgpIDwgMC42KSB7XG5cdFx0XHRcdC8vIGluc2VydFxuXHRcdFx0XHRjb25zdCB0ZXh0ID0gcmFuZG9tU3RyKDEwMCk7XG5cdFx0XHRcdGNvbnN0IHBvcyA9IHJhbmRvbUludChzdHIubGVuZ3RoICsgMSk7XG5cdFx0XHRcdHBpZWNlVGFibGUuaW5zZXJ0KHBvcywgdGV4dCk7XG5cdFx0XHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgcG9zKSArIHRleHQgKyBzdHIuc3Vic3RyaW5nKHBvcyk7XG5cdFx0XHRcdC8vIG91dHB1dCArPSBgcGllY2VUYWJsZS5pbnNlcnQoJHtwb3N9LCAnJHt0ZXh0LnJlcGxhY2UoL1xcbi9nLCAnXFxcXG4nKS5yZXBsYWNlKC9cXHIvZywgJ1xcXFxyJyl9Jyk7XFxuYDtcblx0XHRcdFx0Ly8gb3V0cHV0ICs9IGBzdHIgPSBzdHIuc3Vic3RyaW5nKDAsICR7cG9zfSkgKyAnJHt0ZXh0LnJlcGxhY2UoL1xcbi9nLCAnXFxcXG4nKS5yZXBsYWNlKC9cXHIvZywgJ1xcXFxyJyl9JyArIHN0ci5zdWJzdHJpbmcoJHtwb3N9KTtcXG5gO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gZGVsZXRlXG5cdFx0XHRcdGNvbnN0IHBvcyA9IHJhbmRvbUludChzdHIubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3QgbGVuZ3RoID0gTWF0aC5taW4oXG5cdFx0XHRcdFx0c3RyLmxlbmd0aCAtIHBvcyxcblx0XHRcdFx0XHRNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMClcblx0XHRcdFx0KTtcblx0XHRcdFx0cGllY2VUYWJsZS5kZWxldGUocG9zLCBsZW5ndGgpO1xuXHRcdFx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIHBvcykgKyBzdHIuc3Vic3RyaW5nKHBvcyArIGxlbmd0aCk7XG5cdFx0XHRcdC8vIG91dHB1dCArPSBgcGllY2VUYWJsZS5kZWxldGUoJHtwb3N9LCAke2xlbmd0aH0pO1xcbmA7XG5cdFx0XHRcdC8vIG91dHB1dCArPSBgc3RyID0gc3RyLnN1YnN0cmluZygwLCAke3Bvc30pICsgc3RyLnN1YnN0cmluZygke3Bvc30gKyAke2xlbmd0aH0pO1xcbmBcblxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBjb25zb2xlLmxvZyhvdXRwdXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cblx0XHR0ZXN0TGluZVN0YXJ0cyhzdHIsIHBpZWNlVGFibGUpO1xuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tIGNodW5rcycsIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoNTAwMDAwKTtcblx0XHRjb25zdCBjaHVua3M6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcblx0XHRcdGNodW5rcy5wdXNoKHJhbmRvbVN0cigxMDAwKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihjaHVua3MsIGZhbHNlKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXHRcdGxldCBzdHIgPSBjaHVua3Muam9pbignJyk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDA7IGkrKykge1xuXHRcdFx0aWYgKE1hdGgucmFuZG9tKCkgPCAwLjYpIHtcblx0XHRcdFx0Ly8gaW5zZXJ0XG5cdFx0XHRcdGNvbnN0IHRleHQgPSByYW5kb21TdHIoMTAwKTtcblx0XHRcdFx0Y29uc3QgcG9zID0gcmFuZG9tSW50KHN0ci5sZW5ndGggKyAxKTtcblx0XHRcdFx0cGllY2VUYWJsZS5pbnNlcnQocG9zLCB0ZXh0KTtcblx0XHRcdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCBwb3MpICsgdGV4dCArIHN0ci5zdWJzdHJpbmcocG9zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGRlbGV0ZVxuXHRcdFx0XHRjb25zdCBwb3MgPSByYW5kb21JbnQoc3RyLmxlbmd0aCk7XG5cdFx0XHRcdGNvbnN0IGxlbmd0aCA9IE1hdGgubWluKFxuXHRcdFx0XHRcdHN0ci5sZW5ndGggLSBwb3MsXG5cdFx0XHRcdFx0TWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTApXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHBpZWNlVGFibGUuZGVsZXRlKHBvcywgbGVuZ3RoKTtcblx0XHRcdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCBwb3MpICsgc3RyLnN1YnN0cmluZyhwb3MgKyBsZW5ndGgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVzUmF3Q29udGVudCgpLCBzdHIpO1xuXHRcdHRlc3RMaW5lU3RhcnRzKHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0dGVzdExpbmVzQ29udGVudChzdHIsIHBpZWNlVGFibGUpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5kb20gY2h1bmtzIDInLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDUwMDAwMCk7XG5cdFx0Y29uc3QgY2h1bmtzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNodW5rcy5wdXNoKHJhbmRvbVN0cigxMDAwKSk7XG5cblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKGNodW5rcywgZmFsc2UpO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0bGV0IHN0ciA9IGNodW5rcy5qb2luKCcnKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuXHRcdFx0aWYgKE1hdGgucmFuZG9tKCkgPCAwLjYpIHtcblx0XHRcdFx0Ly8gaW5zZXJ0XG5cdFx0XHRcdGNvbnN0IHRleHQgPSByYW5kb21TdHIoMzApO1xuXHRcdFx0XHRjb25zdCBwb3MgPSByYW5kb21JbnQoc3RyLmxlbmd0aCArIDEpO1xuXHRcdFx0XHRwaWVjZVRhYmxlLmluc2VydChwb3MsIHRleHQpO1xuXHRcdFx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIHBvcykgKyB0ZXh0ICsgc3RyLnN1YnN0cmluZyhwb3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gZGVsZXRlXG5cdFx0XHRcdGNvbnN0IHBvcyA9IHJhbmRvbUludChzdHIubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3QgbGVuZ3RoID0gTWF0aC5taW4oXG5cdFx0XHRcdFx0c3RyLmxlbmd0aCAtIHBvcyxcblx0XHRcdFx0XHRNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMClcblx0XHRcdFx0KTtcblx0XHRcdFx0cGllY2VUYWJsZS5kZWxldGUocG9zLCBsZW5ndGgpO1xuXHRcdFx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIHBvcykgKyBzdHIuc3Vic3RyaW5nKHBvcyArIGxlbmd0aCk7XG5cdFx0XHR9XG5cdFx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCksIHN0cik7XG5cdFx0dGVzdExpbmVTdGFydHMoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdidWZmZXIgYXBpJywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2VxdWFsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBjcmVhdGVUZXh0QnVmZmVyKFsnYWJjJ10pO1xuXHRcdGNvbnN0IGIgPSBjcmVhdGVUZXh0QnVmZmVyKFsnYWInLCAnYyddKTtcblx0XHRjb25zdCBjID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2FiZCddKTtcblx0XHRjb25zdCBkID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2FiY2QnXSk7XG5cdFx0ZHMuYWRkKGEpO1xuXHRcdGRzLmFkZChiKTtcblx0XHRkcy5hZGQoYyk7XG5cdFx0ZHMuYWRkKGQpO1xuXG5cdFx0YXNzZXJ0KGEuZ2V0UGllY2VUcmVlKCkuZXF1YWwoYi5nZXRQaWVjZVRyZWUoKSkpO1xuXHRcdGFzc2VydCghYS5nZXRQaWVjZVRyZWUoKS5lcXVhbChjLmdldFBpZWNlVHJlZSgpKSk7XG5cdFx0YXNzZXJ0KCFhLmdldFBpZWNlVHJlZSgpLmVxdWFsKGQuZ2V0UGllY2VUcmVlKCkpKTtcblx0fSk7XG5cblx0dGVzdCgnZXF1YWwgd2l0aCBtb3JlIGNodW5rcycsICgpID0+IHtcblx0XHRjb25zdCBhID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2FiJywgJ2NkJywgJ2UnXSk7XG5cdFx0Y29uc3QgYiA9IGNyZWF0ZVRleHRCdWZmZXIoWydhYicsICdjJywgJ2RlJ10pO1xuXHRcdGRzLmFkZChhKTtcblx0XHRkcy5hZGQoYik7XG5cdFx0YXNzZXJ0KGEuZ2V0UGllY2VUcmVlKCkuZXF1YWwoYi5nZXRQaWVjZVRyZWUoKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdlcXVhbCAyLCBlbXB0eSBidWZmZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IGNyZWF0ZVRleHRCdWZmZXIoWycnXSk7XG5cdFx0Y29uc3QgYiA9IGNyZWF0ZVRleHRCdWZmZXIoWycnXSk7XG5cdFx0ZHMuYWRkKGEpO1xuXHRcdGRzLmFkZChiKTtcblxuXHRcdGFzc2VydChhLmdldFBpZWNlVHJlZSgpLmVxdWFsKGIuZ2V0UGllY2VUcmVlKCkpKTtcblx0fSk7XG5cblx0dGVzdCgnZXF1YWwgMywgZW1wdHkgYnVmZmVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBjcmVhdGVUZXh0QnVmZmVyKFsnYSddKTtcblx0XHRjb25zdCBiID0gY3JlYXRlVGV4dEJ1ZmZlcihbJyddKTtcblx0XHRkcy5hZGQoYSk7XG5cdFx0ZHMuYWRkKGIpO1xuXG5cdFx0YXNzZXJ0KCFhLmdldFBpZWNlVHJlZSgpLmVxdWFsKGIuZ2V0UGllY2VUcmVlKCkpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TGluZUNoYXJDb2RlIC0gaXNzdWUgIzQ1NzM1JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWydMSU5FMVxcbmxpbmUyJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNoYXJDb2RlKDEsIDApLCAnTCcuY2hhckNvZGVBdCgwKSwgJ0wnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ2hhckNvZGUoMSwgMSksICdJJy5jaGFyQ29kZUF0KDApLCAnSScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDaGFyQ29kZSgxLCAyKSwgJ04nLmNoYXJDb2RlQXQoMCksICdOJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNoYXJDb2RlKDEsIDMpLCAnRScuY2hhckNvZGVBdCgwKSwgJ0UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ2hhckNvZGUoMSwgNCksICcxJy5jaGFyQ29kZUF0KDApLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDaGFyQ29kZSgxLCA1KSwgJ1xcbicuY2hhckNvZGVBdCgwKSwgJ1xcXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNoYXJDb2RlKDIsIDApLCAnbCcuY2hhckNvZGVBdCgwKSwgJ2wnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ2hhckNvZGUoMiwgMSksICdpJy5jaGFyQ29kZUF0KDApLCAnaScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDaGFyQ29kZSgyLCAyKSwgJ24nLmNoYXJDb2RlQXQoMCksICduJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNoYXJDb2RlKDIsIDMpLCAnZScuY2hhckNvZGVBdCgwKSwgJ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ2hhckNvZGUoMiwgNCksICcyJy5jaGFyQ29kZUF0KDApLCAnMicpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ2dldExpbmVDaGFyQ29kZSAtIGlzc3VlICM0NzczMycsICgpID0+IHtcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJywgJ0xJTkUxXFxuJywgJ2xpbmUyJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNoYXJDb2RlKDEsIDApLCAnTCcuY2hhckNvZGVBdCgwKSwgJ0wnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ2hhckNvZGUoMSwgMSksICdJJy5jaGFyQ29kZUF0KDApLCAnSScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDaGFyQ29kZSgxLCAyKSwgJ04nLmNoYXJDb2RlQXQoMCksICdOJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNoYXJDb2RlKDEsIDMpLCAnRScuY2hhckNvZGVBdCgwKSwgJ0UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ2hhckNvZGUoMSwgNCksICcxJy5jaGFyQ29kZUF0KDApLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDaGFyQ29kZSgxLCA1KSwgJ1xcbicuY2hhckNvZGVBdCgwKSwgJ1xcXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNoYXJDb2RlKDIsIDApLCAnbCcuY2hhckNvZGVBdCgwKSwgJ2wnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ2hhckNvZGUoMiwgMSksICdpJy5jaGFyQ29kZUF0KDApLCAnaScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZVRhYmxlLmdldExpbmVDaGFyQ29kZSgyLCAyKSwgJ24nLmNoYXJDb2RlQXQoMCksICduJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlVGFibGUuZ2V0TGluZUNoYXJDb2RlKDIsIDMpLCAnZScuY2hhckNvZGVBdCgwKSwgJ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2VUYWJsZS5nZXRMaW5lQ2hhckNvZGUoMiwgNCksICcyJy5jaGFyQ29kZUF0KDApLCAnMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXROZWFyZXN0Q2h1bmsnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJzAxMjM0NTY3OCddKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwdCA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHB0Lmluc2VydCgzLCAnQUJDJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHB0LmdldExpbmVDb250ZW50KDEpLCAnMDEyQUJDMzQ1Njc4Jyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHB0LmdldE5lYXJlc3RDaHVuaygzKSwgJ0FCQycpO1xuXHRcdGFzc2VydC5lcXVhbChwdC5nZXROZWFyZXN0Q2h1bmsoNiksICczNDU2NzgnKTtcblxuXHRcdHB0LmRlbGV0ZSg5LCAxKTtcblx0XHRhc3NlcnQuZXF1YWwocHQuZ2V0TGluZUNvbnRlbnQoMSksICcwMTJBQkMzNDU3OCcpO1xuXHRcdGFzc2VydC5lcXVhbChwdC5nZXROZWFyZXN0Q2h1bmsoNiksICczNDUnKTtcblx0XHRhc3NlcnQuZXF1YWwocHQuZ2V0TmVhcmVzdENodW5rKDkpLCAnNzgnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3NlYXJjaCBvZmZzZXQgY2FjaGUnLCAoKSA9PiB7XG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVuZGVyIHdoaXRlIHNwYWNlIGV4Y2VwdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnY2xhc3MgTmFtZXtcXG5cXHRcXG5cXHRcXHRcXHRnZXQoKSB7XFxuXFxuXFx0XFx0XFx0fVxcblxcdFxcdH0nXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRsZXQgc3RyID0gJ2NsYXNzIE5hbWV7XFxuXFx0XFxuXFx0XFx0XFx0Z2V0KCkge1xcblxcblxcdFxcdFxcdH1cXG5cXHRcXHR9JztcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDEyLCAncycpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTIpICsgJ3MnICsgc3RyLnN1YnN0cmluZygxMik7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgxMywgJ2UnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEzKSArICdlJyArIHN0ci5zdWJzdHJpbmcoMTMpO1xuXG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMTQsICd0Jyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxNCkgKyAndCcgKyBzdHIuc3Vic3RyaW5nKDE0KTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDE1LCAnKCknKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE1KSArICcoKScgKyBzdHIuc3Vic3RyaW5nKDE1KTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDE2LCAxKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE2KSArIHN0ci5zdWJzdHJpbmcoMTYgKyAxKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDE3LCAnKCknKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE3KSArICcoKScgKyBzdHIuc3Vic3RyaW5nKDE3KTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDE4LCAxKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE4KSArIHN0ci5zdWJzdHJpbmcoMTggKyAxKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDE4LCAnfScpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTgpICsgJ30nICsgc3RyLnN1YnN0cmluZygxOCk7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgxMiwgJ1xcbicpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTIpICsgJ1xcbicgKyBzdHIuc3Vic3RyaW5nKDEyKTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDEyLCAxKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDEyKSArIHN0ci5zdWJzdHJpbmcoMTIgKyAxKTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDE4LCAxKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE4KSArIHN0ci5zdWJzdHJpbmcoMTggKyAxKTtcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDE4LCAnfScpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTgpICsgJ30nICsgc3RyLnN1YnN0cmluZygxOCk7XG5cblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgxNywgMik7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxNykgKyBzdHIuc3Vic3RyaW5nKDE3ICsgMik7XG5cblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgxNiwgMSk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAxNikgKyBzdHIuc3Vic3RyaW5nKDE2ICsgMSk7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgxNiwgJyknKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDE2KSArICcpJyArIHN0ci5zdWJzdHJpbmcoMTYpO1xuXG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMTUsIDIpO1xuXHRcdHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgMTUpICsgc3RyLnN1YnN0cmluZygxNSArIDIpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHBpZWNlVGFibGUuZ2V0TGluZXNSYXdDb250ZW50KCk7XG5cdFx0YXNzZXJ0KGNvbnRlbnQgPT09IHN0cik7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmUgYnJlYWtzIHJlcGxhY2VtZW50IGlzIG5vdCBuZWNlc3Nhcnkgd2hlbiBFT0wgaXMgbm9ybWFsaXplZCcsICgpID0+IHtcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnYWJjJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0bGV0IHN0ciA9ICdhYmMnO1xuXG5cdFx0cGllY2VUYWJsZS5pbnNlcnQoMywgJ2RlZlxcbmFiYycpO1xuXHRcdHN0ciA9IHN0ciArICdkZWZcXG5hYmMnO1xuXG5cdFx0dGVzdExpbmVTdGFydHMoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmUgYnJlYWtzIHJlcGxhY2VtZW50IGlzIG5vdCBuZWNlc3Nhcnkgd2hlbiBFT0wgaXMgbm9ybWFsaXplZCAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWydhYmNcXG4nXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRsZXQgc3RyID0gJ2FiY1xcbic7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCg0LCAnZGVmXFxuYWJjJyk7XG5cdFx0c3RyID0gc3RyICsgJ2RlZlxcbmFiYyc7XG5cblx0XHR0ZXN0TGluZVN0YXJ0cyhzdHIsIHBpZWNlVGFibGUpO1xuXHRcdHRlc3RMaW5lc0NvbnRlbnQoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHRhc3NlcnRUcmVlSW52YXJpYW50cyhwaWVjZVRhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgnTGluZSBicmVha3MgcmVwbGFjZW1lbnQgaXMgbm90IG5lY2Vzc2FyeSB3aGVuIEVPTCBpcyBub3JtYWxpemVkIDMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGllY2VUcmVlID0gY3JlYXRlVGV4dEJ1ZmZlcihbJ2FiY1xcbiddKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXHRcdGxldCBzdHIgPSAnYWJjXFxuJztcblxuXHRcdHBpZWNlVGFibGUuaW5zZXJ0KDIsICdkZWZcXG5hYmMnKTtcblx0XHRzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIDIpICsgJ2RlZlxcbmFiYycgKyBzdHIuc3Vic3RyaW5nKDIpO1xuXG5cdFx0dGVzdExpbmVTdGFydHMoc3RyLCBwaWVjZVRhYmxlKTtcblx0XHR0ZXN0TGluZXNDb250ZW50KHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0YXNzZXJ0VHJlZUludmFyaWFudHMocGllY2VUYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmUgYnJlYWtzIHJlcGxhY2VtZW50IGlzIG5vdCBuZWNlc3Nhcnkgd2hlbiBFT0wgaXMgbm9ybWFsaXplZCA0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoWydhYmNcXG4nXSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblx0XHRsZXQgc3RyID0gJ2FiY1xcbic7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgzLCAnZGVmXFxuYWJjJyk7XG5cdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCAzKSArICdkZWZcXG5hYmMnICsgc3RyLnN1YnN0cmluZygzKTtcblxuXHRcdHRlc3RMaW5lU3RhcnRzKHN0ciwgcGllY2VUYWJsZSk7XG5cdFx0dGVzdExpbmVzQ29udGVudChzdHIsIHBpZWNlVGFibGUpO1xuXHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHBpZWNlVGFibGUpO1xuXHR9KTtcblxufSk7XG5cbmZ1bmN0aW9uIGdldFZhbHVlSW5TbmFwc2hvdChzbmFwc2hvdDogSVRleHRTbmFwc2hvdCkge1xuXHRsZXQgcmV0ID0gJyc7XG5cdGxldCB0bXAgPSBzbmFwc2hvdC5yZWFkKCk7XG5cblx0d2hpbGUgKHRtcCAhPT0gbnVsbCkge1xuXHRcdHJldCArPSB0bXA7XG5cdFx0dG1wID0gc25hcHNob3QucmVhZCgpO1xuXHR9XG5cblx0cmV0dXJuIHJldDtcbn1cbnN1aXRlKCdzbmFwc2hvdCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYnVnICM0NTU2NCwgcGllY2UgdHJlZSBwaWVjZXMgc2hvdWxkIGJlIGltbXV0YWJsZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnXFxuJyk7XG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHR7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgMSksXG5cdFx0XHRcdHRleHQ6ICchJ1xuXHRcdFx0fVxuXHRcdF0pO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gbW9kZWwuY3JlYXRlU25hcHNob3QoKTtcblx0XHRjb25zdCBzbmFwc2hvdDEgPSBtb2RlbC5jcmVhdGVTbmFwc2hvdCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKS5qb2luKCdcXG4nKSwgZ2V0VmFsdWVJblNuYXBzaG90KHNuYXBzaG90KSk7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCAyKSxcblx0XHRcdFx0dGV4dDogJydcblx0XHRcdH1cblx0XHRdKTtcblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCAxKSxcblx0XHRcdFx0dGV4dDogJyEnXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCkuam9pbignXFxuJyksIGdldFZhbHVlSW5TbmFwc2hvdChzbmFwc2hvdDEpKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaW1tdXRhYmxlIHNuYXBzaG90IDEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FiY1xcbmRlZicpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gbW9kZWwuY3JlYXRlU25hcHNob3QoKTtcblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCA0KSxcblx0XHRcdFx0dGV4dDogJydcblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0e1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDIsIDEpLFxuXHRcdFx0XHR0ZXh0OiAnYWJjXFxuZGVmJ1xuXHRcdFx0fVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLmpvaW4oJ1xcbicpLCBnZXRWYWx1ZUluU25hcHNob3Qoc25hcHNob3QpKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaW1tdXRhYmxlIHNuYXBzaG90IDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FiY1xcbmRlZicpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gbW9kZWwuY3JlYXRlU25hcHNob3QoKTtcblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCAxKSxcblx0XHRcdFx0dGV4dDogJyEnXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCAyKSxcblx0XHRcdFx0dGV4dDogJydcblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKS5qb2luKCdcXG4nKSwgZ2V0VmFsdWVJblNuYXBzaG90KHNuYXBzaG90KSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ltbXV0YWJsZSBzbmFwc2hvdCAzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdhYmNcXG5kZWYnKTtcblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCA0LCAyLCA0KSxcblx0XHRcdFx0dGV4dDogJyEnXG5cdFx0XHR9XG5cdFx0XSk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBtb2RlbC5jcmVhdGVTbmFwc2hvdCgpO1xuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0e1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDIsIDUsIDIsIDUpLFxuXHRcdFx0XHR0ZXh0OiAnISdcblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKS5qb2luKCdcXG4nKSwgZ2V0VmFsdWVJblNuYXBzaG90KHNuYXBzaG90KSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjaHVuayBiYXNlZCBzZWFyY2gnLCAoKSA9PiB7XG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnIzQ1ODkyLiBGb3Igc29tZSBjYXNlcywgdGhlIGJ1ZmZlciBpcyBlbXB0eSBidXQgd2Ugc3RpbGwgdHJ5IHRvIHNlYXJjaCcsICgpID0+IHtcblx0XHRjb25zdCBwaWVjZVRyZWUgPSBjcmVhdGVUZXh0QnVmZmVyKFsnJ10pO1xuXHRcdGRzLmFkZChwaWVjZVRyZWUpO1xuXHRcdGNvbnN0IHBpZWNlVGFibGUgPSBwaWVjZVRyZWUuZ2V0UGllY2VUcmVlKCk7XG5cdFx0cGllY2VUYWJsZS5kZWxldGUoMCwgMSk7XG5cdFx0Y29uc3QgcmV0ID0gcGllY2VUcmVlLmZpbmRNYXRjaGVzTGluZUJ5TGluZShuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIG5ldyBTZWFyY2hEYXRhKC9hYmMvLCBuZXcgV29yZENoYXJhY3RlckNsYXNzaWZpZXIoJywuLycsIFtdKSwgJ2FiYycpLCB0cnVlLCAxMDAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV0Lmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJyM0NTc3MC4gRmluZEluTm9kZSBzaG91bGQgbm90IGNyb3NzIG5vZGUgYm91bmRhcnkuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoW1xuXHRcdFx0W1xuXHRcdFx0XHQnYmFsYWJhbGFiYWJhbGFiYWxhYmFiYWxhYmFsYWJhJyxcblx0XHRcdFx0J2JhbGFiYWxhYmFiYWxhYmFsYWJhYmFsYWJhbGFiYScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnKiBbIF0gdGFzazEnLFxuXHRcdFx0XHQnKiBbeF0gdGFzazIgYmFsYWJhbGFiYScsXG5cdFx0XHRcdCcqIFsgXSB0YXNrIDMnXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0XSk7XG5cdFx0ZHMuYWRkKHBpZWNlVHJlZSk7XG5cdFx0Y29uc3QgcGllY2VUYWJsZSA9IHBpZWNlVHJlZS5nZXRQaWVjZVRyZWUoKTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDAsIDYyKTtcblx0XHRwaWVjZVRhYmxlLmRlbGV0ZSgxNiwgMSk7XG5cblx0XHRwaWVjZVRhYmxlLmluc2VydCgxNiwgJyAnKTtcblx0XHRjb25zdCByZXQgPSBwaWVjZVRhYmxlLmZpbmRNYXRjaGVzTGluZUJ5TGluZShuZXcgUmFuZ2UoMSwgMSwgNCwgMTMpLCBuZXcgU2VhcmNoRGF0YSgvXFxbL2dpLCBuZXcgV29yZENoYXJhY3RlckNsYXNzaWZpZXIoJywuLycsIFtdKSwgJ1snKSwgdHJ1ZSwgMTAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldC5sZW5ndGgsIDMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXRbMF0ucmFuZ2UsIG5ldyBSYW5nZSgyLCAzLCAyLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXRbMV0ucmFuZ2UsIG5ldyBSYW5nZSgzLCAzLCAzLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXRbMl0ucmFuZ2UsIG5ldyBSYW5nZSg0LCAzLCA0LCA0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlYXJjaCBzZWFyY2hpbmcgZnJvbSB0aGUgbWlkZGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBpZWNlVHJlZSA9IGNyZWF0ZVRleHRCdWZmZXIoW1xuXHRcdFx0W1xuXHRcdFx0XHQnZGVmJyxcblx0XHRcdFx0J2RiY2FiYydcblx0XHRcdF0uam9pbignXFxuJylcblx0XHRdKTtcblx0XHRkcy5hZGQocGllY2VUcmVlKTtcblx0XHRjb25zdCBwaWVjZVRhYmxlID0gcGllY2VUcmVlLmdldFBpZWNlVHJlZSgpO1xuXG5cdFx0cGllY2VUYWJsZS5kZWxldGUoNCwgMSk7XG5cdFx0bGV0IHJldCA9IHBpZWNlVGFibGUuZmluZE1hdGNoZXNMaW5lQnlMaW5lKG5ldyBSYW5nZSgyLCAzLCAyLCA2KSwgbmV3IFNlYXJjaERhdGEoL2EvZ2ksIG51bGwsICdhJyksIHRydWUsIDEwMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJldFswXS5yYW5nZSwgbmV3IFJhbmdlKDIsIDMsIDIsIDQpKTtcblxuXHRcdHBpZWNlVGFibGUuZGVsZXRlKDQsIDEpO1xuXHRcdHJldCA9IHBpZWNlVGFibGUuZmluZE1hdGNoZXNMaW5lQnlMaW5lKG5ldyBSYW5nZSgyLCAyLCAyLCA1KSwgbmV3IFNlYXJjaERhdGEoL2EvZ2ksIG51bGwsICdhJyksIHRydWUsIDEwMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJldFswXS5yYW5nZSwgbmV3IFJhbmdlKDIsIDIsIDIsIDMpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBaUMsa0JBQWtCO0FBRzVELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsV0FBVyxnQkFBMEI7QUFDOUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxXQUFXO0FBRWpCLFNBQVMsYUFBYTtBQUNyQixTQUFPLFNBQVMsVUFBVSxTQUFTLE1BQU0sQ0FBQztBQUMzQztBQUVBLFNBQVMsVUFBVSxPQUFlO0FBQ2pDLFNBQU8sS0FBSyxNQUFNLEtBQUssT0FBTyxJQUFJLEtBQUs7QUFDeEM7QUFFQSxTQUFTLFVBQVUsS0FBYTtBQUMvQixNQUFJLFFBQVEsTUFBTTtBQUNqQixVQUFNO0FBQUEsRUFDUDtBQUNBLFVBQVEsV0FBWTtBQUNuQixRQUFJLEdBQUc7QUFDUCxVQUFNLFVBQVUsQ0FBQztBQUNqQixTQUNDLElBQUksR0FBRyxNQUFNLEtBQ2IsS0FBSyxNQUFNLElBQUksTUFBTSxJQUFJLEtBQ3pCLEtBQUssTUFBTSxNQUFNLEtBQ2hCO0FBQ0QsY0FBUSxLQUFLLFdBQVcsQ0FBQztBQUFBLElBQzFCO0FBQ0EsV0FBTztBQUFBLEVBQ1IsR0FBRyxFQUFFLEtBQUssRUFBRTtBQUNiO0FBRUEsU0FBUyxhQUFhLE1BQXNCO0FBQzNDLE1BQUksS0FB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
