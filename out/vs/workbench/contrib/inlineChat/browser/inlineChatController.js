var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _userSelectedModel, _store, _isActiveController, _zone, _currentSession, _editor, _instaService, _notebookEditorService, _inlineChatSessionService, _configurationService, _editorService, _markerDecorationsService, _languageModelService, _logService, _chatEditingService, _chatService, _InlineChatController_instances, runZone_fn, selectVendorDefaultModel_fn, applyModelDefaults_fn;
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent, observableSignalFromEvent, observableValue, waitForState } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { observableCodeEditor } from "../../../../editor/browser/observableCodeEditor.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import { IMarkerDecorationsService } from "../../../../editor/common/services/markerDecorations.js";
import { localize } from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IChatEditingService, ModifiedFileEntryState } from "../../chat/common/editing/chatEditingService.js";
import { ChatMode } from "../../chat/common/chatModes.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../chat/common/chatService/chatService.js";
import { IDiagnosticVariableEntryFilterData } from "../../chat/common/attachments/chatVariableEntries.js";
import { isResponseVM } from "../../chat/common/model/chatViewModel.js";
import { ChatAgentLocation } from "../../chat/common/constants.js";
import { ILanguageModelChatMetadata, ILanguageModelsService, isILanguageModelChatSelector } from "../../chat/common/languageModels.js";
import { isNotebookContainingCellEditor as isNotebookWithCellEditor } from "../../notebook/browser/notebookEditor.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { CellUri } from "../../notebook/common/notebookCommon.js";
import { CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_INLINE_CHAT_TERMINATED, CTX_INLINE_CHAT_VISIBLE, INLINE_CHAT_ID, InlineChatConfigKeys } from "../common/inlineChat.js";
import { InlineChatAffordance } from "./inlineChatAffordance.js";
import { continueInPanelChat, IInlineChatSessionService, rephraseInlineChat } from "./inlineChatSessionService.js";
import { InlineChatZoneWidget } from "./inlineChatZoneWidget.js";
class InlineChatRunOptions {
  static isInlineChatRunOptions(options) {
    if (typeof options !== "object" || options === null) {
      return false;
    }
    const { initialSelection, initialRange, message, autoSend, position, attachments, modelSelector, resolveOnResponse, attachDiagnostics } = options;
    if (typeof message !== "undefined" && typeof message !== "string" || typeof autoSend !== "undefined" && typeof autoSend !== "boolean" || typeof initialRange !== "undefined" && !Range.isIRange(initialRange) || typeof initialSelection !== "undefined" && !Selection.isISelection(initialSelection) || typeof position !== "undefined" && !Position.isIPosition(position) || typeof attachments !== "undefined" && (!Array.isArray(attachments) || !attachments.every((item) => item instanceof URI)) || typeof modelSelector !== "undefined" && !isILanguageModelChatSelector(modelSelector) || typeof resolveOnResponse !== "undefined" && typeof resolveOnResponse !== "boolean" || typeof attachDiagnostics !== "undefined" && typeof attachDiagnostics !== "boolean") {
      return false;
    }
    return true;
  }
}
function getEditorId(editor, model) {
  return `${editor.getId()},${model.id}`;
}
let InlineChatController = class {
  constructor(editor, instaService, notebookEditorService, inlineChatSessionService, codeEditorService, contextKeyService, configurationService, editorService, markerDecorationsService, languageModelService, logService, chatEditingService, chatService) {
    __privateAdd(this, _InlineChatController_instances);
    __privateAdd(this, _store, new DisposableStore());
    __privateAdd(this, _isActiveController, observableValue(this, false));
    __privateAdd(this, _zone);
    __privateAdd(this, _currentSession);
    __privateAdd(this, _editor);
    __privateAdd(this, _instaService);
    __privateAdd(this, _notebookEditorService);
    __privateAdd(this, _inlineChatSessionService);
    __privateAdd(this, _configurationService);
    __privateAdd(this, _editorService);
    __privateAdd(this, _markerDecorationsService);
    __privateAdd(this, _languageModelService);
    __privateAdd(this, _logService);
    __privateAdd(this, _chatEditingService);
    __privateAdd(this, _chatService);
    __privateSet(this, _editor, editor);
    __privateSet(this, _instaService, instaService);
    __privateSet(this, _notebookEditorService, notebookEditorService);
    __privateSet(this, _inlineChatSessionService, inlineChatSessionService);
    __privateSet(this, _configurationService, configurationService);
    __privateSet(this, _editorService, editorService);
    __privateSet(this, _markerDecorationsService, markerDecorationsService);
    __privateSet(this, _languageModelService, languageModelService);
    __privateSet(this, _logService, logService);
    __privateSet(this, _chatEditingService, chatEditingService);
    __privateSet(this, _chatService, chatService);
    const editorObs = observableCodeEditor(editor);
    const ctxInlineChatVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);
    const ctxFileBelongsToChat = CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.bindTo(contextKeyService);
    const ctxTerminated = CTX_INLINE_CHAT_TERMINATED.bindTo(contextKeyService);
    const notebookAgentConfig = observableConfigValue(InlineChatConfigKeys.NotebookAgent, false, __privateGet(this, _configurationService));
    __privateGet(this, _store).add(autorun((r) => {
      const model = editorObs.model.read(r);
      if (!model) {
        ctxFileBelongsToChat.set(false);
        return;
      }
      const sessions = __privateGet(this, _chatEditingService).editingSessionsObs.read(r);
      let hasEdits = false;
      for (const session of sessions) {
        const entries = session.entries.read(r);
        for (const entry of entries) {
          if (isEqual(entry.modifiedURI, model.uri)) {
            hasEdits = true;
            break;
          }
        }
        if (hasEdits) {
          break;
        }
      }
      ctxFileBelongsToChat.set(hasEdits);
    }));
    this.inputOverlayWidget = __privateGet(this, _store).add(__privateGet(this, _instaService).createInstance(InlineChatAffordance, __privateGet(this, _editor)));
    __privateSet(this, _zone, new Lazy(() => {
      assertType(__privateGet(this, _editor).hasModel(), "[Illegal State] widget should only be created when the editor has a model");
      const location = {
        location: ChatAgentLocation.EditorInline,
        resolveData: () => {
          assertType(__privateGet(this, _editor).hasModel());
          const wholeRange = __privateGet(this, _editor).getSelection();
          const document = __privateGet(this, _editor).getModel().uri;
          return {
            type: ChatAgentLocation.EditorInline,
            id: getEditorId(__privateGet(this, _editor), __privateGet(this, _editor).getModel()),
            selection: __privateGet(this, _editor).getSelection(),
            document,
            wholeRange
          };
        }
      };
      const notebookEditor = __privateGet(this, _notebookEditorService).getNotebookForPossibleCell(__privateGet(this, _editor));
      if (!!notebookEditor) {
        location.location = ChatAgentLocation.Notebook;
        if (notebookAgentConfig.get()) {
          location.resolveData = () => {
            assertType(__privateGet(this, _editor).hasModel());
            return {
              type: ChatAgentLocation.Notebook,
              sessionInputUri: __privateGet(this, _editor).getModel().uri
            };
          };
        }
      }
      const result = __privateGet(this, _instaService).createInstance(
        InlineChatZoneWidget,
        location,
        {
          enableWorkingSet: "implicit",
          enableImplicitContext: false,
          renderInputOnTop: false,
          renderInputToolbarBelowInput: true,
          filter: (item) => {
            if (!isResponseVM(item)) {
              return false;
            }
            return !!item.model.isPendingConfirmation.get();
          },
          menus: {
            telemetrySource: "inlineChatWidget",
            executeToolbar: MenuId.ChatEditorInlineExecute,
            inputSideToolbar: MenuId.ChatEditorInlineInputSide
          },
          defaultMode: ChatMode.Ask
        },
        { editor: __privateGet(this, _editor), notebookEditor },
        () => Promise.resolve()
      );
      __privateGet(this, _store).add(result);
      result.domNode.classList.add("inline-chat-2");
      return result;
    }));
    const sessionsSignal = observableSignalFromEvent(this, inlineChatSessionService.onDidChangeSessions);
    __privateSet(this, _currentSession, derived((r) => {
      sessionsSignal.read(r);
      const model = editorObs.model.read(r);
      const session = model && inlineChatSessionService.getSessionByTextModel(model.uri);
      return session ?? void 0;
    }));
    let lastSession = void 0;
    __privateGet(this, _store).add(autorun((r) => {
      const session = __privateGet(this, _currentSession).read(r);
      if (!session) {
        __privateGet(this, _isActiveController).set(false, void 0);
        if (lastSession && !lastSession.chatModel.hasRequests) {
          const state = lastSession.chatModel.inputModel.state.read(void 0);
          if (!state || !state.inputText && state.attachments.length === 0) {
            lastSession.dispose();
            lastSession = void 0;
          }
        }
        return;
      }
      lastSession = session;
      let foundOne = false;
      for (const editor2 of codeEditorService.listCodeEditors()) {
        const ctrl = InlineChatController.get(editor2);
        if (ctrl && __privateGet(ctrl, _isActiveController).read(void 0)) {
          foundOne = true;
          break;
        }
      }
      if (!foundOne && editorObs.isFocused.read(r)) {
        __privateGet(this, _isActiveController).set(true, void 0);
      }
    }));
    const visibleSessionObs = observableValue(this, void 0);
    __privateGet(this, _store).add(autorun((r) => {
      const model = editorObs.model.read(r);
      const session = __privateGet(this, _currentSession).read(r);
      const isActive = __privateGet(this, _isActiveController).read(r);
      if (!session || !isActive || !model) {
        visibleSessionObs.set(void 0, void 0);
      } else {
        visibleSessionObs.set(session, void 0);
      }
    }));
    const defaultPlaceholderObs = visibleSessionObs.map((session, r) => {
      return session?.initialSelection.isEmpty() ? localize("placeholder", "Generate code") : localize("placeholderWithSelection", "Modify selected code");
    });
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      ctxTerminated.set(!!session?.terminationState.read(r));
    }));
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      if (!session) {
        __privateGet(this, _zone).rawValue?.hide();
        __privateGet(this, _zone).rawValue?.widget.chatWidget.setModel(void 0);
        editor.focus();
        ctxInlineChatVisible.reset();
      } else {
        ctxInlineChatVisible.set(true);
        __privateGet(this, _zone).value.widget.chatWidget.setModel(session.chatModel);
        if (!__privateGet(this, _zone).value.position) {
          __privateGet(this, _zone).value.widget.chatWidget.setInputPlaceholder(defaultPlaceholderObs.read(r));
          __privateGet(this, _zone).value.widget.chatWidget.input.renderAttachedContext();
          __privateGet(this, _zone).value.show(session.initialPosition);
        }
        __privateGet(this, _zone).value.reveal(__privateGet(this, _zone).value.position);
        __privateGet(this, _zone).value.widget.focus();
      }
    }));
    __privateGet(this, _store).add(autorun((r) => {
      const session = __privateGet(this, _currentSession).read(r);
      if (!session) {
        return;
      }
      const lastRequest = session.chatModel.lastRequestObs.read(r);
      const response = lastRequest?.response;
      const pending = response?.isPendingConfirmation.read(r);
      if (pending) {
        __privateGet(this, _logService).info(`[InlineChat] auto-approving: ${pending.detail ?? "unknown"}`);
        for (const part of response.response.value) {
          if (part.kind === "toolInvocation") {
            IChatToolInvocation.confirmWith(part, { type: ToolConfirmKind.ConfirmationNotNeeded, reason: "inlineChat" });
          }
        }
      }
    }));
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      if (session) {
        const entries = session.editingSession.entries.read(r);
        const sessionCellUri = CellUri.parse(session.uri);
        const otherEntries = entries.filter((entry) => {
          if (isEqual(entry.modifiedURI, session.uri)) {
            return false;
          }
          if (!!sessionCellUri && isEqual(sessionCellUri.notebook, entry.modifiedURI)) {
            return false;
          }
          return true;
        });
        for (const entry of otherEntries) {
          __privateGet(this, _editorService).openEditor({ resource: entry.modifiedURI }, SIDE_GROUP).catch(onUnexpectedError);
        }
      }
    }));
    const lastResponseObs = visibleSessionObs.map((session, r) => {
      if (!session) {
        return;
      }
      const lastRequest = observableFromEvent(this, session.chatModel.onDidChange, () => session.chatModel.getRequests().at(-1)).read(r);
      return lastRequest?.response;
    });
    const lastResponseProgressObs = lastResponseObs.map((response, r) => {
      if (!response) {
        return;
      }
      return observableFromEvent(this, response.onDidChange, () => response.response.value.findLast((part) => part.kind === "progressMessage")).read(r);
    });
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      const response = lastResponseObs.read(r);
      const terminationState = session?.terminationState.read(r);
      __privateGet(this, _zone).rawValue?.widget.updateInfo("");
      if (!response?.isInProgress.read(r)) {
        __privateGet(this, _zone).rawValue?.status.set(response?.result?.details ?? "", void 0);
        if (response?.result?.errorDetails) {
          __privateGet(this, _zone).rawValue?.widget.updateInfo(`$(error) ${response.result.errorDetails.message}`);
          alert(response.result.errorDetails.message);
        } else if (terminationState) {
          __privateGet(this, _zone).rawValue?.showTerminationCard(terminationState, __privateGet(this, _instaService));
        }
        if (!terminationState) {
          __privateGet(this, _zone).rawValue?.hideTerminationCard();
        }
        __privateGet(this, _zone).rawValue?.widget.domNode.classList.toggle("request-in-progress", false);
        __privateGet(this, _zone).rawValue?.widget.chatWidget.setInputPlaceholder(defaultPlaceholderObs.read(r));
      } else {
        __privateGet(this, _zone).rawValue?.widget.domNode.classList.toggle("request-in-progress", true);
        __privateGet(this, _zone).rawValue?.status.set("", void 0);
        let placeholder = response.request?.message.text;
        const lastProgress = lastResponseProgressObs.read(r);
        if (lastProgress) {
          placeholder = renderAsPlaintext(lastProgress.content);
        }
        __privateGet(this, _zone).rawValue?.widget.chatWidget.setInputPlaceholder(placeholder || localize("loading", "Working..."));
      }
    }));
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      if (!session) {
        return;
      }
      const entry = session.editingSession.readEntry(session.uri, r);
      if (entry?.state.read(r) === ModifiedFileEntryState.Modified) {
        entry?.enableReviewModeUntilSettled();
      }
    }));
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      const entry = session?.editingSession.readEntry(session.uri, r);
      const pane = __privateGet(this, _editorService).visibleEditorPanes.find((candidate) => candidate.getControl() === __privateGet(this, _editor) || isNotebookWithCellEditor(candidate, __privateGet(this, _editor)));
      if (pane && entry) {
        entry?.getEditorIntegration(pane);
      }
      if (entry?.diffInfo && __privateGet(this, _zone).rawValue?.position) {
        const { position } = __privateGet(this, _zone).rawValue;
        const diff = entry.diffInfo.read(r);
        for (const change of diff.changes) {
          if (change.modified.contains(position.lineNumber)) {
            __privateGet(this, _zone).rawValue?.updatePositionAndHeight(new Position(change.modified.startLineNumber - 1, 1));
            break;
          }
        }
      }
    }));
  }
  static get(editor) {
    return editor.getContribution(InlineChatController.ID) ?? void 0;
  }
  get widget() {
    return __privateGet(this, _zone).value.widget;
  }
  get isActive() {
    return Boolean(__privateGet(this, _currentSession).get());
  }
  dispose() {
    __privateGet(this, _store).dispose();
  }
  getWidgetPosition() {
    return __privateGet(this, _zone).rawValue?.position;
  }
  focus() {
    __privateGet(this, _zone).rawValue?.widget.focus();
  }
  async run(arg) {
    assertType(__privateGet(this, _editor).hasModel());
    const uri = __privateGet(this, _editor).getModel().uri;
    const existingSession = __privateGet(this, _inlineChatSessionService).getSessionByTextModel(uri);
    if (existingSession) {
      await existingSession.editingSession.accept();
      existingSession.dispose();
    }
    __privateGet(this, _isActiveController).set(true, void 0);
    const session = __privateGet(this, _inlineChatSessionService).createSession(__privateGet(this, _editor));
    return __privateMethod(this, _InlineChatController_instances, runZone_fn).call(this, session, arg);
  }
  async acceptSession() {
    const session = __privateGet(this, _currentSession).get();
    if (!session) {
      return;
    }
    await session.editingSession.accept();
    session.dispose();
  }
  async rejectSession() {
    const session = __privateGet(this, _currentSession).get();
    if (!session) {
      return;
    }
    await __privateGet(this, _chatService).cancelCurrentRequestForSession(session.chatModel.sessionResource, "inlineChatReject");
    await session.editingSession.reject();
    session.dispose();
  }
  async continueSessionInChat() {
    const session = __privateGet(this, _currentSession).get();
    if (!session) {
      return;
    }
    await __privateGet(this, _instaService).invokeFunction(continueInPanelChat, session);
  }
  async rephraseSession() {
    const session = __privateGet(this, _currentSession).get();
    if (!session) {
      return;
    }
    const requestText = __privateGet(this, _instaService).invokeFunction(rephraseInlineChat, session);
    if (requestText) {
      __privateGet(this, _zone).rawValue?.widget.chatWidget.setInput(requestText);
    }
    __privateGet(this, _zone).rawValue?.widget.focus();
  }
};
_userSelectedModel = new WeakMap();
_store = new WeakMap();
_isActiveController = new WeakMap();
_zone = new WeakMap();
_currentSession = new WeakMap();
_editor = new WeakMap();
_instaService = new WeakMap();
_notebookEditorService = new WeakMap();
_inlineChatSessionService = new WeakMap();
_configurationService = new WeakMap();
_editorService = new WeakMap();
_markerDecorationsService = new WeakMap();
_languageModelService = new WeakMap();
_logService = new WeakMap();
_chatEditingService = new WeakMap();
_chatService = new WeakMap();
_InlineChatController_instances = new WeakSet();
runZone_fn = async function(session, arg) {
  assertType(__privateGet(this, _editor).hasModel());
  const uri = __privateGet(this, _editor).getModel().uri;
  const sessionStore = new DisposableStore();
  try {
    await __privateMethod(this, _InlineChatController_instances, applyModelDefaults_fn).call(this, session, sessionStore);
    if (arg) {
      arg.attachDiagnostics ??= true;
    }
    if (arg?.attachDiagnostics) {
      const entries = [];
      for (const [range, marker] of __privateGet(this, _markerDecorationsService).getLiveMarkers(uri)) {
        if (range.intersectRanges(__privateGet(this, _editor).getSelection())) {
          const filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
          entries.push(IDiagnosticVariableEntryFilterData.toEntry(filter));
        }
      }
      if (entries.length > 0) {
        __privateGet(this, _zone).value.widget.chatWidget.attachmentModel.addContext(...entries);
        const msg = entries.length > 1 ? localize("fixN", "Fix the attached problems") : localize("fix1", "Fix the attached problem");
        __privateGet(this, _zone).value.widget.chatWidget.input.setValue(msg, true);
        arg.message = msg;
        __privateGet(this, _zone).value.widget.chatWidget.inputEditor.setSelection(new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1));
      }
    }
    if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
      if (arg.initialRange) {
        __privateGet(this, _editor).revealRange(arg.initialRange);
      }
      if (arg.initialSelection) {
        __privateGet(this, _editor).setSelection(arg.initialSelection);
      }
      if (arg.attachments) {
        await Promise.all(arg.attachments.map(async (attachment) => {
          await __privateGet(this, _zone).value.widget.chatWidget.attachmentModel.addFile(attachment);
        }));
        delete arg.attachments;
      }
      if (arg.modelSelector) {
        const id = (await __privateGet(this, _languageModelService).selectLanguageModels(arg.modelSelector)).sort().at(0);
        if (!id) {
          throw new Error(`No language models found matching selector: ${JSON.stringify(arg.modelSelector)}.`);
        }
        const model = __privateGet(this, _languageModelService).lookupLanguageModel(id);
        if (!model) {
          throw new Error(`Language model not loaded: ${id}.`);
        }
        __privateGet(this, _zone).value.widget.chatWidget.input.setCurrentLanguageModel({ metadata: model, identifier: id }, true);
      }
      if (arg.message) {
        __privateGet(this, _zone).value.widget.chatWidget.setInput(arg.message);
        if (arg.autoSend) {
          await __privateGet(this, _zone).value.widget.chatWidget.acceptInput();
        }
      }
    }
    if (!arg?.resolveOnResponse) {
      await Event.toPromise(session.editingSession.onDidDispose);
      const rejected = session.editingSession.getEntry(uri)?.state.get() === ModifiedFileEntryState.Rejected;
      return !rejected;
    } else {
      const modifiedObs = derived((r) => {
        const entry = session.editingSession.readEntry(uri, r);
        return entry?.state.read(r) === ModifiedFileEntryState.Modified && !entry?.isCurrentlyBeingModifiedBy.read(r);
      });
      await waitForState(modifiedObs, (state) => state === true);
      return true;
    }
  } finally {
    sessionStore.dispose();
  }
};
selectVendorDefaultModel_fn = async function(session) {
  const model = __privateGet(this, _zone).value.widget.chatWidget.input.selectedLanguageModel.get();
  if (model && !model.metadata.isDefaultForLocation[session.chatModel.initialLocation]) {
    const ids = await __privateGet(this, _languageModelService).selectLanguageModels({ vendor: model.metadata.vendor });
    for (const identifier of ids) {
      const candidate = __privateGet(this, _languageModelService).lookupLanguageModel(identifier);
      if (candidate?.isDefaultForLocation[session.chatModel.initialLocation]) {
        __privateGet(this, _zone).value.widget.chatWidget.input.setCurrentLanguageModel({ metadata: candidate, identifier });
        break;
      }
    }
  }
};
applyModelDefaults_fn = async function(session, sessionStore) {
  const userSelectedModel = __privateGet(InlineChatController, _userSelectedModel);
  const defaultModelSetting = __privateGet(this, _configurationService).getValue(InlineChatConfigKeys.DefaultModel);
  let modelApplied = false;
  if (userSelectedModel) {
    modelApplied = __privateGet(this, _zone).value.widget.chatWidget.input.switchModelByQualifiedName([userSelectedModel]);
    if (!modelApplied) {
      __privateSet(InlineChatController, _userSelectedModel, void 0);
    }
  }
  if (!modelApplied && defaultModelSetting) {
    modelApplied = __privateGet(this, _zone).value.widget.chatWidget.input.switchModelByQualifiedName([defaultModelSetting]);
    if (!modelApplied) {
      __privateGet(this, _logService).warn(`inlineChat.defaultModel setting value '${defaultModelSetting}' did not match any available model. Falling back to vendor default.`);
    }
  }
  if (!modelApplied) {
    await __privateMethod(this, _InlineChatController_instances, selectVendorDefaultModel_fn).call(this, session);
  }
  let initialModelId;
  sessionStore.add(autorun((r) => {
    const newModel = __privateGet(this, _zone).value.widget.chatWidget.input.selectedLanguageModel.read(r);
    if (!newModel) {
      return;
    }
    if (!initialModelId) {
      initialModelId = newModel.identifier;
      return;
    }
    if (initialModelId !== newModel.identifier) {
      __privateSet(InlineChatController, _userSelectedModel, ILanguageModelChatMetadata.asQualifiedName(newModel.metadata));
      initialModelId = newModel.identifier;
    }
  }));
};
InlineChatController.ID = INLINE_CHAT_ID;
/**
 * Stores the user's explicitly chosen model (qualified name) from a previous inline chat request in the same session.
 * When set, this takes priority over the inlineChat.defaultModel setting.
 */
__privateAdd(InlineChatController, _userSelectedModel);
InlineChatController = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, INotebookEditorService),
  __decorateParam(3, IInlineChatSessionService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IMarkerDecorationsService),
  __decorateParam(9, ILanguageModelsService),
  __decorateParam(10, ILogService),
  __decorateParam(11, IChatEditingService),
  __decorateParam(12, IChatService)
], InlineChatController);
export {
  InlineChatController,
  InlineChatRunOptions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlubGluZUNoYXRcXGJyb3dzZXJcXGlubGluZUNoYXRDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgd2FpdEZvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElTZWxlY3Rpb24sIFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21hcmtlckRlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3RvciwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgaXNJTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3RvciB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IGlzTm90ZWJvb2tDb250YWluaW5nQ2VsbEVkaXRvciBhcyBpc05vdGVib29rV2l0aENlbGxFZGl0b3IgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rRWRpdG9yLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVCwgQ1RYX0lOTElORV9DSEFUX1RFUk1JTkFURUQsIENUWF9JTkxJTkVfQ0hBVF9WSVNJQkxFLCBJTkxJTkVfQ0hBVF9JRCwgSW5saW5lQ2hhdENvbmZpZ0tleXMgfSBmcm9tICcuLi9jb21tb24vaW5saW5lQ2hhdC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDaGF0QWZmb3JkYW5jZSB9IGZyb20gJy4vaW5saW5lQ2hhdEFmZm9yZGFuY2UuanMnO1xuaW1wb3J0IHsgY29udGludWVJblBhbmVsQ2hhdCwgSUlubGluZUNoYXRTZXNzaW9uLCBJSW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLCByZXBocmFzZUlubGluZUNoYXQgfSBmcm9tICcuL2lubGluZUNoYXRTZXNzaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JCYXNlZElubGluZUNoYXRXaWRnZXQgfSBmcm9tICcuL2lubGluZUNoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgSW5saW5lQ2hhdFpvbmVXaWRnZXQgfSBmcm9tICcuL2lubGluZUNoYXRab25lV2lkZ2V0LmpzJztcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIElubGluZUNoYXRSdW5PcHRpb25zIHtcblxuXHRpbml0aWFsU2VsZWN0aW9uPzogSVNlbGVjdGlvbjtcblx0aW5pdGlhbFJhbmdlPzogSVJhbmdlO1xuXHRtZXNzYWdlPzogc3RyaW5nO1xuXHRhdHRhY2htZW50cz86IFVSSVtdO1xuXHRhdXRvU2VuZD86IGJvb2xlYW47XG5cdHBvc2l0aW9uPzogSVBvc2l0aW9uO1xuXHRtb2RlbFNlbGVjdG9yPzogSUxhbmd1YWdlTW9kZWxDaGF0U2VsZWN0b3I7XG5cdHJlc29sdmVPblJlc3BvbnNlPzogYm9vbGVhbjtcblx0YXR0YWNoRGlhZ25vc3RpY3M/OiBib29sZWFuO1xuXG5cdHN0YXRpYyBpc0lubGluZUNoYXRSdW5PcHRpb25zKG9wdGlvbnM6IHVua25vd24pOiBvcHRpb25zIGlzIElubGluZUNoYXRSdW5PcHRpb25zIHtcblxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcgfHwgb3B0aW9ucyA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgaW5pdGlhbFNlbGVjdGlvbiwgaW5pdGlhbFJhbmdlLCBtZXNzYWdlLCBhdXRvU2VuZCwgcG9zaXRpb24sIGF0dGFjaG1lbnRzLCBtb2RlbFNlbGVjdG9yLCByZXNvbHZlT25SZXNwb25zZSwgYXR0YWNoRGlhZ25vc3RpY3MgfSA9IDxJbmxpbmVDaGF0UnVuT3B0aW9ucz5vcHRpb25zO1xuXHRcdGlmIChcblx0XHRcdHR5cGVvZiBtZXNzYWdlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgbWVzc2FnZSAhPT0gJ3N0cmluZydcblx0XHRcdHx8IHR5cGVvZiBhdXRvU2VuZCAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGF1dG9TZW5kICE9PSAnYm9vbGVhbidcblx0XHRcdHx8IHR5cGVvZiBpbml0aWFsUmFuZ2UgIT09ICd1bmRlZmluZWQnICYmICFSYW5nZS5pc0lSYW5nZShpbml0aWFsUmFuZ2UpXG5cdFx0XHR8fCB0eXBlb2YgaW5pdGlhbFNlbGVjdGlvbiAhPT0gJ3VuZGVmaW5lZCcgJiYgIVNlbGVjdGlvbi5pc0lTZWxlY3Rpb24oaW5pdGlhbFNlbGVjdGlvbilcblx0XHRcdHx8IHR5cGVvZiBwb3NpdGlvbiAhPT0gJ3VuZGVmaW5lZCcgJiYgIVBvc2l0aW9uLmlzSVBvc2l0aW9uKHBvc2l0aW9uKVxuXHRcdFx0fHwgdHlwZW9mIGF0dGFjaG1lbnRzICE9PSAndW5kZWZpbmVkJyAmJiAoIUFycmF5LmlzQXJyYXkoYXR0YWNobWVudHMpIHx8ICFhdHRhY2htZW50cy5ldmVyeShpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBVUkkpKVxuXHRcdFx0fHwgdHlwZW9mIG1vZGVsU2VsZWN0b3IgIT09ICd1bmRlZmluZWQnICYmICFpc0lMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yKG1vZGVsU2VsZWN0b3IpXG5cdFx0XHR8fCB0eXBlb2YgcmVzb2x2ZU9uUmVzcG9uc2UgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiByZXNvbHZlT25SZXNwb25zZSAhPT0gJ2Jvb2xlYW4nXG5cdFx0XHR8fCB0eXBlb2YgYXR0YWNoRGlhZ25vc3RpY3MgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBhdHRhY2hEaWFnbm9zdGljcyAhPT0gJ2Jvb2xlYW4nXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuLy8gVE9ET0Bqcmlla2VuIFRISVMgc2hvdWxkIGJlIHNoYXJlZCB3aXRoIHRoZSBjb2RlIGluIE1haW5UaHJlYWRFZGl0b3JzXG5mdW5jdGlvbiBnZXRFZGl0b3JJZChlZGl0b3I6IElDb2RlRWRpdG9yLCBtb2RlbDogSVRleHRNb2RlbCk6IHN0cmluZyB7XG5cdHJldHVybiBgJHtlZGl0b3IuZ2V0SWQoKX0sJHttb2RlbC5pZH1gO1xufVxuXG5leHBvcnQgY2xhc3MgSW5saW5lQ2hhdENvbnRyb2xsZXIgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBJTkxJTkVfQ0hBVF9JRDtcblxuXHRzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBJbmxpbmVDaGF0Q29udHJvbGxlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248SW5saW5lQ2hhdENvbnRyb2xsZXI+KElubGluZUNoYXRDb250cm9sbGVyLklEKSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogU3RvcmVzIHRoZSB1c2VyJ3MgZXhwbGljaXRseSBjaG9zZW4gbW9kZWwgKHF1YWxpZmllZCBuYW1lKSBmcm9tIGEgcHJldmlvdXMgaW5saW5lIGNoYXQgcmVxdWVzdCBpbiB0aGUgc2FtZSBzZXNzaW9uLlxuXHQgKiBXaGVuIHNldCwgdGhpcyB0YWtlcyBwcmlvcml0eSBvdmVyIHRoZSBpbmxpbmVDaGF0LmRlZmF1bHRNb2RlbCBzZXR0aW5nLlxuXHQgKi9cblx0c3RhdGljICN1c2VyU2VsZWN0ZWRNb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5ICNzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cmVhZG9ubHkgI2lzQWN0aXZlQ29udHJvbGxlciA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHJlYWRvbmx5ICN6b25lOiBMYXp5PElubGluZUNoYXRab25lV2lkZ2V0Pjtcblx0cmVhZG9ubHkgaW5wdXRPdmVybGF5V2lkZ2V0OiBJbmxpbmVDaGF0QWZmb3JkYW5jZTtcblxuXHRyZWFkb25seSAjY3VycmVudFNlc3Npb246IElPYnNlcnZhYmxlPElJbmxpbmVDaGF0U2Vzc2lvbiB8IHVuZGVmaW5lZD47XG5cblx0cmVhZG9ubHkgI2VkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHJlYWRvbmx5ICNpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cmVhZG9ubHkgI25vdGVib29rRWRpdG9yU2VydmljZTogSU5vdGVib29rRWRpdG9yU2VydmljZTtcblx0cmVhZG9ubHkgI2lubGluZUNoYXRTZXNzaW9uU2VydmljZTogSUlubGluZUNoYXRTZXNzaW9uU2VydmljZTtcblx0cmVhZG9ubHkgI2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHJlYWRvbmx5ICNlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZTtcblx0cmVhZG9ubHkgI21hcmtlckRlY29yYXRpb25zU2VydmljZTogSU1hcmtlckRlY29yYXRpb25zU2VydmljZTtcblx0cmVhZG9ubHkgI2xhbmd1YWdlTW9kZWxTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlO1xuXHRyZWFkb25seSAjbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cdHJlYWRvbmx5ICNjaGF0RWRpdGluZ1NlcnZpY2U6IElDaGF0RWRpdGluZ1NlcnZpY2U7XG5cdHJlYWRvbmx5ICNjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlO1xuXG5cdGdldCB3aWRnZXQoKTogRWRpdG9yQmFzZWRJbmxpbmVDaGF0V2lkZ2V0IHtcblx0XHRyZXR1cm4gdGhpcy4jem9uZS52YWx1ZS53aWRnZXQ7XG5cdH1cblxuXHRnZXQgaXNBY3RpdmUoKSB7XG5cdFx0cmV0dXJuIEJvb2xlYW4odGhpcy4jY3VycmVudFNlc3Npb24uZ2V0KCkpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIG5vdGVib29rRWRpdG9yU2VydmljZTogSU5vdGVib29rRWRpdG9yU2VydmljZSxcblx0XHRASUlubGluZUNoYXRTZXNzaW9uU2VydmljZSBpbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2U6IElJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlIG1hcmtlckRlY29yYXRpb25zU2VydmljZTogSU1hcmtlckRlY29yYXRpb25zU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBsYW5ndWFnZU1vZGVsU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDaGF0RWRpdGluZ1NlcnZpY2UgY2hhdEVkaXRpbmdTZXJ2aWNlOiBJQ2hhdEVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy4jZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuI2luc3RhU2VydmljZSA9IGluc3RhU2VydmljZTtcblx0XHR0aGlzLiNub3RlYm9va0VkaXRvclNlcnZpY2UgPSBub3RlYm9va0VkaXRvclNlcnZpY2U7XG5cdFx0dGhpcy4jaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlID0gaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlO1xuXHRcdHRoaXMuI2NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy4jZWRpdG9yU2VydmljZSA9IGVkaXRvclNlcnZpY2U7XG5cdFx0dGhpcy4jbWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlID0gbWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlO1xuXHRcdHRoaXMuI2xhbmd1YWdlTW9kZWxTZXJ2aWNlID0gbGFuZ3VhZ2VNb2RlbFNlcnZpY2U7XG5cdFx0dGhpcy4jbG9nU2VydmljZSA9IGxvZ1NlcnZpY2U7XG5cdFx0dGhpcy4jY2hhdEVkaXRpbmdTZXJ2aWNlID0gY2hhdEVkaXRpbmdTZXJ2aWNlO1xuXHRcdHRoaXMuI2NoYXRTZXJ2aWNlID0gY2hhdFNlcnZpY2U7XG5cblx0XHRjb25zdCBlZGl0b3JPYnMgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcihlZGl0b3IpO1xuXG5cdFx0Y29uc3QgY3R4SW5saW5lQ2hhdFZpc2libGUgPSBDVFhfSU5MSU5FX0NIQVRfVklTSUJMRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGN0eEZpbGVCZWxvbmdzVG9DaGF0ID0gQ1RYX0lOTElORV9DSEFUX0ZJTEVfQkVMT05HU19UT19DSEFULmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgY3R4VGVybWluYXRlZCA9IENUWF9JTkxJTkVfQ0hBVF9URVJNSU5BVEVELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tBZ2VudENvbmZpZyA9IG9ic2VydmFibGVDb25maWdWYWx1ZShJbmxpbmVDaGF0Q29uZmlnS2V5cy5Ob3RlYm9va0FnZW50LCBmYWxzZSwgdGhpcy4jY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gVHJhY2sgd2hldGhlciB0aGUgY3VycmVudCBlZGl0b3IncyBmaWxlIGlzIGJlaW5nIGVkaXRlZCBieSBhbnkgY2hhdCBlZGl0aW5nIHNlc3Npb25cblx0XHR0aGlzLiNzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yT2JzLm1vZGVsLnJlYWQocik7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdGN0eEZpbGVCZWxvbmdzVG9DaGF0LnNldChmYWxzZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy4jY2hhdEVkaXRpbmdTZXJ2aWNlLmVkaXRpbmdTZXNzaW9uc09icy5yZWFkKHIpO1xuXHRcdFx0bGV0IGhhc0VkaXRzID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IHNlc3Npb24uZW50cmllcy5yZWFkKHIpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0XHRpZiAoaXNFcXVhbChlbnRyeS5tb2RpZmllZFVSSSwgbW9kZWwudXJpKSkge1xuXHRcdFx0XHRcdFx0aGFzRWRpdHMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoYXNFZGl0cykge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjdHhGaWxlQmVsb25nc1RvQ2hhdC5zZXQoaGFzRWRpdHMpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuaW5wdXRPdmVybGF5V2lkZ2V0ID0gdGhpcy4jc3RvcmUuYWRkKHRoaXMuI2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVDaGF0QWZmb3JkYW5jZSwgdGhpcy4jZWRpdG9yKSk7XG5cblx0XHR0aGlzLiN6b25lID0gbmV3IExhenk8SW5saW5lQ2hhdFpvbmVXaWRnZXQ+KCgpID0+IHtcblxuXHRcdFx0YXNzZXJ0VHlwZSh0aGlzLiNlZGl0b3IuaGFzTW9kZWwoKSwgJ1tJbGxlZ2FsIFN0YXRlXSB3aWRnZXQgc2hvdWxkIG9ubHkgYmUgY3JlYXRlZCB3aGVuIHRoZSBlZGl0b3IgaGFzIGEgbW9kZWwnKTtcblxuXHRcdFx0Y29uc3QgbG9jYXRpb246IElDaGF0V2lkZ2V0TG9jYXRpb25PcHRpb25zID0ge1xuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lLFxuXHRcdFx0XHRyZXNvbHZlRGF0YTogKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydFR5cGUodGhpcy4jZWRpdG9yLmhhc01vZGVsKCkpO1xuXHRcdFx0XHRcdGNvbnN0IHdob2xlUmFuZ2UgPSB0aGlzLiNlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLiNlZGl0b3IuZ2V0TW9kZWwoKS51cmk7XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dHlwZTogQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lLFxuXHRcdFx0XHRcdFx0aWQ6IGdldEVkaXRvcklkKHRoaXMuI2VkaXRvciwgdGhpcy4jZWRpdG9yLmdldE1vZGVsKCkpLFxuXHRcdFx0XHRcdFx0c2VsZWN0aW9uOiB0aGlzLiNlZGl0b3IuZ2V0U2VsZWN0aW9uKCksXG5cdFx0XHRcdFx0XHRkb2N1bWVudCxcblx0XHRcdFx0XHRcdHdob2xlUmFuZ2Vcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBpbmxpbmUgY2hhdCBpbiBub3RlYm9va3Ncblx0XHRcdC8vIGNoZWNrIGlmIHRoaXMgZWRpdG9yIGlzIHBhcnQgb2YgYSBub3RlYm9vayBlZGl0b3Jcblx0XHRcdC8vIGlmIHNvLCB1cGRhdGUgdGhlIGxvY2F0aW9uIGFuZCB1c2UgdGhlIG5vdGVib29rIHNwZWNpZmljIHdpZGdldFxuXHRcdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSB0aGlzLiNub3RlYm9va0VkaXRvclNlcnZpY2UuZ2V0Tm90ZWJvb2tGb3JQb3NzaWJsZUNlbGwodGhpcy4jZWRpdG9yKTtcblx0XHRcdGlmICghIW5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRcdGxvY2F0aW9uLmxvY2F0aW9uID0gQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2s7XG5cdFx0XHRcdGlmIChub3RlYm9va0FnZW50Q29uZmlnLmdldCgpKSB7XG5cdFx0XHRcdFx0bG9jYXRpb24ucmVzb2x2ZURhdGEgPSAoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnRUeXBlKHRoaXMuI2VkaXRvci5oYXNNb2RlbCgpKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0dHlwZTogQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2ssXG5cdFx0XHRcdFx0XHRcdHNlc3Npb25JbnB1dFVyaTogdGhpcy4jZWRpdG9yLmdldE1vZGVsKCkudXJpLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuI2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVDaGF0Wm9uZVdpZGdldCxcblx0XHRcdFx0bG9jYXRpb24sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlbmFibGVXb3JraW5nU2V0OiAnaW1wbGljaXQnLFxuXHRcdFx0XHRcdGVuYWJsZUltcGxpY2l0Q29udGV4dDogZmFsc2UsXG5cdFx0XHRcdFx0cmVuZGVySW5wdXRPblRvcDogZmFsc2UsXG5cdFx0XHRcdFx0cmVuZGVySW5wdXRUb29sYmFyQmVsb3dJbnB1dDogdHJ1ZSxcblx0XHRcdFx0XHRmaWx0ZXI6IGl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFpc1Jlc3BvbnNlVk0oaXRlbSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuICEhaXRlbS5tb2RlbC5pc1BlbmRpbmdDb25maXJtYXRpb24uZ2V0KCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtZW51czoge1xuXHRcdFx0XHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnaW5saW5lQ2hhdFdpZGdldCcsXG5cdFx0XHRcdFx0XHRleGVjdXRlVG9vbGJhcjogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLFxuXHRcdFx0XHRcdFx0aW5wdXRTaWRlVG9vbGJhcjogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVJbnB1dFNpZGVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlZmF1bHRNb2RlOiBDaGF0TW9kZS5Bc2tcblx0XHRcdFx0fSxcblx0XHRcdFx0eyBlZGl0b3I6IHRoaXMuI2VkaXRvciwgbm90ZWJvb2tFZGl0b3IgfSxcblx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHQpO1xuXG5cdFx0XHR0aGlzLiNzdG9yZS5hZGQocmVzdWx0KTtcblxuXHRcdFx0cmVzdWx0LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnaW5saW5lLWNoYXQtMicpO1xuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnNTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIGlubGluZUNoYXRTZXNzaW9uU2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKTtcblxuXHRcdHRoaXMuI2N1cnJlbnRTZXNzaW9uID0gZGVyaXZlZChyID0+IHtcblx0XHRcdHNlc3Npb25zU2lnbmFsLnJlYWQocik7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvck9icy5tb2RlbC5yZWFkKHIpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IG1vZGVsICYmIGlubGluZUNoYXRTZXNzaW9uU2VydmljZS5nZXRTZXNzaW9uQnlUZXh0TW9kZWwobW9kZWwudXJpKTtcblx0XHRcdHJldHVybiBzZXNzaW9uID8/IHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXG5cdFx0bGV0IGxhc3RTZXNzaW9uOiBJSW5saW5lQ2hhdFNlc3Npb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLiNzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLiNjdXJyZW50U2Vzc2lvbi5yZWFkKHIpO1xuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuI2lzQWN0aXZlQ29udHJvbGxlci5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0aWYgKGxhc3RTZXNzaW9uICYmICFsYXN0U2Vzc2lvbi5jaGF0TW9kZWwuaGFzUmVxdWVzdHMpIHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IGxhc3RTZXNzaW9uLmNoYXRNb2RlbC5pbnB1dE1vZGVsLnN0YXRlLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRpZiAoIXN0YXRlIHx8ICghc3RhdGUuaW5wdXRUZXh0ICYmIHN0YXRlLmF0dGFjaG1lbnRzLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdFx0XHRcdGxhc3RTZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdGxhc3RTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxhc3RTZXNzaW9uID0gc2Vzc2lvbjtcblxuXHRcdFx0bGV0IGZvdW5kT25lID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBjb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKSkge1xuXHRcdFx0XHRjb25zdCBjdHJsID0gSW5saW5lQ2hhdENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0XHRcdGlmIChjdHJsICYmIGN0cmwuI2lzQWN0aXZlQ29udHJvbGxlci5yZWFkKHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0XHRmb3VuZE9uZSA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghZm91bmRPbmUgJiYgZWRpdG9yT2JzLmlzRm9jdXNlZC5yZWFkKHIpKSB7XG5cdFx0XHRcdHRoaXMuI2lzQWN0aXZlQ29udHJvbGxlci5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB2aXNpYmxlU2Vzc2lvbk9icyA9IG9ic2VydmFibGVWYWx1ZTxJSW5saW5lQ2hhdFNlc3Npb24gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLiNzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3JPYnMubW9kZWwucmVhZChyKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLiNjdXJyZW50U2Vzc2lvbi5yZWFkKHIpO1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSB0aGlzLiNpc0FjdGl2ZUNvbnRyb2xsZXIucmVhZChyKTtcblxuXHRcdFx0aWYgKCFzZXNzaW9uIHx8ICFpc0FjdGl2ZSB8fCAhbW9kZWwpIHtcblx0XHRcdFx0dmlzaWJsZVNlc3Npb25PYnMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZpc2libGVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRlZmF1bHRQbGFjZWhvbGRlck9icyA9IHZpc2libGVTZXNzaW9uT2JzLm1hcCgoc2Vzc2lvbiwgcikgPT4ge1xuXHRcdFx0cmV0dXJuIHNlc3Npb24/LmluaXRpYWxTZWxlY3Rpb24uaXNFbXB0eSgpXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3BsYWNlaG9sZGVyJywgXCJHZW5lcmF0ZSBjb2RlXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3BsYWNlaG9sZGVyV2l0aFNlbGVjdGlvbicsIFwiTW9kaWZ5IHNlbGVjdGVkIGNvZGVcIik7XG5cdFx0fSk7XG5cblx0XHR0aGlzLiNzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aXNpYmxlU2Vzc2lvbk9icy5yZWFkKHIpO1xuXHRcdFx0Y3R4VGVybWluYXRlZC5zZXQoISFzZXNzaW9uPy50ZXJtaW5hdGlvblN0YXRlLnJlYWQocikpO1xuXHRcdH0pKTtcblxuXG5cdFx0dGhpcy4jc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cblx0XHRcdC8vIEhJREUvU0hPV1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpc2libGVTZXNzaW9uT2JzLnJlYWQocik7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8uaGlkZSgpO1xuXHRcdFx0XHR0aGlzLiN6b25lLnJhd1ZhbHVlPy53aWRnZXQuY2hhdFdpZGdldC5zZXRNb2RlbCh1bmRlZmluZWQpO1xuXHRcdFx0XHRlZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0Y3R4SW5saW5lQ2hhdFZpc2libGUucmVzZXQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGN0eElubGluZUNoYXRWaXNpYmxlLnNldCh0cnVlKTtcblx0XHRcdFx0dGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5zZXRNb2RlbChzZXNzaW9uLmNoYXRNb2RlbCk7XG5cdFx0XHRcdGlmICghdGhpcy4jem9uZS52YWx1ZS5wb3NpdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0LmNoYXRXaWRnZXQuc2V0SW5wdXRQbGFjZWhvbGRlcihkZWZhdWx0UGxhY2Vob2xkZXJPYnMucmVhZChyKSk7XG5cdFx0XHRcdFx0dGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5pbnB1dC5yZW5kZXJBdHRhY2hlZENvbnRleHQoKTsgLy8gVE9ETyAtIGZpZ2h0cyBsYXlvdXQgYnVnXG5cdFx0XHRcdFx0dGhpcy4jem9uZS52YWx1ZS5zaG93KHNlc3Npb24uaW5pdGlhbFBvc2l0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLiN6b25lLnZhbHVlLnJldmVhbCh0aGlzLiN6b25lLnZhbHVlLnBvc2l0aW9uISk7XG5cdFx0XHRcdHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQXV0by1hcHByb3ZlIHRvb2wgY29uZmlybWF0aW9ucyBmb3IgaW5saW5lIGNoYXQuIFRoZSB1c2VyIGltcGxpY2l0bHlcblx0XHQvLyBjb25zZW50cyB0byBlZGl0aW5nIHRoZSBjdXJyZW50IGZpbGUgYnkgaW52b2tpbmcgaW5saW5lIGNoYXQgb24gaXQsXG5cdFx0Ly8gZXZlbiBpZiB0aGUgZmlsZSBxdWFsaWZpZXMgYXMgYSBzZW5zaXRpdmUgZmlsZS5cblx0XHR0aGlzLiNzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLiNjdXJyZW50U2Vzc2lvbi5yZWFkKHIpO1xuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxhc3RSZXF1ZXN0ID0gc2Vzc2lvbi5jaGF0TW9kZWwubGFzdFJlcXVlc3RPYnMucmVhZChyKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gbGFzdFJlcXVlc3Q/LnJlc3BvbnNlO1xuXHRcdFx0Y29uc3QgcGVuZGluZyA9IHJlc3BvbnNlPy5pc1BlbmRpbmdDb25maXJtYXRpb24ucmVhZChyKTtcblx0XHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRcdHRoaXMuI2xvZ1NlcnZpY2UuaW5mbyhgW0lubGluZUNoYXRdIGF1dG8tYXBwcm92aW5nOiAke3BlbmRpbmcuZGV0YWlsID8/ICd1bmtub3duJ31gKTtcblx0XHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlIS5yZXNwb25zZS52YWx1ZSkge1xuXHRcdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdFx0XHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgocGFydCBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQsIHJlYXNvbjogJ2lubGluZUNoYXQnIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuI3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpc2libGVTZXNzaW9uT2JzLnJlYWQocik7XG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzID0gc2Vzc2lvbi5lZGl0aW5nU2Vzc2lvbi5lbnRyaWVzLnJlYWQocik7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25DZWxsVXJpID0gQ2VsbFVyaS5wYXJzZShzZXNzaW9uLnVyaSk7XG5cdFx0XHRcdGNvbnN0IG90aGVyRW50cmllcyA9IGVudHJpZXMuZmlsdGVyKGVudHJ5ID0+IHtcblx0XHRcdFx0XHRpZiAoaXNFcXVhbChlbnRyeS5tb2RpZmllZFVSSSwgc2Vzc2lvbi51cmkpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIERvbid0IGNvdW50IG5vdGVib29rcyB0aGF0IGluY2x1ZGUgdGhlIHNlc3Npb24ncyBjZWxsXG5cdFx0XHRcdFx0aWYgKCEhc2Vzc2lvbkNlbGxVcmkgJiYgaXNFcXVhbChzZXNzaW9uQ2VsbFVyaS5ub3RlYm9vaywgZW50cnkubW9kaWZpZWRVUkkpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBvdGhlckVudHJpZXMpIHtcblx0XHRcdFx0XHQvLyBPUEVOIG90aGVyIG1vZGlmaWVkIGZpbGVzIGluIHNpZGUgZ3JvdXAuIFRoaXMgaXMgYSB3b3JrYXJvdW5kLCB0ZW1wLXNvbHV0aW9uIHVudGlsIHdlIGhhdmUgbm8gbW9yZSBiYWNrZW5kXG5cdFx0XHRcdFx0Ly8gdGhhdCBtb2RpZmllcyBvdGhlciBmaWxlc1xuXHRcdFx0XHRcdHRoaXMuI2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBlbnRyeS5tb2RpZmllZFVSSSB9LCBTSURFX0dST1VQKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBsYXN0UmVzcG9uc2VPYnMgPSB2aXNpYmxlU2Vzc2lvbk9icy5tYXAoKHNlc3Npb24sIHIpID0+IHtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsYXN0UmVxdWVzdCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgc2Vzc2lvbi5jaGF0TW9kZWwub25EaWRDaGFuZ2UsICgpID0+IHNlc3Npb24uY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpKS5yZWFkKHIpO1xuXHRcdFx0cmV0dXJuIGxhc3RSZXF1ZXN0Py5yZXNwb25zZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGxhc3RSZXNwb25zZVByb2dyZXNzT2JzID0gbGFzdFJlc3BvbnNlT2JzLm1hcCgocmVzcG9uc2UsIHIpID0+IHtcblx0XHRcdGlmICghcmVzcG9uc2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgcmVzcG9uc2Uub25EaWRDaGFuZ2UsICgpID0+IHJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlLmZpbmRMYXN0KHBhcnQgPT4gcGFydC5raW5kID09PSAncHJvZ3Jlc3NNZXNzYWdlJykpLnJlYWQocik7XG5cdFx0fSk7XG5cblxuXHRcdHRoaXMuI3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpc2libGVTZXNzaW9uT2JzLnJlYWQocik7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGxhc3RSZXNwb25zZU9icy5yZWFkKHIpO1xuXHRcdFx0Y29uc3QgdGVybWluYXRpb25TdGF0ZSA9IHNlc3Npb24/LnRlcm1pbmF0aW9uU3RhdGUucmVhZChyKTtcblxuXHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8ud2lkZ2V0LnVwZGF0ZUluZm8oJycpO1xuXG5cdFx0XHRpZiAoIXJlc3BvbnNlPy5pc0luUHJvZ3Jlc3MucmVhZChyKSkge1xuXG5cdFx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LnN0YXR1cy5zZXQocmVzcG9uc2U/LnJlc3VsdD8uZGV0YWlscyA/PyAnJywgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHRpZiAocmVzcG9uc2U/LnJlc3VsdD8uZXJyb3JEZXRhaWxzKSB7XG5cdFx0XHRcdFx0Ly8gRVJST1IgY2FzZVxuXHRcdFx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LndpZGdldC51cGRhdGVJbmZvKGAkKGVycm9yKSAke3Jlc3BvbnNlLnJlc3VsdC5lcnJvckRldGFpbHMubWVzc2FnZX1gKTtcblx0XHRcdFx0XHRhbGVydChyZXNwb25zZS5yZXN1bHQuZXJyb3JEZXRhaWxzLm1lc3NhZ2UpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRlcm1pbmF0aW9uU3RhdGUpIHtcblx0XHRcdFx0XHR0aGlzLiN6b25lLnJhd1ZhbHVlPy5zaG93VGVybWluYXRpb25DYXJkKHRlcm1pbmF0aW9uU3RhdGUsIHRoaXMuI2luc3RhU2VydmljZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXRlcm1pbmF0aW9uU3RhdGUpIHtcblx0XHRcdFx0XHR0aGlzLiN6b25lLnJhd1ZhbHVlPy5oaWRlVGVybWluYXRpb25DYXJkKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBubyByZXNwb25zZSBvciBub3QgaW4gcHJvZ3Jlc3Ncblx0XHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8ud2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgncmVxdWVzdC1pbi1wcm9ncmVzcycsIGZhbHNlKTtcblx0XHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8ud2lkZ2V0LmNoYXRXaWRnZXQuc2V0SW5wdXRQbGFjZWhvbGRlcihkZWZhdWx0UGxhY2Vob2xkZXJPYnMucmVhZChyKSk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LndpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3JlcXVlc3QtaW4tcHJvZ3Jlc3MnLCB0cnVlKTtcblx0XHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8uc3RhdHVzLnNldCgnJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0bGV0IHBsYWNlaG9sZGVyID0gcmVzcG9uc2UucmVxdWVzdD8ubWVzc2FnZS50ZXh0O1xuXHRcdFx0XHRjb25zdCBsYXN0UHJvZ3Jlc3MgPSBsYXN0UmVzcG9uc2VQcm9ncmVzc09icy5yZWFkKHIpO1xuXHRcdFx0XHRpZiAobGFzdFByb2dyZXNzKSB7XG5cdFx0XHRcdFx0cGxhY2Vob2xkZXIgPSByZW5kZXJBc1BsYWludGV4dChsYXN0UHJvZ3Jlc3MuY29udGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8ud2lkZ2V0LmNoYXRXaWRnZXQuc2V0SW5wdXRQbGFjZWhvbGRlcihwbGFjZWhvbGRlciB8fCBsb2NhbGl6ZSgnbG9hZGluZycsIFwiV29ya2luZy4uLlwiKSk7XG5cdFx0XHR9XG5cblx0XHR9KSk7XG5cblx0XHR0aGlzLiNzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aXNpYmxlU2Vzc2lvbk9icy5yZWFkKHIpO1xuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZW50cnkgPSBzZXNzaW9uLmVkaXRpbmdTZXNzaW9uLnJlYWRFbnRyeShzZXNzaW9uLnVyaSwgcik7XG5cdFx0XHRpZiAoZW50cnk/LnN0YXRlLnJlYWQocikgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpIHtcblx0XHRcdFx0ZW50cnk/LmVuYWJsZVJldmlld01vZGVVbnRpbFNldHRsZWQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuI3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdmlzaWJsZVNlc3Npb25PYnMucmVhZChyKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gc2Vzc2lvbj8uZWRpdGluZ1Nlc3Npb24ucmVhZEVudHJ5KHNlc3Npb24udXJpLCByKTtcblxuXHRcdFx0Ly8gbWFrZSBzdXJlIHRoZXJlIGlzIGFuIGVkaXRvciBpbnRlZ3JhdGlvblxuXHRcdFx0Y29uc3QgcGFuZSA9IHRoaXMuI2VkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvclBhbmVzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5nZXRDb250cm9sKCkgPT09IHRoaXMuI2VkaXRvciB8fCBpc05vdGVib29rV2l0aENlbGxFZGl0b3IoY2FuZGlkYXRlLCB0aGlzLiNlZGl0b3IpKTtcblx0XHRcdGlmIChwYW5lICYmIGVudHJ5KSB7XG5cdFx0XHRcdGVudHJ5Py5nZXRFZGl0b3JJbnRlZ3JhdGlvbihwYW5lKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gbWFrZSBzdXJlIHRoZSBaT05FIGlzbid0IGluYmV0d2VlbiBhIGRpZmYgYW5kIG1vdmUgYWJvdmUgaWYgc29cblx0XHRcdGlmIChlbnRyeT8uZGlmZkluZm8gJiYgdGhpcy4jem9uZS5yYXdWYWx1ZT8ucG9zaXRpb24pIHtcblx0XHRcdFx0Y29uc3QgeyBwb3NpdGlvbiB9ID0gdGhpcy4jem9uZS5yYXdWYWx1ZTtcblx0XHRcdFx0Y29uc3QgZGlmZiA9IGVudHJ5LmRpZmZJbmZvLnJlYWQocik7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgZGlmZi5jaGFuZ2VzKSB7XG5cdFx0XHRcdFx0aWYgKGNoYW5nZS5tb2RpZmllZC5jb250YWlucyhwb3NpdGlvbi5saW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8udXBkYXRlUG9zaXRpb25BbmRIZWlnaHQobmV3IFBvc2l0aW9uKGNoYW5nZS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIgLSAxLCAxKSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuI3N0b3JlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldFdpZGdldFBvc2l0aW9uKCk6IFBvc2l0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jem9uZS5yYXdWYWx1ZT8ucG9zaXRpb247XG5cdH1cblxuXHRmb2N1cygpIHtcblx0XHR0aGlzLiN6b25lLnJhd1ZhbHVlPy53aWRnZXQuZm9jdXMoKTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhcmc/OiBJbmxpbmVDaGF0UnVuT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGFzc2VydFR5cGUodGhpcy4jZWRpdG9yLmhhc01vZGVsKCkpO1xuXHRcdGNvbnN0IHVyaSA9IHRoaXMuI2VkaXRvci5nZXRNb2RlbCgpLnVyaTtcblxuXHRcdGNvbnN0IGV4aXN0aW5nU2Vzc2lvbiA9IHRoaXMuI2lubGluZUNoYXRTZXNzaW9uU2VydmljZS5nZXRTZXNzaW9uQnlUZXh0TW9kZWwodXJpKTtcblx0XHRpZiAoZXhpc3RpbmdTZXNzaW9uKSB7XG5cdFx0XHRhd2FpdCBleGlzdGluZ1Nlc3Npb24uZWRpdGluZ1Nlc3Npb24uYWNjZXB0KCk7XG5cdFx0XHRleGlzdGluZ1Nlc3Npb24uZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuI2lzQWN0aXZlQ29udHJvbGxlci5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLiNpbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UuY3JlYXRlU2Vzc2lvbih0aGlzLiNlZGl0b3IpO1xuXHRcdHJldHVybiB0aGlzLiNydW5ab25lKHNlc3Npb24sIGFyZyk7XG5cdH1cblxuXHQvKipcblx0ICogWm9uZSBtb2RlOiB1c2UgdGhlIGZ1bGwgem9uZSB3aWRnZXQgYW5kIGNoYXQgd2lkZ2V0IGZvciByZXF1ZXN0IHN1Ym1pc3Npb24uXG5cdCAqL1xuXHRhc3luYyAjcnVuWm9uZShzZXNzaW9uOiBJSW5saW5lQ2hhdFNlc3Npb24sIGFyZz86IElubGluZUNoYXRSdW5PcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0YXNzZXJ0VHlwZSh0aGlzLiNlZGl0b3IuaGFzTW9kZWwoKSk7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy4jZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXG5cdFx0Ly8gU3RvcmUgZm9yIHRyYWNraW5nIG1vZGVsIGNoYW5nZXMgZHVyaW5nIHRoaXMgc2Vzc2lvblxuXHRcdGNvbnN0IHNlc3Npb25TdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLiNhcHBseU1vZGVsRGVmYXVsdHMoc2Vzc2lvbiwgc2Vzc2lvblN0b3JlKTtcblxuXHRcdFx0aWYgKGFyZykge1xuXHRcdFx0XHRhcmcuYXR0YWNoRGlhZ25vc3RpY3MgPz89IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFERCBkaWFnbm9zdGljcyAob25seSB3aGVuIGV4cGxpY2l0bHkgcmVxdWVzdGVkKVxuXHRcdFx0aWYgKGFyZz8uYXR0YWNoRGlhZ25vc3RpY3MpIHtcblx0XHRcdFx0Y29uc3QgZW50cmllczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgW3JhbmdlLCBtYXJrZXJdIG9mIHRoaXMuI21hcmtlckRlY29yYXRpb25zU2VydmljZS5nZXRMaXZlTWFya2Vycyh1cmkpKSB7XG5cdFx0XHRcdFx0aWYgKHJhbmdlLmludGVyc2VjdFJhbmdlcyh0aGlzLiNlZGl0b3IuZ2V0U2VsZWN0aW9uKCkpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBmaWx0ZXIgPSBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhLmZyb21NYXJrZXIobWFya2VyKTtcblx0XHRcdFx0XHRcdGVudHJpZXMucHVzaChJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhLnRvRW50cnkoZmlsdGVyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLiN6b25lLnZhbHVlLndpZGdldC5jaGF0V2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KC4uLmVudHJpZXMpO1xuXHRcdFx0XHRcdGNvbnN0IG1zZyA9IGVudHJpZXMubGVuZ3RoID4gMVxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZml4TicsIFwiRml4IHRoZSBhdHRhY2hlZCBwcm9ibGVtc1wiKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZml4MScsIFwiRml4IHRoZSBhdHRhY2hlZCBwcm9ibGVtXCIpO1xuXHRcdFx0XHRcdHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0LmNoYXRXaWRnZXQuaW5wdXQuc2V0VmFsdWUobXNnLCB0cnVlKTtcblx0XHRcdFx0XHRhcmcubWVzc2FnZSA9IG1zZztcblx0XHRcdFx0XHR0aGlzLiN6b25lLnZhbHVlLndpZGdldC5jaGF0V2lkZ2V0LmlucHV0RWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCAxKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgYXJnc1xuXHRcdFx0aWYgKGFyZyAmJiBJbmxpbmVDaGF0UnVuT3B0aW9ucy5pc0lubGluZUNoYXRSdW5PcHRpb25zKGFyZykpIHtcblx0XHRcdFx0aWYgKGFyZy5pbml0aWFsUmFuZ2UpIHtcblx0XHRcdFx0XHR0aGlzLiNlZGl0b3IucmV2ZWFsUmFuZ2UoYXJnLmluaXRpYWxSYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFyZy5pbml0aWFsU2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy4jZWRpdG9yLnNldFNlbGVjdGlvbihhcmcuaW5pdGlhbFNlbGVjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFyZy5hdHRhY2htZW50cykge1xuXHRcdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGFyZy5hdHRhY2htZW50cy5tYXAoYXN5bmMgYXR0YWNobWVudCA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLiN6b25lLnZhbHVlLndpZGdldC5jaGF0V2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRGaWxlKGF0dGFjaG1lbnQpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRkZWxldGUgYXJnLmF0dGFjaG1lbnRzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhcmcubW9kZWxTZWxlY3Rvcikge1xuXHRcdFx0XHRcdGNvbnN0IGlkID0gKGF3YWl0IHRoaXMuI2xhbmd1YWdlTW9kZWxTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKGFyZy5tb2RlbFNlbGVjdG9yKSkuc29ydCgpLmF0KDApO1xuXHRcdFx0XHRcdGlmICghaWQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gbGFuZ3VhZ2UgbW9kZWxzIGZvdW5kIG1hdGNoaW5nIHNlbGVjdG9yOiAke0pTT04uc3RyaW5naWZ5KGFyZy5tb2RlbFNlbGVjdG9yKX0uYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy4jbGFuZ3VhZ2VNb2RlbFNlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChpZCk7XG5cdFx0XHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMYW5ndWFnZSBtb2RlbCBub3QgbG9hZGVkOiAke2lkfS5gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5pbnB1dC5zZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbCh7IG1ldGFkYXRhOiBtb2RlbCwgaWRlbnRpZmllcjogaWQgfSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFyZy5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0dGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5zZXRJbnB1dChhcmcubWVzc2FnZSk7XG5cdFx0XHRcdFx0aWYgKGFyZy5hdXRvU2VuZCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5hY2NlcHRJbnB1dCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWFyZz8ucmVzb2x2ZU9uUmVzcG9uc2UpIHtcblx0XHRcdFx0Ly8gREVGQVVMVDogd2FpdCBmb3IgdGhlIHNlc3Npb24gdG8gYmUgYWNjZXB0ZWQgb3IgcmVqZWN0ZWRcblx0XHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHNlc3Npb24uZWRpdGluZ1Nlc3Npb24ub25EaWREaXNwb3NlKTtcblx0XHRcdFx0Y29uc3QgcmVqZWN0ZWQgPSBzZXNzaW9uLmVkaXRpbmdTZXNzaW9uLmdldEVudHJ5KHVyaSk/LnN0YXRlLmdldCgpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLlJlamVjdGVkO1xuXHRcdFx0XHRyZXR1cm4gIXJlamVjdGVkO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyByZXNvbHZlT25SZXNwb25zZTogT05MWSB3YWl0IGZvciB0aGUgZmlsZSB0byBiZSBtb2RpZmllZFxuXHRcdFx0XHRjb25zdCBtb2RpZmllZE9icyA9IGRlcml2ZWQociA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBzZXNzaW9uLmVkaXRpbmdTZXNzaW9uLnJlYWRFbnRyeSh1cmksIHIpO1xuXHRcdFx0XHRcdHJldHVybiBlbnRyeT8uc3RhdGUucmVhZChyKSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCAmJiAhZW50cnk/LmlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5LnJlYWQocik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUobW9kaWZpZWRPYnMsIHN0YXRlID0+IHN0YXRlID09PSB0cnVlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHNlc3Npb25TdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgYWNjZXB0U2Vzc2lvbigpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy4jY3VycmVudFNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHNlc3Npb24uZWRpdGluZ1Nlc3Npb24uYWNjZXB0KCk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdH1cblxuXHRhc3luYyByZWplY3RTZXNzaW9uKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLiNjdXJyZW50U2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy4jY2hhdFNlcnZpY2UuY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKHNlc3Npb24uY2hhdE1vZGVsLnNlc3Npb25SZXNvdXJjZSwgJ2lubGluZUNoYXRSZWplY3QnKTtcblx0XHRhd2FpdCBzZXNzaW9uLmVkaXRpbmdTZXNzaW9uLnJlamVjdCgpO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHR9XG5cblx0YXN5bmMgY29udGludWVTZXNzaW9uSW5DaGF0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLiNjdXJyZW50U2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLiNpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY29udGludWVJblBhbmVsQ2hhdCwgc2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyByZXBocmFzZVNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuI2N1cnJlbnRTZXNzaW9uLmdldCgpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIHRlcm1pbmF0aW9uIHN0YXRlIGFuZCByZXN0b3JlIGlucHV0IHRleHQgaW4gdGhlIGNoYXQgd2lkZ2V0LlxuXHRcdC8vIFRoZSBhdXRvcnVuIHdhdGNoaW5nIHRlcm1pbmF0aW9uU3RhdGUgd2lsbCBmbGlwIHRoZSBjYXJkIGJhY2sgYXV0b21hdGljYWxseS5cblx0XHRjb25zdCByZXF1ZXN0VGV4dCA9IHRoaXMuI2luc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXBocmFzZUlubGluZUNoYXQsIHNlc3Npb24pO1xuXHRcdGlmIChyZXF1ZXN0VGV4dCkge1xuXHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8ud2lkZ2V0LmNoYXRXaWRnZXQuc2V0SW5wdXQocmVxdWVzdFRleHQpO1xuXHRcdH1cblx0XHR0aGlzLiN6b25lLnJhd1ZhbHVlPy53aWRnZXQuZm9jdXMoKTtcblx0fVxuXG5cdGFzeW5jICNzZWxlY3RWZW5kb3JEZWZhdWx0TW9kZWwoc2Vzc2lvbjogSUlubGluZUNoYXRTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLiN6b25lLnZhbHVlLndpZGdldC5jaGF0V2lkZ2V0LmlucHV0LnNlbGVjdGVkTGFuZ3VhZ2VNb2RlbC5nZXQoKTtcblx0XHRpZiAobW9kZWwgJiYgIW1vZGVsLm1ldGFkYXRhLmlzRGVmYXVsdEZvckxvY2F0aW9uW3Nlc3Npb24uY2hhdE1vZGVsLmluaXRpYWxMb2NhdGlvbl0pIHtcblx0XHRcdGNvbnN0IGlkcyA9IGF3YWl0IHRoaXMuI2xhbmd1YWdlTW9kZWxTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiBtb2RlbC5tZXRhZGF0YS52ZW5kb3IgfSk7XG5cdFx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgaWRzKSB7XG5cdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHRoaXMuI2xhbmd1YWdlTW9kZWxTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoaWRlbnRpZmllcik7XG5cdFx0XHRcdGlmIChjYW5kaWRhdGU/LmlzRGVmYXVsdEZvckxvY2F0aW9uW3Nlc3Npb24uY2hhdE1vZGVsLmluaXRpYWxMb2NhdGlvbl0pIHtcblx0XHRcdFx0XHR0aGlzLiN6b25lLnZhbHVlLndpZGdldC5jaGF0V2lkZ2V0LmlucHV0LnNldEN1cnJlbnRMYW5ndWFnZU1vZGVsKHsgbWV0YWRhdGE6IGNhbmRpZGF0ZSwgaWRlbnRpZmllciB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBsaWVzIG1vZGVsIGRlZmF1bHRzIGJhc2VkIG9uIHNldHRpbmdzIGFuZCB0cmFja3MgdXNlciBtb2RlbCBjaGFuZ2VzLlxuXHQgKiBQcmlvcml0aXphdGlvbjogdXNlciBzZXNzaW9uIGNob2ljZSA+IGlubGluZUNoYXQuZGVmYXVsdE1vZGVsIHNldHRpbmcgPiB2ZW5kb3IgZGVmYXVsdFxuXHQgKi9cblx0YXN5bmMgI2FwcGx5TW9kZWxEZWZhdWx0cyhzZXNzaW9uOiBJSW5saW5lQ2hhdFNlc3Npb24sIHNlc3Npb25TdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXNlclNlbGVjdGVkTW9kZWwgPSBJbmxpbmVDaGF0Q29udHJvbGxlci4jdXNlclNlbGVjdGVkTW9kZWw7XG5cdFx0Y29uc3QgZGVmYXVsdE1vZGVsU2V0dGluZyA9IHRoaXMuI2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oSW5saW5lQ2hhdENvbmZpZ0tleXMuRGVmYXVsdE1vZGVsKTtcblxuXHRcdGxldCBtb2RlbEFwcGxpZWQgPSBmYWxzZTtcblxuXHRcdC8vIDEuIFRyeSB1c2VyJ3MgZXhwbGljaXRseSBjaG9zZW4gbW9kZWwgZnJvbSBhIHByZXZpb3VzIGlubGluZSBjaGF0IGluIHRoZSBzYW1lIHNlc3Npb25cblx0XHRpZiAodXNlclNlbGVjdGVkTW9kZWwpIHtcblx0XHRcdG1vZGVsQXBwbGllZCA9IHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0LmNoYXRXaWRnZXQuaW5wdXQuc3dpdGNoTW9kZWxCeVF1YWxpZmllZE5hbWUoW3VzZXJTZWxlY3RlZE1vZGVsXSk7XG5cdFx0XHRpZiAoIW1vZGVsQXBwbGllZCkge1xuXHRcdFx0XHQvLyBVc2VyJ3MgcHJldmlvdXNseSBzZWxlY3RlZCBtb2RlbCBpcyBubyBsb25nZXIgYXZhaWxhYmxlLCBjbGVhciBpdFxuXHRcdFx0XHRJbmxpbmVDaGF0Q29udHJvbGxlci4jdXNlclNlbGVjdGVkTW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gMi4gVHJ5IGlubGluZUNoYXQuZGVmYXVsdE1vZGVsIHNldHRpbmdcblx0XHRpZiAoIW1vZGVsQXBwbGllZCAmJiBkZWZhdWx0TW9kZWxTZXR0aW5nKSB7XG5cdFx0XHRtb2RlbEFwcGxpZWQgPSB0aGlzLiN6b25lLnZhbHVlLndpZGdldC5jaGF0V2lkZ2V0LmlucHV0LnN3aXRjaE1vZGVsQnlRdWFsaWZpZWROYW1lKFtkZWZhdWx0TW9kZWxTZXR0aW5nXSk7XG5cdFx0XHRpZiAoIW1vZGVsQXBwbGllZCkge1xuXHRcdFx0XHR0aGlzLiNsb2dTZXJ2aWNlLndhcm4oYGlubGluZUNoYXQuZGVmYXVsdE1vZGVsIHNldHRpbmcgdmFsdWUgJyR7ZGVmYXVsdE1vZGVsU2V0dGluZ30nIGRpZCBub3QgbWF0Y2ggYW55IGF2YWlsYWJsZSBtb2RlbC4gRmFsbGluZyBiYWNrIHRvIHZlbmRvciBkZWZhdWx0LmApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIDMuIEZhbGwgYmFjayB0byB2ZW5kb3IgZGVmYXVsdFxuXHRcdGlmICghbW9kZWxBcHBsaWVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLiNzZWxlY3RWZW5kb3JEZWZhdWx0TW9kZWwoc2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgbW9kZWwgY2hhbmdlcyAtIHN0b3JlIHVzZXIncyBleHBsaWNpdCBjaG9pY2UgaW4gdGhlIGdpdmVuIHNlc3Npb25zLlxuXHRcdC8vIE5PVEU6IFRoaXMgY3VycmVudGx5IGRldGVjdHMgYW55IG1vZGVsIGNoYW5nZSwgbm90IGp1c3QgdXNlci1pbml0aWF0ZWQgb25lcy5cblx0XHRsZXQgaW5pdGlhbE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRzZXNzaW9uU3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBuZXdNb2RlbCA9IHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0LmNoYXRXaWRnZXQuaW5wdXQuc2VsZWN0ZWRMYW5ndWFnZU1vZGVsLnJlYWQocik7XG5cdFx0XHRpZiAoIW5ld01vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghaW5pdGlhbE1vZGVsSWQpIHtcblx0XHRcdFx0aW5pdGlhbE1vZGVsSWQgPSBuZXdNb2RlbC5pZGVudGlmaWVyO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW5pdGlhbE1vZGVsSWQgIT09IG5ld01vZGVsLmlkZW50aWZpZXIpIHtcblx0XHRcdFx0Ly8gVXNlciBleHBsaWNpdGx5IGNoYW5nZWQgbW9kZWwsIHN0b3JlIHRoZWlyIGNob2ljZSBhcyBxdWFsaWZpZWQgbmFtZVxuXHRcdFx0XHRJbmxpbmVDaGF0Q29udHJvbGxlci4jdXNlclNlbGVjdGVkTW9kZWwgPSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5hc1F1YWxpZmllZE5hbWUobmV3TW9kZWwubWV0YWRhdGEpO1xuXHRcdFx0XHRpbml0aWFsTW9kZWxJZCA9IG5ld01vZGVsLmlkZW50aWZpZXI7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWTtBQUNyQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFNBQVMsU0FBc0IscUJBQXFCLDJCQUEyQixpQkFBaUIsb0JBQW9CO0FBQzdILFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFFcEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBb0IsZ0JBQWdC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
