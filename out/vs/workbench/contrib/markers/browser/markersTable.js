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
import { localize } from "../../../../nls.js";
import * as DOM from "../../../../base/browser/dom.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { compareMarkersByUri, Marker, MarkerTableItem } from "./markersModel.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { FilterOptions } from "./markersFilterOptions.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { QuickFixAction, QuickFixActionViewItem } from "./markersViewActions.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import Messages from "./messages.js";
import { isUndefinedOrNull } from "../../../../base/common/types.js";
import { Range } from "../../../../editor/common/core/range.js";
import { unsupportedSchemas } from "../../../../platform/markers/common/markerService.js";
import Severity from "../../../../base/common/severity.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
const $ = DOM.$;
let MarkerSeverityColumnRenderer = class {
  constructor(markersViewModel, instantiationService) {
    this.markersViewModel = markersViewModel;
    this.instantiationService = instantiationService;
    this.templateId = MarkerSeverityColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const severityColumn = DOM.append(container, $(".severity"));
    const icon = DOM.append(severityColumn, $(""));
    const actionBarColumn = DOM.append(container, $(".actions"));
    const actionBar = new ActionBar(actionBarColumn, {
      actionViewItemProvider: (action, options) => action.id === QuickFixAction.ID ? this.instantiationService.createInstance(QuickFixActionViewItem, action, options) : void 0
    });
    return { actionBar, icon, elementDisposables: new DisposableStore() };
  }
  renderElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    const toggleQuickFix = (enabled) => {
      if (!isUndefinedOrNull(enabled)) {
        const container = DOM.findParentWithClass(templateData.icon, "monaco-table-td");
        container.classList.toggle("quickFix", enabled);
      }
    };
    templateData.icon.title = MarkerSeverity.toString(element.marker.severity);
    templateData.icon.className = `marker-icon ${Severity.toString(MarkerSeverity.toSeverity(element.marker.severity))} codicon ${SeverityIcon.className(MarkerSeverity.toSeverity(element.marker.severity))}`;
    templateData.actionBar.clear();
    const viewModel = this.markersViewModel.getViewModel(element);
    if (viewModel) {
      const quickFixAction = viewModel.quickFixAction;
      templateData.actionBar.push([quickFixAction], { icon: true, label: false });
      toggleQuickFix(viewModel.quickFixAction.enabled);
      templateData.elementDisposables.add(quickFixAction.onDidChange(({ enabled }) => toggleQuickFix(enabled)));
      templateData.elementDisposables.add(quickFixAction.onShowQuickFixes(() => {
        const quickFixActionViewItem = templateData.actionBar.viewItems[0];
        if (quickFixActionViewItem) {
          quickFixActionViewItem.showQuickFixes();
        }
      }));
    }
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.actionBar.dispose();
  }
};
MarkerSeverityColumnRenderer.TEMPLATE_ID = "severity";
MarkerSeverityColumnRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService)
], MarkerSeverityColumnRenderer);
let MarkerCodeColumnRenderer = class {
  constructor(hoverService, openerService) {
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.templateId = MarkerCodeColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposable = new DisposableStore();
    const codeColumn = DOM.append(container, $(".code"));
    const sourceLabel = templateDisposable.add(new HighlightedLabel(codeColumn));
    sourceLabel.element.classList.add("source-label");
    const codeLabel = templateDisposable.add(new HighlightedLabel(codeColumn));
    codeLabel.element.classList.add("code-label");
    const codeLink = templateDisposable.add(new Link(codeColumn, { href: "", label: "" }, {}, this.hoverService, this.openerService));
    return { codeColumn, sourceLabel, codeLabel, codeLink, templateDisposable };
  }
  renderElement(element, index, templateData) {
    templateData.codeColumn.classList.remove("code-label");
    templateData.codeColumn.classList.remove("code-link");
    if (element.marker.source && element.marker.code) {
      if (typeof element.marker.code === "string") {
        templateData.codeColumn.classList.add("code-label");
        templateData.codeColumn.title = `${element.marker.source} (${element.marker.code})`;
        templateData.sourceLabel.set(element.marker.source, element.sourceMatches);
        templateData.codeLabel.set(element.marker.code, element.codeMatches);
      } else {
        templateData.codeColumn.classList.add("code-link");
        templateData.codeColumn.title = `${element.marker.source} (${element.marker.code.value})`;
        templateData.sourceLabel.set(element.marker.source, element.sourceMatches);
        const codeLinkLabel = templateData.templateDisposable.add(new HighlightedLabel($(".code-link-label")));
        codeLinkLabel.set(element.marker.code.value, element.codeMatches);
        templateData.codeLink.link = {
          href: element.marker.code.target.toString(true),
          title: element.marker.code.target.toString(true),
          label: codeLinkLabel.element
        };
      }
    } else {
      templateData.codeColumn.title = "";
      templateData.sourceLabel.set("-");
    }
  }
  disposeTemplate(templateData) {
    templateData.templateDisposable.dispose();
  }
};
MarkerCodeColumnRenderer.TEMPLATE_ID = "code";
MarkerCodeColumnRenderer = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, IOpenerService)
], MarkerCodeColumnRenderer);
const _MarkerMessageColumnRenderer = class _MarkerMessageColumnRenderer {
  constructor() {
    this.templateId = _MarkerMessageColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const columnElement = DOM.append(container, $(".message"));
    const highlightedLabel = new HighlightedLabel(columnElement);
    return { columnElement, highlightedLabel };
  }
  renderElement(element, index, templateData) {
    templateData.columnElement.title = element.marker.message;
    templateData.highlightedLabel.set(element.marker.message, element.messageMatches);
  }
  disposeTemplate(templateData) {
    templateData.highlightedLabel.dispose();
  }
};
_MarkerMessageColumnRenderer.TEMPLATE_ID = "message";
let MarkerMessageColumnRenderer = _MarkerMessageColumnRenderer;
let MarkerFileColumnRenderer = class {
  constructor(labelService) {
    this.labelService = labelService;
    this.templateId = MarkerFileColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const columnElement = DOM.append(container, $(".file"));
    const fileLabel = new HighlightedLabel(columnElement);
    fileLabel.element.classList.add("file-label");
    const positionLabel = new HighlightedLabel(columnElement);
    positionLabel.element.classList.add("file-position");
    return { columnElement, fileLabel, positionLabel };
  }
  renderElement(element, index, templateData) {
    const positionLabel = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(element.marker.startLineNumber, element.marker.startColumn);
    templateData.columnElement.title = `${this.labelService.getUriLabel(element.marker.resource, { relative: false })} ${positionLabel}`;
    templateData.fileLabel.set(this.labelService.getUriLabel(element.marker.resource, { relative: true }), element.fileMatches);
    templateData.positionLabel.set(positionLabel, void 0);
  }
  disposeTemplate(templateData) {
    templateData.fileLabel.dispose();
    templateData.positionLabel.dispose();
  }
};
MarkerFileColumnRenderer.TEMPLATE_ID = "file";
MarkerFileColumnRenderer = __decorateClass([
  __decorateParam(0, ILabelService)
], MarkerFileColumnRenderer);
const _MarkerSourceColumnRenderer = class _MarkerSourceColumnRenderer {
  constructor() {
    this.templateId = _MarkerSourceColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const columnElement = DOM.append(container, $(".source"));
    const highlightedLabel = new HighlightedLabel(columnElement);
    return { columnElement, highlightedLabel };
  }
  renderElement(element, index, templateData) {
    templateData.columnElement.title = element.marker.source ?? "";
    templateData.highlightedLabel.set(element.marker.source ?? "", element.sourceMatches);
  }
  disposeTemplate(templateData) {
    templateData.highlightedLabel.dispose();
  }
};
_MarkerSourceColumnRenderer.TEMPLATE_ID = "source";
let MarkerSourceColumnRenderer = _MarkerSourceColumnRenderer;
const _MarkersTableVirtualDelegate = class _MarkersTableVirtualDelegate {
  constructor() {
    this.headerRowHeight = _MarkersTableVirtualDelegate.HEADER_ROW_HEIGHT;
  }
  getHeight(item) {
    return _MarkersTableVirtualDelegate.ROW_HEIGHT;
  }
};
_MarkersTableVirtualDelegate.HEADER_ROW_HEIGHT = 24;
_MarkersTableVirtualDelegate.ROW_HEIGHT = 24;
let MarkersTableVirtualDelegate = _MarkersTableVirtualDelegate;
let MarkersTable = class extends Disposable {
  constructor(container, markersViewModel, resourceMarkers, filterOptions, options, instantiationService, labelService) {
    super();
    this.container = container;
    this.markersViewModel = markersViewModel;
    this.resourceMarkers = resourceMarkers;
    this.filterOptions = filterOptions;
    this.instantiationService = instantiationService;
    this.labelService = labelService;
    this._itemCount = 0;
    this.table = this.instantiationService.createInstance(
      WorkbenchTable,
      "Markers",
      this.container,
      new MarkersTableVirtualDelegate(),
      [
        {
          label: "",
          tooltip: "",
          weight: 0,
          minimumWidth: 36,
          maximumWidth: 36,
          templateId: MarkerSeverityColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("codeColumnLabel", "Code"),
          tooltip: "",
          weight: 1,
          minimumWidth: 100,
          maximumWidth: 300,
          templateId: MarkerCodeColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("messageColumnLabel", "Message"),
          tooltip: "",
          weight: 4,
          templateId: MarkerMessageColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("fileColumnLabel", "File"),
          tooltip: "",
          weight: 2,
          templateId: MarkerFileColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("sourceColumnLabel", "Source"),
          tooltip: "",
          weight: 1,
          minimumWidth: 100,
          maximumWidth: 300,
          templateId: MarkerSourceColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        }
      ],
      [
        this.instantiationService.createInstance(MarkerSeverityColumnRenderer, this.markersViewModel),
        this.instantiationService.createInstance(MarkerCodeColumnRenderer),
        this.instantiationService.createInstance(MarkerMessageColumnRenderer),
        this.instantiationService.createInstance(MarkerFileColumnRenderer),
        this.instantiationService.createInstance(MarkerSourceColumnRenderer)
      ],
      options
    );
    const list = this.table.domNode.querySelector(".monaco-list-rows");
    const onRowHover = Event.chain(
      this._register(new DomEmitter(list, "mouseover")).event,
      ($2) => $2.map((e) => DOM.findParentWithClass(e.target, "monaco-list-row", "monaco-list-rows")).filter((e) => !!e).map((e) => parseInt(e.getAttribute("data-index")))
    );
    const onListLeave = Event.map(this._register(new DomEmitter(list, "mouseleave")).event, () => -1);
    const onRowHoverOrLeave = Event.latch(Event.any(onRowHover, onListLeave));
    const onRowPermanentHover = Event.debounce(onRowHoverOrLeave, (_, e) => e, 500);
    this._register(onRowPermanentHover((e) => {
      if (e !== -1 && this.table.row(e)) {
        this.markersViewModel.onMarkerMouseHover(this.table.row(e));
      }
    }));
  }
  get contextKeyService() {
    return this.table.contextKeyService;
  }
  get onContextMenu() {
    return this.table.onContextMenu;
  }
  get onDidOpen() {
    return this.table.onDidOpen;
  }
  get onDidChangeFocus() {
    return this.table.onDidChangeFocus;
  }
  get onDidChangeSelection() {
    return this.table.onDidChangeSelection;
  }
  collapseMarkers() {
  }
  domFocus() {
    this.table.domFocus();
  }
  filterMarkers(resourceMarkers, filterOptions) {
    this.filterOptions = filterOptions;
    this.reset(resourceMarkers);
  }
  getFocus() {
    const focus = this.table.getFocus();
    return focus.length > 0 ? [...focus.map((f) => this.table.row(f))] : [];
  }
  getHTMLElement() {
    return this.table.getHTMLElement();
  }
  getRelativeTop(marker) {
    return marker ? this.table.getRelativeTop(this.table.indexOf(marker)) : null;
  }
  getSelection() {
    const selection = this.table.getSelection();
    return selection.length > 0 ? [...selection.map((i) => this.table.row(i))] : [];
  }
  getVisibleItemCount() {
    return this._itemCount;
  }
  isVisible() {
    return !this.container.classList.contains("hidden");
  }
  layout(height, width) {
    this.container.style.height = `${height}px`;
    this.table.layout(height, width);
  }
  reset(resourceMarkers) {
    this.resourceMarkers = resourceMarkers;
    const items = [];
    for (const resourceMarker of this.resourceMarkers) {
      for (const marker of resourceMarker.markers) {
        if (unsupportedSchemas.has(marker.resource.scheme)) {
          continue;
        }
        if (this.filterOptions.excludesMatcher.matches(marker.resource)) {
          continue;
        }
        if (this.filterOptions.includesMatcher.matches(marker.resource)) {
          items.push(new MarkerTableItem(marker));
          continue;
        }
        const matchesSeverity = this.filterOptions.showErrors && MarkerSeverity.Error === marker.marker.severity || this.filterOptions.showWarnings && MarkerSeverity.Warning === marker.marker.severity || this.filterOptions.showInfos && MarkerSeverity.Info === marker.marker.severity;
        if (!matchesSeverity) {
          continue;
        }
        if (!this.filterOptions.matchesSourceFilters(marker.marker.source)) {
          continue;
        }
        if (this.filterOptions.textFilter.text) {
          const sourceMatches = marker.marker.source ? FilterOptions._filter(this.filterOptions.textFilter.text, marker.marker.source) ?? void 0 : void 0;
          const codeMatches = marker.marker.code ? FilterOptions._filter(this.filterOptions.textFilter.text, typeof marker.marker.code === "string" ? marker.marker.code : marker.marker.code.value) ?? void 0 : void 0;
          const messageMatches = FilterOptions._messageFilter(this.filterOptions.textFilter.text, marker.marker.message) ?? void 0;
          const fileMatches = FilterOptions._messageFilter(this.filterOptions.textFilter.text, this.labelService.getUriLabel(marker.resource, { relative: true })) ?? void 0;
          const matched = sourceMatches || codeMatches || messageMatches || fileMatches;
          if (matched && !this.filterOptions.textFilter.negate || !matched && this.filterOptions.textFilter.negate) {
            items.push(new MarkerTableItem(marker, sourceMatches, codeMatches, messageMatches, fileMatches));
          }
          continue;
        }
        items.push(new MarkerTableItem(marker));
      }
    }
    this._itemCount = items.length;
    this.table.splice(0, Number.POSITIVE_INFINITY, items.sort((a, b) => {
      let result = MarkerSeverity.compare(a.marker.severity, b.marker.severity);
      if (result === 0) {
        result = compareMarkersByUri(a.marker, b.marker);
      }
      if (result === 0) {
        result = Range.compareRangesUsingStarts(a.marker, b.marker);
      }
      return result;
    }));
  }
  revealMarkers(activeResource, focus, lastSelectedRelativeTop) {
    if (activeResource) {
      const activeResourceIndex = this.resourceMarkers.indexOf(activeResource);
      if (activeResourceIndex !== -1) {
        if (this.hasSelectedMarkerFor(activeResource)) {
          const tableSelection = this.table.getSelection();
          this.table.reveal(tableSelection[0], lastSelectedRelativeTop);
          if (focus) {
            this.table.setFocus(tableSelection);
          }
        } else {
          this.table.reveal(activeResourceIndex, 0);
          if (focus) {
            this.table.setFocus([activeResourceIndex]);
            this.table.setSelection([activeResourceIndex]);
          }
        }
      }
    } else if (focus) {
      this.table.setSelection([]);
      this.table.focusFirst();
    }
  }
  setAriaLabel(label) {
    this.table.domNode.ariaLabel = label;
  }
  setMarkerSelection(selection, focus) {
    if (this.isVisible()) {
      if (selection && selection.length > 0) {
        this.table.setSelection(selection.map((m) => this.findMarkerIndex(m)));
        if (focus && focus.length > 0) {
          this.table.setFocus(focus.map((f) => this.findMarkerIndex(f)));
        } else {
          this.table.setFocus([this.findMarkerIndex(selection[0])]);
        }
        this.table.reveal(this.findMarkerIndex(selection[0]));
      } else if (this.getSelection().length === 0 && this.getVisibleItemCount() > 0) {
        this.table.setSelection([0]);
        this.table.setFocus([0]);
        this.table.reveal(0);
      }
    }
  }
  toggleVisibility(hide) {
    this.container.classList.toggle("hidden", hide);
  }
  update(resourceMarkers) {
    for (const resourceMarker of resourceMarkers) {
      const index = this.resourceMarkers.indexOf(resourceMarker);
      this.resourceMarkers.splice(index, 1, resourceMarker);
    }
    this.reset(this.resourceMarkers);
  }
  updateMarker(marker) {
    this.table.rerender();
  }
  findMarkerIndex(marker) {
    for (let index = 0; index < this.table.length; index++) {
      if (this.table.row(index).marker === marker.marker) {
        return index;
      }
    }
    return -1;
  }
  hasSelectedMarkerFor(resource) {
    const selectedElement = this.getSelection();
    if (selectedElement && selectedElement.length > 0) {
      if (selectedElement[0] instanceof Marker) {
        if (resource.has(selectedElement[0].marker.resource)) {
          return true;
        }
      }
    }
    return false;
  }
};
MarkersTable = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILabelService)
], MarkersTable);
export {
  MarkersTable
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1hcmtlcnNcXGJyb3dzZXJcXG1hcmtlcnNUYWJsZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVRhYmxlQ29udGV4dE1lbnVFdmVudCwgSVRhYmxlRXZlbnQsIElUYWJsZVJlbmRlcmVyLCBJVGFibGVWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdGFibGUvdGFibGUuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5FdmVudCwgSVdvcmtiZW5jaFRhYmxlT3B0aW9ucywgV29ya2JlbmNoVGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSGlnaGxpZ2h0ZWRMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwuanMnO1xuaW1wb3J0IHsgY29tcGFyZU1hcmtlcnNCeVVyaSwgTWFya2VyLCBNYXJrZXJUYWJsZUl0ZW0sIFJlc291cmNlTWFya2VycyB9IGZyb20gJy4vbWFya2Vyc01vZGVsLmpzJztcbmltcG9ydCB7IE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBTZXZlcml0eUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2V2ZXJpdHlJY29uL3NldmVyaXR5SWNvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IEZpbHRlck9wdGlvbnMgfSBmcm9tICcuL21hcmtlcnNGaWx0ZXJPcHRpb25zLmpzJztcbmltcG9ydCB7IExpbmsgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvYnJvd3Nlci9saW5rLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgTWFya2Vyc1ZpZXdNb2RlbCB9IGZyb20gJy4vbWFya2Vyc1RyZWVWaWV3ZXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUXVpY2tGaXhBY3Rpb24sIFF1aWNrRml4QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuL21hcmtlcnNWaWV3QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2V2ZW50LmpzJztcbmltcG9ydCBNZXNzYWdlcyBmcm9tICcuL21lc3NhZ2VzLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVByb2JsZW1zV2lkZ2V0IH0gZnJvbSAnLi9tYXJrZXJzVmlldy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IHVuc3VwcG9ydGVkU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5pbnRlcmZhY2UgSU1hcmtlckljb25Db2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBpY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5pbnRlcmZhY2UgSU1hcmtlckNvZGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb2RlQ29sdW1uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgc291cmNlTGFiZWw6IEhpZ2hsaWdodGVkTGFiZWw7XG5cdHJlYWRvbmx5IGNvZGVMYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0cmVhZG9ubHkgY29kZUxpbms6IExpbms7XG5cdHJlYWRvbmx5IHRlbXBsYXRlRGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5pbnRlcmZhY2UgSU1hcmtlckZpbGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb2x1bW5FbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZmlsZUxhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXHRyZWFkb25seSBwb3NpdGlvbkxhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xufVxuXG5cbmludGVyZmFjZSBJTWFya2VySGlnaGxpZ2h0ZWRMYWJlbENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGNvbHVtbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBoaWdobGlnaHRlZExhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xufVxuXG5jbGFzcyBNYXJrZXJTZXZlcml0eUNvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8TWFya2VyVGFibGVJdGVtLCBJTWFya2VySWNvbkNvbHVtblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdzZXZlcml0eSc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gTWFya2VyU2V2ZXJpdHlDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1hcmtlcnNWaWV3TW9kZWw6IE1hcmtlcnNWaWV3TW9kZWwsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU1hcmtlckljb25Db2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IHNldmVyaXR5Q29sdW1uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXZlcml0eScpKTtcblx0XHRjb25zdCBpY29uID0gRE9NLmFwcGVuZChzZXZlcml0eUNvbHVtbiwgJCgnJykpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyQ29sdW1uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoYWN0aW9uQmFyQ29sdW1uLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zKSA9PiBhY3Rpb24uaWQgPT09IFF1aWNrRml4QWN0aW9uLklEID8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShRdWlja0ZpeEFjdGlvblZpZXdJdGVtLCA8UXVpY2tGaXhBY3Rpb24+YWN0aW9uLCBvcHRpb25zKSA6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHsgYWN0aW9uQmFyLCBpY29uLCBlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBNYXJrZXJUYWJsZUl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1hcmtlckljb25Db2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCB0b2dnbGVRdWlja0ZpeCA9IChlbmFibGVkPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKCFpc1VuZGVmaW5lZE9yTnVsbChlbmFibGVkKSkge1xuXHRcdFx0XHRjb25zdCBjb250YWluZXIgPSBET00uZmluZFBhcmVudFdpdGhDbGFzcyh0ZW1wbGF0ZURhdGEuaWNvbiwgJ21vbmFjby10YWJsZS10ZCcpITtcblx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3F1aWNrRml4JywgZW5hYmxlZCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlbXBsYXRlRGF0YS5pY29uLnRpdGxlID0gTWFya2VyU2V2ZXJpdHkudG9TdHJpbmcoZWxlbWVudC5tYXJrZXIuc2V2ZXJpdHkpO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSA9IGBtYXJrZXItaWNvbiAke1NldmVyaXR5LnRvU3RyaW5nKE1hcmtlclNldmVyaXR5LnRvU2V2ZXJpdHkoZWxlbWVudC5tYXJrZXIuc2V2ZXJpdHkpKX0gY29kaWNvbiAke1NldmVyaXR5SWNvbi5jbGFzc05hbWUoTWFya2VyU2V2ZXJpdHkudG9TZXZlcml0eShlbGVtZW50Lm1hcmtlci5zZXZlcml0eSkpfWA7XG5cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5tYXJrZXJzVmlld01vZGVsLmdldFZpZXdNb2RlbChlbGVtZW50KTtcblx0XHRpZiAodmlld01vZGVsKSB7XG5cdFx0XHRjb25zdCBxdWlja0ZpeEFjdGlvbiA9IHZpZXdNb2RlbC5xdWlja0ZpeEFjdGlvbjtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChbcXVpY2tGaXhBY3Rpb25dLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRcdHRvZ2dsZVF1aWNrRml4KHZpZXdNb2RlbC5xdWlja0ZpeEFjdGlvbi5lbmFibGVkKTtcblxuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQocXVpY2tGaXhBY3Rpb24ub25EaWRDaGFuZ2UoKHsgZW5hYmxlZCB9KSA9PiB0b2dnbGVRdWlja0ZpeChlbmFibGVkKSkpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQocXVpY2tGaXhBY3Rpb24ub25TaG93UXVpY2tGaXhlcygoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHF1aWNrRml4QWN0aW9uVmlld0l0ZW0gPSA8UXVpY2tGaXhBY3Rpb25WaWV3SXRlbT50ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnZpZXdJdGVtc1swXTtcblx0XHRcdFx0aWYgKHF1aWNrRml4QWN0aW9uVmlld0l0ZW0pIHtcblx0XHRcdFx0XHRxdWlja0ZpeEFjdGlvblZpZXdJdGVtLnNob3dRdWlja0ZpeGVzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJTWFya2VySWNvbkNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE1hcmtlckNvZGVDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPE1hcmtlclRhYmxlSXRlbSwgSU1hcmtlckNvZGVDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2NvZGUnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IE1hcmtlckNvZGVDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZVxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJTWFya2VyQ29kZUNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvZGVDb2x1bW4gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNvZGUnKSk7XG5cblx0XHRjb25zdCBzb3VyY2VMYWJlbCA9IHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwoY29kZUNvbHVtbikpO1xuXHRcdHNvdXJjZUxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc291cmNlLWxhYmVsJyk7XG5cblx0XHRjb25zdCBjb2RlTGFiZWwgPSB0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKGNvZGVDb2x1bW4pKTtcblx0XHRjb2RlTGFiZWwuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjb2RlLWxhYmVsJyk7XG5cblx0XHRjb25zdCBjb2RlTGluayA9IHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IExpbmsoY29kZUNvbHVtbiwgeyBocmVmOiAnJywgbGFiZWw6ICcnIH0sIHt9LCB0aGlzLmhvdmVyU2VydmljZSwgdGhpcy5vcGVuZXJTZXJ2aWNlKSk7XG5cblx0XHRyZXR1cm4geyBjb2RlQ29sdW1uLCBzb3VyY2VMYWJlbCwgY29kZUxhYmVsLCBjb2RlTGluaywgdGVtcGxhdGVEaXNwb3NhYmxlIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IE1hcmtlclRhYmxlSXRlbSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJTWFya2VyQ29kZUNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5jb2RlQ29sdW1uLmNsYXNzTGlzdC5yZW1vdmUoJ2NvZGUtbGFiZWwnKTtcblx0XHR0ZW1wbGF0ZURhdGEuY29kZUNvbHVtbi5jbGFzc0xpc3QucmVtb3ZlKCdjb2RlLWxpbmsnKTtcblxuXHRcdGlmIChlbGVtZW50Lm1hcmtlci5zb3VyY2UgJiYgZWxlbWVudC5tYXJrZXIuY29kZSkge1xuXHRcdFx0aWYgKHR5cGVvZiBlbGVtZW50Lm1hcmtlci5jb2RlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuY29kZUNvbHVtbi5jbGFzc0xpc3QuYWRkKCdjb2RlLWxhYmVsJyk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jb2RlQ29sdW1uLnRpdGxlID0gYCR7ZWxlbWVudC5tYXJrZXIuc291cmNlfSAoJHtlbGVtZW50Lm1hcmtlci5jb2RlfSlgO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc291cmNlTGFiZWwuc2V0KGVsZW1lbnQubWFya2VyLnNvdXJjZSwgZWxlbWVudC5zb3VyY2VNYXRjaGVzKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmNvZGVMYWJlbC5zZXQoZWxlbWVudC5tYXJrZXIuY29kZSwgZWxlbWVudC5jb2RlTWF0Y2hlcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuY29kZUNvbHVtbi5jbGFzc0xpc3QuYWRkKCdjb2RlLWxpbmsnKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmNvZGVDb2x1bW4udGl0bGUgPSBgJHtlbGVtZW50Lm1hcmtlci5zb3VyY2V9ICgke2VsZW1lbnQubWFya2VyLmNvZGUudmFsdWV9KWA7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5zb3VyY2VMYWJlbC5zZXQoZWxlbWVudC5tYXJrZXIuc291cmNlLCBlbGVtZW50LnNvdXJjZU1hdGNoZXMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvZGVMaW5rTGFiZWwgPSB0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlLmFkZChuZXcgSGlnaGxpZ2h0ZWRMYWJlbCgkKCcuY29kZS1saW5rLWxhYmVsJykpKTtcblx0XHRcdFx0Y29kZUxpbmtMYWJlbC5zZXQoZWxlbWVudC5tYXJrZXIuY29kZS52YWx1ZSwgZWxlbWVudC5jb2RlTWF0Y2hlcyk7XG5cblx0XHRcdFx0dGVtcGxhdGVEYXRhLmNvZGVMaW5rLmxpbmsgPSB7XG5cdFx0XHRcdFx0aHJlZjogZWxlbWVudC5tYXJrZXIuY29kZS50YXJnZXQudG9TdHJpbmcodHJ1ZSksXG5cdFx0XHRcdFx0dGl0bGU6IGVsZW1lbnQubWFya2VyLmNvZGUudGFyZ2V0LnRvU3RyaW5nKHRydWUpLFxuXHRcdFx0XHRcdGxhYmVsOiBjb2RlTGlua0xhYmVsLmVsZW1lbnQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb2RlQ29sdW1uLnRpdGxlID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc291cmNlTGFiZWwuc2V0KCctJyk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU1hcmtlckNvZGVDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBNYXJrZXJNZXNzYWdlQ29sdW1uUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxNYXJrZXJUYWJsZUl0ZW0sIElNYXJrZXJIaWdobGlnaHRlZExhYmVsQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ21lc3NhZ2UnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IE1hcmtlck1lc3NhZ2VDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU1hcmtlckhpZ2hsaWdodGVkTGFiZWxDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGNvbHVtbkVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1lc3NhZ2UnKSk7XG5cdFx0Y29uc3QgaGlnaGxpZ2h0ZWRMYWJlbCA9IG5ldyBIaWdobGlnaHRlZExhYmVsKGNvbHVtbkVsZW1lbnQpO1xuXG5cdFx0cmV0dXJuIHsgY29sdW1uRWxlbWVudCwgaGlnaGxpZ2h0ZWRMYWJlbCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBNYXJrZXJUYWJsZUl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1hcmtlckhpZ2hsaWdodGVkTGFiZWxDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY29sdW1uRWxlbWVudC50aXRsZSA9IGVsZW1lbnQubWFya2VyLm1lc3NhZ2U7XG5cdFx0dGVtcGxhdGVEYXRhLmhpZ2hsaWdodGVkTGFiZWwuc2V0KGVsZW1lbnQubWFya2VyLm1lc3NhZ2UsIGVsZW1lbnQubWVzc2FnZU1hdGNoZXMpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU1hcmtlckhpZ2hsaWdodGVkTGFiZWxDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuaGlnaGxpZ2h0ZWRMYWJlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTWFya2VyRmlsZUNvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8TWFya2VyVGFibGVJdGVtLCBJTWFya2VyRmlsZUNvbHVtblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdmaWxlJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBNYXJrZXJGaWxlQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2Vcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU1hcmtlckZpbGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGNvbHVtbkVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmZpbGUnKSk7XG5cdFx0Y29uc3QgZmlsZUxhYmVsID0gbmV3IEhpZ2hsaWdodGVkTGFiZWwoY29sdW1uRWxlbWVudCk7XG5cdFx0ZmlsZUxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZmlsZS1sYWJlbCcpO1xuXHRcdGNvbnN0IHBvc2l0aW9uTGFiZWwgPSBuZXcgSGlnaGxpZ2h0ZWRMYWJlbChjb2x1bW5FbGVtZW50KTtcblx0XHRwb3NpdGlvbkxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZmlsZS1wb3NpdGlvbicpO1xuXG5cdFx0cmV0dXJuIHsgY29sdW1uRWxlbWVudCwgZmlsZUxhYmVsLCBwb3NpdGlvbkxhYmVsIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IE1hcmtlclRhYmxlSXRlbSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJTWFya2VyRmlsZUNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHBvc2l0aW9uTGFiZWwgPSBNZXNzYWdlcy5NQVJLRVJTX1BBTkVMX0FUX0xJTkVfQ09MX05VTUJFUihlbGVtZW50Lm1hcmtlci5zdGFydExpbmVOdW1iZXIsIGVsZW1lbnQubWFya2VyLnN0YXJ0Q29sdW1uKTtcblxuXHRcdHRlbXBsYXRlRGF0YS5jb2x1bW5FbGVtZW50LnRpdGxlID0gYCR7dGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWxlbWVudC5tYXJrZXIucmVzb3VyY2UsIHsgcmVsYXRpdmU6IGZhbHNlIH0pfSAke3Bvc2l0aW9uTGFiZWx9YDtcblx0XHR0ZW1wbGF0ZURhdGEuZmlsZUxhYmVsLnNldCh0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlbGVtZW50Lm1hcmtlci5yZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSwgZWxlbWVudC5maWxlTWF0Y2hlcyk7XG5cdFx0dGVtcGxhdGVEYXRhLnBvc2l0aW9uTGFiZWwuc2V0KHBvc2l0aW9uTGFiZWwsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJTWFya2VyRmlsZUNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5maWxlTGFiZWwuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5wb3NpdGlvbkxhYmVsLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBNYXJrZXJTb3VyY2VDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPE1hcmtlclRhYmxlSXRlbSwgSU1hcmtlckhpZ2hsaWdodGVkTGFiZWxDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnc291cmNlJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBNYXJrZXJTb3VyY2VDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU1hcmtlckhpZ2hsaWdodGVkTGFiZWxDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGNvbHVtbkVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNvdXJjZScpKTtcblx0XHRjb25zdCBoaWdobGlnaHRlZExhYmVsID0gbmV3IEhpZ2hsaWdodGVkTGFiZWwoY29sdW1uRWxlbWVudCk7XG5cdFx0cmV0dXJuIHsgY29sdW1uRWxlbWVudCwgaGlnaGxpZ2h0ZWRMYWJlbCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBNYXJrZXJUYWJsZUl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1hcmtlckhpZ2hsaWdodGVkTGFiZWxDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY29sdW1uRWxlbWVudC50aXRsZSA9IGVsZW1lbnQubWFya2VyLnNvdXJjZSA/PyAnJztcblx0XHR0ZW1wbGF0ZURhdGEuaGlnaGxpZ2h0ZWRMYWJlbC5zZXQoZWxlbWVudC5tYXJrZXIuc291cmNlID8/ICcnLCBlbGVtZW50LnNvdXJjZU1hdGNoZXMpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU1hcmtlckhpZ2hsaWdodGVkTGFiZWxDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuaGlnaGxpZ2h0ZWRMYWJlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTWFya2Vyc1RhYmxlVmlydHVhbERlbGVnYXRlIGltcGxlbWVudHMgSVRhYmxlVmlydHVhbERlbGVnYXRlPE1hcmtlclRhYmxlSXRlbT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSEVBREVSX1JPV19IRUlHSFQgPSAyNDtcblx0c3RhdGljIHJlYWRvbmx5IFJPV19IRUlHSFQgPSAyNDtcblx0cmVhZG9ubHkgaGVhZGVyUm93SGVpZ2h0ID0gTWFya2Vyc1RhYmxlVmlydHVhbERlbGVnYXRlLkhFQURFUl9ST1dfSEVJR0hUO1xuXG5cdGdldEhlaWdodChpdGVtOiBNYXJrZXJUYWJsZUl0ZW0pIHtcblx0XHRyZXR1cm4gTWFya2Vyc1RhYmxlVmlydHVhbERlbGVnYXRlLlJPV19IRUlHSFQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtlcnNUYWJsZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJvYmxlbXNXaWRnZXQge1xuXG5cdHByaXZhdGUgX2l0ZW1Db3VudDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSB0YWJsZTogV29ya2JlbmNoVGFibGU8TWFya2VyVGFibGVJdGVtPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYXJrZXJzVmlld01vZGVsOiBNYXJrZXJzVmlld01vZGVsLFxuXHRcdHByaXZhdGUgcmVzb3VyY2VNYXJrZXJzOiBSZXNvdXJjZU1hcmtlcnNbXSxcblx0XHRwcml2YXRlIGZpbHRlck9wdGlvbnM6IEZpbHRlck9wdGlvbnMsXG5cdFx0b3B0aW9uczogSVdvcmtiZW5jaFRhYmxlT3B0aW9uczxNYXJrZXJUYWJsZUl0ZW0+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy50YWJsZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVGFibGUsXG5cdFx0XHQnTWFya2VycycsXG5cdFx0XHR0aGlzLmNvbnRhaW5lcixcblx0XHRcdG5ldyBNYXJrZXJzVGFibGVWaXJ0dWFsRGVsZWdhdGUoKSxcblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDAsXG5cdFx0XHRcdFx0bWluaW11bVdpZHRoOiAzNixcblx0XHRcdFx0XHRtYXhpbXVtV2lkdGg6IDM2LFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IE1hcmtlclNldmVyaXR5Q29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IE1hcmtlcik6IE1hcmtlciB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29kZUNvbHVtbkxhYmVsJywgXCJDb2RlXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMSxcblx0XHRcdFx0XHRtaW5pbXVtV2lkdGg6IDEwMCxcblx0XHRcdFx0XHRtYXhpbXVtV2lkdGg6IDMwMCxcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBNYXJrZXJDb2RlQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IE1hcmtlcik6IE1hcmtlciB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWVzc2FnZUNvbHVtbkxhYmVsJywgXCJNZXNzYWdlXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogNCxcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBNYXJrZXJNZXNzYWdlQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IE1hcmtlcik6IE1hcmtlciB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZmlsZUNvbHVtbkxhYmVsJywgXCJGaWxlXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMixcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBNYXJrZXJGaWxlQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IE1hcmtlcik6IE1hcmtlciB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc291cmNlQ29sdW1uTGFiZWwnLCBcIlNvdXJjZVwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDEsXG5cdFx0XHRcdFx0bWluaW11bVdpZHRoOiAxMDAsXG5cdFx0XHRcdFx0bWF4aW11bVdpZHRoOiAzMDAsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogTWFya2VyU291cmNlQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IE1hcmtlcik6IE1hcmtlciB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZXJTZXZlcml0eUNvbHVtblJlbmRlcmVyLCB0aGlzLm1hcmtlcnNWaWV3TW9kZWwpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmtlckNvZGVDb2x1bW5SZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya2VyTWVzc2FnZUNvbHVtblJlbmRlcmVyKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZXJGaWxlQ29sdW1uUmVuZGVyZXIpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmtlclNvdXJjZUNvbHVtblJlbmRlcmVyKSxcblx0XHRcdF0sXG5cdFx0XHRvcHRpb25zXG5cdFx0KSBhcyBXb3JrYmVuY2hUYWJsZTxNYXJrZXJUYWJsZUl0ZW0+O1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgbGlzdCA9IHRoaXMudGFibGUuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWxpc3Qtcm93cycpISBhcyBIVE1MRWxlbWVudDtcblxuXHRcdC8vIG1vdXNlb3Zlci9tb3VzZWxlYXZlIGV2ZW50IGhhbmRsZXJzXG5cdFx0Y29uc3Qgb25Sb3dIb3ZlciA9IEV2ZW50LmNoYWluKHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKGxpc3QsICdtb3VzZW92ZXInKSkuZXZlbnQsICQgPT5cblx0XHRcdCQubWFwKGUgPT4gRE9NLmZpbmRQYXJlbnRXaXRoQ2xhc3MoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQsICdtb25hY28tbGlzdC1yb3cnLCAnbW9uYWNvLWxpc3Qtcm93cycpKVxuXHRcdFx0XHQuZmlsdGVyPEhUTUxFbGVtZW50PihlID0+ICEhZSlcblx0XHRcdFx0Lm1hcChlID0+IHBhcnNlSW50KGUuZ2V0QXR0cmlidXRlKCdkYXRhLWluZGV4JykhKSlcblx0XHQpO1xuXG5cdFx0Y29uc3Qgb25MaXN0TGVhdmUgPSBFdmVudC5tYXAodGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIobGlzdCwgJ21vdXNlbGVhdmUnKSkuZXZlbnQsICgpID0+IC0xKTtcblxuXHRcdGNvbnN0IG9uUm93SG92ZXJPckxlYXZlID0gRXZlbnQubGF0Y2goRXZlbnQuYW55KG9uUm93SG92ZXIsIG9uTGlzdExlYXZlKSk7XG5cdFx0Y29uc3Qgb25Sb3dQZXJtYW5lbnRIb3ZlciA9IEV2ZW50LmRlYm91bmNlKG9uUm93SG92ZXJPckxlYXZlLCAoXywgZSkgPT4gZSwgNTAwKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uUm93UGVybWFuZW50SG92ZXIoZSA9PiB7XG5cdFx0XHRpZiAoZSAhPT0gLTEgJiYgdGhpcy50YWJsZS5yb3coZSkpIHtcblx0XHRcdFx0dGhpcy5tYXJrZXJzVmlld01vZGVsLm9uTWFya2VyTW91c2VIb3Zlcih0aGlzLnRhYmxlLnJvdyhlKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IGNvbnRleHRLZXlTZXJ2aWNlKCk6IElDb250ZXh0S2V5U2VydmljZSB7XG5cdFx0cmV0dXJuIHRoaXMudGFibGUuY29udGV4dEtleVNlcnZpY2U7XG5cdH1cblxuXHRnZXQgb25Db250ZXh0TWVudSgpOiBFdmVudDxJVGFibGVDb250ZXh0TWVudUV2ZW50PE1hcmtlclRhYmxlSXRlbT4+IHtcblx0XHRyZXR1cm4gdGhpcy50YWJsZS5vbkNvbnRleHRNZW51O1xuXHR9XG5cblx0Z2V0IG9uRGlkT3BlbigpOiBFdmVudDxJT3BlbkV2ZW50PE1hcmtlclRhYmxlSXRlbSB8IHVuZGVmaW5lZD4+IHtcblx0XHRyZXR1cm4gdGhpcy50YWJsZS5vbkRpZE9wZW47XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VGb2N1cygpOiBFdmVudDxJVGFibGVFdmVudDxNYXJrZXJUYWJsZUl0ZW0+PiB7XG5cdFx0cmV0dXJuIHRoaXMudGFibGUub25EaWRDaGFuZ2VGb2N1cztcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZVNlbGVjdGlvbigpOiBFdmVudDxJVGFibGVFdmVudDxNYXJrZXJUYWJsZUl0ZW0+PiB7XG5cdFx0cmV0dXJuIHRoaXMudGFibGUub25EaWRDaGFuZ2VTZWxlY3Rpb247XG5cdH1cblxuXHRjb2xsYXBzZU1hcmtlcnMoKTogdm9pZCB7IH1cblxuXHRkb21Gb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLnRhYmxlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRmaWx0ZXJNYXJrZXJzKHJlc291cmNlTWFya2VyczogUmVzb3VyY2VNYXJrZXJzW10sIGZpbHRlck9wdGlvbnM6IEZpbHRlck9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLmZpbHRlck9wdGlvbnMgPSBmaWx0ZXJPcHRpb25zO1xuXHRcdHRoaXMucmVzZXQocmVzb3VyY2VNYXJrZXJzKTtcblx0fVxuXG5cdGdldEZvY3VzKCk6IChNYXJrZXJUYWJsZUl0ZW0gfCBudWxsKVtdIHtcblx0XHRjb25zdCBmb2N1cyA9IHRoaXMudGFibGUuZ2V0Rm9jdXMoKTtcblx0XHRyZXR1cm4gZm9jdXMubGVuZ3RoID4gMCA/IFsuLi5mb2N1cy5tYXAoZiA9PiB0aGlzLnRhYmxlLnJvdyhmKSldIDogW107XG5cdH1cblxuXHRnZXRIVE1MRWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMudGFibGUuZ2V0SFRNTEVsZW1lbnQoKTtcblx0fVxuXG5cdGdldFJlbGF0aXZlVG9wKG1hcmtlcjogTWFya2VyVGFibGVJdGVtIHwgbnVsbCk6IG51bWJlciB8IG51bGwge1xuXHRcdHJldHVybiBtYXJrZXIgPyB0aGlzLnRhYmxlLmdldFJlbGF0aXZlVG9wKHRoaXMudGFibGUuaW5kZXhPZihtYXJrZXIpKSA6IG51bGw7XG5cdH1cblxuXHRnZXRTZWxlY3Rpb24oKTogKE1hcmtlclRhYmxlSXRlbSB8IG51bGwpW10ge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMudGFibGUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0cmV0dXJuIHNlbGVjdGlvbi5sZW5ndGggPiAwID8gWy4uLnNlbGVjdGlvbi5tYXAoaSA9PiB0aGlzLnRhYmxlLnJvdyhpKSldIDogW107XG5cdH1cblxuXHRnZXRWaXNpYmxlSXRlbUNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2l0ZW1Db3VudDtcblx0fVxuXG5cdGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGlkZGVuJyk7XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdHRoaXMudGFibGUubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0cmVzZXQocmVzb3VyY2VNYXJrZXJzOiBSZXNvdXJjZU1hcmtlcnNbXSk6IHZvaWQge1xuXHRcdHRoaXMucmVzb3VyY2VNYXJrZXJzID0gcmVzb3VyY2VNYXJrZXJzO1xuXG5cdFx0Y29uc3QgaXRlbXM6IE1hcmtlclRhYmxlSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZU1hcmtlciBvZiB0aGlzLnJlc291cmNlTWFya2Vycykge1xuXHRcdFx0Zm9yIChjb25zdCBtYXJrZXIgb2YgcmVzb3VyY2VNYXJrZXIubWFya2Vycykge1xuXHRcdFx0XHRpZiAodW5zdXBwb3J0ZWRTY2hlbWFzLmhhcyhtYXJrZXIucmVzb3VyY2Uuc2NoZW1lKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRXhjbHVkZSBwYXR0ZXJuXG5cdFx0XHRcdGlmICh0aGlzLmZpbHRlck9wdGlvbnMuZXhjbHVkZXNNYXRjaGVyLm1hdGNoZXMobWFya2VyLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSW5jbHVkZSBwYXR0ZXJuXG5cdFx0XHRcdGlmICh0aGlzLmZpbHRlck9wdGlvbnMuaW5jbHVkZXNNYXRjaGVyLm1hdGNoZXMobWFya2VyLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2gobmV3IE1hcmtlclRhYmxlSXRlbShtYXJrZXIpKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNldmVyaXR5IGZpbHRlclxuXHRcdFx0XHRjb25zdCBtYXRjaGVzU2V2ZXJpdHkgPSB0aGlzLmZpbHRlck9wdGlvbnMuc2hvd0Vycm9ycyAmJiBNYXJrZXJTZXZlcml0eS5FcnJvciA9PT0gbWFya2VyLm1hcmtlci5zZXZlcml0eSB8fFxuXHRcdFx0XHRcdHRoaXMuZmlsdGVyT3B0aW9ucy5zaG93V2FybmluZ3MgJiYgTWFya2VyU2V2ZXJpdHkuV2FybmluZyA9PT0gbWFya2VyLm1hcmtlci5zZXZlcml0eSB8fFxuXHRcdFx0XHRcdHRoaXMuZmlsdGVyT3B0aW9ucy5zaG93SW5mb3MgJiYgTWFya2VyU2V2ZXJpdHkuSW5mbyA9PT0gbWFya2VyLm1hcmtlci5zZXZlcml0eTtcblxuXHRcdFx0XHRpZiAoIW1hdGNoZXNTZXZlcml0eSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU291cmNlIGZpbHRlcnNcblx0XHRcdFx0aWYgKCF0aGlzLmZpbHRlck9wdGlvbnMubWF0Y2hlc1NvdXJjZUZpbHRlcnMobWFya2VyLm1hcmtlci5zb3VyY2UpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUZXh0IGZpbHRlclxuXHRcdFx0XHRpZiAodGhpcy5maWx0ZXJPcHRpb25zLnRleHRGaWx0ZXIudGV4dCkge1xuXHRcdFx0XHRcdGNvbnN0IHNvdXJjZU1hdGNoZXMgPSBtYXJrZXIubWFya2VyLnNvdXJjZSA/IEZpbHRlck9wdGlvbnMuX2ZpbHRlcih0aGlzLmZpbHRlck9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCBtYXJrZXIubWFya2VyLnNvdXJjZSkgPz8gdW5kZWZpbmVkIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGNvZGVNYXRjaGVzID0gbWFya2VyLm1hcmtlci5jb2RlID8gRmlsdGVyT3B0aW9ucy5fZmlsdGVyKHRoaXMuZmlsdGVyT3B0aW9ucy50ZXh0RmlsdGVyLnRleHQsIHR5cGVvZiBtYXJrZXIubWFya2VyLmNvZGUgPT09ICdzdHJpbmcnID8gbWFya2VyLm1hcmtlci5jb2RlIDogbWFya2VyLm1hcmtlci5jb2RlLnZhbHVlKSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZU1hdGNoZXMgPSBGaWx0ZXJPcHRpb25zLl9tZXNzYWdlRmlsdGVyKHRoaXMuZmlsdGVyT3B0aW9ucy50ZXh0RmlsdGVyLnRleHQsIG1hcmtlci5tYXJrZXIubWVzc2FnZSkgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVNYXRjaGVzID0gRmlsdGVyT3B0aW9ucy5fbWVzc2FnZUZpbHRlcih0aGlzLmZpbHRlck9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChtYXJrZXIucmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSkpID8/IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdGNvbnN0IG1hdGNoZWQgPSBzb3VyY2VNYXRjaGVzIHx8IGNvZGVNYXRjaGVzIHx8IG1lc3NhZ2VNYXRjaGVzIHx8IGZpbGVNYXRjaGVzO1xuXHRcdFx0XHRcdGlmICgobWF0Y2hlZCAmJiAhdGhpcy5maWx0ZXJPcHRpb25zLnRleHRGaWx0ZXIubmVnYXRlKSB8fCAoIW1hdGNoZWQgJiYgdGhpcy5maWx0ZXJPcHRpb25zLnRleHRGaWx0ZXIubmVnYXRlKSkge1xuXHRcdFx0XHRcdFx0aXRlbXMucHVzaChuZXcgTWFya2VyVGFibGVJdGVtKG1hcmtlciwgc291cmNlTWF0Y2hlcywgY29kZU1hdGNoZXMsIG1lc3NhZ2VNYXRjaGVzLCBmaWxlTWF0Y2hlcykpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aXRlbXMucHVzaChuZXcgTWFya2VyVGFibGVJdGVtKG1hcmtlcikpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9pdGVtQ291bnQgPSBpdGVtcy5sZW5ndGg7XG5cdFx0dGhpcy50YWJsZS5zcGxpY2UoMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBpdGVtcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRsZXQgcmVzdWx0ID0gTWFya2VyU2V2ZXJpdHkuY29tcGFyZShhLm1hcmtlci5zZXZlcml0eSwgYi5tYXJrZXIuc2V2ZXJpdHkpO1xuXG5cdFx0XHRpZiAocmVzdWx0ID09PSAwKSB7XG5cdFx0XHRcdHJlc3VsdCA9IGNvbXBhcmVNYXJrZXJzQnlVcmkoYS5tYXJrZXIsIGIubWFya2VyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc3VsdCA9PT0gMCkge1xuXHRcdFx0XHRyZXN1bHQgPSBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYS5tYXJrZXIsIGIubWFya2VyKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KSk7XG5cdH1cblxuXHRyZXZlYWxNYXJrZXJzKGFjdGl2ZVJlc291cmNlOiBSZXNvdXJjZU1hcmtlcnMgfCBudWxsLCBmb2N1czogYm9vbGVhbiwgbGFzdFNlbGVjdGVkUmVsYXRpdmVUb3A6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChhY3RpdmVSZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgYWN0aXZlUmVzb3VyY2VJbmRleCA9IHRoaXMucmVzb3VyY2VNYXJrZXJzLmluZGV4T2YoYWN0aXZlUmVzb3VyY2UpO1xuXG5cdFx0XHRpZiAoYWN0aXZlUmVzb3VyY2VJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0aWYgKHRoaXMuaGFzU2VsZWN0ZWRNYXJrZXJGb3IoYWN0aXZlUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFibGVTZWxlY3Rpb24gPSB0aGlzLnRhYmxlLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMudGFibGUucmV2ZWFsKHRhYmxlU2VsZWN0aW9uWzBdLCBsYXN0U2VsZWN0ZWRSZWxhdGl2ZVRvcCk7XG5cblx0XHRcdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0XHRcdHRoaXMudGFibGUuc2V0Rm9jdXModGFibGVTZWxlY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnRhYmxlLnJldmVhbChhY3RpdmVSZXNvdXJjZUluZGV4LCAwKTtcblxuXHRcdFx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHRcdFx0dGhpcy50YWJsZS5zZXRGb2N1cyhbYWN0aXZlUmVzb3VyY2VJbmRleF0pO1xuXHRcdFx0XHRcdFx0dGhpcy50YWJsZS5zZXRTZWxlY3Rpb24oW2FjdGl2ZVJlc291cmNlSW5kZXhdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGZvY3VzKSB7XG5cdFx0XHR0aGlzLnRhYmxlLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHR0aGlzLnRhYmxlLmZvY3VzRmlyc3QoKTtcblx0XHR9XG5cdH1cblxuXHRzZXRBcmlhTGFiZWwobGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudGFibGUuZG9tTm9kZS5hcmlhTGFiZWwgPSBsYWJlbDtcblx0fVxuXG5cdHNldE1hcmtlclNlbGVjdGlvbihzZWxlY3Rpb24/OiBNYXJrZXJbXSwgZm9jdXM/OiBNYXJrZXJbXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRpZiAoc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMudGFibGUuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbi5tYXAobSA9PiB0aGlzLmZpbmRNYXJrZXJJbmRleChtKSkpO1xuXG5cdFx0XHRcdGlmIChmb2N1cyAmJiBmb2N1cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy50YWJsZS5zZXRGb2N1cyhmb2N1cy5tYXAoZiA9PiB0aGlzLmZpbmRNYXJrZXJJbmRleChmKSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMudGFibGUuc2V0Rm9jdXMoW3RoaXMuZmluZE1hcmtlckluZGV4KHNlbGVjdGlvblswXSldKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudGFibGUucmV2ZWFsKHRoaXMuZmluZE1hcmtlckluZGV4KHNlbGVjdGlvblswXSkpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmdldFNlbGVjdGlvbigpLmxlbmd0aCA9PT0gMCAmJiB0aGlzLmdldFZpc2libGVJdGVtQ291bnQoKSA+IDApIHtcblx0XHRcdFx0dGhpcy50YWJsZS5zZXRTZWxlY3Rpb24oWzBdKTtcblx0XHRcdFx0dGhpcy50YWJsZS5zZXRGb2N1cyhbMF0pO1xuXHRcdFx0XHR0aGlzLnRhYmxlLnJldmVhbCgwKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0b2dnbGVWaXNpYmlsaXR5KGhpZGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBoaWRlKTtcblx0fVxuXG5cdHVwZGF0ZShyZXNvdXJjZU1hcmtlcnM6IFJlc291cmNlTWFya2Vyc1tdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZU1hcmtlciBvZiByZXNvdXJjZU1hcmtlcnMpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5yZXNvdXJjZU1hcmtlcnMuaW5kZXhPZihyZXNvdXJjZU1hcmtlcik7XG5cdFx0XHR0aGlzLnJlc291cmNlTWFya2Vycy5zcGxpY2UoaW5kZXgsIDEsIHJlc291cmNlTWFya2VyKTtcblx0XHR9XG5cdFx0dGhpcy5yZXNldCh0aGlzLnJlc291cmNlTWFya2Vycyk7XG5cdH1cblxuXHR1cGRhdGVNYXJrZXIobWFya2VyOiBNYXJrZXIpOiB2b2lkIHtcblx0XHR0aGlzLnRhYmxlLnJlcmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRNYXJrZXJJbmRleChtYXJrZXI6IE1hcmtlcik6IG51bWJlciB7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMudGFibGUubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRpZiAodGhpcy50YWJsZS5yb3coaW5kZXgpLm1hcmtlciA9PT0gbWFya2VyLm1hcmtlcikge1xuXHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNTZWxlY3RlZE1hcmtlckZvcihyZXNvdXJjZTogUmVzb3VyY2VNYXJrZXJzKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRFbGVtZW50ID0gdGhpcy5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2VsZWN0ZWRFbGVtZW50ICYmIHNlbGVjdGVkRWxlbWVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoc2VsZWN0ZWRFbGVtZW50WzBdIGluc3RhbmNlb2YgTWFya2VyKSB7XG5cdFx0XHRcdGlmIChyZXNvdXJjZS5oYXMoKDxNYXJrZXI+c2VsZWN0ZWRFbGVtZW50WzBdKS5tYXJrZXIucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsYUFBYTtBQUV0QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQTZDLHNCQUFzQjtBQUNuRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQixRQUFRLHVCQUF3QztBQUM5RSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFlBQVk7QUFDckIsU0FBUyxzQkFBc0I7QUFHL0IsU0FBUyxnQkFBZ0IsOEJBQThCO0FBQ3ZELFNBQVMsa0JBQWtCO0FBQzNCLE9BQU8sY0FBYztBQUNyQixTQUFTLHlCQUF5QjtBQUdsQyxTQUFTLGFBQWE7QUFDdEIsU0FBUywwQkFBMEI7QUFDbkMsT0FBTyxjQUFjO0FBQ3JCLFNBQVMscUJBQXFCO0FBRTlCLE1BQU0sSUFBSSxJQUFJO0FBNEJkLElBQU0sK0JBQU4sTUFBNkc7QUFBQSxFQU01RyxZQUNrQixrQkFDdUIsc0JBQ3ZDO0FBRmdCO0FBQ3VCO0FBSnpDLFNBQVMsYUFBcUIsNkJBQTZCO0FBQUEsRUFLdkQ7QUFBQSxFQUVKLGVBQWUsV0FBdUQ7QUFDckUsVUFBTSxpQkFBaUIsSUFBSSxPQUFPLFdBQVcsRUFBRSxXQUFXLENBQUM7QUFDM0QsVUFBTSxPQUFPLElBQUksT0FBTyxnQkFBZ0IsRUFBRSxFQUFFLENBQUM7QUFFN0MsVUFBTSxrQkFBa0IsSUFBSSxPQUFPLFdBQVcsRUFBRSxV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QUFLLE1BQU0sU0FBUyxNQUFNLElBQUksT0FBSyxLQUFLLGdCQUFnQixDQUFDLENBQUMsQ0FBQztBQUFBLFFBQzVELE9BQU87QUFDTixlQUFLLE1BQU0sU0FBUyxDQUFDLEtBQUssZ0JBQWdCLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUFBLFFBQ3pEO0FBRUEsYUFBSyxNQUFNLE9BQU8sS0FBSyxnQkFBZ0IsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ3JELFdBQVcsS0FBSyxhQUFhLEVBQUUsV0FBVyxLQUFLLEtBQUssb0JBQW9CLElBQUksR0FBRztBQUM5RSxhQUFLLE1BQU0sYUFBYSxDQUFDLENBQUMsQ0FBQztBQUMzQixhQUFLLE1BQU0sU0FBUyxDQUFDLENBQUMsQ0FBQztBQUN2QixhQUFLLE1BQU0sT0FBTyxDQUFDO0FBQUEsTUFDcEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsaUJBQWlCLE1BQXFCO0FBQ3JDLFNBQUssVUFBVSxVQUFVLE9BQU8sVUFBVSxJQUFJO0FBQUEsRUFDL0M7QUFBQSxFQUVBLE9BQU8saUJBQTBDO0FBQ2hELGVBQVcsa0JBQWtCLGlCQUFpQjtBQUM3QyxZQUFNLFFBQVEsS0FBSyxnQkFBZ0IsUUFBUSxjQUFjO0FBQ3pELFdBQUssZ0JBQWdCLE9BQU8sT0FBTyxHQUFHLGNBQWM7QUFBQSxJQUNyRDtBQUNBLFNBQUssTUFBTSxLQUFLLGVBQWU7QUFBQSxFQUNoQztBQUFBLEVBRUEsYUFBYSxRQUFzQjtBQUNsQyxTQUFLLE1BQU0sU0FBUztBQUFBLEVBQ3JCO0FBQUEsRUFFUSxnQkFBZ0IsUUFBd0I7QUFDL0MsYUFBUyxRQUFRLEdBQUcsUUFBUSxLQUFLLE1BQU0sUUFBUSxTQUFTO0FBQ3ZELFVBQUksS0FBSyxNQUFNLElBQUksS0FBSyxFQUFFLFdBQVcsT0FBTyxRQUFRO0FBQ25ELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxxQkFBcUIsVUFBb0M7QUFDaEUsVUFBTSxrQkFBa0IsS0FBSyxhQUFhO0FBQzFDLFFBQUksbUJBQW1CLGdCQUFnQixTQUFTLEdBQUc7QUFDbEQsVUFBSSxnQkFBZ0IsQ0FBQyxhQUFhLFFBQVE7QUFDekMsWUFBSSxTQUFTLElBQWEsZ0JBQWdCLENBQUMsRUFBRyxPQUFPLFFBQVEsR0FBRztBQUMvRCxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUEzVGEsZUFBTjtBQUFBLEVBV0o7QUFBQSxFQUNBO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFsiJCJdCn0K
