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
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { isCancellationError, getErrorMessage, CancellationError } from "../../../../base/common/errors.js";
import { PagedModel, DelayedPagedModel } from "../../../../base/common/paging.js";
import { SortOrder, SortBy as GallerySortBy, ExtensionGalleryErrorCode, ExtensionGalleryError } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IExtensionManagementServerService, EnablementState, IWorkbenchExtensionManagementService, IWorkbenchExtensionEnablementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { areSameExtensions, getExtensionDependencies } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { append, $ } from "../../../../base/browser/dom.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ExtensionResultsListFocused, ExtensionState, IExtensionsWorkbenchService } from "../common/extensions.js";
import { Query } from "../common/extensionQuery.js";
import { IExtensionService, toExtension } from "../../../services/extensions/common/extensions.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { ViewPane, ViewPaneShowActions } from "../../../browser/parts/views/viewPane.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { coalesce, distinct, range } from "../../../../base/common/arrays.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { ExtensionIdentifier, ExtensionIdentifierMap, isLanguagePackExtension } from "../../../../platform/extensions/common/extensions.js";
import { createCancelablePromise, ThrottledDelayer } from "../../../../base/common/async.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IExtensionManifestPropertiesService } from "../../../services/extensions/common/extensionManifestPropertiesService.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isOfflineError } from "../../../../base/parts/request/common/request.js";
import { defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions, IExtensionFeaturesManagementService } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { isString } from "../../../../base/common/types.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ExtensionsList } from "./extensionsViewer.js";
const NONE_CATEGORY = "none";
class ExtensionsViewState extends Disposable {
  constructor() {
    super(...arguments);
    this._onFocus = this._register(new Emitter());
    this.onFocus = this._onFocus.event;
    this._onBlur = this._register(new Emitter());
    this.onBlur = this._onBlur.event;
    this.currentlyFocusedItems = [];
    this.filters = {};
  }
  onFocusChange(extensions) {
    this.currentlyFocusedItems.forEach((extension) => this._onBlur.fire(extension));
    this.currentlyFocusedItems = extensions;
    this.currentlyFocusedItems.forEach((extension) => this._onFocus.fire(extension));
  }
}
var LocalSortBy = /* @__PURE__ */ ((LocalSortBy2) => {
  LocalSortBy2["UpdateDate"] = "UpdateDate";
  return LocalSortBy2;
})(LocalSortBy || {});
function isLocalSortBy(value) {
  switch (value) {
    case "UpdateDate" /* UpdateDate */:
      return true;
  }
}
class AbstractExtensionsListView extends ViewPane {
}
let ExtensionsListView = class extends AbstractExtensionsListView {
  constructor(options, viewletViewOptions, notificationService, keybindingService, contextMenuService, instantiationService, themeService, extensionService, extensionsWorkbenchService, extensionRecommendationsService, telemetryService, hoverService, configurationService, contextService, extensionManagementServerService, extensionManifestPropertiesService, extensionManagementService, workspaceService, productService, contextKeyService, viewDescriptorService, openerService, storageService, workspaceTrustManagementService, extensionEnablementService, extensionFeaturesManagementService, uriIdentityService, logService) {
    super({
      ...viewletViewOptions,
      showActions: ViewPaneShowActions.Always,
      maximumBodySize: options.flexibleHeight ? storageService.getNumber(`${viewletViewOptions.id}.size`, StorageScope.PROFILE, 0) ? void 0 : 0 : void 0
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.options = options;
    this.notificationService = notificationService;
    this.extensionService = extensionService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionRecommendationsService = extensionRecommendationsService;
    this.telemetryService = telemetryService;
    this.contextService = contextService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.extensionManagementService = extensionManagementService;
    this.workspaceService = workspaceService;
    this.productService = productService;
    this.storageService = storageService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.list = null;
    this.queryRequest = null;
    this.contextMenuActionRunner = this._register(new ActionRunner());
    if (this.options.onDidChangeTitle) {
      this._register(this.options.onDidChangeTitle((title) => this.updateTitle(title)));
    }
    this._register(this.contextMenuActionRunner.onDidRun(({ error }) => error && this.notificationService.error(error)));
    this.registerActions();
  }
  registerActions() {
  }
  renderHeader(container) {
    container.classList.add("extension-view-header");
    super.renderHeader(container);
    if (!this.options.hideBadge) {
      this.badge = this._register(new CountBadge(append(container, $(".count-badge-wrapper")), {}, defaultCountBadgeStyles));
    }
  }
  renderBody(container) {
    super.renderBody(container);
    const messageContainer = append(container, $(".message-container"));
    const messageSeverityIcon = append(messageContainer, $(""));
    const messageBox = append(messageContainer, $(".message"));
    const extensionsList = append(container, $(".extensions-list"));
    this.extensionsViewState = this._register(new ExtensionsViewState());
    this.list = this._register(this.instantiationService.createInstance(ExtensionsList, extensionsList, this.id, {}, this.extensionsViewState)).list;
    ExtensionResultsListFocused.bindTo(this.list.contextKeyService);
    this._register(this.list.onDidChangeFocus((e) => this.extensionsViewState?.onFocusChange(coalesce(e.elements)), this));
    this.bodyTemplate = {
      extensionsList,
      messageBox,
      messageContainer,
      messageSeverityIcon
    };
    if (this.queryResult) {
      this.setModel(this.queryResult.model);
    }
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    if (this.bodyTemplate) {
      this.bodyTemplate.extensionsList.style.height = height + "px";
    }
    this.list?.layout(height, width);
  }
  async show(query, refresh) {
    if (this.queryRequest) {
      if (!refresh && this.queryRequest.query === query) {
        return this.queryRequest.request;
      }
      this.queryRequest.request.cancel();
      this.queryRequest = null;
    }
    if (this.queryResult) {
      this.queryResult.disposables.dispose();
      this.queryResult = void 0;
      if (this.extensionsViewState) {
        this.extensionsViewState.filters = {};
      }
    }
    const parsedQuery = Query.parse(query);
    const options = {
      sortOrder: SortOrder.Default
    };
    switch (parsedQuery.sortBy) {
      case "installs":
        options.sortBy = GallerySortBy.InstallCount;
        break;
      case "rating":
        options.sortBy = GallerySortBy.WeightedRating;
        break;
      case "name":
        options.sortBy = GallerySortBy.Title;
        break;
      case "publishedDate":
        options.sortBy = GallerySortBy.PublishedDate;
        break;
      case "updateDate":
        options.sortBy = "UpdateDate" /* UpdateDate */;
        break;
    }
    const request = createCancelablePromise(async (token) => {
      try {
        this.queryResult = await this.query(parsedQuery, options, token);
        const model = this.queryResult.model;
        this.setModel(model, this.queryResult.message);
        if (this.queryResult.onDidChangeModel) {
          this.queryResult.disposables.add(this.queryResult.onDidChangeModel((model2) => {
            if (this.queryResult) {
              this.queryResult.model = model2;
              this.updateModel(model2);
            }
          }));
        }
        return model;
      } catch (e) {
        const model = new PagedModel([]);
        if (!isCancellationError(e)) {
          this.logService.error(e);
          this.setModel(model, this.getMessage(e));
        }
        return this.list ? this.list.model : model;
      }
    });
    request.finally(() => this.queryRequest = null);
    this.queryRequest = { query, request };
    return request;
  }
  count() {
    return this.queryResult?.model.length ?? 0;
  }
  showEmptyModel() {
    const emptyModel = new PagedModel([]);
    this.setModel(emptyModel);
    return Promise.resolve(emptyModel);
  }
  async query(query, options, token) {
    const idRegex = /@id:(([a-z0-9A-Z][a-z0-9\-A-Z]*)\.([a-z0-9A-Z][a-z0-9\-A-Z]*))/g;
    const ids = [];
    let idMatch;
    while ((idMatch = idRegex.exec(query.value)) !== null) {
      const name = idMatch[1];
      ids.push(name);
    }
    if (ids.length) {
      const model = await this.queryByIds(ids, options, token);
      return { model, disposables: new DisposableStore() };
    }
    if (ExtensionsListView.isLocalExtensionsQuery(query.value, query.sortBy)) {
      return this.queryLocal(query, options);
    }
    if (ExtensionsListView.isSearchPopularQuery(query.value)) {
      query.value = query.value.replace("@popular", "");
      options.sortBy = !options.sortBy ? GallerySortBy.InstallCount : options.sortBy;
    } else if (ExtensionsListView.isSearchRecentlyPublishedQuery(query.value)) {
      query.value = query.value.replace("@recentlyPublished", "");
      options.sortBy = !options.sortBy ? GallerySortBy.PublishedDate : options.sortBy;
    }
    const galleryQueryOptions = { ...options, sortBy: isLocalSortBy(options.sortBy) ? void 0 : options.sortBy };
    return this.queryGallery(query, galleryQueryOptions, token);
  }
  async queryByIds(ids, options, token) {
    const idsSet = ids.reduce((result2, id) => {
      result2.add(id.toLowerCase());
      return result2;
    }, /* @__PURE__ */ new Set());
    const result = (await this.extensionsWorkbenchService.queryLocal(this.options.server)).filter((e) => idsSet.has(e.identifier.id.toLowerCase()));
    const galleryIds = result.length ? ids.filter((id) => result.every((r) => !areSameExtensions(r.identifier, { id }))) : ids;
    if (galleryIds.length) {
      const galleryResult = await this.extensionsWorkbenchService.getExtensions(galleryIds.map((id) => ({ id })), { source: "queryById" }, token);
      result.push(...galleryResult);
    }
    return new PagedModel(result);
  }
  async queryLocal(query, options) {
    const local = await this.extensionsWorkbenchService.queryLocal(this.options.server);
    let { extensions, canIncludeInstalledExtensions, description } = await this.filterLocal(local, this.extensionService.extensions, query, options);
    const disposables = new DisposableStore();
    const onDidChangeModel = disposables.add(new Emitter());
    if (canIncludeInstalledExtensions) {
      let isDisposed = false;
      disposables.add(toDisposable(() => isDisposed = true));
      disposables.add(Event.debounce(Event.any(
        Event.filter(this.extensionsWorkbenchService.onChange, (e) => e?.state === ExtensionState.Installed),
        this.extensionService.onDidChangeExtensions
      ), () => void 0)(async () => {
        const local2 = this.options.server ? this.extensionsWorkbenchService.installed.filter((e) => e.server === this.options.server) : this.extensionsWorkbenchService.local;
        const { extensions: newExtensions } = await this.filterLocal(local2, this.extensionService.extensions, query, options);
        if (!isDisposed) {
          const mergedExtensions = this.mergeAddedExtensions(extensions, newExtensions);
          if (mergedExtensions) {
            extensions = mergedExtensions;
            onDidChangeModel.fire(new PagedModel(extensions));
          }
        }
      }));
    }
    return {
      model: new PagedModel(extensions),
      message: description ? { text: description, severity: Severity.Info } : void 0,
      onDidChangeModel: onDidChangeModel.event,
      disposables
    };
  }
  async filterLocal(local, runningExtensions, query, options) {
    const value = query.value;
    let extensions = [];
    let description;
    const includeBuiltin = /@builtin/i.test(value);
    const canIncludeInstalledExtensions = !includeBuiltin;
    if (/@installed/i.test(value)) {
      extensions = this.filterInstalledExtensions(local, runningExtensions, query, options);
    } else if (/@outdated/i.test(value)) {
      extensions = this.filterOutdatedExtensions(local, query, options);
    } else if (/@disabled/i.test(value)) {
      extensions = this.filterDisabledExtensions(local, runningExtensions, query, options, includeBuiltin);
    } else if (/@enabled/i.test(value)) {
      extensions = this.filterEnabledExtensions(local, runningExtensions, query, options, includeBuiltin);
    } else if (/@workspaceUnsupported/i.test(value)) {
      extensions = this.filterWorkspaceUnsupportedExtensions(local, query, options);
    } else if (/@deprecated/i.test(query.value)) {
      extensions = await this.filterDeprecatedExtensions(local, query, options);
    } else if (/@recentlyUpdated/i.test(query.value)) {
      extensions = this.filterRecentlyUpdatedExtensions(local, query, options);
    } else if (/@restartrequired/i.test(query.value)) {
      extensions = this.filterRestartRequiredExtensions(local, query, options);
    } else if (/@contribute:/i.test(query.value)) {
      extensions = this.filterExtensionsByFeature(local, query);
    } else if (includeBuiltin) {
      extensions = this.filterBuiltinExtensions(local, query, options);
    }
    return { extensions, canIncludeInstalledExtensions, description };
  }
  filterBuiltinExtensions(local, query, options) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    value = value.replaceAll(/@builtin/gi, "").replaceAll(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const result = local.filter((e) => e.isBuiltin && (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories));
    return this.sortExtensions(result, options);
  }
  filterExtensionByCategory(e, includedCategories, excludedCategories) {
    if (!includedCategories.length && !excludedCategories.length) {
      return true;
    }
    if (e.categories.length) {
      if (excludedCategories.length && e.categories.some((category) => excludedCategories.includes(category.toLowerCase()))) {
        return false;
      }
      return e.categories.some((category) => includedCategories.includes(category.toLowerCase()));
    } else {
      return includedCategories.includes(NONE_CATEGORY);
    }
  }
  parseCategories(value) {
    const includedCategories = [];
    const excludedCategories = [];
    value = value.replace(/\bcategory:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedCategory, category) => {
      const entry = (category || quotedCategory || "").toLowerCase();
      if (entry.startsWith("-")) {
        if (excludedCategories.indexOf(entry) === -1) {
          excludedCategories.push(entry);
        }
      } else {
        if (includedCategories.indexOf(entry) === -1) {
          includedCategories.push(entry);
        }
      }
      return "";
    });
    return { value, includedCategories, excludedCategories };
  }
  filterInstalledExtensions(local, runningExtensions, query, options) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    value = value.replace(/@installed/g, "").replace(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const matchingText = (e) => (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1 || e.description.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories);
    let result;
    if (options.sortBy !== void 0) {
      result = local.filter((e) => !e.isBuiltin && matchingText(e));
      result = this.sortExtensions(result, options);
    } else {
      result = local.filter((e) => (!e.isBuiltin || e.outdated || e.runtimeState !== void 0) && matchingText(e));
      const runningExtensionsById = runningExtensions.reduce((result2, e) => {
        result2.set(e.identifier.value, e);
        return result2;
      }, new ExtensionIdentifierMap());
      const defaultSort = (e1, e2) => {
        const running1 = runningExtensionsById.get(e1.identifier.id);
        const isE1Running = !!running1 && this.extensionManagementServerService.getExtensionManagementServer(toExtension(running1)) === e1.server;
        const running2 = runningExtensionsById.get(e2.identifier.id);
        const isE2Running = running2 && this.extensionManagementServerService.getExtensionManagementServer(toExtension(running2)) === e2.server;
        if (isE1Running && isE2Running) {
          return e1.displayName.localeCompare(e2.displayName);
        }
        const isE1LanguagePackExtension = e1.local && isLanguagePackExtension(e1.local.manifest);
        const isE2LanguagePackExtension = e2.local && isLanguagePackExtension(e2.local.manifest);
        if (!isE1Running && !isE2Running) {
          if (isE1LanguagePackExtension) {
            return -1;
          }
          if (isE2LanguagePackExtension) {
            return 1;
          }
          return e1.displayName.localeCompare(e2.displayName);
        }
        if (isE1Running && isE2LanguagePackExtension || isE2Running && isE1LanguagePackExtension) {
          return e1.displayName.localeCompare(e2.displayName);
        }
        return isE1Running ? -1 : 1;
      };
      const incompatible = [];
      const deprecated = [];
      const outdated = [];
      const actionRequired = [];
      const noActionRequired = [];
      for (const e of result) {
        if (e.enablementState === EnablementState.DisabledByInvalidExtension) {
          incompatible.push(e);
        } else if (e.deprecationInfo) {
          deprecated.push(e);
        } else if (e.outdated && this.extensionEnablementService.isEnabledEnablementState(e.enablementState)) {
          outdated.push(e);
        } else if (e.runtimeState) {
          actionRequired.push(e);
        } else {
          noActionRequired.push(e);
        }
      }
      result = [
        ...incompatible.sort(defaultSort),
        ...deprecated.sort(defaultSort),
        ...outdated.sort(defaultSort),
        ...actionRequired.sort(defaultSort),
        ...noActionRequired.sort(defaultSort)
      ];
    }
    return result;
  }
  filterOutdatedExtensions(local, query, options) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    value = value.replace(/@outdated/g, "").replace(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const result = local.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName)).filter((extension) => extension.outdated && (extension.name.toLowerCase().indexOf(value) > -1 || extension.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(extension, includedCategories, excludedCategories));
    return this.sortExtensions(result, options);
  }
  filterDisabledExtensions(local, runningExtensions, query, options, includeBuiltin) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    value = value.replaceAll(/@disabled|@builtin/gi, "").replaceAll(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    if (includeBuiltin) {
      local = local.filter((e) => e.isBuiltin);
    }
    const result = local.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName)).filter((e) => runningExtensions.every((r) => !areSameExtensions({ id: r.identifier.value, uuid: r.uuid }, e.identifier)) && (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories));
    return this.sortExtensions(result, options);
  }
  filterEnabledExtensions(local, runningExtensions, query, options, includeBuiltin) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    value = value ? value.replaceAll(/@enabled|@builtin/gi, "").replaceAll(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase() : "";
    local = local.filter((e) => e.isBuiltin === includeBuiltin);
    const result = local.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName)).filter((e) => runningExtensions.some((r) => areSameExtensions({ id: r.identifier.value, uuid: r.uuid }, e.identifier)) && (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories));
    return this.sortExtensions(result, options);
  }
  filterWorkspaceUnsupportedExtensions(local, query, options) {
    const queryString = query.value;
    const match = queryString.match(/^\s*@workspaceUnsupported(?::(untrusted|virtual)(Partial)?)?(?:\s+([^\s]*))?/i);
    if (!match) {
      return [];
    }
    const type = match[1]?.toLowerCase();
    const partial = !!match[2];
    const nameFilter = match[3]?.toLowerCase();
    if (nameFilter) {
      local = local.filter((extension) => extension.name.toLowerCase().indexOf(nameFilter) > -1 || extension.displayName.toLowerCase().indexOf(nameFilter) > -1);
    }
    const hasVirtualSupportType = (extension, supportType) => {
      return extension.local && this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(extension.local.manifest) === supportType;
    };
    const hasRestrictedSupportType = (extension, supportType) => {
      if (!extension.local) {
        return false;
      }
      const enablementState = this.extensionEnablementService.getEnablementState(extension.local);
      if (enablementState !== EnablementState.EnabledGlobally && enablementState !== EnablementState.EnabledWorkspace && enablementState !== EnablementState.DisabledByTrustRequirement && enablementState !== EnablementState.DisabledByExtensionDependency) {
        return false;
      }
      if (this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(extension.local.manifest) === supportType) {
        return true;
      }
      if (supportType === false) {
        const dependencies = getExtensionDependencies(local.map((ext) => ext.local), extension.local);
        return dependencies.some((ext) => this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(ext.manifest) === supportType);
      }
      return false;
    };
    const inVirtualWorkspace = isVirtualWorkspace(this.workspaceService.getWorkspace());
    const inRestrictedWorkspace = !this.workspaceTrustManagementService.isWorkspaceTrusted();
    if (type === "virtual") {
      local = local.filter((extension) => inVirtualWorkspace && hasVirtualSupportType(extension, partial ? "limited" : false) && !(inRestrictedWorkspace && hasRestrictedSupportType(extension, false)));
    } else if (type === "untrusted") {
      local = local.filter((extension) => hasRestrictedSupportType(extension, partial ? "limited" : false) && !(inVirtualWorkspace && hasVirtualSupportType(extension, false)));
    } else {
      local = local.filter((extension) => inVirtualWorkspace && !hasVirtualSupportType(extension, true) || inRestrictedWorkspace && !hasRestrictedSupportType(extension, true));
    }
    return this.sortExtensions(local, options);
  }
  async filterDeprecatedExtensions(local, query, options) {
    const value = query.value.replace(/@deprecated/g, "").replace(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
    const deprecatedExtensionIds = Object.keys(extensionsControlManifest.deprecated);
    local = local.filter((e) => deprecatedExtensionIds.includes(e.identifier.id) && (!value || e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1));
    return this.sortExtensions(local, options);
  }
  filterRecentlyUpdatedExtensions(local, query, options) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    const currentTime = Date.now();
    local = local.filter((e) => !e.isBuiltin && !e.outdated && e.local?.updated && e.local?.installedTimestamp !== void 0 && currentTime - e.local.installedTimestamp < ExtensionsListView.RECENT_UPDATE_DURATION);
    value = value.replace(/@recentlyUpdated/g, "").replace(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const result = local.filter((e) => (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories));
    options.sortBy = options.sortBy ?? "UpdateDate" /* UpdateDate */;
    return this.sortExtensions(result, options);
  }
  filterRestartRequiredExtensions(local, query, options) {
    let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
    local = local.filter((e) => e.runtimeState !== void 0);
    value = value.replace(/@restartrequired/gi, "").replace(/@sort:(\w+)(-\w*)?/g, "").trim().toLowerCase();
    const result = local.filter((e) => (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1) && this.filterExtensionByCategory(e, includedCategories, excludedCategories));
    return this.sortExtensions(result, options);
  }
  filterExtensionsByFeature(local, query) {
    const value = query.value.replace(/@contribute:/g, "").trim();
    const featureId = value.split(" ")[0];
    const feature = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeature(featureId);
    if (!feature) {
      return [];
    }
    if (this.extensionsViewState) {
      this.extensionsViewState.filters.featureId = featureId;
    }
    const renderer = feature.renderer ? this.instantiationService.createInstance(feature.renderer) : void 0;
    try {
      const result = [];
      for (const e of local) {
        if (!e.local) {
          continue;
        }
        const accessData = this.extensionFeaturesManagementService.getAccessData(new ExtensionIdentifier(e.identifier.id), featureId);
        const shouldRender = renderer?.shouldRender(e.local.manifest);
        if (accessData || shouldRender) {
          result.push([e, accessData?.accessTimes.length ?? 0]);
        }
      }
      return result.sort(([, a], [, b]) => b - a).map(([e]) => e);
    } finally {
      renderer?.dispose();
    }
  }
  mergeAddedExtensions(extensions, newExtensions) {
    const oldExtensions = [...extensions];
    const findPreviousExtensionIndex = (from) => {
      let index = -1;
      const previousExtensionInNew = newExtensions[from];
      if (previousExtensionInNew) {
        index = oldExtensions.findIndex((e) => areSameExtensions(e.identifier, previousExtensionInNew.identifier));
        if (index === -1) {
          return findPreviousExtensionIndex(from - 1);
        }
      }
      return index;
    };
    let hasChanged = false;
    for (let index = 0; index < newExtensions.length; index++) {
      const extension = newExtensions[index];
      if (extensions.every((r) => !areSameExtensions(r.identifier, extension.identifier))) {
        hasChanged = true;
        extensions.splice(findPreviousExtensionIndex(index - 1) + 1, 0, extension);
      }
    }
    return hasChanged ? extensions : void 0;
  }
  async queryGallery(query, options, token) {
    const hasUserDefinedSortOrder = options.sortBy !== void 0;
    if (!hasUserDefinedSortOrder && !query.value.trim()) {
      options.sortBy = GallerySortBy.InstallCount;
    }
    if (this.isRecommendationsQuery(query)) {
      const model = await this.queryRecommendations(query, options, token);
      return { model, disposables: new DisposableStore() };
    }
    const text = query.value;
    if (!text) {
      options.source = "viewlet";
      const pager = await this.extensionsWorkbenchService.queryGallery(options, token);
      return { model: new PagedModel(pager), disposables: new DisposableStore() };
    }
    if (/\bext:([^\s]+)\b/g.test(text)) {
      options.text = text;
      options.source = "file-extension-tags";
      const pager = await this.extensionsWorkbenchService.queryGallery(options, token);
      return { model: new PagedModel(pager), disposables: new DisposableStore() };
    }
    options.text = text.substring(0, 350);
    options.source = "searchText";
    if (hasUserDefinedSortOrder || /\b(category|tag):([^\s]+)\b/gi.test(text) || /\bfeatured(\s+|\b|$)/gi.test(text)) {
      const pager = await this.extensionsWorkbenchService.queryGallery(options, token);
      return { model: new PagedModel(pager), disposables: new DisposableStore() };
    }
    try {
      const [pager, preferredExtensions] = await Promise.all([
        this.extensionsWorkbenchService.queryGallery(options, token),
        this.getPreferredExtensions(options.text.toLowerCase(), token).catch(() => [])
      ]);
      const model = preferredExtensions.length ? new PreferredExtensionsPagedModel(preferredExtensions, pager) : new PagedModel(pager);
      return { model, disposables: new DisposableStore() };
    } catch (error) {
      if (isCancellationError(error)) {
        throw error;
      }
      if (!(error instanceof ExtensionGalleryError)) {
        throw error;
      }
      const searchText = options.text.toLowerCase();
      const localExtensions = this.extensionsWorkbenchService.local.filter((e) => !e.isBuiltin && (e.name.toLowerCase().indexOf(searchText) > -1 || e.displayName.toLowerCase().indexOf(searchText) > -1 || e.description.toLowerCase().indexOf(searchText) > -1));
      if (localExtensions.length) {
        const message = this.getMessage(error);
        return { model: new PagedModel(localExtensions), disposables: new DisposableStore(), message: { text: localize("showing local extensions only", "{0} Showing local extensions.", message.text), severity: message.severity } };
      }
      throw error;
    }
  }
  async getPreferredExtensions(searchText, token) {
    const preferredExtensions = this.extensionsWorkbenchService.local.filter((e) => !e.isBuiltin && (e.name.toLowerCase().indexOf(searchText) > -1 || e.displayName.toLowerCase().indexOf(searchText) > -1 || e.description.toLowerCase().indexOf(searchText) > -1));
    const preferredExtensionUUIDs = /* @__PURE__ */ new Set();
    if (preferredExtensions.length) {
      const extesionsToFetch = [];
      for (const extension of preferredExtensions) {
        if (extension.identifier.uuid) {
          preferredExtensionUUIDs.add(extension.identifier.uuid);
        }
        if (!extension.gallery && extension.identifier.uuid) {
          extesionsToFetch.push(extension.identifier);
        }
      }
      if (extesionsToFetch.length) {
        this.extensionsWorkbenchService.getExtensions(extesionsToFetch, CancellationToken.None).catch(
          (e) => null
          /*ignore error*/
        );
      }
    }
    const preferredResults = [];
    try {
      const manifest = await this.extensionManagementService.getExtensionsControlManifest();
      if (Array.isArray(manifest.search)) {
        for (const s of manifest.search) {
          if (s.query && s.query.toLowerCase() === searchText && Array.isArray(s.preferredResults)) {
            preferredResults.push(...s.preferredResults);
            break;
          }
        }
      }
      if (preferredResults.length) {
        const result = await this.extensionsWorkbenchService.getExtensions(preferredResults.map((id) => ({ id })), token);
        for (const extension of result) {
          if (extension.identifier.uuid && !preferredExtensionUUIDs.has(extension.identifier.uuid)) {
            preferredExtensions.push(extension);
          }
        }
      }
    } catch (e) {
      this.logService.warn("Failed to get preferred results from the extensions control manifest.", e);
    }
    return preferredExtensions;
  }
  sortExtensions(extensions, options) {
    switch (options.sortBy) {
      case GallerySortBy.InstallCount:
        extensions = extensions.sort((e1, e2) => typeof e2.installCount === "number" && typeof e1.installCount === "number" ? e2.installCount - e1.installCount : NaN);
        break;
      case "UpdateDate" /* UpdateDate */:
        extensions = extensions.sort((e1, e2) => typeof e2.local?.installedTimestamp === "number" && typeof e1.local?.installedTimestamp === "number" ? e2.local.installedTimestamp - e1.local.installedTimestamp : typeof e2.local?.installedTimestamp === "number" ? 1 : typeof e1.local?.installedTimestamp === "number" ? -1 : NaN);
        break;
      case GallerySortBy.AverageRating:
      case GallerySortBy.WeightedRating:
        extensions = extensions.sort((e1, e2) => typeof e2.rating === "number" && typeof e1.rating === "number" ? e2.rating - e1.rating : NaN);
        break;
      default:
        extensions = extensions.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName));
        break;
    }
    if (options.sortOrder === SortOrder.Descending) {
      extensions = extensions.reverse();
    }
    return extensions;
  }
  isRecommendationsQuery(query) {
    return ExtensionsListView.isWorkspaceRecommendedExtensionsQuery(query.value) || ExtensionsListView.isKeymapsRecommendedExtensionsQuery(query.value) || ExtensionsListView.isLanguageRecommendedExtensionsQuery(query.value) || ExtensionsListView.isExeRecommendedExtensionsQuery(query.value) || ExtensionsListView.isRemoteRecommendedExtensionsQuery(query.value) || /@recommended:all/i.test(query.value) || ExtensionsListView.isSearchRecommendedExtensionsQuery(query.value) || ExtensionsListView.isRecommendedExtensionsQuery(query.value);
  }
  async queryRecommendations(query, options, token) {
    if (ExtensionsListView.isWorkspaceRecommendedExtensionsQuery(query.value)) {
      return this.getWorkspaceRecommendationsModel(query, options, token);
    }
    if (ExtensionsListView.isKeymapsRecommendedExtensionsQuery(query.value)) {
      return this.getKeymapRecommendationsModel(query, options, token);
    }
    if (ExtensionsListView.isLanguageRecommendedExtensionsQuery(query.value)) {
      return this.getLanguageRecommendationsModel(query, options, token);
    }
    if (ExtensionsListView.isExeRecommendedExtensionsQuery(query.value)) {
      return this.getExeRecommendationsModel(query, options, token);
    }
    if (ExtensionsListView.isRemoteRecommendedExtensionsQuery(query.value)) {
      return this.getRemoteRecommendationsModel(query, options, token);
    }
    if (/@recommended:all/i.test(query.value)) {
      return this.getAllRecommendationsModel(options, token);
    }
    if (ExtensionsListView.isSearchRecommendedExtensionsQuery(query.value) || ExtensionsListView.isRecommendedExtensionsQuery(query.value) && options.sortBy !== void 0) {
      return this.searchRecommendations(query, options, token);
    }
    if (ExtensionsListView.isRecommendedExtensionsQuery(query.value)) {
      return this.getOtherRecommendationsModel(query, options, token);
    }
    return new PagedModel([]);
  }
  async getInstallableRecommendations(recommendations, options, token) {
    const result = [];
    if (recommendations.length) {
      const galleryExtensions = [];
      const resourceExtensions = [];
      for (const recommendation of recommendations) {
        if (typeof recommendation === "string") {
          galleryExtensions.push(recommendation);
        } else {
          resourceExtensions.push(recommendation);
        }
      }
      if (galleryExtensions.length) {
        try {
          const extensions = await this.extensionsWorkbenchService.getExtensions(galleryExtensions.map((id) => ({ id })), { source: options.source }, token);
          for (const extension of extensions) {
            if (extension.gallery && !extension.deprecationInfo && await this.extensionManagementService.canInstall(extension.gallery) === true) {
              result.push(extension);
            }
          }
        } catch (error) {
          if (!resourceExtensions.length || !this.isOfflineError(error)) {
            throw error;
          }
        }
      }
      if (resourceExtensions.length) {
        const extensions = await this.extensionsWorkbenchService.getResourceExtensions(resourceExtensions, true);
        for (const extension of extensions) {
          if (await this.extensionsWorkbenchService.canInstall(extension) === true) {
            result.push(extension);
          }
        }
      }
    }
    return result;
  }
  async getWorkspaceRecommendations() {
    const recommendations = await this.extensionRecommendationsService.getWorkspaceRecommendations();
    const { important } = await this.extensionRecommendationsService.getConfigBasedRecommendations();
    for (const configBasedRecommendation of important) {
      if (!recommendations.find((extensionId) => extensionId === configBasedRecommendation)) {
        recommendations.push(configBasedRecommendation);
      }
    }
    return recommendations;
  }
  async getWorkspaceRecommendationsModel(query, options, token) {
    const recommendations = await this.getWorkspaceRecommendations();
    const installableRecommendations = await this.getInstallableRecommendations(recommendations, { ...options, source: "recommendations-workspace" }, token);
    return new PagedModel(installableRecommendations);
  }
  async getKeymapRecommendationsModel(query, options, token) {
    const value = query.value.replace(/@recommended:keymaps/g, "").trim().toLowerCase();
    const recommendations = this.extensionRecommendationsService.getKeymapRecommendations();
    const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: "recommendations-keymaps" }, token)).filter((extension) => extension.identifier.id.toLowerCase().indexOf(value) > -1);
    return new PagedModel(installableRecommendations);
  }
  async getLanguageRecommendationsModel(query, options, token) {
    const value = query.value.replace(/@recommended:languages/g, "").trim().toLowerCase();
    const recommendations = this.extensionRecommendationsService.getLanguageRecommendations();
    const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: "recommendations-languages" }, token)).filter((extension) => extension.identifier.id.toLowerCase().indexOf(value) > -1);
    return new PagedModel(installableRecommendations);
  }
  async getRemoteRecommendationsModel(query, options, token) {
    const value = query.value.replace(/@recommended:remotes/g, "").trim().toLowerCase();
    const recommendations = this.extensionRecommendationsService.getRemoteRecommendations();
    const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: "recommendations-remotes" }, token)).filter((extension) => extension.identifier.id.toLowerCase().indexOf(value) > -1);
    return new PagedModel(installableRecommendations);
  }
  async getExeRecommendationsModel(query, options, token) {
    const exe = query.value.replace(/@exe:/g, "").trim().toLowerCase();
    const { important, others } = await this.extensionRecommendationsService.getExeBasedRecommendations(exe.startsWith('"') ? exe.substring(1, exe.length - 1) : exe);
    const installableRecommendations = await this.getInstallableRecommendations([...important, ...others], { ...options, source: "recommendations-exe" }, token);
    return new PagedModel(installableRecommendations);
  }
  async getOtherRecommendationsModel(query, options, token) {
    const otherRecommendations = await this.getOtherRecommendations();
    const installableRecommendations = await this.getInstallableRecommendations(otherRecommendations, { ...options, source: "recommendations-other", sortBy: void 0 }, token);
    const result = coalesce(otherRecommendations.map((id) => installableRecommendations.find((i) => areSameExtensions(i.identifier, { id }))));
    return new PagedModel(result);
  }
  async getOtherRecommendations() {
    const local = (await this.extensionsWorkbenchService.queryLocal(this.options.server)).map((e) => e.identifier.id.toLowerCase());
    const workspaceRecommendations = (await this.getWorkspaceRecommendations()).map((extensionId) => isString(extensionId) ? extensionId.toLowerCase() : extensionId);
    return distinct(
      (await Promise.all([
        // Order is important
        this.extensionRecommendationsService.getImportantRecommendations(),
        this.extensionRecommendationsService.getFileBasedRecommendations(),
        this.extensionRecommendationsService.getOtherRecommendations()
      ])).flat().filter(
        (extensionId) => !local.includes(extensionId.toLowerCase()) && !workspaceRecommendations.includes(extensionId.toLowerCase())
      ),
      (extensionId) => extensionId.toLowerCase()
    );
  }
  // Get All types of recommendations, trimmed to show a max of 8 at any given time
  async getAllRecommendationsModel(options, token) {
    const localExtensions = await this.extensionsWorkbenchService.queryLocal(this.options.server);
    const localExtensionIds = localExtensions.map((e) => e.identifier.id.toLowerCase());
    const allRecommendations = distinct(
      (await Promise.all([
        // Order is important
        this.getWorkspaceRecommendations(),
        this.extensionRecommendationsService.getImportantRecommendations(),
        this.extensionRecommendationsService.getFileBasedRecommendations(),
        this.extensionRecommendationsService.getOtherRecommendations()
      ])).flat().filter((extensionId) => {
        if (isString(extensionId)) {
          return !localExtensionIds.includes(extensionId.toLowerCase());
        }
        return !localExtensions.some((localExtension) => localExtension.local && this.uriIdentityService.extUri.isEqual(localExtension.local.location, extensionId));
      })
    );
    const installableRecommendations = await this.getInstallableRecommendations(allRecommendations, { ...options, source: "recommendations-all", sortBy: void 0 }, token);
    const result = [];
    for (let i = 0; i < installableRecommendations.length && result.length < 8; i++) {
      const recommendation = allRecommendations[i];
      if (isString(recommendation)) {
        const extension = installableRecommendations.find((extension2) => areSameExtensions(extension2.identifier, { id: recommendation }));
        if (extension) {
          result.push(extension);
        }
      } else {
        const extension = installableRecommendations.find((extension2) => extension2.resourceExtension && this.uriIdentityService.extUri.isEqual(extension2.resourceExtension.location, recommendation));
        if (extension) {
          result.push(extension);
        }
      }
    }
    return new PagedModel(result);
  }
  async searchRecommendations(query, options, token) {
    const value = query.value.replace(/@recommended/g, "").trim().toLowerCase();
    const recommendations = distinct([...await this.getWorkspaceRecommendations(), ...await this.getOtherRecommendations()]);
    const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: "recommendations", sortBy: void 0 }, token)).filter((extension) => extension.identifier.id.toLowerCase().indexOf(value) > -1);
    return new PagedModel(this.sortExtensions(installableRecommendations, options));
  }
  setModel(model, message, donotResetScrollTop) {
    if (this.list) {
      this.list.model = new DelayedPagedModel(model);
      this.updateBody(message);
      if (!donotResetScrollTop) {
        this.list.scrollTop = 0;
      }
    }
    if (this.badge) {
      this.badge.setCount(this.count());
    }
  }
  updateModel(model) {
    if (this.list) {
      this.list.model = new DelayedPagedModel(model);
      this.updateBody();
    }
    if (this.badge) {
      this.badge.setCount(this.count());
    }
  }
  updateBody(message) {
    if (this.bodyTemplate) {
      const count = this.count();
      this.bodyTemplate.extensionsList.classList.toggle("hidden", count === 0);
      this.bodyTemplate.messageContainer.classList.toggle("hidden", !message && count > 0);
      if (this.isBodyVisible()) {
        if (message) {
          this.bodyTemplate.messageSeverityIcon.className = SeverityIcon.className(message.severity);
          this.bodyTemplate.messageBox.textContent = message.text;
        } else if (this.count() === 0) {
          this.bodyTemplate.messageSeverityIcon.className = "";
          this.bodyTemplate.messageBox.textContent = localize("no extensions found", "No extensions found.");
        }
        if (this.bodyTemplate.messageBox.textContent) {
          alert(this.bodyTemplate.messageBox.textContent);
        }
      }
    }
    this.updateSize();
  }
  getMessage(error) {
    if (this.isOfflineError(error)) {
      return { text: localize("offline error", "Unable to search the Marketplace when offline, please check your network connection."), severity: Severity.Warning };
    } else {
      return { text: localize("error", "Error while fetching extensions. {0}", getErrorMessage(error)), severity: Severity.Error };
    }
  }
  isOfflineError(error) {
    if (error instanceof ExtensionGalleryError) {
      return error.code === ExtensionGalleryErrorCode.Offline;
    }
    return isOfflineError(error);
  }
  updateSize() {
    if (this.options.flexibleHeight) {
      this.maximumBodySize = this.list?.model.length ? Number.POSITIVE_INFINITY : 0;
      this.storageService.store(`${this.id}.size`, this.list?.model.length || 0, StorageScope.PROFILE, StorageTarget.MACHINE);
    }
  }
  dispose() {
    super.dispose();
    if (this.queryRequest) {
      this.queryRequest.request.cancel();
      this.queryRequest = null;
    }
    if (this.queryResult) {
      this.queryResult.disposables.dispose();
      this.queryResult = void 0;
    }
    this.list = null;
  }
  static isLocalExtensionsQuery(query, sortBy) {
    return this.isInstalledExtensionsQuery(query) || this.isSearchInstalledExtensionsQuery(query) || this.isOutdatedExtensionsQuery(query) || this.isEnabledExtensionsQuery(query) || this.isDisabledExtensionsQuery(query) || this.isBuiltInExtensionsQuery(query) || this.isSearchBuiltInExtensionsQuery(query) || this.isBuiltInGroupExtensionsQuery(query) || this.isSearchDeprecatedExtensionsQuery(query) || this.isSearchWorkspaceUnsupportedExtensionsQuery(query) || this.isSearchRecentlyUpdatedQuery(query) || this.isRestartRequiredQuery(query) || this.isSearchExtensionUpdatesQuery(query) || this.isSortInstalledExtensionsQuery(query, sortBy) || this.isFeatureExtensionsQuery(query);
  }
  static isSearchBuiltInExtensionsQuery(query) {
    return /@builtin\s.+|.+\s@builtin/i.test(query);
  }
  static isBuiltInExtensionsQuery(query) {
    return /^@builtin$/i.test(query.trim());
  }
  static isBuiltInGroupExtensionsQuery(query) {
    return /^@builtin:.+$/i.test(query.trim());
  }
  static isSearchWorkspaceUnsupportedExtensionsQuery(query) {
    return /^\s*@workspaceUnsupported(:(untrusted|virtual)(Partial)?)?(\s|$)/i.test(query);
  }
  static isInstalledExtensionsQuery(query) {
    return /@installed$/i.test(query) && !/@mcp/i.test(query) && !/@agentPlugins/i.test(query);
  }
  static isSearchInstalledExtensionsQuery(query) {
    return /@installed\s./i.test(query) && !/@mcp/i.test(query) && !/@agentPlugins/i.test(query) || this.isFeatureExtensionsQuery(query);
  }
  static isOutdatedExtensionsQuery(query) {
    return /@outdated/i.test(query);
  }
  static isEnabledExtensionsQuery(query) {
    return /@enabled/i.test(query) && !/@builtin/i.test(query);
  }
  static isDisabledExtensionsQuery(query) {
    return /@disabled/i.test(query) && !/@builtin/i.test(query);
  }
  static isSearchDeprecatedExtensionsQuery(query) {
    return /@deprecated\s?.*/i.test(query);
  }
  static isRecommendedExtensionsQuery(query) {
    return /^@recommended$/i.test(query.trim());
  }
  static isSearchRecommendedExtensionsQuery(query) {
    return /@recommended\s.+/i.test(query);
  }
  static isWorkspaceRecommendedExtensionsQuery(query) {
    return /@recommended:workspace/i.test(query);
  }
  static isExeRecommendedExtensionsQuery(query) {
    return /@exe:.+/i.test(query);
  }
  static isRemoteRecommendedExtensionsQuery(query) {
    return /@recommended:remotes/i.test(query);
  }
  static isKeymapsRecommendedExtensionsQuery(query) {
    return /@recommended:keymaps/i.test(query);
  }
  static isLanguageRecommendedExtensionsQuery(query) {
    return /@recommended:languages/i.test(query);
  }
  static isSortInstalledExtensionsQuery(query, sortBy) {
    return sortBy !== void 0 && sortBy !== "" && query === "" || !sortBy && /^@sort:\S*$/i.test(query);
  }
  static isSearchPopularQuery(query) {
    return /@popular/i.test(query);
  }
  static isSearchRecentlyPublishedQuery(query) {
    return /@recentlyPublished/i.test(query);
  }
  static isSearchRecentlyUpdatedQuery(query) {
    return /@recentlyUpdated/i.test(query);
  }
  static isRestartRequiredQuery(query) {
    return /@restartrequired/i.test(query);
  }
  static isSearchExtensionUpdatesQuery(query) {
    return /@updates/i.test(query);
  }
  static isSortUpdateDateQuery(query) {
    return /@sort:updateDate/i.test(query);
  }
  static isFeatureExtensionsQuery(query) {
    return /@contribute:/i.test(query);
  }
  focus() {
    super.focus();
    if (!this.list) {
      return;
    }
    if (!(this.list.getFocus().length || this.list.getSelection().length)) {
      this.list.focusNext();
    }
    this.list.domFocus();
  }
};
ExtensionsListView.RECENT_UPDATE_DURATION = 7 * 24 * 60 * 60 * 1e3;
ExtensionsListView = __decorateClass([
  __decorateParam(2, INotificationService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IExtensionsWorkbenchService),
  __decorateParam(9, IExtensionRecommendationsService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IWorkspaceContextService),
  __decorateParam(14, IExtensionManagementServerService),
  __decorateParam(15, IExtensionManifestPropertiesService),
  __decorateParam(16, IWorkbenchExtensionManagementService),
  __decorateParam(17, IWorkspaceContextService),
  __decorateParam(18, IProductService),
  __decorateParam(19, IContextKeyService),
  __decorateParam(20, IViewDescriptorService),
  __decorateParam(21, IOpenerService),
  __decorateParam(22, IStorageService),
  __decorateParam(23, IWorkspaceTrustManagementService),
  __decorateParam(24, IWorkbenchExtensionEnablementService),
  __decorateParam(25, IExtensionFeaturesManagementService),
  __decorateParam(26, IUriIdentityService),
  __decorateParam(27, ILogService)
], ExtensionsListView);
class DefaultPopularExtensionsView extends ExtensionsListView {
  async show() {
    const query = this.extensionManagementServerService.webExtensionManagementServer && !this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer ? "@web" : "";
    return super.show(query);
  }
}
class ServerInstalledExtensionsView extends ExtensionsListView {
  async show(query) {
    query = query ? query : "@installed";
    if (!ExtensionsListView.isLocalExtensionsQuery(query) || ExtensionsListView.isSortInstalledExtensionsQuery(query)) {
      query = query += " @installed";
    }
    return super.show(query.trim());
  }
}
class EnabledExtensionsView extends ExtensionsListView {
  async show(query) {
    query = query || "@enabled";
    return ExtensionsListView.isEnabledExtensionsQuery(query) ? super.show(query) : ExtensionsListView.isSortInstalledExtensionsQuery(query) ? super.show("@enabled " + query) : this.showEmptyModel();
  }
}
class DisabledExtensionsView extends ExtensionsListView {
  async show(query) {
    query = query || "@disabled";
    return ExtensionsListView.isDisabledExtensionsQuery(query) ? super.show(query) : ExtensionsListView.isSortInstalledExtensionsQuery(query) ? super.show("@disabled " + query) : this.showEmptyModel();
  }
}
class OutdatedExtensionsView extends ExtensionsListView {
  async show(query) {
    query = query ? query : "@outdated";
    if (ExtensionsListView.isSearchExtensionUpdatesQuery(query)) {
      query = query.replace("@updates", "@outdated");
    }
    return super.show(query.trim());
  }
  updateSize() {
    super.updateSize();
    this.setExpanded(this.count() > 0);
  }
}
class RecentlyUpdatedExtensionsView extends ExtensionsListView {
  async show(query) {
    query = query ? query : "@recentlyUpdated";
    if (ExtensionsListView.isSearchExtensionUpdatesQuery(query)) {
      query = query.replace("@updates", "@recentlyUpdated");
    }
    return super.show(query.trim());
  }
}
let StaticQueryExtensionsView = class extends ExtensionsListView {
  constructor(options, viewletViewOptions, notificationService, keybindingService, contextMenuService, instantiationService, themeService, extensionService, extensionsWorkbenchService, extensionRecommendationsService, telemetryService, hoverService, configurationService, contextService, extensionManagementServerService, extensionManifestPropertiesService, extensionManagementService, workspaceService, productService, contextKeyService, viewDescriptorService, openerService, storageService, workspaceTrustManagementService, extensionEnablementService, extensionFeaturesManagementService, uriIdentityService, logService) {
    super(
      options,
      viewletViewOptions,
      notificationService,
      keybindingService,
      contextMenuService,
      instantiationService,
      themeService,
      extensionService,
      extensionsWorkbenchService,
      extensionRecommendationsService,
      telemetryService,
      hoverService,
      configurationService,
      contextService,
      extensionManagementServerService,
      extensionManifestPropertiesService,
      extensionManagementService,
      workspaceService,
      productService,
      contextKeyService,
      viewDescriptorService,
      openerService,
      storageService,
      workspaceTrustManagementService,
      extensionEnablementService,
      extensionFeaturesManagementService,
      uriIdentityService,
      logService
    );
    this.options = options;
  }
  show() {
    return super.show(this.options.query);
  }
};
StaticQueryExtensionsView = __decorateClass([
  __decorateParam(2, INotificationService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IExtensionsWorkbenchService),
  __decorateParam(9, IExtensionRecommendationsService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IWorkspaceContextService),
  __decorateParam(14, IExtensionManagementServerService),
  __decorateParam(15, IExtensionManifestPropertiesService),
  __decorateParam(16, IWorkbenchExtensionManagementService),
  __decorateParam(17, IWorkspaceContextService),
  __decorateParam(18, IProductService),
  __decorateParam(19, IContextKeyService),
  __decorateParam(20, IViewDescriptorService),
  __decorateParam(21, IOpenerService),
  __decorateParam(22, IStorageService),
  __decorateParam(23, IWorkspaceTrustManagementService),
  __decorateParam(24, IWorkbenchExtensionEnablementService),
  __decorateParam(25, IExtensionFeaturesManagementService),
  __decorateParam(26, IUriIdentityService),
  __decorateParam(27, ILogService)
], StaticQueryExtensionsView);
function toSpecificWorkspaceUnsupportedQuery(query, qualifier) {
  if (!query) {
    return "@workspaceUnsupported:" + qualifier;
  }
  const match = query.match(new RegExp(`@workspaceUnsupported(:${qualifier})?(\\s|$)`, "i"));
  if (match) {
    if (!match[1]) {
      return query.replace(/@workspaceUnsupported/gi, "@workspaceUnsupported:" + qualifier);
    }
    return query;
  }
  return void 0;
}
class UntrustedWorkspaceUnsupportedExtensionsView extends ExtensionsListView {
  async show(query) {
    const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, "untrusted");
    return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
  }
}
class UntrustedWorkspacePartiallySupportedExtensionsView extends ExtensionsListView {
  async show(query) {
    const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, "untrustedPartial");
    return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
  }
}
class VirtualWorkspaceUnsupportedExtensionsView extends ExtensionsListView {
  async show(query) {
    const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, "virtual");
    return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
  }
}
class VirtualWorkspacePartiallySupportedExtensionsView extends ExtensionsListView {
  async show(query) {
    const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, "virtualPartial");
    return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
  }
}
class DeprecatedExtensionsView extends ExtensionsListView {
  async show(query) {
    return ExtensionsListView.isSearchDeprecatedExtensionsQuery(query) ? super.show(query) : this.showEmptyModel();
  }
}
class SearchMarketplaceExtensionsView extends ExtensionsListView {
  constructor() {
    super(...arguments);
    this.reportSearchFinishedDelayer = this._register(new ThrottledDelayer(2e3));
    this.searchWaitPromise = Promise.resolve();
  }
  async show(query) {
    const queryPromise = super.show(query);
    this.reportSearchFinishedDelayer.trigger(() => this.reportSearchFinished());
    this.searchWaitPromise = queryPromise.then(null, null);
    return queryPromise;
  }
  async reportSearchFinished() {
    await this.searchWaitPromise;
    this.telemetryService.publicLog2("extensionsView:MarketplaceSearchFinished");
  }
}
class DefaultRecommendedExtensionsView extends ExtensionsListView {
  constructor() {
    super(...arguments);
    this.recommendedExtensionsQuery = "@recommended:all";
  }
  renderBody(container) {
    super.renderBody(container);
    this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => {
      this.show("");
    }));
  }
  async show(query) {
    if (query && query.trim() !== this.recommendedExtensionsQuery) {
      return this.showEmptyModel();
    }
    const model = await super.show(this.recommendedExtensionsQuery);
    if (!this.extensionsWorkbenchService.local.some((e) => !e.isBuiltin)) {
      this.setExpanded(model.length > 0);
    }
    return model;
  }
}
class RecommendedExtensionsView extends ExtensionsListView {
  constructor() {
    super(...arguments);
    this.recommendedExtensionsQuery = "@recommended";
  }
  renderBody(container) {
    super.renderBody(container);
    this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => {
      this.show("");
    }));
  }
  async show(query) {
    return query && query.trim() !== this.recommendedExtensionsQuery ? this.showEmptyModel() : super.show(this.recommendedExtensionsQuery);
  }
}
class WorkspaceRecommendedExtensionsView extends ExtensionsListView {
  constructor() {
    super(...arguments);
    this.recommendedExtensionsQuery = "@recommended:workspace";
  }
  renderBody(container) {
    super.renderBody(container);
    this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => this.show(this.recommendedExtensionsQuery)));
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.show(this.recommendedExtensionsQuery)));
  }
  async show(query) {
    const shouldShowEmptyView = query && query.trim() !== "@recommended" && query.trim() !== "@recommended:workspace";
    const model = await (shouldShowEmptyView ? this.showEmptyModel() : super.show(this.recommendedExtensionsQuery));
    this.setExpanded(model.length > 0);
    return model;
  }
  async getInstallableWorkspaceRecommendations() {
    const installed = (await this.extensionsWorkbenchService.queryLocal()).filter((l) => l.enablementState !== EnablementState.DisabledByExtensionKind);
    const recommendations = (await this.getWorkspaceRecommendations()).filter((recommendation) => installed.every((local) => isString(recommendation) ? !areSameExtensions({ id: recommendation }, local.identifier) : !this.uriIdentityService.extUri.isEqual(recommendation, local.local?.location)));
    return this.getInstallableRecommendations(recommendations, { source: "install-all-workspace-recommendations" }, CancellationToken.None);
  }
  async installWorkspaceRecommendations() {
    const installableRecommendations = await this.getInstallableWorkspaceRecommendations();
    if (installableRecommendations.length) {
      const galleryExtensions = [];
      const resourceExtensions = [];
      for (const recommendation of installableRecommendations) {
        if (recommendation.gallery) {
          galleryExtensions.push({ extension: recommendation.gallery, options: {} });
        } else {
          resourceExtensions.push(recommendation);
        }
      }
      await Promise.all([
        this.extensionManagementService.installGalleryExtensions(galleryExtensions),
        ...resourceExtensions.map((extension) => this.extensionsWorkbenchService.install(extension))
      ]);
    } else {
      this.notificationService.notify({
        severity: Severity.Info,
        message: localize("no local extensions", "There are no extensions to install.")
      });
    }
  }
}
class PreferredExtensionsPagedModel {
  constructor(preferredExtensions, pager) {
    this.preferredExtensions = preferredExtensions;
    this.pager = pager;
    this.resolved = /* @__PURE__ */ new Map();
    this.preferredGalleryExtensions = /* @__PURE__ */ new Set();
    this.resolvedGalleryExtensionsFromQuery = [];
    for (let i = 0; i < this.preferredExtensions.length; i++) {
      this.resolved.set(i, this.preferredExtensions[i]);
    }
    for (const e of preferredExtensions) {
      if (e.identifier.uuid) {
        this.preferredGalleryExtensions.add(e.identifier.uuid);
      }
    }
    this.length = preferredExtensions.length - this.preferredGalleryExtensions.size + this.pager.total;
    const totalPages = Math.ceil(this.pager.total / this.pager.pageSize);
    this.populateResolvedExtensions(0, this.pager.firstPage);
    this.pages = range(totalPages - 1).map(() => ({
      promise: null,
      cts: null,
      promiseIndexes: /* @__PURE__ */ new Set()
    }));
  }
  get onDidIncrementLength() {
    return Event.None;
  }
  isResolved(index) {
    return this.resolved.has(index);
  }
  get(index) {
    return this.resolved.get(index);
  }
  async resolve(index, cancellationToken) {
    if (cancellationToken.isCancellationRequested) {
      throw new CancellationError();
    }
    if (this.isResolved(index)) {
      return this.get(index);
    }
    const indexInPagedModel = index - this.preferredExtensions.length + this.resolvedGalleryExtensionsFromQuery.length;
    const pageIndex = Math.floor(indexInPagedModel / this.pager.pageSize);
    const page = this.pages[pageIndex - 1];
    if (!page.promise) {
      page.cts = new CancellationTokenSource();
      page.promise = this.pager.getPage(pageIndex, page.cts.token).then((extensions) => this.populateResolvedExtensions(pageIndex, extensions)).catch((e) => {
        page.promise = null;
        throw e;
      }).finally(() => page.cts = null);
    }
    const listener = cancellationToken.onCancellationRequested(() => {
      if (!page.cts) {
        return;
      }
      page.promiseIndexes.delete(index);
      if (page.promiseIndexes.size === 0) {
        page.cts.cancel();
      }
    });
    page.promiseIndexes.add(index);
    try {
      await page.promise;
    } finally {
      listener.dispose();
    }
    return this.get(index);
  }
  populateResolvedExtensions(pageIndex, extensions) {
    let adjustIndexOfNextPagesBy = 0;
    const pageStartIndex = pageIndex * this.pager.pageSize;
    for (let i = 0; i < extensions.length; i++) {
      const e = extensions[i];
      if (e.gallery?.identifier.uuid && this.preferredGalleryExtensions.has(e.gallery.identifier.uuid)) {
        this.resolvedGalleryExtensionsFromQuery.push(e);
        adjustIndexOfNextPagesBy++;
      } else {
        this.resolved.set(this.preferredExtensions.length - this.resolvedGalleryExtensionsFromQuery.length + pageStartIndex + i, e);
      }
    }
    if (pageIndex !== 0 && adjustIndexOfNextPagesBy) {
      const nextPageStartIndex = (pageIndex + 1) * this.pager.pageSize;
      const indices = [...this.resolved.keys()].sort((a, b) => a - b);
      for (const index of indices) {
        if (index >= nextPageStartIndex) {
          const e = this.resolved.get(index);
          if (e) {
            this.resolved.delete(index);
            this.resolved.set(index - adjustIndexOfNextPagesBy, e);
          }
        }
      }
    }
  }
}
export {
  AbstractExtensionsListView,
  DefaultPopularExtensionsView,
  DefaultRecommendedExtensionsView,
  DeprecatedExtensionsView,
  DisabledExtensionsView,
  EnabledExtensionsView,
  ExtensionsListView,
  NONE_CATEGORY,
  OutdatedExtensionsView,
  PreferredExtensionsPagedModel,
  RecentlyUpdatedExtensionsView,
  RecommendedExtensionsView,
  SearchMarketplaceExtensionsView,
  ServerInstalledExtensionsView,
  StaticQueryExtensionsView,
  UntrustedWorkspacePartiallySupportedExtensionsView,
  UntrustedWorkspaceUnsupportedExtensionsView,
  VirtualWorkspacePartiallySupportedExtensionsView,
  VirtualWorkspaceUnsupportedExtensionsView,
  WorkspaceRecommendedExtensionsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbnNWaWV3cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciwgZ2V0RXJyb3JNZXNzYWdlLCBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBQYWdlZE1vZGVsLCBJUGFnZWRNb2RlbCwgRGVsYXllZFBhZ2VkTW9kZWwsIElQYWdlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhZ2luZy5qcyc7XG5pbXBvcnQgeyBTb3J0T3JkZXIsIElRdWVyeU9wdGlvbnMgYXMgSUdhbGxlcnlRdWVyeU9wdGlvbnMsIFNvcnRCeSBhcyBHYWxsZXJ5U29ydEJ5LCBJbnN0YWxsRXh0ZW5zaW9uSW5mbywgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZSwgRXh0ZW5zaW9uR2FsbGVyeUVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLCBFbmFibGVtZW50U3RhdGUsIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zLCBnZXRFeHRlbnNpb25EZXBlbmRlbmNpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGFwcGVuZCwgJCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25SZXN1bHRzTGlzdEZvY3VzZWQsIEV4dGVuc2lvblN0YXRlLCBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uc1ZpZXdTdGF0ZSwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBJV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zVmlldyB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFF1ZXJ5IH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvblF1ZXJ5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlLCB0b0V4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdsZXRWaWV3T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ291bnRCYWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb3VudEJhZGdlL2NvdW50QmFkZ2UuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoUGFnZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVmlld1BhbmUsIElWaWV3UGFuZU9wdGlvbnMsIFZpZXdQYW5lU2hvd0FjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlLCBkaXN0aW5jdCwgcmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIEV4dGVuc2lvbklkZW50aWZpZXJNYXAsIEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlLCBFeHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlU3VwcG9ydFR5cGUsIElFeHRlbnNpb25EZXNjcmlwdGlvbiwgSUV4dGVuc2lvbklkZW50aWZpZXIsIGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXZlcml0eUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2V2ZXJpdHlJY29uL3NldmVyaXR5SWNvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVmlydHVhbFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vdmlydHVhbFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBpc09mZmxpbmVFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJRXh0ZW5zaW9uRmVhdHVyZVJlbmRlcmVyLCBJRXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZSwgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNMaXN0IH0gZnJvbSAnLi9leHRlbnNpb25zVmlld2VyLmpzJztcblxuZXhwb3J0IGNvbnN0IE5PTkVfQ0FURUdPUlkgPSAnbm9uZSc7XG5cbnR5cGUgTWVzc2FnZSA9IHtcblx0cmVhZG9ubHkgdGV4dDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXZlcml0eTogU2V2ZXJpdHk7XG59O1xuXG5jbGFzcyBFeHRlbnNpb25zVmlld1N0YXRlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25zVmlld1N0YXRlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkZvY3VzOiBFbWl0dGVyPElFeHRlbnNpb24+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUV4dGVuc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRm9jdXM6IEV2ZW50PElFeHRlbnNpb24+ID0gdGhpcy5fb25Gb2N1cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkJsdXI6IEVtaXR0ZXI8SUV4dGVuc2lvbj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRXh0ZW5zaW9uPigpKTtcblx0cmVhZG9ubHkgb25CbHVyOiBFdmVudDxJRXh0ZW5zaW9uPiA9IHRoaXMuX29uQmx1ci5ldmVudDtcblxuXHRwcml2YXRlIGN1cnJlbnRseUZvY3VzZWRJdGVtczogSUV4dGVuc2lvbltdID0gW107XG5cblx0ZmlsdGVyczoge1xuXHRcdGZlYXR1cmVJZD86IHN0cmluZztcblx0fSA9IHt9O1xuXG5cdG9uRm9jdXNDaGFuZ2UoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogdm9pZCB7XG5cdFx0dGhpcy5jdXJyZW50bHlGb2N1c2VkSXRlbXMuZm9yRWFjaChleHRlbnNpb24gPT4gdGhpcy5fb25CbHVyLmZpcmUoZXh0ZW5zaW9uKSk7XG5cdFx0dGhpcy5jdXJyZW50bHlGb2N1c2VkSXRlbXMgPSBleHRlbnNpb25zO1xuXHRcdHRoaXMuY3VycmVudGx5Rm9jdXNlZEl0ZW1zLmZvckVhY2goZXh0ZW5zaW9uID0+IHRoaXMuX29uRm9jdXMuZmlyZShleHRlbnNpb24pKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEV4dGVuc2lvbnNMaXN0Vmlld09wdGlvbnMge1xuXHRzZXJ2ZXI/OiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcjtcblx0ZmxleGlibGVIZWlnaHQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRpdGxlPzogRXZlbnQ8c3RyaW5nPjtcblx0aGlkZUJhZGdlPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElRdWVyeVJlc3VsdCB7XG5cdG1vZGVsOiBJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPjtcblx0bWVzc2FnZT86IHsgdGV4dDogc3RyaW5nOyBzZXZlcml0eTogU2V2ZXJpdHkgfTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbD86IEV2ZW50PElQYWdlZE1vZGVsPElFeHRlbnNpb24+Pjtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY29uc3QgZW51bSBMb2NhbFNvcnRCeSB7XG5cdFVwZGF0ZURhdGUgPSAnVXBkYXRlRGF0ZScsXG59XG5cbmZ1bmN0aW9uIGlzTG9jYWxTb3J0QnkodmFsdWU6IGFueSk6IHZhbHVlIGlzIExvY2FsU29ydEJ5IHtcblx0c3dpdGNoICh2YWx1ZSBhcyBMb2NhbFNvcnRCeSkge1xuXHRcdGNhc2UgTG9jYWxTb3J0QnkuVXBkYXRlRGF0ZTogcmV0dXJuIHRydWU7XG5cdH1cbn1cblxudHlwZSBTb3J0QnkgPSBMb2NhbFNvcnRCeSB8IEdhbGxlcnlTb3J0Qnk7XG50eXBlIElRdWVyeU9wdGlvbnMgPSBPbWl0PElHYWxsZXJ5UXVlcnlPcHRpb25zLCAnc29ydEJ5Jz4gJiB7IHNvcnRCeT86IFNvcnRCeSB9O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RFeHRlbnNpb25zTGlzdFZpZXc8VD4gZXh0ZW5kcyBWaWV3UGFuZSB7XG5cdGFic3RyYWN0IHNob3cocXVlcnk6IHN0cmluZywgcmVmcmVzaD86IGJvb2xlYW4pOiBQcm9taXNlPElQYWdlZE1vZGVsPFQ+Pjtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNMaXN0VmlldyBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uc0xpc3RWaWV3PElFeHRlbnNpb24+IHtcblxuXHRwcml2YXRlIHN0YXRpYyBSRUNFTlRfVVBEQVRFX0RVUkFUSU9OID0gNyAqIDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDcgZGF5c1xuXG5cdHByaXZhdGUgYm9keVRlbXBsYXRlOiB7XG5cdFx0bWVzc2FnZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdFx0bWVzc2FnZVNldmVyaXR5SWNvbjogSFRNTEVsZW1lbnQ7XG5cdFx0bWVzc2FnZUJveDogSFRNTEVsZW1lbnQ7XG5cdFx0ZXh0ZW5zaW9uc0xpc3Q6IEhUTUxFbGVtZW50O1xuXHR9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGJhZGdlOiBDb3VudEJhZGdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxpc3Q6IFdvcmtiZW5jaFBhZ2VkTGlzdDxJRXh0ZW5zaW9uPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHF1ZXJ5UmVxdWVzdDogeyBxdWVyeTogc3RyaW5nOyByZXF1ZXN0OiBDYW5jZWxhYmxlUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4gfSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHF1ZXJ5UmVzdWx0OiBJUXVlcnlSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZXh0ZW5zaW9uc1ZpZXdTdGF0ZTogRXh0ZW5zaW9uc1ZpZXdTdGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51QWN0aW9uUnVubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvblJ1bm5lcigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgb3B0aW9uczogRXh0ZW5zaW9uc0xpc3RWaWV3T3B0aW9ucyxcblx0XHR2aWV3bGV0Vmlld09wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByb3RlY3RlZCBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcm90ZWN0ZWQgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgcHJvdGVjdGVkIGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByb3RlY3RlZCBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdC4uLih2aWV3bGV0Vmlld09wdGlvbnMgYXMgSVZpZXdQYW5lT3B0aW9ucyksXG5cdFx0XHRzaG93QWN0aW9uczogVmlld1BhbmVTaG93QWN0aW9ucy5BbHdheXMsXG5cdFx0XHRtYXhpbXVtQm9keVNpemU6IG9wdGlvbnMuZmxleGlibGVIZWlnaHQgPyAoc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKGAke3ZpZXdsZXRWaWV3T3B0aW9ucy5pZH0uc2l6ZWAsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAwKSA/IHVuZGVmaW5lZCA6IDApIDogdW5kZWZpbmVkXG5cdFx0fSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5vbkRpZENoYW5nZVRpdGxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9wdGlvbnMub25EaWRDaGFuZ2VUaXRsZSh0aXRsZSA9PiB0aGlzLnVwZGF0ZVRpdGxlKHRpdGxlKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dE1lbnVBY3Rpb25SdW5uZXIub25EaWRSdW4oKHsgZXJyb3IgfSkgPT4gZXJyb3IgJiYgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVnaXN0ZXJBY3Rpb25zKCk6IHZvaWQgeyB9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckhlYWRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2V4dGVuc2lvbi12aWV3LWhlYWRlcicpO1xuXHRcdHN1cGVyLnJlbmRlckhlYWRlcihjb250YWluZXIpO1xuXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMuaGlkZUJhZGdlKSB7XG5cdFx0XHR0aGlzLmJhZGdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvdW50QmFkZ2UoYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNvdW50LWJhZGdlLXdyYXBwZXInKSksIHt9LCBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcykpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBtZXNzYWdlQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1lc3NhZ2UtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IG1lc3NhZ2VTZXZlcml0eUljb24gPSBhcHBlbmQobWVzc2FnZUNvbnRhaW5lciwgJCgnJykpO1xuXHRcdGNvbnN0IG1lc3NhZ2VCb3ggPSBhcHBlbmQobWVzc2FnZUNvbnRhaW5lciwgJCgnLm1lc3NhZ2UnKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0xpc3QgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuZXh0ZW5zaW9ucy1saXN0JykpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc1ZpZXdTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFeHRlbnNpb25zVmlld1N0YXRlKCkpO1xuXHRcdHRoaXMubGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc0xpc3QsIGV4dGVuc2lvbnNMaXN0LCB0aGlzLmlkLCB7fSwgdGhpcy5leHRlbnNpb25zVmlld1N0YXRlKSkubGlzdDtcblx0XHRFeHRlbnNpb25SZXN1bHRzTGlzdEZvY3VzZWQuYmluZFRvKHRoaXMubGlzdC5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB0aGlzLmV4dGVuc2lvbnNWaWV3U3RhdGU/Lm9uRm9jdXNDaGFuZ2UoY29hbGVzY2UoZS5lbGVtZW50cykpLCB0aGlzKSk7XG5cblx0XHR0aGlzLmJvZHlUZW1wbGF0ZSA9IHtcblx0XHRcdGV4dGVuc2lvbnNMaXN0LFxuXHRcdFx0bWVzc2FnZUJveCxcblx0XHRcdG1lc3NhZ2VDb250YWluZXIsXG5cdFx0XHRtZXNzYWdlU2V2ZXJpdHlJY29uXG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLnF1ZXJ5UmVzdWx0KSB7XG5cdFx0XHR0aGlzLnNldE1vZGVsKHRoaXMucXVlcnlSZXN1bHQubW9kZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHRpZiAodGhpcy5ib2R5VGVtcGxhdGUpIHtcblx0XHRcdHRoaXMuYm9keVRlbXBsYXRlLmV4dGVuc2lvbnNMaXN0LnN0eWxlLmhlaWdodCA9IGhlaWdodCArICdweCc7XG5cdFx0fVxuXHRcdHRoaXMubGlzdD8ubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0YXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nLCByZWZyZXNoPzogYm9vbGVhbik6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRpZiAodGhpcy5xdWVyeVJlcXVlc3QpIHtcblx0XHRcdGlmICghcmVmcmVzaCAmJiB0aGlzLnF1ZXJ5UmVxdWVzdC5xdWVyeSA9PT0gcXVlcnkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucXVlcnlSZXF1ZXN0LnJlcXVlc3Q7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnF1ZXJ5UmVxdWVzdC5yZXF1ZXN0LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5xdWVyeVJlcXVlc3QgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnF1ZXJ5UmVzdWx0KSB7XG5cdFx0XHR0aGlzLnF1ZXJ5UmVzdWx0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMucXVlcnlSZXN1bHQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb25zVmlld1N0YXRlKSB7XG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uc1ZpZXdTdGF0ZS5maWx0ZXJzID0ge307XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VkUXVlcnkgPSBRdWVyeS5wYXJzZShxdWVyeSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBJUXVlcnlPcHRpb25zID0ge1xuXHRcdFx0c29ydE9yZGVyOiBTb3J0T3JkZXIuRGVmYXVsdFxuXHRcdH07XG5cblx0XHRzd2l0Y2ggKHBhcnNlZFF1ZXJ5LnNvcnRCeSkge1xuXHRcdFx0Y2FzZSAnaW5zdGFsbHMnOiBvcHRpb25zLnNvcnRCeSA9IEdhbGxlcnlTb3J0QnkuSW5zdGFsbENvdW50OyBicmVhaztcblx0XHRcdGNhc2UgJ3JhdGluZyc6IG9wdGlvbnMuc29ydEJ5ID0gR2FsbGVyeVNvcnRCeS5XZWlnaHRlZFJhdGluZzsgYnJlYWs7XG5cdFx0XHRjYXNlICduYW1lJzogb3B0aW9ucy5zb3J0QnkgPSBHYWxsZXJ5U29ydEJ5LlRpdGxlOyBicmVhaztcblx0XHRcdGNhc2UgJ3B1Ymxpc2hlZERhdGUnOiBvcHRpb25zLnNvcnRCeSA9IEdhbGxlcnlTb3J0QnkuUHVibGlzaGVkRGF0ZTsgYnJlYWs7XG5cdFx0XHRjYXNlICd1cGRhdGVEYXRlJzogb3B0aW9ucy5zb3J0QnkgPSBMb2NhbFNvcnRCeS5VcGRhdGVEYXRlOyBicmVhaztcblx0XHR9XG5cblx0XHRjb25zdCByZXF1ZXN0ID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5xdWVyeVJlc3VsdCA9IGF3YWl0IHRoaXMucXVlcnkocGFyc2VkUXVlcnksIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLnF1ZXJ5UmVzdWx0Lm1vZGVsO1xuXHRcdFx0XHR0aGlzLnNldE1vZGVsKG1vZGVsLCB0aGlzLnF1ZXJ5UmVzdWx0Lm1lc3NhZ2UpO1xuXHRcdFx0XHRpZiAodGhpcy5xdWVyeVJlc3VsdC5vbkRpZENoYW5nZU1vZGVsKSB7XG5cdFx0XHRcdFx0dGhpcy5xdWVyeVJlc3VsdC5kaXNwb3NhYmxlcy5hZGQodGhpcy5xdWVyeVJlc3VsdC5vbkRpZENoYW5nZU1vZGVsKG1vZGVsID0+IHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnF1ZXJ5UmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucXVlcnlSZXN1bHQubW9kZWwgPSBtb2RlbDtcblx0XHRcdFx0XHRcdFx0dGhpcy51cGRhdGVNb2RlbChtb2RlbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBtb2RlbDtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgUGFnZWRNb2RlbChbXSk7XG5cdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHRcdFx0XHR0aGlzLnNldE1vZGVsKG1vZGVsLCB0aGlzLmdldE1lc3NhZ2UoZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLmxpc3QgPyB0aGlzLmxpc3QubW9kZWwgOiBtb2RlbDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJlcXVlc3QuZmluYWxseSgoKSA9PiB0aGlzLnF1ZXJ5UmVxdWVzdCA9IG51bGwpO1xuXHRcdHRoaXMucXVlcnlSZXF1ZXN0ID0geyBxdWVyeSwgcmVxdWVzdCB9O1xuXHRcdHJldHVybiByZXF1ZXN0O1xuXHR9XG5cblx0Y291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5xdWVyeVJlc3VsdD8ubW9kZWwubGVuZ3RoID8/IDA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgc2hvd0VtcHR5TW9kZWwoKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IGVtcHR5TW9kZWwgPSBuZXcgUGFnZWRNb2RlbChbXSk7XG5cdFx0dGhpcy5zZXRNb2RlbChlbXB0eU1vZGVsKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGVtcHR5TW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBxdWVyeShxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVF1ZXJ5UmVzdWx0PiB7XG5cdFx0Y29uc3QgaWRSZWdleCA9IC9AaWQ6KChbYS16MC05QS1aXVthLXowLTlcXC1BLVpdKilcXC4oW2EtejAtOUEtWl1bYS16MC05XFwtQS1aXSopKS9nO1xuXHRcdGNvbnN0IGlkczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgaWRNYXRjaDtcblx0XHR3aGlsZSAoKGlkTWF0Y2ggPSBpZFJlZ2V4LmV4ZWMocXVlcnkudmFsdWUpKSAhPT0gbnVsbCkge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGlkTWF0Y2hbMV07XG5cdFx0XHRpZHMucHVzaChuYW1lKTtcblx0XHR9XG5cdFx0aWYgKGlkcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5xdWVyeUJ5SWRzKGlkcywgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIHsgbW9kZWwsIGRpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgfTtcblx0XHR9XG5cblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTG9jYWxFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUsIHF1ZXJ5LnNvcnRCeSkpIHtcblx0XHRcdHJldHVybiB0aGlzLnF1ZXJ5TG9jYWwocXVlcnksIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGlmIChFeHRlbnNpb25zTGlzdFZpZXcuaXNTZWFyY2hQb3B1bGFyUXVlcnkocXVlcnkudmFsdWUpKSB7XG5cdFx0XHRxdWVyeS52YWx1ZSA9IHF1ZXJ5LnZhbHVlLnJlcGxhY2UoJ0Bwb3B1bGFyJywgJycpO1xuXHRcdFx0b3B0aW9ucy5zb3J0QnkgPSAhb3B0aW9ucy5zb3J0QnkgPyBHYWxsZXJ5U29ydEJ5Lkluc3RhbGxDb3VudCA6IG9wdGlvbnMuc29ydEJ5O1xuXHRcdH1cblx0XHRlbHNlIGlmIChFeHRlbnNpb25zTGlzdFZpZXcuaXNTZWFyY2hSZWNlbnRseVB1Ymxpc2hlZFF1ZXJ5KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0cXVlcnkudmFsdWUgPSBxdWVyeS52YWx1ZS5yZXBsYWNlKCdAcmVjZW50bHlQdWJsaXNoZWQnLCAnJyk7XG5cdFx0XHRvcHRpb25zLnNvcnRCeSA9ICFvcHRpb25zLnNvcnRCeSA/IEdhbGxlcnlTb3J0QnkuUHVibGlzaGVkRGF0ZSA6IG9wdGlvbnMuc29ydEJ5O1xuXHRcdH1cblxuXHRcdGNvbnN0IGdhbGxlcnlRdWVyeU9wdGlvbnM6IElHYWxsZXJ5UXVlcnlPcHRpb25zID0geyAuLi5vcHRpb25zLCBzb3J0Qnk6IGlzTG9jYWxTb3J0Qnkob3B0aW9ucy5zb3J0QnkpID8gdW5kZWZpbmVkIDogb3B0aW9ucy5zb3J0QnkgfTtcblx0XHRyZXR1cm4gdGhpcy5xdWVyeUdhbGxlcnkocXVlcnksIGdhbGxlcnlRdWVyeU9wdGlvbnMsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcXVlcnlCeUlkcyhpZHM6IHN0cmluZ1tdLCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgaWRzU2V0OiBTZXQ8c3RyaW5nPiA9IGlkcy5yZWR1Y2UoKHJlc3VsdCwgaWQpID0+IHsgcmVzdWx0LmFkZChpZC50b0xvd2VyQ2FzZSgpKTsgcmV0dXJuIHJlc3VsdDsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwodGhpcy5vcHRpb25zLnNlcnZlcikpXG5cdFx0XHQuZmlsdGVyKGUgPT4gaWRzU2V0LmhhcyhlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkpO1xuXG5cdFx0Y29uc3QgZ2FsbGVyeUlkcyA9IHJlc3VsdC5sZW5ndGggPyBpZHMuZmlsdGVyKGlkID0+IHJlc3VsdC5ldmVyeShyID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhyLmlkZW50aWZpZXIsIHsgaWQgfSkpKSA6IGlkcztcblxuXHRcdGlmIChnYWxsZXJ5SWRzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZ2FsbGVyeVJlc3VsdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhnYWxsZXJ5SWRzLm1hcChpZCA9PiAoeyBpZCB9KSksIHsgc291cmNlOiAncXVlcnlCeUlkJyB9LCB0b2tlbik7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5nYWxsZXJ5UmVzdWx0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFBhZ2VkTW9kZWwocmVzdWx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcXVlcnlMb2NhbChxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMpOiBQcm9taXNlPElRdWVyeVJlc3VsdD4ge1xuXHRcdGNvbnN0IGxvY2FsID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUxvY2FsKHRoaXMub3B0aW9ucy5zZXJ2ZXIpO1xuXHRcdGxldCB7IGV4dGVuc2lvbnMsIGNhbkluY2x1ZGVJbnN0YWxsZWRFeHRlbnNpb25zLCBkZXNjcmlwdGlvbiB9ID0gYXdhaXQgdGhpcy5maWx0ZXJMb2NhbChsb2NhbCwgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMsIHF1ZXJ5LCBvcHRpb25zKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZU1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PigpKTtcblxuXHRcdGlmIChjYW5JbmNsdWRlSW5zdGFsbGVkRXh0ZW5zaW9ucykge1xuXHRcdFx0bGV0IGlzRGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gaXNEaXNwb3NlZCA9IHRydWUpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5kZWJvdW5jZShFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlLCBlID0+IGU/LnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQpLFxuXHRcdFx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zXG5cdFx0XHQpLCAoKSA9PiB1bmRlZmluZWQpKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbG9jYWwgPSB0aGlzLm9wdGlvbnMuc2VydmVyID8gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsZWQuZmlsdGVyKGUgPT4gZS5zZXJ2ZXIgPT09IHRoaXMub3B0aW9ucy5zZXJ2ZXIpIDogdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbDtcblx0XHRcdFx0Y29uc3QgeyBleHRlbnNpb25zOiBuZXdFeHRlbnNpb25zIH0gPSBhd2FpdCB0aGlzLmZpbHRlckxvY2FsKGxvY2FsLCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucywgcXVlcnksIG9wdGlvbnMpO1xuXHRcdFx0XHRpZiAoIWlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRjb25zdCBtZXJnZWRFeHRlbnNpb25zID0gdGhpcy5tZXJnZUFkZGVkRXh0ZW5zaW9ucyhleHRlbnNpb25zLCBuZXdFeHRlbnNpb25zKTtcblx0XHRcdFx0XHRpZiAobWVyZ2VkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9ucyA9IG1lcmdlZEV4dGVuc2lvbnM7XG5cdFx0XHRcdFx0XHRvbkRpZENoYW5nZU1vZGVsLmZpcmUobmV3IFBhZ2VkTW9kZWwoZXh0ZW5zaW9ucykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RlbDogbmV3IFBhZ2VkTW9kZWwoZXh0ZW5zaW9ucyksXG5cdFx0XHRtZXNzYWdlOiBkZXNjcmlwdGlvbiA/IHsgdGV4dDogZGVzY3JpcHRpb24sIHNldmVyaXR5OiBTZXZlcml0eS5JbmZvIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZENoYW5nZU1vZGVsOiBvbkRpZENoYW5nZU1vZGVsLmV2ZW50LFxuXHRcdFx0ZGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmaWx0ZXJMb2NhbChsb2NhbDogSUV4dGVuc2lvbltdLCBydW5uaW5nRXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIHF1ZXJ5OiBRdWVyeSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucyk6IFByb21pc2U8eyBleHRlbnNpb25zOiBJRXh0ZW5zaW9uW107IGNhbkluY2x1ZGVJbnN0YWxsZWRFeHRlbnNpb25zOiBib29sZWFuOyBkZXNjcmlwdGlvbj86IHN0cmluZyB9PiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBxdWVyeS52YWx1ZTtcblx0XHRsZXQgZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdID0gW107XG5cdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaW5jbHVkZUJ1aWx0aW4gPSAvQGJ1aWx0aW4vaS50ZXN0KHZhbHVlKTtcblx0XHRjb25zdCBjYW5JbmNsdWRlSW5zdGFsbGVkRXh0ZW5zaW9ucyA9ICFpbmNsdWRlQnVpbHRpbjtcblxuXHRcdGlmICgvQGluc3RhbGxlZC9pLnRlc3QodmFsdWUpKSB7XG5cdFx0XHRleHRlbnNpb25zID0gdGhpcy5maWx0ZXJJbnN0YWxsZWRFeHRlbnNpb25zKGxvY2FsLCBydW5uaW5nRXh0ZW5zaW9ucywgcXVlcnksIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKC9Ab3V0ZGF0ZWQvaS50ZXN0KHZhbHVlKSkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IHRoaXMuZmlsdGVyT3V0ZGF0ZWRFeHRlbnNpb25zKGxvY2FsLCBxdWVyeSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoL0BkaXNhYmxlZC9pLnRlc3QodmFsdWUpKSB7XG5cdFx0XHRleHRlbnNpb25zID0gdGhpcy5maWx0ZXJEaXNhYmxlZEV4dGVuc2lvbnMobG9jYWwsIHJ1bm5pbmdFeHRlbnNpb25zLCBxdWVyeSwgb3B0aW9ucywgaW5jbHVkZUJ1aWx0aW4pO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKC9AZW5hYmxlZC9pLnRlc3QodmFsdWUpKSB7XG5cdFx0XHRleHRlbnNpb25zID0gdGhpcy5maWx0ZXJFbmFibGVkRXh0ZW5zaW9ucyhsb2NhbCwgcnVubmluZ0V4dGVuc2lvbnMsIHF1ZXJ5LCBvcHRpb25zLCBpbmNsdWRlQnVpbHRpbik7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoL0B3b3Jrc3BhY2VVbnN1cHBvcnRlZC9pLnRlc3QodmFsdWUpKSB7XG5cdFx0XHRleHRlbnNpb25zID0gdGhpcy5maWx0ZXJXb3Jrc3BhY2VVbnN1cHBvcnRlZEV4dGVuc2lvbnMobG9jYWwsIHF1ZXJ5LCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmICgvQGRlcHJlY2F0ZWQvaS50ZXN0KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZmlsdGVyRGVwcmVjYXRlZEV4dGVuc2lvbnMobG9jYWwsIHF1ZXJ5LCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmICgvQHJlY2VudGx5VXBkYXRlZC9pLnRlc3QocXVlcnkudmFsdWUpKSB7XG5cdFx0XHRleHRlbnNpb25zID0gdGhpcy5maWx0ZXJSZWNlbnRseVVwZGF0ZWRFeHRlbnNpb25zKGxvY2FsLCBxdWVyeSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoL0ByZXN0YXJ0cmVxdWlyZWQvaS50ZXN0KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IHRoaXMuZmlsdGVyUmVzdGFydFJlcXVpcmVkRXh0ZW5zaW9ucyhsb2NhbCwgcXVlcnksIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKC9AY29udHJpYnV0ZTovaS50ZXN0KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0ZXh0ZW5zaW9ucyA9IHRoaXMuZmlsdGVyRXh0ZW5zaW9uc0J5RmVhdHVyZShsb2NhbCwgcXVlcnkpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGluY2x1ZGVCdWlsdGluKSB7XG5cdFx0XHRleHRlbnNpb25zID0gdGhpcy5maWx0ZXJCdWlsdGluRXh0ZW5zaW9ucyhsb2NhbCwgcXVlcnksIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGV4dGVuc2lvbnMsIGNhbkluY2x1ZGVJbnN0YWxsZWRFeHRlbnNpb25zLCBkZXNjcmlwdGlvbiB9O1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJCdWlsdGluRXh0ZW5zaW9ucyhsb2NhbDogSUV4dGVuc2lvbltdLCBxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMpOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGxldCB7IHZhbHVlLCBpbmNsdWRlZENhdGVnb3JpZXMsIGV4Y2x1ZGVkQ2F0ZWdvcmllcyB9ID0gdGhpcy5wYXJzZUNhdGVnb3JpZXMocXVlcnkudmFsdWUpO1xuXHRcdHZhbHVlID0gdmFsdWUucmVwbGFjZUFsbCgvQGJ1aWx0aW4vZ2ksICcnKS5yZXBsYWNlQWxsKC9Ac29ydDooXFx3KykoLVxcdyopPy9nLCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBsb2NhbFxuXHRcdFx0LmZpbHRlcihlID0+IGUuaXNCdWlsdGluICYmIChlLm5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xIHx8IGUuZGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xKVxuXHRcdFx0XHQmJiB0aGlzLmZpbHRlckV4dGVuc2lvbkJ5Q2F0ZWdvcnkoZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMpKTtcblxuXHRcdHJldHVybiB0aGlzLnNvcnRFeHRlbnNpb25zKHJlc3VsdCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckV4dGVuc2lvbkJ5Q2F0ZWdvcnkoZTogSUV4dGVuc2lvbiwgaW5jbHVkZWRDYXRlZ29yaWVzOiBzdHJpbmdbXSwgZXhjbHVkZWRDYXRlZ29yaWVzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXHRcdGlmICghaW5jbHVkZWRDYXRlZ29yaWVzLmxlbmd0aCAmJiAhZXhjbHVkZWRDYXRlZ29yaWVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChlLmNhdGVnb3JpZXMubGVuZ3RoKSB7XG5cdFx0XHRpZiAoZXhjbHVkZWRDYXRlZ29yaWVzLmxlbmd0aCAmJiBlLmNhdGVnb3JpZXMuc29tZShjYXRlZ29yeSA9PiBleGNsdWRlZENhdGVnb3JpZXMuaW5jbHVkZXMoY2F0ZWdvcnkudG9Mb3dlckNhc2UoKSkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBlLmNhdGVnb3JpZXMuc29tZShjYXRlZ29yeSA9PiBpbmNsdWRlZENhdGVnb3JpZXMuaW5jbHVkZXMoY2F0ZWdvcnkudG9Mb3dlckNhc2UoKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gaW5jbHVkZWRDYXRlZ29yaWVzLmluY2x1ZGVzKE5PTkVfQ0FURUdPUlkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcGFyc2VDYXRlZ29yaWVzKHZhbHVlOiBzdHJpbmcpOiB7IHZhbHVlOiBzdHJpbmc7IGluY2x1ZGVkQ2F0ZWdvcmllczogc3RyaW5nW107IGV4Y2x1ZGVkQ2F0ZWdvcmllczogc3RyaW5nW10gfSB7XG5cdFx0Y29uc3QgaW5jbHVkZWRDYXRlZ29yaWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGV4Y2x1ZGVkQ2F0ZWdvcmllczogc3RyaW5nW10gPSBbXTtcblx0XHR2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoL1xcYmNhdGVnb3J5OihcIihbXlwiXSopXCJ8KFteXCJdXFxTKikpKFxccyt8XFxifCQpL2csIChfLCBxdW90ZWRDYXRlZ29yeSwgY2F0ZWdvcnkpID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gKGNhdGVnb3J5IHx8IHF1b3RlZENhdGVnb3J5IHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0aWYgKGVudHJ5LnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdFx0XHRpZiAoZXhjbHVkZWRDYXRlZ29yaWVzLmluZGV4T2YoZW50cnkpID09PSAtMSkge1xuXHRcdFx0XHRcdGV4Y2x1ZGVkQ2F0ZWdvcmllcy5wdXNoKGVudHJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGluY2x1ZGVkQ2F0ZWdvcmllcy5pbmRleE9mKGVudHJ5KSA9PT0gLTEpIHtcblx0XHRcdFx0XHRpbmNsdWRlZENhdGVnb3JpZXMucHVzaChlbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiAnJztcblx0XHR9KTtcblx0XHRyZXR1cm4geyB2YWx1ZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVySW5zdGFsbGVkRXh0ZW5zaW9ucyhsb2NhbDogSUV4dGVuc2lvbltdLCBydW5uaW5nRXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIHF1ZXJ5OiBRdWVyeSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucyk6IElFeHRlbnNpb25bXSB7XG5cdFx0bGV0IHsgdmFsdWUsIGluY2x1ZGVkQ2F0ZWdvcmllcywgZXhjbHVkZWRDYXRlZ29yaWVzIH0gPSB0aGlzLnBhcnNlQ2F0ZWdvcmllcyhxdWVyeS52YWx1ZSk7XG5cblx0XHR2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoL0BpbnN0YWxsZWQvZywgJycpLnJlcGxhY2UoL0Bzb3J0OihcXHcrKSgtXFx3Kik/L2csICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblxuXHRcdGNvbnN0IG1hdGNoaW5nVGV4dCA9IChlOiBJRXh0ZW5zaW9uKSA9PiAoZS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSB8fCBlLmRpc3BsYXlOYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSB8fCBlLmRlc2NyaXB0aW9uLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSlcblx0XHRcdCYmIHRoaXMuZmlsdGVyRXh0ZW5zaW9uQnlDYXRlZ29yeShlLCBpbmNsdWRlZENhdGVnb3JpZXMsIGV4Y2x1ZGVkQ2F0ZWdvcmllcyk7XG5cdFx0bGV0IHJlc3VsdDtcblxuXHRcdGlmIChvcHRpb25zLnNvcnRCeSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQgPSBsb2NhbC5maWx0ZXIoZSA9PiAhZS5pc0J1aWx0aW4gJiYgbWF0Y2hpbmdUZXh0KGUpKTtcblx0XHRcdHJlc3VsdCA9IHRoaXMuc29ydEV4dGVuc2lvbnMocmVzdWx0LCBvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0ID0gbG9jYWwuZmlsdGVyKGUgPT4gKCFlLmlzQnVpbHRpbiB8fCBlLm91dGRhdGVkIHx8IGUucnVudGltZVN0YXRlICE9PSB1bmRlZmluZWQpICYmIG1hdGNoaW5nVGV4dChlKSk7XG5cdFx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uc0J5SWQgPSBydW5uaW5nRXh0ZW5zaW9ucy5yZWR1Y2UoKHJlc3VsdCwgZSkgPT4geyByZXN1bHQuc2V0KGUuaWRlbnRpZmllci52YWx1ZSwgZSk7IHJldHVybiByZXN1bHQ7IH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPElFeHRlbnNpb25EZXNjcmlwdGlvbj4oKSk7XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRTb3J0ID0gKGUxOiBJRXh0ZW5zaW9uLCBlMjogSUV4dGVuc2lvbikgPT4ge1xuXHRcdFx0XHRjb25zdCBydW5uaW5nMSA9IHJ1bm5pbmdFeHRlbnNpb25zQnlJZC5nZXQoZTEuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdGNvbnN0IGlzRTFSdW5uaW5nID0gISFydW5uaW5nMSAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIodG9FeHRlbnNpb24ocnVubmluZzEpKSA9PT0gZTEuc2VydmVyO1xuXHRcdFx0XHRjb25zdCBydW5uaW5nMiA9IHJ1bm5pbmdFeHRlbnNpb25zQnlJZC5nZXQoZTIuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdGNvbnN0IGlzRTJSdW5uaW5nID0gcnVubmluZzIgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKHRvRXh0ZW5zaW9uKHJ1bm5pbmcyKSkgPT09IGUyLnNlcnZlcjtcblx0XHRcdFx0aWYgKChpc0UxUnVubmluZyAmJiBpc0UyUnVubmluZykpIHtcblx0XHRcdFx0XHRyZXR1cm4gZTEuZGlzcGxheU5hbWUubG9jYWxlQ29tcGFyZShlMi5kaXNwbGF5TmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaXNFMUxhbmd1YWdlUGFja0V4dGVuc2lvbiA9IGUxLmxvY2FsICYmIGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uKGUxLmxvY2FsLm1hbmlmZXN0KTtcblx0XHRcdFx0Y29uc3QgaXNFMkxhbmd1YWdlUGFja0V4dGVuc2lvbiA9IGUyLmxvY2FsICYmIGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uKGUyLmxvY2FsLm1hbmlmZXN0KTtcblx0XHRcdFx0aWYgKCFpc0UxUnVubmluZyAmJiAhaXNFMlJ1bm5pbmcpIHtcblx0XHRcdFx0XHRpZiAoaXNFMUxhbmd1YWdlUGFja0V4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXNFMkxhbmd1YWdlUGFja0V4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBlMS5kaXNwbGF5TmFtZS5sb2NhbGVDb21wYXJlKGUyLmRpc3BsYXlOYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoKGlzRTFSdW5uaW5nICYmIGlzRTJMYW5ndWFnZVBhY2tFeHRlbnNpb24pIHx8IChpc0UyUnVubmluZyAmJiBpc0UxTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uKSkge1xuXHRcdFx0XHRcdHJldHVybiBlMS5kaXNwbGF5TmFtZS5sb2NhbGVDb21wYXJlKGUyLmRpc3BsYXlOYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gaXNFMVJ1bm5pbmcgPyAtMSA6IDE7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBpbmNvbXBhdGlibGU6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgZGVwcmVjYXRlZDogSUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRjb25zdCBvdXRkYXRlZDogSUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRjb25zdCBhY3Rpb25SZXF1aXJlZDogSUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRjb25zdCBub0FjdGlvblJlcXVpcmVkOiBJRXh0ZW5zaW9uW10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBlIG9mIHJlc3VsdCkge1xuXHRcdFx0XHRpZiAoZS5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5SW52YWxpZEV4dGVuc2lvbikge1xuXHRcdFx0XHRcdGluY29tcGF0aWJsZS5wdXNoKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYgKGUuZGVwcmVjYXRpb25JbmZvKSB7XG5cdFx0XHRcdFx0ZGVwcmVjYXRlZC5wdXNoKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYgKGUub3V0ZGF0ZWQgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUoZS5lbmFibGVtZW50U3RhdGUpKSB7XG5cdFx0XHRcdFx0b3V0ZGF0ZWQucHVzaChlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChlLnJ1bnRpbWVTdGF0ZSkge1xuXHRcdFx0XHRcdGFjdGlvblJlcXVpcmVkLnB1c2goZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0bm9BY3Rpb25SZXF1aXJlZC5wdXNoKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdCA9IFtcblx0XHRcdFx0Li4uaW5jb21wYXRpYmxlLnNvcnQoZGVmYXVsdFNvcnQpLFxuXHRcdFx0XHQuLi5kZXByZWNhdGVkLnNvcnQoZGVmYXVsdFNvcnQpLFxuXHRcdFx0XHQuLi5vdXRkYXRlZC5zb3J0KGRlZmF1bHRTb3J0KSxcblx0XHRcdFx0Li4uYWN0aW9uUmVxdWlyZWQuc29ydChkZWZhdWx0U29ydCksXG5cdFx0XHRcdC4uLm5vQWN0aW9uUmVxdWlyZWQuc29ydChkZWZhdWx0U29ydClcblx0XHRcdF07XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlck91dGRhdGVkRXh0ZW5zaW9ucyhsb2NhbDogSUV4dGVuc2lvbltdLCBxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMpOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGxldCB7IHZhbHVlLCBpbmNsdWRlZENhdGVnb3JpZXMsIGV4Y2x1ZGVkQ2F0ZWdvcmllcyB9ID0gdGhpcy5wYXJzZUNhdGVnb3JpZXMocXVlcnkudmFsdWUpO1xuXG5cdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKC9Ab3V0ZGF0ZWQvZywgJycpLnJlcGxhY2UoL0Bzb3J0OihcXHcrKSgtXFx3Kik/L2csICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGxvY2FsXG5cdFx0XHQuc29ydCgoZTEsIGUyKSA9PiBlMS5kaXNwbGF5TmFtZS5sb2NhbGVDb21wYXJlKGUyLmRpc3BsYXlOYW1lKSlcblx0XHRcdC5maWx0ZXIoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5vdXRkYXRlZFxuXHRcdFx0XHQmJiAoZXh0ZW5zaW9uLm5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xIHx8IGV4dGVuc2lvbi5kaXNwbGF5TmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEpXG5cdFx0XHRcdCYmIHRoaXMuZmlsdGVyRXh0ZW5zaW9uQnlDYXRlZ29yeShleHRlbnNpb24sIGluY2x1ZGVkQ2F0ZWdvcmllcywgZXhjbHVkZWRDYXRlZ29yaWVzKSk7XG5cblx0XHRyZXR1cm4gdGhpcy5zb3J0RXh0ZW5zaW9ucyhyZXN1bHQsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJEaXNhYmxlZEV4dGVuc2lvbnMobG9jYWw6IElFeHRlbnNpb25bXSwgcnVubmluZ0V4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLCBxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMsIGluY2x1ZGVCdWlsdGluOiBib29sZWFuKTogSUV4dGVuc2lvbltdIHtcblx0XHRsZXQgeyB2YWx1ZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMgfSA9IHRoaXMucGFyc2VDYXRlZ29yaWVzKHF1ZXJ5LnZhbHVlKTtcblxuXHRcdHZhbHVlID0gdmFsdWUucmVwbGFjZUFsbCgvQGRpc2FibGVkfEBidWlsdGluL2dpLCAnJykucmVwbGFjZUFsbCgvQHNvcnQ6KFxcdyspKC1cXHcqKT8vZywgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0aWYgKGluY2x1ZGVCdWlsdGluKSB7XG5cdFx0XHRsb2NhbCA9IGxvY2FsLmZpbHRlcihlID0+IGUuaXNCdWlsdGluKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gbG9jYWxcblx0XHRcdC5zb3J0KChlMSwgZTIpID0+IGUxLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoZTIuZGlzcGxheU5hbWUpKVxuXHRcdFx0LmZpbHRlcihlID0+IHJ1bm5pbmdFeHRlbnNpb25zLmV2ZXJ5KHIgPT4gIWFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IHIuaWRlbnRpZmllci52YWx1ZSwgdXVpZDogci51dWlkIH0sIGUuaWRlbnRpZmllcikpXG5cdFx0XHRcdCYmIChlLm5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xIHx8IGUuZGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xKVxuXHRcdFx0XHQmJiB0aGlzLmZpbHRlckV4dGVuc2lvbkJ5Q2F0ZWdvcnkoZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMpKTtcblxuXHRcdHJldHVybiB0aGlzLnNvcnRFeHRlbnNpb25zKHJlc3VsdCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckVuYWJsZWRFeHRlbnNpb25zKGxvY2FsOiBJRXh0ZW5zaW9uW10sIHJ1bm5pbmdFeHRlbnNpb25zOiByZWFkb25seSBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgcXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCBpbmNsdWRlQnVpbHRpbjogYm9vbGVhbik6IElFeHRlbnNpb25bXSB7XG5cdFx0bGV0IHsgdmFsdWUsIGluY2x1ZGVkQ2F0ZWdvcmllcywgZXhjbHVkZWRDYXRlZ29yaWVzIH0gPSB0aGlzLnBhcnNlQ2F0ZWdvcmllcyhxdWVyeS52YWx1ZSk7XG5cblx0XHR2YWx1ZSA9IHZhbHVlID8gdmFsdWUucmVwbGFjZUFsbCgvQGVuYWJsZWR8QGJ1aWx0aW4vZ2ksICcnKS5yZXBsYWNlQWxsKC9Ac29ydDooXFx3KykoLVxcdyopPy9nLCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCkgOiAnJztcblxuXHRcdGxvY2FsID0gbG9jYWwuZmlsdGVyKGUgPT4gZS5pc0J1aWx0aW4gPT09IGluY2x1ZGVCdWlsdGluKTtcblx0XHRjb25zdCByZXN1bHQgPSBsb2NhbFxuXHRcdFx0LnNvcnQoKGUxLCBlMikgPT4gZTEuZGlzcGxheU5hbWUubG9jYWxlQ29tcGFyZShlMi5kaXNwbGF5TmFtZSkpXG5cdFx0XHQuZmlsdGVyKGUgPT4gcnVubmluZ0V4dGVuc2lvbnMuc29tZShyID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IHIuaWRlbnRpZmllci52YWx1ZSwgdXVpZDogci51dWlkIH0sIGUuaWRlbnRpZmllcikpXG5cdFx0XHRcdCYmIChlLm5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xIHx8IGUuZGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xKVxuXHRcdFx0XHQmJiB0aGlzLmZpbHRlckV4dGVuc2lvbkJ5Q2F0ZWdvcnkoZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMpKTtcblxuXHRcdHJldHVybiB0aGlzLnNvcnRFeHRlbnNpb25zKHJlc3VsdCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlcldvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9ucyhsb2NhbDogSUV4dGVuc2lvbltdLCBxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMpOiBJRXh0ZW5zaW9uW10ge1xuXHRcdC8vIHNob3dzIGxvY2FsIGV4dGVuc2lvbnMgd2hpY2ggYXJlIHJlc3RyaWN0ZWQgb3IgZGlzYWJsZWQgaW4gdGhlIGN1cnJlbnQgd29ya3NwYWNlIGJlY2F1c2Ugb2YgdGhlIGV4dGVuc2lvbidzIGNhcGFiaWxpdHlcblxuXHRcdGNvbnN0IHF1ZXJ5U3RyaW5nID0gcXVlcnkudmFsdWU7IC8vIEBzb3J0YnkgaXMgYWxyZWFkeSBmaWx0ZXJlZCBvdXRcblxuXHRcdGNvbnN0IG1hdGNoID0gcXVlcnlTdHJpbmcubWF0Y2goL15cXHMqQHdvcmtzcGFjZVVuc3VwcG9ydGVkKD86Oih1bnRydXN0ZWR8dmlydHVhbCkoUGFydGlhbCk/KT8oPzpcXHMrKFteXFxzXSopKT8vaSk7XG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCB0eXBlID0gbWF0Y2hbMV0/LnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgcGFydGlhbCA9ICEhbWF0Y2hbMl07XG5cdFx0Y29uc3QgbmFtZUZpbHRlciA9IG1hdGNoWzNdPy50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0aWYgKG5hbWVGaWx0ZXIpIHtcblx0XHRcdGxvY2FsID0gbG9jYWwuZmlsdGVyKGV4dGVuc2lvbiA9PiBleHRlbnNpb24ubmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YobmFtZUZpbHRlcikgPiAtMSB8fCBleHRlbnNpb24uZGlzcGxheU5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKG5hbWVGaWx0ZXIpID4gLTEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1ZpcnR1YWxTdXBwb3J0VHlwZSA9IChleHRlbnNpb246IElFeHRlbnNpb24sIHN1cHBvcnRUeXBlOiBFeHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlU3VwcG9ydFR5cGUpID0+IHtcblx0XHRcdHJldHVybiBleHRlbnNpb24ubG9jYWwgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmdldEV4dGVuc2lvblZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0VHlwZShleHRlbnNpb24ubG9jYWwubWFuaWZlc3QpID09PSBzdXBwb3J0VHlwZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGFzUmVzdHJpY3RlZFN1cHBvcnRUeXBlID0gKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgc3VwcG9ydFR5cGU6IEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlKSA9PiB7XG5cdFx0XHRpZiAoIWV4dGVuc2lvbi5sb2NhbCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVuYWJsZW1lbnRTdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZ2V0RW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0XHRpZiAoZW5hYmxlbWVudFN0YXRlICE9PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5ICYmIGVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UgJiZcblx0XHRcdFx0ZW5hYmxlbWVudFN0YXRlICE9PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVRydXN0UmVxdWlyZW1lbnQgJiYgZW5hYmxlbWVudFN0YXRlICE9PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbkRlcGVuZGVuY3kpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmdldEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlKGV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkgPT09IHN1cHBvcnRUeXBlKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3VwcG9ydFR5cGUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdGNvbnN0IGRlcGVuZGVuY2llcyA9IGdldEV4dGVuc2lvbkRlcGVuZGVuY2llcyhsb2NhbC5tYXAoZXh0ID0+IGV4dC5sb2NhbCEpLCBleHRlbnNpb24ubG9jYWwpO1xuXHRcdFx0XHRyZXR1cm4gZGVwZW5kZW5jaWVzLnNvbWUoZXh0ID0+IHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZShleHQubWFuaWZlc3QpID09PSBzdXBwb3J0VHlwZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5WaXJ0dWFsV29ya3NwYWNlID0gaXNWaXJ0dWFsV29ya3NwYWNlKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKSk7XG5cdFx0Y29uc3QgaW5SZXN0cmljdGVkV29ya3NwYWNlID0gIXRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKTtcblxuXHRcdGlmICh0eXBlID09PSAndmlydHVhbCcpIHtcblx0XHRcdC8vIHNob3cgbGltaXRlZCBhbmQgZGlzYWJsZWQgZXh0ZW5zaW9ucyB1bmxlc3MgZGlzYWJsZWQgYmVjYXVzZSBvZiBhIHVudHJ1c3RlZCB3b3Jrc3BhY2Vcblx0XHRcdGxvY2FsID0gbG9jYWwuZmlsdGVyKGV4dGVuc2lvbiA9PiBpblZpcnR1YWxXb3Jrc3BhY2UgJiYgaGFzVmlydHVhbFN1cHBvcnRUeXBlKGV4dGVuc2lvbiwgcGFydGlhbCA/ICdsaW1pdGVkJyA6IGZhbHNlKSAmJiAhKGluUmVzdHJpY3RlZFdvcmtzcGFjZSAmJiBoYXNSZXN0cmljdGVkU3VwcG9ydFR5cGUoZXh0ZW5zaW9uLCBmYWxzZSkpKTtcblx0XHR9IGVsc2UgaWYgKHR5cGUgPT09ICd1bnRydXN0ZWQnKSB7XG5cdFx0XHQvLyBzaG93IGxpbWl0ZWQgYW5kIGRpc2FibGVkIGV4dGVuc2lvbnMgdW5sZXNzIGRpc2FibGVkIGJlY2F1c2Ugb2YgYSB2aXJ0dWFsIHdvcmtzcGFjZVxuXHRcdFx0bG9jYWwgPSBsb2NhbC5maWx0ZXIoZXh0ZW5zaW9uID0+IGhhc1Jlc3RyaWN0ZWRTdXBwb3J0VHlwZShleHRlbnNpb24sIHBhcnRpYWwgPyAnbGltaXRlZCcgOiBmYWxzZSkgJiYgIShpblZpcnR1YWxXb3Jrc3BhY2UgJiYgaGFzVmlydHVhbFN1cHBvcnRUeXBlKGV4dGVuc2lvbiwgZmFsc2UpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHNob3cgZXh0ZW5zaW9ucyB0aGF0IGFyZSByZXN0cmljdGVkIG9yIGRpc2FibGVkIGluIHRoZSBjdXJyZW50IHdvcmtzcGFjZVxuXHRcdFx0bG9jYWwgPSBsb2NhbC5maWx0ZXIoZXh0ZW5zaW9uID0+IGluVmlydHVhbFdvcmtzcGFjZSAmJiAhaGFzVmlydHVhbFN1cHBvcnRUeXBlKGV4dGVuc2lvbiwgdHJ1ZSkgfHwgaW5SZXN0cmljdGVkV29ya3NwYWNlICYmICFoYXNSZXN0cmljdGVkU3VwcG9ydFR5cGUoZXh0ZW5zaW9uLCB0cnVlKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnNvcnRFeHRlbnNpb25zKGxvY2FsLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmlsdGVyRGVwcmVjYXRlZEV4dGVuc2lvbnMobG9jYWw6IElFeHRlbnNpb25bXSwgcXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zKTogUHJvbWlzZTxJRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCB2YWx1ZSA9IHF1ZXJ5LnZhbHVlLnJlcGxhY2UoL0BkZXByZWNhdGVkL2csICcnKS5yZXBsYWNlKC9Ac29ydDooXFx3KykoLVxcdyopPy9nLCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdGNvbnN0IGRlcHJlY2F0ZWRFeHRlbnNpb25JZHMgPSBPYmplY3Qua2V5cyhleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0LmRlcHJlY2F0ZWQpO1xuXHRcdGxvY2FsID0gbG9jYWwuZmlsdGVyKGUgPT4gZGVwcmVjYXRlZEV4dGVuc2lvbklkcy5pbmNsdWRlcyhlLmlkZW50aWZpZXIuaWQpICYmICghdmFsdWUgfHwgZS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSB8fCBlLmRpc3BsYXlOYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSkpO1xuXHRcdHJldHVybiB0aGlzLnNvcnRFeHRlbnNpb25zKGxvY2FsLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9ucyhsb2NhbDogSUV4dGVuc2lvbltdLCBxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMpOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGxldCB7IHZhbHVlLCBpbmNsdWRlZENhdGVnb3JpZXMsIGV4Y2x1ZGVkQ2F0ZWdvcmllcyB9ID0gdGhpcy5wYXJzZUNhdGVnb3JpZXMocXVlcnkudmFsdWUpO1xuXHRcdGNvbnN0IGN1cnJlbnRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRsb2NhbCA9IGxvY2FsLmZpbHRlcihlID0+ICFlLmlzQnVpbHRpbiAmJiAhZS5vdXRkYXRlZCAmJiBlLmxvY2FsPy51cGRhdGVkICYmIGUubG9jYWw/Lmluc3RhbGxlZFRpbWVzdGFtcCAhPT0gdW5kZWZpbmVkICYmIGN1cnJlbnRUaW1lIC0gZS5sb2NhbC5pbnN0YWxsZWRUaW1lc3RhbXAgPCBFeHRlbnNpb25zTGlzdFZpZXcuUkVDRU5UX1VQREFURV9EVVJBVElPTik7XG5cblx0XHR2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoL0ByZWNlbnRseVVwZGF0ZWQvZywgJycpLnJlcGxhY2UoL0Bzb3J0OihcXHcrKSgtXFx3Kik/L2csICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGxvY2FsLmZpbHRlcihlID0+XG5cdFx0XHQoZS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSB8fCBlLmRpc3BsYXlOYW1lLnRvTG93ZXJDYXNlKCkuaW5kZXhPZih2YWx1ZSkgPiAtMSlcblx0XHRcdCYmIHRoaXMuZmlsdGVyRXh0ZW5zaW9uQnlDYXRlZ29yeShlLCBpbmNsdWRlZENhdGVnb3JpZXMsIGV4Y2x1ZGVkQ2F0ZWdvcmllcykpO1xuXG5cdFx0b3B0aW9ucy5zb3J0QnkgPSBvcHRpb25zLnNvcnRCeSA/PyBMb2NhbFNvcnRCeS5VcGRhdGVEYXRlO1xuXG5cdFx0cmV0dXJuIHRoaXMuc29ydEV4dGVuc2lvbnMocmVzdWx0LCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyUmVzdGFydFJlcXVpcmVkRXh0ZW5zaW9ucyhsb2NhbDogSUV4dGVuc2lvbltdLCBxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMpOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGxldCB7IHZhbHVlLCBpbmNsdWRlZENhdGVnb3JpZXMsIGV4Y2x1ZGVkQ2F0ZWdvcmllcyB9ID0gdGhpcy5wYXJzZUNhdGVnb3JpZXMocXVlcnkudmFsdWUpO1xuXHRcdGxvY2FsID0gbG9jYWwuZmlsdGVyKGUgPT4gZS5ydW50aW1lU3RhdGUgIT09IHVuZGVmaW5lZCk7XG5cblx0XHR2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoL0ByZXN0YXJ0cmVxdWlyZWQvZ2ksICcnKS5yZXBsYWNlKC9Ac29ydDooXFx3KykoLVxcdyopPy9nLCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBsb2NhbC5maWx0ZXIoZSA9PlxuXHRcdFx0KGUubmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEgfHwgZS5kaXNwbGF5TmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEpXG5cdFx0XHQmJiB0aGlzLmZpbHRlckV4dGVuc2lvbkJ5Q2F0ZWdvcnkoZSwgaW5jbHVkZWRDYXRlZ29yaWVzLCBleGNsdWRlZENhdGVnb3JpZXMpKTtcblxuXHRcdHJldHVybiB0aGlzLnNvcnRFeHRlbnNpb25zKHJlc3VsdCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckV4dGVuc2lvbnNCeUZlYXR1cmUobG9jYWw6IElFeHRlbnNpb25bXSwgcXVlcnk6IFF1ZXJ5KTogSUV4dGVuc2lvbltdIHtcblx0XHRjb25zdCB2YWx1ZSA9IHF1ZXJ5LnZhbHVlLnJlcGxhY2UoL0Bjb250cmlidXRlOi9nLCAnJykudHJpbSgpO1xuXHRcdGNvbnN0IGZlYXR1cmVJZCA9IHZhbHVlLnNwbGl0KCcgJylbMF07XG5cdFx0Y29uc3QgZmVhdHVyZSA9IFJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLmdldEV4dGVuc2lvbkZlYXR1cmUoZmVhdHVyZUlkKTtcblx0XHRpZiAoIWZlYXR1cmUpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uc1ZpZXdTdGF0ZSkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25zVmlld1N0YXRlLmZpbHRlcnMuZmVhdHVyZUlkID0gZmVhdHVyZUlkO1xuXHRcdH1cblx0XHRjb25zdCByZW5kZXJlciA9IGZlYXR1cmUucmVuZGVyZXIgPyB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlPElFeHRlbnNpb25GZWF0dXJlUmVuZGVyZXI+KGZlYXR1cmUucmVuZGVyZXIpIDogdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IFtJRXh0ZW5zaW9uLCBudW1iZXJdW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZSBvZiBsb2NhbCkge1xuXHRcdFx0XHRpZiAoIWUubG9jYWwpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhY2Nlc3NEYXRhID0gdGhpcy5leHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLmdldEFjY2Vzc0RhdGEobmV3IEV4dGVuc2lvbklkZW50aWZpZXIoZS5pZGVudGlmaWVyLmlkKSwgZmVhdHVyZUlkKTtcblx0XHRcdFx0Y29uc3Qgc2hvdWxkUmVuZGVyID0gcmVuZGVyZXI/LnNob3VsZFJlbmRlcihlLmxvY2FsLm1hbmlmZXN0KTtcblx0XHRcdFx0aWYgKGFjY2Vzc0RhdGEgfHwgc2hvdWxkUmVuZGVyKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goW2UsIGFjY2Vzc0RhdGE/LmFjY2Vzc1RpbWVzLmxlbmd0aCA/PyAwXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQuc29ydCgoWywgYV0sIFssIGJdKSA9PiBiIC0gYSkubWFwKChbZV0pID0+IGUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZW5kZXJlcj8uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbWVyZ2VBZGRlZEV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCBuZXdFeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiBJRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG9sZEV4dGVuc2lvbnMgPSBbLi4uZXh0ZW5zaW9uc107XG5cdFx0Y29uc3QgZmluZFByZXZpb3VzRXh0ZW5zaW9uSW5kZXggPSAoZnJvbTogbnVtYmVyKTogbnVtYmVyID0+IHtcblx0XHRcdGxldCBpbmRleCA9IC0xO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNFeHRlbnNpb25Jbk5ldyA9IG5ld0V4dGVuc2lvbnNbZnJvbV07XG5cdFx0XHRpZiAocHJldmlvdXNFeHRlbnNpb25Jbk5ldykge1xuXHRcdFx0XHRpbmRleCA9IG9sZEV4dGVuc2lvbnMuZmluZEluZGV4KGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBwcmV2aW91c0V4dGVuc2lvbkluTmV3LmlkZW50aWZpZXIpKTtcblx0XHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdHJldHVybiBmaW5kUHJldmlvdXNFeHRlbnNpb25JbmRleChmcm9tIC0gMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBpbmRleDtcblx0XHR9O1xuXG5cdFx0bGV0IGhhc0NoYW5nZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgbmV3RXh0ZW5zaW9ucy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IG5ld0V4dGVuc2lvbnNbaW5kZXhdO1xuXHRcdFx0aWYgKGV4dGVuc2lvbnMuZXZlcnkociA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoci5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdGhhc0NoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRleHRlbnNpb25zLnNwbGljZShmaW5kUHJldmlvdXNFeHRlbnNpb25JbmRleChpbmRleCAtIDEpICsgMSwgMCwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gaGFzQ2hhbmdlZCA/IGV4dGVuc2lvbnMgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHF1ZXJ5R2FsbGVyeShxdWVyeTogUXVlcnksIG9wdGlvbnM6IElHYWxsZXJ5UXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElRdWVyeVJlc3VsdD4ge1xuXHRcdGNvbnN0IGhhc1VzZXJEZWZpbmVkU29ydE9yZGVyID0gb3B0aW9ucy5zb3J0QnkgIT09IHVuZGVmaW5lZDtcblx0XHRpZiAoIWhhc1VzZXJEZWZpbmVkU29ydE9yZGVyICYmICFxdWVyeS52YWx1ZS50cmltKCkpIHtcblx0XHRcdG9wdGlvbnMuc29ydEJ5ID0gR2FsbGVyeVNvcnRCeS5JbnN0YWxsQ291bnQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNSZWNvbW1lbmRhdGlvbnNRdWVyeShxdWVyeSkpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5xdWVyeVJlY29tbWVuZGF0aW9ucyhxdWVyeSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIHsgbW9kZWwsIGRpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgfTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0ID0gcXVlcnkudmFsdWU7XG5cblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdG9wdGlvbnMuc291cmNlID0gJ3ZpZXdsZXQnO1xuXHRcdFx0Y29uc3QgcGFnZXIgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5R2FsbGVyeShvcHRpb25zLCB0b2tlbik7XG5cdFx0XHRyZXR1cm4geyBtb2RlbDogbmV3IFBhZ2VkTW9kZWwocGFnZXIpLCBkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpIH07XG5cdFx0fVxuXG5cdFx0aWYgKC9cXGJleHQ6KFteXFxzXSspXFxiL2cudGVzdCh0ZXh0KSkge1xuXHRcdFx0b3B0aW9ucy50ZXh0ID0gdGV4dDtcblx0XHRcdG9wdGlvbnMuc291cmNlID0gJ2ZpbGUtZXh0ZW5zaW9uLXRhZ3MnO1xuXHRcdFx0Y29uc3QgcGFnZXIgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5R2FsbGVyeShvcHRpb25zLCB0b2tlbik7XG5cdFx0XHRyZXR1cm4geyBtb2RlbDogbmV3IFBhZ2VkTW9kZWwocGFnZXIpLCBkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpIH07XG5cdFx0fVxuXG5cdFx0b3B0aW9ucy50ZXh0ID0gdGV4dC5zdWJzdHJpbmcoMCwgMzUwKTtcblx0XHRvcHRpb25zLnNvdXJjZSA9ICdzZWFyY2hUZXh0JztcblxuXHRcdGlmIChoYXNVc2VyRGVmaW5lZFNvcnRPcmRlciB8fCAvXFxiKGNhdGVnb3J5fHRhZyk6KFteXFxzXSspXFxiL2dpLnRlc3QodGV4dCkgfHwgL1xcYmZlYXR1cmVkKFxccyt8XFxifCQpL2dpLnRlc3QodGV4dCkpIHtcblx0XHRcdGNvbnN0IHBhZ2VyID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUdhbGxlcnkob3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIHsgbW9kZWw6IG5ldyBQYWdlZE1vZGVsKHBhZ2VyKSwgZGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBbcGFnZXIsIHByZWZlcnJlZEV4dGVuc2lvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5R2FsbGVyeShvcHRpb25zLCB0b2tlbiksXG5cdFx0XHRcdHRoaXMuZ2V0UHJlZmVycmVkRXh0ZW5zaW9ucyhvcHRpb25zLnRleHQudG9Mb3dlckNhc2UoKSwgdG9rZW4pLmNhdGNoKCgpID0+IFtdKVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gcHJlZmVycmVkRXh0ZW5zaW9ucy5sZW5ndGggPyBuZXcgUHJlZmVycmVkRXh0ZW5zaW9uc1BhZ2VkTW9kZWwocHJlZmVycmVkRXh0ZW5zaW9ucywgcGFnZXIpIDogbmV3IFBhZ2VkTW9kZWwocGFnZXIpO1xuXHRcdFx0cmV0dXJuIHsgbW9kZWwsIGRpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIShlcnJvciBpbnN0YW5jZW9mIEV4dGVuc2lvbkdhbGxlcnlFcnJvcikpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlYXJjaFRleHQgPSBvcHRpb25zLnRleHQudG9Mb3dlckNhc2UoKTtcblx0XHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmlsdGVyKGUgPT4gIWUuaXNCdWlsdGluICYmIChlLm5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHNlYXJjaFRleHQpID4gLTEgfHwgZS5kaXNwbGF5TmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2Yoc2VhcmNoVGV4dCkgPiAtMSB8fCBlLmRlc2NyaXB0aW9uLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihzZWFyY2hUZXh0KSA+IC0xKSk7XG5cdFx0XHRpZiAobG9jYWxFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy5nZXRNZXNzYWdlKGVycm9yKTtcblx0XHRcdFx0cmV0dXJuIHsgbW9kZWw6IG5ldyBQYWdlZE1vZGVsKGxvY2FsRXh0ZW5zaW9ucyksIGRpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksIG1lc3NhZ2U6IHsgdGV4dDogbG9jYWxpemUoJ3Nob3dpbmcgbG9jYWwgZXh0ZW5zaW9ucyBvbmx5JywgXCJ7MH0gU2hvd2luZyBsb2NhbCBleHRlbnNpb25zLlwiLCBtZXNzYWdlLnRleHQpLCBzZXZlcml0eTogbWVzc2FnZS5zZXZlcml0eSB9IH07XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UHJlZmVycmVkRXh0ZW5zaW9ucyhzZWFyY2hUZXh0OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgcHJlZmVycmVkRXh0ZW5zaW9ucyA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmlsdGVyKGUgPT4gIWUuaXNCdWlsdGluICYmIChlLm5hbWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHNlYXJjaFRleHQpID4gLTEgfHwgZS5kaXNwbGF5TmFtZS50b0xvd2VyQ2FzZSgpLmluZGV4T2Yoc2VhcmNoVGV4dCkgPiAtMSB8fCBlLmRlc2NyaXB0aW9uLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihzZWFyY2hUZXh0KSA+IC0xKSk7XG5cdFx0Y29uc3QgcHJlZmVycmVkRXh0ZW5zaW9uVVVJRHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGlmIChwcmVmZXJyZWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0Ly8gVXBkYXRlIGdhbGxlcnkgZGF0YSBmb3IgcHJlZmVycmVkIGV4dGVuc2lvbnMgaWYgdGhleSBhcmUgbm90IHlldCBmZXRjaGVkXG5cdFx0XHRjb25zdCBleHRlc2lvbnNUb0ZldGNoOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBwcmVmZXJyZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGlmIChleHRlbnNpb24uaWRlbnRpZmllci51dWlkKSB7XG5cdFx0XHRcdFx0cHJlZmVycmVkRXh0ZW5zaW9uVVVJRHMuYWRkKGV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uLmdhbGxlcnkgJiYgZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0XHRcdGV4dGVzaW9uc1RvRmV0Y2gucHVzaChleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChleHRlc2lvbnNUb0ZldGNoLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoZXh0ZXNpb25zVG9GZXRjaCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkuY2F0Y2goZSA9PiBudWxsLyppZ25vcmUgZXJyb3IqLyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJlZmVycmVkUmVzdWx0czogc3RyaW5nW10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KG1hbmlmZXN0LnNlYXJjaCkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIG1hbmlmZXN0LnNlYXJjaCkge1xuXHRcdFx0XHRcdGlmIChzLnF1ZXJ5ICYmIHMucXVlcnkudG9Mb3dlckNhc2UoKSA9PT0gc2VhcmNoVGV4dCAmJiBBcnJheS5pc0FycmF5KHMucHJlZmVycmVkUmVzdWx0cykpIHtcblx0XHRcdFx0XHRcdHByZWZlcnJlZFJlc3VsdHMucHVzaCguLi5zLnByZWZlcnJlZFJlc3VsdHMpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJlZmVycmVkUmVzdWx0cy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKHByZWZlcnJlZFJlc3VsdHMubWFwKGlkID0+ICh7IGlkIH0pKSwgdG9rZW4pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiByZXN1bHQpIHtcblx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCAmJiAhcHJlZmVycmVkRXh0ZW5zaW9uVVVJRHMuaGFzKGV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQpKSB7XG5cdFx0XHRcdFx0XHRwcmVmZXJyZWRFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignRmFpbGVkIHRvIGdldCBwcmVmZXJyZWQgcmVzdWx0cyBmcm9tIHRoZSBleHRlbnNpb25zIGNvbnRyb2wgbWFuaWZlc3QuJywgZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByZWZlcnJlZEV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcml2YXRlIHNvcnRFeHRlbnNpb25zKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucyk6IElFeHRlbnNpb25bXSB7XG5cdFx0c3dpdGNoIChvcHRpb25zLnNvcnRCeSkge1xuXHRcdFx0Y2FzZSBHYWxsZXJ5U29ydEJ5Lkluc3RhbGxDb3VudDpcblx0XHRcdFx0ZXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuc29ydCgoZTEsIGUyKSA9PiB0eXBlb2YgZTIuaW5zdGFsbENvdW50ID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgZTEuaW5zdGFsbENvdW50ID09PSAnbnVtYmVyJyA/IGUyLmluc3RhbGxDb3VudCAtIGUxLmluc3RhbGxDb3VudCA6IE5hTik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBMb2NhbFNvcnRCeS5VcGRhdGVEYXRlOlxuXHRcdFx0XHRleHRlbnNpb25zID0gZXh0ZW5zaW9ucy5zb3J0KChlMSwgZTIpID0+XG5cdFx0XHRcdFx0dHlwZW9mIGUyLmxvY2FsPy5pbnN0YWxsZWRUaW1lc3RhbXAgPT09ICdudW1iZXInICYmIHR5cGVvZiBlMS5sb2NhbD8uaW5zdGFsbGVkVGltZXN0YW1wID09PSAnbnVtYmVyJyA/IGUyLmxvY2FsLmluc3RhbGxlZFRpbWVzdGFtcCAtIGUxLmxvY2FsLmluc3RhbGxlZFRpbWVzdGFtcCA6XG5cdFx0XHRcdFx0XHR0eXBlb2YgZTIubG9jYWw/Lmluc3RhbGxlZFRpbWVzdGFtcCA9PT0gJ251bWJlcicgPyAxIDpcblx0XHRcdFx0XHRcdFx0dHlwZW9mIGUxLmxvY2FsPy5pbnN0YWxsZWRUaW1lc3RhbXAgPT09ICdudW1iZXInID8gLTEgOiBOYU4pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR2FsbGVyeVNvcnRCeS5BdmVyYWdlUmF0aW5nOlxuXHRcdFx0Y2FzZSBHYWxsZXJ5U29ydEJ5LldlaWdodGVkUmF0aW5nOlxuXHRcdFx0XHRleHRlbnNpb25zID0gZXh0ZW5zaW9ucy5zb3J0KChlMSwgZTIpID0+IHR5cGVvZiBlMi5yYXRpbmcgPT09ICdudW1iZXInICYmIHR5cGVvZiBlMS5yYXRpbmcgPT09ICdudW1iZXInID8gZTIucmF0aW5nIC0gZTEucmF0aW5nIDogTmFOKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRleHRlbnNpb25zID0gZXh0ZW5zaW9ucy5zb3J0KChlMSwgZTIpID0+IGUxLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoZTIuZGlzcGxheU5hbWUpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnNvcnRPcmRlciA9PT0gU29ydE9yZGVyLkRlc2NlbmRpbmcpIHtcblx0XHRcdGV4dGVuc2lvbnMgPSBleHRlbnNpb25zLnJldmVyc2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcml2YXRlIGlzUmVjb21tZW5kYXRpb25zUXVlcnkocXVlcnk6IFF1ZXJ5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIEV4dGVuc2lvbnNMaXN0Vmlldy5pc1dvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKVxuXHRcdFx0fHwgRXh0ZW5zaW9uc0xpc3RWaWV3LmlzS2V5bWFwc1JlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKVxuXHRcdFx0fHwgRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTGFuZ3VhZ2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeS52YWx1ZSlcblx0XHRcdHx8IEV4dGVuc2lvbnNMaXN0Vmlldy5pc0V4ZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKVxuXHRcdFx0fHwgRXh0ZW5zaW9uc0xpc3RWaWV3LmlzUmVtb3RlUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUpXG5cdFx0XHR8fCAvQHJlY29tbWVuZGVkOmFsbC9pLnRlc3QocXVlcnkudmFsdWUpXG5cdFx0XHR8fCBFeHRlbnNpb25zTGlzdFZpZXcuaXNTZWFyY2hSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeS52YWx1ZSlcblx0XHRcdHx8IEV4dGVuc2lvbnNMaXN0Vmlldy5pc1JlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcXVlcnlSZWNvbW1lbmRhdGlvbnMocXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Ly8gV29ya3NwYWNlIHJlY29tbWVuZGF0aW9uc1xuXHRcdGlmIChFeHRlbnNpb25zTGlzdFZpZXcuaXNXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeS52YWx1ZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFdvcmtzcGFjZVJlY29tbWVuZGF0aW9uc01vZGVsKHF1ZXJ5LCBvcHRpb25zLCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0Ly8gS2V5bWFwIHJlY29tbWVuZGF0aW9uc1xuXHRcdGlmIChFeHRlbnNpb25zTGlzdFZpZXcuaXNLZXltYXBzUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRLZXltYXBSZWNvbW1lbmRhdGlvbnNNb2RlbChxdWVyeSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIExhbmd1YWdlIHJlY29tbWVuZGF0aW9uc1xuXHRcdGlmIChFeHRlbnNpb25zTGlzdFZpZXcuaXNMYW5ndWFnZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0TGFuZ3VhZ2VSZWNvbW1lbmRhdGlvbnNNb2RlbChxdWVyeSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIEV4ZSByZWNvbW1lbmRhdGlvbnNcblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzRXhlUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRFeGVSZWNvbW1lbmRhdGlvbnNNb2RlbChxdWVyeSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIFJlbW90ZSByZWNvbW1lbmRhdGlvbnNcblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzUmVtb3RlUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRSZW1vdGVSZWNvbW1lbmRhdGlvbnNNb2RlbChxdWVyeSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIEFsbCByZWNvbW1lbmRhdGlvbnNcblx0XHRpZiAoL0ByZWNvbW1lbmRlZDphbGwvaS50ZXN0KHF1ZXJ5LnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0QWxsUmVjb21tZW5kYXRpb25zTW9kZWwob3B0aW9ucywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIFNlYXJjaCByZWNvbW1lbmRhdGlvbnNcblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUpIHx8XG5cdFx0XHQoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUpICYmIG9wdGlvbnMuc29ydEJ5ICE9PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZWFyY2hSZWNvbW1lbmRhdGlvbnMocXVlcnksIG9wdGlvbnMsIHRva2VuKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlciByZWNvbW1lbmRhdGlvbnNcblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnkudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRPdGhlclJlY29tbWVuZGF0aW9uc01vZGVsKHF1ZXJ5LCBvcHRpb25zLCB0b2tlbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQYWdlZE1vZGVsKFtdKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRJbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyhyZWNvbW1lbmRhdGlvbnM6IEFycmF5PHN0cmluZyB8IFVSST4sIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRpZiAocmVjb21tZW5kYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCByZXNvdXJjZUV4dGVuc2lvbnM6IFVSSVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHJlY29tbWVuZGF0aW9uIG9mIHJlY29tbWVuZGF0aW9ucykge1xuXHRcdFx0XHRpZiAodHlwZW9mIHJlY29tbWVuZGF0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGdhbGxlcnlFeHRlbnNpb25zLnB1c2gocmVjb21tZW5kYXRpb24pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc291cmNlRXh0ZW5zaW9ucy5wdXNoKHJlY29tbWVuZGF0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGdhbGxlcnlFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoZ2FsbGVyeUV4dGVuc2lvbnMubWFwKGlkID0+ICh7IGlkIH0pKSwgeyBzb3VyY2U6IG9wdGlvbnMuc291cmNlIH0sIHRva2VuKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnkgJiYgIWV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm9cblx0XHRcdFx0XHRcdFx0JiYgYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKGV4dGVuc2lvbi5nYWxsZXJ5KSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRpZiAoIXJlc291cmNlRXh0ZW5zaW9ucy5sZW5ndGggfHwgIXRoaXMuaXNPZmZsaW5lRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChyZXNvdXJjZUV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldFJlc291cmNlRXh0ZW5zaW9ucyhyZXNvdXJjZUV4dGVuc2lvbnMsIHRydWUpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuY2FuSW5zdGFsbChleHRlbnNpb24pID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpOiBQcm9taXNlPEFycmF5PHN0cmluZyB8IFVSST4+IHtcblx0XHRjb25zdCByZWNvbW1lbmRhdGlvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0V29ya3NwYWNlUmVjb21tZW5kYXRpb25zKCk7XG5cdFx0Y29uc3QgeyBpbXBvcnRhbnQgfSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRDb25maWdCYXNlZFJlY29tbWVuZGF0aW9ucygpO1xuXHRcdGZvciAoY29uc3QgY29uZmlnQmFzZWRSZWNvbW1lbmRhdGlvbiBvZiBpbXBvcnRhbnQpIHtcblx0XHRcdGlmICghcmVjb21tZW5kYXRpb25zLmZpbmQoZXh0ZW5zaW9uSWQgPT4gZXh0ZW5zaW9uSWQgPT09IGNvbmZpZ0Jhc2VkUmVjb21tZW5kYXRpb24pKSB7XG5cdFx0XHRcdHJlY29tbWVuZGF0aW9ucy5wdXNoKGNvbmZpZ0Jhc2VkUmVjb21tZW5kYXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVjb21tZW5kYXRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNNb2RlbChxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCByZWNvbW1lbmRhdGlvbnMgPSBhd2FpdCB0aGlzLmdldFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpO1xuXHRcdGNvbnN0IGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zID0gKGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMocmVjb21tZW5kYXRpb25zLCB7IC4uLm9wdGlvbnMsIHNvdXJjZTogJ3JlY29tbWVuZGF0aW9ucy13b3Jrc3BhY2UnIH0sIHRva2VuKSk7XG5cdFx0cmV0dXJuIG5ldyBQYWdlZE1vZGVsKGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0S2V5bWFwUmVjb21tZW5kYXRpb25zTW9kZWwocXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBxdWVyeS52YWx1ZS5yZXBsYWNlKC9AcmVjb21tZW5kZWQ6a2V5bWFwcy9nLCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb25zID0gdGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldEtleW1hcFJlY29tbWVuZGF0aW9ucygpO1xuXHRcdGNvbnN0IGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zID0gKGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMocmVjb21tZW5kYXRpb25zLCB7IC4uLm9wdGlvbnMsIHNvdXJjZTogJ3JlY29tbWVuZGF0aW9ucy1rZXltYXBzJyB9LCB0b2tlbikpXG5cdFx0XHQuZmlsdGVyKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEpO1xuXHRcdHJldHVybiBuZXcgUGFnZWRNb2RlbChpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldExhbmd1YWdlUmVjb21tZW5kYXRpb25zTW9kZWwocXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBxdWVyeS52YWx1ZS5yZXBsYWNlKC9AcmVjb21tZW5kZWQ6bGFuZ3VhZ2VzL2csICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0XHRjb25zdCByZWNvbW1lbmRhdGlvbnMgPSB0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRjb25zdCBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyA9IChhd2FpdCB0aGlzLmdldEluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zKHJlY29tbWVuZGF0aW9ucywgeyAuLi5vcHRpb25zLCBzb3VyY2U6ICdyZWNvbW1lbmRhdGlvbnMtbGFuZ3VhZ2VzJyB9LCB0b2tlbikpXG5cdFx0XHQuZmlsdGVyKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEpO1xuXHRcdHJldHVybiBuZXcgUGFnZWRNb2RlbChpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFJlbW90ZVJlY29tbWVuZGF0aW9uc01vZGVsKHF1ZXJ5OiBRdWVyeSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IHZhbHVlID0gcXVlcnkudmFsdWUucmVwbGFjZSgvQHJlY29tbWVuZGVkOnJlbW90ZXMvZywgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9ucyA9IHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRSZW1vdGVSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRjb25zdCBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyA9IChhd2FpdCB0aGlzLmdldEluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zKHJlY29tbWVuZGF0aW9ucywgeyAuLi5vcHRpb25zLCBzb3VyY2U6ICdyZWNvbW1lbmRhdGlvbnMtcmVtb3RlcycgfSwgdG9rZW4pKVxuXHRcdFx0LmZpbHRlcihleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKS5pbmRleE9mKHZhbHVlKSA+IC0xKTtcblx0XHRyZXR1cm4gbmV3IFBhZ2VkTW9kZWwoaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRFeGVSZWNvbW1lbmRhdGlvbnNNb2RlbChxdWVyeTogUXVlcnksIG9wdGlvbnM6IElRdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCBleGUgPSBxdWVyeS52YWx1ZS5yZXBsYWNlKC9AZXhlOi9nLCAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgeyBpbXBvcnRhbnQsIG90aGVycyB9ID0gYXdhaXQgdGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldEV4ZUJhc2VkUmVjb21tZW5kYXRpb25zKGV4ZS5zdGFydHNXaXRoKCdcIicpID8gZXhlLnN1YnN0cmluZygxLCBleGUubGVuZ3RoIC0gMSkgOiBleGUpO1xuXHRcdGNvbnN0IGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zID0gYXdhaXQgdGhpcy5nZXRJbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyhbLi4uaW1wb3J0YW50LCAuLi5vdGhlcnNdLCB7IC4uLm9wdGlvbnMsIHNvdXJjZTogJ3JlY29tbWVuZGF0aW9ucy1leGUnIH0sIHRva2VuKTtcblx0XHRyZXR1cm4gbmV3IFBhZ2VkTW9kZWwoaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRPdGhlclJlY29tbWVuZGF0aW9uc01vZGVsKHF1ZXJ5OiBRdWVyeSwgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IG90aGVyUmVjb21tZW5kYXRpb25zID0gYXdhaXQgdGhpcy5nZXRPdGhlclJlY29tbWVuZGF0aW9ucygpO1xuXHRcdGNvbnN0IGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zID0gYXdhaXQgdGhpcy5nZXRJbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyhvdGhlclJlY29tbWVuZGF0aW9ucywgeyAuLi5vcHRpb25zLCBzb3VyY2U6ICdyZWNvbW1lbmRhdGlvbnMtb3RoZXInLCBzb3J0Qnk6IHVuZGVmaW5lZCB9LCB0b2tlbik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29hbGVzY2Uob3RoZXJSZWNvbW1lbmRhdGlvbnMubWFwKGlkID0+IGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zLmZpbmQoaSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpLmlkZW50aWZpZXIsIHsgaWQgfSkpKSk7XG5cdFx0cmV0dXJuIG5ldyBQYWdlZE1vZGVsKHJlc3VsdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE90aGVyUmVjb21tZW5kYXRpb25zKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBsb2NhbCA9IChhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwodGhpcy5vcHRpb25zLnNlcnZlcikpXG5cdFx0XHQubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucyA9IChhd2FpdCB0aGlzLmdldFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpKVxuXHRcdFx0Lm1hcChleHRlbnNpb25JZCA9PiBpc1N0cmluZyhleHRlbnNpb25JZCkgPyBleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpIDogZXh0ZW5zaW9uSWQpO1xuXG5cdFx0cmV0dXJuIGRpc3RpbmN0KFxuXHRcdFx0KGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0Ly8gT3JkZXIgaXMgaW1wb3J0YW50XG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnMoKSxcblx0XHRcdFx0dGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldEZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucygpLFxuXHRcdFx0XHR0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0T3RoZXJSZWNvbW1lbmRhdGlvbnMoKVxuXHRcdFx0XSkpLmZsYXQoKS5maWx0ZXIoZXh0ZW5zaW9uSWQgPT4gIWxvY2FsLmluY2x1ZGVzKGV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCkpICYmICF3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMuaW5jbHVkZXMoZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSlcblx0XHRcdCksIGV4dGVuc2lvbklkID0+IGV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCkpO1xuXHR9XG5cblx0Ly8gR2V0IEFsbCB0eXBlcyBvZiByZWNvbW1lbmRhdGlvbnMsIHRyaW1tZWQgdG8gc2hvdyBhIG1heCBvZiA4IGF0IGFueSBnaXZlbiB0aW1lXG5cdHByaXZhdGUgYXN5bmMgZ2V0QWxsUmVjb21tZW5kYXRpb25zTW9kZWwob3B0aW9uczogSVF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UucXVlcnlMb2NhbCh0aGlzLm9wdGlvbnMuc2VydmVyKTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbklkcyA9IGxvY2FsRXh0ZW5zaW9ucy5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cblx0XHRjb25zdCBhbGxSZWNvbW1lbmRhdGlvbnMgPSBkaXN0aW5jdChcblx0XHRcdChhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdC8vIE9yZGVyIGlzIGltcG9ydGFudFxuXHRcdFx0XHR0aGlzLmdldFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpLFxuXHRcdFx0XHR0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0SW1wb3J0YW50UmVjb21tZW5kYXRpb25zKCksXG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRGaWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMoKSxcblx0XHRcdFx0dGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldE90aGVyUmVjb21tZW5kYXRpb25zKClcblx0XHRcdF0pKS5mbGF0KCkuZmlsdGVyKGV4dGVuc2lvbklkID0+IHtcblx0XHRcdFx0aWYgKGlzU3RyaW5nKGV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRcdHJldHVybiAhbG9jYWxFeHRlbnNpb25JZHMuaW5jbHVkZXMoZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuICFsb2NhbEV4dGVuc2lvbnMuc29tZShsb2NhbEV4dGVuc2lvbiA9PiBsb2NhbEV4dGVuc2lvbi5sb2NhbCAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChsb2NhbEV4dGVuc2lvbi5sb2NhbC5sb2NhdGlvbiwgZXh0ZW5zaW9uSWQpKTtcblx0XHRcdH0pKTtcblxuXHRcdGNvbnN0IGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zID0gYXdhaXQgdGhpcy5nZXRJbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyhhbGxSZWNvbW1lbmRhdGlvbnMsIHsgLi4ub3B0aW9ucywgc291cmNlOiAncmVjb21tZW5kYXRpb25zLWFsbCcsIHNvcnRCeTogdW5kZWZpbmVkIH0sIHRva2VuKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSUV4dGVuc2lvbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucy5sZW5ndGggJiYgcmVzdWx0Lmxlbmd0aCA8IDg7IGkrKykge1xuXHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb24gPSBhbGxSZWNvbW1lbmRhdGlvbnNbaV07XG5cdFx0XHRpZiAoaXNTdHJpbmcocmVjb21tZW5kYXRpb24pKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zLmZpbmQoZXh0ZW5zaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbi5pZGVudGlmaWVyLCB7IGlkOiByZWNvbW1lbmRhdGlvbiB9KSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChleHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucy5maW5kKGV4dGVuc2lvbiA9PiBleHRlbnNpb24ucmVzb3VyY2VFeHRlbnNpb24gJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZXh0ZW5zaW9uLnJlc291cmNlRXh0ZW5zaW9uLmxvY2F0aW9uLCByZWNvbW1lbmRhdGlvbikpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUGFnZWRNb2RlbChyZXN1bHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZWFyY2hSZWNvbW1lbmRhdGlvbnMocXVlcnk6IFF1ZXJ5LCBvcHRpb25zOiBJUXVlcnlPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBxdWVyeS52YWx1ZS5yZXBsYWNlKC9AcmVjb21tZW5kZWQvZywgJycpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9ucyA9IGRpc3RpbmN0KFsuLi5hd2FpdCB0aGlzLmdldFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpLCAuLi5hd2FpdCB0aGlzLmdldE90aGVyUmVjb21tZW5kYXRpb25zKCldKTtcblx0XHRjb25zdCBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyA9IChhd2FpdCB0aGlzLmdldEluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zKHJlY29tbWVuZGF0aW9ucywgeyAuLi5vcHRpb25zLCBzb3VyY2U6ICdyZWNvbW1lbmRhdGlvbnMnLCBzb3J0Qnk6IHVuZGVmaW5lZCB9LCB0b2tlbikpXG5cdFx0XHQuZmlsdGVyKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpLmluZGV4T2YodmFsdWUpID4gLTEpO1xuXHRcdHJldHVybiBuZXcgUGFnZWRNb2RlbCh0aGlzLnNvcnRFeHRlbnNpb25zKGluc3RhbGxhYmxlUmVjb21tZW5kYXRpb25zLCBvcHRpb25zKSk7XG5cdH1cblxuXHRwcml2YXRlIHNldE1vZGVsKG1vZGVsOiBJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPiwgbWVzc2FnZT86IE1lc3NhZ2UsIGRvbm90UmVzZXRTY3JvbGxUb3A/OiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMubGlzdCkge1xuXHRcdFx0dGhpcy5saXN0Lm1vZGVsID0gbmV3IERlbGF5ZWRQYWdlZE1vZGVsKG1vZGVsKTtcblx0XHRcdHRoaXMudXBkYXRlQm9keShtZXNzYWdlKTtcblx0XHRcdGlmICghZG9ub3RSZXNldFNjcm9sbFRvcCkge1xuXHRcdFx0XHR0aGlzLmxpc3Quc2Nyb2xsVG9wID0gMDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuYmFkZ2UpIHtcblx0XHRcdHRoaXMuYmFkZ2Uuc2V0Q291bnQodGhpcy5jb3VudCgpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1vZGVsKG1vZGVsOiBJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPikge1xuXHRcdGlmICh0aGlzLmxpc3QpIHtcblx0XHRcdHRoaXMubGlzdC5tb2RlbCA9IG5ldyBEZWxheWVkUGFnZWRNb2RlbChtb2RlbCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUJvZHkoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYmFkZ2UpIHtcblx0XHRcdHRoaXMuYmFkZ2Uuc2V0Q291bnQodGhpcy5jb3VudCgpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUJvZHkobWVzc2FnZT86IE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5ib2R5VGVtcGxhdGUpIHtcblxuXHRcdFx0Y29uc3QgY291bnQgPSB0aGlzLmNvdW50KCk7XG5cdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5leHRlbnNpb25zTGlzdC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBjb3VudCA9PT0gMCk7XG5cdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5tZXNzYWdlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFtZXNzYWdlICYmIGNvdW50ID4gMCk7XG5cblx0XHRcdGlmICh0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0XHRpZiAobWVzc2FnZSkge1xuXHRcdFx0XHRcdHRoaXMuYm9keVRlbXBsYXRlLm1lc3NhZ2VTZXZlcml0eUljb24uY2xhc3NOYW1lID0gU2V2ZXJpdHlJY29uLmNsYXNzTmFtZShtZXNzYWdlLnNldmVyaXR5KTtcblx0XHRcdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5tZXNzYWdlQm94LnRleHRDb250ZW50ID0gbWVzc2FnZS50ZXh0O1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuY291bnQoKSA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuYm9keVRlbXBsYXRlLm1lc3NhZ2VTZXZlcml0eUljb24uY2xhc3NOYW1lID0gJyc7XG5cdFx0XHRcdFx0dGhpcy5ib2R5VGVtcGxhdGUubWVzc2FnZUJveC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdubyBleHRlbnNpb25zIGZvdW5kJywgXCJObyBleHRlbnNpb25zIGZvdW5kLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5ib2R5VGVtcGxhdGUubWVzc2FnZUJveC50ZXh0Q29udGVudCkge1xuXHRcdFx0XHRcdGFsZXJ0KHRoaXMuYm9keVRlbXBsYXRlLm1lc3NhZ2VCb3gudGV4dENvbnRlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1lc3NhZ2UoZXJyb3I6IGFueSk6IE1lc3NhZ2Uge1xuXHRcdGlmICh0aGlzLmlzT2ZmbGluZUVycm9yKGVycm9yKSkge1xuXHRcdFx0cmV0dXJuIHsgdGV4dDogbG9jYWxpemUoJ29mZmxpbmUgZXJyb3InLCBcIlVuYWJsZSB0byBzZWFyY2ggdGhlIE1hcmtldHBsYWNlIHdoZW4gb2ZmbGluZSwgcGxlYXNlIGNoZWNrIHlvdXIgbmV0d29yayBjb25uZWN0aW9uLlwiKSwgc2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHsgdGV4dDogbG9jYWxpemUoJ2Vycm9yJywgXCJFcnJvciB3aGlsZSBmZXRjaGluZyBleHRlbnNpb25zLiB7MH1cIiwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSksIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNPZmZsaW5lRXJyb3IoZXJyb3I6IEVycm9yKTogYm9vbGVhbiB7XG5cdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uR2FsbGVyeUVycm9yKSB7XG5cdFx0XHRyZXR1cm4gZXJyb3IuY29kZSA9PT0gRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5PZmZsaW5lO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNPZmZsaW5lRXJyb3IoZXJyb3IpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZVNpemUoKSB7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5mbGV4aWJsZUhlaWdodCkge1xuXHRcdFx0dGhpcy5tYXhpbXVtQm9keVNpemUgPSB0aGlzLmxpc3Q/Lm1vZGVsLmxlbmd0aCA/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSA6IDA7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGAke3RoaXMuaWR9LnNpemVgLCB0aGlzLmxpc3Q/Lm1vZGVsLmxlbmd0aCB8fCAwLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHRpZiAodGhpcy5xdWVyeVJlcXVlc3QpIHtcblx0XHRcdHRoaXMucXVlcnlSZXF1ZXN0LnJlcXVlc3QuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLnF1ZXJ5UmVxdWVzdCA9IG51bGw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnF1ZXJ5UmVzdWx0KSB7XG5cdFx0XHR0aGlzLnF1ZXJ5UmVzdWx0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMucXVlcnlSZXN1bHQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMubGlzdCA9IG51bGw7XG5cdH1cblxuXHRzdGF0aWMgaXNMb2NhbEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nLCBzb3J0Qnk/OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pc0luc3RhbGxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeSlcblx0XHRcdHx8IHRoaXMuaXNTZWFyY2hJbnN0YWxsZWRFeHRlbnNpb25zUXVlcnkocXVlcnkpXG5cdFx0XHR8fCB0aGlzLmlzT3V0ZGF0ZWRFeHRlbnNpb25zUXVlcnkocXVlcnkpXG5cdFx0XHR8fCB0aGlzLmlzRW5hYmxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeSlcblx0XHRcdHx8IHRoaXMuaXNEaXNhYmxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeSlcblx0XHRcdHx8IHRoaXMuaXNCdWlsdEluRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KVxuXHRcdFx0fHwgdGhpcy5pc1NlYXJjaEJ1aWx0SW5FeHRlbnNpb25zUXVlcnkocXVlcnkpXG5cdFx0XHR8fCB0aGlzLmlzQnVpbHRJbkdyb3VwRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KVxuXHRcdFx0fHwgdGhpcy5pc1NlYXJjaERlcHJlY2F0ZWRFeHRlbnNpb25zUXVlcnkocXVlcnkpXG5cdFx0XHR8fCB0aGlzLmlzU2VhcmNoV29ya3NwYWNlVW5zdXBwb3J0ZWRFeHRlbnNpb25zUXVlcnkocXVlcnkpXG5cdFx0XHR8fCB0aGlzLmlzU2VhcmNoUmVjZW50bHlVcGRhdGVkUXVlcnkocXVlcnkpXG5cdFx0XHR8fCB0aGlzLmlzUmVzdGFydFJlcXVpcmVkUXVlcnkocXVlcnkpXG5cdFx0XHR8fCB0aGlzLmlzU2VhcmNoRXh0ZW5zaW9uVXBkYXRlc1F1ZXJ5KHF1ZXJ5KVxuXHRcdFx0fHwgdGhpcy5pc1NvcnRJbnN0YWxsZWRFeHRlbnNpb25zUXVlcnkocXVlcnksIHNvcnRCeSlcblx0XHRcdHx8IHRoaXMuaXNGZWF0dXJlRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc1NlYXJjaEJ1aWx0SW5FeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvQGJ1aWx0aW5cXHMuK3wuK1xcc0BidWlsdGluL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNCdWlsdEluRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL15AYnVpbHRpbiQvaS50ZXN0KHF1ZXJ5LnRyaW0oKSk7XG5cdH1cblxuXHRzdGF0aWMgaXNCdWlsdEluR3JvdXBFeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvXkBidWlsdGluOi4rJC9pLnRlc3QocXVlcnkudHJpbSgpKTtcblx0fVxuXG5cdHN0YXRpYyBpc1NlYXJjaFdvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL15cXHMqQHdvcmtzcGFjZVVuc3VwcG9ydGVkKDoodW50cnVzdGVkfHZpcnR1YWwpKFBhcnRpYWwpPyk/KFxcc3wkKS9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzSW5zdGFsbGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0BpbnN0YWxsZWQkL2kudGVzdChxdWVyeSkgJiYgIS9AbWNwL2kudGVzdChxdWVyeSkgJiYgIS9AYWdlbnRQbHVnaW5zL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNTZWFyY2hJbnN0YWxsZWRFeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoL0BpbnN0YWxsZWRcXHMuL2kudGVzdChxdWVyeSkgJiYgIS9AbWNwL2kudGVzdChxdWVyeSkgJiYgIS9AYWdlbnRQbHVnaW5zL2kudGVzdChxdWVyeSkpIHx8IHRoaXMuaXNGZWF0dXJlRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc091dGRhdGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0BvdXRkYXRlZC9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzRW5hYmxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIC9AZW5hYmxlZC9pLnRlc3QocXVlcnkpICYmICEvQGJ1aWx0aW4vaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc0Rpc2FibGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0BkaXNhYmxlZC9pLnRlc3QocXVlcnkpICYmICEvQGJ1aWx0aW4vaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc1NlYXJjaERlcHJlY2F0ZWRFeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvQGRlcHJlY2F0ZWRcXHM/LiovaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc1JlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL15AcmVjb21tZW5kZWQkL2kudGVzdChxdWVyeS50cmltKCkpO1xuXHR9XG5cblx0c3RhdGljIGlzU2VhcmNoUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvQHJlY29tbWVuZGVkXFxzLisvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc1dvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0ByZWNvbW1lbmRlZDp3b3Jrc3BhY2UvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc0V4ZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0BleGU6LisvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc1JlbW90ZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0ByZWNvbW1lbmRlZDpyZW1vdGVzL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNLZXltYXBzUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvQHJlY29tbWVuZGVkOmtleW1hcHMvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc0xhbmd1YWdlUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvQHJlY29tbWVuZGVkOmxhbmd1YWdlcy9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzU29ydEluc3RhbGxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeTogc3RyaW5nLCBzb3J0Qnk/OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHNvcnRCeSAhPT0gdW5kZWZpbmVkICYmIHNvcnRCeSAhPT0gJycgJiYgcXVlcnkgPT09ICcnKSB8fCAoIXNvcnRCeSAmJiAvXkBzb3J0OlxcUyokL2kudGVzdChxdWVyeSkpO1xuXHR9XG5cblx0c3RhdGljIGlzU2VhcmNoUG9wdWxhclF1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0Bwb3B1bGFyL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNTZWFyY2hSZWNlbnRseVB1Ymxpc2hlZFF1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0ByZWNlbnRseVB1Ymxpc2hlZC9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzU2VhcmNoUmVjZW50bHlVcGRhdGVkUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvQHJlY2VudGx5VXBkYXRlZC9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzUmVzdGFydFJlcXVpcmVkUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvQHJlc3RhcnRyZXF1aXJlZC9pLnRlc3QocXVlcnkpO1xuXHR9XG5cblx0c3RhdGljIGlzU2VhcmNoRXh0ZW5zaW9uVXBkYXRlc1F1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0B1cGRhdGVzL2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRzdGF0aWMgaXNTb3J0VXBkYXRlRGF0ZVF1ZXJ5KHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL0Bzb3J0OnVwZGF0ZURhdGUvaS50ZXN0KHF1ZXJ5KTtcblx0fVxuXG5cdHN0YXRpYyBpc0ZlYXR1cmVFeHRlbnNpb25zUXVlcnkocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvQGNvbnRyaWJ1dGU6L2kudGVzdChxdWVyeSk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdGlmICghdGhpcy5saXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCEodGhpcy5saXN0LmdldEZvY3VzKCkubGVuZ3RoIHx8IHRoaXMubGlzdC5nZXRTZWxlY3Rpb24oKS5sZW5ndGgpKSB7XG5cdFx0XHR0aGlzLmxpc3QuZm9jdXNOZXh0KCk7XG5cdFx0fVxuXHRcdHRoaXMubGlzdC5kb21Gb2N1cygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0UG9wdWxhckV4dGVuc2lvbnNWaWV3IGV4dGVuZHMgRXh0ZW5zaW9uc0xpc3RWaWV3IHtcblxuXHRvdmVycmlkZSBhc3luYyBzaG93KCk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCBxdWVyeSA9IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiAhdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgIXRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciA/ICdAd2ViJyA6ICcnO1xuXHRcdHJldHVybiBzdXBlci5zaG93KHF1ZXJ5KTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBTZXJ2ZXJJbnN0YWxsZWRFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdHF1ZXJ5ID0gcXVlcnkgPyBxdWVyeSA6ICdAaW5zdGFsbGVkJztcblx0XHRpZiAoIUV4dGVuc2lvbnNMaXN0Vmlldy5pc0xvY2FsRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KSB8fCBFeHRlbnNpb25zTGlzdFZpZXcuaXNTb3J0SW5zdGFsbGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KSkge1xuXHRcdFx0cXVlcnkgPSBxdWVyeSArPSAnIEBpbnN0YWxsZWQnO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuc2hvdyhxdWVyeS50cmltKCkpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEVuYWJsZWRFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdHF1ZXJ5ID0gcXVlcnkgfHwgJ0BlbmFibGVkJztcblx0XHRyZXR1cm4gRXh0ZW5zaW9uc0xpc3RWaWV3LmlzRW5hYmxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeSkgPyBzdXBlci5zaG93KHF1ZXJ5KSA6XG5cdFx0XHRFeHRlbnNpb25zTGlzdFZpZXcuaXNTb3J0SW5zdGFsbGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KSA/IHN1cGVyLnNob3coJ0BlbmFibGVkICcgKyBxdWVyeSkgOiB0aGlzLnNob3dFbXB0eU1vZGVsKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc2FibGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXG5cdG92ZXJyaWRlIGFzeW5jIHNob3cocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRxdWVyeSA9IHF1ZXJ5IHx8ICdAZGlzYWJsZWQnO1xuXHRcdHJldHVybiBFeHRlbnNpb25zTGlzdFZpZXcuaXNEaXNhYmxlZEV4dGVuc2lvbnNRdWVyeShxdWVyeSkgPyBzdXBlci5zaG93KHF1ZXJ5KSA6XG5cdFx0XHRFeHRlbnNpb25zTGlzdFZpZXcuaXNTb3J0SW5zdGFsbGVkRXh0ZW5zaW9uc1F1ZXJ5KHF1ZXJ5KSA/IHN1cGVyLnNob3coJ0BkaXNhYmxlZCAnICsgcXVlcnkpIDogdGhpcy5zaG93RW1wdHlNb2RlbCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPdXRkYXRlZEV4dGVuc2lvbnNWaWV3IGV4dGVuZHMgRXh0ZW5zaW9uc0xpc3RWaWV3IHtcblxuXHRvdmVycmlkZSBhc3luYyBzaG93KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0cXVlcnkgPSBxdWVyeSA/IHF1ZXJ5IDogJ0BvdXRkYXRlZCc7XG5cdFx0aWYgKEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NlYXJjaEV4dGVuc2lvblVwZGF0ZXNRdWVyeShxdWVyeSkpIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkucmVwbGFjZSgnQHVwZGF0ZXMnLCAnQG91dGRhdGVkJyk7XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5zaG93KHF1ZXJ5LnRyaW0oKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlU2l6ZSgpIHtcblx0XHRzdXBlci51cGRhdGVTaXplKCk7XG5cdFx0dGhpcy5zZXRFeHBhbmRlZCh0aGlzLmNvdW50KCkgPiAwKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBSZWNlbnRseVVwZGF0ZWRFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdHF1ZXJ5ID0gcXVlcnkgPyBxdWVyeSA6ICdAcmVjZW50bHlVcGRhdGVkJztcblx0XHRpZiAoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoRXh0ZW5zaW9uVXBkYXRlc1F1ZXJ5KHF1ZXJ5KSkge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS5yZXBsYWNlKCdAdXBkYXRlcycsICdAcmVjZW50bHlVcGRhdGVkJyk7XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5zaG93KHF1ZXJ5LnRyaW0oKSk7XG5cdH1cblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0YXRpY1F1ZXJ5RXh0ZW5zaW9uc1ZpZXdPcHRpb25zIGV4dGVuZHMgRXh0ZW5zaW9uc0xpc3RWaWV3T3B0aW9ucyB7XG5cdHJlYWRvbmx5IHF1ZXJ5OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTdGF0aWNRdWVyeUV4dGVuc2lvbnNWaWV3IGV4dGVuZHMgRXh0ZW5zaW9uc0xpc3RWaWV3IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkgb3B0aW9uczogU3RhdGljUXVlcnlFeHRlbnNpb25zVmlld09wdGlvbnMsXG5cdFx0dmlld2xldFZpZXdPcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZTogSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Ugd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCB2aWV3bGV0Vmlld09wdGlvbnMsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsXG5cdFx0XHRleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgaG92ZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dFNlcnZpY2UsIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSwgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIHdvcmtzcGFjZVNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBleHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdFx0dXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3coKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdHJldHVybiBzdXBlci5zaG93KHRoaXMub3B0aW9ucy5xdWVyeSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9TcGVjaWZpY1dvcmtzcGFjZVVuc3VwcG9ydGVkUXVlcnkocXVlcnk6IHN0cmluZywgcXVhbGlmaWVyOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIXF1ZXJ5KSB7XG5cdFx0cmV0dXJuICdAd29ya3NwYWNlVW5zdXBwb3J0ZWQ6JyArIHF1YWxpZmllcjtcblx0fVxuXHRjb25zdCBtYXRjaCA9IHF1ZXJ5Lm1hdGNoKG5ldyBSZWdFeHAoYEB3b3Jrc3BhY2VVbnN1cHBvcnRlZCg6JHtxdWFsaWZpZXJ9KT8oXFxcXHN8JClgLCAnaScpKTtcblx0aWYgKG1hdGNoKSB7XG5cdFx0aWYgKCFtYXRjaFsxXSkge1xuXHRcdFx0cmV0dXJuIHF1ZXJ5LnJlcGxhY2UoL0B3b3Jrc3BhY2VVbnN1cHBvcnRlZC9naSwgJ0B3b3Jrc3BhY2VVbnN1cHBvcnRlZDonICsgcXVhbGlmaWVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHF1ZXJ5O1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cblxuZXhwb3J0IGNsYXNzIFVudHJ1c3RlZFdvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXHRvdmVycmlkZSBhc3luYyBzaG93KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgdXBkYXRlZFF1ZXJ5ID0gdG9TcGVjaWZpY1dvcmtzcGFjZVVuc3VwcG9ydGVkUXVlcnkocXVlcnksICd1bnRydXN0ZWQnKTtcblx0XHRyZXR1cm4gdXBkYXRlZFF1ZXJ5ID8gc3VwZXIuc2hvdyh1cGRhdGVkUXVlcnkpIDogdGhpcy5zaG93RW1wdHlNb2RlbCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbnRydXN0ZWRXb3Jrc3BhY2VQYXJ0aWFsbHlTdXBwb3J0ZWRFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cdG92ZXJyaWRlIGFzeW5jIHNob3cocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCB1cGRhdGVkUXVlcnkgPSB0b1NwZWNpZmljV29ya3NwYWNlVW5zdXBwb3J0ZWRRdWVyeShxdWVyeSwgJ3VudHJ1c3RlZFBhcnRpYWwnKTtcblx0XHRyZXR1cm4gdXBkYXRlZFF1ZXJ5ID8gc3VwZXIuc2hvdyh1cGRhdGVkUXVlcnkpIDogdGhpcy5zaG93RW1wdHlNb2RlbCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBWaXJ0dWFsV29ya3NwYWNlVW5zdXBwb3J0ZWRFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cdG92ZXJyaWRlIGFzeW5jIHNob3cocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRjb25zdCB1cGRhdGVkUXVlcnkgPSB0b1NwZWNpZmljV29ya3NwYWNlVW5zdXBwb3J0ZWRRdWVyeShxdWVyeSwgJ3ZpcnR1YWwnKTtcblx0XHRyZXR1cm4gdXBkYXRlZFF1ZXJ5ID8gc3VwZXIuc2hvdyh1cGRhdGVkUXVlcnkpIDogdGhpcy5zaG93RW1wdHlNb2RlbCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBWaXJ0dWFsV29ya3NwYWNlUGFydGlhbGx5U3VwcG9ydGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcge1xuXHRvdmVycmlkZSBhc3luYyBzaG93KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgdXBkYXRlZFF1ZXJ5ID0gdG9TcGVjaWZpY1dvcmtzcGFjZVVuc3VwcG9ydGVkUXVlcnkocXVlcnksICd2aXJ0dWFsUGFydGlhbCcpO1xuXHRcdHJldHVybiB1cGRhdGVkUXVlcnkgPyBzdXBlci5zaG93KHVwZGF0ZWRRdWVyeSkgOiB0aGlzLnNob3dFbXB0eU1vZGVsKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlcHJlY2F0ZWRFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cdG92ZXJyaWRlIGFzeW5jIHNob3cocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4+IHtcblx0XHRyZXR1cm4gRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoRGVwcmVjYXRlZEV4dGVuc2lvbnNRdWVyeShxdWVyeSkgPyBzdXBlci5zaG93KHF1ZXJ5KSA6IHRoaXMuc2hvd0VtcHR5TW9kZWwoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZXBvcnRTZWFyY2hGaW5pc2hlZERlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcigyMDAwKSk7XG5cdHByaXZhdGUgc2VhcmNoV2FpdFByb21pc2U6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRvdmVycmlkZSBhc3luYyBzaG93KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3QgcXVlcnlQcm9taXNlID0gc3VwZXIuc2hvdyhxdWVyeSk7XG5cdFx0dGhpcy5yZXBvcnRTZWFyY2hGaW5pc2hlZERlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLnJlcG9ydFNlYXJjaEZpbmlzaGVkKCkpO1xuXHRcdHRoaXMuc2VhcmNoV2FpdFByb21pc2UgPSBxdWVyeVByb21pc2UudGhlbihudWxsLCBudWxsKTtcblx0XHRyZXR1cm4gcXVlcnlQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXBvcnRTZWFyY2hGaW5pc2hlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnNlYXJjaFdhaXRQcm9taXNlO1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyKCdleHRlbnNpb25zVmlldzpNYXJrZXRwbGFjZVNlYXJjaEZpbmlzaGVkJyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlZmF1bHRSZWNvbW1lbmRlZEV4dGVuc2lvbnNWaWV3IGV4dGVuZHMgRXh0ZW5zaW9uc0xpc3RWaWV3IHtcblx0cHJpdmF0ZSByZWFkb25seSByZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeSA9ICdAcmVjb21tZW5kZWQ6YWxsJztcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVjb21tZW5kYXRpb25zKCgpID0+IHtcblx0XHRcdHRoaXMuc2hvdygnJyk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdGlmIChxdWVyeSAmJiBxdWVyeS50cmltKCkgIT09IHRoaXMucmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkpIHtcblx0XHRcdHJldHVybiB0aGlzLnNob3dFbXB0eU1vZGVsKCk7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgc3VwZXIuc2hvdyh0aGlzLnJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KTtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuc29tZShlID0+ICFlLmlzQnVpbHRpbikpIHtcblx0XHRcdC8vIFRoaXMgaXMgcGFydCBvZiBwb3B1bGFyIGV4dGVuc2lvbnMgdmlldy4gQ29sbGFwc2UgaWYgbm8gaW5zdGFsbGVkIGV4dGVuc2lvbnMuXG5cdFx0XHR0aGlzLnNldEV4cGFuZGVkKG1vZGVsLmxlbmd0aCA+IDApO1xuXHRcdH1cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgUmVjb21tZW5kZWRFeHRlbnNpb25zVmlldyBleHRlbmRzIEV4dGVuc2lvbnNMaXN0VmlldyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkgPSAnQHJlY29tbWVuZGVkJztcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVjb21tZW5kYXRpb25zKCgpID0+IHtcblx0XHRcdHRoaXMuc2hvdygnJyk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPj4ge1xuXHRcdHJldHVybiAocXVlcnkgJiYgcXVlcnkudHJpbSgpICE9PSB0aGlzLnJlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KSA/IHRoaXMuc2hvd0VtcHR5TW9kZWwoKSA6IHN1cGVyLnNob3codGhpcy5yZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXcgZXh0ZW5kcyBFeHRlbnNpb25zTGlzdFZpZXcgaW1wbGVtZW50cyBJV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zVmlldyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkgPSAnQHJlY29tbWVuZGVkOndvcmtzcGFjZSc7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5vbkRpZENoYW5nZVJlY29tbWVuZGF0aW9ucygoKSA9PiB0aGlzLnNob3codGhpcy5yZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKCkgPT4gdGhpcy5zaG93KHRoaXMucmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkpKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzaG93KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElQYWdlZE1vZGVsPElFeHRlbnNpb24+PiB7XG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0VtcHR5VmlldyA9IHF1ZXJ5ICYmIHF1ZXJ5LnRyaW0oKSAhPT0gJ0ByZWNvbW1lbmRlZCcgJiYgcXVlcnkudHJpbSgpICE9PSAnQHJlY29tbWVuZGVkOndvcmtzcGFjZSc7XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCAoc2hvdWxkU2hvd0VtcHR5VmlldyA/IHRoaXMuc2hvd0VtcHR5TW9kZWwoKSA6IHN1cGVyLnNob3codGhpcy5yZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeSkpO1xuXHRcdHRoaXMuc2V0RXhwYW5kZWQobW9kZWwubGVuZ3RoID4gMCk7XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRJbnN0YWxsYWJsZVdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZCA9IChhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwoKSlcblx0XHRcdC5maWx0ZXIobCA9PiBsLmVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25LaW5kKTsgLy8gRmlsdGVyIGV4dGVuc2lvbnMgZGlzYWJsZWQgYnkga2luZFxuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9ucyA9IChhd2FpdCB0aGlzLmdldFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpKVxuXHRcdFx0LmZpbHRlcihyZWNvbW1lbmRhdGlvbiA9PiBpbnN0YWxsZWQuZXZlcnkobG9jYWwgPT4gaXNTdHJpbmcocmVjb21tZW5kYXRpb24pID8gIWFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IHJlY29tbWVuZGF0aW9uIH0sIGxvY2FsLmlkZW50aWZpZXIpIDogIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHJlY29tbWVuZGF0aW9uLCBsb2NhbC5sb2NhbD8ubG9jYXRpb24pKSk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0SW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMocmVjb21tZW5kYXRpb25zLCB7IHNvdXJjZTogJ2luc3RhbGwtYWxsLXdvcmtzcGFjZS1yZWNvbW1lbmRhdGlvbnMnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbnN0YWxsYWJsZVJlY29tbWVuZGF0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0SW5zdGFsbGFibGVXb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRpZiAoaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9uczogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VFeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgcmVjb21tZW5kYXRpb24gb2YgaW5zdGFsbGFibGVSZWNvbW1lbmRhdGlvbnMpIHtcblx0XHRcdFx0aWYgKHJlY29tbWVuZGF0aW9uLmdhbGxlcnkpIHtcblx0XHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9ucy5wdXNoKHsgZXh0ZW5zaW9uOiByZWNvbW1lbmRhdGlvbi5nYWxsZXJ5LCBvcHRpb25zOiB7fSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvdXJjZUV4dGVuc2lvbnMucHVzaChyZWNvbW1lbmRhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZ2FsbGVyeUV4dGVuc2lvbnMpLFxuXHRcdFx0XHQuLi5yZXNvdXJjZUV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwoZXh0ZW5zaW9uKSlcblx0XHRcdF0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdubyBsb2NhbCBleHRlbnNpb25zJywgXCJUaGVyZSBhcmUgbm8gZXh0ZW5zaW9ucyB0byBpbnN0YWxsLlwiKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFByZWZlcnJlZEV4dGVuc2lvbnNQYWdlZE1vZGVsIGltcGxlbWVudHMgSVBhZ2VkTW9kZWw8SUV4dGVuc2lvbj4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVzb2x2ZWQgPSBuZXcgTWFwPG51bWJlciwgSUV4dGVuc2lvbj4oKTtcblx0cHJpdmF0ZSBwcmVmZXJyZWRHYWxsZXJ5RXh0ZW5zaW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlc29sdmVkR2FsbGVyeUV4dGVuc2lvbnNGcm9tUXVlcnk6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBhZ2VzOiBBcnJheTx7XG5cdFx0cHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IG51bGw7XG5cdFx0Y3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IG51bGw7XG5cdFx0cHJvbWlzZUluZGV4ZXM6IFNldDxudW1iZXI+O1xuXHR9PjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbGVuZ3RoOiBudW1iZXI7XG5cblx0Z2V0IG9uRGlkSW5jcmVtZW50TGVuZ3RoKCk6IEV2ZW50PG51bWJlcj4ge1xuXHRcdHJldHVybiBFdmVudC5Ob25lO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcmVmZXJyZWRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYWdlcjogSVBhZ2VyPElFeHRlbnNpb24+LFxuXHQpIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucHJlZmVycmVkRXh0ZW5zaW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5yZXNvbHZlZC5zZXQoaSwgdGhpcy5wcmVmZXJyZWRFeHRlbnNpb25zW2ldKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGUgb2YgcHJlZmVycmVkRXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGUuaWRlbnRpZmllci51dWlkKSB7XG5cdFx0XHRcdHRoaXMucHJlZmVycmVkR2FsbGVyeUV4dGVuc2lvbnMuYWRkKGUuaWRlbnRpZmllci51dWlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBleHBlY3RlZCB0aGF0IGFsbCBwcmVmZXJyZWQgZ2FsbGVyeSBleHRlbnNpb25zIHdpbGwgYmUgcGFydCBvZiB0aGUgcXVlcnkgcmVzdWx0c1xuXHRcdHRoaXMubGVuZ3RoID0gKHByZWZlcnJlZEV4dGVuc2lvbnMubGVuZ3RoIC0gdGhpcy5wcmVmZXJyZWRHYWxsZXJ5RXh0ZW5zaW9ucy5zaXplKSArIHRoaXMucGFnZXIudG90YWw7XG5cblx0XHRjb25zdCB0b3RhbFBhZ2VzID0gTWF0aC5jZWlsKHRoaXMucGFnZXIudG90YWwgLyB0aGlzLnBhZ2VyLnBhZ2VTaXplKTtcblx0XHR0aGlzLnBvcHVsYXRlUmVzb2x2ZWRFeHRlbnNpb25zKDAsIHRoaXMucGFnZXIuZmlyc3RQYWdlKTtcblx0XHR0aGlzLnBhZ2VzID0gcmFuZ2UodG90YWxQYWdlcyAtIDEpLm1hcCgoKSA9PiAoe1xuXHRcdFx0cHJvbWlzZTogbnVsbCxcblx0XHRcdGN0czogbnVsbCxcblx0XHRcdHByb21pc2VJbmRleGVzOiBuZXcgU2V0PG51bWJlcj4oKSxcblx0XHR9KSk7XG5cdH1cblxuXHRpc1Jlc29sdmVkKGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlZC5oYXMoaW5kZXgpO1xuXHR9XG5cblx0Z2V0KGluZGV4OiBudW1iZXIpOiBJRXh0ZW5zaW9uIHtcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlZC5nZXQoaW5kZXgpITtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmUoaW5kZXg6IG51bWJlciwgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRXh0ZW5zaW9uPiB7XG5cdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1Jlc29sdmVkKGluZGV4KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0KGluZGV4KTtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleEluUGFnZWRNb2RlbCA9IGluZGV4IC0gdGhpcy5wcmVmZXJyZWRFeHRlbnNpb25zLmxlbmd0aCArIHRoaXMucmVzb2x2ZWRHYWxsZXJ5RXh0ZW5zaW9uc0Zyb21RdWVyeS5sZW5ndGg7XG5cdFx0Y29uc3QgcGFnZUluZGV4ID0gTWF0aC5mbG9vcihpbmRleEluUGFnZWRNb2RlbCAvIHRoaXMucGFnZXIucGFnZVNpemUpO1xuXHRcdC8vIHBhZ2VzIGFycmF5IGV4Y2x1ZGVzIHBhZ2UgMCAocHJlLXJlc29sdmVkIHZpYSBmaXJzdFBhZ2UpLCBzbyBhZGp1c3QgaW5kZXhcblx0XHRjb25zdCBwYWdlID0gdGhpcy5wYWdlc1twYWdlSW5kZXggLSAxXTtcblxuXHRcdGlmICghcGFnZS5wcm9taXNlKSB7XG5cdFx0XHRwYWdlLmN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0cGFnZS5wcm9taXNlID0gdGhpcy5wYWdlci5nZXRQYWdlKHBhZ2VJbmRleCwgcGFnZS5jdHMudG9rZW4pXG5cdFx0XHRcdC50aGVuKGV4dGVuc2lvbnMgPT4gdGhpcy5wb3B1bGF0ZVJlc29sdmVkRXh0ZW5zaW9ucyhwYWdlSW5kZXgsIGV4dGVuc2lvbnMpKVxuXHRcdFx0XHQuY2F0Y2goZSA9PiB7IHBhZ2UucHJvbWlzZSA9IG51bGw7IHRocm93IGU7IH0pXG5cdFx0XHRcdC5maW5hbGx5KCgpID0+IHBhZ2UuY3RzID0gbnVsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBjYW5jZWxsYXRpb25Ub2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRpZiAoIXBhZ2UuY3RzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHBhZ2UucHJvbWlzZUluZGV4ZXMuZGVsZXRlKGluZGV4KTtcblx0XHRcdGlmIChwYWdlLnByb21pc2VJbmRleGVzLnNpemUgPT09IDApIHtcblx0XHRcdFx0cGFnZS5jdHMuY2FuY2VsKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRwYWdlLnByb21pc2VJbmRleGVzLmFkZChpbmRleCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcGFnZS5wcm9taXNlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0KGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgcG9wdWxhdGVSZXNvbHZlZEV4dGVuc2lvbnMocGFnZUluZGV4OiBudW1iZXIsIGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSk6IHZvaWQge1xuXHRcdGxldCBhZGp1c3RJbmRleE9mTmV4dFBhZ2VzQnkgPSAwO1xuXHRcdGNvbnN0IHBhZ2VTdGFydEluZGV4ID0gcGFnZUluZGV4ICogdGhpcy5wYWdlci5wYWdlU2l6ZTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGV4dGVuc2lvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGUgPSBleHRlbnNpb25zW2ldO1xuXHRcdFx0aWYgKGUuZ2FsbGVyeT8uaWRlbnRpZmllci51dWlkICYmIHRoaXMucHJlZmVycmVkR2FsbGVyeUV4dGVuc2lvbnMuaGFzKGUuZ2FsbGVyeS5pZGVudGlmaWVyLnV1aWQpKSB7XG5cdFx0XHRcdHRoaXMucmVzb2x2ZWRHYWxsZXJ5RXh0ZW5zaW9uc0Zyb21RdWVyeS5wdXNoKGUpO1xuXHRcdFx0XHRhZGp1c3RJbmRleE9mTmV4dFBhZ2VzQnkrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucmVzb2x2ZWQuc2V0KHRoaXMucHJlZmVycmVkRXh0ZW5zaW9ucy5sZW5ndGggLSB0aGlzLnJlc29sdmVkR2FsbGVyeUV4dGVuc2lvbnNGcm9tUXVlcnkubGVuZ3RoICsgcGFnZVN0YXJ0SW5kZXggKyBpLCBlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gSWYgdGhpcyBwYWdlIGhhcyBwcmVmZXJyZWQgZ2FsbGVyeSBleHRlbnNpb25zLCB0aGVuIGFkanVzdCB0aGUgaW5kZXggb2YgdGhlIG5leHQgcGFnZXNcblx0XHQvLyBieSB0aGUgbnVtYmVyIG9mIHByZWZlcnJlZCBnYWxsZXJ5IGV4dGVuc2lvbnMgZm91bmQgaW4gdGhpcyBwYWdlLiBCZWNhdXNlIHRoZXNlIHByZWZlcnJlZCBleHRlbnNpb25zXG5cdFx0Ly8gYXJlIGFscmVhZHkgaW4gdGhlIHJlc29sdmVkIGxpc3QgYW5kIHNpbmNlIHdlIGRpZCBub3QgYWRkIHRoZW0gbm93LCB3ZSBuZWVkIHRvIGFkanVzdCB0aGUgaW5kaWNlcyBvZiB0aGUgbmV4dCBwYWdlcy5cblx0XHQvLyBTa2lwIGZpcnN0IHBhZ2UgYXMgdGhlIHByZWZlcnJlZCBleHRlbnNpb25zIGFyZSBhbHdheXMgaW4gdGhlIGZpcnN0IHBhZ2Vcblx0XHRpZiAocGFnZUluZGV4ICE9PSAwICYmIGFkanVzdEluZGV4T2ZOZXh0UGFnZXNCeSkge1xuXHRcdFx0Y29uc3QgbmV4dFBhZ2VTdGFydEluZGV4ID0gKHBhZ2VJbmRleCArIDEpICogdGhpcy5wYWdlci5wYWdlU2l6ZTtcblx0XHRcdGNvbnN0IGluZGljZXMgPSBbLi4udGhpcy5yZXNvbHZlZC5rZXlzKCldLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblx0XHRcdGZvciAoY29uc3QgaW5kZXggb2YgaW5kaWNlcykge1xuXHRcdFx0XHRpZiAoaW5kZXggPj0gbmV4dFBhZ2VTdGFydEluZGV4KSB7XG5cdFx0XHRcdFx0Y29uc3QgZSA9IHRoaXMucmVzb2x2ZWQuZ2V0KGluZGV4KTtcblx0XHRcdFx0XHRpZiAoZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5yZXNvbHZlZC5kZWxldGUoaW5kZXgpO1xuXHRcdFx0XHRcdFx0dGhpcy5yZXNvbHZlZC5zZXQoaW5kZXggLSBhZGp1c3RJbmRleE9mTmV4dFBhZ2VzQnksIGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLHFCQUFxQixpQkFBaUIseUJBQXlCO0FBQ3hFLFNBQVMsWUFBeUIseUJBQWlDO0FBQ25FLFNBQVMsV0FBa0QsVUFBVSxlQUFxQywyQkFBMkIsNkJBQTZCO0FBQ2xLLFNBQXFDLG1DQUFtQyxpQkFBaUIsc0NBQXNDLDRDQUE0QztBQUMzSyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLG1CQUFtQixnQ0FBZ0M7QUFDNUQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxRQUFRLFNBQVM7QUFDMUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkIsZ0JBQWtELG1DQUF3RTtBQUNoSyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQkFBbUIsbUJBQW1CO0FBQy9DLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLFVB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QUcsQ0FBQztBQUFBLE1BQzNIO0FBQUEsSUFDRDtBQUtBLFFBQUksY0FBYyxLQUFLLDBCQUEwQjtBQUNoRCxZQUFNLHNCQUFzQixZQUFZLEtBQUssS0FBSyxNQUFNO0FBQ3hELFlBQU0sVUFBVSxDQUFDLEdBQUcsS0FBSyxTQUFTLEtBQUssQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDO0FBQzlELGlCQUFXLFNBQVMsU0FBUztBQUM1QixZQUFJLFNBQVMsb0JBQW9CO0FBQ2hDLGdCQUFNLElBQUksS0FBSyxTQUFTLElBQUksS0FBSztBQUNqQyxjQUFJLEdBQUc7QUFDTixpQkFBSyxTQUFTLE9BQU8sS0FBSztBQUMxQixpQkFBSyxTQUFTLElBQUksUUFBUSwwQkFBMEIsQ0FBQztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJMb2NhbFNvcnRCeSIsICJtb2RlbCIsICJyZXN1bHQiLCAibG9jYWwiLCAiZXh0ZW5zaW9uIl0KfQo=
