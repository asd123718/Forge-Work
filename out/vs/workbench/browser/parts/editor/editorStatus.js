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
import "./media/editorstatus.css";
import { localize, localize2 } from "../../../../nls.js";
import { getWindowById, runAtThisOrScheduleAtNextAnimationFrame } from "../../../../base/browser/dom.js";
import { format, compare, splitLines } from "../../../../base/common/strings.js";
import { extname, basename, isEqual } from "../../../../base/common/resources.js";
import { areFunctions, assertReturnsDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { toAction } from "../../../../base/common/actions.js";
import { Language } from "../../../../base/common/platform.js";
import { UntitledTextEditorInput } from "../../../services/untitled/common/untitledTextEditorInput.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { Disposable, MutableDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { EndOfLineSequence } from "../../../../editor/common/model.js";
import { TrimTrailingWhitespaceAction } from "../../../../editor/contrib/linesOperations/browser/linesOperations.js";
import { IndentUsingSpaces, IndentUsingTabs, ChangeTabDisplaySize, DetectIndentation, IndentationToSpacesAction, IndentationToTabsAction } from "../../../../editor/contrib/indentation/browser/indentation.js";
import { BaseBinaryResourceEditor } from "./binaryEditor.js";
import { BinaryResourceDiffEditor } from "./binaryDiffEditor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IFileService, FILES_ASSOCIATIONS_CONFIG } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import { ICommandService, CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IExtensionGalleryService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { EncodingMode, ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { SUPPORTED_ENCODINGS } from "../../../services/textfile/common/encoding.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { deepClone } from "../../../../base/common/objects.js";
import { getCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { Schemas } from "../../../../base/common/network.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { getIconClassesForLanguageId } from "../../../../editor/common/services/getIconClasses.js";
import { Promises, timeout } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { IMarkerService, MarkerSeverity, IMarkerData } from "../../../../platform/markers/common/markers.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { AutomaticLanguageDetectionLikelyWrongId, ILanguageDetectionService } from "../../../services/languageDetection/common/languageDetectionWorkerService.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Action2 } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { TabFocus } from "../../../../editor/browser/config/tabFocus.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { InputMode } from "../../../../editor/common/inputMode.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
class SideBySideEditorEncodingSupport {
  constructor(primary, secondary) {
    this.primary = primary;
    this.secondary = secondary;
  }
  getEncoding() {
    return this.primary.getEncoding();
  }
  async setEncoding(encoding, mode) {
    await Promises.settled([this.primary, this.secondary].map((editor) => editor.setEncoding(encoding, mode)));
  }
}
class SideBySideEditorLanguageSupport {
  constructor(primary, secondary) {
    this.primary = primary;
    this.secondary = secondary;
  }
  setLanguageId(languageId, source) {
    [this.primary, this.secondary].forEach((editor) => editor.setLanguageId(languageId, source));
  }
}
function toEditorWithEncodingSupport(input) {
  if (input instanceof UntitledTextEditorInput) {
    return input;
  }
  if (input instanceof SideBySideEditorInput) {
    const primaryEncodingSupport = toEditorWithEncodingSupport(input.primary);
    const secondaryEncodingSupport = toEditorWithEncodingSupport(input.secondary);
    if (primaryEncodingSupport && secondaryEncodingSupport) {
      return new SideBySideEditorEncodingSupport(primaryEncodingSupport, secondaryEncodingSupport);
    }
    return primaryEncodingSupport;
  }
  const encodingSupport = input;
  if (areFunctions(encodingSupport.setEncoding, encodingSupport.getEncoding)) {
    return encodingSupport;
  }
  return null;
}
function toEditorWithLanguageSupport(input) {
  if (input instanceof UntitledTextEditorInput) {
    return input;
  }
  if (input instanceof SideBySideEditorInput) {
    const primaryLanguageSupport = toEditorWithLanguageSupport(input.primary);
    const secondaryLanguageSupport = toEditorWithLanguageSupport(input.secondary);
    if (primaryLanguageSupport && secondaryLanguageSupport) {
      return new SideBySideEditorLanguageSupport(primaryLanguageSupport, secondaryLanguageSupport);
    }
    return primaryLanguageSupport;
  }
  const languageSupport = input;
  if (typeof languageSupport.setLanguageId === "function") {
    return languageSupport;
  }
  return null;
}
class StateChange {
  constructor() {
    this.indentation = false;
    this.selectionStatus = false;
    this.languageId = false;
    this.languageStatus = false;
    this.encoding = false;
    this.EOL = false;
    this.tabFocusMode = false;
    this.inputMode = false;
    this.columnSelectionMode = false;
    this.metadata = false;
  }
  combine(other) {
    this.indentation = this.indentation || other.indentation;
    this.selectionStatus = this.selectionStatus || other.selectionStatus;
    this.languageId = this.languageId || other.languageId;
    this.languageStatus = this.languageStatus || other.languageStatus;
    this.encoding = this.encoding || other.encoding;
    this.EOL = this.EOL || other.EOL;
    this.tabFocusMode = this.tabFocusMode || other.tabFocusMode;
    this.inputMode = this.inputMode || other.inputMode;
    this.columnSelectionMode = this.columnSelectionMode || other.columnSelectionMode;
    this.metadata = this.metadata || other.metadata;
  }
  hasChanges() {
    return this.indentation || this.selectionStatus || this.languageId || this.languageStatus || this.encoding || this.EOL || this.tabFocusMode || this.inputMode || this.columnSelectionMode || this.metadata;
  }
}
class State {
  get selectionStatus() {
    return this._selectionStatus;
  }
  get languageId() {
    return this._languageId;
  }
  get encoding() {
    return this._encoding;
  }
  get EOL() {
    return this._EOL;
  }
  get indentation() {
    return this._indentation;
  }
  get tabFocusMode() {
    return this._tabFocusMode;
  }
  get inputMode() {
    return this._inputMode;
  }
  get columnSelectionMode() {
    return this._columnSelectionMode;
  }
  get metadata() {
    return this._metadata;
  }
  update(update) {
    const change = new StateChange();
    switch (update.type) {
      case "selectionStatus":
        if (this._selectionStatus !== update.selectionStatus) {
          this._selectionStatus = update.selectionStatus;
          change.selectionStatus = true;
        }
        break;
      case "indentation":
        if (this._indentation !== update.indentation) {
          this._indentation = update.indentation;
          change.indentation = true;
        }
        break;
      case "languageId":
        if (this._languageId !== update.languageId) {
          this._languageId = update.languageId;
          change.languageId = true;
        }
        break;
      case "encoding":
        if (this._encoding !== update.encoding) {
          this._encoding = update.encoding;
          change.encoding = true;
        }
        break;
      case "EOL":
        if (this._EOL !== update.EOL) {
          this._EOL = update.EOL;
          change.EOL = true;
        }
        break;
      case "tabFocusMode":
        if (this._tabFocusMode !== update.tabFocusMode) {
          this._tabFocusMode = update.tabFocusMode;
          change.tabFocusMode = true;
        }
        break;
      case "inputMode":
        if (this._inputMode !== update.inputMode) {
          this._inputMode = update.inputMode;
          change.inputMode = true;
        }
        break;
      case "columnSelectionMode":
        if (this._columnSelectionMode !== update.columnSelectionMode) {
          this._columnSelectionMode = update.columnSelectionMode;
          change.columnSelectionMode = true;
        }
        break;
      case "metadata":
        if (this._metadata !== update.metadata) {
          this._metadata = update.metadata;
          change.metadata = true;
        }
        break;
    }
    return change;
  }
}
let TabFocusMode = class extends Disposable {
  constructor(configurationService) {
    super();
    this.configurationService = configurationService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.registerListeners();
    const tabFocusModeConfig = configurationService.getValue("editor.tabFocusMode") === true;
    TabFocus.setTabFocusMode(tabFocusModeConfig);
  }
  registerListeners() {
    this._register(TabFocus.onDidChangeTabFocus((tabFocusMode) => this._onDidChange.fire(tabFocusMode)));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.tabFocusMode")) {
        const tabFocusModeConfig = this.configurationService.getValue("editor.tabFocusMode") === true;
        TabFocus.setTabFocusMode(tabFocusModeConfig);
        this._onDidChange.fire(tabFocusModeConfig);
      }
    }));
  }
};
TabFocusMode = __decorateClass([
  __decorateParam(0, IConfigurationService)
], TabFocusMode);
class StatusInputMode extends Disposable {
  constructor() {
    super();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    InputMode.setInputMode("insert");
    this._register(InputMode.onDidChangeInputMode((inputMode) => this._onDidChange.fire(inputMode)));
  }
}
const nlsSingleSelectionRange = localize("singleSelectionRange", "Ln {0}, Col {1} ({2} selected)");
const nlsSingleSelection = localize("singleSelection", "Ln {0}, Col {1}");
const nlsMultiSelectionRange = localize("multiSelectionRange", "{0} selections ({1} characters selected)");
const nlsMultiSelection = localize("multiSelection", "{0} selections");
const nlsEOLLF = localize("endOfLineLineFeed", "LF");
const nlsEOLCRLF = localize("endOfLineCarriageReturnLineFeed", "CRLF");
let EditorStatus = class extends Disposable {
  constructor(targetWindowId, editorService, quickInputService, languageService, textFileService, statusbarService, instantiationService, configurationService) {
    super();
    this.targetWindowId = targetWindowId;
    this.editorService = editorService;
    this.quickInputService = quickInputService;
    this.languageService = languageService;
    this.textFileService = textFileService;
    this.statusbarService = statusbarService;
    this.configurationService = configurationService;
    this.tabFocusModeElement = this._register(new MutableDisposable());
    this.inputModeElement = this._register(new MutableDisposable());
    this.columnSelectionModeElement = this._register(new MutableDisposable());
    this.indentationElement = this._register(new MutableDisposable());
    this.selectionElement = this._register(new MutableDisposable());
    this.encodingElement = this._register(new MutableDisposable());
    this.eolElement = this._register(new MutableDisposable());
    this.languageElement = this._register(new MutableDisposable());
    this.metadataElement = this._register(new MutableDisposable());
    this.state = new State();
    this.toRender = void 0;
    this.activeEditorListeners = this._register(new DisposableStore());
    this.delayedRender = this._register(new MutableDisposable());
    this.currentMarkerStatus = this._register(instantiationService.createInstance(ShowCurrentMarkerInStatusbarContribution));
    this.tabFocusMode = this._register(instantiationService.createInstance(TabFocusMode));
    this.inputMode = this._register(instantiationService.createInstance(StatusInputMode));
    this.registerCommands();
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.editorService.onDidActiveEditorChange(() => this.updateStatusBar()));
    this._register(this.textFileService.untitled.onDidChangeEncoding((model) => this.onResourceEncodingChange(model.resource)));
    this._register(this.textFileService.files.onDidChangeEncoding((model) => this.onResourceEncodingChange(model.resource)));
    this._register(Event.runAndSubscribe(this.tabFocusMode.onDidChange, (tabFocusMode) => {
      if (tabFocusMode !== void 0) {
        this.onTabFocusModeChange(tabFocusMode);
      } else {
        this.onTabFocusModeChange(this.configurationService.getValue("editor.tabFocusMode"));
      }
    }));
    this._register(Event.runAndSubscribe(this.inputMode.onDidChange, (inputMode) => this.onInputModeChange(inputMode ?? "insert")));
  }
  registerCommands() {
    this._register(CommandsRegistry.registerCommand({ id: `changeEditorIndentation${this.targetWindowId}`, handler: () => this.showIndentationPicker() }));
  }
  async showIndentationPicker() {
    const activeTextEditorControl = getCodeEditor(this.editorService.activeTextEditorControl);
    if (!activeTextEditorControl) {
      return this.quickInputService.pick([{ label: localize("noEditor", "No text editor active at this time") }]);
    }
    if (this.editorService.activeEditor?.isReadonly()) {
      return this.quickInputService.pick([{ label: localize("noWritableCodeEditor", "The active code editor is read-only.") }]);
    }
    const picks = [
      assertReturnsDefined(activeTextEditorControl.getAction(IndentUsingSpaces.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(IndentUsingTabs.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(ChangeTabDisplaySize.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(DetectIndentation.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(IndentationToSpacesAction.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(IndentationToTabsAction.ID)),
      assertReturnsDefined(activeTextEditorControl.getAction(TrimTrailingWhitespaceAction.ID))
    ].map((a) => {
      return {
        id: a.id,
        label: a.label,
        detail: Language.isDefaultVariant() || a.label === a.alias ? void 0 : a.alias,
        run: () => {
          activeTextEditorControl.focus();
          a.run();
        }
      };
    });
    picks.splice(3, 0, { type: "separator", label: localize("indentConvert", "convert file") });
    picks.unshift({ type: "separator", label: localize("indentView", "change view") });
    const action = await this.quickInputService.pick(picks, { placeHolder: localize("pickAction", "Select Action"), matchOnDetail: true });
    return action?.run();
  }
  updateTabFocusModeElement(visible) {
    if (visible) {
      if (!this.tabFocusModeElement.value) {
        const text = localize("tabFocusModeEnabled", "Tab Moves Focus");
        this.tabFocusModeElement.value = this.statusbarService.addEntry({
          name: localize("status.editor.tabFocusMode", "Accessibility Mode"),
          text,
          ariaLabel: text,
          tooltip: localize("disableTabMode", "Disable Accessibility Mode"),
          command: "editor.action.toggleTabFocusMode",
          kind: "prominent"
        }, "status.editor.tabFocusMode", StatusbarAlignment.RIGHT, 100.7);
      }
    } else {
      this.tabFocusModeElement.clear();
    }
  }
  updateInputModeElement(inputMode) {
    if (inputMode === "overtype") {
      if (!this.inputModeElement.value) {
        const text = localize("inputModeOvertype", "OVR");
        const name = localize("status.editor.enableInsertMode", "Enable Insert Mode");
        this.inputModeElement.value = this.statusbarService.addEntry({
          name,
          text,
          ariaLabel: text,
          tooltip: name,
          command: "editor.action.toggleOvertypeInsertMode",
          kind: "prominent"
        }, "status.editor.inputMode", StatusbarAlignment.RIGHT, 100.6);
      }
    } else {
      this.inputModeElement.clear();
    }
  }
  updateColumnSelectionModeElement(visible) {
    if (visible) {
      if (!this.columnSelectionModeElement.value) {
        const text = localize("columnSelectionModeEnabled", "Column Selection");
        this.columnSelectionModeElement.value = this.statusbarService.addEntry({
          name: localize("status.editor.columnSelectionMode", "Column Selection Mode"),
          text,
          ariaLabel: text,
          tooltip: localize("disableColumnSelectionMode", "Disable Column Selection Mode"),
          command: "editor.action.toggleColumnSelection",
          kind: "prominent"
        }, "status.editor.columnSelectionMode", StatusbarAlignment.RIGHT, 100.8);
      }
    } else {
      this.columnSelectionModeElement.clear();
    }
  }
  updateSelectionElement(text) {
    if (!text) {
      this.selectionElement.clear();
      return;
    }
    const editorURI = getCodeEditor(this.editorService.activeTextEditorControl)?.getModel()?.uri;
    if (editorURI?.scheme === Schemas.vscodeNotebookCell) {
      this.selectionElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.selection", "Editor Selection"),
      text,
      ariaLabel: text,
      tooltip: localize("gotoLine", "Go to Line/Column"),
      command: "workbench.action.gotoLine"
    };
    this.updateElement(this.selectionElement, props, "status.editor.selection", StatusbarAlignment.RIGHT, 100.5);
  }
  updateIndentationElement(text) {
    if (!text) {
      this.indentationElement.clear();
      return;
    }
    const editorURI = getCodeEditor(this.editorService.activeTextEditorControl)?.getModel()?.uri;
    if (editorURI?.scheme === Schemas.vscodeNotebookCell) {
      this.indentationElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.indentation", "Editor Indentation"),
      text,
      ariaLabel: text,
      tooltip: localize("selectIndentation", "Select Indentation"),
      command: `changeEditorIndentation${this.targetWindowId}`
    };
    this.updateElement(this.indentationElement, props, "status.editor.indentation", StatusbarAlignment.RIGHT, 100.4);
  }
  updateEncodingElement(text) {
    if (!text) {
      this.encodingElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.encoding", "Editor Encoding"),
      text,
      ariaLabel: text,
      tooltip: localize("selectEncoding", "Select Encoding"),
      command: "workbench.action.editor.changeEncoding"
    };
    this.updateElement(this.encodingElement, props, "status.editor.encoding", StatusbarAlignment.RIGHT, 100.3);
  }
  updateEOLElement(text) {
    if (!text) {
      this.eolElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.eol", "Editor End of Line"),
      text,
      ariaLabel: text,
      tooltip: localize("selectEOL", "Select End of Line Sequence"),
      command: "workbench.action.editor.changeEOL"
    };
    this.updateElement(this.eolElement, props, "status.editor.eol", StatusbarAlignment.RIGHT, 100.2);
  }
  updateLanguageIdElement(text) {
    if (!text) {
      this.languageElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.mode", "Editor Language"),
      text,
      ariaLabel: text,
      tooltip: localize("selectLanguageMode", "Select Language Mode"),
      command: "workbench.action.editor.changeLanguageMode"
    };
    this.updateElement(this.languageElement, props, "status.editor.mode", StatusbarAlignment.RIGHT, 100.1);
  }
  updateMetadataElement(text) {
    if (!text) {
      this.metadataElement.clear();
      return;
    }
    const props = {
      name: localize("status.editor.info", "File Information"),
      text,
      ariaLabel: text,
      tooltip: localize("fileInfo", "File Information")
    };
    this.updateElement(this.metadataElement, props, "status.editor.info", StatusbarAlignment.RIGHT, 100);
  }
  updateElement(element, props, id, alignment, priority) {
    if (!element.value) {
      element.value = this.statusbarService.addEntry(props, id, alignment, priority);
    } else {
      element.value.update(props);
    }
  }
  updateState(update) {
    const changed = this.state.update(update);
    if (!changed.hasChanges()) {
      return;
    }
    if (!this.toRender) {
      this.toRender = changed;
      this.delayedRender.value = runAtThisOrScheduleAtNextAnimationFrame(getWindowById(this.targetWindowId, true).window, () => {
        this.delayedRender.clear();
        const toRender = this.toRender;
        this.toRender = void 0;
        if (toRender) {
          this.doRenderNow();
        }
      });
    } else {
      this.toRender.combine(changed);
    }
  }
  doRenderNow() {
    this.updateTabFocusModeElement(!!this.state.tabFocusMode);
    this.updateInputModeElement(this.state.inputMode);
    this.updateColumnSelectionModeElement(!!this.state.columnSelectionMode);
    this.updateIndentationElement(this.state.indentation);
    this.updateSelectionElement(this.state.selectionStatus);
    this.updateEncodingElement(this.state.encoding);
    this.updateEOLElement(this.state.EOL ? this.state.EOL === "\r\n" ? nlsEOLCRLF : nlsEOLLF : void 0);
    this.updateLanguageIdElement(this.state.languageId);
    this.updateMetadataElement(this.state.metadata);
  }
  getSelectionLabel(info) {
    if (!info?.selections) {
      return void 0;
    }
    if (info.selections.length === 1) {
      if (info.charactersSelected) {
        return format(nlsSingleSelectionRange, info.selections[0].positionLineNumber, info.selections[0].positionColumn, info.charactersSelected);
      }
      return format(nlsSingleSelection, info.selections[0].positionLineNumber, info.selections[0].positionColumn);
    }
    if (info.charactersSelected) {
      return format(nlsMultiSelectionRange, info.selections.length, info.charactersSelected);
    }
    if (info.selections.length > 0) {
      return format(nlsMultiSelection, info.selections.length);
    }
    return void 0;
  }
  updateStatusBar() {
    const activeInput = this.editorService.activeEditor;
    const activeEditorPane = this.editorService.activeEditorPane;
    const activeCodeEditor = activeEditorPane ? getCodeEditor(activeEditorPane.getControl()) ?? void 0 : void 0;
    this.onColumnSelectionModeChange(activeCodeEditor);
    this.onSelectionChange(activeCodeEditor);
    this.onLanguageChange(activeCodeEditor, activeInput);
    this.onEOLChange(activeCodeEditor);
    this.onEncodingChange(activeEditorPane, activeCodeEditor);
    this.onIndentationChange(activeCodeEditor);
    this.onMetadataChange(activeEditorPane);
    this.currentMarkerStatus.update(activeCodeEditor);
    this.activeEditorListeners.clear();
    if (activeEditorPane) {
      this.activeEditorListeners.add(activeEditorPane.onDidChangeControl(() => {
        this.updateStatusBar();
      }));
    }
    if (activeCodeEditor) {
      this.activeEditorListeners.add(activeCodeEditor.onDidChangeConfiguration((event) => {
        if (event.hasChanged(EditorOption.columnSelection)) {
          this.onColumnSelectionModeChange(activeCodeEditor);
        }
      }));
      this.activeEditorListeners.add(Event.defer(activeCodeEditor.onDidChangeCursorPosition)(() => {
        this.onSelectionChange(activeCodeEditor);
        this.currentMarkerStatus.update(activeCodeEditor);
      }));
      this.activeEditorListeners.add(activeCodeEditor.onDidChangeModelLanguage(() => {
        this.onLanguageChange(activeCodeEditor, activeInput);
      }));
      this.activeEditorListeners.add(Event.accumulate(activeCodeEditor.onDidChangeModelContent)((e) => {
        this.onEOLChange(activeCodeEditor);
        this.currentMarkerStatus.update(activeCodeEditor);
        const selections = activeCodeEditor.getSelections();
        if (selections) {
          for (const inner of e) {
            for (const change of inner.changes) {
              if (selections.some((selection) => Range.areIntersecting(selection, change.range))) {
                this.onSelectionChange(activeCodeEditor);
                break;
              }
            }
          }
        }
      }));
      this.activeEditorListeners.add(activeCodeEditor.onDidChangeModelOptions(() => {
        this.onIndentationChange(activeCodeEditor);
      }));
    } else if (activeEditorPane instanceof BaseBinaryResourceEditor || activeEditorPane instanceof BinaryResourceDiffEditor) {
      const binaryEditors = [];
      if (activeEditorPane instanceof BinaryResourceDiffEditor) {
        const primary = activeEditorPane.getPrimaryEditorPane();
        if (primary instanceof BaseBinaryResourceEditor) {
          binaryEditors.push(primary);
        }
        const secondary = activeEditorPane.getSecondaryEditorPane();
        if (secondary instanceof BaseBinaryResourceEditor) {
          binaryEditors.push(secondary);
        }
      } else {
        binaryEditors.push(activeEditorPane);
      }
      for (const editor of binaryEditors) {
        this.activeEditorListeners.add(editor.onDidChangeMetadata(() => {
          this.onMetadataChange(activeEditorPane);
        }));
        this.activeEditorListeners.add(editor.onDidOpenInPlace(() => {
          this.updateStatusBar();
        }));
      }
    }
  }
  onLanguageChange(editorWidget, editorInput) {
    const info = { type: "languageId", languageId: void 0 };
    if (editorWidget && editorInput && toEditorWithLanguageSupport(editorInput)) {
      const textModel = editorWidget.getModel();
      if (textModel) {
        const languageId = textModel.getLanguageId();
        info.languageId = this.languageService.getLanguageName(languageId) ?? void 0;
      }
    }
    this.updateState(info);
  }
  onIndentationChange(editorWidget) {
    const update = { type: "indentation", indentation: void 0 };
    if (editorWidget) {
      const model = editorWidget.getModel();
      if (model) {
        const modelOpts = model.getOptions();
        update.indentation = modelOpts.insertSpaces ? modelOpts.tabSize === modelOpts.indentSize ? localize("spacesSize", "Spaces: {0}", modelOpts.indentSize) : localize("spacesAndTabsSize", "Spaces: {0} (Tab Size: {1})", modelOpts.indentSize, modelOpts.tabSize) : localize({ key: "tabSize", comment: ["Tab corresponds to the tab key"] }, "Tab Size: {0}", modelOpts.tabSize);
      }
    }
    this.updateState(update);
  }
  onMetadataChange(editor) {
    const update = { type: "metadata", metadata: void 0 };
    if (editor instanceof BaseBinaryResourceEditor || editor instanceof BinaryResourceDiffEditor) {
      update.metadata = editor.getMetadata();
    }
    this.updateState(update);
  }
  onColumnSelectionModeChange(editorWidget) {
    const info = { type: "columnSelectionMode", columnSelectionMode: false };
    if (editorWidget?.getOption(EditorOption.columnSelection)) {
      info.columnSelectionMode = true;
    }
    this.updateState(info);
  }
  onSelectionChange(editorWidget) {
    const info = /* @__PURE__ */ Object.create(null);
    if (editorWidget) {
      info.selections = editorWidget.getSelections() || [];
      info.charactersSelected = 0;
      const textModel = editorWidget.getModel();
      if (textModel) {
        for (const selection of info.selections) {
          if (typeof info.charactersSelected !== "number") {
            info.charactersSelected = 0;
          }
          info.charactersSelected += textModel.getCharacterCountInRange(selection);
        }
      }
      if (info.selections.length === 1) {
        const editorPosition = editorWidget.getPosition();
        const selectionClone = new Selection(
          info.selections[0].selectionStartLineNumber,
          info.selections[0].selectionStartColumn,
          info.selections[0].positionLineNumber,
          editorPosition ? editorWidget.getStatusbarColumn(editorPosition) : info.selections[0].positionColumn
        );
        info.selections[0] = selectionClone;
      }
    }
    this.updateState({ type: "selectionStatus", selectionStatus: this.getSelectionLabel(info) });
  }
  onEOLChange(editorWidget) {
    const info = { type: "EOL", EOL: void 0 };
    if (editorWidget && !editorWidget.getOption(EditorOption.readOnly)) {
      const codeEditorModel = editorWidget.getModel();
      if (codeEditorModel) {
        info.EOL = codeEditorModel.getEOL();
      }
    }
    this.updateState(info);
  }
  onEncodingChange(editor, editorWidget) {
    if (editor && !this.isActiveEditor(editor)) {
      return;
    }
    const info = { type: "encoding", encoding: void 0 };
    if (editor && editorWidget?.hasModel()) {
      const encodingSupport = editor.input ? toEditorWithEncodingSupport(editor.input) : null;
      if (encodingSupport) {
        const rawEncoding = encodingSupport.getEncoding();
        const encodingInfo = typeof rawEncoding === "string" ? SUPPORTED_ENCODINGS[rawEncoding] : void 0;
        if (encodingInfo) {
          info.encoding = encodingInfo.labelShort;
        } else {
          info.encoding = rawEncoding;
        }
      }
    }
    this.updateState(info);
  }
  onResourceEncodingChange(resource) {
    const activeEditorPane = this.editorService.activeEditorPane;
    if (activeEditorPane) {
      const activeResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
      if (activeResource && isEqual(activeResource, resource)) {
        const activeCodeEditor = getCodeEditor(activeEditorPane.getControl()) ?? void 0;
        return this.onEncodingChange(activeEditorPane, activeCodeEditor);
      }
    }
  }
  onTabFocusModeChange(tabFocusMode) {
    const info = { type: "tabFocusMode", tabFocusMode };
    this.updateState(info);
  }
  onInputModeChange(inputMode) {
    const info = { type: "inputMode", inputMode };
    this.updateState(info);
  }
  isActiveEditor(control) {
    const activeEditorPane = this.editorService.activeEditorPane;
    return !!activeEditorPane && activeEditorPane === control;
  }
};
EditorStatus = __decorateClass([
  __decorateParam(1, IEditorService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, ILanguageService),
  __decorateParam(4, ITextFileService),
  __decorateParam(5, IStatusbarService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IConfigurationService)
], EditorStatus);
let EditorStatusContribution = class extends Disposable {
  constructor(editorGroupService) {
    super();
    this.editorGroupService = editorGroupService;
    for (const part of editorGroupService.parts) {
      this.createEditorStatus(part);
    }
    this._register(editorGroupService.onDidCreateAuxiliaryEditorPart((part) => this.createEditorStatus(part)));
  }
  createEditorStatus(part) {
    const disposables = new DisposableStore();
    Event.once(part.onWillDispose)(() => disposables.dispose());
    const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
    disposables.add(scopedInstantiationService.createInstance(EditorStatus, part.windowId));
  }
};
EditorStatusContribution.ID = "workbench.contrib.editorStatus";
EditorStatusContribution = __decorateClass([
  __decorateParam(0, IEditorGroupsService)
], EditorStatusContribution);
let ShowCurrentMarkerInStatusbarContribution = class extends Disposable {
  constructor(statusbarService, markerService, configurationService) {
    super();
    this.statusbarService = statusbarService;
    this.markerService = markerService;
    this.configurationService = configurationService;
    this.editor = void 0;
    this.markers = [];
    this.currentMarker = null;
    this.statusBarEntryAccessor = this._register(new MutableDisposable());
    this._register(markerService.onMarkerChanged((changedResources) => this.onMarkerChanged(changedResources)));
    this._register(Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("problems.showCurrentInStatus"))(() => this.updateStatus()));
  }
  update(editor) {
    this.editor = editor;
    this.updateMarkers();
    this.updateStatus();
  }
  updateStatus() {
    const previousMarker = this.currentMarker;
    this.currentMarker = this.getMarker();
    if (this.hasToUpdateStatus(previousMarker, this.currentMarker)) {
      if (this.currentMarker) {
        const line = splitLines(this.currentMarker.message)[0];
        const text = `${this.getType(this.currentMarker)} ${line}`;
        if (!this.statusBarEntryAccessor.value) {
          this.statusBarEntryAccessor.value = this.statusbarService.addEntry({ name: localize("currentProblem", "Current Problem"), text, ariaLabel: text }, "statusbar.currentProblem", StatusbarAlignment.LEFT);
        } else {
          this.statusBarEntryAccessor.value.update({ name: localize("currentProblem", "Current Problem"), text, ariaLabel: text });
        }
      } else {
        this.statusBarEntryAccessor.clear();
      }
    }
  }
  hasToUpdateStatus(previousMarker, currentMarker) {
    if (!currentMarker) {
      return true;
    }
    if (!previousMarker) {
      return true;
    }
    return IMarkerData.makeKey(previousMarker) !== IMarkerData.makeKey(currentMarker);
  }
  getType(marker) {
    switch (marker.severity) {
      case MarkerSeverity.Error:
        return "$(error)";
      case MarkerSeverity.Warning:
        return "$(warning)";
      case MarkerSeverity.Info:
        return "$(info)";
    }
    return "";
  }
  getMarker() {
    if (!this.configurationService.getValue("problems.showCurrentInStatus")) {
      return null;
    }
    if (!this.editor) {
      return null;
    }
    const model = this.editor.getModel();
    if (!model) {
      return null;
    }
    const position = this.editor.getPosition();
    if (!position) {
      return null;
    }
    return this.markers.find((marker) => Range.containsPosition(marker, position)) || null;
  }
  onMarkerChanged(changedResources) {
    if (!this.editor) {
      return;
    }
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    if (model && !changedResources.some((r) => isEqual(model.uri, r))) {
      return;
    }
    this.updateMarkers();
  }
  updateMarkers() {
    if (!this.editor) {
      return;
    }
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    if (model) {
      this.markers = this.markerService.read({
        resource: model.uri,
        severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info
      });
      this.markers.sort(this.compareMarker);
    } else {
      this.markers = [];
    }
    this.updateStatus();
  }
  compareMarker(a, b) {
    let res = compare(a.resource.toString(), b.resource.toString());
    if (res === 0) {
      res = MarkerSeverity.compare(a.severity, b.severity);
    }
    if (res === 0) {
      res = Range.compareRangesUsingStarts(a, b);
    }
    return res;
  }
};
ShowCurrentMarkerInStatusbarContribution = __decorateClass([
  __decorateParam(0, IStatusbarService),
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IConfigurationService)
], ShowCurrentMarkerInStatusbarContribution);
const _ChangeLanguageAction = class _ChangeLanguageAction extends Action2 {
  constructor() {
    super({
      id: _ChangeLanguageAction.ID,
      title: localize2("changeMode", "Change Language Mode"),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyM)
      },
      precondition: ContextKeyExpr.not("notebookEditorFocused"),
      metadata: {
        description: localize("changeLanguageMode.description", "Change the language mode of the active text editor."),
        args: [
          {
            name: localize("changeLanguageMode.arg.name", "The name of the language mode to change to."),
            constraint: (value) => typeof value === "string"
          }
        ]
      }
    });
  }
  async run(accessor, languageMode) {
    const quickInputService = accessor.get(IQuickInputService);
    const editorService = accessor.get(IEditorService);
    const languageService = accessor.get(ILanguageService);
    const languageDetectionService = accessor.get(ILanguageDetectionService);
    const textFileService = accessor.get(ITextFileService);
    const preferencesService = accessor.get(IPreferencesService);
    const configurationService = accessor.get(IConfigurationService);
    const telemetryService = accessor.get(ITelemetryService);
    const commandService = accessor.get(ICommandService);
    const galleryService = accessor.get(IExtensionGalleryService);
    const activeTextEditorControl = getCodeEditor(editorService.activeTextEditorControl);
    if (!activeTextEditorControl) {
      await quickInputService.pick([{ label: localize("noEditor", "No text editor active at this time") }]);
      return;
    }
    const textModel = activeTextEditorControl.getModel();
    const resource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    let currentLanguageName;
    let currentLanguageId;
    if (textModel) {
      currentLanguageId = textModel.getLanguageId();
      currentLanguageName = languageService.getLanguageName(currentLanguageId) ?? void 0;
    }
    let hasLanguageSupport = !!resource;
    if (resource?.scheme === Schemas.untitled && !textFileService.untitled.get(resource)?.hasAssociatedFilePath) {
      hasLanguageSupport = false;
    }
    const languages = languageService.getSortedRegisteredLanguageNames();
    const picks = languages.map(({ languageName, languageId }) => {
      const extensions = languageService.getExtensions(languageId).join(" ");
      let description;
      if (currentLanguageName === languageName) {
        description = localize("languageDescription", "({0}) - Configured Language", languageId);
      } else {
        description = localize("languageDescriptionConfigured", "({0})", languageId);
      }
      return {
        id: languageId,
        label: languageName,
        meta: extensions,
        iconClasses: getIconClassesForLanguageId(languageId),
        description
      };
    });
    picks.unshift({ type: "separator", label: localize("languagesPicks", "languages (identifier)") });
    let configureLanguageAssociations;
    let configureLanguageSettings;
    let galleryAction;
    if (hasLanguageSupport && resource) {
      const ext = extname(resource) || basename(resource);
      if (galleryService.isEnabled()) {
        galleryAction = toAction({
          id: "workbench.action.showLanguageExtensions",
          label: localize("showLanguageExtensions", "Search Marketplace Extensions for '{0}'...", ext),
          run: () => commandService.executeCommand("workbench.extensions.action.showExtensionsForLanguage", ext)
        });
        picks.unshift(galleryAction);
      }
      configureLanguageSettings = { label: localize("configureModeSettings", "Configure '{0}' language based settings...", currentLanguageName) };
      picks.unshift(configureLanguageSettings);
      configureLanguageAssociations = { label: localize("configureAssociationsExt", "Configure File Association for '{0}'...", ext) };
      picks.unshift(configureLanguageAssociations);
    }
    const autoDetectLanguage = { label: localize("autoDetect", "Auto Detect") };
    if (textModel && textModel.getValueLength() > 0) {
      picks.unshift(autoDetectLanguage);
    }
    const pick = typeof languageMode === "string" ? { label: languageMode } : await quickInputService.pick(picks, { placeHolder: localize("pickLanguage", "Select Language Mode"), matchOnDescription: true });
    if (!pick) {
      return;
    }
    if (pick === galleryAction) {
      galleryAction.run();
      return;
    }
    if (pick === configureLanguageAssociations) {
      if (resource) {
        this.configureFileAssociation(resource, languageService, quickInputService, configurationService);
      }
      return;
    }
    if (pick === configureLanguageSettings) {
      preferencesService.openUserSettings({ jsonEditor: true, revealSetting: { key: `[${currentLanguageId ?? null}]`, edit: true } });
      return;
    }
    const activeEditor = editorService.activeEditor;
    if (activeEditor) {
      const languageSupport = toEditorWithLanguageSupport(activeEditor);
      if (languageSupport) {
        let languageSelection;
        let detectedLanguage;
        if (pick === autoDetectLanguage) {
          if (textModel) {
            const resource2 = EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
            if (resource2) {
              let languageId = languageService.guessLanguageIdByFilepathOrFirstLine(resource2, textModel.getLineContent(1)) ?? void 0;
              if (!languageId || languageId === "unknown") {
                detectedLanguage = await languageDetectionService.detectLanguage(resource2);
                languageId = detectedLanguage;
              }
              if (languageId) {
                languageSelection = languageService.createById(languageId);
              }
            }
          }
        } else {
          languageSelection = languageService.createById(pick.id);
          if (resource) {
            languageDetectionService.detectLanguage(resource).then((detectedLanguageId) => {
              const chosenLanguageId = languageService.getLanguageIdByLanguageName(pick.label) || "unknown";
              if (detectedLanguageId === currentLanguageId && currentLanguageId !== chosenLanguageId) {
                const modelPreference = configurationService.getValue("workbench.editor.preferHistoryBasedLanguageDetection") ? "history" : "classic";
                telemetryService.publicLog2(AutomaticLanguageDetectionLikelyWrongId, {
                  currentLanguageId: currentLanguageName ?? "unknown",
                  nextLanguageId: pick.label,
                  lineCount: textModel?.getLineCount() ?? -1,
                  modelPreference
                });
              }
            });
          }
        }
        if (typeof languageSelection !== "undefined") {
          languageSupport.setLanguageId(languageSelection.languageId, _ChangeLanguageAction.ID);
          if (resource?.scheme === Schemas.untitled) {
            const modelPreference = configurationService.getValue("workbench.editor.preferHistoryBasedLanguageDetection") ? "history" : "classic";
            telemetryService.publicLog2("setUntitledDocumentLanguage", {
              to: languageSelection.languageId,
              from: currentLanguageId ?? "none",
              modelPreference
            });
          }
        }
      }
      activeTextEditorControl.focus();
    }
  }
  configureFileAssociation(resource, languageService, quickInputService, configurationService) {
    const extension = extname(resource);
    const base = basename(resource);
    const currentAssociation = languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(base));
    const languages = languageService.getSortedRegisteredLanguageNames();
    const picks = languages.map(({ languageName, languageId }) => {
      return {
        id: languageId,
        label: languageName,
        iconClasses: getIconClassesForLanguageId(languageId),
        description: languageId === currentAssociation ? localize("currentAssociation", "Current Association") : void 0
      };
    });
    setTimeout(
      async () => {
        const language = await quickInputService.pick(picks, { placeHolder: localize("pickLanguageToConfigure", "Select Language Mode to Associate with '{0}'", extension || base) });
        if (language) {
          const fileAssociationsConfig = configurationService.inspect(FILES_ASSOCIATIONS_CONFIG);
          let associationKey;
          if (extension && base[0] !== ".") {
            associationKey = `*${extension}`;
          } else {
            associationKey = base;
          }
          let target = ConfigurationTarget.USER;
          if (fileAssociationsConfig.workspaceValue?.[associationKey]) {
            target = ConfigurationTarget.WORKSPACE;
          }
          const currentAssociations = deepClone(target === ConfigurationTarget.WORKSPACE ? fileAssociationsConfig.workspaceValue : fileAssociationsConfig.userValue) || /* @__PURE__ */ Object.create(null);
          currentAssociations[associationKey] = language.id;
          configurationService.updateValue(FILES_ASSOCIATIONS_CONFIG, currentAssociations, target);
        }
      },
      50
      /* quick input is sensitive to being opened so soon after another */
    );
  }
};
_ChangeLanguageAction.ID = "workbench.action.editor.changeLanguageMode";
let ChangeLanguageAction = _ChangeLanguageAction;
class ChangeEOLAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.editor.changeEOL",
      title: localize2("changeEndOfLine", "Change End of Line Sequence"),
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const quickInputService = accessor.get(IQuickInputService);
    const activeTextEditorControl = getCodeEditor(editorService.activeTextEditorControl);
    if (!activeTextEditorControl) {
      await quickInputService.pick([{ label: localize("noEditor", "No text editor active at this time") }]);
      return;
    }
    if (editorService.activeEditor?.isReadonly()) {
      await quickInputService.pick([{ label: localize("noWritableCodeEditor", "The active code editor is read-only.") }]);
      return;
    }
    let textModel = activeTextEditorControl.getModel();
    const EOLOptions = [
      { label: nlsEOLLF, eol: EndOfLineSequence.LF },
      { label: nlsEOLCRLF, eol: EndOfLineSequence.CRLF }
    ];
    const selectedIndex = textModel?.getEOL() === "\n" ? 0 : 1;
    const eol = await quickInputService.pick(EOLOptions, { placeHolder: localize("pickEndOfLine", "Select End of Line Sequence"), activeItem: EOLOptions[selectedIndex] });
    if (eol) {
      const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
      if (activeCodeEditor?.hasModel() && !editorService.activeEditor?.isReadonly()) {
        textModel = activeCodeEditor.getModel();
        textModel.pushStackElement();
        textModel.pushEOL(eol.eol);
        textModel.pushStackElement();
      }
    }
    activeTextEditorControl.focus();
  }
}
class ChangeEncodingAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.editor.changeEncoding",
      title: localize2("changeEncoding", "Change File Encoding"),
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const quickInputService = accessor.get(IQuickInputService);
    const fileService = accessor.get(IFileService);
    const textFileService = accessor.get(ITextFileService);
    const textResourceConfigurationService = accessor.get(ITextResourceConfigurationService);
    const dialogService = accessor.get(IDialogService);
    const activeTextEditorControl = getCodeEditor(editorService.activeTextEditorControl);
    if (!activeTextEditorControl) {
      await quickInputService.pick([{ label: localize("noEditor", "No text editor active at this time") }]);
      return;
    }
    const activeEditorPane = editorService.activeEditorPane;
    if (!activeEditorPane) {
      await quickInputService.pick([{ label: localize("noEditor", "No text editor active at this time") }]);
      return;
    }
    const encodingSupport = toEditorWithEncodingSupport(activeEditorPane.input);
    if (!encodingSupport) {
      await quickInputService.pick([{ label: localize("noFileEditor", "No file active at this time") }]);
      return;
    }
    const saveWithEncodingPick = { label: localize("saveWithEncoding", "Save with Encoding") };
    const reopenWithEncodingPick = { label: localize("reopenWithEncoding", "Reopen with Encoding") };
    if (!Language.isDefaultVariant()) {
      const saveWithEncodingAlias = "Save with Encoding";
      if (saveWithEncodingAlias !== saveWithEncodingPick.label) {
        saveWithEncodingPick.detail = saveWithEncodingAlias;
      }
      const reopenWithEncodingAlias = "Reopen with Encoding";
      if (reopenWithEncodingAlias !== reopenWithEncodingPick.label) {
        reopenWithEncodingPick.detail = reopenWithEncodingAlias;
      }
    }
    let action;
    if (encodingSupport instanceof UntitledTextEditorInput) {
      action = saveWithEncodingPick;
    } else if (activeEditorPane.input.isReadonly()) {
      action = reopenWithEncodingPick;
    } else {
      action = await quickInputService.pick([reopenWithEncodingPick, saveWithEncodingPick], { placeHolder: localize("pickAction", "Select Action"), matchOnDetail: true });
    }
    if (!action) {
      return;
    }
    await timeout(50);
    const resource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (!resource || !fileService.hasProvider(resource) && resource.scheme !== Schemas.untitled) {
      return;
    }
    let guessedEncoding = void 0;
    if (fileService.hasProvider(resource)) {
      const content = await textFileService.readStream(resource, {
        autoGuessEncoding: true,
        candidateGuessEncodings: textResourceConfigurationService.getValue(resource, "files.candidateGuessEncodings")
      });
      guessedEncoding = content.encoding;
    }
    const isReopenWithEncoding = action === reopenWithEncodingPick;
    const configuredEncoding = textResourceConfigurationService.getValue(resource, "files.encoding");
    let directMatchIndex;
    let aliasMatchIndex;
    const picks = Object.keys(SUPPORTED_ENCODINGS).sort((k1, k2) => {
      if (k1 === configuredEncoding) {
        return -1;
      } else if (k2 === configuredEncoding) {
        return 1;
      }
      return SUPPORTED_ENCODINGS[k1].order - SUPPORTED_ENCODINGS[k2].order;
    }).filter((k) => {
      if (k === guessedEncoding && guessedEncoding !== configuredEncoding) {
        return false;
      }
      return !isReopenWithEncoding || !SUPPORTED_ENCODINGS[k].encodeOnly;
    }).map((key, index) => {
      if (key === encodingSupport.getEncoding()) {
        directMatchIndex = index;
      } else if (SUPPORTED_ENCODINGS[key].alias === encodingSupport.getEncoding()) {
        aliasMatchIndex = index;
      }
      return { id: key, label: SUPPORTED_ENCODINGS[key].labelLong, description: key };
    });
    const items = picks.slice();
    if (guessedEncoding && configuredEncoding !== guessedEncoding && SUPPORTED_ENCODINGS[guessedEncoding]) {
      picks.unshift({ type: "separator" });
      picks.unshift({ id: guessedEncoding, label: SUPPORTED_ENCODINGS[guessedEncoding].labelLong, description: localize("guessedEncoding", "Guessed from content") });
    }
    const encoding = await quickInputService.pick(picks, {
      placeHolder: isReopenWithEncoding ? localize("pickEncodingForReopen", "Select File Encoding to Reopen File") : localize("pickEncodingForSave", "Select File Encoding to Save with"),
      activeItem: items[typeof directMatchIndex === "number" ? directMatchIndex : typeof aliasMatchIndex === "number" ? aliasMatchIndex : -1]
    });
    if (!encoding) {
      return;
    }
    if (!editorService.activeEditorPane) {
      return;
    }
    const activeEncodingSupport = toEditorWithEncodingSupport(editorService.activeEditorPane.input);
    if (typeof encoding.id !== "undefined" && activeEncodingSupport) {
      if (isReopenWithEncoding && editorService.activeEditorPane.input.isDirty()) {
        const { confirmed } = await dialogService.confirm({
          message: localize("reopenWithEncodingWarning", "Do you want to revert the active text editor and reopen with a different encoding?"),
          detail: localize("reopenWithEncodingDetail", "This will discard any unsaved changes."),
          primaryButton: localize("reopen", "Discard Changes and Reopen")
        });
        if (!confirmed) {
          return;
        }
        await editorService.activeEditorPane.input.revert(editorService.activeEditorPane.group.id);
      }
      await activeEncodingSupport.setEncoding(encoding.id, isReopenWithEncoding ? EncodingMode.Decode : EncodingMode.Encode);
    }
    activeTextEditorControl.focus();
  }
}
export {
  ChangeEOLAction,
  ChangeEncodingAction,
  ChangeLanguageAction,
  EditorStatusContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvclN0YXR1cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9lZGl0b3JzdGF0dXMuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0V2luZG93QnlJZCwgcnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBmb3JtYXQsIGNvbXBhcmUsIHNwbGl0TGluZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGV4dG5hbWUsIGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGFyZUZ1bmN0aW9ucywgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IExhbmd1YWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUZpbGVFZGl0b3JJbnB1dCwgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgSUVkaXRvclBhbmUsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFZGl0b3JBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVTZXF1ZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2xpbmVzT3BlcmF0aW9ucy9icm93c2VyL2xpbmVzT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJbmRlbnRVc2luZ1NwYWNlcywgSW5kZW50VXNpbmdUYWJzLCBDaGFuZ2VUYWJEaXNwbGF5U2l6ZSwgRGV0ZWN0SW5kZW50YXRpb24sIEluZGVudGF0aW9uVG9TcGFjZXNBY3Rpb24sIEluZGVudGF0aW9uVG9UYWJzQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5kZW50YXRpb24vYnJvd3Nlci9pbmRlbnRhdGlvbi5qcyc7XG5pbXBvcnQgeyBCYXNlQmluYXJ5UmVzb3VyY2VFZGl0b3IgfSBmcm9tICcuL2JpbmFyeUVkaXRvci5qcyc7XG5pbXBvcnQgeyBCaW5hcnlSZXNvdXJjZURpZmZFZGl0b3IgfSBmcm9tICcuL2JpbmFyeURpZmZFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBGSUxFU19BU1NPQ0lBVElPTlNfQ09ORklHIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSwgSUxhbmd1YWdlU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UsIENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBFbmNvZGluZ01vZGUsIElFbmNvZGluZ1N1cHBvcnQsIElMYW5ndWFnZVN1cHBvcnQsIElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IFNVUFBPUlRFRF9FTkNPRElOR1MgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vZW5jb2RpbmcuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBnZXRDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIFF1aWNrUGlja0lucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBnZXRJY29uQ2xhc3Nlc0Zvckxhbmd1YWdlSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IsIElTdGF0dXNiYXJTZXJ2aWNlLCBTdGF0dXNiYXJBbGlnbm1lbnQsIElTdGF0dXNiYXJFbnRyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBJTWFya2VyLCBJTWFya2VyU2VydmljZSwgTWFya2VyU2V2ZXJpdHksIElNYXJrZXJEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEF1dG9tYXRpY0xhbmd1YWdlRGV0ZWN0aW9uTGlrZWx5V3JvbmdDbGFzc2lmaWNhdGlvbiwgQXV0b21hdGljTGFuZ3VhZ2VEZXRlY3Rpb25MaWtlbHlXcm9uZ0lkLCBJQXV0b21hdGljTGFuZ3VhZ2VEZXRlY3Rpb25MaWtlbHlXcm9uZ0RhdGEsIElMYW5ndWFnZURldGVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYW5ndWFnZURldGVjdGlvbi9jb21tb24vbGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgVGFiRm9jdXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvdGFiRm9jdXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElucHV0TW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vaW5wdXRNb2RlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5cbmNsYXNzIFNpZGVCeVNpZGVFZGl0b3JFbmNvZGluZ1N1cHBvcnQgaW1wbGVtZW50cyBJRW5jb2RpbmdTdXBwb3J0IHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSBwcmltYXJ5OiBJRW5jb2RpbmdTdXBwb3J0LCBwcml2YXRlIHNlY29uZGFyeTogSUVuY29kaW5nU3VwcG9ydCkgeyB9XG5cblx0Z2V0RW5jb2RpbmcoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5wcmltYXJ5LmdldEVuY29kaW5nKCk7IC8vIGFsd2F5cyByZXBvcnQgZnJvbSBtb2RpZmllZCAocmlnaHQgaGFuZCkgc2lkZVxuXHR9XG5cblx0YXN5bmMgc2V0RW5jb2RpbmcoZW5jb2Rpbmc6IHN0cmluZywgbW9kZTogRW5jb2RpbmdNb2RlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChbdGhpcy5wcmltYXJ5LCB0aGlzLnNlY29uZGFyeV0ubWFwKGVkaXRvciA9PiBlZGl0b3Iuc2V0RW5jb2RpbmcoZW5jb2RpbmcsIG1vZGUpKSk7XG5cdH1cbn1cblxuY2xhc3MgU2lkZUJ5U2lkZUVkaXRvckxhbmd1YWdlU3VwcG9ydCBpbXBsZW1lbnRzIElMYW5ndWFnZVN1cHBvcnQge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcHJpbWFyeTogSUxhbmd1YWdlU3VwcG9ydCwgcHJpdmF0ZSBzZWNvbmRhcnk6IElMYW5ndWFnZVN1cHBvcnQpIHsgfVxuXG5cdHNldExhbmd1YWdlSWQobGFuZ3VhZ2VJZDogc3RyaW5nLCBzb3VyY2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRbdGhpcy5wcmltYXJ5LCB0aGlzLnNlY29uZGFyeV0uZm9yRWFjaChlZGl0b3IgPT4gZWRpdG9yLnNldExhbmd1YWdlSWQobGFuZ3VhZ2VJZCwgc291cmNlKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9FZGl0b3JXaXRoRW5jb2RpbmdTdXBwb3J0KGlucHV0OiBFZGl0b3JJbnB1dCk6IElFbmNvZGluZ1N1cHBvcnQgfCBudWxsIHtcblxuXHQvLyBVbnRpdGxlZCBUZXh0IEVkaXRvclxuXHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCkge1xuXHRcdHJldHVybiBpbnB1dDtcblx0fVxuXG5cdC8vIFNpZGUgYnkgU2lkZSAoZGlmZikgRWRpdG9yXG5cdGlmIChpbnB1dCBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3JJbnB1dCkge1xuXHRcdGNvbnN0IHByaW1hcnlFbmNvZGluZ1N1cHBvcnQgPSB0b0VkaXRvcldpdGhFbmNvZGluZ1N1cHBvcnQoaW5wdXQucHJpbWFyeSk7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5RW5jb2RpbmdTdXBwb3J0ID0gdG9FZGl0b3JXaXRoRW5jb2RpbmdTdXBwb3J0KGlucHV0LnNlY29uZGFyeSk7XG5cblx0XHRpZiAocHJpbWFyeUVuY29kaW5nU3VwcG9ydCAmJiBzZWNvbmRhcnlFbmNvZGluZ1N1cHBvcnQpIHtcblx0XHRcdHJldHVybiBuZXcgU2lkZUJ5U2lkZUVkaXRvckVuY29kaW5nU3VwcG9ydChwcmltYXJ5RW5jb2RpbmdTdXBwb3J0LCBzZWNvbmRhcnlFbmNvZGluZ1N1cHBvcnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcmltYXJ5RW5jb2RpbmdTdXBwb3J0O1xuXHR9XG5cblx0Ly8gRmlsZSBvciBSZXNvdXJjZSBFZGl0b3Jcblx0Y29uc3QgZW5jb2RpbmdTdXBwb3J0ID0gaW5wdXQgYXMgSUZpbGVFZGl0b3JJbnB1dDtcblx0aWYgKGFyZUZ1bmN0aW9ucyhlbmNvZGluZ1N1cHBvcnQuc2V0RW5jb2RpbmcsIGVuY29kaW5nU3VwcG9ydC5nZXRFbmNvZGluZykpIHtcblx0XHRyZXR1cm4gZW5jb2RpbmdTdXBwb3J0O1xuXHR9XG5cblx0Ly8gVW5zdXBwb3J0ZWQgZm9yIGFueSBvdGhlciBlZGl0b3Jcblx0cmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHRvRWRpdG9yV2l0aExhbmd1YWdlU3VwcG9ydChpbnB1dDogRWRpdG9ySW5wdXQpOiBJTGFuZ3VhZ2VTdXBwb3J0IHwgbnVsbCB7XG5cblx0Ly8gVW50aXRsZWQgVGV4dCBFZGl0b3Jcblx0aWYgKGlucHV0IGluc3RhbmNlb2YgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQpIHtcblx0XHRyZXR1cm4gaW5wdXQ7XG5cdH1cblxuXHQvLyBTaWRlIGJ5IFNpZGUgKGRpZmYpIEVkaXRvclxuXHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQpIHtcblx0XHRjb25zdCBwcmltYXJ5TGFuZ3VhZ2VTdXBwb3J0ID0gdG9FZGl0b3JXaXRoTGFuZ3VhZ2VTdXBwb3J0KGlucHV0LnByaW1hcnkpO1xuXHRcdGNvbnN0IHNlY29uZGFyeUxhbmd1YWdlU3VwcG9ydCA9IHRvRWRpdG9yV2l0aExhbmd1YWdlU3VwcG9ydChpbnB1dC5zZWNvbmRhcnkpO1xuXG5cdFx0aWYgKHByaW1hcnlMYW5ndWFnZVN1cHBvcnQgJiYgc2Vjb25kYXJ5TGFuZ3VhZ2VTdXBwb3J0KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNpZGVCeVNpZGVFZGl0b3JMYW5ndWFnZVN1cHBvcnQocHJpbWFyeUxhbmd1YWdlU3VwcG9ydCwgc2Vjb25kYXJ5TGFuZ3VhZ2VTdXBwb3J0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJpbWFyeUxhbmd1YWdlU3VwcG9ydDtcblx0fVxuXG5cdC8vIEZpbGUgb3IgUmVzb3VyY2UgRWRpdG9yXG5cdGNvbnN0IGxhbmd1YWdlU3VwcG9ydCA9IGlucHV0IGFzIElGaWxlRWRpdG9ySW5wdXQ7XG5cdGlmICh0eXBlb2YgbGFuZ3VhZ2VTdXBwb3J0LnNldExhbmd1YWdlSWQgPT09ICdmdW5jdGlvbicpIHtcblx0XHRyZXR1cm4gbGFuZ3VhZ2VTdXBwb3J0O1xuXHR9XG5cblx0Ly8gVW5zdXBwb3J0ZWQgZm9yIGFueSBvdGhlciBlZGl0b3Jcblx0cmV0dXJuIG51bGw7XG59XG5cbmludGVyZmFjZSBJRWRpdG9yU2VsZWN0aW9uU3RhdHVzIHtcblx0c2VsZWN0aW9ucz86IFNlbGVjdGlvbltdO1xuXHRjaGFyYWN0ZXJzU2VsZWN0ZWQ/OiBudW1iZXI7XG59XG5cbmNsYXNzIFN0YXRlQ2hhbmdlIHtcblx0aW5kZW50YXRpb246IGJvb2xlYW4gPSBmYWxzZTtcblx0c2VsZWN0aW9uU3RhdHVzOiBib29sZWFuID0gZmFsc2U7XG5cdGxhbmd1YWdlSWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0bGFuZ3VhZ2VTdGF0dXM6IGJvb2xlYW4gPSBmYWxzZTtcblx0ZW5jb2Rpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0RU9MOiBib29sZWFuID0gZmFsc2U7XG5cdHRhYkZvY3VzTW9kZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRpbnB1dE1vZGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0Y29sdW1uU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRtZXRhZGF0YTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbWJpbmUob3RoZXI6IFN0YXRlQ2hhbmdlKSB7XG5cdFx0dGhpcy5pbmRlbnRhdGlvbiA9IHRoaXMuaW5kZW50YXRpb24gfHwgb3RoZXIuaW5kZW50YXRpb247XG5cdFx0dGhpcy5zZWxlY3Rpb25TdGF0dXMgPSB0aGlzLnNlbGVjdGlvblN0YXR1cyB8fCBvdGhlci5zZWxlY3Rpb25TdGF0dXM7XG5cdFx0dGhpcy5sYW5ndWFnZUlkID0gdGhpcy5sYW5ndWFnZUlkIHx8IG90aGVyLmxhbmd1YWdlSWQ7XG5cdFx0dGhpcy5sYW5ndWFnZVN0YXR1cyA9IHRoaXMubGFuZ3VhZ2VTdGF0dXMgfHwgb3RoZXIubGFuZ3VhZ2VTdGF0dXM7XG5cdFx0dGhpcy5lbmNvZGluZyA9IHRoaXMuZW5jb2RpbmcgfHwgb3RoZXIuZW5jb2Rpbmc7XG5cdFx0dGhpcy5FT0wgPSB0aGlzLkVPTCB8fCBvdGhlci5FT0w7XG5cdFx0dGhpcy50YWJGb2N1c01vZGUgPSB0aGlzLnRhYkZvY3VzTW9kZSB8fCBvdGhlci50YWJGb2N1c01vZGU7XG5cdFx0dGhpcy5pbnB1dE1vZGUgPSB0aGlzLmlucHV0TW9kZSB8fCBvdGhlci5pbnB1dE1vZGU7XG5cdFx0dGhpcy5jb2x1bW5TZWxlY3Rpb25Nb2RlID0gdGhpcy5jb2x1bW5TZWxlY3Rpb25Nb2RlIHx8IG90aGVyLmNvbHVtblNlbGVjdGlvbk1vZGU7XG5cdFx0dGhpcy5tZXRhZGF0YSA9IHRoaXMubWV0YWRhdGEgfHwgb3RoZXIubWV0YWRhdGE7XG5cdH1cblxuXHRoYXNDaGFuZ2VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmluZGVudGF0aW9uXG5cdFx0XHR8fCB0aGlzLnNlbGVjdGlvblN0YXR1c1xuXHRcdFx0fHwgdGhpcy5sYW5ndWFnZUlkXG5cdFx0XHR8fCB0aGlzLmxhbmd1YWdlU3RhdHVzXG5cdFx0XHR8fCB0aGlzLmVuY29kaW5nXG5cdFx0XHR8fCB0aGlzLkVPTFxuXHRcdFx0fHwgdGhpcy50YWJGb2N1c01vZGVcblx0XHRcdHx8IHRoaXMuaW5wdXRNb2RlXG5cdFx0XHR8fCB0aGlzLmNvbHVtblNlbGVjdGlvbk1vZGVcblx0XHRcdHx8IHRoaXMubWV0YWRhdGE7XG5cdH1cbn1cblxudHlwZSBTdGF0ZURlbHRhID0gKFxuXHR7IHR5cGU6ICdzZWxlY3Rpb25TdGF0dXMnOyBzZWxlY3Rpb25TdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZCB9XG5cdHwgeyB0eXBlOiAnbGFuZ3VhZ2VJZCc7IGxhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9XG5cdHwgeyB0eXBlOiAnZW5jb2RpbmcnOyBlbmNvZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkIH1cblx0fCB7IHR5cGU6ICdFT0wnOyBFT0w6IHN0cmluZyB8IHVuZGVmaW5lZCB9XG5cdHwgeyB0eXBlOiAnaW5kZW50YXRpb24nOyBpbmRlbnRhdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkIH1cblx0fCB7IHR5cGU6ICd0YWJGb2N1c01vZGUnOyB0YWJGb2N1c01vZGU6IGJvb2xlYW4gfVxuXHR8IHsgdHlwZTogJ2NvbHVtblNlbGVjdGlvbk1vZGUnOyBjb2x1bW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuIH1cblx0fCB7IHR5cGU6ICdtZXRhZGF0YSc7IG1ldGFkYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQgfVxuXHR8IHsgdHlwZTogJ2lucHV0TW9kZSc7IGlucHV0TW9kZTogJ292ZXJ0eXBlJyB8ICdpbnNlcnQnIH1cbik7XG5cbmNsYXNzIFN0YXRlIHtcblxuXHRwcml2YXRlIF9zZWxlY3Rpb25TdGF0dXM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IHNlbGVjdGlvblN0YXR1cygpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc2VsZWN0aW9uU3RhdHVzOyB9XG5cblx0cHJpdmF0ZSBfbGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgbGFuZ3VhZ2VJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fbGFuZ3VhZ2VJZDsgfVxuXG5cdHByaXZhdGUgX2VuY29kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBlbmNvZGluZygpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZW5jb2Rpbmc7IH1cblxuXHRwcml2YXRlIF9FT0w6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IEVPTCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fRU9MOyB9XG5cblx0cHJpdmF0ZSBfaW5kZW50YXRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IGluZGVudGF0aW9uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9pbmRlbnRhdGlvbjsgfVxuXG5cdHByaXZhdGUgX3RhYkZvY3VzTW9kZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0Z2V0IHRhYkZvY3VzTW9kZSgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3RhYkZvY3VzTW9kZTsgfVxuXG5cdHByaXZhdGUgX2lucHV0TW9kZTogJ292ZXJ0eXBlJyB8ICdpbnNlcnQnIHwgdW5kZWZpbmVkO1xuXHRnZXQgaW5wdXRNb2RlKCk6ICdvdmVydHlwZScgfCAnaW5zZXJ0JyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9pbnB1dE1vZGU7IH1cblxuXHRwcml2YXRlIF9jb2x1bW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRnZXQgY29sdW1uU2VsZWN0aW9uTW9kZSgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NvbHVtblNlbGVjdGlvbk1vZGU7IH1cblxuXHRwcml2YXRlIF9tZXRhZGF0YTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgbWV0YWRhdGEoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX21ldGFkYXRhOyB9XG5cblx0dXBkYXRlKHVwZGF0ZTogU3RhdGVEZWx0YSk6IFN0YXRlQ2hhbmdlIHtcblx0XHRjb25zdCBjaGFuZ2UgPSBuZXcgU3RhdGVDaGFuZ2UoKTtcblxuXHRcdHN3aXRjaCAodXBkYXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgJ3NlbGVjdGlvblN0YXR1cyc6XG5cdFx0XHRcdGlmICh0aGlzLl9zZWxlY3Rpb25TdGF0dXMgIT09IHVwZGF0ZS5zZWxlY3Rpb25TdGF0dXMpIHtcblx0XHRcdFx0XHR0aGlzLl9zZWxlY3Rpb25TdGF0dXMgPSB1cGRhdGUuc2VsZWN0aW9uU3RhdHVzO1xuXHRcdFx0XHRcdGNoYW5nZS5zZWxlY3Rpb25TdGF0dXMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdpbmRlbnRhdGlvbic6XG5cdFx0XHRcdGlmICh0aGlzLl9pbmRlbnRhdGlvbiAhPT0gdXBkYXRlLmluZGVudGF0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5faW5kZW50YXRpb24gPSB1cGRhdGUuaW5kZW50YXRpb247XG5cdFx0XHRcdFx0Y2hhbmdlLmluZGVudGF0aW9uID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnbGFuZ3VhZ2VJZCc6XG5cdFx0XHRcdGlmICh0aGlzLl9sYW5ndWFnZUlkICE9PSB1cGRhdGUubGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRcdHRoaXMuX2xhbmd1YWdlSWQgPSB1cGRhdGUubGFuZ3VhZ2VJZDtcblx0XHRcdFx0XHRjaGFuZ2UubGFuZ3VhZ2VJZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ2VuY29kaW5nJzpcblx0XHRcdFx0aWYgKHRoaXMuX2VuY29kaW5nICE9PSB1cGRhdGUuZW5jb2RpbmcpIHtcblx0XHRcdFx0XHR0aGlzLl9lbmNvZGluZyA9IHVwZGF0ZS5lbmNvZGluZztcblx0XHRcdFx0XHRjaGFuZ2UuZW5jb2RpbmcgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdFT0wnOlxuXHRcdFx0XHRpZiAodGhpcy5fRU9MICE9PSB1cGRhdGUuRU9MKSB7XG5cdFx0XHRcdFx0dGhpcy5fRU9MID0gdXBkYXRlLkVPTDtcblx0XHRcdFx0XHRjaGFuZ2UuRU9MID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAndGFiRm9jdXNNb2RlJzpcblx0XHRcdFx0aWYgKHRoaXMuX3RhYkZvY3VzTW9kZSAhPT0gdXBkYXRlLnRhYkZvY3VzTW9kZSkge1xuXHRcdFx0XHRcdHRoaXMuX3RhYkZvY3VzTW9kZSA9IHVwZGF0ZS50YWJGb2N1c01vZGU7XG5cdFx0XHRcdFx0Y2hhbmdlLnRhYkZvY3VzTW9kZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ2lucHV0TW9kZSc6XG5cdFx0XHRcdGlmICh0aGlzLl9pbnB1dE1vZGUgIT09IHVwZGF0ZS5pbnB1dE1vZGUpIHtcblx0XHRcdFx0XHR0aGlzLl9pbnB1dE1vZGUgPSB1cGRhdGUuaW5wdXRNb2RlO1xuXHRcdFx0XHRcdGNoYW5nZS5pbnB1dE1vZGUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdjb2x1bW5TZWxlY3Rpb25Nb2RlJzpcblx0XHRcdFx0aWYgKHRoaXMuX2NvbHVtblNlbGVjdGlvbk1vZGUgIT09IHVwZGF0ZS5jb2x1bW5TZWxlY3Rpb25Nb2RlKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29sdW1uU2VsZWN0aW9uTW9kZSA9IHVwZGF0ZS5jb2x1bW5TZWxlY3Rpb25Nb2RlO1xuXHRcdFx0XHRcdGNoYW5nZS5jb2x1bW5TZWxlY3Rpb25Nb2RlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnbWV0YWRhdGEnOlxuXHRcdFx0XHRpZiAodGhpcy5fbWV0YWRhdGEgIT09IHVwZGF0ZS5tZXRhZGF0YSkge1xuXHRcdFx0XHRcdHRoaXMuX21ldGFkYXRhID0gdXBkYXRlLm1ldGFkYXRhO1xuXHRcdFx0XHRcdGNoYW5nZS5tZXRhZGF0YSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNoYW5nZTtcblx0fVxufVxuXG5jbGFzcyBUYWJGb2N1c01vZGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblxuXHRcdGNvbnN0IHRhYkZvY3VzTW9kZUNvbmZpZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3IudGFiRm9jdXNNb2RlJykgPT09IHRydWU7XG5cdFx0VGFiRm9jdXMuc2V0VGFiRm9jdXNNb2RlKHRhYkZvY3VzTW9kZUNvbmZpZyk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFRhYkZvY3VzLm9uRGlkQ2hhbmdlVGFiRm9jdXModGFiRm9jdXNNb2RlID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGFiRm9jdXNNb2RlKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLnRhYkZvY3VzTW9kZScpKSB7XG5cdFx0XHRcdGNvbnN0IHRhYkZvY3VzTW9kZUNvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci50YWJGb2N1c01vZGUnKSA9PT0gdHJ1ZTtcblx0XHRcdFx0VGFiRm9jdXMuc2V0VGFiRm9jdXNNb2RlKHRhYkZvY3VzTW9kZUNvbmZpZyk7XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh0YWJGb2N1c01vZGVDb25maWcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBTdGF0dXNJbnB1dE1vZGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPCdvdmVydHlwZScgfCAnaW5zZXJ0Jz4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0SW5wdXRNb2RlLnNldElucHV0TW9kZSgnaW5zZXJ0Jyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoSW5wdXRNb2RlLm9uRGlkQ2hhbmdlSW5wdXRNb2RlKGlucHV0TW9kZSA9PiB0aGlzLl9vbkRpZENoYW5nZS5maXJlKGlucHV0TW9kZSkpKTtcblx0fVxufVxuXG5jb25zdCBubHNTaW5nbGVTZWxlY3Rpb25SYW5nZSA9IGxvY2FsaXplKCdzaW5nbGVTZWxlY3Rpb25SYW5nZScsIFwiTG4gezB9LCBDb2wgezF9ICh7Mn0gc2VsZWN0ZWQpXCIpO1xuY29uc3QgbmxzU2luZ2xlU2VsZWN0aW9uID0gbG9jYWxpemUoJ3NpbmdsZVNlbGVjdGlvbicsIFwiTG4gezB9LCBDb2wgezF9XCIpO1xuY29uc3QgbmxzTXVsdGlTZWxlY3Rpb25SYW5nZSA9IGxvY2FsaXplKCdtdWx0aVNlbGVjdGlvblJhbmdlJywgXCJ7MH0gc2VsZWN0aW9ucyAoezF9IGNoYXJhY3RlcnMgc2VsZWN0ZWQpXCIpO1xuY29uc3QgbmxzTXVsdGlTZWxlY3Rpb24gPSBsb2NhbGl6ZSgnbXVsdGlTZWxlY3Rpb24nLCBcInswfSBzZWxlY3Rpb25zXCIpO1xuY29uc3QgbmxzRU9MTEYgPSBsb2NhbGl6ZSgnZW5kT2ZMaW5lTGluZUZlZWQnLCBcIkxGXCIpO1xuY29uc3QgbmxzRU9MQ1JMRiA9IGxvY2FsaXplKCdlbmRPZkxpbmVDYXJyaWFnZVJldHVybkxpbmVGZWVkJywgXCJDUkxGXCIpO1xuXG5jbGFzcyBFZGl0b3JTdGF0dXMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRhYkZvY3VzTW9kZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0TW9kZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbHVtblNlbGVjdGlvbk1vZGVFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBpbmRlbnRhdGlvbkVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlbGVjdGlvbkVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVuY29kaW5nRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZW9sRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBtZXRhZGF0YUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudE1hcmtlclN0YXR1czogU2hvd0N1cnJlbnRNYXJrZXJJblN0YXR1c2JhckNvbnRyaWJ1dGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSB0YWJGb2N1c01vZGU6IFRhYkZvY3VzTW9kZTtcblx0cHJpdmF0ZSByZWFkb25seSBpbnB1dE1vZGU6IFN0YXR1c0lucHV0TW9kZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN0YXRlID0gbmV3IFN0YXRlKCk7XG5cdHByaXZhdGUgdG9SZW5kZXI6IFN0YXRlQ2hhbmdlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlRWRpdG9yTGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBkZWxheWVkUmVuZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGFyZ2V0V2luZG93SWQ6IG51bWJlcixcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY3VycmVudE1hcmtlclN0YXR1cyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNob3dDdXJyZW50TWFya2VySW5TdGF0dXNiYXJDb250cmlidXRpb24pKTtcblx0XHR0aGlzLnRhYkZvY3VzTW9kZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhYkZvY3VzTW9kZSkpO1xuXHRcdHRoaXMuaW5wdXRNb2RlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RhdHVzSW5wdXRNb2RlKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyQ29tbWFuZHMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZVN0YXR1c0JhcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXh0RmlsZVNlcnZpY2UudW50aXRsZWQub25EaWRDaGFuZ2VFbmNvZGluZyhtb2RlbCA9PiB0aGlzLm9uUmVzb3VyY2VFbmNvZGluZ0NoYW5nZShtb2RlbC5yZXNvdXJjZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRleHRGaWxlU2VydmljZS5maWxlcy5vbkRpZENoYW5nZUVuY29kaW5nKG1vZGVsID0+IHRoaXMub25SZXNvdXJjZUVuY29kaW5nQ2hhbmdlKChtb2RlbC5yZXNvdXJjZSkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMudGFiRm9jdXNNb2RlLm9uRGlkQ2hhbmdlLCAodGFiRm9jdXNNb2RlKSA9PiB7XG5cdFx0XHRpZiAodGFiRm9jdXNNb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5vblRhYkZvY3VzTW9kZUNoYW5nZSh0YWJGb2N1c01vZGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5vblRhYkZvY3VzTW9kZUNoYW5nZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IudGFiRm9jdXNNb2RlJykpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5pbnB1dE1vZGUub25EaWRDaGFuZ2UsIChpbnB1dE1vZGUpID0+IHRoaXMub25JbnB1dE1vZGVDaGFuZ2UoaW5wdXRNb2RlID8/ICdpbnNlcnQnKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbW1hbmRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHsgaWQ6IGBjaGFuZ2VFZGl0b3JJbmRlbnRhdGlvbiR7dGhpcy50YXJnZXRXaW5kb3dJZH1gLCBoYW5kbGVyOiAoKSA9PiB0aGlzLnNob3dJbmRlbnRhdGlvblBpY2tlcigpIH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0luZGVudGF0aW9uUGlja2VyKCk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gZ2V0Q29kZUVkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpO1xuXHRcdGlmICghYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpIHtcblx0XHRcdHJldHVybiB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soW3sgbGFiZWw6IGxvY2FsaXplKCdub0VkaXRvcicsIFwiTm8gdGV4dCBlZGl0b3IgYWN0aXZlIGF0IHRoaXMgdGltZVwiKSB9XSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I/LmlzUmVhZG9ubHkoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhbeyBsYWJlbDogbG9jYWxpemUoJ25vV3JpdGFibGVDb2RlRWRpdG9yJywgXCJUaGUgYWN0aXZlIGNvZGUgZWRpdG9yIGlzIHJlYWQtb25seS5cIikgfV0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBpY2tzOiBRdWlja1BpY2tJbnB1dDxJUXVpY2tQaWNrSXRlbSAmIHsgcnVuKCk6IHZvaWQgfT5bXSA9IFtcblx0XHRcdGFzc2VydFJldHVybnNEZWZpbmVkKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldEFjdGlvbihJbmRlbnRVc2luZ1NwYWNlcy5JRCkpLFxuXHRcdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0QWN0aW9uKEluZGVudFVzaW5nVGFicy5JRCkpLFxuXHRcdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0QWN0aW9uKENoYW5nZVRhYkRpc3BsYXlTaXplLklEKSksXG5cdFx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZChhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRBY3Rpb24oRGV0ZWN0SW5kZW50YXRpb24uSUQpKSxcblx0XHRcdGFzc2VydFJldHVybnNEZWZpbmVkKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldEFjdGlvbihJbmRlbnRhdGlvblRvU3BhY2VzQWN0aW9uLklEKSksXG5cdFx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZChhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRBY3Rpb24oSW5kZW50YXRpb25Ub1RhYnNBY3Rpb24uSUQpKSxcblx0XHRcdGFzc2VydFJldHVybnNEZWZpbmVkKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldEFjdGlvbihUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQWN0aW9uLklEKSlcblx0XHRdLm1hcCgoYTogSUVkaXRvckFjdGlvbikgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IGEuaWQsXG5cdFx0XHRcdGxhYmVsOiBhLmxhYmVsLFxuXHRcdFx0XHRkZXRhaWw6IChMYW5ndWFnZS5pc0RlZmF1bHRWYXJpYW50KCkgfHwgYS5sYWJlbCA9PT0gYS5hbGlhcykgPyB1bmRlZmluZWQgOiBhLmFsaWFzLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5mb2N1cygpO1xuXHRcdFx0XHRcdGEucnVuKCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRwaWNrcy5zcGxpY2UoMywgMCwgeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdpbmRlbnRDb252ZXJ0JywgXCJjb252ZXJ0IGZpbGVcIikgfSk7XG5cdFx0cGlja3MudW5zaGlmdCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ2luZGVudFZpZXcnLCBcImNoYW5nZSB2aWV3XCIpIH0pO1xuXG5cdFx0Y29uc3QgYWN0aW9uID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7IHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgncGlja0FjdGlvbicsIFwiU2VsZWN0IEFjdGlvblwiKSwgbWF0Y2hPbkRldGFpbDogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gYWN0aW9uPy5ydW4oKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGFiRm9jdXNNb2RlRWxlbWVudCh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdGlmICghdGhpcy50YWJGb2N1c01vZGVFbGVtZW50LnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBsb2NhbGl6ZSgndGFiRm9jdXNNb2RlRW5hYmxlZCcsIFwiVGFiIE1vdmVzIEZvY3VzXCIpO1xuXHRcdFx0XHR0aGlzLnRhYkZvY3VzTW9kZUVsZW1lbnQudmFsdWUgPSB0aGlzLnN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoe1xuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdzdGF0dXMuZWRpdG9yLnRhYkZvY3VzTW9kZScsIFwiQWNjZXNzaWJpbGl0eSBNb2RlXCIpLFxuXHRcdFx0XHRcdHRleHQsXG5cdFx0XHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkaXNhYmxlVGFiTW9kZScsIFwiRGlzYWJsZSBBY2Nlc3NpYmlsaXR5IE1vZGVcIiksXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VkaXRvci5hY3Rpb24udG9nZ2xlVGFiRm9jdXNNb2RlJyxcblx0XHRcdFx0XHRraW5kOiAncHJvbWluZW50J1xuXHRcdFx0XHR9LCAnc3RhdHVzLmVkaXRvci50YWJGb2N1c01vZGUnLCBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsIDEwMC43KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50YWJGb2N1c01vZGVFbGVtZW50LmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbnB1dE1vZGVFbGVtZW50KGlucHV0TW9kZTogJ292ZXJ0eXBlJyB8ICdpbnNlcnQnIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGlucHV0TW9kZSA9PT0gJ292ZXJ0eXBlJykge1xuXHRcdFx0aWYgKCF0aGlzLmlucHV0TW9kZUVsZW1lbnQudmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGxvY2FsaXplKCdpbnB1dE1vZGVPdmVydHlwZScsICdPVlInKTtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IGxvY2FsaXplKCdzdGF0dXMuZWRpdG9yLmVuYWJsZUluc2VydE1vZGUnLCBcIkVuYWJsZSBJbnNlcnQgTW9kZVwiKTtcblx0XHRcdFx0dGhpcy5pbnB1dE1vZGVFbGVtZW50LnZhbHVlID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KHtcblx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdHRleHQsXG5cdFx0XHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0XHRcdHRvb2x0aXA6IG5hbWUsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VkaXRvci5hY3Rpb24udG9nZ2xlT3ZlcnR5cGVJbnNlcnRNb2RlJyxcblx0XHRcdFx0XHRraW5kOiAncHJvbWluZW50J1xuXHRcdFx0XHR9LCAnc3RhdHVzLmVkaXRvci5pbnB1dE1vZGUnLCBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsIDEwMC42KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbnB1dE1vZGVFbGVtZW50LmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb2x1bW5TZWxlY3Rpb25Nb2RlRWxlbWVudCh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdGlmICghdGhpcy5jb2x1bW5TZWxlY3Rpb25Nb2RlRWxlbWVudC52YWx1ZSkge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gbG9jYWxpemUoJ2NvbHVtblNlbGVjdGlvbk1vZGVFbmFibGVkJywgXCJDb2x1bW4gU2VsZWN0aW9uXCIpO1xuXHRcdFx0XHR0aGlzLmNvbHVtblNlbGVjdGlvbk1vZGVFbGVtZW50LnZhbHVlID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KHtcblx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnc3RhdHVzLmVkaXRvci5jb2x1bW5TZWxlY3Rpb25Nb2RlJywgXCJDb2x1bW4gU2VsZWN0aW9uIE1vZGVcIiksXG5cdFx0XHRcdFx0dGV4dCxcblx0XHRcdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2Rpc2FibGVDb2x1bW5TZWxlY3Rpb25Nb2RlJywgXCJEaXNhYmxlIENvbHVtbiBTZWxlY3Rpb24gTW9kZVwiKSxcblx0XHRcdFx0XHRjb21tYW5kOiAnZWRpdG9yLmFjdGlvbi50b2dnbGVDb2x1bW5TZWxlY3Rpb24nLFxuXHRcdFx0XHRcdGtpbmQ6ICdwcm9taW5lbnQnXG5cdFx0XHRcdH0sICdzdGF0dXMuZWRpdG9yLmNvbHVtblNlbGVjdGlvbk1vZGUnLCBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsIDEwMC44KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb2x1bW5TZWxlY3Rpb25Nb2RlRWxlbWVudC5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2VsZWN0aW9uRWxlbWVudCh0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdHRoaXMuc2VsZWN0aW9uRWxlbWVudC5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvclVSSSA9IGdldENvZGVFZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKT8uZ2V0TW9kZWwoKT8udXJpO1xuXHRcdGlmIChlZGl0b3JVUkk/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHtcblx0XHRcdHRoaXMuc2VsZWN0aW9uRWxlbWVudC5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3BzOiBJU3RhdHVzYmFyRW50cnkgPSB7XG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgnc3RhdHVzLmVkaXRvci5zZWxlY3Rpb24nLCBcIkVkaXRvciBTZWxlY3Rpb25cIiksXG5cdFx0XHR0ZXh0LFxuXHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2dvdG9MaW5lJywgXCJHbyB0byBMaW5lL0NvbHVtblwiKSxcblx0XHRcdGNvbW1hbmQ6ICd3b3JrYmVuY2guYWN0aW9uLmdvdG9MaW5lJ1xuXHRcdH07XG5cblx0XHR0aGlzLnVwZGF0ZUVsZW1lbnQodGhpcy5zZWxlY3Rpb25FbGVtZW50LCBwcm9wcywgJ3N0YXR1cy5lZGl0b3Iuc2VsZWN0aW9uJywgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCAxMDAuNSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUluZGVudGF0aW9uRWxlbWVudCh0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdHRoaXMuaW5kZW50YXRpb25FbGVtZW50LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yVVJJID0gZ2V0Q29kZUVkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpPy5nZXRNb2RlbCgpPy51cmk7XG5cdFx0aWYgKGVkaXRvclVSST8uc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCkge1xuXHRcdFx0dGhpcy5pbmRlbnRhdGlvbkVsZW1lbnQuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9wczogSVN0YXR1c2JhckVudHJ5ID0ge1xuXHRcdFx0bmFtZTogbG9jYWxpemUoJ3N0YXR1cy5lZGl0b3IuaW5kZW50YXRpb24nLCBcIkVkaXRvciBJbmRlbnRhdGlvblwiKSxcblx0XHRcdHRleHQsXG5cdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnc2VsZWN0SW5kZW50YXRpb24nLCBcIlNlbGVjdCBJbmRlbnRhdGlvblwiKSxcblx0XHRcdGNvbW1hbmQ6IGBjaGFuZ2VFZGl0b3JJbmRlbnRhdGlvbiR7dGhpcy50YXJnZXRXaW5kb3dJZH1gXG5cdFx0fTtcblxuXHRcdHRoaXMudXBkYXRlRWxlbWVudCh0aGlzLmluZGVudGF0aW9uRWxlbWVudCwgcHJvcHMsICdzdGF0dXMuZWRpdG9yLmluZGVudGF0aW9uJywgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCAxMDAuNCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVuY29kaW5nRWxlbWVudCh0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdHRoaXMuZW5jb2RpbmdFbGVtZW50LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvcHM6IElTdGF0dXNiYXJFbnRyeSA9IHtcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdzdGF0dXMuZWRpdG9yLmVuY29kaW5nJywgXCJFZGl0b3IgRW5jb2RpbmdcIiksXG5cdFx0XHR0ZXh0LFxuXHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3NlbGVjdEVuY29kaW5nJywgXCJTZWxlY3QgRW5jb2RpbmdcIiksXG5cdFx0XHRjb21tYW5kOiAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3IuY2hhbmdlRW5jb2RpbmcnXG5cdFx0fTtcblxuXHRcdHRoaXMudXBkYXRlRWxlbWVudCh0aGlzLmVuY29kaW5nRWxlbWVudCwgcHJvcHMsICdzdGF0dXMuZWRpdG9yLmVuY29kaW5nJywgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCAxMDAuMyk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVPTEVsZW1lbnQodGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHR0aGlzLmVvbEVsZW1lbnQuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9wczogSVN0YXR1c2JhckVudHJ5ID0ge1xuXHRcdFx0bmFtZTogbG9jYWxpemUoJ3N0YXR1cy5lZGl0b3IuZW9sJywgXCJFZGl0b3IgRW5kIG9mIExpbmVcIiksXG5cdFx0XHR0ZXh0LFxuXHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3NlbGVjdEVPTCcsIFwiU2VsZWN0IEVuZCBvZiBMaW5lIFNlcXVlbmNlXCIpLFxuXHRcdFx0Y29tbWFuZDogJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yLmNoYW5nZUVPTCdcblx0XHR9O1xuXG5cdFx0dGhpcy51cGRhdGVFbGVtZW50KHRoaXMuZW9sRWxlbWVudCwgcHJvcHMsICdzdGF0dXMuZWRpdG9yLmVvbCcsIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCwgMTAwLjIpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVMYW5ndWFnZUlkRWxlbWVudCh0ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdHRoaXMubGFuZ3VhZ2VFbGVtZW50LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvcHM6IElTdGF0dXNiYXJFbnRyeSA9IHtcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdzdGF0dXMuZWRpdG9yLm1vZGUnLCBcIkVkaXRvciBMYW5ndWFnZVwiKSxcblx0XHRcdHRleHQsXG5cdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnc2VsZWN0TGFuZ3VhZ2VNb2RlJywgXCJTZWxlY3QgTGFuZ3VhZ2UgTW9kZVwiKSxcblx0XHRcdGNvbW1hbmQ6ICd3b3JrYmVuY2guYWN0aW9uLmVkaXRvci5jaGFuZ2VMYW5ndWFnZU1vZGUnXG5cdFx0fTtcblxuXHRcdHRoaXMudXBkYXRlRWxlbWVudCh0aGlzLmxhbmd1YWdlRWxlbWVudCwgcHJvcHMsICdzdGF0dXMuZWRpdG9yLm1vZGUnLCBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsIDEwMC4xKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTWV0YWRhdGFFbGVtZW50KHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGV4dCkge1xuXHRcdFx0dGhpcy5tZXRhZGF0YUVsZW1lbnQuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9wczogSVN0YXR1c2JhckVudHJ5ID0ge1xuXHRcdFx0bmFtZTogbG9jYWxpemUoJ3N0YXR1cy5lZGl0b3IuaW5mbycsIFwiRmlsZSBJbmZvcm1hdGlvblwiKSxcblx0XHRcdHRleHQsXG5cdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZmlsZUluZm8nLCBcIkZpbGUgSW5mb3JtYXRpb25cIilcblx0XHR9O1xuXG5cdFx0dGhpcy51cGRhdGVFbGVtZW50KHRoaXMubWV0YWRhdGFFbGVtZW50LCBwcm9wcywgJ3N0YXR1cy5lZGl0b3IuaW5mbycsIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCwgMTAwKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRWxlbWVudChlbGVtZW50OiBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4sIHByb3BzOiBJU3RhdHVzYmFyRW50cnksIGlkOiBzdHJpbmcsIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LCBwcmlvcml0eTogbnVtYmVyKSB7XG5cdFx0aWYgKCFlbGVtZW50LnZhbHVlKSB7XG5cdFx0XHRlbGVtZW50LnZhbHVlID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KHByb3BzLCBpZCwgYWxpZ25tZW50LCBwcmlvcml0eSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVsZW1lbnQudmFsdWUudXBkYXRlKHByb3BzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXRlKHVwZGF0ZTogU3RhdGVEZWx0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZWQgPSB0aGlzLnN0YXRlLnVwZGF0ZSh1cGRhdGUpO1xuXHRcdGlmICghY2hhbmdlZC5oYXNDaGFuZ2VzKCkpIHtcblx0XHRcdHJldHVybjsgLy8gTm90aGluZyByZWFsbHkgY2hhbmdlZFxuXHRcdH1cblxuXHRcdGlmICghdGhpcy50b1JlbmRlcikge1xuXHRcdFx0dGhpcy50b1JlbmRlciA9IGNoYW5nZWQ7XG5cblx0XHRcdHRoaXMuZGVsYXllZFJlbmRlci52YWx1ZSA9IHJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3dCeUlkKHRoaXMudGFyZ2V0V2luZG93SWQsIHRydWUpLndpbmRvdywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRlbGF5ZWRSZW5kZXIuY2xlYXIoKTtcblxuXHRcdFx0XHRjb25zdCB0b1JlbmRlciA9IHRoaXMudG9SZW5kZXI7XG5cdFx0XHRcdHRoaXMudG9SZW5kZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0b1JlbmRlcikge1xuXHRcdFx0XHRcdHRoaXMuZG9SZW5kZXJOb3coKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudG9SZW5kZXIuY29tYmluZShjaGFuZ2VkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvUmVuZGVyTm93KCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlVGFiRm9jdXNNb2RlRWxlbWVudCghIXRoaXMuc3RhdGUudGFiRm9jdXNNb2RlKTtcblx0XHR0aGlzLnVwZGF0ZUlucHV0TW9kZUVsZW1lbnQodGhpcy5zdGF0ZS5pbnB1dE1vZGUpO1xuXHRcdHRoaXMudXBkYXRlQ29sdW1uU2VsZWN0aW9uTW9kZUVsZW1lbnQoISF0aGlzLnN0YXRlLmNvbHVtblNlbGVjdGlvbk1vZGUpO1xuXHRcdHRoaXMudXBkYXRlSW5kZW50YXRpb25FbGVtZW50KHRoaXMuc3RhdGUuaW5kZW50YXRpb24pO1xuXHRcdHRoaXMudXBkYXRlU2VsZWN0aW9uRWxlbWVudCh0aGlzLnN0YXRlLnNlbGVjdGlvblN0YXR1cyk7XG5cdFx0dGhpcy51cGRhdGVFbmNvZGluZ0VsZW1lbnQodGhpcy5zdGF0ZS5lbmNvZGluZyk7XG5cdFx0dGhpcy51cGRhdGVFT0xFbGVtZW50KHRoaXMuc3RhdGUuRU9MID8gdGhpcy5zdGF0ZS5FT0wgPT09ICdcXHJcXG4nID8gbmxzRU9MQ1JMRiA6IG5sc0VPTExGIDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLnVwZGF0ZUxhbmd1YWdlSWRFbGVtZW50KHRoaXMuc3RhdGUubGFuZ3VhZ2VJZCk7XG5cdFx0dGhpcy51cGRhdGVNZXRhZGF0YUVsZW1lbnQodGhpcy5zdGF0ZS5tZXRhZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlbGVjdGlvbkxhYmVsKGluZm86IElFZGl0b3JTZWxlY3Rpb25TdGF0dXMpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghaW5mbz8uc2VsZWN0aW9ucykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoaW5mby5zZWxlY3Rpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0aWYgKGluZm8uY2hhcmFjdGVyc1NlbGVjdGVkKSB7XG5cdFx0XHRcdHJldHVybiBmb3JtYXQobmxzU2luZ2xlU2VsZWN0aW9uUmFuZ2UsIGluZm8uc2VsZWN0aW9uc1swXS5wb3NpdGlvbkxpbmVOdW1iZXIsIGluZm8uc2VsZWN0aW9uc1swXS5wb3NpdGlvbkNvbHVtbiwgaW5mby5jaGFyYWN0ZXJzU2VsZWN0ZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZm9ybWF0KG5sc1NpbmdsZVNlbGVjdGlvbiwgaW5mby5zZWxlY3Rpb25zWzBdLnBvc2l0aW9uTGluZU51bWJlciwgaW5mby5zZWxlY3Rpb25zWzBdLnBvc2l0aW9uQ29sdW1uKTtcblx0XHR9XG5cblx0XHRpZiAoaW5mby5jaGFyYWN0ZXJzU2VsZWN0ZWQpIHtcblx0XHRcdHJldHVybiBmb3JtYXQobmxzTXVsdGlTZWxlY3Rpb25SYW5nZSwgaW5mby5zZWxlY3Rpb25zLmxlbmd0aCwgaW5mby5jaGFyYWN0ZXJzU2VsZWN0ZWQpO1xuXHRcdH1cblxuXHRcdGlmIChpbmZvLnNlbGVjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIGZvcm1hdChubHNNdWx0aVNlbGVjdGlvbiwgaW5mby5zZWxlY3Rpb25zLmxlbmd0aCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3RhdHVzQmFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUlucHV0ID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0Y29uc3QgYWN0aXZlQ29kZUVkaXRvciA9IGFjdGl2ZUVkaXRvclBhbmUgPyBnZXRDb2RlRWRpdG9yKGFjdGl2ZUVkaXRvclBhbmUuZ2V0Q29udHJvbCgpKSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cblx0XHQvLyBVcGRhdGUgYWxsIHN0YXRlc1xuXHRcdHRoaXMub25Db2x1bW5TZWxlY3Rpb25Nb2RlQ2hhbmdlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdHRoaXMub25TZWxlY3Rpb25DaGFuZ2UoYWN0aXZlQ29kZUVkaXRvcik7XG5cdFx0dGhpcy5vbkxhbmd1YWdlQ2hhbmdlKGFjdGl2ZUNvZGVFZGl0b3IsIGFjdGl2ZUlucHV0KTtcblx0XHR0aGlzLm9uRU9MQ2hhbmdlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdHRoaXMub25FbmNvZGluZ0NoYW5nZShhY3RpdmVFZGl0b3JQYW5lLCBhY3RpdmVDb2RlRWRpdG9yKTtcblx0XHR0aGlzLm9uSW5kZW50YXRpb25DaGFuZ2UoYWN0aXZlQ29kZUVkaXRvcik7XG5cdFx0dGhpcy5vbk1ldGFkYXRhQ2hhbmdlKGFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdHRoaXMuY3VycmVudE1hcmtlclN0YXR1cy51cGRhdGUoYWN0aXZlQ29kZUVkaXRvcik7XG5cblx0XHQvLyBEaXNwb3NlIG9sZCBhY3RpdmUgZWRpdG9yIGxpc3RlbmVyc1xuXHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmNsZWFyKCk7XG5cblx0XHQvLyBBdHRhY2ggbmV3IGxpc3RlbmVycyB0byBhY3RpdmUgZWRpdG9yXG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUpIHtcblx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZChhY3RpdmVFZGl0b3JQYW5lLm9uRGlkQ2hhbmdlQ29udHJvbCgoKSA9PiB7XG5cdFx0XHRcdC8vIFNpbmNlIG91ciBlZGl0b3Igc3RhdHVzIGlzIG1haW5seSBvYnNlcnZpbmcgdGhlXG5cdFx0XHRcdC8vIGFjdGl2ZSBlZGl0b3IgY29udHJvbCwgZG8gYSBmdWxsIHVwZGF0ZSB3aGVuZXZlclxuXHRcdFx0XHQvLyB0aGUgY29udHJvbCBjaGFuZ2VzLlxuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1c0JhcigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIEF0dGFjaCBuZXcgbGlzdGVuZXJzIHRvIGFjdGl2ZSBjb2RlIGVkaXRvclxuXHRcdGlmIChhY3RpdmVDb2RlRWRpdG9yKSB7XG5cblx0XHRcdC8vIEhvb2sgTGlzdGVuZXIgZm9yIENvbmZpZ3VyYXRpb24gY2hhbmdlc1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuYWRkKGFjdGl2ZUNvZGVFZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChldmVudDogQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZXZlbnQuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uY29sdW1uU2VsZWN0aW9uKSkge1xuXHRcdFx0XHRcdHRoaXMub25Db2x1bW5TZWxlY3Rpb25Nb2RlQ2hhbmdlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEhvb2sgTGlzdGVuZXIgZm9yIFNlbGVjdGlvbiBjaGFuZ2VzXG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5hZGQoRXZlbnQuZGVmZXIoYWN0aXZlQ29kZUVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMub25TZWxlY3Rpb25DaGFuZ2UoYWN0aXZlQ29kZUVkaXRvcik7XG5cdFx0XHRcdHRoaXMuY3VycmVudE1hcmtlclN0YXR1cy51cGRhdGUoYWN0aXZlQ29kZUVkaXRvcik7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEhvb2sgTGlzdGVuZXIgZm9yIGxhbmd1YWdlIGNoYW5nZXNcblx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZChhY3RpdmVDb2RlRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMub25MYW5ndWFnZUNoYW5nZShhY3RpdmVDb2RlRWRpdG9yLCBhY3RpdmVJbnB1dCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEhvb2sgTGlzdGVuZXIgZm9yIGNvbnRlbnQgY2hhbmdlc1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuYWRkKEV2ZW50LmFjY3VtdWxhdGUoYWN0aXZlQ29kZUVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCkoZSA9PiB7XG5cdFx0XHRcdHRoaXMub25FT0xDaGFuZ2UoYWN0aXZlQ29kZUVkaXRvcik7XG5cdFx0XHRcdHRoaXMuY3VycmVudE1hcmtlclN0YXR1cy51cGRhdGUoYWN0aXZlQ29kZUVkaXRvcik7XG5cblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGFjdGl2ZUNvZGVFZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0XHRpZiAoc2VsZWN0aW9ucykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgaW5uZXIgb2YgZSkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgaW5uZXIuY2hhbmdlcykge1xuXHRcdFx0XHRcdFx0XHRpZiAoc2VsZWN0aW9ucy5zb21lKHNlbGVjdGlvbiA9PiBSYW5nZS5hcmVJbnRlcnNlY3Rpbmcoc2VsZWN0aW9uLCBjaGFuZ2UucmFuZ2UpKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMub25TZWxlY3Rpb25DaGFuZ2UoYWN0aXZlQ29kZUVkaXRvcik7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gSG9vayBMaXN0ZW5lciBmb3IgY29udGVudCBvcHRpb25zIGNoYW5nZXNcblx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZChhY3RpdmVDb2RlRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxPcHRpb25zKCgpID0+IHtcblx0XHRcdFx0dGhpcy5vbkluZGVudGF0aW9uQ2hhbmdlKGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBiaW5hcnkgZWRpdG9yc1xuXHRcdGVsc2UgaWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBCYXNlQmluYXJ5UmVzb3VyY2VFZGl0b3IgfHwgYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIEJpbmFyeVJlc291cmNlRGlmZkVkaXRvcikge1xuXHRcdFx0Y29uc3QgYmluYXJ5RWRpdG9yczogQmFzZUJpbmFyeVJlc291cmNlRWRpdG9yW10gPSBbXTtcblx0XHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgQmluYXJ5UmVzb3VyY2VEaWZmRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnkgPSBhY3RpdmVFZGl0b3JQYW5lLmdldFByaW1hcnlFZGl0b3JQYW5lKCk7XG5cdFx0XHRcdGlmIChwcmltYXJ5IGluc3RhbmNlb2YgQmFzZUJpbmFyeVJlc291cmNlRWRpdG9yKSB7XG5cdFx0XHRcdFx0YmluYXJ5RWRpdG9ycy5wdXNoKHByaW1hcnkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2Vjb25kYXJ5ID0gYWN0aXZlRWRpdG9yUGFuZS5nZXRTZWNvbmRhcnlFZGl0b3JQYW5lKCk7XG5cdFx0XHRcdGlmIChzZWNvbmRhcnkgaW5zdGFuY2VvZiBCYXNlQmluYXJ5UmVzb3VyY2VFZGl0b3IpIHtcblx0XHRcdFx0XHRiaW5hcnlFZGl0b3JzLnB1c2goc2Vjb25kYXJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YmluYXJ5RWRpdG9ycy5wdXNoKGFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBiaW5hcnlFZGl0b3JzKSB7XG5cdFx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNZXRhZGF0YSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5vbk1ldGFkYXRhQ2hhbmdlKGFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuYWRkKGVkaXRvci5vbkRpZE9wZW5JblBsYWNlKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1c0JhcigpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkxhbmd1YWdlQ2hhbmdlKGVkaXRvcldpZGdldDogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQsIGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGluZm86IFN0YXRlRGVsdGEgPSB7IHR5cGU6ICdsYW5ndWFnZUlkJywgbGFuZ3VhZ2VJZDogdW5kZWZpbmVkIH07XG5cblx0XHQvLyBXZSBvbmx5IHN1cHBvcnQgdGV4dCBiYXNlZCBlZGl0b3JzXG5cdFx0aWYgKGVkaXRvcldpZGdldCAmJiBlZGl0b3JJbnB1dCAmJiB0b0VkaXRvcldpdGhMYW5ndWFnZVN1cHBvcnQoZWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICh0ZXh0TW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0XHRcdGluZm8ubGFuZ3VhZ2VJZCA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShsYW5ndWFnZUlkKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTdGF0ZShpbmZvKTtcblx0fVxuXG5cdHByaXZhdGUgb25JbmRlbnRhdGlvbkNoYW5nZShlZGl0b3JXaWRnZXQ6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgdXBkYXRlOiBTdGF0ZURlbHRhID0geyB0eXBlOiAnaW5kZW50YXRpb24nLCBpbmRlbnRhdGlvbjogdW5kZWZpbmVkIH07XG5cblx0XHRpZiAoZWRpdG9yV2lkZ2V0KSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvcldpZGdldC5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsT3B0cyA9IG1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRcdFx0dXBkYXRlLmluZGVudGF0aW9uID0gKFxuXHRcdFx0XHRcdG1vZGVsT3B0cy5pbnNlcnRTcGFjZXNcblx0XHRcdFx0XHRcdD8gbW9kZWxPcHRzLnRhYlNpemUgPT09IG1vZGVsT3B0cy5pbmRlbnRTaXplXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3NwYWNlc1NpemUnLCBcIlNwYWNlczogezB9XCIsIG1vZGVsT3B0cy5pbmRlbnRTaXplKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdzcGFjZXNBbmRUYWJzU2l6ZScsIFwiU3BhY2VzOiB7MH0gKFRhYiBTaXplOiB7MX0pXCIsIG1vZGVsT3B0cy5pbmRlbnRTaXplLCBtb2RlbE9wdHMudGFiU2l6ZSlcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoeyBrZXk6ICd0YWJTaXplJywgY29tbWVudDogWydUYWIgY29ycmVzcG9uZHMgdG8gdGhlIHRhYiBrZXknXSB9LCBcIlRhYiBTaXplOiB7MH1cIiwgbW9kZWxPcHRzLnRhYlNpemUpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTdGF0ZSh1cGRhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbk1ldGFkYXRhQ2hhbmdlKGVkaXRvcjogSUVkaXRvclBhbmUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB1cGRhdGU6IFN0YXRlRGVsdGEgPSB7IHR5cGU6ICdtZXRhZGF0YScsIG1ldGFkYXRhOiB1bmRlZmluZWQgfTtcblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBCYXNlQmluYXJ5UmVzb3VyY2VFZGl0b3IgfHwgZWRpdG9yIGluc3RhbmNlb2YgQmluYXJ5UmVzb3VyY2VEaWZmRWRpdG9yKSB7XG5cdFx0XHR1cGRhdGUubWV0YWRhdGEgPSBlZGl0b3IuZ2V0TWV0YWRhdGEoKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVN0YXRlKHVwZGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29sdW1uU2VsZWN0aW9uTW9kZUNoYW5nZShlZGl0b3JXaWRnZXQ6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5mbzogU3RhdGVEZWx0YSA9IHsgdHlwZTogJ2NvbHVtblNlbGVjdGlvbk1vZGUnLCBjb2x1bW5TZWxlY3Rpb25Nb2RlOiBmYWxzZSB9O1xuXG5cdFx0aWYgKGVkaXRvcldpZGdldD8uZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5jb2x1bW5TZWxlY3Rpb24pKSB7XG5cdFx0XHRpbmZvLmNvbHVtblNlbGVjdGlvbk1vZGUgPSB0cnVlO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU3RhdGUoaW5mbyk7XG5cdH1cblxuXHRwcml2YXRlIG9uU2VsZWN0aW9uQ2hhbmdlKGVkaXRvcldpZGdldDogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBpbmZvOiBJRWRpdG9yU2VsZWN0aW9uU3RhdHVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRcdC8vIFdlIG9ubHkgc3VwcG9ydCB0ZXh0IGJhc2VkIGVkaXRvcnNcblx0XHRpZiAoZWRpdG9yV2lkZ2V0KSB7XG5cblx0XHRcdC8vIENvbXB1dGUgc2VsZWN0aW9uKHMpXG5cdFx0XHRpbmZvLnNlbGVjdGlvbnMgPSBlZGl0b3JXaWRnZXQuZ2V0U2VsZWN0aW9ucygpIHx8IFtdO1xuXG5cdFx0XHQvLyBDb21wdXRlIHNlbGVjdGlvbiBsZW5ndGhcblx0XHRcdGluZm8uY2hhcmFjdGVyc1NlbGVjdGVkID0gMDtcblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvcldpZGdldC5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKHRleHRNb2RlbCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBpbmZvLnNlbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGluZm8uY2hhcmFjdGVyc1NlbGVjdGVkICE9PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0aW5mby5jaGFyYWN0ZXJzU2VsZWN0ZWQgPSAwO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGluZm8uY2hhcmFjdGVyc1NlbGVjdGVkICs9IHRleHRNb2RlbC5nZXRDaGFyYWN0ZXJDb3VudEluUmFuZ2Uoc2VsZWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb21wdXRlIHRoZSB2aXNpYmxlIGNvbHVtbiBmb3Igb25lIHNlbGVjdGlvbi4gVGhpcyB3aWxsIHByb3Blcmx5IGhhbmRsZSB0YWJzIGFuZCB0aGVpciBjb25maWd1cmVkIHdpZHRoc1xuXHRcdFx0aWYgKGluZm8uc2VsZWN0aW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yUG9zaXRpb24gPSBlZGl0b3JXaWRnZXQuZ2V0UG9zaXRpb24oKTtcblxuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb25DbG9uZSA9IG5ldyBTZWxlY3Rpb24oXG5cdFx0XHRcdFx0aW5mby5zZWxlY3Rpb25zWzBdLnNlbGVjdGlvblN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRpbmZvLnNlbGVjdGlvbnNbMF0uc2VsZWN0aW9uU3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0aW5mby5zZWxlY3Rpb25zWzBdLnBvc2l0aW9uTGluZU51bWJlcixcblx0XHRcdFx0XHRlZGl0b3JQb3NpdGlvbiA/IGVkaXRvcldpZGdldC5nZXRTdGF0dXNiYXJDb2x1bW4oZWRpdG9yUG9zaXRpb24pIDogaW5mby5zZWxlY3Rpb25zWzBdLnBvc2l0aW9uQ29sdW1uXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0aW5mby5zZWxlY3Rpb25zWzBdID0gc2VsZWN0aW9uQ2xvbmU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTdGF0ZSh7IHR5cGU6ICdzZWxlY3Rpb25TdGF0dXMnLCBzZWxlY3Rpb25TdGF0dXM6IHRoaXMuZ2V0U2VsZWN0aW9uTGFiZWwoaW5mbykgfSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRU9MQ2hhbmdlKGVkaXRvcldpZGdldDogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBpbmZvOiBTdGF0ZURlbHRhID0geyB0eXBlOiAnRU9MJywgRU9MOiB1bmRlZmluZWQgfTtcblxuXHRcdGlmIChlZGl0b3JXaWRnZXQgJiYgIWVkaXRvcldpZGdldC5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnJlYWRPbmx5KSkge1xuXHRcdFx0Y29uc3QgY29kZUVkaXRvck1vZGVsID0gZWRpdG9yV2lkZ2V0LmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoY29kZUVkaXRvck1vZGVsKSB7XG5cdFx0XHRcdGluZm8uRU9MID0gY29kZUVkaXRvck1vZGVsLmdldEVPTCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU3RhdGUoaW5mbyk7XG5cdH1cblxuXHRwcml2YXRlIG9uRW5jb2RpbmdDaGFuZ2UoZWRpdG9yOiBJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCwgZWRpdG9yV2lkZ2V0OiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChlZGl0b3IgJiYgIXRoaXMuaXNBY3RpdmVFZGl0b3IoZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZm86IFN0YXRlRGVsdGEgPSB7IHR5cGU6ICdlbmNvZGluZycsIGVuY29kaW5nOiB1bmRlZmluZWQgfTtcblxuXHRcdC8vIFdlIG9ubHkgc3VwcG9ydCB0ZXh0IGJhc2VkIGVkaXRvcnMgdGhhdCBoYXZlIGEgbW9kZWwgYXNzb2NpYXRlZFxuXHRcdC8vIFRoaXMgZW5zdXJlcyB3ZSBkbyBub3Qgc2hvdyB0aGUgZW5jb2RpbmcgcGlja2VyIHdoaWxlIGFuIGVkaXRvclxuXHRcdC8vIGlzIHN0aWxsIGxvYWRpbmcuXG5cdFx0aWYgKGVkaXRvciAmJiBlZGl0b3JXaWRnZXQ/Lmhhc01vZGVsKCkpIHtcblx0XHRcdGNvbnN0IGVuY29kaW5nU3VwcG9ydDogSUVuY29kaW5nU3VwcG9ydCB8IG51bGwgPSBlZGl0b3IuaW5wdXQgPyB0b0VkaXRvcldpdGhFbmNvZGluZ1N1cHBvcnQoZWRpdG9yLmlucHV0KSA6IG51bGw7XG5cdFx0XHRpZiAoZW5jb2RpbmdTdXBwb3J0KSB7XG5cdFx0XHRcdGNvbnN0IHJhd0VuY29kaW5nID0gZW5jb2RpbmdTdXBwb3J0LmdldEVuY29kaW5nKCk7XG5cdFx0XHRcdGNvbnN0IGVuY29kaW5nSW5mbyA9IHR5cGVvZiByYXdFbmNvZGluZyA9PT0gJ3N0cmluZycgPyBTVVBQT1JURURfRU5DT0RJTkdTW3Jhd0VuY29kaW5nXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGVuY29kaW5nSW5mbykge1xuXHRcdFx0XHRcdGluZm8uZW5jb2RpbmcgPSBlbmNvZGluZ0luZm8ubGFiZWxTaG9ydDsgLy8gaWYgd2UgaGF2ZSBhIGxhYmVsLCB0YWtlIGl0IGZyb20gdGhlcmVcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbmZvLmVuY29kaW5nID0gcmF3RW5jb2Rpbmc7IC8vIG90aGVyd2lzZSB1c2UgaXQgcmF3XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVN0YXRlKGluZm8pO1xuXHR9XG5cblx0cHJpdmF0ZSBvblJlc291cmNlRW5jb2RpbmdDaGFuZ2UocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSkge1xuXHRcdFx0Y29uc3QgYWN0aXZlUmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShhY3RpdmVFZGl0b3JQYW5lLmlucHV0LCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0XHRpZiAoYWN0aXZlUmVzb3VyY2UgJiYgaXNFcXVhbChhY3RpdmVSZXNvdXJjZSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUNvZGVFZGl0b3IgPSBnZXRDb2RlRWRpdG9yKGFjdGl2ZUVkaXRvclBhbmUuZ2V0Q29udHJvbCgpKSA/PyB1bmRlZmluZWQ7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMub25FbmNvZGluZ0NoYW5nZShhY3RpdmVFZGl0b3JQYW5lLCBhY3RpdmVDb2RlRWRpdG9yKTsgLy8gb25seSB1cGRhdGUgaWYgdGhlIGVuY29kaW5nIGNoYW5nZWQgZm9yIHRoZSBhY3RpdmUgcmVzb3VyY2Vcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVGFiRm9jdXNNb2RlQ2hhbmdlKHRhYkZvY3VzTW9kZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGluZm86IFN0YXRlRGVsdGEgPSB7IHR5cGU6ICd0YWJGb2N1c01vZGUnLCB0YWJGb2N1c01vZGUgfTtcblx0XHR0aGlzLnVwZGF0ZVN0YXRlKGluZm8pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbklucHV0TW9kZUNoYW5nZShpbnB1dE1vZGU6ICdpbnNlcnQnIHwgJ292ZXJ0eXBlJyk6IHZvaWQge1xuXHRcdGNvbnN0IGluZm86IFN0YXRlRGVsdGEgPSB7IHR5cGU6ICdpbnB1dE1vZGUnLCBpbnB1dE1vZGUgfTtcblx0XHR0aGlzLnVwZGF0ZVN0YXRlKGluZm8pO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0FjdGl2ZUVkaXRvcihjb250cm9sOiBJRWRpdG9yUGFuZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblxuXHRcdHJldHVybiAhIWFjdGl2ZUVkaXRvclBhbmUgJiYgYWN0aXZlRWRpdG9yUGFuZSA9PT0gY29udHJvbDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yU3RhdHVzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5lZGl0b3JTdGF0dXMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgZWRpdG9yR3JvdXBTZXJ2aWNlLnBhcnRzKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZUVkaXRvclN0YXR1cyhwYXJ0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3JHcm91cFNlcnZpY2Uub25EaWRDcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0KHBhcnQgPT4gdGhpcy5jcmVhdGVFZGl0b3JTdGF0dXMocGFydCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRWRpdG9yU3RhdHVzKHBhcnQ6IElFZGl0b3JQYXJ0KTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0RXZlbnQub25jZShwYXJ0Lm9uV2lsbERpc3Bvc2UpKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdldFNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKHBhcnQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JTdGF0dXMsIHBhcnQud2luZG93SWQpKTtcblx0fVxufVxuXG5jbGFzcyBTaG93Q3VycmVudE1hcmtlckluU3RhdHVzYmFyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdGF0dXNCYXJFbnRyeUFjY2Vzc29yOiBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj47XG5cdHByaXZhdGUgZWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtYXJrZXJzOiBJTWFya2VyW10gPSBbXTtcblx0cHJpdmF0ZSBjdXJyZW50TWFya2VyOiBJTWFya2VyIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnN0YXR1c0JhckVudHJ5QWNjZXNzb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobWFya2VyU2VydmljZS5vbk1hcmtlckNoYW5nZWQoY2hhbmdlZFJlc291cmNlcyA9PiB0aGlzLm9uTWFya2VyQ2hhbmdlZChjaGFuZ2VkUmVzb3VyY2VzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbigncHJvYmxlbXMuc2hvd0N1cnJlbnRJblN0YXR1cycpKSgoKSA9PiB0aGlzLnVwZGF0ZVN0YXR1cygpKSk7XG5cdH1cblxuXHR1cGRhdGUoZWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG5cdFx0dGhpcy51cGRhdGVNYXJrZXJzKCk7XG5cdFx0dGhpcy51cGRhdGVTdGF0dXMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3RhdHVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzTWFya2VyID0gdGhpcy5jdXJyZW50TWFya2VyO1xuXHRcdHRoaXMuY3VycmVudE1hcmtlciA9IHRoaXMuZ2V0TWFya2VyKCk7XG5cdFx0aWYgKHRoaXMuaGFzVG9VcGRhdGVTdGF0dXMocHJldmlvdXNNYXJrZXIsIHRoaXMuY3VycmVudE1hcmtlcikpIHtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRNYXJrZXIpIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IHNwbGl0TGluZXModGhpcy5jdXJyZW50TWFya2VyLm1lc3NhZ2UpWzBdO1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYCR7dGhpcy5nZXRUeXBlKHRoaXMuY3VycmVudE1hcmtlcil9ICR7bGluZX1gO1xuXHRcdFx0XHRpZiAoIXRoaXMuc3RhdHVzQmFyRW50cnlBY2Nlc3Nvci52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuc3RhdHVzQmFyRW50cnlBY2Nlc3Nvci52YWx1ZSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeSh7IG5hbWU6IGxvY2FsaXplKCdjdXJyZW50UHJvYmxlbScsIFwiQ3VycmVudCBQcm9ibGVtXCIpLCB0ZXh0LCBhcmlhTGFiZWw6IHRleHQgfSwgJ3N0YXR1c2Jhci5jdXJyZW50UHJvYmxlbScsIFN0YXR1c2JhckFsaWdubWVudC5MRUZUKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnN0YXR1c0JhckVudHJ5QWNjZXNzb3IudmFsdWUudXBkYXRlKHsgbmFtZTogbG9jYWxpemUoJ2N1cnJlbnRQcm9ibGVtJywgXCJDdXJyZW50IFByb2JsZW1cIiksIHRleHQsIGFyaWFMYWJlbDogdGV4dCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdGF0dXNCYXJFbnRyeUFjY2Vzc29yLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYXNUb1VwZGF0ZVN0YXR1cyhwcmV2aW91c01hcmtlcjogSU1hcmtlciB8IG51bGwsIGN1cnJlbnRNYXJrZXI6IElNYXJrZXIgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjdXJyZW50TWFya2VyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIXByZXZpb3VzTWFya2VyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gSU1hcmtlckRhdGEubWFrZUtleShwcmV2aW91c01hcmtlcikgIT09IElNYXJrZXJEYXRhLm1ha2VLZXkoY3VycmVudE1hcmtlcik7XG5cdH1cblxuXHRwcml2YXRlIGdldFR5cGUobWFya2VyOiBJTWFya2VyKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKG1hcmtlci5zZXZlcml0eSkge1xuXHRcdFx0Y2FzZSBNYXJrZXJTZXZlcml0eS5FcnJvcjogcmV0dXJuICckKGVycm9yKSc7XG5cdFx0XHRjYXNlIE1hcmtlclNldmVyaXR5Lldhcm5pbmc6IHJldHVybiAnJCh3YXJuaW5nKSc7XG5cdFx0XHRjYXNlIE1hcmtlclNldmVyaXR5LkluZm86IHJldHVybiAnJChpbmZvKSc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYXJrZXIoKTogSU1hcmtlciB8IG51bGwge1xuXHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPigncHJvYmxlbXMuc2hvd0N1cnJlbnRJblN0YXR1cycpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm1hcmtlcnMuZmluZChtYXJrZXIgPT4gUmFuZ2UuY29udGFpbnNQb3NpdGlvbihtYXJrZXIsIHBvc2l0aW9uKSkgfHwgbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgb25NYXJrZXJDaGFuZ2VkKGNoYW5nZWRSZXNvdXJjZXM6IHJlYWRvbmx5IFVSSVtdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsICYmICFjaGFuZ2VkUmVzb3VyY2VzLnNvbWUociA9PiBpc0VxdWFsKG1vZGVsLnVyaSwgcikpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVNYXJrZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1hcmtlcnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHR0aGlzLm1hcmtlcnMgPSB0aGlzLm1hcmtlclNlcnZpY2UucmVhZCh7XG5cdFx0XHRcdHJlc291cmNlOiBtb2RlbC51cmksXG5cdFx0XHRcdHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkVycm9yIHwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyB8IE1hcmtlclNldmVyaXR5LkluZm9cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5tYXJrZXJzLnNvcnQodGhpcy5jb21wYXJlTWFya2VyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYXJrZXJzID0gW107XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTdGF0dXMoKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcGFyZU1hcmtlcihhOiBJTWFya2VyLCBiOiBJTWFya2VyKTogbnVtYmVyIHtcblx0XHRsZXQgcmVzID0gY29tcGFyZShhLnJlc291cmNlLnRvU3RyaW5nKCksIGIucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0aWYgKHJlcyA9PT0gMCkge1xuXHRcdFx0cmVzID0gTWFya2VyU2V2ZXJpdHkuY29tcGFyZShhLnNldmVyaXR5LCBiLnNldmVyaXR5KTtcblx0XHR9XG5cblx0XHRpZiAocmVzID09PSAwKSB7XG5cdFx0XHRyZXMgPSBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYSwgYik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlcztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhbmdlTGFuZ3VhZ2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3IuY2hhbmdlTGFuZ3VhZ2VNb2RlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2hhbmdlTGFuZ3VhZ2VBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGFuZ2VNb2RlJywgJ0NoYW5nZSBMYW5ndWFnZSBNb2RlJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleU0pXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5ub3QoJ25vdGVib29rRWRpdG9yRm9jdXNlZCcpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGFuZ2VMYW5ndWFnZU1vZGUuZGVzY3JpcHRpb24nLCBcIkNoYW5nZSB0aGUgbGFuZ3VhZ2UgbW9kZSBvZiB0aGUgYWN0aXZlIHRleHQgZWRpdG9yLlwiKSxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdjaGFuZ2VMYW5ndWFnZU1vZGUuYXJnLm5hbWUnLCBcIlRoZSBuYW1lIG9mIHRoZSBsYW5ndWFnZSBtb2RlIHRvIGNoYW5nZSB0by5cIiksXG5cdFx0XHRcdFx0XHRjb25zdHJhaW50OiAodmFsdWU6IHVua25vd24pID0+IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGxhbmd1YWdlTW9kZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgcHJlZmVyZW5jZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBnYWxsZXJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wgPSBnZXRDb2RlRWRpdG9yKGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpO1xuXHRcdGlmICghYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpIHtcblx0XHRcdGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soW3sgbGFiZWw6IGxvY2FsaXplKCdub0VkaXRvcicsIFwiTm8gdGV4dCBlZGl0b3IgYWN0aXZlIGF0IHRoaXMgdGltZVwiKSB9XSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblxuXHRcdC8vIENvbXB1dGUgbGFuZ3VhZ2Vcblx0XHRsZXQgY3VycmVudExhbmd1YWdlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjdXJyZW50TGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0ZXh0TW9kZWwpIHtcblx0XHRcdGN1cnJlbnRMYW5ndWFnZUlkID0gdGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRcdGN1cnJlbnRMYW5ndWFnZU5hbWUgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKGN1cnJlbnRMYW5ndWFnZUlkKSA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGhhc0xhbmd1YWdlU3VwcG9ydCA9ICEhcmVzb3VyY2U7XG5cdFx0aWYgKHJlc291cmNlPy5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgJiYgIXRleHRGaWxlU2VydmljZS51bnRpdGxlZC5nZXQocmVzb3VyY2UpPy5oYXNBc3NvY2lhdGVkRmlsZVBhdGgpIHtcblx0XHRcdGhhc0xhbmd1YWdlU3VwcG9ydCA9IGZhbHNlOyAvLyBubyBjb25maWd1cmF0aW9uIGZvciB1bnRpdGxlZCByZXNvdXJjZXMgKGUuZy4gXCJVbnRpdGxlZC0xXCIpXG5cdFx0fVxuXG5cdFx0Ly8gQWxsIGxhbmd1YWdlcyBhcmUgdmFsaWQgcGlja3Ncblx0XHRjb25zdCBsYW5ndWFnZXMgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0U29ydGVkUmVnaXN0ZXJlZExhbmd1YWdlTmFtZXMoKTtcblx0XHRjb25zdCBwaWNrczogUXVpY2tQaWNrSW5wdXRbXSA9IGxhbmd1YWdlc1xuXHRcdFx0Lm1hcCgoeyBsYW5ndWFnZU5hbWUsIGxhbmd1YWdlSWQgfSkgPT4ge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldEV4dGVuc2lvbnMobGFuZ3VhZ2VJZCkuam9pbignICcpO1xuXHRcdFx0XHRsZXQgZGVzY3JpcHRpb246IHN0cmluZztcblx0XHRcdFx0aWYgKGN1cnJlbnRMYW5ndWFnZU5hbWUgPT09IGxhbmd1YWdlTmFtZSkge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2xhbmd1YWdlRGVzY3JpcHRpb24nLCBcIih7MH0pIC0gQ29uZmlndXJlZCBMYW5ndWFnZVwiLCBsYW5ndWFnZUlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdsYW5ndWFnZURlc2NyaXB0aW9uQ29uZmlndXJlZCcsIFwiKHswfSlcIiwgbGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiBsYW5ndWFnZUlkLFxuXHRcdFx0XHRcdGxhYmVsOiBsYW5ndWFnZU5hbWUsXG5cdFx0XHRcdFx0bWV0YTogZXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXNGb3JMYW5ndWFnZUlkKGxhbmd1YWdlSWQpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblxuXHRcdHBpY2tzLnVuc2hpZnQoeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdsYW5ndWFnZXNQaWNrcycsIFwibGFuZ3VhZ2VzIChpZGVudGlmaWVyKVwiKSB9KTtcblxuXHRcdC8vIE9mZmVyIGFjdGlvbiB0byBjb25maWd1cmUgdmlhIHNldHRpbmdzXG5cdFx0bGV0IGNvbmZpZ3VyZUxhbmd1YWdlQXNzb2NpYXRpb25zOiBJUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY29uZmlndXJlTGFuZ3VhZ2VTZXR0aW5nczogSVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGdhbGxlcnlBY3Rpb246IElBY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGhhc0xhbmd1YWdlU3VwcG9ydCAmJiByZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgZXh0ID0gZXh0bmFtZShyZXNvdXJjZSkgfHwgYmFzZW5hbWUocmVzb3VyY2UpO1xuXG5cdFx0XHRpZiAoZ2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0Z2FsbGVyeUFjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0xhbmd1YWdlRXh0ZW5zaW9ucycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaG93TGFuZ3VhZ2VFeHRlbnNpb25zJywgXCJTZWFyY2ggTWFya2V0cGxhY2UgRXh0ZW5zaW9ucyBmb3IgJ3swfScuLi5cIiwgZXh0KSxcblx0XHRcdFx0XHRydW46ICgpID0+IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd0V4dGVuc2lvbnNGb3JMYW5ndWFnZScsIGV4dClcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHBpY2tzLnVuc2hpZnQoZ2FsbGVyeUFjdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbmZpZ3VyZUxhbmd1YWdlU2V0dGluZ3MgPSB7IGxhYmVsOiBsb2NhbGl6ZSgnY29uZmlndXJlTW9kZVNldHRpbmdzJywgXCJDb25maWd1cmUgJ3swfScgbGFuZ3VhZ2UgYmFzZWQgc2V0dGluZ3MuLi5cIiwgY3VycmVudExhbmd1YWdlTmFtZSkgfTtcblx0XHRcdHBpY2tzLnVuc2hpZnQoY29uZmlndXJlTGFuZ3VhZ2VTZXR0aW5ncyk7XG5cdFx0XHRjb25maWd1cmVMYW5ndWFnZUFzc29jaWF0aW9ucyA9IHsgbGFiZWw6IGxvY2FsaXplKCdjb25maWd1cmVBc3NvY2lhdGlvbnNFeHQnLCBcIkNvbmZpZ3VyZSBGaWxlIEFzc29jaWF0aW9uIGZvciAnezB9Jy4uLlwiLCBleHQpIH07XG5cdFx0XHRwaWNrcy51bnNoaWZ0KGNvbmZpZ3VyZUxhbmd1YWdlQXNzb2NpYXRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBPZmZlciB0byBcIkF1dG8gRGV0ZWN0XCIsIGJ1dCBvbmx5IGlmIHRoZSBkb2N1bWVudCBpcyBub3QgZW1wdHkuXG5cdFx0Y29uc3QgYXV0b0RldGVjdExhbmd1YWdlOiBJUXVpY2tQaWNrSXRlbSA9IHsgbGFiZWw6IGxvY2FsaXplKCdhdXRvRGV0ZWN0JywgXCJBdXRvIERldGVjdFwiKSB9O1xuXHRcdGlmICh0ZXh0TW9kZWwgJiYgdGV4dE1vZGVsLmdldFZhbHVlTGVuZ3RoKCkgPiAwKSB7XG5cdFx0XHRwaWNrcy51bnNoaWZ0KGF1dG9EZXRlY3RMYW5ndWFnZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGljayA9IHR5cGVvZiBsYW5ndWFnZU1vZGUgPT09ICdzdHJpbmcnID8geyBsYWJlbDogbGFuZ3VhZ2VNb2RlIH0gOiBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7IHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgncGlja0xhbmd1YWdlJywgXCJTZWxlY3QgTGFuZ3VhZ2UgTW9kZVwiKSwgbWF0Y2hPbkRlc2NyaXB0aW9uOiB0cnVlIH0pO1xuXHRcdGlmICghcGljaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChwaWNrID09PSBnYWxsZXJ5QWN0aW9uKSB7XG5cdFx0XHRnYWxsZXJ5QWN0aW9uLnJ1bigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVzZXIgZGVjaWRlZCB0byBwZXJtYW5lbnRseSBjb25maWd1cmUgYXNzb2NpYXRpb25zLCByZXR1cm4gcmlnaHQgYWZ0ZXJcblx0XHRpZiAocGljayA9PT0gY29uZmlndXJlTGFuZ3VhZ2VBc3NvY2lhdGlvbnMpIHtcblx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyZUZpbGVBc3NvY2lhdGlvbihyZXNvdXJjZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBxdWlja0lucHV0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVzZXIgZGVjaWRlZCB0byBjb25maWd1cmUgc2V0dGluZ3MgZm9yIGN1cnJlbnQgbGFuZ3VhZ2Vcblx0XHRpZiAocGljayA9PT0gY29uZmlndXJlTGFuZ3VhZ2VTZXR0aW5ncykge1xuXHRcdFx0cHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Vc2VyU2V0dGluZ3MoeyBqc29uRWRpdG9yOiB0cnVlLCByZXZlYWxTZXR0aW5nOiB7IGtleTogYFske2N1cnJlbnRMYW5ndWFnZUlkID8/IG51bGx9XWAsIGVkaXQ6IHRydWUgfSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDaGFuZ2UgbGFuZ3VhZ2UgZm9yIGFjdGl2ZSBlZGl0b3Jcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRpZiAoYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBsYW5ndWFnZVN1cHBvcnQgPSB0b0VkaXRvcldpdGhMYW5ndWFnZVN1cHBvcnQoYWN0aXZlRWRpdG9yKTtcblx0XHRcdGlmIChsYW5ndWFnZVN1cHBvcnQpIHtcblxuXHRcdFx0XHQvLyBGaW5kIGxhbmd1YWdlXG5cdFx0XHRcdGxldCBsYW5ndWFnZVNlbGVjdGlvbjogSUxhbmd1YWdlU2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgZGV0ZWN0ZWRMYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAocGljayA9PT0gYXV0b0RldGVjdExhbmd1YWdlKSB7XG5cdFx0XHRcdFx0aWYgKHRleHRNb2RlbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdFx0XHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRcdC8vIERldGVjdCBsYW5ndWFnZXMgc2luY2Ugd2UgYXJlIGluIGFuIHVudGl0bGVkIGZpbGVcblx0XHRcdFx0XHRcdFx0bGV0IGxhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGxhbmd1YWdlU2VydmljZS5ndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUocmVzb3VyY2UsIHRleHRNb2RlbC5nZXRMaW5lQ29udGVudCgxKSkgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRpZiAoIWxhbmd1YWdlSWQgfHwgbGFuZ3VhZ2VJZCA9PT0gJ3Vua25vd24nKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZGV0ZWN0ZWRMYW5ndWFnZSA9IGF3YWl0IGxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZS5kZXRlY3RMYW5ndWFnZShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2VJZCA9IGRldGVjdGVkTGFuZ3VhZ2U7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKGxhbmd1YWdlSWQpIHtcblx0XHRcdFx0XHRcdFx0XHRsYW5ndWFnZVNlbGVjdGlvbiA9IGxhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKGxhbmd1YWdlSWQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxhbmd1YWdlU2VsZWN0aW9uID0gbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQocGljay5pZCk7XG5cblx0XHRcdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdC8vIGZpcmUgYW5kIGZvcmdldCB0byBub3Qgc2xvdyB0aGluZ3MgZG93blxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlLmRldGVjdExhbmd1YWdlKHJlc291cmNlKS50aGVuKGRldGVjdGVkTGFuZ3VhZ2VJZCA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNob3Nlbkxhbmd1YWdlSWQgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKHBpY2subGFiZWwpIHx8ICd1bmtub3duJztcblx0XHRcdFx0XHRcdFx0aWYgKGRldGVjdGVkTGFuZ3VhZ2VJZCA9PT0gY3VycmVudExhbmd1YWdlSWQgJiYgY3VycmVudExhbmd1YWdlSWQgIT09IGNob3Nlbkxhbmd1YWdlSWQpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBJZiB0aGV5IGRpZG4ndCBjaG9vc2UgdGhlIGRldGVjdGVkIGxhbmd1YWdlICh3aGljaCBzaG91bGQgYWxzbyBiZSB0aGUgYWN0aXZlIGxhbmd1YWdlIGlmIGF1dG9tYXRpYyBkZXRlY3Rpb24gaXMgZW5hYmxlZClcblx0XHRcdFx0XHRcdFx0XHQvLyB0aGVuIHRoZSBhdXRvbWF0aWMgbGFuZ3VhZ2UgZGV0ZWN0aW9uIHdhcyBsaWtlbHkgd3JvbmcgYW5kIHRoZSB1c2VyIGlzIGNvcnJlY3RpbmcgaXQuIEluIHRoaXMgY2FzZSwgd2Ugd2FudCB0ZWxlbWV0cnkuXG5cdFx0XHRcdFx0XHRcdFx0Ly8gS2VlcCB0cmFjayBvZiB3aGF0IG1vZGVsIHdhcyBwcmVmZXJyZWQgYW5kIGxlbmd0aCBvZiBpbnB1dCB0byBoZWxwIHRyYWNrIGRvd24gcG90ZW50aWFsIGRpZmZlcmVuY2VzIGJldHdlZW4gdGhlIHJlc3VsdCBxdWFsaXR5IGFjcm9zcyBtb2RlbHMgYW5kIGNvbnRlbnQgc2l6ZS5cblx0XHRcdFx0XHRcdFx0XHRjb25zdCBtb2RlbFByZWZlcmVuY2UgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignd29ya2JlbmNoLmVkaXRvci5wcmVmZXJIaXN0b3J5QmFzZWRMYW5ndWFnZURldGVjdGlvbicpID8gJ2hpc3RvcnknIDogJ2NsYXNzaWMnO1xuXHRcdFx0XHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJQXV0b21hdGljTGFuZ3VhZ2VEZXRlY3Rpb25MaWtlbHlXcm9uZ0RhdGEsIEF1dG9tYXRpY0xhbmd1YWdlRGV0ZWN0aW9uTGlrZWx5V3JvbmdDbGFzc2lmaWNhdGlvbj4oQXV0b21hdGljTGFuZ3VhZ2VEZXRlY3Rpb25MaWtlbHlXcm9uZ0lkLCB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjdXJyZW50TGFuZ3VhZ2VJZDogY3VycmVudExhbmd1YWdlTmFtZSA/PyAndW5rbm93bicsXG5cdFx0XHRcdFx0XHRcdFx0XHRuZXh0TGFuZ3VhZ2VJZDogcGljay5sYWJlbCxcblx0XHRcdFx0XHRcdFx0XHRcdGxpbmVDb3VudDogdGV4dE1vZGVsPy5nZXRMaW5lQ291bnQoKSA/PyAtMSxcblx0XHRcdFx0XHRcdFx0XHRcdG1vZGVsUHJlZmVyZW5jZSxcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2hhbmdlIGxhbmd1YWdlXG5cdFx0XHRcdGlmICh0eXBlb2YgbGFuZ3VhZ2VTZWxlY3Rpb24gIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0bGFuZ3VhZ2VTdXBwb3J0LnNldExhbmd1YWdlSWQobGFuZ3VhZ2VTZWxlY3Rpb24ubGFuZ3VhZ2VJZCwgQ2hhbmdlTGFuZ3VhZ2VBY3Rpb24uSUQpO1xuXG5cdFx0XHRcdFx0aWYgKHJlc291cmNlPy5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdFx0XHRcdHR5cGUgU2V0VW50aXRsZWREb2N1bWVudExhbmd1YWdlRXZlbnQgPSB7IHRvOiBzdHJpbmc7IGZyb206IHN0cmluZzsgbW9kZWxQcmVmZXJlbmNlOiBzdHJpbmcgfTtcblx0XHRcdFx0XHRcdHR5cGUgU2V0VW50aXRsZWREb2N1bWVudExhbmd1YWdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRcdG93bmVyOiAnVHlsZXJMZW9uaGFyZHQnO1xuXHRcdFx0XHRcdFx0XHRjb21tZW50OiAnSGVscHMgdW5kZXJzdGFuZCB3aGF0IHRoZSBhdXRvbWF0aWMgbGFuZ3VhZ2UgZGV0ZWN0aW9uIGRvZXMgZm9yIHVudGl0bGVkIGZpbGVzJztcblx0XHRcdFx0XHRcdFx0dG86IHtcblx0XHRcdFx0XHRcdFx0XHRjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJztcblx0XHRcdFx0XHRcdFx0XHRwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnO1xuXHRcdFx0XHRcdFx0XHRcdG93bmVyOiAnVHlsZXJMZW9uaGFyZHQnO1xuXHRcdFx0XHRcdFx0XHRcdGNvbW1lbnQ6ICdIZWxwIHVuZGVyc3RhbmQgZWZmZWN0aXZlbmVzcyBvZiBhdXRvbWF0aWMgbGFuZ3VhZ2UgZGV0ZWN0aW9uJztcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0ZnJvbToge1xuXHRcdFx0XHRcdFx0XHRcdGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnO1xuXHRcdFx0XHRcdFx0XHRcdHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7XG5cdFx0XHRcdFx0XHRcdFx0b3duZXI6ICdUeWxlckxlb25oYXJkdCc7XG5cdFx0XHRcdFx0XHRcdFx0Y29tbWVudDogJ0hlbHAgdW5kZXJzdGFuZCBlZmZlY3RpdmVuZXNzIG9mIGF1dG9tYXRpYyBsYW5ndWFnZSBkZXRlY3Rpb24nO1xuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRtb2RlbFByZWZlcmVuY2U6IHtcblx0XHRcdFx0XHRcdFx0XHRjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJztcblx0XHRcdFx0XHRcdFx0XHRwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnO1xuXHRcdFx0XHRcdFx0XHRcdG93bmVyOiAnVHlsZXJMZW9uaGFyZHQnO1xuXHRcdFx0XHRcdFx0XHRcdGNvbW1lbnQ6ICdIZWxwIHVuZGVyc3RhbmQgZWZmZWN0aXZlbmVzcyBvZiBhdXRvbWF0aWMgbGFuZ3VhZ2UgZGV0ZWN0aW9uJztcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRjb25zdCBtb2RlbFByZWZlcmVuY2UgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignd29ya2JlbmNoLmVkaXRvci5wcmVmZXJIaXN0b3J5QmFzZWRMYW5ndWFnZURldGVjdGlvbicpID8gJ2hpc3RvcnknIDogJ2NsYXNzaWMnO1xuXHRcdFx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFNldFVudGl0bGVkRG9jdW1lbnRMYW5ndWFnZUV2ZW50LCBTZXRVbnRpdGxlZERvY3VtZW50TGFuZ3VhZ2VDbGFzc2lmaWNhdGlvbj4oJ3NldFVudGl0bGVkRG9jdW1lbnRMYW5ndWFnZScsIHtcblx0XHRcdFx0XHRcdFx0dG86IGxhbmd1YWdlU2VsZWN0aW9uLmxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0XHRcdGZyb206IGN1cnJlbnRMYW5ndWFnZUlkID8/ICdub25lJyxcblx0XHRcdFx0XHRcdFx0bW9kZWxQcmVmZXJlbmNlLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb25maWd1cmVGaWxlQXNzb2NpYXRpb24ocmVzb3VyY2U6IFVSSSwgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLCBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0bmFtZShyZXNvdXJjZSk7XG5cdFx0Y29uc3QgYmFzZSA9IGJhc2VuYW1lKHJlc291cmNlKTtcblx0XHRjb25zdCBjdXJyZW50QXNzb2NpYXRpb24gPSBsYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKFVSSS5maWxlKGJhc2UpKTtcblxuXHRcdGNvbnN0IGxhbmd1YWdlcyA9IGxhbmd1YWdlU2VydmljZS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpO1xuXHRcdGNvbnN0IHBpY2tzOiBJUXVpY2tQaWNrSXRlbVtdID0gbGFuZ3VhZ2VzLm1hcCgoeyBsYW5ndWFnZU5hbWUsIGxhbmd1YWdlSWQgfSkgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IGxhbmd1YWdlSWQsXG5cdFx0XHRcdGxhYmVsOiBsYW5ndWFnZU5hbWUsXG5cdFx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlc0Zvckxhbmd1YWdlSWQobGFuZ3VhZ2VJZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAobGFuZ3VhZ2VJZCA9PT0gY3VycmVudEFzc29jaWF0aW9uKSA/IGxvY2FsaXplKCdjdXJyZW50QXNzb2NpYXRpb24nLCBcIkN1cnJlbnQgQXNzb2NpYXRpb25cIikgOiB1bmRlZmluZWRcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywgeyBwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3BpY2tMYW5ndWFnZVRvQ29uZmlndXJlJywgXCJTZWxlY3QgTGFuZ3VhZ2UgTW9kZSB0byBBc3NvY2lhdGUgd2l0aCAnezB9J1wiLCBleHRlbnNpb24gfHwgYmFzZSkgfSk7XG5cdFx0XHRpZiAobGFuZ3VhZ2UpIHtcblx0XHRcdFx0Y29uc3QgZmlsZUFzc29jaWF0aW9uc0NvbmZpZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8e30+KEZJTEVTX0FTU09DSUFUSU9OU19DT05GSUcpO1xuXG5cdFx0XHRcdGxldCBhc3NvY2lhdGlvbktleTogc3RyaW5nO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uICYmIGJhc2VbMF0gIT09ICcuJykge1xuXHRcdFx0XHRcdGFzc29jaWF0aW9uS2V5ID0gYCoke2V4dGVuc2lvbn1gOyAvLyBvbmx5IHVzZSBcIiouZXh0XCIgaWYgdGhlIGZpbGUgcGF0aCBpcyBpbiB0aGUgZm9ybSBvZiA8bmFtZT4uPGV4dD5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhc3NvY2lhdGlvbktleSA9IGJhc2U7IC8vIG90aGVyd2lzZSB1c2UgdGhlIGJhc2VuYW1lIChlLmcuIC5naXRpZ25vcmUsIERvY2tlcmZpbGUpXG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiB0aGUgYXNzb2NpYXRpb24gaXMgYWxyZWFkeSBiZWluZyBtYWRlIGluIHRoZSB3b3Jrc3BhY2UsIG1ha2Ugc3VyZSB0byB0YXJnZXQgd29ya3NwYWNlIHNldHRpbmdzXG5cdFx0XHRcdGxldCB0YXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI7XG5cdFx0XHRcdGlmIChmaWxlQXNzb2NpYXRpb25zQ29uZmlnLndvcmtzcGFjZVZhbHVlPy5bYXNzb2NpYXRpb25LZXkgYXMga2V5b2YgdHlwZW9mIGZpbGVBc3NvY2lhdGlvbnNDb25maWcud29ya3NwYWNlVmFsdWVdKSB7XG5cdFx0XHRcdFx0dGFyZ2V0ID0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBNYWtlIHN1cmUgdG8gd3JpdGUgaW50byB0aGUgdmFsdWUgb2YgdGhlIHRhcmdldCBhbmQgbm90IHRoZSBtZXJnZWQgdmFsdWUgZnJvbSBVU0VSIGFuZCBXT1JLU1BBQ0UgY29uZmlnXG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRBc3NvY2lhdGlvbnMgPSBkZWVwQ2xvbmUoKHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpID8gZmlsZUFzc29jaWF0aW9uc0NvbmZpZy53b3Jrc3BhY2VWYWx1ZSA6IGZpbGVBc3NvY2lhdGlvbnNDb25maWcudXNlclZhbHVlKSB8fCBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0XHRjdXJyZW50QXNzb2NpYXRpb25zW2Fzc29jaWF0aW9uS2V5XSA9IGxhbmd1YWdlLmlkO1xuXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKEZJTEVTX0FTU09DSUFUSU9OU19DT05GSUcsIGN1cnJlbnRBc3NvY2lhdGlvbnMsIHRhcmdldCk7XG5cdFx0XHR9XG5cdFx0fSwgNTAgLyogcXVpY2sgaW5wdXQgaXMgc2Vuc2l0aXZlIHRvIGJlaW5nIG9wZW5lZCBzbyBzb29uIGFmdGVyIGFub3RoZXIgKi8pO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ2hhbmdlRU9MRW50cnkgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGVvbDogRW5kT2ZMaW5lU2VxdWVuY2U7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGFuZ2VFT0xBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yLmNoYW5nZUVPTCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGFuZ2VFbmRPZkxpbmUnLCAnQ2hhbmdlIEVuZCBvZiBMaW5lIFNlcXVlbmNlJyksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gZ2V0Q29kZUVkaXRvcihlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRpZiAoIWFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSB7XG5cdFx0XHRhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFt7IGxhYmVsOiBsb2NhbGl6ZSgnbm9FZGl0b3InLCBcIk5vIHRleHQgZWRpdG9yIGFjdGl2ZSBhdCB0aGlzIHRpbWVcIikgfV0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcj8uaXNSZWFkb25seSgpKSB7XG5cdFx0XHRhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFt7IGxhYmVsOiBsb2NhbGl6ZSgnbm9Xcml0YWJsZUNvZGVFZGl0b3InLCBcIlRoZSBhY3RpdmUgY29kZSBlZGl0b3IgaXMgcmVhZC1vbmx5LlwiKSB9XSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHRleHRNb2RlbCA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE1vZGVsKCk7XG5cblx0XHRjb25zdCBFT0xPcHRpb25zOiBJQ2hhbmdlRU9MRW50cnlbXSA9IFtcblx0XHRcdHsgbGFiZWw6IG5sc0VPTExGLCBlb2w6IEVuZE9mTGluZVNlcXVlbmNlLkxGIH0sXG5cdFx0XHR7IGxhYmVsOiBubHNFT0xDUkxGLCBlb2w6IEVuZE9mTGluZVNlcXVlbmNlLkNSTEYgfSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRJbmRleCA9ICh0ZXh0TW9kZWw/LmdldEVPTCgpID09PSAnXFxuJykgPyAwIDogMTtcblxuXHRcdGNvbnN0IGVvbCA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soRU9MT3B0aW9ucywgeyBwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3BpY2tFbmRPZkxpbmUnLCBcIlNlbGVjdCBFbmQgb2YgTGluZSBTZXF1ZW5jZVwiKSwgYWN0aXZlSXRlbTogRU9MT3B0aW9uc1tzZWxlY3RlZEluZGV4XSB9KTtcblx0XHRpZiAoZW9sKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVDb2RlRWRpdG9yID0gZ2V0Q29kZUVkaXRvcihlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRcdGlmIChhY3RpdmVDb2RlRWRpdG9yPy5oYXNNb2RlbCgpICYmICFlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcj8uaXNSZWFkb25seSgpKSB7XG5cdFx0XHRcdHRleHRNb2RlbCA9IGFjdGl2ZUNvZGVFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdFx0dGV4dE1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdFx0dGV4dE1vZGVsLnB1c2hFT0woZW9sLmVvbCk7XG5cdFx0XHRcdHRleHRNb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZm9jdXMoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhbmdlRW5jb2RpbmdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yLmNoYW5nZUVuY29kaW5nJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYW5nZUVuY29kaW5nJywgJ0NoYW5nZSBGaWxlIEVuY29kaW5nJyksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHRleHRGaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dEZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wgPSBnZXRDb2RlRWRpdG9yKGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpO1xuXHRcdGlmICghYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpIHtcblx0XHRcdGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soW3sgbGFiZWw6IGxvY2FsaXplKCdub0VkaXRvcicsIFwiTm8gdGV4dCBlZGl0b3IgYWN0aXZlIGF0IHRoaXMgdGltZVwiKSB9XSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvclBhbmUpIHtcblx0XHRcdGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soW3sgbGFiZWw6IGxvY2FsaXplKCdub0VkaXRvcicsIFwiTm8gdGV4dCBlZGl0b3IgYWN0aXZlIGF0IHRoaXMgdGltZVwiKSB9XSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5jb2RpbmdTdXBwb3J0OiBJRW5jb2RpbmdTdXBwb3J0IHwgbnVsbCA9IHRvRWRpdG9yV2l0aEVuY29kaW5nU3VwcG9ydChhY3RpdmVFZGl0b3JQYW5lLmlucHV0KTtcblx0XHRpZiAoIWVuY29kaW5nU3VwcG9ydCkge1xuXHRcdFx0YXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhbeyBsYWJlbDogbG9jYWxpemUoJ25vRmlsZUVkaXRvcicsIFwiTm8gZmlsZSBhY3RpdmUgYXQgdGhpcyB0aW1lXCIpIH1dKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzYXZlV2l0aEVuY29kaW5nUGljazogSVF1aWNrUGlja0l0ZW0gPSB7IGxhYmVsOiBsb2NhbGl6ZSgnc2F2ZVdpdGhFbmNvZGluZycsIFwiU2F2ZSB3aXRoIEVuY29kaW5nXCIpIH07XG5cdFx0Y29uc3QgcmVvcGVuV2l0aEVuY29kaW5nUGljazogSVF1aWNrUGlja0l0ZW0gPSB7IGxhYmVsOiBsb2NhbGl6ZSgncmVvcGVuV2l0aEVuY29kaW5nJywgXCJSZW9wZW4gd2l0aCBFbmNvZGluZ1wiKSB9O1xuXG5cdFx0aWYgKCFMYW5ndWFnZS5pc0RlZmF1bHRWYXJpYW50KCkpIHtcblx0XHRcdGNvbnN0IHNhdmVXaXRoRW5jb2RpbmdBbGlhcyA9ICdTYXZlIHdpdGggRW5jb2RpbmcnO1xuXHRcdFx0aWYgKHNhdmVXaXRoRW5jb2RpbmdBbGlhcyAhPT0gc2F2ZVdpdGhFbmNvZGluZ1BpY2subGFiZWwpIHtcblx0XHRcdFx0c2F2ZVdpdGhFbmNvZGluZ1BpY2suZGV0YWlsID0gc2F2ZVdpdGhFbmNvZGluZ0FsaWFzO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZW9wZW5XaXRoRW5jb2RpbmdBbGlhcyA9ICdSZW9wZW4gd2l0aCBFbmNvZGluZyc7XG5cdFx0XHRpZiAocmVvcGVuV2l0aEVuY29kaW5nQWxpYXMgIT09IHJlb3BlbldpdGhFbmNvZGluZ1BpY2subGFiZWwpIHtcblx0XHRcdFx0cmVvcGVuV2l0aEVuY29kaW5nUGljay5kZXRhaWwgPSByZW9wZW5XaXRoRW5jb2RpbmdBbGlhcztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgYWN0aW9uOiBJUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZW5jb2RpbmdTdXBwb3J0IGluc3RhbmNlb2YgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQpIHtcblx0XHRcdGFjdGlvbiA9IHNhdmVXaXRoRW5jb2RpbmdQaWNrO1xuXHRcdH0gZWxzZSBpZiAoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dC5pc1JlYWRvbmx5KCkpIHtcblx0XHRcdGFjdGlvbiA9IHJlb3BlbldpdGhFbmNvZGluZ1BpY2s7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGlvbiA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soW3Jlb3BlbldpdGhFbmNvZGluZ1BpY2ssIHNhdmVXaXRoRW5jb2RpbmdQaWNrXSwgeyBwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3BpY2tBY3Rpb24nLCBcIlNlbGVjdCBBY3Rpb25cIiksIG1hdGNoT25EZXRhaWw6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFhY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aW1lb3V0KDUwKTsgLy8gcXVpY2sgaW5wdXQgaXMgc2Vuc2l0aXZlIHRvIGJlaW5nIG9wZW5lZCBzbyBzb29uIGFmdGVyIGFub3RoZXJcblxuXHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShhY3RpdmVFZGl0b3JQYW5lLmlucHV0LCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0aWYgKCFyZXNvdXJjZSB8fCAoIWZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHJlc291cmNlKSAmJiByZXNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMudW50aXRsZWQpKSB7XG5cdFx0XHRyZXR1cm47IC8vIGVuY29kaW5nIGRldGVjdGlvbiBvbmx5IHBvc3NpYmxlIGZvciByZXNvdXJjZXMgdGhlIGZpbGUgc2VydmljZSBjYW4gaGFuZGxlIG9yIHRoYXQgYXJlIHVudGl0bGVkXG5cdFx0fVxuXG5cdFx0bGV0IGd1ZXNzZWRFbmNvZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChmaWxlU2VydmljZS5oYXNQcm92aWRlcihyZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0ZXh0RmlsZVNlcnZpY2UucmVhZFN0cmVhbShyZXNvdXJjZSwge1xuXHRcdFx0XHRhdXRvR3Vlc3NFbmNvZGluZzogdHJ1ZSxcblx0XHRcdFx0Y2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3M6IHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHJlc291cmNlLCAnZmlsZXMuY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MnKVxuXHRcdFx0fSk7XG5cdFx0XHRndWVzc2VkRW5jb2RpbmcgPSBjb250ZW50LmVuY29kaW5nO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzUmVvcGVuV2l0aEVuY29kaW5nID0gKGFjdGlvbiA9PT0gcmVvcGVuV2l0aEVuY29kaW5nUGljayk7XG5cblx0XHRjb25zdCBjb25maWd1cmVkRW5jb2RpbmcgPSB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShyZXNvdXJjZSwgJ2ZpbGVzLmVuY29kaW5nJyk7XG5cblx0XHRsZXQgZGlyZWN0TWF0Y2hJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhbGlhc01hdGNoSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIEFsbCBlbmNvZGluZ3MgYXJlIHZhbGlkIHBpY2tzXG5cdFx0Y29uc3QgcGlja3M6IFF1aWNrUGlja0lucHV0W10gPSBPYmplY3Qua2V5cyhTVVBQT1JURURfRU5DT0RJTkdTKVxuXHRcdFx0LnNvcnQoKGsxLCBrMikgPT4ge1xuXHRcdFx0XHRpZiAoazEgPT09IGNvbmZpZ3VyZWRFbmNvZGluZykge1xuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fSBlbHNlIGlmIChrMiA9PT0gY29uZmlndXJlZEVuY29kaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gU1VQUE9SVEVEX0VOQ09ESU5HU1trMV0ub3JkZXIgLSBTVVBQT1JURURfRU5DT0RJTkdTW2syXS5vcmRlcjtcblx0XHRcdH0pXG5cdFx0XHQuZmlsdGVyKGsgPT4ge1xuXHRcdFx0XHRpZiAoayA9PT0gZ3Vlc3NlZEVuY29kaW5nICYmIGd1ZXNzZWRFbmNvZGluZyAhPT0gY29uZmlndXJlZEVuY29kaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBkbyBub3Qgc2hvdyBlbmNvZGluZyBpZiBpdCBpcyB0aGUgZ3Vlc3NlZCBlbmNvZGluZyB0aGF0IGRvZXMgbm90IG1hdGNoIHRoZSBjb25maWd1cmVkXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gIWlzUmVvcGVuV2l0aEVuY29kaW5nIHx8ICFTVVBQT1JURURfRU5DT0RJTkdTW2tdLmVuY29kZU9ubHk7IC8vIGhpZGUgdGhvc2UgdGhhdCBjYW4gb25seSBiZSB1c2VkIGZvciBlbmNvZGluZyBpZiB3ZSBhcmUgYWJvdXQgdG8gZGVjb2RlXG5cdFx0XHR9KVxuXHRcdFx0Lm1hcCgoa2V5LCBpbmRleCkgPT4ge1xuXHRcdFx0XHRpZiAoa2V5ID09PSBlbmNvZGluZ1N1cHBvcnQuZ2V0RW5jb2RpbmcoKSkge1xuXHRcdFx0XHRcdGRpcmVjdE1hdGNoSW5kZXggPSBpbmRleDtcblx0XHRcdFx0fSBlbHNlIGlmIChTVVBQT1JURURfRU5DT0RJTkdTW2tleV0uYWxpYXMgPT09IGVuY29kaW5nU3VwcG9ydC5nZXRFbmNvZGluZygpKSB7XG5cdFx0XHRcdFx0YWxpYXNNYXRjaEluZGV4ID0gaW5kZXg7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4geyBpZDoga2V5LCBsYWJlbDogU1VQUE9SVEVEX0VOQ09ESU5HU1trZXldLmxhYmVsTG9uZywgZGVzY3JpcHRpb246IGtleSB9O1xuXHRcdFx0fSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IHBpY2tzLnNsaWNlKCkgYXMgSVF1aWNrUGlja0l0ZW1bXTtcblxuXHRcdC8vIElmIHdlIGhhdmUgYSBndWVzc2VkIGVuY29kaW5nLCBzaG93IGl0IGZpcnN0IHVubGVzcyBpdCBtYXRjaGVzIHRoZSBjb25maWd1cmVkIGVuY29kaW5nXG5cdFx0aWYgKGd1ZXNzZWRFbmNvZGluZyAmJiBjb25maWd1cmVkRW5jb2RpbmcgIT09IGd1ZXNzZWRFbmNvZGluZyAmJiBTVVBQT1JURURfRU5DT0RJTkdTW2d1ZXNzZWRFbmNvZGluZ10pIHtcblx0XHRcdHBpY2tzLnVuc2hpZnQoeyB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcblx0XHRcdHBpY2tzLnVuc2hpZnQoeyBpZDogZ3Vlc3NlZEVuY29kaW5nLCBsYWJlbDogU1VQUE9SVEVEX0VOQ09ESU5HU1tndWVzc2VkRW5jb2RpbmddLmxhYmVsTG9uZywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdndWVzc2VkRW5jb2RpbmcnLCBcIkd1ZXNzZWQgZnJvbSBjb250ZW50XCIpIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVuY29kaW5nID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywge1xuXHRcdFx0cGxhY2VIb2xkZXI6IGlzUmVvcGVuV2l0aEVuY29kaW5nID8gbG9jYWxpemUoJ3BpY2tFbmNvZGluZ0ZvclJlb3BlbicsIFwiU2VsZWN0IEZpbGUgRW5jb2RpbmcgdG8gUmVvcGVuIEZpbGVcIikgOiBsb2NhbGl6ZSgncGlja0VuY29kaW5nRm9yU2F2ZScsIFwiU2VsZWN0IEZpbGUgRW5jb2RpbmcgdG8gU2F2ZSB3aXRoXCIpLFxuXHRcdFx0YWN0aXZlSXRlbTogaXRlbXNbdHlwZW9mIGRpcmVjdE1hdGNoSW5kZXggPT09ICdudW1iZXInID8gZGlyZWN0TWF0Y2hJbmRleCA6IHR5cGVvZiBhbGlhc01hdGNoSW5kZXggPT09ICdudW1iZXInID8gYWxpYXNNYXRjaEluZGV4IDogLTFdXG5cdFx0fSk7XG5cblx0XHRpZiAoIWVuY29kaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFbmNvZGluZ1N1cHBvcnQgPSB0b0VkaXRvcldpdGhFbmNvZGluZ1N1cHBvcnQoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lLmlucHV0KTtcblx0XHRpZiAodHlwZW9mIGVuY29kaW5nLmlkICE9PSAndW5kZWZpbmVkJyAmJiBhY3RpdmVFbmNvZGluZ1N1cHBvcnQpIHtcblxuXHRcdFx0Ly8gUmUtb3BlbiB3aXRoIGVuY29kaW5nIGRvZXMgbm90IHdvcmsgb24gZGlydHkgZWRpdG9ycywgYXNrIHRvIHJldmVydFxuXHRcdFx0aWYgKGlzUmVvcGVuV2l0aEVuY29kaW5nICYmIGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZS5pbnB1dC5pc0RpcnR5KCkpIHtcblx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Jlb3BlbldpdGhFbmNvZGluZ1dhcm5pbmcnLCBcIkRvIHlvdSB3YW50IHRvIHJldmVydCB0aGUgYWN0aXZlIHRleHQgZWRpdG9yIGFuZCByZW9wZW4gd2l0aCBhIGRpZmZlcmVudCBlbmNvZGluZz9cIiksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgncmVvcGVuV2l0aEVuY29kaW5nRGV0YWlsJywgXCJUaGlzIHdpbGwgZGlzY2FyZCBhbnkgdW5zYXZlZCBjaGFuZ2VzLlwiKSxcblx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgncmVvcGVuJywgXCJEaXNjYXJkIENoYW5nZXMgYW5kIFJlb3BlblwiKVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZS5pbnB1dC5yZXZlcnQoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lLmdyb3VwLmlkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0IG5ldyBlbmNvZGluZ1xuXHRcdFx0YXdhaXQgYWN0aXZlRW5jb2RpbmdTdXBwb3J0LnNldEVuY29kaW5nKGVuY29kaW5nLmlkLCBpc1Jlb3BlbldpdGhFbmNvZGluZyA/IEVuY29kaW5nTW9kZS5EZWNvZGUgOiBFbmNvZGluZ01vZGUuRW5jb2RlKTtcblx0XHR9XG5cblx0XHRhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5mb2N1cygpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsZUFBZSwrQ0FBK0M7QUFDdkUsU0FBUyxRQUFRLFNBQVMsa0JBQWtCO0FBQzVDLFNBQVMsU0FBUyxVQUFVLGVBQWU7QUFDM0MsU0FBUyxjQUFjLDRCQUE0QjtBQUNuRCxTQUFTLFdBQVc7QUFDcEIsU0FBa0IsZ0JBQWdCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQTJCLHdCQUFxQyx3QkFBd0I7QUFFeEYsU0FBUyxZQUFZLG1CQUFtQix1QkFBdUI7QUFFL0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxtQkFBbUIsaUJBQWlCLHNCQUFzQixtQkFBbUIsMkJBQTJCLCtCQUErQjtBQUNoSixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGNBQWMsaUNBQWlDO0FBQ3hELFNBQVMs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
