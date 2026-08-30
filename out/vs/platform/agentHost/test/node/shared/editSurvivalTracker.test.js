import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import {
  compute4GramTextSimilarity,
  computeChunkedEditSurvival,
  computeChunkedFourGramSurvival,
  computeFractionPresentIn,
  computeWholeFileEditSurvival
} from "../../../node/shared/editSurvivalTracker.js";
suite("agentHost editSurvivalTracker", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("compute4GramTextSimilarity", () => {
    test("identical strings \u2192 1", () => {
      assert.strictEqual(compute4GramTextSimilarity("hello world", "hello world"), 1);
    });
    test("completely different strings \u2192 low score", () => {
      const score = compute4GramTextSimilarity("aaaaaaaa", "bbbbbbbb");
      assert.ok(score < 0.1, `expected < 0.1, got ${score}`);
    });
    test("short inputs (<4 chars) fall back to equality", () => {
      assert.strictEqual(compute4GramTextSimilarity("ab", "ab"), 1);
      assert.strictEqual(compute4GramTextSimilarity("ab", "cd"), 0);
    });
    test("mostly-shared text scores high", () => {
      const a = 'function greet() { return "hello"; }';
      const b = 'function greet() { return "hello!"; }';
      const score = compute4GramTextSimilarity(a, b);
      assert.ok(score > 0.85, `expected > 0.85, got ${score}`);
    });
  });
  suite("computeWholeFileEditSurvival", () => {
    test("user kept AI output verbatim \u2192 1/1", () => {
      const before = "old line\n";
      const after = "new line\n";
      const scores = computeWholeFileEditSurvival(before, after, after);
      assert.strictEqual(scores.fourGram, 1);
      assert.strictEqual(scores.noRevert, 1);
    });
    test("user fully reverted to original \u2192 low fourGram, low noRevert", () => {
      const before = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n";
      const after = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n";
      const scores = computeWholeFileEditSurvival(before, after, before);
      assert.ok(scores.fourGram < 0.2, `fourGram expected < 0.2, got ${scores.fourGram}`);
      assert.strictEqual(scores.noRevert, 0);
    });
    test("user refined AI output \u2192 fourGram lower, noRevert stays at 1", () => {
      const before = "function add(a, b) { return a + b; }\n";
      const after = "function add(a: number, b: number): number { return a + b; }\n";
      const current = "function add(a: number, b: number): number {\n	return a + b;\n}\n";
      const scores = computeWholeFileEditSurvival(before, after, current);
      assert.ok(scores.fourGram > 0.5 && scores.fourGram < 1, `fourGram expected mid-range, got ${scores.fourGram}`);
      assert.strictEqual(scores.noRevert, 1);
    });
    test("AI produced same text as before \u2192 noRevert defaults to 1", () => {
      const text = "unchanged\n";
      const scores = computeWholeFileEditSurvival(text, text, text);
      assert.strictEqual(scores.fourGram, 1);
      assert.strictEqual(scores.noRevert, 1);
    });
  });
  suite("computeFractionPresentIn", () => {
    test("chunk fully present in current \u2192 1", () => {
      const chunk = 'export function greet() { return "hello"; }\n';
      const file = "// header\n" + chunk + "// footer\n";
      assert.strictEqual(computeFractionPresentIn(chunk, file), 1);
    });
    test("chunk fully absent from current \u2192 0", () => {
      const chunk = "xxxxxxxxxxxxxxxxxxxxxxxxxxxx\n";
      const file = "completely unrelated content here\n";
      assert.strictEqual(computeFractionPresentIn(chunk, file), 0);
    });
    test("partial overlap \u2192 fraction between 0 and 1", () => {
      const chunk = "function add(a, b) { return a + b; }\n";
      const file = "function add(a, b) { return a - b; }\n";
      const score = computeFractionPresentIn(chunk, file);
      assert.ok(score > 0.5 && score < 1, `expected fraction in (0.5, 1), got ${score}`);
    });
    test("empty chunk \u2192 1", () => {
      assert.strictEqual(computeFractionPresentIn("", "anything"), 1);
    });
    test("chunk shorter than 4 chars falls back to substring match", () => {
      assert.strictEqual(computeFractionPresentIn("ab", "cabd"), 1);
      assert.strictEqual(computeFractionPresentIn("ab", "cxd"), 0);
    });
    test("immune to file growth: score stays at 1 when content is appended", () => {
      const chunk = 'export function greet() { return "hello"; }\n';
      const small = chunk;
      const big = chunk + "x".repeat(1e4);
      assert.strictEqual(computeFractionPresentIn(chunk, small), 1);
      assert.strictEqual(computeFractionPresentIn(chunk, big), 1);
    });
  });
  suite("computeChunkedFourGramSurvival", () => {
    test("empty chunks \u2192 0 (caller should branch and fall back)", () => {
      assert.strictEqual(computeChunkedFourGramSurvival([], "file"), 0);
    });
    test("multiple chunks weighted by length", () => {
      const longChunk = "a".repeat(200);
      const shortChunk = "xyz9";
      const file = longChunk;
      const score = computeChunkedFourGramSurvival([longChunk, shortChunk], file);
      assert.ok(score > 0.99, `expected near 1, got ${score}`);
    });
    test("all chunks fully present \u2192 1", () => {
      const a = "export const x = 1;\n";
      const b = "export const y = 2;\n";
      const file = `// header
${a}// mid
${b}// footer
`;
      assert.strictEqual(computeChunkedFourGramSurvival([a, b], file), 1);
    });
    test("scales linearly with chunks: file n-gram set is built once", () => {
      const file = "x".repeat(5e5);
      const chunks = Array.from({ length: 50 }, (_, i) => `chunk${i}-${"x".repeat(40)}`);
      const start = Date.now();
      const score = computeChunkedFourGramSurvival(chunks, file);
      const elapsedMs = Date.now() - start;
      assert.ok(score >= 0 && score <= 1, `score out of range: ${score}`);
      assert.ok(elapsedMs < 1e3, `expected < 1000ms, took ${elapsedMs}ms`);
    });
  });
  suite("computeChunkedEditSurvival", () => {
    test("falls back to whole-file scoring when chunks are empty", () => {
      const before = "aaaaaaaaaaaaaaaaaaaa\n";
      const after = "bbbbbbbbbbbbbbbbbbbb\n";
      const expected = computeWholeFileEditSurvival(before, after, after);
      const actual = computeChunkedEditSurvival(before, after, [], after);
      assert.deepStrictEqual(actual, expected);
    });
    test("fourGram from chunks, noRevert still from whole-file", () => {
      const before = "// empty\n";
      const chunk = 'export function greet() { return "hello"; }\n';
      const after = before + chunk;
      const current = after + "\n// later append\n";
      const scores = computeChunkedEditSurvival(before, after, [chunk], current);
      assert.strictEqual(scores.fourGram, 1);
      assert.strictEqual(scores.noRevert, 1);
    });
  });
  suite("multi-tracker scenarios", () => {
    function round(n) {
      return Math.round(n * 100) / 100;
    }
    function simulate(edits) {
      const result = /* @__PURE__ */ new Map();
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        const samples = [];
        const stream = [edit.after, ...edits.slice(i + 1).map((e) => e.after)];
        for (const currentText of stream) {
          const { fourGram, noRevert } = edit.aiChunks ? computeChunkedEditSurvival(edit.before, edit.after, edit.aiChunks, currentText) : computeWholeFileEditSurvival(edit.before, edit.after, currentText);
          samples.push(`${round(fourGram)}/${round(noRevert)}`);
        }
        result.set(edit.id, samples);
      }
      return result;
    }
    test("two non-overlapping additions both survive (whole-file scoring)", () => {
      const base = "alpha\nbravo\ncharlie\n";
      const afterE1 = base + "delta added by e1\n";
      const afterE2 = "echo added by e2\n" + afterE1;
      const samples = simulate([
        { id: "e1", before: base, after: afterE1 },
        { id: "e2", before: afterE1, after: afterE2 }
      ]);
      assert.deepStrictEqual(Object.fromEntries(samples), {
        // e1: t=0 perfect. After e2 lands, e1's added line is
        // still present (noRevert=1) but the file has *more*
        // text than e1 wrote, so the fourGram ratio falls.
        // This is the whole-file scoring artifact — chunked
        // scoring fixes it (see the chunked test below).
        e1: ["1/1", "0.8/1"],
        e2: ["1/1"]
      });
    });
    test("two non-overlapping additions both survive (chunked scoring)", () => {
      const base = "alpha\nbravo\ncharlie\n";
      const e1Chunk = "delta added by e1\n";
      const e2Chunk = "echo added by e2\n";
      const afterE1 = base + e1Chunk;
      const afterE2 = e2Chunk + afterE1;
      const samples = simulate([
        { id: "e1", before: base, after: afterE1, aiChunks: [e1Chunk] },
        { id: "e2", before: afterE1, after: afterE2, aiChunks: [e2Chunk] }
      ]);
      assert.deepStrictEqual(Object.fromEntries(samples), {
        // e1's chunk is still entirely present after e2 lands
        // (it's just deeper in the file) → fourGram stays at 1.
        e1: ["1/1", "1/1"],
        e2: ["1/1"]
      });
    });
    test("write then edit that appends \u2014 write stays at 1 under chunked scoring", () => {
      const original = "export function a() { return 1; }\n";
      const appended = "export function b() { return 2; }\n";
      const afterWrite = original;
      const afterEdit = original + appended;
      const samples = simulate([
        { id: "write", before: "", after: afterWrite, aiChunks: [original] },
        { id: "edit", before: afterWrite, after: afterEdit, aiChunks: [appended] }
      ]);
      assert.deepStrictEqual(Object.fromEntries(samples), {
        write: ["1/1", "1/1"],
        edit: ["1/1"]
      });
    });
    test("MultiEdit with several chunks survives a later unrelated append", () => {
      const base = "// existing module\n";
      const chunkA = "export function alpha() { return 1; }\n";
      const chunkB = "export function bravo() { return 2; }\n";
      const chunkC = "export function charlie() { return 3; }\n";
      const chunkD = "export function delta() { return 4; }\n";
      const afterMulti = base + chunkA + chunkB + chunkC;
      const afterEdit = afterMulti + chunkD;
      const samples = simulate([
        { id: "multi", before: base, after: afterMulti, aiChunks: [chunkA, chunkB, chunkC] },
        { id: "edit", before: afterMulti, after: afterEdit, aiChunks: [chunkD] }
      ]);
      assert.deepStrictEqual(Object.fromEntries(samples), {
        multi: ["1/1", "1/1"],
        edit: ["1/1"]
      });
    });
    test("add a line, then modify the same line \u2014 fourGram drops, noRevert stays high", () => {
      const base = "alpha\nbravo\ncharlie\n";
      const afterE1 = base + "delta the original\n";
      const afterE2 = base + "delta after edit two changed it\n";
      const samples = simulate([
        { id: "e1", before: base, after: afterE1 },
        { id: "e2", before: afterE1, after: afterE2 }
      ]);
      assert.deepStrictEqual(Object.fromEntries(samples), {
        // e1: at t=0 perfect; once e2 lands the modified line
        // is no longer e1's text → fourGram drops. noRevert
        // holds at 1 because the file did not move back toward
        // `base`, it moved further away.
        e1: ["1/1", "0.54/1"],
        e2: ["1/1"]
      });
    });
    test("change a line, add a line, delete a line \u2014 mixed survival", () => {
      const base = "first\nsecond\nthird\nfourth\nfifth\n";
      const afterE1 = "first\nSECOND CHANGED\nthird\nfourth\nfifth\n";
      const afterE2 = afterE1 + "sixth added\n";
      const afterE3 = "first\nSECOND CHANGED\nthird\nfifth\nsixth added\n";
      const samples = simulate([
        { id: "e1-change", before: base, after: afterE1 },
        { id: "e2-add", before: afterE1, after: afterE2 },
        { id: "e3-delete", before: afterE2, after: afterE3 }
      ]);
      assert.deepStrictEqual(Object.fromEntries(samples), {
        // All three edits keep noRevert at 1 throughout — none
        // of the later edits pulled the file back toward an
        // earlier `before` state. fourGram for the earlier
        // edits drops as later edits add or remove content
        // elsewhere in the file (whole-file scoring is not
        // region-aware).
        "e1-change": ["1/1", "0.86/1", "0.73/1"],
        "e2-add": ["1/1", "0.9/1"],
        "e3-delete": ["1/1"]
      });
    });
    test("agent supersedes its own work \u2014 first reporter falsely reports a revert", () => {
      const original = "line one\nline two\nline three\nline four\n";
      const shrunken = "line one\nline two\n";
      const samples = simulate([
        { id: "e1-shrink", before: original, after: shrunken },
        { id: "e2-restore", before: shrunken, after: original }
      ]);
      assert.deepStrictEqual(Object.fromEntries(samples), {
        // e1 at t=0: identical to its `after` → 1/1.
        // e1 after e2 lands: current ≡ original ≡ e1's `before`
        // → noRevert collapses to 0. fourGram is the similarity
        // between e1's `after` (shrunken) and the restored file,
        // which still overlaps on the first two lines.
        "e1-shrink": ["1/1", "0.59/0"],
        "e2-restore": ["1/1"]
      });
    });
    test("user refines after AI edit \u2014 noRevert holds at 1", () => {
      const base = "function add(a, b) { return a + b; }\n";
      const afterAI = "function add(a: number, b: number): number { return a + b; }\n";
      const afterUser = "function add(a: number, b: number): number {\n	return a + b;\n}\n";
      const samples = simulate([
        { id: "ai-edit", before: base, after: afterAI },
        // Treat the user refinement as a synthetic "edit" so
        // simulate() advances the reporter through that state.
        { id: "user-refine", before: afterAI, after: afterUser }
      ]);
      const aiSamples = samples.get("ai-edit");
      assert.strictEqual(aiSamples[0], "1/1", "AI edit perfect at t=0");
      const [fg, nr] = aiSamples[1].split("/").map(Number);
      assert.ok(fg > 0.4 && fg < 1, `expected fourGram in (0.4, 1), got ${fg}`);
      assert.strictEqual(nr, 1, "noRevert should remain 1 after a refinement");
    });
    test("user fully reverts after AI edit \u2014 both scores drop", () => {
      const before = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n";
      const after = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n";
      const samples = simulate([
        { id: "ai-edit", before, after },
        // User reverts to original.
        { id: "user-revert", before: after, after: before }
      ]);
      const aiSamples = samples.get("ai-edit");
      assert.strictEqual(aiSamples[0], "1/1");
      const [fg, nr] = aiSamples[1].split("/").map(Number);
      assert.ok(fg < 0.2, `expected fourGram < 0.2 after revert, got ${fg}`);
      assert.strictEqual(nr, 0, "noRevert should be 0 after a full revert");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzaGFyZWRcXGVkaXRTdXJ2aXZhbFRyYWNrZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0Y29tcHV0ZTRHcmFtVGV4dFNpbWlsYXJpdHksXG5cdGNvbXB1dGVDaHVua2VkRWRpdFN1cnZpdmFsLFxuXHRjb21wdXRlQ2h1bmtlZEZvdXJHcmFtU3Vydml2YWwsXG5cdGNvbXB1dGVGcmFjdGlvblByZXNlbnRJbixcblx0Y29tcHV0ZVdob2xlRmlsZUVkaXRTdXJ2aXZhbCxcbn0gZnJvbSAnLi4vLi4vLi4vbm9kZS9zaGFyZWQvZWRpdFN1cnZpdmFsVHJhY2tlci5qcyc7XG5cbnN1aXRlKCdhZ2VudEhvc3QgZWRpdFN1cnZpdmFsVHJhY2tlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnY29tcHV0ZTRHcmFtVGV4dFNpbWlsYXJpdHknLCAoKSA9PiB7XG5cdFx0dGVzdCgnaWRlbnRpY2FsIHN0cmluZ3MgXHUyMTkyIDEnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZTRHcmFtVGV4dFNpbWlsYXJpdHkoJ2hlbGxvIHdvcmxkJywgJ2hlbGxvIHdvcmxkJyksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGVseSBkaWZmZXJlbnQgc3RyaW5ncyBcdTIxOTIgbG93IHNjb3JlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NvcmUgPSBjb21wdXRlNEdyYW1UZXh0U2ltaWxhcml0eSgnYWFhYWFhYWEnLCAnYmJiYmJiYmInKTtcblx0XHRcdGFzc2VydC5vayhzY29yZSA8IDAuMSwgYGV4cGVjdGVkIDwgMC4xLCBnb3QgJHtzY29yZX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3J0IGlucHV0cyAoPDQgY2hhcnMpIGZhbGwgYmFjayB0byBlcXVhbGl0eScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlNEdyYW1UZXh0U2ltaWxhcml0eSgnYWInLCAnYWInKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZTRHcmFtVGV4dFNpbWlsYXJpdHkoJ2FiJywgJ2NkJyksIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9zdGx5LXNoYXJlZCB0ZXh0IHNjb3JlcyBoaWdoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYSA9ICdmdW5jdGlvbiBncmVldCgpIHsgcmV0dXJuIFwiaGVsbG9cIjsgfSc7XG5cdFx0XHRjb25zdCBiID0gJ2Z1bmN0aW9uIGdyZWV0KCkgeyByZXR1cm4gXCJoZWxsbyFcIjsgfSc7XG5cdFx0XHRjb25zdCBzY29yZSA9IGNvbXB1dGU0R3JhbVRleHRTaW1pbGFyaXR5KGEsIGIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNjb3JlID4gMC44NSwgYGV4cGVjdGVkID4gMC44NSwgZ290ICR7c2NvcmV9YCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb21wdXRlV2hvbGVGaWxlRWRpdFN1cnZpdmFsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3VzZXIga2VwdCBBSSBvdXRwdXQgdmVyYmF0aW0gXHUyMTkyIDEvMScsICgpID0+IHtcblx0XHRcdGNvbnN0IGJlZm9yZSA9ICdvbGQgbGluZVxcbic7XG5cdFx0XHRjb25zdCBhZnRlciA9ICduZXcgbGluZVxcbic7XG5cdFx0XHRjb25zdCBzY29yZXMgPSBjb21wdXRlV2hvbGVGaWxlRWRpdFN1cnZpdmFsKGJlZm9yZSwgYWZ0ZXIsIGFmdGVyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZXMuZm91ckdyYW0sIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Jlcy5ub1JldmVydCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VyIGZ1bGx5IHJldmVydGVkIHRvIG9yaWdpbmFsIFx1MjE5MiBsb3cgZm91ckdyYW0sIGxvdyBub1JldmVydCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGJlZm9yZSA9ICdhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFcXG4nO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSAnYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiXFxuJztcblx0XHRcdGNvbnN0IHNjb3JlcyA9IGNvbXB1dGVXaG9sZUZpbGVFZGl0U3Vydml2YWwoYmVmb3JlLCBhZnRlciwgYmVmb3JlKTtcblx0XHRcdGFzc2VydC5vayhzY29yZXMuZm91ckdyYW0gPCAwLjIsIGBmb3VyR3JhbSBleHBlY3RlZCA8IDAuMiwgZ290ICR7c2NvcmVzLmZvdXJHcmFtfWApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Jlcy5ub1JldmVydCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VyIHJlZmluZWQgQUkgb3V0cHV0IFx1MjE5MiBmb3VyR3JhbSBsb3dlciwgbm9SZXZlcnQgc3RheXMgYXQgMScsICgpID0+IHtcblx0XHRcdGNvbnN0IGJlZm9yZSA9ICdmdW5jdGlvbiBhZGQoYSwgYikgeyByZXR1cm4gYSArIGI7IH1cXG4nO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSAnZnVuY3Rpb24gYWRkKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyIHsgcmV0dXJuIGEgKyBiOyB9XFxuJztcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSAnZnVuY3Rpb24gYWRkKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyIHtcXG5cXHRyZXR1cm4gYSArIGI7XFxufVxcbic7XG5cdFx0XHRjb25zdCBzY29yZXMgPSBjb21wdXRlV2hvbGVGaWxlRWRpdFN1cnZpdmFsKGJlZm9yZSwgYWZ0ZXIsIGN1cnJlbnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNjb3Jlcy5mb3VyR3JhbSA+IDAuNSAmJiBzY29yZXMuZm91ckdyYW0gPCAxLCBgZm91ckdyYW0gZXhwZWN0ZWQgbWlkLXJhbmdlLCBnb3QgJHtzY29yZXMuZm91ckdyYW19YCk7XG5cdFx0XHQvLyBSZWZpbmVtZW50IGRpdmVyZ2VzIGZyb20gQUkgdGV4dCBidXQgc3RheXMgZXF1YWxseSBmYXIgZnJvbVxuXHRcdFx0Ly8gdGhlIG9yaWdpbmFsIFx1MjAxNCBzaG91bGQgbm90IGJlIGNvdW50ZWQgYXMgYSByZXZlcnQuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmVzLm5vUmV2ZXJ0LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0FJIHByb2R1Y2VkIHNhbWUgdGV4dCBhcyBiZWZvcmUgXHUyMTkyIG5vUmV2ZXJ0IGRlZmF1bHRzIHRvIDEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gJ3VuY2hhbmdlZFxcbic7XG5cdFx0XHRjb25zdCBzY29yZXMgPSBjb21wdXRlV2hvbGVGaWxlRWRpdFN1cnZpdmFsKHRleHQsIHRleHQsIHRleHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Jlcy5mb3VyR3JhbSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmVzLm5vUmV2ZXJ0LCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvbXB1dGVGcmFjdGlvblByZXNlbnRJbicsICgpID0+IHtcblx0XHR0ZXN0KCdjaHVuayBmdWxseSBwcmVzZW50IGluIGN1cnJlbnQgXHUyMTkyIDEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjaHVuayA9ICdleHBvcnQgZnVuY3Rpb24gZ3JlZXQoKSB7IHJldHVybiBcImhlbGxvXCI7IH1cXG4nO1xuXHRcdFx0Y29uc3QgZmlsZSA9ICcvLyBoZWFkZXJcXG4nICsgY2h1bmsgKyAnLy8gZm9vdGVyXFxuJztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRnJhY3Rpb25QcmVzZW50SW4oY2h1bmssIGZpbGUpLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NodW5rIGZ1bGx5IGFic2VudCBmcm9tIGN1cnJlbnQgXHUyMTkyIDAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjaHVuayA9ICd4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4XFxuJztcblx0XHRcdGNvbnN0IGZpbGUgPSAnY29tcGxldGVseSB1bnJlbGF0ZWQgY29udGVudCBoZXJlXFxuJztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRnJhY3Rpb25QcmVzZW50SW4oY2h1bmssIGZpbGUpLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnRpYWwgb3ZlcmxhcCBcdTIxOTIgZnJhY3Rpb24gYmV0d2VlbiAwIGFuZCAxJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2h1bmsgPSAnZnVuY3Rpb24gYWRkKGEsIGIpIHsgcmV0dXJuIGEgKyBiOyB9XFxuJztcblx0XHRcdGNvbnN0IGZpbGUgPSAnZnVuY3Rpb24gYWRkKGEsIGIpIHsgcmV0dXJuIGEgLSBiOyB9XFxuJztcblx0XHRcdGNvbnN0IHNjb3JlID0gY29tcHV0ZUZyYWN0aW9uUHJlc2VudEluKGNodW5rLCBmaWxlKTtcblx0XHRcdGFzc2VydC5vayhzY29yZSA+IDAuNSAmJiBzY29yZSA8IDEsIGBleHBlY3RlZCBmcmFjdGlvbiBpbiAoMC41LCAxKSwgZ290ICR7c2NvcmV9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbXB0eSBjaHVuayBcdTIxOTIgMScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRnJhY3Rpb25QcmVzZW50SW4oJycsICdhbnl0aGluZycpLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NodW5rIHNob3J0ZXIgdGhhbiA0IGNoYXJzIGZhbGxzIGJhY2sgdG8gc3Vic3RyaW5nIG1hdGNoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVGcmFjdGlvblByZXNlbnRJbignYWInLCAnY2FiZCcpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRnJhY3Rpb25QcmVzZW50SW4oJ2FiJywgJ2N4ZCcpLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ltbXVuZSB0byBmaWxlIGdyb3d0aDogc2NvcmUgc3RheXMgYXQgMSB3aGVuIGNvbnRlbnQgaXMgYXBwZW5kZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjaHVuayA9ICdleHBvcnQgZnVuY3Rpb24gZ3JlZXQoKSB7IHJldHVybiBcImhlbGxvXCI7IH1cXG4nO1xuXHRcdFx0Y29uc3Qgc21hbGwgPSBjaHVuaztcblx0XHRcdGNvbnN0IGJpZyA9IGNodW5rICsgJ3gnLnJlcGVhdCgxMF8wMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVGcmFjdGlvblByZXNlbnRJbihjaHVuaywgc21hbGwpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlRnJhY3Rpb25QcmVzZW50SW4oY2h1bmssIGJpZyksIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29tcHV0ZUNodW5rZWRGb3VyR3JhbVN1cnZpdmFsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2VtcHR5IGNodW5rcyBcdTIxOTIgMCAoY2FsbGVyIHNob3VsZCBicmFuY2ggYW5kIGZhbGwgYmFjayknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZUNodW5rZWRGb3VyR3JhbVN1cnZpdmFsKFtdLCAnZmlsZScpLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIGNodW5rcyB3ZWlnaHRlZCBieSBsZW5ndGgnLCAoKSA9PiB7XG5cdFx0XHQvLyBBIGxvbmcgY2h1bmsgZnVsbHkgcHJlc2VudCwgYSBzaG9ydCBjaHVuayBmdWxseSBhYnNlbnQuXG5cdFx0XHQvLyBUaGUgbG9uZyBjaHVuayBzaG91bGQgZG9taW5hdGUsIGRyYWdnaW5nIHRoZSBhdmVyYWdlIHVwLlxuXHRcdFx0Y29uc3QgbG9uZ0NodW5rID0gJ2EnLnJlcGVhdCgyMDApO1xuXHRcdFx0Y29uc3Qgc2hvcnRDaHVuayA9ICd4eXo5JzsgLy8gNC1ncmFtIGFic2VudCBmcm9tIGZpbGVcblx0XHRcdGNvbnN0IGZpbGUgPSBsb25nQ2h1bms7XG5cdFx0XHRjb25zdCBzY29yZSA9IGNvbXB1dGVDaHVua2VkRm91ckdyYW1TdXJ2aXZhbChbbG9uZ0NodW5rLCBzaG9ydENodW5rXSwgZmlsZSk7XG5cdFx0XHQvLyBsb25nIFx1MjI0OCAyMDAgbmdyYW1zICogMS4wICsgc2hvcnQgXHUyMjQ4IDEgbmdyYW0gKiAwLjAsXG5cdFx0XHQvLyB3ZWlnaHRlZDogMjAwIC8gMjAxIFx1MjI0OCAwLjk5NVxuXHRcdFx0YXNzZXJ0Lm9rKHNjb3JlID4gMC45OSwgYGV4cGVjdGVkIG5lYXIgMSwgZ290ICR7c2NvcmV9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGwgY2h1bmtzIGZ1bGx5IHByZXNlbnQgXHUyMTkyIDEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhID0gJ2V4cG9ydCBjb25zdCB4ID0gMTtcXG4nO1xuXHRcdFx0Y29uc3QgYiA9ICdleHBvcnQgY29uc3QgeSA9IDI7XFxuJztcblx0XHRcdGNvbnN0IGZpbGUgPSBgLy8gaGVhZGVyXFxuJHthfS8vIG1pZFxcbiR7Yn0vLyBmb290ZXJcXG5gO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVDaHVua2VkRm91ckdyYW1TdXJ2aXZhbChbYSwgYl0sIGZpbGUpLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NjYWxlcyBsaW5lYXJseSB3aXRoIGNodW5rczogZmlsZSBuLWdyYW0gc2V0IGlzIGJ1aWx0IG9uY2UnLCAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uIGd1YXJkOiBhIHByZXZpb3VzIGltcGxlbWVudGF0aW9uIHJlYnVpbHQgdGhlXG5cdFx0XHQvLyBmaWxlIG4tZ3JhbSBzZXQgaW5zaWRlIHRoZSBwZXItY2h1bmsgbG9vcCwgbWFraW5nIGNvc3Rcblx0XHRcdC8vIE8ofGNodW5rc3wgXHUwMEQ3IHxmaWxlfCkuIFdpdGggdGhlIHNldCBidWlsdCBvbmNlLCBzY29yaW5nXG5cdFx0XHQvLyA1MCBjaHVua3MgYWdhaW5zdCBhIDUwMCBLQiBmaWxlIHNob3VsZCBmaW5pc2ggd2VsbFxuXHRcdFx0Ly8gdW5kZXIgYSBzZWNvbmQgb24gYW55IGRldmVsb3BlciBtYWNoaW5lLlxuXHRcdFx0Y29uc3QgZmlsZSA9ICd4Jy5yZXBlYXQoNTAwXzAwMCk7XG5cdFx0XHRjb25zdCBjaHVua3MgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA1MCB9LCAoXywgaSkgPT4gYGNodW5rJHtpfS0keyd4Jy5yZXBlYXQoNDApfWApO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgc2NvcmUgPSBjb21wdXRlQ2h1bmtlZEZvdXJHcmFtU3Vydml2YWwoY2h1bmtzLCBmaWxlKTtcblx0XHRcdGNvbnN0IGVsYXBzZWRNcyA9IERhdGUubm93KCkgLSBzdGFydDtcblx0XHRcdGFzc2VydC5vayhzY29yZSA+PSAwICYmIHNjb3JlIDw9IDEsIGBzY29yZSBvdXQgb2YgcmFuZ2U6ICR7c2NvcmV9YCk7XG5cdFx0XHRhc3NlcnQub2soZWxhcHNlZE1zIDwgMTAwMCwgYGV4cGVjdGVkIDwgMTAwMG1zLCB0b29rICR7ZWxhcHNlZE1zfW1zYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb21wdXRlQ2h1bmtlZEVkaXRTdXJ2aXZhbCcsICgpID0+IHtcblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHdob2xlLWZpbGUgc2NvcmluZyB3aGVuIGNodW5rcyBhcmUgZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSAnYWFhYWFhYWFhYWFhYWFhYWFhYWFcXG4nO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSAnYmJiYmJiYmJiYmJiYmJiYmJiYmJcXG4nO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBjb21wdXRlV2hvbGVGaWxlRWRpdFN1cnZpdmFsKGJlZm9yZSwgYWZ0ZXIsIGFmdGVyKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IGNvbXB1dGVDaHVua2VkRWRpdFN1cnZpdmFsKGJlZm9yZSwgYWZ0ZXIsIFtdLCBhZnRlcik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm91ckdyYW0gZnJvbSBjaHVua3MsIG5vUmV2ZXJ0IHN0aWxsIGZyb20gd2hvbGUtZmlsZScsICgpID0+IHtcblx0XHRcdC8vIEZpbGUgZ3Jvd3MgYXJvdW5kIHRoZSBjaHVuayBcdTIwMTQgY2h1bmtlZCBmb3VyR3JhbSBzdGF5cyBhdCAxXG5cdFx0XHQvLyB3aGlsZSBub1JldmVydCBzdGF5cyBhdCAxIGJlY2F1c2UgdGhlIGZpbGUgZGlkIG5vdCBtb3ZlXG5cdFx0XHQvLyBiYWNrIHRvd2FyZCBgYmVmb3JlYC5cblx0XHRcdGNvbnN0IGJlZm9yZSA9ICcvLyBlbXB0eVxcbic7XG5cdFx0XHRjb25zdCBjaHVuayA9ICdleHBvcnQgZnVuY3Rpb24gZ3JlZXQoKSB7IHJldHVybiBcImhlbGxvXCI7IH1cXG4nO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSBiZWZvcmUgKyBjaHVuaztcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBhZnRlciArICdcXG4vLyBsYXRlciBhcHBlbmRcXG4nO1xuXHRcdFx0Y29uc3Qgc2NvcmVzID0gY29tcHV0ZUNodW5rZWRFZGl0U3Vydml2YWwoYmVmb3JlLCBhZnRlciwgW2NodW5rXSwgY3VycmVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmVzLmZvdXJHcmFtLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZXMubm9SZXZlcnQsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbXVsdGktdHJhY2tlciBzY2VuYXJpb3MnLCAoKSA9PiB7XG5cdFx0Ly8gRWFjaCBzY2VuYXJpbyBzaW11bGF0ZXMgc2V2ZXJhbCByZXBvcnRlcnMgcnVubmluZyBjb25jdXJyZW50bHlcblx0XHQvLyBhZ2FpbnN0IHRoZSBzYW1lIGZpbGUsIHRoZSB3YXkgdGhlIGFnZW50IGhvc3QgbGF1bmNoZXMgb25lXG5cdFx0Ly8gcGVyIGB0YWtlQ29tcGxldGVkRWRpdGAuIFdlIHNuYXBzaG90IHRoZSBzY29yZXMgZWFjaCByZXBvcnRlclxuXHRcdC8vIHdvdWxkIGNvbXB1dGUgYXQgZXZlcnkgc3Vic2VxdWVudCBmaWxlIHN0YXRlIFx1MjAxNCBpLmUuIHdoYXRcblx0XHQvLyB0ZWxlbWV0cnkgd291bGQgc2hvdyBhY3Jvc3MgdGhlIDcgdGltZXIgdGlja3MgaWYgdGhvc2UgdGlja3Ncblx0XHQvLyBsYW5kZWQgYXQgdGhlIGNvcnJlc3BvbmRpbmcgZmlsZSBzdGF0ZXMuXG5cdFx0Ly9cblx0XHQvLyBFYWNoIHRhYmxlIGNlbGwgaXMgYGZvdXJHcmFtL25vUmV2ZXJ0YCwgYm90aCByb3VuZGVkIHRvIDJkcC5cblxuXHRcdGludGVyZmFjZSBJRWRpdCB7XG5cdFx0XHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRcdFx0LyoqIEZpbGUgY29udGVudCByaWdodCBiZWZvcmUgdGhpcyBlZGl0IGxhbmRlZC4gKi9cblx0XHRcdHJlYWRvbmx5IGJlZm9yZTogc3RyaW5nO1xuXHRcdFx0LyoqIEZpbGUgY29udGVudCByaWdodCBhZnRlciB0aGlzIGVkaXQgbGFuZGVkLiAqL1xuXHRcdFx0cmVhZG9ubHkgYWZ0ZXI6IHN0cmluZztcblx0XHRcdC8qKlxuXHRcdFx0ICogT3B0aW9uYWwgZXhwbGljaXQgQUktd3JpdHRlbiB0ZXh0IGNodW5rcyBmb3IgdGhpcyBlZGl0XG5cdFx0XHQgKiAodGhlIHdheSB0aGUgQ2xhdWRlIG9ic2VydmVyIGV4dHJhY3RzIHRoZW0gZnJvbVxuXHRcdFx0ICogYEVkaXQubmV3X3N0cmluZ2AsIGBNdWx0aUVkaXQuZWRpdHNbKl0ubmV3X3N0cmluZ2AsIG9yXG5cdFx0XHQgKiBgV3JpdGUuY29udGVudGApLiBXaGVuIHByb3ZpZGVkLCB0aGUgc2ltdWxhdGlvbiB1c2VzIHRoZVxuXHRcdFx0ICogY2h1bmtlZCBzY29yaW5nIHBhdGggc28gdGhlIHNuYXBzaG90IG1pcnJvcnMgd2hhdCB0aGVcblx0XHRcdCAqIHJlcG9ydGVyIHdvdWxkIGFjdHVhbGx5IGVtaXQuXG5cdFx0XHQgKi9cblx0XHRcdHJlYWRvbmx5IGFpQ2h1bmtzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcm91bmQobjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdHJldHVybiBNYXRoLnJvdW5kKG4gKiAxMDApIC8gMTAwO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIEZvciBlYWNoIGVkaXQsIHNhbXBsZSBpdHMgc3Vydml2YWwgc2NvcmVzIGFnYWluc3QgZXZlcnkgbGF0ZXJcblx0XHQgKiBmaWxlIHN0YXRlICh0aGUgc3RhdGUgd2hlbiB0aGF0IGVkaXQgY29tcGxldGVkLCB0aGVuIGVhY2hcblx0XHQgKiBzdGF0ZSBwcm9kdWNlZCBieSBzdWJzZXF1ZW50IGVkaXRzKS4gUmV0dXJucyBhIGBNYXA8ZWRpdElkLCBzY29yZXNbXT5gXG5cdFx0ICogd2hlcmUgYHNjb3Jlc1tpXWAgaXMgdGhlIHNjb3JlIHRoZSByZXBvcnRlciBmb3IgYGVkaXRJZGAgd291bGRcblx0XHQgKiBlbWl0IGlmIGEgdGltZXIgdGljayBsYW5kZWQgb24gZmlsZSBzdGF0ZSBgaWAgKGNvdW50aW5nIGZyb21cblx0XHQgKiB3aGVuIHRoYXQgZWRpdCBjb21wbGV0ZWQpLlxuXHRcdCAqL1xuXHRcdGZ1bmN0aW9uIHNpbXVsYXRlKGVkaXRzOiBSZWFkb25seUFycmF5PElFZGl0Pik6IE1hcDxzdHJpbmcsIFJlYWRvbmx5QXJyYXk8c3RyaW5nPj4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZ1tdPigpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlZGl0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBlZGl0ID0gZWRpdHNbaV07XG5cdFx0XHRcdGNvbnN0IHNhbXBsZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdC8vIFRoZSByZXBvcnRlciBzYW1wbGVzIGF0IHQ9MCAoaXRzIG93biBgYWZ0ZXJgKSBhbmQgdGhlblxuXHRcdFx0XHQvLyBhdCBlYWNoIGxhdGVyIGVkaXQncyBgYWZ0ZXJgLlxuXHRcdFx0XHRjb25zdCBzdHJlYW0gPSBbZWRpdC5hZnRlciwgLi4uZWRpdHMuc2xpY2UoaSArIDEpLm1hcChlID0+IGUuYWZ0ZXIpXTtcblx0XHRcdFx0Zm9yIChjb25zdCBjdXJyZW50VGV4dCBvZiBzdHJlYW0pIHtcblx0XHRcdFx0XHRjb25zdCB7IGZvdXJHcmFtLCBub1JldmVydCB9ID0gZWRpdC5haUNodW5rc1xuXHRcdFx0XHRcdFx0PyBjb21wdXRlQ2h1bmtlZEVkaXRTdXJ2aXZhbChlZGl0LmJlZm9yZSwgZWRpdC5hZnRlciwgZWRpdC5haUNodW5rcywgY3VycmVudFRleHQpXG5cdFx0XHRcdFx0XHQ6IGNvbXB1dGVXaG9sZUZpbGVFZGl0U3Vydml2YWwoZWRpdC5iZWZvcmUsIGVkaXQuYWZ0ZXIsIGN1cnJlbnRUZXh0KTtcblx0XHRcdFx0XHRzYW1wbGVzLnB1c2goYCR7cm91bmQoZm91ckdyYW0pfS8ke3JvdW5kKG5vUmV2ZXJ0KX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQuc2V0KGVkaXQuaWQsIHNhbXBsZXMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHR0ZXN0KCd0d28gbm9uLW92ZXJsYXBwaW5nIGFkZGl0aW9ucyBib3RoIHN1cnZpdmUgKHdob2xlLWZpbGUgc2NvcmluZyknLCAoKSA9PiB7XG5cdFx0XHQvLyBBZ2VudCBhZGRzIGEgbGluZSBhdCB0aGUgYm90dG9tLCB0aGVuIGFkZHMgYW5vdGhlciBhdCB0aGVcblx0XHRcdC8vIHRvcC4gTmVpdGhlciBlZGl0IGRpc3R1cmJzIHRoZSBvdGhlcidzIGNvbnRlbnQuXG5cdFx0XHRjb25zdCBiYXNlID0gJ2FscGhhXFxuYnJhdm9cXG5jaGFybGllXFxuJztcblx0XHRcdGNvbnN0IGFmdGVyRTEgPSBiYXNlICsgJ2RlbHRhIGFkZGVkIGJ5IGUxXFxuJztcblx0XHRcdGNvbnN0IGFmdGVyRTIgPSAnZWNobyBhZGRlZCBieSBlMlxcbicgKyBhZnRlckUxO1xuXG5cdFx0XHRjb25zdCBzYW1wbGVzID0gc2ltdWxhdGUoW1xuXHRcdFx0XHR7IGlkOiAnZTEnLCBiZWZvcmU6IGJhc2UsIGFmdGVyOiBhZnRlckUxIH0sXG5cdFx0XHRcdHsgaWQ6ICdlMicsIGJlZm9yZTogYWZ0ZXJFMSwgYWZ0ZXI6IGFmdGVyRTIgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKE9iamVjdC5mcm9tRW50cmllcyhzYW1wbGVzKSwge1xuXHRcdFx0XHQvLyBlMTogdD0wIHBlcmZlY3QuIEFmdGVyIGUyIGxhbmRzLCBlMSdzIGFkZGVkIGxpbmUgaXNcblx0XHRcdFx0Ly8gc3RpbGwgcHJlc2VudCAobm9SZXZlcnQ9MSkgYnV0IHRoZSBmaWxlIGhhcyAqbW9yZSpcblx0XHRcdFx0Ly8gdGV4dCB0aGFuIGUxIHdyb3RlLCBzbyB0aGUgZm91ckdyYW0gcmF0aW8gZmFsbHMuXG5cdFx0XHRcdC8vIFRoaXMgaXMgdGhlIHdob2xlLWZpbGUgc2NvcmluZyBhcnRpZmFjdCBcdTIwMTQgY2h1bmtlZFxuXHRcdFx0XHQvLyBzY29yaW5nIGZpeGVzIGl0IChzZWUgdGhlIGNodW5rZWQgdGVzdCBiZWxvdykuXG5cdFx0XHRcdGUxOiBbJzEvMScsICcwLjgvMSddLFxuXHRcdFx0XHRlMjogWycxLzEnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHdvIG5vbi1vdmVybGFwcGluZyBhZGRpdGlvbnMgYm90aCBzdXJ2aXZlIChjaHVua2VkIHNjb3JpbmcpJywgKCkgPT4ge1xuXHRcdFx0Ly8gU2FtZSBzY2VuYXJpbyBhcyBhYm92ZSwgYnV0IGVhY2ggZWRpdCBub3cgY2FycmllcyBpdHNcblx0XHRcdC8vIEFJLXdyaXR0ZW4gY2h1bmsgKG1pcnJvcmluZyB3aGF0IGBFZGl0Lm5ld19zdHJpbmdgIC9cblx0XHRcdC8vIGBXcml0ZS5jb250ZW50YCBleHRyYWN0aW9uIHBhc3NlcyB0aHJvdWdoIHRvIHRoZSByZXBvcnRlcikuXG5cdFx0XHQvLyBUaGUgY2h1bmtlZCBwYXRoIHNjb3JlcyBlYWNoIGVkaXQgYWdhaW5zdCBpdHMgb3duXG5cdFx0XHQvLyBBSS13cml0dGVuIHRleHQsIHNvIGZpbGUgZ3Jvd3RoIGVsc2V3aGVyZSBkb2VzIG5vdCBkcmFnXG5cdFx0XHQvLyB0aGUgc2NvcmUgZG93bi5cblx0XHRcdGNvbnN0IGJhc2UgPSAnYWxwaGFcXG5icmF2b1xcbmNoYXJsaWVcXG4nO1xuXHRcdFx0Y29uc3QgZTFDaHVuayA9ICdkZWx0YSBhZGRlZCBieSBlMVxcbic7XG5cdFx0XHRjb25zdCBlMkNodW5rID0gJ2VjaG8gYWRkZWQgYnkgZTJcXG4nO1xuXHRcdFx0Y29uc3QgYWZ0ZXJFMSA9IGJhc2UgKyBlMUNodW5rO1xuXHRcdFx0Y29uc3QgYWZ0ZXJFMiA9IGUyQ2h1bmsgKyBhZnRlckUxO1xuXG5cdFx0XHRjb25zdCBzYW1wbGVzID0gc2ltdWxhdGUoW1xuXHRcdFx0XHR7IGlkOiAnZTEnLCBiZWZvcmU6IGJhc2UsIGFmdGVyOiBhZnRlckUxLCBhaUNodW5rczogW2UxQ2h1bmtdIH0sXG5cdFx0XHRcdHsgaWQ6ICdlMicsIGJlZm9yZTogYWZ0ZXJFMSwgYWZ0ZXI6IGFmdGVyRTIsIGFpQ2h1bmtzOiBbZTJDaHVua10gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKE9iamVjdC5mcm9tRW50cmllcyhzYW1wbGVzKSwge1xuXHRcdFx0XHQvLyBlMSdzIGNodW5rIGlzIHN0aWxsIGVudGlyZWx5IHByZXNlbnQgYWZ0ZXIgZTIgbGFuZHNcblx0XHRcdFx0Ly8gKGl0J3MganVzdCBkZWVwZXIgaW4gdGhlIGZpbGUpIFx1MjE5MiBmb3VyR3JhbSBzdGF5cyBhdCAxLlxuXHRcdFx0XHRlMTogWycxLzEnLCAnMS8xJ10sXG5cdFx0XHRcdGUyOiBbJzEvMSddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZSB0aGVuIGVkaXQgdGhhdCBhcHBlbmRzIFx1MjAxNCB3cml0ZSBzdGF5cyBhdCAxIHVuZGVyIGNodW5rZWQgc2NvcmluZycsICgpID0+IHtcblx0XHRcdC8vIFRoZSBtb3RpdmF0aW5nIGNhc2U6IGFnZW50IHdyaXRlcyBhIGZpbGUgYXQgVDEsIHRoZW4gYVxuXHRcdFx0Ly8gbGF0ZXIgRWRpdCBhcHBlbmRzIG5ldyBjb250ZW50LiBXaG9sZS1maWxlIHNjb3Jpbmcgd291bGRcblx0XHRcdC8vIGRyYWcgdGhlIFdyaXRlJ3MgZm91ckdyYW0gZG93biBiZWNhdXNlIHRoZSBmaWxlIGlzIG5vd1xuXHRcdFx0Ly8gYmlnZ2VyIHRoYW4gd2hhdCB0aGUgV3JpdGUgcHJvZHVjZWQ7IGNodW5rZWQgc2NvcmluZ1xuXHRcdFx0Ly8ga2VlcHMgdGhlIFdyaXRlIGF0IDEgYmVjYXVzZSBpdHMgY29udGVudCBpcyBzdGlsbCBmdWxseVxuXHRcdFx0Ly8gcHJlc2VudC5cblx0XHRcdGNvbnN0IG9yaWdpbmFsID0gJ2V4cG9ydCBmdW5jdGlvbiBhKCkgeyByZXR1cm4gMTsgfVxcbic7XG5cdFx0XHRjb25zdCBhcHBlbmRlZCA9ICdleHBvcnQgZnVuY3Rpb24gYigpIHsgcmV0dXJuIDI7IH1cXG4nO1xuXHRcdFx0Y29uc3QgYWZ0ZXJXcml0ZSA9IG9yaWdpbmFsO1xuXHRcdFx0Y29uc3QgYWZ0ZXJFZGl0ID0gb3JpZ2luYWwgKyBhcHBlbmRlZDtcblxuXHRcdFx0Y29uc3Qgc2FtcGxlcyA9IHNpbXVsYXRlKFtcblx0XHRcdFx0eyBpZDogJ3dyaXRlJywgYmVmb3JlOiAnJywgYWZ0ZXI6IGFmdGVyV3JpdGUsIGFpQ2h1bmtzOiBbb3JpZ2luYWxdIH0sXG5cdFx0XHRcdHsgaWQ6ICdlZGl0JywgYmVmb3JlOiBhZnRlcldyaXRlLCBhZnRlcjogYWZ0ZXJFZGl0LCBhaUNodW5rczogW2FwcGVuZGVkXSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoT2JqZWN0LmZyb21FbnRyaWVzKHNhbXBsZXMpLCB7XG5cdFx0XHRcdHdyaXRlOiBbJzEvMScsICcxLzEnXSxcblx0XHRcdFx0ZWRpdDogWycxLzEnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnTXVsdGlFZGl0IHdpdGggc2V2ZXJhbCBjaHVua3Mgc3Vydml2ZXMgYSBsYXRlciB1bnJlbGF0ZWQgYXBwZW5kJywgKCkgPT4ge1xuXHRcdFx0Ly8gTXVsdGlFZGl0IGxhbmRzIHRocmVlIG5ldyBmdW5jdGlvbnMuIEEgc3Vic2VxdWVudCBFZGl0XG5cdFx0XHQvLyBhcHBlbmRzIGEgZm91cnRoIGZ1bmN0aW9uLiBFYWNoIE11bHRpRWRpdCBjaHVuayBpcyBzdGlsbFxuXHRcdFx0Ly8gZnVsbHkgcHJlc2VudCwgc28gdGhlIGxlbmd0aC13ZWlnaHRlZCBhdmVyYWdlIHN0YXlzIGF0IDEuXG5cdFx0XHRjb25zdCBiYXNlID0gJy8vIGV4aXN0aW5nIG1vZHVsZVxcbic7XG5cdFx0XHRjb25zdCBjaHVua0EgPSAnZXhwb3J0IGZ1bmN0aW9uIGFscGhhKCkgeyByZXR1cm4gMTsgfVxcbic7XG5cdFx0XHRjb25zdCBjaHVua0IgPSAnZXhwb3J0IGZ1bmN0aW9uIGJyYXZvKCkgeyByZXR1cm4gMjsgfVxcbic7XG5cdFx0XHRjb25zdCBjaHVua0MgPSAnZXhwb3J0IGZ1bmN0aW9uIGNoYXJsaWUoKSB7IHJldHVybiAzOyB9XFxuJztcblx0XHRcdGNvbnN0IGNodW5rRCA9ICdleHBvcnQgZnVuY3Rpb24gZGVsdGEoKSB7IHJldHVybiA0OyB9XFxuJztcblx0XHRcdGNvbnN0IGFmdGVyTXVsdGkgPSBiYXNlICsgY2h1bmtBICsgY2h1bmtCICsgY2h1bmtDO1xuXHRcdFx0Y29uc3QgYWZ0ZXJFZGl0ID0gYWZ0ZXJNdWx0aSArIGNodW5rRDtcblxuXHRcdFx0Y29uc3Qgc2FtcGxlcyA9IHNpbXVsYXRlKFtcblx0XHRcdFx0eyBpZDogJ211bHRpJywgYmVmb3JlOiBiYXNlLCBhZnRlcjogYWZ0ZXJNdWx0aSwgYWlDaHVua3M6IFtjaHVua0EsIGNodW5rQiwgY2h1bmtDXSB9LFxuXHRcdFx0XHR7IGlkOiAnZWRpdCcsIGJlZm9yZTogYWZ0ZXJNdWx0aSwgYWZ0ZXI6IGFmdGVyRWRpdCwgYWlDaHVua3M6IFtjaHVua0RdIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3QuZnJvbUVudHJpZXMoc2FtcGxlcyksIHtcblx0XHRcdFx0bXVsdGk6IFsnMS8xJywgJzEvMSddLFxuXHRcdFx0XHRlZGl0OiBbJzEvMSddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGQgYSBsaW5lLCB0aGVuIG1vZGlmeSB0aGUgc2FtZSBsaW5lIFx1MjAxNCBmb3VyR3JhbSBkcm9wcywgbm9SZXZlcnQgc3RheXMgaGlnaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGJhc2UgPSAnYWxwaGFcXG5icmF2b1xcbmNoYXJsaWVcXG4nO1xuXHRcdFx0Y29uc3QgYWZ0ZXJFMSA9IGJhc2UgKyAnZGVsdGEgdGhlIG9yaWdpbmFsXFxuJztcblx0XHRcdGNvbnN0IGFmdGVyRTIgPSBiYXNlICsgJ2RlbHRhIGFmdGVyIGVkaXQgdHdvIGNoYW5nZWQgaXRcXG4nO1xuXG5cdFx0XHRjb25zdCBzYW1wbGVzID0gc2ltdWxhdGUoW1xuXHRcdFx0XHR7IGlkOiAnZTEnLCBiZWZvcmU6IGJhc2UsIGFmdGVyOiBhZnRlckUxIH0sXG5cdFx0XHRcdHsgaWQ6ICdlMicsIGJlZm9yZTogYWZ0ZXJFMSwgYWZ0ZXI6IGFmdGVyRTIgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKE9iamVjdC5mcm9tRW50cmllcyhzYW1wbGVzKSwge1xuXHRcdFx0XHQvLyBlMTogYXQgdD0wIHBlcmZlY3Q7IG9uY2UgZTIgbGFuZHMgdGhlIG1vZGlmaWVkIGxpbmVcblx0XHRcdFx0Ly8gaXMgbm8gbG9uZ2VyIGUxJ3MgdGV4dCBcdTIxOTIgZm91ckdyYW0gZHJvcHMuIG5vUmV2ZXJ0XG5cdFx0XHRcdC8vIGhvbGRzIGF0IDEgYmVjYXVzZSB0aGUgZmlsZSBkaWQgbm90IG1vdmUgYmFjayB0b3dhcmRcblx0XHRcdFx0Ly8gYGJhc2VgLCBpdCBtb3ZlZCBmdXJ0aGVyIGF3YXkuXG5cdFx0XHRcdGUxOiBbJzEvMScsICcwLjU0LzEnXSxcblx0XHRcdFx0ZTI6IFsnMS8xJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NoYW5nZSBhIGxpbmUsIGFkZCBhIGxpbmUsIGRlbGV0ZSBhIGxpbmUgXHUyMDE0IG1peGVkIHN1cnZpdmFsJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhyZWUgZGlzam9pbnQgZWRpdHMgaW4gZGlmZmVyZW50IHJlZ2lvbnMuIFRoZSBmaW5hbCBmaWxlXG5cdFx0XHQvLyByZWZsZWN0cyBhbGwgdGhyZWU7IGV2ZXJ5b25lIHNob3VsZCBsb29rIGhlYWx0aHkuXG5cdFx0XHRjb25zdCBiYXNlID0gJ2ZpcnN0XFxuc2Vjb25kXFxudGhpcmRcXG5mb3VydGhcXG5maWZ0aFxcbic7XG5cdFx0XHRjb25zdCBhZnRlckUxID0gJ2ZpcnN0XFxuU0VDT05EIENIQU5HRURcXG50aGlyZFxcbmZvdXJ0aFxcbmZpZnRoXFxuJztcblx0XHRcdGNvbnN0IGFmdGVyRTIgPSBhZnRlckUxICsgJ3NpeHRoIGFkZGVkXFxuJztcblx0XHRcdGNvbnN0IGFmdGVyRTMgPSAnZmlyc3RcXG5TRUNPTkQgQ0hBTkdFRFxcbnRoaXJkXFxuZmlmdGhcXG5zaXh0aCBhZGRlZFxcbic7IC8vICdmb3VydGgnIHJlbW92ZWRcblxuXHRcdFx0Y29uc3Qgc2FtcGxlcyA9IHNpbXVsYXRlKFtcblx0XHRcdFx0eyBpZDogJ2UxLWNoYW5nZScsIGJlZm9yZTogYmFzZSwgYWZ0ZXI6IGFmdGVyRTEgfSxcblx0XHRcdFx0eyBpZDogJ2UyLWFkZCcsIGJlZm9yZTogYWZ0ZXJFMSwgYWZ0ZXI6IGFmdGVyRTIgfSxcblx0XHRcdFx0eyBpZDogJ2UzLWRlbGV0ZScsIGJlZm9yZTogYWZ0ZXJFMiwgYWZ0ZXI6IGFmdGVyRTMgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKE9iamVjdC5mcm9tRW50cmllcyhzYW1wbGVzKSwge1xuXHRcdFx0XHQvLyBBbGwgdGhyZWUgZWRpdHMga2VlcCBub1JldmVydCBhdCAxIHRocm91Z2hvdXQgXHUyMDE0IG5vbmVcblx0XHRcdFx0Ly8gb2YgdGhlIGxhdGVyIGVkaXRzIHB1bGxlZCB0aGUgZmlsZSBiYWNrIHRvd2FyZCBhblxuXHRcdFx0XHQvLyBlYXJsaWVyIGBiZWZvcmVgIHN0YXRlLiBmb3VyR3JhbSBmb3IgdGhlIGVhcmxpZXJcblx0XHRcdFx0Ly8gZWRpdHMgZHJvcHMgYXMgbGF0ZXIgZWRpdHMgYWRkIG9yIHJlbW92ZSBjb250ZW50XG5cdFx0XHRcdC8vIGVsc2V3aGVyZSBpbiB0aGUgZmlsZSAod2hvbGUtZmlsZSBzY29yaW5nIGlzIG5vdFxuXHRcdFx0XHQvLyByZWdpb24tYXdhcmUpLlxuXHRcdFx0XHQnZTEtY2hhbmdlJzogWycxLzEnLCAnMC44Ni8xJywgJzAuNzMvMSddLFxuXHRcdFx0XHQnZTItYWRkJzogWycxLzEnLCAnMC45LzEnXSxcblx0XHRcdFx0J2UzLWRlbGV0ZSc6IFsnMS8xJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FnZW50IHN1cGVyc2VkZXMgaXRzIG93biB3b3JrIFx1MjAxNCBmaXJzdCByZXBvcnRlciBmYWxzZWx5IHJlcG9ydHMgYSByZXZlcnQnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIGlzIHRoZSBmYWlsdXJlIG1vZGUgb2JzZXJ2ZWQgaW4gcHJvZHVjdGlvbiB0ZWxlbWV0cnk6XG5cdFx0XHQvLyBlMSBzaHJpbmtzIHRoZSBmaWxlLCBlMiByZXBsYWNlcyBpdCB3aXRoIHRoZSBvcmlnaW5hbFxuXHRcdFx0Ly8gY29udGVudC4gZTEncyByZXBvcnRlciBjYW5ub3QgdGVsbCB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuXG5cdFx0XHQvLyBcInVzZXIgcmV2ZXJ0ZWRcIiBhbmQgXCJuZXh0IEFJIGVkaXQgb3Zlcndyb3RlIG1lXCIgXHUyMTkyIG5vUmV2ZXJ0XG5cdFx0XHQvLyBjb2xsYXBzZXMgdG8gMCBldmVuIHRob3VnaCB0aGUgdXNlciBuZXZlciB0b3VjaGVkIGl0LlxuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSAnbGluZSBvbmVcXG5saW5lIHR3b1xcbmxpbmUgdGhyZWVcXG5saW5lIGZvdXJcXG4nO1xuXHRcdFx0Y29uc3Qgc2hydW5rZW4gPSAnbGluZSBvbmVcXG5saW5lIHR3b1xcbic7XG5cblx0XHRcdGNvbnN0IHNhbXBsZXMgPSBzaW11bGF0ZShbXG5cdFx0XHRcdHsgaWQ6ICdlMS1zaHJpbmsnLCBiZWZvcmU6IG9yaWdpbmFsLCBhZnRlcjogc2hydW5rZW4gfSxcblx0XHRcdFx0eyBpZDogJ2UyLXJlc3RvcmUnLCBiZWZvcmU6IHNocnVua2VuLCBhZnRlcjogb3JpZ2luYWwgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKE9iamVjdC5mcm9tRW50cmllcyhzYW1wbGVzKSwge1xuXHRcdFx0XHQvLyBlMSBhdCB0PTA6IGlkZW50aWNhbCB0byBpdHMgYGFmdGVyYCBcdTIxOTIgMS8xLlxuXHRcdFx0XHQvLyBlMSBhZnRlciBlMiBsYW5kczogY3VycmVudCBcdTIyNjEgb3JpZ2luYWwgXHUyMjYxIGUxJ3MgYGJlZm9yZWBcblx0XHRcdFx0Ly8gXHUyMTkyIG5vUmV2ZXJ0IGNvbGxhcHNlcyB0byAwLiBmb3VyR3JhbSBpcyB0aGUgc2ltaWxhcml0eVxuXHRcdFx0XHQvLyBiZXR3ZWVuIGUxJ3MgYGFmdGVyYCAoc2hydW5rZW4pIGFuZCB0aGUgcmVzdG9yZWQgZmlsZSxcblx0XHRcdFx0Ly8gd2hpY2ggc3RpbGwgb3ZlcmxhcHMgb24gdGhlIGZpcnN0IHR3byBsaW5lcy5cblx0XHRcdFx0J2UxLXNocmluayc6IFsnMS8xJywgJzAuNTkvMCddLFxuXHRcdFx0XHQnZTItcmVzdG9yZSc6IFsnMS8xJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXIgcmVmaW5lcyBhZnRlciBBSSBlZGl0IFx1MjAxNCBub1JldmVydCBob2xkcyBhdCAxJywgKCkgPT4ge1xuXHRcdFx0Ly8gT25lIEFJIGVkaXQsIHRoZW4gdGhlIHVzZXIgdHdlYWtzIHRoZSBhZGRlZCB0ZXh0LiBUaGVcblx0XHRcdC8vIHJlZmluZW1lbnQgZG9lcyBub3QgbW92ZSBjb250ZW50IGJhY2sgdG93YXJkIGBiZWZvcmVgLlxuXHRcdFx0Y29uc3QgYmFzZSA9ICdmdW5jdGlvbiBhZGQoYSwgYikgeyByZXR1cm4gYSArIGI7IH1cXG4nO1xuXHRcdFx0Y29uc3QgYWZ0ZXJBSSA9ICdmdW5jdGlvbiBhZGQoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIgeyByZXR1cm4gYSArIGI7IH1cXG4nO1xuXHRcdFx0Y29uc3QgYWZ0ZXJVc2VyID0gJ2Z1bmN0aW9uIGFkZChhOiBudW1iZXIsIGI6IG51bWJlcik6IG51bWJlciB7XFxuXFx0cmV0dXJuIGEgKyBiO1xcbn1cXG4nO1xuXG5cdFx0XHRjb25zdCBzYW1wbGVzID0gc2ltdWxhdGUoW1xuXHRcdFx0XHR7IGlkOiAnYWktZWRpdCcsIGJlZm9yZTogYmFzZSwgYWZ0ZXI6IGFmdGVyQUkgfSxcblx0XHRcdFx0Ly8gVHJlYXQgdGhlIHVzZXIgcmVmaW5lbWVudCBhcyBhIHN5bnRoZXRpYyBcImVkaXRcIiBzb1xuXHRcdFx0XHQvLyBzaW11bGF0ZSgpIGFkdmFuY2VzIHRoZSByZXBvcnRlciB0aHJvdWdoIHRoYXQgc3RhdGUuXG5cdFx0XHRcdHsgaWQ6ICd1c2VyLXJlZmluZScsIGJlZm9yZTogYWZ0ZXJBSSwgYWZ0ZXI6IGFmdGVyVXNlciB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFpU2FtcGxlcyA9IHNhbXBsZXMuZ2V0KCdhaS1lZGl0JykhO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpU2FtcGxlc1swXSwgJzEvMScsICdBSSBlZGl0IHBlcmZlY3QgYXQgdD0wJyk7XG5cdFx0XHQvLyBBZnRlciB0aGUgdXNlciByZWZpbmVzLCBmb3VyR3JhbSBkcm9wcyBhIGJpdCBidXQgbm9SZXZlcnRcblx0XHRcdC8vIHN0YXlzIGF0IDEgYmVjYXVzZSB0aGUgZmlsZSBtb3ZlZCBmdXJ0aGVyIGZyb20gYGJhc2VgLFxuXHRcdFx0Ly8gbm90IGJhY2sgdG93YXJkIGl0LlxuXHRcdFx0Y29uc3QgW2ZnLCBucl0gPSBhaVNhbXBsZXNbMV0uc3BsaXQoJy8nKS5tYXAoTnVtYmVyKTtcblx0XHRcdGFzc2VydC5vayhmZyA+IDAuNCAmJiBmZyA8IDEsIGBleHBlY3RlZCBmb3VyR3JhbSBpbiAoMC40LCAxKSwgZ290ICR7Zmd9YCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnIsIDEsICdub1JldmVydCBzaG91bGQgcmVtYWluIDEgYWZ0ZXIgYSByZWZpbmVtZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VyIGZ1bGx5IHJldmVydHMgYWZ0ZXIgQUkgZWRpdCBcdTIwMTQgYm90aCBzY29yZXMgZHJvcCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGJlZm9yZSA9ICdhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhXFxuJztcblx0XHRcdGNvbnN0IGFmdGVyID0gJ2JiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJcXG4nO1xuXG5cdFx0XHRjb25zdCBzYW1wbGVzID0gc2ltdWxhdGUoW1xuXHRcdFx0XHR7IGlkOiAnYWktZWRpdCcsIGJlZm9yZSwgYWZ0ZXIgfSxcblx0XHRcdFx0Ly8gVXNlciByZXZlcnRzIHRvIG9yaWdpbmFsLlxuXHRcdFx0XHR7IGlkOiAndXNlci1yZXZlcnQnLCBiZWZvcmU6IGFmdGVyLCBhZnRlcjogYmVmb3JlIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWlTYW1wbGVzID0gc2FtcGxlcy5nZXQoJ2FpLWVkaXQnKSE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWlTYW1wbGVzWzBdLCAnMS8xJyk7XG5cdFx0XHRjb25zdCBbZmcsIG5yXSA9IGFpU2FtcGxlc1sxXS5zcGxpdCgnLycpLm1hcChOdW1iZXIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZnIDwgMC4yLCBgZXhwZWN0ZWQgZm91ckdyYW0gPCAwLjIgYWZ0ZXIgcmV2ZXJ0LCBnb3QgJHtmZ31gKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuciwgMCwgJ25vUmV2ZXJ0IHNob3VsZCBiZSAwIGFmdGVyIGEgZnVsbCByZXZlcnQnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUVQLE1BQU0saUNBQWlDLE1BQU07QUFFNUMsMENBQXdDO0FBRXhD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
