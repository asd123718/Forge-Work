import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestDialogService } from "../../../dialogs/test/common/testDialogService.js";
import { TestNotificationService } from "../../../notification/test/common/testNotificationService.js";
import { UndoRedoElementType, UndoRedoGroup } from "../../common/undoRedo.js";
import { UndoRedoService } from "../../common/undoRedoService.js";
suite("UndoRedoService", () => {
  function createUndoRedoService(dialogService = new TestDialogService()) {
    const notificationService = new TestNotificationService();
    return new UndoRedoService(dialogService, notificationService);
  }
  test("simple single resource elements", () => {
    const resource = URI.file("test.txt");
    const service = createUndoRedoService();
    assert.strictEqual(service.canUndo(resource), false);
    assert.strictEqual(service.canRedo(resource), false);
    assert.strictEqual(service.hasElements(resource), false);
    assert.ok(service.getLastElement(resource) === null);
    let undoCall1 = 0;
    let redoCall1 = 0;
    const element1 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 1",
      code: "typing",
      undo: () => {
        undoCall1++;
      },
      redo: () => {
        redoCall1++;
      }
    };
    service.pushElement(element1);
    assert.strictEqual(undoCall1, 0);
    assert.strictEqual(redoCall1, 0);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), false);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === element1);
    service.undo(resource);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 0);
    assert.strictEqual(service.canUndo(resource), false);
    assert.strictEqual(service.canRedo(resource), true);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === null);
    service.redo(resource);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), false);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === element1);
    let undoCall2 = 0;
    let redoCall2 = 0;
    const element2 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 2",
      code: "typing",
      undo: () => {
        undoCall2++;
      },
      redo: () => {
        redoCall2++;
      }
    };
    service.pushElement(element2);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(undoCall2, 0);
    assert.strictEqual(redoCall2, 0);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), false);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === element2);
    service.undo(resource);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(undoCall2, 1);
    assert.strictEqual(redoCall2, 0);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), true);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === null);
    let undoCall3 = 0;
    let redoCall3 = 0;
    const element3 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 2",
      code: "typing",
      undo: () => {
        undoCall3++;
      },
      redo: () => {
        redoCall3++;
      }
    };
    service.pushElement(element3);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(undoCall2, 1);
    assert.strictEqual(redoCall2, 0);
    assert.strictEqual(undoCall3, 0);
    assert.strictEqual(redoCall3, 0);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), false);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === element3);
    service.undo(resource);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(undoCall2, 1);
    assert.strictEqual(redoCall2, 0);
    assert.strictEqual(undoCall3, 1);
    assert.strictEqual(redoCall3, 0);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), true);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === null);
  });
  test("multi resource elements", async () => {
    const resource1 = URI.file("test1.txt");
    const resource2 = URI.file("test2.txt");
    const service = createUndoRedoService(new class extends mock() {
      async prompt(prompt) {
        const result = prompt.buttons?.[0].run({ checkboxChecked: false });
        return { result };
      }
      async confirm() {
        return {
          confirmed: true
          // confirm!
        };
      }
    }());
    let undoCall1 = 0, undoCall11 = 0, undoCall12 = 0;
    let redoCall1 = 0, redoCall11 = 0, redoCall12 = 0;
    const element1 = {
      type: UndoRedoElementType.Workspace,
      resources: [resource1, resource2],
      label: "typing 1",
      code: "typing",
      undo: () => {
        undoCall1++;
      },
      redo: () => {
        redoCall1++;
      },
      split: () => {
        return [
          {
            type: UndoRedoElementType.Resource,
            resource: resource1,
            label: "typing 1.1",
            code: "typing",
            undo: () => {
              undoCall11++;
            },
            redo: () => {
              redoCall11++;
            }
          },
          {
            type: UndoRedoElementType.Resource,
            resource: resource2,
            label: "typing 1.2",
            code: "typing",
            undo: () => {
              undoCall12++;
            },
            redo: () => {
              redoCall12++;
            }
          }
        ];
      }
    };
    service.pushElement(element1);
    assert.strictEqual(service.canUndo(resource1), true);
    assert.strictEqual(service.canRedo(resource1), false);
    assert.strictEqual(service.hasElements(resource1), true);
    assert.ok(service.getLastElement(resource1) === element1);
    assert.strictEqual(service.canUndo(resource2), true);
    assert.strictEqual(service.canRedo(resource2), false);
    assert.strictEqual(service.hasElements(resource2), true);
    assert.ok(service.getLastElement(resource2) === element1);
    await service.undo(resource1);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 0);
    assert.strictEqual(service.canUndo(resource1), false);
    assert.strictEqual(service.canRedo(resource1), true);
    assert.strictEqual(service.hasElements(resource1), true);
    assert.ok(service.getLastElement(resource1) === null);
    assert.strictEqual(service.canUndo(resource2), false);
    assert.strictEqual(service.canRedo(resource2), true);
    assert.strictEqual(service.hasElements(resource2), true);
    assert.ok(service.getLastElement(resource2) === null);
    await service.redo(resource2);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(undoCall11, 0);
    assert.strictEqual(redoCall11, 0);
    assert.strictEqual(undoCall12, 0);
    assert.strictEqual(redoCall12, 0);
    assert.strictEqual(service.canUndo(resource1), true);
    assert.strictEqual(service.canRedo(resource1), false);
    assert.strictEqual(service.hasElements(resource1), true);
    assert.ok(service.getLastElement(resource1) === element1);
    assert.strictEqual(service.canUndo(resource2), true);
    assert.strictEqual(service.canRedo(resource2), false);
    assert.strictEqual(service.hasElements(resource2), true);
    assert.ok(service.getLastElement(resource2) === element1);
  });
  test("UndoRedoGroup.None uses id 0", () => {
    assert.strictEqual(UndoRedoGroup.None.id, 0);
    assert.strictEqual(UndoRedoGroup.None.nextOrder(), 0);
    assert.strictEqual(UndoRedoGroup.None.nextOrder(), 0);
  });
  test("restoreSnapshot preserves elements that match the snapshot", () => {
    const resource = URI.file("test.txt");
    const service = createUndoRedoService();
    const element1 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 1",
      code: "typing",
      undo: () => {
      },
      redo: () => {
      }
    };
    const element2 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 2",
      code: "typing",
      undo: () => {
      },
      redo: () => {
      }
    };
    const element3 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 3",
      code: "typing",
      undo: () => {
      },
      redo: () => {
      }
    };
    service.pushElement(element1);
    service.pushElement(element2);
    service.pushElement(element3);
    const snapshot = service.createSnapshot(resource);
    const element4 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 4",
      code: "typing",
      undo: () => {
      },
      redo: () => {
      }
    };
    const element5 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 5",
      code: "typing",
      undo: () => {
      },
      redo: () => {
      }
    };
    service.pushElement(element4);
    service.pushElement(element5);
    let elements = service.getElements(resource);
    assert.strictEqual(elements.past.length, 5);
    assert.strictEqual(elements.future.length, 0);
    service.restoreSnapshot(snapshot);
    elements = service.getElements(resource);
    assert.strictEqual(elements.past.length, 3, "Should have 3 past elements after restore");
    assert.strictEqual(elements.future.length, 0, "Should have 0 future elements after restore");
    assert.strictEqual(elements.past[0], element1, "First element should be element1");
    assert.strictEqual(elements.past[1], element2, "Second element should be element2");
    assert.strictEqual(elements.past[2], element3, "Third element should be element3");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdW5kb1JlZG9cXHRlc3RcXGNvbW1vblxcdW5kb1JlZG9TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJUHJvbXB0IH0gZnJvbSAnLi4vLi4vLi4vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBUZXN0RGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2RpYWxvZ3MvdGVzdC9jb21tb24vdGVzdERpYWxvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvRWxlbWVudCwgVW5kb1JlZG9FbGVtZW50VHlwZSwgVW5kb1JlZG9Hcm91cCB9IGZyb20gJy4uLy4uL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdW5kb1JlZG9TZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1VuZG9SZWRvU2VydmljZScsICgpID0+IHtcblxuXHRmdW5jdGlvbiBjcmVhdGVVbmRvUmVkb1NlcnZpY2UoZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UgPSBuZXcgVGVzdERpYWxvZ1NlcnZpY2UoKSk6IFVuZG9SZWRvU2VydmljZSB7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdHJldHVybiBuZXcgVW5kb1JlZG9TZXJ2aWNlKGRpYWxvZ1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0dGVzdCgnc2ltcGxlIHNpbmdsZSByZXNvdXJjZSBlbGVtZW50cycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCd0ZXN0LnR4dCcpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVVbmRvUmVkb1NlcnZpY2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblVuZG8ocmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuUmVkbyhyZXNvdXJjZSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNFbGVtZW50cyhyZXNvdXJjZSksIGZhbHNlKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRMYXN0RWxlbWVudChyZXNvdXJjZSkgPT09IG51bGwpO1xuXG5cdFx0bGV0IHVuZG9DYWxsMSA9IDA7XG5cdFx0bGV0IHJlZG9DYWxsMSA9IDA7XG5cdFx0Y29uc3QgZWxlbWVudDE6IElVbmRvUmVkb0VsZW1lbnQgPSB7XG5cdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICd0eXBpbmcgMScsXG5cdFx0XHRjb2RlOiAndHlwaW5nJyxcblx0XHRcdHVuZG86ICgpID0+IHsgdW5kb0NhbGwxKys7IH0sXG5cdFx0XHRyZWRvOiAoKSA9PiB7IHJlZG9DYWxsMSsrOyB9XG5cdFx0fTtcblx0XHRzZXJ2aWNlLnB1c2hFbGVtZW50KGVsZW1lbnQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDEsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDEsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblVuZG8ocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5SZWRvKHJlc291cmNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0VsZW1lbnRzKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0TGFzdEVsZW1lbnQocmVzb3VyY2UpID09PSBlbGVtZW50MSk7XG5cblx0XHRzZXJ2aWNlLnVuZG8ocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDEsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblVuZG8ocmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuUmVkbyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0VsZW1lbnRzKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0TGFzdEVsZW1lbnQocmVzb3VyY2UpID09PSBudWxsKTtcblxuXHRcdHNlcnZpY2UucmVkbyhyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZG9DYWxsMSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZG9DYWxsMSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuVW5kbyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblJlZG8ocmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzRWxlbWVudHMocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRMYXN0RWxlbWVudChyZXNvdXJjZSkgPT09IGVsZW1lbnQxKTtcblxuXHRcdGxldCB1bmRvQ2FsbDIgPSAwO1xuXHRcdGxldCByZWRvQ2FsbDIgPSAwO1xuXHRcdGNvbnN0IGVsZW1lbnQyOiBJVW5kb1JlZG9FbGVtZW50ID0ge1xuXHRcdFx0dHlwZTogVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZSxcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAndHlwaW5nIDInLFxuXHRcdFx0Y29kZTogJ3R5cGluZycsXG5cdFx0XHR1bmRvOiAoKSA9PiB7IHVuZG9DYWxsMisrOyB9LFxuXHRcdFx0cmVkbzogKCkgPT4geyByZWRvQ2FsbDIrKzsgfVxuXHRcdH07XG5cdFx0c2VydmljZS5wdXNoRWxlbWVudChlbGVtZW50Mik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kb0NhbGwxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkb0NhbGwxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kb0NhbGwyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkb0NhbGwyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuUmVkbyhyZXNvdXJjZSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNFbGVtZW50cyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldExhc3RFbGVtZW50KHJlc291cmNlKSA9PT0gZWxlbWVudDIpO1xuXG5cdFx0c2VydmljZS51bmRvKHJlc291cmNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblVuZG8ocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5SZWRvKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzRWxlbWVudHMocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRMYXN0RWxlbWVudChyZXNvdXJjZSkgPT09IG51bGwpO1xuXG5cdFx0bGV0IHVuZG9DYWxsMyA9IDA7XG5cdFx0bGV0IHJlZG9DYWxsMyA9IDA7XG5cdFx0Y29uc3QgZWxlbWVudDM6IElVbmRvUmVkb0VsZW1lbnQgPSB7XG5cdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICd0eXBpbmcgMicsXG5cdFx0XHRjb2RlOiAndHlwaW5nJyxcblx0XHRcdHVuZG86ICgpID0+IHsgdW5kb0NhbGwzKys7IH0sXG5cdFx0XHRyZWRvOiAoKSA9PiB7IHJlZG9DYWxsMysrOyB9XG5cdFx0fTtcblx0XHRzZXJ2aWNlLnB1c2hFbGVtZW50KGVsZW1lbnQzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDMsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDMsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblVuZG8ocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5SZWRvKHJlc291cmNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0VsZW1lbnRzKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0TGFzdEVsZW1lbnQocmVzb3VyY2UpID09PSBlbGVtZW50Myk7XG5cblx0XHRzZXJ2aWNlLnVuZG8ocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZG9DYWxsMSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZG9DYWxsMSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZG9DYWxsMiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZG9DYWxsMiwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZG9DYWxsMywgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZG9DYWxsMywgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuVW5kbyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblJlZG8ocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNFbGVtZW50cyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldExhc3RFbGVtZW50KHJlc291cmNlKSA9PT0gbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpIHJlc291cmNlIGVsZW1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5maWxlKCd0ZXN0MS50eHQnKTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZmlsZSgndGVzdDIudHh0Jyk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVVuZG9SZWRvU2VydmljZShuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEaWFsb2dTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHByb21wdDxUID0gYW55Pihwcm9tcHQ6IElQcm9tcHQ8YW55Pikge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwcm9tcHQuYnV0dG9ucz8uWzBdLnJ1bih7IGNoZWNrYm94Q2hlY2tlZDogZmFsc2UgfSk7XG5cblx0XHRcdFx0cmV0dXJuIHsgcmVzdWx0IH07XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBjb25maXJtKCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbmZpcm1lZDogdHJ1ZSAvLyBjb25maXJtIVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGV0IHVuZG9DYWxsMSA9IDAsIHVuZG9DYWxsMTEgPSAwLCB1bmRvQ2FsbDEyID0gMDtcblx0XHRsZXQgcmVkb0NhbGwxID0gMCwgcmVkb0NhbGwxMSA9IDAsIHJlZG9DYWxsMTIgPSAwO1xuXHRcdGNvbnN0IGVsZW1lbnQxOiBJVW5kb1JlZG9FbGVtZW50ID0ge1xuXHRcdFx0dHlwZTogVW5kb1JlZG9FbGVtZW50VHlwZS5Xb3Jrc3BhY2UsXG5cdFx0XHRyZXNvdXJjZXM6IFtyZXNvdXJjZTEsIHJlc291cmNlMl0sXG5cdFx0XHRsYWJlbDogJ3R5cGluZyAxJyxcblx0XHRcdGNvZGU6ICd0eXBpbmcnLFxuXHRcdFx0dW5kbzogKCkgPT4geyB1bmRvQ2FsbDErKzsgfSxcblx0XHRcdHJlZG86ICgpID0+IHsgcmVkb0NhbGwxKys7IH0sXG5cdFx0XHRzcGxpdDogKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UxLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICd0eXBpbmcgMS4xJyxcblx0XHRcdFx0XHRcdGNvZGU6ICd0eXBpbmcnLFxuXHRcdFx0XHRcdFx0dW5kbzogKCkgPT4geyB1bmRvQ2FsbDExKys7IH0sXG5cdFx0XHRcdFx0XHRyZWRvOiAoKSA9PiB7IHJlZG9DYWxsMTErKzsgfVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZSxcblx0XHRcdFx0XHRcdHJlc291cmNlOiByZXNvdXJjZTIsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ3R5cGluZyAxLjInLFxuXHRcdFx0XHRcdFx0Y29kZTogJ3R5cGluZycsXG5cdFx0XHRcdFx0XHR1bmRvOiAoKSA9PiB7IHVuZG9DYWxsMTIrKzsgfSxcblx0XHRcdFx0XHRcdHJlZG86ICgpID0+IHsgcmVkb0NhbGwxMisrOyB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0c2VydmljZS5wdXNoRWxlbWVudChlbGVtZW50MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlMSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblJlZG8ocmVzb3VyY2UxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0VsZW1lbnRzKHJlc291cmNlMSksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldExhc3RFbGVtZW50KHJlc291cmNlMSkgPT09IGVsZW1lbnQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlMiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblJlZG8ocmVzb3VyY2UyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0VsZW1lbnRzKHJlc291cmNlMiksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldExhc3RFbGVtZW50KHJlc291cmNlMikgPT09IGVsZW1lbnQxKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UudW5kbyhyZXNvdXJjZTEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZG9DYWxsMSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZG9DYWxsMSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuVW5kbyhyZXNvdXJjZTEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuUmVkbyhyZXNvdXJjZTEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNFbGVtZW50cyhyZXNvdXJjZTEpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRMYXN0RWxlbWVudChyZXNvdXJjZTEpID09PSBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlMiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5SZWRvKHJlc291cmNlMiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0VsZW1lbnRzKHJlc291cmNlMiksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldExhc3RFbGVtZW50KHJlc291cmNlMikgPT09IG51bGwpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZWRvKHJlc291cmNlMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZG9DYWxsMSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZG9DYWxsMSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZG9DYWxsMTEsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDExLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kb0NhbGwxMiwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZG9DYWxsMTIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblVuZG8ocmVzb3VyY2UxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuUmVkbyhyZXNvdXJjZTEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzRWxlbWVudHMocmVzb3VyY2UxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0TGFzdEVsZW1lbnQocmVzb3VyY2UxKSA9PT0gZWxlbWVudDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblVuZG8ocmVzb3VyY2UyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuUmVkbyhyZXNvdXJjZTIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzRWxlbWVudHMocmVzb3VyY2UyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0TGFzdEVsZW1lbnQocmVzb3VyY2UyKSA9PT0gZWxlbWVudDEpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ1VuZG9SZWRvR3JvdXAuTm9uZSB1c2VzIGlkIDAnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVuZG9SZWRvR3JvdXAuTm9uZS5pZCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVuZG9SZWRvR3JvdXAuTm9uZS5uZXh0T3JkZXIoKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVuZG9SZWRvR3JvdXAuTm9uZS5uZXh0T3JkZXIoKSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVTbmFwc2hvdCBwcmVzZXJ2ZXMgZWxlbWVudHMgdGhhdCBtYXRjaCB0aGUgc25hcHNob3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgndGVzdC50eHQnKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlVW5kb1JlZG9TZXJ2aWNlKCk7XG5cblx0XHQvLyBQdXNoIHRocmVlIGVsZW1lbnRzXG5cdFx0Y29uc3QgZWxlbWVudDE6IElVbmRvUmVkb0VsZW1lbnQgPSB7XG5cdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICd0eXBpbmcgMScsXG5cdFx0XHRjb2RlOiAndHlwaW5nJyxcblx0XHRcdHVuZG86ICgpID0+IHsgfSxcblx0XHRcdHJlZG86ICgpID0+IHsgfVxuXHRcdH07XG5cdFx0Y29uc3QgZWxlbWVudDI6IElVbmRvUmVkb0VsZW1lbnQgPSB7XG5cdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICd0eXBpbmcgMicsXG5cdFx0XHRjb2RlOiAndHlwaW5nJyxcblx0XHRcdHVuZG86ICgpID0+IHsgfSxcblx0XHRcdHJlZG86ICgpID0+IHsgfVxuXHRcdH07XG5cdFx0Y29uc3QgZWxlbWVudDM6IElVbmRvUmVkb0VsZW1lbnQgPSB7XG5cdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICd0eXBpbmcgMycsXG5cdFx0XHRjb2RlOiAndHlwaW5nJyxcblx0XHRcdHVuZG86ICgpID0+IHsgfSxcblx0XHRcdHJlZG86ICgpID0+IHsgfVxuXHRcdH07XG5cdFx0c2VydmljZS5wdXNoRWxlbWVudChlbGVtZW50MSk7XG5cdFx0c2VydmljZS5wdXNoRWxlbWVudChlbGVtZW50Mik7XG5cdFx0c2VydmljZS5wdXNoRWxlbWVudChlbGVtZW50Myk7XG5cblx0XHQvLyBDcmVhdGUgc25hcHNob3QgYWZ0ZXIgMyBlbGVtZW50czogW2VsZW1lbnQxLCBlbGVtZW50MiwgZWxlbWVudDNdXG5cdFx0Y29uc3Qgc25hcHNob3QgPSBzZXJ2aWNlLmNyZWF0ZVNuYXBzaG90KHJlc291cmNlKTtcblxuXHRcdC8vIFB1c2ggbW9yZSBlbGVtZW50cyBhZnRlciB0aGUgc25hcHNob3Rcblx0XHRjb25zdCBlbGVtZW50NDogSVVuZG9SZWRvRWxlbWVudCA9IHtcblx0XHRcdHR5cGU6IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2UsXG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogJ3R5cGluZyA0Jyxcblx0XHRcdGNvZGU6ICd0eXBpbmcnLFxuXHRcdFx0dW5kbzogKCkgPT4geyB9LFxuXHRcdFx0cmVkbzogKCkgPT4geyB9XG5cdFx0fTtcblx0XHRjb25zdCBlbGVtZW50NTogSVVuZG9SZWRvRWxlbWVudCA9IHtcblx0XHRcdHR5cGU6IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2UsXG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogJ3R5cGluZyA1Jyxcblx0XHRcdGNvZGU6ICd0eXBpbmcnLFxuXHRcdFx0dW5kbzogKCkgPT4geyB9LFxuXHRcdFx0cmVkbzogKCkgPT4geyB9XG5cdFx0fTtcblx0XHRzZXJ2aWNlLnB1c2hFbGVtZW50KGVsZW1lbnQ0KTtcblx0XHRzZXJ2aWNlLnB1c2hFbGVtZW50KGVsZW1lbnQ1KTtcblxuXHRcdC8vIFZlcmlmeSB3ZSBoYXZlIDUgZWxlbWVudHMgbm93XG5cdFx0bGV0IGVsZW1lbnRzID0gc2VydmljZS5nZXRFbGVtZW50cyhyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnRzLnBhc3QubGVuZ3RoLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudHMuZnV0dXJlLmxlbmd0aCwgMCk7XG5cblx0XHQvLyBSZXN0b3JlIHNuYXBzaG90IC0gc2hvdWxkIHJlbW92ZSBlbGVtZW50NCBhbmQgZWxlbWVudDUsIGJ1dCBrZWVwIGVsZW1lbnQxLCBlbGVtZW50MiwgZWxlbWVudDNcblx0XHRzZXJ2aWNlLnJlc3RvcmVTbmFwc2hvdChzbmFwc2hvdCk7XG5cblx0XHQvLyBWZXJpZnkgdGhhdCBlbGVtZW50cyBtYXRjaGluZyB0aGUgc25hcHNob3QgYXJlIHByZXNlcnZlZFxuXHRcdGVsZW1lbnRzID0gc2VydmljZS5nZXRFbGVtZW50cyhyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnRzLnBhc3QubGVuZ3RoLCAzLCAnU2hvdWxkIGhhdmUgMyBwYXN0IGVsZW1lbnRzIGFmdGVyIHJlc3RvcmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudHMuZnV0dXJlLmxlbmd0aCwgMCwgJ1Nob3VsZCBoYXZlIDAgZnV0dXJlIGVsZW1lbnRzIGFmdGVyIHJlc3RvcmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudHMucGFzdFswXSwgZWxlbWVudDEsICdGaXJzdCBlbGVtZW50IHNob3VsZCBiZSBlbGVtZW50MScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbGVtZW50cy5wYXN0WzFdLCBlbGVtZW50MiwgJ1NlY29uZCBlbGVtZW50IHNob3VsZCBiZSBlbGVtZW50MicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbGVtZW50cy5wYXN0WzJdLCBlbGVtZW50MywgJ1RoaXJkIGVsZW1lbnQgc2hvdWxkIGJlIGVsZW1lbnQzJyk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtCQUErQjtBQUN4QyxTQUEyQixxQkFBcUIscUJBQXFCO0FBQ3JFLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sbUJBQW1CLE1BQU07QUFFOUIsV0FBUyxzQkFBc0IsZ0JBQWdDLElBQUksa0JBQWtCLEdBQW9CO0FBQ3hHLFVBQU0sc0JBQXNCLElBQUksd0JBQXdCO0FBQ3hELFdBQU8sSUFBSSxnQkFBZ0IsZUFBZSxtQkFBbUI7QUFBQSxFQUM5RDtBQUVBLE9BQUssbUNBQW1DLE1BQU07QUFDN0MsVUFBTSxXQUFXLElBQUksS0FBSyxVQUFVO0FBQ3BDLFVBQU0sVUFBVSxzQkFBc0I7QUFFdEMsV0FBTyxZQUFZLFFBQVEsUUFBUSxRQUFRLEdBQUcsS0FBSztBQUNuRCxXQUFPLFlBQVksUUFBUSxRQUFRLFFBQVEsR0FBRyxLQUFLO0FBQ25ELFdBQU8sWUFBWSxRQUFRLFlBQVksUUFBUSxHQUFHLEtBQUs7QUFDdkQsV0FBTyxHQUFHLFFBQVEsZUFBZSxRQUFRLE1BQU0sSUFBSTtBQUVuRCxRQUFJLFlBQVk7QUFDaEIsUUFBSSxZQUFZO0FBQ2hCLFVBQU0sV0FBNkI7QUFBQSxNQUNsQyxNQUFNLG9CQUFvQjtBQUFBLE1BQzFCO0FBQUEsTUFDQSxPQUFPO0FBQUEsTUFDUCxNQUFNO0FBQUEsTUFDTixNQUFNLE1B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
