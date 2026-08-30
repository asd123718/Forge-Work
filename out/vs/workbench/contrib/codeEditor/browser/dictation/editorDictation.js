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
import "./editorDictation.css";
import { localize, localize2 } from "../../../../../nls.js";
import { getActiveWindow, getWindow } from "../../../../../base/browser/dom.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ContentWidgetPositionPreference } from "../../../../../editor/browser/editorBrowser.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { HasSpeechProvider, ISpeechService, SpeechToTextInProgress, SpeechToTextStatus } from "../../../speech/common/speechService.js";
import { ChatContextKeys } from "../../../chat/common/actions/chatContextKeys.js";
import { ChatSpeechToTextState, IChatSpeechToTextService } from "../../../chat/browser/speechToText/chatSpeechToTextService.js";
import { activeDictationEditor, isDictating, startDictation, stopDictation } from "../../../chat/browser/speechToText/dictationSession.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { EditorOption } from "../../../../../editor/common/config/editorOptions.js";
import { EditorAction2, EditorContributionInstantiation, registerEditorContribution } from "../../../../../editor/browser/editorExtensions.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { EditOperation } from "../../../../../editor/common/core/editOperation.js";
import { Selection } from "../../../../../editor/common/core/selection.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { assertReturnsDefined } from "../../../../../base/common/types.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { toAction } from "../../../../../base/common/actions.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { EmptyTextEditorHintContributionId } from "../emptyTextEditorHint/emptyTextEditorHintTypes.js";
const EDITOR_DICTATION_IN_PROGRESS = new RawContextKey("editorDictation.inProgress", false);
const VOICE_CATEGORY = localize2("voiceCategory", "Voice");
const BuiltinDictationConfigured = ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.speechToTextConfigured);
const _EditorDictationStartAction = class _EditorDictationStartAction extends EditorAction2 {
  constructor() {
    super({
      id: _EditorDictationStartAction.ID,
      title: localize2("startDictation", "Start Dictation in Editor"),
      category: VOICE_CATEGORY,
      precondition: ContextKeyExpr.and(
        // Available either through the built-in on-device engine or the
        // speech extension's provider.
        ContextKeyExpr.or(HasSpeechProvider, BuiltinDictationConfigured),
        // Keep the toggle available for editor dictation, but not unrelated speech-to-text sessions.
        ContextKeyExpr.or(SpeechToTextInProgress.toNegated(), EDITOR_DICTATION_IN_PROGRESS),
        EditorContextKeys.readOnly.toNegated()
        // disable in read-only editors
      ),
      f1: true,
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyV,
        weight: KeybindingWeight.WorkbenchContrib,
        secondary: isWindows ? [
          KeyMod.Alt | KeyCode.Backquote
        ] : void 0
      }
    });
  }
  runEditorCommand(accessor, editor) {
    const dictation = EditorDictation.get(editor);
    if (dictation?.isInProgress()) {
      dictation.stop();
      return;
    }
    const keybindingService = accessor.get(IKeybindingService);
    const holdMode = keybindingService.enableKeybindingHoldMode(this.desc.id);
    if (holdMode) {
      let shouldCallStop = false;
      const handle = setTimeout(() => {
        shouldCallStop = true;
      }, 500);
      holdMode.finally(() => {
        clearTimeout(handle);
        if (shouldCallStop) {
          EditorDictation.get(editor)?.stop();
        }
      });
    }
    EditorDictation.get(editor)?.start();
  }
};
_EditorDictationStartAction.ID = "workbench.action.editorDictation.start";
let EditorDictationStartAction = _EditorDictationStartAction;
const _EditorDictationStopAction = class _EditorDictationStopAction extends EditorAction2 {
  constructor() {
    super({
      id: _EditorDictationStopAction.ID,
      title: localize2("stopDictation", "Stop Dictation in Editor"),
      category: VOICE_CATEGORY,
      precondition: EDITOR_DICTATION_IN_PROGRESS,
      f1: true
    });
  }
  runEditorCommand(_accessor, editor) {
    EditorDictation.get(editor)?.stop();
  }
};
_EditorDictationStopAction.ID = "workbench.action.editorDictation.stop";
let EditorDictationStopAction = _EditorDictationStopAction;
class DictationWidget extends Disposable {
  constructor(editor, keybindingService) {
    super();
    this.editor = editor;
    this.suppressMouseDown = true;
    this.allowEditorOverflow = true;
    this.domNode = document.createElement("div");
    const actionBar = this._register(new ActionBar(this.domNode));
    const stopActionKeybinding = keybindingService.lookupKeybinding(EditorDictationStartAction.ID)?.getLabel();
    actionBar.push(toAction({
      id: EditorDictationStopAction.ID,
      label: stopActionKeybinding ? localize("stopDictationShort1", "Stop Dictation ({0})", stopActionKeybinding) : localize("stopDictationShort2", "Stop Dictation"),
      class: ThemeIcon.asClassName(Codicon.micFilled),
      run: () => EditorDictation.get(editor)?.stop()
    }), { icon: true, label: false, keybinding: stopActionKeybinding });
    this.domNode.classList.add("editor-dictation-widget");
    this.domNode.appendChild(actionBar.domNode);
  }
  getId() {
    return "editorDictation";
  }
  getDomNode() {
    return this.domNode;
  }
  getPosition() {
    if (!this.editor.hasModel()) {
      return null;
    }
    const selection = this.editor.getSelection();
    return {
      position: selection.getPosition(),
      preference: [
        selection.getPosition().equals(selection.getStartPosition()) ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW,
        ContentWidgetPositionPreference.EXACT
      ]
    };
  }
  beforeRender() {
    const position = this.editor.getPosition();
    const lineHeight = position ? this.editor.getLineHeightForPosition(position) : this.editor.getOption(EditorOption.lineHeight);
    const width = this.editor.getLayoutInfo().contentWidth * 0.7;
    this.domNode.style.setProperty("--vscode-editor-dictation-widget-height", `${lineHeight}px`);
    this.domNode.style.setProperty("--vscode-editor-dictation-widget-width", `${width}px`);
    return null;
  }
  show() {
    this.editor.addContentWidget(this);
  }
  layout() {
    this.editor.layoutContentWidget(this);
  }
  active() {
    this.domNode.classList.add("recording");
  }
  hide() {
    this.domNode.classList.remove("recording");
    this.editor.removeContentWidget(this);
  }
}
let EditorDictation = class extends Disposable {
  constructor(editor, speechService, chatSpeechToTextService, logService, contextKeyService, keybindingService) {
    super();
    this.editor = editor;
    this.speechService = speechService;
    this.chatSpeechToTextService = chatSpeechToTextService;
    this.logService = logService;
    this.sessionDisposables = this._register(new MutableDisposable());
    this.widget = this._register(new DictationWidget(this.editor, keybindingService));
    this.editorDictationInProgress = EDITOR_DICTATION_IN_PROGRESS.bindTo(contextKeyService);
  }
  static get(editor) {
    return editor.getContribution(EditorDictation.ID);
  }
  /** True while a dictation session is active in this editor. */
  isInProgress() {
    return !!this.editorDictationInProgress.get();
  }
  async start() {
    this.editor.getContribution(EmptyTextEditorHintContributionId)?.disposeHint();
    if (this.chatSpeechToTextService.isConfigured) {
      return this.startBuiltin();
    }
    return this.startWithProvider();
  }
  /**
   * Run editor dictation through the built-in on-device engine, reusing the
   * shared chat dictation renderer (live transcript, interim styling, and
   * "Listening…" placeholder). A floating stop widget is shown so the mic can
   * be stopped by mouse as well as by toggling the start keybinding.
   */
  async startBuiltin() {
    const disposables = new DisposableStore();
    this.sessionDisposables.value = disposables;
    this.widget.show();
    this.widget.active();
    disposables.add(toDisposable(() => this.widget.hide()));
    this.editorDictationInProgress.set(true);
    disposables.add(toDisposable(() => this.editorDictationInProgress.reset()));
    disposables.add(this.editor.onDidChangeCursorPosition(() => this.widget.layout()));
    const window = getWindow(this.editor.getDomNode()) ?? getActiveWindow();
    await startDictation(this.chatSpeechToTextService, this.editor, window, this.logService, "editor");
    if (activeDictationEditor() !== this.editor) {
      this.sessionDisposables.clear();
      return;
    }
    disposables.add(this.chatSpeechToTextService.onDidChangeState((state) => {
      if (state === ChatSpeechToTextState.Idle) {
        this.sessionDisposables.clear();
      }
    }));
  }
  async startWithProvider() {
    const disposables = new DisposableStore();
    this.sessionDisposables.value = disposables;
    this.widget.show();
    disposables.add(toDisposable(() => this.widget.hide()));
    this.editorDictationInProgress.set(true);
    disposables.add(toDisposable(() => this.editorDictationInProgress.reset()));
    const collection = this.editor.createDecorationsCollection();
    disposables.add(toDisposable(() => collection.clear()));
    disposables.add(this.editor.onDidChangeCursorPosition(() => this.widget.layout()));
    let previewStart = void 0;
    let lastReplaceTextLength = 0;
    const replaceText = (text, isPreview) => {
      if (!previewStart) {
        previewStart = assertReturnsDefined(this.editor.getPosition());
      }
      const endPosition = new Position(previewStart.lineNumber, previewStart.column + text.length);
      this.editor.executeEdits(EditorDictation.ID, [
        EditOperation.replace(Range.fromPositions(previewStart, previewStart.with(void 0, previewStart.column + lastReplaceTextLength)), text)
      ], [
        Selection.fromPositions(endPosition)
      ]);
      if (isPreview) {
        collection.set([
          {
            range: Range.fromPositions(previewStart, previewStart.with(void 0, previewStart.column + text.length)),
            options: {
              description: "editor-dictation-preview",
              inlineClassName: "ghost-text-decoration-preview"
            }
          }
        ]);
      } else {
        collection.clear();
      }
      lastReplaceTextLength = text.length;
      if (!isPreview) {
        previewStart = void 0;
        lastReplaceTextLength = 0;
      }
      this.editor.revealPositionInCenterIfOutsideViewport(endPosition);
    };
    const cts = new CancellationTokenSource();
    disposables.add(toDisposable(() => cts.dispose(true)));
    const session = await this.speechService.createSpeechToTextSession(cts.token, "editor");
    disposables.add(session.onDidChange((e) => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      switch (e.status) {
        case SpeechToTextStatus.Started:
          this.widget.active();
          break;
        case SpeechToTextStatus.Stopped:
          disposables.dispose();
          break;
        case SpeechToTextStatus.Recognizing: {
          if (!e.text) {
            return;
          }
          replaceText(e.text, true);
          break;
        }
        case SpeechToTextStatus.Recognized: {
          if (!e.text) {
            return;
          }
          replaceText(`${e.text} `, false);
          break;
        }
      }
    }));
  }
  stop() {
    if (isDictating() && activeDictationEditor() === this.editor) {
      stopDictation();
      return;
    }
    this.sessionDisposables.clear();
  }
};
EditorDictation.ID = "editorDictation";
EditorDictation = __decorateClass([
  __decorateParam(1, ISpeechService),
  __decorateParam(2, IChatSpeechToTextService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IKeybindingService)
], EditorDictation);
registerEditorContribution(EditorDictation.ID, EditorDictation, EditorContributionInstantiation.Lazy);
registerAction2(EditorDictationStartAction);
registerAction2(EditorDictationStopAction);
export {
  DictationWidget,
  EditorDictation,
  EditorDictationStartAction,
  EditorDictationStopAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXGRpY3RhdGlvblxcZWRpdG9yRGljdGF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL2VkaXRvckRpY3RhdGlvbi5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3csIGdldFdpbmRvdywgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsIElDb2RlRWRpdG9yLCBJQ29udGVudFdpZGdldCwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEhhc1NwZWVjaFByb3ZpZGVyLCBJU3BlZWNoU2VydmljZSwgU3BlZWNoVG9UZXh0SW5Qcm9ncmVzcywgU3BlZWNoVG9UZXh0U3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vc3BlZWNoL2NvbW1vbi9zcGVlY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRTcGVlY2hUb1RleHRTdGF0ZSwgSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBhY3RpdmVEaWN0YXRpb25FZGl0b3IsIGlzRGljdGF0aW5nLCBzdGFydERpY3RhdGlvbiwgc3RvcERpY3RhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9zcGVlY2hUb1RleHQvZGljdGF0aW9uU2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24yLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRW1wdHlUZXh0RWRpdG9ySGludENvbnRyaWJ1dGlvbklkLCBJRW1wdHlUZXh0RWRpdG9ySGludENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uL2VtcHR5VGV4dEVkaXRvckhpbnQvZW1wdHlUZXh0RWRpdG9ySGludFR5cGVzLmpzJztcblxuY29uc3QgRURJVE9SX0RJQ1RBVElPTl9JTl9QUk9HUkVTUyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdlZGl0b3JEaWN0YXRpb24uaW5Qcm9ncmVzcycsIGZhbHNlKTtcbmNvbnN0IFZPSUNFX0NBVEVHT1JZID0gbG9jYWxpemUyKCd2b2ljZUNhdGVnb3J5JywgXCJWb2ljZVwiKTtcblxuLyoqXG4gKiBUcnVlIHdoZW4gdGhlIGJ1aWx0LWluIG9uLWRldmljZSBkaWN0YXRpb24gZW5naW5lIGlzIGF2YWlsYWJsZSAoYW5kIEFJXG4gKiBmZWF0dXJlcyBhcmUgZW5hYmxlZCkuIE1pcnJvcnMgdGhlIGNoYXQgaW5wdXQncyBgQ2hhdFNwZWVjaFRvVGV4dENvbmZpZ3VyZWRgXG4gKiBnYXRlIHNvIGVkaXRvciBkaWN0YXRpb24gY2FuIHJ1biB0aHJvdWdoIHRoZSBidWlsdC1pbiBlbmdpbmUgZXZlbiB3aGVuIHRoZVxuICogYG1zLXZzY29kZS52c2NvZGUtc3BlZWNoYCBleHRlbnNpb24gaXMgbm90IGluc3RhbGxlZC5cbiAqL1xuY29uc3QgQnVpbHRpbkRpY3RhdGlvbkNvbmZpZ3VyZWQgPSBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIENoYXRDb250ZXh0S2V5cy5zcGVlY2hUb1RleHRDb25maWd1cmVkKTtcblxuZXhwb3J0IGNsYXNzIEVkaXRvckRpY3RhdGlvblN0YXJ0QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yRGljdGF0aW9uLnN0YXJ0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRWRpdG9yRGljdGF0aW9uU3RhcnRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzdGFydERpY3RhdGlvbicsIFwiU3RhcnQgRGljdGF0aW9uIGluIEVkaXRvclwiKSxcblx0XHRcdGNhdGVnb3J5OiBWT0lDRV9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHQvLyBBdmFpbGFibGUgZWl0aGVyIHRocm91Z2ggdGhlIGJ1aWx0LWluIG9uLWRldmljZSBlbmdpbmUgb3IgdGhlXG5cdFx0XHRcdC8vIHNwZWVjaCBleHRlbnNpb24ncyBwcm92aWRlci5cblx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoSGFzU3BlZWNoUHJvdmlkZXIsIEJ1aWx0aW5EaWN0YXRpb25Db25maWd1cmVkKSxcblx0XHRcdFx0Ly8gS2VlcCB0aGUgdG9nZ2xlIGF2YWlsYWJsZSBmb3IgZWRpdG9yIGRpY3RhdGlvbiwgYnV0IG5vdCB1bnJlbGF0ZWQgc3BlZWNoLXRvLXRleHQgc2Vzc2lvbnMuXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFNwZWVjaFRvVGV4dEluUHJvZ3Jlc3MudG9OZWdhdGVkKCksIEVESVRPUl9ESUNUQVRJT05fSU5fUFJPR1JFU1MpLFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5yZWFkT25seS50b05lZ2F0ZWQoKVx0Ly8gZGlzYWJsZSBpbiByZWFkLW9ubHkgZWRpdG9yc1xuXHRcdFx0KSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVYsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRzZWNvbmRhcnk6IGlzV2luZG93cyA/IFtcblx0XHRcdFx0XHRLZXlNb2QuQWx0IHwgS2V5Q29kZS5CYWNrcXVvdGVcblx0XHRcdFx0XSA6IHVuZGVmaW5lZFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGRpY3RhdGlvbiA9IEVkaXRvckRpY3RhdGlvbi5nZXQoZWRpdG9yKTtcblxuXHRcdC8vIFRvZ2dsZTogcHJlc3NpbmcgdGhlIHN0YXJ0IGtleWJpbmRpbmcgYWdhaW4gd2hpbGUgZGljdGF0aW9uIGlzIGluXG5cdFx0Ly8gcHJvZ3Jlc3Mgc3RvcHMgaXQsIG1pcnJvcmluZyB0aGUgY2hhdCBpbnB1dCdzIENtZC9DdHJsK0kgYmVoYXZpb3IuXG5cdFx0aWYgKGRpY3RhdGlvbj8uaXNJblByb2dyZXNzKCkpIHtcblx0XHRcdGRpY3RhdGlvbi5zdG9wKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUtleWJpbmRpbmdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhvbGRNb2RlID0ga2V5YmluZGluZ1NlcnZpY2UuZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKHRoaXMuZGVzYy5pZCk7XG5cdFx0aWYgKGhvbGRNb2RlKSB7XG5cdFx0XHRsZXQgc2hvdWxkQ2FsbFN0b3AgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgaGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHNob3VsZENhbGxTdG9wID0gdHJ1ZTtcblx0XHRcdH0sIDUwMCk7XG5cblx0XHRcdGhvbGRNb2RlLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQoaGFuZGxlKTtcblxuXHRcdFx0XHRpZiAoc2hvdWxkQ2FsbFN0b3ApIHtcblx0XHRcdFx0XHRFZGl0b3JEaWN0YXRpb24uZ2V0KGVkaXRvcik/LnN0b3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0RWRpdG9yRGljdGF0aW9uLmdldChlZGl0b3IpPy5zdGFydCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JEaWN0YXRpb25TdG9wQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yRGljdGF0aW9uLnN0b3AnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFZGl0b3JEaWN0YXRpb25TdG9wQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3RvcERpY3RhdGlvbicsIFwiU3RvcCBEaWN0YXRpb24gaW4gRWRpdG9yXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IFZPSUNFX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFRElUT1JfRElDVEFUSU9OX0lOX1BST0dSRVNTLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bkVkaXRvckNvbW1hbmQoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0RWRpdG9yRGljdGF0aW9uLmdldChlZGl0b3IpPy5zdG9wKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpY3RhdGlvbldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cblx0cmVhZG9ubHkgc3VwcHJlc3NNb3VzZURvd24gPSB0cnVlO1xuXHRyZWFkb25seSBhbGxvd0VkaXRvck92ZXJmbG93ID0gdHJ1ZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcih0aGlzLmRvbU5vZGUpKTtcblx0XHRjb25zdCBzdG9wQWN0aW9uS2V5YmluZGluZyA9IGtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoRWRpdG9yRGljdGF0aW9uU3RhcnRBY3Rpb24uSUQpPy5nZXRMYWJlbCgpO1xuXHRcdGFjdGlvbkJhci5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdGlkOiBFZGl0b3JEaWN0YXRpb25TdG9wQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IHN0b3BBY3Rpb25LZXliaW5kaW5nID8gbG9jYWxpemUoJ3N0b3BEaWN0YXRpb25TaG9ydDEnLCBcIlN0b3AgRGljdGF0aW9uICh7MH0pXCIsIHN0b3BBY3Rpb25LZXliaW5kaW5nKSA6IGxvY2FsaXplKCdzdG9wRGljdGF0aW9uU2hvcnQyJywgXCJTdG9wIERpY3RhdGlvblwiKSxcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5taWNGaWxsZWQpLFxuXHRcdFx0cnVuOiAoKSA9PiBFZGl0b3JEaWN0YXRpb24uZ2V0KGVkaXRvcik/LnN0b3AoKVxuXHRcdH0pLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSwga2V5YmluZGluZzogc3RvcEFjdGlvbktleWJpbmRpbmcgfSk7XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnZWRpdG9yLWRpY3RhdGlvbi13aWRnZXQnKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoYWN0aW9uQmFyLmRvbU5vZGUpO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ2VkaXRvckRpY3RhdGlvbic7XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpLFxuXHRcdFx0cHJlZmVyZW5jZTogW1xuXHRcdFx0XHRzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKS5lcXVhbHMoc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKSkgPyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkFCT1ZFIDogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPVyxcblx0XHRcdFx0Q29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5FWEFDVFxuXHRcdFx0XVxuXHRcdH07XG5cdH1cblxuXHRiZWZvcmVSZW5kZXIoKTogSURpbWVuc2lvbiB8IG51bGwge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gcG9zaXRpb24gPyB0aGlzLmVkaXRvci5nZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24ocG9zaXRpb24pIDogdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCB3aWR0aCA9IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS5jb250ZW50V2lkdGggKiAwLjc7XG5cblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWVkaXRvci1kaWN0YXRpb24td2lkZ2V0LWhlaWdodCcsIGAke2xpbmVIZWlnaHR9cHhgKTtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWVkaXRvci1kaWN0YXRpb24td2lkZ2V0LXdpZHRoJywgYCR7d2lkdGh9cHhgKTtcblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0c2hvdygpIHtcblx0XHR0aGlzLmVkaXRvci5hZGRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0bGF5b3V0KCk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRhY3RpdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3JlY29yZGluZycpO1xuXHR9XG5cblx0aGlkZSgpIHtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgncmVjb3JkaW5nJyk7XG5cdFx0dGhpcy5lZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh0aGlzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yRGljdGF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3JEaWN0YXRpb24nO1xuXG5cdHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IEVkaXRvckRpY3RhdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPEVkaXRvckRpY3RhdGlvbj4oRWRpdG9yRGljdGF0aW9uLklEKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2lkZ2V0OiBEaWN0YXRpb25XaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yRGljdGF0aW9uSW5Qcm9ncmVzczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJU3BlZWNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNwZWVjaFNlcnZpY2U6IElTcGVlY2hTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U3BlZWNoVG9UZXh0U2VydmljZTogSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMud2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpY3RhdGlvbldpZGdldCh0aGlzLmVkaXRvciwga2V5YmluZGluZ1NlcnZpY2UpKTtcblx0XHR0aGlzLmVkaXRvckRpY3RhdGlvbkluUHJvZ3Jlc3MgPSBFRElUT1JfRElDVEFUSU9OX0lOX1BST0dSRVNTLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHQvKiogVHJ1ZSB3aGlsZSBhIGRpY3RhdGlvbiBzZXNzaW9uIGlzIGFjdGl2ZSBpbiB0aGlzIGVkaXRvci4gKi9cblx0aXNJblByb2dyZXNzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZWRpdG9yRGljdGF0aW9uSW5Qcm9ncmVzcy5nZXQoKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxJRW1wdHlUZXh0RWRpdG9ySGludENvbnRyaWJ1dGlvbj4oRW1wdHlUZXh0RWRpdG9ySGludENvbnRyaWJ1dGlvbklkKT8uZGlzcG9zZUhpbnQoKTtcblxuXHRcdC8vIFByZWZlciB0aGUgYnVpbHQtaW4gb24tZGV2aWNlIGVuZ2luZSAocHJpdmF0ZSwgaW4tYm94KSB3aGVuIGl0IGlzXG5cdFx0Ly8gY29uZmlndXJlZCwgZmFsbGluZyBiYWNrIHRvIHRoZSBzcGVlY2ggZXh0ZW5zaW9uJ3MgcHJvdmlkZXIgb3RoZXJ3aXNlLlxuXHRcdGlmICh0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLmlzQ29uZmlndXJlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc3RhcnRCdWlsdGluKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnN0YXJ0V2l0aFByb3ZpZGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogUnVuIGVkaXRvciBkaWN0YXRpb24gdGhyb3VnaCB0aGUgYnVpbHQtaW4gb24tZGV2aWNlIGVuZ2luZSwgcmV1c2luZyB0aGVcblx0ICogc2hhcmVkIGNoYXQgZGljdGF0aW9uIHJlbmRlcmVyIChsaXZlIHRyYW5zY3JpcHQsIGludGVyaW0gc3R5bGluZywgYW5kXG5cdCAqIFwiTGlzdGVuaW5nXHUyMDI2XCIgcGxhY2Vob2xkZXIpLiBBIGZsb2F0aW5nIHN0b3Agd2lkZ2V0IGlzIHNob3duIHNvIHRoZSBtaWMgY2FuXG5cdCAqIGJlIHN0b3BwZWQgYnkgbW91c2UgYXMgd2VsbCBhcyBieSB0b2dnbGluZyB0aGUgc3RhcnQga2V5YmluZGluZy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgc3RhcnRCdWlsdGluKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuc2Vzc2lvbkRpc3Bvc2FibGVzLnZhbHVlID0gZGlzcG9zYWJsZXM7XG5cblx0XHR0aGlzLndpZGdldC5zaG93KCk7XG5cdFx0dGhpcy53aWRnZXQuYWN0aXZlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLndpZGdldC5oaWRlKCkpKTtcblxuXHRcdHRoaXMuZWRpdG9yRGljdGF0aW9uSW5Qcm9ncmVzcy5zZXQodHJ1ZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmVkaXRvckRpY3RhdGlvbkluUHJvZ3Jlc3MucmVzZXQoKSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKCkgPT4gdGhpcy53aWRnZXQubGF5b3V0KCkpKTtcblxuXHRcdGNvbnN0IHdpbmRvdyA9IGdldFdpbmRvdyh0aGlzLmVkaXRvci5nZXREb21Ob2RlKCkpID8/IGdldEFjdGl2ZVdpbmRvdygpO1xuXHRcdGF3YWl0IHN0YXJ0RGljdGF0aW9uKHRoaXMuY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsIHRoaXMuZWRpdG9yLCB3aW5kb3csIHRoaXMubG9nU2VydmljZSwgJ2VkaXRvcicpO1xuXG5cdFx0Ly8gSWYgdGhlIHNlc3Npb24gZGlkIG5vdCB0YWtlIChzdGFydCBmYWlsZWQgd2l0aG91dCBhIHN0YXRlIHRyYW5zaXRpb24pLFxuXHRcdC8vIGRvIG5vdCBsZWF2ZSB0aGUgd2lkZ2V0IHN0cmFuZGVkLlxuXHRcdGlmIChhY3RpdmVEaWN0YXRpb25FZGl0b3IoKSAhPT0gdGhpcy5lZGl0b3IpIHtcblx0XHRcdHRoaXMuc2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB0aGUgc2hhcmVkIHNlc3Npb24gZW5kcyBvbiBpdHMgb3duIChmaW5hbCB0cmFuc2NyaXB0IGFwcGxpZWQsIGFuXG5cdFx0Ly8gZXJyb3IsIG9yIHRoZSBtb2RlbCBmYWlsaW5nIHRvIGxvYWQpLCB0ZWFyIGRvd24gdGhlIGVkaXRvci1zaWRlIFVJLiBUaGlzXG5cdFx0Ly8gaXMgcmVnaXN0ZXJlZCBvbmx5IGFmdGVyIHRoZSB0YWtlb3ZlciBpbiBgc3RhcnREaWN0YXRpb25gIGhhcyBzZXR0bGVkIHNvXG5cdFx0Ly8gY2FuY2VsbGluZyBhIHByZXZpb3VzIHN1cmZhY2UncyBzZXNzaW9uIGNhbm5vdCB0ZWFyIGRvd24gdGhpcyBvbmUuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VTdGF0ZShzdGF0ZSA9PiB7XG5cdFx0XHRpZiAoc3RhdGUgPT09IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5JZGxlKSB7XG5cdFx0XHRcdHRoaXMuc2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdGFydFdpdGhQcm92aWRlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLnNlc3Npb25EaXNwb3NhYmxlcy52YWx1ZSA9IGRpc3Bvc2FibGVzO1xuXG5cdFx0dGhpcy53aWRnZXQuc2hvdygpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy53aWRnZXQuaGlkZSgpKSk7XG5cblx0XHR0aGlzLmVkaXRvckRpY3RhdGlvbkluUHJvZ3Jlc3Muc2V0KHRydWUpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5lZGl0b3JEaWN0YXRpb25JblByb2dyZXNzLnJlc2V0KCkpKTtcblxuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSB0aGlzLmVkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbGxlY3Rpb24uY2xlYXIoKSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKCkgPT4gdGhpcy53aWRnZXQubGF5b3V0KCkpKTtcblxuXHRcdGxldCBwcmV2aWV3U3RhcnQ6IFBvc2l0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGxhc3RSZXBsYWNlVGV4dExlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcmVwbGFjZVRleHQgPSAodGV4dDogc3RyaW5nLCBpc1ByZXZpZXc6IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmICghcHJldmlld1N0YXJ0KSB7XG5cdFx0XHRcdHByZXZpZXdTdGFydCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbmRQb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihwcmV2aWV3U3RhcnQubGluZU51bWJlciwgcHJldmlld1N0YXJ0LmNvbHVtbiArIHRleHQubGVuZ3RoKTtcblx0XHRcdHRoaXMuZWRpdG9yLmV4ZWN1dGVFZGl0cyhFZGl0b3JEaWN0YXRpb24uSUQsIFtcblx0XHRcdFx0RWRpdE9wZXJhdGlvbi5yZXBsYWNlKFJhbmdlLmZyb21Qb3NpdGlvbnMocHJldmlld1N0YXJ0LCBwcmV2aWV3U3RhcnQud2l0aCh1bmRlZmluZWQsIHByZXZpZXdTdGFydC5jb2x1bW4gKyBsYXN0UmVwbGFjZVRleHRMZW5ndGgpKSwgdGV4dClcblx0XHRcdF0sIFtcblx0XHRcdFx0U2VsZWN0aW9uLmZyb21Qb3NpdGlvbnMoZW5kUG9zaXRpb24pXG5cdFx0XHRdKTtcblxuXHRcdFx0aWYgKGlzUHJldmlldykge1xuXHRcdFx0XHRjb2xsZWN0aW9uLnNldChbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMocHJldmlld1N0YXJ0LCBwcmV2aWV3U3RhcnQud2l0aCh1bmRlZmluZWQsIHByZXZpZXdTdGFydC5jb2x1bW4gKyB0ZXh0Lmxlbmd0aCkpLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2VkaXRvci1kaWN0YXRpb24tcHJldmlldycsXG5cdFx0XHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogJ2dob3N0LXRleHQtZGVjb3JhdGlvbi1wcmV2aWV3J1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb2xsZWN0aW9uLmNsZWFyKCk7XG5cdFx0XHR9XG5cblx0XHRcdGxhc3RSZXBsYWNlVGV4dExlbmd0aCA9IHRleHQubGVuZ3RoO1xuXHRcdFx0aWYgKCFpc1ByZXZpZXcpIHtcblx0XHRcdFx0cHJldmlld1N0YXJ0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRsYXN0UmVwbGFjZVRleHRMZW5ndGggPSAwO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVkaXRvci5yZXZlYWxQb3NpdGlvbkluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoZW5kUG9zaXRpb24pO1xuXHRcdH07XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5zcGVlY2hTZXJ2aWNlLmNyZWF0ZVNwZWVjaFRvVGV4dFNlc3Npb24oY3RzLnRva2VuLCAnZWRpdG9yJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlc3Npb24ub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0c3dpdGNoIChlLnN0YXR1cykge1xuXHRcdFx0XHRjYXNlIFNwZWVjaFRvVGV4dFN0YXR1cy5TdGFydGVkOlxuXHRcdFx0XHRcdHRoaXMud2lkZ2V0LmFjdGl2ZSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFNwZWVjaFRvVGV4dFN0YXR1cy5TdG9wcGVkOlxuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmc6IHtcblx0XHRcdFx0XHRpZiAoIWUudGV4dCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJlcGxhY2VUZXh0KGUudGV4dCwgdHJ1ZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZDoge1xuXHRcdFx0XHRcdGlmICghZS50ZXh0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVwbGFjZVRleHQoYCR7ZS50ZXh0fSBgLCBmYWxzZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRzdG9wKCk6IHZvaWQge1xuXHRcdC8vIEJ1aWx0LWluIGRpY3RhdGlvbiBpbnRvIHRoaXMgZWRpdG9yIGlzIG93bmVkIGJ5IHRoZSBzaGFyZWQgY2hhdFxuXHRcdC8vIGRpY3RhdGlvbiBzZXNzaW9uOyBzdG9wIGl0IHRoZXJlIHNvIHRoZSBmaW5hbCB0cmFuc2NyaXB0IGlzIGFwcGxpZWQuXG5cdFx0aWYgKGlzRGljdGF0aW5nKCkgJiYgYWN0aXZlRGljdGF0aW9uRWRpdG9yKCkgPT09IHRoaXMuZWRpdG9yKSB7XG5cdFx0XHRzdG9wRGljdGF0aW9uKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oRWRpdG9yRGljdGF0aW9uLklELCBFZGl0b3JEaWN0YXRpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uTGF6eSk7XG5yZWdpc3RlckFjdGlvbjIoRWRpdG9yRGljdGF0aW9uU3RhcnRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEVkaXRvckRpY3RhdGlvblN0b3BBY3Rpb24pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGlCQUFpQixpQkFBNkI7QUFDdkQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQzdFLFNBQVMsdUNBQTRGO0FBRXJHLFNBQVMsZ0JBQTZCLG9CQUFvQixxQkFBcUI7QUFDL0UsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxtQkFBbUIsZ0JBQWdCLHdCQUF3QiwwQkFBMEI7QUFDOUYs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QUFBQSxZQUNsQjtBQUFBLFVBQ0Q7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLE9BQU87QUFDTixtQkFBVyxNQUFNO0FBQUEsTUFDbEI7QUFFQSw4QkFBd0IsS0FBSztBQUM3QixVQUFJLENBQUMsV0FBVztBQUNmLHVCQUFlO0FBQ2YsZ0NBQXdCO0FBQUEsTUFDekI7QUFFQSxXQUFLLE9BQU8sd0NBQXdDLFdBQVc7QUFBQSxJQUNoRTtBQUVBLFVBQU0sTUFBTSxJQUFJLHdCQUF3QjtBQUN4QyxnQkFBWSxJQUFJLGFBQWEsTUFBTSxJQUFJLFFBQVEsSUFBSSxDQUFDLENBQUM7QUFFckQsVUFBTSxVQUFVLE1BQU0sS0FBSyxjQUFjLDBCQUEwQixJQUFJLE9BQU8sUUFBUTtBQUN0RixnQkFBWSxJQUFJLFFBQVEsWUFBWSxPQUFLO0FBQ3hDLFVBQUksSUFBSSxNQUFNLHlCQUF5QjtBQUN0QztBQUFBLE1BQ0Q7QUFFQSxjQUFRLEVBQUUsUUFBUTtBQUFBLFFBQ2pCLEtBQUssbUJBQW1CO0FBQ3ZCLGVBQUssT0FBTyxPQUFPO0FBQ25CO0FBQUEsUUFDRCxLQUFLLG1CQUFtQjtBQUN2QixzQkFBWSxRQUFRO0FBQ3BCO0FBQUEsUUFDRCxLQUFLLG1CQUFtQixhQUFhO0FBQ3BDLGNBQUksQ0FBQyxFQUFFLE1BQU07QUFDWjtBQUFBLFVBQ0Q7QUFFQSxzQkFBWSxFQUFFLE1BQU0sSUFBSTtBQUN4QjtBQUFBLFFBQ0Q7QUFBQSxRQUNBLEtBQUssbUJBQW1CLFlBQVk7QUFDbkMsY0FBSSxDQUFDLEVBQUUsTUFBTTtBQUNaO0FBQUEsVUFDRDtBQUVBLHNCQUFZLEdBQUcsRUFBRSxJQUFJLEtBQUssS0FBSztBQUMvQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxPQUFhO0FBR1osUUFBSSxZQUFZLEtBQUssc0JBQXNCLE1BQU0sS0FBSyxRQUFRO0FBQzdELG9CQUFjO0FBQ2Q7QUFBQSxJQUNEO0FBQ0EsU0FBSyxtQkFBbUIsTUFBTTtBQUFBLEVBQy9CO0FBQ0Q7QUFyTGEsZ0JBRUksS0FBSztBQUZULGtCQUFOO0FBQUEsRUFlSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQW5CVTtBQXVMYiwyQkFBMkIsZ0JBQWdCLElBQUksaUJBQWlCLGdDQUFnQyxJQUFJO0FBQ3BHLGdCQUFnQiwwQkFBMEI7QUFDMUMsZ0JBQWdCLHlCQUF5QjsiLAogICJuYW1lcyI6IFtdCn0K
