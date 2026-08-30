import assert from "assert";
import { toAction } from "../../../../../../../base/common/actions.js";
import { Disposable, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import { IChatResponseFileChangesService } from "../../../../browser/chatResponseFileChangesService.js";
import { ChatCheckpointFileChangesSummaryContentPart, renderChangesSummaryFileList } from "../../../../browser/widget/chatContentParts/chatChangesSummaryPart.js";
import { ChatCollapsibleContentPart } from "../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js";
import { emptySessionEntryDiff } from "../../../../common/editing/chatEditingService.js";
suite("ChatCheckpointFileChangesSummaryContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("updates visibility and aggregate counts when file changes arrive", () => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    const diffs = observableValue("testFileChanges", []);
    instantiationService.stub(IChatResponseFileChangesService, {
      _serviceBrand: void 0,
      registerProvider: () => Disposable.None,
      getChangesForRequest: () => diffs
    });
    const content = {
      kind: "changesSummary",
      requestId: "request",
      sessionResource: URI.parse("chat-session://test/session")
    };
    const part = store.add(instantiationService.createInstance(
      ChatCheckpointFileChangesSummaryContentPart,
      content,
      {}
    ));
    const readState = () => ({
      display: part.domNode.style.display,
      files: part.domNode.querySelector(".chat-file-changes-label")?.textContent,
      additions: part.domNode.querySelector(".insertions")?.textContent,
      deletions: part.domNode.querySelector(".deletions")?.textContent,
      headerOrder: Array.from(part.domNode.querySelector("summary")?.children ?? []).map((element) => element.classList.item(0))
    });
    const states = [readState()];
    diffs.set([
      { ...emptySessionEntryDiff(URI.file("/file1.ts"), URI.file("/file1.ts")), added: 5, removed: 2 },
      { ...emptySessionEntryDiff(URI.file("/file2.ts"), URI.file("/file2.ts")), added: 3, removed: 1 }
    ], void 0);
    states.push(readState());
    assert.deepStrictEqual(states, [
      {
        display: "none",
        files: "0 files changed",
        additions: "+0",
        deletions: "-0",
        headerOrder: ["chat-file-changes-label", "chat-file-changes-counts", "chat-view-changes-icon", "chat-file-changes-chevron"]
      },
      {
        display: "",
        files: "2 files changed",
        additions: "+8",
        deletions: "-3",
        headerOrder: ["chat-file-changes-label", "chat-file-changes-counts", "chat-view-changes-icon", "chat-file-changes-chevron"]
      }
    ]);
  });
  test("signals user toggles and rotates the disclosure chevron", () => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    instantiationService.stub(IChatResponseFileChangesService, {
      _serviceBrand: void 0,
      registerProvider: () => Disposable.None,
      getChangesForRequest: () => observableValue("testFileChanges", [
        emptySessionEntryDiff(URI.file("/file.ts"), URI.file("/file.ts"))
      ])
    });
    const part = store.add(instantiationService.createInstance(
      ChatCheckpointFileChangesSummaryContentPart,
      {
        kind: "changesSummary",
        requestId: "request",
        sessionResource: URI.parse("chat-session://test/session")
      },
      {}
    ));
    let toggleCount = 0;
    const listener = () => toggleCount++;
    part.domNode.addEventListener(ChatCollapsibleContentPart.userToggleEvent, listener);
    store.add(toDisposable(() => part.domNode.removeEventListener(ChatCollapsibleContentPart.userToggleEvent, listener)));
    const header = part.domNode.querySelector("summary");
    const details = part.domNode.querySelector("details");
    const chevron = part.domNode.querySelector(".chat-file-changes-chevron");
    assert.ok(header);
    assert.ok(details);
    assert.ok(chevron);
    header.click();
    details.dispatchEvent(new Event("toggle"));
    assert.deepStrictEqual({
      open: details.open,
      expandedChevron: chevron.classList.contains("expanded"),
      toggleCount
    }, {
      open: true,
      expandedChevron: true,
      toggleCount: 1
    });
  });
  test("renders row actions before aligned change count columns", () => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    const container = document.createElement("div");
    const diffs = observableValue("testFileChanges", [
      { ...emptySessionEntryDiff(URI.file("/file.md"), URI.file("/file.md")), added: 5, removed: 2 },
      { ...emptySessionEntryDiff(URI.file("/other.md"), URI.file("/other.md")), added: 123, removed: 45 }
    ]);
    const [editorService, configurationService] = instantiationService.invokeFunction((accessor) => [
      accessor.get(IEditorService),
      accessor.get(IConfigurationService)
    ]);
    store.add(renderChangesSummaryFileList(container, diffs, instantiationService, editorService, configurationService, {
      getRowActions: () => [toAction({ id: "preview", label: "Preview", run: () => void 0 })]
    }));
    const rows = Array.from(container.querySelectorAll(".chat-summary-list-row-with-actions"));
    assert.deepStrictEqual({
      rowOrder: rows.map((row) => Array.from(row.children).map((element) => element.classList.item(0))),
      counts: rows.map((row) => Array.from(row.querySelectorAll(".insertions, .deletions")).map((element) => element.textContent)),
      columnWidths: rows.map((row) => Array.from(row.querySelectorAll(".insertions, .deletions")).map((element) => element.style.width))
    }, {
      rowOrder: [
        ["monaco-icon-label", "chat-summary-list-actions", "insertions-and-deletions"],
        ["monaco-icon-label", "chat-summary-list-actions", "insertions-and-deletions"]
      ],
      counts: [
        ["+5", "-2"],
        ["+123", "-45"]
      ],
      columnWidths: [
        ["4ch", "3ch"],
        ["4ch", "3ch"]
      ]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdENoYW5nZXNTdW1tYXJ5UGFydC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2NoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q2hlY2twb2ludEZpbGVDaGFuZ2VzU3VtbWFyeUNvbnRlbnRQYXJ0LCByZW5kZXJDaGFuZ2VzU3VtbWFyeUZpbGVMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q2hhbmdlc1N1bW1hcnlQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29sbGFwc2libGVDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBlbXB0eVNlc3Npb25FbnRyeURpZmYsIElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENoYW5nZXNTdW1tYXJ5UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcblxuc3VpdGUoJ0NoYXRDaGVja3BvaW50RmlsZUNoYW5nZXNTdW1tYXJ5Q29udGVudFBhcnQnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndXBkYXRlcyB2aXNpYmlsaXR5IGFuZCBhZ2dyZWdhdGUgY291bnRzIHdoZW4gZmlsZSBjaGFuZ2VzIGFycml2ZScsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGNvbnN0IGRpZmZzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdPigndGVzdEZpbGVDaGFuZ2VzJywgW10pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVnaXN0ZXJQcm92aWRlcjogKCkgPT4gRGlzcG9zYWJsZS5Ob25lLFxuXHRcdFx0Z2V0Q2hhbmdlc0ZvclJlcXVlc3Q6ICgpID0+IGRpZmZzLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29udGVudDogSUNoYXRDaGFuZ2VzU3VtbWFyeVBhcnQgPSB7XG5cdFx0XHRraW5kOiAnY2hhbmdlc1N1bW1hcnknLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdCcsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uJyksXG5cdFx0fTtcblx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdENoZWNrcG9pbnRGaWxlQ2hhbmdlc1N1bW1hcnlDb250ZW50UGFydCxcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHR7fSBhcyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHQpKTtcblxuXHRcdGNvbnN0IHJlYWRTdGF0ZSA9ICgpID0+ICh7XG5cdFx0XHRkaXNwbGF5OiBwYXJ0LmRvbU5vZGUuc3R5bGUuZGlzcGxheSxcblx0XHRcdGZpbGVzOiBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtZmlsZS1jaGFuZ2VzLWxhYmVsJyk/LnRleHRDb250ZW50LFxuXHRcdFx0YWRkaXRpb25zOiBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmluc2VydGlvbnMnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRkZWxldGlvbnM6IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuZGVsZXRpb25zJyk/LnRleHRDb250ZW50LFxuXHRcdFx0aGVhZGVyT3JkZXI6IEFycmF5LmZyb20ocGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJ3N1bW1hcnknKT8uY2hpbGRyZW4gPz8gW10pLm1hcChlbGVtZW50ID0+IGVsZW1lbnQuY2xhc3NMaXN0Lml0ZW0oMCkpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN0YXRlcyA9IFtyZWFkU3RhdGUoKV07XG5cblx0XHRkaWZmcy5zZXQoW1xuXHRcdFx0eyAuLi5lbXB0eVNlc3Npb25FbnRyeURpZmYoVVJJLmZpbGUoJy9maWxlMS50cycpLCBVUkkuZmlsZSgnL2ZpbGUxLnRzJykpLCBhZGRlZDogNSwgcmVtb3ZlZDogMiB9LFxuXHRcdFx0eyAuLi5lbXB0eVNlc3Npb25FbnRyeURpZmYoVVJJLmZpbGUoJy9maWxlMi50cycpLCBVUkkuZmlsZSgnL2ZpbGUyLnRzJykpLCBhZGRlZDogMywgcmVtb3ZlZDogMSB9LFxuXHRcdF0sIHVuZGVmaW5lZCk7XG5cdFx0c3RhdGVzLnB1c2gocmVhZFN0YXRlKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZXMsIFtcblx0XHRcdHtcblx0XHRcdFx0ZGlzcGxheTogJ25vbmUnLFxuXHRcdFx0XHRmaWxlczogJzAgZmlsZXMgY2hhbmdlZCcsXG5cdFx0XHRcdGFkZGl0aW9uczogJyswJyxcblx0XHRcdFx0ZGVsZXRpb25zOiAnLTAnLFxuXHRcdFx0XHRoZWFkZXJPcmRlcjogWydjaGF0LWZpbGUtY2hhbmdlcy1sYWJlbCcsICdjaGF0LWZpbGUtY2hhbmdlcy1jb3VudHMnLCAnY2hhdC12aWV3LWNoYW5nZXMtaWNvbicsICdjaGF0LWZpbGUtY2hhbmdlcy1jaGV2cm9uJ10sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRkaXNwbGF5OiAnJyxcblx0XHRcdFx0ZmlsZXM6ICcyIGZpbGVzIGNoYW5nZWQnLFxuXHRcdFx0XHRhZGRpdGlvbnM6ICcrOCcsXG5cdFx0XHRcdGRlbGV0aW9uczogJy0zJyxcblx0XHRcdFx0aGVhZGVyT3JkZXI6IFsnY2hhdC1maWxlLWNoYW5nZXMtbGFiZWwnLCAnY2hhdC1maWxlLWNoYW5nZXMtY291bnRzJywgJ2NoYXQtdmlldy1jaGFuZ2VzLWljb24nLCAnY2hhdC1maWxlLWNoYW5nZXMtY2hldnJvbiddLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2lnbmFscyB1c2VyIHRvZ2dsZXMgYW5kIHJvdGF0ZXMgdGhlIGRpc2Nsb3N1cmUgY2hldnJvbicsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVnaXN0ZXJQcm92aWRlcjogKCkgPT4gRGlzcG9zYWJsZS5Ob25lLFxuXHRcdFx0Z2V0Q2hhbmdlc0ZvclJlcXVlc3Q6ICgpID0+IG9ic2VydmFibGVWYWx1ZSgndGVzdEZpbGVDaGFuZ2VzJywgW1xuXHRcdFx0XHRlbXB0eVNlc3Npb25FbnRyeURpZmYoVVJJLmZpbGUoJy9maWxlLnRzJyksIFVSSS5maWxlKCcvZmlsZS50cycpKVxuXHRcdFx0XSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRDaGVja3BvaW50RmlsZUNoYW5nZXNTdW1tYXJ5Q29udGVudFBhcnQsXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdjaGFuZ2VzU3VtbWFyeScsXG5cdFx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uJyksXG5cdFx0XHR9LFxuXHRcdFx0e30gYXMgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0KSk7XG5cdFx0bGV0IHRvZ2dsZUNvdW50ID0gMDtcblx0XHRjb25zdCBsaXN0ZW5lciA9ICgpID0+IHRvZ2dsZUNvdW50Kys7XG5cdFx0cGFydC5kb21Ob2RlLmFkZEV2ZW50TGlzdGVuZXIoQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCBsaXN0ZW5lcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihDaGF0Q29sbGFwc2libGVDb250ZW50UGFydC51c2VyVG9nZ2xlRXZlbnQsIGxpc3RlbmVyKSkpO1xuXG5cdFx0Y29uc3QgaGVhZGVyID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdzdW1tYXJ5Jyk7XG5cdFx0Y29uc3QgZGV0YWlscyA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxEZXRhaWxzRWxlbWVudD4oJ2RldGFpbHMnKTtcblx0XHRjb25zdCBjaGV2cm9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWZpbGUtY2hhbmdlcy1jaGV2cm9uJyk7XG5cdFx0YXNzZXJ0Lm9rKGhlYWRlcik7XG5cdFx0YXNzZXJ0Lm9rKGRldGFpbHMpO1xuXHRcdGFzc2VydC5vayhjaGV2cm9uKTtcblx0XHRoZWFkZXIuY2xpY2soKTtcblx0XHRkZXRhaWxzLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCd0b2dnbGUnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG9wZW46IGRldGFpbHMub3Blbixcblx0XHRcdGV4cGFuZGVkQ2hldnJvbjogY2hldnJvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJyksXG5cdFx0XHR0b2dnbGVDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRvcGVuOiB0cnVlLFxuXHRcdFx0ZXhwYW5kZWRDaGV2cm9uOiB0cnVlLFxuXHRcdFx0dG9nZ2xlQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgcm93IGFjdGlvbnMgYmVmb3JlIGFsaWduZWQgY2hhbmdlIGNvdW50IGNvbHVtbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHQvLyBEaWZmZXJlbnQgZGlnaXQgbGVuZ3RocyBleHBvc2UgcGVyLXJvdyBzaXppbmcgcmVncmVzc2lvbnMuXG5cdFx0Y29uc3QgZGlmZnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUVkaXRTZXNzaW9uRW50cnlEaWZmW10+KCd0ZXN0RmlsZUNoYW5nZXMnLCBbXG5cdFx0XHR7IC4uLmVtcHR5U2Vzc2lvbkVudHJ5RGlmZihVUkkuZmlsZSgnL2ZpbGUubWQnKSwgVVJJLmZpbGUoJy9maWxlLm1kJykpLCBhZGRlZDogNSwgcmVtb3ZlZDogMiB9LFxuXHRcdFx0eyAuLi5lbXB0eVNlc3Npb25FbnRyeURpZmYoVVJJLmZpbGUoJy9vdGhlci5tZCcpLCBVUkkuZmlsZSgnL290aGVyLm1kJykpLCBhZGRlZDogMTIzLCByZW1vdmVkOiA0NSB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IFtlZGl0b3JTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZV0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBbXG5cdFx0XHRhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLFxuXHRcdFx0YWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSksXG5cdFx0XSBhcyBjb25zdCk7XG5cdFx0c3RvcmUuYWRkKHJlbmRlckNoYW5nZXNTdW1tYXJ5RmlsZUxpc3QoY29udGFpbmVyLCBkaWZmcywgaW5zdGFudGlhdGlvblNlcnZpY2UsIGVkaXRvclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRnZXRSb3dBY3Rpb25zOiAoKSA9PiBbdG9BY3Rpb24oeyBpZDogJ3ByZXZpZXcnLCBsYWJlbDogJ1ByZXZpZXcnLCBydW46ICgpID0+IHVuZGVmaW5lZCB9KV0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgcm93cyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXN1bW1hcnktbGlzdC1yb3ctd2l0aC1hY3Rpb25zJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cm93T3JkZXI6IHJvd3MubWFwKHJvdyA9PiBBcnJheS5mcm9tKHJvdy5jaGlsZHJlbikubWFwKGVsZW1lbnQgPT4gZWxlbWVudC5jbGFzc0xpc3QuaXRlbSgwKSkpLFxuXHRcdFx0Y291bnRzOiByb3dzLm1hcChyb3cgPT4gQXJyYXkuZnJvbShyb3cucXVlcnlTZWxlY3RvckFsbCgnLmluc2VydGlvbnMsIC5kZWxldGlvbnMnKSkubWFwKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCkpLFxuXHRcdFx0Y29sdW1uV2lkdGhzOiByb3dzLm1hcChyb3cgPT4gQXJyYXkuZnJvbShyb3cucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5pbnNlcnRpb25zLCAuZGVsZXRpb25zJykpLm1hcChlbGVtZW50ID0+IGVsZW1lbnQuc3R5bGUud2lkdGgpKSxcblx0XHR9LCB7XG5cdFx0XHRyb3dPcmRlcjogW1xuXHRcdFx0XHRbJ21vbmFjby1pY29uLWxhYmVsJywgJ2NoYXQtc3VtbWFyeS1saXN0LWFjdGlvbnMnLCAnaW5zZXJ0aW9ucy1hbmQtZGVsZXRpb25zJ10sXG5cdFx0XHRcdFsnbW9uYWNvLWljb24tbGFiZWwnLCAnY2hhdC1zdW1tYXJ5LWxpc3QtYWN0aW9ucycsICdpbnNlcnRpb25zLWFuZC1kZWxldGlvbnMnXSxcblx0XHRcdF0sXG5cdFx0XHRjb3VudHM6IFtcblx0XHRcdFx0WycrNScsICctMiddLFxuXHRcdFx0XHRbJysxMjMnLCAnLTQ1J10sXG5cdFx0XHRdLFxuXHRcdFx0Y29sdW1uV2lkdGhzOiBbXG5cdFx0XHRcdFsnNGNoJywgJzNjaCddLFxuXHRcdFx0XHRbJzRjaCcsICczY2gnXSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FB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
