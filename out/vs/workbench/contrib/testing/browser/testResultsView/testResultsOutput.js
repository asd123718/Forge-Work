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
import * as dom from "../../../../../base/browser/dom.js";
import { Delayer } from "../../../../../base/common/async.js";
import { Event } from "../../../../../base/common/event.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, DisposableStore, MutableDisposable, combinedDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { CodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EmbeddedCodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { DiffEditorWidget } from "../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js";
import { EmbeddedDiffEditorWidget } from "../../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { peekViewResultsBackground } from "../../../../../editor/contrib/peekView/browser/peekView.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalCapabilityStore } from "../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { formatMessageForTerminal } from "../../../../../platform/terminal/common/terminalStrings.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { EditorModel } from "../../../../common/editor/editorModel.js";
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from "../../../../common/theme.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../common/views.js";
import { CALL_STACK_WIDGET_HEADER_HEIGHT } from "../../../debug/browser/callStackWidget.js";
import { DetachedProcessInfo } from "../../../terminal/browser/detachedTerminal.js";
import { ITerminalService } from "../../../terminal/browser/terminal.js";
import { getXtermScaledDimensions } from "../../../terminal/browser/xterm/xtermTerminal.js";
import { TERMINAL_BACKGROUND_COLOR } from "../../../terminal/common/terminalColorRegistry.js";
import { Testing } from "../../common/constants.js";
import { MutableObservableValue } from "../../common/observableValue.js";
import { LiveTestResult, TestResultItemChangeReason } from "../../common/testResult.js";
import { ITestMessage, TestMessageType, getMarkId } from "../../common/testTypes.js";
import { colorizeTestMessageInEditor } from "../testMessageColorizer.js";
import { MessageSubject, TaskSubject, TestOutputSubject } from "./testResultsSubject.js";
class SimpleDiffEditorModel extends EditorModel {
  constructor(_original, _modified) {
    super();
    this._original = _original;
    this._modified = _modified;
    this.original = this._original.object.textEditorModel;
    this.modified = this._modified.object.textEditorModel;
  }
  dispose() {
    super.dispose();
    this._original.dispose();
    this._modified.dispose();
  }
}
const commonEditorOptions = {
  scrollBeyondLastLine: false,
  links: true,
  lineNumbers: "off",
  glyphMargin: false,
  scrollbar: {
    vertical: "hidden",
    horizontal: "auto",
    useShadows: false,
    verticalHasArrows: false,
    horizontalHasArrows: false,
    handleMouseWheel: false
  },
  overviewRulerLanes: 0,
  fixedOverflowWidgets: true,
  readOnly: true,
  stickyScroll: { enabled: false },
  minimap: { enabled: false },
  automaticLayout: false
};
const diffEditorOptions = {
  ...commonEditorOptions,
  enableSplitViewResizing: true,
  isInEmbeddedEditor: true,
  renderOverviewRuler: false,
  ignoreTrimWhitespace: false,
  renderSideBySide: true,
  useInlineViewWhenSpaceIsLimited: false,
  originalAriaLabel: localize("testingOutputExpected", "Expected result"),
  modifiedAriaLabel: localize("testingOutputActual", "Actual result"),
  diffAlgorithm: "advanced"
};
function applyEditorMirrorOptions(base, cfg, update) {
  const immutable = new Set(Object.keys(base));
  function applyCurrent() {
    const configuration = cfg.getValue("editor");
    let changed = false;
    const patch = {};
    for (const [key, value] of Object.entries(configuration)) {
      if (!immutable.has(key) && base[key] !== value) {
        patch[key] = value;
        changed = true;
      }
    }
    return changed ? patch : void 0;
  }
  Object.assign(base, applyCurrent());
  return cfg.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("editor")) {
      const patch = applyCurrent();
      if (patch) {
        update(patch);
        Object.assign(base, patch);
      }
    }
  });
}
let DiffContentProvider = class extends Disposable {
  constructor(editor, container, instantiationService, modelService, configurationService) {
    super();
    this.editor = editor;
    this.container = container;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.configurationService = configurationService;
    this.widget = this._register(new MutableDisposable());
    this.model = this._register(new MutableDisposable());
  }
  get onDidContentSizeChange() {
    return this.widget.value?.onDidContentSizeChange || Event.None;
  }
  async update(subject) {
    if (!(subject instanceof MessageSubject)) {
      this.clear();
      return false;
    }
    const message = subject.message;
    if (!ITestMessage.isDiffable(message)) {
      this.clear();
      return false;
    }
    const [original, modified] = await Promise.all([
      this.modelService.createModelReference(subject.expectedUri),
      this.modelService.createModelReference(subject.actualUri)
    ]);
    const model = this.model.value = new SimpleDiffEditorModel(original, modified);
    if (!this.widget.value) {
      const options = { ...diffEditorOptions };
      const listener = applyEditorMirrorOptions(
        options,
        this.configurationService,
        (u) => editor.updateOptions(u)
      );
      const editor = this.widget.value = this.editor ? this.instantiationService.createInstance(
        EmbeddedDiffEditorWidget,
        this.container,
        options,
        {},
        this.editor
      ) : this.instantiationService.createInstance(
        DiffEditorWidget,
        this.container,
        options,
        {}
      );
      Event.once(editor.onDidDispose)(() => {
        listener.dispose();
      });
      if (this.dimension) {
        editor.layout(this.dimension);
      }
    }
    this.widget.value.setModel(model);
    this.widget.value.updateOptions(this.getOptions(
      isMultiline(message.expected) || isMultiline(message.actual)
    ));
    return true;
  }
  clear() {
    this.model.clear();
    this.widget.clear();
  }
  layout(dimensions, hasMultipleFrames) {
    this.dimension = dimensions;
    const editor = this.widget.value;
    if (!editor) {
      return;
    }
    editor.layout(dimensions);
    const height = Math.max(
      editor.getOriginalEditor().getContentHeight(),
      editor.getModifiedEditor().getContentHeight()
    );
    editor.updateOptions({ scrollbar: { ...commonEditorOptions.scrollbar, handleMouseWheel: !hasMultipleFrames } });
    this.helper = new ScrollHelper(hasMultipleFrames, height, dimensions.height);
    return height;
  }
  onScrolled(evt) {
    this.helper?.onScrolled(evt, this.widget.value?.getDomNode(), this.widget.value?.getOriginalEditor());
  }
  getOptions(isMultiline2) {
    return isMultiline2 ? { ...diffEditorOptions, lineNumbers: "on" } : { ...diffEditorOptions, lineNumbers: "off" };
  }
};
DiffContentProvider = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IConfigurationService)
], DiffContentProvider);
let MarkdownTestMessagePeek = class extends Disposable {
  constructor(container, markdownRendererService) {
    super();
    this.container = container;
    this.markdownRendererService = markdownRendererService;
    this.rendered = this._register(new DisposableStore());
    this._register(toDisposable(() => this.clear()));
  }
  async update(subject) {
    this.clear();
    if (!(subject instanceof MessageSubject)) {
      return false;
    }
    const message = subject.message;
    if (ITestMessage.isDiffable(message) || typeof message.message === "string") {
      return false;
    }
    const rendered = this.rendered.add(this.markdownRendererService.render(message.message, {}));
    rendered.element.style.userSelect = "text";
    rendered.element.classList.add("preview-text");
    this.container.appendChild(rendered.element);
    this.element = rendered.element;
    this.rendered.add(toDisposable(() => rendered.element.remove()));
    return true;
  }
  layout(dimension) {
    if (!this.element) {
      return void 0;
    }
    this.element.style.width = `${dimension.width - 32}px`;
    return this.element.clientHeight;
  }
  clear() {
    this.rendered.clear();
    this.element = void 0;
  }
};
MarkdownTestMessagePeek = __decorateClass([
  __decorateParam(1, IMarkdownRendererService)
], MarkdownTestMessagePeek);
class ScrollHelper {
  constructor(hasMultipleFrames, contentHeight, viewHeight) {
    this.hasMultipleFrames = hasMultipleFrames;
    this.contentHeight = contentHeight;
    this.viewHeight = viewHeight;
  }
  onScrolled(evt, container, editor) {
    if (!editor || !container) {
      return;
    }
    let delta = Math.max(0, evt.scrollTop - (this.hasMultipleFrames ? CALL_STACK_WIDGET_HEADER_HEIGHT : 0));
    delta = Math.min(Math.max(0, this.contentHeight - this.viewHeight), delta);
    editor.setScrollTop(delta);
    container.style.transform = `translateY(${delta}px)`;
  }
}
let PlainTextMessagePeek = class extends Disposable {
  constructor(editor, container, instantiationService, modelService, configurationService) {
    super();
    this.editor = editor;
    this.container = container;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.configurationService = configurationService;
    this.widgetDecorations = this._register(new MutableDisposable());
    this.widget = this._register(new MutableDisposable());
    this.model = this._register(new MutableDisposable());
  }
  get onDidContentSizeChange() {
    return this.widget.value?.onDidContentSizeChange || Event.None;
  }
  async update(subject) {
    if (!(subject instanceof MessageSubject)) {
      this.clear();
      return false;
    }
    const message = subject.message;
    if (ITestMessage.isDiffable(message) || message.type === TestMessageType.Output || typeof message.message !== "string") {
      this.clear();
      return false;
    }
    const modelRef = this.model.value = await this.modelService.createModelReference(subject.messageUri);
    if (!this.widget.value) {
      const options = { ...commonEditorOptions };
      const listener = applyEditorMirrorOptions(
        options,
        this.configurationService,
        (u) => editor.updateOptions(u)
      );
      const editor = this.widget.value = this.editor ? this.instantiationService.createInstance(
        EmbeddedCodeEditorWidget,
        this.container,
        options,
        {},
        this.editor
      ) : this.instantiationService.createInstance(
        CodeEditorWidget,
        this.container,
        options,
        { isSimpleWidget: true }
      );
      Event.once(editor.onDidDispose)(() => {
        listener.dispose();
      });
      if (this.dimension) {
        editor.layout(this.dimension);
      }
    }
    this.widget.value.setModel(modelRef.object.textEditorModel);
    this.widget.value.updateOptions(commonEditorOptions);
    this.widgetDecorations.value = colorizeTestMessageInEditor(message.message, this.widget.value);
    return true;
  }
  clear() {
    this.widgetDecorations.clear();
    this.widget.clear();
    this.model.clear();
  }
  onScrolled(evt) {
    this.helper?.onScrolled(evt, this.widget.value?.getDomNode(), this.widget.value);
  }
  layout(dimensions, hasMultipleFrames) {
    this.dimension = dimensions;
    const editor = this.widget.value;
    if (!editor) {
      return;
    }
    editor.layout(dimensions);
    const height = editor.getContentHeight();
    this.helper = new ScrollHelper(hasMultipleFrames, height, dimensions.height);
    editor.updateOptions({ scrollbar: { ...commonEditorOptions.scrollbar, handleMouseWheel: !hasMultipleFrames } });
    return height;
  }
};
PlainTextMessagePeek = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IConfigurationService)
], PlainTextMessagePeek);
let TerminalMessagePeek = class extends Disposable {
  constructor(container, isInPeekView, terminalService, viewDescriptorService, workspaceContext) {
    super();
    this.container = container;
    this.isInPeekView = isInPeekView;
    this.terminalService = terminalService;
    this.viewDescriptorService = viewDescriptorService;
    this.workspaceContext = workspaceContext;
    this.terminalCwd = this._register(new MutableObservableValue(""));
    this.xtermLayoutDelayer = this._register(new Delayer(50));
    /** Active terminal instance. */
    this.terminal = this._register(new MutableDisposable());
    /** Listener for streaming result data */
    this.outputDataListener = this._register(new MutableDisposable());
  }
  async makeTerminal() {
    const prev = this.terminal.value;
    if (prev) {
      prev.xterm.clearBuffer();
      prev.xterm.clearSearchDecorations();
      prev.xterm.write(`\x1Bc`);
      return prev;
    }
    const capabilities = new TerminalCapabilityStore();
    const cwd = this.terminalCwd;
    capabilities.add(TerminalCapability.CwdDetection, {
      type: TerminalCapability.CwdDetection,
      isTrusted: true,
      get cwds() {
        return [cwd.value];
      },
      onDidChangeCwd: cwd.onDidChange,
      getCwd: () => cwd.value,
      updateCwd: () => {
      }
    });
    return this.terminal.value = await this.terminalService.createDetachedTerminal({
      rows: 10,
      cols: 80,
      readonly: true,
      capabilities,
      processInfo: new DetachedProcessInfo({ initialCwd: cwd.value }),
      colorProvider: {
        getBackgroundColor: (theme) => {
          const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
          if (terminalBackground) {
            return terminalBackground;
          }
          if (this.isInPeekView) {
            return theme.getColor(peekViewResultsBackground);
          }
          const location = this.viewDescriptorService.getViewLocationById(Testing.ResultsViewId);
          return location === ViewContainerLocation.Panel ? theme.getColor(PANEL_BACKGROUND) : theme.getColor(SIDE_BAR_BACKGROUND);
        }
      }
    });
  }
  async update(subject) {
    this.outputDataListener.clear();
    if (subject instanceof TaskSubject) {
      await this.updateForTaskSubject(subject);
    } else if (subject instanceof TestOutputSubject || subject instanceof MessageSubject && subject.message.type === TestMessageType.Output) {
      await this.updateForTestSubject(subject);
    } else {
      this.clear();
      return false;
    }
    return true;
  }
  async updateForTestSubject(subject) {
    const that = this;
    const testItem = subject instanceof TestOutputSubject ? subject.test.item : subject.test;
    const terminal = await this.updateGenerically({
      subject,
      noOutputMessage: localize("caseNoOutput", "The test case did not report any output."),
      getTarget: (result) => result?.tasks[subject.taskIndex].output,
      *doInitialWrite(output, results) {
        that.updateCwd(testItem.uri);
        const state = subject instanceof TestOutputSubject ? subject.test : results.getStateById(testItem.extId);
        if (!state) {
          return;
        }
        for (const message of state.tasks[subject.taskIndex].messages) {
          if (message.type === TestMessageType.Output) {
            yield* output.getRangeIter(message.offset, message.length);
          }
        }
      },
      doListenForMoreData: (output, result, write) => result.onChange((e) => {
        if (e.reason === TestResultItemChangeReason.NewMessage && e.item.item.extId === testItem.extId && e.message.type === TestMessageType.Output) {
          for (const chunk of output.getRangeIter(e.message.offset, e.message.length)) {
            write(chunk.buffer);
          }
        }
      })
    });
    if (subject instanceof MessageSubject && subject.message.type === TestMessageType.Output && subject.message.marker !== void 0) {
      terminal?.xterm.selectMarkedRange(
        getMarkId(subject.message.marker, true),
        getMarkId(subject.message.marker, false),
        /* scrollIntoView= */
        true
      );
    }
  }
  updateForTaskSubject(subject) {
    return this.updateGenerically({
      subject,
      noOutputMessage: localize("runNoOutput", "The test run did not record any output."),
      getTarget: (result) => result?.tasks[subject.taskIndex],
      doInitialWrite: (task, result) => {
        this.updateCwd(Iterable.find(result.tests, (t) => !!t.item.uri)?.item.uri);
        return task.output.buffers;
      },
      doListenForMoreData: (task, _result, write) => task.output.onDidWriteData((e) => write(e.buffer))
    });
  }
  async updateGenerically(opts) {
    const result = opts.subject.result;
    const target = opts.getTarget(result);
    if (!target) {
      return this.clear();
    }
    const terminal = await this.makeTerminal();
    let didWriteData = false;
    const pendingWrites = new MutableObservableValue(0);
    if (result instanceof LiveTestResult) {
      for (const chunk of opts.doInitialWrite(target, result)) {
        didWriteData ||= chunk.byteLength > 0;
        pendingWrites.value++;
        terminal.xterm.write(chunk.buffer, () => pendingWrites.value--);
      }
    } else {
      didWriteData = true;
      this.writeNotice(terminal, localize("runNoOutputForPast", "Test output is only available for new test runs."));
    }
    this.attachTerminalToDom(terminal);
    this.outputDataListener.clear();
    if (result instanceof LiveTestResult && !result.completedAt) {
      const l1 = result.onComplete(() => {
        if (!didWriteData) {
          this.writeNotice(terminal, opts.noOutputMessage);
        }
      });
      const l2 = opts.doListenForMoreData(target, result, (data) => {
        terminal.xterm.write(data);
        didWriteData ||= data.byteLength > 0;
      });
      this.outputDataListener.value = combinedDisposable(l1, l2);
    }
    if (!this.outputDataListener.value && !didWriteData) {
      this.writeNotice(terminal, opts.noOutputMessage);
    }
    if (pendingWrites.value > 0) {
      await new Promise((resolve) => {
        const l = pendingWrites.onDidChange(() => {
          if (pendingWrites.value === 0) {
            l.dispose();
            resolve();
          }
        });
      });
    }
    return terminal;
  }
  updateCwd(testUri) {
    const wf = testUri && this.workspaceContext.getWorkspaceFolder(testUri) || this.workspaceContext.getWorkspace().folders[0];
    if (wf) {
      this.terminalCwd.value = wf.uri.fsPath;
    }
  }
  writeNotice(terminal, str) {
    terminal.xterm.write(formatMessageForTerminal(str));
  }
  attachTerminalToDom(terminal) {
    terminal.xterm.write("\x1B[?25l");
    dom.scheduleAtNextAnimationFrame(dom.getWindow(this.container), () => this.layoutTerminal(terminal));
    terminal.attachToElement(this.container, { enableGpu: false });
  }
  clear() {
    this.outputDataListener.clear();
    this.xtermLayoutDelayer.cancel();
    this.terminal.clear();
  }
  layout(dimensions) {
    this.dimensions = dimensions;
    if (this.terminal.value) {
      this.layoutTerminal(this.terminal.value, dimensions.width, dimensions.height);
      return dimensions.height;
    }
    return void 0;
  }
  layoutTerminal({ xterm }, width = this.dimensions?.width ?? this.container.clientWidth, height = this.dimensions?.height ?? this.container.clientHeight) {
    width -= 10 + 20;
    this.xtermLayoutDelayer.trigger(() => {
      const scaled = getXtermScaledDimensions(dom.getWindow(this.container), xterm.getFont(), width, height);
      if (scaled) {
        xterm.resize(scaled.cols, scaled.rows);
      }
    });
  }
};
TerminalMessagePeek = __decorateClass([
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, IWorkspaceContextService)
], TerminalMessagePeek);
const isMultiline = (str) => !!str && str.includes("\n");
export {
  DiffContentProvider,
  MarkdownTestMessagePeek,
  PlainTextMessagePeek,
  TerminalMessagePeek
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RSZXN1bHRzVmlld1xcdGVzdFJlc3VsdHNPdXRwdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UsIE11dGFibGVEaXNwb3NhYmxlLCBjb21iaW5lZERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRGlmZkVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2VtYmVkZGVkQ29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9lbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yT3B0aW9ucywgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBwZWVrVmlld1Jlc3VsdHNCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGVla1ZpZXcvYnJvd3Nlci9wZWVrVmlldy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL3Rlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLmpzJztcbmltcG9ydCB7IGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFN0cmluZ3MuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci90ZXh0RWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBQQU5FTF9CQUNLR1JPVU5ELCBTSURFX0JBUl9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBDQUxMX1NUQUNLX1dJREdFVF9IRUFERVJfSEVJR0hUIH0gZnJvbSAnLi4vLi4vLi4vZGVidWcvYnJvd3Nlci9jYWxsU3RhY2tXaWRnZXQuanMnO1xuaW1wb3J0IHsgRGV0YWNoZWRQcm9jZXNzSW5mbyB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvZGV0YWNoZWRUZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBnZXRYdGVybVNjYWxlZERpbWVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3h0ZXJtL3h0ZXJtVGVybWluYWwuanMnO1xuaW1wb3J0IHsgVEVSTUlOQUxfQkFDS0dST1VORF9DT0xPUiB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbENvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVGVzdGluZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgTXV0YWJsZU9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vYnNlcnZhYmxlVmFsdWUuanMnO1xuaW1wb3J0IHsgSVRhc2tSYXdPdXRwdXQsIElUZXN0UmVzdWx0LCBJVGVzdFJ1blRhc2tSZXN1bHRzLCBMaXZlVGVzdFJlc3VsdCwgVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24gfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdE1lc3NhZ2UsIFRlc3RNZXNzYWdlVHlwZSwgZ2V0TWFya0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBjb2xvcml6ZVRlc3RNZXNzYWdlSW5FZGl0b3IgfSBmcm9tICcuLi90ZXN0TWVzc2FnZUNvbG9yaXplci5qcyc7XG5pbXBvcnQgeyBJbnNwZWN0U3ViamVjdCwgTWVzc2FnZVN1YmplY3QsIFRhc2tTdWJqZWN0LCBUZXN0T3V0cHV0U3ViamVjdCB9IGZyb20gJy4vdGVzdFJlc3VsdHNTdWJqZWN0LmpzJztcblxuXG5jbGFzcyBTaW1wbGVEaWZmRWRpdG9yTW9kZWwgZXh0ZW5kcyBFZGl0b3JNb2RlbCB7XG5cdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbDogSVRleHRNb2RlbDtcblx0cHVibGljIHJlYWRvbmx5IG1vZGlmaWVkOiBJVGV4dE1vZGVsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsOiBJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWQ6IElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm9yaWdpbmFsID0gdGhpcy5fb3JpZ2luYWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHR0aGlzLm1vZGlmaWVkID0gdGhpcy5fbW9kaWZpZWQub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vcmlnaW5hbC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbW9kaWZpZWQuZGlzcG9zZSgpO1xuXHR9XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJUGVla091dHB1dFJlbmRlcmVyIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBvbkRpZENvbnRlbnRTaXplQ2hhbmdlPzogRXZlbnQ8dm9pZD47XG5cdG9uU2Nyb2xsZWQ/KGV2dDogU2Nyb2xsRXZlbnQpOiB2b2lkO1xuXHQvKiogVXBkYXRlcyB0aGUgZGlzcGxheWVkIHRlc3QuIFNob3VsZCBjbGVhciBpZiBpdCBjYW5ub3QgZGlzcGxheSB0aGUgdGVzdC4gKi9cblx0dXBkYXRlKHN1YmplY3Q6IEluc3BlY3RTdWJqZWN0KTogUHJvbWlzZTxib29sZWFuPjtcblx0LyoqIFJlY2FsY3VsYXRlIGNvbnRlbnQgbGF5b3V0LiBSZXR1cm5zIHRoZSBoZWlnaHQgaXQgc2hvdWxkIGJlIHJlbmRlcmVkIGF0LiAqL1xuXHRsYXlvdXQoZGltZW5zaW9uOiBkb20uSURpbWVuc2lvbiwgaGFzTXVsdGlwbGVGcmFtZXM6IGJvb2xlYW4pOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdC8qKiBEaXNwb3NlIHRoZSBjb250ZW50IHByb3ZpZGVyLiAqL1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmNvbnN0IGNvbW1vbkVkaXRvck9wdGlvbnM6IElFZGl0b3JPcHRpb25zID0ge1xuXHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdGxpbmtzOiB0cnVlLFxuXHRsaW5lTnVtYmVyczogJ29mZicsXG5cdGdseXBoTWFyZ2luOiBmYWxzZSxcblx0c2Nyb2xsYmFyOiB7XG5cdFx0dmVydGljYWw6ICdoaWRkZW4nLFxuXHRcdGhvcml6b250YWw6ICdhdXRvJyxcblx0XHR1c2VTaGFkb3dzOiBmYWxzZSxcblx0XHR2ZXJ0aWNhbEhhc0Fycm93czogZmFsc2UsXG5cdFx0aG9yaXpvbnRhbEhhc0Fycm93czogZmFsc2UsXG5cdFx0aGFuZGxlTW91c2VXaGVlbDogZmFsc2UsXG5cdH0sXG5cdG92ZXJ2aWV3UnVsZXJMYW5lczogMCxcblx0Zml4ZWRPdmVyZmxvd1dpZGdldHM6IHRydWUsXG5cdHJlYWRPbmx5OiB0cnVlLFxuXHRzdGlja3lTY3JvbGw6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0bWluaW1hcDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRhdXRvbWF0aWNMYXlvdXQ6IGZhbHNlLFxufTtcblxuY29uc3QgZGlmZkVkaXRvck9wdGlvbnM6IElEaWZmRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyA9IHtcblx0Li4uY29tbW9uRWRpdG9yT3B0aW9ucyxcblx0ZW5hYmxlU3BsaXRWaWV3UmVzaXppbmc6IHRydWUsXG5cdGlzSW5FbWJlZGRlZEVkaXRvcjogdHJ1ZSxcblx0cmVuZGVyT3ZlcnZpZXdSdWxlcjogZmFsc2UsXG5cdGlnbm9yZVRyaW1XaGl0ZXNwYWNlOiBmYWxzZSxcblx0cmVuZGVyU2lkZUJ5U2lkZTogdHJ1ZSxcblx0dXNlSW5saW5lVmlld1doZW5TcGFjZUlzTGltaXRlZDogZmFsc2UsXG5cdG9yaWdpbmFsQXJpYUxhYmVsOiBsb2NhbGl6ZSgndGVzdGluZ091dHB1dEV4cGVjdGVkJywgJ0V4cGVjdGVkIHJlc3VsdCcpLFxuXHRtb2RpZmllZEFyaWFMYWJlbDogbG9jYWxpemUoJ3Rlc3RpbmdPdXRwdXRBY3R1YWwnLCAnQWN0dWFsIHJlc3VsdCcpLFxuXHRkaWZmQWxnb3JpdGhtOiAnYWR2YW5jZWQnLFxufTtcblxuZnVuY3Rpb24gYXBwbHlFZGl0b3JNaXJyb3JPcHRpb25zPFQgZXh0ZW5kcyBJRWRpdG9yT3B0aW9ucz4oYmFzZTogVCwgY2ZnOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHVwZGF0ZTogKG9wdGlvbnM6IFBhcnRpYWw8SUVkaXRvck9wdGlvbnM+KSA9PiB2b2lkKSB7XG5cdGNvbnN0IGltbXV0YWJsZSA9IG5ldyBTZXQoT2JqZWN0LmtleXMoYmFzZSkpO1xuXHRmdW5jdGlvbiBhcHBseUN1cnJlbnQoKSB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IGNmZy5nZXRWYWx1ZTxJRWRpdG9yQ29uZmlndXJhdGlvbj4oJ2VkaXRvcicpO1xuXG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRjb25zdCBwYXRjaDogUGFydGlhbDxJRWRpdG9yT3B0aW9ucz4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWd1cmF0aW9uKSkge1xuXHRcdFx0aWYgKCFpbW11dGFibGUuaGFzKGtleSkgJiYgKGJhc2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV0gIT09IHZhbHVlKSB7XG5cdFx0XHRcdChwYXRjaCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XSA9IHZhbHVlO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY2hhbmdlZCA/IHBhdGNoIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0T2JqZWN0LmFzc2lnbihiYXNlLCBhcHBseUN1cnJlbnQoKSk7XG5cblx0cmV0dXJuIGNmZy5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvcicpKSB7XG5cdFx0XHRjb25zdCBwYXRjaCA9IGFwcGx5Q3VycmVudCgpO1xuXHRcdFx0aWYgKHBhdGNoKSB7XG5cdFx0XHRcdHVwZGF0ZShwYXRjaCk7XG5cdFx0XHRcdE9iamVjdC5hc3NpZ24oYmFzZSwgcGF0Y2gpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbmV4cG9ydCBjbGFzcyBEaWZmQ29udGVudFByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQZWVrT3V0cHV0UmVuZGVyZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaWZmRWRpdG9yV2lkZ2V0PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBkaW1lbnNpb24/OiBkb20uSURpbWVuc2lvbjtcblx0cHJpdmF0ZSBoZWxwZXI/OiBTY3JvbGxIZWxwZXI7XG5cblx0cHVibGljIGdldCBvbkRpZENvbnRlbnRTaXplQ2hhbmdlKCkge1xuXHRcdHJldHVybiB0aGlzLndpZGdldC52YWx1ZT8ub25EaWRDb250ZW50U2l6ZUNoYW5nZSB8fCBFdmVudC5Ob25lO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHVwZGF0ZShzdWJqZWN0OiBJbnNwZWN0U3ViamVjdCkge1xuXHRcdGlmICghKHN1YmplY3QgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdCkpIHtcblx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHN1YmplY3QubWVzc2FnZTtcblx0XHRpZiAoIUlUZXN0TWVzc2FnZS5pc0RpZmZhYmxlKG1lc3NhZ2UpKSB7XG5cdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW29yaWdpbmFsLCBtb2RpZmllZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShzdWJqZWN0LmV4cGVjdGVkVXJpKSxcblx0XHRcdHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHN1YmplY3QuYWN0dWFsVXJpKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbC52YWx1ZSA9IG5ldyBTaW1wbGVEaWZmRWRpdG9yTW9kZWwob3JpZ2luYWwsIG1vZGlmaWVkKTtcblx0XHRpZiAoIXRoaXMud2lkZ2V0LnZhbHVlKSB7XG5cdFx0XHRjb25zdCBvcHRpb25zID0geyAuLi5kaWZmRWRpdG9yT3B0aW9ucyB9O1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBhcHBseUVkaXRvck1pcnJvck9wdGlvbnMoXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHUgPT4gZWRpdG9yLnVwZGF0ZU9wdGlvbnModSlcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMud2lkZ2V0LnZhbHVlID0gdGhpcy5lZGl0b3IgPyB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRFbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQsXG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLFxuXHRcdFx0XHRvcHRpb25zLFxuXHRcdFx0XHR7fSxcblx0XHRcdFx0dGhpcy5lZGl0b3IsXG5cdFx0XHQpIDogdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0RGlmZkVkaXRvcldpZGdldCxcblx0XHRcdFx0dGhpcy5jb250YWluZXIsXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdHt9LFxuXHRcdFx0KTtcblxuXHRcdFx0RXZlbnQub25jZShlZGl0b3Iub25EaWREaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdFx0ZWRpdG9yLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy53aWRnZXQudmFsdWUuc2V0TW9kZWwobW9kZWwpO1xuXHRcdHRoaXMud2lkZ2V0LnZhbHVlLnVwZGF0ZU9wdGlvbnModGhpcy5nZXRPcHRpb25zKFxuXHRcdFx0aXNNdWx0aWxpbmUobWVzc2FnZS5leHBlY3RlZCkgfHwgaXNNdWx0aWxpbmUobWVzc2FnZS5hY3R1YWwpXG5cdFx0KSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKSB7XG5cdFx0dGhpcy5tb2RlbC5jbGVhcigpO1xuXHRcdHRoaXMud2lkZ2V0LmNsZWFyKCk7XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0KGRpbWVuc2lvbnM6IGRvbS5JRGltZW5zaW9uLCBoYXNNdWx0aXBsZUZyYW1lczogYm9vbGVhbikge1xuXHRcdHRoaXMuZGltZW5zaW9uID0gZGltZW5zaW9ucztcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLndpZGdldC52YWx1ZTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGVkaXRvci5sYXlvdXQoZGltZW5zaW9ucyk7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gTWF0aC5tYXgoXG5cdFx0XHRlZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKS5nZXRDb250ZW50SGVpZ2h0KCksXG5cdFx0XHRlZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKS5nZXRDb250ZW50SGVpZ2h0KClcblx0XHQpO1xuXHRcdGVkaXRvci51cGRhdGVPcHRpb25zKHsgc2Nyb2xsYmFyOiB7IC4uLmNvbW1vbkVkaXRvck9wdGlvbnMuc2Nyb2xsYmFyLCBoYW5kbGVNb3VzZVdoZWVsOiAhaGFzTXVsdGlwbGVGcmFtZXMgfSB9KTtcblx0XHR0aGlzLmhlbHBlciA9IG5ldyBTY3JvbGxIZWxwZXIoaGFzTXVsdGlwbGVGcmFtZXMsIGhlaWdodCwgZGltZW5zaW9ucy5oZWlnaHQpO1xuXHRcdHJldHVybiBoZWlnaHQ7XG5cdH1cblxuXHRwdWJsaWMgb25TY3JvbGxlZChldnQ6IFNjcm9sbEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5oZWxwZXI/Lm9uU2Nyb2xsZWQoZXZ0LCB0aGlzLndpZGdldC52YWx1ZT8uZ2V0RG9tTm9kZSgpLCB0aGlzLndpZGdldC52YWx1ZT8uZ2V0T3JpZ2luYWxFZGl0b3IoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0T3B0aW9ucyhpc011bHRpbGluZTogYm9vbGVhbik6IElEaWZmRWRpdG9yT3B0aW9ucyB7XG5cdFx0cmV0dXJuIGlzTXVsdGlsaW5lXG5cdFx0XHQ/IHsgLi4uZGlmZkVkaXRvck9wdGlvbnMsIGxpbmVOdW1iZXJzOiAnb24nIH1cblx0XHRcdDogeyAuLi5kaWZmRWRpdG9yT3B0aW9ucywgbGluZU51bWJlcnM6ICdvZmYnIH07XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgTWFya2Rvd25UZXN0TWVzc2FnZVBlZWsgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVBlZWtPdXRwdXRSZW5kZXJlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBlbGVtZW50PzogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsZWFyKCkpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB1cGRhdGUoc3ViamVjdDogSW5zcGVjdFN1YmplY3QpIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0aWYgKCEoc3ViamVjdCBpbnN0YW5jZW9mIE1lc3NhZ2VTdWJqZWN0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBzdWJqZWN0Lm1lc3NhZ2U7XG5cdFx0aWYgKElUZXN0TWVzc2FnZS5pc0RpZmZhYmxlKG1lc3NhZ2UpIHx8IHR5cGVvZiBtZXNzYWdlLm1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cblx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMucmVuZGVyZWQuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG1lc3NhZ2UubWVzc2FnZSwge30pKTtcblx0XHRyZW5kZXJlZC5lbGVtZW50LnN0eWxlLnVzZXJTZWxlY3QgPSAndGV4dCc7XG5cdFx0cmVuZGVyZWQuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdwcmV2aWV3LXRleHQnKTtcblx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHR0aGlzLmVsZW1lbnQgPSByZW5kZXJlZC5lbGVtZW50O1xuXHRcdHRoaXMucmVuZGVyZWQuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByZW5kZXJlZC5lbGVtZW50LnJlbW92ZSgpKSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXQoZGltZW5zaW9uOiBkb20uSURpbWVuc2lvbik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLndpZHRoID0gYCR7ZGltZW5zaW9uLndpZHRoIC0gMzJ9cHhgO1xuXHRcdHJldHVybiB0aGlzLmVsZW1lbnQuY2xpZW50SGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpIHtcblx0XHR0aGlzLnJlbmRlcmVkLmNsZWFyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIFNjcm9sbEhlbHBlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaGFzTXVsdGlwbGVGcmFtZXM6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50SGVpZ2h0OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aWV3SGVpZ2h0OiBudW1iZXIsXG5cdCkgeyB9XG5cblx0cHVibGljIG9uU2Nyb2xsZWQoZXZ0OiBTY3JvbGxFdmVudCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB8IG51bGwsIGVkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoIWVkaXRvciB8fCAhY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGRlbHRhID0gTWF0aC5tYXgoMCwgZXZ0LnNjcm9sbFRvcCAtICh0aGlzLmhhc011bHRpcGxlRnJhbWVzID8gQ0FMTF9TVEFDS19XSURHRVRfSEVBREVSX0hFSUdIVCA6IDApKTtcblx0XHRkZWx0YSA9IE1hdGgubWluKE1hdGgubWF4KDAsIHRoaXMuY29udGVudEhlaWdodCAtIHRoaXMudmlld0hlaWdodCksIGRlbHRhKTtcblxuXHRcdGVkaXRvci5zZXRTY3JvbGxUb3AoZGVsdGEpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlWSgke2RlbHRhfXB4KWA7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFBsYWluVGV4dE1lc3NhZ2VQZWVrIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQZWVrT3V0cHV0UmVuZGVyZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldERlY29yYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDb2RlRWRpdG9yV2lkZ2V0PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBkaW1lbnNpb24/OiBkb20uSURpbWVuc2lvbjtcblx0cHJpdmF0ZSBoZWxwZXI/OiBTY3JvbGxIZWxwZXI7XG5cblx0cHVibGljIGdldCBvbkRpZENvbnRlbnRTaXplQ2hhbmdlKCkge1xuXHRcdHJldHVybiB0aGlzLndpZGdldC52YWx1ZT8ub25EaWRDb250ZW50U2l6ZUNoYW5nZSB8fCBFdmVudC5Ob25lO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHVwZGF0ZShzdWJqZWN0OiBJbnNwZWN0U3ViamVjdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghKHN1YmplY3QgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdCkpIHtcblx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBtZXNzYWdlID0gc3ViamVjdC5tZXNzYWdlO1xuXHRcdGlmIChJVGVzdE1lc3NhZ2UuaXNEaWZmYWJsZShtZXNzYWdlKSB8fCBtZXNzYWdlLnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5PdXRwdXQgfHwgdHlwZW9mIG1lc3NhZ2UubWVzc2FnZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMubW9kZWwudmFsdWUgPSBhd2FpdCB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShzdWJqZWN0Lm1lc3NhZ2VVcmkpO1xuXHRcdGlmICghdGhpcy53aWRnZXQudmFsdWUpIHtcblx0XHRcdGNvbnN0IG9wdGlvbnMgPSB7IC4uLmNvbW1vbkVkaXRvck9wdGlvbnMgfTtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gYXBwbHlFZGl0b3JNaXJyb3JPcHRpb25zKFxuXHRcdFx0XHRvcHRpb25zLFxuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR1ID0+IGVkaXRvci51cGRhdGVPcHRpb25zKHUpXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLndpZGdldC52YWx1ZSA9IHRoaXMuZWRpdG9yID8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0RW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdFx0XHR0aGlzLmNvbnRhaW5lcixcblx0XHRcdFx0b3B0aW9ucyxcblx0XHRcdFx0e30sXG5cdFx0XHRcdHRoaXMuZWRpdG9yLFxuXHRcdFx0KSA6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLFxuXHRcdFx0XHRvcHRpb25zLFxuXHRcdFx0XHR7IGlzU2ltcGxlV2lkZ2V0OiB0cnVlIH1cblx0XHRcdCk7XG5cblx0XHRcdEV2ZW50Lm9uY2UoZWRpdG9yLm9uRGlkRGlzcG9zZSkoKCkgPT4ge1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHRcdGVkaXRvci5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMud2lkZ2V0LnZhbHVlLnNldE1vZGVsKG1vZGVsUmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwpO1xuXHRcdHRoaXMud2lkZ2V0LnZhbHVlLnVwZGF0ZU9wdGlvbnMoY29tbW9uRWRpdG9yT3B0aW9ucyk7XG5cdFx0dGhpcy53aWRnZXREZWNvcmF0aW9ucy52YWx1ZSA9IGNvbG9yaXplVGVzdE1lc3NhZ2VJbkVkaXRvcihtZXNzYWdlLm1lc3NhZ2UsIHRoaXMud2lkZ2V0LnZhbHVlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKSB7XG5cdFx0dGhpcy53aWRnZXREZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdHRoaXMud2lkZ2V0LmNsZWFyKCk7XG5cdFx0dGhpcy5tb2RlbC5jbGVhcigpO1xuXHR9XG5cblx0b25TY3JvbGxlZChldnQ6IFNjcm9sbEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5oZWxwZXI/Lm9uU2Nyb2xsZWQoZXZ0LCB0aGlzLndpZGdldC52YWx1ZT8uZ2V0RG9tTm9kZSgpLCB0aGlzLndpZGdldC52YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0KGRpbWVuc2lvbnM6IGRvbS5JRGltZW5zaW9uLCBoYXNNdWx0aXBsZUZyYW1lczogYm9vbGVhbikge1xuXHRcdHRoaXMuZGltZW5zaW9uID0gZGltZW5zaW9ucztcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLndpZGdldC52YWx1ZTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGVkaXRvci5sYXlvdXQoZGltZW5zaW9ucyk7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gZWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHR0aGlzLmhlbHBlciA9IG5ldyBTY3JvbGxIZWxwZXIoaGFzTXVsdGlwbGVGcmFtZXMsIGhlaWdodCwgZGltZW5zaW9ucy5oZWlnaHQpO1xuXHRcdGVkaXRvci51cGRhdGVPcHRpb25zKHsgc2Nyb2xsYmFyOiB7IC4uLmNvbW1vbkVkaXRvck9wdGlvbnMuc2Nyb2xsYmFyLCBoYW5kbGVNb3VzZVdoZWVsOiAhaGFzTXVsdGlwbGVGcmFtZXMgfSB9KTtcblxuXHRcdHJldHVybiBoZWlnaHQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsTWVzc2FnZVBlZWsgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVBlZWtPdXRwdXRSZW5kZXJlciB7XG5cdHByaXZhdGUgZGltZW5zaW9ucz86IGRvbS5JRGltZW5zaW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRlcm1pbmFsQ3dkID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVPYnNlcnZhYmxlVmFsdWU8c3RyaW5nPignJykpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHh0ZXJtTGF5b3V0RGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyKDUwKSk7XG5cblx0LyoqIEFjdGl2ZSB0ZXJtaW5hbCBpbnN0YW5jZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSB0ZXJtaW5hbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0LyoqIExpc3RlbmVyIGZvciBzdHJlYW1pbmcgcmVzdWx0IGRhdGEgKi9cblx0cHJpdmF0ZSByZWFkb25seSBvdXRwdXREYXRhTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNJblBlZWtWaWV3OiBib29sZWFuLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0OiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1ha2VUZXJtaW5hbCgpIHtcblx0XHRjb25zdCBwcmV2ID0gdGhpcy50ZXJtaW5hbC52YWx1ZTtcblx0XHRpZiAocHJldikge1xuXHRcdFx0cHJldi54dGVybS5jbGVhckJ1ZmZlcigpO1xuXHRcdFx0cHJldi54dGVybS5jbGVhclNlYXJjaERlY29yYXRpb25zKCk7XG5cdFx0XHQvLyBjbGVhckJ1ZmZlciB0cmllcyB0byByZXRhaW4gdGhlIHByb21wdC4gUmVzZXQgcHJvbXB0LCBzY3JvbGxpbmcgc3RhdGUsIGV0Yy5cblx0XHRcdHByZXYueHRlcm0ud3JpdGUoYFxceDFiY2ApO1xuXHRcdFx0cmV0dXJuIHByZXY7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gbmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCk7XG5cdFx0Y29uc3QgY3dkID0gdGhpcy50ZXJtaW5hbEN3ZDtcblx0XHRjYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24sIHtcblx0XHRcdHR5cGU6IFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24sXG5cdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRnZXQgY3dkcygpIHsgcmV0dXJuIFtjd2QudmFsdWVdOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2VDd2Q6IGN3ZC5vbkRpZENoYW5nZSxcblx0XHRcdGdldEN3ZDogKCkgPT4gY3dkLnZhbHVlLFxuXHRcdFx0dXBkYXRlQ3dkOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdGhpcy50ZXJtaW5hbC52YWx1ZSA9IGF3YWl0IHRoaXMudGVybWluYWxTZXJ2aWNlLmNyZWF0ZURldGFjaGVkVGVybWluYWwoe1xuXHRcdFx0cm93czogMTAsXG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJlYWRvbmx5OiB0cnVlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzLFxuXHRcdFx0cHJvY2Vzc0luZm86IG5ldyBEZXRhY2hlZFByb2Nlc3NJbmZvKHsgaW5pdGlhbEN3ZDogY3dkLnZhbHVlIH0pLFxuXHRcdFx0Y29sb3JQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRCYWNrZ3JvdW5kQ29sb3I6IHRoZW1lID0+IHtcblx0XHRcdFx0XHRjb25zdCB0ZXJtaW5hbEJhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9CQUNLR1JPVU5EX0NPTE9SKTtcblx0XHRcdFx0XHRpZiAodGVybWluYWxCYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGVybWluYWxCYWNrZ3JvdW5kO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5pc0luUGVla1ZpZXcpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGVtZS5nZXRDb2xvcihwZWVrVmlld1Jlc3VsdHNCYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKFRlc3RpbmcuUmVzdWx0c1ZpZXdJZCk7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWxcblx0XHRcdFx0XHRcdD8gdGhlbWUuZ2V0Q29sb3IoUEFORUxfQkFDS0dST1VORClcblx0XHRcdFx0XHRcdDogdGhlbWUuZ2V0Q29sb3IoU0lERV9CQVJfQkFDS0dST1VORCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdXBkYXRlKHN1YmplY3Q6IEluc3BlY3RTdWJqZWN0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5vdXRwdXREYXRhTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRpZiAoc3ViamVjdCBpbnN0YW5jZW9mIFRhc2tTdWJqZWN0KSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUZvclRhc2tTdWJqZWN0KHN1YmplY3QpO1xuXHRcdH0gZWxzZSBpZiAoc3ViamVjdCBpbnN0YW5jZW9mIFRlc3RPdXRwdXRTdWJqZWN0IHx8IChzdWJqZWN0IGluc3RhbmNlb2YgTWVzc2FnZVN1YmplY3QgJiYgc3ViamVjdC5tZXNzYWdlLnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5PdXRwdXQpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUZvclRlc3RTdWJqZWN0KHN1YmplY3QpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUZvclRlc3RTdWJqZWN0KHN1YmplY3Q6IFRlc3RPdXRwdXRTdWJqZWN0IHwgTWVzc2FnZVN1YmplY3QpIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCB0ZXN0SXRlbSA9IHN1YmplY3QgaW5zdGFuY2VvZiBUZXN0T3V0cHV0U3ViamVjdCA/IHN1YmplY3QudGVzdC5pdGVtIDogc3ViamVjdC50ZXN0O1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gYXdhaXQgdGhpcy51cGRhdGVHZW5lcmljYWxseTxJVGFza1Jhd091dHB1dD4oe1xuXHRcdFx0c3ViamVjdCxcblx0XHRcdG5vT3V0cHV0TWVzc2FnZTogbG9jYWxpemUoJ2Nhc2VOb091dHB1dCcsICdUaGUgdGVzdCBjYXNlIGRpZCBub3QgcmVwb3J0IGFueSBvdXRwdXQuJyksXG5cdFx0XHRnZXRUYXJnZXQ6IHJlc3VsdCA9PiByZXN1bHQ/LnRhc2tzW3N1YmplY3QudGFza0luZGV4XS5vdXRwdXQsXG5cdFx0XHQqZG9Jbml0aWFsV3JpdGUob3V0cHV0LCByZXN1bHRzKSB7XG5cdFx0XHRcdHRoYXQudXBkYXRlQ3dkKHRlc3RJdGVtLnVyaSk7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gc3ViamVjdCBpbnN0YW5jZW9mIFRlc3RPdXRwdXRTdWJqZWN0ID8gc3ViamVjdC50ZXN0IDogcmVzdWx0cy5nZXRTdGF0ZUJ5SWQodGVzdEl0ZW0uZXh0SWQpO1xuXHRcdFx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIHN0YXRlLnRhc2tzW3N1YmplY3QudGFza0luZGV4XS5tZXNzYWdlcykge1xuXHRcdFx0XHRcdGlmIChtZXNzYWdlLnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5PdXRwdXQpIHtcblx0XHRcdFx0XHRcdHlpZWxkKiBvdXRwdXQuZ2V0UmFuZ2VJdGVyKG1lc3NhZ2Uub2Zmc2V0LCBtZXNzYWdlLmxlbmd0aCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZG9MaXN0ZW5Gb3JNb3JlRGF0YTogKG91dHB1dCwgcmVzdWx0LCB3cml0ZSkgPT4gcmVzdWx0Lm9uQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5yZWFzb24gPT09IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk5ld01lc3NhZ2UgJiYgZS5pdGVtLml0ZW0uZXh0SWQgPT09IHRlc3RJdGVtLmV4dElkICYmIGUubWVzc2FnZS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuT3V0cHV0KSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjaHVuayBvZiBvdXRwdXQuZ2V0UmFuZ2VJdGVyKGUubWVzc2FnZS5vZmZzZXQsIGUubWVzc2FnZS5sZW5ndGgpKSB7XG5cdFx0XHRcdFx0XHR3cml0ZShjaHVuay5idWZmZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0fSk7XG5cblx0XHRpZiAoc3ViamVjdCBpbnN0YW5jZW9mIE1lc3NhZ2VTdWJqZWN0ICYmIHN1YmplY3QubWVzc2FnZS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuT3V0cHV0ICYmIHN1YmplY3QubWVzc2FnZS5tYXJrZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGVybWluYWw/Lnh0ZXJtLnNlbGVjdE1hcmtlZFJhbmdlKGdldE1hcmtJZChzdWJqZWN0Lm1lc3NhZ2UubWFya2VyLCB0cnVlKSwgZ2V0TWFya0lkKHN1YmplY3QubWVzc2FnZS5tYXJrZXIsIGZhbHNlKSwgLyogc2Nyb2xsSW50b1ZpZXc9ICovIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRm9yVGFza1N1YmplY3Qoc3ViamVjdDogVGFza1N1YmplY3QpIHtcblx0XHRyZXR1cm4gdGhpcy51cGRhdGVHZW5lcmljYWxseTxJVGVzdFJ1blRhc2tSZXN1bHRzPih7XG5cdFx0XHRzdWJqZWN0LFxuXHRcdFx0bm9PdXRwdXRNZXNzYWdlOiBsb2NhbGl6ZSgncnVuTm9PdXRwdXQnLCAnVGhlIHRlc3QgcnVuIGRpZCBub3QgcmVjb3JkIGFueSBvdXRwdXQuJyksXG5cdFx0XHRnZXRUYXJnZXQ6IHJlc3VsdCA9PiByZXN1bHQ/LnRhc2tzW3N1YmplY3QudGFza0luZGV4XSxcblx0XHRcdGRvSW5pdGlhbFdyaXRlOiAodGFzaywgcmVzdWx0KSA9PiB7XG5cdFx0XHRcdC8vIFVwZGF0ZSB0aGUgY3dkIGFuZCB1c2UgdGhlIGZpcnN0IHRlc3QgdG8gdHJ5IHRvIGhpbnQgYXQgdGhlIGNvcnJlY3QgY3dkLFxuXHRcdFx0XHQvLyBidXQgb2Z0ZW4gdGhpcyB3aWxsIGZhbGwgYmFjayB0byB0aGUgZmlyc3Qgd29ya3NwYWNlIGZvbGRlci5cblx0XHRcdFx0dGhpcy51cGRhdGVDd2QoSXRlcmFibGUuZmluZChyZXN1bHQudGVzdHMsIHQgPT4gISF0Lml0ZW0udXJpKT8uaXRlbS51cmkpO1xuXHRcdFx0XHRyZXR1cm4gdGFzay5vdXRwdXQuYnVmZmVycztcblx0XHRcdH0sXG5cdFx0XHRkb0xpc3RlbkZvck1vcmVEYXRhOiAodGFzaywgX3Jlc3VsdCwgd3JpdGUpID0+IHRhc2sub3V0cHV0Lm9uRGlkV3JpdGVEYXRhKGUgPT4gd3JpdGUoZS5idWZmZXIpKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlR2VuZXJpY2FsbHk8VD4ob3B0czoge1xuXHRcdHN1YmplY3Q6IEluc3BlY3RTdWJqZWN0O1xuXHRcdG5vT3V0cHV0TWVzc2FnZTogc3RyaW5nO1xuXHRcdGdldFRhcmdldDogKHJlc3VsdDogSVRlc3RSZXN1bHQpID0+IFQgfCB1bmRlZmluZWQ7XG5cdFx0ZG9Jbml0aWFsV3JpdGU6ICh0YXJnZXQ6IFQsIHJlc3VsdDogTGl2ZVRlc3RSZXN1bHQpID0+IEl0ZXJhYmxlPFZTQnVmZmVyPjtcblx0XHRkb0xpc3RlbkZvck1vcmVEYXRhOiAodGFyZ2V0OiBULCByZXN1bHQ6IExpdmVUZXN0UmVzdWx0LCB3cml0ZTogKHM6IFVpbnQ4QXJyYXkpID0+IHZvaWQpID0+IElEaXNwb3NhYmxlO1xuXHR9KSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gb3B0cy5zdWJqZWN0LnJlc3VsdDtcblx0XHRjb25zdCB0YXJnZXQgPSBvcHRzLmdldFRhcmdldChyZXN1bHQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jbGVhcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRlcm1pbmFsID0gYXdhaXQgdGhpcy5tYWtlVGVybWluYWwoKTtcblx0XHRsZXQgZGlkV3JpdGVEYXRhID0gZmFsc2U7XG5cblx0XHRjb25zdCBwZW5kaW5nV3JpdGVzID0gbmV3IE11dGFibGVPYnNlcnZhYmxlVmFsdWUoMCk7XG5cdFx0aWYgKHJlc3VsdCBpbnN0YW5jZW9mIExpdmVUZXN0UmVzdWx0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNodW5rIG9mIG9wdHMuZG9Jbml0aWFsV3JpdGUodGFyZ2V0LCByZXN1bHQpKSB7XG5cdFx0XHRcdGRpZFdyaXRlRGF0YSB8fD0gY2h1bmsuYnl0ZUxlbmd0aCA+IDA7XG5cdFx0XHRcdHBlbmRpbmdXcml0ZXMudmFsdWUrKztcblx0XHRcdFx0dGVybWluYWwueHRlcm0ud3JpdGUoY2h1bmsuYnVmZmVyLCAoKSA9PiBwZW5kaW5nV3JpdGVzLnZhbHVlLS0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRkaWRXcml0ZURhdGEgPSB0cnVlO1xuXHRcdFx0dGhpcy53cml0ZU5vdGljZSh0ZXJtaW5hbCwgbG9jYWxpemUoJ3J1bk5vT3V0cHV0Rm9yUGFzdCcsICdUZXN0IG91dHB1dCBpcyBvbmx5IGF2YWlsYWJsZSBmb3IgbmV3IHRlc3QgcnVucy4nKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5hdHRhY2hUZXJtaW5hbFRvRG9tKHRlcm1pbmFsKTtcblx0XHR0aGlzLm91dHB1dERhdGFMaXN0ZW5lci5jbGVhcigpO1xuXG5cdFx0aWYgKHJlc3VsdCBpbnN0YW5jZW9mIExpdmVUZXN0UmVzdWx0ICYmICFyZXN1bHQuY29tcGxldGVkQXQpIHtcblx0XHRcdGNvbnN0IGwxID0gcmVzdWx0Lm9uQ29tcGxldGUoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWRpZFdyaXRlRGF0YSkge1xuXHRcdFx0XHRcdHRoaXMud3JpdGVOb3RpY2UodGVybWluYWwsIG9wdHMubm9PdXRwdXRNZXNzYWdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBsMiA9IG9wdHMuZG9MaXN0ZW5Gb3JNb3JlRGF0YSh0YXJnZXQsIHJlc3VsdCwgZGF0YSA9PiB7XG5cdFx0XHRcdHRlcm1pbmFsLnh0ZXJtLndyaXRlKGRhdGEpO1xuXHRcdFx0XHRkaWRXcml0ZURhdGEgfHw9IGRhdGEuYnl0ZUxlbmd0aCA+IDA7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5vdXRwdXREYXRhTGlzdGVuZXIudmFsdWUgPSBjb21iaW5lZERpc3Bvc2FibGUobDEsIGwyKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMub3V0cHV0RGF0YUxpc3RlbmVyLnZhbHVlICYmICFkaWRXcml0ZURhdGEpIHtcblx0XHRcdHRoaXMud3JpdGVOb3RpY2UodGVybWluYWwsIG9wdHMubm9PdXRwdXRNZXNzYWdlKTtcblx0XHR9XG5cblx0XHQvLyBFbnN1cmUgcGVuZGluZyB3cml0ZXMgZmluaXNoLCBvdGhlcndpc2UgdGhlIHNlbGVjdGlvbiBpbiBgdXBkYXRlRm9yVGVzdFN1YmplY3RgXG5cdFx0Ly8gY2FuIGhhcHBlbiBiZWZvcmUgdGhlIG1hcmtlcnMgYXJlIHByb2Nlc3NlZC5cblx0XHRpZiAocGVuZGluZ1dyaXRlcy52YWx1ZSA+IDApIHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRjb25zdCBsID0gcGVuZGluZ1dyaXRlcy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHBlbmRpbmdXcml0ZXMudmFsdWUgPT09IDApIHtcblx0XHRcdFx0XHRcdGwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGVybWluYWw7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUN3ZCh0ZXN0VXJpPzogVVJJKSB7XG5cdFx0Y29uc3Qgd2YgPSAodGVzdFVyaSAmJiB0aGlzLndvcmtzcGFjZUNvbnRleHQuZ2V0V29ya3NwYWNlRm9sZGVyKHRlc3RVcmkpKVxuXHRcdFx0fHwgdGhpcy53b3Jrc3BhY2VDb250ZXh0LmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF07XG5cdFx0aWYgKHdmKSB7XG5cdFx0XHR0aGlzLnRlcm1pbmFsQ3dkLnZhbHVlID0gd2YudXJpLmZzUGF0aDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHdyaXRlTm90aWNlKHRlcm1pbmFsOiBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlLCBzdHI6IHN0cmluZykge1xuXHRcdHRlcm1pbmFsLnh0ZXJtLndyaXRlKGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbChzdHIpKTtcblx0fVxuXG5cdHByaXZhdGUgYXR0YWNoVGVybWluYWxUb0RvbSh0ZXJtaW5hbDogSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdHRlcm1pbmFsLnh0ZXJtLndyaXRlKCdcXHgxYls/MjVsJyk7IC8vIGhpZGUgY3Vyc29yXG5cdFx0ZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyh0aGlzLmNvbnRhaW5lciksICgpID0+IHRoaXMubGF5b3V0VGVybWluYWwodGVybWluYWwpKTtcblx0XHR0ZXJtaW5hbC5hdHRhY2hUb0VsZW1lbnQodGhpcy5jb250YWluZXIsIHsgZW5hYmxlR3B1OiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKSB7XG5cdFx0dGhpcy5vdXRwdXREYXRhTGlzdGVuZXIuY2xlYXIoKTtcblx0XHR0aGlzLnh0ZXJtTGF5b3V0RGVsYXllci5jYW5jZWwoKTtcblx0XHR0aGlzLnRlcm1pbmFsLmNsZWFyKCk7XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0KGRpbWVuc2lvbnM6IGRvbS5JRGltZW5zaW9uKSB7XG5cdFx0dGhpcy5kaW1lbnNpb25zID0gZGltZW5zaW9ucztcblx0XHRpZiAodGhpcy50ZXJtaW5hbC52YWx1ZSkge1xuXHRcdFx0dGhpcy5sYXlvdXRUZXJtaW5hbCh0aGlzLnRlcm1pbmFsLnZhbHVlLCBkaW1lbnNpb25zLndpZHRoLCBkaW1lbnNpb25zLmhlaWdodCk7XG5cdFx0XHRyZXR1cm4gZGltZW5zaW9ucy5oZWlnaHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0VGVybWluYWwoXG5cdFx0eyB4dGVybSB9OiBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlLFxuXHRcdHdpZHRoID0gdGhpcy5kaW1lbnNpb25zPy53aWR0aCA/PyB0aGlzLmNvbnRhaW5lci5jbGllbnRXaWR0aCxcblx0XHRoZWlnaHQgPSB0aGlzLmRpbWVuc2lvbnM/LmhlaWdodCA/PyB0aGlzLmNvbnRhaW5lci5jbGllbnRIZWlnaHRcblx0KSB7XG5cdFx0d2lkdGggLT0gMTAgKyAyMDsgLy8gc2Nyb2xsYmFyIHdpZHRoICsgbWFyZ2luXG5cdFx0dGhpcy54dGVybUxheW91dERlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2FsZWQgPSBnZXRYdGVybVNjYWxlZERpbWVuc2lvbnMoZG9tLmdldFdpbmRvdyh0aGlzLmNvbnRhaW5lciksIHh0ZXJtLmdldEZvbnQoKSwgd2lkdGgsIGhlaWdodCk7XG5cdFx0XHRpZiAoc2NhbGVkKSB7XG5cdFx0XHRcdHh0ZXJtLnJlc2l6ZShzY2FsZWQuY29scywgc2NhbGVkLnJvd3MpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNvbnN0IGlzTXVsdGlsaW5lID0gKHN0cjogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiAhIXN0ciAmJiBzdHIuaW5jbHVkZXMoJ1xcbicpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxlQUFlO0FBRXhCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVksaUJBQTBDLG1CQUFtQixvQkFBb0Isb0JBQW9CO0FBSTFILFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDO0FBR3pDLFNBQW1DLHlCQUF5QjtBQUM1RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtCQUFrQiwyQkFBMkI7QUFDdEQsU0FBUyx3QkFBd0IsNkJBQTZCO0FBQzlELFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQW9DLHdCQUF3QjtBQUM1RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBMkQsZ0JBQWdCLGtDQUFrQztBQUM3RyxTQUFTLGNBQWMsaUJBQWlCLGlCQUFpQjtBQUN6RCxTQUFTLG1DQUFtQztBQUM1QyxTQUF5QixnQkFBZ0IsYUFBYSx5QkFBeUI7QUFHL0UsTUFBTSw4QkFBOEIsWUFBWTtBQUFBLEVBSS9DLFlBQ2tCLFdBQ0EsV0FDaEI7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQUdqQixTQUFLLFdB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
