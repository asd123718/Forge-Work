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
import { $, EventType, addDisposableListener, append, reset, setParentFlowTo } from "../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { Action } from "../../../../../base/common/actions.js";
import * as arrays from "../../../../../base/common/arrays.js";
import { Cache } from "../../../../../base/common/cache.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas, matchesScheme } from "../../../../../base/common/network.js";
import { autorun, derived } from "../../../../../base/common/observable.js";
import { dirname, joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { TokenizationRegistry } from "../../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { generateTokensCSSForColorMap } from "../../../../../editor/common/languages/supports/tokenization.js";
import { localize } from "../../../../../nls.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IRequestService, asText } from "../../../../../platform/request/common/request.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../../browser/parts/editor/editorPane.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from "../../../markdown/browser/markdownDocumentRenderer.js";
import { IWebviewService } from "../../../webview/browser/webview.js";
import { IAgentPluginService } from "../../common/plugins/agentPluginService.js";
import { IPluginInstallService } from "../../common/plugins/pluginInstallService.js";
import { hasSourceChanged, IPluginMarketplaceService } from "../../common/plugins/pluginMarketplaceService.js";
import { AgentPluginItemKind } from "./agentPluginItems.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { EnablementStatusWidget, pluginEnablementLabels } from "../enablementStatusWidget.js";
import { InstallPluginAction, createUninstallPluginAction, createEnablePluginDropDown, createDisablePluginDropDown, createPolicyBlockedEnableAction, isPluginPolicyBlocked, EnablementDropDownAction, EnablementDropdownActionViewItem } from "../agentPluginActions.js";
import "./media/agentPluginEditor.css";
var WebviewIndex = /* @__PURE__ */ ((WebviewIndex2) => {
  WebviewIndex2[WebviewIndex2["Readme"] = 0] = "Readme";
  return WebviewIndex2;
})(WebviewIndex || {});
let AgentPluginEditor = class extends EditorPane {
  constructor(group, telemetryService, instantiationService, themeService, openerService, storageService, extensionService, webviewService, languageService, fileService, requestService, agentPluginService, pluginInstallService, pluginMarketplaceService, labelService, contextMenuService) {
    super(AgentPluginEditor.ID, group, telemetryService, themeService, storageService);
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.extensionService = extensionService;
    this.webviewService = webviewService;
    this.languageService = languageService;
    this.fileService = fileService;
    this.requestService = requestService;
    this.agentPluginService = agentPluginService;
    this.pluginInstallService = pluginInstallService;
    this.pluginMarketplaceService = pluginMarketplaceService;
    this.labelService = labelService;
    this.contextMenuService = contextMenuService;
    this.pluginReadme = null;
    this.initialScrollProgress = /* @__PURE__ */ new Map();
    this.currentIdentifier = "";
    this.layoutParticipants = [];
    this.contentDisposables = this._register(new DisposableStore());
    this.transientDisposables = this._register(new DisposableStore());
    this.activeElement = null;
  }
  createEditor(parent) {
    const root = append(parent, $(".extension-editor.agent-plugin-editor"));
    root.tabIndex = 0;
    root.style.outline = "none";
    root.setAttribute("role", "document");
    const header = append(root, $(".header"));
    const iconContainer = append(header, $(".icon-container"));
    const icon = append(iconContainer, $("span.codicon.codicon-extensions"));
    icon.style.fontSize = "64px";
    const details = append(header, $(".details"));
    const title = append(details, $(".title"));
    const name = append(title, $("span.name", { role: "heading", tabIndex: 0 }));
    const description = append(details, $(".description"));
    const subtitle = append(details, $(".subtitle"));
    const marketplace = append(subtitle, $("span.subtitle-entry"));
    const actionsAndStatusContainer = append(details, $(".actions-status-container"));
    const actionBar = this._register(new ActionBar(actionsAndStatusContainer, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof EnablementDropDownAction) {
          return new EnablementDropdownActionViewItem(
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
    actionBar.setFocusable(true);
    const statusContainer = append(actionsAndStatusContainer, $(".status"));
    const body = append(root, $(".body"));
    const content = append(body, $(".content"));
    content.id = generateUuid();
    this.template = {
      content,
      description,
      header,
      name,
      marketplace,
      actionBar,
      statusContainer
    };
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    if (this.template) {
      await this.render(input.item, this.template);
    }
  }
  async render(item, template) {
    this.activeElement = null;
    this.transientDisposables.clear();
    this.contentDisposables.clear();
    template.content.innerText = "";
    const cts = new CancellationTokenSource();
    this.transientDisposables.add(toDisposable(() => cts.dispose(true)));
    const token = cts.token;
    const itemId = item.kind === AgentPluginItemKind.Installed ? item.plugin.uri.toString() : `${item.marketplaceReference.canonicalId}/${item.source}`;
    if (this.currentIdentifier !== itemId) {
      this.initialScrollProgress.clear();
      this.currentIdentifier = itemId;
    }
    this.pluginReadme = new Cache(() => this.fetchReadme(item, token));
    template.name.textContent = item.name;
    template.description.textContent = item.description;
    const marketplaceLabel = item.marketplace ?? "";
    const githubRepo = item.kind === AgentPluginItemKind.Marketplace ? item.marketplaceReference.githubRepo : item.plugin.fromMarketplace?.marketplaceReference.githubRepo;
    if (marketplaceLabel && githubRepo) {
      const url = `https://github.com/${githubRepo}`;
      const link = $("a.marketplace-link", { href: url }, marketplaceLabel);
      this.transientDisposables.add(addDisposableListener(link, EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openerService.open(URI.parse(url));
      }));
      reset(template.marketplace, link);
    } else {
      reset(template.marketplace, marketplaceLabel);
    }
    const currentItem = derived((reader) => {
      const allPlugins = this.agentPluginService.plugins.read(reader);
      let currentItem2 = item;
      if (item.kind === AgentPluginItemKind.Marketplace) {
        const expectedUri = this.pluginInstallService.getPluginInstallUri({
          name: item.name,
          description: item.description,
          version: "",
          source: item.source,
          sourceDescriptor: item.sourceDescriptor,
          marketplace: item.marketplace,
          marketplaceReference: item.marketplaceReference,
          marketplaceType: item.marketplaceType
        });
        const installedPlugin = allPlugins.find((p) => p.uri.toString() === expectedUri.toString());
        if (installedPlugin) {
          currentItem2 = this.installedPluginToItem(installedPlugin);
        }
      } else {
        const stillInstalled = allPlugins.find((p) => p.uri.toString() === item.plugin.uri.toString());
        if (!stillInstalled) {
          if (item.plugin.fromMarketplace) {
            const mp = item.plugin.fromMarketplace;
            currentItem2 = {
              kind: AgentPluginItemKind.Marketplace,
              name: item.name,
              description: mp.description,
              source: mp.source,
              sourceDescriptor: mp.sourceDescriptor,
              marketplace: mp.marketplace,
              marketplaceReference: mp.marketplaceReference,
              marketplaceType: mp.marketplaceType,
              readmeUri: mp.readmeUri
            };
          } else {
            return;
          }
        } else {
          stillInstalled.enablement.read(reader);
          currentItem2 = this.installedPluginToItem(stillInstalled);
        }
      }
      return currentItem2;
    });
    const storedPlugin = currentItem.map((item2, r) => {
      if (!item2 || item2.kind === AgentPluginItemKind.Marketplace) {
        return void 0;
      }
      return this.pluginMarketplaceService.installedPlugins.read(r).find((e) => e.pluginUri.toString() === item2.plugin.uri.toString())?.plugin ?? item2.plugin.fromMarketplace;
    });
    const actionDisposables = this.transientDisposables.add(new DisposableStore());
    this.transientDisposables.add(autorun((reader) => {
      actionDisposables.clear();
      template.actionBar.clear();
      const current = currentItem.read(reader);
      if (!current) {
        return;
      }
      this.pluginMarketplaceService.lastFetchedPlugins.read(reader);
      const actions = this.getItemActions(current, storedPlugin.read(reader));
      if (actions.length > 0) {
        template.actionBar.push(actions, { icon: true, label: true });
      }
      for (const action of actions) {
        actionDisposables.add(action);
      }
      if (current.kind === AgentPluginItemKind.Installed) {
        actionDisposables.add(this.instantiationService.createInstance(
          EnablementStatusWidget,
          template.statusContainer,
          current.plugin.enablement,
          pluginEnablementLabels
        ));
      }
    }));
    this.activeElement = await this.openDetails(item, template, token);
  }
  getItemActions(item, storedPlugin) {
    if (item.kind === AgentPluginItemKind.Marketplace) {
      return [this.instantiationService.createInstance(InstallPluginAction, item)];
    }
    const workspaceService = this.instantiationService.invokeFunction((a) => a.get(IWorkspaceContextService));
    const actions = [];
    if (storedPlugin) {
      const cachedMarketplace = this.pluginMarketplaceService.lastFetchedPlugins.get();
      const key = `${storedPlugin.marketplaceReference.canonicalId}::${storedPlugin.name}`;
      const livePlugin = cachedMarketplace.find(
        (mp) => `${mp.marketplaceReference.canonicalId}::${mp.name}` === key
      );
      if (livePlugin && hasSourceChanged(storedPlugin.sourceDescriptor, livePlugin.sourceDescriptor)) {
        actions.push(this.instantiationService.createInstance(UpdatePluginEditorAction, item.plugin, livePlugin));
      }
    }
    if (isPluginPolicyBlocked(item.plugin)) {
      const notificationService = this.instantiationService.invokeFunction((a) => a.get(INotificationService));
      actions.push(createPolicyBlockedEnableAction(item.plugin, notificationService));
    } else {
      actions.push(createEnablePluginDropDown(item.plugin, this.agentPluginService.enablementModel, workspaceService));
      actions.push(createDisablePluginDropDown(item.plugin, this.agentPluginService.enablementModel, workspaceService));
    }
    const uninstallAction = createUninstallPluginAction(item.plugin);
    if (uninstallAction) {
      actions.push(uninstallAction);
    }
    return actions;
  }
  installedPluginToItem(plugin) {
    const name = plugin.label;
    const description = plugin.fromMarketplace?.description ?? this.labelService.getUriLabel(dirname(plugin.uri), { relative: true });
    const marketplace = plugin.fromMarketplace?.marketplace;
    return { kind: AgentPluginItemKind.Installed, name, description, marketplace, plugin };
  }
  async fetchReadme(item, token) {
    let readmeUri;
    if (item.kind === AgentPluginItemKind.Installed) {
      readmeUri = joinPath(item.plugin.uri, "README.md");
    } else {
      readmeUri = item.readmeUri;
    }
    if (!readmeUri) {
      return "";
    }
    if (readmeUri.scheme === Schemas.file || readmeUri.scheme === Schemas.vscodeRemote) {
      try {
        const content = await this.fileService.readFile(readmeUri);
        return content.value.toString();
      } catch {
        return "";
      }
    }
    if (readmeUri.scheme === Schemas.https) {
      let rawUrl = readmeUri.toString();
      const githubBlobMatch = rawUrl.match(/^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/blob\/(?<rest>.+)$/);
      if (githubBlobMatch?.groups) {
        rawUrl = `https://raw.githubusercontent.com/${githubBlobMatch.groups["owner"]}/${githubBlobMatch.groups["repo"]}/${githubBlobMatch.groups["rest"]}`;
      }
      try {
        const context = await this.requestService.request({ type: "GET", url: rawUrl, callSite: "agentPluginEditor.fetchReadme" }, token);
        const text = await asText(context);
        return text ?? "";
      } catch {
        return "";
      }
    }
    return "";
  }
  async openDetails(item, template, token) {
    const details = append(template.content, $(".details"));
    const readmeContainer = append(details, $(".content-container"));
    const layout = () => details.classList.toggle("narrow", this.dimension !== void 0 && this.dimension.width < 500);
    layout();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    return this.openMarkdown(this.pluginReadme.get(), localize("noReadme", "No README available."), readmeContainer, 0 /* Readme */, localize("Readme title", "Readme"), token);
  }
  async openMarkdown(cacheResult, noContentCopy, container, webviewIndex, title, token) {
    try {
      const body = await this.renderMarkdown(cacheResult, container, token);
      if (token.isCancellationRequested) {
        return null;
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
      webview.claim(this, this.window, void 0);
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
        const body2 = await this.renderMarkdown(cacheResult, container);
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
  async renderMarkdown(cacheResult, container, token) {
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
  loadContents(loadingTask, container) {
    container.classList.add("loading");
    const result = this.contentDisposables.add(loadingTask());
    const onDone = () => container.classList.remove("loading");
    result.promise.then(onDone, onDone);
    return result.promise;
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
  get activeWebview() {
    if (!this.activeElement || !this.activeElement.runFindAction) {
      return void 0;
    }
    return this.activeElement;
  }
  layout(dimension) {
    this.dimension = dimension;
    this.layoutParticipants.forEach((p) => p.layout());
  }
};
AgentPluginEditor.ID = "workbench.editor.agentPlugin";
AgentPluginEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IWebviewService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IFileService),
  __decorateParam(10, IRequestService),
  __decorateParam(11, IAgentPluginService),
  __decorateParam(12, IPluginInstallService),
  __decorateParam(13, IPluginMarketplaceService),
  __decorateParam(14, ILabelService),
  __decorateParam(15, IContextMenuService)
], AgentPluginEditor);
let UpdatePluginEditorAction = class extends Action {
  constructor(plugin, liveMarketplacePlugin, pluginInstallService, pluginMarketplaceService) {
    super(UpdatePluginEditorAction.ID, localize("update", "Update"), "extension-action label prominent install");
    this.plugin = plugin;
    this.liveMarketplacePlugin = liveMarketplacePlugin;
    this.pluginInstallService = pluginInstallService;
    this.pluginMarketplaceService = pluginMarketplaceService;
  }
  async run() {
    if (await this.pluginInstallService.updatePlugin(this.liveMarketplacePlugin)) {
      this.pluginMarketplaceService.addInstalledPlugin(this.plugin.uri, this.liveMarketplacePlugin);
    }
  }
};
UpdatePluginEditorAction.ID = "agentPlugin.editor.update";
UpdatePluginEditorAction = __decorateClass([
  __decorateParam(2, IPluginInstallService),
  __decorateParam(3, IPluginMarketplaceService)
], UpdatePluginEditorAction);
export {
  AgentPluginEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50UGx1Z2luRWRpdG9yXFxhZ2VudFBsdWdpbkVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIERpbWVuc2lvbiwgRXZlbnRUeXBlLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgcmVzZXQsIHNldFBhcmVudEZsb3dUbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYWNoZSwgQ2FjaGVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYWNoZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcywgbWF0Y2hlc1NjaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3N1cHBvcnRzL3Rva2VuaXphdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdFNlcnZpY2UsIGFzVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcGVuQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX01BUktET1dOX1NUWUxFUywgcmVuZGVyTWFya2Rvd25Eb2N1bWVudCB9IGZyb20gJy4uLy4uLy4uL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25Eb2N1bWVudFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElXZWJ2aWV3LCBJV2Vidmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW4sIElBZ2VudFBsdWdpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBsdWdpbkluc3RhbGxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luSW5zdGFsbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFzU291cmNlQ2hhbmdlZCwgSU1hcmtldHBsYWNlUGx1Z2luLCBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luRWRpdG9ySW5wdXQgfSBmcm9tICcuL2FnZW50UGx1Z2luRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5JdGVtS2luZCwgSUFnZW50UGx1Z2luSXRlbSwgSUluc3RhbGxlZFBsdWdpbkl0ZW0gfSBmcm9tICcuL2FnZW50UGx1Z2luSXRlbXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRW5hYmxlbWVudFN0YXR1c1dpZGdldCwgcGx1Z2luRW5hYmxlbWVudExhYmVscyB9IGZyb20gJy4uL2VuYWJsZW1lbnRTdGF0dXNXaWRnZXQuanMnO1xuaW1wb3J0IHsgSW5zdGFsbFBsdWdpbkFjdGlvbiwgY3JlYXRlVW5pbnN0YWxsUGx1Z2luQWN0aW9uLCBjcmVhdGVFbmFibGVQbHVnaW5Ecm9wRG93biwgY3JlYXRlRGlzYWJsZVBsdWdpbkRyb3BEb3duLCBjcmVhdGVQb2xpY3lCbG9ja2VkRW5hYmxlQWN0aW9uLCBpc1BsdWdpblBvbGljeUJsb2NrZWQsIEVuYWJsZW1lbnREcm9wRG93bkFjdGlvbiwgRW5hYmxlbWVudERyb3Bkb3duQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi9hZ2VudFBsdWdpbkFjdGlvbnMuanMnO1xuaW1wb3J0ICcuL21lZGlhL2FnZW50UGx1Z2luRWRpdG9yLmNzcyc7XG5cbmludGVyZmFjZSBJQWdlbnRQbHVnaW5FZGl0b3JUZW1wbGF0ZSB7XG5cdG5hbWU6IEhUTUxFbGVtZW50O1xuXHRkZXNjcmlwdGlvbjogSFRNTEVsZW1lbnQ7XG5cdG1hcmtldHBsYWNlOiBIVE1MRWxlbWVudDtcblx0YWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdHN0YXR1c0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGNvbnRlbnQ6IEhUTUxFbGVtZW50O1xuXHRoZWFkZXI6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSUxheW91dFBhcnRpY2lwYW50IHtcblx0bGF5b3V0KCk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBJQWN0aXZlRWxlbWVudCB7XG5cdGZvY3VzKCk6IHZvaWQ7XG59XG5cbmNvbnN0IGVudW0gV2Vidmlld0luZGV4IHtcblx0UmVhZG1lLFxufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRQbHVnaW5FZGl0b3IgZXh0ZW5kcyBFZGl0b3JQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guZWRpdG9yLmFnZW50UGx1Z2luJztcblxuXHRwcml2YXRlIHRlbXBsYXRlOiBJQWdlbnRQbHVnaW5FZGl0b3JUZW1wbGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHBsdWdpblJlYWRtZTogQ2FjaGU8c3RyaW5nPiB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgaW5pdGlhbFNjcm9sbFByb2dyZXNzOiBNYXA8V2Vidmlld0luZGV4LCBudW1iZXI+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIGN1cnJlbnRJZGVudGlmaWVyOiBzdHJpbmcgPSAnJztcblxuXHRwcml2YXRlIGxheW91dFBhcnRpY2lwYW50czogSUxheW91dFBhcnRpY2lwYW50W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyYW5zaWVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBhY3RpdmVFbGVtZW50OiBJQWN0aXZlRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGRpbWVuc2lvbjogRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElXZWJ2aWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdlYnZpZXdTZXJ2aWNlOiBJV2Vidmlld1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElBZ2VudFBsdWdpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFBsdWdpblNlcnZpY2U6IElBZ2VudFBsdWdpblNlcnZpY2UsXG5cdFx0QElQbHVnaW5JbnN0YWxsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbkluc3RhbGxTZXJ2aWNlOiBJUGx1Z2luSW5zdGFsbFNlcnZpY2UsXG5cdFx0QElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2U6IElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEFnZW50UGx1Z2luRWRpdG9yLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCByb290ID0gYXBwZW5kKHBhcmVudCwgJCgnLmV4dGVuc2lvbi1lZGl0b3IuYWdlbnQtcGx1Z2luLWVkaXRvcicpKTtcblxuXHRcdHJvb3QudGFiSW5kZXggPSAwO1xuXHRcdHJvb3Quc3R5bGUub3V0bGluZSA9ICdub25lJztcblx0XHRyb290LnNldEF0dHJpYnV0ZSgncm9sZScsICdkb2N1bWVudCcpO1xuXHRcdGNvbnN0IGhlYWRlciA9IGFwcGVuZChyb290LCAkKCcuaGVhZGVyJykpO1xuXG5cdFx0Y29uc3QgaWNvbkNvbnRhaW5lciA9IGFwcGVuZChoZWFkZXIsICQoJy5pY29uLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBpY29uID0gYXBwZW5kKGljb25Db250YWluZXIsICQoJ3NwYW4uY29kaWNvbi5jb2RpY29uLWV4dGVuc2lvbnMnKSk7XG5cdFx0aWNvbi5zdHlsZS5mb250U2l6ZSA9ICc2NHB4JztcblxuXHRcdGNvbnN0IGRldGFpbHMgPSBhcHBlbmQoaGVhZGVyLCAkKCcuZGV0YWlscycpKTtcblx0XHRjb25zdCB0aXRsZSA9IGFwcGVuZChkZXRhaWxzLCAkKCcudGl0bGUnKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGFwcGVuZCh0aXRsZSwgJCgnc3Bhbi5uYW1lJywgeyByb2xlOiAnaGVhZGluZycsIHRhYkluZGV4OiAwIH0pKTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYXBwZW5kKGRldGFpbHMsICQoJy5kZXNjcmlwdGlvbicpKTtcblxuXHRcdGNvbnN0IHN1YnRpdGxlID0gYXBwZW5kKGRldGFpbHMsICQoJy5zdWJ0aXRsZScpKTtcblx0XHRjb25zdCBtYXJrZXRwbGFjZSA9IGFwcGVuZChzdWJ0aXRsZSwgJCgnc3Bhbi5zdWJ0aXRsZS1lbnRyeScpKTtcblxuXHRcdGNvbnN0IGFjdGlvbnNBbmRTdGF0dXNDb250YWluZXIgPSBhcHBlbmQoZGV0YWlscywgJCgnLmFjdGlvbnMtc3RhdHVzLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKGFjdGlvbnNBbmRTdGF0dXNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIEVuYWJsZW1lbnREcm9wRG93bkFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgRW5hYmxlbWVudERyb3Bkb3duQWN0aW9uVmlld0l0ZW0oXG5cdFx0XHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRcdGljb246IHRydWUsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRtZW51QWN0aW9uc09yUHJvdmlkZXI6IHsgZ2V0QWN0aW9uczogKCkgPT4gYWN0aW9uLm1lbnVBY3Rpb25zIH0sXG5cdFx0XHRcdFx0XHRcdG1lbnVBY3Rpb25DbGFzc05hbWVzOiBhY3Rpb24ubWVudUFjdGlvbkNsYXNzTmFtZXMsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGZvY3VzT25seUVuYWJsZWRJdGVtczogdHJ1ZVxuXHRcdH0pKTtcblx0XHRhY3Rpb25CYXIuc2V0Rm9jdXNhYmxlKHRydWUpO1xuXG5cdFx0Y29uc3Qgc3RhdHVzQ29udGFpbmVyID0gYXBwZW5kKGFjdGlvbnNBbmRTdGF0dXNDb250YWluZXIsICQoJy5zdGF0dXMnKSk7XG5cblx0XHRjb25zdCBib2R5ID0gYXBwZW5kKHJvb3QsICQoJy5ib2R5JykpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhcHBlbmQoYm9keSwgJCgnLmNvbnRlbnQnKSk7XG5cdFx0Y29udGVudC5pZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0dGhpcy50ZW1wbGF0ZSA9IHtcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGhlYWRlcixcblx0XHRcdG5hbWUsXG5cdFx0XHRtYXJrZXRwbGFjZSxcblx0XHRcdGFjdGlvbkJhcixcblx0XHRcdHN0YXR1c0NvbnRhaW5lcixcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IEFnZW50UGx1Z2luRWRpdG9ySW5wdXQsIG9wdGlvbnM6IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXHRcdGlmICh0aGlzLnRlbXBsYXRlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJlbmRlcihpbnB1dC5pdGVtLCB0aGlzLnRlbXBsYXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbmRlcihpdGVtOiBJQWdlbnRQbHVnaW5JdGVtLCB0ZW1wbGF0ZTogSUFnZW50UGx1Z2luRWRpdG9yVGVtcGxhdGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFjdGl2ZUVsZW1lbnQgPSBudWxsO1xuXHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRlbXBsYXRlLmNvbnRlbnQuaW5uZXJUZXh0ID0gJyc7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRjb25zdCB0b2tlbiA9IGN0cy50b2tlbjtcblxuXHRcdGNvbnN0IGl0ZW1JZCA9IGl0ZW0ua2luZCA9PT0gQWdlbnRQbHVnaW5JdGVtS2luZC5JbnN0YWxsZWQgPyBpdGVtLnBsdWdpbi51cmkudG9TdHJpbmcoKSA6IGAke2l0ZW0ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWR9LyR7aXRlbS5zb3VyY2V9YDtcblxuXHRcdGlmICh0aGlzLmN1cnJlbnRJZGVudGlmaWVyICE9PSBpdGVtSWQpIHtcblx0XHRcdHRoaXMuaW5pdGlhbFNjcm9sbFByb2dyZXNzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmN1cnJlbnRJZGVudGlmaWVyID0gaXRlbUlkO1xuXHRcdH1cblxuXHRcdHRoaXMucGx1Z2luUmVhZG1lID0gbmV3IENhY2hlKCgpID0+IHRoaXMuZmV0Y2hSZWFkbWUoaXRlbSwgdG9rZW4pKTtcblxuXHRcdHRlbXBsYXRlLm5hbWUudGV4dENvbnRlbnQgPSBpdGVtLm5hbWU7XG5cdFx0dGVtcGxhdGUuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBpdGVtLmRlc2NyaXB0aW9uO1xuXG5cdFx0Ly8gU2V0IHVwIG1hcmtldHBsYWNlIGxpbmtcblx0XHRjb25zdCBtYXJrZXRwbGFjZUxhYmVsID0gaXRlbS5tYXJrZXRwbGFjZSA/PyAnJztcblx0XHRjb25zdCBnaXRodWJSZXBvID0gaXRlbS5raW5kID09PSBBZ2VudFBsdWdpbkl0ZW1LaW5kLk1hcmtldHBsYWNlXG5cdFx0XHQ/IGl0ZW0ubWFya2V0cGxhY2VSZWZlcmVuY2UuZ2l0aHViUmVwb1xuXHRcdFx0OiBpdGVtLnBsdWdpbi5mcm9tTWFya2V0cGxhY2U/Lm1hcmtldHBsYWNlUmVmZXJlbmNlLmdpdGh1YlJlcG87XG5cdFx0aWYgKG1hcmtldHBsYWNlTGFiZWwgJiYgZ2l0aHViUmVwbykge1xuXHRcdFx0Y29uc3QgdXJsID0gYGh0dHBzOi8vZ2l0aHViLmNvbS8ke2dpdGh1YlJlcG99YDtcblx0XHRcdGNvbnN0IGxpbmsgPSAkKCdhLm1hcmtldHBsYWNlLWxpbmsnLCB7IGhyZWY6IHVybCB9LCBtYXJrZXRwbGFjZUxhYmVsKTtcblx0XHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCBFdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHVybCkpO1xuXHRcdFx0fSkpO1xuXHRcdFx0cmVzZXQodGVtcGxhdGUubWFya2V0cGxhY2UsIGxpbmspO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNldCh0ZW1wbGF0ZS5tYXJrZXRwbGFjZSwgbWFya2V0cGxhY2VMYWJlbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudEl0ZW0gPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvLyBSZWFkIG9ic2VydmFibGVzIHRvIHN1YnNjcmliZSB0byBjaGFuZ2VzXG5cdFx0XHRjb25zdCBhbGxQbHVnaW5zID0gdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGxldCBjdXJyZW50SXRlbSA9IGl0ZW07XG5cblx0XHRcdC8vIElmIHRoaXMgd2FzIGEgbWFya2V0cGxhY2UgaXRlbSwgY2hlY2sgaWYgaXQgZ290IGluc3RhbGxlZFxuXHRcdFx0aWYgKGl0ZW0ua2luZCA9PT0gQWdlbnRQbHVnaW5JdGVtS2luZC5NYXJrZXRwbGFjZSkge1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZFVyaSA9IHRoaXMucGx1Z2luSW5zdGFsbFNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaSh7XG5cdFx0XHRcdFx0bmFtZTogaXRlbS5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRcdHNvdXJjZTogaXRlbS5zb3VyY2UsXG5cdFx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogaXRlbS5zb3VyY2VEZXNjcmlwdG9yLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlOiBpdGVtLm1hcmtldHBsYWNlLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBpdGVtLm1hcmtldHBsYWNlUmVmZXJlbmNlLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlVHlwZTogaXRlbS5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBpbnN0YWxsZWRQbHVnaW4gPSBhbGxQbHVnaW5zLmZpbmQocCA9PiBwLnVyaS50b1N0cmluZygpID09PSBleHBlY3RlZFVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKGluc3RhbGxlZFBsdWdpbikge1xuXHRcdFx0XHRcdGN1cnJlbnRJdGVtID0gdGhpcy5pbnN0YWxsZWRQbHVnaW5Ub0l0ZW0oaW5zdGFsbGVkUGx1Z2luKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gSWYgdGhpcyB3YXMgYW4gaW5zdGFsbGVkIGl0ZW0sIGNoZWNrIGlmIGl0IGdvdCB1bmluc3RhbGxlZFxuXHRcdFx0XHRjb25zdCBzdGlsbEluc3RhbGxlZCA9IGFsbFBsdWdpbnMuZmluZChwID0+IHAudXJpLnRvU3RyaW5nKCkgPT09IGl0ZW0ucGx1Z2luLnVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKCFzdGlsbEluc3RhbGxlZCkge1xuXHRcdFx0XHRcdC8vIFBsdWdpbiB3YXMgdW5pbnN0YWxsZWQgXHUyMDE0IHNob3cgYXMgbWFya2V0cGxhY2UgaWYgd2UgaGF2ZSB0aGUgaW5mb1xuXHRcdFx0XHRcdGlmIChpdGVtLnBsdWdpbi5mcm9tTWFya2V0cGxhY2UpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1wID0gaXRlbS5wbHVnaW4uZnJvbU1hcmtldHBsYWNlO1xuXHRcdFx0XHRcdFx0Y3VycmVudEl0ZW0gPSB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6IEFnZW50UGx1Z2luSXRlbUtpbmQuTWFya2V0cGxhY2UsXG5cdFx0XHRcdFx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG1wLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRzb3VyY2U6IG1wLnNvdXJjZSxcblx0XHRcdFx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogbXAuc291cmNlRGVzY3JpcHRvcixcblx0XHRcdFx0XHRcdFx0bWFya2V0cGxhY2U6IG1wLm1hcmtldHBsYWNlLFxuXHRcdFx0XHRcdFx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogbXAubWFya2V0cGxhY2VSZWZlcmVuY2UsXG5cdFx0XHRcdFx0XHRcdG1hcmtldHBsYWNlVHlwZTogbXAubWFya2V0cGxhY2VUeXBlLFxuXHRcdFx0XHRcdFx0XHRyZWFkbWVVcmk6IG1wLnJlYWRtZVVyaSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIE5vbi1tYXJrZXRwbGFjZSBwbHVnaW4gd2FzIHVuaW5zdGFsbGVkIFx1MjAxNCBubyBhY3Rpb25zIHRvIHNob3dcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gUmVhZCBlbmFibGVtZW50IHN0YXRlIGZvciByZWFjdGl2aXR5XG5cdFx0XHRcdFx0c3RpbGxJbnN0YWxsZWQuZW5hYmxlbWVudC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0Y3VycmVudEl0ZW0gPSB0aGlzLmluc3RhbGxlZFBsdWdpblRvSXRlbShzdGlsbEluc3RhbGxlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGN1cnJlbnRJdGVtO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3RvcmVkUGx1Z2luID0gY3VycmVudEl0ZW0ubWFwKChpdGVtLCByKSA9PiB7XG5cdFx0XHRpZiAoIWl0ZW0gfHwgaXRlbS5raW5kID09PSBBZ2VudFBsdWdpbkl0ZW1LaW5kLk1hcmtldHBsYWNlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLnBsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLnJlYWQocilcblx0XHRcdFx0LmZpbmQoZSA9PiBlLnBsdWdpblVyaS50b1N0cmluZygpID09PSBpdGVtLnBsdWdpbi51cmkudG9TdHJpbmcoKSk/LnBsdWdpblxuXHRcdFx0XHQ/PyBpdGVtLnBsdWdpbi5mcm9tTWFya2V0cGxhY2U7XG5cdFx0fSk7XG5cblx0XHQvLyBTZXQgdXAgYWN0aW9ucyByZWFjdGl2ZWx5XG5cdFx0Y29uc3QgYWN0aW9uRGlzcG9zYWJsZXMgPSB0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGFjdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXIuY2xlYXIoKTtcblxuXHRcdFx0Y29uc3QgY3VycmVudCA9IGN1cnJlbnRJdGVtLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmxhc3RGZXRjaGVkUGx1Z2lucy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmdldEl0ZW1BY3Rpb25zKGN1cnJlbnQsIHN0b3JlZFBsdWdpbi5yZWFkKHJlYWRlcikpO1xuXHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXIucHVzaChhY3Rpb25zLCB7IGljb246IHRydWUsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRhY3Rpb25EaXNwb3NhYmxlcy5hZGQoYWN0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIGVuYWJsZW1lbnQgc3RhdHVzIHdpZGdldFxuXHRcdFx0aWYgKGN1cnJlbnQua2luZCA9PT0gQWdlbnRQbHVnaW5JdGVtS2luZC5JbnN0YWxsZWQpIHtcblx0XHRcdFx0YWN0aW9uRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0RW5hYmxlbWVudFN0YXR1c1dpZGdldCxcblx0XHRcdFx0XHR0ZW1wbGF0ZS5zdGF0dXNDb250YWluZXIsXG5cdFx0XHRcdFx0Y3VycmVudC5wbHVnaW4uZW5hYmxlbWVudCxcblx0XHRcdFx0XHRwbHVnaW5FbmFibGVtZW50TGFiZWxzLFxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBPcGVuIHJlYWRtZVxuXHRcdHRoaXMuYWN0aXZlRWxlbWVudCA9IGF3YWl0IHRoaXMub3BlbkRldGFpbHMoaXRlbSwgdGVtcGxhdGUsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SXRlbUFjdGlvbnMoaXRlbTogSUFnZW50UGx1Z2luSXRlbSwgc3RvcmVkUGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4gfCB1bmRlZmluZWQpOiBBY3Rpb25bXSB7XG5cdFx0aWYgKGl0ZW0ua2luZCA9PT0gQWdlbnRQbHVnaW5JdGVtS2luZC5NYXJrZXRwbGFjZSkge1xuXHRcdFx0cmV0dXJuIFt0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxQbHVnaW5BY3Rpb24sIGl0ZW0pXTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VTZXJ2aWNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhID0+IGEuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSkpO1xuXHRcdGNvbnN0IGFjdGlvbnM6IEFjdGlvbltdID0gW107XG5cblx0XHRpZiAoc3RvcmVkUGx1Z2luKSB7XG5cdFx0XHRjb25zdCBjYWNoZWRNYXJrZXRwbGFjZSA9IHRoaXMucGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmxhc3RGZXRjaGVkUGx1Z2lucy5nZXQoKTtcblx0XHRcdGNvbnN0IGtleSA9IGAke3N0b3JlZFBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZH06OiR7c3RvcmVkUGx1Z2luLm5hbWV9YDtcblx0XHRcdGNvbnN0IGxpdmVQbHVnaW4gPSBjYWNoZWRNYXJrZXRwbGFjZS5maW5kKG1wID0+XG5cdFx0XHRcdGAke21wLm1hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkfTo6JHttcC5uYW1lfWAgPT09IGtleVxuXHRcdFx0KTtcblx0XHRcdGlmIChsaXZlUGx1Z2luICYmIGhhc1NvdXJjZUNoYW5nZWQoc3RvcmVkUGx1Z2luLnNvdXJjZURlc2NyaXB0b3IsIGxpdmVQbHVnaW4uc291cmNlRGVzY3JpcHRvcikpIHtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXBkYXRlUGx1Z2luRWRpdG9yQWN0aW9uLCBpdGVtLnBsdWdpbiwgbGl2ZVBsdWdpbikpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpc1BsdWdpblBvbGljeUJsb2NrZWQoaXRlbS5wbHVnaW4pKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhID0+IGEuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKSk7XG5cdFx0XHRhY3Rpb25zLnB1c2goY3JlYXRlUG9saWN5QmxvY2tlZEVuYWJsZUFjdGlvbihpdGVtLnBsdWdpbiwgbm90aWZpY2F0aW9uU2VydmljZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goY3JlYXRlRW5hYmxlUGx1Z2luRHJvcERvd24oaXRlbS5wbHVnaW4sIHRoaXMuYWdlbnRQbHVnaW5TZXJ2aWNlLmVuYWJsZW1lbnRNb2RlbCwgd29ya3NwYWNlU2VydmljZSkpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKGNyZWF0ZURpc2FibGVQbHVnaW5Ecm9wRG93bihpdGVtLnBsdWdpbiwgdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UuZW5hYmxlbWVudE1vZGVsLCB3b3Jrc3BhY2VTZXJ2aWNlKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHVuaW5zdGFsbEFjdGlvbiA9IGNyZWF0ZVVuaW5zdGFsbFBsdWdpbkFjdGlvbihpdGVtLnBsdWdpbik7XG5cdFx0aWYgKHVuaW5zdGFsbEFjdGlvbikge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHVuaW5zdGFsbEFjdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBpbnN0YWxsZWRQbHVnaW5Ub0l0ZW0ocGx1Z2luOiBJQWdlbnRQbHVnaW4pOiBJSW5zdGFsbGVkUGx1Z2luSXRlbSB7XG5cdFx0Y29uc3QgbmFtZSA9IHBsdWdpbi5sYWJlbDtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHBsdWdpbi5mcm9tTWFya2V0cGxhY2U/LmRlc2NyaXB0aW9uID8/IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUocGx1Z2luLnVyaSksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0Y29uc3QgbWFya2V0cGxhY2UgPSBwbHVnaW4uZnJvbU1hcmtldHBsYWNlPy5tYXJrZXRwbGFjZTtcblx0XHRyZXR1cm4geyBraW5kOiBBZ2VudFBsdWdpbkl0ZW1LaW5kLkluc3RhbGxlZCwgbmFtZSwgZGVzY3JpcHRpb24sIG1hcmtldHBsYWNlLCBwbHVnaW4gfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmV0Y2hSZWFkbWUoaXRlbTogSUFnZW50UGx1Z2luSXRlbSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRsZXQgcmVhZG1lVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGl0ZW0ua2luZCA9PT0gQWdlbnRQbHVnaW5JdGVtS2luZC5JbnN0YWxsZWQpIHtcblx0XHRcdHJlYWRtZVVyaSA9IGpvaW5QYXRoKGl0ZW0ucGx1Z2luLnVyaSwgJ1JFQURNRS5tZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZWFkbWVVcmkgPSBpdGVtLnJlYWRtZVVyaTtcblx0XHR9XG5cblx0XHRpZiAoIXJlYWRtZVVyaSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGlmIChyZWFkbWVVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgfHwgcmVhZG1lVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlYWRtZVVyaSk7XG5cdFx0XHRcdHJldHVybiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZvciBodHRwcyBHaXRIdWIgVVJMcywgY29udmVydCBibG9iIFVSTCB0byByYXcgVVJMXG5cdFx0aWYgKHJlYWRtZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuaHR0cHMpIHtcblx0XHRcdGxldCByYXdVcmwgPSByZWFkbWVVcmkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGdpdGh1YkJsb2JNYXRjaCA9IHJhd1VybC5tYXRjaCgvXmh0dHBzOlxcL1xcL2dpdGh1YlxcLmNvbVxcLyg/PG93bmVyPlteL10rKVxcLyg/PHJlcG8+W14vXSspXFwvYmxvYlxcLyg/PHJlc3Q+LispJC8pO1xuXHRcdFx0aWYgKGdpdGh1YkJsb2JNYXRjaD8uZ3JvdXBzKSB7XG5cdFx0XHRcdHJhd1VybCA9IGBodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vJHtnaXRodWJCbG9iTWF0Y2guZ3JvdXBzWydvd25lciddfS8ke2dpdGh1YkJsb2JNYXRjaC5ncm91cHNbJ3JlcG8nXX0vJHtnaXRodWJCbG9iTWF0Y2guZ3JvdXBzWydyZXN0J119YDtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoeyB0eXBlOiAnR0VUJywgdXJsOiByYXdVcmwsIGNhbGxTaXRlOiAnYWdlbnRQbHVnaW5FZGl0b3IuZmV0Y2hSZWFkbWUnIH0sIHRva2VuKTtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IGFzVGV4dChjb250ZXh0KTtcblx0XHRcdFx0cmV0dXJuIHRleHQgPz8gJyc7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkRldGFpbHMoaXRlbTogSUFnZW50UGx1Z2luSXRlbSwgdGVtcGxhdGU6IElBZ2VudFBsdWdpbkVkaXRvclRlbXBsYXRlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY3RpdmVFbGVtZW50IHwgbnVsbD4ge1xuXHRcdGNvbnN0IGRldGFpbHMgPSBhcHBlbmQodGVtcGxhdGUuY29udGVudCwgJCgnLmRldGFpbHMnKSk7XG5cdFx0Y29uc3QgcmVhZG1lQ29udGFpbmVyID0gYXBwZW5kKGRldGFpbHMsICQoJy5jb250ZW50LWNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IGxheW91dCA9ICgpID0+IGRldGFpbHMuY2xhc3NMaXN0LnRvZ2dsZSgnbmFycm93JywgdGhpcy5kaW1lbnNpb24gIT09IHVuZGVmaW5lZCAmJiB0aGlzLmRpbWVuc2lvbi53aWR0aCA8IDUwMCk7XG5cdFx0bGF5b3V0KCk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZShhcnJheXMuaW5zZXJ0KHRoaXMubGF5b3V0UGFydGljaXBhbnRzLCB7IGxheW91dCB9KSkpO1xuXG5cdFx0cmV0dXJuIHRoaXMub3Blbk1hcmtkb3duKHRoaXMucGx1Z2luUmVhZG1lIS5nZXQoKSwgbG9jYWxpemUoJ25vUmVhZG1lJywgXCJObyBSRUFETUUgYXZhaWxhYmxlLlwiKSwgcmVhZG1lQ29udGFpbmVyLCBXZWJ2aWV3SW5kZXguUmVhZG1lLCBsb2NhbGl6ZSgnUmVhZG1lIHRpdGxlJywgXCJSZWFkbWVcIiksIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbk1hcmtkb3duKGNhY2hlUmVzdWx0OiBDYWNoZVJlc3VsdDxzdHJpbmc+LCBub0NvbnRlbnRDb3B5OiBzdHJpbmcsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHdlYnZpZXdJbmRleDogV2Vidmlld0luZGV4LCB0aXRsZTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY3RpdmVFbGVtZW50IHwgbnVsbD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBib2R5ID0gYXdhaXQgdGhpcy5yZW5kZXJNYXJrZG93bihjYWNoZVJlc3VsdCwgY29udGFpbmVyLCB0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdlYnZpZXcgPSB0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy53ZWJ2aWV3U2VydmljZS5jcmVhdGVXZWJ2aWV3T3ZlcmxheSh7XG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZW5hYmxlRmluZFdpZGdldDogdHJ1ZSxcblx0XHRcdFx0XHR0cnlSZXN0b3JlU2Nyb2xsUG9zaXRpb246IHRydWUsXG5cdFx0XHRcdFx0ZGlzYWJsZVNlcnZpY2VXb3JrZXI6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbnRlbnRPcHRpb25zOiB7fSxcblx0XHRcdFx0ZXh0ZW5zaW9uOiB1bmRlZmluZWQsXG5cdFx0XHR9KSk7XG5cblx0XHRcdHdlYnZpZXcuaW5pdGlhbFNjcm9sbFByb2dyZXNzID0gdGhpcy5pbml0aWFsU2Nyb2xsUHJvZ3Jlc3MuZ2V0KHdlYnZpZXdJbmRleCkgfHwgMDtcblxuXHRcdFx0d2Vidmlldy5jbGFpbSh0aGlzLCB0aGlzLndpbmRvdywgdW5kZWZpbmVkKTtcblx0XHRcdHNldFBhcmVudEZsb3dUbyh3ZWJ2aWV3LmNvbnRhaW5lciwgY29udGFpbmVyKTtcblx0XHRcdHdlYnZpZXcuc2V0QW5jaG9yRWxlbWVudChjb250YWluZXIpO1xuXG5cdFx0XHR3ZWJ2aWV3LnNldEh0bWwoYm9keSk7XG5cdFx0XHR3ZWJ2aWV3LmNsYWltKHRoaXMsIHRoaXMud2luZG93LCB1bmRlZmluZWQpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQod2Vidmlldy5vbkRpZEZvY3VzKCgpID0+IHRoaXMuX29uRGlkRm9jdXM/LmZpcmUoKSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQod2Vidmlldy5vbkRpZFNjcm9sbCgoKSA9PiB0aGlzLmluaXRpYWxTY3JvbGxQcm9ncmVzcy5zZXQod2Vidmlld0luZGV4LCB3ZWJ2aWV3LmluaXRpYWxTY3JvbGxQcm9ncmVzcykpKTtcblxuXHRcdFx0Y29uc3QgcmVtb3ZlTGF5b3V0UGFydGljaXBhbnQgPSBhcnJheXMuaW5zZXJ0KHRoaXMubGF5b3V0UGFydGljaXBhbnRzLCB7XG5cdFx0XHRcdGxheW91dDogKCkgPT4ge1xuXHRcdFx0XHRcdHdlYnZpZXcuc2V0QW5jaG9yRWxlbWVudChjb250YWluZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUocmVtb3ZlTGF5b3V0UGFydGljaXBhbnQpKTtcblxuXHRcdFx0bGV0IGlzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBpc0Rpc3Bvc2VkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgYm9keSA9IGF3YWl0IHRoaXMucmVuZGVyTWFya2Rvd24oY2FjaGVSZXN1bHQsIGNvbnRhaW5lcik7XG5cdFx0XHRcdGlmICghaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHdlYnZpZXcuc2V0SHRtbChib2R5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQod2Vidmlldy5vbkRpZENsaWNrTGluayhsaW5rID0+IHtcblx0XHRcdFx0aWYgKCFsaW5rKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMuaHR0cCkgfHwgbWF0Y2hlc1NjaGVtZShsaW5rLCBTY2hlbWFzLmh0dHBzKSB8fCBtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMubWFpbHRvKSkge1xuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGxpbmspO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJldHVybiB3ZWJ2aWV3O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnN0IHAgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdwLm5vY29udGVudCcpKTtcblx0XHRcdHAudGV4dENvbnRlbnQgPSBub0NvbnRlbnRDb3B5O1xuXHRcdFx0cmV0dXJuIHA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXJNYXJrZG93bihjYWNoZVJlc3VsdDogQ2FjaGVSZXN1bHQ8c3RyaW5nPiwgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCB0aGlzLmxvYWRDb250ZW50cygoKSA9PiBjYWNoZVJlc3VsdCwgY29udGFpbmVyKTtcblx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHJlbmRlck1hcmtkb3duRG9jdW1lbnQoY29udGVudHMsIHRoaXMuZXh0ZW5zaW9uU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHt9LCB0b2tlbik7XG5cdFx0aWYgKHRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJlbmRlckJvZHkoY29udGVudCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckJvZHkoYm9keTogVHJ1c3RlZEhUTUwpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG5vbmNlID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRDb2xvck1hcCgpO1xuXHRcdGNvbnN0IGNzcyA9IGNvbG9yTWFwID8gZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcChjb2xvck1hcCkgOiAnJztcblx0XHRyZXR1cm4gYDwhRE9DVFlQRSBodG1sPlxuXHRcdDxodG1sPlxuXHRcdFx0PGhlYWQ+XG5cdFx0XHRcdDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LXR5cGVcIiBjb250ZW50PVwidGV4dC9odG1sO2NoYXJzZXQ9VVRGLThcIj5cblx0XHRcdFx0PG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtU2VjdXJpdHktUG9saWN5XCIgY29udGVudD1cImRlZmF1bHQtc3JjICdub25lJzsgaW1nLXNyYyBodHRwczogZGF0YTo7IG1lZGlhLXNyYyBodHRwczo7IHNjcmlwdC1zcmMgJ25vbmUnOyBzdHlsZS1zcmMgJ25vbmNlLSR7bm9uY2V9JztcIj5cblx0XHRcdFx0PHN0eWxlIG5vbmNlPVwiJHtub25jZX1cIj5cblx0XHRcdFx0XHQke0RFRkFVTFRfTUFSS0RPV05fU1RZTEVTfVxuXG5cdFx0XHRcdFx0Ym9keSB7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLWJvdHRvbTogNzVweDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjc2Nyb2xsLXRvLXRvcCB7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogZml4ZWQ7XG5cdFx0XHRcdFx0XHR3aWR0aDogMzJweDtcblx0XHRcdFx0XHRcdGhlaWdodDogMzJweDtcblx0XHRcdFx0XHRcdHJpZ2h0OiAyNXB4O1xuXHRcdFx0XHRcdFx0Ym90dG9tOiAyNXB4O1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlCYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHRcdGJvcmRlci1jb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1ib3JkZXIpO1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXJhZGl1czogNTAlO1xuXHRcdFx0XHRcdFx0Y3Vyc29yOiBwb2ludGVyO1xuXHRcdFx0XHRcdFx0Ym94LXNoYWRvdzogMXB4IDFweCAxcHggcmdiYSgwLDAsMCwuMjUpO1xuXHRcdFx0XHRcdFx0b3V0bGluZTogbm9uZTtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGZsZXg7XG5cdFx0XHRcdFx0XHRqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcblx0XHRcdFx0XHRcdGFsaWduLWl0ZW1zOiBjZW50ZXI7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3Njcm9sbC10by10b3A6aG92ZXIge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlIb3ZlckJhY2tncm91bmQpO1xuXHRcdFx0XHRcdFx0Ym94LXNoYWRvdzogMnB4IDJweCAycHggcmdiYSgwLDAsMCwuMjUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGJvZHkudnNjb2RlLWhpZ2gtY29udHJhc3QgI3Njcm9sbC10by10b3Age1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXdpZHRoOiAycHg7XG5cdFx0XHRcdFx0XHRib3JkZXItc3R5bGU6IHNvbGlkO1xuXHRcdFx0XHRcdFx0Ym94LXNoYWRvdzogbm9uZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjc2Nyb2xsLXRvLXRvcCBzcGFuLmljb246OmJlZm9yZSB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBcIlwiO1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiB2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUZvcmVncm91bmQpO1xuXHRcdFx0XHRcdFx0LXdlYmtpdC1tYXNrLWltYWdlOiB1cmwoJ2RhdGE6aW1hZ2Uvc3ZnK3htbDtiYXNlNjQsUEQ5NGJXd2dkbVZ5YzJsdmJqMGlNUzR3SWlCbGJtTnZaR2x1WnowaWRYUm1MVGdpUHo0S1BDRXRMU0JIWlc1bGNtRjBiM0k2SUVGa2IySmxJRWxzYkhWemRISmhkRzl5SURFNUxqSXVNQ3dnVTFaSElFVjRjRzl5ZENCUWJIVm5MVWx1SUM0Z1UxWkhJRlpsY25OcGIyNDZJRFl1TURBZ1FuVnBiR1FnTUNrZ0lDMHRQZ284YzNabklIWmxjbk5wYjI0OUlqRXVNU0lnYVdROUlreGhlV1Z5WHpFaUlIaHRiRzV6UFNKb2RIUndPaTh2ZDNkM0xuY3pMbTl5Wnk4eU1EQXdMM04yWnlJZ2VHMXNibk02ZUd4cGJtczlJbWgwZEhBNkx5OTNkM2N1ZHpNdWIzSm5MekU1T1RrdmVHeHBibXNpSUhnOUlqQndlQ0lnZVQwaU1IQjRJZ29KSUhacFpYZENiM2c5SWpBZ01DQXhOaUF4TmlJZ2MzUjViR1U5SW1WdVlXSnNaUzFpWVdOclozSnZkVzVrT201bGR5QXdJREFnTVRZZ01UWTdJaUI0Yld3NmMzQmhZMlU5SW5CeVpYTmxjblpsSWo0S1BITjBlV3hsSUhSNWNHVTlJblJsZUhRdlkzTnpJajRLQ1M1emREQjdabWxzYkRvalJrWkdSa1pHTzMwS0NTNXpkREY3Wm1sc2JEcHViMjVsTzMwS1BDOXpkSGxzWlQ0S1BIUnBkR3hsUG5Wd1kyaGxkbkp2Ymp3dmRHbDBiR1UrQ2p4d1lYUm9JR05zWVhOelBTSnpkREFpSUdROUlrMDRMRFV1TVd3dE55NHpMRGN1TTB3d0xERXhMalpzT0MwNGJEZ3NPR3d0TUM0M0xEQXVOMHc0TERVdU1Yb2lMejRLUEhKbFkzUWdZMnhoYzNNOUluTjBNU0lnZDJsa2RHZzlJakUySWlCb1pXbG5hSFE5SWpFMklpOCtDand2YzNablBnbz0nKTtcblx0XHRcdFx0XHRcdHdpZHRoOiAxNnB4O1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiAxNnB4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQke2Nzc31cblx0XHRcdFx0PC9zdHlsZT5cblx0XHRcdDwvaGVhZD5cblx0XHRcdDxib2R5PlxuXHRcdFx0XHQ8YSBpZD1cInNjcm9sbC10by10b3BcIiByb2xlPVwiYnV0dG9uXCIgYXJpYS1sYWJlbD1cInNjcm9sbCB0byB0b3BcIiBocmVmPVwiI1wiPjxzcGFuIGNsYXNzPVwiaWNvblwiPjwvc3Bhbj48L2E+XG5cdFx0XHRcdCR7Ym9keX1cblx0XHRcdDwvYm9keT5cblx0XHQ8L2h0bWw+YDtcblx0fVxuXG5cdHByaXZhdGUgbG9hZENvbnRlbnRzPFQ+KGxvYWRpbmdUYXNrOiAoKSA9PiBDYWNoZVJlc3VsdDxUPiwgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFByb21pc2U8VD4ge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdsb2FkaW5nJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQobG9hZGluZ1Rhc2soKSk7XG5cdFx0Y29uc3Qgb25Eb25lID0gKCkgPT4gY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2xvYWRpbmcnKTtcblx0XHRyZXN1bHQucHJvbWlzZS50aGVuKG9uRG9uZSwgb25Eb25lKTtcblxuXHRcdHJldHVybiByZXN1bHQucHJvbWlzZTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLmFjdGl2ZUVsZW1lbnQ/LmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGFjdGl2ZVdlYnZpZXcoKTogSVdlYnZpZXcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5hY3RpdmVFbGVtZW50IHx8ICEodGhpcy5hY3RpdmVFbGVtZW50IGFzIElXZWJ2aWV3KS5ydW5GaW5kQWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5hY3RpdmVFbGVtZW50IGFzIElXZWJ2aWV3O1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0dGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMuZm9yRWFjaChwID0+IHAubGF5b3V0KCkpO1xuXHR9XG59XG5cbmNsYXNzIFVwZGF0ZVBsdWdpbkVkaXRvckFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdhZ2VudFBsdWdpbi5lZGl0b3IudXBkYXRlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogSUFnZW50UGx1Z2luLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGl2ZU1hcmtldHBsYWNlUGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4sXG5cdFx0QElQbHVnaW5JbnN0YWxsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbkluc3RhbGxTZXJ2aWNlOiBJUGx1Z2luSW5zdGFsbFNlcnZpY2UsXG5cdFx0QElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2U6IElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFVwZGF0ZVBsdWdpbkVkaXRvckFjdGlvbi5JRCwgbG9jYWxpemUoJ3VwZGF0ZScsIFwiVXBkYXRlXCIpLCAnZXh0ZW5zaW9uLWFjdGlvbiBsYWJlbCBwcm9taW5lbnQgaW5zdGFsbCcpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhd2FpdCB0aGlzLnBsdWdpbkluc3RhbGxTZXJ2aWNlLnVwZGF0ZVBsdWdpbih0aGlzLmxpdmVNYXJrZXRwbGFjZVBsdWdpbikpIHtcblx0XHRcdHRoaXMucGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbih0aGlzLnBsdWdpbi51cmksIHRoaXMubGl2ZU1hcmtldHBsYWNlUGx1Z2luKTtcblx0XHR9XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBYyxXQUFXLHVCQUF1QixRQUFRLE9BQU8sdUJBQXVCO0FBQy9GLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsY0FBdUI7QUFDaEMsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsYUFBMEI7QUFDbkMsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLFNBQVMscUJBQXFCO0FBQ3ZDLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMsU0FBUyxnQkFBZ0I7QUFDbEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLGNBQWM7QUFDeEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUIsOEJBQThCO0FBQ2hFLFNBQW1CLHVCQUF1QjtBQUMxQyxTQUF1QiwyQkFBMkI7QUFDbEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBc0MsaUNBQWlDO0FBRWhGLFNBQVMsMkJBQW1FO0FBQzVFLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0JBQXdCLDhCQUE4QjtBQUMvRCxTQUFTLHFCQUFxQiw2QkFBNkIsNEJBQTRCLDZCQUE2QixpQ0FBaUMsdUJBQXVCLDBCQUEwQix3Q0FBd0M7QUFD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O0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBakNVO0FBK2ZiLElBQU0sMkJBQU4sY0FBdUMsT0FBTztBQUFBLEVBRzdDLFlBQ2tCLFFBQ0EsdUJBQ3VCLHNCQUNJLDBCQUMzQztBQUNELFVBQU0seUJBQXlCLElBQUksU0FBUyxVQUFVLFFBQVEsR0FBRywwQ0FBMEM7QUFMMUY7QUFDQTtBQUN1QjtBQUNJO0FBQUEsRUFHN0M7QUFBQSxFQUVBLE1BQWUsTUFBcUI7QUFDbkMsUUFBSSxNQUFNLEtBQUsscUJBQXFCLGFBQWEsS0FBSyxxQkFBcUIsR0FBRztBQUM3RSxXQUFLLHlCQUF5QixtQkFBbUIsS0FBSyxPQUFPLEtBQUssS0FBSyxxQkFBcUI7QUFBQSxJQUM3RjtBQUFBLEVBQ0Q7QUFDRDtBQWpCTSx5QkFDVyxLQUFLO0FBRGhCLDJCQUFOO0FBQUEsRUFNRztBQUFBLEVBQ0E7QUFBQSxHQVBHOyIsCiAgIm5hbWVzIjogWyJXZWJ2aWV3SW5kZXgiLCAiY3VycmVudEl0ZW0iLCAiaXRlbSIsICJib2R5Il0KfQo=
