import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { StringText } from "../../../../../editor/common/core/text/abstractText.js";
import { ArcTracker } from "../../common/arcTracker.js";
import { FileAccess } from "../../../../../base/common/network.js";
import { readFileSync } from "fs";
import { join, resolve } from "../../../../../base/common/path.js";
import { StringEdit, StringReplacement } from "../../../../../editor/common/core/edits/stringEdit.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { ensureDependenciesAreSet } from "../../../../../editor/common/core/text/positionToOffset.js";
import { EditArcTracker } from "../../../../../base/common/editArcTracker.js";
suite("ArcTracker", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  ensureDependenciesAreSet();
  const fixturesOutDir = FileAccess.asFileUri("vs/workbench/contrib/editTelemetry/test/node/data").fsPath;
  const fixturesSrcDir = resolve(fixturesOutDir).replaceAll("\\", "/").replace("/out/vs/workbench/", "/src/vs/workbench/");
  function getData(name) {
    const path = join(fixturesSrcDir, name + ".edits.w.json");
    const src = readFileSync(path, "utf8");
    return JSON.parse(src);
  }
  test("issue-264048", () => {
    const stats = runTestWithData(getData("issue-264048"));
    assert.deepStrictEqual(stats, [
      {
        arc: 8,
        deletedLineCounts: 1,
        insertedLineCounts: 1
      },
      {
        arc: 8,
        deletedLineCounts: 0,
        insertedLineCounts: 1
      },
      {
        arc: 8,
        deletedLineCounts: 0,
        insertedLineCounts: 1
      }
    ]);
  });
  test("line-insert", () => {
    const stats = runTestWithData(getData("line-insert"));
    assert.deepStrictEqual(stats, [
      {
        arc: 7,
        deletedLineCounts: 0,
        insertedLineCounts: 1
      },
      {
        arc: 5,
        deletedLineCounts: 0,
        insertedLineCounts: 1
      }
    ]);
  });
  test("line-modification", () => {
    const stats = runTestWithData(getData("line-modification"));
    assert.deepStrictEqual(stats, [
      {
        arc: 6,
        deletedLineCounts: 1,
        insertedLineCounts: 1
      },
      {
        arc: 6,
        deletedLineCounts: 1,
        insertedLineCounts: 1
      },
      {
        arc: 0,
        deletedLineCounts: 0,
        insertedLineCounts: 0
      }
    ]);
  });
  test("multiline-insert", () => {
    const stats = runTestWithData(getData("multiline-insert"));
    assert.deepStrictEqual(stats, [
      {
        arc: 24,
        deletedLineCounts: 0,
        insertedLineCounts: 3
      },
      {
        arc: 23,
        deletedLineCounts: 0,
        insertedLineCounts: 2
      }
    ]);
  });
});
function createStringEditFromJson(editData) {
  const replacements = editData.replacements.map(
    (replacement) => new StringReplacement(
      OffsetRange.ofStartAndLength(replacement.start, replacement.endEx - replacement.start),
      replacement.text
    )
  );
  return new StringEdit(replacements);
}
function createArcTextEditFromJson(editData) {
  return {
    replacements: editData.replacements.map((replacement) => ({
      start: replacement.start,
      endExclusive: replacement.endEx,
      text: replacement.text
    }))
  };
}
function runTestWithData(data) {
  const edits = data.edits.map((editData) => createStringEditFromJson(editData));
  const coreEdits = data.edits.map((editData) => createArcTextEditFromJson(editData));
  const t = new ArcTracker(
    new StringText(data.initialText),
    edits[0]
  );
  const coreTracker = new EditArcTracker(data.initialText, coreEdits[0]);
  const stats = [];
  stats.push(t.getValues());
  assert.deepStrictEqual(coreTracker.getValues(), t.getValues());
  let lastLineNumbers = t.getLineCountInfo().insertedLineCounts;
  let lastArc = t.getAcceptedRestrainedCharactersCount();
  for (let i = 1; i < edits.length; i++) {
    t.handleEdits(edits[i]);
    coreTracker.handleEdits(coreEdits[i]);
    stats.push(t.getValues());
    assert.deepStrictEqual(coreTracker.getValues(), t.getValues());
    const newLineNumbers = t.getLineCountInfo().insertedLineCounts;
    assert.ok(newLineNumbers <= lastLineNumbers, `Line numbers must not increase. Last: ${lastLineNumbers}, new: ${newLineNumbers}`);
    lastLineNumbers = newLineNumbers;
    const newArc = t.getAcceptedRestrainedCharactersCount();
    assert.ok(newArc <= lastArc, `ARC must not increase. Last: ${lastArc}, new: ${newArc}`);
    lastArc = newArc;
  }
  return stats;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXHRlc3RcXG5vZGVcXGFyY1RyYWNrZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgU3RyaW5nVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS90ZXh0L2Fic3RyYWN0VGV4dC5qcyc7XG5pbXBvcnQgeyBBcmNUcmFja2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FyY1RyYWNrZXIuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgcmVhZEZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgam9pbiwgcmVzb2x2ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgU3RyaW5nRWRpdCwgU3RyaW5nUmVwbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdHMvc3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlRGVwZW5kZW5jaWVzQXJlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3RleHQvcG9zaXRpb25Ub09mZnNldC5qcyc7XG5pbXBvcnQgeyBFZGl0QXJjVHJhY2tlciwgSUFyY1RleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZWRpdEFyY1RyYWNrZXIuanMnO1xuXG5zdWl0ZSgnQXJjVHJhY2tlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGVuc3VyZURlcGVuZGVuY2llc0FyZVNldCgpO1xuXG5cdGNvbnN0IGZpeHR1cmVzT3V0RGlyID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvdGVzdC9ub2RlL2RhdGEnKS5mc1BhdGg7XG5cdGNvbnN0IGZpeHR1cmVzU3JjRGlyID0gcmVzb2x2ZShmaXh0dXJlc091dERpcikucmVwbGFjZUFsbCgnXFxcXCcsICcvJykucmVwbGFjZSgnL291dC92cy93b3JrYmVuY2gvJywgJy9zcmMvdnMvd29ya2JlbmNoLycpO1xuXG5cdGZ1bmN0aW9uIGdldERhdGEobmFtZTogc3RyaW5nKTogSUVkaXRzIHtcblx0XHRjb25zdCBwYXRoID0gam9pbihmaXh0dXJlc1NyY0RpciwgbmFtZSArICcuZWRpdHMudy5qc29uJyk7XG5cdFx0Y29uc3Qgc3JjID0gcmVhZEZpbGVTeW5jKHBhdGgsICd1dGY4Jyk7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2Uoc3JjKTtcblx0fVxuXG5cdHRlc3QoJ2lzc3VlLTI2NDA0OCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0cyA9IHJ1blRlc3RXaXRoRGF0YShnZXREYXRhKCdpc3N1ZS0yNjQwNDgnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0cywgKFtcblx0XHRcdHtcblx0XHRcdFx0YXJjOiA4LFxuXHRcdFx0XHRkZWxldGVkTGluZUNvdW50czogMSxcblx0XHRcdFx0aW5zZXJ0ZWRMaW5lQ291bnRzOiAxXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRhcmM6IDgsXG5cdFx0XHRcdGRlbGV0ZWRMaW5lQ291bnRzOiAwLFxuXHRcdFx0XHRpbnNlcnRlZExpbmVDb3VudHM6IDFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGFyYzogOCxcblx0XHRcdFx0ZGVsZXRlZExpbmVDb3VudHM6IDAsXG5cdFx0XHRcdGluc2VydGVkTGluZUNvdW50czogMVxuXHRcdFx0fVxuXHRcdF0pKTtcblx0fSk7XG5cblx0dGVzdCgnbGluZS1pbnNlcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdHMgPSBydW5UZXN0V2l0aERhdGEoZ2V0RGF0YSgnbGluZS1pbnNlcnQnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0cywgKFtcblx0XHRcdHtcblx0XHRcdFx0YXJjOiA3LFxuXHRcdFx0XHRkZWxldGVkTGluZUNvdW50czogMCxcblx0XHRcdFx0aW5zZXJ0ZWRMaW5lQ291bnRzOiAxXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRhcmM6IDUsXG5cdFx0XHRcdGRlbGV0ZWRMaW5lQ291bnRzOiAwLFxuXHRcdFx0XHRpbnNlcnRlZExpbmVDb3VudHM6IDFcblx0XHRcdH1cblx0XHRdKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpbmUtbW9kaWZpY2F0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRzID0gcnVuVGVzdFdpdGhEYXRhKGdldERhdGEoJ2xpbmUtbW9kaWZpY2F0aW9uJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHMsIChbXG5cdFx0XHR7XG5cdFx0XHRcdGFyYzogNixcblx0XHRcdFx0ZGVsZXRlZExpbmVDb3VudHM6IDEsXG5cdFx0XHRcdGluc2VydGVkTGluZUNvdW50czogMVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0YXJjOiA2LFxuXHRcdFx0XHRkZWxldGVkTGluZUNvdW50czogMSxcblx0XHRcdFx0aW5zZXJ0ZWRMaW5lQ291bnRzOiAxXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRhcmM6IDAsXG5cdFx0XHRcdGRlbGV0ZWRMaW5lQ291bnRzOiAwLFxuXHRcdFx0XHRpbnNlcnRlZExpbmVDb3VudHM6IDBcblx0XHRcdH1cblx0XHRdKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpbGluZS1pbnNlcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdHMgPSBydW5UZXN0V2l0aERhdGEoZ2V0RGF0YSgnbXVsdGlsaW5lLWluc2VydCcpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRzLCAoW1xuXHRcdFx0e1xuXHRcdFx0XHRhcmM6IDI0LFxuXHRcdFx0XHRkZWxldGVkTGluZUNvdW50czogMCxcblx0XHRcdFx0aW5zZXJ0ZWRMaW5lQ291bnRzOiAzXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRhcmM6IDIzLFxuXHRcdFx0XHRkZWxldGVkTGluZUNvdW50czogMCxcblx0XHRcdFx0aW5zZXJ0ZWRMaW5lQ291bnRzOiAyXG5cdFx0XHR9XG5cdFx0XSkpO1xuXHR9KTtcbn0pO1xuXG5pbnRlcmZhY2UgSUVkaXRzIHtcblx0aW5pdGlhbFRleHQ6IHN0cmluZztcblx0ZWRpdHM6IEFycmF5PHtcblx0XHRyZXBsYWNlbWVudHM6IEFycmF5PHtcblx0XHRcdHN0YXJ0OiBudW1iZXI7XG5cdFx0XHRlbmRFeDogbnVtYmVyO1xuXHRcdFx0dGV4dDogc3RyaW5nO1xuXHRcdH0+O1xuXHR9Pjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU3RyaW5nRWRpdEZyb21Kc29uKGVkaXREYXRhOiBJRWRpdHNbJ2VkaXRzJ11bMF0pOiBTdHJpbmdFZGl0IHtcblx0Y29uc3QgcmVwbGFjZW1lbnRzID0gZWRpdERhdGEucmVwbGFjZW1lbnRzLm1hcChyZXBsYWNlbWVudCA9PlxuXHRcdG5ldyBTdHJpbmdSZXBsYWNlbWVudChcblx0XHRcdE9mZnNldFJhbmdlLm9mU3RhcnRBbmRMZW5ndGgocmVwbGFjZW1lbnQuc3RhcnQsIHJlcGxhY2VtZW50LmVuZEV4IC0gcmVwbGFjZW1lbnQuc3RhcnQpLFxuXHRcdFx0cmVwbGFjZW1lbnQudGV4dFxuXHRcdClcblx0KTtcblx0cmV0dXJuIG5ldyBTdHJpbmdFZGl0KHJlcGxhY2VtZW50cyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFyY1RleHRFZGl0RnJvbUpzb24oZWRpdERhdGE6IElFZGl0c1snZWRpdHMnXVswXSk6IElBcmNUZXh0RWRpdCB7XG5cdHJldHVybiB7XG5cdFx0cmVwbGFjZW1lbnRzOiBlZGl0RGF0YS5yZXBsYWNlbWVudHMubWFwKHJlcGxhY2VtZW50ID0+ICh7XG5cdFx0XHRzdGFydDogcmVwbGFjZW1lbnQuc3RhcnQsXG5cdFx0XHRlbmRFeGNsdXNpdmU6IHJlcGxhY2VtZW50LmVuZEV4LFxuXHRcdFx0dGV4dDogcmVwbGFjZW1lbnQudGV4dCxcblx0XHR9KSlcblx0fTtcbn1cblxuZnVuY3Rpb24gcnVuVGVzdFdpdGhEYXRhKGRhdGE6IElFZGl0cyk6IHVua25vd24ge1xuXHRjb25zdCBlZGl0cyA9IGRhdGEuZWRpdHMubWFwKGVkaXREYXRhID0+IGNyZWF0ZVN0cmluZ0VkaXRGcm9tSnNvbihlZGl0RGF0YSkpO1xuXHRjb25zdCBjb3JlRWRpdHMgPSBkYXRhLmVkaXRzLm1hcChlZGl0RGF0YSA9PiBjcmVhdGVBcmNUZXh0RWRpdEZyb21Kc29uKGVkaXREYXRhKSk7XG5cblx0Y29uc3QgdCA9IG5ldyBBcmNUcmFja2VyKFxuXHRcdG5ldyBTdHJpbmdUZXh0KGRhdGEuaW5pdGlhbFRleHQpLFxuXHRcdGVkaXRzWzBdXG5cdCk7XG5cdGNvbnN0IGNvcmVUcmFja2VyID0gbmV3IEVkaXRBcmNUcmFja2VyKGRhdGEuaW5pdGlhbFRleHQsIGNvcmVFZGl0c1swXSk7XG5cblx0Y29uc3Qgc3RhdHM6IHVua25vd25bXSA9IFtdO1xuXHRzdGF0cy5wdXNoKHQuZ2V0VmFsdWVzKCkpO1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvcmVUcmFja2VyLmdldFZhbHVlcygpLCB0LmdldFZhbHVlcygpKTtcblx0bGV0IGxhc3RMaW5lTnVtYmVycyA9IHQuZ2V0TGluZUNvdW50SW5mbygpLmluc2VydGVkTGluZUNvdW50cztcblx0bGV0IGxhc3RBcmMgPSB0LmdldEFjY2VwdGVkUmVzdHJhaW5lZENoYXJhY3RlcnNDb3VudCgpO1xuXG5cdGZvciAobGV0IGkgPSAxOyBpIDwgZWRpdHMubGVuZ3RoOyBpKyspIHtcblx0XHR0LmhhbmRsZUVkaXRzKGVkaXRzW2ldKTtcblx0XHRjb3JlVHJhY2tlci5oYW5kbGVFZGl0cyhjb3JlRWRpdHNbaV0pO1xuXHRcdHN0YXRzLnB1c2godC5nZXRWYWx1ZXMoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb3JlVHJhY2tlci5nZXRWYWx1ZXMoKSwgdC5nZXRWYWx1ZXMoKSk7XG5cblx0XHRjb25zdCBuZXdMaW5lTnVtYmVycyA9IHQuZ2V0TGluZUNvdW50SW5mbygpLmluc2VydGVkTGluZUNvdW50cztcblx0XHRhc3NlcnQub2sobmV3TGluZU51bWJlcnMgPD0gbGFzdExpbmVOdW1iZXJzLCBgTGluZSBudW1iZXJzIG11c3Qgbm90IGluY3JlYXNlLiBMYXN0OiAke2xhc3RMaW5lTnVtYmVyc30sIG5ldzogJHtuZXdMaW5lTnVtYmVyc31gKTtcblx0XHRsYXN0TGluZU51bWJlcnMgPSBuZXdMaW5lTnVtYmVycztcblxuXHRcdGNvbnN0IG5ld0FyYyA9IHQuZ2V0QWNjZXB0ZWRSZXN0cmFpbmVkQ2hhcmFjdGVyc0NvdW50KCk7XG5cdFx0YXNzZXJ0Lm9rKG5ld0FyYyA8PSBsYXN0QXJjLCBgQVJDIG11c3Qgbm90IGluY3JlYXNlLiBMYXN0OiAke2xhc3RBcmN9LCBuZXc6ICR7bmV3QXJjfWApO1xuXHRcdGxhc3RBcmMgPSBuZXdBcmM7XG5cdH1cblx0cmV0dXJuIHN0YXRzO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsTUFBTSxlQUFlO0FBQzlCLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBb0M7QUFFN0MsTUFBTSxjQUFjLE1BQU07QUFDekIsMENBQXdDO0FBQ3hDLDJCQUF5QjtBQUV6QixRQUFNLGlCQUFpQixXQUFXLFVBQVUsbURBQW1ELEVBQUU7QUFDakcsUUFBTSxpQkFBaUIsUUFBUSxjQUFjLEVBQUUsV0FBVyxNQUFNLEdBQUcsRUFBRSxRQUFRLHNCQUFzQixvQkFBb0I7QUFFdkgsV0FBUyxRQUFRLE1BQXNCO0FBQ3RDLFVBQU0sT0FBTyxLQUFLLGdCQUFnQixPQUFPLGVBQWU7QUFDeEQsVUFBTSxNQUFNLGFBQWEsTUFBTSxNQUFNO0FBQ3JDLFdBQU8sS0FBSyxNQUFNLEdBQUc7QUFBQSxFQUN0QjtBQUVBLE9BQUssZ0JBQWdCLE1BQU07QUFDMUIsVUFBTSxRQUFRLGdCQUFnQixRQUFRLGNBQWMsQ0FBQztBQUNyRCxXQUFPLGdCQUFnQixPQUFRO0FBQUEsTUFDOUI7QUFBQSxRQUNDLEtBQUs7QUFBQSxRQUNMLG1CQUFtQjtBQUFBLFFBQ25CLG9CQUFvQjtBQUFBLE1BQ3JCO0FBQUEsTUFDQTtBQUFBLFFB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
