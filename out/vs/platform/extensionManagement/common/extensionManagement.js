import { Platform } from "../../../base/common/platform.js";
import { PolicyCategory } from "../../../base/common/policy.js";
import { localize, localize2 } from "../../../nls.js";
import { ConfigurationScope, Extensions } from "../../configuration/common/configurationRegistry.js";
import { TargetPlatform } from "../../extensions/common/extensions.js";
import { FileOperationResult } from "../../files/common/files.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { Registry } from "../../registry/common/platform.js";
const EXTENSION_IDENTIFIER_PATTERN = "^([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$";
const EXTENSION_IDENTIFIER_REGEX = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
const WEB_EXTENSION_TAG = "__web_extension";
const LANGUAGE_MODEL_CHAT_PROVIDER_EXTENSION_TAG = "language-models";
const EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT = "skipWalkthrough";
const EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT = "skipPublisherTrust";
const EXTENSION_INSTALL_SOURCE_CONTEXT = "extensionInstallSource";
const EXTENSION_INSTALL_DEP_PACK_CONTEXT = "dependecyOrPackExtensionInstall";
const EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT = "clientTargetPlatform";
var ExtensionInstallSource = /* @__PURE__ */ ((ExtensionInstallSource2) => {
  ExtensionInstallSource2["COMMAND"] = "command";
  ExtensionInstallSource2["SETTINGS_SYNC"] = "settingsSync";
  return ExtensionInstallSource2;
})(ExtensionInstallSource || {});
function TargetPlatformToString(targetPlatform) {
  switch (targetPlatform) {
    case TargetPlatform.WIN32_X64:
      return "Windows 64 bit";
    case TargetPlatform.WIN32_ARM64:
      return "Windows ARM";
    case TargetPlatform.LINUX_X64:
      return "Linux 64 bit";
    case TargetPlatform.LINUX_ARM64:
      return "Linux ARM 64";
    case TargetPlatform.LINUX_ARMHF:
      return "Linux ARM";
    case TargetPlatform.ALPINE_X64:
      return "Alpine Linux 64 bit";
    case TargetPlatform.ALPINE_ARM64:
      return "Alpine ARM 64";
    case TargetPlatform.DARWIN_X64:
      return "Mac";
    case TargetPlatform.DARWIN_ARM64:
      return "Mac Silicon";
    case TargetPlatform.WEB:
      return "Web";
    case TargetPlatform.UNIVERSAL:
      return TargetPlatform.UNIVERSAL;
    case TargetPlatform.UNKNOWN:
      return TargetPlatform.UNKNOWN;
    case TargetPlatform.UNDEFINED:
      return TargetPlatform.UNDEFINED;
  }
}
function toTargetPlatform(targetPlatform) {
  switch (targetPlatform) {
    case TargetPlatform.WIN32_X64:
      return TargetPlatform.WIN32_X64;
    case TargetPlatform.WIN32_ARM64:
      return TargetPlatform.WIN32_ARM64;
    case TargetPlatform.LINUX_X64:
      return TargetPlatform.LINUX_X64;
    case TargetPlatform.LINUX_ARM64:
      return TargetPlatform.LINUX_ARM64;
    case TargetPlatform.LINUX_ARMHF:
      return TargetPlatform.LINUX_ARMHF;
    case TargetPlatform.ALPINE_X64:
      return TargetPlatform.ALPINE_X64;
    case TargetPlatform.ALPINE_ARM64:
      return TargetPlatform.ALPINE_ARM64;
    case TargetPlatform.DARWIN_X64:
      return TargetPlatform.DARWIN_X64;
    case TargetPlatform.DARWIN_ARM64:
      return TargetPlatform.DARWIN_ARM64;
    case TargetPlatform.WEB:
      return TargetPlatform.WEB;
    case TargetPlatform.UNIVERSAL:
      return TargetPlatform.UNIVERSAL;
    default:
      return TargetPlatform.UNKNOWN;
  }
}
function getTargetPlatform(platform, arch) {
  switch (platform) {
    case Platform.Windows:
      if (arch === "x64") {
        return TargetPlatform.WIN32_X64;
      }
      if (arch === "arm64") {
        return TargetPlatform.WIN32_ARM64;
      }
      return TargetPlatform.UNKNOWN;
    case Platform.Linux:
      if (arch === "x64") {
        return TargetPlatform.LINUX_X64;
      }
      if (arch === "arm64") {
        return TargetPlatform.LINUX_ARM64;
      }
      if (arch === "arm") {
        return TargetPlatform.LINUX_ARMHF;
      }
      return TargetPlatform.UNKNOWN;
    case "alpine":
      if (arch === "x64") {
        return TargetPlatform.ALPINE_X64;
      }
      if (arch === "arm64") {
        return TargetPlatform.ALPINE_ARM64;
      }
      return TargetPlatform.UNKNOWN;
    case Platform.Mac:
      if (arch === "x64") {
        return TargetPlatform.DARWIN_X64;
      }
      if (arch === "arm64") {
        return TargetPlatform.DARWIN_ARM64;
      }
      return TargetPlatform.UNKNOWN;
    case Platform.Web:
      return TargetPlatform.WEB;
  }
}
function isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, productTargetPlatform) {
  return productTargetPlatform === TargetPlatform.WEB && !allTargetPlatforms.includes(TargetPlatform.WEB);
}
function isTargetPlatformCompatible(extensionTargetPlatform, allTargetPlatforms, productTargetPlatform) {
  if (isNotWebExtensionInWebTargetPlatform(allTargetPlatforms, productTargetPlatform)) {
    return false;
  }
  if (extensionTargetPlatform === TargetPlatform.UNDEFINED) {
    return true;
  }
  if (extensionTargetPlatform === TargetPlatform.UNIVERSAL) {
    return true;
  }
  if (extensionTargetPlatform === TargetPlatform.UNKNOWN) {
    return false;
  }
  if (extensionTargetPlatform === productTargetPlatform) {
    return true;
  }
  return false;
}
function isIExtensionIdentifier(obj) {
  const thing = obj;
  return !!thing && typeof thing === "object" && typeof thing.id === "string" && (!thing.uuid || typeof thing.uuid === "string");
}
var SortBy = /* @__PURE__ */ ((SortBy2) => {
  SortBy2["NoneOrRelevance"] = "NoneOrRelevance";
  SortBy2["LastUpdatedDate"] = "LastUpdatedDate";
  SortBy2["Title"] = "Title";
  SortBy2["PublisherName"] = "PublisherName";
  SortBy2["InstallCount"] = "InstallCount";
  SortBy2["PublishedDate"] = "PublishedDate";
  SortBy2["AverageRating"] = "AverageRating";
  SortBy2["WeightedRating"] = "WeightedRating";
  return SortBy2;
})(SortBy || {});
var SortOrder = /* @__PURE__ */ ((SortOrder2) => {
  SortOrder2[SortOrder2["Default"] = 0] = "Default";
  SortOrder2[SortOrder2["Ascending"] = 1] = "Ascending";
  SortOrder2[SortOrder2["Descending"] = 2] = "Descending";
  return SortOrder2;
})(SortOrder || {});
var FilterType = /* @__PURE__ */ ((FilterType2) => {
  FilterType2["Category"] = "Category";
  FilterType2["ExtensionId"] = "ExtensionId";
  FilterType2["ExtensionName"] = "ExtensionName";
  FilterType2["ExcludeWithFlags"] = "ExcludeWithFlags";
  FilterType2["Featured"] = "Featured";
  FilterType2["SearchText"] = "SearchText";
  FilterType2["Tag"] = "Tag";
  FilterType2["Target"] = "Target";
  return FilterType2;
})(FilterType || {});
var StatisticType = /* @__PURE__ */ ((StatisticType2) => {
  StatisticType2["Install"] = "install";
  StatisticType2["Uninstall"] = "uninstall";
  return StatisticType2;
})(StatisticType || {});
var InstallOperation = /* @__PURE__ */ ((InstallOperation2) => {
  InstallOperation2[InstallOperation2["None"] = 1] = "None";
  InstallOperation2[InstallOperation2["Install"] = 2] = "Install";
  InstallOperation2[InstallOperation2["Update"] = 3] = "Update";
  InstallOperation2[InstallOperation2["Migrate"] = 4] = "Migrate";
  return InstallOperation2;
})(InstallOperation || {});
const IExtensionGalleryService = createDecorator("extensionGalleryService");
var ExtensionGalleryErrorCode = /* @__PURE__ */ ((ExtensionGalleryErrorCode2) => {
  ExtensionGalleryErrorCode2["Timeout"] = "Timeout";
  ExtensionGalleryErrorCode2["Cancelled"] = "Cancelled";
  ExtensionGalleryErrorCode2["ClientError"] = "ClientError";
  ExtensionGalleryErrorCode2["ServerError"] = "ServerError";
  ExtensionGalleryErrorCode2["Failed"] = "Failed";
  ExtensionGalleryErrorCode2["DownloadFailedWriting"] = "DownloadFailedWriting";
  ExtensionGalleryErrorCode2["Offline"] = "Offline";
  return ExtensionGalleryErrorCode2;
})(ExtensionGalleryErrorCode || {});
class ExtensionGalleryError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = code;
  }
}
var ExtensionManagementErrorCode = /* @__PURE__ */ ((ExtensionManagementErrorCode2) => {
  ExtensionManagementErrorCode2["NotFound"] = "NotFound";
  ExtensionManagementErrorCode2["Unsupported"] = "Unsupported";
  ExtensionManagementErrorCode2["Deprecated"] = "Deprecated";
  ExtensionManagementErrorCode2["Malicious"] = "Malicious";
  ExtensionManagementErrorCode2["Incompatible"] = "Incompatible";
  ExtensionManagementErrorCode2["IncompatibleApi"] = "IncompatibleApi";
  ExtensionManagementErrorCode2["IncompatibleTargetPlatform"] = "IncompatibleTargetPlatform";
  ExtensionManagementErrorCode2["ReleaseVersionNotFound"] = "ReleaseVersionNotFound";
  ExtensionManagementErrorCode2["Invalid"] = "Invalid";
  ExtensionManagementErrorCode2["Download"] = "Download";
  ExtensionManagementErrorCode2["DownloadSignature"] = "DownloadSignature";
  ExtensionManagementErrorCode2["DownloadFailedWriting"] = "DownloadFailedWriting" /* DownloadFailedWriting */;
  ExtensionManagementErrorCode2["UpdateMetadata"] = "UpdateMetadata";
  ExtensionManagementErrorCode2["Extract"] = "Extract";
  ExtensionManagementErrorCode2["Scanning"] = "Scanning";
  ExtensionManagementErrorCode2["ScanningExtension"] = "ScanningExtension";
  ExtensionManagementErrorCode2["ReadRemoved"] = "ReadRemoved";
  ExtensionManagementErrorCode2["UnsetRemoved"] = "UnsetRemoved";
  ExtensionManagementErrorCode2["Delete"] = "Delete";
  ExtensionManagementErrorCode2["Rename"] = "Rename";
  ExtensionManagementErrorCode2["IntializeDefaultProfile"] = "IntializeDefaultProfile";
  ExtensionManagementErrorCode2["AddToProfile"] = "AddToProfile";
  ExtensionManagementErrorCode2["InstalledExtensionNotFound"] = "InstalledExtensionNotFound";
  ExtensionManagementErrorCode2["PostInstall"] = "PostInstall";
  ExtensionManagementErrorCode2["CorruptZip"] = "CorruptZip";
  ExtensionManagementErrorCode2["IncompleteZip"] = "IncompleteZip";
  ExtensionManagementErrorCode2["PackageNotSigned"] = "PackageNotSigned";
  ExtensionManagementErrorCode2["SignatureVerificationInternal"] = "SignatureVerificationInternal";
  ExtensionManagementErrorCode2["SignatureVerificationFailed"] = "SignatureVerificationFailed";
  ExtensionManagementErrorCode2["NotAllowed"] = "NotAllowed";
  ExtensionManagementErrorCode2["Gallery"] = "Gallery";
  ExtensionManagementErrorCode2["Cancelled"] = "Cancelled";
  ExtensionManagementErrorCode2["Unknown"] = "Unknown";
  ExtensionManagementErrorCode2["Internal"] = "Internal";
  return ExtensionManagementErrorCode2;
})(ExtensionManagementErrorCode || {});
var ExtensionSignatureVerificationCode = /* @__PURE__ */ ((ExtensionSignatureVerificationCode2) => {
  ExtensionSignatureVerificationCode2["NotSigned"] = "NotSigned";
  ExtensionSignatureVerificationCode2["Success"] = "Success";
  ExtensionSignatureVerificationCode2["RequiredArgumentMissing"] = "RequiredArgumentMissing";
  ExtensionSignatureVerificationCode2["InvalidArgument"] = "InvalidArgument";
  ExtensionSignatureVerificationCode2["PackageIsUnreadable"] = "PackageIsUnreadable";
  ExtensionSignatureVerificationCode2["UnhandledException"] = "UnhandledException";
  ExtensionSignatureVerificationCode2["SignatureManifestIsMissing"] = "SignatureManifestIsMissing";
  ExtensionSignatureVerificationCode2["SignatureManifestIsUnreadable"] = "SignatureManifestIsUnreadable";
  ExtensionSignatureVerificationCode2["SignatureIsMissing"] = "SignatureIsMissing";
  ExtensionSignatureVerificationCode2["SignatureIsUnreadable"] = "SignatureIsUnreadable";
  ExtensionSignatureVerificationCode2["CertificateIsUnreadable"] = "CertificateIsUnreadable";
  ExtensionSignatureVerificationCode2["SignatureArchiveIsUnreadable"] = "SignatureArchiveIsUnreadable";
  ExtensionSignatureVerificationCode2["FileAlreadyExists"] = "FileAlreadyExists";
  ExtensionSignatureVerificationCode2["SignatureArchiveIsInvalidZip"] = "SignatureArchiveIsInvalidZip";
  ExtensionSignatureVerificationCode2["SignatureArchiveHasSameSignatureFile"] = "SignatureArchiveHasSameSignatureFile";
  ExtensionSignatureVerificationCode2["PackageIntegrityCheckFailed"] = "PackageIntegrityCheckFailed";
  ExtensionSignatureVerificationCode2["SignatureIsInvalid"] = "SignatureIsInvalid";
  ExtensionSignatureVerificationCode2["SignatureManifestIsInvalid"] = "SignatureManifestIsInvalid";
  ExtensionSignatureVerificationCode2["SignatureIntegrityCheckFailed"] = "SignatureIntegrityCheckFailed";
  ExtensionSignatureVerificationCode2["EntryIsMissing"] = "EntryIsMissing";
  ExtensionSignatureVerificationCode2["EntryIsTampered"] = "EntryIsTampered";
  ExtensionSignatureVerificationCode2["Untrusted"] = "Untrusted";
  ExtensionSignatureVerificationCode2["CertificateRevoked"] = "CertificateRevoked";
  ExtensionSignatureVerificationCode2["SignatureIsNotValid"] = "SignatureIsNotValid";
  ExtensionSignatureVerificationCode2["UnknownError"] = "UnknownError";
  ExtensionSignatureVerificationCode2["PackageIsInvalidZip"] = "PackageIsInvalidZip";
  ExtensionSignatureVerificationCode2["SignatureArchiveHasTooManyEntries"] = "SignatureArchiveHasTooManyEntries";
  return ExtensionSignatureVerificationCode2;
})(ExtensionSignatureVerificationCode || {});
class ExtensionManagementError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = code;
  }
}
const IExtensionManagementService = createDecorator("extensionManagementService");
const DISABLED_EXTENSIONS_STORAGE_PATH = "extensionsIdentifiers/disabled";
const ENABLED_EXTENSIONS_STORAGE_PATH = "extensionsIdentifiers/enabled";
const IGlobalExtensionEnablementService = createDecorator("IGlobalExtensionEnablementService");
const IExtensionTipsService = createDecorator("IExtensionTipsService");
const IAllowedExtensionsService = createDecorator("IAllowedExtensionsService");
async function computeSize(location, fileService) {
  let stat;
  try {
    stat = await fileService.resolve(location);
  } catch (e) {
    if (e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
      return 0;
    }
    throw e;
  }
  if (stat.children) {
    const sizes = await Promise.all(stat.children.map((c) => computeSize(c.resource, fileService)));
    return sizes.reduce((r, s) => r + s, 0);
  }
  return stat.size ?? 0;
}
const ExtensionsLocalizedLabel = localize2("extensions", "Extensions");
const PreferencesLocalizedLabel = localize2("preferences", "Preferences");
const AllowedExtensionsConfigKey = "extensions.allowed";
const VerifyExtensionSignatureConfigKey = "extensions.verifySignature";
const ExtensionRequestsTimeoutConfigKey = "extensions.requestTimeout";
Registry.as(Extensions.Configuration).registerConfiguration({
  id: "extensions",
  order: 30,
  title: localize("extensionsConfigurationTitle", "Extensions"),
  type: "object",
  properties: {
    [AllowedExtensionsConfigKey]: {
      // Note: Type is set only to object because to support policies generation during build time, where single type is expected.
      type: "object",
      markdownDescription: localize("extensions.allowed", "Specify a list of extensions that are allowed to use. This helps maintain a secure and consistent development environment by restricting the use of unauthorized extensions. For more information on how to configure this setting, please visit the [Configure Allowed Extensions](https://aka.ms/vscode/enterprise/extensions/allowed) section."),
      default: "*",
      defaultSnippets: [{
        body: {},
        description: localize("extensions.allowed.none", "No extensions are allowed.")
      }, {
        body: {
          "*": true
        },
        description: localize("extensions.allowed.all", "All extensions are allowed.")
      }],
      scope: ConfigurationScope.APPLICATION,
      policy: {
        name: "AllowedExtensions",
        category: PolicyCategory.Extensions,
        minimumVersion: "1.96",
        localization: {
          description: {
            key: "extensions.allowed.policy",
            value: localize("extensions.allowed.policy", "Specify a list of extensions that are allowed to use. This helps maintain a secure and consistent development environment by restricting the use of unauthorized extensions. More information: https://aka.ms/vscode/enterprise/extensions/allowed")
          }
        }
      },
      additionalProperties: false,
      patternProperties: {
        "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          anyOf: [
            {
              type: ["boolean", "string"],
              enum: [true, false, "stable"],
              description: localize("extensions.allow.description", "Allow or disallow the extension."),
              enumDescriptions: [
                localize("extensions.allowed.enable.desc", "Extension is allowed."),
                localize("extensions.allowed.disable.desc", "Extension is not allowed."),
                localize("extensions.allowed.disable.stable.desc", "Allow only stable versions of the extension.")
              ]
            },
            {
              type: "array",
              items: {
                type: "string"
              },
              description: localize("extensions.allow.version.description", "Allow or disallow specific versions of the extension. To specifcy a platform specific version, use the format `platform@1.2.3`, e.g. `win32-x64@1.2.3`. Supported platforms are `win32-x64`, `win32-arm64`, `linux-x64`, `linux-arm64`, `linux-armhf`, `alpine-x64`, `alpine-arm64`, `darwin-x64`, `darwin-arm64`")
            }
          ]
        },
        "([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          type: ["boolean", "string"],
          enum: [true, false, "stable"],
          description: localize("extension.publisher.allow.description", "Allow or disallow all extensions from the publisher."),
          enumDescriptions: [
            localize("extensions.publisher.allowed.enable.desc", "All extensions from the publisher are allowed."),
            localize("extensions.publisher.allowed.disable.desc", "All extensions from the publisher are not allowed."),
            localize("extensions.publisher.allowed.disable.stable.desc", "Allow only stable versions of the extensions from the publisher.")
          ]
        },
        "\\*": {
          type: "boolean",
          enum: [true, false],
          description: localize("extensions.allow.all.description", "Allow or disallow all extensions."),
          enumDescriptions: [
            localize("extensions.allow.all.enable", "Allow all extensions."),
            localize("extensions.allow.all.disable", "Disallow all extensions.")
          ]
        }
      }
    }
  }
});
function shouldRequireRepositorySignatureFor(isPrivate, galleryManifest) {
  if (isPrivate) {
    return galleryManifest?.capabilities.signing?.allPrivateRepositorySigned === true;
  }
  return galleryManifest?.capabilities.signing?.allPublicRepositorySigned === true;
}
export {
  AllowedExtensionsConfigKey,
  DISABLED_EXTENSIONS_STORAGE_PATH,
  ENABLED_EXTENSIONS_STORAGE_PATH,
  EXTENSION_IDENTIFIER_PATTERN,
  EXTENSION_IDENTIFIER_REGEX,
  EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT,
  EXTENSION_INSTALL_DEP_PACK_CONTEXT,
  EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT,
  EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT,
  EXTENSION_INSTALL_SOURCE_CONTEXT,
  ExtensionGalleryError,
  ExtensionGalleryErrorCode,
  ExtensionInstallSource,
  ExtensionManagementError,
  ExtensionManagementErrorCode,
  ExtensionRequestsTimeoutConfigKey,
  ExtensionSignatureVerificationCode,
  ExtensionsLocalizedLabel,
  FilterType,
  IAllowedExtensionsService,
  IExtensionGalleryService,
  IExtensionManagementService,
  IExtensionTipsService,
  IGlobalExtensionEnablementService,
  InstallOperation,
  LANGUAGE_MODEL_CHAT_PROVIDER_EXTENSION_TAG,
  PreferencesLocalizedLabel,
  SortBy,
  SortOrder,
  StatisticType,
  TargetPlatformToString,
  VerifyExtensionSignatureConfigKey,
  WEB_EXTENSION_TAG,
  computeSize,
  getTargetPlatform,
  isIExtensionIdentifier,
  isNotWebExtensionInWebTargetPlatform,
  isTargetPlatformCompatible,
  shouldRequireRepositorySignatureFor,
  toTargetPlatform
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxleHRlbnNpb25NYW5hZ2VtZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElQYWdlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhZ2luZy5qcyc7XG5pbXBvcnQgeyBQbGF0Zm9ybSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlLCBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uTWFuaWZlc3QsIFRhcmdldFBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCB9IGZyb20gJy4vZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmpzJztcblxuZXhwb3J0IGNvbnN0IEVYVEVOU0lPTl9JREVOVElGSUVSX1BBVFRFUk4gPSAnXihbYS16MC05QS1aXVthLXowLTktQS1aXSopXFxcXC4oW2EtejAtOUEtWl1bYS16MC05LUEtWl0qKSQnO1xuZXhwb3J0IGNvbnN0IEVYVEVOU0lPTl9JREVOVElGSUVSX1JFR0VYID0gbmV3IFJlZ0V4cChFWFRFTlNJT05fSURFTlRJRklFUl9QQVRURVJOKTtcbmV4cG9ydCBjb25zdCBXRUJfRVhURU5TSU9OX1RBRyA9ICdfX3dlYl9leHRlbnNpb24nO1xuZXhwb3J0IGNvbnN0IExBTkdVQUdFX01PREVMX0NIQVRfUFJPVklERVJfRVhURU5TSU9OX1RBRyA9ICdsYW5ndWFnZS1tb2RlbHMnO1xuZXhwb3J0IGNvbnN0IEVYVEVOU0lPTl9JTlNUQUxMX1NLSVBfV0FMS1RIUk9VR0hfQ09OVEVYVCA9ICdza2lwV2Fsa3Rocm91Z2gnO1xuZXhwb3J0IGNvbnN0IEVYVEVOU0lPTl9JTlNUQUxMX1NLSVBfUFVCTElTSEVSX1RSVVNUX0NPTlRFWFQgPSAnc2tpcFB1Ymxpc2hlclRydXN0JztcbmV4cG9ydCBjb25zdCBFWFRFTlNJT05fSU5TVEFMTF9TT1VSQ0VfQ09OVEVYVCA9ICdleHRlbnNpb25JbnN0YWxsU291cmNlJztcbmV4cG9ydCBjb25zdCBFWFRFTlNJT05fSU5TVEFMTF9ERVBfUEFDS19DT05URVhUID0gJ2RlcGVuZGVjeU9yUGFja0V4dGVuc2lvbkluc3RhbGwnO1xuZXhwb3J0IGNvbnN0IEVYVEVOU0lPTl9JTlNUQUxMX0NMSUVOVF9UQVJHRVRfUExBVEZPUk1fQ09OVEVYVCA9ICdjbGllbnRUYXJnZXRQbGF0Zm9ybSc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIEV4dGVuc2lvbkluc3RhbGxTb3VyY2Uge1xuXHRDT01NQU5EID0gJ2NvbW1hbmQnLFxuXHRTRVRUSU5HU19TWU5DID0gJ3NldHRpbmdzU3luYycsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2R1Y3RWZXJzaW9uIHtcblx0cmVhZG9ubHkgdmVyc2lvbjogc3RyaW5nO1xuXHRyZWFkb25seSBkYXRlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gVGFyZ2V0UGxhdGZvcm1Ub1N0cmluZyh0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0pIHtcblx0c3dpdGNoICh0YXJnZXRQbGF0Zm9ybSkge1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0OiByZXR1cm4gJ1dpbmRvd3MgNjQgYml0Jztcblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLldJTjMyX0FSTTY0OiByZXR1cm4gJ1dpbmRvd3MgQVJNJztcblxuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uTElOVVhfWDY0OiByZXR1cm4gJ0xpbnV4IDY0IGJpdCc7XG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9BUk02NDogcmV0dXJuICdMaW51eCBBUk0gNjQnO1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uTElOVVhfQVJNSEY6IHJldHVybiAnTGludXggQVJNJztcblxuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uQUxQSU5FX1g2NDogcmV0dXJuICdBbHBpbmUgTGludXggNjQgYml0Jztcblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLkFMUElORV9BUk02NDogcmV0dXJuICdBbHBpbmUgQVJNIDY0JztcblxuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NDogcmV0dXJuICdNYWMnO1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX0FSTTY0OiByZXR1cm4gJ01hYyBTaWxpY29uJztcblxuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uV0VCOiByZXR1cm4gJ1dlYic7XG5cblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLlVOSVZFUlNBTDogcmV0dXJuIFRhcmdldFBsYXRmb3JtLlVOSVZFUlNBTDtcblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLlVOS05PV046IHJldHVybiBUYXJnZXRQbGF0Zm9ybS5VTktOT1dOO1xuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uVU5ERUZJTkVEOiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uVU5ERUZJTkVEO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1RhcmdldFBsYXRmb3JtKHRhcmdldFBsYXRmb3JtOiBzdHJpbmcpOiBUYXJnZXRQbGF0Zm9ybSB7XG5cdHN3aXRjaCAodGFyZ2V0UGxhdGZvcm0pIHtcblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NDogcmV0dXJuIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NDtcblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLldJTjMyX0FSTTY0OiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uV0lOMzJfQVJNNjQ7XG5cblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLkxJTlVYX1g2NDogcmV0dXJuIFRhcmdldFBsYXRmb3JtLkxJTlVYX1g2NDtcblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLkxJTlVYX0FSTTY0OiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uTElOVVhfQVJNNjQ7XG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9BUk1IRjogcmV0dXJuIFRhcmdldFBsYXRmb3JtLkxJTlVYX0FSTUhGO1xuXG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5BTFBJTkVfWDY0OiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uQUxQSU5FX1g2NDtcblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLkFMUElORV9BUk02NDogcmV0dXJuIFRhcmdldFBsYXRmb3JtLkFMUElORV9BUk02NDtcblxuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NDogcmV0dXJuIFRhcmdldFBsYXRmb3JtLkRBUldJTl9YNjQ7XG5cdFx0Y2FzZSBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fQVJNNjQ6IHJldHVybiBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fQVJNNjQ7XG5cblx0XHRjYXNlIFRhcmdldFBsYXRmb3JtLldFQjogcmV0dXJuIFRhcmdldFBsYXRmb3JtLldFQjtcblxuXHRcdGNhc2UgVGFyZ2V0UGxhdGZvcm0uVU5JVkVSU0FMOiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uVU5JVkVSU0FMO1xuXHRcdGRlZmF1bHQ6IHJldHVybiBUYXJnZXRQbGF0Zm9ybS5VTktOT1dOO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUYXJnZXRQbGF0Zm9ybShwbGF0Zm9ybTogUGxhdGZvcm0gfCAnYWxwaW5lJywgYXJjaDogc3RyaW5nIHwgdW5kZWZpbmVkKTogVGFyZ2V0UGxhdGZvcm0ge1xuXHRzd2l0Y2ggKHBsYXRmb3JtKSB7XG5cdFx0Y2FzZSBQbGF0Zm9ybS5XaW5kb3dzOlxuXHRcdFx0aWYgKGFyY2ggPT09ICd4NjQnKSB7XG5cdFx0XHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXJjaCA9PT0gJ2FybTY0Jykge1xuXHRcdFx0XHRyZXR1cm4gVGFyZ2V0UGxhdGZvcm0uV0lOMzJfQVJNNjQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gVGFyZ2V0UGxhdGZvcm0uVU5LTk9XTjtcblxuXHRcdGNhc2UgUGxhdGZvcm0uTGludXg6XG5cdFx0XHRpZiAoYXJjaCA9PT0gJ3g2NCcpIHtcblx0XHRcdFx0cmV0dXJuIFRhcmdldFBsYXRmb3JtLkxJTlVYX1g2NDtcblx0XHRcdH1cblx0XHRcdGlmIChhcmNoID09PSAnYXJtNjQnKSB7XG5cdFx0XHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9BUk02NDtcblx0XHRcdH1cblx0XHRcdGlmIChhcmNoID09PSAnYXJtJykge1xuXHRcdFx0XHRyZXR1cm4gVGFyZ2V0UGxhdGZvcm0uTElOVVhfQVJNSEY7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gVGFyZ2V0UGxhdGZvcm0uVU5LTk9XTjtcblxuXHRcdGNhc2UgJ2FscGluZSc6XG5cdFx0XHRpZiAoYXJjaCA9PT0gJ3g2NCcpIHtcblx0XHRcdFx0cmV0dXJuIFRhcmdldFBsYXRmb3JtLkFMUElORV9YNjQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXJjaCA9PT0gJ2FybTY0Jykge1xuXHRcdFx0XHRyZXR1cm4gVGFyZ2V0UGxhdGZvcm0uQUxQSU5FX0FSTTY0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFRhcmdldFBsYXRmb3JtLlVOS05PV047XG5cblx0XHRjYXNlIFBsYXRmb3JtLk1hYzpcblx0XHRcdGlmIChhcmNoID09PSAneDY0Jykge1xuXHRcdFx0XHRyZXR1cm4gVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NDtcblx0XHRcdH1cblx0XHRcdGlmIChhcmNoID09PSAnYXJtNjQnKSB7XG5cdFx0XHRcdHJldHVybiBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fQVJNNjQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gVGFyZ2V0UGxhdGZvcm0uVU5LTk9XTjtcblxuXHRcdGNhc2UgUGxhdGZvcm0uV2ViOiByZXR1cm4gVGFyZ2V0UGxhdGZvcm0uV0VCO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc05vdFdlYkV4dGVuc2lvbkluV2ViVGFyZ2V0UGxhdGZvcm0oYWxsVGFyZ2V0UGxhdGZvcm1zOiBUYXJnZXRQbGF0Zm9ybVtdLCBwcm9kdWN0VGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtKTogYm9vbGVhbiB7XG5cdC8vIE5vdCBhIHdlYiBleHRlbnNpb24gaW4gd2ViIHRhcmdldCBwbGF0Zm9ybVxuXHRyZXR1cm4gcHJvZHVjdFRhcmdldFBsYXRmb3JtID09PSBUYXJnZXRQbGF0Zm9ybS5XRUIgJiYgIWFsbFRhcmdldFBsYXRmb3Jtcy5pbmNsdWRlcyhUYXJnZXRQbGF0Zm9ybS5XRUIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNUYXJnZXRQbGF0Zm9ybUNvbXBhdGlibGUoZXh0ZW5zaW9uVGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtLCBhbGxUYXJnZXRQbGF0Zm9ybXM6IFRhcmdldFBsYXRmb3JtW10sIHByb2R1Y3RUYXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0pOiBib29sZWFuIHtcblx0Ly8gTm90IGNvbXBhdGlibGUgd2hlbiBleHRlbnNpb24gaXMgbm90IGEgd2ViIGV4dGVuc2lvbiBpbiB3ZWIgdGFyZ2V0IHBsYXRmb3JtXG5cdGlmIChpc05vdFdlYkV4dGVuc2lvbkluV2ViVGFyZ2V0UGxhdGZvcm0oYWxsVGFyZ2V0UGxhdGZvcm1zLCBwcm9kdWN0VGFyZ2V0UGxhdGZvcm0pKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gQ29tcGF0aWJsZSB3aGVuIGV4dGVuc2lvbiB0YXJnZXQgcGxhdGZvcm0gaXMgbm90IGRlZmluZWRcblx0aWYgKGV4dGVuc2lvblRhcmdldFBsYXRmb3JtID09PSBUYXJnZXRQbGF0Zm9ybS5VTkRFRklORUQpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIENvbXBhdGlibGUgd2hlbiBleHRlbnNpb24gdGFyZ2V0IHBsYXRmb3JtIGlzIHVuaXZlcnNhbFxuXHRpZiAoZXh0ZW5zaW9uVGFyZ2V0UGxhdGZvcm0gPT09IFRhcmdldFBsYXRmb3JtLlVOSVZFUlNBTCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gTm90IGNvbXBhdGlibGUgd2hlbiBleHRlbnNpb24gdGFyZ2V0IHBsYXRmb3JtIGlzIHVua25vd25cblx0aWYgKGV4dGVuc2lvblRhcmdldFBsYXRmb3JtID09PSBUYXJnZXRQbGF0Zm9ybS5VTktOT1dOKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gQ29tcGF0aWJsZSB3aGVuIGV4dGVuc2lvbiBhbmQgcHJvZHVjdCB0YXJnZXQgcGxhdGZvcm1zIG1hdGNoZXNcblx0aWYgKGV4dGVuc2lvblRhcmdldFBsYXRmb3JtID09PSBwcm9kdWN0VGFyZ2V0UGxhdGZvcm0pIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR2FsbGVyeUV4dGVuc2lvblByb3BlcnRpZXMge1xuXHRkZXBlbmRlbmNpZXM/OiBzdHJpbmdbXTtcblx0ZXh0ZW5zaW9uUGFjaz86IHN0cmluZ1tdO1xuXHRlbmdpbmU/OiBzdHJpbmc7XG5cdGVuYWJsZWRBcGlQcm9wb3NhbHM/OiBzdHJpbmdbXTtcblx0bG9jYWxpemVkTGFuZ3VhZ2VzPzogc3RyaW5nW107XG5cdHRhcmdldFBsYXRmb3JtOiBUYXJnZXRQbGF0Zm9ybTtcblx0aXNQcmVSZWxlYXNlVmVyc2lvbjogYm9vbGVhbjtcblx0ZXhlY3V0ZXNDb2RlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0IHtcblx0dXJpOiBzdHJpbmc7XG5cdGZhbGxiYWNrVXJpOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdhbGxlcnlFeHRlbnNpb25Bc3NldHMge1xuXHRtYW5pZmVzdDogSUdhbGxlcnlFeHRlbnNpb25Bc3NldCB8IG51bGw7XG5cdHJlYWRtZTogSUdhbGxlcnlFeHRlbnNpb25Bc3NldCB8IG51bGw7XG5cdGNoYW5nZWxvZzogSUdhbGxlcnlFeHRlbnNpb25Bc3NldCB8IG51bGw7XG5cdGxpY2Vuc2U6IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXQgfCBudWxsO1xuXHRyZXBvc2l0b3J5OiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0IHwgbnVsbDtcblx0ZG93bmxvYWQ6IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXQ7XG5cdGljb246IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXQgfCBudWxsO1xuXHRzaWduYXR1cmU6IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXQgfCBudWxsO1xuXHRjb3JlVHJhbnNsYXRpb25zOiBbc3RyaW5nLCBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0XVtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNJRXh0ZW5zaW9uSWRlbnRpZmllcihvYmo6IHVua25vd24pOiBvYmogaXMgSUV4dGVuc2lvbklkZW50aWZpZXIge1xuXHRjb25zdCB0aGluZyA9IG9iaiBhcyBJRXh0ZW5zaW9uSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcblx0cmV0dXJuICEhdGhpbmdcblx0XHQmJiB0eXBlb2YgdGhpbmcgPT09ICdvYmplY3QnXG5cdFx0JiYgdHlwZW9mIHRoaW5nLmlkID09PSAnc3RyaW5nJ1xuXHRcdCYmICghdGhpbmcudXVpZCB8fCB0eXBlb2YgdGhpbmcudXVpZCA9PT0gJ3N0cmluZycpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25JZGVudGlmaWVyIHtcblx0aWQ6IHN0cmluZztcblx0dXVpZD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR2FsbGVyeUV4dGVuc2lvbklkZW50aWZpZXIgZXh0ZW5kcyBJRXh0ZW5zaW9uSWRlbnRpZmllciB7XG5cdHV1aWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR2FsbGVyeUV4dGVuc2lvblZlcnNpb24ge1xuXHR2ZXJzaW9uOiBzdHJpbmc7XG5cdGRhdGU6IHN0cmluZztcblx0aXNQcmVSZWxlYXNlVmVyc2lvbjogYm9vbGVhbjtcblx0dGFyZ2V0UGxhdGZvcm1zOiBUYXJnZXRQbGF0Zm9ybVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHYWxsZXJ5RXh0ZW5zaW9uIHtcblx0dHlwZTogJ2dhbGxlcnknO1xuXHRuYW1lOiBzdHJpbmc7XG5cdGlkZW50aWZpZXI6IElHYWxsZXJ5RXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0dmVyc2lvbjogc3RyaW5nO1xuXHRkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRwdWJsaXNoZXJJZDogc3RyaW5nO1xuXHRwdWJsaXNoZXI6IHN0cmluZztcblx0cHVibGlzaGVyRGlzcGxheU5hbWU6IHN0cmluZztcblx0cHVibGlzaGVyRG9tYWluPzogeyBsaW5rOiBzdHJpbmc7IHZlcmlmaWVkOiBib29sZWFuIH07XG5cdHB1Ymxpc2hlckxpbms/OiBzdHJpbmc7XG5cdHB1Ymxpc2hlclNwb25zb3JMaW5rPzogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRpbnN0YWxsQ291bnQ6IG51bWJlcjtcblx0cmF0aW5nOiBudW1iZXI7XG5cdHJhdGluZ0NvdW50OiBudW1iZXI7XG5cdGNhdGVnb3JpZXM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHR0YWdzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVsZWFzZURhdGU6IG51bWJlcjtcblx0bGFzdFVwZGF0ZWQ6IG51bWJlcjtcblx0cHJldmlldzogYm9vbGVhbjtcblx0cHJpdmF0ZTogYm9vbGVhbjtcblx0aGFzUHJlUmVsZWFzZVZlcnNpb246IGJvb2xlYW47XG5cdGhhc1JlbGVhc2VWZXJzaW9uOiBib29sZWFuO1xuXHRpc1NpZ25lZDogYm9vbGVhbjtcblx0YWxsVGFyZ2V0UGxhdGZvcm1zOiBUYXJnZXRQbGF0Zm9ybVtdO1xuXHRhc3NldHM6IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXRzO1xuXHRwcm9wZXJ0aWVzOiBJR2FsbGVyeUV4dGVuc2lvblByb3BlcnRpZXM7XG5cdGRldGFpbHNMaW5rPzogc3RyaW5nO1xuXHRyYXRpbmdMaW5rPzogc3RyaW5nO1xuXHRzdXBwb3J0TGluaz86IHN0cmluZztcblx0dGVsZW1ldHJ5RGF0YT86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+O1xuXHRxdWVyeUNvbnRleHQ/OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPjtcbn1cblxuZXhwb3J0IHR5cGUgSW5zdGFsbFNvdXJjZSA9ICdnYWxsZXJ5JyB8ICd2c2l4JyB8ICdyZXNvdXJjZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdhbGxlcnlNZXRhZGF0YSB7XG5cdGlkOiBzdHJpbmc7XG5cdHB1Ymxpc2hlcklkOiBzdHJpbmc7XG5cdHByaXZhdGU6IGJvb2xlYW47XG5cdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdGlzUHJlUmVsZWFzZVZlcnNpb246IGJvb2xlYW47XG5cdHRhcmdldFBsYXRmb3JtPzogVGFyZ2V0UGxhdGZvcm07XG59XG5cbmV4cG9ydCB0eXBlIE1ldGFkYXRhID0gUGFydGlhbDxJR2FsbGVyeU1ldGFkYXRhICYge1xuXHRpc0FwcGxpY2F0aW9uU2NvcGVkOiBib29sZWFuO1xuXHRpc01hY2hpbmVTY29wZWQ6IGJvb2xlYW47XG5cdGlzQnVpbHRpbjogYm9vbGVhbjtcblx0aXNTeXN0ZW06IGJvb2xlYW47XG5cdHVwZGF0ZWQ6IGJvb2xlYW47XG5cdHByZVJlbGVhc2U6IGJvb2xlYW47XG5cdGhhc1ByZVJlbGVhc2VWZXJzaW9uOiBib29sZWFuO1xuXHRpbnN0YWxsZWRUaW1lc3RhbXA6IG51bWJlcjtcblx0cGlubmVkOiBib29sZWFuO1xuXHRzb3VyY2U6IEluc3RhbGxTb3VyY2U7XG5cdHNpemU6IG51bWJlcjtcbn0+O1xuXG5leHBvcnQgaW50ZXJmYWNlIElMb2NhbEV4dGVuc2lvbiBleHRlbmRzIElFeHRlbnNpb24ge1xuXHRpc1dvcmtzcGFjZVNjb3BlZDogYm9vbGVhbjtcblx0aXNNYWNoaW5lU2NvcGVkOiBib29sZWFuO1xuXHRpc0FwcGxpY2F0aW9uU2NvcGVkOiBib29sZWFuO1xuXHRwdWJsaXNoZXJJZDogc3RyaW5nIHwgbnVsbDtcblx0aW5zdGFsbGVkVGltZXN0YW1wPzogbnVtYmVyO1xuXHRpc1ByZVJlbGVhc2VWZXJzaW9uOiBib29sZWFuO1xuXHRoYXNQcmVSZWxlYXNlVmVyc2lvbjogYm9vbGVhbjtcblx0cHJpdmF0ZTogYm9vbGVhbjtcblx0cHJlUmVsZWFzZTogYm9vbGVhbjtcblx0dXBkYXRlZDogYm9vbGVhbjtcblx0cGlubmVkOiBib29sZWFuO1xuXHRmb3JjZUF1dG9VcGRhdGU6IGJvb2xlYW47XG5cdHNvdXJjZTogSW5zdGFsbFNvdXJjZTtcblx0c2l6ZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBTb3J0Qnkge1xuXHROb25lT3JSZWxldmFuY2UgPSAnTm9uZU9yUmVsZXZhbmNlJyxcblx0TGFzdFVwZGF0ZWREYXRlID0gJ0xhc3RVcGRhdGVkRGF0ZScsXG5cdFRpdGxlID0gJ1RpdGxlJyxcblx0UHVibGlzaGVyTmFtZSA9ICdQdWJsaXNoZXJOYW1lJyxcblx0SW5zdGFsbENvdW50ID0gJ0luc3RhbGxDb3VudCcsXG5cdFB1Ymxpc2hlZERhdGUgPSAnUHVibGlzaGVkRGF0ZScsXG5cdEF2ZXJhZ2VSYXRpbmcgPSAnQXZlcmFnZVJhdGluZycsXG5cdFdlaWdodGVkUmF0aW5nID0gJ1dlaWdodGVkUmF0aW5nJ1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBTb3J0T3JkZXIge1xuXHREZWZhdWx0ID0gMCxcblx0QXNjZW5kaW5nID0gMSxcblx0RGVzY2VuZGluZyA9IDJcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRmlsdGVyVHlwZSB7XG5cdENhdGVnb3J5ID0gJ0NhdGVnb3J5Jyxcblx0RXh0ZW5zaW9uSWQgPSAnRXh0ZW5zaW9uSWQnLFxuXHRFeHRlbnNpb25OYW1lID0gJ0V4dGVuc2lvbk5hbWUnLFxuXHRFeGNsdWRlV2l0aEZsYWdzID0gJ0V4Y2x1ZGVXaXRoRmxhZ3MnLFxuXHRGZWF0dXJlZCA9ICdGZWF0dXJlZCcsXG5cdFNlYXJjaFRleHQgPSAnU2VhcmNoVGV4dCcsXG5cdFRhZyA9ICdUYWcnLFxuXHRUYXJnZXQgPSAnVGFyZ2V0Jyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUXVlcnlPcHRpb25zIHtcblx0dGV4dD86IHN0cmluZztcblx0ZXhjbHVkZT86IHN0cmluZ1tdO1xuXHRwYWdlU2l6ZT86IG51bWJlcjtcblx0c29ydEJ5PzogU29ydEJ5O1xuXHRzb3J0T3JkZXI/OiBTb3J0T3JkZXI7XG5cdHNvdXJjZT86IHN0cmluZztcblx0aW5jbHVkZVByZVJlbGVhc2U/OiBib29sZWFuO1xuXHRwcm9kdWN0VmVyc2lvbj86IElQcm9kdWN0VmVyc2lvbjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU3RhdGlzdGljVHlwZSB7XG5cdEluc3RhbGwgPSAnaW5zdGFsbCcsXG5cdFVuaW5zdGFsbCA9ICd1bmluc3RhbGwnXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlcHJlY2F0aW9uSW5mbyB7XG5cdHJlYWRvbmx5IGRpc2FsbG93SW5zdGFsbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGV4dGVuc2lvbj86IHtcblx0XHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgYXV0b01pZ3JhdGU/OiB7XG5cdFx0XHRyZWFkb25seSBzdG9yYWdlOiBib29sZWFuO1xuXHRcdFx0cmVhZG9ubHkgZG9ub3REaXNhYmxlPzogYm9vbGVhbjtcblx0XHR9O1xuXHRcdHJlYWRvbmx5IHByZVJlbGVhc2U/OiBib29sZWFuO1xuXHR9O1xuXHRyZWFkb25seSBzZXR0aW5ncz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBhZGRpdGlvbmFsSW5mbz86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VhcmNoUHJlZmZlcmVkUmVzdWx0cyB7XG5cdHJlYWRvbmx5IHF1ZXJ5Pzogc3RyaW5nO1xuXHRyZWFkb25seSBwcmVmZXJyZWRSZXN1bHRzPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCB0eXBlIE1hbGljaW91c0V4dGVuc2lvbkluZm8gPSB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbk9yUHVibGlzaGVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllciB8IHN0cmluZztcblx0cmVhZG9ubHkgbGVhcm5Nb3JlTGluaz86IHN0cmluZztcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Qge1xuXHRyZWFkb25seSBtYWxpY2lvdXM6IFJlYWRvbmx5QXJyYXk8TWFsaWNpb3VzRXh0ZW5zaW9uSW5mbz47XG5cdHJlYWRvbmx5IGRlcHJlY2F0ZWQ6IElTdHJpbmdEaWN0aW9uYXJ5PElEZXByZWNhdGlvbkluZm8+O1xuXHRyZWFkb25seSBzZWFyY2g6IElTZWFyY2hQcmVmZmVyZWRSZXN1bHRzW107XG5cdHJlYWRvbmx5IGF1dG9VcGRhdGU/OiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+O1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBJbnN0YWxsT3BlcmF0aW9uIHtcblx0Tm9uZSA9IDEsXG5cdEluc3RhbGwsXG5cdFVwZGF0ZSxcblx0TWlncmF0ZSxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVHJhbnNsYXRpb24ge1xuXHRjb250ZW50czogeyBba2V5OiBzdHJpbmddOiB7fSB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25JbmZvIGV4dGVuZHMgSUV4dGVuc2lvbklkZW50aWZpZXIge1xuXHR2ZXJzaW9uPzogc3RyaW5nO1xuXHRwcmVSZWxlYXNlPzogYm9vbGVhbjtcblx0aGFzUHJlUmVsZWFzZT86IGJvb2xlYW47XG5cdGN1cnJlbnRWZXJzaW9uPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25RdWVyeU9wdGlvbnMge1xuXHR0YXJnZXRQbGF0Zm9ybT86IFRhcmdldFBsYXRmb3JtO1xuXHRwcm9kdWN0VmVyc2lvbj86IElQcm9kdWN0VmVyc2lvbjtcblx0Y29tcGF0aWJsZT86IGJvb2xlYW47XG5cdHF1ZXJ5QWxsVmVyc2lvbnM/OiBib29sZWFuO1xuXHRzb3VyY2U/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbkdhbGxlcnlDYXBhYmlsaXRpZXMge1xuXHRyZWFkb25seSBxdWVyeToge1xuXHRcdHJlYWRvbmx5IHNvcnRCeTogcmVhZG9ubHkgU29ydEJ5W107XG5cdFx0cmVhZG9ubHkgZmlsdGVyczogcmVhZG9ubHkgRmlsdGVyVHlwZVtdO1xuXHR9O1xuXHRyZWFkb25seSBhbGxSZXBvc2l0b3J5U2lnbmVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgY29uc3QgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElFeHRlbnNpb25HYWxsZXJ5U2VydmljZT4oJ2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlJyk7XG5cbi8qKlxuICogU2VydmljZSB0byBpbnRlcmFjdCB3aXRoIHRoZSBWaXN1YWwgU3R1ZGlvIENvZGUgTWFya2V0cGxhY2UgdG8gZ2V0IGV4dGVuc2lvbnMuXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBNYXJrZXRwbGFjZSBpcyBub3QgZW5hYmxlZCBvciBub3QgcmVhY2hhYmxlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0aXNFbmFibGVkKCk6IGJvb2xlYW47XG5cdHF1ZXJ5KG9wdGlvbnM6IElRdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVBhZ2VyPElHYWxsZXJ5RXh0ZW5zaW9uPj47XG5cdGdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uSW5mb3M6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbkluZm8+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uW10+O1xuXHRnZXRFeHRlbnNpb25zKGV4dGVuc2lvbkluZm9zOiBSZWFkb25seUFycmF5PElFeHRlbnNpb25JbmZvPiwgb3B0aW9uczogSUV4dGVuc2lvblF1ZXJ5T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvbltdPjtcblx0aXNFeHRlbnNpb25Db21wYXRpYmxlKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGluY2x1ZGVQcmVSZWxlYXNlOiBib29sZWFuLCB0YXJnZXRQbGF0Zm9ybTogVGFyZ2V0UGxhdGZvcm0sIHByb2R1Y3RWZXJzaW9uPzogSVByb2R1Y3RWZXJzaW9uKTogUHJvbWlzZTxib29sZWFuPjtcblx0Z2V0Q29tcGF0aWJsZUV4dGVuc2lvbihleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBpbmNsdWRlUHJlUmVsZWFzZTogYm9vbGVhbiwgdGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtLCBwcm9kdWN0VmVyc2lvbj86IElQcm9kdWN0VmVyc2lvbik6IFByb21pc2U8SUdhbGxlcnlFeHRlbnNpb24gfCBudWxsPjtcblx0Z2V0QWxsQ29tcGF0aWJsZVZlcnNpb25zKGV4dGVuc2lvbklkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyLCBpbmNsdWRlUHJlUmVsZWFzZTogYm9vbGVhbiwgdGFyZ2V0UGxhdGZvcm06IFRhcmdldFBsYXRmb3JtKTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvblZlcnNpb25bXT47XG5cdGdldEFsbFZlcnNpb25zKGV4dGVuc2lvbklkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogUHJvbWlzZTxJR2FsbGVyeUV4dGVuc2lvblZlcnNpb25bXT47XG5cdGRvd25sb2FkKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGxvY2F0aW9uOiBVUkksIG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbik6IFByb21pc2U8dm9pZD47XG5cdGRvd25sb2FkU2lnbmF0dXJlQXJjaGl2ZShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBsb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPjtcblx0cmVwb3J0U3RhdGlzdGljKHB1Ymxpc2hlcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZywgdHlwZTogU3RhdGlzdGljVHlwZSk6IFByb21pc2U8dm9pZD47XG5cdGdldFJlYWRtZShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz47XG5cdGdldE1hbmlmZXN0KGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUV4dGVuc2lvbk1hbmlmZXN0IHwgbnVsbD47XG5cdGdldENoYW5nZWxvZyhleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz47XG5cdGdldENvcmVUcmFuc2xhdGlvbihleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBQcm9taXNlPElUcmFuc2xhdGlvbiB8IG51bGw+O1xuXHRnZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk6IFByb21pc2U8SUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEluc3RhbGxFeHRlbnNpb25FdmVudCB7XG5cdHJlYWRvbmx5IGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRyZWFkb25seSBzb3VyY2U6IFVSSSB8IElHYWxsZXJ5RXh0ZW5zaW9uO1xuXHRyZWFkb25seSBwcm9maWxlTG9jYXRpb246IFVSSTtcblx0cmVhZG9ubHkgYXBwbGljYXRpb25TY29wZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSB3b3Jrc3BhY2VTY29wZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEluc3RhbGxFeHRlbnNpb25SZXN1bHQge1xuXHRyZWFkb25seSBpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0cmVhZG9ubHkgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uO1xuXHRyZWFkb25seSBzb3VyY2U/OiBVUkkgfCBJR2FsbGVyeUV4dGVuc2lvbjtcblx0cmVhZG9ubHkgbG9jYWw/OiBJTG9jYWxFeHRlbnNpb247XG5cdHJlYWRvbmx5IGVycm9yPzogRXJyb3I7XG5cdHJlYWRvbmx5IGNvbnRleHQ/OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPjtcblx0cmVhZG9ubHkgcHJvZmlsZUxvY2F0aW9uOiBVUkk7XG5cdHJlYWRvbmx5IGFwcGxpY2F0aW9uU2NvcGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgd29ya3NwYWNlU2NvcGVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBVbmluc3RhbGxFeHRlbnNpb25FdmVudCB7XG5cdHJlYWRvbmx5IGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRyZWFkb25seSBwcm9maWxlTG9jYXRpb246IFVSSTtcblx0cmVhZG9ubHkgYXBwbGljYXRpb25TY29wZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSB3b3Jrc3BhY2VTY29wZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50IHtcblx0cmVhZG9ubHkgaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXI7XG5cdHJlYWRvbmx5IGVycm9yPzogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9maWxlTG9jYXRpb246IFVSSTtcblx0cmVhZG9ubHkgYXBwbGljYXRpb25TY29wZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSB3b3Jrc3BhY2VTY29wZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhIHtcblx0cmVhZG9ubHkgcHJvZmlsZUxvY2F0aW9uOiBVUkk7XG5cdHJlYWRvbmx5IGxvY2FsOiBJTG9jYWxFeHRlbnNpb247XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUge1xuXHRUaW1lb3V0ID0gJ1RpbWVvdXQnLFxuXHRDYW5jZWxsZWQgPSAnQ2FuY2VsbGVkJyxcblx0Q2xpZW50RXJyb3IgPSAnQ2xpZW50RXJyb3InLFxuXHRTZXJ2ZXJFcnJvciA9ICdTZXJ2ZXJFcnJvcicsXG5cdEZhaWxlZCA9ICdGYWlsZWQnLFxuXHREb3dubG9hZEZhaWxlZFdyaXRpbmcgPSAnRG93bmxvYWRGYWlsZWRXcml0aW5nJyxcblx0T2ZmbGluZSA9ICdPZmZsaW5lJyxcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkdhbGxlcnlFcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nLCByZWFkb25seSBjb2RlOiBFeHRlbnNpb25HYWxsZXJ5RXJyb3JDb2RlKSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdFx0dGhpcy5uYW1lID0gY29kZTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlIHtcblx0Tm90Rm91bmQgPSAnTm90Rm91bmQnLFxuXHRVbnN1cHBvcnRlZCA9ICdVbnN1cHBvcnRlZCcsXG5cdERlcHJlY2F0ZWQgPSAnRGVwcmVjYXRlZCcsXG5cdE1hbGljaW91cyA9ICdNYWxpY2lvdXMnLFxuXHRJbmNvbXBhdGlibGUgPSAnSW5jb21wYXRpYmxlJyxcblx0SW5jb21wYXRpYmxlQXBpID0gJ0luY29tcGF0aWJsZUFwaScsXG5cdEluY29tcGF0aWJsZVRhcmdldFBsYXRmb3JtID0gJ0luY29tcGF0aWJsZVRhcmdldFBsYXRmb3JtJyxcblx0UmVsZWFzZVZlcnNpb25Ob3RGb3VuZCA9ICdSZWxlYXNlVmVyc2lvbk5vdEZvdW5kJyxcblx0SW52YWxpZCA9ICdJbnZhbGlkJyxcblx0RG93bmxvYWQgPSAnRG93bmxvYWQnLFxuXHREb3dubG9hZFNpZ25hdHVyZSA9ICdEb3dubG9hZFNpZ25hdHVyZScsXG5cdERvd25sb2FkRmFpbGVkV3JpdGluZyA9IEV4dGVuc2lvbkdhbGxlcnlFcnJvckNvZGUuRG93bmxvYWRGYWlsZWRXcml0aW5nLFxuXHRVcGRhdGVNZXRhZGF0YSA9ICdVcGRhdGVNZXRhZGF0YScsXG5cdEV4dHJhY3QgPSAnRXh0cmFjdCcsXG5cdFNjYW5uaW5nID0gJ1NjYW5uaW5nJyxcblx0U2Nhbm5pbmdFeHRlbnNpb24gPSAnU2Nhbm5pbmdFeHRlbnNpb24nLFxuXHRSZWFkUmVtb3ZlZCA9ICdSZWFkUmVtb3ZlZCcsXG5cdFVuc2V0UmVtb3ZlZCA9ICdVbnNldFJlbW92ZWQnLFxuXHREZWxldGUgPSAnRGVsZXRlJyxcblx0UmVuYW1lID0gJ1JlbmFtZScsXG5cdEludGlhbGl6ZURlZmF1bHRQcm9maWxlID0gJ0ludGlhbGl6ZURlZmF1bHRQcm9maWxlJyxcblx0QWRkVG9Qcm9maWxlID0gJ0FkZFRvUHJvZmlsZScsXG5cdEluc3RhbGxlZEV4dGVuc2lvbk5vdEZvdW5kID0gJ0luc3RhbGxlZEV4dGVuc2lvbk5vdEZvdW5kJyxcblx0UG9zdEluc3RhbGwgPSAnUG9zdEluc3RhbGwnLFxuXHRDb3JydXB0WmlwID0gJ0NvcnJ1cHRaaXAnLFxuXHRJbmNvbXBsZXRlWmlwID0gJ0luY29tcGxldGVaaXAnLFxuXHRQYWNrYWdlTm90U2lnbmVkID0gJ1BhY2thZ2VOb3RTaWduZWQnLFxuXHRTaWduYXR1cmVWZXJpZmljYXRpb25JbnRlcm5hbCA9ICdTaWduYXR1cmVWZXJpZmljYXRpb25JbnRlcm5hbCcsXG5cdFNpZ25hdHVyZVZlcmlmaWNhdGlvbkZhaWxlZCA9ICdTaWduYXR1cmVWZXJpZmljYXRpb25GYWlsZWQnLFxuXHROb3RBbGxvd2VkID0gJ05vdEFsbG93ZWQnLFxuXHRHYWxsZXJ5ID0gJ0dhbGxlcnknLFxuXHRDYW5jZWxsZWQgPSAnQ2FuY2VsbGVkJyxcblx0VW5rbm93biA9ICdVbmtub3duJyxcblx0SW50ZXJuYWwgPSAnSW50ZXJuYWwnLFxufVxuXG5leHBvcnQgZW51bSBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlIHtcblx0J05vdFNpZ25lZCcgPSAnTm90U2lnbmVkJyxcblx0J1N1Y2Nlc3MnID0gJ1N1Y2Nlc3MnLFxuXHQnUmVxdWlyZWRBcmd1bWVudE1pc3NpbmcnID0gJ1JlcXVpcmVkQXJndW1lbnRNaXNzaW5nJywgLy8gQSByZXF1aXJlZCBhcmd1bWVudCBpcyBtaXNzaW5nLlxuXHQnSW52YWxpZEFyZ3VtZW50JyA9ICdJbnZhbGlkQXJndW1lbnQnLCAvLyBBbiBhcmd1bWVudCBpcyBpbnZhbGlkLlxuXHQnUGFja2FnZUlzVW5yZWFkYWJsZScgPSAnUGFja2FnZUlzVW5yZWFkYWJsZScsIC8vIFRoZSBleHRlbnNpb24gcGFja2FnZSBpcyB1bnJlYWRhYmxlLlxuXHQnVW5oYW5kbGVkRXhjZXB0aW9uJyA9ICdVbmhhbmRsZWRFeGNlcHRpb24nLCAvLyBBbiB1bmhhbmRsZWQgZXhjZXB0aW9uIG9jY3VycmVkLlxuXHQnU2lnbmF0dXJlTWFuaWZlc3RJc01pc3NpbmcnID0gJ1NpZ25hdHVyZU1hbmlmZXN0SXNNaXNzaW5nJywgLy8gVGhlIGV4dGVuc2lvbiBpcyBtaXNzaW5nIGEgc2lnbmF0dXJlIG1hbmlmZXN0IGZpbGUgKC5zaWduYXR1cmUubWFuaWZlc3QpLlxuXHQnU2lnbmF0dXJlTWFuaWZlc3RJc1VucmVhZGFibGUnID0gJ1NpZ25hdHVyZU1hbmlmZXN0SXNVbnJlYWRhYmxlJywgLy8gVGhlIHNpZ25hdHVyZSBtYW5pZmVzdCBpcyB1bnJlYWRhYmxlLlxuXHQnU2lnbmF0dXJlSXNNaXNzaW5nJyA9ICdTaWduYXR1cmVJc01pc3NpbmcnLCAvLyBUaGUgZXh0ZW5zaW9uIGlzIG1pc3NpbmcgYSBzaWduYXR1cmUgZmlsZSAoLnNpZ25hdHVyZS5wN3MpLlxuXHQnU2lnbmF0dXJlSXNVbnJlYWRhYmxlJyA9ICdTaWduYXR1cmVJc1VucmVhZGFibGUnLCAvLyBUaGUgc2lnbmF0dXJlIGlzIHVucmVhZGFibGUuXG5cdCdDZXJ0aWZpY2F0ZUlzVW5yZWFkYWJsZScgPSAnQ2VydGlmaWNhdGVJc1VucmVhZGFibGUnLCAvLyBUaGUgY2VydGlmaWNhdGUgaXMgdW5yZWFkYWJsZS5cblx0J1NpZ25hdHVyZUFyY2hpdmVJc1VucmVhZGFibGUnID0gJ1NpZ25hdHVyZUFyY2hpdmVJc1VucmVhZGFibGUnLFxuXHQnRmlsZUFscmVhZHlFeGlzdHMnID0gJ0ZpbGVBbHJlYWR5RXhpc3RzJywgLy8gVGhlIG91dHB1dCBmaWxlIGFscmVhZHkgZXhpc3RzLlxuXHQnU2lnbmF0dXJlQXJjaGl2ZUlzSW52YWxpZFppcCcgPSAnU2lnbmF0dXJlQXJjaGl2ZUlzSW52YWxpZFppcCcsXG5cdCdTaWduYXR1cmVBcmNoaXZlSGFzU2FtZVNpZ25hdHVyZUZpbGUnID0gJ1NpZ25hdHVyZUFyY2hpdmVIYXNTYW1lU2lnbmF0dXJlRmlsZScsIC8vIFRoZSBzaWduYXR1cmUgYXJjaGl2ZSBoYXMgdGhlIHNhbWUgc2lnbmF0dXJlIGZpbGUuXG5cdCdQYWNrYWdlSW50ZWdyaXR5Q2hlY2tGYWlsZWQnID0gJ1BhY2thZ2VJbnRlZ3JpdHlDaGVja0ZhaWxlZCcsIC8vIFRoZSBwYWNrYWdlIGludGVncml0eSBjaGVjayBmYWlsZWQuXG5cdCdTaWduYXR1cmVJc0ludmFsaWQnID0gJ1NpZ25hdHVyZUlzSW52YWxpZCcsIC8vIFRoZSBleHRlbnNpb24gaGFzIGFuIGludmFsaWQgc2lnbmF0dXJlIGZpbGUgKC5zaWduYXR1cmUucDdzKS5cblx0J1NpZ25hdHVyZU1hbmlmZXN0SXNJbnZhbGlkJyA9ICdTaWduYXR1cmVNYW5pZmVzdElzSW52YWxpZCcsIC8vIFRoZSBleHRlbnNpb24gaGFzIGFuIGludmFsaWQgc2lnbmF0dXJlIG1hbmlmZXN0IGZpbGUgKC5zaWduYXR1cmUubWFuaWZlc3QpLlxuXHQnU2lnbmF0dXJlSW50ZWdyaXR5Q2hlY2tGYWlsZWQnID0gJ1NpZ25hdHVyZUludGVncml0eUNoZWNrRmFpbGVkJywgLy8gVGhlIGV4dGVuc2lvbidzIHNpZ25hdHVyZSBpbnRlZ3JpdHkgY2hlY2sgZmFpbGVkLiAgRXh0ZW5zaW9uIGludGVncml0eSBpcyBzdXNwZWN0LlxuXHQnRW50cnlJc01pc3NpbmcnID0gJ0VudHJ5SXNNaXNzaW5nJywgLy8gQW4gZW50cnkgcmVmZXJlbmNlZCBpbiB0aGUgc2lnbmF0dXJlIG1hbmlmZXN0IHdhcyBub3QgZm91bmQgaW4gdGhlIGV4dGVuc2lvbi5cblx0J0VudHJ5SXNUYW1wZXJlZCcgPSAnRW50cnlJc1RhbXBlcmVkJywgLy8gVGhlIGludGVncml0eSBjaGVjayBmb3IgYW4gZW50cnkgcmVmZXJlbmNlZCBpbiB0aGUgc2lnbmF0dXJlIG1hbmlmZXN0IGZhaWxlZC5cblx0J1VudHJ1c3RlZCcgPSAnVW50cnVzdGVkJywgLy8gQW4gWC41MDkgY2VydGlmaWNhdGUgaW4gdGhlIGV4dGVuc2lvbiBzaWduYXR1cmUgaXMgdW50cnVzdGVkLlxuXHQnQ2VydGlmaWNhdGVSZXZva2VkJyA9ICdDZXJ0aWZpY2F0ZVJldm9rZWQnLCAvLyBBbiBYLjUwOSBjZXJ0aWZpY2F0ZSBpbiB0aGUgZXh0ZW5zaW9uIHNpZ25hdHVyZSBoYXMgYmVlbiByZXZva2VkLlxuXHQnU2lnbmF0dXJlSXNOb3RWYWxpZCcgPSAnU2lnbmF0dXJlSXNOb3RWYWxpZCcsIC8vIFRoZSBleHRlbnNpb24gc2lnbmF0dXJlIGlzIGludmFsaWQuXG5cdCdVbmtub3duRXJyb3InID0gJ1Vua25vd25FcnJvcicsIC8vIEFuIHVua25vd24gZXJyb3Igb2NjdXJyZWQuXG5cdCdQYWNrYWdlSXNJbnZhbGlkWmlwJyA9ICdQYWNrYWdlSXNJbnZhbGlkWmlwJywgLy8gVGhlIGV4dGVuc2lvbiBwYWNrYWdlIGlzIG5vdCB2YWxpZCBaSVAgZm9ybWF0LlxuXHQnU2lnbmF0dXJlQXJjaGl2ZUhhc1Rvb01hbnlFbnRyaWVzJyA9ICdTaWduYXR1cmVBcmNoaXZlSGFzVG9vTWFueUVudHJpZXMnLCAvLyBUaGUgc2lnbmF0dXJlIGFyY2hpdmUgaGFzIHRvbyBtYW55IGVudHJpZXMuXG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZywgcmVhZG9ubHkgY29kZTogRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZSkge1xuXHRcdHN1cGVyKG1lc3NhZ2UpO1xuXHRcdHRoaXMubmFtZSA9IGNvZGU7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnN0YWxsRXh0ZW5zaW9uU3VtbWFyeSB7XG5cdGZhaWxlZDoge1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0aW5zdGFsbE9wdGlvbnM6IEluc3RhbGxPcHRpb25zO1xuXHR9W107XG59XG5cbmV4cG9ydCB0eXBlIEluc3RhbGxPcHRpb25zID0ge1xuXHRpc0J1aWx0aW4/OiBib29sZWFuO1xuXHRpc1dvcmtzcGFjZVNjb3BlZD86IGJvb2xlYW47XG5cdGlzTWFjaGluZVNjb3BlZD86IGJvb2xlYW47XG5cdGlzQXBwbGljYXRpb25TY29wZWQ/OiBib29sZWFuO1xuXHRwaW5uZWQ/OiBib29sZWFuO1xuXHRkb25vdEluY2x1ZGVQYWNrQW5kRGVwZW5kZW5jaWVzPzogYm9vbGVhbjtcblx0aW5zdGFsbEdpdmVuVmVyc2lvbj86IGJvb2xlYW47XG5cdHByZVJlbGVhc2U/OiBib29sZWFuO1xuXHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb24/OiBib29sZWFuO1xuXHRkb25vdFZlcmlmeVNpZ25hdHVyZT86IGJvb2xlYW47XG5cdG9wZXJhdGlvbj86IEluc3RhbGxPcGVyYXRpb247XG5cdHByb2ZpbGVMb2NhdGlvbj86IFVSSTtcblx0cHJvZHVjdFZlcnNpb24/OiBJUHJvZHVjdFZlcnNpb247XG5cdGtlZXBFeGlzdGluZz86IGJvb2xlYW47XG5cdGRvd25sb2FkRXh0ZW5zaW9uc0xvY2FsbHk/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udGV4dCBwYXNzZWQgdGhyb3VnaCB0byBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0XG5cdCAqL1xuXHRjb250ZXh0PzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG59O1xuXG5leHBvcnQgdHlwZSBVbmluc3RhbGxPcHRpb25zID0ge1xuXHRyZWFkb25seSBwcm9maWxlTG9jYXRpb24/OiBVUkk7XG5cdHJlYWRvbmx5IGRvbm90SW5jbHVkZVBhY2s/OiBib29sZWFuO1xuXHRyZWFkb25seSBkb25vdENoZWNrRGVwZW5kZW50cz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZlcnNpb25Pbmx5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVtb3ZlPzogYm9vbGVhbjtcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbk1hbmFnZW1lbnRQYXJ0aWNpcGFudCB7XG5cdHBvc3RJbnN0YWxsKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIHNvdXJjZTogVVJJIHwgSUdhbGxlcnlFeHRlbnNpb24sIG9wdGlvbnM6IEluc3RhbGxPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+O1xuXHRwb3N0VW5pbnN0YWxsKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIG9wdGlvbnM6IFVuaW5zdGFsbE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCB0eXBlIEluc3RhbGxFeHRlbnNpb25JbmZvID0geyByZWFkb25seSBleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uOyByZWFkb25seSBvcHRpb25zOiBJbnN0YWxsT3B0aW9ucyB9O1xuZXhwb3J0IHR5cGUgVW5pbnN0YWxsRXh0ZW5zaW9uSW5mbyA9IHsgcmVhZG9ubHkgZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb247IHJlYWRvbmx5IG9wdGlvbnM/OiBVbmluc3RhbGxPcHRpb25zIH07XG5cbmV4cG9ydCBjb25zdCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlPignZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UnKTtcbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHByZWZlclByZVJlbGVhc2VzOiBib29sZWFuO1xuXG5cdG9uSW5zdGFsbEV4dGVuc2lvbjogRXZlbnQ8SW5zdGFsbEV4dGVuc2lvbkV2ZW50Pjtcblx0b25EaWRJbnN0YWxsRXh0ZW5zaW9uczogRXZlbnQ8cmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPjtcblx0b25Vbmluc3RhbGxFeHRlbnNpb246IEV2ZW50PFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50Pjtcblx0b25EaWRVbmluc3RhbGxFeHRlbnNpb246IEV2ZW50PERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50Pjtcblx0b25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YTogRXZlbnQ8RGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE+O1xuXG5cdHppcChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IFByb21pc2U8VVJJPjtcblx0Z2V0TWFuaWZlc3QodnNpeDogVVJJKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3Q+O1xuXHRpbnN0YWxsKHZzaXg6IFVSSSwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+O1xuXHRjYW5JbnN0YWxsKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24pOiBQcm9taXNlPHRydWUgfCBJTWFya2Rvd25TdHJpbmc+O1xuXHRpbnN0YWxsRnJvbUdhbGxlcnkoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+O1xuXHRpbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8SW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPjtcblx0aW5zdGFsbEZyb21Mb2NhdGlvbihsb2NhdGlvbjogVVJJLCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPjtcblx0aW5zdGFsbEV4dGVuc2lvbnNGcm9tUHJvZmlsZShleHRlbnNpb25zOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPjtcblx0dW5pbnN0YWxsKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBvcHRpb25zPzogVW5pbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cdHVuaW5zdGFsbEV4dGVuc2lvbnMoZXh0ZW5zaW9uczogVW5pbnN0YWxsRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTx2b2lkPjtcblx0dG9nZ2xlQXBwbGljYXRpb25TY29wZShleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+O1xuXHRnZXRJbnN0YWxsZWQodHlwZT86IEV4dGVuc2lvblR5cGUsIHByb2ZpbGVMb2NhdGlvbj86IFVSSSwgcHJvZHVjdFZlcnNpb24/OiBJUHJvZHVjdFZlcnNpb24sIGxhbmd1YWdlPzogc3RyaW5nKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT47XG5cdGdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTogUHJvbWlzZTxJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdD47XG5cdGNvcHlFeHRlbnNpb25zKGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8dm9pZD47XG5cdHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPiwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj47XG5cdHJlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucyhwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+O1xuXG5cdGRvd25sb2FkKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbiwgZG9ub3RWZXJpZnlTaWduYXR1cmU6IGJvb2xlYW4pOiBQcm9taXNlPFVSST47XG5cblx0cmVnaXN0ZXJQYXJ0aWNpcGFudChwYXJpdGljaXBhbnQ6IElFeHRlbnNpb25NYW5hZ2VtZW50UGFydGljaXBhbnQpOiB2b2lkO1xuXHRnZXRUYXJnZXRQbGF0Zm9ybSgpOiBQcm9taXNlPFRhcmdldFBsYXRmb3JtPjtcblxuXHRjbGVhblVwKCk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjb25zdCBESVNBQkxFRF9FWFRFTlNJT05TX1NUT1JBR0VfUEFUSCA9ICdleHRlbnNpb25zSWRlbnRpZmllcnMvZGlzYWJsZWQnO1xuZXhwb3J0IGNvbnN0IEVOQUJMRURfRVhURU5TSU9OU19TVE9SQUdFX1BBVEggPSAnZXh0ZW5zaW9uc0lkZW50aWZpZXJzL2VuYWJsZWQnO1xuZXhwb3J0IGNvbnN0IElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U+KCdJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW5hYmxlbWVudDogRXZlbnQ8eyByZWFkb25seSBleHRlbnNpb25zOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdOyByZWFkb25seSBzb3VyY2U/OiBzdHJpbmcgfT47XG5cblx0Z2V0RGlzYWJsZWRFeHRlbnNpb25zKCk6IElFeHRlbnNpb25JZGVudGlmaWVyW107XG5cdGVuYWJsZUV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb25JZGVudGlmaWVyLCBzb3VyY2U/OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRkaXNhYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbklkZW50aWZpZXIsIHNvdXJjZT86IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG5cbn1cblxuZXhwb3J0IHR5cGUgSUNvbmZpZ0Jhc2VkRXh0ZW5zaW9uVGlwID0ge1xuXHRyZWFkb25seSBleHRlbnNpb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBleHRlbnNpb25OYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlzRXh0ZW5zaW9uUGFjazogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29uZmlnTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpbXBvcnRhbnQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdoZW5Ob3RJbnN0YWxsZWQ/OiBzdHJpbmdbXTtcbn07XG5cbmV4cG9ydCB0eXBlIElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXAgPSB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbk5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaXNFeHRlbnNpb25QYWNrOiBib29sZWFuO1xuXHRyZWFkb25seSBleGVOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4ZUZyaWVuZGx5TmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSB3aW5kb3dzUGF0aD86IHN0cmluZztcblx0cmVhZG9ubHkgd2hlbk5vdEluc3RhbGxlZD86IHN0cmluZ1tdO1xufTtcblxuZXhwb3J0IGNvbnN0IElFeHRlbnNpb25UaXBzU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRXh0ZW5zaW9uVGlwc1NlcnZpY2U+KCdJRXh0ZW5zaW9uVGlwc1NlcnZpY2UnKTtcbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvblRpcHNTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGdldENvbmZpZ0Jhc2VkVGlwcyhmb2xkZXI6IFVSSSk6IFByb21pc2U8SUNvbmZpZ0Jhc2VkRXh0ZW5zaW9uVGlwW10+O1xuXHRnZXRJbXBvcnRhbnRFeGVjdXRhYmxlQmFzZWRUaXBzKCk6IFByb21pc2U8SUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPjtcblx0Z2V0T3RoZXJFeGVjdXRhYmxlQmFzZWRUaXBzKCk6IFByb21pc2U8SUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPjtcbn1cblxuZXhwb3J0IHR5cGUgQWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZVR5cGUgPSBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuIHwgc3RyaW5nIHwgc3RyaW5nW10+O1xuXG5leHBvcnQgY29uc3QgSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlPignSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZScpO1xuZXhwb3J0IGludGVyZmFjZSBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGFsbG93ZWRFeHRlbnNpb25zQ29uZmlnVmFsdWU6IEFsbG93ZWRFeHRlbnNpb25zQ29uZmlnVmFsdWVUeXBlIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFsbG93ZWRFeHRlbnNpb25zQ29uZmlnVmFsdWU6IEV2ZW50PHZvaWQ+O1xuXG5cdGlzQWxsb3dlZChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uIHwgSUV4dGVuc2lvbik6IHRydWUgfCBJTWFya2Rvd25TdHJpbmc7XG5cdGlzQWxsb3dlZChleHRlbnNpb246IHsgaWQ6IHN0cmluZzsgcHVibGlzaGVyRGlzcGxheU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDsgdmVyc2lvbj86IHN0cmluZzsgcHJlcmVsZWFzZT86IGJvb2xlYW47IHRhcmdldFBsYXRmb3JtPzogVGFyZ2V0UGxhdGZvcm0gfSk6IHRydWUgfCBJTWFya2Rvd25TdHJpbmc7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21wdXRlU2l6ZShsb2NhdGlvbjogVVJJLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTxudW1iZXI+IHtcblx0bGV0IHN0YXQ6IElGaWxlU3RhdDtcblx0dHJ5IHtcblx0XHRzdGF0ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShsb2NhdGlvbik7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRpZiAoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZSkuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHRocm93IGU7XG5cdH1cblx0aWYgKHN0YXQuY2hpbGRyZW4pIHtcblx0XHRjb25zdCBzaXplcyA9IGF3YWl0IFByb21pc2UuYWxsKHN0YXQuY2hpbGRyZW4ubWFwKGMgPT4gY29tcHV0ZVNpemUoYy5yZXNvdXJjZSwgZmlsZVNlcnZpY2UpKSk7XG5cdFx0cmV0dXJuIHNpemVzLnJlZHVjZSgociwgcykgPT4gciArIHMsIDApO1xuXHR9XG5cdHJldHVybiBzdGF0LnNpemUgPz8gMDtcbn1cblxuZXhwb3J0IGNvbnN0IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCA9IGxvY2FsaXplMignZXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9uc1wiKTtcbmV4cG9ydCBjb25zdCBQcmVmZXJlbmNlc0xvY2FsaXplZExhYmVsID0gbG9jYWxpemUyKCdwcmVmZXJlbmNlcycsICdQcmVmZXJlbmNlcycpO1xuZXhwb3J0IGNvbnN0IEFsbG93ZWRFeHRlbnNpb25zQ29uZmlnS2V5ID0gJ2V4dGVuc2lvbnMuYWxsb3dlZCc7XG5leHBvcnQgY29uc3QgVmVyaWZ5RXh0ZW5zaW9uU2lnbmF0dXJlQ29uZmlnS2V5ID0gJ2V4dGVuc2lvbnMudmVyaWZ5U2lnbmF0dXJlJztcbmV4cG9ydCBjb25zdCBFeHRlbnNpb25SZXF1ZXN0c1RpbWVvdXRDb25maWdLZXkgPSAnZXh0ZW5zaW9ucy5yZXF1ZXN0VGltZW91dCc7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0aWQ6ICdleHRlbnNpb25zJyxcblx0XHRvcmRlcjogMzAsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdleHRlbnNpb25zQ29uZmlndXJhdGlvblRpdGxlJywgXCJFeHRlbnNpb25zXCIpLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFtBbGxvd2VkRXh0ZW5zaW9uc0NvbmZpZ0tleV06IHtcblx0XHRcdFx0Ly8gTm90ZTogVHlwZSBpcyBzZXQgb25seSB0byBvYmplY3QgYmVjYXVzZSB0byBzdXBwb3J0IHBvbGljaWVzIGdlbmVyYXRpb24gZHVyaW5nIGJ1aWxkIHRpbWUsIHdoZXJlIHNpbmdsZSB0eXBlIGlzIGV4cGVjdGVkLlxuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnMuYWxsb3dlZCcsIFwiU3BlY2lmeSBhIGxpc3Qgb2YgZXh0ZW5zaW9ucyB0aGF0IGFyZSBhbGxvd2VkIHRvIHVzZS4gVGhpcyBoZWxwcyBtYWludGFpbiBhIHNlY3VyZSBhbmQgY29uc2lzdGVudCBkZXZlbG9wbWVudCBlbnZpcm9ubWVudCBieSByZXN0cmljdGluZyB0aGUgdXNlIG9mIHVuYXV0aG9yaXplZCBleHRlbnNpb25zLiBGb3IgbW9yZSBpbmZvcm1hdGlvbiBvbiBob3cgdG8gY29uZmlndXJlIHRoaXMgc2V0dGluZywgcGxlYXNlIHZpc2l0IHRoZSBbQ29uZmlndXJlIEFsbG93ZWQgRXh0ZW5zaW9uc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlL2VudGVycHJpc2UvZXh0ZW5zaW9ucy9hbGxvd2VkKSBzZWN0aW9uLlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogJyonLFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdFx0Ym9keToge30sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLmFsbG93ZWQubm9uZScsIFwiTm8gZXh0ZW5zaW9ucyBhcmUgYWxsb3dlZC5cIiksXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRib2R5OiB7XG5cdFx0XHRcdFx0XHQnKic6IHRydWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvd2VkLmFsbCcsIFwiQWxsIGV4dGVuc2lvbnMgYXJlIGFsbG93ZWQuXCIpLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ0FsbG93ZWRFeHRlbnNpb25zJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuOTYnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdFx0a2V5OiAnZXh0ZW5zaW9ucy5hbGxvd2VkLnBvbGljeScsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvd2VkLnBvbGljeScsIFwiU3BlY2lmeSBhIGxpc3Qgb2YgZXh0ZW5zaW9ucyB0aGF0IGFyZSBhbGxvd2VkIHRvIHVzZS4gVGhpcyBoZWxwcyBtYWludGFpbiBhIHNlY3VyZSBhbmQgY29uc2lzdGVudCBkZXZlbG9wbWVudCBlbnZpcm9ubWVudCBieSByZXN0cmljdGluZyB0aGUgdXNlIG9mIHVuYXV0aG9yaXplZCBleHRlbnNpb25zLiBNb3JlIGluZm9ybWF0aW9uOiBodHRwczovL2FrYS5tcy92c2NvZGUvZW50ZXJwcmlzZS9leHRlbnNpb25zL2FsbG93ZWRcIiksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0JyhbYS16MC05QS1aXVthLXowLTktQS1aXSopXFxcXC4oW2EtejAtOUEtWl1bYS16MC05LUEtWl0qKSQnOiB7XG5cdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogWydib29sZWFuJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFt0cnVlLCBmYWxzZSwgJ3N0YWJsZSddLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvdy5kZXNjcmlwdGlvbicsIFwiQWxsb3cgb3IgZGlzYWxsb3cgdGhlIGV4dGVuc2lvbi5cIiksXG5cdFx0XHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnMuYWxsb3dlZC5lbmFibGUuZGVzYycsIFwiRXh0ZW5zaW9uIGlzIGFsbG93ZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnMuYWxsb3dlZC5kaXNhYmxlLmRlc2MnLCBcIkV4dGVuc2lvbiBpcyBub3QgYWxsb3dlZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvd2VkLmRpc2FibGUuc3RhYmxlLmRlc2MnLCBcIkFsbG93IG9ubHkgc3RhYmxlIHZlcnNpb25zIG9mIHRoZSBleHRlbnNpb24uXCIpLFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvdy52ZXJzaW9uLmRlc2NyaXB0aW9uJywgXCJBbGxvdyBvciBkaXNhbGxvdyBzcGVjaWZpYyB2ZXJzaW9ucyBvZiB0aGUgZXh0ZW5zaW9uLiBUbyBzcGVjaWZjeSBhIHBsYXRmb3JtIHNwZWNpZmljIHZlcnNpb24sIHVzZSB0aGUgZm9ybWF0IGBwbGF0Zm9ybUAxLjIuM2AsIGUuZy4gYHdpbjMyLXg2NEAxLjIuM2AuIFN1cHBvcnRlZCBwbGF0Zm9ybXMgYXJlIGB3aW4zMi14NjRgLCBgd2luMzItYXJtNjRgLCBgbGludXgteDY0YCwgYGxpbnV4LWFybTY0YCwgYGxpbnV4LWFybWhmYCwgYGFscGluZS14NjRgLCBgYWxwaW5lLWFybTY0YCwgYGRhcndpbi14NjRgLCBgZGFyd2luLWFybTY0YFwiKSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCcoW2EtejAtOUEtWl1bYS16MC05LUEtWl0qKSQnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBbJ2Jvb2xlYW4nLCAnc3RyaW5nJ10sXG5cdFx0XHRcdFx0XHRlbnVtOiBbdHJ1ZSwgZmFsc2UsICdzdGFibGUnXSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uLnB1Ymxpc2hlci5hbGxvdy5kZXNjcmlwdGlvbicsIFwiQWxsb3cgb3IgZGlzYWxsb3cgYWxsIGV4dGVuc2lvbnMgZnJvbSB0aGUgcHVibGlzaGVyLlwiKSxcblx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnMucHVibGlzaGVyLmFsbG93ZWQuZW5hYmxlLmRlc2MnLCBcIkFsbCBleHRlbnNpb25zIGZyb20gdGhlIHB1Ymxpc2hlciBhcmUgYWxsb3dlZC5cIiksXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zLnB1Ymxpc2hlci5hbGxvd2VkLmRpc2FibGUuZGVzYycsIFwiQWxsIGV4dGVuc2lvbnMgZnJvbSB0aGUgcHVibGlzaGVyIGFyZSBub3QgYWxsb3dlZC5cIiksXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zLnB1Ymxpc2hlci5hbGxvd2VkLmRpc2FibGUuc3RhYmxlLmRlc2MnLCBcIkFsbG93IG9ubHkgc3RhYmxlIHZlcnNpb25zIG9mIHRoZSBleHRlbnNpb25zIGZyb20gdGhlIHB1Ymxpc2hlci5cIiksXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J1xcXFwqJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0ZW51bTogW3RydWUsIGZhbHNlXSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvdy5hbGwuZGVzY3JpcHRpb24nLCBcIkFsbG93IG9yIGRpc2FsbG93IGFsbCBleHRlbnNpb25zLlwiKSxcblx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnMuYWxsb3cuYWxsLmVuYWJsZScsIFwiQWxsb3cgYWxsIGV4dGVuc2lvbnMuXCIpLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvdy5hbGwuZGlzYWJsZScsIFwiRGlzYWxsb3cgYWxsIGV4dGVuc2lvbnMuXCIpXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRSZXF1aXJlUmVwb3NpdG9yeVNpZ25hdHVyZUZvcihpc1ByaXZhdGU6IGJvb2xlYW4sIGdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCB8IG51bGwpOiBib29sZWFuIHtcblx0aWYgKGlzUHJpdmF0ZSkge1xuXHRcdHJldHVybiBnYWxsZXJ5TWFuaWZlc3Q/LmNhcGFiaWxpdGllcy5zaWduaW5nPy5hbGxQcml2YXRlUmVwb3NpdG9yeVNpZ25lZCA9PT0gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gZ2FsbGVyeU1hbmlmZXN0Py5jYXBhYmlsaXRpZXMuc2lnbmluZz8uYWxsUHVibGljUmVwb3NpdG9yeVNpZ25lZCA9PT0gdHJ1ZTtcbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBVUEsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLG9CQUFvQixrQkFBMEM7QUFDdkUsU0FBd0Qsc0JBQXNCO0FBQzlFLFNBQTZCLDJCQUFvRDtBQUNqRixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUdsQixNQUFNLCtCQUErQjtBQUNyQyxNQUFNLDZCQUE2QixJQUFJLE9BQU8sNEJBQTRCO0FBQzFFLE1BQU0s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QU0sS0FBSztBQUFBLFVBQ2xCLGFBQWEsU0FBUyxvQ0FBb0MsbUNBQW1DO0FBQUEsVUFDN0Ysa0JBQWtCO0FBQUEsWUFDakIsU0FBUywrQkFBK0IsdUJBQXVCO0FBQUEsWUFDL0QsU0FBUyxnQ0FBZ0MsMEJBQTBCO0FBQUEsVUFDcEU7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUVLLFNBQVMsb0NBQW9DLFdBQW9CLGlCQUE0RDtBQUNuSSxNQUFJLFdBQVc7QUFDZCxXQUFPLGlCQUFpQixhQUFhLFNBQVMsK0JBQStCO0FBQUEsRUFDOUU7QUFDQSxTQUFPLGlCQUFpQixhQUFhLFNBQVMsOEJBQThCO0FBQzdFOyIsCiAgIm5hbWVzIjogWyJFeHRlbnNpb25JbnN0YWxsU291cmNlIiwgIlNvcnRCeSIsICJTb3J0T3JkZXIiLCAiRmlsdGVyVHlwZSIsICJTdGF0aXN0aWNUeXBlIiwgIkluc3RhbGxPcGVyYXRpb24iLCAiRXh0ZW5zaW9uR2FsbGVyeUVycm9yQ29kZSIsICJFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlIiwgIkV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUiXQp9Cg==
