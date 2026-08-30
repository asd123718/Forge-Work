import { joinPath } from "../../../../../base/common/resources.js";
import { Schemas } from "../../../../../base/common/network.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { DEFAULT_LOCAL_TRANSCRIPTION_MODEL, ILocalTranscriptionService } from "../../../../../platform/localTranscription/common/localTranscription.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../../platform/progress/common/progress.js";
import { CHAT_CATEGORY } from "../../browser/actions/chatActions.js";
import { INSTALL_DICTATION_MODEL_COMMAND_ID } from "../../browser/speechToText/chatSpeechToTextService.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
function registerInstallDictationModelAction() {
  const enabled = ContextKeyExpr.and(
    ChatContextKeys.enabled,
    ContextKeyExpr.equals("config.dictation.enabled", true)
  );
  registerAction2(class InstallDictationModelAction extends Action2 {
    constructor() {
      super({
        id: INSTALL_DICTATION_MODEL_COMMAND_ID,
        category: CHAT_CATEGORY,
        title: localize2("chat.installDictationModel", "Install Dictation Model from Local Package..."),
        precondition: enabled,
        menu: {
          id: MenuId.CommandPalette,
          when: enabled
        }
      });
    }
    async run(accessor) {
      const localTranscriptionService = accessor.get(ILocalTranscriptionService);
      const notificationService = accessor.get(INotificationService);
      const fileDialogService = accessor.get(IFileDialogService);
      const progressService = accessor.get(IProgressService);
      const environmentService = accessor.get(IEnvironmentService);
      if (!localTranscriptionService.isSupported) {
        notificationService.warn(localize("chat.installDictationModel.unsupported", "On-device dictation is not supported on this platform."));
        return;
      }
      const sources = await fileDialogService.showOpenDialog({
        title: localize("chat.installDictationModel.dialogTitle", "Select the {0} CPU model package (.zip) or folder", DEFAULT_LOCAL_TRANSCRIPTION_MODEL),
        openLabel: localize("chat.installDictationModel.openLabel", "Install"),
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        filters: [{ name: localize("chat.installDictationModel.filter", "Foundry Local Model Package"), extensions: ["zip"] }]
      });
      const source = sources?.[0];
      if (!source) {
        return;
      }
      if (source.scheme !== Schemas.file) {
        notificationService.error(localize("chat.installDictationModel.localOnly", "The dictation model package must be on the local file system."));
        return;
      }
      const cacheDir = joinPath(environmentService.cacheHome, "chatDictationModels").fsPath;
      try {
        const result = await progressService.withProgress({
          location: ProgressLocation.Notification,
          title: localize("chat.installDictationModel.progress", "Installing dictation model...")
        }, () => localTranscriptionService.importModel({ sourcePath: source.fsPath, cacheDir }));
        notificationService.info(localize(
          "chat.installDictationModel.success",
          "Installed {0} version {1}.",
          result.model,
          result.version
        ));
      } catch (error) {
        notificationService.error(localize(
          "chat.installDictationModel.error",
          "Failed to install the dictation model: {0}",
          error instanceof Error ? error.message : String(error)
        ));
      }
    }
  });
}
export {
  registerInstallDictationModelAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGVsZWN0cm9uLWJyb3dzZXJcXGFjdGlvbnNcXGluc3RhbGxEaWN0YXRpb25Nb2RlbEFjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MT0NBTF9UUkFOU0NSSVBUSU9OX01PREVMLCBJTG9jYWxUcmFuc2NyaXB0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvY2FsVHJhbnNjcmlwdGlvbi9jb21tb24vbG9jYWxUcmFuc2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBDSEFUX0NBVEVHT1JZIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElOU1RBTExfRElDVEFUSU9OX01PREVMX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi9icm93c2VyL3NwZWVjaFRvVGV4dC9jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJJbnN0YWxsRGljdGF0aW9uTW9kZWxBY3Rpb24oKTogdm9pZCB7XG5cdGNvbnN0IGVuYWJsZWQgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuZGljdGF0aW9uLmVuYWJsZWQnLCB0cnVlKSxcblx0KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgSW5zdGFsbERpY3RhdGlvbk1vZGVsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBJTlNUQUxMX0RJQ1RBVElPTl9NT0RFTF9DT01NQU5EX0lELFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5pbnN0YWxsRGljdGF0aW9uTW9kZWwnLCBcIkluc3RhbGwgRGljdGF0aW9uIE1vZGVsIGZyb20gTG9jYWwgUGFja2FnZS4uLlwiKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBlbmFibGVkLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHR3aGVuOiBlbmFibGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBsb2NhbFRyYW5zY3JpcHRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2NhbFRyYW5zY3JpcHRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsZURpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHByb2dyZXNzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvZ3Jlc3NTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRcdGlmICghbG9jYWxUcmFuc2NyaXB0aW9uU2VydmljZS5pc1N1cHBvcnRlZCkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ2NoYXQuaW5zdGFsbERpY3RhdGlvbk1vZGVsLnVuc3VwcG9ydGVkJywgXCJPbi1kZXZpY2UgZGljdGF0aW9uIGlzIG5vdCBzdXBwb3J0ZWQgb24gdGhpcyBwbGF0Zm9ybS5cIikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNvdXJjZXMgPSBhd2FpdCBmaWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdC5pbnN0YWxsRGljdGF0aW9uTW9kZWwuZGlhbG9nVGl0bGUnLCBcIlNlbGVjdCB0aGUgezB9IENQVSBtb2RlbCBwYWNrYWdlICguemlwKSBvciBmb2xkZXJcIiwgREVGQVVMVF9MT0NBTF9UUkFOU0NSSVBUSU9OX01PREVMKSxcblx0XHRcdFx0b3BlbkxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5pbnN0YWxsRGljdGF0aW9uTW9kZWwub3BlbkxhYmVsJywgXCJJbnN0YWxsXCIpLFxuXHRcdFx0XHRjYW5TZWxlY3RGaWxlczogdHJ1ZSxcblx0XHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSxcblx0XHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRcdGZpbHRlcnM6IFt7IG5hbWU6IGxvY2FsaXplKCdjaGF0Lmluc3RhbGxEaWN0YXRpb25Nb2RlbC5maWx0ZXInLCBcIkZvdW5kcnkgTG9jYWwgTW9kZWwgUGFja2FnZVwiKSwgZXh0ZW5zaW9uczogWyd6aXAnXSB9XSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc291cmNlID0gc291cmNlcz8uWzBdO1xuXHRcdFx0aWYgKCFzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdjaGF0Lmluc3RhbGxEaWN0YXRpb25Nb2RlbC5sb2NhbE9ubHknLCBcIlRoZSBkaWN0YXRpb24gbW9kZWwgcGFja2FnZSBtdXN0IGJlIG9uIHRoZSBsb2NhbCBmaWxlIHN5c3RlbS5cIikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNhY2hlRGlyID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLmNhY2hlSG9tZSwgJ2NoYXREaWN0YXRpb25Nb2RlbHMnKS5mc1BhdGg7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0Lmluc3RhbGxEaWN0YXRpb25Nb2RlbC5wcm9ncmVzcycsIFwiSW5zdGFsbGluZyBkaWN0YXRpb24gbW9kZWwuLi5cIiksXG5cdFx0XHRcdH0sICgpID0+IGxvY2FsVHJhbnNjcmlwdGlvblNlcnZpY2UuaW1wb3J0TW9kZWwoeyBzb3VyY2VQYXRoOiBzb3VyY2UuZnNQYXRoLCBjYWNoZURpciB9KSk7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZShcblx0XHRcdFx0XHQnY2hhdC5pbnN0YWxsRGljdGF0aW9uTW9kZWwuc3VjY2VzcycsXG5cdFx0XHRcdFx0XCJJbnN0YWxsZWQgezB9IHZlcnNpb24gezF9LlwiLFxuXHRcdFx0XHRcdHJlc3VsdC5tb2RlbCxcblx0XHRcdFx0XHRyZXN1bHQudmVyc2lvbixcblx0XHRcdFx0KSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKFxuXHRcdFx0XHRcdCdjaGF0Lmluc3RhbGxEaWN0YXRpb25Nb2RlbC5lcnJvcicsXG5cdFx0XHRcdFx0XCJGYWlsZWQgdG8gaW5zdGFsbCB0aGUgZGljdGF0aW9uIG1vZGVsOiB7MH1cIixcblx0XHRcdFx0XHRlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFFeEIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQ0FBbUMsa0NBQWtDO0FBQzlFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDBDQUEwQztBQUNuRCxTQUFTLHVCQUF1QjtBQUV6QixTQUFTLHNDQUE0QztBQUMzRCxRQUFNLFVBQVUsZUFBZTtBQUFBLElBQzlCLGdCQUFnQjtBQUFBLElBQ2hCLGVBQWUsT0FBTyw0QkFBNEIsSUFBSTtBQUFBLEVBQ3ZEO0FBRUEsa0JBQWdCLE1BQU0sb0NBQW9DLFFBQVE7QUFBQSxJQUNqRSxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osVUFBVTtBQUFBLFFBQ1YsT0FBTyxVQUFVLDhCQUE4QiwrQ0FBK0M7QUFBQSxRQUM5RixjQUFjO0FBQUEsUUFDZCxNQUFNO0FBQUEsVUFDTCxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFlBQU0sNEJBQTRCLFNBQVMsSUFBSSwwQkFBMEI7QUFDekUsWUFBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUM3RCxZQUFNLG9CQUFvQixTQUFTLElBQUksa0JBQWtCO0FBQ3pELFlBQU0sa0JBQWtCLFNBQVMsSUFBSSxnQkFBZ0I7QUFDckQsWUFBTSxxQkFBcUIsU0FBUyxJQUFJLG1CQUFtQjtBQUMzRCxVQUFJLENBQUMsMEJBQTBCLGFBQWE7QUFDM0MsNEJBQW9CLEtBQUssU0FBUywwQ0FBMEMsd0RBQXdELENBQUM7QUFDckk7QUFBQSxNQUNEO0FBRUEsWUFBTSxVQUFVLE1BQU0sa0JBQWtCLGVBQWU7QUFBQSxRQUN0RCxPQUFPLFNBQVMsMENBQTBDLHFEQUFxRCxpQ0FBaUM7QUFBQSxRQUNoSixXQUFXLFNBQVMsd0NBQXdDLFNBQVM7QUFBQSxRQUNyRSxnQkFBZ0I7QUFBQSxRQUNoQixrQkFBa0I7QUFBQSxRQUNsQixlQUFlO0FBQUEsUUFDZixTQUFTLENBQUMsRUFBRSxNQUFNLFNBQVMscUNBQXFDLDZCQUE2QixHQUFHLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUFBLE1BQ3RILENBQUM7QUFDRCxZQUFNLFNBQVMsVUFBVSxDQUFDO0FBQzFCLFVBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxNQUNEO0FBQ0EsVUFBSSxPQUFPLFdBQVcsUUFBUSxNQUFNO0FBQ25DLDRCQUFvQixNQUFNLFNBQVMsd0NBQXdDLCtEQUErRCxDQUFDO0FBQzNJO0FBQUEsTUFDRDtBQUVBLFlBQU0sV0FBVyxTQUFTLG1CQUFtQixXQUFXLHFCQUFxQixFQUFFO0FBQy9FLFVBQUk7QUFDSCxjQUFNLFNBQVMsTUFBTSxnQkFBZ0IsYUFBYTtBQUFBLFVBQ2pELFVBQVUsaUJBQWlCO0FBQUEsVUFDM0IsT0FBTyxTQUFTLHVDQUF1QywrQkFBK0I7QUFBQSxRQUN2RixHQUFHLE1BQU0sMEJBQTBCLFlBQVksRUFBRSxZQUFZLE9BQU8sUUFBUSxTQUFTLENBQUMsQ0FBQztBQUN2Riw0QkFBb0IsS0FBSztBQUFBLFVBQ3hCO0FBQUEsVUFDQTtBQUFBLFVBQ0EsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFFBQ1IsQ0FBQztBQUFBLE1BQ0YsU0FBUyxPQUFPO0FBQ2YsNEJBQW9CLE1BQU07QUFBQSxVQUN6QjtBQUFBLFVBQ0E7QUFBQSxVQUNBLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUs7QUFBQSxRQUN0RCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRjsiLAogICJuYW1lcyI6IFtdCn0K
