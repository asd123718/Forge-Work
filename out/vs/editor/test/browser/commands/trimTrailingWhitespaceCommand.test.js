import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TrimTrailingWhitespaceCommand, trimTrailingWhitespace } from "../../../common/commands/trimTrailingWhitespaceCommand.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { MetadataConsts, StandardTokenType } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { getEditOperation } from "../testCommand.js";
import { createModelServices, instantiateTextModel, withEditorModel } from "../../common/testTextModel.js";
function createInsertDeleteSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
  return {
    range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
    text
  };
}
function createSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
  return {
    range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
    text,
    forceMoveMarkers: false
  };
}
function assertTrimTrailingWhitespaceCommand(text, expected) {
  return withEditorModel(text, (model) => {
    const op = new TrimTrailingWhitespaceCommand(new Selection(1, 1, 1, 1), [], true);
    const actual = getEditOperation(model, op);
    assert.deepStrictEqual(actual, expected);
  });
}
function assertTrimTrailingWhitespace(text, cursors, expected) {
  return withEditorModel(text, (model) => {
    const actual = trimTrailingWhitespace(model, cursors, true);
    assert.deepStrictEqual(actual, expected);
  });
}
suite("Editor Commands - Trim Trailing Whitespace Command", () => {
  let disposables;
  setup(() => {
    disposables = new DisposableStore();
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("remove trailing whitespace", function() {
    assertTrimTrailingWhitespaceCommand([""], []);
    assertTrimTrailingWhitespaceCommand(["text"], []);
    assertTrimTrailingWhitespaceCommand(["text   "], [createSingleEditOp(null, 1, 5, 1, 8)]);
    assertTrimTrailingWhitespaceCommand(["text	   "], [createSingleEditOp(null, 1, 5, 1, 9)]);
    assertTrimTrailingWhitespaceCommand(["	   "], [createSingleEditOp(null, 1, 1, 1, 5)]);
    assertTrimTrailingWhitespaceCommand(["text	"], [createSingleEditOp(null, 1, 5, 1, 6)]);
    assertTrimTrailingWhitespaceCommand([
      "some text	",
      "some more text",
      "	  ",
      "even more text  ",
      "and some mixed	   	"
    ], [
      createSingleEditOp(null, 1, 10, 1, 11),
      createSingleEditOp(null, 3, 1, 3, 4),
      createSingleEditOp(null, 4, 15, 4, 17),
      createSingleEditOp(null, 5, 15, 5, 20)
    ]);
    assertTrimTrailingWhitespace(["text   "], [new Position(1, 1), new Position(1, 2), new Position(1, 3)], [createInsertDeleteSingleEditOp(null, 1, 5, 1, 8)]);
    assertTrimTrailingWhitespace(["text   "], [new Position(1, 1), new Position(1, 5)], [createInsertDeleteSingleEditOp(null, 1, 5, 1, 8)]);
    assertTrimTrailingWhitespace(["text   "], [new Position(1, 1), new Position(1, 5), new Position(1, 6)], [createInsertDeleteSingleEditOp(null, 1, 6, 1, 8)]);
    assertTrimTrailingWhitespace([
      "some text	",
      "some more text",
      "	  ",
      "even more text  ",
      "and some mixed	   	"
    ], [], [
      createInsertDeleteSingleEditOp(null, 1, 10, 1, 11),
      createInsertDeleteSingleEditOp(null, 3, 1, 3, 4),
      createInsertDeleteSingleEditOp(null, 4, 15, 4, 17),
      createInsertDeleteSingleEditOp(null, 5, 15, 5, 20)
    ]);
    assertTrimTrailingWhitespace([
      "some text	",
      "some more text",
      "	  ",
      "even more text  ",
      "and some mixed	   	"
    ], [new Position(1, 11), new Position(3, 2), new Position(5, 1), new Position(4, 1), new Position(5, 10)], [
      createInsertDeleteSingleEditOp(null, 3, 2, 3, 4),
      createInsertDeleteSingleEditOp(null, 4, 15, 4, 17),
      createInsertDeleteSingleEditOp(null, 5, 15, 5, 20)
    ]);
  });
  test("skips strings and regex if configured", function() {
    const instantiationService = createModelServices(disposables);
    const languageService = instantiationService.get(ILanguageService);
    const languageId = "testLanguageId";
    const languageIdCodec = languageService.languageIdCodec;
    disposables.add(languageService.registerLanguage({ id: languageId }));
    const encodedLanguageId = languageIdCodec.encodeLanguageId(languageId);
    const otherMetadata = (encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET | MetadataConsts.BALANCED_BRACKETS_MASK) >>> 0;
    const stringMetadata = (encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.String << MetadataConsts.TOKEN_TYPE_OFFSET | MetadataConsts.BALANCED_BRACKETS_MASK) >>> 0;
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        switch (line) {
          case "const a = `  ": {
            const tokens = new Uint32Array([
              0,
              otherMetadata,
              10,
              stringMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "  a string  ": {
            const tokens = new Uint32Array([
              0,
              stringMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "`;  ": {
            const tokens = new Uint32Array([
              0,
              stringMetadata,
              1,
              otherMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
        }
        throw new Error(`Unexpected`);
      }
    };
    disposables.add(TokenizationRegistry.register(languageId, tokenizationSupport));
    const model = disposables.add(instantiateTextModel(
      instantiationService,
      [
        "const a = `  ",
        "  a string  ",
        "`;  "
      ].join("\n"),
      languageId
    ));
    model.tokenization.forceTokenization(1);
    model.tokenization.forceTokenization(2);
    model.tokenization.forceTokenization(3);
    const op = new TrimTrailingWhitespaceCommand(new Selection(1, 1, 1, 1), [], false);
    const actual = getEditOperation(model, op);
    assert.deepStrictEqual(actual, [createSingleEditOp(null, 3, 3, 3, 5)]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGNvbW1hbmRzXFx0cmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQsIHRyaW1UcmFpbGluZ1doaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29tbWFuZHMvdHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgTWV0YWRhdGFDb25zdHMsIFN0YW5kYXJkVG9rZW5UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCwgSVRva2VuaXphdGlvblN1cHBvcnQsIFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBOdWxsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL251bGxUb2tlbml6ZS5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vdGVzdENvbW1hbmQuanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9kZWxTZXJ2aWNlcywgaW5zdGFudGlhdGVUZXh0TW9kZWwsIHdpdGhFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcblxuLyoqXG4gKiBDcmVhdGUgc2luZ2xlIGVkaXQgb3BlcmF0aW9uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUluc2VydERlbGV0ZVNpbmdsZUVkaXRPcCh0ZXh0OiBzdHJpbmcgfCBudWxsLCBwb3NpdGlvbkxpbmVOdW1iZXI6IG51bWJlciwgcG9zaXRpb25Db2x1bW46IG51bWJlciwgc2VsZWN0aW9uTGluZU51bWJlcjogbnVtYmVyID0gcG9zaXRpb25MaW5lTnVtYmVyLCBzZWxlY3Rpb25Db2x1bW46IG51bWJlciA9IHBvc2l0aW9uQ29sdW1uKTogSVNpbmdsZUVkaXRPcGVyYXRpb24ge1xuXHRyZXR1cm4ge1xuXHRcdHJhbmdlOiBuZXcgUmFuZ2Uoc2VsZWN0aW9uTGluZU51bWJlciwgc2VsZWN0aW9uQ29sdW1uLCBwb3NpdGlvbkxpbmVOdW1iZXIsIHBvc2l0aW9uQ29sdW1uKSxcblx0XHR0ZXh0OiB0ZXh0XG5cdH07XG59XG5cbi8qKlxuICogQ3JlYXRlIHNpbmdsZSBlZGl0IG9wZXJhdGlvblxuICovXG5mdW5jdGlvbiBjcmVhdGVTaW5nbGVFZGl0T3AodGV4dDogc3RyaW5nIHwgbnVsbCwgcG9zaXRpb25MaW5lTnVtYmVyOiBudW1iZXIsIHBvc2l0aW9uQ29sdW1uOiBudW1iZXIsIHNlbGVjdGlvbkxpbmVOdW1iZXI6IG51bWJlciA9IHBvc2l0aW9uTGluZU51bWJlciwgc2VsZWN0aW9uQ29sdW1uOiBudW1iZXIgPSBwb3NpdGlvbkNvbHVtbik6IElTaW5nbGVFZGl0T3BlcmF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRyYW5nZTogbmV3IFJhbmdlKHNlbGVjdGlvbkxpbmVOdW1iZXIsIHNlbGVjdGlvbkNvbHVtbiwgcG9zaXRpb25MaW5lTnVtYmVyLCBwb3NpdGlvbkNvbHVtbiksXG5cdFx0dGV4dDogdGV4dCxcblx0XHRmb3JjZU1vdmVNYXJrZXJzOiBmYWxzZVxuXHR9O1xufVxuXG5mdW5jdGlvbiBhc3NlcnRUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZCh0ZXh0OiBzdHJpbmdbXSwgZXhwZWN0ZWQ6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10pOiB2b2lkIHtcblx0cmV0dXJuIHdpdGhFZGl0b3JNb2RlbCh0ZXh0LCAobW9kZWwpID0+IHtcblx0XHRjb25zdCBvcCA9IG5ldyBUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZChuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBbXSwgdHJ1ZSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gZ2V0RWRpdE9wZXJhdGlvbihtb2RlbCwgb3ApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRUcmltVHJhaWxpbmdXaGl0ZXNwYWNlKHRleHQ6IHN0cmluZ1tdLCBjdXJzb3JzOiBQb3NpdGlvbltdLCBleHBlY3RlZDogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSk6IHZvaWQge1xuXHRyZXR1cm4gd2l0aEVkaXRvck1vZGVsKHRleHQsIChtb2RlbCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRyaW1UcmFpbGluZ1doaXRlc3BhY2UobW9kZWwsIGN1cnNvcnMsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xufVxuXG5zdWl0ZSgnRWRpdG9yIENvbW1hbmRzIC0gVHJpbSBUcmFpbGluZyBXaGl0ZXNwYWNlIENvbW1hbmQnLCAoKSA9PiB7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZW1vdmUgdHJhaWxpbmcgd2hpdGVzcGFjZScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZChbJyddLCBbXSk7XG5cdFx0YXNzZXJ0VHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQoWyd0ZXh0J10sIFtdKTtcblx0XHRhc3NlcnRUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZChbJ3RleHQgICAnXSwgW2NyZWF0ZVNpbmdsZUVkaXRPcChudWxsLCAxLCA1LCAxLCA4KV0pO1xuXHRcdGFzc2VydFRyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kKFsndGV4dFxcdCAgICddLCBbY3JlYXRlU2luZ2xlRWRpdE9wKG51bGwsIDEsIDUsIDEsIDkpXSk7XG5cdFx0YXNzZXJ0VHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQoWydcXHQgICAnXSwgW2NyZWF0ZVNpbmdsZUVkaXRPcChudWxsLCAxLCAxLCAxLCA1KV0pO1xuXHRcdGFzc2VydFRyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kKFsndGV4dFxcdCddLCBbY3JlYXRlU2luZ2xlRWRpdE9wKG51bGwsIDEsIDUsIDEsIDYpXSk7XG5cdFx0YXNzZXJ0VHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQoW1xuXHRcdFx0J3NvbWUgdGV4dFxcdCcsXG5cdFx0XHQnc29tZSBtb3JlIHRleHQnLFxuXHRcdFx0J1xcdCAgJyxcblx0XHRcdCdldmVuIG1vcmUgdGV4dCAgJyxcblx0XHRcdCdhbmQgc29tZSBtaXhlZFxcdCAgIFxcdCdcblx0XHRdLCBbXG5cdFx0XHRjcmVhdGVTaW5nbGVFZGl0T3AobnVsbCwgMSwgMTAsIDEsIDExKSxcblx0XHRcdGNyZWF0ZVNpbmdsZUVkaXRPcChudWxsLCAzLCAxLCAzLCA0KSxcblx0XHRcdGNyZWF0ZVNpbmdsZUVkaXRPcChudWxsLCA0LCAxNSwgNCwgMTcpLFxuXHRcdFx0Y3JlYXRlU2luZ2xlRWRpdE9wKG51bGwsIDUsIDE1LCA1LCAyMClcblx0XHRdKTtcblxuXG5cdFx0YXNzZXJ0VHJpbVRyYWlsaW5nV2hpdGVzcGFjZShbJ3RleHQgICAnXSwgW25ldyBQb3NpdGlvbigxLCAxKSwgbmV3IFBvc2l0aW9uKDEsIDIpLCBuZXcgUG9zaXRpb24oMSwgMyldLCBbY3JlYXRlSW5zZXJ0RGVsZXRlU2luZ2xlRWRpdE9wKG51bGwsIDEsIDUsIDEsIDgpXSk7XG5cdFx0YXNzZXJ0VHJpbVRyYWlsaW5nV2hpdGVzcGFjZShbJ3RleHQgICAnXSwgW25ldyBQb3NpdGlvbigxLCAxKSwgbmV3IFBvc2l0aW9uKDEsIDUpXSwgW2NyZWF0ZUluc2VydERlbGV0ZVNpbmdsZUVkaXRPcChudWxsLCAxLCA1LCAxLCA4KV0pO1xuXHRcdGFzc2VydFRyaW1UcmFpbGluZ1doaXRlc3BhY2UoWyd0ZXh0ICAgJ10sIFtuZXcgUG9zaXRpb24oMSwgMSksIG5ldyBQb3NpdGlvbigxLCA1KSwgbmV3IFBvc2l0aW9uKDEsIDYpXSwgW2NyZWF0ZUluc2VydERlbGV0ZVNpbmdsZUVkaXRPcChudWxsLCAxLCA2LCAxLCA4KV0pO1xuXHRcdGFzc2VydFRyaW1UcmFpbGluZ1doaXRlc3BhY2UoW1xuXHRcdFx0J3NvbWUgdGV4dFxcdCcsXG5cdFx0XHQnc29tZSBtb3JlIHRleHQnLFxuXHRcdFx0J1xcdCAgJyxcblx0XHRcdCdldmVuIG1vcmUgdGV4dCAgJyxcblx0XHRcdCdhbmQgc29tZSBtaXhlZFxcdCAgIFxcdCdcblx0XHRdLCBbXSwgW1xuXHRcdFx0Y3JlYXRlSW5zZXJ0RGVsZXRlU2luZ2xlRWRpdE9wKG51bGwsIDEsIDEwLCAxLCAxMSksXG5cdFx0XHRjcmVhdGVJbnNlcnREZWxldGVTaW5nbGVFZGl0T3AobnVsbCwgMywgMSwgMywgNCksXG5cdFx0XHRjcmVhdGVJbnNlcnREZWxldGVTaW5nbGVFZGl0T3AobnVsbCwgNCwgMTUsIDQsIDE3KSxcblx0XHRcdGNyZWF0ZUluc2VydERlbGV0ZVNpbmdsZUVkaXRPcChudWxsLCA1LCAxNSwgNSwgMjApXG5cdFx0XSk7XG5cdFx0YXNzZXJ0VHJpbVRyYWlsaW5nV2hpdGVzcGFjZShbXG5cdFx0XHQnc29tZSB0ZXh0XFx0Jyxcblx0XHRcdCdzb21lIG1vcmUgdGV4dCcsXG5cdFx0XHQnXFx0ICAnLFxuXHRcdFx0J2V2ZW4gbW9yZSB0ZXh0ICAnLFxuXHRcdFx0J2FuZCBzb21lIG1peGVkXFx0ICAgXFx0J1xuXHRcdF0sIFtuZXcgUG9zaXRpb24oMSwgMTEpLCBuZXcgUG9zaXRpb24oMywgMiksIG5ldyBQb3NpdGlvbig1LCAxKSwgbmV3IFBvc2l0aW9uKDQsIDEpLCBuZXcgUG9zaXRpb24oNSwgMTApXSwgW1xuXHRcdFx0Y3JlYXRlSW5zZXJ0RGVsZXRlU2luZ2xlRWRpdE9wKG51bGwsIDMsIDIsIDMsIDQpLFxuXHRcdFx0Y3JlYXRlSW5zZXJ0RGVsZXRlU2luZ2xlRWRpdE9wKG51bGwsIDQsIDE1LCA0LCAxNyksXG5cdFx0XHRjcmVhdGVJbnNlcnREZWxldGVTaW5nbGVFZGl0T3AobnVsbCwgNSwgMTUsIDUsIDIwKVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBzdHJpbmdzIGFuZCByZWdleCBpZiBjb25maWd1cmVkJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAndGVzdExhbmd1YWdlSWQnO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWRDb2RlYyA9IGxhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWM7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGNvbnN0IGVuY29kZWRMYW5ndWFnZUlkID0gbGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cblx0XHRjb25zdCBvdGhlck1ldGFkYXRhID0gKFxuXHRcdFx0KGVuY29kZWRMYW5ndWFnZUlkIDw8IE1ldGFkYXRhQ29uc3RzLkxBTkdVQUdFSURfT0ZGU0VUKVxuXHRcdFx0fCAoU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgPDwgTWV0YWRhdGFDb25zdHMuVE9LRU5fVFlQRV9PRkZTRVQpXG5cdFx0XHR8IChNZXRhZGF0YUNvbnN0cy5CQUxBTkNFRF9CUkFDS0VUU19NQVNLKVxuXHRcdCkgPj4+IDA7XG5cdFx0Y29uc3Qgc3RyaW5nTWV0YWRhdGEgPSAoXG5cdFx0XHQoZW5jb2RlZExhbmd1YWdlSWQgPDwgTWV0YWRhdGFDb25zdHMuTEFOR1VBR0VJRF9PRkZTRVQpXG5cdFx0XHR8IChTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgPDwgTWV0YWRhdGFDb25zdHMuVE9LRU5fVFlQRV9PRkZTRVQpXG5cdFx0XHR8IChNZXRhZGF0YUNvbnN0cy5CQUxBTkNFRF9CUkFDS0VUU19NQVNLKVxuXHRcdCkgPj4+IDA7XG5cblx0XHRjb25zdCB0b2tlbml6YXRpb25TdXBwb3J0OiBJVG9rZW5pemF0aW9uU3VwcG9ydCA9IHtcblx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gTnVsbFN0YXRlLFxuXHRcdFx0dG9rZW5pemU6IHVuZGVmaW5lZCEsXG5cdFx0XHR0b2tlbml6ZUVuY29kZWQ6IChsaW5lLCBoYXNFT0wsIHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN3aXRjaCAobGluZSkge1xuXHRcdFx0XHRcdGNhc2UgJ2NvbnN0IGEgPSBgICAnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b2tlbnMgPSBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHRcdFx0XHQwLCBvdGhlck1ldGFkYXRhLFxuXHRcdFx0XHRcdFx0XHQxMCwgc3RyaW5nTWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCh0b2tlbnMsIFtdLCBzdGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJyAgYSBzdHJpbmcgICc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdFx0XHRcdDAsIHN0cmluZ01ldGFkYXRhLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQodG9rZW5zLCBbXSwgc3RhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdgOyAgJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0XHRcdFx0MCwgc3RyaW5nTWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRcdDEsIG90aGVyTWV0YWRhdGFcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkYCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3RlcihsYW5ndWFnZUlkLCB0b2tlbml6YXRpb25TdXBwb3J0KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0W1xuXHRcdFx0XHQnY29uc3QgYSA9IGAgICcsXG5cdFx0XHRcdCcgIGEgc3RyaW5nICAnLFxuXHRcdFx0XHQnYDsgICcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0bGFuZ3VhZ2VJZFxuXHRcdCkpO1xuXG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKDEpO1xuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbigyKTtcblx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24oMyk7XG5cblx0XHRjb25zdCBvcCA9IG5ldyBUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZChuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBbXSwgZmFsc2UpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGdldEVkaXRPcGVyYXRpb24obW9kZWwsIG9wKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW2NyZWF0ZVNpbmdsZUVkaXRPcChudWxsLCAzLCAzLCAzLCA1KV0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsK0JBQStCLDhCQUE4QjtBQUV0RSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsMkJBQWlELDRCQUE0QjtBQUN0RixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQixzQkFBc0IsdUJBQXVCO0FBSzNFLFNBQVMsK0JBQStCLE1BQXFCLG9CQUE0QixnQkFBd0Isc0JBQThCLG9CQUFvQixrQkFBMEIsZ0JBQXNDO0FBQ2xPLFNBQU87QUFBQSxJQUNOLE9BQU8sSUFBSSxNQUFNLHFCQUFxQixpQkFBaUIsb0JBQW9CLGNBQWM7QUFBQSxJQUN6RjtBQUFBLEVBQ0Q7QUFDRDtBQUtBLFNBQVMsbUJBQW1CLE1BQXFCLG9CQUE0QixnQkFBd0Isc0JBQThCLG9CQUFvQixrQkFBMEIsZ0JBQXNDO0FBQ3ROLFNBQU87QUFBQSxJQUNOLE9BQU8sSUFBSSxNQUFNLHFCQUFxQixpQkFBaUIsb0JBQW9CLGNBQWM7QUFBQSxJQUN6RjtBQUFBLElBQ0Esa0JBQWtCO0FBQUEsRUFDbkI7QUFDRDtBQUVBLFNBQVMsb0NBQW9DLE1BQWdCLFVBQXdDO0FBQ3BHLFNBQU8sZ0JBQWdCLE1BQU0sQ0FBQyxVQUFVO0FBQ3ZDLFVBQU0sS0FBSyxJQUFJLDhCQUE4QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJO0FBQ2hGLFVBQU0sU0FBUyxp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
