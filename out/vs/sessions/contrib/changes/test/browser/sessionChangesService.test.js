import assert from "assert";
import { Event } from "../../../../../base/common/event.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { isResourceMultiDiffEditorInput } from "../../../../../workbench/common/editor.js";
import { MultiDiffEditorInput } from "../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js";
import { IWorkbenchLayoutService } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { TURN_CHANGES_CHANGESET_ID } from "../../../../services/sessions/common/session.js";
import { SessionChangesEditorInput } from "../../browser/sessionChangesEditorInput.js";
import { SessionChangesService } from "../../browser/sessionChangesService.js";
suite("SessionChangesService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("expands a revealed file in both Changes editor layouts", async () => {
    const originalUri = URI.file("/workspace/file.original.ts");
    const modifiedUri = URI.file("/workspace/file.ts");
    const otherItem = new class extends mock() {
      get originalUri() {
        return URI.file("/workspace/other.original.ts");
      }
      get modifiedUri() {
        return URI.file("/workspace/other.ts");
      }
    }();
    const targetItem = new class extends mock() {
      get originalUri() {
        return originalUri;
      }
      get modifiedUri() {
        return modifiedUri;
      }
    }();
    const expandedItems = [];
    const viewModel = new class extends mock() {
      constructor() {
        super(...arguments);
        this.items = constObservable([otherItem, targetItem]);
      }
      expand(item) {
        expandedItems.push(item);
      }
    }();
    const plainInput = Object.create(MultiDiffEditorInput.prototype);
    plainInput.getViewModel = async () => viewModel;
    const group = new class extends mock() {
    }();
    const options = {
      viewState: {
        revealData: {
          resource: { original: originalUri, modified: modifiedUri }
        }
      }
    };
    for (const isSinglePaneLayoutEnabled of [true, false]) {
      const layoutService = new class extends mock() {
        constructor() {
          super(...arguments);
          this.isSinglePaneLayoutEnabled = isSinglePaneLayoutEnabled;
          this.onDidChangePartVisibility = Event.None;
        }
        isVisible() {
          return true;
        }
      }();
      const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
        [IWorkbenchLayoutService, layoutService]
      )));
      instantiationService.stubInstance(MultiDiffEditorInput, {
        dispose: () => {
        },
        getViewModel: async () => viewModel
      });
      const editorService = new class extends mock() {
        async openEditor(...args) {
          const requestedInput = args[0];
          const input = requestedInput instanceof SessionChangesEditorInput ? disposables.add(requestedInput) : plainInput;
          return new class extends mock() {
            constructor() {
              super(...arguments);
              this.input = input;
              this.group = group;
            }
          }();
        }
      }();
      const service = new SessionChangesService(
        editorService,
        instantiationService,
        layoutService,
        new class extends mock() {
        }()
      );
      await service.openChangesEditor(URI.parse("test-session:/session"), options);
    }
    assert.deepStrictEqual(expandedItems.map((item) => item === targetItem ? "target" : "other"), ["target", "target"]);
  });
  test("selects the requested changeset before opening the editor", async () => {
    const selections = [];
    const opened = [];
    const editorService = new class extends mock() {
      async openEditor(...args) {
        const editor = args[0];
        if (isResourceMultiDiffEditorInput(editor)) {
          opened.push({
            multiDiffSource: editor.multiDiffSource?.toString() ?? "",
            preserveFocus: editor.options?.preserveFocus
          });
        }
        return void 0;
      }
    }();
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.isSinglePaneLayoutEnabled = false;
      }
    }();
    const changesViewService = new class extends mock() {
      setChangesetId(changesetId) {
        selections.push({ changesetId });
      }
      showChangeset(changeset) {
        selections.push({ transientChangesetId: changeset.id });
      }
    }();
    const service = new SessionChangesService(
      editorService,
      disposables.add(new TestInstantiationService()),
      layoutService,
      changesViewService
    );
    const sessionResource = URI.parse("agent-host:test-session");
    await service.openChangesEditor(sessionResource, {
      changesetSelection: { kind: "id", id: TURN_CHANGES_CHANGESET_ID },
      preserveFocus: true
    });
    await service.openChangesEditor(sessionResource, { changesetSelection: { kind: "id", id: void 0 } });
    await service.openChangesEditor(sessionResource, {
      changesetSelection: { kind: "transient", changeset: upcastPartial({ id: "turn:request" }) }
    });
    assert.deepStrictEqual({ selections, opened }, {
      selections: [
        { changesetId: TURN_CHANGES_CHANGESET_ID },
        { changesetId: void 0 },
        { transientChangesetId: "turn:request" }
      ],
      opened: [
        {
          multiDiffSource: "changes-multi-diff-source:?%7B%22sessionResource%22%3A%22agent-host%3Atest-session%22%7D",
          preserveFocus: true
        },
        {
          multiDiffSource: "changes-multi-diff-source:?%7B%22sessionResource%22%3A%22agent-host%3Atest-session%22%7D",
          preserveFocus: void 0
        },
        {
          multiDiffSource: "changes-multi-diff-source:?%7B%22sessionResource%22%3A%22agent-host%3Atest-session%22%7D",
          preserveFocus: void 0
        }
      ]
    });
  });
  test("selects the requested changeset in the single-pane layout", async () => {
    const selections = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IWorkbenchLayoutService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangePartVisibility = Event.None;
      }
      isVisible() {
        return true;
      }
    }());
    const editorService = new class extends mock() {
      async openEditor(...args) {
        const editor = args[0];
        if (editor instanceof SessionChangesEditorInput) {
          disposables.add(editor);
        }
        return void 0;
      }
    }();
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.isSinglePaneLayoutEnabled = true;
      }
    }();
    const changesViewService = new class extends mock() {
      showChangeset(changeset) {
        selections.push(changeset.id);
      }
    }();
    const service = new SessionChangesService(editorService, instantiationService, layoutService, changesViewService);
    await service.openChangesEditor(URI.parse("agent-host:test-session"), {
      changesetSelection: { kind: "transient", changeset: upcastPartial({ id: "turn:request" }) }
    });
    assert.deepStrictEqual(selections, ["turn:request"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcdGVzdFxcYnJvd3Nlclxcc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2ssIHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudERpZmZJdGVtVmlld01vZGVsLCBNdWx0aURpZmZFZGl0b3JWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvclZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTXVsdGlEaWZmRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvbXVsdGlEaWZmRWRpdG9yV2lkZ2V0SW1wbC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElUZXh0RGlmZkVkaXRvclBhbmUsIGlzUmVzb3VyY2VNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvbXVsdGlEaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgSVNlc3Npb25DaGFuZ2VzZXQsIFRVUk5fQ0hBTkdFU19DSEFOR0VTRVRfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ2hhbmdlc0VkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uQ2hhbmdlc0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNlc3Npb25DaGFuZ2VzU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1Nlc3Npb25DaGFuZ2VzU2VydmljZScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdleHBhbmRzIGEgcmV2ZWFsZWQgZmlsZSBpbiBib3RoIENoYW5nZXMgZWRpdG9yIGxheW91dHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLm9yaWdpbmFsLnRzJyk7XG5cdFx0Y29uc3QgbW9kaWZpZWRVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0Y29uc3Qgb3RoZXJJdGVtID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxEb2N1bWVudERpZmZJdGVtVmlld01vZGVsPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldCBvcmlnaW5hbFVyaSgpIHsgcmV0dXJuIFVSSS5maWxlKCcvd29ya3NwYWNlL290aGVyLm9yaWdpbmFsLnRzJyk7IH1cblx0XHRcdG92ZXJyaWRlIGdldCBtb2RpZmllZFVyaSgpIHsgcmV0dXJuIFVSSS5maWxlKCcvd29ya3NwYWNlL290aGVyLnRzJyk7IH1cblx0XHR9KCk7XG5cdFx0Y29uc3QgdGFyZ2V0SXRlbSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8RG9jdW1lbnREaWZmSXRlbVZpZXdNb2RlbD4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXQgb3JpZ2luYWxVcmkoKSB7IHJldHVybiBvcmlnaW5hbFVyaTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0IG1vZGlmaWVkVXJpKCkgeyByZXR1cm4gbW9kaWZpZWRVcmk7IH1cblx0XHR9KCk7XG5cdFx0Y29uc3QgZXhwYW5kZWRJdGVtczogRG9jdW1lbnREaWZmSXRlbVZpZXdNb2RlbFtdID0gW107XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNdWx0aURpZmZFZGl0b3JWaWV3TW9kZWw+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXRlbXMgPSBjb25zdE9ic2VydmFibGUoW290aGVySXRlbSwgdGFyZ2V0SXRlbV0pO1xuXHRcdFx0b3ZlcnJpZGUgZXhwYW5kKGl0ZW06IERvY3VtZW50RGlmZkl0ZW1WaWV3TW9kZWwpOiB2b2lkIHtcblx0XHRcdFx0ZXhwYW5kZWRJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH0oKTtcblx0XHRjb25zdCBwbGFpbklucHV0ID0gT2JqZWN0LmNyZWF0ZShNdWx0aURpZmZFZGl0b3JJbnB1dC5wcm90b3R5cGUpIGFzIE11bHRpRGlmZkVkaXRvcklucHV0O1xuXHRcdHBsYWluSW5wdXQuZ2V0Vmlld01vZGVsID0gYXN5bmMgKCkgPT4gdmlld01vZGVsO1xuXHRcdGNvbnN0IGdyb3VwID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yR3JvdXA+KCkgeyB9KCk7XG5cdFx0Y29uc3Qgb3B0aW9uczogSU11bHRpRGlmZkVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHR2aWV3U3RhdGU6IHtcblx0XHRcdFx0cmV2ZWFsRGF0YToge1xuXHRcdFx0XHRcdHJlc291cmNlOiB7IG9yaWdpbmFsOiBvcmlnaW5hbFVyaSwgbW9kaWZpZWQ6IG1vZGlmaWVkVXJpIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IGlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQgb2YgW3RydWUsIGZhbHNlXSkge1xuXHRcdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzU2luZ2xlUGFuZUxheW91dEVuYWJsZWQgPSBpc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgaXNWaXNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0fSgpO1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRcdFtJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgbGF5b3V0U2VydmljZV0sXG5cdFx0XHQpKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViSW5zdGFuY2UoTXVsdGlEaWZmRWRpdG9ySW5wdXQsIHtcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHRnZXRWaWV3TW9kZWw6IGFzeW5jICgpID0+IHZpZXdNb2RlbCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuRWRpdG9yKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8SVRleHREaWZmRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RlZElucHV0ID0gYXJnc1swXTtcblx0XHRcdFx0XHRjb25zdCBpbnB1dCA9IHJlcXVlc3RlZElucHV0IGluc3RhbmNlb2YgU2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dFxuXHRcdFx0XHRcdFx0PyBkaXNwb3NhYmxlcy5hZGQocmVxdWVzdGVkSW5wdXQpXG5cdFx0XHRcdFx0XHQ6IHBsYWluSW5wdXQ7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHREaWZmRWRpdG9yUGFuZT4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpbnB1dCA9IGlucHV0O1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZ3JvdXAgPSBncm91cDtcblx0XHRcdFx0XHR9KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0oKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlKFxuXHRcdFx0XHRlZGl0b3JTZXJ2aWNlLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFx0bGF5b3V0U2VydmljZSxcblx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhbmdlc1ZpZXdTZXJ2aWNlPigpIHsgfSxcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2Uub3BlbkNoYW5nZXNFZGl0b3IoVVJJLnBhcnNlKCd0ZXN0LXNlc3Npb246L3Nlc3Npb24nKSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHBhbmRlZEl0ZW1zLm1hcChpdGVtID0+IGl0ZW0gPT09IHRhcmdldEl0ZW0gPyAndGFyZ2V0JyA6ICdvdGhlcicpLCBbJ3RhcmdldCcsICd0YXJnZXQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdHMgdGhlIHJlcXVlc3RlZCBjaGFuZ2VzZXQgYmVmb3JlIG9wZW5pbmcgdGhlIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZWxlY3Rpb25zOiBvYmplY3RbXSA9IFtdO1xuXHRcdGNvbnN0IG9wZW5lZDogeyByZWFkb25seSBtdWx0aURpZmZTb3VyY2U6IHN0cmluZzsgcmVhZG9ubHkgcHJlc2VydmVGb2N1czogYm9vbGVhbiB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuRWRpdG9yKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGFyZ3NbMF07XG5cdFx0XHRcdGlmIChpc1Jlc291cmNlTXVsdGlEaWZmRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0XHRcdG9wZW5lZC5wdXNoKHtcblx0XHRcdFx0XHRcdG11bHRpRGlmZlNvdXJjZTogZWRpdG9yLm11bHRpRGlmZlNvdXJjZT8udG9TdHJpbmcoKSA/PyAnJyxcblx0XHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IGVkaXRvci5vcHRpb25zPy5wcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZCA9IGZhbHNlO1xuXHRcdH0oKTtcblx0XHRjb25zdCBjaGFuZ2VzVmlld1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGFuZ2VzVmlld1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgc2V0Q2hhbmdlc2V0SWQoY2hhbmdlc2V0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdFx0XHRzZWxlY3Rpb25zLnB1c2goeyBjaGFuZ2VzZXRJZCB9KTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIHNob3dDaGFuZ2VzZXQoY2hhbmdlc2V0OiBJU2Vzc2lvbkNoYW5nZXNldCk6IHZvaWQge1xuXHRcdFx0XHRzZWxlY3Rpb25zLnB1c2goeyB0cmFuc2llbnRDaGFuZ2VzZXRJZDogY2hhbmdlc2V0LmlkIH0pO1xuXHRcdFx0fVxuXHRcdH0oKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFNlc3Npb25DaGFuZ2VzU2VydmljZShcblx0XHRcdGVkaXRvclNlcnZpY2UsXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKSxcblx0XHRcdGxheW91dFNlcnZpY2UsXG5cdFx0XHRjaGFuZ2VzVmlld1NlcnZpY2UsXG5cdFx0KTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3Q6dGVzdC1zZXNzaW9uJyk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5DaGFuZ2VzRWRpdG9yKHNlc3Npb25SZXNvdXJjZSwge1xuXHRcdFx0Y2hhbmdlc2V0U2VsZWN0aW9uOiB7IGtpbmQ6ICdpZCcsIGlkOiBUVVJOX0NIQU5HRVNfQ0hBTkdFU0VUX0lEIH0sXG5cdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2Uub3BlbkNoYW5nZXNFZGl0b3Ioc2Vzc2lvblJlc291cmNlLCB7IGNoYW5nZXNldFNlbGVjdGlvbjogeyBraW5kOiAnaWQnLCBpZDogdW5kZWZpbmVkIH0gfSk7XG5cdFx0YXdhaXQgc2VydmljZS5vcGVuQ2hhbmdlc0VkaXRvcihzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdGNoYW5nZXNldFNlbGVjdGlvbjogeyBraW5kOiAndHJhbnNpZW50JywgY2hhbmdlc2V0OiB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uQ2hhbmdlc2V0Pih7IGlkOiAndHVybjpyZXF1ZXN0JyB9KSB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHNlbGVjdGlvbnMsIG9wZW5lZCB9LCB7XG5cdFx0XHRzZWxlY3Rpb25zOiBbXG5cdFx0XHRcdHsgY2hhbmdlc2V0SWQ6IFRVUk5fQ0hBTkdFU19DSEFOR0VTRVRfSUQgfSxcblx0XHRcdFx0eyBjaGFuZ2VzZXRJZDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsgdHJhbnNpZW50Q2hhbmdlc2V0SWQ6ICd0dXJuOnJlcXVlc3QnIH0sXG5cdFx0XHRdLFxuXHRcdFx0b3BlbmVkOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtdWx0aURpZmZTb3VyY2U6ICdjaGFuZ2VzLW11bHRpLWRpZmYtc291cmNlOj8lN0IlMjJzZXNzaW9uUmVzb3VyY2UlMjIlM0ElMjJhZ2VudC1ob3N0JTNBdGVzdC1zZXNzaW9uJTIyJTdEJyxcblx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bXVsdGlEaWZmU291cmNlOiAnY2hhbmdlcy1tdWx0aS1kaWZmLXNvdXJjZTo/JTdCJTIyc2Vzc2lvblJlc291cmNlJTIyJTNBJTIyYWdlbnQtaG9zdCUzQXRlc3Qtc2Vzc2lvbiUyMiU3RCcsXG5cdFx0XHRcdFx0cHJlc2VydmVGb2N1czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bXVsdGlEaWZmU291cmNlOiAnY2hhbmdlcy1tdWx0aS1kaWZmLXNvdXJjZTo/JTdCJTIyc2Vzc2lvblJlc291cmNlJTIyJTNBJTIyYWdlbnQtaG9zdCUzQXRlc3Qtc2Vzc2lvbiUyMiU3RCcsXG5cdFx0XHRcdFx0cHJlc2VydmVGb2N1czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0cyB0aGUgcmVxdWVzdGVkIGNoYW5nZXNldCBpbiB0aGUgc2luZ2xlLXBhbmUgbGF5b3V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgaXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuRWRpdG9yKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IGFyZ3NbMF07XG5cdFx0XHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBTZXNzaW9uQ2hhbmdlc0VkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVkaXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBpc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkID0gdHJ1ZTtcblx0XHR9KCk7XG5cdFx0Y29uc3QgY2hhbmdlc1ZpZXdTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhbmdlc1ZpZXdTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHNob3dDaGFuZ2VzZXQoY2hhbmdlc2V0OiBJU2Vzc2lvbkNoYW5nZXNldCk6IHZvaWQge1xuXHRcdFx0XHRzZWxlY3Rpb25zLnB1c2goY2hhbmdlc2V0LmlkKTtcblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBTZXNzaW9uQ2hhbmdlc1NlcnZpY2UoZWRpdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGxheW91dFNlcnZpY2UsIGNoYW5nZXNWaWV3U2VydmljZSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm9wZW5DaGFuZ2VzRWRpdG9yKFVSSS5wYXJzZSgnYWdlbnQtaG9zdDp0ZXN0LXNlc3Npb24nKSwge1xuXHRcdFx0Y2hhbmdlc2V0U2VsZWN0aW9uOiB7IGtpbmQ6ICd0cmFuc2llbnQnLCBjaGFuZ2VzZXQ6IHVwY2FzdFBhcnRpYWw8SVNlc3Npb25DaGFuZ2VzZXQ+KHsgaWQ6ICd0dXJuOnJlcXVlc3QnIH0pIH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWxlY3Rpb25zLCBbJ3R1cm46cmVxdWVzdCddKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6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
