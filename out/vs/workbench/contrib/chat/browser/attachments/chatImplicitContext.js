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
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { autorun } from "../../../../../base/common/observable.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { getCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { isLocation } from "../../../../../editor/common/languages.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { EditorsOrder } from "../../../../common/editor.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { getNotebookEditorFromEditorPane } from "../../../notebook/browser/notebookBrowser.js";
import { WebviewInput } from "../../../webviewPanel/browser/webviewEditorInput.js";
import { IChatEditingService } from "../../common/editing/chatEditingService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { isStringImplicitContextValue } from "../../common/attachments/chatVariableEntries.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { ILanguageModelIgnoredFilesService } from "../../common/ignoredFiles.js";
import { IChatWidgetService } from "../chat.js";
import { IChatContextService } from "../contextContrib/chatContextService.js";
import { BrowserEditorInput } from "../../../browserView/common/browserEditorInput.js";
let ChatImplicitContextContribution = class extends Disposable {
  constructor(codeEditorService, editorService, chatWidgetService, chatService, chatEditingService, configurationService, ignoredFilesService, chatContextService) {
    super();
    this.codeEditorService = codeEditorService;
    this.editorService = editorService;
    this.chatWidgetService = chatWidgetService;
    this.chatService = chatService;
    this.chatEditingService = chatEditingService;
    this.configurationService = configurationService;
    this.ignoredFilesService = ignoredFilesService;
    this.chatContextService = chatContextService;
    this._currentCancelTokenSource = this._register(new MutableDisposable());
    this._implicitContextEnablement = this.configurationService.getValue("chat.implicitContext.enabled");
    const activeEditorDisposables = this._register(new DisposableStore());
    this._register(Event.runAndSubscribe(
      editorService.onDidActiveEditorChange,
      (() => {
        activeEditorDisposables.clear();
        const codeEditor = this.findActiveCodeEditor();
        if (codeEditor) {
          activeEditorDisposables.add(Event.debounce(
            Event.any(
              codeEditor.onDidChangeModel,
              codeEditor.onDidChangeModelLanguage,
              codeEditor.onDidChangeCursorSelection,
              codeEditor.onDidScrollChange
            ),
            () => void 0,
            500
          )(() => this.updateImplicitContext()));
        }
        const notebookEditor = this.findActiveNotebookEditor();
        if (notebookEditor) {
          const activeCellDisposables = activeEditorDisposables.add(new DisposableStore());
          activeEditorDisposables.add(notebookEditor.onDidChangeActiveCell(() => {
            activeCellDisposables.clear();
            const codeEditor2 = this.codeEditorService.getActiveCodeEditor();
            if (codeEditor2 && codeEditor2.getModel()?.uri.scheme === Schemas.vscodeNotebookCell) {
              activeCellDisposables.add(Event.debounce(
                Event.any(
                  codeEditor2.onDidChangeModel,
                  codeEditor2.onDidChangeCursorSelection,
                  codeEditor2.onDidScrollChange
                ),
                () => void 0,
                500
              )(() => this.updateImplicitContext()));
            }
          }));
          activeEditorDisposables.add(Event.debounce(
            Event.any(
              notebookEditor.onDidChangeModel,
              notebookEditor.onDidChangeActiveCell
            ),
            () => void 0,
            500
          )(() => this.updateImplicitContext()));
        }
        const webviewEditor = this.findActiveWebviewEditor();
        if (webviewEditor) {
          activeEditorDisposables.add(Event.debounce(webviewEditor.input.webview.onMessage, () => void 0, 500)(() => {
            this.updateImplicitContext();
          }));
        }
        this.updateImplicitContext();
      })
    ));
    this._register(autorun((reader) => {
      this.chatEditingService.editingSessionsObs.read(reader);
      this.updateImplicitContext();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("chat.implicitContext.enabled")) {
        this._implicitContextEnablement = this.configurationService.getValue("chat.implicitContext.enabled");
        this.updateImplicitContext();
      }
    }));
    this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
      const widget = this.chatWidgetService.getWidgetBySessionResource(chatSessionResource);
      if (!widget?.input.implicitContext) {
        return;
      }
      if (this._implicitContextEnablement[widget.location] === "first" && widget.viewModel?.getItems().length !== 0) {
        widget.input.implicitContext.setValues([]);
      }
    }));
    this._register(this.chatWidgetService.onDidAddWidget(async (widget) => {
      await this.updateImplicitContext(widget);
    }));
  }
  findActiveCodeEditor() {
    const codeEditor = this.codeEditorService.getActiveCodeEditor();
    if (codeEditor) {
      const model = codeEditor.getModel();
      if (model?.uri.scheme === Schemas.vscodeNotebookCell) {
        return void 0;
      }
      if (model && model.uri.scheme !== Schemas.vscodeChatResponseResource) {
        return codeEditor;
      }
    }
    for (const codeOrDiffEditor of this.editorService.getVisibleTextEditorControls(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
      const codeEditor2 = getCodeEditor(codeOrDiffEditor);
      if (!codeEditor2) {
        continue;
      }
      const model = codeEditor2.getModel();
      if (model && model.uri.scheme !== Schemas.vscodeChatResponseResource) {
        return codeEditor2;
      }
    }
    return void 0;
  }
  findActiveWebviewEditor() {
    const activeEditorPane = this.editorService.activeEditorPane;
    if (activeEditorPane?.input instanceof WebviewInput) {
      return activeEditorPane;
    }
    return void 0;
  }
  findActiveBrowserEditor() {
    const activeEditorPane = this.editorService.activeEditorPane;
    if (activeEditorPane?.input instanceof BrowserEditorInput) {
      return activeEditorPane.input;
    }
    return void 0;
  }
  findActiveNotebookEditor() {
    return getNotebookEditorFromEditorPane(this.editorService.activeEditorPane);
  }
  async updateImplicitContext(updateWidget) {
    const cancelTokenSource = this._currentCancelTokenSource.value = new CancellationTokenSource();
    const codeEditor = this.findActiveCodeEditor();
    const model = codeEditor?.getModel();
    const selection = codeEditor?.getSelection();
    const useSuggestedContext = this.configurationService.getValue("chat.implicitContext.suggestedContext");
    let newValue;
    let isSelection = false;
    let languageId;
    let providerContext;
    if (model) {
      languageId = model.getLanguageId();
      if (selection && !selection.isEmpty()) {
        newValue = { uri: model.uri, range: selection };
        isSelection = true;
      } else {
        if (useSuggestedContext) {
          newValue = model.uri;
        } else {
          const visibleRanges = codeEditor?.getVisibleRanges();
          if (visibleRanges && visibleRanges.length > 0) {
            let range = visibleRanges[0];
            visibleRanges.slice(1).forEach((r) => {
              range = range.plusRange(r);
            });
            newValue = { uri: model.uri, range };
          } else {
            newValue = model.uri;
          }
        }
      }
      providerContext = await this.chatContextService.contextForResource(model.uri, languageId);
    }
    const notebookEditor = this.findActiveNotebookEditor();
    if (notebookEditor?.isReplHistory) {
      newValue = void 0;
    } else if (notebookEditor) {
      const activeCell = notebookEditor.getActiveCell();
      if (activeCell) {
        const codeEditor2 = this.codeEditorService.getActiveCodeEditor();
        const selection2 = codeEditor2?.getSelection();
        const visibleRanges = codeEditor2?.getVisibleRanges() || [];
        newValue = activeCell.uri;
        const cellModel = codeEditor2?.getModel();
        if (cellModel && isEqual(cellModel.uri, activeCell.uri)) {
          if (selection2 && !selection2.isEmpty()) {
            newValue = { uri: activeCell.uri, range: selection2 };
            isSelection = true;
          } else if (visibleRanges.length > 0) {
            if (!isEntireCellVisible(cellModel, visibleRanges)) {
              let range = visibleRanges[0];
              visibleRanges.slice(1).forEach((r) => {
                range = range.plusRange(r);
              });
              newValue = { uri: activeCell.uri, range };
            }
          }
        }
      } else {
        newValue = notebookEditor.textModel?.uri;
      }
    }
    const webviewEditor = this.findActiveWebviewEditor();
    if (webviewEditor?.input instanceof WebviewInput && webviewEditor.input.resource) {
      const webviewContext = await this.chatContextService.contextForResource(webviewEditor.input.resource, void 0, webviewEditor.input.viewType);
      if (webviewContext) {
        newValue = webviewContext;
      }
    }
    const browser = this.findActiveBrowserEditor();
    if (browser?.isSharingAvailable && useSuggestedContext) {
      newValue = browser.resource;
    }
    const uri = newValue instanceof URI ? newValue : isStringImplicitContextValue(newValue) ? void 0 : newValue?.uri;
    if (uri && (await this.ignoredFilesService.fileIsIgnored(uri, cancelTokenSource.token) || uri.path.endsWith(".copilotmd"))) {
      newValue = void 0;
    }
    if (cancelTokenSource.token.isCancellationRequested) {
      return;
    }
    const widgets = updateWidget ? [updateWidget] : [...this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat), ...this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.EditorInline)];
    for (const widget of widgets) {
      if (!widget.input.implicitContext) {
        continue;
      }
      const setting = this._implicitContextEnablement[widget.location];
      const isFirstInteraction = widget.viewModel?.getItems().length === 0;
      if (setting === "always" || setting === "first" && isFirstInteraction) {
        const hasActiveEditor = !!this.editorService.activeEditor;
        if (newValue !== void 0 || !widget.input.implicitContext.hasValue || !hasActiveEditor) {
          widget.input.implicitContext.setValues([{ value: newValue, isSelection }, { value: providerContext, isSelection: false }]);
        }
      } else {
        widget.input.implicitContext.setValues([]);
      }
    }
  }
};
ChatImplicitContextContribution.ID = "chat.implicitContext";
ChatImplicitContextContribution = __decorateClass([
  __decorateParam(0, ICodeEditorService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IChatWidgetService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IChatEditingService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ILanguageModelIgnoredFilesService),
  __decorateParam(7, IChatContextService)
], ChatImplicitContextContribution);
function isEntireCellVisible(cellModel, visibleRanges) {
  if (visibleRanges.length === 1 && visibleRanges[0].startLineNumber === 1 && visibleRanges[0].startColumn === 1 && visibleRanges[0].endLineNumber === cellModel.getLineCount() && visibleRanges[0].endColumn === cellModel.getLineMaxColumn(visibleRanges[0].endLineNumber)) {
    return true;
  }
  return false;
}
class ChatImplicitContexts extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeValue = this._register(new Emitter());
    this.onDidChangeValue = this._onDidChangeValue.event;
    this._values = this._register(new DisposableMap());
    this._valuesDisposables = this._register(new DisposableStore());
    this._enabled = false;
  }
  setValues(values) {
    this._valuesDisposables.clear();
    this._values.clearAndDisposeAll();
    if (!values || values.length === 0) {
      this._onDidChangeValue.fire();
      return;
    }
    const definedValues = values.filter((value) => value.value !== void 0);
    for (const value of definedValues) {
      const implicitContext = new ChatImplicitContext();
      implicitContext.setValue(value.value, value.isSelection);
      implicitContext.enabled = this._enabled;
      const disposableStore = new DisposableStore();
      disposableStore.add(implicitContext.onDidChangeValue(() => {
        this._onDidChangeValue.fire();
      }));
      disposableStore.add(implicitContext);
      this._values.set(implicitContext, disposableStore);
    }
    this._onDidChangeValue.fire();
  }
  get values() {
    return Array.from(this._values.keys());
  }
  get hasEnabled() {
    return Array.from(this._values.keys()).some((v) => v.enabled);
  }
  setEnabled(enabled) {
    this._enabled = enabled;
    this.values.forEach((v) => v.enabled = enabled);
  }
  get hasValue() {
    return this.values.some((v) => v.value !== void 0);
  }
  get hasNonUri() {
    return this.values.some((v) => v.value !== void 0 && !URI.isUri(v.value));
  }
  getLocations() {
    return this.values.filter((v) => isLocation(v.value)).map((v) => v.value);
  }
  getUris() {
    return this.values.filter((v) => URI.isUri(v.value)).map((v) => v.value);
  }
  get hasNonStringContext() {
    return this.values.some((v) => v.value !== void 0 && !isStringImplicitContextValue(v.value));
  }
  enabledBaseEntries(includeAllLocations) {
    return this.values.flatMap((v) => {
      if (v.enabled) {
        return v.toBaseEntries();
      } else if (includeAllLocations && isLocation(v.value)) {
        return v.toBaseEntries();
      }
      return [];
    });
  }
}
class ChatImplicitContext extends Disposable {
  constructor() {
    super(...arguments);
    this.kind = "implicit";
    this.isFile = true;
    this._isSelection = false;
    this._onDidChangeValue = this._register(new Emitter());
    this.onDidChangeValue = this._onDidChangeValue.event;
    this._enabled = false;
  }
  get id() {
    if (URI.isUri(this.value)) {
      return "vscode.implicit.file";
    } else if (isStringImplicitContextValue(this.value)) {
      return "vscode.implicit.string";
    } else if (this.value) {
      if (this._isSelection) {
        return "vscode.implicit.selection";
      } else {
        return "vscode.implicit.viewport";
      }
    } else {
      return "vscode.implicit";
    }
  }
  get name() {
    if (URI.isUri(this.value)) {
      if (this.value.scheme === Schemas.vscodeBrowser) {
        return `browser`;
      }
      return `file:${basename(this.value)}`;
    }
    if (isLocation(this.value)) {
      return `file:${basename(this.value.uri)}`;
    }
    if (isStringImplicitContextValue(this.value)) {
      if (this.value.name === void 0 && this.value.resourceUri === void 0) {
        throw new Error("ChatContextItem must have either a label or a resourceUri");
      }
      return this.value.name ?? basename(this.value.resourceUri);
    }
    return "implicit";
  }
  get modelDescription() {
    if (URI.isUri(this.value)) {
      return `User's active file`;
    } else if (isStringImplicitContextValue(this.value)) {
      if (this.value.name === void 0 && this.value.resourceUri === void 0) {
        throw new Error("ChatContextItem must have either a label or a resourceUri");
      }
      const contextName = this.value.name ?? basename(this.value.resourceUri);
      return this.value.modelDescription ?? `User's active context from ${contextName}`;
    } else if (this._isSelection) {
      return `User's active selection`;
    } else {
      return `User's current visible code`;
    }
  }
  get isSelection() {
    return this._isSelection;
  }
  get value() {
    return this._value;
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(value) {
    this._enabled = value;
    this._onDidChangeValue.fire();
  }
  get uri() {
    if (isStringImplicitContextValue(this.value)) {
      return this.value.uri;
    }
    return this._uri;
  }
  get iconPath() {
    if (isStringImplicitContextValue(this.value)) {
      return this.value.iconPath;
    }
    return void 0;
  }
  setValue(value, isSelection) {
    if (isStringImplicitContextValue(value)) {
      this._value = value;
    } else {
      this._value = value;
      this._uri = URI.isUri(value) ? value : value?.uri;
    }
    this._isSelection = isSelection;
    this._onDidChangeValue.fire();
  }
  toBaseEntries() {
    if (!this.value) {
      return [];
    }
    if (URI.isUri(this.value) && this.value.scheme === Schemas.vscodeBrowser) {
      return [];
    }
    if (isStringImplicitContextValue(this.value)) {
      return [
        {
          kind: "string",
          id: this.id,
          name: this.name,
          value: this.value.value ?? this.name,
          modelDescription: this.modelDescription,
          iconPath: this.value.iconPath,
          uri: this.value.uri,
          resourceUri: this.value.resourceUri,
          handle: this.value.handle,
          commandId: this.value.commandId
        }
      ];
    }
    return [{
      kind: "file",
      id: this.id,
      name: this.name,
      value: this.value,
      modelDescription: this.modelDescription
    }];
  }
}
export {
  ChatImplicitContext,
  ChatImplicitContextContribution,
  ChatImplicitContexts
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGF0dGFjaG1lbnRzXFxjaGF0SW1wbGljaXRDb250ZXh0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNMb2NhdGlvbiwgTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JzT3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUsIElOb3RlYm9va0VkaXRvciB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IFdlYnZpZXdFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi93ZWJ2aWV3UGFuZWwvYnJvd3Nlci93ZWJ2aWV3RWRpdG9yLmpzJztcbmltcG9ydCB7IFdlYnZpZXdJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3dlYnZpZXdQYW5lbC9icm93c2VyL3dlYnZpZXdFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RJbXBsaWNpdFZhcmlhYmxlRW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUsIFN0cmluZ0NoYXRDb250ZXh0VmFsdWUsIENoYXRDb250ZXh0SWNvblBhdGggfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2lnbm9yZWRGaWxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vY29udGV4dENvbnRyaWIvY2hhdENvbnRleHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlckVkaXRvcklucHV0LmpzJztcblxuZXhwb3J0IGNsYXNzIENoYXRJbXBsaWNpdENvbnRleHRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0LmltcGxpY2l0Q29udGV4dCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudENhbmNlbFRva2VuU291cmNlOiBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT47XG5cblx0cHJpdmF0ZSBfaW1wbGljaXRDb250ZXh0RW5hYmxlbWVudDogeyBbbW9kZTogc3RyaW5nXTogc3RyaW5nIH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0RWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RWRpdGluZ1NlcnZpY2U6IElDaGF0RWRpdGluZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGlnbm9yZWRGaWxlc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZSxcblx0XHRASUNoYXRDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRDb250ZXh0U2VydmljZTogSUNoYXRDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2N1cnJlbnRDYW5jZWxUb2tlblNvdXJjZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKSk7XG5cdFx0dGhpcy5faW1wbGljaXRDb250ZXh0RW5hYmxlbWVudCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBbbW9kZTogc3RyaW5nXTogc3RyaW5nIH0+KCdjaGF0LmltcGxpY2l0Q29udGV4dC5lbmFibGVkJyk7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUoXG5cdFx0XHRlZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLFxuXHRcdFx0KCgpID0+IHtcblx0XHRcdFx0YWN0aXZlRWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0Y29uc3QgY29kZUVkaXRvciA9IHRoaXMuZmluZEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRcdFx0aWYgKGNvZGVFZGl0b3IpIHtcblx0XHRcdFx0XHRhY3RpdmVFZGl0b3JEaXNwb3NhYmxlcy5hZGQoRXZlbnQuZGVib3VuY2UoXG5cdFx0XHRcdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdFx0XHRcdGNvZGVFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCxcblx0XHRcdFx0XHRcdFx0Y29kZUVkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UsXG5cdFx0XHRcdFx0XHRcdGNvZGVFZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24sXG5cdFx0XHRcdFx0XHRcdGNvZGVFZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UpLFxuXHRcdFx0XHRcdFx0KCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0NTAwKSgoKSA9PiB0aGlzLnVwZGF0ZUltcGxpY2l0Q29udGV4dCgpKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IHRoaXMuZmluZEFjdGl2ZU5vdGVib29rRWRpdG9yKCk7XG5cdFx0XHRcdGlmIChub3RlYm9va0VkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZUNlbGxEaXNwb3NhYmxlcyA9IGFjdGl2ZUVkaXRvckRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdFx0XHRcdGFjdGl2ZUVkaXRvckRpc3Bvc2FibGVzLmFkZChub3RlYm9va0VkaXRvci5vbkRpZENoYW5nZUFjdGl2ZUNlbGwoKCkgPT4ge1xuXHRcdFx0XHRcdFx0YWN0aXZlQ2VsbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBjb2RlRWRpdG9yID0gdGhpcy5jb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0XHRcdFx0XHRpZiAoY29kZUVkaXRvciAmJiBjb2RlRWRpdG9yLmdldE1vZGVsKCk/LnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7XG5cdFx0XHRcdFx0XHRcdGFjdGl2ZUNlbGxEaXNwb3NhYmxlcy5hZGQoRXZlbnQuZGVib3VuY2UoXG5cdFx0XHRcdFx0XHRcdFx0RXZlbnQuYW55KFxuXHRcdFx0XHRcdFx0XHRcdFx0Y29kZUVkaXRvci5vbkRpZENoYW5nZU1vZGVsLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y29kZUVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbixcblx0XHRcdFx0XHRcdFx0XHRcdGNvZGVFZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UpLFxuXHRcdFx0XHRcdFx0XHRcdCgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHQ1MDApKCgpID0+IHRoaXMudXBkYXRlSW1wbGljaXRDb250ZXh0KCkpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0XHRhY3RpdmVFZGl0b3JEaXNwb3NhYmxlcy5hZGQoRXZlbnQuZGVib3VuY2UoXG5cdFx0XHRcdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdFx0XHRcdG5vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwsXG5cdFx0XHRcdFx0XHRcdG5vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlQWN0aXZlQ2VsbFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdCgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdDUwMCkoKCkgPT4gdGhpcy51cGRhdGVJbXBsaWNpdENvbnRleHQoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHdlYnZpZXdFZGl0b3IgPSB0aGlzLmZpbmRBY3RpdmVXZWJ2aWV3RWRpdG9yKCk7XG5cdFx0XHRcdGlmICh3ZWJ2aWV3RWRpdG9yKSB7XG5cdFx0XHRcdFx0YWN0aXZlRWRpdG9yRGlzcG9zYWJsZXMuYWRkKEV2ZW50LmRlYm91bmNlKCh3ZWJ2aWV3RWRpdG9yLmlucHV0IGFzIFdlYnZpZXdJbnB1dCkud2Vidmlldy5vbk1lc3NhZ2UsICgpID0+IHVuZGVmaW5lZCwgNTAwKSgoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUltcGxpY2l0Q29udGV4dCgpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudXBkYXRlSW1wbGljaXRDb250ZXh0KCk7XG5cdFx0XHR9KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0dGhpcy5jaGF0RWRpdGluZ1NlcnZpY2UuZWRpdGluZ1Nlc3Npb25zT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudXBkYXRlSW1wbGljaXRDb250ZXh0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2NoYXQuaW1wbGljaXRDb250ZXh0LmVuYWJsZWQnKSkge1xuXHRcdFx0XHR0aGlzLl9pbXBsaWNpdENvbnRleHRFbmFibGVtZW50ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IFttb2RlOiBzdHJpbmddOiBzdHJpbmcgfT4oJ2NoYXQuaW1wbGljaXRDb250ZXh0LmVuYWJsZWQnKTtcblx0XHRcdFx0dGhpcy51cGRhdGVJbXBsaWNpdENvbnRleHQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2VydmljZS5vbkRpZFN1Ym1pdFJlcXVlc3QoKHsgY2hhdFNlc3Npb25SZXNvdXJjZSB9KSA9PiB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCF3aWRnZXQ/LmlucHV0LmltcGxpY2l0Q29udGV4dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5faW1wbGljaXRDb250ZXh0RW5hYmxlbWVudFt3aWRnZXQubG9jYXRpb25dID09PSAnZmlyc3QnICYmIHdpZGdldC52aWV3TW9kZWw/LmdldEl0ZW1zKCkubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdHdpZGdldC5pbnB1dC5pbXBsaWNpdENvbnRleHQuc2V0VmFsdWVzKFtdKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vbkRpZEFkZFdpZGdldChhc3luYyAod2lkZ2V0KSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUltcGxpY2l0Q29udGV4dCh3aWRnZXQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZmluZEFjdGl2ZUNvZGVFZGl0b3IoKTogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNvZGVFZGl0b3IgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRpZiAoY29kZUVkaXRvcikge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjb2RlRWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAobW9kZWw/LnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb2RlbCAmJiBtb2RlbC51cmkuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZUNoYXRSZXNwb25zZVJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybiBjb2RlRWRpdG9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNvZGVPckRpZmZFZGl0b3Igb2YgdGhpcy5lZGl0b3JTZXJ2aWNlLmdldFZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0Y29uc3QgY29kZUVkaXRvciA9IGdldENvZGVFZGl0b3IoY29kZU9yRGlmZkVkaXRvcik7XG5cdFx0XHRpZiAoIWNvZGVFZGl0b3IpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoYXQncyBvd24gcmVzb3VyY2VzIGFyZSBhbHJlYWR5IHBhcnQgb2YgdGhlIGNvbnZlcnNhdGlvbiwgc28gYW5cblx0XHRcdC8vIGVkaXRvciBzdWNoIGFzIGFuIG9wZW5lZCBwYXN0ZWQtdGV4dCBhcnRpZmFjdCBpcyBwYXNzZWQgb3ZlciByYXRoZXJcblx0XHRcdC8vIHRoYW4gc3VnZ2VzdGVkIGJhY2sgYXMgYW4gYXR0YWNobWVudC5cblx0XHRcdGNvbnN0IG1vZGVsID0gY29kZUVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKG1vZGVsICYmIG1vZGVsLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlQ2hhdFJlc3BvbnNlUmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIGNvZGVFZGl0b3I7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRBY3RpdmVXZWJ2aWV3RWRpdG9yKCk6IFdlYnZpZXdFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZT8uaW5wdXQgaW5zdGFuY2VvZiBXZWJ2aWV3SW5wdXQpIHtcblx0XHRcdHJldHVybiBhY3RpdmVFZGl0b3JQYW5lIGFzIFdlYnZpZXdFZGl0b3I7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRBY3RpdmVCcm93c2VyRWRpdG9yKCk6IEJyb3dzZXJFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lPy5pbnB1dCBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIGFjdGl2ZUVkaXRvclBhbmUuaW5wdXQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRBY3RpdmVOb3RlYm9va0VkaXRvcigpOiBJTm90ZWJvb2tFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlSW1wbGljaXRDb250ZXh0KHVwZGF0ZVdpZGdldD86IElDaGF0V2lkZ2V0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2FuY2VsVG9rZW5Tb3VyY2UgPSB0aGlzLl9jdXJyZW50Q2FuY2VsVG9rZW5Tb3VyY2UudmFsdWUgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBjb2RlRWRpdG9yID0gdGhpcy5maW5kQWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdGNvbnN0IG1vZGVsID0gY29kZUVkaXRvcj8uZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBjb2RlRWRpdG9yPy5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCB1c2VTdWdnZXN0ZWRDb250ZXh0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignY2hhdC5pbXBsaWNpdENvbnRleHQuc3VnZ2VzdGVkQ29udGV4dCcpO1xuXHRcdGxldCBuZXdWYWx1ZTogTG9jYXRpb24gfCBVUkkgfCBTdHJpbmdDaGF0Q29udGV4dFZhbHVlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBpc1NlbGVjdGlvbiA9IGZhbHNlO1xuXG5cdFx0bGV0IGxhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJvdmlkZXJDb250ZXh0OiBTdHJpbmdDaGF0Q29udGV4dFZhbHVlIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0bGFuZ3VhZ2VJZCA9IG1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRcdGlmIChzZWxlY3Rpb24gJiYgIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0bmV3VmFsdWUgPSB7IHVyaTogbW9kZWwudXJpLCByYW5nZTogc2VsZWN0aW9uIH0gc2F0aXNmaWVzIExvY2F0aW9uO1xuXHRcdFx0XHRpc1NlbGVjdGlvbiA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodXNlU3VnZ2VzdGVkQ29udGV4dCkge1xuXHRcdFx0XHRcdG5ld1ZhbHVlID0gbW9kZWwudXJpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSBjb2RlRWRpdG9yPy5nZXRWaXNpYmxlUmFuZ2VzKCk7XG5cdFx0XHRcdFx0aWYgKHZpc2libGVSYW5nZXMgJiYgdmlzaWJsZVJhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHQvLyBNZXJnZSB2aXNpYmxlIHJhbmdlcy4gTWF5YmUgdGhlIHJlZmVyZW5jZSB2YWx1ZSBjb3VsZCBhY3R1YWxseSBiZSBhbiBhcnJheSBvZiBMb2NhdGlvbnM/XG5cdFx0XHRcdFx0XHQvLyBTb21ldGhpbmcgbGlrZSBhIExvY2F0aW9uIHdpdGggYW4gYXJyYXkgb2YgUmFuZ2VzP1xuXHRcdFx0XHRcdFx0bGV0IHJhbmdlID0gdmlzaWJsZVJhbmdlc1swXTtcblx0XHRcdFx0XHRcdHZpc2libGVSYW5nZXMuc2xpY2UoMSkuZm9yRWFjaChyID0+IHtcblx0XHRcdFx0XHRcdFx0cmFuZ2UgPSByYW5nZS5wbHVzUmFuZ2Uocik7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdG5ld1ZhbHVlID0geyB1cmk6IG1vZGVsLnVyaSwgcmFuZ2UgfSBzYXRpc2ZpZXMgTG9jYXRpb247XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG5ld1ZhbHVlID0gbW9kZWwudXJpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gQWxzbyBjaGVjayBpZiBhIGNoYXQgY29udGV4dCBwcm92aWRlciBjYW4gcHJvdmlkZSBhZGRpdGlvbmFsIGNvbnRleHQgZm9yIHRoaXMgdGV4dCBlZGl0b3IgcmVzb3VyY2Vcblx0XHRcdHByb3ZpZGVyQ29udGV4dCA9IGF3YWl0IHRoaXMuY2hhdENvbnRleHRTZXJ2aWNlLmNvbnRleHRGb3JSZXNvdXJjZShtb2RlbC51cmksIGxhbmd1YWdlSWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0gdGhpcy5maW5kQWN0aXZlTm90ZWJvb2tFZGl0b3IoKTtcblx0XHRpZiAobm90ZWJvb2tFZGl0b3I/LmlzUmVwbEhpc3RvcnkpIHtcblx0XHRcdC8vIFRoZSBjaGF0IEFQSXMgZG9uJ3Qgd29yayB3ZWxsIHdpdGggSW50ZXJhY3RpdmUgV2luZG93c1xuXHRcdFx0bmV3VmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChub3RlYm9va0VkaXRvcikge1xuXHRcdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IG5vdGVib29rRWRpdG9yLmdldEFjdGl2ZUNlbGwoKTtcblx0XHRcdGlmIChhY3RpdmVDZWxsKSB7XG5cdFx0XHRcdGNvbnN0IGNvZGVFZGl0b3IgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gY29kZUVkaXRvcj8uZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSBjb2RlRWRpdG9yPy5nZXRWaXNpYmxlUmFuZ2VzKCkgfHwgW107XG5cdFx0XHRcdG5ld1ZhbHVlID0gYWN0aXZlQ2VsbC51cmk7XG5cdFx0XHRcdGNvbnN0IGNlbGxNb2RlbCA9IGNvZGVFZGl0b3I/LmdldE1vZGVsKCk7XG5cdFx0XHRcdGlmIChjZWxsTW9kZWwgJiYgaXNFcXVhbChjZWxsTW9kZWwudXJpLCBhY3RpdmVDZWxsLnVyaSkpIHtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uICYmICFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0XHRuZXdWYWx1ZSA9IHsgdXJpOiBhY3RpdmVDZWxsLnVyaSwgcmFuZ2U6IHNlbGVjdGlvbiB9IHNhdGlzZmllcyBMb2NhdGlvbjtcblx0XHRcdFx0XHRcdGlzU2VsZWN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHZpc2libGVSYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Ly8gSWYgdGhlIGVudGlyZSBjZWxsIGlzIHZpc2libGUsIGp1c3QgdXNlIHRoZSBjZWxsIFVSSSwgbm8gbmVlZCB0byBzcGVjaWZ5IHJhbmdlLlxuXHRcdFx0XHRcdFx0aWYgKCFpc0VudGlyZUNlbGxWaXNpYmxlKGNlbGxNb2RlbCwgdmlzaWJsZVJhbmdlcykpIHtcblx0XHRcdFx0XHRcdFx0Ly8gTWVyZ2UgdmlzaWJsZSByYW5nZXMuIE1heWJlIHRoZSByZWZlcmVuY2UgdmFsdWUgY291bGQgYWN0dWFsbHkgYmUgYW4gYXJyYXkgb2YgTG9jYXRpb25zP1xuXHRcdFx0XHRcdFx0XHQvLyBTb21ldGhpbmcgbGlrZSBhIExvY2F0aW9uIHdpdGggYW4gYXJyYXkgb2YgUmFuZ2VzP1xuXHRcdFx0XHRcdFx0XHRsZXQgcmFuZ2UgPSB2aXNpYmxlUmFuZ2VzWzBdO1xuXHRcdFx0XHRcdFx0XHR2aXNpYmxlUmFuZ2VzLnNsaWNlKDEpLmZvckVhY2gociA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2UgPSByYW5nZS5wbHVzUmFuZ2Uocik7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRuZXdWYWx1ZSA9IHsgdXJpOiBhY3RpdmVDZWxsLnVyaSwgcmFuZ2UgfSBzYXRpc2ZpZXMgTG9jYXRpb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXdWYWx1ZSA9IG5vdGVib29rRWRpdG9yLnRleHRNb2RlbD8udXJpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHdlYnZpZXdFZGl0b3IgPSB0aGlzLmZpbmRBY3RpdmVXZWJ2aWV3RWRpdG9yKCk7XG5cdFx0aWYgKHdlYnZpZXdFZGl0b3I/LmlucHV0IGluc3RhbmNlb2YgV2Vidmlld0lucHV0ICYmIHdlYnZpZXdFZGl0b3IuaW5wdXQucmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IHdlYnZpZXdDb250ZXh0ID0gYXdhaXQgdGhpcy5jaGF0Q29udGV4dFNlcnZpY2UuY29udGV4dEZvclJlc291cmNlKHdlYnZpZXdFZGl0b3IuaW5wdXQucmVzb3VyY2UsIHVuZGVmaW5lZCwgd2Vidmlld0VkaXRvci5pbnB1dC52aWV3VHlwZSk7XG5cdFx0XHRpZiAod2Vidmlld0NvbnRleHQpIHtcblx0XHRcdFx0bmV3VmFsdWUgPSB3ZWJ2aWV3Q29udGV4dDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBicm93c2VyID0gdGhpcy5maW5kQWN0aXZlQnJvd3NlckVkaXRvcigpO1xuXHRcdGlmIChicm93c2VyPy5pc1NoYXJpbmdBdmFpbGFibGUgJiYgdXNlU3VnZ2VzdGVkQ29udGV4dCkge1xuXHRcdFx0bmV3VmFsdWUgPSBicm93c2VyLnJlc291cmNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaSA9IG5ld1ZhbHVlIGluc3RhbmNlb2YgVVJJID8gbmV3VmFsdWUgOiAoaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZShuZXdWYWx1ZSkgPyB1bmRlZmluZWQgOiBuZXdWYWx1ZT8udXJpKTtcblx0XHRpZiAodXJpICYmIChcblx0XHRcdGF3YWl0IHRoaXMuaWdub3JlZEZpbGVzU2VydmljZS5maWxlSXNJZ25vcmVkKHVyaSwgY2FuY2VsVG9rZW5Tb3VyY2UudG9rZW4pIHx8XG5cdFx0XHR1cmkucGF0aC5lbmRzV2l0aCgnLmNvcGlsb3RtZCcpKVxuXHRcdCkge1xuXHRcdFx0bmV3VmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGNhbmNlbFRva2VuU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkZ2V0cyA9IHVwZGF0ZVdpZGdldCA/IFt1cGRhdGVXaWRnZXRdIDogWy4uLnRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0c0J5TG9jYXRpb25zKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLCAuLi50aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldHNCeUxvY2F0aW9ucyhDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpXTtcblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB3aWRnZXRzKSB7XG5cdFx0XHRpZiAoIXdpZGdldC5pbnB1dC5pbXBsaWNpdENvbnRleHQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXR0aW5nID0gdGhpcy5faW1wbGljaXRDb250ZXh0RW5hYmxlbWVudFt3aWRnZXQubG9jYXRpb25dO1xuXHRcdFx0Y29uc3QgaXNGaXJzdEludGVyYWN0aW9uID0gd2lkZ2V0LnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5sZW5ndGggPT09IDA7XG5cdFx0XHRpZiAoKHNldHRpbmcgPT09ICdhbHdheXMnIHx8IHNldHRpbmcgPT09ICdmaXJzdCcgJiYgaXNGaXJzdEludGVyYWN0aW9uKSkge1xuXHRcdFx0XHQvLyBXaGVuIHRoZXJlJ3MgYSBub24tY29kZSBhY3RpdmUgZWRpdG9yIChlLmcuIFNldHRpbmdzIGlzIG9wZW4pLCBwcmVzZXJ2ZVxuXHRcdFx0XHQvLyBleGlzdGluZyB2YWx1ZXMgc28gdGhlIGF0dGFjaG1lbnQgYmFyIHN0YXlzIHZpc2libGUuXG5cdFx0XHRcdC8vIEJ1dCB3aGVuIHRoZXJlJ3Mgbm8gYWN0aXZlIGVkaXRvciBhdCBhbGwsIGNsZWFyIHRoZSB2YWx1ZXMuXG5cdFx0XHRcdGNvbnN0IGhhc0FjdGl2ZUVkaXRvciA9ICEhdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRcdFx0aWYgKG5ld1ZhbHVlICE9PSB1bmRlZmluZWQgfHwgIXdpZGdldC5pbnB1dC5pbXBsaWNpdENvbnRleHQuaGFzVmFsdWUgfHwgIWhhc0FjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdHdpZGdldC5pbnB1dC5pbXBsaWNpdENvbnRleHQuc2V0VmFsdWVzKFt7IHZhbHVlOiBuZXdWYWx1ZSwgaXNTZWxlY3Rpb24gfSwgeyB2YWx1ZTogcHJvdmlkZXJDb250ZXh0LCBpc1NlbGVjdGlvbjogZmFsc2UgfV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aWRnZXQuaW5wdXQuaW1wbGljaXRDb250ZXh0LnNldFZhbHVlcyhbXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGlzRW50aXJlQ2VsbFZpc2libGUoY2VsbE1vZGVsOiBJVGV4dE1vZGVsLCB2aXNpYmxlUmFuZ2VzOiBJUmFuZ2VbXSk6IGJvb2xlYW4ge1xuXHRpZiAodmlzaWJsZVJhbmdlcy5sZW5ndGggPT09IDEgJiYgdmlzaWJsZVJhbmdlc1swXS5zdGFydExpbmVOdW1iZXIgPT09IDEgJiYgdmlzaWJsZVJhbmdlc1swXS5zdGFydENvbHVtbiA9PT0gMSAmJiB2aXNpYmxlUmFuZ2VzWzBdLmVuZExpbmVOdW1iZXIgPT09IGNlbGxNb2RlbC5nZXRMaW5lQ291bnQoKSAmJiB2aXNpYmxlUmFuZ2VzWzBdLmVuZENvbHVtbiA9PT0gY2VsbE1vZGVsLmdldExpbmVNYXhDb2x1bW4odmlzaWJsZVJhbmdlc1swXS5lbmRMaW5lTnVtYmVyKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuaW50ZXJmYWNlIEltcGxpY2l0Q29udGV4dFdpdGhTZWxlY3Rpb24ge1xuXHR2YWx1ZTogTG9jYXRpb24gfCBVUkkgfCBTdHJpbmdDaGF0Q29udGV4dFZhbHVlIHwgdW5kZWZpbmVkO1xuXHRpc1NlbGVjdGlvbjogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRJbXBsaWNpdENvbnRleHRzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVmFsdWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWYWx1ZSA9IHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfdmFsdWVzOiBEaXNwb3NhYmxlTWFwPENoYXRJbXBsaWNpdENvbnRleHQsIERpc3Bvc2FibGVTdG9yZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcCgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdmFsdWVzRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2VuYWJsZWQgPSBmYWxzZTtcblxuXHRzZXRWYWx1ZXModmFsdWVzOiBJbXBsaWNpdENvbnRleHRXaXRoU2VsZWN0aW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLl92YWx1ZXNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3ZhbHVlcy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblxuXHRcdGlmICghdmFsdWVzIHx8IHZhbHVlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUuZmlyZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmluZWRWYWx1ZXMgPSB2YWx1ZXMuZmlsdGVyKHZhbHVlID0+IHZhbHVlLnZhbHVlICE9PSB1bmRlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgdmFsdWUgb2YgZGVmaW5lZFZhbHVlcykge1xuXHRcdFx0Y29uc3QgaW1wbGljaXRDb250ZXh0ID0gbmV3IENoYXRJbXBsaWNpdENvbnRleHQoKTtcblx0XHRcdGltcGxpY2l0Q29udGV4dC5zZXRWYWx1ZSh2YWx1ZS52YWx1ZSwgdmFsdWUuaXNTZWxlY3Rpb24pO1xuXHRcdFx0aW1wbGljaXRDb250ZXh0LmVuYWJsZWQgPSB0aGlzLl9lbmFibGVkO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChpbXBsaWNpdENvbnRleHQub25EaWRDaGFuZ2VWYWx1ZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUuZmlyZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChpbXBsaWNpdENvbnRleHQpO1xuXHRcdFx0dGhpcy5fdmFsdWVzLnNldChpbXBsaWNpdENvbnRleHQsIGRpc3Bvc2FibGVTdG9yZSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUuZmlyZSgpO1xuXHR9XG5cblx0Z2V0IHZhbHVlcygpOiBDaGF0SW1wbGljaXRDb250ZXh0W10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX3ZhbHVlcy5rZXlzKCkpO1xuXHR9XG5cblx0Z2V0IGhhc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fdmFsdWVzLmtleXMoKSkuc29tZSh2ID0+IHYuZW5hYmxlZCk7XG5cdH1cblxuXHRzZXRFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9lbmFibGVkID0gZW5hYmxlZDtcblx0XHR0aGlzLnZhbHVlcy5mb3JFYWNoKCh2KSA9PiB2LmVuYWJsZWQgPSBlbmFibGVkKTtcblx0fVxuXG5cdGdldCBoYXNWYWx1ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZXMuc29tZSh2ID0+IHYudmFsdWUgIT09IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRnZXQgaGFzTm9uVXJpKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlcy5zb21lKHYgPT4gdi52YWx1ZSAhPT0gdW5kZWZpbmVkICYmICFVUkkuaXNVcmkodi52YWx1ZSkpO1xuXHR9XG5cblx0Z2V0TG9jYXRpb25zKCk6IExvY2F0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlcy5maWx0ZXIodiA9PiBpc0xvY2F0aW9uKHYudmFsdWUpKS5tYXAodiA9PiB2LnZhbHVlIGFzIExvY2F0aW9uKTtcblx0fVxuXG5cdGdldFVyaXMoKTogVVJJW10ge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlcy5maWx0ZXIodiA9PiBVUkkuaXNVcmkodi52YWx1ZSkpLm1hcCh2ID0+IHYudmFsdWUgYXMgVVJJKTtcblx0fVxuXG5cdGdldCBoYXNOb25TdHJpbmdDb250ZXh0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlcy5zb21lKHYgPT4gdi52YWx1ZSAhPT0gdW5kZWZpbmVkICYmICFpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKHYudmFsdWUpKTtcblx0fVxuXG5cdGVuYWJsZWRCYXNlRW50cmllcyhpbmNsdWRlQWxsTG9jYXRpb25zOiBib29sZWFuKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZXMuZmxhdE1hcCh2ID0+IHtcblx0XHRcdGlmICh2LmVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuIHYudG9CYXNlRW50cmllcygpO1xuXHRcdFx0fSBlbHNlIGlmIChpbmNsdWRlQWxsTG9jYXRpb25zICYmIGlzTG9jYXRpb24odi52YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHYudG9CYXNlRW50cmllcygpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0SW1wbGljaXRDb250ZXh0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0UmVxdWVzdEltcGxpY2l0VmFyaWFibGVFbnRyeSB7XG5cdGdldCBpZCgpIHtcblx0XHRpZiAoVVJJLmlzVXJpKHRoaXMudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gJ3ZzY29kZS5pbXBsaWNpdC5maWxlJztcblx0XHR9IGVsc2UgaWYgKGlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUodGhpcy52YWx1ZSkpIHtcblx0XHRcdHJldHVybiAndnNjb2RlLmltcGxpY2l0LnN0cmluZyc7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnZhbHVlKSB7XG5cdFx0XHRpZiAodGhpcy5faXNTZWxlY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuICd2c2NvZGUuaW1wbGljaXQuc2VsZWN0aW9uJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiAndnNjb2RlLmltcGxpY2l0LnZpZXdwb3J0Jztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuICd2c2NvZGUuaW1wbGljaXQnO1xuXHRcdH1cblx0fVxuXG5cdGdldCBuYW1lKCk6IHN0cmluZyB7XG5cdFx0aWYgKFVSSS5pc1VyaSh0aGlzLnZhbHVlKSkge1xuXHRcdFx0aWYgKHRoaXMudmFsdWUuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZUJyb3dzZXIpIHtcblx0XHRcdFx0cmV0dXJuIGBicm93c2VyYDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBgZmlsZToke2Jhc2VuYW1lKHRoaXMudmFsdWUpfWA7XG5cdFx0fVxuXHRcdGlmIChpc0xvY2F0aW9uKHRoaXMudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gYGZpbGU6JHtiYXNlbmFtZSh0aGlzLnZhbHVlLnVyaSl9YDtcblx0XHR9XG5cdFx0aWYgKGlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUodGhpcy52YWx1ZSkpIHtcblx0XHRcdGlmICh0aGlzLnZhbHVlLm5hbWUgPT09IHVuZGVmaW5lZCAmJiB0aGlzLnZhbHVlLnJlc291cmNlVXJpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDaGF0Q29udGV4dEl0ZW0gbXVzdCBoYXZlIGVpdGhlciBhIGxhYmVsIG9yIGEgcmVzb3VyY2VVcmknKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnZhbHVlLm5hbWUgPz8gYmFzZW5hbWUodGhpcy52YWx1ZS5yZXNvdXJjZVVyaSEpO1xuXHRcdH1cblx0XHRyZXR1cm4gJ2ltcGxpY2l0Jztcblx0fVxuXG5cdHJlYWRvbmx5IGtpbmQgPSAnaW1wbGljaXQnO1xuXG5cdGdldCBtb2RlbERlc2NyaXB0aW9uKCk6IHN0cmluZyB7XG5cdFx0aWYgKFVSSS5pc1VyaSh0aGlzLnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIGBVc2VyJ3MgYWN0aXZlIGZpbGVgO1xuXHRcdH0gZWxzZSBpZiAoaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSh0aGlzLnZhbHVlKSkge1xuXHRcdFx0aWYgKHRoaXMudmFsdWUubmFtZSA9PT0gdW5kZWZpbmVkICYmIHRoaXMudmFsdWUucmVzb3VyY2VVcmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NoYXRDb250ZXh0SXRlbSBtdXN0IGhhdmUgZWl0aGVyIGEgbGFiZWwgb3IgYSByZXNvdXJjZVVyaScpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29udGV4dE5hbWUgPSB0aGlzLnZhbHVlLm5hbWUgPz8gYmFzZW5hbWUodGhpcy52YWx1ZS5yZXNvdXJjZVVyaSEpO1xuXHRcdFx0cmV0dXJuIHRoaXMudmFsdWUubW9kZWxEZXNjcmlwdGlvbiA/PyBgVXNlcidzIGFjdGl2ZSBjb250ZXh0IGZyb20gJHtjb250ZXh0TmFtZX1gO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faXNTZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybiBgVXNlcidzIGFjdGl2ZSBzZWxlY3Rpb25gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gYFVzZXIncyBjdXJyZW50IHZpc2libGUgY29kZWA7XG5cdFx0fVxuXHR9XG5cblx0cmVhZG9ubHkgaXNGaWxlID0gdHJ1ZTtcblxuXHRwcml2YXRlIF9pc1NlbGVjdGlvbiA9IGZhbHNlO1xuXHRwdWJsaWMgZ2V0IGlzU2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1NlbGVjdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVmFsdWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWYWx1ZSA9IHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfdmFsdWU6IExvY2F0aW9uIHwgVVJJIHwgU3RyaW5nQ2hhdENvbnRleHRWYWx1ZSB8IHVuZGVmaW5lZDtcblx0Z2V0IHZhbHVlKCkge1xuXHRcdHJldHVybiB0aGlzLl92YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2VuYWJsZWQgPSBmYWxzZTtcblx0Z2V0IGVuYWJsZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuYWJsZWQ7XG5cdH1cblxuXHRzZXQgZW5hYmxlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX2VuYWJsZWQgPSB2YWx1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZhbHVlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRnZXQgdXJpKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUodGhpcy52YWx1ZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLnZhbHVlLnVyaTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3VyaTtcblx0fVxuXG5cdGdldCBpY29uUGF0aCgpOiBDaGF0Q29udGV4dEljb25QYXRoIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSh0aGlzLnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudmFsdWUuaWNvblBhdGg7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZXRWYWx1ZSh2YWx1ZTogTG9jYXRpb24gfCBVUkkgfCBTdHJpbmdDaGF0Q29udGV4dFZhbHVlIHwgdW5kZWZpbmVkLCBpc1NlbGVjdGlvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKHZhbHVlKSkge1xuXHRcdFx0dGhpcy5fdmFsdWUgPSB2YWx1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdmFsdWUgPSB2YWx1ZTtcblx0XHRcdHRoaXMuX3VyaSA9IFVSSS5pc1VyaSh2YWx1ZSkgPyB2YWx1ZSA6IHZhbHVlPy51cmk7XG5cdFx0fVxuXHRcdHRoaXMuX2lzU2VsZWN0aW9uID0gaXNTZWxlY3Rpb247XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5maXJlKCk7XG5cdH1cblxuXHRwdWJsaWMgdG9CYXNlRW50cmllcygpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10ge1xuXHRcdGlmICghdGhpcy52YWx1ZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmIChVUkkuaXNVcmkodGhpcy52YWx1ZSkgJiYgdGhpcy52YWx1ZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlQnJvd3Nlcikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmIChpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKHRoaXMudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogJ3N0cmluZycsXG5cdFx0XHRcdFx0aWQ6IHRoaXMuaWQsXG5cdFx0XHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0XHRcdHZhbHVlOiB0aGlzLnZhbHVlLnZhbHVlID8/IHRoaXMubmFtZSxcblx0XHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiB0aGlzLm1vZGVsRGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0aWNvblBhdGg6IHRoaXMudmFsdWUuaWNvblBhdGgsXG5cdFx0XHRcdFx0dXJpOiB0aGlzLnZhbHVlLnVyaSxcblx0XHRcdFx0XHRyZXNvdXJjZVVyaTogdGhpcy52YWx1ZS5yZXNvdXJjZVVyaSxcblx0XHRcdFx0XHRoYW5kbGU6IHRoaXMudmFsdWUuaGFuZGxlLFxuXHRcdFx0XHRcdGNvbW1hbmRJZDogdGhpcy52YWx1ZS5jb21tYW5kSWRcblx0XHRcdFx0fVxuXHRcdFx0XTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW3tcblx0XHRcdGtpbmQ6ICdmaWxlJyxcblx0XHRcdGlkOiB0aGlzLmlkLFxuXHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0dmFsdWU6IHRoaXMudmFsdWUsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiB0aGlzLm1vZGVsRGVzY3JpcHRpb24sXG5cdFx0fV07XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksZUFBZSxpQkFBaUIseUJBQXlCO0FBQzlFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLGVBQWU7QUFDbEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMscUJBQWtDO0FBQzNDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQTRCO0FBQ3JDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUNBQXdEO0FBRWpFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQXVFLG9DQUFpRjtBQUN4SixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlDQUF5QztBQUNsRCxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUywyQkFBMkI7QUFHcEMsU0FBUywwQkFBMEI7QUFFNUIsSUFBTSxrQ0FBTixjQUE4QyxXQUE2QztBQUFBLEVBT2pHLFlBQ3NDLG1CQUNKLGVBQ0ksbUJBQ04sYUFDTyxvQkFDRSxzQkFDWSxxQkFDZCxvQkFDckM7QUFDRCxVQUFNO0FBVCtCO0FBQ0o7QUFDSTtBQUNOO0FBQ087QUFDRTtBQUNZO0FBQ2Q7QUFHdEMsU0FBSyw0QkFBNEIsS0FBSyxVQUFVLElBQUksa0JBQTJDLENBQUM7QUFDaEcsU0FBSyw2QkFBNkIsS0FBSyxxQkFBcUIsU0FBcUMsOEJBQThC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
