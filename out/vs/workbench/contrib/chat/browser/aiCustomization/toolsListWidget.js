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
import * as DOM from "../../../../../base/browser/dom.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { HighlightedLabel } from "../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Checkbox, TriStateCheckbox } from "../../../../../base/browser/ui/toggle/toggle.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { Action } from "../../../../../base/common/actions.js";
import { Delayer } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { matchesContiguousSubString } from "../../../../../base/common/filters.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, derived, observableSignalFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { IContextMenuService, IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { IExtensionManifestPropertiesService } from "../../../../services/extensions/common/extensionManifestPropertiesService.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { ExtensionState, IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { GalleryItemInstallState, GalleryItemRenderer } from "./galleryItemRenderer.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../common/tools/languageModelToolsService.js";
import { countEnabledCustomizationTools, getToolSetTriState, IAgentHostToolSetEnablementService, isToolEnabledInSet } from "../agentSessions/agentHost/agentHostToolSetEnablementService.js";
import "./media/aiCustomizationManagement.css";
const $ = DOM.$;
const TOOLS_MARKETPLACE_QUERY = "language model tools";
const TOOLS_GALLERY_ITEM_HEIGHT = 62;
const TOOLS_GALLERY_ITEM_TEMPLATE_ID = "toolsGalleryItem";
class ToolsGalleryItemDelegate {
  getHeight() {
    return TOOLS_GALLERY_ITEM_HEIGHT;
  }
  getTemplateId() {
    return TOOLS_GALLERY_ITEM_TEMPLATE_ID;
  }
}
class ToolsGalleryItemProvider {
  constructor(_extensionsWorkbenchService) {
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
  }
  getLabel(extension) {
    return extension.displayName;
  }
  getPublisherDisplayName(extension) {
    return extension.publisherDisplayName;
  }
  getDescription(extension) {
    return extension.description;
  }
  getInstallState(extension) {
    switch (extension.state) {
      case ExtensionState.Installed:
        return GalleryItemInstallState.Installed;
      case ExtensionState.Installing:
        return GalleryItemInstallState.Installing;
      default:
        return GalleryItemInstallState.Uninstalled;
    }
  }
  async install(extension) {
    await this._extensionsWorkbenchService.install(extension);
  }
  onDidChangeInstallState(extension, listener) {
    return this._extensionsWorkbenchService.onChange((changed) => {
      if (!changed || changed.identifier.id === extension.identifier.id) {
        listener();
      }
    });
  }
}
let ToolsListWidget = class extends Disposable {
  constructor(_sessionType, _toolsService, _enablementService, _contextViewService, _contextMenuService, _dialogService, _openerService, _instantiationService, _extensionsWorkbenchService, _extensionManifestPropertiesService, _environmentService) {
    super();
    this._sessionType = _sessionType;
    this._toolsService = _toolsService;
    this._enablementService = _enablementService;
    this._contextViewService = _contextViewService;
    this._contextMenuService = _contextMenuService;
    this._dialogService = _dialogService;
    this._openerService = _openerService;
    this._instantiationService = _instantiationService;
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
    this._extensionManifestPropertiesService = _extensionManifestPropertiesService;
    this._environmentService = _environmentService;
    this._onDidChangeItemCount = this._register(new Emitter());
    this.onDidChangeItemCount = this._onDidChangeItemCount.event;
    this._onDidSelectExtension = this._register(new Emitter());
    this.onDidSelectExtension = this._onDidSelectExtension.event;
    this._rowStore = this._register(new DisposableStore());
    this._searchQuery = observableValue("toolsSearchQuery", "");
    this._expanded = observableValue("toolsExpanded", /* @__PURE__ */ new Set());
    this._delayedSearch = this._register(new Delayer(200));
    this._lastCount = -1;
    this._browseMode = false;
    this._lastHeight = 0;
    this._lastWidth = 0;
    this._rows = [];
    this._rowByElement = /* @__PURE__ */ new Map();
    this._staticReadOnlySets = this._createStaticReadOnlySets();
    this.element = $(".tools-list-widget");
    this._createHeader();
    this._createSearchRow();
    this._treeContainer = $(".tools-list-tree");
    this._treeContainer.setAttribute("role", "tree");
    this._treeContainer.setAttribute("aria-label", localize("toolsTreeAria", "Tool groups"));
    this._register(DOM.addStandardDisposableListener(this._treeContainer, DOM.EventType.KEY_DOWN, (e) => this._onTreeKeyDown(e)));
    this._register(DOM.addDisposableListener(this._treeContainer, DOM.EventType.FOCUS_IN, (e) => {
      const row = this._rowFromTarget(e.target);
      if (row) {
        this._setRovingRow(row);
      }
    }));
    this._treeScrollable = this._register(new DomScrollableElement(this._treeContainer, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto,
      useShadows: false
    }));
    const treeScrollableNode = this._treeScrollable.getDomNode();
    treeScrollableNode.classList.add("tools-list-tree-scrollable");
    this.element.appendChild(treeScrollableNode);
    this._createGallery();
    this._register(toDisposable(() => this._galleryCts?.dispose(true)));
    const viewModel = this._createViewModel();
    this._register(autorun((reader) => {
      this._render(viewModel.read(reader));
    }));
    this._register(autorun((reader) => {
      const count = countEnabledCustomizationTools(this._toolsService.toolSets.read(reader), this._readState(reader), reader);
      if (count !== this._lastCount) {
        this._lastCount = count;
        this._onDidChangeItemCount.fire(count);
      }
    }));
  }
  _createHeader() {
    this._header = DOM.append(this.element, $(".section-title-header"));
    DOM.append(DOM.append(this._header, $(".section-title-row")), $("h2.section-title")).textContent = localize("toolsListTitle", "Tools");
    const description = DOM.append(this._header, $("p.section-title-description"));
    DOM.append(description, $("span.section-title-description-text")).textContent = localize("toolsListSubtitle", "Enable or disable the tools available to chat. Disabled tools are not advertised to the agent. Tools other than Copilot's built-in tools run on the client and require it to be connected.");
    description.appendChild(document.createTextNode(" "));
    const learnMore = DOM.append(description, $("a.section-title-link"));
    learnMore.textContent = localize("learnMoreTools", "Learn more about tools");
    learnMore.href = "https://code.visualstudio.com/docs/agent-customization/tools?referrer=in-product";
    this._register(DOM.addDisposableListener(learnMore, "click", (e) => {
      e.preventDefault();
      void this._openerService.open(URI.parse(learnMore.href));
    }));
  }
  _createSearchRow() {
    this._searchRow = DOM.append(this.element, $(".tools-list-search-and-button-container"));
    const searchContainer = DOM.append(this._searchRow, $(".tools-list-search-container"));
    this._searchInput = this._register(new InputBox(searchContainer, this._contextViewService, {
      placeholder: localize("searchPlaceholder", "Type to search..."),
      inputBoxStyles: defaultInputBoxStyles,
      ariaLabel: localize("toolsSearchAria", "Search tools")
    }));
    this._register(this._searchInput.onDidChange(() => {
      this._delayedSearch.trigger(() => {
        if (this._browseMode) {
          void this._queryGallery();
        } else {
          this._searchQuery.set(this._searchInput.value, void 0);
        }
      }).catch(() => {
      });
    }));
    if (!this._environmentService.isSessionsWindow) {
      const browseLabel = localize("toolsBrowseMarketplace", "Browse Marketplace");
      this._browseButtonContainer = DOM.append(this._searchRow, $(".tools-list-browse-button-container"));
      const browseButton = this._register(new Button(this._browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: browseLabel, ariaLabel: browseLabel }));
      browseButton.label = `$(${Codicon.library.id}) ${browseLabel}`;
      this._register(browseButton.onDidClick(() => this._setBrowseMode(true)));
    }
    const backLabel = localize("toolsBrowseBack", "Back");
    this._backButtonContainer = DOM.append(this._searchRow, $(".tools-list-browse-button-container"));
    this._backButtonContainer.style.display = "none";
    const backButton = this._register(new Button(this._backButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: backLabel, ariaLabel: backLabel }));
    backButton.label = `$(${Codicon.arrowLeft.id}) ${backLabel}`;
    this._register(backButton.onDidClick(() => this._setBrowseMode(false)));
  }
  _createGallery() {
    this._galleryContainer = DOM.append(this.element, $(".tools-gallery-container"));
    this._galleryContainer.style.display = "none";
    this._galleryEmpty = DOM.append(this._galleryContainer, $(".list-empty-state"));
    this._galleryEmpty.style.display = "none";
    this._galleryListContainer = DOM.append(this._galleryContainer, $(".tools-gallery-list"));
    this._galleryList = this._register(this._instantiationService.createInstance(
      WorkbenchList,
      "ToolsMarketplaceList",
      this._galleryListContainer,
      new ToolsGalleryItemDelegate(),
      [new GalleryItemRenderer(TOOLS_GALLERY_ITEM_TEMPLATE_ID, new ToolsGalleryItemProvider(this._extensionsWorkbenchService))],
      {
        multipleSelectionSupport: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel: (extension) => extension.displayName,
          getWidgetAriaLabel: () => localize("toolsMarketplaceAria", "Tool extensions")
        },
        identityProvider: { getId: (extension) => extension.identifier.id }
      }
    ));
    this._register(this._galleryList.onDidOpen((e) => {
      if (e.element) {
        this._onDidSelectExtension.fire(e.element);
      }
    }));
    this._register(this._galleryList.onContextMenu((e) => this._onGalleryContextMenu(e)));
  }
  _readState(reader) {
    return this._enablementService.observe(this._sessionType).read(reader);
  }
  _createStaticReadOnlySets() {
    const tools = COPILOT_CLI_TOOLS.map((t) => ({
      id: `copilot-cli:${t.name}`,
      displayName: t.name,
      modelDescription: t.description,
      source: ToolDataSource.Internal,
      canBeReferencedInPrompt: false
    }));
    const copilotCliSet = {
      id: "copilot-cli",
      referenceName: "copilotCli",
      icon: Codicon.copilot,
      source: ToolDataSource.Internal,
      description: localize("clientToolSet.copilotCli.description", "Copilot"),
      detail: localize("clientToolSet.copilotCli.detail", "Built-in tools the Copilot agent runs inside its own runtime."),
      getTools: () => tools
    };
    return [copilotCliSet];
  }
  _createViewModel() {
    const extensionsChanged = observableSignalFromEvent(this, this._extensionsWorkbenchService.onChange);
    return derived((reader) => {
      extensionsChanged.read(reader);
      const query = this._searchQuery.read(reader).trim();
      const result = [];
      for (const ts of [...this._toolsService.toolSets.read(reader), ...this._staticReadOnlySets]) {
        const vm = this._toViewModel(reader, ts, query);
        if (vm) {
          result.push(vm);
        }
      }
      result.sort((a, b) => sortKey(a.toolSet).localeCompare(sortKey(b.toolSet)));
      return result;
    });
  }
  _toViewModel(reader, ts, query) {
    if (ts.deprecated) {
      return void 0;
    }
    if (ts.source.type === "extension") {
      const extensionId = ts.source.extensionId;
      const installed = this._extensionsWorkbenchService.local.find((e) => ExtensionIdentifier.equals(e.identifier.id, extensionId));
      if (!installed || installed.state === ExtensionState.Uninstalling || installed.state === ExtensionState.Uninstalled) {
        return void 0;
      }
    }
    const memberTools = Array.from(ts.getTools(reader));
    if (memberTools.length === 0) {
      return void 0;
    }
    const allToolIds = memberTools.map((t) => t.id);
    let visibleTools = memberTools.map((tool) => ({ tool }));
    let nameMatches;
    if (query) {
      nameMatches = matchesContiguousSubString(query, ts.description ?? ts.referenceName) ?? void 0;
      if (nameMatches) {
        visibleTools = memberTools.map((tool) => ({ tool, nameMatches: matchesContiguousSubString(query, tool.displayName ?? tool.id) ?? void 0 }));
      } else {
        visibleTools = [];
        for (const tool of memberTools) {
          const toolMatches = matchesContiguousSubString(query, tool.displayName ?? tool.id);
          if (toolMatches) {
            visibleTools.push({ tool, nameMatches: toolMatches });
          }
        }
        if (visibleTools.length === 0) {
          return void 0;
        }
      }
    }
    return {
      toolSet: ts,
      allToolIds,
      visibleTools,
      nameMatches,
      forceExpanded: query !== "",
      readOnly: ts.id === "copilot-cli"
    };
  }
  layout(height, width) {
    this._lastHeight = height;
    this._lastWidth = width;
    this._searchInput.layout();
    this._treeScrollable.scanDomNode();
    const galleryOffset = this._galleryContainer.getBoundingClientRect().top - this.element.getBoundingClientRect().top;
    this._galleryList.layout(Math.max(0, height - galleryOffset), width);
  }
  /** Enters/leaves marketplace browse mode, swapping the tree for the gallery list. */
  _setBrowseMode(browse) {
    if (browse && this._environmentService.isSessionsWindow) {
      return;
    }
    if (this._browseMode === browse) {
      return;
    }
    this._browseMode = browse;
    this._treeScrollable.getDomNode().style.display = browse ? "none" : "";
    this._galleryContainer.style.display = browse ? "" : "none";
    if (this._browseButtonContainer) {
      this._browseButtonContainer.style.display = browse ? "none" : "";
    }
    this._backButtonContainer.style.display = browse ? "" : "none";
    this._searchInput.setPlaceHolder(browse ? localize("toolsBrowsePlaceholder", "Search the Marketplace...") : localize("searchPlaceholder", "Type to search..."));
    this._searchInput.value = "";
    if (browse) {
      void this._queryGallery();
    } else {
      this._galleryCts?.dispose(true);
      this._galleryCts = void 0;
      this._galleryList.splice(0, this._galleryList.length, []);
      this._searchQuery.set("", void 0);
    }
    this._searchInput.focus();
    if (this._lastHeight > 0) {
      this.layout(this._lastHeight, this._lastWidth);
    }
  }
  /** Queries the Extensions gallery for tool-contributing extensions. */
  async _queryGallery() {
    this._galleryCts?.dispose(true);
    const cts = this._galleryCts = new CancellationTokenSource();
    const userText = this._searchInput.value.trim();
    const text = userText ? `${TOOLS_MARKETPLACE_QUERY} ${userText}` : TOOLS_MARKETPLACE_QUERY;
    this._setGalleryMessage(localize("toolsBrowseLoading", "Loading marketplace..."));
    try {
      const pager = await this._extensionsWorkbenchService.queryGallery({ text }, cts.token);
      if (cts.token.isCancellationRequested) {
        return;
      }
      const items = pager.firstPage;
      const filteredItems = await this._filterGalleryResults(items, cts.token);
      if (cts.token.isCancellationRequested) {
        return;
      }
      if (filteredItems.length === 0) {
        this._setGalleryMessage(
          localize("toolsBrowseNoResults", "No tool extensions match '{0}'", userText || TOOLS_MARKETPLACE_QUERY),
          localize("tryDifferentSearch", "Try a different search term")
        );
        return;
      }
      this._galleryEmpty.style.display = "none";
      this._galleryListContainer.style.display = "";
      this._galleryList.splice(0, this._galleryList.length, filteredItems);
    } catch {
      if (!cts.token.isCancellationRequested) {
        this._setGalleryMessage(
          localize("toolsBrowseError", "Unable to load marketplace"),
          localize("toolsBrowseTryAgain", "Check your connection and try again")
        );
      }
    }
  }
  /**
   * Keeps only extensions that contribute language model tools and, in the Agents window, can run there
   * ({@link IExtensionManifestPropertiesService.canExecuteOnSessionsWindow}); the `executesCode` hint skips
   * manifest fetches for extensions that can never run.
   */
  async _filterGalleryResults(extensions, token) {
    const requireAgentsWindowSupport = this._environmentService.isSessionsWindow;
    const results = await Promise.all(extensions.map(async (extension) => {
      if (requireAgentsWindowSupport && extension.gallery?.properties.executesCode) {
        return void 0;
      }
      try {
        const manifest = await extension.getManifest(token);
        if (!manifest?.contributes?.languageModelTools?.length) {
          return void 0;
        }
        if (requireAgentsWindowSupport && !this._extensionManifestPropertiesService.canExecuteOnSessionsWindow(manifest)) {
          return void 0;
        }
        return extension;
      } catch {
        return void 0;
      }
    }));
    return results.filter((extension) => !!extension);
  }
  _setGalleryMessage(text, subtext) {
    this._galleryList.splice(0, this._galleryList.length, []);
    this._galleryListContainer.style.display = "none";
    DOM.clearNode(this._galleryEmpty);
    this._galleryEmpty.style.display = "flex";
    const header = DOM.append(this._galleryEmpty, $(".empty-state-header"));
    DOM.append(header, $(".empty-state-text")).textContent = text;
    if (subtext) {
      DOM.append(this._galleryEmpty, $(".empty-state-subtext")).textContent = subtext;
    }
  }
  /** Move keyboard focus to the search box. */
  focusSearch() {
    this._searchInput.focus();
    this._searchInput.select();
  }
  /** Re-emit the current item count. Called once at startup to seed the section badge. */
  fireItemCount() {
    this._onDidChangeItemCount.fire(this._lastCount === -1 ? 0 : this._lastCount);
  }
  _render(model) {
    const hadFocus = DOM.isAncestor(this._treeContainer.ownerDocument.activeElement, this._treeContainer);
    this._rowStore.clear();
    this._rows = [];
    this._rowByElement.clear();
    DOM.clearNode(this._treeContainer);
    if (model.length === 0) {
      const emptyState = DOM.append(this._treeContainer, $(".list-empty-state"));
      const header = DOM.append(emptyState, $(".empty-state-header"));
      const text = DOM.append(header, $(".empty-state-text"));
      const subtext = DOM.append(emptyState, $(".empty-state-subtext"));
      const query = this._searchQuery.get().trim();
      if (query) {
        text.textContent = localize("noMatchingTools", "No tools match '{0}'", query);
        subtext.textContent = localize("tryDifferentSearch", "Try a different search term");
      } else {
        text.textContent = localize("toolsNoMatches", "No tools available.");
      }
      this._treeScrollable.scanDomNode();
      return;
    }
    for (const vm of model) {
      const setRow = this._renderToolSet(vm);
      this._addRow(setRow);
      for (const child of setRow.children) {
        this._addRow(child);
      }
    }
    this._initRovingTabIndex(hadFocus);
    this._treeScrollable.scanDomNode();
  }
  _addRow(row) {
    this._rows.push(row);
    this._rowByElement.set(row.element, row);
  }
  _renderToolSet(vm) {
    const ts = vm.toolSet;
    const row = DOM.append(this._treeContainer, $(".tools-list-setrow"));
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", "1");
    row.tabIndex = -1;
    const setName = ts.description ?? ts.referenceName;
    const toggleExpand = () => this._toggleCollapsed(ts.id);
    const checkbox = this._rowStore.add(new TriStateCheckbox(
      localize("toolsSetCheckbox", "Enable {0}", setName),
      getToolSetTriState(this._currentState(), ts.id, vm.allToolIds),
      defaultCheckboxStyles
    ));
    checkbox.domNode.tabIndex = -1;
    row.appendChild(checkbox.domNode);
    if (vm.readOnly) {
      checkbox.disable();
      checkbox.setTitle(localize("toolsSetReadOnly", "These are the agent's built-in tools and cannot be changed."));
    } else {
      this._rowStore.add(checkbox.onChange(() => {
        const enabled = checkbox.checked === true;
        this._enablementService.setToolSetEnabled(this._sessionType, ts.id, vm.allToolIds, enabled);
      }));
    }
    const main = DOM.append(row, $(".tools-list-row-main"));
    const text = DOM.append(main, $(".tools-list-row-text"));
    const label = DOM.append(text, $("span.tools-list-row-label"));
    const labelHighlight = this._rowStore.add(new HighlightedLabel(label));
    labelHighlight.set(setName, vm.nameMatches);
    const detail = this._resolveSetDetail(ts);
    if (detail) {
      DOM.append(text, $("span.tools-list-row-subtext")).textContent = detail;
    }
    const count = DOM.append(row, $("span.tools-list-row-count"));
    const chevron = DOM.append(row, $("a.tools-list-chevron.codicon"));
    chevron.setAttribute("aria-hidden", "true");
    this._rowStore.add(DOM.addDisposableListener(row, "click", (e) => {
      if (checkbox.domNode.contains(e.target)) {
        return;
      }
      row.focus();
      toggleExpand();
    }));
    this._rowStore.add(DOM.addDisposableListener(row, "contextmenu", (e) => {
      const extension = this._resolveExtensionForToolSet(ts);
      if (!extension) {
        return;
      }
      DOM.EventHelper.stop(e, true);
      const anchor = e.button === 2 ? new StandardMouseEvent(DOM.getWindow(row), e) : row;
      this._showExtensionContextMenu(anchor, extension);
    }));
    const group = DOM.append(this._treeContainer, $(".tools-list-children"));
    group.id = `tools-group-${ts.id}`;
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", setName);
    row.setAttribute("aria-owns", group.id);
    const setRow = {
      kind: "set",
      rowId: `set:${ts.id}`,
      toolSetId: ts.id,
      element: row,
      toggleNode: checkbox.domNode,
      group,
      children: []
    };
    for (const tool of vm.visibleTools) {
      setRow.children.push(this._renderTool(group, setRow, vm, tool));
    }
    this._rowStore.add(autorun((reader) => {
      const state = this._readState(reader);
      const triState = getToolSetTriState(state, ts.id, vm.allToolIds);
      checkbox.checked = triState;
      this._updateRowAriaChecked(row, triState);
      const enabledCount = vm.allToolIds.reduce((n, id) => n + (isToolEnabledInSet(state, ts.id, id) ? 1 : 0), 0);
      count.textContent = `${enabledCount}/${vm.allToolIds.length}`;
      count.setAttribute("aria-label", localize("toolsRowEnabledOfTotal", "{0} of {1} tools enabled", enabledCount, vm.allToolIds.length));
    }));
    this._rowStore.add(autorun((reader) => {
      const expanded = vm.forceExpanded || this._expanded.read(reader).has(ts.id);
      group.style.display = expanded ? "" : "none";
      chevron.classList.toggle("codicon-chevron-down", expanded);
      chevron.classList.toggle("codicon-chevron-right", !expanded);
      row.setAttribute("aria-expanded", String(expanded));
      this._treeScrollable.scanDomNode();
    }));
    return setRow;
  }
  _renderTool(group, parent, vm, toolVm) {
    const tool = toolVm.tool;
    const enabled = isToolEnabledInSet(this._currentState(), vm.toolSet.id, tool.id);
    const toolName = tool.displayName ?? tool.id;
    const row = DOM.append(group, $(".tools-list-toolrow"));
    row.classList.toggle("readonly", vm.readOnly);
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", "2");
    row.tabIndex = -1;
    const checkbox = this._rowStore.add(new Checkbox(
      localize("toolsToolCheckbox", "Enable {0}", toolName),
      enabled,
      defaultCheckboxStyles
    ));
    checkbox.domNode.tabIndex = -1;
    row.appendChild(checkbox.domNode);
    this._updateRowAriaChecked(row, enabled);
    if (vm.readOnly) {
      checkbox.disable();
      checkbox.setTitle(localize("toolsSetReadOnly", "These are the agent's built-in tools and cannot be changed."));
    } else {
      this._rowStore.add(checkbox.onChange(() => {
        this._enablementService.setToolEnabled(this._sessionType, vm.toolSet.id, tool.id, checkbox.checked);
      }));
      this._rowStore.add(DOM.addDisposableListener(row, "click", (e) => {
        if (checkbox.domNode.contains(e.target)) {
          return;
        }
        row.focus();
        this._enablementService.setToolEnabled(this._sessionType, vm.toolSet.id, tool.id, !checkbox.checked);
      }));
      this._rowStore.add(autorun((reader) => {
        const toolEnabled = isToolEnabledInSet(this._readState(reader), vm.toolSet.id, tool.id);
        checkbox.checked = toolEnabled;
        this._updateRowAriaChecked(row, toolEnabled);
      }));
    }
    const text = DOM.append(row, $(".tools-list-row-text"));
    const label = DOM.append(text, $("span.tools-list-row-label"));
    const labelHighlight = this._rowStore.add(new HighlightedLabel(label));
    labelHighlight.set(toolName, toolVm.nameMatches);
    const description = tool.userDescription ?? tool.modelDescription;
    if (description) {
      const subtext = DOM.append(text, $("span.tools-list-row-subtext"));
      subtext.textContent = description;
    }
    return {
      kind: "tool",
      rowId: `tool:${vm.toolSet.id}:${tool.id}`,
      toolSetId: vm.toolSet.id,
      element: row,
      toggleNode: checkbox.domNode,
      parent
    };
  }
  /**
   * Subtitle for a tool-set row: the set's own `detail`, or for extension sets the extension's
   * description (falling back to a generic "contributed by" label).
   */
  _resolveSetDetail(ts) {
    if (ts.detail) {
      return ts.detail;
    }
    if (ts.source.type !== "extension") {
      return void 0;
    }
    const source = ts.source;
    const extension = this._extensionsWorkbenchService.local.find((e) => ExtensionIdentifier.equals(e.identifier.id, source.extensionId));
    return extension?.description || localize("toolsSetExtensionDetail", "Tools contributed by {0}", source.label);
  }
  /** Mirror a row's enablement onto its `treeitem` so assistive tech announces it while navigating. */
  _updateRowAriaChecked(element, state) {
    element.setAttribute("aria-checked", state === "mixed" ? "mixed" : String(state));
  }
  _toggleCollapsed(toolSetId) {
    const next = new Set(this._expanded.get());
    if (next.has(toolSetId)) {
      next.delete(toolSetId);
    } else {
      next.add(toolSetId);
    }
    this._expanded.set(next, void 0);
  }
  _setExpanded(toolSetId, expanded) {
    const next = new Set(this._expanded.get());
    if (expanded === next.has(toolSetId)) {
      return;
    }
    if (expanded) {
      next.add(toolSetId);
    } else {
      next.delete(toolSetId);
    }
    this._expanded.set(next, void 0);
  }
  // --- Tree keyboard navigation ---
  _isExpanded(setRow) {
    return setRow.group.style.display !== "none";
  }
  /** Rows the user can currently land on: all set rows plus tool rows inside expanded sets, in tree order. */
  _visibleRows() {
    return this._rows.filter((r) => r.kind === "set" || this._isExpanded(r.parent));
  }
  /** Keep a single roving `tabIndex=0` on the given row so the tree is one tab stop. */
  _setRovingRow(row) {
    for (const r of this._rows) {
      r.element.tabIndex = r === row ? 0 : -1;
    }
    this._activeRowId = row.rowId;
  }
  _focusRow(row) {
    this._setRovingRow(row);
    row.element.focus();
  }
  /** Resolve the row owning a focus/keyboard target by walking up to a known row element. */
  _rowFromTarget(target) {
    for (let el = target; el && el !== this._treeContainer; el = el.parentElement) {
      const row = this._rowByElement.get(el);
      if (row) {
        return row;
      }
    }
    return void 0;
  }
  /** After a (re)render, restore the roving tabIndex to the previously active row, else the first row. */
  _initRovingTabIndex(refocus = false) {
    let active = this._activeRowId ? this._rows.find((r) => r.rowId === this._activeRowId) : void 0;
    if (!active || active.kind === "tool" && !this._isExpanded(active.parent)) {
      active = this._visibleRows()[0];
    }
    for (const r of this._rows) {
      r.element.tabIndex = r === active ? 0 : -1;
    }
    this._activeRowId = active?.rowId;
    if (refocus && active) {
      active.element.focus();
    }
  }
  _onTreeKeyDown(e) {
    const row = this._rowFromTarget(e.target);
    if (!row) {
      return;
    }
    let handled = true;
    switch (e.keyCode) {
      case KeyCode.DownArrow:
        this._focusRelative(row, 1);
        break;
      case KeyCode.UpArrow:
        this._focusRelative(row, -1);
        break;
      case KeyCode.RightArrow:
        handled = this._onExpandKey(row);
        break;
      case KeyCode.LeftArrow:
        handled = this._onCollapseKey(row);
        break;
      case KeyCode.Home:
        this._focusEdge(true);
        break;
      case KeyCode.End:
        this._focusEdge(false);
        break;
      case KeyCode.Space:
      case KeyCode.Enter:
        row.toggleNode.click();
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  _focusRelative(row, delta) {
    const rows = this._visibleRows();
    const index = rows.indexOf(row);
    const next = index === -1 ? void 0 : rows[index + delta];
    if (next) {
      this._focusRow(next);
    }
  }
  _focusEdge(first) {
    const rows = this._visibleRows();
    this._focusRow(first ? rows[0] : rows[rows.length - 1]);
  }
  /** Right arrow: expand a collapsed set, or move into its first child when already expanded. */
  _onExpandKey(row) {
    if (row.kind !== "set") {
      return false;
    }
    if (!this._isExpanded(row)) {
      this._setExpanded(row.toolSetId, true);
    } else if (row.children.length) {
      this._focusRow(row.children[0]);
    }
    return true;
  }
  /** Left arrow: collapse an expanded set, or move a tool row up to its parent set. */
  _onCollapseKey(row) {
    if (row.kind === "set") {
      if (this._isExpanded(row)) {
        this._setExpanded(row.toolSetId, false);
        return true;
      }
      return false;
    }
    this._focusRow(row.parent);
    return true;
  }
  _currentState() {
    return this._enablementService.getState(this._sessionType);
  }
  /** Resolve the installed, non-builtin extension backing an extension-provided tool set. */
  _resolveExtensionForToolSet(ts) {
    if (ts.source.type !== "extension") {
      return void 0;
    }
    const source = ts.source;
    const extension = this._extensionsWorkbenchService.local.find((e) => ExtensionIdentifier.equals(e.identifier.id, source.extensionId));
    if (!extension || extension.local?.isBuiltin) {
      return void 0;
    }
    return extension;
  }
  _onGalleryContextMenu(e) {
    const extension = e.element;
    if (!extension || extension.state !== ExtensionState.Installed || extension.local?.isBuiltin) {
      return;
    }
    this._showExtensionContextMenu(e.anchor, extension);
  }
  _showExtensionContextMenu(anchor, extension) {
    const disposables = new DisposableStore();
    const uninstallAction = disposables.add(new Action(
      "toolsList.uninstallExtension",
      localize("uninstallExtension", "Uninstall Extension"),
      void 0,
      true,
      () => this._uninstallExtension(extension)
    ));
    this._contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      getActions: () => [uninstallAction],
      onHide: () => disposables.dispose()
    });
  }
  async _uninstallExtension(extension) {
    const result = await this._dialogService.confirm({
      message: localize("confirmUninstallToolExtension", "Do you want to uninstall the extension '{0}'?", extension.displayName),
      detail: localize("confirmUninstallToolExtensionDetail", "This extension may contribute more than tools. Uninstalling it removes all of its contributions."),
      primaryButton: localize("uninstallExtensionBtn", "Uninstall Extension"),
      type: "question"
    });
    if (result.confirmed) {
      await this._extensionsWorkbenchService.uninstall(extension);
    }
  }
};
ToolsListWidget = __decorateClass([
  __decorateParam(1, ILanguageModelToolsService),
  __decorateParam(2, IAgentHostToolSetEnablementService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IExtensionsWorkbenchService),
  __decorateParam(9, IExtensionManifestPropertiesService),
  __decorateParam(10, IWorkbenchEnvironmentService)
], ToolsListWidget);
const COPILOT_CLI_TOOLS = [
  // Shell tools
  { name: "bash / powershell", description: localize("copilotCliTool.shell", "Execute commands") },
  { name: "list_bash / list_powershell", description: localize("copilotCliTool.listShell", "List active shell sessions") },
  { name: "read_bash / read_powershell", description: localize("copilotCliTool.readShell", "Read output from a shell session") },
  { name: "stop_bash / stop_powershell", description: localize("copilotCliTool.stopShell", "Terminate a shell session") },
  { name: "write_bash / write_powershell", description: localize("copilotCliTool.writeShell", "Send input to a shell session") },
  // File operation tools
  { name: "apply_patch", description: localize("copilotCliTool.applyPatch", "Apply patches (used by some models instead of edit/create)") },
  { name: "create", description: localize("copilotCliTool.create", "Create new files") },
  { name: "edit", description: localize("copilotCliTool.edit", "Edit files via string replacement") },
  { name: "view", description: localize("copilotCliTool.view", "Read files or directories") },
  // Agent and task delegation tools
  { name: "list_agents", description: localize("copilotCliTool.listAgents", "List available agents") },
  { name: "read_agent", description: localize("copilotCliTool.readAgent", "Check background agent status") },
  { name: "task", description: localize("copilotCliTool.task", "Run subagents") },
  // Other tools
  { name: "ask_user", description: localize("copilotCliTool.askUser", "Ask the user a question") },
  { name: "glob", description: localize("copilotCliTool.glob", "Find files matching patterns") },
  { name: "grep (or rg)", description: localize("copilotCliTool.grep", "Search for text in files") },
  { name: "skill", description: localize("copilotCliTool.skill", "Invoke custom skills") },
  { name: "web_fetch", description: localize("copilotCliTool.webFetch", "Fetch and parse web content") }
];
const CUSTOM_TOOL_SET_ORDER = {
  "copilot-cli": 0,
  "vscode-general": 1,
  "vscode-tasks": 2,
  "vscode-browser": 3,
  "vscode-notebooks": 4
};
function sortKey(toolSet) {
  const sourcePriority = toolSet.source.type === "internal" ? "0" : "1";
  const order = CUSTOM_TOOL_SET_ORDER[toolSet.id];
  const orderKey = order !== void 0 ? String(order) : `9-${toolSet.description ?? toolSet.referenceName}`;
  return `${sourcePriority}-${orderKey}`;
}
export {
  ToolsListWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcdG9vbHNMaXN0V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBIaWdobGlnaHRlZExhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hpZ2hsaWdodGVkbGFiZWwvaGlnaGxpZ2h0ZWRMYWJlbC5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBJTGlzdENvbnRleHRNZW51RXZlbnQsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ2hlY2tib3gsIFRyaVN0YXRlQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXRjaCwgbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRDaGVja2JveFN0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25TdGF0ZSwgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBHYWxsZXJ5SXRlbUluc3RhbGxTdGF0ZSwgR2FsbGVyeUl0ZW1SZW5kZXJlciwgSUdhbGxlcnlJdGVtUHJvdmlkZXIgfSBmcm9tICcuL2dhbGxlcnlJdGVtUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElUb29sRGF0YSwgSVRvb2xTZXQsIFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY291bnRFbmFibGVkQ3VzdG9taXphdGlvblRvb2xzLCBnZXRUb29sU2V0VHJpU3RhdGUsIElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UsIGlzVG9vbEVuYWJsZWRJblNldCwgSVRvb2xFbmFibGVtZW50U3RhdGUgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL21lZGlhL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuY3NzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5pbnRlcmZhY2UgSVRyZWVSb3cge1xuXHRyZWFkb25seSBraW5kOiAnc2V0JyB8ICd0b29sJztcblx0cmVhZG9ubHkgcm93SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbFNldElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0b2dnbGVOb2RlOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZ3JvdXA/OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2hpbGRyZW4/OiBJVHJlZVJvd1tdO1xuXHRyZWFkb25seSBwYXJlbnQ/OiBJVHJlZVJvdztcbn1cblxuaW50ZXJmYWNlIElUb29sVmlld01vZGVsIHtcblx0cmVhZG9ubHkgdG9vbDogSVRvb2xEYXRhO1xuXHRyZWFkb25seSBuYW1lTWF0Y2hlcz86IElNYXRjaFtdO1xufVxuXG5pbnRlcmZhY2UgSVRvb2xTZXRWaWV3TW9kZWwge1xuXHRyZWFkb25seSB0b29sU2V0OiBJVG9vbFNldDtcblx0cmVhZG9ubHkgYWxsVG9vbElkczogc3RyaW5nW107XG5cdHJlYWRvbmx5IHZpc2libGVUb29sczogSVRvb2xWaWV3TW9kZWxbXTtcblx0cmVhZG9ubHkgbmFtZU1hdGNoZXM/OiBJTWF0Y2hbXTtcblx0LyoqIFdoZW4gc2VhcmNoaW5nLCBzZXRzIGFyZSBmb3JjZS1leHBhbmRlZCB0byByZXZlYWwgbWF0Y2hpbmcgdG9vbHMgcmVnYXJkbGVzcyBvZiB1c2VyIHN0YXRlLiAqL1xuXHRyZWFkb25seSBmb3JjZUV4cGFuZGVkOiBib29sZWFuO1xuXHRyZWFkb25seSByZWFkT25seTogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBNYXJrZXRwbGFjZSBzZWFyY2ggdXNlZCB3aGVuIGJyb3dzaW5nIGZvciB0b29sLWNvbnRyaWJ1dGluZyBleHRlbnNpb25zLiBUaGUgbWFya2V0cGxhY2UgY2Fubm90XG4gKiBiZSBmaWx0ZXJlZCBzZXJ2ZXItc2lkZSBieSBjb250cmlidXRlZCBmZWF0dXJlLCBzbyB0aGlzIGlzIGEgdGV4dCBxdWVyeS5cbiAqL1xuY29uc3QgVE9PTFNfTUFSS0VUUExBQ0VfUVVFUlkgPSAnbGFuZ3VhZ2UgbW9kZWwgdG9vbHMnO1xuXG5jb25zdCBUT09MU19HQUxMRVJZX0lURU1fSEVJR0hUID0gNjI7XG5cbmNvbnN0IFRPT0xTX0dBTExFUllfSVRFTV9URU1QTEFURV9JRCA9ICd0b29sc0dhbGxlcnlJdGVtJztcblxuY2xhc3MgVG9vbHNHYWxsZXJ5SXRlbURlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SUV4dGVuc2lvbj4ge1xuXHRnZXRIZWlnaHQoKTogbnVtYmVyIHsgcmV0dXJuIFRPT0xTX0dBTExFUllfSVRFTV9IRUlHSFQ7IH1cblx0Z2V0VGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gVE9PTFNfR0FMTEVSWV9JVEVNX1RFTVBMQVRFX0lEOyB9XG59XG5cbi8qKiBBZGFwdHMgYW4gZXh0ZW5zaW9uIGZyb20gdGhlIGdhbGxlcnkgdG8gdGhlIHNoYXJlZCBnYWxsZXJ5IHJvdyByZW5kZXJlci4gKi9cbmNsYXNzIFRvb2xzR2FsbGVyeUl0ZW1Qcm92aWRlciBpbXBsZW1lbnRzIElHYWxsZXJ5SXRlbVByb3ZpZGVyPElFeHRlbnNpb24+IHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKSB7IH1cblxuXHRnZXRMYWJlbChleHRlbnNpb246IElFeHRlbnNpb24pOiBzdHJpbmcge1xuXHRcdHJldHVybiBleHRlbnNpb24uZGlzcGxheU5hbWU7XG5cdH1cblxuXHRnZXRQdWJsaXNoZXJEaXNwbGF5TmFtZShleHRlbnNpb246IElFeHRlbnNpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWU7XG5cdH1cblxuXHRnZXREZXNjcmlwdGlvbihleHRlbnNpb246IElFeHRlbnNpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBleHRlbnNpb24uZGVzY3JpcHRpb247XG5cdH1cblxuXHRnZXRJbnN0YWxsU3RhdGUoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogR2FsbGVyeUl0ZW1JbnN0YWxsU3RhdGUge1xuXHRcdHN3aXRjaCAoZXh0ZW5zaW9uLnN0YXRlKSB7XG5cdFx0XHRjYXNlIEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZDogcmV0dXJuIEdhbGxlcnlJdGVtSW5zdGFsbFN0YXRlLkluc3RhbGxlZDtcblx0XHRcdGNhc2UgRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGluZzogcmV0dXJuIEdhbGxlcnlJdGVtSW5zdGFsbFN0YXRlLkluc3RhbGxpbmc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gR2FsbGVyeUl0ZW1JbnN0YWxsU3RhdGUuVW5pbnN0YWxsZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaW5zdGFsbChleHRlbnNpb246IElFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKGV4dGVuc2lvbik7XG5cdH1cblxuXHRvbkRpZENoYW5nZUluc3RhbGxTdGF0ZShleHRlbnNpb246IElFeHRlbnNpb24sIGxpc3RlbmVyOiAoKSA9PiB2b2lkKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlKGNoYW5nZWQgPT4ge1xuXHRcdFx0aWYgKCFjaGFuZ2VkIHx8IGNoYW5nZWQuaWRlbnRpZmllci5pZCA9PT0gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpIHtcblx0XHRcdFx0bGlzdGVuZXIoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIENoYXQgQ3VzdG9taXphdGlvbnMgXHUyMTkyIFRvb2xzOiBhIHNlYXJjaGFibGUsIGNvbGxhcHNpYmxlIHRyZWUgb2YgdG9vbCBzZXRzIGFuZCB0aGVpciBtZW1iZXJcbiAqIHRvb2xzLiBFbmFibGVtZW50IGlzIHJlYWQvd3JpdHRlbiB2aWEge0BsaW5rIElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2V9LCBzY29wZWQgdG9cbiAqIGBzZXNzaW9uVHlwZWAgKHRoZSBhZ2VudCBob3N0IGlzIHRoZSBvbmx5IHRhcmdldCBmb3IgVG9vbHMgY3VzdG9taXphdGlvbnMpLlxuICovXG5leHBvcnQgY2xhc3MgVG9vbHNMaXN0V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJdGVtQ291bnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUl0ZW1Db3VudCA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VsZWN0RXh0ZW5zaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUV4dGVuc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2VsZWN0RXh0ZW5zaW9uID0gdGhpcy5fb25EaWRTZWxlY3RFeHRlbnNpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcm93U3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWFyY2hRdWVyeSA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmc+KCd0b29sc1NlYXJjaFF1ZXJ5JywgJycpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHBhbmRlZCA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seVNldDxzdHJpbmc+PigndG9vbHNFeHBhbmRlZCcsIG5ldyBTZXQoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbGF5ZWRTZWFyY2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigyMDApKTtcblxuXHRwcml2YXRlIF9zZWFyY2hJbnB1dCE6IElucHV0Qm94O1xuXHRwcml2YXRlIF9oZWFkZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfc2VhcmNoUm93ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3RyZWVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfdHJlZVNjcm9sbGFibGUhOiBEb21TY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSBfYnJvd3NlQnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYmFja0J1dHRvbkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9nYWxsZXJ5Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2dhbGxlcnlFbXB0eSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9nYWxsZXJ5TGlzdENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9nYWxsZXJ5TGlzdCE6IFdvcmtiZW5jaExpc3Q8SUV4dGVuc2lvbj47XG5cblx0cHJpdmF0ZSBfbGFzdENvdW50ID0gLTE7XG5cdHByaXZhdGUgX2Jyb3dzZU1vZGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZ2FsbGVyeUN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RIZWlnaHQgPSAwO1xuXHRwcml2YXRlIF9sYXN0V2lkdGggPSAwO1xuXG5cdHByaXZhdGUgX2FjdGl2ZVJvd0lkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Jvd3M6IElUcmVlUm93W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcm93QnlFbGVtZW50ID0gbmV3IE1hcDxIVE1MRWxlbWVudCwgSVRyZWVSb3c+KCk7XG5cblx0LyoqIFJlYWQtb25seSB0b29sIHNldHMgaW5qZWN0ZWQgZm9yIHRoZSBjdXJyZW50IHNlc3Npb24gdHlwZSAoZS5nLiB0aGUgQ29waWxvdCBDTEkgYnVpbHQtaW5zKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGljUmVhZE9ubHlTZXRzOiByZWFkb25seSBJVG9vbFNldFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25UeXBlOiBzdHJpbmcsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW5hYmxlbWVudFNlcnZpY2U6IElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3N0YXRpY1JlYWRPbmx5U2V0cyA9IHRoaXMuX2NyZWF0ZVN0YXRpY1JlYWRPbmx5U2V0cygpO1xuXG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnLnRvb2xzLWxpc3Qtd2lkZ2V0Jyk7XG5cdFx0dGhpcy5fY3JlYXRlSGVhZGVyKCk7XG5cdFx0dGhpcy5fY3JlYXRlU2VhcmNoUm93KCk7XG5cblx0XHQvLyBXcmFwIHRoZSB0cmVlIGluIGEgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgZm9yIGFuIG92ZXJsYXkgc2Nyb2xsYmFyIChub3QgdGhlIG5hdGl2ZSBvbmUpLlxuXHRcdHRoaXMuX3RyZWVDb250YWluZXIgPSAkKCcudG9vbHMtbGlzdC10cmVlJyk7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAndHJlZScpO1xuXHRcdHRoaXMuX3RyZWVDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3Rvb2xzVHJlZUFyaWEnLCBcIlRvb2wgZ3JvdXBzXCIpKTtcblx0XHQvLyBUcmVlLXN0eWxlIGtleWJvYXJkIG5hdmlnYXRpb24gd2l0aCBhIHJvdmluZyB0YWJJbmRleCwgc28gdGhlIHRyZWUgaXMgYSBzaW5nbGUgdGFiIHN0b3AuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RyZWVDb250YWluZXIsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4gdGhpcy5fb25UcmVlS2V5RG93bihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdHJlZUNvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5GT0NVU19JTiwgZSA9PiB7XG5cdFx0XHRjb25zdCByb3cgPSB0aGlzLl9yb3dGcm9tVGFyZ2V0KGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KTtcblx0XHRcdGlmIChyb3cpIHtcblx0XHRcdFx0dGhpcy5fc2V0Um92aW5nUm93KHJvdyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RyZWVTY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMuX3RyZWVDb250YWluZXIsIHtcblx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byxcblx0XHRcdHVzZVNoYWRvd3M6IGZhbHNlLFxuXHRcdH0pKTtcblx0XHRjb25zdCB0cmVlU2Nyb2xsYWJsZU5vZGUgPSB0aGlzLl90cmVlU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCk7XG5cdFx0dHJlZVNjcm9sbGFibGVOb2RlLmNsYXNzTGlzdC5hZGQoJ3Rvb2xzLWxpc3QtdHJlZS1zY3JvbGxhYmxlJyk7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRyZWVTY3JvbGxhYmxlTm9kZSk7XG5cblx0XHR0aGlzLl9jcmVhdGVHYWxsZXJ5KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2dhbGxlcnlDdHM/LmRpc3Bvc2UodHJ1ZSkpKTtcblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX2NyZWF0ZVZpZXdNb2RlbCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3JlbmRlcih2aWV3TW9kZWwucmVhZChyZWFkZXIpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvLyBCYWRnZSBjb3VudHMgZW5hYmxlZCBpbmRpdmlkdWFsIHRvb2xzIGFjcm9zcyBhbGwgdmlzaWJsZSBzZXRzLCBpZ25vcmluZyB0aGUgc2VhcmNoIGZpbHRlci5cblx0XHRcdGNvbnN0IGNvdW50ID0gY291bnRFbmFibGVkQ3VzdG9taXphdGlvblRvb2xzKHRoaXMuX3Rvb2xzU2VydmljZS50b29sU2V0cy5yZWFkKHJlYWRlciksIHRoaXMuX3JlYWRTdGF0ZShyZWFkZXIpLCByZWFkZXIpO1xuXHRcdFx0aWYgKGNvdW50ICE9PSB0aGlzLl9sYXN0Q291bnQpIHtcblx0XHRcdFx0dGhpcy5fbGFzdENvdW50ID0gY291bnQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmZpcmUoY291bnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUhlYWRlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9oZWFkZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLnNlY3Rpb24tdGl0bGUtaGVhZGVyJykpO1xuXHRcdERPTS5hcHBlbmQoRE9NLmFwcGVuZCh0aGlzLl9oZWFkZXIsICQoJy5zZWN0aW9uLXRpdGxlLXJvdycpKSwgJCgnaDIuc2VjdGlvbi10aXRsZScpKS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd0b29sc0xpc3RUaXRsZScsIFwiVG9vbHNcIik7XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IERPTS5hcHBlbmQodGhpcy5faGVhZGVyLCAkKCdwLnNlY3Rpb24tdGl0bGUtZGVzY3JpcHRpb24nKSk7XG5cdFx0RE9NLmFwcGVuZChkZXNjcmlwdGlvbiwgJCgnc3Bhbi5zZWN0aW9uLXRpdGxlLWRlc2NyaXB0aW9uLXRleHQnKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndG9vbHNMaXN0U3VidGl0bGUnLCBcIkVuYWJsZSBvciBkaXNhYmxlIHRoZSB0b29scyBhdmFpbGFibGUgdG8gY2hhdC4gRGlzYWJsZWQgdG9vbHMgYXJlIG5vdCBhZHZlcnRpc2VkIHRvIHRoZSBhZ2VudC4gVG9vbHMgb3RoZXIgdGhhbiBDb3BpbG90J3MgYnVpbHQtaW4gdG9vbHMgcnVuIG9uIHRoZSBjbGllbnQgYW5kIHJlcXVpcmUgaXQgdG8gYmUgY29ubmVjdGVkLlwiKTtcblx0XHQvLyBXaGl0ZXNwYWNlIG5vZGUgc28gdGhlIGdhcCBjb2xsYXBzZXMgd2hlbiB0aGUgbGluayB3cmFwcy5cblx0XHRkZXNjcmlwdGlvbi5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcpKTtcblxuXHRcdGNvbnN0IGxlYXJuTW9yZSA9IERPTS5hcHBlbmQoZGVzY3JpcHRpb24sICQoJ2Euc2VjdGlvbi10aXRsZS1saW5rJykpIGFzIEhUTUxBbmNob3JFbGVtZW50O1xuXHRcdGxlYXJuTW9yZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsZWFybk1vcmVUb29scycsIFwiTGVhcm4gbW9yZSBhYm91dCB0b29sc1wiKTtcblx0XHRsZWFybk1vcmUuaHJlZiA9ICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2FnZW50LWN1c3RvbWl6YXRpb24vdG9vbHM/cmVmZXJyZXI9aW4tcHJvZHVjdCc7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihsZWFybk1vcmUsICdjbGljaycsIGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dm9pZCB0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKGxlYXJuTW9yZS5ocmVmKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlU2VhcmNoUm93KCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlYXJjaFJvdyA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcudG9vbHMtbGlzdC1zZWFyY2gtYW5kLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3Qgc2VhcmNoQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLl9zZWFyY2hSb3csICQoJy50b29scy1saXN0LXNlYXJjaC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fc2VhcmNoSW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgSW5wdXRCb3goc2VhcmNoQ29udGFpbmVyLCB0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnc2VhcmNoUGxhY2Vob2xkZXInLCBcIlR5cGUgdG8gc2VhcmNoLi4uXCIpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3Rvb2xzU2VhcmNoQXJpYScsIFwiU2VhcmNoIHRvb2xzXCIpLFxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZWFyY2hJbnB1dC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9kZWxheWVkU2VhcmNoLnRyaWdnZXIoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fYnJvd3NlTW9kZSkge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5fcXVlcnlHYWxsZXJ5KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc2VhcmNoUXVlcnkuc2V0KHRoaXMuX3NlYXJjaElucHV0LnZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KS5jYXRjaCgoKSA9PiB7IC8qIGRlbGF5ZXIgZGlzcG9zZWQgKi8gfSk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKCF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0Y29uc3QgYnJvd3NlTGFiZWwgPSBsb2NhbGl6ZSgndG9vbHNCcm93c2VNYXJrZXRwbGFjZScsIFwiQnJvd3NlIE1hcmtldHBsYWNlXCIpO1xuXHRcdFx0dGhpcy5fYnJvd3NlQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLl9zZWFyY2hSb3csICQoJy50b29scy1saXN0LWJyb3dzZS1idXR0b24tY29udGFpbmVyJykpO1xuXHRcdFx0Y29uc3QgYnJvd3NlQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLl9icm93c2VCdXR0b25Db250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBicm93c2VMYWJlbCwgYXJpYUxhYmVsOiBicm93c2VMYWJlbCB9KSk7XG5cdFx0XHRicm93c2VCdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24ubGlicmFyeS5pZH0pICR7YnJvd3NlTGFiZWx9YDtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGJyb3dzZUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuX3NldEJyb3dzZU1vZGUodHJ1ZSkpKTtcblx0XHR9XG5cblx0XHRjb25zdCBiYWNrTGFiZWwgPSBsb2NhbGl6ZSgndG9vbHNCcm93c2VCYWNrJywgXCJCYWNrXCIpO1xuXHRcdHRoaXMuX2JhY2tCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuX3NlYXJjaFJvdywgJCgnLnRvb2xzLWxpc3QtYnJvd3NlLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fYmFja0J1dHRvbkNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdGNvbnN0IGJhY2tCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuX2JhY2tCdXR0b25Db250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBiYWNrTGFiZWwsIGFyaWFMYWJlbDogYmFja0xhYmVsIH0pKTtcblx0XHRiYWNrQnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmFycm93TGVmdC5pZH0pICR7YmFja0xhYmVsfWA7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmFja0J1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuX3NldEJyb3dzZU1vZGUoZmFsc2UpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVHYWxsZXJ5KCk6IHZvaWQge1xuXHRcdHRoaXMuX2dhbGxlcnlDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLnRvb2xzLWdhbGxlcnktY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX2dhbGxlcnlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLl9nYWxsZXJ5RW1wdHkgPSBET00uYXBwZW5kKHRoaXMuX2dhbGxlcnlDb250YWluZXIsICQoJy5saXN0LWVtcHR5LXN0YXRlJykpO1xuXHRcdHRoaXMuX2dhbGxlcnlFbXB0eS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX2dhbGxlcnlMaXN0Q29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLl9nYWxsZXJ5Q29udGFpbmVyLCAkKCcudG9vbHMtZ2FsbGVyeS1saXN0JykpO1xuXHRcdHRoaXMuX2dhbGxlcnlMaXN0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hMaXN0PElFeHRlbnNpb24+LFxuXHRcdFx0J1Rvb2xzTWFya2V0cGxhY2VMaXN0Jyxcblx0XHRcdHRoaXMuX2dhbGxlcnlMaXN0Q29udGFpbmVyLFxuXHRcdFx0bmV3IFRvb2xzR2FsbGVyeUl0ZW1EZWxlZ2F0ZSgpLFxuXHRcdFx0W25ldyBHYWxsZXJ5SXRlbVJlbmRlcmVyPElFeHRlbnNpb24+KFRPT0xTX0dBTExFUllfSVRFTV9URU1QTEFURV9JRCwgbmV3IFRvb2xzR2FsbGVyeUl0ZW1Qcm92aWRlcih0aGlzLl9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZSkpXSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogKGV4dGVuc2lvbjogSUV4dGVuc2lvbikgPT4gZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ3Rvb2xzTWFya2V0cGxhY2VBcmlhJywgXCJUb29sIGV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHsgZ2V0SWQ6IChleHRlbnNpb246IElFeHRlbnNpb24pID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkIH0sXG5cdFx0XHR9LFxuXHRcdCkpIGFzIFdvcmtiZW5jaExpc3Q8SUV4dGVuc2lvbj47XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9nYWxsZXJ5TGlzdC5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0RXh0ZW5zaW9uLmZpcmUoZS5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9nYWxsZXJ5TGlzdC5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5fb25HYWxsZXJ5Q29udGV4dE1lbnUoZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWRTdGF0ZShyZWFkZXI6IElSZWFkZXIpOiBJVG9vbEVuYWJsZW1lbnRTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuYWJsZW1lbnRTZXJ2aWNlLm9ic2VydmUodGhpcy5fc2Vzc2lvblR5cGUpLnJlYWQocmVhZGVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVN0YXRpY1JlYWRPbmx5U2V0cygpOiByZWFkb25seSBJVG9vbFNldFtdIHtcblx0XHRjb25zdCB0b29sczogSVRvb2xEYXRhW10gPSBDT1BJTE9UX0NMSV9UT09MUy5tYXAodCA9PiAoe1xuXHRcdFx0aWQ6IGBjb3BpbG90LWNsaToke3QubmFtZX1gLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHQubmFtZSxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246IHQuZGVzY3JpcHRpb24sXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLFxuXHRcdH0pKTtcblx0XHRjb25zdCBjb3BpbG90Q2xpU2V0OiBJVG9vbFNldCA9IHtcblx0XHRcdGlkOiAnY29waWxvdC1jbGknLFxuXHRcdFx0cmVmZXJlbmNlTmFtZTogJ2NvcGlsb3RDbGknLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb3BpbG90LFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xpZW50VG9vbFNldC5jb3BpbG90Q2xpLmRlc2NyaXB0aW9uJywgXCJDb3BpbG90XCIpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2xpZW50VG9vbFNldC5jb3BpbG90Q2xpLmRldGFpbCcsIFwiQnVpbHQtaW4gdG9vbHMgdGhlIENvcGlsb3QgYWdlbnQgcnVucyBpbnNpZGUgaXRzIG93biBydW50aW1lLlwiKSxcblx0XHRcdGdldFRvb2xzOiAoKSA9PiB0b29scyxcblx0XHR9O1xuXHRcdHJldHVybiBbY29waWxvdENsaVNldF07XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVWaWV3TW9kZWwoKTogSU9ic2VydmFibGU8cmVhZG9ubHkgSVRvb2xTZXRWaWV3TW9kZWxbXT4ge1xuXHRcdC8vIFJlZnJlc2ggd2hlbiBleHRlbnNpb25zIGNoYW5nZSBzbyB0b29sIHNldHMgZnJvbSBhbiB1bmluc3RhbGxlZCBleHRlbnNpb24gZHJvcCBvdXQgaW1tZWRpYXRlbHkgKHRoZWlyIHRvb2xzIGxpbmdlciBpbiB0aGUgZXh0ZW5zaW9uIGhvc3QgdW50aWwgcmVsb2FkKS5cblx0XHRjb25zdCBleHRlbnNpb25zQ2hhbmdlZCA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQodGhpcywgdGhpcy5fZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UpO1xuXHRcdHJldHVybiBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRleHRlbnNpb25zQ2hhbmdlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBxdWVyeSA9IHRoaXMuX3NlYXJjaFF1ZXJ5LnJlYWQocmVhZGVyKS50cmltKCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xTZXRWaWV3TW9kZWxbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCB0cyBvZiBbLi4udGhpcy5fdG9vbHNTZXJ2aWNlLnRvb2xTZXRzLnJlYWQocmVhZGVyKSwgLi4udGhpcy5fc3RhdGljUmVhZE9ubHlTZXRzXSkge1xuXHRcdFx0XHRjb25zdCB2bSA9IHRoaXMuX3RvVmlld01vZGVsKHJlYWRlciwgdHMsIHF1ZXJ5KTtcblx0XHRcdFx0aWYgKHZtKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godm0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQuc29ydCgoYSwgYikgPT4gc29ydEtleShhLnRvb2xTZXQpLmxvY2FsZUNvbXBhcmUoc29ydEtleShiLnRvb2xTZXQpKSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9WaWV3TW9kZWwocmVhZGVyOiBJUmVhZGVyLCB0czogSVRvb2xTZXQsIHF1ZXJ5OiBzdHJpbmcpOiBJVG9vbFNldFZpZXdNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRzLmRlcHJlY2F0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIEhpZGUgZXh0ZW5zaW9uLXByb3ZpZGVkIHNldHMgd2hvc2UgZXh0ZW5zaW9uIGlzIGdvbmUgb3IgYmVpbmcgcmVtb3ZlZC5cblx0XHRpZiAodHMuc291cmNlLnR5cGUgPT09ICdleHRlbnNpb24nKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IHRzLnNvdXJjZS5leHRlbnNpb25JZDtcblx0XHRcdGNvbnN0IGluc3RhbGxlZCA9IHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhlLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbklkKSk7XG5cdFx0XHRpZiAoIWluc3RhbGxlZCB8fCBpbnN0YWxsZWQuc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGluZyB8fCBpbnN0YWxsZWQuc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IG1lbWJlclRvb2xzID0gQXJyYXkuZnJvbSh0cy5nZXRUb29scyhyZWFkZXIpKTtcblx0XHRpZiAobWVtYmVyVG9vbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBhbGxUb29sSWRzID0gbWVtYmVyVG9vbHMubWFwKHQgPT4gdC5pZCk7XG5cblx0XHRsZXQgdmlzaWJsZVRvb2xzOiBJVG9vbFZpZXdNb2RlbFtdID0gbWVtYmVyVG9vbHMubWFwKHRvb2wgPT4gKHsgdG9vbCB9KSk7XG5cdFx0bGV0IG5hbWVNYXRjaGVzOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZDtcblx0XHRpZiAocXVlcnkpIHtcblx0XHRcdG5hbWVNYXRjaGVzID0gbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcocXVlcnksIHRzLmRlc2NyaXB0aW9uID8/IHRzLnJlZmVyZW5jZU5hbWUpID8/IHVuZGVmaW5lZDtcblx0XHRcdGlmIChuYW1lTWF0Y2hlcykge1xuXHRcdFx0XHR2aXNpYmxlVG9vbHMgPSBtZW1iZXJUb29scy5tYXAodG9vbCA9PiAoeyB0b29sLCBuYW1lTWF0Y2hlczogbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcocXVlcnksIHRvb2wuZGlzcGxheU5hbWUgPz8gdG9vbC5pZCkgPz8gdW5kZWZpbmVkIH0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZpc2libGVUb29scyA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgbWVtYmVyVG9vbHMpIHtcblx0XHRcdFx0XHRjb25zdCB0b29sTWF0Y2hlcyA9IG1hdGNoZXNDb250aWd1b3VzU3ViU3RyaW5nKHF1ZXJ5LCB0b29sLmRpc3BsYXlOYW1lID8/IHRvb2wuaWQpO1xuXHRcdFx0XHRcdGlmICh0b29sTWF0Y2hlcykge1xuXHRcdFx0XHRcdFx0dmlzaWJsZVRvb2xzLnB1c2goeyB0b29sLCBuYW1lTWF0Y2hlczogdG9vbE1hdGNoZXMgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh2aXNpYmxlVG9vbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0b29sU2V0OiB0cyxcblx0XHRcdGFsbFRvb2xJZHMsXG5cdFx0XHR2aXNpYmxlVG9vbHMsXG5cdFx0XHRuYW1lTWF0Y2hlcyxcblx0XHRcdGZvcmNlRXhwYW5kZWQ6IHF1ZXJ5ICE9PSAnJyxcblx0XHRcdHJlYWRPbmx5OiB0cy5pZCA9PT0gJ2NvcGlsb3QtY2xpJ1xuXHRcdH07XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0SGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdHRoaXMuX2xhc3RXaWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMuX3NlYXJjaElucHV0LmxheW91dCgpO1xuXHRcdHRoaXMuX3RyZWVTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cblx0XHRjb25zdCBnYWxsZXJ5T2Zmc2V0ID0gdGhpcy5fZ2FsbGVyeUNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3AgLSB0aGlzLmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdHRoaXMuX2dhbGxlcnlMaXN0LmxheW91dChNYXRoLm1heCgwLCBoZWlnaHQgLSBnYWxsZXJ5T2Zmc2V0KSwgd2lkdGgpO1xuXHR9XG5cblx0LyoqIEVudGVycy9sZWF2ZXMgbWFya2V0cGxhY2UgYnJvd3NlIG1vZGUsIHN3YXBwaW5nIHRoZSB0cmVlIGZvciB0aGUgZ2FsbGVyeSBsaXN0LiAqL1xuXHRwcml2YXRlIF9zZXRCcm93c2VNb2RlKGJyb3dzZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChicm93c2UgJiYgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2Jyb3dzZU1vZGUgPT09IGJyb3dzZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9icm93c2VNb2RlID0gYnJvd3NlO1xuXG5cdFx0dGhpcy5fdHJlZVNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpLnN0eWxlLmRpc3BsYXkgPSBicm93c2UgPyAnbm9uZScgOiAnJztcblx0XHR0aGlzLl9nYWxsZXJ5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBicm93c2UgPyAnJyA6ICdub25lJztcblx0XHRpZiAodGhpcy5fYnJvd3NlQnV0dG9uQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLl9icm93c2VCdXR0b25Db250YWluZXIuc3R5bGUuZGlzcGxheSA9IGJyb3dzZSA/ICdub25lJyA6ICcnO1xuXHRcdH1cblx0XHR0aGlzLl9iYWNrQnV0dG9uQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBicm93c2UgPyAnJyA6ICdub25lJztcblxuXHRcdHRoaXMuX3NlYXJjaElucHV0LnNldFBsYWNlSG9sZGVyKGJyb3dzZVxuXHRcdFx0PyBsb2NhbGl6ZSgndG9vbHNCcm93c2VQbGFjZWhvbGRlcicsIFwiU2VhcmNoIHRoZSBNYXJrZXRwbGFjZS4uLlwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnc2VhcmNoUGxhY2Vob2xkZXInLCBcIlR5cGUgdG8gc2VhcmNoLi4uXCIpKTtcblx0XHR0aGlzLl9zZWFyY2hJbnB1dC52YWx1ZSA9ICcnO1xuXG5cdFx0aWYgKGJyb3dzZSkge1xuXHRcdFx0dm9pZCB0aGlzLl9xdWVyeUdhbGxlcnkoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZ2FsbGVyeUN0cz8uZGlzcG9zZSh0cnVlKTtcblx0XHRcdHRoaXMuX2dhbGxlcnlDdHMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9nYWxsZXJ5TGlzdC5zcGxpY2UoMCwgdGhpcy5fZ2FsbGVyeUxpc3QubGVuZ3RoLCBbXSk7XG5cdFx0XHR0aGlzLl9zZWFyY2hRdWVyeS5zZXQoJycsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VhcmNoSW5wdXQuZm9jdXMoKTtcblx0XHRpZiAodGhpcy5fbGFzdEhlaWdodCA+IDApIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2xhc3RIZWlnaHQsIHRoaXMuX2xhc3RXaWR0aCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFF1ZXJpZXMgdGhlIEV4dGVuc2lvbnMgZ2FsbGVyeSBmb3IgdG9vbC1jb250cmlidXRpbmcgZXh0ZW5zaW9ucy4gKi9cblx0cHJpdmF0ZSBhc3luYyBfcXVlcnlHYWxsZXJ5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2dhbGxlcnlDdHM/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0Y29uc3QgY3RzID0gdGhpcy5fZ2FsbGVyeUN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgdXNlclRleHQgPSB0aGlzLl9zZWFyY2hJbnB1dC52YWx1ZS50cmltKCk7XG5cdFx0Y29uc3QgdGV4dCA9IHVzZXJUZXh0ID8gYCR7VE9PTFNfTUFSS0VUUExBQ0VfUVVFUll9ICR7dXNlclRleHR9YCA6IFRPT0xTX01BUktFVFBMQUNFX1FVRVJZO1xuXG5cdFx0dGhpcy5fc2V0R2FsbGVyeU1lc3NhZ2UobG9jYWxpemUoJ3Rvb2xzQnJvd3NlTG9hZGluZycsIFwiTG9hZGluZyBtYXJrZXRwbGFjZS4uLlwiKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhZ2VyID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UucXVlcnlHYWxsZXJ5KHsgdGV4dCB9LCBjdHMudG9rZW4pO1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpdGVtcyA9IHBhZ2VyLmZpcnN0UGFnZTtcblx0XHRcdGNvbnN0IGZpbHRlcmVkSXRlbXMgPSBhd2FpdCB0aGlzLl9maWx0ZXJHYWxsZXJ5UmVzdWx0cyhpdGVtcywgY3RzLnRva2VuKTtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZpbHRlcmVkSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3NldEdhbGxlcnlNZXNzYWdlKFxuXHRcdFx0XHRcdGxvY2FsaXplKCd0b29sc0Jyb3dzZU5vUmVzdWx0cycsIFwiTm8gdG9vbCBleHRlbnNpb25zIG1hdGNoICd7MH0nXCIsIHVzZXJUZXh0IHx8IFRPT0xTX01BUktFVFBMQUNFX1FVRVJZKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgndHJ5RGlmZmVyZW50U2VhcmNoJywgXCJUcnkgYSBkaWZmZXJlbnQgc2VhcmNoIHRlcm1cIikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9nYWxsZXJ5RW1wdHkuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2dhbGxlcnlMaXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRoaXMuX2dhbGxlcnlMaXN0LnNwbGljZSgwLCB0aGlzLl9nYWxsZXJ5TGlzdC5sZW5ndGgsIGZpbHRlcmVkSXRlbXMpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0aWYgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fc2V0R2FsbGVyeU1lc3NhZ2UoXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3Rvb2xzQnJvd3NlRXJyb3InLCBcIlVuYWJsZSB0byBsb2FkIG1hcmtldHBsYWNlXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd0b29sc0Jyb3dzZVRyeUFnYWluJywgXCJDaGVjayB5b3VyIGNvbm5lY3Rpb24gYW5kIHRyeSBhZ2FpblwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEtlZXBzIG9ubHkgZXh0ZW5zaW9ucyB0aGF0IGNvbnRyaWJ1dGUgbGFuZ3VhZ2UgbW9kZWwgdG9vbHMgYW5kLCBpbiB0aGUgQWdlbnRzIHdpbmRvdywgY2FuIHJ1biB0aGVyZVxuXHQgKiAoe0BsaW5rIElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmNhbkV4ZWN1dGVPblNlc3Npb25zV2luZG93fSk7IHRoZSBgZXhlY3V0ZXNDb2RlYCBoaW50IHNraXBzXG5cdCAqIG1hbmlmZXN0IGZldGNoZXMgZm9yIGV4dGVuc2lvbnMgdGhhdCBjYW4gbmV2ZXIgcnVuLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZmlsdGVyR2FsbGVyeVJlc3VsdHMoZXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvbltdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHJlcXVpcmVBZ2VudHNXaW5kb3dTdXBwb3J0ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3c7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKGV4dGVuc2lvbnMubWFwKGFzeW5jIGV4dGVuc2lvbiA9PiB7XG5cdFx0XHQvLyBJbiB0aGUgQWdlbnRzIHdpbmRvdywgY29kZS1leGVjdXRpbmcgZXh0ZW5zaW9ucyBjYW4gbmV2ZXIgcnVuOiByZWplY3QgYmVmb3JlIGZldGNoaW5nIHRoZSBtYW5pZmVzdC5cblx0XHRcdGlmIChyZXF1aXJlQWdlbnRzV2luZG93U3VwcG9ydCAmJiBleHRlbnNpb24uZ2FsbGVyeT8ucHJvcGVydGllcy5leGVjdXRlc0NvZGUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgZXh0ZW5zaW9uLmdldE1hbmlmZXN0KHRva2VuKTtcblx0XHRcdFx0aWYgKCFtYW5pZmVzdD8uY29udHJpYnV0ZXM/Lmxhbmd1YWdlTW9kZWxUb29scz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVxdWlyZUFnZW50c1dpbmRvd1N1cHBvcnQgJiYgIXRoaXMuX2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuY2FuRXhlY3V0ZU9uU2Vzc2lvbnNXaW5kb3cobWFuaWZlc3QpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9uO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIElnbm9yZSBleHRlbnNpb25zIHdob3NlIG1hbmlmZXN0IGNhbm5vdCBiZSByZXNvbHZlZC5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cmV0dXJuIHJlc3VsdHMuZmlsdGVyKChleHRlbnNpb24pOiBleHRlbnNpb24gaXMgSUV4dGVuc2lvbiA9PiAhIWV4dGVuc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRHYWxsZXJ5TWVzc2FnZSh0ZXh0OiBzdHJpbmcsIHN1YnRleHQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBEcm9wIGFueSBzdGFsZSByb3dzIHNvIG9ubHkgdGhlIG1lc3NhZ2Ugc2hvd3MuXG5cdFx0dGhpcy5fZ2FsbGVyeUxpc3Quc3BsaWNlKDAsIHRoaXMuX2dhbGxlcnlMaXN0Lmxlbmd0aCwgW10pO1xuXHRcdHRoaXMuX2dhbGxlcnlMaXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLl9nYWxsZXJ5RW1wdHkpO1xuXHRcdHRoaXMuX2dhbGxlcnlFbXB0eS5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdGNvbnN0IGhlYWRlciA9IERPTS5hcHBlbmQodGhpcy5fZ2FsbGVyeUVtcHR5LCAkKCcuZW1wdHktc3RhdGUtaGVhZGVyJykpO1xuXHRcdERPTS5hcHBlbmQoaGVhZGVyLCAkKCcuZW1wdHktc3RhdGUtdGV4dCcpKS50ZXh0Q29udGVudCA9IHRleHQ7XG5cdFx0aWYgKHN1YnRleHQpIHtcblx0XHRcdERPTS5hcHBlbmQodGhpcy5fZ2FsbGVyeUVtcHR5LCAkKCcuZW1wdHktc3RhdGUtc3VidGV4dCcpKS50ZXh0Q29udGVudCA9IHN1YnRleHQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqIE1vdmUga2V5Ym9hcmQgZm9jdXMgdG8gdGhlIHNlYXJjaCBib3guICovXG5cdGZvY3VzU2VhcmNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlYXJjaElucHV0LmZvY3VzKCk7XG5cdFx0dGhpcy5fc2VhcmNoSW5wdXQuc2VsZWN0KCk7XG5cdH1cblxuXHQvKiogUmUtZW1pdCB0aGUgY3VycmVudCBpdGVtIGNvdW50LiBDYWxsZWQgb25jZSBhdCBzdGFydHVwIHRvIHNlZWQgdGhlIHNlY3Rpb24gYmFkZ2UuICovXG5cdGZpcmVJdGVtQ291bnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtQ291bnQuZmlyZSh0aGlzLl9sYXN0Q291bnQgPT09IC0xID8gMCA6IHRoaXMuX2xhc3RDb3VudCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXIobW9kZWw6IHJlYWRvbmx5IElUb29sU2V0Vmlld01vZGVsW10pOiB2b2lkIHtcblx0XHQvLyBBIGxpdmUgdXBkYXRlIChzZWFyY2gvdG9vbC1zZXQgY2hhbmdlKSByZWJ1aWxkcyByb3dzOyBrZWVwIGtleWJvYXJkIGZvY3VzIGluIHRoZSB0cmVlIGlmIGl0IHdhcyB0aGVyZS5cblx0XHRjb25zdCBoYWRGb2N1cyA9IERPTS5pc0FuY2VzdG9yKHRoaXMuX3RyZWVDb250YWluZXIub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50LCB0aGlzLl90cmVlQ29udGFpbmVyKTtcblx0XHR0aGlzLl9yb3dTdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuX3Jvd3MgPSBbXTtcblx0XHR0aGlzLl9yb3dCeUVsZW1lbnQuY2xlYXIoKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuX3RyZWVDb250YWluZXIpO1xuXG5cdFx0aWYgKG1vZGVsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgZW1wdHlTdGF0ZSA9IERPTS5hcHBlbmQodGhpcy5fdHJlZUNvbnRhaW5lciwgJCgnLmxpc3QtZW1wdHktc3RhdGUnKSk7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBET00uYXBwZW5kKGVtcHR5U3RhdGUsICQoJy5lbXB0eS1zdGF0ZS1oZWFkZXInKSk7XG5cdFx0XHRjb25zdCB0ZXh0ID0gRE9NLmFwcGVuZChoZWFkZXIsICQoJy5lbXB0eS1zdGF0ZS10ZXh0JykpO1xuXHRcdFx0Y29uc3Qgc3VidGV4dCA9IERPTS5hcHBlbmQoZW1wdHlTdGF0ZSwgJCgnLmVtcHR5LXN0YXRlLXN1YnRleHQnKSk7XG5cdFx0XHRjb25zdCBxdWVyeSA9IHRoaXMuX3NlYXJjaFF1ZXJ5LmdldCgpLnRyaW0oKTtcblx0XHRcdGlmIChxdWVyeSkge1xuXHRcdFx0XHR0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vTWF0Y2hpbmdUb29scycsIFwiTm8gdG9vbHMgbWF0Y2ggJ3swfSdcIiwgcXVlcnkpO1xuXHRcdFx0XHRzdWJ0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3RyeURpZmZlcmVudFNlYXJjaCcsIFwiVHJ5IGEgZGlmZmVyZW50IHNlYXJjaCB0ZXJtXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd0b29sc05vTWF0Y2hlcycsIFwiTm8gdG9vbHMgYXZhaWxhYmxlLlwiKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3RyZWVTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB2bSBvZiBtb2RlbCkge1xuXHRcdFx0Y29uc3Qgc2V0Um93ID0gdGhpcy5fcmVuZGVyVG9vbFNldCh2bSk7XG5cdFx0XHR0aGlzLl9hZGRSb3coc2V0Um93KTtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygc2V0Um93LmNoaWxkcmVuISkge1xuXHRcdFx0XHR0aGlzLl9hZGRSb3coY2hpbGQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9pbml0Um92aW5nVGFiSW5kZXgoaGFkRm9jdXMpO1xuXHRcdHRoaXMuX3RyZWVTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRSb3cocm93OiBJVHJlZVJvdyk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvd3MucHVzaChyb3cpO1xuXHRcdHRoaXMuX3Jvd0J5RWxlbWVudC5zZXQocm93LmVsZW1lbnQsIHJvdyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJUb29sU2V0KHZtOiBJVG9vbFNldFZpZXdNb2RlbCk6IElUcmVlUm93IHtcblx0XHRjb25zdCB0cyA9IHZtLnRvb2xTZXQ7XG5cdFx0Y29uc3Qgcm93ID0gRE9NLmFwcGVuZCh0aGlzLl90cmVlQ29udGFpbmVyLCAkKCcudG9vbHMtbGlzdC1zZXRyb3cnKSk7XG5cdFx0Ly8gVHJlZSBpdGVtIHdpdGggYSByb3ZpbmcgdGFiSW5kZXg6IG5hdmlnYXRlZCB3aXRoIGFycm93cywgdG9nZ2xlZCB3aXRoIFNwYWNlOyBub3QgYSBUYWIgc3RvcC5cblx0XHRyb3cuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3RyZWVpdGVtJyk7XG5cdFx0cm93LnNldEF0dHJpYnV0ZSgnYXJpYS1sZXZlbCcsICcxJyk7XG5cdFx0cm93LnRhYkluZGV4ID0gLTE7XG5cblx0XHRjb25zdCBzZXROYW1lID0gdHMuZGVzY3JpcHRpb24gPz8gdHMucmVmZXJlbmNlTmFtZTtcblx0XHRjb25zdCB0b2dnbGVFeHBhbmQgPSAoKSA9PiB0aGlzLl90b2dnbGVDb2xsYXBzZWQodHMuaWQpO1xuXG5cdFx0Y29uc3QgY2hlY2tib3ggPSB0aGlzLl9yb3dTdG9yZS5hZGQobmV3IFRyaVN0YXRlQ2hlY2tib3goXG5cdFx0XHRsb2NhbGl6ZSgndG9vbHNTZXRDaGVja2JveCcsIFwiRW5hYmxlIHswfVwiLCBzZXROYW1lKSxcblx0XHRcdGdldFRvb2xTZXRUcmlTdGF0ZSh0aGlzLl9jdXJyZW50U3RhdGUoKSwgdHMuaWQsIHZtLmFsbFRvb2xJZHMpLFxuXHRcdFx0ZGVmYXVsdENoZWNrYm94U3R5bGVzLFxuXHRcdCkpO1xuXHRcdGNoZWNrYm94LmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHRyb3cuYXBwZW5kQ2hpbGQoY2hlY2tib3guZG9tTm9kZSk7XG5cdFx0aWYgKHZtLnJlYWRPbmx5KSB7XG5cdFx0XHRjaGVja2JveC5kaXNhYmxlKCk7XG5cdFx0XHRjaGVja2JveC5zZXRUaXRsZShsb2NhbGl6ZSgndG9vbHNTZXRSZWFkT25seScsIFwiVGhlc2UgYXJlIHRoZSBhZ2VudCdzIGJ1aWx0LWluIHRvb2xzIGFuZCBjYW5ub3QgYmUgY2hhbmdlZC5cIikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yb3dTdG9yZS5hZGQoY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBlbmFibGVkID0gY2hlY2tib3guY2hlY2tlZCA9PT0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fZW5hYmxlbWVudFNlcnZpY2Uuc2V0VG9vbFNldEVuYWJsZWQodGhpcy5fc2Vzc2lvblR5cGUsIHRzLmlkLCB2bS5hbGxUb29sSWRzLCBlbmFibGVkKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCBtYWluID0gRE9NLmFwcGVuZChyb3csICQoJy50b29scy1saXN0LXJvdy1tYWluJykpO1xuXHRcdGNvbnN0IHRleHQgPSBET00uYXBwZW5kKG1haW4sICQoJy50b29scy1saXN0LXJvdy10ZXh0JykpO1xuXHRcdGNvbnN0IGxhYmVsID0gRE9NLmFwcGVuZCh0ZXh0LCAkKCdzcGFuLnRvb2xzLWxpc3Qtcm93LWxhYmVsJykpO1xuXHRcdGNvbnN0IGxhYmVsSGlnaGxpZ2h0ID0gdGhpcy5fcm93U3RvcmUuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKGxhYmVsKSk7XG5cdFx0bGFiZWxIaWdobGlnaHQuc2V0KHNldE5hbWUsIHZtLm5hbWVNYXRjaGVzKTtcblx0XHRjb25zdCBkZXRhaWwgPSB0aGlzLl9yZXNvbHZlU2V0RGV0YWlsKHRzKTtcblx0XHRpZiAoZGV0YWlsKSB7XG5cdFx0XHRET00uYXBwZW5kKHRleHQsICQoJ3NwYW4udG9vbHMtbGlzdC1yb3ctc3VidGV4dCcpKS50ZXh0Q29udGVudCA9IGRldGFpbDtcblx0XHR9XG5cblx0XHRjb25zdCBjb3VudCA9IERPTS5hcHBlbmQocm93LCAkKCdzcGFuLnRvb2xzLWxpc3Qtcm93LWNvdW50JykpO1xuXG5cdFx0Ly8gRGVjb3JhdGl2ZSBjaGV2cm9uOiBleHBhbmQgc3RhdGUgaXMgb24gdGhlIHJvdyAoYXJpYS1leHBhbmRlZCk7IHRvZ2dsZWQgYnkgcm93IGNsaWNrIG9yIGFycm93cy5cblx0XHRjb25zdCBjaGV2cm9uID0gRE9NLmFwcGVuZChyb3csICQoJ2EudG9vbHMtbGlzdC1jaGV2cm9uLmNvZGljb24nKSkgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0Y2hldnJvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdHRoaXMuX3Jvd1N0b3JlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJvdywgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRpZiAoY2hlY2tib3guZG9tTm9kZS5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyb3cuZm9jdXMoKTtcblx0XHRcdHRvZ2dsZUV4cGFuZCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEV4dGVuc2lvbi1wcm92aWRlZCB0b29sIHNldHMgY2FuIGJlIHVuaW5zdGFsbGVkIHZpYSB0aGUgY29udGV4dCBtZW51LlxuXHRcdHRoaXMuX3Jvd1N0b3JlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJvdywgJ2NvbnRleHRtZW51JywgZSA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLl9yZXNvbHZlRXh0ZW5zaW9uRm9yVG9vbFNldCh0cyk7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRET00uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdGNvbnN0IGFuY2hvcjogSFRNTEVsZW1lbnQgfCBTdGFuZGFyZE1vdXNlRXZlbnQgPSBlLmJ1dHRvbiA9PT0gMiA/IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoRE9NLmdldFdpbmRvdyhyb3cpLCBlKSA6IHJvdztcblx0XHRcdHRoaXMuX3Nob3dFeHRlbnNpb25Db250ZXh0TWVudShhbmNob3IsIGV4dGVuc2lvbik7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBET00uYXBwZW5kKHRoaXMuX3RyZWVDb250YWluZXIsICQoJy50b29scy1saXN0LWNoaWxkcmVuJykpO1xuXHRcdGdyb3VwLmlkID0gYHRvb2xzLWdyb3VwLSR7dHMuaWR9YDtcblx0XHRncm91cC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZ3JvdXAnKTtcblx0XHRncm91cC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBzZXROYW1lKTtcblx0XHQvLyBUaGUgY2hpbGQgZ3JvdXAgaXMgYSBET00gc2libGluZyAoZmxhdCBmbGV4IGxheW91dCksIHNvIGFzc29jaWF0ZSBpdCB3aXRoIHRoZSBwYXJlbnQgaXRlbSB2aWEgYXJpYS1vd25zLlxuXHRcdHJvdy5zZXRBdHRyaWJ1dGUoJ2FyaWEtb3ducycsIGdyb3VwLmlkKTtcblxuXHRcdGNvbnN0IHNldFJvdzogSVRyZWVSb3cgPSB7XG5cdFx0XHRraW5kOiAnc2V0Jyxcblx0XHRcdHJvd0lkOiBgc2V0OiR7dHMuaWR9YCxcblx0XHRcdHRvb2xTZXRJZDogdHMuaWQsXG5cdFx0XHRlbGVtZW50OiByb3csXG5cdFx0XHR0b2dnbGVOb2RlOiBjaGVja2JveC5kb21Ob2RlLFxuXHRcdFx0Z3JvdXAsXG5cdFx0XHRjaGlsZHJlbjogW10sXG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2Ygdm0udmlzaWJsZVRvb2xzKSB7XG5cdFx0XHRzZXRSb3cuY2hpbGRyZW4hLnB1c2godGhpcy5fcmVuZGVyVG9vbChncm91cCwgc2V0Um93LCB2bSwgdG9vbCkpO1xuXHRcdH1cblxuXHRcdC8vIFRyaS1zdGF0ZSBhbmQgY291bnQgcmVmbGVjdCBlbmFibGVtZW50OyB1cGRhdGUgaW4gcGxhY2Ugc28gYSB0b2dnbGUgbmV2ZXIgcmVidWlsZHMgdGhlIHJvdy5cblx0XHR0aGlzLl9yb3dTdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9yZWFkU3RhdGUocmVhZGVyKTtcblx0XHRcdGNvbnN0IHRyaVN0YXRlID0gZ2V0VG9vbFNldFRyaVN0YXRlKHN0YXRlLCB0cy5pZCwgdm0uYWxsVG9vbElkcyk7XG5cdFx0XHRjaGVja2JveC5jaGVja2VkID0gdHJpU3RhdGU7XG5cdFx0XHR0aGlzLl91cGRhdGVSb3dBcmlhQ2hlY2tlZChyb3csIHRyaVN0YXRlKTtcblx0XHRcdGNvbnN0IGVuYWJsZWRDb3VudCA9IHZtLmFsbFRvb2xJZHMucmVkdWNlKChuLCBpZCkgPT4gbiArIChpc1Rvb2xFbmFibGVkSW5TZXQoc3RhdGUsIHRzLmlkLCBpZCkgPyAxIDogMCksIDApO1xuXHRcdFx0Y291bnQudGV4dENvbnRlbnQgPSBgJHtlbmFibGVkQ291bnR9LyR7dm0uYWxsVG9vbElkcy5sZW5ndGh9YDtcblx0XHRcdGNvdW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCd0b29sc1Jvd0VuYWJsZWRPZlRvdGFsJywgXCJ7MH0gb2YgezF9IHRvb2xzIGVuYWJsZWRcIiwgZW5hYmxlZENvdW50LCB2bS5hbGxUb29sSWRzLmxlbmd0aCkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEV4cGFuZC9jb2xsYXBzZSB0b2dnbGVzIGNoaWxkIHZpc2liaWxpdHkgaW4gcGxhY2UgKG5vIHJlYnVpbGQpIHNvIHJvdyBmb2N1cyBpcyBrZXB0LlxuXHRcdHRoaXMuX3Jvd1N0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBleHBhbmRlZCA9IHZtLmZvcmNlRXhwYW5kZWQgfHwgdGhpcy5fZXhwYW5kZWQucmVhZChyZWFkZXIpLmhhcyh0cy5pZCk7XG5cdFx0XHRncm91cC5zdHlsZS5kaXNwbGF5ID0gZXhwYW5kZWQgPyAnJyA6ICdub25lJztcblx0XHRcdGNoZXZyb24uY2xhc3NMaXN0LnRvZ2dsZSgnY29kaWNvbi1jaGV2cm9uLWRvd24nLCBleHBhbmRlZCk7XG5cdFx0XHRjaGV2cm9uLmNsYXNzTGlzdC50b2dnbGUoJ2NvZGljb24tY2hldnJvbi1yaWdodCcsICFleHBhbmRlZCk7XG5cdFx0XHRyb3cuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKGV4cGFuZGVkKSk7XG5cdFx0XHR0aGlzLl90cmVlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBzZXRSb3c7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJUb29sKGdyb3VwOiBIVE1MRWxlbWVudCwgcGFyZW50OiBJVHJlZVJvdywgdm06IElUb29sU2V0Vmlld01vZGVsLCB0b29sVm06IElUb29sVmlld01vZGVsKTogSVRyZWVSb3cge1xuXHRcdGNvbnN0IHRvb2wgPSB0b29sVm0udG9vbDtcblx0XHRjb25zdCBlbmFibGVkID0gaXNUb29sRW5hYmxlZEluU2V0KHRoaXMuX2N1cnJlbnRTdGF0ZSgpLCB2bS50b29sU2V0LmlkLCB0b29sLmlkKTtcblx0XHRjb25zdCB0b29sTmFtZSA9IHRvb2wuZGlzcGxheU5hbWUgPz8gdG9vbC5pZDtcblxuXHRcdGNvbnN0IHJvdyA9IERPTS5hcHBlbmQoZ3JvdXAsICQoJy50b29scy1saXN0LXRvb2xyb3cnKSk7XG5cdFx0cm93LmNsYXNzTGlzdC50b2dnbGUoJ3JlYWRvbmx5Jywgdm0ucmVhZE9ubHkpO1xuXHRcdC8vIFRyZWUgaXRlbSBhdCBsZXZlbCAyOyByZWFkLW9ubHkgdG9vbHMgc3RheSBuYXZpZ2FibGUgKG9ubHkgdGhlIGNoZWNrYm94IGlzIGRpc2FibGVkKS5cblx0XHRyb3cuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3RyZWVpdGVtJyk7XG5cdFx0cm93LnNldEF0dHJpYnV0ZSgnYXJpYS1sZXZlbCcsICcyJyk7XG5cdFx0cm93LnRhYkluZGV4ID0gLTE7XG5cblx0XHRjb25zdCBjaGVja2JveCA9IHRoaXMuX3Jvd1N0b3JlLmFkZChuZXcgQ2hlY2tib3goXG5cdFx0XHRsb2NhbGl6ZSgndG9vbHNUb29sQ2hlY2tib3gnLCBcIkVuYWJsZSB7MH1cIiwgdG9vbE5hbWUpLFxuXHRcdFx0ZW5hYmxlZCxcblx0XHRcdGRlZmF1bHRDaGVja2JveFN0eWxlcyxcblx0XHQpKTtcblx0XHRjaGVja2JveC5kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cdFx0cm93LmFwcGVuZENoaWxkKGNoZWNrYm94LmRvbU5vZGUpO1xuXHRcdHRoaXMuX3VwZGF0ZVJvd0FyaWFDaGVja2VkKHJvdywgZW5hYmxlZCk7XG5cdFx0aWYgKHZtLnJlYWRPbmx5KSB7XG5cdFx0XHRjaGVja2JveC5kaXNhYmxlKCk7XG5cdFx0XHRjaGVja2JveC5zZXRUaXRsZShsb2NhbGl6ZSgndG9vbHNTZXRSZWFkT25seScsIFwiVGhlc2UgYXJlIHRoZSBhZ2VudCdzIGJ1aWx0LWluIHRvb2xzIGFuZCBjYW5ub3QgYmUgY2hhbmdlZC5cIikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yb3dTdG9yZS5hZGQoY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lbmFibGVtZW50U2VydmljZS5zZXRUb29sRW5hYmxlZCh0aGlzLl9zZXNzaW9uVHlwZSwgdm0udG9vbFNldC5pZCwgdG9vbC5pZCwgY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3Jvd1N0b3JlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJvdywgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRcdGlmIChjaGVja2JveC5kb21Ob2RlLmNvbnRhaW5zKGUudGFyZ2V0IGFzIE5vZGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJvdy5mb2N1cygpO1xuXHRcdFx0XHR0aGlzLl9lbmFibGVtZW50U2VydmljZS5zZXRUb29sRW5hYmxlZCh0aGlzLl9zZXNzaW9uVHlwZSwgdm0udG9vbFNldC5pZCwgdG9vbC5pZCwgIWNoZWNrYm94LmNoZWNrZWQpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBLZWVwIHRoZSBjaGVja2JveCBhbmQgdGhlIHRyZWVpdGVtJ3MgYXJpYS1jaGVja2VkIGluIHN5bmMgKGUuZy4gd2hlbiB0aGUgcGFyZW50IHNldCBpcyB0b2dnbGVkKS5cblx0XHRcdHRoaXMuX3Jvd1N0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHRvb2xFbmFibGVkID0gaXNUb29sRW5hYmxlZEluU2V0KHRoaXMuX3JlYWRTdGF0ZShyZWFkZXIpLCB2bS50b29sU2V0LmlkLCB0b29sLmlkKTtcblx0XHRcdFx0Y2hlY2tib3guY2hlY2tlZCA9IHRvb2xFbmFibGVkO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVSb3dBcmlhQ2hlY2tlZChyb3csIHRvb2xFbmFibGVkKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0ID0gRE9NLmFwcGVuZChyb3csICQoJy50b29scy1saXN0LXJvdy10ZXh0JykpO1xuXHRcdGNvbnN0IGxhYmVsID0gRE9NLmFwcGVuZCh0ZXh0LCAkKCdzcGFuLnRvb2xzLWxpc3Qtcm93LWxhYmVsJykpO1xuXHRcdGNvbnN0IGxhYmVsSGlnaGxpZ2h0ID0gdGhpcy5fcm93U3RvcmUuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKGxhYmVsKSk7XG5cdFx0bGFiZWxIaWdobGlnaHQuc2V0KHRvb2xOYW1lLCB0b29sVm0ubmFtZU1hdGNoZXMpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdG9vbC51c2VyRGVzY3JpcHRpb24gPz8gdG9vbC5tb2RlbERlc2NyaXB0aW9uO1xuXHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0Y29uc3Qgc3VidGV4dCA9IERPTS5hcHBlbmQodGV4dCwgJCgnc3Bhbi50b29scy1saXN0LXJvdy1zdWJ0ZXh0JykpO1xuXHRcdFx0c3VidGV4dC50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAndG9vbCcsXG5cdFx0XHRyb3dJZDogYHRvb2w6JHt2bS50b29sU2V0LmlkfToke3Rvb2wuaWR9YCxcblx0XHRcdHRvb2xTZXRJZDogdm0udG9vbFNldC5pZCxcblx0XHRcdGVsZW1lbnQ6IHJvdyxcblx0XHRcdHRvZ2dsZU5vZGU6IGNoZWNrYm94LmRvbU5vZGUsXG5cdFx0XHRwYXJlbnQsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdWJ0aXRsZSBmb3IgYSB0b29sLXNldCByb3c6IHRoZSBzZXQncyBvd24gYGRldGFpbGAsIG9yIGZvciBleHRlbnNpb24gc2V0cyB0aGUgZXh0ZW5zaW9uJ3Ncblx0ICogZGVzY3JpcHRpb24gKGZhbGxpbmcgYmFjayB0byBhIGdlbmVyaWMgXCJjb250cmlidXRlZCBieVwiIGxhYmVsKS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVTZXREZXRhaWwodHM6IElUb29sU2V0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodHMuZGV0YWlsKSB7XG5cdFx0XHRyZXR1cm4gdHMuZGV0YWlsO1xuXHRcdH1cblx0XHRpZiAodHMuc291cmNlLnR5cGUgIT09ICdleHRlbnNpb24nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2UgPSB0cy5zb3VyY2U7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5fZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChlID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGUuaWRlbnRpZmllci5pZCwgc291cmNlLmV4dGVuc2lvbklkKSk7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbj8uZGVzY3JpcHRpb24gfHwgbG9jYWxpemUoJ3Rvb2xzU2V0RXh0ZW5zaW9uRGV0YWlsJywgXCJUb29scyBjb250cmlidXRlZCBieSB7MH1cIiwgc291cmNlLmxhYmVsKTtcblx0fVxuXG5cdC8qKiBNaXJyb3IgYSByb3cncyBlbmFibGVtZW50IG9udG8gaXRzIGB0cmVlaXRlbWAgc28gYXNzaXN0aXZlIHRlY2ggYW5ub3VuY2VzIGl0IHdoaWxlIG5hdmlnYXRpbmcuICovXG5cdHByaXZhdGUgX3VwZGF0ZVJvd0FyaWFDaGVja2VkKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzdGF0ZTogYm9vbGVhbiB8ICdtaXhlZCcpOiB2b2lkIHtcblx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgc3RhdGUgPT09ICdtaXhlZCcgPyAnbWl4ZWQnIDogU3RyaW5nKHN0YXRlKSk7XG5cdH1cblxuXHRwcml2YXRlIF90b2dnbGVDb2xsYXBzZWQodG9vbFNldElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBuZXh0ID0gbmV3IFNldCh0aGlzLl9leHBhbmRlZC5nZXQoKSk7XG5cdFx0aWYgKG5leHQuaGFzKHRvb2xTZXRJZCkpIHtcblx0XHRcdG5leHQuZGVsZXRlKHRvb2xTZXRJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5leHQuYWRkKHRvb2xTZXRJZCk7XG5cdFx0fVxuXHRcdHRoaXMuX2V4cGFuZGVkLnNldChuZXh0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RXhwYW5kZWQodG9vbFNldElkOiBzdHJpbmcsIGV4cGFuZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV4dCA9IG5ldyBTZXQodGhpcy5fZXhwYW5kZWQuZ2V0KCkpO1xuXHRcdGlmIChleHBhbmRlZCA9PT0gbmV4dC5oYXModG9vbFNldElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZXhwYW5kZWQpIHtcblx0XHRcdG5leHQuYWRkKHRvb2xTZXRJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5leHQuZGVsZXRlKHRvb2xTZXRJZCk7XG5cdFx0fVxuXHRcdHRoaXMuX2V4cGFuZGVkLnNldChuZXh0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gLS0tIFRyZWUga2V5Ym9hcmQgbmF2aWdhdGlvbiAtLS1cblxuXHRwcml2YXRlIF9pc0V4cGFuZGVkKHNldFJvdzogSVRyZWVSb3cpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc2V0Um93Lmdyb3VwIS5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XG5cdH1cblxuXHQvKiogUm93cyB0aGUgdXNlciBjYW4gY3VycmVudGx5IGxhbmQgb246IGFsbCBzZXQgcm93cyBwbHVzIHRvb2wgcm93cyBpbnNpZGUgZXhwYW5kZWQgc2V0cywgaW4gdHJlZSBvcmRlci4gKi9cblx0cHJpdmF0ZSBfdmlzaWJsZVJvd3MoKTogSVRyZWVSb3dbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jvd3MuZmlsdGVyKHIgPT4gci5raW5kID09PSAnc2V0JyB8fCB0aGlzLl9pc0V4cGFuZGVkKHIucGFyZW50ISkpO1xuXHR9XG5cblx0LyoqIEtlZXAgYSBzaW5nbGUgcm92aW5nIGB0YWJJbmRleD0wYCBvbiB0aGUgZ2l2ZW4gcm93IHNvIHRoZSB0cmVlIGlzIG9uZSB0YWIgc3RvcC4gKi9cblx0cHJpdmF0ZSBfc2V0Um92aW5nUm93KHJvdzogSVRyZWVSb3cpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5fcm93cykge1xuXHRcdFx0ci5lbGVtZW50LnRhYkluZGV4ID0gciA9PT0gcm93ID8gMCA6IC0xO1xuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVSb3dJZCA9IHJvdy5yb3dJZDtcblx0fVxuXG5cdHByaXZhdGUgX2ZvY3VzUm93KHJvdzogSVRyZWVSb3cpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRSb3ZpbmdSb3cocm93KTtcblx0XHRyb3cuZWxlbWVudC5mb2N1cygpO1xuXHR9XG5cblx0LyoqIFJlc29sdmUgdGhlIHJvdyBvd25pbmcgYSBmb2N1cy9rZXlib2FyZCB0YXJnZXQgYnkgd2Fsa2luZyB1cCB0byBhIGtub3duIHJvdyBlbGVtZW50LiAqL1xuXHRwcml2YXRlIF9yb3dGcm9tVGFyZ2V0KHRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsKTogSVRyZWVSb3cgfCB1bmRlZmluZWQge1xuXHRcdGZvciAobGV0IGVsID0gdGFyZ2V0OyBlbCAmJiBlbCAhPT0gdGhpcy5fdHJlZUNvbnRhaW5lcjsgZWwgPSBlbC5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRjb25zdCByb3cgPSB0aGlzLl9yb3dCeUVsZW1lbnQuZ2V0KGVsKTtcblx0XHRcdGlmIChyb3cpIHtcblx0XHRcdFx0cmV0dXJuIHJvdztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBBZnRlciBhIChyZSlyZW5kZXIsIHJlc3RvcmUgdGhlIHJvdmluZyB0YWJJbmRleCB0byB0aGUgcHJldmlvdXNseSBhY3RpdmUgcm93LCBlbHNlIHRoZSBmaXJzdCByb3cuICovXG5cdHByaXZhdGUgX2luaXRSb3ZpbmdUYWJJbmRleChyZWZvY3VzID0gZmFsc2UpOiB2b2lkIHtcblx0XHRsZXQgYWN0aXZlID0gdGhpcy5fYWN0aXZlUm93SWQgPyB0aGlzLl9yb3dzLmZpbmQociA9PiByLnJvd0lkID09PSB0aGlzLl9hY3RpdmVSb3dJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFhY3RpdmUgfHwgKGFjdGl2ZS5raW5kID09PSAndG9vbCcgJiYgIXRoaXMuX2lzRXhwYW5kZWQoYWN0aXZlLnBhcmVudCEpKSkge1xuXHRcdFx0YWN0aXZlID0gdGhpcy5fdmlzaWJsZVJvd3MoKVswXTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCByIG9mIHRoaXMuX3Jvd3MpIHtcblx0XHRcdHIuZWxlbWVudC50YWJJbmRleCA9IHIgPT09IGFjdGl2ZSA/IDAgOiAtMTtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlUm93SWQgPSBhY3RpdmU/LnJvd0lkO1xuXHRcdGlmIChyZWZvY3VzICYmIGFjdGl2ZSkge1xuXHRcdFx0YWN0aXZlLmVsZW1lbnQuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vblRyZWVLZXlEb3duKGU6IElLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgcm93ID0gdGhpcy5fcm93RnJvbVRhcmdldChlLnRhcmdldCk7XG5cdFx0aWYgKCFyb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGhhbmRsZWQgPSB0cnVlO1xuXHRcdHN3aXRjaCAoZS5rZXlDb2RlKSB7XG5cdFx0XHRjYXNlIEtleUNvZGUuRG93bkFycm93OlxuXHRcdFx0XHR0aGlzLl9mb2N1c1JlbGF0aXZlKHJvdywgMSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBLZXlDb2RlLlVwQXJyb3c6XG5cdFx0XHRcdHRoaXMuX2ZvY3VzUmVsYXRpdmUocm93LCAtMSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBLZXlDb2RlLlJpZ2h0QXJyb3c6XG5cdFx0XHRcdGhhbmRsZWQgPSB0aGlzLl9vbkV4cGFuZEtleShyb3cpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgS2V5Q29kZS5MZWZ0QXJyb3c6XG5cdFx0XHRcdGhhbmRsZWQgPSB0aGlzLl9vbkNvbGxhcHNlS2V5KHJvdyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBLZXlDb2RlLkhvbWU6XG5cdFx0XHRcdHRoaXMuX2ZvY3VzRWRnZSh0cnVlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEtleUNvZGUuRW5kOlxuXHRcdFx0XHR0aGlzLl9mb2N1c0VkZ2UoZmFsc2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgS2V5Q29kZS5TcGFjZTpcblx0XHRcdGNhc2UgS2V5Q29kZS5FbnRlcjpcblx0XHRcdFx0Ly8gUmV1c2UgdGhlIHJvdydzIGNoZWNrYm94IHdpcmluZzsgZGlzYWJsZWQgKHJlYWQtb25seSkgY2hlY2tib3hlcyBpZ25vcmUgdGhlIGNsaWNrLlxuXHRcdFx0XHRyb3cudG9nZ2xlTm9kZS5jbGljaygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGhhbmRsZWQgPSBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGhhbmRsZWQpIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNSZWxhdGl2ZShyb3c6IElUcmVlUm93LCBkZWx0YTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm93cyA9IHRoaXMuX3Zpc2libGVSb3dzKCk7XG5cdFx0Y29uc3QgaW5kZXggPSByb3dzLmluZGV4T2Yocm93KTtcblx0XHRjb25zdCBuZXh0ID0gaW5kZXggPT09IC0xID8gdW5kZWZpbmVkIDogcm93c1tpbmRleCArIGRlbHRhXTtcblx0XHRpZiAobmV4dCkge1xuXHRcdFx0dGhpcy5fZm9jdXNSb3cobmV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNFZGdlKGZpcnN0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm93cyA9IHRoaXMuX3Zpc2libGVSb3dzKCk7XG5cdFx0dGhpcy5fZm9jdXNSb3coZmlyc3QgPyByb3dzWzBdIDogcm93c1tyb3dzLmxlbmd0aCAtIDFdKTtcblx0fVxuXG5cdC8qKiBSaWdodCBhcnJvdzogZXhwYW5kIGEgY29sbGFwc2VkIHNldCwgb3IgbW92ZSBpbnRvIGl0cyBmaXJzdCBjaGlsZCB3aGVuIGFscmVhZHkgZXhwYW5kZWQuICovXG5cdHByaXZhdGUgX29uRXhwYW5kS2V5KHJvdzogSVRyZWVSb3cpOiBib29sZWFuIHtcblx0XHRpZiAocm93LmtpbmQgIT09ICdzZXQnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNFeHBhbmRlZChyb3cpKSB7XG5cdFx0XHR0aGlzLl9zZXRFeHBhbmRlZChyb3cudG9vbFNldElkLCB0cnVlKTtcblx0XHR9IGVsc2UgaWYgKHJvdy5jaGlsZHJlbiEubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9mb2N1c1Jvdyhyb3cuY2hpbGRyZW4hWzBdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKiogTGVmdCBhcnJvdzogY29sbGFwc2UgYW4gZXhwYW5kZWQgc2V0LCBvciBtb3ZlIGEgdG9vbCByb3cgdXAgdG8gaXRzIHBhcmVudCBzZXQuICovXG5cdHByaXZhdGUgX29uQ29sbGFwc2VLZXkocm93OiBJVHJlZVJvdyk6IGJvb2xlYW4ge1xuXHRcdGlmIChyb3cua2luZCA9PT0gJ3NldCcpIHtcblx0XHRcdGlmICh0aGlzLl9pc0V4cGFuZGVkKHJvdykpIHtcblx0XHRcdFx0dGhpcy5fc2V0RXhwYW5kZWQocm93LnRvb2xTZXRJZCwgZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fZm9jdXNSb3cocm93LnBhcmVudCEpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3VycmVudFN0YXRlKCk6IElUb29sRW5hYmxlbWVudFN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5hYmxlbWVudFNlcnZpY2UuZ2V0U3RhdGUodGhpcy5fc2Vzc2lvblR5cGUpO1xuXHR9XG5cblx0LyoqIFJlc29sdmUgdGhlIGluc3RhbGxlZCwgbm9uLWJ1aWx0aW4gZXh0ZW5zaW9uIGJhY2tpbmcgYW4gZXh0ZW5zaW9uLXByb3ZpZGVkIHRvb2wgc2V0LiAqL1xuXHRwcml2YXRlIF9yZXNvbHZlRXh0ZW5zaW9uRm9yVG9vbFNldCh0czogSVRvb2xTZXQpOiBJRXh0ZW5zaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodHMuc291cmNlLnR5cGUgIT09ICdleHRlbnNpb24nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2UgPSB0cy5zb3VyY2U7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5fZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChlID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGUuaWRlbnRpZmllci5pZCwgc291cmNlLmV4dGVuc2lvbklkKSk7XG5cdFx0aWYgKCFleHRlbnNpb24gfHwgZXh0ZW5zaW9uLmxvY2FsPy5pc0J1aWx0aW4pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBleHRlbnNpb247XG5cdH1cblxuXHRwcml2YXRlIF9vbkdhbGxlcnlDb250ZXh0TWVudShlOiBJTGlzdENvbnRleHRNZW51RXZlbnQ8SUV4dGVuc2lvbj4pOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb24gPSBlLmVsZW1lbnQ7XG5cdFx0aWYgKCFleHRlbnNpb24gfHwgZXh0ZW5zaW9uLnN0YXRlICE9PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQgfHwgZXh0ZW5zaW9uLmxvY2FsPy5pc0J1aWx0aW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2hvd0V4dGVuc2lvbkNvbnRleHRNZW51KGUuYW5jaG9yLCBleHRlbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0V4dGVuc2lvbkNvbnRleHRNZW51KGFuY2hvcjogSFRNTEVsZW1lbnQgfCBTdGFuZGFyZE1vdXNlRXZlbnQgfCBJQW5jaG9yLCBleHRlbnNpb246IElFeHRlbnNpb24pOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCB1bmluc3RhbGxBY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihcblx0XHRcdCd0b29sc0xpc3QudW5pbnN0YWxsRXh0ZW5zaW9uJyxcblx0XHRcdGxvY2FsaXplKCd1bmluc3RhbGxFeHRlbnNpb24nLCBcIlVuaW5zdGFsbCBFeHRlbnNpb25cIiksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0KCkgPT4gdGhpcy5fdW5pbnN0YWxsRXh0ZW5zaW9uKGV4dGVuc2lvbiksXG5cdFx0KSk7XG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IFt1bmluc3RhbGxBY3Rpb25dLFxuXHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91bmluc3RhbGxFeHRlbnNpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtVW5pbnN0YWxsVG9vbEV4dGVuc2lvbicsIFwiRG8geW91IHdhbnQgdG8gdW5pbnN0YWxsIHRoZSBleHRlbnNpb24gJ3swfSc/XCIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtVW5pbnN0YWxsVG9vbEV4dGVuc2lvbkRldGFpbCcsIFwiVGhpcyBleHRlbnNpb24gbWF5IGNvbnRyaWJ1dGUgbW9yZSB0aGFuIHRvb2xzLiBVbmluc3RhbGxpbmcgaXQgcmVtb3ZlcyBhbGwgb2YgaXRzIGNvbnRyaWJ1dGlvbnMuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ3VuaW5zdGFsbEV4dGVuc2lvbkJ0bicsIFwiVW5pbnN0YWxsIEV4dGVuc2lvblwiKSxcblx0XHRcdHR5cGU6ICdxdWVzdGlvbicsXG5cdFx0fSk7XG5cdFx0aWYgKHJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnVuaW5zdGFsbChleHRlbnNpb24pO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFRoZSBDb3BpbG90IENMSSdzIGJ1aWx0LWluIHRvb2xzLCBzdXJmYWNlZCByZWFkLW9ubHkgZm9yIHJlZmVyZW5jZS4gTWlycm9yZWQgZnJvbSB0aGUgcHVibGlzaGVkXG4gKiBcIlRvb2wgYXZhaWxhYmlsaXR5IHZhbHVlc1wiIHRhYmxlICh0aGUgU0RLIGRvZXMgbm90IGV4cG9zZSB0aGlzIGxpc3QgYXQgcnVudGltZSk7IGtlZXAgaW4gc3luYzpcbiAqIGh0dHBzOi8vZG9jcy5naXRodWIuY29tL2VuL2NvcGlsb3QvcmVmZXJlbmNlL2NvcGlsb3QtY2xpLXJlZmVyZW5jZS9jbGktY29tbWFuZC1yZWZlcmVuY2UjdG9vbC1hdmFpbGFiaWxpdHktdmFsdWVzXG4gKi9cbmNvbnN0IENPUElMT1RfQ0xJX1RPT0xTOiByZWFkb25seSB7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZyB9W10gPSBbXG5cdC8vIFNoZWxsIHRvb2xzXG5cdHsgbmFtZTogJ2Jhc2ggLyBwb3dlcnNoZWxsJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Q2xpVG9vbC5zaGVsbCcsIFwiRXhlY3V0ZSBjb21tYW5kc1wiKSB9LFxuXHR7IG5hbWU6ICdsaXN0X2Jhc2ggLyBsaXN0X3Bvd2Vyc2hlbGwnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvcGlsb3RDbGlUb29sLmxpc3RTaGVsbCcsIFwiTGlzdCBhY3RpdmUgc2hlbGwgc2Vzc2lvbnNcIikgfSxcblx0eyBuYW1lOiAncmVhZF9iYXNoIC8gcmVhZF9wb3dlcnNoZWxsJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Q2xpVG9vbC5yZWFkU2hlbGwnLCBcIlJlYWQgb3V0cHV0IGZyb20gYSBzaGVsbCBzZXNzaW9uXCIpIH0sXG5cdHsgbmFtZTogJ3N0b3BfYmFzaCAvIHN0b3BfcG93ZXJzaGVsbCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29waWxvdENsaVRvb2wuc3RvcFNoZWxsJywgXCJUZXJtaW5hdGUgYSBzaGVsbCBzZXNzaW9uXCIpIH0sXG5cdHsgbmFtZTogJ3dyaXRlX2Jhc2ggLyB3cml0ZV9wb3dlcnNoZWxsJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Q2xpVG9vbC53cml0ZVNoZWxsJywgXCJTZW5kIGlucHV0IHRvIGEgc2hlbGwgc2Vzc2lvblwiKSB9LFxuXHQvLyBGaWxlIG9wZXJhdGlvbiB0b29sc1xuXHR7IG5hbWU6ICdhcHBseV9wYXRjaCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29waWxvdENsaVRvb2wuYXBwbHlQYXRjaCcsIFwiQXBwbHkgcGF0Y2hlcyAodXNlZCBieSBzb21lIG1vZGVscyBpbnN0ZWFkIG9mIGVkaXQvY3JlYXRlKVwiKSB9LFxuXHR7IG5hbWU6ICdjcmVhdGUnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvcGlsb3RDbGlUb29sLmNyZWF0ZScsIFwiQ3JlYXRlIG5ldyBmaWxlc1wiKSB9LFxuXHR7IG5hbWU6ICdlZGl0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Q2xpVG9vbC5lZGl0JywgXCJFZGl0IGZpbGVzIHZpYSBzdHJpbmcgcmVwbGFjZW1lbnRcIikgfSxcblx0eyBuYW1lOiAndmlldycsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29waWxvdENsaVRvb2wudmlldycsIFwiUmVhZCBmaWxlcyBvciBkaXJlY3Rvcmllc1wiKSB9LFxuXHQvLyBBZ2VudCBhbmQgdGFzayBkZWxlZ2F0aW9uIHRvb2xzXG5cdHsgbmFtZTogJ2xpc3RfYWdlbnRzJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Q2xpVG9vbC5saXN0QWdlbnRzJywgXCJMaXN0IGF2YWlsYWJsZSBhZ2VudHNcIikgfSxcblx0eyBuYW1lOiAncmVhZF9hZ2VudCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29waWxvdENsaVRvb2wucmVhZEFnZW50JywgXCJDaGVjayBiYWNrZ3JvdW5kIGFnZW50IHN0YXR1c1wiKSB9LFxuXHR7IG5hbWU6ICd0YXNrJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Q2xpVG9vbC50YXNrJywgXCJSdW4gc3ViYWdlbnRzXCIpIH0sXG5cdC8vIE90aGVyIHRvb2xzXG5cdHsgbmFtZTogJ2Fza191c2VyJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Q2xpVG9vbC5hc2tVc2VyJywgXCJBc2sgdGhlIHVzZXIgYSBxdWVzdGlvblwiKSB9LFxuXHR7IG5hbWU6ICdnbG9iJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Q2xpVG9vbC5nbG9iJywgXCJGaW5kIGZpbGVzIG1hdGNoaW5nIHBhdHRlcm5zXCIpIH0sXG5cdHsgbmFtZTogJ2dyZXAgKG9yIHJnKScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29waWxvdENsaVRvb2wuZ3JlcCcsIFwiU2VhcmNoIGZvciB0ZXh0IGluIGZpbGVzXCIpIH0sXG5cdHsgbmFtZTogJ3NraWxsJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Q2xpVG9vbC5za2lsbCcsIFwiSW52b2tlIGN1c3RvbSBza2lsbHNcIikgfSxcblx0eyBuYW1lOiAnd2ViX2ZldGNoJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Q2xpVG9vbC53ZWJGZXRjaCcsIFwiRmV0Y2ggYW5kIHBhcnNlIHdlYiBjb250ZW50XCIpIH0sXG5dO1xuXG5jb25zdCBDVVNUT01fVE9PTF9TRVRfT1JERVI6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7XG5cdCdjb3BpbG90LWNsaSc6IDAsXG5cdCd2c2NvZGUtZ2VuZXJhbCc6IDEsXG5cdCd2c2NvZGUtdGFza3MnOiAyLFxuXHQndnNjb2RlLWJyb3dzZXInOiAzLFxuXHQndnNjb2RlLW5vdGVib29rcyc6IDQsXG59O1xuXG5mdW5jdGlvbiBzb3J0S2V5KHRvb2xTZXQ6IElUb29sU2V0KTogc3RyaW5nIHtcblx0Y29uc3Qgc291cmNlUHJpb3JpdHkgPSB0b29sU2V0LnNvdXJjZS50eXBlID09PSAnaW50ZXJuYWwnID8gJzAnIDogJzEnO1xuXHRjb25zdCBvcmRlciA9IENVU1RPTV9UT09MX1NFVF9PUkRFUlt0b29sU2V0LmlkXTtcblx0Y29uc3Qgb3JkZXJLZXkgPSBvcmRlciAhPT0gdW5kZWZpbmVkID8gU3RyaW5nKG9yZGVyKSA6IGA5LSR7dG9vbFNldC5kZXNjcmlwdGlvbiA/PyB0b29sU2V0LnJlZmVyZW5jZU5hbWV9YDtcblx0cmV0dXJuIGAke3NvdXJjZVByaW9yaXR5fS0ke29yZGVyS2V5fWA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxVQUFVLHdCQUF3QjtBQUMzQyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQWlCLGtDQUFrQztBQUNuRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxTQUFTLFNBQStCLDJCQUEyQix1QkFBdUI7QUFDbkcsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQix1QkFBdUIsNkJBQTZCO0FBQ2xGLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZ0JBQTRCLG1DQUFtQztBQUN4RSxTQUFTLHlCQUF5QiwyQkFBaUQ7QUFDbkYsU0FBUyw0QkFBaUQsc0JBQXNCO0FBQ2hGLFNBQVMsZ0NBQWdDLG9CQUFvQixvQ0FBb0MsMEJBQWdEO0FBQ2pKLE9BQU87QUFFUCxNQUFNLElBQUksSUFB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
