import assert from "assert";
import { VSBuffer, bufferToStream } from "../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { isUUID } from "../../../../base/common/uuid.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { TargetPlatform } from "../../../extensions/common/extensions.js";
import { resolveMarketplaceHeaders } from "../../../externalServices/common/marketplace.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import product from "../../../product/common/product.js";
import { InMemoryStorageService } from "../../../storage/common/storage.js";
import { TelemetryConfiguration, TELEMETRY_SETTING_ID } from "../../../telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../telemetry/common/telemetryUtils.js";
import { AllowedExtensionsService } from "../../common/allowedExtensionsService.js";
import { ExtensionGalleryManifestStatus, ExtensionGalleryResourceType } from "../../common/extensionGalleryManifest.js";
import { ExtensionGalleryServiceWithNoStorageService, filterLatestExtensionVersionsForTargetPlatform, sortExtensionVersions } from "../../common/extensionGalleryService.js";
class EnvironmentServiceMock extends mock() {
  constructor(serviceMachineIdResource) {
    super();
    this.serviceMachineIdResource = serviceMachineIdResource;
    this.isBuilt = true;
  }
}
const latestVersionUri = "https://marketplace.test/_apis/public/gallery/publishers/{publisher}/extensions/{name}/latest";
const queryServiceUri = "https://marketplace.test/_apis/public/gallery/extensionquery";
class RecordingRequestService {
  constructor(response) {
    this.response = response;
    this.onDidCompleteRequest = Event.None;
    this.requests = [];
  }
  async request(options, _token) {
    this.requests.push({ type: options.type, url: options.url });
    return this.response(options);
  }
  async resolveProxy(_url) {
    return void 0;
  }
  async lookupAuthorization(_authInfo) {
    return void 0;
  }
  async lookupKerberosAuthorization(_url) {
    return void 0;
  }
  async loadCertificates() {
    return [];
  }
}
class TestLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.errors = [];
  }
  error(message, ...args) {
    this.errors.push([message, ...args].join(" "));
  }
}
function requestContext(statusCode, body) {
  return {
    res: { statusCode, headers: {} },
    stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body)))
  };
}
function galleryQueryResponse(extensions) {
  return {
    results: [{
      extensions,
      resultMetadata: [{
        metadataType: "ResultCount",
        metadataItems: [{ name: "TotalCount", count: extensions.length }]
      }]
    }]
  };
}
function rawLatestExtension() {
  const date = "2026-01-01T00:00:00Z";
  return {
    extensionId: "extension-uuid",
    extensionName: "extension",
    displayName: "Extension",
    shortDescription: "Extension",
    publisher: {
      displayName: "Publisher",
      publisherId: "publisher-id",
      publisherName: "publisher"
    },
    versions: [{
      version: "1.0.0",
      lastUpdated: date,
      assetUri: "https://marketplace.test/assets/publisher/extension/1.0.0",
      fallbackAssetUri: "https://marketplace.test/fallback/publisher/extension/1.0.0",
      files: [],
      properties: []
    }],
    statistics: [],
    tags: [],
    releaseDate: date,
    publishedDate: date,
    lastUpdated: date,
    categories: [],
    flags: ""
  };
}
function createExtensionGalleryManifestService() {
  const extensionGalleryManifest = {
    version: "1.0.0",
    resources: [
      { id: latestVersionUri, type: ExtensionGalleryResourceType.ExtensionLatestVersionUri },
      { id: queryServiceUri, type: ExtensionGalleryResourceType.ExtensionQueryService }
    ],
    capabilities: { extensionQuery: {} }
  };
  return {
    _serviceBrand: void 0,
    extensionGalleryManifestStatus: ExtensionGalleryManifestStatus.Available,
    onDidChangeExtensionGalleryManifestStatus: Event.None,
    onDidChangeExtensionGalleryManifest: Event.None,
    getExtensionGalleryManifest: async () => extensionGalleryManifest
  };
}
suite("Extension Gallery Service", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let fileService, environmentService, storageService, productService, configurationService;
  setup(() => {
    const serviceMachineIdResource = joinPath(URI.file("tests").with({ scheme: "vscode-tests" }), "machineid");
    environmentService = new EnvironmentServiceMock(serviceMachineIdResource);
    fileService = disposables.add(new FileService(new NullLogService()));
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(serviceMachineIdResource.scheme, fileSystemProvider));
    storageService = disposables.add(new InMemoryStorageService());
    configurationService = new TestConfigurationService({ [TELEMETRY_SETTING_ID]: TelemetryConfiguration.ON });
    configurationService.updateValue(TELEMETRY_SETTING_ID, TelemetryConfiguration.ON);
    productService = { _serviceBrand: void 0, ...product, enableTelemetry: true };
  });
  function createExtensionGalleryService(requestService, logService = new NullLogService()) {
    const allowedExtensionsService = disposables.add(new AllowedExtensionsService(productService, configurationService));
    return new ExtensionGalleryServiceWithNoStorageService(requestService, logService, environmentService, NullTelemetryService, fileService, productService, configurationService, allowedExtensionsService, createExtensionGalleryManifestService());
  }
  test("marketplace machine id", async () => {
    const headers = await resolveMarketplaceHeaders(product.version, productService, environmentService, configurationService, fileService, storageService, NullTelemetryService);
    assert.ok(headers["X-Market-User-Id"]);
    assert.ok(isUUID(headers["X-Market-User-Id"]));
    const headers2 = await resolveMarketplaceHeaders(product.version, productService, environmentService, configurationService, fileService, storageService, NullTelemetryService);
    assert.strictEqual(headers["X-Market-User-Id"], headers2["X-Market-User-Id"]);
  });
  test("getExtensions uses query API for extension info without uuid", async () => {
    const requestService = new RecordingRequestService((options) => options.type === "POST" ? requestContext(200, galleryQueryResponse([])) : requestContext(404, {}));
    const galleryService = createExtensionGalleryService(requestService);
    const extensions = await galleryService.getExtensions([{ id: "ms-vscode.visualization-runner" }], CancellationToken.None);
    assert.deepStrictEqual({
      requests: requestService.requests,
      extensions: extensions.map((extension) => extension.identifier.id)
    }, {
      requests: [{ type: "POST", url: queryServiceUri }],
      extensions: []
    });
  });
  test("getExtensions uses latest resource API for extension info with uuid", async () => {
    const requestService = new RecordingRequestService((options) => options.type === "GET" ? requestContext(200, rawLatestExtension()) : requestContext(200, galleryQueryResponse([])));
    const galleryService = createExtensionGalleryService(requestService);
    const extensions = await galleryService.getExtensions([{ id: "publisher.extension", uuid: "extension-uuid" }], CancellationToken.None);
    assert.deepStrictEqual({
      requests: requestService.requests,
      extensions: extensions.map((extension) => ({ id: extension.identifier.id, uuid: extension.identifier.uuid, version: extension.version }))
    }, {
      requests: [{ type: "GET", url: "https://marketplace.test/_apis/public/gallery/publishers/publisher/extensions/extension/latest" }],
      extensions: [{ id: "publisher.extension", uuid: "extension-uuid", version: "1.0.0" }]
    });
  });
  test("getExtensions falls back to query API when latest resource response omits files", async () => {
    const rawExtension = rawLatestExtension();
    const invalidLatestExtension = {
      ...rawExtension,
      versions: rawExtension.versions.map((version) => ({ ...version, files: void 0 }))
    };
    const requestService = new RecordingRequestService((options) => options.type === "GET" ? requestContext(200, invalidLatestExtension) : requestContext(200, galleryQueryResponse([rawExtension])));
    const logService = new TestLogService();
    const galleryService = createExtensionGalleryService(requestService, logService);
    const extensions = await galleryService.getExtensions([{ id: "publisher.extension", uuid: "extension-uuid" }], CancellationToken.None);
    assert.deepStrictEqual({
      requests: requestService.requests,
      extensions: extensions.map((extension) => ({ id: extension.identifier.id, uuid: extension.identifier.uuid, version: extension.version })),
      errors: logService.errors
    }, {
      requests: [
        { type: "GET", url: "https://marketplace.test/_apis/public/gallery/publishers/publisher/extensions/extension/latest" },
        { type: "POST", url: queryServiceUri }
      ],
      extensions: [{ id: "publisher.extension", uuid: "extension-uuid", version: "1.0.0" }],
      errors: []
    });
  });
  test("sorting single extension version without target platform", async () => {
    const actual = [aExtensionVersion("1.1.2")];
    const expected = [...actual];
    sortExtensionVersions(actual, TargetPlatform.DARWIN_X64);
    assert.deepStrictEqual(actual, expected);
  });
  test("sorting single extension version with preferred target platform", async () => {
    const actual = [aExtensionVersion("1.1.2", TargetPlatform.DARWIN_X64)];
    const expected = [...actual];
    sortExtensionVersions(actual, TargetPlatform.DARWIN_X64);
    assert.deepStrictEqual(actual, expected);
  });
  test("sorting single extension version with not compatible target platform", async () => {
    const actual = [aExtensionVersion("1.1.2", TargetPlatform.DARWIN_ARM64)];
    const expected = [...actual];
    sortExtensionVersions(actual, TargetPlatform.WIN32_X64);
    assert.deepStrictEqual(actual, expected);
  });
  test("sorting multiple extension versions without target platforms", async () => {
    const actual = [aExtensionVersion("1.2.4"), aExtensionVersion("1.1.3"), aExtensionVersion("1.1.2"), aExtensionVersion("1.1.1")];
    const expected = [...actual];
    sortExtensionVersions(actual, TargetPlatform.WIN32_ARM64);
    assert.deepStrictEqual(actual, expected);
  });
  test("sorting multiple extension versions with target platforms - 1", async () => {
    const actual = [aExtensionVersion("1.2.4", TargetPlatform.DARWIN_ARM64), aExtensionVersion("1.2.4", TargetPlatform.WIN32_ARM64), aExtensionVersion("1.2.4", TargetPlatform.LINUX_ARM64), aExtensionVersion("1.1.3"), aExtensionVersion("1.1.2"), aExtensionVersion("1.1.1")];
    const expected = [actual[1], actual[0], actual[2], actual[3], actual[4], actual[5]];
    sortExtensionVersions(actual, TargetPlatform.WIN32_ARM64);
    assert.deepStrictEqual(actual, expected);
  });
  test("sorting multiple extension versions with target platforms - 2", async () => {
    const actual = [aExtensionVersion("1.2.4"), aExtensionVersion("1.2.3", TargetPlatform.DARWIN_ARM64), aExtensionVersion("1.2.3", TargetPlatform.WIN32_ARM64), aExtensionVersion("1.2.3", TargetPlatform.LINUX_ARM64), aExtensionVersion("1.1.2"), aExtensionVersion("1.1.1")];
    const expected = [actual[0], actual[3], actual[1], actual[2], actual[4], actual[5]];
    sortExtensionVersions(actual, TargetPlatform.LINUX_ARM64);
    assert.deepStrictEqual(actual, expected);
  });
  test("sorting multiple extension versions with target platforms - 3", async () => {
    const actual = [aExtensionVersion("1.2.4"), aExtensionVersion("1.1.2"), aExtensionVersion("1.1.1"), aExtensionVersion("1.0.0", TargetPlatform.DARWIN_ARM64), aExtensionVersion("1.0.0", TargetPlatform.WIN32_ARM64)];
    const expected = [actual[0], actual[1], actual[2], actual[4], actual[3]];
    sortExtensionVersions(actual, TargetPlatform.WIN32_ARM64);
    assert.deepStrictEqual(actual, expected);
  });
  function aExtensionVersion(version, targetPlatform) {
    return { version, targetPlatform };
  }
  function aPreReleaseExtensionVersion(version, targetPlatform) {
    return {
      version,
      targetPlatform,
      properties: [{ key: "Microsoft.VisualStudio.Code.PreRelease", value: "true" }]
    };
  }
  suite("filterLatestExtensionVersionsForTargetPlatform", () => {
    test("should return empty array for empty input", () => {
      const result = filterLatestExtensionVersionsForTargetPlatform([], TargetPlatform.WIN32_X64, [TargetPlatform.WIN32_X64]);
      assert.deepStrictEqual(result, []);
    });
    test("should return single version when only one version provided", () => {
      const versions = [aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64)];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.deepStrictEqual(result, versions);
    });
    test("should include latest release and latest pre-release versions for same platform", () => {
      const release = aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const prerelease = aPreReleaseExtensionVersion("0.9.0", TargetPlatform.WIN32_X64);
      const versions = [release, prerelease];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0], release);
      assert.strictEqual(result[1], prerelease);
    });
    test("should include latest prerelease and latest release versions for same platform", () => {
      const prerelease = aPreReleaseExtensionVersion("1.1.0", TargetPlatform.WIN32_X64);
      const release = aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const versions = [prerelease, release];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0], prerelease);
      assert.strictEqual(result[1], release);
    });
    test("should include one version per target platform for release versions", () => {
      const version1 = aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const version2 = aExtensionVersion("1.0.0", TargetPlatform.DARWIN_X64);
      const version3 = aExtensionVersion("1.0.0", TargetPlatform.LINUX_X64);
      const versions = [version1, version2, version3];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64, TargetPlatform.LINUX_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 3);
      assert.ok(result.includes(version1));
      assert.ok(result.includes(version2));
      assert.ok(result.includes(version3));
    });
    test("should handle versions without target platform (UNDEFINED)", () => {
      const version1 = aExtensionVersion("1.0.0");
      const version2 = aExtensionVersion("0.9.0");
      const versions = [version1, version2];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0], version1);
    });
    test("should handle mixed release and pre-release versions across multiple platforms", () => {
      const releaseWin = aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const releaseMac = aExtensionVersion("1.0.0", TargetPlatform.DARWIN_X64);
      const preReleaseWin = aPreReleaseExtensionVersion("1.1.0", TargetPlatform.WIN32_X64);
      const preReleaseMac = aPreReleaseExtensionVersion("1.1.0", TargetPlatform.DARWIN_X64);
      const versions = [releaseWin, releaseMac, preReleaseWin, preReleaseMac];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 4);
      assert.ok(result.includes(releaseWin));
      assert.ok(result.includes(releaseMac));
      assert.ok(result.includes(preReleaseWin));
      assert.ok(result.includes(preReleaseMac));
    });
    test("should handle complex scenario with multiple versions and platforms", () => {
      const versions = [
        aExtensionVersion("2.0.0", TargetPlatform.WIN32_X64),
        aExtensionVersion("2.0.0", TargetPlatform.DARWIN_X64),
        aPreReleaseExtensionVersion("2.1.0", TargetPlatform.WIN32_X64),
        aPreReleaseExtensionVersion("2.1.0", TargetPlatform.LINUX_X64),
        aExtensionVersion("2.0.0"),
        // No platform specified
        aPreReleaseExtensionVersion("2.1.0")
        // Pre-release, no platform specified
      ];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64, TargetPlatform.LINUX_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 4);
      assert.ok(result.includes(versions[0]));
      assert.ok(result.includes(versions[1]));
      assert.ok(result.includes(versions[2]));
      assert.ok(result.includes(versions[3]));
    });
    test("should keep only first compatible version when specific platform comes before undefined", () => {
      const versions = [
        aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64),
        aExtensionVersion("1.0.0")
        // UNDEFINED platform - compatible with all
      ];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 1);
      assert.ok(result.includes(versions[0]));
    });
    test("should handle higher version with specific platform vs lower version with universal platform", () => {
      const higherVersionSpecificPlatform = aExtensionVersion("2.0.0", TargetPlatform.WIN32_X64);
      const lowerVersionUniversal = aExtensionVersion("1.5.0");
      const versions = [higherVersionSpecificPlatform, lowerVersionUniversal];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 1);
      assert.ok(result.includes(higherVersionSpecificPlatform));
      assert.ok(!result.includes(lowerVersionUniversal));
    });
    test("should handle higher version with universal platform vs lower version with specific platform", () => {
      const higherVersionUniversal = aExtensionVersion("2.0.0");
      const lowerVersionSpecificPlatform = aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const versions = [higherVersionUniversal, lowerVersionSpecificPlatform];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 1);
      assert.ok(result.includes(higherVersionUniversal));
      assert.ok(!result.includes(lowerVersionSpecificPlatform));
    });
    test("should handle multiple specific platforms vs universal platform with version differences", () => {
      const versions = [
        aExtensionVersion("2.0.0", TargetPlatform.WIN32_X64),
        // Highest version, specific platform
        aExtensionVersion("1.9.0", TargetPlatform.DARWIN_X64),
        // Lower version, different specific platform
        aExtensionVersion("1.8.0")
        // Lowest version, universal platform
      ];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64, TargetPlatform.LINUX_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 2);
      assert.ok(result.includes(versions[0]));
      assert.ok(result.includes(versions[1]));
    });
    test("should include universal platform when no specific platforms conflict", () => {
      const universalVersion = aExtensionVersion("1.0.0");
      const specificVersion = aExtensionVersion("1.0.0", TargetPlatform.LINUX_ARM64);
      const versions = [universalVersion, specificVersion];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 2);
      assert.ok(result.includes(universalVersion));
      assert.ok(result.includes(specificVersion));
    });
    test("should include all non-compatible platform versions", () => {
      const version1 = aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const version2 = aExtensionVersion("1.0.0", TargetPlatform.DARWIN_X64);
      const version3 = aPreReleaseExtensionVersion("1.1.0", TargetPlatform.LINUX_X64);
      const versions = [version1, version2, version3];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64, TargetPlatform.LINUX_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.ok(result.includes(version2));
      assert.ok(result.includes(version3));
    });
    test("should prefer specific target platform over undefined when same version exists for both", () => {
      const undefinedVersion = aExtensionVersion("1.0.0");
      const specificVersion = aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const versions = [undefinedVersion, specificVersion];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0], specificVersion);
      assert.ok(!result.includes(undefinedVersion));
    });
    test("should replace undefined pre-release with specific platform pre-release", () => {
      const undefinedPreRelease = aPreReleaseExtensionVersion("1.0.0");
      const specificPreRelease = aPreReleaseExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const versions = [undefinedPreRelease, specificPreRelease];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0], specificPreRelease);
      assert.ok(!result.includes(undefinedPreRelease));
    });
    test("should handle explicit UNIVERSAL platform", () => {
      const universalVersion = aExtensionVersion("1.0.0", TargetPlatform.UNIVERSAL);
      const specificVersion = aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const versions = [universalVersion, specificVersion];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0], specificVersion);
      assert.ok(!result.includes(universalVersion));
    });
    test("should handle both release and pre-release with same version replacement", () => {
      const undefinedPreRelease = aPreReleaseExtensionVersion("1.1.0");
      const specificPreRelease = aPreReleaseExtensionVersion("1.1.0", TargetPlatform.WIN32_X64);
      const undefinedRelease = aExtensionVersion("1.0.0");
      const specificRelease = aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const versions = [undefinedPreRelease, specificPreRelease, undefinedRelease, specificRelease];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 2);
      assert.ok(result.includes(specificRelease));
      assert.ok(result.includes(specificPreRelease));
      assert.ok(!result.includes(undefinedRelease));
      assert.ok(!result.includes(undefinedPreRelease));
    });
    test("should not replace when specific platform is for different platform", () => {
      const undefinedVersion = aExtensionVersion("1.0.0");
      const specificVersionDarwin = aExtensionVersion("1.0.0", TargetPlatform.DARWIN_X64);
      const versions = [undefinedVersion, specificVersionDarwin];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 2);
      assert.ok(result.includes(undefinedVersion));
      assert.ok(result.includes(specificVersionDarwin));
    });
    test("should handle replacement with non-compatible versions in between", () => {
      const undefinedVersion = aExtensionVersion("1.0.0");
      const specificVersion = aExtensionVersion("1.0.0", TargetPlatform.WIN32_X64);
      const nonCompatibleVersion = aExtensionVersion("0.9.0", TargetPlatform.LINUX_ARM64);
      const versions = [undefinedVersion, specificVersion, nonCompatibleVersion];
      const allTargetPlatforms = [TargetPlatform.WIN32_X64, TargetPlatform.DARWIN_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.WIN32_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 2);
      assert.ok(result.includes(specificVersion));
      assert.ok(result.includes(nonCompatibleVersion));
      assert.ok(!result.includes(undefinedVersion));
    });
    test("should filter versions for linux-x64 target platform with mixed universal and platform-specific versions", () => {
      const versions = [
        aPreReleaseExtensionVersion("0.15.0"),
        // pre-release, universal (highest version)
        aExtensionVersion("0.14.0"),
        // release, universal
        aExtensionVersion("0.6.0", TargetPlatform.LINUX_X64),
        // release, linux-x64
        aPreReleaseExtensionVersion("0.5.1", TargetPlatform.LINUX_X64)
        // pre-release, linux-x64 (lowest version)
      ];
      const allTargetPlatforms = [TargetPlatform.LINUX_X64];
      const result = filterLatestExtensionVersionsForTargetPlatform(versions, TargetPlatform.LINUX_X64, allTargetPlatforms);
      assert.strictEqual(result.length, 2);
      assert.ok(result.includes(versions[0]));
      assert.ok(result.includes(versions[1]));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcdGVzdFxcY29tbW9uXFxleHRlbnNpb25HYWxsZXJ5U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIsIGJ1ZmZlclRvU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzVVVJRCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RDb250ZXh0LCBJUmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBUYXJnZXRQbGF0Zm9ybSB9IGZyb20gJy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZU1hcmtldHBsYWNlSGVhZGVycyB9IGZyb20gJy4uLy4uLy4uL2V4dGVybmFsU2VydmljZXMvY29tbW9uL21hcmtldHBsYWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0aEluZm8sIENyZWRlbnRpYWxzLCBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5Q29uZmlndXJhdGlvbiwgVEVMRU1FVFJZX1NFVFRJTkdfSUQgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FsbG93ZWRFeHRlbnNpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMsIEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUsIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25HYWxsZXJ5U2VydmljZVdpdGhOb1N0b3JhZ2VTZXJ2aWNlLCBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24sIGZpbHRlckxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0sIHNvcnRFeHRlbnNpb25WZXJzaW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5U2VydmljZS5qcyc7XG5cbmNsYXNzIEVudmlyb25tZW50U2VydmljZU1vY2sgZXh0ZW5kcyBtb2NrPElFbnZpcm9ubWVudFNlcnZpY2U+KCkge1xuXHRvdmVycmlkZSByZWFkb25seSBzZXJ2aWNlTWFjaGluZUlkUmVzb3VyY2U6IFVSSTtcblx0Y29uc3RydWN0b3Ioc2VydmljZU1hY2hpbmVJZFJlc291cmNlOiBVUkkpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc2VydmljZU1hY2hpbmVJZFJlc291cmNlID0gc2VydmljZU1hY2hpbmVJZFJlc291cmNlO1xuXHRcdHRoaXMuaXNCdWlsdCA9IHRydWU7XG5cdH1cbn1cblxuY29uc3QgbGF0ZXN0VmVyc2lvblVyaSA9ICdodHRwczovL21hcmtldHBsYWNlLnRlc3QvX2FwaXMvcHVibGljL2dhbGxlcnkvcHVibGlzaGVycy97cHVibGlzaGVyfS9leHRlbnNpb25zL3tuYW1lfS9sYXRlc3QnO1xuY29uc3QgcXVlcnlTZXJ2aWNlVXJpID0gJ2h0dHBzOi8vbWFya2V0cGxhY2UudGVzdC9fYXBpcy9wdWJsaWMvZ2FsbGVyeS9leHRlbnNpb25xdWVyeSc7XG5cbmNsYXNzIFJlY29yZGluZ1JlcXVlc3RTZXJ2aWNlIGltcGxlbWVudHMgSVJlcXVlc3RTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZENvbXBsZXRlUmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IHJlcXVlc3RzOiB7IHJlYWRvbmx5IHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVhZG9ubHkgdXJsOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSByZXNwb25zZTogKG9wdGlvbnM6IElSZXF1ZXN0T3B0aW9ucykgPT4gSVJlcXVlc3RDb250ZXh0KSB7IH1cblxuXHRhc3luYyByZXF1ZXN0KG9wdGlvbnM6IElSZXF1ZXN0T3B0aW9ucywgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0dGhpcy5yZXF1ZXN0cy5wdXNoKHsgdHlwZTogb3B0aW9ucy50eXBlLCB1cmw6IG9wdGlvbnMudXJsIH0pO1xuXHRcdHJldHVybiB0aGlzLnJlc3BvbnNlKG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVByb3h5KF91cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgbG9va3VwQXV0aG9yaXphdGlvbihfYXV0aEluZm86IEF1dGhJbmZvKTogUHJvbWlzZTxDcmVkZW50aWFscyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbihfdXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGxvYWRDZXJ0aWZpY2F0ZXMoKTogUHJvbWlzZTxzdHJpbmdbXT4geyByZXR1cm4gW107IH1cbn1cblxuY2xhc3MgVGVzdExvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdHJlYWRvbmx5IGVycm9yczogc3RyaW5nW10gPSBbXTtcblxuXHRvdmVycmlkZSBlcnJvcihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5lcnJvcnMucHVzaChbbWVzc2FnZSwgLi4uYXJnc10uam9pbignICcpKTtcblx0fVxufVxuXG5mdW5jdGlvbiByZXF1ZXN0Q29udGV4dChzdGF0dXNDb2RlOiBudW1iZXIsIGJvZHk6IG9iamVjdCk6IElSZXF1ZXN0Q29udGV4dCB7XG5cdHJldHVybiB7XG5cdFx0cmVzOiB7IHN0YXR1c0NvZGUsIGhlYWRlcnM6IHt9IH0sXG5cdFx0c3RyZWFtOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGJvZHkpKSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdhbGxlcnlRdWVyeVJlc3BvbnNlKGV4dGVuc2lvbnM6IG9iamVjdFtdKTogb2JqZWN0IHtcblx0cmV0dXJuIHtcblx0XHRyZXN1bHRzOiBbe1xuXHRcdFx0ZXh0ZW5zaW9ucyxcblx0XHRcdHJlc3VsdE1ldGFkYXRhOiBbe1xuXHRcdFx0XHRtZXRhZGF0YVR5cGU6ICdSZXN1bHRDb3VudCcsXG5cdFx0XHRcdG1ldGFkYXRhSXRlbXM6IFt7IG5hbWU6ICdUb3RhbENvdW50JywgY291bnQ6IGV4dGVuc2lvbnMubGVuZ3RoIH1dXG5cdFx0XHR9XVxuXHRcdH1dXG5cdH07XG59XG5cbmZ1bmN0aW9uIHJhd0xhdGVzdEV4dGVuc2lvbigpIHtcblx0Y29uc3QgZGF0ZSA9ICcyMDI2LTAxLTAxVDAwOjAwOjAwWic7XG5cdHJldHVybiB7XG5cdFx0ZXh0ZW5zaW9uSWQ6ICdleHRlbnNpb24tdXVpZCcsXG5cdFx0ZXh0ZW5zaW9uTmFtZTogJ2V4dGVuc2lvbicsXG5cdFx0ZGlzcGxheU5hbWU6ICdFeHRlbnNpb24nLFxuXHRcdHNob3J0RGVzY3JpcHRpb246ICdFeHRlbnNpb24nLFxuXHRcdHB1Ymxpc2hlcjoge1xuXHRcdFx0ZGlzcGxheU5hbWU6ICdQdWJsaXNoZXInLFxuXHRcdFx0cHVibGlzaGVySWQ6ICdwdWJsaXNoZXItaWQnLFxuXHRcdFx0cHVibGlzaGVyTmFtZTogJ3B1Ymxpc2hlcidcblx0XHR9LFxuXHRcdHZlcnNpb25zOiBbe1xuXHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdGxhc3RVcGRhdGVkOiBkYXRlLFxuXHRcdFx0YXNzZXRVcmk6ICdodHRwczovL21hcmtldHBsYWNlLnRlc3QvYXNzZXRzL3B1Ymxpc2hlci9leHRlbnNpb24vMS4wLjAnLFxuXHRcdFx0ZmFsbGJhY2tBc3NldFVyaTogJ2h0dHBzOi8vbWFya2V0cGxhY2UudGVzdC9mYWxsYmFjay9wdWJsaXNoZXIvZXh0ZW5zaW9uLzEuMC4wJyxcblx0XHRcdGZpbGVzOiBbXSxcblx0XHRcdHByb3BlcnRpZXM6IFtdXG5cdFx0fV0sXG5cdFx0c3RhdGlzdGljczogW10sXG5cdFx0dGFnczogW10sXG5cdFx0cmVsZWFzZURhdGU6IGRhdGUsXG5cdFx0cHVibGlzaGVkRGF0ZTogZGF0ZSxcblx0XHRsYXN0VXBkYXRlZDogZGF0ZSxcblx0XHRjYXRlZ29yaWVzOiBbXSxcblx0XHRmbGFnczogJydcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSgpOiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSB7XG5cdGNvbnN0IGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCA9IHtcblx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdHJlc291cmNlczogW1xuXHRcdFx0eyBpZDogbGF0ZXN0VmVyc2lvblVyaSwgdHlwZTogRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25MYXRlc3RWZXJzaW9uVXJpIH0sXG5cdFx0XHR7IGlkOiBxdWVyeVNlcnZpY2VVcmksIHR5cGU6IEV4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uUXVlcnlTZXJ2aWNlIH1cblx0XHRdLFxuXHRcdGNhcGFiaWxpdGllczogeyBleHRlbnNpb25RdWVyeToge30gfVxuXHR9O1xuXHRyZXR1cm4ge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXM6IEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cy5BdmFpbGFibGUsXG5cdFx0b25EaWRDaGFuZ2VFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXM6IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRDaGFuZ2VFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IEV2ZW50Lk5vbmUsXG5cdFx0Z2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0OiBhc3luYyAoKSA9PiBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Rcblx0fTtcbn1cblxuc3VpdGUoJ0V4dGVuc2lvbiBHYWxsZXJ5IFNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2VNYWNoaW5lSWRSZXNvdXJjZSA9IGpvaW5QYXRoKFVSSS5maWxlKCd0ZXN0cycpLndpdGgoeyBzY2hlbWU6ICd2c2NvZGUtdGVzdHMnIH0pLCAnbWFjaGluZWlkJyk7XG5cdFx0ZW52aXJvbm1lbnRTZXJ2aWNlID0gbmV3IEVudmlyb25tZW50U2VydmljZU1vY2soc2VydmljZU1hY2hpbmVJZFJlc291cmNlKTtcblx0XHRmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBmaWxlU3lzdGVtUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHNlcnZpY2VNYWNoaW5lSWRSZXNvdXJjZS5zY2hlbWUsIGZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IFtURUxFTUVUUllfU0VUVElOR19JRF06IFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uT04gfSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVEVMRU1FVFJZX1NFVFRJTkdfSUQsIFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uT04pO1xuXHRcdHByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIC4uLnByb2R1Y3QsIGVuYWJsZVRlbGVtZXRyeTogdHJ1ZSB9O1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVFeHRlbnNpb25HYWxsZXJ5U2VydmljZShyZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCkpOiBFeHRlbnNpb25HYWxsZXJ5U2VydmljZVdpdGhOb1N0b3JhZ2VTZXJ2aWNlIHtcblx0XHRjb25zdCBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFsbG93ZWRFeHRlbnNpb25zU2VydmljZShwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRyZXR1cm4gbmV3IEV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlV2l0aE5vU3RvcmFnZVNlcnZpY2UocmVxdWVzdFNlcnZpY2UsIGxvZ1NlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZSwgY3JlYXRlRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSgpKTtcblx0fVxuXG5cdHRlc3QoJ21hcmtldHBsYWNlIG1hY2hpbmUgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaGVhZGVycyA9IGF3YWl0IHJlc29sdmVNYXJrZXRwbGFjZUhlYWRlcnMocHJvZHVjdC52ZXJzaW9uLCBwcm9kdWN0U2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZmlsZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKGhlYWRlcnNbJ1gtTWFya2V0LVVzZXItSWQnXSk7XG5cdFx0YXNzZXJ0Lm9rKGlzVVVJRChoZWFkZXJzWydYLU1hcmtldC1Vc2VyLUlkJ10pKTtcblx0XHRjb25zdCBoZWFkZXJzMiA9IGF3YWl0IHJlc29sdmVNYXJrZXRwbGFjZUhlYWRlcnMocHJvZHVjdC52ZXJzaW9uLCBwcm9kdWN0U2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZmlsZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ1gtTWFya2V0LVVzZXItSWQnXSwgaGVhZGVyczJbJ1gtTWFya2V0LVVzZXItSWQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEV4dGVuc2lvbnMgdXNlcyBxdWVyeSBBUEkgZm9yIGV4dGVuc2lvbiBpbmZvIHdpdGhvdXQgdXVpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0U2VydmljZSA9IG5ldyBSZWNvcmRpbmdSZXF1ZXN0U2VydmljZShvcHRpb25zID0+IG9wdGlvbnMudHlwZSA9PT0gJ1BPU1QnID8gcmVxdWVzdENvbnRleHQoMjAwLCBnYWxsZXJ5UXVlcnlSZXNwb25zZShbXSkpIDogcmVxdWVzdENvbnRleHQoNDA0LCB7fSkpO1xuXHRcdGNvbnN0IGdhbGxlcnlTZXJ2aWNlID0gY3JlYXRlRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UocmVxdWVzdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IGdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6ICdtcy12c2NvZGUudmlzdWFsaXphdGlvbi1ydW5uZXInIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVxdWVzdHM6IHJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RzLFxuXHRcdFx0ZXh0ZW5zaW9uczogZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKVxuXHRcdH0sIHtcblx0XHRcdHJlcXVlc3RzOiBbeyB0eXBlOiAnUE9TVCcsIHVybDogcXVlcnlTZXJ2aWNlVXJpIH1dLFxuXHRcdFx0ZXh0ZW5zaW9uczogW11cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RXh0ZW5zaW9ucyB1c2VzIGxhdGVzdCByZXNvdXJjZSBBUEkgZm9yIGV4dGVuc2lvbiBpbmZvIHdpdGggdXVpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0U2VydmljZSA9IG5ldyBSZWNvcmRpbmdSZXF1ZXN0U2VydmljZShvcHRpb25zID0+IG9wdGlvbnMudHlwZSA9PT0gJ0dFVCcgPyByZXF1ZXN0Q29udGV4dCgyMDAsIHJhd0xhdGVzdEV4dGVuc2lvbigpKSA6IHJlcXVlc3RDb250ZXh0KDIwMCwgZ2FsbGVyeVF1ZXJ5UmVzcG9uc2UoW10pKSk7XG5cdFx0Y29uc3QgZ2FsbGVyeVNlcnZpY2UgPSBjcmVhdGVFeHRlbnNpb25HYWxsZXJ5U2VydmljZShyZXF1ZXN0U2VydmljZSk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogJ3B1Ymxpc2hlci5leHRlbnNpb24nLCB1dWlkOiAnZXh0ZW5zaW9uLXV1aWQnIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVxdWVzdHM6IHJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RzLFxuXHRcdFx0ZXh0ZW5zaW9uczogZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+ICh7IGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgdXVpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCwgdmVyc2lvbjogZXh0ZW5zaW9uLnZlcnNpb24gfSkpXG5cdFx0fSwge1xuXHRcdFx0cmVxdWVzdHM6IFt7IHR5cGU6ICdHRVQnLCB1cmw6ICdodHRwczovL21hcmtldHBsYWNlLnRlc3QvX2FwaXMvcHVibGljL2dhbGxlcnkvcHVibGlzaGVycy9wdWJsaXNoZXIvZXh0ZW5zaW9ucy9leHRlbnNpb24vbGF0ZXN0JyB9XSxcblx0XHRcdGV4dGVuc2lvbnM6IFt7IGlkOiAncHVibGlzaGVyLmV4dGVuc2lvbicsIHV1aWQ6ICdleHRlbnNpb24tdXVpZCcsIHZlcnNpb246ICcxLjAuMCcgfV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RXh0ZW5zaW9ucyBmYWxscyBiYWNrIHRvIHF1ZXJ5IEFQSSB3aGVuIGxhdGVzdCByZXNvdXJjZSByZXNwb25zZSBvbWl0cyBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByYXdFeHRlbnNpb24gPSByYXdMYXRlc3RFeHRlbnNpb24oKTtcblx0XHRjb25zdCBpbnZhbGlkTGF0ZXN0RXh0ZW5zaW9uID0ge1xuXHRcdFx0Li4ucmF3RXh0ZW5zaW9uLFxuXHRcdFx0dmVyc2lvbnM6IHJhd0V4dGVuc2lvbi52ZXJzaW9ucy5tYXAodmVyc2lvbiA9PiAoeyAuLi52ZXJzaW9uLCBmaWxlczogdW5kZWZpbmVkIH0pKVxuXHRcdH07XG5cdFx0Y29uc3QgcmVxdWVzdFNlcnZpY2UgPSBuZXcgUmVjb3JkaW5nUmVxdWVzdFNlcnZpY2Uob3B0aW9ucyA9PiBvcHRpb25zLnR5cGUgPT09ICdHRVQnID8gcmVxdWVzdENvbnRleHQoMjAwLCBpbnZhbGlkTGF0ZXN0RXh0ZW5zaW9uKSA6IHJlcXVlc3RDb250ZXh0KDIwMCwgZ2FsbGVyeVF1ZXJ5UmVzcG9uc2UoW3Jhd0V4dGVuc2lvbl0pKSk7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBUZXN0TG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGdhbGxlcnlTZXJ2aWNlID0gY3JlYXRlRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UocmVxdWVzdFNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IGdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6ICdwdWJsaXNoZXIuZXh0ZW5zaW9uJywgdXVpZDogJ2V4dGVuc2lvbi11dWlkJyB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcXVlc3RzOiByZXF1ZXN0U2VydmljZS5yZXF1ZXN0cyxcblx0XHRcdGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiAoeyBpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHV1aWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQsIHZlcnNpb246IGV4dGVuc2lvbi52ZXJzaW9uIH0pKSxcblx0XHRcdGVycm9yczogbG9nU2VydmljZS5lcnJvcnNcblx0XHR9LCB7XG5cdFx0XHRyZXF1ZXN0czogW1xuXHRcdFx0XHR7IHR5cGU6ICdHRVQnLCB1cmw6ICdodHRwczovL21hcmtldHBsYWNlLnRlc3QvX2FwaXMvcHVibGljL2dhbGxlcnkvcHVibGlzaGVycy9wdWJsaXNoZXIvZXh0ZW5zaW9ucy9leHRlbnNpb24vbGF0ZXN0JyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdQT1NUJywgdXJsOiBxdWVyeVNlcnZpY2VVcmkgfVxuXHRcdFx0XSxcblx0XHRcdGV4dGVuc2lvbnM6IFt7IGlkOiAncHVibGlzaGVyLmV4dGVuc2lvbicsIHV1aWQ6ICdleHRlbnNpb24tdXVpZCcsIHZlcnNpb246ICcxLjAuMCcgfV0sXG5cdFx0XHRlcnJvcnM6IFtdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRpbmcgc2luZ2xlIGV4dGVuc2lvbiB2ZXJzaW9uIHdpdGhvdXQgdGFyZ2V0IHBsYXRmb3JtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IFthRXh0ZW5zaW9uVmVyc2lvbignMS4xLjInKV07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbLi4uYWN0dWFsXTtcblx0XHRzb3J0RXh0ZW5zaW9uVmVyc2lvbnMoYWN0dWFsLCBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fWDY0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzb3J0aW5nIHNpbmdsZSBleHRlbnNpb24gdmVyc2lvbiB3aXRoIHByZWZlcnJlZCB0YXJnZXQgcGxhdGZvcm0nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gW2FFeHRlbnNpb25WZXJzaW9uKCcxLjEuMicsIFRhcmdldFBsYXRmb3JtLkRBUldJTl9YNjQpXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFsuLi5hY3R1YWxdO1xuXHRcdHNvcnRFeHRlbnNpb25WZXJzaW9ucyhhY3R1YWwsIFRhcmdldFBsYXRmb3JtLkRBUldJTl9YNjQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRpbmcgc2luZ2xlIGV4dGVuc2lvbiB2ZXJzaW9uIHdpdGggbm90IGNvbXBhdGlibGUgdGFyZ2V0IHBsYXRmb3JtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IFthRXh0ZW5zaW9uVmVyc2lvbignMS4xLjInLCBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fQVJNNjQpXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFsuLi5hY3R1YWxdO1xuXHRcdHNvcnRFeHRlbnNpb25WZXJzaW9ucyhhY3R1YWwsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnc29ydGluZyBtdWx0aXBsZSBleHRlbnNpb24gdmVyc2lvbnMgd2l0aG91dCB0YXJnZXQgcGxhdGZvcm1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IFthRXh0ZW5zaW9uVmVyc2lvbignMS4yLjQnKSwgYUV4dGVuc2lvblZlcnNpb24oJzEuMS4zJyksIGFFeHRlbnNpb25WZXJzaW9uKCcxLjEuMicpLCBhRXh0ZW5zaW9uVmVyc2lvbignMS4xLjEnKV07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbLi4uYWN0dWFsXTtcblx0XHRzb3J0RXh0ZW5zaW9uVmVyc2lvbnMoYWN0dWFsLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9BUk02NCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnc29ydGluZyBtdWx0aXBsZSBleHRlbnNpb24gdmVyc2lvbnMgd2l0aCB0YXJnZXQgcGxhdGZvcm1zIC0gMScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSBbYUV4dGVuc2lvblZlcnNpb24oJzEuMi40JywgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX0FSTTY0KSwgYUV4dGVuc2lvblZlcnNpb24oJzEuMi40JywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfQVJNNjQpLCBhRXh0ZW5zaW9uVmVyc2lvbignMS4yLjQnLCBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9BUk02NCksIGFFeHRlbnNpb25WZXJzaW9uKCcxLjEuMycpLCBhRXh0ZW5zaW9uVmVyc2lvbignMS4xLjInKSwgYUV4dGVuc2lvblZlcnNpb24oJzEuMS4xJyldO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2FjdHVhbFsxXSwgYWN0dWFsWzBdLCBhY3R1YWxbMl0sIGFjdHVhbFszXSwgYWN0dWFsWzRdLCBhY3R1YWxbNV1dO1xuXHRcdHNvcnRFeHRlbnNpb25WZXJzaW9ucyhhY3R1YWwsIFRhcmdldFBsYXRmb3JtLldJTjMyX0FSTTY0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzb3J0aW5nIG11bHRpcGxlIGV4dGVuc2lvbiB2ZXJzaW9ucyB3aXRoIHRhcmdldCBwbGF0Zm9ybXMgLSAyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IFthRXh0ZW5zaW9uVmVyc2lvbignMS4yLjQnKSwgYUV4dGVuc2lvblZlcnNpb24oJzEuMi4zJywgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX0FSTTY0KSwgYUV4dGVuc2lvblZlcnNpb24oJzEuMi4zJywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfQVJNNjQpLCBhRXh0ZW5zaW9uVmVyc2lvbignMS4yLjMnLCBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9BUk02NCksIGFFeHRlbnNpb25WZXJzaW9uKCcxLjEuMicpLCBhRXh0ZW5zaW9uVmVyc2lvbignMS4xLjEnKV07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbYWN0dWFsWzBdLCBhY3R1YWxbM10sIGFjdHVhbFsxXSwgYWN0dWFsWzJdLCBhY3R1YWxbNF0sIGFjdHVhbFs1XV07XG5cdFx0c29ydEV4dGVuc2lvblZlcnNpb25zKGFjdHVhbCwgVGFyZ2V0UGxhdGZvcm0uTElOVVhfQVJNNjQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRpbmcgbXVsdGlwbGUgZXh0ZW5zaW9uIHZlcnNpb25zIHdpdGggdGFyZ2V0IHBsYXRmb3JtcyAtIDMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gW2FFeHRlbnNpb25WZXJzaW9uKCcxLjIuNCcpLCBhRXh0ZW5zaW9uVmVyc2lvbignMS4xLjInKSwgYUV4dGVuc2lvblZlcnNpb24oJzEuMS4xJyksIGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcsIFRhcmdldFBsYXRmb3JtLkRBUldJTl9BUk02NCksIGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcsIFRhcmdldFBsYXRmb3JtLldJTjMyX0FSTTY0KV07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbYWN0dWFsWzBdLCBhY3R1YWxbMV0sIGFjdHVhbFsyXSwgYWN0dWFsWzRdLCBhY3R1YWxbM11dO1xuXHRcdHNvcnRFeHRlbnNpb25WZXJzaW9ucyhhY3R1YWwsIFRhcmdldFBsYXRmb3JtLldJTjMyX0FSTTY0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBhRXh0ZW5zaW9uVmVyc2lvbih2ZXJzaW9uOiBzdHJpbmcsIHRhcmdldFBsYXRmb3JtPzogVGFyZ2V0UGxhdGZvcm0pOiBJUmF3R2FsbGVyeUV4dGVuc2lvblZlcnNpb24ge1xuXHRcdHJldHVybiB7IHZlcnNpb24sIHRhcmdldFBsYXRmb3JtIH0gYXMgSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uO1xuXHR9XG5cblx0ZnVuY3Rpb24gYVByZVJlbGVhc2VFeHRlbnNpb25WZXJzaW9uKHZlcnNpb246IHN0cmluZywgdGFyZ2V0UGxhdGZvcm0/OiBUYXJnZXRQbGF0Zm9ybSk6IElSYXdHYWxsZXJ5RXh0ZW5zaW9uVmVyc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHZlcnNpb24sXG5cdFx0XHR0YXJnZXRQbGF0Zm9ybSxcblx0XHRcdHByb3BlcnRpZXM6IFt7IGtleTogJ01pY3Jvc29mdC5WaXN1YWxTdHVkaW8uQ29kZS5QcmVSZWxlYXNlJywgdmFsdWU6ICd0cnVlJyB9XVxuXHRcdH0gYXMgSVJhd0dhbGxlcnlFeHRlbnNpb25WZXJzaW9uO1xuXHR9XG5cblx0c3VpdGUoJ2ZpbHRlckxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGVtcHR5IGFycmF5IGZvciBlbXB0eSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0oW10sIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgW1RhcmdldFBsYXRmb3JtLldJTjMyX1g2NF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gc2luZ2xlIHZlcnNpb24gd2hlbiBvbmx5IG9uZSB2ZXJzaW9uIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmVyc2lvbnMgPSBbYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0KV07XG5cdFx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBbVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0odmVyc2lvbnMsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgYWxsVGFyZ2V0UGxhdGZvcm1zKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB2ZXJzaW9ucyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBsYXRlc3QgcmVsZWFzZSBhbmQgbGF0ZXN0IHByZS1yZWxlYXNlIHZlcnNpb25zIGZvciBzYW1lIHBsYXRmb3JtJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVsZWFzZSA9IGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCk7XG5cdFx0XHRjb25zdCBwcmVyZWxlYXNlID0gYVByZVJlbGVhc2VFeHRlbnNpb25WZXJzaW9uKCcwLjkuMCcsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCk7XG5cdFx0XHRjb25zdCB2ZXJzaW9ucyA9IFtyZWxlYXNlLCBwcmVyZWxlYXNlXTtcblx0XHRcdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IFtUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKHZlcnNpb25zLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHRcdC8vIFNob3VsZCBpbmNsdWRlIGJvdGggc2luY2UgdGhleSBoYXZlIGRpZmZlcmVudCB2ZXJzaW9uIG51bWJlcnNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0sIHJlbGVhc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXSwgcHJlcmVsZWFzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBsYXRlc3QgcHJlcmVsZWFzZSBhbmQgbGF0ZXN0IHJlbGVhc2UgdmVyc2lvbnMgZm9yIHNhbWUgcGxhdGZvcm0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcmVyZWxlYXNlID0gYVByZVJlbGVhc2VFeHRlbnNpb25WZXJzaW9uKCcxLjEuMCcsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCk7XG5cdFx0XHRjb25zdCByZWxlYXNlID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0KTtcblx0XHRcdGNvbnN0IHZlcnNpb25zID0gW3ByZXJlbGVhc2UsIHJlbGVhc2VdO1xuXHRcdFx0Y29uc3QgYWxsVGFyZ2V0UGxhdGZvcm1zID0gW1RhcmdldFBsYXRmb3JtLldJTjMyX1g2NF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0odmVyc2lvbnMsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgYWxsVGFyZ2V0UGxhdGZvcm1zKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGluY2x1ZGUgYm90aCBzaW5jZSB0aGV5IGhhdmUgZGlmZmVyZW50IHZlcnNpb24gbnVtYmVyc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXSwgcHJlcmVsZWFzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLCByZWxlYXNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIG9uZSB2ZXJzaW9uIHBlciB0YXJnZXQgcGxhdGZvcm0gZm9yIHJlbGVhc2UgdmVyc2lvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2ZXJzaW9uMSA9IGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCk7XG5cdFx0XHRjb25zdCB2ZXJzaW9uMiA9IGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcsIFRhcmdldFBsYXRmb3JtLkRBUldJTl9YNjQpO1xuXHRcdFx0Y29uc3QgdmVyc2lvbjMgPSBhRXh0ZW5zaW9uVmVyc2lvbignMS4wLjAnLCBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9YNjQpO1xuXHRcdFx0Y29uc3QgdmVyc2lvbnMgPSBbdmVyc2lvbjEsIHZlcnNpb24yLCB2ZXJzaW9uM107XG5cdFx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBbVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0LCBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fWDY0LCBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9YNjRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKHZlcnNpb25zLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHRcdC8vIFNob3VsZCBpbmNsdWRlIGFsbCB0aHJlZSB2ZXJzaW9uczogV0lOMzJfWDY0IChjb21wYXRpYmxlLCBmaXJzdCBvZiB0eXBlKSArIERBUldJTl9YNjQgJiBMSU5VWF9YNjQgKG5vbi1jb21wYXRpYmxlKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyh2ZXJzaW9uMSkpOyAvLyBDb21wYXRpYmxlIHdpdGggdGFyZ2V0IHBsYXRmb3JtXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKHZlcnNpb24yKSk7IC8vIE5vbi1jb21wYXRpYmxlLCBpbmNsdWRlZFxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyh2ZXJzaW9uMykpOyAvLyBOb24tY29tcGF0aWJsZSwgaW5jbHVkZWRcblx0XHR9KTtcblxuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSB2ZXJzaW9ucyB3aXRob3V0IHRhcmdldCBwbGF0Zm9ybSAoVU5ERUZJTkVEKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHZlcnNpb24xID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJyk7IC8vIE5vIHRhcmdldCBwbGF0Zm9ybSBzcGVjaWZpZWRcblx0XHRcdGNvbnN0IHZlcnNpb24yID0gYUV4dGVuc2lvblZlcnNpb24oJzAuOS4wJyk7IC8vIE5vIHRhcmdldCBwbGF0Zm9ybSBzcGVjaWZpZWRcblx0XHRcdGNvbnN0IHZlcnNpb25zID0gW3ZlcnNpb24xLCB2ZXJzaW9uMl07XG5cdFx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBbVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTGF0ZXN0RXh0ZW5zaW9uVmVyc2lvbnNGb3JUYXJnZXRQbGF0Zm9ybSh2ZXJzaW9ucywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0LCBhbGxUYXJnZXRQbGF0Zm9ybXMpO1xuXG5cdFx0XHQvLyBTaG91bGQgb25seSBpbmNsdWRlIHRoZSBmaXJzdCB2ZXJzaW9uIHNpbmNlIHRoZXkgYm90aCBoYXZlIFVOREVGSU5FRCBwbGF0Zm9ybVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXSwgdmVyc2lvbjEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXhlZCByZWxlYXNlIGFuZCBwcmUtcmVsZWFzZSB2ZXJzaW9ucyBhY3Jvc3MgbXVsdGlwbGUgcGxhdGZvcm1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVsZWFzZVdpbiA9IGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCk7XG5cdFx0XHRjb25zdCByZWxlYXNlTWFjID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJywgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NCk7XG5cdFx0XHRjb25zdCBwcmVSZWxlYXNlV2luID0gYVByZVJlbGVhc2VFeHRlbnNpb25WZXJzaW9uKCcxLjEuMCcsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCk7XG5cdFx0XHRjb25zdCBwcmVSZWxlYXNlTWFjID0gYVByZVJlbGVhc2VFeHRlbnNpb25WZXJzaW9uKCcxLjEuMCcsIFRhcmdldFBsYXRmb3JtLkRBUldJTl9YNjQpO1xuXG5cdFx0XHRjb25zdCB2ZXJzaW9ucyA9IFtyZWxlYXNlV2luLCByZWxlYXNlTWFjLCBwcmVSZWxlYXNlV2luLCBwcmVSZWxlYXNlTWFjXTtcblx0XHRcdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IFtUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIFRhcmdldFBsYXRmb3JtLkRBUldJTl9YNjRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKHZlcnNpb25zLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHRcdC8vIFNob3VsZCBpbmNsdWRlOiBXSU4zMl9YNjQgY29tcGF0aWJsZSAocmVsZWFzZSArIHByZXJlbGVhc2UpICsgREFSV0lOX1g2NCBub24tY29tcGF0aWJsZSAoYWxsIHZlcnNpb25zKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhyZWxlYXNlV2luKSk7IC8vIENvbXBhdGlibGUgcmVsZWFzZVxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhyZWxlYXNlTWFjKSk7IC8vIE5vbi1jb21wYXRpYmxlLCBpbmNsdWRlZFxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhwcmVSZWxlYXNlV2luKSk7IC8vIENvbXBhdGlibGUgcHJlLXJlbGVhc2Vcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMocHJlUmVsZWFzZU1hYykpOyAvLyBOb24tY29tcGF0aWJsZSwgaW5jbHVkZWRcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY29tcGxleCBzY2VuYXJpbyB3aXRoIG11bHRpcGxlIHZlcnNpb25zIGFuZCBwbGF0Zm9ybXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2ZXJzaW9ucyA9IFtcblx0XHRcdFx0YUV4dGVuc2lvblZlcnNpb24oJzIuMC4wJywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0KSxcblx0XHRcdFx0YUV4dGVuc2lvblZlcnNpb24oJzIuMC4wJywgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NCksXG5cdFx0XHRcdGFQcmVSZWxlYXNlRXh0ZW5zaW9uVmVyc2lvbignMi4xLjAnLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQpLFxuXHRcdFx0XHRhUHJlUmVsZWFzZUV4dGVuc2lvblZlcnNpb24oJzIuMS4wJywgVGFyZ2V0UGxhdGZvcm0uTElOVVhfWDY0KSxcblx0XHRcdFx0YUV4dGVuc2lvblZlcnNpb24oJzIuMC4wJyksIC8vIE5vIHBsYXRmb3JtIHNwZWNpZmllZFxuXHRcdFx0XHRhUHJlUmVsZWFzZUV4dGVuc2lvblZlcnNpb24oJzIuMS4wJyksIC8vIFByZS1yZWxlYXNlLCBubyBwbGF0Zm9ybSBzcGVjaWZpZWRcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBbVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0LCBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fWDY0LCBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9YNjRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKHZlcnNpb25zLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHRcdC8vIEV4cGVjdGVkIGZvciBXSU4zMl9YNjQgdGFyZ2V0IHBsYXRmb3JtOlxuXHRcdFx0Ly8gLSBDb21wYXRpYmxlIChXSU4zMl9YNjQgKyBVTkRFRklORUQpOiByZWxlYXNlICgyLjAuMCBXSU4zMl9YNjQpIGFuZCBwcmUtcmVsZWFzZSAoMi4xLjAgV0lOMzJfWDY0KVxuXHRcdFx0Ly8gLSBOb24tY29tcGF0aWJsZTogREFSV0lOX1g2NCByZWxlYXNlLCBMSU5VWF9YNjQgcHJlLXJlbGVhc2Vcblx0XHRcdC8vIFRvdGFsOiA0IHZlcnNpb25zICgxIGNvbXBhdGlibGUgcmVsZWFzZSArIDEgY29tcGF0aWJsZSBwcmUtcmVsZWFzZSArIDIgbm9uLWNvbXBhdGlibGUpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgNCk7XG5cblx0XHRcdC8vIENoZWNrIHNwZWNpZmljIHZlcnNpb25zIGFyZSBpbmNsdWRlZFxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyh2ZXJzaW9uc1swXSkpOyAvLyAyLjAuMCBXSU4zMl9YNjQgKGNvbXBhdGlibGUgcmVsZWFzZSlcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXModmVyc2lvbnNbMV0pKTsgLy8gMi4wLjAgREFSV0lOX1g2NCAobm9uLWNvbXBhdGlibGUpXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKHZlcnNpb25zWzJdKSk7IC8vIDIuMS4wIFdJTjMyX1g2NCAoY29tcGF0aWJsZSBwcmUtcmVsZWFzZSlcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXModmVyc2lvbnNbM10pKTsgLy8gMi4xLjAgTElOVVhfWDY0IChub24tY29tcGF0aWJsZSlcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBrZWVwIG9ubHkgZmlyc3QgY29tcGF0aWJsZSB2ZXJzaW9uIHdoZW4gc3BlY2lmaWMgcGxhdGZvcm0gY29tZXMgYmVmb3JlIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdC8vIFRlc3QgaG93IFVOREVGSU5FRCBwbGF0Zm9ybSBpbnRlcmFjdHMgd2l0aCBzcGVjaWZpYyBwbGF0Zm9ybXNcblx0XHRcdGNvbnN0IHZlcnNpb25zID0gW1xuXHRcdFx0XHRhRXh0ZW5zaW9uVmVyc2lvbignMS4wLjAnLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQpLFxuXHRcdFx0XHRhRXh0ZW5zaW9uVmVyc2lvbignMS4wLjAnKSwgLy8gVU5ERUZJTkVEIHBsYXRmb3JtIC0gY29tcGF0aWJsZSB3aXRoIGFsbFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IFtUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIFRhcmdldFBsYXRmb3JtLkRBUldJTl9YNjRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKHZlcnNpb25zLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHRcdC8vIEJvdGggYXJlIGNvbXBhdGlibGUgd2l0aCBXSU4zMl9YNjQsIGZpcnN0IG9uZSBzaG91bGQgYmUgaW5jbHVkZWQgKHNwZWNpZmljIHBsYXRmb3JtIHByZWZlcnJlZClcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXModmVyc2lvbnNbMF0pKTsgLy8gV0lOMzJfWDY0IHNob3VsZCBiZSBpbmNsdWRlZCAoc3BlY2lmaWMgcGxhdGZvcm0pXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGhpZ2hlciB2ZXJzaW9uIHdpdGggc3BlY2lmaWMgcGxhdGZvcm0gdnMgbG93ZXIgdmVyc2lvbiB3aXRoIHVuaXZlcnNhbCBwbGF0Zm9ybScsICgpID0+IHtcblx0XHRcdC8vIFNjZW5hcmlvOiBuZXdlciB2ZXJzaW9uIGZvciBzcGVjaWZpYyBwbGF0Zm9ybSB2cyBvbGRlciB2ZXJzaW9uIHdpdGggdW5pdmVyc2FsIGNvbXBhdGliaWxpdHlcblx0XHRcdGNvbnN0IGhpZ2hlclZlcnNpb25TcGVjaWZpY1BsYXRmb3JtID0gYUV4dGVuc2lvblZlcnNpb24oJzIuMC4wJywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0KTtcblx0XHRcdGNvbnN0IGxvd2VyVmVyc2lvblVuaXZlcnNhbCA9IGFFeHRlbnNpb25WZXJzaW9uKCcxLjUuMCcpOyAvLyBVTkRFRklORUQvdW5pdmVyc2FsIHBsYXRmb3JtXG5cblx0XHRcdGNvbnN0IHZlcnNpb25zID0gW2hpZ2hlclZlcnNpb25TcGVjaWZpY1BsYXRmb3JtLCBsb3dlclZlcnNpb25Vbml2ZXJzYWxdO1xuXHRcdFx0Y29uc3QgYWxsVGFyZ2V0UGxhdGZvcm1zID0gW1RhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0odmVyc2lvbnMsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgYWxsVGFyZ2V0UGxhdGZvcm1zKTtcblxuXHRcdFx0Ly8gQm90aCBhcmUgY29tcGF0aWJsZSB3aXRoIFdJTjMyX1g2NCwgYnV0IG9ubHkgdGhlIGZpcnN0IHJlbGVhc2UgdmVyc2lvbiBzaG91bGQgYmUgaW5jbHVkZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoaGlnaGVyVmVyc2lvblNwZWNpZmljUGxhdGZvcm0pKTsgLy8gRmlyc3QgY29tcGF0aWJsZSByZWxlYXNlXG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcyhsb3dlclZlcnNpb25Vbml2ZXJzYWwpKTsgLy8gRmlsdGVyZWQgKHNlY29uZCBjb21wYXRpYmxlIHJlbGVhc2UpXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGhpZ2hlciB2ZXJzaW9uIHdpdGggdW5pdmVyc2FsIHBsYXRmb3JtIHZzIGxvd2VyIHZlcnNpb24gd2l0aCBzcGVjaWZpYyBwbGF0Zm9ybScsICgpID0+IHtcblx0XHRcdC8vIFNjZW5hcmlvOiBoaWdoZXIgdW5pdmVyc2FsIHZlcnNpb24gY29tZXMgZmlyc3QsIHRoZW4gbG93ZXIgcGxhdGZvcm0tc3BlY2lmaWMgdmVyc2lvblxuXHRcdFx0Y29uc3QgaGlnaGVyVmVyc2lvblVuaXZlcnNhbCA9IGFFeHRlbnNpb25WZXJzaW9uKCcyLjAuMCcpOyAvLyBVTkRFRklORUQvdW5pdmVyc2FsIHBsYXRmb3JtXG5cdFx0XHRjb25zdCBsb3dlclZlcnNpb25TcGVjaWZpY1BsYXRmb3JtID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0KTtcblxuXHRcdFx0Y29uc3QgdmVyc2lvbnMgPSBbaGlnaGVyVmVyc2lvblVuaXZlcnNhbCwgbG93ZXJWZXJzaW9uU3BlY2lmaWNQbGF0Zm9ybV07XG5cdFx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBbVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0LCBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fWDY0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTGF0ZXN0RXh0ZW5zaW9uVmVyc2lvbnNGb3JUYXJnZXRQbGF0Zm9ybSh2ZXJzaW9ucywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0LCBhbGxUYXJnZXRQbGF0Zm9ybXMpO1xuXG5cdFx0XHQvLyBCb3RoIGFyZSBjb21wYXRpYmxlIHdpdGggV0lOMzJfWDY0LCB0aGUgZmlyc3QgKGhpZ2hlcikgdmVyc2lvbiBzaG91bGQgYmUga2VwdFxuXHRcdFx0Ly8gUGxhdGZvcm0tc3BlY2lmaWMgdmVyc2lvbiBzaG91bGQgTk9UIHJlcGxhY2Ugc2luY2UgaXQgaGFzIGEgZGlmZmVyZW50IChsb3dlcikgdmVyc2lvbiBudW1iZXJcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoaGlnaGVyVmVyc2lvblVuaXZlcnNhbCkpOyAvLyBGaXJzdCBjb21wYXRpYmxlIHJlbGVhc2UgKGhpZ2hlciB2ZXJzaW9uKVxuXHRcdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaW5jbHVkZXMobG93ZXJWZXJzaW9uU3BlY2lmaWNQbGF0Zm9ybSkpOyAvLyBGaWx0ZXJlZCAobG93ZXIgdmVyc2lvbilcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgc3BlY2lmaWMgcGxhdGZvcm1zIHZzIHVuaXZlcnNhbCBwbGF0Zm9ybSB3aXRoIHZlcnNpb24gZGlmZmVyZW5jZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBDb21wbGV4IHNjZW5hcmlvIHdpdGggbXVsdGlwbGUgcGxhdGZvcm1zIGFuZCB1bml2ZXJzYWwgY29tcGF0aWJpbGl0eVxuXHRcdFx0Y29uc3QgdmVyc2lvbnMgPSBbXG5cdFx0XHRcdGFFeHRlbnNpb25WZXJzaW9uKCcyLjAuMCcsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCksICAgIC8vIEhpZ2hlc3QgdmVyc2lvbiwgc3BlY2lmaWMgcGxhdGZvcm1cblx0XHRcdFx0YUV4dGVuc2lvblZlcnNpb24oJzEuOS4wJywgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NCksICAvLyBMb3dlciB2ZXJzaW9uLCBkaWZmZXJlbnQgc3BlY2lmaWMgcGxhdGZvcm1cblx0XHRcdFx0YUV4dGVuc2lvblZlcnNpb24oJzEuOC4wJyksICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBMb3dlc3QgdmVyc2lvbiwgdW5pdmVyc2FsIHBsYXRmb3JtXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWxsVGFyZ2V0UGxhdGZvcm1zID0gW1RhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NCwgVGFyZ2V0UGxhdGZvcm0uTElOVVhfWDY0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTGF0ZXN0RXh0ZW5zaW9uVmVyc2lvbnNGb3JUYXJnZXRQbGF0Zm9ybSh2ZXJzaW9ucywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0LCBhbGxUYXJnZXRQbGF0Zm9ybXMpO1xuXG5cdFx0XHQvLyBTaG91bGQgaW5jbHVkZTpcblx0XHRcdC8vIC0gMi4wLjAgV0lOMzJfWDY0IChzcGVjaWZpYyB0YXJnZXQgcGxhdGZvcm0gbWF0Y2ggLSByZXBsYWNlcyBVTkRFRklORUQgaWYgaXQgY2FtZSBmaXJzdClcblx0XHRcdC8vIC0gMS45LjAgREFSV0lOX1g2NCAobm9uLWNvbXBhdGlibGUsIGluY2x1ZGVkKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyh2ZXJzaW9uc1swXSkpOyAvLyAyLjAuMCBXSU4zMl9YNjRcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXModmVyc2lvbnNbMV0pKTsgLy8gMS45LjAgREFSV0lOX1g2NFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgdW5pdmVyc2FsIHBsYXRmb3JtIHdoZW4gbm8gc3BlY2lmaWMgcGxhdGZvcm1zIGNvbmZsaWN0JywgKCkgPT4ge1xuXHRcdFx0Ly8gVGVzdCB3aGVyZSB1bml2ZXJzYWwgcGxhdGZvcm0gaXMgaW5jbHVkZWQgYmVjYXVzZSBubyBzcGVjaWZpYyBwbGF0Zm9ybXMgY29uZmxpY3Rcblx0XHRcdGNvbnN0IHVuaXZlcnNhbFZlcnNpb24gPSBhRXh0ZW5zaW9uVmVyc2lvbignMS4wLjAnKTsgLy8gVU5ERUZJTkVEL3VuaXZlcnNhbCBwbGF0Zm9ybVxuXHRcdFx0Y29uc3Qgc3BlY2lmaWNWZXJzaW9uID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJywgVGFyZ2V0UGxhdGZvcm0uTElOVVhfQVJNNjQpO1xuXG5cdFx0XHRjb25zdCB2ZXJzaW9ucyA9IFt1bml2ZXJzYWxWZXJzaW9uLCBzcGVjaWZpY1ZlcnNpb25dO1xuXHRcdFx0Y29uc3QgYWxsVGFyZ2V0UGxhdGZvcm1zID0gW1RhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NF07IC8vIE5vdGU6IExJTlVYX0FSTTY0IG5vdCBpbiB0YXJnZXQgcGxhdGZvcm1zXG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0odmVyc2lvbnMsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgYWxsVGFyZ2V0UGxhdGZvcm1zKTtcblxuXHRcdFx0Ly8gVW5pdmVyc2FsIGlzIGNvbXBhdGlibGUgd2l0aCBXSU4zMl9YNjQsIHNwZWNpZmljIHZlcnNpb24gaXMgbm90IGNvbXBhdGlibGVcblx0XHRcdC8vIFNvIHdlIHNob3VsZCBnZXQ6IHVuaXZlcnNhbCAoZmlyc3QgY29tcGF0aWJsZSByZWxlYXNlKSArIHNwZWNpZmljIChub24tY29tcGF0aWJsZSlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXModW5pdmVyc2FsVmVyc2lvbikpOyAvLyBDb21wYXRpYmxlIHdpdGggV0lOMzJfWDY0XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKHNwZWNpZmljVmVyc2lvbikpOyAvLyBOb24tY29tcGF0aWJsZSwgaW5jbHVkZWRcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGFsbCBub24tY29tcGF0aWJsZSBwbGF0Zm9ybSB2ZXJzaW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IHZlcnNpb24xID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0KTtcblx0XHRcdGNvbnN0IHZlcnNpb24yID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJywgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NCk7XG5cdFx0XHRjb25zdCB2ZXJzaW9uMyA9IGFQcmVSZWxlYXNlRXh0ZW5zaW9uVmVyc2lvbignMS4xLjAnLCBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9YNjQpO1xuXHRcdFx0Y29uc3QgdmVyc2lvbnMgPSBbdmVyc2lvbjEsIHZlcnNpb24yLCB2ZXJzaW9uM107XG5cdFx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBbVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0LCBUYXJnZXRQbGF0Zm9ybS5EQVJXSU5fWDY0LCBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9YNjRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKHZlcnNpb25zLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXModmVyc2lvbjIpKTsgLy8gTm9uLWNvbXBhdGlibGUsIGluY2x1ZGVkXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKHZlcnNpb24zKSk7IC8vIE5vbi1jb21wYXRpYmxlLCBpbmNsdWRlZFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByZWZlciBzcGVjaWZpYyB0YXJnZXQgcGxhdGZvcm0gb3ZlciB1bmRlZmluZWQgd2hlbiBzYW1lIHZlcnNpb24gZXhpc3RzIGZvciBib3RoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdW5kZWZpbmVkVmVyc2lvbiA9IGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcpOyAvLyBVTkRFRklORUQgcGxhdGZvcm0sIGFwcGVhcnMgZmlyc3Rcblx0XHRcdGNvbnN0IHNwZWNpZmljVmVyc2lvbiA9IGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCk7IC8vIFNwZWNpZmljIHBsYXRmb3JtLCBhcHBlYXJzIHNlY29uZFxuXG5cdFx0XHRjb25zdCB2ZXJzaW9ucyA9IFt1bmRlZmluZWRWZXJzaW9uLCBzcGVjaWZpY1ZlcnNpb25dO1xuXHRcdFx0Y29uc3QgYWxsVGFyZ2V0UGxhdGZvcm1zID0gW1RhcmdldFBsYXRmb3JtLldJTjMyX1g2NF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0odmVyc2lvbnMsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgYWxsVGFyZ2V0UGxhdGZvcm1zKTtcblxuXHRcdFx0Ly8gU2hvdWxkIHJldHVybiB0aGUgc3BlY2lmaWMgcGxhdGZvcm0gdmVyc2lvbiAoV0lOMzJfWDY0KSwgbm90IHRoZSB1bmRlZmluZWQgb25lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLCBzcGVjaWZpY1ZlcnNpb24pO1xuXHRcdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaW5jbHVkZXModW5kZWZpbmVkVmVyc2lvbikpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlcGxhY2UgdW5kZWZpbmVkIHByZS1yZWxlYXNlIHdpdGggc3BlY2lmaWMgcGxhdGZvcm0gcHJlLXJlbGVhc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1bmRlZmluZWRQcmVSZWxlYXNlID0gYVByZVJlbGVhc2VFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcpOyAvLyBVTkRFRklORUQgcGxhdGZvcm0gcHJlLXJlbGVhc2UsIGFwcGVhcnMgZmlyc3Rcblx0XHRcdGNvbnN0IHNwZWNpZmljUHJlUmVsZWFzZSA9IGFQcmVSZWxlYXNlRXh0ZW5zaW9uVmVyc2lvbignMS4wLjAnLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQpOyAvLyBTcGVjaWZpYyBwbGF0Zm9ybSBwcmUtcmVsZWFzZSwgYXBwZWFycyBzZWNvbmRcblxuXHRcdFx0Y29uc3QgdmVyc2lvbnMgPSBbdW5kZWZpbmVkUHJlUmVsZWFzZSwgc3BlY2lmaWNQcmVSZWxlYXNlXTtcblx0XHRcdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IFtUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKHZlcnNpb25zLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHRcdC8vIFNob3VsZCByZXR1cm4gdGhlIHNwZWNpZmljIHBsYXRmb3JtIHByZS1yZWxlYXNlLCBub3QgdGhlIHVuZGVmaW5lZCBvbmVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0sIHNwZWNpZmljUHJlUmVsZWFzZSk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcyh1bmRlZmluZWRQcmVSZWxlYXNlKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGV4cGxpY2l0IFVOSVZFUlNBTCBwbGF0Zm9ybScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVuaXZlcnNhbFZlcnNpb24gPSBhRXh0ZW5zaW9uVmVyc2lvbignMS4wLjAnLCBUYXJnZXRQbGF0Zm9ybS5VTklWRVJTQUwpO1xuXHRcdFx0Y29uc3Qgc3BlY2lmaWNWZXJzaW9uID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0KTtcblxuXHRcdFx0Y29uc3QgdmVyc2lvbnMgPSBbdW5pdmVyc2FsVmVyc2lvbiwgc3BlY2lmaWNWZXJzaW9uXTtcblx0XHRcdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IFtUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKHZlcnNpb25zLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHRcdC8vIFNob3VsZCByZXR1cm4gdGhlIHNwZWNpZmljIHBsYXRmb3JtIHZlcnNpb24sIG5vdCB0aGUgdW5pdmVyc2FsIG9uZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXSwgc3BlY2lmaWNWZXJzaW9uKTtcblx0XHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKHVuaXZlcnNhbFZlcnNpb24pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYm90aCByZWxlYXNlIGFuZCBwcmUtcmVsZWFzZSB3aXRoIHNhbWUgdmVyc2lvbiByZXBsYWNlbWVudCcsICgpID0+IHtcblx0XHRcdC8vIEJvdGggcmVsZWFzZSBhbmQgcHJlLXJlbGVhc2Ugd2l0aCB1bmRlZmluZWQgcGxhdGZvcm0sIHRoZW4gc3BlY2lmaWMgcGxhdGZvcm0gd2l0aCBzYW1lIHZlcnNpb25zXG5cdFx0XHQvLyBWZXJzaW9ucyBzb3J0ZWQgYnkgdmVyc2lvbiBkZXNjZW5kaW5nIChwcmUtcmVsZWFzZSAxLjEuMCwgcmVsZWFzZSAxLjAuMCwgdGhlbiBzYW1lIHZlcnNpb25zIHdpdGggc3BlY2lmaWMgcGxhdGZvcm0pXG5cdFx0XHRjb25zdCB1bmRlZmluZWRQcmVSZWxlYXNlID0gYVByZVJlbGVhc2VFeHRlbnNpb25WZXJzaW9uKCcxLjEuMCcpOyAvLyBVTkRFRklORUQgcHJlLXJlbGVhc2Vcblx0XHRcdGNvbnN0IHNwZWNpZmljUHJlUmVsZWFzZSA9IGFQcmVSZWxlYXNlRXh0ZW5zaW9uVmVyc2lvbignMS4xLjAnLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQpOyAvLyBTcGVjaWZpYyBwcmUtcmVsZWFzZSAoc2FtZSB2ZXJzaW9uKVxuXHRcdFx0Y29uc3QgdW5kZWZpbmVkUmVsZWFzZSA9IGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcpOyAvLyBVTkRFRklORUQgcmVsZWFzZVxuXHRcdFx0Y29uc3Qgc3BlY2lmaWNSZWxlYXNlID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0KTsgLy8gU3BlY2lmaWMgcmVsZWFzZSAoc2FtZSB2ZXJzaW9uKVxuXG5cdFx0XHRjb25zdCB2ZXJzaW9ucyA9IFt1bmRlZmluZWRQcmVSZWxlYXNlLCBzcGVjaWZpY1ByZVJlbGVhc2UsIHVuZGVmaW5lZFJlbGVhc2UsIHNwZWNpZmljUmVsZWFzZV07XG5cdFx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBbVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTGF0ZXN0RXh0ZW5zaW9uVmVyc2lvbnNGb3JUYXJnZXRQbGF0Zm9ybSh2ZXJzaW9ucywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0LCBhbGxUYXJnZXRQbGF0Zm9ybXMpO1xuXG5cdFx0XHQvLyBTaG91bGQgcmV0dXJuIGJvdGggc3BlY2lmaWMgcGxhdGZvcm0gdmVyc2lvbnMgKHRoZXkgcmVwbGFjZWQgdGhlIHVuZGVmaW5lZCBvbmVzKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhzcGVjaWZpY1JlbGVhc2UpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoc3BlY2lmaWNQcmVSZWxlYXNlKSk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcyh1bmRlZmluZWRSZWxlYXNlKSk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcyh1bmRlZmluZWRQcmVSZWxlYXNlKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJlcGxhY2Ugd2hlbiBzcGVjaWZpYyBwbGF0Zm9ybSBpcyBmb3IgZGlmZmVyZW50IHBsYXRmb3JtJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdW5kZWZpbmVkVmVyc2lvbiA9IGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcpOyAvLyBVTkRFRklORUQsIGNvbXBhdGlibGUgd2l0aCBXSU4zMl9YNjRcblx0XHRcdGNvbnN0IHNwZWNpZmljVmVyc2lvbkRhcndpbiA9IGFFeHRlbnNpb25WZXJzaW9uKCcxLjAuMCcsIFRhcmdldFBsYXRmb3JtLkRBUldJTl9YNjQpOyAvLyBTcGVjaWZpYyBmb3IgREFSV0lOLCBub3QgY29tcGF0aWJsZSB3aXRoIFdJTjMyX1g2NFxuXG5cdFx0XHRjb25zdCB2ZXJzaW9ucyA9IFt1bmRlZmluZWRWZXJzaW9uLCBzcGVjaWZpY1ZlcnNpb25EYXJ3aW5dO1xuXHRcdFx0Y29uc3QgYWxsVGFyZ2V0UGxhdGZvcm1zID0gW1RhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgVGFyZ2V0UGxhdGZvcm0uREFSV0lOX1g2NF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckxhdGVzdEV4dGVuc2lvblZlcnNpb25zRm9yVGFyZ2V0UGxhdGZvcm0odmVyc2lvbnMsIFRhcmdldFBsYXRmb3JtLldJTjMyX1g2NCwgYWxsVGFyZ2V0UGxhdGZvcm1zKTtcblxuXHRcdFx0Ly8gU2hvdWxkIHJldHVybiB1bmRlZmluZWQgdmVyc2lvbiAoY29tcGF0aWJsZSB3aXRoIFdJTjMyX1g2NCkgYW5kIHNwZWNpZmljIERBUldJTiB2ZXJzaW9uIChub24tY29tcGF0aWJsZSwgYWx3YXlzIGluY2x1ZGVkKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyh1bmRlZmluZWRWZXJzaW9uKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKHNwZWNpZmljVmVyc2lvbkRhcndpbikpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZXBsYWNlbWVudCB3aXRoIG5vbi1jb21wYXRpYmxlIHZlcnNpb25zIGluIGJldHdlZW4nLCAoKSA9PiB7XG5cdFx0XHQvLyBWZXJzaW9ucyBzb3J0ZWQgYnkgdmVyc2lvbiBkZXNjZW5kaW5nXG5cdFx0XHRjb25zdCB1bmRlZmluZWRWZXJzaW9uID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJyk7IC8vIFVOREVGSU5FRCwgY29tcGF0aWJsZSB3aXRoIFdJTjMyX1g2NFxuXHRcdFx0Y29uc3Qgc3BlY2lmaWNWZXJzaW9uID0gYUV4dGVuc2lvblZlcnNpb24oJzEuMC4wJywgVGFyZ2V0UGxhdGZvcm0uV0lOMzJfWDY0KTsgLy8gU3BlY2lmaWMgZm9yIFdJTjMyX1g2NCAoc2FtZSB2ZXJzaW9uKVxuXHRcdFx0Y29uc3Qgbm9uQ29tcGF0aWJsZVZlcnNpb24gPSBhRXh0ZW5zaW9uVmVyc2lvbignMC45LjAnLCBUYXJnZXRQbGF0Zm9ybS5MSU5VWF9BUk02NCk7IC8vIE5vbi1jb21wYXRpYmxlIHBsYXRmb3JtIChsb3dlciB2ZXJzaW9uKVxuXG5cdFx0XHRjb25zdCB2ZXJzaW9ucyA9IFt1bmRlZmluZWRWZXJzaW9uLCBzcGVjaWZpY1ZlcnNpb24sIG5vbkNvbXBhdGlibGVWZXJzaW9uXTtcblx0XHRcdGNvbnN0IGFsbFRhcmdldFBsYXRmb3JtcyA9IFtUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIFRhcmdldFBsYXRmb3JtLkRBUldJTl9YNjRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJMYXRlc3RFeHRlbnNpb25WZXJzaW9uc0ZvclRhcmdldFBsYXRmb3JtKHZlcnNpb25zLCBUYXJnZXRQbGF0Zm9ybS5XSU4zMl9YNjQsIGFsbFRhcmdldFBsYXRmb3Jtcyk7XG5cblx0XHRcdC8vIFNob3VsZCByZXR1cm4gc3BlY2lmaWMgV0lOMzJfWDY0IHZlcnNpb24gKHJlcGxhY2luZyB1bmRlZmluZWQgc2luY2Ugc2FtZSB2ZXJzaW9uKSBhbmQgbm9uLWNvbXBhdGlibGUgTElOVVhfQVJNNjQgdmVyc2lvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhzcGVjaWZpY1ZlcnNpb24pKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMobm9uQ29tcGF0aWJsZVZlcnNpb24pKTtcblx0XHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKHVuZGVmaW5lZFZlcnNpb24pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgdmVyc2lvbnMgZm9yIGxpbnV4LXg2NCB0YXJnZXQgcGxhdGZvcm0gd2l0aCBtaXhlZCB1bml2ZXJzYWwgYW5kIHBsYXRmb3JtLXNwZWNpZmljIHZlcnNpb25zJywgKCkgPT4ge1xuXHRcdFx0Ly8gRGF0YSBmcm9tIHJlYWwgZXh0ZW5zaW9uIHZlcnNpb25zIChzb3J0ZWQgYnkgdmVyc2lvbiBkZXNjZW5kaW5nLCBhcyByZXR1cm5lZCBieSBnYWxsZXJ5IEFQSSk6XG5cdFx0XHQvLyAwLjE1LjAgLSBwcmUtcmVsZWFzZSwgdW5pdmVyc2FsXG5cdFx0XHQvLyAwLjE0LjAgLSByZWxlYXNlLCB1bml2ZXJzYWxcblx0XHRcdC8vIDAuNi4wIC0gcmVsZWFzZSwgbGludXgteDY0XG5cdFx0XHQvLyAwLjUuMSAtIHByZS1yZWxlYXNlLCBsaW51eC14NjRcblx0XHRcdGNvbnN0IHZlcnNpb25zID0gW1xuXHRcdFx0XHRhUHJlUmVsZWFzZUV4dGVuc2lvblZlcnNpb24oJzAuMTUuMCcpLCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHByZS1yZWxlYXNlLCB1bml2ZXJzYWwgKGhpZ2hlc3QgdmVyc2lvbilcblx0XHRcdFx0YUV4dGVuc2lvblZlcnNpb24oJzAuMTQuMCcpLCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyByZWxlYXNlLCB1bml2ZXJzYWxcblx0XHRcdFx0YUV4dGVuc2lvblZlcnNpb24oJzAuNi4wJywgVGFyZ2V0UGxhdGZvcm0uTElOVVhfWDY0KSwgICAgICAgICAgICAgICAvLyByZWxlYXNlLCBsaW51eC14NjRcblx0XHRcdFx0YVByZVJlbGVhc2VFeHRlbnNpb25WZXJzaW9uKCcwLjUuMScsIFRhcmdldFBsYXRmb3JtLkxJTlVYX1g2NCksICAgICAvLyBwcmUtcmVsZWFzZSwgbGludXgteDY0IChsb3dlc3QgdmVyc2lvbilcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhbGxUYXJnZXRQbGF0Zm9ybXMgPSBbVGFyZ2V0UGxhdGZvcm0uTElOVVhfWDY0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyTGF0ZXN0RXh0ZW5zaW9uVmVyc2lvbnNGb3JUYXJnZXRQbGF0Zm9ybSh2ZXJzaW9ucywgVGFyZ2V0UGxhdGZvcm0uTElOVVhfWDY0LCBhbGxUYXJnZXRQbGF0Zm9ybXMpO1xuXG5cdFx0XHQvLyBFeHBlY3RlZDpcblx0XHRcdC8vIC0gMC4xNS4wIHVuaXZlcnNhbCAoZmlyc3QgY29tcGF0aWJsZSBwcmUtcmVsZWFzZSwgaGlnaGVyIHZlcnNpb24gdGhhbiAwLjUuMSBsaW51eC14NjQpXG5cdFx0XHQvLyAtIDAuMTQuMCB1bml2ZXJzYWwgKGZpcnN0IGNvbXBhdGlibGUgcmVsZWFzZSwgaGlnaGVyIHZlcnNpb24gdGhhbiAwLjYuMCBsaW51eC14NjQpXG5cdFx0XHQvLyBQbGF0Zm9ybS1zcGVjaWZpYyB2ZXJzaW9ucyBhcmUgTk9UIHByZWZlcnJlZCB3aGVuIHRoZXkgaGF2ZSBsb3dlciB2ZXJzaW9uIG51bWJlcnNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXModmVyc2lvbnNbMF0pKTsgLy8gMC4xNS4wIHVuaXZlcnNhbCAocHJlLXJlbGVhc2UpXG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKHZlcnNpb25zWzFdKSk7IC8vIDAuMTQuMCB1bml2ZXJzYWwgKHJlbGVhc2UpXG5cdFx0fSk7XG5cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFVBQVUsc0JBQXNCO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxjQUFjO0FBRXZCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlDQUFpQztBQUUxQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNCQUFzQjtBQUMvQixPQUFPLGFBQWE7QUFHcEIs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
