import { asArray } from "../../../../../base/common/arrays.js";
import { DeferredPromise, isThenable } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { autorun, observableValue } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isObject } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { AbstractGotoSymbolQuickAccessProvider } from "../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IListService } from "../../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { resolveCommandsContext } from "../../../../browser/parts/editor/editorCommandsContext.js";
import { ResourceContextKey } from "../../../../common/contextkeys.js";
import { EditorResourceAccessor, isEditorCommandsContext, isEditorInput, SideBySideEditor } from "../../../../common/editor.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { BrowserEditorInput } from "../../../browserView/common/browserEditorInput.js";
import { ExplorerFolderContext } from "../../../files/common/files.js";
import { CTX_INLINE_CHAT_V2_ENABLED } from "../../../inlineChat/common/inlineChat.js";
import { AnythingQuickAccessProvider } from "../../../search/browser/anythingQuickAccess.js";
import { isSearchTreeFileMatch, isSearchTreeMatch } from "../../../search/browser/searchTreeModel/searchTreeCommon.js";
import { SymbolsQuickAccessProvider } from "../../../search/browser/symbolsQuickAccess.js";
import { SearchContext } from "../../../search/common/constants.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { OmittedState } from "../../common/attachments/chatVariableEntries.js";
import { ChatAgentLocation, isSupportedChatFileScheme } from "../../common/constants.js";
import { IChatWidgetService, IQuickChatService } from "../chat.js";
import { IChatContextPickService, isChatContextPickerPickItem } from "../attachments/chatContextPickService.js";
import { IChatAttachmentResolveService } from "../attachments/chatAttachmentResolveService.js";
import { isQuickChat } from "../widget/chatWidget.js";
import { resizeImage } from "../chatImageUtils.js";
import { registerPromptActions } from "../promptSyntax/promptFileActions.js";
import { CHAT_CATEGORY } from "./chatActions.js";
import { registerCreatePluginAction } from "./createPluginAction.js";
function registerChatContextActions() {
  const store = new DisposableStore();
  store.add(registerAction2(AttachContextAction));
  store.add(registerAction2(AttachFileToChatAction));
  store.add(registerAction2(AttachFolderToChatAction));
  store.add(registerAction2(AttachSelectionToChatAction));
  store.add(registerAction2(AttachSearchResultAction));
  store.add(registerAction2(AttachPinnedEditorsToChatAction));
  store.add(registerCreatePluginAction());
  registerPromptActions();
  return store;
}
async function withChatView(accessor) {
  const chatWidgetService = accessor.get(IChatWidgetService);
  const lastFocusedWidget = chatWidgetService.lastFocusedWidget;
  if (!lastFocusedWidget || lastFocusedWidget.location === ChatAgentLocation.Chat) {
    return chatWidgetService.revealWidget();
  }
  return lastFocusedWidget;
}
class AttachResourceAction extends Action2 {
  async run(accessor, ...args) {
    const instaService = accessor.get(IInstantiationService);
    const widget = await instaService.invokeFunction(withChatView);
    if (!widget) {
      return;
    }
    return instaService.invokeFunction(this.runWithWidget.bind(this), widget, ...args);
  }
  _getResources(accessor, ...args) {
    const editorService = accessor.get(IEditorService);
    const contexts = isEditorCommandsContext(args[1]) ? this._getEditorResources(accessor, ...args) : Array.isArray(args[1]) ? args[1] : [args[0]];
    const files = [];
    for (const context of contexts) {
      let uri;
      if (URI.isUri(context)) {
        uri = context;
      } else if (isSearchTreeFileMatch(context)) {
        uri = context.resource;
      } else if (isSearchTreeMatch(context)) {
        uri = context.parent().resource;
      } else if (!context && editorService.activeTextEditorControl) {
        uri = EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
      }
      if (uri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(uri.scheme)) {
        files.push(uri);
      }
    }
    return files;
  }
  _getEditorResources(accessor, ...args) {
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
    return resolvedContext.groupedEditors.flatMap((groupedEditor) => groupedEditor.editors).map((editor) => EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY })).filter((uri) => uri !== void 0);
  }
}
const _AttachFileToChatAction = class _AttachFileToChatAction extends AttachResourceAction {
  constructor() {
    super({
      id: _AttachFileToChatAction.ID,
      title: localize2("workbench.action.chat.attachFile.label", "Add File to Chat"),
      category: CHAT_CATEGORY,
      icon: Codicon.attach,
      precondition: ChatContextKeys.enabled,
      f1: true,
      menu: [{
        id: MenuId.SearchContext,
        group: "z_chat",
        order: 1,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, SearchContext.FileMatchOrMatchFocusKey, SearchContext.SearchResultHeaderFocused.negate())
      }, {
        id: MenuId.ExplorerContext,
        group: "5_chat",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ExplorerFolderContext.negate(),
          ContextKeyExpr.or(
            ResourceContextKey.Scheme.isEqualTo(Schemas.file),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote)
          )
        )
      }, {
        id: MenuId.EditorTitleContext,
        group: "2_chat",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ContextKeyExpr.or(
            ResourceContextKey.Scheme.isEqualTo(Schemas.file),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote)
          )
        )
      }, {
        id: MenuId.EditorContext,
        group: "1_chat",
        order: 2,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          EditorContextKeys.hasNonEmptySelection.negate(),
          ContextKeyExpr.or(
            ResourceContextKey.Scheme.isEqualTo(Schemas.file),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote),
            ResourceContextKey.Scheme.isEqualTo(Schemas.untitled),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeUserData)
          )
        )
      }, {
        id: MenuId.InlineChatEditorAffordance,
        group: "0_chat",
        order: 3,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection.negate())
      }, {
        id: MenuId.ChatEditorInlineMenu,
        group: "0_chat",
        order: 3,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection.negate())
      }]
    });
  }
  async runWithWidget(accessor, widget, ...args) {
    const files = this._getResources(accessor, ...args);
    if (!files.length) {
      return;
    }
    if (widget) {
      widget.focusInput();
      for (const file of files) {
        widget.attachmentModel.addFile(file);
      }
    }
  }
};
_AttachFileToChatAction.ID = "workbench.action.chat.attachFile";
let AttachFileToChatAction = _AttachFileToChatAction;
const _AttachFolderToChatAction = class _AttachFolderToChatAction extends AttachResourceAction {
  constructor() {
    super({
      id: _AttachFolderToChatAction.ID,
      title: localize2("workbench.action.chat.attachFolder.label", "Add Folder to Chat"),
      category: CHAT_CATEGORY,
      f1: false,
      menu: {
        id: MenuId.ExplorerContext,
        group: "5_chat",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ExplorerFolderContext,
          ContextKeyExpr.or(
            ResourceContextKey.Scheme.isEqualTo(Schemas.file),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote)
          )
        )
      }
    });
  }
  async runWithWidget(accessor, widget, ...args) {
    const folders = this._getResources(accessor, ...args);
    if (!folders.length) {
      return;
    }
    if (widget) {
      widget.focusInput();
      for (const folder of folders) {
        widget.attachmentModel.addFolder(folder);
      }
    }
  }
};
_AttachFolderToChatAction.ID = "workbench.action.chat.attachFolder";
let AttachFolderToChatAction = _AttachFolderToChatAction;
const _AttachPinnedEditorsToChatAction = class _AttachPinnedEditorsToChatAction extends Action2 {
  constructor() {
    super({
      id: _AttachPinnedEditorsToChatAction.ID,
      title: localize2("workbench.action.chat.attachPinnedEditors.label", "Add Pinned Editors to Chat"),
      category: CHAT_CATEGORY,
      precondition: ChatContextKeys.enabled,
      f1: true
    });
  }
  async run(accessor) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const instaService = accessor.get(IInstantiationService);
    const widget = await instaService.invokeFunction(withChatView);
    if (!widget) {
      return;
    }
    const files = [];
    for (const group of editorGroupsService.groups) {
      for (const editor of group.editors) {
        if (group.isPinned(editor)) {
          const uri = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
          if (uri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(uri.scheme)) {
            files.push(uri);
          }
        }
      }
    }
    if (!files.length) {
      return;
    }
    widget.focusInput();
    for (const file of files) {
      widget.attachmentModel.addFile(file);
    }
  }
};
_AttachPinnedEditorsToChatAction.ID = "workbench.action.chat.attachPinnedEditors";
let AttachPinnedEditorsToChatAction = _AttachPinnedEditorsToChatAction;
const _AttachSelectionToChatAction = class _AttachSelectionToChatAction extends Action2 {
  constructor() {
    super({
      id: _AttachSelectionToChatAction.ID,
      title: localize2("workbench.action.chat.attachSelection.label", "Add Selection to Chat"),
      category: CHAT_CATEGORY,
      icon: Codicon.attach,
      f1: true,
      precondition: ChatContextKeys.enabled,
      menu: [{
        id: MenuId.EditorContext,
        group: "1_chat",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          EditorContextKeys.hasNonEmptySelection,
          ContextKeyExpr.or(
            ResourceContextKey.Scheme.isEqualTo(Schemas.file),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote),
            ResourceContextKey.Scheme.isEqualTo(Schemas.untitled),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeUserData)
          )
        )
      }, {
        id: MenuId.InlineChatEditorAffordance,
        group: "0_chat",
        order: 2,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection)
      }, {
        id: MenuId.ChatEditorInlineMenu,
        group: "0_chat",
        order: 2,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection)
      }]
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async run(accessor, ...args) {
    const editorService = accessor.get(IEditorService);
    const widget = await accessor.get(IInstantiationService).invokeFunction(withChatView);
    if (!widget) {
      return;
    }
    const [_, matches] = args;
    if (matches && matches.length > 0) {
      const uris = /* @__PURE__ */ new Map();
      for (const match of matches) {
        if (isSearchTreeFileMatch(match)) {
          uris.set(match.resource, void 0);
        } else {
          const context = { uri: match._parent.resource, range: match._range };
          const range = uris.get(context.uri);
          if (!range || range.startLineNumber !== context.range.startLineNumber && range.endLineNumber !== context.range.endLineNumber) {
            uris.set(context.uri, context.range);
            widget.attachmentModel.addFile(context.uri, context.range);
          }
        }
      }
      for (const uri of uris) {
        const [resource, range] = uri;
        if (!range) {
          widget.attachmentModel.addFile(resource);
        }
      }
    } else {
      const activeEditor = editorService.activeTextEditorControl;
      const activeUri = EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
      if (activeEditor && activeUri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
        const selection = activeEditor.getSelection();
        if (selection) {
          widget.focusInput();
          const range = selection.isEmpty() ? new Range(selection.startLineNumber, 1, selection.startLineNumber + 1, 1) : selection;
          widget.attachmentModel.addFile(activeUri, range);
        }
      }
    }
  }
};
_AttachSelectionToChatAction.ID = "workbench.action.chat.attachSelection";
let AttachSelectionToChatAction = _AttachSelectionToChatAction;
const _AttachSearchResultAction = class _AttachSearchResultAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.insertSearchResults",
      title: localize2("chat.insertSearchResults", "Add Search Results to Chat"),
      category: CHAT_CATEGORY,
      f1: false,
      menu: [{
        id: MenuId.SearchContext,
        group: "z_chat",
        order: 3,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          SearchContext.SearchResultHeaderFocused
        )
      }]
    });
  }
  async run(accessor) {
    const logService = accessor.get(ILogService);
    const widget = await accessor.get(IInstantiationService).invokeFunction(withChatView);
    if (!widget) {
      logService.trace("InsertSearchResultAction: no chat view available");
      return;
    }
    const editor = widget.inputEditor;
    const originalRange = editor.getSelection() ?? editor.getModel()?.getFullModelRange().collapseToEnd();
    if (!originalRange) {
      logService.trace("InsertSearchResultAction: no selection");
      return;
    }
    let insertText = `#${_AttachSearchResultAction.Name}`;
    const varRange = new Range(originalRange.startLineNumber, originalRange.startColumn, originalRange.endLineNumber, originalRange.startLineNumber + insertText.length);
    const model = editor.getModel();
    if (model && model.getValueInRange(new Range(originalRange.startLineNumber, originalRange.startColumn - 1, originalRange.startLineNumber, originalRange.startColumn)) !== " ") {
      insertText = " " + insertText;
    }
    const success = editor.executeEdits("chatInsertSearch", [{ range: varRange, text: insertText + " " }]);
    if (!success) {
      logService.trace(`InsertSearchResultAction: failed to insert "${insertText}"`);
      return;
    }
  }
};
_AttachSearchResultAction.Name = "searchResults";
let AttachSearchResultAction = _AttachSearchResultAction;
function isIContextPickItemItem(obj) {
  return isObject(obj) && typeof obj.kind === "string" && obj.kind === "contextPick";
}
function isIGotoSymbolQuickPickItem(obj) {
  return isObject(obj) && typeof obj.symbolName === "string" && !!obj.uri && !!obj.range;
}
function isIQuickPickItemWithResource(obj) {
  return isObject(obj) && URI.isUri(obj.resource);
}
function isAnythingQuickPickItemWithBrowserEditor(obj) {
  const editor = obj?.editor;
  return editor instanceof BrowserEditorInput || !!editor && !isEditorInput(editor) && editor.options?.override === BrowserEditorInput.EDITOR_ID;
}
class AttachContextAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.attachContext",
      title: localize2("workbench.action.chat.attachContext.label.2", "Add Context..."),
      icon: Codicon.addCompact,
      category: CHAT_CATEGORY,
      keybinding: {
        when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
        primary: KeyMod.CtrlCmd | KeyCode.Slash,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [{
        when: ContextKeyExpr.and(
          ChatContextKeys.inQuickChat.negate(),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ContextKeyExpr.or(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.agentSupportsAttachments
          )
        ),
        id: MenuId.ChatInput,
        group: "navigation",
        order: -1
      }, {
        when: ContextKeyExpr.and(
          ChatContextKeys.inQuickChat.negate(),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditorInline),
          CTX_INLINE_CHAT_V2_ENABLED,
          ContextKeyExpr.or(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.agentSupportsAttachments
          )
        ),
        id: MenuId.ChatInput,
        group: "navigation",
        order: 2
      }, {
        when: ContextKeyExpr.and(
          ChatContextKeys.inQuickChat,
          ContextKeyExpr.or(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.agentSupportsAttachments
          )
        ),
        id: MenuId.ChatExecute,
        group: "navigation",
        order: -1
      }]
    });
  }
  async run(accessor, ...args) {
    const instantiationService = accessor.get(IInstantiationService);
    const widgetService = accessor.get(IChatWidgetService);
    const contextKeyService = accessor.get(IContextKeyService);
    const keybindingService = accessor.get(IKeybindingService);
    const contextPickService = accessor.get(IChatContextPickService);
    const context = args[0];
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    const quickPickItems = [];
    for (const item of contextPickService.items) {
      if (item.isEnabled && !await item.isEnabled(widget)) {
        continue;
      }
      quickPickItems.push({
        kind: "contextPick",
        item,
        label: item.label,
        iconClass: ThemeIcon.asClassName(item.icon),
        keybinding: item.commandId ? keybindingService.lookupKeybinding(item.commandId, contextKeyService) : void 0
      });
    }
    const quickInputService = await (context?.contextPicker ?? widget.contextPicker)?.prepare();
    instantiationService.invokeFunction(this._show.bind(this), widget, quickPickItems, context?.placeholder, quickInputService);
  }
  _show(accessor, widget, additionPicks, placeholder, quickInputServiceOverride) {
    const quickInputService = quickInputServiceOverride ?? accessor.get(IQuickInputService);
    const quickChatService = accessor.get(IQuickChatService);
    const instantiationService = accessor.get(IInstantiationService);
    const commandService = accessor.get(ICommandService);
    const providerOptions = {
      filter: (pick) => {
        if (isIQuickPickItemWithResource(pick) && pick.resource) {
          return instantiationService.invokeFunction((accessor2) => isSupportedChatFileScheme(accessor2, pick.resource.scheme));
        }
        return true;
      },
      additionPicks,
      handleAccept: async (item, isBackgroundAccept) => {
        if (isIContextPickItemItem(item)) {
          let isDone = true;
          if (item.item.type === "valuePick") {
            this._handleContextPick(item.item, widget);
          } else if (item.item.type === "pickerPick") {
            isDone = await this._handleContextPickerItem(quickInputService, commandService, item.item, widget);
          }
          if (!isDone) {
            instantiationService.invokeFunction(this._show.bind(this), widget, additionPicks, placeholder, quickInputServiceOverride);
            return;
          }
        } else {
          instantiationService.invokeFunction(this._handleQPPick.bind(this), widget, isBackgroundAccept, item);
        }
        if (isQuickChat(widget)) {
          quickChatService.open();
        }
      }
    };
    quickInputService.quickAccess.show("", {
      enabledProviderPrefixes: [
        AnythingQuickAccessProvider.PREFIX,
        SymbolsQuickAccessProvider.PREFIX,
        AbstractGotoSymbolQuickAccessProvider.PREFIX
      ],
      placeholder: placeholder ?? localize("chatContext.attach.placeholder", "Search attachments"),
      providerOptions
    });
  }
  async _handleQPPick(accessor, widget, isInBackground, pick) {
    const fileService = accessor.get(IFileService);
    const textModelService = accessor.get(ITextModelService);
    const chatAttachmentResolveService = accessor.get(IChatAttachmentResolveService);
    const toAttach = [];
    if (isAnythingQuickPickItemWithBrowserEditor(pick)) {
      const entry = await chatAttachmentResolveService.resolveEditorAttachContext(pick.editor);
      if (entry) {
        toAttach.push(entry);
      }
    } else if (isIQuickPickItemWithResource(pick) && pick.resource) {
      if (/\.(png|jpg|jpeg|bmp|gif|tiff)$/i.test(pick.resource.path)) {
        if (URI.isUri(pick.resource)) {
          const readFile = await fileService.readFile(pick.resource);
          const resizedImage = await resizeImage(readFile.value.buffer);
          toAttach.push({
            id: pick.resource.toString(),
            name: pick.label,
            fullName: pick.label,
            value: resizedImage,
            kind: "image",
            references: [{ reference: pick.resource, kind: "reference" }]
          });
        }
      } else if (pick.resource.scheme === Schemas.vscodeBrowser) {
        const entry = await chatAttachmentResolveService.resolveEditorAttachContext({ resource: pick.resource });
        if (entry) {
          toAttach.push(entry);
        }
      } else {
        let omittedState = OmittedState.NotOmitted;
        try {
          const createdModel = await textModelService.createModelReference(pick.resource);
          createdModel.dispose();
        } catch {
          omittedState = OmittedState.Full;
        }
        toAttach.push({
          kind: "file",
          id: pick.resource.toString(),
          value: pick.resource,
          name: pick.label,
          omittedState
        });
      }
    } else if (isIGotoSymbolQuickPickItem(pick) && pick.uri && pick.range) {
      toAttach.push({
        kind: "generic",
        id: JSON.stringify({ uri: pick.uri, range: pick.range.decoration }),
        value: { uri: pick.uri, range: pick.range.decoration },
        fullName: pick.label,
        name: pick.symbolName
      });
    }
    widget.attachmentModel.addContext(...toAttach);
    if (!isInBackground) {
      widget.focusInput();
    }
  }
  async _handleContextPick(item, widget) {
    const value = await item.asAttachment(widget);
    if (Array.isArray(value)) {
      widget.attachmentModel.addContext(...value);
    } else if (value) {
      widget.attachmentModel.addContext(value);
    }
  }
  async _handleContextPickerItem(quickInputService, commandService, item, widget) {
    const pickerConfig = item.asPicker(widget);
    const store = new DisposableStore();
    const goBackItem = {
      label: localize("goBack", "Go back \u21A9"),
      alwaysShow: true
    };
    const configureItem = pickerConfig.configure ? {
      label: pickerConfig.configure.label,
      commandId: pickerConfig.configure.commandId,
      alwaysShow: true
    } : void 0;
    const extraPicks = [{ type: "separator" }];
    if (configureItem) {
      extraPicks.push(configureItem);
    }
    extraPicks.push(goBackItem);
    const qp = store.add(quickInputService.createQuickPick({ useSeparators: true }));
    const cts = new CancellationTokenSource();
    store.add(qp.onDidHide(() => cts.cancel()));
    store.add(toDisposable(() => cts.dispose(true)));
    qp.placeholder = pickerConfig.placeholder;
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    qp.canAcceptInBackground = true;
    qp.busy = true;
    qp.show();
    if (isThenable(pickerConfig.picks)) {
      const items = await pickerConfig.picks.then((value) => {
        return [].concat(value, extraPicks);
      });
      qp.items = items;
      qp.busy = false;
    } else {
      const query = observableValue("attachContext.query", qp.value);
      store.add(qp.onDidChangeValue(() => query.set(qp.value, void 0)));
      const picksObservable = pickerConfig.picks(query, cts.token);
      store.add(autorun((reader) => {
        const { busy, picks } = picksObservable.read(reader);
        qp.items = [].concat(picks, extraPicks);
        qp.busy = busy;
      }));
    }
    if (cts.token.isCancellationRequested) {
      pickerConfig.dispose?.();
      return true;
    }
    const defer = new DeferredPromise();
    const addPromises = [];
    store.add(qp.onDidAccept(async (e) => {
      const noop = "noop";
      const [selected] = qp.selectedItems;
      if (isChatContextPickerPickItem(selected)) {
        const attachment = selected.asAttachment();
        if (!attachment || attachment === noop) {
          return;
        }
        if (isThenable(attachment)) {
          addPromises.push(attachment.then((v) => {
            if (v !== noop) {
              widget.attachmentModel.addContext(...asArray(v));
            }
          }));
        } else {
          widget.attachmentModel.addContext(...asArray(attachment));
        }
      }
      if (selected === goBackItem) {
        if (pickerConfig.goBack?.()) {
          return;
        }
        defer.complete(false);
      }
      if (selected === configureItem) {
        defer.complete(true);
        commandService.executeCommand(configureItem.commandId);
      }
      if (!e.inBackground) {
        defer.complete(true);
      }
    }));
    store.add(qp.onDidHide(() => {
      defer.complete(true);
      pickerConfig.dispose?.();
    }));
    try {
      const result = await defer.p;
      qp.busy = true;
      await Promise.all(addPromises);
      return result;
    } finally {
      store.dispose();
    }
  }
}
export {
  AttachContextAction,
  AttachSearchResultAction,
  registerChatContextActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRDb250ZXh0QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBpc1RoZW5hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0R290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIsIElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3F1aWNrQWNjZXNzL2Jyb3dzZXIvZ290b1N5bWJvbFF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrSXRlbVdpdGhSZXNvdXJjZSwgUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbW1hbmRzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgaXNFZGl0b3JDb21tYW5kc0NvbnRleHQsIGlzRWRpdG9ySW5wdXQsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJGb2xkZXJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IENUWF9JTkxJTkVfQ0hBVF9WMl9FTkFCTEVEIH0gZnJvbSAnLi4vLi4vLi4vaW5saW5lQ2hhdC9jb21tb24vaW5saW5lQ2hhdC5qcyc7XG5pbXBvcnQgeyBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXIsIHR5cGUgSUFueXRoaW5nUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uL3NlYXJjaC9icm93c2VyL2FueXRoaW5nUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgaXNTZWFyY2hUcmVlRmlsZU1hdGNoLCBpc1NlYXJjaFRyZWVNYXRjaCB9IGZyb20gJy4uLy4uLy4uL3NlYXJjaC9icm93c2VyL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hUcmVlQ29tbW9uLmpzJztcbmltcG9ydCB7IElTeW1ib2xRdWlja1BpY2tJdGVtLCBTeW1ib2xzUXVpY2tBY2Nlc3NQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL3NlYXJjaC9icm93c2VyL3N5bWJvbHNRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VhcmNoL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIE9taXR0ZWRTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBpc1N1cHBvcnRlZENoYXRGaWxlU2NoZW1lIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlLCBJUXVpY2tDaGF0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0UGlja2VySXRlbSwgSUNoYXRDb250ZXh0UGlja1NlcnZpY2UsIElDaGF0Q29udGV4dFZhbHVlSXRlbSwgaXNDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtIH0gZnJvbSAnLi4vYXR0YWNobWVudHMvY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi9jaGF0RXhlY3V0ZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzUXVpY2tDaGF0IH0gZnJvbSAnLi4vd2lkZ2V0L2NoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgcmVzaXplSW1hZ2UgfSBmcm9tICcuLi9jaGF0SW1hZ2VVdGlscy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclByb21wdEFjdGlvbnMgfSBmcm9tICcuLi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4vY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDcmVhdGVQbHVnaW5BY3Rpb24gfSBmcm9tICcuL2NyZWF0ZVBsdWdpbkFjdGlvbi5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNoYXRDb250ZXh0QWN0aW9ucygpOiBEaXNwb3NhYmxlU3RvcmUge1xuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihBdHRhY2hDb250ZXh0QWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoQXR0YWNoRmlsZVRvQ2hhdEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKEF0dGFjaEZvbGRlclRvQ2hhdEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKEF0dGFjaFNlbGVjdGlvblRvQ2hhdEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKEF0dGFjaFNlYXJjaFJlc3VsdEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKEF0dGFjaFBpbm5lZEVkaXRvcnNUb0NoYXRBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQ3JlYXRlUGx1Z2luQWN0aW9uKCkpO1xuXHRyZWdpc3RlclByb21wdEFjdGlvbnMoKTsgLy8gVE9ET0Bqcmlla2VuOiBzaG91bGQgYWxzbyByZXR1cm4gYSBEaXNwb3NhYmxlU3RvcmVcblx0cmV0dXJuIHN0b3JlO1xufVxuXG5hc3luYyBmdW5jdGlvbiB3aXRoQ2hhdFZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cblx0Y29uc3QgbGFzdEZvY3VzZWRXaWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0aWYgKCFsYXN0Rm9jdXNlZFdpZGdldCB8fCBsYXN0Rm9jdXNlZFdpZGdldC5sb2NhdGlvbiA9PT0gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkge1xuXHRcdHJldHVybiBjaGF0V2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKTsgLy8gb25seSBzaG93IGNoYXQgdmlldyBpZiB3ZSBlaXRoZXIgaGF2ZSBubyBjaGF0IHZpZXcgb3IgaXRzIGxvY2F0ZWQgaW4gdmlldyBjb250YWluZXJcblx0fVxuXHRyZXR1cm4gbGFzdEZvY3VzZWRXaWRnZXQ7XG59XG5cbmFic3RyYWN0IGNsYXNzIEF0dGFjaFJlc291cmNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBhd2FpdCBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24od2l0aENoYXRWaWV3KTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRoaXMucnVuV2l0aFdpZGdldC5iaW5kKHRoaXMpLCB3aWRnZXQsIC4uLmFyZ3MpO1xuXHR9XG5cblx0YWJzdHJhY3QgcnVuV2l0aFdpZGdldChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgd2lkZ2V0OiBJQ2hhdFdpZGdldCwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPjtcblxuXHRwcm90ZWN0ZWQgX2dldFJlc291cmNlcyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogVVJJW10ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY29udGV4dHMgPSBpc0VkaXRvckNvbW1hbmRzQ29udGV4dChhcmdzWzFdKSA/IHRoaXMuX2dldEVkaXRvclJlc291cmNlcyhhY2Nlc3NvciwgLi4uYXJncykgOiBBcnJheS5pc0FycmF5KGFyZ3NbMV0pID8gYXJnc1sxXSA6IFthcmdzWzBdXTtcblx0XHRjb25zdCBmaWxlcyA9IFtdO1xuXHRcdGZvciAoY29uc3QgY29udGV4dCBvZiBjb250ZXh0cykge1xuXHRcdFx0bGV0IHVyaTtcblx0XHRcdGlmIChVUkkuaXNVcmkoY29udGV4dCkpIHtcblx0XHRcdFx0dXJpID0gY29udGV4dDtcblx0XHRcdH0gZWxzZSBpZiAoaXNTZWFyY2hUcmVlRmlsZU1hdGNoKGNvbnRleHQpKSB7XG5cdFx0XHRcdHVyaSA9IGNvbnRleHQucmVzb3VyY2U7XG5cdFx0XHR9IGVsc2UgaWYgKGlzU2VhcmNoVHJlZU1hdGNoKGNvbnRleHQpKSB7XG5cdFx0XHRcdHVyaSA9IGNvbnRleHQucGFyZW50KCkucmVzb3VyY2U7XG5cdFx0XHR9IGVsc2UgaWYgKCFjb250ZXh0ICYmIGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpIHtcblx0XHRcdFx0dXJpID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHVyaSAmJiBbU2NoZW1hcy5maWxlLCBTY2hlbWFzLnZzY29kZVJlbW90ZSwgU2NoZW1hcy51bnRpdGxlZF0uaW5jbHVkZXModXJpLnNjaGVtZSkpIHtcblx0XHRcdFx0ZmlsZXMucHVzaCh1cmkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmaWxlcztcblx0fVxuXG5cdHByaXZhdGUgX2dldEVkaXRvclJlc291cmNlcyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogVVJJW10ge1xuXHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXG5cdFx0cmV0dXJuIHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1xuXHRcdFx0LmZsYXRNYXAoZ3JvdXBlZEVkaXRvciA9PiBncm91cGVkRWRpdG9yLmVkaXRvcnMpXG5cdFx0XHQubWFwKGVkaXRvciA9PiBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KSlcblx0XHRcdC5maWx0ZXIodXJpID0+IHVyaSAhPT0gdW5kZWZpbmVkKTtcblx0fVxufVxuXG5jbGFzcyBBdHRhY2hGaWxlVG9DaGF0QWN0aW9uIGV4dGVuZHMgQXR0YWNoUmVzb3VyY2VBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoRmlsZSc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEF0dGFjaEZpbGVUb0NoYXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoRmlsZS5sYWJlbCcsIFwiQWRkIEZpbGUgdG8gQ2hhdFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hdHRhY2gsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlNlYXJjaENvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnel9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgU2VhcmNoQ29udGV4dC5GaWxlTWF0Y2hPck1hdGNoRm9jdXNLZXksIFNlYXJjaENvbnRleHQuU2VhcmNoUmVzdWx0SGVhZGVyRm9jdXNlZC5uZWdhdGUoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXhwbG9yZXJDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzVfY2hhdCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdFx0RXhwbG9yZXJGb2xkZXJDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy5maWxlKSxcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlUmVtb3RlKVxuXHRcdFx0XHRcdClcblx0XHRcdFx0KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMl9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMuZmlsZSksXG5cdFx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVJlbW90ZSlcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc05vbkVtcHR5U2VsZWN0aW9uLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy5maWxlKSxcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlUmVtb3RlKSxcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudW50aXRsZWQpLFxuXHRcdFx0XHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVVc2VyRGF0YSlcblx0XHRcdFx0XHQpXG5cdFx0XHRcdClcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5JbmxpbmVDaGF0RWRpdG9yQWZmb3JkYW5jZSxcblx0XHRcdFx0Z3JvdXA6ICcwX2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNOb25FbXB0eVNlbGVjdGlvbi5uZWdhdGUoKSlcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcwX2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNOb25FbXB0eVNlbGVjdGlvbi5uZWdhdGUoKSlcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW5XaXRoV2lkZ2V0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB3aWRnZXQ6IElDaGF0V2lkZ2V0LCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlcyA9IHRoaXMuX2dldFJlc291cmNlcyhhY2Nlc3NvciwgLi4uYXJncyk7XG5cdFx0aWYgKCFmaWxlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUoZmlsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEF0dGFjaEZvbGRlclRvQ2hhdEFjdGlvbiBleHRlbmRzIEF0dGFjaFJlc291cmNlQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaEZvbGRlcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEF0dGFjaEZvbGRlclRvQ2hhdEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hdHRhY2hGb2xkZXIubGFiZWwnLCBcIkFkZCBGb2xkZXIgdG8gQ2hhdFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4cGxvcmVyQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICc1X2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdEV4cGxvcmVyRm9sZGVyQ29udGV4dCxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMuZmlsZSksXG5cdFx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVJlbW90ZSlcblx0XHRcdFx0XHQpXG5cdFx0XHRcdClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bldpdGhXaWRnZXQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHdpZGdldDogSUNoYXRXaWRnZXQsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLl9nZXRSZXNvdXJjZXMoYWNjZXNzb3IsIC4uLmFyZ3MpO1xuXHRcdGlmICghZm9sZGVycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIGZvbGRlcnMpIHtcblx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRGb2xkZXIoZm9sZGVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQXR0YWNoUGlubmVkRWRpdG9yc1RvQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoUGlubmVkRWRpdG9ycyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEF0dGFjaFBpbm5lZEVkaXRvcnNUb0NoYXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoUGlubmVkRWRpdG9ycy5sYWJlbCcsIFwiQWRkIFBpbm5lZCBFZGl0b3JzIHRvIENoYXRcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHdpdGhDaGF0Vmlldyk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlczogVVJJW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGVkaXRvckdyb3Vwc1NlcnZpY2UuZ3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cC5lZGl0b3JzKSB7XG5cdFx0XHRcdGlmIChncm91cC5pc1Bpbm5lZChlZGl0b3IpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdXJpID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0XHRcdFx0aWYgKHVyaSAmJiBbU2NoZW1hcy5maWxlLCBTY2hlbWFzLnZzY29kZVJlbW90ZSwgU2NoZW1hcy51bnRpdGxlZF0uaW5jbHVkZXModXJpLnNjaGVtZSkpIHtcblx0XHRcdFx0XHRcdGZpbGVzLnB1c2godXJpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWZpbGVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHdpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUoZmlsZSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEF0dGFjaFNlbGVjdGlvblRvQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoU2VsZWN0aW9uJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQXR0YWNoU2VsZWN0aW9uVG9DaGF0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaFNlbGVjdGlvbi5sYWJlbCcsIFwiQWRkIFNlbGVjdGlvbiB0byBDaGF0XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRpY29uOiBDb2RpY29uLmF0dGFjaCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc05vbkVtcHR5U2VsZWN0aW9uLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy5maWxlKSxcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlUmVtb3RlKSxcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudW50aXRsZWQpLFxuXHRcdFx0XHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVVc2VyRGF0YSlcblx0XHRcdFx0XHQpXG5cdFx0XHRcdClcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5JbmxpbmVDaGF0RWRpdG9yQWZmb3JkYW5jZSxcblx0XHRcdFx0Z3JvdXA6ICcwX2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNOb25FbXB0eVNlbGVjdGlvbilcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcwX2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNOb25FbXB0eVNlbGVjdGlvbilcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IGFueVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCB3aWRnZXQgPSBhd2FpdCBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKS5pbnZva2VGdW5jdGlvbih3aXRoQ2hhdFZpZXcpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW18sIG1hdGNoZXNdID0gYXJncztcblx0XHQvLyBJZiB3ZSBoYXZlIHNlYXJjaCBtYXRjaGVzLCBpdCBtZWFucyB0aGlzIGlzIGNvbWluZyBmcm9tIHRoZSBzZWFyY2ggd2lkZ2V0XG5cdFx0aWYgKG1hdGNoZXMgJiYgbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCB1cmlzID0gbmV3IE1hcDxVUkksIFJhbmdlIHwgdW5kZWZpbmVkPigpO1xuXHRcdFx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG5cdFx0XHRcdGlmIChpc1NlYXJjaFRyZWVGaWxlTWF0Y2gobWF0Y2gpKSB7XG5cdFx0XHRcdFx0dXJpcy5zZXQobWF0Y2gucmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGV4dCA9IHsgdXJpOiBtYXRjaC5fcGFyZW50LnJlc291cmNlLCByYW5nZTogbWF0Y2guX3JhbmdlIH07XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSB1cmlzLmdldChjb250ZXh0LnVyaSk7XG5cdFx0XHRcdFx0aWYgKCFyYW5nZSB8fFxuXHRcdFx0XHRcdFx0cmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBjb250ZXh0LnJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiByYW5nZS5lbmRMaW5lTnVtYmVyICE9PSBjb250ZXh0LnJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHVyaXMuc2V0KGNvbnRleHQudXJpLCBjb250ZXh0LnJhbmdlKTtcblx0XHRcdFx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkRmlsZShjb250ZXh0LnVyaSwgY29udGV4dC5yYW5nZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBBZGQgdGhlIHJvb3QgZmlsZXMgZm9yIGFsbCBvZiB0aGUgb25lcyB0aGF0IGRpZG4ndCBoYXZlIGEgbWF0Y2hcblx0XHRcdGZvciAoY29uc3QgdXJpIG9mIHVyaXMpIHtcblx0XHRcdFx0Y29uc3QgW3Jlc291cmNlLCByYW5nZV0gPSB1cmk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUocmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0XHRjb25zdCBhY3RpdmVVcmkgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdFx0aWYgKGFjdGl2ZUVkaXRvciAmJiBhY3RpdmVVcmkgJiYgW1NjaGVtYXMuZmlsZSwgU2NoZW1hcy52c2NvZGVSZW1vdGUsIFNjaGVtYXMudW50aXRsZWRdLmluY2x1ZGVzKGFjdGl2ZVVyaS5zY2hlbWUpKSB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGFjdGl2ZUVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdHdpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBzZWxlY3Rpb24uaXNFbXB0eSgpID8gbmV3IFJhbmdlKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIDEsIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgKyAxLCAxKSA6IHNlbGVjdGlvbjtcblx0XHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUoYWN0aXZlVXJpLCByYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEF0dGFjaFNlYXJjaFJlc3VsdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE5hbWUgPSAnc2VhcmNoUmVzdWx0cyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaW5zZXJ0U2VhcmNoUmVzdWx0cycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Lmluc2VydFNlYXJjaFJlc3VsdHMnLCAnQWRkIFNlYXJjaCBSZXN1bHRzIHRvIENoYXQnKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5TZWFyY2hDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ3pfY2hhdCcsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdFx0U2VhcmNoQ29udGV4dC5TZWFyY2hSZXN1bHRIZWFkZXJGb2N1c2VkKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuaW52b2tlRnVuY3Rpb24od2l0aENoYXRWaWV3KTtcblxuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdJbnNlcnRTZWFyY2hSZXN1bHRBY3Rpb246IG5vIGNoYXQgdmlldyBhdmFpbGFibGUnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3IgPSB3aWRnZXQuaW5wdXRFZGl0b3I7XG5cdFx0Y29uc3Qgb3JpZ2luYWxSYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKSA/PyBlZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0RnVsbE1vZGVsUmFuZ2UoKS5jb2xsYXBzZVRvRW5kKCk7XG5cblx0XHRpZiAoIW9yaWdpbmFsUmFuZ2UpIHtcblx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoJ0luc2VydFNlYXJjaFJlc3VsdEFjdGlvbjogbm8gc2VsZWN0aW9uJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGluc2VydFRleHQgPSBgIyR7QXR0YWNoU2VhcmNoUmVzdWx0QWN0aW9uLk5hbWV9YDtcblx0XHRjb25zdCB2YXJSYW5nZSA9IG5ldyBSYW5nZShvcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlciwgb3JpZ2luYWxSYW5nZS5zdGFydENvbHVtbiwgb3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyLCBvcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlciArIGluc2VydFRleHQubGVuZ3RoKTtcblx0XHQvLyBjaGVjayBjaGFyYWN0ZXIgYmVmb3JlIHRoZSBzdGFydCBvZiB0aGUgcmFuZ2UuIElmIGl0J3Mgbm90IGEgc3BhY2UsIGFkZCBhIHNwYWNlXG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwgJiYgbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShvcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlciwgb3JpZ2luYWxSYW5nZS5zdGFydENvbHVtbiAtIDEsIG9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBvcmlnaW5hbFJhbmdlLnN0YXJ0Q29sdW1uKSkgIT09ICcgJykge1xuXHRcdFx0aW5zZXJ0VGV4dCA9ICcgJyArIGluc2VydFRleHQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN1Y2Nlc3MgPSBlZGl0b3IuZXhlY3V0ZUVkaXRzKCdjaGF0SW5zZXJ0U2VhcmNoJywgW3sgcmFuZ2U6IHZhclJhbmdlLCB0ZXh0OiBpbnNlcnRUZXh0ICsgJyAnIH1dKTtcblx0XHRpZiAoIXN1Y2Nlc3MpIHtcblx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoYEluc2VydFNlYXJjaFJlc3VsdEFjdGlvbjogZmFpbGVkIHRvIGluc2VydCBcIiR7aW5zZXJ0VGV4dH1cImApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxufVxuXG4vKiogVGhpcyBpcyBvdXIgdHlwZSAqL1xuaW50ZXJmYWNlIElDb250ZXh0UGlja0l0ZW1JdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRraW5kOiAnY29udGV4dFBpY2snO1xuXHRpdGVtOiBJQ2hhdENvbnRleHRWYWx1ZUl0ZW0gfCBJQ2hhdENvbnRleHRQaWNrZXJJdGVtO1xufVxuXG4vKiogVGhlc2UgYXJlIHRoZSB0eXBlcyB3ZSBnZXQgZnJvbSBcInBsYXRmb3JtIFFQXCIgKi9cbnR5cGUgSVF1aWNrUGlja1NlcnZpY2VQaWNrSXRlbSA9IElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSB8IElTeW1ib2xRdWlja1BpY2tJdGVtIHwgSUFueXRoaW5nUXVpY2tQaWNrSXRlbTtcblxuZnVuY3Rpb24gaXNJQ29udGV4dFBpY2tJdGVtSXRlbShvYmo6IHVua25vd24pOiBvYmogaXMgSUNvbnRleHRQaWNrSXRlbUl0ZW0ge1xuXHRyZXR1cm4gKFxuXHRcdGlzT2JqZWN0KG9iailcblx0XHQmJiB0eXBlb2YgKDxJQ29udGV4dFBpY2tJdGVtSXRlbT5vYmopLmtpbmQgPT09ICdzdHJpbmcnXG5cdFx0JiYgKDxJQ29udGV4dFBpY2tJdGVtSXRlbT5vYmopLmtpbmQgPT09ICdjb250ZXh0UGljaydcblx0KTtcbn1cblxuZnVuY3Rpb24gaXNJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0ob2JqOiB1bmtub3duKTogb2JqIGlzIElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSB7XG5cdHJldHVybiAoXG5cdFx0aXNPYmplY3Qob2JqKVxuXHRcdCYmIHR5cGVvZiAob2JqIGFzIElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSkuc3ltYm9sTmFtZSA9PT0gJ3N0cmluZydcblx0XHQmJiAhIShvYmogYXMgSUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtKS51cmlcblx0XHQmJiAhIShvYmogYXMgSUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtKS5yYW5nZSk7XG59XG5cbmZ1bmN0aW9uIGlzSVF1aWNrUGlja0l0ZW1XaXRoUmVzb3VyY2Uob2JqOiB1bmtub3duKTogb2JqIGlzIElRdWlja1BpY2tJdGVtV2l0aFJlc291cmNlIHtcblx0cmV0dXJuIChcblx0XHRpc09iamVjdChvYmopXG5cdFx0JiYgVVJJLmlzVXJpKChvYmogYXMgSVF1aWNrUGlja0l0ZW1XaXRoUmVzb3VyY2UpLnJlc291cmNlKSk7XG59XG5cbmZ1bmN0aW9uIGlzQW55dGhpbmdRdWlja1BpY2tJdGVtV2l0aEJyb3dzZXJFZGl0b3Iob2JqOiB1bmtub3duKTogb2JqIGlzIElBbnl0aGluZ1F1aWNrUGlja0l0ZW0gJiB7IHJlYWRvbmx5IGVkaXRvcjogTm9uTnVsbGFibGU8SUFueXRoaW5nUXVpY2tQaWNrSXRlbVsnZWRpdG9yJ10+IH0ge1xuXHRjb25zdCBlZGl0b3IgPSAob2JqIGFzIElBbnl0aGluZ1F1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQpPy5lZGl0b3I7XG5cdHJldHVybiBlZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9ySW5wdXQgfHwgKCEhZWRpdG9yICYmICFpc0VkaXRvcklucHV0KGVkaXRvcikgJiYgZWRpdG9yLm9wdGlvbnM/Lm92ZXJyaWRlID09PSBCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lEKTtcbn1cblxuXG5leHBvcnQgY2xhc3MgQXR0YWNoQ29udGV4dEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaENvbnRleHQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaENvbnRleHQubGFiZWwuMicsIFwiQWRkIENvbnRleHQuLi5cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmFkZENvbXBhY3QsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCwgQ2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmlzRXF1YWxUbyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TbGFzaCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluUXVpY2tDaGF0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5pc0VxdWFsVG8oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFN1cHBvcnRzQXR0YWNobWVudHNcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCksXG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTFcblx0XHRcdH0sIHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdC5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSksXG5cdFx0XHRcdFx0Q1RYX0lOTElORV9DSEFUX1YyX0VOQUJMRUQsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFN1cHBvcnRzQXR0YWNobWVudHNcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCksXG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fSwge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluUXVpY2tDaGF0LFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuYWdlbnRTdXBwb3J0c0F0dGFjaG1lbnRzXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTFcblx0XHRcdH1dLFxuXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBrZXliaW5kaW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJS2V5YmluZGluZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRQaWNrU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdENvbnRleHRQaWNrU2VydmljZSk7XG5cblx0XHRjb25zdCBjb250ZXh0ID0gYXJnc1swXSBhcyAoSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCAmIHsgcGxhY2Vob2xkZXI/OiBzdHJpbmcgfSkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY29udGV4dD8ud2lkZ2V0ID8/IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBxdWlja1BpY2tJdGVtczogSUNvbnRleHRQaWNrSXRlbUl0ZW1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGNvbnRleHRQaWNrU2VydmljZS5pdGVtcykge1xuXG5cdFx0XHRpZiAoaXRlbS5pc0VuYWJsZWQgJiYgIWF3YWl0IGl0ZW0uaXNFbmFibGVkKHdpZGdldCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goe1xuXHRcdFx0XHRraW5kOiAnY29udGV4dFBpY2snLFxuXHRcdFx0XHRpdGVtLFxuXHRcdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoaXRlbS5pY29uKSxcblx0XHRcdFx0a2V5YmluZGluZzogaXRlbS5jb21tYW5kSWQgPyBrZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGl0ZW0uY29tbWFuZElkLCBjb250ZXh0S2V5U2VydmljZSkgOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGF3YWl0IChjb250ZXh0Py5jb250ZXh0UGlja2VyID8/IHdpZGdldC5jb250ZXh0UGlja2VyKT8ucHJlcGFyZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRoaXMuX3Nob3cuYmluZCh0aGlzKSwgd2lkZ2V0LCBxdWlja1BpY2tJdGVtcywgY29udGV4dD8ucGxhY2Vob2xkZXIsIHF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3coYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHdpZGdldDogSUNoYXRXaWRnZXQsIGFkZGl0aW9uUGlja3M6IElDb250ZXh0UGlja0l0ZW1JdGVtW10gfCB1bmRlZmluZWQsIHBsYWNlaG9sZGVyPzogc3RyaW5nLCBxdWlja0lucHV0U2VydmljZU92ZXJyaWRlPzogSVF1aWNrSW5wdXRTZXJ2aWNlKSB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBxdWlja0lucHV0U2VydmljZU92ZXJyaWRlID8/IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrQ2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyT3B0aW9uczogQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyA9IHtcblx0XHRcdGZpbHRlcjogKHBpY2spID0+IHtcblx0XHRcdFx0aWYgKGlzSVF1aWNrUGlja0l0ZW1XaXRoUmVzb3VyY2UocGljaykgJiYgcGljay5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBpc1N1cHBvcnRlZENoYXRGaWxlU2NoZW1lKGFjY2Vzc29yLCBwaWNrLnJlc291cmNlIS5zY2hlbWUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRhZGRpdGlvblBpY2tzLFxuXHRcdFx0aGFuZGxlQWNjZXB0OiBhc3luYyAoaXRlbTogSVF1aWNrUGlja1NlcnZpY2VQaWNrSXRlbSB8IElDb250ZXh0UGlja0l0ZW1JdGVtLCBpc0JhY2tncm91bmRBY2NlcHQ6IGJvb2xlYW4pID0+IHtcblxuXHRcdFx0XHRpZiAoaXNJQ29udGV4dFBpY2tJdGVtSXRlbShpdGVtKSkge1xuXG5cdFx0XHRcdFx0bGV0IGlzRG9uZSA9IHRydWU7XG5cdFx0XHRcdFx0aWYgKGl0ZW0uaXRlbS50eXBlID09PSAndmFsdWVQaWNrJykge1xuXHRcdFx0XHRcdFx0dGhpcy5faGFuZGxlQ29udGV4dFBpY2soaXRlbS5pdGVtLCB3aWRnZXQpO1xuXG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpdGVtLml0ZW0udHlwZSA9PT0gJ3BpY2tlclBpY2snKSB7XG5cdFx0XHRcdFx0XHRpc0RvbmUgPSBhd2FpdCB0aGlzLl9oYW5kbGVDb250ZXh0UGlja2VySXRlbShxdWlja0lucHV0U2VydmljZSwgY29tbWFuZFNlcnZpY2UsIGl0ZW0uaXRlbSwgd2lkZ2V0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIWlzRG9uZSkge1xuXHRcdFx0XHRcdFx0Ly8gcmVzdGFydCBwaWNrZXIgd2hlbiBzdWItcGlja2VyIGRpZG4ndCByZXR1cm4gYW55dGhpbmdcblx0XHRcdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRoaXMuX3Nob3cuYmluZCh0aGlzKSwgd2lkZ2V0LCBhZGRpdGlvblBpY2tzLCBwbGFjZWhvbGRlciwgcXVpY2tJbnB1dFNlcnZpY2VPdmVycmlkZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24odGhpcy5faGFuZGxlUVBQaWNrLmJpbmQodGhpcyksIHdpZGdldCwgaXNCYWNrZ3JvdW5kQWNjZXB0LCBpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXNRdWlja0NoYXQod2lkZ2V0KSkge1xuXHRcdFx0XHRcdHF1aWNrQ2hhdFNlcnZpY2Uub3BlbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJycsIHtcblx0XHRcdGVuYWJsZWRQcm92aWRlclByZWZpeGVzOiBbXG5cdFx0XHRcdEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVgsXG5cdFx0XHRcdFN5bWJvbHNRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCxcblx0XHRcdFx0QWJzdHJhY3RHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVhcblx0XHRcdF0sXG5cdFx0XHRwbGFjZWhvbGRlcjogcGxhY2Vob2xkZXIgPz8gbG9jYWxpemUoJ2NoYXRDb250ZXh0LmF0dGFjaC5wbGFjZWhvbGRlcicsICdTZWFyY2ggYXR0YWNobWVudHMnKSxcblx0XHRcdHByb3ZpZGVyT3B0aW9ucyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVFQUGljayhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgd2lkZ2V0OiBJQ2hhdFdpZGdldCwgaXNJbkJhY2tncm91bmQ6IGJvb2xlYW4sIHBpY2s6IElRdWlja1BpY2tTZXJ2aWNlUGlja0l0ZW0pIHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHRleHRNb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdG9BdHRhY2g6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXG5cdFx0aWYgKGlzQW55dGhpbmdRdWlja1BpY2tJdGVtV2l0aEJyb3dzZXJFZGl0b3IocGljaykpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5yZXNvbHZlRWRpdG9yQXR0YWNoQ29udGV4dChwaWNrLmVkaXRvcik7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0dG9BdHRhY2gucHVzaChlbnRyeSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc0lRdWlja1BpY2tJdGVtV2l0aFJlc291cmNlKHBpY2spICYmIHBpY2sucmVzb3VyY2UpIHtcblx0XHRcdGlmICgvXFwuKHBuZ3xqcGd8anBlZ3xibXB8Z2lmfHRpZmYpJC9pLnRlc3QocGljay5yZXNvdXJjZS5wYXRoKSkge1xuXHRcdFx0XHQvLyBjaGVja3MgaWYgdGhlIGZpbGUgaXMgYW4gaW1hZ2Vcblx0XHRcdFx0aWYgKFVSSS5pc1VyaShwaWNrLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdC8vIHJlYWQgdGhlIGltYWdlIGFuZCBhdHRhY2ggYSBuZXcgZmlsZSBjb250ZXh0LlxuXHRcdFx0XHRcdGNvbnN0IHJlYWRGaWxlID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUocGljay5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzaXplZEltYWdlID0gYXdhaXQgcmVzaXplSW1hZ2UocmVhZEZpbGUudmFsdWUuYnVmZmVyKTtcblx0XHRcdFx0XHR0b0F0dGFjaC5wdXNoKHtcblx0XHRcdFx0XHRcdGlkOiBwaWNrLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRuYW1lOiBwaWNrLmxhYmVsLFxuXHRcdFx0XHRcdFx0ZnVsbE5hbWU6IHBpY2subGFiZWwsXG5cdFx0XHRcdFx0XHR2YWx1ZTogcmVzaXplZEltYWdlLFxuXHRcdFx0XHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdFx0XHRcdHJlZmVyZW5jZXM6IFt7IHJlZmVyZW5jZTogcGljay5yZXNvdXJjZSwga2luZDogJ3JlZmVyZW5jZScgfV1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChwaWNrLnJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVCcm93c2VyKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5yZXNvbHZlRWRpdG9yQXR0YWNoQ29udGV4dCh7IHJlc291cmNlOiBwaWNrLnJlc291cmNlIH0pO1xuXHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHR0b0F0dGFjaC5wdXNoKGVudHJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IG9taXR0ZWRTdGF0ZSA9IE9taXR0ZWRTdGF0ZS5Ob3RPbWl0dGVkO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGNyZWF0ZWRNb2RlbCA9IGF3YWl0IHRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocGljay5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0Y3JlYXRlZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0b21pdHRlZFN0YXRlID0gT21pdHRlZFN0YXRlLkZ1bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0b0F0dGFjaC5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnZmlsZScsXG5cdFx0XHRcdFx0aWQ6IHBpY2sucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHR2YWx1ZTogcGljay5yZXNvdXJjZSxcblx0XHRcdFx0XHRuYW1lOiBwaWNrLmxhYmVsLFxuXHRcdFx0XHRcdG9taXR0ZWRTdGF0ZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzSUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtKHBpY2spICYmIHBpY2sudXJpICYmIHBpY2sucmFuZ2UpIHtcblx0XHRcdHRvQXR0YWNoLnB1c2goe1xuXHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdGlkOiBKU09OLnN0cmluZ2lmeSh7IHVyaTogcGljay51cmksIHJhbmdlOiBwaWNrLnJhbmdlLmRlY29yYXRpb24gfSksXG5cdFx0XHRcdHZhbHVlOiB7IHVyaTogcGljay51cmksIHJhbmdlOiBwaWNrLnJhbmdlLmRlY29yYXRpb24gfSxcblx0XHRcdFx0ZnVsbE5hbWU6IHBpY2subGFiZWwsXG5cdFx0XHRcdG5hbWU6IHBpY2suc3ltYm9sTmFtZSEsXG5cdFx0XHR9KTtcblx0XHR9XG5cblxuXHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCguLi50b0F0dGFjaCk7XG5cblx0XHRpZiAoIWlzSW5CYWNrZ3JvdW5kKSB7XG5cdFx0XHQvLyBTZXQgZm9jdXMgYmFjayBpbnRvIHRoZSBpbnB1dCBvbmNlIHRoZSB1c2VyIGlzIGRvbmUgYXR0YWNoaW5nIGl0ZW1zXG5cdFx0XHQvLyBzbyB0aGF0IHRoZSB1c2VyIGNhbiBzdGFydCB0eXBpbmcgdGhlaXIgbWVzc2FnZVxuXHRcdFx0d2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVDb250ZXh0UGljayhpdGVtOiBJQ2hhdENvbnRleHRWYWx1ZUl0ZW0sIHdpZGdldDogSUNoYXRXaWRnZXQpIHtcblxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgaXRlbS5hc0F0dGFjaG1lbnQod2lkZ2V0KTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCguLi52YWx1ZSk7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSkge1xuXHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVDb250ZXh0UGlja2VySXRlbShxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLCBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLCBpdGVtOiBJQ2hhdENvbnRleHRQaWNrZXJJdGVtLCB3aWRnZXQ6IElDaGF0V2lkZ2V0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHRjb25zdCBwaWNrZXJDb25maWcgPSBpdGVtLmFzUGlja2VyKHdpZGdldCk7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGdvQmFja0l0ZW06IElRdWlja1BpY2tJdGVtID0ge1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdnb0JhY2snLCAnR28gYmFjayBcdTIxQTknKSxcblx0XHRcdGFsd2F5c1Nob3c6IHRydWVcblx0XHR9O1xuXHRcdGNvbnN0IGNvbmZpZ3VyZUl0ZW0gPSBwaWNrZXJDb25maWcuY29uZmlndXJlID8ge1xuXHRcdFx0bGFiZWw6IHBpY2tlckNvbmZpZy5jb25maWd1cmUubGFiZWwsXG5cdFx0XHRjb21tYW5kSWQ6IHBpY2tlckNvbmZpZy5jb25maWd1cmUuY29tbWFuZElkLFxuXHRcdFx0YWx3YXlzU2hvdzogdHJ1ZVxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZXh0cmFQaWNrczogUXVpY2tQaWNrSXRlbVtdID0gW3sgdHlwZTogJ3NlcGFyYXRvcicgfV07XG5cdFx0aWYgKGNvbmZpZ3VyZUl0ZW0pIHtcblx0XHRcdGV4dHJhUGlja3MucHVzaChjb25maWd1cmVJdGVtKTtcblx0XHR9XG5cdFx0ZXh0cmFQaWNrcy5wdXNoKGdvQmFja0l0ZW0pO1xuXG5cdFx0Y29uc3QgcXAgPSBzdG9yZS5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KSk7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRzdG9yZS5hZGQocXAub25EaWRIaWRlKCgpID0+IGN0cy5jYW5jZWwoKSkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblxuXHRcdHFwLnBsYWNlaG9sZGVyID0gcGlja2VyQ29uZmlnLnBsYWNlaG9sZGVyO1xuXHRcdHFwLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0cXAubWF0Y2hPbkRldGFpbCA9IHRydWU7XG5cdFx0Ly8gcXAuaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdHFwLmNhbkFjY2VwdEluQmFja2dyb3VuZCA9IHRydWU7XG5cdFx0cXAuYnVzeSA9IHRydWU7XG5cdFx0cXAuc2hvdygpO1xuXG5cdFx0aWYgKGlzVGhlbmFibGUocGlja2VyQ29uZmlnLnBpY2tzKSkge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCAocGlja2VyQ29uZmlnLnBpY2tzLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0XHRyZXR1cm4gKFtdIGFzIFF1aWNrUGlja0l0ZW1bXSkuY29uY2F0KHZhbHVlLCBleHRyYVBpY2tzKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cXAuaXRlbXMgPSBpdGVtcztcblx0XHRcdHFwLmJ1c3kgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcXVlcnkgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nPignYXR0YWNoQ29udGV4dC5xdWVyeScsIHFwLnZhbHVlKTtcblx0XHRcdHN0b3JlLmFkZChxcC5vbkRpZENoYW5nZVZhbHVlKCgpID0+IHF1ZXJ5LnNldChxcC52YWx1ZSwgdW5kZWZpbmVkKSkpO1xuXG5cdFx0XHRjb25zdCBwaWNrc09ic2VydmFibGUgPSBwaWNrZXJDb25maWcucGlja3MocXVlcnksIGN0cy50b2tlbik7XG5cdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGJ1c3ksIHBpY2tzIH0gPSBwaWNrc09ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRxcC5pdGVtcyA9IChbXSBhcyBRdWlja1BpY2tJdGVtW10pLmNvbmNhdChwaWNrcywgZXh0cmFQaWNrcyk7XG5cdFx0XHRcdHFwLmJ1c3kgPSBidXN5O1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHBpY2tlckNvbmZpZy5kaXNwb3NlPy4oKTtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBwaWNrZXIgZ290IGhpZGRlbiBhbHJlYWR5XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPGJvb2xlYW4+KCk7XG5cdFx0Y29uc3QgYWRkUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXG5cdFx0c3RvcmUuYWRkKHFwLm9uRGlkQWNjZXB0KGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3Qgbm9vcCA9ICdub29wJztcblx0XHRcdGNvbnN0IFtzZWxlY3RlZF0gPSBxcC5zZWxlY3RlZEl0ZW1zO1xuXHRcdFx0aWYgKGlzQ2hhdENvbnRleHRQaWNrZXJQaWNrSXRlbShzZWxlY3RlZCkpIHtcblx0XHRcdFx0Y29uc3QgYXR0YWNobWVudCA9IHNlbGVjdGVkLmFzQXR0YWNobWVudCgpO1xuXHRcdFx0XHRpZiAoIWF0dGFjaG1lbnQgfHwgYXR0YWNobWVudCA9PT0gbm9vcCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXNUaGVuYWJsZShhdHRhY2htZW50KSkge1xuXHRcdFx0XHRcdGFkZFByb21pc2VzLnB1c2goYXR0YWNobWVudC50aGVuKHYgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHYgIT09IG5vb3ApIHtcblx0XHRcdFx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KC4uLmFzQXJyYXkodikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoLi4uYXNBcnJheShhdHRhY2htZW50KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzZWxlY3RlZCA9PT0gZ29CYWNrSXRlbSkge1xuXHRcdFx0XHRpZiAocGlja2VyQ29uZmlnLmdvQmFjaz8uKCkpIHtcblx0XHRcdFx0XHQvLyBDdXN0b20gZ29CYWNrIGhhbmRsZWQgdGhlIG5hdmlnYXRpb24sIHN0YXkgaW4gdGhlIHBpY2tlclxuXHRcdFx0XHRcdHJldHVybjsgLy8gRG9uJ3QgY29tcGxldGUsIGtlZXAgcGlja2VyIG9wZW5cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBEZWZhdWx0IGJlaGF2aW9yOiBnbyBiYWNrIHRvIG1haW4gcGlja2VyXG5cdFx0XHRcdGRlZmVyLmNvbXBsZXRlKGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdGlmIChzZWxlY3RlZCA9PT0gY29uZmlndXJlSXRlbSkge1xuXHRcdFx0XHRkZWZlci5jb21wbGV0ZSh0cnVlKTtcblx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29uZmlndXJlSXRlbS5jb21tYW5kSWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFlLmluQmFja2dyb3VuZCkge1xuXHRcdFx0XHRkZWZlci5jb21wbGV0ZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQocXAub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdGRlZmVyLmNvbXBsZXRlKHRydWUpO1xuXHRcdFx0cGlja2VyQ29uZmlnLmRpc3Bvc2U/LigpO1xuXHRcdH0pKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkZWZlci5wO1xuXHRcdFx0cXAuYnVzeSA9IHRydWU7IC8vIGlmIHN0aWxsIHZpc2libGVcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGFkZFByb21pc2VzKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixrQkFBa0I7QUFDNUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFFcEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkNBQXVFO0FBQ2hGLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDBCQUFxRjtBQUM5RixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3Qix5QkFBeUIsZUFBZSx3QkFBd0I7QUFDakcsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxtQ0FBZ0U7QUFDekUsU0FBUyx1QkFBdUIseUJBQXlCO0FBQ3pE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
