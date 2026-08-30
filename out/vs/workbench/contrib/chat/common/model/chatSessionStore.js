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
import { Sequencer } from "../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { revive } from "../../../../../base/common/marshalling.js";
import { isEqual, joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../../../../platform/files/common/files.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IUserDataProfilesService } from "../../../../../platform/userDataProfile/common/userDataProfile.js";
import { isEmptyWorkspaceIdentifier, IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IWorkspaceEditingService } from "../../../../services/workspaces/common/workspaceEditing.js";
import { awaitStatsForSession } from "../chat.js";
import { ResponseModelState } from "../chatService/chatService.js";
import { ModifiedFileEntryState } from "../editing/chatEditingService.js";
import { ChatModel, normalizeSerializableChatData } from "./chatModel.js";
import { ChatSessionOperationLog } from "./chatSessionOperationLog.js";
import { getChatSessionStorageResource, LocalChatSessionUri } from "./chatUri.js";
import { stringifyEntryWithFallback } from "./objectMutationLog.js";
const maxPersistedSessions = 400;
const ChatIndexStorageKey = "chat.ChatSessionStore.index";
const ChatTransferIndexStorageKey = "ChatSessionStore.transferIndex";
let ChatSessionStore = class extends Disposable {
  constructor(fileService, environmentService, logService, workspaceContextService, telemetryService, storageService, lifecycleService, userDataProfilesService, configurationService, workspaceEditingService, dialogService, openerService) {
    super();
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.logService = logService;
    this.workspaceContextService = workspaceContextService;
    this.telemetryService = telemetryService;
    this.storageService = storageService;
    this.lifecycleService = lifecycleService;
    this.userDataProfilesService = userDataProfilesService;
    this.configurationService = configurationService;
    this.workspaceEditingService = workspaceEditingService;
    this.dialogService = dialogService;
    this.openerService = openerService;
    this.storeQueue = new Sequencer();
    this.shuttingDown = false;
    this._didReportIssue = false;
    const workspace = this.workspaceContextService.getWorkspace();
    const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
    const workspaceId = this.workspaceContextService.getWorkspace().id;
    this.storageRoot = isEmptyWindow ? joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, "emptyWindowChatSessions") : joinPath(this.environmentService.workspaceStorageHome, workspaceId, "chatSessions");
    this.previousEmptyWindowStorageRoot = isEmptyWindow ? joinPath(this.environmentService.workspaceStorageHome, "no-workspace", "chatSessions") : void 0;
    this.transferredSessionStorageRoot = joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, "transferredChatSessions");
    this._register(this.workspaceEditingService.onDidEnterWorkspace((event) => {
      const transitionPromise = this.storeQueue.queue(() => this.handleWorkspaceTransition(event.oldWorkspace, event.newWorkspace));
      event.join(transitionPromise);
    }));
    this._register(this.lifecycleService.onWillShutdown((e) => {
      this.shuttingDown = true;
      if (!this.storeTask) {
        return;
      }
      e.join(this.storeTask, {
        id: "join.chatSessionStore",
        label: localize("join.chatSessionStore", "Saving chat history")
      });
    }));
  }
  async handleWorkspaceTransition(oldWorkspace, newWorkspace) {
    const wasEmptyWindow = isEmptyWorkspaceIdentifier(oldWorkspace);
    const isNewWorkspaceEmpty = isEmptyWorkspaceIdentifier(newWorkspace);
    const oldWorkspaceId = oldWorkspace.id;
    const newWorkspaceId = newWorkspace.id;
    this.logService.info(`ChatSessionStore: Workspace transition from ${oldWorkspaceId} to ${newWorkspaceId}`);
    const oldStorageRoot = wasEmptyWindow ? joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, "emptyWindowChatSessions") : joinPath(this.environmentService.workspaceStorageHome, oldWorkspaceId, "chatSessions");
    const newStorageRoot = isNewWorkspaceEmpty ? joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, "emptyWindowChatSessions") : joinPath(this.environmentService.workspaceStorageHome, newWorkspaceId, "chatSessions");
    if (isEqual(oldStorageRoot, newStorageRoot)) {
      this.storageRoot = newStorageRoot;
      return;
    }
    this.storageRoot = newStorageRoot;
    await this.migrateSessionsToNewWorkspace(oldStorageRoot, wasEmptyWindow, isNewWorkspaceEmpty);
  }
  async migrateSessionsToNewWorkspace(oldStorageRoot, wasEmptyWindow, isNewWorkspaceEmpty) {
    try {
      const oldStorageExists = await this.fileService.exists(oldStorageRoot);
      if (!oldStorageExists) {
        this.logService.info(`ChatSessionStore: Old storage location does not exist, skipping migration`);
        return;
      }
      const oldDirectory = await this.fileService.resolve(oldStorageRoot);
      if (!oldDirectory.children) {
        this.logService.info(`ChatSessionStore: No children in old storage location, skipping migration`);
        return;
      }
      this.logService.info(`ChatSessionStore: Found ${oldDirectory.children.length} files in old storage location`);
      let migratedCount = 0;
      for (const child of oldDirectory.children) {
        if (!child.isDirectory && (child.name.endsWith(".json") || child.name.endsWith(".jsonl"))) {
          const oldFilePath = child.resource;
          const newFilePath = joinPath(this.storageRoot, child.name);
          try {
            await this.fileService.copy(oldFilePath, newFilePath, false);
            migratedCount++;
          } catch (e) {
            if (toFileOperationResult(e) === FileOperationResult.FILE_MOVE_CONFLICT) {
              this.logService.trace(`ChatSessionStore: Session file ${child.name} already exists at target, skipping`);
            } else {
              this.reportError("sessionMigration", `Error migrating chat session file ${child.name}`, e);
            }
          }
        }
      }
      this.logService.info(`ChatSessionStore: Copied ${migratedCount} chat session files from ${wasEmptyWindow ? "empty window" : oldStorageRoot.toString()} to ${isNewWorkspaceEmpty ? "empty window" : this.storageRoot.toString()} (originals preserved at old location)`);
      this.indexCache = void 0;
      try {
        await this.flushIndex();
      } catch (e) {
        this.reportError("migrateWorkspace", "Error flushing chat session index after workspace migration", e);
      }
    } catch (e) {
      this.reportError("migrateWorkspace", "Error migrating chat sessions to new workspace", e);
    }
  }
  async storeSessions(sessions) {
    if (this.shuttingDown) {
      return;
    }
    try {
      this.storeTask = this.storeQueue.queue(async () => {
        try {
          await Promise.all(sessions.map((session) => this.writeSession(session)));
          await this.trimEntries();
          await this.flushIndex();
        } catch (e) {
          this.reportError("storeSessions", "Error storing chat sessions", e);
        }
      });
      await this.storeTask;
    } finally {
      this.storeTask = void 0;
    }
  }
  async storeSessionsMetadataOnly(sessions) {
    if (this.shuttingDown) {
      return;
    }
    try {
      this.storeTask = this.storeQueue.queue(async () => {
        try {
          await Promise.all(sessions.map((session) => this.writeSessionMetadataOnly(session)));
          await this.flushIndex();
        } catch (e) {
          this.reportError("storeSessions", "Error storing chat sessions", e);
        }
      });
      await this.storeTask;
    } finally {
      this.storeTask = void 0;
    }
  }
  async storeTransferSession(transferData, session) {
    const index = this.getTransferredSessionIndex();
    const workspaceKey = transferData.toWorkspace.toString();
    const existingTransfer = index[workspaceKey];
    if (existingTransfer) {
      try {
        const existingSessionResource = URI.revive(existingTransfer.sessionResource);
        if (existingSessionResource && LocalChatSessionUri.parseLocalSessionId(existingSessionResource)) {
          const existingStorageLocation = this.getTransferredSessionStorageLocation(existingSessionResource);
          await this.fileService.del(existingStorageLocation);
        }
      } catch (e) {
        if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
          this.reportError("storeTransferSession", "Error deleting old transferred session file", e);
        }
      }
    }
    try {
      const content = stringifyEntryWithFallback(session);
      const storageLocation = this.getTransferredSessionStorageLocation(session.sessionResource);
      await this.fileService.writeFile(storageLocation, VSBuffer.fromString(content));
    } catch (e) {
      this.reportError("sessionWrite", "Error writing chat session", e);
      return;
    }
    index[workspaceKey] = transferData;
    try {
      this.storageService.store(ChatTransferIndexStorageKey, index, StorageScope.PROFILE, StorageTarget.MACHINE);
    } catch (e) {
      this.reportError("storeTransferSession", "Error storing chat transfer session", e);
    }
  }
  getTransferredSessionIndex() {
    try {
      const data = this.storageService.getObject(ChatTransferIndexStorageKey, StorageScope.PROFILE, {});
      return data;
    } catch (e) {
      this.reportError("getTransferredSessionIndex", "Error reading chat transfer index", e);
      return {};
    }
  }
  getTransferredSessionData() {
    try {
      const index = this.getTransferredSessionIndex();
      const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
      if (workspaceFolders.length !== 1) {
        return void 0;
      }
      const workspaceKey = workspaceFolders[0].uri.toString();
      const transferredSessionForWorkspace = index[workspaceKey];
      if (!transferredSessionForWorkspace) {
        return void 0;
      }
      const revivedTransferData = revive(transferredSessionForWorkspace);
      if (Date.now() - transferredSessionForWorkspace.timestampInMilliseconds > ChatSessionStore.TRANSFER_EXPIRATION_MS) {
        this.logService.info("ChatSessionStore: Transferred session has expired");
        this.cleanupTransferredSession(revivedTransferData.sessionResource);
        return void 0;
      }
      return !!LocalChatSessionUri.parseLocalSessionId(revivedTransferData.sessionResource) && revivedTransferData.sessionResource;
    } catch (e) {
      this.reportError("getTransferredSession", "Error getting transferred chat session URI", e);
      return void 0;
    }
  }
  async readTransferredSession(sessionResource) {
    try {
      const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
      const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
      if (!sessionId) {
        return void 0;
      }
      const sessionData = await this.readSessionFromLocation(storageLocation, void 0, sessionId);
      await this.cleanupTransferredSession(sessionResource);
      return sessionData;
    } catch (e) {
      this.reportError("getTransferredSession", "Error getting transferred chat session", e);
      return void 0;
    }
  }
  async cleanupTransferredSession(sessionResource) {
    try {
      const index = this.getTransferredSessionIndex();
      const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
      if (workspaceFolders.length === 1) {
        const workspaceKey = workspaceFolders[0].uri.toString();
        delete index[workspaceKey];
        this.storageService.store(ChatTransferIndexStorageKey, index, StorageScope.PROFILE, StorageTarget.MACHINE);
      }
      const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
      await this.fileService.del(storageLocation);
    } catch (e) {
      if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
        this.reportError("cleanupTransferredSession", "Error cleaning up transferred session", e);
      }
    }
  }
  async writeSession(session) {
    try {
      const index = this.internalGetIndex();
      const storageLocation = this.getStorageLocation(session.sessionId);
      if (storageLocation.log) {
        if (session instanceof ChatModel) {
          if (!session.dataSerializer) {
            session.dataSerializer = new ChatSessionOperationLog();
          }
          let op;
          let data;
          try {
            ({ op, data } = session.dataSerializer.write(session));
          } catch (e) {
            if (!this._didReportIssue) {
              this._didReportIssue = true;
              this.dialogService.prompt({
                custom: true,
                // so text is copyable
                title: localize("chatSessionStore.serializationError", "Error saving chat session"),
                message: localize("chatSessionStore.writeError", "Error serializing chat session for storage. The session will be lost if the window is closed. Please report this issue to the VS Code team:\n\n{0}", e.stack || toErrorMessage(e)),
                buttons: [
                  { label: localize("reportIssue", "Report Issue"), run: () => this.openerService.open("https://github.com/microsoft/vscode/issues/new?template=bug_report.md") }
                ]
              });
            }
            throw e;
          }
          if (data.byteLength > 0) {
            await this.fileService.writeFile(storageLocation.log, data, { append: op === "append" });
          }
          session.dataSerializer.confirmWrite();
        } else {
          const content = new ChatSessionOperationLog().createInitialFromSerialized(session);
          await this.fileService.writeFile(storageLocation.log, content);
        }
      } else {
        await this.fileService.writeFile(storageLocation.flat, VSBuffer.fromString(stringifyEntryWithFallback(session)));
      }
      const newMetadata = await getSessionMetadata(session);
      index.entries[session.sessionId] = newMetadata;
    } catch (e) {
      this.reportError("sessionWrite", "Error writing chat session", e);
    }
  }
  async writeSessionMetadataOnly(session) {
    if (LocalChatSessionUri.parseLocalSessionId(session.sessionResource)) {
      return;
    }
    try {
      const index = this.internalGetIndex();
      const externalSessionId = session.sessionResource.toString();
      index.entries[externalSessionId] = await getSessionMetadata(session);
    } catch (e) {
      this.reportError("sessionMetadataWrite", "Error writing chat session metadata", e);
    }
  }
  async flushIndex() {
    const index = this.internalGetIndex();
    try {
      this.storageService.store(ChatIndexStorageKey, index, this.getIndexStorageScope(), StorageTarget.MACHINE);
    } catch (e) {
      this.reportError("indexWrite", "Error writing index", e);
    }
  }
  getIndexStorageScope() {
    const workspace = this.workspaceContextService.getWorkspace();
    const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
    return isEmptyWindow ? StorageScope.APPLICATION : StorageScope.WORKSPACE;
  }
  async trimEntries() {
    const index = this.internalGetIndex();
    const entries = Object.entries(index.entries).filter(([_id, entry]) => !entry.isExternal).sort((a, b) => b[1].lastMessageDate - a[1].lastMessageDate).map(([id]) => id);
    if (entries.length > maxPersistedSessions) {
      const entriesToDelete = entries.slice(maxPersistedSessions);
      for (const entry of entriesToDelete) {
        delete index.entries[entry];
      }
      this.logService.trace(`ChatSessionStore: Trimmed ${entriesToDelete.length} old chat sessions from index`);
    }
  }
  async internalDeleteSession(sessionId) {
    const index = this.internalGetIndex();
    if (!index.entries[sessionId]) {
      return;
    }
    let storageLocation;
    try {
      storageLocation = this.getStorageLocation(sessionId);
    } catch (e) {
      this.reportError("invalidSessionId", `Removing invalid chat session from index: ${sessionId}`, e);
      delete index.entries[sessionId];
      return;
    }
    for (const uri of [storageLocation.flat, storageLocation.log]) {
      try {
        if (uri) {
          await this.fileService.del(uri);
        }
      } catch (e) {
        if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
          this.reportError("sessionDelete", "Error deleting chat session", e);
        }
      }
      delete index.entries[sessionId];
    }
  }
  hasSessions() {
    return Object.keys(this.internalGetIndex().entries).length > 0;
  }
  isSessionEmpty(sessionId) {
    const index = this.internalGetIndex();
    return index.entries[sessionId]?.isEmpty ?? true;
  }
  async deleteSession(sessionId) {
    await this.storeQueue.queue(async () => {
      await this.internalDeleteSession(sessionId);
      await this.flushIndex();
    });
  }
  async clearAllSessions() {
    await this.storeQueue.queue(async () => {
      const index = this.internalGetIndex();
      const entries = Object.keys(index.entries);
      this.logService.info(`ChatSessionStore: Clearing ${entries.length} chat sessions`);
      await Promise.all(entries.map((entry) => this.internalDeleteSession(entry)));
      await this.flushIndex();
    });
  }
  async setSessionTitle(sessionId, title) {
    await this.storeQueue.queue(async () => {
      const index = this.internalGetIndex();
      if (index.entries[sessionId]) {
        index.entries[sessionId].title = title;
      }
    });
  }
  reportError(reasonForTelemetry, message, error) {
    const fileOperationReason = error && toFileOperationResult(error);
    if (fileOperationReason === FileOperationResult.FILE_NOT_FOUND) {
      this.logService.trace(`ChatSessionStore: ` + message, toErrorMessage(error));
    } else {
      this.logService.error(`ChatSessionStore: ` + message, toErrorMessage(error));
    }
    this.telemetryService.publicLog2("chatSessionStoreError", {
      reason: reasonForTelemetry,
      fileOperationReason: fileOperationReason ?? -1
    });
  }
  internalGetIndex() {
    if (this.indexCache) {
      return this.indexCache;
    }
    const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), void 0);
    if (!data) {
      this.indexCache = { version: 1, entries: {} };
      return this.indexCache;
    }
    try {
      const index = JSON.parse(data);
      if (isChatSessionIndex(index)) {
        this.indexCache = index;
      } else {
        this.reportError("invalidIndexFormat", `Invalid index format: ${data}`);
        this.indexCache = { version: 1, entries: {} };
      }
    } catch (e) {
      this.reportError("invalidIndexJSON", `Index corrupt: ${data}`, e);
      this.indexCache = { version: 1, entries: {} };
    }
    for (const entry of Object.values(this.indexCache.entries)) {
      entry.timing ??= {
        created: entry.lastMessageDate,
        lastRequestStarted: void 0,
        lastRequestEnded: entry.lastMessageDate
      };
      entry.lastResponseState ??= entry.lastResponseState === ResponseModelState.Pending || entry.lastResponseState === ResponseModelState.NeedsInput ? ResponseModelState.Complete : entry.lastResponseState || ResponseModelState.Complete;
    }
    return this.indexCache;
  }
  async getIndex() {
    return this.storeQueue.queue(async () => {
      return this.internalGetIndex().entries;
    });
  }
  getMetadataForSessionSync(sessionResource) {
    const index = this.internalGetIndex();
    return index.entries[this.getIndexKey(sessionResource)];
  }
  getIndexKey(sessionResource) {
    const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    return sessionId ?? sessionResource.toString();
  }
  logIndex() {
    const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), void 0);
    this.logService.info("ChatSessionStore index: ", data);
  }
  async migrateDataIfNeeded(getInitialData) {
    await this.storeQueue.queue(async () => {
      const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), void 0);
      const needsMigrationFromStorageService = !data;
      if (needsMigrationFromStorageService) {
        const initialData = getInitialData();
        if (initialData) {
          await this.migrate(initialData);
        }
      }
    });
  }
  async migrate(initialData) {
    const numSessions = Object.keys(initialData).length;
    this.logService.info(`ChatSessionStore: Migrating ${numSessions} chat sessions from storage service to file system`);
    await Promise.all(Object.values(initialData).map(async (session) => {
      await this.writeSession(session);
    }));
    await this.flushIndex();
  }
  async readSession(sessionId) {
    return await this.storeQueue.queue(async () => {
      let storageLocation;
      try {
        storageLocation = this.getStorageLocation(sessionId);
      } catch (e) {
        this.reportError("invalidSessionId", `Ignoring invalid chat session from index: ${sessionId}`, e);
        const index = this.internalGetIndex();
        if (index.entries[sessionId]) {
          delete index.entries[sessionId];
          await this.flushIndex();
        }
        return void 0;
      }
      return this.readSessionFromLocation(storageLocation.flat, storageLocation.log, sessionId);
    });
  }
  async readSessionFromLocation(flatStorageLocation, logStorageLocation, sessionId) {
    let fromLocation = flatStorageLocation;
    let rawData;
    if (logStorageLocation) {
      try {
        rawData = (await this.fileService.readFile(logStorageLocation)).value;
        fromLocation = logStorageLocation;
      } catch (e) {
        this.reportError("sessionReadFile", `Error reading log chat session file ${sessionId}`, e);
      }
    }
    if (!rawData) {
      try {
        rawData = (await this.fileService.readFile(flatStorageLocation)).value;
        fromLocation = flatStorageLocation;
      } catch (e) {
        this.reportError("sessionReadFile", `Error reading flat chat session file ${sessionId}`, e);
        if (toFileOperationResult(e) === FileOperationResult.FILE_NOT_FOUND && this.previousEmptyWindowStorageRoot) {
          rawData = await this.readSessionFromPreviousLocation(sessionId);
        }
      }
    }
    if (!rawData) {
      return void 0;
    }
    try {
      let session;
      const log = new ChatSessionOperationLog();
      if (fromLocation === logStorageLocation) {
        session = revive(log.read(rawData));
      } else {
        session = revive(JSON.parse(rawData.toString()));
      }
      for (const request of session.requests) {
        if (Array.isArray(request.response)) {
          request.response = request.response.map((response) => {
            if (typeof response === "string") {
              return new MarkdownString(response);
            }
            return response;
          });
        } else if (typeof request.response === "string") {
          request.response = [new MarkdownString(request.response)];
        }
      }
      return { value: normalizeSerializableChatData(session), serializer: log };
    } catch (err) {
      this.reportError("malformedSession", `Malformed session data in ${fromLocation.fsPath}: [${rawData.slice(0, 20).toString()}${rawData.byteLength > 20 ? "..." : ""}]`, err);
      return void 0;
    }
  }
  async readSessionFromPreviousLocation(sessionId) {
    let rawData;
    if (this.previousEmptyWindowStorageRoot) {
      const storageLocation2 = getChatSessionStorageResource(this.previousEmptyWindowStorageRoot, sessionId, ".json");
      try {
        rawData = (await this.fileService.readFile(storageLocation2)).value;
        this.logService.info(`ChatSessionStore: Read chat session ${sessionId} from previous location`);
      } catch (e) {
        this.reportError("sessionReadFile", `Error reading chat session file ${sessionId} from previous location`, e);
        return void 0;
      }
    }
    return rawData;
  }
  getStorageLocation(chatSessionId) {
    return {
      flat: getChatSessionStorageResource(this.storageRoot, chatSessionId, ".json"),
      // todo@connor4312: remove after stabilizing
      log: this.configurationService.getValue("chat.useLogSessionStorage") !== false ? getChatSessionStorageResource(this.storageRoot, chatSessionId, ".jsonl") : void 0
    };
  }
  getTransferredSessionStorageLocation(sessionResource) {
    const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    if (!sessionId) {
      throw new Error(`Invalid local chat session resource: ${sessionResource.toString()}`);
    }
    return getChatSessionStorageResource(this.transferredSessionStorageRoot, sessionId, ".json");
  }
  /**
   * Synchronously update the in-memory index entries for the given sessions
   * and flush the index to storage. This ensures the index is persisted
   * even when called from a synchronous `onWillSaveState` handler where
   * async file-write work would complete after the storage service has
   * already flushed.
   */
  updateAndFlushIndexSync(localSessions, externalSessions) {
    const index = this.internalGetIndex();
    for (const session of localSessions) {
      index.entries[session.sessionId] = getSessionMetadataSync(session);
    }
    for (const session of externalSessions) {
      const externalSessionId = session.sessionResource.toString();
      index.entries[externalSessionId] = getSessionMetadataSync(session);
    }
    try {
      this.storageService.store(ChatIndexStorageKey, index, this.getIndexStorageScope(), StorageTarget.MACHINE);
    } catch (e) {
      this.reportError("indexWrite", "Error writing index synchronously", e);
    }
  }
  getChatStorageFolder() {
    return this.storageRoot;
  }
};
ChatSessionStore.TRANSFER_EXPIRATION_MS = 60 * 1e3 * 5;
ChatSessionStore = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ILifecycleService),
  __decorateParam(7, IUserDataProfilesService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IWorkspaceEditingService),
  __decorateParam(10, IDialogService),
  __decorateParam(11, IOpenerService)
], ChatSessionStore);
function isChatSessionEntryMetadata(obj) {
  return !!obj && typeof obj === "object" && typeof obj.sessionId === "string" && typeof obj.title === "string" && typeof obj.lastMessageDate === "number";
}
function isChatSessionIndex(data) {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const index = data;
  if (index.version !== 1) {
    return false;
  }
  if (typeof index.entries !== "object" || index.entries === null) {
    return false;
  }
  for (const key in index.entries) {
    if (!isChatSessionEntryMetadata(index.entries[key])) {
      return false;
    }
  }
  return true;
}
function getSessionMetadataSync(session) {
  const title = session.customTitle || session.title;
  let lastResponseState = session.lastRequest?.response?.state ?? ResponseModelState.Complete;
  if (lastResponseState === ResponseModelState.Pending || lastResponseState === ResponseModelState.NeedsInput) {
    lastResponseState = ResponseModelState.Cancelled;
  }
  const isExternal = !LocalChatSessionUri.parseLocalSessionId(session.sessionResource);
  const rawInputState = isExternal ? session.inputModel.toJSON() : void 0;
  const inputState = rawInputState ? { ...rawInputState, attachments: [] } : void 0;
  return {
    sessionId: session.sessionId,
    title: title || localize("newChat", "New Chat"),
    lastMessageDate: session.lastMessageDate,
    timing: session.timing,
    initialLocation: session.initialLocation,
    hasPendingEdits: session.editingSession?.entries.get().some((e) => e.state.get() === ModifiedFileEntryState.Modified) ?? false,
    isEmpty: session.getRequests().length === 0,
    isExternal,
    lastResponseState,
    permissionLevel: session.inputModel.state.get()?.permissionLevel,
    inputState,
    workingDirectory: session.workingDirectory?.toString()
  };
}
async function getSessionMetadata(session) {
  if (session instanceof ChatModel) {
    const metadata = getSessionMetadataSync(session);
    metadata.stats = await awaitStatsForSession(session);
    return metadata;
  }
  const lastMessageDate = session.requests.at(-1)?.timestamp ?? session.creationDate;
  return {
    sessionId: session.sessionId,
    title: session.customTitle || localize("newChat", "New Chat"),
    lastMessageDate,
    timing: {
      created: session.creationDate,
      lastRequestStarted: session.requests.at(-1)?.timestamp,
      lastRequestEnded: lastMessageDate
    },
    initialLocation: session.initialLocation,
    hasPendingEdits: false,
    isEmpty: session.requests.length === 0,
    isExternal: false,
    lastResponseState: ResponseModelState.Complete
  };
}
export {
  ChatSessionStore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcbW9kZWxcXGNoYXRTZXNzaW9uU3RvcmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZXF1ZW5jZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc0VtcHR5V29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRHRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBhd2FpdFN0YXRzRm9yU2Vzc2lvbiB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uU3RhdHMsIElDaGF0U2Vzc2lvblRpbWluZywgUmVzcG9uc2VNb2RlbFN0YXRlIH0gZnJvbSAnLi4vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCwgSVNlcmlhbGl6YWJsZUNoYXREYXRhLCBJU2VyaWFsaXphYmxlQ2hhdERhdGFJbiwgSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUsIElTZXJpYWxpemFibGVDaGF0c0RhdGEsIElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UsIG5vcm1hbGl6ZVNlcmlhbGl6YWJsZUNoYXREYXRhIH0gZnJvbSAnLi9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25PcGVyYXRpb25Mb2cgfSBmcm9tICcuL2NoYXRTZXNzaW9uT3BlcmF0aW9uTG9nLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uU3RvcmFnZVJlc291cmNlLCBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi9jaGF0VXJpLmpzJztcbmltcG9ydCB7IHN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrIH0gZnJvbSAnLi9vYmplY3RNdXRhdGlvbkxvZy5qcyc7XG5cbmNvbnN0IG1heFBlcnNpc3RlZFNlc3Npb25zID0gNDAwO1xuXG5jb25zdCBDaGF0SW5kZXhTdG9yYWdlS2V5ID0gJ2NoYXQuQ2hhdFNlc3Npb25TdG9yZS5pbmRleCc7XG5jb25zdCBDaGF0VHJhbnNmZXJJbmRleFN0b3JhZ2VLZXkgPSAnQ2hhdFNlc3Npb25TdG9yZS50cmFuc2ZlckluZGV4JztcblxuZXhwb3J0IGNsYXNzIENoYXRTZXNzaW9uU3RvcmUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdG9yYWdlUm9vdDogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZpb3VzRW1wdHlXaW5kb3dTdG9yYWdlUm9vdDogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyYW5zZmVycmVkU2Vzc2lvblN0b3JhZ2VSb290OiBVUkk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdG9yZVF1ZXVlID0gbmV3IFNlcXVlbmNlcigpO1xuXG5cdHByaXZhdGUgc3RvcmVUYXNrOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNodXR0aW5nRG93biA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZTogSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCBpc0VtcHR5V2luZG93ID0gIXdvcmtzcGFjZS5jb25maWd1cmF0aW9uICYmIHdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aCA9PT0gMDtcblx0XHRjb25zdCB3b3Jrc3BhY2VJZCA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuaWQ7XG5cdFx0dGhpcy5zdG9yYWdlUm9vdCA9IGlzRW1wdHlXaW5kb3cgP1xuXHRcdFx0am9pblBhdGgodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSwgJ2VtcHR5V2luZG93Q2hhdFNlc3Npb25zJykgOlxuXHRcdFx0am9pblBhdGgodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uud29ya3NwYWNlU3RvcmFnZUhvbWUsIHdvcmtzcGFjZUlkLCAnY2hhdFNlc3Npb25zJyk7XG5cblx0XHR0aGlzLnByZXZpb3VzRW1wdHlXaW5kb3dTdG9yYWdlUm9vdCA9IGlzRW1wdHlXaW5kb3cgP1xuXHRcdFx0am9pblBhdGgodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uud29ya3NwYWNlU3RvcmFnZUhvbWUsICduby13b3Jrc3BhY2UnLCAnY2hhdFNlc3Npb25zJykgOlxuXHRcdFx0dW5kZWZpbmVkO1xuXG5cdFx0dGhpcy50cmFuc2ZlcnJlZFNlc3Npb25TdG9yYWdlUm9vdCA9IGpvaW5QYXRoKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZ2xvYmFsU3RvcmFnZUhvbWUsICd0cmFuc2ZlcnJlZENoYXRTZXNzaW9ucycpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIHdvcmtzcGFjZSB0cmFuc2l0aW9ucyB0byBtaWdyYXRlIGNoYXQgc2Vzc2lvbnNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLm9uRGlkRW50ZXJXb3Jrc3BhY2UoZXZlbnQgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNpdGlvblByb21pc2UgPSB0aGlzLnN0b3JlUXVldWUucXVldWUoKCkgPT4gdGhpcy5oYW5kbGVXb3Jrc3BhY2VUcmFuc2l0aW9uKGV2ZW50Lm9sZFdvcmtzcGFjZSwgZXZlbnQubmV3V29ya3NwYWNlKSk7XG5cdFx0XHRldmVudC5qb2luKHRyYW5zaXRpb25Qcm9taXNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oZSA9PiB7XG5cdFx0XHR0aGlzLnNodXR0aW5nRG93biA9IHRydWU7XG5cdFx0XHRpZiAoIXRoaXMuc3RvcmVUYXNrKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZS5qb2luKHRoaXMuc3RvcmVUYXNrLCB7XG5cdFx0XHRcdGlkOiAnam9pbi5jaGF0U2Vzc2lvblN0b3JlJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdqb2luLmNoYXRTZXNzaW9uU3RvcmUnLCBcIlNhdmluZyBjaGF0IGhpc3RvcnlcIilcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlV29ya3NwYWNlVHJhbnNpdGlvbihvbGRXb3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLCBuZXdXb3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2FzRW1wdHlXaW5kb3cgPSBpc0VtcHR5V29ya3NwYWNlSWRlbnRpZmllcihvbGRXb3Jrc3BhY2UpO1xuXHRcdGNvbnN0IGlzTmV3V29ya3NwYWNlRW1wdHkgPSBpc0VtcHR5V29ya3NwYWNlSWRlbnRpZmllcihuZXdXb3Jrc3BhY2UpO1xuXHRcdGNvbnN0IG9sZFdvcmtzcGFjZUlkID0gb2xkV29ya3NwYWNlLmlkO1xuXHRcdGNvbnN0IG5ld1dvcmtzcGFjZUlkID0gbmV3V29ya3NwYWNlLmlkO1xuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYENoYXRTZXNzaW9uU3RvcmU6IFdvcmtzcGFjZSB0cmFuc2l0aW9uIGZyb20gJHtvbGRXb3Jrc3BhY2VJZH0gdG8gJHtuZXdXb3Jrc3BhY2VJZH1gKTtcblxuXHRcdC8vIERldGVybWluZSB0aGUgb2xkIHN0b3JhZ2UgbG9jYXRpb24gYmFzZWQgb24gdGhlIG9sZCB3b3Jrc3BhY2Vcblx0XHRjb25zdCBvbGRTdG9yYWdlUm9vdCA9IHdhc0VtcHR5V2luZG93ID9cblx0XHRcdGpvaW5QYXRoKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZ2xvYmFsU3RvcmFnZUhvbWUsICdlbXB0eVdpbmRvd0NoYXRTZXNzaW9ucycpIDpcblx0XHRcdGpvaW5QYXRoKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLndvcmtzcGFjZVN0b3JhZ2VIb21lLCBvbGRXb3Jrc3BhY2VJZCwgJ2NoYXRTZXNzaW9ucycpO1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIHRoZSBuZXcgc3RvcmFnZSBsb2NhdGlvbiBiYXNlZCBvbiB0aGUgbmV3IHdvcmtzcGFjZVxuXHRcdGNvbnN0IG5ld1N0b3JhZ2VSb290ID0gaXNOZXdXb3Jrc3BhY2VFbXB0eSA/XG5cdFx0XHRqb2luUGF0aCh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmdsb2JhbFN0b3JhZ2VIb21lLCAnZW1wdHlXaW5kb3dDaGF0U2Vzc2lvbnMnKSA6XG5cdFx0XHRqb2luUGF0aCh0aGlzLmVudmlyb25tZW50U2VydmljZS53b3Jrc3BhY2VTdG9yYWdlSG9tZSwgbmV3V29ya3NwYWNlSWQsICdjaGF0U2Vzc2lvbnMnKTtcblxuXHRcdC8vIElmIHRoZSBzdG9yYWdlIHJvb3RzIGFyZSBpZGVudGljYWwsIHRoZXJlIGlzIG5vdGhpbmcgdG8gbWlncmF0ZVxuXHRcdGlmIChpc0VxdWFsKG9sZFN0b3JhZ2VSb290LCBuZXdTdG9yYWdlUm9vdCkpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVJvb3QgPSBuZXdTdG9yYWdlUm9vdDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgc3RvcmFnZSByb290IGZvciB0aGUgbmV3IHdvcmtzcGFjZVxuXHRcdHRoaXMuc3RvcmFnZVJvb3QgPSBuZXdTdG9yYWdlUm9vdDtcblxuXHRcdC8vIE1pZ3JhdGUgc2Vzc2lvbiBmaWxlcyBmcm9tIG9sZCB0byBuZXcgbG9jYXRpb25cblx0XHRhd2FpdCB0aGlzLm1pZ3JhdGVTZXNzaW9uc1RvTmV3V29ya3NwYWNlKG9sZFN0b3JhZ2VSb290LCB3YXNFbXB0eVdpbmRvdywgaXNOZXdXb3Jrc3BhY2VFbXB0eSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1pZ3JhdGVTZXNzaW9uc1RvTmV3V29ya3NwYWNlKG9sZFN0b3JhZ2VSb290OiBVUkksIHdhc0VtcHR5V2luZG93OiBib29sZWFuLCBpc05ld1dvcmtzcGFjZUVtcHR5OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIENoZWNrIGlmIG9sZCBzdG9yYWdlIGxvY2F0aW9uIGV4aXN0c1xuXHRcdFx0Y29uc3Qgb2xkU3RvcmFnZUV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKG9sZFN0b3JhZ2VSb290KTtcblx0XHRcdGlmICghb2xkU3RvcmFnZUV4aXN0cykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hhdFNlc3Npb25TdG9yZTogT2xkIHN0b3JhZ2UgbG9jYXRpb24gZG9lcyBub3QgZXhpc3QsIHNraXBwaW5nIG1pZ3JhdGlvbmApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlYWQgYWxsIHNlc3Npb24gZmlsZXMgZnJvbSBvbGQgbG9jYXRpb25cblx0XHRcdGNvbnN0IG9sZERpcmVjdG9yeSA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShvbGRTdG9yYWdlUm9vdCk7XG5cdFx0XHRpZiAoIW9sZERpcmVjdG9yeS5jaGlsZHJlbikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hhdFNlc3Npb25TdG9yZTogTm8gY2hpbGRyZW4gaW4gb2xkIHN0b3JhZ2UgbG9jYXRpb24sIHNraXBwaW5nIG1pZ3JhdGlvbmApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBDaGF0U2Vzc2lvblN0b3JlOiBGb3VuZCAke29sZERpcmVjdG9yeS5jaGlsZHJlbi5sZW5ndGh9IGZpbGVzIGluIG9sZCBzdG9yYWdlIGxvY2F0aW9uYCk7XG5cblx0XHRcdC8vIENvcHkgZWFjaCBmaWxlIHRvIHRoZSBuZXcgbG9jYXRpb25cblx0XHRcdGxldCBtaWdyYXRlZENvdW50ID0gMDtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygb2xkRGlyZWN0b3J5LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGlmICghY2hpbGQuaXNEaXJlY3RvcnkgJiYgKGNoaWxkLm5hbWUuZW5kc1dpdGgoJy5qc29uJykgfHwgY2hpbGQubmFtZS5lbmRzV2l0aCgnLmpzb25sJykpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb2xkRmlsZVBhdGggPSBjaGlsZC5yZXNvdXJjZTtcblx0XHRcdFx0XHRjb25zdCBuZXdGaWxlUGF0aCA9IGpvaW5QYXRoKHRoaXMuc3RvcmFnZVJvb3QsIGNoaWxkLm5hbWUpO1xuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY29weShvbGRGaWxlUGF0aCwgbmV3RmlsZVBhdGgsIGZhbHNlKTtcblx0XHRcdFx0XHRcdG1pZ3JhdGVkQ291bnQrKztcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUpID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVCkge1xuXHRcdFx0XHRcdFx0XHQvLyBGaWxlIGFscmVhZHkgZXhpc3RzIGF0IHRhcmdldCAtIHNraXAgYXMgYSBuby1vcFxuXHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYENoYXRTZXNzaW9uU3RvcmU6IFNlc3Npb24gZmlsZSAke2NoaWxkLm5hbWV9IGFscmVhZHkgZXhpc3RzIGF0IHRhcmdldCwgc2tpcHBpbmdgKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ3Nlc3Npb25NaWdyYXRpb24nLCBgRXJyb3IgbWlncmF0aW5nIGNoYXQgc2Vzc2lvbiBmaWxlICR7Y2hpbGQubmFtZX1gLCBlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYENoYXRTZXNzaW9uU3RvcmU6IENvcGllZCAke21pZ3JhdGVkQ291bnR9IGNoYXQgc2Vzc2lvbiBmaWxlcyBmcm9tICR7d2FzRW1wdHlXaW5kb3cgPyAnZW1wdHkgd2luZG93JyA6IG9sZFN0b3JhZ2VSb290LnRvU3RyaW5nKCl9IHRvICR7aXNOZXdXb3Jrc3BhY2VFbXB0eSA/ICdlbXB0eSB3aW5kb3cnIDogdGhpcy5zdG9yYWdlUm9vdC50b1N0cmluZygpfSAob3JpZ2luYWxzIHByZXNlcnZlZCBhdCBvbGQgbG9jYXRpb24pYCk7XG5cblx0XHRcdC8vIENsZWFyIHRoZSBpbmRleCBjYWNoZSBhbmQgZmx1c2ggaXQgdG8gdGhlIG5ldyBzdG9yYWdlIHNjb3BlXG5cdFx0XHR0aGlzLmluZGV4Q2FjaGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZsdXNoSW5kZXgoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignbWlncmF0ZVdvcmtzcGFjZScsICdFcnJvciBmbHVzaGluZyBjaGF0IHNlc3Npb24gaW5kZXggYWZ0ZXIgd29ya3NwYWNlIG1pZ3JhdGlvbicsIGUpO1xuXHRcdFx0fVxuXG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5yZXBvcnRFcnJvcignbWlncmF0ZVdvcmtzcGFjZScsICdFcnJvciBtaWdyYXRpbmcgY2hhdCBzZXNzaW9ucyB0byBuZXcgd29ya3NwYWNlJywgZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3RvcmVTZXNzaW9ucyhzZXNzaW9uczogQ2hhdE1vZGVsW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zaHV0dGluZ0Rvd24pIHtcblx0XHRcdC8vIERvbid0IHN0YXJ0IHRoaXMgdGFzayBpZiB3ZSBtaXNzZWQgdGhlIGNoYW5jZSB0byBibG9jayBzaHV0ZG93blxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnN0b3JlVGFzayA9IHRoaXMuc3RvcmVRdWV1ZS5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gdGhpcy53cml0ZVNlc3Npb24oc2Vzc2lvbikpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnRyaW1FbnRyaWVzKCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5mbHVzaEluZGV4KCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdzdG9yZVNlc3Npb25zJywgJ0Vycm9yIHN0b3JpbmcgY2hhdCBzZXNzaW9ucycsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRoaXMuc3RvcmVUYXNrO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnN0b3JlVGFzayA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdG9yZVNlc3Npb25zTWV0YWRhdGFPbmx5KHNlc3Npb25zOiBDaGF0TW9kZWxbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnNodXR0aW5nRG93bikge1xuXHRcdFx0Ly8gRG9uJ3Qgc3RhcnQgdGhpcyB0YXNrIGlmIHdlIG1pc3NlZCB0aGUgY2hhbmNlIHRvIGJsb2NrIHNodXRkb3duXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuc3RvcmVUYXNrID0gdGhpcy5zdG9yZVF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChzZXNzaW9ucy5tYXAoc2Vzc2lvbiA9PiB0aGlzLndyaXRlU2Vzc2lvbk1ldGFkYXRhT25seShzZXNzaW9uKSkpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmx1c2hJbmRleCgpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignc3RvcmVTZXNzaW9ucycsICdFcnJvciBzdG9yaW5nIGNoYXQgc2Vzc2lvbnMnLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aGlzLnN0b3JlVGFzaztcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5zdG9yZVRhc2sgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3RvcmVUcmFuc2ZlclNlc3Npb24odHJhbnNmZXJEYXRhOiBJQ2hhdFRyYW5zZmVyLCBzZXNzaW9uOiBDaGF0TW9kZWwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uSW5kZXgoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VLZXkgPSB0cmFuc2ZlckRhdGEudG9Xb3Jrc3BhY2UudG9TdHJpbmcoKTtcblxuXHRcdC8vIENsZWFuIHVwIGFueSBwcmVleGlzdGluZyB0cmFuc2ZlcnJlZCBzZXNzaW9uIGZvciB0aGlzIHdvcmtzcGFjZVxuXHRcdGNvbnN0IGV4aXN0aW5nVHJhbnNmZXIgPSBpbmRleFt3b3Jrc3BhY2VLZXldO1xuXHRcdGlmIChleGlzdGluZ1RyYW5zZmVyKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZ1Nlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoZXhpc3RpbmdUcmFuc2Zlci5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmdTZXNzaW9uUmVzb3VyY2UgJiYgTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKGV4aXN0aW5nU2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nU3RvcmFnZUxvY2F0aW9uID0gdGhpcy5nZXRUcmFuc2ZlcnJlZFNlc3Npb25TdG9yYWdlTG9jYXRpb24oZXhpc3RpbmdTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGV4aXN0aW5nU3RvcmFnZUxvY2F0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignc3RvcmVUcmFuc2ZlclNlc3Npb24nLCAnRXJyb3IgZGVsZXRpbmcgb2xkIHRyYW5zZmVycmVkIHNlc3Npb24gZmlsZScsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBzdHJpbmdpZnlFbnRyeVdpdGhGYWxsYmFjayhzZXNzaW9uKTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VMb2NhdGlvbiA9IHRoaXMuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uU3RvcmFnZUxvY2F0aW9uKHNlc3Npb24uc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHN0b3JhZ2VMb2NhdGlvbiwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5yZXBvcnRFcnJvcignc2Vzc2lvbldyaXRlJywgJ0Vycm9yIHdyaXRpbmcgY2hhdCBzZXNzaW9uJywgZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aW5kZXhbd29ya3NwYWNlS2V5XSA9IHRyYW5zZmVyRGF0YTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0VHJhbnNmZXJJbmRleFN0b3JhZ2VLZXksIGluZGV4LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdzdG9yZVRyYW5zZmVyU2Vzc2lvbicsICdFcnJvciBzdG9yaW5nIGNoYXQgdHJhbnNmZXIgc2Vzc2lvbicsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VHJhbnNmZXJyZWRTZXNzaW9uSW5kZXgoKTogSUNoYXRUcmFuc2ZlckluZGV4IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YTogSUNoYXRUcmFuc2ZlckluZGV4ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3QoQ2hhdFRyYW5zZmVySW5kZXhTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwge30pO1xuXHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5yZXBvcnRFcnJvcignZ2V0VHJhbnNmZXJyZWRTZXNzaW9uSW5kZXgnLCAnRXJyb3IgcmVhZGluZyBjaGF0IHRyYW5zZmVyIGluZGV4JywgZSk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVFJBTlNGRVJfRVhQSVJBVElPTl9NUyA9IDYwICogMTAwMCAqIDU7XG5cblx0Z2V0VHJhbnNmZXJyZWRTZXNzaW9uRGF0YSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uSW5kZXgoKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRpZiAod29ya3NwYWNlRm9sZGVycy5sZW5ndGggIT09IDEpIHtcblx0XHRcdFx0Ly8gQ2FuIG9ubHkgdHJhbnNmZXIgc2Vzc2lvbnMgdG8gc2luZ2xlLWZvbGRlciB3b3Jrc3BhY2VzXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZUtleSA9IHdvcmtzcGFjZUZvbGRlcnNbMF0udXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCB0cmFuc2ZlcnJlZFNlc3Npb25Gb3JXb3Jrc3BhY2U6IElDaGF0VHJhbnNmZXJEdG8gPSBpbmRleFt3b3Jrc3BhY2VLZXldO1xuXHRcdFx0aWYgKCF0cmFuc2ZlcnJlZFNlc3Npb25Gb3JXb3Jrc3BhY2UpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIHRyYW5zZmVyIGhhcyBleHBpcmVkXG5cdFx0XHRjb25zdCByZXZpdmVkVHJhbnNmZXJEYXRhID0gcmV2aXZlKHRyYW5zZmVycmVkU2Vzc2lvbkZvcldvcmtzcGFjZSk7XG5cdFx0XHRpZiAoRGF0ZS5ub3coKSAtIHRyYW5zZmVycmVkU2Vzc2lvbkZvcldvcmtzcGFjZS50aW1lc3RhbXBJbk1pbGxpc2Vjb25kcyA+IENoYXRTZXNzaW9uU3RvcmUuVFJBTlNGRVJfRVhQSVJBVElPTl9NUykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnQ2hhdFNlc3Npb25TdG9yZTogVHJhbnNmZXJyZWQgc2Vzc2lvbiBoYXMgZXhwaXJlZCcpO1xuXHRcdFx0XHR0aGlzLmNsZWFudXBUcmFuc2ZlcnJlZFNlc3Npb24ocmV2aXZlZFRyYW5zZmVyRGF0YS5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICEhTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHJldml2ZWRUcmFuc2ZlckRhdGEuc2Vzc2lvblJlc291cmNlKSAmJiByZXZpdmVkVHJhbnNmZXJEYXRhLnNlc3Npb25SZXNvdXJjZTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdnZXRUcmFuc2ZlcnJlZFNlc3Npb24nLCAnRXJyb3IgZ2V0dGluZyB0cmFuc2ZlcnJlZCBjaGF0IHNlc3Npb24gVVJJJywgZSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlYWRUcmFuc2ZlcnJlZFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZUxvY2F0aW9uID0gdGhpcy5nZXRUcmFuc2ZlcnJlZFNlc3Npb25TdG9yYWdlTG9jYXRpb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFzZXNzaW9uSWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGEgPSBhd2FpdCB0aGlzLnJlYWRTZXNzaW9uRnJvbUxvY2F0aW9uKHN0b3JhZ2VMb2NhdGlvbiwgdW5kZWZpbmVkLCBzZXNzaW9uSWQpO1xuXG5cdFx0XHQvLyBDbGVhbiB1cCB0aGUgdHJhbnNmZXJyZWQgc2Vzc2lvbiBhZnRlciByZWFkaW5nXG5cdFx0XHRhd2FpdCB0aGlzLmNsZWFudXBUcmFuc2ZlcnJlZFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0cmV0dXJuIHNlc3Npb25EYXRhO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ2dldFRyYW5zZmVycmVkU2Vzc2lvbicsICdFcnJvciBnZXR0aW5nIHRyYW5zZmVycmVkIGNoYXQgc2Vzc2lvbicsIGUpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsZWFudXBUcmFuc2ZlcnJlZFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Ly8gUmVtb3ZlIGZyb20gaW5kZXhcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRUcmFuc2ZlcnJlZFNlc3Npb25JbmRleCgpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VLZXkgPSB3b3Jrc3BhY2VGb2xkZXJzWzBdLnVyaS50b1N0cmluZygpO1xuXHRcdFx0XHRkZWxldGUgaW5kZXhbd29ya3NwYWNlS2V5XTtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0VHJhbnNmZXJJbmRleFN0b3JhZ2VLZXksIGluZGV4LCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGVsZXRlIHRoZSB0cmFuc2ZlcnJlZCBzZXNzaW9uIGZpbGVcblx0XHRcdGNvbnN0IHN0b3JhZ2VMb2NhdGlvbiA9IHRoaXMuZ2V0VHJhbnNmZXJyZWRTZXNzaW9uU3RvcmFnZUxvY2F0aW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChzdG9yYWdlTG9jYXRpb24pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZSkgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignY2xlYW51cFRyYW5zZmVycmVkU2Vzc2lvbicsICdFcnJvciBjbGVhbmluZyB1cCB0cmFuc2ZlcnJlZCBzZXNzaW9uJywgZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlkUmVwb3J0SXNzdWUgPSBmYWxzZTtcblxuXHRwcml2YXRlIGFzeW5jIHdyaXRlU2Vzc2lvbihzZXNzaW9uOiBDaGF0TW9kZWwgfCBJU2VyaWFsaXphYmxlQ2hhdERhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmludGVybmFsR2V0SW5kZXgoKTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VMb2NhdGlvbiA9IHRoaXMuZ2V0U3RvcmFnZUxvY2F0aW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdGlmIChzdG9yYWdlTG9jYXRpb24ubG9nKSB7XG5cdFx0XHRcdGlmIChzZXNzaW9uIGluc3RhbmNlb2YgQ2hhdE1vZGVsKSB7XG5cdFx0XHRcdFx0aWYgKCFzZXNzaW9uLmRhdGFTZXJpYWxpemVyKSB7XG5cdFx0XHRcdFx0XHRzZXNzaW9uLmRhdGFTZXJpYWxpemVyID0gbmV3IENoYXRTZXNzaW9uT3BlcmF0aW9uTG9nKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IG9wOiAnYXBwZW5kJyB8ICdyZXBsYWNlJztcblx0XHRcdFx0XHRsZXQgZGF0YTogVlNCdWZmZXI7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdCh7IG9wLCBkYXRhIH0gPSBzZXNzaW9uLmRhdGFTZXJpYWxpemVyLndyaXRlKHNlc3Npb24pKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHQvLyBUaGlzIGlzIGEgYmlnIG9mIGFuIHVnbHkgcHJvbXB0LCBidXQgdGhlcmUgaXMgX3NvbWV0aGluZ18gZ29pbmcgb24gd2l0aFxuXHRcdFx0XHRcdFx0Ly8gbWlzc2luZyBzZXNzaW9ucy4gVW5mb3J0dW5hdGVseSBpdCdzIGhhcmQgdG8gcm9vdCBjYXVzZSBiZWNhdXNlIHVzZXJzIHdvdWxkXG5cdFx0XHRcdFx0XHQvLyBub3Qgbm90aWNlIGFuIGVycm9yIHVudGlsIHRoZXkgcmVsb2FkIHRoZSB3aW5kb3csIGF0IHdoaWNoIHBvaW50IGFueSBlcnJvclxuXHRcdFx0XHRcdFx0Ly8gaXMgZ29uZS4gVGhyb3cgYSB2ZXJ5IHZlcmJvc2UgZGlhbG9nIGhlcmUgc28gd2UgY2FuIGdldCBzb21lIHF1YWxpdHlcblx0XHRcdFx0XHRcdC8vIGJ1ZyByZXBvcnRzLCBpZiB0aGUgaXNzdWUgaXMgaW5kZWVkIGluIHRoZSBzZXJpYWxpemVkLlxuXHRcdFx0XHRcdFx0Ly8gdG9kb0Bjb25ub3I0MzEyOiByZW1vdmUgYWZ0ZXIgYSBsaXR0bGUgYml0XG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuX2RpZFJlcG9ydElzc3VlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2RpZFJlcG9ydElzc3VlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0dGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdFx0XHRcdFx0Y3VzdG9tOiB0cnVlLCAvLyBzbyB0ZXh0IGlzIGNvcHlhYmxlXG5cdFx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0U2Vzc2lvblN0b3JlLnNlcmlhbGl6YXRpb25FcnJvcicsICdFcnJvciBzYXZpbmcgY2hhdCBzZXNzaW9uJyksXG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NoYXRTZXNzaW9uU3RvcmUud3JpdGVFcnJvcicsICdFcnJvciBzZXJpYWxpemluZyBjaGF0IHNlc3Npb24gZm9yIHN0b3JhZ2UuIFRoZSBzZXNzaW9uIHdpbGwgYmUgbG9zdCBpZiB0aGUgd2luZG93IGlzIGNsb3NlZC4gUGxlYXNlIHJlcG9ydCB0aGlzIGlzc3VlIHRvIHRoZSBWUyBDb2RlIHRlYW06XFxuXFxuezB9JywgZS5zdGFjayB8fCB0b0Vycm9yTWVzc2FnZShlKSksXG5cdFx0XHRcdFx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ3JlcG9ydElzc3VlJywgJ1JlcG9ydCBJc3N1ZScpLCBydW46ICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvbmV3P3RlbXBsYXRlPWJ1Z19yZXBvcnQubWQnKSB9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZGF0YS5ieXRlTGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoc3RvcmFnZUxvY2F0aW9uLmxvZywgZGF0YSwgeyBhcHBlbmQ6IG9wID09PSAnYXBwZW5kJyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2Vzc2lvbi5kYXRhU2VyaWFsaXplci5jb25maXJtV3JpdGUoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gbmV3IENoYXRTZXNzaW9uT3BlcmF0aW9uTG9nKCkuY3JlYXRlSW5pdGlhbEZyb21TZXJpYWxpemVkKHNlc3Npb24pO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHN0b3JhZ2VMb2NhdGlvbi5sb2csIGNvbnRlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShzdG9yYWdlTG9jYXRpb24uZmxhdCwgVlNCdWZmZXIuZnJvbVN0cmluZyhzdHJpbmdpZnlFbnRyeVdpdGhGYWxsYmFjayhzZXNzaW9uKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXcml0ZSBzdWNjZWVkZWQsIHVwZGF0ZSBpbmRleFxuXHRcdFx0Y29uc3QgbmV3TWV0YWRhdGEgPSBhd2FpdCBnZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbik7XG5cdFx0XHRpbmRleC5lbnRyaWVzW3Nlc3Npb24uc2Vzc2lvbklkXSA9IG5ld01ldGFkYXRhO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ3Nlc3Npb25Xcml0ZScsICdFcnJvciB3cml0aW5nIGNoYXQgc2Vzc2lvbicsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd3JpdGVTZXNzaW9uTWV0YWRhdGFPbmx5KHNlc3Npb246IENoYXRNb2RlbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE9ubHkgdG8gYmUgdXNlZCBmb3IgZXh0ZXJuYWwgc2Vzc2lvbnNcblx0XHRpZiAoTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHNlc3Npb24uc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW50ZXJuYWxHZXRJbmRleCgpO1xuXG5cdFx0XHQvLyBUT0RPIGdldCB0aGlzIGNsYXNzIG9uIHNlc3Npb25SZXNvdXJjZVxuXHRcdFx0Y29uc3QgZXh0ZXJuYWxTZXNzaW9uSWQgPSBzZXNzaW9uLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0aW5kZXguZW50cmllc1tleHRlcm5hbFNlc3Npb25JZF0gPSBhd2FpdCBnZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5yZXBvcnRFcnJvcignc2Vzc2lvbk1ldGFkYXRhV3JpdGUnLCAnRXJyb3Igd3JpdGluZyBjaGF0IHNlc3Npb24gbWV0YWRhdGEnLCBlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZsdXNoSW5kZXgoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmludGVybmFsR2V0SW5kZXgoKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0SW5kZXhTdG9yYWdlS2V5LCBpbmRleCwgdGhpcy5nZXRJbmRleFN0b3JhZ2VTY29wZSgpLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIE9ubHkgaWYgSlNPTi5zdHJpbmdpZnkgZmFpbHMsIEFGQUlLXG5cdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdpbmRleFdyaXRlJywgJ0Vycm9yIHdyaXRpbmcgaW5kZXgnLCBlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEluZGV4U3RvcmFnZVNjb3BlKCk6IFN0b3JhZ2VTY29wZSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCBpc0VtcHR5V2luZG93ID0gIXdvcmtzcGFjZS5jb25maWd1cmF0aW9uICYmIHdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aCA9PT0gMDtcblx0XHRyZXR1cm4gaXNFbXB0eVdpbmRvdyA/IFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiA6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRyaW1FbnRyaWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbnRlcm5hbEdldEluZGV4KCk7XG5cdFx0Y29uc3QgZW50cmllcyA9IE9iamVjdC5lbnRyaWVzKGluZGV4LmVudHJpZXMpXG5cdFx0XHQuZmlsdGVyKChbX2lkLCBlbnRyeV0pID0+ICFlbnRyeS5pc0V4dGVybmFsKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGJbMV0ubGFzdE1lc3NhZ2VEYXRlIC0gYVsxXS5sYXN0TWVzc2FnZURhdGUpXG5cdFx0XHQubWFwKChbaWRdKSA9PiBpZCk7XG5cblx0XHRpZiAoZW50cmllcy5sZW5ndGggPiBtYXhQZXJzaXN0ZWRTZXNzaW9ucykge1xuXHRcdFx0Y29uc3QgZW50cmllc1RvRGVsZXRlID0gZW50cmllcy5zbGljZShtYXhQZXJzaXN0ZWRTZXNzaW9ucyk7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXNUb0RlbGV0ZSkge1xuXHRcdFx0XHRkZWxldGUgaW5kZXguZW50cmllc1tlbnRyeV07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQ2hhdFNlc3Npb25TdG9yZTogVHJpbW1lZCAke2VudHJpZXNUb0RlbGV0ZS5sZW5ndGh9IG9sZCBjaGF0IHNlc3Npb25zIGZyb20gaW5kZXhgKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGludGVybmFsRGVsZXRlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbnRlcm5hbEdldEluZGV4KCk7XG5cdFx0aWYgKCFpbmRleC5lbnRyaWVzW3Nlc3Npb25JZF0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc3RvcmFnZUxvY2F0aW9uOiBSZXR1cm5UeXBlPENoYXRTZXNzaW9uU3RvcmVbJ2dldFN0b3JhZ2VMb2NhdGlvbiddPjtcblx0XHR0cnkge1xuXHRcdFx0c3RvcmFnZUxvY2F0aW9uID0gdGhpcy5nZXRTdG9yYWdlTG9jYXRpb24oc2Vzc2lvbklkKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdpbnZhbGlkU2Vzc2lvbklkJywgYFJlbW92aW5nIGludmFsaWQgY2hhdCBzZXNzaW9uIGZyb20gaW5kZXg6ICR7c2Vzc2lvbklkfWAsIGUpO1xuXHRcdFx0ZGVsZXRlIGluZGV4LmVudHJpZXNbc2Vzc2lvbklkXTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgW3N0b3JhZ2VMb2NhdGlvbi5mbGF0LCBzdG9yYWdlTG9jYXRpb24ubG9nXSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHVyaSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ3Nlc3Npb25EZWxldGUnLCAnRXJyb3IgZGVsZXRpbmcgY2hhdCBzZXNzaW9uJywgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZGVsZXRlIGluZGV4LmVudHJpZXNbc2Vzc2lvbklkXTtcblx0XHR9XG5cdH1cblxuXHRoYXNTZXNzaW9ucygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpcy5pbnRlcm5hbEdldEluZGV4KCkuZW50cmllcykubGVuZ3RoID4gMDtcblx0fVxuXG5cdGlzU2Vzc2lvbkVtcHR5KHNlc3Npb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmludGVybmFsR2V0SW5kZXgoKTtcblx0XHRyZXR1cm4gaW5kZXguZW50cmllc1tzZXNzaW9uSWRdPy5pc0VtcHR5ID8/IHRydWU7XG5cdH1cblxuXHRhc3luYyBkZWxldGVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zdG9yZVF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuaW50ZXJuYWxEZWxldGVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRhd2FpdCB0aGlzLmZsdXNoSW5kZXgoKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyQWxsU2Vzc2lvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zdG9yZVF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbnRlcm5hbEdldEluZGV4KCk7XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gT2JqZWN0LmtleXMoaW5kZXguZW50cmllcyk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hhdFNlc3Npb25TdG9yZTogQ2xlYXJpbmcgJHtlbnRyaWVzLmxlbmd0aH0gY2hhdCBzZXNzaW9uc2ApO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZW50cmllcy5tYXAoZW50cnkgPT4gdGhpcy5pbnRlcm5hbERlbGV0ZVNlc3Npb24oZW50cnkpKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmZsdXNoSW5kZXgoKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzZXRTZXNzaW9uVGl0bGUoc2Vzc2lvbklkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnN0b3JlUXVldWUucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmludGVybmFsR2V0SW5kZXgoKTtcblx0XHRcdGlmIChpbmRleC5lbnRyaWVzW3Nlc3Npb25JZF0pIHtcblx0XHRcdFx0aW5kZXguZW50cmllc1tzZXNzaW9uSWRdLnRpdGxlID0gdGl0bGU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydEVycm9yKHJlYXNvbkZvclRlbGVtZXRyeTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcsIGVycm9yPzogRXJyb3IpOiB2b2lkIHtcblx0XHRjb25zdCBmaWxlT3BlcmF0aW9uUmVhc29uID0gZXJyb3IgJiYgdG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKTtcblxuXHRcdGlmIChmaWxlT3BlcmF0aW9uUmVhc29uID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHQvLyBFeHBlY3RlZCBjYXNlIChlLmcuIHJlYWRpbmcgYSBub24tZXhpc3RlbnQgc2Vzc2lvbik7IGtlZXAgbm9pc2UgbG93XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYENoYXRTZXNzaW9uU3RvcmU6IGAgKyBtZXNzYWdlLCB0b0Vycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBVbmV4cGVjdGVkIG9yIHNlcmlvdXMgZXJyb3I7IHN1cmZhY2UgYXQgZXJyb3IgbGV2ZWxcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgQ2hhdFNlc3Npb25TdG9yZTogYCArIG1lc3NhZ2UsIHRvRXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHRcdHR5cGUgQ2hhdFNlc3Npb25TdG9yZUVycm9yRGF0YSA9IHtcblx0XHRcdHJlYXNvbjogc3RyaW5nO1xuXHRcdFx0ZmlsZU9wZXJhdGlvblJlYXNvbjogbnVtYmVyO1xuXHRcdFx0Ly8gZXJyb3I6IEVycm9yO1xuXHRcdH07XG5cdFx0dHlwZSBDaGF0U2Vzc2lvblN0b3JlRXJyb3JDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAncm9ibG91cmVucyc7XG5cdFx0XHRjb21tZW50OiAnRGV0ZWN0IGlzc3VlcyByZWxhdGVkIHRvIG1hbmFnaW5nIGNoYXQgc2Vzc2lvbnMnO1xuXHRcdFx0cmVhc29uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSW5mbyBhYm91dCB0aGUgZXJyb3IgdGhhdCBvY2N1cnJlZCcgfTtcblx0XHRcdGZpbGVPcGVyYXRpb25SZWFzb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdBbiBlcnJvciBjb2RlIGZyb20gdGhlIGZpbGUgc2VydmljZScgfTtcblx0XHRcdC8vIGVycm9yOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSW5mbyBhYm91dCB0aGUgZXJyb3IgdGhhdCBvY2N1cnJlZCcgfTtcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRTZXNzaW9uU3RvcmVFcnJvckRhdGEsIENoYXRTZXNzaW9uU3RvcmVFcnJvckNsYXNzaWZpY2F0aW9uPignY2hhdFNlc3Npb25TdG9yZUVycm9yJywge1xuXHRcdFx0cmVhc29uOiByZWFzb25Gb3JUZWxlbWV0cnksXG5cdFx0XHRmaWxlT3BlcmF0aW9uUmVhc29uOiBmaWxlT3BlcmF0aW9uUmVhc29uID8/IC0xXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGluZGV4Q2FjaGU6IElDaGF0U2Vzc2lvbkluZGV4RGF0YSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpbnRlcm5hbEdldEluZGV4KCk6IElDaGF0U2Vzc2lvbkluZGV4RGF0YSB7XG5cdFx0aWYgKHRoaXMuaW5kZXhDYWNoZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5kZXhDYWNoZTtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQ2hhdEluZGV4U3RvcmFnZUtleSwgdGhpcy5nZXRJbmRleFN0b3JhZ2VTY29wZSgpLCB1bmRlZmluZWQpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0dGhpcy5pbmRleENhY2hlID0geyB2ZXJzaW9uOiAxLCBlbnRyaWVzOiB7fSB9O1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5kZXhDYWNoZTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBKU09OLnBhcnNlKGRhdGEpIGFzIHVua25vd247XG5cdFx0XHRpZiAoaXNDaGF0U2Vzc2lvbkluZGV4KGluZGV4KSkge1xuXHRcdFx0XHQvLyBTdWNjZXNzXG5cdFx0XHRcdHRoaXMuaW5kZXhDYWNoZSA9IGluZGV4O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignaW52YWxpZEluZGV4Rm9ybWF0JywgYEludmFsaWQgaW5kZXggZm9ybWF0OiAke2RhdGF9YCk7XG5cdFx0XHRcdHRoaXMuaW5kZXhDYWNoZSA9IHsgdmVyc2lvbjogMSwgZW50cmllczoge30gfTtcblx0XHRcdH1cblxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIE9ubHkgaWYgSlNPTi5wYXJzZSBmYWlsc1xuXHRcdFx0dGhpcy5yZXBvcnRFcnJvcignaW52YWxpZEluZGV4SlNPTicsIGBJbmRleCBjb3JydXB0OiAke2RhdGF9YCwgZSk7XG5cdFx0XHR0aGlzLmluZGV4Q2FjaGUgPSB7IHZlcnNpb246IDEsIGVudHJpZXM6IHt9IH07XG5cdFx0fVxuXG5cdFx0Ly8gQ29udmVydCBmcm9tIHByZS0xLjEwOSBmb3JtYXQgd2hpY2ggbGFja3MgdGltaW5nXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBPYmplY3QudmFsdWVzKHRoaXMuaW5kZXhDYWNoZS5lbnRyaWVzKSkge1xuXHRcdFx0ZW50cnkudGltaW5nID8/PSB7XG5cdFx0XHRcdGNyZWF0ZWQ6IGVudHJ5Lmxhc3RNZXNzYWdlRGF0ZSxcblx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IGVudHJ5Lmxhc3RNZXNzYWdlRGF0ZSxcblx0XHRcdH07XG5cblx0XHRcdC8vIFRPRE9AY29ubm9yNDMxMjogdGhlIGNoZWNrIGZvciBQZW5kaW5nL05lZWRzSW5wdXQgZ3VhcmRzIG9sZCBzZXNzaW9ucyBmcm9tIEluc2lkZXJzIHByZSBQUiAjMjg4MTYxIGFuZCBpdCBjYW4gYmUgc2FmZWx5IHJlbW92ZWQgYWZ0ZXIgYSB0cmFuc2l0aW9uIHBlcmlvZCwgdG8gb25seSBiYWNrZmlsbCB0aGUgXCJjb21wbGV0ZVwiIHN0YXRlIHdoZW4gbWlzc2luZy5cblx0XHRcdGVudHJ5Lmxhc3RSZXNwb25zZVN0YXRlID8/PSBlbnRyeS5sYXN0UmVzcG9uc2VTdGF0ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgfHwgZW50cnkubGFzdFJlc3BvbnNlU3RhdGUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5OZWVkc0lucHV0ID8gUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlIDogZW50cnkubGFzdFJlc3BvbnNlU3RhdGUgfHwgUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmluZGV4Q2FjaGU7XG5cdH1cblxuXHRhc3luYyBnZXRJbmRleCgpOiBQcm9taXNlPElDaGF0U2Vzc2lvbkluZGV4PiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmVRdWV1ZS5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnRlcm5hbEdldEluZGV4KCkuZW50cmllcztcblx0XHR9KTtcblx0fVxuXG5cdGdldE1ldGFkYXRhRm9yU2Vzc2lvblN5bmMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQ2hhdFNlc3Npb25FbnRyeU1ldGFkYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW50ZXJuYWxHZXRJbmRleCgpO1xuXHRcdHJldHVybiBpbmRleC5lbnRyaWVzW3RoaXMuZ2V0SW5kZXhLZXkoc2Vzc2lvblJlc291cmNlKV07XG5cdH1cblxuXHRwcml2YXRlIGdldEluZGV4S2V5KHNlc3Npb25SZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRyZXR1cm4gc2Vzc2lvbklkID8/IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHR9XG5cblx0bG9nSW5kZXgoKTogdm9pZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KENoYXRJbmRleFN0b3JhZ2VLZXksIHRoaXMuZ2V0SW5kZXhTdG9yYWdlU2NvcGUoKSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnQ2hhdFNlc3Npb25TdG9yZSBpbmRleDogJywgZGF0YSk7XG5cdH1cblxuXHRhc3luYyBtaWdyYXRlRGF0YUlmTmVlZGVkKGdldEluaXRpYWxEYXRhOiAoKSA9PiBJU2VyaWFsaXphYmxlQ2hhdHNEYXRhIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zdG9yZVF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChDaGF0SW5kZXhTdG9yYWdlS2V5LCB0aGlzLmdldEluZGV4U3RvcmFnZVNjb3BlKCksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBuZWVkc01pZ3JhdGlvbkZyb21TdG9yYWdlU2VydmljZSA9ICFkYXRhO1xuXHRcdFx0aWYgKG5lZWRzTWlncmF0aW9uRnJvbVN0b3JhZ2VTZXJ2aWNlKSB7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxEYXRhID0gZ2V0SW5pdGlhbERhdGEoKTtcblx0XHRcdFx0aWYgKGluaXRpYWxEYXRhKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5taWdyYXRlKGluaXRpYWxEYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBtaWdyYXRlKGluaXRpYWxEYXRhOiBJU2VyaWFsaXphYmxlQ2hhdHNEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbnVtU2Vzc2lvbnMgPSBPYmplY3Qua2V5cyhpbml0aWFsRGF0YSkubGVuZ3RoO1xuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBDaGF0U2Vzc2lvblN0b3JlOiBNaWdyYXRpbmcgJHtudW1TZXNzaW9uc30gY2hhdCBzZXNzaW9ucyBmcm9tIHN0b3JhZ2Ugc2VydmljZSB0byBmaWxlIHN5c3RlbWApO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoT2JqZWN0LnZhbHVlcyhpbml0aWFsRGF0YSkubWFwKGFzeW5jIHNlc3Npb24gPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy53cml0ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgdGhpcy5mbHVzaEluZGV4KCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVhZFNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5zdG9yZVF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBzdG9yYWdlTG9jYXRpb246IFJldHVyblR5cGU8Q2hhdFNlc3Npb25TdG9yZVsnZ2V0U3RvcmFnZUxvY2F0aW9uJ10+O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c3RvcmFnZUxvY2F0aW9uID0gdGhpcy5nZXRTdG9yYWdlTG9jYXRpb24oc2Vzc2lvbklkKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignaW52YWxpZFNlc3Npb25JZCcsIGBJZ25vcmluZyBpbnZhbGlkIGNoYXQgc2Vzc2lvbiBmcm9tIGluZGV4OiAke3Nlc3Npb25JZH1gLCBlKTtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmludGVybmFsR2V0SW5kZXgoKTtcblx0XHRcdFx0aWYgKGluZGV4LmVudHJpZXNbc2Vzc2lvbklkXSkge1xuXHRcdFx0XHRcdGRlbGV0ZSBpbmRleC5lbnRyaWVzW3Nlc3Npb25JZF07XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5mbHVzaEluZGV4KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnJlYWRTZXNzaW9uRnJvbUxvY2F0aW9uKHN0b3JhZ2VMb2NhdGlvbi5mbGF0LCBzdG9yYWdlTG9jYXRpb24ubG9nLCBzZXNzaW9uSWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWFkU2Vzc2lvbkZyb21Mb2NhdGlvbihmbGF0U3RvcmFnZUxvY2F0aW9uOiBVUkksIGxvZ1N0b3JhZ2VMb2NhdGlvbjogVVJJIHwgdW5kZWZpbmVkLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8SVNlcmlhbGl6ZWRDaGF0RGF0YVJlZmVyZW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBmcm9tTG9jYXRpb24gPSBmbGF0U3RvcmFnZUxvY2F0aW9uO1xuXHRcdGxldCByYXdEYXRhOiBWU0J1ZmZlciB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChsb2dTdG9yYWdlTG9jYXRpb24pIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJhd0RhdGEgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShsb2dTdG9yYWdlTG9jYXRpb24pKS52YWx1ZTtcblx0XHRcdFx0ZnJvbUxvY2F0aW9uID0gbG9nU3RvcmFnZUxvY2F0aW9uO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdzZXNzaW9uUmVhZEZpbGUnLCBgRXJyb3IgcmVhZGluZyBsb2cgY2hhdCBzZXNzaW9uIGZpbGUgJHtzZXNzaW9uSWR9YCwgZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFyYXdEYXRhKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyYXdEYXRhID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoZmxhdFN0b3JhZ2VMb2NhdGlvbikpLnZhbHVlO1xuXHRcdFx0XHRmcm9tTG9jYXRpb24gPSBmbGF0U3RvcmFnZUxvY2F0aW9uO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdzZXNzaW9uUmVhZEZpbGUnLCBgRXJyb3IgcmVhZGluZyBmbGF0IGNoYXQgc2Vzc2lvbiBmaWxlICR7c2Vzc2lvbklkfWAsIGUpO1xuXG5cdFx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZSkgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQgJiYgdGhpcy5wcmV2aW91c0VtcHR5V2luZG93U3RvcmFnZVJvb3QpIHtcblx0XHRcdFx0XHRyYXdEYXRhID0gYXdhaXQgdGhpcy5yZWFkU2Vzc2lvbkZyb21QcmV2aW91c0xvY2F0aW9uKHNlc3Npb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXJhd0RhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCBzZXNzaW9uOiBJU2VyaWFsaXphYmxlQ2hhdERhdGFJbjtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBDaGF0U2Vzc2lvbk9wZXJhdGlvbkxvZygpO1xuXHRcdFx0aWYgKGZyb21Mb2NhdGlvbiA9PT0gbG9nU3RvcmFnZUxvY2F0aW9uKSB7XG5cdFx0XHRcdHNlc3Npb24gPSByZXZpdmUobG9nLnJlYWQocmF3RGF0YSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2Vzc2lvbiA9IHJldml2ZShKU09OLnBhcnNlKHJhd0RhdGEudG9TdHJpbmcoKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUT0RPIENvcGllZCBmcm9tIENoYXRTZXJ2aWNlLnRzLCBjbGVhbnVwXG5cdFx0XHQvLyBSZXZpdmUgc2VyaWFsaXplZCBtYXJrZG93biBzdHJpbmdzIGluIHJlc3BvbnNlIGRhdGFcblx0XHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiBzZXNzaW9uLnJlcXVlc3RzKSB7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHJlcXVlc3QucmVzcG9uc2UpKSB7XG5cdFx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZSA9IHJlcXVlc3QucmVzcG9uc2UubWFwKChyZXNwb25zZSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiByZXNwb25zZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhyZXNwb25zZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHJlcXVlc3QucmVzcG9uc2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZSA9IFtuZXcgTWFya2Rvd25TdHJpbmcocmVxdWVzdC5yZXNwb25zZSldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IHZhbHVlOiBub3JtYWxpemVTZXJpYWxpemFibGVDaGF0RGF0YShzZXNzaW9uKSwgc2VyaWFsaXplcjogbG9nIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdtYWxmb3JtZWRTZXNzaW9uJywgYE1hbGZvcm1lZCBzZXNzaW9uIGRhdGEgaW4gJHtmcm9tTG9jYXRpb24uZnNQYXRofTogWyR7cmF3RGF0YS5zbGljZSgwLCAyMCkudG9TdHJpbmcoKX0ke3Jhd0RhdGEuYnl0ZUxlbmd0aCA+IDIwID8gJy4uLicgOiAnJ31dYCwgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWFkU2Vzc2lvbkZyb21QcmV2aW91c0xvY2F0aW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCByYXdEYXRhOiBWU0J1ZmZlciB8IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLnByZXZpb3VzRW1wdHlXaW5kb3dTdG9yYWdlUm9vdCkge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZUxvY2F0aW9uMiA9IGdldENoYXRTZXNzaW9uU3RvcmFnZVJlc291cmNlKHRoaXMucHJldmlvdXNFbXB0eVdpbmRvd1N0b3JhZ2VSb290LCBzZXNzaW9uSWQsICcuanNvbicpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmF3RGF0YSA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHN0b3JhZ2VMb2NhdGlvbjIpKS52YWx1ZTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYENoYXRTZXNzaW9uU3RvcmU6IFJlYWQgY2hhdCBzZXNzaW9uICR7c2Vzc2lvbklkfSBmcm9tIHByZXZpb3VzIGxvY2F0aW9uYCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ3Nlc3Npb25SZWFkRmlsZScsIGBFcnJvciByZWFkaW5nIGNoYXQgc2Vzc2lvbiBmaWxlICR7c2Vzc2lvbklkfSBmcm9tIHByZXZpb3VzIGxvY2F0aW9uYCwgZSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJhd0RhdGE7XG5cdH1cblxuXHRwcml2YXRlIGdldFN0b3JhZ2VMb2NhdGlvbihjaGF0U2Vzc2lvbklkOiBzdHJpbmcpOiB7XG5cdFx0LyoqIDwxLjEwOSBmbGF0IEpTT04gZmlsZSAqL1xuXHRcdGZsYXQ6IFVSSTtcblx0XHQvKiogPj0xLjEwOSBhcHBlbmQgbG9nICovXG5cdFx0bG9nPzogVVJJO1xuXHR9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZmxhdDogZ2V0Q2hhdFNlc3Npb25TdG9yYWdlUmVzb3VyY2UodGhpcy5zdG9yYWdlUm9vdCwgY2hhdFNlc3Npb25JZCwgJy5qc29uJyksXG5cdFx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IHJlbW92ZSBhZnRlciBzdGFiaWxpemluZ1xuXHRcdFx0bG9nOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdjaGF0LnVzZUxvZ1Nlc3Npb25TdG9yYWdlJykgIT09IGZhbHNlID8gZ2V0Q2hhdFNlc3Npb25TdG9yYWdlUmVzb3VyY2UodGhpcy5zdG9yYWdlUm9vdCwgY2hhdFNlc3Npb25JZCwgJy5qc29ubCcpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldFRyYW5zZmVycmVkU2Vzc2lvblN0b3JhZ2VMb2NhdGlvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFVSSSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFzZXNzaW9uSWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBsb2NhbCBjaGF0IHNlc3Npb24gcmVzb3VyY2U6ICR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBnZXRDaGF0U2Vzc2lvblN0b3JhZ2VSZXNvdXJjZSh0aGlzLnRyYW5zZmVycmVkU2Vzc2lvblN0b3JhZ2VSb290LCBzZXNzaW9uSWQsICcuanNvbicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN5bmNocm9ub3VzbHkgdXBkYXRlIHRoZSBpbi1tZW1vcnkgaW5kZXggZW50cmllcyBmb3IgdGhlIGdpdmVuIHNlc3Npb25zXG5cdCAqIGFuZCBmbHVzaCB0aGUgaW5kZXggdG8gc3RvcmFnZS4gVGhpcyBlbnN1cmVzIHRoZSBpbmRleCBpcyBwZXJzaXN0ZWRcblx0ICogZXZlbiB3aGVuIGNhbGxlZCBmcm9tIGEgc3luY2hyb25vdXMgYG9uV2lsbFNhdmVTdGF0ZWAgaGFuZGxlciB3aGVyZVxuXHQgKiBhc3luYyBmaWxlLXdyaXRlIHdvcmsgd291bGQgY29tcGxldGUgYWZ0ZXIgdGhlIHN0b3JhZ2Ugc2VydmljZSBoYXNcblx0ICogYWxyZWFkeSBmbHVzaGVkLlxuXHQgKi9cblx0dXBkYXRlQW5kRmx1c2hJbmRleFN5bmMobG9jYWxTZXNzaW9uczogQ2hhdE1vZGVsW10sIGV4dGVybmFsU2Vzc2lvbnM6IENoYXRNb2RlbFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmludGVybmFsR2V0SW5kZXgoKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgbG9jYWxTZXNzaW9ucykge1xuXHRcdFx0aW5kZXguZW50cmllc1tzZXNzaW9uLnNlc3Npb25JZF0gPSBnZXRTZXNzaW9uTWV0YWRhdGFTeW5jKHNlc3Npb24pO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgZXh0ZXJuYWxTZXNzaW9ucykge1xuXHRcdFx0Y29uc3QgZXh0ZXJuYWxTZXNzaW9uSWQgPSBzZXNzaW9uLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0aW5kZXguZW50cmllc1tleHRlcm5hbFNlc3Npb25JZF0gPSBnZXRTZXNzaW9uTWV0YWRhdGFTeW5jKHNlc3Npb24pO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0SW5kZXhTdG9yYWdlS2V5LCBpbmRleCwgdGhpcy5nZXRJbmRleFN0b3JhZ2VTY29wZSgpLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ2luZGV4V3JpdGUnLCAnRXJyb3Igd3JpdGluZyBpbmRleCBzeW5jaHJvbm91c2x5JywgZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldENoYXRTdG9yYWdlRm9sZGVyKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVJvb3Q7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFNlc3Npb25FbnRyeU1ldGFkYXRhIHtcblx0c2Vzc2lvbklkOiBzdHJpbmc7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGxhc3RNZXNzYWdlRGF0ZTogbnVtYmVyO1xuXHR0aW1pbmc6IElDaGF0U2Vzc2lvblRpbWluZztcblx0aW5pdGlhbExvY2F0aW9uPzogQ2hhdEFnZW50TG9jYXRpb247XG5cdGhhc1BlbmRpbmdFZGl0cz86IGJvb2xlYW47XG5cdHN0YXRzPzogSUNoYXRTZXNzaW9uU3RhdHM7XG5cdGxhc3RSZXNwb25zZVN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGU7XG5cblx0LyoqXG5cdCAqIFRoZSB3b3JraW5nIGRpcmVjdG9yeSBVUkkgc3RyaW5nIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlc3Npb24uXG5cdCAqIFBlcnNpc3RlZCBzbyBpdCBzdXJ2aXZlcyB3aW5kb3cgcmVsb2FkIGluIHRoZSBhZ2VudHMvc2Vzc2lvbnMgd2luZG93LlxuXHQgKi9cblx0d29ya2luZ0RpcmVjdG9yeT86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhpcyBvbmx5IGV4aXN0cyBiZWNhdXNlIHRoZSBtaWdyYXRlZCBkYXRhIGZyb20gdGhlIHN0b3JhZ2Ugc2VydmljZSBoYWQgZW1wdHkgc2Vzc2lvbnMgcGVyc2lzdGVkLCBhbmQgaXQncyBpbXBvc3NpYmxlIHRvIGtub3cgd2hpY2ggb25lcyBhcmVcblx0ICogY3VycmVudGx5IGluIHVzZS4gTm93LCBgY2xlYXJTZXNzaW9uYCBkZWxldGVzIGVtcHR5IHNlc3Npb25zLCBzbyBvbGQgb25lcyBzaG91bGRuJ3QgdGFrZSB1cCBzcGFjZSBpbiB0aGUgc3RvcmUgYW55bW9yZSwgYnV0IHdlIHN0aWxsIG5lZWQgdG9cblx0ICogZmlsdGVyIHRoZSBvbGQgb25lcyBvdXQgb2YgaGlzdG9yeS5cblx0ICovXG5cdGlzRW1wdHk/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgc2Vzc2lvbiB3YXMgbG9hZGVkIGZyb20gYW4gZXh0ZXJuYWwgcHJvdmlkZXIgKGVnIGJhY2tncm91bmQvY2xvdWQgc2Vzc2lvbnMpLlxuXHQgKi9cblx0aXNFeHRlcm5hbD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBwZXJtaXNzaW9uIGxldmVsIGZvciB0b29sIGF1dG8tYXBwcm92YWwsIGlmIG5vdCBkZWZhdWx0LlxuXHQgKi9cblx0cGVybWlzc2lvbkxldmVsPzogQ2hhdFBlcm1pc3Npb25MZXZlbDtcblxuXHQvKipcblx0ICogU2VyaWFsaXplZCBkcmFmdCBpbnB1dCBzdGF0ZSAodGV4dCwgYXR0YWNobWVudHMsIG1vZGUsIHNlbGVjdGVkIG1vZGVsLCAuLi4pIGZvclxuXHQgKiBleHRlcm5hbCBzZXNzaW9ucywgc28gdGhhdCB1bnNlbnQgaW5wdXQgaXMgcHJlc2VydmVkIHdoZW4gc3dpdGNoaW5nIGF3YXkgYW5kXG5cdCAqIGJhY2suIExvY2FsIHNlc3Npb25zIGluc3RlYWQgcGVyc2lzdCB0aGVpciBmdWxsIHN0YXRlIHZpYSBzdG9yZVNlc3Npb25zLlxuXHQgKi9cblx0aW5wdXRTdGF0ZT86IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlO1xufVxuXG5mdW5jdGlvbiBpc0NoYXRTZXNzaW9uRW50cnlNZXRhZGF0YShvYmo6IHVua25vd24pOiBvYmogaXMgSUNoYXRTZXNzaW9uRW50cnlNZXRhZGF0YSB7XG5cdHJldHVybiAoXG5cdFx0ISFvYmogJiZcblx0XHR0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJlxuXHRcdHR5cGVvZiAob2JqIGFzIElDaGF0U2Vzc2lvbkVudHJ5TWV0YWRhdGEpLnNlc3Npb25JZCA9PT0gJ3N0cmluZycgJiZcblx0XHR0eXBlb2YgKG9iaiBhcyBJQ2hhdFNlc3Npb25FbnRyeU1ldGFkYXRhKS50aXRsZSA9PT0gJ3N0cmluZycgJiZcblx0XHR0eXBlb2YgKG9iaiBhcyBJQ2hhdFNlc3Npb25FbnRyeU1ldGFkYXRhKS5sYXN0TWVzc2FnZURhdGUgPT09ICdudW1iZXInXG5cdCk7XG59XG5cbmV4cG9ydCB0eXBlIElDaGF0U2Vzc2lvbkluZGV4ID0gUmVjb3JkPHN0cmluZywgSUNoYXRTZXNzaW9uRW50cnlNZXRhZGF0YT47XG5cbmludGVyZmFjZSBJQ2hhdFNlc3Npb25JbmRleERhdGEge1xuXHR2ZXJzaW9uOiAxO1xuXHRlbnRyaWVzOiBJQ2hhdFNlc3Npb25JbmRleDtcbn1cblxuLy8gVE9ETyBpZiB3ZSB1cGRhdGUgdGhlIGluZGV4IHZlcnNpb246XG4vLyBEb24ndCB0aHJvdyBhd2F5IGluZGV4IHdoZW4gbW92aW5nIGJhY2t3YXJkcyBpbiBWUyBDb2RlIHZlcnNpb24uIFRyeSB0byByZWNvdmVyIGl0LiBCdXQgdGhpcyBzY2VuYXJpbyBpcyBoYXJkLlxuZnVuY3Rpb24gaXNDaGF0U2Vzc2lvbkluZGV4KGRhdGE6IHVua25vd24pOiBkYXRhIGlzIElDaGF0U2Vzc2lvbkluZGV4RGF0YSB7XG5cdGlmICh0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcgfHwgZGF0YSA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IGluZGV4ID0gZGF0YSBhcyBJQ2hhdFNlc3Npb25JbmRleERhdGE7XG5cdGlmIChpbmRleC52ZXJzaW9uICE9PSAxKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBpbmRleC5lbnRyaWVzICE9PSAnb2JqZWN0JyB8fCBpbmRleC5lbnRyaWVzID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Zm9yIChjb25zdCBrZXkgaW4gaW5kZXguZW50cmllcykge1xuXHRcdGlmICghaXNDaGF0U2Vzc2lvbkVudHJ5TWV0YWRhdGEoaW5kZXguZW50cmllc1trZXldKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG4vKipcbiAqIEJ1aWxkcyBzZXNzaW9uIG1ldGFkYXRhIHN5bmNocm9ub3VzbHkgZnJvbSBhIGxpdmUgQ2hhdE1vZGVsLlxuICogVXNlZCBib3RoIGJ5IHtAbGluayB1cGRhdGVBbmRGbHVzaEluZGV4U3luY30gKHdoZXJlIGFzeW5jIHdvcmsgaXMgbm90XG4gKiBwb3NzaWJsZSkgYW5kIGJ5IHtAbGluayBnZXRTZXNzaW9uTWV0YWRhdGF9ICh3aGljaCBsYXllcnMgb24gYXN5bmMgc3RhdHMpLlxuICovXG5mdW5jdGlvbiBnZXRTZXNzaW9uTWV0YWRhdGFTeW5jKHNlc3Npb246IENoYXRNb2RlbCk6IElDaGF0U2Vzc2lvbkVudHJ5TWV0YWRhdGEge1xuXHRjb25zdCB0aXRsZSA9IHNlc3Npb24uY3VzdG9tVGl0bGUgfHwgc2Vzc2lvbi50aXRsZTtcblxuXHRsZXQgbGFzdFJlc3BvbnNlU3RhdGUgPSBzZXNzaW9uLmxhc3RSZXF1ZXN0Py5yZXNwb25zZT8uc3RhdGUgPz8gUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlO1xuXHRpZiAobGFzdFJlc3BvbnNlU3RhdGUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5QZW5kaW5nIHx8IGxhc3RSZXNwb25zZVN0YXRlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuTmVlZHNJbnB1dCkge1xuXHRcdGxhc3RSZXNwb25zZVN0YXRlID0gUmVzcG9uc2VNb2RlbFN0YXRlLkNhbmNlbGxlZDtcblx0fVxuXG5cdGNvbnN0IGlzRXh0ZXJuYWwgPSAhTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHNlc3Npb24uc2Vzc2lvblJlc291cmNlKTtcblx0Y29uc3QgcmF3SW5wdXRTdGF0ZSA9IGlzRXh0ZXJuYWwgPyBzZXNzaW9uLmlucHV0TW9kZWwudG9KU09OKCkgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGlucHV0U3RhdGUgPSByYXdJbnB1dFN0YXRlID8geyAuLi5yYXdJbnB1dFN0YXRlLCBhdHRhY2htZW50czogW10gfSA6IHVuZGVmaW5lZDtcblxuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsXG5cdFx0dGl0bGU6IHRpdGxlIHx8IGxvY2FsaXplKCduZXdDaGF0JywgXCJOZXcgQ2hhdFwiKSxcblx0XHRsYXN0TWVzc2FnZURhdGU6IHNlc3Npb24ubGFzdE1lc3NhZ2VEYXRlLFxuXHRcdHRpbWluZzogc2Vzc2lvbi50aW1pbmcsXG5cdFx0aW5pdGlhbExvY2F0aW9uOiBzZXNzaW9uLmluaXRpYWxMb2NhdGlvbixcblx0XHRoYXNQZW5kaW5nRWRpdHM6IHNlc3Npb24uZWRpdGluZ1Nlc3Npb24/LmVudHJpZXMuZ2V0KCkuc29tZShlID0+IGUuc3RhdGUuZ2V0KCkgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpID8/IGZhbHNlLFxuXHRcdGlzRW1wdHk6IHNlc3Npb24uZ2V0UmVxdWVzdHMoKS5sZW5ndGggPT09IDAsXG5cdFx0aXNFeHRlcm5hbCxcblx0XHRsYXN0UmVzcG9uc2VTdGF0ZSxcblx0XHRwZXJtaXNzaW9uTGV2ZWw6IHNlc3Npb24uaW5wdXRNb2RlbC5zdGF0ZS5nZXQoKT8ucGVybWlzc2lvbkxldmVsLFxuXHRcdGlucHV0U3RhdGUsXG5cdFx0d29ya2luZ0RpcmVjdG9yeTogc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5Py50b1N0cmluZygpLFxuXHR9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbjogQ2hhdE1vZGVsIHwgSVNlcmlhbGl6YWJsZUNoYXREYXRhKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25FbnRyeU1ldGFkYXRhPiB7XG5cdGlmIChzZXNzaW9uIGluc3RhbmNlb2YgQ2hhdE1vZGVsKSB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBnZXRTZXNzaW9uTWV0YWRhdGFTeW5jKHNlc3Npb24pO1xuXHRcdG1ldGFkYXRhLnN0YXRzID0gYXdhaXQgYXdhaXRTdGF0c0ZvclNlc3Npb24oc2Vzc2lvbik7XG5cdFx0cmV0dXJuIG1ldGFkYXRhO1xuXHR9XG5cblx0Ly8gSVNlcmlhbGl6YWJsZUNoYXREYXRhIFx1MjAxNCBvbmx5IHVzZWQgaW4gdGhlIG9sZCBwcmUtZnMgc3RvcmFnZSBkYXRhIG1pZ3JhdGlvbiBzY2VuYXJpb1xuXHRjb25zdCBsYXN0TWVzc2FnZURhdGUgPSBzZXNzaW9uLnJlcXVlc3RzLmF0KC0xKT8udGltZXN0YW1wID8/IHNlc3Npb24uY3JlYXRpb25EYXRlO1xuXG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCxcblx0XHR0aXRsZTogc2Vzc2lvbi5jdXN0b21UaXRsZSB8fCBsb2NhbGl6ZSgnbmV3Q2hhdCcsIFwiTmV3IENoYXRcIiksXG5cdFx0bGFzdE1lc3NhZ2VEYXRlLFxuXHRcdHRpbWluZzoge1xuXHRcdFx0Y3JlYXRlZDogc2Vzc2lvbi5jcmVhdGlvbkRhdGUsXG5cdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHNlc3Npb24ucmVxdWVzdHMuYXQoLTEpPy50aW1lc3RhbXAsXG5cdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBsYXN0TWVzc2FnZURhdGUsXG5cdFx0fSxcblx0XHRpbml0aWFsTG9jYXRpb246IHNlc3Npb24uaW5pdGlhbExvY2F0aW9uLFxuXHRcdGhhc1BlbmRpbmdFZGl0czogZmFsc2UsXG5cdFx0aXNFbXB0eTogc2Vzc2lvbi5yZXF1ZXN0cy5sZW5ndGggPT09IDAsXG5cdFx0aXNFeHRlcm5hbDogZmFsc2UsXG5cdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSxcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFRyYW5zZmVyIHtcblx0dG9Xb3Jrc3BhY2U6IFVSSTtcblx0c2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdHRpbWVzdGFtcEluTWlsbGlzZWNvbmRzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRUcmFuc2ZlcjIgZXh0ZW5kcyBJQ2hhdFRyYW5zZmVyIHtcblx0Y2hhdDogSVNlcmlhbGl6YWJsZUNoYXREYXRhO1xufVxuXG50eXBlIElDaGF0VHJhbnNmZXJEdG8gPSBEdG88SUNoYXRUcmFuc2Zlcj47XG5cbi8qKlxuICogTWFwIG9mIGRlc3RpbmF0aW9uIHdvcmtzcGFjZSBVUkkgdG8gY2hhdCB0cmFuc2ZlciBkYXRhXG4gKi9cbnR5cGUgSUNoYXRUcmFuc2ZlckluZGV4ID0gUmVjb3JkPHN0cmluZywgSUNoYXRUcmFuc2ZlckR0bz47XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsY0FBYztBQUN2QixTQUFTLFNBQVMsZ0JBQWdCO0FBQ2xDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQixjQUFjLDZCQUE2QjtBQUN6RSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFrQyw0QkFBNEIsZ0NBQWdDO0FBRTlGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQWdELDBCQUEwQjtBQUUxRSxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLFdBQW1KLHFDQUFxQztBQUNqTSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLCtCQUErQiwyQkFBMkI7QUFDbkUsU0FBUyxrQ0FBa0M7QUFFM0MsTUFBTSx1QkFBdUI7QUFFN0IsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSw4QkFBOEI7QUFFN0IsSUFBTSxtQkFBTixjQUErQixXQUFXO0FBQUEsRUFVaEQsWUFDZ0MsYUFDTyxvQkFDUixZQUNhLHlCQUNQLGtCQUNGLGdCQUNFLGtCQUNPLHlCQUNILHNCQUNHLHlCQUNWLGVBQ0EsZUFDaEM7QUFDRCxVQUFNO0FBYnlCO0FBQ087QUFDUjtBQUNhO0FBQ1A7QUFDRjtBQUNFO0FBQ087QUFDSDtB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
