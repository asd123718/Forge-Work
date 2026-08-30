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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../base/common/platform.js";
import { localize } from "../../../../nls.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { IMarkdownRendererService, openLinkFromMarkdown } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { asTextOrError, IRequestService } from "../../../../platform/request/common/request.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ShowCurrentReleaseNotesActionId } from "../common/update.js";
import { parseUpdateInfoInput } from "../common/updateInfoParser.js";
import { getUpdateInfoUrl, isMajorMinorVersionChange } from "../common/updateUtils.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { URI } from "../../../../base/common/uri.js";
import "./media/postUpdateWidget.css";
const LAST_KNOWN_VERSION_KEY = "postUpdateWidget/lastKnownVersion";
let PostUpdateWidgetContribution = class extends Disposable {
  constructor(commandService, configurationService, hostService, hoverService, layoutService, markdownRendererService, openerService, productService, requestService, storageService, telemetryService) {
    super();
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.hostService = hostService;
    this.hoverService = hoverService;
    this.layoutService = layoutService;
    this.markdownRendererService = markdownRendererService;
    this.openerService = openerService;
    this.productService = productService;
    this.requestService = requestService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    if (isWeb) {
      return;
    }
    this._register(CommandsRegistry.registerCommand("_update.showUpdateInfo", (_accessor, markdown) => this.showUpdateInfo(markdown)));
    void this.tryShowOnStartup();
  }
  async tryShowOnStartup() {
    if (!await this.hostService.hadLastFocus()) {
      return;
    }
    if (!this.detectVersionChange()) {
      return;
    }
    if (this.configurationService.getValue("update.showPostInstallInfo") === false) {
      return;
    }
    await this.showUpdateInfo();
  }
  async showUpdateInfo(markdown) {
    const info = await this.getUpdateInfo(markdown);
    if (!info) {
      return;
    }
    const contentDisposables = new DisposableStore();
    const target = this.layoutService.mainContainer;
    const { clientWidth } = target;
    const maxWidth = 420;
    const x = Math.max(clientWidth - maxWidth - 80, 16);
    this.hoverService.showInstantHover({
      content: this.buildContent(info, contentDisposables),
      target: {
        targetElements: [target],
        x,
        y: 40,
        dispose: () => contentDisposables.dispose()
      },
      additionalClasses: ["post-update-widget-hover"],
      persistence: { sticky: true },
      appearance: { showPointer: false, compact: true, maxHeightRatio: 1 },
      trapFocus: true
    }, true);
  }
  async getUpdateInfo(input) {
    if (!input) {
      try {
        const url = getUpdateInfoUrl(this.productService.version);
        const context = await this.requestService.request({ url, callSite: "postUpdateWidget" }, CancellationToken.None);
        input = await asTextOrError(context);
      } catch {
      }
    }
    if (!input) {
      return void 0;
    }
    let info = parseUpdateInfoInput(input);
    if (!info?.buttons?.length) {
      info = {
        ...info,
        buttons: [{
          label: localize("postUpdate.releaseNotes", "Release Notes"),
          commandId: ShowCurrentReleaseNotesActionId,
          args: [this.productService.version],
          style: "secondary"
        }]
      };
    }
    return info;
  }
  buildContent(info, disposables) {
    const { markdown, buttons, bannerImageUrl, badge, title, features } = info;
    const container = dom.$(".post-update-widget");
    const titleId = `post-update-widget-title-${PostUpdateWidgetContribution.idCounter++}`;
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-labelledby", titleId);
    const banner = dom.append(container, dom.$(".banner"));
    banner.setAttribute("aria-hidden", "true");
    const safeBannerUrl = sanitizeBannerImageUrl(bannerImageUrl);
    if (safeBannerUrl) {
      banner.style.setProperty("background-image", `url(${JSON.stringify(safeBannerUrl)})`);
    }
    const closeButton = dom.append(container, dom.$("button.banner-close"));
    closeButton.setAttribute("aria-label", localize("postUpdate.close", "Close"));
    const closeIcon = dom.append(closeButton, dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
    closeIcon.setAttribute("aria-hidden", "true");
    disposables.add(dom.addDisposableListener(closeButton, "click", () => {
      this.hoverService.hideHover(true);
    }));
    const body = dom.append(container, dom.$(".body"));
    if (badge) {
      const badgeEl = dom.append(body, dom.$(".badge"));
      badgeEl.textContent = badge;
    }
    const titleEl = dom.append(body, dom.$(".title"));
    titleEl.id = titleId;
    titleEl.textContent = title ?? localize("postUpdate.title", "New in {0}", this.productService.version);
    if (features?.length) {
      const list = dom.append(body, dom.$(".features"));
      list.setAttribute("role", "list");
      for (const feature of features) {
        const row = dom.append(list, dom.$(".feature"));
        row.setAttribute("role", "listitem");
        const iconEl = dom.append(row, dom.$(".feature-icon"));
        const iconId = feature.icon ?? Codicon.sparkle.id;
        const themeIcon = ThemeIcon.fromId(iconId);
        iconEl.classList.add(...ThemeIcon.asClassNameArray(themeIcon));
        iconEl.setAttribute("aria-hidden", "true");
        const text = dom.append(row, dom.$(".feature-text"));
        const featureTitle = dom.append(text, dom.$(".feature-title"));
        featureTitle.textContent = feature.title;
        const featureDescription = dom.append(text, dom.$(".feature-description"));
        const rendered = disposables.add(this.markdownRendererService.render(
          new MarkdownString(feature.description, {
            isTrusted: true,
            supportThemeIcons: true
          }),
          {
            actionHandler: (link, mdStr) => {
              openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
              this.hoverService.hideHover(true);
            }
          }
        ));
        featureDescription.appendChild(rendered.element);
      }
    } else if (markdown) {
      const markdownContainer = dom.append(body, dom.$(".update-markdown"));
      const rendered = disposables.add(this.markdownRendererService.render(
        new MarkdownString(markdown, {
          isTrusted: true,
          supportHtml: true,
          supportThemeIcons: true
        }),
        {
          actionHandler: (link, mdStr) => {
            openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
            this.hoverService.hideHover(true);
          }
        }
      ));
      markdownContainer.appendChild(rendered.element);
    }
    if (buttons?.length) {
      const buttonBar = dom.append(body, dom.$(".button-bar"));
      const isSingleButton = buttons.length === 1;
      let seenSecondary = false;
      for (const { label, style, commandId, args } of buttons) {
        const button = dom.append(buttonBar, dom.$("button"));
        button.textContent = label;
        if (style === "secondary") {
          button.classList.add("update-button-secondary");
          if (!seenSecondary && buttons.length > 1) {
            button.classList.add("update-button-leading-secondary");
            seenSecondary = true;
          }
        } else {
          button.classList.add("update-button-primary");
        }
        if (isSingleButton) {
          button.classList.add("update-button-full-width");
        }
        disposables.add(dom.addDisposableListener(button, "click", () => {
          this.telemetryService.publicLog2(
            "workbenchActionExecuted",
            { id: commandId, from: "postUpdateWidget" }
          );
          void this.commandService.executeCommand(commandId, ...args ?? []);
          this.hoverService.hideHover(true);
        }));
      }
    }
    return container;
  }
  detectVersionChange() {
    let from;
    try {
      from = this.storageService.getObject(LAST_KNOWN_VERSION_KEY, StorageScope.APPLICATION);
    } catch {
    }
    const to = {
      version: this.productService.version,
      commit: this.productService.commit,
      timestamp: Date.now()
    };
    if (from?.commit === to.commit) {
      return false;
    }
    this.storageService.store(LAST_KNOWN_VERSION_KEY, JSON.stringify(to), StorageScope.APPLICATION, StorageTarget.MACHINE);
    if (from) {
      return isMajorMinorVersionChange(from.version, to.version);
    }
    return false;
  }
};
PostUpdateWidgetContribution.idCounter = 0;
PostUpdateWidgetContribution = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IHostService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, ILayoutService),
  __decorateParam(5, IMarkdownRendererService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IProductService),
  __decorateParam(8, IRequestService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, ITelemetryService)
], PostUpdateWidgetContribution);
function sanitizeBannerImageUrl(value) {
  if (!value) {
    return void 0;
  }
  try {
    const uri = URI.parse(value, true);
    if (uri.scheme === "https") {
      return uri.toString(true);
    }
    if (uri.scheme === "data" && /^image\//i.test(uri.path)) {
      return uri.toString(true);
    }
  } catch {
  }
  return void 0;
}
export {
  PostUpdateWidgetContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVwZGF0ZVxcYnJvd3NlclxccG9zdFVwZGF0ZVdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgb3BlbkxpbmtGcm9tTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBhc1RleHRPckVycm9yLCBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBTaG93Q3VycmVudFJlbGVhc2VOb3Rlc0FjdGlvbklkIH0gZnJvbSAnLi4vY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJUGFyc2VkVXBkYXRlSW5mb0lucHV0LCBwYXJzZVVwZGF0ZUluZm9JbnB1dCB9IGZyb20gJy4uL2NvbW1vbi91cGRhdGVJbmZvUGFyc2VyLmpzJztcbmltcG9ydCB7IGdldFVwZGF0ZUluZm9VcmwsIGlzTWFqb3JNaW5vclZlcnNpb25DaGFuZ2UgfSBmcm9tICcuLi9jb21tb24vdXBkYXRlVXRpbHMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICcuL21lZGlhL3Bvc3RVcGRhdGVXaWRnZXQuY3NzJztcblxuY29uc3QgTEFTVF9LTk9XTl9WRVJTSU9OX0tFWSA9ICdwb3N0VXBkYXRlV2lkZ2V0L2xhc3RLbm93blZlcnNpb24nO1xuXG5pbnRlcmZhY2UgSUxhc3RLbm93blZlcnNpb24ge1xuXHRyZWFkb25seSB2ZXJzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBEaXNwbGF5cyBwb3N0LXVwZGF0ZSBjYWxsLXRvLWFjdGlvbiB3aWRnZXQgYWZ0ZXIgYSB2ZXJzaW9uIGNoYW5nZSBpcyBkZXRlY3RlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIFBvc3RVcGRhdGVXaWRnZXRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgaWRDb3VudGVyID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0cmV0dXJuOyAvLyBFbGVjdHJvbiBvbmx5XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ191cGRhdGUuc2hvd1VwZGF0ZUluZm8nLCAoX2FjY2Vzc29yLCBtYXJrZG93bj86IHN0cmluZykgPT4gdGhpcy5zaG93VXBkYXRlSW5mbyhtYXJrZG93bikpKTtcblx0XHR2b2lkIHRoaXMudHJ5U2hvd09uU3RhcnR1cCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0cnlTaG93T25TdGFydHVwKCkge1xuXHRcdGlmICghYXdhaXQgdGhpcy5ob3N0U2VydmljZS5oYWRMYXN0Rm9jdXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5kZXRlY3RWZXJzaW9uQ2hhbmdlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPigndXBkYXRlLnNob3dQb3N0SW5zdGFsbEluZm8nKSA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnNob3dVcGRhdGVJbmZvKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dVcGRhdGVJbmZvKG1hcmtkb3duPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHRoaXMuZ2V0VXBkYXRlSW5mbyhtYXJrZG93bik7XG5cdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyO1xuXHRcdGNvbnN0IHsgY2xpZW50V2lkdGggfSA9IHRhcmdldDtcblx0XHRjb25zdCBtYXhXaWR0aCA9IDQyMDtcblx0XHRjb25zdCB4ID0gTWF0aC5tYXgoY2xpZW50V2lkdGggLSBtYXhXaWR0aCAtIDgwLCAxNik7XG5cblx0XHR0aGlzLmhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdGNvbnRlbnQ6IHRoaXMuYnVpbGRDb250ZW50KGluZm8sIGNvbnRlbnREaXNwb3NhYmxlcyksXG5cdFx0XHR0YXJnZXQ6IHtcblx0XHRcdFx0dGFyZ2V0RWxlbWVudHM6IFt0YXJnZXRdLFxuXHRcdFx0XHR4LFxuXHRcdFx0XHR5OiA0MCxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gY29udGVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxDbGFzc2VzOiBbJ3Bvc3QtdXBkYXRlLXdpZGdldC1ob3ZlciddLFxuXHRcdFx0cGVyc2lzdGVuY2U6IHsgc3RpY2t5OiB0cnVlIH0sXG5cdFx0XHRhcHBlYXJhbmNlOiB7IHNob3dQb2ludGVyOiBmYWxzZSwgY29tcGFjdDogdHJ1ZSwgbWF4SGVpZ2h0UmF0aW86IDEgfSxcblx0XHRcdHRyYXBGb2N1czogdHJ1ZSxcblx0XHR9LCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VXBkYXRlSW5mbyhpbnB1dD86IHN0cmluZyB8IG51bGwpOiBQcm9taXNlPElQYXJzZWRVcGRhdGVJbmZvSW5wdXQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIWlucHV0KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcGRhdGVJbmZvVXJsKHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbik7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoeyB1cmwsIGNhbGxTaXRlOiAncG9zdFVwZGF0ZVdpZGdldCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGlucHV0ID0gYXdhaXQgYXNUZXh0T3JFcnJvcihjb250ZXh0KTtcblx0XHRcdH0gY2F0Y2ggeyB9XG5cdFx0fVxuXG5cdFx0aWYgKCFpbnB1dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgaW5mbyA9IHBhcnNlVXBkYXRlSW5mb0lucHV0KGlucHV0KTtcblx0XHRpZiAoIWluZm8/LmJ1dHRvbnM/Lmxlbmd0aCkge1xuXHRcdFx0aW5mbyA9IHtcblx0XHRcdFx0Li4uaW5mbywgYnV0dG9uczogW3tcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Bvc3RVcGRhdGUucmVsZWFzZU5vdGVzJywgXCJSZWxlYXNlIE5vdGVzXCIpLFxuXHRcdFx0XHRcdGNvbW1hbmRJZDogU2hvd0N1cnJlbnRSZWxlYXNlTm90ZXNBY3Rpb25JZCxcblx0XHRcdFx0XHRhcmdzOiBbdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uXSxcblx0XHRcdFx0XHRzdHlsZTogJ3NlY29uZGFyeSdcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluZm87XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkQ29udGVudChpbmZvOiBJUGFyc2VkVXBkYXRlSW5mb0lucHV0LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IHsgbWFya2Rvd24sIGJ1dHRvbnMsIGJhbm5lckltYWdlVXJsLCBiYWRnZSwgdGl0bGUsIGZlYXR1cmVzIH0gPSBpbmZvO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS4kKCcucG9zdC11cGRhdGUtd2lkZ2V0Jyk7XG5cdFx0Y29uc3QgdGl0bGVJZCA9IGBwb3N0LXVwZGF0ZS13aWRnZXQtdGl0bGUtJHtQb3N0VXBkYXRlV2lkZ2V0Q29udHJpYnV0aW9uLmlkQ291bnRlcisrfWA7XG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdkaWFsb2cnKTtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsbGVkYnknLCB0aXRsZUlkKTtcblx0XHQvLyBFc2NhcGUtdG8tZGlzbWlzcyBpcyBoYW5kbGVkIGJ5IHRoZSBob3ZlciB3aWRnZXQgaXRzZWxmIChIb3ZlcldpZGdldCBsaXN0ZW5zIGZvciBFc2NhcGVcblx0XHQvLyBvbiBpdHMgY29udGFpbmVyIGFuZCBkaXNwb3NlcyB0aGUgaG92ZXIpLlxuXG5cdFx0Ly8gQmFubmVyIChkZWNvcmF0aXZlKS4gRGVmYXVsdCBpcyBhIENTUyBncmFkaWVudDsgYW4gaW1hZ2UgZnJvbSB0aGUgbWFya2Rvd24gZnJvbnRtYXR0ZXIgb3ZlcnJpZGVzIGl0LlxuXHRcdGNvbnN0IGJhbm5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmJhbm5lcicpKTtcblx0XHRiYW5uZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0Y29uc3Qgc2FmZUJhbm5lclVybCA9IHNhbml0aXplQmFubmVySW1hZ2VVcmwoYmFubmVySW1hZ2VVcmwpO1xuXHRcdGlmIChzYWZlQmFubmVyVXJsKSB7XG5cdFx0XHQvLyBVc2Ugc2V0UHJvcGVydHkgKyBKU09OLnN0cmluZ2lmeSB0byBzYWZlbHkgcXVvdGUgdGhlIFVSTCBpbnNpZGUgQ1NTIHdpdGhvdXQgYnJlYWtpbmcgb3V0LlxuXHRcdFx0YmFubmVyLnN0eWxlLnNldFByb3BlcnR5KCdiYWNrZ3JvdW5kLWltYWdlJywgYHVybCgke0pTT04uc3RyaW5naWZ5KHNhZmVCYW5uZXJVcmwpfSlgKTtcblx0XHR9XG5cblx0XHQvLyBDbG9zZSBidXR0b24gaXMgYSBzaWJsaW5nIG9mIHRoZSBiYW5uZXIgc28gaXQgaXNuJ3QgYSBmb2N1c2FibGUgZGVzY2VuZGFudCBvZiBhbiBhcmlhLWhpZGRlbiByZWdpb24uXG5cdFx0Y29uc3QgY2xvc2VCdXR0b24gPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJ2J1dHRvbi5iYW5uZXItY2xvc2UnKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0Y2xvc2VCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3Bvc3RVcGRhdGUuY2xvc2UnLCBcIkNsb3NlXCIpKTtcblx0XHRjb25zdCBjbG9zZUljb24gPSBkb20uYXBwZW5kKGNsb3NlQnV0dG9uLCBkb20uJChUaGVtZUljb24uYXNDU1NTZWxlY3RvcihDb2RpY29uLmNsb3NlKSkpO1xuXHRcdGNsb3NlSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjbG9zZUJ1dHRvbiwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEJvZHlcblx0XHRjb25zdCBib2R5ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuYm9keScpKTtcblxuXHRcdC8vIEJhZGdlXG5cdFx0aWYgKGJhZGdlKSB7XG5cdFx0XHRjb25zdCBiYWRnZUVsID0gZG9tLmFwcGVuZChib2R5LCBkb20uJCgnLmJhZGdlJykpO1xuXHRcdFx0YmFkZ2VFbC50ZXh0Q29udGVudCA9IGJhZGdlO1xuXHRcdH1cblxuXHRcdC8vIFRpdGxlXG5cdFx0Y29uc3QgdGl0bGVFbCA9IGRvbS5hcHBlbmQoYm9keSwgZG9tLiQoJy50aXRsZScpKTtcblx0XHR0aXRsZUVsLmlkID0gdGl0bGVJZDtcblx0XHR0aXRsZUVsLnRleHRDb250ZW50ID0gdGl0bGUgPz8gbG9jYWxpemUoJ3Bvc3RVcGRhdGUudGl0bGUnLCBcIk5ldyBpbiB7MH1cIiwgdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uKTtcblxuXHRcdC8vIEZlYXR1cmVzIChwcmVmZXJyZWQpIG9yIG1hcmtkb3duIGJvZHlcblx0XHRpZiAoZmVhdHVyZXM/Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbGlzdCA9IGRvbS5hcHBlbmQoYm9keSwgZG9tLiQoJy5mZWF0dXJlcycpKTtcblx0XHRcdGxpc3Quc2V0QXR0cmlidXRlKCdyb2xlJywgJ2xpc3QnKTtcblx0XHRcdGZvciAoY29uc3QgZmVhdHVyZSBvZiBmZWF0dXJlcykge1xuXHRcdFx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKGxpc3QsIGRvbS4kKCcuZmVhdHVyZScpKTtcblx0XHRcdFx0cm93LnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0aXRlbScpO1xuXHRcdFx0XHRjb25zdCBpY29uRWwgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJy5mZWF0dXJlLWljb24nKSk7XG5cdFx0XHRcdGNvbnN0IGljb25JZCA9IGZlYXR1cmUuaWNvbiA/PyBDb2RpY29uLnNwYXJrbGUuaWQ7XG5cdFx0XHRcdGNvbnN0IHRoZW1lSWNvbiA9IFRoZW1lSWNvbi5mcm9tSWQoaWNvbklkKTtcblx0XHRcdFx0aWNvbkVsLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodGhlbWVJY29uKSk7XG5cdFx0XHRcdGljb25FbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnLmZlYXR1cmUtdGV4dCcpKTtcblx0XHRcdFx0Y29uc3QgZmVhdHVyZVRpdGxlID0gZG9tLmFwcGVuZCh0ZXh0LCBkb20uJCgnLmZlYXR1cmUtdGl0bGUnKSk7XG5cdFx0XHRcdGZlYXR1cmVUaXRsZS50ZXh0Q29udGVudCA9IGZlYXR1cmUudGl0bGU7XG5cdFx0XHRcdGNvbnN0IGZlYXR1cmVEZXNjcmlwdGlvbiA9IGRvbS5hcHBlbmQodGV4dCwgZG9tLiQoJy5mZWF0dXJlLWRlc2NyaXB0aW9uJykpO1xuXHRcdFx0XHQvLyBSZW5kZXIgZGVzY3JpcHRpb24gYXMgbWFya2Rvd24gc28gaXQgY2FuIGluY2x1ZGUgaW5saW5lIGxpbmtzIGFuZCBlbXBoYXNpcy5cblx0XHRcdFx0Y29uc3QgcmVuZGVyZWQgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoXG5cdFx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKGZlYXR1cmUuZGVzY3JpcHRpb24sIHtcblx0XHRcdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGFjdGlvbkhhbmRsZXI6IChsaW5rLCBtZFN0cikgPT4ge1xuXHRcdFx0XHRcdFx0XHRvcGVuTGlua0Zyb21NYXJrZG93bih0aGlzLm9wZW5lclNlcnZpY2UsIGxpbmssIG1kU3RyLmlzVHJ1c3RlZCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRmZWF0dXJlRGVzY3JpcHRpb24uYXBwZW5kQ2hpbGQocmVuZGVyZWQuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChtYXJrZG93bikge1xuXHRcdFx0Y29uc3QgbWFya2Rvd25Db250YWluZXIgPSBkb20uYXBwZW5kKGJvZHksIGRvbS4kKCcudXBkYXRlLW1hcmtkb3duJykpO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWQgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoXG5cdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZyhtYXJrZG93biwge1xuXHRcdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdFx0XHRzdXBwb3J0SHRtbDogdHJ1ZSxcblx0XHRcdFx0XHRzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhY3Rpb25IYW5kbGVyOiAobGluaywgbWRTdHIpID0+IHtcblx0XHRcdFx0XHRcdG9wZW5MaW5rRnJvbU1hcmtkb3duKHRoaXMub3BlbmVyU2VydmljZSwgbGluaywgbWRTdHIuaXNUcnVzdGVkKTtcblx0XHRcdFx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRtYXJrZG93bkNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHR9XG5cblx0XHQvLyBCdXR0b25zXG5cdFx0aWYgKGJ1dHRvbnM/Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgYnV0dG9uQmFyID0gZG9tLmFwcGVuZChib2R5LCBkb20uJCgnLmJ1dHRvbi1iYXInKSk7XG5cdFx0XHRjb25zdCBpc1NpbmdsZUJ1dHRvbiA9IGJ1dHRvbnMubGVuZ3RoID09PSAxO1xuXHRcdFx0bGV0IHNlZW5TZWNvbmRhcnkgPSBmYWxzZTtcblxuXHRcdFx0Zm9yIChjb25zdCB7IGxhYmVsLCBzdHlsZSwgY29tbWFuZElkLCBhcmdzIH0gb2YgYnV0dG9ucykge1xuXHRcdFx0XHRjb25zdCBidXR0b24gPSBkb20uYXBwZW5kKGJ1dHRvbkJhciwgZG9tLiQoJ2J1dHRvbicpKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdFx0YnV0dG9uLnRleHRDb250ZW50ID0gbGFiZWw7XG5cblx0XHRcdFx0aWYgKHN0eWxlID09PSAnc2Vjb25kYXJ5Jykge1xuXHRcdFx0XHRcdGJ1dHRvbi5jbGFzc0xpc3QuYWRkKCd1cGRhdGUtYnV0dG9uLXNlY29uZGFyeScpO1xuXHRcdFx0XHRcdGlmICghc2VlblNlY29uZGFyeSAmJiBidXR0b25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdGJ1dHRvbi5jbGFzc0xpc3QuYWRkKCd1cGRhdGUtYnV0dG9uLWxlYWRpbmctc2Vjb25kYXJ5Jyk7XG5cdFx0XHRcdFx0XHRzZWVuU2Vjb25kYXJ5ID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnV0dG9uLmNsYXNzTGlzdC5hZGQoJ3VwZGF0ZS1idXR0b24tcHJpbWFyeScpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzU2luZ2xlQnV0dG9uKSB7XG5cdFx0XHRcdFx0YnV0dG9uLmNsYXNzTGlzdC5hZGQoJ3VwZGF0ZS1idXR0b24tZnVsbC13aWR0aCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHRcdFx0XHQnd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLFxuXHRcdFx0XHRcdFx0eyBpZDogY29tbWFuZElkLCBmcm9tOiAncG9zdFVwZGF0ZVdpZGdldCcgfVxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHR2b2lkIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkLCAuLi4oYXJncyA/PyBbXSkpO1xuXHRcdFx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRwcml2YXRlIGRldGVjdFZlcnNpb25DaGFuZ2UoKTogYm9vbGVhbiB7XG5cdFx0bGV0IGZyb206IElMYXN0S25vd25WZXJzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRmcm9tID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3QoTEFTVF9LTk9XTl9WRVJTSU9OX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9IGNhdGNoIHsgfVxuXG5cdFx0Y29uc3QgdG86IElMYXN0S25vd25WZXJzaW9uID0ge1xuXHRcdFx0dmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0Y29tbWl0OiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCxcblx0XHRcdHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcblx0XHR9O1xuXG5cdFx0aWYgKGZyb20/LmNvbW1pdCA9PT0gdG8uY29tbWl0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShMQVNUX0tOT1dOX1ZFUlNJT05fS0VZLCBKU09OLnN0cmluZ2lmeSh0byksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGlmIChmcm9tKSB7XG5cdFx0XHRyZXR1cm4gaXNNYWpvck1pbm9yVmVyc2lvbkNoYW5nZShmcm9tLnZlcnNpb24sIHRvLnZlcnNpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG4vKipcbiAqIFZhbGlkYXRlcyBhIGJhbm5lciBpbWFnZSBVUkwgZnJvbSB1cGRhdGUgaW5mby4gT25seSBgaHR0cHM6YCBhbmQgYGRhdGE6aW1hZ2UvKmAgc2NoZW1lcyBhcmVcbiAqIGFsbG93ZWQgdG8gcHJldmVudCBDU1MtaW5qZWN0aW9uIG9yIHVuZXhwZWN0ZWQgcHJvdG9jb2wgaGFuZGxlcnMgYmVpbmcgaW52b2tlZCBmcm9tIHRoZSBtYXJrZG93biBwYXlsb2FkLlxuICovXG5mdW5jdGlvbiBzYW5pdGl6ZUJhbm5lckltYWdlVXJsKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIXZhbHVlKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSh2YWx1ZSwgdHJ1ZSk7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09ICdodHRwcycpIHtcblx0XHRcdHJldHVybiB1cmkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0fVxuXHRcdGlmICh1cmkuc2NoZW1lID09PSAnZGF0YScgJiYgL15pbWFnZVxcLy9pLnRlc3QodXJpLnBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gdXJpLnRvU3RyaW5nKHRydWUpO1xuXHRcdH1cblx0fSBjYXRjaCB7XG5cdFx0Ly8gZmFsbCB0aHJvdWdoXG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCLHVCQUF1QjtBQUNsRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQiw0QkFBNEI7QUFDL0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlLHVCQUF1QjtBQUMvQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVDQUF1QztBQUNoRCxTQUFpQyw0QkFBNEI7QUFDN0QsU0FBUyxrQkFBa0IsaUNBQWlDO0FBQzVE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
