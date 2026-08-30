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
import "./media/agentsessionprojection.css";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { createDecorator } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IEditorGroupsService } from "../../../../../services/editor/common/editorGroupsService.js";
import { IEditorService, MODAL_GROUP } from "../../../../../services/editor/common/editorService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { isSessionInProgressStatus } from "../agentSessionsModel.js";
import { IChatWidgetService } from "../../chat.js";
import { AgentSessionProviders } from "../agentSessions.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { IWorkbenchLayoutService, Parts } from "../../../../../services/layout/browser/layoutService.js";
import { ACTION_ID_NEW_CHAT } from "../../actions/chatActions.js";
import { IChatEditingService, ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { IAgentTitleBarStatusService } from "./agentTitleBarStatusService.js";
import { inAgentSessionProjection } from "./agentSessionProjection.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IAgentSessionsService } from "../agentSessionsService.js";
const AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS = new Set(Object.values(AgentSessionProviders));
const IAgentSessionProjectionService = createDecorator("agentSessionProjectionService");
let AgentSessionProjectionService = class extends Disposable {
  constructor(contextKeyService, configurationService, editorGroupsService, editorService, logService, chatWidgetService, chatSessionsService, layoutService, commandService, chatEditingService, agentTitleBarStatusService, agentSessionsService) {
    super();
    this.configurationService = configurationService;
    this.editorGroupsService = editorGroupsService;
    this.editorService = editorService;
    this.logService = logService;
    this.chatWidgetService = chatWidgetService;
    this.chatSessionsService = chatSessionsService;
    this.layoutService = layoutService;
    this.commandService = commandService;
    this.chatEditingService = chatEditingService;
    this.agentTitleBarStatusService = agentTitleBarStatusService;
    this.agentSessionsService = agentSessionsService;
    this._isActive = false;
    /** Prevents re-entrant exits and enter-on-exit races */
    this._isExiting = false;
    /** Prevents checkForEmptyEditors from exiting during session swaps */
    this._isSwappingSessions = false;
    this._onDidChangeProjectionMode = this._register(new Emitter());
    this.onDidChangeProjectionMode = this._onDidChangeProjectionMode.event;
    this._onDidChangeActiveSession = this._register(new Emitter());
    this.onDidChangeActiveSession = this._onDidChangeActiveSession.event;
    /** Working sets per session, keyed by session resource URI string */
    this._sessionWorkingSets = /* @__PURE__ */ new Map();
    /** Whether the auxiliary bar was maximized when entering projection mode */
    this._wasAuxiliaryBarMaximized = false;
    this._inProjectionModeContextKey = inAgentSessionProjection.bindTo(contextKeyService);
    this._register(this.editorService.onDidCloseEditor(() => this._checkForEmptyEditors()));
    this._register(this.agentSessionsService.model.onDidChangeSessions(() => this._checkForInProgressSession()));
  }
  get isActive() {
    return this._isActive;
  }
  get activeSession() {
    return this._activeSession;
  }
  _isEnabled() {
    return this.configurationService.getValue(ChatConfiguration.AgentSessionProjectionEnabled) === true;
  }
  _checkForEmptyEditors() {
    if (!this._isActive || this._isExiting || this._isSwappingSessions) {
      return;
    }
    const hasVisibleEditors = this.editorService.visibleEditors.length > 0;
    if (!hasVisibleEditors) {
      this.logService.trace("[AgentSessionProjection] All editors closed, exiting projection mode");
      this.exitProjection();
    }
  }
  _checkForInProgressSession() {
    if (!this._isActive || !this._activeSession) {
      return;
    }
    const updatedSession = this.agentSessionsService.getSession(this._activeSession.resource);
    if (!updatedSession) {
      return;
    }
    if (isSessionInProgressStatus(updatedSession.status)) {
      this.logService.trace("[AgentSessionProjection] Active session transitioned to in-progress, exiting projection mode");
      this.exitProjection({ startNewChat: false });
    }
  }
  /**
   * Opens a session in the chat panel without entering projection mode.
   */
  async _openSessionInChatPanel(session) {
    session.setRead(true);
    await this.chatSessionsService.activateChatSessionItemProvider(session.providerType);
    await this.chatWidgetService.openSession(session.resource, void 0, {
      title: { preferred: session.label },
      revealIfOpened: true
    });
  }
  /**
   * Open the session's files in a multi-diff editor.
   * @returns true if any files were opened, false if nothing to display
   */
  async _openSessionFiles(session) {
    this.logService.trace(`[AgentSessionProjection] Opening files for session '${session.label}'`, {
      hasChanges: !!session.changes,
      isArray: Array.isArray(session.changes),
      changeCount: Array.isArray(session.changes) ? session.changes.length : 0
    });
    if (session.changes && Array.isArray(session.changes) && session.changes.length > 0) {
      const diffResources = session.changes.filter((change) => change.originalUri).map((change) => ({
        originalUri: change.originalUri,
        modifiedUri: change.modifiedUri
      }));
      this.logService.trace(`[AgentSessionProjection] Found ${diffResources.length} files with diffs to display`);
      if (diffResources.length > 0) {
        await this.editorService.openEditor({
          multiDiffSource: session.resource.with({ scheme: session.resource.scheme + "-agent-session-projection" }),
          resources: diffResources.map((dr) => ({
            original: { resource: dr.originalUri },
            modified: { resource: dr.modifiedUri }
          })),
          label: localize("agentSessionProjection.changes.title", "{0} - All Changes", session.label)
        }, MODAL_GROUP);
        this.logService.trace(`[AgentSessionProjection] Multi-diff editor opened successfully in modal view`);
        const sessionKey = session.resource.toString();
        const newWorkingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${sessionKey}`);
        this._sessionWorkingSets.set(sessionKey, newWorkingSet);
        return true;
      } else {
        this.logService.trace(`[AgentSessionProjection] No files with diffs to display (all changes missing originalUri)`);
        return false;
      }
    } else {
      this.logService.trace(`[AgentSessionProjection] Session has no changes to display`);
      return false;
    }
  }
  async enterProjection(session) {
    if (!this._isEnabled()) {
      this.logService.trace("[AgentSessionProjection] Agent Session Projection is disabled");
      return;
    }
    if (!AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS.has(session.providerType)) {
      this.logService.trace(`[AgentSessionProjection] Provider type '${session.providerType}' does not support agent session projection`);
      return;
    }
    const isAuxBarMaximized = this.layoutService.isAuxiliaryBarMaximized();
    this.logService.trace("[AgentSessionProjection] enterProjection auxiliary bar state", {
      isAuxiliaryBarMaximized: isAuxBarMaximized
    });
    if (isSessionInProgressStatus(session.status)) {
      this.logService.trace("[AgentSessionProjection] Session is in progress, opening chat without projection mode");
      if (this._isActive) {
        await this.exitProjection({ startNewChat: false });
      }
      await this._openSessionInChatPanel(session);
      return;
    }
    let hasUndecidedChanges = true;
    let editingSessionExists = true;
    if (session.providerType === AgentSessionProviders.Local) {
      const editingSession = this.chatEditingService.getEditingSession(session.resource);
      editingSessionExists = !!editingSession;
      if (editingSession) {
        hasUndecidedChanges = editingSession.entries.get().some((e) => e.state.get() === ModifiedFileEntryState.Modified);
        if (!hasUndecidedChanges) {
          this.logService.trace("[AgentSessionProjection] Local session has no undecided changes, opening chat without projection mode");
        }
      } else {
        hasUndecidedChanges = false;
        this.logService.trace("[AgentSessionProjection] Local session has no editing session yet");
      }
    }
    if (!hasUndecidedChanges && this._isActive && editingSessionExists) {
      this.logService.trace("[AgentSessionProjection] Switching to session without changes while in projection mode, exiting projection");
      await this.exitProjection({ startNewChat: false });
      await this._openSessionInChatPanel(session);
      return;
    }
    if (!hasUndecidedChanges && this._isActive && !editingSessionExists) {
      this.logService.trace("[AgentSessionProjection] Switching to session without editing session while in projection mode, staying in projection");
      await this._openSessionInChatPanel(session);
      return;
    }
    if (hasUndecidedChanges) {
      if (!this._isActive && !this._preProjectionWorkingSet) {
        const visibleEditorsBefore = this.editorService.visibleEditors.length;
        this._preProjectionWorkingSet = this.editorGroupsService.saveWorkingSet("agent-session-projection-backup");
        this.logService.trace("[AgentSessionProjection] saved pre-projection working set", {
          id: this._preProjectionWorkingSet.id,
          visibleEditorsBefore
        });
      }
      const isSwapping = this._isActive && this._activeSession;
      if (isSwapping) {
        this._isSwappingSessions = true;
        const previousSessionKey = this._activeSession.resource.toString();
        const previousWorkingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${previousSessionKey}`);
        this._sessionWorkingSets.set(previousSessionKey, previousWorkingSet);
      }
      try {
        let filesOpened = false;
        if (session.providerType === AgentSessionProviders.Local) {
          filesOpened = true;
        } else {
          filesOpened = await this._openSessionFiles(session);
        }
        if (!filesOpened) {
          this.logService.trace("[AgentSessionProjection] No files to display, opening chat without projection mode");
          if (!this._isActive && this._preProjectionWorkingSet) {
            await this.editorGroupsService.applyWorkingSet(this._preProjectionWorkingSet);
            this.editorGroupsService.deleteWorkingSet(this._preProjectionWorkingSet);
            this._preProjectionWorkingSet = void 0;
          }
        } else {
          const wasActive = this._isActive;
          this._isActive = true;
          this._activeSession = session;
          this._inProjectionModeContextKey.set(true);
          this.layoutService.mainContainer.classList.add("agent-session-projection-active");
          if (!wasActive) {
            this._wasAuxiliaryBarMaximized = isAuxBarMaximized;
            this.logService.trace("[AgentSessionProjection] captured auxiliary bar maximized state", {
              wasAuxiliaryBarMaximized: this._wasAuxiliaryBarMaximized
            });
          }
          this.agentTitleBarStatusService.enterSessionMode(session.resource, session.label);
          if (!wasActive) {
            this._onDidChangeProjectionMode.fire(true);
          }
          this._onDidChangeActiveSession.fire(session);
        }
      } finally {
        this._isSwappingSessions = false;
      }
    }
    await this._openSessionInChatPanel(session);
    if (session.providerType === AgentSessionProviders.Local && hasUndecidedChanges) {
      await this.commandService.executeCommand("chatEditing.viewChanges");
    }
    if (this._wasAuxiliaryBarMaximized) {
      this.logService.trace("[AgentSessionProjection] hiding maximized auxiliary bar during projection");
      this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    }
  }
  async exitProjection(options) {
    if (!this._isActive || this._isExiting) {
      return;
    }
    const startNewChat = options?.startNewChat ?? true;
    this._isExiting = true;
    this.logService.trace("[AgentSessionProjection] exitProjection start", {
      hasPreProjectionWorkingSet: !!this._preProjectionWorkingSet,
      activeSession: this._activeSession?.label,
      startNewChat,
      wasAuxiliaryBarMaximized: this._wasAuxiliaryBarMaximized
    });
    if (this._activeSession) {
      const sessionKey = this._activeSession.resource.toString();
      const workingSet = this.editorGroupsService.saveWorkingSet(`agent-session-projection-${sessionKey}`);
      this._sessionWorkingSets.set(sessionKey, workingSet);
    }
    for (const group of this.editorGroupsService.groups) {
      await group.closeAllEditors();
    }
    this.logService.trace("[AgentSessionProjection] exitProjection closed editors", { visible: this.editorService.visibleEditors.length });
    if (this._preProjectionWorkingSet) {
      await this.editorGroupsService.applyWorkingSet(this._preProjectionWorkingSet);
      this.logService.trace("[AgentSessionProjection] exitProjection applied pre-projection working set", {
        visible: this.editorService.visibleEditors.length,
        id: this._preProjectionWorkingSet.id
      });
      this.editorGroupsService.deleteWorkingSet(this._preProjectionWorkingSet);
      this._preProjectionWorkingSet = void 0;
    } else {
      await this.editorGroupsService.applyWorkingSet("empty", { preserveFocus: true });
      this.logService.trace("[AgentSessionProjection] exitProjection no pre-working set, applied empty");
    }
    this._isActive = false;
    this._activeSession = void 0;
    this._inProjectionModeContextKey.set(false);
    const shouldRestoreMaximized = this._wasAuxiliaryBarMaximized;
    this._wasAuxiliaryBarMaximized = false;
    this.layoutService.mainContainer.classList.remove("agent-session-projection-active");
    this.agentTitleBarStatusService.exitSessionMode();
    this._onDidChangeProjectionMode.fire(false);
    this._onDidChangeActiveSession.fire(void 0);
    if (startNewChat) {
      await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
    }
    if (shouldRestoreMaximized) {
      this.logService.trace("[AgentSessionProjection] restoring auxiliary bar maximized state");
      this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
      await this.commandService.executeCommand("workbench.action.maximizeAuxiliaryBar");
    }
    this.logService.trace("[AgentSessionProjection] exitProjection complete");
    this._isExiting = false;
  }
};
AgentSessionProjectionService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IEditorGroupsService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IChatSessionsService),
  __decorateParam(7, IWorkbenchLayoutService),
  __decorateParam(8, ICommandService),
  __decorateParam(9, IChatEditingService),
  __decorateParam(10, IAgentTitleBarStatusService),
  __decorateParam(11, IAgentSessionsService)
], AgentSessionProjectionService);
export {
  AGENT_SESSION_PROJECTION_ENABLED_PROVIDERS,
  AgentSessionProjectionService,
  IAgentSessionProjectionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGV4cGVyaW1lbnRzXFxhZ2VudFNlc3Npb25Qcm9qZWN0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9hZ2VudHNlc3Npb25wcm9qZWN0aW9uLmNzcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JXb3JraW5nU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBNT0RBTF9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbiwgaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cyB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblByb3ZpZGVycyB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFDVElPTl9JRF9ORVdfQ0hBVCB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UgfSBmcm9tICcuL2FnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGluQWdlbnRTZXNzaW9uUHJvamVjdGlvbiB9IGZyb20gJy4vYWdlbnRTZXNzaW9uUHJvamVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuXG4vLyNyZWdpb24gQ29uZmlndXJhdGlvblxuXG4vKipcbiAqIFByb3ZpZGVyIHR5cGVzIHRoYXQgc3VwcG9ydCBhZ2VudCBzZXNzaW9uIHByb2plY3Rpb24gbW9kZS5cbiAqIE9ubHkgc2Vzc2lvbnMgZnJvbSB0aGVzZSBwcm92aWRlcnMgd2lsbCB0cmlnZ2VyIHByb2plY3Rpb24gbW9kZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEFHRU5UX1NFU1NJT05fUFJPSkVDVElPTl9FTkFCTEVEX1BST1ZJREVSUzogU2V0PHN0cmluZz4gPSBuZXcgU2V0KE9iamVjdC52YWx1ZXMoQWdlbnRTZXNzaW9uUHJvdmlkZXJzKSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gQWdlbnQgU2Vzc2lvbiBQcm9qZWN0aW9uIFNlcnZpY2UgSW50ZXJmYWNlXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2Vzc2lvblByb2plY3Rpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHByb2plY3Rpb24gbW9kZSBpcyBhY3RpdmUuXG5cdCAqL1xuXHRyZWFkb25seSBpc0FjdGl2ZTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVGhlIGN1cnJlbnRseSBhY3RpdmUgc2Vzc2lvbiBpbiBwcm9qZWN0aW9uIG1vZGUsIGlmIGFueS5cblx0ICovXG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb246IElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEV2ZW50IGZpcmVkIHdoZW4gcHJvamVjdGlvbiBtb2RlIGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb2plY3Rpb25Nb2RlOiBFdmVudDxib29sZWFuPjtcblxuXHQvKipcblx0ICogRXZlbnQgZmlyZWQgd2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gY2hhbmdlcyAoaW5jbHVkaW5nIHdoZW4gc3dpdGNoaW5nIGJldHdlZW4gc2Vzc2lvbnMpLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVTZXNzaW9uOiBFdmVudDxJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogRW50ZXIgcHJvamVjdGlvbiBtb2RlIGZvciB0aGUgZ2l2ZW4gc2Vzc2lvbi5cblx0ICovXG5cdGVudGVyUHJvamVjdGlvbihzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogRXhpdCBwcm9qZWN0aW9uIG1vZGUuXG5cdCAqIEBwYXJhbSBvcHRpb25zLnN0YXJ0TmV3Q2hhdCBJZiB0cnVlIChkZWZhdWx0KSwgc3RhcnRzIGEgbmV3IGNoYXQgYWZ0ZXIgZXhpdGluZy4gU2V0IHRvIGZhbHNlIHRvIGtlZXAgdGhlIGN1cnJlbnQgY2hhdCBvcGVuLlxuXHQgKi9cblx0ZXhpdFByb2plY3Rpb24ob3B0aW9ucz86IHsgc3RhcnROZXdDaGF0PzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGNvbnN0IElBZ2VudFNlc3Npb25Qcm9qZWN0aW9uU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQWdlbnRTZXNzaW9uUHJvamVjdGlvblNlcnZpY2U+KCdhZ2VudFNlc3Npb25Qcm9qZWN0aW9uU2VydmljZScpO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEFnZW50IFNlc3Npb24gUHJvamVjdGlvbiBTZXJ2aWNlIEltcGxlbWVudGF0aW9uXG5cbmV4cG9ydCBjbGFzcyBBZ2VudFNlc3Npb25Qcm9qZWN0aW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRTZXNzaW9uUHJvamVjdGlvblNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2lzQWN0aXZlID0gZmFsc2U7XG5cdGdldCBpc0FjdGl2ZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzQWN0aXZlOyB9XG5cblx0LyoqIFByZXZlbnRzIHJlLWVudHJhbnQgZXhpdHMgYW5kIGVudGVyLW9uLWV4aXQgcmFjZXMgKi9cblx0cHJpdmF0ZSBfaXNFeGl0aW5nID0gZmFsc2U7XG5cblx0LyoqIFByZXZlbnRzIGNoZWNrRm9yRW1wdHlFZGl0b3JzIGZyb20gZXhpdGluZyBkdXJpbmcgc2Vzc2lvbiBzd2FwcyAqL1xuXHRwcml2YXRlIF9pc1N3YXBwaW5nU2Vzc2lvbnMgPSBmYWxzZTtcblxuXHRwcml2YXRlIF9hY3RpdmVTZXNzaW9uOiBJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRnZXQgYWN0aXZlU2Vzc2lvbigpOiBJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZVNlc3Npb247IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb2plY3Rpb25Nb2RlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvamVjdGlvbk1vZGUgPSB0aGlzLl9vbkRpZENoYW5nZVByb2plY3Rpb25Nb2RlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZVNlc3Npb24gPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5Qcm9qZWN0aW9uTW9kZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdC8qKiBXb3JraW5nIHNldCBzYXZlZCB3aGVuIGVudGVyaW5nIHByb2plY3Rpb24gbW9kZSAodG8gcmVzdG9yZSBvbiBleGl0KSAqL1xuXHRwcml2YXRlIF9wcmVQcm9qZWN0aW9uV29ya2luZ1NldDogSUVkaXRvcldvcmtpbmdTZXQgfCB1bmRlZmluZWQ7XG5cblx0LyoqIFdvcmtpbmcgc2V0cyBwZXIgc2Vzc2lvbiwga2V5ZWQgYnkgc2Vzc2lvbiByZXNvdXJjZSBVUkkgc3RyaW5nICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Xb3JraW5nU2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBJRWRpdG9yV29ya2luZ1NldD4oKTtcblxuXHQvKiogV2hldGhlciB0aGUgYXV4aWxpYXJ5IGJhciB3YXMgbWF4aW1pemVkIHdoZW4gZW50ZXJpbmcgcHJvamVjdGlvbiBtb2RlICovXG5cdHByaXZhdGUgX3dhc0F1eGlsaWFyeUJhck1heGltaXplZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNoYXRFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFZGl0aW5nU2VydmljZTogSUNoYXRFZGl0aW5nU2VydmljZSxcblx0XHRASUFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2U6IElBZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2luUHJvamVjdGlvbk1vZGVDb250ZXh0S2V5ID0gaW5BZ2VudFNlc3Npb25Qcm9qZWN0aW9uLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGVkaXRvciBjbG9zZSBldmVudHMgdG8gZXhpdCBwcm9qZWN0aW9uIG1vZGUgd2hlbiBhbGwgZWRpdG9ycyBhcmUgY2xvc2VkXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQ2xvc2VFZGl0b3IoKCkgPT4gdGhpcy5fY2hlY2tGb3JFbXB0eUVkaXRvcnMoKSkpO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBzZXNzaW9uIGNoYW5nZXMgdG8gZXhpdCBwcm9qZWN0aW9uIG1vZGUgaWYgYWN0aXZlIHNlc3Npb24gYmVjb21lcyBpbiBwcm9ncmVzc1xuXHRcdC8vIE5vdGU6IG9uRGlkQ2hhbmdlU2Vzc2lvbnMgZmlyZXMgZm9yIGFueSBzZXNzaW9uIGNoYW5nZSwgYnV0IF9jaGVja0ZvckluUHJvZ3Jlc3NTZXNzaW9uKClcblx0XHQvLyBoYXMgZWFybHkgZXhpdCBndWFyZHMgYW5kIG9ubHkgY2hlY2tzIHdoZW4gcHJvamVjdGlvbiBtb2RlIGlzIGFjdGl2ZSwgbWFraW5nIHRoaXMgZWZmaWNpZW50XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHRoaXMuX2NoZWNrRm9ySW5Qcm9ncmVzc1Nlc3Npb24oKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkFnZW50U2Vzc2lvblByb2plY3Rpb25FbmFibGVkKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrRm9yRW1wdHlFZGl0b3JzKCk6IHZvaWQge1xuXHRcdC8vIE9ubHkgY2hlY2sgaWYgd2UncmUgaW4gcHJvamVjdGlvbiBtb2RlIGFuZCBub3Qgc3dhcHBpbmcgc2Vzc2lvbnNcblx0XHRpZiAoIXRoaXMuX2lzQWN0aXZlIHx8IHRoaXMuX2lzRXhpdGluZyB8fCB0aGlzLl9pc1N3YXBwaW5nU2Vzc2lvbnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGVyZSBhcmUgYW55IHZpc2libGUgZWRpdG9yc1xuXHRcdGNvbnN0IGhhc1Zpc2libGVFZGl0b3JzID0gdGhpcy5lZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JzLmxlbmd0aCA+IDA7XG5cblx0XHRpZiAoIWhhc1Zpc2libGVFZGl0b3JzKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBBbGwgZWRpdG9ycyBjbG9zZWQsIGV4aXRpbmcgcHJvamVjdGlvbiBtb2RlJyk7XG5cdFx0XHR0aGlzLmV4aXRQcm9qZWN0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2hlY2tGb3JJblByb2dyZXNzU2Vzc2lvbigpOiB2b2lkIHtcblx0XHQvLyBPbmx5IGNoZWNrIGlmIHdlJ3JlIGluIHByb2plY3Rpb24gbW9kZVxuXHRcdGlmICghdGhpcy5faXNBY3RpdmUgfHwgIXRoaXMuX2FjdGl2ZVNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIHVwZGF0ZWQgc2Vzc2lvbiBmcm9tIHRoZSBtb2RlbFxuXHRcdGNvbnN0IHVwZGF0ZWRTZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKHRoaXMuX2FjdGl2ZVNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGlmICghdXBkYXRlZFNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgc2Vzc2lvbiBpcyBub3cgaW4gcHJvZ3Jlc3MsIGV4aXQgcHJvamVjdGlvbiBtb2RlXG5cdFx0aWYgKGlzU2Vzc2lvbkluUHJvZ3Jlc3NTdGF0dXModXBkYXRlZFNlc3Npb24uc3RhdHVzKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gQWN0aXZlIHNlc3Npb24gdHJhbnNpdGlvbmVkIHRvIGluLXByb2dyZXNzLCBleGl0aW5nIHByb2plY3Rpb24gbW9kZScpO1xuXHRcdFx0dGhpcy5leGl0UHJvamVjdGlvbih7IHN0YXJ0TmV3Q2hhdDogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE9wZW5zIGEgc2Vzc2lvbiBpbiB0aGUgY2hhdCBwYW5lbCB3aXRob3V0IGVudGVyaW5nIHByb2plY3Rpb24gbW9kZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX29wZW5TZXNzaW9uSW5DaGF0UGFuZWwoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHNlc3Npb24uc2V0UmVhZCh0cnVlKTtcblx0XHRhd2FpdCB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuYWN0aXZhdGVDaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlcihzZXNzaW9uLnByb3ZpZGVyVHlwZSk7XG5cdFx0YXdhaXQgdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vcGVuU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlLCB1bmRlZmluZWQsIHtcblx0XHRcdHRpdGxlOiB7IHByZWZlcnJlZDogc2Vzc2lvbi5sYWJlbCB9LFxuXHRcdFx0cmV2ZWFsSWZPcGVuZWQ6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVuIHRoZSBzZXNzaW9uJ3MgZmlsZXMgaW4gYSBtdWx0aS1kaWZmIGVkaXRvci5cblx0ICogQHJldHVybnMgdHJ1ZSBpZiBhbnkgZmlsZXMgd2VyZSBvcGVuZWQsIGZhbHNlIGlmIG5vdGhpbmcgdG8gZGlzcGxheVxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfb3BlblNlc3Npb25GaWxlcyhzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gT3BlbmluZyBmaWxlcyBmb3Igc2Vzc2lvbiAnJHtzZXNzaW9uLmxhYmVsfSdgLCB7XG5cdFx0XHRoYXNDaGFuZ2VzOiAhIXNlc3Npb24uY2hhbmdlcyxcblx0XHRcdGlzQXJyYXk6IEFycmF5LmlzQXJyYXkoc2Vzc2lvbi5jaGFuZ2VzKSxcblx0XHRcdGNoYW5nZUNvdW50OiBBcnJheS5pc0FycmF5KHNlc3Npb24uY2hhbmdlcykgPyBzZXNzaW9uLmNoYW5nZXMubGVuZ3RoIDogMFxuXHRcdH0pO1xuXG5cdFx0Ly8gT3BlbiBjaGFuZ2VzIGZyb20gdGhlIHNlc3Npb24gYXMgYSBtdWx0aS1kaWZmIGVkaXRvciAobGlrZSBlZGl0IHNlc3Npb24gdmlldylcblx0XHRpZiAoc2Vzc2lvbi5jaGFuZ2VzICYmIEFycmF5LmlzQXJyYXkoc2Vzc2lvbi5jaGFuZ2VzKSAmJiBzZXNzaW9uLmNoYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gRmlsdGVyIHRvIGNoYW5nZXMgdGhhdCBoYXZlIGJvdGggb3JpZ2luYWwgYW5kIG1vZGlmaWVkIFVSSXMgZm9yIGRpZmYgdmlld1xuXHRcdFx0Y29uc3QgZGlmZlJlc291cmNlcyA9IHNlc3Npb24uY2hhbmdlc1xuXHRcdFx0XHQuZmlsdGVyKGNoYW5nZSA9PiBjaGFuZ2Uub3JpZ2luYWxVcmkpXG5cdFx0XHRcdC5tYXAoY2hhbmdlID0+ICh7XG5cdFx0XHRcdFx0b3JpZ2luYWxVcmk6IGNoYW5nZS5vcmlnaW5hbFVyaSEsXG5cdFx0XHRcdFx0bW9kaWZpZWRVcmk6IGNoYW5nZS5tb2RpZmllZFVyaVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIEZvdW5kICR7ZGlmZlJlc291cmNlcy5sZW5ndGh9IGZpbGVzIHdpdGggZGlmZnMgdG8gZGlzcGxheWApO1xuXG5cdFx0XHRpZiAoZGlmZlJlc291cmNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdC8vIE9wZW4gbXVsdGktZGlmZiBlZGl0b3Igc2hvd2luZyBhbGwgY2hhbmdlcyBpbiBhIG1vZGFsIGVkaXRvclxuXHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0bXVsdGlEaWZmU291cmNlOiBzZXNzaW9uLnJlc291cmNlLndpdGgoeyBzY2hlbWU6IHNlc3Npb24ucmVzb3VyY2Uuc2NoZW1lICsgJy1hZ2VudC1zZXNzaW9uLXByb2plY3Rpb24nIH0pLFxuXHRcdFx0XHRcdHJlc291cmNlczogZGlmZlJlc291cmNlcy5tYXAoZHIgPT4gKHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBkci5vcmlnaW5hbFVyaSB9LFxuXHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IGRyLm1vZGlmaWVkVXJpIH1cblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25Qcm9qZWN0aW9uLmNoYW5nZXMudGl0bGUnLCAnezB9IC0gQWxsIENoYW5nZXMnLCBzZXNzaW9uLmxhYmVsKSxcblx0XHRcdFx0fSwgTU9EQUxfR1JPVVApO1xuXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIE11bHRpLWRpZmYgZWRpdG9yIG9wZW5lZCBzdWNjZXNzZnVsbHkgaW4gbW9kYWwgdmlld2ApO1xuXG5cdFx0XHRcdC8vIFNhdmUgdGhpcyBhcyB0aGUgc2Vzc2lvbidzIHdvcmtpbmcgc2V0XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IG5ld1dvcmtpbmdTZXQgPSB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2Uuc2F2ZVdvcmtpbmdTZXQoYGFnZW50LXNlc3Npb24tcHJvamVjdGlvbi0ke3Nlc3Npb25LZXl9YCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25Xb3JraW5nU2V0cy5zZXQoc2Vzc2lvbktleSwgbmV3V29ya2luZ1NldCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gTm8gZmlsZXMgd2l0aCBkaWZmcyB0byBkaXNwbGF5IChhbGwgY2hhbmdlcyBtaXNzaW5nIG9yaWdpbmFsVXJpKWApO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIFNlc3Npb24gaGFzIG5vIGNoYW5nZXMgdG8gZGlzcGxheWApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGVudGVyUHJvamVjdGlvbihzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGZlYXR1cmUgaXMgZW5hYmxlZFxuXHRcdGlmICghdGhpcy5faXNFbmFibGVkKCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIEFnZW50IFNlc3Npb24gUHJvamVjdGlvbiBpcyBkaXNhYmxlZCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoaXMgc2Vzc2lvbidzIHByb3ZpZGVyIHR5cGUgc3VwcG9ydHMgYWdlbnQgc2Vzc2lvbiBwcm9qZWN0aW9uXG5cdFx0aWYgKCFBR0VOVF9TRVNTSU9OX1BST0pFQ1RJT05fRU5BQkxFRF9QUk9WSURFUlMuaGFzKHNlc3Npb24ucHJvdmlkZXJUeXBlKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gUHJvdmlkZXIgdHlwZSAnJHtzZXNzaW9uLnByb3ZpZGVyVHlwZX0nIGRvZXMgbm90IHN1cHBvcnQgYWdlbnQgc2Vzc2lvbiBwcm9qZWN0aW9uYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZWN0IGlmIGF1eGlsaWFyeSBiYXIgaXMgbWF4aW1pemVkIGJlZm9yZSBhbnkgbGF5b3V0IGNoYW5nZXNcblx0XHRjb25zdCBpc0F1eEJhck1heGltaXplZCA9IHRoaXMubGF5b3V0U2VydmljZS5pc0F1eGlsaWFyeUJhck1heGltaXplZCgpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIGVudGVyUHJvamVjdGlvbiBhdXhpbGlhcnkgYmFyIHN0YXRlJywge1xuXHRcdFx0aXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQ6IGlzQXV4QmFyTWF4aW1pemVkXG5cdFx0fSk7XG5cblx0XHQvLyBOZXZlciBlbnRlciBwcm9qZWN0aW9uIG1vZGUgZm9yIHNlc3Npb25zIHRoYXQgYXJlIGluIHByb2dyZXNzXG5cdFx0Ly8gVGhlIHVzZXIgc2hvdWxkIG9ubHkgYmUgaW4gcHJvamVjdGlvbiBtb2RlIHdoZW4gcmV2aWV3aW5nIGNvbXBsZXRlZCBjb2RlXG5cdFx0aWYgKGlzU2Vzc2lvbkluUHJvZ3Jlc3NTdGF0dXMoc2Vzc2lvbi5zdGF0dXMpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBTZXNzaW9uIGlzIGluIHByb2dyZXNzLCBvcGVuaW5nIGNoYXQgd2l0aG91dCBwcm9qZWN0aW9uIG1vZGUnKTtcblx0XHRcdC8vIElmIHdlJ3JlIGFscmVhZHkgaW4gcHJvamVjdGlvbiBtb2RlIGFuZCBzd2l0Y2hpbmcgdG8gYW4gaW4tcHJvZ3Jlc3Mgc2Vzc2lvbiwgZXhpdCBwcm9qZWN0aW9uXG5cdFx0XHRpZiAodGhpcy5faXNBY3RpdmUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leGl0UHJvamVjdGlvbih7IHN0YXJ0TmV3Q2hhdDogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9vcGVuU2Vzc2lvbkluQ2hhdFBhbmVsKHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZvciBsb2NhbCBzZXNzaW9ucywgY2hlY2sgaWYgdGhlcmUgYXJlIHBlbmRpbmcgZWRpdHMgdG8gc2hvd1xuXHRcdC8vIElmIHRoZXJlJ3Mgbm90aGluZyB0byBmb2N1cywganVzdCBvcGVuIHRoZSBjaGF0IHdpdGhvdXQgZW50ZXJpbmcgcHJvamVjdGlvbiBtb2RlXG5cdFx0bGV0IGhhc1VuZGVjaWRlZENoYW5nZXMgPSB0cnVlO1xuXHRcdGxldCBlZGl0aW5nU2Vzc2lvbkV4aXN0cyA9IHRydWU7XG5cdFx0aWYgKHNlc3Npb24ucHJvdmlkZXJUeXBlID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwpIHtcblx0XHRcdGNvbnN0IGVkaXRpbmdTZXNzaW9uID0gdGhpcy5jaGF0RWRpdGluZ1NlcnZpY2UuZ2V0RWRpdGluZ1Nlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRlZGl0aW5nU2Vzc2lvbkV4aXN0cyA9ICEhZWRpdGluZ1Nlc3Npb247XG5cdFx0XHRpZiAoZWRpdGluZ1Nlc3Npb24pIHtcblx0XHRcdFx0aGFzVW5kZWNpZGVkQ2hhbmdlcyA9IGVkaXRpbmdTZXNzaW9uLmVudHJpZXMuZ2V0KCkuc29tZShlID0+IGUuc3RhdGUuZ2V0KCkgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpO1xuXHRcdFx0XHRpZiAoIWhhc1VuZGVjaWRlZENoYW5nZXMpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBMb2NhbCBzZXNzaW9uIGhhcyBubyB1bmRlY2lkZWQgY2hhbmdlcywgb3BlbmluZyBjaGF0IHdpdGhvdXQgcHJvamVjdGlvbiBtb2RlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEVkaXRpbmcgc2Vzc2lvbiBkb2Vzbid0IGV4aXN0IHlldCAtIHRyZWF0IGFzIG5vIGNoYW5nZXMgZm9yIG5vd1xuXHRcdFx0XHRoYXNVbmRlY2lkZWRDaGFuZ2VzID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIExvY2FsIHNlc3Npb24gaGFzIG5vIGVkaXRpbmcgc2Vzc2lvbiB5ZXQnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBubyB1bmRlY2lkZWQgY2hhbmdlcyBhbmQgd2UncmUgYWxyZWFkeSBpbiBwcm9qZWN0aW9uIG1vZGUsIGV4aXQgcHJvamVjdGlvblxuXHRcdC8vIEJ1dCBvbmx5IGlmIHdlIGFjdHVhbGx5IGNoZWNrZWQgdGhlIGVkaXRpbmcgc2Vzc2lvbiAoaXQgZXhpc3RzKSAtIGlmIGl0J3MgdW5kZWZpbmVkLFxuXHRcdC8vIGl0IG1pZ2h0IGp1c3Qgbm90IGJlIGxvYWRlZCB5ZXQsIHNvIGRvbid0IGV4aXQgcHJvamVjdGlvbiBpbiB0aGF0IGNhc2Vcblx0XHRpZiAoIWhhc1VuZGVjaWRlZENoYW5nZXMgJiYgdGhpcy5faXNBY3RpdmUgJiYgZWRpdGluZ1Nlc3Npb25FeGlzdHMpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIFN3aXRjaGluZyB0byBzZXNzaW9uIHdpdGhvdXQgY2hhbmdlcyB3aGlsZSBpbiBwcm9qZWN0aW9uIG1vZGUsIGV4aXRpbmcgcHJvamVjdGlvbicpO1xuXHRcdFx0YXdhaXQgdGhpcy5leGl0UHJvamVjdGlvbih7IHN0YXJ0TmV3Q2hhdDogZmFsc2UgfSk7XG5cdFx0XHRhd2FpdCB0aGlzLl9vcGVuU2Vzc2lvbkluQ2hhdFBhbmVsKHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlJ3JlIHN3aXRjaGluZyB0byBhIHNlc3Npb24gd2l0aG91dCBhbiBlZGl0aW5nIHNlc3Npb24geWV0IHdoaWxlIGluIHByb2plY3Rpb24sXG5cdFx0Ly8ganVzdCBvcGVuIHRoZSBjaGF0IHBhbmVsIGJ1dCBzdGF5IGluIHByb2plY3Rpb24gbW9kZSAobGV0IHRoZSBlZGl0aW5nIHNlc3Npb24gbG9hZClcblx0XHRpZiAoIWhhc1VuZGVjaWRlZENoYW5nZXMgJiYgdGhpcy5faXNBY3RpdmUgJiYgIWVkaXRpbmdTZXNzaW9uRXhpc3RzKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBTd2l0Y2hpbmcgdG8gc2Vzc2lvbiB3aXRob3V0IGVkaXRpbmcgc2Vzc2lvbiB3aGlsZSBpbiBwcm9qZWN0aW9uIG1vZGUsIHN0YXlpbmcgaW4gcHJvamVjdGlvbicpO1xuXHRcdFx0YXdhaXQgdGhpcy5fb3BlblNlc3Npb25JbkNoYXRQYW5lbChzZXNzaW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPbmx5IGVudGVyIHByb2plY3Rpb24gbW9kZSBpZiB0aGVyZSBhcmUgY2hhbmdlcyB0byBzaG93XG5cdFx0aWYgKGhhc1VuZGVjaWRlZENoYW5nZXMpIHtcblx0XHRcdC8vIENhcHR1cmUgdGhlIHVzZXIncyB3b3JraW5nIHNldCBpbW1lZGlhdGVseSAoYmVmb3JlIGFueSBlZGl0b3JzIGFyZSBjbGVhcmVkKVxuXHRcdFx0aWYgKCF0aGlzLl9pc0FjdGl2ZSAmJiAhdGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQpIHtcblx0XHRcdFx0Y29uc3QgdmlzaWJsZUVkaXRvcnNCZWZvcmUgPSB0aGlzLmVkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvcnMubGVuZ3RoO1xuXHRcdFx0XHR0aGlzLl9wcmVQcm9qZWN0aW9uV29ya2luZ1NldCA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5zYXZlV29ya2luZ1NldCgnYWdlbnQtc2Vzc2lvbi1wcm9qZWN0aW9uLWJhY2t1cCcpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBzYXZlZCBwcmUtcHJvamVjdGlvbiB3b3JraW5nIHNldCcsIHtcblx0XHRcdFx0XHRpZDogdGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQuaWQsXG5cdFx0XHRcdFx0dmlzaWJsZUVkaXRvcnNCZWZvcmVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNldCBzd2FwcGluZyBmbGFnIHRvIHByZXZlbnQgY2hlY2tGb3JFbXB0eUVkaXRvcnMgZnJvbSBleGl0aW5nIGR1cmluZyBzZXNzaW9uIHN3YXBcblx0XHRcdGNvbnN0IGlzU3dhcHBpbmcgPSB0aGlzLl9pc0FjdGl2ZSAmJiB0aGlzLl9hY3RpdmVTZXNzaW9uO1xuXHRcdFx0aWYgKGlzU3dhcHBpbmcpIHtcblx0XHRcdFx0dGhpcy5faXNTd2FwcGluZ1Nlc3Npb25zID0gdHJ1ZTtcblx0XHRcdFx0Ly8gQWxyZWFkeSBpbiBwcm9qZWN0aW9uIG1vZGUsIHN3aXRjaGluZyBzZXNzaW9ucyAtIHNhdmUgdGhlIGN1cnJlbnQgc2Vzc2lvbidzIHdvcmtpbmcgc2V0XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzU2Vzc2lvbktleSA9IHRoaXMuX2FjdGl2ZVNlc3Npb24hLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzV29ya2luZ1NldCA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5zYXZlV29ya2luZ1NldChgYWdlbnQtc2Vzc2lvbi1wcm9qZWN0aW9uLSR7cHJldmlvdXNTZXNzaW9uS2V5fWApO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uV29ya2luZ1NldHMuc2V0KHByZXZpb3VzU2Vzc2lvbktleSwgcHJldmlvdXNXb3JraW5nU2V0KTtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gRm9yIGxvY2FsIHNlc3Npb25zLCBjaGFuZ2VzIGFyZSBzaG93biB2aWEgY2hhdEVkaXRpbmcudmlld0NoYW5nZXMsIG5vdCBfb3BlblNlc3Npb25GaWxlc1xuXHRcdFx0XHQvLyBGb3Igb3RoZXIgcHJvdmlkZXJzLCB0cnkgdG8gb3BlbiBzZXNzaW9uIGZpbGVzIGZyb20gc2Vzc2lvbi5jaGFuZ2VzXG5cdFx0XHRcdGxldCBmaWxlc09wZW5lZCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAoc2Vzc2lvbi5wcm92aWRlclR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCkge1xuXHRcdFx0XHRcdC8vIExvY2FsIHNlc3Npb25zIHVzZSBlZGl0aW5nIHNlc3Npb24gZm9yIGNoYW5nZXMgLSB3ZSBhbHJlYWR5IHZlcmlmaWVkIGhhc1VuZGVjaWRlZENoYW5nZXMgYWJvdmVcblx0XHRcdFx0XHRmaWxlc09wZW5lZCA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gVHJ5IHRvIG9wZW4gc2Vzc2lvbiBmaWxlcyAtIG9ubHkgY29udGludWUgd2l0aCBwcm9qZWN0aW9uIGlmIGZpbGVzIHdlcmUgZGlzcGxheWVkXG5cdFx0XHRcdFx0ZmlsZXNPcGVuZWQgPSBhd2FpdCB0aGlzLl9vcGVuU2Vzc2lvbkZpbGVzKHNlc3Npb24pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFmaWxlc09wZW5lZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIE5vIGZpbGVzIHRvIGRpc3BsYXksIG9wZW5pbmcgY2hhdCB3aXRob3V0IHByb2plY3Rpb24gbW9kZScpO1xuXHRcdFx0XHRcdC8vIFJlc3RvcmUgdGhlIHdvcmtpbmcgc2V0IHdlIGp1c3Qgc2F2ZWQgaWYgdGhpcyB3YXMgb3VyIGZpcnN0IGF0dGVtcHRcblx0XHRcdFx0XHRpZiAoIXRoaXMuX2lzQWN0aXZlICYmIHRoaXMuX3ByZVByb2plY3Rpb25Xb3JraW5nU2V0KSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuYXBwbHlXb3JraW5nU2V0KHRoaXMuX3ByZVByb2plY3Rpb25Xb3JraW5nU2V0KTtcblx0XHRcdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5kZWxldGVXb3JraW5nU2V0KHRoaXMuX3ByZVByb2plY3Rpb25Xb3JraW5nU2V0KTtcblx0XHRcdFx0XHRcdHRoaXMuX3ByZVByb2plY3Rpb25Xb3JraW5nU2V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBGYWxsIHRocm91Z2ggdG8ganVzdCBvcGVuIHRoZSBjaGF0IHBhbmVsXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gU2V0IGFjdGl2ZSBzdGF0ZVxuXHRcdFx0XHRcdGNvbnN0IHdhc0FjdGl2ZSA9IHRoaXMuX2lzQWN0aXZlO1xuXHRcdFx0XHRcdHRoaXMuX2lzQWN0aXZlID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVTZXNzaW9uID0gc2Vzc2lvbjtcblx0XHRcdFx0XHR0aGlzLl9pblByb2plY3Rpb25Nb2RlQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWdlbnQtc2Vzc2lvbi1wcm9qZWN0aW9uLWFjdGl2ZScpO1xuXG5cdFx0XHRcdFx0Ly8gQ2FwdHVyZSBhdXhpbGlhcnkgYmFyIG1heGltaXplZCBzdGF0ZSB3aGVuIGZpcnN0IGVudGVyaW5nIHByb2plY3Rpb25cblx0XHRcdFx0XHRpZiAoIXdhc0FjdGl2ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fd2FzQXV4aWxpYXJ5QmFyTWF4aW1pemVkID0gaXNBdXhCYXJNYXhpbWl6ZWQ7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBjYXB0dXJlZCBhdXhpbGlhcnkgYmFyIG1heGltaXplZCBzdGF0ZScsIHtcblx0XHRcdFx0XHRcdFx0d2FzQXV4aWxpYXJ5QmFyTWF4aW1pemVkOiB0aGlzLl93YXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWRcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFVwZGF0ZSB0aGUgYWdlbnQgc3RhdHVzIHRvIHNob3cgc2Vzc2lvbiBtb2RlXG5cdFx0XHRcdFx0dGhpcy5hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZS5lbnRlclNlc3Npb25Nb2RlKHNlc3Npb24ucmVzb3VyY2UsIHNlc3Npb24ubGFiZWwpO1xuXG5cdFx0XHRcdFx0aWYgKCF3YXNBY3RpdmUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvamVjdGlvbk1vZGUuZmlyZSh0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gQWx3YXlzIGZpcmUgc2Vzc2lvbiBjaGFuZ2UgZXZlbnQgKGZvciB0aXRsZSB1cGRhdGVzIHdoZW4gc3dpdGNoaW5nIHNlc3Npb25zKVxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlU2Vzc2lvbi5maXJlKHNlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHQvLyBDbGVhciBzd2FwcGluZyBmbGFnXG5cdFx0XHRcdHRoaXMuX2lzU3dhcHBpbmdTZXNzaW9ucyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE9wZW4gdGhlIHNlc3Npb24gaW4gdGhlIGNoYXQgcGFuZWwgKGFsd2F5cywgZXZlbiB3aXRob3V0IGNoYW5nZXMpXG5cdFx0YXdhaXQgdGhpcy5fb3BlblNlc3Npb25JbkNoYXRQYW5lbChzZXNzaW9uKTtcblxuXHRcdC8vIEZvciBsb2NhbCBzZXNzaW9ucyB3aXRoIGNoYW5nZXMsIGFsc28gcG9wIG9wZW4gdGhlIGVkaXQgc2Vzc2lvbidzIGNoYW5nZXMgdmlld1xuXHRcdC8vIE11c3QgYmUgYWZ0ZXIgb3BlblNlc3Npb24gc28gdGhlIGVkaXRpbmcgc2Vzc2lvbiBjb250ZXh0IGlzIGF2YWlsYWJsZVxuXHRcdGlmIChzZXNzaW9uLnByb3ZpZGVyVHlwZSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsICYmIGhhc1VuZGVjaWRlZENoYW5nZXMpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2NoYXRFZGl0aW5nLnZpZXdDaGFuZ2VzJyk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgYXV4aWxpYXJ5IGJhciB3YXMgbWF4aW1pemVkLCBoaWRlIGl0IGR1cmluZyBwcm9qZWN0aW9uIHRvIHNob3cgZnVsbCBlZGl0b3Jcblx0XHQvLyBUaGlzIG11c3QgYmUgZG9uZSBhZnRlciBvcGVuaW5nIHRoZSBzZXNzaW9uIHRvIGF2b2lkIHRoZSBzZXNzaW9uIG9wZW5pbmcgcmUtc2hvd2luZyB0aGUgYmFyXG5cdFx0aWYgKHRoaXMuX3dhc0F1eGlsaWFyeUJhck1heGltaXplZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gaGlkaW5nIG1heGltaXplZCBhdXhpbGlhcnkgYmFyIGR1cmluZyBwcm9qZWN0aW9uJyk7XG5cdFx0XHR0aGlzLmxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZXhpdFByb2plY3Rpb24ob3B0aW9ucz86IHsgc3RhcnROZXdDaGF0PzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9pc0FjdGl2ZSB8fCB0aGlzLl9pc0V4aXRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydE5ld0NoYXQgPSBvcHRpb25zPy5zdGFydE5ld0NoYXQgPz8gdHJ1ZTtcblx0XHR0aGlzLl9pc0V4aXRpbmcgPSB0cnVlO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIGV4aXRQcm9qZWN0aW9uIHN0YXJ0Jywge1xuXHRcdFx0aGFzUHJlUHJvamVjdGlvbldvcmtpbmdTZXQ6ICEhdGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQsXG5cdFx0XHRhY3RpdmVTZXNzaW9uOiB0aGlzLl9hY3RpdmVTZXNzaW9uPy5sYWJlbCxcblx0XHRcdHN0YXJ0TmV3Q2hhdCxcblx0XHRcdHdhc0F1eGlsaWFyeUJhck1heGltaXplZDogdGhpcy5fd2FzQXV4aWxpYXJ5QmFyTWF4aW1pemVkXG5cdFx0fSk7XG5cblx0XHQvLyBTYXZlIHRoZSBjdXJyZW50IHNlc3Npb24ncyB3b3JraW5nIHNldCBiZWZvcmUgZXhpdGluZ1xuXHRcdGlmICh0aGlzLl9hY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uS2V5ID0gdGhpcy5fYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgd29ya2luZ1NldCA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5zYXZlV29ya2luZ1NldChgYWdlbnQtc2Vzc2lvbi1wcm9qZWN0aW9uLSR7c2Vzc2lvbktleX1gKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25Xb3JraW5nU2V0cy5zZXQoc2Vzc2lvbktleSwgd29ya2luZ1NldCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2UgcHJvamVjdGlvbiBlZGl0b3JzIChtdWx0aS1kaWZmLCBldGMuKSBzbyB0aGUgcmVzdG9yZWQgc2V0IGlzIGNsZWFuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuZ3JvdXBzKSB7XG5cdFx0XHRhd2FpdCBncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gZXhpdFByb2plY3Rpb24gY2xvc2VkIGVkaXRvcnMnLCB7IHZpc2libGU6IHRoaXMuZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9ycy5sZW5ndGggfSk7XG5cblx0XHQvLyBSZXN0b3JlIHRoZSBwcmUtcHJvamVjdGlvbiB3b3JraW5nIHNldCAob3JpZ2luYWwgdGFicylcblx0XHRpZiAodGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQpIHtcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5hcHBseVdvcmtpbmdTZXQodGhpcy5fcHJlUHJvamVjdGlvbldvcmtpbmdTZXQpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQWdlbnRTZXNzaW9uUHJvamVjdGlvbl0gZXhpdFByb2plY3Rpb24gYXBwbGllZCBwcmUtcHJvamVjdGlvbiB3b3JraW5nIHNldCcsIHtcblx0XHRcdFx0dmlzaWJsZTogdGhpcy5lZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JzLmxlbmd0aCxcblx0XHRcdFx0aWQ6IHRoaXMuX3ByZVByb2plY3Rpb25Xb3JraW5nU2V0LmlkXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5kZWxldGVXb3JraW5nU2V0KHRoaXMuX3ByZVByb2plY3Rpb25Xb3JraW5nU2V0KTtcblx0XHRcdHRoaXMuX3ByZVByb2plY3Rpb25Xb3JraW5nU2V0ID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuYXBwbHlXb3JraW5nU2V0KCdlbXB0eScsIHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9KTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIGV4aXRQcm9qZWN0aW9uIG5vIHByZS13b3JraW5nIHNldCwgYXBwbGllZCBlbXB0eScpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzQWN0aXZlID0gZmFsc2U7XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9pblByb2plY3Rpb25Nb2RlQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdGNvbnN0IHNob3VsZFJlc3RvcmVNYXhpbWl6ZWQgPSB0aGlzLl93YXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQ7XG5cdFx0dGhpcy5fd2FzQXV4aWxpYXJ5QmFyTWF4aW1pemVkID0gZmFsc2U7XG5cdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnYWdlbnQtc2Vzc2lvbi1wcm9qZWN0aW9uLWFjdGl2ZScpO1xuXG5cdFx0Ly8gVXBkYXRlIHRoZSBhZ2VudCBzdGF0dXMgdG8gZXhpdCBzZXNzaW9uIG1vZGVcblx0XHR0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLmV4aXRTZXNzaW9uTW9kZSgpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9qZWN0aW9uTW9kZS5maXJlKGZhbHNlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVNlc3Npb24uZmlyZSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gU3RhcnQgYSBuZXcgY2hhdCB0byBjbGVhciB0aGUgc2lkZWJhciAodW5sZXNzIGNhbGxlciB3YW50cyB0byBrZWVwIGN1cnJlbnQgY2hhdClcblx0XHRpZiAoc3RhcnROZXdDaGF0KSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFDVElPTl9JRF9ORVdfQ0hBVCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzdG9yZSBhdXhpbGlhcnkgYmFyIG1heGltaXplZCBzdGF0ZSBpZiBpdCB3YXMgbWF4aW1pemVkIGJlZm9yZSBlbnRlcmluZyBwcm9qZWN0aW9uXG5cdFx0aWYgKHNob3VsZFJlc3RvcmVNYXhpbWl6ZWQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW0FnZW50U2Vzc2lvblByb2plY3Rpb25dIHJlc3RvcmluZyBhdXhpbGlhcnkgYmFyIG1heGltaXplZCBzdGF0ZScpO1xuXHRcdFx0Ly8gRmlyc3Qgc2hvdyB0aGUgYXV4aWxpYXJ5IGJhciwgdGhlbiBtYXhpbWl6ZSBpdFxuXHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ubWF4aW1pemVBdXhpbGlhcnlCYXInKTtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlc3Npb25Qcm9qZWN0aW9uXSBleGl0UHJvamVjdGlvbiBjb21wbGV0ZScpO1xuXHRcdHRoaXMuX2lzRXhpdGluZyA9IGZhbHNlO1xuXHR9XG59XG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQStDO0FBQ3hELFNBQVMsZ0JBQWdCLG1CQUFtQjtBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUF3QixpQ0FBaUM7QUFDekQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUIsYUFBYTtBQUMvQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQiw4QkFBOEI7QUFDNUQsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFRL0IsTUFBTSw2Q0FBMEQsSUFBSSxJQUFJLE9BQU8sT0FBTyxxQkFBcUIsQ0FBQztBQXlDNUcsTUFBTSxpQ0FBaUMsZ0JBQWdELCtCQUErQjtBQU10SCxJQUFNLGdDQUFOLGNBQTRDLFdBQXFEO0FBQUEsRUFpQ3ZHLFlBQ3FCLG1CQUNv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
