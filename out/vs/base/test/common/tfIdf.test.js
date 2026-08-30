import assert from "assert";
import { CancellationToken } from "../../common/cancellation.js";
import { TfIdfCalculator } from "../../common/tfIdf.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
function permutate(arr) {
  if (arr.length === 0) {
    return [[]];
  }
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const permutationsRest = permutate(rest);
    for (let j = 0; j < permutationsRest.length; j++) {
      result.push([arr[i], ...permutationsRest[j]]);
    }
  }
  return result;
}
function assertScoreOrdersEqual(actualScores, expectedScoreKeys) {
  actualScores.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  assert.strictEqual(actualScores.length, expectedScoreKeys.length);
  for (let i = 0; i < expectedScoreKeys.length; i++) {
    assert.strictEqual(actualScores[i].key, expectedScoreKeys[i]);
  }
}
suite("TF-IDF Calculator", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Should return no scores when no documents are given", () => {
    const tfidf = new TfIdfCalculator();
    const scores = tfidf.calculateScores("something", CancellationToken.None);
    assertScoreOrdersEqual(scores, []);
  });
  test("Should return no scores for term not in document", () => {
    const tfidf = new TfIdfCalculator().updateDocuments([
      makeDocument("A", "cat dog fish")
    ]);
    const scores = tfidf.calculateScores("elepant", CancellationToken.None);
    assertScoreOrdersEqual(scores, []);
  });
  test("Should return scores for document with exact match", () => {
    for (const docs of permutate([
      makeDocument("A", "cat dog cat"),
      makeDocument("B", "cat fish")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("dog", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["A"]);
    }
  });
  test("Should return document with more matches first", () => {
    for (const docs of permutate([
      makeDocument("/A", "cat dog cat"),
      makeDocument("/B", "cat fish"),
      makeDocument("/C", "frog")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("cat", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/B"]);
    }
  });
  test("Should return document with more matches first when term appears in all documents", () => {
    for (const docs of permutate([
      makeDocument("/A", "cat dog cat cat"),
      makeDocument("/B", "cat fish"),
      makeDocument("/C", "frog cat cat")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("cat", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/C", "/B"]);
    }
  });
  test("Should weigh less common term higher", () => {
    for (const docs of permutate([
      makeDocument("/A", "cat dog cat"),
      makeDocument("/B", "fish"),
      makeDocument("/C", "cat cat cat cat"),
      makeDocument("/D", "cat fish")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("cat the dog", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/C", "/D"]);
    }
  });
  test("Should weigh chunks with less common terms higher", () => {
    for (const docs of permutate([
      makeDocument("/A", ["cat dog cat", "fish"]),
      makeDocument("/B", ["cat cat cat cat dog", "dog"])
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("cat", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/B", "/A"]);
    }
    for (const docs of permutate([
      makeDocument("/A", ["cat dog cat", "fish"]),
      makeDocument("/B", ["cat cat cat cat dog", "dog"])
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("dog", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/B", "/B"]);
    }
    for (const docs of permutate([
      makeDocument("/A", ["cat dog cat", "fish"]),
      makeDocument("/B", ["cat cat cat cat dog", "dog"])
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("cat the dog", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/B", "/A", "/B"]);
    }
    for (const docs of permutate([
      makeDocument("/A", ["cat dog cat", "fish"]),
      makeDocument("/B", ["cat cat cat cat dog", "dog"])
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("lake fish", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A"]);
    }
  });
  test("Should ignore case and punctuation", () => {
    for (const docs of permutate([
      makeDocument("/A", "Cat doG.cat"),
      makeDocument("/B", "cAt fiSH"),
      makeDocument("/C", "frOg")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores(". ,CaT!  ", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/B"]);
    }
  });
  test("Should match on camelCase words", () => {
    for (const docs of permutate([
      makeDocument("/A", "catDog cat"),
      makeDocument("/B", "fishCatFish"),
      makeDocument("/C", "frogcat")
    ])) {
      const tfidf = new TfIdfCalculator().updateDocuments(docs);
      const scores = tfidf.calculateScores("catDOG", CancellationToken.None);
      assertScoreOrdersEqual(scores, ["/A", "/B"]);
    }
  });
  test("Should not match document after delete", () => {
    const docA = makeDocument("/A", "cat dog cat");
    const docB = makeDocument("/B", "cat fish");
    const docC = makeDocument("/C", "frog");
    const tfidf = new TfIdfCalculator().updateDocuments([docA, docB, docC]);
    let scores = tfidf.calculateScores("cat", CancellationToken.None);
    assertScoreOrdersEqual(scores, ["/A", "/B"]);
    tfidf.deleteDocument(docA.key);
    scores = tfidf.calculateScores("cat", CancellationToken.None);
    assertScoreOrdersEqual(scores, ["/B"]);
    tfidf.deleteDocument(docC.key);
    scores = tfidf.calculateScores("cat", CancellationToken.None);
    assertScoreOrdersEqual(scores, ["/B"]);
    tfidf.deleteDocument(docB.key);
    scores = tfidf.calculateScores("cat", CancellationToken.None);
    assertScoreOrdersEqual(scores, []);
  });
});
function makeDocument(key, content) {
  return {
    key,
    textChunks: Array.isArray(content) ? content : [content]
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXHRmSWRmLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVGZJZGZDYWxjdWxhdG9yLCBUZklkZkRvY3VtZW50LCBUZklkZlNjb3JlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3RmSWRmLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhbGwgcGVybXV0YXRpb25zIG9mIGFuIGFycmF5LlxuICpcbiAqIFRoaXMgaXMgdXNlZnVsIGZvciB0ZXN0aW5nIHRvIG1ha2Ugc3VyZSBvcmRlciBkb2VzIG5vdCBlZmZlY3QgdGhlIHJlc3VsdC5cbiAqL1xuZnVuY3Rpb24gcGVybXV0YXRlPFQ+KGFycjogVFtdKTogVFtdW10ge1xuXHRpZiAoYXJyLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBbW11dO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0OiBUW11bXSA9IFtdO1xuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYXJyLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgcmVzdCA9IFsuLi5hcnIuc2xpY2UoMCwgaSksIC4uLmFyci5zbGljZShpICsgMSldO1xuXHRcdGNvbnN0IHBlcm11dGF0aW9uc1Jlc3QgPSBwZXJtdXRhdGUocmVzdCk7XG5cdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBwZXJtdXRhdGlvbnNSZXN0Lmxlbmd0aDsgaisrKSB7XG5cdFx0XHRyZXN1bHQucHVzaChbYXJyW2ldLCAuLi5wZXJtdXRhdGlvbnNSZXN0W2pdXSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChhY3R1YWxTY29yZXM6IFRmSWRmU2NvcmVbXSwgZXhwZWN0ZWRTY29yZUtleXM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdGFjdHVhbFNjb3Jlcy5zb3J0KChhLCBiKSA9PiAoYi5zY29yZSAtIGEuc2NvcmUpIHx8IGEua2V5LmxvY2FsZUNvbXBhcmUoYi5rZXkpKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFNjb3Jlcy5sZW5ndGgsIGV4cGVjdGVkU2NvcmVLZXlzLmxlbmd0aCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZXhwZWN0ZWRTY29yZUtleXMubGVuZ3RoOyBpKyspIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsU2NvcmVzW2ldLmtleSwgZXhwZWN0ZWRTY29yZUtleXNbaV0pO1xuXHR9XG59XG5cbnN1aXRlKCdURi1JREYgQ2FsY3VsYXRvcicsIGZ1bmN0aW9uICgpIHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHRlc3QoJ1Nob3VsZCByZXR1cm4gbm8gc2NvcmVzIHdoZW4gbm8gZG9jdW1lbnRzIGFyZSBnaXZlbicsICgpID0+IHtcblx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKTtcblx0XHRjb25zdCBzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ3NvbWV0aGluZycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydFNjb3JlT3JkZXJzRXF1YWwoc2NvcmVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCByZXR1cm4gbm8gc2NvcmVzIGZvciB0ZXJtIG5vdCBpbiBkb2N1bWVudCcsICgpID0+IHtcblx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKS51cGRhdGVEb2N1bWVudHMoW1xuXHRcdFx0bWFrZURvY3VtZW50KCdBJywgJ2NhdCBkb2cgZmlzaCcpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHNjb3JlcyA9IHRmaWRmLmNhbGN1bGF0ZVNjb3JlcygnZWxlcGFudCcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydFNjb3JlT3JkZXJzRXF1YWwoc2NvcmVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCByZXR1cm4gc2NvcmVzIGZvciBkb2N1bWVudCB3aXRoIGV4YWN0IG1hdGNoJywgKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgZG9jcyBvZiBwZXJtdXRhdGUoW1xuXHRcdFx0bWFrZURvY3VtZW50KCdBJywgJ2NhdCBkb2cgY2F0JyksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJ0InLCAnY2F0IGZpc2gnKSxcblx0XHRdKSkge1xuXHRcdFx0Y29uc3QgdGZpZGYgPSBuZXcgVGZJZGZDYWxjdWxhdG9yKCkudXBkYXRlRG9jdW1lbnRzKGRvY3MpO1xuXHRcdFx0Y29uc3Qgc2NvcmVzID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKCdkb2cnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydFNjb3JlT3JkZXJzRXF1YWwoc2NvcmVzLCBbJ0EnXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgcmV0dXJuIGRvY3VtZW50IHdpdGggbW9yZSBtYXRjaGVzIGZpcnN0JywgKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgZG9jcyBvZiBwZXJtdXRhdGUoW1xuXHRcdFx0bWFrZURvY3VtZW50KCcvQScsICdjYXQgZG9nIGNhdCcpLFxuXHRcdFx0bWFrZURvY3VtZW50KCcvQicsICdjYXQgZmlzaCcpLFxuXHRcdFx0bWFrZURvY3VtZW50KCcvQycsICdmcm9nJyksXG5cdFx0XSkpIHtcblx0XHRcdGNvbnN0IHRmaWRmID0gbmV3IFRmSWRmQ2FsY3VsYXRvcigpLnVwZGF0ZURvY3VtZW50cyhkb2NzKTtcblx0XHRcdGNvbnN0IHNjb3JlcyA9IHRmaWRmLmNhbGN1bGF0ZVNjb3JlcygnY2F0JywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnRTY29yZU9yZGVyc0VxdWFsKHNjb3JlcywgWycvQScsICcvQiddKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCByZXR1cm4gZG9jdW1lbnQgd2l0aCBtb3JlIG1hdGNoZXMgZmlyc3Qgd2hlbiB0ZXJtIGFwcGVhcnMgaW4gYWxsIGRvY3VtZW50cycsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IGRvY3Mgb2YgcGVybXV0YXRlKFtcblx0XHRcdG1ha2VEb2N1bWVudCgnL0EnLCAnY2F0IGRvZyBjYXQgY2F0JyksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9CJywgJ2NhdCBmaXNoJyksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9DJywgJ2Zyb2cgY2F0IGNhdCcpLFxuXHRcdF0pKSB7XG5cdFx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKS51cGRhdGVEb2N1bWVudHMoZG9jcyk7XG5cdFx0XHRjb25zdCBzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ2NhdCcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFsnL0EnLCAnL0MnLCAnL0InXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgd2VpZ2ggbGVzcyBjb21tb24gdGVybSBoaWdoZXInLCAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCBkb2NzIG9mIHBlcm11dGF0ZShbXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9BJywgJ2NhdCBkb2cgY2F0JyksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9CJywgJ2Zpc2gnKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0MnLCAnY2F0IGNhdCBjYXQgY2F0JyksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9EJywgJ2NhdCBmaXNoJylcblx0XHRdKSkge1xuXHRcdFx0Y29uc3QgdGZpZGYgPSBuZXcgVGZJZGZDYWxjdWxhdG9yKCkudXBkYXRlRG9jdW1lbnRzKGRvY3MpO1xuXHRcdFx0Y29uc3Qgc2NvcmVzID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKCdjYXQgdGhlIGRvZycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFsnL0EnLCAnL0MnLCAnL0QnXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgd2VpZ2ggY2h1bmtzIHdpdGggbGVzcyBjb21tb24gdGVybXMgaGlnaGVyJywgKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgZG9jcyBvZiBwZXJtdXRhdGUoW1xuXHRcdFx0bWFrZURvY3VtZW50KCcvQScsIFsnY2F0IGRvZyBjYXQnLCAnZmlzaCddKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0InLCBbJ2NhdCBjYXQgY2F0IGNhdCBkb2cnLCAnZG9nJ10pXG5cdFx0XSkpIHtcblx0XHRcdGNvbnN0IHRmaWRmID0gbmV3IFRmSWRmQ2FsY3VsYXRvcigpLnVwZGF0ZURvY3VtZW50cyhkb2NzKTtcblx0XHRcdGNvbnN0IHNjb3JlcyA9IHRmaWRmLmNhbGN1bGF0ZVNjb3JlcygnY2F0JywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnRTY29yZU9yZGVyc0VxdWFsKHNjb3JlcywgWycvQicsICcvQSddKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGRvY3Mgb2YgcGVybXV0YXRlKFtcblx0XHRcdG1ha2VEb2N1bWVudCgnL0EnLCBbJ2NhdCBkb2cgY2F0JywgJ2Zpc2gnXSksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9CJywgWydjYXQgY2F0IGNhdCBjYXQgZG9nJywgJ2RvZyddKVxuXHRcdF0pKSB7XG5cdFx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKS51cGRhdGVEb2N1bWVudHMoZG9jcyk7XG5cdFx0XHRjb25zdCBzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ2RvZycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFsnL0EnLCAnL0InLCAnL0InXSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBkb2NzIG9mIHBlcm11dGF0ZShbXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9BJywgWydjYXQgZG9nIGNhdCcsICdmaXNoJ10pLFxuXHRcdFx0bWFrZURvY3VtZW50KCcvQicsIFsnY2F0IGNhdCBjYXQgY2F0IGRvZycsICdkb2cnXSlcblx0XHRdKSkge1xuXHRcdFx0Y29uc3QgdGZpZGYgPSBuZXcgVGZJZGZDYWxjdWxhdG9yKCkudXBkYXRlRG9jdW1lbnRzKGRvY3MpO1xuXHRcdFx0Y29uc3Qgc2NvcmVzID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKCdjYXQgdGhlIGRvZycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFsnL0InLCAnL0EnLCAnL0InXSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBkb2NzIG9mIHBlcm11dGF0ZShbXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9BJywgWydjYXQgZG9nIGNhdCcsICdmaXNoJ10pLFxuXHRcdFx0bWFrZURvY3VtZW50KCcvQicsIFsnY2F0IGNhdCBjYXQgY2F0IGRvZycsICdkb2cnXSlcblx0XHRdKSkge1xuXHRcdFx0Y29uc3QgdGZpZGYgPSBuZXcgVGZJZGZDYWxjdWxhdG9yKCkudXBkYXRlRG9jdW1lbnRzKGRvY3MpO1xuXHRcdFx0Y29uc3Qgc2NvcmVzID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKCdsYWtlIGZpc2gnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydFNjb3JlT3JkZXJzRXF1YWwoc2NvcmVzLCBbJy9BJ10pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIGlnbm9yZSBjYXNlIGFuZCBwdW5jdHVhdGlvbicsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IGRvY3Mgb2YgcGVybXV0YXRlKFtcblx0XHRcdG1ha2VEb2N1bWVudCgnL0EnLCAnQ2F0IGRvRy5jYXQnKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0InLCAnY0F0IGZpU0gnKSxcblx0XHRcdG1ha2VEb2N1bWVudCgnL0MnLCAnZnJPZycpLFxuXHRcdF0pKSB7XG5cdFx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKS51cGRhdGVEb2N1bWVudHMoZG9jcyk7XG5cdFx0XHRjb25zdCBzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJy4gLENhVCEgICcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFsnL0EnLCAnL0InXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgbWF0Y2ggb24gY2FtZWxDYXNlIHdvcmRzJywgKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgZG9jcyBvZiBwZXJtdXRhdGUoW1xuXHRcdFx0bWFrZURvY3VtZW50KCcvQScsICdjYXREb2cgY2F0JyksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9CJywgJ2Zpc2hDYXRGaXNoJyksXG5cdFx0XHRtYWtlRG9jdW1lbnQoJy9DJywgJ2Zyb2djYXQnKSxcblx0XHRdKSkge1xuXHRcdFx0Y29uc3QgdGZpZGYgPSBuZXcgVGZJZGZDYWxjdWxhdG9yKCkudXBkYXRlRG9jdW1lbnRzKGRvY3MpO1xuXHRcdFx0Y29uc3Qgc2NvcmVzID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKCdjYXRET0cnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydFNjb3JlT3JkZXJzRXF1YWwoc2NvcmVzLCBbJy9BJywgJy9CJ10pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIG5vdCBtYXRjaCBkb2N1bWVudCBhZnRlciBkZWxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZG9jQSA9IG1ha2VEb2N1bWVudCgnL0EnLCAnY2F0IGRvZyBjYXQnKTtcblx0XHRjb25zdCBkb2NCID0gbWFrZURvY3VtZW50KCcvQicsICdjYXQgZmlzaCcpO1xuXHRcdGNvbnN0IGRvY0MgPSBtYWtlRG9jdW1lbnQoJy9DJywgJ2Zyb2cnKTtcblxuXHRcdGNvbnN0IHRmaWRmID0gbmV3IFRmSWRmQ2FsY3VsYXRvcigpLnVwZGF0ZURvY3VtZW50cyhbZG9jQSwgZG9jQiwgZG9jQ10pO1xuXHRcdGxldCBzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ2NhdCcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydFNjb3JlT3JkZXJzRXF1YWwoc2NvcmVzLCBbJy9BJywgJy9CJ10pO1xuXG5cdFx0dGZpZGYuZGVsZXRlRG9jdW1lbnQoZG9jQS5rZXkpO1xuXHRcdHNjb3JlcyA9IHRmaWRmLmNhbGN1bGF0ZVNjb3JlcygnY2F0JywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0U2NvcmVPcmRlcnNFcXVhbChzY29yZXMsIFsnL0InXSk7XG5cblx0XHR0ZmlkZi5kZWxldGVEb2N1bWVudChkb2NDLmtleSk7XG5cdFx0c2NvcmVzID0gdGZpZGYuY2FsY3VsYXRlU2NvcmVzKCdjYXQnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnRTY29yZU9yZGVyc0VxdWFsKHNjb3JlcywgWycvQiddKTtcblxuXHRcdHRmaWRmLmRlbGV0ZURvY3VtZW50KGRvY0Iua2V5KTtcblx0XHRzY29yZXMgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoJ2NhdCcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydFNjb3JlT3JkZXJzRXF1YWwoc2NvcmVzLCBbXSk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIG1ha2VEb2N1bWVudChrZXk6IHN0cmluZywgY29udGVudDogc3RyaW5nIHwgc3RyaW5nW10pOiBUZklkZkRvY3VtZW50IHtcblx0cmV0dXJuIHtcblx0XHRrZXksXG5cdFx0dGV4dENodW5rczogQXJyYXkuaXNBcnJheShjb250ZW50KSA/IGNvbnRlbnQgOiBbY29udGVudF0sXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBa0Q7QUFDM0QsU0FBUywrQ0FBK0M7QUFPeEQsU0FBUyxVQUFhLEtBQWlCO0FBQ3RDLE1BQUksSUFBSSxXQUFXLEdBQUc7QUFDckIsV0FBTyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ1g7QUFFQSxRQUFNLFNBQWdCLENBQUM7QUFFdkIsV0FBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLFFBQVEsS0FBSztBQUNwQyxVQUFNLE9BQU8sQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLENBQUMsR0FBRyxHQUFHLElBQUksTUFBTSxJQUFJLENBQUMsQ0FBQztBQUNyRCxVQUFNLG1CQUFtQixVQUFVLElBQUk7QUFDdkMsYUFBUyxJQUFJLEdBQUcsSUFBSSxpQkFBaUIsUUFBUSxLQUFLO0FBQ2pELGFBQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDN0M7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSO0FB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
