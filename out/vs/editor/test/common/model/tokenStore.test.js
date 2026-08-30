import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TokenQuality, TokenStore } from "../../../common/model/tokens/treeSitter/tokenStore.js";
suite("TokenStore", () => {
  let textModel;
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    textModel = {
      getValueLength: () => 11
    };
  });
  test("constructs with empty model", () => {
    const store = new TokenStore(textModel);
    assert.ok(store.root);
    assert.strictEqual(store.root.length, textModel.getValueLength());
  });
  test("builds store with single token", () => {
    const store = new TokenStore(textModel);
    store.buildStore([{
      startOffsetInclusive: 0,
      length: 5,
      token: 1
    }], TokenQuality.Accurate);
    assert.strictEqual(store.root.length, 5);
  });
  test("builds store with multiple tokens", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 4, token: 3 }
    ], TokenQuality.Accurate);
    assert.ok(store.root);
    assert.strictEqual(store.root.length, 10);
  });
  test("creates balanced tree structure", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 2, token: 1 },
      { startOffsetInclusive: 2, length: 2, token: 2 },
      { startOffsetInclusive: 4, length: 2, token: 3 },
      { startOffsetInclusive: 6, length: 2, token: 4 }
    ], TokenQuality.Accurate);
    const root = store.root;
    assert.ok(root.children);
    assert.strictEqual(root.children.length, 2);
    assert.strictEqual(root.children[0].length, 4);
    assert.strictEqual(root.children[1].length, 4);
  });
  test("creates deep tree structure", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 1, token: 1 },
      { startOffsetInclusive: 1, length: 1, token: 2 },
      { startOffsetInclusive: 2, length: 1, token: 3 },
      { startOffsetInclusive: 3, length: 1, token: 4 },
      { startOffsetInclusive: 4, length: 1, token: 5 },
      { startOffsetInclusive: 5, length: 1, token: 6 },
      { startOffsetInclusive: 6, length: 1, token: 7 },
      { startOffsetInclusive: 7, length: 1, token: 8 }
    ], TokenQuality.Accurate);
    const root = store.root;
    assert.ok(root.children);
    assert.strictEqual(root.children.length, 2);
    assert.ok(root.children[0].children);
    assert.strictEqual(root.children[0].children.length, 2);
    assert.ok(root.children[0].children[0].children);
    assert.strictEqual(root.children[0].children[0].children.length, 2);
  });
  test("updates single token in middle", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.update(3, [
      { startOffsetInclusive: 3, length: 3, token: 4 }
    ], TokenQuality.Accurate);
    const tokens = store.root;
    assert.strictEqual(tokens.children[0].token, 1);
    assert.strictEqual(tokens.children[1].token, 4);
    assert.strictEqual(tokens.children[2].token, 3);
  });
  test("updates multiple consecutive tokens", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.update(6, [
      { startOffsetInclusive: 3, length: 3, token: 4 },
      { startOffsetInclusive: 6, length: 3, token: 5 }
    ], TokenQuality.Accurate);
    const tokens = store.root;
    assert.strictEqual(tokens.children[0].token, 1);
    assert.strictEqual(tokens.children[1].token, 4);
    assert.strictEqual(tokens.children[2].token, 5);
  });
  test("updates tokens at start of document", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.update(3, [
      { startOffsetInclusive: 0, length: 3, token: 4 }
    ], TokenQuality.Accurate);
    const tokens = store.root;
    assert.strictEqual(tokens.children[0].token, 4);
    assert.strictEqual(tokens.children[1].token, 2);
    assert.strictEqual(tokens.children[2].token, 3);
  });
  test("updates tokens at end of document", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.update(3, [
      { startOffsetInclusive: 6, length: 3, token: 4 }
    ], TokenQuality.Accurate);
    const tokens = store.root;
    assert.strictEqual(tokens.children[0].token, 1);
    assert.strictEqual(tokens.children[1].token, 2);
    assert.strictEqual(tokens.children[2].token, 4);
  });
  test("updates length of tokens", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.update(6, [
      { startOffsetInclusive: 3, length: 5, token: 4 }
    ], TokenQuality.Accurate);
    const tokens = store.root;
    assert.strictEqual(tokens.children[0].token, 1);
    assert.strictEqual(tokens.children[0].length, 3);
    assert.strictEqual(tokens.children[1].token, 4);
    assert.strictEqual(tokens.children[1].length, 5);
  });
  test("update deeply nested tree with new token length in the middle", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 1, token: 1 },
      { startOffsetInclusive: 1, length: 1, token: 2 },
      { startOffsetInclusive: 2, length: 1, token: 3 },
      { startOffsetInclusive: 3, length: 1, token: 4 },
      { startOffsetInclusive: 4, length: 1, token: 5 },
      { startOffsetInclusive: 5, length: 1, token: 6 },
      { startOffsetInclusive: 6, length: 1, token: 7 },
      { startOffsetInclusive: 7, length: 1, token: 8 }
    ], TokenQuality.Accurate);
    store.update(3, [
      { startOffsetInclusive: 3, length: 3, token: 9 }
    ], TokenQuality.Accurate);
    const root = store.root;
    assert.strictEqual(root.children.length, 3);
    assert.strictEqual(root.children[0].children.length, 2);
    assert.strictEqual(root.children[0].length, 2);
    assert.strictEqual(root.children[1].length, 4);
    assert.strictEqual(root.children[2].length, 2);
  });
  test("update deeply nested tree with a range of tokens that causes tokens to split", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 4, token: 3 },
      { startOffsetInclusive: 10, length: 5, token: 4 },
      { startOffsetInclusive: 15, length: 4, token: 5 },
      { startOffsetInclusive: 19, length: 3, token: 6 },
      { startOffsetInclusive: 22, length: 5, token: 7 },
      { startOffsetInclusive: 27, length: 3, token: 8 }
    ], TokenQuality.Accurate);
    store.update(8, [
      { startOffsetInclusive: 12, length: 4, token: 9 },
      { startOffsetInclusive: 16, length: 4, token: 10 }
    ], TokenQuality.Accurate);
    const root = store.root;
    assert.strictEqual(root.children.length, 2);
    assert.strictEqual(root.children[0].children.length, 2);
    assert.strictEqual(root.children[0].length, 12);
    assert.strictEqual(root.children[1].length, 18);
  });
  test("getTokensInRange returns tokens in middle of document", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(3, 6);
    assert.deepStrictEqual(tokens, [{ startOffsetInclusive: 3, length: 3, token: 2 }]);
  });
  test("getTokensInRange returns tokens at start of document", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(0, 3);
    assert.deepStrictEqual(tokens, [{ startOffsetInclusive: 0, length: 3, token: 1 }]);
  });
  test("getTokensInRange returns tokens at end of document", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(6, 9);
    assert.deepStrictEqual(tokens, [{ startOffsetInclusive: 6, length: 3, token: 3 }]);
  });
  test("getTokensInRange returns multiple tokens across nodes", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 1, token: 1 },
      { startOffsetInclusive: 1, length: 1, token: 2 },
      { startOffsetInclusive: 2, length: 1, token: 3 },
      { startOffsetInclusive: 3, length: 1, token: 4 },
      { startOffsetInclusive: 4, length: 1, token: 5 },
      { startOffsetInclusive: 5, length: 1, token: 6 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(2, 5);
    assert.deepStrictEqual(tokens, [
      { startOffsetInclusive: 2, length: 1, token: 3 },
      { startOffsetInclusive: 3, length: 1, token: 4 },
      { startOffsetInclusive: 4, length: 1, token: 5 }
    ]);
  });
  test("Realistic scenario one", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 164164 },
      { startOffsetInclusive: 3, length: 1, token: 32836 },
      { startOffsetInclusive: 4, length: 3, token: 164164 },
      { startOffsetInclusive: 7, length: 2, token: 32836 },
      { startOffsetInclusive: 9, length: 5, token: 196676 },
      { startOffsetInclusive: 14, length: 1, token: 32836 },
      { startOffsetInclusive: 15, length: 2, token: 557124 },
      { startOffsetInclusive: 17, length: 4, token: 32836 },
      { startOffsetInclusive: 21, length: 1, token: 32836 },
      { startOffsetInclusive: 22, length: 11, token: 196676 },
      { startOffsetInclusive: 33, length: 7, token: 32836 },
      { startOffsetInclusive: 40, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
    store.update(33, [
      { startOffsetInclusive: 9, length: 5, token: 196676 },
      { startOffsetInclusive: 14, length: 1, token: 32836 },
      { startOffsetInclusive: 15, length: 2, token: 557124 },
      { startOffsetInclusive: 17, length: 4, token: 32836 },
      { startOffsetInclusive: 21, length: 1, token: 32836 },
      { startOffsetInclusive: 22, length: 11, token: 196676 },
      { startOffsetInclusive: 33, length: 8, token: 32836 },
      { startOffsetInclusive: 41, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
  });
  test("Realistic scenario two", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 5, token: 196676 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 1, token: 557124 },
      { startOffsetInclusive: 7, length: 4, token: 32836 },
      { startOffsetInclusive: 11, length: 3, token: 32836 },
      { startOffsetInclusive: 14, length: 3, token: 32836 },
      { startOffsetInclusive: 17, length: 5, token: 196676 },
      { startOffsetInclusive: 22, length: 1, token: 32836 },
      { startOffsetInclusive: 23, length: 1, token: 557124 },
      { startOffsetInclusive: 24, length: 4, token: 32836 },
      { startOffsetInclusive: 28, length: 2, token: 32836 },
      { startOffsetInclusive: 30, length: 1, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens0 = store.getTokensInRange(0, 16);
    assert.deepStrictEqual(tokens0, [
      { token: 196676, startOffsetInclusive: 0, length: 5 },
      { token: 32836, startOffsetInclusive: 5, length: 1 },
      { token: 557124, startOffsetInclusive: 6, length: 1 },
      { token: 32836, startOffsetInclusive: 7, length: 4 },
      { token: 32836, startOffsetInclusive: 11, length: 3 },
      { token: 32836, startOffsetInclusive: 14, length: 2 }
    ]);
    store.update(14, [
      { startOffsetInclusive: 0, length: 5, token: 196676 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 1, token: 557124 },
      { startOffsetInclusive: 7, length: 4, token: 32836 },
      { startOffsetInclusive: 11, length: 2, token: 32836 },
      { startOffsetInclusive: 13, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(0, 16);
    assert.deepStrictEqual(tokens, [
      { token: 196676, startOffsetInclusive: 0, length: 5 },
      { token: 32836, startOffsetInclusive: 5, length: 1 },
      { token: 557124, startOffsetInclusive: 6, length: 1 },
      { token: 32836, startOffsetInclusive: 7, length: 4 },
      { token: 32836, startOffsetInclusive: 11, length: 2 },
      { token: 32836, startOffsetInclusive: 13, length: 3 }
    ]);
  });
  test("Realistic scenario three", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 5, token: 164164 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 5, token: 164164 },
      { startOffsetInclusive: 11, length: 2, token: 32836 },
      { startOffsetInclusive: 13, length: 5, token: 196676 },
      { startOffsetInclusive: 18, length: 1, token: 32836 },
      { startOffsetInclusive: 19, length: 12, token: 557124 },
      { startOffsetInclusive: 31, length: 4, token: 32836 },
      { startOffsetInclusive: 35, length: 1, token: 32836 },
      { startOffsetInclusive: 36, length: 11, token: 196676 },
      { startOffsetInclusive: 47, length: 3, token: 32836 },
      { startOffsetInclusive: 50, length: 2, token: 32836 },
      { startOffsetInclusive: 52, length: 7, token: 327748 },
      { startOffsetInclusive: 59, length: 1, token: 98372 },
      { startOffsetInclusive: 60, length: 1, token: 32836 },
      { startOffsetInclusive: 61, length: 19, token: 557124 },
      { startOffsetInclusive: 80, length: 1, token: 32836 },
      { startOffsetInclusive: 81, length: 2, token: 32836 },
      { startOffsetInclusive: 83, length: 6, token: 32836 },
      { startOffsetInclusive: 89, length: 4, token: 32836 },
      { startOffsetInclusive: 93, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens0 = store.getTokensInRange(36, 59);
    assert.deepStrictEqual(tokens0, [
      { token: 196676, startOffsetInclusive: 36, length: 11 },
      { token: 32836, startOffsetInclusive: 47, length: 3 },
      { token: 32836, startOffsetInclusive: 50, length: 2 },
      { token: 327748, startOffsetInclusive: 52, length: 7 }
    ]);
    store.update(82, [
      { startOffsetInclusive: 13, length: 5, token: 196676 },
      { startOffsetInclusive: 18, length: 1, token: 32836 },
      { startOffsetInclusive: 19, length: 12, token: 557124 },
      { startOffsetInclusive: 31, length: 4, token: 32836 },
      { startOffsetInclusive: 35, length: 1, token: 32836 },
      { startOffsetInclusive: 36, length: 11, token: 196676 },
      { startOffsetInclusive: 47, length: 3, token: 32836 },
      { startOffsetInclusive: 50, length: 2, token: 32836 },
      { startOffsetInclusive: 52, length: 7, token: 327748 },
      { startOffsetInclusive: 59, length: 1, token: 98372 },
      { startOffsetInclusive: 60, length: 1, token: 32836 },
      { startOffsetInclusive: 61, length: 19, token: 557124 },
      { startOffsetInclusive: 80, length: 1, token: 32836 },
      { startOffsetInclusive: 81, length: 2, token: 32836 },
      { startOffsetInclusive: 83, length: 7, token: 32836 },
      { startOffsetInclusive: 90, length: 4, token: 32836 },
      { startOffsetInclusive: 94, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(36, 59);
    assert.deepStrictEqual(tokens, [
      { token: 196676, startOffsetInclusive: 36, length: 11 },
      { token: 32836, startOffsetInclusive: 47, length: 3 },
      { token: 32836, startOffsetInclusive: 50, length: 2 },
      { token: 327748, startOffsetInclusive: 52, length: 7 }
    ]);
  });
  test("Realistic scenario four", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 8, token: 196676 },
      { startOffsetInclusive: 8, length: 1, token: 32836 },
      { startOffsetInclusive: 9, length: 1, token: 524356 },
      { startOffsetInclusive: 10, length: 6, token: 32836 },
      { startOffsetInclusive: 16, length: 1, token: 32836 },
      { startOffsetInclusive: 17, length: 6, token: 589892 },
      { startOffsetInclusive: 23, length: 1, token: 32836 },
      { startOffsetInclusive: 24, length: 4, token: 196676 },
      { startOffsetInclusive: 28, length: 1, token: 32836 },
      { startOffsetInclusive: 29, length: 2, token: 32836 },
      { startOffsetInclusive: 31, length: 3, token: 32836 },
      // This is the closing curly brace + newline chars
      { startOffsetInclusive: 34, length: 2, token: 32836 },
      { startOffsetInclusive: 36, length: 5, token: 196676 },
      { startOffsetInclusive: 41, length: 1, token: 32836 },
      { startOffsetInclusive: 42, length: 1, token: 557124 },
      { startOffsetInclusive: 43, length: 4, token: 32836 },
      { startOffsetInclusive: 47, length: 1, token: 32836 },
      { startOffsetInclusive: 48, length: 7, token: 196676 },
      { startOffsetInclusive: 55, length: 1, token: 32836 },
      { startOffsetInclusive: 56, length: 1, token: 327748 },
      { startOffsetInclusive: 57, length: 1, token: 32836 },
      { startOffsetInclusive: 58, length: 1, token: 98372 },
      { startOffsetInclusive: 59, length: 1, token: 32836 },
      { startOffsetInclusive: 60, length: 5, token: 196676 },
      { startOffsetInclusive: 65, length: 1, token: 32836 },
      { startOffsetInclusive: 66, length: 2, token: 32836 },
      { startOffsetInclusive: 68, length: 1, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens0 = store.getTokensInRange(36, 59);
    assert.deepStrictEqual(tokens0, [
      { startOffsetInclusive: 36, length: 5, token: 196676 },
      { startOffsetInclusive: 41, length: 1, token: 32836 },
      { startOffsetInclusive: 42, length: 1, token: 557124 },
      { startOffsetInclusive: 43, length: 4, token: 32836 },
      { startOffsetInclusive: 47, length: 1, token: 32836 },
      { startOffsetInclusive: 48, length: 7, token: 196676 },
      { startOffsetInclusive: 55, length: 1, token: 32836 },
      { startOffsetInclusive: 56, length: 1, token: 327748 },
      { startOffsetInclusive: 57, length: 1, token: 32836 },
      { startOffsetInclusive: 58, length: 1, token: 98372 }
    ]);
    store.update(32, [
      { startOffsetInclusive: 0, length: 8, token: 196676 },
      { startOffsetInclusive: 8, length: 1, token: 32836 },
      { startOffsetInclusive: 9, length: 1, token: 524356 },
      { startOffsetInclusive: 10, length: 6, token: 32836 },
      { startOffsetInclusive: 16, length: 1, token: 32836 },
      { startOffsetInclusive: 17, length: 6, token: 589892 },
      { startOffsetInclusive: 23, length: 1, token: 32836 },
      { startOffsetInclusive: 24, length: 4, token: 196676 },
      { startOffsetInclusive: 28, length: 1, token: 32836 },
      { startOffsetInclusive: 29, length: 2, token: 32836 },
      { startOffsetInclusive: 31, length: 3, token: 32836 },
      // This is the new line, which consists of 3 characters: \t\r\n
      { startOffsetInclusive: 34, length: 2, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens1 = store.getTokensInRange(36, 59);
    assert.deepStrictEqual(tokens1, [
      { startOffsetInclusive: 36, length: 2, token: 32836 },
      { startOffsetInclusive: 38, length: 2, token: 32836 },
      { startOffsetInclusive: 40, length: 5, token: 196676 },
      { startOffsetInclusive: 45, length: 1, token: 32836 },
      { startOffsetInclusive: 46, length: 1, token: 557124 },
      { startOffsetInclusive: 47, length: 4, token: 32836 },
      { startOffsetInclusive: 51, length: 1, token: 32836 },
      { startOffsetInclusive: 52, length: 7, token: 196676 }
    ]);
    store.update(37, [
      { startOffsetInclusive: 0, length: 8, token: 196676 },
      { startOffsetInclusive: 8, length: 1, token: 32836 },
      { startOffsetInclusive: 9, length: 1, token: 524356 },
      { startOffsetInclusive: 10, length: 6, token: 32836 },
      { startOffsetInclusive: 16, length: 1, token: 32836 },
      { startOffsetInclusive: 17, length: 6, token: 589892 },
      { startOffsetInclusive: 23, length: 1, token: 32836 },
      { startOffsetInclusive: 24, length: 4, token: 196676 },
      { startOffsetInclusive: 28, length: 1, token: 32836 },
      { startOffsetInclusive: 29, length: 2, token: 32836 },
      { startOffsetInclusive: 31, length: 2, token: 32836 },
      // This is the changed line: \t\r\n to \r\n
      { startOffsetInclusive: 33, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens2 = store.getTokensInRange(36, 59);
    assert.deepStrictEqual(tokens2, [
      { startOffsetInclusive: 36, length: 1, token: 32836 },
      { startOffsetInclusive: 37, length: 2, token: 32836 },
      { startOffsetInclusive: 39, length: 5, token: 196676 },
      { startOffsetInclusive: 44, length: 1, token: 32836 },
      { startOffsetInclusive: 45, length: 1, token: 557124 },
      { startOffsetInclusive: 46, length: 4, token: 32836 },
      { startOffsetInclusive: 50, length: 1, token: 32836 },
      { startOffsetInclusive: 51, length: 7, token: 196676 },
      { startOffsetInclusive: 58, length: 1, token: 32836 }
    ]);
  });
  test("Insert new line and remove tabs (split tokens)", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 5, token: 196676 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 1, token: 557124 },
      { startOffsetInclusive: 7, length: 3, token: 32836 },
      { startOffsetInclusive: 10, length: 1, token: 32836 },
      { startOffsetInclusive: 11, length: 1, token: 524356 },
      { startOffsetInclusive: 12, length: 5, token: 32836 },
      { startOffsetInclusive: 17, length: 3, token: 32836 },
      // This is the closing curly brace line of a()
      { startOffsetInclusive: 20, length: 2, token: 32836 },
      { startOffsetInclusive: 22, length: 1, token: 32836 },
      { startOffsetInclusive: 23, length: 9, token: 196676 },
      { startOffsetInclusive: 32, length: 1, token: 32836 },
      { startOffsetInclusive: 33, length: 1, token: 557124 },
      { startOffsetInclusive: 34, length: 3, token: 32836 },
      { startOffsetInclusive: 37, length: 1, token: 32836 },
      { startOffsetInclusive: 38, length: 1, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens0 = store.getTokensInRange(23, 39);
    assert.deepStrictEqual(tokens0, [
      { startOffsetInclusive: 23, length: 9, token: 196676 },
      { startOffsetInclusive: 32, length: 1, token: 32836 },
      { startOffsetInclusive: 33, length: 1, token: 557124 },
      { startOffsetInclusive: 34, length: 3, token: 32836 },
      { startOffsetInclusive: 37, length: 1, token: 32836 },
      { startOffsetInclusive: 38, length: 1, token: 32836 }
    ]);
    store.update(21, [
      { startOffsetInclusive: 0, length: 5, token: 196676 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 1, token: 557124 },
      { startOffsetInclusive: 7, length: 3, token: 32836 },
      { startOffsetInclusive: 10, length: 1, token: 32836 },
      { startOffsetInclusive: 11, length: 1, token: 524356 },
      { startOffsetInclusive: 12, length: 5, token: 32836 },
      { startOffsetInclusive: 17, length: 3, token: 32836 },
      { startOffsetInclusive: 20, length: 3, token: 32836 },
      { startOffsetInclusive: 23, length: 1, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens1 = store.getTokensInRange(26, 42);
    assert.deepStrictEqual(tokens1, [
      { startOffsetInclusive: 26, length: 9, token: 196676 },
      { startOffsetInclusive: 35, length: 1, token: 32836 },
      { startOffsetInclusive: 36, length: 1, token: 557124 },
      { startOffsetInclusive: 37, length: 3, token: 32836 },
      { startOffsetInclusive: 40, length: 1, token: 32836 },
      { startOffsetInclusive: 41, length: 1, token: 32836 }
    ]);
    store.update(24, [
      { startOffsetInclusive: 0, length: 5, token: 196676 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 1, token: 557124 },
      { startOffsetInclusive: 7, length: 3, token: 32836 },
      { startOffsetInclusive: 10, length: 1, token: 32836 },
      { startOffsetInclusive: 11, length: 1, token: 524356 },
      { startOffsetInclusive: 12, length: 5, token: 32836 },
      { startOffsetInclusive: 17, length: 3, token: 32836 },
      { startOffsetInclusive: 20, length: 1, token: 32836 },
      { startOffsetInclusive: 21, length: 2, token: 32836 },
      { startOffsetInclusive: 23, length: 1, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens2 = store.getTokensInRange(26, 42);
    assert.deepStrictEqual(tokens2, [
      { startOffsetInclusive: 26, length: 9, token: 196676 },
      { startOffsetInclusive: 35, length: 1, token: 32836 },
      { startOffsetInclusive: 36, length: 1, token: 557124 },
      { startOffsetInclusive: 37, length: 3, token: 32836 },
      { startOffsetInclusive: 40, length: 1, token: 32836 },
      { startOffsetInclusive: 41, length: 1, token: 32836 }
    ]);
  });
  test("delete removes tokens in the middle", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.delete(3, 3);
    const tokens = store.getTokensInRange(0, 9);
    assert.deepStrictEqual(tokens, [
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 3 }
    ]);
  });
  test("delete merges partially affected token", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 5, token: 1 },
      { startOffsetInclusive: 5, length: 5, token: 2 }
    ], TokenQuality.Accurate);
    store.delete(3, 4);
    const tokens = store.getTokensInRange(0, 10);
    assert.deepStrictEqual(tokens, [
      { startOffsetInclusive: 0, length: 4, token: 1 },
      // token 2 is now shifted left by 4
      { startOffsetInclusive: 4, length: 3, token: 2 }
    ]);
  });
  test("replace a token with a slightly larger token", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 5, token: 1 },
      { startOffsetInclusive: 5, length: 1, token: 2 },
      { startOffsetInclusive: 6, length: 1, token: 2 },
      { startOffsetInclusive: 7, length: 17, token: 2 },
      { startOffsetInclusive: 24, length: 1, token: 2 },
      { startOffsetInclusive: 25, length: 5, token: 2 },
      { startOffsetInclusive: 30, length: 1, token: 2 },
      { startOffsetInclusive: 31, length: 1, token: 2 },
      { startOffsetInclusive: 32, length: 5, token: 2 }
    ], TokenQuality.Accurate);
    store.update(17, [{ startOffsetInclusive: 7, length: 19, token: 0 }], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(0, 39);
    assert.deepStrictEqual(tokens, [
      { startOffsetInclusive: 0, length: 5, token: 1 },
      { startOffsetInclusive: 5, length: 1, token: 2 },
      { startOffsetInclusive: 6, length: 1, token: 2 },
      { startOffsetInclusive: 7, length: 19, token: 0 },
      { startOffsetInclusive: 26, length: 1, token: 2 },
      { startOffsetInclusive: 27, length: 5, token: 2 },
      { startOffsetInclusive: 32, length: 1, token: 2 },
      { startOffsetInclusive: 33, length: 1, token: 2 },
      { startOffsetInclusive: 34, length: 5, token: 2 }
    ]);
  });
  test("replace a character from a large token", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 2, token: 1 },
      { startOffsetInclusive: 2, length: 5, token: 2 },
      { startOffsetInclusive: 7, length: 1, token: 3 }
    ], TokenQuality.Accurate);
    store.delete(1, 3);
    const tokens = store.getTokensInRange(0, 7);
    assert.deepStrictEqual(tokens, [
      { startOffsetInclusive: 0, length: 2, token: 1 },
      { startOffsetInclusive: 2, length: 1, token: 2 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 1, token: 3 }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXHRva2VuU3RvcmUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBMZWFmTm9kZSwgTGlzdE5vZGUsIFRva2VuUXVhbGl0eSwgVG9rZW5TdG9yZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90b2tlbnMvdHJlZVNpdHRlci90b2tlblN0b3JlLmpzJztcblxuc3VpdGUoJ1Rva2VuU3RvcmUnLCAoKSA9PiB7XG5cdGxldCB0ZXh0TW9kZWw6IFRleHRNb2RlbDtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHRleHRNb2RlbCA9IHtcblx0XHRcdGdldFZhbHVlTGVuZ3RoOiAoKSA9PiAxMVxuXHRcdH0gYXMgVGV4dE1vZGVsO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zdHJ1Y3RzIHdpdGggZW1wdHkgbW9kZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdGFzc2VydC5vayhzdG9yZS5yb290KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUucm9vdC5sZW5ndGgsIHRleHRNb2RlbC5nZXRWYWx1ZUxlbmd0aCgpKTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRzIHN0b3JlIHdpdGggc2luZ2xlIHRva2VuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFt7XG5cdFx0XHRzdGFydE9mZnNldEluY2x1c2l2ZTogMCxcblx0XHRcdGxlbmd0aDogNSxcblx0XHRcdHRva2VuOiAxXG5cdFx0fV0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLnJvb3QubGVuZ3RoLCA1KTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRzIHN0b3JlIHdpdGggbXVsdGlwbGUgdG9rZW5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMywgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogNCwgdG9rZW46IDMgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cdFx0YXNzZXJ0Lm9rKHN0b3JlLnJvb3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5yb290Lmxlbmd0aCwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVzIGJhbGFuY2VkIHRyZWUgc3RydWN0dXJlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMiwgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIsIGxlbmd0aDogMiwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQsIGxlbmd0aDogMiwgdG9rZW46IDMgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMiwgdG9rZW46IDQgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCByb290ID0gc3RvcmUucm9vdCBhcyBMaXN0Tm9kZTtcblx0XHRhc3NlcnQub2socm9vdC5jaGlsZHJlbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QuY2hpbGRyZW4ubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5jaGlsZHJlblswXS5sZW5ndGgsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LmNoaWxkcmVuWzFdLmxlbmd0aCwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgZGVlcCB0cmVlIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDEsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxLCBsZW5ndGg6IDEsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyLCBsZW5ndGg6IDEsIHRva2VuOiAzIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDEsIHRva2VuOiA0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0LCBsZW5ndGg6IDEsIHRva2VuOiA1IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1LCBsZW5ndGg6IDEsIHRva2VuOiA2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDEsIHRva2VuOiA3IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA3LCBsZW5ndGg6IDEsIHRva2VuOiA4IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IHN0b3JlLnJvb3QgYXMgTGlzdE5vZGU7XG5cdFx0YXNzZXJ0Lm9rKHJvb3QuY2hpbGRyZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LmNoaWxkcmVuLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKChyb290LmNoaWxkcmVuWzBdIGFzIExpc3ROb2RlKS5jaGlsZHJlbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyb290LmNoaWxkcmVuWzBdIGFzIExpc3ROb2RlKS5jaGlsZHJlbi5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vaygoKHJvb3QuY2hpbGRyZW5bMF0gYXMgTGlzdE5vZGUpLmNoaWxkcmVuWzBdIGFzIExpc3ROb2RlKS5jaGlsZHJlbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCgocm9vdC5jaGlsZHJlblswXSBhcyBMaXN0Tm9kZSkuY2hpbGRyZW5bMF0gYXMgTGlzdE5vZGUpLmNoaWxkcmVuLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgc2luZ2xlIHRva2VuIGluIG1pZGRsZScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDMsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDMsIHRva2VuOiAzIH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0c3RvcmUudXBkYXRlKDMsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDQgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMgPSBzdG9yZS5yb290IGFzIExpc3ROb2RlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodG9rZW5zLmNoaWxkcmVuWzBdIGFzIExlYWZOb2RlKS50b2tlbiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b2tlbnMuY2hpbGRyZW5bMV0gYXMgTGVhZk5vZGUpLnRva2VuLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRva2Vucy5jaGlsZHJlblsyXSBhcyBMZWFmTm9kZSkudG9rZW4sIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIG11bHRpcGxlIGNvbnNlY3V0aXZlIHRva2VucycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDMsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDMsIHRva2VuOiAzIH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0c3RvcmUudXBkYXRlKDYsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMywgdG9rZW46IDUgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMgPSBzdG9yZS5yb290IGFzIExpc3ROb2RlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodG9rZW5zLmNoaWxkcmVuWzBdIGFzIExlYWZOb2RlKS50b2tlbiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b2tlbnMuY2hpbGRyZW5bMV0gYXMgTGVhZk5vZGUpLnRva2VuLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRva2Vucy5jaGlsZHJlblsyXSBhcyBMZWFmTm9kZSkudG9rZW4sIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHRva2VucyBhdCBzdGFydCBvZiBkb2N1bWVudCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDMsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDMsIHRva2VuOiAzIH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0c3RvcmUudXBkYXRlKDMsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMywgdG9rZW46IDQgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMgPSBzdG9yZS5yb290IGFzIExpc3ROb2RlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodG9rZW5zLmNoaWxkcmVuWzBdIGFzIExlYWZOb2RlKS50b2tlbiwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b2tlbnMuY2hpbGRyZW5bMV0gYXMgTGVhZk5vZGUpLnRva2VuLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRva2Vucy5jaGlsZHJlblsyXSBhcyBMZWFmTm9kZSkudG9rZW4sIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHRva2VucyBhdCBlbmQgb2YgZG9jdW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAzLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAzLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAzLCB0b2tlbjogMyB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdHN0b3JlLnVwZGF0ZSgzLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDMsIHRva2VuOiA0IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUucm9vdCBhcyBMaXN0Tm9kZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRva2Vucy5jaGlsZHJlblswXSBhcyBMZWFmTm9kZSkudG9rZW4sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodG9rZW5zLmNoaWxkcmVuWzFdIGFzIExlYWZOb2RlKS50b2tlbiwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b2tlbnMuY2hpbGRyZW5bMl0gYXMgTGVhZk5vZGUpLnRva2VuLCA0KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyBsZW5ndGggb2YgdG9rZW5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMywgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMywgdG9rZW46IDMgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRzdG9yZS51cGRhdGUoNiwgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiA1LCB0b2tlbjogNCB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdGNvbnN0IHRva2VucyA9IHN0b3JlLnJvb3QgYXMgTGlzdE5vZGU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b2tlbnMuY2hpbGRyZW5bMF0gYXMgTGVhZk5vZGUpLnRva2VuLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9rZW5zLmNoaWxkcmVuWzBdLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b2tlbnMuY2hpbGRyZW5bMV0gYXMgTGVhZk5vZGUpLnRva2VuLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9rZW5zLmNoaWxkcmVuWzFdLmxlbmd0aCwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZSBkZWVwbHkgbmVzdGVkIHRyZWUgd2l0aCBuZXcgdG9rZW4gbGVuZ3RoIGluIHRoZSBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAxLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMSwgbGVuZ3RoOiAxLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMiwgbGVuZ3RoOiAxLCB0b2tlbjogMyB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAxLCB0b2tlbjogNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNCwgbGVuZ3RoOiAxLCB0b2tlbjogNSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNSwgbGVuZ3RoOiAxLCB0b2tlbjogNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAxLCB0b2tlbjogNyB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNywgbGVuZ3RoOiAxLCB0b2tlbjogOCB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdC8vIFVwZGF0ZSB0b2tlbiBpbiB0aGUgbWlkZGxlIChwb3NpdGlvbiAzLTQpIHRvIHNwYW4gMy02XG5cdFx0c3RvcmUudXBkYXRlKDMsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDkgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCByb290ID0gc3RvcmUucm9vdCBhcyBMaXN0Tm9kZTtcblx0XHQvLyBWZXJpZnkgdGhlIHN0cnVjdHVyZSByZW1haW5zIGJhbGFuY2VkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QuY2hpbGRyZW4ubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJvb3QuY2hpbGRyZW5bMF0gYXMgTGlzdE5vZGUpLmNoaWxkcmVuLmxlbmd0aCwgMik7XG5cblx0XHQvLyBWZXJpZnkgdGhlIGxlbmd0aHMgYXJlIHVwZGF0ZWQgY29ycmVjdGx5XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QuY2hpbGRyZW5bMF0ubGVuZ3RoLCAyKTsgLy8gRmlyc3QgMiB0b2tlbnNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5jaGlsZHJlblsxXS5sZW5ndGgsIDQpOyAvLyBUb2tlbiAzICsgb3VyIG5ldyBsb25nZXIgdG9rZW5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5jaGlsZHJlblsyXS5sZW5ndGgsIDIpOyAvLyBMYXN0IDIgdG9rZW5zXG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZSBkZWVwbHkgbmVzdGVkIHRyZWUgd2l0aCBhIHJhbmdlIG9mIHRva2VucyB0aGF0IGNhdXNlcyB0b2tlbnMgdG8gc3BsaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAzLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAzLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiA0LCB0b2tlbjogMyB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTAsIGxlbmd0aDogNSwgdG9rZW46IDQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE1LCBsZW5ndGg6IDQsIHRva2VuOiA1IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxOSwgbGVuZ3RoOiAzLCB0b2tlbjogNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjIsIGxlbmd0aDogNSwgdG9rZW46IDcgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI3LCBsZW5ndGg6IDMsIHRva2VuOiA4IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Ly8gVXBkYXRlIHRva2VuIGluIHRoZSBtaWRkbGUgd2hpY2ggY2F1c2VzIHRva2VucyB0byBzcGxpdFxuXHRcdHN0b3JlLnVwZGF0ZSg4LCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMiwgbGVuZ3RoOiA0LCB0b2tlbjogOSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTYsIGxlbmd0aDogNCwgdG9rZW46IDEwIH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IHN0b3JlLnJvb3QgYXMgTGlzdE5vZGU7XG5cdFx0Ly8gVmVyaWZ5IHRoZSBzdHJ1Y3R1cmUgcmVtYWlucyBiYWxhbmNlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LmNoaWxkcmVuLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyb290LmNoaWxkcmVuWzBdIGFzIExpc3ROb2RlKS5jaGlsZHJlbi5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBsZW5ndGhzIGFyZSB1cGRhdGVkIGNvcnJlY3RseVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LmNoaWxkcmVuWzBdLmxlbmd0aCwgMTIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LmNoaWxkcmVuWzFdLmxlbmd0aCwgMTgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRUb2tlbnNJblJhbmdlIHJldHVybnMgdG9rZW5zIGluIG1pZGRsZSBvZiBkb2N1bWVudCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDMsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDMsIHRva2VuOiAzIH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgzLCA2KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VucywgW3sgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDIgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRUb2tlbnNJblJhbmdlIHJldHVybnMgdG9rZW5zIGF0IHN0YXJ0IG9mIGRvY3VtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMywgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMywgdG9rZW46IDMgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMgPSBzdG9yZS5nZXRUb2tlbnNJblJhbmdlKDAsIDMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zLCBbeyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAzLCB0b2tlbjogMSB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRva2Vuc0luUmFuZ2UgcmV0dXJucyB0b2tlbnMgYXQgZW5kIG9mIGRvY3VtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMywgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMywgdG9rZW46IDMgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMgPSBzdG9yZS5nZXRUb2tlbnNJblJhbmdlKDYsIDkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zLCBbeyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAzLCB0b2tlbjogMyB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRva2Vuc0luUmFuZ2UgcmV0dXJucyBtdWx0aXBsZSB0b2tlbnMgYWNyb3NzIG5vZGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMSwgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEsIGxlbmd0aDogMSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIsIGxlbmd0aDogMSwgdG9rZW46IDMgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMSwgdG9rZW46IDQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQsIGxlbmd0aDogMSwgdG9rZW46IDUgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUsIGxlbmd0aDogMSwgdG9rZW46IDYgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMgPSBzdG9yZS5nZXRUb2tlbnNJblJhbmdlKDIsIDUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyLCBsZW5ndGg6IDEsIHRva2VuOiAzIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDEsIHRva2VuOiA0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0LCBsZW5ndGg6IDEsIHRva2VuOiA1IH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnUmVhbGlzdGljIHNjZW5hcmlvIG9uZScsICgpID0+IHtcblx0XHQvLyBpbnNwaXJlZCBieSB0aGlzIHNuaXBwZXQsIHdpdGggdGhlIHVwZGF0ZSBhZGRpbmcgYSBzcGFjZSBpbiB0aGUgY29uc3RydWN0b3IncyBjdXJseSBicmFjZXM6XG5cdFx0Ly8gLypcblx0XHQvLyAqL1xuXHRcdC8vIGNsYXNzIFhZIHtcblx0XHQvLyBcdGNvbnN0cnVjdG9yKCkge31cblx0XHQvLyB9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDMsIHRva2VuOiAxNjQxNjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0LCBsZW5ndGg6IDMsIHRva2VuOiAxNjQxNjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDcsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA5LCBsZW5ndGg6IDUsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE0LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTUsIGxlbmd0aDogMiwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTcsIGxlbmd0aDogNCwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIyLCBsZW5ndGg6IDExLCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMywgbGVuZ3RoOiA3LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQwLCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdHN0b3JlLnVwZGF0ZSgzMywgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogOSwgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE1LCBsZW5ndGg6IDIsIHRva2VuOiA1NTcxMjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE3LCBsZW5ndGg6IDQsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjEsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMiwgbGVuZ3RoOiAxMSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzMsIGxlbmd0aDogOCwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0MSwgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0fSk7XG5cdHRlc3QoJ1JlYWxpc3RpYyBzY2VuYXJpbyB0d28nLCAoKSA9PiB7XG5cdFx0Ly8gaW5zcGlyZWQgYnkgdGhpcyBzbmlwcGV0LCB3aXRoIHRoZSB1cGRhdGUgZGVsZXRlaW5nIHRoZSBzcGFjZSBpbiB0aGUgYm9keSBvZiBjbGFzcyB4XG5cdFx0Ly8gY2xhc3MgeCB7XG5cdFx0Ly9cblx0XHQvLyB9XG5cdFx0Ly8gY2xhc3MgeSB7XG5cblx0XHQvLyB9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDUsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDEsIHRva2VuOiA1NTcxMjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDcsIGxlbmd0aDogNCwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMSwgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE0LCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTcsIGxlbmd0aDogNSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjIsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMywgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyNCwgbGVuZ3RoOiA0LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI4LCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzAsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXHRcdGNvbnN0IHRva2VuczAgPSBzdG9yZS5nZXRUb2tlbnNJblJhbmdlKDAsIDE2KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VuczAsIFtcblx0XHRcdHsgdG9rZW46IDE5NjY3Niwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogNSB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1LCBsZW5ndGg6IDEgfSxcblx0XHRcdHsgdG9rZW46IDU1NzEyNCwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMSB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA3LCBsZW5ndGg6IDQgfSxcblx0XHRcdHsgdG9rZW46IDMyODM2LCBzdGFydE9mZnNldEluY2x1c2l2ZTogMTEsIGxlbmd0aDogMyB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNCwgbGVuZ3RoOiAyIH1cblx0XHRdKTtcblxuXHRcdHN0b3JlLnVwZGF0ZSgxNCwgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA3LCBsZW5ndGg6IDQsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTEsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMywgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMgPSBzdG9yZS5nZXRUb2tlbnNJblJhbmdlKDAsIDE2KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VucywgW1xuXHRcdFx0eyB0b2tlbjogMTk2Njc2LCBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiA1IH0sXG5cdFx0XHR7IHRva2VuOiAzMjgzNiwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUsIGxlbmd0aDogMSB9LFxuXHRcdFx0eyB0b2tlbjogNTU3MTI0LCBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAxIH0sXG5cdFx0XHR7IHRva2VuOiAzMjgzNiwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDcsIGxlbmd0aDogNCB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMSwgbGVuZ3RoOiAyIH0sXG5cdFx0XHR7IHRva2VuOiAzMjgzNiwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEzLCBsZW5ndGg6IDMgfVxuXHRcdF0pO1xuXHR9KTtcblx0dGVzdCgnUmVhbGlzdGljIHNjZW5hcmlvIHRocmVlJywgKCkgPT4ge1xuXHRcdC8vIGluc3BpcmVkIGJ5IHRoaXMgc25pcHBldCwgd2l0aCB0aGUgdXBkYXRlIGFkZGluZyBhIHNwYWNlIGFmdGVyIHRoZSB7IGluIHRoZSBjb25zdHJ1Y3RvclxuXHRcdC8vIC8qLS1cblx0XHQvLyAgLS0qL1xuXHRcdC8vICBjbGFzcyBUcmVlVmlld1BhbmUge1xuXHRcdC8vIFx0Y29uc3RydWN0b3IoXG5cdFx0Ly8gXHRcdG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0Ly8gXHQpIHtcblx0XHQvLyBcdH1cblx0XHQvLyB9XG5cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogNSwgdG9rZW46IDE2NDE2NCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogNSwgdG9rZW46IDE2NDE2NCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTEsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMywgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxOCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE5LCBsZW5ndGg6IDEyLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMSwgbGVuZ3RoOiA0LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzYsIGxlbmd0aDogMTEsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQ3LCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTAsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1MiwgbGVuZ3RoOiA3LCB0b2tlbjogMzI3NzQ4IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1OSwgbGVuZ3RoOiAxLCB0b2tlbjogOTgzNzIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNjEsIGxlbmd0aDogMTksIHRva2VuOiA1NTcxMjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDgwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogODEsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA4MywgbGVuZ3RoOiA2LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDg5LCBsZW5ndGg6IDQsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogOTMsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXHRcdGNvbnN0IHRva2VuczAgPSBzdG9yZS5nZXRUb2tlbnNJblJhbmdlKDM2LCA1OSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnMwLCBbXG5cdFx0XHR7IHRva2VuOiAxOTY2NzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNiwgbGVuZ3RoOiAxMSB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0NywgbGVuZ3RoOiAzIH0sXG5cdFx0XHR7IHRva2VuOiAzMjgzNiwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUwLCBsZW5ndGg6IDIgfSxcblx0XHRcdHsgdG9rZW46IDMyNzc0OCwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUyLCBsZW5ndGg6IDcgfVxuXHRcdF0pO1xuXG5cdFx0c3RvcmUudXBkYXRlKDgyLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMywgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxOCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE5LCBsZW5ndGg6IDEyLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMSwgbGVuZ3RoOiA0LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzYsIGxlbmd0aDogMTEsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQ3LCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTAsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1MiwgbGVuZ3RoOiA3LCB0b2tlbjogMzI3NzQ4IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1OSwgbGVuZ3RoOiAxLCB0b2tlbjogOTgzNzIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNjEsIGxlbmd0aDogMTksIHRva2VuOiA1NTcxMjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDgwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogODEsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA4MywgbGVuZ3RoOiA3LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDkwLCBsZW5ndGg6IDQsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogOTQsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgzNiwgNTkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zLCBbXG5cdFx0XHR7IHRva2VuOiAxOTY2NzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNiwgbGVuZ3RoOiAxMSB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0NywgbGVuZ3RoOiAzIH0sXG5cdFx0XHR7IHRva2VuOiAzMjgzNiwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUwLCBsZW5ndGg6IDIgfSxcblx0XHRcdHsgdG9rZW46IDMyNzc0OCwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUyLCBsZW5ndGg6IDcgfVxuXHRcdF0pO1xuXHR9KTtcblx0dGVzdCgnUmVhbGlzdGljIHNjZW5hcmlvIGZvdXInLCAoKSA9PiB7XG5cdFx0Ly8gaW5zcGlyZWQgYnkgdGhpcyBzbmlwcGV0LCB3aXRoIHRoZSB1cGRhdGUgYWRkaW5nIGEgbmV3IGxpbmUgYWZ0ZXIgdGhlIHJldHVybiB0cnVlO1xuXHRcdC8vIGZ1bmN0aW9uIHgoKSB7XG5cdFx0Ly8gXHRyZXR1cm4gdHJ1ZTtcblx0XHQvLyB9XG5cblx0XHQvLyBjbGFzcyBZIHtcblx0XHQvLyBcdHByaXZhdGUgeiA9IGZhbHNlO1xuXHRcdC8vIH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogOCwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogOCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDksIGxlbmd0aDogMSwgdG9rZW46IDUyNDM1NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTAsIGxlbmd0aDogNiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNiwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE3LCBsZW5ndGg6IDYsIHRva2VuOiA1ODk4OTIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIzLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjQsIGxlbmd0aDogNCwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyOSwgbGVuZ3RoOiAyLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMxLCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LCAvLyBUaGlzIGlzIHRoZSBjbG9zaW5nIGN1cmx5IGJyYWNlICsgbmV3bGluZSBjaGFyc1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzQsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNiwgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0MSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQyLCBsZW5ndGg6IDEsIHRva2VuOiA1NTcxMjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQzLCBsZW5ndGg6IDQsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDcsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0OCwgbGVuZ3RoOiA3LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1NSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDU2LCBsZW5ndGg6IDEsIHRva2VuOiAzMjc3NDggfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDU3LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTgsIGxlbmd0aDogMSwgdG9rZW46IDk4MzcyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1OSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYwLCBsZW5ndGg6IDUsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDY1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNjYsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2OCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cdFx0Y29uc3QgdG9rZW5zMCA9IHN0b3JlLmdldFRva2Vuc0luUmFuZ2UoMzYsIDU5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VuczAsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM2LCBsZW5ndGg6IDUsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQxLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDIsIGxlbmd0aDogMSwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDMsIGxlbmd0aDogNCwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0NywgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQ4LCBsZW5ndGg6IDcsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDU1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTYsIGxlbmd0aDogMSwgdG9rZW46IDMyNzc0OCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTcsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1OCwgbGVuZ3RoOiAxLCB0b2tlbjogOTgzNzIgfVxuXHRcdF0pO1xuXG5cdFx0Ly8gaW5zZXJ0IGEgdGFiICsgbmV3IGxpbmUgYWZ0ZXIgYHJldHVybiB0cnVlO2AgKGxpa2UgaGl0dGluZyBlbnRlciBhZnRlciB0aGUgOylcblx0XHRzdG9yZS51cGRhdGUoMzIsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogOCwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogOCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDksIGxlbmd0aDogMSwgdG9rZW46IDUyNDM1NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTAsIGxlbmd0aDogNiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNiwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE3LCBsZW5ndGg6IDYsIHRva2VuOiA1ODk4OTIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIzLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjQsIGxlbmd0aDogNCwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyOSwgbGVuZ3RoOiAyLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMxLCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LCAvLyBUaGlzIGlzIHRoZSBuZXcgbGluZSwgd2hpY2ggY29uc2lzdHMgb2YgMyBjaGFyYWN0ZXJzOiBcXHRcXHJcXG5cblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM0LCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdGNvbnN0IHRva2VuczEgPSBzdG9yZS5nZXRUb2tlbnNJblJhbmdlKDM2LCA1OSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnMxLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNiwgbGVuZ3RoOiAyLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM4LCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDAsIGxlbmd0aDogNSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDUsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0NiwgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0NywgbGVuZ3RoOiA0LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUxLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTIsIGxlbmd0aDogNywgdG9rZW46IDE5NjY3NiB9XG5cdFx0XSk7XG5cblx0XHQvLyBEZWxldGUgdGhlIHRhYiBjaGFyYWN0ZXJcblx0XHRzdG9yZS51cGRhdGUoMzcsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogOCwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogOCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDksIGxlbmd0aDogMSwgdG9rZW46IDUyNDM1NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTAsIGxlbmd0aDogNiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNiwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE3LCBsZW5ndGg6IDYsIHRva2VuOiA1ODk4OTIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIzLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjQsIGxlbmd0aDogNCwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyOSwgbGVuZ3RoOiAyLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMxLCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LCAvLyBUaGlzIGlzIHRoZSBjaGFuZ2VkIGxpbmU6IFxcdFxcclxcbiB0byBcXHJcXG5cblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMzLCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdGNvbnN0IHRva2VuczIgPSBzdG9yZS5nZXRUb2tlbnNJblJhbmdlKDM2LCA1OSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnMyLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNiwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM3LCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzksIGxlbmd0aDogNSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDQsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0NSwgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0NiwgbGVuZ3RoOiA0LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTEsIGxlbmd0aDogNywgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH1cblx0XHRdKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgbmV3IGxpbmUgYW5kIHJlbW92ZSB0YWJzIChzcGxpdCB0b2tlbnMpJywgKCkgPT4ge1xuXHRcdC8vIGNsYXNzIEEge1xuXHRcdC8vIFx0YSgpIHtcblx0XHQvLyBcdH1cblx0XHQvLyB9XG5cdFx0Ly9cblx0XHQvLyBpbnRlcmZhY2UgSSB7XG5cdFx0Ly9cblx0XHQvLyB9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDUsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDEsIHRva2VuOiA1NTcxMjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDcsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDExLCBsZW5ndGg6IDEsIHRva2VuOiA1MjQzNTYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEyLCBsZW5ndGg6IDUsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTcsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH0sIC8vIFRoaXMgaXMgdGhlIGNsb3NpbmcgY3VybHkgYnJhY2UgbGluZSBvZiBhKClcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIwLCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjIsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMywgbGVuZ3RoOiA5LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMiwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMzLCBsZW5ndGg6IDEsIHRva2VuOiA1NTcxMjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM0LCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzcsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzOCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMwID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgyMywgMzkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zMCwgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjMsIGxlbmd0aDogOSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzIsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMywgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNCwgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM3LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH1cblx0XHRdKTtcblxuXHRcdC8vIEluc2VydCBhIG5ldyBsaW5lIGFmdGVyIGEoKSB7IH0sIHdoaWNoIHdpbGwgYWRkIDIgdGFic1xuXHRcdHN0b3JlLnVwZGF0ZSgyMSwgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA3LCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTAsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMSwgbGVuZ3RoOiAxLCB0b2tlbjogNTI0MzU2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMiwgbGVuZ3RoOiA1LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE3LCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjAsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMywgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMxID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgyNiwgNDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zMSwgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjYsIGxlbmd0aDogOSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzUsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNiwgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNywgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDEsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH1cblx0XHRdKTtcblxuXHRcdC8vIEluc2VydCBhbm90aGVyIG5ldyBsaW5lIGF0IHRoZSBjdXJzb3IsIHdoaWNoIHdpbGwgYWxzbyBjYXVzZSB0aGUgMiB0YWJzIHRvIGJlIGRlbGV0ZWRcblx0XHRzdG9yZS51cGRhdGUoMjQsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogNSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMSwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNywgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTEsIGxlbmd0aDogMSwgdG9rZW46IDUyNDM1NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTIsIGxlbmd0aDogNSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNywgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjEsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMywgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMyID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgyNiwgNDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zMiwgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjYsIGxlbmd0aDogOSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzUsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNiwgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNywgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDEsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIHJlbW92ZXMgdG9rZW5zIGluIHRoZSBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAzLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAzLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAzLCB0b2tlbjogMyB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblx0XHRzdG9yZS5kZWxldGUoMywgMyk7IC8vIGRlbGV0ZSAzIGNoYXJzIHN0YXJ0aW5nIGF0IG9mZnNldCAzXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgwLCA5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VucywgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAzLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAzLCB0b2tlbjogMyB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBtZXJnZXMgcGFydGlhbGx5IGFmZmVjdGVkIHRva2VuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogNSwgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUsIGxlbmd0aDogNSwgdG9rZW46IDIgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cdFx0c3RvcmUuZGVsZXRlKDMsIDQpOyAvLyByZW1vdmVzIDQgY2hhcnMgd2l0aGluIHRva2VuIDEgYW5kIHBhcnRpYWxseSB0b2tlbiAyXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgwLCAxMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnMsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogNCwgdG9rZW46IDEgfSxcblx0XHRcdC8vIHRva2VuIDIgaXMgbm93IHNoaWZ0ZWQgbGVmdCBieSA0XG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0LCBsZW5ndGg6IDMsIHRva2VuOiAyIH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZSBhIHRva2VuIHdpdGggYSBzbGlnaHRseSBsYXJnZXIgdG9rZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiA1LCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNSwgbGVuZ3RoOiAxLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAxLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNywgbGVuZ3RoOiAxNywgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI0LCBsZW5ndGg6IDEsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyNSwgbGVuZ3RoOiA1LCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzAsIGxlbmd0aDogMSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMxLCBsZW5ndGg6IDEsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMiwgbGVuZ3RoOiA1LCB0b2tlbjogMiB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblx0XHRzdG9yZS51cGRhdGUoMTcsIFt7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA3LCBsZW5ndGg6IDE5LCB0b2tlbjogMCB9XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTsgLy8gcmVtb3ZlcyA0IGNoYXJzIHdpdGhpbiB0b2tlbiAxIGFuZCBwYXJ0aWFsbHkgdG9rZW4gMlxuXHRcdGNvbnN0IHRva2VucyA9IHN0b3JlLmdldFRva2Vuc0luUmFuZ2UoMCwgMzkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDUsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1LCBsZW5ndGg6IDEsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDEsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA3LCBsZW5ndGg6IDE5LCB0b2tlbjogMCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjYsIGxlbmd0aDogMSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI3LCBsZW5ndGg6IDUsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMiwgbGVuZ3RoOiAxLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzMsIGxlbmd0aDogMSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM0LCBsZW5ndGg6IDUsIHRva2VuOiAyIH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZSBhIGNoYXJhY3RlciBmcm9tIGEgbGFyZ2UgdG9rZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAyLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMiwgbGVuZ3RoOiA1LCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNywgbGVuZ3RoOiAxLCB0b2tlbjogMyB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblx0XHRzdG9yZS5kZWxldGUoMSwgMyk7XG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgwLCA3KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VucywgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAyLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMiwgbGVuZ3RoOiAxLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAzLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAxLCB0b2tlbjogMyB9XG5cdFx0XSk7XG5cdH0pO1xufSk7XG5cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixT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QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsSUFBSSxPQUFPLE9BQU87QUFBQSxNQUN0RCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxJQUNyRCxHQUFHLGFBQWEsUUFBUTtBQUFBLEVBRXpCLENBQUM7QUFDRCxPQUFLLDBCQUEwQixNQUFNO0FBU3BDLFVBQU0sUUFBUSxJQUFJLFdBQVcsU0FBUztBQUN0QyxVQUFNLFdBQVc7QUFBQSxNQUNoQixFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNuRCxFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNuRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNyRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNyRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxJQUNyRCxHQUFHLGFBQWEsUUFBUTtBQUN4QixVQUFNLFVBQVUsTUFBTSxpQkFBaUIsR0FBRyxFQUFFO0FBQzVDLFdBQU8sZ0JBQWdCLFNBQVM7QUFBQSxNQUMvQixFQUFFLE9BQU8sUUFBUSxzQkFBc0IsR0FBRyxRQUFRLEVBQUU7QUFBQSxNQUNwRCxFQUFFLE9BQU8sT0FBTyxzQkFBc0IsR0FBRyxRQUFRLEVBQUU7QUFBQSxNQUNuRCxFQUFFLE9BQU8sUUFBUSxzQkFBc0IsR0FBRyxRQUFRLEVBQUU7QUFBQSxNQUNwRCxFQUFFLE9BQU8sT0FBTyxzQkFBc0IsR0FBRyxRQUFRLEVBQUU7QUFBQSxNQUNuRCxFQUFFLE9BQU8sT0FBTyxzQkFBc0IsSUFBSSxRQUFRLEVBQUU7QUFBQSxNQUNwRCxFQUFFLE9BQU8sT0FBTyxzQkFBc0IsSUFBSSxRQUFRLEVBQUU7QUFBQSxJQUNyRCxDQUFDO0FBRUQsVUFBTSxPQUFPLElBQUk7QUFBQSxNQUNoQixFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNuRCxFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNuRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxJQUNyRCxHQUFHLGFBQWEsUUFBUTtBQUV4QixVQUFNLFNBQVMsTUFBTSxpQkFBaUIsR0FBRyxFQUFFO0FBQzNDLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QixFQUFFLE9BQU8sUUFBUSxzQkFBc0IsR0FBRyxRQUFRLEVBQUU7QUFBQSxNQUNwRCxFQUFFLE9BQU8sT0FBTyxzQkFBc0IsR0FBRyxRQUFRLEVBQUU7QUFBQSxNQUNuRCxFQUFFLE9BQU8sUUFBUSxzQkFBc0IsR0FBRyxRQUFRLEVBQUU7QUFBQSxNQUNwRCxFQUFFLE9BQU8sT0FBTyxzQkFBc0IsR0FBRyxRQUFRLEVBQUU7QUFBQSxNQUNuRCxFQUFFLE9BQU8sT0FBTyxzQkFBc0IsSUFBSSxRQUFRLEVBQUU7QUFBQSxNQUNwRCxFQUFFLE9BQU8sT0FBTyxzQkFBc0IsSUFBSSxRQUFRLEVBQUU7QUFBQSxJQUNyRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0QsT0FBSyw0QkFBNEIsTUFBTTtBQVl0QyxVQUFNLFFBQVEsSUFBSSxXQUFXLFNBQVM7QUFDdEMsVUFBTSxXQUFXO0FBQUEsTUFDaEIsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDbkQsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLElBQUksT0FBTyxPQUFPO0FBQUEsTUFDdEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLElBQUksT0FBTyxPQUFPO0FBQUEsTUFDdEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0Is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QztBQUNELE9BQUssMkJBQTJCLE1BQU07QUFVckMsVUFBTSxRQUFRLElBQUksV0FBVyxTQUFTO0FBQ3RDLFVBQU0sV0FBVztBQUFBLE1BQ2hCLEVBQUUsc0JBQXNCLEdBQUcsUUFBUSxHQUFHLE9BQU8sT0FBTztBQUFBLE1BQ3BELEVBQUUsc0JBQXNCLEdBQUcsUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ25ELEVBQUUsc0JBQXNCLEdBQUcsUUFBUSxHQUFHLE9BQU8sT0FBTztBQUFBLE1BQ3BELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ3BELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ3BELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sT0FBTztBQUFBLE1BQ3JELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ3BELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sT0FBTztBQUFBLE1BQ3JELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ3BELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ3BELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsSUFDckQsR0FBRyxhQUFhLFFBQVE7QUFDeEIsVUFBTSxVQUFVLE1BQU0saUJBQWlCLElBQUksRUFBRTtBQUM3QyxXQUFPLGdCQUFnQixTQUFTO0FBQUEsTUFDL0IsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsSUFDckQsQ0FBQztBQUdELFVBQU0sT0FBTyxJQUFJO0FBQUEsTUFDaEIsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDbkQsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUE7QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxJQUNyRCxHQUFHLGFBQWEsUUFBUTtBQUV4QixVQUFNLFVBQVUsTUFBTSxpQkFBaUIsSUFBSSxFQUFFO0FBQzdDLFdBQU8sZ0JBQWdCLFNBQVM7QUFBQSxNQUMvQixFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNyRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNyRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxJQUN0RCxDQUFDO0FBR0QsVUFBTSxPQUFPLElBQUk7QUFBQSxNQUNoQixFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNuRCxFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNyRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNyRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQTtBQUFB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
