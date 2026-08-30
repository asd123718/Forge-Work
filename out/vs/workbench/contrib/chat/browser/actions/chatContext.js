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
import { Codicon } from "../../../../../base/common/codicons.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { isElectron } from "../../../../../base/common/platform.js";
import { extUriBiasedIgnorePathCase } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { agentHostAuthority } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { IRemoteAgentHostService } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../common/editor.js";
import { DiffEditorInput } from "../../../../common/editor/diffEditorInput.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { UntitledTextEditorInput } from "../../../../services/untitled/common/untitledTextEditorInput.js";
import { FileEditorInput } from "../../../files/browser/editors/fileEditorInput.js";
import { NotebookEditorInput } from "../../../notebook/common/notebookEditorInput.js";
import { IChatContextPickService } from "../attachments/chatContextPickService.js";
import { toToolSetVariableEntry, toToolVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { isToolSet, ToolDataSource } from "../../common/tools/languageModelToolsService.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { imageToHash, isImage } from "../widget/input/editor/chatPasteProviders.js";
import { convertBufferToScreenshotVariable } from "../attachments/chatScreenshotContext.js";
import { ChatInstructionsPickerPick } from "../promptSyntax/attachInstructionsAction.js";
import { IChatSessionsService, isAgentHostTarget } from "../../common/chatSessionsService.js";
import { getAgentSessionProviderIcon, AgentSessionProviders } from "../agentSessions/agentSessions.js";
import { ITerminalService } from "../../../terminal/browser/terminal.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { buildHostLocalEventsPath } from "../copilotCliEventsUri.js";
import { IChatSessionRoutingProviderService } from "../../common/sessionRouter.js";
const EnableChatDebugToolsCommandId = "chat.enableDebugTools";
function shouldShowOpenEditorsContext(widget, hasEligibleOpenEditors) {
  if (!hasEligibleOpenEditors) {
    return false;
  }
  const sessionResource = widget.viewModel?.sessionResource;
  if (sessionResource && isAgentHostTarget(getChatSessionType(sessionResource))) {
    return false;
  }
  if (widget.lockedAgentId && isAgentHostTarget(widget.lockedAgentId)) {
    return false;
  }
  return true;
}
function isSameSessionWorkspace(current, candidate, extUri = extUriBiasedIgnorePathCase) {
  const normalizeRepository = (value) => value?.replace(/[\\/]+$/, "").toLowerCase();
  const currentRepo = normalizeRepository(current.repo);
  const candidateRepo = normalizeRepository(candidate.repo);
  if (currentRepo && candidateRepo) {
    return currentRepo === candidateRepo;
  }
  return !!current.cwd && !!candidate.cwd && extUri.isEqual(URI.file(current.cwd), URI.file(candidate.cwd));
}
function getSessionWorkspaceName(workspace) {
  const repoName = workspace.repo?.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1);
  const folderName = workspace.cwd?.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1);
  return repoName || folderName || localize("chatContext.sessions.thisWorkspace", "This Workspace");
}
let ChatContextContributions = class extends Disposable {
  constructor(instantiationService, contextPickService) {
    super();
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ToolsContextPickerPick)));
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ChatInstructionsPickerPick)));
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(OpenEditorContextValuePick)));
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ClipboardImageContextValuePick)));
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ScreenshotContextValuePick)));
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(SessionReferenceContextPickerPick)));
  }
};
ChatContextContributions.ID = "chat.contextContributions";
ChatContextContributions = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IChatContextPickService)
], ChatContextContributions);
class ToolsContextPickerPick {
  constructor() {
    this.type = "pickerPick";
    this.label = localize("chatContext.tools", "Tools...");
    this.icon = Codicon.tools;
    this.ordinal = -500;
  }
  isEnabled(widget) {
    return !!widget.attachmentCapabilities.supportsToolAttachments;
  }
  asPicker(widget) {
    const items = [];
    for (const [entry, enabled] of widget.input.selectedToolsModel.entriesMap.get()) {
      if (enabled) {
        if (isToolSet(entry)) {
          items.push({
            toolInfo: ToolDataSource.classify(entry.source),
            label: entry.referenceName,
            description: entry.description,
            asAttachment: () => toToolSetVariableEntry(entry)
          });
        } else {
          items.push({
            toolInfo: ToolDataSource.classify(entry.source),
            label: entry.toolReferenceName ?? entry.displayName,
            description: entry.userDescription ?? entry.modelDescription,
            asAttachment: () => toToolVariableEntry(entry)
          });
        }
      }
    }
    items.sort((a, b) => {
      let res = a.toolInfo.ordinal - b.toolInfo.ordinal;
      if (res === 0) {
        res = a.toolInfo.label.localeCompare(b.toolInfo.label);
      }
      if (res === 0) {
        res = a.label.localeCompare(b.label);
      }
      return res;
    });
    let lastGroupLabel;
    const picks = [];
    for (const item of items) {
      if (lastGroupLabel !== item.toolInfo.label) {
        picks.push({ type: "separator", label: item.toolInfo.label });
        lastGroupLabel = item.toolInfo.label;
      }
      picks.push(item);
    }
    return {
      placeholder: localize("chatContext.tools.placeholder", "Select a tool"),
      picks: Promise.resolve(picks)
    };
  }
}
let OpenEditorContextValuePick = class {
  constructor(_editorService, _labelService) {
    this._editorService = _editorService;
    this._labelService = _labelService;
    this.type = "valuePick";
    this.label = localize("chatContext.editors", "Open Editors");
    this.icon = Codicon.file;
    this.ordinal = 800;
  }
  isEnabled(widget) {
    const hasEligibleOpenEditors = this._editorService.editors.some((e) => e instanceof FileEditorInput || e instanceof DiffEditorInput || e instanceof UntitledTextEditorInput);
    return shouldShowOpenEditorsContext(widget, hasEligibleOpenEditors);
  }
  async asAttachment() {
    const result = [];
    for (const editor of this._editorService.editors) {
      if (!(editor instanceof FileEditorInput || editor instanceof DiffEditorInput || editor instanceof UntitledTextEditorInput || editor instanceof NotebookEditorInput)) {
        continue;
      }
      const uri = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
      if (!uri) {
        continue;
      }
      result.push({
        kind: "file",
        id: uri.toString(),
        value: uri,
        name: this._labelService.getUriBasenameLabel(uri)
      });
    }
    return result;
  }
};
OpenEditorContextValuePick = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, ILabelService)
], OpenEditorContextValuePick);
let ClipboardImageContextValuePick = class {
  constructor(_clipboardService) {
    this._clipboardService = _clipboardService;
    this.type = "valuePick";
    this.label = localize("imageFromClipboard", "Image from Clipboard");
    this.icon = Codicon.fileMedia;
  }
  async isEnabled(widget) {
    if (!widget.attachmentCapabilities.supportsImageAttachments) {
      return false;
    }
    if (!widget.input.selectedLanguageModel.get()?.metadata.capabilities?.vision) {
      return false;
    }
    const imageData = await this._clipboardService.readImage();
    return isImage(imageData);
  }
  async asAttachment() {
    const fileBuffer = await this._clipboardService.readImage();
    return {
      id: await imageToHash(fileBuffer),
      name: localize("pastedImage", "Pasted Image"),
      fullName: localize("pastedImage", "Pasted Image"),
      value: fileBuffer,
      kind: "image"
    };
  }
};
ClipboardImageContextValuePick = __decorateClass([
  __decorateParam(0, IClipboardService)
], ClipboardImageContextValuePick);
let TerminalContext = class {
  constructor(_resource, _terminalService) {
    this._resource = _resource;
    this._terminalService = _terminalService;
    this.type = "valuePick";
    this.icon = Codicon.terminal;
    this.label = localize("terminal", "Terminal");
  }
  isEnabled(widget) {
    const terminal = this._terminalService.getInstanceFromResource(this._resource);
    return !!widget.attachmentCapabilities.supportsTerminalAttachments && terminal?.isDisposed === false;
  }
  async asAttachment(widget) {
    const terminal = this._terminalService.getInstanceFromResource(this._resource);
    if (!terminal) {
      return;
    }
    const params = new URLSearchParams(this._resource.query);
    const command = terminal.capabilities.get(TerminalCapability.CommandDetection)?.commands.find((cmd) => cmd.id === params.get("command"));
    if (!command) {
      return;
    }
    const attachment = {
      kind: "terminalCommand",
      id: `terminalCommand:${Date.now()}}`,
      value: this.asValue(command),
      name: command.command,
      command: command.command,
      output: command.getOutput(),
      exitCode: command.exitCode,
      resource: this._resource
    };
    const cleanup = new DisposableStore();
    let disposed = false;
    const disposeCleanup = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      cleanup.dispose();
    };
    cleanup.add(widget.attachmentModel.onDidChange((e) => {
      if (e.deleted.includes(attachment.id)) {
        disposeCleanup();
      }
    }));
    cleanup.add(terminal.onDisposed(() => {
      widget.attachmentModel.delete(attachment.id);
      widget.refreshParsedInput();
      disposeCleanup();
    }));
    return attachment;
  }
  asValue(command) {
    let value = `Command: ${command.command}`;
    const output = command.getOutput();
    if (output) {
      value += `
Output:
${output}`;
    }
    if (typeof command.exitCode === "number") {
      value += `
Exit Code: ${command.exitCode}`;
    }
    return value;
  }
};
TerminalContext = __decorateClass([
  __decorateParam(1, ITerminalService)
], TerminalContext);
let ScreenshotContextValuePick = class {
  constructor(_hostService) {
    this._hostService = _hostService;
    this.type = "valuePick";
    this.icon = Codicon.deviceCamera;
    this.label = isElectron ? localize("chatContext.attachScreenshot.labelElectron.Window", "Screenshot Window") : localize("chatContext.attachScreenshot.labelWeb", "Screenshot");
  }
  async isEnabled(widget) {
    return !!widget.attachmentCapabilities.supportsImageAttachments && !!widget.input.selectedLanguageModel.get()?.metadata.capabilities?.vision;
  }
  async asAttachment() {
    const blob = await this._hostService.getScreenshot();
    return blob && convertBufferToScreenshotVariable(blob);
  }
};
ScreenshotContextValuePick = __decorateClass([
  __decorateParam(0, IHostService)
], ScreenshotContextValuePick);
let SessionReferenceContextPickerPick = class {
  constructor(_chatSessionsService, _pathService, _remoteAgentHostService, _routingProviderService, _logService, _uriIdentityService) {
    this._chatSessionsService = _chatSessionsService;
    this._pathService = _pathService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this._routingProviderService = _routingProviderService;
    this._logService = _logService;
    this._uriIdentityService = _uriIdentityService;
    this.type = "pickerPick";
    this.icon = Codicon.comment;
    this.label = localize("chatContext.sessions", "Sessions...");
    this.ordinal = -400;
  }
  isEnabled(widget) {
    return widget.location === ChatAgentLocation.Chat;
  }
  asPicker(widget) {
    const currentSessionResource = widget.viewModel?.sessionResource;
    const onlyShowAttachableCopilotCliSessions = !!currentSessionResource && isAgentHostTarget(getChatSessionType(currentSessionResource));
    return {
      placeholder: localize("chatContext.sessions.placeholder", "Select a session"),
      picks: (async () => {
        const entries = [];
        const includedResources = new ResourceSet((resource) => this._uriIdentityService.extUri.getComparisonKey(resource));
        let currentWorkspace;
        const routingProvider = this._routingProviderService.getProvider();
        if (routingProvider) {
          let currentSession;
          try {
            currentSession = currentSessionResource ? await routingProvider.getSessionSnapshot?.(currentSessionResource, CancellationToken.None) : void 0;
          } catch (error) {
            this._logService.warn("[chatContext] Failed to resolve the current routed session:", error);
          }
          if (currentSession) {
            currentWorkspace = { cwd: currentSession.cwd, repo: currentSession.repo };
          }
          let candidates = [];
          try {
            candidates = await routingProvider.getCandidateSessions(CancellationToken.None);
          } catch (error) {
            this._logService.warn("[chatContext] Failed to resolve routed session attachments:", error);
          }
          for (const candidate of candidates) {
            const sessionResource = candidate.resource ?? routingProvider.resolveSessionResource(candidate.sessionId);
            if (!sessionResource) {
              continue;
            }
            if (candidate.sessionId === currentSession?.sessionId || currentSessionResource && this._uriIdentityService.extUri.isEqual(sessionResource, currentSessionResource)) {
              currentWorkspace = { cwd: candidate.cwd, repo: candidate.repo };
              continue;
            }
            if (onlyShowAttachableCopilotCliSessions && !this._canAttachCopilotCliSession(sessionResource)) {
              continue;
            }
            includedResources.add(sessionResource);
            const pick = {
              label: candidate.label,
              description: candidate.lastActivity ? new Date(candidate.lastActivity).toLocaleString() : void 0,
              asAttachment: () => ({
                kind: "generic",
                id: `session:${candidate.sessionId}`,
                name: candidate.label,
                value: { sessionReference: true, sessionResource: sessionResource.toString() }
              })
            };
            entries.push({
              pick,
              lastActivity: candidate.lastActivity ?? 0,
              workspace: { cwd: candidate.cwd, repo: candidate.repo }
            });
          }
        }
        const sessionProviderFilter = [AgentSessionProviders.Local, AgentSessionProviders.Background, AgentSessionProviders.AgentHostCopilot];
        for await (const group of this._chatSessionsService.getChatSessionItems(sessionProviderFilter, CancellationToken.None)) {
          const providerIcon = getAgentSessionProviderIcon(group.chatSessionType);
          for (const item of group.items) {
            const workspace = {
              cwd: item.metadata?.workingDirectoryPath ?? item.metadata?.worktreePath,
              repo: item.metadata?.repositoryPath
            };
            if (currentSessionResource && this._uriIdentityService.extUri.isEqual(item.resource, currentSessionResource)) {
              currentWorkspace ??= workspace;
              continue;
            }
            if (includedResources.has(item.resource)) {
              continue;
            }
            const sessionResource = item.resource;
            if (onlyShowAttachableCopilotCliSessions && !this._canAttachCopilotCliSession(sessionResource)) {
              continue;
            }
            const icon = item.iconPath ?? providerIcon;
            const lastActivity = item.timing.lastRequestEnded ?? item.timing.created;
            const pick = {
              label: item.label,
              description: new Date(lastActivity).toLocaleString(),
              asAttachment: () => ({
                kind: "sessionReference",
                id: sessionResource.toString(),
                name: item.label,
                value: sessionResource,
                icon
              })
            };
            entries.push({ pick, lastActivity, workspace });
          }
        }
        entries.sort((a, b) => b.lastActivity - a.lastActivity);
        if (!currentSessionResource || !currentWorkspace?.cwd && !currentWorkspace?.repo) {
          return entries.map((entry) => entry.pick);
        }
        const sameWorkspace = entries.filter((entry) => isSameSessionWorkspace(currentWorkspace, entry.workspace, this._uriIdentityService.extUri));
        const otherWorkspaces = entries.filter((entry) => !isSameSessionWorkspace(currentWorkspace, entry.workspace, this._uriIdentityService.extUri));
        if (otherWorkspaces.length === 0) {
          return sameWorkspace.map((entry) => entry.pick);
        }
        const groupedPicks = [];
        if (sameWorkspace.length > 0) {
          groupedPicks.push({ type: "separator", label: getSessionWorkspaceName(currentWorkspace) });
          groupedPicks.push(...sameWorkspace.map((entry) => entry.pick));
        }
        if (otherWorkspaces.length > 0) {
          groupedPicks.push({ type: "separator", label: localize("chatContext.sessions.otherWorkspaces", "Other Workspaces") });
          groupedPicks.push(...otherWorkspaces.map((entry) => entry.pick));
        }
        return groupedPicks;
      })()
    };
  }
  _canAttachCopilotCliSession(sessionResource) {
    return !!buildHostLocalEventsPath(
      sessionResource,
      this._pathService.userHome({ preferLocal: true }),
      (authority) => this._remoteAgentHostService.connections.find((connection) => agentHostAuthority(connection.address) === authority)
    );
  }
};
SessionReferenceContextPickerPick = __decorateClass([
  __decorateParam(0, IChatSessionsService),
  __decorateParam(1, IPathService),
  __decorateParam(2, IRemoteAgentHostService),
  __decorateParam(3, IChatSessionRoutingProviderService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IUriIdentityService)
], SessionReferenceContextPickerPick);
export {
  ChatContextContributions,
  EnableChatDebugToolsCommandId,
  TerminalContext,
  getSessionWorkspaceName,
  isSameSessionWorkspace,
  shouldShowOpenEditorsContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRDb250ZXh0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgaXNFbGVjdHJvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBJRXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0QXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29tbWFuZCwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9kaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRmlsZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvYnJvd3Nlci9lZGl0b3JzL2ZpbGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0UGlja1NlcnZpY2UsIElDaGF0Q29udGV4dFZhbHVlSXRlbSwgSUNoYXRDb250ZXh0UGlja2VySXRlbSwgSUNoYXRDb250ZXh0UGlja2VyUGlja0l0ZW0sIElDaGF0Q29udGV4dFBpY2tlciB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXRDb250ZXh0UGlja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VG9vbEVudHJ5LCBJQ2hhdFJlcXVlc3RUb29sU2V0RW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIElJbWFnZVZhcmlhYmxlRW50cnksIHRvVG9vbFNldFZhcmlhYmxlRW50cnksIHRvVG9vbFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBpc1Rvb2xTZXQsIFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBpbWFnZVRvSGFzaCwgaXNJbWFnZSB9IGZyb20gJy4uL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdFBhc3RlUHJvdmlkZXJzLmpzJztcbmltcG9ydCB7IGNvbnZlcnRCdWZmZXJUb1NjcmVlbnNob3RWYXJpYWJsZSB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXRTY3JlZW5zaG90Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBDaGF0SW5zdHJ1Y3Rpb25zUGlja2VyUGljayB9IGZyb20gJy4uL3Byb21wdFN5bnRheC9hdHRhY2hJbnN0cnVjdGlvbnNBY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UsIGlzQWdlbnRIb3N0VGFyZ2V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uLCBBZ2VudFNlc3Npb25Qcm92aWRlcnMgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgYnVpbGRIb3N0TG9jYWxFdmVudHNQYXRoIH0gZnJvbSAnLi4vY29waWxvdENsaUV2ZW50c1VyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25Sb3V0aW5nUHJvdmlkZXJTZXJ2aWNlLCBJUm91dGFibGVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Sb3V0ZXIuanMnO1xuXG4vKipcbiAqIENvbW1hbmQgSUQgdGhhdCBleHRlbnNpb25zIGNhbiBjYWxsIHRvIGVuYWJsZSBkZWJ1ZyB0b29scyBmb3IgdGhlIGN1cnJlbnRcbiAqIGNoYXQgc2Vzc2lvbi4gU2V0cyB0aGUgY29udGV4dCBrZXkgYW5kIGltbWVkaWF0ZWx5IGZsdXNoZXMgdG9vbCB1cGRhdGVzIHNvXG4gKiB0aGF0IG5ld2x5LWVuYWJsZWQgdG9vbHMgYXJlIHZpc2libGUgb24gdGhlIG5leHQgYHZzY29kZS5sbS50b29sc2AgcmVhZC5cbiAqL1xuZXhwb3J0IGNvbnN0IEVuYWJsZUNoYXREZWJ1Z1Rvb2xzQ29tbWFuZElkID0gJ2NoYXQuZW5hYmxlRGVidWdUb29scyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRTaG93T3BlbkVkaXRvcnNDb250ZXh0KHdpZGdldDogUGljazxJQ2hhdFdpZGdldCwgJ3ZpZXdNb2RlbCcgfCAnbG9ja2VkQWdlbnRJZCc+LCBoYXNFbGlnaWJsZU9wZW5FZGl0b3JzOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdGlmICghaGFzRWxpZ2libGVPcGVuRWRpdG9ycykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHdpZGdldC52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0aWYgKHNlc3Npb25SZXNvdXJjZSAmJiBpc0FnZW50SG9zdFRhcmdldChnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAod2lkZ2V0LmxvY2tlZEFnZW50SWQgJiYgaXNBZ2VudEhvc3RUYXJnZXQod2lkZ2V0LmxvY2tlZEFnZW50SWQpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbnR5cGUgU2Vzc2lvbldvcmtzcGFjZUlkZW50aXR5ID0gUGljazxJUm91dGFibGVTZXNzaW9uLCAnY3dkJyB8ICdyZXBvJz47XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NhbWVTZXNzaW9uV29ya3NwYWNlKGN1cnJlbnQ6IFNlc3Npb25Xb3Jrc3BhY2VJZGVudGl0eSwgY2FuZGlkYXRlOiBTZXNzaW9uV29ya3NwYWNlSWRlbnRpdHksIGV4dFVyaTogSUV4dFVyaSA9IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlKTogYm9vbGVhbiB7XG5cdGNvbnN0IG5vcm1hbGl6ZVJlcG9zaXRvcnkgPSAodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4gdmFsdWU/LnJlcGxhY2UoL1tcXFxcL10rJC8sICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRjb25zdCBjdXJyZW50UmVwbyA9IG5vcm1hbGl6ZVJlcG9zaXRvcnkoY3VycmVudC5yZXBvKTtcblx0Y29uc3QgY2FuZGlkYXRlUmVwbyA9IG5vcm1hbGl6ZVJlcG9zaXRvcnkoY2FuZGlkYXRlLnJlcG8pO1xuXHRpZiAoY3VycmVudFJlcG8gJiYgY2FuZGlkYXRlUmVwbykge1xuXHRcdHJldHVybiBjdXJyZW50UmVwbyA9PT0gY2FuZGlkYXRlUmVwbztcblx0fVxuXG5cdHJldHVybiAhIWN1cnJlbnQuY3dkICYmICEhY2FuZGlkYXRlLmN3ZCAmJiBleHRVcmkuaXNFcXVhbChVUkkuZmlsZShjdXJyZW50LmN3ZCksIFVSSS5maWxlKGNhbmRpZGF0ZS5jd2QpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNlc3Npb25Xb3Jrc3BhY2VOYW1lKHdvcmtzcGFjZTogU2Vzc2lvbldvcmtzcGFjZUlkZW50aXR5KTogc3RyaW5nIHtcblx0Y29uc3QgcmVwb05hbWUgPSB3b3Jrc3BhY2UucmVwbz8ucmVwbGFjZSgvW1xcXFwvXSskLywgJycpLnNwbGl0KC9bXFxcXC9dLykuYXQoLTEpO1xuXHRjb25zdCBmb2xkZXJOYW1lID0gd29ya3NwYWNlLmN3ZD8ucmVwbGFjZSgvW1xcXFwvXSskLywgJycpLnNwbGl0KC9bXFxcXC9dLykuYXQoLTEpO1xuXHRyZXR1cm4gcmVwb05hbWUgfHwgZm9sZGVyTmFtZSB8fCBsb2NhbGl6ZSgnY2hhdENvbnRleHQuc2Vzc2lvbnMudGhpc1dvcmtzcGFjZScsIFwiVGhpcyBXb3Jrc3BhY2VcIik7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0Q29udGV4dENvbnRyaWJ1dGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2NoYXQuY29udGV4dENvbnRyaWJ1dGlvbnMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRDb250ZXh0UGlja1NlcnZpY2UgY29udGV4dFBpY2tTZXJ2aWNlOiBJQ2hhdENvbnRleHRQaWNrU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vICMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG5cdFx0Ly9cblx0XHQvLyBEZWZhdWx0IGNvbnRleHQgcGlja3MvdmFsdWVzIHdoaWNoIGFyZSBcIm5hdGl2ZVwiIHRvIGNoYXQuIFRoaXMgaXMgTk9UIHRoZSBjb21wbGV0ZSBsaXN0XG5cdFx0Ly8gYW5kIGZlYXR1cmUgYXJlYSBzcGVjaWZpYyBjb250ZXh0LCBsaWtlIGZvciBub3RlYm9va3MsIHByb2JsZW1zLCBldGMsIHNob3VsZCBiZSBjb250cmlidXRlZFxuXHRcdC8vIGJ5IHRoZSBmZWF0dXJlIGFyZWEuXG5cdFx0Ly9cblx0XHQvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGNvbnRleHRQaWNrU2VydmljZS5yZWdpc3RlckNoYXRDb250ZXh0SXRlbShpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb29sc0NvbnRleHRQaWNrZXJQaWNrKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChjb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEluc3RydWN0aW9uc1BpY2tlclBpY2spKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGNvbnRleHRQaWNrU2VydmljZS5yZWdpc3RlckNoYXRDb250ZXh0SXRlbShpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPcGVuRWRpdG9yQ29udGV4dFZhbHVlUGljaykpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoY29udGV4dFBpY2tTZXJ2aWNlLnJlZ2lzdGVyQ2hhdENvbnRleHRJdGVtKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENsaXBib2FyZEltYWdlQ29udGV4dFZhbHVlUGljaykpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoY29udGV4dFBpY2tTZXJ2aWNlLnJlZ2lzdGVyQ2hhdENvbnRleHRJdGVtKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNjcmVlbnNob3RDb250ZXh0VmFsdWVQaWNrKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChjb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblJlZmVyZW5jZUNvbnRleHRQaWNrZXJQaWNrKSkpO1xuXHR9XG59XG5cbmNsYXNzIFRvb2xzQ29udGV4dFBpY2tlclBpY2sgaW1wbGVtZW50cyBJQ2hhdENvbnRleHRQaWNrZXJJdGVtIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3BpY2tlclBpY2snO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nID0gbG9jYWxpemUoJ2NoYXRDb250ZXh0LnRvb2xzJywgJ1Rvb2xzLi4uJyk7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbiA9IENvZGljb24udG9vbHM7XG5cdHJlYWRvbmx5IG9yZGluYWwgPSAtNTAwO1xuXG5cdGlzRW5hYmxlZCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhd2lkZ2V0LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMuc3VwcG9ydHNUb29sQXR0YWNobWVudHM7XG5cdH1cblxuXHRhc1BpY2tlcih3aWRnZXQ6IElDaGF0V2lkZ2V0KTogSUNoYXRDb250ZXh0UGlja2VyIHtcblxuXHRcdHR5cGUgUGljayA9IElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtICYgeyB0b29sSW5mbzogeyBvcmRpbmFsOiBudW1iZXI7IGxhYmVsOiBzdHJpbmcgfSB9O1xuXHRcdGNvbnN0IGl0ZW1zOiBQaWNrW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgW2VudHJ5LCBlbmFibGVkXSBvZiB3aWRnZXQuaW5wdXQuc2VsZWN0ZWRUb29sc01vZGVsLmVudHJpZXNNYXAuZ2V0KCkpIHtcblx0XHRcdGlmIChlbmFibGVkKSB7XG5cdFx0XHRcdGlmIChpc1Rvb2xTZXQoZW50cnkpKSB7XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHR0b29sSW5mbzogVG9vbERhdGFTb3VyY2UuY2xhc3NpZnkoZW50cnkuc291cmNlKSxcblx0XHRcdFx0XHRcdGxhYmVsOiBlbnRyeS5yZWZlcmVuY2VOYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGVudHJ5LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0YXNBdHRhY2htZW50OiAoKTogSUNoYXRSZXF1ZXN0VG9vbFNldEVudHJ5ID0+IHRvVG9vbFNldFZhcmlhYmxlRW50cnkoZW50cnkpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHR0b29sSW5mbzogVG9vbERhdGFTb3VyY2UuY2xhc3NpZnkoZW50cnkuc291cmNlKSxcblx0XHRcdFx0XHRcdGxhYmVsOiBlbnRyeS50b29sUmVmZXJlbmNlTmFtZSA/PyBlbnRyeS5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBlbnRyeS51c2VyRGVzY3JpcHRpb24gPz8gZW50cnkubW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdGFzQXR0YWNobWVudDogKCk6IElDaGF0UmVxdWVzdFRvb2xFbnRyeSA9PiB0b1Rvb2xWYXJpYWJsZUVudHJ5KGVudHJ5KVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aXRlbXMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0bGV0IHJlcyA9IGEudG9vbEluZm8ub3JkaW5hbCAtIGIudG9vbEluZm8ub3JkaW5hbDtcblx0XHRcdGlmIChyZXMgPT09IDApIHtcblx0XHRcdFx0cmVzID0gYS50b29sSW5mby5sYWJlbC5sb2NhbGVDb21wYXJlKGIudG9vbEluZm8ubGFiZWwpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlcyA9PT0gMCkge1xuXHRcdFx0XHRyZXMgPSBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGxhc3RHcm91cExhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcGlja3M6IChJUXVpY2tQaWNrU2VwYXJhdG9yIHwgUGljaylbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRpZiAobGFzdEdyb3VwTGFiZWwgIT09IGl0ZW0udG9vbEluZm8ubGFiZWwpIHtcblx0XHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogaXRlbS50b29sSW5mby5sYWJlbCB9KTtcblx0XHRcdFx0bGFzdEdyb3VwTGFiZWwgPSBpdGVtLnRvb2xJbmZvLmxhYmVsO1xuXHRcdFx0fVxuXHRcdFx0cGlja3MucHVzaChpdGVtKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdjaGF0Q29udGV4dC50b29scy5wbGFjZWhvbGRlcicsICdTZWxlY3QgYSB0b29sJyksXG5cdFx0XHRwaWNrczogUHJvbWlzZS5yZXNvbHZlKHBpY2tzKVxuXHRcdH07XG5cdH1cblxuXG59XG5cblxuXG5jbGFzcyBPcGVuRWRpdG9yQ29udGV4dFZhbHVlUGljayBpbXBsZW1lbnRzIElDaGF0Q29udGV4dFZhbHVlSXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd2YWx1ZVBpY2snO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nID0gbG9jYWxpemUoJ2NoYXRDb250ZXh0LmVkaXRvcnMnLCAnT3BlbiBFZGl0b3JzJyk7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbiA9IENvZGljb24uZmlsZTtcblx0cmVhZG9ubHkgb3JkaW5hbCA9IDgwMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGlzRW5hYmxlZCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogUHJvbWlzZTxib29sZWFuPiB8IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGhhc0VsaWdpYmxlT3BlbkVkaXRvcnMgPSB0aGlzLl9lZGl0b3JTZXJ2aWNlLmVkaXRvcnMuc29tZShlID0+IGUgaW5zdGFuY2VvZiBGaWxlRWRpdG9ySW5wdXQgfHwgZSBpbnN0YW5jZW9mIERpZmZFZGl0b3JJbnB1dCB8fCBlIGluc3RhbmNlb2YgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQpO1xuXHRcdHJldHVybiBzaG91bGRTaG93T3BlbkVkaXRvcnNDb250ZXh0KHdpZGdldCwgaGFzRWxpZ2libGVPcGVuRWRpdG9ycyk7XG5cdH1cblxuXHRhc3luYyBhc0F0dGFjaG1lbnQoKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10+IHtcblx0XHRjb25zdCByZXN1bHQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMuX2VkaXRvclNlcnZpY2UuZWRpdG9ycykge1xuXHRcdFx0aWYgKCEoZWRpdG9yIGluc3RhbmNlb2YgRmlsZUVkaXRvcklucHV0IHx8IGVkaXRvciBpbnN0YW5jZW9mIERpZmZFZGl0b3JJbnB1dCB8fCBlZGl0b3IgaW5zdGFuY2VvZiBVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCB8fCBlZGl0b3IgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVyaSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0XHRpZiAoIXVyaSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0XHRpZDogdXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHZhbHVlOiB1cmksXG5cdFx0XHRcdG5hbWU6IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHVyaSksXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG59XG5cblxuY2xhc3MgQ2xpcGJvYXJkSW1hZ2VDb250ZXh0VmFsdWVQaWNrIGltcGxlbWVudHMgSUNoYXRDb250ZXh0VmFsdWVJdGVtIHtcblx0cmVhZG9ubHkgdHlwZSA9ICd2YWx1ZVBpY2snO1xuXHRyZWFkb25seSBsYWJlbCA9IGxvY2FsaXplKCdpbWFnZUZyb21DbGlwYm9hcmQnLCAnSW1hZ2UgZnJvbSBDbGlwYm9hcmQnKTtcblx0cmVhZG9ubHkgaWNvbiA9IENvZGljb24uZmlsZU1lZGlhO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBpc0VuYWJsZWQod2lkZ2V0OiBJQ2hhdFdpZGdldCkge1xuXHRcdGlmICghd2lkZ2V0LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMuc3VwcG9ydHNJbWFnZUF0dGFjaG1lbnRzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghd2lkZ2V0LmlucHV0LnNlbGVjdGVkTGFuZ3VhZ2VNb2RlbC5nZXQoKT8ubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgaW1hZ2VEYXRhID0gYXdhaXQgdGhpcy5fY2xpcGJvYXJkU2VydmljZS5yZWFkSW1hZ2UoKTtcblx0XHRyZXR1cm4gaXNJbWFnZShpbWFnZURhdGEpO1xuXHR9XG5cblx0YXN5bmMgYXNBdHRhY2htZW50KCk6IFByb21pc2U8SUltYWdlVmFyaWFibGVFbnRyeT4ge1xuXHRcdGNvbnN0IGZpbGVCdWZmZXIgPSBhd2FpdCB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLnJlYWRJbWFnZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogYXdhaXQgaW1hZ2VUb0hhc2goZmlsZUJ1ZmZlciksXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgncGFzdGVkSW1hZ2UnLCAnUGFzdGVkIEltYWdlJyksXG5cdFx0XHRmdWxsTmFtZTogbG9jYWxpemUoJ3Bhc3RlZEltYWdlJywgJ1Bhc3RlZCBJbWFnZScpLFxuXHRcdFx0dmFsdWU6IGZpbGVCdWZmZXIsXG5cdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsQ29udGV4dCBpbXBsZW1lbnRzIElDaGF0Q29udGV4dFZhbHVlSXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd2YWx1ZVBpY2snO1xuXHRyZWFkb25seSBpY29uID0gQ29kaWNvbi50ZXJtaW5hbDtcblx0cmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgndGVybWluYWwnLCAnVGVybWluYWwnKTtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2U6IFVSSSwgQElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlKSB7XG5cblx0fVxuXHRpc0VuYWJsZWQod2lkZ2V0OiBJQ2hhdFdpZGdldCkge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmdldEluc3RhbmNlRnJvbVJlc291cmNlKHRoaXMuX3Jlc291cmNlKTtcblx0XHRyZXR1cm4gISF3aWRnZXQuYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c1Rlcm1pbmFsQXR0YWNobWVudHMgJiYgdGVybWluYWw/LmlzRGlzcG9zZWQgPT09IGZhbHNlO1xuXHR9XG5cdGFzeW5jIGFzQXR0YWNobWVudCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZ2V0SW5zdGFuY2VGcm9tUmVzb3VyY2UodGhpcy5fcmVzb3VyY2UpO1xuXHRcdGlmICghdGVybWluYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh0aGlzLl9yZXNvdXJjZS5xdWVyeSk7XG5cdFx0Y29uc3QgY29tbWFuZCA9IHRlcm1pbmFsLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pPy5jb21tYW5kcy5maW5kKGNtZCA9PiBjbWQuaWQgPT09IHBhcmFtcy5nZXQoJ2NvbW1hbmQnKSk7XG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgPSB7XG5cdFx0XHRraW5kOiAndGVybWluYWxDb21tYW5kJyxcblx0XHRcdGlkOiBgdGVybWluYWxDb21tYW5kOiR7RGF0ZS5ub3coKX19YCxcblx0XHRcdHZhbHVlOiB0aGlzLmFzVmFsdWUoY29tbWFuZCksXG5cdFx0XHRuYW1lOiBjb21tYW5kLmNvbW1hbmQsXG5cdFx0XHRjb21tYW5kOiBjb21tYW5kLmNvbW1hbmQsXG5cdFx0XHRvdXRwdXQ6IGNvbW1hbmQuZ2V0T3V0cHV0KCksXG5cdFx0XHRleGl0Q29kZTogY29tbWFuZC5leGl0Q29kZSxcblx0XHRcdHJlc291cmNlOiB0aGlzLl9yZXNvdXJjZVxuXHRcdH07XG5cdFx0Y29uc3QgY2xlYW51cCA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRjb25zdCBkaXNwb3NlQ2xlYW51cCA9ICgpID0+IHtcblx0XHRcdGlmIChkaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRkaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRjbGVhbnVwLmRpc3Bvc2UoKTtcblx0XHR9O1xuXHRcdGNsZWFudXAuYWRkKHdpZGdldC5hdHRhY2htZW50TW9kZWwub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5kZWxldGVkLmluY2x1ZGVzKGF0dGFjaG1lbnQuaWQpKSB7XG5cdFx0XHRcdGRpc3Bvc2VDbGVhbnVwKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNsZWFudXAuYWRkKHRlcm1pbmFsLm9uRGlzcG9zZWQoKCkgPT4ge1xuXHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5kZWxldGUoYXR0YWNobWVudC5pZCk7XG5cdFx0XHR3aWRnZXQucmVmcmVzaFBhcnNlZElucHV0KCk7XG5cdFx0XHRkaXNwb3NlQ2xlYW51cCgpO1xuXHRcdH0pKTtcblx0XHRyZXR1cm4gYXR0YWNobWVudDtcblx0fVxuXG5cdHByaXZhdGUgYXNWYWx1ZShjb21tYW5kOiBJVGVybWluYWxDb21tYW5kKTogc3RyaW5nIHtcblx0XHRsZXQgdmFsdWUgPSBgQ29tbWFuZDogJHtjb21tYW5kLmNvbW1hbmR9YDtcblx0XHRjb25zdCBvdXRwdXQgPSBjb21tYW5kLmdldE91dHB1dCgpO1xuXHRcdGlmIChvdXRwdXQpIHtcblx0XHRcdHZhbHVlICs9IGBcXG5PdXRwdXQ6XFxuJHtvdXRwdXR9YDtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBjb21tYW5kLmV4aXRDb2RlID09PSAnbnVtYmVyJykge1xuXHRcdFx0dmFsdWUgKz0gYFxcbkV4aXQgQ29kZTogJHtjb21tYW5kLmV4aXRDb2RlfWA7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuXG5jbGFzcyBTY3JlZW5zaG90Q29udGV4dFZhbHVlUGljayBpbXBsZW1lbnRzIElDaGF0Q29udGV4dFZhbHVlSXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd2YWx1ZVBpY2snO1xuXHRyZWFkb25seSBpY29uID0gQ29kaWNvbi5kZXZpY2VDYW1lcmE7XG5cdHJlYWRvbmx5IGxhYmVsID0gKGlzRWxlY3Ryb25cblx0XHQ/IGxvY2FsaXplKCdjaGF0Q29udGV4dC5hdHRhY2hTY3JlZW5zaG90LmxhYmVsRWxlY3Ryb24uV2luZG93JywgJ1NjcmVlbnNob3QgV2luZG93Jylcblx0XHQ6IGxvY2FsaXplKCdjaGF0Q29udGV4dC5hdHRhY2hTY3JlZW5zaG90LmxhYmVsV2ViJywgJ1NjcmVlbnNob3QnKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGlzRW5hYmxlZCh3aWRnZXQ6IElDaGF0V2lkZ2V0KSB7XG5cdFx0cmV0dXJuICEhd2lkZ2V0LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMuc3VwcG9ydHNJbWFnZUF0dGFjaG1lbnRzICYmICEhd2lkZ2V0LmlucHV0LnNlbGVjdGVkTGFuZ3VhZ2VNb2RlbC5nZXQoKT8ubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb247XG5cdH1cblxuXHRhc3luYyBhc0F0dGFjaG1lbnQoKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYmxvYiA9IGF3YWl0IHRoaXMuX2hvc3RTZXJ2aWNlLmdldFNjcmVlbnNob3QoKTtcblx0XHRyZXR1cm4gYmxvYiAmJiBjb252ZXJ0QnVmZmVyVG9TY3JlZW5zaG90VmFyaWFibGUoYmxvYik7XG5cdH1cbn1cblxuY2xhc3MgU2Vzc2lvblJlZmVyZW5jZUNvbnRleHRQaWNrZXJQaWNrIGltcGxlbWVudHMgSUNoYXRDb250ZXh0UGlja2VySXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICdwaWNrZXJQaWNrJztcblx0cmVhZG9ubHkgaWNvbiA9IENvZGljb24uY29tbWVudDtcblx0cmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgnY2hhdENvbnRleHQuc2Vzc2lvbnMnLCAnU2Vzc2lvbnMuLi4nKTtcblx0cmVhZG9ubHkgb3JkaW5hbCA9IC00MDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRIb3N0U2VydmljZTogSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvblJvdXRpbmdQcm92aWRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcm91dGluZ1Byb3ZpZGVyU2VydmljZTogSUNoYXRTZXNzaW9uUm91dGluZ1Byb3ZpZGVyU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGlzRW5hYmxlZCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHdpZGdldC5sb2NhdGlvbiA9PT0gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdDtcblx0fVxuXG5cdGFzUGlja2VyKHdpZGdldDogSUNoYXRXaWRnZXQpOiBJQ2hhdENvbnRleHRQaWNrZXIge1xuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgPSB3aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3Qgb25seVNob3dBdHRhY2hhYmxlQ29waWxvdENsaVNlc3Npb25zID0gISFjdXJyZW50U2Vzc2lvblJlc291cmNlICYmIGlzQWdlbnRIb3N0VGFyZ2V0KGdldENoYXRTZXNzaW9uVHlwZShjdXJyZW50U2Vzc2lvblJlc291cmNlKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnY2hhdENvbnRleHQuc2Vzc2lvbnMucGxhY2Vob2xkZXInLCAnU2VsZWN0IGEgc2Vzc2lvbicpLFxuXHRcdFx0cGlja3M6IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVudHJpZXM6IHsgcGljazogSUNoYXRDb250ZXh0UGlja2VyUGlja0l0ZW07IGxhc3RBY3Rpdml0eTogbnVtYmVyOyB3b3Jrc3BhY2U6IFNlc3Npb25Xb3Jrc3BhY2VJZGVudGl0eSB9W10gPSBbXTtcblx0XHRcdFx0Y29uc3QgaW5jbHVkZWRSZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VTZXQocmVzb3VyY2UgPT4gdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHJlc291cmNlKSk7XG5cdFx0XHRcdGxldCBjdXJyZW50V29ya3NwYWNlOiBTZXNzaW9uV29ya3NwYWNlSWRlbnRpdHkgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHJvdXRpbmdQcm92aWRlciA9IHRoaXMuX3JvdXRpbmdQcm92aWRlclNlcnZpY2UuZ2V0UHJvdmlkZXIoKTtcblx0XHRcdFx0aWYgKHJvdXRpbmdQcm92aWRlcikge1xuXHRcdFx0XHRcdGxldCBjdXJyZW50U2Vzc2lvbjogSVJvdXRhYmxlU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y3VycmVudFNlc3Npb24gPSBjdXJyZW50U2Vzc2lvblJlc291cmNlXG5cdFx0XHRcdFx0XHRcdD8gYXdhaXQgcm91dGluZ1Byb3ZpZGVyLmdldFNlc3Npb25TbmFwc2hvdD8uKGN1cnJlbnRTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpXG5cdFx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tjaGF0Q29udGV4dF0gRmFpbGVkIHRvIHJlc29sdmUgdGhlIGN1cnJlbnQgcm91dGVkIHNlc3Npb246JywgZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY3VycmVudFNlc3Npb24pIHtcblx0XHRcdFx0XHRcdGN1cnJlbnRXb3Jrc3BhY2UgPSB7IGN3ZDogY3VycmVudFNlc3Npb24uY3dkLCByZXBvOiBjdXJyZW50U2Vzc2lvbi5yZXBvIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxldCBjYW5kaWRhdGVzOiByZWFkb25seSBJUm91dGFibGVTZXNzaW9uW10gPSBbXTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y2FuZGlkYXRlcyA9IGF3YWl0IHJvdXRpbmdQcm92aWRlci5nZXRDYW5kaWRhdGVTZXNzaW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbY2hhdENvbnRleHRdIEZhaWxlZCB0byByZXNvbHZlIHJvdXRlZCBzZXNzaW9uIGF0dGFjaG1lbnRzOicsIGVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gY2FuZGlkYXRlLnJlc291cmNlID8/IHJvdXRpbmdQcm92aWRlci5yZXNvbHZlU2Vzc2lvblJlc291cmNlKGNhbmRpZGF0ZS5zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoY2FuZGlkYXRlLnNlc3Npb25JZCA9PT0gY3VycmVudFNlc3Npb24/LnNlc3Npb25JZCB8fCAoY3VycmVudFNlc3Npb25SZXNvdXJjZSAmJiB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoc2Vzc2lvblJlc291cmNlLCBjdXJyZW50U2Vzc2lvblJlc291cmNlKSkpIHtcblx0XHRcdFx0XHRcdFx0Y3VycmVudFdvcmtzcGFjZSA9IHsgY3dkOiBjYW5kaWRhdGUuY3dkLCByZXBvOiBjYW5kaWRhdGUucmVwbyB9O1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChvbmx5U2hvd0F0dGFjaGFibGVDb3BpbG90Q2xpU2Vzc2lvbnMgJiYgIXRoaXMuX2NhbkF0dGFjaENvcGlsb3RDbGlTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpbmNsdWRlZFJlc291cmNlcy5hZGQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRcdGNvbnN0IHBpY2s6IElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtID0ge1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogY2FuZGlkYXRlLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY2FuZGlkYXRlLmxhc3RBY3Rpdml0eSA/IG5ldyBEYXRlKGNhbmRpZGF0ZS5sYXN0QWN0aXZpdHkpLnRvTG9jYWxlU3RyaW5nKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGFzQXR0YWNobWVudDogKCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgPT4gKHtcblx0XHRcdFx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0XHRcdFx0aWQ6IGBzZXNzaW9uOiR7Y2FuZGlkYXRlLnNlc3Npb25JZH1gLFxuXHRcdFx0XHRcdFx0XHRcdG5hbWU6IGNhbmRpZGF0ZS5sYWJlbCxcblx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogeyBzZXNzaW9uUmVmZXJlbmNlOiB0cnVlLCBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpIH0sXG5cdFx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdGVudHJpZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHBpY2ssXG5cdFx0XHRcdFx0XHRcdGxhc3RBY3Rpdml0eTogY2FuZGlkYXRlLmxhc3RBY3Rpdml0eSA/PyAwLFxuXHRcdFx0XHRcdFx0XHR3b3Jrc3BhY2U6IHsgY3dkOiBjYW5kaWRhdGUuY3dkLCByZXBvOiBjYW5kaWRhdGUucmVwbyB9LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25Qcm92aWRlckZpbHRlciA9IFtBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q29waWxvdF07XG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkl0ZW1zKHNlc3Npb25Qcm92aWRlckZpbHRlciwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpIHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlckljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24oZ3JvdXAuY2hhdFNlc3Npb25UeXBlKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXAuaXRlbXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHtcblx0XHRcdFx0XHRcdFx0Y3dkOiBpdGVtLm1ldGFkYXRhPy53b3JraW5nRGlyZWN0b3J5UGF0aCA/PyBpdGVtLm1ldGFkYXRhPy53b3JrdHJlZVBhdGgsXG5cdFx0XHRcdFx0XHRcdHJlcG86IGl0ZW0ubWV0YWRhdGE/LnJlcG9zaXRvcnlQYXRoLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdGlmIChjdXJyZW50U2Vzc2lvblJlc291cmNlICYmIHRoaXMuX3VyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChpdGVtLnJlc291cmNlLCBjdXJyZW50U2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRjdXJyZW50V29ya3NwYWNlID8/PSB3b3Jrc3BhY2U7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGluY2x1ZGVkUmVzb3VyY2VzLmhhcyhpdGVtLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGl0ZW0ucmVzb3VyY2U7XG5cdFx0XHRcdFx0XHRpZiAob25seVNob3dBdHRhY2hhYmxlQ29waWxvdENsaVNlc3Npb25zICYmICF0aGlzLl9jYW5BdHRhY2hDb3BpbG90Q2xpU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgaWNvbiA9IGl0ZW0uaWNvblBhdGggPz8gcHJvdmlkZXJJY29uO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFzdEFjdGl2aXR5ID0gaXRlbS50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCA/PyBpdGVtLnRpbWluZy5jcmVhdGVkO1xuXHRcdFx0XHRcdFx0Y29uc3QgcGljazogSUNoYXRDb250ZXh0UGlja2VyUGlja0l0ZW0gPSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmV3IERhdGUobGFzdEFjdGl2aXR5KS50b0xvY2FsZVN0cmluZygpLFxuXHRcdFx0XHRcdFx0XHRhc0F0dGFjaG1lbnQ6ICgpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ID0+ICh7XG5cdFx0XHRcdFx0XHRcdFx0a2luZDogJ3Nlc3Npb25SZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0XHRcdGlkOiBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRcdHZhbHVlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdFx0aWNvbixcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBwaWNrLCBsYXN0QWN0aXZpdHksIHdvcmtzcGFjZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0ZW50cmllcy5zb3J0KChhLCBiKSA9PiBiLmxhc3RBY3Rpdml0eSAtIGEubGFzdEFjdGl2aXR5KTtcblx0XHRcdFx0aWYgKCFjdXJyZW50U2Vzc2lvblJlc291cmNlIHx8ICghY3VycmVudFdvcmtzcGFjZT8uY3dkICYmICFjdXJyZW50V29ya3NwYWNlPy5yZXBvKSkge1xuXHRcdFx0XHRcdHJldHVybiBlbnRyaWVzLm1hcChlbnRyeSA9PiBlbnRyeS5waWNrKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNhbWVXb3Jrc3BhY2UgPSBlbnRyaWVzLmZpbHRlcihlbnRyeSA9PiBpc1NhbWVTZXNzaW9uV29ya3NwYWNlKGN1cnJlbnRXb3Jrc3BhY2UsIGVudHJ5LndvcmtzcGFjZSwgdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaSkpO1xuXHRcdFx0XHRjb25zdCBvdGhlcldvcmtzcGFjZXMgPSBlbnRyaWVzLmZpbHRlcihlbnRyeSA9PiAhaXNTYW1lU2Vzc2lvbldvcmtzcGFjZShjdXJyZW50V29ya3NwYWNlLCBlbnRyeS53b3Jrc3BhY2UsIHRoaXMuX3VyaUlkZW50aXR5U2VydmljZS5leHRVcmkpKTtcblx0XHRcdFx0aWYgKG90aGVyV29ya3NwYWNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gc2FtZVdvcmtzcGFjZS5tYXAoZW50cnkgPT4gZW50cnkucGljayk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZ3JvdXBlZFBpY2tzOiAoSUNoYXRDb250ZXh0UGlja2VyUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW107XG5cdFx0XHRcdGlmIChzYW1lV29ya3NwYWNlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRncm91cGVkUGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogZ2V0U2Vzc2lvbldvcmtzcGFjZU5hbWUoY3VycmVudFdvcmtzcGFjZSkgfSk7XG5cdFx0XHRcdFx0Z3JvdXBlZFBpY2tzLnB1c2goLi4uc2FtZVdvcmtzcGFjZS5tYXAoZW50cnkgPT4gZW50cnkucGljaykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvdGhlcldvcmtzcGFjZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGdyb3VwZWRQaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnY2hhdENvbnRleHQuc2Vzc2lvbnMub3RoZXJXb3Jrc3BhY2VzJywgXCJPdGhlciBXb3Jrc3BhY2VzXCIpIH0pO1xuXHRcdFx0XHRcdGdyb3VwZWRQaWNrcy5wdXNoKC4uLm90aGVyV29ya3NwYWNlcy5tYXAoZW50cnkgPT4gZW50cnkucGljaykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBncm91cGVkUGlja3M7XG5cdFx0XHR9KSgpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbkF0dGFjaENvcGlsb3RDbGlTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Ly8gRm9yIG5vdywgYXR0YWNobWVudHMgd2hpbGUgaW4gYW4gQWdlbnQgSG9zdCBDb3BpbG90IGhhcm5lc3MgYXJlIGF0dGFjaGFibGUgd2hlbiBiYWNrZWQgYnkgQ29waWxvdCBDTEkgZXZlbnRzLmpzb25sLlxuXHRcdHJldHVybiAhIWJ1aWxkSG9zdExvY2FsRXZlbnRzUGF0aChcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHRoaXMuX3BhdGhTZXJ2aWNlLnVzZXJIb21lKHsgcHJlZmVyTG9jYWw6IHRydWUgfSksXG5cdFx0XHRhdXRob3JpdHkgPT4gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKGNvbm5lY3Rpb24gPT4gYWdlbnRIb3N0QXV0aG9yaXR5KGNvbm5lY3Rpb24uYWRkcmVzcykgPT09IGF1dGhvcml0eSksXG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtDQUEyQztBQUVwRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxtQkFBbUI7QUFFNUIsU0FBMkIsMEJBQTBCO0FBQ3JELFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsd0JBQXdCLHdCQUF3QjtBQUN6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
