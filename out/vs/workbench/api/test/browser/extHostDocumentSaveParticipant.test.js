import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostDocuments } from "../../common/extHostDocuments.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { TextDocumentSaveReason, TextEdit, Position, EndOfLine } from "../../common/extHostTypes.js";
import { ExtHostDocumentSaveParticipant } from "../../common/extHostDocumentSaveParticipant.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { SaveReason } from "../../../common/editor.js";
import { mock } from "../../../../base/test/common/mock.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { nullExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
function timeout(n) {
  return new Promise((resolve) => setTimeout(resolve, n));
}
suite("ExtHostDocumentSaveParticipant", () => {
  const resource = URI.parse("foo:bar");
  const mainThreadBulkEdits = new class extends mock() {
  }();
  let documents;
  const nullLogService = new NullLogService();
  setup(() => {
    const documentsAndEditors = new ExtHostDocumentsAndEditors(SingleProxyRPCProtocol(null), new NullLogService());
    documentsAndEditors.$acceptDocumentsAndEditorsDelta({
      addedDocuments: [{
        isDirty: false,
        languageId: "foo",
        uri: resource,
        versionId: 1,
        lines: ["foo"],
        EOL: "\n",
        encoding: "utf8"
      }]
    });
    documents = new ExtHostDocuments(SingleProxyRPCProtocol(null), documentsAndEditors);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("no listeners, no problem", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => assert.ok(true));
  });
  test("event delivery", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    let event;
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      event = e;
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
      assert.ok(event);
      assert.strictEqual(event.reason, TextDocumentSaveReason.Manual);
      assert.strictEqual(typeof event.waitUntil, "function");
    });
  });
  test("event delivery, immutable", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    let event;
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      event = e;
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
      assert.ok(event);
      assert.throws(() => {
        event.document = null;
      });
    });
  });
  test("event delivery, bad listener", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      throw new Error("\u{1F480}");
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then((values) => {
      sub.dispose();
      const [first] = values;
      assert.strictEqual(first, false);
    });
  });
  test("event delivery, bad listener doesn't prevent more events", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      throw new Error("\u{1F480}");
    });
    let event;
    const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      event = e;
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub1.dispose();
      sub2.dispose();
      assert.ok(event);
    });
  });
  test("event delivery, in subscriber order", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    let counter = 0;
    const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      assert.strictEqual(counter++, 0);
    });
    const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      assert.strictEqual(counter++, 1);
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub1.dispose();
      sub2.dispose();
    });
  });
  test("event delivery, ignore bad listeners", async () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 5, errors: 1 });
    let callCount = 0;
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      callCount += 1;
      throw new Error("boom");
    });
    await participant.$participateInSave(resource, SaveReason.EXPLICIT);
    await participant.$participateInSave(resource, SaveReason.EXPLICIT);
    await participant.$participateInSave(resource, SaveReason.EXPLICIT);
    await participant.$participateInSave(resource, SaveReason.EXPLICIT);
    sub.dispose();
    assert.strictEqual(callCount, 2);
  });
  test("event delivery, overall timeout", async function() {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 20, errors: 5 });
    const calls = [];
    const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      calls.push(1);
    });
    const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      calls.push(2);
      event.waitUntil(timeout(100));
    });
    const sub3 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      calls.push(3);
    });
    const values = await participant.$participateInSave(resource, SaveReason.EXPLICIT);
    sub1.dispose();
    sub2.dispose();
    sub3.dispose();
    assert.deepStrictEqual(calls, [1, 2]);
    assert.strictEqual(values.length, 2);
  });
  test("event delivery, waitUntil", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      event.waitUntil(timeout(10));
      event.waitUntil(timeout(10));
      event.waitUntil(timeout(10));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
    });
  });
  test("event delivery, waitUntil must be called sync", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      event.waitUntil(new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            assert.throws(() => event.waitUntil(timeout(10)));
            resolve(void 0);
          } catch (e) {
            reject(e);
          }
        }, 10);
      }));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
    });
  });
  test("event delivery, waitUntil will timeout", function() {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 5, errors: 3 });
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      event.waitUntil(timeout(100));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then((values) => {
      sub.dispose();
      const [first] = values;
      assert.strictEqual(first, false);
    });
  });
  test("event delivery, waitUntil failure handling", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      e.waitUntil(Promise.reject(new Error("dddd")));
    });
    let event;
    const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      event = e;
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      assert.ok(event);
      sub1.dispose();
      sub2.dispose();
    });
  });
  test("event delivery, pushEdits sync", () => {
    let dto;
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock() {
      $tryApplyWorkspaceEdit(_edits) {
        dto = _edits.value;
        return Promise.resolve(true);
      }
    }());
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), "bar")]));
      e.waitUntil(Promise.resolve([TextEdit.setEndOfLine(EndOfLine.CRLF)]));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
      assert.strictEqual(dto.edits.length, 2);
      assert.ok(dto.edits[0].textEdit);
      assert.ok(dto.edits[1].textEdit);
    });
  });
  test("event delivery, concurrent change", () => {
    let edits;
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock() {
      $tryApplyWorkspaceEdit(_edits) {
        edits = _edits.value;
        return Promise.resolve(true);
      }
    }());
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      documents.$acceptModelChanged(resource, {
        changes: [{
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
          rangeOffset: void 0,
          rangeLength: void 0,
          text: "bar"
        }],
        eol: void 0,
        versionId: 2,
        isRedoing: false,
        isUndoing: false,
        detailedReason: void 0,
        isFlush: false,
        isEolChange: false
      }, true);
      e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), "bar")]));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then((values) => {
      sub.dispose();
      assert.strictEqual(edits, void 0);
      assert.strictEqual(values[0], false);
    });
  });
  test("event delivery, two listeners -> two document states", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock() {
      $tryApplyWorkspaceEdit(dto) {
        for (const edit of dto.value.edits) {
          const uri = URI.revive(edit.resource);
          const { text, range } = edit.textEdit;
          documents.$acceptModelChanged(uri, {
            changes: [{
              range,
              text,
              rangeOffset: void 0,
              rangeLength: void 0
            }],
            eol: void 0,
            versionId: documents.getDocumentData(uri).version + 1,
            isRedoing: false,
            isUndoing: false,
            detailedReason: void 0,
            isFlush: false,
            isEolChange: false
          }, true);
        }
        return Promise.resolve(true);
      }
    }());
    const document = documents.getDocument(resource);
    const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      assert.strictEqual(document.version, 1);
      assert.strictEqual(document.getText(), "foo");
      e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), "bar")]));
    });
    const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      assert.strictEqual(document.version, 2);
      assert.strictEqual(document.getText(), "barfoo");
      e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), "bar")]));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then((values) => {
      sub1.dispose();
      sub2.dispose();
      assert.strictEqual(document.version, 3);
      assert.strictEqual(document.getText(), "barbarfoo");
    });
  });
  test("Log failing listener", function() {
    let didLogSomething = false;
    const participant = new ExtHostDocumentSaveParticipant(new class extends NullLogService {
      error(message, ...args) {
        didLogSomething = true;
      }
    }(), documents, mainThreadBulkEdits);
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      throw new Error("boom");
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
      assert.strictEqual(didLogSomething, true);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBUZXh0RG9jdW1lbnRTYXZlUmVhc29uLCBUZXh0RWRpdCwgUG9zaXRpb24sIEVuZE9mTGluZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGUsIElXb3Jrc3BhY2VFZGl0RHRvLCBJV29ya3NwYWNlVGV4dEVkaXREdG8sIE1haW5UaHJlYWRCdWxrRWRpdHNTaGFwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQuanMnO1xuaW1wb3J0IHsgU2luZ2xlUHJveHlSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgU2F2ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuXG5mdW5jdGlvbiB0aW1lb3V0KG46IG51bWJlcikge1xuXHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG4pKTtcbn1cblxuc3VpdGUoJ0V4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudCcsICgpID0+IHtcblxuXHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnZm9vOmJhcicpO1xuXHRjb25zdCBtYWluVGhyZWFkQnVsa0VkaXRzID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQnVsa0VkaXRzU2hhcGU+KCkgeyB9O1xuXHRsZXQgZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzO1xuXHRjb25zdCBudWxsTG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBkb2N1bWVudHNBbmRFZGl0b3JzID0gbmV3IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobnVsbCksIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRkb2N1bWVudHNBbmRFZGl0b3JzLiRhY2NlcHREb2N1bWVudHNBbmRFZGl0b3JzRGVsdGEoe1xuXHRcdFx0YWRkZWREb2N1bWVudHM6IFt7XG5cdFx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiAnZm9vJyxcblx0XHRcdFx0dXJpOiByZXNvdXJjZSxcblx0XHRcdFx0dmVyc2lvbklkOiAxLFxuXHRcdFx0XHRsaW5lczogWydmb28nXSxcblx0XHRcdFx0RU9MOiAnXFxuJyxcblx0XHRcdFx0ZW5jb2Rpbmc6ICd1dGY4J1xuXHRcdFx0fV1cblx0XHR9KTtcblx0XHRkb2N1bWVudHMgPSBuZXcgRXh0SG9zdERvY3VtZW50cyhTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG51bGwpLCBkb2N1bWVudHNBbmRFZGl0b3JzKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbm8gbGlzdGVuZXJzLCBubyBwcm9ibGVtJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnRpY2lwYW50ID0gbmV3IEV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudChudWxsTG9nU2VydmljZSwgZG9jdW1lbnRzLCBtYWluVGhyZWFkQnVsa0VkaXRzKTtcblx0XHRyZXR1cm4gcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKS50aGVuKCgpID0+IGFzc2VydC5vayh0cnVlKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnRpY2lwYW50ID0gbmV3IEV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudChudWxsTG9nU2VydmljZSwgZG9jdW1lbnRzLCBtYWluVGhyZWFkQnVsa0VkaXRzKTtcblxuXHRcdGxldCBldmVudDogdnNjb2RlLlRleHREb2N1bWVudFdpbGxTYXZlRXZlbnQ7XG5cdFx0Y29uc3Qgc3ViID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGUpIHtcblx0XHRcdGV2ZW50ID0gZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpLnRoZW4oKCkgPT4ge1xuXHRcdFx0c3ViLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5yZWFzb24sIFRleHREb2N1bWVudFNhdmVSZWFzb24uTWFudWFsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgZXZlbnQud2FpdFVudGlsLCAnZnVuY3Rpb24nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZGVsaXZlcnksIGltbXV0YWJsZScsICgpID0+IHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cyk7XG5cblx0XHRsZXQgZXZlbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnRXaWxsU2F2ZUV2ZW50O1xuXHRcdGNvbnN0IHN1YiA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChlKSB7XG5cdFx0XHRldmVudCA9IGU7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKS50aGVuKCgpID0+IHtcblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5vayhldmVudCk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4geyAoZXZlbnQuZG9jdW1lbnQgYXMgYW55KSA9IG51bGwhOyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZGVsaXZlcnksIGJhZCBsaXN0ZW5lcicsICgpID0+IHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cyk7XG5cblx0XHRjb25zdCBzdWIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdcdUQ4M0RcdURDODAnKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QsIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZGVsaXZlcnksIGJhZCBsaXN0ZW5lciBkb2VzblxcJ3QgcHJldmVudCBtb3JlIGV2ZW50cycsICgpID0+IHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cyk7XG5cblx0XHRjb25zdCBzdWIxID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignXHVEODNEXHVEQzgwJyk7XG5cdFx0fSk7XG5cdFx0bGV0IGV2ZW50OiB2c2NvZGUuVGV4dERvY3VtZW50V2lsbFNhdmVFdmVudDtcblx0XHRjb25zdCBzdWIyID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGUpIHtcblx0XHRcdGV2ZW50ID0gZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpLnRoZW4oKCkgPT4ge1xuXHRcdFx0c3ViMS5kaXNwb3NlKCk7XG5cdFx0XHRzdWIyLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZGVsaXZlcnksIGluIHN1YnNjcmliZXIgb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydGljaXBhbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KG51bGxMb2dTZXJ2aWNlLCBkb2N1bWVudHMsIG1haW5UaHJlYWRCdWxrRWRpdHMpO1xuXG5cdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IHN1YjEgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyKyssIDApO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3ViMiA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIrKywgMSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKS50aGVuKCgpID0+IHtcblx0XHRcdHN1YjEuZGlzcG9zZSgpO1xuXHRcdFx0c3ViMi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCBpZ25vcmUgYmFkIGxpc3RlbmVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cywgeyB0aW1lb3V0OiA1LCBlcnJvcnM6IDEgfSk7XG5cblx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRjb25zdCBzdWIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGNhbGxDb3VudCArPSAxO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdib29tJyk7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpO1xuXHRcdGF3YWl0IHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCk7XG5cdFx0YXdhaXQgcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKTtcblx0XHRhd2FpdCBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpO1xuXG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZGVsaXZlcnksIG92ZXJhbGwgdGltZW91dCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cywgeyB0aW1lb3V0OiAyMCwgZXJyb3JzOiA1IH0pO1xuXG5cdFx0Ly8gbGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0Y29uc3QgY2FsbHM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3Qgc3ViMSA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0Y2FsbHMucHVzaCgxKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN1YjIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGNhbGxzLnB1c2goMik7XG5cdFx0XHRldmVudC53YWl0VW50aWwodGltZW91dCgxMDApKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN1YjMgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGNhbGxzLnB1c2goMyk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCB2YWx1ZXMgPSBhd2FpdCBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpO1xuXHRcdHN1YjEuZGlzcG9zZSgpO1xuXHRcdHN1YjIuZGlzcG9zZSgpO1xuXHRcdHN1YjMuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxLCAyXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBkZWxpdmVyeSwgd2FpdFVudGlsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnRpY2lwYW50ID0gbmV3IEV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudChudWxsTG9nU2VydmljZSwgZG9jdW1lbnRzLCBtYWluVGhyZWFkQnVsa0VkaXRzKTtcblxuXHRcdGNvbnN0IHN1YiA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChldmVudCkge1xuXG5cdFx0XHRldmVudC53YWl0VW50aWwodGltZW91dCgxMCkpO1xuXHRcdFx0ZXZlbnQud2FpdFVudGlsKHRpbWVvdXQoMTApKTtcblx0XHRcdGV2ZW50LndhaXRVbnRpbCh0aW1lb3V0KDEwKSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKS50aGVuKCgpID0+IHtcblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZGVsaXZlcnksIHdhaXRVbnRpbCBtdXN0IGJlIGNhbGxlZCBzeW5jJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnRpY2lwYW50ID0gbmV3IEV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudChudWxsTG9nU2VydmljZSwgZG9jdW1lbnRzLCBtYWluVGhyZWFkQnVsa0VkaXRzKTtcblxuXHRcdGNvbnN0IHN1YiA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChldmVudCkge1xuXG5cdFx0XHRldmVudC53YWl0VW50aWwobmV3IFByb21pc2U8dW5kZWZpbmVkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGV2ZW50LndhaXRVbnRpbCh0aW1lb3V0KDEwKSkpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdHJlamVjdChlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSwgMTApO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCkudGhlbigoKSA9PiB7XG5cdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBkZWxpdmVyeSwgd2FpdFVudGlsIHdpbGwgdGltZW91dCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHBhcnRpY2lwYW50ID0gbmV3IEV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudChudWxsTG9nU2VydmljZSwgZG9jdW1lbnRzLCBtYWluVGhyZWFkQnVsa0VkaXRzLCB7IHRpbWVvdXQ6IDUsIGVycm9yczogMyB9KTtcblxuXHRcdGNvbnN0IHN1YiA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0ZXZlbnQud2FpdFVudGlsKHRpbWVvdXQoMTAwKSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRzdWIuZGlzcG9zZSgpO1xuXG5cdFx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWVzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCB3YWl0VW50aWwgZmFpbHVyZSBoYW5kbGluZycsICgpID0+IHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cyk7XG5cblx0XHRjb25zdCBzdWIxID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGUpIHtcblx0XHRcdGUud2FpdFVudGlsKFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignZGRkZCcpKSk7XG5cdFx0fSk7XG5cblx0XHRsZXQgZXZlbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnRXaWxsU2F2ZUV2ZW50O1xuXHRcdGNvbnN0IHN1YjIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZSkge1xuXHRcdFx0ZXZlbnQgPSBlO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCkudGhlbigoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQpO1xuXHRcdFx0c3ViMS5kaXNwb3NlKCk7XG5cdFx0XHRzdWIyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZGVsaXZlcnksIHB1c2hFZGl0cyBzeW5jJywgKCkgPT4ge1xuXG5cdFx0bGV0IGR0bzogSVdvcmtzcGFjZUVkaXREdG87XG5cdFx0Y29uc3QgcGFydGljaXBhbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KG51bGxMb2dTZXJ2aWNlLCBkb2N1bWVudHMsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGU+KCkge1xuXHRcdFx0JHRyeUFwcGx5V29ya3NwYWNlRWRpdChfZWRpdHM6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPElXb3Jrc3BhY2VFZGl0RHRvPikge1xuXHRcdFx0XHRkdG8gPSBfZWRpdHMudmFsdWU7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzdWIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZSkge1xuXHRcdFx0ZS53YWl0VW50aWwoUHJvbWlzZS5yZXNvbHZlKFtUZXh0RWRpdC5pbnNlcnQobmV3IFBvc2l0aW9uKDAsIDApLCAnYmFyJyldKSk7XG5cdFx0XHRlLndhaXRVbnRpbChQcm9taXNlLnJlc29sdmUoW1RleHRFZGl0LnNldEVuZE9mTGluZShFbmRPZkxpbmUuQ1JMRildKSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKS50aGVuKCgpID0+IHtcblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkdG8uZWRpdHMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5vaygoPElXb3Jrc3BhY2VUZXh0RWRpdER0bz5kdG8uZWRpdHNbMF0pLnRleHRFZGl0KTtcblx0XHRcdGFzc2VydC5vaygoPElXb3Jrc3BhY2VUZXh0RWRpdER0bz5kdG8uZWRpdHNbMV0pLnRleHRFZGl0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZGVsaXZlcnksIGNvbmN1cnJlbnQgY2hhbmdlJywgKCkgPT4ge1xuXG5cdFx0bGV0IGVkaXRzOiBJV29ya3NwYWNlRWRpdER0bztcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkVGV4dEVkaXRvcnNTaGFwZT4oKSB7XG5cdFx0XHQkdHJ5QXBwbHlXb3Jrc3BhY2VFZGl0KF9lZGl0czogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8SVdvcmtzcGFjZUVkaXREdG8+KSB7XG5cdFx0XHRcdGVkaXRzID0gX2VkaXRzLnZhbHVlO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3ViID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGUpIHtcblxuXHRcdFx0Ly8gY29uY3VycmVudCBjaGFuZ2UgZnJvbSBzb21ld2hlcmVcblx0XHRcdGRvY3VtZW50cy4kYWNjZXB0TW9kZWxDaGFuZ2VkKHJlc291cmNlLCB7XG5cdFx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH0sXG5cdFx0XHRcdFx0cmFuZ2VPZmZzZXQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdFx0cmFuZ2VMZW5ndGg6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdFx0dGV4dDogJ2Jhcidcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGVvbDogdW5kZWZpbmVkISxcblx0XHRcdFx0dmVyc2lvbklkOiAyLFxuXHRcdFx0XHRpc1JlZG9pbmc6IGZhbHNlLFxuXHRcdFx0XHRpc1VuZG9pbmc6IGZhbHNlLFxuXHRcdFx0XHRkZXRhaWxlZFJlYXNvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRpc0ZsdXNoOiBmYWxzZSxcblx0XHRcdFx0aXNFb2xDaGFuZ2U6IGZhbHNlLFxuXHRcdFx0fSwgdHJ1ZSk7XG5cblx0XHRcdGUud2FpdFVudGlsKFByb21pc2UucmVzb2x2ZShbVGV4dEVkaXQuaW5zZXJ0KG5ldyBQb3NpdGlvbigwLCAwKSwgJ2JhcicpXSkpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0c3ViLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlc1swXSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCB0d28gbGlzdGVuZXJzIC0+IHR3byBkb2N1bWVudCBzdGF0ZXMnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkVGV4dEVkaXRvcnNTaGFwZT4oKSB7XG5cdFx0XHQkdHJ5QXBwbHlXb3Jrc3BhY2VFZGl0KGR0bzogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8SVdvcmtzcGFjZUVkaXREdG8+KSB7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0IG9mIGR0by52YWx1ZS5lZGl0cykge1xuXG5cdFx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZSgoPElXb3Jrc3BhY2VUZXh0RWRpdER0bz5lZGl0KS5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0Y29uc3QgeyB0ZXh0LCByYW5nZSB9ID0gKDxJV29ya3NwYWNlVGV4dEVkaXREdG8+ZWRpdCkudGV4dEVkaXQ7XG5cdFx0XHRcdFx0ZG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQodXJpLCB7XG5cdFx0XHRcdFx0XHRjaGFuZ2VzOiBbe1xuXHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0dGV4dCxcblx0XHRcdFx0XHRcdFx0cmFuZ2VPZmZzZXQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdFx0XHRcdHJhbmdlTGVuZ3RoOiB1bmRlZmluZWQhLFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRlb2w6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdFx0XHR2ZXJzaW9uSWQ6IGRvY3VtZW50cy5nZXREb2N1bWVudERhdGEodXJpKSEudmVyc2lvbiArIDEsXG5cdFx0XHRcdFx0XHRpc1JlZG9pbmc6IGZhbHNlLFxuXHRcdFx0XHRcdFx0aXNVbmRvaW5nOiBmYWxzZSxcblx0XHRcdFx0XHRcdGRldGFpbGVkUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRpc0ZsdXNoOiBmYWxzZSxcblx0XHRcdFx0XHRcdGlzRW9sQ2hhbmdlOiBmYWxzZSxcblx0XHRcdFx0XHR9LCB0cnVlKTtcblx0XHRcdFx0XHQvLyB9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZG9jdW1lbnQgPSBkb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXG5cdFx0Y29uc3Qgc3ViMSA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChlKSB7XG5cdFx0XHQvLyB0aGUgZG9jdW1lbnQgc3RhdGUgd2Ugc3RhcnRlZCB3aXRoXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG9jdW1lbnQudmVyc2lvbiwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG9jdW1lbnQuZ2V0VGV4dCgpLCAnZm9vJyk7XG5cblx0XHRcdGUud2FpdFVudGlsKFByb21pc2UucmVzb2x2ZShbVGV4dEVkaXQuaW5zZXJ0KG5ldyBQb3NpdGlvbigwLCAwKSwgJ2JhcicpXSkpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3ViMiA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChlKSB7XG5cdFx0XHQvLyB0aGUgZG9jdW1lbnQgc3RhdGUgQUZURVIgdGhlIGZpcnN0IGxpc3RlbmVyIGtpY2tlZCBpblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvY3VtZW50LnZlcnNpb24sIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvY3VtZW50LmdldFRleHQoKSwgJ2JhcmZvbycpO1xuXG5cdFx0XHRlLndhaXRVbnRpbChQcm9taXNlLnJlc29sdmUoW1RleHRFZGl0Lmluc2VydChuZXcgUG9zaXRpb24oMCwgMCksICdiYXInKV0pKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdHN1YjEuZGlzcG9zZSgpO1xuXHRcdFx0c3ViMi5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIHRoZSBkb2N1bWVudCBzdGF0ZSBBRlRFUiBldmVudGluZyBpcyBkb25lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG9jdW1lbnQudmVyc2lvbiwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG9jdW1lbnQuZ2V0VGV4dCgpLCAnYmFyYmFyZm9vJyk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0dGVzdCgnTG9nIGZhaWxpbmcgbGlzdGVuZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGRpZExvZ1NvbWV0aGluZyA9IGZhbHNlO1xuXHRcdGNvbnN0IHBhcnRpY2lwYW50ID0gbmV3IEV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudChuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSBlcnJvcihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0XHRcdGRpZExvZ1NvbWV0aGluZyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSwgZG9jdW1lbnRzLCBtYWluVGhyZWFkQnVsa0VkaXRzKTtcblxuXG5cdFx0Y29uc3Qgc3ViID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignYm9vbScpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCkudGhlbigoKSA9PiB7XG5cdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZExvZ1NvbWV0aGluZywgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCLFVBQVUsVUFBVSxpQkFBaUI7QUFFdEUsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsK0NBQStDO0FBR3hELFNBQVMsUUFBUSxHQUFXO0FBQzNCLFNBQU8sSUFBSSxRQUFRLGFBQVcsV0FBVyxTQUFTLENBQUMsQ0FBQztBQUNyRDtBQUVBLE1BQU0sa0NBQWtDLE1BQU07QUFFN0MsUUFBTSxXQUFXLElBQUksTUFBTSxTQUFTO0FBQ3BDLFFBQU0sc0JBQXNCLElBQUksY0FBYyxLQUErQixFQUFFO0FBQUEsRUFBRTtBQUNqRixNQUFJO0FBQ0osUUFBTSxpQkFBaUIsSUFBSSxlQUFlO0FBRTFDLFFBQU0sTUFBTTtBQUNYLFVBQU0sc0JBQXNCLElBQUksMkJBQTJCLHVCQUF1QixJQUFJLEdBQUcsSUFBSSxlQUFlLENBQUM7QUFDN0csd0JBQW9CLGdDQUFnQztBQUFBLE1BQ25ELGdCQUFnQixDQUFDO0FBQUEsUUFDaEIsU0FBUztBQUFBLFFBQ1QsWUFBWTtBQUFBLFFBQ1osS0FBSztBQUFBLFFBQ0wsV0FBVztBQUFBLFFBQ1gsT0FBTyxDQUFDLEtBQUs7QUFBQSxRQUNiLEtBQUs7QUFBQSxRQUNMLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNGLENBQUM7QUFDRCxnQkFBWSxJQUFJLGlCQUFpQix1QkFBdUIsSUFBSSxHQUFHLG1CQUFtQjtBQUFBLEVBQ25G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
