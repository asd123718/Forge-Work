var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { VSBuffer, streamToBuffer } from "../../../../../base/common/buffer.js";
import { Schemas } from "../../../../../base/common/network.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { hasKey } from "../../../../../base/common/types.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Categories } from "../../../../../platform/action/common/actionCommonCategories.js";
import { Action2 } from "../../../../../platform/actions/common/actions.js";
import { agentHostAuthority } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { IRemoteAgentHostService, remoteAgentHostLogOutputChannelId, AGENT_HOST_LOG_OUTPUT_CHANNEL_ID } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IsWebContext } from "../../../../../platform/contextkey/common/contextkeys.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { IOutputService } from "../../../../services/output/common/output.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { IChatWidgetService } from "../chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { buildLocalCopilotLogsUri, buildRemoteCopilotLogsUri, COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId, parseRemoteAuthorityFromScheme, resolveEventsUri } from "../copilotCliEventsUri.js";
import { findRelevantCopilotLogs, getRemoteConnectionForSession, readRemoteAgentHostLog, sanitizeFilePart } from "../chatDebug/agentHostLogSources.js";
import { buildAgentHostCustomizationsUri, buildAgentHostUsageUri } from "../chatDebug/agentHostUsageSidecar.js";
const AGENT_HOST_LOGGER_CHANNEL_ID = AGENT_HOST_LOG_OUTPUT_CHANNEL_ID;
const WINDOW_LOG_CHANNEL_ID = "rendererLog";
const SHARED_PROCESS_LOG_CHANNEL_ID = "shared";
const MAX_REMOTE_COPILOT_LOG_EXPORT_SIZE = 10 * 1024 * 1024;
const IAgentHostDebugLogsExportService = createDecorator("agentHostDebugLogsExportService");
let BrowserAgentHostDebugLogsExportService = class {
  constructor(fileDialogService, fileService) {
    this.fileDialogService = fileDialogService;
    this.fileService = fileService;
  }
  async save(exportName, files) {
    return exportFilesToLocalFolder(this.fileDialogService, this.fileService, exportName, files);
  }
};
BrowserAgentHostDebugLogsExportService = __decorateClass([
  __decorateParam(0, IFileDialogService),
  __decorateParam(1, IFileService)
], BrowserAgentHostDebugLogsExportService);
async function collectAgentHostDebugLogs(accessor, activeSession) {
  const pathService = accessor.get(IPathService);
  const agentHostService = accessor.get(IAgentHostService);
  const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
  const outputService = accessor.get(IOutputService);
  const fileService = accessor.get(IFileService);
  const notificationService = accessor.get(INotificationService);
  const textModelService = accessor.get(ITextModelService);
  const productService = accessor.get(IProductService);
  const logService = accessor.get(ILogService);
  const environmentService = accessor.get(IEnvironmentService);
  const userHome = pathService.userHome({ preferLocal: true });
  const eventsResult = resolveEventsUri(
    activeSession?.resource,
    userHome,
    (authority) => remoteAgentHostService.connections.find((c) => agentHostAuthority(c.address) === authority)
  );
  const channelIds = /* @__PURE__ */ new Set();
  let remoteConnection;
  let ahpLogNameFilter;
  if (activeSession) {
    if (activeSession.isLocal) {
      channelIds.add(AGENT_HOST_LOGGER_CHANNEL_ID);
      const localClientId = sanitizeFilePart(agentHostService.clientId);
      ahpLogNameFilter = (name) => name.includes(localClientId);
    } else {
      remoteConnection = getRemoteConnectionForSession(activeSession.resource, remoteAgentHostService.connections);
      if (remoteConnection) {
        channelIds.add(remoteAgentHostLogOutputChannelId(remoteConnection.address));
      }
    }
  } else {
    channelIds.add(AGENT_HOST_LOGGER_CHANNEL_ID);
    for (const connection of remoteAgentHostService.connections) {
      channelIds.add(remoteAgentHostLogOutputChannelId(connection.address));
    }
  }
  channelIds.add(WINDOW_LOG_CHANNEL_ID);
  channelIds.add(SHARED_PROCESS_LOG_CHANNEL_ID);
  const files = [];
  if (eventsResult.kind === "ok") {
    try {
      files.push(await createDebugLogFile("events.jsonl", eventsResult.resource, fileService));
    } catch {
    }
  }
  for (const channelId of channelIds) {
    const channel = outputService.getChannel(channelId);
    const descriptor = outputService.getChannelDescriptor(channelId);
    if (!channel || !descriptor) {
      continue;
    }
    const modelRef = await textModelService.createModelReference(channel.uri);
    try {
      const filename = `${descriptor.label.replace(/[/\\:*?"<>|]/g, "-")}.log`;
      files.push({ path: filename, contents: modelRef.object.textEditorModel.getValue() });
    } finally {
      modelRef.dispose();
    }
  }
  try {
    const ahpDir = joinPath(environmentService.logsHome, "ahp");
    const stat = await fileService.resolve(ahpDir, { resolveMetadata: true });
    for (const child of stat.children ?? []) {
      if (child.isDirectory || !child.name.endsWith(".jsonl") || ahpLogNameFilter && !ahpLogNameFilter(child.name)) {
        continue;
      }
      try {
        files.push(await createDebugLogFile(`ahp/${child.name}`, child.resource, fileService, child.size));
      } catch (error) {
        logService.warn(`[ExportAgentHostDebugLogs] Failed to read AHP log '${child.name}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch {
  }
  if (remoteConnection?.defaultDirectory) {
    try {
      const remoteLog = await readRemoteAgentHostLog(remoteConnection, productService.serverDataFolderName, fileService);
      if (remoteLog) {
        files.push({ path: "remote-agenthost.log", contents: remoteLog });
      }
    } catch (error) {
      logService.warn(`[ExportAgentHostDebugLogs] Failed to download remote agenthost.log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const rawSessionId = getCopilotCliSessionRawId(activeSession?.resource);
  const copilotLogsDir = activeSession ? rawSessionId ? activeSession.isLocal ? buildLocalCopilotLogsUri(userHome) : remoteConnection ? buildRemoteCopilotLogsUri(remoteConnection) : void 0 : void 0 : buildLocalCopilotLogsUri(userHome);
  if (copilotLogsDir) {
    const copilotLogFiles = await findRelevantCopilotLogs(copilotLogsDir, rawSessionId, fileService, logService);
    for (const file of copilotLogFiles) {
      try {
        files.push(await createDebugLogFile(file.path, file.resource, fileService, file.size, MAX_REMOTE_COPILOT_LOG_EXPORT_SIZE));
      } catch (error) {
        logService.warn(`[ExportAgentHostDebugLogs] Failed to read Copilot log '${file.path}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (rawSessionId) {
    const sidecars = [
      { path: "usage.jsonl", resource: buildAgentHostUsageUri(environmentService.userRoamingDataHome, rawSessionId) },
      { path: "customizations.json", resource: buildAgentHostCustomizationsUri(environmentService.userRoamingDataHome, rawSessionId) }
    ];
    for (const sidecar of sidecars) {
      try {
        files.push(await createDebugLogFile(sidecar.path, sidecar.resource, fileService));
      } catch {
      }
    }
  }
  if (files.length === 0) {
    notificationService.notify({
      severity: Severity.Warning,
      message: activeSession ? localize("exportDebugLogs.noFiles.activeSession", "No log files were found for the active Agent Host session.") : localize("exportDebugLogs.noFiles.currentWindow", "No Agent Host log files were found for the current window.")
    });
    return void 0;
  }
  const titleSlug = activeSession?.title ? `-${activeSession.title.replace(/[/\\:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}` : "";
  return { files, exportName: `ah-logs${titleSlug}` };
}
async function exportAgentHostDebugLogs(accessor, activeSession) {
  const exportService = accessor.get(IAgentHostDebugLogsExportService);
  const notificationService = accessor.get(INotificationService);
  const chatEntitlementService = accessor.get(IChatEntitlementService);
  const logs = await collectAgentHostDebugLogs(accessor, activeSession);
  if (!logs) {
    return;
  }
  try {
    const saved = await exportService.save(logs.exportName, logs.files);
    if (saved) {
      notificationService.warn(chatEntitlementService.isInternal ? localize("exportDebugLogs.privacyWarning.internal", "Note: This log may contain personal information such as auth tokens, file contents, or terminal output. It MUST be shared privately via Slack or in an issue filed on the microsoft/vscode-internalbacklog repo.") : localize("exportDebugLogs.privacyWarning", "Note: This log may contain personal information such as auth tokens, file contents, or terminal output. Please consider sharing privately or reviewing the contents carefully before sharing."));
    }
  } catch (error) {
    notificationService.notify({
      severity: Severity.Error,
      message: localize("exportDebugLogs.saveError", "Failed to save debug logs: {0}", error instanceof Error ? error.message : String(error))
    });
  }
}
const _ExportAgentHostDebugLogsAction = class _ExportAgentHostDebugLogsAction extends Action2 {
  constructor() {
    super({
      id: _ExportAgentHostDebugLogsAction.ID,
      title: localize2("exportAgentHostDebugLogs", "Export Agent Host Debug Logs..."),
      f1: true,
      category: Categories.Developer,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        IsWebContext.negate(),
        AGENT_HOST_ENABLED_CONTEXT_KEY
      )
    });
  }
  async run(accessor) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = chatWidgetService.lastFocusedWidget;
    const model = widget?.viewModel?.model;
    const activeSession = model ? toActiveAgentHostSession(model.sessionResource, model.title) : void 0;
    await exportAgentHostDebugLogs(accessor, activeSession);
  }
};
_ExportAgentHostDebugLogsAction.ID = "workbench.action.chat.exportAgentHostDebugLogs";
let ExportAgentHostDebugLogsAction = _ExportAgentHostDebugLogsAction;
function toActiveAgentHostSession(resource, title) {
  if (resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME) {
    return { resource, title, isLocal: true };
  }
  if (parseRemoteAuthorityFromScheme(resource.scheme)) {
    return { resource, title, isLocal: false };
  }
  return void 0;
}
async function exportFilesToLocalFolder(fileDialogService, fileService, exportName, files) {
  const folders = await fileDialogService.showOpenDialog({
    title: localize("exportDebugLogs.folderDialogTitle", "Select Folder for Agent Host Debug Logs"),
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    availableFileSystems: [Schemas.file]
  });
  const parentFolder = folders?.[0];
  if (!parentFolder) {
    return false;
  }
  const exportFolder = joinPath(parentFolder, exportName);
  await fileService.createFolder(exportFolder);
  for (const file of files) {
    const segments = toSafeRelativePathSegments(file.path);
    if (segments.length === 0) {
      continue;
    }
    let folder = exportFolder;
    for (const segment of segments.slice(0, -1)) {
      folder = joinPath(folder, segment);
      await fileService.createFolder(folder);
    }
    const target = joinPath(folder, segments[segments.length - 1]);
    if (hasKey(file, { contents: true })) {
      await fileService.writeFile(target, VSBuffer.fromString(file.contents));
    } else {
      const source = await fileService.readFileStream(file.resource, { length: file.size });
      await fileService.writeFile(target, source.value);
    }
  }
  return true;
}
async function createDebugLogFile(path, resource, fileService, size, maxInlineSize) {
  if (resource.scheme === Schemas.file) {
    const observedSize = size ?? (await fileService.resolve(resource, { resolveMetadata: true })).size;
    return { path, resource, size: observedSize };
  }
  if (size !== void 0) {
    const readSize = maxInlineSize === void 0 ? size : Math.min(size, maxInlineSize);
    const stream = await fileService.readFileStream(resource, { position: size - readSize, length: readSize });
    const content2 = await streamToBuffer(stream.value);
    return { path, contents: content2.toString() };
  }
  const content = await fileService.readFile(resource);
  return { path, contents: content.value.toString() };
}
function toSafeRelativePathSegments(path) {
  return path.replace(/\\/g, "/").split("/").filter((segment) => {
    return segment.length > 0 && segment !== "." && segment !== "..";
  }).map((segment) => segment.replace(/[/\\:*?"<>|]/g, "-"));
}
export {
  BrowserAgentHostDebugLogsExportService,
  ExportAgentHostDebugLogsAction,
  IAgentHostDebugLogsExportService,
  collectAgentHostDebugLogs,
  exportAgentHostDebugLogs,
  toActiveAgentHostSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGV4cG9ydEFnZW50SG9zdERlYnVnTG9nc0FjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyLCBzdHJlYW1Ub0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGFnZW50SG9zdEF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8sIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCByZW1vdGVBZ2VudEhvc3RMb2dPdXRwdXRDaGFubmVsSWQsIEFHRU5UX0hPU1RfTE9HX09VVFBVVF9DSEFOTkVMX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJc1dlYkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGJ1aWxkTG9jYWxDb3BpbG90TG9nc1VyaSwgYnVpbGRSZW1vdGVDb3BpbG90TG9nc1VyaSwgQ09QSUxPVF9DTElfTE9DQUxfQUhfU0NIRU1FLCBnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkLCBwYXJzZVJlbW90ZUF1dGhvcml0eUZyb21TY2hlbWUsIHJlc29sdmVFdmVudHNVcmkgfSBmcm9tICcuLi9jb3BpbG90Q2xpRXZlbnRzVXJpLmpzJztcbmltcG9ydCB7IGZpbmRSZWxldmFudENvcGlsb3RMb2dzLCBnZXRSZW1vdGVDb25uZWN0aW9uRm9yU2Vzc2lvbiwgcmVhZFJlbW90ZUFnZW50SG9zdExvZywgc2FuaXRpemVGaWxlUGFydCB9IGZyb20gJy4uL2NoYXREZWJ1Zy9hZ2VudEhvc3RMb2dTb3VyY2VzLmpzJztcbmltcG9ydCB7IGJ1aWxkQWdlbnRIb3N0Q3VzdG9taXphdGlvbnNVcmksIGJ1aWxkQWdlbnRIb3N0VXNhZ2VVcmkgfSBmcm9tICcuLi9jaGF0RGVidWcvYWdlbnRIb3N0VXNhZ2VTaWRlY2FyLmpzJztcblxuLyoqIE91dHB1dCBjaGFubmVsIElEIGZvciB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzIGxvZ2dlciAoZm9yd2FyZGVkIHZpYSBSZW1vdGVMb2dnZXJDaGFubmVsQ2xpZW50KS4gKi9cbmNvbnN0IEFHRU5UX0hPU1RfTE9HR0VSX0NIQU5ORUxfSUQgPSBBR0VOVF9IT1NUX0xPR19PVVRQVVRfQ0hBTk5FTF9JRDtcbi8qKiBPdXRwdXQgY2hhbm5lbCBJRCBmb3IgdGhlIGN1cnJlbnQgd2luZG93J3MgcmVuZGVyZXIgbG9nLiAqL1xuY29uc3QgV0lORE9XX0xPR19DSEFOTkVMX0lEID0gJ3JlbmRlcmVyTG9nJztcbi8qKiBPdXRwdXQgY2hhbm5lbCBJRCBmb3IgdGhlIHNoYXJlZCBwcm9jZXNzIGNvbXBvdW5kIGxvZy4gKi9cbmNvbnN0IFNIQVJFRF9QUk9DRVNTX0xPR19DSEFOTkVMX0lEID0gJ3NoYXJlZCc7XG5jb25zdCBNQVhfUkVNT1RFX0NPUElMT1RfTE9HX0VYUE9SVF9TSVpFID0gMTAgKiAxMDI0ICogMTAyNDtcblxuLyoqXG4gKiBEZXNjcmlwdGlvbiBvZiB0aGUgYWdlbnQtaG9zdCBzZXNzaW9uIHdob3NlIGxvZ3Mgc2hvdWxkIGJlIGV4cG9ydGVkLiBJZlxuICogbm90IHByb3ZpZGVkLCB0aGUgYWN0aW9uIGV4cG9ydHMgYWxsIGFnZW50LWhvc3QtcmVsYXRlZCBsb2dzIGZvciB0aGVcbiAqIGN1cnJlbnQgd2luZG93IChubyBzZXNzaW9uLXNwZWNpZmljIHNjb3Bpbmcgb3IgZXZlbnRzIGZpbGUpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBY3RpdmVBZ2VudEhvc3RTZXNzaW9uRm9yRXhwb3J0IHtcblx0LyoqIFRoZSBjaGF0IHNlc3Npb24gcmVzb3VyY2UuICovXG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdC8qKiBPcHRpb25hbCBkaXNwbGF5IHRpdGxlIHVzZWQgdG8gZGVyaXZlIHRoZSBkZWZhdWx0IHppcCBmaWxlbmFtZS4gKi9cblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIFRydWUgZm9yIGxvY2FsIGFnZW50LWhvc3Qgc2Vzc2lvbnMgKGBhZ2VudC1ob3N0LSpgIHNjaGVtZSkuICovXG5cdHJlYWRvbmx5IGlzTG9jYWw6IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIElBZ2VudEhvc3REZWJ1Z0xvZ0ZpbGUgPVxuXHR8IHsgcmVhZG9ubHkgcGF0aDogc3RyaW5nOyByZWFkb25seSBjb250ZW50czogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IHBhdGg6IHN0cmluZzsgcmVhZG9ubHkgcmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgc2l6ZTogbnVtYmVyIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdERlYnVnTG9nc0V4cG9ydCB7XG5cdHJlYWRvbmx5IGZpbGVzOiBJQWdlbnRIb3N0RGVidWdMb2dGaWxlW107XG5cdHJlYWRvbmx5IGV4cG9ydE5hbWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IElBZ2VudEhvc3REZWJ1Z0xvZ3NFeHBvcnRTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElBZ2VudEhvc3REZWJ1Z0xvZ3NFeHBvcnRTZXJ2aWNlPignYWdlbnRIb3N0RGVidWdMb2dzRXhwb3J0U2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3REZWJ1Z0xvZ3NFeHBvcnRTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRzYXZlKGV4cG9ydE5hbWU6IHN0cmluZywgZmlsZXM6IHJlYWRvbmx5IElBZ2VudEhvc3REZWJ1Z0xvZ0ZpbGVbXSk6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyQWdlbnRIb3N0RGVidWdMb2dzRXhwb3J0U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3REZWJ1Z0xvZ3NFeHBvcnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgc2F2ZShleHBvcnROYW1lOiBzdHJpbmcsIGZpbGVzOiByZWFkb25seSBJQWdlbnRIb3N0RGVidWdMb2dGaWxlW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gZXhwb3J0RmlsZXNUb0xvY2FsRm9sZGVyKHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UsIHRoaXMuZmlsZVNlcnZpY2UsIGV4cG9ydE5hbWUsIGZpbGVzKTtcblx0fVxufVxuXG4vKipcbiAqIFNoYXJlZCBpbXBsZW1lbnRhdGlvbiBvZiBcIkV4cG9ydCBBZ2VudCBIb3N0IERlYnVnIExvZ3NcIi4gQ29sbGVjdHMgdGhlXG4gKiBDb3BpbG90IENMSSBzZXNzaW9uIGV2ZW50cyBmaWxlIChpZiBhdmFpbGFibGUpLCB0aGUgd2luZG93L3NoYXJlZC9sb2NhbFxuICogYWdlbnQtaG9zdCBvdXRwdXQgY2hhbm5lbCBsb2dzLCByZW1vdGUgZm9yd2FyZGVkIGxvZ3MsIGFuZCB0aGUgQUhQXG4gKiB0cmFuc3BvcnQgSlNPTkwgbG9ncy5cbiAqXG4gKiBCb3RoIHRoZSB3b3JrYmVuY2gtc2lkZSBhY3Rpb24gKHJlc29sdmVzIHRoZSBhY3RpdmUgc2Vzc2lvbiB2aWFcbiAqIGBJQ2hhdFdpZGdldFNlcnZpY2VgKSBhbmQgdGhlIHNlc3Npb25zLWFwcC1zaWRlIGFjdGlvbiAocmVzb2x2ZXMgaXQgdmlhXG4gKiBgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2VgKSBjYWxsIGludG8gdGhpcyBoZWxwZXIuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb2xsZWN0QWdlbnRIb3N0RGVidWdMb2dzKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0YWN0aXZlU2Vzc2lvbjogSUFjdGl2ZUFnZW50SG9zdFNlc3Npb25Gb3JFeHBvcnQgfCB1bmRlZmluZWQsXG4pOiBQcm9taXNlPElBZ2VudEhvc3REZWJ1Z0xvZ3NFeHBvcnQgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgcGF0aFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVBhdGhTZXJ2aWNlKTtcblx0Y29uc3QgYWdlbnRIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0U2VydmljZSk7XG5cdGNvbnN0IHJlbW90ZUFnZW50SG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UpO1xuXHRjb25zdCBvdXRwdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPdXRwdXRTZXJ2aWNlKTtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdGNvbnN0IHRleHRNb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRNb2RlbFNlcnZpY2UpO1xuXHRjb25zdCBwcm9kdWN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvZHVjdFNlcnZpY2UpO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdGNvbnN0IHVzZXJIb21lID0gcGF0aFNlcnZpY2UudXNlckhvbWUoeyBwcmVmZXJMb2NhbDogdHJ1ZSB9KTtcblxuXHRjb25zdCBldmVudHNSZXN1bHQgPSByZXNvbHZlRXZlbnRzVXJpKFxuXHRcdGFjdGl2ZVNlc3Npb24/LnJlc291cmNlLFxuXHRcdHVzZXJIb21lLFxuXHRcdGF1dGhvcml0eSA9PiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBhZ2VudEhvc3RBdXRob3JpdHkoYy5hZGRyZXNzKSA9PT0gYXV0aG9yaXR5KSxcblx0KTtcblxuXHQvLyBDb2xsZWN0IGFsbCBvdXRwdXQgY2hhbm5lbCBJRHMgcmVsZXZhbnQgZm9yIHRoZSBjdXJyZW50IHNlc3Npb24ncyBhZ2VudCBob3N0LlxuXHRjb25zdCBjaGFubmVsSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Ly8gUmVtb3RlIGFnZW50IGhvc3QgY29ubmVjdGlvbiAoaWYgYW55KSwgZm9yIGRvd25sb2FkaW5nIGFnZW50aG9zdC5sb2cgZnJvbSB0aGUgcmVtb3RlLlxuXHRsZXQgcmVtb3RlQ29ubmVjdGlvbjogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvIHwgdW5kZWZpbmVkO1xuXHRsZXQgYWhwTG9nTmFtZUZpbHRlcjogKChuYW1lOiBzdHJpbmcpID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkO1xuXG5cdGlmIChhY3RpdmVTZXNzaW9uKSB7XG5cdFx0aWYgKGFjdGl2ZVNlc3Npb24uaXNMb2NhbCkge1xuXHRcdFx0Ly8gQWdlbnQgaG9zdCBwcm9jZXNzIGxvZ2dlciAoZm9yd2FyZGVkIGZyb20gdGhlIHV0aWxpdHkgcHJvY2Vzcylcblx0XHRcdGNoYW5uZWxJZHMuYWRkKEFHRU5UX0hPU1RfTE9HR0VSX0NIQU5ORUxfSUQpO1xuXHRcdFx0Y29uc3QgbG9jYWxDbGllbnRJZCA9IHNhbml0aXplRmlsZVBhcnQoYWdlbnRIb3N0U2VydmljZS5jbGllbnRJZCk7XG5cdFx0XHRhaHBMb2dOYW1lRmlsdGVyID0gbmFtZSA9PiBuYW1lLmluY2x1ZGVzKGxvY2FsQ2xpZW50SWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZW1vdGVDb25uZWN0aW9uID0gZ2V0UmVtb3RlQ29ubmVjdGlvbkZvclNlc3Npb24oYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSwgcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucyk7XG5cdFx0XHRpZiAocmVtb3RlQ29ubmVjdGlvbikge1xuXHRcdFx0XHRjaGFubmVsSWRzLmFkZChyZW1vdGVBZ2VudEhvc3RMb2dPdXRwdXRDaGFubmVsSWQocmVtb3RlQ29ubmVjdGlvbi5hZGRyZXNzKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGNoYW5uZWxJZHMuYWRkKEFHRU5UX0hPU1RfTE9HR0VSX0NIQU5ORUxfSUQpO1xuXHRcdGZvciAoY29uc3QgY29ubmVjdGlvbiBvZiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zKSB7XG5cdFx0XHRjaGFubmVsSWRzLmFkZChyZW1vdGVBZ2VudEhvc3RMb2dPdXRwdXRDaGFubmVsSWQoY29ubmVjdGlvbi5hZGRyZXNzKSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQWx3YXlzIGluY2x1ZGUgdGhlIHdpbmRvdyBhbmQgc2hhcmVkIHByb2Nlc3MgbG9nc1xuXHRjaGFubmVsSWRzLmFkZChXSU5ET1dfTE9HX0NIQU5ORUxfSUQpO1xuXHRjaGFubmVsSWRzLmFkZChTSEFSRURfUFJPQ0VTU19MT0dfQ0hBTk5FTF9JRCk7XG5cblx0Y29uc3QgZmlsZXM6IElBZ2VudEhvc3REZWJ1Z0xvZ0ZpbGVbXSA9IFtdO1xuXG5cdC8vIDEuIGV2ZW50cy5qc29ubFxuXHRpZiAoZXZlbnRzUmVzdWx0LmtpbmQgPT09ICdvaycpIHtcblx0XHR0cnkge1xuXHRcdFx0ZmlsZXMucHVzaChhd2FpdCBjcmVhdGVEZWJ1Z0xvZ0ZpbGUoJ2V2ZW50cy5qc29ubCcsIGV2ZW50c1Jlc3VsdC5yZXNvdXJjZSwgZmlsZVNlcnZpY2UpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIEZpbGUgbWF5IG5vdCBleGlzdCB5ZXQgaWYgdGhlIHNlc3Npb24gbmV2ZXIgd3JvdGUgYW55IGV2ZW50c1xuXHRcdH1cblx0fVxuXG5cdC8vIDIuIE91dHB1dCBjaGFubmVsc1xuXHRmb3IgKGNvbnN0IGNoYW5uZWxJZCBvZiBjaGFubmVsSWRzKSB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IG91dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbChjaGFubmVsSWQpO1xuXHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBvdXRwdXRTZXJ2aWNlLmdldENoYW5uZWxEZXNjcmlwdG9yKGNoYW5uZWxJZCk7XG5cdFx0aWYgKCFjaGFubmVsIHx8ICFkZXNjcmlwdG9yKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGNoYW5uZWwudXJpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZmlsZW5hbWUgPSBgJHtkZXNjcmlwdG9yLmxhYmVsLnJlcGxhY2UoL1svXFxcXDoqP1wiPD58XS9nLCAnLScpfS5sb2dgO1xuXHRcdFx0ZmlsZXMucHVzaCh7IHBhdGg6IGZpbGVuYW1lLCBjb250ZW50czogbW9kZWxSZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5nZXRWYWx1ZSgpIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRtb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gMy4gQUhQIHRyYW5zcG9ydCBKU09OTCBsb2dzIChvbmUgZmlsZSBwZXIgcmVtb3RlIGNvbm5lY3Rpb24sIHdyaXR0ZW4gdW5kZXIgPGxvZ3NIb21lPi9haHAvKS5cblx0Ly8gVGhlc2UgcmVwbGFjZSB0aGUgcGVyLWNvbm5lY3Rpb24gYGFnZW50aG9zdC48Y2xpZW50SWQ+YCBJUEMgdHJhZmZpYyBvdXRwdXQgY2hhbm5lbC5cblx0dHJ5IHtcblx0XHRjb25zdCBhaHBEaXIgPSBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUsICdhaHAnKTtcblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShhaHBEaXIsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygc3RhdC5jaGlsZHJlbiA/PyBbXSkge1xuXHRcdFx0aWYgKGNoaWxkLmlzRGlyZWN0b3J5IHx8ICFjaGlsZC5uYW1lLmVuZHNXaXRoKCcuanNvbmwnKSB8fCBhaHBMb2dOYW1lRmlsdGVyICYmICFhaHBMb2dOYW1lRmlsdGVyKGNoaWxkLm5hbWUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZmlsZXMucHVzaChhd2FpdCBjcmVhdGVEZWJ1Z0xvZ0ZpbGUoYGFocC8ke2NoaWxkLm5hbWV9YCwgY2hpbGQucmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBjaGlsZC5zaXplKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFtFeHBvcnRBZ2VudEhvc3REZWJ1Z0xvZ3NdIEZhaWxlZCB0byByZWFkIEFIUCBsb2cgJyR7Y2hpbGQubmFtZX0nOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gY2F0Y2gge1xuXHRcdC8vIEFIUCBsb2cgZGlyZWN0b3J5IG1heSBub3QgZXhpc3QgaWYgbm8gcmVtb3RlIGNvbm5lY3Rpb24gaGFzIGJlZW4gb3BlbmVkIG9yIGlmIGxvZ2dpbmcgaXMgZGlzYWJsZWQuXG5cdH1cblxuXHQvLyA0LiBGb3IgcmVtb3RlIGFnZW50IGhvc3RzLCBhbHNvIGRvd25sb2FkIHRoZSBhZ2VudGhvc3QubG9nIGZpbGUgZGlyZWN0bHkgZnJvbVxuXHQvLyB0aGUgcmVtb3RlIG1hY2hpbmUuIFRoZSBDTEkgbGF1bmNoZXMgdGhlIHNlcnZlciB3aXRoIGl0cyBkZWZhdWx0IGRhdGEgZGlyLFxuXHQvLyB3aGljaCBsaXZlcyBhdCBgPGhvbWU+LzxzZXJ2ZXJEYXRhRm9sZGVyTmFtZT4vZGF0YS9sb2dzLzxkYXRlc3RhbXA+L2FnZW50aG9zdC5sb2dgLlxuXHRpZiAocmVtb3RlQ29ubmVjdGlvbj8uZGVmYXVsdERpcmVjdG9yeSkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZW1vdGVMb2cgPSBhd2FpdCByZWFkUmVtb3RlQWdlbnRIb3N0TG9nKHJlbW90ZUNvbm5lY3Rpb24sIHByb2R1Y3RTZXJ2aWNlLnNlcnZlckRhdGFGb2xkZXJOYW1lLCBmaWxlU2VydmljZSk7XG5cdFx0XHRpZiAocmVtb3RlTG9nKSB7XG5cdFx0XHRcdGZpbGVzLnB1c2goeyBwYXRoOiAncmVtb3RlLWFnZW50aG9zdC5sb2cnLCBjb250ZW50czogcmVtb3RlTG9nIH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFtFeHBvcnRBZ2VudEhvc3REZWJ1Z0xvZ3NdIEZhaWxlZCB0byBkb3dubG9hZCByZW1vdGUgYWdlbnRob3N0LmxvZzogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gNS4gQ29waWxvdCBTREsgcHJvY2VzcyBsb2dzIHVuZGVyIDxDT1BJTE9UX0hPTUU+L2xvZ3MuXG5cdGNvbnN0IHJhd1Nlc3Npb25JZCA9IGdldENvcGlsb3RDbGlTZXNzaW9uUmF3SWQoYWN0aXZlU2Vzc2lvbj8ucmVzb3VyY2UpO1xuXHRjb25zdCBjb3BpbG90TG9nc0RpciA9IGFjdGl2ZVNlc3Npb25cblx0XHQ/IHJhd1Nlc3Npb25JZFxuXHRcdFx0PyBhY3RpdmVTZXNzaW9uLmlzTG9jYWxcblx0XHRcdFx0PyBidWlsZExvY2FsQ29waWxvdExvZ3NVcmkodXNlckhvbWUpXG5cdFx0XHRcdDogcmVtb3RlQ29ubmVjdGlvbiA/IGJ1aWxkUmVtb3RlQ29waWxvdExvZ3NVcmkocmVtb3RlQ29ubmVjdGlvbikgOiB1bmRlZmluZWRcblx0XHRcdDogdW5kZWZpbmVkXG5cdFx0OiBidWlsZExvY2FsQ29waWxvdExvZ3NVcmkodXNlckhvbWUpO1xuXHRpZiAoY29waWxvdExvZ3NEaXIpIHtcblx0XHRjb25zdCBjb3BpbG90TG9nRmlsZXMgPSBhd2FpdCBmaW5kUmVsZXZhbnRDb3BpbG90TG9ncyhjb3BpbG90TG9nc0RpciwgcmF3U2Vzc2lvbklkLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGNvcGlsb3RMb2dGaWxlcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZmlsZXMucHVzaChhd2FpdCBjcmVhdGVEZWJ1Z0xvZ0ZpbGUoZmlsZS5wYXRoLCBmaWxlLnJlc291cmNlLCBmaWxlU2VydmljZSwgZmlsZS5zaXplLCBNQVhfUkVNT1RFX0NPUElMT1RfTE9HX0VYUE9SVF9TSVpFKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFtFeHBvcnRBZ2VudEhvc3REZWJ1Z0xvZ3NdIEZhaWxlZCB0byByZWFkIENvcGlsb3QgbG9nICcke2ZpbGUucGF0aH0nOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyA2LiBDbGllbnQtbG9jYWwgY2FwdHVyZSBzaWRlY2FycyBmb3IgdGhlIHNlc3Npb24uIFRoZXNlIGhvbGQgZGF0YSB0aGUgU0RLXG5cdC8vIG5ldmVyIHBlcnNpc3RzIFx1MjAxNCBwZXItbW9kZWwtY2FsbCB0b2tlbi9jcmVkaXQgdXNhZ2UgKGBhc3Npc3RhbnQudXNhZ2VgIGlzXG5cdC8vIGVwaGVtZXJhbCkgYW5kIHRoZSBsb2FkZWQgY3VzdG9taXphdGlvbiBzZXQgKGBzZXNzaW9uLipfbG9hZGVkYCBsaWtld2lzZSkgXHUyMDE0XG5cdC8vIHNvIHdpdGhvdXQgdGhlbSBhbiBleHBvcnQgY2Fubm90IGV4cGxhaW4gYSB1c2FnZS9jb3N0IGRpc2NyZXBhbmN5IG9yIHNheVxuXHQvLyB3aGljaCBza2lsbHMvaG9va3MvTUNQIHNlcnZlcnMgd2VyZSBhY3R1YWxseSBhY3RpdmUuXG5cdGlmIChyYXdTZXNzaW9uSWQpIHtcblx0XHRjb25zdCBzaWRlY2FyczogeyBwYXRoOiBzdHJpbmc7IHJlc291cmNlOiBVUkkgfVtdID0gW1xuXHRcdFx0eyBwYXRoOiAndXNhZ2UuanNvbmwnLCByZXNvdXJjZTogYnVpbGRBZ2VudEhvc3RVc2FnZVVyaShlbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZSwgcmF3U2Vzc2lvbklkKSB9LFxuXHRcdFx0eyBwYXRoOiAnY3VzdG9taXphdGlvbnMuanNvbicsIHJlc291cmNlOiBidWlsZEFnZW50SG9zdEN1c3RvbWl6YXRpb25zVXJpKGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLCByYXdTZXNzaW9uSWQpIH0sXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IHNpZGVjYXIgb2Ygc2lkZWNhcnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZpbGVzLnB1c2goYXdhaXQgY3JlYXRlRGVidWdMb2dGaWxlKHNpZGVjYXIucGF0aCwgc2lkZWNhci5yZXNvdXJjZSwgZmlsZVNlcnZpY2UpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBBYnNlbnQgd2hlbiBhZ2VudC1ob3N0IGRlYnVnIGxvZ2dpbmcgd2FzIG9mZiBmb3IgdGhpcyBzZXNzaW9uLlxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmIChmaWxlcy5sZW5ndGggPT09IDApIHtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdG1lc3NhZ2U6IGFjdGl2ZVNlc3Npb25cblx0XHRcdFx0PyBsb2NhbGl6ZSgnZXhwb3J0RGVidWdMb2dzLm5vRmlsZXMuYWN0aXZlU2Vzc2lvbicsIFwiTm8gbG9nIGZpbGVzIHdlcmUgZm91bmQgZm9yIHRoZSBhY3RpdmUgQWdlbnQgSG9zdCBzZXNzaW9uLlwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdleHBvcnREZWJ1Z0xvZ3Mubm9GaWxlcy5jdXJyZW50V2luZG93JywgXCJObyBBZ2VudCBIb3N0IGxvZyBmaWxlcyB3ZXJlIGZvdW5kIGZvciB0aGUgY3VycmVudCB3aW5kb3cuXCIpLFxuXHRcdH0pO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCB0aXRsZVNsdWcgPSBhY3RpdmVTZXNzaW9uPy50aXRsZVxuXHRcdD8gYC0ke2FjdGl2ZVNlc3Npb24udGl0bGUucmVwbGFjZSgvWy9cXFxcOio/XCI8PnxcXHNdKy9nLCAnLScpLnJlcGxhY2UoL14tK3wtKyQvZywgJycpLnNsaWNlKDAsIDQwKX1gXG5cdFx0OiAnJztcblx0cmV0dXJuIHsgZmlsZXMsIGV4cG9ydE5hbWU6IGBhaC1sb2dzJHt0aXRsZVNsdWd9YCB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhwb3J0QWdlbnRIb3N0RGVidWdMb2dzKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0YWN0aXZlU2Vzc2lvbjogSUFjdGl2ZUFnZW50SG9zdFNlc3Npb25Gb3JFeHBvcnQgfCB1bmRlZmluZWQsXG4pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgZXhwb3J0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0RGVidWdMb2dzRXhwb3J0U2VydmljZSk7XG5cdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlKTtcblx0Y29uc3QgbG9ncyA9IGF3YWl0IGNvbGxlY3RBZ2VudEhvc3REZWJ1Z0xvZ3MoYWNjZXNzb3IsIGFjdGl2ZVNlc3Npb24pO1xuXHRpZiAoIWxvZ3MpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCBzYXZlZCA9IGF3YWl0IGV4cG9ydFNlcnZpY2Uuc2F2ZShsb2dzLmV4cG9ydE5hbWUsIGxvZ3MuZmlsZXMpO1xuXHRcdGlmIChzYXZlZCkge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKGNoYXRFbnRpdGxlbWVudFNlcnZpY2UuaXNJbnRlcm5hbFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdleHBvcnREZWJ1Z0xvZ3MucHJpdmFjeVdhcm5pbmcuaW50ZXJuYWwnLCBcIk5vdGU6IFRoaXMgbG9nIG1heSBjb250YWluIHBlcnNvbmFsIGluZm9ybWF0aW9uIHN1Y2ggYXMgYXV0aCB0b2tlbnMsIGZpbGUgY29udGVudHMsIG9yIHRlcm1pbmFsIG91dHB1dC4gSXQgTVVTVCBiZSBzaGFyZWQgcHJpdmF0ZWx5IHZpYSBTbGFjayBvciBpbiBhbiBpc3N1ZSBmaWxlZCBvbiB0aGUgbWljcm9zb2Z0L3ZzY29kZS1pbnRlcm5hbGJhY2tsb2cgcmVwby5cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnZXhwb3J0RGVidWdMb2dzLnByaXZhY3lXYXJuaW5nJywgXCJOb3RlOiBUaGlzIGxvZyBtYXkgY29udGFpbiBwZXJzb25hbCBpbmZvcm1hdGlvbiBzdWNoIGFzIGF1dGggdG9rZW5zLCBmaWxlIGNvbnRlbnRzLCBvciB0ZXJtaW5hbCBvdXRwdXQuIFBsZWFzZSBjb25zaWRlciBzaGFyaW5nIHByaXZhdGVseSBvciByZXZpZXdpbmcgdGhlIGNvbnRlbnRzIGNhcmVmdWxseSBiZWZvcmUgc2hhcmluZy5cIikpO1xuXHRcdH1cblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnZXhwb3J0RGVidWdMb2dzLnNhdmVFcnJvcicsIFwiRmFpbGVkIHRvIHNhdmUgZGVidWcgbG9nczogezB9XCIsIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSksXG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBXb3JrYmVuY2gtc2lkZSBhY3Rpb24uIFVzZXMgdGhlIGxhc3QtZm9jdXNlZCBjaGF0IHdpZGdldCdzIHZpZXcgbW9kZWwgdG9cbiAqIGZpbmQgdGhlIGFjdGl2ZSBDb3BpbG90IENMSSBjaGF0IHNlc3Npb24uIFN1aXRhYmxlIGZvciB2c2NvZGUgd2hlcmUgdGhlXG4gKiBhZ2VudHMtd2luZG93LXNwZWNpZmljIGBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZWAgaXMgbm90IHByZXNlbnQuXG4gKi9cbmV4cG9ydCBjbGFzcyBFeHBvcnRBZ2VudEhvc3REZWJ1Z0xvZ3NBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmV4cG9ydEFnZW50SG9zdERlYnVnTG9ncyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEV4cG9ydEFnZW50SG9zdERlYnVnTG9nc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2V4cG9ydEFnZW50SG9zdERlYnVnTG9ncycsIFwiRXhwb3J0IEFnZW50IEhvc3QgRGVidWcgTG9ncy4uLlwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRJc1dlYkNvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdEFHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWSxcblx0XHRcdCksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGNvbnN0IG1vZGVsID0gd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBtb2RlbCA/IHRvQWN0aXZlQWdlbnRIb3N0U2Vzc2lvbihtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIG1vZGVsLnRpdGxlKSA6IHVuZGVmaW5lZDtcblx0XHRhd2FpdCBleHBvcnRBZ2VudEhvc3REZWJ1Z0xvZ3MoYWNjZXNzb3IsIGFjdGl2ZVNlc3Npb24pO1xuXHR9XG59XG5cbi8qKlxuICogVHJhbnNsYXRlcyBhIGNoYXQgc2Vzc2lvbiBVUkkgc2NoZW1lIGludG8gYW4gYWdlbnQtaG9zdCBzZXNzaW9uIGNvbnRleHQsXG4gKiBvciBgdW5kZWZpbmVkYCBpZiB0aGUgc2NoZW1lIGRvZXMgbm90IGJlbG9uZyB0byBhIENvcGlsb3QgQ0xJIGFnZW50LWhvc3RcbiAqIHNlc3Npb24gKGkuZS4gbG9jYWwgQUggb3IgcmVtb3RlIEFIOyB0aGUgRUggQ0xJIGV4dGVuc2lvbidzIG93blxuICogYGNvcGlsb3RjbGk6YCBzZXNzaW9ucyBhcmUgZXhjbHVkZWQpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9BY3RpdmVBZ2VudEhvc3RTZXNzaW9uKHJlc291cmNlOiBVUkksIHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQWN0aXZlQWdlbnRIb3N0U2Vzc2lvbkZvckV4cG9ydCB8IHVuZGVmaW5lZCB7XG5cdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IENPUElMT1RfQ0xJX0xPQ0FMX0FIX1NDSEVNRSkge1xuXHRcdHJldHVybiB7IHJlc291cmNlLCB0aXRsZSwgaXNMb2NhbDogdHJ1ZSB9O1xuXHR9XG5cdGlmIChwYXJzZVJlbW90ZUF1dGhvcml0eUZyb21TY2hlbWUocmVzb3VyY2Uuc2NoZW1lKSkge1xuXHRcdHJldHVybiB7IHJlc291cmNlLCB0aXRsZSwgaXNMb2NhbDogZmFsc2UgfTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5hc3luYyBmdW5jdGlvbiBleHBvcnRGaWxlc1RvTG9jYWxGb2xkZXIoXG5cdGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdGV4cG9ydE5hbWU6IHN0cmluZyxcblx0ZmlsZXM6IHJlYWRvbmx5IElBZ2VudEhvc3REZWJ1Z0xvZ0ZpbGVbXSxcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCBmb2xkZXJzID0gYXdhaXQgZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd09wZW5EaWFsb2coe1xuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnZXhwb3J0RGVidWdMb2dzLmZvbGRlckRpYWxvZ1RpdGxlJywgXCJTZWxlY3QgRm9sZGVyIGZvciBBZ2VudCBIb3N0IERlYnVnIExvZ3NcIiksXG5cdFx0Y2FuU2VsZWN0RmlsZXM6IGZhbHNlLFxuXHRcdGNhblNlbGVjdEZvbGRlcnM6IHRydWUsXG5cdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0YXZhaWxhYmxlRmlsZVN5c3RlbXM6IFtTY2hlbWFzLmZpbGVdLFxuXHR9KTtcblxuXHRjb25zdCBwYXJlbnRGb2xkZXIgPSBmb2xkZXJzPy5bMF07XG5cdGlmICghcGFyZW50Rm9sZGVyKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgZXhwb3J0Rm9sZGVyID0gam9pblBhdGgocGFyZW50Rm9sZGVyLCBleHBvcnROYW1lKTtcblx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGV4cG9ydEZvbGRlcik7XG5cdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdGNvbnN0IHNlZ21lbnRzID0gdG9TYWZlUmVsYXRpdmVQYXRoU2VnbWVudHMoZmlsZS5wYXRoKTtcblx0XHRpZiAoc2VnbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRsZXQgZm9sZGVyID0gZXhwb3J0Rm9sZGVyO1xuXHRcdGZvciAoY29uc3Qgc2VnbWVudCBvZiBzZWdtZW50cy5zbGljZSgwLCAtMSkpIHtcblx0XHRcdGZvbGRlciA9IGpvaW5QYXRoKGZvbGRlciwgc2VnbWVudCk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZm9sZGVyKTtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gam9pblBhdGgoZm9sZGVyLCBzZWdtZW50c1tzZWdtZW50cy5sZW5ndGggLSAxXSk7XG5cdFx0aWYgKGhhc0tleShmaWxlLCB7IGNvbnRlbnRzOiB0cnVlIH0pKSB7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodGFyZ2V0LCBWU0J1ZmZlci5mcm9tU3RyaW5nKGZpbGUuY29udGVudHMpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGVTdHJlYW0oZmlsZS5yZXNvdXJjZSwgeyBsZW5ndGg6IGZpbGUuc2l6ZSB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXQsIHNvdXJjZS52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVEZWJ1Z0xvZ0ZpbGUocGF0aDogc3RyaW5nLCByZXNvdXJjZTogVVJJLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLCBzaXplPzogbnVtYmVyLCBtYXhJbmxpbmVTaXplPzogbnVtYmVyKTogUHJvbWlzZTxJQWdlbnRIb3N0RGVidWdMb2dGaWxlPiB7XG5cdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdGNvbnN0IG9ic2VydmVkU2l6ZSA9IHNpemUgPz8gKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pKS5zaXplO1xuXHRcdHJldHVybiB7IHBhdGgsIHJlc291cmNlLCBzaXplOiBvYnNlcnZlZFNpemUgfTtcblx0fVxuXHQvLyBOb24tbG9jYWwgcmVzb3VyY2VzIChlLmcuIHJlbW90ZSBhZ2VudC1ob3N0IGxvZ3MpIGNhbid0IGJlIHN0cmVhbWVkIGZyb21cblx0Ly8gZGlzaywgc28gcmVhZCB0aGVtIGlubGluZSwgYm91bmRlZCB0byB0aGUgY2FwdHVyZWQgc2l6ZSB3aGVuIGtub3duLlxuXHRpZiAoc2l6ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgcmVhZFNpemUgPSBtYXhJbmxpbmVTaXplID09PSB1bmRlZmluZWQgPyBzaXplIDogTWF0aC5taW4oc2l6ZSwgbWF4SW5saW5lU2l6ZSk7XG5cdFx0Y29uc3Qgc3RyZWFtID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGVTdHJlYW0ocmVzb3VyY2UsIHsgcG9zaXRpb246IHNpemUgLSByZWFkU2l6ZSwgbGVuZ3RoOiByZWFkU2l6ZSB9KTtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgc3RyZWFtVG9CdWZmZXIoc3RyZWFtLnZhbHVlKTtcblx0XHRyZXR1cm4geyBwYXRoLCBjb250ZW50czogY29udGVudC50b1N0cmluZygpIH07XG5cdH1cblx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0cmV0dXJuIHsgcGF0aCwgY29udGVudHM6IGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSB9O1xufVxuXG5mdW5jdGlvbiB0b1NhZmVSZWxhdGl2ZVBhdGhTZWdtZW50cyhwYXRoOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdHJldHVybiBwYXRoXG5cdFx0LnJlcGxhY2UoL1xcXFwvZywgJy8nKVxuXHRcdC5zcGxpdCgnLycpXG5cdFx0LmZpbHRlcihzZWdtZW50ID0+IHtcblx0XHRcdHJldHVybiBzZWdtZW50Lmxlbmd0aCA+IDAgJiYgc2VnbWVudCAhPT0gJy4nICYmIHNlZ21lbnQgIT09ICcuLic7XG5cdFx0fSlcblx0XHQubWFwKHNlZ21lbnQgPT4gc2VnbWVudC5yZXBsYWNlKC9bL1xcXFw6Kj9cIjw+fF0vZywgJy0nKSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxzQkFBc0I7QUFDekMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUV2QixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNB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
