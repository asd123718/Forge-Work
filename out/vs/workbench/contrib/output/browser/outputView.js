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
import "./output.css";
import * as nls from "../../../../nls.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { AbstractTextResourceEditor } from "../../../browser/parts/editor/textResourceEditor.js";
import { OUTPUT_VIEW_ID, CONTEXT_IN_OUTPUT, CONTEXT_OUTPUT_SCROLL_LOCK, IOutputService, OUTPUT_FILTER_FOCUS_CONTEXT, HIDE_CATEGORY_FILTER_CONTEXT } from "../../../services/output/common/output.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { CursorChangeReason } from "../../../../editor/common/cursorEvents.js";
import { FilterViewPane } from "../../../browser/parts/views/viewPane.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { TextResourceEditorInput } from "../../../common/editor/textResourceEditorInput.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Dimension } from "../../../../base/browser/dom.js";
import { createCancelablePromise } from "../../../../base/common/async.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ResourceContextKey } from "../../../common/contextkeys.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { computeEditorAriaLabel } from "../../../browser/editor.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { localize } from "../../../../nls.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { LogLevel } from "../../../../platform/log/common/log.js";
import { EditorExtensionsRegistry, EditorContributionInstantiation } from "../../../../editor/browser/editorExtensions.js";
import { Range } from "../../../../editor/common/core/range.js";
import { FindDecorations } from "../../../../editor/contrib/find/browser/findDecorations.js";
import { Memento } from "../../../common/memento.js";
import { Markers } from "../../markers/common/markers.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { viewFilterSubmenu } from "../../../browser/parts/views/viewFilter.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
let OutputViewPane = class extends FilterViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, outputService, storageService) {
    const memento = new Memento(Markers.MARKERS_VIEW_STORAGE_ID, storageService);
    const viewState = memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    super({
      ...options,
      filterOptions: {
        placeholder: localize("outputView.filter.placeholder", "Filter (e.g. text, !excludeText, text1,text2)"),
        focusContextKey: OUTPUT_FILTER_FOCUS_CONTEXT.key,
        text: viewState.filter || "",
        history: []
      }
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.outputService = outputService;
    this.editorPromise = null;
    this.memento = memento;
    this.panelState = viewState;
    const filters = outputService.filters;
    filters.text = this.panelState.filter || "";
    filters.trace = this.panelState.showTrace ?? true;
    filters.debug = this.panelState.showDebug ?? true;
    filters.info = this.panelState.showInfo ?? true;
    filters.warning = this.panelState.showWarning ?? true;
    filters.error = this.panelState.showError ?? true;
    filters.categories = this.panelState.categories ?? "";
    this.scrollLockContextKey = CONTEXT_OUTPUT_SCROLL_LOCK.bindTo(this.contextKeyService);
    const editorInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    this.editor = this._register(editorInstantiationService.createInstance(OutputEditor));
    this._register(this.editor.onTitleAreaUpdate(() => {
      this.updateTitle(this.editor.getTitle());
      this.updateActions();
    }));
    this._register(this.onDidChangeBodyVisibility(() => this.onDidChangeVisibility(this.isBodyVisible())));
    this._register(this.filterWidget.onDidChangeFilterText((text) => outputService.filters.text = text));
    this.checkMoreFilters();
    this._register(outputService.filters.onDidChange(() => this.checkMoreFilters()));
  }
  get scrollLock() {
    return !!this.scrollLockContextKey.get();
  }
  set scrollLock(scrollLock) {
    this.scrollLockContextKey.set(scrollLock);
  }
  showChannel(channel, preserveFocus) {
    if (this.channelId !== channel.id) {
      this.setInput(channel);
    }
    if (!preserveFocus) {
      this.focus();
    }
  }
  focus() {
    super.focus();
    this.editorPromise?.then(() => this.editor.focus());
  }
  clearFilterText() {
    this.filterWidget.setFilterText("");
  }
  renderBody(container) {
    super.renderBody(container);
    this.editor.create(container);
    container.classList.add("output-view");
    const codeEditor = this.editor.getControl();
    codeEditor.setAriaOptions({ role: "document", activeDescendant: void 0 });
    this._register(codeEditor.onDidChangeModelContent(() => {
      if (!this.scrollLock) {
        this.editor.revealLastLine();
      }
    }));
    this._register(codeEditor.onDidChangeCursorPosition((e) => {
      if (e.reason !== CursorChangeReason.Explicit) {
        return;
      }
      if (!this.configurationService.getValue("output.smartScroll.enabled")) {
        return;
      }
      const model = codeEditor.getModel();
      if (model) {
        const newPositionLine = e.position.lineNumber;
        const lastLine = model.getLineCount();
        this.scrollLock = lastLine !== newPositionLine;
      }
    }));
  }
  layoutBodyContent(height, width) {
    this.editor.layout(new Dimension(width, height));
  }
  onDidChangeVisibility(visible) {
    this.editor.setVisible(visible);
    if (!visible) {
      this.clearInput();
    }
  }
  setInput(channel) {
    this.channelId = channel.id;
    this.checkMoreFilters();
    const input = this.createInput(channel);
    if (!this.editor.input || !input.matches(this.editor.input)) {
      this.editorPromise?.cancel();
      this.editorPromise = createCancelablePromise((token) => this.editor.setInput(input, { preserveFocus: true }, /* @__PURE__ */ Object.create(null), token));
    }
  }
  checkMoreFilters() {
    const filters = this.outputService.filters;
    this.filterWidget.checkMoreFilters(!filters.trace || !filters.debug || !filters.info || !filters.warning || !filters.error || !!this.channelId && filters.categories.includes(`,${this.channelId}:`));
  }
  clearInput() {
    this.channelId = void 0;
    this.editor.clearInput();
    this.editorPromise = null;
  }
  createInput(channel) {
    return this.instantiationService.createInstance(TextResourceEditorInput, channel.uri, nls.localize("output model title", "{0} - Output", channel.label), nls.localize("channel", "Output channel for '{0}'", channel.label), void 0, void 0);
  }
  saveState() {
    const filters = this.outputService.filters;
    this.panelState.filter = filters.text;
    this.panelState.showTrace = filters.trace;
    this.panelState.showDebug = filters.debug;
    this.panelState.showInfo = filters.info;
    this.panelState.showWarning = filters.warning;
    this.panelState.showError = filters.error;
    this.panelState.categories = filters.categories;
    this.memento.saveMemento();
    super.saveState();
  }
};
OutputViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IOutputService),
  __decorateParam(11, IStorageService)
], OutputViewPane);
let OutputEditor = class extends AbstractTextResourceEditor {
  constructor(telemetryService, instantiationService, storageService, configurationService, textResourceConfigurationService, themeService, editorGroupService, editorService, fileService) {
    super(OUTPUT_VIEW_ID, editorGroupService.activeGroup, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, editorService, fileService);
    this.configurationService = configurationService;
    this.resourceContext = this._register(instantiationService.createInstance(ResourceContextKey));
  }
  getId() {
    return OUTPUT_VIEW_ID;
  }
  getTitle() {
    return nls.localize("output", "Output");
  }
  getConfigurationOverrides(configuration) {
    const options = super.getConfigurationOverrides(configuration);
    options.wordWrap = "on";
    options.lineNumbers = "off";
    options.glyphMargin = false;
    options.lineDecorationsWidth = 20;
    options.rulers = [];
    options.folding = false;
    options.scrollBeyondLastLine = false;
    options.renderLineHighlight = "none";
    options.minimap = { enabled: false };
    options.renderValidationDecorations = "editable";
    options.colorDecorators = false;
    options.padding = void 0;
    options.readOnly = true;
    options.domReadOnly = true;
    options.roundedSelection = false;
    options.unicodeHighlight = {
      nonBasicASCII: false,
      invisibleCharacters: false,
      ambiguousCharacters: false
    };
    const outputConfig = this.configurationService.getValue("[Log]");
    if (outputConfig) {
      if (outputConfig["editor.minimap.enabled"]) {
        options.minimap = { enabled: true };
      }
      if (outputConfig["editor.wordWrap"]) {
        options.wordWrap = outputConfig["editor.wordWrap"];
      }
    }
    return options;
  }
  getAriaLabel() {
    return this.input ? this.input.getAriaLabel() : nls.localize("outputViewAriaLabel", "Output panel");
  }
  computeAriaLabel() {
    return this.input ? computeEditorAriaLabel(this.input, void 0, void 0, this.editorGroupService.count) : this.getAriaLabel();
  }
  async setInput(input, options, context, token) {
    const focus = !(options && options.preserveFocus);
    if (this.input && input.matches(this.input)) {
      return;
    }
    if (this.input) {
      this.input.dispose();
    }
    await super.setInput(input, options, context, token);
    this.resourceContext.set(input.resource);
    if (focus) {
      this.focus();
    }
    this.revealLastLine();
  }
  clearInput() {
    if (this.input) {
      this.input.dispose();
    }
    super.clearInput();
    this.resourceContext.reset();
  }
  createEditor(parent) {
    parent.setAttribute("role", "document");
    super.createEditor(parent);
    const scopedContextKeyService = this.scopedContextKeyService;
    if (scopedContextKeyService) {
      CONTEXT_IN_OUTPUT.bindTo(scopedContextKeyService).set(true);
    }
  }
  _getContributions() {
    return [
      ...EditorExtensionsRegistry.getEditorContributions(),
      {
        id: FilterController.ID,
        ctor: FilterController,
        instantiation: EditorContributionInstantiation.Eager
      }
    ];
  }
  getCodeEditorWidgetOptions() {
    return { contributions: this._getContributions() };
  }
};
OutputEditor = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ITextResourceConfigurationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IEditorGroupsService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IFileService)
], OutputEditor);
let FilterController = class extends Disposable {
  constructor(editor, outputService) {
    super();
    this.editor = editor;
    this.outputService = outputService;
    this.modelDisposables = this._register(new DisposableStore());
    this.hiddenAreas = [];
    this.categories = /* @__PURE__ */ new Map();
    this.decorationsCollection = editor.createDecorationsCollection();
    this._register(editor.onDidChangeModel(() => this.onDidChangeModel()));
    this._register(this.outputService.filters.onDidChange(() => editor.hasModel() && this.filter(editor.getModel())));
  }
  onDidChangeModel() {
    this.modelDisposables.clear();
    this.hiddenAreas = [];
    this.categories.clear();
    if (!this.editor.hasModel()) {
      return;
    }
    const model = this.editor.getModel();
    this.filter(model);
    const computeEndLineNumber = () => {
      const endLineNumber2 = model.getLineCount();
      return endLineNumber2 > 1 && model.getLineMaxColumn(endLineNumber2) === 1 ? endLineNumber2 - 1 : endLineNumber2;
    };
    let endLineNumber = computeEndLineNumber();
    this.modelDisposables.add(model.onDidChangeContent((e) => {
      if (e.changes.every((e2) => e2.range.startLineNumber > endLineNumber)) {
        this.filterIncremental(model, endLineNumber + 1);
      } else {
        this.filter(model);
      }
      endLineNumber = computeEndLineNumber();
    }));
  }
  filter(model) {
    this.hiddenAreas = [];
    this.decorationsCollection.clear();
    this.filterIncremental(model, 1);
  }
  filterIncremental(model, fromLineNumber) {
    const { findMatches, hiddenAreas, categories: sources } = this.compute(model, fromLineNumber);
    this.hiddenAreas.push(...hiddenAreas);
    this.editor.setHiddenAreas(this.hiddenAreas, this);
    if (findMatches.length) {
      this.decorationsCollection.append(findMatches);
    }
    if (sources.size) {
      const that = this;
      for (const [categoryFilter, categoryName] of sources) {
        if (this.categories.has(categoryFilter)) {
          continue;
        }
        this.categories.set(categoryFilter, categoryName);
        this.modelDisposables.add(registerAction2(class extends Action2 {
          constructor() {
            super({
              id: `workbench.actions.${OUTPUT_VIEW_ID}.toggle.${categoryFilter}`,
              title: categoryName,
              toggled: ContextKeyExpr.regex(HIDE_CATEGORY_FILTER_CONTEXT.key, new RegExp(`.*,${escapeRegExpCharacters(categoryFilter)},.*`)).negate(),
              menu: {
                id: viewFilterSubmenu,
                group: "1_category_filter",
                when: ContextKeyExpr.and(ContextKeyExpr.equals("view", OUTPUT_VIEW_ID))
              }
            });
          }
          async run() {
            that.outputService.filters.toggleCategory(categoryFilter);
          }
        }));
      }
    }
  }
  shouldShowLine(model, range, positive, negative) {
    const matches = [];
    if (negative.length > 0) {
      for (const pattern of negative) {
        const negativeMatches = model.findMatches(pattern, range, false, false, null, false);
        if (negativeMatches.length > 0) {
          return { show: false, matches: [] };
        }
      }
    }
    if (positive.length > 0) {
      let hasPositiveMatch = false;
      for (const pattern of positive) {
        const positiveMatches = model.findMatches(pattern, range, false, false, null, false);
        if (positiveMatches.length > 0) {
          hasPositiveMatch = true;
          for (const match of positiveMatches) {
            matches.push({ range: match.range, options: FindDecorations._FIND_MATCH_DECORATION });
          }
        }
      }
      return { show: hasPositiveMatch, matches };
    }
    return { show: true, matches };
  }
  compute(model, fromLineNumber) {
    const filters = this.outputService.filters;
    const activeChannel = this.outputService.getActiveChannel();
    const findMatches = [];
    const hiddenAreas = [];
    const categories = /* @__PURE__ */ new Map();
    const logEntries = activeChannel?.getLogEntries();
    if (activeChannel && logEntries?.length) {
      const hasLogLevelFilter = !filters.trace || !filters.debug || !filters.info || !filters.warning || !filters.error;
      const fromLogLevelEntryIndex = logEntries.findIndex((entry) => fromLineNumber >= entry.range.startLineNumber && fromLineNumber <= entry.range.endLineNumber);
      if (fromLogLevelEntryIndex === -1) {
        return { findMatches, hiddenAreas, categories };
      }
      for (let i = fromLogLevelEntryIndex; i < logEntries.length; i++) {
        const entry = logEntries[i];
        if (entry.category) {
          categories.set(`${activeChannel.id}:${entry.category}`, entry.category);
        }
        if (hasLogLevelFilter && !this.shouldShowLogLevel(entry, filters)) {
          hiddenAreas.push(entry.range);
          continue;
        }
        if (!this.shouldShowCategory(activeChannel.id, entry, filters)) {
          hiddenAreas.push(entry.range);
          continue;
        }
        if (filters.includePatterns.length > 0 || filters.excludePatterns.length > 0) {
          const result = this.shouldShowLine(model, entry.range, filters.includePatterns, filters.excludePatterns);
          if (result.show) {
            findMatches.push(...result.matches);
          } else {
            hiddenAreas.push(entry.range);
          }
        }
      }
      return { findMatches, hiddenAreas, categories };
    }
    if (filters.includePatterns.length === 0 && filters.excludePatterns.length === 0) {
      return { findMatches, hiddenAreas, categories };
    }
    const lineCount = model.getLineCount();
    for (let lineNumber = fromLineNumber; lineNumber <= lineCount; lineNumber++) {
      const lineRange = new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber));
      const result = this.shouldShowLine(model, lineRange, filters.includePatterns, filters.excludePatterns);
      if (result.show) {
        findMatches.push(...result.matches);
      } else {
        hiddenAreas.push(lineRange);
      }
    }
    return { findMatches, hiddenAreas, categories };
  }
  shouldShowLogLevel(entry, filters) {
    switch (entry.logLevel) {
      case LogLevel.Trace:
        return filters.trace;
      case LogLevel.Debug:
        return filters.debug;
      case LogLevel.Info:
        return filters.info;
      case LogLevel.Warning:
        return filters.warning;
      case LogLevel.Error:
        return filters.error;
    }
    return true;
  }
  shouldShowCategory(activeChannelId, entry, filters) {
    if (!entry.category) {
      return true;
    }
    return !filters.hasCategory(`${activeChannelId}:${entry.category}`);
  }
};
FilterController.ID = "output.editor.contrib.filterController";
FilterController = __decorateClass([
  __decorateParam(1, IOutputService)
], FilterController);
export {
  FilterController,
  OutputEditor,
  OutputViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG91dHB1dFxcYnJvd3Nlclxcb3V0cHV0Vmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgJy4vb3V0cHV0LmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyBhcyBJQ29kZUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXksIENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEFic3RyYWN0VGV4dFJlc291cmNlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvdGV4dFJlc291cmNlRWRpdG9yLmpzJztcbmltcG9ydCB7IE9VVFBVVF9WSUVXX0lELCBDT05URVhUX0lOX09VVFBVVCwgSU91dHB1dENoYW5uZWwsIENPTlRFWFRfT1VUUFVUX1NDUk9MTF9MT0NLLCBJT3V0cHV0U2VydmljZSwgSU91dHB1dFZpZXdGaWx0ZXJzLCBPVVRQVVRfRklMVEVSX0ZPQ1VTX0NPTlRFWFQsIElMb2dFbnRyeSwgSElERV9DQVRFR09SWV9GSUxURVJfQ09OVEVYVCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ2hhbmdlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgSVZpZXdQYW5lT3B0aW9ucywgRmlsdGVyVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvdGV4dFJlc291cmNlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL3RleHRFZGl0b3IuanMnO1xuaW1wb3J0IHsgY29tcHV0ZUVkaXRvckFyaWFMYWJlbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbiwgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCBFZGl0b3JDb250cmlidXRpb25DdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEZpbmREZWNvcmF0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVtZW50byB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tZW1lbnRvLmpzJztcbmltcG9ydCB7IE1hcmtlcnMgfSBmcm9tICcuLi8uLi9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgdmlld0ZpbHRlclN1Ym1lbnUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdGaWx0ZXIuanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuXG5pbnRlcmZhY2UgSU91dHB1dFZpZXdTdGF0ZSB7XG5cdGZpbHRlcj86IHN0cmluZztcblx0c2hvd1RyYWNlPzogYm9vbGVhbjtcblx0c2hvd0RlYnVnPzogYm9vbGVhbjtcblx0c2hvd0luZm8/OiBib29sZWFuO1xuXHRzaG93V2FybmluZz86IGJvb2xlYW47XG5cdHNob3dFcnJvcj86IGJvb2xlYW47XG5cdGNhdGVnb3JpZXM/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBPdXRwdXRWaWV3UGFuZSBleHRlbmRzIEZpbHRlclZpZXdQYW5lIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogT3V0cHV0RWRpdG9yO1xuXHRwcml2YXRlIGNoYW5uZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVkaXRvclByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+IHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzY3JvbGxMb2NrQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdGdldCBzY3JvbGxMb2NrKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLnNjcm9sbExvY2tDb250ZXh0S2V5LmdldCgpOyB9XG5cdHNldCBzY3JvbGxMb2NrKHNjcm9sbExvY2s6IGJvb2xlYW4pIHsgdGhpcy5zY3JvbGxMb2NrQ29udGV4dEtleS5zZXQoc2Nyb2xsTG9jayk7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IG1lbWVudG86IE1lbWVudG88SU91dHB1dFZpZXdTdGF0ZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgcGFuZWxTdGF0ZTogSU91dHB1dFZpZXdTdGF0ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJT3V0cHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG91dHB1dFNlcnZpY2U6IElPdXRwdXRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgbWVtZW50byA9IG5ldyBNZW1lbnRvPElPdXRwdXRWaWV3U3RhdGU+KE1hcmtlcnMuTUFSS0VSU19WSUVXX1NUT1JBR0VfSUQsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3U3RhdGUgPSBtZW1lbnRvLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0ZmlsdGVyT3B0aW9uczoge1xuXHRcdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ291dHB1dFZpZXcuZmlsdGVyLnBsYWNlaG9sZGVyJywgXCJGaWx0ZXIgKGUuZy4gdGV4dCwgIWV4Y2x1ZGVUZXh0LCB0ZXh0MSx0ZXh0MilcIiksXG5cdFx0XHRcdGZvY3VzQ29udGV4dEtleTogT1VUUFVUX0ZJTFRFUl9GT0NVU19DT05URVhULmtleSxcblx0XHRcdFx0dGV4dDogdmlld1N0YXRlLmZpbHRlciB8fCAnJyxcblx0XHRcdFx0aGlzdG9yeTogW11cblx0XHRcdH1cblx0XHR9LCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0XHR0aGlzLm1lbWVudG8gPSBtZW1lbnRvO1xuXHRcdHRoaXMucGFuZWxTdGF0ZSA9IHZpZXdTdGF0ZTtcblxuXHRcdGNvbnN0IGZpbHRlcnMgPSBvdXRwdXRTZXJ2aWNlLmZpbHRlcnM7XG5cdFx0ZmlsdGVycy50ZXh0ID0gdGhpcy5wYW5lbFN0YXRlLmZpbHRlciB8fCAnJztcblx0XHRmaWx0ZXJzLnRyYWNlID0gdGhpcy5wYW5lbFN0YXRlLnNob3dUcmFjZSA/PyB0cnVlO1xuXHRcdGZpbHRlcnMuZGVidWcgPSB0aGlzLnBhbmVsU3RhdGUuc2hvd0RlYnVnID8/IHRydWU7XG5cdFx0ZmlsdGVycy5pbmZvID0gdGhpcy5wYW5lbFN0YXRlLnNob3dJbmZvID8/IHRydWU7XG5cdFx0ZmlsdGVycy53YXJuaW5nID0gdGhpcy5wYW5lbFN0YXRlLnNob3dXYXJuaW5nID8/IHRydWU7XG5cdFx0ZmlsdGVycy5lcnJvciA9IHRoaXMucGFuZWxTdGF0ZS5zaG93RXJyb3IgPz8gdHJ1ZTtcblx0XHRmaWx0ZXJzLmNhdGVnb3JpZXMgPSB0aGlzLnBhbmVsU3RhdGUuY2F0ZWdvcmllcyA/PyAnJztcblxuXHRcdHRoaXMuc2Nyb2xsTG9ja0NvbnRleHRLZXkgPSBDT05URVhUX09VVFBVVF9TQ1JPTExfTE9DSy5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBlZGl0b3JJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHR0aGlzLmVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKGVkaXRvckluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE91dHB1dEVkaXRvcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uVGl0bGVBcmVhVXBkYXRlKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlVGl0bGUodGhpcy5lZGl0b3IuZ2V0VGl0bGUoKSk7XG5cdFx0XHR0aGlzLnVwZGF0ZUFjdGlvbnMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KCgpID0+IHRoaXMub25EaWRDaGFuZ2VWaXNpYmlsaXR5KHRoaXMuaXNCb2R5VmlzaWJsZSgpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsdGVyV2lkZ2V0Lm9uRGlkQ2hhbmdlRmlsdGVyVGV4dCh0ZXh0ID0+IG91dHB1dFNlcnZpY2UuZmlsdGVycy50ZXh0ID0gdGV4dCkpO1xuXG5cdFx0dGhpcy5jaGVja01vcmVGaWx0ZXJzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob3V0cHV0U2VydmljZS5maWx0ZXJzLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuY2hlY2tNb3JlRmlsdGVycygpKSk7XG5cdH1cblxuXHRzaG93Q2hhbm5lbChjaGFubmVsOiBJT3V0cHV0Q2hhbm5lbCwgcHJlc2VydmVGb2N1czogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNoYW5uZWxJZCAhPT0gY2hhbm5lbC5pZCkge1xuXHRcdFx0dGhpcy5zZXRJbnB1dChjaGFubmVsKTtcblx0XHR9XG5cdFx0aWYgKCFwcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLmVkaXRvclByb21pc2U/LnRoZW4oKCkgPT4gdGhpcy5lZGl0b3IuZm9jdXMoKSk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJGaWx0ZXJUZXh0KCk6IHZvaWQge1xuXHRcdHRoaXMuZmlsdGVyV2lkZ2V0LnNldEZpbHRlclRleHQoJycpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblx0XHR0aGlzLmVkaXRvci5jcmVhdGUoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnb3V0cHV0LXZpZXcnKTtcblx0XHRjb25zdCBjb2RlRWRpdG9yID0gPElDb2RlRWRpdG9yPnRoaXMuZWRpdG9yLmdldENvbnRyb2woKTtcblx0XHRjb2RlRWRpdG9yLnNldEFyaWFPcHRpb25zKHsgcm9sZTogJ2RvY3VtZW50JywgYWN0aXZlRGVzY2VuZGFudDogdW5kZWZpbmVkIH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvZGVFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnNjcm9sbExvY2spIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IucmV2ZWFsTGFzdExpbmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29kZUVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5yZWFzb24gIT09IEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnb3V0cHV0LnNtYXJ0U2Nyb2xsLmVuYWJsZWQnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gY29kZUVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IG5ld1Bvc2l0aW9uTGluZSA9IGUucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdFx0Y29uc3QgbGFzdExpbmUgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdFx0dGhpcy5zY3JvbGxMb2NrID0gbGFzdExpbmUgIT09IG5ld1Bvc2l0aW9uTGluZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgbGF5b3V0Qm9keUNvbnRlbnQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvci5sYXlvdXQobmV3IERpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlVmlzaWJpbGl0eSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3Iuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHRoaXMuY2xlYXJJbnB1dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0SW5wdXQoY2hhbm5lbDogSU91dHB1dENoYW5uZWwpOiB2b2lkIHtcblx0XHR0aGlzLmNoYW5uZWxJZCA9IGNoYW5uZWwuaWQ7XG5cdFx0dGhpcy5jaGVja01vcmVGaWx0ZXJzKCk7XG5cblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuY3JlYXRlSW5wdXQoY2hhbm5lbCk7XG5cdFx0aWYgKCF0aGlzLmVkaXRvci5pbnB1dCB8fCAhaW5wdXQubWF0Y2hlcyh0aGlzLmVkaXRvci5pbnB1dCkpIHtcblx0XHRcdHRoaXMuZWRpdG9yUHJvbWlzZT8uY2FuY2VsKCk7XG5cdFx0XHR0aGlzLmVkaXRvclByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiB0aGlzLmVkaXRvci5zZXRJbnB1dChpbnB1dCwgeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0sIE9iamVjdC5jcmVhdGUobnVsbCksIHRva2VuKSk7XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIGNoZWNrTW9yZUZpbHRlcnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZmlsdGVycyA9IHRoaXMub3V0cHV0U2VydmljZS5maWx0ZXJzO1xuXHRcdHRoaXMuZmlsdGVyV2lkZ2V0LmNoZWNrTW9yZUZpbHRlcnMoIWZpbHRlcnMudHJhY2UgfHwgIWZpbHRlcnMuZGVidWcgfHwgIWZpbHRlcnMuaW5mbyB8fCAhZmlsdGVycy53YXJuaW5nIHx8ICFmaWx0ZXJzLmVycm9yIHx8ICghIXRoaXMuY2hhbm5lbElkICYmIGZpbHRlcnMuY2F0ZWdvcmllcy5pbmNsdWRlcyhgLCR7dGhpcy5jaGFubmVsSWR9OmApKSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGFubmVsSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5lZGl0b3IuY2xlYXJJbnB1dCgpO1xuXHRcdHRoaXMuZWRpdG9yUHJvbWlzZSA9IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUlucHV0KGNoYW5uZWw6IElPdXRwdXRDaGFubmVsKTogVGV4dFJlc291cmNlRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRSZXNvdXJjZUVkaXRvcklucHV0LCBjaGFubmVsLnVyaSwgbmxzLmxvY2FsaXplKCdvdXRwdXQgbW9kZWwgdGl0bGUnLCBcInswfSAtIE91dHB1dFwiLCBjaGFubmVsLmxhYmVsKSwgbmxzLmxvY2FsaXplKCdjaGFubmVsJywgXCJPdXRwdXQgY2hhbm5lbCBmb3IgJ3swfSdcIiwgY2hhbm5lbC5sYWJlbCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBmaWx0ZXJzID0gdGhpcy5vdXRwdXRTZXJ2aWNlLmZpbHRlcnM7XG5cdFx0dGhpcy5wYW5lbFN0YXRlLmZpbHRlciA9IGZpbHRlcnMudGV4dDtcblx0XHR0aGlzLnBhbmVsU3RhdGUuc2hvd1RyYWNlID0gZmlsdGVycy50cmFjZTtcblx0XHR0aGlzLnBhbmVsU3RhdGUuc2hvd0RlYnVnID0gZmlsdGVycy5kZWJ1Zztcblx0XHR0aGlzLnBhbmVsU3RhdGUuc2hvd0luZm8gPSBmaWx0ZXJzLmluZm87XG5cdFx0dGhpcy5wYW5lbFN0YXRlLnNob3dXYXJuaW5nID0gZmlsdGVycy53YXJuaW5nO1xuXHRcdHRoaXMucGFuZWxTdGF0ZS5zaG93RXJyb3IgPSBmaWx0ZXJzLmVycm9yO1xuXHRcdHRoaXMucGFuZWxTdGF0ZS5jYXRlZ29yaWVzID0gZmlsdGVycy5jYXRlZ29yaWVzO1xuXG5cdFx0dGhpcy5tZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdFx0c3VwZXIuc2F2ZVN0YXRlKCk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgT3V0cHV0RWRpdG9yIGV4dGVuZHMgQWJzdHJhY3RUZXh0UmVzb3VyY2VFZGl0b3Ige1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlc291cmNlQ29udGV4dDogUmVzb3VyY2VDb250ZXh0S2V5O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihPVVRQVVRfVklFV19JRCwgZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwIC8qIHRoaXMgaXMgbm90IGNvcnJlY3QgYnV0IHByYWdtYXRpYyAqLywgdGVsZW1ldHJ5U2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBlZGl0b3JHcm91cFNlcnZpY2UsIGVkaXRvclNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVzb3VyY2VDb250ZXh0ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VDb250ZXh0S2V5KSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBPVVRQVVRfVklFV19JRDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFRpdGxlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnb3V0cHV0JywgXCJPdXRwdXRcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0Q29uZmlndXJhdGlvbk92ZXJyaWRlcyhjb25maWd1cmF0aW9uOiBJRWRpdG9yQ29uZmlndXJhdGlvbik6IElDb2RlRWRpdG9yT3B0aW9ucyB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHN1cGVyLmdldENvbmZpZ3VyYXRpb25PdmVycmlkZXMoY29uZmlndXJhdGlvbik7XG5cdFx0b3B0aW9ucy53b3JkV3JhcCA9ICdvbic7XHRcdFx0XHQvLyBhbGwgb3V0cHV0IGVkaXRvcnMgd3JhcFxuXHRcdG9wdGlvbnMubGluZU51bWJlcnMgPSAnb2ZmJztcdFx0XHQvLyBhbGwgb3V0cHV0IGVkaXRvcnMgaGlkZSBsaW5lIG51bWJlcnNcblx0XHRvcHRpb25zLmdseXBoTWFyZ2luID0gZmFsc2U7XG5cdFx0b3B0aW9ucy5saW5lRGVjb3JhdGlvbnNXaWR0aCA9IDIwO1xuXHRcdG9wdGlvbnMucnVsZXJzID0gW107XG5cdFx0b3B0aW9ucy5mb2xkaW5nID0gZmFsc2U7XG5cdFx0b3B0aW9ucy5zY3JvbGxCZXlvbmRMYXN0TGluZSA9IGZhbHNlO1xuXHRcdG9wdGlvbnMucmVuZGVyTGluZUhpZ2hsaWdodCA9ICdub25lJztcblx0XHRvcHRpb25zLm1pbmltYXAgPSB7IGVuYWJsZWQ6IGZhbHNlIH07XG5cdFx0b3B0aW9ucy5yZW5kZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMgPSAnZWRpdGFibGUnO1xuXHRcdG9wdGlvbnMuY29sb3JEZWNvcmF0b3JzID0gZmFsc2U7XG5cdFx0b3B0aW9ucy5wYWRkaW5nID0gdW5kZWZpbmVkO1xuXHRcdG9wdGlvbnMucmVhZE9ubHkgPSB0cnVlO1xuXHRcdG9wdGlvbnMuZG9tUmVhZE9ubHkgPSB0cnVlO1xuXHRcdG9wdGlvbnMucm91bmRlZFNlbGVjdGlvbiA9IGZhbHNlO1xuXHRcdG9wdGlvbnMudW5pY29kZUhpZ2hsaWdodCA9IHtcblx0XHRcdG5vbkJhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0aW52aXNpYmxlQ2hhcmFjdGVyczogZmFsc2UsXG5cdFx0XHRhbWJpZ3VvdXNDaGFyYWN0ZXJzOiBmYWxzZSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgb3V0cHV0Q29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7ICdlZGl0b3IubWluaW1hcC5lbmFibGVkJz86IGJvb2xlYW47ICdlZGl0b3Iud29yZFdyYXAnPzogJ29mZicgfCAnb24nIHwgJ3dvcmRXcmFwQ29sdW1uJyB8ICdib3VuZGVkJyB9PignW0xvZ10nKTtcblx0XHRpZiAob3V0cHV0Q29uZmlnKSB7XG5cdFx0XHRpZiAob3V0cHV0Q29uZmlnWydlZGl0b3IubWluaW1hcC5lbmFibGVkJ10pIHtcblx0XHRcdFx0b3B0aW9ucy5taW5pbWFwID0geyBlbmFibGVkOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAob3V0cHV0Q29uZmlnWydlZGl0b3Iud29yZFdyYXAnXSkge1xuXHRcdFx0XHRvcHRpb25zLndvcmRXcmFwID0gb3V0cHV0Q29uZmlnWydlZGl0b3Iud29yZFdyYXAnXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gb3B0aW9ucztcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dCA/IHRoaXMuaW5wdXQuZ2V0QXJpYUxhYmVsKCkgOiBubHMubG9jYWxpemUoJ291dHB1dFZpZXdBcmlhTGFiZWwnLCBcIk91dHB1dCBwYW5lbFwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjb21wdXRlQXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQgPyBjb21wdXRlRWRpdG9yQXJpYUxhYmVsKHRoaXMuaW5wdXQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5jb3VudCkgOiB0aGlzLmdldEFyaWFMYWJlbCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IFRleHRSZXNvdXJjZUVkaXRvcklucHV0LCBvcHRpb25zOiBJVGV4dEVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZm9jdXMgPSAhKG9wdGlvbnMgJiYgb3B0aW9ucy5wcmVzZXJ2ZUZvY3VzKTtcblx0XHRpZiAodGhpcy5pbnB1dCAmJiBpbnB1dC5tYXRjaGVzKHRoaXMuaW5wdXQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaW5wdXQpIHtcblx0XHRcdC8vIERpc3Bvc2UgcHJldmlvdXMgaW5wdXQgKE91dHB1dCBwYW5lbCBpcyBub3QgYSB3b3JrYmVuY2ggZWRpdG9yKVxuXHRcdFx0dGhpcy5pbnB1dC5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cblx0XHR0aGlzLnJlc291cmNlQ29udGV4dC5zZXQoaW5wdXQucmVzb3VyY2UpO1xuXG5cdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0fVxuXHRcdHRoaXMucmV2ZWFsTGFzdExpbmUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaW5wdXQpIHtcblx0XHRcdC8vIERpc3Bvc2UgY3VycmVudCBpbnB1dCAoT3V0cHV0IHBhbmVsIGlzIG5vdCBhIHdvcmtiZW5jaCBlZGl0b3IpXG5cdFx0XHR0aGlzLmlucHV0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXG5cdFx0dGhpcy5yZXNvdXJjZUNvbnRleHQucmVzZXQoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXG5cdFx0cGFyZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdkb2N1bWVudCcpO1xuXG5cdFx0c3VwZXIuY3JlYXRlRWRpdG9yKHBhcmVudCk7XG5cblx0XHRjb25zdCBzY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdFx0aWYgKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRDT05URVhUX0lOX09VVFBVVC5iaW5kVG8oc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb250cmlidXRpb25zKCk6IElFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbltdIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0Li4uRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IEZpbHRlckNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdGN0b3I6IEZpbHRlckNvbnRyb2xsZXIgYXMgRWRpdG9yQ29udHJpYnV0aW9uQ3Rvcixcblx0XHRcdFx0aW5zdGFudGlhdGlvbjogRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5FYWdlclxuXHRcdFx0fVxuXHRcdF07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0Q29kZUVkaXRvcldpZGdldE9wdGlvbnMoKTogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zIHtcblx0XHRyZXR1cm4geyBjb250cmlidXRpb25zOiB0aGlzLl9nZXRDb250cmlidXRpb25zKCkgfTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBGaWx0ZXJDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnb3V0cHV0LmVkaXRvci5jb250cmliLmZpbHRlckNvbnRyb2xsZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBoaWRkZW5BcmVhczogUmFuZ2VbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhdGVnb3JpZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRpb25zQ29sbGVjdGlvbjogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElPdXRwdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3V0cHV0U2VydmljZTogSU91dHB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5kZWNvcmF0aW9uc0NvbGxlY3Rpb24gPSBlZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4gdGhpcy5vbkRpZENoYW5nZU1vZGVsKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm91dHB1dFNlcnZpY2UuZmlsdGVycy5vbkRpZENoYW5nZSgoKSA9PiBlZGl0b3IuaGFzTW9kZWwoKSAmJiB0aGlzLmZpbHRlcihlZGl0b3IuZ2V0TW9kZWwoKSkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VNb2RlbCgpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmhpZGRlbkFyZWFzID0gW107XG5cdFx0dGhpcy5jYXRlZ29yaWVzLmNsZWFyKCk7XG5cblx0XHRpZiAoIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0dGhpcy5maWx0ZXIobW9kZWwpO1xuXG5cdFx0Y29uc3QgY29tcHV0ZUVuZExpbmVOdW1iZXIgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRyZXR1cm4gZW5kTGluZU51bWJlciA+IDEgJiYgbW9kZWwuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKSA9PT0gMSA/IGVuZExpbmVOdW1iZXIgLSAxIDogZW5kTGluZU51bWJlcjtcblx0XHR9O1xuXG5cdFx0bGV0IGVuZExpbmVOdW1iZXIgPSBjb21wdXRlRW5kTGluZU51bWJlcigpO1xuXG5cdFx0dGhpcy5tb2RlbERpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB7XG5cdFx0XHRpZiAoZS5jaGFuZ2VzLmV2ZXJ5KGUgPT4gZS5yYW5nZS5zdGFydExpbmVOdW1iZXIgPiBlbmRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHR0aGlzLmZpbHRlckluY3JlbWVudGFsKG1vZGVsLCBlbmRMaW5lTnVtYmVyICsgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZpbHRlcihtb2RlbCk7XG5cdFx0XHR9XG5cdFx0XHRlbmRMaW5lTnVtYmVyID0gY29tcHV0ZUVuZExpbmVOdW1iZXIoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlcihtb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuaGlkZGVuQXJlYXMgPSBbXTtcblx0XHR0aGlzLmRlY29yYXRpb25zQ29sbGVjdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuZmlsdGVySW5jcmVtZW50YWwobW9kZWwsIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJJbmNyZW1lbnRhbChtb2RlbDogSVRleHRNb2RlbCwgZnJvbUxpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHsgZmluZE1hdGNoZXMsIGhpZGRlbkFyZWFzLCBjYXRlZ29yaWVzOiBzb3VyY2VzIH0gPSB0aGlzLmNvbXB1dGUobW9kZWwsIGZyb21MaW5lTnVtYmVyKTtcblx0XHR0aGlzLmhpZGRlbkFyZWFzLnB1c2goLi4uaGlkZGVuQXJlYXMpO1xuXHRcdHRoaXMuZWRpdG9yLnNldEhpZGRlbkFyZWFzKHRoaXMuaGlkZGVuQXJlYXMsIHRoaXMpO1xuXHRcdGlmIChmaW5kTWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuZGVjb3JhdGlvbnNDb2xsZWN0aW9uLmFwcGVuZChmaW5kTWF0Y2hlcyk7XG5cdFx0fVxuXHRcdGlmIChzb3VyY2VzLnNpemUpIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0Zm9yIChjb25zdCBbY2F0ZWdvcnlGaWx0ZXIsIGNhdGVnb3J5TmFtZV0gb2Ygc291cmNlcykge1xuXHRcdFx0XHRpZiAodGhpcy5jYXRlZ29yaWVzLmhhcyhjYXRlZ29yeUZpbHRlcikpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmNhdGVnb3JpZXMuc2V0KGNhdGVnb3J5RmlsdGVyLCBjYXRlZ29yeU5hbWUpO1xuXHRcdFx0XHR0aGlzLm1vZGVsRGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLiR7T1VUUFVUX1ZJRVdfSUR9LnRvZ2dsZS4ke2NhdGVnb3J5RmlsdGVyfWAsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiBjYXRlZ29yeU5hbWUsXG5cdFx0XHRcdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLnJlZ2V4KEhJREVfQ0FURUdPUllfRklMVEVSX0NPTlRFWFQua2V5LCBuZXcgUmVnRXhwKGAuKiwke2VzY2FwZVJlZ0V4cENoYXJhY3RlcnMoY2F0ZWdvcnlGaWx0ZXIpfSwuKmApKS5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRcdGlkOiB2aWV3RmlsdGVyU3VibWVudSxcblx0XHRcdFx0XHRcdFx0XHRncm91cDogJzFfY2F0ZWdvcnlfZmlsdGVyJyxcblx0XHRcdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgT1VUUFVUX1ZJRVdfSUQpKSxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRcdHRoYXQub3V0cHV0U2VydmljZS5maWx0ZXJzLnRvZ2dsZUNhdGVnb3J5KGNhdGVnb3J5RmlsdGVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFNob3dMaW5lKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UsIHBvc2l0aXZlOiBzdHJpbmdbXSwgbmVnYXRpdmU6IHN0cmluZ1tdKTogeyBzaG93OiBib29sZWFuOyBtYXRjaGVzOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSB9IHtcblx0XHRjb25zdCBtYXRjaGVzOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXG5cdFx0Ly8gQ2hlY2sgbmVnYXRpdmUgZmlsdGVycyBmaXJzdCAtIGlmIGFueSBtYXRjaCwgaGlkZSB0aGUgbGluZVxuXHRcdGlmIChuZWdhdGl2ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgbmVnYXRpdmUpIHtcblx0XHRcdFx0Y29uc3QgbmVnYXRpdmVNYXRjaGVzID0gbW9kZWwuZmluZE1hdGNoZXMocGF0dGVybiwgcmFuZ2UsIGZhbHNlLCBmYWxzZSwgbnVsbCwgZmFsc2UpO1xuXHRcdFx0XHRpZiAobmVnYXRpdmVNYXRjaGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzaG93OiBmYWxzZSwgbWF0Y2hlczogW10gfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIHRoZXJlIGFyZSBwb3NpdGl2ZSBmaWx0ZXJzLCBhdCBsZWFzdCBvbmUgbXVzdCBtYXRjaFxuXHRcdGlmIChwb3NpdGl2ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZXQgaGFzUG9zaXRpdmVNYXRjaCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHBvc2l0aXZlKSB7XG5cdFx0XHRcdGNvbnN0IHBvc2l0aXZlTWF0Y2hlcyA9IG1vZGVsLmZpbmRNYXRjaGVzKHBhdHRlcm4sIHJhbmdlLCBmYWxzZSwgZmFsc2UsIG51bGwsIGZhbHNlKTtcblx0XHRcdFx0aWYgKHBvc2l0aXZlTWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0aGFzUG9zaXRpdmVNYXRjaCA9IHRydWU7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBtYXRjaCBvZiBwb3NpdGl2ZU1hdGNoZXMpIHtcblx0XHRcdFx0XHRcdG1hdGNoZXMucHVzaCh7IHJhbmdlOiBtYXRjaC5yYW5nZSwgb3B0aW9uczogRmluZERlY29yYXRpb25zLl9GSU5EX01BVENIX0RFQ09SQVRJT04gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBzaG93OiBoYXNQb3NpdGl2ZU1hdGNoLCBtYXRjaGVzIH07XG5cdFx0fVxuXG5cdFx0Ly8gTm8gcG9zaXRpdmUgZmlsdGVycyBtZWFucyBzaG93IGV2ZXJ5dGhpbmcgKHRoYXQgcGFzc2VkIG5lZ2F0aXZlIGZpbHRlcnMpXG5cdFx0cmV0dXJuIHsgc2hvdzogdHJ1ZSwgbWF0Y2hlcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlKG1vZGVsOiBJVGV4dE1vZGVsLCBmcm9tTGluZU51bWJlcjogbnVtYmVyKTogeyBmaW5kTWF0Y2hlczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW107IGhpZGRlbkFyZWFzOiBSYW5nZVtdOyBjYXRlZ29yaWVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+IH0ge1xuXHRcdGNvbnN0IGZpbHRlcnMgPSB0aGlzLm91dHB1dFNlcnZpY2UuZmlsdGVycztcblx0XHRjb25zdCBhY3RpdmVDaGFubmVsID0gdGhpcy5vdXRwdXRTZXJ2aWNlLmdldEFjdGl2ZUNoYW5uZWwoKTtcblx0XHRjb25zdCBmaW5kTWF0Y2hlczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCBoaWRkZW5BcmVhczogUmFuZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IGNhdGVnb3JpZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgbG9nRW50cmllcyA9IGFjdGl2ZUNoYW5uZWw/LmdldExvZ0VudHJpZXMoKTtcblx0XHRpZiAoYWN0aXZlQ2hhbm5lbCAmJiBsb2dFbnRyaWVzPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGhhc0xvZ0xldmVsRmlsdGVyID0gIWZpbHRlcnMudHJhY2UgfHwgIWZpbHRlcnMuZGVidWcgfHwgIWZpbHRlcnMuaW5mbyB8fCAhZmlsdGVycy53YXJuaW5nIHx8ICFmaWx0ZXJzLmVycm9yO1xuXG5cdFx0XHRjb25zdCBmcm9tTG9nTGV2ZWxFbnRyeUluZGV4ID0gbG9nRW50cmllcy5maW5kSW5kZXgoZW50cnkgPT4gZnJvbUxpbmVOdW1iZXIgPj0gZW50cnkucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIGZyb21MaW5lTnVtYmVyIDw9IGVudHJ5LnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKGZyb21Mb2dMZXZlbEVudHJ5SW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiB7IGZpbmRNYXRjaGVzLCBoaWRkZW5BcmVhcywgY2F0ZWdvcmllcyB9O1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBpID0gZnJvbUxvZ0xldmVsRW50cnlJbmRleDsgaSA8IGxvZ0VudHJpZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBsb2dFbnRyaWVzW2ldO1xuXHRcdFx0XHRpZiAoZW50cnkuY2F0ZWdvcnkpIHtcblx0XHRcdFx0XHRjYXRlZ29yaWVzLnNldChgJHthY3RpdmVDaGFubmVsLmlkfToke2VudHJ5LmNhdGVnb3J5fWAsIGVudHJ5LmNhdGVnb3J5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGFzTG9nTGV2ZWxGaWx0ZXIgJiYgIXRoaXMuc2hvdWxkU2hvd0xvZ0xldmVsKGVudHJ5LCBmaWx0ZXJzKSkge1xuXHRcdFx0XHRcdGhpZGRlbkFyZWFzLnB1c2goZW50cnkucmFuZ2UpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdGhpcy5zaG91bGRTaG93Q2F0ZWdvcnkoYWN0aXZlQ2hhbm5lbC5pZCwgZW50cnksIGZpbHRlcnMpKSB7XG5cdFx0XHRcdFx0aGlkZGVuQXJlYXMucHVzaChlbnRyeS5yYW5nZSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGZpbHRlcnMuaW5jbHVkZVBhdHRlcm5zLmxlbmd0aCA+IDAgfHwgZmlsdGVycy5leGNsdWRlUGF0dGVybnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuc2hvdWxkU2hvd0xpbmUobW9kZWwsIGVudHJ5LnJhbmdlLCBmaWx0ZXJzLmluY2x1ZGVQYXR0ZXJucywgZmlsdGVycy5leGNsdWRlUGF0dGVybnMpO1xuXHRcdFx0XHRcdGlmIChyZXN1bHQuc2hvdykge1xuXHRcdFx0XHRcdFx0ZmluZE1hdGNoZXMucHVzaCguLi5yZXN1bHQubWF0Y2hlcyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGhpZGRlbkFyZWFzLnB1c2goZW50cnkucmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgZmluZE1hdGNoZXMsIGhpZGRlbkFyZWFzLCBjYXRlZ29yaWVzIH07XG5cdFx0fVxuXG5cdFx0aWYgKGZpbHRlcnMuaW5jbHVkZVBhdHRlcm5zLmxlbmd0aCA9PT0gMCAmJiBmaWx0ZXJzLmV4Y2x1ZGVQYXR0ZXJucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IGZpbmRNYXRjaGVzLCBoaWRkZW5BcmVhcywgY2F0ZWdvcmllcyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBmcm9tTGluZU51bWJlcjsgbGluZU51bWJlciA8PSBsaW5lQ291bnQ7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZVJhbmdlID0gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5zaG91bGRTaG93TGluZShtb2RlbCwgbGluZVJhbmdlLCBmaWx0ZXJzLmluY2x1ZGVQYXR0ZXJucywgZmlsdGVycy5leGNsdWRlUGF0dGVybnMpO1xuXHRcdFx0aWYgKHJlc3VsdC5zaG93KSB7XG5cdFx0XHRcdGZpbmRNYXRjaGVzLnB1c2goLi4ucmVzdWx0Lm1hdGNoZXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGlkZGVuQXJlYXMucHVzaChsaW5lUmFuZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBmaW5kTWF0Y2hlcywgaGlkZGVuQXJlYXMsIGNhdGVnb3JpZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkU2hvd0xvZ0xldmVsKGVudHJ5OiBJTG9nRW50cnksIGZpbHRlcnM6IElPdXRwdXRWaWV3RmlsdGVycyk6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAoZW50cnkubG9nTGV2ZWwpIHtcblx0XHRcdGNhc2UgTG9nTGV2ZWwuVHJhY2U6XG5cdFx0XHRcdHJldHVybiBmaWx0ZXJzLnRyYWNlO1xuXHRcdFx0Y2FzZSBMb2dMZXZlbC5EZWJ1Zzpcblx0XHRcdFx0cmV0dXJuIGZpbHRlcnMuZGVidWc7XG5cdFx0XHRjYXNlIExvZ0xldmVsLkluZm86XG5cdFx0XHRcdHJldHVybiBmaWx0ZXJzLmluZm87XG5cdFx0XHRjYXNlIExvZ0xldmVsLldhcm5pbmc6XG5cdFx0XHRcdHJldHVybiBmaWx0ZXJzLndhcm5pbmc7XG5cdFx0XHRjYXNlIExvZ0xldmVsLkVycm9yOlxuXHRcdFx0XHRyZXR1cm4gZmlsdGVycy5lcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFNob3dDYXRlZ29yeShhY3RpdmVDaGFubmVsSWQ6IHN0cmluZywgZW50cnk6IElMb2dFbnRyeSwgZmlsdGVyczogSU91dHB1dFZpZXdGaWx0ZXJzKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFlbnRyeS5jYXRlZ29yeSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiAhZmlsdGVycy5oYXNDYXRlZ29yeShgJHthY3RpdmVDaGFubmVsSWR9OiR7ZW50cnkuY2F0ZWdvcnl9YCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsT0FBTztBQUNQLFlBQVksU0FBUztBQUdyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLDZCQUE2QjtBQUN0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
