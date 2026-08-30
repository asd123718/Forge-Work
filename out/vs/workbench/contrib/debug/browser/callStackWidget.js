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
import * as dom from "../../../../base/browser/dom.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { assertNever } from "../../../../base/common/assert.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived, observableValue, transaction } from "../../../../base/common/observable.js";
import { Constants } from "../../../../base/common/uint.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { EditorContributionInstantiation } from "../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ClickLinkGesture } from "../../../../editor/contrib/gotoSymbol/browser/link/clickLinkGesture.js";
import { localize, localize2 } from "../../../../nls.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { ResourceLabel } from "../../../browser/labels.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { makeStackFrameColumnDecoration, TOP_STACK_FRAME_DECORATION } from "./callStackEditorContribution.js";
import "./media/callStackWidget.css";
class CallStackFrame {
  constructor(name, source, line = 1, column = 1) {
    this.name = name;
    this.source = source;
    this.line = line;
    this.column = column;
  }
}
class SkippedCallFrames {
  constructor(label, load) {
    this.label = label;
    this.load = load;
  }
}
class CustomStackFrame {
  constructor() {
    this.showHeader = observableValue("CustomStackFrame.showHeader", true);
  }
}
class WrappedCallStackFrame extends CallStackFrame {
  constructor(original) {
    super(original.name, original.source, original.line, original.column);
    this.editorHeight = observableValue("WrappedCallStackFrame.height", this.source ? 100 : 0);
    this.collapsed = observableValue("WrappedCallStackFrame.collapsed", false);
    this.height = derived((reader) => {
      return this.collapsed.read(reader) ? CALL_STACK_WIDGET_HEADER_HEIGHT : CALL_STACK_WIDGET_HEADER_HEIGHT + this.editorHeight.read(reader);
    });
  }
}
class WrappedCustomStackFrame {
  constructor(original) {
    this.original = original;
    this.collapsed = observableValue("WrappedCallStackFrame.collapsed", false);
    this.height = derived((reader) => {
      const headerHeight = this.original.showHeader.read(reader) ? CALL_STACK_WIDGET_HEADER_HEIGHT : 0;
      return this.collapsed.read(reader) ? headerHeight : headerHeight + this.original.height.read(reader);
    });
  }
}
const isFrameLike = (item) => item instanceof WrappedCallStackFrame || item instanceof WrappedCustomStackFrame;
const WIDGET_CLASS_NAME = "multiCallStackWidget";
let CallStackWidget = class extends Disposable {
  constructor(container, containingEditor, instantiationService) {
    super();
    this.layoutEmitter = this._register(new Emitter());
    this.currentFramesDs = this._register(new DisposableStore());
    container.classList.add(WIDGET_CLASS_NAME);
    this._register(toDisposable(() => container.classList.remove(WIDGET_CLASS_NAME)));
    this.list = this._register(instantiationService.createInstance(
      WorkbenchList,
      "TestResultStackWidget",
      container,
      new StackDelegate(),
      [
        instantiationService.createInstance(FrameCodeRenderer, containingEditor, this.layoutEmitter.event),
        instantiationService.createInstance(MissingCodeRenderer),
        instantiationService.createInstance(CustomRenderer),
        instantiationService.createInstance(SkippedRenderer, (i) => this.loadFrame(i))
      ],
      {
        multipleSelectionSupport: false,
        mouseSupport: false,
        keyboardSupport: false,
        setRowLineHeight: false,
        alwaysConsumeMouseWheel: false,
        accessibilityProvider: instantiationService.createInstance(StackAccessibilityProvider)
      }
    ));
  }
  get onDidChangeContentHeight() {
    return this.list.onDidChangeContentHeight;
  }
  get onDidScroll() {
    return this.list.onDidScroll;
  }
  get contentHeight() {
    return this.list.contentHeight;
  }
  /** Replaces the call frames display in the view. */
  setFrames(frames) {
    this.currentFramesDs.clear();
    const cts = new CancellationTokenSource();
    this.currentFramesDs.add(toDisposable(() => cts.dispose(true)));
    this.cts = cts;
    this.list.splice(0, this.list.length, this.mapFrames(frames));
  }
  layout(height, width) {
    this.list.layout(height, width);
    this.layoutEmitter.fire();
  }
  collapseAll() {
    transaction((tx) => {
      for (let i = 0; i < this.list.length; i++) {
        const frame = this.list.element(i);
        if (isFrameLike(frame)) {
          frame.collapsed.set(true, tx);
        }
      }
    });
  }
  async loadFrame(replacing) {
    if (!this.cts) {
      return;
    }
    const frames = await replacing.load(this.cts.token);
    if (this.cts.token.isCancellationRequested) {
      return;
    }
    const index = this.list.indexOf(replacing);
    this.list.splice(index, 1, this.mapFrames(frames));
  }
  mapFrames(frames) {
    const result = [];
    for (const frame of frames) {
      if (frame instanceof SkippedCallFrames) {
        result.push(frame);
        continue;
      }
      const wrapped = frame instanceof CustomStackFrame ? new WrappedCustomStackFrame(frame) : new WrappedCallStackFrame(frame);
      result.push(wrapped);
      this.currentFramesDs.add(autorun((reader) => {
        const height = wrapped.height.read(reader);
        const idx = this.list.indexOf(wrapped);
        if (idx !== -1) {
          this.list.updateElementHeight(idx, height);
        }
      }));
    }
    return result;
  }
};
CallStackWidget = __decorateClass([
  __decorateParam(2, IInstantiationService)
], CallStackWidget);
let StackAccessibilityProvider = class {
  constructor(labelService) {
    this.labelService = labelService;
  }
  getAriaLabel(e) {
    if (e instanceof SkippedCallFrames) {
      return e.label;
    }
    if (e instanceof WrappedCustomStackFrame) {
      return e.original.label;
    }
    if (e instanceof CallStackFrame) {
      if (e.source && e.line) {
        return localize({
          comment: ["{0} is an extension-defined label, then line number and filename"],
          key: "stackTraceLabel"
        }, "{0}, line {1} in {2}", e.name, e.line, this.labelService.getUriLabel(e.source, { relative: true }));
      }
      return e.name;
    }
    assertNever(e);
  }
  getWidgetAriaLabel() {
    return localize("stackTrace", "Stack Trace");
  }
};
StackAccessibilityProvider = __decorateClass([
  __decorateParam(0, ILabelService)
], StackAccessibilityProvider);
class StackDelegate {
  getHeight(element) {
    if (element instanceof CallStackFrame || element instanceof WrappedCustomStackFrame) {
      return element.height.get();
    }
    if (element instanceof SkippedCallFrames) {
      return CALL_STACK_WIDGET_HEADER_HEIGHT;
    }
    assertNever(element);
  }
  getTemplateId(element) {
    if (element instanceof CallStackFrame) {
      return element.source ? FrameCodeRenderer.templateId : MissingCodeRenderer.templateId;
    }
    if (element instanceof SkippedCallFrames) {
      return SkippedRenderer.templateId;
    }
    if (element instanceof WrappedCustomStackFrame) {
      return CustomRenderer.templateId;
    }
    assertNever(element);
  }
}
const editorOptions = {
  scrollBeyondLastLine: false,
  scrollbar: {
    vertical: "hidden",
    horizontal: "hidden",
    handleMouseWheel: false,
    useShadows: false
  },
  overviewRulerLanes: 0,
  fixedOverflowWidgets: true,
  overviewRulerBorder: false,
  stickyScroll: { enabled: false },
  minimap: { enabled: false },
  readOnly: true,
  automaticLayout: false
};
const makeFrameElements = () => dom.h("div.multiCallStackFrame", [
  dom.h("div.header@header", [
    dom.h("div.collapse-button@collapseButton"),
    dom.h("div.title.show-file-icons@title"),
    dom.h("div.actions@actions")
  ]),
  dom.h("div.editorParent", [
    dom.h("div.editorContainer@editor")
  ])
]);
const CALL_STACK_WIDGET_HEADER_HEIGHT = 24;
let AbstractFrameRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  renderTemplate(container) {
    const elements = makeFrameElements();
    container.appendChild(elements.root);
    const templateStore = new DisposableStore();
    container.classList.add("multiCallStackFrameContainer");
    templateStore.add(toDisposable(() => {
      container.classList.remove("multiCallStackFrameContainer");
      elements.root.remove();
    }));
    const label = templateStore.add(this.instantiationService.createInstance(ResourceLabel, elements.title, {}));
    const collapse = templateStore.add(new Button(elements.collapseButton, {}));
    const contentId = generateUuid();
    elements.editor.id = contentId;
    elements.editor.role = "region";
    elements.collapseButton.setAttribute("aria-controls", contentId);
    return this.finishRenderTemplate({
      container,
      decorations: [],
      elements,
      label,
      collapse,
      elementStore: templateStore.add(new DisposableStore()),
      templateStore
    });
  }
  renderElement(element, index, template) {
    const { elementStore } = template;
    elementStore.clear();
    const item = element;
    this.setupCollapseButton(item, template);
  }
  setupCollapseButton(item, { elementStore, elements, collapse }) {
    elementStore.add(autorun((reader) => {
      collapse.element.className = "";
      const collapsed = item.collapsed.read(reader);
      collapse.icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
      collapse.element.ariaExpanded = String(!collapsed);
      elements.root.classList.toggle("collapsed", collapsed);
    }));
    const toggleCollapse = () => item.collapsed.set(!item.collapsed.get(), void 0);
    elementStore.add(collapse.onDidClick(toggleCollapse));
    elementStore.add(dom.addDisposableListener(elements.title, "click", toggleCollapse));
  }
  disposeElement(element, index, templateData) {
    templateData.elementStore.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateStore.dispose();
  }
};
AbstractFrameRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], AbstractFrameRenderer);
const CONTEXT_LINES = 2;
let FrameCodeRenderer = class extends AbstractFrameRenderer {
  constructor(containingEditor, onLayout, modelService, instantiationService) {
    super(instantiationService);
    this.containingEditor = containingEditor;
    this.onLayout = onLayout;
    this.modelService = modelService;
    this.templateId = FrameCodeRenderer.templateId;
  }
  finishRenderTemplate(data) {
    const contributions = [{
      id: ClickToLocationContribution.ID,
      instantiation: EditorContributionInstantiation.BeforeFirstInteraction,
      ctor: ClickToLocationContribution
    }];
    const editor = this.containingEditor ? this.instantiationService.createInstance(
      EmbeddedCodeEditorWidget,
      data.elements.editor,
      editorOptions,
      { isSimpleWidget: true, contributions },
      this.containingEditor
    ) : this.instantiationService.createInstance(
      CodeEditorWidget,
      data.elements.editor,
      editorOptions,
      { isSimpleWidget: true, contributions }
    );
    data.templateStore.add(editor);
    const toolbar = data.templateStore.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, data.elements.actions, MenuId.DebugCallStackToolbar, {
      menuOptions: { shouldForwardArgs: true },
      actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options)
    }));
    return { ...data, editor, toolbar };
  }
  renderElement(element, index, template) {
    super.renderElement(element, index, template);
    const { elementStore, editor } = template;
    const item = element;
    const uri = item.source;
    template.label.element.setFile(uri);
    const cts = new CancellationTokenSource();
    elementStore.add(toDisposable(() => cts.dispose(true)));
    this.modelService.createModelReference(uri).then((reference) => {
      if (cts.token.isCancellationRequested) {
        return reference.dispose();
      }
      elementStore.add(reference);
      editor.setModel(reference.object.textEditorModel);
      this.setupEditorAfterModel(item, template);
      this.setupEditorLayout(item, template);
    });
  }
  setupEditorLayout(item, { elementStore, container, editor }) {
    const layout = () => {
      const prev = editor.getContentHeight();
      editor.layout({ width: container.clientWidth, height: prev });
      const next = editor.getContentHeight();
      if (next !== prev) {
        editor.layout({ width: container.clientWidth, height: next });
      }
      item.editorHeight.set(next, void 0);
    };
    elementStore.add(editor.onDidChangeModelDecorations(layout));
    elementStore.add(editor.onDidChangeModelContent(layout));
    elementStore.add(editor.onDidChangeModelOptions(layout));
    elementStore.add(this.onLayout(layout));
    layout();
  }
  setupEditorAfterModel(item, template) {
    const range = Range.fromPositions({
      column: item.column ?? 1,
      lineNumber: item.line ?? 1
    });
    template.toolbar.context = { uri: item.source, range };
    template.editor.setHiddenAreas([
      Range.fromPositions(
        { column: 1, lineNumber: 1 },
        { column: 1, lineNumber: Math.max(1, item.line - CONTEXT_LINES - 1) }
      ),
      Range.fromPositions(
        { column: 1, lineNumber: item.line + CONTEXT_LINES + 1 },
        { column: 1, lineNumber: Constants.MAX_SAFE_SMALL_INTEGER }
      )
    ]);
    template.editor.changeDecorations((accessor) => {
      for (const d of template.decorations) {
        accessor.removeDecoration(d);
      }
      template.decorations.length = 0;
      const beforeRange = range.setStartPosition(range.startLineNumber, 1);
      const hasCharactersBefore = !!template.editor.getModel()?.getValueInRange(beforeRange).trim();
      const decoRange = range.setEndPosition(range.startLineNumber, Constants.MAX_SAFE_SMALL_INTEGER);
      template.decorations.push(accessor.addDecoration(
        decoRange,
        makeStackFrameColumnDecoration(!hasCharactersBefore)
      ));
      template.decorations.push(accessor.addDecoration(
        decoRange,
        TOP_STACK_FRAME_DECORATION
      ));
    });
    item.editorHeight.set(template.editor.getContentHeight(), void 0);
  }
};
FrameCodeRenderer.templateId = "f";
FrameCodeRenderer = __decorateClass([
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IInstantiationService)
], FrameCodeRenderer);
let MissingCodeRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
    this.templateId = MissingCodeRenderer.templateId;
  }
  renderTemplate(container) {
    const elements = makeFrameElements();
    elements.root.classList.add("missing");
    container.appendChild(elements.root);
    const label = this.instantiationService.createInstance(ResourceLabel, elements.title, {});
    return { elements, label };
  }
  renderElement(element, _index, templateData) {
    const cast = element;
    templateData.label.element.setResource({
      name: cast.name,
      description: localize("stackFrameLocation", "Line {0} column {1}", cast.line, cast.column),
      range: { startLineNumber: cast.line, startColumn: cast.column, endColumn: cast.column, endLineNumber: cast.line }
    }, {
      icon: Codicon.fileBinary
    });
  }
  disposeTemplate(templateData) {
    templateData.label.dispose();
    templateData.elements.root.remove();
  }
};
MissingCodeRenderer.templateId = "m";
MissingCodeRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], MissingCodeRenderer);
const _CustomRenderer = class _CustomRenderer extends AbstractFrameRenderer {
  constructor() {
    super(...arguments);
    this.templateId = _CustomRenderer.templateId;
  }
  finishRenderTemplate(data) {
    return data;
  }
  renderElement(element, index, template) {
    super.renderElement(element, index, template);
    const item = element;
    const { elementStore, container, label } = template;
    label.element.setResource({ name: item.original.label }, { icon: item.original.icon });
    elementStore.add(autorun((reader) => {
      template.elements.header.style.display = item.original.showHeader.read(reader) ? "" : "none";
    }));
    elementStore.add(autorunWithStore((reader, store) => {
      if (!item.collapsed.read(reader)) {
        store.add(item.original.render(container));
      }
    }));
    const actions = item.original.renderActions?.(template.elements.actions);
    if (actions) {
      elementStore.add(actions);
    }
  }
};
_CustomRenderer.templateId = "c";
let CustomRenderer = _CustomRenderer;
let SkippedRenderer = class {
  constructor(loadFrames, notificationService) {
    this.loadFrames = loadFrames;
    this.notificationService = notificationService;
    this.templateId = SkippedRenderer.templateId;
  }
  renderTemplate(container) {
    const store = new DisposableStore();
    const button = new Button(container, { title: "", ...defaultButtonStyles });
    const data = { button, store };
    store.add(button);
    store.add(button.onDidClick(() => {
      if (!data.current || !button.enabled) {
        return;
      }
      button.enabled = false;
      this.loadFrames(data.current).catch((e) => {
        this.notificationService.error(localize("failedToLoadFrames", "Failed to load stack frames: {0}", e.message));
      });
    }));
    return data;
  }
  renderElement(element, index, templateData) {
    const cast = element;
    templateData.button.enabled = true;
    templateData.button.label = cast.label;
    templateData.current = cast;
  }
  disposeTemplate(templateData) {
    templateData.store.dispose();
  }
};
SkippedRenderer.templateId = "s";
SkippedRenderer = __decorateClass([
  __decorateParam(1, INotificationService)
], SkippedRenderer);
let ClickToLocationContribution = class extends Disposable {
  constructor(editor, editorService) {
    super();
    this.editor = editor;
    this.linkDecorations = editor.createDecorationsCollection();
    this._register(toDisposable(() => this.linkDecorations.clear()));
    const clickLinkGesture = this._register(new ClickLinkGesture(editor));
    this._register(clickLinkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
      this.onMove(mouseEvent);
    }));
    this._register(clickLinkGesture.onExecute((e) => {
      const model = this.editor.getModel();
      if (!this.current || !model) {
        return;
      }
      editorService.openEditor({
        resource: model.uri,
        options: {
          selection: Range.fromPositions(new Position(this.current.line, this.current.word.startColumn)),
          selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
        }
      }, e.hasSideBySideModifier ? SIDE_GROUP : void 0);
    }));
  }
  onMove(mouseEvent) {
    if (!mouseEvent.hasTriggerModifier) {
      return this.clear();
    }
    const position = mouseEvent.target.position;
    const word = position && this.editor.getModel()?.getWordAtPosition(position);
    if (!word) {
      return this.clear();
    }
    const prev = this.current?.word;
    if (prev && prev.startColumn === word.startColumn && prev.endColumn === word.endColumn && prev.word === word.word) {
      return;
    }
    this.current = { word, line: position.lineNumber };
    this.linkDecorations.set([{
      range: new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      options: {
        description: "call-stack-go-to-file-link",
        inlineClassName: "call-stack-go-to-file-link"
      }
    }]);
  }
  clear() {
    this.linkDecorations.clear();
    this.current = void 0;
  }
};
ClickToLocationContribution.ID = "clickToLocation";
ClickToLocationContribution = __decorateClass([
  __decorateParam(1, IEditorService)
], ClickToLocationContribution);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "callStackWidget.goToFile",
      title: localize2("goToFile", "Open File"),
      icon: Codicon.goToFile,
      menu: {
        id: MenuId.DebugCallStackToolbar,
        order: 22,
        group: "navigation"
      }
    });
  }
  async run(accessor, { uri, range }) {
    const editorService = accessor.get(IEditorService);
    await editorService.openEditor({
      resource: uri,
      options: {
        selection: range,
        selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
      }
    });
  }
});
export {
  CALL_STACK_WIDGET_HEADER_HEIGHT,
  CallStackFrame,
  CallStackWidget,
  CustomStackFrame,
  SkippedCallFrames
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxjYWxsU3RhY2tXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBJTGlzdFJlbmRlcmVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgYXV0b3J1bldpdGhTdG9yZSwgZGVyaXZlZCwgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250cmlidXRpb25DdG9yLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2VtYmVkZGVkQ29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmRBdFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiwgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDbGlja0xpbmtHZXN0dXJlLCBDbGlja0xpbmtNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZ290b1N5bWJvbC9icm93c2VyL2xpbmsvY2xpY2tMaW5rR2VzdHVyZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBtYWtlU3RhY2tGcmFtZUNvbHVtbkRlY29yYXRpb24sIFRPUF9TVEFDS19GUkFNRV9ERUNPUkFUSU9OIH0gZnJvbSAnLi9jYWxsU3RhY2tFZGl0b3JDb250cmlidXRpb24uanMnO1xuaW1wb3J0ICcuL21lZGlhL2NhbGxTdGFja1dpZGdldC5jc3MnO1xuXG5cbmV4cG9ydCBjbGFzcyBDYWxsU3RhY2tGcmFtZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNvdXJjZT86IFVSSSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGluZSA9IDEsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNvbHVtbiA9IDEsXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBTa2lwcGVkQ2FsbEZyYW1lcyB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBsb2FkOiAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPEFueVN0YWNrRnJhbWVbXT4sXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBDdXN0b21TdGFja0ZyYW1lIHtcblx0cHVibGljIHJlYWRvbmx5IHNob3dIZWFkZXIgPSBvYnNlcnZhYmxlVmFsdWUoJ0N1c3RvbVN0YWNrRnJhbWUuc2hvd0hlYWRlcicsIHRydWUpO1xuXHRwdWJsaWMgYWJzdHJhY3QgcmVhZG9ubHkgaGVpZ2h0OiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHRwdWJsaWMgYWJzdHJhY3QgcmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cHVibGljIGljb24/OiBUaGVtZUljb247XG5cdHB1YmxpYyBhYnN0cmFjdCByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlO1xuXHRwdWJsaWMgcmVuZGVyQWN0aW9ucz8oY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlO1xufVxuXG5leHBvcnQgdHlwZSBBbnlTdGFja0ZyYW1lID0gU2tpcHBlZENhbGxGcmFtZXMgfCBDYWxsU3RhY2tGcmFtZSB8IEN1c3RvbVN0YWNrRnJhbWU7XG5cbmludGVyZmFjZSBJRnJhbWVMaWtlSXRlbSB7XG5cdHJlYWRvbmx5IGNvbGxhcHNlZDogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgaGVpZ2h0OiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xufVxuXG5jbGFzcyBXcmFwcGVkQ2FsbFN0YWNrRnJhbWUgZXh0ZW5kcyBDYWxsU3RhY2tGcmFtZSBpbXBsZW1lbnRzIElGcmFtZUxpa2VJdGVtIHtcblx0cHVibGljIHJlYWRvbmx5IGVkaXRvckhlaWdodCA9IG9ic2VydmFibGVWYWx1ZSgnV3JhcHBlZENhbGxTdGFja0ZyYW1lLmhlaWdodCcsIHRoaXMuc291cmNlID8gMTAwIDogMCk7XG5cdHB1YmxpYyByZWFkb25seSBjb2xsYXBzZWQgPSBvYnNlcnZhYmxlVmFsdWUoJ1dyYXBwZWRDYWxsU3RhY2tGcmFtZS5jb2xsYXBzZWQnLCBmYWxzZSk7XG5cblx0cHVibGljIHJlYWRvbmx5IGhlaWdodCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRyZXR1cm4gdGhpcy5jb2xsYXBzZWQucmVhZChyZWFkZXIpID8gQ0FMTF9TVEFDS19XSURHRVRfSEVBREVSX0hFSUdIVCA6IENBTExfU1RBQ0tfV0lER0VUX0hFQURFUl9IRUlHSFQgKyB0aGlzLmVkaXRvckhlaWdodC5yZWFkKHJlYWRlcik7XG5cdH0pO1xuXG5cdGNvbnN0cnVjdG9yKG9yaWdpbmFsOiBDYWxsU3RhY2tGcmFtZSkge1xuXHRcdHN1cGVyKG9yaWdpbmFsLm5hbWUsIG9yaWdpbmFsLnNvdXJjZSwgb3JpZ2luYWwubGluZSwgb3JpZ2luYWwuY29sdW1uKTtcblx0fVxufVxuXG5jbGFzcyBXcmFwcGVkQ3VzdG9tU3RhY2tGcmFtZSBpbXBsZW1lbnRzIElGcmFtZUxpa2VJdGVtIHtcblx0cHVibGljIHJlYWRvbmx5IGNvbGxhcHNlZCA9IG9ic2VydmFibGVWYWx1ZSgnV3JhcHBlZENhbGxTdGFja0ZyYW1lLmNvbGxhcHNlZCcsIGZhbHNlKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaGVpZ2h0ID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IHRoaXMub3JpZ2luYWwuc2hvd0hlYWRlci5yZWFkKHJlYWRlcikgPyBDQUxMX1NUQUNLX1dJREdFVF9IRUFERVJfSEVJR0hUIDogMDtcblx0XHRyZXR1cm4gdGhpcy5jb2xsYXBzZWQucmVhZChyZWFkZXIpID8gaGVhZGVySGVpZ2h0IDogaGVhZGVySGVpZ2h0ICsgdGhpcy5vcmlnaW5hbC5oZWlnaHQucmVhZChyZWFkZXIpO1xuXHR9KTtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgb3JpZ2luYWw6IEN1c3RvbVN0YWNrRnJhbWUpIHsgfVxufVxuXG5jb25zdCBpc0ZyYW1lTGlrZSA9IChpdGVtOiB1bmtub3duKTogaXRlbSBpcyBJRnJhbWVMaWtlSXRlbSA9PlxuXHRpdGVtIGluc3RhbmNlb2YgV3JhcHBlZENhbGxTdGFja0ZyYW1lIHx8IGl0ZW0gaW5zdGFuY2VvZiBXcmFwcGVkQ3VzdG9tU3RhY2tGcmFtZTtcblxudHlwZSBMaXN0SXRlbSA9IFdyYXBwZWRDYWxsU3RhY2tGcmFtZSB8IFNraXBwZWRDYWxsRnJhbWVzIHwgV3JhcHBlZEN1c3RvbVN0YWNrRnJhbWU7XG5cbmNvbnN0IFdJREdFVF9DTEFTU19OQU1FID0gJ211bHRpQ2FsbFN0YWNrV2lkZ2V0JztcblxuLyoqXG4gKiBBIHJldXNhYmxlIHdpZGdldCB0aGF0IGRpc3BsYXlzIGEgY2FsbCBzdGFjayBhcyBhIHNlcmllcyBvZiBlZGl0b3JzLiBOb3RlXG4gKiB0aGF0IHRoaXMgYm90aCB1c2VkIGluIGRlYnVnJ3MgZXhjZXB0aW9uIHdpZGdldCBhcyB3ZWxsIGFzIGluIHRoZSB0ZXN0aW5nXG4gKiBjYWxsIHN0YWNrIHZpZXcuXG4gKi9cbmV4cG9ydCBjbGFzcyBDYWxsU3RhY2tXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBsaXN0OiBXb3JrYmVuY2hMaXN0PExpc3RJdGVtPjtcblx0cHJpdmF0ZSByZWFkb25seSBsYXlvdXRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudEZyYW1lc0RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBjdHM/OiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgpIHtcblx0XHRyZXR1cm4gdGhpcy5saXN0Lm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRTY3JvbGwoKSB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdC5vbkRpZFNjcm9sbDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29udGVudEhlaWdodCgpIHtcblx0XHRyZXR1cm4gdGhpcy5saXN0LmNvbnRlbnRIZWlnaHQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRhaW5pbmdFZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFdJREdFVF9DTEFTU19OQU1FKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoV0lER0VUX0NMQVNTX05BTUUpKSk7XG5cblx0XHR0aGlzLmxpc3QgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaExpc3QsXG5cdFx0XHQnVGVzdFJlc3VsdFN0YWNrV2lkZ2V0Jyxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdG5ldyBTdGFja0RlbGVnYXRlKCksXG5cdFx0XHRbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZyYW1lQ29kZVJlbmRlcmVyLCBjb250YWluaW5nRWRpdG9yLCB0aGlzLmxheW91dEVtaXR0ZXIuZXZlbnQpLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNaXNzaW5nQ29kZVJlbmRlcmVyKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ3VzdG9tUmVuZGVyZXIpLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTa2lwcGVkUmVuZGVyZXIsIChpKSA9PiB0aGlzLmxvYWRGcmFtZShpKSksXG5cdFx0XHRdLFxuXHRcdFx0e1xuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRtb3VzZVN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRrZXlib2FyZFN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRzZXRSb3dMaW5lSGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0YWNrQWNjZXNzaWJpbGl0eVByb3ZpZGVyKSxcblx0XHRcdH1cblx0XHQpIGFzIFdvcmtiZW5jaExpc3Q8TGlzdEl0ZW0+KTtcblx0fVxuXG5cdC8qKiBSZXBsYWNlcyB0aGUgY2FsbCBmcmFtZXMgZGlzcGxheSBpbiB0aGUgdmlldy4gKi9cblx0cHVibGljIHNldEZyYW1lcyhmcmFtZXM6IEFueVN0YWNrRnJhbWVbXSk6IHZvaWQge1xuXHRcdC8vIGNhbmNlbCBhbnkgZXhpc3RpbmcgbG9hZFxuXHRcdHRoaXMuY3VycmVudEZyYW1lc0RzLmNsZWFyKCk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5jdXJyZW50RnJhbWVzRHMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdHRoaXMuY3RzID0gY3RzO1xuXG5cdFx0dGhpcy5saXN0LnNwbGljZSgwLCB0aGlzLmxpc3QubGVuZ3RoLCB0aGlzLm1hcEZyYW1lcyhmcmFtZXMpKTtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXQoaGVpZ2h0PzogbnVtYmVyLCB3aWR0aD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubGlzdC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5sYXlvdXRFbWl0dGVyLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBjb2xsYXBzZUFsbCgpIHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubGlzdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBmcmFtZSA9IHRoaXMubGlzdC5lbGVtZW50KGkpO1xuXHRcdFx0XHRpZiAoaXNGcmFtZUxpa2UoZnJhbWUpKSB7XG5cdFx0XHRcdFx0ZnJhbWUuY29sbGFwc2VkLnNldCh0cnVlLCB0eCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZEZyYW1lKHJlcGxhY2luZzogU2tpcHBlZENhbGxGcmFtZXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuY3RzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnJhbWVzID0gYXdhaXQgcmVwbGFjaW5nLmxvYWQodGhpcy5jdHMudG9rZW4pO1xuXHRcdGlmICh0aGlzLmN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5saXN0LmluZGV4T2YocmVwbGFjaW5nKTtcblx0XHR0aGlzLmxpc3Quc3BsaWNlKGluZGV4LCAxLCB0aGlzLm1hcEZyYW1lcyhmcmFtZXMpKTtcblx0fVxuXG5cdHByaXZhdGUgbWFwRnJhbWVzKGZyYW1lczogQW55U3RhY2tGcmFtZVtdKTogTGlzdEl0ZW1bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBMaXN0SXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBmcmFtZSBvZiBmcmFtZXMpIHtcblx0XHRcdGlmIChmcmFtZSBpbnN0YW5jZW9mIFNraXBwZWRDYWxsRnJhbWVzKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGZyYW1lKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdyYXBwZWQgPSBmcmFtZSBpbnN0YW5jZW9mIEN1c3RvbVN0YWNrRnJhbWVcblx0XHRcdFx0PyBuZXcgV3JhcHBlZEN1c3RvbVN0YWNrRnJhbWUoZnJhbWUpIDogbmV3IFdyYXBwZWRDYWxsU3RhY2tGcmFtZShmcmFtZSk7XG5cdFx0XHRyZXN1bHQucHVzaCh3cmFwcGVkKTtcblxuXHRcdFx0dGhpcy5jdXJyZW50RnJhbWVzRHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgaGVpZ2h0ID0gd3JhcHBlZC5oZWlnaHQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBpZHggPSB0aGlzLmxpc3QuaW5kZXhPZih3cmFwcGVkKTtcblx0XHRcdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdFx0XHR0aGlzLmxpc3QudXBkYXRlRWxlbWVudEhlaWdodChpZHgsIGhlaWdodCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmNsYXNzIFN0YWNrQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8TGlzdEl0ZW0+IHtcblx0Y29uc3RydWN0b3IoQElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UpIHsgfVxuXG5cdGdldEFyaWFMYWJlbChlOiBMaXN0SXRlbSk6IHN0cmluZyB8IElPYnNlcnZhYmxlPHN0cmluZz4gfCBudWxsIHtcblx0XHRpZiAoZSBpbnN0YW5jZW9mIFNraXBwZWRDYWxsRnJhbWVzKSB7XG5cdFx0XHRyZXR1cm4gZS5sYWJlbDtcblx0XHR9XG5cblx0XHRpZiAoZSBpbnN0YW5jZW9mIFdyYXBwZWRDdXN0b21TdGFja0ZyYW1lKSB7XG5cdFx0XHRyZXR1cm4gZS5vcmlnaW5hbC5sYWJlbDtcblx0XHR9XG5cblx0XHRpZiAoZSBpbnN0YW5jZW9mIENhbGxTdGFja0ZyYW1lKSB7XG5cdFx0XHRpZiAoZS5zb3VyY2UgJiYgZS5saW5lKSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSh7XG5cdFx0XHRcdFx0Y29tbWVudDogWyd7MH0gaXMgYW4gZXh0ZW5zaW9uLWRlZmluZWQgbGFiZWwsIHRoZW4gbGluZSBudW1iZXIgYW5kIGZpbGVuYW1lJ10sXG5cdFx0XHRcdFx0a2V5OiAnc3RhY2tUcmFjZUxhYmVsJyxcblx0XHRcdFx0fSwgJ3swfSwgbGluZSB7MX0gaW4gezJ9JywgZS5uYW1lLCBlLmxpbmUsIHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGUuc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGUubmFtZTtcblx0XHR9XG5cblx0XHRhc3NlcnROZXZlcihlKTtcblx0fVxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3N0YWNrVHJhY2UnLCAnU3RhY2sgVHJhY2UnKTtcblx0fVxufVxuXG5jbGFzcyBTdGFja0RlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8TGlzdEl0ZW0+IHtcblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IExpc3RJdGVtKTogbnVtYmVyIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIENhbGxTdGFja0ZyYW1lIHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBXcmFwcGVkQ3VzdG9tU3RhY2tGcmFtZSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaGVpZ2h0LmdldCgpO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNraXBwZWRDYWxsRnJhbWVzKSB7XG5cdFx0XHRyZXR1cm4gQ0FMTF9TVEFDS19XSURHRVRfSEVBREVSX0hFSUdIVDtcblx0XHR9XG5cblx0XHRhc3NlcnROZXZlcihlbGVtZW50KTtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogTGlzdEl0ZW0pOiBzdHJpbmcge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQ2FsbFN0YWNrRnJhbWUpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnNvdXJjZSA/IEZyYW1lQ29kZVJlbmRlcmVyLnRlbXBsYXRlSWQgOiBNaXNzaW5nQ29kZVJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgU2tpcHBlZENhbGxGcmFtZXMpIHtcblx0XHRcdHJldHVybiBTa2lwcGVkUmVuZGVyZXIudGVtcGxhdGVJZDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBXcmFwcGVkQ3VzdG9tU3RhY2tGcmFtZSkge1xuXHRcdFx0cmV0dXJuIEN1c3RvbVJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0TmV2ZXIoZWxlbWVudCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTdGFja1RlbXBsYXRlRGF0YSBleHRlbmRzIElBYnN0cmFjdEZyYW1lUmVuZGVyZXJUZW1wbGF0ZURhdGEge1xuXHRlZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQ7XG5cdHRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xufVxuXG5jb25zdCBlZGl0b3JPcHRpb25zOiBJRWRpdG9yT3B0aW9ucyA9IHtcblx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRzY3JvbGxiYXI6IHtcblx0XHR2ZXJ0aWNhbDogJ2hpZGRlbicsXG5cdFx0aG9yaXpvbnRhbDogJ2hpZGRlbicsXG5cdFx0aGFuZGxlTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdH0sXG5cdG92ZXJ2aWV3UnVsZXJMYW5lczogMCxcblx0Zml4ZWRPdmVyZmxvd1dpZGdldHM6IHRydWUsXG5cdG92ZXJ2aWV3UnVsZXJCb3JkZXI6IGZhbHNlLFxuXHRzdGlja3lTY3JvbGw6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0bWluaW1hcDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRyZWFkT25seTogdHJ1ZSxcblx0YXV0b21hdGljTGF5b3V0OiBmYWxzZSxcbn07XG5cbmNvbnN0IG1ha2VGcmFtZUVsZW1lbnRzID0gKCkgPT4gZG9tLmgoJ2Rpdi5tdWx0aUNhbGxTdGFja0ZyYW1lJywgW1xuXHRkb20uaCgnZGl2LmhlYWRlckBoZWFkZXInLCBbXG5cdFx0ZG9tLmgoJ2Rpdi5jb2xsYXBzZS1idXR0b25AY29sbGFwc2VCdXR0b24nKSxcblx0XHRkb20uaCgnZGl2LnRpdGxlLnNob3ctZmlsZS1pY29uc0B0aXRsZScpLFxuXHRcdGRvbS5oKCdkaXYuYWN0aW9uc0BhY3Rpb25zJyksXG5cdF0pLFxuXG5cdGRvbS5oKCdkaXYuZWRpdG9yUGFyZW50JywgW1xuXHRcdGRvbS5oKCdkaXYuZWRpdG9yQ29udGFpbmVyQGVkaXRvcicpLFxuXHRdKVxuXSk7XG5cbmV4cG9ydCBjb25zdCBDQUxMX1NUQUNLX1dJREdFVF9IRUFERVJfSEVJR0hUID0gMjQ7XG5cbmludGVyZmFjZSBJQWJzdHJhY3RGcmFtZVJlbmRlcmVyVGVtcGxhdGVEYXRhIHtcblx0Y29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0bGFiZWw6IFJlc291cmNlTGFiZWw7XG5cdGVsZW1lbnRzOiBSZXR1cm5UeXBlPHR5cGVvZiBtYWtlRnJhbWVFbGVtZW50cz47XG5cdGRlY29yYXRpb25zOiBzdHJpbmdbXTtcblx0Y29sbGFwc2U6IEJ1dHRvbjtcblx0ZWxlbWVudFN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHRlbXBsYXRlU3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RGcmFtZVJlbmRlcmVyPFQgZXh0ZW5kcyBJQWJzdHJhY3RGcmFtZVJlbmRlcmVyVGVtcGxhdGVEYXRhPiBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8TGlzdEl0ZW0sIFQ+IHtcblx0cHVibGljIGFic3RyYWN0IHRlbXBsYXRlSWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBUIHtcblx0XHRjb25zdCBlbGVtZW50cyA9IG1ha2VGcmFtZUVsZW1lbnRzKCk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGVsZW1lbnRzLnJvb3QpO1xuXG5cblx0XHRjb25zdCB0ZW1wbGF0ZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtdWx0aUNhbGxTdGFja0ZyYW1lQ29udGFpbmVyJyk7XG5cdFx0dGVtcGxhdGVTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdtdWx0aUNhbGxTdGFja0ZyYW1lQ29udGFpbmVyJyk7XG5cdFx0XHRlbGVtZW50cy5yb290LnJlbW92ZSgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVTdG9yZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVsLCBlbGVtZW50cy50aXRsZSwge30pKTtcblxuXHRcdGNvbnN0IGNvbGxhcHNlID0gdGVtcGxhdGVTdG9yZS5hZGQobmV3IEJ1dHRvbihlbGVtZW50cy5jb2xsYXBzZUJ1dHRvbiwge30pKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGVsZW1lbnRzLmVkaXRvci5pZCA9IGNvbnRlbnRJZDtcblx0XHRlbGVtZW50cy5lZGl0b3Iucm9sZSA9ICdyZWdpb24nO1xuXHRcdGVsZW1lbnRzLmNvbGxhcHNlQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1jb250cm9scycsIGNvbnRlbnRJZCk7XG5cblx0XHRyZXR1cm4gdGhpcy5maW5pc2hSZW5kZXJUZW1wbGF0ZSh7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRkZWNvcmF0aW9uczogW10sXG5cdFx0XHRlbGVtZW50cyxcblx0XHRcdGxhYmVsLFxuXHRcdFx0Y29sbGFwc2UsXG5cdFx0XHRlbGVtZW50U3RvcmU6IHRlbXBsYXRlU3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSksXG5cdFx0XHR0ZW1wbGF0ZVN0b3JlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGZpbmlzaFJlbmRlclRlbXBsYXRlKGRhdGE6IElBYnN0cmFjdEZyYW1lUmVuZGVyZXJUZW1wbGF0ZURhdGEpOiBUO1xuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogTGlzdEl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBUKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBlbGVtZW50U3RvcmUgfSA9IHRlbXBsYXRlO1xuXHRcdGVsZW1lbnRTdG9yZS5jbGVhcigpO1xuXHRcdGNvbnN0IGl0ZW0gPSBlbGVtZW50IGFzIElGcmFtZUxpa2VJdGVtO1xuXG5cdFx0dGhpcy5zZXR1cENvbGxhcHNlQnV0dG9uKGl0ZW0sIHRlbXBsYXRlKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0dXBDb2xsYXBzZUJ1dHRvbihpdGVtOiBJRnJhbWVMaWtlSXRlbSwgeyBlbGVtZW50U3RvcmUsIGVsZW1lbnRzLCBjb2xsYXBzZSB9OiBUKSB7XG5cdFx0ZWxlbWVudFN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb2xsYXBzZS5lbGVtZW50LmNsYXNzTmFtZSA9ICcnO1xuXHRcdFx0Y29uc3QgY29sbGFwc2VkID0gaXRlbS5jb2xsYXBzZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29sbGFwc2UuaWNvbiA9IGNvbGxhcHNlZCA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93bjtcblx0XHRcdGNvbGxhcHNlLmVsZW1lbnQuYXJpYUV4cGFuZGVkID0gU3RyaW5nKCFjb2xsYXBzZWQpO1xuXHRcdFx0ZWxlbWVudHMucm9vdC5jbGFzc0xpc3QudG9nZ2xlKCdjb2xsYXBzZWQnLCBjb2xsYXBzZWQpO1xuXHRcdH0pKTtcblx0XHRjb25zdCB0b2dnbGVDb2xsYXBzZSA9ICgpID0+IGl0ZW0uY29sbGFwc2VkLnNldCghaXRlbS5jb2xsYXBzZWQuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0ZWxlbWVudFN0b3JlLmFkZChjb2xsYXBzZS5vbkRpZENsaWNrKHRvZ2dsZUNvbGxhcHNlKSk7XG5cdFx0ZWxlbWVudFN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnRzLnRpdGxlLCAnY2xpY2snLCB0b2dnbGVDb2xsYXBzZSkpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogTGlzdEl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogVCk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50U3RvcmUuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IFQpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVTdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY29uc3QgQ09OVEVYVF9MSU5FUyA9IDI7XG5cbi8qKiBSZW5kZXJlciBmb3IgYSBub3JtYWwgc3RhY2sgZnJhbWUgd2hlcmUgY29kZSBpcyBhdmFpbGFibGUuICovXG5jbGFzcyBGcmFtZUNvZGVSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0RnJhbWVSZW5kZXJlcjxJU3RhY2tUZW1wbGF0ZURhdGE+IHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2YnO1xuXG5cdHB1YmxpYyByZWFkb25seSB0ZW1wbGF0ZUlkID0gRnJhbWVDb2RlUmVuZGVyZXIudGVtcGxhdGVJZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5pbmdFZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb25MYXlvdXQ6IEV2ZW50PHZvaWQ+LFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZmluaXNoUmVuZGVyVGVtcGxhdGUoZGF0YTogSUFic3RyYWN0RnJhbWVSZW5kZXJlclRlbXBsYXRlRGF0YSk6IElTdGFja1RlbXBsYXRlRGF0YSB7XG5cdFx0Ly8gb3ZlcnJpZGUgZGVmYXVsdCBlLmcuIGxhbmd1YWdlIGNvbnRyaWJ1dGlvbnMsIG9ubHkgYWxsb3cgdXNlcnMgdG8gY2xpY2tcblx0XHQvLyBvbiBjb2RlIGluIHRoZSBjYWxsIHN0YWNrIHRvIGdvIHRvIGl0cyBzb3VyY2UgbG9jYXRpb25cblx0XHRjb25zdCBjb250cmlidXRpb25zOiBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb25bXSA9IFt7XG5cdFx0XHRpZDogQ2xpY2tUb0xvY2F0aW9uQ29udHJpYnV0aW9uLklELFxuXHRcdFx0aW5zdGFudGlhdGlvbjogRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5CZWZvcmVGaXJzdEludGVyYWN0aW9uLFxuXHRcdFx0Y3RvcjogQ2xpY2tUb0xvY2F0aW9uQ29udHJpYnV0aW9uIGFzIEVkaXRvckNvbnRyaWJ1dGlvbkN0b3IsXG5cdFx0fV07XG5cblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmNvbnRhaW5pbmdFZGl0b3Jcblx0XHRcdD8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0RW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdFx0XHRkYXRhLmVsZW1lbnRzLmVkaXRvcixcblx0XHRcdFx0ZWRpdG9yT3B0aW9ucyxcblx0XHRcdFx0eyBpc1NpbXBsZVdpZGdldDogdHJ1ZSwgY29udHJpYnV0aW9ucyB9LFxuXHRcdFx0XHR0aGlzLmNvbnRhaW5pbmdFZGl0b3IsXG5cdFx0XHQpXG5cdFx0XHQ6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0XHRcdGRhdGEuZWxlbWVudHMuZWRpdG9yLFxuXHRcdFx0XHRlZGl0b3JPcHRpb25zLFxuXHRcdFx0XHR7IGlzU2ltcGxlV2lkZ2V0OiB0cnVlLCBjb250cmlidXRpb25zIH0sXG5cdFx0XHQpO1xuXG5cdFx0ZGF0YS50ZW1wbGF0ZVN0b3JlLmFkZChlZGl0b3IpO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IGRhdGEudGVtcGxhdGVTdG9yZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgZGF0YS5lbGVtZW50cy5hY3Rpb25zLCBNZW51SWQuRGVidWdDYWxsU3RhY2tUb29sYmFyLCB7XG5cdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKSxcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4geyAuLi5kYXRhLCBlZGl0b3IsIHRvb2xiYXIgfTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckVsZW1lbnQoZWxlbWVudDogTGlzdEl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBJU3RhY2tUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZSk7XG5cblx0XHRjb25zdCB7IGVsZW1lbnRTdG9yZSwgZWRpdG9yIH0gPSB0ZW1wbGF0ZTtcblxuXHRcdGNvbnN0IGl0ZW0gPSBlbGVtZW50IGFzIFdyYXBwZWRDYWxsU3RhY2tGcmFtZTtcblx0XHRjb25zdCB1cmkgPSBpdGVtLnNvdXJjZSE7XG5cblx0XHR0ZW1wbGF0ZS5sYWJlbC5lbGVtZW50LnNldEZpbGUodXJpKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRlbGVtZW50U3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaSkudGhlbihyZWZlcmVuY2UgPT4ge1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gcmVmZXJlbmNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0ZWxlbWVudFN0b3JlLmFkZChyZWZlcmVuY2UpO1xuXHRcdFx0ZWRpdG9yLnNldE1vZGVsKHJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsKTtcblx0XHRcdHRoaXMuc2V0dXBFZGl0b3JBZnRlck1vZGVsKGl0ZW0sIHRlbXBsYXRlKTtcblx0XHRcdHRoaXMuc2V0dXBFZGl0b3JMYXlvdXQoaXRlbSwgdGVtcGxhdGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cEVkaXRvckxheW91dChpdGVtOiBXcmFwcGVkQ2FsbFN0YWNrRnJhbWUsIHsgZWxlbWVudFN0b3JlLCBjb250YWluZXIsIGVkaXRvciB9OiBJU3RhY2tUZW1wbGF0ZURhdGEpIHtcblx0XHRjb25zdCBsYXlvdXQgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcmV2ID0gZWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdGVkaXRvci5sYXlvdXQoeyB3aWR0aDogY29udGFpbmVyLmNsaWVudFdpZHRoLCBoZWlnaHQ6IHByZXYgfSk7XG5cblx0XHRcdGNvbnN0IG5leHQgPSBlZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpO1xuXHRcdFx0aWYgKG5leHQgIT09IHByZXYpIHtcblx0XHRcdFx0ZWRpdG9yLmxheW91dCh7IHdpZHRoOiBjb250YWluZXIuY2xpZW50V2lkdGgsIGhlaWdodDogbmV4dCB9KTtcblx0XHRcdH1cblxuXHRcdFx0aXRlbS5lZGl0b3JIZWlnaHQuc2V0KG5leHQsIHVuZGVmaW5lZCk7XG5cdFx0fTtcblx0XHRlbGVtZW50U3RvcmUuYWRkKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsRGVjb3JhdGlvbnMobGF5b3V0KSk7XG5cdFx0ZWxlbWVudFN0b3JlLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQobGF5b3V0KSk7XG5cdFx0ZWxlbWVudFN0b3JlLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbE9wdGlvbnMobGF5b3V0KSk7XG5cdFx0ZWxlbWVudFN0b3JlLmFkZCh0aGlzLm9uTGF5b3V0KGxheW91dCkpO1xuXHRcdGxheW91dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cEVkaXRvckFmdGVyTW9kZWwoaXRlbTogV3JhcHBlZENhbGxTdGFja0ZyYW1lLCB0ZW1wbGF0ZTogSVN0YWNrVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKHtcblx0XHRcdGNvbHVtbjogaXRlbS5jb2x1bW4gPz8gMSxcblx0XHRcdGxpbmVOdW1iZXI6IGl0ZW0ubGluZSA/PyAxLFxuXHRcdH0pO1xuXG5cdFx0dGVtcGxhdGUudG9vbGJhci5jb250ZXh0ID0geyB1cmk6IGl0ZW0uc291cmNlLCByYW5nZSB9O1xuXG5cdFx0dGVtcGxhdGUuZWRpdG9yLnNldEhpZGRlbkFyZWFzKFtcblx0XHRcdFJhbmdlLmZyb21Qb3NpdGlvbnMoXG5cdFx0XHRcdHsgY29sdW1uOiAxLCBsaW5lTnVtYmVyOiAxIH0sXG5cdFx0XHRcdHsgY29sdW1uOiAxLCBsaW5lTnVtYmVyOiBNYXRoLm1heCgxLCBpdGVtLmxpbmUgLSBDT05URVhUX0xJTkVTIC0gMSkgfSxcblx0XHRcdCksXG5cdFx0XHRSYW5nZS5mcm9tUG9zaXRpb25zKFxuXHRcdFx0XHR7IGNvbHVtbjogMSwgbGluZU51bWJlcjogaXRlbS5saW5lICsgQ09OVEVYVF9MSU5FUyArIDEgfSxcblx0XHRcdFx0eyBjb2x1bW46IDEsIGxpbmVOdW1iZXI6IENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSIH0sXG5cdFx0XHQpLFxuXHRcdF0pO1xuXG5cdFx0dGVtcGxhdGUuZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdGZvciAoY29uc3QgZCBvZiB0ZW1wbGF0ZS5kZWNvcmF0aW9ucykge1xuXHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKGQpO1xuXHRcdFx0fVxuXHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbnMubGVuZ3RoID0gMDtcblxuXHRcdFx0Y29uc3QgYmVmb3JlUmFuZ2UgPSByYW5nZS5zZXRTdGFydFBvc2l0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0XHRjb25zdCBoYXNDaGFyYWN0ZXJzQmVmb3JlID0gISF0ZW1wbGF0ZS5lZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0VmFsdWVJblJhbmdlKGJlZm9yZVJhbmdlKS50cmltKCk7XG5cdFx0XHRjb25zdCBkZWNvUmFuZ2UgPSByYW5nZS5zZXRFbmRQb3NpdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSKTtcblxuXHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbnMucHVzaChhY2Nlc3Nvci5hZGREZWNvcmF0aW9uKFxuXHRcdFx0XHRkZWNvUmFuZ2UsXG5cdFx0XHRcdG1ha2VTdGFja0ZyYW1lQ29sdW1uRGVjb3JhdGlvbighaGFzQ2hhcmFjdGVyc0JlZm9yZSksXG5cdFx0XHQpKTtcblx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25zLnB1c2goYWNjZXNzb3IuYWRkRGVjb3JhdGlvbihcblx0XHRcdFx0ZGVjb1JhbmdlLFxuXHRcdFx0XHRUT1BfU1RBQ0tfRlJBTUVfREVDT1JBVElPTixcblx0XHRcdCkpO1xuXHRcdH0pO1xuXG5cdFx0aXRlbS5lZGl0b3JIZWlnaHQuc2V0KHRlbXBsYXRlLmVkaXRvci5nZXRDb250ZW50SGVpZ2h0KCksIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNaXNzaW5nVGVtcGxhdGVEYXRhIHtcblx0ZWxlbWVudHM6IFJldHVyblR5cGU8dHlwZW9mIG1ha2VGcmFtZUVsZW1lbnRzPjtcblx0bGFiZWw6IFJlc291cmNlTGFiZWw7XG59XG5cbi8qKiBSZW5kZXJlciBmb3IgYSBjYWxsIGZyYW1lIHRoYXQncyBtaXNzaW5nIGEgVVJJICovXG5jbGFzcyBNaXNzaW5nQ29kZVJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxMaXN0SXRlbSwgSU1pc3NpbmdUZW1wbGF0ZURhdGE+IHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSB0ZW1wbGF0ZUlkID0gJ20nO1xuXHRwdWJsaWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9IE1pc3NpbmdDb2RlUmVuZGVyZXIudGVtcGxhdGVJZDtcblxuXHRjb25zdHJ1Y3RvcihASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElNaXNzaW5nVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBlbGVtZW50cyA9IG1ha2VGcmFtZUVsZW1lbnRzKCk7XG5cdFx0ZWxlbWVudHMucm9vdC5jbGFzc0xpc3QuYWRkKCdtaXNzaW5nJyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGVsZW1lbnRzLnJvb3QpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVsLCBlbGVtZW50cy50aXRsZSwge30pO1xuXHRcdHJldHVybiB7IGVsZW1lbnRzLCBsYWJlbCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBMaXN0SXRlbSwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1pc3NpbmdUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBjYXN0ID0gZWxlbWVudCBhcyBDYWxsU3RhY2tGcmFtZTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudC5zZXRSZXNvdXJjZSh7XG5cdFx0XHRuYW1lOiBjYXN0Lm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3N0YWNrRnJhbWVMb2NhdGlvbicsICdMaW5lIHswfSBjb2x1bW4gezF9JywgY2FzdC5saW5lLCBjYXN0LmNvbHVtbiksXG5cdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IGNhc3QubGluZSwgc3RhcnRDb2x1bW46IGNhc3QuY29sdW1uLCBlbmRDb2x1bW46IGNhc3QuY29sdW1uLCBlbmRMaW5lTnVtYmVyOiBjYXN0LmxpbmUgfSxcblx0XHR9LCB7XG5cdFx0XHRpY29uOiBDb2RpY29uLmZpbGVCaW5hcnksXG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJTWlzc2luZ1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnRzLnJvb3QucmVtb3ZlKCk7XG5cdH1cbn1cblxuLyoqIFJlbmRlcmVyIGZvciBhIGNhbGwgZnJhbWUgdGhhdCdzIG1pc3NpbmcgYSBVUkkgKi9cbmNsYXNzIEN1c3RvbVJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RGcmFtZVJlbmRlcmVyPElBYnN0cmFjdEZyYW1lUmVuZGVyZXJUZW1wbGF0ZURhdGE+IHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2MnO1xuXHRwdWJsaWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9IEN1c3RvbVJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGZpbmlzaFJlbmRlclRlbXBsYXRlKGRhdGE6IElBYnN0cmFjdEZyYW1lUmVuZGVyZXJUZW1wbGF0ZURhdGEpOiBJQWJzdHJhY3RGcmFtZVJlbmRlcmVyVGVtcGxhdGVEYXRhIHtcblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckVsZW1lbnQoZWxlbWVudDogTGlzdEl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBJQWJzdHJhY3RGcmFtZVJlbmRlcmVyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGUpO1xuXG5cdFx0Y29uc3QgaXRlbSA9IGVsZW1lbnQgYXMgV3JhcHBlZEN1c3RvbVN0YWNrRnJhbWU7XG5cdFx0Y29uc3QgeyBlbGVtZW50U3RvcmUsIGNvbnRhaW5lciwgbGFiZWwgfSA9IHRlbXBsYXRlO1xuXG5cdFx0bGFiZWwuZWxlbWVudC5zZXRSZXNvdXJjZSh7IG5hbWU6IGl0ZW0ub3JpZ2luYWwubGFiZWwgfSwgeyBpY29uOiBpdGVtLm9yaWdpbmFsLmljb24gfSk7XG5cblx0XHRlbGVtZW50U3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRlbXBsYXRlLmVsZW1lbnRzLmhlYWRlci5zdHlsZS5kaXNwbGF5ID0gaXRlbS5vcmlnaW5hbC5zaG93SGVhZGVyLnJlYWQocmVhZGVyKSA/ICcnIDogJ25vbmUnO1xuXHRcdH0pKTtcblxuXHRcdGVsZW1lbnRTdG9yZS5hZGQoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0aWYgKCFpdGVtLmNvbGxhcHNlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0c3RvcmUuYWRkKGl0ZW0ub3JpZ2luYWwucmVuZGVyKGNvbnRhaW5lcikpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBpdGVtLm9yaWdpbmFsLnJlbmRlckFjdGlvbnM/Lih0ZW1wbGF0ZS5lbGVtZW50cy5hY3Rpb25zKTtcblx0XHRpZiAoYWN0aW9ucykge1xuXHRcdFx0ZWxlbWVudFN0b3JlLmFkZChhY3Rpb25zKTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTa2lwcGVkVGVtcGxhdGVEYXRhIHtcblx0YnV0dG9uOiBCdXR0b247XG5cdGN1cnJlbnQ/OiBTa2lwcGVkQ2FsbEZyYW1lcztcblx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuLyoqIFJlbmRlcmVyIGZvciBhIGJ1dHRvbiB0byBsb2FkIG1vcmUgY2FsbCBmcmFtZXMgKi9cbmNsYXNzIFNraXBwZWRSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8TGlzdEl0ZW0sIElTa2lwcGVkVGVtcGxhdGVEYXRhPiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdzJztcblx0cHVibGljIHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBTa2lwcGVkUmVuZGVyZXIudGVtcGxhdGVJZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvYWRGcmFtZXM6IChmcm9tSXRlbTogU2tpcHBlZENhbGxGcmFtZXMpID0+IFByb21pc2U8dm9pZD4sXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTa2lwcGVkVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBidXR0b24gPSBuZXcgQnV0dG9uKGNvbnRhaW5lciwgeyB0aXRsZTogJycsIC4uLmRlZmF1bHRCdXR0b25TdHlsZXMgfSk7XG5cdFx0Y29uc3QgZGF0YTogSVNraXBwZWRUZW1wbGF0ZURhdGEgPSB7IGJ1dHRvbiwgc3RvcmUgfTtcblxuXHRcdHN0b3JlLmFkZChidXR0b24pO1xuXHRcdHN0b3JlLmFkZChidXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRpZiAoIWRhdGEuY3VycmVudCB8fCAhYnV0dG9uLmVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRidXR0b24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5sb2FkRnJhbWVzKGRhdGEuY3VycmVudCkuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnZmFpbGVkVG9Mb2FkRnJhbWVzJywgJ0ZhaWxlZCB0byBsb2FkIHN0YWNrIGZyYW1lczogezB9JywgZS5tZXNzYWdlKSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogTGlzdEl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVNraXBwZWRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBjYXN0ID0gZWxlbWVudCBhcyBTa2lwcGVkQ2FsbEZyYW1lcztcblx0XHR0ZW1wbGF0ZURhdGEuYnV0dG9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHRlbXBsYXRlRGF0YS5idXR0b24ubGFiZWwgPSBjYXN0LmxhYmVsO1xuXHRcdHRlbXBsYXRlRGF0YS5jdXJyZW50ID0gY2FzdDtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElTa2lwcGVkVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnN0b3JlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKiogQSBzaW1wbGUgY29udHJpYnV0aW9uIHRoYXQgbWFrZXMgYWxsIGRhdGEgaW4gdGhlIGVkaXRvciBjbGlja2FibGUgdG8gZ28gdG8gdGhlIGxvY2F0aW9uICovXG5jbGFzcyBDbGlja1RvTG9jYXRpb25Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnY2xpY2tUb0xvY2F0aW9uJztcblx0cHJpdmF0ZSByZWFkb25seSBsaW5rRGVjb3JhdGlvbnM6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cdHByaXZhdGUgY3VycmVudDogeyBsaW5lOiBudW1iZXI7IHdvcmQ6IElXb3JkQXRQb3NpdGlvbiB9IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5saW5rRGVjb3JhdGlvbnMgPSBlZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMubGlua0RlY29yYXRpb25zLmNsZWFyKCkpKTtcblxuXHRcdGNvbnN0IGNsaWNrTGlua0dlc3R1cmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2xpY2tMaW5rR2VzdHVyZShlZGl0b3IpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWNrTGlua0dlc3R1cmUub25Nb3VzZU1vdmVPclJlbGV2YW50S2V5RG93bigoW21vdXNlRXZlbnQsIGtleWJvYXJkRXZlbnRdKSA9PiB7XG5cdFx0XHR0aGlzLm9uTW92ZShtb3VzZUV2ZW50KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpY2tMaW5rR2VzdHVyZS5vbkV4ZWN1dGUoKGUpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICghdGhpcy5jdXJyZW50IHx8ICFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBtb2RlbC51cmksXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRzZWxlY3Rpb246IFJhbmdlLmZyb21Qb3NpdGlvbnMobmV3IFBvc2l0aW9uKHRoaXMuY3VycmVudC5saW5lLCB0aGlzLmN1cnJlbnQud29yZC5zdGFydENvbHVtbikpLFxuXHRcdFx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgZS5oYXNTaWRlQnlTaWRlTW9kaWZpZXIgPyBTSURFX0dST1VQIDogdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIG9uTW92ZShtb3VzZUV2ZW50OiBDbGlja0xpbmtNb3VzZUV2ZW50KSB7XG5cdFx0aWYgKCFtb3VzZUV2ZW50Lmhhc1RyaWdnZXJNb2RpZmllcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IG1vdXNlRXZlbnQudGFyZ2V0LnBvc2l0aW9uO1xuXHRcdGNvbnN0IHdvcmQgPSBwb3NpdGlvbiAmJiB0aGlzLmVkaXRvci5nZXRNb2RlbCgpPy5nZXRXb3JkQXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0aWYgKCF3b3JkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jbGVhcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXYgPSB0aGlzLmN1cnJlbnQ/LndvcmQ7XG5cdFx0aWYgKHByZXYgJiYgcHJldi5zdGFydENvbHVtbiA9PT0gd29yZC5zdGFydENvbHVtbiAmJiBwcmV2LmVuZENvbHVtbiA9PT0gd29yZC5lbmRDb2x1bW4gJiYgcHJldi53b3JkID09PSB3b3JkLndvcmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnQgPSB7IHdvcmQsIGxpbmU6IHBvc2l0aW9uLmxpbmVOdW1iZXIgfTtcblx0XHR0aGlzLmxpbmtEZWNvcmF0aW9ucy5zZXQoW3tcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgd29yZC5lbmRDb2x1bW4pLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ2NhbGwtc3RhY2stZ28tdG8tZmlsZS1saW5rJyxcblx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAnY2FsbC1zdGFjay1nby10by1maWxlLWxpbmsnLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCkge1xuXHRcdHRoaXMubGlua0RlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5jdXJyZW50ID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2NhbGxTdGFja1dpZGdldC5nb1RvRmlsZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdnb1RvRmlsZScsICdPcGVuIEZpbGUnKSxcblx0XHRcdGljb246IENvZGljb24uZ29Ub0ZpbGUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdDYWxsU3RhY2tUb29sYmFyLFxuXHRcdFx0XHRvcmRlcjogMjIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB7IHVyaSwgcmFuZ2UgfTogTG9jYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHVyaSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0c2VsZWN0aW9uOiByYW5nZSxcblx0XHRcdFx0c2VsZWN0aW9uUmV2ZWFsVHlwZTogVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUuQ2VudGVySWZPdXRzaWRlVmlld3BvcnQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUd2QixTQUFTLG1CQUFtQjtBQUM1QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyxTQUFTLGtCQUFrQixTQUEyQyxpQkFBaUIsbUJBQW1CO0FBRW5ILFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQWlDLHVDQUF1RTtBQUN4RyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFJdEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBNkM7QUFDdEQsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0Isa0JBQWtCO0FBQzNDLFNBQVMsZ0NBQWdDLGtDQUFrQztBQUMzRSxPQUFPO0FBR0EsTUFBTSxlQUFlO0FBQUEsRUFDM0IsWUFDaUIsTUFDQSxRQUNBLE9BQU8sR0FDUCxTQUFTLEdBQ3hCO0FBSmU7QUFDQTtBQUNBO0FBQ0E7QUFBQSxFQUNiO0FBQ0w7QUFFTyxNQUFNLGtCQUFrQjtBQUFBLEVBQzlCLFlBQ2lCLE9BQ0EsTUFDZjtBQUZlO0FBQ0E7QUFBQSxFQUNiO0FBQ0w7QUFFTyxNQUFlLGlCQUFpQjtBQUFBLEVBQWhDO0FBQ04sU0FBZ0IsYUFBYSxnQkFBZ0IsK0JBQStCLElBQUk7QUFBQTtBQU1qRjtBQVNBLE1BQU0sOEJBQThCLGVBQXlDO0FBQUEsRUFRNUUsWUFBWSxVQUEwQjtBQUNyQyxVQUFNLFNBQVMsTUFBTSxTQUFTLFFBQVEsU0FBUyxNQUFNLFNBQVMsTUFBTTtBQVJyRSxTQUFnQixlQUFlLGdCQUFnQixnQ0FBZ0MsS0FBSyxTQUFTLE1BQU0sQ0FBQztBQUNwRyxTQUFnQixZQUFZLGdCQUFnQixtQ0FBbUMsS0FBSztBQUVwRixTQUFnQixTQUFTLFFBQVEsWUFBVTtBQUMxQyxhQUFPLEtBQUssVUFBVSxLQUFLLE1BQU0sSUFBSSxrQ0FBa0Msa0NBQWtDLEtBQUssYUFBYSxLQUFLLE1BQU07QUFBQSxJQUN2SSxDQUFDO0FBQUEsRUFJRDtBQUNEO0FBRUEsTUFBTSx3QkFBa0Q7QUFBQSxFQVF2RCxZQUE0QixVQUE0QjtBQUE1QjtBQVA1QixTQUFnQixZQUFZLGdCQUFnQixtQ0FBbUMsS0FBSztBQUVwRixTQUFnQixTQUFTLFFBQVEsWUFBVTtBQUMxQyxZQUFNLGVBQWUsS0FBSyxTQUFTLFdBQVcsS0FBSyxNQUFNLElBQUksa0NBQWtDO0FBQy9GLGFBQU8sS0FBSyxVQUFVLEtBQUssTUFBTSxJQUFJLGVBQWUsZUFBZSxLQUFLLFNBQVMsT0FBTyxLQUFLLE1BQU07QUFBQSxJQUNwRyxDQUFDO0FBQUEsRUFFeUQ7QUFDM0Q7QUFFQSxNQUFNLGNBQWMsQ0FBQyxTQUNwQixnQkFBZ0IseUJBQXlCLGdCQUFnQjtBQUkxRCxNQUFNLG9CQUFvQjtBQU9uQixJQUFNLGtCQUFOLGNBQThCLFdBQVc7QUFBQSxFQWtCL0MsWUFDQyxXQUNBLGtCQUN1QixzQkFDdEI7QUFDRCxVQUFNO0FBckJQLFNBQWlCLGdCQUFnQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDbkUsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBc0J0RSxjQUFVLFVBQVUsSUFBSSxpQkFBaUI7QUFDekMsU0FBSyxVQUFVLGFBQWEsTUFBTSxVQUFVLFVBQVUsT0FBTyxpQkFBaUIsQ0FBQyxDQUFDO0FBRWhGLFNBQUssT0FBTyxLQUFLLFVBQVUscUJBQXFCO0FBQUEsTUFDL0M7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSxjQUFjO0FBQUEsTUFDbEI7QUFBQSxRQUNDLHFCQUFxQixlQUFlLG1CQUFtQixrQkFBa0IsS0FBSyxjQUFjLEtBQUs7QUFBQSxRQUNqRyxxQkFBcUIsZUFBZSxtQkFBbUI7QUFBQSxRQUN2RCxxQkFBcUIsZUFBZSxjQUFjO0FBQUEsUUFDbEQscUJBQXFCLGVBQWUsaUJBQWlCLENBQUMsTUFBTSxLQUFLLFVBQVUsQ0FBQyxDQUFDO0FBQUEsTUFDOUU7QUFBQSxNQUNBO0FBQUEsUUFDQywwQkFBMEI7QUFBQSxRQUMxQixjQUFjO0FBQUEsUUFDZCxpQkFBaUI7QUFBQSxRQUNqQixrQkFBa0I7QUFBQSxRQUNsQix5QkFBeUI7QUFBQSxRQUN6Qix1QkFBdUIscUJBQXFCLGVBQWUsMEJBQTBCO0FBQUEsTUFDdEY7QUFBQSxJQUNELENBQTRCO0FBQUEsRUFDN0I7QUFBQSxFQTFDQSxJQUFXLDJCQUEyQjtBQUNyQyxXQUFPLEtBQUssS0FBSztBQUFBLEVBQ2xCO0FBQUEsRUFFQSxJQUFXLGNBQWM7QUFDeEIsV0FBTyxLQUFLLEtBQUs7QUFBQSxFQUNsQjtBQUFBLEVBRUEsSUFBVyxnQkFBZ0I7QUFDMUIsV0FBTyxLQUFLLEtBQUs7QUFBQSxFQUNsQjtBQUFBO0FBQUEsRUFtQ08sVUFBVSxRQUErQjtBQUUvQyxTQUFLLGdCQUFnQixNQUFNO0FBQzNCLFVBQU0sTUFBTSxJQUFJLHdCQUF3QjtBQUN4QyxTQUFLLGdCQUFnQixJQUFJLGFBQWEsTUFBTSxJQUFJLFFBQVEsSUFBSSxDQUFDLENBQUM7QUFDOUQsU0FBSyxNQUFNO0FBRVgsU0FBSyxLQUFLLE9BQU8sR0FBRyxLQUFLLEtBQUssUUFBUSxLQUFLLFVBQVUsTUFBTSxDQUFDO0FBQUEsRUFDN0Q7QUFBQSxFQUVPLE9BQU8sUUFBaUIsT0FBc0I7QUFDcEQsU0FBSyxLQUFLLE9BQU8sUUFBUSxLQUFLO0FBQzlCLFNBQUssY0FBYyxLQUFLO0FBQUEsRUFDekI7QUFBQSxFQUVPLGNBQWM7QUFDcEIsZ0JBQVksUUFBTTtBQUNqQixlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssS0FBSyxRQUFRLEtBQUs7QUFDMUMsY0FBTSxRQUFRLEtBQUssS0FBSyxRQUFRLENBQUM7QUFDakMsWUFBSSxZQUFZLEtBQUssR0FBRztBQUN2QixnQkFBTSxVQUFVLElBQUksTUFBTSxFQUFFO0FBQUEsUUFDN0I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxVQUFVLFdBQTZDO0FBQ3BFLFFBQUksQ0FBQyxLQUFLLEtBQUs7QUFDZDtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsTUFBTSxVQUFVLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFDbEQsUUFBSSxLQUFLLElBQUksTUFBTSx5QkFBeUI7QUFDM0M7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssS0FBSyxRQUFRLFNBQVM7QUFDekMsU0FBSyxLQUFLLE9BQU8sT0FBTyxHQUFHLEtBQUssVUFBVSxNQUFNLENBQUM7QUFBQSxFQUNsRDtBQUFBLEVBRVEsVUFBVSxRQUFxQztBQUN0RCxVQUFNLFNBQXFCLENBQUM7QUFDNUIsZUFBVyxTQUFTLFFBQVE7QUFDM0IsVUFBSSxpQkFBaUIsbUJBQW1CO0FBQ3ZDLGVBQU8sS0FBSyxLQUFLO0FBQ2pCO0FBQUEsTUFDRDtBQUVBLFlBQU0sVUFBVSxpQkFBaUIsbUJBQzlCLElBQUksd0JBQXdCLEtBQUssSUFBSSxJQUFJLHNCQUFzQixLQUFLO0FBQ3ZFLGFBQU8sS0FBSyxPQUFPO0FBRW5CLFdBQUssZ0JBQWdCLElBQUksUUFBUSxZQUFVO0FBQzFDLGNBQU0sU0FBUyxRQUFRLE9BQU8sS0FBSyxNQUFNO0FBQ3pDLGNBQU0sTUFBTSxLQUFLLEtBQUssUUFBUSxPQUFPO0FBQ3JDLFlBQUksUUFBUSxJQUFJO0FBQ2YsZUFBSyxLQUFLLG9CQUFvQixLQUFLLE1BQU07QUFBQSxRQUMxQztBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFsSGEsa0JBQU47QUFBQSxFQXFCSjtBQUFBLEdBckJVO0FBb0hiLElBQU0sNkJBQU4sTUFBaUY7QUFBQSxFQUNoRixZQUE0QyxjQUE2QjtBQUE3QjtBQUFBLEVBQStCO0FBQUEsRUFFM0UsYUFBYSxHQUFrRDtBQUM5RCxRQUFJLGFBQWEsbUJBQW1CO0FBQ25DLGFBQU8sRUFBRTtBQUFBLElBQ1Y7QUFFQSxRQUFJLGFBQWEseUJBQXlCO0FBQ3pDLGFBQU8sRUFBRSxTQUFTO0FBQUEsSUFDbkI7QUFFQSxRQUFJLGFBQWEsZ0JBQWdCO0FBQ2hDLFVBQUksRUFBRSxVQUFVLEVBQUUsTUFBTTtBQUN2QixlQUFPLFNBQVM7QUFBQSxVQUNmLFNBQVMsQ0FBQyxrRUFBa0U7QUFBQSxVQUM1RSxLQUFLO0FBQUEsUUFDTixHQUFHLHdCQUF3QixFQUFFLE1BQU0sRUFBRSxNQUFNLEtBQUssYUFBYSxZQUFZLEVBQUUsUUFBUSxFQUFFLFVBQVUsS0FBSyxDQUFDLENBQUM7QUFBQSxNQUN2RztBQUVBLGFBQU8sRUFBRTtBQUFBLElBQ1Y7QUFFQSxnQkFBWSxDQUFDO0FBQUEsRUFDZDtBQUFBLEVBQ0EscUJBQTZCO0FBQzVCLFdBQU8sU0FBUyxjQUFjLGFBQWE7QUFBQSxFQUM1QztBQUNEO0FBNUJNLDZCQUFOO0FBQUEsRUFDYztBQUFBLEdBRFI7QUE4Qk4sTUFBTSxjQUF3RDtBQUFBLEVBQzdELFVBQVUsU0FBMkI7QUFDcEMsUUFBSSxtQkFBbUIsa0JBQWtCLG1CQUFtQix5QkFBeUI7QUFDcEYsYUFBTyxRQUFRLE9BQU8sSUFBSTtBQUFBLElBQzNCO0FBQ0EsUUFBSSxtQkFBbUIsbUJBQW1CO0FBQ3pDLGFBQU87QUFBQSxJQUNSO0FBRUEsZ0JBQVksT0FBTztBQUFBLEVBQ3BCO0FBQUEsRUFFQSxjQUFjLFNBQTJCO0FBQ3hDLFFBQUksbUJBQW1CLGdCQUFnQjtBQUN0QyxhQUFPLFFBQVEsU0FBUyxrQkFBa0IsYUFBYSxvQkFBb0I7QUFBQSxJQUM1RTtBQUNBLFFBQUksbUJBQW1CLG1CQUFtQjtBQUN6QyxhQUFPLGdCQUFnQjtBQUFBLElBQ3hCO0FBQ0EsUUFBSSxtQkFBbUIseUJBQXlCO0FBQy9DLGFBQU8sZUFBZTtBQUFBLElBQ3ZCO0FBRUEsZ0JBQVksT0FBTztBQUFBLEVBQ3BCO0FBQ0Q7QUFPQSxNQUFNLGdCQUFnQztBQUFBLEVBQ3JDLHNCQUFzQjtBQUFBLEVBQ3RCLFdBQVc7QUFBQSxJQUNWLFVBQVU7QUFBQSxJQUNWLFlBQVk7QUFBQSxJQUNaLGtCQUFrQjtBQUFBLElBQ2xCLFlBQVk7QUFBQSxFQUNiO0FBQUEsRUFDQSxvQkFBb0I7QUFBQSxFQUNwQixzQkFBc0I7QUFBQSxFQUN0QixxQkFBcUI7QUFBQSxFQUNyQixjQUFjLEVBQUUsU0FBUyxNQUFNO0FBQUEsRUFDL0IsU0FBUyxFQUFFLFNBQVMsTUFBTTtBQUFBLEVBQzFCLFVBQVU7QUFBQSxFQUNWLGlCQUFpQjtBQUNsQjtBQUVBLE1BQU0sb0JBQW9CLE1BQU0sSUFBSSxFQUFFLDJCQUEyQjtBQUFBLEVBQ2hFLElBQUksRUFBRSxxQkFBcUI7QUFBQSxJQUMxQixJQUFJLEVBQUUsb0NBQW9DO0FBQUEsSUFDMUMsSUFBSSxFQUFFLGlDQUFpQztBQUFBLElBQ3ZDLElBQUksRUFBRSxxQkFBcUI7QUFBQSxFQUM1QixDQUFDO0FBQUEsRUFFRCxJQUFJLEVBQUUsb0JBQW9CO0FBQUEsSUFDekIsSUFBSSxFQUFFLDRCQUE0QjtBQUFBLEVBQ25DLENBQUM7QUFDRixDQUFDO0FBRU0sTUFBTSxrQ0FBa0M7QUFZL0MsSUFBZSx3QkFBZixNQUF5SDtBQUFBLEVBR3hILFlBQzJDLHNCQUN6QztBQUR5QztBQUFBLEVBQ3ZDO0FBQUEsRUFFSixlQUFlLFdBQTJCO0FBQ3pDLFVBQU0sV0FBVyxrQkFBa0I7QUFDbkMsY0FBVSxZQUFZLFNBQVMsSUFBSTtBQUduQyxVQUFNLGdCQUFnQixJQUFJLGdCQUFnQjtBQUMxQyxjQUFVLFVBQVUsSUFBSSw4QkFBOEI7QUFDdEQsa0JBQWMsSUFBSSxhQUFhLE1BQU07QUFDcEMsZ0JBQVUsVUFBVSxPQUFPLDhCQUE4QjtBQUN6RCxlQUFTLEtBQUssT0FBTztBQUFBLElBQ3RCLENBQUMsQ0FBQztBQUVGLFVBQU0sUUFBUSxjQUFjLElBQUksS0FBSyxxQkFBcUIsZUFBZSxlQUFlLFNBQVMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUUzRyxVQUFNLFdBQVcsY0FBYyxJQUFJLElBQUksT0FBTyxTQUFTLGdCQUFnQixDQUFDLENBQUMsQ0FBQztBQUUxRSxVQUFNLFlBQVksYUFBYTtBQUMvQixhQUFTLE9BQU8sS0FBSztBQUNyQixhQUFTLE9BQU8sT0FBTztBQUN2QixhQUFTLGVBQWUsYUFBYSxpQkFBaUIsU0FBUztBQUUvRCxXQUFPLEtBQUsscUJBQXFCO0FBQUEsTUFDaEM7QUFBQSxNQUNBLGFBQWEsQ0FBQztBQUFBLE1BQ2Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsY0FBYyxjQUFjLElBQUksSUFBSSxnQkFBZ0IsQ0FBQztBQUFBLE1BQ3JEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBSUEsY0FBYyxTQUFtQixPQUFlLFVBQW1CO0FBQ2xFLFVBQU0sRUFBRSxhQUFhLElBQUk7QUFDekIsaUJBQWEsTUFBTTtBQUNuQixVQUFNLE9BQU87QUFFYixTQUFLLG9CQUFvQixNQUFNLFFBQVE7QUFBQSxFQUN4QztBQUFBLEVBRVEsb0JBQW9CLE1BQXNCLEVBQUUsY0FBYyxVQUFVLFNBQVMsR0FBTTtBQUMxRixpQkFBYSxJQUFJLFFBQVEsWUFBVTtBQUNsQyxlQUFTLFFBQVEsWUFBWTtBQUM3QixZQUFNLFlBQVksS0FBSyxVQUFVLEtBQUssTUFBTTtBQUM1QyxlQUFTLE9BQU8sWUFBWSxRQUFRLGVBQWUsUUFBUTtBQUMzRCxlQUFTLFFBQVEsZUFBZSxPQUFPLENBQUMsU0FBUztBQUNqRCxlQUFTLEtBQUssVUFBVSxPQUFPLGFBQWEsU0FBUztBQUFBLElBQ3RELENBQUMsQ0FBQztBQUNGLFVBQU0saUJBQWlCLE1BQU0sS0FBSyxVQUFVLElBQUksQ0FBQyxLQUFLLFVBQVUsSUFBSSxHQUFHLE1BQVM7QUFDaEYsaUJBQWEsSUFBSSxTQUFTLFdBQVcsY0FBYyxDQUFDO0FBQ3BELGlCQUFhLElBQUksSUFBSSxzQkFBc0IsU0FBUyxPQUFPLFNBQVMsY0FBYyxDQUFDO0FBQUEsRUFDcEY7QUFBQSxFQUVBLGVBQWUsU0FBbUIsT0FBZSxjQUF1QjtBQUN2RSxpQkFBYSxhQUFhLE1BQU07QUFBQSxFQUNqQztBQUFBLEVBRUEsZ0JBQWdCLGNBQXVCO0FBQ3RDLGlCQUFhLGNBQWMsUUFBUTtBQUFBLEVBQ3BDO0FBQ0Q7QUFyRWUsd0JBQWY7QUFBQSxFQUlHO0FBQUEsR0FKWTtBQXVFZixNQUFNLGdCQUFnQjtBQUd0QixJQUFNLG9CQUFOLGNBQWdDLHNCQUEwQztBQUFBLEVBS3pFLFlBQ2tCLGtCQUNBLFVBQ21CLGNBQ2Isc0JBQ3RCO0FBQ0QsVUFBTSxvQkFBb0I7QUFMVDtBQUNBO0FBQ21CO0FBTHJDLFNBQWdCLGFBQWEsa0JBQWtCO0FBQUEsRUFTL0M7QUFBQSxFQUVtQixxQkFBcUIsTUFBOEQ7QUFHckcsVUFBTSxnQkFBa0QsQ0FBQztBQUFBLE1BQ3hELElBQUksNEJBQTRCO0FBQUEsTUFDaEMsZUFBZSxnQ0FBZ0M7QUFBQSxNQUMvQyxNQUFNO0FBQUEsSUFDUCxDQUFDO0FBRUQsVUFBTSxTQUFTLEtBQUssbUJBQ2pCLEtBQUsscUJBQXFCO0FBQUEsTUFDM0I7QUFBQSxNQUNBLEtBQUssU0FBUztBQUFBLE1BQ2Q7QUFBQSxNQUNBLEVBQUUsZ0JBQWdCLE1BQU0sY0FBYztBQUFBLE1BQ3RDLEtBQUs7QUFBQSxJQUNOLElBQ0UsS0FBSyxxQkFBcUI7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsS0FBSyxTQUFTO0FBQUEsTUFDZDtBQUFBLE1BQ0EsRUFBRSxnQkFBZ0IsTUFBTSxjQUFjO0FBQUEsSUFDdkM7QUFFRCxTQUFLLGNBQWMsSUFBSSxNQUFNO0FBRTdCLFVBQU0sVUFBVSxLQUFLLGNBQWMsSUFBSSxLQUFLLHFCQUFxQixlQUFlLHNCQUFzQixLQUFLLFNBQVMsU0FBUyxPQUFPLHVCQUF1QjtBQUFBLE1BQzFKLGFBQWEsRUFBRSxtQkFBbUIsS0FBSztBQUFBLE1BQ3ZDLHdCQUF3QixDQUFDLFFBQVEsWUFBWSxxQkFBcUIsS0FBSyxzQkFBc0IsUUFBUSxPQUFPO0FBQUEsSUFDN0csQ0FBQyxDQUFDO0FBRUYsV0FBTyxFQUFFLEdBQUcsTUFBTSxRQUFRLFFBQVE7QUFBQSxFQUNuQztBQUFBLEVBRVMsY0FBYyxTQUFtQixPQUFlLFVBQW9DO0FBQzVGLFVBQU0sY0FBYyxTQUFTLE9BQU8sUUFBUTtBQUU1QyxVQUFNLEVBQUUsY0FBYyxPQUFPLElBQUk7QUFFakMsVUFBTSxPQUFPO0FBQ2IsVUFBTSxNQUFNLEtBQUs7QUFFakIsYUFBUyxNQUFNLFFBQVEsUUFBUSxHQUFHO0FBQ2xDLFVBQU0sTUFBTSxJQUFJLHdCQUF3QjtBQUN4QyxpQkFBYSxJQUFJLGFBQWEsTUFBTSxJQUFJLFFBQVEsSUFBSSxDQUFDLENBQUM7QUFDdEQsU0FBSyxhQUFhLHFCQUFxQixHQUFHLEVBQUUsS0FBSyxlQUFhO0FBQzdELFVBQUksSUFBSSxNQUFNLHlCQUF5QjtBQUN0QyxlQUFPLFVBQVUsUUFBUTtBQUFBLE1BQzFCO0FBRUEsbUJBQWEsSUFBSSxTQUFTO0FBQzFCLGFBQU8sU0FBUyxVQUFVLE9BQU8sZUFBZTtBQUNoRCxXQUFLLHNCQUFzQixNQUFNLFFBQVE7QUFDekMsV0FBSyxrQkFBa0IsTUFBTSxRQUFRO0FBQUEsSUFDdEMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLGtCQUFrQixNQUE2QixFQUFFLGNBQWMsV0FBVyxPQUFPLEdBQXVCO0FBQy9HLFVBQU0sU0FBUyxNQUFNO0FBQ3BCLFlBQU0sT0FBTyxPQUFPLGlCQUFpQjtBQUNyQyxhQUFPLE9BQU8sRUFBRSxPQUFPLFVBQVUsYUFBYSxRQUFRLEtBQUssQ0FBQztBQUU1RCxZQUFNLE9BQU8sT0FBTyxpQkFBaUI7QUFDckMsVUFBSSxTQUFTLE1BQU07QUFDbEIsZUFBTyxPQUFPLEVBQUUsT0FBTyxVQUFVLGFBQWEsUUFBUSxLQUFLLENBQUM7QUFBQSxNQUM3RDtBQUVBLFdBQUssYUFBYSxJQUFJLE1BQU0sTUFBUztBQUFBLElBQ3RDO0FBQ0EsaUJBQWEsSUFBSSxPQUFPLDRCQUE0QixNQUFNLENBQUM7QUFDM0QsaUJBQWEsSUFBSSxPQUFPLHdCQUF3QixNQUFNLENBQUM7QUFDdkQsaUJBQWEsSUFBSSxPQUFPLHdCQUF3QixNQUFNLENBQUM7QUFDdkQsaUJBQWEsSUFBSSxLQUFLLFNBQVMsTUFBTSxDQUFDO0FBQ3RDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxzQkFBc0IsTUFBNkIsVUFBb0M7QUFDOUYsVUFBTSxRQUFRLE1BQU0sY0FBYztBQUFBLE1BQ2pDLFFBQVEsS0FBSyxVQUFVO0FBQUEsTUFDdkIsWUFBWSxLQUFLLFFBQVE7QUFBQSxJQUMxQixDQUFDO0FBRUQsYUFBUyxRQUFRLFVBQVUsRUFBRSxLQUFLLEtBQUssUUFBUSxNQUFNO0FBRXJELGFBQVMsT0FBTyxlQUFlO0FBQUEsTUFDOUIsTUFBTTtBQUFBLFFBQ0wsRUFBRSxRQUFRLEdBQUcsWUFBWSxFQUFFO0FBQUEsUUFDM0IsRUFBRSxRQUFRLEdBQUcsWUFBWSxLQUFLLElBQUksR0FBRyxLQUFLLE9BQU8sZ0JBQWdCLENBQUMsRUFBRTtBQUFBLE1BQ3JFO0FBQUEsTUFDQSxNQUFNO0FBQUEsUUFDTCxFQUFFLFFBQVEsR0FBRyxZQUFZLEtBQUssT0FBTyxnQkFBZ0IsRUFBRTtBQUFBLFFBQ3ZELEVBQUUsUUFBUSxHQUFHLFlBQVksVUFBVSx1QkFBdUI7QUFBQSxNQUMzRDtBQUFBLElBQ0QsQ0FBQztBQUVELGFBQVMsT0FBTyxrQkFBa0IsY0FBWTtBQUM3QyxpQkFBVyxLQUFLLFNBQVMsYUFBYTtBQUNyQyxpQkFBUyxpQkFBaUIsQ0FBQztBQUFBLE1BQzVCO0FBQ0EsZUFBUyxZQUFZLFNBQVM7QUFFOUIsWUFBTSxjQUFjLE1BQU0saUJBQWlCLE1BQU0saUJBQWlCLENBQUM7QUFDbkUsWUFBTSxzQkFBc0IsQ0FBQyxDQUFDLFNBQVMsT0FBTyxTQUFTLEdBQUcsZ0JBQWdCLFdBQVcsRUFBRSxLQUFLO0FBQzVGLFlBQU0sWUFBWSxNQUFNLGVBQWUsTUFBTSxpQkFBaUIsVUFBVSxzQkFBc0I7QUFFOUYsZUFBUyxZQUFZLEtBQUssU0FBUztBQUFBLFFBQ2xDO0FBQUEsUUFDQSwrQkFBK0IsQ0FBQyxtQkFBbUI7QUFBQSxNQUNwRCxDQUFDO0FBQ0QsZUFBUyxZQUFZLEtBQUssU0FBUztBQUFBLFFBQ2xDO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssYUFBYSxJQUFJLFNBQVMsT0FBTyxpQkFBaUIsR0FBRyxNQUFTO0FBQUEsRUFDcEU7QUFDRDtBQW5JTSxrQkFDa0IsYUFBYTtBQUQvQixvQkFBTjtBQUFBLEVBUUc7QUFBQSxFQUNBO0FBQUEsR0FURztBQTJJTixJQUFNLHNCQUFOLE1BQW1GO0FBQUEsRUFJbEYsWUFBb0Qsc0JBQTZDO0FBQTdDO0FBRnBELFNBQWdCLGFBQWEsb0JBQW9CO0FBQUEsRUFFa0Q7QUFBQSxFQUVuRyxlQUFlLFdBQThDO0FBQzVELFVBQU0sV0FBVyxrQkFBa0I7QUFDbkMsYUFBUyxLQUFLLFVBQVUsSUFBSSxTQUFTO0FBQ3JDLGNBQVUsWUFBWSxTQUFTLElBQUk7QUFDbkMsVUFBTSxRQUFRLEtBQUsscUJBQXFCLGVBQWUsZUFBZSxTQUFTLE9BQU8sQ0FBQyxDQUFDO0FBQ3hGLFdBQU8sRUFBRSxVQUFVLE1BQU07QUFBQSxFQUMxQjtBQUFBLEVBRUEsY0FBYyxTQUFtQixRQUFnQixjQUEwQztBQUMxRixVQUFNLE9BQU87QUFDYixpQkFBYSxNQUFNLFFBQVEsWUFBWTtBQUFBLE1BQ3RDLE1BQU0sS0FBSztBQUFBLE1BQ1gsYUFBYSxTQUFTLHNCQUFzQix1QkFBdUIsS0FBSyxNQUFNLEtBQUssTUFBTTtBQUFBLE1BQ3pGLE9BQU8sRUFBRSxpQkFBaUIsS0FBSyxNQUFNLGFBQWEsS0FBSyxRQUFRLFdBQVcsS0FBSyxRQUFRLGVBQWUsS0FBSyxLQUFLO0FBQUEsSUFDakgsR0FBRztBQUFBLE1BQ0YsTUFBTSxRQUFRO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsZ0JBQWdCLGNBQTBDO0FBQ3pELGlCQUFhLE1BQU0sUUFBUTtBQUMzQixpQkFBYSxTQUFTLEtBQUssT0FBTztBQUFBLEVBQ25DO0FBQ0Q7QUE3Qk0sb0JBQ2tCLGFBQWE7QUFEL0Isc0JBQU47QUFBQSxFQUljO0FBQUEsR0FKUjtBQWdDTixNQUFNLGtCQUFOLE1BQU0sd0JBQXVCLHNCQUEwRDtBQUFBLEVBQXZGO0FBQUE7QUFFQyxTQUFnQixhQUFhLGdCQUFlO0FBQUE7QUFBQSxFQUV6QixxQkFBcUIsTUFBOEU7QUFDckgsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVTLGNBQWMsU0FBbUIsT0FBZSxVQUFvRDtBQUM1RyxVQUFNLGNBQWMsU0FBUyxPQUFPLFFBQVE7QUFFNUMsVUFBTSxPQUFPO0FBQ2IsVUFBTSxFQUFFLGNBQWMsV0FBVyxNQUFNLElBQUk7QUFFM0MsVUFBTSxRQUFRLFlBQVksRUFBRSxNQUFNLEtBQUssU0FBUyxNQUFNLEdBQUcsRUFBRSxNQUFNLEtBQUssU0FBUyxLQUFLLENBQUM7QUFFckYsaUJBQWEsSUFBSSxRQUFRLFlBQVU7QUFDbEMsZUFBUyxTQUFTLE9BQU8sTUFBTSxVQUFVLEtBQUssU0FBUyxXQUFXLEtBQUssTUFBTSxJQUFJLEtBQUs7QUFBQSxJQUN2RixDQUFDLENBQUM7QUFFRixpQkFBYSxJQUFJLGlCQUFpQixDQUFDLFFBQVEsVUFBVTtBQUNwRCxVQUFJLENBQUMsS0FBSyxVQUFVLEtBQUssTUFBTSxHQUFHO0FBQ2pDLGNBQU0sSUFBSSxLQUFLLFNBQVMsT0FBTyxTQUFTLENBQUM7QUFBQSxNQUMxQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxVQUFVLEtBQUssU0FBUyxnQkFBZ0IsU0FBUyxTQUFTLE9BQU87QUFDdkUsUUFBSSxTQUFTO0FBQ1osbUJBQWEsSUFBSSxPQUFPO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQ0Q7QUEvQk0sZ0JBQ2tCLGFBQWE7QUFEckMsSUFBTSxpQkFBTjtBQXdDQSxJQUFNLGtCQUFOLE1BQStFO0FBQUEsRUFJOUUsWUFDa0IsWUFDc0IscUJBQ3RDO0FBRmdCO0FBQ3NCO0FBSnhDLFNBQWdCLGFBQWEsZ0JBQWdCO0FBQUEsRUFLekM7QUFBQSxFQUVKLGVBQWUsV0FBOEM7QUFDNUQsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFVBQU0sU0FBUyxJQUFJLE9BQU8sV0FBVyxFQUFFLE9BQU8sSUFBSSxHQUFHLG9CQUFvQixDQUFDO0FBQzFFLFVBQU0sT0FBNkIsRUFBRSxRQUFRLE1BQU07QUFFbkQsVUFBTSxJQUFJLE1BQU07QUFDaEIsVUFBTSxJQUFJLE9BQU8sV0FBVyxNQUFNO0FBQ2pDLFVBQUksQ0FBQyxLQUFLLFdBQVcsQ0FBQyxPQUFPLFNBQVM7QUFDckM7QUFBQSxNQUNEO0FBRUEsYUFBTyxVQUFVO0FBQ2pCLFdBQUssV0FBVyxLQUFLLE9BQU8sRUFBRSxNQUFNLE9BQUs7QUFDeEMsYUFBSyxvQkFBb0IsTUFBTSxTQUFTLHNCQUFzQixvQ0FBb0MsRUFBRSxPQUFPLENBQUM7QUFBQSxNQUM3RyxDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFFRixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBYyxTQUFtQixPQUFlLGNBQTBDO0FBQ3pGLFVBQU0sT0FBTztBQUNiLGlCQUFhLE9BQU8sVUFBVTtBQUM5QixpQkFBYSxPQUFPLFFBQVEsS0FBSztBQUNqQyxpQkFBYSxVQUFVO0FBQUEsRUFDeEI7QUFBQSxFQUVBLGdCQUFnQixjQUEwQztBQUN6RCxpQkFBYSxNQUFNLFFBQVE7QUFBQSxFQUM1QjtBQUNEO0FBdkNNLGdCQUNrQixhQUFhO0FBRC9CLGtCQUFOO0FBQUEsRUFNRztBQUFBLEdBTkc7QUEwQ04sSUFBTSw4QkFBTixjQUEwQyxXQUEwQztBQUFBLEVBS25GLFlBQ2tCLFFBQ0QsZUFDZjtBQUNELFVBQU07QUFIVztBQUlqQixTQUFLLGtCQUFrQixPQUFPLDRCQUE0QjtBQUMxRCxTQUFLLFVBQVUsYUFBYSxNQUFNLEtBQUssZ0JBQWdCLE1BQU0sQ0FBQyxDQUFDO0FBRS9ELFVBQU0sbUJBQW1CLEtBQUssVUFBVSxJQUFJLGlCQUFpQixNQUFNLENBQUM7QUFFcEUsU0FBSyxVQUFVLGlCQUFpQiw2QkFBNkIsQ0FBQyxDQUFDLFlBQVksYUFBYSxNQUFNO0FBQzdGLFdBQUssT0FBTyxVQUFVO0FBQUEsSUFDdkIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLGlCQUFpQixVQUFVLENBQUMsTUFBTTtBQUNoRCxZQUFNLFFBQVEsS0FBSyxPQUFPLFNBQVM7QUFDbkMsVUFBSSxDQUFDLEtBQUssV0FBVyxDQUFDLE9BQU87QUFDNUI7QUFBQSxNQUNEO0FBRUEsb0JBQWMsV0FBVztBQUFBLFFBQ3hCLFVBQVUsTUFBTTtBQUFBLFFBQ2hCLFNBQVM7QUFBQSxVQUNSLFdBQVcsTUFBTSxjQUFjLElBQUksU0FBUyxLQUFLLFFBQVEsTUFBTSxLQUFLLFFBQVEsS0FBSyxXQUFXLENBQUM7QUFBQSxVQUM3RixxQkFBcUIsOEJBQThCO0FBQUEsUUFDcEQ7QUFBQSxNQUNELEdBQUcsRUFBRSx3QkFBd0IsYUFBYSxNQUFTO0FBQUEsSUFDcEQsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsT0FBTyxZQUFpQztBQUMvQyxRQUFJLENBQUMsV0FBVyxvQkFBb0I7QUFDbkMsYUFBTyxLQUFLLE1BQU07QUFBQSxJQUNuQjtBQUVBLFVBQU0sV0FBVyxXQUFXLE9BQU87QUFDbkMsVUFBTSxPQUFPLFlBQVksS0FBSyxPQUFPLFNBQVMsR0FBRyxrQkFBa0IsUUFBUTtBQUMzRSxRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU8sS0FBSyxNQUFNO0FBQUEsSUFDbkI7QUFFQSxVQUFNLE9BQU8sS0FBSyxTQUFTO0FBQzNCLFFBQUksUUFBUSxLQUFLLGdCQUFnQixLQUFLLGVBQWUsS0FBSyxjQUFjLEtBQUssYUFBYSxLQUFLLFNBQVMsS0FBSyxNQUFNO0FBQ2xIO0FBQUEsSUFDRDtBQUVBLFNBQUssVUFBVSxFQUFFLE1BQU0sTUFBTSxTQUFTLFdBQVc7QUFDakQsU0FBSyxnQkFBZ0IsSUFBSSxDQUFDO0FBQUEsTUFDekIsT0FBTyxJQUFJLE1BQU0sU0FBUyxZQUFZLEtBQUssYUFBYSxTQUFTLFlBQVksS0FBSyxTQUFTO0FBQUEsTUFDM0YsU0FBUztBQUFBLFFBQ1IsYUFBYTtBQUFBLFFBQ2IsaUJBQWlCO0FBQUEsTUFDbEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLFFBQVE7QUFDZixTQUFLLGdCQUFnQixNQUFNO0FBQzNCLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQ0Q7QUFoRU0sNEJBQ2tCLEtBQUs7QUFEdkIsOEJBQU47QUFBQSxFQU9HO0FBQUEsR0FQRztBQWtFTixnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsRUFDckMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxZQUFZLFdBQVc7QUFBQSxNQUN4QyxNQUFNLFFBQVE7QUFBQSxNQUNkLE1BQU07QUFBQSxRQUNMLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEIsRUFBRSxLQUFLLE1BQU0sR0FBNEI7QUFDOUUsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxjQUFjLFdBQVc7QUFBQSxNQUM5QixVQUFVO0FBQUEsTUFDVixTQUFTO0FBQUEsUUFDUixXQUFXO0FBQUEsUUFDWCxxQkFBcUIsOEJBQThCO0FBQUEsTUFDcEQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
