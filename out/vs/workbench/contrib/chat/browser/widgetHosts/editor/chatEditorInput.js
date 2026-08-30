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
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { revive } from "../../../../../../base/common/marshalling.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { truncate } from "../../../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import * as nls from "../../../../../../nls.js";
import { ConfirmResult, IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { registerIcon } from "../../../../../../platform/theme/common/iconRegistry.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { EditorInputCapabilities, Verbosity } from "../../../../../common/editor.js";
import { EditorInput } from "../../../../../common/editor/editorInput.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatSessionsService, localChatSessionType } from "../../../common/chatSessionsService.js";
import { ChatAgentLocation, ChatEditorTitleMaxLength, getDefaultNewChatSessionResource, getDefaultNewChatSessionType } from "../../../common/constants.js";
import { ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { LocalChatSessionUri, getChatSessionType, isUntitledChatSession } from "../../../common/model/chatUri.js";
const ChatEditorIcon = registerIcon("chat-editor-label-icon", Codicon.chatSparkle, nls.localize("chatEditorLabelIcon", "Icon of the chat editor label."));
let ChatEditorInput = class extends EditorInput {
  constructor(resource, options, chatService, dialogService, configurationService, chatSessionsService, instantiationService, storageService, logService, workspaceContextService, agentHostEnablementService) {
    super();
    this.resource = resource;
    this.options = options;
    this.chatService = chatService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.chatSessionsService = chatSessionsService;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.logService = logService;
    this.workspaceContextService = workspaceContextService;
    this.agentHostEnablementService = agentHostEnablementService;
    this.didTransferOutEditingSession = false;
    this.modelRef = this._register(new MutableDisposable());
    this._modelChangeListener = this._register(new MutableDisposable());
    this.closeHandler = this;
    if (resource.scheme === Schemas.vscodeChatEditor) {
      const parsed = ChatEditorUri.parse(resource);
      if (!parsed || typeof parsed !== "number") {
        throw new Error("Invalid chat URI");
      }
    } else if (resource.scheme === Schemas.vscodeLocalChatSession) {
      const localSessionId = LocalChatSessionUri.parseLocalSessionId(resource);
      if (!localSessionId) {
        throw new Error("Invalid local chat session URI");
      }
      this._sessionResource = resource;
    } else {
      this._sessionResource = resource;
    }
  }
  /**
   * Get the uri of the session this editor input is associated with.
   *
   * This should be preferred over using `resource` directly, as it handles cases where a chat editor becomes a session
   */
  get sessionResource() {
    return this._sessionResource;
  }
  get model() {
    return this.modelRef.value?.object;
  }
  static getNewEditorUri() {
    return ChatEditorUri.getNewEditorUri();
  }
  showConfirm() {
    return !!(this.model && shouldShowClearEditingSessionConfirmation(this.model));
  }
  transferOutEditingSession() {
    this.didTransferOutEditingSession = true;
    return this.model?.editingSession;
  }
  async confirm(editors) {
    if (!this.model?.editingSession || this.didTransferOutEditingSession || this.getSessionType() !== localChatSessionType) {
      return ConfirmResult.SAVE;
    }
    const titleOverride = nls.localize("chatEditorConfirmTitle", "Close Chat Editor");
    const messageOverride = nls.localize("chat.startEditing.confirmation.pending.message.default", "Closing the chat editor will end your current edit session.");
    const result = await showClearEditingSessionConfirmation(this.model, this.dialogService, { titleOverride, messageOverride });
    return result ? ConfirmResult.SAVE : ConfirmResult.CANCEL;
  }
  get editorId() {
    return ChatEditorInput.EditorID;
  }
  get capabilities() {
    return super.capabilities | EditorInputCapabilities.ForceReveal | EditorInputCapabilities.CanDropIntoEditor;
  }
  copy() {
    return this.instantiationService.createInstance(ChatEditorInput, ChatEditorInput.getNewEditorUri(), {});
  }
  matches(otherInput) {
    if (!(otherInput instanceof ChatEditorInput)) {
      return false;
    }
    return isEqual(this.sessionResource, otherInput.sessionResource);
  }
  get typeId() {
    return ChatEditorInput.TypeID;
  }
  getName() {
    if (this.model?.title) {
      return this.model.hasCustomTitle ? this.model.title : truncate(this.model.title, ChatEditorTitleMaxLength);
    }
    if (this._sessionResource) {
      const existingSession = this.chatService.getSession(this._sessionResource);
      if (existingSession?.title) {
        return existingSession.title;
      }
      const persistedTitle = this.chatService.getSessionTitle(this._sessionResource);
      if (persistedTitle && persistedTitle.trim()) {
        return persistedTitle;
      }
    }
    if (this.options.title?.preferred) {
      return this.options.title.preferred;
    }
    return this.options.title?.fallback ?? nls.localize("chatEditorName", "Chat");
  }
  getTitle(verbosity) {
    const name = this.getName();
    if (verbosity === Verbosity.LONG) {
      const sessionTypeDisplayName = this.getSessionTypeDisplayName();
      if (sessionTypeDisplayName) {
        return `${name} | ${sessionTypeDisplayName}`;
      }
    }
    return name;
  }
  getSessionTypeDisplayName() {
    const sessionType = this.getSessionType();
    if (sessionType === localChatSessionType) {
      return;
    }
    const contributions = this.chatSessionsService.getAllChatSessionContributions();
    const contribution = contributions.find((c) => c.type === sessionType);
    return contribution?.displayName;
  }
  getIcon() {
    const resolvedIcon = this.resolveIcon();
    if (resolvedIcon) {
      this.cachedIcon = resolvedIcon;
      return resolvedIcon;
    }
    return ChatEditorIcon;
  }
  resolveIcon() {
    const sessionType = this.getSessionType();
    if (sessionType !== localChatSessionType) {
      return this.chatSessionsService.getChatSessionContribution(sessionType)?.icon;
    }
    return void 0;
  }
  /**
   * Returns chat session type from a URI, or {@linkcode localChatSessionType} if not specified or cannot be determined.
   */
  getSessionType() {
    return getChatSessionType(this._sessionResource ?? this.resource);
  }
  async resolve() {
    const searchParams = new URLSearchParams(this.resource.query);
    const chatSessionType = searchParams.get("chatSessionType");
    const inputType = chatSessionType ?? this.resource.authority;
    if (this._sessionResource) {
      try {
        this.modelRef.value = await this.chatService.acquireOrLoadSession(this._sessionResource, ChatAgentLocation.Chat, CancellationToken.None, "ChatEditorInput#resolve");
      } catch (error) {
        this.logService.warn(`[ChatEditorInput] Failed to acquire session ${this._sessionResource.toString()}`, error);
      }
      if (!this.model && isUntitledChatSession(this._sessionResource) && getChatSessionType(this._sessionResource) !== localChatSessionType) {
        this.logService.warn(`[ChatEditorInput] Falling back to a local chat session because ${this._sessionResource.toString()} could not be acquired`);
        this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: "ChatEditorInput#resolveUntitledFallback" });
      }
      if (this.shouldReplaceEmptyLocalSession(this._sessionResource)) {
        const defaultResource = getDefaultNewChatSessionResource(this.configurationService, this.chatSessionsService, this.storageService, this.workspaceContextService.getWorkspace(), this.agentHostEnablementService.enabled.get());
        if (getChatSessionType(defaultResource) !== localChatSessionType) {
          let modelRef;
          try {
            modelRef = await this.chatService.acquireOrLoadSession(defaultResource, ChatAgentLocation.Chat, CancellationToken.None, "ChatEditorInput#resolveDefaultSession");
          } catch (error) {
            this.logService.warn(`[ChatEditorInput] Failed to acquire default session ${defaultResource.toString()}`, error);
          }
          if (modelRef) {
            this._sessionResource = defaultResource;
            this.modelRef.value = modelRef;
          } else {
            this.logService.warn(`[ChatEditorInput] Keeping local chat session because default session ${defaultResource.toString()} could not be acquired`);
          }
        }
      }
      if (!this.model && LocalChatSessionUri.parseLocalSessionId(this._sessionResource)) {
        this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: true, debugOwner: "ChatEditorInput#resolveNewLocalSession" });
      }
    } else if (!this.options.target) {
      if (this.options.explicitSessionType === localChatSessionType) {
        this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: "ChatEditorInput#resolveExplicitLocal" });
      } else {
        const defaultResource = getDefaultNewChatSessionResource(this.configurationService, this.chatSessionsService, this.storageService, this.workspaceContextService.getWorkspace(), this.agentHostEnablementService.enabled.get());
        if (getChatSessionType(defaultResource) === localChatSessionType) {
          this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: "ChatEditorInput#resolveUntitled" });
        } else {
          try {
            this.modelRef.value = await this.chatService.acquireOrLoadSession(defaultResource, ChatAgentLocation.Chat, CancellationToken.None, "ChatEditorInput#resolveDefaultUntitled");
          } catch (error) {
            this.logService.warn(`[ChatEditorInput] Failed to acquire default session ${defaultResource.toString()}`, error);
          }
          if (this.model) {
            this._sessionResource = defaultResource;
          } else {
            this.logService.warn(`[ChatEditorInput] Falling back to a local chat session because ${defaultResource.toString()} could not be acquired`);
            this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: "ChatEditorInput#resolveUntitledFallback" });
          }
        }
      }
    } else if (this.options.target.data) {
      this.modelRef.value = this.chatService.loadSessionFromData(this.options.target.data, "ChatEditorInput#resolveImportedData");
    }
    if (!this.model || this.isDisposed()) {
      return null;
    }
    this._sessionResource = this.model.sessionResource;
    this._trackModelChanges();
    const newIcon = this.resolveIcon();
    if (newIcon && (!this.cachedIcon || !this.iconsEqual(this.cachedIcon, newIcon))) {
      this.cachedIcon = newIcon;
    }
    this._onDidChangeLabel.fire();
    return this._register(new ChatEditorModel(this.model));
  }
  shouldReplaceEmptyLocalSession(sessionResource) {
    return LocalChatSessionUri.isLocalSession(sessionResource) && this.options.explicitSessionType !== localChatSessionType && !!this.model && !this.model.hasRequests && getDefaultNewChatSessionType(this.configurationService, this.chatSessionsService, this.storageService, this.workspaceContextService.getWorkspace(), this.agentHostEnablementService.enabled.get()) !== localChatSessionType;
  }
  /**
   * Updates the editor input to track a new model. Called when the widget swaps
   * from an untitled session to a real session.
   */
  updateModel(model) {
    this._sessionResource = model.sessionResource;
    this.modelRef.value = this.chatService.acquireExistingSession(model.sessionResource, "ChatEditorInput#updateModel");
    this._trackModelChanges();
    this.cachedIcon = void 0;
    this._onDidChangeLabel.fire();
  }
  _trackModelChanges() {
    if (!this.model) {
      return;
    }
    this._modelChangeListener.value = this.model.onDidChange(() => {
      this.cachedIcon = void 0;
      this._onDidChangeLabel.fire();
    });
  }
  iconsEqual(a, b) {
    if (ThemeIcon.isThemeIcon(a) && ThemeIcon.isThemeIcon(b)) {
      return a.id === b.id;
    }
    if (a instanceof URI && b instanceof URI) {
      return a.toString() === b.toString();
    }
    return false;
  }
};
ChatEditorInput.TypeID = "workbench.input.chatSession";
ChatEditorInput.EditorID = "workbench.editor.chatSession";
ChatEditorInput = __decorateClass([
  __decorateParam(2, IChatService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IChatSessionsService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IAgentHostEnablementService)
], ChatEditorInput);
class ChatEditorModel extends Disposable {
  constructor(model) {
    super();
    this.model = model;
    this._isResolved = false;
  }
  async resolve() {
    this._isResolved = true;
  }
  isResolved() {
    return this._isResolved;
  }
  isDisposed() {
    return this._store.isDisposed;
  }
}
var ChatEditorUri;
((ChatEditorUri2) => {
  const scheme = Schemas.vscodeChatEditor;
  function getNewEditorUri() {
    const handle = Math.floor(Math.random() * 1e9);
    return URI.from({ scheme, path: `chat-${handle}` });
  }
  ChatEditorUri2.getNewEditorUri = getNewEditorUri;
  function parse(resource) {
    if (resource.scheme !== scheme) {
      return void 0;
    }
    const match = resource.path.match(/chat-(\d+)/);
    const handleStr = match?.[1];
    if (typeof handleStr !== "string") {
      return void 0;
    }
    const handle = parseInt(handleStr);
    if (isNaN(handle)) {
      return void 0;
    }
    return handle;
  }
  ChatEditorUri2.parse = parse;
})(ChatEditorUri || (ChatEditorUri = {}));
class ChatEditorInputSerializer {
  canSerialize(input) {
    return input instanceof ChatEditorInput && !!input.sessionResource;
  }
  serialize(input) {
    if (!this.canSerialize(input)) {
      return void 0;
    }
    const obj = {
      options: input.options,
      sessionResource: input.sessionResource,
      resource: input.resource
    };
    return JSON.stringify(obj);
  }
  deserialize(instantiationService, serializedEditor) {
    try {
      const parsed = revive(JSON.parse(serializedEditor));
      if (parsed.sessionResource) {
        const sessionResource = URI.revive(parsed.sessionResource);
        return instantiationService.createInstance(ChatEditorInput, sessionResource, parsed.options);
      }
      let resource = URI.revive(parsed.resource);
      if (resource.scheme === Schemas.vscodeChatEditor && parsed.sessionId) {
        resource = LocalChatSessionUri.forSession(parsed.sessionId);
      }
      return instantiationService.createInstance(ChatEditorInput, resource, parsed.options);
    } catch (err) {
      return void 0;
    }
  }
}
async function showClearEditingSessionConfirmation(model, dialogService, options) {
  const undecidedEdits = shouldShowClearEditingSessionConfirmation(model, options);
  if (!undecidedEdits) {
    return true;
  }
  const defaultPhrase = nls.localize("chat.startEditing.confirmation.pending.message.default1", "Starting a new chat will end your current edit session.");
  const defaultTitle = nls.localize("chat.startEditing.confirmation.title", "Start new chat?");
  const phrase = options?.messageOverride ?? defaultPhrase;
  const title = options?.titleOverride ?? defaultTitle;
  const { result } = await dialogService.prompt({
    title,
    message: phrase + " " + nls.localize("chat.startEditing.confirmation.pending.message.2", "Do you want to keep pending edits to {0} files?", undecidedEdits),
    type: "info",
    cancelButton: true,
    buttons: [
      {
        label: nls.localize("chat.startEditing.confirmation.acceptEdits", "Keep & Continue"),
        run: async () => {
          await model.editingSession.accept();
          return true;
        }
      },
      {
        label: nls.localize("chat.startEditing.confirmation.discardEdits", "Undo & Continue"),
        run: async () => {
          await model.editingSession.reject();
          return true;
        }
      }
    ]
  });
  return Boolean(result);
}
function shouldShowClearEditingSessionConfirmation(model, options) {
  if (!model.editingSession || model.willKeepAlive && !options?.isArchiveAction) {
    return 0;
  }
  const currentEdits = model.editingSession.entries.get();
  const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);
  return undecidedEdits.length;
}
export {
  ChatEditorInput,
  ChatEditorInputSerializer,
  ChatEditorModel,
  shouldShowClearEditingSessionConfirmation,
  showClearEditingSessionConfirmation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldEhvc3RzXFxlZGl0b3JcXGNoYXRFZGl0b3JJbnB1dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IHRydW5jYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlybVJlc3VsdCwgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBJRWRpdG9ySWRlbnRpZmllciwgSUVkaXRvclNlcmlhbGl6ZXIsIElVbnR5cGVkRWRpdG9ySW5wdXQsIFZlcmJvc2l0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQsIElFZGl0b3JDbG9zZUhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWxSZWZlcmVuY2UsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdEVkaXRvclRpdGxlTWF4TGVuZ3RoLCBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25SZXNvdXJjZSwgZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2Vzc2lvbiwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uVXJpLCBnZXRDaGF0U2Vzc2lvblR5cGUsIGlzVW50aXRsZWRDaGF0U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDbGVhckVkaXRpbmdTZXNzaW9uQ29uZmlybWF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ2hhdEVkaXRvck9wdGlvbnMgfSBmcm9tICcuL2NoYXRFZGl0b3IuanMnO1xuXG5jb25zdCBDaGF0RWRpdG9ySWNvbiA9IHJlZ2lzdGVySWNvbignY2hhdC1lZGl0b3ItbGFiZWwtaWNvbicsIENvZGljb24uY2hhdFNwYXJrbGUsIG5scy5sb2NhbGl6ZSgnY2hhdEVkaXRvckxhYmVsSWNvbicsICdJY29uIG9mIHRoZSBjaGF0IGVkaXRvciBsYWJlbC4nKSk7XG5cbmV4cG9ydCBjbGFzcyBDaGF0RWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCBpbXBsZW1lbnRzIElFZGl0b3JDbG9zZUhhbmRsZXIge1xuXHRzdGF0aWMgcmVhZG9ubHkgVHlwZUlEOiBzdHJpbmcgPSAnd29ya2JlbmNoLmlucHV0LmNoYXRTZXNzaW9uJztcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvcklEOiBzdHJpbmcgPSAnd29ya2JlbmNoLmVkaXRvci5jaGF0U2Vzc2lvbic7XG5cblx0cHJpdmF0ZSBfc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgdXJpIG9mIHRoZSBzZXNzaW9uIHRoaXMgZWRpdG9yIGlucHV0IGlzIGFzc29jaWF0ZWQgd2l0aC5cblx0ICpcblx0ICogVGhpcyBzaG91bGQgYmUgcHJlZmVycmVkIG92ZXIgdXNpbmcgYHJlc291cmNlYCBkaXJlY3RseSwgYXMgaXQgaGFuZGxlcyBjYXNlcyB3aGVyZSBhIGNoYXQgZWRpdG9yIGJlY29tZXMgYSBzZXNzaW9uXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IHNlc3Npb25SZXNvdXJjZSgpOiBVUkkgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc2Vzc2lvblJlc291cmNlOyB9XG5cblx0cHJpdmF0ZSBkaWRUcmFuc2Zlck91dEVkaXRpbmdTZXNzaW9uID0gZmFsc2U7XG5cdHByaXZhdGUgY2FjaGVkSWNvbjogVGhlbWVJY29uIHwgVVJJIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxSZWYgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SUNoYXRNb2RlbFJlZmVyZW5jZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsQ2hhbmdlTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBnZXQgbW9kZWwoKTogSUNoYXRNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxSZWYudmFsdWU/Lm9iamVjdDtcblx0fVxuXG5cdHN0YXRpYyBnZXROZXdFZGl0b3JVcmkoKTogVVJJIHtcblx0XHRyZXR1cm4gQ2hhdEVkaXRvclVyaS5nZXROZXdFZGl0b3JVcmkoKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlc291cmNlOiBVUkksXG5cdFx0cmVhZG9ubHkgb3B0aW9uczogSUNoYXRFZGl0b3JPcHRpb25zLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZTogSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVDaGF0RWRpdG9yKSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBDaGF0RWRpdG9yVXJpLnBhcnNlKHJlc291cmNlKTtcblx0XHRcdGlmICghcGFyc2VkIHx8IHR5cGVvZiBwYXJzZWQgIT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjaGF0IFVSSScpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZUxvY2FsQ2hhdFNlc3Npb24pIHtcblx0XHRcdGNvbnN0IGxvY2FsU2Vzc2lvbklkID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHJlc291cmNlKTtcblx0XHRcdGlmICghbG9jYWxTZXNzaW9uSWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxvY2FsIGNoYXQgc2Vzc2lvbiBVUkknKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSByZXNvdXJjZTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBjbG9zZUhhbmRsZXIgPSB0aGlzO1xuXG5cdHNob3dDb25maXJtKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhISh0aGlzLm1vZGVsICYmIHNob3VsZFNob3dDbGVhckVkaXRpbmdTZXNzaW9uQ29uZmlybWF0aW9uKHRoaXMubW9kZWwpKTtcblx0fVxuXG5cdHRyYW5zZmVyT3V0RWRpdGluZ1Nlc3Npb24oKTogSUNoYXRFZGl0aW5nU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5kaWRUcmFuc2Zlck91dEVkaXRpbmdTZXNzaW9uID0gdHJ1ZTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbD8uZWRpdGluZ1Nlc3Npb247XG5cdH1cblxuXHRhc3luYyBjb25maXJtKGVkaXRvcnM6IFJlYWRvbmx5QXJyYXk8SUVkaXRvcklkZW50aWZpZXI+KTogUHJvbWlzZTxDb25maXJtUmVzdWx0PiB7XG5cdFx0aWYgKCF0aGlzLm1vZGVsPy5lZGl0aW5nU2Vzc2lvbiB8fCB0aGlzLmRpZFRyYW5zZmVyT3V0RWRpdGluZ1Nlc3Npb24gfHwgdGhpcy5nZXRTZXNzaW9uVHlwZSgpICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0cmV0dXJuIENvbmZpcm1SZXN1bHQuU0FWRTtcblx0XHR9XG5cblx0XHRjb25zdCB0aXRsZU92ZXJyaWRlID0gbmxzLmxvY2FsaXplKCdjaGF0RWRpdG9yQ29uZmlybVRpdGxlJywgXCJDbG9zZSBDaGF0IEVkaXRvclwiKTtcblx0XHRjb25zdCBtZXNzYWdlT3ZlcnJpZGUgPSBubHMubG9jYWxpemUoJ2NoYXQuc3RhcnRFZGl0aW5nLmNvbmZpcm1hdGlvbi5wZW5kaW5nLm1lc3NhZ2UuZGVmYXVsdCcsIFwiQ2xvc2luZyB0aGUgY2hhdCBlZGl0b3Igd2lsbCBlbmQgeW91ciBjdXJyZW50IGVkaXQgc2Vzc2lvbi5cIik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2hvd0NsZWFyRWRpdGluZ1Nlc3Npb25Db25maXJtYXRpb24odGhpcy5tb2RlbCwgdGhpcy5kaWFsb2dTZXJ2aWNlLCB7IHRpdGxlT3ZlcnJpZGUsIG1lc3NhZ2VPdmVycmlkZSB9KTtcblx0XHRyZXR1cm4gcmVzdWx0ID8gQ29uZmlybVJlc3VsdC5TQVZFIDogQ29uZmlybVJlc3VsdC5DQU5DRUw7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gQ2hhdEVkaXRvcklucHV0LkVkaXRvcklEO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7XG5cdFx0cmV0dXJuIHN1cGVyLmNhcGFiaWxpdGllcyB8IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkZvcmNlUmV2ZWFsIHwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2FuRHJvcEludG9FZGl0b3I7XG5cdH1cblxuXHRvdmVycmlkZSBjb3B5KCk6IEVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdG9ySW5wdXQsIENoYXRFZGl0b3JJbnB1dC5nZXROZXdFZGl0b3JVcmkoKSwge30pO1xuXHR9XG5cblx0b3ZlcnJpZGUgbWF0Y2hlcyhvdGhlcklucHV0OiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRpZiAoIShvdGhlcklucHV0IGluc3RhbmNlb2YgQ2hhdEVkaXRvcklucHV0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBpc0VxdWFsKHRoaXMuc2Vzc2lvblJlc291cmNlLCBvdGhlcklucHV0LnNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIENoYXRFZGl0b3JJbnB1dC5UeXBlSUQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXROYW1lKCk6IHN0cmluZyB7XG5cdFx0Ly8gSWYgd2UgaGF2ZSBhIHJlc29sdmVkIG1vZGVsLCB1c2UgaXRzIHRpdGxlXG5cdFx0aWYgKHRoaXMubW9kZWw/LnRpdGxlKSB7XG5cdFx0XHQvLyBPbmx5IHRydW5jYXRlIGlmIHRoZSBkZWZhdWx0IHRpdGxlIGlzIGJlaW5nIHVzZWQgKGRvbid0IHRydW5jYXRlIGN1c3RvbSB0aXRsZXMpXG5cdFx0XHRyZXR1cm4gdGhpcy5tb2RlbC5oYXNDdXN0b21UaXRsZSA/IHRoaXMubW9kZWwudGl0bGUgOiB0cnVuY2F0ZSh0aGlzLm1vZGVsLnRpdGxlLCBDaGF0RWRpdG9yVGl0bGVNYXhMZW5ndGgpO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlIGhhdmUgYSBzZXNzaW9uSWQgYnV0IG5vIHJlc29sdmVkIG1vZGVsLCB0cnkgdG8gZ2V0IHRoZSB0aXRsZSBmcm9tIHBlcnNpc3RlZCBzZXNzaW9uc1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdC8vIEZpcnN0IHRyeSB0aGUgYWN0aXZlIHNlc3Npb24gcmVnaXN0cnlcblx0XHRcdGNvbnN0IGV4aXN0aW5nU2Vzc2lvbiA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbih0aGlzLl9zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGV4aXN0aW5nU2Vzc2lvbj8udGl0bGUpIHtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nU2Vzc2lvbi50aXRsZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgbm90IGluIGFjdGl2ZSByZWdpc3RyeSwgdHJ5IHBlcnNpc3RlZCBzZXNzaW9uIGRhdGFcblx0XHRcdGNvbnN0IHBlcnNpc3RlZFRpdGxlID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uVGl0bGUodGhpcy5fc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChwZXJzaXN0ZWRUaXRsZSAmJiBwZXJzaXN0ZWRUaXRsZS50cmltKCkpIHsgLy8gT25seSB1c2Ugbm9uLWVtcHR5IHBlcnNpc3RlZCB0aXRsZXNcblx0XHRcdFx0cmV0dXJuIHBlcnNpc3RlZFRpdGxlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIGEgcHJlZmVycmVkIHRpdGxlIHdhcyBwcm92aWRlZCBpbiBvcHRpb25zLCB1c2UgaXRcblx0XHRpZiAodGhpcy5vcHRpb25zLnRpdGxlPy5wcmVmZXJyZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLm9wdGlvbnMudGl0bGUucHJlZmVycmVkO1xuXHRcdH1cblxuXHRcdC8vIEZhbGwgYmFjayB0byBkZWZhdWx0IG5hbWluZyBwYXR0ZXJuXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy50aXRsZT8uZmFsbGJhY2sgPz8gbmxzLmxvY2FsaXplKCdjaGF0RWRpdG9yTmFtZScsIFwiQ2hhdFwiKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFRpdGxlKHZlcmJvc2l0eT86IFZlcmJvc2l0eSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbmFtZSA9IHRoaXMuZ2V0TmFtZSgpO1xuXHRcdGlmICh2ZXJib3NpdHkgPT09IFZlcmJvc2l0eS5MT05HKSB7IC8vIFZlcmJvc2l0eSBMT05HIGlzIHVzZWQgZm9yIHRvb2x0aXBzXG5cdFx0XHRjb25zdCBzZXNzaW9uVHlwZURpc3BsYXlOYW1lID0gdGhpcy5nZXRTZXNzaW9uVHlwZURpc3BsYXlOYW1lKCk7XG5cdFx0XHRpZiAoc2Vzc2lvblR5cGVEaXNwbGF5TmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gYCR7bmFtZX0gfCAke3Nlc3Npb25UeXBlRGlzcGxheU5hbWV9YDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5hbWU7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlc3Npb25UeXBlRGlzcGxheU5hbWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMuZ2V0U2Vzc2lvblR5cGUoKTtcblx0XHRpZiAoc2Vzc2lvblR5cGUgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbnMgPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zKCk7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gY29udHJpYnV0aW9ucy5maW5kKGMgPT4gYy50eXBlID09PSBzZXNzaW9uVHlwZSk7XG5cdFx0cmV0dXJuIGNvbnRyaWJ1dGlvbj8uZGlzcGxheU5hbWU7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRJY29uKCk6IFRoZW1lSWNvbiB8IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzb2x2ZWRJY29uID0gdGhpcy5yZXNvbHZlSWNvbigpO1xuXHRcdGlmIChyZXNvbHZlZEljb24pIHtcblx0XHRcdHRoaXMuY2FjaGVkSWNvbiA9IHJlc29sdmVkSWNvbjtcblx0XHRcdHJldHVybiByZXNvbHZlZEljb247XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbCBiYWNrIHRvIGRlZmF1bHQgaWNvblxuXHRcdHJldHVybiBDaGF0RWRpdG9ySWNvbjtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUljb24oKTogVGhlbWVJY29uIHwgVVJJIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBUT0RPQG9zb3J0ZWdhLEByZWJvcm5peCBkb3VibGUgY2hlY2s6IENoYXQgU2Vzc2lvbiBJdGVtIGljb24gaXMgcmVzZXJ2ZWQgZm9yIGNoYXQgc2Vzc2lvbiBsaXN0IGFuZCBkZXByZWNhdGVkIGZvciBjaGF0IHNlc3Npb24gc3RhdHVzLiB0aHVzIGhlcmUgd2UgdXNlIHNlc3Npb24gdHlwZSBpY29uLiBXZSBtYXkgd2FudCB0byBzaG93IHN0YXR1cyBmb3IgdGhlIEVkaXRvciBUaXRsZS5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMuZ2V0U2Vzc2lvblR5cGUoKTtcblx0XHRpZiAoc2Vzc2lvblR5cGUgIT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHNlc3Npb25UeXBlKT8uaWNvbjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgY2hhdCBzZXNzaW9uIHR5cGUgZnJvbSBhIFVSSSwgb3Ige0BsaW5rY29kZSBsb2NhbENoYXRTZXNzaW9uVHlwZX0gaWYgbm90IHNwZWNpZmllZCBvciBjYW5ub3QgYmUgZGV0ZXJtaW5lZC5cblx0ICovXG5cdHB1YmxpYyBnZXRTZXNzaW9uVHlwZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBnZXRDaGF0U2Vzc2lvblR5cGUodGhpcy5fc2Vzc2lvblJlc291cmNlID8/IHRoaXMucmVzb3VyY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZSgpOiBQcm9taXNlPENoYXRFZGl0b3JNb2RlbCB8IG51bGw+IHtcblx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHRoaXMucmVzb3VyY2UucXVlcnkpO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uVHlwZSA9IHNlYXJjaFBhcmFtcy5nZXQoJ2NoYXRTZXNzaW9uVHlwZScpO1xuXHRcdGNvbnN0IGlucHV0VHlwZSA9IGNoYXRTZXNzaW9uVHlwZSA/PyB0aGlzLnJlc291cmNlLmF1dGhvcml0eTtcblxuXHRcdGlmICh0aGlzLl9zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMubW9kZWxSZWYudmFsdWUgPSBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ0NoYXRFZGl0b3JJbnB1dCNyZXNvbHZlJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0NoYXRFZGl0b3JJbnB1dF0gRmFpbGVkIHRvIGFjcXVpcmUgc2Vzc2lvbiAke3RoaXMuX3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWAsIGVycm9yKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLm1vZGVsICYmIGlzVW50aXRsZWRDaGF0U2Vzc2lvbih0aGlzLl9zZXNzaW9uUmVzb3VyY2UpICYmIGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLl9zZXNzaW9uUmVzb3VyY2UpICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0NoYXRFZGl0b3JJbnB1dF0gRmFsbGluZyBiYWNrIHRvIGEgbG9jYWwgY2hhdCBzZXNzaW9uIGJlY2F1c2UgJHt0aGlzLl9zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gY291bGQgbm90IGJlIGFjcXVpcmVkYCk7XG5cdFx0XHRcdHRoaXMubW9kZWxSZWYudmFsdWUgPSB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHsgY2FuVXNlVG9vbHM6ICFpbnB1dFR5cGUsIGRlYnVnT3duZXI6ICdDaGF0RWRpdG9ySW5wdXQjcmVzb2x2ZVVudGl0bGVkRmFsbGJhY2snIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5zaG91bGRSZXBsYWNlRW1wdHlMb2NhbFNlc3Npb24odGhpcy5fc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0UmVzb3VyY2UgPSBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25SZXNvdXJjZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UsIHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCksIHRoaXMuYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlZC5nZXQoKSk7XG5cdFx0XHRcdGlmIChnZXRDaGF0U2Vzc2lvblR5cGUoZGVmYXVsdFJlc291cmNlKSAhPT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdFx0XHRsZXQgbW9kZWxSZWY6IElDaGF0TW9kZWxSZWZlcmVuY2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdG1vZGVsUmVmID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihkZWZhdWx0UmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICdDaGF0RWRpdG9ySW5wdXQjcmVzb2x2ZURlZmF1bHRTZXNzaW9uJyk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbQ2hhdEVkaXRvcklucHV0XSBGYWlsZWQgdG8gYWNxdWlyZSBkZWZhdWx0IHNlc3Npb24gJHtkZWZhdWx0UmVzb3VyY2UudG9TdHJpbmcoKX1gLCBlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtb2RlbFJlZikge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gZGVmYXVsdFJlc291cmNlO1xuXHRcdFx0XHRcdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IG1vZGVsUmVmO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0NoYXRFZGl0b3JJbnB1dF0gS2VlcGluZyBsb2NhbCBjaGF0IHNlc3Npb24gYmVjYXVzZSBkZWZhdWx0IHNlc3Npb24gJHtkZWZhdWx0UmVzb3VyY2UudG9TdHJpbmcoKX0gY291bGQgbm90IGJlIGFjcXVpcmVkYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvciBsb2NhbCBzZXNzaW9uIG9ubHksIGlmIHdlIGZpbmQgbm8gZXhpc3Rpbmcgc2Vzc2lvbiwgY3JlYXRlIGEgbmV3IG9uZVxuXHRcdFx0aWYgKCF0aGlzLm1vZGVsICYmIExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZCh0aGlzLl9zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMubW9kZWxSZWYudmFsdWUgPSB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHsgY2FuVXNlVG9vbHM6IHRydWUsIGRlYnVnT3duZXI6ICdDaGF0RWRpdG9ySW5wdXQjcmVzb2x2ZU5ld0xvY2FsU2Vzc2lvbicgfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghdGhpcy5vcHRpb25zLnRhcmdldCkge1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5leHBsaWNpdFNlc3Npb25UeXBlID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsUmVmLnZhbHVlID0gdGhpcy5jaGF0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCB7IGNhblVzZVRvb2xzOiAhaW5wdXRUeXBlLCBkZWJ1Z093bmVyOiAnQ2hhdEVkaXRvcklucHV0I3Jlc29sdmVFeHBsaWNpdExvY2FsJyB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRSZXNvdXJjZSA9IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblJlc291cmNlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSwgdGhpcy5hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5lbmFibGVkLmdldCgpKTtcblx0XHRcdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShkZWZhdWx0UmVzb3VyY2UpID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHRcdHRoaXMubW9kZWxSZWYudmFsdWUgPSB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHsgY2FuVXNlVG9vbHM6ICFpbnB1dFR5cGUsIGRlYnVnT3duZXI6ICdDaGF0RWRpdG9ySW5wdXQjcmVzb2x2ZVVudGl0bGVkJyB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oZGVmYXVsdFJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnQ2hhdEVkaXRvcklucHV0I3Jlc29sdmVEZWZhdWx0VW50aXRsZWQnKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtDaGF0RWRpdG9ySW5wdXRdIEZhaWxlZCB0byBhY3F1aXJlIGRlZmF1bHQgc2Vzc2lvbiAke2RlZmF1bHRSZXNvdXJjZS50b1N0cmluZygpfWAsIGVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMubW9kZWwpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IGRlZmF1bHRSZXNvdXJjZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtDaGF0RWRpdG9ySW5wdXRdIEZhbGxpbmcgYmFjayB0byBhIGxvY2FsIGNoYXQgc2Vzc2lvbiBiZWNhdXNlICR7ZGVmYXVsdFJlc291cmNlLnRvU3RyaW5nKCl9IGNvdWxkIG5vdCBiZSBhY3F1aXJlZGApO1xuXHRcdFx0XHRcdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgeyBjYW5Vc2VUb29sczogIWlucHV0VHlwZSwgZGVidWdPd25lcjogJ0NoYXRFZGl0b3JJbnB1dCNyZXNvbHZlVW50aXRsZWRGYWxsYmFjaycgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aGlzLm9wdGlvbnMudGFyZ2V0LmRhdGEpIHtcblx0XHRcdHRoaXMubW9kZWxSZWYudmFsdWUgPSB0aGlzLmNoYXRTZXJ2aWNlLmxvYWRTZXNzaW9uRnJvbURhdGEodGhpcy5vcHRpb25zLnRhcmdldC5kYXRhLCAnQ2hhdEVkaXRvcklucHV0I3Jlc29sdmVJbXBvcnRlZERhdGEnKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMubW9kZWwgfHwgdGhpcy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IHRoaXMubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXG5cdFx0dGhpcy5fdHJhY2tNb2RlbENoYW5nZXMoKTtcblxuXHRcdC8vIENoZWNrIGlmIGljb24gaGFzIGNoYW5nZWQgYWZ0ZXIgbW9kZWwgcmVzb2x1dGlvblxuXHRcdGNvbnN0IG5ld0ljb24gPSB0aGlzLnJlc29sdmVJY29uKCk7XG5cdFx0aWYgKG5ld0ljb24gJiYgKCF0aGlzLmNhY2hlZEljb24gfHwgIXRoaXMuaWNvbnNFcXVhbCh0aGlzLmNhY2hlZEljb24sIG5ld0ljb24pKSkge1xuXHRcdFx0dGhpcy5jYWNoZWRJY29uID0gbmV3SWNvbjtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUxhYmVsLmZpcmUoKTtcblxuXHRcdHJldHVybiB0aGlzLl9yZWdpc3RlcihuZXcgQ2hhdEVkaXRvck1vZGVsKHRoaXMubW9kZWwpKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkUmVwbGFjZUVtcHR5TG9jYWxTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIExvY2FsQ2hhdFNlc3Npb25VcmkuaXNMb2NhbFNlc3Npb24oc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0JiYgdGhpcy5vcHRpb25zLmV4cGxpY2l0U2Vzc2lvblR5cGUgIT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlXG5cdFx0XHQmJiAhIXRoaXMubW9kZWxcblx0XHRcdCYmICF0aGlzLm1vZGVsLmhhc1JlcXVlc3RzXG5cdFx0XHQmJiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSwgdGhpcy5hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5lbmFibGVkLmdldCgpKSAhPT0gbG9jYWxDaGF0U2Vzc2lvblR5cGU7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgZWRpdG9yIGlucHV0IHRvIHRyYWNrIGEgbmV3IG1vZGVsLiBDYWxsZWQgd2hlbiB0aGUgd2lkZ2V0IHN3YXBzXG5cdCAqIGZyb20gYW4gdW50aXRsZWQgc2Vzc2lvbiB0byBhIHJlYWwgc2Vzc2lvbi5cblx0ICovXG5cdHVwZGF0ZU1vZGVsKG1vZGVsOiBJQ2hhdE1vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gbW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMubW9kZWxSZWYudmFsdWUgPSB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVFeGlzdGluZ1Nlc3Npb24obW9kZWwuc2Vzc2lvblJlc291cmNlLCAnQ2hhdEVkaXRvcklucHV0I3VwZGF0ZU1vZGVsJyk7XG5cdFx0dGhpcy5fdHJhY2tNb2RlbENoYW5nZXMoKTtcblx0XHR0aGlzLmNhY2hlZEljb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF90cmFja01vZGVsQ2hhbmdlcygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxDaGFuZ2VMaXN0ZW5lci52YWx1ZSA9IHRoaXMubW9kZWwub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5jYWNoZWRJY29uID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYWJlbC5maXJlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGljb25zRXF1YWwoYTogVGhlbWVJY29uIHwgVVJJLCBiOiBUaGVtZUljb24gfCBVUkkpOiBib29sZWFuIHtcblx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGEpICYmIFRoZW1lSWNvbi5pc1RoZW1lSWNvbihiKSkge1xuXHRcdFx0cmV0dXJuIGEuaWQgPT09IGIuaWQ7XG5cdFx0fVxuXHRcdGlmIChhIGluc3RhbmNlb2YgVVJJICYmIGIgaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdHJldHVybiBhLnRvU3RyaW5nKCkgPT09IGIudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0b3JNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9pc1Jlc29sdmVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbW9kZWw6IElDaGF0TW9kZWxcblx0KSB7IHN1cGVyKCk7IH1cblxuXHRhc3luYyByZXNvbHZlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2lzUmVzb2x2ZWQgPSB0cnVlO1xuXHR9XG5cblx0aXNSZXNvbHZlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNSZXNvbHZlZDtcblx0fVxuXG5cdGlzRGlzcG9zZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQ7XG5cdH1cbn1cblxuXG5uYW1lc3BhY2UgQ2hhdEVkaXRvclVyaSB7XG5cblx0Y29uc3Qgc2NoZW1lID0gU2NoZW1hcy52c2NvZGVDaGF0RWRpdG9yO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBnZXROZXdFZGl0b3JVcmkoKTogVVJJIHtcblx0XHRjb25zdCBoYW5kbGUgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxZTkpO1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZSwgcGF0aDogYGNoYXQtJHtoYW5kbGV9YCB9KTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBwYXJzZShyZXNvdXJjZTogVVJJKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lICE9PSBzY2hlbWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2ggPSByZXNvdXJjZS5wYXRoLm1hdGNoKC9jaGF0LShcXGQrKS8pO1xuXHRcdGNvbnN0IGhhbmRsZVN0ciA9IG1hdGNoPy5bMV07XG5cdFx0aWYgKHR5cGVvZiBoYW5kbGVTdHIgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhbmRsZSA9IHBhcnNlSW50KGhhbmRsZVN0cik7XG5cdFx0aWYgKGlzTmFOKGhhbmRsZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhhbmRsZTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRDaGF0RWRpdG9ySW5wdXQge1xuXHRyZWFkb25seSBvcHRpb25zOiBJQ2hhdEVkaXRvck9wdGlvbnM7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRvcklucHV0U2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblx0Y2FuU2VyaWFsaXplKGlucHV0OiBFZGl0b3JJbnB1dCk6IGlucHV0IGlzIENoYXRFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIGlucHV0IGluc3RhbmNlb2YgQ2hhdEVkaXRvcklucHV0ICYmICEhaW5wdXQuc2Vzc2lvblJlc291cmNlO1xuXHR9XG5cblx0c2VyaWFsaXplKGlucHV0OiBFZGl0b3JJbnB1dCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmNhblNlcmlhbGl6ZShpbnB1dCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2JqOiBJU2VyaWFsaXplZENoYXRFZGl0b3JJbnB1dCA9IHtcblx0XHRcdG9wdGlvbnM6IGlucHV0Lm9wdGlvbnMsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGlucHV0LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSxcblxuXHRcdH07XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KG9iaik7XG5cdH1cblxuXHRkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJpYWxpemVkRWRpdG9yOiBzdHJpbmcpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIE9sZCBpbnB1dHMgaGF2ZSBhIHNlc3Npb24gaWQgZm9yIGxvY2FsIHNlc3Npb25cblx0XHRcdC8vIFVzZSByZXZpdmUgdG8gcHJvcGVybHkgcmVzdG9yZSBVUklzIGFuZCBvdGhlciBzcGVjaWFsIG9iamVjdHMgaW4gb3B0aW9ucy50YXJnZXQuZGF0YVxuXHRcdFx0Y29uc3QgcGFyc2VkID0gcmV2aXZlKEpTT04ucGFyc2Uoc2VyaWFsaXplZEVkaXRvcikpO1xuXG5cdFx0XHQvLyBGaXJzdCBpZiB3ZSBoYXZlIGEgbW9kZXJuIHNlc3Npb24gcmVzb3VyY2UsIHVzZSB0aGF0XG5cdFx0XHRpZiAocGFyc2VkLnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucmV2aXZlKHBhcnNlZC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRvcklucHV0LCBzZXNzaW9uUmVzb3VyY2UsIHBhcnNlZC5vcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlIGNoZWNrIHRvIHNlZSBpZiB3ZSdyZSBhIGNoYXQgZWRpdG9yIHdpdGggYSBsb2NhbCBzZXNzaW9uIGlkXG5cdFx0XHRsZXQgcmVzb3VyY2UgPSBVUkkucmV2aXZlKHBhcnNlZC5yZXNvdXJjZSk7XG5cdFx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZUNoYXRFZGl0b3IgJiYgcGFyc2VkLnNlc3Npb25JZCkge1xuXHRcdFx0XHRyZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihwYXJzZWQuc2Vzc2lvbklkKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0b3JJbnB1dCwgcmVzb3VyY2UsIHBhcnNlZC5vcHRpb25zKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzaG93Q2xlYXJFZGl0aW5nU2Vzc2lvbkNvbmZpcm1hdGlvbihtb2RlbDogSUNoYXRNb2RlbCwgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsIG9wdGlvbnM/OiBJQ2xlYXJFZGl0aW5nU2Vzc2lvbkNvbmZpcm1hdGlvbk9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0Y29uc3QgdW5kZWNpZGVkRWRpdHMgPSBzaG91bGRTaG93Q2xlYXJFZGl0aW5nU2Vzc2lvbkNvbmZpcm1hdGlvbihtb2RlbCwgb3B0aW9ucyk7XG5cdGlmICghdW5kZWNpZGVkRWRpdHMpIHtcblx0XHRyZXR1cm4gdHJ1ZTsgLy8gc2FmZSB0byBkaXNwb3NlIHdpdGhvdXQgY29uZmlybWF0aW9uXG5cdH1cblxuXHRjb25zdCBkZWZhdWx0UGhyYXNlID0gbmxzLmxvY2FsaXplKCdjaGF0LnN0YXJ0RWRpdGluZy5jb25maXJtYXRpb24ucGVuZGluZy5tZXNzYWdlLmRlZmF1bHQxJywgXCJTdGFydGluZyBhIG5ldyBjaGF0IHdpbGwgZW5kIHlvdXIgY3VycmVudCBlZGl0IHNlc3Npb24uXCIpO1xuXHRjb25zdCBkZWZhdWx0VGl0bGUgPSBubHMubG9jYWxpemUoJ2NoYXQuc3RhcnRFZGl0aW5nLmNvbmZpcm1hdGlvbi50aXRsZScsIFwiU3RhcnQgbmV3IGNoYXQ/XCIpO1xuXHRjb25zdCBwaHJhc2UgPSBvcHRpb25zPy5tZXNzYWdlT3ZlcnJpZGUgPz8gZGVmYXVsdFBocmFzZTtcblx0Y29uc3QgdGl0bGUgPSBvcHRpb25zPy50aXRsZU92ZXJyaWRlID8/IGRlZmF1bHRUaXRsZTtcblxuXHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdHRpdGxlLFxuXHRcdG1lc3NhZ2U6IHBocmFzZSArICcgJyArIG5scy5sb2NhbGl6ZSgnY2hhdC5zdGFydEVkaXRpbmcuY29uZmlybWF0aW9uLnBlbmRpbmcubWVzc2FnZS4yJywgXCJEbyB5b3Ugd2FudCB0byBrZWVwIHBlbmRpbmcgZWRpdHMgdG8gezB9IGZpbGVzP1wiLCB1bmRlY2lkZWRFZGl0cyksXG5cdFx0dHlwZTogJ2luZm8nLFxuXHRcdGNhbmNlbEJ1dHRvbjogdHJ1ZSxcblx0XHRidXR0b25zOiBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NoYXQuc3RhcnRFZGl0aW5nLmNvbmZpcm1hdGlvbi5hY2NlcHRFZGl0cycsIFwiS2VlcCAmIENvbnRpbnVlXCIpLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCBtb2RlbC5lZGl0aW5nU2Vzc2lvbiEuYWNjZXB0KCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NoYXQuc3RhcnRFZGl0aW5nLmNvbmZpcm1hdGlvbi5kaXNjYXJkRWRpdHMnLCBcIlVuZG8gJiBDb250aW51ZVwiKSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgbW9kZWwuZWRpdGluZ1Nlc3Npb24hLnJlamVjdCgpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XSxcblx0fSk7XG5cblx0cmV0dXJuIEJvb2xlYW4ocmVzdWx0KTtcbn1cblxuLyoqIFJldHVybnMgdGhlIG51bWJlciBvZiBmaWxlcyBpbiB0aGUgIG1vZGVsJ3MgbW9kaWZpY2F0aW9ucyB0aGF0IG5lZWQgYSBwcm9tcHQgYmVmb3JlIHNhdmluZyAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFNob3dDbGVhckVkaXRpbmdTZXNzaW9uQ29uZmlybWF0aW9uKG1vZGVsOiBJQ2hhdE1vZGVsLCBvcHRpb25zPzogSUNsZWFyRWRpdGluZ1Nlc3Npb25Db25maXJtYXRpb25PcHRpb25zKTogbnVtYmVyIHtcblx0aWYgKCFtb2RlbC5lZGl0aW5nU2Vzc2lvbiB8fCAobW9kZWwud2lsbEtlZXBBbGl2ZSAmJiAhb3B0aW9ucz8uaXNBcmNoaXZlQWN0aW9uKSkge1xuXHRcdHJldHVybiAwOyAvLyBzYWZlIHRvIGRpc3Bvc2Ugd2l0aG91dCBjb25maXJtYXRpb25cblx0fVxuXG5cdGNvbnN0IGN1cnJlbnRFZGl0cyA9IG1vZGVsLmVkaXRpbmdTZXNzaW9uLmVudHJpZXMuZ2V0KCk7XG5cdGNvbnN0IHVuZGVjaWRlZEVkaXRzID0gY3VycmVudEVkaXRzLmZpbHRlcigoZWRpdCkgPT4gZWRpdC5zdGF0ZS5nZXQoKSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCk7XG5cdHJldHVybiB1bmRlY2lkZWRFZGl0cy5sZW5ndGg7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixZQUFZLFNBQVM7QUFDckIsU0FBUyxlQUFlLHNCQUFzQjtBQUM5QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHlCQUFvRixpQkFBaUI7QUFDOUcsU0FBUyxtQkFBd0M7QUFDakQsU0FBOEIsb0JBQW9CO0FBQ2xELFNBQVMsc0JBQXNCLDRCQUE0QjtBQUMzRCxTQUFTLG1CQUFtQiwwQkFBMEIsa0NBQWtDLG9DQUFvQztBQUM1SCxTQUE4Qiw4QkFBOEI7QUFFNUQsU0FBUyxxQkFBcUIsb0JBQW9CLDZCQUE2QjtBQUkvRSxNQUFNLGlCQUFpQixhQUFhLDBC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
