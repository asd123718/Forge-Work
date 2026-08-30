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
import "./media/extensionsWidgets.css";
import * as semver from "../../../../base/common/semver/semver.js";
import { Disposable, toDisposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { IExtensionsWorkbenchService, ExtensionState, ExtensionEditorTab } from "../common/extensions.js";
import { append, $, reset, addDisposableListener, EventType, finalHandler } from "../../../../base/browser/dom.js";
import * as platform from "../../../../base/common/platform.js";
import { localize } from "../../../../nls.js";
import { IExtensionManagementServerService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { extensionButtonProminentBackground } from "./extensionsActions.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { EXTENSION_BADGE_BACKGROUND, EXTENSION_BADGE_FOREGROUND } from "../../../common/theme.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IUserDataSyncEnablementService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { activationTimeIcon, errorIcon, infoIcon, installCountIcon, preReleaseIcon, privateExtensionIcon, ratingIcon, remoteIcon, restartRequiredIcon, sponsorIcon, starEmptyIcon, starFullIcon, starHalfIcon, syncIgnoredIcon, warningIcon } from "./extensionsIcons.js";
import { registerColor, textLinkForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { createCommandUri, MarkdownString } from "../../../../base/common/htmlContent.js";
import { URI } from "../../../../base/common/uri.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import Severity from "../../../../base/common/severity.js";
import { Color } from "../../../../base/common/color.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions, IExtensionFeaturesManagementService } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { extensionDefaultIcon, extensionVerifiedPublisherIconColor, verifiedPublisherIcon } from "../../../services/extensionManagement/common/extensionsIcons.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IExplorerService } from "../../files/browser/files.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { VIEW_ID as EXPLORER_VIEW_ID } from "../../files/common/files.js";
import { IExtensionGalleryManifestService } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
class ExtensionWidget extends Disposable {
  constructor() {
    super(...arguments);
    this._extension = null;
  }
  get extension() {
    return this._extension;
  }
  set extension(extension) {
    this._extension = extension;
    this.update();
  }
  update() {
    this.render();
  }
}
function onClick(element, callback) {
  const disposables = new DisposableStore();
  disposables.add(addDisposableListener(element, EventType.CLICK, finalHandler(callback)));
  disposables.add(addDisposableListener(element, EventType.KEY_UP, (e) => {
    const keyboardEvent = new StandardKeyboardEvent(e);
    if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
      e.preventDefault();
      e.stopPropagation();
      callback();
    }
  }));
  return disposables;
}
class ExtensionIconWidget extends ExtensionWidget {
  constructor(container) {
    super();
    this.iconLoadingDisposable = this._register(new MutableDisposable());
    this.iconErrorDisposable = this._register(new MutableDisposable());
    this.element = append(container, $(".extension-icon"));
    this.iconElement = append(this.element, $("img.icon", { alt: "" }));
    this.iconElement.style.display = "none";
    this.defaultIconElement = append(this.element, $(ThemeIcon.asCSSSelector(extensionDefaultIcon)));
    this.defaultIconElement.style.display = "none";
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.iconUrl = void 0;
    this.iconElement.src = "";
    this.iconElement.style.display = "none";
    this.defaultIconElement.style.display = "none";
    this.iconErrorDisposable.clear();
    this.iconLoadingDisposable.clear();
  }
  render() {
    if (!this.extension) {
      this.clear();
      return;
    }
    if (this.extension.iconUrl) {
      if (this.iconUrl !== this.extension.iconUrl) {
        this.iconElement.style.display = "inherit";
        this.defaultIconElement.style.display = "none";
        this.iconUrl = this.extension.iconUrl;
        this.iconErrorDisposable.value = addDisposableListener(this.iconElement, "error", () => {
          if (this.extension?.iconUrlFallback) {
            this.iconElement.src = this.extension.iconUrlFallback;
          } else {
            this.iconElement.style.display = "none";
            this.defaultIconElement.style.display = "inherit";
          }
        }, { once: true });
        this.iconElement.src = this.iconUrl;
        if (!this.iconElement.complete) {
          this.iconElement.style.visibility = "hidden";
          this.iconLoadingDisposable.value = addDisposableListener(this.iconElement, "load", () => {
            this.iconElement.style.visibility = "inherit";
          });
        } else {
          this.iconElement.style.visibility = "inherit";
        }
      }
    } else {
      this.iconUrl = void 0;
      this.iconElement.style.display = "none";
      this.iconElement.src = "";
      this.defaultIconElement.style.display = "inherit";
      this.iconErrorDisposable.clear();
      this.iconLoadingDisposable.clear();
    }
  }
}
let InstallCountWidget = class extends ExtensionWidget {
  constructor(container, small, hoverService) {
    super();
    this.container = container;
    this.small = small;
    this.hoverService = hoverService;
    this.disposables = this._register(new DisposableStore());
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.container.innerText = "";
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.extension) {
      return;
    }
    if (this.small && this.extension.state !== ExtensionState.Uninstalled) {
      return;
    }
    const installLabel = InstallCountWidget.getInstallLabel(this.extension, this.small);
    if (!installLabel) {
      return;
    }
    const parent = this.small ? this.container : append(this.container, $("span.install", { tabIndex: 0 }));
    append(parent, $("span" + ThemeIcon.asCSSSelector(installCountIcon)));
    const count = append(parent, $("span.count"));
    count.textContent = installLabel;
    if (!this.small) {
      this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.container, localize("install count", "Install count")));
    }
  }
  static getInstallLabel(extension, small) {
    const installCount = extension.installCount;
    if (!installCount) {
      return void 0;
    }
    let installLabel;
    if (small) {
      if (installCount > 1e6) {
        installLabel = `${Math.floor(installCount / 1e5) / 10}M`;
      } else if (installCount > 1e3) {
        installLabel = `${Math.floor(installCount / 1e3)}K`;
      } else {
        installLabel = String(installCount);
      }
    } else {
      installLabel = installCount.toLocaleString(platform.language);
    }
    return installLabel;
  }
};
InstallCountWidget = __decorateClass([
  __decorateParam(2, IHoverService)
], InstallCountWidget);
let RatingsWidget = class extends ExtensionWidget {
  constructor(container, small, hoverService, openerService) {
    super();
    this.container = container;
    this.small = small;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.disposables = this._register(new DisposableStore());
    container.classList.add("extension-ratings");
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
    if (!this.extension) {
      return;
    }
    if (this.small && this.extension.state !== ExtensionState.Uninstalled) {
      return;
    }
    if (this.extension.rating === void 0) {
      return;
    }
    if (this.small && !this.extension.ratingCount) {
      return;
    }
    if (!this.extension.url) {
      return;
    }
    const rating = Math.round(this.extension.rating * 2) / 2;
    if (this.small) {
      append(this.container, $("span" + ThemeIcon.asCSSSelector(starFullIcon)));
      const count = append(this.container, $("span.count"));
      count.textContent = String(rating);
    } else {
      const element = append(this.container, $("span.rating.clickable", { tabIndex: 0 }));
      for (let i = 1; i <= 5; i++) {
        if (rating >= i) {
          append(element, $("span" + ThemeIcon.asCSSSelector(starFullIcon)));
        } else if (rating >= i - 0.5) {
          append(element, $("span" + ThemeIcon.asCSSSelector(starHalfIcon)));
        } else {
          append(element, $("span" + ThemeIcon.asCSSSelector(starEmptyIcon)));
        }
      }
      if (this.extension.ratingCount) {
        const ratingCountElemet = append(element, $("span", void 0, ` (${this.extension.ratingCount})`));
        ratingCountElemet.style.paddingLeft = "1px";
      }
      this.containerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), element, ""));
      this.containerHover.update(localize("ratedLabel", "Average rating: {0} out of 5", rating));
      element.setAttribute("role", "link");
      if (this.extension.ratingUrl) {
        this.disposables.add(onClick(element, () => this.openerService.open(URI.parse(this.extension.ratingUrl))));
      }
    }
  }
};
RatingsWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IOpenerService)
], RatingsWidget);
let PublisherWidget = class extends ExtensionWidget {
  constructor(container, small, extensionsWorkbenchService, hoverService, openerService) {
    super();
    this.container = container;
    this.small = small;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
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
    if (!this.extension) {
      return;
    }
    if (this.extension.resourceExtension) {
      return;
    }
    if (this.extension.local?.source === "resource") {
      return;
    }
    this.element = append(this.container, $(".publisher"));
    const publisherDisplayName = $(".publisher-name.ellipsis");
    publisherDisplayName.textContent = this.extension.publisherDisplayName;
    const verifiedPublisher = $(".verified-publisher");
    append(verifiedPublisher, $("span.extension-verified-publisher.clickable"), renderIcon(verifiedPublisherIcon));
    if (this.small) {
      if (this.extension.publisherDomain?.verified) {
        append(this.element, verifiedPublisher);
      }
      append(this.element, publisherDisplayName);
    } else {
      this.element.classList.toggle("clickable", !!this.extension.url);
      this.element.setAttribute("role", "button");
      this.element.tabIndex = 0;
      this.containerHover = this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, localize("publisher", "Publisher ({0})", this.extension.publisherDisplayName)));
      append(this.element, publisherDisplayName);
      if (this.extension.publisherDomain?.verified) {
        append(this.element, verifiedPublisher);
        const publisherDomainLink = URI.parse(this.extension.publisherDomain.link);
        verifiedPublisher.tabIndex = 0;
        verifiedPublisher.setAttribute("role", "button");
        this.containerHover.update(localize("verified publisher", "This publisher has verified ownership of {0}", this.extension.publisherDomain.link));
        verifiedPublisher.setAttribute("role", "link");
        append(verifiedPublisher, $("span.extension-verified-publisher-domain", void 0, publisherDomainLink.authority.startsWith("www.") ? publisherDomainLink.authority.substring(4) : publisherDomainLink.authority));
        this.disposables.add(onClick(verifiedPublisher, () => this.openerService.open(publisherDomainLink)));
      }
      if (this.extension.url) {
        this.disposables.add(onClick(this.element, () => this.extensionsWorkbenchService.openSearch(`publisher:"${this.extension?.publisherDisplayName}"`)));
      }
    }
  }
};
PublisherWidget = __decorateClass([
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IOpenerService)
], PublisherWidget);
let SponsorWidget = class extends ExtensionWidget {
  constructor(container, hoverService, openerService) {
    super();
    this.container = container;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.disposables = this._register(new DisposableStore());
    this.render();
  }
  render() {
    reset(this.container);
    this.disposables.clear();
    if (!this.extension?.publisherSponsorLink) {
      return;
    }
    const sponsor = append(this.container, $("span.sponsor.clickable", { tabIndex: 0 }));
    this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), sponsor, this.extension?.publisherSponsorLink.toString() ?? ""));
    sponsor.setAttribute("role", "link");
    const sponsorIconElement = renderIcon(sponsorIcon);
    const label = $("span", void 0, localize("sponsor", "Sponsor"));
    append(sponsor, sponsorIconElement, label);
    this.disposables.add(onClick(sponsor, () => {
      this.openerService.open(this.extension.publisherSponsorLink);
    }));
  }
};
SponsorWidget = __decorateClass([
  __decorateParam(1, IHoverService),
  __decorateParam(2, IOpenerService)
], SponsorWidget);
let RecommendationWidget = class extends ExtensionWidget {
  constructor(parent, extensionRecommendationsService) {
    super();
    this.parent = parent;
    this.extensionRecommendationsService = extensionRecommendationsService;
    this.disposables = this._register(new DisposableStore());
    this.render();
    this._register(toDisposable(() => this.clear()));
    this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => this.render()));
  }
  clear() {
    this.element?.remove();
    this.element = void 0;
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.extension || this.extension.state === ExtensionState.Installed || this.extension.deprecationInfo) {
      return;
    }
    const extRecommendations = this.extensionRecommendationsService.getAllRecommendationsWithReason();
    if (extRecommendations[this.extension.identifier.id.toLowerCase()]) {
      this.element = append(this.parent, $("div.extension-bookmark"));
      const recommendation = append(this.element, $(".recommendation"));
      append(recommendation, $("span" + ThemeIcon.asCSSSelector(ratingIcon)));
    }
  }
};
RecommendationWidget = __decorateClass([
  __decorateParam(1, IExtensionRecommendationsService)
], RecommendationWidget);
class PreReleaseBookmarkWidget extends ExtensionWidget {
  constructor(parent) {
    super();
    this.parent = parent;
    this.disposables = this._register(new DisposableStore());
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.element?.remove();
    this.element = void 0;
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (this.extension?.state === ExtensionState.Installed ? this.extension.preRelease : this.extension?.hasPreReleaseVersion) {
      this.element = append(this.parent, $("div.extension-bookmark"));
      const preRelease = append(this.element, $(".pre-release"));
      append(preRelease, $("span" + ThemeIcon.asCSSSelector(preReleaseIcon)));
    }
  }
}
let RemoteBadgeWidget = class extends ExtensionWidget {
  constructor(parent, tooltip, extensionManagementServerService, instantiationService) {
    super();
    this.tooltip = tooltip;
    this.extensionManagementServerService = extensionManagementServerService;
    this.instantiationService = instantiationService;
    this.remoteBadge = this._register(new MutableDisposable());
    this.element = append(parent, $(""));
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.remoteBadge.value?.element.remove();
    this.remoteBadge.clear();
  }
  render() {
    this.clear();
    if (!this.extension || !this.extension.local || !this.extension.server || !(this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) || this.extension.server !== this.extensionManagementServerService.remoteExtensionManagementServer) {
      return;
    }
    let tooltip;
    if (this.tooltip && this.extensionManagementServerService.remoteExtensionManagementServer) {
      tooltip = localize("remote extension title", "Extension in {0}", this.extensionManagementServerService.remoteExtensionManagementServer.label);
    }
    this.remoteBadge.value = this.instantiationService.createInstance(ExtensionIconBadge, remoteIcon, tooltip);
    append(this.element, this.remoteBadge.value.element);
  }
};
RemoteBadgeWidget = __decorateClass([
  __decorateParam(2, IExtensionManagementServerService),
  __decorateParam(3, IInstantiationService)
], RemoteBadgeWidget);
let ExtensionIconBadge = class extends Disposable {
  constructor(icon, tooltip, hoverService, labelService, themeService) {
    super();
    this.icon = icon;
    this.tooltip = tooltip;
    this.labelService = labelService;
    this.themeService = themeService;
    this.element = $("div.extension-badge.extension-icon-badge");
    this.elementHover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, ""));
    this.render();
  }
  render() {
    append(this.element, $("span" + ThemeIcon.asCSSSelector(this.icon)));
    const applyBadgeStyle = () => {
      if (!this.element) {
        return;
      }
      const bgColor = this.themeService.getColorTheme().getColor(EXTENSION_BADGE_BACKGROUND);
      const fgColor = this.themeService.getColorTheme().getColor(EXTENSION_BADGE_FOREGROUND);
      this.element.style.backgroundColor = bgColor ? bgColor.toString() : "";
      this.element.style.color = fgColor ? fgColor.toString() : "";
    };
    applyBadgeStyle();
    this._register(this.themeService.onDidColorThemeChange(() => applyBadgeStyle()));
    if (this.tooltip) {
      const updateTitle = () => {
        if (this.element) {
          this.elementHover.update(this.tooltip);
        }
      };
      this._register(this.labelService.onDidChangeFormatters(() => updateTitle()));
      updateTitle();
    }
  }
};
ExtensionIconBadge = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IThemeService)
], ExtensionIconBadge);
class ExtensionPackCountWidget extends ExtensionWidget {
  constructor(parent) {
    super();
    this.parent = parent;
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.element?.remove();
    this.countBadge?.dispose();
    this.countBadge = void 0;
  }
  render() {
    this.clear();
    if (!this.extension || !this.extension.categories?.some((category) => category.toLowerCase() === "extension packs") || !this.extension.extensionPack.length) {
      return;
    }
    this.element = append(this.parent, $(".extension-badge.extension-pack-badge"));
    this.countBadge = new CountBadge(this.element, {}, defaultCountBadgeStyles);
    this.countBadge.setCount(this.extension.extensionPack.length);
  }
}
let ExtensionKindIndicatorWidget = class extends ExtensionWidget {
  constructor(container, small, hoverService, contextService, uriIdentityService, explorerService, viewsService, extensionGalleryManifestService) {
    super();
    this.container = container;
    this.small = small;
    this.hoverService = hoverService;
    this.contextService = contextService;
    this.uriIdentityService = uriIdentityService;
    this.explorerService = explorerService;
    this.viewsService = viewsService;
    this.extensionGalleryManifest = null;
    this.disposables = this._register(new DisposableStore());
    this.render();
    this._register(toDisposable(() => this.clear()));
    extensionGalleryManifestService.getExtensionGalleryManifest().then((manifest) => {
      if (this._store.isDisposed) {
        return;
      }
      this.extensionGalleryManifest = manifest;
      this.render();
    });
  }
  clear() {
    this.element?.remove();
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.extension) {
      return;
    }
    if (this.extension?.private) {
      this.element = append(this.container, $(".extension-kind-indicator"));
      if (!this.small || this.extensionGalleryManifest?.capabilities.extensions?.includePublicExtensions && this.extensionGalleryManifest?.capabilities.extensions?.includePrivateExtensions) {
        append(this.element, $("span" + ThemeIcon.asCSSSelector(privateExtensionIcon)));
      }
      if (!this.small) {
        append(this.element, $("span.private-extension-label", void 0, localize("privateExtension", "Private Extension")));
      }
      return;
    }
    if (!this.small) {
      return;
    }
    const location = this.extension.resourceExtension?.location ?? (this.extension.local?.source === "resource" ? this.extension.local?.location : void 0);
    if (!location) {
      return;
    }
    this.element = append(this.container, $(".extension-kind-indicator"));
    const workspaceFolder = this.contextService.getWorkspaceFolder(location);
    if (workspaceFolder && this.extension.isWorkspaceScoped) {
      this.element.textContent = localize("workspace extension", "Workspace Extension");
      this.element.classList.add("clickable");
      this.element.setAttribute("role", "button");
      this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, this.uriIdentityService.extUri.relativePath(workspaceFolder.uri, location)));
      this.disposables.add(onClick(this.element, () => {
        this.viewsService.openView(EXPLORER_VIEW_ID, true).then(() => this.explorerService.select(location, true));
      }));
    } else {
      this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, location.path));
      this.element.textContent = localize("local extension", "Local Extension");
    }
  }
};
ExtensionKindIndicatorWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IExplorerService),
  __decorateParam(6, IViewsService),
  __decorateParam(7, IExtensionGalleryManifestService)
], ExtensionKindIndicatorWidget);
let SyncIgnoredWidget = class extends ExtensionWidget {
  constructor(container, configurationService, extensionsWorkbenchService, hoverService, userDataSyncEnablementService) {
    super();
    this.container = container;
    this.configurationService = configurationService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.hoverService = hoverService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.disposables = this._register(new DisposableStore());
    this._register(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("settingsSync.ignoredExtensions"))(() => this.render()));
    this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.update()));
    this.render();
  }
  render() {
    this.disposables.clear();
    this.container.innerText = "";
    if (this.extension && this.extension.state === ExtensionState.Installed && this.userDataSyncEnablementService.isEnabled() && this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension)) {
      const element = append(this.container, $("span.extension-sync-ignored" + ThemeIcon.asCSSSelector(syncIgnoredIcon)));
      this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), element, localize("syncingore.label", "This extension is ignored during sync.")));
      element.classList.add(...ThemeIcon.asClassNameArray(syncIgnoredIcon));
    }
  }
};
SyncIgnoredWidget = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IUserDataSyncEnablementService)
], SyncIgnoredWidget);
let ExtensionRestartRequiredWidget = class extends ExtensionWidget {
  constructor(container, hoverService) {
    super();
    this.container = container;
    this.hoverService = hoverService;
    this.disposables = this._register(new DisposableStore());
  }
  render() {
    this.disposables.clear();
    this.container.innerText = "";
    const runtimeState = this.extension?.runtimeState;
    const reason = typeof runtimeState?.reason === "string" ? runtimeState.reason : "";
    if (runtimeState && /restart|reload/i.test(reason)) {
      const element = append(this.container, $("span.extension-restart-required" + ThemeIcon.asCSSSelector(restartRequiredIcon)));
      append(this.container, $("span.extension-restart-required-label", void 0, localize("restart required", "Restart Required")));
      this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), element, reason));
    }
  }
};
ExtensionRestartRequiredWidget = __decorateClass([
  __decorateParam(1, IHoverService)
], ExtensionRestartRequiredWidget);
let ExtensionRuntimeStatusWidget = class extends ExtensionWidget {
  constructor(extensionViewState, container, extensionService, extensionFeaturesManagementService, extensionsWorkbenchService) {
    super();
    this.extensionViewState = extensionViewState;
    this.container = container;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this._register(extensionService.onDidChangeExtensionsStatus((extensions) => {
      if (this.extension && extensions.some((e) => areSameExtensions({ id: e.value }, this.extension.identifier))) {
        this.update();
      }
    }));
    this._register(extensionFeaturesManagementService.onDidChangeAccessData((e) => {
      if (this.extension && ExtensionIdentifier.equals(this.extension.identifier.id, e.extension)) {
        this.update();
      }
    }));
  }
  render() {
    this.container.innerText = "";
    if (!this.extension) {
      return;
    }
    if (this.extensionViewState.filters.featureId && this.extension.state === ExtensionState.Installed) {
      const accessData = this.extensionFeaturesManagementService.getAllAccessDataForExtension(new ExtensionIdentifier(this.extension.identifier.id)).get(this.extensionViewState.filters.featureId);
      const feature = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeature(this.extensionViewState.filters.featureId);
      if (feature?.icon && accessData) {
        const featureAccessTimeElement = append(this.container, $("span.activationTime"));
        featureAccessTimeElement.textContent = localize("feature access label", "{0} reqs", accessData.accessTimes.length);
        const iconElement = append(this.container, $("span" + ThemeIcon.asCSSSelector(feature.icon)));
        iconElement.style.paddingLeft = "4px";
        return;
      }
    }
    const extensionStatus = this.extensionsWorkbenchService.getExtensionRuntimeStatus(this.extension);
    if (extensionStatus?.activationTimes) {
      const activationTime = extensionStatus.activationTimes.codeLoadingTime + extensionStatus.activationTimes.activateCallTime;
      append(this.container, $("span" + ThemeIcon.asCSSSelector(activationTimeIcon)));
      const activationTimeElement = append(this.container, $("span.activationTime"));
      activationTimeElement.textContent = `${activationTime}ms`;
    }
  }
};
ExtensionRuntimeStatusWidget = __decorateClass([
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IExtensionFeaturesManagementService),
  __decorateParam(4, IExtensionsWorkbenchService)
], ExtensionRuntimeStatusWidget);
let ExtensionHoverWidget = class extends ExtensionWidget {
  constructor(options, extensionStatusAction, extensionsWorkbenchService, extensionFeaturesManagementService, hoverService, configurationService, extensionRecommendationsService, themeService, contextService) {
    super();
    this.options = options;
    this.extensionStatusAction = extensionStatusAction;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.hoverService = hoverService;
    this.configurationService = configurationService;
    this.extensionRecommendationsService = extensionRecommendationsService;
    this.themeService = themeService;
    this.contextService = contextService;
    this.hover = this._register(new MutableDisposable());
  }
  render() {
    this.hover.value = void 0;
    if (this.extension) {
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
          markdown: async () => {
            try {
              await this.extensionStatusAction.recomputeStatus();
            } catch (error) {
            }
            return this.getHoverMarkdown();
          },
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
    if (!this.extension) {
      return void 0;
    }
    const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
    markdown.appendMarkdown(`**`).appendText(this.extension.displayName).appendMarkdown(`**`);
    if (semver.valid(this.extension.version)) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">**&nbsp;_v${this.extension.version}${this.extension.isPreReleaseVersion ? " (pre-release)" : ""}_**&nbsp;</span>`);
    }
    markdown.appendText(`
`);
    let addSeparator = false;
    if (this.extension.private) {
      markdown.appendMarkdown(`$(${privateExtensionIcon.id}) ${localize("privateExtension", "Private Extension")}`);
      addSeparator = true;
    }
    if (this.extension.state === ExtensionState.Installed) {
      const installLabel = InstallCountWidget.getInstallLabel(this.extension, true);
      if (installLabel) {
        if (addSeparator) {
          markdown.appendText(`  |  `);
        }
        markdown.appendMarkdown(`$(${installCountIcon.id}) ${installLabel}`);
        addSeparator = true;
      }
      if (this.extension.rating) {
        if (addSeparator) {
          markdown.appendText(`  |  `);
        }
        const rating = Math.round(this.extension.rating * 2) / 2;
        markdown.appendMarkdown(`$(${starFullIcon.id}) [${rating}](${this.extension.url}&ssr=false#review-details)`);
        addSeparator = true;
      }
      if (this.extension.publisherSponsorLink) {
        if (addSeparator) {
          markdown.appendText(`  |  `);
        }
        markdown.appendMarkdown(`$(${sponsorIcon.id}) [${localize("sponsor", "Sponsor")}](${this.extension.publisherSponsorLink})`);
        addSeparator = true;
      }
    }
    if (addSeparator) {
      markdown.appendText(`
`);
    }
    const location = this.extension.resourceExtension?.location ?? (this.extension.local?.source === "resource" ? this.extension.local?.location : void 0);
    if (location) {
      if (this.extension.isWorkspaceScoped && this.contextService.isInsideWorkspace(location)) {
        markdown.appendMarkdown(localize("workspace extension", "Workspace Extension"));
      } else {
        markdown.appendMarkdown(localize("local extension", "Local Extension"));
      }
      markdown.appendText(`
`);
    }
    if (this.extension.description) {
      markdown.appendText(this.extension.description);
      markdown.appendText(`
`);
    }
    if (this.extension.publisherDomain?.verified) {
      const bgColor = this.themeService.getColorTheme().getColor(extensionVerifiedPublisherIconColor);
      const publisherVerifiedTooltip = localize("publisher verified tooltip", "This publisher has verified ownership of {0}", `[${URI.parse(this.extension.publisherDomain.link).authority}](${this.extension.publisherDomain.link})`);
      markdown.appendMarkdown(`<span style="color:${bgColor ? Color.Format.CSS.formatHex(bgColor) : "#ffffff"};">$(${verifiedPublisherIcon.id})</span>&nbsp;${publisherVerifiedTooltip}`);
      markdown.appendText(`
`);
    }
    if (this.extension.outdated) {
      markdown.appendMarkdown(localize("updateRequired", "Latest version:"));
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">**&nbsp;_v${this.extension.latestVersion}_**&nbsp;</span>`);
      markdown.appendText(`
`);
    }
    const preReleaseMessage = ExtensionHoverWidget.getPreReleaseMessage(this.extension);
    const extensionRuntimeStatus = this.extensionsWorkbenchService.getExtensionRuntimeStatus(this.extension);
    const extensionFeaturesAccessData = this.extensionFeaturesManagementService.getAllAccessDataForExtension(new ExtensionIdentifier(this.extension.identifier.id));
    const extensionStatus = this.extensionStatusAction.status;
    const runtimeState = this.extension.runtimeState;
    const recommendationMessage = this.getRecommendationMessage(this.extension);
    if (extensionRuntimeStatus || extensionFeaturesAccessData.size || extensionStatus.length || runtimeState || recommendationMessage || preReleaseMessage) {
      markdown.appendMarkdown(`---`);
      markdown.appendText(`
`);
      if (extensionRuntimeStatus) {
        if (extensionRuntimeStatus.activationTimes) {
          const activationTime = extensionRuntimeStatus.activationTimes.codeLoadingTime + extensionRuntimeStatus.activationTimes.activateCallTime;
          markdown.appendMarkdown(`${localize("activation", "Activation time")}${extensionRuntimeStatus.activationTimes.activationReason.startup ? ` (${localize("startup", "Startup")})` : ""}: \`${activationTime}ms\``);
          markdown.appendText(`
`);
        }
        if (extensionRuntimeStatus.runtimeErrors.length || extensionRuntimeStatus.messages.length) {
          const hasErrors = extensionRuntimeStatus.runtimeErrors.length || extensionRuntimeStatus.messages.some((message) => message.type === Severity.Error);
          const hasWarnings = extensionRuntimeStatus.messages.some((message) => message.type === Severity.Warning);
          const errorsLink = extensionRuntimeStatus.runtimeErrors.length ? `[${extensionRuntimeStatus.runtimeErrors.length === 1 ? localize("uncaught error", "1 uncaught error") : localize("uncaught errors", "{0} uncaught errors", extensionRuntimeStatus.runtimeErrors.length)}](${createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Features)})` : void 0;
          const messageLink = extensionRuntimeStatus.messages.length ? `[${extensionRuntimeStatus.messages.length === 1 ? localize("message", "1 message") : localize("messages", "{0} messages", extensionRuntimeStatus.messages.length)}](${createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Features)})` : void 0;
          markdown.appendMarkdown(`$(${hasErrors ? errorIcon.id : hasWarnings ? warningIcon.id : infoIcon.id}) This extension has reported `);
          if (errorsLink && messageLink) {
            markdown.appendMarkdown(`${errorsLink} and ${messageLink}`);
          } else {
            markdown.appendMarkdown(`${errorsLink || messageLink}`);
          }
          markdown.appendText(`
`);
        }
      }
      if (extensionFeaturesAccessData.size) {
        const registry = Registry.as(Extensions.ExtensionFeaturesRegistry);
        for (const [featureId, accessData] of extensionFeaturesAccessData) {
          if (accessData?.accessTimes.length) {
            const feature = registry.getExtensionFeature(featureId);
            if (feature) {
              markdown.appendMarkdown(localize("feature usage label", "{0} usage", feature.label));
              markdown.appendMarkdown(`: [${localize("total", "{0} {1} requests in last 30 days", accessData.accessTimes.length, feature.accessDataLabel ?? feature.label)}](${createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Features)})`);
              markdown.appendText(`
`);
            }
          }
        }
      }
      for (const status of extensionStatus) {
        if (status.icon) {
          markdown.appendMarkdown(`$(${status.icon.id})&nbsp;`);
        }
        markdown.appendMarkdown(status.message.value);
        markdown.appendText(`
`);
      }
      if (runtimeState) {
        markdown.appendMarkdown(`$(${infoIcon.id})&nbsp;`);
        markdown.appendMarkdown(`${runtimeState.reason}`);
        markdown.appendText(`
`);
      }
      if (preReleaseMessage) {
        const extensionPreReleaseIcon = this.themeService.getColorTheme().getColor(extensionPreReleaseIconColor);
        markdown.appendMarkdown(`<span style="color:${extensionPreReleaseIcon ? Color.Format.CSS.formatHex(extensionPreReleaseIcon) : "#ffffff"};">$(${preReleaseIcon.id})</span>&nbsp;${preReleaseMessage}`);
        markdown.appendText(`
`);
      }
      if (recommendationMessage) {
        markdown.appendMarkdown(recommendationMessage);
        markdown.appendText(`
`);
      }
    }
    return markdown;
  }
  getRecommendationMessage(extension) {
    if (extension.state === ExtensionState.Installed) {
      return void 0;
    }
    if (extension.deprecationInfo) {
      return void 0;
    }
    const recommendation = this.extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()];
    if (!recommendation?.reasonText) {
      return void 0;
    }
    const bgColor = this.themeService.getColorTheme().getColor(extensionButtonProminentBackground);
    return `<span style="color:${bgColor ? Color.Format.CSS.formatHex(bgColor) : "#ffffff"};">$(${starEmptyIcon.id})</span>&nbsp;${recommendation.reasonText}`;
  }
  static getPreReleaseMessage(extension) {
    if (!extension.hasPreReleaseVersion) {
      return void 0;
    }
    if (extension.isBuiltin) {
      return void 0;
    }
    if (extension.isPreReleaseVersion) {
      return void 0;
    }
    if (extension.preRelease) {
      return void 0;
    }
    const preReleaseVersionLink = `[${localize("Show prerelease version", "Pre-Release version")}](${createCommandUri("workbench.extensions.action.showPreReleaseVersion", extension.identifier.id)})`;
    return localize("has prerelease", "This extension has a {0} available", preReleaseVersionLink);
  }
};
ExtensionHoverWidget = __decorateClass([
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IExtensionFeaturesManagementService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IExtensionRecommendationsService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IWorkspaceContextService)
], ExtensionHoverWidget);
let ExtensionStatusWidget = class extends ExtensionWidget {
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
      append(this.container, rendered.element);
    }
    this._onDidRender.fire();
  }
};
ExtensionStatusWidget = __decorateClass([
  __decorateParam(2, IMarkdownRendererService)
], ExtensionStatusWidget);
let ExtensionRecommendationWidget = class extends ExtensionWidget {
  constructor(container, extensionRecommendationsService, extensionIgnoredRecommendationsService) {
    super();
    this.container = container;
    this.extensionRecommendationsService = extensionRecommendationsService;
    this.extensionIgnoredRecommendationsService = extensionIgnoredRecommendationsService;
    this._onDidRender = this._register(new Emitter());
    this.onDidRender = this._onDidRender.event;
    this.render();
    this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => this.render()));
  }
  render() {
    reset(this.container);
    const recommendationStatus = this.getRecommendationStatus();
    if (recommendationStatus) {
      if (recommendationStatus.icon) {
        append(this.container, $(`div${ThemeIcon.asCSSSelector(recommendationStatus.icon)}`));
      }
      append(this.container, $(`div.recommendation-text`, void 0, recommendationStatus.message));
    }
    this._onDidRender.fire();
  }
  getRecommendationStatus() {
    if (!this.extension || this.extension.deprecationInfo || this.extension.state === ExtensionState.Installed) {
      return void 0;
    }
    const extRecommendations = this.extensionRecommendationsService.getAllRecommendationsWithReason();
    if (extRecommendations[this.extension.identifier.id.toLowerCase()]) {
      const reasonText = extRecommendations[this.extension.identifier.id.toLowerCase()].reasonText;
      if (reasonText) {
        return { icon: starEmptyIcon, message: reasonText };
      }
    } else if (this.extensionIgnoredRecommendationsService.globalIgnoredRecommendations.indexOf(this.extension.identifier.id.toLowerCase()) !== -1) {
      return { icon: void 0, message: localize("recommendationHasBeenIgnored", "You have chosen not to receive recommendations for this extension.") };
    }
    return void 0;
  }
};
ExtensionRecommendationWidget = __decorateClass([
  __decorateParam(1, IExtensionRecommendationsService),
  __decorateParam(2, IExtensionIgnoredRecommendationsService)
], ExtensionRecommendationWidget);
const extensionRatingIconColor = registerColor("extensionIcon.starForeground", { light: "#DF6100", dark: "#FF8E00", hcDark: "#FF8E00", hcLight: textLinkForeground }, localize("extensionIconStarForeground", "The icon color for extension ratings."), false);
const extensionPreReleaseIconColor = registerColor("extensionIcon.preReleaseForeground", { dark: "#1d9271", light: "#1d9271", hcDark: "#1d9271", hcLight: textLinkForeground }, localize("extensionPreReleaseForeground", "The icon color for pre-release extension."), false);
const extensionSponsorIconColor = registerColor("extensionIcon.sponsorForeground", { light: "#B51E78", dark: "#D758B3", hcDark: null, hcLight: "#B51E78" }, localize("extensionIcon.sponsorForeground", "The icon color for extension sponsor."), false);
const extensionPrivateBadgeBackground = registerColor("extensionIcon.privateForeground", { dark: "#ffffff60", light: "#00000060", hcDark: "#ffffff60", hcLight: "#00000060" }, localize("extensionIcon.private", "The icon color for private extensions."));
registerThemingParticipant((theme, collector) => {
  const extensionRatingIcon = theme.getColor(extensionRatingIconColor);
  if (extensionRatingIcon) {
    collector.addRule(`.extension-ratings .codicon-extensions-star-full, .extension-ratings .codicon-extensions-star-half { color: ${extensionRatingIcon}; }`);
    collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(starFullIcon)} { color: ${extensionRatingIcon}; }`);
  }
  const extensionVerifiedPublisherIcon = theme.getColor(extensionVerifiedPublisherIconColor);
  if (extensionVerifiedPublisherIcon) {
    collector.addRule(`${ThemeIcon.asCSSSelector(verifiedPublisherIcon)} { color: ${extensionVerifiedPublisherIcon}; }`);
  }
  collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(sponsorIcon)} { color: var(--vscode-extensionIcon-sponsorForeground); }`);
  collector.addRule(`.extension-editor > .header > .details > .subtitle .sponsor ${ThemeIcon.asCSSSelector(sponsorIcon)} { color: var(--vscode-extensionIcon-sponsorForeground); }`);
  const privateBadgeBackground = theme.getColor(extensionPrivateBadgeBackground);
  if (privateBadgeBackground) {
    collector.addRule(`.extension-private-badge { color: ${privateBadgeBackground}; }`);
  }
});
export {
  ExtensionHoverWidget,
  ExtensionIconBadge,
  ExtensionIconWidget,
  ExtensionKindIndicatorWidget,
  ExtensionPackCountWidget,
  ExtensionRecommendationWidget,
  ExtensionRestartRequiredWidget,
  ExtensionRuntimeStatusWidget,
  ExtensionStatusWidget,
  ExtensionWidget,
  InstallCountWidget,
  PreReleaseBookmarkWidget,
  PublisherWidget,
  RatingsWidget,
  RecommendationWidget,
  RemoteBadgeWidget,
  SponsorWidget,
  SyncIgnoredWidget,
  extensionPreReleaseIconColor,
  extensionPrivateBadgeBackground,
  extensionRatingIconColor,
  extensionSponsorIconColor,
  onClick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbnNXaWRnZXRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2V4dGVuc2lvbnNXaWRnZXRzLmNzcyc7XG5pbXBvcnQgKiBhcyBzZW12ZXIgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2VtdmVyL3NlbXZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb24sIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgSUV4dGVuc2lvbkNvbnRhaW5lciwgRXh0ZW5zaW9uU3RhdGUsIEV4dGVuc2lvbkVkaXRvclRhYiwgSUV4dGVuc2lvbnNWaWV3U3RhdGUgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBhcHBlbmQsICQsIHJlc2V0LCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgZmluYWxIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSwgSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IGV4dGVuc2lvbkJ1dHRvblByb21pbmVudEJhY2tncm91bmQsIEV4dGVuc2lvblN0YXR1c0FjdGlvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBFWFRFTlNJT05fQkFER0VfQkFDS0dST1VORCwgRVhURU5TSU9OX0JBREdFX0ZPUkVHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENvdW50QmFkZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY291bnRCYWRnZS9jb3VudEJhZGdlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgYWN0aXZhdGlvblRpbWVJY29uLCBlcnJvckljb24sIGluZm9JY29uLCBpbnN0YWxsQ291bnRJY29uLCBwcmVSZWxlYXNlSWNvbiwgcHJpdmF0ZUV4dGVuc2lvbkljb24sIHJhdGluZ0ljb24sIHJlbW90ZUljb24sIHJlc3RhcnRSZXF1aXJlZEljb24sIHNwb25zb3JJY29uLCBzdGFyRW1wdHlJY29uLCBzdGFyRnVsbEljb24sIHN0YXJIYWxmSWNvbiwgc3luY0lnbm9yZWRJY29uLCB3YXJuaW5nSWNvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ29sb3IsIHRleHRMaW5rRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29tbWFuZFVyaSwgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgZXh0ZW5zaW9uRGVmYXVsdEljb24sIGV4dGVuc2lvblZlcmlmaWVkUHVibGlzaGVySWNvbkNvbG9yLCB2ZXJpZmllZFB1Ymxpc2hlckljb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25zSWNvbnMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJRXhwbG9yZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvYnJvd3Nlci9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWSUVXX0lEIGFzIEVYUExPUkVSX1ZJRVdfSUQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEV4dGVuc2lvbldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uQ29udGFpbmVyIHtcblx0cHJpdmF0ZSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgbnVsbCA9IG51bGw7XG5cdGdldCBleHRlbnNpb24oKTogSUV4dGVuc2lvbiB8IG51bGwgeyByZXR1cm4gdGhpcy5fZXh0ZW5zaW9uOyB9XG5cdHNldCBleHRlbnNpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgbnVsbCkgeyB0aGlzLl9leHRlbnNpb24gPSBleHRlbnNpb247IHRoaXMudXBkYXRlKCk7IH1cblx0dXBkYXRlKCk6IHZvaWQgeyB0aGlzLnJlbmRlcigpOyB9XG5cdGFic3RyYWN0IHJlbmRlcigpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb25DbGljayhlbGVtZW50OiBIVE1MRWxlbWVudCwgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgRXZlbnRUeXBlLkNMSUNLLCBmaW5hbEhhbmRsZXIoY2FsbGJhY2spKSk7XG5cdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgRXZlbnRUeXBlLktFWV9VUCwgZSA9PiB7XG5cdFx0Y29uc3Qga2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpIHx8IGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Y2FsbGJhY2soKTtcblx0XHR9XG5cdH0pKTtcblx0cmV0dXJuIGRpc3Bvc2FibGVzO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uSWNvbldpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpY29uTG9hZGluZ0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgaWNvbkVycm9yRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBpY29uRWxlbWVudDogSFRNTEltYWdlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0SWNvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgaWNvblVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmV4dGVuc2lvbi1pY29uJykpO1xuXG5cdFx0dGhpcy5pY29uRWxlbWVudCA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJ2ltZy5pY29uJywgeyBhbHQ6ICcnIH0pKTtcblx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHR0aGlzLmRlZmF1bHRJY29uRWxlbWVudCA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoZXh0ZW5zaW9uRGVmYXVsdEljb24pKSk7XG5cdFx0dGhpcy5kZWZhdWx0SWNvbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmljb25VcmwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5pY29uRWxlbWVudC5zcmMgPSAnJztcblx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5kZWZhdWx0SWNvbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmljb25FcnJvckRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0aGlzLmljb25Mb2FkaW5nRGlzcG9zYWJsZS5jbGVhcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24uaWNvblVybCkge1xuXHRcdFx0aWYgKHRoaXMuaWNvblVybCAhPT0gdGhpcy5leHRlbnNpb24uaWNvblVybCkge1xuXHRcdFx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5oZXJpdCc7XG5cdFx0XHRcdHRoaXMuZGVmYXVsdEljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuaWNvblVybCA9IHRoaXMuZXh0ZW5zaW9uLmljb25Vcmw7XG5cdFx0XHRcdHRoaXMuaWNvbkVycm9yRGlzcG9zYWJsZS52YWx1ZSA9IGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmljb25FbGVtZW50LCAnZXJyb3InLCAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uPy5pY29uVXJsRmFsbGJhY2spIHtcblx0XHRcdFx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuc3JjID0gdGhpcy5leHRlbnNpb24uaWNvblVybEZhbGxiYWNrO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdFx0XHR0aGlzLmRlZmF1bHRJY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2luaGVyaXQnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgeyBvbmNlOiB0cnVlIH0pO1xuXHRcdFx0XHR0aGlzLmljb25FbGVtZW50LnNyYyA9IHRoaXMuaWNvblVybDtcblx0XHRcdFx0aWYgKCF0aGlzLmljb25FbGVtZW50LmNvbXBsZXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cdFx0XHRcdFx0dGhpcy5pY29uTG9hZGluZ0Rpc3Bvc2FibGUudmFsdWUgPSBhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5pY29uRWxlbWVudCwgJ2xvYWQnLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAnaW5oZXJpdCc7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJ2luaGVyaXQnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaWNvblVybCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuc3JjID0gJyc7XG5cdFx0XHR0aGlzLmRlZmF1bHRJY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2luaGVyaXQnO1xuXHRcdFx0dGhpcy5pY29uRXJyb3JEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmljb25Mb2FkaW5nRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5zdGFsbENvdW50V2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgc21hbGw6IGJvb2xlYW4sXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsZWFyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblxuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zbWFsbCAmJiB0aGlzLmV4dGVuc2lvbi5zdGF0ZSAhPT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YWxsTGFiZWwgPSBJbnN0YWxsQ291bnRXaWRnZXQuZ2V0SW5zdGFsbExhYmVsKHRoaXMuZXh0ZW5zaW9uLCB0aGlzLnNtYWxsKTtcblx0XHRpZiAoIWluc3RhbGxMYWJlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudCA9IHRoaXMuc21hbGwgPyB0aGlzLmNvbnRhaW5lciA6IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnc3Bhbi5pbnN0YWxsJywgeyB0YWJJbmRleDogMCB9KSk7XG5cdFx0YXBwZW5kKHBhcmVudCwgJCgnc3BhbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpbnN0YWxsQ291bnRJY29uKSkpO1xuXHRcdGNvbnN0IGNvdW50ID0gYXBwZW5kKHBhcmVudCwgJCgnc3Bhbi5jb3VudCcpKTtcblx0XHRjb3VudC50ZXh0Q29udGVudCA9IGluc3RhbGxMYWJlbDtcblxuXHRcdGlmICghdGhpcy5zbWFsbCkge1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuY29udGFpbmVyLCBsb2NhbGl6ZSgnaW5zdGFsbCBjb3VudCcsIFwiSW5zdGFsbCBjb3VudFwiKSkpO1xuXHRcdH1cblx0fVxuXG5cdHN0YXRpYyBnZXRJbnN0YWxsTGFiZWwoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBzbWFsbDogYm9vbGVhbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5zdGFsbENvdW50ID0gZXh0ZW5zaW9uLmluc3RhbGxDb3VudDtcblxuXHRcdGlmICghaW5zdGFsbENvdW50KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBpbnN0YWxsTGFiZWw6IHN0cmluZztcblxuXHRcdGlmIChzbWFsbCkge1xuXHRcdFx0aWYgKGluc3RhbGxDb3VudCA+IDEwMDAwMDApIHtcblx0XHRcdFx0aW5zdGFsbExhYmVsID0gYCR7TWF0aC5mbG9vcihpbnN0YWxsQ291bnQgLyAxMDAwMDApIC8gMTB9TWA7XG5cdFx0XHR9IGVsc2UgaWYgKGluc3RhbGxDb3VudCA+IDEwMDApIHtcblx0XHRcdFx0aW5zdGFsbExhYmVsID0gYCR7TWF0aC5mbG9vcihpbnN0YWxsQ291bnQgLyAxMDAwKX1LYDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluc3RhbGxMYWJlbCA9IFN0cmluZyhpbnN0YWxsQ291bnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGluc3RhbGxMYWJlbCA9IGluc3RhbGxDb3VudC50b0xvY2FsZVN0cmluZyhwbGF0Zm9ybS5sYW5ndWFnZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluc3RhbGxMYWJlbDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmF0aW5nc1dpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSBjb250YWluZXJIb3ZlcjogSU1hbmFnZWRIb3ZlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHNtYWxsOiBib29sZWFuLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdleHRlbnNpb24tcmF0aW5ncycpO1xuXG5cdFx0aWYgKHRoaXMuc21hbGwpIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzbWFsbCcpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lci5pbm5lclRleHQgPSAnJztcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNtYWxsICYmIHRoaXMuZXh0ZW5zaW9uLnN0YXRlICE9PSBFeHRlbnNpb25TdGF0ZS5Vbmluc3RhbGxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5yYXRpbmcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNtYWxsICYmICF0aGlzLmV4dGVuc2lvbi5yYXRpbmdDb3VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5leHRlbnNpb24udXJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmF0aW5nID0gTWF0aC5yb3VuZCh0aGlzLmV4dGVuc2lvbi5yYXRpbmcgKiAyKSAvIDI7XG5cdFx0aWYgKHRoaXMuc21hbGwpIHtcblx0XHRcdGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnc3BhbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihzdGFyRnVsbEljb24pKSk7XG5cblx0XHRcdGNvbnN0IGNvdW50ID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCdzcGFuLmNvdW50JykpO1xuXHRcdFx0Y291bnQudGV4dENvbnRlbnQgPSBTdHJpbmcocmF0aW5nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnc3Bhbi5yYXRpbmcuY2xpY2thYmxlJywgeyB0YWJJbmRleDogMCB9KSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSA1OyBpKyspIHtcblx0XHRcdFx0aWYgKHJhdGluZyA+PSBpKSB7XG5cdFx0XHRcdFx0YXBwZW5kKGVsZW1lbnQsICQoJ3NwYW4nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3Ioc3RhckZ1bGxJY29uKSkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJhdGluZyA+PSBpIC0gMC41KSB7XG5cdFx0XHRcdFx0YXBwZW5kKGVsZW1lbnQsICQoJ3NwYW4nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3Ioc3RhckhhbGZJY29uKSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFwcGVuZChlbGVtZW50LCAkKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHN0YXJFbXB0eUljb24pKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5yYXRpbmdDb3VudCkge1xuXHRcdFx0XHRjb25zdCByYXRpbmdDb3VudEVsZW1ldCA9IGFwcGVuZChlbGVtZW50LCAkKCdzcGFuJywgdW5kZWZpbmVkLCBgICgke3RoaXMuZXh0ZW5zaW9uLnJhdGluZ0NvdW50fSlgKSk7XG5cdFx0XHRcdHJhdGluZ0NvdW50RWxlbWV0LnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzFweCc7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY29udGFpbmVySG92ZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZWxlbWVudCwgJycpKTtcblx0XHRcdHRoaXMuY29udGFpbmVySG92ZXIudXBkYXRlKGxvY2FsaXplKCdyYXRlZExhYmVsJywgXCJBdmVyYWdlIHJhdGluZzogezB9IG91dCBvZiA1XCIsIHJhdGluZykpO1xuXHRcdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGluaycpO1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnJhdGluZ1VybCkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChvbkNsaWNrKGVsZW1lbnQsICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSh0aGlzLmV4dGVuc2lvbiEucmF0aW5nVXJsISkpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFB1Ymxpc2hlcldpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSBlbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb250YWluZXJIb3ZlcjogSU1hbmFnZWRIb3ZlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgc21hbGw6IGJvb2xlYW4sXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsZWFyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50Py5yZW1vdmUoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24ucmVzb3VyY2VFeHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24ubG9jYWw/LnNvdXJjZSA9PT0gJ3Jlc291cmNlJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWxlbWVudCA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLnB1Ymxpc2hlcicpKTtcblx0XHRjb25zdCBwdWJsaXNoZXJEaXNwbGF5TmFtZSA9ICQoJy5wdWJsaXNoZXItbmFtZS5lbGxpcHNpcycpO1xuXHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lLnRleHRDb250ZW50ID0gdGhpcy5leHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWU7XG5cblx0XHRjb25zdCB2ZXJpZmllZFB1Ymxpc2hlciA9ICQoJy52ZXJpZmllZC1wdWJsaXNoZXInKTtcblx0XHRhcHBlbmQodmVyaWZpZWRQdWJsaXNoZXIsICQoJ3NwYW4uZXh0ZW5zaW9uLXZlcmlmaWVkLXB1Ymxpc2hlci5jbGlja2FibGUnKSwgcmVuZGVySWNvbih2ZXJpZmllZFB1Ymxpc2hlckljb24pKTtcblxuXHRcdGlmICh0aGlzLnNtYWxsKSB7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24ucHVibGlzaGVyRG9tYWluPy52ZXJpZmllZCkge1xuXHRcdFx0XHRhcHBlbmQodGhpcy5lbGVtZW50LCB2ZXJpZmllZFB1Ymxpc2hlcik7XG5cdFx0XHR9XG5cdFx0XHRhcHBlbmQodGhpcy5lbGVtZW50LCBwdWJsaXNoZXJEaXNwbGF5TmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjbGlja2FibGUnLCAhIXRoaXMuZXh0ZW5zaW9uLnVybCk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnRhYkluZGV4ID0gMDtcblxuXHRcdFx0dGhpcy5jb250YWluZXJIb3ZlciA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmVsZW1lbnQsIGxvY2FsaXplKCdwdWJsaXNoZXInLCBcIlB1Ymxpc2hlciAoezB9KVwiLCB0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSkpKTtcblx0XHRcdGFwcGVuZCh0aGlzLmVsZW1lbnQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lKTtcblxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRvbWFpbj8udmVyaWZpZWQpIHtcblx0XHRcdFx0YXBwZW5kKHRoaXMuZWxlbWVudCwgdmVyaWZpZWRQdWJsaXNoZXIpO1xuXHRcdFx0XHRjb25zdCBwdWJsaXNoZXJEb21haW5MaW5rID0gVVJJLnBhcnNlKHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRvbWFpbi5saW5rKTtcblx0XHRcdFx0dmVyaWZpZWRQdWJsaXNoZXIudGFiSW5kZXggPSAwO1xuXHRcdFx0XHR2ZXJpZmllZFB1Ymxpc2hlci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVySG92ZXIudXBkYXRlKGxvY2FsaXplKCd2ZXJpZmllZCBwdWJsaXNoZXInLCBcIlRoaXMgcHVibGlzaGVyIGhhcyB2ZXJpZmllZCBvd25lcnNoaXAgb2YgezB9XCIsIHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRvbWFpbi5saW5rKSk7XG5cdFx0XHRcdHZlcmlmaWVkUHVibGlzaGVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdsaW5rJyk7XG5cblx0XHRcdFx0YXBwZW5kKHZlcmlmaWVkUHVibGlzaGVyLCAkKCdzcGFuLmV4dGVuc2lvbi12ZXJpZmllZC1wdWJsaXNoZXItZG9tYWluJywgdW5kZWZpbmVkLCBwdWJsaXNoZXJEb21haW5MaW5rLmF1dGhvcml0eS5zdGFydHNXaXRoKCd3d3cuJykgPyBwdWJsaXNoZXJEb21haW5MaW5rLmF1dGhvcml0eS5zdWJzdHJpbmcoNCkgOiBwdWJsaXNoZXJEb21haW5MaW5rLmF1dGhvcml0eSkpO1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChvbkNsaWNrKHZlcmlmaWVkUHVibGlzaGVyLCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihwdWJsaXNoZXJEb21haW5MaW5rKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24udXJsKSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG9uQ2xpY2sodGhpcy5lbGVtZW50LCAoKSA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYHB1Ymxpc2hlcjpcIiR7dGhpcy5leHRlbnNpb24/LnB1Ymxpc2hlckRpc3BsYXlOYW1lfVwiYCkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBTcG9uc29yV2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0cmVzZXQodGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uPy5wdWJsaXNoZXJTcG9uc29yTGluaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNwb25zb3IgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ3NwYW4uc3BvbnNvci5jbGlja2FibGUnLCB7IHRhYkluZGV4OiAwIH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgc3BvbnNvciwgdGhpcy5leHRlbnNpb24/LnB1Ymxpc2hlclNwb25zb3JMaW5rLnRvU3RyaW5nKCkgPz8gJycpKTtcblx0XHRzcG9uc29yLnNldEF0dHJpYnV0ZSgncm9sZScsICdsaW5rJyk7IC8vICMxMzI2NDVcblx0XHRjb25zdCBzcG9uc29ySWNvbkVsZW1lbnQgPSByZW5kZXJJY29uKHNwb25zb3JJY29uKTtcblx0XHRjb25zdCBsYWJlbCA9ICQoJ3NwYW4nLCB1bmRlZmluZWQsIGxvY2FsaXplKCdzcG9uc29yJywgXCJTcG9uc29yXCIpKTtcblx0XHRhcHBlbmQoc3BvbnNvciwgc3BvbnNvckljb25FbGVtZW50LCBsYWJlbCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQob25DbGljayhzcG9uc29yLCAoKSA9PiB7XG5cdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih0aGlzLmV4dGVuc2lvbiEucHVibGlzaGVyU3BvbnNvckxpbmshKTtcblx0XHR9KSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlY29tbWVuZGF0aW9uV2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblxuXHRwcml2YXRlIGVsZW1lbnQ/OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdEBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVjb21tZW5kYXRpb25zKCgpID0+IHRoaXMucmVuZGVyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50Py5yZW1vdmUoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uIHx8IHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQgfHwgdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV4dFJlY29tbWVuZGF0aW9ucyA9IHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRBbGxSZWNvbW1lbmRhdGlvbnNXaXRoUmVhc29uKCk7XG5cdFx0aWYgKGV4dFJlY29tbWVuZGF0aW9uc1t0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCldKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQgPSBhcHBlbmQodGhpcy5wYXJlbnQsICQoJ2Rpdi5leHRlbnNpb24tYm9va21hcmsnKSk7XG5cdFx0XHRjb25zdCByZWNvbW1lbmRhdGlvbiA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5yZWNvbW1lbmRhdGlvbicpKTtcblx0XHRcdGFwcGVuZChyZWNvbW1lbmRhdGlvbiwgJCgnc3BhbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihyYXRpbmdJY29uKSkpO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBQcmVSZWxlYXNlQm9va21hcmtXaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgZWxlbWVudD86IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudD8ucmVtb3ZlKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uPy5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkID8gdGhpcy5leHRlbnNpb24ucHJlUmVsZWFzZSA6IHRoaXMuZXh0ZW5zaW9uPy5oYXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0dGhpcy5lbGVtZW50ID0gYXBwZW5kKHRoaXMucGFyZW50LCAkKCdkaXYuZXh0ZW5zaW9uLWJvb2ttYXJrJykpO1xuXHRcdFx0Y29uc3QgcHJlUmVsZWFzZSA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5wcmUtcmVsZWFzZScpKTtcblx0XHRcdGFwcGVuZChwcmVSZWxlYXNlLCAkKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHByZVJlbGVhc2VJY29uKSkpO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVCYWRnZVdpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZW1vdGVCYWRnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxFeHRlbnNpb25JY29uQmFkZ2U+KCkpO1xuXG5cdHByaXZhdGUgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRvb2x0aXA6IGJvb2xlYW4sXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSBhcHBlbmQocGFyZW50LCAkKCcnKSk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMucmVtb3RlQmFkZ2UudmFsdWU/LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0dGhpcy5yZW1vdGVCYWRnZS5jbGVhcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uIHx8ICF0aGlzLmV4dGVuc2lvbi5sb2NhbCB8fCAhdGhpcy5leHRlbnNpb24uc2VydmVyIHx8ICEodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB8fCB0aGlzLmV4dGVuc2lvbi5zZXJ2ZXIgIT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgdG9vbHRpcDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLnRvb2x0aXAgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHR0b29sdGlwID0gbG9jYWxpemUoJ3JlbW90ZSBleHRlbnNpb24gdGl0bGUnLCBcIkV4dGVuc2lvbiBpbiB7MH1cIiwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmxhYmVsKTtcblx0XHR9XG5cdFx0dGhpcy5yZW1vdGVCYWRnZS52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uSWNvbkJhZGdlLCByZW1vdGVJY29uLCB0b29sdGlwKTtcblx0XHRhcHBlbmQodGhpcy5lbGVtZW50LCB0aGlzLnJlbW90ZUJhZGdlLnZhbHVlLmVsZW1lbnQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25JY29uQmFkZ2UgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZWxlbWVudEhvdmVyOiBJTWFuYWdlZEhvdmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaWNvbjogVGhlbWVJY29uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdG9vbHRpcDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSAkKCdkaXYuZXh0ZW5zaW9uLWJhZGdlLmV4dGVuc2lvbi1pY29uLWJhZGdlJyk7XG5cdFx0dGhpcy5lbGVtZW50SG92ZXIgPSB0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuZWxlbWVudCwgJycpKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoKTogdm9pZCB7XG5cdFx0YXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnc3BhbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3Rvcih0aGlzLmljb24pKSk7XG5cblx0XHRjb25zdCBhcHBseUJhZGdlU3R5bGUgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBiZ0NvbG9yID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKEVYVEVOU0lPTl9CQURHRV9CQUNLR1JPVU5EKTtcblx0XHRcdGNvbnN0IGZnQ29sb3IgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IoRVhURU5TSU9OX0JBREdFX0ZPUkVHUk9VTkQpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJnQ29sb3IgPyBiZ0NvbG9yLnRvU3RyaW5nKCkgOiAnJztcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5jb2xvciA9IGZnQ29sb3IgPyBmZ0NvbG9yLnRvU3RyaW5nKCkgOiAnJztcblx0XHR9O1xuXHRcdGFwcGx5QmFkZ2VTdHlsZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiBhcHBseUJhZGdlU3R5bGUoKSkpO1xuXG5cdFx0aWYgKHRoaXMudG9vbHRpcCkge1xuXHRcdFx0Y29uc3QgdXBkYXRlVGl0bGUgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLmVsZW1lbnRIb3Zlci51cGRhdGUodGhpcy50b29sdGlwKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFiZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9ybWF0dGVycygoKSA9PiB1cGRhdGVUaXRsZSgpKSk7XG5cdFx0XHR1cGRhdGVUaXRsZSgpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uUGFja0NvdW50V2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblxuXHRwcml2YXRlIGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvdW50QmFkZ2U6IENvdW50QmFkZ2UgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdHRoaXMuY291bnRCYWRnZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuY291bnRCYWRnZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbiB8fCAhKHRoaXMuZXh0ZW5zaW9uLmNhdGVnb3JpZXM/LnNvbWUoY2F0ZWdvcnkgPT4gY2F0ZWdvcnkudG9Mb3dlckNhc2UoKSA9PT0gJ2V4dGVuc2lvbiBwYWNrcycpKSB8fCAhdGhpcy5leHRlbnNpb24uZXh0ZW5zaW9uUGFjay5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5lbGVtZW50ID0gYXBwZW5kKHRoaXMucGFyZW50LCAkKCcuZXh0ZW5zaW9uLWJhZGdlLmV4dGVuc2lvbi1wYWNrLWJhZGdlJykpO1xuXHRcdHRoaXMuY291bnRCYWRnZSA9IG5ldyBDb3VudEJhZGdlKHRoaXMuZWxlbWVudCwge30sIGRlZmF1bHRDb3VudEJhZGdlU3R5bGVzKTtcblx0XHR0aGlzLmNvdW50QmFkZ2Uuc2V0Q291bnQodGhpcy5leHRlbnNpb24uZXh0ZW5zaW9uUGFjay5sZW5ndGgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25LaW5kSW5kaWNhdG9yV2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblxuXHRwcml2YXRlIGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSBzbWFsbDogYm9vbGVhbixcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4cGxvcmVyU2VydmljZTogSUV4cGxvcmVyU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdFx0ZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKS50aGVuKG1hbmlmZXN0ID0+IHtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0ID0gbWFuaWZlc3Q7XG5cdFx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uPy5wcml2YXRlKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5leHRlbnNpb24ta2luZC1pbmRpY2F0b3InKSk7XG5cdFx0XHRpZiAoIXRoaXMuc21hbGwgfHwgKHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0Py5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9ucz8uaW5jbHVkZVB1YmxpY0V4dGVuc2lvbnMgJiYgdGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q/LmNhcGFiaWxpdGllcy5leHRlbnNpb25zPy5pbmNsdWRlUHJpdmF0ZUV4dGVuc2lvbnMpKSB7XG5cdFx0XHRcdGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJ3NwYW4nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IocHJpdmF0ZUV4dGVuc2lvbkljb24pKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuc21hbGwpIHtcblx0XHRcdFx0YXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnc3Bhbi5wcml2YXRlLWV4dGVuc2lvbi1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3ByaXZhdGVFeHRlbnNpb24nLCBcIlByaXZhdGUgRXh0ZW5zaW9uXCIpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnNtYWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmV4dGVuc2lvbi5yZXNvdXJjZUV4dGVuc2lvbj8ubG9jYXRpb24gPz8gKHRoaXMuZXh0ZW5zaW9uLmxvY2FsPy5zb3VyY2UgPT09ICdyZXNvdXJjZScgPyB0aGlzLmV4dGVuc2lvbi5sb2NhbD8ubG9jYXRpb24gOiB1bmRlZmluZWQpO1xuXHRcdGlmICghbG9jYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5leHRlbnNpb24ta2luZC1pbmRpY2F0b3InKSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIobG9jYXRpb24pO1xuXHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIgJiYgdGhpcy5leHRlbnNpb24uaXNXb3Jrc3BhY2VTY29wZWQpIHtcblx0XHRcdHRoaXMuZWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd3b3Jrc3BhY2UgZXh0ZW5zaW9uJywgXCJXb3Jrc3BhY2UgRXh0ZW5zaW9uXCIpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NsaWNrYWJsZScpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmVsZW1lbnQsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5yZWxhdGl2ZVBhdGgod29ya3NwYWNlRm9sZGVyLnVyaSwgbG9jYXRpb24pKSk7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChvbkNsaWNrKHRoaXMuZWxlbWVudCwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnZpZXdzU2VydmljZS5vcGVuVmlldyhFWFBMT1JFUl9WSUVXX0lELCB0cnVlKS50aGVuKCgpID0+IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLnNlbGVjdChsb2NhdGlvbiwgdHJ1ZSkpO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5lbGVtZW50LCBsb2NhdGlvbi5wYXRoKSk7XG5cdFx0XHR0aGlzLmVsZW1lbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbG9jYWwgZXh0ZW5zaW9uJywgXCJMb2NhbCBFeHRlbnNpb25cIik7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTeW5jSWdub3JlZFdpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzZXR0aW5nc1N5bmMuaWdub3JlZEV4dGVuc2lvbnMnKSkoKCkgPT4gdGhpcy5yZW5kZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW5hYmxlbWVudCgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5jb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCAmJiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpICYmIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaXNFeHRlbnNpb25JZ25vcmVkVG9TeW5jKHRoaXMuZXh0ZW5zaW9uKSkge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnc3Bhbi5leHRlbnNpb24tc3luYy1pZ25vcmVkJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHN5bmNJZ25vcmVkSWNvbikpKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBlbGVtZW50LCBsb2NhbGl6ZSgnc3luY2luZ29yZS5sYWJlbCcsIFwiVGhpcyBleHRlbnNpb24gaXMgaWdub3JlZCBkdXJpbmcgc3luYy5cIikpKTtcblx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShzeW5jSWdub3JlZEljb24pKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblJlc3RhcnRSZXF1aXJlZFdpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmNvbnRhaW5lci5pbm5lclRleHQgPSAnJztcblxuXHRcdGNvbnN0IHJ1bnRpbWVTdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uPy5ydW50aW1lU3RhdGU7XG5cdFx0Y29uc3QgcmVhc29uID0gdHlwZW9mIHJ1bnRpbWVTdGF0ZT8ucmVhc29uID09PSAnc3RyaW5nJyA/IHJ1bnRpbWVTdGF0ZS5yZWFzb24gOiAnJztcblxuXHRcdC8vIE9ubHkgc2hvdyBcIlJlc3RhcnQgUmVxdWlyZWRcIiB3aGVuIHRoZSBydW50aW1lIHN0YXRlIHJlYXNvbiBjbGVhcmx5IGluZGljYXRlc1xuXHRcdC8vIGEgcmVzdGFydCBvciByZWxvYWQgaXMgbmVlZGVkLCB0byBhdm9pZCBtaXNsYWJlbGluZyBvdGhlciBydW50aW1lIGFjdGlvbnMuXG5cdFx0aWYgKHJ1bnRpbWVTdGF0ZSAmJiAvcmVzdGFydHxyZWxvYWQvaS50ZXN0KHJlYXNvbikpIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ3NwYW4uZXh0ZW5zaW9uLXJlc3RhcnQtcmVxdWlyZWQnICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IocmVzdGFydFJlcXVpcmVkSWNvbikpKTtcblx0XHRcdGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnc3Bhbi5leHRlbnNpb24tcmVzdGFydC1yZXF1aXJlZC1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3Jlc3RhcnQgcmVxdWlyZWQnLCBcIlJlc3RhcnQgUmVxdWlyZWRcIikpKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBlbGVtZW50LCByZWFzb24pKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblJ1bnRpbWVTdGF0dXNXaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uVmlld1N0YXRlOiBJRXh0ZW5zaW9uc1ZpZXdTdGF0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zU3RhdHVzKGV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uICYmIGV4dGVuc2lvbnMuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IGUudmFsdWUgfSwgdGhpcy5leHRlbnNpb24hLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWNjZXNzRGF0YShlID0+IHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbiAmJiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBlLmV4dGVuc2lvbikpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uVmlld1N0YXRlLmZpbHRlcnMuZmVhdHVyZUlkICYmIHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQpIHtcblx0XHRcdGNvbnN0IGFjY2Vzc0RhdGEgPSB0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UuZ2V0QWxsQWNjZXNzRGF0YUZvckV4dGVuc2lvbihuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcih0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSkuZ2V0KHRoaXMuZXh0ZW5zaW9uVmlld1N0YXRlLmZpbHRlcnMuZmVhdHVyZUlkKTtcblx0XHRcdGNvbnN0IGZlYXR1cmUgPSBSZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5nZXRFeHRlbnNpb25GZWF0dXJlKHRoaXMuZXh0ZW5zaW9uVmlld1N0YXRlLmZpbHRlcnMuZmVhdHVyZUlkKTtcblx0XHRcdGlmIChmZWF0dXJlPy5pY29uICYmIGFjY2Vzc0RhdGEpIHtcblx0XHRcdFx0Y29uc3QgZmVhdHVyZUFjY2Vzc1RpbWVFbGVtZW50ID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCdzcGFuLmFjdGl2YXRpb25UaW1lJykpO1xuXHRcdFx0XHRmZWF0dXJlQWNjZXNzVGltZUVsZW1lbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZmVhdHVyZSBhY2Nlc3MgbGFiZWwnLCBcInswfSByZXFzXCIsIGFjY2Vzc0RhdGEuYWNjZXNzVGltZXMubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3QgaWNvbkVsZW1lbnQgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ3NwYW4nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoZmVhdHVyZS5pY29uKSkpO1xuXHRcdFx0XHRpY29uRWxlbWVudC5zdHlsZS5wYWRkaW5nTGVmdCA9ICc0cHgnO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25SdW50aW1lU3RhdHVzKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRpZiAoZXh0ZW5zaW9uU3RhdHVzPy5hY3RpdmF0aW9uVGltZXMpIHtcblx0XHRcdGNvbnN0IGFjdGl2YXRpb25UaW1lID0gZXh0ZW5zaW9uU3RhdHVzLmFjdGl2YXRpb25UaW1lcy5jb2RlTG9hZGluZ1RpbWUgKyBleHRlbnNpb25TdGF0dXMuYWN0aXZhdGlvblRpbWVzLmFjdGl2YXRlQ2FsbFRpbWU7XG5cdFx0XHRhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ3NwYW4nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoYWN0aXZhdGlvblRpbWVJY29uKSkpO1xuXHRcdFx0Y29uc3QgYWN0aXZhdGlvblRpbWVFbGVtZW50ID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCdzcGFuLmFjdGl2YXRpb25UaW1lJykpO1xuXHRcdFx0YWN0aXZhdGlvblRpbWVFbGVtZW50LnRleHRDb250ZW50ID0gYCR7YWN0aXZhdGlvblRpbWV9bXNgO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCB0eXBlIEV4dGVuc2lvbkhvdmVyT3B0aW9ucyA9IHtcblx0cG9zaXRpb246ICgpID0+IEhvdmVyUG9zaXRpb247XG5cdHJlYWRvbmx5IHRhcmdldDogSFRNTEVsZW1lbnQ7XG59O1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uSG92ZXJXaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaG92ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogRXh0ZW5zaW9uSG92ZXJPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU3RhdHVzQWN0aW9uOiBFeHRlbnNpb25TdGF0dXNBY3Rpb24sXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZTogSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5ob3Zlci52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHRoaXMuaG92ZXIudmFsdWUgPSB0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcih7XG5cdFx0XHRcdGRlbGF5OiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ3dvcmtiZW5jaC5ob3Zlci5kZWxheScpLFxuXHRcdFx0XHRzaG93SG92ZXI6IChvcHRpb25zLCBmb2N1cykgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsQ2xhc3NlczogWydleHRlbnNpb24taG92ZXInXSxcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdGhvdmVyUG9zaXRpb246IHRoaXMub3B0aW9ucy5wb3NpdGlvbigpLFxuXHRcdFx0XHRcdFx0XHRmb3JjZVBvc2l0aW9uOiB0cnVlLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHBlcnNpc3RlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdGhpZGVPbktleURvd246IHRydWUsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgZm9jdXMpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRwbGFjZW1lbnQ6ICdlbGVtZW50J1xuXHRcdFx0fSxcblx0XHRcdFx0dGhpcy5vcHRpb25zLnRhcmdldCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1hcmtkb3duOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBSZWNvbXB1dGUgdGhlIHN0YXR1cyBzbyBhbnkgdGltZS1zZW5zaXRpdmUgY29udGVudCAoZS5nLiB0aGVcblx0XHRcdFx0XHRcdC8vIGRlbGF5ZWQgYXV0by11cGRhdGUgbWVzc2FnZSkgcmVmbGVjdHMgdGhlIGN1cnJlbnQgdGltZSBvbiBlYWNoIGhvdmVyLlxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TdGF0dXNBY3Rpb24ucmVjb21wdXRlU3RhdHVzKCk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHQvLyBJZ25vcmU6IGZhbGwgYmFjayB0byB0aGUgbGFzdCBjb21wdXRlZCBzdGF0dXMuXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRIb3Zlck1hcmtkb3duKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiB1bmRlZmluZWRcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0XHRcdHNob3dIb3ZlckhpbnQ6IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRIb3Zlck1hcmtkb3duKCk6IE1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXG5cdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCoqYCkuYXBwZW5kVGV4dCh0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSkuYXBwZW5kTWFya2Rvd24oYCoqYCk7XG5cdFx0aWYgKHNlbXZlci52YWxpZCh0aGlzLmV4dGVuc2lvbi52ZXJzaW9uKSkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCZuYnNwOzxzcGFuIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjojODA4MDgwMkI7XCI+KiombmJzcDtfdiR7dGhpcy5leHRlbnNpb24udmVyc2lvbn0keyh0aGlzLmV4dGVuc2lvbi5pc1ByZVJlbGVhc2VWZXJzaW9uID8gJyAocHJlLXJlbGVhc2UpJyA6ICcnKX1fKiombmJzcDs8L3NwYW4+YCk7XG5cdFx0fVxuXHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXG5cdFx0bGV0IGFkZFNlcGFyYXRvciA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5wcml2YXRlKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke3ByaXZhdGVFeHRlbnNpb25JY29uLmlkfSkgJHtsb2NhbGl6ZSgncHJpdmF0ZUV4dGVuc2lvbicsIFwiUHJpdmF0ZSBFeHRlbnNpb25cIil9YCk7XG5cdFx0XHRhZGRTZXBhcmF0b3IgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCkge1xuXHRcdFx0Y29uc3QgaW5zdGFsbExhYmVsID0gSW5zdGFsbENvdW50V2lkZ2V0LmdldEluc3RhbGxMYWJlbCh0aGlzLmV4dGVuc2lvbiwgdHJ1ZSk7XG5cdFx0XHRpZiAoaW5zdGFsbExhYmVsKSB7XG5cdFx0XHRcdGlmIChhZGRTZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGAgIHwgIGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAkKCR7aW5zdGFsbENvdW50SWNvbi5pZH0pICR7aW5zdGFsbExhYmVsfWApO1xuXHRcdFx0XHRhZGRTZXBhcmF0b3IgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnJhdGluZykge1xuXHRcdFx0XHRpZiAoYWRkU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgICB8ICBgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByYXRpbmcgPSBNYXRoLnJvdW5kKHRoaXMuZXh0ZW5zaW9uLnJhdGluZyAqIDIpIC8gMjtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCQoJHtzdGFyRnVsbEljb24uaWR9KSBbJHtyYXRpbmd9XSgke3RoaXMuZXh0ZW5zaW9uLnVybH0mc3NyPWZhbHNlI3Jldmlldy1kZXRhaWxzKWApO1xuXHRcdFx0XHRhZGRTZXBhcmF0b3IgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlclNwb25zb3JMaW5rKSB7XG5cdFx0XHRcdGlmIChhZGRTZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGAgIHwgIGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAkKCR7c3BvbnNvckljb24uaWR9KSBbJHtsb2NhbGl6ZSgnc3BvbnNvcicsIFwiU3BvbnNvclwiKX1dKCR7dGhpcy5leHRlbnNpb24ucHVibGlzaGVyU3BvbnNvckxpbmt9KWApO1xuXHRcdFx0XHRhZGRTZXBhcmF0b3IgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYWRkU2VwYXJhdG9yKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZXh0ZW5zaW9uLnJlc291cmNlRXh0ZW5zaW9uPy5sb2NhdGlvbiA/PyAodGhpcy5leHRlbnNpb24ubG9jYWw/LnNvdXJjZSA9PT0gJ3Jlc291cmNlJyA/IHRoaXMuZXh0ZW5zaW9uLmxvY2FsPy5sb2NhdGlvbiA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKGxvY2F0aW9uKSB7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24uaXNXb3Jrc3BhY2VTY29wZWQgJiYgdGhpcy5jb250ZXh0U2VydmljZS5pc0luc2lkZVdvcmtzcGFjZShsb2NhdGlvbikpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ3dvcmtzcGFjZSBleHRlbnNpb24nLCBcIldvcmtzcGFjZSBFeHRlbnNpb25cIikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ2xvY2FsIGV4dGVuc2lvbicsIFwiTG9jYWwgRXh0ZW5zaW9uXCIpKTtcblx0XHRcdH1cblx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5kZXNjcmlwdGlvbikge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dCh0aGlzLmV4dGVuc2lvbi5kZXNjcmlwdGlvbik7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24ucHVibGlzaGVyRG9tYWluPy52ZXJpZmllZCkge1xuXHRcdFx0Y29uc3QgYmdDb2xvciA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihleHRlbnNpb25WZXJpZmllZFB1Ymxpc2hlckljb25Db2xvcik7XG5cdFx0XHRjb25zdCBwdWJsaXNoZXJWZXJpZmllZFRvb2x0aXAgPSBsb2NhbGl6ZSgncHVibGlzaGVyIHZlcmlmaWVkIHRvb2x0aXAnLCBcIlRoaXMgcHVibGlzaGVyIGhhcyB2ZXJpZmllZCBvd25lcnNoaXAgb2YgezB9XCIsIGBbJHtVUkkucGFyc2UodGhpcy5leHRlbnNpb24ucHVibGlzaGVyRG9tYWluLmxpbmspLmF1dGhvcml0eX1dKCR7dGhpcy5leHRlbnNpb24ucHVibGlzaGVyRG9tYWluLmxpbmt9KWApO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYDxzcGFuIHN0eWxlPVwiY29sb3I6JHtiZ0NvbG9yID8gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXgoYmdDb2xvcikgOiAnI2ZmZmZmZid9O1wiPiQoJHt2ZXJpZmllZFB1Ymxpc2hlckljb24uaWR9KTwvc3Bhbj4mbmJzcDske3B1Ymxpc2hlclZlcmlmaWVkVG9vbHRpcH1gKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5vdXRkYXRlZCkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ3VwZGF0ZVJlcXVpcmVkJywgXCJMYXRlc3QgdmVyc2lvbjpcIikpO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCZuYnNwOzxzcGFuIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjojODA4MDgwMkI7XCI+KiombmJzcDtfdiR7dGhpcy5leHRlbnNpb24ubGF0ZXN0VmVyc2lvbn1fKiombmJzcDs8L3NwYW4+YCk7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmVSZWxlYXNlTWVzc2FnZSA9IEV4dGVuc2lvbkhvdmVyV2lkZ2V0LmdldFByZVJlbGVhc2VNZXNzYWdlKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBleHRlbnNpb25SdW50aW1lU3RhdHVzID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25SdW50aW1lU3RhdHVzKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBleHRlbnNpb25GZWF0dXJlc0FjY2Vzc0RhdGEgPSB0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UuZ2V0QWxsQWNjZXNzRGF0YUZvckV4dGVuc2lvbihuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcih0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzID0gdGhpcy5leHRlbnNpb25TdGF0dXNBY3Rpb24uc3RhdHVzO1xuXHRcdGNvbnN0IHJ1bnRpbWVTdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uLnJ1bnRpbWVTdGF0ZTtcblx0XHRjb25zdCByZWNvbW1lbmRhdGlvbk1lc3NhZ2UgPSB0aGlzLmdldFJlY29tbWVuZGF0aW9uTWVzc2FnZSh0aGlzLmV4dGVuc2lvbik7XG5cblx0XHRpZiAoZXh0ZW5zaW9uUnVudGltZVN0YXR1cyB8fCBleHRlbnNpb25GZWF0dXJlc0FjY2Vzc0RhdGEuc2l6ZSB8fCBleHRlbnNpb25TdGF0dXMubGVuZ3RoIHx8IHJ1bnRpbWVTdGF0ZSB8fCByZWNvbW1lbmRhdGlvbk1lc3NhZ2UgfHwgcHJlUmVsZWFzZU1lc3NhZ2UpIHtcblxuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYC0tLWApO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cblx0XHRcdGlmIChleHRlbnNpb25SdW50aW1lU3RhdHVzKSB7XG5cdFx0XHRcdGlmIChleHRlbnNpb25SdW50aW1lU3RhdHVzLmFjdGl2YXRpb25UaW1lcykge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2YXRpb25UaW1lID0gZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5hY3RpdmF0aW9uVGltZXMuY29kZUxvYWRpbmdUaW1lICsgZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5hY3RpdmF0aW9uVGltZXMuYWN0aXZhdGVDYWxsVGltZTtcblx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJHtsb2NhbGl6ZSgnYWN0aXZhdGlvbicsIFwiQWN0aXZhdGlvbiB0aW1lXCIpfSR7ZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5hY3RpdmF0aW9uVGltZXMuYWN0aXZhdGlvblJlYXNvbi5zdGFydHVwID8gYCAoJHtsb2NhbGl6ZSgnc3RhcnR1cCcsIFwiU3RhcnR1cFwiKX0pYCA6ICcnfTogXFxgJHthY3RpdmF0aW9uVGltZX1tc1xcYGApO1xuXHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25SdW50aW1lU3RhdHVzLnJ1bnRpbWVFcnJvcnMubGVuZ3RoIHx8IGV4dGVuc2lvblJ1bnRpbWVTdGF0dXMubWVzc2FnZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgaGFzRXJyb3JzID0gZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5ydW50aW1lRXJyb3JzLmxlbmd0aCB8fCBleHRlbnNpb25SdW50aW1lU3RhdHVzLm1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLnR5cGUgPT09IFNldmVyaXR5LkVycm9yKTtcblx0XHRcdFx0XHRjb25zdCBoYXNXYXJuaW5ncyA9IGV4dGVuc2lvblJ1bnRpbWVTdGF0dXMubWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UudHlwZSA9PT0gU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3JzTGluayA9IGV4dGVuc2lvblJ1bnRpbWVTdGF0dXMucnVudGltZUVycm9ycy5sZW5ndGggPyBgWyR7ZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5ydW50aW1lRXJyb3JzLmxlbmd0aCA9PT0gMSA/IGxvY2FsaXplKCd1bmNhdWdodCBlcnJvcicsICcxIHVuY2F1Z2h0IGVycm9yJykgOiBsb2NhbGl6ZSgndW5jYXVnaHQgZXJyb3JzJywgJ3swfSB1bmNhdWdodCBlcnJvcnMnLCBleHRlbnNpb25SdW50aW1lU3RhdHVzLnJ1bnRpbWVFcnJvcnMubGVuZ3RoKX1dKCR7Y3JlYXRlQ29tbWFuZFVyaSgnZXh0ZW5zaW9uLm9wZW4nLCB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBFeHRlbnNpb25FZGl0b3JUYWIuRmVhdHVyZXMpfSlgIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2VMaW5rID0gZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5tZXNzYWdlcy5sZW5ndGggPyBgWyR7ZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5tZXNzYWdlcy5sZW5ndGggPT09IDEgPyBsb2NhbGl6ZSgnbWVzc2FnZScsICcxIG1lc3NhZ2UnKSA6IGxvY2FsaXplKCdtZXNzYWdlcycsICd7MH0gbWVzc2FnZXMnLCBleHRlbnNpb25SdW50aW1lU3RhdHVzLm1lc3NhZ2VzLmxlbmd0aCl9XSgke2NyZWF0ZUNvbW1hbmRVcmkoJ2V4dGVuc2lvbi5vcGVuJywgdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgRXh0ZW5zaW9uRWRpdG9yVGFiLkZlYXR1cmVzKX0pYCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke2hhc0Vycm9ycyA/IGVycm9ySWNvbi5pZCA6IGhhc1dhcm5pbmdzID8gd2FybmluZ0ljb24uaWQgOiBpbmZvSWNvbi5pZH0pIFRoaXMgZXh0ZW5zaW9uIGhhcyByZXBvcnRlZCBgKTtcblx0XHRcdFx0XHRpZiAoZXJyb3JzTGluayAmJiBtZXNzYWdlTGluaykge1xuXHRcdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCR7ZXJyb3JzTGlua30gYW5kICR7bWVzc2FnZUxpbmt9YCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke2Vycm9yc0xpbmsgfHwgbWVzc2FnZUxpbmt9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChleHRlbnNpb25GZWF0dXJlc0FjY2Vzc0RhdGEuc2l6ZSkge1xuXHRcdFx0XHRjb25zdCByZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtmZWF0dXJlSWQsIGFjY2Vzc0RhdGFdIG9mIGV4dGVuc2lvbkZlYXR1cmVzQWNjZXNzRGF0YSkge1xuXHRcdFx0XHRcdGlmIChhY2Nlc3NEYXRhPy5hY2Nlc3NUaW1lcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGZlYXR1cmUgPSByZWdpc3RyeS5nZXRFeHRlbnNpb25GZWF0dXJlKGZlYXR1cmVJZCk7XG5cdFx0XHRcdFx0XHRpZiAoZmVhdHVyZSkge1xuXHRcdFx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnZmVhdHVyZSB1c2FnZSBsYWJlbCcsIFwiezB9IHVzYWdlXCIsIGZlYXR1cmUubGFiZWwpKTtcblx0XHRcdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYDogWyR7bG9jYWxpemUoJ3RvdGFsJywgXCJ7MH0gezF9IHJlcXVlc3RzIGluIGxhc3QgMzAgZGF5c1wiLCBhY2Nlc3NEYXRhLmFjY2Vzc1RpbWVzLmxlbmd0aCwgZmVhdHVyZS5hY2Nlc3NEYXRhTGFiZWwgPz8gZmVhdHVyZS5sYWJlbCl9XSgke2NyZWF0ZUNvbW1hbmRVcmkoJ2V4dGVuc2lvbi5vcGVuJywgdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgRXh0ZW5zaW9uRWRpdG9yVGFiLkZlYXR1cmVzKX0pYCk7XG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHN0YXR1cyBvZiBleHRlbnNpb25TdGF0dXMpIHtcblx0XHRcdFx0aWYgKHN0YXR1cy5pY29uKSB7XG5cdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCQoJHtzdGF0dXMuaWNvbi5pZH0pJm5ic3A7YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oc3RhdHVzLm1lc3NhZ2UudmFsdWUpO1xuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJ1bnRpbWVTdGF0ZSkge1xuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke2luZm9JY29uLmlkfSkmbmJzcDtgKTtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCR7cnVudGltZVN0YXRlLnJlYXNvbn1gKTtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcmVSZWxlYXNlTWVzc2FnZSkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25QcmVSZWxlYXNlSWNvbiA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihleHRlbnNpb25QcmVSZWxlYXNlSWNvbkNvbG9yKTtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYDxzcGFuIHN0eWxlPVwiY29sb3I6JHtleHRlbnNpb25QcmVSZWxlYXNlSWNvbiA/IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4KGV4dGVuc2lvblByZVJlbGVhc2VJY29uKSA6ICcjZmZmZmZmJ307XCI+JCgke3ByZVJlbGVhc2VJY29uLmlkfSk8L3NwYW4+Jm5ic3A7JHtwcmVSZWxlYXNlTWVzc2FnZX1gKTtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZWNvbW1lbmRhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24ocmVjb21tZW5kYXRpb25NZXNzYWdlKTtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1hcmtkb3duO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZWNvbW1lbmRhdGlvbk1lc3NhZ2UoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24uZGVwcmVjYXRpb25JbmZvKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZWNvbW1lbmRhdGlvbiA9IHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRBbGxSZWNvbW1lbmRhdGlvbnNXaXRoUmVhc29uKClbZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKV07XG5cdFx0aWYgKCFyZWNvbW1lbmRhdGlvbj8ucmVhc29uVGV4dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYmdDb2xvciA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihleHRlbnNpb25CdXR0b25Qcm9taW5lbnRCYWNrZ3JvdW5kKTtcblx0XHRyZXR1cm4gYDxzcGFuIHN0eWxlPVwiY29sb3I6JHtiZ0NvbG9yID8gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXgoYmdDb2xvcikgOiAnI2ZmZmZmZid9O1wiPiQoJHtzdGFyRW1wdHlJY29uLmlkfSk8L3NwYW4+Jm5ic3A7JHtyZWNvbW1lbmRhdGlvbi5yZWFzb25UZXh0fWA7XG5cdH1cblxuXHRzdGF0aWMgZ2V0UHJlUmVsZWFzZU1lc3NhZ2UoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWV4dGVuc2lvbi5oYXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5pc0J1aWx0aW4pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24uaXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5wcmVSZWxlYXNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcmVSZWxlYXNlVmVyc2lvbkxpbmsgPSBgWyR7bG9jYWxpemUoJ1Nob3cgcHJlcmVsZWFzZSB2ZXJzaW9uJywgXCJQcmUtUmVsZWFzZSB2ZXJzaW9uXCIpfV0oJHtjcmVhdGVDb21tYW5kVXJpKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd1ByZVJlbGVhc2VWZXJzaW9uJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpfSlgO1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnaGFzIHByZXJlbGVhc2UnLCBcIlRoaXMgZXh0ZW5zaW9uIGhhcyBhIHswfSBhdmFpbGFibGVcIiwgcHJlUmVsZWFzZVZlcnNpb25MaW5rKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25TdGF0dXNXaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW5kZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW5kZXI6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRSZW5kZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU3RhdHVzQWN0aW9uOiBFeHRlbnNpb25TdGF0dXNBY3Rpb24sXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25TdGF0dXNBY3Rpb24ub25EaWRDaGFuZ2VTdGF0dXMoKCkgPT4gdGhpcy5yZW5kZXIoKSkpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHJlc2V0KHRoaXMuY29udGFpbmVyKTtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMudmFsdWUgPSBkaXNwb3NhYmxlcztcblx0XHRjb25zdCBleHRlbnNpb25TdGF0dXMgPSB0aGlzLmV4dGVuc2lvblN0YXR1c0FjdGlvbi5zdGF0dXM7XG5cdFx0aWYgKGV4dGVuc2lvblN0YXR1cy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGV4dGVuc2lvblN0YXR1cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBzdGF0dXMgPSBleHRlbnNpb25TdGF0dXNbaV07XG5cdFx0XHRcdGlmIChzdGF0dXMuaWNvbikge1xuXHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAkKCR7c3RhdHVzLmljb24uaWR9KSZuYnNwO2ApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKHN0YXR1cy5tZXNzYWdlLnZhbHVlKTtcblx0XHRcdFx0aWYgKGkgPCBleHRlbnNpb25TdGF0dXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtYXJrZG93bikpO1xuXHRcdFx0YXBwZW5kKHRoaXMuY29udGFpbmVyLCByZW5kZXJlZC5lbGVtZW50KTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRSZW5kZXIuZmlyZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbldpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW5kZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW5kZXI6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRSZW5kZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZTogSUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVjb21tZW5kYXRpb25zKCgpID0+IHRoaXMucmVuZGVyKCkpKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHRyZXNldCh0aGlzLmNvbnRhaW5lcik7XG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb25TdGF0dXMgPSB0aGlzLmdldFJlY29tbWVuZGF0aW9uU3RhdHVzKCk7XG5cdFx0aWYgKHJlY29tbWVuZGF0aW9uU3RhdHVzKSB7XG5cdFx0XHRpZiAocmVjb21tZW5kYXRpb25TdGF0dXMuaWNvbikge1xuXHRcdFx0XHRhcHBlbmQodGhpcy5jb250YWluZXIsICQoYGRpdiR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IocmVjb21tZW5kYXRpb25TdGF0dXMuaWNvbil9YCkpO1xuXHRcdFx0fVxuXHRcdFx0YXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKGBkaXYucmVjb21tZW5kYXRpb24tdGV4dGAsIHVuZGVmaW5lZCwgcmVjb21tZW5kYXRpb25TdGF0dXMubWVzc2FnZSkpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZFJlbmRlci5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFJlY29tbWVuZGF0aW9uU3RhdHVzKCk6IHsgaWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkOyBtZXNzYWdlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvblxuXHRcdFx0fHwgdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvXG5cdFx0XHR8fCB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBleHRSZWNvbW1lbmRhdGlvbnMgPSB0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0QWxsUmVjb21tZW5kYXRpb25zV2l0aFJlYXNvbigpO1xuXHRcdGlmIChleHRSZWNvbW1lbmRhdGlvbnNbdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpXSkge1xuXHRcdFx0Y29uc3QgcmVhc29uVGV4dCA9IGV4dFJlY29tbWVuZGF0aW9uc1t0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCldLnJlYXNvblRleHQ7XG5cdFx0XHRpZiAocmVhc29uVGV4dCkge1xuXHRcdFx0XHRyZXR1cm4geyBpY29uOiBzdGFyRW1wdHlJY29uLCBtZXNzYWdlOiByZWFzb25UZXh0IH07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aGlzLmV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdsb2JhbElnbm9yZWRSZWNvbW1lbmRhdGlvbnMuaW5kZXhPZih0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuIHsgaWNvbjogdW5kZWZpbmVkLCBtZXNzYWdlOiBsb2NhbGl6ZSgncmVjb21tZW5kYXRpb25IYXNCZWVuSWdub3JlZCcsIFwiWW91IGhhdmUgY2hvc2VuIG5vdCB0byByZWNlaXZlIHJlY29tbWVuZGF0aW9ucyBmb3IgdGhpcyBleHRlbnNpb24uXCIpIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGV4dGVuc2lvblJhdGluZ0ljb25Db2xvciA9IHJlZ2lzdGVyQ29sb3IoJ2V4dGVuc2lvbkljb24uc3RhckZvcmVncm91bmQnLCB7IGxpZ2h0OiAnI0RGNjEwMCcsIGRhcms6ICcjRkY4RTAwJywgaGNEYXJrOiAnI0ZGOEUwMCcsIGhjTGlnaHQ6IHRleHRMaW5rRm9yZWdyb3VuZCB9LCBsb2NhbGl6ZSgnZXh0ZW5zaW9uSWNvblN0YXJGb3JlZ3JvdW5kJywgXCJUaGUgaWNvbiBjb2xvciBmb3IgZXh0ZW5zaW9uIHJhdGluZ3MuXCIpLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgZXh0ZW5zaW9uUHJlUmVsZWFzZUljb25Db2xvciA9IHJlZ2lzdGVyQ29sb3IoJ2V4dGVuc2lvbkljb24ucHJlUmVsZWFzZUZvcmVncm91bmQnLCB7IGRhcms6ICcjMWQ5MjcxJywgbGlnaHQ6ICcjMWQ5MjcxJywgaGNEYXJrOiAnIzFkOTI3MScsIGhjTGlnaHQ6IHRleHRMaW5rRm9yZWdyb3VuZCB9LCBsb2NhbGl6ZSgnZXh0ZW5zaW9uUHJlUmVsZWFzZUZvcmVncm91bmQnLCBcIlRoZSBpY29uIGNvbG9yIGZvciBwcmUtcmVsZWFzZSBleHRlbnNpb24uXCIpLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgZXh0ZW5zaW9uU3BvbnNvckljb25Db2xvciA9IHJlZ2lzdGVyQ29sb3IoJ2V4dGVuc2lvbkljb24uc3BvbnNvckZvcmVncm91bmQnLCB7IGxpZ2h0OiAnI0I1MUU3OCcsIGRhcms6ICcjRDc1OEIzJywgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiAnI0I1MUU3OCcgfSwgbG9jYWxpemUoJ2V4dGVuc2lvbkljb24uc3BvbnNvckZvcmVncm91bmQnLCBcIlRoZSBpY29uIGNvbG9yIGZvciBleHRlbnNpb24gc3BvbnNvci5cIiksIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBleHRlbnNpb25Qcml2YXRlQmFkZ2VCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZXh0ZW5zaW9uSWNvbi5wcml2YXRlRm9yZWdyb3VuZCcsIHsgZGFyazogJyNmZmZmZmY2MCcsIGxpZ2h0OiAnIzAwMDAwMDYwJywgaGNEYXJrOiAnI2ZmZmZmZjYwJywgaGNMaWdodDogJyMwMDAwMDA2MCcgfSwgbG9jYWxpemUoJ2V4dGVuc2lvbkljb24ucHJpdmF0ZScsIFwiVGhlIGljb24gY29sb3IgZm9yIHByaXZhdGUgZXh0ZW5zaW9ucy5cIikpO1xuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXHRjb25zdCBleHRlbnNpb25SYXRpbmdJY29uID0gdGhlbWUuZ2V0Q29sb3IoZXh0ZW5zaW9uUmF0aW5nSWNvbkNvbG9yKTtcblx0aWYgKGV4dGVuc2lvblJhdGluZ0ljb24pIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLmV4dGVuc2lvbi1yYXRpbmdzIC5jb2RpY29uLWV4dGVuc2lvbnMtc3Rhci1mdWxsLCAuZXh0ZW5zaW9uLXJhdGluZ3MgLmNvZGljb24tZXh0ZW5zaW9ucy1zdGFyLWhhbGYgeyBjb2xvcjogJHtleHRlbnNpb25SYXRpbmdJY29ufTsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWhvdmVyLmV4dGVuc2lvbi1ob3ZlciAubWFya2Rvd24taG92ZXIgLmhvdmVyLWNvbnRlbnRzICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3Ioc3RhckZ1bGxJY29uKX0geyBjb2xvcjogJHtleHRlbnNpb25SYXRpbmdJY29ufTsgfWApO1xuXHR9XG5cblx0Y29uc3QgZXh0ZW5zaW9uVmVyaWZpZWRQdWJsaXNoZXJJY29uID0gdGhlbWUuZ2V0Q29sb3IoZXh0ZW5zaW9uVmVyaWZpZWRQdWJsaXNoZXJJY29uQ29sb3IpO1xuXHRpZiAoZXh0ZW5zaW9uVmVyaWZpZWRQdWJsaXNoZXJJY29uKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IodmVyaWZpZWRQdWJsaXNoZXJJY29uKX0geyBjb2xvcjogJHtleHRlbnNpb25WZXJpZmllZFB1Ymxpc2hlckljb259OyB9YCk7XG5cdH1cblxuXHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1ob3Zlci5leHRlbnNpb24taG92ZXIgLm1hcmtkb3duLWhvdmVyIC5ob3Zlci1jb250ZW50cyAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHNwb25zb3JJY29uKX0geyBjb2xvcjogdmFyKC0tdnNjb2RlLWV4dGVuc2lvbkljb24tc3BvbnNvckZvcmVncm91bmQpOyB9YCk7XG5cdGNvbGxlY3Rvci5hZGRSdWxlKGAuZXh0ZW5zaW9uLWVkaXRvciA+IC5oZWFkZXIgPiAuZGV0YWlscyA+IC5zdWJ0aXRsZSAuc3BvbnNvciAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHNwb25zb3JJY29uKX0geyBjb2xvcjogdmFyKC0tdnNjb2RlLWV4dGVuc2lvbkljb24tc3BvbnNvckZvcmVncm91bmQpOyB9YCk7XG5cblx0Y29uc3QgcHJpdmF0ZUJhZGdlQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKGV4dGVuc2lvblByaXZhdGVCYWRnZUJhY2tncm91bmQpO1xuXHRpZiAocHJpdmF0ZUJhZGdlQmFja2dyb3VuZCkge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAuZXh0ZW5zaW9uLXByaXZhdGUtYmFkZ2UgeyBjb2xvcjogJHtwcml2YXRlQmFkZ2VCYWNrZ3JvdW5kfTsgfWApO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksWUFBWTtBQUN4QixTQUFTLFlBQVksY0FBYyxpQkFBaUIseUJBQXNDO0FBQzFGLFNBQXFCLDZCQUFrRCxnQkFBZ0IsMEJBQWdEO0FBQ3ZJLFNBQVMsUUFBUSxHQUFHLE9BQU8sdUJBQXVCLFdBQVcsb0JBQW9CO0FBQ2pGLFlBQVksY0FBYztBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLHlDQUF5Qyx3Q0FBd0M7QUFDMUYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQ0FBaUU7QUFDMUUsU0FBUyxlQUFlLGtDQUFrQztBQUMxRCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDRCQUE0QixrQ0FBa0M7QUFDdkUsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxvQkFBb0IsV0FBVyxVQUFVLGtCQUFrQixnQkFBZ0Isc0JBQXNCLFlBQVksWUFBWSxxQkFBcUIsYUFBYSxlQUFlLGNBQWMsY0FBYyxpQkFBaUIsbUJBQW1CO0FBQ25QLFNBQVMsZUFBZSwwQkFBMEI7QUFDbEQsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxrQkFBa0Isc0JBQXNCO0FBQ2pELFNBQVMsV0FBVztBQUNwQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxPQUFPLGNBQWM7QUFDckIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9C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
