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
import { distinct } from "../../../base/common/arrays.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import * as semver from "../../../base/common/semver/semver.js";
import { CancellationError, getErrorMessage, isCancellationError } from "../../../base/common/errors.js";
import { isWeb, platform } from "../../../base/common/platform.js";
import { arch } from "../../../base/common/process.js";
import { isBoolean, isNumber, isString } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { isOfflineError } from "../../../base/parts/request/common/request.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { getTargetPlatform, InstallOperation, isNotWebExtensionInWebTargetPlatform, isTargetPlatformCompatible, SortOrder, toTargetPlatform, WEB_EXTENSION_TAG, ExtensionGalleryError, ExtensionGalleryErrorCode, IAllowedExtensionsService, EXTENSION_IDENTIFIER_REGEX, SortBy, FilterType, ExtensionRequestsTimeoutConfigKey } from "./extensionManagement.js";
import { adoptToGalleryExtensionId, areSameExtensions, getGalleryExtensionId, getGalleryExtensionTelemetryData } from "./extensionManagementUtil.js";
import { TargetPlatform } from "../../extensions/common/extensions.js";
import { isEngineValid } from "../../extensions/common/extensionValidator.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { asJson, asTextOrError, IRequestService, isClientError, isServerError, isSuccess } from "../../request/common/request.js";
import { resolveMarketplaceHeaders } from "../../externalServices/common/marketplace.js";
import { IStorageService } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { format2 } from "../../../base/common/strings.js";
import { ExtensionGalleryResourceType, Flag, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifestService, ExtensionGalleryManifestStatus } from "./extensionGalleryManifest.js";
import { TelemetryTrustedValue } from "../../telemetry/common/telemetryUtils.js";
const CURRENT_TARGET_PLATFORM = isWeb ? TargetPlatform.WEB : getTargetPlatform(platform, arch);
const SEARCH_ACTIVITY_HEADER_NAME = "X-Market-Search-Activity-Id";
const ACTIVITY_HEADER_NAME = "Activityid";
const SERVER_HEADER_NAME = "Server";
const END_END_ID_HEADER_NAME = "X-Vss-E2eid";
const AssetType = {
  Icon: "Microsoft.VisualStudio.Services.Icons.Default",
  Details: "Microsoft.VisualStudio.Services.Content.Details",
  Changelog: "Microsoft.VisualStudio.Services.Content.Changelog",
  Manifest: "Microsoft.VisualStudio.Code.Manifest",
  VSIX: "Microsoft.VisualStudio.Services.VSIXPackage",
  License: "Microsoft.VisualStudio.Services.Content.License",
  Repository: "Microsoft.VisualStudio.Services.Links.Source",
  Signature: "Microsoft.VisualStudio.Services.VsixSignature"
};
const PropertyType = {
  Dependency: "Microsoft.VisualStudio.Code.ExtensionDependencies",
  ExtensionPack: "Microsoft.VisualStudio.Code.ExtensionPack",
  Engine: "Microsoft.VisualStudio.Code.Engine",
  PreRelease: "Microsoft.VisualStudio.Code.PreRelease",
  EnabledApiProposals: "Microsoft.VisualStudio.Code.EnabledApiProposals",
  LocalizedLanguages: "Microsoft.VisualStudio.Code.LocalizedLanguages",
  WebExtension: "Microsoft.VisualStudio.Code.WebExtension",
  SponsorLink: "Microsoft.VisualStudio.Code.SponsorLink",
  SupportLink: "Microsoft.VisualStudio.Services.Links.Support",
  ExecutesCode: "Microsoft.VisualStudio.Code.ExecutesCode",
  Private: "PrivateMarketplace"
};
const DefaultPageSize = 10;
const DefaultQueryState = {
  pageNumber: 1,
  pageSize: DefaultPageSize,
  sortBy: SortBy.NoneOrRelevance,
  sortOrder: SortOrder.Default,
  flags: [],
  criteria: [],
  assetTypes: []
};
var VersionKind = /* @__PURE__ */ ((VersionKind2) => {
  VersionKind2[VersionKind2["Release"] = 0] = "Release";
  VersionKind2[VersionKind2["Prerelease"] = 1] = "Prerelease";
  VersionKind2[VersionKind2["Latest"] = 2] = "Latest";
  return VersionKind2;
})(VersionKind || {});
class Query {
  constructor(state = DefaultQueryState) {
    this.state = state;
  }
  get pageNumber() {
    return this.state.pageNumber;
  }
  get pageSize() {
    return this.state.pageSize;
  }
  get sortBy() {
    return this.state.sortBy;
  }
  get sortOrder() {
    return this.state.sortOrder;
  }
  get flags() {
    return this.state.flags;
  }
  get criteria() {
    return this.state.criteria;
  }
  get assetTypes() {
    return this.state.assetTypes;
  }
  get source() {
    return this.state.source;
  }
  get searchText() {
    const criterium = this.state.criteria.filter((criterium2) => criterium2.filterType === FilterType.SearchText)[0];
    return criterium && criterium.value ? criterium.value : "";
  }
  withPage(pageNumber, pageSize = this.state.pageSize) {
    return new Query({ ...this.state, pageNumber, pageSize });
  }
  withFilter(filterType, ...values) {
    const criteria = [
      ...this.state.criteria,
      ...values.length ? values.map((value) => ({ filterType, value })) : [{ filterType }]
    ];
    return new Query({ ...this.state, criteria });
  }
  withSortBy(sortBy) {
    return new Query({ ...this.state, sortBy });
  }
  withSortOrder(sortOrder) {
    return new Query({ ...this.state, sortOrder });
  }
  withFlags(...flags) {
    return new Query({ ...this.state, flags: distinct(flags) });
  }
  withAssetTypes(...assetTypes) {
    return new Query({ ...this.state, assetTypes });
  }
  withSource(source) {
    return new Query({ ...this.state, source });
  }
}
function getStatistic(statistics, name) {
  const result = (statistics || []).filter((s) => s.statisticName === name)[0];
  return result ? result.value : 0;
}
function getCoreTranslationAssets(version) {
  const coreTranslationAssetPrefix = "Microsoft.VisualStudio.Code.Translation.";
  const result = version.files.filter((f) => f.assetType.indexOf(coreTranslationAssetPrefix) === 0);
  return result.reduce((result2, file) => {
    const asset = getVersionAsset(version, file.assetType);
    if (asset) {
      result2.push([file.assetType.substring(coreTranslationAssetPrefix.length), asset]);
    }
    return result2;
  }, []);
}
function getRepositoryAsset(version) {
  if (version.properties) {
    const results = version.properties.filter((p) => p.key === AssetType.Repository);
    const gitRegExp = new RegExp("((git|ssh|http(s)?)|(git@[\\w.]+))(:(//)?)([\\w.@:/\\-~]+)(.git)(/)?");
    const uri = results.filter((r) => gitRegExp.test(r.value))[0];
    return uri ? { uri: uri.value, fallbackUri: uri.value } : null;
  }
  return getVersionAsset(version, AssetType.Repository);
}
function getDownloadAsset(version) {
  return {
    // always use fallbackAssetUri for download asset to hit the Marketplace API so that downloads are counted
    uri: `${version.fallbackAssetUri}/${AssetType.VSIX}?redirect=true${version.targetPlatform ? `&targetPlatform=${version.targetPlatform}` : ""}`,
    fallbackUri: `${version.fallbackAssetUri}/${AssetType.VSIX}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ""}`
  };
}
function getVersionAsset(version, type) {
  const result = version.files.filter((f) => f.assetType === type)[0];
  return result ? {
    uri: `${version.assetUri}/${type}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ""}`,
    fallbackUri: `${version.fallbackAssetUri}/${type}${version.targetPlatform ? `?targetPlatform=${version.targetPlatform}` : ""}`
  } : null;
}
function getExtensions(version, property) {
  const values = version.properties ? version.properties.filter((p) => p.key === property) : [];
  const value = values.length > 0 && values[0].value;
  return value ? value.split(",").map((v) => adoptToGalleryExtensionId(v)) : [];
}
function getEngine(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.Engine) : [];
  return values.length > 0 && values[0].value || "";
}
function setEngine(version, engine) {
  version.properties = version.properties ?? [];
  version.properties.push({ key: PropertyType.Engine, value: engine });
}
function isPreReleaseVersion(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.PreRelease) : [];
  return values.length > 0 && values[0].value === "true";
}
function hasPreReleaseForExtension(id, productService) {
  return productService.extensionProperties?.[id.toLowerCase()]?.hasPrereleaseVersion;
}
function getExcludeVersionRangeForExtension(id, productService) {
  return productService.extensionProperties?.[id.toLowerCase()]?.excludeVersionRange;
}
function isPrivateExtension(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.Private) : [];
  return values.length > 0 && values[0].value === "true";
}
function executesCode(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.ExecutesCode) : [];
  return values.length > 0 ? values[0].value === "true" : void 0;
}
function getEnabledApiProposals(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.EnabledApiProposals) : [];
  const value = values.length > 0 && values[0].value || "";
  return value ? value.split(",") : [];
}
function getLocalizedLanguages(version) {
  const values = version.properties ? version.properties.filter((p) => p.key === PropertyType.LocalizedLanguages) : [];
  const value = values.length > 0 && values[0].value || "";
  return value ? value.split(",") : [];
}
function getSponsorLink(version) {
  return version.properties?.find((p) => p.key === PropertyType.SponsorLink)?.value;
}
function getSupportLink(version) {
  return version.properties?.find((p) => p.key === PropertyType.SupportLink)?.value;
}
function getIsPreview(flags) {
  return flags.indexOf("preview") !== -1;
}
function getTargetPlatformForExtensionVersion(version) {
  return version.targetPlatform ? toTargetPlatform(version.targetPlatform) : TargetPlatform.UNDEFINED;
}
function getAllTargetPlatforms(rawGalleryExtension) {
  const allTargetPlatforms = distinct(rawGalleryExtension.versions.map(getTargetPlatformForExtensionVersion));
  const isWebExtension = !!rawGalleryExtension.tags?.includes(WEB_EXTENSION_TAG);
  const webTargetPlatformIndex = allTargetPlatforms.indexOf(TargetPlatform.WEB);
  if (isWebExtension) {
    if (webTargetPlatformIndex === -1) {
      allTargetPlatforms.push(TargetPlatform.WEB);
    }
  } else {
    if (webTargetPlatformIndex !== -1) {
      allTargetPlatforms.splice(webTargetPlatformIndex, 1);
    }
  }
  return allTargetPlatforms;
}
function sortExtensionVersions(versions, preferredTargetPlatform) {
  for (let index = 0; index < versions.length; index++) {
    const version = versions[index];
    if (version.version === versions[index - 1]?.version) {
      let insertionIndex = index;
      const versionTargetPlatform = getTargetPlatformForExtensionVersion(version);
      if (versionTargetPlatform === preferredTargetPlatform) {
        while (insertionIndex > 0 && versions[insertionIndex - 1].version === version.version) {
          insertionIndex--;
        }
      }
      if (insertionIndex !== index) {
        versions.splice(index, 1);
        versions.splice(insertionIndex, 0, version);
      }
    }
  }
  return versions;
}
function filterLatestExtensionVersionsForTargetPlatform(versions, targetPlatform, allTargetPlatforms) {
  const latestVersions = [];
  let preReleaseVersionIndex = -1;
  let releaseVersionIndex = -1;
  for (const version of versions) {
    const versionTargetPlatform = getTargetPlatformForExtensionVersion(version);
    const isCompatibleWithTargetPlatform = isTargetPlatformCompatible(versionTargetPlatform, allTargetPlatforms, targetPlatform);
    if (!isCompatibleWithTargetPlatform) {
      latestVersions.push(version);
      continue;
    }
    if (isPreReleaseVersion(version)) {
      if (preReleaseVersionIndex === -1) {
        preReleaseVersionIndex = latestVersions.length;
        latestVersions.push(version);
      } else if (versionTargetPlatform === targetPlatform && latestVersions[preReleaseVersionIndex].version === version.version) {
        latestVersions[preReleaseVersionIndex] = version;
      }
    } else {
      if (releaseVersionIndex === -1) {
        releaseVersionIndex = latestVersions.length;
        latestVersions.push(version);
      } else if (versionTargetPlatform === targetPlatform && latestVersions[releaseVersionIndex].version === version.version) {
        latestVersions[releaseVersionIndex] = version;
      }
    }
  }
  return latestVersions;
}
function setTelemetry(extension, index, querySource) {
  extension.telemetryData = { index, querySource, queryActivityId: extension.queryContext?.[SEARCH_ACTIVITY_HEADER_NAME] };
}
function toExtension(galleryExtension, version, allTargetPlatforms, extensionGalleryManifest, productService, queryContext) {
  const latestVersion = galleryExtension.versions[0];
  const assets = {
    manifest: getVersionAsset(version, AssetType.Manifest),
    readme: getVersionAsset(version, AssetType.Details),
    changelog: getVersionAsset(version, AssetType.Changelog),
    license: getVersionAsset(version, AssetType.License),
    repository: getRepositoryAsset(version),
    download: getDownloadAsset(version),
    icon: getVersionAsset(version, AssetType.Icon),
    signature: getVersionAsset(version, AssetType.Signature),
    coreTranslations: getCoreTranslationAssets(version)
  };
  const detailsViewUri = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, galleryExtension.linkType ?? ExtensionGalleryResourceType.ExtensionDetailsViewUri);
  const publisherViewUri = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, galleryExtension.publisher.linkType ?? ExtensionGalleryResourceType.PublisherViewUri);
  const ratingViewUri = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, galleryExtension.ratingLinkType ?? ExtensionGalleryResourceType.ExtensionRatingViewUri);
  const id = getGalleryExtensionId(galleryExtension.publisher.publisherName, galleryExtension.extensionName);
  return {
    type: "gallery",
    identifier: {
      id,
      uuid: galleryExtension.extensionId
    },
    name: galleryExtension.extensionName,
    version: version.version,
    displayName: galleryExtension.displayName,
    publisherId: galleryExtension.publisher.publisherId,
    publisher: galleryExtension.publisher.publisherName,
    publisherDisplayName: galleryExtension.publisher.displayName,
    publisherDomain: galleryExtension.publisher.domain ? { link: galleryExtension.publisher.domain, verified: !!galleryExtension.publisher.isDomainVerified } : void 0,
    publisherSponsorLink: getSponsorLink(latestVersion),
    description: galleryExtension.shortDescription ?? "",
    installCount: getStatistic(galleryExtension.statistics, "install"),
    rating: getStatistic(galleryExtension.statistics, "averagerating"),
    ratingCount: getStatistic(galleryExtension.statistics, "ratingcount"),
    categories: galleryExtension.categories || [],
    tags: galleryExtension.tags || [],
    releaseDate: Date.parse(galleryExtension.releaseDate),
    lastUpdated: Date.parse(galleryExtension.lastUpdated),
    allTargetPlatforms,
    assets,
    properties: {
      dependencies: getExtensions(version, PropertyType.Dependency),
      extensionPack: getExtensions(version, PropertyType.ExtensionPack),
      engine: getEngine(version),
      enabledApiProposals: getEnabledApiProposals(version),
      localizedLanguages: getLocalizedLanguages(version),
      targetPlatform: getTargetPlatformForExtensionVersion(version),
      isPreReleaseVersion: isPreReleaseVersion(version),
      executesCode: executesCode(version)
    },
    hasPreReleaseVersion: hasPreReleaseForExtension(id, productService) ?? isPreReleaseVersion(latestVersion),
    hasReleaseVersion: true,
    private: isPrivateExtension(latestVersion),
    preview: getIsPreview(galleryExtension.flags),
    isSigned: !!assets.signature,
    queryContext,
    supportLink: getSupportLink(latestVersion),
    detailsLink: detailsViewUri ? format2(detailsViewUri, { publisher: galleryExtension.publisher.publisherName, name: galleryExtension.extensionName }) : void 0,
    publisherLink: publisherViewUri ? format2(publisherViewUri, { publisher: galleryExtension.publisher.publisherName }) : void 0,
    ratingLink: ratingViewUri ? format2(ratingViewUri, { publisher: galleryExtension.publisher.publisherName, name: galleryExtension.extensionName }) : void 0
  };
}
let AbstractExtensionGalleryService = class {
  constructor(storageService, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService) {
    this.requestService = requestService;
    this.logService = logService;
    this.environmentService = environmentService;
    this.telemetryService = telemetryService;
    this.fileService = fileService;
    this.productService = productService;
    this.configurationService = configurationService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.extensionsControlUrl = productService.extensionsGallery?.controlUrl;
    this.unpkgResourceApi = productService.extensionsGallery?.extensionUrlTemplate;
    this.commonHeadersPromise = resolveMarketplaceHeaders(
      productService.version,
      productService,
      this.environmentService,
      this.configurationService,
      this.fileService,
      storageService,
      this.telemetryService
    );
  }
  isEnabled() {
    return this.extensionGalleryManifestService.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.Available;
  }
  async getExtensions(extensionInfos, arg1, arg2) {
    const extensionGalleryManifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
    if (!extensionGalleryManifest) {
      throw new Error("No extension gallery service configured.");
    }
    const options = CancellationToken.isCancellationToken(arg1) ? {} : arg1;
    const token = CancellationToken.isCancellationToken(arg1) ? arg1 : arg2;
    const resourceApi = this.getResourceApi(extensionGalleryManifest);
    const result = resourceApi ? await this.getExtensionsUsingResourceApi(extensionInfos, options, resourceApi, extensionGalleryManifest, token) : await this.getExtensionsUsingQueryApi(extensionInfos, options, extensionGalleryManifest, token);
    const uuids = result.map((r) => r.identifier.uuid);
    const extensionInfosByName = [];
    for (const e of extensionInfos) {
      if (e.uuid && !uuids.includes(e.uuid)) {
        extensionInfosByName.push({ ...e, uuid: void 0 });
      }
    }
    if (extensionInfosByName.length) {
      this.telemetryService.publicLog2("galleryService:additionalQueryByName", {
        count: extensionInfosByName.length
      });
      const extensions = await this.getExtensionsUsingQueryApi(extensionInfosByName, options, extensionGalleryManifest, token);
      result.push(...extensions);
    }
    return result;
  }
  getResourceApi(extensionGalleryManifest) {
    const latestVersionResource = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, ExtensionGalleryResourceType.ExtensionLatestVersionUri);
    if (latestVersionResource) {
      return {
        uri: latestVersionResource,
        fallback: this.unpkgResourceApi
      };
    }
    return void 0;
  }
  async getExtensionsUsingQueryApi(extensionInfos, options, extensionGalleryManifest, token) {
    const names = [], ids = [], includePreRelease = [], versions = [];
    let isQueryForReleaseVersionFromPreReleaseVersion = true;
    for (const extensionInfo of extensionInfos) {
      if (extensionInfo.uuid) {
        ids.push(extensionInfo.uuid);
      } else {
        names.push(extensionInfo.id);
      }
      if (extensionInfo.version) {
        versions.push({ id: extensionInfo.id, uuid: extensionInfo.uuid, version: extensionInfo.version });
      } else {
        includePreRelease.push({ id: extensionInfo.id, uuid: extensionInfo.uuid, includePreRelease: !!extensionInfo.preRelease });
      }
      isQueryForReleaseVersionFromPreReleaseVersion = isQueryForReleaseVersionFromPreReleaseVersion && (!!extensionInfo.hasPreRelease && !extensionInfo.preRelease);
    }
    if (!ids.length && !names.length) {
      return [];
    }
    let query = new Query().withPage(1, extensionInfos.length);
    if (ids.length) {
      query = query.withFilter(FilterType.ExtensionId, ...ids);
    }
    if (names.length) {
      query = query.withFilter(FilterType.ExtensionName, ...names);
    }
    if (options.queryAllVersions) {
      query = query.withFlags(...query.flags, Flag.IncludeVersions);
    }
    if (options.source) {
      query = query.withSource(options.source);
    }
    const { extensions } = await this.queryGalleryExtensions(
      query,
      {
        targetPlatform: options.targetPlatform ?? CURRENT_TARGET_PLATFORM,
        includePreRelease,
        versions,
        compatible: !!options.compatible,
        productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date },
        isQueryForReleaseVersionFromPreReleaseVersion
      },
      extensionGalleryManifest,
      token
    );
    if (options.source) {
      extensions.forEach((e, index) => setTelemetry(e, index, options.source));
    }
    return extensions;
  }
  async getExtensionsUsingResourceApi(extensionInfos, options, resourceApi, extensionGalleryManifest, token) {
    const result = [];
    const toQuery = [];
    const toFetchLatest = [];
    for (const extensionInfo of extensionInfos) {
      if (!EXTENSION_IDENTIFIER_REGEX.test(extensionInfo.id)) {
        continue;
      }
      if (extensionInfo.version || !extensionInfo.uuid) {
        toQuery.push(extensionInfo);
      } else {
        toFetchLatest.push(extensionInfo);
      }
    }
    await Promise.all(toFetchLatest.map(async (extensionInfo) => {
      let galleryExtension;
      try {
        galleryExtension = await this.getLatestGalleryExtension(extensionInfo, options, resourceApi, extensionGalleryManifest, token);
        if (isString(galleryExtension)) {
          if (galleryExtension === "LATEST_IS_OUTDATED") {
            this.logService.debug(`Skipping query API fallback for extension ${extensionInfo.id} because the latest gallery version is older than the current version`);
          } else {
            this.telemetryService.publicLog2("galleryService:fallbacktoquery", {
              extension: extensionInfo.id,
              preRelease: !!extensionInfo.preRelease,
              compatible: !!options.compatible,
              errorCode: galleryExtension
            });
            toQuery.push(extensionInfo);
          }
        } else {
          result.push(galleryExtension);
        }
      } catch (error) {
        if (error instanceof ExtensionGalleryError) {
          switch (error.code) {
            case ExtensionGalleryErrorCode.Offline:
            case ExtensionGalleryErrorCode.Cancelled:
            case ExtensionGalleryErrorCode.Timeout:
              throw error;
          }
        }
        this.logService.error(`Error while getting the latest version for the extension ${extensionInfo.id}.`, getErrorMessage(error));
        this.telemetryService.publicLog2("galleryService:fallbacktoquery", {
          extension: extensionInfo.id,
          preRelease: !!extensionInfo.preRelease,
          compatible: !!options.compatible,
          errorCode: error instanceof ExtensionGalleryError ? error.code : "Unknown"
        });
        toQuery.push(extensionInfo);
      }
    }));
    if (toQuery.length) {
      const extensions = await this.getExtensionsUsingQueryApi(toQuery, options, extensionGalleryManifest, token);
      result.push(...extensions);
    }
    return result;
  }
  async getLatestGalleryExtension(extensionInfo, options, resourceApi, extensionGalleryManifest, token) {
    const rawGalleryExtension = await this.getLatestRawGalleryExtensionWithFallback(extensionInfo, resourceApi, token);
    if (!rawGalleryExtension) {
      return "NOT_FOUND";
    }
    if (!Array.isArray(rawGalleryExtension.versions) || rawGalleryExtension.versions.some((version) => !Array.isArray(version.files))) {
      return "INVALID_RESPONSE";
    }
    const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
    const rawGalleryExtensionVersion = await this.getValidRawGalleryExtensionVersionFromLatestVersions(rawGalleryExtension, rawGalleryExtension.versions, extensionInfo, options, allTargetPlatforms);
    if (!rawGalleryExtensionVersion) {
      if (extensionInfo.currentVersion) {
        const latestVersion = rawGalleryExtension.versions.length > 0 ? rawGalleryExtension.versions[0].version : void 0;
        if (latestVersion && semver.lt(latestVersion, extensionInfo.currentVersion)) {
          return "LATEST_IS_OUTDATED";
        }
      }
      return "NOT_COMPATIBLE";
    }
    return toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, extensionGalleryManifest, this.productService);
  }
  async getValidRawGalleryExtensionVersionFromLatestVersions(rawGalleryExtension, latestVersions, extensionInfo, options, allTargetPlatforms) {
    const targetPlatform = options.targetPlatform ?? CURRENT_TARGET_PLATFORM;
    const latestExtensionVersionsForTargetPlatform = filterLatestExtensionVersionsForTargetPlatform(latestVersions, targetPlatform, allTargetPlatforms);
    const result = await this.getValidRawGalleryExtensionVersion(
      rawGalleryExtension,
      latestExtensionVersionsForTargetPlatform,
      {
        targetPlatform,
        compatible: !!options.compatible,
        productVersion: options.productVersion ?? {
          version: this.productService.version,
          date: this.productService.date
        },
        version: extensionInfo.preRelease ? 1 /* Prerelease */ : 0 /* Release */
      },
      allTargetPlatforms
    );
    if (!extensionInfo.preRelease) {
      return result;
    }
    const prereleaseVersion = result;
    const releaseVersion = await this.getValidRawGalleryExtensionVersion(
      rawGalleryExtension,
      latestExtensionVersionsForTargetPlatform,
      {
        targetPlatform,
        compatible: !!options.compatible,
        productVersion: options.productVersion ?? {
          version: this.productService.version,
          date: this.productService.date
        },
        version: 0 /* Release */
      },
      allTargetPlatforms
    );
    if (prereleaseVersion && releaseVersion) {
      return semver.gt(releaseVersion.version, prereleaseVersion.version) ? releaseVersion : prereleaseVersion;
    }
    if (options.compatible) {
      if (releaseVersion) {
        const anyPrereleaseVersion = await this.getValidRawGalleryExtensionVersion(
          rawGalleryExtension,
          latestExtensionVersionsForTargetPlatform,
          {
            targetPlatform,
            compatible: false,
            productVersion: options.productVersion ?? {
              version: this.productService.version,
              date: this.productService.date
            },
            version: 1 /* Prerelease */
          },
          allTargetPlatforms
        );
        if (!anyPrereleaseVersion || semver.gt(releaseVersion.version, anyPrereleaseVersion.version)) {
          return releaseVersion;
        }
      }
      return prereleaseVersion;
    }
    return prereleaseVersion ?? releaseVersion ?? null;
  }
  async getCompatibleExtension(extension, includePreRelease, targetPlatform, productVersion = { version: this.productService.version, date: this.productService.date }) {
    if (isNotWebExtensionInWebTargetPlatform(extension.allTargetPlatforms, targetPlatform)) {
      return null;
    }
    if (await this.isExtensionCompatible(extension, includePreRelease, targetPlatform)) {
      return extension;
    }
    if (this.allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName }) !== true) {
      return null;
    }
    const result = await this.getExtensions([{
      ...extension.identifier,
      preRelease: includePreRelease,
      hasPreRelease: extension.hasPreReleaseVersion
    }], {
      compatible: true,
      productVersion,
      queryAllVersions: true,
      targetPlatform
    }, CancellationToken.None);
    return result[0] ?? null;
  }
  async isExtensionCompatible(extension, includePreRelease, targetPlatform, productVersion = { version: this.productService.version, date: this.productService.date }) {
    return this.isValidVersion(
      {
        id: extension.identifier.id,
        version: extension.version,
        isPreReleaseVersion: extension.properties.isPreReleaseVersion,
        targetPlatform: extension.properties.targetPlatform,
        manifestAsset: extension.assets.manifest,
        engine: extension.properties.engine,
        enabledApiProposals: extension.properties.enabledApiProposals
      },
      {
        targetPlatform,
        compatible: true,
        productVersion,
        version: includePreRelease ? 2 /* Latest */ : 0 /* Release */
      },
      extension.publisherDisplayName,
      extension.allTargetPlatforms
    );
  }
  async isValidVersion(extension, { targetPlatform, compatible, productVersion, version }, publisherDisplayName, allTargetPlatforms) {
    const hasPreRelease = hasPreReleaseForExtension(extension.id, this.productService);
    const excludeVersionRange = getExcludeVersionRangeForExtension(extension.id, this.productService);
    if (extension.isPreReleaseVersion && hasPreRelease === false) {
      return false;
    }
    if (excludeVersionRange && semver.satisfies(extension.version, excludeVersionRange)) {
      return false;
    }
    if (isString(version)) {
      if (extension.version !== version) {
        return false;
      }
    } else if (version === 0 /* Release */ || version === 1 /* Prerelease */) {
      if (extension.isPreReleaseVersion !== (version === 1 /* Prerelease */)) {
        return false;
      }
    }
    if (targetPlatform && !isTargetPlatformCompatible(extension.targetPlatform, allTargetPlatforms, targetPlatform)) {
      return false;
    }
    if (compatible) {
      if (this.allowedExtensionsService.isAllowed({ id: extension.id, publisherDisplayName, version: extension.version, prerelease: extension.isPreReleaseVersion, targetPlatform: extension.targetPlatform }) !== true) {
        return false;
      }
      if (!await this.isEngineValid(extension.id, extension.version, extension.engine, extension.manifestAsset, productVersion)) {
        return false;
      }
    }
    return true;
  }
  async isEngineValid(extensionId, version, engine, manifestAsset, productVersion) {
    if (!engine) {
      try {
        engine = await this.getEngine(extensionId, version, manifestAsset);
      } catch (error) {
        this.logService.error(`Error while getting the engine for the version ${version}.`, getErrorMessage(error));
        return false;
      }
    }
    if (!engine) {
      this.logService.error(`Missing engine for the extension ${extensionId} with version ${version}`);
      return false;
    }
    return isEngineValid(engine, productVersion.version, productVersion.date);
  }
  async getEngine(extensionId, version, manifestAsset) {
    if (!manifestAsset) {
      this.logService.error(`Missing engine and manifest asset for the extension ${extensionId} with version ${version}`);
      return void 0;
    }
    try {
      this.telemetryService.publicLog2("galleryService:engineFallback", { extension: extensionId, extensionVersion: version });
      const headers = { "Accept-Encoding": "gzip" };
      const context = await this.getAsset(extensionId, manifestAsset, AssetType.Manifest, version, "extensionGalleryService.engineVersion", { headers });
      const manifest = await asJson(context);
      if (!manifest) {
        this.logService.error(`Manifest was not found for the extension ${extensionId} with version ${version}`);
        return void 0;
      }
      return manifest.engines.vscode;
    } catch (error) {
      this.logService.error(`Error while getting the engine for the version ${version}.`, getErrorMessage(error));
      return void 0;
    }
  }
  async query(options, token) {
    const extensionGalleryManifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
    if (!extensionGalleryManifest) {
      throw new Error("No extension gallery service configured.");
    }
    let text = options.text || "";
    const pageSize = options.pageSize ?? 50;
    let query = new Query().withPage(1, pageSize);
    if (text) {
      text = text.replace(/\bcategory:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedCategory, category) => {
        query = query.withFilter(FilterType.Category, category || quotedCategory);
        return "";
      });
      text = text.replace(/\btag:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedTag, tag) => {
        query = query.withFilter(FilterType.Tag, tag || quotedTag);
        return "";
      });
      text = text.replace(/\bfeatured(\s+|\b|$)/g, () => {
        query = query.withFilter(FilterType.Featured);
        return "";
      });
      text = text.trim();
      if (text) {
        text = text.length < 200 ? text : text.substring(0, 200);
        query = query.withFilter(FilterType.SearchText, text);
      }
      if (extensionGalleryManifest.capabilities.extensionQuery.sorting?.some((c) => c.name === SortBy.NoneOrRelevance)) {
        query = query.withSortBy(SortBy.NoneOrRelevance);
      }
    } else {
      if (extensionGalleryManifest.capabilities.extensionQuery.sorting?.some((c) => c.name === SortBy.InstallCount)) {
        query = query.withSortBy(SortBy.InstallCount);
      }
    }
    if (options.sortBy && extensionGalleryManifest.capabilities.extensionQuery.sorting?.some((c) => c.name === options.sortBy)) {
      query = query.withSortBy(options.sortBy);
    }
    if (typeof options.sortOrder === "number") {
      query = query.withSortOrder(options.sortOrder);
    }
    if (options.source) {
      query = query.withSource(options.source);
    }
    const runQuery = async (query2, token2) => {
      const { extensions: extensions2, total: total2 } = await this.queryGalleryExtensions(query2, { targetPlatform: CURRENT_TARGET_PLATFORM, compatible: false, includePreRelease: !!options.includePreRelease, productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date } }, extensionGalleryManifest, token2);
      const result = [];
      let defaultChatAgentExtension;
      for (let index = 0; index < extensions2.length; index++) {
        const extension = extensions2[index];
        setTelemetry(extension, (query2.pageNumber - 1) * query2.pageSize + index, options.source);
        if (this.productService.defaultChatAgent && areSameExtensions(extension.identifier, { id: this.productService.defaultChatAgent.extensionId })) {
          defaultChatAgentExtension = extension;
        } else {
          result.push(extension);
        }
      }
      if (defaultChatAgentExtension) {
        result.push(defaultChatAgentExtension);
      }
      return { extensions: result, total: total2 };
    };
    const { extensions, total } = await runQuery(query, token);
    const getPage = async (pageIndex, ct) => {
      if (ct.isCancellationRequested) {
        throw new CancellationError();
      }
      const { extensions: extensions2 } = await runQuery(query.withPage(pageIndex + 1), ct);
      return extensions2;
    };
    return { firstPage: extensions, total, pageSize: query.pageSize, getPage };
  }
  async queryGalleryExtensions(query, criteria, extensionGalleryManifest, token) {
    const flags = query.flags;
    if (query.flags.includes(Flag.IncludeLatestVersionOnly) && query.flags.includes(Flag.IncludeVersions)) {
      query = query.withFlags(...query.flags.filter((flag) => flag !== Flag.IncludeVersions));
    }
    if (!query.flags.includes(Flag.IncludeLatestVersionOnly) && !query.flags.includes(Flag.IncludeVersions)) {
      query = query.withFlags(...query.flags, Flag.IncludeLatestVersionOnly);
    }
    if (criteria.versions?.length || criteria.isQueryForReleaseVersionFromPreReleaseVersion) {
      query = query.withFlags(...query.flags.filter((flag) => flag !== Flag.IncludeLatestVersionOnly), Flag.IncludeVersions);
    }
    query = query.withFlags(...query.flags, Flag.IncludeAssetUri, Flag.IncludeCategoryAndTags, Flag.IncludeFiles, Flag.IncludeStatistics, Flag.IncludeVersionProperties);
    const { galleryExtensions: rawGalleryExtensions, total, context } = await this.queryRawGalleryExtensions(query, extensionGalleryManifest, token);
    const hasAllVersions = !query.flags.includes(Flag.IncludeLatestVersionOnly);
    if (hasAllVersions) {
      const extensions = [];
      for (const rawGalleryExtension of rawGalleryExtensions) {
        const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
        const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
        const includePreRelease = isBoolean(criteria.includePreRelease) ? criteria.includePreRelease : !!criteria.includePreRelease.find((extensionIdentifierWithPreRelease) => areSameExtensions(extensionIdentifierWithPreRelease, extensionIdentifier))?.includePreRelease;
        const rawGalleryExtensionVersion = await this.getValidRawGalleryExtensionVersion(
          rawGalleryExtension,
          rawGalleryExtension.versions,
          {
            compatible: criteria.compatible,
            targetPlatform: criteria.targetPlatform,
            productVersion: criteria.productVersion,
            version: criteria.versions?.find((extensionIdentifierWithVersion) => areSameExtensions(extensionIdentifierWithVersion, extensionIdentifier))?.version ?? (includePreRelease ? 2 /* Latest */ : 0 /* Release */)
          },
          allTargetPlatforms
        );
        if (rawGalleryExtensionVersion) {
          extensions.push(toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, extensionGalleryManifest, this.productService, context));
        }
      }
      return { extensions, total };
    }
    const result = [];
    const needAllVersions = /* @__PURE__ */ new Map();
    for (let index = 0; index < rawGalleryExtensions.length; index++) {
      const rawGalleryExtension = rawGalleryExtensions[index];
      const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
      const includePreRelease = isBoolean(criteria.includePreRelease) ? criteria.includePreRelease : !!criteria.includePreRelease.find((extensionIdentifierWithPreRelease) => areSameExtensions(extensionIdentifierWithPreRelease, extensionIdentifier))?.includePreRelease;
      const allTargetPlatforms = getAllTargetPlatforms(rawGalleryExtension);
      if (criteria.compatible) {
        if (isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, criteria.targetPlatform)) {
          continue;
        }
        if (this.allowedExtensionsService.isAllowed({ id: extensionIdentifier.id, publisherDisplayName: rawGalleryExtension.publisher.displayName }) !== true) {
          continue;
        }
      }
      const rawGalleryExtensionVersion = await this.getValidRawGalleryExtensionVersion(
        rawGalleryExtension,
        rawGalleryExtension.versions,
        {
          compatible: criteria.compatible,
          targetPlatform: criteria.targetPlatform,
          productVersion: criteria.productVersion,
          version: criteria.versions?.find((extensionIdentifierWithVersion) => areSameExtensions(extensionIdentifierWithVersion, extensionIdentifier))?.version ?? (includePreRelease ? 2 /* Latest */ : 0 /* Release */)
        },
        allTargetPlatforms
      );
      const extension = rawGalleryExtensionVersion ? toExtension(rawGalleryExtension, rawGalleryExtensionVersion, allTargetPlatforms, extensionGalleryManifest, this.productService, context) : null;
      if (!extension || extension.properties.isPreReleaseVersion && (!includePreRelease || !extension.hasReleaseVersion) || !extension.properties.isPreReleaseVersion && extension.properties.targetPlatform !== criteria.targetPlatform && extension.hasPreReleaseVersion) {
        needAllVersions.set(rawGalleryExtension.extensionId, index);
      } else {
        result.push([index, extension]);
      }
    }
    if (needAllVersions.size) {
      const stopWatch = new StopWatch();
      const query2 = new Query().withFlags(...flags.filter((flag) => flag !== Flag.IncludeLatestVersionOnly), Flag.IncludeVersions).withPage(1, needAllVersions.size).withFilter(FilterType.ExtensionId, ...needAllVersions.keys());
      const { extensions } = await this.queryGalleryExtensions(query2, criteria, extensionGalleryManifest, token);
      this.telemetryService.publicLog2("galleryService:additionalQuery", {
        duration: stopWatch.elapsed(),
        count: needAllVersions.size
      });
      for (const extension of extensions) {
        const index = needAllVersions.get(extension.identifier.uuid);
        result.push([index, extension]);
      }
    }
    return { extensions: result.sort((a, b) => a[0] - b[0]).map(([, extension]) => extension), total };
  }
  async getValidRawGalleryExtensionVersion(rawGalleryExtension, versions, criteria, allTargetPlatforms) {
    const extensionIdentifier = { id: getGalleryExtensionId(rawGalleryExtension.publisher.publisherName, rawGalleryExtension.extensionName), uuid: rawGalleryExtension.extensionId };
    const rawGalleryExtensionVersions = sortExtensionVersions(versions, criteria.targetPlatform);
    if (criteria.compatible && isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, criteria.targetPlatform)) {
      return null;
    }
    const version = isString(criteria.version) ? criteria.version : void 0;
    for (let index = 0; index < rawGalleryExtensionVersions.length; index++) {
      const rawGalleryExtensionVersion = rawGalleryExtensionVersions[index];
      if (criteria.compatible) {
        await this.setEngineIfNotExists(extensionIdentifier.id, rawGalleryExtensionVersion);
      }
      if (await this.isValidVersion(
        {
          id: extensionIdentifier.id,
          version: rawGalleryExtensionVersion.version,
          isPreReleaseVersion: isPreReleaseVersion(rawGalleryExtensionVersion),
          targetPlatform: getTargetPlatformForExtensionVersion(rawGalleryExtensionVersion),
          engine: getEngine(rawGalleryExtensionVersion),
          manifestAsset: getVersionAsset(rawGalleryExtensionVersion, AssetType.Manifest),
          enabledApiProposals: getEnabledApiProposals(rawGalleryExtensionVersion)
        },
        criteria,
        rawGalleryExtension.publisher.displayName,
        allTargetPlatforms
      )) {
        return rawGalleryExtensionVersion;
      }
      if (version && rawGalleryExtensionVersion.version === version) {
        return null;
      }
    }
    if (version || criteria.compatible) {
      return null;
    }
    return rawGalleryExtension.versions[0];
  }
  async setEngineIfNotExists(extensionId, rawGalleryExtensionVersion) {
    if (getEngine(rawGalleryExtensionVersion)) {
      return;
    }
    try {
      const engine = await this.getEngine(extensionId, rawGalleryExtensionVersion.version, getVersionAsset(rawGalleryExtensionVersion, AssetType.Manifest));
      if (engine) {
        setEngine(rawGalleryExtensionVersion, engine);
      }
    } catch (error) {
      this.logService.error(`Error while getting the engine for the version ${rawGalleryExtensionVersion.version}.`, getErrorMessage(error));
    }
  }
  async queryRawGalleryExtensions(query, extensionGalleryManifest, token) {
    const extensionsQueryApi = getExtensionGalleryManifestResourceUri(extensionGalleryManifest, ExtensionGalleryResourceType.ExtensionQueryService);
    if (!extensionsQueryApi) {
      throw new Error("No extension gallery query service configured.");
    }
    query = query.withFlags(...query.flags, Flag.ExcludeNonValidated).withFilter(FilterType.Target, "Microsoft.VisualStudio.Code");
    const unpublishedFlag = extensionGalleryManifest.capabilities.extensionQuery.flags?.find((f) => f.name === Flag.Unpublished);
    if (unpublishedFlag) {
      query = query.withFilter(FilterType.ExcludeWithFlags, String(unpublishedFlag.value));
    }
    const data = JSON.stringify({
      filters: [
        {
          criteria: query.criteria.reduce((criteria, c) => {
            const criterium = extensionGalleryManifest.capabilities.extensionQuery.filtering?.find((f) => f.name === c.filterType);
            if (criterium) {
              criteria.push({
                filterType: criterium.value,
                value: c.value
              });
            }
            return criteria;
          }, []),
          pageNumber: query.pageNumber,
          pageSize: query.pageSize,
          sortBy: extensionGalleryManifest.capabilities.extensionQuery.sorting?.find((s) => s.name === query.sortBy)?.value,
          sortOrder: query.sortOrder
        }
      ],
      assetTypes: query.assetTypes,
      flags: query.flags.reduce((flags, flag) => {
        const flagValue = extensionGalleryManifest.capabilities.extensionQuery.flags?.find((f) => f.name === flag);
        if (flagValue) {
          flags |= flagValue.value;
        }
        return flags;
      }, 0)
    });
    const commonHeaders = await this.commonHeadersPromise;
    const headers = {
      ...commonHeaders,
      "Content-Type": "application/json",
      "Accept": "application/json;api-version=3.0-preview.1",
      "Accept-Encoding": "gzip",
      "Content-Length": String(data.length)
    };
    const stopWatch = new StopWatch();
    let context, errorCode, total = 0;
    try {
      context = await this.requestService.request({
        type: "POST",
        url: extensionsQueryApi,
        data,
        headers,
        callSite: "extensionGalleryService.queryRawGalleryExtensions"
      }, token);
      if (context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500) {
        return { galleryExtensions: [], total };
      }
      const result = await asJson(context);
      if (result) {
        const r = result.results[0];
        const galleryExtensions = r.extensions;
        const resultCount = r.resultMetadata && r.resultMetadata.filter((m) => m.metadataType === "ResultCount")[0];
        total = resultCount && resultCount.metadataItems.filter((i) => i.name === "TotalCount")[0].count || 0;
        return {
          galleryExtensions,
          total,
          context: context.res.headers["activityid"] ? {
            [SEARCH_ACTIVITY_HEADER_NAME]: context.res.headers["activityid"]
          } : {}
        };
      }
      return { galleryExtensions: [], total };
    } catch (e) {
      if (isCancellationError(e)) {
        errorCode = ExtensionGalleryErrorCode.Cancelled;
        throw e;
      } else {
        const errorMessage = getErrorMessage(e);
        errorCode = isOfflineError(e) ? ExtensionGalleryErrorCode.Offline : errorMessage.startsWith("XHR timeout") ? ExtensionGalleryErrorCode.Timeout : ExtensionGalleryErrorCode.Failed;
        throw new ExtensionGalleryError(errorMessage, errorCode);
      }
    } finally {
      this.telemetryService.publicLog2("galleryService:query", {
        filterTypes: query.criteria.map((criterium) => criterium.filterType),
        flags: query.flags,
        sortBy: query.sortBy,
        sortOrder: String(query.sortOrder),
        pageNumber: String(query.pageNumber),
        source: query.source,
        searchTextLength: query.searchText.length,
        requestBodySize: String(data.length),
        duration: stopWatch.elapsed(),
        success: !!context && isSuccess(context),
        responseBodySize: context?.res.headers["Content-Length"],
        statusCode: context ? String(context.res.statusCode) : void 0,
        errorCode,
        count: String(total),
        server: this.getHeaderValue(context?.res.headers, SERVER_HEADER_NAME),
        activityId: this.getHeaderValue(context?.res.headers, ACTIVITY_HEADER_NAME),
        endToEndId: this.getHeaderValue(context?.res.headers, END_END_ID_HEADER_NAME)
      });
    }
  }
  getHeaderValue(headers, name) {
    const headerValue = headers?.[name.toLowerCase()];
    const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    return value ? new TelemetryTrustedValue(value) : void 0;
  }
  async getLatestRawGalleryExtensionWithFallback(extensionInfo, resourceApi, token) {
    const [publisher, name] = extensionInfo.id.split(".");
    let errorCode;
    try {
      const uri = URI.parse(format2(resourceApi.uri, { publisher, name }));
      return await this.getLatestRawGalleryExtension(extensionInfo.id, uri, token);
    } catch (error) {
      if (error instanceof ExtensionGalleryError) {
        errorCode = error.code;
        switch (error.code) {
          case ExtensionGalleryErrorCode.Offline:
          case ExtensionGalleryErrorCode.Cancelled:
          case ExtensionGalleryErrorCode.Timeout:
          case ExtensionGalleryErrorCode.ClientError:
            throw error;
        }
      } else {
        errorCode = "Unknown";
      }
      if (!resourceApi.fallback) {
        throw error;
      }
    }
    this.logService.error(`Error while getting the latest version for the extension ${extensionInfo.id} from ${resourceApi.uri}. Trying the fallback ${resourceApi.fallback}`, errorCode);
    try {
      const uri = URI.parse(format2(resourceApi.fallback, { publisher, name }));
      return await this.getLatestRawGalleryExtension(extensionInfo.id, uri, token);
    } catch (error) {
      errorCode = error instanceof ExtensionGalleryError ? error.code : "Unknown";
      throw error;
    } finally {
      this.telemetryService.publicLog2("galleryService:fallbacktounpkg", {
        extension: extensionInfo.id,
        errorCode
      });
    }
  }
  async getLatestRawGalleryExtension(extension, uri, token) {
    let context;
    let errorCode;
    const stopWatch = new StopWatch();
    try {
      const commonHeaders = await this.commonHeadersPromise;
      const headers = {
        ...commonHeaders,
        "Content-Type": "application/json",
        "Accept": "application/json;api-version=7.2-preview",
        "Accept-Encoding": "gzip"
      };
      context = await this.requestService.request({
        type: "GET",
        url: uri.toString(true),
        headers,
        timeout: this.getRequestTimeout(),
        callSite: "extensionGalleryService.getLatestRawGalleryExtension"
      }, token);
      if (context.res.statusCode === 404) {
        errorCode = "NotFound";
        return null;
      }
      if (context.res.statusCode && context.res.statusCode !== 200) {
        throw new Error("Unexpected HTTP response: " + context.res.statusCode);
      }
      const result = await asJson(context);
      if (!result) {
        errorCode = "NoData";
      }
      return result;
    } catch (error) {
      let galleryErrorCode;
      if (isCancellationError(error)) {
        galleryErrorCode = ExtensionGalleryErrorCode.Cancelled;
      } else if (isOfflineError(error)) {
        galleryErrorCode = ExtensionGalleryErrorCode.Offline;
      } else if (getErrorMessage(error).startsWith("XHR timeout")) {
        galleryErrorCode = ExtensionGalleryErrorCode.Timeout;
      } else if (context && isClientError(context)) {
        galleryErrorCode = ExtensionGalleryErrorCode.ClientError;
      } else if (context && isServerError(context)) {
        galleryErrorCode = ExtensionGalleryErrorCode.ServerError;
      } else {
        galleryErrorCode = ExtensionGalleryErrorCode.Failed;
      }
      errorCode = galleryErrorCode;
      throw new ExtensionGalleryError(error, galleryErrorCode);
    } finally {
      this.telemetryService.publicLog2("galleryService:getLatest", {
        extension,
        host: uri.authority,
        duration: stopWatch.elapsed(),
        errorCode,
        statusCode: context?.res.statusCode && context?.res.statusCode !== 200 ? `${context.res.statusCode}` : void 0,
        server: this.getHeaderValue(context?.res.headers, SERVER_HEADER_NAME),
        activityId: this.getHeaderValue(context?.res.headers, ACTIVITY_HEADER_NAME),
        endToEndId: this.getHeaderValue(context?.res.headers, END_END_ID_HEADER_NAME)
      });
    }
  }
  async reportStatistic(publisher, name, version, type) {
    if (isWeb) {
      this.logService.info("ExtensionGalleryService#reportStatistic: Skipped in web");
      return void 0;
    }
    const manifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
    if (!manifest) {
      return void 0;
    }
    const resource = getExtensionGalleryManifestResourceUri(manifest, ExtensionGalleryResourceType.ExtensionStatisticsUri);
    if (!resource) {
      return;
    }
    const url = format2(resource, { publisher, name, version, statTypeName: type });
    const Accept = "*/*;api-version=4.0-preview.1";
    const commonHeaders = await this.commonHeadersPromise;
    const headers = { ...commonHeaders, Accept };
    try {
      await this.requestService.request({
        type: "POST",
        url,
        headers,
        callSite: "extensionGalleryService.reportStatistic"
      }, CancellationToken.None);
    } catch (error) {
    }
  }
  async download(extension, location, operation) {
    this.logService.trace("ExtensionGalleryService#download", extension.identifier.id);
    const data = getGalleryExtensionTelemetryData(extension);
    const startTime = (/* @__PURE__ */ new Date()).getTime();
    const operationParam = operation === InstallOperation.Install ? "install" : operation === InstallOperation.Update ? "update" : "";
    const downloadAsset = operationParam ? {
      uri: `${extension.assets.download.uri}${URI.parse(extension.assets.download.uri).query ? "&" : "?"}${operationParam}=true`,
      fallbackUri: `${extension.assets.download.fallbackUri}${URI.parse(extension.assets.download.fallbackUri).query ? "&" : "?"}${operationParam}=true`
    } : extension.assets.download;
    const activityId = extension.queryContext?.[SEARCH_ACTIVITY_HEADER_NAME];
    const headers = activityId && typeof activityId === "string" ? { [SEARCH_ACTIVITY_HEADER_NAME]: activityId } : void 0;
    const context = await this.getAsset(extension.identifier.id, downloadAsset, AssetType.VSIX, extension.version, "extensionGalleryService.download", headers ? { headers } : void 0);
    try {
      await this.fileService.writeFile(location, context.stream);
    } catch (error) {
      try {
        await this.fileService.del(location);
      } catch (e) {
        this.logService.warn(`Error while deleting the file ${location.toString()}`, getErrorMessage(e));
      }
      throw new ExtensionGalleryError(getErrorMessage(error), ExtensionGalleryErrorCode.DownloadFailedWriting);
    }
    this.telemetryService.publicLog("galleryService:downloadVSIX", { ...data, duration: (/* @__PURE__ */ new Date()).getTime() - startTime });
  }
  async downloadSignatureArchive(extension, location) {
    if (!extension.assets.signature) {
      throw new Error("No signature asset found");
    }
    this.logService.trace("ExtensionGalleryService#downloadSignatureArchive", extension.identifier.id);
    const context = await this.getAsset(extension.identifier.id, extension.assets.signature, AssetType.Signature, extension.version, "extensionGalleryService.signature");
    try {
      await this.fileService.writeFile(location, context.stream);
    } catch (error) {
      try {
        await this.fileService.del(location);
      } catch (e) {
        this.logService.warn(`Error while deleting the file ${location.toString()}`, getErrorMessage(e));
      }
      throw new ExtensionGalleryError(getErrorMessage(error), ExtensionGalleryErrorCode.DownloadFailedWriting);
    }
  }
  async getReadme(extension, token) {
    if (extension.assets.readme) {
      const context = await this.getAsset(extension.identifier.id, extension.assets.readme, AssetType.Details, extension.version, "extensionGalleryService.readme", {}, token);
      const content = await asTextOrError(context);
      return content || "";
    }
    return "";
  }
  async getManifest(extension, token) {
    if (extension.assets.manifest) {
      const context = await this.getAsset(extension.identifier.id, extension.assets.manifest, AssetType.Manifest, extension.version, "extensionGalleryService.manifest", {}, token);
      const text = await asTextOrError(context);
      return text ? JSON.parse(text) : null;
    }
    return null;
  }
  async getCoreTranslation(extension, languageId) {
    const asset = extension.assets.coreTranslations.filter((t) => t[0] === languageId.toUpperCase())[0];
    if (asset) {
      const context = await this.getAsset(extension.identifier.id, asset[1], asset[0], extension.version, "extensionGalleryService.coreTranslation");
      const text = await asTextOrError(context);
      return text ? JSON.parse(text) : null;
    }
    return null;
  }
  async getChangelog(extension, token) {
    if (extension.assets.changelog) {
      const context = await this.getAsset(extension.identifier.id, extension.assets.changelog, AssetType.Changelog, extension.version, "extensionGalleryService.changelog", {}, token);
      const content = await asTextOrError(context);
      return content || "";
    }
    return "";
  }
  async getAllVersions(extensionIdentifier) {
    return this.getVersions(extensionIdentifier);
  }
  async getAllCompatibleVersions(extensionIdentifier, includePreRelease, targetPlatform) {
    return this.getVersions(extensionIdentifier, { version: includePreRelease ? 2 /* Latest */ : 0 /* Release */, targetPlatform });
  }
  async getVersions(extensionIdentifier, onlyCompatible) {
    const extensionGalleryManifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
    if (!extensionGalleryManifest) {
      throw new Error("No extension gallery service configured.");
    }
    let query = new Query().withFlags(Flag.IncludeVersions, Flag.IncludeCategoryAndTags, Flag.IncludeFiles, Flag.IncludeVersionProperties).withPage(1, 1);
    if (extensionIdentifier.uuid) {
      query = query.withFilter(FilterType.ExtensionId, extensionIdentifier.uuid);
    } else {
      query = query.withFilter(FilterType.ExtensionName, extensionIdentifier.id);
    }
    const { galleryExtensions } = await this.queryRawGalleryExtensions(query, extensionGalleryManifest, CancellationToken.None);
    if (!galleryExtensions.length) {
      return [];
    }
    const allTargetPlatforms = getAllTargetPlatforms(galleryExtensions[0]);
    if (onlyCompatible && isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, onlyCompatible.targetPlatform)) {
      return [];
    }
    const versions = [];
    const productVersion = { version: this.productService.version, date: this.productService.date };
    await Promise.all(galleryExtensions[0].versions.map(async (version) => {
      try {
        if (await this.isValidVersion(
          {
            id: extensionIdentifier.id,
            version: version.version,
            isPreReleaseVersion: isPreReleaseVersion(version),
            targetPlatform: getTargetPlatformForExtensionVersion(version),
            engine: getEngine(version),
            manifestAsset: getVersionAsset(version, AssetType.Manifest),
            enabledApiProposals: getEnabledApiProposals(version)
          },
          {
            compatible: !!onlyCompatible,
            productVersion,
            targetPlatform: onlyCompatible?.targetPlatform,
            version: onlyCompatible?.version ?? version.version
          },
          galleryExtensions[0].publisher.displayName,
          allTargetPlatforms
        )) {
          versions.push(version);
        }
      } catch (error) {
      }
    }));
    const result = [];
    const seen = /* @__PURE__ */ new Map();
    for (const version of sortExtensionVersions(versions, onlyCompatible?.targetPlatform ?? CURRENT_TARGET_PLATFORM)) {
      const index = seen.get(version.version);
      const existing = index !== void 0 ? result[index] : void 0;
      const targetPlatform = getTargetPlatformForExtensionVersion(version);
      if (!existing) {
        seen.set(version.version, result.length);
        result.push({ version: version.version, date: version.lastUpdated, isPreReleaseVersion: isPreReleaseVersion(version), targetPlatforms: [targetPlatform] });
      } else {
        existing.targetPlatforms.push(targetPlatform);
      }
    }
    return result;
  }
  async getAsset(extension, asset, assetType, extensionVersion, callSite, options = {}, token = CancellationToken.None) {
    const commonHeaders = await this.commonHeadersPromise;
    const baseOptions = { type: "GET" };
    const headers = { ...commonHeaders, ...options.headers || {} };
    options = { ...options, ...baseOptions, headers };
    const url = asset.uri;
    const fallbackUrl = asset.fallbackUri;
    const firstOptions = { ...options, url, timeout: this.getRequestTimeout(), callSite };
    let context;
    try {
      context = await this.requestService.request(firstOptions, token);
      if (context.res.statusCode === 200) {
        return context;
      }
      const message = await asTextOrError(context);
      throw new Error(`Expected 200, got back ${context.res.statusCode} instead.

${message}`);
    } catch (err) {
      if (isCancellationError(err)) {
        throw err;
      }
      const message = getErrorMessage(err);
      this.telemetryService.publicLog2("galleryService:cdnFallback", {
        extension,
        assetType,
        message,
        extensionVersion,
        server: this.getHeaderValue(context?.res.headers, SERVER_HEADER_NAME),
        activityId: this.getHeaderValue(context?.res.headers, ACTIVITY_HEADER_NAME),
        endToEndId: this.getHeaderValue(context?.res.headers, END_END_ID_HEADER_NAME)
      });
      const fallbackOptions = { ...options, url: fallbackUrl, timeout: this.getRequestTimeout(), callSite: `${callSite}.fallback` };
      return this.requestService.request(fallbackOptions, token);
    }
  }
  async getExtensionsControlManifest() {
    const manifest = await this.extensionGalleryManifestService.getExtensionGalleryManifest();
    if (!manifest) {
      throw new Error("No extension gallery service configured.");
    }
    if (!this.extensionsControlUrl) {
      return { malicious: [], deprecated: {}, search: [], autoUpdate: {} };
    }
    const context = await this.requestService.request({
      type: "GET",
      url: this.extensionsControlUrl,
      timeout: this.getRequestTimeout(),
      callSite: "extensionGalleryService.getExtensionsControlManifest"
    }, CancellationToken.None);
    if (context.res.statusCode !== 200) {
      throw new Error("Could not get extensions report.");
    }
    const result = await asJson(context);
    const malicious = [];
    const deprecated = {};
    const search = [];
    const autoUpdate = result?.autoUpdate ?? {};
    if (result) {
      for (const id of result.malicious) {
        if (!isString(id)) {
          continue;
        }
        const publisherOrExtension = EXTENSION_IDENTIFIER_REGEX.test(id) ? { id } : id;
        malicious.push({ extensionOrPublisher: publisherOrExtension, learnMoreLink: result.learnMoreLinks?.[id] });
      }
      if (result.migrateToPreRelease) {
        for (const [unsupportedPreReleaseExtensionId, preReleaseExtensionInfo] of Object.entries(result.migrateToPreRelease)) {
          if (!preReleaseExtensionInfo.engine || isEngineValid(preReleaseExtensionInfo.engine, this.productService.version, this.productService.date)) {
            deprecated[unsupportedPreReleaseExtensionId.toLowerCase()] = {
              disallowInstall: true,
              extension: {
                id: preReleaseExtensionInfo.id,
                displayName: preReleaseExtensionInfo.displayName,
                autoMigrate: { storage: !!preReleaseExtensionInfo.migrateStorage },
                preRelease: true
              }
            };
          }
        }
      }
      if (result.deprecated) {
        for (const [deprecatedExtensionId, deprecationInfo] of Object.entries(result.deprecated)) {
          if (deprecationInfo) {
            deprecated[deprecatedExtensionId.toLowerCase()] = isBoolean(deprecationInfo) ? {} : deprecationInfo;
          }
        }
      }
      if (result.search) {
        for (const s of result.search) {
          search.push(s);
        }
      }
    }
    if (this.productService.defaultChatAgent) {
      deprecated[this.productService.defaultChatAgent.extensionId.toLowerCase()] = {
        disallowInstall: true,
        extension: {
          id: this.productService.defaultChatAgent.chatExtensionId,
          displayName: "GitHub Copilot Chat",
          autoMigrate: { storage: false, donotDisable: true },
          preRelease: this.productService.quality !== "stable"
        }
      };
    }
    return { malicious, deprecated, search, autoUpdate };
  }
  getRequestTimeout() {
    const configuredTimeout = this.configurationService.getValue(ExtensionRequestsTimeoutConfigKey);
    return isNumber(configuredTimeout) && configuredTimeout >= 0 ? configuredTimeout : 6e4;
  }
};
AbstractExtensionGalleryService = __decorateClass([
  __decorateParam(1, IRequestService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IAllowedExtensionsService),
  __decorateParam(9, IExtensionGalleryManifestService)
], AbstractExtensionGalleryService);
let ExtensionGalleryService = class extends AbstractExtensionGalleryService {
  constructor(storageService, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService) {
    super(storageService, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService);
  }
};
ExtensionGalleryService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IRequestService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IAllowedExtensionsService),
  __decorateParam(9, IExtensionGalleryManifestService)
], ExtensionGalleryService);
let ExtensionGalleryServiceWithNoStorageService = class extends AbstractExtensionGalleryService {
  constructor(requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService) {
    super(void 0, requestService, logService, environmentService, telemetryService, fileService, productService, configurationService, allowedExtensionsService, extensionGalleryManifestService);
  }
};
ExtensionGalleryServiceWithNoStorageService = __decorateClass([
  __decorateParam(0, IRequestService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IProductService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IAllowedExtensionsService),
  __decorateParam(8, IExtensionGalleryManifestService)
], ExtensionGalleryServiceWithNoStorageService);
export {
  AbstractExtensionGalleryService,
  ExtensionGalleryService,
  ExtensionGalleryServiceWithNoStorageService,
  filterLatestExtensionVersionsForTargetPlatform,
  sortExtensionVersions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxleHRlbnNpb25HYWxsZXJ5U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCAqIGFzIHNlbXZlciBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZW12ZXIvc2VtdmVyLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGdldEVycm9yTWVzc2FnZSwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJUGFnZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYWdpbmcuanMnO1xuaW1wb3J0IHsgaXNXZWIsIHBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYXJjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgaXNCb29sZWFuLCBpc051bWJlciwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUhlYWRlcnMsIElSZXF1ZXN0Q29udGV4dCwgSVJlcXVlc3RPcHRpb25zLCBpc09mZmxpbmVFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgZ2V0VGFyZ2V0UGxhdGZvcm0sIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25JbmZvLCBJR2FsbGVyeUV4dGVuc2lvbiwgSUdhbGxlcnlFeHRlbnNpb25Bc3NldCwgSUdhbGxlcnlFeHRlbnNpb25Bc3NldHMsIElHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiwgSW5zdGFsbE9wZXJhdGlvbiwgSVF1ZXJ5T3B0aW9ucywgSUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QsIGlzTm90V2ViRXh0ZW5zaW9uSW5XZWJUYXJnZXRQbGF0Zm9ybSwgaXNUYXJnZXRQbGF0Zm9ybUNvbXBhdGlibGUsIElUcmFuc2xhdGlvbiwgU29ydE9yZGVyLCBTdGF0aXN0aWNUeXBlLCB0b1RhcmdldFBsYXRmb3JtLCBXRUJfRVhURU5TSU9OX1RBRywgSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucywgSURlcHJlY2F0aW9uSW5mbywgSVNlYXJjaFByZWZmZXJlZFJlc3VsdHMsIEV4dGVuc2lvbkdhbGxlcnlFcnJvciwgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZSwgSVByb2R1Y3RWZXJzaW9uLCBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLCBFWFRFTlNJT05fSURFTlRJRklFUl9SRUdFWCwgU29ydEJ5LCBGaWx0ZXJUeXBlLCBNYWxpY2lvdXNFeHRlbnNpb25JbmZvLCBFeHRlbnNpb25SZXF1ZXN0c1RpbWVvdXRDb25maWdLZXkgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYWRvcHRUb0dhbGxlcnlFeHRlbnNpb25JZCwgYXJlU2FtZUV4dGVuc2lvbnMsIGdldEdhbGxlcnlFeHRlbnNpb25JZCwgZ2V0R2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGEgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCwgVGFyZ2V0UGxhdGZvcm0gfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGlzRW5naW5lVmFsaWQgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25WYWxpZGF0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXNKc29uLCBhc1RleHRPckVycm9yLCBJUmVxdWVzdFNlcnZpY2UsIGlzQ2xpZW50RXJyb3IsIGlzU2VydmVyRXJyb3IsIGlzU3VjY2VzcyB9IGZyb20gJy4uLy4uL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZU1hcmtldHBsYWNlSGVhZGVycyB9IGZyb20gJy4uLy4uL2V4dGVybmFsU2VydmljZXMvY29tbW9uL21hcmtldHBsYWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgZm9ybWF0MiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZSwgRmxhZywgZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmksIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLCBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMgfSBmcm9tICcuL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5qcyc7XG5pbXBvcnQgeyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcblxuY29uc3QgQ1VSUkVOVF9UQVJHRVRfUExBVEZPUk0gPSBpc1dlYiA/IFRhcmdldFBsYXRmb3JtLldFQiA6IGdldFRhcmdldFBsYXRmb3JtKHBsYXRmb3JtLCBhcmNoKTtcbmNvbnN0IFNFQVJDSF9BQ1RJVklUWV9IRUFERVJfTkFNRSA9ICdYLU1hcmtldC1TZWFyY2gtQWN0aXZpdHktSWQnO1xuY29uc3QgQUNUSVZJVFlfSEVBREVSX05BTUUgPSAnQWN0aXZpdHlpZCc7XG5jb25zdCBTRVJWRVJfSEVBREVSX05BTUUgPSAnU2VydmVyJztcbmNvbnN0IEVORF9FTkRfSURfSEVBREVSX05BTUUgPSAnWC1Wc3MtRTJlaWQnO1xuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlFeHRlbnNpb25GaWxlIHtcblx0cmVhZG9ubHkgYXNzZXRUeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNvdXJjZTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlFeHRlbnNpb25Qcm9wZXJ0eSB7XG5cdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRyZWFkb25seSB2YWx1ZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiB7XG5cdHJlYWRvbmx5IHZlcnNpb246IHN0cmluZztcblx0cmVhZG9ubHkgbGFzdFVwZGF0ZWQ6IHN0cmluZztcblx0cmVhZG9ubHkgYXNzZXRVcmk6IHN0cmluZztcblx0cmVhZG9ubHkgZmFsbGJhY2tBc3NldFVyaTogc3RyaW5nO1xuXHRyZWFkb25seSBmaWxlczogSVJhd0dhbGxlcnlFeHRlbnNpb25GaWxlW107XG5cdHByb3BlcnRpZXM/OiBJUmF3R2FsbGVyeUV4dGVuc2lvblByb3BlcnR5W107XG5cdHJlYWRvbmx5IHRhcmdldFBsYXRmb3JtPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlFeHRlbnNpb25TdGF0aXN0aWNzIHtcblx0cmVhZG9ubHkgc3RhdGlzdGljTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSB2YWx1ZTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlFeHRlbnNpb25QdWJsaXNoZXIge1xuXHRyZWFkb25seSBkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBwdWJsaXNoZXJJZDogc3RyaW5nO1xuXHRyZWFkb25seSBwdWJsaXNoZXJOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRvbWFpbj86IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IGlzRG9tYWluVmVyaWZpZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBsaW5rVHlwZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElSYXdHYWxsZXJ5RXh0ZW5zaW9uIHtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZXh0ZW5zaW9uTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBzaG9ydERlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBwdWJsaXNoZXI6IElSYXdHYWxsZXJ5RXh0ZW5zaW9uUHVibGlzaGVyO1xuXHRyZWFkb25seSB2ZXJzaW9uczogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uW107XG5cdHJlYWRvbmx5IHN0YXRpc3RpY3M6IElSYXdHYWxsZXJ5RXh0ZW5zaW9uU3RhdGlzdGljc1tdO1xuXHRyZWFkb25seSB0YWdzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcmVsZWFzZURhdGU6IHN0cmluZztcblx0cmVhZG9ubHkgcHVibGlzaGVkRGF0ZTogc3RyaW5nO1xuXHRyZWFkb25seSBsYXN0VXBkYXRlZDogc3RyaW5nO1xuXHRyZWFkb25seSBjYXRlZ29yaWVzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZmxhZ3M6IHN0cmluZztcblx0cmVhZG9ubHkgbGlua1R5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJhdGluZ0xpbmtUeXBlPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlFeHRlbnNpb25zUmVzdWx0IHtcblx0cmVhZG9ubHkgZ2FsbGVyeUV4dGVuc2lvbnM6IElSYXdHYWxsZXJ5RXh0ZW5zaW9uW107XG5cdHJlYWRvbmx5IHRvdGFsOiBudW1iZXI7XG5cdHJlYWRvbmx5IGNvbnRleHQ/OiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+O1xufVxuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlRdWVyeVJlc3VsdCB7XG5cdHJlYWRvbmx5IHJlc3VsdHM6IHtcblx0XHRyZWFkb25seSBleHRlbnNpb25zOiBJUmF3R2FsbGVyeUV4dGVuc2lvbltdO1xuXHRcdHJlYWRvbmx5IHJlc3VsdE1ldGFkYXRhOiB7XG5cdFx0XHRyZWFkb25seSBtZXRhZGF0YVR5cGU6IHN0cmluZztcblx0XHRcdHJlYWRvbmx5IG1ldGFkYXRhSXRlbXM6IHtcblx0XHRcdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRcdFx0XHRyZWFkb25seSBjb3VudDogbnVtYmVyO1xuXHRcdFx0fVtdO1xuXHRcdH1bXTtcblx0fVtdO1xufVxuXG5jb25zdCBBc3NldFR5cGUgPSB7XG5cdEljb246ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLlNlcnZpY2VzLkljb25zLkRlZmF1bHQnLFxuXHREZXRhaWxzOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5TZXJ2aWNlcy5Db250ZW50LkRldGFpbHMnLFxuXHRDaGFuZ2Vsb2c6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLlNlcnZpY2VzLkNvbnRlbnQuQ2hhbmdlbG9nJyxcblx0TWFuaWZlc3Q6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLkNvZGUuTWFuaWZlc3QnLFxuXHRWU0lYOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5TZXJ2aWNlcy5WU0lYUGFja2FnZScsXG5cdExpY2Vuc2U6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLlNlcnZpY2VzLkNvbnRlbnQuTGljZW5zZScsXG5cdFJlcG9zaXRvcnk6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLlNlcnZpY2VzLkxpbmtzLlNvdXJjZScsXG5cdFNpZ25hdHVyZTogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uU2VydmljZXMuVnNpeFNpZ25hdHVyZSdcbn07XG5cbmNvbnN0IFByb3BlcnR5VHlwZSA9IHtcblx0RGVwZW5kZW5jeTogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uQ29kZS5FeHRlbnNpb25EZXBlbmRlbmNpZXMnLFxuXHRFeHRlbnNpb25QYWNrOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlLkV4dGVuc2lvblBhY2snLFxuXHRFbmdpbmU6ICdNaWNyb3NvZnQuVmlzdWFsU3R1ZGlvLkNvZGUuRW5naW5lJyxcblx0UHJlUmVsZWFzZTogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uQ29kZS5QcmVSZWxlYXNlJyxcblx0RW5hYmxlZEFwaVByb3Bvc2FsczogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uQ29kZS5FbmFibGVkQXBpUHJvcG9zYWxzJyxcblx0TG9jYWxpemVkTGFuZ3VhZ2VzOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlLkxvY2FsaXplZExhbmd1YWdlcycsXG5cdFdlYkV4dGVuc2lvbjogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uQ29kZS5XZWJFeHRlbnNpb24nLFxuXHRTcG9uc29yTGluazogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uQ29kZS5TcG9uc29yTGluaycsXG5cdFN1cHBvcnRMaW5rOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5TZXJ2aWNlcy5MaW5rcy5TdXBwb3J0Jyxcblx0RXhlY3V0ZXNDb2RlOiAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlLkV4ZWN1dGVzQ29kZScsXG5cdFByaXZhdGU6ICdQcml2YXRlTWFya2V0cGxhY2UnLFxufTtcblxuaW50ZXJmYWNlIElDcml0ZXJpdW0ge1xuXHRyZWFkb25seSBmaWx0ZXJUeXBlOiBGaWx0ZXJUeXBlO1xuXHRyZWFkb25seSB2YWx1ZT86IHN0cmluZztcbn1cblxuY29uc3QgRGVmYXVsdFBhZ2VTaXplID0gMTA7XG5cbmludGVyZmFjZSBJUXVlcnlTdGF0ZSB7XG5cdHJlYWRvbmx5IHBhZ2VOdW1iZXI6IG51bWJlcjtcblx0cmVhZG9ubHkgcGFnZVNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgc29ydEJ5OiBTb3J0Qnk7XG5cdHJlYWRvbmx5IHNvcnRPcmRlcjogU29ydE9yZGVyO1xuXHRyZWFkb25seSBmbGFnczogRmxhZ1tdO1xuXHRyZWFkb25seSBjcml0ZXJpYTogSUNyaXRlcml1bVtdO1xuXHRyZWFkb25seSBhc3NldFR5cGVzOiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgc291cmNlPzogc3RyaW5nO1xufVxuXG5jb25zdCBEZWZhdWx0UXVlcnlTdGF0ZTogSVF1ZXJ5U3RhdGUgPSB7XG5cdHBhZ2VOdW1iZXI6IDEsXG5cdHBhZ2VTaXplOiBEZWZhdWx0UGFnZVNpemUsXG5cdHNvcnRCeTogU29ydEJ5Lk5vbmVPclJlbGV2YW5jZSxcblx0c29ydE9yZGVyOiBTb3J0T3JkZXIuRGVmYXVsdCxcblx0ZmxhZ3M6IFtdLFxuXHRjcml0ZXJpYTogW10sXG5cdGFzc2V0VHlwZXM6IFtdXG59O1xuXG50eXBlIEdhbGxlcnlTZXJ2aWNlUXVlcnlDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdzYW5keTA4MSc7XG5cdGNvbW1lbnQ6ICdJbmZvcm1hdGlvbiBhYm91dCBNYXJrZXRwbGFjZSBxdWVyeSBhbmQgaXRzIHJlc3BvbnNlJztcblx0cmVhZG9ubHkgZmlsdGVyVHlwZXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdGaWx0ZXIgdHlwZXMgdXNlZCBpbiB0aGUgcXVlcnkuJyB9O1xuXHRyZWFkb25seSBmbGFnczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0ZsYWdzIHBhc3NlZCBpbiB0aGUgcXVlcnkuJyB9O1xuXHRyZWFkb25seSBzb3J0Qnk6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdzb3J0ZWQgYnkgb3B0aW9uIHBhc3NlZCBpbiB0aGUgcXVlcnknIH07XG5cdHJlYWRvbmx5IHNvcnRPcmRlcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ3NvcnQgb3JkZXIgb3B0aW9uIHBhc3NlZCBpbiB0aGUgcXVlcnknIH07XG5cdHJlYWRvbmx5IHBhZ2VOdW1iZXI6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdyZXF1ZXN0ZWQgcGFnZSBudW1iZXIgaW4gdGhlIHF1ZXJ5JyB9O1xuXHRyZWFkb25seSBkdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgJ2lzTWVhc3VyZW1lbnQnOiB0cnVlOyBjb21tZW50OiAnYW1vdW50IG9mIHRpbWUgdGFrZW4gYnkgdGhlIHF1ZXJ5IHJlcXVlc3QnIH07XG5cdHJlYWRvbmx5IHN1Y2Nlc3M6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICd3aGV0aGVyIHRoZSBxdWVyeSByZXF1ZXN0IGlzIHN1Y2Nlc3Mgb3Igbm90JyB9O1xuXHRyZWFkb25seSByZXF1ZXN0Qm9keVNpemU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdzaXplIG9mIHRoZSByZXF1ZXN0IGJvZHknIH07XG5cdHJlYWRvbmx5IHJlc3BvbnNlQm9keVNpemU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnc2l6ZSBvZiB0aGUgcmVzcG9uc2UgYm9keScgfTtcblx0cmVhZG9ubHkgc3RhdHVzQ29kZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdzdGF0dXMgY29kZSBvZiB0aGUgcmVzcG9uc2UnIH07XG5cdHJlYWRvbmx5IGVycm9yQ29kZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdlcnJvciBjb2RlIG9mIHRoZSByZXNwb25zZScgfTtcblx0cmVhZG9ubHkgY291bnQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAndG90YWwgbnVtYmVyIG9mIGV4dGVuc2lvbnMgbWF0Y2hpbmcgdGhlIHF1ZXJ5JyB9O1xuXHRyZWFkb25seSBzb3VyY2U/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnc291cmNlIHRoYXQgcmVxdWVzdGVkIHRoaXMgcXVlcnksIGVnLiwgcmVjb21tZW5kYXRpb25zLCB2aWV3bGV0JyB9O1xuXHRyZWFkb25seSBzZWFyY2hUZXh0TGVuZ3RoPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ2xlbmd0aCBvZiB0aGUgc2VhcmNoIHRleHQgaW4gdGhlIHF1ZXJ5JyB9O1xuXHRyZWFkb25seSBzZXJ2ZXI/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnc2VydmVyIHRoYXQgaGFuZGxlZCB0aGUgcXVlcnknIH07XG5cdHJlYWRvbmx5IGVuZFRvRW5kSWQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnZW5kIHRvIGVuZCBvcGVyYXRpb24gaWQnIH07XG5cdHJlYWRvbmx5IGFjdGl2aXR5SWQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnYWN0aXZpdHkgaWQnIH07XG59O1xuXG50eXBlIFF1ZXJ5VGVsZW1ldHJ5RGF0YSA9IHtcblx0cmVhZG9ubHkgZmlsdGVyVHlwZXM6IHN0cmluZ1tdO1xuXHRyZWFkb25seSBmbGFnczogc3RyaW5nW107XG5cdHJlYWRvbmx5IHNvcnRCeTogc3RyaW5nO1xuXHRyZWFkb25seSBzb3J0T3JkZXI6IHN0cmluZztcblx0cmVhZG9ubHkgcGFnZU51bWJlcjogc3RyaW5nO1xuXHRyZWFkb25seSBzb3VyY2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlYXJjaFRleHRMZW5ndGg/OiBudW1iZXI7XG59O1xuXG50eXBlIEdhbGxlcnlTZXJ2aWNlUXVlcnlFdmVudCA9IFF1ZXJ5VGVsZW1ldHJ5RGF0YSAmIHtcblx0cmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcblx0cmVhZG9ubHkgc3VjY2VzczogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVxdWVzdEJvZHlTaXplOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc3BvbnNlQm9keVNpemU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXR1c0NvZGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVycm9yQ29kZT86IHN0cmluZztcblx0cmVhZG9ubHkgY291bnQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlcnZlcj86IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRyZWFkb25seSBlbmRUb0VuZElkPzogVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdHJlYWRvbmx5IGFjdGl2aXR5SWQ/OiBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPjtcbn07XG5cbnR5cGUgR2FsbGVyeVNlcnZpY2VBZGRpdGlvbmFsUXVlcnlDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdzYW5keTA4MSc7XG5cdGNvbW1lbnQ6ICdSZXNwb25zZSBpbmZvcm1hdGlvbiBhYm91dCB0aGUgYWRkaXRpb25hbCBxdWVyeSB0byB0aGUgTWFya2V0cGxhY2UgZm9yIGZldGNoaW5nIGFsbCB2ZXJzaW9ucyB0byBnZXQgcmVsZWFzZSB2ZXJzaW9uJztcblx0cmVhZG9ubHkgZHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7ICdpc01lYXN1cmVtZW50JzogdHJ1ZTsgY29tbWVudDogJ0Ftb3VudCBvZiB0aW1lIHRha2VuIGJ5IHRoZSBhZGRpdGlvbmFsIHF1ZXJ5JyB9O1xuXHRyZWFkb25seSBjb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RvdGFsIG51bWJlciBvZiBleHRlbnNpb25zIHJldHVybmVkIGJ5IHRoaXMgYWRkaXRpb25hbCBxdWVyeScgfTtcbn07XG5cbnR5cGUgR2FsbGVyeVNlcnZpY2VBZGRpdGlvbmFsUXVlcnlFdmVudCA9IHtcblx0cmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcblx0cmVhZG9ubHkgY291bnQ6IG51bWJlcjtcbn07XG5cbnR5cGUgRXh0ZW5zaW9uc0NyaXRlcmlhID0ge1xuXHRyZWFkb25seSBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uO1xuXHRyZWFkb25seSB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm07XG5cdHJlYWRvbmx5IGNvbXBhdGlibGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuIHwgKElFeHRlbnNpb25JZGVudGlmaWVyICYgeyBpbmNsdWRlUHJlUmVsZWFzZTogYm9vbGVhbiB9KVtdO1xuXHRyZWFkb25seSB2ZXJzaW9ucz86IChJRXh0ZW5zaW9uSWRlbnRpZmllciAmIHsgdmVyc2lvbjogc3RyaW5nIH0pW107XG5cdHJlYWRvbmx5IGlzUXVlcnlGb3JSZWxlYXNlVmVyc2lvbkZyb21QcmVSZWxlYXNlVmVyc2lvbj86IGJvb2xlYW47XG59O1xuXG5jb25zdCBlbnVtIFZlcnNpb25LaW5kIHtcblx0UmVsZWFzZSxcblx0UHJlcmVsZWFzZSxcblx0TGF0ZXN0XG59XG5cbnR5cGUgRXh0ZW5zaW9uVmVyc2lvbkNyaXRlcmlhID0ge1xuXHRyZWFkb25seSBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uO1xuXHRyZWFkb25seSB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm07XG5cdHJlYWRvbmx5IGNvbXBhdGlibGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZlcnNpb246IFZlcnNpb25LaW5kIHwgc3RyaW5nO1xufTtcblxuY2xhc3MgUXVlcnkge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgc3RhdGUgPSBEZWZhdWx0UXVlcnlTdGF0ZSkgeyB9XG5cblx0Z2V0IHBhZ2VOdW1iZXIoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuc3RhdGUucGFnZU51bWJlcjsgfVxuXHRnZXQgcGFnZVNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuc3RhdGUucGFnZVNpemU7IH1cblx0Z2V0IHNvcnRCeSgpOiBTb3J0QnkgeyByZXR1cm4gdGhpcy5zdGF0ZS5zb3J0Qnk7IH1cblx0Z2V0IHNvcnRPcmRlcigpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5zdGF0ZS5zb3J0T3JkZXI7IH1cblx0Z2V0IGZsYWdzKCk6IEZsYWdbXSB7IHJldHVybiB0aGlzLnN0YXRlLmZsYWdzOyB9XG5cdGdldCBjcml0ZXJpYSgpOiBJQ3JpdGVyaXVtW10geyByZXR1cm4gdGhpcy5zdGF0ZS5jcml0ZXJpYTsgfVxuXHRnZXQgYXNzZXRUeXBlcygpOiBzdHJpbmdbXSB7IHJldHVybiB0aGlzLnN0YXRlLmFzc2V0VHlwZXM7IH1cblx0Z2V0IHNvdXJjZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5zdGF0ZS5zb3VyY2U7IH1cblx0Z2V0IHNlYXJjaFRleHQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBjcml0ZXJpdW0gPSB0aGlzLnN0YXRlLmNyaXRlcmlhLmZpbHRlcihjcml0ZXJpdW0gPT4gY3JpdGVyaXVtLmZpbHRlclR5cGUgPT09IEZpbHRlclR5cGUuU2VhcmNoVGV4dClbMF07XG5cdFx0cmV0dXJuIGNyaXRlcml1bSAmJiBjcml0ZXJpdW0udmFsdWUgPyBjcml0ZXJpdW0udmFsdWUgOiAnJztcblx0fVxuXG5cblx0d2l0aFBhZ2UocGFnZU51bWJlcjogbnVtYmVyLCBwYWdlU2l6ZTogbnVtYmVyID0gdGhpcy5zdGF0ZS5wYWdlU2l6ZSk6IFF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IFF1ZXJ5KHsgLi4udGhpcy5zdGF0ZSwgcGFnZU51bWJlciwgcGFnZVNpemUgfSk7XG5cdH1cblxuXHR3aXRoRmlsdGVyKGZpbHRlclR5cGU6IEZpbHRlclR5cGUsIC4uLnZhbHVlczogc3RyaW5nW10pOiBRdWVyeSB7XG5cdFx0Y29uc3QgY3JpdGVyaWEgPSBbXG5cdFx0XHQuLi50aGlzLnN0YXRlLmNyaXRlcmlhLFxuXHRcdFx0Li4udmFsdWVzLmxlbmd0aCA/IHZhbHVlcy5tYXAodmFsdWUgPT4gKHsgZmlsdGVyVHlwZSwgdmFsdWUgfSkpIDogW3sgZmlsdGVyVHlwZSB9XVxuXHRcdF07XG5cblx0XHRyZXR1cm4gbmV3IFF1ZXJ5KHsgLi4udGhpcy5zdGF0ZSwgY3JpdGVyaWEgfSk7XG5cdH1cblxuXHR3aXRoU29ydEJ5KHNvcnRCeTogU29ydEJ5KTogUXVlcnkge1xuXHRcdHJldHVybiBuZXcgUXVlcnkoeyAuLi50aGlzLnN0YXRlLCBzb3J0QnkgfSk7XG5cdH1cblxuXHR3aXRoU29ydE9yZGVyKHNvcnRPcmRlcjogU29ydE9yZGVyKTogUXVlcnkge1xuXHRcdHJldHVybiBuZXcgUXVlcnkoeyAuLi50aGlzLnN0YXRlLCBzb3J0T3JkZXIgfSk7XG5cdH1cblxuXHR3aXRoRmxhZ3MoLi4uZmxhZ3M6IEZsYWdbXSk6IFF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IFF1ZXJ5KHsgLi4udGhpcy5zdGF0ZSwgZmxhZ3M6IGRpc3RpbmN0KGZsYWdzKSB9KTtcblx0fVxuXG5cdHdpdGhBc3NldFR5cGVzKC4uLmFzc2V0VHlwZXM6IHN0cmluZ1tdKTogUXVlcnkge1xuXHRcdHJldHVybiBuZXcgUXVlcnkoeyAuLi50aGlzLnN0YXRlLCBhc3NldFR5cGVzIH0pO1xuXHR9XG5cblx0d2l0aFNvdXJjZShzb3VyY2U6IHN0cmluZyk6IFF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IFF1ZXJ5KHsgLi4udGhpcy5zdGF0ZSwgc291cmNlIH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFN0YXRpc3RpYyhzdGF0aXN0aWNzOiBJUmF3R2FsbGVyeUV4dGVuc2lvblN0YXRpc3RpY3NbXSwgbmFtZTogc3RyaW5nKTogbnVtYmVyIHtcblx0Y29uc3QgcmVzdWx0ID0gKHN0YXRpc3RpY3MgfHwgW10pLmZpbHRlcihzID0+IHMuc3RhdGlzdGljTmFtZSA9PT0gbmFtZSlbMF07XG5cdHJldHVybiByZXN1bHQgPyByZXN1bHQudmFsdWUgOiAwO1xufVxuXG5mdW5jdGlvbiBnZXRDb3JlVHJhbnNsYXRpb25Bc3NldHModmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKTogW3N0cmluZywgSUdhbGxlcnlFeHRlbnNpb25Bc3NldF1bXSB7XG5cdGNvbnN0IGNvcmVUcmFuc2xhdGlvbkFzc2V0UHJlZml4ID0gJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uQ29kZS5UcmFuc2xhdGlvbi4nO1xuXHRjb25zdCByZXN1bHQgPSB2ZXJzaW9uLmZpbGVzLmZpbHRlcihmID0+IGYuYXNzZXRUeXBlLmluZGV4T2YoY29yZVRyYW5zbGF0aW9uQXNzZXRQcmVmaXgpID09PSAwKTtcblx0cmV0dXJuIHJlc3VsdC5yZWR1Y2U8W3N0cmluZywgSUdhbGxlcnlFeHRlbnNpb25Bc3NldF1bXT4oKHJlc3VsdCwgZmlsZSkgPT4ge1xuXHRcdGNvbnN0IGFzc2V0ID0gZ2V0VmVyc2lvbkFzc2V0KHZlcnNpb24sIGZpbGUuYXNzZXRUeXBlKTtcblx0XHRpZiAoYXNzZXQpIHtcblx0XHRcdHJlc3VsdC5wdXNoKFtmaWxlLmFzc2V0VHlwZS5zdWJzdHJpbmcoY29yZVRyYW5zbGF0aW9uQXNzZXRQcmVmaXgubGVuZ3RoKSwgYXNzZXRdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fSwgW10pO1xufVxuXG5mdW5jdGlvbiBnZXRSZXBvc2l0b3J5QXNzZXQodmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKTogSUdhbGxlcnlFeHRlbnNpb25Bc3NldCB8IG51bGwge1xuXHRpZiAodmVyc2lvbi5wcm9wZXJ0aWVzKSB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHZlcnNpb24ucHJvcGVydGllcy5maWx0ZXIocCA9PiBwLmtleSA9PT0gQXNzZXRUeXBlLlJlcG9zaXRvcnkpO1xuXHRcdGNvbnN0IGdpdFJlZ0V4cCA9IG5ldyBSZWdFeHAoJygoZ2l0fHNzaHxodHRwKHMpPyl8KGdpdEBbXFxcXHcuXSspKSg6KC8vKT8pKFtcXFxcdy5AOi9cXFxcLX5dKykoLmdpdCkoLyk/Jyk7XG5cblx0XHRjb25zdCB1cmkgPSByZXN1bHRzLmZpbHRlcihyID0+IGdpdFJlZ0V4cC50ZXN0KHIudmFsdWUpKVswXTtcblx0XHRyZXR1cm4gdXJpID8geyB1cmk6IHVyaS52YWx1ZSwgZmFsbGJhY2tVcmk6IHVyaS52YWx1ZSB9IDogbnVsbDtcblx0fVxuXHRyZXR1cm4gZ2V0VmVyc2lvbkFzc2V0KHZlcnNpb24sIEFzc2V0VHlwZS5SZXBvc2l0b3J5KTtcbn1cblxuZnVuY3Rpb24gZ2V0RG93bmxvYWRBc3NldCh2ZXJzaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pOiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0IHtcblx0cmV0dXJuIHtcblx0XHQvLyBhbHdheXMgdXNlIGZhbGxiYWNrQXNzZXRVcmkgZm9yIGRvd25sb2FkIGFzc2V0IHRvIGhpdCB0aGUgTWFya2V0cGxhY2UgQVBJIHNvIHRoYXQgZG93bmxvYWRzIGFyZSBjb3VudGVkXG5cdFx0dXJpOiBgJHt2ZXJzaW9uLmZhbGxiYWNrQXNzZXRVcml9LyR7QXNzZXRUeXBlLlZTSVh9P3JlZGlyZWN0PXRydWUke3ZlcnNpb24udGFyZ2V0UGxhdGZvcm0gPyBgJnRhcmdldFBsYXRmb3JtPSR7dmVyc2lvbi50YXJnZXRQbGF0Zm9ybX1gIDogJyd9YCxcblx0XHRmYWxsYmFja1VyaTogYCR7dmVyc2lvbi5mYWxsYmFja0Fzc2V0VXJpfS8ke0Fzc2V0VHlwZS5WU0lYfSR7dmVyc2lvbi50YXJnZXRQbGF0Zm9ybSA/IGA/dGFyZ2V0UGxhdGZvcm09JHt2ZXJzaW9uLnRhcmdldFBsYXRmb3JtfWAgOiAnJ31gXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldFZlcnNpb25Bc3NldCh2ZXJzaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIHR5cGU6IHN0cmluZyk6IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXQgfCBudWxsIHtcblx0Y29uc3QgcmVzdWx0ID0gdmVyc2lvbi5maWxlcy5maWx0ZXIoZiA9PiBmLmFzc2V0VHlwZSA9PT0gdHlwZSlbMF07XG5cdHJldHVybiByZXN1bHQgPyB7XG5cdFx0dXJpOiBgJHt2ZXJzaW9uLmFzc2V0VXJpfS8ke3R5cGV9JHt2ZXJzaW9uLnRhcmdldFBsYXRmb3JtID8gYD90YXJnZXRQbGF0Zm9ybT0ke3ZlcnNpb24udGFyZ2V0UGxhdGZvcm19YCA6ICcnfWAsXG5cdFx0ZmFsbGJhY2tVcmk6IGAke3ZlcnNpb24uZmFsbGJhY2tBc3NldFVyaX0vJHt0eXBlfSR7dmVyc2lvbi50YXJnZXRQbGF0Zm9ybSA/IGA/dGFyZ2V0UGxhdGZvcm09JHt2ZXJzaW9uLnRhcmdldFBsYXRmb3JtfWAgOiAnJ31gXG5cdH0gOiBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRFeHRlbnNpb25zKHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiwgcHJvcGVydHk6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0Y29uc3QgdmFsdWVzID0gdmVyc2lvbi5wcm9wZXJ0aWVzID8gdmVyc2lvbi5wcm9wZXJ0aWVzLmZpbHRlcihwID0+IHAua2V5ID09PSBwcm9wZXJ0eSkgOiBbXTtcblx0Y29uc3QgdmFsdWUgPSB2YWx1ZXMubGVuZ3RoID4gMCAmJiB2YWx1ZXNbMF0udmFsdWU7XG5cdHJldHVybiB2YWx1ZSA/IHZhbHVlLnNwbGl0KCcsJykubWFwKHYgPT4gYWRvcHRUb0dhbGxlcnlFeHRlbnNpb25JZCh2KSkgOiBbXTtcbn1cblxuZnVuY3Rpb24gZ2V0RW5naW5lKHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IHN0cmluZyB7XG5cdGNvbnN0IHZhbHVlcyA9IHZlcnNpb24ucHJvcGVydGllcyA/IHZlcnNpb24ucHJvcGVydGllcy5maWx0ZXIocCA9PiBwLmtleSA9PT0gUHJvcGVydHlUeXBlLkVuZ2luZSkgOiBbXTtcblx0cmV0dXJuICh2YWx1ZXMubGVuZ3RoID4gMCAmJiB2YWx1ZXNbMF0udmFsdWUpIHx8ICcnO1xufVxuXG5mdW5jdGlvbiBzZXRFbmdpbmUodmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uLCBlbmdpbmU6IHN0cmluZyk6IHZvaWQge1xuXHR2ZXJzaW9uLnByb3BlcnRpZXMgPSB2ZXJzaW9uLnByb3BlcnRpZXMgPz8gW107XG5cdHZlcnNpb24ucHJvcGVydGllcy5wdXNoKHsga2V5OiBQcm9wZXJ0eVR5cGUuRW5naW5lLCB2YWx1ZTogZW5naW5lIH0pO1xufVxuXG5mdW5jdGlvbiBpc1ByZVJlbGVhc2VWZXJzaW9uKHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IGJvb2xlYW4ge1xuXHRjb25zdCB2YWx1ZXMgPSB2ZXJzaW9uLnByb3BlcnRpZXMgPyB2ZXJzaW9uLnByb3BlcnRpZXMuZmlsdGVyKHAgPT4gcC5rZXkgPT09IFByb3BlcnR5VHlwZS5QcmVSZWxlYXNlKSA6IFtdO1xuXHRyZXR1cm4gdmFsdWVzLmxlbmd0aCA+IDAgJiYgdmFsdWVzWzBdLnZhbHVlID09PSAndHJ1ZSc7XG59XG5cbmZ1bmN0aW9uIGhhc1ByZVJlbGVhc2VGb3JFeHRlbnNpb24oaWQ6IHN0cmluZywgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gcHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uUHJvcGVydGllcz8uW2lkLnRvTG93ZXJDYXNlKCldPy5oYXNQcmVyZWxlYXNlVmVyc2lvbjtcbn1cblxuZnVuY3Rpb24gZ2V0RXhjbHVkZVZlcnNpb25SYW5nZUZvckV4dGVuc2lvbihpZDogc3RyaW5nLCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvblByb3BlcnRpZXM/LltpZC50b0xvd2VyQ2FzZSgpXT8uZXhjbHVkZVZlcnNpb25SYW5nZTtcbn1cblxuZnVuY3Rpb24gaXNQcml2YXRlRXh0ZW5zaW9uKHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IGJvb2xlYW4ge1xuXHRjb25zdCB2YWx1ZXMgPSB2ZXJzaW9uLnByb3BlcnRpZXMgPyB2ZXJzaW9uLnByb3BlcnRpZXMuZmlsdGVyKHAgPT4gcC5rZXkgPT09IFByb3BlcnR5VHlwZS5Qcml2YXRlKSA6IFtdO1xuXHRyZXR1cm4gdmFsdWVzLmxlbmd0aCA+IDAgJiYgdmFsdWVzWzBdLnZhbHVlID09PSAndHJ1ZSc7XG59XG5cbmZ1bmN0aW9uIGV4ZWN1dGVzQ29kZSh2ZXJzaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdmFsdWVzID0gdmVyc2lvbi5wcm9wZXJ0aWVzID8gdmVyc2lvbi5wcm9wZXJ0aWVzLmZpbHRlcihwID0+IHAua2V5ID09PSBQcm9wZXJ0eVR5cGUuRXhlY3V0ZXNDb2RlKSA6IFtdO1xuXHRyZXR1cm4gdmFsdWVzLmxlbmd0aCA+IDAgPyB2YWx1ZXNbMF0udmFsdWUgPT09ICd0cnVlJyA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0RW5hYmxlZEFwaVByb3Bvc2Fscyh2ZXJzaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHZhbHVlcyA9IHZlcnNpb24ucHJvcGVydGllcyA/IHZlcnNpb24ucHJvcGVydGllcy5maWx0ZXIocCA9PiBwLmtleSA9PT0gUHJvcGVydHlUeXBlLkVuYWJsZWRBcGlQcm9wb3NhbHMpIDogW107XG5cdGNvbnN0IHZhbHVlID0gKHZhbHVlcy5sZW5ndGggPiAwICYmIHZhbHVlc1swXS52YWx1ZSkgfHwgJyc7XG5cdHJldHVybiB2YWx1ZSA/IHZhbHVlLnNwbGl0KCcsJykgOiBbXTtcbn1cblxuZnVuY3Rpb24gZ2V0TG9jYWxpemVkTGFuZ3VhZ2VzKHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IHN0cmluZ1tdIHtcblx0Y29uc3QgdmFsdWVzID0gdmVyc2lvbi5wcm9wZXJ0aWVzID8gdmVyc2lvbi5wcm9wZXJ0aWVzLmZpbHRlcihwID0+IHAua2V5ID09PSBQcm9wZXJ0eVR5cGUuTG9jYWxpemVkTGFuZ3VhZ2VzKSA6IFtdO1xuXHRjb25zdCB2YWx1ZSA9ICh2YWx1ZXMubGVuZ3RoID4gMCAmJiB2YWx1ZXNbMF0udmFsdWUpIHx8ICcnO1xuXHRyZXR1cm4gdmFsdWUgPyB2YWx1ZS5zcGxpdCgnLCcpIDogW107XG59XG5cbmZ1bmN0aW9uIGdldFNwb25zb3JMaW5rKHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB2ZXJzaW9uLnByb3BlcnRpZXM/LmZpbmQocCA9PiBwLmtleSA9PT0gUHJvcGVydHlUeXBlLlNwb25zb3JMaW5rKT8udmFsdWU7XG59XG5cbmZ1bmN0aW9uIGdldFN1cHBvcnRMaW5rKHZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB2ZXJzaW9uLnByb3BlcnRpZXM/LmZpbmQocCA9PiBwLmtleSA9PT0gUHJvcGVydHlUeXBlLlN1cHBvcnRMaW5rKT8udmFsdWU7XG59XG5cbmZ1bmN0aW9uIGdldElzUHJldmlldyhmbGFnczogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBmbGFncy5pbmRleE9mKCdwcmV2aWV3JykgIT09IC0xO1xufVxuXG5mdW5jdGlvbiBnZXRUYXJnZXRQbGF0Zm9ybUZvckV4dGVuc2lvblZlcnNpb24odmVyc2lvbjogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKTogVGFyZ2V0UGxhdGZvcm0ge1xuXHRyZXR1cm4gdmVyc2lvbi50YXJnZXRQbGF0Zm9ybSA/IHRvVGFyZ2V0UGxhdGZvcm0odmVyc2lvbi50YXJnZXRQbGF0Zm9ybSkgOiBUYXJnZXRQbGF0Zm9ybS5VTkRFRklORUQ7XG59XG5cbmZ1bmN0aW9uIGdldEFsbFRhcmdldFBsYXRmb3JtcyhyYXdHYWxsZXJ5RXh0ZW5zaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvbik6IFRhcmdldFBsYXRmb3JtW10ge1xuXHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBkaXN0aW5jdChyYXdHYWxsZXJ5RXh0ZW5zaW9uLnZlcnNpb25zLm1hcChnZXRUYXJnZXRQbGF0Zm9ybUZvckV4dGVuc2lvblZlcnNpb24pKTtcblxuXHQvLyBJcyBhIHdlYiBleHRlbnNpb24gb25seSBpZiBpdCBoYXMgV0VCX0VYVEVOU0lPTl9UQUdcblx0Y29uc3QgaXNXZWJFeHRlbnNpb24gPSAhIXJhd0dhbGxlcnlFeHRlbnNpb24udGFncz8uaW5jbHVkZXMoV0VCX0VYVEVOU0lPTl9UQUcpO1xuXG5cdC8vIEluY2x1ZGUgV2ViIFRhcmdldCBQbGF0Zm9ybSBvbmx5IGlmIGl0IGlzIGEgd2ViIGV4dGVuc2lvblxuXHRjb25zdCB3ZWJUYXJnZXRQbGF0Zm9ybUluZGV4ID0gYWxsVGFyZ2V0UGxhdGZvcm1zLmluZGV4T2YoVGFyZ2V0UGxhdGZvcm0uV0VCKTtcblx0aWYgKGlzV2ViRXh0ZW5zaW9uKSB7XG5cdFx0aWYgKHdlYlRhcmdldFBsYXRmb3JtSW5kZXggPT09IC0xKSB7XG5cdFx0XHQvLyBXZWIgZXh0ZW5zaW9uIGJ1dCBkb2VzIG5vdCBoYXMgd2ViIHRhcmdldCBwbGF0Zm9ybSAtPiBhZGQgaXRcblx0XHRcdGFsbFRhcmdldFBsYXRmb3Jtcy5wdXNoKFRhcmdldFBsYXRmb3JtLldFQik7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGlmICh3ZWJUYXJnZXRQbGF0Zm9ybUluZGV4ICE9PSAtMSkge1xuXHRcdFx0Ly8gTm90IGEgd2ViIGV4dGVuc2lvbiBidXQgaGFzIHdlYiB0YXJnZXQgcGxhdGZvcm0gLT4gcmVtb3ZlIGl0XG5cdFx0XHRhbGxUYXJnZXRQbGF0Zm9ybXMuc3BsaWNlKHdlYlRhcmdldFBsYXRmb3JtSW5kZXgsIDEpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBhbGxUYXJnZXRQbGF0Zm9ybXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzb3J0RXh0ZW5zaW9uVmVyc2lvbnModmVyc2lvbnM6IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbltdLCBwcmVmZXJyZWRUYXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0pOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb25bXSB7XG5cdC8qIEl0IGlzIGV4cGVjdGVkIHRoYXQgdmVyc2lvbnMgZnJvbSBNYXJrZXRwbGFjZSBhcmUgc29ydGVkIGJ5IHZlcnNpb24uIFNvIHdlIGFyZSBqdXN0IHNvcnRpbmcgYnkgcHJlZmVycmVkIHRhcmdldFBsYXRmb3JtICovXG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB2ZXJzaW9ucy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRjb25zdCB2ZXJzaW9uID0gdmVyc2lvbnNbaW5kZXhdO1xuXHRcdGlmICh2ZXJzaW9uLnZlcnNpb24gPT09IHZlcnNpb25zW2luZGV4IC0gMV0/LnZlcnNpb24pIHtcblx0XHRcdGxldCBpbnNlcnRpb25JbmRleCA9IGluZGV4O1xuXHRcdFx0Y29uc3QgdmVyc2lvblRhcmdldFBsYXRmb3JtID0gZ2V0VGFyZ2V0UGxhdGZvcm1Gb3JFeHRlbnNpb25WZXJzaW9uKHZlcnNpb24pO1xuXHRcdFx0LyogcHV0IGl0IGF0IHRoZSBiZWdpbm5pbmcgKi9cblx0XHRcdGlmICh2ZXJzaW9uVGFyZ2V0UGxhdGZvcm0gPT09IHByZWZlcnJlZFRhcmdldFBsYXRmb3JtKSB7XG5cdFx0XHRcdHdoaWxlIChpbnNlcnRpb25JbmRleCA+IDAgJiYgdmVyc2lvbnNbaW5zZXJ0aW9uSW5kZXggLSAxXS52ZXJzaW9uID09PSB2ZXJzaW9uLnZlcnNpb24pIHsgaW5zZXJ0aW9uSW5kZXgtLTsgfVxuXHRcdFx0fVxuXHRcdFx0aWYgKGluc2VydGlvbkluZGV4ICE9PSBpbmRleCkge1xuXHRcdFx0XHR2ZXJzaW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHR2ZXJzaW9ucy5zcGxpY2UoaW5zZXJ0aW9uSW5kZXgsIDAsIHZlcnNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gdmVyc2lvbnM7XG59XG5cbi8qKlxuICogRmlsdGVycyBleHRlbnNpb24gdmVyc2lvbnMgdG8gcmV0dXJuIG9ubHkgdGhlIHJlbGV2YW50IHZlcnNpb25zIGZvciBhIGdpdmVuIHRhcmdldCBwbGF0Zm9ybS5cbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIHByb2Nlc3NlcyBhIGxpc3Qgb2YgZXh0ZW5zaW9uIHZlcnNpb25zIChleHBlY3RlZCB0byBiZSBzb3J0ZWQgYnkgdmVyc2lvbiBkZXNjZW5kaW5nKVxuICogYW5kIHJldHVybnMgYSBmaWx0ZXJlZCBsaXN0IGNvbnRhaW5pbmc6XG4gKiAxLiBBbGwgdmVyc2lvbnMgdGhhdCBhcmUgTk9UIGNvbXBhdGlibGUgd2l0aCB0aGUgdGFyZ2V0IHBsYXRmb3JtIChmb3Igb3RoZXIgcGxhdGZvcm1zKVxuICogMi4gQXQgbW9zdCBvbmUgY29tcGF0aWJsZSByZWxlYXNlIHZlcnNpb24gKHRoZSBmaXJzdC9sYXRlc3Qgb25lIGVuY291bnRlcmVkKVxuICogMy4gQXQgbW9zdCBvbmUgY29tcGF0aWJsZSBwcmUtcmVsZWFzZSB2ZXJzaW9uICh0aGUgZmlyc3QvbGF0ZXN0IG9uZSBlbmNvdW50ZXJlZClcbiAqXG4gKiBXaGVuIGEgcGxhdGZvcm0tc3BlY2lmaWMgdmVyc2lvbiAoZXhhY3RseSBtYXRjaGluZyB0YXJnZXRQbGF0Zm9ybSkgaXMgZW5jb3VudGVyZWQgd2l0aCB0aGUgc2FtZVxuICogdmVyc2lvbiBudW1iZXIgYXMgYSBwcmV2aW91c2x5IHN0b3JlZCB1bml2ZXJzYWwvdW5kZWZpbmVkIHZlcnNpb24sIGl0IHJlcGxhY2VzIHRoYXQgdmVyc2lvbi5cbiAqIFRoaXMgZW5zdXJlcyBwbGF0Zm9ybS1zcGVjaWZpYyBidWlsZHMgYXJlIHByZWZlcnJlZCBvdmVyIHVuaXZlcnNhbCBidWlsZHMgZm9yIHRoZSBzYW1lIHZlcnNpb24uXG4gKlxuICogQHBhcmFtIHZlcnNpb25zIC0gQXJyYXkgb2YgZXh0ZW5zaW9uIHZlcnNpb25zLCBleHBlY3RlZCB0byBiZSBzb3J0ZWQgYnkgdmVyc2lvbiBudW1iZXIgZGVzY2VuZGluZ1xuICogQHBhcmFtIHRhcmdldFBsYXRmb3JtIC0gVGhlIHRhcmdldCBwbGF0Zm9ybSB0byBmaWx0ZXIgZm9yIChlLmcuLCBMSU5VWF9YNjQsIFdJTjMyX1g2NClcbiAqIEBwYXJhbSBhbGxUYXJnZXRQbGF0Zm9ybXMgLSBBbGwgdGFyZ2V0IHBsYXRmb3JtcyB0aGUgZXh0ZW5zaW9uIHN1cHBvcnRzXG4gKiBAcmV0dXJucyBGaWx0ZXJlZCBhcnJheSBvZiB2ZXJzaW9ucyByZWxldmFudCBmb3IgdGhlIHRhcmdldCBwbGF0Zm9ybVxuICovXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyTGF0ZXN0RXh0ZW5zaW9uVmVyc2lvbnNGb3JUYXJnZXRQbGF0Zm9ybSh2ZXJzaW9uczogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10sIHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybSwgYWxsVGFyZ2V0UGxhdGZvcm1zOiBUYXJnZXRQbGF0Zm9ybVtdKTogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10ge1xuXHRjb25zdCBsYXRlc3RWZXJzaW9uczogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10gPSBbXTtcblxuXHRsZXQgcHJlUmVsZWFzZVZlcnNpb25JbmRleDogbnVtYmVyID0gLTE7XG5cdGxldCByZWxlYXNlVmVyc2lvbkluZGV4OiBudW1iZXIgPSAtMTtcblx0Zm9yIChjb25zdCB2ZXJzaW9uIG9mIHZlcnNpb25zKSB7XG5cdFx0Y29uc3QgdmVyc2lvblRhcmdldFBsYXRmb3JtID0gZ2V0VGFyZ2V0UGxhdGZvcm1Gb3JFeHRlbnNpb25WZXJzaW9uKHZlcnNpb24pO1xuXHRcdGNvbnN0IGlzQ29tcGF0aWJsZVdpdGhUYXJnZXRQbGF0Zm9ybSA9IGlzVGFyZ2V0UGxhdGZvcm1Db21wYXRpYmxlKHZlcnNpb25UYXJnZXRQbGF0Zm9ybSwgYWxsVGFyZ2V0UGxhdGZvcm1zLCB0YXJnZXRQbGF0Zm9ybSk7XG5cblx0XHQvLyBBbHdheXMgaW5jbHVkZSB2ZXJzaW9ucyB0aGF0IGFyZSBOT1QgY29tcGF0aWJsZSB3aXRoIHRoZSB0YXJnZXQgcGxhdGZvcm1cblx0XHRpZiAoIWlzQ29tcGF0aWJsZVdpdGhUYXJnZXRQbGF0Zm9ybSkge1xuXHRcdFx0bGF0ZXN0VmVyc2lvbnMucHVzaCh2ZXJzaW9uKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdC8vIEZvciBjb21wYXRpYmxlIHZlcnNpb25zLCBvbmx5IGluY2x1ZGUgdGhlIGZpcnN0IChsYXRlc3QpIG9mIGVhY2ggdHlwZVxuXHRcdC8vIFByZWZlciBzcGVjaWZpYyB0YXJnZXQgcGxhdGZvcm0gbWF0Y2hlcyBvdmVyIHVuZGVmaW5lZC91bml2ZXJzYWwgcGxhdGZvcm1zIG9ubHkgd2hlbiB2ZXJzaW9uIG51bWJlcnMgYXJlIHRoZSBzYW1lXG5cdFx0aWYgKGlzUHJlUmVsZWFzZVZlcnNpb24odmVyc2lvbikpIHtcblx0XHRcdGlmIChwcmVSZWxlYXNlVmVyc2lvbkluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRwcmVSZWxlYXNlVmVyc2lvbkluZGV4ID0gbGF0ZXN0VmVyc2lvbnMubGVuZ3RoO1xuXHRcdFx0XHRsYXRlc3RWZXJzaW9ucy5wdXNoKHZlcnNpb24pO1xuXHRcdFx0fSBlbHNlIGlmICh2ZXJzaW9uVGFyZ2V0UGxhdGZvcm0gPT09IHRhcmdldFBsYXRmb3JtICYmIGxhdGVzdFZlcnNpb25zW3ByZVJlbGVhc2VWZXJzaW9uSW5kZXhdLnZlcnNpb24gPT09IHZlcnNpb24udmVyc2lvbikge1xuXHRcdFx0XHRsYXRlc3RWZXJzaW9uc1twcmVSZWxlYXNlVmVyc2lvbkluZGV4XSA9IHZlcnNpb247XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChyZWxlYXNlVmVyc2lvbkluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRyZWxlYXNlVmVyc2lvbkluZGV4ID0gbGF0ZXN0VmVyc2lvbnMubGVuZ3RoO1xuXHRcdFx0XHRsYXRlc3RWZXJzaW9ucy5wdXNoKHZlcnNpb24pO1xuXHRcdFx0fSBlbHNlIGlmICh2ZXJzaW9uVGFyZ2V0UGxhdGZvcm0gPT09IHRhcmdldFBsYXRmb3JtICYmIGxhdGVzdFZlcnNpb25zW3JlbGVhc2VWZXJzaW9uSW5kZXhdLnZlcnNpb24gPT09IHZlcnNpb24udmVyc2lvbikge1xuXHRcdFx0XHRsYXRlc3RWZXJzaW9uc1tyZWxlYXNlVmVyc2lvbkluZGV4XSA9IHZlcnNpb247XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGxhdGVzdFZlcnNpb25zO1xufVxuXG5mdW5jdGlvbiBzZXRUZWxlbWV0cnkoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgaW5kZXg6IG51bWJlciwgcXVlcnlTb3VyY2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0LyogX19HRFBSX19GUkFHTUVOVF9fXG5cdFwiR2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGEyXCIgOiB7XG5cdFx0XCJpbmRleFwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcInF1ZXJ5U291cmNlXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIgfSxcblx0XHRcInF1ZXJ5QWN0aXZpdHlJZFwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiIH1cblx0fVxuXHQqL1xuXHRleHRlbnNpb24udGVsZW1ldHJ5RGF0YSA9IHsgaW5kZXgsIHF1ZXJ5U291cmNlLCBxdWVyeUFjdGl2aXR5SWQ6IGV4dGVuc2lvbi5xdWVyeUNvbnRleHQ/LltTRUFSQ0hfQUNUSVZJVFlfSEVBREVSX05BTUVdIH07XG59XG5cbmZ1bmN0aW9uIHRvRXh0ZW5zaW9uKGdhbGxlcnlFeHRlbnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uLCB2ZXJzaW9uOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIGFsbFRhcmdldFBsYXRmb3JtczogVGFyZ2V0UGxhdGZvcm1bXSwgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0OiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLCBxdWVyeUNvbnRleHQ/OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPik6IElHYWxsZXJ5RXh0ZW5zaW9uIHtcblx0Y29uc3QgbGF0ZXN0VmVyc2lvbiA9IGdhbGxlcnlFeHRlbnNpb24udmVyc2lvbnNbMF07XG5cdGNvbnN0IGFzc2V0czogSUdhbGxlcnlFeHRlbnNpb25Bc3NldHMgPSB7XG5cdFx0bWFuaWZlc3Q6IGdldFZlcnNpb25Bc3NldCh2ZXJzaW9uLCBBc3NldFR5cGUuTWFuaWZlc3QpLFxuXHRcdHJlYWRtZTogZ2V0VmVyc2lvbkFzc2V0KHZlcnNpb24sIEFzc2V0VHlwZS5EZXRhaWxzKSxcblx0XHRjaGFuZ2Vsb2c6IGdldFZlcnNpb25Bc3NldCh2ZXJzaW9uLCBBc3NldFR5cGUuQ2hhbmdlbG9nKSxcblx0XHRsaWNlbnNlOiBnZXRWZXJzaW9uQXNzZXQodmVyc2lvbiwgQXNzZXRUeXBlLkxpY2Vuc2UpLFxuXHRcdHJlcG9zaXRvcnk6IGdldFJlcG9zaXRvcnlBc3NldCh2ZXJzaW9uKSxcblx0XHRkb3dubG9hZDogZ2V0RG93bmxvYWRBc3NldCh2ZXJzaW9uKSxcblx0XHRpY29uOiBnZXRWZXJzaW9uQXNzZXQodmVyc2lvbiwgQXNzZXRUeXBlLkljb24pLFxuXHRcdHNpZ25hdHVyZTogZ2V0VmVyc2lvbkFzc2V0KHZlcnNpb24sIEFzc2V0VHlwZS5TaWduYXR1cmUpLFxuXHRcdGNvcmVUcmFuc2xhdGlvbnM6IGdldENvcmVUcmFuc2xhdGlvbkFzc2V0cyh2ZXJzaW9uKVxuXHR9O1xuXG5cdGNvbnN0IGRldGFpbHNWaWV3VXJpID0gZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCBnYWxsZXJ5RXh0ZW5zaW9uLmxpbmtUeXBlID8/IEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uRGV0YWlsc1ZpZXdVcmkpO1xuXHRjb25zdCBwdWJsaXNoZXJWaWV3VXJpID0gZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCBnYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlci5saW5rVHlwZSA/PyBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLlB1Ymxpc2hlclZpZXdVcmkpO1xuXHRjb25zdCByYXRpbmdWaWV3VXJpID0gZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCBnYWxsZXJ5RXh0ZW5zaW9uLnJhdGluZ0xpbmtUeXBlID8/IEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uUmF0aW5nVmlld1VyaSk7XG5cdGNvbnN0IGlkID0gZ2V0R2FsbGVyeUV4dGVuc2lvbklkKGdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLnB1Ymxpc2hlck5hbWUsIGdhbGxlcnlFeHRlbnNpb24uZXh0ZW5zaW9uTmFtZSk7XG5cblx0cmV0dXJuIHtcblx0XHR0eXBlOiAnZ2FsbGVyeScsXG5cdFx0aWRlbnRpZmllcjoge1xuXHRcdFx0aWQsXG5cdFx0XHR1dWlkOiBnYWxsZXJ5RXh0ZW5zaW9uLmV4dGVuc2lvbklkXG5cdFx0fSxcblx0XHRuYW1lOiBnYWxsZXJ5RXh0ZW5zaW9uLmV4dGVuc2lvbk5hbWUsXG5cdFx0dmVyc2lvbjogdmVyc2lvbi52ZXJzaW9uLFxuXHRcdGRpc3BsYXlOYW1lOiBnYWxsZXJ5RXh0ZW5zaW9uLmRpc3BsYXlOYW1lLFxuXHRcdHB1Ymxpc2hlcklkOiBnYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlci5wdWJsaXNoZXJJZCxcblx0XHRwdWJsaXNoZXI6IGdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLnB1Ymxpc2hlck5hbWUsXG5cdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IGdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLmRpc3BsYXlOYW1lLFxuXHRcdHB1Ymxpc2hlckRvbWFpbjogZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIuZG9tYWluID8geyBsaW5rOiBnYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlci5kb21haW4sIHZlcmlmaWVkOiAhIWdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLmlzRG9tYWluVmVyaWZpZWQgfSA6IHVuZGVmaW5lZCxcblx0XHRwdWJsaXNoZXJTcG9uc29yTGluazogZ2V0U3BvbnNvckxpbmsobGF0ZXN0VmVyc2lvbiksXG5cdFx0ZGVzY3JpcHRpb246IGdhbGxlcnlFeHRlbnNpb24uc2hvcnREZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRpbnN0YWxsQ291bnQ6IGdldFN0YXRpc3RpYyhnYWxsZXJ5RXh0ZW5zaW9uLnN0YXRpc3RpY3MsICdpbnN0YWxsJyksXG5cdFx0cmF0aW5nOiBnZXRTdGF0aXN0aWMoZ2FsbGVyeUV4dGVuc2lvbi5zdGF0aXN0aWNzLCAnYXZlcmFnZXJhdGluZycpLFxuXHRcdHJhdGluZ0NvdW50OiBnZXRTdGF0aXN0aWMoZ2FsbGVyeUV4dGVuc2lvbi5zdGF0aXN0aWNzLCAncmF0aW5nY291bnQnKSxcblx0XHRjYXRlZ29yaWVzOiBnYWxsZXJ5RXh0ZW5zaW9uLmNhdGVnb3JpZXMgfHwgW10sXG5cdFx0dGFnczogZ2FsbGVyeUV4dGVuc2lvbi50YWdzIHx8IFtdLFxuXHRcdHJlbGVhc2VEYXRlOiBEYXRlLnBhcnNlKGdhbGxlcnlFeHRlbnNpb24ucmVsZWFzZURhdGUpLFxuXHRcdGxhc3RVcGRhdGVkOiBEYXRlLnBhcnNlKGdhbGxlcnlFeHRlbnNpb24ubGFzdFVwZGF0ZWQpLFxuXHRcdGFsbFRhcmdldFBsYXRmb3Jtcyxcblx0XHRhc3NldHMsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0ZGVwZW5kZW5jaWVzOiBnZXRFeHRlbnNpb25zKHZlcnNpb24sIFByb3BlcnR5VHlwZS5EZXBlbmRlbmN5KSxcblx0XHRcdGV4dGVuc2lvblBhY2s6IGdldEV4dGVuc2lvbnModmVyc2lvbiwgUHJvcGVydHlUeXBlLkV4dGVuc2lvblBhY2spLFxuXHRcdFx0ZW5naW5lOiBnZXRFbmdpbmUodmVyc2lvbiksXG5cdFx0XHRlbmFibGVkQXBpUHJvcG9zYWxzOiBnZXRFbmFibGVkQXBpUHJvcG9zYWxzKHZlcnNpb24pLFxuXHRcdFx0bG9jYWxpemVkTGFuZ3VhZ2VzOiBnZXRMb2NhbGl6ZWRMYW5ndWFnZXModmVyc2lvbiksXG5cdFx0XHR0YXJnZXRQbGF0Zm9ybTogZ2V0VGFyZ2V0UGxhdGZvcm1Gb3JFeHRlbnNpb25WZXJzaW9uKHZlcnNpb24pLFxuXHRcdFx0aXNQcmVSZWxlYXNlVmVyc2lvbjogaXNQcmVSZWxlYXNlVmVyc2lvbih2ZXJzaW9uKSxcblx0XHRcdGV4ZWN1dGVzQ29kZTogZXhlY3V0ZXNDb2RlKHZlcnNpb24pXG5cdFx0fSxcblx0XHRoYXNQcmVSZWxlYXNlVmVyc2lvbjogaGFzUHJlUmVsZWFzZUZvckV4dGVuc2lvbihpZCwgcHJvZHVjdFNlcnZpY2UpID8/IGlzUHJlUmVsZWFzZVZlcnNpb24obGF0ZXN0VmVyc2lvbiksXG5cdFx0aGFzUmVsZWFzZVZlcnNpb246IHRydWUsXG5cdFx0cHJpdmF0ZTogaXNQcml2YXRlRXh0ZW5zaW9uKGxhdGVzdFZlcnNpb24pLFxuXHRcdHByZXZpZXc6IGdldElzUHJldmlldyhnYWxsZXJ5RXh0ZW5zaW9uLmZsYWdzKSxcblx0XHRpc1NpZ25lZDogISFhc3NldHMuc2lnbmF0dXJlLFxuXHRcdHF1ZXJ5Q29udGV4dCxcblx0XHRzdXBwb3J0TGluazogZ2V0U3VwcG9ydExpbmsobGF0ZXN0VmVyc2lvbiksXG5cdFx0ZGV0YWlsc0xpbms6IGRldGFpbHNWaWV3VXJpID8gZm9ybWF0MihkZXRhaWxzVmlld1VyaSwgeyBwdWJsaXNoZXI6IGdhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLnB1Ymxpc2hlck5hbWUsIG5hbWU6IGdhbGxlcnlFeHRlbnNpb24uZXh0ZW5zaW9uTmFtZSB9KSA6IHVuZGVmaW5lZCxcblx0XHRwdWJsaXNoZXJMaW5rOiBwdWJsaXNoZXJWaWV3VXJpID8gZm9ybWF0MihwdWJsaXNoZXJWaWV3VXJpLCB7IHB1Ymxpc2hlcjogZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIucHVibGlzaGVyTmFtZSB9KSA6IHVuZGVmaW5lZCxcblx0XHRyYXRpbmdMaW5rOiByYXRpbmdWaWV3VXJpID8gZm9ybWF0MihyYXRpbmdWaWV3VXJpLCB7IHB1Ymxpc2hlcjogZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIucHVibGlzaGVyTmFtZSwgbmFtZTogZ2FsbGVyeUV4dGVuc2lvbi5leHRlbnNpb25OYW1lIH0pIDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5pbnRlcmZhY2UgSVJhd0V4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Qge1xuXHRtYWxpY2lvdXM6IHN0cmluZ1tdO1xuXHRsZWFybk1vcmVMaW5rcz86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz47XG5cdG1pZ3JhdGVUb1ByZVJlbGVhc2U/OiBJU3RyaW5nRGljdGlvbmFyeTx7XG5cdFx0aWQ6IHN0cmluZztcblx0XHRkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRcdG1pZ3JhdGVTdG9yYWdlPzogYm9vbGVhbjtcblx0XHRlbmdpbmU/OiBzdHJpbmc7XG5cdH0+O1xuXHRkZXByZWNhdGVkPzogSVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbiB8IHtcblx0XHRkaXNhbGxvd0luc3RhbGw/OiBib29sZWFuO1xuXHRcdGV4dGVuc2lvbj86IHtcblx0XHRcdGlkOiBzdHJpbmc7XG5cdFx0XHRkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRcdH07XG5cdFx0c2V0dGluZ3M/OiBzdHJpbmdbXTtcblx0XHRhZGRpdGlvbmFsSW5mbz86IHN0cmluZztcblx0fT47XG5cdHNlYXJjaD86IElTZWFyY2hQcmVmZmVyZWRSZXN1bHRzW107XG5cdGF1dG9VcGRhdGU/OiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+O1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBpbXBsZW1lbnRzIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zQ29udHJvbFVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHVucGtnUmVzb3VyY2VBcGk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbW1vbkhlYWRlcnNQcm9taXNlOiBQcm9taXNlPElIZWFkZXJzPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlIHwgdW5kZWZpbmVkLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlOiBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmV4dGVuc2lvbnNDb250cm9sVXJsID0gcHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uc0dhbGxlcnk/LmNvbnRyb2xVcmw7XG5cdFx0dGhpcy51bnBrZ1Jlc291cmNlQXBpID0gcHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uc0dhbGxlcnk/LmV4dGVuc2lvblVybFRlbXBsYXRlO1xuXHRcdHRoaXMuY29tbW9uSGVhZGVyc1Byb21pc2UgPSByZXNvbHZlTWFya2V0cGxhY2VIZWFkZXJzKFxuXHRcdFx0cHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0dGhpcy5maWxlU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlKTtcblx0fVxuXG5cdGlzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cyA9PT0gRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLkF2YWlsYWJsZTtcblx0fVxuXG5cdGdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uSW5mb3M6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbkluZm8+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uW10+O1xuXHRnZXRFeHRlbnNpb25zKGV4dGVuc2lvbkluZm9zOiBSZWFkb25seUFycmF5PElFeHRlbnNpb25JbmZvPiwgb3B0aW9uczogSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvbltdPjtcblx0YXN5bmMgZ2V0RXh0ZW5zaW9ucyhleHRlbnNpb25JbmZvczogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uSW5mbz4sIGFyZzE6IENhbmNlbGxhdGlvblRva2VuIHwgSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucywgYXJnMj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvbltdPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCgpO1xuXHRcdGlmICghZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGV4dGVuc2lvbiBnYWxsZXJ5IHNlcnZpY2UgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zID0gQ2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbihhcmcxKSA/IHt9IDogYXJnMSBhcyBJRXh0ZW5zaW9uUXVlcnlPcHRpb25zO1xuXHRcdGNvbnN0IHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbihhcmcxKSA/IGFyZzEgOiBhcmcyIGFzIENhbmNlbGxhdGlvblRva2VuO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VBcGkgPSB0aGlzLmdldFJlc291cmNlQXBpKGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb3VyY2VBcGlcblx0XHRcdD8gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25zVXNpbmdSZXNvdXJjZUFwaShleHRlbnNpb25JbmZvcywgb3B0aW9ucywgcmVzb3VyY2VBcGksIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdG9rZW4pXG5cdFx0XHQ6IGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9uc1VzaW5nUXVlcnlBcGkoZXh0ZW5zaW9uSW5mb3MsIG9wdGlvbnMsIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdG9rZW4pO1xuXG5cdFx0Y29uc3QgdXVpZHMgPSByZXN1bHQubWFwKHIgPT4gci5pZGVudGlmaWVyLnV1aWQpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkluZm9zQnlOYW1lOiBJRXh0ZW5zaW9uSW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBlIG9mIGV4dGVuc2lvbkluZm9zKSB7XG5cdFx0XHRpZiAoZS51dWlkICYmICF1dWlkcy5pbmNsdWRlcyhlLnV1aWQpKSB7XG5cdFx0XHRcdGV4dGVuc2lvbkluZm9zQnlOYW1lLnB1c2goeyAuLi5lLCB1dWlkOiB1bmRlZmluZWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV4dGVuc2lvbkluZm9zQnlOYW1lLmxlbmd0aCkge1xuXHRcdFx0Ly8gcmVwb3J0IHRlbGVtZXRyeSBkYXRhIGZvciBhZGRpdGlvbmFsIHF1ZXJ5XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxcblx0XHRcdFx0eyBjb3VudDogbnVtYmVyIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdFx0XHRjb21tZW50OiAnUmVwb3J0IHRoZSBxdWVyeSB0byB0aGUgTWFya2V0cGxhY2UgZm9yIGZldGNoaW5nIGV4dGVuc2lvbnMgYnkgbmFtZSc7XG5cdFx0XHRcdFx0cmVhZG9ubHkgY291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZXh0ZW5zaW9ucyB0byBmZXRjaCcgfTtcblx0XHRcdFx0fT4oJ2dhbGxlcnlTZXJ2aWNlOmFkZGl0aW9uYWxRdWVyeUJ5TmFtZScsIHtcblx0XHRcdFx0XHRjb3VudDogZXh0ZW5zaW9uSW5mb3NCeU5hbWUubGVuZ3RoXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25zVXNpbmdRdWVyeUFwaShleHRlbnNpb25JbmZvc0J5TmFtZSwgb3B0aW9ucywgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCB0b2tlbik7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5leHRlbnNpb25zKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXNvdXJjZUFwaShleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QpOiB7IHVyaTogc3RyaW5nOyBmYWxsYmFjaz86IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsYXRlc3RWZXJzaW9uUmVzb3VyY2UgPSBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uTGF0ZXN0VmVyc2lvblVyaSk7XG5cdFx0aWYgKGxhdGVzdFZlcnNpb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpOiBsYXRlc3RWZXJzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGZhbGxiYWNrOiB0aGlzLnVucGtnUmVzb3VyY2VBcGlcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEV4dGVuc2lvbnNVc2luZ1F1ZXJ5QXBpKGV4dGVuc2lvbkluZm9zOiBSZWFkb25seUFycmF5PElFeHRlbnNpb25JbmZvPiwgb3B0aW9uczogSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucywgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0OiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBuYW1lczogc3RyaW5nW10gPSBbXSxcblx0XHRcdGlkczogc3RyaW5nW10gPSBbXSxcblx0XHRcdGluY2x1ZGVQcmVSZWxlYXNlOiAoSUV4dGVuc2lvbklkZW50aWZpZXIgJiB7IGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuIH0pW10gPSBbXSxcblx0XHRcdHZlcnNpb25zOiAoSUV4dGVuc2lvbklkZW50aWZpZXIgJiB7IHZlcnNpb246IHN0cmluZyB9KVtdID0gW107XG5cdFx0bGV0IGlzUXVlcnlGb3JSZWxlYXNlVmVyc2lvbkZyb21QcmVSZWxlYXNlVmVyc2lvbiA9IHRydWU7XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbkluZm8gb2YgZXh0ZW5zaW9uSW5mb3MpIHtcblx0XHRcdGlmIChleHRlbnNpb25JbmZvLnV1aWQpIHtcblx0XHRcdFx0aWRzLnB1c2goZXh0ZW5zaW9uSW5mby51dWlkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5hbWVzLnB1c2goZXh0ZW5zaW9uSW5mby5pZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uSW5mby52ZXJzaW9uKSB7XG5cdFx0XHRcdHZlcnNpb25zLnB1c2goeyBpZDogZXh0ZW5zaW9uSW5mby5pZCwgdXVpZDogZXh0ZW5zaW9uSW5mby51dWlkLCB2ZXJzaW9uOiBleHRlbnNpb25JbmZvLnZlcnNpb24gfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbmNsdWRlUHJlUmVsZWFzZS5wdXNoKHsgaWQ6IGV4dGVuc2lvbkluZm8uaWQsIHV1aWQ6IGV4dGVuc2lvbkluZm8udXVpZCwgaW5jbHVkZVByZVJlbGVhc2U6ICEhZXh0ZW5zaW9uSW5mby5wcmVSZWxlYXNlIH0pO1xuXHRcdFx0fVxuXHRcdFx0aXNRdWVyeUZvclJlbGVhc2VWZXJzaW9uRnJvbVByZVJlbGVhc2VWZXJzaW9uID0gaXNRdWVyeUZvclJlbGVhc2VWZXJzaW9uRnJvbVByZVJlbGVhc2VWZXJzaW9uICYmICghIWV4dGVuc2lvbkluZm8uaGFzUHJlUmVsZWFzZSAmJiAhZXh0ZW5zaW9uSW5mby5wcmVSZWxlYXNlKTtcblx0XHR9XG5cblx0XHRpZiAoIWlkcy5sZW5ndGggJiYgIW5hbWVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGxldCBxdWVyeSA9IG5ldyBRdWVyeSgpLndpdGhQYWdlKDEsIGV4dGVuc2lvbkluZm9zLmxlbmd0aCk7XG5cdFx0aWYgKGlkcy5sZW5ndGgpIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aEZpbHRlcihGaWx0ZXJUeXBlLkV4dGVuc2lvbklkLCAuLi5pZHMpO1xuXHRcdH1cblx0XHRpZiAobmFtZXMubGVuZ3RoKSB7XG5cdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhGaWx0ZXIoRmlsdGVyVHlwZS5FeHRlbnNpb25OYW1lLCAuLi5uYW1lcyk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnF1ZXJ5QWxsVmVyc2lvbnMpIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aEZsYWdzKC4uLnF1ZXJ5LmZsYWdzLCBGbGFnLkluY2x1ZGVWZXJzaW9ucyk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnNvdXJjZSkge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoU291cmNlKG9wdGlvbnMuc291cmNlKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGV4dGVuc2lvbnMgfSA9IGF3YWl0IHRoaXMucXVlcnlHYWxsZXJ5RXh0ZW5zaW9ucyhcblx0XHRcdHF1ZXJ5LFxuXHRcdFx0e1xuXHRcdFx0XHR0YXJnZXRQbGF0Zm9ybTogb3B0aW9ucy50YXJnZXRQbGF0Zm9ybSA/PyBDVVJSRU5UX1RBUkdFVF9QTEFURk9STSxcblx0XHRcdFx0aW5jbHVkZVByZVJlbGVhc2UsXG5cdFx0XHRcdHZlcnNpb25zLFxuXHRcdFx0XHRjb21wYXRpYmxlOiAhIW9wdGlvbnMuY29tcGF0aWJsZSxcblx0XHRcdFx0cHJvZHVjdFZlcnNpb246IG9wdGlvbnMucHJvZHVjdFZlcnNpb24gPz8geyB2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSB9LFxuXHRcdFx0XHRpc1F1ZXJ5Rm9yUmVsZWFzZVZlcnNpb25Gcm9tUHJlUmVsZWFzZVZlcnNpb25cblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsXG5cdFx0XHR0b2tlbik7XG5cblx0XHRpZiAob3B0aW9ucy5zb3VyY2UpIHtcblx0XHRcdGV4dGVuc2lvbnMuZm9yRWFjaCgoZSwgaW5kZXgpID0+IHNldFRlbGVtZXRyeShlLCBpbmRleCwgb3B0aW9ucy5zb3VyY2UpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZXh0ZW5zaW9ucztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RXh0ZW5zaW9uc1VzaW5nUmVzb3VyY2VBcGkoZXh0ZW5zaW9uSW5mb3M6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbkluZm8+LCBvcHRpb25zOiBJRXh0ZW5zaW9uUXVlcnlPcHRpb25zLCByZXNvdXJjZUFwaTogeyB1cmk6IHN0cmluZzsgZmFsbGJhY2s/OiBzdHJpbmcgfSwgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0OiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uW10+IHtcblxuXHRcdGNvbnN0IHJlc3VsdDogSUdhbGxlcnlFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHRvUXVlcnk6IElFeHRlbnNpb25JbmZvW10gPSBbXTtcblx0XHRjb25zdCB0b0ZldGNoTGF0ZXN0OiBJRXh0ZW5zaW9uSW5mb1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbkluZm8gb2YgZXh0ZW5zaW9uSW5mb3MpIHtcblx0XHRcdGlmICghRVhURU5TSU9OX0lERU5USUZJRVJfUkVHRVgudGVzdChleHRlbnNpb25JbmZvLmlkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChleHRlbnNpb25JbmZvLnZlcnNpb24gfHwgIWV4dGVuc2lvbkluZm8udXVpZCkge1xuXHRcdFx0XHR0b1F1ZXJ5LnB1c2goZXh0ZW5zaW9uSW5mbyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b0ZldGNoTGF0ZXN0LnB1c2goZXh0ZW5zaW9uSW5mbyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwodG9GZXRjaExhdGVzdC5tYXAoYXN5bmMgZXh0ZW5zaW9uSW5mbyA9PiB7XG5cdFx0XHRsZXQgZ2FsbGVyeUV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24gfCBzdHJpbmc7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5nZXRMYXRlc3RHYWxsZXJ5RXh0ZW5zaW9uKGV4dGVuc2lvbkluZm8sIG9wdGlvbnMsIHJlc291cmNlQXBpLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRva2VuKTtcblx0XHRcdFx0aWYgKGlzU3RyaW5nKGdhbGxlcnlFeHRlbnNpb24pKSB7XG5cdFx0XHRcdFx0aWYgKGdhbGxlcnlFeHRlbnNpb24gPT09ICdMQVRFU1RfSVNfT1VUREFURUQnKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFNraXBwaW5nIHF1ZXJ5IEFQSSBmYWxsYmFjayBmb3IgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uSW5mby5pZH0gYmVjYXVzZSB0aGUgbGF0ZXN0IGdhbGxlcnkgdmVyc2lvbiBpcyBvbGRlciB0aGFuIHRoZSBjdXJyZW50IHZlcnNpb25gKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gZmFsbGJhY2sgdG8gcXVlcnlcblx0XHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uOiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRcdFx0cHJlUmVsZWFzZTogYm9vbGVhbjtcblx0XHRcdFx0XHRcdFx0XHRjb21wYXRpYmxlOiBib29sZWFuO1xuXHRcdFx0XHRcdFx0XHRcdGVycm9yQ29kZTogc3RyaW5nO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdFx0XHRcdFx0Y29tbWVudDogJ1JlcG9ydCB0aGUgZmFsbGJhY2sgdG8gdGhlIE1hcmtldHBsYWNlIHF1ZXJ5IGZvciBmZXRjaGluZyBleHRlbnNpb25zJztcblx0XHRcdFx0XHRcdFx0XHRleHRlbnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdFeHRlbnNpb24gaWQnIH07XG5cdFx0XHRcdFx0XHRcdFx0cHJlUmVsZWFzZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0dldCBwcmUtcmVsZWFzZSB2ZXJzaW9uJyB9O1xuXHRcdFx0XHRcdFx0XHRcdGNvbXBhdGlibGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdHZXQgY29tcGF0aWJsZSB2ZXJzaW9uJyB9O1xuXHRcdFx0XHRcdFx0XHRcdGVycm9yQ29kZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0Vycm9yIGNvZGUgb3IgcmVhc29uJyB9O1xuXHRcdFx0XHRcdFx0XHR9PignZ2FsbGVyeVNlcnZpY2U6ZmFsbGJhY2t0b3F1ZXJ5Jywge1xuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbjogZXh0ZW5zaW9uSW5mby5pZCxcblx0XHRcdFx0XHRcdFx0XHRwcmVSZWxlYXNlOiAhIWV4dGVuc2lvbkluZm8ucHJlUmVsZWFzZSxcblx0XHRcdFx0XHRcdFx0XHRjb21wYXRpYmxlOiAhIW9wdGlvbnMuY29tcGF0aWJsZSxcblx0XHRcdFx0XHRcdFx0XHRlcnJvckNvZGU6IGdhbGxlcnlFeHRlbnNpb25cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0b1F1ZXJ5LnB1c2goZXh0ZW5zaW9uSW5mbyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGdhbGxlcnlFeHRlbnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBFeHRlbnNpb25HYWxsZXJ5RXJyb3IpIHtcblx0XHRcdFx0XHRzd2l0Y2ggKGVycm9yLmNvZGUpIHtcblx0XHRcdFx0XHRcdGNhc2UgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5PZmZsaW5lOlxuXHRcdFx0XHRcdFx0Y2FzZSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLkNhbmNlbGxlZDpcblx0XHRcdFx0XHRcdGNhc2UgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5UaW1lb3V0OlxuXHRcdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBmYWxsYmFjayB0byBxdWVyeVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHdoaWxlIGdldHRpbmcgdGhlIGxhdGVzdCB2ZXJzaW9uIGZvciB0aGUgZXh0ZW5zaW9uICR7ZXh0ZW5zaW9uSW5mby5pZH0uYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogc3RyaW5nO1xuXHRcdFx0XHRcdFx0cHJlUmVsZWFzZTogYm9vbGVhbjtcblx0XHRcdFx0XHRcdGNvbXBhdGlibGU6IGJvb2xlYW47XG5cdFx0XHRcdFx0XHRlcnJvckNvZGU6IHN0cmluZztcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRcdFx0Y29tbWVudDogJ1JlcG9ydCB0aGUgZmFsbGJhY2sgdG8gdGhlIE1hcmtldHBsYWNlIHF1ZXJ5IGZvciBmZXRjaGluZyBleHRlbnNpb25zJztcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0V4dGVuc2lvbiBpZCcgfTtcblx0XHRcdFx0XHRcdHByZVJlbGVhc2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdHZXQgcHJlLXJlbGVhc2UgdmVyc2lvbicgfTtcblx0XHRcdFx0XHRcdGNvbXBhdGlibGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdHZXQgY29tcGF0aWJsZSB2ZXJzaW9uJyB9O1xuXHRcdFx0XHRcdFx0ZXJyb3JDb2RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRXJyb3IgY29kZSBvciByZWFzb24nIH07XG5cdFx0XHRcdFx0fT4oJ2dhbGxlcnlTZXJ2aWNlOmZhbGxiYWNrdG9xdWVyeScsIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogZXh0ZW5zaW9uSW5mby5pZCxcblx0XHRcdFx0XHRcdHByZVJlbGVhc2U6ICEhZXh0ZW5zaW9uSW5mby5wcmVSZWxlYXNlLFxuXHRcdFx0XHRcdFx0Y29tcGF0aWJsZTogISFvcHRpb25zLmNvbXBhdGlibGUsXG5cdFx0XHRcdFx0XHRlcnJvckNvZGU6IGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uR2FsbGVyeUVycm9yID8gZXJyb3IuY29kZSA6ICdVbmtub3duJ1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR0b1F1ZXJ5LnB1c2goZXh0ZW5zaW9uSW5mbyk7XG5cdFx0XHR9XG5cblx0XHR9KSk7XG5cblx0XHRpZiAodG9RdWVyeS5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmdldEV4dGVuc2lvbnNVc2luZ1F1ZXJ5QXBpKHRvUXVlcnksIG9wdGlvbnMsIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdG9rZW4pO1xuXHRcdFx0cmVzdWx0LnB1c2goLi4uZXh0ZW5zaW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0TGF0ZXN0R2FsbGVyeUV4dGVuc2lvbihleHRlbnNpb25JbmZvOiBJRXh0ZW5zaW9uSW5mbywgb3B0aW9uczogSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucywgcmVzb3VyY2VBcGk6IHsgdXJpOiBzdHJpbmc7IGZhbGxiYWNrPzogc3RyaW5nIH0sIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvbiB8IHN0cmluZz4ge1xuXHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb24gPSBhd2FpdCB0aGlzLmdldExhdGVzdFJhd0dhbGxlcnlFeHRlbnNpb25XaXRoRmFsbGJhY2soZXh0ZW5zaW9uSW5mbywgcmVzb3VyY2VBcGksIHRva2VuKTtcblxuXHRcdGlmICghcmF3R2FsbGVyeUV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuICdOT1RfRk9VTkQnO1xuXHRcdH1cblxuXHRcdGlmICghQXJyYXkuaXNBcnJheShyYXdHYWxsZXJ5RXh0ZW5zaW9uLnZlcnNpb25zKSB8fCByYXdHYWxsZXJ5RXh0ZW5zaW9uLnZlcnNpb25zLnNvbWUodmVyc2lvbiA9PiAhQXJyYXkuaXNBcnJheSh2ZXJzaW9uLmZpbGVzKSkpIHtcblx0XHRcdHJldHVybiAnSU5WQUxJRF9SRVNQT05TRSc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsVGFyZ2V0UGxhdGZvcm1zID0gZ2V0QWxsVGFyZ2V0UGxhdGZvcm1zKHJhd0dhbGxlcnlFeHRlbnNpb24pO1xuXHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uID0gYXdhaXQgdGhpcy5nZXRWYWxpZFJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uRnJvbUxhdGVzdFZlcnNpb25zKHJhd0dhbGxlcnlFeHRlbnNpb24sIHJhd0dhbGxlcnlFeHRlbnNpb24udmVyc2lvbnMsIGV4dGVuc2lvbkluZm8sIG9wdGlvbnMsIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHRpZiAoIXJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uSW5mby5jdXJyZW50VmVyc2lvbikge1xuXHRcdFx0XHRjb25zdCBsYXRlc3RWZXJzaW9uID0gcmF3R2FsbGVyeUV4dGVuc2lvbi52ZXJzaW9ucy5sZW5ndGggPiAwID8gcmF3R2FsbGVyeUV4dGVuc2lvbi52ZXJzaW9uc1swXS52ZXJzaW9uIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAobGF0ZXN0VmVyc2lvbiAmJiBzZW12ZXIubHQobGF0ZXN0VmVyc2lvbiwgZXh0ZW5zaW9uSW5mby5jdXJyZW50VmVyc2lvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gJ0xBVEVTVF9JU19PVVREQVRFRCc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiAnTk9UX0NPTVBBVElCTEUnO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b0V4dGVuc2lvbihyYXdHYWxsZXJ5RXh0ZW5zaW9uLCByYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiwgYWxsVGFyZ2V0UGxhdGZvcm1zLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRoaXMucHJvZHVjdFNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRWYWxpZFJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uRnJvbUxhdGVzdFZlcnNpb25zKHJhd0dhbGxlcnlFeHRlbnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uLCBsYXRlc3RWZXJzaW9uczogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10sIGV4dGVuc2lvbkluZm86IElFeHRlbnNpb25JbmZvLCBvcHRpb25zOiBJRXh0ZW5zaW9uUXVlcnlPcHRpb25zLCBhbGxUYXJnZXRQbGF0Zm9ybXM6IFRhcmdldFBsYXRmb3JtW10pOiBQcm9taXNlPElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiB8IG51bGw+IHtcblx0XHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IG9wdGlvbnMudGFyZ2V0UGxhdGZvcm0gPz8gQ1VSUkVOVF9UQVJHRVRfUExBVEZPUk07XG5cdFx0Y29uc3QgbGF0ZXN0RXh0ZW5zaW9uVmVyc2lvbnNGb3JUYXJnZXRQbGF0Zm9ybSA9IGZpbHRlckxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0obGF0ZXN0VmVyc2lvbnMsIHRhcmdldFBsYXRmb3JtLCBhbGxUYXJnZXRQbGF0Zm9ybXMpO1xuXG5cdFx0Ly8gRmlyc3QsIGZpbmQgYSB2YWxpZCB2ZXJzaW9uIG1hdGNoaW5nIHRoZSByZXF1ZXN0ZWQgdHlwZSAocHJlLXJlbGVhc2Ugb3IgcmVsZWFzZSlcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdldFZhbGlkUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24oXG5cdFx0XHRyYXdHYWxsZXJ5RXh0ZW5zaW9uLFxuXHRcdFx0bGF0ZXN0RXh0ZW5zaW9uVmVyc2lvbnNGb3JUYXJnZXRQbGF0Zm9ybSxcblx0XHRcdHtcblx0XHRcdFx0dGFyZ2V0UGxhdGZvcm0sXG5cdFx0XHRcdGNvbXBhdGlibGU6ICEhb3B0aW9ucy5jb21wYXRpYmxlLFxuXHRcdFx0XHRwcm9kdWN0VmVyc2lvbjogb3B0aW9ucy5wcm9kdWN0VmVyc2lvbiA/PyB7XG5cdFx0XHRcdFx0dmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0XHRcdGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2ZXJzaW9uOiBleHRlbnNpb25JbmZvLnByZVJlbGVhc2UgPyBWZXJzaW9uS2luZC5QcmVyZWxlYXNlIDogVmVyc2lvbktpbmQuUmVsZWFzZVxuXHRcdFx0fSwgYWxsVGFyZ2V0UGxhdGZvcm1zKTtcblxuXHRcdC8vIEZvciByZWxlYXNlIHZlcnNpb24gcmVxdWVzdHMsIHNpbXBseSByZXR1cm4gdGhlIGZvdW5kIHJlbGVhc2UgdmVyc2lvblxuXHRcdGlmICghZXh0ZW5zaW9uSW5mby5wcmVSZWxlYXNlKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIEZvciBwcmUtcmVsZWFzZSB2ZXJzaW9uIHJlcXVlc3RzLCB3ZSBuZWVkIHRvIGNvbnNpZGVyIGJvdGggcHJlLXJlbGVhc2UgYW5kIHJlbGVhc2UgdmVyc2lvbnNcblx0XHRjb25zdCBwcmVyZWxlYXNlVmVyc2lvbiA9IHJlc3VsdDtcblx0XHRjb25zdCByZWxlYXNlVmVyc2lvbiA9IGF3YWl0IHRoaXMuZ2V0VmFsaWRSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbihcblx0XHRcdHJhd0dhbGxlcnlFeHRlbnNpb24sXG5cdFx0XHRsYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtLFxuXHRcdFx0e1xuXHRcdFx0XHR0YXJnZXRQbGF0Zm9ybSxcblx0XHRcdFx0Y29tcGF0aWJsZTogISFvcHRpb25zLmNvbXBhdGlibGUsXG5cdFx0XHRcdHByb2R1Y3RWZXJzaW9uOiBvcHRpb25zLnByb2R1Y3RWZXJzaW9uID8/IHtcblx0XHRcdFx0XHR2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHRcdFx0ZGF0ZTogdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZlcnNpb246IFZlcnNpb25LaW5kLlJlbGVhc2Vcblx0XHRcdH0sIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHQvLyBXaGVuIGJvdGggdmVyc2lvbnMgZXhpc3QsIHJldHVybiB3aGljaGV2ZXIgaGFzIHRoZSBoaWdoZXIgdmVyc2lvbiBudW1iZXJcblx0XHRpZiAocHJlcmVsZWFzZVZlcnNpb24gJiYgcmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHJldHVybiBzZW12ZXIuZ3QocmVsZWFzZVZlcnNpb24udmVyc2lvbiwgcHJlcmVsZWFzZVZlcnNpb24udmVyc2lvbikgPyByZWxlYXNlVmVyc2lvbiA6IHByZXJlbGVhc2VWZXJzaW9uO1xuXHRcdH1cblxuXHRcdC8vIFNwZWNpYWwgaGFuZGxpbmcgZm9yIGNvbXBhdGlibGUgdmVyc2lvbiByZXF1ZXN0c1xuXHRcdGlmIChvcHRpb25zLmNvbXBhdGlibGUpIHtcblx0XHRcdC8vIElmIHdlIGhhdmUgYSBjb21wYXRpYmxlIHJlbGVhc2UgdmVyc2lvbiwgY2hlY2sgaWYgaXQncyBiZXR0ZXIgdGhhbiBhbnkgcHJlLXJlbGVhc2Vcblx0XHRcdGlmIChyZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0XHQvLyBDaGVjayBpZiB0aGVyZSBleGlzdHMgYW55IHByZS1yZWxlYXNlIHZlcnNpb24gKGlnbm9yaW5nIGNvbXBhdGliaWxpdHkpXG5cdFx0XHRcdGNvbnN0IGFueVByZXJlbGVhc2VWZXJzaW9uID0gYXdhaXQgdGhpcy5nZXRWYWxpZFJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKFxuXHRcdFx0XHRcdHJhd0dhbGxlcnlFeHRlbnNpb24sXG5cdFx0XHRcdFx0bGF0ZXN0RXh0ZW5zaW9uVmVyc2lvbnNGb3JUYXJnZXRQbGF0Zm9ybSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0YXJnZXRQbGF0Zm9ybSxcblx0XHRcdFx0XHRcdGNvbXBhdGlibGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cHJvZHVjdFZlcnNpb246IG9wdGlvbnMucHJvZHVjdFZlcnNpb24gPz8ge1xuXHRcdFx0XHRcdFx0XHR2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHRcdFx0XHRcdGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHZlcnNpb246IFZlcnNpb25LaW5kLlByZXJlbGVhc2Vcblx0XHRcdFx0XHR9LCBhbGxUYXJnZXRQbGF0Zm9ybXMpO1xuXG5cdFx0XHRcdC8vIElmIG5vIHByZS1yZWxlYXNlIGV4aXN0cyBvciB0aGUgcmVsZWFzZSB2ZXJzaW9uIGlzIGdyZWF0ZXIsIHByZWZlciB0aGUgY29tcGF0aWJsZSByZWxlYXNlXG5cdFx0XHRcdC8vIFRoaXMgZW5zdXJlcyB1c2VycyBnZXQgYSBzdGFibGUgY29tcGF0aWJsZSB2ZXJzaW9uIHdoZW4gcHJlLXJlbGVhc2VzIGFyZW4ndCBuZXdlciBvciBjb21wYXRpYmxlXG5cdFx0XHRcdGlmICghYW55UHJlcmVsZWFzZVZlcnNpb24gfHwgc2VtdmVyLmd0KHJlbGVhc2VWZXJzaW9uLnZlcnNpb24sIGFueVByZXJlbGVhc2VWZXJzaW9uLnZlcnNpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlbGVhc2VWZXJzaW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJlcmVsZWFzZVZlcnNpb247XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIHByZS1yZWxlYXNlIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIHJlbGVhc2UsIG90aGVyd2lzZSBudWxsXG5cdFx0cmV0dXJuIHByZXJlbGVhc2VWZXJzaW9uID8/IHJlbGVhc2VWZXJzaW9uID8/IG51bGw7XG5cdH1cblxuXHRhc3luYyBnZXRDb21wYXRpYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuLCB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0sIHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb24gPSB7IHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgZGF0ZTogdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlIH0pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uIHwgbnVsbD4ge1xuXHRcdGlmIChpc05vdFdlYkV4dGVuc2lvbkluV2ViVGFyZ2V0UGxhdGZvcm0oZXh0ZW5zaW9uLmFsbFRhcmdldFBsYXRmb3JtcywgdGFyZ2V0UGxhdGZvcm0pKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGF3YWl0IHRoaXMuaXNFeHRlbnNpb25Db21wYXRpYmxlKGV4dGVuc2lvbiwgaW5jbHVkZVByZVJlbGVhc2UsIHRhcmdldFBsYXRmb3JtKSkge1xuXHRcdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZCh7IGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgcHVibGlzaGVyRGlzcGxheU5hbWU6IGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSB9KSAhPT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9ucyhbe1xuXHRcdFx0Li4uZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRwcmVSZWxlYXNlOiBpbmNsdWRlUHJlUmVsZWFzZSxcblx0XHRcdGhhc1ByZVJlbGVhc2U6IGV4dGVuc2lvbi5oYXNQcmVSZWxlYXNlVmVyc2lvbixcblx0XHR9XSwge1xuXHRcdFx0Y29tcGF0aWJsZTogdHJ1ZSxcblx0XHRcdHByb2R1Y3RWZXJzaW9uLFxuXHRcdFx0cXVlcnlBbGxWZXJzaW9uczogdHJ1ZSxcblx0XHRcdHRhcmdldFBsYXRmb3JtLFxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdFswXSA/PyBudWxsO1xuXHR9XG5cblx0YXN5bmMgaXNFeHRlbnNpb25Db21wYXRpYmxlKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuLCB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0sIHByb2R1Y3RWZXJzaW9uOiBJUHJvZHVjdFZlcnNpb24gPSB7IHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgZGF0ZTogdGhpcy5wcm9kdWN0U2VydmljZS5kYXRlIH0pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5pc1ZhbGlkVmVyc2lvbihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHR2ZXJzaW9uOiBleHRlbnNpb24udmVyc2lvbixcblx0XHRcdFx0aXNQcmVSZWxlYXNlVmVyc2lvbjogZXh0ZW5zaW9uLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbixcblx0XHRcdFx0dGFyZ2V0UGxhdGZvcm06IGV4dGVuc2lvbi5wcm9wZXJ0aWVzLnRhcmdldFBsYXRmb3JtLFxuXHRcdFx0XHRtYW5pZmVzdEFzc2V0OiBleHRlbnNpb24uYXNzZXRzLm1hbmlmZXN0LFxuXHRcdFx0XHRlbmdpbmU6IGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmVuZ2luZSxcblx0XHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogZXh0ZW5zaW9uLnByb3BlcnRpZXMuZW5hYmxlZEFwaVByb3Bvc2Fsc1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dGFyZ2V0UGxhdGZvcm0sXG5cdFx0XHRcdGNvbXBhdGlibGU6IHRydWUsXG5cdFx0XHRcdHByb2R1Y3RWZXJzaW9uLFxuXHRcdFx0XHR2ZXJzaW9uOiBpbmNsdWRlUHJlUmVsZWFzZSA/IFZlcnNpb25LaW5kLkxhdGVzdCA6IFZlcnNpb25LaW5kLlJlbGVhc2Vcblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUsXG5cdFx0XHRleHRlbnNpb24uYWxsVGFyZ2V0UGxhdGZvcm1zXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaXNWYWxpZFZlcnNpb24oXG5cdFx0ZXh0ZW5zaW9uOiB7IGlkOiBzdHJpbmc7IHZlcnNpb246IHN0cmluZzsgaXNQcmVSZWxlYXNlVmVyc2lvbjogYm9vbGVhbjsgdGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtOyBtYW5pZmVzdEFzc2V0OiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0IHwgbnVsbDsgZW5naW5lOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGVuYWJsZWRBcGlQcm9wb3NhbHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIH0sXG5cdFx0eyB0YXJnZXRQbGF0Zm9ybSwgY29tcGF0aWJsZSwgcHJvZHVjdFZlcnNpb24sIHZlcnNpb24gfTogT21pdDxFeHRlbnNpb25WZXJzaW9uQ3JpdGVyaWEsICd0YXJnZXRQbGF0Zm9ybSc+ICYgeyB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0gfCB1bmRlZmluZWQgfSxcblx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogc3RyaW5nLFxuXHRcdGFsbFRhcmdldFBsYXRmb3JtczogVGFyZ2V0UGxhdGZvcm1bXVxuXHQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdGNvbnN0IGhhc1ByZVJlbGVhc2UgPSBoYXNQcmVSZWxlYXNlRm9yRXh0ZW5zaW9uKGV4dGVuc2lvbi5pZCwgdGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdFx0Y29uc3QgZXhjbHVkZVZlcnNpb25SYW5nZSA9IGdldEV4Y2x1ZGVWZXJzaW9uUmFuZ2VGb3JFeHRlbnNpb24oZXh0ZW5zaW9uLmlkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdGlmIChleHRlbnNpb24uaXNQcmVSZWxlYXNlVmVyc2lvbiAmJiBoYXNQcmVSZWxlYXNlID09PSBmYWxzZSAvKiBTa2lwIGlmIGhhc1ByZVJlbGVhc2UgaXMgbm90IGRlZmluZWQgZm9yIHRoaXMgZXh0ZW5zaW9uICovKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGV4Y2x1ZGVWZXJzaW9uUmFuZ2UgJiYgc2VtdmVyLnNhdGlzZmllcyhleHRlbnNpb24udmVyc2lvbiwgZXhjbHVkZVZlcnNpb25SYW5nZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBTcGVjaWZpYyB2ZXJzaW9uXG5cdFx0aWYgKGlzU3RyaW5nKHZlcnNpb24pKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLnZlcnNpb24gIT09IHZlcnNpb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFByZXJlbGVhc2Ugb3IgcmVsZWFzZSB2ZXJzaW9uIGtpbmRcblx0XHRlbHNlIGlmICh2ZXJzaW9uID09PSBWZXJzaW9uS2luZC5SZWxlYXNlIHx8IHZlcnNpb24gPT09IFZlcnNpb25LaW5kLlByZXJlbGVhc2UpIHtcblx0XHRcdGlmIChleHRlbnNpb24uaXNQcmVSZWxlYXNlVmVyc2lvbiAhPT0gKHZlcnNpb24gPT09IFZlcnNpb25LaW5kLlByZXJlbGVhc2UpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0UGxhdGZvcm0gJiYgIWlzVGFyZ2V0UGxhdGZvcm1Db21wYXRpYmxlKGV4dGVuc2lvbi50YXJnZXRQbGF0Zm9ybSwgYWxsVGFyZ2V0UGxhdGZvcm1zLCB0YXJnZXRQbGF0Zm9ybSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoY29tcGF0aWJsZSkge1xuXHRcdFx0aWYgKHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZCh7IGlkOiBleHRlbnNpb24uaWQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lLCB2ZXJzaW9uOiBleHRlbnNpb24udmVyc2lvbiwgcHJlcmVsZWFzZTogZXh0ZW5zaW9uLmlzUHJlUmVsZWFzZVZlcnNpb24sIHRhcmdldFBsYXRmb3JtOiBleHRlbnNpb24udGFyZ2V0UGxhdGZvcm0gfSkgIT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIShhd2FpdCB0aGlzLmlzRW5naW5lVmFsaWQoZXh0ZW5zaW9uLmlkLCBleHRlbnNpb24udmVyc2lvbiwgZXh0ZW5zaW9uLmVuZ2luZSwgZXh0ZW5zaW9uLm1hbmlmZXN0QXNzZXQsIHByb2R1Y3RWZXJzaW9uKSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpc0VuZ2luZVZhbGlkKGV4dGVuc2lvbklkOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZywgZW5naW5lOiBzdHJpbmcgfCB1bmRlZmluZWQsIG1hbmlmZXN0QXNzZXQ6IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXQgfCBudWxsLCBwcm9kdWN0VmVyc2lvbjogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCFlbmdpbmUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGVuZ2luZSA9IGF3YWl0IHRoaXMuZ2V0RW5naW5lKGV4dGVuc2lvbklkLCB2ZXJzaW9uLCBtYW5pZmVzdEFzc2V0KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3Igd2hpbGUgZ2V0dGluZyB0aGUgZW5naW5lIGZvciB0aGUgdmVyc2lvbiAke3ZlcnNpb259LmAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFlbmdpbmUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgTWlzc2luZyBlbmdpbmUgZm9yIHRoZSBleHRlbnNpb24gJHtleHRlbnNpb25JZH0gd2l0aCB2ZXJzaW9uICR7dmVyc2lvbn1gKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXNFbmdpbmVWYWxpZChlbmdpbmUsIHByb2R1Y3RWZXJzaW9uLnZlcnNpb24sIHByb2R1Y3RWZXJzaW9uLmRhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRFbmdpbmUoZXh0ZW5zaW9uSWQ6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nLCBtYW5pZmVzdEFzc2V0OiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0IHwgbnVsbCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFtYW5pZmVzdEFzc2V0KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYE1pc3NpbmcgZW5naW5lIGFuZCBtYW5pZmVzdCBhc3NldCBmb3IgdGhlIGV4dGVuc2lvbiAke2V4dGVuc2lvbklkfSB3aXRoIHZlcnNpb24gJHt2ZXJzaW9ufWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHR5cGUgR2FsbGVyeVNlcnZpY2VFbmdpbmVGYWxsYmFja0NsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdFx0Y29tbWVudDogJ0ZhbGxiYWNrIHJlcXVlc3Qgd2hlbiBlbmdpbmUgaXMgbm90IGZvdW5kIGluIHByb3BlcnRpZXMgb2YgYW4gZXh0ZW5zaW9uIHZlcnNpb24nO1xuXHRcdFx0XHRleHRlbnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdleHRlbnNpb24gbmFtZScgfTtcblx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ3ZlcnNpb24nIH07XG5cdFx0XHR9O1xuXHRcdFx0dHlwZSBHYWxsZXJ5U2VydmljZUVuZ2luZUZhbGxiYWNrRXZlbnQgPSB7XG5cdFx0XHRcdGV4dGVuc2lvbjogc3RyaW5nO1xuXHRcdFx0XHRleHRlbnNpb25WZXJzaW9uOiBzdHJpbmc7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2FsbGVyeVNlcnZpY2VFbmdpbmVGYWxsYmFja0V2ZW50LCBHYWxsZXJ5U2VydmljZUVuZ2luZUZhbGxiYWNrQ2xhc3NpZmljYXRpb24+KCdnYWxsZXJ5U2VydmljZTplbmdpbmVGYWxsYmFjaycsIHsgZXh0ZW5zaW9uOiBleHRlbnNpb25JZCwgZXh0ZW5zaW9uVmVyc2lvbjogdmVyc2lvbiB9KTtcblxuXHRcdFx0Y29uc3QgaGVhZGVycyA9IHsgJ0FjY2VwdC1FbmNvZGluZyc6ICdnemlwJyB9O1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuZ2V0QXNzZXQoZXh0ZW5zaW9uSWQsIG1hbmlmZXN0QXNzZXQsIEFzc2V0VHlwZS5NYW5pZmVzdCwgdmVyc2lvbiwgJ2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmVuZ2luZVZlcnNpb24nLCB7IGhlYWRlcnMgfSk7XG5cdFx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGFzSnNvbjxJRXh0ZW5zaW9uTWFuaWZlc3Q+KGNvbnRleHQpO1xuXHRcdFx0aWYgKCFtYW5pZmVzdCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYE1hbmlmZXN0IHdhcyBub3QgZm91bmQgZm9yIHRoZSBleHRlbnNpb24gJHtleHRlbnNpb25JZH0gd2l0aCB2ZXJzaW9uICR7dmVyc2lvbn1gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBtYW5pZmVzdC5lbmdpbmVzLnZzY29kZTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciB3aGlsZSBnZXR0aW5nIHRoZSBlbmdpbmUgZm9yIHRoZSB2ZXJzaW9uICR7dmVyc2lvbn0uYCwgZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHF1ZXJ5KG9wdGlvbnM6IElRdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVBhZ2VyPElHYWxsZXJ5RXh0ZW5zaW9uPj4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKTtcblxuXHRcdGlmICghZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGV4dGVuc2lvbiBnYWxsZXJ5IHNlcnZpY2UgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRsZXQgdGV4dCA9IG9wdGlvbnMudGV4dCB8fCAnJztcblx0XHRjb25zdCBwYWdlU2l6ZSA9IG9wdGlvbnMucGFnZVNpemUgPz8gNTA7XG5cblx0XHRsZXQgcXVlcnkgPSBuZXcgUXVlcnkoKVxuXHRcdFx0LndpdGhQYWdlKDEsIHBhZ2VTaXplKTtcblxuXHRcdGlmICh0ZXh0KSB7XG5cdFx0XHQvLyBVc2UgY2F0ZWdvcnkgZmlsdGVyIGluc3RlYWQgb2YgXCJjYXRlZ29yeTp0aGVtZXNcIlxuXHRcdFx0dGV4dCA9IHRleHQucmVwbGFjZSgvXFxiY2F0ZWdvcnk6KFwiKFteXCJdKilcInwoW15cIl1cXFMqKSkoXFxzK3xcXGJ8JCkvZywgKF8sIHF1b3RlZENhdGVnb3J5LCBjYXRlZ29yeSkgPT4ge1xuXHRcdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhGaWx0ZXIoRmlsdGVyVHlwZS5DYXRlZ29yeSwgY2F0ZWdvcnkgfHwgcXVvdGVkQ2F0ZWdvcnkpO1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVXNlIHRhZyBmaWx0ZXIgaW5zdGVhZCBvZiBcInRhZzpkZWJ1Z2dlcnNcIlxuXHRcdFx0dGV4dCA9IHRleHQucmVwbGFjZSgvXFxidGFnOihcIihbXlwiXSopXCJ8KFteXCJdXFxTKikpKFxccyt8XFxifCQpL2csIChfLCBxdW90ZWRUYWcsIHRhZykgPT4ge1xuXHRcdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhGaWx0ZXIoRmlsdGVyVHlwZS5UYWcsIHRhZyB8fCBxdW90ZWRUYWcpO1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVXNlIGZlYXR1cmVkIGZpbHRlclxuXHRcdFx0dGV4dCA9IHRleHQucmVwbGFjZSgvXFxiZmVhdHVyZWQoXFxzK3xcXGJ8JCkvZywgKCkgPT4ge1xuXHRcdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhGaWx0ZXIoRmlsdGVyVHlwZS5GZWF0dXJlZCk7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXh0ID0gdGV4dC50cmltKCk7XG5cblx0XHRcdGlmICh0ZXh0KSB7XG5cdFx0XHRcdHRleHQgPSB0ZXh0Lmxlbmd0aCA8IDIwMCA/IHRleHQgOiB0ZXh0LnN1YnN0cmluZygwLCAyMDApO1xuXHRcdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhGaWx0ZXIoRmlsdGVyVHlwZS5TZWFyY2hUZXh0LCB0ZXh0KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9uUXVlcnkuc29ydGluZz8uc29tZShjID0+IGMubmFtZSA9PT0gU29ydEJ5Lk5vbmVPclJlbGV2YW5jZSkpIHtcblx0XHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoU29ydEJ5KFNvcnRCeS5Ob25lT3JSZWxldmFuY2UpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmNhcGFiaWxpdGllcy5leHRlbnNpb25RdWVyeS5zb3J0aW5nPy5zb21lKGMgPT4gYy5uYW1lID09PSBTb3J0QnkuSW5zdGFsbENvdW50KSkge1xuXHRcdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhTb3J0QnkoU29ydEJ5Lkluc3RhbGxDb3VudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuc29ydEJ5ICYmIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9uUXVlcnkuc29ydGluZz8uc29tZShjID0+IGMubmFtZSA9PT0gb3B0aW9ucy5zb3J0QnkpKSB7XG5cdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhTb3J0Qnkob3B0aW9ucy5zb3J0QnkpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5zb3J0T3JkZXIgPT09ICdudW1iZXInKSB7XG5cdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhTb3J0T3JkZXIob3B0aW9ucy5zb3J0T3JkZXIpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLnNvdXJjZSkge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoU291cmNlKG9wdGlvbnMuc291cmNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBydW5RdWVyeSA9IGFzeW5jIChxdWVyeTogUXVlcnksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0Y29uc3QgeyBleHRlbnNpb25zLCB0b3RhbCB9ID0gYXdhaXQgdGhpcy5xdWVyeUdhbGxlcnlFeHRlbnNpb25zKHF1ZXJ5LCB7IHRhcmdldFBsYXRmb3JtOiBDVVJSRU5UX1RBUkdFVF9QTEFURk9STSwgY29tcGF0aWJsZTogZmFsc2UsIGluY2x1ZGVQcmVSZWxlYXNlOiAhIW9wdGlvbnMuaW5jbHVkZVByZVJlbGVhc2UsIHByb2R1Y3RWZXJzaW9uOiBvcHRpb25zLnByb2R1Y3RWZXJzaW9uID8/IHsgdmVyc2lvbjogdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uLCBkYXRlOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGUgfSB9LCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRva2VuKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBJR2FsbGVyeUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRsZXQgZGVmYXVsdENoYXRBZ2VudEV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZXh0ZW5zaW9ucy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uc1tpbmRleF07XG5cdFx0XHRcdHNldFRlbGVtZXRyeShleHRlbnNpb24sICgocXVlcnkucGFnZU51bWJlciAtIDEpICogcXVlcnkucGFnZVNpemUpICsgaW5kZXgsIG9wdGlvbnMuc291cmNlKTtcblx0XHRcdFx0aWYgKHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudCAmJiBhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb24uaWRlbnRpZmllciwgeyBpZDogdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50LmV4dGVuc2lvbklkLCB9KSkge1xuXHRcdFx0XHRcdGRlZmF1bHRDaGF0QWdlbnRFeHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGRlZmF1bHRDaGF0QWdlbnRFeHRlbnNpb24pIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goZGVmYXVsdENoYXRBZ2VudEV4dGVuc2lvbik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGV4dGVuc2lvbnM6IHJlc3VsdCwgdG90YWwgfTtcblx0XHR9O1xuXHRcdGNvbnN0IHsgZXh0ZW5zaW9ucywgdG90YWwgfSA9IGF3YWl0IHJ1blF1ZXJ5KHF1ZXJ5LCB0b2tlbik7XG5cdFx0Y29uc3QgZ2V0UGFnZSA9IGFzeW5jIChwYWdlSW5kZXg6IG51bWJlciwgY3Q6IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRpZiAoY3QuaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IGV4dGVuc2lvbnMgfSA9IGF3YWl0IHJ1blF1ZXJ5KHF1ZXJ5LndpdGhQYWdlKHBhZ2VJbmRleCArIDEpLCBjdCk7XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9ucztcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHsgZmlyc3RQYWdlOiBleHRlbnNpb25zLCB0b3RhbCwgcGFnZVNpemU6IHF1ZXJ5LnBhZ2VTaXplLCBnZXRQYWdlIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHF1ZXJ5R2FsbGVyeUV4dGVuc2lvbnMocXVlcnk6IFF1ZXJ5LCBjcml0ZXJpYTogRXh0ZW5zaW9uc0NyaXRlcmlhLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBleHRlbnNpb25zOiBJR2FsbGVyeUV4dGVuc2lvbltdOyB0b3RhbDogbnVtYmVyIH0+IHtcblx0XHRjb25zdCBmbGFncyA9IHF1ZXJ5LmZsYWdzO1xuXG5cdFx0LyoqXG5cdFx0ICogSWYgYm90aCB2ZXJzaW9uIGZsYWdzIChJbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkgYW5kIEluY2x1ZGVWZXJzaW9ucykgYXJlIGluY2x1ZGVkLCB0aGVuIG9ubHkgaW5jbHVkZSBsYXRlc3QgdmVyc2lvbnMgKEluY2x1ZGVMYXRlc3RWZXJzaW9uT25seSkgZmxhZy5cblx0XHQgKi9cblx0XHRpZiAocXVlcnkuZmxhZ3MuaW5jbHVkZXMoRmxhZy5JbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkpICYmIHF1ZXJ5LmZsYWdzLmluY2x1ZGVzKEZsYWcuSW5jbHVkZVZlcnNpb25zKSkge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmxhZ3MoLi4ucXVlcnkuZmxhZ3MuZmlsdGVyKGZsYWcgPT4gZmxhZyAhPT0gRmxhZy5JbmNsdWRlVmVyc2lvbnMpKTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBJZiB2ZXJzaW9uIGZsYWdzIChJbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkgYW5kIEluY2x1ZGVWZXJzaW9ucykgYXJlIG5vdCBpbmNsdWRlZCwgZGVmYXVsdCBpcyB0byBxdWVyeSBmb3IgbGF0ZXN0IHZlcnNpb25zIChJbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkpLlxuXHRcdCAqL1xuXHRcdGlmICghcXVlcnkuZmxhZ3MuaW5jbHVkZXMoRmxhZy5JbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkpICYmICFxdWVyeS5mbGFncy5pbmNsdWRlcyhGbGFnLkluY2x1ZGVWZXJzaW9ucykpIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aEZsYWdzKC4uLnF1ZXJ5LmZsYWdzLCBGbGFnLkluY2x1ZGVMYXRlc3RWZXJzaW9uT25seSk7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogSWYgdmVyc2lvbnMgY3JpdGVyaWEgZXhpc3Qgb3IgZXZlcnkgcmVxdWVzdGVkIGV4dGVuc2lvbiBpcyBmb3IgcmVsZWFzZSB2ZXJzaW9uIGFuZCBoYXMgYSBwcmUtcmVsZWFzZSB2ZXJzaW9uLCB0aGVuIHJlbW92ZSBsYXRlc3QgZmxhZ3MgYW5kIGFkZCBhbGwgdmVyc2lvbnMgZmxhZy5cblx0XHQgKi9cblx0XHRpZiAoY3JpdGVyaWEudmVyc2lvbnM/Lmxlbmd0aCB8fCBjcml0ZXJpYS5pc1F1ZXJ5Rm9yUmVsZWFzZVZlcnNpb25Gcm9tUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aEZsYWdzKC4uLnF1ZXJ5LmZsYWdzLmZpbHRlcihmbGFnID0+IGZsYWcgIT09IEZsYWcuSW5jbHVkZUxhdGVzdFZlcnNpb25Pbmx5KSwgRmxhZy5JbmNsdWRlVmVyc2lvbnMpO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIEFkZCBuZWNlc3NhcnkgZXh0ZW5zaW9uIGZsYWdzXG5cdFx0ICovXG5cdFx0cXVlcnkgPSBxdWVyeS53aXRoRmxhZ3MoLi4ucXVlcnkuZmxhZ3MsIEZsYWcuSW5jbHVkZUFzc2V0VXJpLCBGbGFnLkluY2x1ZGVDYXRlZ29yeUFuZFRhZ3MsIEZsYWcuSW5jbHVkZUZpbGVzLCBGbGFnLkluY2x1ZGVTdGF0aXN0aWNzLCBGbGFnLkluY2x1ZGVWZXJzaW9uUHJvcGVydGllcyk7XG5cdFx0Y29uc3QgeyBnYWxsZXJ5RXh0ZW5zaW9uczogcmF3R2FsbGVyeUV4dGVuc2lvbnMsIHRvdGFsLCBjb250ZXh0IH0gPSBhd2FpdCB0aGlzLnF1ZXJ5UmF3R2FsbGVyeUV4dGVuc2lvbnMocXVlcnksIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdG9rZW4pO1xuXG5cdFx0Y29uc3QgaGFzQWxsVmVyc2lvbnM6IGJvb2xlYW4gPSAhcXVlcnkuZmxhZ3MuaW5jbHVkZXMoRmxhZy5JbmNsdWRlTGF0ZXN0VmVyc2lvbk9ubHkpO1xuXHRcdGlmIChoYXNBbGxWZXJzaW9ucykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uczogSUdhbGxlcnlFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByYXdHYWxsZXJ5RXh0ZW5zaW9uIG9mIHJhd0dhbGxlcnlFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IGdldEFsbFRhcmdldFBsYXRmb3JtcyhyYXdHYWxsZXJ5RXh0ZW5zaW9uKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWRlbnRpZmllciA9IHsgaWQ6IGdldEdhbGxlcnlFeHRlbnNpb25JZChyYXdHYWxsZXJ5RXh0ZW5zaW9uLnB1Ymxpc2hlci5wdWJsaXNoZXJOYW1lLCByYXdHYWxsZXJ5RXh0ZW5zaW9uLmV4dGVuc2lvbk5hbWUpLCB1dWlkOiByYXdHYWxsZXJ5RXh0ZW5zaW9uLmV4dGVuc2lvbklkIH07XG5cdFx0XHRcdGNvbnN0IGluY2x1ZGVQcmVSZWxlYXNlID0gaXNCb29sZWFuKGNyaXRlcmlhLmluY2x1ZGVQcmVSZWxlYXNlKSA/IGNyaXRlcmlhLmluY2x1ZGVQcmVSZWxlYXNlIDogISFjcml0ZXJpYS5pbmNsdWRlUHJlUmVsZWFzZS5maW5kKGV4dGVuc2lvbklkZW50aWZpZXJXaXRoUHJlUmVsZWFzZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb25JZGVudGlmaWVyV2l0aFByZVJlbGVhc2UsIGV4dGVuc2lvbklkZW50aWZpZXIpKT8uaW5jbHVkZVByZVJlbGVhc2U7XG5cdFx0XHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uID0gYXdhaXQgdGhpcy5nZXRWYWxpZFJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKFxuXHRcdFx0XHRcdHJhd0dhbGxlcnlFeHRlbnNpb24sXG5cdFx0XHRcdFx0cmF3R2FsbGVyeUV4dGVuc2lvbi52ZXJzaW9ucyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRjb21wYXRpYmxlOiBjcml0ZXJpYS5jb21wYXRpYmxlLFxuXHRcdFx0XHRcdFx0dGFyZ2V0UGxhdGZvcm06IGNyaXRlcmlhLnRhcmdldFBsYXRmb3JtLFxuXHRcdFx0XHRcdFx0cHJvZHVjdFZlcnNpb246IGNyaXRlcmlhLnByb2R1Y3RWZXJzaW9uLFxuXHRcdFx0XHRcdFx0dmVyc2lvbjogY3JpdGVyaWEudmVyc2lvbnM/LmZpbmQoZXh0ZW5zaW9uSWRlbnRpZmllcldpdGhWZXJzaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbklkZW50aWZpZXJXaXRoVmVyc2lvbiwgZXh0ZW5zaW9uSWRlbnRpZmllcikpPy52ZXJzaW9uXG5cdFx0XHRcdFx0XHRcdD8/IChpbmNsdWRlUHJlUmVsZWFzZSA/IFZlcnNpb25LaW5kLkxhdGVzdCA6IFZlcnNpb25LaW5kLlJlbGVhc2UpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhbGxUYXJnZXRQbGF0Zm9ybXNcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKHRvRXh0ZW5zaW9uKHJhd0dhbGxlcnlFeHRlbnNpb24sIHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uLCBhbGxUYXJnZXRQbGF0Zm9ybXMsIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdGhpcy5wcm9kdWN0U2VydmljZSwgY29udGV4dCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBleHRlbnNpb25zLCB0b3RhbCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogW251bWJlciwgSUdhbGxlcnlFeHRlbnNpb25dW10gPSBbXTtcblx0XHRjb25zdCBuZWVkQWxsVmVyc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCByYXdHYWxsZXJ5RXh0ZW5zaW9ucy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb24gPSByYXdHYWxsZXJ5RXh0ZW5zaW9uc1tpbmRleF07XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZGVudGlmaWVyID0geyBpZDogZ2V0R2FsbGVyeUV4dGVuc2lvbklkKHJhd0dhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLnB1Ymxpc2hlck5hbWUsIHJhd0dhbGxlcnlFeHRlbnNpb24uZXh0ZW5zaW9uTmFtZSksIHV1aWQ6IHJhd0dhbGxlcnlFeHRlbnNpb24uZXh0ZW5zaW9uSWQgfTtcblx0XHRcdGNvbnN0IGluY2x1ZGVQcmVSZWxlYXNlID0gaXNCb29sZWFuKGNyaXRlcmlhLmluY2x1ZGVQcmVSZWxlYXNlKSA/IGNyaXRlcmlhLmluY2x1ZGVQcmVSZWxlYXNlIDogISFjcml0ZXJpYS5pbmNsdWRlUHJlUmVsZWFzZS5maW5kKGV4dGVuc2lvbklkZW50aWZpZXJXaXRoUHJlUmVsZWFzZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhleHRlbnNpb25JZGVudGlmaWVyV2l0aFByZVJlbGVhc2UsIGV4dGVuc2lvbklkZW50aWZpZXIpKT8uaW5jbHVkZVByZVJlbGVhc2U7XG5cdFx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBnZXRBbGxUYXJnZXRQbGF0Zm9ybXMocmF3R2FsbGVyeUV4dGVuc2lvbik7XG5cdFx0XHRpZiAoY3JpdGVyaWEuY29tcGF0aWJsZSkge1xuXHRcdFx0XHQvLyBTa2lwIGxvb2tpbmcgZm9yIGFsbCB2ZXJzaW9ucyBpZiByZXF1ZXN0ZWQgZm9yIGEgd2ViLWNvbXBhdGlibGUgZXh0ZW5zaW9uIGFuZCBpdCBpcyBub3QgYSB3ZWIgZXh0ZW5zaW9uLlxuXHRcdFx0XHRpZiAoaXNOb3RXZWJFeHRlbnNpb25JbldlYlRhcmdldFBsYXRmb3JtKGFsbFRhcmdldFBsYXRmb3JtcywgY3JpdGVyaWEudGFyZ2V0UGxhdGZvcm0pKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gU2tpcCBsb29raW5nIGZvciBhbGwgdmVyc2lvbnMgaWYgdGhlIGV4dGVuc2lvbiBpcyBub3QgYWxsb3dlZC5cblx0XHRcdFx0aWYgKHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZCh7IGlkOiBleHRlbnNpb25JZGVudGlmaWVyLmlkLCBwdWJsaXNoZXJEaXNwbGF5TmFtZTogcmF3R2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIuZGlzcGxheU5hbWUgfSkgIT09IHRydWUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24gPSBhd2FpdCB0aGlzLmdldFZhbGlkUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24oXG5cdFx0XHRcdHJhd0dhbGxlcnlFeHRlbnNpb24sXG5cdFx0XHRcdHJhd0dhbGxlcnlFeHRlbnNpb24udmVyc2lvbnMsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb21wYXRpYmxlOiBjcml0ZXJpYS5jb21wYXRpYmxlLFxuXHRcdFx0XHRcdHRhcmdldFBsYXRmb3JtOiBjcml0ZXJpYS50YXJnZXRQbGF0Zm9ybSxcblx0XHRcdFx0XHRwcm9kdWN0VmVyc2lvbjogY3JpdGVyaWEucHJvZHVjdFZlcnNpb24sXG5cdFx0XHRcdFx0dmVyc2lvbjogY3JpdGVyaWEudmVyc2lvbnM/LmZpbmQoZXh0ZW5zaW9uSWRlbnRpZmllcldpdGhWZXJzaW9uID0+IGFyZVNhbWVFeHRlbnNpb25zKGV4dGVuc2lvbklkZW50aWZpZXJXaXRoVmVyc2lvbiwgZXh0ZW5zaW9uSWRlbnRpZmllcikpPy52ZXJzaW9uXG5cdFx0XHRcdFx0XHQ/PyAoaW5jbHVkZVByZVJlbGVhc2UgPyBWZXJzaW9uS2luZC5MYXRlc3QgOiBWZXJzaW9uS2luZC5SZWxlYXNlKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhbGxUYXJnZXRQbGF0Zm9ybXNcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSByYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiA/IHRvRXh0ZW5zaW9uKHJhd0dhbGxlcnlFeHRlbnNpb24sIHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uLCBhbGxUYXJnZXRQbGF0Zm9ybXMsIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdGhpcy5wcm9kdWN0U2VydmljZSwgY29udGV4dCkgOiBudWxsO1xuXHRcdFx0aWYgKCFleHRlbnNpb25cblx0XHRcdFx0LyoqIE5lZWQgYWxsIHZlcnNpb25zIGlmIHRoZSBleHRlbnNpb24gaXMgYSBwcmUtcmVsZWFzZSB2ZXJzaW9uIGJ1dFxuXHRcdFx0XHQgKiBcdFx0LSB0aGUgcXVlcnkgaXMgdG8gbG9vayBmb3IgYSByZWxlYXNlIHZlcnNpb24gb3Jcblx0XHRcdFx0ICogXHRcdC0gdGhlIGV4dGVuc2lvbiBoYXMgbm8gcmVsZWFzZSB2ZXJzaW9uXG5cdFx0XHRcdCAqIEdldCBhbGwgdmVyc2lvbnMgdG8gZ2V0IG9yIGNoZWNrIHRoZSByZWxlYXNlIHZlcnNpb25cblx0XHRcdFx0Ki9cblx0XHRcdFx0fHwgKGV4dGVuc2lvbi5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24gJiYgKCFpbmNsdWRlUHJlUmVsZWFzZSB8fCAhZXh0ZW5zaW9uLmhhc1JlbGVhc2VWZXJzaW9uKSlcblx0XHRcdFx0LyoqXG5cdFx0XHRcdCAqIE5lZWQgYWxsIHZlcnNpb25zIGlmIHRoZSBleHRlbnNpb24gaXMgYSByZWxlYXNlIHZlcnNpb24gd2l0aCBhIGRpZmZlcmVudCB0YXJnZXQgcGxhdGZvcm0gdGhhbiByZXF1ZXN0ZWQgYW5kIGFsc28gaGFzIGEgcHJlLXJlbGVhc2UgdmVyc2lvblxuXHRcdFx0XHQgKiBCZWNhdXNlLCB0aGlzIGlzIGEgcGxhdGZvcm0gc3BlY2lmaWMgZXh0ZW5zaW9uIGFuZCBjYW4gaGF2ZSBhIG5ld2VyIHJlbGVhc2UgdmVyc2lvbiBzdXBwb3J0aW5nIHRoaXMgcGxhdGZvcm0uXG5cdFx0XHRcdCAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM5NjI4XG5cdFx0XHRcdCovXG5cdFx0XHRcdHx8ICghZXh0ZW5zaW9uLnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbiAmJiBleHRlbnNpb24ucHJvcGVydGllcy50YXJnZXRQbGF0Zm9ybSAhPT0gY3JpdGVyaWEudGFyZ2V0UGxhdGZvcm0gJiYgZXh0ZW5zaW9uLmhhc1ByZVJlbGVhc2VWZXJzaW9uKVxuXHRcdFx0KSB7XG5cdFx0XHRcdG5lZWRBbGxWZXJzaW9ucy5zZXQocmF3R2FsbGVyeUV4dGVuc2lvbi5leHRlbnNpb25JZCwgaW5kZXgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goW2luZGV4LCBleHRlbnNpb25dKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobmVlZEFsbFZlcnNpb25zLnNpemUpIHtcblx0XHRcdGNvbnN0IHN0b3BXYXRjaCA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHRcdGNvbnN0IHF1ZXJ5ID0gbmV3IFF1ZXJ5KClcblx0XHRcdFx0LndpdGhGbGFncyguLi5mbGFncy5maWx0ZXIoZmxhZyA9PiBmbGFnICE9PSBGbGFnLkluY2x1ZGVMYXRlc3RWZXJzaW9uT25seSksIEZsYWcuSW5jbHVkZVZlcnNpb25zKVxuXHRcdFx0XHQud2l0aFBhZ2UoMSwgbmVlZEFsbFZlcnNpb25zLnNpemUpXG5cdFx0XHRcdC53aXRoRmlsdGVyKEZpbHRlclR5cGUuRXh0ZW5zaW9uSWQsIC4uLm5lZWRBbGxWZXJzaW9ucy5rZXlzKCkpO1xuXHRcdFx0Y29uc3QgeyBleHRlbnNpb25zIH0gPSBhd2FpdCB0aGlzLnF1ZXJ5R2FsbGVyeUV4dGVuc2lvbnMocXVlcnksIGNyaXRlcmlhLCBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIHRva2VuKTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdhbGxlcnlTZXJ2aWNlQWRkaXRpb25hbFF1ZXJ5RXZlbnQsIEdhbGxlcnlTZXJ2aWNlQWRkaXRpb25hbFF1ZXJ5Q2xhc3NpZmljYXRpb24+KCdnYWxsZXJ5U2VydmljZTphZGRpdGlvbmFsUXVlcnknLCB7XG5cdFx0XHRcdGR1cmF0aW9uOiBzdG9wV2F0Y2guZWxhcHNlZCgpLFxuXHRcdFx0XHRjb3VudDogbmVlZEFsbFZlcnNpb25zLnNpemVcblx0XHRcdH0pO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IG5lZWRBbGxWZXJzaW9ucy5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCkhO1xuXHRcdFx0XHRyZXN1bHQucHVzaChbaW5kZXgsIGV4dGVuc2lvbl0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IGV4dGVuc2lvbnM6IHJlc3VsdC5zb3J0KChhLCBiKSA9PiBhWzBdIC0gYlswXSkubWFwKChbLCBleHRlbnNpb25dKSA9PiBleHRlbnNpb24pLCB0b3RhbCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRWYWxpZFJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKHJhd0dhbGxlcnlFeHRlbnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uLCB2ZXJzaW9uczogSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10sIGNyaXRlcmlhOiBFeHRlbnNpb25WZXJzaW9uQ3JpdGVyaWEsIGFsbFRhcmdldFBsYXRmb3JtczogVGFyZ2V0UGxhdGZvcm1bXSk6IFByb21pc2U8SVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkZW50aWZpZXIgPSB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQocmF3R2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIucHVibGlzaGVyTmFtZSwgcmF3R2FsbGVyeUV4dGVuc2lvbi5leHRlbnNpb25OYW1lKSwgdXVpZDogcmF3R2FsbGVyeUV4dGVuc2lvbi5leHRlbnNpb25JZCB9O1xuXHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9ucyA9IHNvcnRFeHRlbnNpb25WZXJzaW9ucyh2ZXJzaW9ucywgY3JpdGVyaWEudGFyZ2V0UGxhdGZvcm0pO1xuXG5cdFx0aWYgKGNyaXRlcmlhLmNvbXBhdGlibGUgJiYgaXNOb3RXZWJFeHRlbnNpb25JbldlYlRhcmdldFBsYXRmb3JtKGFsbFRhcmdldFBsYXRmb3JtcywgY3JpdGVyaWEudGFyZ2V0UGxhdGZvcm0pKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCB2ZXJzaW9uID0gaXNTdHJpbmcoY3JpdGVyaWEudmVyc2lvbikgPyBjcml0ZXJpYS52ZXJzaW9uIDogdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9ucy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uID0gcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb25zW2luZGV4XTtcblx0XHRcdGlmIChjcml0ZXJpYS5jb21wYXRpYmxlKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2V0RW5naW5lSWZOb3RFeGlzdHMoZXh0ZW5zaW9uSWRlbnRpZmllci5pZCwgcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGF3YWl0IHRoaXMuaXNWYWxpZFZlcnNpb24oXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogZXh0ZW5zaW9uSWRlbnRpZmllci5pZCxcblx0XHRcdFx0XHR2ZXJzaW9uOiByYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbi52ZXJzaW9uLFxuXHRcdFx0XHRcdGlzUHJlUmVsZWFzZVZlcnNpb246IGlzUHJlUmVsZWFzZVZlcnNpb24ocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pLFxuXHRcdFx0XHRcdHRhcmdldFBsYXRmb3JtOiBnZXRUYXJnZXRQbGF0Zm9ybUZvckV4dGVuc2lvblZlcnNpb24ocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pLFxuXHRcdFx0XHRcdGVuZ2luZTogZ2V0RW5naW5lKHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uKSxcblx0XHRcdFx0XHRtYW5pZmVzdEFzc2V0OiBnZXRWZXJzaW9uQXNzZXQocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIEFzc2V0VHlwZS5NYW5pZmVzdCksXG5cdFx0XHRcdFx0ZW5hYmxlZEFwaVByb3Bvc2FsczogZ2V0RW5hYmxlZEFwaVByb3Bvc2FscyhyYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbilcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3JpdGVyaWEsXG5cdFx0XHRcdHJhd0dhbGxlcnlFeHRlbnNpb24ucHVibGlzaGVyLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRhbGxUYXJnZXRQbGF0Zm9ybXMpXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIHJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZlcnNpb24gJiYgcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24udmVyc2lvbiA9PT0gdmVyc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodmVyc2lvbiB8fCBjcml0ZXJpYS5jb21wYXRpYmxlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBGYWxsYmFjazogUmV0dXJuIHRoZSBsYXRlc3QgdmVyc2lvblxuXHRcdCAqIFRoaXMgY2FuIGhhcHBlbiB3aGVuIHRoZSBleHRlbnNpb24gZG9lcyBub3QgaGF2ZSBhIHJlbGVhc2UgdmVyc2lvbiBvciBkb2VzIG5vdCBoYXZlIGEgdmVyc2lvbiBjb21wYXRpYmxlIHdpdGggdGhlIGdpdmVuIHRhcmdldCBwbGF0Zm9ybS5cblx0XHQgKi9cblx0XHRyZXR1cm4gcmF3R2FsbGVyeUV4dGVuc2lvbi52ZXJzaW9uc1swXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0RW5naW5lSWZOb3RFeGlzdHMoZXh0ZW5zaW9uSWQ6IHN0cmluZywgcmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb246IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChnZXRFbmdpbmUocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGVuZ2luZSA9IGF3YWl0IHRoaXMuZ2V0RW5naW5lKGV4dGVuc2lvbklkLCByYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbi52ZXJzaW9uLCBnZXRWZXJzaW9uQXNzZXQocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIEFzc2V0VHlwZS5NYW5pZmVzdCkpO1xuXHRcdFx0aWYgKGVuZ2luZSkge1xuXHRcdFx0XHRzZXRFbmdpbmUocmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIGVuZ2luZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRXJyb3Igd2hpbGUgZ2V0dGluZyB0aGUgZW5naW5lIGZvciB0aGUgdmVyc2lvbiAke3Jhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uLnZlcnNpb259LmAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcXVlcnlSYXdHYWxsZXJ5RXh0ZW5zaW9ucyhxdWVyeTogUXVlcnksIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmF3R2FsbGVyeUV4dGVuc2lvbnNSZXN1bHQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25zUXVlcnlBcGkgPSBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uUXVlcnlTZXJ2aWNlKTtcblxuXHRcdGlmICghZXh0ZW5zaW9uc1F1ZXJ5QXBpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGV4dGVuc2lvbiBnYWxsZXJ5IHF1ZXJ5IHNlcnZpY2UgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRxdWVyeSA9IHF1ZXJ5XG5cdFx0XHQvKiBBbHdheXMgZXhjbHVkZSBub24gdmFsaWRhdGVkIGV4dGVuc2lvbnMgKi9cblx0XHRcdC53aXRoRmxhZ3MoLi4ucXVlcnkuZmxhZ3MsIEZsYWcuRXhjbHVkZU5vblZhbGlkYXRlZClcblx0XHRcdC53aXRoRmlsdGVyKEZpbHRlclR5cGUuVGFyZ2V0LCAnTWljcm9zb2Z0LlZpc3VhbFN0dWRpby5Db2RlJyk7XG5cblx0XHRjb25zdCB1bnB1Ymxpc2hlZEZsYWcgPSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuY2FwYWJpbGl0aWVzLmV4dGVuc2lvblF1ZXJ5LmZsYWdzPy5maW5kKGYgPT4gZi5uYW1lID09PSBGbGFnLlVucHVibGlzaGVkKTtcblx0XHQvKiBBbHdheXMgZXhjbHVkZSB1bnB1Ymxpc2hlZCBleHRlbnNpb25zICovXG5cdFx0aWYgKHVucHVibGlzaGVkRmxhZykge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmlsdGVyKEZpbHRlclR5cGUuRXhjbHVkZVdpdGhGbGFncywgU3RyaW5nKHVucHVibGlzaGVkRmxhZy52YWx1ZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRmaWx0ZXJzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjcml0ZXJpYTogcXVlcnkuY3JpdGVyaWEucmVkdWNlPHsgZmlsdGVyVHlwZTogbnVtYmVyOyB2YWx1ZT86IHN0cmluZyB9W10+KChjcml0ZXJpYSwgYykgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3JpdGVyaXVtID0gZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmNhcGFiaWxpdGllcy5leHRlbnNpb25RdWVyeS5maWx0ZXJpbmc/LmZpbmQoZiA9PiBmLm5hbWUgPT09IGMuZmlsdGVyVHlwZSk7XG5cdFx0XHRcdFx0XHRpZiAoY3JpdGVyaXVtKSB7XG5cdFx0XHRcdFx0XHRcdGNyaXRlcmlhLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdGZpbHRlclR5cGU6IGNyaXRlcml1bS52YWx1ZSxcblx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogYy52YWx1ZSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gY3JpdGVyaWE7XG5cdFx0XHRcdFx0fSwgW10pLFxuXHRcdFx0XHRcdHBhZ2VOdW1iZXI6IHF1ZXJ5LnBhZ2VOdW1iZXIsXG5cdFx0XHRcdFx0cGFnZVNpemU6IHF1ZXJ5LnBhZ2VTaXplLFxuXHRcdFx0XHRcdHNvcnRCeTogZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmNhcGFiaWxpdGllcy5leHRlbnNpb25RdWVyeS5zb3J0aW5nPy5maW5kKHMgPT4gcy5uYW1lID09PSBxdWVyeS5zb3J0QnkpPy52YWx1ZSxcblx0XHRcdFx0XHRzb3J0T3JkZXI6IHF1ZXJ5LnNvcnRPcmRlcixcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGFzc2V0VHlwZXM6IHF1ZXJ5LmFzc2V0VHlwZXMsXG5cdFx0XHRmbGFnczogcXVlcnkuZmxhZ3MucmVkdWNlPG51bWJlcj4oKGZsYWdzLCBmbGFnKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZsYWdWYWx1ZSA9IGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9uUXVlcnkuZmxhZ3M/LmZpbmQoZiA9PiBmLm5hbWUgPT09IGZsYWcpO1xuXHRcdFx0XHRpZiAoZmxhZ1ZhbHVlKSB7XG5cdFx0XHRcdFx0ZmxhZ3MgfD0gZmxhZ1ZhbHVlLnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmbGFncztcblx0XHRcdH0sIDApXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb21tb25IZWFkZXJzID0gYXdhaXQgdGhpcy5jb21tb25IZWFkZXJzUHJvbWlzZTtcblx0XHRjb25zdCBoZWFkZXJzID0ge1xuXHRcdFx0Li4uY29tbW9uSGVhZGVycyxcblx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb247YXBpLXZlcnNpb249My4wLXByZXZpZXcuMScsXG5cdFx0XHQnQWNjZXB0LUVuY29kaW5nJzogJ2d6aXAnLFxuXHRcdFx0J0NvbnRlbnQtTGVuZ3RoJzogU3RyaW5nKGRhdGEubGVuZ3RoKSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcFdhdGNoID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdGxldCBjb250ZXh0OiBJUmVxdWVzdENvbnRleHQgfCB1bmRlZmluZWQsIGVycm9yQ29kZTogRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZSB8IHVuZGVmaW5lZCwgdG90YWw6IG51bWJlciA9IDA7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHRcdHR5cGU6ICdQT1NUJyxcblx0XHRcdFx0dXJsOiBleHRlbnNpb25zUXVlcnlBcGksXG5cdFx0XHRcdGRhdGEsXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdGNhbGxTaXRlOiAnZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UucXVlcnlSYXdHYWxsZXJ5RXh0ZW5zaW9ucydcblx0XHRcdH0sIHRva2VuKTtcblxuXHRcdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA+PSA0MDAgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA8IDUwMCkge1xuXHRcdFx0XHRyZXR1cm4geyBnYWxsZXJ5RXh0ZW5zaW9uczogW10sIHRvdGFsIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFzSnNvbjxJUmF3R2FsbGVyeVF1ZXJ5UmVzdWx0Pihjb250ZXh0KTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y29uc3QgciA9IHJlc3VsdC5yZXN1bHRzWzBdO1xuXHRcdFx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9ucyA9IHIuZXh0ZW5zaW9ucztcblx0XHRcdFx0Y29uc3QgcmVzdWx0Q291bnQgPSByLnJlc3VsdE1ldGFkYXRhICYmIHIucmVzdWx0TWV0YWRhdGEuZmlsdGVyKG0gPT4gbS5tZXRhZGF0YVR5cGUgPT09ICdSZXN1bHRDb3VudCcpWzBdO1xuXHRcdFx0XHR0b3RhbCA9IHJlc3VsdENvdW50ICYmIHJlc3VsdENvdW50Lm1ldGFkYXRhSXRlbXMuZmlsdGVyKGkgPT4gaS5uYW1lID09PSAnVG90YWxDb3VudCcpWzBdLmNvdW50IHx8IDA7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9ucyxcblx0XHRcdFx0XHR0b3RhbCxcblx0XHRcdFx0XHRjb250ZXh0OiBjb250ZXh0LnJlcy5oZWFkZXJzWydhY3Rpdml0eWlkJ10gPyB7XG5cdFx0XHRcdFx0XHRbU0VBUkNIX0FDVElWSVRZX0hFQURFUl9OQU1FXTogY29udGV4dC5yZXMuaGVhZGVyc1snYWN0aXZpdHlpZCddXG5cdFx0XHRcdFx0fSA6IHt9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBnYWxsZXJ5RXh0ZW5zaW9uczogW10sIHRvdGFsIH07XG5cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHRlcnJvckNvZGUgPSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLkNhbmNlbGxlZDtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IGdldEVycm9yTWVzc2FnZShlKTtcblx0XHRcdFx0ZXJyb3JDb2RlID0gaXNPZmZsaW5lRXJyb3IoZSlcblx0XHRcdFx0XHQ/IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuT2ZmbGluZVxuXHRcdFx0XHRcdDogZXJyb3JNZXNzYWdlLnN0YXJ0c1dpdGgoJ1hIUiB0aW1lb3V0Jylcblx0XHRcdFx0XHRcdD8gRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5UaW1lb3V0XG5cdFx0XHRcdFx0XHQ6IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuRmFpbGVkO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uR2FsbGVyeUVycm9yKGVycm9yTWVzc2FnZSwgZXJyb3JDb2RlKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2FsbGVyeVNlcnZpY2VRdWVyeUV2ZW50LCBHYWxsZXJ5U2VydmljZVF1ZXJ5Q2xhc3NpZmljYXRpb24+KCdnYWxsZXJ5U2VydmljZTpxdWVyeScsIHtcblx0XHRcdFx0ZmlsdGVyVHlwZXM6IHF1ZXJ5LmNyaXRlcmlhLm1hcChjcml0ZXJpdW0gPT4gY3JpdGVyaXVtLmZpbHRlclR5cGUpLFxuXHRcdFx0XHRmbGFnczogcXVlcnkuZmxhZ3MsXG5cdFx0XHRcdHNvcnRCeTogcXVlcnkuc29ydEJ5LFxuXHRcdFx0XHRzb3J0T3JkZXI6IFN0cmluZyhxdWVyeS5zb3J0T3JkZXIpLFxuXHRcdFx0XHRwYWdlTnVtYmVyOiBTdHJpbmcocXVlcnkucGFnZU51bWJlciksXG5cdFx0XHRcdHNvdXJjZTogcXVlcnkuc291cmNlLFxuXHRcdFx0XHRzZWFyY2hUZXh0TGVuZ3RoOiBxdWVyeS5zZWFyY2hUZXh0Lmxlbmd0aCxcblx0XHRcdFx0cmVxdWVzdEJvZHlTaXplOiBTdHJpbmcoZGF0YS5sZW5ndGgpLFxuXHRcdFx0XHRkdXJhdGlvbjogc3RvcFdhdGNoLmVsYXBzZWQoKSxcblx0XHRcdFx0c3VjY2VzczogISFjb250ZXh0ICYmIGlzU3VjY2Vzcyhjb250ZXh0KSxcblx0XHRcdFx0cmVzcG9uc2VCb2R5U2l6ZTogY29udGV4dD8ucmVzLmhlYWRlcnNbJ0NvbnRlbnQtTGVuZ3RoJ10sXG5cdFx0XHRcdHN0YXR1c0NvZGU6IGNvbnRleHQgPyBTdHJpbmcoY29udGV4dC5yZXMuc3RhdHVzQ29kZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVycm9yQ29kZSxcblx0XHRcdFx0Y291bnQ6IFN0cmluZyh0b3RhbCksXG5cdFx0XHRcdHNlcnZlcjogdGhpcy5nZXRIZWFkZXJWYWx1ZShjb250ZXh0Py5yZXMuaGVhZGVycywgU0VSVkVSX0hFQURFUl9OQU1FKSxcblx0XHRcdFx0YWN0aXZpdHlJZDogdGhpcy5nZXRIZWFkZXJWYWx1ZShjb250ZXh0Py5yZXMuaGVhZGVycywgQUNUSVZJVFlfSEVBREVSX05BTUUpLFxuXHRcdFx0XHRlbmRUb0VuZElkOiB0aGlzLmdldEhlYWRlclZhbHVlKGNvbnRleHQ/LnJlcy5oZWFkZXJzLCBFTkRfRU5EX0lEX0hFQURFUl9OQU1FKSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SGVhZGVyVmFsdWUoaGVhZGVyczogSUhlYWRlcnMgfCB1bmRlZmluZWQsIG5hbWU6IHN0cmluZyk6IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBoZWFkZXJWYWx1ZSA9IGhlYWRlcnM/LltuYW1lLnRvTG93ZXJDYXNlKCldO1xuXHRcdGNvbnN0IHZhbHVlID0gQXJyYXkuaXNBcnJheShoZWFkZXJWYWx1ZSkgPyBoZWFkZXJWYWx1ZVswXSA6IGhlYWRlclZhbHVlO1xuXHRcdHJldHVybiB2YWx1ZSA/IG5ldyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUodmFsdWUpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRMYXRlc3RSYXdHYWxsZXJ5RXh0ZW5zaW9uV2l0aEZhbGxiYWNrKGV4dGVuc2lvbkluZm86IElFeHRlbnNpb25JbmZvLCByZXNvdXJjZUFwaTogeyB1cmk6IHN0cmluZzsgZmFsbGJhY2s/OiBzdHJpbmcgfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmF3R2FsbGVyeUV4dGVuc2lvbiB8IG51bGw+IHtcblx0XHRjb25zdCBbcHVibGlzaGVyLCBuYW1lXSA9IGV4dGVuc2lvbkluZm8uaWQuc3BsaXQoJy4nKTtcblx0XHRsZXQgZXJyb3JDb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShmb3JtYXQyKHJlc291cmNlQXBpLnVyaSwgeyBwdWJsaXNoZXIsIG5hbWUgfSkpO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZ2V0TGF0ZXN0UmF3R2FsbGVyeUV4dGVuc2lvbihleHRlbnNpb25JbmZvLmlkLCB1cmksIHRva2VuKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uR2FsbGVyeUVycm9yKSB7XG5cdFx0XHRcdGVycm9yQ29kZSA9IGVycm9yLmNvZGU7XG5cdFx0XHRcdHN3aXRjaCAoZXJyb3IuY29kZSkge1xuXHRcdFx0XHRcdGNhc2UgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5PZmZsaW5lOlxuXHRcdFx0XHRcdGNhc2UgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5DYW5jZWxsZWQ6XG5cdFx0XHRcdFx0Y2FzZSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLlRpbWVvdXQ6XG5cdFx0XHRcdFx0Y2FzZSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLkNsaWVudEVycm9yOlxuXHRcdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVycm9yQ29kZSA9ICdVbmtub3duJztcblx0XHRcdH1cblx0XHRcdGlmICghcmVzb3VyY2VBcGkuZmFsbGJhY2spIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciB3aGlsZSBnZXR0aW5nIHRoZSBsYXRlc3QgdmVyc2lvbiBmb3IgdGhlIGV4dGVuc2lvbiAke2V4dGVuc2lvbkluZm8uaWR9IGZyb20gJHtyZXNvdXJjZUFwaS51cml9LiBUcnlpbmcgdGhlIGZhbGxiYWNrICR7cmVzb3VyY2VBcGkuZmFsbGJhY2t9YCwgZXJyb3JDb2RlKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGZvcm1hdDIocmVzb3VyY2VBcGkuZmFsbGJhY2ssIHsgcHVibGlzaGVyLCBuYW1lIH0pKTtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmdldExhdGVzdFJhd0dhbGxlcnlFeHRlbnNpb24oZXh0ZW5zaW9uSW5mby5pZCwgdXJpLCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGVycm9yQ29kZSA9IGVycm9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uR2FsbGVyeUVycm9yID8gZXJyb3IuY29kZSA6ICdVbmtub3duJztcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGV4dGVuc2lvbjogc3RyaW5nO1xuXHRcdFx0XHRcdGVycm9yQ29kZT86IHN0cmluZztcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdSZXBvcnQgdGhlIGZhbGxiYWNrIHRvIHRoZSB1bnBrZyBzZXJ2aWNlIGZvciBnZXR0aW5nIGxhdGVzdCBleHRlbnNpb24nO1xuXHRcdFx0XHRcdGV4dGVuc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0V4dGVuc2lvbiBpZCcgfTtcblx0XHRcdFx0XHRlcnJvckNvZGU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGVycm9yIGNvZGUgaW4gY2FzZSBvZiBlcnJvcicgfTtcblx0XHRcdFx0fT4oJ2dhbGxlcnlTZXJ2aWNlOmZhbGxiYWNrdG91bnBrZycsIHtcblx0XHRcdFx0XHRleHRlbnNpb246IGV4dGVuc2lvbkluZm8uaWQsXG5cdFx0XHRcdFx0ZXJyb3JDb2RlLFxuXHRcdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldExhdGVzdFJhd0dhbGxlcnlFeHRlbnNpb24oZXh0ZW5zaW9uOiBzdHJpbmcsIHVyaTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElSYXdHYWxsZXJ5RXh0ZW5zaW9uIHwgbnVsbD4ge1xuXHRcdGxldCBjb250ZXh0O1xuXHRcdGxldCBlcnJvckNvZGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBuZXcgU3RvcFdhdGNoKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29tbW9uSGVhZGVycyA9IGF3YWl0IHRoaXMuY29tbW9uSGVhZGVyc1Byb21pc2U7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0ge1xuXHRcdFx0XHQuLi5jb21tb25IZWFkZXJzLFxuXHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb247YXBpLXZlcnNpb249Ny4yLXByZXZpZXcnLFxuXHRcdFx0XHQnQWNjZXB0LUVuY29kaW5nJzogJ2d6aXAnLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHRcdHR5cGU6ICdHRVQnLFxuXHRcdFx0XHR1cmw6IHVyaS50b1N0cmluZyh0cnVlKSxcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0dGltZW91dDogdGhpcy5nZXRSZXF1ZXN0VGltZW91dCgpLFxuXHRcdFx0XHRjYWxsU2l0ZTogJ2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldExhdGVzdFJhd0dhbGxlcnlFeHRlbnNpb24nXG5cdFx0XHR9LCB0b2tlbik7XG5cblx0XHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSA0MDQpIHtcblx0XHRcdFx0ZXJyb3JDb2RlID0gJ05vdEZvdW5kJztcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlICYmIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgIT09IDIwMCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgSFRUUCByZXNwb25zZTogJyArIGNvbnRleHQucmVzLnN0YXR1c0NvZGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhc0pzb248SVJhd0dhbGxlcnlFeHRlbnNpb24+KGNvbnRleHQpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0ZXJyb3JDb2RlID0gJ05vRGF0YSc7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNhdGNoIChlcnJvcikge1xuXHRcdFx0bGV0IGdhbGxlcnlFcnJvckNvZGU6IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGU7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0Z2FsbGVyeUVycm9yQ29kZSA9IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuQ2FuY2VsbGVkO1xuXHRcdFx0fSBlbHNlIGlmIChpc09mZmxpbmVFcnJvcihlcnJvcikpIHtcblx0XHRcdFx0Z2FsbGVyeUVycm9yQ29kZSA9IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuT2ZmbGluZTtcblx0XHRcdH0gZWxzZSBpZiAoZ2V0RXJyb3JNZXNzYWdlKGVycm9yKS5zdGFydHNXaXRoKCdYSFIgdGltZW91dCcpKSB7XG5cdFx0XHRcdGdhbGxlcnlFcnJvckNvZGUgPSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLlRpbWVvdXQ7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRleHQgJiYgaXNDbGllbnRFcnJvcihjb250ZXh0KSkge1xuXHRcdFx0XHRnYWxsZXJ5RXJyb3JDb2RlID0gRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5DbGllbnRFcnJvcjtcblx0XHRcdH0gZWxzZSBpZiAoY29udGV4dCAmJiBpc1NlcnZlckVycm9yKGNvbnRleHQpKSB7XG5cdFx0XHRcdGdhbGxlcnlFcnJvckNvZGUgPSBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlLlNlcnZlckVycm9yO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z2FsbGVyeUVycm9yQ29kZSA9IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuRmFpbGVkO1xuXHRcdFx0fVxuXHRcdFx0ZXJyb3JDb2RlID0gZ2FsbGVyeUVycm9yQ29kZTtcblx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25HYWxsZXJ5RXJyb3IoZXJyb3IsIGdhbGxlcnlFcnJvckNvZGUpO1xuXHRcdH1cblxuXHRcdGZpbmFsbHkge1xuXHRcdFx0dHlwZSBHYWxsZXJ5U2VydmljZUdldExhdGVzdEV2ZW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0XHRjb21tZW50OiAnUmVwb3J0IHRoZSBxdWVyeSB0byB0aGUgTWFya2V0cGxhY2UgZm9yIGZldGNoaW5nIGxhdGVzdCB2ZXJzaW9uIG9mIGFuIGV4dGVuc2lvbic7XG5cdFx0XHRcdGhvc3Q6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaG9zdCBvZiB0aGUgZW5kIHBvaW50JyB9O1xuXHRcdFx0XHRleHRlbnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgZXh0ZW5zaW9uJyB9O1xuXHRcdFx0XHRkdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ0R1cmF0aW9uIGluIG1zIGZvciB0aGUgcXVlcnknIH07XG5cdFx0XHRcdGVycm9yQ29kZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXJyb3IgY29kZSBpbiBjYXNlIG9mIGVycm9yJyB9O1xuXHRcdFx0XHRzdGF0dXNDb2RlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBzdGF0dXMgY29kZSBpbiBjYXNlIG9mIGVycm9yJyB9O1xuXHRcdFx0XHRzZXJ2ZXI/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHNlcnZlciBvZiB0aGUgZW5kIHBvaW50JyB9O1xuXHRcdFx0XHRhY3Rpdml0eUlkPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhY3Rpdml0eSBJRCBvZiB0aGUgcmVxdWVzdCcgfTtcblx0XHRcdFx0ZW5kVG9FbmRJZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZW5kLXRvLWVuZCBJRCBvZiB0aGUgcmVxdWVzdCcgfTtcblx0XHRcdH07XG5cdFx0XHR0eXBlIEdhbGxlcnlTZXJ2aWNlR2V0TGF0ZXN0RXZlbnQgPSB7XG5cdFx0XHRcdGV4dGVuc2lvbjogc3RyaW5nO1xuXHRcdFx0XHRob3N0OiBzdHJpbmc7XG5cdFx0XHRcdGR1cmF0aW9uOiBudW1iZXI7XG5cdFx0XHRcdGVycm9yQ29kZT86IHN0cmluZztcblx0XHRcdFx0c3RhdHVzQ29kZT86IHN0cmluZztcblx0XHRcdFx0c2VydmVyPzogVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdFx0XHRcdGFjdGl2aXR5SWQ/OiBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPjtcblx0XHRcdFx0ZW5kVG9FbmRJZD86IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdhbGxlcnlTZXJ2aWNlR2V0TGF0ZXN0RXZlbnQsIEdhbGxlcnlTZXJ2aWNlR2V0TGF0ZXN0RXZlbnRDbGFzc2lmaWNhdGlvbj4oJ2dhbGxlcnlTZXJ2aWNlOmdldExhdGVzdCcsIHtcblx0XHRcdFx0ZXh0ZW5zaW9uLFxuXHRcdFx0XHRob3N0OiB1cmkuYXV0aG9yaXR5LFxuXHRcdFx0XHRkdXJhdGlvbjogc3RvcFdhdGNoLmVsYXBzZWQoKSxcblx0XHRcdFx0ZXJyb3JDb2RlLFxuXHRcdFx0XHRzdGF0dXNDb2RlOiBjb250ZXh0Py5yZXMuc3RhdHVzQ29kZSAmJiBjb250ZXh0Py5yZXMuc3RhdHVzQ29kZSAhPT0gMjAwID8gYCR7Y29udGV4dC5yZXMuc3RhdHVzQ29kZX1gIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZXJ2ZXI6IHRoaXMuZ2V0SGVhZGVyVmFsdWUoY29udGV4dD8ucmVzLmhlYWRlcnMsIFNFUlZFUl9IRUFERVJfTkFNRSksXG5cdFx0XHRcdGFjdGl2aXR5SWQ6IHRoaXMuZ2V0SGVhZGVyVmFsdWUoY29udGV4dD8ucmVzLmhlYWRlcnMsIEFDVElWSVRZX0hFQURFUl9OQU1FKSxcblx0XHRcdFx0ZW5kVG9FbmRJZDogdGhpcy5nZXRIZWFkZXJWYWx1ZShjb250ZXh0Py5yZXMuaGVhZGVycywgRU5EX0VORF9JRF9IRUFERVJfTkFNRSksXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXBvcnRTdGF0aXN0aWMocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nLCB0eXBlOiBTdGF0aXN0aWNUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UjcmVwb3J0U3RhdGlzdGljOiBTa2lwcGVkIGluIHdlYicpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKTtcblx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlID0gZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkobWFuaWZlc3QsIEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uU3RhdGlzdGljc1VyaSk7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1cmwgPSBmb3JtYXQyKHJlc291cmNlLCB7IHB1Ymxpc2hlciwgbmFtZSwgdmVyc2lvbiwgc3RhdFR5cGVOYW1lOiB0eXBlIH0pO1xuXG5cdFx0Y29uc3QgQWNjZXB0ID0gJyovKjthcGktdmVyc2lvbj00LjAtcHJldmlldy4xJztcblx0XHRjb25zdCBjb21tb25IZWFkZXJzID0gYXdhaXQgdGhpcy5jb21tb25IZWFkZXJzUHJvbWlzZTtcblx0XHRjb25zdCBoZWFkZXJzID0geyAuLi5jb21tb25IZWFkZXJzLCBBY2NlcHQgfTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHtcblx0XHRcdFx0dHlwZTogJ1BPU1QnLFxuXHRcdFx0XHR1cmwsXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdGNhbGxTaXRlOiAnZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UucmVwb3J0U3RhdGlzdGljJ1xuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHsgLyogSWdub3JlICovIH1cblx0fVxuXG5cdGFzeW5jIGRvd25sb2FkKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGxvY2F0aW9uOiBVUkksIG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UjZG93bmxvYWQnLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0Y29uc3QgZGF0YSA9IGdldEdhbGxlcnlFeHRlbnNpb25UZWxlbWV0cnlEYXRhKGV4dGVuc2lvbik7XG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cblx0XHRjb25zdCBvcGVyYXRpb25QYXJhbSA9IG9wZXJhdGlvbiA9PT0gSW5zdGFsbE9wZXJhdGlvbi5JbnN0YWxsID8gJ2luc3RhbGwnIDogb3BlcmF0aW9uID09PSBJbnN0YWxsT3BlcmF0aW9uLlVwZGF0ZSA/ICd1cGRhdGUnIDogJyc7XG5cdFx0Y29uc3QgZG93bmxvYWRBc3NldCA9IG9wZXJhdGlvblBhcmFtID8ge1xuXHRcdFx0dXJpOiBgJHtleHRlbnNpb24uYXNzZXRzLmRvd25sb2FkLnVyaX0ke1VSSS5wYXJzZShleHRlbnNpb24uYXNzZXRzLmRvd25sb2FkLnVyaSkucXVlcnkgPyAnJicgOiAnPyd9JHtvcGVyYXRpb25QYXJhbX09dHJ1ZWAsXG5cdFx0XHRmYWxsYmFja1VyaTogYCR7ZXh0ZW5zaW9uLmFzc2V0cy5kb3dubG9hZC5mYWxsYmFja1VyaX0ke1VSSS5wYXJzZShleHRlbnNpb24uYXNzZXRzLmRvd25sb2FkLmZhbGxiYWNrVXJpKS5xdWVyeSA/ICcmJyA6ICc/J30ke29wZXJhdGlvblBhcmFtfT10cnVlYFxuXHRcdH0gOiBleHRlbnNpb24uYXNzZXRzLmRvd25sb2FkO1xuXG5cdFx0Y29uc3QgYWN0aXZpdHlJZCA9IGV4dGVuc2lvbi5xdWVyeUNvbnRleHQ/LltTRUFSQ0hfQUNUSVZJVFlfSEVBREVSX05BTUVdO1xuXHRcdGNvbnN0IGhlYWRlcnM6IElIZWFkZXJzIHwgdW5kZWZpbmVkID0gYWN0aXZpdHlJZCAmJiB0eXBlb2YgYWN0aXZpdHlJZCA9PT0gJ3N0cmluZycgPyB7IFtTRUFSQ0hfQUNUSVZJVFlfSEVBREVSX05BTUVdOiBhY3Rpdml0eUlkIH0gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuZ2V0QXNzZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGRvd25sb2FkQXNzZXQsIEFzc2V0VHlwZS5WU0lYLCBleHRlbnNpb24udmVyc2lvbiwgJ2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmRvd25sb2FkJywgaGVhZGVycyA/IHsgaGVhZGVycyB9IDogdW5kZWZpbmVkKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShsb2NhdGlvbiwgY29udGV4dC5zdHJlYW0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChsb2NhdGlvbik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8qIGlnbm9yZSAqL1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3Igd2hpbGUgZGVsZXRpbmcgdGhlIGZpbGUgJHtsb2NhdGlvbi50b1N0cmluZygpfWAsIGdldEVycm9yTWVzc2FnZShlKSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXh0ZW5zaW9uR2FsbGVyeUVycm9yKGdldEVycm9yTWVzc2FnZShlcnJvciksIEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuRG93bmxvYWRGYWlsZWRXcml0aW5nKTtcblx0XHR9XG5cblx0XHQvKiBfX0dEUFJfX1xuXHRcdFx0XCJnYWxsZXJ5U2VydmljZTpkb3dubG9hZFZTSVhcIiA6IHtcblx0XHRcdFx0XCJvd25lclwiOiBcInNhbmR5MDgxXCIsXG5cdFx0XHRcdFwiZHVyYXRpb25cIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcdFx0XCIke2luY2x1ZGV9XCI6IFtcblx0XHRcdFx0XHRcIiR7R2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGF9XCJcblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdCovXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZygnZ2FsbGVyeVNlcnZpY2U6ZG93bmxvYWRWU0lYJywgeyAuLi5kYXRhLCBkdXJhdGlvbjogbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBzdGFydFRpbWUgfSk7XG5cdH1cblxuXHRhc3luYyBkb3dubG9hZFNpZ25hdHVyZUFyY2hpdmUoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgbG9jYXRpb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZXh0ZW5zaW9uLmFzc2V0cy5zaWduYXR1cmUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2lnbmF0dXJlIGFzc2V0IGZvdW5kJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRlbnNpb25HYWxsZXJ5U2VydmljZSNkb3dubG9hZFNpZ25hdHVyZUFyY2hpdmUnLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5nZXRBc3NldChleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLmFzc2V0cy5zaWduYXR1cmUsIEFzc2V0VHlwZS5TaWduYXR1cmUsIGV4dGVuc2lvbi52ZXJzaW9uLCAnZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2Uuc2lnbmF0dXJlJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGxvY2F0aW9uLCBjb250ZXh0LnN0cmVhbSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGxvY2F0aW9uKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0LyogaWdub3JlICovXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBFcnJvciB3aGlsZSBkZWxldGluZyB0aGUgZmlsZSAke2xvY2F0aW9uLnRvU3RyaW5nKCl9YCwgZ2V0RXJyb3JNZXNzYWdlKGUpKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFeHRlbnNpb25HYWxsZXJ5RXJyb3IoZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSwgRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZS5Eb3dubG9hZEZhaWxlZFdyaXRpbmcpO1xuXHRcdH1cblxuXHR9XG5cblx0YXN5bmMgZ2V0UmVhZG1lKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKGV4dGVuc2lvbi5hc3NldHMucmVhZG1lKSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5nZXRBc3NldChleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLmFzc2V0cy5yZWFkbWUsIEFzc2V0VHlwZS5EZXRhaWxzLCBleHRlbnNpb24udmVyc2lvbiwgJ2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLnJlYWRtZScsIHt9LCB0b2tlbik7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgYXNUZXh0T3JFcnJvcihjb250ZXh0KTtcblx0XHRcdHJldHVybiBjb250ZW50IHx8ICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRhc3luYyBnZXRNYW5pZmVzdChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElFeHRlbnNpb25NYW5pZmVzdCB8IG51bGw+IHtcblx0XHRpZiAoZXh0ZW5zaW9uLmFzc2V0cy5tYW5pZmVzdCkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuZ2V0QXNzZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi5hc3NldHMubWFuaWZlc3QsIEFzc2V0VHlwZS5NYW5pZmVzdCwgZXh0ZW5zaW9uLnZlcnNpb24sICdleHRlbnNpb25HYWxsZXJ5U2VydmljZS5tYW5pZmVzdCcsIHt9LCB0b2tlbik7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgYXNUZXh0T3JFcnJvcihjb250ZXh0KTtcblx0XHRcdHJldHVybiB0ZXh0ID8gSlNPTi5wYXJzZSh0ZXh0KSA6IG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29yZVRyYW5zbGF0aW9uKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGxhbmd1YWdlSWQ6IHN0cmluZyk6IFByb21pc2U8SVRyYW5zbGF0aW9uIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGFzc2V0ID0gZXh0ZW5zaW9uLmFzc2V0cy5jb3JlVHJhbnNsYXRpb25zLmZpbHRlcih0ID0+IHRbMF0gPT09IGxhbmd1YWdlSWQudG9VcHBlckNhc2UoKSlbMF07XG5cdFx0aWYgKGFzc2V0KSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5nZXRBc3NldChleHRlbnNpb24uaWRlbnRpZmllci5pZCwgYXNzZXRbMV0sIGFzc2V0WzBdLCBleHRlbnNpb24udmVyc2lvbiwgJ2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmNvcmVUcmFuc2xhdGlvbicpO1xuXHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0XHRyZXR1cm4gdGV4dCA/IEpTT04ucGFyc2UodGV4dCkgOiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFzeW5jIGdldENoYW5nZWxvZyhleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmIChleHRlbnNpb24uYXNzZXRzLmNoYW5nZWxvZykge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuZ2V0QXNzZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi5hc3NldHMuY2hhbmdlbG9nLCBBc3NldFR5cGUuQ2hhbmdlbG9nLCBleHRlbnNpb24udmVyc2lvbiwgJ2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmNoYW5nZWxvZycsIHt9LCB0b2tlbik7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgYXNUZXh0T3JFcnJvcihjb250ZXh0KTtcblx0XHRcdHJldHVybiBjb250ZW50IHx8ICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRhc3luYyBnZXRBbGxWZXJzaW9ucyhleHRlbnNpb25JZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRWZXJzaW9ucyhleHRlbnNpb25JZGVudGlmaWVyKTtcblx0fVxuXG5cdGFzeW5jIGdldEFsbENvbXBhdGlibGVWZXJzaW9ucyhleHRlbnNpb25JZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllciwgaW5jbHVkZVByZVJlbGVhc2U6IGJvb2xlYW4sIHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybSk6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb25WZXJzaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRWZXJzaW9ucyhleHRlbnNpb25JZGVudGlmaWVyLCB7IHZlcnNpb246IGluY2x1ZGVQcmVSZWxlYXNlID8gVmVyc2lvbktpbmQuTGF0ZXN0IDogVmVyc2lvbktpbmQuUmVsZWFzZSwgdGFyZ2V0UGxhdGZvcm0gfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFZlcnNpb25zKGV4dGVuc2lvbklkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyLCBvbmx5Q29tcGF0aWJsZT86IHsgdmVyc2lvbjogVmVyc2lvbktpbmQ7IHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybSB9KTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvblZlcnNpb25bXT4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKTtcblx0XHRpZiAoIWV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBleHRlbnNpb24gZ2FsbGVyeSBzZXJ2aWNlIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0bGV0IHF1ZXJ5ID0gbmV3IFF1ZXJ5KClcblx0XHRcdC53aXRoRmxhZ3MoRmxhZy5JbmNsdWRlVmVyc2lvbnMsIEZsYWcuSW5jbHVkZUNhdGVnb3J5QW5kVGFncywgRmxhZy5JbmNsdWRlRmlsZXMsIEZsYWcuSW5jbHVkZVZlcnNpb25Qcm9wZXJ0aWVzKVxuXHRcdFx0LndpdGhQYWdlKDEsIDEpO1xuXG5cdFx0aWYgKGV4dGVuc2lvbklkZW50aWZpZXIudXVpZCkge1xuXHRcdFx0cXVlcnkgPSBxdWVyeS53aXRoRmlsdGVyKEZpbHRlclR5cGUuRXh0ZW5zaW9uSWQsIGV4dGVuc2lvbklkZW50aWZpZXIudXVpZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHF1ZXJ5ID0gcXVlcnkud2l0aEZpbHRlcihGaWx0ZXJUeXBlLkV4dGVuc2lvbk5hbWUsIGV4dGVuc2lvbklkZW50aWZpZXIuaWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZ2FsbGVyeUV4dGVuc2lvbnMgfSA9IGF3YWl0IHRoaXMucXVlcnlSYXdHYWxsZXJ5RXh0ZW5zaW9ucyhxdWVyeSwgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIWdhbGxlcnlFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IGdldEFsbFRhcmdldFBsYXRmb3JtcyhnYWxsZXJ5RXh0ZW5zaW9uc1swXSk7XG5cdFx0aWYgKG9ubHlDb21wYXRpYmxlICYmIGlzTm90V2ViRXh0ZW5zaW9uSW5XZWJUYXJnZXRQbGF0Zm9ybShhbGxUYXJnZXRQbGF0Zm9ybXMsIG9ubHlDb21wYXRpYmxlLnRhcmdldFBsYXRmb3JtKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZlcnNpb25zOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHByb2R1Y3RWZXJzaW9uID0geyB2ZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIGRhdGU6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSB9O1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKGdhbGxlcnlFeHRlbnNpb25zWzBdLnZlcnNpb25zLm1hcChhc3luYyAodmVyc2lvbikgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdChhd2FpdCB0aGlzLmlzVmFsaWRWZXJzaW9uKFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRpZDogZXh0ZW5zaW9uSWRlbnRpZmllci5pZCxcblx0XHRcdFx0XHRcdFx0dmVyc2lvbjogdmVyc2lvbi52ZXJzaW9uLFxuXHRcdFx0XHRcdFx0XHRpc1ByZVJlbGVhc2VWZXJzaW9uOiBpc1ByZVJlbGVhc2VWZXJzaW9uKHZlcnNpb24pLFxuXHRcdFx0XHRcdFx0XHR0YXJnZXRQbGF0Zm9ybTogZ2V0VGFyZ2V0UGxhdGZvcm1Gb3JFeHRlbnNpb25WZXJzaW9uKHZlcnNpb24pLFxuXHRcdFx0XHRcdFx0XHRlbmdpbmU6IGdldEVuZ2luZSh2ZXJzaW9uKSxcblx0XHRcdFx0XHRcdFx0bWFuaWZlc3RBc3NldDogZ2V0VmVyc2lvbkFzc2V0KHZlcnNpb24sIEFzc2V0VHlwZS5NYW5pZmVzdCksXG5cdFx0XHRcdFx0XHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IGdldEVuYWJsZWRBcGlQcm9wb3NhbHModmVyc2lvbilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGNvbXBhdGlibGU6ICEhb25seUNvbXBhdGlibGUsXG5cdFx0XHRcdFx0XHRcdHByb2R1Y3RWZXJzaW9uLFxuXHRcdFx0XHRcdFx0XHR0YXJnZXRQbGF0Zm9ybTogb25seUNvbXBhdGlibGU/LnRhcmdldFBsYXRmb3JtLFxuXHRcdFx0XHRcdFx0XHR2ZXJzaW9uOiBvbmx5Q29tcGF0aWJsZT8udmVyc2lvbiA/PyB2ZXJzaW9uLnZlcnNpb25cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9uc1swXS5wdWJsaXNoZXIuZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRhbGxUYXJnZXRQbGF0Zm9ybXMpKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHR2ZXJzaW9ucy5wdXNoKHZlcnNpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikgeyAvKiBJZ25vcmUgZXJyb3IgYW5kIHNraXAgdmVyc2lvbiAqLyB9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJR2FsbGVyeUV4dGVuc2lvblZlcnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGZvciAoY29uc3QgdmVyc2lvbiBvZiBzb3J0RXh0ZW5zaW9uVmVyc2lvbnModmVyc2lvbnMsIG9ubHlDb21wYXRpYmxlPy50YXJnZXRQbGF0Zm9ybSA/PyBDVVJSRU5UX1RBUkdFVF9QTEFURk9STSkpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gc2Vlbi5nZXQodmVyc2lvbi52ZXJzaW9uKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gaW5kZXggIT09IHVuZGVmaW5lZCA/IHJlc3VsdFtpbmRleF0gOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IGdldFRhcmdldFBsYXRmb3JtRm9yRXh0ZW5zaW9uVmVyc2lvbih2ZXJzaW9uKTtcblx0XHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdFx0c2Vlbi5zZXQodmVyc2lvbi52ZXJzaW9uLCByZXN1bHQubGVuZ3RoKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyB2ZXJzaW9uOiB2ZXJzaW9uLnZlcnNpb24sIGRhdGU6IHZlcnNpb24ubGFzdFVwZGF0ZWQsIGlzUHJlUmVsZWFzZVZlcnNpb246IGlzUHJlUmVsZWFzZVZlcnNpb24odmVyc2lvbiksIHRhcmdldFBsYXRmb3JtczogW3RhcmdldFBsYXRmb3JtXSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV4aXN0aW5nLnRhcmdldFBsYXRmb3Jtcy5wdXNoKHRhcmdldFBsYXRmb3JtKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRBc3NldChleHRlbnNpb246IHN0cmluZywgYXNzZXQ6IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXQsIGFzc2V0VHlwZTogc3RyaW5nLCBleHRlbnNpb25WZXJzaW9uOiBzdHJpbmcsIGNhbGxTaXRlOiBzdHJpbmcsIG9wdGlvbnM6IE9taXQ8SVJlcXVlc3RPcHRpb25zLCAnY2FsbFNpdGUnPiA9IHt9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0XHRjb25zdCBjb21tb25IZWFkZXJzID0gYXdhaXQgdGhpcy5jb21tb25IZWFkZXJzUHJvbWlzZTtcblx0XHRjb25zdCBiYXNlT3B0aW9ucyA9IHsgdHlwZTogJ0dFVCcgfTtcblx0XHRjb25zdCBoZWFkZXJzID0geyAuLi5jb21tb25IZWFkZXJzLCAuLi4ob3B0aW9ucy5oZWFkZXJzIHx8IHt9KSB9O1xuXHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIC4uLmJhc2VPcHRpb25zLCBoZWFkZXJzIH07XG5cblx0XHRjb25zdCB1cmwgPSBhc3NldC51cmk7XG5cdFx0Y29uc3QgZmFsbGJhY2tVcmwgPSBhc3NldC5mYWxsYmFja1VyaTtcblx0XHRjb25zdCBmaXJzdE9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIHVybCwgdGltZW91dDogdGhpcy5nZXRSZXF1ZXN0VGltZW91dCgpLCBjYWxsU2l0ZSB9O1xuXG5cdFx0bGV0IGNvbnRleHQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoZmlyc3RPcHRpb25zLCB0b2tlbik7XG5cdFx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gMjAwKSB7XG5cdFx0XHRcdHJldHVybiBjb250ZXh0O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIDIwMCwgZ290IGJhY2sgJHtjb250ZXh0LnJlcy5zdGF0dXNDb2RlfSBpbnN0ZWFkLlxcblxcbiR7bWVzc2FnZX1gKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZ2V0RXJyb3JNZXNzYWdlKGVycik7XG5cdFx0XHR0eXBlIEdhbGxlcnlTZXJ2aWNlQ0RORmFsbGJhY2tDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdGYWxsYmFjayByZXF1ZXN0IGluZm9ybWF0aW9uIHdoZW4gdGhlIHByaW1hcnkgYXNzZXQgcmVxdWVzdCB0byBDRE4gZmFpbHMnO1xuXHRcdFx0XHRleHRlbnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdleHRlbnNpb24gbmFtZScgfTtcblx0XHRcdFx0YXNzZXRUeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnYXNzZXQgdGhhdCBmYWlsZWQnIH07XG5cdFx0XHRcdG1lc3NhZ2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdlcnJvciBtZXNzYWdlJyB9O1xuXHRcdFx0XHRleHRlbnNpb25WZXJzaW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAndmVyc2lvbicgfTtcblx0XHRcdFx0cmVhZG9ubHkgc2VydmVyPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ3NlcnZlciB0aGF0IGhhbmRsZWQgdGhlIHF1ZXJ5JyB9O1xuXHRcdFx0XHRyZWFkb25seSBlbmRUb0VuZElkPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ2VuZCB0byBlbmQgb3BlcmF0aW9uIGlkJyB9O1xuXHRcdFx0XHRyZWFkb25seSBhY3Rpdml0eUlkPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ2FjdGl2aXR5IGlkJyB9O1xuXHRcdFx0fTtcblx0XHRcdHR5cGUgR2FsbGVyeVNlcnZpY2VDRE5GYWxsYmFja0V2ZW50ID0ge1xuXHRcdFx0XHRleHRlbnNpb246IHN0cmluZztcblx0XHRcdFx0YXNzZXRUeXBlOiBzdHJpbmc7XG5cdFx0XHRcdG1lc3NhZ2U6IHN0cmluZztcblx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogc3RyaW5nO1xuXHRcdFx0XHRzZXJ2ZXI/OiBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPjtcblx0XHRcdFx0ZW5kVG9FbmRJZD86IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRcdFx0XHRhY3Rpdml0eUlkPzogVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2FsbGVyeVNlcnZpY2VDRE5GYWxsYmFja0V2ZW50LCBHYWxsZXJ5U2VydmljZUNETkZhbGxiYWNrQ2xhc3NpZmljYXRpb24+KCdnYWxsZXJ5U2VydmljZTpjZG5GYWxsYmFjaycsIHtcblx0XHRcdFx0ZXh0ZW5zaW9uLFxuXHRcdFx0XHRhc3NldFR5cGUsXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdGV4dGVuc2lvblZlcnNpb24sXG5cdFx0XHRcdHNlcnZlcjogdGhpcy5nZXRIZWFkZXJWYWx1ZShjb250ZXh0Py5yZXMuaGVhZGVycywgU0VSVkVSX0hFQURFUl9OQU1FKSxcblx0XHRcdFx0YWN0aXZpdHlJZDogdGhpcy5nZXRIZWFkZXJWYWx1ZShjb250ZXh0Py5yZXMuaGVhZGVycywgQUNUSVZJVFlfSEVBREVSX05BTUUpLFxuXHRcdFx0XHRlbmRUb0VuZElkOiB0aGlzLmdldEhlYWRlclZhbHVlKGNvbnRleHQ/LnJlcy5oZWFkZXJzLCBFTkRfRU5EX0lEX0hFQURFUl9OQU1FKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBmYWxsYmFja09wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIHVybDogZmFsbGJhY2tVcmwsIHRpbWVvdXQ6IHRoaXMuZ2V0UmVxdWVzdFRpbWVvdXQoKSwgY2FsbFNpdGU6IGAke2NhbGxTaXRlfS5mYWxsYmFja2AgfTtcblx0XHRcdHJldHVybiB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoZmFsbGJhY2tPcHRpb25zLCB0b2tlbik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpOiBQcm9taXNlPElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0PiB7XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCk7XG5cdFx0aWYgKCFtYW5pZmVzdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBleHRlbnNpb24gZ2FsbGVyeSBzZXJ2aWNlIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uc0NvbnRyb2xVcmwpIHtcblx0XHRcdHJldHVybiB7IG1hbGljaW91czogW10sIGRlcHJlY2F0ZWQ6IHt9LCBzZWFyY2g6IFtdLCBhdXRvVXBkYXRlOiB7fSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0dHlwZTogJ0dFVCcsXG5cdFx0XHR1cmw6IHRoaXMuZXh0ZW5zaW9uc0NvbnRyb2xVcmwsXG5cdFx0XHR0aW1lb3V0OiB0aGlzLmdldFJlcXVlc3RUaW1lb3V0KCksXG5cdFx0XHRjYWxsU2l0ZTogJ2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QnXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSAhPT0gMjAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBnZXQgZXh0ZW5zaW9ucyByZXBvcnQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXNKc29uPElSYXdFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0Pihjb250ZXh0KTtcblx0XHRjb25zdCBtYWxpY2lvdXM6IEFycmF5PE1hbGljaW91c0V4dGVuc2lvbkluZm8+ID0gW107XG5cdFx0Y29uc3QgZGVwcmVjYXRlZDogSVN0cmluZ0RpY3Rpb25hcnk8SURlcHJlY2F0aW9uSW5mbz4gPSB7fTtcblx0XHRjb25zdCBzZWFyY2g6IElTZWFyY2hQcmVmZmVyZWRSZXN1bHRzW10gPSBbXTtcblx0XHRjb25zdCBhdXRvVXBkYXRlOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+ID0gcmVzdWx0Py5hdXRvVXBkYXRlID8/IHt9O1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgcmVzdWx0Lm1hbGljaW91cykge1xuXHRcdFx0XHRpZiAoIWlzU3RyaW5nKGlkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHB1Ymxpc2hlck9yRXh0ZW5zaW9uID0gRVhURU5TSU9OX0lERU5USUZJRVJfUkVHRVgudGVzdChpZCkgPyB7IGlkIH0gOiBpZDtcblx0XHRcdFx0bWFsaWNpb3VzLnB1c2goeyBleHRlbnNpb25PclB1Ymxpc2hlcjogcHVibGlzaGVyT3JFeHRlbnNpb24sIGxlYXJuTW9yZUxpbms6IHJlc3VsdC5sZWFybk1vcmVMaW5rcz8uW2lkXSB9KTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQubWlncmF0ZVRvUHJlUmVsZWFzZSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFt1bnN1cHBvcnRlZFByZVJlbGVhc2VFeHRlbnNpb25JZCwgcHJlUmVsZWFzZUV4dGVuc2lvbkluZm9dIG9mIE9iamVjdC5lbnRyaWVzKHJlc3VsdC5taWdyYXRlVG9QcmVSZWxlYXNlKSkge1xuXHRcdFx0XHRcdGlmICghcHJlUmVsZWFzZUV4dGVuc2lvbkluZm8uZW5naW5lIHx8IGlzRW5naW5lVmFsaWQocHJlUmVsZWFzZUV4dGVuc2lvbkluZm8uZW5naW5lLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSkpIHtcblx0XHRcdFx0XHRcdGRlcHJlY2F0ZWRbdW5zdXBwb3J0ZWRQcmVSZWxlYXNlRXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKV0gPSB7XG5cdFx0XHRcdFx0XHRcdGRpc2FsbG93SW5zdGFsbDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IHByZVJlbGVhc2VFeHRlbnNpb25JbmZvLmlkLFxuXHRcdFx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBwcmVSZWxlYXNlRXh0ZW5zaW9uSW5mby5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdFx0XHRhdXRvTWlncmF0ZTogeyBzdG9yYWdlOiAhIXByZVJlbGVhc2VFeHRlbnNpb25JbmZvLm1pZ3JhdGVTdG9yYWdlIH0sXG5cdFx0XHRcdFx0XHRcdFx0cHJlUmVsZWFzZTogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdC5kZXByZWNhdGVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgW2RlcHJlY2F0ZWRFeHRlbnNpb25JZCwgZGVwcmVjYXRpb25JbmZvXSBvZiBPYmplY3QuZW50cmllcyhyZXN1bHQuZGVwcmVjYXRlZCkpIHtcblx0XHRcdFx0XHRpZiAoZGVwcmVjYXRpb25JbmZvKSB7XG5cdFx0XHRcdFx0XHRkZXByZWNhdGVkW2RlcHJlY2F0ZWRFeHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpXSA9IGlzQm9vbGVhbihkZXByZWNhdGlvbkluZm8pID8ge30gOiBkZXByZWNhdGlvbkluZm87XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0LnNlYXJjaCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgcmVzdWx0LnNlYXJjaCkge1xuXHRcdFx0XHRcdHNlYXJjaC5wdXNoKHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudCkge1xuXHRcdFx0ZGVwcmVjYXRlZFt0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQuZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKV0gPSB7XG5cdFx0XHRcdGRpc2FsbG93SW5zdGFsbDogdHJ1ZSxcblx0XHRcdFx0ZXh0ZW5zaW9uOiB7XG5cdFx0XHRcdFx0aWQ6IHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudC5jaGF0RXh0ZW5zaW9uSWQsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdHaXRIdWIgQ29waWxvdCBDaGF0Jyxcblx0XHRcdFx0XHRhdXRvTWlncmF0ZTogeyBzdG9yYWdlOiBmYWxzZSwgZG9ub3REaXNhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0cHJlUmVsZWFzZTogdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5ICE9PSAnc3RhYmxlJ1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IG1hbGljaW91cywgZGVwcmVjYXRlZCwgc2VhcmNoLCBhdXRvVXBkYXRlIH07XG5cdH1cblxuXHRwcml2YXRlIGdldFJlcXVlc3RUaW1lb3V0KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgY29uZmlndXJlZFRpbWVvdXQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oRXh0ZW5zaW9uUmVxdWVzdHNUaW1lb3V0Q29uZmlnS2V5KTtcblx0XHRyZXR1cm4gaXNOdW1iZXIoY29uZmlndXJlZFRpbWVvdXQpICYmIGNvbmZpZ3VyZWRUaW1lb3V0ID49IDAgPyBjb25maWd1cmVkVGltZW91dCA6IDYwXzAwMDtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBleHRlbmRzIEFic3RyYWN0RXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlOiBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoc3RvcmFnZVNlcnZpY2UsIHJlcXVlc3RTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZSwgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlV2l0aE5vU3RvcmFnZVNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdEV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlOiBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCByZXF1ZXN0U2VydmljZSwgbG9nU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBmaWxlU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFlBQVksWUFBWTtBQUV4QixTQUFTLG1CQUFtQixpQkFBaUIsMkJBQTJCO0FBRXhFLFNBQVMsT0FBTyxnQkFBZ0I7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVyxVQUFVLGdCQUFnQjtBQUM5QyxTQUFTLFdBQVc7QUFDcEIsU0FBcUQsc0JBQXNCO0FBQzNFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQWlMLGtCQUE2RCxzQ0FBc0MsNEJBQTBDLFdBQTBCLGtCQUFrQixtQkFBc0YsdUJBQXVCLDJCQUE0QywyQkFBMkIsNEJBQTRCLFFBQVEsWUFBb0MseUNBQXlD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QkFDQSxnQkFDSixZQUNRLG9CQUNGLGtCQUNMLGFBQ0csZ0JBQ00sc0JBQ0ksMEJBQ08saUNBQ2pDO0FBQ0QsVUFBTSxnQkFBZ0IsZ0JBQWdCLFlBQVksb0JBQW9CLGtCQUFrQixhQUFhLGdCQUFnQixzQkFBc0IsMEJBQTBCLCtCQUErQjtBQUFBLEVBQ3JNO0FBQ0Q7QUFoQmEsMEJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTtBQWtCTixJQUFNLDhDQUFOLGNBQTBELGdDQUFnQztBQUFBLEVBRWhHLFlBQ2tCLGdCQUNKLFlBQ1Esb0JBQ0Ysa0JBQ0wsYUFDRyxnQkFDTSxzQkFDSSwwQkFDTyxpQ0FDakM7QUFDRCxVQUFNLFFBQVcsZ0JBQWdCLFlBQVksb0JBQW9CLGtCQUFrQixhQUFhLGdCQUFnQixzQkFBc0IsMEJBQTBCLCtCQUErQjtBQUFBLEVBQ2hNO0FBQ0Q7QUFmYSw4Q0FBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBWFU7IiwKICAibmFtZXMiOiBbIlZlcnNpb25LaW5kIiwgImNyaXRlcml1bSIsICJyZXN1bHQiLCAicXVlcnkiLCAidG9rZW4iLCAiZXh0ZW5zaW9ucyIsICJ0b3RhbCJdCn0K
