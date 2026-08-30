import assert from "assert";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { RestoreCheckpointActionId, StartOverActionId } from "../../../browser/chatEditing/chatEditingActions.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { MockChatService } from "../../common/chatService/mockChatService.js";
import { MockChatWidgetService } from "../widget/mockChatWidget.js";
suite("Chat editing actions", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  async function runCheckpointAction(actionId, initialInput, confirmRestore) {
    const instantiationService = store.add(new TestInstantiationService());
    const sessionResource = URI.parse("test://session");
    const requestId = "request-1";
    const attachment = {
      id: "attachment-1",
      kind: "file",
      name: "file.ts",
      value: URI.parse("test://file.ts")
    };
    const requestItem = new class extends mock() {
      constructor() {
        super(...arguments);
        this.id = requestId;
        this.sessionResource = sessionResource;
        this.message = new class extends mock() {
        }();
        this.messageText = "original request";
        this.attachedContext = [attachment];
      }
    }();
    const requestModel = new class extends mock() {
      constructor() {
        super(...arguments);
        this.id = requestId;
      }
    }();
    let checkpoint;
    let restoredSnapshot;
    let inputValue = initialInput;
    let mainInputFocusCount = 0;
    let activeInputSetCount = 0;
    let restoredAttachmentIds = [];
    const modifiedEntry = new class extends mock() {
      constructor() {
        super(...arguments);
        this.modifiedURI = URI.parse("test://file.ts");
        this.lastModifyingRequestId = requestId;
      }
    }();
    const editingSession = new class extends mock() {
      constructor() {
        super(...arguments);
        this.entries = observableValue("entries", confirmRestore === void 0 ? [] : [modifiedEntry]);
      }
      async restoreSnapshot(snapshotRequestId, _stopId) {
        restoredSnapshot = snapshotRequestId;
      }
    }();
    const chatModel = new class extends mock() {
      constructor() {
        super(...arguments);
        this.editingSession = editingSession;
      }
      getRequests() {
        return [requestModel];
      }
      setCheckpoint(value) {
        checkpoint = value;
      }
    }();
    const inputEditor = new class extends mock() {
      getValue() {
        return inputValue;
      }
    }();
    const attachmentModel = new class extends mock() {
      get attachments() {
        return [];
      }
    }();
    const mainInput = new class extends mock() {
      get inputEditor() {
        return inputEditor;
      }
      get attachmentModel() {
        return attachmentModel;
      }
      focus() {
        mainInputFocusCount++;
      }
      setValue(value, _transient) {
        inputValue = value;
      }
      async restoreAttachments(attachments) {
        restoredAttachmentIds = attachments.map((attachment2) => attachment2.id);
      }
    }();
    const activeInput = new class extends mock() {
      setValue(_value, _transient) {
        activeInputSetCount++;
      }
    }();
    const viewModel = new class extends mock() {
      constructor() {
        super(...arguments);
        this.model = chatModel;
      }
    }();
    const widget = new class extends mock() {
      constructor() {
        super(...arguments);
        this.viewModel = viewModel;
        this.input = activeInput;
        this.inputPart = mainInput;
      }
    }();
    instantiationService.set(IChatWidgetService, new class extends MockChatWidgetService {
      getWidgetBySessionResource() {
        return widget;
      }
    }());
    instantiationService.set(IChatService, new class extends MockChatService {
      getSession() {
        return chatModel;
      }
    }());
    const configurationService = new TestConfigurationService();
    if (confirmRestore !== void 0) {
      await configurationService.setUserConfiguration("chat.editing.confirmEditRequestRemoval", true);
    }
    instantiationService.set(IConfigurationService, configurationService);
    instantiationService.set(IDialogService, new class extends mock() {
      async confirm() {
        return { confirmed: confirmRestore ?? true };
      }
    }());
    const commandHandler = CommandsRegistry.getCommand(actionId)?.handler;
    assert.ok(commandHandler);
    await commandHandler(instantiationService, requestItem);
    return {
      inputValue,
      mainInputFocusCount,
      activeInputSetCount,
      checkpoint,
      restoredSnapshot,
      restoredAttachmentIds
    };
  }
  test("Start Over restores the first request to an empty main input", async () => {
    assert.deepStrictEqual(await runCheckpointAction(StartOverActionId, ""), {
      inputValue: "original request",
      mainInputFocusCount: 1,
      activeInputSetCount: 0,
      checkpoint: "request-1",
      restoredSnapshot: "request-1",
      restoredAttachmentIds: ["attachment-1"]
    });
  });
  test("Start Over preserves existing main input content", async () => {
    assert.deepStrictEqual(await runCheckpointAction(StartOverActionId, "existing draft"), {
      inputValue: "existing draft",
      mainInputFocusCount: 0,
      activeInputSetCount: 0,
      checkpoint: "request-1",
      restoredSnapshot: "request-1",
      restoredAttachmentIds: []
    });
  });
  test("checkpoint actions do not change the input when restore is canceled", async () => {
    const expected = {
      inputValue: "",
      mainInputFocusCount: 0,
      activeInputSetCount: 0,
      checkpoint: void 0,
      restoredSnapshot: void 0,
      restoredAttachmentIds: []
    };
    assert.deepStrictEqual({
      restoreCheckpoint: await runCheckpointAction(RestoreCheckpointActionId, "", false),
      startOver: await runCheckpointAction(StartOverActionId, "", false)
    }, {
      restoreCheckpoint: expected,
      startOver: expected
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ0FjdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UsIElDb25maXJtYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IENoYXRBdHRhY2htZW50TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBSZXN0b3JlQ2hlY2twb2ludEFjdGlvbklkLCBTdGFydE92ZXJBY3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dFBhcnQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXRQYXJ0LmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdEZpbGVFbnRyeSwgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBJTW9kaWZpZWRGaWxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCwgSUNoYXRSZXF1ZXN0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZpZXdNb2RlbCwgSUNoYXRWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJUGFyc2VkQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL21vY2tDaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi93aWRnZXQvbW9ja0NoYXRXaWRnZXQuanMnO1xuXG5zdWl0ZSgnQ2hhdCBlZGl0aW5nIGFjdGlvbnMnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0YXN5bmMgZnVuY3Rpb24gcnVuQ2hlY2twb2ludEFjdGlvbihhY3Rpb25JZDogc3RyaW5nLCBpbml0aWFsSW5wdXQ6IHN0cmluZywgY29uZmlybVJlc3RvcmU/OiBib29sZWFuKSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyk7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gJ3JlcXVlc3QtMSc7XG5cdFx0Y29uc3QgYXR0YWNobWVudDogSUNoYXRSZXF1ZXN0RmlsZUVudHJ5ID0ge1xuXHRcdFx0aWQ6ICdhdHRhY2htZW50LTEnLFxuXHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0bmFtZTogJ2ZpbGUudHMnLFxuXHRcdFx0dmFsdWU6IFVSSS5wYXJzZSgndGVzdDovL2ZpbGUudHMnKSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlcXVlc3RJdGVtID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFJlcXVlc3RWaWV3TW9kZWw+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaWQgPSByZXF1ZXN0SWQ7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBtZXNzYWdlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGFyc2VkQ2hhdFJlcXVlc3Q+KCkgeyB9O1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbWVzc2FnZVRleHQgPSAnb3JpZ2luYWwgcmVxdWVzdCc7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBhdHRhY2hlZENvbnRleHQgPSBbYXR0YWNobWVudF07XG5cdFx0fTtcblx0XHRjb25zdCByZXF1ZXN0TW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0UmVxdWVzdE1vZGVsPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gcmVxdWVzdElkO1xuXHRcdH07XG5cblx0XHRsZXQgY2hlY2twb2ludDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZXN0b3JlZFNuYXBzaG90OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGlucHV0VmFsdWUgPSBpbml0aWFsSW5wdXQ7XG5cdFx0bGV0IG1haW5JbnB1dEZvY3VzQ291bnQgPSAwO1xuXHRcdGxldCBhY3RpdmVJbnB1dFNldENvdW50ID0gMDtcblx0XHRsZXQgcmVzdG9yZWRBdHRhY2htZW50SWRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3QgbW9kaWZpZWRFbnRyeSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1vZGlmaWVkRmlsZUVudHJ5PigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1vZGlmaWVkVVJJID0gVVJJLnBhcnNlKCd0ZXN0Oi8vZmlsZS50cycpO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFzdE1vZGlmeWluZ1JlcXVlc3RJZCA9IHJlcXVlc3RJZDtcblx0XHR9O1xuXHRcdGNvbnN0IGVkaXRpbmdTZXNzaW9uID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEVkaXRpbmdTZXNzaW9uPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGVudHJpZXMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSU1vZGlmaWVkRmlsZUVudHJ5W10+KCdlbnRyaWVzJywgY29uZmlybVJlc3RvcmUgPT09IHVuZGVmaW5lZCA/IFtdIDogW21vZGlmaWVkRW50cnldKTtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlc3RvcmVTbmFwc2hvdChzbmFwc2hvdFJlcXVlc3RJZDogc3RyaW5nLCBfc3RvcElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0cmVzdG9yZWRTbmFwc2hvdCA9IHNuYXBzaG90UmVxdWVzdElkO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdE1vZGVsPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGVkaXRpbmdTZXNzaW9uID0gZWRpdGluZ1Nlc3Npb247XG5cdFx0XHRvdmVycmlkZSBnZXRSZXF1ZXN0cygpIHtcblx0XHRcdFx0cmV0dXJuIFtyZXF1ZXN0TW9kZWxdO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgc2V0Q2hlY2twb2ludCh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0XHRcdGNoZWNrcG9pbnQgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGlucHV0RWRpdG9yID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxDb2RlRWRpdG9yV2lkZ2V0PigpIHtcblx0XHRcdG92ZXJyaWRlIGdldFZhbHVlKCk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiBpbnB1dFZhbHVlO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgYXR0YWNobWVudE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxDaGF0QXR0YWNobWVudE1vZGVsPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldCBhdHRhY2htZW50cygpOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10ge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBtYWluSW5wdXQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPENoYXRJbnB1dFBhcnQ+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0IGlucHV0RWRpdG9yKCk6IENvZGVFZGl0b3JXaWRnZXQge1xuXHRcdFx0XHRyZXR1cm4gaW5wdXRFZGl0b3I7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXQgYXR0YWNobWVudE1vZGVsKCk6IENoYXRBdHRhY2htZW50TW9kZWwge1xuXHRcdFx0XHRyZXR1cm4gYXR0YWNobWVudE1vZGVsO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0XHRcdG1haW5JbnB1dEZvY3VzQ291bnQrKztcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIHNldFZhbHVlKHZhbHVlOiBzdHJpbmcsIF90cmFuc2llbnQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdFx0aW5wdXRWYWx1ZSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzdG9yZUF0dGFjaG1lbnRzKGF0dGFjaG1lbnRzOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0cmVzdG9yZWRBdHRhY2htZW50SWRzID0gYXR0YWNobWVudHMubWFwKGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudC5pZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBhY3RpdmVJbnB1dCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8Q2hhdElucHV0UGFydD4oKSB7XG5cdFx0XHRvdmVycmlkZSBzZXRWYWx1ZShfdmFsdWU6IHN0cmluZywgX3RyYW5zaWVudDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0XHRhY3RpdmVJbnB1dFNldENvdW50Kys7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0Vmlld01vZGVsPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1vZGVsID0gY2hhdE1vZGVsO1xuXHRcdH07XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldD4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSB2aWV3TW9kZWwgPSB2aWV3TW9kZWw7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBpbnB1dCA9IGFjdGl2ZUlucHV0O1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5wdXRQYXJ0ID0gbWFpbklucHV0O1xuXHRcdH07XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBNb2NrQ2hhdFdpZGdldFNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoKSB7XG5cdFx0XHRcdHJldHVybiB3aWRnZXQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgTW9ja0NoYXRTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb24oKSB7XG5cdFx0XHRcdHJldHVybiBjaGF0TW9kZWw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0aWYgKGNvbmZpcm1SZXN0b3JlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmVkaXRpbmcuY29uZmlybUVkaXRSZXF1ZXN0UmVtb3ZhbCcsIHRydWUpO1xuXHRcdH1cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElEaWFsb2dTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEaWFsb2dTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNvbmZpcm0oKTogUHJvbWlzZTxJQ29uZmlybWF0aW9uUmVzdWx0PiB7XG5cdFx0XHRcdHJldHVybiB7IGNvbmZpcm1lZDogY29uZmlybVJlc3RvcmUgPz8gdHJ1ZSB9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29tbWFuZEhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoYWN0aW9uSWQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhjb21tYW5kSGFuZGxlcik7XG5cdFx0YXdhaXQgY29tbWFuZEhhbmRsZXIoaW5zdGFudGlhdGlvblNlcnZpY2UsIHJlcXVlc3RJdGVtKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpbnB1dFZhbHVlLFxuXHRcdFx0bWFpbklucHV0Rm9jdXNDb3VudCxcblx0XHRcdGFjdGl2ZUlucHV0U2V0Q291bnQsXG5cdFx0XHRjaGVja3BvaW50LFxuXHRcdFx0cmVzdG9yZWRTbmFwc2hvdCxcblx0XHRcdHJlc3RvcmVkQXR0YWNobWVudElkcyxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnU3RhcnQgT3ZlciByZXN0b3JlcyB0aGUgZmlyc3QgcmVxdWVzdCB0byBhbiBlbXB0eSBtYWluIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcnVuQ2hlY2twb2ludEFjdGlvbihTdGFydE92ZXJBY3Rpb25JZCwgJycpLCB7XG5cdFx0XHRpbnB1dFZhbHVlOiAnb3JpZ2luYWwgcmVxdWVzdCcsXG5cdFx0XHRtYWluSW5wdXRGb2N1c0NvdW50OiAxLFxuXHRcdFx0YWN0aXZlSW5wdXRTZXRDb3VudDogMCxcblx0XHRcdGNoZWNrcG9pbnQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0cmVzdG9yZWRTbmFwc2hvdDogJ3JlcXVlc3QtMScsXG5cdFx0XHRyZXN0b3JlZEF0dGFjaG1lbnRJZHM6IFsnYXR0YWNobWVudC0xJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N0YXJ0IE92ZXIgcHJlc2VydmVzIGV4aXN0aW5nIG1haW4gaW5wdXQgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJ1bkNoZWNrcG9pbnRBY3Rpb24oU3RhcnRPdmVyQWN0aW9uSWQsICdleGlzdGluZyBkcmFmdCcpLCB7XG5cdFx0XHRpbnB1dFZhbHVlOiAnZXhpc3RpbmcgZHJhZnQnLFxuXHRcdFx0bWFpbklucHV0Rm9jdXNDb3VudDogMCxcblx0XHRcdGFjdGl2ZUlucHV0U2V0Q291bnQ6IDAsXG5cdFx0XHRjaGVja3BvaW50OiAncmVxdWVzdC0xJyxcblx0XHRcdHJlc3RvcmVkU25hcHNob3Q6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0cmVzdG9yZWRBdHRhY2htZW50SWRzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2twb2ludCBhY3Rpb25zIGRvIG5vdCBjaGFuZ2UgdGhlIGlucHV0IHdoZW4gcmVzdG9yZSBpcyBjYW5jZWxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RlZCA9IHtcblx0XHRcdGlucHV0VmFsdWU6ICcnLFxuXHRcdFx0bWFpbklucHV0Rm9jdXNDb3VudDogMCxcblx0XHRcdGFjdGl2ZUlucHV0U2V0Q291bnQ6IDAsXG5cdFx0XHRjaGVja3BvaW50OiB1bmRlZmluZWQsXG5cdFx0XHRyZXN0b3JlZFNuYXBzaG90OiB1bmRlZmluZWQsXG5cdFx0XHRyZXN0b3JlZEF0dGFjaG1lbnRJZHM6IFtdLFxuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN0b3JlQ2hlY2twb2ludDogYXdhaXQgcnVuQ2hlY2twb2ludEFjdGlvbihSZXN0b3JlQ2hlY2twb2ludEFjdGlvbklkLCAnJywgZmFsc2UpLFxuXHRcdFx0c3RhcnRPdmVyOiBhd2FpdCBydW5DaGVja3BvaW50QWN0aW9uKFN0YXJ0T3ZlckFjdGlvbklkLCAnJywgZmFsc2UpLFxuXHRcdH0sIHtcblx0XHRcdHJlc3RvcmVDaGVja3BvaW50OiBleHBlY3RlZCxcblx0XHRcdHN0YXJ0T3ZlcjogZXhwZWN0ZWQsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIs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
