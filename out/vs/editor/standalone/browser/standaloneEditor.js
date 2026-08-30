import { mainWindow } from "../../../base/browser/window.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { splitLines } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import "./standalone-tokens.css";
import { FontMeasurements } from "../../browser/config/fontMeasurements.js";
import { EditorCommand } from "../../browser/editorExtensions.js";
import { ICodeEditorService } from "../../browser/services/codeEditorService.js";
import { createWebWorker as actualCreateWebWorker } from "./standaloneWebWorker.js";
import { ApplyUpdateResult, ConfigurationChangedEvent, EditorOptions } from "../../common/config/editorOptions.js";
import { EditorZoom } from "../../common/config/editorZoom.js";
import { BareFontInfo, FontInfo } from "../../common/config/fontInfo.js";
import { EditorType } from "../../common/editorCommon.js";
import * as languages from "../../common/languages.js";
import { ILanguageService } from "../../common/languages/language.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../common/languages/modesRegistry.js";
import { NullState, nullTokenize } from "../../common/languages/nullTokenize.js";
import { FindMatch, TextModelResolvedOptions } from "../../common/model.js";
import { IModelService } from "../../common/services/model.js";
import * as standaloneEnums from "../../common/standalone/standaloneEnums.js";
import { Colorizer } from "./colorizer.js";
import { StandaloneDiffEditor2, StandaloneEditor, createTextModel } from "./standaloneCodeEditor.js";
import { StandaloneKeybindingService, StandaloneServices } from "./standaloneServices.js";
import { IStandaloneThemeService } from "../common/standaloneTheme.js";
import { MenuId, MenuRegistry } from "../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../platform/commands/common/commands.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { IMarkerService } from "../../../platform/markers/common/markers.js";
import { IOpenerService } from "../../../platform/opener/common/opener.js";
import { MultiDiffEditorWidget } from "../../browser/widget/multiDiffEditor/multiDiffEditorWidget.js";
import { IWebWorkerService } from "../../../platform/webWorker/browser/webWorkerService.js";
function create(domElement, options, override) {
  const instantiationService = StandaloneServices.initialize(override || {});
  return instantiationService.createInstance(StandaloneEditor, domElement, options);
}
function onDidCreateEditor(listener) {
  const codeEditorService = StandaloneServices.get(ICodeEditorService);
  return codeEditorService.onCodeEditorAdd((editor) => {
    listener(editor);
  });
}
function onDidCreateDiffEditor(listener) {
  const codeEditorService = StandaloneServices.get(ICodeEditorService);
  return codeEditorService.onDiffEditorAdd((editor) => {
    listener(editor);
  });
}
function getEditors() {
  const codeEditorService = StandaloneServices.get(ICodeEditorService);
  return codeEditorService.listCodeEditors();
}
function getDiffEditors() {
  const codeEditorService = StandaloneServices.get(ICodeEditorService);
  return codeEditorService.listDiffEditors();
}
function createDiffEditor(domElement, options, override) {
  const instantiationService = StandaloneServices.initialize(override || {});
  return instantiationService.createInstance(StandaloneDiffEditor2, domElement, options);
}
function createMultiFileDiffEditor(domElement, override) {
  const instantiationService = StandaloneServices.initialize(override || {});
  return new MultiDiffEditorWidget(domElement, {}, void 0, instantiationService);
}
function addCommand(descriptor) {
  if (typeof descriptor.id !== "string" || typeof descriptor.run !== "function") {
    throw new Error("Invalid command descriptor, `id` and `run` are required properties!");
  }
  return CommandsRegistry.registerCommand(descriptor.id, descriptor.run);
}
function addEditorAction(descriptor) {
  if (typeof descriptor.id !== "string" || typeof descriptor.label !== "string" || typeof descriptor.run !== "function") {
    throw new Error("Invalid action descriptor, `id`, `label` and `run` are required properties!");
  }
  const precondition = ContextKeyExpr.deserialize(descriptor.precondition);
  const run = (accessor, ...args) => {
    return EditorCommand.runEditorCommand(accessor, args, precondition, (accessor2, editor, args2) => Promise.resolve(descriptor.run(editor, ...args2)));
  };
  const toDispose = new DisposableStore();
  toDispose.add(CommandsRegistry.registerCommand(descriptor.id, run));
  if (descriptor.contextMenuGroupId) {
    const menuItem = {
      command: {
        id: descriptor.id,
        title: descriptor.label
      },
      when: precondition,
      group: descriptor.contextMenuGroupId,
      order: descriptor.contextMenuOrder || 0
    };
    toDispose.add(MenuRegistry.appendMenuItem(MenuId.EditorContext, menuItem));
  }
  if (Array.isArray(descriptor.keybindings)) {
    const keybindingService = StandaloneServices.get(IKeybindingService);
    if (!(keybindingService instanceof StandaloneKeybindingService)) {
      console.warn("Cannot add keybinding because the editor is configured with an unrecognized KeybindingService");
    } else {
      const keybindingsWhen = ContextKeyExpr.and(precondition, ContextKeyExpr.deserialize(descriptor.keybindingContext));
      toDispose.add(keybindingService.addDynamicKeybindings(descriptor.keybindings.map((keybinding) => {
        return {
          keybinding,
          command: descriptor.id,
          when: keybindingsWhen
        };
      })));
    }
  }
  return toDispose;
}
function addKeybindingRule(rule) {
  return addKeybindingRules([rule]);
}
function addKeybindingRules(rules) {
  const keybindingService = StandaloneServices.get(IKeybindingService);
  if (!(keybindingService instanceof StandaloneKeybindingService)) {
    console.warn("Cannot add keybinding because the editor is configured with an unrecognized KeybindingService");
    return Disposable.None;
  }
  return keybindingService.addDynamicKeybindings(rules.map((rule) => {
    return {
      keybinding: rule.keybinding,
      command: rule.command,
      commandArgs: rule.commandArgs,
      when: ContextKeyExpr.deserialize(rule.when)
    };
  }));
}
function createModel(value, language, uri) {
  const languageService = StandaloneServices.get(ILanguageService);
  const languageId = languageService.getLanguageIdByMimeType(language) || language;
  return createTextModel(
    StandaloneServices.get(IModelService),
    languageService,
    value,
    languageId,
    uri
  );
}
function setModelLanguage(model, mimeTypeOrLanguageId) {
  const languageService = StandaloneServices.get(ILanguageService);
  const languageId = languageService.getLanguageIdByMimeType(mimeTypeOrLanguageId) || mimeTypeOrLanguageId || PLAINTEXT_LANGUAGE_ID;
  model.setLanguage(languageService.createById(languageId));
}
function setModelMarkers(model, owner, markers) {
  if (model) {
    const markerService = StandaloneServices.get(IMarkerService);
    markerService.changeOne(owner, model.uri, markers);
  }
}
function removeAllMarkers(owner) {
  const markerService = StandaloneServices.get(IMarkerService);
  markerService.changeAll(owner, []);
}
function getModelMarkers(filter) {
  const markerService = StandaloneServices.get(IMarkerService);
  return markerService.read(filter);
}
function onDidChangeMarkers(listener) {
  const markerService = StandaloneServices.get(IMarkerService);
  return markerService.onMarkerChanged(listener);
}
function getModel(uri) {
  const modelService = StandaloneServices.get(IModelService);
  return modelService.getModel(uri);
}
function getModels() {
  const modelService = StandaloneServices.get(IModelService);
  return modelService.getModels();
}
function onDidCreateModel(listener) {
  const modelService = StandaloneServices.get(IModelService);
  return modelService.onModelAdded(listener);
}
function onWillDisposeModel(listener) {
  const modelService = StandaloneServices.get(IModelService);
  return modelService.onModelRemoved(listener);
}
function onDidChangeModelLanguage(listener) {
  const modelService = StandaloneServices.get(IModelService);
  return modelService.onModelLanguageChanged((e) => {
    listener({
      model: e.model,
      oldLanguage: e.oldLanguageId
    });
  });
}
function createWebWorker(opts) {
  return actualCreateWebWorker(StandaloneServices.get(IModelService), StandaloneServices.get(IWebWorkerService), opts);
}
function colorizeElement(domNode, options) {
  const languageService = StandaloneServices.get(ILanguageService);
  const themeService = StandaloneServices.get(IStandaloneThemeService);
  return Colorizer.colorizeElement(themeService, languageService, domNode, options).then(() => {
    themeService.registerEditorContainer(domNode);
  });
}
function colorize(text, languageId, options) {
  const languageService = StandaloneServices.get(ILanguageService);
  const themeService = StandaloneServices.get(IStandaloneThemeService);
  themeService.registerEditorContainer(mainWindow.document.body);
  return Colorizer.colorize(languageService, text, languageId, options);
}
function colorizeModelLine(model, lineNumber, tabSize = 4) {
  const themeService = StandaloneServices.get(IStandaloneThemeService);
  themeService.registerEditorContainer(mainWindow.document.body);
  return Colorizer.colorizeModelLine(model, lineNumber, tabSize);
}
function getSafeTokenizationSupport(language) {
  const tokenizationSupport = languages.TokenizationRegistry.get(language);
  if (tokenizationSupport) {
    return tokenizationSupport;
  }
  return {
    getInitialState: () => NullState,
    tokenize: (line, hasEOL, state) => nullTokenize(language, state)
  };
}
function tokenize(text, languageId) {
  languages.TokenizationRegistry.getOrCreate(languageId);
  const tokenizationSupport = getSafeTokenizationSupport(languageId);
  const lines = splitLines(text);
  const result = [];
  let state = tokenizationSupport.getInitialState();
  for (let i = 0, len = lines.length; i < len; i++) {
    const line = lines[i];
    const tokenizationResult = tokenizationSupport.tokenize(line, true, state);
    result[i] = tokenizationResult.tokens;
    state = tokenizationResult.endState;
  }
  return result;
}
function defineTheme(themeName, themeData) {
  const standaloneThemeService = StandaloneServices.get(IStandaloneThemeService);
  standaloneThemeService.defineTheme(themeName, themeData);
}
function setTheme(themeName) {
  const standaloneThemeService = StandaloneServices.get(IStandaloneThemeService);
  standaloneThemeService.setTheme(themeName);
}
function remeasureFonts() {
  FontMeasurements.clearAllFontInfos();
}
function registerCommand(id, handler) {
  return CommandsRegistry.registerCommand({ id, handler });
}
function registerLinkOpener(opener) {
  const openerService = StandaloneServices.get(IOpenerService);
  return openerService.registerOpener({
    async open(resource) {
      if (typeof resource === "string") {
        resource = URI.parse(resource);
      }
      return opener.open(resource);
    }
  });
}
function registerEditorOpener(opener) {
  const codeEditorService = StandaloneServices.get(ICodeEditorService);
  return codeEditorService.registerCodeEditorOpenHandler(async (input, source, sideBySide) => {
    if (!source) {
      return null;
    }
    const selection = input.options?.selection;
    let selectionOrPosition;
    if (selection && typeof selection.endLineNumber === "number" && typeof selection.endColumn === "number") {
      selectionOrPosition = selection;
    } else if (selection) {
      selectionOrPosition = { lineNumber: selection.startLineNumber, column: selection.startColumn };
    }
    if (await opener.openCodeEditor(source, input.resource, selectionOrPosition)) {
      return source;
    }
    return null;
  });
}
function createMonacoEditorAPI() {
  return {
    // methods
    // eslint-disable-next-line local/code-no-any-casts
    create,
    // eslint-disable-next-line local/code-no-any-casts
    getEditors,
    // eslint-disable-next-line local/code-no-any-casts
    getDiffEditors,
    // eslint-disable-next-line local/code-no-any-casts
    onDidCreateEditor,
    // eslint-disable-next-line local/code-no-any-casts
    onDidCreateDiffEditor,
    // eslint-disable-next-line local/code-no-any-casts
    createDiffEditor,
    // eslint-disable-next-line local/code-no-any-casts
    addCommand,
    // eslint-disable-next-line local/code-no-any-casts
    addEditorAction,
    // eslint-disable-next-line local/code-no-any-casts
    addKeybindingRule,
    // eslint-disable-next-line local/code-no-any-casts
    addKeybindingRules,
    // eslint-disable-next-line local/code-no-any-casts
    createModel,
    // eslint-disable-next-line local/code-no-any-casts
    setModelLanguage,
    // eslint-disable-next-line local/code-no-any-casts
    setModelMarkers,
    // eslint-disable-next-line local/code-no-any-casts
    getModelMarkers,
    removeAllMarkers,
    // eslint-disable-next-line local/code-no-any-casts
    onDidChangeMarkers,
    // eslint-disable-next-line local/code-no-any-casts
    getModels,
    // eslint-disable-next-line local/code-no-any-casts
    getModel,
    // eslint-disable-next-line local/code-no-any-casts
    onDidCreateModel,
    // eslint-disable-next-line local/code-no-any-casts
    onWillDisposeModel,
    // eslint-disable-next-line local/code-no-any-casts
    onDidChangeModelLanguage,
    // eslint-disable-next-line local/code-no-any-casts
    createWebWorker,
    // eslint-disable-next-line local/code-no-any-casts
    colorizeElement,
    // eslint-disable-next-line local/code-no-any-casts
    colorize,
    // eslint-disable-next-line local/code-no-any-casts
    colorizeModelLine,
    // eslint-disable-next-line local/code-no-any-casts
    tokenize,
    // eslint-disable-next-line local/code-no-any-casts
    defineTheme,
    // eslint-disable-next-line local/code-no-any-casts
    setTheme,
    remeasureFonts,
    registerCommand,
    registerLinkOpener,
    // eslint-disable-next-line local/code-no-any-casts
    registerEditorOpener,
    // enums
    AccessibilitySupport: standaloneEnums.AccessibilitySupport,
    ContentWidgetPositionPreference: standaloneEnums.ContentWidgetPositionPreference,
    CursorChangeReason: standaloneEnums.CursorChangeReason,
    DefaultEndOfLine: standaloneEnums.DefaultEndOfLine,
    EditorAutoIndentStrategy: standaloneEnums.EditorAutoIndentStrategy,
    EditorOption: standaloneEnums.EditorOption,
    EndOfLinePreference: standaloneEnums.EndOfLinePreference,
    EndOfLineSequence: standaloneEnums.EndOfLineSequence,
    MinimapPosition: standaloneEnums.MinimapPosition,
    MinimapSectionHeaderStyle: standaloneEnums.MinimapSectionHeaderStyle,
    MouseTargetType: standaloneEnums.MouseTargetType,
    OverlayWidgetPositionPreference: standaloneEnums.OverlayWidgetPositionPreference,
    OverviewRulerLane: standaloneEnums.OverviewRulerLane,
    GlyphMarginLane: standaloneEnums.GlyphMarginLane,
    RenderLineNumbersType: standaloneEnums.RenderLineNumbersType,
    RenderMinimap: standaloneEnums.RenderMinimap,
    ScrollbarVisibility: standaloneEnums.ScrollbarVisibility,
    ScrollType: standaloneEnums.ScrollType,
    TextEditorCursorBlinkingStyle: standaloneEnums.TextEditorCursorBlinkingStyle,
    TextEditorCursorStyle: standaloneEnums.TextEditorCursorStyle,
    TrackedRangeStickiness: standaloneEnums.TrackedRangeStickiness,
    WrappingIndent: standaloneEnums.WrappingIndent,
    InjectedTextCursorStops: standaloneEnums.InjectedTextCursorStops,
    PositionAffinity: standaloneEnums.PositionAffinity,
    ShowLightbulbIconMode: standaloneEnums.ShowLightbulbIconMode,
    TextDirection: standaloneEnums.TextDirection,
    // classes
    // eslint-disable-next-line local/code-no-any-casts
    ConfigurationChangedEvent,
    // eslint-disable-next-line local/code-no-any-casts
    BareFontInfo,
    // eslint-disable-next-line local/code-no-any-casts
    FontInfo,
    // eslint-disable-next-line local/code-no-any-casts
    TextModelResolvedOptions,
    // eslint-disable-next-line local/code-no-any-casts
    FindMatch,
    // eslint-disable-next-line local/code-no-any-casts
    ApplyUpdateResult,
    // eslint-disable-next-line local/code-no-any-casts
    EditorZoom,
    // eslint-disable-next-line local/code-no-any-casts
    createMultiFileDiffEditor,
    // vars
    EditorType,
    // eslint-disable-next-line local/code-no-any-casts
    EditorOptions
  };
}
export {
  addCommand,
  addEditorAction,
  addKeybindingRule,
  addKeybindingRules,
  colorize,
  colorizeElement,
  colorizeModelLine,
  create,
  createDiffEditor,
  createModel,
  createMonacoEditorAPI,
  createMultiFileDiffEditor,
  createWebWorker,
  defineTheme,
  getDiffEditors,
  getEditors,
  getModel,
  getModelMarkers,
  getModels,
  onDidChangeMarkers,
  onDidChangeModelLanguage,
  onDidCreateDiffEditor,
  onDidCreateEditor,
  onDidCreateModel,
  onWillDisposeModel,
  registerCommand,
  registerEditorOpener,
  registerLinkOpener,
  remeasureFonts,
  removeAllMarkers,
  setModelLanguage,
  setModelMarkers,
  setTheme,
  tokenize
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHN0YW5kYWxvbmVcXGJyb3dzZXJcXHN0YW5kYWxvbmVFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHNwbGl0TGluZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgJy4vc3RhbmRhbG9uZS10b2tlbnMuY3NzJztcbmltcG9ydCB7IEZvbnRNZWFzdXJlbWVudHMgfSBmcm9tICcuLi8uLi9icm93c2VyL2NvbmZpZy9mb250TWVhc3VyZW1lbnRzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbW1hbmQsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW50ZXJuYWxXZWJXb3JrZXJPcHRpb25zLCBNb25hY29XZWJXb3JrZXIsIGNyZWF0ZVdlYldvcmtlciBhcyBhY3R1YWxDcmVhdGVXZWJXb3JrZXIgfSBmcm9tICcuL3N0YW5kYWxvbmVXZWJXb3JrZXIuanMnO1xuaW1wb3J0IHsgQXBwbHlVcGRhdGVSZXN1bHQsIENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsIEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yWm9vbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yWm9vbS5qcyc7XG5pbXBvcnQgeyBCYXJlRm9udEluZm8sIEZvbnRJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JUeXBlLCBJRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE51bGxTdGF0ZSwgbnVsbFRva2VuaXplIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9udWxsVG9rZW5pemUuanMnO1xuaW1wb3J0IHsgRmluZE1hdGNoLCBJVGV4dE1vZGVsLCBUZXh0TW9kZWxSZXNvbHZlZE9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBzdGFuZGFsb25lRW51bXMgZnJvbSAnLi4vLi4vY29tbW9uL3N0YW5kYWxvbmUvc3RhbmRhbG9uZUVudW1zLmpzJztcbmltcG9ydCB7IENvbG9yaXplciwgSUNvbG9yaXplckVsZW1lbnRPcHRpb25zLCBJQ29sb3JpemVyT3B0aW9ucyB9IGZyb20gJy4vY29sb3JpemVyLmpzJztcbmltcG9ydCB7IElBY3Rpb25EZXNjcmlwdG9yLCBJU3RhbmRhbG9uZUNvZGVFZGl0b3IsIElTdGFuZGFsb25lRGlmZkVkaXRvciwgSVN0YW5kYWxvbmVEaWZmRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucywgSVN0YW5kYWxvbmVFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zLCBTdGFuZGFsb25lRGlmZkVkaXRvcjIsIFN0YW5kYWxvbmVFZGl0b3IsIGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4vc3RhbmRhbG9uZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvck92ZXJyaWRlU2VydmljZXMsIFN0YW5kYWxvbmVLZXliaW5kaW5nU2VydmljZSwgU3RhbmRhbG9uZVNlcnZpY2VzIH0gZnJvbSAnLi9zdGFuZGFsb25lU2VydmljZXMuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4vc3RhbmRhbG9uZVRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RhbmRhbG9uZVRoZW1lRGF0YSwgSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc3RhbmRhbG9uZVRoZW1lLmpzJztcbmltcG9ydCB7IElNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyLCBJTWFya2VyRGF0YSwgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJV2ViV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dlYldvcmtlci9icm93c2VyL3dlYldvcmtlclNlcnZpY2UuanMnO1xuXG4vKipcbiAqIENyZWF0ZSBhIG5ldyBlZGl0b3IgdW5kZXIgYGRvbUVsZW1lbnRgLlxuICogYGRvbUVsZW1lbnRgIHNob3VsZCBiZSBlbXB0eSAobm90IGNvbnRhaW4gb3RoZXIgZG9tIG5vZGVzKS5cbiAqIFRoZSBlZGl0b3Igd2lsbCByZWFkIHRoZSBzaXplIG9mIGBkb21FbGVtZW50YC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZShkb21FbGVtZW50OiBIVE1MRWxlbWVudCwgb3B0aW9ucz86IElTdGFuZGFsb25lRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucywgb3ZlcnJpZGU/OiBJRWRpdG9yT3ZlcnJpZGVTZXJ2aWNlcyk6IElTdGFuZGFsb25lQ29kZUVkaXRvciB7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmluaXRpYWxpemUob3ZlcnJpZGUgfHwge30pO1xuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RhbmRhbG9uZUVkaXRvciwgZG9tRWxlbWVudCwgb3B0aW9ucyk7XG59XG5cbi8qKlxuICogRW1pdHRlZCB3aGVuIGFuIGVkaXRvciBpcyBjcmVhdGVkLlxuICogQ3JlYXRpbmcgYSBkaWZmIGVkaXRvciBtaWdodCBjYXVzZSB0aGlzIGxpc3RlbmVyIHRvIGJlIGludm9rZWQgd2l0aCB0aGUgdHdvIGVkaXRvcnMuXG4gKiBAZXZlbnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9uRGlkQ3JlYXRlRWRpdG9yKGxpc3RlbmVyOiAoY29kZUVkaXRvcjogSUNvZGVFZGl0b3IpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGNvZGVFZGl0b3JTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRyZXR1cm4gY29kZUVkaXRvclNlcnZpY2Uub25Db2RlRWRpdG9yQWRkKChlZGl0b3IpID0+IHtcblx0XHRsaXN0ZW5lcihlZGl0b3IpO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYW4gZGlmZiBlZGl0b3IgaXMgY3JlYXRlZC5cbiAqIEBldmVudFxuICovXG5leHBvcnQgZnVuY3Rpb24gb25EaWRDcmVhdGVEaWZmRWRpdG9yKGxpc3RlbmVyOiAoZGlmZkVkaXRvcjogSURpZmZFZGl0b3IpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGNvZGVFZGl0b3JTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRyZXR1cm4gY29kZUVkaXRvclNlcnZpY2Uub25EaWZmRWRpdG9yQWRkKChlZGl0b3IpID0+IHtcblx0XHRsaXN0ZW5lcig8SURpZmZFZGl0b3I+ZWRpdG9yKTtcblx0fSk7XG59XG5cbi8qKlxuICogR2V0IGFsbCB0aGUgY3JlYXRlZCBlZGl0b3JzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWRpdG9ycygpOiByZWFkb25seSBJQ29kZUVkaXRvcltdIHtcblx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdHJldHVybiBjb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKTtcbn1cblxuLyoqXG4gKiBHZXQgYWxsIHRoZSBjcmVhdGVkIGRpZmYgZWRpdG9ycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldERpZmZFZGl0b3JzKCk6IHJlYWRvbmx5IElEaWZmRWRpdG9yW10ge1xuXHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0cmV0dXJuIGNvZGVFZGl0b3JTZXJ2aWNlLmxpc3REaWZmRWRpdG9ycygpO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIG5ldyBkaWZmIGVkaXRvciB1bmRlciBgZG9tRWxlbWVudGAuXG4gKiBgZG9tRWxlbWVudGAgc2hvdWxkIGJlIGVtcHR5IChub3QgY29udGFpbiBvdGhlciBkb20gbm9kZXMpLlxuICogVGhlIGVkaXRvciB3aWxsIHJlYWQgdGhlIHNpemUgb2YgYGRvbUVsZW1lbnRgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRGlmZkVkaXRvcihkb21FbGVtZW50OiBIVE1MRWxlbWVudCwgb3B0aW9ucz86IElTdGFuZGFsb25lRGlmZkVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMsIG92ZXJyaWRlPzogSUVkaXRvck92ZXJyaWRlU2VydmljZXMpOiBJU3RhbmRhbG9uZURpZmZFZGl0b3Ige1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5pbml0aWFsaXplKG92ZXJyaWRlIHx8IHt9KTtcblx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0YW5kYWxvbmVEaWZmRWRpdG9yMiwgZG9tRWxlbWVudCwgb3B0aW9ucyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNdWx0aUZpbGVEaWZmRWRpdG9yKGRvbUVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvdmVycmlkZT86IElFZGl0b3JPdmVycmlkZVNlcnZpY2VzKSB7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmluaXRpYWxpemUob3ZlcnJpZGUgfHwge30pO1xuXHRyZXR1cm4gbmV3IE11bHRpRGlmZkVkaXRvcldpZGdldChkb21FbGVtZW50LCB7fSwgdW5kZWZpbmVkLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG59XG5cbi8qKlxuICogRGVzY3JpcHRpb24gb2YgYSBjb21tYW5kIGNvbnRyaWJ1dGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDb21tYW5kRGVzY3JpcHRvciB7XG5cdC8qKlxuXHQgKiBBbiB1bmlxdWUgaWRlbnRpZmllciBvZiB0aGUgY29udHJpYnV0ZWQgY29tbWFuZC5cblx0ICovXG5cdGlkOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBDYWxsYmFjayB0aGF0IHdpbGwgYmUgZXhlY3V0ZWQgd2hlbiB0aGUgY29tbWFuZCBpcyB0cmlnZ2VyZWQuXG5cdCAqL1xuXHRydW46IElDb21tYW5kSGFuZGxlcjtcbn1cblxuLyoqXG4gKiBBZGQgYSBjb21tYW5kLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYWRkQ29tbWFuZChkZXNjcmlwdG9yOiBJQ29tbWFuZERlc2NyaXB0b3IpOiBJRGlzcG9zYWJsZSB7XG5cdGlmICgodHlwZW9mIGRlc2NyaXB0b3IuaWQgIT09ICdzdHJpbmcnKSB8fCAodHlwZW9mIGRlc2NyaXB0b3IucnVuICE9PSAnZnVuY3Rpb24nKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb21tYW5kIGRlc2NyaXB0b3IsIGBpZGAgYW5kIGBydW5gIGFyZSByZXF1aXJlZCBwcm9wZXJ0aWVzIScpO1xuXHR9XG5cdHJldHVybiBDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChkZXNjcmlwdG9yLmlkLCBkZXNjcmlwdG9yLnJ1bik7XG59XG5cbi8qKlxuICogQWRkIGFuIGFjdGlvbiB0byBhbGwgZWRpdG9ycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFkZEVkaXRvckFjdGlvbihkZXNjcmlwdG9yOiBJQWN0aW9uRGVzY3JpcHRvcik6IElEaXNwb3NhYmxlIHtcblx0aWYgKCh0eXBlb2YgZGVzY3JpcHRvci5pZCAhPT0gJ3N0cmluZycpIHx8ICh0eXBlb2YgZGVzY3JpcHRvci5sYWJlbCAhPT0gJ3N0cmluZycpIHx8ICh0eXBlb2YgZGVzY3JpcHRvci5ydW4gIT09ICdmdW5jdGlvbicpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFjdGlvbiBkZXNjcmlwdG9yLCBgaWRgLCBgbGFiZWxgIGFuZCBgcnVuYCBhcmUgcmVxdWlyZWQgcHJvcGVydGllcyEnKTtcblx0fVxuXG5cdGNvbnN0IHByZWNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGRlc2NyaXB0b3IucHJlY29uZGl0aW9uKTtcblx0Y29uc3QgcnVuID0gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0cmV0dXJuIEVkaXRvckNvbW1hbmQucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgYXJncywgcHJlY29uZGl0aW9uLCAoYWNjZXNzb3IsIGVkaXRvciwgYXJncykgPT4gUHJvbWlzZS5yZXNvbHZlKGRlc2NyaXB0b3IucnVuKGVkaXRvciwgLi4uYXJncykpKTtcblx0fTtcblxuXHRjb25zdCB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Ly8gUmVnaXN0ZXIgdGhlIGNvbW1hbmRcblx0dG9EaXNwb3NlLmFkZChDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChkZXNjcmlwdG9yLmlkLCBydW4pKTtcblxuXHQvLyBSZWdpc3RlciB0aGUgY29udGV4dCBtZW51IGl0ZW1cblx0aWYgKGRlc2NyaXB0b3IuY29udGV4dE1lbnVHcm91cElkKSB7XG5cdFx0Y29uc3QgbWVudUl0ZW06IElNZW51SXRlbSA9IHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IGRlc2NyaXB0b3IuaWQsXG5cdFx0XHRcdHRpdGxlOiBkZXNjcmlwdG9yLmxhYmVsXG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogcHJlY29uZGl0aW9uLFxuXHRcdFx0Z3JvdXA6IGRlc2NyaXB0b3IuY29udGV4dE1lbnVHcm91cElkLFxuXHRcdFx0b3JkZXI6IGRlc2NyaXB0b3IuY29udGV4dE1lbnVPcmRlciB8fCAwXG5cdFx0fTtcblx0XHR0b0Rpc3Bvc2UuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yQ29udGV4dCwgbWVudUl0ZW0pKTtcblx0fVxuXG5cdC8vIFJlZ2lzdGVyIHRoZSBrZXliaW5kaW5nc1xuXHRpZiAoQXJyYXkuaXNBcnJheShkZXNjcmlwdG9yLmtleWJpbmRpbmdzKSkge1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJS2V5YmluZGluZ1NlcnZpY2UpO1xuXHRcdGlmICghKGtleWJpbmRpbmdTZXJ2aWNlIGluc3RhbmNlb2YgU3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlKSkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdDYW5ub3QgYWRkIGtleWJpbmRpbmcgYmVjYXVzZSB0aGUgZWRpdG9yIGlzIGNvbmZpZ3VyZWQgd2l0aCBhbiB1bnJlY29nbml6ZWQgS2V5YmluZGluZ1NlcnZpY2UnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ3NXaGVuID0gQ29udGV4dEtleUV4cHIuYW5kKHByZWNvbmRpdGlvbiwgQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZGVzY3JpcHRvci5rZXliaW5kaW5nQ29udGV4dCkpO1xuXHRcdFx0dG9EaXNwb3NlLmFkZChrZXliaW5kaW5nU2VydmljZS5hZGREeW5hbWljS2V5YmluZGluZ3MoZGVzY3JpcHRvci5rZXliaW5kaW5ncy5tYXAoKGtleWJpbmRpbmcpID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRrZXliaW5kaW5nLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGRlc2NyaXB0b3IuaWQsXG5cdFx0XHRcdFx0d2hlbjoga2V5YmluZGluZ3NXaGVuXG5cdFx0XHRcdH07XG5cdFx0XHR9KSkpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0b0Rpc3Bvc2U7XG59XG5cbi8qKlxuICogQSBrZXliaW5kaW5nIHJ1bGUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUtleWJpbmRpbmdSdWxlIHtcblx0a2V5YmluZGluZzogbnVtYmVyO1xuXHRjb21tYW5kPzogc3RyaW5nIHwgbnVsbDtcblx0Y29tbWFuZEFyZ3M/OiBhbnk7XG5cdHdoZW4/OiBzdHJpbmcgfCBudWxsO1xufVxuXG4vKipcbiAqIEFkZCBhIGtleWJpbmRpbmcgcnVsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFkZEtleWJpbmRpbmdSdWxlKHJ1bGU6IElLZXliaW5kaW5nUnVsZSk6IElEaXNwb3NhYmxlIHtcblx0cmV0dXJuIGFkZEtleWJpbmRpbmdSdWxlcyhbcnVsZV0pO1xufVxuXG4vKipcbiAqIEFkZCBrZXliaW5kaW5nIHJ1bGVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYWRkS2V5YmluZGluZ1J1bGVzKHJ1bGVzOiBJS2V5YmluZGluZ1J1bGVbXSk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cdGlmICghKGtleWJpbmRpbmdTZXJ2aWNlIGluc3RhbmNlb2YgU3RhbmRhbG9uZUtleWJpbmRpbmdTZXJ2aWNlKSkge1xuXHRcdGNvbnNvbGUud2FybignQ2Fubm90IGFkZCBrZXliaW5kaW5nIGJlY2F1c2UgdGhlIGVkaXRvciBpcyBjb25maWd1cmVkIHdpdGggYW4gdW5yZWNvZ25pemVkIEtleWJpbmRpbmdTZXJ2aWNlJyk7XG5cdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0fVxuXG5cdHJldHVybiBrZXliaW5kaW5nU2VydmljZS5hZGREeW5hbWljS2V5YmluZGluZ3MocnVsZXMubWFwKChydWxlKSA9PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtleWJpbmRpbmc6IHJ1bGUua2V5YmluZGluZyxcblx0XHRcdGNvbW1hbmQ6IHJ1bGUuY29tbWFuZCxcblx0XHRcdGNvbW1hbmRBcmdzOiBydWxlLmNvbW1hbmRBcmdzLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUocnVsZS53aGVuKSxcblx0XHR9O1xuXHR9KSk7XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IGVkaXRvciBtb2RlbC5cbiAqIFlvdSBjYW4gc3BlY2lmeSB0aGUgbGFuZ3VhZ2UgdGhhdCBzaG91bGQgYmUgc2V0IGZvciB0aGlzIG1vZGVsIG9yIGxldCB0aGUgbGFuZ3VhZ2UgYmUgaW5mZXJyZWQgZnJvbSB0aGUgYHVyaWAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb2RlbCh2YWx1ZTogc3RyaW5nLCBsYW5ndWFnZT86IHN0cmluZywgdXJpPzogVVJJKTogSVRleHRNb2RlbCB7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGNvbnN0IGxhbmd1YWdlSWQgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VJZEJ5TWltZVR5cGUobGFuZ3VhZ2UpIHx8IGxhbmd1YWdlO1xuXHRyZXR1cm4gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSU1vZGVsU2VydmljZSksXG5cdFx0bGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdHZhbHVlLFxuXHRcdGxhbmd1YWdlSWQsXG5cdFx0dXJpXG5cdCk7XG59XG5cbi8qKlxuICogQ2hhbmdlIHRoZSBsYW5ndWFnZSBmb3IgYSBtb2RlbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldE1vZGVsTGFuZ3VhZ2UobW9kZWw6IElUZXh0TW9kZWwsIG1pbWVUeXBlT3JMYW5ndWFnZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlNaW1lVHlwZShtaW1lVHlwZU9yTGFuZ3VhZ2VJZCkgfHwgbWltZVR5cGVPckxhbmd1YWdlSWQgfHwgUExBSU5URVhUX0xBTkdVQUdFX0lEO1xuXHRtb2RlbC5zZXRMYW5ndWFnZShsYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChsYW5ndWFnZUlkKSk7XG59XG5cbi8qKlxuICogU2V0IHRoZSBtYXJrZXJzIGZvciBhIG1vZGVsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0TW9kZWxNYXJrZXJzKG1vZGVsOiBJVGV4dE1vZGVsLCBvd25lcjogc3RyaW5nLCBtYXJrZXJzOiBJTWFya2VyRGF0YVtdKTogdm9pZCB7XG5cdGlmIChtb2RlbCkge1xuXHRcdGNvbnN0IG1hcmtlclNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElNYXJrZXJTZXJ2aWNlKTtcblx0XHRtYXJrZXJTZXJ2aWNlLmNoYW5nZU9uZShvd25lciwgbW9kZWwudXJpLCBtYXJrZXJzKTtcblx0fVxufVxuXG4vKipcbiAqIFJlbW92ZSBhbGwgbWFya2VycyBvZiBhbiBvd25lci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUFsbE1hcmtlcnMob3duZXI6IHN0cmluZykge1xuXHRjb25zdCBtYXJrZXJTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTWFya2VyU2VydmljZSk7XG5cdG1hcmtlclNlcnZpY2UuY2hhbmdlQWxsKG93bmVyLCBbXSk7XG59XG5cbi8qKlxuICogR2V0IG1hcmtlcnMgZm9yIG93bmVyIGFuZC9vciByZXNvdXJjZVxuICpcbiAqIEByZXR1cm5zIGxpc3Qgb2YgbWFya2Vyc1xuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TW9kZWxNYXJrZXJzKGZpbHRlcjogeyBvd25lcj86IHN0cmluZzsgcmVzb3VyY2U/OiBVUkk7IHRha2U/OiBudW1iZXIgfSk6IElNYXJrZXJbXSB7XG5cdGNvbnN0IG1hcmtlclNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElNYXJrZXJTZXJ2aWNlKTtcblx0cmV0dXJuIG1hcmtlclNlcnZpY2UucmVhZChmaWx0ZXIpO1xufVxuXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBtYXJrZXJzIGNoYW5nZSBmb3IgYSBtb2RlbC5cbiAqIEBldmVudFxuICovXG5leHBvcnQgZnVuY3Rpb24gb25EaWRDaGFuZ2VNYXJrZXJzKGxpc3RlbmVyOiAoZTogcmVhZG9ubHkgVVJJW10pID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG1hcmtlclNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElNYXJrZXJTZXJ2aWNlKTtcblx0cmV0dXJuIG1hcmtlclNlcnZpY2Uub25NYXJrZXJDaGFuZ2VkKGxpc3RlbmVyKTtcbn1cblxuLyoqXG4gKiBHZXQgdGhlIG1vZGVsIHRoYXQgaGFzIGB1cmlgIGlmIGl0IGV4aXN0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldE1vZGVsKHVyaTogVVJJKTogSVRleHRNb2RlbCB8IG51bGwge1xuXHRjb25zdCBtb2RlbFNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXHRyZXR1cm4gbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHVyaSk7XG59XG5cbi8qKlxuICogR2V0IGFsbCB0aGUgY3JlYXRlZCBtb2RlbHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2RlbHMoKTogSVRleHRNb2RlbFtdIHtcblx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTW9kZWxTZXJ2aWNlKTtcblx0cmV0dXJuIG1vZGVsU2VydmljZS5nZXRNb2RlbHMoKTtcbn1cblxuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYSBtb2RlbCBpcyBjcmVhdGVkLlxuICogQGV2ZW50XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvbkRpZENyZWF0ZU1vZGVsKGxpc3RlbmVyOiAobW9kZWw6IElUZXh0TW9kZWwpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG1vZGVsU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSU1vZGVsU2VydmljZSk7XG5cdHJldHVybiBtb2RlbFNlcnZpY2Uub25Nb2RlbEFkZGVkKGxpc3RlbmVyKTtcbn1cblxuLyoqXG4gKiBFbWl0dGVkIHJpZ2h0IGJlZm9yZSBhIG1vZGVsIGlzIGRpc3Bvc2VkLlxuICogQGV2ZW50XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvbldpbGxEaXNwb3NlTW9kZWwobGlzdGVuZXI6IChtb2RlbDogSVRleHRNb2RlbCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTW9kZWxTZXJ2aWNlKTtcblx0cmV0dXJuIG1vZGVsU2VydmljZS5vbk1vZGVsUmVtb3ZlZChsaXN0ZW5lcik7XG59XG5cbi8qKlxuICogRW1pdHRlZCB3aGVuIGEgZGlmZmVyZW50IGxhbmd1YWdlIGlzIHNldCB0byBhIG1vZGVsLlxuICogQGV2ZW50XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UobGlzdGVuZXI6IChlOiB7IHJlYWRvbmx5IG1vZGVsOiBJVGV4dE1vZGVsOyByZWFkb25seSBvbGRMYW5ndWFnZTogc3RyaW5nIH0pID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG1vZGVsU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSU1vZGVsU2VydmljZSk7XG5cdHJldHVybiBtb2RlbFNlcnZpY2Uub25Nb2RlbExhbmd1YWdlQ2hhbmdlZCgoZSkgPT4ge1xuXHRcdGxpc3RlbmVyKHtcblx0XHRcdG1vZGVsOiBlLm1vZGVsLFxuXHRcdFx0b2xkTGFuZ3VhZ2U6IGUub2xkTGFuZ3VhZ2VJZFxuXHRcdH0pO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgd2ViIHdvcmtlciB0aGF0IGhhcyBtb2RlbCBzeW5jaW5nIGNhcGFiaWxpdGllcyBidWlsdCBpbi5cbiAqIFNwZWNpZnkgYW4gQU1EIG1vZHVsZSB0byBsb2FkIHRoYXQgd2lsbCBgY3JlYXRlYCBhbiBvYmplY3QgdGhhdCB3aWxsIGJlIHByb3hpZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXZWJXb3JrZXI8VCBleHRlbmRzIG9iamVjdD4ob3B0czogSUludGVybmFsV2ViV29ya2VyT3B0aW9ucyk6IE1vbmFjb1dlYldvcmtlcjxUPiB7XG5cdHJldHVybiBhY3R1YWxDcmVhdGVXZWJXb3JrZXI8VD4oU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTW9kZWxTZXJ2aWNlKSwgU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJV2ViV29ya2VyU2VydmljZSksIG9wdHMpO1xufVxuXG4vKipcbiAqIENvbG9yaXplIHRoZSBjb250ZW50cyBvZiBgZG9tTm9kZWAgdXNpbmcgYXR0cmlidXRlIGBkYXRhLWxhbmdgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29sb3JpemVFbGVtZW50KGRvbU5vZGU6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBJQ29sb3JpemVyRWxlbWVudE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0Y29uc3QgdGhlbWVTZXJ2aWNlID0gPFN0YW5kYWxvbmVUaGVtZVNlcnZpY2U+U3RhbmRhbG9uZVNlcnZpY2VzLmdldChJU3RhbmRhbG9uZVRoZW1lU2VydmljZSk7XG5cdHJldHVybiBDb2xvcml6ZXIuY29sb3JpemVFbGVtZW50KHRoZW1lU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBkb21Ob2RlLCBvcHRpb25zKS50aGVuKCgpID0+IHtcblx0XHR0aGVtZVNlcnZpY2UucmVnaXN0ZXJFZGl0b3JDb250YWluZXIoZG9tTm9kZSk7XG5cdH0pO1xufVxuXG4vKipcbiAqIENvbG9yaXplIGB0ZXh0YCB1c2luZyBsYW5ndWFnZSBgbGFuZ3VhZ2VJZGAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb2xvcml6ZSh0ZXh0OiBzdHJpbmcsIGxhbmd1YWdlSWQ6IHN0cmluZywgb3B0aW9uczogSUNvbG9yaXplck9wdGlvbnMpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRjb25zdCB0aGVtZVNlcnZpY2UgPSA8U3RhbmRhbG9uZVRoZW1lU2VydmljZT5TdGFuZGFsb25lU2VydmljZXMuZ2V0KElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlKTtcblx0dGhlbWVTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yQ29udGFpbmVyKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keSk7XG5cdHJldHVybiBDb2xvcml6ZXIuY29sb3JpemUobGFuZ3VhZ2VTZXJ2aWNlLCB0ZXh0LCBsYW5ndWFnZUlkLCBvcHRpb25zKTtcbn1cblxuLyoqXG4gKiBDb2xvcml6ZSBhIGxpbmUgaW4gYSBtb2RlbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbG9yaXplTW9kZWxMaW5lKG1vZGVsOiBJVGV4dE1vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIsIHRhYlNpemU6IG51bWJlciA9IDQpOiBzdHJpbmcge1xuXHRjb25zdCB0aGVtZVNlcnZpY2UgPSA8U3RhbmRhbG9uZVRoZW1lU2VydmljZT5TdGFuZGFsb25lU2VydmljZXMuZ2V0KElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlKTtcblx0dGhlbWVTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yQ29udGFpbmVyKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keSk7XG5cdHJldHVybiBDb2xvcml6ZXIuY29sb3JpemVNb2RlbExpbmUobW9kZWwsIGxpbmVOdW1iZXIsIHRhYlNpemUpO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5mdW5jdGlvbiBnZXRTYWZlVG9rZW5pemF0aW9uU3VwcG9ydChsYW5ndWFnZTogc3RyaW5nKTogT21pdDxsYW5ndWFnZXMuSVRva2VuaXphdGlvblN1cHBvcnQsICd0b2tlbml6ZUVuY29kZWQnPiB7XG5cdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQgPSBsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0KGxhbmd1YWdlKTtcblx0aWYgKHRva2VuaXphdGlvblN1cHBvcnQpIHtcblx0XHRyZXR1cm4gdG9rZW5pemF0aW9uU3VwcG9ydDtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gTnVsbFN0YXRlLFxuXHRcdHRva2VuaXplOiAobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlKSA9PiBudWxsVG9rZW5pemUobGFuZ3VhZ2UsIHN0YXRlKVxuXHR9O1xufVxuXG4vKipcbiAqIFRva2VuaXplIGB0ZXh0YCB1c2luZyBsYW5ndWFnZSBgbGFuZ3VhZ2VJZGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRva2VuaXplKHRleHQ6IHN0cmluZywgbGFuZ3VhZ2VJZDogc3RyaW5nKTogbGFuZ3VhZ2VzLlRva2VuW11bXSB7XG5cdC8vIE5lZWRlZCBpbiBvcmRlciB0byBnZXQgdGhlIG1vZGUgcmVnaXN0ZXJlZCBmb3Igc3Vic2VxdWVudCBsb29rLXVwc1xuXHRsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0T3JDcmVhdGUobGFuZ3VhZ2VJZCk7XG5cblx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydCA9IGdldFNhZmVUb2tlbml6YXRpb25TdXBwb3J0KGxhbmd1YWdlSWQpO1xuXHRjb25zdCBsaW5lcyA9IHNwbGl0TGluZXModGV4dCk7XG5cdGNvbnN0IHJlc3VsdDogbGFuZ3VhZ2VzLlRva2VuW11bXSA9IFtdO1xuXHRsZXQgc3RhdGUgPSB0b2tlbml6YXRpb25TdXBwb3J0LmdldEluaXRpYWxTdGF0ZSgpO1xuXHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGluZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCBsaW5lID0gbGluZXNbaV07XG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uUmVzdWx0ID0gdG9rZW5pemF0aW9uU3VwcG9ydC50b2tlbml6ZShsaW5lLCB0cnVlLCBzdGF0ZSk7XG5cblx0XHRyZXN1bHRbaV0gPSB0b2tlbml6YXRpb25SZXN1bHQudG9rZW5zO1xuXHRcdHN0YXRlID0gdG9rZW5pemF0aW9uUmVzdWx0LmVuZFN0YXRlO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogRGVmaW5lIGEgbmV3IHRoZW1lIG9yIHVwZGF0ZSBhbiBleGlzdGluZyB0aGVtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZVRoZW1lKHRoZW1lTmFtZTogc3RyaW5nLCB0aGVtZURhdGE6IElTdGFuZGFsb25lVGhlbWVEYXRhKTogdm9pZCB7XG5cdGNvbnN0IHN0YW5kYWxvbmVUaGVtZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlKTtcblx0c3RhbmRhbG9uZVRoZW1lU2VydmljZS5kZWZpbmVUaGVtZSh0aGVtZU5hbWUsIHRoZW1lRGF0YSk7XG59XG5cbi8qKlxuICogU3dpdGNoZXMgdG8gYSB0aGVtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldFRoZW1lKHRoZW1lTmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IHN0YW5kYWxvbmVUaGVtZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlKTtcblx0c3RhbmRhbG9uZVRoZW1lU2VydmljZS5zZXRUaGVtZSh0aGVtZU5hbWUpO1xufVxuXG4vKipcbiAqIENsZWFycyBhbGwgY2FjaGVkIGZvbnQgbWVhc3VyZW1lbnRzIGFuZCB0cmlnZ2VycyByZS1tZWFzdXJlbWVudC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbWVhc3VyZUZvbnRzKCk6IHZvaWQge1xuXHRGb250TWVhc3VyZW1lbnRzLmNsZWFyQWxsRm9udEluZm9zKCk7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBjb21tYW5kLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDb21tYW5kKGlkOiBzdHJpbmcsIGhhbmRsZXI6IChhY2Nlc3NvcjogYW55LCAuLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0cmV0dXJuIENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHsgaWQsIGhhbmRsZXIgfSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpbmtPcGVuZXIge1xuXHRvcGVuKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPjtcbn1cblxuLyoqXG4gKiBSZWdpc3RlcnMgYSBoYW5kbGVyIHRoYXQgaXMgY2FsbGVkIHdoZW4gYSBsaW5rIGlzIG9wZW5lZCBpbiBhbnkgZWRpdG9yLiBUaGUgaGFuZGxlciBjYWxsYmFjayBzaG91bGQgcmV0dXJuIGB0cnVlYCBpZiB0aGUgbGluayB3YXMgaGFuZGxlZCBhbmQgYGZhbHNlYCBvdGhlcndpc2UuXG4gKiBUaGUgaGFuZGxlciB0aGF0IHdhcyByZWdpc3RlcmVkIGxhc3Qgd2lsbCBiZSBjYWxsZWQgZmlyc3Qgd2hlbiBhIGxpbmsgaXMgb3BlbmVkLlxuICpcbiAqIFJldHVybnMgYSBkaXNwb3NhYmxlIHRoYXQgY2FuIHVucmVnaXN0ZXIgdGhlIG9wZW5lciBhZ2Fpbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyTGlua09wZW5lcihvcGVuZXI6IElMaW5rT3BlbmVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJT3BlbmVyU2VydmljZSk7XG5cdHJldHVybiBvcGVuZXJTZXJ2aWNlLnJlZ2lzdGVyT3BlbmVyKHtcblx0XHRhc3luYyBvcGVuKHJlc291cmNlOiBzdHJpbmcgfCBVUkkpIHtcblx0XHRcdGlmICh0eXBlb2YgcmVzb3VyY2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJlc291cmNlID0gVVJJLnBhcnNlKHJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBvcGVuZXIub3BlbihyZXNvdXJjZSk7XG5cdFx0fVxuXHR9KTtcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGFuIG9iamVjdCB0aGF0IGNhbiBoYW5kbGUgZWRpdG9yIG9wZW4gb3BlcmF0aW9ucyAoZS5nLiB3aGVuIFwiZ28gdG8gZGVmaW5pdGlvblwiIGlzIGNhbGxlZFxuICogd2l0aCBhIHJlc291cmNlIG90aGVyIHRoYW4gdGhlIGN1cnJlbnQgbW9kZWwpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDb2RlRWRpdG9yT3BlbmVyIHtcblx0LyoqXG5cdCAqIENhbGxiYWNrIHRoYXQgaXMgaW52b2tlZCB3aGVuIGEgcmVzb3VyY2Ugb3RoZXIgdGhhbiB0aGUgY3VycmVudCBtb2RlbCBzaG91bGQgYmUgb3BlbmVkIChlLmcuIHdoZW4gXCJnbyB0byBkZWZpbml0aW9uXCIgaXMgY2FsbGVkKS5cblx0ICogVGhlIGNhbGxiYWNrIHNob3VsZCByZXR1cm4gYHRydWVgIGlmIHRoZSByZXF1ZXN0IHdhcyBoYW5kbGVkIGFuZCBgZmFsc2VgIG90aGVyd2lzZS5cblx0ICogQHBhcmFtIHNvdXJjZSBUaGUgY29kZSBlZGl0b3IgaW5zdGFuY2UgdGhhdCBpbml0aWF0ZWQgdGhlIHJlcXVlc3QuXG5cdCAqIEBwYXJhbSByZXNvdXJjZSBUaGUgVVJJIG9mIHRoZSByZXNvdXJjZSB0aGF0IHNob3VsZCBiZSBvcGVuZWQuXG5cdCAqIEBwYXJhbSBzZWxlY3Rpb25PclBvc2l0aW9uIEFuIG9wdGlvbmFsIHBvc2l0aW9uIG9yIHNlbGVjdGlvbiBpbnNpZGUgdGhlIG1vZGVsIGNvcnJlc3BvbmRpbmcgdG8gYHJlc291cmNlYCB0aGF0IGNhbiBiZSB1c2VkIHRvIHNldCB0aGUgY3Vyc29yLlxuXHQgKi9cblx0b3BlbkNvZGVFZGl0b3Ioc291cmNlOiBJQ29kZUVkaXRvciwgcmVzb3VyY2U6IFVSSSwgc2VsZWN0aW9uT3JQb3NpdGlvbj86IElSYW5nZSB8IElQb3NpdGlvbik6IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+O1xufVxuXG4vKipcbiAqIFJlZ2lzdGVycyBhIGhhbmRsZXIgdGhhdCBpcyBjYWxsZWQgd2hlbiBhIHJlc291cmNlIG90aGVyIHRoYW4gdGhlIGN1cnJlbnQgbW9kZWwgc2hvdWxkIGJlIG9wZW5lZCBpbiB0aGUgZWRpdG9yIChlLmcuIFwiZ28gdG8gZGVmaW5pdGlvblwiKS5cbiAqIFRoZSBoYW5kbGVyIGNhbGxiYWNrIHNob3VsZCByZXR1cm4gYHRydWVgIGlmIHRoZSByZXF1ZXN0IHdhcyBoYW5kbGVkIGFuZCBgZmFsc2VgIG90aGVyd2lzZS5cbiAqXG4gKiBSZXR1cm5zIGEgZGlzcG9zYWJsZSB0aGF0IGNhbiB1bnJlZ2lzdGVyIHRoZSBvcGVuZXIgYWdhaW4uXG4gKlxuICogSWYgbm8gaGFuZGxlciBpcyByZWdpc3RlcmVkIHRoZSBkZWZhdWx0IGJlaGF2aW9yIGlzIHRvIGRvIG5vdGhpbmcgZm9yIG1vZGVscyBvdGhlciB0aGFuIHRoZSBjdXJyZW50bHkgYXR0YWNoZWQgb25lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJFZGl0b3JPcGVuZXIob3BlbmVyOiBJQ29kZUVkaXRvck9wZW5lcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdHJldHVybiBjb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckNvZGVFZGl0b3JPcGVuSGFuZGxlcihhc3luYyAoaW5wdXQ6IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCwgc291cmNlOiBJQ29kZUVkaXRvciB8IG51bGwsIHNpZGVCeVNpZGU/OiBib29sZWFuKSA9PiB7XG5cdFx0aWYgKCFzb3VyY2UpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBpbnB1dC5vcHRpb25zPy5zZWxlY3Rpb247XG5cdFx0bGV0IHNlbGVjdGlvbk9yUG9zaXRpb246IElSYW5nZSB8IElQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoc2VsZWN0aW9uICYmIHR5cGVvZiBzZWxlY3Rpb24uZW5kTGluZU51bWJlciA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHNlbGVjdGlvbi5lbmRDb2x1bW4gPT09ICdudW1iZXInKSB7XG5cdFx0XHRzZWxlY3Rpb25PclBvc2l0aW9uID0gPElSYW5nZT5zZWxlY3Rpb247XG5cdFx0fSBlbHNlIGlmIChzZWxlY3Rpb24pIHtcblx0XHRcdHNlbGVjdGlvbk9yUG9zaXRpb24gPSB7IGxpbmVOdW1iZXI6IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogc2VsZWN0aW9uLnN0YXJ0Q29sdW1uIH07XG5cdFx0fVxuXHRcdGlmIChhd2FpdCBvcGVuZXIub3BlbkNvZGVFZGl0b3Ioc291cmNlLCBpbnB1dC5yZXNvdXJjZSwgc2VsZWN0aW9uT3JQb3NpdGlvbikpIHtcblx0XHRcdHJldHVybiBzb3VyY2U7IC8vIHJldHVybiBzb3VyY2UgZWRpdG9yIHRvIGluZGljYXRlIHRoYXQgdGhpcyBoYW5kbGVyIGhhcyBzdWNjZXNzZnVsbHkgaGFuZGxlZCB0aGUgb3BlbmluZ1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDsgLy8gZmFsbGJhY2sgdG8gb3RoZXIgcmVnaXN0ZXJlZCBoYW5kbGVyc1xuXHR9KTtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1vbmFjb0VkaXRvckFQSSgpOiB0eXBlb2YgbW9uYWNvLmVkaXRvciB7XG5cdHJldHVybiB7XG5cdFx0Ly8gbWV0aG9kc1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNyZWF0ZTogPGFueT5jcmVhdGUsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Z2V0RWRpdG9yczogPGFueT5nZXRFZGl0b3JzLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGdldERpZmZFZGl0b3JzOiA8YW55PmdldERpZmZFZGl0b3JzLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdG9uRGlkQ3JlYXRlRWRpdG9yOiA8YW55Pm9uRGlkQ3JlYXRlRWRpdG9yLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdG9uRGlkQ3JlYXRlRGlmZkVkaXRvcjogPGFueT5vbkRpZENyZWF0ZURpZmZFZGl0b3IsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y3JlYXRlRGlmZkVkaXRvcjogPGFueT5jcmVhdGVEaWZmRWRpdG9yLFxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YWRkQ29tbWFuZDogPGFueT5hZGRDb21tYW5kLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGFkZEVkaXRvckFjdGlvbjogPGFueT5hZGRFZGl0b3JBY3Rpb24sXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YWRkS2V5YmluZGluZ1J1bGU6IDxhbnk+YWRkS2V5YmluZGluZ1J1bGUsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YWRkS2V5YmluZGluZ1J1bGVzOiA8YW55PmFkZEtleWJpbmRpbmdSdWxlcyxcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNyZWF0ZU1vZGVsOiA8YW55PmNyZWF0ZU1vZGVsLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHNldE1vZGVsTGFuZ3VhZ2U6IDxhbnk+c2V0TW9kZWxMYW5ndWFnZSxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRzZXRNb2RlbE1hcmtlcnM6IDxhbnk+c2V0TW9kZWxNYXJrZXJzLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGdldE1vZGVsTWFya2VyczogPGFueT5nZXRNb2RlbE1hcmtlcnMsXG5cdFx0cmVtb3ZlQWxsTWFya2VyczogcmVtb3ZlQWxsTWFya2Vycyxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRvbkRpZENoYW5nZU1hcmtlcnM6IDxhbnk+b25EaWRDaGFuZ2VNYXJrZXJzLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGdldE1vZGVsczogPGFueT5nZXRNb2RlbHMsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Z2V0TW9kZWw6IDxhbnk+Z2V0TW9kZWwsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0b25EaWRDcmVhdGVNb2RlbDogPGFueT5vbkRpZENyZWF0ZU1vZGVsLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdG9uV2lsbERpc3Bvc2VNb2RlbDogPGFueT5vbldpbGxEaXNwb3NlTW9kZWwsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0b25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlOiA8YW55Pm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSxcblxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y3JlYXRlV2ViV29ya2VyOiA8YW55PmNyZWF0ZVdlYldvcmtlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb2xvcml6ZUVsZW1lbnQ6IDxhbnk+Y29sb3JpemVFbGVtZW50LFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbG9yaXplOiA8YW55PmNvbG9yaXplLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbG9yaXplTW9kZWxMaW5lOiA8YW55PmNvbG9yaXplTW9kZWxMaW5lLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHRva2VuaXplOiA8YW55PnRva2VuaXplLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGRlZmluZVRoZW1lOiA8YW55PmRlZmluZVRoZW1lLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHNldFRoZW1lOiA8YW55PnNldFRoZW1lLFxuXHRcdHJlbWVhc3VyZUZvbnRzOiByZW1lYXN1cmVGb250cyxcblx0XHRyZWdpc3RlckNvbW1hbmQ6IHJlZ2lzdGVyQ29tbWFuZCxcblxuXHRcdHJlZ2lzdGVyTGlua09wZW5lcjogcmVnaXN0ZXJMaW5rT3BlbmVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyRWRpdG9yT3BlbmVyOiA8YW55PnJlZ2lzdGVyRWRpdG9yT3BlbmVyLFxuXG5cdFx0Ly8gZW51bXNcblx0XHRBY2Nlc3NpYmlsaXR5U3VwcG9ydDogc3RhbmRhbG9uZUVudW1zLkFjY2Vzc2liaWxpdHlTdXBwb3J0LFxuXHRcdENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2U6IHN0YW5kYWxvbmVFbnVtcy5Db250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLFxuXHRcdEN1cnNvckNoYW5nZVJlYXNvbjogc3RhbmRhbG9uZUVudW1zLkN1cnNvckNoYW5nZVJlYXNvbixcblx0XHREZWZhdWx0RW5kT2ZMaW5lOiBzdGFuZGFsb25lRW51bXMuRGVmYXVsdEVuZE9mTGluZSxcblx0XHRFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3k6IHN0YW5kYWxvbmVFbnVtcy5FZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3ksXG5cdFx0RWRpdG9yT3B0aW9uOiBzdGFuZGFsb25lRW51bXMuRWRpdG9yT3B0aW9uLFxuXHRcdEVuZE9mTGluZVByZWZlcmVuY2U6IHN0YW5kYWxvbmVFbnVtcy5FbmRPZkxpbmVQcmVmZXJlbmNlLFxuXHRcdEVuZE9mTGluZVNlcXVlbmNlOiBzdGFuZGFsb25lRW51bXMuRW5kT2ZMaW5lU2VxdWVuY2UsXG5cdFx0TWluaW1hcFBvc2l0aW9uOiBzdGFuZGFsb25lRW51bXMuTWluaW1hcFBvc2l0aW9uLFxuXHRcdE1pbmltYXBTZWN0aW9uSGVhZGVyU3R5bGU6IHN0YW5kYWxvbmVFbnVtcy5NaW5pbWFwU2VjdGlvbkhlYWRlclN0eWxlLFxuXHRcdE1vdXNlVGFyZ2V0VHlwZTogc3RhbmRhbG9uZUVudW1zLk1vdXNlVGFyZ2V0VHlwZSxcblx0XHRPdmVybGF5V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlOiBzdGFuZGFsb25lRW51bXMuT3ZlcmxheVdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSxcblx0XHRPdmVydmlld1J1bGVyTGFuZTogc3RhbmRhbG9uZUVudW1zLk92ZXJ2aWV3UnVsZXJMYW5lLFxuXHRcdEdseXBoTWFyZ2luTGFuZTogc3RhbmRhbG9uZUVudW1zLkdseXBoTWFyZ2luTGFuZSxcblx0XHRSZW5kZXJMaW5lTnVtYmVyc1R5cGU6IHN0YW5kYWxvbmVFbnVtcy5SZW5kZXJMaW5lTnVtYmVyc1R5cGUsXG5cdFx0UmVuZGVyTWluaW1hcDogc3RhbmRhbG9uZUVudW1zLlJlbmRlck1pbmltYXAsXG5cdFx0U2Nyb2xsYmFyVmlzaWJpbGl0eTogc3RhbmRhbG9uZUVudW1zLlNjcm9sbGJhclZpc2liaWxpdHksXG5cdFx0U2Nyb2xsVHlwZTogc3RhbmRhbG9uZUVudW1zLlNjcm9sbFR5cGUsXG5cdFx0VGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGU6IHN0YW5kYWxvbmVFbnVtcy5UZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZSxcblx0XHRUZXh0RWRpdG9yQ3Vyc29yU3R5bGU6IHN0YW5kYWxvbmVFbnVtcy5UZXh0RWRpdG9yQ3Vyc29yU3R5bGUsXG5cdFx0VHJhY2tlZFJhbmdlU3RpY2tpbmVzczogc3RhbmRhbG9uZUVudW1zLlRyYWNrZWRSYW5nZVN0aWNraW5lc3MsXG5cdFx0V3JhcHBpbmdJbmRlbnQ6IHN0YW5kYWxvbmVFbnVtcy5XcmFwcGluZ0luZGVudCxcblx0XHRJbmplY3RlZFRleHRDdXJzb3JTdG9wczogc3RhbmRhbG9uZUVudW1zLkluamVjdGVkVGV4dEN1cnNvclN0b3BzLFxuXHRcdFBvc2l0aW9uQWZmaW5pdHk6IHN0YW5kYWxvbmVFbnVtcy5Qb3NpdGlvbkFmZmluaXR5LFxuXHRcdFNob3dMaWdodGJ1bGJJY29uTW9kZTogc3RhbmRhbG9uZUVudW1zLlNob3dMaWdodGJ1bGJJY29uTW9kZSxcblx0XHRUZXh0RGlyZWN0aW9uOiBzdGFuZGFsb25lRW51bXMuVGV4dERpcmVjdGlvbixcblxuXHRcdC8vIGNsYXNzZXNcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50OiA8YW55PkNvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0QmFyZUZvbnRJbmZvOiA8YW55PkJhcmVGb250SW5mbyxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRGb250SW5mbzogPGFueT5Gb250SW5mbyxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRUZXh0TW9kZWxSZXNvbHZlZE9wdGlvbnM6IDxhbnk+VGV4dE1vZGVsUmVzb2x2ZWRPcHRpb25zLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdEZpbmRNYXRjaDogPGFueT5GaW5kTWF0Y2gsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0QXBwbHlVcGRhdGVSZXN1bHQ6IDxhbnk+QXBwbHlVcGRhdGVSZXN1bHQsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0RWRpdG9yWm9vbTogPGFueT5FZGl0b3Jab29tLFxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y3JlYXRlTXVsdGlGaWxlRGlmZkVkaXRvcjogPGFueT5jcmVhdGVNdWx0aUZpbGVEaWZmRWRpdG9yLFxuXG5cdFx0Ly8gdmFyc1xuXHRcdEVkaXRvclR5cGU6IEVkaXRvclR5cGUsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0RWRpdG9yT3B0aW9uczogPGFueT5FZGl0b3JPcHRpb25zXG5cblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLE9BQU87QUFDUCxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHFCQUF1QztBQUNoRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFxRCxtQkFBbUIsNkJBQTZCO0FBQ3JHLFNBQVMsbUJBQW1CLDJCQUEyQixxQkFBcUI7QUFDNUUsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjLGdCQUFnQjtBQUd2QyxTQUFTLGtCQUErQjtBQUN4QyxZQUFZLGVBQWU7QUFDM0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxXQUFXLG9CQUFvQjtBQUN4QyxTQUFTLFdBQXVCLGdDQUFnQztBQUNoRSxTQUFTLHFCQUFxQjtBQUM5QixZQUFZLHFCQUFxQjtBQUNqQyxTQUFTLGlCQUE4RDtBQUN2RSxTQUEwSix1QkFBdUIsa0JBQWtCLHVCQUF1QjtBQUMxTixTQUFrQyw2QkFBNkIsMEJBQTBCO0FBRXpGLFNBQStCLCtCQUErQjtBQUM5RCxTQUFvQixRQUFRLG9CQUFvQjtBQUNoRCxTQUFTLHdCQUF5QztBQUNsRCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLDBCQUEwQjtBQUNuQyxTQUErQixzQkFBc0I7QUFDckQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFPM0IsU0FBUyxPQUFPLFlBQXlCLFNBQWdELFVBQTJEO0FBQzFKLFFBQU0sdUJBQXVCLG1CQUFtQixXQUFXLFlBQVksQ0FBQyxDQUFDO0FBQ3pFLFNBQU8scUJBQXFCLGVBQWUsa0JBQWtCLFlBQVksT0FBTztBQUNqRjtBQU9PLFNBQVMsa0JBQWtCLFVBQTBEO0FBQzNGLFFBQU0sb0JBQW9CLG1CQUFtQixJQUFJLGtCQUFrQjtBQUNuRSxTQUFPLGtCQUFrQixnQkFBZ0IsQ0FBQyxXQUFXO0FBQ3BELGFBQVMsTUFBTTtBQUFBLEVBQ2hCLENBQUM7QUFDRjtBQU1PLFNBQVMsc0JBQXNCLFVBQTBEO0FBQy9GLFFBQU0sb0JBQW9CLG1CQUFtQixJQUFJLGtCQUFrQjtBQUNuRSxTQUFPLGtCQUFrQixnQkFBZ0IsQ0FBQyxXQUFXO0FBQ3BELGFBQXNCLE1BQU07QUFBQSxFQUM3QixDQUFDO0FBQ0Y7QUFLTyxTQUFTLGFBQXFDO0FBQ3BELFFBQU0sb0JBQW9CLG1CQUFtQixJQUFJLGtCQUFrQjtBQUNuRSxTQUFPLGtCQUFrQixnQkFBZ0I7QUFDMUM7QUFLTyxTQUFTLGlCQUF5QztBQUN4RCxRQUFNLG9CQUFvQixtQkFBbUIsSUFBSSxrQkFBa0I7QUFDbkUsU0FBTyxrQkFBa0IsZ0JBQWdCO0FBQzFDO0FBT08sU0FBUyxpQkFBaUIsWUFBeUIsU0FBb0QsVUFBMkQ7QUFDeEssUUFBTSx1QkFBdUIsbUJBQW1CLFdBQVcsWUFBWSxDQUFDLENBQUM7QUFDekUsU0FBTyxxQkFBcUIsZUFBZSx1QkFBdUIsWUFBWSxPQUFPO0FBQ3RGO0FBRU8sU0FBUywwQkFBMEIsWUFBeUIsVUFBb0M7QUFDdEcsUUFBTSx1QkFBdUIsbUJBQW1CLFdBQVcsWUFBWSxDQUFDLENBQUM7QUFDekUsU0FBTyxJQUFJLHNCQUFzQixZQUFZLENBQUMsR0FBRyxRQUFXLG9CQUFvQjtBQUNqRjtBQW1CTyxTQUFTLFdBQVcsWUFBNkM7QUFDdkUsTUFBSyxPQUFPLFdBQVcsT0FBTyxZQUFjLE9BQU8sV0FBVyxRQUFRLFlBQWE7QUFDbEYsVUFBTSxJQUFJLE1BQU0scUVBQXFFO0FBQUEsRUFDdEY7QUFDQSxTQUFPLGlCQUFpQixnQkFBZ0IsV0FBVyxJQUFJLFdBQVcsR0FBRztBQUN0RTtBQUtPLFNBQVMsZ0JBQWdCLFlBQTRDO0FBQzNFLE1BQUssT0FBTyxXQUFXLE9BQU8sWUFBYyxPQUFPLFdBQVcsVUFBVSxZQUFjLE9BQU8sV0FBVyxRQUFRLFlBQWE7QUFDNUgsVUFBTSxJQUFJLE1BQU0sNkVBQTZFO0FBQUEsRUFDOUY7QUFFQSxRQUFNLGVBQWUsZUFBZSxZQUFZLFdBQVcsWUFBWTtBQUN2RSxRQUFNLE1BQU0sQ0FBQyxhQUErQixTQUEwQztBQUNyRixXQUFPLGNBQWMsaUJBQWlCLFVBQVUsTUFBTSxjQUFjLENBQUNBLFdBQVUsUUFBUUMsVUFBUyxRQUFRLFFBQVEsV0FBVyxJQUFJLFFBQVEsR0FBR0EsS0FBSSxDQUFDLENBQUM7QUFBQSxFQUNqSjtBQUVBLFFBQU0sWUFBWSxJQUFJLGdCQUFnQjtBQUd0QyxZQUFVLElBQUksaUJBQWlCLGdCQUFnQixXQUFXLElBQUksR0FBRyxDQUFDO0FBR2xFLE1BQUksV0FBVyxvQkFBb0I7QUFDbEMsVUFBTSxXQUFzQjtBQUFBLE1BQzNCLFNBQVM7QUFBQSxRQUNSLElBQUksV0FBVztBQUFBLFFBQ2YsT0FBTyxXQUFXO0FBQUEsTUFDbkI7QUFBQSxNQUNBLE1BQU07QUFBQSxNQUNOLE9BQU8sV0FBVztBQUFBLE1BQ2xCLE9BQU8sV0FBVyxvQkFBb0I7QUFBQSxJQUN2QztBQUNBLGNBQVUsSUFBSSxhQUFhLGVBQWUsT0FBTyxlQUFlLFFBQVEsQ0FBQztBQUFBLEVBQzFFO0FBR0EsTUFBSSxNQUFNLFFBQVEsV0FBVyxXQUFXLEdBQUc7QUFDMUMsVUFBTSxvQkFBb0IsbUJBQW1CLElBQUksa0JBQWtCO0FBQ25FLFFBQUksRUFBRSw2QkFBNkIsOEJBQThCO0FBQ2hFLGNBQVEsS0FBSywrRkFBK0Y7QUFBQSxJQUM3RyxPQUFPO0FBQ04sWUFBTSxrQkFBa0IsZUFBZSxJQUFJLGNBQWMsZUFBZSxZQUFZLFdBQVcsaUJBQWlCLENBQUM7QUFDakgsZ0JBQVUsSUFBSSxrQkFBa0Isc0JBQXNCLFdBQVcsWUFBWSxJQUFJLENBQUMsZUFBZTtBQUNoRyxlQUFPO0FBQUEsVUFDTjtBQUFBLFVBQ0EsU0FBUyxXQUFXO0FBQUEsVUFDcEIsTUFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNELENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDSjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFlTyxTQUFTLGtCQUFrQixNQUFvQztBQUNyRSxTQUFPLG1CQUFtQixDQUFDLElBQUksQ0FBQztBQUNqQztBQUtPLFNBQVMsbUJBQW1CLE9BQXVDO0FBQ3pFLFFBQU0sb0JBQW9CLG1CQUFtQixJQUFJLGtCQUFrQjtBQUNuRSxNQUFJLEVBQUUsNkJBQTZCLDhCQUE4QjtBQUNoRSxZQUFRLEtBQUssK0ZBQStGO0FBQzVHLFdBQU8sV0FBVztBQUFBLEVBQ25CO0FBRUEsU0FBTyxrQkFBa0Isc0JBQXNCLE1BQU0sSUFBSSxDQUFDLFNBQVM7QUFDbEUsV0FBTztBQUFBLE1BQ04sWUFBWSxLQUFLO0FBQUEsTUFDakIsU0FBUyxLQUFLO0FBQUEsTUFDZCxhQUFhLEtBQUs7QUFBQSxNQUNsQixNQUFNLGVBQWUsWUFBWSxLQUFLLElBQUk7QUFBQSxJQUMzQztBQUFBLEVBQ0QsQ0FBQyxDQUFDO0FBQ0g7QUFNTyxTQUFTLFlBQVksT0FBZSxVQUFtQixLQUF1QjtBQUNwRixRQUFNLGtCQUFrQixtQkFBbUIsSUFBSSxnQkFBZ0I7QUFDL0QsUUFBTSxhQUFhLGdCQUFnQix3QkFBd0IsUUFBUSxLQUFLO0FBQ3hFLFNBQU87QUFBQSxJQUNOLG1CQUFtQixJQUFJLGFBQWE7QUFBQSxJQUNwQztBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFDRDtBQUtPLFNBQVMsaUJBQWlCLE9BQW1CLHNCQUFvQztBQUN2RixRQUFNLGtCQUFrQixtQkFBbUIsSUFBSSxnQkFBZ0I7QUFDL0QsUUFBTSxhQUFhLGdCQUFnQix3QkFBd0Isb0JBQW9CLEtBQUssd0JBQXdCO0FBQzVHLFFBQU0sWUFBWSxnQkFBZ0IsV0FBVyxVQUFVLENBQUM7QUFDekQ7QUFLTyxTQUFTLGdCQUFnQixPQUFtQixPQUFlLFNBQThCO0FBQy9GLE1BQUksT0FBTztBQUNWLFVBQU0sZ0JBQWdCLG1CQUFtQixJQUFJLGNBQWM7QUFDM0Qsa0JBQWMsVUFBVSxPQUFPLE1BQU0sS0FBSyxPQUFPO0FBQUEsRUFDbEQ7QUFDRDtBQUtPLFNBQVMsaUJBQWlCLE9BQWU7QUFDL0MsUUFBTSxnQkFBZ0IsbUJBQW1CLElBQUksY0FBYztBQUMzRCxnQkFBYyxVQUFVLE9BQU8sQ0FBQyxDQUFDO0FBQ2xDO0FBT08sU0FBUyxnQkFBZ0IsUUFBc0U7QUFDckcsUUFBTSxnQkFBZ0IsbUJBQW1CLElBQUksY0FBYztBQUMzRCxTQUFPLGNBQWMsS0FBSyxNQUFNO0FBQ2pDO0FBTU8sU0FBUyxtQkFBbUIsVUFBb0Q7QUFDdEYsUUFBTSxnQkFBZ0IsbUJBQW1CLElBQUksY0FBYztBQUMzRCxTQUFPLGNBQWMsZ0JBQWdCLFFBQVE7QUFDOUM7QUFLTyxTQUFTLFNBQVMsS0FBNkI7QUFDckQsUUFBTSxlQUFlLG1CQUFtQixJQUFJLGFBQWE7QUFDekQsU0FBTyxhQUFhLFNBQVMsR0FBRztBQUNqQztBQUtPLFNBQVMsWUFBMEI7QUFDekMsUUFBTSxlQUFlLG1CQUFtQixJQUFJLGFBQWE7QUFDekQsU0FBTyxhQUFhLFVBQVU7QUFDL0I7QUFNTyxTQUFTLGlCQUFpQixVQUFvRDtBQUNwRixRQUFNLGVBQWUsbUJBQW1CLElBQUksYUFBYTtBQUN6RCxTQUFPLGFBQWEsYUFBYSxRQUFRO0FBQzFDO0FBTU8sU0FBUyxtQkFBbUIsVUFBb0Q7QUFDdEYsUUFBTSxlQUFlLG1CQUFtQixJQUFJLGFBQWE7QUFDekQsU0FBTyxhQUFhLGVBQWUsUUFBUTtBQUM1QztBQU1PLFNBQVMseUJBQXlCLFVBQWtHO0FBQzFJLFFBQU0sZUFBZSxtQkFBbUIsSUFBSSxhQUFhO0FBQ3pELFNBQU8sYUFBYSx1QkFBdUIsQ0FBQyxNQUFNO0FBQ2pELGFBQVM7QUFBQSxNQUNSLE9BQU8sRUFBRTtBQUFBLE1BQ1QsYUFBYSxFQUFFO0FBQUEsSUFDaEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGO0FBTU8sU0FBUyxnQkFBa0MsTUFBcUQ7QUFDdEcsU0FBTyxzQkFBeUIsbUJBQW1CLElBQUksYUFBYSxHQUFHLG1CQUFtQixJQUFJLGlCQUFpQixHQUFHLElBQUk7QUFDdkg7QUFLTyxTQUFTLGdCQUFnQixTQUFzQixTQUFrRDtBQUN2RyxRQUFNLGtCQUFrQixtQkFBbUIsSUFBSSxnQkFBZ0I7QUFDL0QsUUFBTSxlQUF1QyxtQkFBbUIsSUFBSSx1QkFBdUI7QUFDM0YsU0FBTyxVQUFVLGdCQUFnQixjQUFjLGlCQUFpQixTQUFTLE9BQU8sRUFBRSxLQUFLLE1BQU07QUFDNUYsaUJBQWEsd0JBQXdCLE9BQU87QUFBQSxFQUM3QyxDQUFDO0FBQ0Y7QUFLTyxTQUFTLFNBQVMsTUFBYyxZQUFvQixTQUE2QztBQUN2RyxRQUFNLGtCQUFrQixtQkFBbUIsSUFBSSxnQkFBZ0I7QUFDL0QsUUFBTSxlQUF1QyxtQkFBbUIsSUFBSSx1QkFBdUI7QUFDM0YsZUFBYSx3QkFBd0IsV0FBVyxTQUFTLElBQUk7QUFDN0QsU0FBTyxVQUFVLFNBQVMsaUJBQWlCLE1BQU0sWUFBWSxPQUFPO0FBQ3JFO0FBS08sU0FBUyxrQkFBa0IsT0FBbUIsWUFBb0IsVUFBa0IsR0FBVztBQUNyRyxRQUFNLGVBQXVDLG1CQUFtQixJQUFJLHVCQUF1QjtBQUMzRixlQUFhLHdCQUF3QixXQUFXLFNBQVMsSUFBSTtBQUM3RCxTQUFPLFVBQVUsa0JBQWtCLE9BQU8sWUFBWSxPQUFPO0FBQzlEO0FBS0EsU0FBUywyQkFBMkIsVUFBMkU7QUFDOUcsUUFBTSxzQkFBc0IsVUFBVSxxQkFBcUIsSUFBSSxRQUFRO0FBQ3ZFLE1BQUkscUJBQXFCO0FBQ3hCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTztBQUFBLElBQ04saUJBQWlCLE1BQU07QUFBQSxJQUN2QixVQUFVLENBQUMsTUFBYyxRQUFpQixVQUE0QixhQUFhLFVBQVUsS0FBSztBQUFBLEVBQ25HO0FBQ0Q7QUFLTyxTQUFTLFNBQVMsTUFBYyxZQUF5QztBQUUvRSxZQUFVLHFCQUFxQixZQUFZLFVBQVU7QUFFckQsUUFBTSxzQkFBc0IsMkJBQTJCLFVBQVU7QUFDakUsUUFBTSxRQUFRLFdBQVcsSUFBSTtBQUM3QixRQUFNLFNBQThCLENBQUM7QUFDckMsTUFBSSxRQUFRLG9CQUFvQixnQkFBZ0I7QUFDaEQsV0FBUyxJQUFJLEdBQUcsTUFBTSxNQUFNLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDakQsVUFBTSxPQUFPLE1BQU0sQ0FBQztBQUNwQixVQUFNLHFCQUFxQixvQkFBb0IsU0FBUyxNQUFNLE1BQU0sS0FBSztBQUV6RSxXQUFPLENBQUMsSUFBSSxtQkFBbUI7QUFDL0IsWUFBUSxtQkFBbUI7QUFBQSxFQUM1QjtBQUNBLFNBQU87QUFDUjtBQUtPLFNBQVMsWUFBWSxXQUFtQixXQUF1QztBQUNyRixRQUFNLHlCQUF5QixtQkFBbUIsSUFBSSx1QkFBdUI7QUFDN0UseUJBQXVCLFlBQVksV0FBVyxTQUFTO0FBQ3hEO0FBS08sU0FBUyxTQUFTLFdBQXlCO0FBQ2pELFFBQU0seUJBQXlCLG1CQUFtQixJQUFJLHVCQUF1QjtBQUM3RSx5QkFBdUIsU0FBUyxTQUFTO0FBQzFDO0FBS08sU0FBUyxpQkFBdUI7QUFDdEMsbUJBQWlCLGtCQUFrQjtBQUNwQztBQUtPLFNBQVMsZ0JBQWdCLElBQVksU0FBK0Q7QUFDMUcsU0FBTyxpQkFBaUIsZ0JBQWdCLEVBQUUsSUFBSSxRQUFRLENBQUM7QUFDeEQ7QUFZTyxTQUFTLG1CQUFtQixRQUFrQztBQUNwRSxRQUFNLGdCQUFnQixtQkFBbUIsSUFBSSxjQUFjO0FBQzNELFNBQU8sY0FBYyxlQUFlO0FBQUEsSUFDbkMsTUFBTSxLQUFLLFVBQXdCO0FBQ2xDLFVBQUksT0FBTyxhQUFhLFVBQVU7QUFDakMsbUJBQVcsSUFBSSxNQUFNLFFBQVE7QUFBQSxNQUM5QjtBQUNBLGFBQU8sT0FBTyxLQUFLLFFBQVE7QUFBQSxJQUM1QjtBQUFBLEVBQ0QsQ0FBQztBQUNGO0FBeUJPLFNBQVMscUJBQXFCLFFBQXdDO0FBQzVFLFFBQU0sb0JBQW9CLG1CQUFtQixJQUFJLGtCQUFrQjtBQUNuRSxTQUFPLGtCQUFrQiw4QkFBOEIsT0FBTyxPQUFpQyxRQUE0QixlQUF5QjtBQUNuSixRQUFJLENBQUMsUUFBUTtBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxZQUFZLE1BQU0sU0FBUztBQUNqQyxRQUFJO0FBQ0osUUFBSSxhQUFhLE9BQU8sVUFBVSxrQkFBa0IsWUFBWSxPQUFPLFVBQVUsY0FBYyxVQUFVO0FBQ3hHLDRCQUE4QjtBQUFBLElBQy9CLFdBQVcsV0FBVztBQUNyQiw0QkFBc0IsRUFBRSxZQUFZLFVBQVUsaUJBQWlCLFFBQVEsVUFBVSxZQUFZO0FBQUEsSUFDOUY7QUFDQSxRQUFJLE1BQU0sT0FBTyxlQUFlLFFBQVEsTUFBTSxVQUFVLG1CQUFtQixHQUFHO0FBQzdFLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1IsQ0FBQztBQUNGO0FBS08sU0FBUyx3QkFBOEM7QUFDN0QsU0FBTztBQUFBO0FBQUE7QUFBQSxJQUdOO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQSxJQUdBO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQSxJQUdBO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQSxJQUVBO0FBQUEsSUFDQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFJQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFHQSxzQkFBc0IsZ0JBQWdCO0FBQUEsSUFDdEMsaUNBQWlDLGdCQUFnQjtBQUFBLElBQ2pELG9CQUFvQixnQkFBZ0I7QUFBQSxJQUNwQyxrQkFBa0IsZ0JBQWdCO0FBQUEsSUFDbEMsMEJBQTBCLGdCQUFnQjtBQUFBLElBQzFDLGNBQWMsZ0JBQWdCO0FBQUEsSUFDOUIscUJBQXFCLGdCQUFnQjtBQUFBLElBQ3JDLG1CQUFtQixnQkFBZ0I7QUFBQSxJQUNuQyxpQkFBaUIsZ0JBQWdCO0FBQUEsSUFDakMsMkJBQTJCLGdCQUFnQjtBQUFBLElBQzNDLGlCQUFpQixnQkFBZ0I7QUFBQSxJQUNqQyxpQ0FBaUMsZ0JBQWdCO0FBQUEsSUFDakQsbUJBQW1CLGdCQUFnQjtBQUFBLElBQ25DLGlCQUFpQixnQkFBZ0I7QUFBQSxJQUNqQyx1QkFBdUIsZ0JBQWdCO0FBQUEsSUFDdkMsZUFBZSxnQkFBZ0I7QUFBQSxJQUMvQixxQkFBcUIsZ0JBQWdCO0FBQUEsSUFDckMsWUFBWSxnQkFBZ0I7QUFBQSxJQUM1QiwrQkFBK0IsZ0JBQWdCO0FBQUEsSUFDL0MsdUJBQXVCLGdCQUFnQjtBQUFBLElBQ3ZDLHdCQUF3QixnQkFBZ0I7QUFBQSxJQUN4QyxnQkFBZ0IsZ0JBQWdCO0FBQUEsSUFDaEMseUJBQXlCLGdCQUFnQjtBQUFBLElBQ3pDLGtCQUFrQixnQkFBZ0I7QUFBQSxJQUNsQyx1QkFBdUIsZ0JBQWdCO0FBQUEsSUFDdkMsZUFBZSxnQkFBZ0I7QUFBQTtBQUFBO0FBQUEsSUFJL0I7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBR0E7QUFBQTtBQUFBLElBR0E7QUFBQTtBQUFBLElBRUE7QUFBQSxFQUVEO0FBQ0Q7IiwKICAibmFtZXMiOiBbImFjY2Vzc29yIiwgImFyZ3MiXQp9Cg==
