import assert from "assert";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue, subtransaction } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { StringReplacement } from "../../../../../editor/common/core/edits/stringEdit.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { StringText } from "../../../../../editor/common/core/text/abstractText.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { AnnotatedDocuments, UriVisibilityProvider } from "../../browser/helpers/annotatedDocuments.js";
import { ObservableWorkspace, StringEditWithReason } from "../../browser/helpers/observableWorkspace.js";
import { EditSourceTrackingImpl } from "../../browser/telemetry/editSourceTrackingImpl.js";
import { ScmAdapter } from "../../browser/telemetry/scmAdapter.js";
import { EditSources } from "../../../../../editor/common/textModelEditSource.js";
import { DiffService } from "../../browser/helpers/documentWithAnnotatedEdits.js";
import { computeStringDiff } from "../../../../../editor/common/services/editorWebWorker.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../../base/common/async.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IAiEditTelemetryService } from "../../browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { Random } from "../../../../../editor/test/common/core/random.js";
import { AiEditTelemetryServiceImpl } from "../../browser/telemetry/aiEditTelemetry/aiEditTelemetryServiceImpl.js";
import { IRandomService, RandomService } from "../../browser/randomService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { UserAttentionService, UserAttentionServiceEnv } from "../../../../services/userAttention/browser/userAttentionBrowser.js";
import { IUserAttentionService } from "../../../../services/userAttention/common/userAttentionService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
suite("Edit Telemetry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("1", async () => runWithFakedTimers({}, async () => {
    const disposables = new DisposableStore();
    const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
      [IAiEditTelemetryService, new SyncDescriptor(AiEditTelemetryServiceImpl)],
      [IUserAttentionService, new SyncDescriptor(UserAttentionService)]
    ), false, void 0, true));
    const sentTelemetry = [];
    const userActive = observableValue("userActive", true);
    instantiationService.stubInstance(UserAttentionServiceEnv, {
      isUserActive: userActive,
      isVsCodeFocused: constObservable(true),
      dispose: () => {
      }
    });
    instantiationService.stub(ITelemetryService, {
      publicLog2(eventName, data) {
        sentTelemetry.push(`${formatTime(Date.now())} ${eventName}: ${JSON.stringify(data)}`);
      }
    });
    instantiationService.stubInstance(DiffService, { computeDiff: async (original, modified) => computeStringDiff(original, modified, { maxComputationTimeMs: 500 }, "advanced") });
    instantiationService.stubInstance(ScmAdapter, { getRepo: (uri, reader) => void 0 });
    instantiationService.stubInstance(UriVisibilityProvider, { isVisible: (uri, reader) => true });
    instantiationService.stub(IRandomService, new DeterministicRandomService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITextFileService, { isDirty: () => false });
    const w = new MutableObservableWorkspace();
    const docs = disposables.add(new AnnotatedDocuments(w, instantiationService));
    disposables.add(new EditSourceTrackingImpl(constObservable(true), docs, void 0, instantiationService));
    const d1 = disposables.add(w.createDocument({
      uri: URI.parse("file:///a"),
      initialValue: `
function fib(n) {
	if (n <= 1) return n;
	return fib(n - 1) + fib(n - 2);
}
`
    }, void 0));
    await timeout(10);
    const chatEdit = EditSources.chatApplyEdits({
      languageId: "plaintext",
      modelId: void 0,
      codeBlockSuggestionId: void 0,
      extensionId: void 0,
      mode: void 0,
      requestId: void 0,
      sessionId: void 0
    });
    d1.applyEdit(StringEditWithReason.replace(d1.findRange("\u226A\u226Bfunction fib(n) {"), "// Computes the nth fibonacci number\n", chatEdit));
    await timeout(5e3);
    d1.applyEdit(new StringEditWithReason([
      StringReplacement.replace(d1.findRange("\u226A//\u226B Computes"), "/*"),
      StringReplacement.replace(d1.findRange("fibonacci number\u226A\u226B"), " */")
    ], EditSources.cursor({ kind: "type" })));
    await timeout(5e3);
    d1.applyEdit(StringEditWithReason.replace(d1.findRange("Computes the nth fibonacci number"), "Berechnet die nte Fibonacci Zahl", chatEdit));
    await timeout(3 * 60 * 1e3);
    userActive.set(false, void 0);
    await timeout(3 * 60 * 1e3);
    userActive.set(true, void 0);
    await timeout(18 * 60 * 1e3);
    assert.deepStrictEqual(sentTelemetry, [
      '00:01:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"8c97b7d8-9adb-4bd8-ac9f-a562704ce40e","didBranchChange":0,"timeDelayMs":0,"originalCharCount":37,"originalLineCount":1,"originalDeletedLineCount":0,"arc":37,"currentLineCount":1,"currentDeletedLineCount":0}',
      '00:01:010 editTelemetry.codeSuggested: {"eventId":"evt-055ed5f5-c723-4ede-ba79-cccd7685c7ad","suggestionId":"sgt-f645627a-cacf-477a-9164-ecd6125616a5","presentation":"highlightedEdit","feature":"sideBarChat","languageId":"plaintext","editCharsInserted":37,"editCharsDeleted":0,"editLinesInserted":1,"editLinesDeleted":0}',
      '00:11:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"1eb8a394-2489-41c2-851b-6a79432fc6bc","didBranchChange":0,"timeDelayMs":0,"originalCharCount":19,"originalLineCount":1,"originalDeletedLineCount":1,"arc":19,"currentLineCount":1,"currentDeletedLineCount":1}',
      '00:11:010 editTelemetry.codeSuggested: {"eventId":"evt-5c9c6fe7-b219-4ff8-aaa7-ab2b355b21c0","suggestionId":"sgt-74379122-0452-4e26-9c38-9d62f1e7ae73","presentation":"highlightedEdit","feature":"sideBarChat","languageId":"plaintext","editCharsInserted":19,"editCharsDeleted":20,"editLinesInserted":1,"editLinesDeleted":1}',
      '01:01:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"8c97b7d8-9adb-4bd8-ac9f-a562704ce40e","didBranchChange":0,"timeDelayMs":60000,"originalCharCount":37,"originalLineCount":1,"originalDeletedLineCount":0,"arc":16,"currentLineCount":1,"currentDeletedLineCount":0}',
      '01:11:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"1eb8a394-2489-41c2-851b-6a79432fc6bc","didBranchChange":0,"timeDelayMs":60000,"originalCharCount":19,"originalLineCount":1,"originalDeletedLineCount":1,"arc":19,"currentLineCount":1,"currentDeletedLineCount":1}',
      '05:01:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"8c97b7d8-9adb-4bd8-ac9f-a562704ce40e","didBranchChange":0,"timeDelayMs":300000,"originalCharCount":37,"originalLineCount":1,"originalDeletedLineCount":0,"arc":16,"currentLineCount":1,"currentDeletedLineCount":0}',
      '05:11:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"1eb8a394-2489-41c2-851b-6a79432fc6bc","didBranchChange":0,"timeDelayMs":300000,"originalCharCount":19,"originalLineCount":1,"originalDeletedLineCount":1,"arc":19,"currentLineCount":1,"currentDeletedLineCount":1}',
      '12:00:000 editTelemetry.editSources.details: {"mode":"10minFocusWindow","sourceKey":"source:Chat.applyEdits","sourceKeyCleaned":"source:Chat.applyEdits","trigger":"time","languageId":"plaintext","statsUuid":"509b5d53-9109-40a2-bdf5-1aa735a229fe","modifiedCount":35,"deltaModifiedCount":56,"totalModifiedCount":39}',
      '12:00:000 editTelemetry.editSources.details: {"mode":"10minFocusWindow","sourceKey":"source:cursor-kind:type","sourceKeyCleaned":"source:cursor-kind:type","trigger":"time","languageId":"plaintext","statsUuid":"509b5d53-9109-40a2-bdf5-1aa735a229fe","modifiedCount":4,"deltaModifiedCount":4,"totalModifiedCount":39}',
      '12:00:000 editTelemetry.editSources.stats: {"attributionSchemaVersion":2,"mode":"10minFocusWindow","languageId":"plaintext","statsUuid":"509b5d53-9109-40a2-bdf5-1aa735a229fe","nesModifiedCount":0,"inlineCompletionsCopilotModifiedCount":0,"inlineCompletionsNESModifiedCount":0,"otherAIModifiedCount":35,"agentHostModifiedCount":0,"unknownModifiedCount":0,"userModifiedCount":4,"ideModifiedCount":0,"totalModifiedCharacters":39,"externalModifiedCount":0,"isTrackedByGit":0,"focusTime":600000,"actualTime":720000,"trigger":"time"}',
      '22:00:000 editTelemetry.editSources.details: {"mode":"20minFocusWindow","sourceKey":"source:Chat.applyEdits","sourceKeyCleaned":"source:Chat.applyEdits","trigger":"time","languageId":"plaintext","statsUuid":"a794406a-7779-4e9f-a856-1caca85123c7","modifiedCount":35,"deltaModifiedCount":56,"totalModifiedCount":39}',
      '22:00:000 editTelemetry.editSources.details: {"mode":"20minFocusWindow","sourceKey":"source:cursor-kind:type","sourceKeyCleaned":"source:cursor-kind:type","trigger":"time","languageId":"plaintext","statsUuid":"a794406a-7779-4e9f-a856-1caca85123c7","modifiedCount":4,"deltaModifiedCount":4,"totalModifiedCount":39}',
      '22:00:000 editTelemetry.editSources.stats: {"attributionSchemaVersion":2,"mode":"20minFocusWindow","languageId":"plaintext","statsUuid":"a794406a-7779-4e9f-a856-1caca85123c7","nesModifiedCount":0,"inlineCompletionsCopilotModifiedCount":0,"inlineCompletionsNESModifiedCount":0,"otherAIModifiedCount":35,"agentHostModifiedCount":0,"unknownModifiedCount":0,"userModifiedCount":4,"ideModifiedCount":0,"totalModifiedCharacters":39,"externalModifiedCount":0,"isTrackedByGit":0,"focusTime":1200000,"actualTime":1320000,"trigger":"time"}'
    ]);
    disposables.dispose();
  }));
});
function formatTime(timeMs) {
  const totalMs = Math.floor(timeMs);
  const minutes = Math.floor(totalMs / 6e4);
  const seconds = Math.floor(totalMs % 6e4 / 1e3);
  const ms = totalMs % 1e3;
  const str = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}:${ms.toString().padStart(3, "0")}`;
  return str;
}
class DeterministicRandomService extends RandomService {
  constructor() {
    super(...arguments);
    this._rand = Random.create(0);
  }
  generateUuid() {
    return this._rand.nextUuid();
  }
}
class FakeAnnotatedDocuments extends Disposable {
  constructor() {
    super();
    this.documents = constObservable([]);
  }
}
function findOffsetRange(str, search) {
  const startContextIndex = search.indexOf("\u226A");
  const endContextIndex = search.indexOf("\u226B");
  let searchStr;
  let beforeContext = "";
  let afterContext = "";
  if (startContextIndex !== -1 && endContextIndex !== -1 && endContextIndex > startContextIndex) {
    beforeContext = search.substring(0, startContextIndex);
    afterContext = search.substring(endContextIndex + 1);
    searchStr = search.substring(startContextIndex + 1, endContextIndex);
  } else {
    searchStr = search;
  }
  const startIndex = str.indexOf(beforeContext + searchStr + afterContext);
  if (startIndex === -1) {
    throw new Error(`Could not find context "${beforeContext}" + "${searchStr}" + "${afterContext}" in string "${str}"`);
  }
  const matchStart = startIndex + beforeContext.length;
  return new OffsetRange(matchStart, matchStart + searchStr.length);
}
class MutableObservableWorkspace extends ObservableWorkspace {
  constructor() {
    super();
    this._openDocuments = observableValue(this, []);
    this.documents = this._openDocuments;
    this._documents = /* @__PURE__ */ new Map();
  }
  /**
   * Dispose to remove.
  */
  createDocument(options, tx = void 0) {
    assert(!this._documents.has(options.uri.toString()));
    const document = new MutableObservableDocument(
      options.uri,
      new StringText(options.initialValue ?? ""),
      [],
      options.languageId ?? "plaintext",
      () => {
        this._documents.delete(options.uri.toString());
        const docs = this._openDocuments.get();
        const filteredDocs = docs.filter((d) => d.uri.toString() !== document.uri.toString());
        if (filteredDocs.length !== docs.length) {
          this._openDocuments.set(filteredDocs, tx, { added: [], removed: [document] });
        }
      },
      options.initialVersionId ?? 0,
      options.workspaceRoot
    );
    this._documents.set(options.uri.toString(), document);
    this._openDocuments.set([...this._openDocuments.get(), document], tx, { added: [document], removed: [] });
    return document;
  }
  getDocument(id) {
    return this._documents.get(id.toString());
  }
  clear() {
    this._openDocuments.set([], void 0, { added: [], removed: this._openDocuments.get() });
    for (const doc of this._documents.values()) {
      doc.dispose();
    }
    this._documents.clear();
  }
}
class MutableObservableDocument extends Disposable {
  constructor(uri, value, selection, languageId, onDispose, versionId, workspaceRoot) {
    super();
    this.uri = uri;
    this.workspaceRoot = workspaceRoot;
    this._value = observableValue(this, value);
    this._selection = observableValue(this, selection);
    this._visibleRanges = observableValue(this, []);
    this._languageId = observableValue(this, languageId);
    this._version = observableValue(this, versionId);
    this._register(toDisposable(onDispose));
  }
  get value() {
    return this._value;
  }
  get selection() {
    return this._selection;
  }
  get visibleRanges() {
    return this._visibleRanges;
  }
  get languageId() {
    return this._languageId;
  }
  get version() {
    return this._version;
  }
  setSelection(selection, tx = void 0) {
    this._selection.set(selection, tx);
  }
  setVisibleRange(visibleRanges, tx = void 0) {
    this._visibleRanges.set(visibleRanges, tx);
  }
  applyEdit(edit, tx = void 0, newVersion = void 0) {
    const newValue = edit.applyOnText(this.value.get());
    const e = edit instanceof StringEditWithReason ? edit : new StringEditWithReason(edit.replacements, EditSources.unknown({}));
    subtransaction(tx, (tx2) => {
      this._value.set(newValue, tx2, e);
      this._version.set(newVersion ?? this._version.get() + 1, tx2);
    });
  }
  updateSelection(selection, tx = void 0) {
    this._selection.set(selection, tx);
  }
  setValue(value, tx = void 0, newVersion = void 0) {
    const reason = EditSources.unknown({});
    const e = new StringEditWithReason([StringReplacement.replace(new OffsetRange(0, this.value.get().value.length), value.value)], reason);
    subtransaction(tx, (tx2) => {
      this._value.set(value, tx2, e);
      this._version.set(newVersion ?? this._version.get() + 1, tx2);
    });
  }
  findRange(search) {
    return findOffsetRange(this.value.get().value, search);
  }
}
export {
  FakeAnnotatedDocuments,
  MutableObservableDocument,
  MutableObservableWorkspace
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXHRlc3RcXGJyb3dzZXJcXGVkaXRUZWxlbWV0cnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUsIElPYnNlcnZhYmxlV2l0aENoYW5nZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlVmFsdWUsIHN1YnRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU3RyaW5nRWRpdCwgU3RyaW5nUmVwbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdHMvc3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgU3RyaW5nVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS90ZXh0L2Fic3RyYWN0VGV4dC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IEFubm90YXRlZERvY3VtZW50LCBBbm5vdGF0ZWREb2N1bWVudHMsIElBbm5vdGF0ZWREb2N1bWVudHMsIFVyaVZpc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaGVscGVycy9hbm5vdGF0ZWREb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGVEb2N1bWVudCwgT2JzZXJ2YWJsZVdvcmtzcGFjZSwgU3RyaW5nRWRpdFdpdGhSZWFzb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2hlbHBlcnMvb2JzZXJ2YWJsZVdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBFZGl0U291cmNlVHJhY2tpbmdJbXBsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZWxlbWV0cnkvZWRpdFNvdXJjZVRyYWNraW5nSW1wbC5qcyc7XG5pbXBvcnQgeyBTY21BZGFwdGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZWxlbWV0cnkvc2NtQWRhcHRlci5qcyc7XG5pbXBvcnQgeyBFZGl0U291cmNlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBEaWZmU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaGVscGVycy9kb2N1bWVudFdpdGhBbm5vdGF0ZWRFZGl0cy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlU3RyaW5nRGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV2ViV29ya2VyLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJhbmRvbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi9jb3JlL3JhbmRvbS5qcyc7XG5pbXBvcnQgeyBBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlSW1wbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJUmFuZG9tU2VydmljZSwgUmFuZG9tU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmFuZG9tU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgVXNlckF0dGVudGlvblNlcnZpY2UsIFVzZXJBdHRlbnRpb25TZXJ2aWNlRW52IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdXNlckF0dGVudGlvbi9icm93c2VyL3VzZXJBdHRlbnRpb25Ccm93c2VyLmpzJztcbmltcG9ydCB7IElVc2VyQXR0ZW50aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJBdHRlbnRpb24vY29tbW9uL3VzZXJBdHRlbnRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcblxuc3VpdGUoJ0VkaXQgVGVsZW1ldHJ5JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCcxJywgYXN5bmMgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlSW1wbCldLFxuXHRcdFx0W0lVc2VyQXR0ZW50aW9uU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFVzZXJBdHRlbnRpb25TZXJ2aWNlKV1cblx0XHQpLCBmYWxzZSwgdW5kZWZpbmVkLCB0cnVlKSk7XG5cblx0XHRjb25zdCBzZW50VGVsZW1ldHJ5OiB1bmtub3duW10gPSBbXTtcblx0XHRjb25zdCB1c2VyQWN0aXZlID0gb2JzZXJ2YWJsZVZhbHVlKCd1c2VyQWN0aXZlJywgdHJ1ZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKFVzZXJBdHRlbnRpb25TZXJ2aWNlRW52LCB7XG5cdFx0XHRpc1VzZXJBY3RpdmU6IHVzZXJBY3RpdmUsXG5cdFx0XHRpc1ZzQ29kZUZvY3VzZWQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lLCBkYXRhKSB7XG5cdFx0XHRcdHNlbnRUZWxlbWV0cnkucHVzaChgJHtmb3JtYXRUaW1lKERhdGUubm93KCkpfSAke2V2ZW50TmFtZX06ICR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9YCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJJbnN0YW5jZShEaWZmU2VydmljZSwgeyBjb21wdXRlRGlmZjogYXN5bmMgKG9yaWdpbmFsLCBtb2RpZmllZCkgPT4gY29tcHV0ZVN0cmluZ0RpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCB7IG1heENvbXB1dGF0aW9uVGltZU1zOiA1MDAgfSwgJ2FkdmFuY2VkJykgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKFNjbUFkYXB0ZXIsIHsgZ2V0UmVwbzogKHVyaSwgcmVhZGVyKSA9PiB1bmRlZmluZWQsIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJJbnN0YW5jZShVcmlWaXNpYmlsaXR5UHJvdmlkZXIsIHsgaXNWaXNpYmxlOiAodXJpLCByZWFkZXIpID0+IHRydWUsIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJhbmRvbVNlcnZpY2UsIG5ldyBEZXRlcm1pbmlzdGljUmFuZG9tU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGV4dEZpbGVTZXJ2aWNlLCB7IGlzRGlydHk6ICgpID0+IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3QgdyA9IG5ldyBNdXRhYmxlT2JzZXJ2YWJsZVdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IGRvY3MgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFubm90YXRlZERvY3VtZW50cyh3LCBpbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdFNvdXJjZVRyYWNraW5nSW1wbChjb25zdE9ic2VydmFibGUodHJ1ZSksIGRvY3MsIHVuZGVmaW5lZCwgaW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGQxID0gZGlzcG9zYWJsZXMuYWRkKHcuY3JlYXRlRG9jdW1lbnQoe1xuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYScpLCBpbml0aWFsVmFsdWU6IGBcbmZ1bmN0aW9uIGZpYihuKSB7XG5cdGlmIChuIDw9IDEpIHJldHVybiBuO1xuXHRyZXR1cm4gZmliKG4gLSAxKSArIGZpYihuIC0gMik7XG59XG5gXG5cdFx0fSwgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnN0IGNoYXRFZGl0ID0gRWRpdFNvdXJjZXMuY2hhdEFwcGx5RWRpdHMoe1xuXHRcdFx0bGFuZ3VhZ2VJZDogJ3BsYWludGV4dCcsXG5cdFx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRjb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0SWQ6IHVuZGVmaW5lZCxcblx0XHRcdHNlc3Npb25JZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0ZDEuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoZDEuZmluZFJhbmdlKCdcdTIyNkFcdTIyNkJmdW5jdGlvbiBmaWIobikgeycpLCAnLy8gQ29tcHV0ZXMgdGhlIG50aCBmaWJvbmFjY2kgbnVtYmVyXFxuJywgY2hhdEVkaXQpKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoNTAwMCk7XG5cblx0XHRkMS5hcHBseUVkaXQobmV3IFN0cmluZ0VkaXRXaXRoUmVhc29uKFtcblx0XHRcdFN0cmluZ1JlcGxhY2VtZW50LnJlcGxhY2UoZDEuZmluZFJhbmdlKCdcdTIyNkEvL1x1MjI2QiBDb21wdXRlcycpLCAnLyonKSxcblx0XHRcdFN0cmluZ1JlcGxhY2VtZW50LnJlcGxhY2UoZDEuZmluZFJhbmdlKCdmaWJvbmFjY2kgbnVtYmVyXHUyMjZBXHUyMjZCJyksICcgKi8nKSxcblx0XHRdLCBFZGl0U291cmNlcy5jdXJzb3IoeyBraW5kOiAndHlwZScgfSkpKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoNTAwMCk7XG5cblx0XHRkMS5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShkMS5maW5kUmFuZ2UoJ0NvbXB1dGVzIHRoZSBudGggZmlib25hY2NpIG51bWJlcicpLCAnQmVyZWNobmV0IGRpZSBudGUgRmlib25hY2NpIFphaGwnLCBjaGF0RWRpdCkpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgzICogNjAgKiAxMDAwKTtcblx0XHR1c2VyQWN0aXZlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDMgKiA2MCAqIDEwMDApO1xuXHRcdHVzZXJBY3RpdmUuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgxOCAqIDYwICogMTAwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbnRUZWxlbWV0cnksIChbXG5cdFx0XHQnMDA6MDE6MDEwIGVkaXRUZWxlbWV0cnkucmVwb3J0RWRpdEFyYzoge1xcXCJzb3VyY2VLZXlDbGVhbmVkXFxcIjpcXFwic291cmNlOkNoYXQuYXBwbHlFZGl0c1xcXCIsXFxcImxhbmd1YWdlSWRcXFwiOlxcXCJwbGFpbnRleHRcXFwiLFxcXCJ1bmlxdWVFZGl0SWRcXFwiOlxcXCI4Yzk3YjdkOC05YWRiLTRiZDgtYWM5Zi1hNTYyNzA0Y2U0MGVcXFwiLFxcXCJkaWRCcmFuY2hDaGFuZ2VcXFwiOjAsXFxcInRpbWVEZWxheU1zXFxcIjowLFxcXCJvcmlnaW5hbENoYXJDb3VudFxcXCI6MzcsXFxcIm9yaWdpbmFsTGluZUNvdW50XFxcIjoxLFxcXCJvcmlnaW5hbERlbGV0ZWRMaW5lQ291bnRcXFwiOjAsXFxcImFyY1xcXCI6MzcsXFxcImN1cnJlbnRMaW5lQ291bnRcXFwiOjEsXFxcImN1cnJlbnREZWxldGVkTGluZUNvdW50XFxcIjowfScsXG5cdFx0XHQnMDA6MDE6MDEwIGVkaXRUZWxlbWV0cnkuY29kZVN1Z2dlc3RlZDoge1xcXCJldmVudElkXFxcIjpcXFwiZXZ0LTA1NWVkNWY1LWM3MjMtNGVkZS1iYTc5LWNjY2Q3Njg1YzdhZFxcXCIsXFxcInN1Z2dlc3Rpb25JZFxcXCI6XFxcInNndC1mNjQ1NjI3YS1jYWNmLTQ3N2EtOTE2NC1lY2Q2MTI1NjE2YTVcXFwiLFxcXCJwcmVzZW50YXRpb25cXFwiOlxcXCJoaWdobGlnaHRlZEVkaXRcXFwiLFxcXCJmZWF0dXJlXFxcIjpcXFwic2lkZUJhckNoYXRcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwiZWRpdENoYXJzSW5zZXJ0ZWRcXFwiOjM3LFxcXCJlZGl0Q2hhcnNEZWxldGVkXFxcIjowLFxcXCJlZGl0TGluZXNJbnNlcnRlZFxcXCI6MSxcXFwiZWRpdExpbmVzRGVsZXRlZFxcXCI6MH0nLFxuXHRcdFx0JzAwOjExOjAxMCBlZGl0VGVsZW1ldHJ5LnJlcG9ydEVkaXRBcmM6IHtcXFwic291cmNlS2V5Q2xlYW5lZFxcXCI6XFxcInNvdXJjZTpDaGF0LmFwcGx5RWRpdHNcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwidW5pcXVlRWRpdElkXFxcIjpcXFwiMWViOGEzOTQtMjQ4OS00MWMyLTg1MWItNmE3OTQzMmZjNmJjXFxcIixcXFwiZGlkQnJhbmNoQ2hhbmdlXFxcIjowLFxcXCJ0aW1lRGVsYXlNc1xcXCI6MCxcXFwib3JpZ2luYWxDaGFyQ291bnRcXFwiOjE5LFxcXCJvcmlnaW5hbExpbmVDb3VudFxcXCI6MSxcXFwib3JpZ2luYWxEZWxldGVkTGluZUNvdW50XFxcIjoxLFxcXCJhcmNcXFwiOjE5LFxcXCJjdXJyZW50TGluZUNvdW50XFxcIjoxLFxcXCJjdXJyZW50RGVsZXRlZExpbmVDb3VudFxcXCI6MX0nLFxuXHRcdFx0JzAwOjExOjAxMCBlZGl0VGVsZW1ldHJ5LmNvZGVTdWdnZXN0ZWQ6IHtcXFwiZXZlbnRJZFxcXCI6XFxcImV2dC01YzljNmZlNy1iMjE5LTRmZjgtYWFhNy1hYjJiMzU1YjIxYzBcXFwiLFxcXCJzdWdnZXN0aW9uSWRcXFwiOlxcXCJzZ3QtNzQzNzkxMjItMDQ1Mi00ZTI2LTljMzgtOWQ2MmYxZTdhZTczXFxcIixcXFwicHJlc2VudGF0aW9uXFxcIjpcXFwiaGlnaGxpZ2h0ZWRFZGl0XFxcIixcXFwiZmVhdHVyZVxcXCI6XFxcInNpZGVCYXJDaGF0XFxcIixcXFwibGFuZ3VhZ2VJZFxcXCI6XFxcInBsYWludGV4dFxcXCIsXFxcImVkaXRDaGFyc0luc2VydGVkXFxcIjoxOSxcXFwiZWRpdENoYXJzRGVsZXRlZFxcXCI6MjAsXFxcImVkaXRMaW5lc0luc2VydGVkXFxcIjoxLFxcXCJlZGl0TGluZXNEZWxldGVkXFxcIjoxfScsXG5cdFx0XHQnMDE6MDE6MDEwIGVkaXRUZWxlbWV0cnkucmVwb3J0RWRpdEFyYzoge1xcXCJzb3VyY2VLZXlDbGVhbmVkXFxcIjpcXFwic291cmNlOkNoYXQuYXBwbHlFZGl0c1xcXCIsXFxcImxhbmd1YWdlSWRcXFwiOlxcXCJwbGFpbnRleHRcXFwiLFxcXCJ1bmlxdWVFZGl0SWRcXFwiOlxcXCI4Yzk3YjdkOC05YWRiLTRiZDgtYWM5Zi1hNTYyNzA0Y2U0MGVcXFwiLFxcXCJkaWRCcmFuY2hDaGFuZ2VcXFwiOjAsXFxcInRpbWVEZWxheU1zXFxcIjo2MDAwMCxcXFwib3JpZ2luYWxDaGFyQ291bnRcXFwiOjM3LFxcXCJvcmlnaW5hbExpbmVDb3VudFxcXCI6MSxcXFwib3JpZ2luYWxEZWxldGVkTGluZUNvdW50XFxcIjowLFxcXCJhcmNcXFwiOjE2LFxcXCJjdXJyZW50TGluZUNvdW50XFxcIjoxLFxcXCJjdXJyZW50RGVsZXRlZExpbmVDb3VudFxcXCI6MH0nLFxuXHRcdFx0JzAxOjExOjAxMCBlZGl0VGVsZW1ldHJ5LnJlcG9ydEVkaXRBcmM6IHtcXFwic291cmNlS2V5Q2xlYW5lZFxcXCI6XFxcInNvdXJjZTpDaGF0LmFwcGx5RWRpdHNcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwidW5pcXVlRWRpdElkXFxcIjpcXFwiMWViOGEzOTQtMjQ4OS00MWMyLTg1MWItNmE3OTQzMmZjNmJjXFxcIixcXFwiZGlkQnJhbmNoQ2hhbmdlXFxcIjowLFxcXCJ0aW1lRGVsYXlNc1xcXCI6NjAwMDAsXFxcIm9yaWdpbmFsQ2hhckNvdW50XFxcIjoxOSxcXFwib3JpZ2luYWxMaW5lQ291bnRcXFwiOjEsXFxcIm9yaWdpbmFsRGVsZXRlZExpbmVDb3VudFxcXCI6MSxcXFwiYXJjXFxcIjoxOSxcXFwiY3VycmVudExpbmVDb3VudFxcXCI6MSxcXFwiY3VycmVudERlbGV0ZWRMaW5lQ291bnRcXFwiOjF9Jyxcblx0XHRcdCcwNTowMTowMTAgZWRpdFRlbGVtZXRyeS5yZXBvcnRFZGl0QXJjOiB7XFxcInNvdXJjZUtleUNsZWFuZWRcXFwiOlxcXCJzb3VyY2U6Q2hhdC5hcHBseUVkaXRzXFxcIixcXFwibGFuZ3VhZ2VJZFxcXCI6XFxcInBsYWludGV4dFxcXCIsXFxcInVuaXF1ZUVkaXRJZFxcXCI6XFxcIjhjOTdiN2Q4LTlhZGItNGJkOC1hYzlmLWE1NjI3MDRjZTQwZVxcXCIsXFxcImRpZEJyYW5jaENoYW5nZVxcXCI6MCxcXFwidGltZURlbGF5TXNcXFwiOjMwMDAwMCxcXFwib3JpZ2luYWxDaGFyQ291bnRcXFwiOjM3LFxcXCJvcmlnaW5hbExpbmVDb3VudFxcXCI6MSxcXFwib3JpZ2luYWxEZWxldGVkTGluZUNvdW50XFxcIjowLFxcXCJhcmNcXFwiOjE2LFxcXCJjdXJyZW50TGluZUNvdW50XFxcIjoxLFxcXCJjdXJyZW50RGVsZXRlZExpbmVDb3VudFxcXCI6MH0nLFxuXHRcdFx0JzA1OjExOjAxMCBlZGl0VGVsZW1ldHJ5LnJlcG9ydEVkaXRBcmM6IHtcXFwic291cmNlS2V5Q2xlYW5lZFxcXCI6XFxcInNvdXJjZTpDaGF0LmFwcGx5RWRpdHNcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwidW5pcXVlRWRpdElkXFxcIjpcXFwiMWViOGEzOTQtMjQ4OS00MWMyLTg1MWItNmE3OTQzMmZjNmJjXFxcIixcXFwiZGlkQnJhbmNoQ2hhbmdlXFxcIjowLFxcXCJ0aW1lRGVsYXlNc1xcXCI6MzAwMDAwLFxcXCJvcmlnaW5hbENoYXJDb3VudFxcXCI6MTksXFxcIm9yaWdpbmFsTGluZUNvdW50XFxcIjoxLFxcXCJvcmlnaW5hbERlbGV0ZWRMaW5lQ291bnRcXFwiOjEsXFxcImFyY1xcXCI6MTksXFxcImN1cnJlbnRMaW5lQ291bnRcXFwiOjEsXFxcImN1cnJlbnREZWxldGVkTGluZUNvdW50XFxcIjoxfScsXG5cdFx0XHQnMTI6MDA6MDAwIGVkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlsczoge1xcXCJtb2RlXFxcIjpcXFwiMTBtaW5Gb2N1c1dpbmRvd1xcXCIsXFxcInNvdXJjZUtleVxcXCI6XFxcInNvdXJjZTpDaGF0LmFwcGx5RWRpdHNcXFwiLFxcXCJzb3VyY2VLZXlDbGVhbmVkXFxcIjpcXFwic291cmNlOkNoYXQuYXBwbHlFZGl0c1xcXCIsXFxcInRyaWdnZXJcXFwiOlxcXCJ0aW1lXFxcIixcXFwibGFuZ3VhZ2VJZFxcXCI6XFxcInBsYWludGV4dFxcXCIsXFxcInN0YXRzVXVpZFxcXCI6XFxcIjUwOWI1ZDUzLTkxMDktNDBhMi1iZGY1LTFhYTczNWEyMjlmZVxcXCIsXFxcIm1vZGlmaWVkQ291bnRcXFwiOjM1LFxcXCJkZWx0YU1vZGlmaWVkQ291bnRcXFwiOjU2LFxcXCJ0b3RhbE1vZGlmaWVkQ291bnRcXFwiOjM5fScsXG5cdFx0XHQnMTI6MDA6MDAwIGVkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlsczoge1xcXCJtb2RlXFxcIjpcXFwiMTBtaW5Gb2N1c1dpbmRvd1xcXCIsXFxcInNvdXJjZUtleVxcXCI6XFxcInNvdXJjZTpjdXJzb3Ita2luZDp0eXBlXFxcIixcXFwic291cmNlS2V5Q2xlYW5lZFxcXCI6XFxcInNvdXJjZTpjdXJzb3Ita2luZDp0eXBlXFxcIixcXFwidHJpZ2dlclxcXCI6XFxcInRpbWVcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwic3RhdHNVdWlkXFxcIjpcXFwiNTA5YjVkNTMtOTEwOS00MGEyLWJkZjUtMWFhNzM1YTIyOWZlXFxcIixcXFwibW9kaWZpZWRDb3VudFxcXCI6NCxcXFwiZGVsdGFNb2RpZmllZENvdW50XFxcIjo0LFxcXCJ0b3RhbE1vZGlmaWVkQ291bnRcXFwiOjM5fScsXG5cdFx0XHQnMTI6MDA6MDAwIGVkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuc3RhdHM6IHtcXFwiYXR0cmlidXRpb25TY2hlbWFWZXJzaW9uXFxcIjoyLFxcXCJtb2RlXFxcIjpcXFwiMTBtaW5Gb2N1c1dpbmRvd1xcXCIsXFxcImxhbmd1YWdlSWRcXFwiOlxcXCJwbGFpbnRleHRcXFwiLFxcXCJzdGF0c1V1aWRcXFwiOlxcXCI1MDliNWQ1My05MTA5LTQwYTItYmRmNS0xYWE3MzVhMjI5ZmVcXFwiLFxcXCJuZXNNb2RpZmllZENvdW50XFxcIjowLFxcXCJpbmxpbmVDb21wbGV0aW9uc0NvcGlsb3RNb2RpZmllZENvdW50XFxcIjowLFxcXCJpbmxpbmVDb21wbGV0aW9uc05FU01vZGlmaWVkQ291bnRcXFwiOjAsXFxcIm90aGVyQUlNb2RpZmllZENvdW50XFxcIjozNSxcXFwiYWdlbnRIb3N0TW9kaWZpZWRDb3VudFxcXCI6MCxcXFwidW5rbm93bk1vZGlmaWVkQ291bnRcXFwiOjAsXFxcInVzZXJNb2RpZmllZENvdW50XFxcIjo0LFxcXCJpZGVNb2RpZmllZENvdW50XFxcIjowLFxcXCJ0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyc1xcXCI6MzksXFxcImV4dGVybmFsTW9kaWZpZWRDb3VudFxcXCI6MCxcXFwiaXNUcmFja2VkQnlHaXRcXFwiOjAsXFxcImZvY3VzVGltZVxcXCI6NjAwMDAwLFxcXCJhY3R1YWxUaW1lXFxcIjo3MjAwMDAsXFxcInRyaWdnZXJcXFwiOlxcXCJ0aW1lXFxcIn0nLFxuXHRcdFx0JzIyOjAwOjAwMCBlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHM6IHtcXFwibW9kZVxcXCI6XFxcIjIwbWluRm9jdXNXaW5kb3dcXFwiLFxcXCJzb3VyY2VLZXlcXFwiOlxcXCJzb3VyY2U6Q2hhdC5hcHBseUVkaXRzXFxcIixcXFwic291cmNlS2V5Q2xlYW5lZFxcXCI6XFxcInNvdXJjZTpDaGF0LmFwcGx5RWRpdHNcXFwiLFxcXCJ0cmlnZ2VyXFxcIjpcXFwidGltZVxcXCIsXFxcImxhbmd1YWdlSWRcXFwiOlxcXCJwbGFpbnRleHRcXFwiLFxcXCJzdGF0c1V1aWRcXFwiOlxcXCJhNzk0NDA2YS03Nzc5LTRlOWYtYTg1Ni0xY2FjYTg1MTIzYzdcXFwiLFxcXCJtb2RpZmllZENvdW50XFxcIjozNSxcXFwiZGVsdGFNb2RpZmllZENvdW50XFxcIjo1NixcXFwidG90YWxNb2RpZmllZENvdW50XFxcIjozOX0nLFxuXHRcdFx0JzIyOjAwOjAwMCBlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHM6IHtcXFwibW9kZVxcXCI6XFxcIjIwbWluRm9jdXNXaW5kb3dcXFwiLFxcXCJzb3VyY2VLZXlcXFwiOlxcXCJzb3VyY2U6Y3Vyc29yLWtpbmQ6dHlwZVxcXCIsXFxcInNvdXJjZUtleUNsZWFuZWRcXFwiOlxcXCJzb3VyY2U6Y3Vyc29yLWtpbmQ6dHlwZVxcXCIsXFxcInRyaWdnZXJcXFwiOlxcXCJ0aW1lXFxcIixcXFwibGFuZ3VhZ2VJZFxcXCI6XFxcInBsYWludGV4dFxcXCIsXFxcInN0YXRzVXVpZFxcXCI6XFxcImE3OTQ0MDZhLTc3NzktNGU5Zi1hODU2LTFjYWNhODUxMjNjN1xcXCIsXFxcIm1vZGlmaWVkQ291bnRcXFwiOjQsXFxcImRlbHRhTW9kaWZpZWRDb3VudFxcXCI6NCxcXFwidG90YWxNb2RpZmllZENvdW50XFxcIjozOX0nLFxuXHRcdFx0JzIyOjAwOjAwMCBlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzOiB7XFxcImF0dHJpYnV0aW9uU2NoZW1hVmVyc2lvblxcXCI6MixcXFwibW9kZVxcXCI6XFxcIjIwbWluRm9jdXNXaW5kb3dcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwic3RhdHNVdWlkXFxcIjpcXFwiYTc5NDQwNmEtNzc3OS00ZTlmLWE4NTYtMWNhY2E4NTEyM2M3XFxcIixcXFwibmVzTW9kaWZpZWRDb3VudFxcXCI6MCxcXFwiaW5saW5lQ29tcGxldGlvbnNDb3BpbG90TW9kaWZpZWRDb3VudFxcXCI6MCxcXFwiaW5saW5lQ29tcGxldGlvbnNORVNNb2RpZmllZENvdW50XFxcIjowLFxcXCJvdGhlckFJTW9kaWZpZWRDb3VudFxcXCI6MzUsXFxcImFnZW50SG9zdE1vZGlmaWVkQ291bnRcXFwiOjAsXFxcInVua25vd25Nb2RpZmllZENvdW50XFxcIjowLFxcXCJ1c2VyTW9kaWZpZWRDb3VudFxcXCI6NCxcXFwiaWRlTW9kaWZpZWRDb3VudFxcXCI6MCxcXFwidG90YWxNb2RpZmllZENoYXJhY3RlcnNcXFwiOjM5LFxcXCJleHRlcm5hbE1vZGlmaWVkQ291bnRcXFwiOjAsXFxcImlzVHJhY2tlZEJ5R2l0XFxcIjowLFxcXCJmb2N1c1RpbWVcXFwiOjEyMDAwMDAsXFxcImFjdHVhbFRpbWVcXFwiOjEzMjAwMDAsXFxcInRyaWdnZXJcXFwiOlxcXCJ0aW1lXFxcIn0nXG5cdFx0XSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KSk7XG59KTtcblxuZnVuY3Rpb24gZm9ybWF0VGltZSh0aW1lTXM6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IHRvdGFsTXMgPSBNYXRoLmZsb29yKHRpbWVNcyk7XG5cdGNvbnN0IG1pbnV0ZXMgPSBNYXRoLmZsb29yKHRvdGFsTXMgLyA2MDAwMCk7XG5cdGNvbnN0IHNlY29uZHMgPSBNYXRoLmZsb29yKCh0b3RhbE1zICUgNjAwMDApIC8gMTAwMCk7XG5cdGNvbnN0IG1zID0gdG90YWxNcyAlIDEwMDA7XG5cdGNvbnN0IHN0ciA9IGAke21pbnV0ZXMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfToke3NlY29uZHMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfToke21zLnRvU3RyaW5nKCkucGFkU3RhcnQoMywgJzAnKX1gO1xuXHRyZXR1cm4gc3RyO1xufVxuXG5jbGFzcyBEZXRlcm1pbmlzdGljUmFuZG9tU2VydmljZSBleHRlbmRzIFJhbmRvbVNlcnZpY2Uge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yYW5kID0gUmFuZG9tLmNyZWF0ZSgwKTtcblxuXHRvdmVycmlkZSBnZW5lcmF0ZVV1aWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcmFuZC5uZXh0VXVpZCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGYWtlQW5ub3RhdGVkRG9jdW1lbnRzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBbm5vdGF0ZWREb2N1bWVudHMge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9jdW1lbnRzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBBbm5vdGF0ZWREb2N1bWVudFtdPjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kb2N1bWVudHMgPSBjb25zdE9ic2VydmFibGU8cmVhZG9ubHkgQW5ub3RhdGVkRG9jdW1lbnRbXT4oW10pO1xuXHR9XG59XG5cbi8qKiBDYW4gY29udGFpbiBcIlx1MjI2QVwiIGFuZCBcIlx1MjI2QlwiIHRvIGFkZCBjb250ZXh0LCBlLmcuIGVcdTIyNkFsXHUyMjZCIG9ubHkgbWF0Y2hlcyB0aGUgZmlyc3QgbCBpbiBgaGVsbG9gLiAqL1xudHlwZSBTZWFyY2hTdHJpbmcgPSBzdHJpbmc7XG5cbmZ1bmN0aW9uIGZpbmRPZmZzZXRSYW5nZShzdHI6IHN0cmluZywgc2VhcmNoOiBTZWFyY2hTdHJpbmcpOiBPZmZzZXRSYW5nZSB7XG5cdGNvbnN0IHN0YXJ0Q29udGV4dEluZGV4ID0gc2VhcmNoLmluZGV4T2YoJ1x1MjI2QScpO1xuXHRjb25zdCBlbmRDb250ZXh0SW5kZXggPSBzZWFyY2guaW5kZXhPZignXHUyMjZCJyk7XG5cblx0bGV0IHNlYXJjaFN0cjogc3RyaW5nO1xuXHRsZXQgYmVmb3JlQ29udGV4dCA9ICcnO1xuXHRsZXQgYWZ0ZXJDb250ZXh0ID0gJyc7XG5cblx0aWYgKHN0YXJ0Q29udGV4dEluZGV4ICE9PSAtMSAmJiBlbmRDb250ZXh0SW5kZXggIT09IC0xICYmIGVuZENvbnRleHRJbmRleCA+IHN0YXJ0Q29udGV4dEluZGV4KSB7XG5cdFx0YmVmb3JlQ29udGV4dCA9IHNlYXJjaC5zdWJzdHJpbmcoMCwgc3RhcnRDb250ZXh0SW5kZXgpO1xuXHRcdGFmdGVyQ29udGV4dCA9IHNlYXJjaC5zdWJzdHJpbmcoZW5kQ29udGV4dEluZGV4ICsgMSk7XG5cdFx0c2VhcmNoU3RyID0gc2VhcmNoLnN1YnN0cmluZyhzdGFydENvbnRleHRJbmRleCArIDEsIGVuZENvbnRleHRJbmRleCk7XG5cdH0gZWxzZSB7XG5cdFx0c2VhcmNoU3RyID0gc2VhcmNoO1xuXHR9XG5cblx0Y29uc3Qgc3RhcnRJbmRleCA9IHN0ci5pbmRleE9mKGJlZm9yZUNvbnRleHQgKyBzZWFyY2hTdHIgKyBhZnRlckNvbnRleHQpO1xuXHRpZiAoc3RhcnRJbmRleCA9PT0gLTEpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmaW5kIGNvbnRleHQgXCIke2JlZm9yZUNvbnRleHR9XCIgKyBcIiR7c2VhcmNoU3RyfVwiICsgXCIke2FmdGVyQ29udGV4dH1cIiBpbiBzdHJpbmcgXCIke3N0cn1cImApO1xuXHR9XG5cblx0Y29uc3QgbWF0Y2hTdGFydCA9IHN0YXJ0SW5kZXggKyBiZWZvcmVDb250ZXh0Lmxlbmd0aDtcblx0cmV0dXJuIG5ldyBPZmZzZXRSYW5nZShtYXRjaFN0YXJ0LCBtYXRjaFN0YXJ0ICsgc2VhcmNoU3RyLmxlbmd0aCk7XG59XG5cbmV4cG9ydCBjbGFzcyBNdXRhYmxlT2JzZXJ2YWJsZVdvcmtzcGFjZSBleHRlbmRzIE9ic2VydmFibGVXb3Jrc3BhY2Uge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcGVuRG9jdW1lbnRzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElPYnNlcnZhYmxlRG9jdW1lbnRbXSwgeyBhZGRlZDogcmVhZG9ubHkgSU9ic2VydmFibGVEb2N1bWVudFtdOyByZW1vdmVkOiByZWFkb25seSBJT2JzZXJ2YWJsZURvY3VtZW50W10gfT4odGhpcywgW10pO1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9jdW1lbnRzID0gdGhpcy5fb3BlbkRvY3VtZW50cztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHMgPSBuZXcgTWFwPC8qIHVyaSAqLyBzdHJpbmcsIE11dGFibGVPYnNlcnZhYmxlRG9jdW1lbnQ+KCk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlIHRvIHJlbW92ZS5cblx0Ki9cblx0cHVibGljIGNyZWF0ZURvY3VtZW50KG9wdGlvbnM6IHsgdXJpOiBVUkk7IHdvcmtzcGFjZVJvb3Q/OiBVUkk7IGluaXRpYWxWYWx1ZT86IHN0cmluZzsgaW5pdGlhbFZlcnNpb25JZD86IG51bWJlcjsgbGFuZ3VhZ2VJZD86IHN0cmluZyB9LCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogTXV0YWJsZU9ic2VydmFibGVEb2N1bWVudCB7XG5cdFx0YXNzZXJ0KCF0aGlzLl9kb2N1bWVudHMuaGFzKG9wdGlvbnMudXJpLnRvU3RyaW5nKCkpKTtcblxuXHRcdGNvbnN0IGRvY3VtZW50ID0gbmV3IE11dGFibGVPYnNlcnZhYmxlRG9jdW1lbnQoXG5cdFx0XHRvcHRpb25zLnVyaSxcblx0XHRcdG5ldyBTdHJpbmdUZXh0KG9wdGlvbnMuaW5pdGlhbFZhbHVlID8/ICcnKSxcblx0XHRcdFtdLFxuXHRcdFx0b3B0aW9ucy5sYW5ndWFnZUlkID8/ICdwbGFpbnRleHQnLFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9kb2N1bWVudHMuZGVsZXRlKG9wdGlvbnMudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCBkb2NzID0gdGhpcy5fb3BlbkRvY3VtZW50cy5nZXQoKTtcblx0XHRcdFx0Y29uc3QgZmlsdGVyZWREb2NzID0gZG9jcy5maWx0ZXIoZCA9PiBkLnVyaS50b1N0cmluZygpICE9PSBkb2N1bWVudC51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGlmIChmaWx0ZXJlZERvY3MubGVuZ3RoICE9PSBkb2NzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuX29wZW5Eb2N1bWVudHMuc2V0KGZpbHRlcmVkRG9jcywgdHgsIHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbZG9jdW1lbnRdIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b3B0aW9ucy5pbml0aWFsVmVyc2lvbklkID8/IDAsXG5cdFx0XHRvcHRpb25zLndvcmtzcGFjZVJvb3QsXG5cdFx0KTtcblxuXHRcdHRoaXMuX2RvY3VtZW50cy5zZXQob3B0aW9ucy51cmkudG9TdHJpbmcoKSwgZG9jdW1lbnQpO1xuXHRcdHRoaXMuX29wZW5Eb2N1bWVudHMuc2V0KFsuLi50aGlzLl9vcGVuRG9jdW1lbnRzLmdldCgpLCBkb2N1bWVudF0sIHR4LCB7IGFkZGVkOiBbZG9jdW1lbnRdLCByZW1vdmVkOiBbXSB9KTtcblxuXHRcdHJldHVybiBkb2N1bWVudDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXREb2N1bWVudChpZDogVVJJKTogTXV0YWJsZU9ic2VydmFibGVEb2N1bWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvY3VtZW50cy5nZXQoaWQudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fb3BlbkRvY3VtZW50cy5zZXQoW10sIHVuZGVmaW5lZCwgeyBhZGRlZDogW10sIHJlbW92ZWQ6IHRoaXMuX29wZW5Eb2N1bWVudHMuZ2V0KCkgfSk7XG5cdFx0Zm9yIChjb25zdCBkb2Mgb2YgdGhpcy5fZG9jdW1lbnRzLnZhbHVlcygpKSB7XG5cdFx0XHRkb2MuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9kb2N1bWVudHMuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTXV0YWJsZU9ic2VydmFibGVEb2N1bWVudCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT2JzZXJ2YWJsZURvY3VtZW50IHtcblx0cHJpdmF0ZSByZWFkb25seSBfdmFsdWU6IElTZXR0YWJsZU9ic2VydmFibGU8U3RyaW5nVGV4dCwgU3RyaW5nRWRpdFdpdGhSZWFzb24+O1xuXHRwdWJsaWMgZ2V0IHZhbHVlKCk6IElPYnNlcnZhYmxlV2l0aENoYW5nZTxTdHJpbmdUZXh0LCBTdHJpbmdFZGl0V2l0aFJlYXNvbj4geyByZXR1cm4gdGhpcy5fdmFsdWU7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3Rpb246IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgT2Zmc2V0UmFuZ2VbXT47XG5cdHB1YmxpYyBnZXQgc2VsZWN0aW9uKCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IE9mZnNldFJhbmdlW10+IHsgcmV0dXJuIHRoaXMuX3NlbGVjdGlvbjsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2libGVSYW5nZXM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgT2Zmc2V0UmFuZ2VbXT47XG5cdHB1YmxpYyBnZXQgdmlzaWJsZVJhbmdlcygpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBPZmZzZXRSYW5nZVtdPiB7IHJldHVybiB0aGlzLl92aXNpYmxlUmFuZ2VzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VJZDogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRwdWJsaWMgZ2V0IGxhbmd1YWdlSWQoKTogSU9ic2VydmFibGU8c3RyaW5nPiB7IHJldHVybiB0aGlzLl9sYW5ndWFnZUlkOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmVyc2lvbjogSVNldHRhYmxlT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHRwdWJsaWMgZ2V0IHZlcnNpb24oKTogSU9ic2VydmFibGU8bnVtYmVyPiB7IHJldHVybiB0aGlzLl92ZXJzaW9uOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHVyaTogVVJJLFxuXHRcdHZhbHVlOiBTdHJpbmdUZXh0LFxuXHRcdHNlbGVjdGlvbjogcmVhZG9ubHkgT2Zmc2V0UmFuZ2VbXSxcblx0XHRsYW5ndWFnZUlkOiBzdHJpbmcsXG5cdFx0b25EaXNwb3NlOiAoKSA9PiB2b2lkLFxuXHRcdHZlcnNpb25JZDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSB3b3Jrc3BhY2VSb290OiBVUkkgfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl92YWx1ZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB2YWx1ZSk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHNlbGVjdGlvbik7XG5cdFx0dGhpcy5fdmlzaWJsZVJhbmdlcyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBbXSk7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VJZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBsYW5ndWFnZUlkKTtcblx0XHR0aGlzLl92ZXJzaW9uID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHZlcnNpb25JZCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUob25EaXNwb3NlKSk7XG5cdH1cblxuXHRzZXRTZWxlY3Rpb24oc2VsZWN0aW9uOiByZWFkb25seSBPZmZzZXRSYW5nZVtdLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0aW9uLnNldChzZWxlY3Rpb24sIHR4KTtcblx0fVxuXG5cdHNldFZpc2libGVSYW5nZSh2aXNpYmxlUmFuZ2VzOiByZWFkb25seSBPZmZzZXRSYW5nZVtdLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJsZVJhbmdlcy5zZXQodmlzaWJsZVJhbmdlcywgdHgpO1xuXHR9XG5cblx0YXBwbHlFZGl0KGVkaXQ6IFN0cmluZ0VkaXQgfCBTdHJpbmdFZGl0V2l0aFJlYXNvbiwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCwgbmV3VmVyc2lvbjogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3VmFsdWUgPSBlZGl0LmFwcGx5T25UZXh0KHRoaXMudmFsdWUuZ2V0KCkpO1xuXHRcdGNvbnN0IGUgPSBlZGl0IGluc3RhbmNlb2YgU3RyaW5nRWRpdFdpdGhSZWFzb24gPyBlZGl0IDogbmV3IFN0cmluZ0VkaXRXaXRoUmVhc29uKGVkaXQucmVwbGFjZW1lbnRzLCBFZGl0U291cmNlcy51bmtub3duKHt9KSk7XG5cdFx0c3VidHJhbnNhY3Rpb24odHgsIHR4ID0+IHtcblx0XHRcdHRoaXMuX3ZhbHVlLnNldChuZXdWYWx1ZSwgdHgsIGUpO1xuXHRcdFx0dGhpcy5fdmVyc2lvbi5zZXQobmV3VmVyc2lvbiA/PyB0aGlzLl92ZXJzaW9uLmdldCgpICsgMSwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0dXBkYXRlU2VsZWN0aW9uKHNlbGVjdGlvbjogcmVhZG9ubHkgT2Zmc2V0UmFuZ2VbXSwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGlvbi5zZXQoc2VsZWN0aW9uLCB0eCk7XG5cdH1cblxuXHRzZXRWYWx1ZSh2YWx1ZTogU3RyaW5nVGV4dCwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCwgbmV3VmVyc2lvbjogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVhc29uID0gRWRpdFNvdXJjZXMudW5rbm93bih7fSk7XG5cdFx0Y29uc3QgZSA9IG5ldyBTdHJpbmdFZGl0V2l0aFJlYXNvbihbU3RyaW5nUmVwbGFjZW1lbnQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMCwgdGhpcy52YWx1ZS5nZXQoKS52YWx1ZS5sZW5ndGgpLCB2YWx1ZS52YWx1ZSldLCByZWFzb24pO1xuXHRcdHN1YnRyYW5zYWN0aW9uKHR4LCB0eCA9PiB7XG5cdFx0XHR0aGlzLl92YWx1ZS5zZXQodmFsdWUsIHR4LCBlKTtcblx0XHRcdHRoaXMuX3ZlcnNpb24uc2V0KG5ld1ZlcnNpb24gPz8gdGhpcy5fdmVyc2lvbi5nZXQoKSArIDEsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdGZpbmRSYW5nZShzZWFyY2g6IFNlYXJjaFN0cmluZyk6IE9mZnNldFJhbmdlIHtcblx0XHRyZXR1cm4gZmluZE9mZnNldFJhbmdlKHRoaXMudmFsdWUuZ2V0KCkudmFsdWUsIHNlYXJjaCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLGlCQUF3RixpQkFBaUIsc0JBQXNCO0FBQ3hJLFNBQVMsV0FBVztBQUNwQixTQUFxQix5QkFBeUI7QUFDOUMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBNEIsb0JBQXlDLDZCQUE2QjtBQUNsRyxTQUE4QixxQkFBcUIsNEJBQTRCO0FBQy9FLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxnQkFBZ0IscUJBQXFCO0FBQzlDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCLCtCQUErQjtBQUM5RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsd0JBQXdCO0FBRWpDLE1BQU0sa0JBQWtCLE1BQU07QUFDN0IsMENBQXdDO0FBRXhDLE9BQUssS0FBSyxZQUFZLG1CQUFtQixDQUFDLEdBQUcsWUFBWTtBQUN4RCxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSx1QkFBdUIsWUFB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
