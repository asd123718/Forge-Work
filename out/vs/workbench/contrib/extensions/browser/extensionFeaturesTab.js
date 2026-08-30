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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { $, append, clearNode, addDisposableListener, EventType } from "../../../../base/browser/dom.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { Orientation, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { Extensions, IExtensionFeaturesManagementService } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { localize } from "../../../../nls.js";
import { WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { getExtensionId } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles, defaultKeybindingLabelStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { PANEL_SECTION_BORDER } from "../../../common/theme.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import Severity from "../../../../base/common/severity.js";
import { errorIcon, infoIcon, warningIcon } from "./extensionsIcons.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { OS } from "../../../../base/common/platform.js";
import { MarkdownString, isMarkdownString } from "../../../../base/common/htmlContent.js";
import { Color } from "../../../../base/common/color.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ResolvedKeybinding } from "../../../../base/common/keybindings.js";
import { asCssVariable } from "../../../../platform/theme/common/colorUtils.js";
import { foreground, chartAxis, chartGuide, chartLine } from "../../../../platform/theme/common/colorRegistry.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
let RuntimeStatusMarkdownRenderer = class extends Disposable {
  constructor(extensionService, hoverService, extensionFeaturesManagementService, markdownRendererService) {
    super();
    this.extensionService = extensionService;
    this.hoverService = hoverService;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.markdownRendererService = markdownRendererService;
    this.type = "element";
  }
  shouldRender(manifest) {
    const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
    if (!this.extensionService.extensions.some((e) => ExtensionIdentifier.equals(e.identifier, extensionId))) {
      return false;
    }
    return !!manifest.main || !!manifest.browser;
  }
  render(manifest) {
    const disposables = new DisposableStore();
    const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
    const emitter = disposables.add(new Emitter());
    disposables.add(this.extensionService.onDidChangeExtensionsStatus((e) => {
      if (e.some((extension) => ExtensionIdentifier.equals(extension, extensionId))) {
        emitter.fire(this.createElement(manifest, disposables));
      }
    }));
    disposables.add(this.extensionFeaturesManagementService.onDidChangeAccessData((e) => emitter.fire(this.createElement(manifest, disposables))));
    return {
      onDidChange: emitter.event,
      data: this.createElement(manifest, disposables),
      dispose: () => disposables.dispose()
    };
  }
  createElement(manifest, disposables) {
    const container = $(".runtime-status");
    const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
    const status = this.extensionService.getExtensionsStatus()[extensionId.value];
    if (this.extensionService.extensions.some((extension) => ExtensionIdentifier.equals(extension.identifier, extensionId))) {
      const data = new MarkdownString();
      data.appendMarkdown(`### ${localize("activation", "Activation")}

`);
      if (status.activationTimes) {
        if (status.activationTimes.activationReason.startup) {
          data.appendMarkdown(`Activated on Startup: \`${status.activationTimes.activateCallTime}ms\``);
        } else {
          data.appendMarkdown(`Activated by \`${status.activationTimes.activationReason.activationEvent}\` event: \`${status.activationTimes.activateCallTime}ms\``);
        }
      } else {
        data.appendMarkdown("Not yet activated");
      }
      this.renderMarkdown(data, container, disposables);
    }
    const features = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
    for (const feature of features) {
      const accessData = this.extensionFeaturesManagementService.getAccessData(extensionId, feature.id);
      if (accessData) {
        this.renderMarkdown(new MarkdownString(`
 ### ${localize("label", "{0} Usage", feature.label)}

`), container, disposables);
        if (accessData.accessTimes.length) {
          const description = append(
            container,
            $(
              ".feature-chart-description",
              void 0,
              localize("chartDescription", "There were {0} {1} requests from this extension in the last 30 days.", accessData?.accessTimes.length, feature.accessDataLabel ?? feature.label)
            )
          );
          description.style.marginBottom = "8px";
          this.renderRequestsChart(container, accessData.accessTimes, disposables);
        }
        const status2 = accessData?.current?.status;
        if (status2) {
          const data = new MarkdownString();
          if (status2?.severity === Severity.Error) {
            data.appendMarkdown(`$(${errorIcon.id}) ${status2.message}

`);
          }
          if (status2?.severity === Severity.Warning) {
            data.appendMarkdown(`$(${warningIcon.id}) ${status2.message}

`);
          }
          if (data.value) {
            this.renderMarkdown(data, container, disposables);
          }
        }
      }
    }
    if (status.runtimeErrors.length || status.messages.length) {
      const data = new MarkdownString();
      if (status.runtimeErrors.length) {
        data.appendMarkdown(`
 ### ${localize("uncaught errors", "Uncaught Errors ({0})", status.runtimeErrors.length)}
`);
        for (const error of status.runtimeErrors) {
          data.appendMarkdown(`$(${Codicon.error.id})&nbsp;${getErrorMessage(error)}

`);
        }
      }
      if (status.messages.length) {
        data.appendMarkdown(`
 ### ${localize("messaages", "Messages ({0})", status.messages.length)}
`);
        for (const message of status.messages) {
          data.appendMarkdown(`$(${(message.type === Severity.Error ? Codicon.error : message.type === Severity.Warning ? Codicon.warning : Codicon.info).id})&nbsp;${message.message}

`);
        }
      }
      if (data.value) {
        this.renderMarkdown(data, container, disposables);
      }
    }
    return container;
  }
  renderMarkdown(markdown, container, disposables) {
    const { element } = disposables.add(this.markdownRendererService.render({
      value: markdown.value,
      isTrusted: markdown.isTrusted,
      supportThemeIcons: true
    }));
    append(container, element);
  }
  renderRequestsChart(container, accessTimes, disposables) {
    const width = 450;
    const height = 250;
    const margin = { top: 0, right: 4, bottom: 20, left: 4 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const chartContainer = append(container, $(".feature-chart-container"));
    chartContainer.style.position = "relative";
    const tooltip = append(chartContainer, $(".feature-chart-tooltip"));
    tooltip.style.position = "absolute";
    tooltip.style.width = "0px";
    tooltip.style.height = "0px";
    let maxCount = 100;
    const map = /* @__PURE__ */ new Map();
    for (const accessTime of accessTimes) {
      const day = `${accessTime.getDate()} ${accessTime.toLocaleString("default", { month: "short" })}`;
      map.set(day, (map.get(day) ?? 0) + 1);
      maxCount = Math.max(maxCount, map.get(day));
    }
    const now = /* @__PURE__ */ new Date();
    const points = [];
    for (let i = 0; i <= 30; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() - (30 - i));
      const dateString = `${date.getDate()} ${date.toLocaleString("default", { month: "short" })}`;
      const count = map.get(dateString) ?? 0;
      const x = i / 30 * innerWidth;
      const y = innerHeight - count / maxCount * innerHeight;
      points.push({ x, y, date: dateString, count });
    }
    const chart = append(chartContainer, $(".feature-chart"));
    const svg = append(chart, $.SVG("svg"));
    svg.setAttribute("width", `${width}px`);
    svg.setAttribute("height", `${height}px`);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const g = $.SVG("g");
    g.setAttribute("transform", `translate(${margin.left},${margin.top})`);
    svg.appendChild(g);
    const xAxisLine = $.SVG("line");
    xAxisLine.setAttribute("x1", "0");
    xAxisLine.setAttribute("y1", `${innerHeight}`);
    xAxisLine.setAttribute("x2", `${innerWidth}`);
    xAxisLine.setAttribute("y2", `${innerHeight}`);
    xAxisLine.setAttribute("stroke", asCssVariable(chartAxis));
    xAxisLine.setAttribute("stroke-width", "1px");
    g.appendChild(xAxisLine);
    for (let i = 1; i <= 30; i += 7) {
      const date = new Date(now);
      date.setDate(now.getDate() - (30 - i));
      const dateString = `${date.getDate()} ${date.toLocaleString("default", { month: "short" })}`;
      const x = i / 30 * innerWidth;
      const tick = $.SVG("line");
      tick.setAttribute("x1", `${x}`);
      tick.setAttribute("y1", `${innerHeight}`);
      tick.setAttribute("x2", `${x}`);
      tick.setAttribute("y2", `${innerHeight + 10}`);
      tick.setAttribute("stroke", asCssVariable(chartAxis));
      tick.setAttribute("stroke-width", "1px");
      g.appendChild(tick);
      const ruler = $.SVG("line");
      ruler.setAttribute("x1", `${x}`);
      ruler.setAttribute("y1", `0`);
      ruler.setAttribute("x2", `${x}`);
      ruler.setAttribute("y2", `${innerHeight}`);
      ruler.setAttribute("stroke", asCssVariable(chartGuide));
      ruler.setAttribute("stroke-width", "1px");
      g.appendChild(ruler);
      const xAxisDate = $.SVG("text");
      xAxisDate.setAttribute("x", `${x}`);
      xAxisDate.setAttribute("y", `${height}`);
      xAxisDate.setAttribute("text-anchor", "middle");
      xAxisDate.setAttribute("fill", asCssVariable(foreground));
      xAxisDate.setAttribute("font-size", "10px");
      xAxisDate.textContent = dateString;
      g.appendChild(xAxisDate);
    }
    const line = $.SVG("polyline");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", asCssVariable(chartLine));
    line.setAttribute("stroke-width", `2px`);
    line.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
    g.appendChild(line);
    const highlightCircle = $.SVG("circle");
    highlightCircle.setAttribute("r", `4px`);
    highlightCircle.style.display = "none";
    g.appendChild(highlightCircle);
    const hoverDisposable = disposables.add(new MutableDisposable());
    const mouseMoveListener = (event) => {
      const rect = svg.getBoundingClientRect();
      const mouseX = event.clientX - rect.left - margin.left;
      let closestPoint;
      let minDistance = Infinity;
      points.forEach((point) => {
        const distance = Math.abs(point.x - mouseX);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      });
      if (closestPoint) {
        highlightCircle.setAttribute("cx", `${closestPoint.x}`);
        highlightCircle.setAttribute("cy", `${closestPoint.y}`);
        highlightCircle.style.display = "block";
        tooltip.style.left = `${closestPoint.x + 24}px`;
        tooltip.style.top = `${closestPoint.y + 14}px`;
        hoverDisposable.value = this.hoverService.showInstantHover({
          content: new MarkdownString(`${closestPoint.date}: ${closestPoint.count} requests`),
          target: tooltip,
          appearance: {
            showPointer: true,
            skipFadeInAnimation: true
          }
        });
      } else {
        hoverDisposable.value = void 0;
      }
    };
    disposables.add(addDisposableListener(svg, EventType.MOUSE_MOVE, mouseMoveListener));
    const mouseLeaveListener = () => {
      highlightCircle.style.display = "none";
      hoverDisposable.value = void 0;
    };
    disposables.add(addDisposableListener(svg, EventType.MOUSE_LEAVE, mouseLeaveListener));
  }
};
RuntimeStatusMarkdownRenderer.ID = "runtimeStatus";
RuntimeStatusMarkdownRenderer = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IHoverService),
  __decorateParam(2, IExtensionFeaturesManagementService),
  __decorateParam(3, IMarkdownRendererService)
], RuntimeStatusMarkdownRenderer);
const runtimeStatusFeature = {
  id: RuntimeStatusMarkdownRenderer.ID,
  label: localize("runtime", "Runtime Status"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(RuntimeStatusMarkdownRenderer)
};
let ExtensionFeaturesTab = class extends Themable {
  constructor(manifest, feature, themeService, instantiationService) {
    super(themeService);
    this.manifest = manifest;
    this.feature = feature;
    this.instantiationService = instantiationService;
    this.featureView = this._register(new MutableDisposable());
    this.layoutParticipants = [];
    this.extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
    this.domNode = $("div.subcontent.feature-contributions");
    this.create();
  }
  layout(height, width) {
    this.layoutParticipants.forEach((participant) => participant.layout(height, width));
  }
  create() {
    const features = this.getFeatures();
    if (features.length === 0) {
      append($(".no-features"), this.domNode).textContent = localize("noFeatures", "No features contributed.");
      return;
    }
    const splitView = this._register(new SplitView(this.domNode, {
      orientation: Orientation.HORIZONTAL,
      proportionalLayout: true
    }));
    this.layoutParticipants.push({
      layout: (height, width) => {
        splitView.el.style.height = `${height - 14}px`;
        splitView.layout(width);
      }
    });
    const featuresListContainer = $(".features-list-container");
    const list = this._register(this.createFeaturesList(featuresListContainer));
    list.splice(0, list.length, features);
    const featureViewContainer = $(".feature-view-container");
    this._register(list.onDidChangeSelection((e) => {
      const feature = e.elements[0];
      if (feature) {
        this.showFeatureView(feature, featureViewContainer);
      }
    }));
    const index = this.feature ? features.findIndex((f) => f.id === this.feature) : 0;
    list.setSelection([index === -1 ? 0 : index]);
    splitView.addView({
      onDidChange: Event.None,
      element: featuresListContainer,
      minimumSize: 100,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        featuresListContainer.style.width = `${width}px`;
        list.layout(height, width);
      }
    }, 200, void 0, true);
    splitView.addView({
      onDidChange: Event.None,
      element: featureViewContainer,
      minimumSize: 500,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        featureViewContainer.style.width = `${width}px`;
        this.featureViewDimension = { height, width };
        this.layoutFeatureView();
      }
    }, Sizing.Distribute, void 0, true);
    splitView.style({
      separatorBorder: this.theme.getColor(PANEL_SECTION_BORDER)
    });
  }
  createFeaturesList(container) {
    const renderer = this.instantiationService.createInstance(ExtensionFeatureItemRenderer, this.extensionId);
    const delegate = new ExtensionFeatureItemDelegate();
    const list = this.instantiationService.createInstance(WorkbenchList, "ExtensionFeaturesList", append(container, $(".features-list-wrapper")), delegate, [renderer], {
      multipleSelectionSupport: false,
      setRowLineHeight: false,
      horizontalScrolling: false,
      accessibilityProvider: {
        getAriaLabel(extensionFeature) {
          return extensionFeature?.label ?? "";
        },
        getWidgetAriaLabel() {
          return localize("extension features list", "Extension Features");
        }
      },
      openOnSingleClick: true
    });
    return list;
  }
  layoutFeatureView() {
    this.featureView.value?.layout(this.featureViewDimension?.height, this.featureViewDimension?.width);
  }
  showFeatureView(feature, container) {
    if (this.featureView.value?.feature.id === feature.id) {
      return;
    }
    clearNode(container);
    this.featureView.value = this.instantiationService.createInstance(ExtensionFeatureView, this.extensionId, this.manifest, feature);
    container.appendChild(this.featureView.value.domNode);
    this.layoutFeatureView();
  }
  getFeatures() {
    const features = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures().filter((feature) => {
      const renderer2 = this.getRenderer(feature);
      const shouldRender = renderer2?.shouldRender(this.manifest);
      renderer2?.dispose();
      return shouldRender;
    }).sort((a, b) => a.label.localeCompare(b.label));
    const renderer = this.getRenderer(runtimeStatusFeature);
    if (renderer?.shouldRender(this.manifest)) {
      features.splice(0, 0, runtimeStatusFeature);
    }
    renderer?.dispose();
    return features;
  }
  getRenderer(feature) {
    return feature.renderer ? this.instantiationService.createInstance(feature.renderer) : void 0;
  }
};
ExtensionFeaturesTab = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService)
], ExtensionFeaturesTab);
class ExtensionFeatureItemDelegate {
  getHeight() {
    return 22;
  }
  getTemplateId() {
    return "extensionFeatureDescriptor";
  }
}
let ExtensionFeatureItemRenderer = class {
  constructor(extensionId, extensionFeaturesManagementService) {
    this.extensionId = extensionId;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.templateId = "extensionFeatureDescriptor";
  }
  renderTemplate(container) {
    container.classList.add("extension-feature-list-item");
    const label = append(container, $(".extension-feature-label"));
    const disabledElement = append(container, $(".extension-feature-disabled-label"));
    disabledElement.textContent = localize("revoked", "No Access");
    const statusElement = append(container, $(".extension-feature-status"));
    return { label, disabledElement, statusElement, disposables: new DisposableStore() };
  }
  renderElement(element, index, templateData) {
    templateData.disposables.clear();
    templateData.label.textContent = element.label;
    templateData.disabledElement.style.display = element.id === runtimeStatusFeature.id || this.extensionFeaturesManagementService.isEnabled(this.extensionId, element.id) ? "none" : "inherit";
    templateData.disposables.add(this.extensionFeaturesManagementService.onDidChangeEnablement(({ extension, featureId, enabled }) => {
      if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === element.id) {
        templateData.disabledElement.style.display = enabled ? "none" : "inherit";
      }
    }));
    const statusElementClassName = templateData.statusElement.className;
    const updateStatus = () => {
      const accessData = this.extensionFeaturesManagementService.getAccessData(this.extensionId, element.id);
      if (accessData?.current?.status) {
        templateData.statusElement.style.display = "inherit";
        templateData.statusElement.className = `${statusElementClassName} ${SeverityIcon.className(accessData.current.status.severity)}`;
      } else {
        templateData.statusElement.style.display = "none";
      }
    };
    updateStatus();
    templateData.disposables.add(this.extensionFeaturesManagementService.onDidChangeAccessData(({ extension, featureId }) => {
      if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === element.id) {
        updateStatus();
      }
    }));
  }
  disposeElement(element, index, templateData) {
    templateData.disposables.dispose();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
ExtensionFeatureItemRenderer = __decorateClass([
  __decorateParam(1, IExtensionFeaturesManagementService)
], ExtensionFeatureItemRenderer);
let ExtensionFeatureView = class extends Disposable {
  constructor(extensionId, manifest, feature, instantiationService, extensionFeaturesManagementService, dialogService, markdownRendererService) {
    super();
    this.extensionId = extensionId;
    this.manifest = manifest;
    this.feature = feature;
    this.instantiationService = instantiationService;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.dialogService = dialogService;
    this.markdownRendererService = markdownRendererService;
    this.layoutParticipants = [];
    this.domNode = $(".extension-feature-content");
    this.create(this.domNode);
  }
  create(content) {
    const header = append(content, $(".feature-header"));
    const title = append(header, $(".feature-title"));
    title.textContent = this.feature.label;
    if (this.feature.access.canToggle) {
      const actionsContainer = append(header, $(".feature-actions"));
      const button = new Button(actionsContainer, defaultButtonStyles);
      this.updateButtonLabel(button);
      this._register(this.extensionFeaturesManagementService.onDidChangeEnablement(({ extension, featureId }) => {
        if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === this.feature.id) {
          this.updateButtonLabel(button);
        }
      }));
      this._register(button.onDidClick(async () => {
        const enabled = this.extensionFeaturesManagementService.isEnabled(this.extensionId, this.feature.id);
        const confirmationResult = await this.dialogService.confirm({
          title: localize("accessExtensionFeature", "Enable '{0}' Feature", this.feature.label),
          message: enabled ? localize("disableAccessExtensionFeatureMessage", "Would you like to revoke '{0}' extension to access '{1}' feature?", this.manifest.displayName ?? this.extensionId.value, this.feature.label) : localize("enableAccessExtensionFeatureMessage", "Would you like to allow '{0}' extension to access '{1}' feature?", this.manifest.displayName ?? this.extensionId.value, this.feature.label),
          custom: true,
          primaryButton: enabled ? localize("revoke", "Revoke Access") : localize("grant", "Allow Access"),
          cancelButton: localize("cancel", "Cancel")
        });
        if (confirmationResult.confirmed) {
          this.extensionFeaturesManagementService.setEnablement(this.extensionId, this.feature.id, !enabled);
        }
      }));
    }
    const body = append(content, $(".feature-body"));
    const bodyContent = $(".feature-body-content");
    const scrollableContent = this._register(new DomScrollableElement(bodyContent, {}));
    append(body, scrollableContent.getDomNode());
    this.layoutParticipants.push({ layout: () => scrollableContent.scanDomNode() });
    scrollableContent.scanDomNode();
    if (this.feature.description) {
      const description = append(bodyContent, $(".feature-description"));
      description.textContent = this.feature.description;
    }
    const accessData = this.extensionFeaturesManagementService.getAccessData(this.extensionId, this.feature.id);
    if (accessData?.current?.status) {
      append(bodyContent, $(
        ".feature-status",
        void 0,
        $(`span${ThemeIcon.asCSSSelector(accessData.current.status.severity === Severity.Error ? errorIcon : accessData.current.status.severity === Severity.Warning ? warningIcon : infoIcon)}`, void 0),
        $("span", void 0, accessData.current.status.message)
      ));
    }
    const featureContentElement = append(bodyContent, $(".feature-content"));
    if (this.feature.renderer) {
      const renderer = this.instantiationService.createInstance(this.feature.renderer);
      if (renderer.type === "table") {
        this.renderTableData(featureContentElement, renderer);
      } else if (renderer.type === "markdown") {
        this.renderMarkdownData(featureContentElement, renderer);
      } else if (renderer.type === "markdown+table") {
        this.renderMarkdownAndTableData(featureContentElement, renderer);
      } else if (renderer.type === "element") {
        this.renderElementData(featureContentElement, renderer);
      }
    }
  }
  updateButtonLabel(button) {
    button.label = this.extensionFeaturesManagementService.isEnabled(this.extensionId, this.feature.id) ? localize("revoke", "Revoke Access") : localize("enable", "Allow Access");
  }
  renderTableData(container, renderer) {
    const tableData = this._register(renderer.render(this.manifest));
    const tableDisposable = this._register(new MutableDisposable());
    if (tableData.onDidChange) {
      this._register(tableData.onDidChange((data) => {
        clearNode(container);
        tableDisposable.value = this.renderTable(data, container);
      }));
    }
    tableDisposable.value = this.renderTable(tableData.data, container);
  }
  renderTable(tableData, container) {
    const disposables = new DisposableStore();
    append(
      container,
      $(
        "table",
        void 0,
        $(
          "tr",
          void 0,
          ...tableData.headers.map((header) => $("th", void 0, header))
        ),
        ...tableData.rows.map((row) => {
          return $(
            "tr",
            void 0,
            ...row.map((rowData) => {
              if (typeof rowData === "string") {
                return $("td", void 0, $("p", void 0, rowData));
              }
              const data = Array.isArray(rowData) ? rowData : [rowData];
              return $("td", void 0, ...data.map((item) => {
                const result = [];
                if (isMarkdownString(rowData)) {
                  const element = $("", void 0);
                  this.renderMarkdown(rowData, element);
                  result.push(element);
                } else if (item instanceof ResolvedKeybinding) {
                  const element = $("");
                  const kbl = disposables.add(new KeybindingLabel(element, OS, defaultKeybindingLabelStyles));
                  kbl.set(item);
                  result.push(element);
                } else if (item instanceof Color) {
                  result.push($("span", { class: "colorBox", style: "background-color: " + Color.Format.CSS.format(item) }, ""));
                  result.push($("code", void 0, Color.Format.CSS.formatHex(item)));
                }
                return result;
              }).flat());
            })
          );
        })
      )
    );
    return disposables;
  }
  renderMarkdownAndTableData(container, renderer) {
    const markdownAndTableData = this._register(renderer.render(this.manifest));
    if (markdownAndTableData.onDidChange) {
      this._register(markdownAndTableData.onDidChange((data) => {
        clearNode(container);
        this.renderMarkdownAndTable(data, container);
      }));
    }
    this.renderMarkdownAndTable(markdownAndTableData.data, container);
  }
  renderMarkdownData(container, renderer) {
    container.classList.add("markdown");
    const markdownData = this._register(renderer.render(this.manifest));
    if (markdownData.onDidChange) {
      this._register(markdownData.onDidChange((data) => {
        clearNode(container);
        this.renderMarkdown(data, container);
      }));
    }
    this.renderMarkdown(markdownData.data, container);
  }
  renderMarkdown(markdown, container) {
    const { element } = this._register(this.markdownRendererService.render({
      value: markdown.value,
      isTrusted: markdown.isTrusted,
      supportThemeIcons: true
    }));
    append(container, element);
  }
  renderMarkdownAndTable(data, container) {
    for (const markdownOrTable of data) {
      if (isMarkdownString(markdownOrTable)) {
        const element = $("", void 0);
        this.renderMarkdown(markdownOrTable, element);
        append(container, element);
      } else {
        const tableElement = append(container, $("table"));
        this.renderTable(markdownOrTable, tableElement);
      }
    }
  }
  renderElementData(container, renderer) {
    const elementData = this._register(renderer.render(this.manifest));
    if (elementData.onDidChange) {
      this._register(elementData.onDidChange((data) => {
        clearNode(container);
        container.appendChild(data);
      }));
    }
    container.appendChild(elementData.data);
  }
  layout(height, width) {
    this.layoutParticipants.forEach((p) => p.layout(height, width));
  }
};
ExtensionFeatureView = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IExtensionFeaturesManagementService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IMarkdownRendererService)
], ExtensionFeatureView);
export {
  ExtensionFeaturesTab
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbkZlYXR1cmVzVGFiLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgJCwgYXBwZW5kLCBjbGVhck5vZGUsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24sIFNpemluZywgU3BsaXRWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkZlYXR1cmVEZXNjcmlwdG9yLCBFeHRlbnNpb25zLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSwgSUV4dGVuc2lvbkZlYXR1cmVSZW5kZXJlciwgSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciwgSUV4dGVuc2lvbkZlYXR1cmVNYXJrZG93blJlbmRlcmVyLCBJVGFibGVEYXRhLCBJUmVuZGVyZWREYXRhLCBJRXh0ZW5zaW9uRmVhdHVyZU1hcmtkb3duQW5kVGFibGVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRFeHRlbnNpb25JZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0S2V5YmluZGluZ0xhYmVsU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBQQU5FTF9TRUNUSU9OX0JPUkRFUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBUaGVtYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGVycm9ySWNvbiwgaW5mb0ljb24sIHdhcm5pbmdJY29uIH0gZnJvbSAnLi9leHRlbnNpb25zSWNvbnMuanMnO1xuaW1wb3J0IHsgU2V2ZXJpdHlJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NldmVyaXR5SWNvbi9zZXZlcml0eUljb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ0xhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2tleWJpbmRpbmdMYWJlbC9rZXliaW5kaW5nTGFiZWwuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nLCBpc01hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IGZvcmVncm91bmQsIGNoYXJ0QXhpcywgY2hhcnRHdWlkZSwgY2hhcnRMaW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcblxuaW50ZXJmYWNlIElFeHRlbnNpb25GZWF0dXJlRWxlbWVudFJlbmRlcmVyIGV4dGVuZHMgSUV4dGVuc2lvbkZlYXR1cmVSZW5kZXJlciB7XG5cdHR5cGU6ICdlbGVtZW50Jztcblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPEhUTUxFbGVtZW50Pjtcbn1cblxuY2xhc3MgUnVudGltZVN0YXR1c01hcmtkb3duUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVFbGVtZW50UmVuZGVyZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdydW50aW1lU3RhdHVzJztcblx0cmVhZG9ubHkgdHlwZSA9ICdlbGVtZW50JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihnZXRFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpKTtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLnNvbWUoZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbklkKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QubWFpbiB8fCAhIW1hbmlmZXN0LmJyb3dzZXI7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SFRNTEVsZW1lbnQ+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKGdldEV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSkpO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SFRNTEVsZW1lbnQ+KCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zU3RhdHVzKGUgPT4ge1xuXHRcdFx0aWYgKGUuc29tZShleHRlbnNpb24gPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZXh0ZW5zaW9uLCBleHRlbnNpb25JZCkpKSB7XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSh0aGlzLmNyZWF0ZUVsZW1lbnQobWFuaWZlc3QsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VBY2Nlc3NEYXRhKGUgPT4gZW1pdHRlci5maXJlKHRoaXMuY3JlYXRlRWxlbWVudChtYW5pZmVzdCwgZGlzcG9zYWJsZXMpKSkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudCxcblx0XHRcdGRhdGE6IHRoaXMuY3JlYXRlRWxlbWVudChtYW5pZmVzdCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRWxlbWVudChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy5ydW50aW1lLXN0YXR1cycpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoZ2V0RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKSk7XG5cdFx0Y29uc3Qgc3RhdHVzID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbnNTdGF0dXMoKVtleHRlbnNpb25JZC52YWx1ZV07XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLnNvbWUoZXh0ZW5zaW9uID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBleHRlbnNpb25JZCkpKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0XHRkYXRhLmFwcGVuZE1hcmtkb3duKGAjIyMgJHtsb2NhbGl6ZSgnYWN0aXZhdGlvbicsIFwiQWN0aXZhdGlvblwiKX1cXG5cXG5gKTtcblx0XHRcdGlmIChzdGF0dXMuYWN0aXZhdGlvblRpbWVzKSB7XG5cdFx0XHRcdGlmIChzdGF0dXMuYWN0aXZhdGlvblRpbWVzLmFjdGl2YXRpb25SZWFzb24uc3RhcnR1cCkge1xuXHRcdFx0XHRcdGRhdGEuYXBwZW5kTWFya2Rvd24oYEFjdGl2YXRlZCBvbiBTdGFydHVwOiBcXGAke3N0YXR1cy5hY3RpdmF0aW9uVGltZXMuYWN0aXZhdGVDYWxsVGltZX1tc1xcYGApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRhdGEuYXBwZW5kTWFya2Rvd24oYEFjdGl2YXRlZCBieSBcXGAke3N0YXR1cy5hY3RpdmF0aW9uVGltZXMuYWN0aXZhdGlvblJlYXNvbi5hY3RpdmF0aW9uRXZlbnR9XFxgIGV2ZW50OiBcXGAke3N0YXR1cy5hY3RpdmF0aW9uVGltZXMuYWN0aXZhdGVDYWxsVGltZX1tc1xcYGApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkYXRhLmFwcGVuZE1hcmtkb3duKCdOb3QgeWV0IGFjdGl2YXRlZCcpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZW5kZXJNYXJrZG93bihkYXRhLCBjb250YWluZXIsIGRpc3Bvc2FibGVzKTtcblx0XHR9XG5cdFx0Y29uc3QgZmVhdHVyZXMgPSBSZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5nZXRFeHRlbnNpb25GZWF0dXJlcygpO1xuXHRcdGZvciAoY29uc3QgZmVhdHVyZSBvZiBmZWF0dXJlcykge1xuXHRcdFx0Y29uc3QgYWNjZXNzRGF0YSA9IHRoaXMuZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5nZXRBY2Nlc3NEYXRhKGV4dGVuc2lvbklkLCBmZWF0dXJlLmlkKTtcblx0XHRcdGlmIChhY2Nlc3NEYXRhKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyTWFya2Rvd24obmV3IE1hcmtkb3duU3RyaW5nKGBcXG4gIyMjICR7bG9jYWxpemUoJ2xhYmVsJywgXCJ7MH0gVXNhZ2VcIiwgZmVhdHVyZS5sYWJlbCl9XFxuXFxuYCksIGNvbnRhaW5lciwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRpZiAoYWNjZXNzRGF0YS5hY2Nlc3NUaW1lcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGFwcGVuZChjb250YWluZXIsXG5cdFx0XHRcdFx0XHQkKCcuZmVhdHVyZS1jaGFydC1kZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2NoYXJ0RGVzY3JpcHRpb24nLCBcIlRoZXJlIHdlcmUgezB9IHsxfSByZXF1ZXN0cyBmcm9tIHRoaXMgZXh0ZW5zaW9uIGluIHRoZSBsYXN0IDMwIGRheXMuXCIsIGFjY2Vzc0RhdGE/LmFjY2Vzc1RpbWVzLmxlbmd0aCwgZmVhdHVyZS5hY2Nlc3NEYXRhTGFiZWwgPz8gZmVhdHVyZS5sYWJlbCkpKTtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbi5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnOHB4Jztcblx0XHRcdFx0XHR0aGlzLnJlbmRlclJlcXVlc3RzQ2hhcnQoY29udGFpbmVyLCBhY2Nlc3NEYXRhLmFjY2Vzc1RpbWVzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3RhdHVzID0gYWNjZXNzRGF0YT8uY3VycmVudD8uc3RhdHVzO1xuXHRcdFx0XHRpZiAoc3RhdHVzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdFx0XHRcdGlmIChzdGF0dXM/LnNldmVyaXR5ID09PSBTZXZlcml0eS5FcnJvcikge1xuXHRcdFx0XHRcdFx0ZGF0YS5hcHBlbmRNYXJrZG93bihgJCgke2Vycm9ySWNvbi5pZH0pICR7c3RhdHVzLm1lc3NhZ2V9XFxuXFxuYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChzdGF0dXM/LnNldmVyaXR5ID09PSBTZXZlcml0eS5XYXJuaW5nKSB7XG5cdFx0XHRcdFx0XHRkYXRhLmFwcGVuZE1hcmtkb3duKGAkKCR7d2FybmluZ0ljb24uaWR9KSAke3N0YXR1cy5tZXNzYWdlfVxcblxcbmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZGF0YS52YWx1ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5yZW5kZXJNYXJrZG93bihkYXRhLCBjb250YWluZXIsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHN0YXR1cy5ydW50aW1lRXJyb3JzLmxlbmd0aCB8fCBzdGF0dXMubWVzc2FnZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0XHRpZiAoc3RhdHVzLnJ1bnRpbWVFcnJvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdGRhdGEuYXBwZW5kTWFya2Rvd24oYFxcbiAjIyMgJHtsb2NhbGl6ZSgndW5jYXVnaHQgZXJyb3JzJywgXCJVbmNhdWdodCBFcnJvcnMgKHswfSlcIiwgc3RhdHVzLnJ1bnRpbWVFcnJvcnMubGVuZ3RoKX1cXG5gKTtcblx0XHRcdFx0Zm9yIChjb25zdCBlcnJvciBvZiBzdGF0dXMucnVudGltZUVycm9ycykge1xuXHRcdFx0XHRcdGRhdGEuYXBwZW5kTWFya2Rvd24oYCQoJHtDb2RpY29uLmVycm9yLmlkfSkmbmJzcDske2dldEVycm9yTWVzc2FnZShlcnJvcil9XFxuXFxuYCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzdGF0dXMubWVzc2FnZXMubGVuZ3RoKSB7XG5cdFx0XHRcdGRhdGEuYXBwZW5kTWFya2Rvd24oYFxcbiAjIyMgJHtsb2NhbGl6ZSgnbWVzc2FhZ2VzJywgXCJNZXNzYWdlcyAoezB9KVwiLCBzdGF0dXMubWVzc2FnZXMubGVuZ3RoKX1cXG5gKTtcblx0XHRcdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIHN0YXR1cy5tZXNzYWdlcykge1xuXHRcdFx0XHRcdGRhdGEuYXBwZW5kTWFya2Rvd24oYCQoJHsobWVzc2FnZS50eXBlID09PSBTZXZlcml0eS5FcnJvciA/IENvZGljb24uZXJyb3IgOiBtZXNzYWdlLnR5cGUgPT09IFNldmVyaXR5Lldhcm5pbmcgPyBDb2RpY29uLndhcm5pbmcgOiBDb2RpY29uLmluZm8pLmlkfSkmbmJzcDske21lc3NhZ2UubWVzc2FnZX1cXG5cXG5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGRhdGEudmFsdWUpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJNYXJrZG93bihkYXRhLCBjb250YWluZXIsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWFya2Rvd24obWFya2Rvd246IElNYXJrZG93blN0cmluZywgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdGNvbnN0IHsgZWxlbWVudCB9ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKHtcblx0XHRcdHZhbHVlOiBtYXJrZG93bi52YWx1ZSxcblx0XHRcdGlzVHJ1c3RlZDogbWFya2Rvd24uaXNUcnVzdGVkLFxuXHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWVcblx0XHR9KSk7XG5cdFx0YXBwZW5kKGNvbnRhaW5lciwgZWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclJlcXVlc3RzQ2hhcnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgYWNjZXNzVGltZXM6IERhdGVbXSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZHRoID0gNDUwO1xuXHRcdGNvbnN0IGhlaWdodCA9IDI1MDtcblx0XHRjb25zdCBtYXJnaW4gPSB7IHRvcDogMCwgcmlnaHQ6IDQsIGJvdHRvbTogMjAsIGxlZnQ6IDQgfTtcblx0XHRjb25zdCBpbm5lcldpZHRoID0gd2lkdGggLSBtYXJnaW4ubGVmdCAtIG1hcmdpbi5yaWdodDtcblx0XHRjb25zdCBpbm5lckhlaWdodCA9IGhlaWdodCAtIG1hcmdpbi50b3AgLSBtYXJnaW4uYm90dG9tO1xuXG5cdFx0Y29uc3QgY2hhcnRDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuZmVhdHVyZS1jaGFydC1jb250YWluZXInKSk7XG5cdFx0Y2hhcnRDb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXG5cdFx0Y29uc3QgdG9vbHRpcCA9IGFwcGVuZChjaGFydENvbnRhaW5lciwgJCgnLmZlYXR1cmUtY2hhcnQtdG9vbHRpcCcpKTtcblx0XHR0b29sdGlwLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHR0b29sdGlwLnN0eWxlLndpZHRoID0gJzBweCc7XG5cdFx0dG9vbHRpcC5zdHlsZS5oZWlnaHQgPSAnMHB4JztcblxuXHRcdGxldCBtYXhDb3VudCA9IDEwMDtcblx0XHRjb25zdCBtYXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGZvciAoY29uc3QgYWNjZXNzVGltZSBvZiBhY2Nlc3NUaW1lcykge1xuXHRcdFx0Y29uc3QgZGF5ID0gYCR7YWNjZXNzVGltZS5nZXREYXRlKCl9ICR7YWNjZXNzVGltZS50b0xvY2FsZVN0cmluZygnZGVmYXVsdCcsIHsgbW9udGg6ICdzaG9ydCcgfSl9YDtcblx0XHRcdG1hcC5zZXQoZGF5LCAobWFwLmdldChkYXkpID8/IDApICsgMSk7XG5cdFx0XHRtYXhDb3VudCA9IE1hdGgubWF4KG1heENvdW50LCBtYXAuZ2V0KGRheSkhKTtcblx0XHR9XG5cblx0XHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuXHRcdHR5cGUgUG9pbnQgPSB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyBkYXRlOiBzdHJpbmc7IGNvdW50OiBudW1iZXIgfTtcblx0XHRjb25zdCBwb2ludHM6IFBvaW50W10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8PSAzMDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkYXRlID0gbmV3IERhdGUobm93KTtcblx0XHRcdGRhdGUuc2V0RGF0ZShub3cuZ2V0RGF0ZSgpIC0gKDMwIC0gaSkpO1xuXHRcdFx0Y29uc3QgZGF0ZVN0cmluZyA9IGAke2RhdGUuZ2V0RGF0ZSgpfSAke2RhdGUudG9Mb2NhbGVTdHJpbmcoJ2RlZmF1bHQnLCB7IG1vbnRoOiAnc2hvcnQnIH0pfWA7XG5cdFx0XHRjb25zdCBjb3VudCA9IG1hcC5nZXQoZGF0ZVN0cmluZykgPz8gMDtcblx0XHRcdGNvbnN0IHggPSAoaSAvIDMwKSAqIGlubmVyV2lkdGg7XG5cdFx0XHRjb25zdCB5ID0gaW5uZXJIZWlnaHQgLSAoY291bnQgLyBtYXhDb3VudCkgKiBpbm5lckhlaWdodDtcblx0XHRcdHBvaW50cy5wdXNoKHsgeCwgeSwgZGF0ZTogZGF0ZVN0cmluZywgY291bnQgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhcnQgPSBhcHBlbmQoY2hhcnRDb250YWluZXIsICQoJy5mZWF0dXJlLWNoYXJ0JykpO1xuXHRcdGNvbnN0IHN2ZyA9IGFwcGVuZChjaGFydCwgJC5TVkcoJ3N2ZycpKTtcblx0XHRzdmcuc2V0QXR0cmlidXRlKCd3aWR0aCcsIGAke3dpZHRofXB4YCk7XG5cdFx0c3ZnLnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgYCR7aGVpZ2h0fXB4YCk7XG5cdFx0c3ZnLnNldEF0dHJpYnV0ZSgndmlld0JveCcsIGAwIDAgJHt3aWR0aH0gJHtoZWlnaHR9YCk7XG5cblx0XHRjb25zdCBnID0gJC5TVkcoJ2cnKTtcblx0XHRnLnNldEF0dHJpYnV0ZSgndHJhbnNmb3JtJywgYHRyYW5zbGF0ZSgke21hcmdpbi5sZWZ0fSwke21hcmdpbi50b3B9KWApO1xuXHRcdHN2Zy5hcHBlbmRDaGlsZChnKTtcblxuXHRcdGNvbnN0IHhBeGlzTGluZSA9ICQuU1ZHKCdsaW5lJyk7XG5cdFx0eEF4aXNMaW5lLnNldEF0dHJpYnV0ZSgneDEnLCAnMCcpO1xuXHRcdHhBeGlzTGluZS5zZXRBdHRyaWJ1dGUoJ3kxJywgYCR7aW5uZXJIZWlnaHR9YCk7XG5cdFx0eEF4aXNMaW5lLnNldEF0dHJpYnV0ZSgneDInLCBgJHtpbm5lcldpZHRofWApO1xuXHRcdHhBeGlzTGluZS5zZXRBdHRyaWJ1dGUoJ3kyJywgYCR7aW5uZXJIZWlnaHR9YCk7XG5cdFx0eEF4aXNMaW5lLnNldEF0dHJpYnV0ZSgnc3Ryb2tlJywgYXNDc3NWYXJpYWJsZShjaGFydEF4aXMpKTtcblx0XHR4QXhpc0xpbmUuc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCAnMXB4Jyk7XG5cdFx0Zy5hcHBlbmRDaGlsZCh4QXhpc0xpbmUpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gMzA7IGkgKz0gNykge1xuXHRcdFx0Y29uc3QgZGF0ZSA9IG5ldyBEYXRlKG5vdyk7XG5cdFx0XHRkYXRlLnNldERhdGUobm93LmdldERhdGUoKSAtICgzMCAtIGkpKTtcblx0XHRcdGNvbnN0IGRhdGVTdHJpbmcgPSBgJHtkYXRlLmdldERhdGUoKX0gJHtkYXRlLnRvTG9jYWxlU3RyaW5nKCdkZWZhdWx0JywgeyBtb250aDogJ3Nob3J0JyB9KX1gO1xuXHRcdFx0Y29uc3QgeCA9IChpIC8gMzApICogaW5uZXJXaWR0aDtcblxuXHRcdFx0Ly8gQWRkIHZlcnRpY2FsIGxpbmVcblx0XHRcdGNvbnN0IHRpY2sgPSAkLlNWRygnbGluZScpO1xuXHRcdFx0dGljay5zZXRBdHRyaWJ1dGUoJ3gxJywgYCR7eH1gKTtcblx0XHRcdHRpY2suc2V0QXR0cmlidXRlKCd5MScsIGAke2lubmVySGVpZ2h0fWApO1xuXHRcdFx0dGljay5zZXRBdHRyaWJ1dGUoJ3gyJywgYCR7eH1gKTtcblx0XHRcdHRpY2suc2V0QXR0cmlidXRlKCd5MicsIGAke2lubmVySGVpZ2h0ICsgMTB9YCk7XG5cdFx0XHR0aWNrLnNldEF0dHJpYnV0ZSgnc3Ryb2tlJywgYXNDc3NWYXJpYWJsZShjaGFydEF4aXMpKTtcblx0XHRcdHRpY2suc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCAnMXB4Jyk7XG5cdFx0XHRnLmFwcGVuZENoaWxkKHRpY2spO1xuXG5cdFx0XHRjb25zdCBydWxlciA9ICQuU1ZHKCdsaW5lJyk7XG5cdFx0XHRydWxlci5zZXRBdHRyaWJ1dGUoJ3gxJywgYCR7eH1gKTtcblx0XHRcdHJ1bGVyLnNldEF0dHJpYnV0ZSgneTEnLCBgMGApO1xuXHRcdFx0cnVsZXIuc2V0QXR0cmlidXRlKCd4MicsIGAke3h9YCk7XG5cdFx0XHRydWxlci5zZXRBdHRyaWJ1dGUoJ3kyJywgYCR7aW5uZXJIZWlnaHR9YCk7XG5cdFx0XHRydWxlci5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsIGFzQ3NzVmFyaWFibGUoY2hhcnRHdWlkZSkpO1xuXHRcdFx0cnVsZXIuc2V0QXR0cmlidXRlKCdzdHJva2Utd2lkdGgnLCAnMXB4Jyk7XG5cdFx0XHRnLmFwcGVuZENoaWxkKHJ1bGVyKTtcblxuXHRcdFx0Y29uc3QgeEF4aXNEYXRlID0gJC5TVkcoJ3RleHQnKTtcblx0XHRcdHhBeGlzRGF0ZS5zZXRBdHRyaWJ1dGUoJ3gnLCBgJHt4fWApO1xuXHRcdFx0eEF4aXNEYXRlLnNldEF0dHJpYnV0ZSgneScsIGAke2hlaWdodH1gKTsgLy8gQWRqdXN0ZWQgeSBwb3NpdGlvbiB0byBiZSB3aXRoaW4gdGhlIFNWRyB2aWV3IHBvcnRcblx0XHRcdHhBeGlzRGF0ZS5zZXRBdHRyaWJ1dGUoJ3RleHQtYW5jaG9yJywgJ21pZGRsZScpO1xuXHRcdFx0eEF4aXNEYXRlLnNldEF0dHJpYnV0ZSgnZmlsbCcsIGFzQ3NzVmFyaWFibGUoZm9yZWdyb3VuZCkpO1xuXHRcdFx0eEF4aXNEYXRlLnNldEF0dHJpYnV0ZSgnZm9udC1zaXplJywgJzEwcHgnKTtcblx0XHRcdHhBeGlzRGF0ZS50ZXh0Q29udGVudCA9IGRhdGVTdHJpbmc7XG5cdFx0XHRnLmFwcGVuZENoaWxkKHhBeGlzRGF0ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZSA9ICQuU1ZHKCdwb2x5bGluZScpO1xuXHRcdGxpbmUuc2V0QXR0cmlidXRlKCdmaWxsJywgJ25vbmUnKTtcblx0XHRsaW5lLnNldEF0dHJpYnV0ZSgnc3Ryb2tlJywgYXNDc3NWYXJpYWJsZShjaGFydExpbmUpKTtcblx0XHRsaW5lLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgYDJweGApO1xuXHRcdGxpbmUuc2V0QXR0cmlidXRlKCdwb2ludHMnLCBwb2ludHMubWFwKHAgPT4gYCR7cC54fSwke3AueX1gKS5qb2luKCcgJykpO1xuXHRcdGcuYXBwZW5kQ2hpbGQobGluZSk7XG5cblx0XHRjb25zdCBoaWdobGlnaHRDaXJjbGUgPSAkLlNWRygnY2lyY2xlJyk7XG5cdFx0aGlnaGxpZ2h0Q2lyY2xlLnNldEF0dHJpYnV0ZSgncicsIGA0cHhgKTtcblx0XHRoaWdobGlnaHRDaXJjbGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRnLmFwcGVuZENoaWxkKGhpZ2hsaWdodENpcmNsZSk7XG5cblx0XHRjb25zdCBob3ZlckRpc3Bvc2FibGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRjb25zdCBtb3VzZU1vdmVMaXN0ZW5lciA9IChldmVudDogTW91c2VFdmVudCk6IHZvaWQgPT4ge1xuXHRcdFx0Y29uc3QgcmVjdCA9IHN2Zy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdGNvbnN0IG1vdXNlWCA9IGV2ZW50LmNsaWVudFggLSByZWN0LmxlZnQgLSBtYXJnaW4ubGVmdDtcblxuXHRcdFx0bGV0IGNsb3Nlc3RQb2ludDogUG9pbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbWluRGlzdGFuY2UgPSBJbmZpbml0eTtcblxuXHRcdFx0cG9pbnRzLmZvckVhY2gocG9pbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXN0YW5jZSA9IE1hdGguYWJzKHBvaW50LnggLSBtb3VzZVgpO1xuXHRcdFx0XHRpZiAoZGlzdGFuY2UgPCBtaW5EaXN0YW5jZSkge1xuXHRcdFx0XHRcdG1pbkRpc3RhbmNlID0gZGlzdGFuY2U7XG5cdFx0XHRcdFx0Y2xvc2VzdFBvaW50ID0gcG9pbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoY2xvc2VzdFBvaW50KSB7XG5cdFx0XHRcdGhpZ2hsaWdodENpcmNsZS5zZXRBdHRyaWJ1dGUoJ2N4JywgYCR7Y2xvc2VzdFBvaW50Lnh9YCk7XG5cdFx0XHRcdGhpZ2hsaWdodENpcmNsZS5zZXRBdHRyaWJ1dGUoJ2N5JywgYCR7Y2xvc2VzdFBvaW50Lnl9YCk7XG5cdFx0XHRcdGhpZ2hsaWdodENpcmNsZS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHRcdFx0dG9vbHRpcC5zdHlsZS5sZWZ0ID0gYCR7Y2xvc2VzdFBvaW50LnggKyAyNH1weGA7XG5cdFx0XHRcdHRvb2x0aXAuc3R5bGUudG9wID0gYCR7Y2xvc2VzdFBvaW50LnkgKyAxNH1weGA7XG5cdFx0XHRcdGhvdmVyRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhgJHtjbG9zZXN0UG9pbnQuZGF0ZX06ICR7Y2xvc2VzdFBvaW50LmNvdW50fSByZXF1ZXN0c2ApLFxuXHRcdFx0XHRcdHRhcmdldDogdG9vbHRpcCxcblx0XHRcdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdFx0XHRzaG93UG9pbnRlcjogdHJ1ZSxcblx0XHRcdFx0XHRcdHNraXBGYWRlSW5BbmltYXRpb246IHRydWUsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhvdmVyRGlzcG9zYWJsZS52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoc3ZnLCBFdmVudFR5cGUuTU9VU0VfTU9WRSwgbW91c2VNb3ZlTGlzdGVuZXIpKTtcblxuXHRcdGNvbnN0IG1vdXNlTGVhdmVMaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdGhpZ2hsaWdodENpcmNsZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0aG92ZXJEaXNwb3NhYmxlLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzdmcsIEV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgbW91c2VMZWF2ZUxpc3RlbmVyKSk7XG5cdH1cbn1cblxuXG5pbnRlcmZhY2UgSUxheW91dFBhcnRpY2lwYW50IHtcblx0bGF5b3V0KGhlaWdodD86IG51bWJlciwgd2lkdGg/OiBudW1iZXIpOiB2b2lkO1xufVxuXG5jb25zdCBydW50aW1lU3RhdHVzRmVhdHVyZSA9IHtcblx0aWQ6IFJ1bnRpbWVTdGF0dXNNYXJrZG93blJlbmRlcmVyLklELFxuXHRsYWJlbDogbG9jYWxpemUoJ3J1bnRpbWUnLCBcIlJ1bnRpbWUgU3RhdHVzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoUnVudGltZVN0YXR1c01hcmtkb3duUmVuZGVyZXIpLFxufTtcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkZlYXR1cmVzVGFiIGV4dGVuZHMgVGhlbWFibGUge1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZmVhdHVyZVZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RXh0ZW5zaW9uRmVhdHVyZVZpZXc+KCkpO1xuXHRwcml2YXRlIGZlYXR1cmVWaWV3RGltZW5zaW9uPzogeyBoZWlnaHQ/OiBudW1iZXI7IHdpZHRoPzogbnVtYmVyIH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBsYXlvdXRQYXJ0aWNpcGFudHM6IElMYXlvdXRQYXJ0aWNpcGFudFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmVhdHVyZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcih0aGVtZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5leHRlbnNpb25JZCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKGdldEV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSkpO1xuXHRcdHRoaXMuZG9tTm9kZSA9ICQoJ2Rpdi5zdWJjb250ZW50LmZlYXR1cmUtY29udHJpYnV0aW9ucycpO1xuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0PzogbnVtYmVyLCB3aWR0aD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubGF5b3V0UGFydGljaXBhbnRzLmZvckVhY2gocGFydGljaXBhbnQgPT4gcGFydGljaXBhbnQubGF5b3V0KGhlaWdodCwgd2lkdGgpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGZlYXR1cmVzID0gdGhpcy5nZXRGZWF0dXJlcygpO1xuXHRcdGlmIChmZWF0dXJlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGFwcGVuZCgkKCcubm8tZmVhdHVyZXMnKSwgdGhpcy5kb21Ob2RlKS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub0ZlYXR1cmVzJywgXCJObyBmZWF0dXJlcyBjb250cmlidXRlZC5cIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3BsaXRWaWV3ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNwbGl0VmlldzxudW1iZXI+KHRoaXMuZG9tTm9kZSwge1xuXHRcdFx0b3JpZW50YXRpb246IE9yaWVudGF0aW9uLkhPUklaT05UQUwsXG5cdFx0XHRwcm9wb3J0aW9uYWxMYXlvdXQ6IHRydWVcblx0XHR9KSk7XG5cdFx0dGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMucHVzaCh7XG5cdFx0XHRsYXlvdXQ6IChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRzcGxpdFZpZXcuZWwuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0IC0gMTR9cHhgO1xuXHRcdFx0XHRzcGxpdFZpZXcubGF5b3V0KHdpZHRoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGZlYXR1cmVzTGlzdENvbnRhaW5lciA9ICQoJy5mZWF0dXJlcy1saXN0LWNvbnRhaW5lcicpO1xuXHRcdGNvbnN0IGxpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZUZlYXR1cmVzTGlzdChmZWF0dXJlc0xpc3RDb250YWluZXIpKTtcblx0XHRsaXN0LnNwbGljZSgwLCBsaXN0Lmxlbmd0aCwgZmVhdHVyZXMpO1xuXG5cdFx0Y29uc3QgZmVhdHVyZVZpZXdDb250YWluZXIgPSAkKCcuZmVhdHVyZS12aWV3LWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3Qub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB7XG5cdFx0XHRjb25zdCBmZWF0dXJlID0gZS5lbGVtZW50c1swXTtcblx0XHRcdGlmIChmZWF0dXJlKSB7XG5cdFx0XHRcdHRoaXMuc2hvd0ZlYXR1cmVWaWV3KGZlYXR1cmUsIGZlYXR1cmVWaWV3Q29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZmVhdHVyZSA/IGZlYXR1cmVzLmZpbmRJbmRleChmID0+IGYuaWQgPT09IHRoaXMuZmVhdHVyZSkgOiAwO1xuXHRcdGxpc3Quc2V0U2VsZWN0aW9uKFtpbmRleCA9PT0gLTEgPyAwIDogaW5kZXhdKTtcblxuXHRcdHNwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZWxlbWVudDogZmVhdHVyZXNMaXN0Q29udGFpbmVyLFxuXHRcdFx0bWluaW11bVNpemU6IDEwMCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCwgXywgaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdGZlYXR1cmVzTGlzdENvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHRcdFx0bGlzdC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHR9XG5cdFx0fSwgMjAwLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0c3BsaXRWaWV3LmFkZFZpZXcoe1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRlbGVtZW50OiBmZWF0dXJlVmlld0NvbnRhaW5lcixcblx0XHRcdG1pbmltdW1TaXplOiA1MDAsXG5cdFx0XHRtYXhpbXVtU2l6ZTogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLFxuXHRcdFx0bGF5b3V0OiAod2lkdGgsIF8sIGhlaWdodCkgPT4ge1xuXHRcdFx0XHRmZWF0dXJlVmlld0NvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHRcdFx0dGhpcy5mZWF0dXJlVmlld0RpbWVuc2lvbiA9IHsgaGVpZ2h0LCB3aWR0aCB9O1xuXHRcdFx0XHR0aGlzLmxheW91dEZlYXR1cmVWaWV3KCk7XG5cdFx0XHR9XG5cdFx0fSwgU2l6aW5nLkRpc3RyaWJ1dGUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRzcGxpdFZpZXcuc3R5bGUoe1xuXHRcdFx0c2VwYXJhdG9yQm9yZGVyOiB0aGlzLnRoZW1lLmdldENvbG9yKFBBTkVMX1NFQ1RJT05fQk9SREVSKSFcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRmVhdHVyZXNMaXN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBXb3JrYmVuY2hMaXN0PElFeHRlbnNpb25GZWF0dXJlRGVzY3JpcHRvcj4ge1xuXHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25GZWF0dXJlSXRlbVJlbmRlcmVyLCB0aGlzLmV4dGVuc2lvbklkKTtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBFeHRlbnNpb25GZWF0dXJlSXRlbURlbGVnYXRlKCk7XG5cdFx0Y29uc3QgbGlzdCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoTGlzdCwgJ0V4dGVuc2lvbkZlYXR1cmVzTGlzdCcsIGFwcGVuZChjb250YWluZXIsICQoJy5mZWF0dXJlcy1saXN0LXdyYXBwZXInKSksIGRlbGVnYXRlLCBbcmVuZGVyZXJdLCB7XG5cdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRBcmlhTGFiZWwoZXh0ZW5zaW9uRmVhdHVyZTogSUV4dGVuc2lvbkZlYXR1cmVEZXNjcmlwdG9yIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbkZlYXR1cmU/LmxhYmVsID8/ICcnO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2V4dGVuc2lvbiBmZWF0dXJlcyBsaXN0JywgXCJFeHRlbnNpb24gRmVhdHVyZXNcIik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZVxuXHRcdH0pIGFzIFdvcmtiZW5jaExpc3Q8SUV4dGVuc2lvbkZlYXR1cmVEZXNjcmlwdG9yPjtcblx0XHRyZXR1cm4gbGlzdDtcblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0RmVhdHVyZVZpZXcoKTogdm9pZCB7XG5cdFx0dGhpcy5mZWF0dXJlVmlldy52YWx1ZT8ubGF5b3V0KHRoaXMuZmVhdHVyZVZpZXdEaW1lbnNpb24/LmhlaWdodCwgdGhpcy5mZWF0dXJlVmlld0RpbWVuc2lvbj8ud2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93RmVhdHVyZVZpZXcoZmVhdHVyZTogSUV4dGVuc2lvbkZlYXR1cmVEZXNjcmlwdG9yLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZmVhdHVyZVZpZXcudmFsdWU/LmZlYXR1cmUuaWQgPT09IGZlYXR1cmUuaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cdFx0dGhpcy5mZWF0dXJlVmlldy52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uRmVhdHVyZVZpZXcsIHRoaXMuZXh0ZW5zaW9uSWQsIHRoaXMubWFuaWZlc3QsIGZlYXR1cmUpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmZlYXR1cmVWaWV3LnZhbHVlLmRvbU5vZGUpO1xuXHRcdHRoaXMubGF5b3V0RmVhdHVyZVZpZXcoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RmVhdHVyZXMoKTogSUV4dGVuc2lvbkZlYXR1cmVEZXNjcmlwdG9yW10ge1xuXHRcdGNvbnN0IGZlYXR1cmVzID0gUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSlcblx0XHRcdC5nZXRFeHRlbnNpb25GZWF0dXJlcygpLmZpbHRlcihmZWF0dXJlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLmdldFJlbmRlcmVyKGZlYXR1cmUpO1xuXHRcdFx0XHRjb25zdCBzaG91bGRSZW5kZXIgPSByZW5kZXJlcj8uc2hvdWxkUmVuZGVyKHRoaXMubWFuaWZlc3QpO1xuXHRcdFx0XHRyZW5kZXJlcj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm4gc2hvdWxkUmVuZGVyO1xuXHRcdFx0fSkuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblxuXHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5nZXRSZW5kZXJlcihydW50aW1lU3RhdHVzRmVhdHVyZSk7XG5cdFx0aWYgKHJlbmRlcmVyPy5zaG91bGRSZW5kZXIodGhpcy5tYW5pZmVzdCkpIHtcblx0XHRcdGZlYXR1cmVzLnNwbGljZSgwLCAwLCBydW50aW1lU3RhdHVzRmVhdHVyZSk7XG5cdFx0fVxuXHRcdHJlbmRlcmVyPy5kaXNwb3NlKCk7XG5cdFx0cmV0dXJuIGZlYXR1cmVzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZW5kZXJlcihmZWF0dXJlOiBJRXh0ZW5zaW9uRmVhdHVyZURlc2NyaXB0b3IpOiBJRXh0ZW5zaW9uRmVhdHVyZVJlbmRlcmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZmVhdHVyZS5yZW5kZXJlciA/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoZmVhdHVyZS5yZW5kZXJlcikgOiB1bmRlZmluZWQ7XG5cdH1cblxufVxuXG5pbnRlcmZhY2UgSUV4dGVuc2lvbkZlYXR1cmVJdGVtVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgbGFiZWw6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkaXNhYmxlZEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBzdGF0dXNFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgRXh0ZW5zaW9uRmVhdHVyZUl0ZW1EZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElFeHRlbnNpb25GZWF0dXJlRGVzY3JpcHRvcj4ge1xuXHRnZXRIZWlnaHQoKSB7IHJldHVybiAyMjsgfVxuXHRnZXRUZW1wbGF0ZUlkKCkgeyByZXR1cm4gJ2V4dGVuc2lvbkZlYXR1cmVEZXNjcmlwdG9yJzsgfVxufVxuXG5jbGFzcyBFeHRlbnNpb25GZWF0dXJlSXRlbVJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJRXh0ZW5zaW9uRmVhdHVyZURlc2NyaXB0b3IsIElFeHRlbnNpb25GZWF0dXJlSXRlbVRlbXBsYXRlRGF0YT4ge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAnZXh0ZW5zaW9uRmVhdHVyZURlc2NyaXB0b3InO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsXG5cdFx0QElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2Vcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUV4dGVuc2lvbkZlYXR1cmVJdGVtVGVtcGxhdGVEYXRhIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZXh0ZW5zaW9uLWZlYXR1cmUtbGlzdC1pdGVtJyk7XG5cdFx0Y29uc3QgbGFiZWwgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuZXh0ZW5zaW9uLWZlYXR1cmUtbGFiZWwnKSk7XG5cdFx0Y29uc3QgZGlzYWJsZWRFbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmV4dGVuc2lvbi1mZWF0dXJlLWRpc2FibGVkLWxhYmVsJykpO1xuXHRcdGRpc2FibGVkRWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdyZXZva2VkJywgXCJObyBBY2Nlc3NcIik7XG5cdFx0Y29uc3Qgc3RhdHVzRWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5leHRlbnNpb24tZmVhdHVyZS1zdGF0dXMnKSk7XG5cdFx0cmV0dXJuIHsgbGFiZWwsIGRpc2FibGVkRWxlbWVudCwgc3RhdHVzRWxlbWVudCwgZGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJRXh0ZW5zaW9uRmVhdHVyZURlc2NyaXB0b3IsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUV4dGVuc2lvbkZlYXR1cmVJdGVtVGVtcGxhdGVEYXRhKSB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnRleHRDb250ZW50ID0gZWxlbWVudC5sYWJlbDtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzYWJsZWRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBlbGVtZW50LmlkID09PSBydW50aW1lU3RhdHVzRmVhdHVyZS5pZCB8fCB0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UuaXNFbmFibGVkKHRoaXMuZXh0ZW5zaW9uSWQsIGVsZW1lbnQuaWQpID8gJ25vbmUnIDogJ2luaGVyaXQnO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbmFibGVtZW50KCh7IGV4dGVuc2lvbiwgZmVhdHVyZUlkLCBlbmFibGVkIH0pID0+IHtcblx0XHRcdGlmIChFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhleHRlbnNpb24sIHRoaXMuZXh0ZW5zaW9uSWQpICYmIGZlYXR1cmVJZCA9PT0gZWxlbWVudC5pZCkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZGlzYWJsZWRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBlbmFibGVkID8gJ25vbmUnIDogJ2luaGVyaXQnO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHN0YXR1c0VsZW1lbnRDbGFzc05hbWUgPSB0ZW1wbGF0ZURhdGEuc3RhdHVzRWxlbWVudC5jbGFzc05hbWU7XG5cdFx0Y29uc3QgdXBkYXRlU3RhdHVzID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWNjZXNzRGF0YSA9IHRoaXMuZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5nZXRBY2Nlc3NEYXRhKHRoaXMuZXh0ZW5zaW9uSWQsIGVsZW1lbnQuaWQpO1xuXHRcdFx0aWYgKGFjY2Vzc0RhdGE/LmN1cnJlbnQ/LnN0YXR1cykge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2luaGVyaXQnO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzRWxlbWVudC5jbGFzc05hbWUgPSBgJHtzdGF0dXNFbGVtZW50Q2xhc3NOYW1lfSAke1NldmVyaXR5SWNvbi5jbGFzc05hbWUoYWNjZXNzRGF0YS5jdXJyZW50LnN0YXR1cy5zZXZlcml0eSl9YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXNFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR1cGRhdGVTdGF0dXMoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZUFjY2Vzc0RhdGEoKHsgZXh0ZW5zaW9uLCBmZWF0dXJlSWQgfSkgPT4ge1xuXHRcdFx0aWYgKEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGV4dGVuc2lvbiwgdGhpcy5leHRlbnNpb25JZCkgJiYgZmVhdHVyZUlkID09PSBlbGVtZW50LmlkKSB7XG5cdFx0XHRcdHVwZGF0ZVN0YXR1cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElFeHRlbnNpb25GZWF0dXJlRGVzY3JpcHRvciwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRXh0ZW5zaW9uRmVhdHVyZUl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUV4dGVuc2lvbkZlYXR1cmVJdGVtVGVtcGxhdGVEYXRhKSB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cbmNsYXNzIEV4dGVuc2lvbkZlYXR1cmVWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0UGFydGljaXBhbnRzOiBJTGF5b3V0UGFydGljaXBhbnRbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0LFxuXHRcdHJlYWRvbmx5IGZlYXR1cmU6IElFeHRlbnNpb25GZWF0dXJlRGVzY3JpcHRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9ICQoJy5leHRlbnNpb24tZmVhdHVyZS1jb250ZW50Jyk7XG5cdFx0dGhpcy5jcmVhdGUodGhpcy5kb21Ob2RlKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKGNvbnRlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaGVhZGVyID0gYXBwZW5kKGNvbnRlbnQsICQoJy5mZWF0dXJlLWhlYWRlcicpKTtcblx0XHRjb25zdCB0aXRsZSA9IGFwcGVuZChoZWFkZXIsICQoJy5mZWF0dXJlLXRpdGxlJykpO1xuXHRcdHRpdGxlLnRleHRDb250ZW50ID0gdGhpcy5mZWF0dXJlLmxhYmVsO1xuXG5cdFx0aWYgKHRoaXMuZmVhdHVyZS5hY2Nlc3MuY2FuVG9nZ2xlKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKGhlYWRlciwgJCgnLmZlYXR1cmUtYWN0aW9ucycpKTtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IG5ldyBCdXR0b24oYWN0aW9uc0NvbnRhaW5lciwgZGVmYXVsdEJ1dHRvblN0eWxlcyk7XG5cdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvbkxhYmVsKGJ1dHRvbik7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbmFibGVtZW50KCh7IGV4dGVuc2lvbiwgZmVhdHVyZUlkIH0pID0+IHtcblx0XHRcdFx0aWYgKEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGV4dGVuc2lvbiwgdGhpcy5leHRlbnNpb25JZCkgJiYgZmVhdHVyZUlkID09PSB0aGlzLmZlYXR1cmUuaWQpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvbkxhYmVsKGJ1dHRvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbi5vbkRpZENsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5pc0VuYWJsZWQodGhpcy5leHRlbnNpb25JZCwgdGhpcy5mZWF0dXJlLmlkKTtcblx0XHRcdFx0Y29uc3QgY29uZmlybWF0aW9uUmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWNjZXNzRXh0ZW5zaW9uRmVhdHVyZScsIFwiRW5hYmxlICd7MH0nIEZlYXR1cmVcIiwgdGhpcy5mZWF0dXJlLmxhYmVsKSxcblx0XHRcdFx0XHRtZXNzYWdlOiBlbmFibGVkXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdkaXNhYmxlQWNjZXNzRXh0ZW5zaW9uRmVhdHVyZU1lc3NhZ2UnLCBcIldvdWxkIHlvdSBsaWtlIHRvIHJldm9rZSAnezB9JyBleHRlbnNpb24gdG8gYWNjZXNzICd7MX0nIGZlYXR1cmU/XCIsIHRoaXMubWFuaWZlc3QuZGlzcGxheU5hbWUgPz8gdGhpcy5leHRlbnNpb25JZC52YWx1ZSwgdGhpcy5mZWF0dXJlLmxhYmVsKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZW5hYmxlQWNjZXNzRXh0ZW5zaW9uRmVhdHVyZU1lc3NhZ2UnLCBcIldvdWxkIHlvdSBsaWtlIHRvIGFsbG93ICd7MH0nIGV4dGVuc2lvbiB0byBhY2Nlc3MgJ3sxfScgZmVhdHVyZT9cIiwgdGhpcy5tYW5pZmVzdC5kaXNwbGF5TmFtZSA/PyB0aGlzLmV4dGVuc2lvbklkLnZhbHVlLCB0aGlzLmZlYXR1cmUubGFiZWwpLFxuXHRcdFx0XHRcdGN1c3RvbTogdHJ1ZSxcblx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBlbmFibGVkID8gbG9jYWxpemUoJ3Jldm9rZScsIFwiUmV2b2tlIEFjY2Vzc1wiKSA6IGxvY2FsaXplKCdncmFudCcsIFwiQWxsb3cgQWNjZXNzXCIpLFxuXHRcdFx0XHRcdGNhbmNlbEJ1dHRvbjogbG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKGNvbmZpcm1hdGlvblJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2Uuc2V0RW5hYmxlbWVudCh0aGlzLmV4dGVuc2lvbklkLCB0aGlzLmZlYXR1cmUuaWQsICFlbmFibGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJvZHkgPSBhcHBlbmQoY29udGVudCwgJCgnLmZlYXR1cmUtYm9keScpKTtcblxuXHRcdGNvbnN0IGJvZHlDb250ZW50ID0gJCgnLmZlYXR1cmUtYm9keS1jb250ZW50Jyk7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZUNvbnRlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoYm9keUNvbnRlbnQsIHt9KSk7XG5cdFx0YXBwZW5kKGJvZHksIHNjcm9sbGFibGVDb250ZW50LmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMucHVzaCh7IGxheW91dDogKCkgPT4gc2Nyb2xsYWJsZUNvbnRlbnQuc2NhbkRvbU5vZGUoKSB9KTtcblx0XHRzY3JvbGxhYmxlQ29udGVudC5zY2FuRG9tTm9kZSgpO1xuXG5cdFx0aWYgKHRoaXMuZmVhdHVyZS5kZXNjcmlwdGlvbikge1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhcHBlbmQoYm9keUNvbnRlbnQsICQoJy5mZWF0dXJlLWRlc2NyaXB0aW9uJykpO1xuXHRcdFx0ZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSB0aGlzLmZlYXR1cmUuZGVzY3JpcHRpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWNjZXNzRGF0YSA9IHRoaXMuZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5nZXRBY2Nlc3NEYXRhKHRoaXMuZXh0ZW5zaW9uSWQsIHRoaXMuZmVhdHVyZS5pZCk7XG5cdFx0aWYgKGFjY2Vzc0RhdGE/LmN1cnJlbnQ/LnN0YXR1cykge1xuXHRcdFx0YXBwZW5kKGJvZHlDb250ZW50LCAkKCcuZmVhdHVyZS1zdGF0dXMnLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoYHNwYW4ke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGFjY2Vzc0RhdGEuY3VycmVudC5zdGF0dXMuc2V2ZXJpdHkgPT09IFNldmVyaXR5LkVycm9yID8gZXJyb3JJY29uIDogYWNjZXNzRGF0YS5jdXJyZW50LnN0YXR1cy5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuV2FybmluZyA/IHdhcm5pbmdJY29uIDogaW5mb0ljb24pfWAsIHVuZGVmaW5lZCksXG5cdFx0XHRcdCQoJ3NwYW4nLCB1bmRlZmluZWQsIGFjY2Vzc0RhdGEuY3VycmVudC5zdGF0dXMubWVzc2FnZSkpKTtcblx0XHR9XG5cblx0XHRjb25zdCBmZWF0dXJlQ29udGVudEVsZW1lbnQgPSBhcHBlbmQoYm9keUNvbnRlbnQsICQoJy5mZWF0dXJlLWNvbnRlbnQnKSk7XG5cdFx0aWYgKHRoaXMuZmVhdHVyZS5yZW5kZXJlcikge1xuXHRcdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlPElFeHRlbnNpb25GZWF0dXJlUmVuZGVyZXI+KHRoaXMuZmVhdHVyZS5yZW5kZXJlcik7XG5cdFx0XHRpZiAocmVuZGVyZXIudHlwZSA9PT0gJ3RhYmxlJykge1xuXHRcdFx0XHR0aGlzLnJlbmRlclRhYmxlRGF0YShmZWF0dXJlQ29udGVudEVsZW1lbnQsIDxJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXI+cmVuZGVyZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChyZW5kZXJlci50eXBlID09PSAnbWFya2Rvd24nKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyTWFya2Rvd25EYXRhKGZlYXR1cmVDb250ZW50RWxlbWVudCwgPElFeHRlbnNpb25GZWF0dXJlTWFya2Rvd25SZW5kZXJlcj5yZW5kZXJlcik7XG5cdFx0XHR9IGVsc2UgaWYgKHJlbmRlcmVyLnR5cGUgPT09ICdtYXJrZG93bit0YWJsZScpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJNYXJrZG93bkFuZFRhYmxlRGF0YShmZWF0dXJlQ29udGVudEVsZW1lbnQsIDxJRXh0ZW5zaW9uRmVhdHVyZU1hcmtkb3duQW5kVGFibGVSZW5kZXJlcj5yZW5kZXJlcik7XG5cdFx0XHR9IGVsc2UgaWYgKHJlbmRlcmVyLnR5cGUgPT09ICdlbGVtZW50Jykge1xuXHRcdFx0XHR0aGlzLnJlbmRlckVsZW1lbnREYXRhKGZlYXR1cmVDb250ZW50RWxlbWVudCwgPElFeHRlbnNpb25GZWF0dXJlRWxlbWVudFJlbmRlcmVyPnJlbmRlcmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUJ1dHRvbkxhYmVsKGJ1dHRvbjogQnV0dG9uKTogdm9pZCB7XG5cdFx0YnV0dG9uLmxhYmVsID0gdGhpcy5leHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCh0aGlzLmV4dGVuc2lvbklkLCB0aGlzLmZlYXR1cmUuaWQpID8gbG9jYWxpemUoJ3Jldm9rZScsIFwiUmV2b2tlIEFjY2Vzc1wiKSA6IGxvY2FsaXplKCdlbmFibGUnLCBcIkFsbG93IEFjY2Vzc1wiKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVGFibGVEYXRhKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHJlbmRlcmVyOiBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0YWJsZURhdGEgPSB0aGlzLl9yZWdpc3RlcihyZW5kZXJlci5yZW5kZXIodGhpcy5tYW5pZmVzdCkpO1xuXHRcdGNvbnN0IHRhYmxlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRpZiAodGFibGVEYXRhLm9uRGlkQ2hhbmdlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0YWJsZURhdGEub25EaWRDaGFuZ2UoZGF0YSA9PiB7XG5cdFx0XHRcdGNsZWFyTm9kZShjb250YWluZXIpO1xuXHRcdFx0XHR0YWJsZURpc3Bvc2FibGUudmFsdWUgPSB0aGlzLnJlbmRlclRhYmxlKGRhdGEsIGNvbnRhaW5lcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRhYmxlRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMucmVuZGVyVGFibGUodGFibGVEYXRhLmRhdGEsIGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclRhYmxlKHRhYmxlRGF0YTogSVRhYmxlRGF0YSwgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRhcHBlbmQoY29udGFpbmVyLFxuXHRcdFx0JCgndGFibGUnLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdC4uLnRhYmxlRGF0YS5oZWFkZXJzLm1hcChoZWFkZXIgPT4gJCgndGgnLCB1bmRlZmluZWQsIGhlYWRlcikpXG5cdFx0XHRcdCksXG5cdFx0XHRcdC4uLnRhYmxlRGF0YS5yb3dzXG5cdFx0XHRcdFx0Lm1hcChyb3cgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuICQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHQuLi5yb3cubWFwKHJvd0RhdGEgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmICh0eXBlb2Ygcm93RGF0YSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiAkKCd0ZCcsIHVuZGVmaW5lZCwgJCgncCcsIHVuZGVmaW5lZCwgcm93RGF0YSkpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRjb25zdCBkYXRhID0gQXJyYXkuaXNBcnJheShyb3dEYXRhKSA/IHJvd0RhdGEgOiBbcm93RGF0YV07XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuICQoJ3RkJywgdW5kZWZpbmVkLCAuLi5kYXRhLm1hcChpdGVtID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdDogTm9kZVtdID0gW107XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoaXNNYXJrZG93blN0cmluZyhyb3dEYXRhKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBlbGVtZW50ID0gJCgnJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5yZW5kZXJNYXJrZG93bihyb3dEYXRhLCBlbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGl0ZW0gaW5zdGFuY2VvZiBSZXNvbHZlZEtleWJpbmRpbmcpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgZWxlbWVudCA9ICQoJycpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBrYmwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEtleWJpbmRpbmdMYWJlbChlbGVtZW50LCBPUywgZGVmYXVsdEtleWJpbmRpbmdMYWJlbFN0eWxlcykpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRrYmwuc2V0KGl0ZW0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaChlbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXRlbSBpbnN0YW5jZW9mIENvbG9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKCQoJ3NwYW4nLCB7IGNsYXNzOiAnY29sb3JCb3gnLCBzdHlsZTogJ2JhY2tncm91bmQtY29sb3I6ICcgKyBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdChpdGVtKSB9LCAnJykpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaCgkKCdjb2RlJywgdW5kZWZpbmVkLCBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleChpdGVtKSkpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0XHRcdFx0XHR9KS5mbGF0KCkpO1xuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KSkpO1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWFya2Rvd25BbmRUYWJsZURhdGEoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgcmVuZGVyZXI6IElFeHRlbnNpb25GZWF0dXJlTWFya2Rvd25BbmRUYWJsZVJlbmRlcmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgbWFya2Rvd25BbmRUYWJsZURhdGEgPSB0aGlzLl9yZWdpc3RlcihyZW5kZXJlci5yZW5kZXIodGhpcy5tYW5pZmVzdCkpO1xuXHRcdGlmIChtYXJrZG93bkFuZFRhYmxlRGF0YS5vbkRpZENoYW5nZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobWFya2Rvd25BbmRUYWJsZURhdGEub25EaWRDaGFuZ2UoZGF0YSA9PiB7XG5cdFx0XHRcdGNsZWFyTm9kZShjb250YWluZXIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duQW5kVGFibGUoZGF0YSwgY29udGFpbmVyKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXJNYXJrZG93bkFuZFRhYmxlKG1hcmtkb3duQW5kVGFibGVEYXRhLmRhdGEsIGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtkb3duRGF0YShjb250YWluZXI6IEhUTUxFbGVtZW50LCByZW5kZXJlcjogSUV4dGVuc2lvbkZlYXR1cmVNYXJrZG93blJlbmRlcmVyKTogdm9pZCB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21hcmtkb3duJyk7XG5cdFx0Y29uc3QgbWFya2Rvd25EYXRhID0gdGhpcy5fcmVnaXN0ZXIocmVuZGVyZXIucmVuZGVyKHRoaXMubWFuaWZlc3QpKTtcblx0XHRpZiAobWFya2Rvd25EYXRhLm9uRGlkQ2hhbmdlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihtYXJrZG93bkRhdGEub25EaWRDaGFuZ2UoZGF0YSA9PiB7XG5cdFx0XHRcdGNsZWFyTm9kZShjb250YWluZXIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duKGRhdGEsIGNvbnRhaW5lcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMucmVuZGVyTWFya2Rvd24obWFya2Rvd25EYXRhLmRhdGEsIGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtkb3duKG1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCB7IGVsZW1lbnQgfSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKHtcblx0XHRcdHZhbHVlOiBtYXJrZG93bi52YWx1ZSxcblx0XHRcdGlzVHJ1c3RlZDogbWFya2Rvd24uaXNUcnVzdGVkLFxuXHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWVcblx0XHR9KSk7XG5cdFx0YXBwZW5kKGNvbnRhaW5lciwgZWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtkb3duQW5kVGFibGUoZGF0YTogQXJyYXk8SU1hcmtkb3duU3RyaW5nIHwgSVRhYmxlRGF0YT4sIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IG1hcmtkb3duT3JUYWJsZSBvZiBkYXRhKSB7XG5cdFx0XHRpZiAoaXNNYXJrZG93blN0cmluZyhtYXJrZG93bk9yVGFibGUpKSB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSAkKCcnLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duKG1hcmtkb3duT3JUYWJsZSwgZWxlbWVudCk7XG5cdFx0XHRcdGFwcGVuZChjb250YWluZXIsIGVsZW1lbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdGFibGVFbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgndGFibGUnKSk7XG5cdFx0XHRcdHRoaXMucmVuZGVyVGFibGUobWFya2Rvd25PclRhYmxlLCB0YWJsZUVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRWxlbWVudERhdGEoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgcmVuZGVyZXI6IElFeHRlbnNpb25GZWF0dXJlRWxlbWVudFJlbmRlcmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudERhdGEgPSB0aGlzLl9yZWdpc3RlcihyZW5kZXJlci5yZW5kZXIodGhpcy5tYW5pZmVzdCkpO1xuXHRcdGlmIChlbGVtZW50RGF0YS5vbkRpZENoYW5nZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZWxlbWVudERhdGEub25EaWRDaGFuZ2UoZGF0YSA9PiB7XG5cdFx0XHRcdGNsZWFyTm9kZShjb250YWluZXIpO1xuXHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZGF0YSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChlbGVtZW50RGF0YS5kYXRhKTtcblx0fVxuXG5cdGxheW91dChoZWlnaHQ/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMuZm9yRWFjaChwID0+IHAubGF5b3V0KGhlaWdodCwgd2lkdGgpKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLFNBQVMsR0FBRyxRQUFRLFdBQVcsdUJBQXVCLGlCQUFpQjtBQUN2RSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLDJCQUErQztBQUN4RCxTQUFTLGFBQWEsUUFBUSxpQkFBaUI7QUFDL0MsU0FBc0MsWUFBbUUsMkNBQW9MO0FBQzdSLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsY0FBYztBQUN2QixTQUFTLHFCQUFxQixvQ0FBb0M7QUFDbEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxlQUFlLGdCQUFnQjtBQUN4QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQjtBQUMxQixPQUFPLGNBQWM7QUFDckIsU0FBUyxXQUFXLFVBQVUsbUJBQW1CO0FBQ2pELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsVUFBVTtBQUNuQixTQUEwQixnQkFBZ0Isd0JBQXdCO0FBQ2xFLFNBQVMsYUFBYTtBQUN0QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxZQUFZLFdBQVcsWUFBWSxpQkFBaUI7QUFDN0QsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFPekMsSUFBTSxnQ0FBTixjQUE0QyxXQUF1RDtBQUFBLEVBS2xHLFlBQ3FDLGtCQUNKLGNBQ3NCLG9DQUNYLHlCQUMxQztBQUNELFVBQU07QUFMOEI7QUFDSjtBQUNzQjtBQUNYO0FBTjVDLFNBQVMsT0FBTztBQUFBLEVBU2hCO0FBQUEsRUFFQSxhQUFhLFVBQXVDO0FBQ25ELFVBQU0sY0FBYyxJQUFJLG9CQUFvQixlQUFlLFNBQVMsV0FBVyxTQUFTLElBQUksQ0FBQztBQUM3RixRQUFJLENBQUMsS0FBSyxpQkFBaUIsV0FBVyxLQUFLLE9BQUssb0JBQW9CLE9BQU8sRUFBRSxZQUFZLFdBQVcsQ0FBQyxHQUFHO0FBQ3ZHLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxDQUFDLENBQUMsU0FBUyxRQUFRLENBQUMsQ0FBQyxTQUFTO0FBQUEsRUFDdEM7QUFBQSxFQUVBLE9BQU8sVUFBMEQ7QUFDaEUsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQU0sY0FBYyxJQUFJLG9CQUFvQixlQUFlLFNBQVMsV0FBVyxTQUFTLElBQUksQ0FBQztBQUM3RixVQUFNLFVBQVUsWUFBWSxJQUFJLElBQUksUUFBcUIsQ0FBQztBQUMxRCxnQkFBWSxJQUFJLEtBQUssaUJBQWlCLDRCQUE0QixPQUFLO0FBQ3RFLFVBQUksRUFBRSxLQUFLLGVBQWEsb0JBQW9CLE9BQU8sV0FBVyxXQUFXLENBQUMsR0FBRztBQUM1RSxnQkFBUSxLQUFLLEtBQUssY0FBYyxVQUFVLFdBQVcsQ0FBQztBQUFBLE1BQ3ZEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixnQkFBWSxJQUFJLEtBQUssbUNBQW1DLHNCQUFzQixPQUFLLFFBQVEsS0FBSyxLQUFLLGNBQWMsVUFBVSxXQUFXLENBQUMsQ0FBQyxDQUFDO0FBQzNJLFdBQU87QUFBQSxNQUNOLGFBQWEsUUFBUTtBQUFBLE1BQ3JCLE1BQU0sS0FBSyxjQUFjLFVBQVUsV0FBVztBQUFBLE1BQzlDLFNBQVMsTUFBTSxZQUFZLFFBQVE7QUFBQSxJQUNwQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGNBQWMsVUFBOEIsYUFBMkM7QUFDOUYsVUFBTSxZQUFZLEVBQUUsaUJBQWlCO0FBQ3JDLFVBQU0sY0FBYyxJQUFJLG9CQUFvQixlQUFlLFNBQVMsV0FBVyxTQUFTLElBQUksQ0FBQztBQUM3RixVQUFNLFNBQVMsS0FBSyxpQkFBaUIsb0JBQW9CLEVBQUUsWUFBWSxLQUFLO0FBQzVFLFFBQUksS0FBSyxpQkFBaUIsV0FBVyxLQUFLLGVBQWEsb0JBQW9CLE9BQU8sVUFBVSxZQUFZLFdBQVcsQ0FBQyxHQUFHO0FBQ3RILFlBQU0sT0FBTyxJQUFJLGVBQWU7QUFDaEMsV0FBSyxlQUFlLE9BQU8sU0FBUyxjQUFjLFlBQVksQ0FBQztBQUFBO0FBQUEsQ0FBTTtBQUNyRSxVQUFJLE9BQU8saUJBQWlCO0FBQzNCLFlBQUksT0FBTyxnQkFBZ0IsaUJBQWlCLFNBQVM7QUFDcEQsZUFBSyxlQUFlLDJCQUEyQixPQUFPLGdCQUFnQixnQkFBZ0IsTUFBTTtBQUFBLFFBQzdGLE9BQU87QUFDTixlQUFLLGVBQWUsa0JBQWtCLE9BQU8sZ0JBQWdCLGlCQUFpQixlQUFlLGVBQWUsT0FBTyxnQkFBZ0IsZ0JBQWdCLE1BQU07QUFBQSxRQUMxSjtBQUFBLE1BQ0QsT0FBTztBQUNOLGFBQUssZUFBZSxtQkFBbUI7QUFBQSxNQUN4QztBQUNBLFdBQUssZUFBZSxNQUFNLFdBQVcsV0FBVztBQUFBLElBQ2pEO0FBQ0EsVUFBTSxXQUFXLFNBQVMsR0FBK0IsV0FBVyx5QkFBeUIsRUFBRSxxQkFBcUI7QUFDcEgsZUFBVyxXQUFXLFVBQVU7QUFDL0IsWUFBTSxhQUFhLEtBQUssbUNBQW1DLGNBQWMsYUFBYSxRQUFRLEVBQUU7QUFDaEcsVUFBSSxZQUFZO0FBQ2YsYUFBSyxlQUFlLElBQUksZUFBZTtBQUFBLE9BQVUsU0FBUyxTQUFTLGFBQWEsUUFBUSxLQUFLLENBQUM7QUFBQTtBQUFBLENBQU0sR0FBRyxXQUFXLFdBQVc7QUFDN0gsWUFBSSxXQUFXLFlBQVksUUFBUTtBQUNsQyxnQkFBTSxjQUFjO0FBQUEsWUFBTztBQUFBLFlBQzFCO0FBQUEsY0FBRTtBQUFBLGNBQ0Q7QUFBQSxjQUNBLFNBQVMsb0JBQW9CLHdFQUF3RSxZQUFZLFlBQVksUUFBUSxRQUFRLG1CQUFtQixRQUFRLEtBQUs7QUFBQSxZQUFDO0FBQUEsVUFBQztBQUNqTCxzQkFBWSxNQUFNLGVBQWU7QUFDakMsZUFBSyxvQkFBb0IsV0FBVyxXQUFXLGFBQWEsV0FBVztBQUFBLFFBQ3hFO0FBQ0EsY0FBTUEsVUFBUyxZQUFZLFNBQVM7QUFDcEMsWUFBSUEsU0FBUTtBQUNYLGdCQUFNLE9BQU8sSUFBSSxlQUFlO0FBQ2hDLGNBQUlBLFNBQVEsYUFBYSxTQUFTLE9BQU87QUFDeEMsaUJBQUssZUFBZSxLQUFLLFVBQVUsRUFBRSxLQUFLQSxRQUFPLE9BQU87QUFBQTtBQUFBLENBQU07QUFBQSxVQUMvRDtBQUNBLGNBQUlBLFNBQVEsYUFBYSxTQUFTLFNBQVM7QUFDMUMsaUJBQUssZUFBZSxLQUFLLFlBQVksRUFBRSxLQUFLQSxRQUFPLE9BQU87QUFBQTtBQUFBLENBQU07QUFBQSxVQUNqRTtBQUNBLGNBQUksS0FBSyxPQUFPO0FBQ2YsaUJBQUssZUFBZSxNQUFNLFdBQVcsV0FBVztBQUFBLFVBQ2pEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsUUFBSSxPQUFPLGNBQWMsVUFBVSxPQUFPLFNBQVMsUUFBUTtBQUMxRCxZQUFNLE9BQU8sSUFBSSxlQUFlO0FBQ2hDLFVBQUksT0FBTyxjQUFjLFFBQVE7QUFDaEMsYUFBSyxlQUFlO0FBQUEsT0FBVSxTQUFTLG1CQUFtQix5QkFBeUIsT0FBTyxjQUFjLE1BQU0sQ0FBQztBQUFBLENBQUk7QUFDbkgsbUJBQVcsU0FBUyxPQUFPLGVBQWU7QUFDekMsZUFBSyxlQUFlLEtBQUssUUFBUSxNQUFNLEVBQUUsVUFBVSxnQkFBZ0IsS0FBSyxDQUFDO0FBQUE7QUFBQSxDQUFNO0FBQUEsUUFDaEY7QUFBQSxNQUNEO0FBQ0EsVUFBSSxPQUFPLFNBQVMsUUFBUTtBQUMzQixhQUFLLGVBQWU7QUFBQSxPQUFVLFNBQVMsYUFBYSxrQkFBa0IsT0FBTyxTQUFTLE1BQU0sQ0FBQztBQUFBLENBQUk7QUFDakcsbUJBQVcsV0FBVyxPQUFPLFVBQVU7QUFDdEMsZUFBSyxlQUFlLE1BQU0sUUFBUSxTQUFTLFNBQVMsUUFBUSxRQUFRLFFBQVEsUUFBUSxTQUFTLFNBQVMsVUFBVSxRQUFRLFVBQVUsUUFBUSxNQUFNLEVBQUUsVUFBVSxRQUFRLE9BQU87QUFBQTtBQUFBLENBQU07QUFBQSxRQUNsTDtBQUFBLE1BQ0Q7QUFDQSxVQUFJLEtBQUssT0FBTztBQUNmLGFBQUssZUFBZSxNQUFNLFdBQVcsV0FBVztBQUFBLE1BQ2pEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxlQUFlLFVBQTJCLFdBQXdCLGFBQW9DO0FBQzdHLFVBQU0sRUFBRSxRQUFRLElBQUksWUFBWSxJQUFJLEtBQUssd0JBQXdCLE9BQU87QUFBQSxNQUN2RSxPQUFPLFNBQVM7QUFBQSxNQUNoQixXQUFXLFNBQVM7QUFBQSxNQUNwQixtQkFBbUI7QUFBQSxJQUNwQixDQUFDLENBQUM7QUFDRixXQUFPLFdBQVcsT0FBTztBQUFBLEVBQzFCO0FBQUEsRUFFUSxvQkFBb0IsV0FBd0IsYUFBcUIsYUFBb0M7QUFDNUcsVUFBTSxRQUFRO0FBQ2QsVUFBTSxTQUFTO0FBQ2YsVUFBTSxTQUFTLEVBQUUsS0FBSyxHQUFHLE9BQU8sR0FBRyxRQUFRLElBQUksTUFBTSxFQUFFO0FBQ3ZELFVBQU0sYUFBYSxRQUFRLE9BQU8sT0FBTyxPQUFPO0FBQ2hELFVBQU0sY0FBYyxTQUFTLE9BQU8sTUFBTSxPQUFPO0FBRWpELFVBQU0saUJBQWlCLE9BQU8sV0FBVyxFQUFFLDBCQUEwQixDQUFDO0FBQ3RFLG1CQUFlLE1BQU0sV0FBVztBQUVoQyxVQUFNLFVBQVUsT0FBTyxnQkFBZ0IsRUFBRSx3QkFBd0IsQ0FBQztBQUNsRSxZQUFRLE1BQU0sV0FBVztBQUN6QixZQUFRLE1BQU0sUUFBUTtBQUN0QixZQUFRLE1BQU0sU0FBUztBQUV2QixRQUFJLFdBQVc7QUFDZixVQUFNLE1BQU0sb0JBQUksSUFBb0I7QUFDcEMsZUFBVyxjQUFjLGFBQWE7QUFDckMsWUFBTSxNQUFNLEdBQUcsV0FBVyxRQUFRLENBQUMsSUFBSSxXQUFXLGVBQWUsV0FBVyxFQUFFLE9BQU8sUUFBUSxDQUFDLENBQUM7QUFDL0YsVUFBSSxJQUFJLE1BQU0sSUFBSSxJQUFJLEdBQUcsS0FBSyxLQUFLLENBQUM7QUFDcEMsaUJBQVcsS0FBSyxJQUFJLFVBQVUsSUFBSSxJQUFJLEdBQUcsQ0FBRTtBQUFBLElBQzVDO0FBRUEsVUFBTSxNQUFNLG9CQUFJLEtBQUs7QUFFckIsVUFBTSxTQUFrQixDQUFDO0FBQ3pCLGFBQVMsSUFBSSxHQUFHLEtBQUssSUFBSSxLQUFLO0FBQzdCLFlBQU0sT0FBTyxJQUFJLEtBQUssR0FBRztBQUN6QixXQUFLLFFBQVEsSUFBSSxRQUFRLEtBQUssS0FBSyxFQUFFO0FBQ3JDLFlBQU0sYUFBYSxHQUFHLEtBQUssUUFBUSxDQUFDLElBQUksS0FBSyxlQUFlLFdBQVcsRUFBRSxPQUFPLFFBQVEsQ0FBQyxDQUFDO0FBQzFGLFlBQU0sUUFBUSxJQUFJLElBQUksVUFBVSxLQUFLO0FBQ3JDLFlBQU0sSUFBSyxJQUFJLEtBQU07QUFDckIsWUFBTSxJQUFJLGNBQWUsUUFBUSxXQUFZO0FBQzdDLGFBQU8sS0FBSyxFQUFFLEdBQUcsR0FBRyxNQUFNLFlBQVksTUFBTSxDQUFDO0FBQUEsSUFDOUM7QUFFQSxVQUFNLFFBQVEsT0FBTyxnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQztBQUN4RCxVQUFNLE1BQU0sT0FBTyxPQUFPLEVBQUUsSUFBSSxLQUFLLENBQUM7QUFDdEMsUUFBSSxhQUFhLFNBQVMsR0FBRyxLQUFLLElBQUk7QUFDdEMsUUFBSSxhQUFhLFVBQVUsR0FBRyxNQUFNLElBQUk7QUFDeEMsUUFBSSxhQUFhLFdBQVcsT0FBTyxLQUFLLElBQUksTUFBTSxFQUFFO0FBRXBELFVBQU0sSUFBSSxFQUFFLElBQUksR0FBRztBQUNuQixNQUFFLGFBQWEsYUFBYSxhQUFhLE9BQU8sSUFBSSxJQUFJLE9BQU8sR0FBRyxHQUFHO0FBQ3JFLFFBQUksWUFBWSxDQUFDO0FBRWpCLFVBQU0sWUFBWSxFQUFFLElBQUksTUFBTTtBQUM5QixjQUFVLGFBQWEsTUFBTSxHQUFHO0FBQ2hDLGNBQVUsYUFBYSxNQUFNLEdBQUcsV0FBVyxFQUFFO0FBQzdDLGNBQVUsYUFBYSxNQUFNLEdBQUcsVUFBVSxFQUFFO0FBQzVDLGNBQVUsYUFBYSxNQUFNLEdBQUcsV0FBVyxFQUFFO0FBQzdDLGNBQVUsYUFBYSxVQUFVLGNBQWMsU0FBUyxDQUFDO0FBQ3pELGNBQVUsYUFBYSxnQkFBZ0IsS0FBSztBQUM1QyxNQUFFLFlBQVksU0FBUztBQUV2QixhQUFTLElBQUksR0FBRyxLQUFLLElBQUksS0FBSyxHQUFHO0FBQ2hDLFlBQU0sT0FBTyxJQUFJLEtBQUssR0FBRztBQUN6QixXQUFLLFFBQVEsSUFBSSxRQUFRLEtBQUssS0FBSyxFQUFFO0FBQ3JDLFlBQU0sYUFBYSxHQUFHLEtBQUssUUFBUSxDQUFDLElBQUksS0FBSyxlQUFlLFdBQVcsRUFBRSxPQUFPLFFBQVEsQ0FBQyxDQUFDO0FBQzFGLFlBQU0sSUFBSyxJQUFJLEtBQU07QUFHckIsWUFBTSxPQUFPLEVBQUUsSUFBSSxNQUFNO0FBQ3pCLFdBQUssYUFBYSxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQzlCLFdBQUssYUFBYSxNQUFNLEdBQUcsV0FBVyxFQUFFO0FBQ3hDLFdBQUssYUFBYSxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQzlCLFdBQUssYUFBYSxNQUFNLEdBQUcsY0FBYyxFQUFFLEVBQUU7QUFDN0MsV0FBSyxhQUFhLFVBQVUsY0FBYyxTQUFTLENBQUM7QUFDcEQsV0FBSyxhQUFhLGdCQUFnQixLQUFLO0FBQ3ZDLFFBQUUsWUFBWSxJQUFJO0FBRWxCLFlBQU0sUUFBUSxFQUFFLElBQUksTUFBTTtBQUMxQixZQUFNLGFBQWEsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUMvQixZQUFNLGFBQWEsTUFBTSxHQUFHO0FBQzVCLFlBQU0sYUFBYSxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQy9CLFlBQU0sYUFBYSxNQUFNLEdBQUcsV0FBVyxFQUFFO0FBQ3pDLFlBQU0sYUFBYSxVQUFVLGNBQWMsVUFBVSxDQUFDO0FBQ3RELFlBQU0sYUFBYSxnQkFBZ0IsS0FBSztBQUN4QyxRQUFFLFlBQVksS0FBSztBQUVuQixZQUFNLFlBQVksRUFBRSxJQUFJLE1BQU07QUFDOUIsZ0JBQVUsYUFBYSxLQUFLLEdBQUcsQ0FBQyxFQUFFO0FBQ2xDLGdCQUFVLGFBQWEsS0FBSyxHQUFHLE1BQU0sRUFBRTtBQUN2QyxnQkFBVSxhQUFhLGVBQWUsUUFBUTtBQUM5QyxnQkFBVSxhQUFhLFFBQVEsY0FBYyxVQUFVLENBQUM7QUFDeEQsZ0JBQVUsYUFBYSxhQUFhLE1BQU07QUFDMUMsZ0JBQVUsY0FBYztBQUN4QixRQUFFLFlBQVksU0FBUztBQUFBLElBQ3hCO0FBRUEsVUFBTSxPQUFPLEVBQUUsSUFBSSxVQUFVO0FBQzdCLFNBQUssYUFBYSxRQUFRLE1BQU07QUFDaEMsU0FBSyxhQUFhLFVBQVUsY0FBYyxTQUFTLENBQUM7QUFDcEQsU0FBSyxhQUFhLGdCQUFnQixLQUFLO0FBQ3ZDLFNBQUssYUFBYSxVQUFVLE9BQU8sSUFBSSxPQUFLLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxLQUFLLEdBQUcsQ0FBQztBQUN0RSxNQUFFLFlBQVksSUFBSTtBQUVsQixVQUFNLGtCQUFrQixFQUFFLElBQUksUUFBUTtBQUN0QyxvQkFBZ0IsYUFBYSxLQUFLLEtBQUs7QUFDdkMsb0JBQWdCLE1BQU0sVUFBVTtBQUNoQyxNQUFFLFlBQVksZUFBZTtBQUU3QixVQUFNLGtCQUFrQixZQUFZLElBQUksSUFBSSxrQkFBK0IsQ0FBQztBQUM1RSxVQUFNLG9CQUFvQixDQUFDLFVBQTRCO0FBQ3RELFlBQU0sT0FBTyxJQUFJLHNCQUFzQjtBQUN2QyxZQUFNLFNBQVMsTUFBTSxVQUFVLEtBQUssT0FBTyxPQUFPO0FBRWxELFVBQUk7QUFDSixVQUFJLGNBQWM7QUFFbEIsYUFBTyxRQUFRLFdBQVM7QUFDdkIsY0FBTSxXQUFXLEtBQUssSUFBSSxNQUFNLElBQUksTUFBTTtBQUMxQyxZQUFJLFdBQVcsYUFBYTtBQUMzQix3QkFBYztBQUNkLHlCQUFlO0FBQUEsUUFDaEI7QUFBQSxNQUNELENBQUM7QUFFRCxVQUFJLGNBQWM7QUFDakIsd0JBQWdCLGFBQWEsTUFBTSxHQUFHLGFBQWEsQ0FBQyxFQUFFO0FBQ3RELHdCQUFnQixhQUFhLE1BQU0sR0FBRyxhQUFhLENBQUMsRUFBRTtBQUN0RCx3QkFBZ0IsTUFBTSxVQUFVO0FBQ2hDLGdCQUFRLE1BQU0sT0FBTyxHQUFHLGFBQWEsSUFBSSxFQUFFO0FBQzNDLGdCQUFRLE1BQU0sTUFBTSxHQUFHLGFBQWEsSUFBSSxFQUFFO0FBQzFDLHdCQUFnQixRQUFRLEtBQUssYUFBYSxpQkFBaUI7QUFBQSxVQUMxRCxTQUFTLElBQUksZUFBZSxHQUFHLGFBQWEsSUFBSSxLQUFLLGFBQWEsS0FBSyxXQUFXO0FBQUEsVUFDbEYsUUFBUTtBQUFBLFVBQ1IsWUFBWTtBQUFBLFlBQ1gsYUFBYTtBQUFBLFlBQ2IscUJBQXFCO0FBQUEsVUFDdEI7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLE9BQU87QUFDTix3QkFBZ0IsUUFBUTtBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUNBLGdCQUFZLElBQUksc0JBQXNCLEtBQUssVUFBVSxZQUFZLGlCQUFpQixDQUFDO0FBRW5GLFVBQU0scUJBQXFCLE1BQU07QUFDaEMsc0JBQWdCLE1BQU0sVUFBVTtBQUNoQyxzQkFBZ0IsUUFBUTtBQUFBLElBQ3pCO0FBQ0EsZ0JBQVksSUFBSSxzQkFBc0IsS0FBSyxVQUFVLGFBQWEsa0JBQWtCLENBQUM7QUFBQSxFQUN0RjtBQUNEO0FBblFNLDhCQUVXLEtBQUs7QUFGaEIsZ0NBQU47QUFBQSxFQU1HO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FURztBQTBRTixNQUFNLHVCQUF1QjtBQUFBLEVBQzVCLElBQUksOEJBQThCO0FBQUEsRUFDbEMsT0FBTyxTQUFTLFdBQVcsZ0JBQWdCO0FBQUEsRUFDM0MsUUFBUTtBQUFBLElBQ1AsV0FBVztBQUFBLEVBQ1o7QUFBQSxFQUNBLFVBQVUsSUFBSSxlQUFlLDZCQUE2QjtBQUMzRDtBQUVPLElBQU0sdUJBQU4sY0FBbUMsU0FBUztBQUFBLEVBVWxELFlBQ2tCLFVBQ0EsU0FDRixjQUN5QixzQkFDdkM7QUFDRCxVQUFNLFlBQVk7QUFMRDtBQUNBO0FBRXVCO0FBVnpDLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksa0JBQXdDLENBQUM7QUFHM0YsU0FBaUIscUJBQTJDLENBQUM7QUFXNUQsU0FBSyxjQUFjLElBQUksb0JBQW9CLGVBQWUsU0FBUyxXQUFXLFNBQVMsSUFBSSxDQUFDO0FBQzVGLFNBQUssVUFBVSxFQUFFLHNDQUFzQztBQUN2RCxTQUFLLE9BQU87QUFBQSxFQUNiO0FBQUEsRUFFQSxPQUFPLFFBQWlCLE9BQXNCO0FBQzdDLFNBQUssbUJBQW1CLFFBQVEsaUJBQWUsWUFBWSxPQUFPLFFBQVEsS0FBSyxDQUFDO0FBQUEsRUFDakY7QUFBQSxFQUVRLFNBQWU7QUFDdEIsVUFBTSxXQUFXLEtBQUssWUFBWTtBQUNsQyxRQUFJLFNBQVMsV0FBVyxHQUFHO0FBQzFCLGFBQU8sRUFBRSxjQUFjLEdBQUcsS0FBSyxPQUFPLEVBQUUsY0FBYyxTQUFTLGNBQWMsMEJBQTBCO0FBQ3ZHO0FBQUEsSUFDRDtBQUVBLFVBQU0sWUFBWSxLQUFLLFVBQVUsSUFBSSxVQUFrQixLQUFLLFNBQVM7QUFBQSxNQUNwRSxhQUFhLFlBQVk7QUFBQSxNQUN6QixvQkFBb0I7QUFBQSxJQUNyQixDQUFDLENBQUM7QUFDRixTQUFLLG1CQUFtQixLQUFLO0FBQUEsTUFDNUIsUUFBUSxDQUFDLFFBQWdCLFVBQWtCO0FBQzFDLGtCQUFVLEdBQUcsTUFBTSxTQUFTLEdBQUcsU0FBUyxFQUFFO0FBQzFDLGtCQUFVLE9BQU8sS0FBSztBQUFBLE1BQ3ZCO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSx3QkFBd0IsRUFBRSwwQkFBMEI7QUFDMUQsVUFBTSxPQUFPLEtBQUssVUFBVSxLQUFLLG1CQUFtQixxQkFBcUIsQ0FBQztBQUMxRSxTQUFLLE9BQU8sR0FBRyxLQUFLLFFBQVEsUUFBUTtBQUVwQyxVQUFNLHVCQUF1QixFQUFFLHlCQUF5QjtBQUN4RCxTQUFLLFVBQVUsS0FBSyxxQkFBcUIsT0FBSztBQUM3QyxZQUFNLFVBQVUsRUFBRSxTQUFTLENBQUM7QUFDNUIsVUFBSSxTQUFTO0FBQ1osYUFBSyxnQkFBZ0IsU0FBUyxvQkFBb0I7QUFBQSxNQUNuRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxRQUFRLEtBQUssVUFBVSxTQUFTLFVBQVUsT0FBSyxFQUFFLE9BQU8sS0FBSyxPQUFPLElBQUk7QUFDOUUsU0FBSyxhQUFhLENBQUMsVUFBVSxLQUFLLElBQUksS0FBSyxDQUFDO0FBRTVDLGNBQVUsUUFBUTtBQUFBLE1BQ2pCLGFBQWEsTUFBTTtBQUFBLE1BQ25CLFNBQVM7QUFBQSxNQUNULGFBQWE7QUFBQSxNQUNiLGFBQWEsT0FBTztBQUFBLE1BQ3BCLFFBQVEsQ0FBQyxPQUFPLEdBQUcsV0FBVztBQUM3Qiw4QkFBc0IsTUFBTSxRQUFRLEdBQUcsS0FBSztBQUM1QyxhQUFLLE9BQU8sUUFBUSxLQUFLO0FBQUEsTUFDMUI7QUFBQSxJQUNELEdBQUcsS0FBSyxRQUFXLElBQUk7QUFFdkIsY0FBVSxRQUFRO0FBQUEsTUFDakIsYUFBYSxNQUFNO0FBQUEsTUFDbkIsU0FBUztBQUFBLE1BQ1QsYUFBYTtBQUFBLE1BQ2IsYUFBYSxPQUFPO0FBQUEsTUFDcEIsUUFBUSxDQUFDLE9BQU8sR0FBRyxXQUFXO0FBQzdCLDZCQUFxQixNQUFNLFFBQVEsR0FBRyxLQUFLO0FBQzNDLGFBQUssdUJBQXVCLEVBQUUsUUFBUSxNQUFNO0FBQzVDLGFBQUssa0JBQWtCO0FBQUEsTUFDeEI7QUFBQSxJQUNELEdBQUcsT0FBTyxZQUFZLFFBQVcsSUFBSTtBQUVyQyxjQUFVLE1BQU07QUFBQSxNQUNmLGlCQUFpQixLQUFLLE1BQU0sU0FBUyxvQkFBb0I7QUFBQSxJQUMxRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsbUJBQW1CLFdBQW9FO0FBQzlGLFVBQU0sV0FBVyxLQUFLLHFCQUFxQixlQUFlLDhCQUE4QixLQUFLLFdBQVc7QUFDeEcsVUFBTSxXQUFXLElBQUksNkJBQTZCO0FBQ2xELFVBQU0sT0FBTyxLQUFLLHFCQUFxQixlQUFlLGVBQWUseUJBQXlCLE9BQU8sV0FBVyxFQUFFLHdCQUF3QixDQUFDLEdBQUcsVUFBVSxDQUFDLFFBQVEsR0FBRztBQUFBLE1BQ25LLDBCQUEwQjtBQUFBLE1BQzFCLGtCQUFrQjtBQUFBLE1BQ2xCLHFCQUFxQjtBQUFBLE1BQ3JCLHVCQUF1QjtBQUFBLFFBQ3RCLGFBQWEsa0JBQThEO0FBQzFFLGlCQUFPLGtCQUFrQixTQUFTO0FBQUEsUUFDbkM7QUFBQSxRQUNBLHFCQUE2QjtBQUM1QixpQkFBTyxTQUFTLDJCQUEyQixvQkFBb0I7QUFBQSxRQUNoRTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLG1CQUFtQjtBQUFBLElBQ3BCLENBQUM7QUFDRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsb0JBQTBCO0FBQ2pDLFNBQUssWUFBWSxPQUFPLE9BQU8sS0FBSyxzQkFBc0IsUUFBUSxLQUFLLHNCQUFzQixLQUFLO0FBQUEsRUFDbkc7QUFBQSxFQUVRLGdCQUFnQixTQUFzQyxXQUE4QjtBQUMzRixRQUFJLEtBQUssWUFBWSxPQUFPLFFBQVEsT0FBTyxRQUFRLElBQUk7QUFDdEQ7QUFBQSxJQUNEO0FBQ0EsY0FBVSxTQUFTO0FBQ25CLFNBQUssWUFBWSxRQUFRLEtBQUsscUJBQXFCLGVBQWUsc0JBQXNCLEtBQUssYUFBYSxLQUFLLFVBQVUsT0FBTztBQUNoSSxjQUFVLFlBQVksS0FBSyxZQUFZLE1BQU0sT0FBTztBQUNwRCxTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQUEsRUFFUSxjQUE2QztBQUNwRCxVQUFNLFdBQVcsU0FBUyxHQUErQixXQUFXLHlCQUF5QixFQUMzRixxQkFBcUIsRUFBRSxPQUFPLGFBQVc7QUFDekMsWUFBTUMsWUFBVyxLQUFLLFlBQVksT0FBTztBQUN6QyxZQUFNLGVBQWVBLFdBQVUsYUFBYSxLQUFLLFFBQVE7QUFDekQsTUFBQUEsV0FBVSxRQUFRO0FBQ2xCLGFBQU87QUFBQSxJQUNSLENBQUMsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsTUFBTSxjQUFjLEVBQUUsS0FBSyxDQUFDO0FBRWpELFVBQU0sV0FBVyxLQUFLLFlBQVksb0JBQW9CO0FBQ3RELFFBQUksVUFBVSxhQUFhLEtBQUssUUFBUSxHQUFHO0FBQzFDLGVBQVMsT0FBTyxHQUFHLEdBQUcsb0JBQW9CO0FBQUEsSUFDM0M7QUFDQSxjQUFVLFFBQVE7QUFDbEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLFlBQVksU0FBNkU7QUFDaEcsV0FBTyxRQUFRLFdBQVcsS0FBSyxxQkFBcUIsZUFBZSxRQUFRLFFBQVEsSUFBSTtBQUFBLEVBQ3hGO0FBRUQ7QUEvSWEsdUJBQU47QUFBQSxFQWFKO0FBQUEsRUFDQTtBQUFBLEdBZFU7QUF3SmIsTUFBTSw2QkFBMEY7QUFBQSxFQUMvRixZQUFZO0FBQUUsV0FBTztBQUFBLEVBQUk7QUFBQSxFQUN6QixnQkFBZ0I7QUFBRSxXQUFPO0FBQUEsRUFBOEI7QUFDeEQ7QUFFQSxJQUFNLCtCQUFOLE1BQTRIO0FBQUEsRUFJM0gsWUFDa0IsYUFDcUMsb0NBQ3JEO0FBRmdCO0FBQ3FDO0FBSnZELFNBQVMsYUFBYTtBQUFBLEVBS2xCO0FBQUEsRUFFSixlQUFlLFdBQTJEO0FBQ3pFLGNBQVUsVUFBVSxJQUFJLDZCQUE2QjtBQUNyRCxVQUFNLFFBQVEsT0FBTyxXQUFXLEVBQUUsMEJBQTBCLENBQUM7QUFDN0QsVUFBTSxrQkFBa0IsT0FBTyxXQUFXLEVBQUUsbUNBQW1DLENBQUM7QUFDaEYsb0JBQWdCLGNBQWMsU0FBUyxXQUFXLFdBQVc7QUFDN0QsVUFBTSxnQkFBZ0IsT0FBTyxXQUFXLEVBQUUsMkJBQTJCLENBQUM7QUFDdEUsV0FBTyxFQUFFLE9BQU8saUJBQWlCLGVBQWUsYUFBYSxJQUFJLGdCQUFnQixFQUFFO0FBQUEsRUFDcEY7QUFBQSxFQUVBLGNBQWMsU0FBc0MsT0FBZSxjQUFpRDtBQUNuSCxpQkFBYSxZQUFZLE1BQU07QUFDL0IsaUJBQWEsTUFBTSxjQUFjLFFBQVE7QUFDekMsaUJBQWEsZ0JBQWdCLE1BQU0sVUFBVSxRQUFRLE9BQU8scUJBQXFCLE1BQU0sS0FBSyxtQ0FBbUMsVUFBVSxLQUFLLGFBQWEsUUFBUSxFQUFFLElBQUksU0FBUztBQUVsTCxpQkFBYSxZQUFZLElBQUksS0FBSyxtQ0FBbUMsc0JBQXNCLENBQUMsRUFBRSxXQUFXLFdBQVcsUUFBUSxNQUFNO0FBQ2pJLFVBQUksb0JBQW9CLE9BQU8sV0FBVyxLQUFLLFdBQVcsS0FBSyxjQUFjLFFBQVEsSUFBSTtBQUN4RixxQkFBYSxnQkFBZ0IsTUFBTSxVQUFVLFVBQVUsU0FBUztBQUFBLE1BQ2pFO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLHlCQUF5QixhQUFhLGNBQWM7QUFDMUQsVUFBTSxlQUFlLE1BQU07QUFDMUIsWUFBTSxhQUFhLEtBQUssbUNBQW1DLGNBQWMsS0FBSyxhQUFhLFFBQVEsRUFBRTtBQUNyRyxVQUFJLFlBQVksU0FBUyxRQUFRO0FBQ2hDLHFCQUFhLGNBQWMsTUFBTSxVQUFVO0FBQzNDLHFCQUFhLGNBQWMsWUFBWSxHQUFHLHNCQUFzQixJQUFJLGFBQWEsVUFBVSxXQUFXLFFBQVEsT0FBTyxRQUFRLENBQUM7QUFBQSxNQUMvSCxPQUFPO0FBQ04scUJBQWEsY0FBYyxNQUFNLFVBQVU7QUFBQSxNQUM1QztBQUFBLElBQ0Q7QUFDQSxpQkFBYTtBQUNiLGlCQUFhLFlBQVksSUFBSSxLQUFLLG1DQUFtQyxzQkFBc0IsQ0FBQyxFQUFFLFdBQVcsVUFBVSxNQUFNO0FBQ3hILFVBQUksb0JBQW9CLE9BQU8sV0FBVyxLQUFLLFdBQVcsS0FBSyxjQUFjLFFBQVEsSUFBSTtBQUN4RixxQkFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLGVBQWUsU0FBc0MsT0FBZSxjQUF1RDtBQUMxSCxpQkFBYSxZQUFZLFFBQVE7QUFBQSxFQUNsQztBQUFBLEVBRUEsZ0JBQWdCLGNBQWlEO0FBQ2hFLGlCQUFhLFlBQVksUUFBUTtBQUFBLEVBQ2xDO0FBRUQ7QUF2RE0sK0JBQU47QUFBQSxFQU1HO0FBQUEsR0FORztBQXlETixJQUFNLHVCQUFOLGNBQW1DLFdBQVc7QUFBQSxFQUs3QyxZQUNrQixhQUNBLFVBQ1IsU0FDK0Isc0JBQ2Msb0NBQ3JCLGVBQ1UseUJBQzFDO0FBQ0QsVUFBTTtBQVJXO0FBQ0E7QUFDUjtBQUMrQjtBQUNjO0FBQ3JCO0FBQ1U7QUFUNUMsU0FBaUIscUJBQTJDLENBQUM7QUFhNUQsU0FBSyxVQUFVLEVBQUUsNEJBQTRCO0FBQzdDLFNBQUssT0FBTyxLQUFLLE9BQU87QUFBQSxFQUN6QjtBQUFBLEVBRVEsT0FBTyxTQUE0QjtBQUMxQyxVQUFNLFNBQVMsT0FBTyxTQUFTLEVBQUUsaUJBQWlCLENBQUM7QUFDbkQsVUFBTSxRQUFRLE9BQU8sUUFBUSxFQUFFLGdCQUFnQixDQUFDO0FBQ2hELFVBQU0sY0FBYyxLQUFLLFFBQVE7QUFFakMsUUFBSSxLQUFLLFFBQVEsT0FBTyxXQUFXO0FBQ2xDLFlBQU0sbUJBQW1CLE9BQU8sUUFBUSxFQUFFLGtCQUFrQixDQUFDO0FBQzdELFlBQU0sU0FBUyxJQUFJLE9BQU8sa0JBQWtCLG1CQUFtQjtBQUMvRCxXQUFLLGtCQUFrQixNQUFNO0FBQzdCLFdBQUssVUFBVSxLQUFLLG1DQUFtQyxzQkFBc0IsQ0FBQyxFQUFFLFdBQVcsVUFBVSxNQUFNO0FBQzFHLFlBQUksb0JBQW9CLE9BQU8sV0FBVyxLQUFLLFdBQVcsS0FBSyxjQUFjLEtBQUssUUFBUSxJQUFJO0FBQzdGLGVBQUssa0JBQWtCLE1BQU07QUFBQSxRQUM5QjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQ0YsV0FBSyxVQUFVLE9BQU8sV0FBVyxZQUFZO0FBQzVDLGNBQU0sVUFBVSxLQUFLLG1DQUFtQyxVQUFVLEtBQUssYUFBYSxLQUFLLFFBQVEsRUFBRTtBQUNuRyxjQUFNLHFCQUFxQixNQUFNLEtBQUssY0FBYyxRQUFRO0FBQUEsVUFDM0QsT0FBTyxTQUFTLDBCQUEwQix3QkFBd0IsS0FBSyxRQUFRLEtBQUs7QUFBQSxVQUNwRixTQUFTLFVBQ04sU0FBUyx3Q0FBd0MscUVBQXFFLEtBQUssU0FBUyxlQUFlLEtBQUssWUFBWSxPQUFPLEtBQUssUUFBUSxLQUFLLElBQzdMLFNBQVMsdUNBQXVDLG9FQUFvRSxLQUFLLFNBQVMsZUFBZSxLQUFLLFlBQVksT0FBTyxLQUFLLFFBQVEsS0FBSztBQUFBLFVBQzlMLFFBQVE7QUFBQSxVQUNSLGVBQWUsVUFBVSxTQUFTLFVBQVUsZUFBZSxJQUFJLFNBQVMsU0FBUyxjQUFjO0FBQUEsVUFDL0YsY0FBYyxTQUFTLFVBQVUsUUFBUTtBQUFBLFFBQzFDLENBQUM7QUFDRCxZQUFJLG1CQUFtQixXQUFXO0FBQ2pDLGVBQUssbUNBQW1DLGNBQWMsS0FBSyxhQUFhLEtBQUssUUFBUSxJQUFJLENBQUMsT0FBTztBQUFBLFFBQ2xHO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBRUEsVUFBTSxPQUFPLE9BQU8sU0FBUyxFQUFFLGVBQWUsQ0FBQztBQUUvQyxVQUFNLGNBQWMsRUFBRSx1QkFBdUI7QUFDN0MsVUFBTSxvQkFBb0IsS0FBSyxVQUFVLElBQUkscUJBQXFCLGFBQWEsQ0FBQyxDQUFDLENBQUM7QUFDbEYsV0FBTyxNQUFNLGtCQUFrQixXQUFXLENBQUM7QUFDM0MsU0FBSyxtQkFBbUIsS0FBSyxFQUFFLFFBQVEsTUFBTSxrQkFBa0IsWUFBWSxFQUFFLENBQUM7QUFDOUUsc0JBQWtCLFlBQVk7QUFFOUIsUUFBSSxLQUFLLFFBQVEsYUFBYTtBQUM3QixZQUFNLGNBQWMsT0FBTyxhQUFhLEVBQUUsc0JBQXNCLENBQUM7QUFDakUsa0JBQVksY0FBYyxLQUFLLFFBQVE7QUFBQSxJQUN4QztBQUVBLFVBQU0sYUFBYSxLQUFLLG1DQUFtQyxjQUFjLEtBQUssYUFBYSxLQUFLLFFBQVEsRUFBRTtBQUMxRyxRQUFJLFlBQVksU0FBUyxRQUFRO0FBQ2hDLGFBQU8sYUFBYTtBQUFBLFFBQUU7QUFBQSxRQUFtQjtBQUFBLFFBQ3hDLEVBQUUsT0FBTyxVQUFVLGNBQWMsV0FBVyxRQUFRLE9BQU8sYUFBYSxTQUFTLFFBQVEsWUFBWSxXQUFXLFFBQVEsT0FBTyxhQUFhLFNBQVMsVUFBVSxjQUFjLFFBQVEsQ0FBQyxJQUFJLE1BQVM7QUFBQSxRQUNuTSxFQUFFLFFBQVEsUUFBVyxXQUFXLFFBQVEsT0FBTyxPQUFPO0FBQUEsTUFBQyxDQUFDO0FBQUEsSUFDMUQ7QUFFQSxVQUFNLHdCQUF3QixPQUFPLGFBQWEsRUFBRSxrQkFBa0IsQ0FBQztBQUN2RSxRQUFJLEtBQUssUUFBUSxVQUFVO0FBQzFCLFlBQU0sV0FBVyxLQUFLLHFCQUFxQixlQUEwQyxLQUFLLFFBQVEsUUFBUTtBQUMxRyxVQUFJLFNBQVMsU0FBUyxTQUFTO0FBQzlCLGFBQUssZ0JBQWdCLHVCQUF1RCxRQUFRO0FBQUEsTUFDckYsV0FBVyxTQUFTLFNBQVMsWUFBWTtBQUN4QyxhQUFLLG1CQUFtQix1QkFBMEQsUUFBUTtBQUFBLE1BQzNGLFdBQVcsU0FBUyxTQUFTLGtCQUFrQjtBQUM5QyxhQUFLLDJCQUEyQix1QkFBa0UsUUFBUTtBQUFBLE1BQzNHLFdBQVcsU0FBUyxTQUFTLFdBQVc7QUFDdkMsYUFBSyxrQkFBa0IsdUJBQXlELFFBQVE7QUFBQSxNQUN6RjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsUUFBc0I7QUFDL0MsV0FBTyxRQUFRLEtBQUssbUNBQW1DLFVBQVUsS0FBSyxhQUFhLEtBQUssUUFBUSxFQUFFLElBQUksU0FBUyxVQUFVLGVBQWUsSUFBSSxTQUFTLFVBQVUsY0FBYztBQUFBLEVBQzlLO0FBQUEsRUFFUSxnQkFBZ0IsV0FBd0IsVUFBZ0Q7QUFDL0YsVUFBTSxZQUFZLEtBQUssVUFBVSxTQUFTLE9BQU8sS0FBSyxRQUFRLENBQUM7QUFDL0QsVUFBTSxrQkFBa0IsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFDOUQsUUFBSSxVQUFVLGFBQWE7QUFDMUIsV0FBSyxVQUFVLFVBQVUsWUFBWSxVQUFRO0FBQzVDLGtCQUFVLFNBQVM7QUFDbkIsd0JBQWdCLFFBQVEsS0FBSyxZQUFZLE1BQU0sU0FBUztBQUFBLE1BQ3pELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFDQSxvQkFBZ0IsUUFBUSxLQUFLLFlBQVksVUFBVSxNQUFNLFNBQVM7QUFBQSxFQUNuRTtBQUFBLEVBRVEsWUFBWSxXQUF1QixXQUFxQztBQUMvRSxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEM7QUFBQSxNQUFPO0FBQUEsTUFDTjtBQUFBLFFBQUU7QUFBQSxRQUFTO0FBQUEsUUFDVjtBQUFBLFVBQUU7QUFBQSxVQUFNO0FBQUEsVUFDUCxHQUFHLFVBQVUsUUFBUSxJQUFJLFlBQVUsRUFBRSxNQUFNLFFBQVcsTUFBTSxDQUFDO0FBQUEsUUFDOUQ7QUFBQSxRQUNBLEdBQUcsVUFBVSxLQUNYLElBQUksU0FBTztBQUNYLGlCQUFPO0FBQUEsWUFBRTtBQUFBLFlBQU07QUFBQSxZQUNkLEdBQUcsSUFBSSxJQUFJLGFBQVc7QUFDckIsa0JBQUksT0FBTyxZQUFZLFVBQVU7QUFDaEMsdUJBQU8sRUFBRSxNQUFNLFFBQVcsRUFBRSxLQUFLLFFBQVcsT0FBTyxDQUFDO0FBQUEsY0FDckQ7QUFDQSxvQkFBTSxPQUFPLE1BQU0sUUFBUSxPQUFPLElBQUksVUFBVSxDQUFDLE9BQU87QUFDeEQscUJBQU8sRUFBRSxNQUFNLFFBQVcsR0FBRyxLQUFLLElBQUksVUFBUTtBQUM3QyxzQkFBTSxTQUFpQixDQUFDO0FBQ3hCLG9CQUFJLGlCQUFpQixPQUFPLEdBQUc7QUFDOUIsd0JBQU0sVUFBVSxFQUFFLElBQUksTUFBUztBQUMvQix1QkFBSyxlQUFlLFNBQVMsT0FBTztBQUNwQyx5QkFBTyxLQUFLLE9BQU87QUFBQSxnQkFDcEIsV0FBVyxnQkFBZ0Isb0JBQW9CO0FBQzlDLHdCQUFNLFVBQVUsRUFBRSxFQUFFO0FBQ3BCLHdCQUFNLE1BQU0sWUFBWSxJQUFJLElBQUksZ0JBQWdCLFNBQVMsSUFBSSw0QkFBNEIsQ0FBQztBQUMxRixzQkFBSSxJQUFJLElBQUk7QUFDWix5QkFBTyxLQUFLLE9BQU87QUFBQSxnQkFDcEIsV0FBVyxnQkFBZ0IsT0FBTztBQUNqQyx5QkFBTyxLQUFLLEVBQUUsUUFBUSxFQUFFLE9BQU8sWUFBWSxPQUFPLHVCQUF1QixNQUFNLE9BQU8sSUFBSSxPQUFPLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQztBQUM3Ryx5QkFBTyxLQUFLLEVBQUUsUUFBUSxRQUFXLE1BQU0sT0FBTyxJQUFJLFVBQVUsSUFBSSxDQUFDLENBQUM7QUFBQSxnQkFDbkU7QUFDQSx1QkFBTztBQUFBLGNBQ1IsQ0FBQyxFQUFFLEtBQUssQ0FBQztBQUFBLFlBQ1YsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNELENBQUM7QUFBQSxNQUFDO0FBQUEsSUFBQztBQUNOLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSwyQkFBMkIsV0FBd0IsVUFBMkQ7QUFDckgsVUFBTSx1QkFBdUIsS0FBSyxVQUFVLFNBQVMsT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUMxRSxRQUFJLHFCQUFxQixhQUFhO0FBQ3JDLFdBQUssVUFBVSxxQkFBcUIsWUFBWSxVQUFRO0FBQ3ZELGtCQUFVLFNBQVM7QUFDbkIsYUFBSyx1QkFBdUIsTUFBTSxTQUFTO0FBQUEsTUFDNUMsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUNBLFNBQUssdUJBQXVCLHFCQUFxQixNQUFNLFNBQVM7QUFBQSxFQUNqRTtBQUFBLEVBRVEsbUJBQW1CLFdBQXdCLFVBQW1EO0FBQ3JHLGNBQVUsVUFBVSxJQUFJLFVBQVU7QUFDbEMsVUFBTSxlQUFlLEtBQUssVUFBVSxTQUFTLE9BQU8sS0FBSyxRQUFRLENBQUM7QUFDbEUsUUFBSSxhQUFhLGFBQWE7QUFDN0IsV0FBSyxVQUFVLGFBQWEsWUFBWSxVQUFRO0FBQy9DLGtCQUFVLFNBQVM7QUFDbkIsYUFBSyxlQUFlLE1BQU0sU0FBUztBQUFBLE1BQ3BDLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFDQSxTQUFLLGVBQWUsYUFBYSxNQUFNLFNBQVM7QUFBQSxFQUNqRDtBQUFBLEVBRVEsZUFBZSxVQUEyQixXQUE4QjtBQUMvRSxVQUFNLEVBQUUsUUFBUSxJQUFJLEtBQUssVUFBVSxLQUFLLHdCQUF3QixPQUFPO0FBQUEsTUFDdEUsT0FBTyxTQUFTO0FBQUEsTUFDaEIsV0FBVyxTQUFTO0FBQUEsTUFDcEIsbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQyxDQUFDO0FBQ0YsV0FBTyxXQUFXLE9BQU87QUFBQSxFQUMxQjtBQUFBLEVBRVEsdUJBQXVCLE1BQTJDLFdBQThCO0FBQ3ZHLGVBQVcsbUJBQW1CLE1BQU07QUFDbkMsVUFBSSxpQkFBaUIsZUFBZSxHQUFHO0FBQ3RDLGNBQU0sVUFBVSxFQUFFLElBQUksTUFBUztBQUMvQixhQUFLLGVBQWUsaUJBQWlCLE9BQU87QUFDNUMsZUFBTyxXQUFXLE9BQU87QUFBQSxNQUMxQixPQUFPO0FBQ04sY0FBTSxlQUFlLE9BQU8sV0FBVyxFQUFFLE9BQU8sQ0FBQztBQUNqRCxhQUFLLFlBQVksaUJBQWlCLFlBQVk7QUFBQSxNQUMvQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsV0FBd0IsVUFBa0Q7QUFDbkcsVUFBTSxjQUFjLEtBQUssVUFBVSxTQUFTLE9BQU8sS0FBSyxRQUFRLENBQUM7QUFDakUsUUFBSSxZQUFZLGFBQWE7QUFDNUIsV0FBSyxVQUFVLFlBQVksWUFBWSxVQUFRO0FBQzlDLGtCQUFVLFNBQVM7QUFDbkIsa0JBQVUsWUFBWSxJQUFJO0FBQUEsTUFDM0IsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUNBLGNBQVUsWUFBWSxZQUFZLElBQUk7QUFBQSxFQUN2QztBQUFBLEVBRUEsT0FBTyxRQUFpQixPQUFzQjtBQUM3QyxTQUFLLG1CQUFtQixRQUFRLE9BQUssRUFBRSxPQUFPLFFBQVEsS0FBSyxDQUFDO0FBQUEsRUFDN0Q7QUFFRDtBQXhNTSx1QkFBTjtBQUFBLEVBU0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVpHOyIsCiAgIm5hbWVzIjogWyJzdGF0dXMiLCAicmVuZGVyZXIiXQp9Cg==
