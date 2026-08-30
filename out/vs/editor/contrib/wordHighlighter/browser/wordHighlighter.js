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
import * as nls from "../../../../nls.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { createCancelablePromise, Delayer, first } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { onUnexpectedError, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { matchesScheme, Schemas } from "../../../../base/common/network.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isDiffEditor } from "../../../browser/editorBrowser.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, registerModelAndPositionCommand } from "../../../browser/editorExtensions.js";
import { ICodeEditorService } from "../../../browser/services/codeEditorService.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { registerEditorFeature } from "../../../common/editorFeatures.js";
import { score } from "../../../common/languageSelector.js";
import { shouldSynchronizeModel } from "../../../common/model.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { ITextModelService } from "../../../common/services/resolverService.js";
import { getHighlightDecorationOptions } from "./highlightDecorations.js";
import { TextualMultiDocumentHighlightFeature } from "./textualHighlightProvider.js";
const ctxHasWordHighlights = new RawContextKey("hasWordHighlights", false);
function getOccurrencesAtPosition(registry, model, position, token) {
  const orderedByScore = registry.ordered(model);
  return first(orderedByScore.map((provider) => () => {
    return Promise.resolve(provider.provideDocumentHighlights(model, position, token)).then(void 0, onUnexpectedExternalError);
  }), (result) => result !== void 0 && result !== null).then((result) => {
    if (result) {
      const map = new ResourceMap();
      map.set(model.uri, result);
      return map;
    }
    return new ResourceMap();
  });
}
function getOccurrencesAcrossMultipleModels(registry, model, position, token, otherModels) {
  const orderedByScore = registry.ordered(model);
  return first(orderedByScore.map((provider) => () => {
    const filteredModels = otherModels.filter((otherModel) => {
      return shouldSynchronizeModel(otherModel);
    }).filter((otherModel) => {
      return score(provider.selector, otherModel.uri, otherModel.getLanguageId(), true, void 0, void 0) > 0;
    });
    return Promise.resolve(provider.provideMultiDocumentHighlights(model, position, filteredModels, token)).then(void 0, onUnexpectedExternalError);
  }), (result) => result !== void 0 && result !== null);
}
class OccurenceAtPositionRequest {
  constructor(_model, _selection, _wordSeparators) {
    this._model = _model;
    this._selection = _selection;
    this._wordSeparators = _wordSeparators;
    this._wordRange = this._getCurrentWordRange(_model, _selection);
    this._result = null;
  }
  get result() {
    if (!this._result) {
      this._result = createCancelablePromise((token) => this._compute(this._model, this._selection, this._wordSeparators, token));
    }
    return this._result;
  }
  _getCurrentWordRange(model, selection) {
    const word = model.getWordAtPosition(selection.getPosition());
    if (word) {
      return new Range(selection.startLineNumber, word.startColumn, selection.startLineNumber, word.endColumn);
    }
    return null;
  }
  isValid(model, selection, decorations) {
    const lineNumber = selection.startLineNumber;
    const startColumn = selection.startColumn;
    const endColumn = selection.endColumn;
    const currentWordRange = this._getCurrentWordRange(model, selection);
    let requestIsValid = Boolean(this._wordRange && this._wordRange.equalsRange(currentWordRange));
    for (let i = 0, len = decorations.length; !requestIsValid && i < len; i++) {
      const range = decorations.getRange(i);
      if (range && range.startLineNumber === lineNumber) {
        if (range.startColumn <= startColumn && range.endColumn >= endColumn) {
          requestIsValid = true;
        }
      }
    }
    return requestIsValid;
  }
  cancel() {
    this.result.cancel();
  }
}
class SemanticOccurenceAtPositionRequest extends OccurenceAtPositionRequest {
  constructor(model, selection, wordSeparators, providers) {
    super(model, selection, wordSeparators);
    this._providers = providers;
  }
  _compute(model, selection, wordSeparators, token) {
    return getOccurrencesAtPosition(this._providers, model, selection.getPosition(), token).then((value) => {
      if (!value) {
        return new ResourceMap();
      }
      return value;
    });
  }
}
class MultiModelOccurenceRequest extends OccurenceAtPositionRequest {
  constructor(model, selection, wordSeparators, providers, otherModels) {
    super(model, selection, wordSeparators);
    this._providers = providers;
    this._otherModels = otherModels;
  }
  _compute(model, selection, wordSeparators, token) {
    return getOccurrencesAcrossMultipleModels(this._providers, model, selection.getPosition(), token, this._otherModels).then((value) => {
      if (!value) {
        return new ResourceMap();
      }
      return value;
    });
  }
}
function computeOccurencesAtPosition(registry, model, selection, wordSeparators) {
  return new SemanticOccurenceAtPositionRequest(model, selection, wordSeparators, registry);
}
function computeOccurencesMultiModel(registry, model, selection, wordSeparators, otherModels) {
  return new MultiModelOccurenceRequest(model, selection, wordSeparators, registry, otherModels);
}
registerModelAndPositionCommand("_executeDocumentHighlights", async (accessor, model, position) => {
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const map = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, position, CancellationToken.None);
  return map?.get(model.uri);
});
let WordHighlighter = class {
  constructor(editor, providers, multiProviders, contextKeyService, textModelService, codeEditorService, configurationService, logService) {
    this.toUnhook = new DisposableStore();
    this.workerRequestTokenId = 0;
    this.workerRequestCompleted = false;
    this.workerRequestValue = new ResourceMap();
    this.lastCursorPositionChangeTime = 0;
    this.renderDecorationsTimer = void 0;
    this.runDelayer = this.toUnhook.add(new Delayer(50));
    this.editor = editor;
    this.providers = providers;
    this.multiDocumentProviders = multiProviders;
    this.codeEditorService = codeEditorService;
    this.textModelService = textModelService;
    this.configurationService = configurationService;
    this.logService = logService;
    this._hasWordHighlights = ctxHasWordHighlights.bindTo(contextKeyService);
    this._ignorePositionChangeEvent = false;
    this.occurrencesHighlightEnablement = this.editor.getOption(EditorOption.occurrencesHighlight);
    this.occurrencesHighlightDelay = this.configurationService.getValue("editor.occurrencesHighlightDelay");
    this.model = this.editor.getModel();
    this.toUnhook.add(editor.onDidChangeCursorPosition((e) => {
      if (this._ignorePositionChangeEvent) {
        return;
      }
      if (this.occurrencesHighlightEnablement === "off") {
        return;
      }
      this.runDelayer.trigger(() => {
        this._onPositionChanged(e);
      }).catch(onUnexpectedError);
    }));
    this.toUnhook.add(editor.onDidFocusEditorText((e) => {
      if (this.occurrencesHighlightEnablement === "off") {
        return;
      }
      if (!this.workerRequest) {
        this.runDelayer.trigger(() => {
          this._run();
        }).catch(onUnexpectedError);
      }
    }));
    this.toUnhook.add(editor.onDidChangeModelContent((e) => {
      if (!matchesScheme(this.model.uri, "output")) {
        this._stopAll();
      }
    }));
    this.toUnhook.add(editor.onDidChangeModel((e) => {
      if (!e.newModelUrl && e.oldModelUrl) {
        this._stopSingular();
      } else if (WordHighlighter.query) {
        this._run();
      }
    }));
    this.toUnhook.add(editor.onDidChangeConfiguration((e) => {
      const newEnablement = this.editor.getOption(EditorOption.occurrencesHighlight);
      if (this.occurrencesHighlightEnablement !== newEnablement) {
        this.occurrencesHighlightEnablement = newEnablement;
        switch (newEnablement) {
          case "off":
            this._stopAll();
            break;
          case "singleFile":
            this._stopAll(WordHighlighter.query?.modelInfo?.modelURI);
            break;
          case "multiFile":
            if (WordHighlighter.query) {
              this._run(true);
            }
            break;
          default:
            console.warn("Unknown occurrencesHighlight setting value:", newEnablement);
            break;
        }
      }
    }));
    this.toUnhook.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.occurrencesHighlightDelay")) {
        const newDelay = configurationService.getValue("editor.occurrencesHighlightDelay");
        if (this.occurrencesHighlightDelay !== newDelay) {
          this.occurrencesHighlightDelay = newDelay;
        }
      }
    }));
    this.toUnhook.add(editor.onDidBlurEditorWidget(() => {
      const activeEditor = this.codeEditorService.getFocusedCodeEditor();
      if (!activeEditor) {
        this._stopAll();
      } else if (activeEditor.getModel()?.uri.scheme === Schemas.vscodeNotebookCell && this.editor.getModel()?.uri.scheme !== Schemas.vscodeNotebookCell) {
        this._stopAll();
      }
    }));
    this.decorations = this.editor.createDecorationsCollection();
    this.workerRequestTokenId = 0;
    this.workerRequest = null;
    this.workerRequestCompleted = false;
    this.lastCursorPositionChangeTime = 0;
    this.renderDecorationsTimer = void 0;
    if (WordHighlighter.query) {
      this._run();
    }
  }
  hasDecorations() {
    return this.decorations.length > 0;
  }
  restore(delay) {
    if (this.occurrencesHighlightEnablement === "off") {
      return;
    }
    this.runDelayer.cancel();
    this.runDelayer.trigger(() => {
      this._run(false, delay);
    }).catch(onUnexpectedError);
  }
  trigger() {
    this.runDelayer.cancel();
    this._run(false, 0);
  }
  stop() {
    if (this.occurrencesHighlightEnablement === "off") {
      return;
    }
    this._stopAll();
  }
  _getSortedHighlights() {
    return this.decorations.getRanges().sort(Range.compareRangesUsingStarts);
  }
  moveNext() {
    const highlights = this._getSortedHighlights();
    const index = highlights.findIndex((range) => range.containsPosition(this.editor.getPosition()));
    const newIndex = (index + 1) % highlights.length;
    const dest = highlights[newIndex];
    try {
      this._ignorePositionChangeEvent = true;
      this.editor.setPosition(dest.getStartPosition());
      this.editor.revealRangeInCenterIfOutsideViewport(dest);
      const word = this._getWord();
      if (word) {
        const lineContent = this.editor.getModel().getLineContent(dest.startLineNumber);
        alert(`${lineContent}, ${newIndex + 1} of ${highlights.length} for '${word.word}'`);
      }
    } finally {
      this._ignorePositionChangeEvent = false;
    }
  }
  moveBack() {
    const highlights = this._getSortedHighlights();
    const index = highlights.findIndex((range) => range.containsPosition(this.editor.getPosition()));
    const newIndex = (index - 1 + highlights.length) % highlights.length;
    const dest = highlights[newIndex];
    try {
      this._ignorePositionChangeEvent = true;
      this.editor.setPosition(dest.getStartPosition());
      this.editor.revealRangeInCenterIfOutsideViewport(dest);
      const word = this._getWord();
      if (word) {
        const lineContent = this.editor.getModel().getLineContent(dest.startLineNumber);
        alert(`${lineContent}, ${newIndex + 1} of ${highlights.length} for '${word.word}'`);
      }
    } finally {
      this._ignorePositionChangeEvent = false;
    }
  }
  _removeSingleDecorations() {
    if (!this.editor.hasModel()) {
      return;
    }
    const currentDecorationIDs = WordHighlighter.storedDecorationIDs.get(this.editor.getModel().uri);
    if (!currentDecorationIDs) {
      return;
    }
    this.editor.removeDecorations(currentDecorationIDs);
    WordHighlighter.storedDecorationIDs.delete(this.editor.getModel().uri);
    if (this.decorations.length > 0) {
      this.decorations.clear();
      this._hasWordHighlights.set(false);
    }
  }
  _removeAllDecorations(preservedModel) {
    const currentEditors = this.codeEditorService.listCodeEditors();
    const deleteURI = [];
    for (const editor of currentEditors) {
      if (!editor.hasModel() || isEqual(editor.getModel().uri, preservedModel)) {
        continue;
      }
      const currentDecorationIDs = WordHighlighter.storedDecorationIDs.get(editor.getModel().uri);
      if (!currentDecorationIDs) {
        continue;
      }
      editor.removeDecorations(currentDecorationIDs);
      deleteURI.push(editor.getModel().uri);
      const editorHighlighterContrib = WordHighlighterContribution.get(editor);
      if (!editorHighlighterContrib?.wordHighlighter) {
        continue;
      }
      if (editorHighlighterContrib.wordHighlighter.decorations.length > 0) {
        editorHighlighterContrib.wordHighlighter.decorations.clear();
        editorHighlighterContrib.wordHighlighter.workerRequest = null;
        editorHighlighterContrib.wordHighlighter._hasWordHighlights.set(false);
      }
    }
    for (const uri of deleteURI) {
      WordHighlighter.storedDecorationIDs.delete(uri);
    }
  }
  _stopSingular() {
    this._removeSingleDecorations();
    if (this.editor.hasTextFocus()) {
      if (this.editor.getModel()?.uri.scheme !== Schemas.vscodeNotebookCell && WordHighlighter.query?.modelInfo?.modelURI.scheme !== Schemas.vscodeNotebookCell) {
        WordHighlighter.query = null;
        this._run();
      } else {
        if (WordHighlighter.query?.modelInfo) {
          WordHighlighter.query.modelInfo = null;
        }
      }
    }
    if (this.renderDecorationsTimer !== void 0) {
      clearTimeout(this.renderDecorationsTimer);
      this.renderDecorationsTimer = void 0;
    }
    if (this.workerRequest !== null) {
      this.workerRequest.cancel();
      this.workerRequest = null;
    }
    if (!this.workerRequestCompleted) {
      this.workerRequestTokenId++;
      this.workerRequestCompleted = true;
    }
  }
  _stopAll(preservedModel) {
    this._removeAllDecorations(preservedModel);
    if (this.renderDecorationsTimer !== void 0) {
      clearTimeout(this.renderDecorationsTimer);
      this.renderDecorationsTimer = void 0;
    }
    if (this.workerRequest !== null) {
      this.workerRequest.cancel();
      this.workerRequest = null;
    }
    if (!this.workerRequestCompleted) {
      this.workerRequestTokenId++;
      this.workerRequestCompleted = true;
    }
  }
  _onPositionChanged(e) {
    if (this.occurrencesHighlightEnablement === "off") {
      this._stopAll();
      return;
    }
    if (e.source !== "api" && e.reason !== CursorChangeReason.Explicit) {
      this._stopAll();
      return;
    }
    this._run();
  }
  _getWord() {
    const editorSelection = this.editor.getSelection();
    const lineNumber = editorSelection.startLineNumber;
    const startColumn = editorSelection.startColumn;
    if (this.model.isDisposed()) {
      return null;
    }
    return this.model.getWordAtPosition({
      lineNumber,
      column: startColumn
    });
  }
  getOtherModelsToHighlight(model) {
    if (!model) {
      return [];
    }
    const isNotebookEditor = model.uri.scheme === Schemas.vscodeNotebookCell;
    if (isNotebookEditor) {
      const currentModels2 = [];
      const currentEditors2 = this.codeEditorService.listCodeEditors();
      for (const editor of currentEditors2) {
        const tempModel = editor.getModel();
        if (tempModel && tempModel !== model && tempModel.uri.scheme === Schemas.vscodeNotebookCell) {
          currentModels2.push(tempModel);
        }
      }
      return currentModels2;
    }
    const currentModels = [];
    const currentEditors = this.codeEditorService.listCodeEditors();
    for (const editor of currentEditors) {
      if (!isDiffEditor(editor)) {
        continue;
      }
      const diffModel = editor.getModel();
      if (!diffModel) {
        continue;
      }
      if (model === diffModel.modified) {
        currentModels.push(diffModel.modified);
      }
    }
    if (currentModels.length) {
      return currentModels;
    }
    if (this.occurrencesHighlightEnablement === "singleFile") {
      return [];
    }
    for (const editor of currentEditors) {
      const tempModel = editor.getModel();
      const isValidModel = tempModel && tempModel !== model;
      if (isValidModel) {
        currentModels.push(tempModel);
      }
    }
    return currentModels;
  }
  async _run(multiFileConfigChange, delay) {
    const hasTextFocus = this.editor.hasTextFocus();
    if (!hasTextFocus) {
      if (!WordHighlighter.query) {
        this._stopAll();
        return;
      }
    } else {
      const editorSelection = this.editor.getSelection();
      if (!editorSelection || editorSelection.startLineNumber !== editorSelection.endLineNumber) {
        WordHighlighter.query = null;
        this._stopAll();
        return;
      }
      const startColumn = editorSelection.startColumn;
      const endColumn = editorSelection.endColumn;
      const word = this._getWord();
      if (!word || word.startColumn > startColumn || word.endColumn < endColumn) {
        WordHighlighter.query = null;
        this._stopAll();
        return;
      }
      WordHighlighter.query = {
        modelInfo: {
          modelURI: this.model.uri,
          selection: editorSelection
        }
      };
    }
    this.lastCursorPositionChangeTime = (/* @__PURE__ */ new Date()).getTime();
    if (isEqual(this.editor.getModel().uri, WordHighlighter.query.modelInfo?.modelURI)) {
      if (!multiFileConfigChange) {
        const currentModelDecorationRanges = this.decorations.getRanges();
        for (const storedRange of currentModelDecorationRanges) {
          if (storedRange.containsPosition(this.editor.getPosition())) {
            return;
          }
        }
      }
      this._stopAll(multiFileConfigChange ? this.model.uri : void 0);
      const myRequestId = ++this.workerRequestTokenId;
      this.workerRequestCompleted = false;
      const otherModelsToHighlight = this.getOtherModelsToHighlight(this.editor.getModel());
      if (!WordHighlighter.query || !WordHighlighter.query.modelInfo) {
        return;
      }
      const queryModelRef = await this.textModelService.createModelReference(WordHighlighter.query.modelInfo.modelURI);
      try {
        this.workerRequest = this.computeWithModel(queryModelRef.object.textEditorModel, WordHighlighter.query.modelInfo.selection, otherModelsToHighlight);
        this.workerRequest?.result.then((data) => {
          if (myRequestId === this.workerRequestTokenId) {
            this.workerRequestCompleted = true;
            this.workerRequestValue = data || [];
            this._beginRenderDecorations(delay ?? this.occurrencesHighlightDelay);
          }
        }, onUnexpectedError);
      } catch (e) {
        this.logService.error("Unexpected error during occurrence request. Log: ", e);
      } finally {
        queryModelRef.dispose();
      }
    } else if (this.model.uri.scheme === Schemas.vscodeNotebookCell) {
      const myRequestId = ++this.workerRequestTokenId;
      this.workerRequestCompleted = false;
      if (!WordHighlighter.query || !WordHighlighter.query.modelInfo) {
        return;
      }
      const queryModelRef = await this.textModelService.createModelReference(WordHighlighter.query.modelInfo.modelURI);
      try {
        this.workerRequest = this.computeWithModel(queryModelRef.object.textEditorModel, WordHighlighter.query.modelInfo.selection, [this.model]);
        this.workerRequest?.result.then((data) => {
          if (myRequestId === this.workerRequestTokenId) {
            this.workerRequestCompleted = true;
            this.workerRequestValue = data || [];
            this._beginRenderDecorations(delay ?? this.occurrencesHighlightDelay);
          }
        }, onUnexpectedError);
      } catch (e) {
        this.logService.error("Unexpected error during occurrence request. Log: ", e);
      } finally {
        queryModelRef.dispose();
      }
    }
  }
  computeWithModel(model, selection, otherModels) {
    if (!otherModels.length) {
      return computeOccurencesAtPosition(this.providers, model, selection, this.editor.getOption(EditorOption.wordSeparators));
    } else {
      return computeOccurencesMultiModel(this.multiDocumentProviders, model, selection, this.editor.getOption(EditorOption.wordSeparators), otherModels);
    }
  }
  _beginRenderDecorations(delay) {
    const currentTime = (/* @__PURE__ */ new Date()).getTime();
    const minimumRenderTime = this.lastCursorPositionChangeTime + delay;
    if (currentTime >= minimumRenderTime) {
      this.renderDecorationsTimer = void 0;
      this.renderDecorations();
    } else {
      this.renderDecorationsTimer = setTimeout(() => {
        this.renderDecorations();
      }, minimumRenderTime - currentTime);
    }
  }
  renderDecorations() {
    this.renderDecorationsTimer = void 0;
    const currentEditors = this.codeEditorService.listCodeEditors();
    for (const editor of currentEditors) {
      const editorHighlighterContrib = WordHighlighterContribution.get(editor);
      if (!editorHighlighterContrib) {
        continue;
      }
      const newDecorations = [];
      const uri = editor.getModel()?.uri;
      if (uri && this.workerRequestValue.has(uri)) {
        const oldDecorationIDs = WordHighlighter.storedDecorationIDs.get(uri);
        const newDocumentHighlights = this.workerRequestValue.get(uri);
        if (newDocumentHighlights) {
          for (const highlight of newDocumentHighlights) {
            if (!highlight.range) {
              continue;
            }
            newDecorations.push({
              range: highlight.range,
              options: getHighlightDecorationOptions(highlight.kind)
            });
          }
        }
        let newDecorationIDs = [];
        editor.changeDecorations((changeAccessor) => {
          newDecorationIDs = changeAccessor.deltaDecorations(oldDecorationIDs ?? [], newDecorations);
        });
        WordHighlighter.storedDecorationIDs = WordHighlighter.storedDecorationIDs.set(uri, newDecorationIDs);
        if (newDecorations.length > 0) {
          editorHighlighterContrib.wordHighlighter?.decorations.set(newDecorations);
          editorHighlighterContrib.wordHighlighter?._hasWordHighlights.set(true);
        }
      }
    }
    this.workerRequest = null;
  }
  dispose() {
    this._stopSingular();
    this.toUnhook.dispose();
  }
};
WordHighlighter.storedDecorationIDs = new ResourceMap();
WordHighlighter.query = null;
WordHighlighter = __decorateClass([
  __decorateParam(4, ITextModelService),
  __decorateParam(5, ICodeEditorService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILogService)
], WordHighlighter);
let WordHighlighterContribution = class extends Disposable {
  static get(editor) {
    return editor.getContribution(WordHighlighterContribution.ID);
  }
  constructor(editor, contextKeyService, languageFeaturesService, codeEditorService, textModelService, configurationService, logService) {
    super();
    this._wordHighlighter = null;
    const createWordHighlighterIfPossible = () => {
      if (editor.hasModel() && !editor.getModel().isTooLargeForTokenization() && editor.getModel().uri.scheme !== Schemas.accessibleView) {
        this._wordHighlighter = new WordHighlighter(editor, languageFeaturesService.documentHighlightProvider, languageFeaturesService.multiDocumentHighlightProvider, contextKeyService, textModelService, codeEditorService, configurationService, logService);
      }
    };
    this._register(editor.onDidChangeModel((e) => {
      if (this._wordHighlighter) {
        if (!e.newModelUrl && e.oldModelUrl?.scheme !== Schemas.vscodeNotebookCell) {
          this.wordHighlighter?.stop();
        }
        this._wordHighlighter.dispose();
        this._wordHighlighter = null;
      }
      createWordHighlighterIfPossible();
    }));
    createWordHighlighterIfPossible();
  }
  get wordHighlighter() {
    return this._wordHighlighter;
  }
  saveViewState() {
    if (this._wordHighlighter && this._wordHighlighter.hasDecorations()) {
      return true;
    }
    return false;
  }
  moveNext() {
    this._wordHighlighter?.moveNext();
  }
  moveBack() {
    this._wordHighlighter?.moveBack();
  }
  restoreViewState(state) {
    if (this._wordHighlighter && state) {
      this._wordHighlighter.restore(250);
    }
  }
  stopHighlighting() {
    this._wordHighlighter?.stop();
  }
  dispose() {
    if (this._wordHighlighter) {
      this._wordHighlighter.dispose();
      this._wordHighlighter = null;
    }
    super.dispose();
  }
};
WordHighlighterContribution.ID = "editor.contrib.wordHighlighter";
WordHighlighterContribution = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, ITextModelService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ILogService)
], WordHighlighterContribution);
class WordHighlightNavigationAction extends EditorAction {
  constructor(next, opts) {
    super(opts);
    this._isNext = next;
  }
  run(accessor, editor) {
    const controller = WordHighlighterContribution.get(editor);
    if (!controller) {
      return;
    }
    if (this._isNext) {
      controller.moveNext();
    } else {
      controller.moveBack();
    }
  }
}
class NextWordHighlightAction extends WordHighlightNavigationAction {
  constructor() {
    super(true, {
      id: "editor.action.wordHighlight.next",
      label: nls.localize2("wordHighlight.next.label", "Go to Next Symbol Highlight"),
      precondition: ctxHasWordHighlights,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyCode.F7,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class PrevWordHighlightAction extends WordHighlightNavigationAction {
  constructor() {
    super(false, {
      id: "editor.action.wordHighlight.prev",
      label: nls.localize2("wordHighlight.previous.label", "Go to Previous Symbol Highlight"),
      precondition: ctxHasWordHighlights,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.Shift | KeyCode.F7,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class TriggerWordHighlightAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.wordHighlight.trigger",
      label: nls.localize2("wordHighlight.trigger.label", "Trigger Symbol Highlight"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: 0,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor) {
    const controller = WordHighlighterContribution.get(editor);
    if (!controller) {
      return;
    }
    controller.restoreViewState(true);
  }
}
registerEditorContribution(WordHighlighterContribution.ID, WordHighlighterContribution, EditorContributionInstantiation.Eager);
registerEditorAction(NextWordHighlightAction);
registerEditorAction(PrevWordHighlightAction);
registerEditorAction(TriggerWordHighlightAction);
registerEditorFeature(TextualMultiDocumentHighlightFeature);
export {
  WordHighlighterContribution,
  getOccurrencesAcrossMultipleModels,
  getOccurrencesAtPosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHdvcmRIaWdobGlnaHRlclxcYnJvd3Nlclxcd29yZEhpZ2hsaWdodGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBEZWxheWVyLCBmaXJzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yLCBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzU2NoZW1lLCBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZUNvZGVFZGl0b3IsIElDb2RlRWRpdG9yLCBpc0RpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCBJQWN0aW9uT3B0aW9ucywgcmVnaXN0ZXJFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCByZWdpc3Rlck1vZGVsQW5kUG9zaXRpb25Db21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVdvcmRBdFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDaGFuZ2VSZWFzb24sIElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3IsIElFZGl0b3JDb250cmlidXRpb24sIElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyRWRpdG9yRmVhdHVyZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudEhpZ2hsaWdodCwgRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciwgTXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBzY29yZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZVNlbGVjdG9yLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSVRleHRNb2RlbCwgc2hvdWxkU3luY2hyb25pemVNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0SGlnaGxpZ2h0RGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuL2hpZ2hsaWdodERlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IFRleHR1YWxNdWx0aURvY3VtZW50SGlnaGxpZ2h0RmVhdHVyZSB9IGZyb20gJy4vdGV4dHVhbEhpZ2hsaWdodFByb3ZpZGVyLmpzJztcblxuY29uc3QgY3R4SGFzV29yZEhpZ2hsaWdodHMgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaGFzV29yZEhpZ2hsaWdodHMnLCBmYWxzZSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRPY2N1cnJlbmNlc0F0UG9zaXRpb24ocmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PERvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXI+LCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlc291cmNlTWFwPERvY3VtZW50SGlnaGxpZ2h0W10+IHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBvcmRlcmVkQnlTY29yZSA9IHJlZ2lzdHJ5Lm9yZGVyZWQobW9kZWwpO1xuXG5cdC8vIGluIG9yZGVyIG9mIHNjb3JlIGFzayB0aGUgb2NjdXJyZW5jZXMgcHJvdmlkZXJcblx0Ly8gdW50aWwgc29tZW9uZSByZXNwb25zZSB3aXRoIGEgZ29vZCByZXN1bHRcblx0Ly8gKGdvb2QgPSBub24gdW5kZWZpbmVkIGFuZCBub24gbnVsbCB2YWx1ZSlcblx0Ly8gKHJlc3VsdCBvZiBzaXplID09IDAgaXMgdmFsaWQsIG5vIGhpZ2hsaWdodHMgaXMgYSB2YWxpZC9leHBlY3RlZCByZXN1bHQgLS0gbm90IGEgc2lnbmFsIHRvIGZhbGwgYmFjayB0byBvdGhlciBwcm92aWRlcnMpXG5cdHJldHVybiBmaXJzdDxEb2N1bWVudEhpZ2hsaWdodFtdIHwgbnVsbCB8IHVuZGVmaW5lZD4ob3JkZXJlZEJ5U2NvcmUubWFwKHByb3ZpZGVyID0+ICgpID0+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyLnByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMobW9kZWwsIHBvc2l0aW9uLCB0b2tlbikpXG5cdFx0XHQudGhlbih1bmRlZmluZWQsIG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IpO1xuXHR9KSwgKHJlc3VsdCk6IHJlc3VsdCBpcyBEb2N1bWVudEhpZ2hsaWdodFtdID0+IHJlc3VsdCAhPT0gdW5kZWZpbmVkICYmIHJlc3VsdCAhPT0gbnVsbCkudGhlbihyZXN1bHQgPT4ge1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdGNvbnN0IG1hcCA9IG5ldyBSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPigpO1xuXHRcdFx0bWFwLnNldChtb2RlbC51cmksIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gbWFwO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFJlc291cmNlTWFwPERvY3VtZW50SGlnaGxpZ2h0W10+KCk7XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0T2NjdXJyZW5jZXNBY3Jvc3NNdWx0aXBsZU1vZGVscyhyZWdpc3RyeTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8TXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPiwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBvdGhlck1vZGVsczogSVRleHRNb2RlbFtdKTogUHJvbWlzZTxSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPiB8IG51bGwgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3Qgb3JkZXJlZEJ5U2NvcmUgPSByZWdpc3RyeS5vcmRlcmVkKG1vZGVsKTtcblxuXHQvLyBpbiBvcmRlciBvZiBzY29yZSBhc2sgdGhlIG9jY3VycmVuY2VzIHByb3ZpZGVyXG5cdC8vIHVudGlsIHNvbWVvbmUgcmVzcG9uc2Ugd2l0aCBhIGdvb2QgcmVzdWx0XG5cdC8vIChnb29kID0gbm9uIHVuZGVmaW5lZCBhbmQgbm9uIG51bGwgUmVzb3VyY2VNYXApXG5cdC8vIChyZXN1bHQgb2Ygc2l6ZSA9PSAwIGlzIHZhbGlkLCBubyBoaWdobGlnaHRzIGlzIGEgdmFsaWQvZXhwZWN0ZWQgcmVzdWx0IC0tIG5vdCBhIHNpZ25hbCB0byBmYWxsIGJhY2sgdG8gb3RoZXIgcHJvdmlkZXJzKVxuXHRyZXR1cm4gZmlyc3Q8UmVzb3VyY2VNYXA8RG9jdW1lbnRIaWdobGlnaHRbXT4gfCBudWxsIHwgdW5kZWZpbmVkPihvcmRlcmVkQnlTY29yZS5tYXAocHJvdmlkZXIgPT4gKCkgPT4ge1xuXHRcdGNvbnN0IGZpbHRlcmVkTW9kZWxzID0gb3RoZXJNb2RlbHMuZmlsdGVyKG90aGVyTW9kZWwgPT4ge1xuXHRcdFx0cmV0dXJuIHNob3VsZFN5bmNocm9uaXplTW9kZWwob3RoZXJNb2RlbCk7XG5cdFx0fSkuZmlsdGVyKG90aGVyTW9kZWwgPT4ge1xuXHRcdFx0cmV0dXJuIHNjb3JlKHByb3ZpZGVyLnNlbGVjdG9yLCBvdGhlck1vZGVsLnVyaSwgb3RoZXJNb2RlbC5nZXRMYW5ndWFnZUlkKCksIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSA+IDA7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShwcm92aWRlci5wcm92aWRlTXVsdGlEb2N1bWVudEhpZ2hsaWdodHMobW9kZWwsIHBvc2l0aW9uLCBmaWx0ZXJlZE1vZGVscywgdG9rZW4pKVxuXHRcdFx0LnRoZW4odW5kZWZpbmVkLCBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKTtcblx0fSksIChyZXN1bHQpOiByZXN1bHQgaXMgUmVzb3VyY2VNYXA8RG9jdW1lbnRIaWdobGlnaHRbXT4gPT4gcmVzdWx0ICE9PSB1bmRlZmluZWQgJiYgcmVzdWx0ICE9PSBudWxsKTtcbn1cblxuaW50ZXJmYWNlIElPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdCB7XG5cdHJlYWRvbmx5IHJlc3VsdDogUHJvbWlzZTxSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPj47XG5cdGlzVmFsaWQobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBkZWNvcmF0aW9uczogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbik6IGJvb2xlYW47XG5cdGNhbmNlbCgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSVdvcmRIaWdobGlnaHRlclF1ZXJ5IHtcblx0bW9kZWxJbmZvOiB7XG5cdFx0bW9kZWxVUkk6IFVSSTtcblx0XHRzZWxlY3Rpb246IFNlbGVjdGlvbjtcblx0fSB8IG51bGw7XG59XG5cbmFic3RyYWN0IGNsYXNzIE9jY3VyZW5jZUF0UG9zaXRpb25SZXF1ZXN0IGltcGxlbWVudHMgSU9jY3VyZW5jZUF0UG9zaXRpb25SZXF1ZXN0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JkUmFuZ2U6IFJhbmdlIHwgbnVsbDtcblx0cHJpdmF0ZSBfcmVzdWx0OiBDYW5jZWxhYmxlUHJvbWlzZTxSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPj4gfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJVGV4dE1vZGVsLCBwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3Rpb246IFNlbGVjdGlvbiwgcHJpdmF0ZSByZWFkb25seSBfd29yZFNlcGFyYXRvcnM6IHN0cmluZykge1xuXHRcdHRoaXMuX3dvcmRSYW5nZSA9IHRoaXMuX2dldEN1cnJlbnRXb3JkUmFuZ2UoX21vZGVsLCBfc2VsZWN0aW9uKTtcblx0XHR0aGlzLl9yZXN1bHQgPSBudWxsO1xuXHR9XG5cblx0Z2V0IHJlc3VsdCgpIHtcblx0XHRpZiAoIXRoaXMuX3Jlc3VsdCkge1xuXHRcdFx0dGhpcy5fcmVzdWx0ID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4gdGhpcy5fY29tcHV0ZSh0aGlzLl9tb2RlbCwgdGhpcy5fc2VsZWN0aW9uLCB0aGlzLl93b3JkU2VwYXJhdG9ycywgdG9rZW4pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfY29tcHV0ZShtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVzb3VyY2VNYXA8RG9jdW1lbnRIaWdobGlnaHRbXT4+O1xuXG5cdHByaXZhdGUgX2dldEN1cnJlbnRXb3JkUmFuZ2UobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uKTogUmFuZ2UgfCBudWxsIHtcblx0XHRjb25zdCB3b3JkID0gbW9kZWwuZ2V0V29yZEF0UG9zaXRpb24oc2VsZWN0aW9uLmdldFBvc2l0aW9uKCkpO1xuXHRcdGlmICh3b3JkKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHdvcmQuc3RhcnRDb2x1bW4sIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHdvcmQuZW5kQ29sdW1uKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgaXNWYWxpZChtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGRlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uKTogYm9vbGVhbiB7XG5cblx0XHRjb25zdCBsaW5lTnVtYmVyID0gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBzdGFydENvbHVtbiA9IHNlbGVjdGlvbi5zdGFydENvbHVtbjtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSBzZWxlY3Rpb24uZW5kQ29sdW1uO1xuXHRcdGNvbnN0IGN1cnJlbnRXb3JkUmFuZ2UgPSB0aGlzLl9nZXRDdXJyZW50V29yZFJhbmdlKG1vZGVsLCBzZWxlY3Rpb24pO1xuXG5cdFx0bGV0IHJlcXVlc3RJc1ZhbGlkID0gQm9vbGVhbih0aGlzLl93b3JkUmFuZ2UgJiYgdGhpcy5fd29yZFJhbmdlLmVxdWFsc1JhbmdlKGN1cnJlbnRXb3JkUmFuZ2UpKTtcblxuXHRcdC8vIEV2ZW4gaWYgd2UgYXJlIG9uIGEgZGlmZmVyZW50IHdvcmQsIGlmIHRoYXQgd29yZCBpcyBpbiB0aGUgZGVjb3JhdGlvbnMgcmFuZ2VzLCB0aGUgcmVxdWVzdCBpcyBzdGlsbCB2YWxpZFxuXHRcdC8vIChTYW1lIHN5bWJvbClcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZGVjb3JhdGlvbnMubGVuZ3RoOyAhcmVxdWVzdElzVmFsaWQgJiYgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IGRlY29yYXRpb25zLmdldFJhbmdlKGkpO1xuXHRcdFx0aWYgKHJhbmdlICYmIHJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gbGluZU51bWJlcikge1xuXHRcdFx0XHRpZiAocmFuZ2Uuc3RhcnRDb2x1bW4gPD0gc3RhcnRDb2x1bW4gJiYgcmFuZ2UuZW5kQ29sdW1uID49IGVuZENvbHVtbikge1xuXHRcdFx0XHRcdHJlcXVlc3RJc1ZhbGlkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXF1ZXN0SXNWYWxpZDtcblx0fVxuXG5cdHB1YmxpYyBjYW5jZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXN1bHQuY2FuY2VsKCk7XG5cdH1cbn1cblxuY2xhc3MgU2VtYW50aWNPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdCBleHRlbmRzIE9jY3VyZW5jZUF0UG9zaXRpb25SZXF1ZXN0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcnM6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PERvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXI+O1xuXG5cdGNvbnN0cnVjdG9yKG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgd29yZFNlcGFyYXRvcnM6IHN0cmluZywgcHJvdmlkZXJzOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPikge1xuXHRcdHN1cGVyKG1vZGVsLCBzZWxlY3Rpb24sIHdvcmRTZXBhcmF0b3JzKTtcblx0XHR0aGlzLl9wcm92aWRlcnMgPSBwcm92aWRlcnM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NvbXB1dGUobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlc291cmNlTWFwPERvY3VtZW50SGlnaGxpZ2h0W10+PiB7XG5cdFx0cmV0dXJuIGdldE9jY3VycmVuY2VzQXRQb3NpdGlvbih0aGlzLl9wcm92aWRlcnMsIG1vZGVsLCBzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKSwgdG9rZW4pLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJlc291cmNlTWFwPERvY3VtZW50SGlnaGxpZ2h0W10+KCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgTXVsdGlNb2RlbE9jY3VyZW5jZVJlcXVlc3QgZXh0ZW5kcyBPY2N1cmVuY2VBdFBvc2l0aW9uUmVxdWVzdCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyczogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8TXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb3RoZXJNb2RlbHM6IElUZXh0TW9kZWxbXTtcblxuXHRjb25zdHJ1Y3Rvcihtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcsIHByb3ZpZGVyczogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8TXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPiwgb3RoZXJNb2RlbHM6IElUZXh0TW9kZWxbXSkge1xuXHRcdHN1cGVyKG1vZGVsLCBzZWxlY3Rpb24sIHdvcmRTZXBhcmF0b3JzKTtcblx0XHR0aGlzLl9wcm92aWRlcnMgPSBwcm92aWRlcnM7XG5cdFx0dGhpcy5fb3RoZXJNb2RlbHMgPSBvdGhlck1vZGVscztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfY29tcHV0ZShtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVzb3VyY2VNYXA8RG9jdW1lbnRIaWdobGlnaHRbXT4+IHtcblx0XHRyZXR1cm4gZ2V0T2NjdXJyZW5jZXNBY3Jvc3NNdWx0aXBsZU1vZGVscyh0aGlzLl9wcm92aWRlcnMsIG1vZGVsLCBzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKSwgdG9rZW4sIHRoaXMuX290aGVyTW9kZWxzKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPigpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0pO1xuXHR9XG59XG5cblxuZnVuY3Rpb24gY29tcHV0ZU9jY3VyZW5jZXNBdFBvc2l0aW9uKHJlZ2lzdHJ5OiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nKTogSU9jY3VyZW5jZUF0UG9zaXRpb25SZXF1ZXN0IHtcblx0cmV0dXJuIG5ldyBTZW1hbnRpY09jY3VyZW5jZUF0UG9zaXRpb25SZXF1ZXN0KG1vZGVsLCBzZWxlY3Rpb24sIHdvcmRTZXBhcmF0b3JzLCByZWdpc3RyeSk7XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVPY2N1cmVuY2VzTXVsdGlNb2RlbChyZWdpc3RyeTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8TXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nLCBvdGhlck1vZGVsczogSVRleHRNb2RlbFtdKTogSU9jY3VyZW5jZUF0UG9zaXRpb25SZXF1ZXN0IHtcblx0cmV0dXJuIG5ldyBNdWx0aU1vZGVsT2NjdXJlbmNlUmVxdWVzdChtb2RlbCwgc2VsZWN0aW9uLCB3b3JkU2VwYXJhdG9ycywgcmVnaXN0cnksIG90aGVyTW9kZWxzKTtcbn1cblxucmVnaXN0ZXJNb2RlbEFuZFBvc2l0aW9uQ29tbWFuZCgnX2V4ZWN1dGVEb2N1bWVudEhpZ2hsaWdodHMnLCBhc3luYyAoYWNjZXNzb3IsIG1vZGVsLCBwb3NpdGlvbikgPT4ge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRjb25zdCBtYXAgPSBhd2FpdCBnZXRPY2N1cnJlbmNlc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciwgbW9kZWwsIHBvc2l0aW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0cmV0dXJuIG1hcD8uZ2V0KG1vZGVsLnVyaSk7XG59KTtcblxuY2xhc3MgV29yZEhpZ2hsaWdodGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvdmlkZXJzOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBtdWx0aURvY3VtZW50UHJvdmlkZXJzOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxNdWx0aURvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXI+O1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsOiBJVGV4dE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRvVW5ob29rID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXG5cdHByaXZhdGUgb2NjdXJyZW5jZXNIaWdobGlnaHRFbmFibGVtZW50OiBzdHJpbmc7XG5cdHByaXZhdGUgb2NjdXJyZW5jZXNIaWdobGlnaHREZWxheTogbnVtYmVyO1xuXG5cdHByaXZhdGUgd29ya2VyUmVxdWVzdFRva2VuSWQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgd29ya2VyUmVxdWVzdDogSU9jY3VyZW5jZUF0UG9zaXRpb25SZXF1ZXN0IHwgbnVsbDtcblx0cHJpdmF0ZSB3b3JrZXJSZXF1ZXN0Q29tcGxldGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgd29ya2VyUmVxdWVzdFZhbHVlOiBSZXNvdXJjZU1hcDxEb2N1bWVudEhpZ2hsaWdodFtdPiA9IG5ldyBSZXNvdXJjZU1hcCgpO1xuXG5cdHByaXZhdGUgbGFzdEN1cnNvclBvc2l0aW9uQ2hhbmdlVGltZTogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSByZW5kZXJEZWNvcmF0aW9uc1RpbWVyOiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc1dvcmRIaWdobGlnaHRzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfaWdub3JlUG9zaXRpb25DaGFuZ2VFdmVudDogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJ1bkRlbGF5ZXI6IERlbGF5ZXI8dm9pZD4gPSB0aGlzLnRvVW5ob29rLmFkZChuZXcgRGVsYXllcjx2b2lkPig1MCkpO1xuXG5cdHByaXZhdGUgc3RhdGljIHN0b3JlZERlY29yYXRpb25JRHM6IFJlc291cmNlTWFwPHN0cmluZ1tdPiA9IG5ldyBSZXNvdXJjZU1hcCgpO1xuXHRwcml2YXRlIHN0YXRpYyBxdWVyeTogSVdvcmRIaWdobGlnaHRlclF1ZXJ5IHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0XHRwcm92aWRlcnM6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PERvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXI+LFxuXHRcdG11bHRpUHJvdmlkZXJzOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxNdWx0aURvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXI+LFxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmVkaXRvciA9IGVkaXRvcjtcblx0XHR0aGlzLnByb3ZpZGVycyA9IHByb3ZpZGVycztcblx0XHR0aGlzLm11bHRpRG9jdW1lbnRQcm92aWRlcnMgPSBtdWx0aVByb3ZpZGVycztcblxuXHRcdHRoaXMuY29kZUVkaXRvclNlcnZpY2UgPSBjb2RlRWRpdG9yU2VydmljZTtcblx0XHR0aGlzLnRleHRNb2RlbFNlcnZpY2UgPSB0ZXh0TW9kZWxTZXJ2aWNlO1xuXHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UgPSBjb25maWd1cmF0aW9uU2VydmljZTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UgPSBsb2dTZXJ2aWNlO1xuXG5cdFx0dGhpcy5faGFzV29yZEhpZ2hsaWdodHMgPSBjdHhIYXNXb3JkSGlnaGxpZ2h0cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2lnbm9yZVBvc2l0aW9uQ2hhbmdlRXZlbnQgPSBmYWxzZTtcblx0XHR0aGlzLm9jY3VycmVuY2VzSGlnaGxpZ2h0RW5hYmxlbWVudCA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ub2NjdXJyZW5jZXNIaWdobGlnaHQpO1xuXHRcdHRoaXMub2NjdXJyZW5jZXNIaWdobGlnaHREZWxheSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignZWRpdG9yLm9jY3VycmVuY2VzSGlnaGxpZ2h0RGVsYXknKTtcblx0XHR0aGlzLm1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdHRoaXMudG9Vbmhvb2suYWRkKGVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKChlOiBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pZ25vcmVQb3NpdGlvbkNoYW5nZUV2ZW50KSB7XG5cdFx0XHRcdC8vIFdlIGFyZSBjaGFuZ2luZyB0aGUgcG9zaXRpb24gPT4gaWdub3JlIHRoaXMgZXZlbnRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodEVuYWJsZW1lbnQgPT09ICdvZmYnKSB7XG5cdFx0XHRcdC8vIEVhcmx5IGV4aXQgaWYgbm90aGluZyBuZWVkcyB0byBiZSBkb25lIVxuXHRcdFx0XHQvLyBMZWF2ZSBzb21lIGZvcm0gb2YgZWFybHkgZXhpdCBjaGVjayBoZXJlIGlmIHlvdSB3aXNoIHRvIGNvbnRpbnVlIGJlaW5nIGEgY3Vyc29yIHBvc2l0aW9uIGNoYW5nZSBsaXN0ZW5lciA7KVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucnVuRGVsYXllci50cmlnZ2VyKCgpID0+IHsgdGhpcy5fb25Qb3NpdGlvbkNoYW5nZWQoZSk7IH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR9KSk7XG5cdFx0dGhpcy50b1VuaG9vay5hZGQoZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JUZXh0KChlKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodEVuYWJsZW1lbnQgPT09ICdvZmYnKSB7XG5cdFx0XHRcdC8vIEVhcmx5IGV4aXQgaWYgbm90aGluZyBuZWVkcyB0byBiZSBkb25lXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLndvcmtlclJlcXVlc3QpIHtcblx0XHRcdFx0dGhpcy5ydW5EZWxheWVyLnRyaWdnZXIoKCkgPT4geyB0aGlzLl9ydW4oKTsgfSkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvVW5ob29rLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdGlmICghbWF0Y2hlc1NjaGVtZSh0aGlzLm1vZGVsLnVyaSwgJ291dHB1dCcpKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3BBbGwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b1VuaG9vay5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKGUpID0+IHtcblx0XHRcdGlmICghZS5uZXdNb2RlbFVybCAmJiBlLm9sZE1vZGVsVXJsKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3BTaW5ndWxhcigpO1xuXHRcdFx0fSBlbHNlIGlmIChXb3JkSGlnaGxpZ2h0ZXIucXVlcnkpIHtcblx0XHRcdFx0dGhpcy5fcnVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9Vbmhvb2suYWRkKGVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGNvbnN0IG5ld0VuYWJsZW1lbnQgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLm9jY3VycmVuY2VzSGlnaGxpZ2h0KTtcblx0XHRcdGlmICh0aGlzLm9jY3VycmVuY2VzSGlnaGxpZ2h0RW5hYmxlbWVudCAhPT0gbmV3RW5hYmxlbWVudCkge1xuXHRcdFx0XHR0aGlzLm9jY3VycmVuY2VzSGlnaGxpZ2h0RW5hYmxlbWVudCA9IG5ld0VuYWJsZW1lbnQ7XG5cdFx0XHRcdHN3aXRjaCAobmV3RW5hYmxlbWVudCkge1xuXHRcdFx0XHRcdGNhc2UgJ29mZic6XG5cdFx0XHRcdFx0XHR0aGlzLl9zdG9wQWxsKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdzaW5nbGVGaWxlJzpcblx0XHRcdFx0XHRcdHRoaXMuX3N0b3BBbGwoV29yZEhpZ2hsaWdodGVyLnF1ZXJ5Py5tb2RlbEluZm8/Lm1vZGVsVVJJKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ211bHRpRmlsZSc6XG5cdFx0XHRcdFx0XHRpZiAoV29yZEhpZ2hsaWdodGVyLnF1ZXJ5KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3J1bih0cnVlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ1Vua25vd24gb2NjdXJyZW5jZXNIaWdobGlnaHQgc2V0dGluZyB2YWx1ZTonLCBuZXdFbmFibGVtZW50KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9Vbmhvb2suYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLm9jY3VycmVuY2VzSGlnaGxpZ2h0RGVsYXknKSkge1xuXHRcdFx0XHRjb25zdCBuZXdEZWxheSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ2VkaXRvci5vY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5Jyk7XG5cdFx0XHRcdGlmICh0aGlzLm9jY3VycmVuY2VzSGlnaGxpZ2h0RGVsYXkgIT09IG5ld0RlbGF5KSB7XG5cdFx0XHRcdFx0dGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5ID0gbmV3RGVsYXk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b1VuaG9vay5hZGQoZWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHQvLyBsb2dpYyBpcyBhcyBmb2xsb3dzXG5cdFx0XHQvLyAtIGRpZEJsdXIgPT4gYWN0aXZlIG51bGwgPT4gc3RvcGFsbFxuXHRcdFx0Ly8gLSBkaWRCbHVyID0+IGFjdGl2ZSBuYiAgID0+IGlmIHRoaXMuZWRpdG9yIGlzIG5vdGVib29rLCBkbyBub3RoaW5nIChuZXcgY2VsbCwgc28gd2UgZG9uJ3Qgd2FudCB0byBzdG9wQWxsKVxuXHRcdFx0Ly8gICAgICAgICAgICAgIGFjdGl2ZSBuYiAgID0+IGlmIHRoaXMuZWRpdG9yIGlzIE5PVCBuYiwgICBzdG9wQWxsXG5cblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKTtcblx0XHRcdGlmICghYWN0aXZlRWRpdG9yKSB7IC8vIGNsaWNrZWQgaW50byBuYiBjZWxsIGxpc3QsIG91dGxpbmUsIHRlcm1pbmFsLCBldGNcblx0XHRcdFx0dGhpcy5fc3RvcEFsbCgpO1xuXHRcdFx0fSBlbHNlIGlmIChhY3RpdmVFZGl0b3IuZ2V0TW9kZWwoKT8udXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwgJiYgdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKT8udXJpLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHsgLy8gc3dpdGNoZWQgdGFicyBmcm9tIG5vbi1uYiB0byBuYlxuXHRcdFx0XHR0aGlzLl9zdG9wQWxsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5kZWNvcmF0aW9ucyA9IHRoaXMuZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMud29ya2VyUmVxdWVzdFRva2VuSWQgPSAwO1xuXHRcdHRoaXMud29ya2VyUmVxdWVzdCA9IG51bGw7XG5cdFx0dGhpcy53b3JrZXJSZXF1ZXN0Q29tcGxldGVkID0gZmFsc2U7XG5cblx0XHR0aGlzLmxhc3RDdXJzb3JQb3NpdGlvbkNoYW5nZVRpbWUgPSAwO1xuXHRcdHRoaXMucmVuZGVyRGVjb3JhdGlvbnNUaW1lciA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIGlmIHRoZXJlIGlzIGEgcXVlcnkgYWxyZWFkeSwgaGlnaGxpZ2h0IG9mZiB0aGF0IHF1ZXJ5XG5cdFx0aWYgKFdvcmRIaWdobGlnaHRlci5xdWVyeSkge1xuXHRcdFx0dGhpcy5fcnVuKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGhhc0RlY29yYXRpb25zKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5kZWNvcmF0aW9ucy5sZW5ndGggPiAwKTtcblx0fVxuXG5cdHB1YmxpYyByZXN0b3JlKGRlbGF5OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodEVuYWJsZW1lbnQgPT09ICdvZmYnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5ydW5EZWxheWVyLmNhbmNlbCgpO1xuXHRcdHRoaXMucnVuRGVsYXllci50cmlnZ2VyKCgpID0+IHsgdGhpcy5fcnVuKGZhbHNlLCBkZWxheSk7IH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxuXG5cdHB1YmxpYyB0cmlnZ2VyKCkge1xuXHRcdHRoaXMucnVuRGVsYXllci5jYW5jZWwoKTtcblx0XHR0aGlzLl9ydW4oZmFsc2UsIDApOyAvLyBpbW1lZGlhdGUgcmVuZGVyaW5nIChkZWxheSA9IDApXG5cdH1cblxuXHRwdWJsaWMgc3RvcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodEVuYWJsZW1lbnQgPT09ICdvZmYnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RvcEFsbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U29ydGVkSGlnaGxpZ2h0cygpOiBSYW5nZVtdIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0dGhpcy5kZWNvcmF0aW9ucy5nZXRSYW5nZXMoKVxuXHRcdFx0XHQuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBtb3ZlTmV4dCgpIHtcblx0XHRjb25zdCBoaWdobGlnaHRzID0gdGhpcy5fZ2V0U29ydGVkSGlnaGxpZ2h0cygpO1xuXHRcdGNvbnN0IGluZGV4ID0gaGlnaGxpZ2h0cy5maW5kSW5kZXgoKHJhbmdlKSA9PiByYW5nZS5jb250YWluc1Bvc2l0aW9uKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkpKTtcblx0XHRjb25zdCBuZXdJbmRleCA9ICgoaW5kZXggKyAxKSAlIGhpZ2hsaWdodHMubGVuZ3RoKTtcblx0XHRjb25zdCBkZXN0ID0gaGlnaGxpZ2h0c1tuZXdJbmRleF07XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lnbm9yZVBvc2l0aW9uQ2hhbmdlRXZlbnQgPSB0cnVlO1xuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0UG9zaXRpb24oZGVzdC5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdFx0dGhpcy5lZGl0b3IucmV2ZWFsUmFuZ2VJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KGRlc3QpO1xuXHRcdFx0Y29uc3Qgd29yZCA9IHRoaXMuX2dldFdvcmQoKTtcblx0XHRcdGlmICh3b3JkKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKS5nZXRMaW5lQ29udGVudChkZXN0LnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdGFsZXJ0KGAke2xpbmVDb250ZW50fSwgJHtuZXdJbmRleCArIDF9IG9mICR7aGlnaGxpZ2h0cy5sZW5ndGh9IGZvciAnJHt3b3JkLndvcmR9J2ApO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pZ25vcmVQb3NpdGlvbkNoYW5nZUV2ZW50ID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG1vdmVCYWNrKCkge1xuXHRcdGNvbnN0IGhpZ2hsaWdodHMgPSB0aGlzLl9nZXRTb3J0ZWRIaWdobGlnaHRzKCk7XG5cdFx0Y29uc3QgaW5kZXggPSBoaWdobGlnaHRzLmZpbmRJbmRleCgocmFuZ2UpID0+IHJhbmdlLmNvbnRhaW5zUG9zaXRpb24odGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKSkpO1xuXHRcdGNvbnN0IG5ld0luZGV4ID0gKChpbmRleCAtIDEgKyBoaWdobGlnaHRzLmxlbmd0aCkgJSBoaWdobGlnaHRzLmxlbmd0aCk7XG5cdFx0Y29uc3QgZGVzdCA9IGhpZ2hsaWdodHNbbmV3SW5kZXhdO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9pZ25vcmVQb3NpdGlvbkNoYW5nZUV2ZW50ID0gdHJ1ZTtcblx0XHRcdHRoaXMuZWRpdG9yLnNldFBvc2l0aW9uKGRlc3QuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdHRoaXMuZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChkZXN0KTtcblx0XHRcdGNvbnN0IHdvcmQgPSB0aGlzLl9nZXRXb3JkKCk7XG5cdFx0XHRpZiAod29yZCkge1xuXHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCkuZ2V0TGluZUNvbnRlbnQoZGVzdC5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRhbGVydChgJHtsaW5lQ29udGVudH0sICR7bmV3SW5kZXggKyAxfSBvZiAke2hpZ2hsaWdodHMubGVuZ3RofSBmb3IgJyR7d29yZC53b3JkfSdgKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faWdub3JlUG9zaXRpb25DaGFuZ2VFdmVudCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZVNpbmdsZURlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdC8vIHJldHVybiBpZiBubyBtb2RlbFxuXHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnREZWNvcmF0aW9uSURzID0gV29yZEhpZ2hsaWdodGVyLnN0b3JlZERlY29yYXRpb25JRHMuZ2V0KHRoaXMuZWRpdG9yLmdldE1vZGVsKCkudXJpKTtcblx0XHRpZiAoIWN1cnJlbnREZWNvcmF0aW9uSURzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3IucmVtb3ZlRGVjb3JhdGlvbnMoY3VycmVudERlY29yYXRpb25JRHMpO1xuXHRcdFdvcmRIaWdobGlnaHRlci5zdG9yZWREZWNvcmF0aW9uSURzLmRlbGV0ZSh0aGlzLmVkaXRvci5nZXRNb2RlbCgpLnVyaSk7XG5cblx0XHRpZiAodGhpcy5kZWNvcmF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmRlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9oYXNXb3JkSGlnaGxpZ2h0cy5zZXQoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUFsbERlY29yYXRpb25zKHByZXNlcnZlZE1vZGVsPzogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudEVkaXRvcnMgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmxpc3RDb2RlRWRpdG9ycygpO1xuXHRcdGNvbnN0IGRlbGV0ZVVSSSA9IFtdO1xuXHRcdC8vIGl0ZXJhdGUgb3ZlciBlZGl0b3JzIGFuZCBzdG9yZSBtb2RlbHMgaW4gY3VycmVudE1vZGVsc1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGN1cnJlbnRFZGl0b3JzKSB7XG5cdFx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpIHx8IGlzRXF1YWwoZWRpdG9yLmdldE1vZGVsKCkudXJpLCBwcmVzZXJ2ZWRNb2RlbCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGN1cnJlbnREZWNvcmF0aW9uSURzID0gV29yZEhpZ2hsaWdodGVyLnN0b3JlZERlY29yYXRpb25JRHMuZ2V0KGVkaXRvci5nZXRNb2RlbCgpLnVyaSk7XG5cdFx0XHRpZiAoIWN1cnJlbnREZWNvcmF0aW9uSURzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3IucmVtb3ZlRGVjb3JhdGlvbnMoY3VycmVudERlY29yYXRpb25JRHMpO1xuXHRcdFx0ZGVsZXRlVVJJLnB1c2goZWRpdG9yLmdldE1vZGVsKCkudXJpKTtcblxuXHRcdFx0Y29uc3QgZWRpdG9ySGlnaGxpZ2h0ZXJDb250cmliID0gV29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLmdldChlZGl0b3IpO1xuXHRcdFx0aWYgKCFlZGl0b3JIaWdobGlnaHRlckNvbnRyaWI/LndvcmRIaWdobGlnaHRlcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVkaXRvckhpZ2hsaWdodGVyQ29udHJpYi53b3JkSGlnaGxpZ2h0ZXIuZGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRlZGl0b3JIaWdobGlnaHRlckNvbnRyaWIud29yZEhpZ2hsaWdodGVyLmRlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0XHRcdGVkaXRvckhpZ2hsaWdodGVyQ29udHJpYi53b3JkSGlnaGxpZ2h0ZXIud29ya2VyUmVxdWVzdCA9IG51bGw7XG5cdFx0XHRcdGVkaXRvckhpZ2hsaWdodGVyQ29udHJpYi53b3JkSGlnaGxpZ2h0ZXIuX2hhc1dvcmRIaWdobGlnaHRzLnNldChmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgZGVsZXRlVVJJKSB7XG5cdFx0XHRXb3JkSGlnaGxpZ2h0ZXIuc3RvcmVkRGVjb3JhdGlvbklEcy5kZWxldGUodXJpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wU2luZ3VsYXIoKTogdm9pZCB7XG5cdFx0Ly8gUmVtb3ZlIGFueSBleGlzdGluZyBkZWNvcmF0aW9ucyArIGEgcG9zc2libGUgcXVlcnksIGFuZCByZSAtIHJ1biB0byB1cGRhdGUgZGVjb3JhdGlvbnNcblx0XHR0aGlzLl9yZW1vdmVTaW5nbGVEZWNvcmF0aW9ucygpO1xuXG5cdFx0aWYgKHRoaXMuZWRpdG9yLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRpZiAodGhpcy5lZGl0b3IuZ2V0TW9kZWwoKT8udXJpLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwgJiYgV29yZEhpZ2hsaWdodGVyLnF1ZXJ5Py5tb2RlbEluZm8/Lm1vZGVsVVJJLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHsgLy8gY2xlYXIgcXVlcnkgaWYgZm9jdXNlZCBub24tbmIgZWRpdG9yXG5cdFx0XHRcdFdvcmRIaWdobGlnaHRlci5xdWVyeSA9IG51bGw7XG5cdFx0XHRcdHRoaXMuX3J1bigpOyAvLyBUT0RPOiBAWW95b2tyYXp5IC0tIGludmVzdGlnYXRlIHdoeSB3ZSBuZWVkIGEgZnVsbCByZXJ1biBoZXJlLiBsaWtlbHkgYWRkcmVzc2VkIGEgY2FzZS9wYXRjaCBpbiB0aGUgZmlyc3QgaXRlcmF0aW9uIG9mIHRoaXMgZmVhdHVyZVxuXHRcdFx0fSBlbHNlIHsgLy8gcmVtb3ZlIG1vZGVsSW5mbyB0byBhY2NvdW50IGZvciBuYiBjZWxsIGJlaW5nIGRpc3Bvc2VkXG5cdFx0XHRcdGlmIChXb3JkSGlnaGxpZ2h0ZXIucXVlcnk/Lm1vZGVsSW5mbykge1xuXHRcdFx0XHRcdFdvcmRIaWdobGlnaHRlci5xdWVyeS5tb2RlbEluZm8gPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2FuY2VsIGFueSByZW5kZXJEZWNvcmF0aW9uc1RpbWVyXG5cdFx0aWYgKHRoaXMucmVuZGVyRGVjb3JhdGlvbnNUaW1lciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5yZW5kZXJEZWNvcmF0aW9uc1RpbWVyKTtcblx0XHRcdHRoaXMucmVuZGVyRGVjb3JhdGlvbnNUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBDYW5jZWwgYW55IHdvcmtlciByZXF1ZXN0XG5cdFx0aWYgKHRoaXMud29ya2VyUmVxdWVzdCAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0ID0gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBJbnZhbGlkYXRlIGFueSB3b3JrZXIgcmVxdWVzdCBjYWxsYmFja1xuXHRcdGlmICghdGhpcy53b3JrZXJSZXF1ZXN0Q29tcGxldGVkKSB7XG5cdFx0XHR0aGlzLndvcmtlclJlcXVlc3RUb2tlbklkKys7XG5cdFx0XHR0aGlzLndvcmtlclJlcXVlc3RDb21wbGV0ZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N0b3BBbGwocHJlc2VydmVkTW9kZWw/OiBVUkkpOiB2b2lkIHtcblx0XHQvLyBSZW1vdmUgYW55IGV4aXN0aW5nIGRlY29yYXRpb25zXG5cdFx0Ly8gVE9ETzogQFlveW9rcmF6eSAtLSB0aGlzIHRyaWdnZXJzIGFzIG5vdGVib29rcyBzY3JvbGwsIGNhdXNpbmcgaGlnaGxpZ2h0cyB0byBkaXNhcHBlYXIgbW9tZW50YXJpbHkuXG5cdFx0Ly8gbWF5YmUgYSBuYiB0eXBlIGNoZWNrP1xuXHRcdHRoaXMuX3JlbW92ZUFsbERlY29yYXRpb25zKHByZXNlcnZlZE1vZGVsKTtcblxuXHRcdC8vIENhbmNlbCBhbnkgcmVuZGVyRGVjb3JhdGlvbnNUaW1lclxuXHRcdGlmICh0aGlzLnJlbmRlckRlY29yYXRpb25zVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMucmVuZGVyRGVjb3JhdGlvbnNUaW1lcik7XG5cdFx0XHR0aGlzLnJlbmRlckRlY29yYXRpb25zVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FuY2VsIGFueSB3b3JrZXIgcmVxdWVzdFxuXHRcdGlmICh0aGlzLndvcmtlclJlcXVlc3QgIT09IG51bGwpIHtcblx0XHRcdHRoaXMud29ya2VyUmVxdWVzdC5jYW5jZWwoKTtcblx0XHRcdHRoaXMud29ya2VyUmVxdWVzdCA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gSW52YWxpZGF0ZSBhbnkgd29ya2VyIHJlcXVlc3QgY2FsbGJhY2tcblx0XHRpZiAoIXRoaXMud29ya2VyUmVxdWVzdENvbXBsZXRlZCkge1xuXHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0VG9rZW5JZCsrO1xuXHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0Q29tcGxldGVkID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vblBvc2l0aW9uQ2hhbmdlZChlOiBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblxuXHRcdC8vIGRpc2FibGVkXG5cdFx0aWYgKHRoaXMub2NjdXJyZW5jZXNIaWdobGlnaHRFbmFibGVtZW50ID09PSAnb2ZmJykge1xuXHRcdFx0dGhpcy5fc3RvcEFsbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGlnbm9yZSB0eXBpbmcgJiBvdGhlclxuXHRcdC8vIG5lZWQgdG8gY2hlY2sgaWYgdGhlIG1vZGVsIGlzIGEgbm90ZWJvb2sgY2VsbCwgc2hvdWxkIG5vdCBzdG9wIGlmIG5iXG5cdFx0aWYgKGUuc291cmNlICE9PSAnYXBpJyAmJiBlLnJlYXNvbiAhPT0gQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KSB7XG5cdFx0XHR0aGlzLl9zdG9wQWxsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcnVuKCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRXb3JkKCk6IElXb3JkQXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdGNvbnN0IGVkaXRvclNlbGVjdGlvbiA9IHRoaXMuZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBlZGl0b3JTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gZWRpdG9yU2VsZWN0aW9uLnN0YXJ0Q29sdW1uO1xuXG5cdFx0aWYgKHRoaXMubW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRXb3JkQXRQb3NpdGlvbih7XG5cdFx0XHRsaW5lTnVtYmVyOiBsaW5lTnVtYmVyLFxuXHRcdFx0Y29sdW1uOiBzdGFydENvbHVtblxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRPdGhlck1vZGVsc1RvSGlnaGxpZ2h0KG1vZGVsOiBJVGV4dE1vZGVsKTogSVRleHRNb2RlbFtdIHtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gbm90ZWJvb2sgY2FzZVxuXHRcdGNvbnN0IGlzTm90ZWJvb2tFZGl0b3IgPSBtb2RlbC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbDtcblx0XHRpZiAoaXNOb3RlYm9va0VkaXRvcikge1xuXHRcdFx0Y29uc3QgY3VycmVudE1vZGVsczogSVRleHRNb2RlbFtdID0gW107XG5cdFx0XHRjb25zdCBjdXJyZW50RWRpdG9ycyA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBjdXJyZW50RWRpdG9ycykge1xuXHRcdFx0XHRjb25zdCB0ZW1wTW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdFx0aWYgKHRlbXBNb2RlbCAmJiB0ZW1wTW9kZWwgIT09IG1vZGVsICYmIHRlbXBNb2RlbC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCkge1xuXHRcdFx0XHRcdGN1cnJlbnRNb2RlbHMucHVzaCh0ZW1wTW9kZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY3VycmVudE1vZGVscztcblx0XHR9XG5cblx0XHQvLyBpbmxpbmUgY2FzZVxuXHRcdC8vID8gY3VycmVudCB3b3JrcyB3aGVuIGhpZ2hsaWdodGluZyBvdXRzaWRlIG9mIGFuIGlubGluZSBkaWZmLCBoaWdobGlnaHRpbmcgaW4uXG5cdFx0Ly8gPyBicm9rZW4gd2hlbiBoaWdobGlnaHRpbmcgd2l0aGluIGEgZGlmZiBlZGl0b3IuIGhpZ2hsaWdodGluZyB0aGUgbWFpbiBlZGl0b3IgZG9lcyBub3Qgd29ya1xuXHRcdC8vID8gZWRpdG9yIGdyb3VwIHNlcnZpY2UgY291bGQgYmUgdXNlZnVsIGhlcmVcblx0XHRjb25zdCBjdXJyZW50TW9kZWxzOiBJVGV4dE1vZGVsW10gPSBbXTtcblx0XHRjb25zdCBjdXJyZW50RWRpdG9ycyA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCk7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgY3VycmVudEVkaXRvcnMpIHtcblx0XHRcdGlmICghaXNEaWZmRWRpdG9yKGVkaXRvcikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaWZmTW9kZWwgPSAoZWRpdG9yIGFzIElEaWZmRWRpdG9yKS5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFkaWZmTW9kZWwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAobW9kZWwgPT09IGRpZmZNb2RlbC5tb2RpZmllZCkgeyAvLyBlbWJlZGRlZCBpbmxpbmUgY2hhdCBkaWZmIHdvdWxkIHBhc3MgdGhpcywgYWxsb3dpbmcgaGlnaGxpZ2h0c1xuXHRcdFx0XHQvLz8gY3VycmVudE1vZGVscy5wdXNoKGRpZmZNb2RlbC5vcmlnaW5hbCk7XG5cdFx0XHRcdGN1cnJlbnRNb2RlbHMucHVzaChkaWZmTW9kZWwubW9kaWZpZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY3VycmVudE1vZGVscy5sZW5ndGgpIHsgLy8gbm8gbWF0Y2hpbmcgZWRpdG9ycyBoYXZlIGJlZW4gZm91bmRcblx0XHRcdHJldHVybiBjdXJyZW50TW9kZWxzO1xuXHRcdH1cblxuXHRcdC8vIG11bHRpLWRvYyBPRkZcblx0XHRpZiAodGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodEVuYWJsZW1lbnQgPT09ICdzaW5nbGVGaWxlJykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIG11bHRpLWRvYyBPTlxuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGN1cnJlbnRFZGl0b3JzKSB7XG5cdFx0XHRjb25zdCB0ZW1wTW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdFx0Y29uc3QgaXNWYWxpZE1vZGVsID0gdGVtcE1vZGVsICYmIHRlbXBNb2RlbCAhPT0gbW9kZWw7XG5cblx0XHRcdGlmIChpc1ZhbGlkTW9kZWwpIHtcblx0XHRcdFx0Y3VycmVudE1vZGVscy5wdXNoKHRlbXBNb2RlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjdXJyZW50TW9kZWxzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuKG11bHRpRmlsZUNvbmZpZ0NoYW5nZT86IGJvb2xlYW4sIGRlbGF5PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCBoYXNUZXh0Rm9jdXMgPSB0aGlzLmVkaXRvci5oYXNUZXh0Rm9jdXMoKTtcblx0XHRpZiAoIWhhc1RleHRGb2N1cykgeyAvLyBuZXcgbmIgY2VsbCBzY3JvbGxlZCBpbiwgZGlkQ2hhbmdlTW9kZWwgZmlyZXNcblx0XHRcdGlmICghV29yZEhpZ2hsaWdodGVyLnF1ZXJ5KSB7IC8vIG5vIHByZXZpb3VzIHF1ZXJ5LCBub3RoaW5nIHRvIGhpZ2hsaWdodCBvZmYgb2Zcblx0XHRcdFx0dGhpcy5fc3RvcEFsbCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHsgLy8gaGFzIHRleHQgZm9jdXNcblx0XHRcdGNvbnN0IGVkaXRvclNlbGVjdGlvbiA9IHRoaXMuZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXG5cdFx0XHQvLyBpZ25vcmUgbXVsdGlsaW5lIHNlbGVjdGlvblxuXHRcdFx0aWYgKCFlZGl0b3JTZWxlY3Rpb24gfHwgZWRpdG9yU2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAhPT0gZWRpdG9yU2VsZWN0aW9uLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0V29yZEhpZ2hsaWdodGVyLnF1ZXJ5ID0gbnVsbDtcblx0XHRcdFx0dGhpcy5fc3RvcEFsbCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gZWRpdG9yU2VsZWN0aW9uLnN0YXJ0Q29sdW1uO1xuXHRcdFx0Y29uc3QgZW5kQ29sdW1uID0gZWRpdG9yU2VsZWN0aW9uLmVuZENvbHVtbjtcblxuXHRcdFx0Y29uc3Qgd29yZCA9IHRoaXMuX2dldFdvcmQoKTtcblxuXHRcdFx0Ly8gVGhlIHNlbGVjdGlvbiBtdXN0IGJlIGluc2lkZSBhIHdvcmQgb3Igc3Vycm91bmQgb25lIHdvcmQgYXQgbW9zdFxuXHRcdFx0aWYgKCF3b3JkIHx8IHdvcmQuc3RhcnRDb2x1bW4gPiBzdGFydENvbHVtbiB8fCB3b3JkLmVuZENvbHVtbiA8IGVuZENvbHVtbikge1xuXHRcdFx0XHQvLyBubyBwcmV2aW91cyBxdWVyeSwgbm90aGluZyB0byBoaWdobGlnaHRcblx0XHRcdFx0V29yZEhpZ2hsaWdodGVyLnF1ZXJ5ID0gbnVsbDtcblx0XHRcdFx0dGhpcy5fc3RvcEFsbCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdFdvcmRIaWdobGlnaHRlci5xdWVyeSA9IHtcblx0XHRcdFx0bW9kZWxJbmZvOiB7XG5cdFx0XHRcdFx0bW9kZWxVUkk6IHRoaXMubW9kZWwudXJpLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjogZWRpdG9yU2VsZWN0aW9uLFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXG5cdFx0dGhpcy5sYXN0Q3Vyc29yUG9zaXRpb25DaGFuZ2VUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcblxuXHRcdGlmIChpc0VxdWFsKHRoaXMuZWRpdG9yLmdldE1vZGVsKCkudXJpLCBXb3JkSGlnaGxpZ2h0ZXIucXVlcnkubW9kZWxJbmZvPy5tb2RlbFVSSSkpIHsgLy8gb25seSB0cmlnZ2VyIG5ldyB3b3JrZXIgcmVxdWVzdHMgZnJvbSB0aGUgcHJpbWFyeSBtb2RlbCB0aGF0IGluaXRpYXRlZCB0aGUgcXVlcnlcblx0XHRcdC8vIGNhc2UgZClcblxuXHRcdFx0Ly8gY2hlY2sgaWYgdGhlIG5ldyBxdWVyaWVkIHdvcmQgaXMgY29udGFpbmVkIGluIHRoZSByYW5nZSBvZiBhIHN0b3JlZCBkZWNvcmF0aW9uIGZvciB0aGlzIG1vZGVsXG5cdFx0XHRpZiAoIW11bHRpRmlsZUNvbmZpZ0NoYW5nZSkge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50TW9kZWxEZWNvcmF0aW9uUmFuZ2VzID0gdGhpcy5kZWNvcmF0aW9ucy5nZXRSYW5nZXMoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBzdG9yZWRSYW5nZSBvZiBjdXJyZW50TW9kZWxEZWNvcmF0aW9uUmFuZ2VzKSB7XG5cdFx0XHRcdFx0aWYgKHN0b3JlZFJhbmdlLmNvbnRhaW5zUG9zaXRpb24odGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKSkpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gc3RvcCBhbGwgcHJldmlvdXMgYWN0aW9ucyBpZiBuZXcgd29yZCBpcyBoaWdobGlnaHRlZFxuXHRcdFx0Ly8gaWYgd2UgdHJpZ2dlciB0aGUgcnVuIG9mZiBhIHNldHRpbmcgY2hhbmdlIC0+IG11bHRpZmlsZSBoaWdobGlnaHRpbmcsIHdlIGRvIG5vdCB3YW50IHRvIHJlbW92ZSBkZWNvcmF0aW9ucyBmcm9tIHRoaXMgbW9kZWxcblx0XHRcdHRoaXMuX3N0b3BBbGwobXVsdGlGaWxlQ29uZmlnQ2hhbmdlID8gdGhpcy5tb2RlbC51cmkgOiB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBteVJlcXVlc3RJZCA9ICsrdGhpcy53b3JrZXJSZXF1ZXN0VG9rZW5JZDtcblx0XHRcdHRoaXMud29ya2VyUmVxdWVzdENvbXBsZXRlZCA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCBvdGhlck1vZGVsc1RvSGlnaGxpZ2h0ID0gdGhpcy5nZXRPdGhlck1vZGVsc1RvSGlnaGxpZ2h0KHRoaXMuZWRpdG9yLmdldE1vZGVsKCkpO1xuXG5cdFx0XHQvLyB3aGVuIHJlYWNoaW5nIGhlcmUsIHRoZXJlIGFyZSB0d28gcG9zc2libGUgc3RhdGVzLlxuXHRcdFx0Ly8gXHRcdDEpIHdlIGhhdmUgdGV4dCBmb2N1cywgYW5kIGEgdmFsaWQgcXVlcnkgd2FzIHVwZGF0ZWQuXG5cdFx0XHQvLyBcdFx0Mikgd2UgZG8gbm90IGhhdmUgdGV4dCBmb2N1cywgYW5kIGEgdmFsaWQgcXVlcnkgaXMgY2FjaGVkLlxuXHRcdFx0Ly8gdGhlIHF1ZXJ5IHdpbGwgQUxXQVlTIGhhdmUgdGhlIGNvcnJlY3QgZGF0YSBmb3IgdGhlIGN1cnJlbnQgaGlnaGxpZ2h0IHJlcXVlc3QsIHNvIGl0IGNhbiBhbHdheXMgYmUgcGFzc2VkIHRvIHRoZSB3b3JrZXJSZXF1ZXN0IHNhZmVseVxuXHRcdFx0aWYgKCFXb3JkSGlnaGxpZ2h0ZXIucXVlcnkgfHwgIVdvcmRIaWdobGlnaHRlci5xdWVyeS5tb2RlbEluZm8pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBxdWVyeU1vZGVsUmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKFdvcmRIaWdobGlnaHRlci5xdWVyeS5tb2RlbEluZm8ubW9kZWxVUkkpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0ID0gdGhpcy5jb21wdXRlV2l0aE1vZGVsKHF1ZXJ5TW9kZWxSZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbCwgV29yZEhpZ2hsaWdodGVyLnF1ZXJ5Lm1vZGVsSW5mby5zZWxlY3Rpb24sIG90aGVyTW9kZWxzVG9IaWdobGlnaHQpO1xuXHRcdFx0XHR0aGlzLndvcmtlclJlcXVlc3Q/LnJlc3VsdC50aGVuKGRhdGEgPT4ge1xuXHRcdFx0XHRcdGlmIChteVJlcXVlc3RJZCA9PT0gdGhpcy53b3JrZXJSZXF1ZXN0VG9rZW5JZCkge1xuXHRcdFx0XHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0Q29tcGxldGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRoaXMud29ya2VyUmVxdWVzdFZhbHVlID0gZGF0YSB8fCBbXTtcblx0XHRcdFx0XHRcdHRoaXMuX2JlZ2luUmVuZGVyRGVjb3JhdGlvbnMoZGVsYXkgPz8gdGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdVbmV4cGVjdGVkIGVycm9yIGR1cmluZyBvY2N1cnJlbmNlIHJlcXVlc3QuIExvZzogJywgZSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRxdWVyeU1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSBpZiAodGhpcy5tb2RlbC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCkge1xuXHRcdFx0Ly8gbmV3IHdvcmRIaWdobGlnaHRlciBjb21pbmcgZnJvbSBhIGRpZmZlcmVudCBtb2RlbCwgTk9UIHRoZSBxdWVyeSBtb2RlbCwgbmVlZCB0byBjcmVhdGUgYSB0ZXh0TW9kZWwgcmVmXG5cblx0XHRcdGNvbnN0IG15UmVxdWVzdElkID0gKyt0aGlzLndvcmtlclJlcXVlc3RUb2tlbklkO1xuXHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0Q29tcGxldGVkID0gZmFsc2U7XG5cblx0XHRcdGlmICghV29yZEhpZ2hsaWdodGVyLnF1ZXJ5IHx8ICFXb3JkSGlnaGxpZ2h0ZXIucXVlcnkubW9kZWxJbmZvKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVlcnlNb2RlbFJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShXb3JkSGlnaGxpZ2h0ZXIucXVlcnkubW9kZWxJbmZvLm1vZGVsVVJJKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMud29ya2VyUmVxdWVzdCA9IHRoaXMuY29tcHV0ZVdpdGhNb2RlbChxdWVyeU1vZGVsUmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwsIFdvcmRIaWdobGlnaHRlci5xdWVyeS5tb2RlbEluZm8uc2VsZWN0aW9uLCBbdGhpcy5tb2RlbF0pO1xuXHRcdFx0XHR0aGlzLndvcmtlclJlcXVlc3Q/LnJlc3VsdC50aGVuKGRhdGEgPT4ge1xuXHRcdFx0XHRcdGlmIChteVJlcXVlc3RJZCA9PT0gdGhpcy53b3JrZXJSZXF1ZXN0VG9rZW5JZCkge1xuXHRcdFx0XHRcdFx0dGhpcy53b3JrZXJSZXF1ZXN0Q29tcGxldGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRoaXMud29ya2VyUmVxdWVzdFZhbHVlID0gZGF0YSB8fCBbXTtcblx0XHRcdFx0XHRcdHRoaXMuX2JlZ2luUmVuZGVyRGVjb3JhdGlvbnMoZGVsYXkgPz8gdGhpcy5vY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdVbmV4cGVjdGVkIGVycm9yIGR1cmluZyBvY2N1cnJlbmNlIHJlcXVlc3QuIExvZzogJywgZSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRxdWVyeU1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVXaXRoTW9kZWwobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBvdGhlck1vZGVsczogSVRleHRNb2RlbFtdKTogSU9jY3VyZW5jZUF0UG9zaXRpb25SZXF1ZXN0IHwgbnVsbCB7XG5cdFx0aWYgKCFvdGhlck1vZGVscy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBjb21wdXRlT2NjdXJlbmNlc0F0UG9zaXRpb24odGhpcy5wcm92aWRlcnMsIG1vZGVsLCBzZWxlY3Rpb24sIHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGNvbXB1dGVPY2N1cmVuY2VzTXVsdGlNb2RlbCh0aGlzLm11bHRpRG9jdW1lbnRQcm92aWRlcnMsIG1vZGVsLCBzZWxlY3Rpb24sIHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpLCBvdGhlck1vZGVscyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYmVnaW5SZW5kZXJEZWNvcmF0aW9ucyhkZWxheTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudFRpbWUgPSAobmV3IERhdGUoKSkuZ2V0VGltZSgpO1xuXHRcdGNvbnN0IG1pbmltdW1SZW5kZXJUaW1lID0gdGhpcy5sYXN0Q3Vyc29yUG9zaXRpb25DaGFuZ2VUaW1lICsgZGVsYXk7XG5cblx0XHRpZiAoY3VycmVudFRpbWUgPj0gbWluaW11bVJlbmRlclRpbWUpIHtcblx0XHRcdC8vIFN5bmNocm9ub3VzXG5cdFx0XHR0aGlzLnJlbmRlckRlY29yYXRpb25zVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnJlbmRlckRlY29yYXRpb25zKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEFzeW5jaHJvbm91c1xuXHRcdFx0dGhpcy5yZW5kZXJEZWNvcmF0aW9uc1RpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMucmVuZGVyRGVjb3JhdGlvbnMoKTtcblx0XHRcdH0sIChtaW5pbXVtUmVuZGVyVGltZSAtIGN1cnJlbnRUaW1lKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJEZWNvcmF0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlckRlY29yYXRpb25zVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0Ly8gY3JlYXRlIG5ldyBsb29wLCBpdGVyYXRlIG92ZXIgY3VycmVudCBlZGl0b3JzIHVzaW5nIHRoaXMuY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCksXG5cdFx0Ly8gaWYgdGhlIFVSSSBvZiB0aGF0IGNvZGVFZGl0b3IgaXMgaW4gdGhlIG1hcCwgdGhlbiBhZGQgdGhlIGRlY29yYXRpb25zIHRvIHRoZSBkZWNvcmF0aW9ucyBhcnJheVxuXHRcdC8vIHRoZW4gc2V0IHRoZSBkZWNvcmF0aW9ucyBmb3IgdGhlIGVkaXRvclxuXHRcdGNvbnN0IGN1cnJlbnRFZGl0b3JzID0gdGhpcy5jb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBjdXJyZW50RWRpdG9ycykge1xuXHRcdFx0Y29uc3QgZWRpdG9ySGlnaGxpZ2h0ZXJDb250cmliID0gV29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLmdldChlZGl0b3IpO1xuXHRcdFx0aWYgKCFlZGl0b3JIaWdobGlnaHRlckNvbnRyaWIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld0RlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgdXJpID0gZWRpdG9yLmdldE1vZGVsKCk/LnVyaTtcblx0XHRcdGlmICh1cmkgJiYgdGhpcy53b3JrZXJSZXF1ZXN0VmFsdWUuaGFzKHVyaSkpIHtcblx0XHRcdFx0Y29uc3Qgb2xkRGVjb3JhdGlvbklEczogc3RyaW5nW10gfCB1bmRlZmluZWQgPSBXb3JkSGlnaGxpZ2h0ZXIuc3RvcmVkRGVjb3JhdGlvbklEcy5nZXQodXJpKTtcblx0XHRcdFx0Y29uc3QgbmV3RG9jdW1lbnRIaWdobGlnaHRzID0gdGhpcy53b3JrZXJSZXF1ZXN0VmFsdWUuZ2V0KHVyaSk7XG5cdFx0XHRcdGlmIChuZXdEb2N1bWVudEhpZ2hsaWdodHMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGhpZ2hsaWdodCBvZiBuZXdEb2N1bWVudEhpZ2hsaWdodHMpIHtcblx0XHRcdFx0XHRcdGlmICghaGlnaGxpZ2h0LnJhbmdlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bmV3RGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBoaWdobGlnaHQucmFuZ2UsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IGdldEhpZ2hsaWdodERlY29yYXRpb25PcHRpb25zKGhpZ2hsaWdodC5raW5kKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IG5ld0RlY29yYXRpb25JRHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGVkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0XHRuZXdEZWNvcmF0aW9uSURzID0gY2hhbmdlQWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyhvbGREZWNvcmF0aW9uSURzID8/IFtdLCBuZXdEZWNvcmF0aW9ucyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRXb3JkSGlnaGxpZ2h0ZXIuc3RvcmVkRGVjb3JhdGlvbklEcyA9IFdvcmRIaWdobGlnaHRlci5zdG9yZWREZWNvcmF0aW9uSURzLnNldCh1cmksIG5ld0RlY29yYXRpb25JRHMpO1xuXG5cdFx0XHRcdGlmIChuZXdEZWNvcmF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0ZWRpdG9ySGlnaGxpZ2h0ZXJDb250cmliLndvcmRIaWdobGlnaHRlcj8uZGVjb3JhdGlvbnMuc2V0KG5ld0RlY29yYXRpb25zKTtcblx0XHRcdFx0XHRlZGl0b3JIaWdobGlnaHRlckNvbnRyaWIud29yZEhpZ2hsaWdodGVyPy5faGFzV29yZEhpZ2hsaWdodHMuc2V0KHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY2xlYXIgdGhlIHdvcmtlciByZXF1ZXN0IHdoZW4gZGVjb3JhdGlvbnMgYXJlIGNvbXBsZXRlZFxuXHRcdHRoaXMud29ya2VyUmVxdWVzdCA9IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9wU2luZ3VsYXIoKTtcblx0XHR0aGlzLnRvVW5ob29rLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgV29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIud29yZEhpZ2hsaWdodGVyJztcblxuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogV29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248V29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uPihXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24uSUQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd29yZEhpZ2hsaWdodGVyOiBXb3JkSGlnaGxpZ2h0ZXIgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fd29yZEhpZ2hsaWdodGVyID0gbnVsbDtcblx0XHRjb25zdCBjcmVhdGVXb3JkSGlnaGxpZ2h0ZXJJZlBvc3NpYmxlID0gKCkgPT4ge1xuXHRcdFx0aWYgKGVkaXRvci5oYXNNb2RlbCgpICYmICFlZGl0b3IuZ2V0TW9kZWwoKS5pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uKCkgJiYgZWRpdG9yLmdldE1vZGVsKCkudXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5hY2Nlc3NpYmxlVmlldykge1xuXHRcdFx0XHR0aGlzLl93b3JkSGlnaGxpZ2h0ZXIgPSBuZXcgV29yZEhpZ2hsaWdodGVyKGVkaXRvciwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UubXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyLCBjb250ZXh0S2V5U2VydmljZSwgdGV4dE1vZGVsU2VydmljZSwgY29kZUVkaXRvclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsKChlKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fd29yZEhpZ2hsaWdodGVyKSB7XG5cdFx0XHRcdGlmICghZS5uZXdNb2RlbFVybCAmJiBlLm9sZE1vZGVsVXJsPy5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7IC8vIGhhcHBlbnMgd2hlbiBzd2l0Y2hpbmcgdGFicyB0byBhIG5vdGVib29rIHRoYXQgaGFzIGZvY3VzIGluIHRoZSBjZWxsIGxpc3QsIG5vIG5ldyBtb2RlbCBVUkkgKHRoaXMgYWxzbyBkb2Vzbid0IG1ha2UgaXQgdG8gdGhlIHdvcmRIaWdobGlnaHRlciwgYmMgbm8gZWRpdG9yLmhhc01vZGVsKVxuXHRcdFx0XHRcdHRoaXMud29yZEhpZ2hsaWdodGVyPy5zdG9wKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl93b3JkSGlnaGxpZ2h0ZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl93b3JkSGlnaGxpZ2h0ZXIgPSBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y3JlYXRlV29yZEhpZ2hsaWdodGVySWZQb3NzaWJsZSgpO1xuXHRcdH0pKTtcblx0XHRjcmVhdGVXb3JkSGlnaGxpZ2h0ZXJJZlBvc3NpYmxlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHdvcmRIaWdobGlnaHRlcigpOiBXb3JkSGlnaGxpZ2h0ZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fd29yZEhpZ2hsaWdodGVyO1xuXHR9XG5cblx0cHVibGljIHNhdmVWaWV3U3RhdGUoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3dvcmRIaWdobGlnaHRlciAmJiB0aGlzLl93b3JkSGlnaGxpZ2h0ZXIuaGFzRGVjb3JhdGlvbnMoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBtb3ZlTmV4dCgpIHtcblx0XHR0aGlzLl93b3JkSGlnaGxpZ2h0ZXI/Lm1vdmVOZXh0KCk7XG5cdH1cblxuXHRwdWJsaWMgbW92ZUJhY2soKSB7XG5cdFx0dGhpcy5fd29yZEhpZ2hsaWdodGVyPy5tb3ZlQmFjaygpO1xuXHR9XG5cblx0cHVibGljIHJlc3RvcmVWaWV3U3RhdGUoc3RhdGU6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd29yZEhpZ2hsaWdodGVyICYmIHN0YXRlKSB7XG5cdFx0XHR0aGlzLl93b3JkSGlnaGxpZ2h0ZXIucmVzdG9yZSgyNTApOyAvLyAyNTAgbXMgZGVsYXkgdG8gcmVzdG9yaW5nIHZpZXcgc3RhdGUsIHNpbmNlIG9ubHkgZXh0cyBjYWxsIHRoaXNcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc3RvcEhpZ2hsaWdodGluZygpIHtcblx0XHR0aGlzLl93b3JkSGlnaGxpZ2h0ZXI/LnN0b3AoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93b3JkSGlnaGxpZ2h0ZXIpIHtcblx0XHRcdHRoaXMuX3dvcmRIaWdobGlnaHRlci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl93b3JkSGlnaGxpZ2h0ZXIgPSBudWxsO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuXG5jbGFzcyBXb3JkSGlnaGxpZ2h0TmF2aWdhdGlvbkFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNOZXh0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKG5leHQ6IGJvb2xlYW4sIG9wdHM6IElBY3Rpb25PcHRpb25zKSB7XG5cdFx0c3VwZXIob3B0cyk7XG5cdFx0dGhpcy5faXNOZXh0ID0gbmV4dDtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gV29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pc05leHQpIHtcblx0XHRcdGNvbnRyb2xsZXIubW92ZU5leHQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udHJvbGxlci5tb3ZlQmFjaygpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBOZXh0V29yZEhpZ2hsaWdodEFjdGlvbiBleHRlbmRzIFdvcmRIaWdobGlnaHROYXZpZ2F0aW9uQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIodHJ1ZSwge1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLndvcmRIaWdobGlnaHQubmV4dCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignd29yZEhpZ2hsaWdodC5uZXh0LmxhYmVsJywgXCJHbyB0byBOZXh0IFN5bWJvbCBIaWdobGlnaHRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IGN0eEhhc1dvcmRIaWdobGlnaHRzLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkY3LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFByZXZXb3JkSGlnaGxpZ2h0QWN0aW9uIGV4dGVuZHMgV29yZEhpZ2hsaWdodE5hdmlnYXRpb25BY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihmYWxzZSwge1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLndvcmRIaWdobGlnaHQucHJldicsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignd29yZEhpZ2hsaWdodC5wcmV2aW91cy5sYWJlbCcsIFwiR28gdG8gUHJldmlvdXMgU3ltYm9sIEhpZ2hsaWdodFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogY3R4SGFzV29yZEhpZ2hsaWdodHMsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjcsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgVHJpZ2dlcldvcmRIaWdobGlnaHRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ud29yZEhpZ2hsaWdodC50cmlnZ2VyJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCd3b3JkSGlnaGxpZ2h0LnRyaWdnZXIubGFiZWwnLCBcIlRyaWdnZXIgU3ltYm9sIEhpZ2hsaWdodFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24uZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29udHJvbGxlci5yZXN0b3JlVmlld1N0YXRlKHRydWUpO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbi5JRCwgV29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkVhZ2VyKTsgLy8gZWFnZXIgYmVjYXVzZSBpdCB1c2VzIGBzYXZlVmlld1N0YXRlYC9gcmVzdG9yZVZpZXdTdGF0ZWBcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKE5leHRXb3JkSGlnaGxpZ2h0QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFByZXZXb3JkSGlnaGxpZ2h0QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFRyaWdnZXJXb3JkSGlnaGxpZ2h0QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yRmVhdHVyZShUZXh0dWFsTXVsdGlEb2N1bWVudEhpZ2hsaWdodEZlYXR1cmUpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxhQUFhO0FBQ3RCLFNBQTRCLHlCQUF5QixTQUFTLGFBQWE7QUFDM0UsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIsaUNBQWlDO0FBQzdELFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlLGVBQWU7QUFDdkMsU0FBUyxlQUFlO0FBRXhCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLG9CQUFvQixxQkFBcUI7QUFFL0QsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBeUMsb0JBQW9CO0FBQzdELFNBQVMsY0FBYyxpQ0FBaUQsc0JBQXNCLDRCQUE0Qix1Q0FBdUM7QUFDakssU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFFN0Is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
