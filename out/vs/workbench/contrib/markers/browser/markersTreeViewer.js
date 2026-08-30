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
import * as paths from "../../../../base/common/path.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { ResourceMarkers, Marker, RelatedInformation, MarkerTableItem } from "./markersModel.js";
import Messages from "./messages.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { dispose, Disposable, toDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { QuickFixAction, QuickFixActionViewItem } from "./markersViewActions.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { basename, isEqual } from "../../../../base/common/resources.js";
import { TreeVisibility } from "../../../../base/browser/ui/tree/tree.js";
import { FilterOptions } from "./markersFilterOptions.js";
import { Emitter } from "../../../../base/common/event.js";
import { isUndefinedOrNull } from "../../../../base/common/types.js";
import { Action, toAction } from "../../../../base/common/actions.js";
import { localize } from "../../../../nls.js";
import { createCancelablePromise, Delayer } from "../../../../base/common/async.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { Range } from "../../../../editor/common/core/range.js";
import { applyCodeAction, ApplyCodeActionReason, getCodeActions } from "../../../../editor/contrib/codeAction/browser/codeAction.js";
import { CodeActionKind, CodeActionTriggerSource } from "../../../../editor/contrib/codeAction/common/types.js";
import { IEditorService, ACTIVE_GROUP } from "../../../services/editor/common/editorService.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { CodeActionTriggerType } from "../../../../editor/common/languages.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { MarkersContextKeys, MarkersViewMode } from "../common/markers.js";
import { unsupportedSchemas } from "../../../../platform/markers/common/markerService.js";
import { defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import Severity from "../../../../base/common/severity.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
let MarkersWidgetAccessibilityProvider = class {
  constructor(labelService) {
    this.labelService = labelService;
  }
  getWidgetAriaLabel() {
    return localize("problemsView", "Problems View");
  }
  getAriaLabel(element) {
    if (element instanceof ResourceMarkers) {
      const path = this.labelService.getUriLabel(element.resource, { relative: true }) || element.resource.fsPath;
      return Messages.MARKERS_TREE_ARIA_LABEL_RESOURCE(element.markers.length, element.name, paths.dirname(path));
    }
    if (element instanceof Marker || element instanceof MarkerTableItem) {
      return Messages.MARKERS_TREE_ARIA_LABEL_MARKER(element);
    }
    if (element instanceof RelatedInformation) {
      return Messages.MARKERS_TREE_ARIA_LABEL_RELATED_INFORMATION(element.raw);
    }
    return null;
  }
};
MarkersWidgetAccessibilityProvider = __decorateClass([
  __decorateParam(0, ILabelService)
], MarkersWidgetAccessibilityProvider);
var TemplateId = /* @__PURE__ */ ((TemplateId2) => {
  TemplateId2["ResourceMarkers"] = "rm";
  TemplateId2["Marker"] = "m";
  TemplateId2["RelatedInformation"] = "ri";
  return TemplateId2;
})(TemplateId || {});
const _VirtualDelegate = class _VirtualDelegate {
  constructor(markersViewState) {
    this.markersViewState = markersViewState;
  }
  getHeight(element) {
    if (element instanceof Marker) {
      const viewModel = this.markersViewState.getViewModel(element);
      const noOfLines = !viewModel || viewModel.multiline ? element.lines.length : 1;
      return noOfLines * _VirtualDelegate.LINE_HEIGHT;
    }
    return _VirtualDelegate.LINE_HEIGHT;
  }
  getTemplateId(element) {
    if (element instanceof ResourceMarkers) {
      return "rm" /* ResourceMarkers */;
    } else if (element instanceof Marker) {
      return "m" /* Marker */;
    } else {
      return "ri" /* RelatedInformation */;
    }
  }
};
_VirtualDelegate.LINE_HEIGHT = 22;
let VirtualDelegate = _VirtualDelegate;
var FilterDataType = /* @__PURE__ */ ((FilterDataType2) => {
  FilterDataType2[FilterDataType2["ResourceMarkers"] = 0] = "ResourceMarkers";
  FilterDataType2[FilterDataType2["Marker"] = 1] = "Marker";
  FilterDataType2[FilterDataType2["RelatedInformation"] = 2] = "RelatedInformation";
  return FilterDataType2;
})(FilterDataType || {});
class ResourceMarkersRenderer {
  constructor(labels, onDidChangeRenderNodeCount) {
    this.labels = labels;
    this.renderedNodes = /* @__PURE__ */ new Map();
    this.disposables = new DisposableStore();
    this.templateId = "rm" /* ResourceMarkers */;
    onDidChangeRenderNodeCount(this.onDidChangeRenderNodeCount, this, this.disposables);
  }
  renderTemplate(container) {
    const resourceLabelContainer = dom.append(container, dom.$(".resource-label-container"));
    const resourceLabel = this.labels.create(resourceLabelContainer, { supportHighlights: true });
    const badgeWrapper = dom.append(container, dom.$(".count-badge-wrapper"));
    const count = new CountBadge(badgeWrapper, {}, defaultCountBadgeStyles);
    return { count, resourceLabel };
  }
  renderElement(node, _, templateData) {
    const resourceMarkers = node.element;
    const uriMatches = node.filterData && node.filterData.uriMatches || [];
    templateData.resourceLabel.setFile(resourceMarkers.resource, { matches: uriMatches });
    this.updateCount(node, templateData);
    const nodeRenders = this.renderedNodes.get(resourceMarkers) ?? [];
    this.renderedNodes.set(resourceMarkers, [...nodeRenders, templateData]);
  }
  disposeElement(node, index, templateData) {
    const nodeRenders = this.renderedNodes.get(node.element) ?? [];
    const nodeRenderIndex = nodeRenders.findIndex((nodeRender) => templateData === nodeRender);
    if (nodeRenderIndex < 0) {
      throw new Error("Disposing unknown resource marker");
    }
    if (nodeRenders.length === 1) {
      this.renderedNodes.delete(node.element);
    } else {
      nodeRenders.splice(nodeRenderIndex, 1);
    }
  }
  disposeTemplate(templateData) {
    templateData.resourceLabel.dispose();
    templateData.count.dispose();
  }
  onDidChangeRenderNodeCount(node) {
    const nodeRenders = this.renderedNodes.get(node.element);
    if (!nodeRenders) {
      return;
    }
    nodeRenders.forEach((nodeRender) => this.updateCount(node, nodeRender));
  }
  updateCount(node, templateData) {
    templateData.count.setCount(node.children.reduce((r, n) => r + (n.visible ? 1 : 0), 0));
  }
  dispose() {
    this.disposables.dispose();
  }
}
class FileResourceMarkersRenderer extends ResourceMarkersRenderer {
}
let MarkerRenderer = class {
  constructor(markersViewState, hoverService, instantiationService, openerService) {
    this.markersViewState = markersViewState;
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.templateId = "m" /* Marker */;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.markerWidget = new MarkerWidget(container, this.markersViewState, this.hoverService, this.openerService, this.instantiationService);
    return data;
  }
  renderElement(node, _, templateData) {
    templateData.markerWidget.render(node.element, node.filterData);
  }
  disposeTemplate(templateData) {
    templateData.markerWidget.dispose();
  }
};
MarkerRenderer = __decorateClass([
  __decorateParam(1, IHoverService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IOpenerService)
], MarkerRenderer);
const expandedIcon = registerIcon("markers-view-multi-line-expanded", Codicon.chevronUp, localize("expandedIcon", "Icon indicating that multiple lines are shown in the markers view."));
const collapsedIcon = registerIcon("markers-view-multi-line-collapsed", Codicon.chevronDown, localize("collapsedIcon", "Icon indicating that multiple lines are collapsed in the markers view."));
const toggleMultilineAction = "problems.action.toggleMultiline";
class ToggleMultilineActionViewItem extends ActionViewItem {
  render(container) {
    super.render(container);
    this.updateExpandedAttribute();
  }
  updateClass() {
    super.updateClass();
    this.updateExpandedAttribute();
  }
  updateExpandedAttribute() {
    this.element?.setAttribute("aria-expanded", `${this._action.class === ThemeIcon.asClassName(expandedIcon)}`);
  }
}
class MarkerWidget extends Disposable {
  constructor(parent, markersViewModel, _hoverService, _openerService, _instantiationService) {
    super();
    this.parent = parent;
    this.markersViewModel = markersViewModel;
    this._hoverService = _hoverService;
    this._openerService = _openerService;
    this.disposables = this._register(new DisposableStore());
    this.actionBar = this._register(new ActionBar(dom.append(parent, dom.$(".actions")), {
      actionViewItemProvider: (action, options) => action.id === QuickFixAction.ID ? _instantiationService.createInstance(QuickFixActionViewItem, action, options) : void 0
    }));
    this.iconContainer = dom.append(parent, dom.$(""));
    this.icon = dom.append(this.iconContainer, dom.$(""));
    this.messageAndDetailsContainer = dom.append(parent, dom.$(".marker-message-details-container"));
    this.messageAndDetailsContainerHover = this._register(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.messageAndDetailsContainer, ""));
  }
  render(element, filterData) {
    this.actionBar.clear();
    this.disposables.clear();
    dom.clearNode(this.messageAndDetailsContainer);
    this.iconContainer.className = `marker-icon ${Severity.toString(MarkerSeverity.toSeverity(element.marker.severity))}`;
    this.icon.className = `codicon ${SeverityIcon.className(MarkerSeverity.toSeverity(element.marker.severity))}`;
    this.renderQuickfixActionbar(element);
    this.renderMessageAndDetails(element, filterData);
    this.disposables.add(dom.addDisposableListener(this.parent, dom.EventType.MOUSE_OVER, () => this.markersViewModel.onMarkerMouseHover(element)));
    this.disposables.add(dom.addDisposableListener(this.parent, dom.EventType.MOUSE_LEAVE, () => this.markersViewModel.onMarkerMouseLeave(element)));
  }
  renderQuickfixActionbar(marker) {
    const viewModel = this.markersViewModel.getViewModel(marker);
    if (viewModel) {
      const quickFixAction = viewModel.quickFixAction;
      this.actionBar.push([quickFixAction], { icon: true, label: false });
      this.iconContainer.classList.toggle("quickFix", quickFixAction.enabled);
      quickFixAction.onDidChange(({ enabled }) => {
        if (!isUndefinedOrNull(enabled)) {
          this.iconContainer.classList.toggle("quickFix", enabled);
        }
      }, this, this.disposables);
      quickFixAction.onShowQuickFixes(() => {
        const quickFixActionViewItem = this.actionBar.viewItems[0];
        if (quickFixActionViewItem) {
          quickFixActionViewItem.showQuickFixes();
        }
      }, this, this.disposables);
    }
  }
  renderMultilineActionbar(marker, parent) {
    const multilineActionbar = this.disposables.add(new ActionBar(dom.append(parent, dom.$(".multiline-actions")), {
      actionViewItemProvider: (action2, options) => {
        if (action2.id === toggleMultilineAction) {
          return new ToggleMultilineActionViewItem(void 0, action2, { ...options, icon: true });
        }
        return void 0;
      }
    }));
    this.disposables.add(multilineActionbar);
    const viewModel = this.markersViewModel.getViewModel(marker);
    const multiline = viewModel && viewModel.multiline;
    const action = this.disposables.add(new Action(toggleMultilineAction));
    action.enabled = !!viewModel && marker.lines.length > 1;
    action.tooltip = multiline ? localize("single line", "Show message in single line") : localize("multi line", "Show message in multiple lines");
    action.class = ThemeIcon.asClassName(multiline ? expandedIcon : collapsedIcon);
    action.run = () => {
      if (viewModel) {
        viewModel.multiline = !viewModel.multiline;
      }
      return Promise.resolve();
    };
    multilineActionbar.push([action], { icon: true, label: false });
  }
  renderMessageAndDetails(element, filterData) {
    const { marker, lines } = element;
    const viewState = this.markersViewModel.getViewModel(element);
    const multiline = !viewState || viewState.multiline;
    const lineMatches = filterData && filterData.lineMatches || [];
    this.messageAndDetailsContainerHover.update(element.marker.message);
    const lineElements = [];
    for (let index = 0; index < (multiline ? lines.length : 1); index++) {
      const lineElement = dom.append(this.messageAndDetailsContainer, dom.$(".marker-message-line"));
      const messageElement = dom.append(lineElement, dom.$(".marker-message"));
      const highlightedLabel = this.disposables.add(new HighlightedLabel(messageElement));
      highlightedLabel.set(lines[index].length > 1e3 ? `${lines[index].substring(0, 1e3)}...` : lines[index], lineMatches[index]);
      if (lines[index] === "") {
        lineElement.style.height = `${VirtualDelegate.LINE_HEIGHT}px`;
      }
      lineElements.push(lineElement);
    }
    this.renderDetails(marker, filterData, lineElements[0]);
    this.renderMultilineActionbar(element, lineElements[0]);
  }
  renderDetails(marker, filterData, parent) {
    parent.classList.add("details-container");
    if (marker.source || marker.code) {
      const source = this.disposables.add(new HighlightedLabel(dom.append(parent, dom.$(".marker-source"))));
      const sourceMatches = filterData && filterData.sourceMatches || [];
      source.set(marker.source, sourceMatches);
      if (marker.code) {
        if (typeof marker.code === "string") {
          const code = this.disposables.add(new HighlightedLabel(dom.append(parent, dom.$(".marker-code"))));
          const codeMatches = filterData && filterData.codeMatches || [];
          code.set(marker.code, codeMatches);
        } else {
          const container = dom.$(".marker-code");
          const code = this.disposables.add(new HighlightedLabel(container));
          const link = marker.code.target.toString(true);
          this.disposables.add(new Link(parent, { href: link, label: container, title: link }, void 0, this._hoverService, this._openerService));
          const codeMatches = filterData && filterData.codeMatches || [];
          code.set(marker.code.value, codeMatches);
        }
      }
    }
    const lnCol = dom.append(parent, dom.$("span.marker-line"));
    lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(marker.startLineNumber, marker.startColumn);
  }
}
let RelatedInformationRenderer = class {
  constructor(labelService) {
    this.labelService = labelService;
    this.templateId = "ri" /* RelatedInformation */;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    dom.append(container, dom.$(".actions"));
    dom.append(container, dom.$(".icon"));
    data.resourceLabel = new HighlightedLabel(dom.append(container, dom.$(".related-info-resource")));
    data.lnCol = dom.append(container, dom.$("span.marker-line"));
    const separator = dom.append(container, dom.$("span.related-info-resource-separator"));
    separator.textContent = ":";
    separator.style.paddingRight = "4px";
    data.description = new HighlightedLabel(dom.append(container, dom.$(".marker-description")));
    return data;
  }
  renderElement(node, _, templateData) {
    const relatedInformation = node.element.raw;
    const uriMatches = node.filterData && node.filterData.uriMatches || [];
    const messageMatches = node.filterData && node.filterData.messageMatches || [];
    const resourceLabelTitle = this.labelService.getUriLabel(relatedInformation.resource, { relative: true });
    templateData.resourceLabel.set(basename(relatedInformation.resource), uriMatches, resourceLabelTitle);
    templateData.lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(relatedInformation.startLineNumber, relatedInformation.startColumn);
    templateData.description.set(relatedInformation.message, messageMatches, relatedInformation.message);
  }
  disposeTemplate(templateData) {
    templateData.resourceLabel.dispose();
    templateData.description.dispose();
  }
};
RelatedInformationRenderer = __decorateClass([
  __decorateParam(0, ILabelService)
], RelatedInformationRenderer);
class Filter {
  constructor(options) {
    this.options = options;
  }
  filter(element, parentVisibility) {
    if (element instanceof ResourceMarkers) {
      return this.filterResourceMarkers(element);
    } else if (element instanceof Marker) {
      return this.filterMarker(element, parentVisibility);
    } else {
      return this.filterRelatedInformation(element, parentVisibility);
    }
  }
  filterResourceMarkers(resourceMarkers) {
    if (unsupportedSchemas.has(resourceMarkers.resource.scheme)) {
      return false;
    }
    if (this.options.excludesMatcher.matches(resourceMarkers.resource)) {
      return false;
    }
    if (this.options.includesMatcher.matches(resourceMarkers.resource)) {
      return true;
    }
    if (this.options.textFilter.text && !this.options.textFilter.negate) {
      const uriMatches = FilterOptions._filter(this.options.textFilter.text, basename(resourceMarkers.resource));
      if (uriMatches) {
        return { visibility: true, data: { type: 0 /* ResourceMarkers */, uriMatches: uriMatches || [] } };
      }
    }
    return TreeVisibility.Recurse;
  }
  filterMarker(marker, parentVisibility) {
    const matchesSeverity = this.options.showErrors && MarkerSeverity.Error === marker.marker.severity || this.options.showWarnings && MarkerSeverity.Warning === marker.marker.severity || this.options.showInfos && MarkerSeverity.Info === marker.marker.severity;
    if (!matchesSeverity) {
      return false;
    }
    if (!this.options.matchesSourceFilters(marker.marker.source)) {
      return false;
    }
    if (!this.options.textFilter.text) {
      return true;
    }
    const lineMatches = [];
    for (const line of marker.lines) {
      const lineMatch = FilterOptions._messageFilter(this.options.textFilter.text, line);
      lineMatches.push(lineMatch || []);
    }
    const sourceMatches = marker.marker.source ? FilterOptions._filter(this.options.textFilter.text, marker.marker.source) : void 0;
    const codeMatches = marker.marker.code ? FilterOptions._filter(this.options.textFilter.text, typeof marker.marker.code === "string" ? marker.marker.code : marker.marker.code.value) : void 0;
    const matched = sourceMatches || codeMatches || lineMatches.some((lineMatch) => lineMatch.length > 0);
    if (matched && !this.options.textFilter.negate) {
      return { visibility: true, data: { type: 1 /* Marker */, lineMatches, sourceMatches: sourceMatches || [], codeMatches: codeMatches || [] } };
    }
    if (matched && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return false;
    }
    if (!matched && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return true;
    }
    return parentVisibility;
  }
  filterRelatedInformation(relatedInformation, parentVisibility) {
    if (!this.options.textFilter.text) {
      return true;
    }
    const uriMatches = FilterOptions._filter(this.options.textFilter.text, basename(relatedInformation.raw.resource));
    const messageMatches = FilterOptions._messageFilter(this.options.textFilter.text, paths.basename(relatedInformation.raw.message));
    const matched = uriMatches || messageMatches;
    if (matched && !this.options.textFilter.negate) {
      return { visibility: true, data: { type: 2 /* RelatedInformation */, uriMatches: uriMatches || [], messageMatches: messageMatches || [] } };
    }
    if (matched && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return false;
    }
    if (!matched && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return true;
    }
    return parentVisibility;
  }
}
let MarkerViewModel = class extends Disposable {
  constructor(marker, modelService, instantiationService, editorService, languageFeaturesService) {
    super();
    this.marker = marker;
    this.modelService = modelService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.languageFeaturesService = languageFeaturesService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.modelPromise = null;
    this.codeActionsPromise = null;
    this._multiline = true;
    this._quickFixAction = null;
    this._register(toDisposable(() => {
      if (this.modelPromise) {
        this.modelPromise.cancel();
      }
      if (this.codeActionsPromise) {
        this.codeActionsPromise.cancel();
      }
    }));
  }
  get multiline() {
    return this._multiline;
  }
  set multiline(value) {
    if (this._multiline !== value) {
      this._multiline = value;
      this._onDidChange.fire();
    }
  }
  get quickFixAction() {
    if (!this._quickFixAction) {
      this._quickFixAction = this._register(this.instantiationService.createInstance(QuickFixAction, this.marker));
    }
    return this._quickFixAction;
  }
  showLightBulb() {
    this.setQuickFixes(true);
  }
  async setQuickFixes(waitForModel) {
    const codeActions = await this.getCodeActions(waitForModel);
    this.quickFixAction.quickFixes = codeActions ? this.toActions(codeActions) : [];
    this.quickFixAction.autoFixable(!!codeActions && codeActions.hasAutoFix);
  }
  getCodeActions(waitForModel) {
    if (this.codeActionsPromise !== null) {
      return this.codeActionsPromise;
    }
    return this.getModel(waitForModel).then((model) => {
      if (model) {
        if (!this.codeActionsPromise) {
          this.codeActionsPromise = createCancelablePromise((cancellationToken) => {
            return getCodeActions(this.languageFeaturesService.codeActionProvider, model, new Range(this.marker.range.startLineNumber, this.marker.range.startColumn, this.marker.range.endLineNumber, this.marker.range.endColumn), {
              type: CodeActionTriggerType.Invoke,
              triggerAction: CodeActionTriggerSource.ProblemsView,
              filter: { include: CodeActionKind.QuickFix }
            }, Progress.None, cancellationToken).then((actions) => {
              return this._register(actions);
            });
          });
        }
        return this.codeActionsPromise;
      }
      return null;
    });
  }
  toActions(codeActions) {
    return codeActions.validActions.map((item) => toAction({
      id: item.action.command ? item.action.command.id : item.action.title,
      label: item.action.title,
      run: async () => {
        await this.openFileAtMarker(this.marker);
        return await this.instantiationService.invokeFunction(applyCodeAction, item, ApplyCodeActionReason.FromProblemsView);
      }
    }));
  }
  openFileAtMarker(element) {
    const { resource, selection } = { resource: element.resource, selection: element.range };
    return this.editorService.openEditor({
      resource,
      options: {
        selection,
        preserveFocus: true,
        pinned: false,
        revealIfVisible: true
      }
    }, ACTIVE_GROUP).then(() => void 0);
  }
  getModel(waitForModel) {
    const model = this.modelService.getModel(this.marker.resource);
    if (model) {
      return Promise.resolve(model);
    }
    if (waitForModel) {
      if (!this.modelPromise) {
        this.modelPromise = createCancelablePromise((cancellationToken) => {
          return new Promise((c) => {
            this._register(this.modelService.onModelAdded((model2) => {
              if (isEqual(model2.uri, this.marker.resource)) {
                c(model2);
              }
            }));
          });
        });
      }
      return this.modelPromise;
    }
    return Promise.resolve(null);
  }
};
MarkerViewModel = __decorateClass([
  __decorateParam(1, IModelService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, ILanguageFeaturesService)
], MarkerViewModel);
let MarkersViewModel = class extends Disposable {
  constructor(multiline = true, viewMode = MarkersViewMode.Tree, contextKeyService, instantiationService) {
    super();
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._onDidChangeViewMode = this._register(new Emitter());
    this.onDidChangeViewMode = this._onDidChangeViewMode.event;
    this.markersViewStates = /* @__PURE__ */ new Map();
    this.markersPerResource = /* @__PURE__ */ new Map();
    this.bulkUpdate = false;
    this.hoveredMarker = null;
    this.hoverDelayer = this._register(new Delayer(300));
    this._multiline = true;
    this._viewMode = MarkersViewMode.Tree;
    this._multiline = multiline;
    this._viewMode = viewMode;
    this.viewModeContextKey = MarkersContextKeys.MarkersViewModeContextKey.bindTo(this.contextKeyService);
    this.viewModeContextKey.set(viewMode);
  }
  add(marker) {
    if (!this.markersViewStates.has(marker.id)) {
      const viewModel = this.instantiationService.createInstance(MarkerViewModel, marker);
      const disposables = [viewModel];
      viewModel.multiline = this.multiline;
      viewModel.onDidChange(() => {
        if (!this.bulkUpdate) {
          this._onDidChange.fire(marker);
        }
      }, this, disposables);
      this.markersViewStates.set(marker.id, { viewModel, disposables });
      const markers = this.markersPerResource.get(marker.resource.toString()) || [];
      markers.push(marker);
      this.markersPerResource.set(marker.resource.toString(), markers);
    }
  }
  remove(resource) {
    const markers = this.markersPerResource.get(resource.toString()) || [];
    for (const marker of markers) {
      const value = this.markersViewStates.get(marker.id);
      if (value) {
        dispose(value.disposables);
      }
      this.markersViewStates.delete(marker.id);
      if (this.hoveredMarker === marker) {
        this.hoveredMarker = null;
      }
    }
    this.markersPerResource.delete(resource.toString());
  }
  getViewModel(marker) {
    const value = this.markersViewStates.get(marker.id);
    return value ? value.viewModel : null;
  }
  onMarkerMouseHover(marker) {
    this.hoveredMarker = marker;
    this.hoverDelayer.trigger(() => {
      if (this.hoveredMarker) {
        const model = this.getViewModel(this.hoveredMarker);
        if (model) {
          model.showLightBulb();
        }
      }
    });
  }
  onMarkerMouseLeave(marker) {
    if (this.hoveredMarker === marker) {
      this.hoveredMarker = null;
    }
  }
  get multiline() {
    return this._multiline;
  }
  set multiline(value) {
    let changed = false;
    if (this._multiline !== value) {
      this._multiline = value;
      changed = true;
    }
    this.bulkUpdate = true;
    this.markersViewStates.forEach(({ viewModel }) => {
      if (viewModel.multiline !== value) {
        viewModel.multiline = value;
        changed = true;
      }
    });
    this.bulkUpdate = false;
    if (changed) {
      this._onDidChange.fire(void 0);
    }
  }
  get viewMode() {
    return this._viewMode;
  }
  set viewMode(value) {
    if (this._viewMode === value) {
      return;
    }
    this._viewMode = value;
    this._onDidChangeViewMode.fire(value);
    this.viewModeContextKey.set(value);
  }
  dispose() {
    this.markersViewStates.forEach(({ disposables }) => dispose(disposables));
    this.markersViewStates.clear();
    this.markersPerResource.clear();
    super.dispose();
  }
};
MarkersViewModel = __decorateClass([
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IInstantiationService)
], MarkersViewModel);
export {
  FileResourceMarkersRenderer,
  Filter,
  MarkerRenderer,
  MarkerViewModel,
  MarkersViewModel,
  MarkersWidgetAccessibilityProvider,
  RelatedInformationRenderer,
  ResourceMarkersRenderer,
  VirtualDelegate
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1hcmtlcnNcXGJyb3dzZXJcXG1hcmtlcnNUcmVlVmlld2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgcGF0aHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBDb3VudEJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvdW50QmFkZ2UvY291bnRCYWRnZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVscywgSVJlc291cmNlTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBIaWdobGlnaHRlZExhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hpZ2hsaWdodGVkbGFiZWwvaGlnaGxpZ2h0ZWRMYWJlbC5qcyc7XG5pbXBvcnQgeyBJTWFya2VyLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXJrZXJzLCBNYXJrZXIsIFJlbGF0ZWRJbmZvcm1hdGlvbiwgTWFya2VyRWxlbWVudCwgTWFya2VyVGFibGVJdGVtIH0gZnJvbSAnLi9tYXJrZXJzTW9kZWwuanMnO1xuaW1wb3J0IE1lc3NhZ2VzIGZyb20gJy4vbWVzc2FnZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IFF1aWNrRml4QWN0aW9uLCBRdWlja0ZpeEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi9tYXJrZXJzVmlld0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSVRyZWVGaWx0ZXIsIFRyZWVWaXNpYmlsaXR5LCBUcmVlRmlsdGVyUmVzdWx0LCBJVHJlZVJlbmRlcmVyLCBJVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IEZpbHRlck9wdGlvbnMgfSBmcm9tICcuL21hcmtlcnNGaWx0ZXJPcHRpb25zLmpzJztcbmltcG9ydCB7IElNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWRPck51bGwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgYXBwbHlDb2RlQWN0aW9uLCBBcHBseUNvZGVBY3Rpb25SZWFzb24sIGdldENvZGVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9icm93c2VyL2NvZGVBY3Rpb24uanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbktpbmQsIENvZGVBY3Rpb25TZXQsIENvZGVBY3Rpb25UcmlnZ2VyU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIEFDVElWRV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXZlcml0eUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2V2ZXJpdHlJY29uL3NldmVyaXR5SWNvbi5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uVHJpZ2dlclR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IE1hcmtlcnNDb250ZXh0S2V5cywgTWFya2Vyc1ZpZXdNb2RlIH0gZnJvbSAnLi4vY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgdW5zdXBwb3J0ZWRTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcblxuaW50ZXJmYWNlIElSZXNvdXJjZU1hcmtlcnNUZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSByZXNvdXJjZUxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0cmVhZG9ubHkgY291bnQ6IENvdW50QmFkZ2U7XG59XG5cbmludGVyZmFjZSBJTWFya2VyVGVtcGxhdGVEYXRhIHtcblx0bWFya2VyV2lkZ2V0OiBNYXJrZXJXaWRnZXQ7XG59XG5cbmludGVyZmFjZSBJUmVsYXRlZEluZm9ybWF0aW9uVGVtcGxhdGVEYXRhIHtcblx0cmVzb3VyY2VMYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0bG5Db2w6IEhUTUxFbGVtZW50O1xuXHRkZXNjcmlwdGlvbjogSGlnaGxpZ2h0ZWRMYWJlbDtcbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtlcnNXaWRnZXRBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxNYXJrZXJFbGVtZW50IHwgTWFya2VyVGFibGVJdGVtPiB7XG5cblx0Y29uc3RydWN0b3IoQElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UpIHsgfVxuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgncHJvYmxlbXNWaWV3JywgXCJQcm9ibGVtcyBWaWV3XCIpO1xuXHR9XG5cblx0cHVibGljIGdldEFyaWFMYWJlbChlbGVtZW50OiBNYXJrZXJFbGVtZW50IHwgTWFya2VyVGFibGVJdGVtKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXNvdXJjZU1hcmtlcnMpIHtcblx0XHRcdGNvbnN0IHBhdGggPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlbGVtZW50LnJlc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pIHx8IGVsZW1lbnQucmVzb3VyY2UuZnNQYXRoO1xuXHRcdFx0cmV0dXJuIE1lc3NhZ2VzLk1BUktFUlNfVFJFRV9BUklBX0xBQkVMX1JFU09VUkNFKGVsZW1lbnQubWFya2Vycy5sZW5ndGgsIGVsZW1lbnQubmFtZSwgcGF0aHMuZGlybmFtZShwYXRoKSk7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgTWFya2VyIHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBNYXJrZXJUYWJsZUl0ZW0pIHtcblx0XHRcdHJldHVybiBNZXNzYWdlcy5NQVJLRVJTX1RSRUVfQVJJQV9MQUJFTF9NQVJLRVIoZWxlbWVudCk7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgUmVsYXRlZEluZm9ybWF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gTWVzc2FnZXMuTUFSS0VSU19UUkVFX0FSSUFfTEFCRUxfUkVMQVRFRF9JTkZPUk1BVElPTihlbGVtZW50LnJhdyk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gVGVtcGxhdGVJZCB7XG5cdFJlc291cmNlTWFya2VycyA9ICdybScsXG5cdE1hcmtlciA9ICdtJyxcblx0UmVsYXRlZEluZm9ybWF0aW9uID0gJ3JpJ1xufVxuXG5leHBvcnQgY2xhc3MgVmlydHVhbERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8TWFya2VyRWxlbWVudD4ge1xuXG5cdHN0YXRpYyBMSU5FX0hFSUdIVDogbnVtYmVyID0gMjI7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBtYXJrZXJzVmlld1N0YXRlOiBNYXJrZXJzVmlld01vZGVsKSB7IH1cblxuXHRnZXRIZWlnaHQoZWxlbWVudDogTWFya2VyRWxlbWVudCk6IG51bWJlciB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBNYXJrZXIpIHtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMubWFya2Vyc1ZpZXdTdGF0ZS5nZXRWaWV3TW9kZWwoZWxlbWVudCk7XG5cdFx0XHRjb25zdCBub09mTGluZXMgPSAhdmlld01vZGVsIHx8IHZpZXdNb2RlbC5tdWx0aWxpbmUgPyBlbGVtZW50LmxpbmVzLmxlbmd0aCA6IDE7XG5cdFx0XHRyZXR1cm4gbm9PZkxpbmVzICogVmlydHVhbERlbGVnYXRlLkxJTkVfSEVJR0hUO1xuXHRcdH1cblx0XHRyZXR1cm4gVmlydHVhbERlbGVnYXRlLkxJTkVfSEVJR0hUO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBNYXJrZXJFbGVtZW50KTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlc291cmNlTWFya2Vycykge1xuXHRcdFx0cmV0dXJuIFRlbXBsYXRlSWQuUmVzb3VyY2VNYXJrZXJzO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE1hcmtlcikge1xuXHRcdFx0cmV0dXJuIFRlbXBsYXRlSWQuTWFya2VyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gVGVtcGxhdGVJZC5SZWxhdGVkSW5mb3JtYXRpb247XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IGVudW0gRmlsdGVyRGF0YVR5cGUge1xuXHRSZXNvdXJjZU1hcmtlcnMsXG5cdE1hcmtlcixcblx0UmVsYXRlZEluZm9ybWF0aW9uXG59XG5cbmludGVyZmFjZSBSZXNvdXJjZU1hcmtlcnNGaWx0ZXJEYXRhIHtcblx0dHlwZTogRmlsdGVyRGF0YVR5cGUuUmVzb3VyY2VNYXJrZXJzO1xuXHR1cmlNYXRjaGVzOiBJTWF0Y2hbXTtcbn1cblxuaW50ZXJmYWNlIE1hcmtlckZpbHRlckRhdGEge1xuXHR0eXBlOiBGaWx0ZXJEYXRhVHlwZS5NYXJrZXI7XG5cdGxpbmVNYXRjaGVzOiBJTWF0Y2hbXVtdO1xuXHRzb3VyY2VNYXRjaGVzOiBJTWF0Y2hbXTtcblx0Y29kZU1hdGNoZXM6IElNYXRjaFtdO1xufVxuXG5pbnRlcmZhY2UgUmVsYXRlZEluZm9ybWF0aW9uRmlsdGVyRGF0YSB7XG5cdHR5cGU6IEZpbHRlckRhdGFUeXBlLlJlbGF0ZWRJbmZvcm1hdGlvbjtcblx0dXJpTWF0Y2hlczogSU1hdGNoW107XG5cdG1lc3NhZ2VNYXRjaGVzOiBJTWF0Y2hbXTtcbn1cblxuZXhwb3J0IHR5cGUgRmlsdGVyRGF0YSA9IFJlc291cmNlTWFya2Vyc0ZpbHRlckRhdGEgfCBNYXJrZXJGaWx0ZXJEYXRhIHwgUmVsYXRlZEluZm9ybWF0aW9uRmlsdGVyRGF0YTtcblxuZXhwb3J0IGNsYXNzIFJlc291cmNlTWFya2Vyc1JlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxSZXNvdXJjZU1hcmtlcnMsIFJlc291cmNlTWFya2Vyc0ZpbHRlckRhdGEsIElSZXNvdXJjZU1hcmtlcnNUZW1wbGF0ZURhdGE+IHtcblxuXHRwcml2YXRlIHJlbmRlcmVkTm9kZXMgPSBuZXcgTWFwPFJlc291cmNlTWFya2VycywgSVJlc291cmNlTWFya2Vyc1RlbXBsYXRlRGF0YVtdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRvbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudDogRXZlbnQ8SVRyZWVOb2RlPFJlc291cmNlTWFya2VycywgUmVzb3VyY2VNYXJrZXJzRmlsdGVyRGF0YT4+LFxuXHQpIHtcblx0XHRvbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudCh0aGlzLm9uRGlkQ2hhbmdlUmVuZGVyTm9kZUNvdW50LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdHRlbXBsYXRlSWQgPSBUZW1wbGF0ZUlkLlJlc291cmNlTWFya2VycztcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVJlc291cmNlTWFya2Vyc1RlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VMYWJlbENvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnJlc291cmNlLWxhYmVsLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCByZXNvdXJjZUxhYmVsID0gdGhpcy5sYWJlbHMuY3JlYXRlKHJlc291cmNlTGFiZWxDb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUgfSk7XG5cblx0XHRjb25zdCBiYWRnZVdyYXBwZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jb3VudC1iYWRnZS13cmFwcGVyJykpO1xuXHRcdGNvbnN0IGNvdW50ID0gbmV3IENvdW50QmFkZ2UoYmFkZ2VXcmFwcGVyLCB7fSwgZGVmYXVsdENvdW50QmFkZ2VTdHlsZXMpO1xuXG5cdFx0cmV0dXJuIHsgY291bnQsIHJlc291cmNlTGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFJlc291cmNlTWFya2VycywgUmVzb3VyY2VNYXJrZXJzRmlsdGVyRGF0YT4sIF86IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUmVzb3VyY2VNYXJrZXJzVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VNYXJrZXJzID0gbm9kZS5lbGVtZW50O1xuXHRcdGNvbnN0IHVyaU1hdGNoZXMgPSBub2RlLmZpbHRlckRhdGEgJiYgbm9kZS5maWx0ZXJEYXRhLnVyaU1hdGNoZXMgfHwgW107XG5cblx0XHR0ZW1wbGF0ZURhdGEucmVzb3VyY2VMYWJlbC5zZXRGaWxlKHJlc291cmNlTWFya2Vycy5yZXNvdXJjZSwgeyBtYXRjaGVzOiB1cmlNYXRjaGVzIH0pO1xuXG5cdFx0dGhpcy51cGRhdGVDb3VudChub2RlLCB0ZW1wbGF0ZURhdGEpO1xuXHRcdGNvbnN0IG5vZGVSZW5kZXJzID0gdGhpcy5yZW5kZXJlZE5vZGVzLmdldChyZXNvdXJjZU1hcmtlcnMpID8/IFtdO1xuXHRcdHRoaXMucmVuZGVyZWROb2Rlcy5zZXQocmVzb3VyY2VNYXJrZXJzLCBbLi4ubm9kZVJlbmRlcnMsIHRlbXBsYXRlRGF0YV0pO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFJlc291cmNlTWFya2VycywgUmVzb3VyY2VNYXJrZXJzRmlsdGVyRGF0YT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVJlc291cmNlTWFya2Vyc1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IG5vZGVSZW5kZXJzID0gdGhpcy5yZW5kZXJlZE5vZGVzLmdldChub2RlLmVsZW1lbnQpID8/IFtdO1xuXHRcdGNvbnN0IG5vZGVSZW5kZXJJbmRleCA9IG5vZGVSZW5kZXJzLmZpbmRJbmRleChub2RlUmVuZGVyID0+IHRlbXBsYXRlRGF0YSA9PT0gbm9kZVJlbmRlcik7XG5cblx0XHRpZiAobm9kZVJlbmRlckluZGV4IDwgMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEaXNwb3NpbmcgdW5rbm93biByZXNvdXJjZSBtYXJrZXInKTtcblx0XHR9XG5cblx0XHRpZiAobm9kZVJlbmRlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHR0aGlzLnJlbmRlcmVkTm9kZXMuZGVsZXRlKG5vZGUuZWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5vZGVSZW5kZXJzLnNwbGljZShub2RlUmVuZGVySW5kZXgsIDEpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElSZXNvdXJjZU1hcmtlcnNUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucmVzb3VyY2VMYWJlbC5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvdW50LmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQobm9kZTogSVRyZWVOb2RlPFJlc291cmNlTWFya2VycywgUmVzb3VyY2VNYXJrZXJzRmlsdGVyRGF0YT4pOiB2b2lkIHtcblx0XHRjb25zdCBub2RlUmVuZGVycyA9IHRoaXMucmVuZGVyZWROb2Rlcy5nZXQobm9kZS5lbGVtZW50KTtcblxuXHRcdGlmICghbm9kZVJlbmRlcnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRub2RlUmVuZGVycy5mb3JFYWNoKG5vZGVSZW5kZXIgPT4gdGhpcy51cGRhdGVDb3VudChub2RlLCBub2RlUmVuZGVyKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvdW50KG5vZGU6IElUcmVlTm9kZTxSZXNvdXJjZU1hcmtlcnMsIFJlc291cmNlTWFya2Vyc0ZpbHRlckRhdGE+LCB0ZW1wbGF0ZURhdGE6IElSZXNvdXJjZU1hcmtlcnNUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY291bnQuc2V0Q291bnQobm9kZS5jaGlsZHJlbi5yZWR1Y2UoKHIsIG4pID0+IHIgKyAobi52aXNpYmxlID8gMSA6IDApLCAwKSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlUmVzb3VyY2VNYXJrZXJzUmVuZGVyZXIgZXh0ZW5kcyBSZXNvdXJjZU1hcmtlcnNSZW5kZXJlciB7XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrZXJSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8TWFya2VyLCBNYXJrZXJGaWx0ZXJEYXRhLCBJTWFya2VyVGVtcGxhdGVEYXRhPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYXJrZXJzVmlld1N0YXRlOiBNYXJrZXJzVmlld01vZGVsLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByb3RlY3RlZCBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJvdGVjdGVkIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHRlbXBsYXRlSWQgPSBUZW1wbGF0ZUlkLk1hcmtlcjtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU1hcmtlclRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGF0YTogSU1hcmtlclRlbXBsYXRlRGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0ZGF0YS5tYXJrZXJXaWRnZXQgPSBuZXcgTWFya2VyV2lkZ2V0KGNvbnRhaW5lciwgdGhpcy5tYXJrZXJzVmlld1N0YXRlLCB0aGlzLmhvdmVyU2VydmljZSwgdGhpcy5vcGVuZXJTZXJ2aWNlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPE1hcmtlciwgTWFya2VyRmlsdGVyRGF0YT4sIF86IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJTWFya2VyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLm1hcmtlcldpZGdldC5yZW5kZXIobm9kZS5lbGVtZW50LCBub2RlLmZpbHRlckRhdGEpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU1hcmtlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5tYXJrZXJXaWRnZXQuZGlzcG9zZSgpO1xuXHR9XG5cbn1cblxuY29uc3QgZXhwYW5kZWRJY29uID0gcmVnaXN0ZXJJY29uKCdtYXJrZXJzLXZpZXctbXVsdGktbGluZS1leHBhbmRlZCcsIENvZGljb24uY2hldnJvblVwLCBsb2NhbGl6ZSgnZXhwYW5kZWRJY29uJywgJ0ljb24gaW5kaWNhdGluZyB0aGF0IG11bHRpcGxlIGxpbmVzIGFyZSBzaG93biBpbiB0aGUgbWFya2VycyB2aWV3LicpKTtcbmNvbnN0IGNvbGxhcHNlZEljb24gPSByZWdpc3Rlckljb24oJ21hcmtlcnMtdmlldy1tdWx0aS1saW5lLWNvbGxhcHNlZCcsIENvZGljb24uY2hldnJvbkRvd24sIGxvY2FsaXplKCdjb2xsYXBzZWRJY29uJywgJ0ljb24gaW5kaWNhdGluZyB0aGF0IG11bHRpcGxlIGxpbmVzIGFyZSBjb2xsYXBzZWQgaW4gdGhlIG1hcmtlcnMgdmlldy4nKSk7XG5cbmNvbnN0IHRvZ2dsZU11bHRpbGluZUFjdGlvbiA9ICdwcm9ibGVtcy5hY3Rpb24udG9nZ2xlTXVsdGlsaW5lJztcblxuY2xhc3MgVG9nZ2xlTXVsdGlsaW5lQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0aGlzLnVwZGF0ZUV4cGFuZGVkQXR0cmlidXRlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlQ2xhc3MoKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlQ2xhc3MoKTtcblx0XHR0aGlzLnVwZGF0ZUV4cGFuZGVkQXR0cmlidXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUV4cGFuZGVkQXR0cmlidXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudD8uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgYCR7dGhpcy5fYWN0aW9uLmNsYXNzID09PSBUaGVtZUljb24uYXNDbGFzc05hbWUoZXhwYW5kZWRJY29uKX1gKTtcblx0fVxuXG59XG5cbmNsYXNzIE1hcmtlcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgaWNvbjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaWNvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZUFuZERldGFpbHNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VBbmREZXRhaWxzQ29udGFpbmVySG92ZXI6IElNYW5hZ2VkSG92ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1hcmtlcnNWaWV3TW9kZWw6IE1hcmtlcnNWaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5hY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLmFjdGlvbnMnKSksIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24sIG9wdGlvbnMpID0+IGFjdGlvbi5pZCA9PT0gUXVpY2tGaXhBY3Rpb24uSUQgPyBfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVpY2tGaXhBY3Rpb25WaWV3SXRlbSwgPFF1aWNrRml4QWN0aW9uPmFjdGlvbiwgb3B0aW9ucykgOiB1bmRlZmluZWRcblx0XHR9KSk7XG5cblx0XHQvLyB3cmFwIHRoZSBpY29uIGluIGEgY29udGFpbmVyIHRoYXQgZ2V0IHRoZSBpY29uIGNvbG9yIGFzIGZvcmVncm91bmQgY29sb3IuIFRoYXQgd2F5LCBpZiB0aGVcblx0XHQvLyBsaXN0IHZpZXcgZG9lcyBub3QgaGF2ZSBhIHNwZWNpZmljIGNvbG9yIGZvciB0aGUgaWNvbiAoPXRoZSBjb2xvciB2YXJpYWJsZSBpcyBpbnZhbGlkKSBpdFxuXHRcdC8vIGZhbGxzIGJhY2sgdG8gdGhlIGZvcmVncm91bmQgY29sb3Igb2YgY29udGFpbmVyIChpbmhlcml0KVxuXHRcdHRoaXMuaWNvbkNvbnRhaW5lciA9IGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnJykpO1xuXHRcdHRoaXMuaWNvbiA9IGRvbS5hcHBlbmQodGhpcy5pY29uQ29udGFpbmVyLCBkb20uJCgnJykpO1xuXHRcdHRoaXMubWVzc2FnZUFuZERldGFpbHNDb250YWluZXIgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5tYXJrZXItbWVzc2FnZS1kZXRhaWxzLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLm1lc3NhZ2VBbmREZXRhaWxzQ29udGFpbmVySG92ZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMubWVzc2FnZUFuZERldGFpbHNDb250YWluZXIsICcnKSk7XG5cdH1cblxuXHRyZW5kZXIoZWxlbWVudDogTWFya2VyLCBmaWx0ZXJEYXRhOiBNYXJrZXJGaWx0ZXJEYXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLm1lc3NhZ2VBbmREZXRhaWxzQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuaWNvbkNvbnRhaW5lci5jbGFzc05hbWUgPSBgbWFya2VyLWljb24gJHtTZXZlcml0eS50b1N0cmluZyhNYXJrZXJTZXZlcml0eS50b1NldmVyaXR5KGVsZW1lbnQubWFya2VyLnNldmVyaXR5KSl9YDtcblx0XHR0aGlzLmljb24uY2xhc3NOYW1lID0gYGNvZGljb24gJHtTZXZlcml0eUljb24uY2xhc3NOYW1lKE1hcmtlclNldmVyaXR5LnRvU2V2ZXJpdHkoZWxlbWVudC5tYXJrZXIuc2V2ZXJpdHkpKX1gO1xuXHRcdHRoaXMucmVuZGVyUXVpY2tmaXhBY3Rpb25iYXIoZWxlbWVudCk7XG5cblx0XHR0aGlzLnJlbmRlck1lc3NhZ2VBbmREZXRhaWxzKGVsZW1lbnQsIGZpbHRlckRhdGEpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5wYXJlbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfT1ZFUiwgKCkgPT4gdGhpcy5tYXJrZXJzVmlld01vZGVsLm9uTWFya2VyTW91c2VIb3ZlcihlbGVtZW50KSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5wYXJlbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHRoaXMubWFya2Vyc1ZpZXdNb2RlbC5vbk1hcmtlck1vdXNlTGVhdmUoZWxlbWVudCkpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUXVpY2tmaXhBY3Rpb25iYXIobWFya2VyOiBNYXJrZXIpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLm1hcmtlcnNWaWV3TW9kZWwuZ2V0Vmlld01vZGVsKG1hcmtlcik7XG5cdFx0aWYgKHZpZXdNb2RlbCkge1xuXHRcdFx0Y29uc3QgcXVpY2tGaXhBY3Rpb24gPSB2aWV3TW9kZWwucXVpY2tGaXhBY3Rpb247XG5cdFx0XHR0aGlzLmFjdGlvbkJhci5wdXNoKFtxdWlja0ZpeEFjdGlvbl0sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0dGhpcy5pY29uQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3F1aWNrRml4JywgcXVpY2tGaXhBY3Rpb24uZW5hYmxlZCk7XG5cdFx0XHRxdWlja0ZpeEFjdGlvbi5vbkRpZENoYW5nZSgoeyBlbmFibGVkIH0pID0+IHtcblx0XHRcdFx0aWYgKCFpc1VuZGVmaW5lZE9yTnVsbChlbmFibGVkKSkge1xuXHRcdFx0XHRcdHRoaXMuaWNvbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdxdWlja0ZpeCcsIGVuYWJsZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHRcdHF1aWNrRml4QWN0aW9uLm9uU2hvd1F1aWNrRml4ZXMoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBxdWlja0ZpeEFjdGlvblZpZXdJdGVtID0gPFF1aWNrRml4QWN0aW9uVmlld0l0ZW0+dGhpcy5hY3Rpb25CYXIudmlld0l0ZW1zWzBdO1xuXHRcdFx0XHRpZiAocXVpY2tGaXhBY3Rpb25WaWV3SXRlbSkge1xuXHRcdFx0XHRcdHF1aWNrRml4QWN0aW9uVmlld0l0ZW0uc2hvd1F1aWNrRml4ZXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNdWx0aWxpbmVBY3Rpb25iYXIobWFya2VyOiBNYXJrZXIsIHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBtdWx0aWxpbmVBY3Rpb25iYXIgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLm11bHRpbGluZS1hY3Rpb25zJykpLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IHRvZ2dsZU11bHRpbGluZUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgVG9nZ2xlTXVsdGlsaW5lQWN0aW9uVmlld0l0ZW0odW5kZWZpbmVkLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgaWNvbjogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChtdWx0aWxpbmVBY3Rpb25iYXIpO1xuXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5tYXJrZXJzVmlld01vZGVsLmdldFZpZXdNb2RlbChtYXJrZXIpO1xuXHRcdGNvbnN0IG11bHRpbGluZSA9IHZpZXdNb2RlbCAmJiB2aWV3TW9kZWwubXVsdGlsaW5lO1xuXHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24odG9nZ2xlTXVsdGlsaW5lQWN0aW9uKSk7XG5cdFx0YWN0aW9uLmVuYWJsZWQgPSAhIXZpZXdNb2RlbCAmJiBtYXJrZXIubGluZXMubGVuZ3RoID4gMTtcblx0XHRhY3Rpb24udG9vbHRpcCA9IG11bHRpbGluZSA/IGxvY2FsaXplKCdzaW5nbGUgbGluZScsIFwiU2hvdyBtZXNzYWdlIGluIHNpbmdsZSBsaW5lXCIpIDogbG9jYWxpemUoJ211bHRpIGxpbmUnLCBcIlNob3cgbWVzc2FnZSBpbiBtdWx0aXBsZSBsaW5lc1wiKTtcblx0XHRhY3Rpb24uY2xhc3MgPSBUaGVtZUljb24uYXNDbGFzc05hbWUobXVsdGlsaW5lID8gZXhwYW5kZWRJY29uIDogY29sbGFwc2VkSWNvbik7XG5cdFx0YWN0aW9uLnJ1biA9ICgpID0+IHsgaWYgKHZpZXdNb2RlbCkgeyB2aWV3TW9kZWwubXVsdGlsaW5lID0gIXZpZXdNb2RlbC5tdWx0aWxpbmU7IH0gcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9O1xuXHRcdG11bHRpbGluZUFjdGlvbmJhci5wdXNoKFthY3Rpb25dLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWVzc2FnZUFuZERldGFpbHMoZWxlbWVudDogTWFya2VyLCBmaWx0ZXJEYXRhOiBNYXJrZXJGaWx0ZXJEYXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBtYXJrZXIsIGxpbmVzIH0gPSBlbGVtZW50O1xuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHRoaXMubWFya2Vyc1ZpZXdNb2RlbC5nZXRWaWV3TW9kZWwoZWxlbWVudCk7XG5cdFx0Y29uc3QgbXVsdGlsaW5lID0gIXZpZXdTdGF0ZSB8fCB2aWV3U3RhdGUubXVsdGlsaW5lO1xuXHRcdGNvbnN0IGxpbmVNYXRjaGVzID0gZmlsdGVyRGF0YSAmJiBmaWx0ZXJEYXRhLmxpbmVNYXRjaGVzIHx8IFtdO1xuXHRcdHRoaXMubWVzc2FnZUFuZERldGFpbHNDb250YWluZXJIb3Zlci51cGRhdGUoZWxlbWVudC5tYXJrZXIubWVzc2FnZSk7XG5cblx0XHRjb25zdCBsaW5lRWxlbWVudHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgKG11bHRpbGluZSA/IGxpbmVzLmxlbmd0aCA6IDEpOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBsaW5lRWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5tZXNzYWdlQW5kRGV0YWlsc0NvbnRhaW5lciwgZG9tLiQoJy5tYXJrZXItbWVzc2FnZS1saW5lJykpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZUVsZW1lbnQgPSBkb20uYXBwZW5kKGxpbmVFbGVtZW50LCBkb20uJCgnLm1hcmtlci1tZXNzYWdlJykpO1xuXHRcdFx0Y29uc3QgaGlnaGxpZ2h0ZWRMYWJlbCA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKG1lc3NhZ2VFbGVtZW50KSk7XG5cdFx0XHRoaWdobGlnaHRlZExhYmVsLnNldChsaW5lc1tpbmRleF0ubGVuZ3RoID4gMTAwMCA/IGAke2xpbmVzW2luZGV4XS5zdWJzdHJpbmcoMCwgMTAwMCl9Li4uYCA6IGxpbmVzW2luZGV4XSwgbGluZU1hdGNoZXNbaW5kZXhdKTtcblx0XHRcdGlmIChsaW5lc1tpbmRleF0gPT09ICcnKSB7XG5cdFx0XHRcdGxpbmVFbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke1ZpcnR1YWxEZWxlZ2F0ZS5MSU5FX0hFSUdIVH1weGA7XG5cdFx0XHR9XG5cdFx0XHRsaW5lRWxlbWVudHMucHVzaChsaW5lRWxlbWVudCk7XG5cdFx0fVxuXHRcdHRoaXMucmVuZGVyRGV0YWlscyhtYXJrZXIsIGZpbHRlckRhdGEsIGxpbmVFbGVtZW50c1swXSk7XG5cdFx0dGhpcy5yZW5kZXJNdWx0aWxpbmVBY3Rpb25iYXIoZWxlbWVudCwgbGluZUVsZW1lbnRzWzBdKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRGV0YWlscyhtYXJrZXI6IElNYXJrZXIsIGZpbHRlckRhdGE6IE1hcmtlckZpbHRlckRhdGEgfCB1bmRlZmluZWQsIHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRwYXJlbnQuY2xhc3NMaXN0LmFkZCgnZGV0YWlscy1jb250YWluZXInKTtcblxuXHRcdGlmIChtYXJrZXIuc291cmNlIHx8IG1hcmtlci5jb2RlKSB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgSGlnaGxpZ2h0ZWRMYWJlbChkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5tYXJrZXItc291cmNlJykpKSk7XG5cdFx0XHRjb25zdCBzb3VyY2VNYXRjaGVzID0gZmlsdGVyRGF0YSAmJiBmaWx0ZXJEYXRhLnNvdXJjZU1hdGNoZXMgfHwgW107XG5cdFx0XHRzb3VyY2Uuc2V0KG1hcmtlci5zb3VyY2UsIHNvdXJjZU1hdGNoZXMpO1xuXG5cdFx0XHRpZiAobWFya2VyLmNvZGUpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBtYXJrZXIuY29kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjb25zdCBjb2RlID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwoZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCcubWFya2VyLWNvZGUnKSkpKTtcblx0XHRcdFx0XHRjb25zdCBjb2RlTWF0Y2hlcyA9IGZpbHRlckRhdGEgJiYgZmlsdGVyRGF0YS5jb2RlTWF0Y2hlcyB8fCBbXTtcblx0XHRcdFx0XHRjb2RlLnNldChtYXJrZXIuY29kZSwgY29kZU1hdGNoZXMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS4kKCcubWFya2VyLWNvZGUnKTtcblx0XHRcdFx0XHRjb25zdCBjb2RlID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwoY29udGFpbmVyKSk7XG5cdFx0XHRcdFx0Y29uc3QgbGluayA9IG1hcmtlci5jb2RlLnRhcmdldC50b1N0cmluZyh0cnVlKTtcblx0XHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgTGluayhwYXJlbnQsIHsgaHJlZjogbGluaywgbGFiZWw6IGNvbnRhaW5lciwgdGl0bGU6IGxpbmsgfSwgdW5kZWZpbmVkLCB0aGlzLl9ob3ZlclNlcnZpY2UsIHRoaXMuX29wZW5lclNlcnZpY2UpKTtcblx0XHRcdFx0XHRjb25zdCBjb2RlTWF0Y2hlcyA9IGZpbHRlckRhdGEgJiYgZmlsdGVyRGF0YS5jb2RlTWF0Y2hlcyB8fCBbXTtcblx0XHRcdFx0XHRjb2RlLnNldChtYXJrZXIuY29kZS52YWx1ZSwgY29kZU1hdGNoZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG5Db2wgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJ3NwYW4ubWFya2VyLWxpbmUnKSk7XG5cdFx0bG5Db2wudGV4dENvbnRlbnQgPSBNZXNzYWdlcy5NQVJLRVJTX1BBTkVMX0FUX0xJTkVfQ09MX05VTUJFUihtYXJrZXIuc3RhcnRMaW5lTnVtYmVyLCBtYXJrZXIuc3RhcnRDb2x1bW4pO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFJlbGF0ZWRJbmZvcm1hdGlvblJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxSZWxhdGVkSW5mb3JtYXRpb24sIFJlbGF0ZWRJbmZvcm1hdGlvbkZpbHRlckRhdGEsIElSZWxhdGVkSW5mb3JtYXRpb25UZW1wbGF0ZURhdGE+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHsgfVxuXG5cdHRlbXBsYXRlSWQgPSBUZW1wbGF0ZUlkLlJlbGF0ZWRJbmZvcm1hdGlvbjtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVJlbGF0ZWRJbmZvcm1hdGlvblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGF0YTogSVJlbGF0ZWRJbmZvcm1hdGlvblRlbXBsYXRlRGF0YSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5hY3Rpb25zJykpO1xuXHRcdGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmljb24nKSk7XG5cblx0XHRkYXRhLnJlc291cmNlTGFiZWwgPSBuZXcgSGlnaGxpZ2h0ZWRMYWJlbChkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5yZWxhdGVkLWluZm8tcmVzb3VyY2UnKSkpO1xuXHRcdGRhdGEubG5Db2wgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJ3NwYW4ubWFya2VyLWxpbmUnKSk7XG5cblx0XHRjb25zdCBzZXBhcmF0b3IgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJ3NwYW4ucmVsYXRlZC1pbmZvLXJlc291cmNlLXNlcGFyYXRvcicpKTtcblx0XHRzZXBhcmF0b3IudGV4dENvbnRlbnQgPSAnOic7XG5cdFx0c2VwYXJhdG9yLnN0eWxlLnBhZGRpbmdSaWdodCA9ICc0cHgnO1xuXG5cdFx0ZGF0YS5kZXNjcmlwdGlvbiA9IG5ldyBIaWdobGlnaHRlZExhYmVsKGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLm1hcmtlci1kZXNjcmlwdGlvbicpKSk7XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxSZWxhdGVkSW5mb3JtYXRpb24sIFJlbGF0ZWRJbmZvcm1hdGlvbkZpbHRlckRhdGE+LCBfOiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVJlbGF0ZWRJbmZvcm1hdGlvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlbGF0ZWRJbmZvcm1hdGlvbiA9IG5vZGUuZWxlbWVudC5yYXc7XG5cdFx0Y29uc3QgdXJpTWF0Y2hlcyA9IG5vZGUuZmlsdGVyRGF0YSAmJiBub2RlLmZpbHRlckRhdGEudXJpTWF0Y2hlcyB8fCBbXTtcblx0XHRjb25zdCBtZXNzYWdlTWF0Y2hlcyA9IG5vZGUuZmlsdGVyRGF0YSAmJiBub2RlLmZpbHRlckRhdGEubWVzc2FnZU1hdGNoZXMgfHwgW107XG5cblx0XHRjb25zdCByZXNvdXJjZUxhYmVsVGl0bGUgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZWxhdGVkSW5mb3JtYXRpb24ucmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlc291cmNlTGFiZWwuc2V0KGJhc2VuYW1lKHJlbGF0ZWRJbmZvcm1hdGlvbi5yZXNvdXJjZSksIHVyaU1hdGNoZXMsIHJlc291cmNlTGFiZWxUaXRsZSk7XG5cdFx0dGVtcGxhdGVEYXRhLmxuQ29sLnRleHRDb250ZW50ID0gTWVzc2FnZXMuTUFSS0VSU19QQU5FTF9BVF9MSU5FX0NPTF9OVU1CRVIocmVsYXRlZEluZm9ybWF0aW9uLnN0YXJ0TGluZU51bWJlciwgcmVsYXRlZEluZm9ybWF0aW9uLnN0YXJ0Q29sdW1uKTtcblx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uc2V0KHJlbGF0ZWRJbmZvcm1hdGlvbi5tZXNzYWdlLCBtZXNzYWdlTWF0Y2hlcywgcmVsYXRlZEluZm9ybWF0aW9uLm1lc3NhZ2UpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVJlbGF0ZWRJbmZvcm1hdGlvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5yZXNvdXJjZUxhYmVsLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGaWx0ZXIgaW1wbGVtZW50cyBJVHJlZUZpbHRlcjxNYXJrZXJFbGVtZW50LCBGaWx0ZXJEYXRhPiB7XG5cblx0Y29uc3RydWN0b3IocHVibGljIG9wdGlvbnM6IEZpbHRlck9wdGlvbnMpIHsgfVxuXG5cdGZpbHRlcihlbGVtZW50OiBNYXJrZXJFbGVtZW50LCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RmlsdGVyRGF0YT4ge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgUmVzb3VyY2VNYXJrZXJzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWx0ZXJSZXNvdXJjZU1hcmtlcnMoZWxlbWVudCk7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgTWFya2VyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWx0ZXJNYXJrZXIoZWxlbWVudCwgcGFyZW50VmlzaWJpbGl0eSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmZpbHRlclJlbGF0ZWRJbmZvcm1hdGlvbihlbGVtZW50LCBwYXJlbnRWaXNpYmlsaXR5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlclJlc291cmNlTWFya2VycyhyZXNvdXJjZU1hcmtlcnM6IFJlc291cmNlTWFya2Vycyk6IFRyZWVGaWx0ZXJSZXN1bHQ8RmlsdGVyRGF0YT4ge1xuXHRcdGlmICh1bnN1cHBvcnRlZFNjaGVtYXMuaGFzKHJlc291cmNlTWFya2Vycy5yZXNvdXJjZS5zY2hlbWUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gRmlsdGVyIHJlc291cmNlIGJ5IHBhdHRlcm4gZmlyc3QgKGdsb2JzKVxuXHRcdC8vIEV4Y2x1ZGVzIHBhdHRlcm5cblx0XHRpZiAodGhpcy5vcHRpb25zLmV4Y2x1ZGVzTWF0Y2hlci5tYXRjaGVzKHJlc291cmNlTWFya2Vycy5yZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBJbmNsdWRlcyBwYXR0ZXJuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5pbmNsdWRlc01hdGNoZXIubWF0Y2hlcyhyZXNvdXJjZU1hcmtlcnMucmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBGaXRlciBieSB0ZXh0LiBEbyBub3QgYXBwbHkgbmVnYXRlZCBmaWx0ZXJzIG9uIHJlc291cmNlcyBpbnN0ZWFkIHVzZSBleGNsdWRlIHBhdHRlcm5zXG5cdFx0aWYgKHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQgJiYgIXRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSkge1xuXHRcdFx0Y29uc3QgdXJpTWF0Y2hlcyA9IEZpbHRlck9wdGlvbnMuX2ZpbHRlcih0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCBiYXNlbmFtZShyZXNvdXJjZU1hcmtlcnMucmVzb3VyY2UpKTtcblx0XHRcdGlmICh1cmlNYXRjaGVzKSB7XG5cdFx0XHRcdHJldHVybiB7IHZpc2liaWxpdHk6IHRydWUsIGRhdGE6IHsgdHlwZTogRmlsdGVyRGF0YVR5cGUuUmVzb3VyY2VNYXJrZXJzLCB1cmlNYXRjaGVzOiB1cmlNYXRjaGVzIHx8IFtdIH0gfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gVHJlZVZpc2liaWxpdHkuUmVjdXJzZTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyTWFya2VyKG1hcmtlcjogTWFya2VyLCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RmlsdGVyRGF0YT4ge1xuXG5cdFx0Y29uc3QgbWF0Y2hlc1NldmVyaXR5ID0gdGhpcy5vcHRpb25zLnNob3dFcnJvcnMgJiYgTWFya2VyU2V2ZXJpdHkuRXJyb3IgPT09IG1hcmtlci5tYXJrZXIuc2V2ZXJpdHkgfHxcblx0XHRcdHRoaXMub3B0aW9ucy5zaG93V2FybmluZ3MgJiYgTWFya2VyU2V2ZXJpdHkuV2FybmluZyA9PT0gbWFya2VyLm1hcmtlci5zZXZlcml0eSB8fFxuXHRcdFx0dGhpcy5vcHRpb25zLnNob3dJbmZvcyAmJiBNYXJrZXJTZXZlcml0eS5JbmZvID09PSBtYXJrZXIubWFya2VyLnNldmVyaXR5O1xuXG5cdFx0aWYgKCFtYXRjaGVzU2V2ZXJpdHkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBzb3VyY2UgZmlsdGVycyBpZiBwcmVzZW50XG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMubWF0Y2hlc1NvdXJjZUZpbHRlcnMobWFya2VyLm1hcmtlci5zb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lTWF0Y2hlczogSU1hdGNoW11bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBtYXJrZXIubGluZXMpIHtcblx0XHRcdGNvbnN0IGxpbmVNYXRjaCA9IEZpbHRlck9wdGlvbnMuX21lc3NhZ2VGaWx0ZXIodGhpcy5vcHRpb25zLnRleHRGaWx0ZXIudGV4dCwgbGluZSk7XG5cdFx0XHRsaW5lTWF0Y2hlcy5wdXNoKGxpbmVNYXRjaCB8fCBbXSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc291cmNlTWF0Y2hlcyA9IG1hcmtlci5tYXJrZXIuc291cmNlID8gRmlsdGVyT3B0aW9ucy5fZmlsdGVyKHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQsIG1hcmtlci5tYXJrZXIuc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb2RlTWF0Y2hlcyA9IG1hcmtlci5tYXJrZXIuY29kZSA/IEZpbHRlck9wdGlvbnMuX2ZpbHRlcih0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCB0eXBlb2YgbWFya2VyLm1hcmtlci5jb2RlID09PSAnc3RyaW5nJyA/IG1hcmtlci5tYXJrZXIuY29kZSA6IG1hcmtlci5tYXJrZXIuY29kZS52YWx1ZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbWF0Y2hlZCA9IHNvdXJjZU1hdGNoZXMgfHwgY29kZU1hdGNoZXMgfHwgbGluZU1hdGNoZXMuc29tZShsaW5lTWF0Y2ggPT4gbGluZU1hdGNoLmxlbmd0aCA+IDApO1xuXG5cdFx0Ly8gTWF0Y2hlZCBhbmQgbm90IG5lZ2F0ZWRcblx0XHRpZiAobWF0Y2hlZCAmJiAhdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIubmVnYXRlKSB7XG5cdFx0XHRyZXR1cm4geyB2aXNpYmlsaXR5OiB0cnVlLCBkYXRhOiB7IHR5cGU6IEZpbHRlckRhdGFUeXBlLk1hcmtlciwgbGluZU1hdGNoZXMsIHNvdXJjZU1hdGNoZXM6IHNvdXJjZU1hdGNoZXMgfHwgW10sIGNvZGVNYXRjaGVzOiBjb2RlTWF0Y2hlcyB8fCBbXSB9IH07XG5cdFx0fVxuXG5cdFx0Ly8gTWF0Y2hlZCBhbmQgbmVnYXRlZCAtIGV4Y2x1ZGUgaXQgb25seSBpZiBwYXJlbnQgdmlzaWJpbGl0eSBpcyBub3Qgc2V0XG5cdFx0aWYgKG1hdGNoZWQgJiYgdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIubmVnYXRlICYmIHBhcmVudFZpc2liaWxpdHkgPT09IFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBOb3QgbWF0Y2hlZCBhbmQgbmVnYXRlZCAtIGluY2x1ZGUgaXQgb25seSBpZiBwYXJlbnQgdmlzaWJpbGl0eSBpcyBub3Qgc2V0XG5cdFx0aWYgKCFtYXRjaGVkICYmIHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSAmJiBwYXJlbnRWaXNpYmlsaXR5ID09PSBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFyZW50VmlzaWJpbGl0eTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyUmVsYXRlZEluZm9ybWF0aW9uKHJlbGF0ZWRJbmZvcm1hdGlvbjogUmVsYXRlZEluZm9ybWF0aW9uLCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RmlsdGVyRGF0YT4ge1xuXHRcdGlmICghdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIudGV4dCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJpTWF0Y2hlcyA9IEZpbHRlck9wdGlvbnMuX2ZpbHRlcih0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCBiYXNlbmFtZShyZWxhdGVkSW5mb3JtYXRpb24ucmF3LnJlc291cmNlKSk7XG5cdFx0Y29uc3QgbWVzc2FnZU1hdGNoZXMgPSBGaWx0ZXJPcHRpb25zLl9tZXNzYWdlRmlsdGVyKHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQsIHBhdGhzLmJhc2VuYW1lKHJlbGF0ZWRJbmZvcm1hdGlvbi5yYXcubWVzc2FnZSkpO1xuXHRcdGNvbnN0IG1hdGNoZWQgPSB1cmlNYXRjaGVzIHx8IG1lc3NhZ2VNYXRjaGVzO1xuXG5cdFx0Ly8gTWF0Y2hlZCBhbmQgbm90IG5lZ2F0ZWRcblx0XHRpZiAobWF0Y2hlZCAmJiAhdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIubmVnYXRlKSB7XG5cdFx0XHRyZXR1cm4geyB2aXNpYmlsaXR5OiB0cnVlLCBkYXRhOiB7IHR5cGU6IEZpbHRlckRhdGFUeXBlLlJlbGF0ZWRJbmZvcm1hdGlvbiwgdXJpTWF0Y2hlczogdXJpTWF0Y2hlcyB8fCBbXSwgbWVzc2FnZU1hdGNoZXM6IG1lc3NhZ2VNYXRjaGVzIHx8IFtdIH0gfTtcblx0XHR9XG5cblx0XHQvLyBNYXRjaGVkIGFuZCBuZWdhdGVkIC0gZXhjbHVkZSBpdCBvbmx5IGlmIHBhcmVudCB2aXNpYmlsaXR5IGlzIG5vdCBzZXRcblx0XHRpZiAobWF0Y2hlZCAmJiB0aGlzLm9wdGlvbnMudGV4dEZpbHRlci5uZWdhdGUgJiYgcGFyZW50VmlzaWJpbGl0eSA9PT0gVHJlZVZpc2liaWxpdHkuUmVjdXJzZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIE5vdCBtYXRjaGVkIGFuZCBuZWdhdGVkIC0gaW5jbHVkZSBpdCBvbmx5IGlmIHBhcmVudCB2aXNpYmlsaXR5IGlzIG5vdCBzZXRcblx0XHRpZiAoIW1hdGNoZWQgJiYgdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIubmVnYXRlICYmIHBhcmVudFZpc2liaWxpdHkgPT09IFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2UpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXJlbnRWaXNpYmlsaXR5O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrZXJWaWV3TW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIG1vZGVsUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8SVRleHRNb2RlbD4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBjb2RlQWN0aW9uc1Byb21pc2U6IENhbmNlbGFibGVQcm9taXNlPENvZGVBY3Rpb25TZXQ+IHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYXJrZXI6IE1hcmtlcixcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMubW9kZWxQcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMubW9kZWxQcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuY29kZUFjdGlvbnNQcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuY29kZUFjdGlvbnNQcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX211bHRpbGluZTogYm9vbGVhbiA9IHRydWU7XG5cdGdldCBtdWx0aWxpbmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX211bHRpbGluZTtcblx0fVxuXG5cdHNldCBtdWx0aWxpbmUodmFsdWU6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5fbXVsdGlsaW5lICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy5fbXVsdGlsaW5lID0gdmFsdWU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcXVpY2tGaXhBY3Rpb246IFF1aWNrRml4QWN0aW9uIHwgbnVsbCA9IG51bGw7XG5cdGdldCBxdWlja0ZpeEFjdGlvbigpOiBRdWlja0ZpeEFjdGlvbiB7XG5cdFx0aWYgKCF0aGlzLl9xdWlja0ZpeEFjdGlvbikge1xuXHRcdFx0dGhpcy5fcXVpY2tGaXhBY3Rpb24gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrRml4QWN0aW9uLCB0aGlzLm1hcmtlcikpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcXVpY2tGaXhBY3Rpb247XG5cdH1cblxuXHRzaG93TGlnaHRCdWxiKCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0UXVpY2tGaXhlcyh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0UXVpY2tGaXhlcyh3YWl0Rm9yTW9kZWw6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb2RlQWN0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0Q29kZUFjdGlvbnMod2FpdEZvck1vZGVsKTtcblx0XHR0aGlzLnF1aWNrRml4QWN0aW9uLnF1aWNrRml4ZXMgPSBjb2RlQWN0aW9ucyA/IHRoaXMudG9BY3Rpb25zKGNvZGVBY3Rpb25zKSA6IFtdO1xuXHRcdHRoaXMucXVpY2tGaXhBY3Rpb24uYXV0b0ZpeGFibGUoISFjb2RlQWN0aW9ucyAmJiBjb2RlQWN0aW9ucy5oYXNBdXRvRml4KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29kZUFjdGlvbnMod2FpdEZvck1vZGVsOiBib29sZWFuKTogUHJvbWlzZTxDb2RlQWN0aW9uU2V0IHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLmNvZGVBY3Rpb25zUHJvbWlzZSAhPT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29kZUFjdGlvbnNQcm9taXNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRNb2RlbCh3YWl0Rm9yTW9kZWwpXG5cdFx0XHQudGhlbjxDb2RlQWN0aW9uU2V0IHwgbnVsbD4obW9kZWwgPT4ge1xuXHRcdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuY29kZUFjdGlvbnNQcm9taXNlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmNvZGVBY3Rpb25zUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGNhbmNlbGxhdGlvblRva2VuID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGdldENvZGVBY3Rpb25zKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLCBtb2RlbCwgbmV3IFJhbmdlKHRoaXMubWFya2VyLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgdGhpcy5tYXJrZXIucmFuZ2Uuc3RhcnRDb2x1bW4sIHRoaXMubWFya2VyLnJhbmdlLmVuZExpbmVOdW1iZXIsIHRoaXMubWFya2VyLnJhbmdlLmVuZENvbHVtbiksIHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiBDb2RlQWN0aW9uVHJpZ2dlclR5cGUuSW52b2tlLCB0cmlnZ2VyQWN0aW9uOiBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZS5Qcm9ibGVtc1ZpZXcsIGZpbHRlcjogeyBpbmNsdWRlOiBDb2RlQWN0aW9uS2luZC5RdWlja0ZpeCB9XG5cdFx0XHRcdFx0XHRcdH0sIFByb2dyZXNzLk5vbmUsIGNhbmNlbGxhdGlvblRva2VuKS50aGVuKGFjdGlvbnMgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZWdpc3RlcihhY3Rpb25zKTtcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuY29kZUFjdGlvbnNQcm9taXNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHRvQWN0aW9ucyhjb2RlQWN0aW9uczogQ29kZUFjdGlvblNldCk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIGNvZGVBY3Rpb25zLnZhbGlkQWN0aW9ucy5tYXAoaXRlbSA9PiB0b0FjdGlvbih7XG5cdFx0XHRpZDogaXRlbS5hY3Rpb24uY29tbWFuZCA/IGl0ZW0uYWN0aW9uLmNvbW1hbmQuaWQgOiBpdGVtLmFjdGlvbi50aXRsZSxcblx0XHRcdGxhYmVsOiBpdGVtLmFjdGlvbi50aXRsZSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5GaWxlQXRNYXJrZXIodGhpcy5tYXJrZXIpO1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhcHBseUNvZGVBY3Rpb24sIGl0ZW0sIEFwcGx5Q29kZUFjdGlvblJlYXNvbi5Gcm9tUHJvYmxlbXNWaWV3KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIG9wZW5GaWxlQXRNYXJrZXIoZWxlbWVudDogTWFya2VyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyByZXNvdXJjZSwgc2VsZWN0aW9uIH0gPSB7IHJlc291cmNlOiBlbGVtZW50LnJlc291cmNlLCBzZWxlY3Rpb246IGVsZW1lbnQucmFuZ2UgfTtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHNlbGVjdGlvbixcblx0XHRcdFx0cHJlc2VydmVGb2N1czogdHJ1ZSxcblx0XHRcdFx0cGlubmVkOiBmYWxzZSxcblx0XHRcdFx0cmV2ZWFsSWZWaXNpYmxlOiB0cnVlXG5cdFx0XHR9LFxuXHRcdH0sIEFDVElWRV9HUk9VUCkudGhlbigoKSA9PiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNb2RlbCh3YWl0Rm9yTW9kZWw6IGJvb2xlYW4pOiBQcm9taXNlPElUZXh0TW9kZWwgfCBudWxsPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbCh0aGlzLm1hcmtlci5yZXNvdXJjZSk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG1vZGVsKTtcblx0XHR9XG5cdFx0aWYgKHdhaXRGb3JNb2RlbCkge1xuXHRcdFx0aWYgKCF0aGlzLm1vZGVsUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGNhbmNlbGxhdGlvblRva2VuID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKGMpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWxTZXJ2aWNlLm9uTW9kZWxBZGRlZChtb2RlbCA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChpc0VxdWFsKG1vZGVsLnVyaSwgdGhpcy5tYXJrZXIucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Yyhtb2RlbCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5tb2RlbFByb21pc2U7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgTWFya2Vyc1ZpZXdNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlOiBFbWl0dGVyPE1hcmtlciB8IHVuZGVmaW5lZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNYXJrZXIgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8TWFya2VyIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlld01vZGU6IEVtaXR0ZXI8TWFya2Vyc1ZpZXdNb2RlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE1hcmtlcnNWaWV3TW9kZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld01vZGU6IEV2ZW50PE1hcmtlcnNWaWV3TW9kZT4gPSB0aGlzLl9vbkRpZENoYW5nZVZpZXdNb2RlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFya2Vyc1ZpZXdTdGF0ZXM6IE1hcDxzdHJpbmcsIHsgdmlld01vZGVsOiBNYXJrZXJWaWV3TW9kZWw7IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdIH0+ID0gbmV3IE1hcDxzdHJpbmcsIHsgdmlld01vZGVsOiBNYXJrZXJWaWV3TW9kZWw7IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFya2Vyc1BlclJlc291cmNlOiBNYXA8c3RyaW5nLCBNYXJrZXJbXT4gPSBuZXcgTWFwPHN0cmluZywgTWFya2VyW10+KCk7XG5cblx0cHJpdmF0ZSBidWxrVXBkYXRlOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBob3ZlcmVkTWFya2VyOiBNYXJrZXIgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBob3ZlckRlbGF5ZXI6IERlbGF5ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigzMDApKTtcblx0cHJpdmF0ZSB2aWV3TW9kZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PE1hcmtlcnNWaWV3TW9kZT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bXVsdGlsaW5lOiBib29sZWFuID0gdHJ1ZSxcblx0XHR2aWV3TW9kZTogTWFya2Vyc1ZpZXdNb2RlID0gTWFya2Vyc1ZpZXdNb2RlLlRyZWUsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9tdWx0aWxpbmUgPSBtdWx0aWxpbmU7XG5cdFx0dGhpcy5fdmlld01vZGUgPSB2aWV3TW9kZTtcblxuXHRcdHRoaXMudmlld01vZGVDb250ZXh0S2V5ID0gTWFya2Vyc0NvbnRleHRLZXlzLk1hcmtlcnNWaWV3TW9kZUNvbnRleHRLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudmlld01vZGVDb250ZXh0S2V5LnNldCh2aWV3TW9kZSk7XG5cdH1cblxuXHRhZGQobWFya2VyOiBNYXJrZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubWFya2Vyc1ZpZXdTdGF0ZXMuaGFzKG1hcmtlci5pZCkpIHtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya2VyVmlld01vZGVsLCBtYXJrZXIpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbdmlld01vZGVsXTtcblx0XHRcdHZpZXdNb2RlbC5tdWx0aWxpbmUgPSB0aGlzLm11bHRpbGluZTtcblx0XHRcdHZpZXdNb2RlbC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5idWxrVXBkYXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShtYXJrZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0aGlzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR0aGlzLm1hcmtlcnNWaWV3U3RhdGVzLnNldChtYXJrZXIuaWQsIHsgdmlld01vZGVsLCBkaXNwb3NhYmxlcyB9KTtcblxuXHRcdFx0Y29uc3QgbWFya2VycyA9IHRoaXMubWFya2Vyc1BlclJlc291cmNlLmdldChtYXJrZXIucmVzb3VyY2UudG9TdHJpbmcoKSkgfHwgW107XG5cdFx0XHRtYXJrZXJzLnB1c2gobWFya2VyKTtcblx0XHRcdHRoaXMubWFya2Vyc1BlclJlc291cmNlLnNldChtYXJrZXIucmVzb3VyY2UudG9TdHJpbmcoKSwgbWFya2Vycyk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBtYXJrZXJzID0gdGhpcy5tYXJrZXJzUGVyUmVzb3VyY2UuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpIHx8IFtdO1xuXHRcdGZvciAoY29uc3QgbWFya2VyIG9mIG1hcmtlcnMpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5tYXJrZXJzVmlld1N0YXRlcy5nZXQobWFya2VyLmlkKTtcblx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRkaXNwb3NlKHZhbHVlLmRpc3Bvc2FibGVzKTtcblx0XHRcdH1cblx0XHRcdHRoaXMubWFya2Vyc1ZpZXdTdGF0ZXMuZGVsZXRlKG1hcmtlci5pZCk7XG5cdFx0XHRpZiAodGhpcy5ob3ZlcmVkTWFya2VyID09PSBtYXJrZXIpIHtcblx0XHRcdFx0dGhpcy5ob3ZlcmVkTWFya2VyID0gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5tYXJrZXJzUGVyUmVzb3VyY2UuZGVsZXRlKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0Z2V0Vmlld01vZGVsKG1hcmtlcjogTWFya2VyKTogTWFya2VyVmlld01vZGVsIHwgbnVsbCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLm1hcmtlcnNWaWV3U3RhdGVzLmdldChtYXJrZXIuaWQpO1xuXHRcdHJldHVybiB2YWx1ZSA/IHZhbHVlLnZpZXdNb2RlbCA6IG51bGw7XG5cdH1cblxuXHRvbk1hcmtlck1vdXNlSG92ZXIobWFya2VyOiBNYXJrZXIpOiB2b2lkIHtcblx0XHR0aGlzLmhvdmVyZWRNYXJrZXIgPSBtYXJrZXI7XG5cdFx0dGhpcy5ob3ZlckRlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5ob3ZlcmVkTWFya2VyKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5nZXRWaWV3TW9kZWwodGhpcy5ob3ZlcmVkTWFya2VyKTtcblx0XHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdFx0bW9kZWwuc2hvd0xpZ2h0QnVsYigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvbk1hcmtlck1vdXNlTGVhdmUobWFya2VyOiBNYXJrZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5ob3ZlcmVkTWFya2VyID09PSBtYXJrZXIpIHtcblx0XHRcdHRoaXMuaG92ZXJlZE1hcmtlciA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbXVsdGlsaW5lOiBib29sZWFuID0gdHJ1ZTtcblx0Z2V0IG11bHRpbGluZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbXVsdGlsaW5lO1xuXHR9XG5cblx0c2V0IG11bHRpbGluZSh2YWx1ZTogYm9vbGVhbikge1xuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuX211bHRpbGluZSAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuX211bHRpbGluZSA9IHZhbHVlO1xuXHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXHRcdHRoaXMuYnVsa1VwZGF0ZSA9IHRydWU7XG5cdFx0dGhpcy5tYXJrZXJzVmlld1N0YXRlcy5mb3JFYWNoKCh7IHZpZXdNb2RlbCB9KSA9PiB7XG5cdFx0XHRpZiAodmlld01vZGVsLm11bHRpbGluZSAhPT0gdmFsdWUpIHtcblx0XHRcdFx0dmlld01vZGVsLm11bHRpbGluZSA9IHZhbHVlO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLmJ1bGtVcGRhdGUgPSBmYWxzZTtcblx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3ZpZXdNb2RlOiBNYXJrZXJzVmlld01vZGUgPSBNYXJrZXJzVmlld01vZGUuVHJlZTtcblx0Z2V0IHZpZXdNb2RlKCk6IE1hcmtlcnNWaWV3TW9kZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdNb2RlO1xuXHR9XG5cblx0c2V0IHZpZXdNb2RlKHZhbHVlOiBNYXJrZXJzVmlld01vZGUpIHtcblx0XHRpZiAodGhpcy5fdmlld01vZGUgPT09IHZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlld01vZGUgPSB2YWx1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdNb2RlLmZpcmUodmFsdWUpO1xuXHRcdHRoaXMudmlld01vZGVDb250ZXh0S2V5LnNldCh2YWx1ZSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMubWFya2Vyc1ZpZXdTdGF0ZXMuZm9yRWFjaCgoeyBkaXNwb3NhYmxlcyB9KSA9PiBkaXNwb3NlKGRpc3Bvc2FibGVzKSk7XG5cdFx0dGhpcy5tYXJrZXJzVmlld1N0YXRlcy5jbGVhcigpO1xuXHRcdHRoaXMubWFya2Vyc1BlclJlc291cmNlLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksV0FBVztBQUN2QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFrQixzQkFBc0I7QUFDeEMsU0FBUyxpQkFBaUIsUUFBUSxvQkFBbUMsdUJBQXVCO0FBQzVGLE9BQU8sY0FBYztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFzQixTQUFTLFlBQVksY0FBYyx1QkFBdUI7QUFDaEYsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0IsOEJBQThCO0FBQ3ZELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsVUFBVSxlQUFlO0FBRWxDLFNBQXNCLHNCQUFrRTtBQUN4RixTQUFTLHFCQUFxQjtBQUU5QixTQUFnQixlQUFlO0FBRS9CLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsUUFBaUIsZ0JBQWdCO0FBQzFDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLHlCQUF5QixlQUFlO0FBQ3BFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQix1QkFBdUIsc0JBQXNCO0FB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O0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxtQkFBbUIsT0FBTyxTQUFTLFNBQVMsQ0FBQztBQUFBLEVBQ25EO0FBQUEsRUFFQSxhQUFhLFFBQXdDO0FBQ3BELFVBQU0sUUFBUSxLQUFLLGtCQUFrQixJQUFJLE9BQU8sRUFBRTtBQUNsRCxXQUFPLFFBQVEsTUFBTSxZQUFZO0FBQUEsRUFDbEM7QUFBQSxFQUVBLG1CQUFtQixRQUFzQjtBQUN4QyxTQUFLLGdCQUFnQjtBQUNyQixTQUFLLGFBQWEsUUFBUSxNQUFNO0FBQy9CLFVBQUksS0FBSyxlQUFlO0FBQ3ZCLGNBQU0sUUFBUSxLQUFLLGFBQWEsS0FBSyxhQUFhO0FBQ2xELFlBQUksT0FBTztBQUNWLGdCQUFNLGNBQWM7QUFBQSxRQUNyQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxtQkFBbUIsUUFBc0I7QUFDeEMsUUFBSSxLQUFLLGtCQUFrQixRQUFRO0FBQ2xDLFdBQUssZ0JBQWdCO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFHQSxJQUFJLFlBQXFCO0FBQ3hCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksVUFBVSxPQUFnQjtBQUM3QixRQUFJLFVBQVU7QUFDZCxRQUFJLEtBQUssZUFBZSxPQUFPO0FBQzlCLFdBQUssYUFBYTtBQUNsQixnQkFBVTtBQUFBLElBQ1g7QUFDQSxTQUFLLGFBQWE7QUFDbEIsU0FBSyxrQkFBa0IsUUFBUSxDQUFDLEVBQUUsVUFBVSxNQUFNO0FBQ2pELFVBQUksVUFBVSxjQUFjLE9BQU87QUFDbEMsa0JBQVUsWUFBWTtBQUN0QixrQkFBVTtBQUFBLE1BQ1g7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLGFBQWE7QUFDbEIsUUFBSSxTQUFTO0FBQ1osV0FBSyxhQUFhLEtBQUssTUFBUztBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUFBLEVBR0EsSUFBSSxXQUE0QjtBQUMvQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFNBQVMsT0FBd0I7QUFDcEMsUUFBSSxLQUFLLGNBQWMsT0FBTztBQUM3QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLFlBQVk7QUFDakIsU0FBSyxxQkFBcUIsS0FBSyxLQUFLO0FBQ3BDLFNBQUssbUJBQW1CLElBQUksS0FBSztBQUFBLEVBQ2xDO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLGtCQUFrQixRQUFRLENBQUMsRUFBRSxZQUFZLE1BQU0sUUFBUSxXQUFXLENBQUM7QUFDeEUsU0FBSyxrQkFBa0IsTUFBTTtBQUM3QixTQUFLLG1CQUFtQixNQUFNO0FBQzlCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFFRDtBQXJJYSxtQkFBTjtBQUFBLEVBb0JKO0FBQUEsRUFDQTtBQUFBLEdBckJVOyIsCiAgIm5hbWVzIjogWyJUZW1wbGF0ZUlkIiwgIkZpbHRlckRhdGFUeXBlIiwgImFjdGlvbiIsICJtb2RlbCJdCn0K
