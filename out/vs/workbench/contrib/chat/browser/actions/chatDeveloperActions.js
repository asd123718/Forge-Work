import { Codicon } from "../../../../../base/common/codicons.js";
import { fromNow } from "../../../../../base/common/date.js";
import { isUriComponents, URI } from "../../../../../base/common/uri.js";
import { localize2 } from "../../../../../nls.js";
import { Categories } from "../../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IAgentSessionsService } from "../agentSessions/agentSessionsService.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ILanguageModelsService } from "../../common/languageModels.js";
import { IChatWidgetService } from "../chat.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { AUTOPILOT_DONT_SHOW_AGAIN_KEY, AUTO_APPROVE_DONT_SHOW_AGAIN_KEY } from "../../common/chatPermissionStorageKeys.js";
import { resetShownWarnings } from "../../common/chatPermissionWarnings.js";
import { OpenCopilotCliStateFileAction } from "./openCopilotCliStateFileAction.js";
import { IAgentHostConnectionsService } from "../../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { StateComponents } from "../../../../../platform/agentHost/common/state/sessionState.js";
function uriReplacer(_key, value) {
  if (URI.isUri(value)) {
    return value.toString();
  }
  if (isUriComponents(value)) {
    return URI.from(value).toString();
  }
  return value;
}
function registerChatDeveloperActions() {
  registerAction2(LogChatInputHistoryAction);
  registerAction2(LogChatIndexAction);
  registerAction2(InspectChatModelAction);
  registerAction2(InspectChatModelReferencesAction);
  registerAction2(InspectAgentHostSubscriptionsAction);
  registerAction2(ClearRecentlyUsedLanguageModelsAction);
  registerAction2(ResetChatPermissionWarningDialogsAction);
  registerAction2(OpenCopilotCliStateFileAction);
}
function formatChatModelReferenceInspection(accessor) {
  const chatService = accessor.get(IChatService);
  const agentSessionsService = accessor.get(IAgentSessionsService);
  const debugInfo = chatService.getChatModelReferenceDebugInfo();
  const referencedModels = debugInfo.models.filter((model) => model.referenceCount > 0);
  const pendingEditModels = debugInfo.models.filter((model) => model.hasPendingEdits);
  const pendingDisposalModels = debugInfo.models.filter((model) => model.pendingDisposal);
  let output = "# Chat Model References\n\n";
  output += `- Live models: ${debugInfo.totalModels}
`;
  output += `- Live references: ${debugInfo.totalReferences}
`;
  output += `- Models with active references: ${referencedModels.length}
`;
  output += `- Models with pending edits: ${pendingEditModels.length}
`;
  output += `- Models pending disposal: ${pendingDisposalModels.length}

`;
  output += "Created by shows who loaded or created the model. Holders shows who currently keeps the model alive.\n\n";
  if (!debugInfo.models.length) {
    output += "No live chat models.\n";
    return output;
  }
  for (const model of debugInfo.models) {
    const liveModel = chatService.getSession(model.sessionResource);
    const agentSession = agentSessionsService.getSession(model.sessionResource);
    const archived = agentSession ? agentSession.isArchived() : "unknown";
    const age = liveModel ? fromNow(liveModel.timing.created, true, true, true) : "unknown";
    output += `## ${model.title || "(untitled)"}

`;
    output += `- Session: ${model.sessionResource.toString()}
`;
    output += `- Created by: ${model.createdBy}
`;
    output += `- Archived: ${archived}
`;
    output += `- Age: ${age}
`;
    output += `- Initial location: ${model.initialLocation}
`;
    output += `- Imported: ${model.isImported}
`;
    output += `- Pending edits: ${model.hasPendingEdits}
`;
    output += `- Background keep-alive enabled: ${model.willKeepAlive}
`;
    output += `- Pending disposal: ${model.pendingDisposal}
`;
    output += `- Reference count: ${model.referenceCount}
`;
    if (model.holders.length) {
      output += "- Holders:\n";
      for (const holder of model.holders) {
        output += `  - ${holder.holder}: ${holder.count}
`;
      }
    } else {
      output += "- Holders: none\n";
    }
    output += "\n";
  }
  return output;
}
const _LogChatInputHistoryAction = class _LogChatInputHistoryAction extends Action2 {
  constructor() {
    super({
      id: _LogChatInputHistoryAction.ID,
      title: localize2("workbench.action.chat.logInputHistory.label", "Log Chat Input History"),
      icon: Codicon.attach,
      category: Categories.Developer,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  async run(accessor, ...args) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    chatWidgetService.lastFocusedWidget?.logInputHistory();
  }
};
_LogChatInputHistoryAction.ID = "workbench.action.chat.logInputHistory";
let LogChatInputHistoryAction = _LogChatInputHistoryAction;
const _LogChatIndexAction = class _LogChatIndexAction extends Action2 {
  constructor() {
    super({
      id: _LogChatIndexAction.ID,
      title: localize2("workbench.action.chat.logChatIndex.label", "Log Chat Index"),
      icon: Codicon.attach,
      category: Categories.Developer,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  async run(accessor, ...args) {
    const chatService = accessor.get(IChatService);
    chatService.logChatIndex();
  }
};
_LogChatIndexAction.ID = "workbench.action.chat.logChatIndex";
let LogChatIndexAction = _LogChatIndexAction;
const _InspectChatModelAction = class _InspectChatModelAction extends Action2 {
  constructor() {
    super({
      id: _InspectChatModelAction.ID,
      title: localize2("workbench.action.chat.inspectChatModel.label", "Inspect Chat Model"),
      icon: Codicon.inspect,
      category: Categories.Developer,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  async run(accessor, ...args) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const editorService = accessor.get(IEditorService);
    const widget = chatWidgetService.lastFocusedWidget;
    if (!widget?.viewModel) {
      return;
    }
    const model = widget.viewModel.model;
    const modelData = model.toJSON();
    let output = "# Chat Model Inspection\n\n";
    const requests = modelData.requests;
    if (requests && requests.length > 0) {
      const latestRequest = requests[requests.length - 1];
      if (latestRequest.response) {
        output += "## Latest Response\n\n";
        output += "```json\n" + JSON.stringify(latestRequest.response, uriReplacer, 2) + "\n```\n\n";
      }
    }
    output += "## Full Chat Model\n\n";
    output += "```json\n" + JSON.stringify(modelData, uriReplacer, 2) + "\n```\n";
    await editorService.openEditor({
      resource: void 0,
      contents: output,
      languageId: "markdown",
      options: {
        pinned: true
      }
    });
  }
};
_InspectChatModelAction.ID = "workbench.action.chat.inspectChatModel";
let InspectChatModelAction = _InspectChatModelAction;
const _InspectChatModelReferencesAction = class _InspectChatModelReferencesAction extends Action2 {
  constructor() {
    super({
      id: _InspectChatModelReferencesAction.ID,
      title: localize2("workbench.action.chat.inspectChatModelReferences.label", "Inspect Chat Model References"),
      icon: Codicon.inspect,
      category: Categories.Developer,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  async run(accessor) {
    const instantiationService = accessor.get(IInstantiationService);
    const editorService = accessor.get(IEditorService);
    await editorService.openEditor({
      resource: void 0,
      contents: instantiationService.invokeFunction(formatChatModelReferenceInspection),
      languageId: "markdown",
      options: {
        pinned: true
      }
    });
  }
};
_InspectChatModelReferencesAction.ID = "workbench.action.chat.inspectChatModelReferences";
let InspectChatModelReferencesAction = _InspectChatModelReferencesAction;
function subscriptionKindLabel(kind) {
  switch (kind) {
    case StateComponents.Root:
      return "root";
    case StateComponents.Session:
      return "session";
    case StateComponents.Terminal:
      return "terminal";
    case StateComponents.Changeset:
      return "changeset";
    default:
      return `unknown(${kind})`;
  }
}
function escapeMarkdownTableCell(value) {
  return value.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}
function formatConnectionSubscriptions(label, details, connection) {
  let output = `## ${label}

`;
  output += `- ${details}
`;
  if (!connection) {
    output += "- Not connected.\n\n";
    return output;
  }
  const root = connection.rootState.value;
  if (root === void 0) {
    output += "- Root state: pending (no snapshot yet)\n";
  } else if (root instanceof Error) {
    output += `- Root state: error (${root.message})
`;
  } else {
    const agents = root.agents?.map((a) => a.displayName).join(", ") || "none";
    output += `- Root state: agents=[${agents}], activeSessions=${root.activeSessions ?? 0}, terminals=${root.terminals?.length ?? 0}
`;
  }
  const subscriptions = connection.getActiveSubscriptions();
  output += `- Active subscriptions: ${subscriptions.length}

`;
  if (subscriptions.length) {
    const sorted = [...subscriptions].sort((a, b) => a.resource.toString().localeCompare(b.resource.toString()));
    output += "| Resource | Kind | Refs | Holders | Status |\n";
    output += "| --- | --- | --- | --- | --- |\n";
    for (const subscription of sorted) {
      const holders = subscription.holders.length ? subscription.holders.map((h) => h.count > 1 ? `${h.owner} (${h.count})` : h.owner).join(", ") : "(none)";
      const cells = [
        subscription.resource.toString(),
        subscriptionKindLabel(subscription.kind),
        String(subscription.refCount),
        holders,
        subscription.status
      ].map(escapeMarkdownTableCell);
      output += `| ${cells.join(" | ")} |
`;
    }
    output += "\n";
  }
  return output;
}
function formatAgentHostSubscriptionsInspection(accessor) {
  const connectionsService = accessor.get(IAgentHostConnectionsService);
  const connections = connectionsService.connections;
  const remoteCount = connections.filter((c) => !c.isAmbient).length;
  let output = "# Agent Host Subscriptions\n\n";
  output += `- Connections: ${connections.length} (1 ambient, ${remoteCount} remote)
`;
  output += "Lists every resource each connected agent host is currently subscribed to. The always-live root state is summarized separately from the per-resource subscription table.\n\n";
  for (const info of connections) {
    const heading = info.isAmbient ? "Ambient agent host" : `Remote: ${info.name}`;
    const details = [
      ...info.address ? [`address: ${info.address}`] : [],
      `clientId: ${info.connection?.clientId || "(none)"}`
    ].join(" \xB7 ");
    output += formatConnectionSubscriptions(heading, details, info.connection);
  }
  return output;
}
const _InspectAgentHostSubscriptionsAction = class _InspectAgentHostSubscriptionsAction extends Action2 {
  constructor() {
    super({
      id: _InspectAgentHostSubscriptionsAction.ID,
      title: localize2("workbench.action.chat.inspectAgentHostSubscriptions.label", "Inspect Agent Host Subscriptions"),
      icon: Codicon.inspect,
      category: Categories.Developer,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  async run(accessor) {
    const instantiationService = accessor.get(IInstantiationService);
    const editorService = accessor.get(IEditorService);
    await editorService.openEditor({
      resource: void 0,
      contents: instantiationService.invokeFunction(formatAgentHostSubscriptionsInspection),
      languageId: "markdown",
      options: {
        pinned: true
      }
    });
  }
};
_InspectAgentHostSubscriptionsAction.ID = "workbench.action.chat.inspectAgentHostSubscriptions";
let InspectAgentHostSubscriptionsAction = _InspectAgentHostSubscriptionsAction;
const _ClearRecentlyUsedLanguageModelsAction = class _ClearRecentlyUsedLanguageModelsAction extends Action2 {
  constructor() {
    super({
      id: _ClearRecentlyUsedLanguageModelsAction.ID,
      title: localize2("workbench.action.chat.clearRecentlyUsedLanguageModels.label", "Clear Recently Used Language Models"),
      category: Categories.Developer,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  run(accessor) {
    accessor.get(ILanguageModelsService).clearRecentlyUsedList();
  }
};
_ClearRecentlyUsedLanguageModelsAction.ID = "workbench.action.chat.clearRecentlyUsedLanguageModels";
let ClearRecentlyUsedLanguageModelsAction = _ClearRecentlyUsedLanguageModelsAction;
const _ResetChatPermissionWarningDialogsAction = class _ResetChatPermissionWarningDialogsAction extends Action2 {
  constructor() {
    super({
      id: _ResetChatPermissionWarningDialogsAction.ID,
      title: localize2("workbench.action.chat.resetPermissionWarningDialogs.label", "Reset Permission Warning Dialogs (Autopilot, Bypass Approvals)"),
      category: Categories.Developer,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  run(accessor) {
    const storageService = accessor.get(IStorageService);
    storageService.remove(AUTOPILOT_DONT_SHOW_AGAIN_KEY, StorageScope.PROFILE);
    storageService.remove(AUTO_APPROVE_DONT_SHOW_AGAIN_KEY, StorageScope.PROFILE);
    resetShownWarnings();
  }
};
_ResetChatPermissionWarningDialogsAction.ID = "workbench.action.chat.resetPermissionWarningDialogs";
let ResetChatPermissionWarningDialogsAction = _ResetChatPermissionWarningDialogsAction;
export {
  registerChatDeveloperActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXREZXZlbG9wZXJBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGZyb21Ob3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IGlzVXJpQ29tcG9uZW50cywgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBBVVRPUElMT1RfRE9OVF9TSE9XX0FHQUlOX0tFWSwgQVVUT19BUFBST1ZFX0RPTlRfU0hPV19BR0FJTl9LRVkgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFBlcm1pc3Npb25TdG9yYWdlS2V5cy5qcyc7XG5pbXBvcnQgeyByZXNldFNob3duV2FybmluZ3MgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFBlcm1pc3Npb25XYXJuaW5ncy5qcyc7XG5pbXBvcnQgeyBPcGVuQ29waWxvdENsaVN0YXRlRmlsZUFjdGlvbiB9IGZyb20gJy4vb3BlbkNvcGlsb3RDbGlTdGF0ZUZpbGVBY3Rpb24uanMnO1xuaW1wb3J0IHsgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTdGF0ZUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5cbmZ1bmN0aW9uIHVyaVJlcGxhY2VyKF9rZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB1bmtub3duIHtcblx0aWYgKFVSSS5pc1VyaSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcblx0fVxuXG5cdGlmIChpc1VyaUNvbXBvbmVudHModmFsdWUpKSB7XG5cdFx0Ly8gVGhpcyBzaG91bGRuJ3QgYmUgbmVjZXNzYXJ5IGJ1dCBpdCBzZWVtcyB0aGF0IHNvbWUgVVJJcyBpbiBDaGF0TW9kZWxzIGFyZW4ndCBwcm9wZXJseSByZXZpdmVkXG5cdFx0cmV0dXJuIFVSSS5mcm9tKHZhbHVlKS50b1N0cmluZygpO1xuXHR9XG5cblx0cmV0dXJuIHZhbHVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDaGF0RGV2ZWxvcGVyQWN0aW9ucygpIHtcblx0cmVnaXN0ZXJBY3Rpb24yKExvZ0NoYXRJbnB1dEhpc3RvcnlBY3Rpb24pO1xuXHRyZWdpc3RlckFjdGlvbjIoTG9nQ2hhdEluZGV4QWN0aW9uKTtcblx0cmVnaXN0ZXJBY3Rpb24yKEluc3BlY3RDaGF0TW9kZWxBY3Rpb24pO1xuXHRyZWdpc3RlckFjdGlvbjIoSW5zcGVjdENoYXRNb2RlbFJlZmVyZW5jZXNBY3Rpb24pO1xuXHRyZWdpc3RlckFjdGlvbjIoSW5zcGVjdEFnZW50SG9zdFN1YnNjcmlwdGlvbnNBY3Rpb24pO1xuXHRyZWdpc3RlckFjdGlvbjIoQ2xlYXJSZWNlbnRseVVzZWRMYW5ndWFnZU1vZGVsc0FjdGlvbik7XG5cdHJlZ2lzdGVyQWN0aW9uMihSZXNldENoYXRQZXJtaXNzaW9uV2FybmluZ0RpYWxvZ3NBY3Rpb24pO1xuXHRyZWdpc3RlckFjdGlvbjIoT3BlbkNvcGlsb3RDbGlTdGF0ZUZpbGVBY3Rpb24pO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRDaGF0TW9kZWxSZWZlcmVuY2VJbnNwZWN0aW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogc3RyaW5nIHtcblx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0Y29uc3QgYWdlbnRTZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlKTtcblx0Y29uc3QgZGVidWdJbmZvID0gY2hhdFNlcnZpY2UuZ2V0Q2hhdE1vZGVsUmVmZXJlbmNlRGVidWdJbmZvKCk7XG5cdGNvbnN0IHJlZmVyZW5jZWRNb2RlbHMgPSBkZWJ1Z0luZm8ubW9kZWxzLmZpbHRlcihtb2RlbCA9PiBtb2RlbC5yZWZlcmVuY2VDb3VudCA+IDApO1xuXHRjb25zdCBwZW5kaW5nRWRpdE1vZGVscyA9IGRlYnVnSW5mby5tb2RlbHMuZmlsdGVyKG1vZGVsID0+IG1vZGVsLmhhc1BlbmRpbmdFZGl0cyk7XG5cdGNvbnN0IHBlbmRpbmdEaXNwb3NhbE1vZGVscyA9IGRlYnVnSW5mby5tb2RlbHMuZmlsdGVyKG1vZGVsID0+IG1vZGVsLnBlbmRpbmdEaXNwb3NhbCk7XG5cblx0bGV0IG91dHB1dCA9ICcjIENoYXQgTW9kZWwgUmVmZXJlbmNlc1xcblxcbic7XG5cdG91dHB1dCArPSBgLSBMaXZlIG1vZGVsczogJHtkZWJ1Z0luZm8udG90YWxNb2RlbHN9XFxuYDtcblx0b3V0cHV0ICs9IGAtIExpdmUgcmVmZXJlbmNlczogJHtkZWJ1Z0luZm8udG90YWxSZWZlcmVuY2VzfVxcbmA7XG5cdG91dHB1dCArPSBgLSBNb2RlbHMgd2l0aCBhY3RpdmUgcmVmZXJlbmNlczogJHtyZWZlcmVuY2VkTW9kZWxzLmxlbmd0aH1cXG5gO1xuXHRvdXRwdXQgKz0gYC0gTW9kZWxzIHdpdGggcGVuZGluZyBlZGl0czogJHtwZW5kaW5nRWRpdE1vZGVscy5sZW5ndGh9XFxuYDtcblx0b3V0cHV0ICs9IGAtIE1vZGVscyBwZW5kaW5nIGRpc3Bvc2FsOiAke3BlbmRpbmdEaXNwb3NhbE1vZGVscy5sZW5ndGh9XFxuXFxuYDtcblx0b3V0cHV0ICs9ICdDcmVhdGVkIGJ5IHNob3dzIHdobyBsb2FkZWQgb3IgY3JlYXRlZCB0aGUgbW9kZWwuIEhvbGRlcnMgc2hvd3Mgd2hvIGN1cnJlbnRseSBrZWVwcyB0aGUgbW9kZWwgYWxpdmUuXFxuXFxuJztcblxuXHRpZiAoIWRlYnVnSW5mby5tb2RlbHMubGVuZ3RoKSB7XG5cdFx0b3V0cHV0ICs9ICdObyBsaXZlIGNoYXQgbW9kZWxzLlxcbic7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdGZvciAoY29uc3QgbW9kZWwgb2YgZGVidWdJbmZvLm1vZGVscykge1xuXHRcdGNvbnN0IGxpdmVNb2RlbCA9IGNoYXRTZXJ2aWNlLmdldFNlc3Npb24obW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSBhZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgYXJjaGl2ZWQgPSBhZ2VudFNlc3Npb24gPyBhZ2VudFNlc3Npb24uaXNBcmNoaXZlZCgpIDogJ3Vua25vd24nO1xuXHRcdGNvbnN0IGFnZSA9IGxpdmVNb2RlbCA/IGZyb21Ob3cobGl2ZU1vZGVsLnRpbWluZy5jcmVhdGVkLCB0cnVlLCB0cnVlLCB0cnVlKSA6ICd1bmtub3duJztcblxuXHRcdG91dHB1dCArPSBgIyMgJHttb2RlbC50aXRsZSB8fCAnKHVudGl0bGVkKSd9XFxuXFxuYDtcblx0XHRvdXRwdXQgKz0gYC0gU2Vzc2lvbjogJHttb2RlbC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1cXG5gO1xuXHRcdG91dHB1dCArPSBgLSBDcmVhdGVkIGJ5OiAke21vZGVsLmNyZWF0ZWRCeX1cXG5gO1xuXHRcdG91dHB1dCArPSBgLSBBcmNoaXZlZDogJHthcmNoaXZlZH1cXG5gO1xuXHRcdG91dHB1dCArPSBgLSBBZ2U6ICR7YWdlfVxcbmA7XG5cdFx0b3V0cHV0ICs9IGAtIEluaXRpYWwgbG9jYXRpb246ICR7bW9kZWwuaW5pdGlhbExvY2F0aW9ufVxcbmA7XG5cdFx0b3V0cHV0ICs9IGAtIEltcG9ydGVkOiAke21vZGVsLmlzSW1wb3J0ZWR9XFxuYDtcblx0XHRvdXRwdXQgKz0gYC0gUGVuZGluZyBlZGl0czogJHttb2RlbC5oYXNQZW5kaW5nRWRpdHN9XFxuYDtcblx0XHRvdXRwdXQgKz0gYC0gQmFja2dyb3VuZCBrZWVwLWFsaXZlIGVuYWJsZWQ6ICR7bW9kZWwud2lsbEtlZXBBbGl2ZX1cXG5gO1xuXHRcdG91dHB1dCArPSBgLSBQZW5kaW5nIGRpc3Bvc2FsOiAke21vZGVsLnBlbmRpbmdEaXNwb3NhbH1cXG5gO1xuXHRcdG91dHB1dCArPSBgLSBSZWZlcmVuY2UgY291bnQ6ICR7bW9kZWwucmVmZXJlbmNlQ291bnR9XFxuYDtcblxuXHRcdGlmIChtb2RlbC5ob2xkZXJzLmxlbmd0aCkge1xuXHRcdFx0b3V0cHV0ICs9ICctIEhvbGRlcnM6XFxuJztcblx0XHRcdGZvciAoY29uc3QgaG9sZGVyIG9mIG1vZGVsLmhvbGRlcnMpIHtcblx0XHRcdFx0b3V0cHV0ICs9IGAgIC0gJHtob2xkZXIuaG9sZGVyfTogJHtob2xkZXIuY291bnR9XFxuYDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0b3V0cHV0ICs9ICctIEhvbGRlcnM6IG5vbmVcXG4nO1xuXHRcdH1cblxuXHRcdG91dHB1dCArPSAnXFxuJztcblx0fVxuXG5cdHJldHVybiBvdXRwdXQ7XG59XG5cbmNsYXNzIExvZ0NoYXRJbnB1dEhpc3RvcnlBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5sb2dJbnB1dEhpc3RvcnknO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBMb2dDaGF0SW5wdXRIaXN0b3J5QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0LmxvZ0lucHV0SGlzdG9yeS5sYWJlbCcsIFwiTG9nIENoYXQgSW5wdXQgSGlzdG9yeVwiKSxcblx0XHRcdGljb246IENvZGljb24uYXR0YWNoLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ/LmxvZ0lucHV0SGlzdG9yeSgpO1xuXHR9XG59XG5cbmNsYXNzIExvZ0NoYXRJbmRleEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmxvZ0NoYXRJbmRleCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IExvZ0NoYXRJbmRleEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5sb2dDaGF0SW5kZXgubGFiZWwnLCBcIkxvZyBDaGF0IEluZGV4XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hdHRhY2gsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRjaGF0U2VydmljZS5sb2dDaGF0SW5kZXgoKTtcblx0fVxufVxuXG5jbGFzcyBJbnNwZWN0Q2hhdE1vZGVsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaW5zcGVjdENoYXRNb2RlbCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEluc3BlY3RDaGF0TW9kZWxBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaW5zcGVjdENoYXRNb2RlbC5sYWJlbCcsIFwiSW5zcGVjdCBDaGF0IE1vZGVsXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5pbnNwZWN0LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cblx0XHRpZiAoIXdpZGdldD8udmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB3aWRnZXQudmlld01vZGVsLm1vZGVsO1xuXHRcdGNvbnN0IG1vZGVsRGF0YSA9IG1vZGVsLnRvSlNPTigpO1xuXG5cdFx0Ly8gQnVpbGQgbWFya2Rvd24gb3V0cHV0IHdpdGggbGF0ZXN0IHJlc3BvbnNlIGF0IHRoZSB0b3Bcblx0XHRsZXQgb3V0cHV0ID0gJyMgQ2hhdCBNb2RlbCBJbnNwZWN0aW9uXFxuXFxuJztcblxuXHRcdC8vIFNob3cgbGF0ZXN0IHJlc3BvbnNlIGZpcnN0IGlmIGl0IGV4aXN0c1xuXHRcdGNvbnN0IHJlcXVlc3RzID0gbW9kZWxEYXRhLnJlcXVlc3RzO1xuXHRcdGlmIChyZXF1ZXN0cyAmJiByZXF1ZXN0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBsYXRlc3RSZXF1ZXN0ID0gcmVxdWVzdHNbcmVxdWVzdHMubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAobGF0ZXN0UmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRvdXRwdXQgKz0gJyMjIExhdGVzdCBSZXNwb25zZVxcblxcbic7XG5cdFx0XHRcdG91dHB1dCArPSAnYGBganNvblxcbicgKyBKU09OLnN0cmluZ2lmeShsYXRlc3RSZXF1ZXN0LnJlc3BvbnNlLCB1cmlSZXBsYWNlciwgMikgKyAnXFxuYGBgXFxuXFxuJztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTaG93IGZ1bGwgbW9kZWwgZGF0YVxuXHRcdG91dHB1dCArPSAnIyMgRnVsbCBDaGF0IE1vZGVsXFxuXFxuJztcblx0XHRvdXRwdXQgKz0gJ2BgYGpzb25cXG4nICsgSlNPTi5zdHJpbmdpZnkobW9kZWxEYXRhLCB1cmlSZXBsYWNlciwgMikgKyAnXFxuYGBgXFxuJztcblxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0Y29udGVudHM6IG91dHB1dCxcblx0XHRcdGxhbmd1YWdlSWQ6ICdtYXJrZG93bicsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHBpbm5lZDogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIEluc3BlY3RDaGF0TW9kZWxSZWZlcmVuY2VzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaW5zcGVjdENoYXRNb2RlbFJlZmVyZW5jZXMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBJbnNwZWN0Q2hhdE1vZGVsUmVmZXJlbmNlc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5pbnNwZWN0Q2hhdE1vZGVsUmVmZXJlbmNlcy5sYWJlbCcsIFwiSW5zcGVjdCBDaGF0IE1vZGVsIFJlZmVyZW5jZXNcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmluc3BlY3QsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdGNvbnRlbnRzOiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmb3JtYXRDaGF0TW9kZWxSZWZlcmVuY2VJbnNwZWN0aW9uKSxcblx0XHRcdGxhbmd1YWdlSWQ6ICdtYXJrZG93bicsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHBpbm5lZDogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHN1YnNjcmlwdGlvbktpbmRMYWJlbChraW5kOiBTdGF0ZUNvbXBvbmVudHMpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRjYXNlIFN0YXRlQ29tcG9uZW50cy5Sb290OiByZXR1cm4gJ3Jvb3QnO1xuXHRcdGNhc2UgU3RhdGVDb21wb25lbnRzLlNlc3Npb246IHJldHVybiAnc2Vzc2lvbic7XG5cdFx0Y2FzZSBTdGF0ZUNvbXBvbmVudHMuVGVybWluYWw6IHJldHVybiAndGVybWluYWwnO1xuXHRcdGNhc2UgU3RhdGVDb21wb25lbnRzLkNoYW5nZXNldDogcmV0dXJuICdjaGFuZ2VzZXQnO1xuXHRcdGRlZmF1bHQ6IHJldHVybiBgdW5rbm93bigke2tpbmR9KWA7XG5cdH1cbn1cblxuLyoqIEVzY2FwZSBhIHZhbHVlIHNvIGl0IGlzIHNhZmUgdG8gZW1iZWQgaW4gYSBtYXJrZG93biB0YWJsZSBjZWxsLiAqL1xuZnVuY3Rpb24gZXNjYXBlTWFya2Rvd25UYWJsZUNlbGwodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB2YWx1ZS5yZXBsYWNlKC9cXHI/XFxuL2csICc8YnI+JykucmVwbGFjZSgvXFx8L2csICdcXFxcfCcpO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRDb25uZWN0aW9uU3Vic2NyaXB0aW9ucyhsYWJlbDogc3RyaW5nLCBkZXRhaWxzOiBzdHJpbmcsIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24gfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRsZXQgb3V0cHV0ID0gYCMjICR7bGFiZWx9XFxuXFxuYDtcblx0b3V0cHV0ICs9IGAtICR7ZGV0YWlsc31cXG5gO1xuXG5cdGlmICghY29ubmVjdGlvbikge1xuXHRcdG91dHB1dCArPSAnLSBOb3QgY29ubmVjdGVkLlxcblxcbic7XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdGNvbnN0IHJvb3QgPSBjb25uZWN0aW9uLnJvb3RTdGF0ZS52YWx1ZTtcblx0aWYgKHJvb3QgPT09IHVuZGVmaW5lZCkge1xuXHRcdG91dHB1dCArPSAnLSBSb290IHN0YXRlOiBwZW5kaW5nIChubyBzbmFwc2hvdCB5ZXQpXFxuJztcblx0fSBlbHNlIGlmIChyb290IGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRvdXRwdXQgKz0gYC0gUm9vdCBzdGF0ZTogZXJyb3IgKCR7cm9vdC5tZXNzYWdlfSlcXG5gO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IGFnZW50cyA9IHJvb3QuYWdlbnRzPy5tYXAoYSA9PiBhLmRpc3BsYXlOYW1lKS5qb2luKCcsICcpIHx8ICdub25lJztcblx0XHRvdXRwdXQgKz0gYC0gUm9vdCBzdGF0ZTogYWdlbnRzPVske2FnZW50c31dLCBhY3RpdmVTZXNzaW9ucz0ke3Jvb3QuYWN0aXZlU2Vzc2lvbnMgPz8gMH0sIHRlcm1pbmFscz0ke3Jvb3QudGVybWluYWxzPy5sZW5ndGggPz8gMH1cXG5gO1xuXHR9XG5cblx0Y29uc3Qgc3Vic2NyaXB0aW9ucyA9IGNvbm5lY3Rpb24uZ2V0QWN0aXZlU3Vic2NyaXB0aW9ucygpO1xuXHRvdXRwdXQgKz0gYC0gQWN0aXZlIHN1YnNjcmlwdGlvbnM6ICR7c3Vic2NyaXB0aW9ucy5sZW5ndGh9XFxuXFxuYDtcblxuXHRpZiAoc3Vic2NyaXB0aW9ucy5sZW5ndGgpIHtcblx0XHRjb25zdCBzb3J0ZWQgPSBbLi4uc3Vic2NyaXB0aW9uc10uc29ydCgoYSwgYikgPT4gYS5yZXNvdXJjZS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi5yZXNvdXJjZS50b1N0cmluZygpKSk7XG5cdFx0b3V0cHV0ICs9ICd8IFJlc291cmNlIHwgS2luZCB8IFJlZnMgfCBIb2xkZXJzIHwgU3RhdHVzIHxcXG4nO1xuXHRcdG91dHB1dCArPSAnfCAtLS0gfCAtLS0gfCAtLS0gfCAtLS0gfCAtLS0gfFxcbic7XG5cdFx0Zm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2Ygc29ydGVkKSB7XG5cdFx0XHRjb25zdCBob2xkZXJzID0gc3Vic2NyaXB0aW9uLmhvbGRlcnMubGVuZ3RoXG5cdFx0XHRcdD8gc3Vic2NyaXB0aW9uLmhvbGRlcnMubWFwKGggPT4gaC5jb3VudCA+IDEgPyBgJHtoLm93bmVyfSAoJHtoLmNvdW50fSlgIDogaC5vd25lcikuam9pbignLCAnKVxuXHRcdFx0XHQ6ICcobm9uZSknO1xuXHRcdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRcdHN1YnNjcmlwdGlvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRzdWJzY3JpcHRpb25LaW5kTGFiZWwoc3Vic2NyaXB0aW9uLmtpbmQpLFxuXHRcdFx0XHRTdHJpbmcoc3Vic2NyaXB0aW9uLnJlZkNvdW50KSxcblx0XHRcdFx0aG9sZGVycyxcblx0XHRcdFx0c3Vic2NyaXB0aW9uLnN0YXR1cyxcblx0XHRcdF0ubWFwKGVzY2FwZU1hcmtkb3duVGFibGVDZWxsKTtcblx0XHRcdG91dHB1dCArPSBgfCAke2NlbGxzLmpvaW4oJyB8ICcpfSB8XFxuYDtcblx0XHR9XG5cdFx0b3V0cHV0ICs9ICdcXG4nO1xuXHR9XG5cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuZnVuY3Rpb24gZm9ybWF0QWdlbnRIb3N0U3Vic2NyaXB0aW9uc0luc3BlY3Rpb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBzdHJpbmcge1xuXHRjb25zdCBjb25uZWN0aW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZSk7XG5cblx0Y29uc3QgY29ubmVjdGlvbnMgPSBjb25uZWN0aW9uc1NlcnZpY2UuY29ubmVjdGlvbnM7XG5cdGNvbnN0IHJlbW90ZUNvdW50ID0gY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gIWMuaXNBbWJpZW50KS5sZW5ndGg7XG5cblx0bGV0IG91dHB1dCA9ICcjIEFnZW50IEhvc3QgU3Vic2NyaXB0aW9uc1xcblxcbic7XG5cdG91dHB1dCArPSBgLSBDb25uZWN0aW9uczogJHtjb25uZWN0aW9ucy5sZW5ndGh9ICgxIGFtYmllbnQsICR7cmVtb3RlQ291bnR9IHJlbW90ZSlcXG5gO1xuXHRvdXRwdXQgKz0gJ0xpc3RzIGV2ZXJ5IHJlc291cmNlIGVhY2ggY29ubmVjdGVkIGFnZW50IGhvc3QgaXMgY3VycmVudGx5IHN1YnNjcmliZWQgdG8uIFRoZSBhbHdheXMtbGl2ZSByb290IHN0YXRlIGlzIHN1bW1hcml6ZWQgc2VwYXJhdGVseSBmcm9tIHRoZSBwZXItcmVzb3VyY2Ugc3Vic2NyaXB0aW9uIHRhYmxlLlxcblxcbic7XG5cblx0Zm9yIChjb25zdCBpbmZvIG9mIGNvbm5lY3Rpb25zKSB7XG5cdFx0Y29uc3QgaGVhZGluZyA9IGluZm8uaXNBbWJpZW50ID8gJ0FtYmllbnQgYWdlbnQgaG9zdCcgOiBgUmVtb3RlOiAke2luZm8ubmFtZX1gO1xuXHRcdGNvbnN0IGRldGFpbHMgPSBbXG5cdFx0XHQuLi4oaW5mby5hZGRyZXNzID8gW2BhZGRyZXNzOiAke2luZm8uYWRkcmVzc31gXSA6IFtdKSxcblx0XHRcdGBjbGllbnRJZDogJHtpbmZvLmNvbm5lY3Rpb24/LmNsaWVudElkIHx8ICcobm9uZSknfWAsXG5cdFx0XS5qb2luKCcgXHUwMEI3ICcpO1xuXHRcdG91dHB1dCArPSBmb3JtYXRDb25uZWN0aW9uU3Vic2NyaXB0aW9ucyhoZWFkaW5nLCBkZXRhaWxzLCBpbmZvLmNvbm5lY3Rpb24pO1xuXHR9XG5cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuY2xhc3MgSW5zcGVjdEFnZW50SG9zdFN1YnNjcmlwdGlvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5pbnNwZWN0QWdlbnRIb3N0U3Vic2NyaXB0aW9ucyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEluc3BlY3RBZ2VudEhvc3RTdWJzY3JpcHRpb25zQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0Lmluc3BlY3RBZ2VudEhvc3RTdWJzY3JpcHRpb25zLmxhYmVsJywgXCJJbnNwZWN0IEFnZW50IEhvc3QgU3Vic2NyaXB0aW9uc1wiKSxcblx0XHRcdGljb246IENvZGljb24uaW5zcGVjdCxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0Y29udGVudHM6IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZvcm1hdEFnZW50SG9zdFN1YnNjcmlwdGlvbnNJbnNwZWN0aW9uKSxcblx0XHRcdGxhbmd1YWdlSWQ6ICdtYXJrZG93bicsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHBpbm5lZDogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIENsZWFyUmVjZW50bHlVc2VkTGFuZ3VhZ2VNb2RlbHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jbGVhclJlY2VudGx5VXNlZExhbmd1YWdlTW9kZWxzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2xlYXJSZWNlbnRseVVzZWRMYW5ndWFnZU1vZGVsc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jbGVhclJlY2VudGx5VXNlZExhbmd1YWdlTW9kZWxzLmxhYmVsJywgXCJDbGVhciBSZWNlbnRseSBVc2VkIExhbmd1YWdlIE1vZGVsc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0YWNjZXNzb3IuZ2V0KElMYW5ndWFnZU1vZGVsc1NlcnZpY2UpLmNsZWFyUmVjZW50bHlVc2VkTGlzdCgpO1xuXHR9XG59XG5cbmNsYXNzIFJlc2V0Q2hhdFBlcm1pc3Npb25XYXJuaW5nRGlhbG9nc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc2V0UGVybWlzc2lvbldhcm5pbmdEaWFsb2dzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUmVzZXRDaGF0UGVybWlzc2lvbldhcm5pbmdEaWFsb2dzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc2V0UGVybWlzc2lvbldhcm5pbmdEaWFsb2dzLmxhYmVsJywgXCJSZXNldCBQZXJtaXNzaW9uIFdhcm5pbmcgRGlhbG9ncyAoQXV0b3BpbG90LCBCeXBhc3MgQXBwcm92YWxzKVwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRzdG9yYWdlU2VydmljZS5yZW1vdmUoQVVUT1BJTE9UX0RPTlRfU0hPV19BR0FJTl9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRzdG9yYWdlU2VydmljZS5yZW1vdmUoQVVUT19BUFBST1ZFX0RPTlRfU0hPV19BR0FJTl9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRyZXNldFNob3duV2FybmluZ3MoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixXQUFXO0FBRXJDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FB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
