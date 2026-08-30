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
import "./media/mcpServerEditor.css";
import { $, append, clearNode, setParentFlowTo } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Action } from "../../../../base/common/actions.js";
import * as arrays from "../../../../base/common/arrays.js";
import { Cache } from "../../../../base/common/cache.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas, matchesScheme } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { TokenizationRegistry } from "../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { generateTokensCSSForColorMap } from "../../../../editor/common/languages/supports/tokenization.js";
import { localize } from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from "../../markdown/browser/markdownDocumentRenderer.js";
import { IWebviewService } from "../../webview/browser/webview.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IMcpWorkbenchService, McpServerContainers, McpServerInstallState } from "../common/mcpTypes.js";
import { StarredWidget, McpServerIconWidget, McpServerStatusWidget, McpServerWidget, onClick, PublisherWidget, McpServerScopeBadgeWidget, LicenseWidget } from "./mcpServerWidgets.js";
import { ButtonWithDropDownExtensionAction, ButtonWithDropdownExtensionActionViewItem, DisableMcpDropDownAction, DropDownAction, EnableMcpDropDownAction, InstallAction, InstallingLabelAction, InstallInRemoteAction, InstallInWorkspaceAction, ManageMcpServerAction, McpServerStatusAction, UninstallAction } from "./mcpServerActions.js";
import { McpServerType } from "../../../../platform/mcp/common/mcpPlatformTypes.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { getMcpGalleryManifestResourceUri, IMcpGalleryManifestService, McpGalleryResourceType } from "../../../../platform/mcp/common/mcpGalleryManifest.js";
import { fromNow } from "../../../../base/common/date.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
var McpServerEditorTab = /* @__PURE__ */ ((McpServerEditorTab2) => {
  McpServerEditorTab2["Readme"] = "readme";
  McpServerEditorTab2["Configuration"] = "configuration";
  McpServerEditorTab2["Manifest"] = "manifest";
  return McpServerEditorTab2;
})(McpServerEditorTab || {});
class NavBar extends Disposable {
  constructor(container) {
    super();
    this._onChange = this._register(new Emitter());
    this._currentId = null;
    const element = append(container, $(".navbar"));
    this.actions = [];
    this.actionbar = this._register(new ActionBar(element));
  }
  get onChange() {
    return this._onChange.event;
  }
  get currentId() {
    return this._currentId;
  }
  push(id, label, tooltip, index) {
    const action = new Action(id, label, void 0, true, () => this.update(id, true));
    action.tooltip = tooltip;
    if (typeof index === "number") {
      this.actions.splice(index, 0, action);
    } else {
      this.actions.push(action);
    }
    this.actionbar.push(action, { index });
    if (this.actions.length === 1) {
      this.update(id);
    }
  }
  remove(id) {
    const index = this.actions.findIndex((action) => action.id === id);
    if (index !== -1) {
      this.actions.splice(index, 1);
      this.actionbar.pull(index);
      if (this._currentId === id) {
        this.switch(this.actions[0]?.id);
      }
    }
  }
  clear() {
    this.actions = dispose(this.actions);
    this.actionbar.clear();
  }
  switch(id) {
    const action = this.actions.find((action2) => action2.id === id);
    if (action) {
      action.run();
      return true;
    }
    return false;
  }
  has(id) {
    return this.actions.some((action) => action.id === id);
  }
  update(id, focus) {
    this._currentId = id;
    this._onChange.fire({ id, focus: !!focus });
    this.actions.forEach((a) => a.checked = a.id === id);
  }
}
var WebviewIndex = /* @__PURE__ */ ((WebviewIndex2) => {
  WebviewIndex2[WebviewIndex2["Readme"] = 0] = "Readme";
  WebviewIndex2[WebviewIndex2["Changelog"] = 1] = "Changelog";
  return WebviewIndex2;
})(WebviewIndex || {});
let McpServerEditor = class extends EditorPane {
  constructor(group, telemetryService, instantiationService, themeService, notificationService, openerService, storageService, extensionService, webviewService, languageService, contextKeyService, mcpWorkbenchService, hoverService, contextMenuService) {
    super(McpServerEditor.ID, group, telemetryService, themeService, storageService);
    this.instantiationService = instantiationService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.extensionService = extensionService;
    this.webviewService = webviewService;
    this.languageService = languageService;
    this.contextKeyService = contextKeyService;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.hoverService = hoverService;
    this.contextMenuService = contextMenuService;
    this._scopedContextKeyService = this._register(new MutableDisposable());
    // Some action bar items use a webview whose vertical scroll position we track in this map
    this.initialScrollProgress = /* @__PURE__ */ new Map();
    // Spot when an ExtensionEditor instance gets reused for a different extension, in which case the vertical scroll positions must be zeroed
    this.currentIdentifier = "";
    this.layoutParticipants = [];
    this.contentDisposables = this._register(new DisposableStore());
    this.transientDisposables = this._register(new DisposableStore());
    this.activeElement = null;
    this.mcpServerReadme = null;
    this.mcpServerManifest = null;
  }
  get scopedContextKeyService() {
    return this._scopedContextKeyService.value;
  }
  createEditor(parent) {
    const root = append(parent, $(".extension-editor.mcp-server-editor"));
    this._scopedContextKeyService.value = this.contextKeyService.createScoped(root);
    this._scopedContextKeyService.value.createKey("inExtensionEditor", true);
    root.tabIndex = 0;
    root.style.outline = "none";
    root.setAttribute("role", "document");
    const header = append(root, $(".header"));
    const iconContainer = append(header, $(".icon-container"));
    const iconWidget = this.instantiationService.createInstance(McpServerIconWidget, iconContainer);
    const scopeWidget = this.instantiationService.createInstance(McpServerScopeBadgeWidget, iconContainer);
    const details = append(header, $(".details"));
    const title = append(details, $(".title"));
    const name = append(title, $("span.name.clickable", { role: "heading", tabIndex: 0 }));
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), name, localize("name", "Extension name")));
    const subtitle = append(details, $(".subtitle"));
    const subTitleEntryContainers = [];
    const publisherContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(publisherContainer);
    const publisherWidget = this.instantiationService.createInstance(PublisherWidget, publisherContainer, false);
    const starredContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(starredContainer);
    const installCountWidget = this.instantiationService.createInstance(StarredWidget, starredContainer, false);
    const licenseContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(licenseContainer);
    const licenseWidget = this.instantiationService.createInstance(LicenseWidget, licenseContainer);
    const widgets = [
      iconWidget,
      publisherWidget,
      installCountWidget,
      scopeWidget,
      licenseWidget
    ];
    const description = append(details, $(".description"));
    const actions = [
      this.instantiationService.createInstance(InstallAction, false),
      this.instantiationService.createInstance(InstallingLabelAction),
      this.instantiationService.createInstance(ButtonWithDropDownExtensionAction, "extensions.uninstall", UninstallAction.CLASS, [
        [
          this.instantiationService.createInstance(UninstallAction),
          this.instantiationService.createInstance(InstallInWorkspaceAction, false),
          this.instantiationService.createInstance(InstallInRemoteAction, false)
        ]
      ]),
      this.instantiationService.createInstance(EnableMcpDropDownAction),
      this.instantiationService.createInstance(DisableMcpDropDownAction),
      this.instantiationService.createInstance(ManageMcpServerAction, true)
    ];
    const actionsAndStatusContainer = append(details, $(".actions-status-container.mcp-server-actions"));
    const actionBar = this._register(new ActionBar(actionsAndStatusContainer, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof DropDownAction) {
          return action.createActionViewItem(options);
        }
        if (action instanceof ButtonWithDropDownExtensionAction) {
          return new ButtonWithDropdownExtensionActionViewItem(
            action,
            {
              ...options,
              icon: true,
              label: true,
              menuActionsOrProvider: { getActions: () => action.menuActions },
              menuActionClassNames: action.menuActionClassNames
            },
            this.contextMenuService
          );
        }
        return void 0;
      },
      focusOnlyEnabledItems: true
    }));
    actionBar.push(actions, { icon: true, label: true });
    actionBar.setFocusable(true);
    this._register(Event.any(...actions.map((a) => Event.filter(a.onDidChange, (e) => e.enabled !== void 0)))(() => {
      actionBar.setFocusable(false);
      actionBar.setFocusable(true);
    }));
    const otherContainers = [];
    const mcpServerStatusAction = this.instantiationService.createInstance(McpServerStatusAction);
    const mcpServerStatusWidget = this._register(this.instantiationService.createInstance(McpServerStatusWidget, append(actionsAndStatusContainer, $(".status")), mcpServerStatusAction));
    this._register(Event.any(mcpServerStatusWidget.onDidRender)(() => {
      if (this.dimension) {
        this.layout(this.dimension);
      }
    }));
    otherContainers.push(mcpServerStatusAction, new class extends McpServerWidget {
      render() {
        actionsAndStatusContainer.classList.toggle("list-layout", this.mcpServer?.installState === McpServerInstallState.Installed);
      }
    }());
    const mcpServerContainers = this.instantiationService.createInstance(McpServerContainers, [...actions, ...widgets, ...otherContainers]);
    for (const disposable of [...actions, ...widgets, ...otherContainers, mcpServerContainers]) {
      this._register(disposable);
    }
    const onError = Event.chain(
      actionBar.onDidRun,
      ($2) => $2.map(({ error }) => error).filter((error) => !!error)
    );
    this._register(onError(this.onError, this));
    const body = append(root, $(".body"));
    const navbar = new NavBar(body);
    const content = append(body, $(".content"));
    content.id = generateUuid();
    this.template = {
      content,
      description,
      header,
      name,
      navbar,
      actionsAndStatusContainer,
      actionBar,
      set mcpServer(mcpServer) {
        mcpServerContainers.mcpServer = mcpServer;
        let lastNonEmptySubtitleEntryContainer;
        for (const subTitleEntryElement of subTitleEntryContainers) {
          subTitleEntryElement.classList.remove("last-non-empty");
          if (subTitleEntryElement.children.length > 0) {
            lastNonEmptySubtitleEntryContainer = subTitleEntryElement;
          }
        }
        if (lastNonEmptySubtitleEntryContainer) {
          lastNonEmptySubtitleEntryContainer.classList.add("last-non-empty");
        }
      }
    };
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    if (this.template) {
      await this.render(input.mcpServer, this.template, !!options?.preserveFocus);
    }
  }
  async render(mcpServer, template, preserveFocus) {
    this.activeElement = null;
    this.transientDisposables.clear();
    const token = this.transientDisposables.add(new CancellationTokenSource()).token;
    this.mcpServerReadme = new Cache(() => mcpServer.getReadme(token));
    this.mcpServerManifest = new Cache(() => mcpServer.getManifest(token));
    template.mcpServer = mcpServer;
    template.name.textContent = mcpServer.label;
    template.name.classList.toggle("clickable", !!mcpServer.gallery?.webUrl);
    template.description.textContent = mcpServer.description;
    if (mcpServer.gallery?.webUrl) {
      this.transientDisposables.add(onClick(template.name, () => this.openerService.open(URI.parse(mcpServer.gallery?.webUrl))));
    }
    this.renderNavbar(mcpServer, template, preserveFocus);
  }
  setOptions(options) {
    super.setOptions(options);
    if (options?.tab) {
      this.template?.navbar.switch(options.tab);
    }
  }
  renderNavbar(extension, template, preserveFocus) {
    template.content.innerText = "";
    template.navbar.clear();
    if (this.currentIdentifier !== extension.id) {
      this.initialScrollProgress.clear();
      this.currentIdentifier = extension.id;
    }
    if (extension.readmeUrl || extension.gallery?.readme) {
      template.navbar.push("readme" /* Readme */, localize("details", "Details"), localize("detailstooltip", "Extension details, rendered from the extension's 'README.md' file"));
    }
    if (extension.gallery || extension.local?.manifest) {
      template.navbar.push("manifest" /* Manifest */, localize("manifest", "Manifest"), localize("manifesttooltip", "Server manifest details"));
    }
    if (extension.config) {
      template.navbar.push("configuration" /* Configuration */, localize("configuration", "Configuration"), localize("configurationtooltip", "Server configuration details"));
    }
    this.transientDisposables.add(this.mcpWorkbenchService.onChange((e) => {
      if (e === extension) {
        if (e.config && !template.navbar.has("configuration" /* Configuration */)) {
          template.navbar.push("configuration" /* Configuration */, localize("configuration", "Configuration"), localize("configurationtooltip", "Server configuration details"), extension.readmeUrl ? 1 : 0);
        }
        if (!e.config && template.navbar.has("configuration" /* Configuration */)) {
          template.navbar.remove("configuration" /* Configuration */);
        }
      }
    }));
    if (this.options?.tab) {
      template.navbar.switch(this.options.tab);
    }
    if (template.navbar.currentId) {
      this.onNavbarChange(extension, { id: template.navbar.currentId, focus: !preserveFocus }, template);
    }
    template.navbar.onChange((e) => this.onNavbarChange(extension, e, template), this, this.transientDisposables);
  }
  clearInput() {
    this.contentDisposables.clear();
    this.transientDisposables.clear();
    super.clearInput();
  }
  focus() {
    super.focus();
    this.activeElement?.focus();
  }
  showFind() {
    this.activeWebview?.showFind();
  }
  runFindAction(previous) {
    this.activeWebview?.runFindAction(previous);
  }
  get activeWebview() {
    if (!this.activeElement || !this.activeElement.runFindAction) {
      return void 0;
    }
    return this.activeElement;
  }
  onNavbarChange(extension, { id, focus }, template) {
    this.contentDisposables.clear();
    template.content.innerText = "";
    this.activeElement = null;
    if (id) {
      const cts = new CancellationTokenSource();
      this.contentDisposables.add(toDisposable(() => cts.dispose(true)));
      this.open(id, extension, template, cts.token).then((activeElement) => {
        if (cts.token.isCancellationRequested) {
          return;
        }
        this.activeElement = activeElement;
        if (focus) {
          this.focus();
        }
      });
    }
  }
  open(id, extension, template, token) {
    switch (id) {
      case "configuration" /* Configuration */:
        return this.openConfiguration(extension, template, token);
      case "readme" /* Readme */:
        return this.openDetails(extension, template, token);
      case "manifest" /* Manifest */:
        return extension.readmeUrl ? this.openManifest(extension, template.content, token) : this.openManifestWithAdditionalDetails(extension, template, token);
    }
    return Promise.resolve(null);
  }
  async openMarkdown(extension, cacheResult, noContentCopy, container, webviewIndex, title, token) {
    try {
      const body = await this.renderMarkdown(extension, cacheResult, container, token);
      if (token.isCancellationRequested) {
        return Promise.resolve(null);
      }
      const webview = this.contentDisposables.add(this.webviewService.createWebviewOverlay({
        title,
        options: {
          enableFindWidget: true,
          tryRestoreScrollPosition: true,
          disableServiceWorker: true
        },
        contentOptions: {},
        extension: void 0
      }));
      webview.initialScrollProgress = this.initialScrollProgress.get(webviewIndex) || 0;
      webview.claim(this, this.window, this.scopedContextKeyService);
      setParentFlowTo(webview.container, container);
      webview.setAnchorElement(container);
      webview.setHtml(body);
      webview.claim(this, this.window, void 0);
      this.contentDisposables.add(webview.onDidFocus(() => this._onDidFocus?.fire()));
      this.contentDisposables.add(webview.onDidScroll(() => this.initialScrollProgress.set(webviewIndex, webview.initialScrollProgress)));
      const removeLayoutParticipant = arrays.insert(this.layoutParticipants, {
        layout: () => {
          webview.setAnchorElement(container);
        }
      });
      this.contentDisposables.add(toDisposable(removeLayoutParticipant));
      let isDisposed = false;
      this.contentDisposables.add(toDisposable(() => {
        isDisposed = true;
      }));
      this.contentDisposables.add(this.themeService.onDidColorThemeChange(async () => {
        const body2 = await this.renderMarkdown(extension, cacheResult, container);
        if (!isDisposed) {
          webview.setHtml(body2);
        }
      }));
      this.contentDisposables.add(webview.onDidClickLink((link) => {
        if (!link) {
          return;
        }
        if (matchesScheme(link, Schemas.http) || matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.mailto)) {
          this.openerService.open(link);
        }
      }));
      return webview;
    } catch (e) {
      const p = append(container, $("p.nocontent"));
      p.textContent = noContentCopy;
      return p;
    }
  }
  async renderMarkdown(extension, cacheResult, container, token) {
    const contents = await this.loadContents(() => cacheResult, container);
    if (token?.isCancellationRequested) {
      return "";
    }
    const content = await renderMarkdownDocument(contents, this.extensionService, this.languageService, {}, token);
    if (token?.isCancellationRequested) {
      return "";
    }
    return this.renderBody(content);
  }
  renderBody(body) {
    const nonce = generateUuid();
    const colorMap = TokenizationRegistry.getColorMap();
    const css = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
    return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; script-src 'none'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}

					/* prevent scroll-to-top button from blocking the body text */
					body {
						padding-bottom: 75px;
					}

					#scroll-to-top {
						position: fixed;
						width: 32px;
						height: 32px;
						right: 25px;
						bottom: 25px;
						background-color: var(--vscode-button-secondaryBackground);
						border-color: var(--vscode-button-border);
						border-radius: 50%;
						cursor: pointer;
						box-shadow: 1px 1px 1px rgba(0,0,0,.25);
						outline: none;
						display: flex;
						justify-content: center;
						align-items: center;
					}

					#scroll-to-top:hover {
						background-color: var(--vscode-button-secondaryHoverBackground);
						box-shadow: 2px 2px 2px rgba(0,0,0,.25);
					}

					body.vscode-high-contrast #scroll-to-top {
						border-width: 2px;
						border-style: solid;
						box-shadow: none;
					}

					#scroll-to-top span.icon::before {
						content: "";
						display: block;
						background: var(--vscode-button-secondaryForeground);
						/* Chevron up icon */
						webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						-webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						width: 16px;
						height: 16px;
					}
					${css}
				</style>
			</head>
			<body>
				<a id="scroll-to-top" role="button" aria-label="scroll to top" href="#"><span class="icon"></span></a>
				${body}
			</body>
		</html>`;
  }
  async openDetails(extension, template, token) {
    const details = append(template.content, $(".details"));
    const readmeContainer = append(details, $(".content-container"));
    const additionalDetailsContainer = append(details, $(".additional-details-container"));
    const layout = () => details.classList.toggle("narrow", this.dimension && this.dimension.width < 500);
    layout();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    const activeElement = await this.openMarkdown(extension, this.mcpServerReadme.get(), localize("noReadme", "No README available."), readmeContainer, 0 /* Readme */, localize("Readme title", "Readme"), token);
    this.renderAdditionalDetails(additionalDetailsContainer, extension);
    return activeElement;
  }
  async openConfiguration(mcpServer, template, token) {
    const configContainer = append(template.content, $(".configuration"));
    const content = $("div", { class: "configuration-content" });
    this.renderConfigurationDetails(content, mcpServer);
    const scrollableContent = new DomScrollableElement(content, {});
    const layout = () => scrollableContent.scanDomNode();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    append(configContainer, scrollableContent.getDomNode());
    return { focus: () => content.focus() };
  }
  async openManifestWithAdditionalDetails(mcpServer, template, token) {
    const details = append(template.content, $(".details"));
    const readmeContainer = append(details, $(".content-container"));
    const additionalDetailsContainer = append(details, $(".additional-details-container"));
    const layout = () => details.classList.toggle("narrow", this.dimension && this.dimension.width < 500);
    layout();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    const activeElement = await this.openManifest(mcpServer, readmeContainer, token);
    this.renderAdditionalDetails(additionalDetailsContainer, mcpServer);
    return activeElement;
  }
  async openManifest(mcpServer, parent, token) {
    const manifestContainer = append(parent, $(".manifest"));
    const content = $("div", { class: "manifest-content" });
    try {
      const manifest = await this.loadContents(() => this.mcpServerManifest.get(), content);
      if (token.isCancellationRequested) {
        return null;
      }
      this.renderManifestDetails(content, manifest);
    } catch (error) {
      while (content.firstChild) {
        content.removeChild(content.firstChild);
      }
      const noManifestMessage = append(content, $(".no-manifest"));
      noManifestMessage.textContent = localize("noManifest", "No manifest available for this MCP server.");
    }
    const scrollableContent = new DomScrollableElement(content, {});
    const layout = () => scrollableContent.scanDomNode();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    append(manifestContainer, scrollableContent.getDomNode());
    return { focus: () => content.focus() };
  }
  renderConfigurationDetails(container, mcpServer) {
    clearNode(container);
    const config = mcpServer.config;
    if (!config) {
      const noConfigMessage = append(container, $(".no-config"));
      noConfigMessage.textContent = localize("noConfig", "No configuration available for this MCP server.");
      return;
    }
    const nameSection = append(container, $(".config-section"));
    const nameLabel = append(nameSection, $(".config-label"));
    nameLabel.textContent = localize("serverName", "Name:");
    const nameValue = append(nameSection, $(".config-value"));
    nameValue.textContent = mcpServer.name;
    const typeSection = append(container, $(".config-section"));
    const typeLabel = append(typeSection, $(".config-label"));
    typeLabel.textContent = localize("serverType", "Type:");
    const typeValue = append(typeSection, $(".config-value"));
    typeValue.textContent = config.type;
    if (config.type === McpServerType.LOCAL) {
      const commandSection = append(container, $(".config-section"));
      const commandLabel = append(commandSection, $(".config-label"));
      commandLabel.textContent = localize("command", "Command:");
      const commandValue = append(commandSection, $("code.config-value"));
      commandValue.textContent = config.command;
      if (config.args && config.args.length > 0) {
        const argsSection = append(container, $(".config-section"));
        const argsLabel = append(argsSection, $(".config-label"));
        argsLabel.textContent = localize("arguments", "Arguments:");
        const argsValue = append(argsSection, $("code.config-value"));
        argsValue.textContent = config.args.join(" ");
      }
      if (config.env && Object.keys(config.env).length > 0) {
        const envSection = append(container, $(".config-section"));
        const envLabel = append(envSection, $(".config-label"));
        envLabel.textContent = localize("environment", "Environment:");
        const envValue = append(envSection, $(".config-value"));
        for (const [key, value] of Object.entries(config.env)) {
          append(envValue, $("code.env-entry", void 0, `${key}=${value ?? ""}`));
        }
      }
      if (config.envFile) {
        const envFileSection = append(container, $(".config-section"));
        const envFileLabel = append(envFileSection, $(".config-label"));
        envFileLabel.textContent = localize("envFile", "Environment File:");
        const envFileValue = append(envFileSection, $("code.config-value"));
        envFileValue.textContent = config.envFile;
      }
    } else if (config.type === McpServerType.REMOTE) {
      const urlSection = append(container, $(".config-section"));
      const urlLabel = append(urlSection, $(".config-label"));
      urlLabel.textContent = localize("url", "URL:");
      const urlValue = append(urlSection, $("code.config-value"));
      urlValue.textContent = config.url;
      if (config.headers && Object.keys(config.headers).length > 0) {
        const headersSection = append(container, $(".config-section"));
        const headersLabel = append(headersSection, $(".config-label"));
        headersLabel.textContent = localize("headers", "Headers:");
        const headersValue = append(headersSection, $(".config-value"));
        for (const [key, value] of Object.entries(config.headers)) {
          append(headersValue, $("code.env-entry", void 0, `${key}: ${value ?? ""}`));
        }
      }
    }
  }
  renderManifestDetails(container, manifest) {
    clearNode(container);
    if (manifest.packages && manifest.packages.length > 0) {
      const packagesByType = /* @__PURE__ */ new Map();
      for (const pkg of manifest.packages) {
        const type = pkg.registryType;
        let packages = packagesByType.get(type);
        if (!packages) {
          packagesByType.set(type, packages = []);
        }
        packages.push(pkg);
      }
      append(container, $(".manifest-section", void 0, $(".manifest-section-title", void 0, localize("packages", "Packages"))));
      for (const [packageType, packages] of packagesByType) {
        const packageSection = append(container, $(".package-section", void 0, $(".package-section-title", void 0, packageType.toUpperCase())));
        const packagesGrid = append(packageSection, $(".package-details"));
        for (let i = 0; i < packages.length; i++) {
          const pkg = packages[i];
          append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("packageName", "Package:")), $(".detail-value", void 0, pkg.identifier)));
          if (pkg.packageArguments && pkg.packageArguments.length > 0) {
            const argStrings = [];
            for (const arg of pkg.packageArguments) {
              if (arg.type === "named") {
                argStrings.push(arg.name);
                if (arg.value) {
                  argStrings.push(arg.value);
                }
              }
              if (arg.type === "positional") {
                const val = arg.value ?? arg.valueHint;
                if (val) {
                  argStrings.push(val);
                }
              }
            }
            append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("packagearguments", "Package Arguments:")), $("code.detail-value", void 0, argStrings.join(" "))));
          }
          if (pkg.runtimeArguments && pkg.runtimeArguments.length > 0) {
            const argStrings = [];
            for (const arg of pkg.runtimeArguments) {
              if (arg.type === "named") {
                argStrings.push(arg.name);
                if (arg.value) {
                  argStrings.push(arg.value);
                }
              }
              if (arg.type === "positional") {
                const val = arg.value ?? arg.valueHint;
                if (val) {
                  argStrings.push(val);
                }
              }
            }
            append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("runtimeargs", "Runtime Arguments:")), $("code.detail-value", void 0, argStrings.join(" "))));
          }
          if (pkg.environmentVariables && pkg.environmentVariables.length > 0) {
            const envStrings = pkg.environmentVariables.map((envVar) => `${envVar.name}=${envVar.value ?? ""}`);
            append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("environmentVariables", "Environment Variables:")), $("code.detail-value", void 0, envStrings.join(" "))));
          }
          if (i < packages.length - 1) {
            append(packagesGrid, $(".package-separator"));
          }
        }
      }
    }
    if (manifest.remotes && manifest.remotes.length > 0) {
      const packageSection = append(container, $(".package-section", void 0, $(".package-section-title", void 0, localize("remotes", "Remote").toLocaleUpperCase())));
      for (const remote of manifest.remotes) {
        const packagesGrid = append(packageSection, $(".package-details"));
        append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("url", "URL:")), $(".detail-value", void 0, remote.url)));
        if (remote.type) {
          append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("transport", "Transport:")), $(".detail-value", void 0, remote.type)));
        }
        if (remote.headers && remote.headers.length > 0) {
          const headerStrings = remote.headers.map((header) => `${header.name}: ${header.value ?? ""}`);
          append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("headers", "Headers:")), $(".detail-value", void 0, headerStrings.join(", "))));
        }
      }
    }
  }
  renderAdditionalDetails(container, extension) {
    const content = $("div", { class: "additional-details-content", tabindex: "0" });
    const scrollableContent = new DomScrollableElement(content, {});
    const layout = () => scrollableContent.scanDomNode();
    const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
    this.contentDisposables.add(toDisposable(removeLayoutParticipant));
    this.contentDisposables.add(scrollableContent);
    this.contentDisposables.add(this.instantiationService.createInstance(AdditionalDetailsWidget, content, extension));
    append(container, scrollableContent.getDomNode());
    scrollableContent.scanDomNode();
  }
  loadContents(loadingTask, container) {
    container.classList.add("loading");
    const result = this.contentDisposables.add(loadingTask());
    const onDone = () => container.classList.remove("loading");
    result.promise.then(onDone, onDone);
    return result.promise;
  }
  layout(dimension) {
    this.dimension = dimension;
    this.layoutParticipants.forEach((p) => p.layout());
  }
  onError(err) {
    if (isCancellationError(err)) {
      return;
    }
    this.notificationService.error(err);
  }
};
McpServerEditor.ID = "workbench.editor.mcpServer";
McpServerEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IWebviewService),
  __decorateParam(9, ILanguageService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IMcpWorkbenchService),
  __decorateParam(12, IHoverService),
  __decorateParam(13, IContextMenuService)
], McpServerEditor);
let AdditionalDetailsWidget = class extends Disposable {
  constructor(container, extension, mcpGalleryManifestService, hoverService, openerService) {
    super();
    this.container = container;
    this.mcpGalleryManifestService = mcpGalleryManifestService;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.disposables = this._register(new DisposableStore());
    this.render(extension);
    this._register(this.mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => this.render(extension)));
  }
  render(extension) {
    this.container.innerText = "";
    this.disposables.clear();
    if (extension.local) {
      this.renderInstallInfo(this.container, extension.local);
    }
    if (extension.gallery) {
      this.renderMarketplaceInfo(this.container, extension);
    }
    this.renderTags(this.container, extension);
    this.renderExtensionResources(this.container, extension);
  }
  renderTags(container, extension) {
    if (extension.gallery?.topics?.length) {
      const categoriesContainer = append(container, $(".categories-container.additional-details-element"));
      append(categoriesContainer, $(".additional-details-title", void 0, localize("tags", "Tags")));
      const categoriesElement = append(categoriesContainer, $(".categories"));
      for (const category of extension.gallery.topics) {
        append(categoriesElement, $("span.category", { tabindex: "0" }, category));
      }
    }
  }
  async renderExtensionResources(container, extension) {
    const resources = [];
    const manifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
    if (extension.repository) {
      try {
        resources.push([localize("repository", "Repository"), ThemeIcon.fromId(Codicon.repo.id), URI.parse(extension.repository)]);
      } catch (error) {
      }
    }
    if (manifest) {
      const supportUri = getMcpGalleryManifestResourceUri(manifest, McpGalleryResourceType.ContactSupportUri);
      if (supportUri) {
        try {
          resources.push([localize("support", "Contact Support"), ThemeIcon.fromId(Codicon.commentDiscussion.id), URI.parse(supportUri)]);
        } catch (error) {
        }
      }
    }
    if (resources.length) {
      const extensionResourcesContainer = append(container, $(".resources-container.additional-details-element"));
      append(extensionResourcesContainer, $(".additional-details-title", void 0, localize("resources", "Resources")));
      const resourcesElement = append(extensionResourcesContainer, $(".resources"));
      for (const [label, icon, uri] of resources) {
        const resourceElement = append(resourcesElement, $(".resource"));
        append(resourceElement, $(ThemeIcon.asCSSSelector(icon)));
        append(resourceElement, $("a", { tabindex: "0" }, label));
        this.disposables.add(onClick(resourceElement, () => this.openerService.open(uri)));
        this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), resourceElement, uri.toString()));
      }
    }
  }
  renderInstallInfo(container, extension) {
    const installInfoContainer = append(container, $(".more-info-container.additional-details-element"));
    append(installInfoContainer, $(".additional-details-title", void 0, localize("Install Info", "Installation")));
    const installInfo = append(installInfoContainer, $(".more-info"));
    append(
      installInfo,
      $(
        ".more-info-entry",
        void 0,
        $("div.more-info-entry-name", void 0, localize("id", "Identifier")),
        $("code", void 0, extension.name)
      )
    );
    if (extension.version) {
      append(
        installInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("Version", "Version")),
          $("code", void 0, extension.version)
        )
      );
    }
  }
  renderMarketplaceInfo(container, extension) {
    const gallery = extension.gallery;
    const moreInfoContainer = append(container, $(".more-info-container.additional-details-element"));
    append(moreInfoContainer, $(".additional-details-title", void 0, localize("Marketplace Info", "Marketplace")));
    const moreInfo = append(moreInfoContainer, $(".more-info"));
    if (gallery) {
      if (!extension.local) {
        append(
          moreInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", void 0, localize("id", "Identifier")),
            $("code", void 0, extension.name)
          )
        );
        if (gallery.version) {
          append(
            moreInfo,
            $(
              ".more-info-entry",
              void 0,
              $("div.more-info-entry-name", void 0, localize("Version", "Version")),
              $("code", void 0, gallery.version)
            )
          );
        }
      }
      if (gallery.lastUpdated) {
        append(
          moreInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", void 0, localize("last updated", "Last Released")),
            $("div", {
              "title": new Date(gallery.lastUpdated).toString()
            }, fromNow(gallery.lastUpdated, true, true, true))
          )
        );
      }
      if (gallery.publishDate) {
        append(
          moreInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", void 0, localize("published", "Published")),
            $("div", {
              "title": new Date(gallery.publishDate).toString()
            }, fromNow(gallery.publishDate, true, true, true))
          )
        );
      }
    }
  }
};
AdditionalDetailsWidget = __decorateClass([
  __decorateParam(2, IMcpGalleryManifestService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IOpenerService)
], AdditionalDetailsWidget);
export {
  McpServerEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwU2VydmVyRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL21jcFNlcnZlckVkaXRvci5jc3MnO1xuaW1wb3J0IHsgJCwgRGltZW5zaW9uLCBhcHBlbmQsIGNsZWFyTm9kZSwgc2V0UGFyZW50Rmxvd1RvIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhY2hlLCBDYWNoZVJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhY2hlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMsIG1hdGNoZXNTY2hlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy90b2tlbml6YXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IERFRkFVTFRfTUFSS0RPV05fU1RZTEVTLCByZW5kZXJNYXJrZG93bkRvY3VtZW50IH0gZnJvbSAnLi4vLi4vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93bkRvY3VtZW50UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXcsIElXZWJ2aWV3U2VydmljZSB9IGZyb20gJy4uLy4uL3dlYnZpZXcvYnJvd3Nlci93ZWJ2aWV3LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZlckNvbnRhaW5lciwgSU1jcFNlcnZlckVkaXRvck9wdGlvbnMsIElNY3BXb3JrYmVuY2hTZXJ2aWNlLCBJV29ya2JlbmNoTWNwU2VydmVyLCBNY3BTZXJ2ZXJDb250YWluZXJzLCBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgU3RhcnJlZFdpZGdldCwgTWNwU2VydmVySWNvbldpZGdldCwgTWNwU2VydmVyU3RhdHVzV2lkZ2V0LCBNY3BTZXJ2ZXJXaWRnZXQsIG9uQ2xpY2ssIFB1Ymxpc2hlcldpZGdldCwgTWNwU2VydmVyU2NvcGVCYWRnZVdpZGdldCwgTGljZW5zZVdpZGdldCB9IGZyb20gJy4vbWNwU2VydmVyV2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBCdXR0b25XaXRoRHJvcERvd25FeHRlbnNpb25BY3Rpb24sIEJ1dHRvbldpdGhEcm9wZG93bkV4dGVuc2lvbkFjdGlvblZpZXdJdGVtLCBEaXNhYmxlTWNwRHJvcERvd25BY3Rpb24sIERyb3BEb3duQWN0aW9uLCBFbmFibGVNY3BEcm9wRG93bkFjdGlvbiwgSW5zdGFsbEFjdGlvbiwgSW5zdGFsbGluZ0xhYmVsQWN0aW9uLCBJbnN0YWxsSW5SZW1vdGVBY3Rpb24sIEluc3RhbGxJbldvcmtzcGFjZUFjdGlvbiwgTWFuYWdlTWNwU2VydmVyQWN0aW9uLCBNY3BTZXJ2ZXJTdGF0dXNBY3Rpb24sIFVuaW5zdGFsbEFjdGlvbiB9IGZyb20gJy4vbWNwU2VydmVyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4vbWNwU2VydmVyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUxvY2FsTWNwU2VydmVyLCBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIElNY3BTZXJ2ZXJQYWNrYWdlLCBJTWNwU2VydmVyS2V5VmFsdWVJbnB1dCwgUmVnaXN0cnlUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZ2V0TWNwR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmksIElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLCBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BHYWxsZXJ5TWFuaWZlc3QuanMnO1xuaW1wb3J0IHsgZnJvbU5vdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuXG5jb25zdCBlbnVtIE1jcFNlcnZlckVkaXRvclRhYiB7XG5cdFJlYWRtZSA9ICdyZWFkbWUnLFxuXHRDb25maWd1cmF0aW9uID0gJ2NvbmZpZ3VyYXRpb24nLFxuXHRNYW5pZmVzdCA9ICdtYW5pZmVzdCcsXG59XG5cbmNsYXNzIE5hdkJhciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX29uQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogc3RyaW5nIHwgbnVsbDsgZm9jdXM6IGJvb2xlYW4gfT4oKSk7XG5cdGdldCBvbkNoYW5nZSgpOiBFdmVudDx7IGlkOiBzdHJpbmcgfCBudWxsOyBmb2N1czogYm9vbGVhbiB9PiB7IHJldHVybiB0aGlzLl9vbkNoYW5nZS5ldmVudDsgfVxuXG5cdHByaXZhdGUgX2N1cnJlbnRJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdGdldCBjdXJyZW50SWQoKTogc3RyaW5nIHwgbnVsbCB7IHJldHVybiB0aGlzLl9jdXJyZW50SWQ7IH1cblxuXHRwcml2YXRlIGFjdGlvbnM6IEFjdGlvbltdO1xuXHRwcml2YXRlIGFjdGlvbmJhcjogQWN0aW9uQmFyO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcubmF2YmFyJykpO1xuXHRcdHRoaXMuYWN0aW9ucyA9IFtdO1xuXHRcdHRoaXMuYWN0aW9uYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihlbGVtZW50KSk7XG5cdH1cblxuXHRwdXNoKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHRvb2x0aXA6IHN0cmluZywgaW5kZXg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb24gPSBuZXcgQWN0aW9uKGlkLCBsYWJlbCwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLnVwZGF0ZShpZCwgdHJ1ZSkpO1xuXG5cdFx0YWN0aW9uLnRvb2x0aXAgPSB0b29sdGlwO1xuXG5cdFx0aWYgKHR5cGVvZiBpbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMuYWN0aW9ucy5zcGxpY2UoaW5kZXgsIDAsIGFjdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYWN0aW9ucy5wdXNoKGFjdGlvbik7XG5cdFx0fVxuXHRcdHRoaXMuYWN0aW9uYmFyLnB1c2goYWN0aW9uLCB7IGluZGV4IH0pO1xuXG5cdFx0aWYgKHRoaXMuYWN0aW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHRoaXMudXBkYXRlKGlkKTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmUoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5hY3Rpb25zLmZpbmRJbmRleChhY3Rpb24gPT4gYWN0aW9uLmlkID09PSBpZCk7XG5cdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0dGhpcy5hY3Rpb25zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR0aGlzLmFjdGlvbmJhci5wdWxsKGluZGV4KTtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50SWQgPT09IGlkKSB7XG5cdFx0XHRcdHRoaXMuc3dpdGNoKHRoaXMuYWN0aW9uc1swXT8uaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aW9ucyA9IGRpc3Bvc2UodGhpcy5hY3Rpb25zKTtcblx0XHR0aGlzLmFjdGlvbmJhci5jbGVhcigpO1xuXHR9XG5cblx0c3dpdGNoKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmlkID09PSBpZCk7XG5cdFx0aWYgKGFjdGlvbikge1xuXHRcdFx0YWN0aW9uLnJ1bigpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGhhcyhpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9ucy5zb21lKGFjdGlvbiA9PiBhY3Rpb24uaWQgPT09IGlkKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKGlkOiBzdHJpbmcsIGZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnJlbnRJZCA9IGlkO1xuXHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBpZCwgZm9jdXM6ICEhZm9jdXMgfSk7XG5cdFx0dGhpcy5hY3Rpb25zLmZvckVhY2goYSA9PiBhLmNoZWNrZWQgPSBhLmlkID09PSBpZCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElMYXlvdXRQYXJ0aWNpcGFudCB7XG5cdGxheW91dCgpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSUFjdGl2ZUVsZW1lbnQge1xuXHRmb2N1cygpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSUV4dGVuc2lvbkVkaXRvclRlbXBsYXRlIHtcblx0bmFtZTogSFRNTEVsZW1lbnQ7XG5cdGRlc2NyaXB0aW9uOiBIVE1MRWxlbWVudDtcblx0YWN0aW9uc0FuZFN0YXR1c0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRuYXZiYXI6IE5hdkJhcjtcblx0Y29udGVudDogSFRNTEVsZW1lbnQ7XG5cdGhlYWRlcjogSFRNTEVsZW1lbnQ7XG5cdG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlcjtcbn1cblxuY29uc3QgZW51bSBXZWJ2aWV3SW5kZXgge1xuXHRSZWFkbWUsXG5cdENoYW5nZWxvZ1xufVxuXG5leHBvcnQgY2xhc3MgTWNwU2VydmVyRWRpdG9yIGV4dGVuZHMgRWRpdG9yUGFuZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnd29ya2JlbmNoLmVkaXRvci5tY3BTZXJ2ZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTY29wZWRDb250ZXh0S2V5U2VydmljZT4oKSk7XG5cdHByaXZhdGUgdGVtcGxhdGU6IElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIG1jcFNlcnZlclJlYWRtZTogQ2FjaGU8c3RyaW5nPiB8IG51bGw7XG5cdHByaXZhdGUgbWNwU2VydmVyTWFuaWZlc3Q6IENhY2hlPElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbj4gfCBudWxsO1xuXG5cdC8vIFNvbWUgYWN0aW9uIGJhciBpdGVtcyB1c2UgYSB3ZWJ2aWV3IHdob3NlIHZlcnRpY2FsIHNjcm9sbCBwb3NpdGlvbiB3ZSB0cmFjayBpbiB0aGlzIG1hcFxuXHRwcml2YXRlIGluaXRpYWxTY3JvbGxQcm9ncmVzczogTWFwPFdlYnZpZXdJbmRleCwgbnVtYmVyPiA9IG5ldyBNYXAoKTtcblxuXHQvLyBTcG90IHdoZW4gYW4gRXh0ZW5zaW9uRWRpdG9yIGluc3RhbmNlIGdldHMgcmV1c2VkIGZvciBhIGRpZmZlcmVudCBleHRlbnNpb24sIGluIHdoaWNoIGNhc2UgdGhlIHZlcnRpY2FsIHNjcm9sbCBwb3NpdGlvbnMgbXVzdCBiZSB6ZXJvZWRcblx0cHJpdmF0ZSBjdXJyZW50SWRlbnRpZmllcjogc3RyaW5nID0gJyc7XG5cblx0cHJpdmF0ZSBsYXlvdXRQYXJ0aWNpcGFudHM6IElMYXlvdXRQYXJ0aWNpcGFudFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSB0cmFuc2llbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgYWN0aXZlRWxlbWVudDogSUFjdGl2ZUVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBkaW1lbnNpb246IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJV2Vidmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3ZWJ2aWV3U2VydmljZTogSVdlYnZpZXdTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWNwV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFdvcmtiZW5jaFNlcnZpY2U6IElNY3BXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihNY3BTZXJ2ZXJFZGl0b3IuSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLm1jcFNlcnZlclJlYWRtZSA9IG51bGw7XG5cdFx0dGhpcy5tY3BTZXJ2ZXJNYW5pZmVzdCA9IG51bGw7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UudmFsdWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCByb290ID0gYXBwZW5kKHBhcmVudCwgJCgnLmV4dGVuc2lvbi1lZGl0b3IubWNwLXNlcnZlci1lZGl0b3InKSk7XG5cdFx0dGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UudmFsdWUgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChyb290KTtcblx0XHR0aGlzLl9zY29wZWRDb250ZXh0S2V5U2VydmljZS52YWx1ZS5jcmVhdGVLZXkoJ2luRXh0ZW5zaW9uRWRpdG9yJywgdHJ1ZSk7XG5cblx0XHRyb290LnRhYkluZGV4ID0gMDsgLy8gdGhpcyBpcyByZXF1aXJlZCBmb3IgdGhlIGZvY3VzIHRyYWNrZXIgb24gdGhlIGVkaXRvclxuXHRcdHJvb3Quc3R5bGUub3V0bGluZSA9ICdub25lJztcblx0XHRyb290LnNldEF0dHJpYnV0ZSgncm9sZScsICdkb2N1bWVudCcpO1xuXHRcdGNvbnN0IGhlYWRlciA9IGFwcGVuZChyb290LCAkKCcuaGVhZGVyJykpO1xuXG5cdFx0Y29uc3QgaWNvbkNvbnRhaW5lciA9IGFwcGVuZChoZWFkZXIsICQoJy5pY29uLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBpY29uV2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BTZXJ2ZXJJY29uV2lkZ2V0LCBpY29uQ29udGFpbmVyKTtcblx0XHRjb25zdCBzY29wZVdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwU2VydmVyU2NvcGVCYWRnZVdpZGdldCwgaWNvbkNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBkZXRhaWxzID0gYXBwZW5kKGhlYWRlciwgJCgnLmRldGFpbHMnKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBhcHBlbmQoZGV0YWlscywgJCgnLnRpdGxlJykpO1xuXHRcdGNvbnN0IG5hbWUgPSBhcHBlbmQodGl0bGUsICQoJ3NwYW4ubmFtZS5jbGlja2FibGUnLCB7IHJvbGU6ICdoZWFkaW5nJywgdGFiSW5kZXg6IDAgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBuYW1lLCBsb2NhbGl6ZSgnbmFtZScsIFwiRXh0ZW5zaW9uIG5hbWVcIikpKTtcblxuXHRcdGNvbnN0IHN1YnRpdGxlID0gYXBwZW5kKGRldGFpbHMsICQoJy5zdWJ0aXRsZScpKTtcblx0XHRjb25zdCBzdWJUaXRsZUVudHJ5Q29udGFpbmVyczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXG5cdFx0Y29uc3QgcHVibGlzaGVyQ29udGFpbmVyID0gYXBwZW5kKHN1YnRpdGxlLCAkKCcuc3VidGl0bGUtZW50cnknKSk7XG5cdFx0c3ViVGl0bGVFbnRyeUNvbnRhaW5lcnMucHVzaChwdWJsaXNoZXJDb250YWluZXIpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlcldpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHVibGlzaGVyV2lkZ2V0LCBwdWJsaXNoZXJDb250YWluZXIsIGZhbHNlKTtcblxuXHRcdGNvbnN0IHN0YXJyZWRDb250YWluZXIgPSBhcHBlbmQoc3VidGl0bGUsICQoJy5zdWJ0aXRsZS1lbnRyeScpKTtcblx0XHRzdWJUaXRsZUVudHJ5Q29udGFpbmVycy5wdXNoKHN0YXJyZWRDb250YWluZXIpO1xuXHRcdGNvbnN0IGluc3RhbGxDb3VudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RhcnJlZFdpZGdldCwgc3RhcnJlZENvbnRhaW5lciwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgbGljZW5zZUNvbnRhaW5lciA9IGFwcGVuZChzdWJ0aXRsZSwgJCgnLnN1YnRpdGxlLWVudHJ5JykpO1xuXHRcdHN1YlRpdGxlRW50cnlDb250YWluZXJzLnB1c2gobGljZW5zZUNvbnRhaW5lcik7XG5cdFx0Y29uc3QgbGljZW5zZVdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGljZW5zZVdpZGdldCwgbGljZW5zZUNvbnRhaW5lcik7XG5cblx0XHRjb25zdCB3aWRnZXRzOiBNY3BTZXJ2ZXJXaWRnZXRbXSA9IFtcblx0XHRcdGljb25XaWRnZXQsXG5cdFx0XHRwdWJsaXNoZXJXaWRnZXQsXG5cdFx0XHRpbnN0YWxsQ291bnRXaWRnZXQsXG5cdFx0XHRzY29wZVdpZGdldCxcblx0XHRcdGxpY2Vuc2VXaWRnZXRcblx0XHRdO1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhcHBlbmQoZGV0YWlscywgJCgnLmRlc2NyaXB0aW9uJykpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IFtcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEFjdGlvbiwgZmFsc2UpLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsaW5nTGFiZWxBY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCdXR0b25XaXRoRHJvcERvd25FeHRlbnNpb25BY3Rpb24sICdleHRlbnNpb25zLnVuaW5zdGFsbCcsIFVuaW5zdGFsbEFjdGlvbi5DTEFTUywgW1xuXHRcdFx0XHRbXG5cdFx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbmluc3RhbGxBY3Rpb24pLFxuXHRcdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEluV29ya3NwYWNlQWN0aW9uLCBmYWxzZSksXG5cdFx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsSW5SZW1vdGVBY3Rpb24sIGZhbHNlKVxuXHRcdFx0XHRdXG5cdFx0XHRdKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW5hYmxlTWNwRHJvcERvd25BY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaXNhYmxlTWNwRHJvcERvd25BY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYW5hZ2VNY3BTZXJ2ZXJBY3Rpb24sIHRydWUpLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3Rpb25zQW5kU3RhdHVzQ29udGFpbmVyID0gYXBwZW5kKGRldGFpbHMsICQoJy5hY3Rpb25zLXN0YXR1cy1jb250YWluZXIubWNwLXNlcnZlci1hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIoYWN0aW9uc0FuZFN0YXR1c0NvbnRhaW5lciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgRHJvcERvd25BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uLmNyZWF0ZUFjdGlvblZpZXdJdGVtKG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBCdXR0b25XaXRoRHJvcERvd25FeHRlbnNpb25BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IEJ1dHRvbldpdGhEcm9wZG93bkV4dGVuc2lvbkFjdGlvblZpZXdJdGVtKFxuXHRcdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0XHRpY29uOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0bWVudUFjdGlvbnNPclByb3ZpZGVyOiB7IGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbi5tZW51QWN0aW9ucyB9LFxuXHRcdFx0XHRcdFx0XHRtZW51QWN0aW9uQ2xhc3NOYW1lczogYWN0aW9uLm1lbnVBY3Rpb25DbGFzc05hbWVzXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Zm9jdXNPbmx5RW5hYmxlZEl0ZW1zOiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0YWN0aW9uQmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHRhY3Rpb25CYXIuc2V0Rm9jdXNhYmxlKHRydWUpO1xuXHRcdC8vIHVwZGF0ZSBmb2N1c2FibGUgZWxlbWVudHMgd2hlbiB0aGUgZW5hYmxlbWVudCBvZiBhbiBhY3Rpb24gY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSguLi5hY3Rpb25zLm1hcChhID0+IEV2ZW50LmZpbHRlcihhLm9uRGlkQ2hhbmdlLCBlID0+IGUuZW5hYmxlZCAhPT0gdW5kZWZpbmVkKSkpKCgpID0+IHtcblx0XHRcdGFjdGlvbkJhci5zZXRGb2N1c2FibGUoZmFsc2UpO1xuXHRcdFx0YWN0aW9uQmFyLnNldEZvY3VzYWJsZSh0cnVlKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBvdGhlckNvbnRhaW5lcnM6IElNY3BTZXJ2ZXJDb250YWluZXJbXSA9IFtdO1xuXHRcdGNvbnN0IG1jcFNlcnZlclN0YXR1c0FjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwU2VydmVyU3RhdHVzQWN0aW9uKTtcblx0XHRjb25zdCBtY3BTZXJ2ZXJTdGF0dXNXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFNlcnZlclN0YXR1c1dpZGdldCwgYXBwZW5kKGFjdGlvbnNBbmRTdGF0dXNDb250YWluZXIsICQoJy5zdGF0dXMnKSksIG1jcFNlcnZlclN0YXR1c0FjdGlvbikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShtY3BTZXJ2ZXJTdGF0dXNXaWRnZXQub25EaWRSZW5kZXIpKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0b3RoZXJDb250YWluZXJzLnB1c2gobWNwU2VydmVyU3RhdHVzQWN0aW9uLCBuZXcgY2xhc3MgZXh0ZW5kcyBNY3BTZXJ2ZXJXaWRnZXQge1xuXHRcdFx0cmVuZGVyKCkge1xuXHRcdFx0XHRhY3Rpb25zQW5kU3RhdHVzQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2xpc3QtbGF5b3V0JywgdGhpcy5tY3BTZXJ2ZXI/Lmluc3RhbGxTdGF0ZSA9PT0gTWNwU2VydmVySW5zdGFsbFN0YXRlLkluc3RhbGxlZCk7XG5cdFx0XHR9XG5cdFx0fSgpKTtcblxuXHRcdGNvbnN0IG1jcFNlcnZlckNvbnRhaW5lcnM6IE1jcFNlcnZlckNvbnRhaW5lcnMgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFNlcnZlckNvbnRhaW5lcnMsIFsuLi5hY3Rpb25zLCAuLi53aWRnZXRzLCAuLi5vdGhlckNvbnRhaW5lcnNdKTtcblx0XHRmb3IgKGNvbnN0IGRpc3Bvc2FibGUgb2YgWy4uLmFjdGlvbnMsIC4uLndpZGdldHMsIC4uLm90aGVyQ29udGFpbmVycywgbWNwU2VydmVyQ29udGFpbmVyc10pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uRXJyb3IgPSBFdmVudC5jaGFpbihhY3Rpb25CYXIub25EaWRSdW4sICQgPT5cblx0XHRcdCQubWFwKCh7IGVycm9yIH0pID0+IGVycm9yKVxuXHRcdFx0XHQuZmlsdGVyKGVycm9yID0+ICEhZXJyb3IpXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRXJyb3IodGhpcy5vbkVycm9yLCB0aGlzKSk7XG5cblx0XHRjb25zdCBib2R5ID0gYXBwZW5kKHJvb3QsICQoJy5ib2R5JykpO1xuXHRcdGNvbnN0IG5hdmJhciA9IG5ldyBOYXZCYXIoYm9keSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXBwZW5kKGJvZHksICQoJy5jb250ZW50JykpO1xuXHRcdGNvbnRlbnQuaWQgPSBnZW5lcmF0ZVV1aWQoKTsgLy8gQW4gaWQgaXMgbmVlZGVkIGZvciB0aGUgd2VidmlldyBwYXJlbnQgZmxvdyB0b1xuXG5cdFx0dGhpcy50ZW1wbGF0ZSA9IHtcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGhlYWRlcixcblx0XHRcdG5hbWUsXG5cdFx0XHRuYXZiYXIsXG5cdFx0XHRhY3Rpb25zQW5kU3RhdHVzQ29udGFpbmVyLFxuXHRcdFx0YWN0aW9uQmFyOiBhY3Rpb25CYXIsXG5cdFx0XHRzZXQgbWNwU2VydmVyKG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlcikge1xuXHRcdFx0XHRtY3BTZXJ2ZXJDb250YWluZXJzLm1jcFNlcnZlciA9IG1jcFNlcnZlcjtcblx0XHRcdFx0bGV0IGxhc3ROb25FbXB0eVN1YnRpdGxlRW50cnlDb250YWluZXI7XG5cdFx0XHRcdGZvciAoY29uc3Qgc3ViVGl0bGVFbnRyeUVsZW1lbnQgb2Ygc3ViVGl0bGVFbnRyeUNvbnRhaW5lcnMpIHtcblx0XHRcdFx0XHRzdWJUaXRsZUVudHJ5RWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdsYXN0LW5vbi1lbXB0eScpO1xuXHRcdFx0XHRcdGlmIChzdWJUaXRsZUVudHJ5RWxlbWVudC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRsYXN0Tm9uRW1wdHlTdWJ0aXRsZUVudHJ5Q29udGFpbmVyID0gc3ViVGl0bGVFbnRyeUVsZW1lbnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsYXN0Tm9uRW1wdHlTdWJ0aXRsZUVudHJ5Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0bGFzdE5vbkVtcHR5U3VidGl0bGVFbnRyeUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdsYXN0LW5vbi1lbXB0eScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBNY3BTZXJ2ZXJFZGl0b3JJbnB1dCwgb3B0aW9uczogSU1jcFNlcnZlckVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuc2V0SW5wdXQoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblx0XHRpZiAodGhpcy50ZW1wbGF0ZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZW5kZXIoaW5wdXQubWNwU2VydmVyLCB0aGlzLnRlbXBsYXRlLCAhIW9wdGlvbnM/LnByZXNlcnZlRm9jdXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVuZGVyKG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlciwgdGVtcGxhdGU6IElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSwgcHJlc2VydmVGb2N1czogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuYWN0aXZlRWxlbWVudCA9IG51bGw7XG5cdFx0dGhpcy50cmFuc2llbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSkudG9rZW47XG5cblx0XHR0aGlzLm1jcFNlcnZlclJlYWRtZSA9IG5ldyBDYWNoZSgoKSA9PiBtY3BTZXJ2ZXIuZ2V0UmVhZG1lKHRva2VuKSk7XG5cdFx0dGhpcy5tY3BTZXJ2ZXJNYW5pZmVzdCA9IG5ldyBDYWNoZSgoKSA9PiBtY3BTZXJ2ZXIuZ2V0TWFuaWZlc3QodG9rZW4pKTtcblx0XHR0ZW1wbGF0ZS5tY3BTZXJ2ZXIgPSBtY3BTZXJ2ZXI7XG5cblx0XHR0ZW1wbGF0ZS5uYW1lLnRleHRDb250ZW50ID0gbWNwU2VydmVyLmxhYmVsO1xuXHRcdHRlbXBsYXRlLm5hbWUuY2xhc3NMaXN0LnRvZ2dsZSgnY2xpY2thYmxlJywgISFtY3BTZXJ2ZXIuZ2FsbGVyeT8ud2ViVXJsKTtcblx0XHR0ZW1wbGF0ZS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9IG1jcFNlcnZlci5kZXNjcmlwdGlvbjtcblx0XHRpZiAobWNwU2VydmVyLmdhbGxlcnk/LndlYlVybCkge1xuXHRcdFx0dGhpcy50cmFuc2llbnREaXNwb3NhYmxlcy5hZGQob25DbGljayh0ZW1wbGF0ZS5uYW1lLCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UobWNwU2VydmVyLmdhbGxlcnk/LndlYlVybCEpKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyTmF2YmFyKG1jcFNlcnZlciwgdGVtcGxhdGUsIHByZXNlcnZlRm9jdXMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0T3B0aW9ucyhvcHRpb25zOiBJTWNwU2VydmVyRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHN1cGVyLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0aWYgKG9wdGlvbnM/LnRhYikge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZT8ubmF2YmFyLnN3aXRjaChvcHRpb25zLnRhYik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJOYXZiYXIoZXh0ZW5zaW9uOiBJV29ya2JlbmNoTWNwU2VydmVyLCB0ZW1wbGF0ZTogSUV4dGVuc2lvbkVkaXRvclRlbXBsYXRlLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuY29udGVudC5pbm5lclRleHQgPSAnJztcblx0XHR0ZW1wbGF0ZS5uYXZiYXIuY2xlYXIoKTtcblxuXHRcdGlmICh0aGlzLmN1cnJlbnRJZGVudGlmaWVyICE9PSBleHRlbnNpb24uaWQpIHtcblx0XHRcdHRoaXMuaW5pdGlhbFNjcm9sbFByb2dyZXNzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmN1cnJlbnRJZGVudGlmaWVyID0gZXh0ZW5zaW9uLmlkO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb24ucmVhZG1lVXJsIHx8IGV4dGVuc2lvbi5nYWxsZXJ5Py5yZWFkbWUpIHtcblx0XHRcdHRlbXBsYXRlLm5hdmJhci5wdXNoKE1jcFNlcnZlckVkaXRvclRhYi5SZWFkbWUsIGxvY2FsaXplKCdkZXRhaWxzJywgXCJEZXRhaWxzXCIpLCBsb2NhbGl6ZSgnZGV0YWlsc3Rvb2x0aXAnLCBcIkV4dGVuc2lvbiBkZXRhaWxzLCByZW5kZXJlZCBmcm9tIHRoZSBleHRlbnNpb24ncyAnUkVBRE1FLm1kJyBmaWxlXCIpKTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnkgfHwgZXh0ZW5zaW9uLmxvY2FsPy5tYW5pZmVzdCkge1xuXHRcdFx0dGVtcGxhdGUubmF2YmFyLnB1c2goTWNwU2VydmVyRWRpdG9yVGFiLk1hbmlmZXN0LCBsb2NhbGl6ZSgnbWFuaWZlc3QnLCBcIk1hbmlmZXN0XCIpLCBsb2NhbGl6ZSgnbWFuaWZlc3R0b29sdGlwJywgXCJTZXJ2ZXIgbWFuaWZlc3QgZGV0YWlsc1wiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGV4dGVuc2lvbi5jb25maWcpIHtcblx0XHRcdHRlbXBsYXRlLm5hdmJhci5wdXNoKE1jcFNlcnZlckVkaXRvclRhYi5Db25maWd1cmF0aW9uLCBsb2NhbGl6ZSgnY29uZmlndXJhdGlvbicsIFwiQ29uZmlndXJhdGlvblwiKSwgbG9jYWxpemUoJ2NvbmZpZ3VyYXRpb250b29sdGlwJywgXCJTZXJ2ZXIgY29uZmlndXJhdGlvbiBkZXRhaWxzXCIpKTtcblx0XHR9XG5cblx0XHR0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZSA9PT0gZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGlmIChlLmNvbmZpZyAmJiAhdGVtcGxhdGUubmF2YmFyLmhhcyhNY3BTZXJ2ZXJFZGl0b3JUYWIuQ29uZmlndXJhdGlvbikpIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZS5uYXZiYXIucHVzaChNY3BTZXJ2ZXJFZGl0b3JUYWIuQ29uZmlndXJhdGlvbiwgbG9jYWxpemUoJ2NvbmZpZ3VyYXRpb24nLCBcIkNvbmZpZ3VyYXRpb25cIiksIGxvY2FsaXplKCdjb25maWd1cmF0aW9udG9vbHRpcCcsIFwiU2VydmVyIGNvbmZpZ3VyYXRpb24gZGV0YWlsc1wiKSwgZXh0ZW5zaW9uLnJlYWRtZVVybCA/IDEgOiAwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWUuY29uZmlnICYmIHRlbXBsYXRlLm5hdmJhci5oYXMoTWNwU2VydmVyRWRpdG9yVGFiLkNvbmZpZ3VyYXRpb24pKSB7XG5cdFx0XHRcdFx0dGVtcGxhdGUubmF2YmFyLnJlbW92ZShNY3BTZXJ2ZXJFZGl0b3JUYWIuQ29uZmlndXJhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoKDxJTWNwU2VydmVyRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZD50aGlzLm9wdGlvbnMpPy50YWIpIHtcblx0XHRcdHRlbXBsYXRlLm5hdmJhci5zd2l0Y2goKDxJTWNwU2VydmVyRWRpdG9yT3B0aW9ucz50aGlzLm9wdGlvbnMpLnRhYiEpO1xuXHRcdH1cblxuXHRcdGlmICh0ZW1wbGF0ZS5uYXZiYXIuY3VycmVudElkKSB7XG5cdFx0XHR0aGlzLm9uTmF2YmFyQ2hhbmdlKGV4dGVuc2lvbiwgeyBpZDogdGVtcGxhdGUubmF2YmFyLmN1cnJlbnRJZCwgZm9jdXM6ICFwcmVzZXJ2ZUZvY3VzIH0sIHRlbXBsYXRlKTtcblx0XHR9XG5cdFx0dGVtcGxhdGUubmF2YmFyLm9uQ2hhbmdlKGUgPT4gdGhpcy5vbk5hdmJhckNoYW5nZShleHRlbnNpb24sIGUsIHRlbXBsYXRlKSwgdGhpcywgdGhpcy50cmFuc2llbnREaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy50cmFuc2llbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLmFjdGl2ZUVsZW1lbnQ/LmZvY3VzKCk7XG5cdH1cblxuXHRzaG93RmluZCgpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2ZVdlYnZpZXc/LnNob3dGaW5kKCk7XG5cdH1cblxuXHRydW5GaW5kQWN0aW9uKHByZXZpb3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVXZWJ2aWV3Py5ydW5GaW5kQWN0aW9uKHByZXZpb3VzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgYWN0aXZlV2VidmlldygpOiBJV2VidmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmFjdGl2ZUVsZW1lbnQgfHwgISh0aGlzLmFjdGl2ZUVsZW1lbnQgYXMgSVdlYnZpZXcpLnJ1bkZpbmRBY3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmFjdGl2ZUVsZW1lbnQgYXMgSVdlYnZpZXc7XG5cdH1cblxuXHRwcml2YXRlIG9uTmF2YmFyQ2hhbmdlKGV4dGVuc2lvbjogSVdvcmtiZW5jaE1jcFNlcnZlciwgeyBpZCwgZm9jdXMgfTogeyBpZDogc3RyaW5nIHwgbnVsbDsgZm9jdXM6IGJvb2xlYW4gfSwgdGVtcGxhdGU6IElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGUuY29udGVudC5pbm5lclRleHQgPSAnJztcblx0XHR0aGlzLmFjdGl2ZUVsZW1lbnQgPSBudWxsO1xuXHRcdGlmIChpZCkge1xuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0XHR0aGlzLm9wZW4oaWQsIGV4dGVuc2lvbiwgdGVtcGxhdGUsIGN0cy50b2tlbilcblx0XHRcdFx0LnRoZW4oYWN0aXZlRWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmFjdGl2ZUVsZW1lbnQgPSBhY3RpdmVFbGVtZW50O1xuXHRcdFx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvcGVuKGlkOiBzdHJpbmcsIGV4dGVuc2lvbjogSVdvcmtiZW5jaE1jcFNlcnZlciwgdGVtcGxhdGU6IElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHRzd2l0Y2ggKGlkKSB7XG5cdFx0XHRjYXNlIE1jcFNlcnZlckVkaXRvclRhYi5Db25maWd1cmF0aW9uOiByZXR1cm4gdGhpcy5vcGVuQ29uZmlndXJhdGlvbihleHRlbnNpb24sIHRlbXBsYXRlLCB0b2tlbik7XG5cdFx0XHRjYXNlIE1jcFNlcnZlckVkaXRvclRhYi5SZWFkbWU6IHJldHVybiB0aGlzLm9wZW5EZXRhaWxzKGV4dGVuc2lvbiwgdGVtcGxhdGUsIHRva2VuKTtcblx0XHRcdGNhc2UgTWNwU2VydmVyRWRpdG9yVGFiLk1hbmlmZXN0OiByZXR1cm4gZXh0ZW5zaW9uLnJlYWRtZVVybCA/IHRoaXMub3Blbk1hbmlmZXN0KGV4dGVuc2lvbiwgdGVtcGxhdGUuY29udGVudCwgdG9rZW4pIDogdGhpcy5vcGVuTWFuaWZlc3RXaXRoQWRkaXRpb25hbERldGFpbHMoZXh0ZW5zaW9uLCB0ZW1wbGF0ZSwgdG9rZW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuTWFya2Rvd24oZXh0ZW5zaW9uOiBJV29ya2JlbmNoTWNwU2VydmVyLCBjYWNoZVJlc3VsdDogQ2FjaGVSZXN1bHQ8c3RyaW5nPiwgbm9Db250ZW50Q29weTogc3RyaW5nLCBjb250YWluZXI6IEhUTUxFbGVtZW50LCB3ZWJ2aWV3SW5kZXg6IFdlYnZpZXdJbmRleCwgdGl0bGU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYm9keSA9IGF3YWl0IHRoaXMucmVuZGVyTWFya2Rvd24oZXh0ZW5zaW9uLCBjYWNoZVJlc3VsdCwgY29udGFpbmVyLCB0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2VidmlldyA9IHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLndlYnZpZXdTZXJ2aWNlLmNyZWF0ZVdlYnZpZXdPdmVybGF5KHtcblx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRlbmFibGVGaW5kV2lkZ2V0OiB0cnVlLFxuXHRcdFx0XHRcdHRyeVJlc3RvcmVTY3JvbGxQb3NpdGlvbjogdHJ1ZSxcblx0XHRcdFx0XHRkaXNhYmxlU2VydmljZVdvcmtlcjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29udGVudE9wdGlvbnM6IHt9LFxuXHRcdFx0XHRleHRlbnNpb246IHVuZGVmaW5lZCxcblx0XHRcdH0pKTtcblxuXHRcdFx0d2Vidmlldy5pbml0aWFsU2Nyb2xsUHJvZ3Jlc3MgPSB0aGlzLmluaXRpYWxTY3JvbGxQcm9ncmVzcy5nZXQod2Vidmlld0luZGV4KSB8fCAwO1xuXG5cdFx0XHR3ZWJ2aWV3LmNsYWltKHRoaXMsIHRoaXMud2luZG93LCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHNldFBhcmVudEZsb3dUbyh3ZWJ2aWV3LmNvbnRhaW5lciwgY29udGFpbmVyKTtcblx0XHRcdHdlYnZpZXcuc2V0QW5jaG9yRWxlbWVudChjb250YWluZXIpO1xuXG5cdFx0XHR3ZWJ2aWV3LnNldEh0bWwoYm9keSk7XG5cdFx0XHR3ZWJ2aWV3LmNsYWltKHRoaXMsIHRoaXMud2luZG93LCB1bmRlZmluZWQpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQod2Vidmlldy5vbkRpZEZvY3VzKCgpID0+IHRoaXMuX29uRGlkRm9jdXM/LmZpcmUoKSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQod2Vidmlldy5vbkRpZFNjcm9sbCgoKSA9PiB0aGlzLmluaXRpYWxTY3JvbGxQcm9ncmVzcy5zZXQod2Vidmlld0luZGV4LCB3ZWJ2aWV3LmluaXRpYWxTY3JvbGxQcm9ncmVzcykpKTtcblxuXHRcdFx0Y29uc3QgcmVtb3ZlTGF5b3V0UGFydGljaXBhbnQgPSBhcnJheXMuaW5zZXJ0KHRoaXMubGF5b3V0UGFydGljaXBhbnRzLCB7XG5cdFx0XHRcdGxheW91dDogKCkgPT4ge1xuXHRcdFx0XHRcdHdlYnZpZXcuc2V0QW5jaG9yRWxlbWVudChjb250YWluZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUocmVtb3ZlTGF5b3V0UGFydGljaXBhbnQpKTtcblxuXHRcdFx0bGV0IGlzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBpc0Rpc3Bvc2VkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gUmVuZGVyIGFnYWluIHNpbmNlIHN5bnRheCBoaWdobGlnaHRpbmcgb2YgY29kZSBibG9ja3MgbWF5IGhhdmUgY2hhbmdlZFxuXHRcdFx0XHRjb25zdCBib2R5ID0gYXdhaXQgdGhpcy5yZW5kZXJNYXJrZG93bihleHRlbnNpb24sIGNhY2hlUmVzdWx0LCBjb250YWluZXIpO1xuXHRcdFx0XHRpZiAoIWlzRGlzcG9zZWQpIHsgLy8gTWFrZSBzdXJlIHdlIHdlcmVuJ3QgZGlzcG9zZWQgb2YgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdFx0d2Vidmlldy5zZXRIdG1sKGJvZHkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh3ZWJ2aWV3Lm9uRGlkQ2xpY2tMaW5rKGxpbmsgPT4ge1xuXHRcdFx0XHRpZiAoIWxpbmspIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gT25seSBhbGxvdyBsaW5rcyB3aXRoIHNwZWNpZmljIHNjaGVtZXNcblx0XHRcdFx0aWYgKG1hdGNoZXNTY2hlbWUobGluaywgU2NoZW1hcy5odHRwKSB8fCBtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMuaHR0cHMpIHx8IG1hdGNoZXNTY2hlbWUobGluaywgU2NoZW1hcy5tYWlsdG8pKSB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4obGluayk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0cmV0dXJuIHdlYnZpZXc7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc3QgcCA9IGFwcGVuZChjb250YWluZXIsICQoJ3Aubm9jb250ZW50JykpO1xuXHRcdFx0cC50ZXh0Q29udGVudCA9IG5vQ29udGVudENvcHk7XG5cdFx0XHRyZXR1cm4gcDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbmRlck1hcmtkb3duKGV4dGVuc2lvbjogSVdvcmtiZW5jaE1jcFNlcnZlciwgY2FjaGVSZXN1bHQ6IENhY2hlUmVzdWx0PHN0cmluZz4sIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgdGhpcy5sb2FkQ29udGVudHMoKCkgPT4gY2FjaGVSZXN1bHQsIGNvbnRhaW5lcik7XG5cdFx0aWYgKHRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCByZW5kZXJNYXJrZG93bkRvY3VtZW50KGNvbnRlbnRzLCB0aGlzLmV4dGVuc2lvblNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB7fSwgdG9rZW4pO1xuXHRcdGlmICh0b2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5yZW5kZXJCb2R5KGNvbnRlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJCb2R5KGJvZHk6IFRydXN0ZWRIVE1MKTogc3RyaW5nIHtcblx0XHRjb25zdCBub25jZSA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0Q29sb3JNYXAoKTtcblx0XHRjb25zdCBjc3MgPSBjb2xvck1hcCA/IGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAoY29sb3JNYXApIDogJyc7XG5cdFx0cmV0dXJuIGA8IURPQ1RZUEUgaHRtbD5cblx0XHQ8aHRtbD5cblx0XHRcdDxoZWFkPlxuXHRcdFx0XHQ8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC10eXBlXCIgY29udGVudD1cInRleHQvaHRtbDtjaGFyc2V0PVVURi04XCI+XG5cdFx0XHRcdDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVwiIGNvbnRlbnQ9XCJkZWZhdWx0LXNyYyAnbm9uZSc7IGltZy1zcmMgaHR0cHM6IGRhdGE6OyBtZWRpYS1zcmMgaHR0cHM6OyBzY3JpcHQtc3JjICdub25lJzsgc3R5bGUtc3JjICdub25jZS0ke25vbmNlfSc7XCI+XG5cdFx0XHRcdDxzdHlsZSBub25jZT1cIiR7bm9uY2V9XCI+XG5cdFx0XHRcdFx0JHtERUZBVUxUX01BUktET1dOX1NUWUxFU31cblxuXHRcdFx0XHRcdC8qIHByZXZlbnQgc2Nyb2xsLXRvLXRvcCBidXR0b24gZnJvbSBibG9ja2luZyB0aGUgYm9keSB0ZXh0ICovXG5cdFx0XHRcdFx0Ym9keSB7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLWJvdHRvbTogNzVweDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjc2Nyb2xsLXRvLXRvcCB7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogZml4ZWQ7XG5cdFx0XHRcdFx0XHR3aWR0aDogMzJweDtcblx0XHRcdFx0XHRcdGhlaWdodDogMzJweDtcblx0XHRcdFx0XHRcdHJpZ2h0OiAyNXB4O1xuXHRcdFx0XHRcdFx0Ym90dG9tOiAyNXB4O1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlCYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHRcdGJvcmRlci1jb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1ib3JkZXIpO1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXJhZGl1czogNTAlO1xuXHRcdFx0XHRcdFx0Y3Vyc29yOiBwb2ludGVyO1xuXHRcdFx0XHRcdFx0Ym94LXNoYWRvdzogMXB4IDFweCAxcHggcmdiYSgwLDAsMCwuMjUpO1xuXHRcdFx0XHRcdFx0b3V0bGluZTogbm9uZTtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGZsZXg7XG5cdFx0XHRcdFx0XHRqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcblx0XHRcdFx0XHRcdGFsaWduLWl0ZW1zOiBjZW50ZXI7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3Njcm9sbC10by10b3A6aG92ZXIge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlIb3ZlckJhY2tncm91bmQpO1xuXHRcdFx0XHRcdFx0Ym94LXNoYWRvdzogMnB4IDJweCAycHggcmdiYSgwLDAsMCwuMjUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGJvZHkudnNjb2RlLWhpZ2gtY29udHJhc3QgI3Njcm9sbC10by10b3Age1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXdpZHRoOiAycHg7XG5cdFx0XHRcdFx0XHRib3JkZXItc3R5bGU6IHNvbGlkO1xuXHRcdFx0XHRcdFx0Ym94LXNoYWRvdzogbm9uZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjc2Nyb2xsLXRvLXRvcCBzcGFuLmljb246OmJlZm9yZSB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBcIlwiO1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiB2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUZvcmVncm91bmQpO1xuXHRcdFx0XHRcdFx0LyogQ2hldnJvbiB1cCBpY29uICovXG5cdFx0XHRcdFx0XHR3ZWJraXQtbWFzay1pbWFnZTogdXJsKCdkYXRhOmltYWdlL3N2Zyt4bWw7YmFzZTY0LFBEOTRiV3dnZG1WeWMybHZiajBpTVM0d0lpQmxibU52WkdsdVp6MGlkWFJtTFRnaVB6NEtQQ0V0TFNCSFpXNWxjbUYwYjNJNklFRmtiMkpsSUVsc2JIVnpkSEpoZEc5eUlERTVMakl1TUN3Z1UxWkhJRVY0Y0c5eWRDQlFiSFZuTFVsdUlDNGdVMVpISUZabGNuTnBiMjQ2SURZdU1EQWdRblZwYkdRZ01Da2dJQzB0UGdvOGMzWm5JSFpsY25OcGIyNDlJakV1TVNJZ2FXUTlJa3hoZVdWeVh6RWlJSGh0Ykc1elBTSm9kSFJ3T2k4dmQzZDNMbmN6TG05eVp5OHlNREF3TDNOMlp5SWdlRzFzYm5NNmVHeHBibXM5SW1oMGRIQTZMeTkzZDNjdWR6TXViM0puTHpFNU9Ua3ZlR3hwYm1zaUlIZzlJakJ3ZUNJZ2VUMGlNSEI0SWdvSklIWnBaWGRDYjNnOUlqQWdNQ0F4TmlBeE5pSWdjM1I1YkdVOUltVnVZV0pzWlMxaVlXTnJaM0p2ZFc1a09tNWxkeUF3SURBZ01UWWdNVFk3SWlCNGJXdzZjM0JoWTJVOUluQnlaWE5sY25abElqNEtQSE4wZVd4bElIUjVjR1U5SW5SbGVIUXZZM056SWo0S0NTNXpkREI3Wm1sc2JEb2pSa1pHUmtaR08zMEtDUzV6ZERGN1ptbHNiRHB1YjI1bE8zMEtQQzl6ZEhsc1pUNEtQSFJwZEd4bFBuVndZMmhsZG5KdmJqd3ZkR2wwYkdVK0NqeHdZWFJvSUdOc1lYTnpQU0p6ZERBaUlHUTlJazA0TERVdU1Xd3ROeTR6TERjdU0wd3dMREV4TGpac09DMDRiRGdzT0d3dE1DNDNMREF1TjB3NExEVXVNWG9pTHo0S1BISmxZM1FnWTJ4aGMzTTlJbk4wTVNJZ2QybGtkR2c5SWpFMklpQm9aV2xuYUhROUlqRTJJaTgrQ2p3dmMzWm5QZ289Jyk7XG5cdFx0XHRcdFx0XHQtd2Via2l0LW1hc2staW1hZ2U6IHVybCgnZGF0YTppbWFnZS9zdmcreG1sO2Jhc2U2NCxQRDk0Yld3Z2RtVnljMmx2YmowaU1TNHdJaUJsYm1OdlpHbHVaejBpZFhSbUxUZ2lQejRLUENFdExTQkhaVzVsY21GMGIzSTZJRUZrYjJKbElFbHNiSFZ6ZEhKaGRHOXlJREU1TGpJdU1Dd2dVMVpISUVWNGNHOXlkQ0JRYkhWbkxVbHVJQzRnVTFaSElGWmxjbk5wYjI0NklEWXVNREFnUW5WcGJHUWdNQ2tnSUMwdFBnbzhjM1puSUhabGNuTnBiMjQ5SWpFdU1TSWdhV1E5SWt4aGVXVnlYekVpSUhodGJHNXpQU0pvZEhSd09pOHZkM2QzTG5jekxtOXlaeTh5TURBd0wzTjJaeUlnZUcxc2JuTTZlR3hwYm1zOUltaDBkSEE2THk5M2QzY3Vkek11YjNKbkx6RTVPVGt2ZUd4cGJtc2lJSGc5SWpCd2VDSWdlVDBpTUhCNElnb0pJSFpwWlhkQ2IzZzlJakFnTUNBeE5pQXhOaUlnYzNSNWJHVTlJbVZ1WVdKc1pTMWlZV05yWjNKdmRXNWtPbTVsZHlBd0lEQWdNVFlnTVRZN0lpQjRiV3c2YzNCaFkyVTlJbkJ5WlhObGNuWmxJajRLUEhOMGVXeGxJSFI1Y0dVOUluUmxlSFF2WTNOeklqNEtDUzV6ZERCN1ptbHNiRG9qUmtaR1JrWkdPMzBLQ1M1emRERjdabWxzYkRwdWIyNWxPMzBLUEM5emRIbHNaVDRLUEhScGRHeGxQblZ3WTJobGRuSnZiand2ZEdsMGJHVStDanh3WVhSb0lHTnNZWE56UFNKemREQWlJR1E5SWswNExEVXVNV3d0Tnk0ekxEY3VNMHd3TERFeExqWnNPQzA0YkRnc09Hd3RNQzQzTERBdU4wdzRMRFV1TVhvaUx6NEtQSEpsWTNRZ1kyeGhjM005SW5OME1TSWdkMmxrZEdnOUlqRTJJaUJvWldsbmFIUTlJakUySWk4K0Nqd3ZjM1puUGdvPScpO1xuXHRcdFx0XHRcdFx0d2lkdGg6IDE2cHg7XG5cdFx0XHRcdFx0XHRoZWlnaHQ6IDE2cHg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdCR7Y3NzfVxuXHRcdFx0XHQ8L3N0eWxlPlxuXHRcdFx0PC9oZWFkPlxuXHRcdFx0PGJvZHk+XG5cdFx0XHRcdDxhIGlkPVwic2Nyb2xsLXRvLXRvcFwiIHJvbGU9XCJidXR0b25cIiBhcmlhLWxhYmVsPVwic2Nyb2xsIHRvIHRvcFwiIGhyZWY9XCIjXCI+PHNwYW4gY2xhc3M9XCJpY29uXCI+PC9zcGFuPjwvYT5cblx0XHRcdFx0JHtib2R5fVxuXHRcdFx0PC9ib2R5PlxuXHRcdDwvaHRtbD5gO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuRGV0YWlscyhleHRlbnNpb246IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIHRlbXBsYXRlOiBJRXh0ZW5zaW9uRWRpdG9yVGVtcGxhdGUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0Y29uc3QgZGV0YWlscyA9IGFwcGVuZCh0ZW1wbGF0ZS5jb250ZW50LCAkKCcuZGV0YWlscycpKTtcblx0XHRjb25zdCByZWFkbWVDb250YWluZXIgPSBhcHBlbmQoZGV0YWlscywgJCgnLmNvbnRlbnQtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxEZXRhaWxzQ29udGFpbmVyID0gYXBwZW5kKGRldGFpbHMsICQoJy5hZGRpdGlvbmFsLWRldGFpbHMtY29udGFpbmVyJykpO1xuXG5cdFx0Y29uc3QgbGF5b3V0ID0gKCkgPT4gZGV0YWlscy5jbGFzc0xpc3QudG9nZ2xlKCduYXJyb3cnLCB0aGlzLmRpbWVuc2lvbiAmJiB0aGlzLmRpbWVuc2lvbi53aWR0aCA8IDUwMCk7XG5cdFx0bGF5b3V0KCk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZShhcnJheXMuaW5zZXJ0KHRoaXMubGF5b3V0UGFydGljaXBhbnRzLCB7IGxheW91dCB9KSkpO1xuXG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGF3YWl0IHRoaXMub3Blbk1hcmtkb3duKGV4dGVuc2lvbiwgdGhpcy5tY3BTZXJ2ZXJSZWFkbWUhLmdldCgpLCBsb2NhbGl6ZSgnbm9SZWFkbWUnLCBcIk5vIFJFQURNRSBhdmFpbGFibGUuXCIpLCByZWFkbWVDb250YWluZXIsIFdlYnZpZXdJbmRleC5SZWFkbWUsIGxvY2FsaXplKCdSZWFkbWUgdGl0bGUnLCBcIlJlYWRtZVwiKSwgdG9rZW4pO1xuXHRcdHRoaXMucmVuZGVyQWRkaXRpb25hbERldGFpbHMoYWRkaXRpb25hbERldGFpbHNDb250YWluZXIsIGV4dGVuc2lvbik7XG5cdFx0cmV0dXJuIGFjdGl2ZUVsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5Db25maWd1cmF0aW9uKG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlciwgdGVtcGxhdGU6IElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHRjb25zdCBjb25maWdDb250YWluZXIgPSBhcHBlbmQodGVtcGxhdGUuY29udGVudCwgJCgnLmNvbmZpZ3VyYXRpb24nKSk7XG5cdFx0Y29uc3QgY29udGVudCA9ICQoJ2RpdicsIHsgY2xhc3M6ICdjb25maWd1cmF0aW9uLWNvbnRlbnQnIH0pO1xuXG5cdFx0dGhpcy5yZW5kZXJDb25maWd1cmF0aW9uRGV0YWlscyhjb250ZW50LCBtY3BTZXJ2ZXIpO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZUNvbnRlbnQgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoY29udGVudCwge30pO1xuXHRcdGNvbnN0IGxheW91dCA9ICgpID0+IHNjcm9sbGFibGVDb250ZW50LnNjYW5Eb21Ob2RlKCk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZShhcnJheXMuaW5zZXJ0KHRoaXMubGF5b3V0UGFydGljaXBhbnRzLCB7IGxheW91dCB9KSkpO1xuXG5cdFx0YXBwZW5kKGNvbmZpZ0NvbnRhaW5lciwgc2Nyb2xsYWJsZUNvbnRlbnQuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdHJldHVybiB7IGZvY3VzOiAoKSA9PiBjb250ZW50LmZvY3VzKCkgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbk1hbmlmZXN0V2l0aEFkZGl0aW9uYWxEZXRhaWxzKG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlciwgdGVtcGxhdGU6IElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHRjb25zdCBkZXRhaWxzID0gYXBwZW5kKHRlbXBsYXRlLmNvbnRlbnQsICQoJy5kZXRhaWxzJykpO1xuXG5cdFx0Y29uc3QgcmVhZG1lQ29udGFpbmVyID0gYXBwZW5kKGRldGFpbHMsICQoJy5jb250ZW50LWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBhZGRpdGlvbmFsRGV0YWlsc0NvbnRhaW5lciA9IGFwcGVuZChkZXRhaWxzLCAkKCcuYWRkaXRpb25hbC1kZXRhaWxzLWNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IGxheW91dCA9ICgpID0+IGRldGFpbHMuY2xhc3NMaXN0LnRvZ2dsZSgnbmFycm93JywgdGhpcy5kaW1lbnNpb24gJiYgdGhpcy5kaW1lbnNpb24ud2lkdGggPCA1MDApO1xuXHRcdGxheW91dCgpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoYXJyYXlzLmluc2VydCh0aGlzLmxheW91dFBhcnRpY2lwYW50cywgeyBsYXlvdXQgfSkpKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBhd2FpdCB0aGlzLm9wZW5NYW5pZmVzdChtY3BTZXJ2ZXIsIHJlYWRtZUNvbnRhaW5lciwgdG9rZW4pO1xuXG5cdFx0dGhpcy5yZW5kZXJBZGRpdGlvbmFsRGV0YWlscyhhZGRpdGlvbmFsRGV0YWlsc0NvbnRhaW5lciwgbWNwU2VydmVyKTtcblx0XHRyZXR1cm4gYWN0aXZlRWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbk1hbmlmZXN0KG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlciwgcGFyZW50OiBIVE1MRWxlbWVudCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHRjb25zdCBtYW5pZmVzdENvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy5tYW5pZmVzdCcpKTtcblx0XHRjb25zdCBjb250ZW50ID0gJCgnZGl2JywgeyBjbGFzczogJ21hbmlmZXN0LWNvbnRlbnQnIH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5sb2FkQ29udGVudHMoKCkgPT4gdGhpcy5tY3BTZXJ2ZXJNYW5pZmVzdCEuZ2V0KCksIGNvbnRlbnQpO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZW5kZXJNYW5pZmVzdERldGFpbHMoY29udGVudCwgbWFuaWZlc3QpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBIYW5kbGUgZXJyb3IgLSBzaG93IG5vIG1hbmlmZXN0IG1lc3NhZ2Vcblx0XHRcdHdoaWxlIChjb250ZW50LmZpcnN0Q2hpbGQpIHtcblx0XHRcdFx0Y29udGVudC5yZW1vdmVDaGlsZChjb250ZW50LmZpcnN0Q2hpbGQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgbm9NYW5pZmVzdE1lc3NhZ2UgPSBhcHBlbmQoY29udGVudCwgJCgnLm5vLW1hbmlmZXN0JykpO1xuXHRcdFx0bm9NYW5pZmVzdE1lc3NhZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9NYW5pZmVzdCcsIFwiTm8gbWFuaWZlc3QgYXZhaWxhYmxlIGZvciB0aGlzIE1DUCBzZXJ2ZXIuXCIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbGFibGVDb250ZW50ID0gbmV3IERvbVNjcm9sbGFibGVFbGVtZW50KGNvbnRlbnQsIHt9KTtcblx0XHRjb25zdCBsYXlvdXQgPSAoKSA9PiBzY3JvbGxhYmxlQ29udGVudC5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoYXJyYXlzLmluc2VydCh0aGlzLmxheW91dFBhcnRpY2lwYW50cywgeyBsYXlvdXQgfSkpKTtcblxuXHRcdGFwcGVuZChtYW5pZmVzdENvbnRhaW5lciwgc2Nyb2xsYWJsZUNvbnRlbnQuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdHJldHVybiB7IGZvY3VzOiAoKSA9PiBjb250ZW50LmZvY3VzKCkgfTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29uZmlndXJhdGlvbkRldGFpbHMoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgbWNwU2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyKTogdm9pZCB7XG5cdFx0Y2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBjb25maWcgPSBtY3BTZXJ2ZXIuY29uZmlnO1xuXG5cdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdGNvbnN0IG5vQ29uZmlnTWVzc2FnZSA9IGFwcGVuZChjb250YWluZXIsICQoJy5uby1jb25maWcnKSk7XG5cdFx0XHRub0NvbmZpZ01lc3NhZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9Db25maWcnLCBcIk5vIGNvbmZpZ3VyYXRpb24gYXZhaWxhYmxlIGZvciB0aGlzIE1DUCBzZXJ2ZXIuXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNlcnZlciBOYW1lXG5cdFx0Y29uc3QgbmFtZVNlY3Rpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuY29uZmlnLXNlY3Rpb24nKSk7XG5cdFx0Y29uc3QgbmFtZUxhYmVsID0gYXBwZW5kKG5hbWVTZWN0aW9uLCAkKCcuY29uZmlnLWxhYmVsJykpO1xuXHRcdG5hbWVMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzZXJ2ZXJOYW1lJywgXCJOYW1lOlwiKTtcblx0XHRjb25zdCBuYW1lVmFsdWUgPSBhcHBlbmQobmFtZVNlY3Rpb24sICQoJy5jb25maWctdmFsdWUnKSk7XG5cdFx0bmFtZVZhbHVlLnRleHRDb250ZW50ID0gbWNwU2VydmVyLm5hbWU7XG5cblx0XHQvLyBTZXJ2ZXIgVHlwZVxuXHRcdGNvbnN0IHR5cGVTZWN0aW9uID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNvbmZpZy1zZWN0aW9uJykpO1xuXHRcdGNvbnN0IHR5cGVMYWJlbCA9IGFwcGVuZCh0eXBlU2VjdGlvbiwgJCgnLmNvbmZpZy1sYWJlbCcpKTtcblx0XHR0eXBlTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnc2VydmVyVHlwZScsIFwiVHlwZTpcIik7XG5cdFx0Y29uc3QgdHlwZVZhbHVlID0gYXBwZW5kKHR5cGVTZWN0aW9uLCAkKCcuY29uZmlnLXZhbHVlJykpO1xuXHRcdHR5cGVWYWx1ZS50ZXh0Q29udGVudCA9IGNvbmZpZy50eXBlO1xuXG5cdFx0Ly8gVHlwZS1zcGVjaWZpYyBjb25maWd1cmF0aW9uXG5cdFx0aWYgKGNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHQvLyBDb21tYW5kXG5cdFx0XHRjb25zdCBjb21tYW5kU2VjdGlvbiA9IGFwcGVuZChjb250YWluZXIsICQoJy5jb25maWctc2VjdGlvbicpKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRMYWJlbCA9IGFwcGVuZChjb21tYW5kU2VjdGlvbiwgJCgnLmNvbmZpZy1sYWJlbCcpKTtcblx0XHRcdGNvbW1hbmRMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjb21tYW5kJywgXCJDb21tYW5kOlwiKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRWYWx1ZSA9IGFwcGVuZChjb21tYW5kU2VjdGlvbiwgJCgnY29kZS5jb25maWctdmFsdWUnKSk7XG5cdFx0XHRjb21tYW5kVmFsdWUudGV4dENvbnRlbnQgPSBjb25maWcuY29tbWFuZDtcblxuXHRcdFx0Ly8gQXJndW1lbnRzIChpZiBwcmVzZW50KVxuXHRcdFx0aWYgKGNvbmZpZy5hcmdzICYmIGNvbmZpZy5hcmdzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgYXJnc1NlY3Rpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuY29uZmlnLXNlY3Rpb24nKSk7XG5cdFx0XHRcdGNvbnN0IGFyZ3NMYWJlbCA9IGFwcGVuZChhcmdzU2VjdGlvbiwgJCgnLmNvbmZpZy1sYWJlbCcpKTtcblx0XHRcdFx0YXJnc0xhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FyZ3VtZW50cycsIFwiQXJndW1lbnRzOlwiKTtcblx0XHRcdFx0Y29uc3QgYXJnc1ZhbHVlID0gYXBwZW5kKGFyZ3NTZWN0aW9uLCAkKCdjb2RlLmNvbmZpZy12YWx1ZScpKTtcblx0XHRcdFx0YXJnc1ZhbHVlLnRleHRDb250ZW50ID0gY29uZmlnLmFyZ3Muam9pbignICcpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFbnZpcm9ubWVudCB2YXJpYWJsZXMgKGlmIHByZXNlbnQpXG5cdFx0XHRpZiAoY29uZmlnLmVudiAmJiBPYmplY3Qua2V5cyhjb25maWcuZW52KS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGVudlNlY3Rpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuY29uZmlnLXNlY3Rpb24nKSk7XG5cdFx0XHRcdGNvbnN0IGVudkxhYmVsID0gYXBwZW5kKGVudlNlY3Rpb24sICQoJy5jb25maWctbGFiZWwnKSk7XG5cdFx0XHRcdGVudkxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Vudmlyb25tZW50JywgXCJFbnZpcm9ubWVudDpcIik7XG5cdFx0XHRcdGNvbnN0IGVudlZhbHVlID0gYXBwZW5kKGVudlNlY3Rpb24sICQoJy5jb25maWctdmFsdWUnKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZy5lbnYpKSB7XG5cdFx0XHRcdFx0YXBwZW5kKGVudlZhbHVlLCAkKCdjb2RlLmVudi1lbnRyeScsIHVuZGVmaW5lZCwgYCR7a2V5fT0ke3ZhbHVlID8/ICcnfWApKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBFbnYgZmlsZSAoaWYgcHJlc2VudClcblx0XHRcdGlmIChjb25maWcuZW52RmlsZSkge1xuXHRcdFx0XHRjb25zdCBlbnZGaWxlU2VjdGlvbiA9IGFwcGVuZChjb250YWluZXIsICQoJy5jb25maWctc2VjdGlvbicpKTtcblx0XHRcdFx0Y29uc3QgZW52RmlsZUxhYmVsID0gYXBwZW5kKGVudkZpbGVTZWN0aW9uLCAkKCcuY29uZmlnLWxhYmVsJykpO1xuXHRcdFx0XHRlbnZGaWxlTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZW52RmlsZScsIFwiRW52aXJvbm1lbnQgRmlsZTpcIik7XG5cdFx0XHRcdGNvbnN0IGVudkZpbGVWYWx1ZSA9IGFwcGVuZChlbnZGaWxlU2VjdGlvbiwgJCgnY29kZS5jb25maWctdmFsdWUnKSk7XG5cdFx0XHRcdGVudkZpbGVWYWx1ZS50ZXh0Q29udGVudCA9IGNvbmZpZy5lbnZGaWxlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuUkVNT1RFKSB7XG5cdFx0XHQvLyBVUkxcblx0XHRcdGNvbnN0IHVybFNlY3Rpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuY29uZmlnLXNlY3Rpb24nKSk7XG5cdFx0XHRjb25zdCB1cmxMYWJlbCA9IGFwcGVuZCh1cmxTZWN0aW9uLCAkKCcuY29uZmlnLWxhYmVsJykpO1xuXHRcdFx0dXJsTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndXJsJywgXCJVUkw6XCIpO1xuXHRcdFx0Y29uc3QgdXJsVmFsdWUgPSBhcHBlbmQodXJsU2VjdGlvbiwgJCgnY29kZS5jb25maWctdmFsdWUnKSk7XG5cdFx0XHR1cmxWYWx1ZS50ZXh0Q29udGVudCA9IGNvbmZpZy51cmw7XG5cblx0XHRcdC8vIEhlYWRlcnMgKGlmIHByZXNlbnQpXG5cdFx0XHRpZiAoY29uZmlnLmhlYWRlcnMgJiYgT2JqZWN0LmtleXMoY29uZmlnLmhlYWRlcnMpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgaGVhZGVyc1NlY3Rpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuY29uZmlnLXNlY3Rpb24nKSk7XG5cdFx0XHRcdGNvbnN0IGhlYWRlcnNMYWJlbCA9IGFwcGVuZChoZWFkZXJzU2VjdGlvbiwgJCgnLmNvbmZpZy1sYWJlbCcpKTtcblx0XHRcdFx0aGVhZGVyc0xhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2hlYWRlcnMnLCBcIkhlYWRlcnM6XCIpO1xuXHRcdFx0XHRjb25zdCBoZWFkZXJzVmFsdWUgPSBhcHBlbmQoaGVhZGVyc1NlY3Rpb24sICQoJy5jb25maWctdmFsdWUnKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGNvbmZpZy5oZWFkZXJzKSkge1xuXHRcdFx0XHRcdGFwcGVuZChoZWFkZXJzVmFsdWUsICQoJ2NvZGUuZW52LWVudHJ5JywgdW5kZWZpbmVkLCBgJHtrZXl9OiAke3ZhbHVlID8/ICcnfWApKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWFuaWZlc3REZXRhaWxzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24pOiB2b2lkIHtcblx0XHRjbGVhck5vZGUoY29udGFpbmVyKTtcblxuXHRcdGlmIChtYW5pZmVzdC5wYWNrYWdlcyAmJiBtYW5pZmVzdC5wYWNrYWdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBwYWNrYWdlc0J5VHlwZSA9IG5ldyBNYXA8UmVnaXN0cnlUeXBlLCBJTWNwU2VydmVyUGFja2FnZVtdPigpO1xuXHRcdFx0Zm9yIChjb25zdCBwa2cgb2YgbWFuaWZlc3QucGFja2FnZXMpIHtcblx0XHRcdFx0Y29uc3QgdHlwZSA9IHBrZy5yZWdpc3RyeVR5cGU7XG5cdFx0XHRcdGxldCBwYWNrYWdlcyA9IHBhY2thZ2VzQnlUeXBlLmdldCh0eXBlKTtcblx0XHRcdFx0aWYgKCFwYWNrYWdlcykge1xuXHRcdFx0XHRcdHBhY2thZ2VzQnlUeXBlLnNldCh0eXBlLCBwYWNrYWdlcyA9IFtdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwYWNrYWdlcy5wdXNoKHBrZyk7XG5cdFx0XHR9XG5cblx0XHRcdGFwcGVuZChjb250YWluZXIsICQoJy5tYW5pZmVzdC1zZWN0aW9uJywgdW5kZWZpbmVkLCAkKCcubWFuaWZlc3Qtc2VjdGlvbi10aXRsZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3BhY2thZ2VzJywgXCJQYWNrYWdlc1wiKSkpKTtcblxuXHRcdFx0Zm9yIChjb25zdCBbcGFja2FnZVR5cGUsIHBhY2thZ2VzXSBvZiBwYWNrYWdlc0J5VHlwZSkge1xuXHRcdFx0XHRjb25zdCBwYWNrYWdlU2VjdGlvbiA9IGFwcGVuZChjb250YWluZXIsICQoJy5wYWNrYWdlLXNlY3Rpb24nLCB1bmRlZmluZWQsICQoJy5wYWNrYWdlLXNlY3Rpb24tdGl0bGUnLCB1bmRlZmluZWQsIHBhY2thZ2VUeXBlLnRvVXBwZXJDYXNlKCkpKSk7XG5cdFx0XHRcdGNvbnN0IHBhY2thZ2VzR3JpZCA9IGFwcGVuZChwYWNrYWdlU2VjdGlvbiwgJCgnLnBhY2thZ2UtZGV0YWlscycpKTtcblxuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHBhY2thZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGtnID0gcGFja2FnZXNbaV07XG5cdFx0XHRcdFx0YXBwZW5kKHBhY2thZ2VzR3JpZCwgJCgnLnBhY2thZ2UtZGV0YWlsJywgdW5kZWZpbmVkLCAkKCcuZGV0YWlsLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgncGFja2FnZU5hbWUnLCBcIlBhY2thZ2U6XCIpKSwgJCgnLmRldGFpbC12YWx1ZScsIHVuZGVmaW5lZCwgcGtnLmlkZW50aWZpZXIpKSk7XG5cdFx0XHRcdFx0aWYgKHBrZy5wYWNrYWdlQXJndW1lbnRzICYmIHBrZy5wYWNrYWdlQXJndW1lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGFyZ1N0cmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGFyZyBvZiBwa2cucGFja2FnZUFyZ3VtZW50cykge1xuXHRcdFx0XHRcdFx0XHRpZiAoYXJnLnR5cGUgPT09ICduYW1lZCcpIHtcblx0XHRcdFx0XHRcdFx0XHRhcmdTdHJpbmdzLnB1c2goYXJnLm5hbWUpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChhcmcudmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGFyZ1N0cmluZ3MucHVzaChhcmcudmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoYXJnLnR5cGUgPT09ICdwb3NpdGlvbmFsJykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHZhbCA9IGFyZy52YWx1ZSA/PyBhcmcudmFsdWVIaW50O1xuXHRcdFx0XHRcdFx0XHRcdGlmICh2YWwpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGFyZ1N0cmluZ3MucHVzaCh2YWwpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YXBwZW5kKHBhY2thZ2VzR3JpZCwgJCgnLnBhY2thZ2UtZGV0YWlsJywgdW5kZWZpbmVkLCAkKCcuZGV0YWlsLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgncGFja2FnZWFyZ3VtZW50cycsIFwiUGFja2FnZSBBcmd1bWVudHM6XCIpKSwgJCgnY29kZS5kZXRhaWwtdmFsdWUnLCB1bmRlZmluZWQsIGFyZ1N0cmluZ3Muam9pbignICcpKSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocGtnLnJ1bnRpbWVBcmd1bWVudHMgJiYgcGtnLnJ1bnRpbWVBcmd1bWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYXJnU3RyaW5nczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgYXJnIG9mIHBrZy5ydW50aW1lQXJndW1lbnRzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChhcmcudHlwZSA9PT0gJ25hbWVkJykge1xuXHRcdFx0XHRcdFx0XHRcdGFyZ1N0cmluZ3MucHVzaChhcmcubmFtZSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGFyZy52YWx1ZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0YXJnU3RyaW5ncy5wdXNoKGFyZy52YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChhcmcudHlwZSA9PT0gJ3Bvc2l0aW9uYWwnKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgdmFsID0gYXJnLnZhbHVlID8/IGFyZy52YWx1ZUhpbnQ7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHZhbCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0YXJnU3RyaW5ncy5wdXNoKHZhbCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhcHBlbmQocGFja2FnZXNHcmlkLCAkKCcucGFja2FnZS1kZXRhaWwnLCB1bmRlZmluZWQsICQoJy5kZXRhaWwtbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdydW50aW1lYXJncycsIFwiUnVudGltZSBBcmd1bWVudHM6XCIpKSwgJCgnY29kZS5kZXRhaWwtdmFsdWUnLCB1bmRlZmluZWQsIGFyZ1N0cmluZ3Muam9pbignICcpKSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocGtnLmVudmlyb25tZW50VmFyaWFibGVzICYmIHBrZy5lbnZpcm9ubWVudFZhcmlhYmxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbnZTdHJpbmdzID0gcGtnLmVudmlyb25tZW50VmFyaWFibGVzLm1hcCgoZW52VmFyOiBJTWNwU2VydmVyS2V5VmFsdWVJbnB1dCkgPT4gYCR7ZW52VmFyLm5hbWV9PSR7ZW52VmFyLnZhbHVlID8/ICcnfWApO1xuXHRcdFx0XHRcdFx0YXBwZW5kKHBhY2thZ2VzR3JpZCwgJCgnLnBhY2thZ2UtZGV0YWlsJywgdW5kZWZpbmVkLCAkKCcuZGV0YWlsLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnZW52aXJvbm1lbnRWYXJpYWJsZXMnLCBcIkVudmlyb25tZW50IFZhcmlhYmxlczpcIikpLCAkKCdjb2RlLmRldGFpbC12YWx1ZScsIHVuZGVmaW5lZCwgZW52U3RyaW5ncy5qb2luKCcgJykpKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpIDwgcGFja2FnZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdFx0YXBwZW5kKHBhY2thZ2VzR3JpZCwgJCgnLnBhY2thZ2Utc2VwYXJhdG9yJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtYW5pZmVzdC5yZW1vdGVzICYmIG1hbmlmZXN0LnJlbW90ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgcGFja2FnZVNlY3Rpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucGFja2FnZS1zZWN0aW9uJywgdW5kZWZpbmVkLCAkKCcucGFja2FnZS1zZWN0aW9uLXRpdGxlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgncmVtb3RlcycsIFwiUmVtb3RlXCIpLnRvTG9jYWxlVXBwZXJDYXNlKCkpKSk7XG5cdFx0XHRmb3IgKGNvbnN0IHJlbW90ZSBvZiBtYW5pZmVzdC5yZW1vdGVzKSB7XG5cdFx0XHRcdGNvbnN0IHBhY2thZ2VzR3JpZCA9IGFwcGVuZChwYWNrYWdlU2VjdGlvbiwgJCgnLnBhY2thZ2UtZGV0YWlscycpKTtcblx0XHRcdFx0YXBwZW5kKHBhY2thZ2VzR3JpZCwgJCgnLnBhY2thZ2UtZGV0YWlsJywgdW5kZWZpbmVkLCAkKCcuZGV0YWlsLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgndXJsJywgXCJVUkw6XCIpKSwgJCgnLmRldGFpbC12YWx1ZScsIHVuZGVmaW5lZCwgcmVtb3RlLnVybCkpKTtcblx0XHRcdFx0aWYgKHJlbW90ZS50eXBlKSB7XG5cdFx0XHRcdFx0YXBwZW5kKHBhY2thZ2VzR3JpZCwgJCgnLnBhY2thZ2UtZGV0YWlsJywgdW5kZWZpbmVkLCAkKCcuZGV0YWlsLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgndHJhbnNwb3J0JywgXCJUcmFuc3BvcnQ6XCIpKSwgJCgnLmRldGFpbC12YWx1ZScsIHVuZGVmaW5lZCwgcmVtb3RlLnR5cGUpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlbW90ZS5oZWFkZXJzICYmIHJlbW90ZS5oZWFkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBoZWFkZXJTdHJpbmdzID0gcmVtb3RlLmhlYWRlcnMubWFwKChoZWFkZXI6IElNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0KSA9PiBgJHtoZWFkZXIubmFtZX06ICR7aGVhZGVyLnZhbHVlID8/ICcnfWApO1xuXHRcdFx0XHRcdGFwcGVuZChwYWNrYWdlc0dyaWQsICQoJy5wYWNrYWdlLWRldGFpbCcsIHVuZGVmaW5lZCwgJCgnLmRldGFpbC1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2hlYWRlcnMnLCBcIkhlYWRlcnM6XCIpKSwgJCgnLmRldGFpbC12YWx1ZScsIHVuZGVmaW5lZCwgaGVhZGVyU3RyaW5ncy5qb2luKCcsICcpKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJBZGRpdGlvbmFsRGV0YWlscyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBleHRlbnNpb246IElXb3JrYmVuY2hNY3BTZXJ2ZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZW50ID0gJCgnZGl2JywgeyBjbGFzczogJ2FkZGl0aW9uYWwtZGV0YWlscy1jb250ZW50JywgdGFiaW5kZXg6ICcwJyB9KTtcblx0XHRjb25zdCBzY3JvbGxhYmxlQ29udGVudCA9IG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudChjb250ZW50LCB7fSk7XG5cdFx0Y29uc3QgbGF5b3V0ID0gKCkgPT4gc2Nyb2xsYWJsZUNvbnRlbnQuc2NhbkRvbU5vZGUoKTtcblx0XHRjb25zdCByZW1vdmVMYXlvdXRQYXJ0aWNpcGFudCA9IGFycmF5cy5pbnNlcnQodGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMsIHsgbGF5b3V0IH0pO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUocmVtb3ZlTGF5b3V0UGFydGljaXBhbnQpKTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQoc2Nyb2xsYWJsZUNvbnRlbnQpO1xuXG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWRkaXRpb25hbERldGFpbHNXaWRnZXQsIGNvbnRlbnQsIGV4dGVuc2lvbikpO1xuXG5cdFx0YXBwZW5kKGNvbnRhaW5lciwgc2Nyb2xsYWJsZUNvbnRlbnQuZ2V0RG9tTm9kZSgpKTtcblx0XHRzY3JvbGxhYmxlQ29udGVudC5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkQ29udGVudHM8VD4obG9hZGluZ1Rhc2s6ICgpID0+IENhY2hlUmVzdWx0PFQ+LCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTxUPiB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2xvYWRpbmcnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChsb2FkaW5nVGFzaygpKTtcblx0XHRjb25zdCBvbkRvbmUgPSAoKSA9PiBjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnbG9hZGluZycpO1xuXHRcdHJlc3VsdC5wcm9taXNlLnRoZW4ob25Eb25lLCBvbkRvbmUpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdC5wcm9taXNlO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0dGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMuZm9yRWFjaChwID0+IHAubGF5b3V0KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVycm9yKGVycjogRXJyb3IpOiB2b2lkIHtcblx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycik7XG5cdH1cbn1cblxuY2xhc3MgQWRkaXRpb25hbERldGFpbHNXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZXh0ZW5zaW9uOiBJV29ya2JlbmNoTWNwU2VydmVyLFxuXHRcdEBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVuZGVyKGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlTWNwR2FsbGVyeU1hbmlmZXN0KCgpID0+IHRoaXMucmVuZGVyKGV4dGVuc2lvbikpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKGV4dGVuc2lvbjogSVdvcmtiZW5jaE1jcFNlcnZlcik6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmIChleHRlbnNpb24ubG9jYWwpIHtcblx0XHRcdHRoaXMucmVuZGVySW5zdGFsbEluZm8odGhpcy5jb250YWluZXIsIGV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0fVxuXG5cdFx0aWYgKGV4dGVuc2lvbi5nYWxsZXJ5KSB7XG5cdFx0XHR0aGlzLnJlbmRlck1hcmtldHBsYWNlSW5mbyh0aGlzLmNvbnRhaW5lciwgZXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXJUYWdzKHRoaXMuY29udGFpbmVyLCBleHRlbnNpb24pO1xuXHRcdHRoaXMucmVuZGVyRXh0ZW5zaW9uUmVzb3VyY2VzKHRoaXMuY29udGFpbmVyLCBleHRlbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUYWdzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGV4dGVuc2lvbjogSVdvcmtiZW5jaE1jcFNlcnZlcik6IHZvaWQge1xuXHRcdGlmIChleHRlbnNpb24uZ2FsbGVyeT8udG9waWNzPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGNhdGVnb3JpZXNDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuY2F0ZWdvcmllcy1jb250YWluZXIuYWRkaXRpb25hbC1kZXRhaWxzLWVsZW1lbnQnKSk7XG5cdFx0XHRhcHBlbmQoY2F0ZWdvcmllc0NvbnRhaW5lciwgJCgnLmFkZGl0aW9uYWwtZGV0YWlscy10aXRsZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3RhZ3MnLCBcIlRhZ3NcIikpKTtcblx0XHRcdGNvbnN0IGNhdGVnb3JpZXNFbGVtZW50ID0gYXBwZW5kKGNhdGVnb3JpZXNDb250YWluZXIsICQoJy5jYXRlZ29yaWVzJykpO1xuXHRcdFx0Zm9yIChjb25zdCBjYXRlZ29yeSBvZiBleHRlbnNpb24uZ2FsbGVyeS50b3BpY3MpIHtcblx0XHRcdFx0YXBwZW5kKGNhdGVnb3JpZXNFbGVtZW50LCAkKCdzcGFuLmNhdGVnb3J5JywgeyB0YWJpbmRleDogJzAnIH0sIGNhdGVnb3J5KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXJFeHRlbnNpb25SZXNvdXJjZXMoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZXh0ZW5zaW9uOiBJV29ya2JlbmNoTWNwU2VydmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2VzOiBbc3RyaW5nLCBUaGVtZUljb24sIFVSSV1bXSA9IFtdO1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5tY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmdldE1jcEdhbGxlcnlNYW5pZmVzdCgpO1xuXHRcdGlmIChleHRlbnNpb24ucmVwb3NpdG9yeSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVzb3VyY2VzLnB1c2goW2xvY2FsaXplKCdyZXBvc2l0b3J5JywgXCJSZXBvc2l0b3J5XCIpLCBUaGVtZUljb24uZnJvbUlkKENvZGljb24ucmVwby5pZCksIFVSSS5wYXJzZShleHRlbnNpb24ucmVwb3NpdG9yeSldKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7LyogSWdub3JlICovIH1cblx0XHR9XG5cdFx0aWYgKG1hbmlmZXN0KSB7XG5cdFx0XHRjb25zdCBzdXBwb3J0VXJpID0gZ2V0TWNwR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkobWFuaWZlc3QsIE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuQ29udGFjdFN1cHBvcnRVcmkpO1xuXHRcdFx0aWYgKHN1cHBvcnRVcmkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXNvdXJjZXMucHVzaChbbG9jYWxpemUoJ3N1cHBvcnQnLCBcIkNvbnRhY3QgU3VwcG9ydFwiKSwgVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uLmlkKSwgVVJJLnBhcnNlKHN1cHBvcnRVcmkpXSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7LyogSWdub3JlICovIH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvblJlc291cmNlc0NvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5yZXNvdXJjZXMtY29udGFpbmVyLmFkZGl0aW9uYWwtZGV0YWlscy1lbGVtZW50JykpO1xuXHRcdFx0YXBwZW5kKGV4dGVuc2lvblJlc291cmNlc0NvbnRhaW5lciwgJCgnLmFkZGl0aW9uYWwtZGV0YWlscy10aXRsZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3Jlc291cmNlcycsIFwiUmVzb3VyY2VzXCIpKSk7XG5cdFx0XHRjb25zdCByZXNvdXJjZXNFbGVtZW50ID0gYXBwZW5kKGV4dGVuc2lvblJlc291cmNlc0NvbnRhaW5lciwgJCgnLnJlc291cmNlcycpKTtcblx0XHRcdGZvciAoY29uc3QgW2xhYmVsLCBpY29uLCB1cmldIG9mIHJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZUVsZW1lbnQgPSBhcHBlbmQocmVzb3VyY2VzRWxlbWVudCwgJCgnLnJlc291cmNlJykpO1xuXHRcdFx0XHRhcHBlbmQocmVzb3VyY2VFbGVtZW50LCAkKFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb24pKSk7XG5cdFx0XHRcdGFwcGVuZChyZXNvdXJjZUVsZW1lbnQsICQoJ2EnLCB7IHRhYmluZGV4OiAnMCcgfSwgbGFiZWwpKTtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQob25DbGljayhyZXNvdXJjZUVsZW1lbnQsICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHVyaSkpKTtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHJlc291cmNlRWxlbWVudCwgdXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckluc3RhbGxJbmZvKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGV4dGVuc2lvbjogSUxvY2FsTWNwU2VydmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5zdGFsbEluZm9Db250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcubW9yZS1pbmZvLWNvbnRhaW5lci5hZGRpdGlvbmFsLWRldGFpbHMtZWxlbWVudCcpKTtcblx0XHRhcHBlbmQoaW5zdGFsbEluZm9Db250YWluZXIsICQoJy5hZGRpdGlvbmFsLWRldGFpbHMtdGl0bGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdJbnN0YWxsIEluZm8nLCBcIkluc3RhbGxhdGlvblwiKSkpO1xuXHRcdGNvbnN0IGluc3RhbGxJbmZvID0gYXBwZW5kKGluc3RhbGxJbmZvQ29udGFpbmVyLCAkKCcubW9yZS1pbmZvJykpO1xuXHRcdGFwcGVuZChpbnN0YWxsSW5mbyxcblx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2lkJywgXCJJZGVudGlmaWVyXCIpKSxcblx0XHRcdFx0JCgnY29kZScsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uLm5hbWUpXG5cdFx0XHQpKTtcblx0XHRpZiAoZXh0ZW5zaW9uLnZlcnNpb24pIHtcblx0XHRcdGFwcGVuZChpbnN0YWxsSW5mbyxcblx0XHRcdFx0JCgnLm1vcmUtaW5mby1lbnRyeScsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCdkaXYubW9yZS1pbmZvLWVudHJ5LW5hbWUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdWZXJzaW9uJywgXCJWZXJzaW9uXCIpKSxcblx0XHRcdFx0XHQkKCdjb2RlJywgdW5kZWZpbmVkLCBleHRlbnNpb24udmVyc2lvbilcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtldHBsYWNlSW5mbyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBleHRlbnNpb246IElXb3JrYmVuY2hNY3BTZXJ2ZXIpOiB2b2lkIHtcblx0XHRjb25zdCBnYWxsZXJ5ID0gZXh0ZW5zaW9uLmdhbGxlcnk7XG5cdFx0Y29uc3QgbW9yZUluZm9Db250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcubW9yZS1pbmZvLWNvbnRhaW5lci5hZGRpdGlvbmFsLWRldGFpbHMtZWxlbWVudCcpKTtcblx0XHRhcHBlbmQobW9yZUluZm9Db250YWluZXIsICQoJy5hZGRpdGlvbmFsLWRldGFpbHMtdGl0bGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdNYXJrZXRwbGFjZSBJbmZvJywgXCJNYXJrZXRwbGFjZVwiKSkpO1xuXHRcdGNvbnN0IG1vcmVJbmZvID0gYXBwZW5kKG1vcmVJbmZvQ29udGFpbmVyLCAkKCcubW9yZS1pbmZvJykpO1xuXHRcdGlmIChnYWxsZXJ5KSB7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbi5sb2NhbCkge1xuXHRcdFx0XHRhcHBlbmQobW9yZUluZm8sXG5cdFx0XHRcdFx0JCgnLm1vcmUtaW5mby1lbnRyeScsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2lkJywgXCJJZGVudGlmaWVyXCIpKSxcblx0XHRcdFx0XHRcdCQoJ2NvZGUnLCB1bmRlZmluZWQsIGV4dGVuc2lvbi5uYW1lKVxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRpZiAoZ2FsbGVyeS52ZXJzaW9uKSB7XG5cdFx0XHRcdFx0YXBwZW5kKG1vcmVJbmZvLFxuXHRcdFx0XHRcdFx0JCgnLm1vcmUtaW5mby1lbnRyeScsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0JCgnZGl2Lm1vcmUtaW5mby1lbnRyeS1uYW1lJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnVmVyc2lvbicsIFwiVmVyc2lvblwiKSksXG5cdFx0XHRcdFx0XHRcdCQoJ2NvZGUnLCB1bmRlZmluZWQsIGdhbGxlcnkudmVyc2lvbilcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZ2FsbGVyeS5sYXN0VXBkYXRlZCkge1xuXHRcdFx0XHRhcHBlbmQobW9yZUluZm8sXG5cdFx0XHRcdFx0JCgnLm1vcmUtaW5mby1lbnRyeScsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2xhc3QgdXBkYXRlZCcsIFwiTGFzdCBSZWxlYXNlZFwiKSksXG5cdFx0XHRcdFx0XHQkKCdkaXYnLCB7XG5cdFx0XHRcdFx0XHRcdCd0aXRsZSc6IG5ldyBEYXRlKGdhbGxlcnkubGFzdFVwZGF0ZWQpLnRvU3RyaW5nKClcblx0XHRcdFx0XHRcdH0sIGZyb21Ob3coZ2FsbGVyeS5sYXN0VXBkYXRlZCwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSkpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGdhbGxlcnkucHVibGlzaERhdGUpIHtcblx0XHRcdFx0YXBwZW5kKG1vcmVJbmZvLFxuXHRcdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHQkKCdkaXYubW9yZS1pbmZvLWVudHJ5LW5hbWUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdwdWJsaXNoZWQnLCBcIlB1Ymxpc2hlZFwiKSksXG5cdFx0XHRcdFx0XHQkKCdkaXYnLCB7XG5cdFx0XHRcdFx0XHRcdCd0aXRsZSc6IG5ldyBEYXRlKGdhbGxlcnkucHVibGlzaERhdGUpLnRvU3RyaW5nKClcblx0XHRcdFx0XHRcdH0sIGZyb21Ob3coZ2FsbGVyeS5wdWJsaXNoRGF0ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSkpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxHQUFjLFFBQVEsV0FBVyx1QkFBdUI7QUFDakUsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxjQUF1QjtBQUNoQyxZQUFZLFlBQVk7QUFDeEIs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
