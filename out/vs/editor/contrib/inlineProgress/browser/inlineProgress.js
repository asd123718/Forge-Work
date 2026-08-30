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
import { disposableTimeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { noBreakWhitespace } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import "./inlineProgressWidget.css";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
const inlineProgressDecoration = ModelDecorationOptions.register({
  description: "inline-progress-widget",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  showIfCollapsed: true,
  after: {
    content: noBreakWhitespace,
    inlineClassName: "inline-editor-progress-decoration",
    inlineClassNameAffectsLetterSpacing: true
  }
});
const _InlineProgressWidget = class _InlineProgressWidget extends Disposable {
  constructor(typeId, editor, range, title, delegate) {
    super();
    this.typeId = typeId;
    this.editor = editor;
    this.range = range;
    this.delegate = delegate;
    this.allowEditorOverflow = false;
    this.suppressMouseDown = true;
    this.create(title);
    this.editor.addContentWidget(this);
    this.editor.layoutContentWidget(this);
  }
  create(title) {
    this.domNode = dom.$(".inline-progress-widget");
    this.domNode.role = "button";
    this.domNode.title = title;
    const iconElement = dom.$("span.icon");
    this.domNode.append(iconElement);
    iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), "codicon-modifier-spin");
    const updateSize = () => {
      const lineHeight = this.editor.getOption(EditorOption.lineHeight);
      this.domNode.style.height = `${lineHeight}px`;
      this.domNode.style.width = `${Math.ceil(0.8 * lineHeight)}px`;
    };
    updateSize();
    this._register(this.editor.onDidChangeConfiguration((c) => {
      if (c.hasChanged(EditorOption.fontSize) || c.hasChanged(EditorOption.lineHeight)) {
        updateSize();
      }
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, (e) => {
      this.delegate.cancel();
    }));
  }
  getId() {
    return _InlineProgressWidget.baseId + "." + this.typeId;
  }
  getDomNode() {
    return this.domNode;
  }
  getPosition() {
    return {
      position: { lineNumber: this.range.startLineNumber, column: this.range.startColumn },
      preference: [ContentWidgetPositionPreference.EXACT]
    };
  }
  dispose() {
    super.dispose();
    this.editor.removeContentWidget(this);
  }
};
_InlineProgressWidget.baseId = "editor.widget.inlineProgressWidget";
let InlineProgressWidget = _InlineProgressWidget;
let InlineProgressManager = class extends Disposable {
  constructor(id, _editor, _instantiationService) {
    super();
    this.id = id;
    this._editor = _editor;
    this._instantiationService = _instantiationService;
    /** Delay before showing the progress widget */
    this._showDelay = 500;
    // ms
    this._showPromise = this._register(new MutableDisposable());
    this._currentWidget = this._register(new MutableDisposable());
    this._operationIdPool = 0;
    this._currentDecorations = _editor.createDecorationsCollection();
  }
  dispose() {
    super.dispose();
    this._currentDecorations.clear();
  }
  async showWhile(position, title, promise, delegate, delayOverride) {
    const operationId = this._operationIdPool++;
    this._currentOperation = operationId;
    this.clear();
    this._showPromise.value = disposableTimeout(() => {
      const range = Range.fromPositions(position);
      const decorationIds = this._currentDecorations.set([{
        range,
        options: inlineProgressDecoration
      }]);
      if (decorationIds.length > 0) {
        this._currentWidget.value = this._instantiationService.createInstance(InlineProgressWidget, this.id, this._editor, range, title, delegate);
      }
    }, delayOverride ?? this._showDelay);
    try {
      return await promise;
    } finally {
      if (this._currentOperation === operationId) {
        this.clear();
        this._currentOperation = void 0;
      }
    }
  }
  clear() {
    this._showPromise.clear();
    this._currentDecorations.clear();
    this._currentWidget.clear();
  }
};
InlineProgressManager = __decorateClass([
  __decorateParam(2, IInstantiationService)
], InlineProgressManager);
export {
  InlineProgressManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZVByb2dyZXNzXFxicm93c2VyXFxpbmxpbmVQcm9ncmVzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG5vQnJlYWtXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0ICcuL2lubGluZVByb2dyZXNzV2lkZ2V0LmNzcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcblxuY29uc3QgaW5saW5lUHJvZ3Jlc3NEZWNvcmF0aW9uID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdGRlc2NyaXB0aW9uOiAnaW5saW5lLXByb2dyZXNzLXdpZGdldCcsXG5cdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdGFmdGVyOiB7XG5cdFx0Y29udGVudDogbm9CcmVha1doaXRlc3BhY2UsXG5cdFx0aW5saW5lQ2xhc3NOYW1lOiAnaW5saW5lLWVkaXRvci1wcm9ncmVzcy1kZWNvcmF0aW9uJyxcblx0XHRpbmxpbmVDbGFzc05hbWVBZmZlY3RzTGV0dGVyU3BhY2luZzogdHJ1ZSxcblx0fVxufSk7XG5cblxuY2xhc3MgSW5saW5lUHJvZ3Jlc3NXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbnRlbnRXaWRnZXQge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBiYXNlSWQgPSAnZWRpdG9yLndpZGdldC5pbmxpbmVQcm9ncmVzc1dpZGdldCc7XG5cblx0YWxsb3dFZGl0b3JPdmVyZmxvdyA9IGZhbHNlO1xuXHRzdXBwcmVzc01vdXNlRG93biA9IHRydWU7XG5cblx0cHJpdmF0ZSBkb21Ob2RlITogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0eXBlSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByYW5nZTogUmFuZ2UsXG5cdFx0dGl0bGU6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlbGVnYXRlOiBJbmxpbmVQcm9ncmVzc0RlbGVnYXRlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jcmVhdGUodGl0bGUpO1xuXG5cdFx0dGhpcy5lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS4kKCcuaW5saW5lLXByb2dyZXNzLXdpZGdldCcpO1xuXHRcdHRoaXMuZG9tTm9kZS5yb2xlID0gJ2J1dHRvbic7XG5cdFx0dGhpcy5kb21Ob2RlLnRpdGxlID0gdGl0bGU7XG5cblx0XHRjb25zdCBpY29uRWxlbWVudCA9IGRvbS4kKCdzcGFuLmljb24nKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kKGljb25FbGVtZW50KTtcblxuXHRcdGljb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5sb2FkaW5nKSwgJ2NvZGljb24tbW9kaWZpZXItc3BpbicpO1xuXG5cdFx0Y29uc3QgdXBkYXRlU2l6ZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmhlaWdodCA9IGAke2xpbmVIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLndpZHRoID0gYCR7TWF0aC5jZWlsKDAuOCAqIGxpbmVIZWlnaHQpfXB4YDtcblx0XHR9O1xuXHRcdHVwZGF0ZVNpemUoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihjID0+IHtcblx0XHRcdGlmIChjLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRTaXplKSB8fCBjLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpKSB7XG5cdFx0XHRcdHVwZGF0ZVNpemUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHR0aGlzLmRlbGVnYXRlLmNhbmNlbCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIElubGluZVByb2dyZXNzV2lkZ2V0LmJhc2VJZCArICcuJyArIHRoaXMudHlwZUlkO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHsgbGluZU51bWJlcjogdGhpcy5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogdGhpcy5yYW5nZS5zdGFydENvbHVtbiB9LFxuXHRcdFx0cHJlZmVyZW5jZTogW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuRVhBQ1RdXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZWRpdG9yLnJlbW92ZUNvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElubGluZVByb2dyZXNzRGVsZWdhdGUge1xuXHRjYW5jZWwoKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIElubGluZVByb2dyZXNzTWFuYWdlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8qKiBEZWxheSBiZWZvcmUgc2hvd2luZyB0aGUgcHJvZ3Jlc3Mgd2lkZ2V0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dEZWxheSA9IDUwMDsgLy8gbXNcblx0cHJpdmF0ZSByZWFkb25seSBfc2hvd1Byb21pc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudERlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50V2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElubGluZVByb2dyZXNzV2lkZ2V0PigpKTtcblxuXHRwcml2YXRlIF9vcGVyYXRpb25JZFBvb2wgPSAwO1xuXHRwcml2YXRlIF9jdXJyZW50T3BlcmF0aW9uPzogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2N1cnJlbnREZWNvcmF0aW9ucyA9IF9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY3VycmVudERlY29yYXRpb25zLmNsZWFyKCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2hvd1doaWxlPFI+KHBvc2l0aW9uOiBJUG9zaXRpb24sIHRpdGxlOiBzdHJpbmcsIHByb21pc2U6IFByb21pc2U8Uj4sIGRlbGVnYXRlOiBJbmxpbmVQcm9ncmVzc0RlbGVnYXRlLCBkZWxheU92ZXJyaWRlPzogbnVtYmVyKTogUHJvbWlzZTxSPiB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uSWQgPSB0aGlzLl9vcGVyYXRpb25JZFBvb2wrKztcblx0XHR0aGlzLl9jdXJyZW50T3BlcmF0aW9uID0gb3BlcmF0aW9uSWQ7XG5cblx0XHR0aGlzLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9zaG93UHJvbWlzZS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbik7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uSWRzID0gdGhpcy5fY3VycmVudERlY29yYXRpb25zLnNldChbe1xuXHRcdFx0XHRyYW5nZTogcmFuZ2UsXG5cdFx0XHRcdG9wdGlvbnM6IGlubGluZVByb2dyZXNzRGVjb3JhdGlvbixcblx0XHRcdH1dKTtcblxuXHRcdFx0aWYgKGRlY29yYXRpb25JZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50V2lkZ2V0LnZhbHVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5saW5lUHJvZ3Jlc3NXaWRnZXQsIHRoaXMuaWQsIHRoaXMuX2VkaXRvciwgcmFuZ2UsIHRpdGxlLCBkZWxlZ2F0ZSk7XG5cdFx0XHR9XG5cdFx0fSwgZGVsYXlPdmVycmlkZSA/PyB0aGlzLl9zaG93RGVsYXkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwcm9taXNlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudE9wZXJhdGlvbiA9PT0gb3BlcmF0aW9uSWQpIHtcblx0XHRcdFx0dGhpcy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50T3BlcmF0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKSB7XG5cdFx0dGhpcy5fc2hvd1Byb21pc2UuY2xlYXIoKTtcblx0XHR0aGlzLl9jdXJyZW50RGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHR0aGlzLl9jdXJyZW50V2lkZ2V0LmNsZWFyKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCO0FBQzFCLE9BQU87QUFDUCxTQUFTLHVDQUE0RjtBQUNyRyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGFBQWE7QUFFdEIsU0FBUyw4QkFB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
