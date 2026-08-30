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
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { CachedListVirtualDelegate } from "../../../../base/browser/ui/list/list.js";
import { createMatches } from "../../../../base/common/filters.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { basename } from "../../../../base/common/path.js";
import severity from "../../../../base/common/severity.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IDebugService } from "../common/debug.js";
import { Variable } from "../common/debugModel.js";
import { RawObjectReplElement, ReplEvaluationInput, ReplEvaluationResult, ReplGroup, ReplOutputElement, ReplVariableElement } from "../common/replModel.js";
import { AbstractExpressionsRenderer } from "./baseDebugView.js";
import { debugConsoleEvaluationInput } from "./debugIcons.js";
const $ = dom.$;
const _ReplEvaluationInputsRenderer = class _ReplEvaluationInputsRenderer {
  get templateId() {
    return _ReplEvaluationInputsRenderer.ID;
  }
  renderTemplate(container) {
    dom.append(container, $("span.arrow" + ThemeIcon.asCSSSelector(debugConsoleEvaluationInput)));
    const input = dom.append(container, $(".expression"));
    const label = new HighlightedLabel(input);
    return { label };
  }
  renderElement(element, index, templateData) {
    const evaluation = element.element;
    templateData.label.set(evaluation.value, createMatches(element.filterData));
  }
  disposeTemplate(templateData) {
    templateData.label.dispose();
  }
};
_ReplEvaluationInputsRenderer.ID = "replEvaluationInput";
let ReplEvaluationInputsRenderer = _ReplEvaluationInputsRenderer;
let ReplGroupRenderer = class {
  constructor(expressionRenderer, instaService) {
    this.expressionRenderer = expressionRenderer;
    this.instaService = instaService;
  }
  get templateId() {
    return ReplGroupRenderer.ID;
  }
  renderTemplate(container) {
    container.classList.add("group");
    const expression = dom.append(container, $(".output.expression.value-and-source"));
    const label = dom.append(expression, $("span.label"));
    const source = this.instaService.createInstance(SourceWidget, expression);
    return { label, source };
  }
  renderElement(element, _index, templateData) {
    templateData.elementDisposable?.dispose();
    const replGroup = element.element;
    dom.clearNode(templateData.label);
    templateData.elementDisposable = this.expressionRenderer.renderValue(templateData.label, replGroup.name, { wasANSI: true, session: element.element.session });
    templateData.source.setSource(replGroup.sourceData);
  }
  disposeTemplate(templateData) {
    templateData.elementDisposable?.dispose();
    templateData.source.dispose();
  }
};
ReplGroupRenderer.ID = "replGroup";
ReplGroupRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ReplGroupRenderer);
const _ReplEvaluationResultsRenderer = class _ReplEvaluationResultsRenderer {
  constructor(expressionRenderer) {
    this.expressionRenderer = expressionRenderer;
  }
  get templateId() {
    return _ReplEvaluationResultsRenderer.ID;
  }
  renderTemplate(container) {
    const output = dom.append(container, $(".evaluation-result.expression"));
    const value = dom.append(output, $("span.value"));
    return { value, elementStore: new DisposableStore() };
  }
  renderElement(element, index, templateData) {
    templateData.elementStore.clear();
    const expression = element.element;
    templateData.elementStore.add(this.expressionRenderer.renderValue(templateData.value, expression, {
      colorize: true,
      hover: false,
      session: element.element.getSession()
    }));
  }
  disposeTemplate(templateData) {
    templateData.elementStore.dispose();
  }
};
_ReplEvaluationResultsRenderer.ID = "replEvaluationResult";
let ReplEvaluationResultsRenderer = _ReplEvaluationResultsRenderer;
let ReplOutputElementRenderer = class {
  constructor(expressionRenderer, instaService) {
    this.expressionRenderer = expressionRenderer;
    this.instaService = instaService;
  }
  get templateId() {
    return ReplOutputElementRenderer.ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    container.classList.add("output");
    const expression = dom.append(container, $(".output.expression.value-and-source"));
    data.container = container;
    data.countContainer = dom.append(expression, $(".count-badge-wrapper"));
    data.count = new CountBadge(data.countContainer, {}, defaultCountBadgeStyles);
    data.value = dom.append(expression, $("span.value.label"));
    data.source = this.instaService.createInstance(SourceWidget, expression);
    data.elementDisposable = new DisposableStore();
    return data;
  }
  renderElement({ element }, index, templateData) {
    templateData.elementDisposable.clear();
    this.setElementCount(element, templateData);
    templateData.elementDisposable.add(element.onDidChangeCount(() => this.setElementCount(element, templateData)));
    dom.clearNode(templateData.value);
    templateData.value.className = "value";
    const locationReference = element.expression?.valueLocationReference;
    templateData.elementDisposable.add(this.expressionRenderer.renderValue(templateData.value, element.value, {
      wasANSI: true,
      session: element.session,
      locationReference,
      hover: false
    }));
    templateData.value.classList.add(element.severity === severity.Warning ? "warn" : element.severity === severity.Error ? "error" : element.severity === severity.Ignore ? "ignore" : "info");
    templateData.source.setSource(element.sourceData);
    templateData.getReplElementSource = () => element.sourceData;
  }
  setElementCount(element, templateData) {
    if (element.count >= 2) {
      templateData.count.setCount(element.count);
      templateData.countContainer.hidden = false;
    } else {
      templateData.countContainer.hidden = true;
    }
  }
  disposeTemplate(templateData) {
    templateData.source.dispose();
    templateData.elementDisposable.dispose();
    templateData.count.dispose();
  }
  disposeElement(_element, _index, templateData) {
    templateData.elementDisposable.clear();
  }
};
ReplOutputElementRenderer.ID = "outputReplElement";
ReplOutputElementRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ReplOutputElementRenderer);
let ReplVariablesRenderer = class extends AbstractExpressionsRenderer {
  constructor(expressionRenderer, debugService, contextViewService, hoverService) {
    super(debugService, contextViewService, hoverService);
    this.expressionRenderer = expressionRenderer;
  }
  get templateId() {
    return ReplVariablesRenderer.ID;
  }
  renderElement(node, _index, data) {
    const element = node.element;
    data.elementDisposable.clear();
    super.renderExpressionElement(element instanceof ReplVariableElement ? element.expression : element, node, data);
  }
  renderExpression(expression, data, highlights) {
    const isReplVariable = expression instanceof ReplVariableElement;
    if (isReplVariable || !expression.name) {
      data.label.set("");
      const value = isReplVariable ? expression.expression : expression;
      data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, value, { colorize: true, hover: false, session: expression.getSession() }));
      data.expression.classList.remove("nested-variable");
    } else {
      data.elementDisposable.add(this.expressionRenderer.renderVariable(data, expression, { showChanged: true, highlights }));
      data.expression.classList.toggle("nested-variable", isNestedVariable(expression));
    }
  }
  getInputBoxOptions(expression) {
    return void 0;
  }
};
ReplVariablesRenderer.ID = "replVariable";
ReplVariablesRenderer = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IHoverService)
], ReplVariablesRenderer);
const _ReplRawObjectsRenderer = class _ReplRawObjectsRenderer {
  constructor(expressionRenderer) {
    this.expressionRenderer = expressionRenderer;
  }
  get templateId() {
    return _ReplRawObjectsRenderer.ID;
  }
  renderTemplate(container) {
    container.classList.add("output");
    const expression = dom.append(container, $(".output.expression"));
    const name = dom.append(expression, $("span.name"));
    const label = new HighlightedLabel(name);
    const value = dom.append(expression, $("span.value"));
    return { container, expression, name, label, value, elementStore: new DisposableStore() };
  }
  renderElement(node, index, templateData) {
    templateData.elementStore.clear();
    const element = node.element;
    templateData.label.set(element.name ? `${element.name}:` : "", createMatches(node.filterData));
    if (element.name) {
      templateData.name.textContent = `${element.name}:`;
    } else {
      templateData.name.textContent = "";
    }
    templateData.elementStore.add(this.expressionRenderer.renderValue(templateData.value, element.value, {
      hover: false,
      session: node.element.getSession()
    }));
  }
  disposeTemplate(templateData) {
    templateData.elementStore.dispose();
    templateData.label.dispose();
  }
};
_ReplRawObjectsRenderer.ID = "rawObject";
let ReplRawObjectsRenderer = _ReplRawObjectsRenderer;
function isNestedVariable(element) {
  return element instanceof Variable && (element.parent instanceof ReplEvaluationResult || element.parent instanceof Variable);
}
class ReplDelegate extends CachedListVirtualDelegate {
  constructor(configurationService, replOptions) {
    super();
    this.configurationService = configurationService;
    this.replOptions = replOptions;
  }
  getHeight(element) {
    const config = this.configurationService.getValue("debug");
    if (!config.console.wordWrap) {
      return this.estimateHeight(element, true);
    }
    return super.getHeight(element);
  }
  /**
   * With wordWrap enabled, this is an estimate. With wordWrap disabled, this is the real height that the list will use.
   */
  estimateHeight(element, ignoreValueLength = false) {
    const lineHeight = this.replOptions.replConfiguration.lineHeight;
    const countNumberOfLines = (str) => str.match(/\n/g)?.length ?? 0;
    const hasValue = (e) => typeof e.value === "string";
    if (hasValue(element) && !isNestedVariable(element)) {
      const value = element.value;
      const valueRows = countNumberOfLines(value) + (ignoreValueLength ? 0 : Math.floor(value.length / 70)) + (element instanceof ReplOutputElement ? 0 : 1);
      return Math.max(valueRows, 1) * lineHeight;
    }
    return lineHeight;
  }
  getTemplateId(element) {
    if (element instanceof Variable || element instanceof ReplVariableElement) {
      return ReplVariablesRenderer.ID;
    }
    if (element instanceof ReplEvaluationResult) {
      return ReplEvaluationResultsRenderer.ID;
    }
    if (element instanceof ReplEvaluationInput) {
      return ReplEvaluationInputsRenderer.ID;
    }
    if (element instanceof ReplOutputElement) {
      return ReplOutputElementRenderer.ID;
    }
    if (element instanceof ReplGroup) {
      return ReplGroupRenderer.ID;
    }
    return ReplRawObjectsRenderer.ID;
  }
  hasDynamicHeight(element) {
    if (isNestedVariable(element)) {
      return false;
    }
    return element.toString().length > 0;
  }
}
function isDebugSession(obj) {
  return typeof obj.getReplElements === "function";
}
class ReplDataSource {
  hasChildren(element) {
    if (isDebugSession(element)) {
      return true;
    }
    return !!element.hasChildren;
  }
  getChildren(element) {
    if (isDebugSession(element)) {
      return Promise.resolve(element.getReplElements());
    }
    return Promise.resolve(element.getChildren());
  }
}
class ReplAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("debugConsole", "Debug Console");
  }
  getAriaLabel(element) {
    if (element instanceof Variable) {
      return localize("replVariableAriaLabel", "Variable {0}, value {1}", element.name, element.value);
    }
    if (element instanceof ReplOutputElement || element instanceof ReplEvaluationInput || element instanceof ReplEvaluationResult) {
      return element.value + (element instanceof ReplOutputElement && element.count > 1 ? localize(
        { key: "occurred", comment: ["Front will the value of the debug console element. Placeholder will be replaced by a number which represents occurrance count."] },
        ", occurred {0} times",
        element.count
      ) : "");
    }
    if (element instanceof RawObjectReplElement) {
      return localize("replRawObjectAriaLabel", "Debug console variable {0}, value {1}", element.name, element.value);
    }
    if (element instanceof ReplGroup) {
      return localize("replGroup", "Debug console group {0}", element.name);
    }
    return "";
  }
}
let SourceWidget = class extends Disposable {
  constructor(container, editorService, hoverService, labelService) {
    super();
    this.hoverService = hoverService;
    this.labelService = labelService;
    this.el = dom.append(container, $(".source"));
    this._register(dom.addDisposableListener(this.el, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.source) {
        this.source.source.openInEditor(editorService, {
          startLineNumber: this.source.lineNumber,
          startColumn: this.source.column,
          endLineNumber: this.source.lineNumber,
          endColumn: this.source.column
        });
      }
    }));
  }
  setSource(source) {
    this.source = source;
    this.el.textContent = source ? `${basename(source.source.name)}:${source.lineNumber}` : "";
    this.hover ??= this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.el, ""));
    this.hover.update(source ? `${this.labelService.getUriLabel(source.source.uri)}:${source.lineNumber}` : "");
  }
};
SourceWidget = __decorateClass([
  __decorateParam(1, IEditorService),
  __decorateParam(2, IHoverService),
  __decorateParam(3, ILabelService)
], SourceWidget);
export {
  ReplAccessibilityProvider,
  ReplDataSource,
  ReplDelegate,
  ReplEvaluationInputsRenderer,
  ReplEvaluationResultsRenderer,
  ReplGroupRenderer,
  ReplOutputElementRenderer,
  ReplRawObjectsRenderer,
  ReplVariablesRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxyZXBsVmlld2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ291bnRCYWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb3VudEJhZGdlL2NvdW50QmFkZ2UuanMnO1xuaW1wb3J0IHsgSGlnaGxpZ2h0ZWRMYWJlbCwgSUhpZ2hsaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwuanMnO1xuaW1wb3J0IHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBDYWNoZWRMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFzeW5jRGF0YVNvdXJjZSwgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNYXRjaGVzLCBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgc2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IGRlZmF1bHRDb3VudEJhZGdlU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1Nlc3Npb24sIElFeHByZXNzaW9uLCBJRXhwcmVzc2lvbkNvbnRhaW5lciwgSU5lc3RpbmdSZXBsRWxlbWVudCwgSVJlcGxFbGVtZW50LCBJUmVwbEVsZW1lbnRTb3VyY2UsIElSZXBsT3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBWYXJpYWJsZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IFJhd09iamVjdFJlcGxFbGVtZW50LCBSZXBsRXZhbHVhdGlvbklucHV0LCBSZXBsRXZhbHVhdGlvblJlc3VsdCwgUmVwbEdyb3VwLCBSZXBsT3V0cHV0RWxlbWVudCwgUmVwbFZhcmlhYmxlRWxlbWVudCB9IGZyb20gJy4uL2NvbW1vbi9yZXBsTW9kZWwuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFeHByZXNzaW9uc1JlbmRlcmVyLCBJRXhwcmVzc2lvblRlbXBsYXRlRGF0YSwgSUlucHV0Qm94T3B0aW9ucyB9IGZyb20gJy4vYmFzZURlYnVnVmlldy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlciB9IGZyb20gJy4vZGVidWdFeHByZXNzaW9uUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZGVidWdDb25zb2xlRXZhbHVhdGlvbklucHV0IH0gZnJvbSAnLi9kZWJ1Z0ljb25zLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5pbnRlcmZhY2UgSVJlcGxFdmFsdWF0aW9uSW5wdXRUZW1wbGF0ZURhdGEge1xuXHRsYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcbn1cblxuaW50ZXJmYWNlIElSZXBsR3JvdXBUZW1wbGF0ZURhdGEge1xuXHRsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHNvdXJjZTogU291cmNlV2lkZ2V0O1xuXHRlbGVtZW50RGlzcG9zYWJsZT86IElEaXNwb3NhYmxlO1xufVxuXG5pbnRlcmZhY2UgSVJlcGxFdmFsdWF0aW9uUmVzdWx0VGVtcGxhdGVEYXRhIHtcblx0dmFsdWU6IEhUTUxFbGVtZW50O1xuXHRlbGVtZW50U3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuaW50ZXJmYWNlIElPdXRwdXRSZXBsRWxlbWVudFRlbXBsYXRlRGF0YSB7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGNvdW50OiBDb3VudEJhZGdlO1xuXHRjb3VudENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHZhbHVlOiBIVE1MRWxlbWVudDtcblx0c291cmNlOiBTb3VyY2VXaWRnZXQ7XG5cdGdldFJlcGxFbGVtZW50U291cmNlKCk6IElSZXBsRWxlbWVudFNvdXJjZSB8IHVuZGVmaW5lZDtcblx0ZWxlbWVudERpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuaW50ZXJmYWNlIElSYXdPYmplY3RSZXBsVGVtcGxhdGVEYXRhIHtcblx0Y29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0ZXhwcmVzc2lvbjogSFRNTEVsZW1lbnQ7XG5cdG5hbWU6IEhUTUxFbGVtZW50O1xuXHR2YWx1ZTogSFRNTEVsZW1lbnQ7XG5cdGxhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXHRlbGVtZW50U3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxFdmFsdWF0aW9uSW5wdXRzUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFJlcGxFdmFsdWF0aW9uSW5wdXQsIEZ1enp5U2NvcmUsIElSZXBsRXZhbHVhdGlvbklucHV0VGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdyZXBsRXZhbHVhdGlvbklucHV0JztcblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBSZXBsRXZhbHVhdGlvbklucHV0c1JlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElSZXBsRXZhbHVhdGlvbklucHV0VGVtcGxhdGVEYXRhIHtcblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5hcnJvdycgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihkZWJ1Z0NvbnNvbGVFdmFsdWF0aW9uSW5wdXQpKSk7XG5cdFx0Y29uc3QgaW5wdXQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmV4cHJlc3Npb24nKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBuZXcgSGlnaGxpZ2h0ZWRMYWJlbChpbnB1dCk7XG5cdFx0cmV0dXJuIHsgbGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFJlcGxFdmFsdWF0aW9uSW5wdXQsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElSZXBsRXZhbHVhdGlvbklucHV0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZXZhbHVhdGlvbiA9IGVsZW1lbnQuZWxlbWVudDtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0KGV2YWx1YXRpb24udmFsdWUsIGNyZWF0ZU1hdGNoZXMoZWxlbWVudC5maWx0ZXJEYXRhKSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUmVwbEV2YWx1YXRpb25JbnB1dFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxHcm91cFJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxSZXBsR3JvdXAsIEZ1enp5U2NvcmUsIElSZXBsR3JvdXBUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3JlcGxHcm91cCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHByZXNzaW9uUmVuZGVyZXI6IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBSZXBsR3JvdXBSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUmVwbEdyb3VwVGVtcGxhdGVEYXRhIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZ3JvdXAnKTtcblx0XHRjb25zdCBleHByZXNzaW9uID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5vdXRwdXQuZXhwcmVzc2lvbi52YWx1ZS1hbmQtc291cmNlJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChleHByZXNzaW9uLCAkKCdzcGFuLmxhYmVsJykpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNvdXJjZVdpZGdldCwgZXhwcmVzc2lvbik7XG5cdFx0cmV0dXJuIHsgbGFiZWwsIHNvdXJjZSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8UmVwbEdyb3VwLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVJlcGxHcm91cFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0Y29uc3QgcmVwbEdyb3VwID0gZWxlbWVudC5lbGVtZW50O1xuXHRcdGRvbS5jbGVhck5vZGUodGVtcGxhdGVEYXRhLmxhYmVsKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGUgPSB0aGlzLmV4cHJlc3Npb25SZW5kZXJlci5yZW5kZXJWYWx1ZSh0ZW1wbGF0ZURhdGEubGFiZWwsIHJlcGxHcm91cC5uYW1lLCB7IHdhc0FOU0k6IHRydWUsIHNlc3Npb246IGVsZW1lbnQuZWxlbWVudC5zZXNzaW9uIH0pO1xuXHRcdHRlbXBsYXRlRGF0YS5zb3VyY2Uuc2V0U291cmNlKHJlcGxHcm91cC5zb3VyY2VEYXRhKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElSZXBsR3JvdXBUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuc291cmNlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVwbEV2YWx1YXRpb25SZXN1bHRzUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFJlcGxFdmFsdWF0aW9uUmVzdWx0IHwgVmFyaWFibGUsIEZ1enp5U2NvcmUsIElSZXBsRXZhbHVhdGlvblJlc3VsdFRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAncmVwbEV2YWx1YXRpb25SZXN1bHQnO1xuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFJlcGxFdmFsdWF0aW9uUmVzdWx0c1JlbmRlcmVyLklEO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHByZXNzaW9uUmVuZGVyZXI6IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUmVwbEV2YWx1YXRpb25SZXN1bHRUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IG91dHB1dCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuZXZhbHVhdGlvbi1yZXN1bHQuZXhwcmVzc2lvbicpKTtcblx0XHRjb25zdCB2YWx1ZSA9IGRvbS5hcHBlbmQob3V0cHV0LCAkKCdzcGFuLnZhbHVlJykpO1xuXG5cdFx0cmV0dXJuIHsgdmFsdWUsIGVsZW1lbnRTdG9yZTogbmV3IERpc3Bvc2FibGVTdG9yZSgpIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxSZXBsRXZhbHVhdGlvblJlc3VsdCB8IFZhcmlhYmxlLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUmVwbEV2YWx1YXRpb25SZXN1bHRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudFN0b3JlLmNsZWFyKCk7XG5cdFx0Y29uc3QgZXhwcmVzc2lvbiA9IGVsZW1lbnQuZWxlbWVudDtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudFN0b3JlLmFkZCh0aGlzLmV4cHJlc3Npb25SZW5kZXJlci5yZW5kZXJWYWx1ZSh0ZW1wbGF0ZURhdGEudmFsdWUsIGV4cHJlc3Npb24sIHtcblx0XHRcdGNvbG9yaXplOiB0cnVlLFxuXHRcdFx0aG92ZXI6IGZhbHNlLFxuXHRcdFx0c2Vzc2lvbjogZWxlbWVudC5lbGVtZW50LmdldFNlc3Npb24oKSxcblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUmVwbEV2YWx1YXRpb25SZXN1bHRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudFN0b3JlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVwbE91dHB1dEVsZW1lbnRSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8UmVwbE91dHB1dEVsZW1lbnQsIEZ1enp5U2NvcmUsIElPdXRwdXRSZXBsRWxlbWVudFRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnb3V0cHV0UmVwbEVsZW1lbnQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXhwcmVzc2lvblJlbmRlcmVyOiBEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gUmVwbE91dHB1dEVsZW1lbnRSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJT3V0cHV0UmVwbEVsZW1lbnRUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRhdGE6IElPdXRwdXRSZXBsRWxlbWVudFRlbXBsYXRlRGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ291dHB1dCcpO1xuXHRcdGNvbnN0IGV4cHJlc3Npb24gPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm91dHB1dC5leHByZXNzaW9uLnZhbHVlLWFuZC1zb3VyY2UnKSk7XG5cblx0XHRkYXRhLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRkYXRhLmNvdW50Q29udGFpbmVyID0gZG9tLmFwcGVuZChleHByZXNzaW9uLCAkKCcuY291bnQtYmFkZ2Utd3JhcHBlcicpKTtcblx0XHRkYXRhLmNvdW50ID0gbmV3IENvdW50QmFkZ2UoZGF0YS5jb3VudENvbnRhaW5lciwge30sIGRlZmF1bHRDb3VudEJhZGdlU3R5bGVzKTtcblx0XHRkYXRhLnZhbHVlID0gZG9tLmFwcGVuZChleHByZXNzaW9uLCAkKCdzcGFuLnZhbHVlLmxhYmVsJykpO1xuXHRcdGRhdGEuc291cmNlID0gdGhpcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU291cmNlV2lkZ2V0LCBleHByZXNzaW9uKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KHsgZWxlbWVudCB9OiBJVHJlZU5vZGU8UmVwbE91dHB1dEVsZW1lbnQsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElPdXRwdXRSZXBsRWxlbWVudFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHRoaXMuc2V0RWxlbWVudENvdW50KGVsZW1lbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZChlbGVtZW50Lm9uRGlkQ2hhbmdlQ291bnQoKCkgPT4gdGhpcy5zZXRFbGVtZW50Q291bnQoZWxlbWVudCwgdGVtcGxhdGVEYXRhKSkpO1xuXHRcdC8vIHZhbHVlXG5cdFx0ZG9tLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEudmFsdWUpO1xuXHRcdC8vIFJlc2V0IGNsYXNzZXMgdG8gY2xlYXIgYW5zaSBkZWNvcmF0aW9ucyBzaW5jZSB0ZW1wbGF0ZXMgYXJlIHJldXNlZFxuXHRcdHRlbXBsYXRlRGF0YS52YWx1ZS5jbGFzc05hbWUgPSAndmFsdWUnO1xuXG5cdFx0Y29uc3QgbG9jYXRpb25SZWZlcmVuY2UgPSBlbGVtZW50LmV4cHJlc3Npb24/LnZhbHVlTG9jYXRpb25SZWZlcmVuY2U7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZCh0aGlzLmV4cHJlc3Npb25SZW5kZXJlci5yZW5kZXJWYWx1ZSh0ZW1wbGF0ZURhdGEudmFsdWUsIGVsZW1lbnQudmFsdWUsIHtcblx0XHRcdHdhc0FOU0k6IHRydWUsXG5cdFx0XHRzZXNzaW9uOiBlbGVtZW50LnNlc3Npb24sXG5cdFx0XHRsb2NhdGlvblJlZmVyZW5jZSxcblx0XHRcdGhvdmVyOiBmYWxzZSxcblx0XHR9KSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEudmFsdWUuY2xhc3NMaXN0LmFkZCgoZWxlbWVudC5zZXZlcml0eSA9PT0gc2V2ZXJpdHkuV2FybmluZykgPyAnd2FybicgOiAoZWxlbWVudC5zZXZlcml0eSA9PT0gc2V2ZXJpdHkuRXJyb3IpID8gJ2Vycm9yJyA6IChlbGVtZW50LnNldmVyaXR5ID09PSBzZXZlcml0eS5JZ25vcmUpID8gJ2lnbm9yZScgOiAnaW5mbycpO1xuXHRcdHRlbXBsYXRlRGF0YS5zb3VyY2Uuc2V0U291cmNlKGVsZW1lbnQuc291cmNlRGF0YSk7XG5cdFx0dGVtcGxhdGVEYXRhLmdldFJlcGxFbGVtZW50U291cmNlID0gKCkgPT4gZWxlbWVudC5zb3VyY2VEYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRFbGVtZW50Q291bnQoZWxlbWVudDogUmVwbE91dHB1dEVsZW1lbnQsIHRlbXBsYXRlRGF0YTogSU91dHB1dFJlcGxFbGVtZW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0aWYgKGVsZW1lbnQuY291bnQgPj0gMikge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvdW50LnNldENvdW50KGVsZW1lbnQuY291bnQpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvdW50Q29udGFpbmVyLmhpZGRlbiA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY291bnRDb250YWluZXIuaGlkZGVuID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJT3V0cHV0UmVwbEVsZW1lbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuc291cmNlLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5jb3VudC5kaXNwb3NlKCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSVRyZWVOb2RlPFJlcGxPdXRwdXRFbGVtZW50LCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU91dHB1dFJlcGxFbGVtZW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlLmNsZWFyKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxWYXJpYWJsZXNSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0RXhwcmVzc2lvbnNSZW5kZXJlcjxJRXhwcmVzc2lvbiB8IFJlcGxWYXJpYWJsZUVsZW1lbnQ+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAncmVwbFZhcmlhYmxlJztcblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBSZXBsVmFyaWFibGVzUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4cHJlc3Npb25SZW5kZXJlcjogRGVidWdFeHByZXNzaW9uUmVuZGVyZXIsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGRlYnVnU2VydmljZSwgY29udGV4dFZpZXdTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElFeHByZXNzaW9uIHwgUmVwbFZhcmlhYmxlRWxlbWVudCwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCBkYXRhOiBJRXhwcmVzc2lvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHN1cGVyLnJlbmRlckV4cHJlc3Npb25FbGVtZW50KGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsVmFyaWFibGVFbGVtZW50ID8gZWxlbWVudC5leHByZXNzaW9uIDogZWxlbWVudCwgbm9kZSwgZGF0YSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyRXhwcmVzc2lvbihleHByZXNzaW9uOiBJRXhwcmVzc2lvbiB8IFJlcGxWYXJpYWJsZUVsZW1lbnQsIGRhdGE6IElFeHByZXNzaW9uVGVtcGxhdGVEYXRhLCBoaWdobGlnaHRzOiBJSGlnaGxpZ2h0W10pOiB2b2lkIHtcblx0XHRjb25zdCBpc1JlcGxWYXJpYWJsZSA9IGV4cHJlc3Npb24gaW5zdGFuY2VvZiBSZXBsVmFyaWFibGVFbGVtZW50O1xuXHRcdGlmIChpc1JlcGxWYXJpYWJsZSB8fCAhZXhwcmVzc2lvbi5uYW1lKSB7XG5cdFx0XHRkYXRhLmxhYmVsLnNldCgnJyk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGlzUmVwbFZhcmlhYmxlID8gZXhwcmVzc2lvbi5leHByZXNzaW9uIDogZXhwcmVzc2lvbjtcblx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyLnJlbmRlclZhbHVlKGRhdGEudmFsdWUsIHZhbHVlLCB7IGNvbG9yaXplOiB0cnVlLCBob3ZlcjogZmFsc2UsIHNlc3Npb246IGV4cHJlc3Npb24uZ2V0U2Vzc2lvbigpIH0pKTtcblx0XHRcdGRhdGEuZXhwcmVzc2lvbi5jbGFzc0xpc3QucmVtb3ZlKCduZXN0ZWQtdmFyaWFibGUnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5hZGQodGhpcy5leHByZXNzaW9uUmVuZGVyZXIucmVuZGVyVmFyaWFibGUoZGF0YSwgZXhwcmVzc2lvbiBhcyBWYXJpYWJsZSwgeyBzaG93Q2hhbmdlZDogdHJ1ZSwgaGlnaGxpZ2h0cyB9KSk7XG5cdFx0XHRkYXRhLmV4cHJlc3Npb24uY2xhc3NMaXN0LnRvZ2dsZSgnbmVzdGVkLXZhcmlhYmxlJywgaXNOZXN0ZWRWYXJpYWJsZShleHByZXNzaW9uKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldElucHV0Qm94T3B0aW9ucyhleHByZXNzaW9uOiBJRXhwcmVzc2lvbik6IElJbnB1dEJveE9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxSYXdPYmplY3RzUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFJhd09iamVjdFJlcGxFbGVtZW50LCBGdXp6eVNjb3JlLCBJUmF3T2JqZWN0UmVwbFRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAncmF3T2JqZWN0JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4cHJlc3Npb25SZW5kZXJlcjogRGVidWdFeHByZXNzaW9uUmVuZGVyZXIsXG5cdCkgeyB9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gUmVwbFJhd09iamVjdHNSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUmF3T2JqZWN0UmVwbFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ291dHB1dCcpO1xuXG5cdFx0Y29uc3QgZXhwcmVzc2lvbiA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcub3V0cHV0LmV4cHJlc3Npb24nKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGRvbS5hcHBlbmQoZXhwcmVzc2lvbiwgJCgnc3Bhbi5uYW1lJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gbmV3IEhpZ2hsaWdodGVkTGFiZWwobmFtZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBkb20uYXBwZW5kKGV4cHJlc3Npb24sICQoJ3NwYW4udmFsdWUnKSk7XG5cblx0XHRyZXR1cm4geyBjb250YWluZXIsIGV4cHJlc3Npb24sIG5hbWUsIGxhYmVsLCB2YWx1ZSwgZWxlbWVudFN0b3JlOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFJhd09iamVjdFJlcGxFbGVtZW50LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUmF3T2JqZWN0UmVwbFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50U3RvcmUuY2xlYXIoKTtcblxuXHRcdC8vIGtleVxuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldChlbGVtZW50Lm5hbWUgPyBgJHtlbGVtZW50Lm5hbWV9OmAgOiAnJywgY3JlYXRlTWF0Y2hlcyhub2RlLmZpbHRlckRhdGEpKTtcblx0XHRpZiAoZWxlbWVudC5uYW1lKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubmFtZS50ZXh0Q29udGVudCA9IGAke2VsZW1lbnQubmFtZX06YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSAnJztcblx0XHR9XG5cblx0XHQvLyB2YWx1ZVxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50U3RvcmUuYWRkKHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyLnJlbmRlclZhbHVlKHRlbXBsYXRlRGF0YS52YWx1ZSwgZWxlbWVudC52YWx1ZSwge1xuXHRcdFx0aG92ZXI6IGZhbHNlLFxuXHRcdFx0c2Vzc2lvbjogbm9kZS5lbGVtZW50LmdldFNlc3Npb24oKSxcblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUmF3T2JqZWN0UmVwbFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50U3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNOZXN0ZWRWYXJpYWJsZShlbGVtZW50OiBJUmVwbEVsZW1lbnQpIHtcblx0cmV0dXJuIGVsZW1lbnQgaW5zdGFuY2VvZiBWYXJpYWJsZSAmJiAoZWxlbWVudC5wYXJlbnQgaW5zdGFuY2VvZiBSZXBsRXZhbHVhdGlvblJlc3VsdCB8fCBlbGVtZW50LnBhcmVudCBpbnN0YW5jZW9mIFZhcmlhYmxlKTtcbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxEZWxlZ2F0ZSBleHRlbmRzIENhY2hlZExpc3RWaXJ0dWFsRGVsZWdhdGU8SVJlcGxFbGVtZW50PiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVwbE9wdGlvbnM6IElSZXBsT3B0aW9uc1xuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0SGVpZ2h0KGVsZW1lbnQ6IElSZXBsRWxlbWVudCk6IG51bWJlciB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKTtcblxuXHRcdGlmICghY29uZmlnLmNvbnNvbGUud29yZFdyYXApIHtcblx0XHRcdHJldHVybiB0aGlzLmVzdGltYXRlSGVpZ2h0KGVsZW1lbnQsIHRydWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5nZXRIZWlnaHQoZWxlbWVudCk7XG5cdH1cblxuXHQvKipcblx0ICogV2l0aCB3b3JkV3JhcCBlbmFibGVkLCB0aGlzIGlzIGFuIGVzdGltYXRlLiBXaXRoIHdvcmRXcmFwIGRpc2FibGVkLCB0aGlzIGlzIHRoZSByZWFsIGhlaWdodCB0aGF0IHRoZSBsaXN0IHdpbGwgdXNlLlxuXHQgKi9cblx0cHJvdGVjdGVkIGVzdGltYXRlSGVpZ2h0KGVsZW1lbnQ6IElSZXBsRWxlbWVudCwgaWdub3JlVmFsdWVMZW5ndGggPSBmYWxzZSk6IG51bWJlciB7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMucmVwbE9wdGlvbnMucmVwbENvbmZpZ3VyYXRpb24ubGluZUhlaWdodDtcblx0XHRjb25zdCBjb3VudE51bWJlck9mTGluZXMgPSAoc3RyOiBzdHJpbmcpID0+IHN0ci5tYXRjaCgvXFxuL2cpPy5sZW5ndGggPz8gMDtcblx0XHRjb25zdCBoYXNWYWx1ZSA9IChlOiBhbnkpOiBlIGlzIHsgdmFsdWU6IHN0cmluZyB9ID0+IHR5cGVvZiBlLnZhbHVlID09PSAnc3RyaW5nJztcblxuXHRcdGlmIChoYXNWYWx1ZShlbGVtZW50KSAmJiAhaXNOZXN0ZWRWYXJpYWJsZShlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBlbGVtZW50LnZhbHVlO1xuXHRcdFx0Y29uc3QgdmFsdWVSb3dzID0gY291bnROdW1iZXJPZkxpbmVzKHZhbHVlKVxuXHRcdFx0XHQrIChpZ25vcmVWYWx1ZUxlbmd0aCA/IDAgOiBNYXRoLmZsb29yKHZhbHVlLmxlbmd0aCAvIDcwKSkgLy8gTWFrZSBhbiBlc3RpbWF0ZSBmb3Igd3JhcHBpbmdcblx0XHRcdFx0KyAoZWxlbWVudCBpbnN0YW5jZW9mIFJlcGxPdXRwdXRFbGVtZW50ID8gMCA6IDEpOyAvLyBBIFNpbXBsZVJlcGxFbGVtZW50IGVuZHMgaW4gXFxuIGlmIGl0J3MgYSBjb21wbGV0ZSBsaW5lXG5cblx0XHRcdHJldHVybiBNYXRoLm1heCh2YWx1ZVJvd3MsIDEpICogbGluZUhlaWdodDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGluZUhlaWdodDtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogSVJlcGxFbGVtZW50KTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFZhcmlhYmxlIHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsVmFyaWFibGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gUmVwbFZhcmlhYmxlc1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlcGxFdmFsdWF0aW9uUmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gUmVwbEV2YWx1YXRpb25SZXN1bHRzUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgUmVwbEV2YWx1YXRpb25JbnB1dCkge1xuXHRcdFx0cmV0dXJuIFJlcGxFdmFsdWF0aW9uSW5wdXRzUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgUmVwbE91dHB1dEVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBSZXBsT3V0cHV0RWxlbWVudFJlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlcGxHcm91cCkge1xuXHRcdFx0cmV0dXJuIFJlcGxHcm91cFJlbmRlcmVyLklEO1xuXHRcdH1cblxuXHRcdHJldHVybiBSZXBsUmF3T2JqZWN0c1JlbmRlcmVyLklEO1xuXHR9XG5cblx0aGFzRHluYW1pY0hlaWdodChlbGVtZW50OiBJUmVwbEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoaXNOZXN0ZWRWYXJpYWJsZShlbGVtZW50KSkge1xuXHRcdFx0Ly8gTmVzdGVkIHZhcmlhYmxlcyBzaG91bGQgYWx3YXlzIGJlIGluIG9uZSBsaW5lICMxMTE4NDNcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gRW1wdHkgZWxlbWVudHMgc2hvdWxkIG5vdCBoYXZlIGR5bmFtaWMgaGVpZ2h0IHNpbmNlIHRoZXkgd2lsbCBiZSBpbnZpc2libGVcblx0XHRyZXR1cm4gZWxlbWVudC50b1N0cmluZygpLmxlbmd0aCA+IDA7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNEZWJ1Z1Nlc3Npb24ob2JqOiBhbnkpOiBvYmogaXMgSURlYnVnU2Vzc2lvbiB7XG5cdHJldHVybiB0eXBlb2Ygb2JqLmdldFJlcGxFbGVtZW50cyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxEYXRhU291cmNlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxJRGVidWdTZXNzaW9uLCBJUmVwbEVsZW1lbnQ+IHtcblxuXHRoYXNDaGlsZHJlbihlbGVtZW50OiBJUmVwbEVsZW1lbnQgfCBJRGVidWdTZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzRGVidWdTZXNzaW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gISEoPElFeHByZXNzaW9uQ29udGFpbmVyIHwgSU5lc3RpbmdSZXBsRWxlbWVudD5lbGVtZW50KS5oYXNDaGlsZHJlbjtcblx0fVxuXG5cdGdldENoaWxkcmVuKGVsZW1lbnQ6IElSZXBsRWxlbWVudCB8IElEZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPElSZXBsRWxlbWVudFtdPiB7XG5cdFx0aWYgKGlzRGVidWdTZXNzaW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGVsZW1lbnQuZ2V0UmVwbEVsZW1lbnRzKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKDxJRXhwcmVzc2lvbiB8IElOZXN0aW5nUmVwbEVsZW1lbnQ+ZWxlbWVudCkuZ2V0Q2hpbGRyZW4oKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlcGxBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJUmVwbEVsZW1lbnQ+IHtcblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2RlYnVnQ29uc29sZScsIFwiRGVidWcgQ29uc29sZVwiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBJUmVwbEVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVmFyaWFibGUpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncmVwbFZhcmlhYmxlQXJpYUxhYmVsJywgXCJWYXJpYWJsZSB7MH0sIHZhbHVlIHsxfVwiLCBlbGVtZW50Lm5hbWUsIGVsZW1lbnQudmFsdWUpO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlcGxPdXRwdXRFbGVtZW50IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsRXZhbHVhdGlvbklucHV0IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsRXZhbHVhdGlvblJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQudmFsdWUgKyAoZWxlbWVudCBpbnN0YW5jZW9mIFJlcGxPdXRwdXRFbGVtZW50ICYmIGVsZW1lbnQuY291bnQgPiAxID8gbG9jYWxpemUoeyBrZXk6ICdvY2N1cnJlZCcsIGNvbW1lbnQ6IFsnRnJvbnQgd2lsbCB0aGUgdmFsdWUgb2YgdGhlIGRlYnVnIGNvbnNvbGUgZWxlbWVudC4gUGxhY2Vob2xkZXIgd2lsbCBiZSByZXBsYWNlZCBieSBhIG51bWJlciB3aGljaCByZXByZXNlbnRzIG9jY3VycmFuY2UgY291bnQuJ10gfSxcblx0XHRcdFx0XCIsIG9jY3VycmVkIHswfSB0aW1lc1wiLCBlbGVtZW50LmNvdW50KSA6ICcnKTtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSYXdPYmplY3RSZXBsRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdyZXBsUmF3T2JqZWN0QXJpYUxhYmVsJywgXCJEZWJ1ZyBjb25zb2xlIHZhcmlhYmxlIHswfSwgdmFsdWUgezF9XCIsIGVsZW1lbnQubmFtZSwgZWxlbWVudC52YWx1ZSk7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgUmVwbEdyb3VwKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3JlcGxHcm91cCcsIFwiRGVidWcgY29uc29sZSBncm91cCB7MH1cIiwgZWxlbWVudC5uYW1lKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gJyc7XG5cdH1cbn1cblxuY2xhc3MgU291cmNlV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNvdXJjZT86IElSZXBsRWxlbWVudFNvdXJjZTtcblx0cHJpdmF0ZSBob3Zlcj86IElNYW5hZ2VkSG92ZXI7XG5cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc291cmNlJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbCwgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0aWYgKHRoaXMuc291cmNlKSB7XG5cdFx0XHRcdHRoaXMuc291cmNlLnNvdXJjZS5vcGVuSW5FZGl0b3IoZWRpdG9yU2VydmljZSwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogdGhpcy5zb3VyY2UubGluZU51bWJlcixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogdGhpcy5zb3VyY2UuY29sdW1uLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHRoaXMuc291cmNlLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiB0aGlzLnNvdXJjZS5jb2x1bW5cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdH1cblxuXHRwdWJsaWMgc2V0U291cmNlKHNvdXJjZT86IElSZXBsRWxlbWVudFNvdXJjZSkge1xuXHRcdHRoaXMuc291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuZWwudGV4dENvbnRlbnQgPSBzb3VyY2UgPyBgJHtiYXNlbmFtZShzb3VyY2Uuc291cmNlLm5hbWUpfToke3NvdXJjZS5saW5lTnVtYmVyfWAgOiAnJztcblxuXHRcdHRoaXMuaG92ZXIgPz89IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmVsLCAnJykpO1xuXHRcdHRoaXMuaG92ZXIudXBkYXRlKHNvdXJjZSA/IGAke3RoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHNvdXJjZS5zb3VyY2UudXJpKX06JHtzb3VyY2UubGluZU51bWJlcn1gIDogJycpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHdCQUFvQztBQUU3QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlDQUFpQztBQUcxQyxTQUFTLHFCQUFpQztBQUMxQyxTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsZ0JBQWdCO0FBQ3pCLE9BQU8sY0FBYztBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHNCQUFzQjtBQUMvQixTQUE4QixxQkFBNEk7QUFDMUssU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0IscUJBQXFCLHNCQUFzQixXQUFXLG1CQUFtQiwyQkFBMkI7QUFDbkksU0FBUyxtQ0FBOEU7QUFFdkYsU0FBUyxtQ0FBbUM7QUFFNUMsTUFBTSxJQUFJLElBQUk7QUFvQ1AsTUFBTSxnQ0FBTixNQUFNLDhCQUF5SDtBQUFBLEVBR3JJLElBQUksYUFBcUI7QUFDeEIsV0FBTyw4QkFBNkI7QUFBQSxFQUNyQztBQUFBLEVBRUEsZUFBZSxXQUEwRDtBQUN4RSxRQUFJLE9BQU8sV0FBVyxFQUFFLGVBQWUsVUFBVSxjQUFjLDJCQUEyQixDQUFDLENBQUM7QUFDNUYsVUFBTSxRQUFRLElBQUksT0FBTyxXQUFXLEVBQUUsYUFBYSxDQUFDO0FBQ3BELFVBQU0sUUFBUSxJQUFJLGlCQUFpQixLQUFLO0FBQ3hDLFdBQU8sRUFBRSxNQUFNO0FBQUEsRUFDaEI7QUFBQSxFQUVBLGNBQWMsU0FBcUQsT0FBZSxjQUFzRDtBQUN2SSxVQUFNLGFBQWEsUUFBUTtBQUMzQixpQkFBYSxNQUFNLElBQUksV0FBVyxPQUFPLGNBQWMsUUFBUSxVQUFVLENBQUM7QUFBQSxFQUMzRTtBQUFBLEVBRUEsZ0JBQWdCLGNBQXNEO0FBQ3JFLGlCQUFhLE1BQU0sUUFBUTtBQUFBLEVBQzVCO0FBQ0Q7QUF0QmEsOEJBQ0ksS0FBSztBQURmLElBQU0sK0JBQU47QUF3QkEsSUFBTSxvQkFBTixNQUFnRztBQUFBLEVBR3RHLFlBQ2tCLG9CQUN1QixjQUN2QztBQUZnQjtBQUN1QjtBQUFBLEVBQ3JDO0FBQUEsRUFFSixJQUFJLGFBQXFCO0FBQ3hCLFdBQU8sa0JBQWtCO0FBQUEsRUFDMUI7QUFBQSxFQUVBLGVBQWUsV0FBZ0Q7QUFDOUQsY0FBVSxVQUFVLElBQUksT0FBTztBQUMvQixVQUFNLGFBQWEsSUFBSSxPQUFPLFdBQVcsRUFBRSxxQ0FBcUMsQ0FBQztBQUNqRixVQUFNLFFBQVEsSUFBSSxPQUFPLFlBQVksRUFBRSxZQUFZLENBQUM7QUFDcEQsVUFBTSxTQUFTLEtBQUssYUFBYSxlQUFlLGNBQWMsVUFBVTtBQUN4RSxXQUFPLEVBQUUsT0FBTyxPQUFPO0FBQUEsRUFDeEI7QUFBQSxFQUVBLGNBQWMsU0FBMkMsUUFBZ0IsY0FBNEM7QUFFcEgsaUJBQWEsbUJBQW1CLFFBQVE7QUFDeEMsVUFBTSxZQUFZLFFBQVE7QUFDMUIsUUFBSSxVQUFVLGFBQWEsS0FBSztBQUNoQyxpQkFBYSxvQkFBb0IsS0FBSyxtQkFBbUIsWUFBWSxhQUFhLE9BQU8sVUFBVSxNQUFNLEVBQUUsU0FBUyxNQUFNLFNBQVMsUUFBUSxRQUFRLFFBQVEsQ0FBQztBQUM1SixpQkFBYSxPQUFPLFVBQVUsVUFBVSxVQUFVO0FBQUEsRUFDbkQ7QUFBQSxFQUVBLGdCQUFnQixjQUE0QztBQUMzRCxpQkFBYSxtQkFBbUIsUUFBUTtBQUN4QyxpQkFBYSxPQUFPLFFBQVE7QUFBQSxFQUM3QjtBQUNEO0FBakNhLGtCQUNJLEtBQUs7QUFEVCxvQkFBTjtBQUFBLEVBS0o7QUFBQSxHQUxVO0FBbUNOLE1BQU0saUNBQU4sTUFBTSwrQkFBdUk7QUFBQSxFQU9uSixZQUNrQixvQkFDaEI7QUFEZ0I7QUFBQSxFQUNkO0FBQUEsRUFOSixJQUFJLGFBQXFCO0FBQ3hCLFdBQU8sK0JBQThCO0FBQUEsRUFDdEM7QUFBQSxFQU1BLGVBQWUsV0FBMkQ7QUFDekUsVUFBTSxTQUFTLElBQUksT0FBTyxXQUFXLEVBQUUsK0JBQStCLENBQUM7QUFDdkUsVUFBTSxRQUFRLElBQUksT0FBTyxRQUFRLEVBQUUsWUFBWSxDQUFDO0FBRWhELFdBQU8sRUFBRSxPQUFPLGNBQWMsSUFBSSxnQkFBZ0IsRUFBRTtBQUFBLEVBQ3JEO0FBQUEsRUFFQSxjQUFjLFNBQWlFLE9BQWUsY0FBdUQ7QUFDcEosaUJBQWEsYUFBYSxNQUFNO0FBQ2hDLFVBQU0sYUFBYSxRQUFRO0FBQzNCLGlCQUFhLGFBQWEsSUFBSSxLQUFLLG1CQUFtQixZQUFZLGFBQWEsT0FBTyxZQUFZO0FBQUEsTUFDakcsVUFBVTtBQUFBLE1BQ1YsT0FBTztBQUFBLE1BQ1AsU0FBUyxRQUFRLFFBQVEsV0FBVztBQUFBLElBQ3JDLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLGdCQUFnQixjQUF1RDtBQUN0RSxpQkFBYSxhQUFhLFFBQVE7QUFBQSxFQUNuQztBQUNEO0FBL0JhLCtCQUNJLEtBQUs7QUFEZixJQUFNLGdDQUFOO0FBaUNBLElBQU0sNEJBQU4sTUFBd0g7QUFBQSxFQUc5SCxZQUNrQixvQkFDdUIsY0FDdkM7QUFGZ0I7QUFDdUI7QUFBQSxFQUNyQztBQUFBLEVBRUosSUFBSSxhQUFxQjtBQUN4QixXQUFPLDBCQUEwQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxlQUFlLFdBQXdEO0FBQ3RFLFVBQU0sT0FBdUMsdUJBQU8sT0FBTyxJQUFJO0FBQy9ELGNBQVUsVUFBVSxJQUFJLFFBQVE7QUFDaEMsVUFBTSxhQUFhLElBQUksT0FBTyxXQUFXLEVBQUUscUNBQXFDLENBQUM7QUFFakYsU0FBSyxZQUFZO0FBQ2pCLFNBQUssaUJBQWlCLElBQUksT0FBTyxZQUFZLEVBQUUsc0JBQXNCLENBQUM7QUFDdEUsU0FBSyxRQUFRLElBQUksV0FBVyxLQUFLLGdCQUFnQixDQUFDLEdBQUcsdUJBQXVCO0FBQzVFLFNBQUssUUFBUSxJQUFJLE9BQU8sWUFBWSxFQUFFLGtCQUFrQixDQUFDO0FBQ3pELFNBQUssU0FBUyxLQUFLLGFBQWEsZUFBZSxjQUFjLFVBQVU7QUFDdkUsU0FBSyxvQkFBb0IsSUFBSSxnQkFBZ0I7QUFFN0MsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGNBQWMsRUFBRSxRQUFRLEdBQTZDLE9BQWUsY0FBb0Q7QUFDdkksaUJBQWEsa0JBQWtCLE1BQU07QUFDckMsU0FBSyxnQkFBZ0IsU0FBUyxZQUFZO0FBQzFDLGlCQUFhLGtCQUFrQixJQUFJLFFBQVEsaUJBQWlCLE1BQU0sS0FBSyxnQkFBZ0IsU0FBUyxZQUFZLENBQUMsQ0FBQztBQUU5RyxRQUFJLFVBQVUsYUFBYSxLQUFLO0FBRWhDLGlCQUFhLE1BQU0sWUFBWTtBQUUvQixVQUFNLG9CQUFvQixRQUFRLFlBQVk7QUFDOUMsaUJBQWEsa0JBQWtCLElBQUksS0FBSyxtQkFBbUIsWUFBWSxhQUFhLE9BQU8sUUFBUSxPQUFPO0FBQUEsTUFDekcsU0FBUztBQUFBLE1BQ1QsU0FBUyxRQUFRO0FBQUEsTUFDakI7QUFBQSxNQUNBLE9BQU87QUFBQSxJQUNSLENBQUMsQ0FBQztBQUVGLGlCQUFhLE1BQU0sVUFBVSxJQUFLLFFBQVEsYUFBYSxTQUFTLFVBQVcsU0FBVSxRQUFRLGFBQWEsU0FBUyxRQUFTLFVBQVcsUUFBUSxhQUFhLFNBQVMsU0FBVSxXQUFXLE1BQU07QUFDaE0saUJBQWEsT0FBTyxVQUFVLFFBQVEsVUFBVTtBQUNoRCxpQkFBYSx1QkFBdUIsTUFBTSxRQUFRO0FBQUEsRUFDbkQ7QUFBQSxFQUVRLGdCQUFnQixTQUE0QixjQUFvRDtBQUN2RyxRQUFJLFFBQVEsU0FBUyxHQUFHO0FBQ3ZCLG1CQUFhLE1BQU0sU0FBUyxRQUFRLEtBQUs7QUFDekMsbUJBQWEsZUFBZSxTQUFTO0FBQUEsSUFDdEMsT0FBTztBQUNOLG1CQUFhLGVBQWUsU0FBUztBQUFBLElBQ3RDO0FBQUEsRUFDRDtBQUFBLEVBRUEsZ0JBQWdCLGNBQW9EO0FBQ25FLGlCQUFhLE9BQU8sUUFBUTtBQUM1QixpQkFBYSxrQkFBa0IsUUFBUTtBQUN2QyxpQkFBYSxNQUFNLFFBQVE7QUFBQSxFQUM1QjtBQUFBLEVBRUEsZUFBZSxVQUFvRCxRQUFnQixjQUFvRDtBQUN0SSxpQkFBYSxrQkFBa0IsTUFBTTtBQUFBLEVBQ3RDO0FBQ0Q7QUFuRWEsMEJBQ0ksS0FBSztBQURULDRCQUFOO0FBQUEsRUFLSjtBQUFBLEdBTFU7QUFxRU4sSUFBTSx3QkFBTixjQUFvQyw0QkFBK0Q7QUFBQSxFQVF6RyxZQUNrQixvQkFDRixjQUNNLG9CQUNOLGNBQ2Q7QUFDRCxVQUFNLGNBQWMsb0JBQW9CLFlBQVk7QUFMbkM7QUFBQSxFQU1sQjtBQUFBLEVBWEEsSUFBSSxhQUFxQjtBQUN4QixXQUFPLHNCQUFzQjtBQUFBLEVBQzlCO0FBQUEsRUFXTyxjQUFjLE1BQWdFLFFBQWdCLE1BQXFDO0FBQ3pJLFVBQU0sVUFBVSxLQUFLO0FBQ3JCLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsVUFBTSx3QkFBd0IsbUJBQW1CLHNCQUFzQixRQUFRLGFBQWEsU0FBUyxNQUFNLElBQUk7QUFBQSxFQUNoSDtBQUFBLEVBRVUsaUJBQWlCLFlBQStDLE1BQStCLFlBQWdDO0FBQ3hJLFVBQU0saUJBQWlCLHNCQUFzQjtBQUM3QyxRQUFJLGtCQUFrQixDQUFDLFdBQVcsTUFBTTtBQUN2QyxXQUFLLE1BQU0sSUFBSSxFQUFFO0FBQ2pCLFlBQU0sUUFBUSxpQkFBaUIsV0FBVyxhQUFhO0FBQ3ZELFdBQUssa0JBQWtCLElBQUksS0FBSyxtQkFBbUIsWUFBWSxLQUFLLE9BQU8sT0FBTyxFQUFFLFVBQVUsTUFBTSxPQUFPLE9BQU8sU0FBUyxXQUFXLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFDckosV0FBSyxXQUFXLFVBQVUsT0FBTyxpQkFBaUI7QUFBQSxJQUNuRCxPQUFPO0FBQ04sV0FBSyxrQkFBa0IsSUFBSSxLQUFLLG1CQUFtQixlQUFlLE1BQU0sWUFBd0IsRUFBRSxhQUFhLE1BQU0sV0FBVyxDQUFDLENBQUM7QUFDbEksV0FBSyxXQUFXLFVBQVUsT0FBTyxtQkFBbUIsaUJBQWlCLFVBQVUsQ0FBQztBQUFBLElBQ2pGO0FBQUEsRUFDRDtBQUFBLEVBRVUsbUJBQW1CLFlBQXVEO0FBQ25GLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF2Q2Esc0JBRUksS0FBSztBQUZULHdCQUFOO0FBQUEsRUFVSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTtBQXlDTixNQUFNLDBCQUFOLE1BQU0sd0JBQThHO0FBQUEsRUFHMUgsWUFDa0Isb0JBQ2hCO0FBRGdCO0FBQUEsRUFDZDtBQUFBLEVBRUosSUFBSSxhQUFxQjtBQUN4QixXQUFPLHdCQUF1QjtBQUFBLEVBQy9CO0FBQUEsRUFFQSxlQUFlLFdBQW9EO0FBQ2xFLGNBQVUsVUFBVSxJQUFJLFFBQVE7QUFFaEMsVUFBTSxhQUFhLElBQUksT0FBTyxXQUFXLEVBQUUsb0JBQW9CLENBQUM7QUFDaEUsVUFBTSxPQUFPLElBQUksT0FBTyxZQUFZLEVBQUUsV0FBVyxDQUFDO0FBQ2xELFVBQU0sUUFBUSxJQUFJLGlCQUFpQixJQUFJO0FBQ3ZDLFVBQU0sUUFBUSxJQUFJLE9BQU8sWUFBWSxFQUFFLFlBQVksQ0FBQztBQUVwRCxXQUFPLEVBQUUsV0FBVyxZQUFZLE1BQU0sT0FBTyxPQUFPLGNBQWMsSUFBSSxnQkFBZ0IsRUFBRTtBQUFBLEVBQ3pGO0FBQUEsRUFFQSxjQUFjLE1BQW1ELE9BQWUsY0FBZ0Q7QUFDL0gsaUJBQWEsYUFBYSxNQUFNO0FBR2hDLFVBQU0sVUFBVSxLQUFLO0FBQ3JCLGlCQUFhLE1BQU0sSUFBSSxRQUFRLE9BQU8sR0FBRyxRQUFRLElBQUksTUFBTSxJQUFJLGNBQWMsS0FBSyxVQUFVLENBQUM7QUFDN0YsUUFBSSxRQUFRLE1BQU07QUFDakIsbUJBQWEsS0FBSyxjQUFjLEdBQUcsUUFBUSxJQUFJO0FBQUEsSUFDaEQsT0FBTztBQUNOLG1CQUFhLEtBQUssY0FBYztBQUFBLElBQ2pDO0FBR0EsaUJBQWEsYUFBYSxJQUFJLEtBQUssbUJBQW1CLFlBQVksYUFBYSxPQUFPLFFBQVEsT0FBTztBQUFBLE1BQ3BHLE9BQU87QUFBQSxNQUNQLFNBQVMsS0FBSyxRQUFRLFdBQVc7QUFBQSxJQUNsQyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxnQkFBZ0IsY0FBZ0Q7QUFDL0QsaUJBQWEsYUFBYSxRQUFRO0FBQ2xDLGlCQUFhLE1BQU0sUUFBUTtBQUFBLEVBQzVCO0FBQ0Q7QUE3Q2Esd0JBQ0ksS0FBSztBQURmLElBQU0seUJBQU47QUErQ1AsU0FBUyxpQkFBaUIsU0FBdUI7QUFDaEQsU0FBTyxtQkFBbUIsYUFBYSxRQUFRLGtCQUFrQix3QkFBd0IsUUFBUSxrQkFBa0I7QUFDcEg7QUFFTyxNQUFNLHFCQUFxQiwwQkFBd0M7QUFBQSxFQUV6RSxZQUNrQixzQkFDQSxhQUNoQjtBQUNELFVBQU07QUFIVztBQUNBO0FBQUEsRUFHbEI7QUFBQSxFQUVTLFVBQVUsU0FBK0I7QUFDakQsVUFBTSxTQUFTLEtBQUsscUJBQXFCLFNBQThCLE9BQU87QUFFOUUsUUFBSSxDQUFDLE9BQU8sUUFBUSxVQUFVO0FBQzdCLGFBQU8sS0FBSyxlQUFlLFNBQVMsSUFBSTtBQUFBLElBQ3pDO0FBRUEsV0FBTyxNQUFNLFVBQVUsT0FBTztBQUFBLEVBQy9CO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLVSxlQUFlLFNBQXVCLG9CQUFvQixPQUFlO0FBQ2xGLFVBQU0sYUFBYSxLQUFLLFlBQVksa0JBQWtCO0FBQ3RELFVBQU0scUJBQXFCLENBQUMsUUFBZ0IsSUFBSSxNQUFNLEtBQUssR0FBRyxVQUFVO0FBQ3hFLFVBQU0sV0FBVyxDQUFDLE1BQW1DLE9BQU8sRUFBRSxVQUFVO0FBRXhFLFFBQUksU0FBUyxPQUFPLEtBQUssQ0FBQyxpQkFBaUIsT0FBTyxHQUFHO0FBQ3BELFlBQU0sUUFBUSxRQUFRO0FBQ3RCLFlBQU0sWUFBWSxtQkFBbUIsS0FBSyxLQUN0QyxvQkFBb0IsSUFBSSxLQUFLLE1BQU0sTUFBTSxTQUFTLEVBQUUsTUFDcEQsbUJBQW1CLG9CQUFvQixJQUFJO0FBRS9DLGFBQU8sS0FBSyxJQUFJLFdBQVcsQ0FBQyxJQUFJO0FBQUEsSUFDakM7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBYyxTQUErQjtBQUM1QyxRQUFJLG1CQUFtQixZQUFZLG1CQUFtQixxQkFBcUI7QUFDMUUsYUFBTyxzQkFBc0I7QUFBQSxJQUM5QjtBQUNBLFFBQUksbUJBQW1CLHNCQUFzQjtBQUM1QyxhQUFPLDhCQUE4QjtBQUFBLElBQ3RDO0FBQ0EsUUFBSSxtQkFBbUIscUJBQXFCO0FBQzNDLGFBQU8sNkJBQTZCO0FBQUEsSUFDckM7QUFDQSxRQUFJLG1CQUFtQixtQkFBbUI7QUFDekMsYUFBTywwQkFBMEI7QUFBQSxJQUNsQztBQUNBLFFBQUksbUJBQW1CLFdBQVc7QUFDakMsYUFBTyxrQkFBa0I7QUFBQSxJQUMxQjtBQUVBLFdBQU8sdUJBQXVCO0FBQUEsRUFDL0I7QUFBQSxFQUVBLGlCQUFpQixTQUFnQztBQUNoRCxRQUFJLGlCQUFpQixPQUFPLEdBQUc7QUFFOUIsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLFFBQVEsU0FBUyxFQUFFLFNBQVM7QUFBQSxFQUNwQztBQUNEO0FBRUEsU0FBUyxlQUFlLEtBQWdDO0FBQ3ZELFNBQU8sT0FBTyxJQUFJLG9CQUFvQjtBQUN2QztBQUVPLE1BQU0sZUFBd0U7QUFBQSxFQUVwRixZQUFZLFNBQWdEO0FBQzNELFFBQUksZUFBZSxPQUFPLEdBQUc7QUFDNUIsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLENBQUMsQ0FBOEMsUUFBUztBQUFBLEVBQ2hFO0FBQUEsRUFFQSxZQUFZLFNBQWdFO0FBQzNFLFFBQUksZUFBZSxPQUFPLEdBQUc7QUFDNUIsYUFBTyxRQUFRLFFBQVEsUUFBUSxnQkFBZ0IsQ0FBQztBQUFBLElBQ2pEO0FBRUEsV0FBTyxRQUFRLFFBQTRDLFFBQVMsWUFBWSxDQUFDO0FBQUEsRUFDbEY7QUFDRDtBQUVPLE1BQU0sMEJBQThFO0FBQUEsRUFFMUYscUJBQTZCO0FBQzVCLFdBQU8sU0FBUyxnQkFBZ0IsZUFBZTtBQUFBLEVBQ2hEO0FBQUEsRUFFQSxhQUFhLFNBQStCO0FBQzNDLFFBQUksbUJBQW1CLFVBQVU7QUFDaEMsYUFBTyxTQUFTLHlCQUF5QiwyQkFBMkIsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLElBQ2hHO0FBQ0EsUUFBSSxtQkFBbUIscUJBQXFCLG1CQUFtQix1QkFBdUIsbUJBQW1CLHNCQUFzQjtBQUM5SCxhQUFPLFFBQVEsU0FBUyxtQkFBbUIscUJBQXFCLFFBQVEsUUFBUSxJQUFJO0FBQUEsUUFBUyxFQUFFLEtBQUssWUFBWSxTQUFTLENBQUMsZ0lBQWdJLEVBQUU7QUFBQSxRQUMzUDtBQUFBLFFBQXdCLFFBQVE7QUFBQSxNQUFLLElBQUk7QUFBQSxJQUMzQztBQUNBLFFBQUksbUJBQW1CLHNCQUFzQjtBQUM1QyxhQUFPLFNBQVMsMEJBQTBCLHlDQUF5QyxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsSUFDL0c7QUFDQSxRQUFJLG1CQUFtQixXQUFXO0FBQ2pDLGFBQU8sU0FBUyxhQUFhLDJCQUEyQixRQUFRLElBQUk7QUFBQSxJQUNyRTtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxJQUFNLGVBQU4sY0FBMkIsV0FBVztBQUFBLEVBS3JDLFlBQVksV0FDSyxlQUNnQixjQUNBLGNBQy9CO0FBQ0QsVUFBTTtBQUgwQjtBQUNBO0FBR2hDLFNBQUssS0FBSyxJQUFJLE9BQU8sV0FBVyxFQUFFLFNBQVMsQ0FBQztBQUM1QyxTQUFLLFVBQVUsSUFBSSxzQkFBc0IsS0FBSyxJQUFJLFNBQVMsT0FBSztBQUMvRCxRQUFFLGVBQWU7QUFDakIsUUFBRSxnQkFBZ0I7QUFDbEIsVUFBSSxLQUFLLFFBQVE7QUFDaEIsYUFBSyxPQUFPLE9BQU8sYUFBYSxlQUFlO0FBQUEsVUFDOUMsaUJBQWlCLEtBQUssT0FBTztBQUFBLFVBQzdCLGFBQWEsS0FBSyxPQUFPO0FBQUEsVUFDekIsZUFBZSxLQUFLLE9BQU87QUFBQSxVQUMzQixXQUFXLEtBQUssT0FBTztBQUFBLFFBQ3hCLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUVIO0FBQUEsRUFFTyxVQUFVLFFBQTZCO0FBQzdDLFNBQUssU0FBUztBQUNkLFNBQUssR0FBRyxjQUFjLFNBQVMsR0FBRyxTQUFTLE9BQU8sT0FBTyxJQUFJLENBQUMsSUFBSSxPQUFPLFVBQVUsS0FBSztBQUV4RixTQUFLLFVBQVUsS0FBSyxVQUFVLEtBQUssYUFBYSxrQkFBa0Isd0JBQXdCLE9BQU8sR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO0FBQ2hILFNBQUssTUFBTSxPQUFPLFNBQVMsR0FBRyxLQUFLLGFBQWEsWUFBWSxPQUFPLE9BQU8sR0FBRyxDQUFDLElBQUksT0FBTyxVQUFVLEtBQUssRUFBRTtBQUFBLEVBQzNHO0FBQ0Q7QUFsQ00sZUFBTjtBQUFBLEVBTUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUkc7IiwKICAibmFtZXMiOiBbXQp9Cg==
