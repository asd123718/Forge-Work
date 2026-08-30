import { VSBuffer } from "../../../../../base/common/buffer.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { CHAT_CATEGORY } from "./chatActions.js";
import { ChatViewPaneTarget, IChatWidgetService } from "../chat.js";
import { ChatEditorInput } from "../widgetHosts/editor/chatEditorInput.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { extractExportableSessionData, isExportableSessionData } from "../../common/model/chatModel.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { revive } from "../../../../../base/common/marshalling.js";
import { ACTIVE_GROUP } from "../../../../services/editor/common/editorService.js";
const defaultFileName = "chat.json";
const filters = [{ name: localize("chat.file.label", "Chat Session"), extensions: ["json"] }];
function registerChatExportActions() {
  registerAction2(class ExportChatAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.export",
        category: CHAT_CATEGORY,
        title: localize2("chat.export.label", "Export Chat..."),
        precondition: ChatContextKeys.enabled,
        f1: true
      });
    }
    async run(accessor, outputPath) {
      const widgetService = accessor.get(IChatWidgetService);
      const fileDialogService = accessor.get(IFileDialogService);
      const fileService = accessor.get(IFileService);
      const chatService = accessor.get(IChatService);
      const widget = widgetService.lastFocusedWidget;
      if (!widget || !widget.viewModel) {
        return;
      }
      if (!outputPath) {
        const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);
        const result = await fileDialogService.showSaveDialog({
          defaultUri,
          filters
        });
        if (!result) {
          return;
        }
        outputPath = result;
      }
      const model = chatService.getSession(widget.viewModel.sessionResource);
      if (!model) {
        return;
      }
      const content = VSBuffer.fromString(JSON.stringify(model.toExport(), void 0, 2));
      await fileService.writeFile(outputPath, content);
    }
  });
  registerAction2(class ImportChatAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.import",
        title: localize2("chat.import.label", "Import Chat..."),
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        f1: true
      });
    }
    async run(accessor, opts) {
      const fileService = accessor.get(IFileService);
      const widgetService = accessor.get(IChatWidgetService);
      const chatService = accessor.get(IChatService);
      const fileDialogService = accessor.get(IFileDialogService);
      let inputPath = opts?.inputPath;
      if (!inputPath) {
        const defaultUri = joinPath(await fileDialogService.defaultFilePath(), defaultFileName);
        const result = await fileDialogService.showOpenDialog({
          defaultUri,
          canSelectFiles: true,
          filters
        });
        if (!result) {
          return;
        }
        inputPath = result[0];
      }
      const content = await fileService.readFile(inputPath);
      try {
        const data = revive(JSON.parse(content.value.toString()));
        if (!isExportableSessionData(data)) {
          throw new Error("Invalid chat session data");
        }
        const importedData = extractExportableSessionData(data);
        let sessionResource;
        let resolvedTarget;
        let options;
        if (opts?.target === "chatViewPane") {
          const modelRef = chatService.loadSessionFromData(importedData, "ChatImportExport#importToChatView");
          try {
            sessionResource = modelRef.object.sessionResource;
            resolvedTarget = ChatViewPaneTarget;
            options = { pinned: true };
            await widgetService.openSession(sessionResource, resolvedTarget, options);
          } finally {
            modelRef.dispose();
          }
        } else {
          sessionResource = ChatEditorInput.getNewEditorUri();
          resolvedTarget = ACTIVE_GROUP;
          options = { target: { data: importedData }, pinned: true };
          await widgetService.openSession(sessionResource, resolvedTarget, options);
        }
      } catch (err) {
        throw err;
      }
    }
  });
}
export {
  registerChatExportActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRJbXBvcnRFeHBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4vY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdQYW5lVGFyZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9yLmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JJbnB1dCB9IGZyb20gJy4uL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGV4dHJhY3RFeHBvcnRhYmxlU2Vzc2lvbkRhdGEsIGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgUHJlZmVycmVkR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuXG5jb25zdCBkZWZhdWx0RmlsZU5hbWUgPSAnY2hhdC5qc29uJztcbmNvbnN0IGZpbHRlcnMgPSBbeyBuYW1lOiBsb2NhbGl6ZSgnY2hhdC5maWxlLmxhYmVsJywgXCJDaGF0IFNlc3Npb25cIiksIGV4dGVuc2lvbnM6IFsnanNvbiddIH1dO1xuXG4vKipcbiAqIFRhcmdldCBsb2NhdGlvbiBmb3IgaW1wb3J0aW5nIGEgY2hhdCBzZXNzaW9uLlxuICogLSAnY2hhdFZpZXdQYW5lJzogT3BlbnMgaW4gdGhlIGNoYXQgdmlldyBwYW5lIChzaWRlYmFyL3BhbmVsKVxuICogLSAnZGVmYXVsdCc6IE9wZW5zIGluIHRoZSBhY3RpdmUgZWRpdG9yIGdyb3VwXG4gKi9cbmV4cG9ydCB0eXBlIENoYXRJbXBvcnRUYXJnZXQgPSAnY2hhdFZpZXdQYW5lJyB8ICdkZWZhdWx0JztcblxuZXhwb3J0IGludGVyZmFjZSBDaGF0SW1wb3J0T3B0aW9ucyB7XG5cdGlucHV0UGF0aD86IFVSSTtcblx0dGFyZ2V0PzogQ2hhdEltcG9ydFRhcmdldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ2hhdEV4cG9ydEFjdGlvbnMoKSB7XG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBFeHBvcnRDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmV4cG9ydCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LmV4cG9ydC5sYWJlbCcsIFwiRXhwb3J0IENoYXQuLi5cIiksXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb3V0cHV0UGF0aD86IFVSSSkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsZURpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdFx0aWYgKCF3aWRnZXQgfHwgIXdpZGdldC52aWV3TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIW91dHB1dFBhdGgpIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdFVyaSA9IGpvaW5QYXRoKGF3YWl0IGZpbGVEaWFsb2dTZXJ2aWNlLmRlZmF1bHRGaWxlUGF0aCgpLCBkZWZhdWx0RmlsZU5hbWUpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlRGlhbG9nU2VydmljZS5zaG93U2F2ZURpYWxvZyh7XG5cdFx0XHRcdFx0ZGVmYXVsdFVyaSxcblx0XHRcdFx0XHRmaWx0ZXJzXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdXRwdXRQYXRoID0gcmVzdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGNoYXRTZXJ2aWNlLmdldFNlc3Npb24od2lkZ2V0LnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVzaW5nIHRvSlNPTiBvbiB0aGUgbW9kZWxcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KG1vZGVsLnRvRXhwb3J0KCksIHVuZGVmaW5lZCwgMikpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG91dHB1dFBhdGgsIGNvbnRlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEltcG9ydENoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaW1wb3J0Jyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5pbXBvcnQubGFiZWwnLCBcIkltcG9ydCBDaGF0Li4uXCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcHRzPzogQ2hhdEltcG9ydE9wdGlvbnMpIHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsZURpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdFx0bGV0IGlucHV0UGF0aCA9IG9wdHM/LmlucHV0UGF0aDtcblx0XHRcdGlmICghaW5wdXRQYXRoKSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRVcmkgPSBqb2luUGF0aChhd2FpdCBmaWxlRGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoKSwgZGVmYXVsdEZpbGVOYW1lKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd09wZW5EaWFsb2coe1xuXHRcdFx0XHRcdGRlZmF1bHRVcmksXG5cdFx0XHRcdFx0Y2FuU2VsZWN0RmlsZXM6IHRydWUsXG5cdFx0XHRcdFx0ZmlsdGVyc1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5wdXRQYXRoID0gcmVzdWx0WzBdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoaW5wdXRQYXRoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSByZXZpdmUoSlNPTi5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0aWYgKCFpc0V4cG9ydGFibGVTZXNzaW9uRGF0YShkYXRhKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjaGF0IHNlc3Npb24gZGF0YScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGltcG9ydGVkRGF0YSA9IGV4dHJhY3RFeHBvcnRhYmxlU2Vzc2lvbkRhdGEoZGF0YSk7XG5cblx0XHRcdFx0bGV0IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRcdFx0XHRsZXQgcmVzb2x2ZWRUYXJnZXQ6IHR5cGVvZiBDaGF0Vmlld1BhbmVUYXJnZXQgfCBQcmVmZXJyZWRHcm91cDtcblx0XHRcdFx0bGV0IG9wdGlvbnM6IElDaGF0RWRpdG9yT3B0aW9ucztcblxuXHRcdFx0XHRpZiAob3B0cz8udGFyZ2V0ID09PSAnY2hhdFZpZXdQYW5lJykge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsUmVmID0gY2hhdFNlcnZpY2UubG9hZFNlc3Npb25Gcm9tRGF0YShpbXBvcnRlZERhdGEsICdDaGF0SW1wb3J0RXhwb3J0I2ltcG9ydFRvQ2hhdFZpZXcnKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlID0gbW9kZWxSZWYub2JqZWN0LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0XHRcdHJlc29sdmVkVGFyZ2V0ID0gQ2hhdFZpZXdQYW5lVGFyZ2V0O1xuXHRcdFx0XHRcdFx0b3B0aW9ucyA9IHsgcGlubmVkOiB0cnVlIH07XG5cdFx0XHRcdFx0XHRhd2FpdCB3aWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgcmVzb2x2ZWRUYXJnZXQsIG9wdGlvbnMpO1xuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRtb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSA9IENoYXRFZGl0b3JJbnB1dC5nZXROZXdFZGl0b3JVcmkoKTtcblx0XHRcdFx0XHRyZXNvbHZlZFRhcmdldCA9IEFDVElWRV9HUk9VUDtcblx0XHRcdFx0XHRvcHRpb25zID0geyB0YXJnZXQ6IHsgZGF0YTogaW1wb3J0ZWREYXRhIH0sIHBpbm5lZDogdHJ1ZSB9O1xuXHRcdFx0XHRcdGF3YWl0IHdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24oc2Vzc2lvblJlc291cmNlLCByZXNvbHZlZFRhcmdldCwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixT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
