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
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { verifiedPublisherIcon } from "../../../services/extensionManagement/common/extensionsIcons.js";
import { McpServerInstallState } from "../common/mcpTypes.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { Emitter } from "../../../../base/common/event.js";
import { reset } from "../../../../base/browser/dom.js";
import { mcpLicenseIcon, mcpServerIcon, mcpServerRemoteIcon, mcpServerWorkspaceIcon, mcpStarredIcon } from "./mcpServerIcons.js";
import { escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../base/common/htmlContent.js";
import { ExtensionIconBadge } from "../../extensions/browser/extensionsWidgets.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { LocalMcpServerScope } from "../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { registerColor } from "../../../../platform/theme/common/colorUtils.js";
import { textLinkForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
class McpServerWidget extends Disposable {
  constructor() {
    super(...arguments);
    this._mcpServer = null;
  }
  get mcpServer() {
    return this._mcpServer;
  }
  set mcpServer(mcpServer) {
    this._mcpServer = mcpServer;
    this.update();
  }
  update() {
    this.render();
  }
}
function onClick(element, callback) {
  const disposables = new DisposableStore();
  disposables.add(dom.addDisposableListener(element, dom.EventType.CLICK, dom.finalHandler(callback)));
  disposables.add(dom.addDisposableListener(element, dom.EventType.KEY_UP, (e) => {
    const keyboardEvent = new StandardKeyboardEvent(e);
    if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
      e.preventDefault();
      e.stopPropagation();
      callback();
    }
  }));
  return disposables;
}
let McpServerIconWidget = class extends McpServerWidget {
  constructor(container, themeService) {
    super();
    this.themeService = themeService;
    this.iconLoadingDisposable = this._register(new MutableDisposable());
    this.element = dom.append(container, dom.$(".extension-icon"));
    this.iconElement = dom.append(this.element, dom.$("img.icon", { alt: "" }));
    this.iconElement.style.display = "none";
    this.codiconIconElement = dom.append(this.element, dom.$(ThemeIcon.asCSSSelector(mcpServerIcon)));
    this.codiconIconElement.style.display = "none";
    this.render();
    this._register(toDisposable(() => this.clear()));
    this._register(this.themeService.onDidColorThemeChange(() => this.render()));
  }
  clear() {
    this.iconUrl = void 0;
    this.iconElement.src = "";
    this.iconElement.style.display = "none";
    this.codiconIconElement.style.display = "none";
    this.codiconIconElement.className = ThemeIcon.asClassName(mcpServerIcon);
    this.iconLoadingDisposable.clear();
  }
  render() {
    if (!this.mcpServer) {
      this.clear();
      return;
    }
    if (this.mcpServer.icon) {
      const type = this.themeService.getColorTheme().type;
      const iconUrl = isDark(type) ? this.mcpServer.icon.dark : this.mcpServer.icon.light;
      if (this.iconUrl !== iconUrl) {
        this.iconElement.style.display = "inherit";
        this.codiconIconElement.style.display = "none";
        this.iconUrl = iconUrl;
        this.iconLoadingDisposable.value = dom.addDisposableListener(this.iconElement, "error", () => {
          this.iconElement.style.display = "none";
          this.codiconIconElement.style.display = "inherit";
        }, { once: true });
        this.iconElement.src = this.iconUrl;
        if (!this.iconElement.complete) {
          this.iconElement.style.visibility = "hidden";
          this.iconElement.onload = () => this.iconElement.style.visibility = "inherit";
        } else {
          this.iconElement.style.visibility = "inherit";
        }
      }
    } else {
      this.iconUrl = void 0;
      this.iconElement.style.display = "none";
      this.iconElement.src = "";
      this.codiconIconElement.className = this.mcpServer.codicon ? `codicon ${this.mcpServer.codicon}` : ThemeIcon.asClassName(mcpServerIcon);
      this.codiconIconElement.style.display = "inherit";
      this.iconLoadingDisposable.clear();
    }
  }
};
McpServerIconWidget = __decorateClass([
  __decorateParam(1, IThemeService)
], McpServerIconWidget);
let PublisherWidget = class extends McpServerWidget {
  constructor(container, small, hoverService, openerService) {
    super();
    this.container = container;
    this.small = small;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.disposables = this._register(new DisposableStore());
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.element?.remove();
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.mcpServer?.publisherDisplayName) {
      return;
    }
    this.element = dom.append(this.container, dom.$(".publisher"));
    const publisherDisplayName = dom.$(".publisher-name.ellipsis");
    publisherDisplayName.textContent = this.mcpServer.publisherDisplayName;
    const verifiedPublisher = dom.$(".verified-publisher");
    dom.append(verifiedPublisher, dom.$("span.extension-verified-publisher.clickable"), renderIcon(verifiedPublisherIcon));
    if (this.small) {
      if (this.mcpServer.gallery?.publisherDomain?.verified) {
        dom.append(this.element, verifiedPublisher);
      }
      dom.append(this.element, publisherDisplayName);
    } else {
      this.element.classList.toggle("clickable", !!this.mcpServer.gallery?.publisherUrl);
      this.element.setAttribute("role", "button");
      this.element.tabIndex = 0;
      this.containerHover = this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, localize("publisher", "Publisher ({0})", this.mcpServer.publisherDisplayName)));
      dom.append(this.element, publisherDisplayName);
      if (this.mcpServer.gallery?.publisherDomain?.verified) {
        dom.append(this.element, verifiedPublisher);
        const publisherDomainLink = URI.parse(this.mcpServer.gallery?.publisherDomain.link);
        verifiedPublisher.tabIndex = 0;
        verifiedPublisher.setAttribute("role", "button");
        this.containerHover.update(localize("verified publisher", "This publisher has verified ownership of {0}", this.mcpServer.gallery?.publisherDomain.link));
        verifiedPublisher.setAttribute("role", "link");
        dom.append(verifiedPublisher, dom.$("span.extension-verified-publisher-domain", void 0, publisherDomainLink.authority.startsWith("www.") ? publisherDomainLink.authority.substring(4) : publisherDomainLink.authority));
        this.disposables.add(onClick(verifiedPublisher, () => this.openerService.open(publisherDomainLink)));
      }
      if (this.mcpServer.gallery?.publisherUrl) {
        this.disposables.add(onClick(this.element, () => this.openerService.open(this.mcpServer?.gallery?.publisherUrl)));
      }
    }
  }
};
PublisherWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IOpenerService)
], PublisherWidget);
class StarredWidget extends McpServerWidget {
  constructor(container, small) {
    super();
    this.container = container;
    this.small = small;
    this.disposables = this._register(new DisposableStore());
    this.container.classList.add("extension-ratings");
    if (this.small) {
      container.classList.add("small");
    }
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.container.innerText = "";
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.mcpServer?.starsCount) {
      return;
    }
    if (this.small && this.mcpServer.installState !== McpServerInstallState.Uninstalled) {
      return;
    }
    const parent = this.small ? this.container : dom.append(this.container, dom.$("span.rating", { tabIndex: 0 }));
    dom.append(parent, dom.$("span" + ThemeIcon.asCSSSelector(mcpStarredIcon)));
    const ratingCountElement = dom.append(parent, dom.$("span.count", void 0, StarredWidget.getCountLabel(this.mcpServer.starsCount)));
    if (!this.small) {
      ratingCountElement.style.paddingLeft = "3px";
    }
  }
  static getCountLabel(starsCount) {
    if (starsCount > 1e6) {
      return `${Math.floor(starsCount / 1e5) / 10}M`;
    } else if (starsCount > 1e3) {
      return `${Math.floor(starsCount / 1e3)}K`;
    } else {
      return String(starsCount);
    }
  }
}
class LicenseWidget extends McpServerWidget {
  constructor(container) {
    super();
    this.container = container;
    this.disposables = this._register(new DisposableStore());
    this.container.classList.add("license");
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.container.innerText = "";
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.mcpServer?.license) {
      return;
    }
    const parent = dom.append(this.container, dom.$("span.license", { tabIndex: 0 }));
    dom.append(parent, dom.$("span" + ThemeIcon.asCSSSelector(mcpLicenseIcon)));
    const licenseElement = dom.append(parent, dom.$("span", void 0, this.mcpServer.license));
    licenseElement.style.paddingLeft = "3px";
  }
}
let McpServerHoverWidget = class extends McpServerWidget {
  constructor(options, mcpServerStatusAction, hoverService, configurationService) {
    super();
    this.options = options;
    this.mcpServerStatusAction = mcpServerStatusAction;
    this.hoverService = hoverService;
    this.configurationService = configurationService;
    this.hover = this._register(new MutableDisposable());
  }
  render() {
    this.hover.value = void 0;
    if (this.mcpServer) {
      this.hover.value = this.hoverService.setupManagedHover(
        {
          delay: this.configurationService.getValue("workbench.hover.delay"),
          showHover: (options, focus) => {
            return this.hoverService.showInstantHover({
              ...options,
              additionalClasses: ["extension-hover"],
              position: {
                hoverPosition: this.options.position(),
                forcePosition: true
              },
              persistence: {
                hideOnKeyDown: true
              }
            }, focus);
          },
          placement: "element"
        },
        this.options.target,
        {
          markdown: () => Promise.resolve(this.getHoverMarkdown()),
          markdownNotSupportedFallback: void 0
        },
        {
          appearance: {
            showHoverHint: true
          }
        }
      );
    }
  }
  getHoverMarkdown() {
    if (!this.mcpServer) {
      return void 0;
    }
    const markdown = new MarkdownString("", { isTrusted: false, supportThemeIcons: true });
    markdown.appendMarkdown(`**${escapeMarkdownSyntaxTokens(this.mcpServer.label)}**`);
    markdown.appendText(`
`);
    let addSeparator = false;
    if (this.mcpServer.local?.scope === LocalMcpServerScope.Workspace) {
      markdown.appendMarkdown(`$(${mcpServerWorkspaceIcon.id})&nbsp;`);
      markdown.appendMarkdown(localize("workspace extension", "Workspace MCP Server"));
      addSeparator = true;
    }
    if (this.mcpServer.local?.scope === LocalMcpServerScope.RemoteUser) {
      markdown.appendMarkdown(`$(${mcpServerRemoteIcon.id})&nbsp;`);
      markdown.appendMarkdown(localize("remote user extension", "Remote MCP Server"));
      addSeparator = true;
    }
    if (this.mcpServer.installState === McpServerInstallState.Installed) {
      if (this.mcpServer.starsCount) {
        if (addSeparator) {
          markdown.appendText(`  |  `);
        }
        const starsCountLabel = StarredWidget.getCountLabel(this.mcpServer.starsCount);
        markdown.appendMarkdown(`$(${mcpStarredIcon.id}) ${starsCountLabel}`);
        addSeparator = true;
      }
    }
    if (addSeparator) {
      markdown.appendText(`
`);
    }
    if (this.mcpServer.description) {
      markdown.appendMarkdown(escapeMarkdownSyntaxTokens(this.mcpServer.description));
    }
    const extensionStatus = this.mcpServerStatusAction.status;
    if (extensionStatus.length) {
      markdown.appendMarkdown(`---`);
      markdown.appendText(`
`);
      for (const status of extensionStatus) {
        if (status.icon) {
          markdown.appendMarkdown(`$(${status.icon.id})&nbsp;`);
        }
        markdown.appendMarkdown(status.message.value);
        markdown.appendText(`
`);
      }
    }
    return markdown;
  }
};
McpServerHoverWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IConfigurationService)
], McpServerHoverWidget);
let McpServerScopeBadgeWidget = class extends McpServerWidget {
  constructor(container, instantiationService) {
    super();
    this.container = container;
    this.instantiationService = instantiationService;
    this.badge = this._register(new MutableDisposable());
    this.element = dom.append(this.container, dom.$(""));
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.badge.value?.element.remove();
    this.badge.clear();
  }
  render() {
    this.clear();
    const scope = this.mcpServer?.local?.scope;
    if (!scope || scope === LocalMcpServerScope.User) {
      return;
    }
    let icon;
    switch (scope) {
      case LocalMcpServerScope.Workspace: {
        icon = mcpServerWorkspaceIcon;
        break;
      }
      case LocalMcpServerScope.RemoteUser: {
        icon = mcpServerRemoteIcon;
        break;
      }
    }
    this.badge.value = this.instantiationService.createInstance(ExtensionIconBadge, icon, void 0);
    dom.append(this.element, this.badge.value.element);
  }
};
McpServerScopeBadgeWidget = __decorateClass([
  __decorateParam(1, IInstantiationService)
], McpServerScopeBadgeWidget);
let McpServerStatusWidget = class extends McpServerWidget {
  constructor(container, extensionStatusAction, markdownRendererService) {
    super();
    this.container = container;
    this.extensionStatusAction = extensionStatusAction;
    this.markdownRendererService = markdownRendererService;
    this.renderDisposables = this._register(new MutableDisposable());
    this._onDidRender = this._register(new Emitter());
    this.onDidRender = this._onDidRender.event;
    this.render();
    this._register(extensionStatusAction.onDidChangeStatus(() => this.render()));
  }
  render() {
    reset(this.container);
    this.renderDisposables.value = void 0;
    const disposables = new DisposableStore();
    this.renderDisposables.value = disposables;
    const extensionStatus = this.extensionStatusAction.status;
    if (extensionStatus.length) {
      const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
      for (let i = 0; i < extensionStatus.length; i++) {
        const status = extensionStatus[i];
        if (status.icon) {
          markdown.appendMarkdown(`$(${status.icon.id})&nbsp;`);
        }
        markdown.appendMarkdown(status.message.value);
        if (i < extensionStatus.length - 1) {
          markdown.appendText(`
`);
        }
      }
      const rendered = disposables.add(this.markdownRendererService.render(markdown));
      dom.append(this.container, rendered.element);
    }
    this._onDidRender.fire();
  }
};
McpServerStatusWidget = __decorateClass([
  __decorateParam(2, IMarkdownRendererService)
], McpServerStatusWidget);
const mcpStarredIconColor = registerColor("mcpIcon.starForeground", { light: "#DF6100", dark: "#FF8E00", hcDark: "#FF8E00", hcLight: textLinkForeground }, localize("mcpIconStarForeground", "The icon color for mcp starred."), false);
registerThemingParticipant((theme, collector) => {
  const mcpStarredIconColorValue = theme.getColor(mcpStarredIconColor);
  if (mcpStarredIconColorValue) {
    collector.addRule(`.extension-ratings .codicon-mcp-server-starred { color: ${mcpStarredIconColorValue}; }`);
    collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(mcpStarredIcon)} { color: ${mcpStarredIconColorValue}; }`);
  }
});
export {
  LicenseWidget,
  McpServerHoverWidget,
  McpServerIconWidget,
  McpServerScopeBadgeWidget,
  McpServerStatusWidget,
  McpServerWidget,
  PublisherWidget,
  StarredWidget,
  mcpStarredIconColor,
  onClick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwU2VydmVyV2lkZ2V0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgdmVyaWZpZWRQdWJsaXNoZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2ZXJDb250YWluZXIsIElXb3JrYmVuY2hNY3BTZXJ2ZXIsIE1jcFNlcnZlckluc3RhbGxTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNEYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyU3RhdHVzQWN0aW9uIH0gZnJvbSAnLi9tY3BTZXJ2ZXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtY3BMaWNlbnNlSWNvbiwgbWNwU2VydmVySWNvbiwgbWNwU2VydmVyUmVtb3RlSWNvbiwgbWNwU2VydmVyV29ya3NwYWNlSWNvbiwgbWNwU3RhcnJlZEljb24gfSBmcm9tICcuL21jcFNlcnZlckljb25zLmpzJztcbmltcG9ydCB7IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvdmVyT3B0aW9ucywgRXh0ZW5zaW9uSWNvbkJhZGdlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNXaWRnZXRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTG9jYWxNY3BTZXJ2ZXJTY29wZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL21jcC9jb21tb24vbWNwV29ya2JlbmNoTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yVXRpbHMuanMnO1xuaW1wb3J0IHsgdGV4dExpbmtGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIE1jcFNlcnZlcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwU2VydmVyQ29udGFpbmVyIHtcblx0cHJpdmF0ZSBfbWNwU2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyIHwgbnVsbCA9IG51bGw7XG5cdGdldCBtY3BTZXJ2ZXIoKTogSVdvcmtiZW5jaE1jcFNlcnZlciB8IG51bGwgeyByZXR1cm4gdGhpcy5fbWNwU2VydmVyOyB9XG5cdHNldCBtY3BTZXJ2ZXIobWNwU2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyIHwgbnVsbCkgeyB0aGlzLl9tY3BTZXJ2ZXIgPSBtY3BTZXJ2ZXI7IHRoaXMudXBkYXRlKCk7IH1cblx0dXBkYXRlKCk6IHZvaWQgeyB0aGlzLnJlbmRlcigpOyB9XG5cdGFic3RyYWN0IHJlbmRlcigpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb25DbGljayhlbGVtZW50OiBIVE1MRWxlbWVudCwgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGRvbS5maW5hbEhhbmRsZXIoY2FsbGJhY2spKSk7XG5cdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGRvbS5FdmVudFR5cGUuS0VZX1VQLCBlID0+IHtcblx0XHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgfHwga2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRjYWxsYmFjaygpO1xuXHRcdH1cblx0fSkpO1xuXHRyZXR1cm4gZGlzcG9zYWJsZXM7XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BTZXJ2ZXJJY29uV2lkZ2V0IGV4dGVuZHMgTWNwU2VydmVyV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGljb25Mb2FkaW5nRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBpY29uRWxlbWVudDogSFRNTEltYWdlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjb2RpY29uSWNvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgaWNvblVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5leHRlbnNpb24taWNvbicpKTtcblxuXHRcdHRoaXMuaWNvbkVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgZG9tLiQoJ2ltZy5pY29uJywgeyBhbHQ6ICcnIH0pKTtcblx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHR0aGlzLmNvZGljb25JY29uRWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCBkb20uJChUaGVtZUljb24uYXNDU1NTZWxlY3RvcihtY3BTZXJ2ZXJJY29uKSkpO1xuXHRcdHRoaXMuY29kaWNvbkljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsZWFyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5yZW5kZXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmljb25VcmwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5pY29uRWxlbWVudC5zcmMgPSAnJztcblx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5jb2RpY29uSWNvbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmNvZGljb25JY29uRWxlbWVudC5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUobWNwU2VydmVySWNvbik7XG5cdFx0dGhpcy5pY29uTG9hZGluZ0Rpc3Bvc2FibGUuY2xlYXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubWNwU2VydmVyLmljb24pIHtcblx0XHRcdGNvbnN0IHR5cGUgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZTtcblx0XHRcdGNvbnN0IGljb25VcmwgPSBpc0RhcmsodHlwZSkgPyB0aGlzLm1jcFNlcnZlci5pY29uLmRhcmsgOiB0aGlzLm1jcFNlcnZlci5pY29uLmxpZ2h0O1xuXHRcdFx0aWYgKHRoaXMuaWNvblVybCAhPT0gaWNvblVybCkge1xuXHRcdFx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5oZXJpdCc7XG5cdFx0XHRcdHRoaXMuY29kaWNvbkljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuaWNvblVybCA9IGljb25Vcmw7XG5cdFx0XHRcdHRoaXMuaWNvbkxvYWRpbmdEaXNwb3NhYmxlLnZhbHVlID0gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmljb25FbGVtZW50LCAnZXJyb3InLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHRcdHRoaXMuY29kaWNvbkljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5oZXJpdCc7XG5cdFx0XHRcdH0sIHsgb25jZTogdHJ1ZSB9KTtcblx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5zcmMgPSB0aGlzLmljb25Vcmw7XG5cdFx0XHRcdGlmICghdGhpcy5pY29uRWxlbWVudC5jb21wbGV0ZSkge1xuXHRcdFx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdFx0XHRcdHRoaXMuaWNvbkVsZW1lbnQub25sb2FkID0gKCkgPT4gdGhpcy5pY29uRWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJ2luaGVyaXQnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdpbmhlcml0Jztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmljb25VcmwgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLmljb25FbGVtZW50LnNyYyA9ICcnO1xuXHRcdFx0dGhpcy5jb2RpY29uSWNvbkVsZW1lbnQuY2xhc3NOYW1lID0gdGhpcy5tY3BTZXJ2ZXIuY29kaWNvbiA/IGBjb2RpY29uICR7dGhpcy5tY3BTZXJ2ZXIuY29kaWNvbn1gIDogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKG1jcFNlcnZlckljb24pO1xuXHRcdFx0dGhpcy5jb2RpY29uSWNvbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdpbmhlcml0Jztcblx0XHRcdHRoaXMuaWNvbkxvYWRpbmdEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQdWJsaXNoZXJXaWRnZXQgZXh0ZW5kcyBNY3BTZXJ2ZXJXaWRnZXQge1xuXG5cdHByaXZhdGUgZWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGFpbmVySG92ZXI6IElNYW5hZ2VkSG92ZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHNtYWxsOiBib29sZWFuLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudD8ucmVtb3ZlKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyPy5wdWJsaXNoZXJEaXNwbGF5TmFtZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5jb250YWluZXIsIGRvbS4kKCcucHVibGlzaGVyJykpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlckRpc3BsYXlOYW1lID0gZG9tLiQoJy5wdWJsaXNoZXItbmFtZS5lbGxpcHNpcycpO1xuXHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lLnRleHRDb250ZW50ID0gdGhpcy5tY3BTZXJ2ZXIucHVibGlzaGVyRGlzcGxheU5hbWU7XG5cblx0XHRjb25zdCB2ZXJpZmllZFB1Ymxpc2hlciA9IGRvbS4kKCcudmVyaWZpZWQtcHVibGlzaGVyJyk7XG5cdFx0ZG9tLmFwcGVuZCh2ZXJpZmllZFB1Ymxpc2hlciwgZG9tLiQoJ3NwYW4uZXh0ZW5zaW9uLXZlcmlmaWVkLXB1Ymxpc2hlci5jbGlja2FibGUnKSwgcmVuZGVySWNvbih2ZXJpZmllZFB1Ymxpc2hlckljb24pKTtcblxuXHRcdGlmICh0aGlzLnNtYWxsKSB7XG5cdFx0XHRpZiAodGhpcy5tY3BTZXJ2ZXIuZ2FsbGVyeT8ucHVibGlzaGVyRG9tYWluPy52ZXJpZmllZCkge1xuXHRcdFx0XHRkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgdmVyaWZpZWRQdWJsaXNoZXIpO1xuXHRcdFx0fVxuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2NsaWNrYWJsZScsICEhdGhpcy5tY3BTZXJ2ZXIuZ2FsbGVyeT8ucHVibGlzaGVyVXJsKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHR0aGlzLmVsZW1lbnQudGFiSW5kZXggPSAwO1xuXG5cdFx0XHR0aGlzLmNvbnRhaW5lckhvdmVyID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuZWxlbWVudCwgbG9jYWxpemUoJ3B1Ymxpc2hlcicsIFwiUHVibGlzaGVyICh7MH0pXCIsIHRoaXMubWNwU2VydmVyLnB1Ymxpc2hlckRpc3BsYXlOYW1lKSkpO1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lKTtcblxuXHRcdFx0aWYgKHRoaXMubWNwU2VydmVyLmdhbGxlcnk/LnB1Ymxpc2hlckRvbWFpbj8udmVyaWZpZWQpIHtcblx0XHRcdFx0ZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsIHZlcmlmaWVkUHVibGlzaGVyKTtcblx0XHRcdFx0Y29uc3QgcHVibGlzaGVyRG9tYWluTGluayA9IFVSSS5wYXJzZSh0aGlzLm1jcFNlcnZlci5nYWxsZXJ5Py5wdWJsaXNoZXJEb21haW4ubGluayk7XG5cdFx0XHRcdHZlcmlmaWVkUHVibGlzaGVyLnRhYkluZGV4ID0gMDtcblx0XHRcdFx0dmVyaWZpZWRQdWJsaXNoZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lckhvdmVyLnVwZGF0ZShsb2NhbGl6ZSgndmVyaWZpZWQgcHVibGlzaGVyJywgXCJUaGlzIHB1Ymxpc2hlciBoYXMgdmVyaWZpZWQgb3duZXJzaGlwIG9mIHswfVwiLCB0aGlzLm1jcFNlcnZlci5nYWxsZXJ5Py5wdWJsaXNoZXJEb21haW4ubGluaykpO1xuXHRcdFx0XHR2ZXJpZmllZFB1Ymxpc2hlci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGluaycpO1xuXG5cdFx0XHRcdGRvbS5hcHBlbmQodmVyaWZpZWRQdWJsaXNoZXIsIGRvbS4kKCdzcGFuLmV4dGVuc2lvbi12ZXJpZmllZC1wdWJsaXNoZXItZG9tYWluJywgdW5kZWZpbmVkLCBwdWJsaXNoZXJEb21haW5MaW5rLmF1dGhvcml0eS5zdGFydHNXaXRoKCd3d3cuJykgPyBwdWJsaXNoZXJEb21haW5MaW5rLmF1dGhvcml0eS5zdWJzdHJpbmcoNCkgOiBwdWJsaXNoZXJEb21haW5MaW5rLmF1dGhvcml0eSkpO1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChvbkNsaWNrKHZlcmlmaWVkUHVibGlzaGVyLCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihwdWJsaXNoZXJEb21haW5MaW5rKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5tY3BTZXJ2ZXIuZ2FsbGVyeT8ucHVibGlzaGVyVXJsKSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG9uQ2xpY2sodGhpcy5lbGVtZW50LCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih0aGlzLm1jcFNlcnZlcj8uZ2FsbGVyeT8ucHVibGlzaGVyVXJsISkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBTdGFycmVkV2lkZ2V0IGV4dGVuZHMgTWNwU2VydmVyV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgc21hbGw6IGJvb2xlYW4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZXh0ZW5zaW9uLXJhdGluZ3MnKTtcblx0XHRpZiAodGhpcy5zbWFsbCkge1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NtYWxsJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cblx0XHRpZiAoIXRoaXMubWNwU2VydmVyPy5zdGFyc0NvdW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc21hbGwgJiYgdGhpcy5tY3BTZXJ2ZXIuaW5zdGFsbFN0YXRlICE9PSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuVW5pbnN0YWxsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJlbnQgPSB0aGlzLnNtYWxsID8gdGhpcy5jb250YWluZXIgOiBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCBkb20uJCgnc3Bhbi5yYXRpbmcnLCB7IHRhYkluZGV4OiAwIH0pKTtcblx0XHRkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJ3NwYW4nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IobWNwU3RhcnJlZEljb24pKSk7XG5cblx0XHRjb25zdCByYXRpbmdDb3VudEVsZW1lbnQgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJ3NwYW4uY291bnQnLCB1bmRlZmluZWQsIFN0YXJyZWRXaWRnZXQuZ2V0Q291bnRMYWJlbCh0aGlzLm1jcFNlcnZlci5zdGFyc0NvdW50KSkpO1xuXHRcdGlmICghdGhpcy5zbWFsbCkge1xuXHRcdFx0cmF0aW5nQ291bnRFbGVtZW50LnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzNweCc7XG5cdFx0fVxuXHR9XG5cblx0c3RhdGljIGdldENvdW50TGFiZWwoc3RhcnNDb3VudDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRpZiAoc3RhcnNDb3VudCA+IDEwMDAwMDApIHtcblx0XHRcdHJldHVybiBgJHtNYXRoLmZsb29yKHN0YXJzQ291bnQgLyAxMDAwMDApIC8gMTB9TWA7XG5cdFx0fSBlbHNlIGlmIChzdGFyc0NvdW50ID4gMTAwMCkge1xuXHRcdFx0cmV0dXJuIGAke01hdGguZmxvb3Ioc3RhcnNDb3VudCAvIDEwMDApfUtgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gU3RyaW5nKHN0YXJzQ291bnQpO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBMaWNlbnNlV2lkZ2V0IGV4dGVuZHMgTWNwU2VydmVyV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2xpY2Vuc2UnKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsZWFyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXI/LmxpY2Vuc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJlbnQgPSBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCBkb20uJCgnc3Bhbi5saWNlbnNlJywgeyB0YWJJbmRleDogMCB9KSk7XG5cdFx0ZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKG1jcExpY2Vuc2VJY29uKSkpO1xuXG5cdFx0Y29uc3QgbGljZW5zZUVsZW1lbnQgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJ3NwYW4nLCB1bmRlZmluZWQsIHRoaXMubWNwU2VydmVyLmxpY2Vuc2UpKTtcblx0XHRsaWNlbnNlRWxlbWVudC5zdHlsZS5wYWRkaW5nTGVmdCA9ICczcHgnO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BTZXJ2ZXJIb3ZlcldpZGdldCBleHRlbmRzIE1jcFNlcnZlcldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBob3ZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBFeHRlbnNpb25Ib3Zlck9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2ZXJTdGF0dXNBY3Rpb246IE1jcFNlcnZlclN0YXR1c0FjdGlvbixcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmhvdmVyLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0dGhpcy5ob3Zlci52YWx1ZSA9IHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKHtcblx0XHRcdFx0ZGVsYXk6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignd29ya2JlbmNoLmhvdmVyLmRlbGF5JyksXG5cdFx0XHRcdHNob3dIb3ZlcjogKG9wdGlvbnMsIGZvY3VzKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxDbGFzc2VzOiBbJ2V4dGVuc2lvbi1ob3ZlciddLFxuXHRcdFx0XHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0XHRcdFx0aG92ZXJQb3NpdGlvbjogdGhpcy5vcHRpb25zLnBvc2l0aW9uKCksXG5cdFx0XHRcdFx0XHRcdGZvcmNlUG9zaXRpb246IHRydWUsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cGVyc2lzdGVuY2U6IHtcblx0XHRcdFx0XHRcdFx0aGlkZU9uS2V5RG93bjogdHJ1ZSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCBmb2N1cyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBsYWNlbWVudDogJ2VsZW1lbnQnXG5cdFx0XHR9LFxuXHRcdFx0XHR0aGlzLm9wdGlvbnMudGFyZ2V0LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bWFya2Rvd246ICgpID0+IFByb21pc2UucmVzb2x2ZSh0aGlzLmdldEhvdmVyTWFya2Rvd24oKSksXG5cdFx0XHRcdFx0bWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogdW5kZWZpbmVkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdFx0XHRzaG93SG92ZXJIaW50OiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SG92ZXJNYXJrZG93bigpOiBNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgaXNUcnVzdGVkOiBmYWxzZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cblx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgKioke2VzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHRoaXMubWNwU2VydmVyLmxhYmVsKX0qKmApO1xuXHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXG5cdFx0bGV0IGFkZFNlcGFyYXRvciA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLm1jcFNlcnZlci5sb2NhbD8uc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke21jcFNlcnZlcldvcmtzcGFjZUljb24uaWR9KSZuYnNwO2ApO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ3dvcmtzcGFjZSBleHRlbnNpb24nLCBcIldvcmtzcGFjZSBNQ1AgU2VydmVyXCIpKTtcblx0XHRcdGFkZFNlcGFyYXRvciA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubWNwU2VydmVyLmxvY2FsPy5zY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke21jcFNlcnZlclJlbW90ZUljb24uaWR9KSZuYnNwO2ApO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ3JlbW90ZSB1c2VyIGV4dGVuc2lvbicsIFwiUmVtb3RlIE1DUCBTZXJ2ZXJcIikpO1xuXHRcdFx0YWRkU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5tY3BTZXJ2ZXIuaW5zdGFsbFN0YXRlID09PSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuSW5zdGFsbGVkKSB7XG5cdFx0XHRpZiAodGhpcy5tY3BTZXJ2ZXIuc3RhcnNDb3VudCkge1xuXHRcdFx0XHRpZiAoYWRkU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgICB8ICBgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdGFyc0NvdW50TGFiZWwgPSBTdGFycmVkV2lkZ2V0LmdldENvdW50TGFiZWwodGhpcy5tY3BTZXJ2ZXIuc3RhcnNDb3VudCk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAkKCR7bWNwU3RhcnJlZEljb24uaWR9KSAke3N0YXJzQ291bnRMYWJlbH1gKTtcblx0XHRcdFx0YWRkU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYWRkU2VwYXJhdG9yKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5tY3BTZXJ2ZXIuZGVzY3JpcHRpb24pIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHRoaXMubWNwU2VydmVyLmRlc2NyaXB0aW9uKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzID0gdGhpcy5tY3BTZXJ2ZXJTdGF0dXNBY3Rpb24uc3RhdHVzO1xuXG5cdFx0aWYgKGV4dGVuc2lvblN0YXR1cy5sZW5ndGgpIHtcblxuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYC0tLWApO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cblx0XHRcdGZvciAoY29uc3Qgc3RhdHVzIG9mIGV4dGVuc2lvblN0YXR1cykge1xuXHRcdFx0XHRpZiAoc3RhdHVzLmljb24pIHtcblx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke3N0YXR1cy5pY29uLmlkfSkmbmJzcDtgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihzdGF0dXMubWVzc2FnZS52YWx1ZSk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0fVxuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1hcmtkb3duO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIE1jcFNlcnZlclNjb3BlQmFkZ2VXaWRnZXQgZXh0ZW5kcyBNY3BTZXJ2ZXJXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYmFkZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RXh0ZW5zaW9uSWNvbkJhZGdlPigpKTtcblx0cHJpdmF0ZSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgZG9tLiQoJycpKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsZWFyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5iYWRnZS52YWx1ZT8uZWxlbWVudC5yZW1vdmUoKTtcblx0XHR0aGlzLmJhZGdlLmNsZWFyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgc2NvcGUgPSB0aGlzLm1jcFNlcnZlcj8ubG9jYWw/LnNjb3BlO1xuXG5cdFx0aWYgKCFzY29wZSB8fCBzY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGljb246IFRoZW1lSWNvbjtcblx0XHRzd2l0Y2ggKHNjb3BlKSB7XG5cdFx0XHRjYXNlIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlOiB7XG5cdFx0XHRcdGljb24gPSBtY3BTZXJ2ZXJXb3Jrc3BhY2VJY29uO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyOiB7XG5cdFx0XHRcdGljb24gPSBtY3BTZXJ2ZXJSZW1vdGVJY29uO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmJhZGdlLnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25JY29uQmFkZ2UsIGljb24sIHVuZGVmaW5lZCk7XG5cdFx0ZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsIHRoaXMuYmFkZ2UudmFsdWUuZWxlbWVudCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1jcFNlcnZlclN0YXR1c1dpZGdldCBleHRlbmRzIE1jcFNlcnZlcldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbmRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbmRlcjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFJlbmRlci5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TdGF0dXNBY3Rpb246IE1jcFNlcnZlclN0YXR1c0FjdGlvbixcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvblN0YXR1c0FjdGlvbi5vbkRpZENoYW5nZVN0YXR1cygoKSA9PiB0aGlzLnJlbmRlcigpKSk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0cmVzZXQodGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy52YWx1ZSA9IGRpc3Bvc2FibGVzO1xuXHRcdGNvbnN0IGV4dGVuc2lvblN0YXR1cyA9IHRoaXMuZXh0ZW5zaW9uU3RhdHVzQWN0aW9uLnN0YXR1cztcblx0XHRpZiAoZXh0ZW5zaW9uU3RhdHVzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZXh0ZW5zaW9uU3RhdHVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXR1cyA9IGV4dGVuc2lvblN0YXR1c1tpXTtcblx0XHRcdFx0aWYgKHN0YXR1cy5pY29uKSB7XG5cdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCQoJHtzdGF0dXMuaWNvbi5pZH0pJm5ic3A7YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oc3RhdHVzLm1lc3NhZ2UudmFsdWUpO1xuXHRcdFx0XHRpZiAoaSA8IGV4dGVuc2lvblN0YXR1cy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG1hcmtkb3duKSk7XG5cdFx0XHRkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCByZW5kZXJlZC5lbGVtZW50KTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRSZW5kZXIuZmlyZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBtY3BTdGFycmVkSWNvbkNvbG9yID0gcmVnaXN0ZXJDb2xvcignbWNwSWNvbi5zdGFyRm9yZWdyb3VuZCcsIHsgbGlnaHQ6ICcjREY2MTAwJywgZGFyazogJyNGRjhFMDAnLCBoY0Rhcms6ICcjRkY4RTAwJywgaGNMaWdodDogdGV4dExpbmtGb3JlZ3JvdW5kIH0sIGxvY2FsaXplKCdtY3BJY29uU3RhckZvcmVncm91bmQnLCBcIlRoZSBpY29uIGNvbG9yIGZvciBtY3Agc3RhcnJlZC5cIiksIGZhbHNlKTtcblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgbWNwU3RhcnJlZEljb25Db2xvclZhbHVlID0gdGhlbWUuZ2V0Q29sb3IobWNwU3RhcnJlZEljb25Db2xvcik7XG5cdGlmIChtY3BTdGFycmVkSWNvbkNvbG9yVmFsdWUpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLmV4dGVuc2lvbi1yYXRpbmdzIC5jb2RpY29uLW1jcC1zZXJ2ZXItc3RhcnJlZCB7IGNvbG9yOiAke21jcFN0YXJyZWRJY29uQ29sb3JWYWx1ZX07IH1gKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1ob3Zlci5leHRlbnNpb24taG92ZXIgLm1hcmtkb3duLWhvdmVyIC5ob3Zlci1jb250ZW50cyAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKG1jcFN0YXJyZWRJY29uKX0geyBjb2xv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
