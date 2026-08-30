import * as sinon from "sinon";
import assert from "assert";
import * as uuid from "../../../../../base/common/uuid.js";
import {
  IExtensionGalleryService,
  IExtensionManagementService,
  IExtensionTipsService,
  getTargetPlatform
} from "../../../../../platform/extensionManagement/common/extensionManagement.js";
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from "../../../../services/extensionManagement/common/extensionManagement.js";
import { ExtensionGalleryService } from "../../../../../platform/extensionManagement/common/extensionGalleryService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { TestLifecycleService } from "../../../../test/browser/workbenchTestServices.js";
import { TestContextService, TestProductService, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { TestExtensionTipsService, TestSharedProcessService } from "../../../../test/electron-browser/workbenchTestServices.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { URI } from "../../../../../base/common/uri.js";
import { testWorkspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { getGalleryExtensionId } from "../../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { ConfigurationKey, IExtensionsWorkbenchService } from "../../common/extensions.js";
import { TestExtensionEnablementService } from "../../../../services/extensionManagement/test/browser/extensionEnablementService.test.js";
import { IURLService } from "../../../../../platform/url/common/url.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { NativeURLService } from "../../../../../platform/url/common/urlService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ExtensionType } from "../../../../../platform/extensions/common/extensions.js";
import { ISharedProcessService } from "../../../../../platform/ipc/electron-browser/services.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { NullLogService, ILogService } from "../../../../../platform/log/common/log.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ExtensionRecommendationsService } from "../../browser/extensionRecommendationsService.js";
import { NoOpWorkspaceTagsService } from "../../../tags/browser/workspaceTagsService.js";
import { IWorkspaceTagsService } from "../../../tags/common/workspaceTags.js";
import { ExtensionsWorkbenchService } from "../../browser/extensionsWorkbenchService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IWorkspaceExtensionsConfigService, WorkspaceExtensionsConfigService } from "../../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js";
import { IExtensionIgnoredRecommendationsService } from "../../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { ExtensionIgnoredRecommendationsService } from "../../../../services/extensionRecommendations/common/extensionIgnoredRecommendationsService.js";
import { IExtensionRecommendationNotificationService } from "../../../../../platform/extensionRecommendations/common/extensionRecommendations.js";
import { ExtensionRecommendationNotificationService } from "../../browser/extensionRecommendationNotificationService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { platform } from "../../../../../base/common/platform.js";
import { arch } from "../../../../../base/common/process.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { timeout } from "../../../../../base/common/async.js";
import { IUpdateService, State } from "../../../../../platform/update/common/update.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentityService.js";
import { IMeteredConnectionService } from "../../../../../platform/meteredConnection/common/meteredConnection.js";
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from "../../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
const ROOT = URI.file("tests").with({ scheme: "vscode-tests" });
const mockExtensionGallery = [
  aGalleryExtension("MockExtension1", {
    displayName: "Mock Extension 1",
    version: "1.5",
    publisherId: "mockPublisher1Id",
    publisher: "mockPublisher1",
    publisherDisplayName: "Mock Publisher 1",
    description: "Mock Description",
    installCount: 1e3,
    rating: 4,
    ratingCount: 100
  }, {
    dependencies: ["pub.1"]
  }, {
    manifest: { uri: "uri:manifest", fallbackUri: "fallback:manifest" },
    readme: { uri: "uri:readme", fallbackUri: "fallback:readme" },
    changelog: { uri: "uri:changelog", fallbackUri: "fallback:changlog" },
    download: { uri: "uri:download", fallbackUri: "fallback:download" },
    icon: { uri: "uri:icon", fallbackUri: "fallback:icon" },
    license: { uri: "uri:license", fallbackUri: "fallback:license" },
    repository: { uri: "uri:repository", fallbackUri: "fallback:repository" },
    signature: { uri: "uri:signature", fallbackUri: "fallback:signature" },
    coreTranslations: []
  }),
  aGalleryExtension("MockExtension2", {
    displayName: "Mock Extension 2",
    version: "1.5",
    publisherId: "mockPublisher2Id",
    publisher: "mockPublisher2",
    publisherDisplayName: "Mock Publisher 2",
    description: "Mock Description",
    installCount: 1e3,
    rating: 4,
    ratingCount: 100
  }, {
    dependencies: ["pub.1", "pub.2"]
  }, {
    manifest: { uri: "uri:manifest", fallbackUri: "fallback:manifest" },
    readme: { uri: "uri:readme", fallbackUri: "fallback:readme" },
    changelog: { uri: "uri:changelog", fallbackUri: "fallback:changlog" },
    download: { uri: "uri:download", fallbackUri: "fallback:download" },
    icon: { uri: "uri:icon", fallbackUri: "fallback:icon" },
    license: { uri: "uri:license", fallbackUri: "fallback:license" },
    repository: { uri: "uri:repository", fallbackUri: "fallback:repository" },
    signature: { uri: "uri:signature", fallbackUri: "fallback:signature" },
    coreTranslations: []
  })
];
const mockExtensionLocal = [
  {
    type: ExtensionType.User,
    identifier: mockExtensionGallery[0].identifier,
    manifest: {
      name: mockExtensionGallery[0].name,
      publisher: mockExtensionGallery[0].publisher,
      version: mockExtensionGallery[0].version
    },
    metadata: null,
    path: "somepath",
    readmeUrl: "some readmeUrl",
    changelogUrl: "some changelogUrl"
  },
  {
    type: ExtensionType.User,
    identifier: mockExtensionGallery[1].identifier,
    manifest: {
      name: mockExtensionGallery[1].name,
      publisher: mockExtensionGallery[1].publisher,
      version: mockExtensionGallery[1].version
    },
    metadata: null,
    path: "somepath",
    readmeUrl: "some readmeUrl",
    changelogUrl: "some changelogUrl"
  }
];
const mockTestData = {
  recommendedExtensions: [
    "mockPublisher1.mockExtension1",
    "MOCKPUBLISHER2.mockextension2",
    "badlyformattedextension",
    "MOCKPUBLISHER2.mockextension2",
    "unknown.extension"
  ],
  validRecommendedExtensions: [
    "mockPublisher1.mockExtension1",
    "MOCKPUBLISHER2.mockextension2"
  ]
};
function aPage(...objects) {
  return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null };
}
const noAssets = {
  changelog: null,
  download: null,
  icon: null,
  license: null,
  manifest: null,
  readme: null,
  repository: null,
  signature: null,
  coreTranslations: []
};
function aGalleryExtension(name, properties = {}, galleryExtensionProperties = {}, assets = noAssets) {
  const targetPlatform = getTargetPlatform(platform, arch);
  const galleryExtension = /* @__PURE__ */ Object.create({ name, publisher: "pub", version: "1.0.0", allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, ...properties });
  galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
  galleryExtension.assets = { ...galleryExtension.assets, ...assets };
  galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: uuid.generateUuid() };
  return galleryExtension;
}
suite("ExtensionRecommendationsService Test", () => {
  let disposableStore;
  let workspaceService;
  let instantiationService;
  let testConfigurationService;
  let testObject;
  let prompted;
  let promptedEmitter;
  let onModelAddedEvent;
  teardown(async () => {
    disposableStore.dispose();
    await timeout(0);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    disposableStore = new DisposableStore();
    instantiationService = disposableStore.add(new TestInstantiationService());
    promptedEmitter = disposableStore.add(new Emitter());
    instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
    instantiationService.stub(IExtensionGalleryManifestService, {
      onDidChangeExtensionGalleryManifest: Event.None,
      onDidChangeExtensionGalleryManifestStatus: Event.None,
      extensionGalleryManifestStatus: ExtensionGalleryManifestStatus.Unavailable,
      async getExtensionGalleryManifest() {
        return null;
      }
    });
    instantiationService.stub(ISharedProcessService, TestSharedProcessService);
    instantiationService.stub(ILifecycleService, disposableStore.add(new TestLifecycleService()));
    testConfigurationService = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, testConfigurationService);
    instantiationService.stub(IProductService, TestProductService);
    instantiationService.stub(ILogService, NullLogService);
    const fileService = new FileService(instantiationService.get(ILogService));
    instantiationService.stub(IFileService, disposableStore.add(fileService));
    const fileSystemProvider = disposableStore.add(new InMemoryFileSystemProvider());
    disposableStore.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));
    instantiationService.stub(IUriIdentityService, disposableStore.add(new UriIdentityService(instantiationService.get(IFileService))));
    instantiationService.stub(INotificationService, new TestNotificationService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IWorkbenchExtensionManagementService, {
      onInstallExtension: Event.None,
      onDidInstallExtensions: Event.None,
      onUninstallExtension: Event.None,
      onDidUninstallExtension: Event.None,
      onDidUpdateExtensionMetadata: Event.None,
      onDidChangeProfile: Event.None,
      onProfileAwareDidInstallExtensions: Event.None,
      async getInstalled() {
        return [];
      },
      async canInstall() {
        return true;
      },
      async getExtensionsControlManifest() {
        return { malicious: [], deprecated: {}, search: [], publisherMapping: {} };
      },
      async getTargetPlatform() {
        return getTargetPlatform(platform, arch);
      }
    });
    instantiationService.stub(IExtensionService, {
      onDidChangeExtensions: Event.None,
      extensions: [],
      async whenInstalledExtensionsRegistered() {
        return true;
      }
    });
    instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IURLService, NativeURLService);
    instantiationService.stub(IWorkspaceTagsService, new NoOpWorkspaceTagsService());
    instantiationService.stub(IStorageService, disposableStore.add(new TestStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IProductService, {
      extensionRecommendations: {
        "ms-python.python": {
          onFileOpen: [
            {
              "pathGlob": "{**/*.py}",
              important: true
            }
          ]
        },
        "ms-vscode.PowerShell": {
          onFileOpen: [
            {
              "pathGlob": "{**/*.ps,**/*.ps1}",
              important: true
            }
          ]
        },
        "ms-dotnettools.csharp": {
          onFileOpen: [
            {
              "pathGlob": "{**/*.cs,**/project.json,**/global.json,**/*.csproj,**/*.sln,**/appsettings.json}"
            }
          ]
        },
        "msjsdiag.debugger-for-chrome": {
          onFileOpen: [
            {
              "pathGlob": "{**/*.ts,**/*.tsx,**/*.js,**/*.jsx,**/*.es6,**/*.mjs,**/*.cjs,**/.babelrc}"
            }
          ]
        },
        "lukehoban.Go": {
          onFileOpen: [
            {
              "pathGlob": "**/*.go"
            }
          ]
        }
      }
    });
    instantiationService.stub(IUpdateService, { onStateChange: Event.None, state: State.Uninitialized });
    instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: Event.None });
    instantiationService.set(IExtensionsWorkbenchService, disposableStore.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
    instantiationService.stub(IExtensionTipsService, disposableStore.add(instantiationService.createInstance(TestExtensionTipsService)));
    onModelAddedEvent = new Emitter();
    instantiationService.stub(IEnvironmentService, {});
    instantiationService.stubPromise(IExtensionManagementService, "getInstalled", []);
    instantiationService.stub(IExtensionGalleryService, "isEnabled", true);
    instantiationService.stubPromise(IExtensionGalleryService, "query", aPage(...mockExtensionGallery));
    instantiationService.stubPromise(IExtensionGalleryService, "getExtensions", mockExtensionGallery);
    prompted = false;
    class TestNotificationService2 extends TestNotificationService {
      prompt(severity, message, choices, options) {
        prompted = true;
        promptedEmitter.fire();
        return super.prompt(severity, message, choices, options);
      }
    }
    instantiationService.stub(INotificationService, new TestNotificationService2());
    testConfigurationService.setUserConfiguration(ConfigurationKey, { ignoreRecommendations: false });
    instantiationService.stub(IModelService, {
      getModels() {
        return [];
      },
      onModelAdded: onModelAddedEvent.event
    });
  });
  function setUpFolderWorkspace(folderName, recommendedExtensions, ignoredRecommendations = []) {
    return setUpFolder(folderName, recommendedExtensions, ignoredRecommendations);
  }
  async function setUpFolder(folderName, recommendedExtensions, ignoredRecommendations = []) {
    const fileService = instantiationService.get(IFileService);
    const folderDir = joinPath(ROOT, folderName);
    const workspaceSettingsDir = joinPath(folderDir, ".vscode");
    await fileService.createFolder(workspaceSettingsDir);
    const configPath = joinPath(workspaceSettingsDir, "extensions.json");
    await fileService.writeFile(configPath, VSBuffer.fromString(JSON.stringify({
      "recommendations": recommendedExtensions,
      "unwantedRecommendations": ignoredRecommendations
    }, null, "	")));
    const myWorkspace = testWorkspace(folderDir);
    instantiationService.stub(IFileService, fileService);
    workspaceService = new TestContextService(myWorkspace);
    instantiationService.stub(IWorkspaceContextService, workspaceService);
    instantiationService.stub(IWorkspaceExtensionsConfigService, disposableStore.add(instantiationService.createInstance(WorkspaceExtensionsConfigService)));
    instantiationService.stub(IExtensionIgnoredRecommendationsService, disposableStore.add(instantiationService.createInstance(ExtensionIgnoredRecommendationsService)));
    instantiationService.stub(IExtensionRecommendationNotificationService, disposableStore.add(instantiationService.createInstance(ExtensionRecommendationNotificationService)));
  }
  function testNoPromptForValidRecommendations(recommendations) {
    return setUpFolderWorkspace("myFolder", recommendations).then(() => {
      testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
      return testObject.activationPromise.then(() => {
        assert.strictEqual(Object.keys(testObject.getAllRecommendationsWithReason()).length, recommendations.length);
        assert.ok(!prompted);
      });
    });
  }
  function testNoPromptOrRecommendationsForValidRecommendations(recommendations) {
    return setUpFolderWorkspace("myFolder", mockTestData.validRecommendedExtensions).then(() => {
      testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
      assert.ok(!prompted);
      return testObject.getWorkspaceRecommendations().then(() => {
        assert.strictEqual(Object.keys(testObject.getAllRecommendationsWithReason()).length, 0);
        assert.ok(!prompted);
      });
    });
  }
  test("ExtensionRecommendationsService: No Prompt for valid workspace recommendations when galleryService is absent", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const galleryQuerySpy = sinon.spy();
    instantiationService.stub(IExtensionGalleryService, { query: galleryQuerySpy, isEnabled: () => false });
    return testNoPromptOrRecommendationsForValidRecommendations(mockTestData.validRecommendedExtensions).then(() => assert.ok(galleryQuerySpy.notCalled));
  }));
  test("ExtensionRecommendationsService: No Prompt for valid workspace recommendations during extension development", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    instantiationService.stub(IEnvironmentService, { extensionDevelopmentLocationURI: [URI.file("/folder/file")], isExtensionDevelopment: true });
    return testNoPromptOrRecommendationsForValidRecommendations(mockTestData.validRecommendedExtensions);
  }));
  test("ExtensionRecommendationsService: No workspace recommendations or prompts when extensions.json has empty array", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    return testNoPromptForValidRecommendations([]);
  }));
  test("ExtensionRecommendationsService: Prompt for valid workspace recommendations", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await setUpFolderWorkspace("myFolder", mockTestData.recommendedExtensions);
    testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
    await Event.toPromise(promptedEmitter.event);
    const recommendations = Object.keys(testObject.getAllRecommendationsWithReason());
    const expected = [...mockTestData.validRecommendedExtensions, "unknown.extension"];
    assert.strictEqual(recommendations.length, expected.length);
    expected.forEach((x) => {
      assert.strictEqual(recommendations.indexOf(x.toLowerCase()) > -1, true);
    });
  }));
  test("ExtensionRecommendationsService: No Prompt for valid workspace recommendations if they are already installed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    instantiationService.stubPromise(IExtensionManagementService, "getInstalled", mockExtensionLocal);
    return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
  }));
  test("ExtensionRecommendationsService: No Prompt for valid workspace recommendations with casing mismatch if they are already installed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    instantiationService.stubPromise(IExtensionManagementService, "getInstalled", mockExtensionLocal);
    return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions.map((x) => x.toUpperCase()));
  }));
  test("ExtensionRecommendationsService: No Prompt for valid workspace recommendations if ignoreRecommendations is set", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    testConfigurationService.setUserConfiguration(ConfigurationKey, { ignoreRecommendations: true });
    return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
  }));
  test("ExtensionRecommendationsService: No Prompt for valid workspace recommendations if showRecommendationsOnlyOnDemand is set", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    testConfigurationService.setUserConfiguration(ConfigurationKey, { showRecommendationsOnlyOnDemand: true });
    return setUpFolderWorkspace("myFolder", mockTestData.validRecommendedExtensions).then(() => {
      testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
      return testObject.activationPromise.then(() => {
        assert.ok(!prompted);
      });
    });
  }));
  test("ExtensionRecommendationsService: No Prompt for valid workspace recommendations if ignoreRecommendations is set for current workspace", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    instantiationService.get(IStorageService).store("extensionsAssistant/workspaceRecommendationsIgnore", true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
  }));
  test("ExtensionRecommendationsService: No Recommendations of globally ignored recommendations", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    instantiationService.get(IStorageService).store("extensionsAssistant/workspaceRecommendationsIgnore", true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    instantiationService.get(IStorageService).store("extensionsAssistant/recommendations", '["ms-dotnettools.csharp", "ms-python.python", "ms-vscode.vscode-typescript-tslint-plugin"]', StorageScope.PROFILE, StorageTarget.MACHINE);
    instantiationService.get(IStorageService).store("extensionsAssistant/ignored_recommendations", '["ms-dotnettools.csharp", "mockpublisher2.mockextension2"]', StorageScope.PROFILE, StorageTarget.MACHINE);
    return setUpFolderWorkspace("myFolder", mockTestData.validRecommendedExtensions).then(() => {
      testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
      return testObject.activationPromise.then(() => {
        const recommendations = testObject.getAllRecommendationsWithReason();
        assert.ok(!recommendations["ms-dotnettools.csharp"]);
        assert.ok(recommendations["ms-python.python"]);
        assert.ok(recommendations["mockpublisher1.mockextension1"]);
        assert.ok(!recommendations["mockpublisher2.mockextension2"]);
      });
    });
  }));
  test("ExtensionRecommendationsService: No Recommendations of workspace ignored recommendations", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const ignoredRecommendations = ["ms-dotnettools.csharp", "mockpublisher2.mockextension2"];
    const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python"]';
    instantiationService.get(IStorageService).store("extensionsAssistant/workspaceRecommendationsIgnore", true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    instantiationService.get(IStorageService).store("extensionsAssistant/recommendations", storedRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);
    return setUpFolderWorkspace("myFolder", mockTestData.validRecommendedExtensions, ignoredRecommendations).then(() => {
      testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
      return testObject.activationPromise.then(() => {
        const recommendations = testObject.getAllRecommendationsWithReason();
        assert.ok(!recommendations["ms-dotnettools.csharp"]);
        assert.ok(recommendations["ms-python.python"]);
        assert.ok(recommendations["mockpublisher1.mockextension1"]);
        assert.ok(!recommendations["mockpublisher2.mockextension2"]);
      });
    });
  }));
  test("ExtensionRecommendationsService: Able to retrieve collection of all ignored recommendations", async () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = instantiationService.get(IStorageService);
    const workspaceIgnoredRecommendations = ["ms-dotnettools.csharp"];
    const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python"]';
    const globallyIgnoredRecommendations = '["mockpublisher2.mockextension2"]';
    storageService.store("extensionsAssistant/workspaceRecommendationsIgnore", true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    storageService.store("extensionsAssistant/recommendations", storedRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);
    storageService.store("extensionsAssistant/ignored_recommendations", globallyIgnoredRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);
    await setUpFolderWorkspace("myFolder", mockTestData.validRecommendedExtensions, workspaceIgnoredRecommendations);
    testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
    await testObject.activationPromise;
    const recommendations = testObject.getAllRecommendationsWithReason();
    assert.deepStrictEqual(Object.keys(recommendations), ["ms-python.python", "mockpublisher1.mockextension1"]);
  }));
  test("ExtensionRecommendationsService: Able to dynamically ignore/unignore global recommendations", async () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = instantiationService.get(IStorageService);
    const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python"]';
    const globallyIgnoredRecommendations = '["mockpublisher2.mockextension2"]';
    storageService.store("extensionsAssistant/workspaceRecommendationsIgnore", true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    storageService.store("extensionsAssistant/recommendations", storedRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);
    storageService.store("extensionsAssistant/ignored_recommendations", globallyIgnoredRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);
    await setUpFolderWorkspace("myFolder", mockTestData.validRecommendedExtensions);
    const extensionIgnoredRecommendationsService = instantiationService.get(IExtensionIgnoredRecommendationsService);
    testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
    await testObject.activationPromise;
    let recommendations = testObject.getAllRecommendationsWithReason();
    assert.ok(recommendations["ms-python.python"]);
    assert.ok(recommendations["mockpublisher1.mockextension1"]);
    assert.ok(!recommendations["mockpublisher2.mockextension2"]);
    extensionIgnoredRecommendationsService.toggleGlobalIgnoredRecommendation("mockpublisher1.mockextension1", true);
    recommendations = testObject.getAllRecommendationsWithReason();
    assert.ok(recommendations["ms-python.python"]);
    assert.ok(!recommendations["mockpublisher1.mockextension1"]);
    assert.ok(!recommendations["mockpublisher2.mockextension2"]);
    extensionIgnoredRecommendationsService.toggleGlobalIgnoredRecommendation("mockpublisher1.mockextension1", false);
    recommendations = testObject.getAllRecommendationsWithReason();
    assert.ok(recommendations["ms-python.python"]);
    assert.ok(recommendations["mockpublisher1.mockextension1"]);
    assert.ok(!recommendations["mockpublisher2.mockextension2"]);
  }));
  test("test global extensions are modified and recommendation change event is fired when an extension is ignored", async () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = instantiationService.get(IStorageService);
    const changeHandlerTarget = sinon.spy();
    const ignoredExtensionId = "Some.Extension";
    storageService.store("extensionsAssistant/workspaceRecommendationsIgnore", true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    storageService.store("extensionsAssistant/ignored_recommendations", '["ms-vscode.vscode"]', StorageScope.PROFILE, StorageTarget.MACHINE);
    await setUpFolderWorkspace("myFolder", []);
    testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
    const extensionIgnoredRecommendationsService = instantiationService.get(IExtensionIgnoredRecommendationsService);
    disposableStore.add(extensionIgnoredRecommendationsService.onDidChangeGlobalIgnoredRecommendation(changeHandlerTarget));
    extensionIgnoredRecommendationsService.toggleGlobalIgnoredRecommendation(ignoredExtensionId, true);
    await testObject.activationPromise;
    assert.ok(changeHandlerTarget.calledOnce);
    assert.ok(changeHandlerTarget.getCall(0).calledWithMatch({ extensionId: ignoredExtensionId.toLowerCase(), isRecommended: false }));
  }));
  test("ExtensionRecommendationsService: Get file based recommendations from storage (old format)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python", "ms-vscode.vscode-typescript-tslint-plugin"]';
    instantiationService.get(IStorageService).store("extensionsAssistant/recommendations", storedRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);
    return setUpFolderWorkspace("myFolder", []).then(() => {
      testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
      return testObject.activationPromise.then(() => {
        const recommendations = testObject.getFileBasedRecommendations();
        assert.strictEqual(recommendations.length, 2);
        assert.ok(recommendations.some((extensionId) => extensionId === "ms-dotnettools.csharp"));
        assert.ok(recommendations.some((extensionId) => extensionId === "ms-python.python"));
        assert.ok(recommendations.every((extensionId) => extensionId !== "ms-vscode.vscode-typescript-tslint-plugin"));
      });
    });
  }));
  test("ExtensionRecommendationsService: Get file based recommendations from storage (new format)", async () => {
    const milliSecondsInADay = 1e3 * 60 * 60 * 24;
    const now = Date.now();
    const tenDaysOld = 10 * milliSecondsInADay;
    const storedRecommendations = `{"ms-dotnettools.csharp": ${now}, "ms-python.python": ${now}, "ms-vscode.vscode-typescript-tslint-plugin": ${now}, "lukehoban.Go": ${tenDaysOld}}`;
    instantiationService.get(IStorageService).store("extensionsAssistant/recommendations", storedRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);
    await setUpFolderWorkspace("myFolder", []);
    testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
    await testObject.activationPromise;
    const recommendations = testObject.getFileBasedRecommendations();
    assert.strictEqual(recommendations.length, 2);
    assert.ok(recommendations.some((extensionId) => extensionId === "ms-dotnettools.csharp"));
    assert.ok(recommendations.some((extensionId) => extensionId === "ms-python.python"));
    assert.ok(recommendations.every((extensionId) => extensionId !== "ms-vscode.vscode-typescript-tslint-plugin"));
    assert.ok(recommendations.every((extensionId) => extensionId !== "lukehoban.Go"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHV1aWQgZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQge1xuXHRJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXRzLCBJR2FsbGVyeUV4dGVuc2lvbiwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJRXh0ZW5zaW9uVGlwc1NlcnZpY2UsIGdldFRhcmdldFBsYXRmb3JtLFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25HYWxsZXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVGVzdExpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdEV4dGVuc2lvblRpcHNTZXJ2aWNlLCBUZXN0U2hhcmVkUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHRlc3RXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvdGVzdC9jb21tb24vdGVzdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGFnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYWdpbmcuanMnO1xuaW1wb3J0IHsgZ2V0R2FsbGVyeUV4dGVuc2lvbklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uS2V5LCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0RXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L3Rlc3QvYnJvd3Nlci9leHRlbnNpb25FbmFibGVtZW50U2VydmljZS50ZXN0LmpzJztcbmltcG9ydCB7IElVUkxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi91cmwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHksIElQcm9tcHRDaG9pY2UsIElQcm9tcHRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgTmF0aXZlVVJMU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVNoYXJlZFByb2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaXBjL2VsZWN0cm9uLWJyb3dzZXIvc2VydmljZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UsIElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2V4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm9PcFdvcmtzcGFjZVRhZ3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGFncy9icm93c2VyL3dvcmtzcGFjZVRhZ3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUYWdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3RhZ3MvY29tbW9uL3dvcmtzcGFjZVRhZ3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UsIFdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi93b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9leHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBwbGF0Zm9ybSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGFyY2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UsIFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tZXRlcmVkQ29ubmVjdGlvbi9jb21tb24vbWV0ZXJlZENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLCBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5qcyc7XG5cbmNvbnN0IFJPT1QgPSBVUkkuZmlsZSgndGVzdHMnKS53aXRoKHsgc2NoZW1lOiAndnNjb2RlLXRlc3RzJyB9KTtcblxuY29uc3QgbW9ja0V4dGVuc2lvbkdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uW10gPSBbXG5cdGFHYWxsZXJ5RXh0ZW5zaW9uKCdNb2NrRXh0ZW5zaW9uMScsIHtcblx0XHRkaXNwbGF5TmFtZTogJ01vY2sgRXh0ZW5zaW9uIDEnLFxuXHRcdHZlcnNpb246ICcxLjUnLFxuXHRcdHB1Ymxpc2hlcklkOiAnbW9ja1B1Ymxpc2hlcjFJZCcsXG5cdFx0cHVibGlzaGVyOiAnbW9ja1B1Ymxpc2hlcjEnLFxuXHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiAnTW9jayBQdWJsaXNoZXIgMScsXG5cdFx0ZGVzY3JpcHRpb246ICdNb2NrIERlc2NyaXB0aW9uJyxcblx0XHRpbnN0YWxsQ291bnQ6IDEwMDAsXG5cdFx0cmF0aW5nOiA0LFxuXHRcdHJhdGluZ0NvdW50OiAxMDBcblx0fSwge1xuXHRcdGRlcGVuZGVuY2llczogWydwdWIuMSddLFxuXHR9LCB7XG5cdFx0bWFuaWZlc3Q6IHsgdXJpOiAndXJpOm1hbmlmZXN0JywgZmFsbGJhY2tVcmk6ICdmYWxsYmFjazptYW5pZmVzdCcgfSxcblx0XHRyZWFkbWU6IHsgdXJpOiAndXJpOnJlYWRtZScsIGZhbGxiYWNrVXJpOiAnZmFsbGJhY2s6cmVhZG1lJyB9LFxuXHRcdGNoYW5nZWxvZzogeyB1cmk6ICd1cmk6Y2hhbmdlbG9nJywgZmFsbGJhY2tVcmk6ICdmYWxsYmFjazpjaGFuZ2xvZycgfSxcblx0XHRkb3dubG9hZDogeyB1cmk6ICd1cmk6ZG93bmxvYWQnLCBmYWxsYmFja1VyaTogJ2ZhbGxiYWNrOmRvd25sb2FkJyB9LFxuXHRcdGljb246IHsgdXJpOiAndXJpOmljb24nLCBmYWxsYmFja1VyaTogJ2ZhbGxiYWNrOmljb24nIH0sXG5cdFx0bGljZW5zZTogeyB1cmk6ICd1cmk6bGljZW5zZScsIGZhbGxiYWNrVXJpOiAnZmFsbGJhY2s6bGljZW5zZScgfSxcblx0XHRyZXBvc2l0b3J5OiB7IHVyaTogJ3VyaTpyZXBvc2l0b3J5JywgZmFsbGJhY2tVcmk6ICdmYWxsYmFjazpyZXBvc2l0b3J5JyB9LFxuXHRcdHNpZ25hdHVyZTogeyB1cmk6ICd1cmk6c2lnbmF0dXJlJywgZmFsbGJhY2tVcmk6ICdmYWxsYmFjazpzaWduYXR1cmUnIH0sXG5cdFx0Y29yZVRyYW5zbGF0aW9uczogW11cblx0fSksXG5cdGFHYWxsZXJ5RXh0ZW5zaW9uKCdNb2NrRXh0ZW5zaW9uMicsIHtcblx0XHRkaXNwbGF5TmFtZTogJ01vY2sgRXh0ZW5zaW9uIDInLFxuXHRcdHZlcnNpb246ICcxLjUnLFxuXHRcdHB1Ymxpc2hlcklkOiAnbW9ja1B1Ymxpc2hlcjJJZCcsXG5cdFx0cHVibGlzaGVyOiAnbW9ja1B1Ymxpc2hlcjInLFxuXHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiAnTW9jayBQdWJsaXNoZXIgMicsXG5cdFx0ZGVzY3JpcHRpb246ICdNb2NrIERlc2NyaXB0aW9uJyxcblx0XHRpbnN0YWxsQ291bnQ6IDEwMDAsXG5cdFx0cmF0aW5nOiA0LFxuXHRcdHJhdGluZ0NvdW50OiAxMDBcblx0fSwge1xuXHRcdGRlcGVuZGVuY2llczogWydwdWIuMScsICdwdWIuMiddLFxuXHR9LCB7XG5cdFx0bWFuaWZlc3Q6IHsgdXJpOiAndXJpOm1hbmlmZXN0JywgZmFsbGJhY2tVcmk6ICdmYWxsYmFjazptYW5pZmVzdCcgfSxcblx0XHRyZWFkbWU6IHsgdXJpOiAndXJpOnJlYWRtZScsIGZhbGxiYWNrVXJpOiAnZmFsbGJhY2s6cmVhZG1lJyB9LFxuXHRcdGNoYW5nZWxvZzogeyB1cmk6ICd1cmk6Y2hhbmdlbG9nJywgZmFsbGJhY2tVcmk6ICdmYWxsYmFjazpjaGFuZ2xvZycgfSxcblx0XHRkb3dubG9hZDogeyB1cmk6ICd1cmk6ZG93bmxvYWQnLCBmYWxsYmFja1VyaTogJ2ZhbGxiYWNrOmRvd25sb2FkJyB9LFxuXHRcdGljb246IHsgdXJpOiAndXJpOmljb24nLCBmYWxsYmFja1VyaTogJ2ZhbGxiYWNrOmljb24nIH0sXG5cdFx0bGljZW5zZTogeyB1cmk6ICd1cmk6bGljZW5zZScsIGZhbGxiYWNrVXJpOiAnZmFsbGJhY2s6bGljZW5zZScgfSxcblx0XHRyZXBvc2l0b3J5OiB7IHVyaTogJ3VyaTpyZXBvc2l0b3J5JywgZmFsbGJhY2tVcmk6ICdmYWxsYmFjazpyZXBvc2l0b3J5JyB9LFxuXHRcdHNpZ25hdHVyZTogeyB1cmk6ICd1cmk6c2lnbmF0dXJlJywgZmFsbGJhY2tVcmk6ICdmYWxsYmFjazpzaWduYXR1cmUnIH0sXG5cdFx0Y29yZVRyYW5zbGF0aW9uczogW11cblx0fSlcbl07XG5cbmNvbnN0IG1vY2tFeHRlbnNpb25Mb2NhbCA9IFtcblx0e1xuXHRcdHR5cGU6IEV4dGVuc2lvblR5cGUuVXNlcixcblx0XHRpZGVudGlmaWVyOiBtb2NrRXh0ZW5zaW9uR2FsbGVyeVswXS5pZGVudGlmaWVyLFxuXHRcdG1hbmlmZXN0OiB7XG5cdFx0XHRuYW1lOiBtb2NrRXh0ZW5zaW9uR2FsbGVyeVswXS5uYW1lLFxuXHRcdFx0cHVibGlzaGVyOiBtb2NrRXh0ZW5zaW9uR2FsbGVyeVswXS5wdWJsaXNoZXIsXG5cdFx0XHR2ZXJzaW9uOiBtb2NrRXh0ZW5zaW9uR2FsbGVyeVswXS52ZXJzaW9uXG5cdFx0fSxcblx0XHRtZXRhZGF0YTogbnVsbCxcblx0XHRwYXRoOiAnc29tZXBhdGgnLFxuXHRcdHJlYWRtZVVybDogJ3NvbWUgcmVhZG1lVXJsJyxcblx0XHRjaGFuZ2Vsb2dVcmw6ICdzb21lIGNoYW5nZWxvZ1VybCdcblx0fSxcblx0e1xuXHRcdHR5cGU6IEV4dGVuc2lvblR5cGUuVXNlcixcblx0XHRpZGVudGlmaWVyOiBtb2NrRXh0ZW5zaW9uR2FsbGVyeVsxXS5pZGVudGlmaWVyLFxuXHRcdG1hbmlmZXN0OiB7XG5cdFx0XHRuYW1lOiBtb2NrRXh0ZW5zaW9uR2FsbGVyeVsxXS5uYW1lLFxuXHRcdFx0cHVibGlzaGVyOiBtb2NrRXh0ZW5zaW9uR2FsbGVyeVsxXS5wdWJsaXNoZXIsXG5cdFx0XHR2ZXJzaW9uOiBtb2NrRXh0ZW5zaW9uR2FsbGVyeVsxXS52ZXJzaW9uXG5cdFx0fSxcblx0XHRtZXRhZGF0YTogbnVsbCxcblx0XHRwYXRoOiAnc29tZXBhdGgnLFxuXHRcdHJlYWRtZVVybDogJ3NvbWUgcmVhZG1lVXJsJyxcblx0XHRjaGFuZ2Vsb2dVcmw6ICdzb21lIGNoYW5nZWxvZ1VybCdcblx0fVxuXTtcblxuY29uc3QgbW9ja1Rlc3REYXRhID0ge1xuXHRyZWNvbW1lbmRlZEV4dGVuc2lvbnM6IFtcblx0XHQnbW9ja1B1Ymxpc2hlcjEubW9ja0V4dGVuc2lvbjEnLFxuXHRcdCdNT0NLUFVCTElTSEVSMi5tb2NrZXh0ZW5zaW9uMicsXG5cdFx0J2JhZGx5Zm9ybWF0dGVkZXh0ZW5zaW9uJyxcblx0XHQnTU9DS1BVQkxJU0hFUjIubW9ja2V4dGVuc2lvbjInLFxuXHRcdCd1bmtub3duLmV4dGVuc2lvbidcblx0XSxcblx0dmFsaWRSZWNvbW1lbmRlZEV4dGVuc2lvbnM6IFtcblx0XHQnbW9ja1B1Ymxpc2hlcjEubW9ja0V4dGVuc2lvbjEnLFxuXHRcdCdNT0NLUFVCTElTSEVSMi5tb2NrZXh0ZW5zaW9uMidcblx0XVxufTtcblxuZnVuY3Rpb24gYVBhZ2U8VD4oLi4ub2JqZWN0czogVFtdKTogSVBhZ2VyPFQ+IHtcblx0cmV0dXJuIHsgZmlyc3RQYWdlOiBvYmplY3RzLCB0b3RhbDogb2JqZWN0cy5sZW5ndGgsIHBhZ2VTaXplOiBvYmplY3RzLmxlbmd0aCwgZ2V0UGFnZTogKCkgPT4gbnVsbCEgfTtcbn1cblxuY29uc3Qgbm9Bc3NldHM6IElHYWxsZXJ5RXh0ZW5zaW9uQXNzZXRzID0ge1xuXHRjaGFuZ2Vsb2c6IG51bGwsXG5cdGRvd25sb2FkOiBudWxsISxcblx0aWNvbjogbnVsbCEsXG5cdGxpY2Vuc2U6IG51bGwsXG5cdG1hbmlmZXN0OiBudWxsLFxuXHRyZWFkbWU6IG51bGwsXG5cdHJlcG9zaXRvcnk6IG51bGwsXG5cdHNpZ25hdHVyZTogbnVsbCxcblx0Y29yZVRyYW5zbGF0aW9uczogW11cbn07XG5cbmZ1bmN0aW9uIGFHYWxsZXJ5RXh0ZW5zaW9uKG5hbWU6IHN0cmluZywgcHJvcGVydGllczogYW55ID0ge30sIGdhbGxlcnlFeHRlbnNpb25Qcm9wZXJ0aWVzOiBhbnkgPSB7fSwgYXNzZXRzOiBJR2FsbGVyeUV4dGVuc2lvbkFzc2V0cyA9IG5vQXNzZXRzKTogSUdhbGxlcnlFeHRlbnNpb24ge1xuXHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IGdldFRhcmdldFBsYXRmb3JtKHBsYXRmb3JtLCBhcmNoKTtcblx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbiA9IDxJR2FsbGVyeUV4dGVuc2lvbj5PYmplY3QuY3JlYXRlKHsgbmFtZSwgcHVibGlzaGVyOiAncHViJywgdmVyc2lvbjogJzEuMC4wJywgYWxsVGFyZ2V0UGxhdGZvcm1zOiBbdGFyZ2V0UGxhdGZvcm1dLCBwcm9wZXJ0aWVzOiB7fSwgYXNzZXRzOiB7fSwgLi4ucHJvcGVydGllcyB9KTtcblx0Z2FsbGVyeUV4dGVuc2lvbi5wcm9wZXJ0aWVzID0geyAuLi5nYWxsZXJ5RXh0ZW5zaW9uLnByb3BlcnRpZXMsIGRlcGVuZGVuY2llczogW10sIHRhcmdldFBsYXRmb3JtLCAuLi5nYWxsZXJ5RXh0ZW5zaW9uUHJvcGVydGllcyB9O1xuXHRnYWxsZXJ5RXh0ZW5zaW9uLmFzc2V0cyA9IHsgLi4uZ2FsbGVyeUV4dGVuc2lvbi5hc3NldHMsIC4uLmFzc2V0cyB9O1xuXHRnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIgPSB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQoZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIsIGdhbGxlcnlFeHRlbnNpb24ubmFtZSksIHV1aWQ6IHV1aWQuZ2VuZXJhdGVVdWlkKCkgfTtcblx0cmV0dXJuIDxJR2FsbGVyeUV4dGVuc2lvbj5nYWxsZXJ5RXh0ZW5zaW9uO1xufVxuXG5zdWl0ZSgnRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSBUZXN0JywgKCkgPT4ge1xuXHRsZXQgZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCB3b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCB0ZXN0T2JqZWN0OiBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlO1xuXHRsZXQgcHJvbXB0ZWQ6IGJvb2xlYW47XG5cdGxldCBwcm9tcHRlZEVtaXR0ZXI6IEVtaXR0ZXI8dm9pZD47XG5cdGxldCBvbk1vZGVsQWRkZWRFdmVudDogRW1pdHRlcjxJVGV4dE1vZGVsPjtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApOyAvLyBhbGxvdyBmb3IgYXN5bmMgZGlzcG9zYWJsZXMgdG8gY29tcGxldGVcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRwcm9tcHRlZEVtaXR0ZXIgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBFeHRlbnNpb25HYWxsZXJ5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSwge1xuXHRcdFx0b25EaWRDaGFuZ2VFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZENoYW5nZUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1czogRXZlbnQuTm9uZSxcblx0XHRcdGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1czogRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLlVuYXZhaWxhYmxlLFxuXHRcdFx0YXN5bmMgZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNoYXJlZFByb2Nlc3NTZXJ2aWNlLCBUZXN0U2hhcmVkUHJvY2Vzc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIHRlc3RDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZHVjdFNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IEZpbGVTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTG9nU2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBkaXNwb3NhYmxlU3RvcmUuYWRkKGZpbGVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZmlsZVN5c3RlbVByb3ZpZGVyID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFJPT1Quc2NoZW1lLCBmaWxlU3lzdGVtUHJvdmlkZXIpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFVyaUlkZW50aXR5U2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCBuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIHtcblx0XHRcdG9uSW5zdGFsbEV4dGVuc2lvbjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkSW5zdGFsbEV4dGVuc2lvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvblVuaW5zdGFsbEV4dGVuc2lvbjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQ2hhbmdlUHJvZmlsZTogRXZlbnQuTm9uZSxcblx0XHRcdG9uUHJvZmlsZUF3YXJlRGlkSW5zdGFsbEV4dGVuc2lvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRhc3luYyBnZXRJbnN0YWxsZWQoKSB7IHJldHVybiBbXTsgfSxcblx0XHRcdGFzeW5jIGNhbkluc3RhbGwoKSB7IHJldHVybiB0cnVlOyB9LFxuXHRcdFx0YXN5bmMgZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpIHsgcmV0dXJuIHsgbWFsaWNpb3VzOiBbXSwgZGVwcmVjYXRlZDoge30sIHNlYXJjaDogW10sIHB1Ymxpc2hlck1hcHBpbmc6IHt9IH07IH0sXG5cdFx0XHRhc3luYyBnZXRUYXJnZXRQbGF0Zm9ybSgpIHsgcmV0dXJuIGdldFRhcmdldFBsYXRmb3JtKHBsYXRmb3JtLCBhcmNoKTsgfSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25TZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZENoYW5nZUV4dGVuc2lvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRleHRlbnNpb25zOiBbXSxcblx0XHRcdGFzeW5jIHdoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpIHsgcmV0dXJuIHRydWU7IH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVGVzdEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVUkxTZXJ2aWNlLCBOYXRpdmVVUkxTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUYWdzU2VydmljZSwgbmV3IE5vT3BXb3Jrc3BhY2VUYWdzU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZHVjdFNlcnZpY2UsIHtcblx0XHRcdGV4dGVuc2lvblJlY29tbWVuZGF0aW9uczoge1xuXHRcdFx0XHQnbXMtcHl0aG9uLnB5dGhvbic6IHtcblx0XHRcdFx0XHRvbkZpbGVPcGVuOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCdwYXRoR2xvYic6ICd7KiovKi5weX0nLFxuXHRcdFx0XHRcdFx0XHRpbXBvcnRhbnQ6IHRydWVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdtcy12c2NvZGUuUG93ZXJTaGVsbCc6IHtcblx0XHRcdFx0XHRvbkZpbGVPcGVuOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCdwYXRoR2xvYic6ICd7KiovKi5wcywqKi8qLnBzMX0nLFxuXHRcdFx0XHRcdFx0XHRpbXBvcnRhbnQ6IHRydWVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdtcy1kb3RuZXR0b29scy5jc2hhcnAnOiB7XG5cdFx0XHRcdFx0b25GaWxlT3BlbjogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQncGF0aEdsb2InOiAneyoqLyouY3MsKiovcHJvamVjdC5qc29uLCoqL2dsb2JhbC5qc29uLCoqLyouY3Nwcm9qLCoqLyouc2xuLCoqL2FwcHNldHRpbmdzLmpzb259Jyxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdtc2pzZGlhZy5kZWJ1Z2dlci1mb3ItY2hyb21lJzoge1xuXHRcdFx0XHRcdG9uRmlsZU9wZW46IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0J3BhdGhHbG9iJzogJ3sqKi8qLnRzLCoqLyoudHN4LCoqLyouanMsKiovKi5qc3gsKiovKi5lczYsKiovKi5tanMsKiovKi5janMsKiovLmJhYmVscmN9Jyxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdsdWtlaG9iYW4uR28nOiB7XG5cdFx0XHRcdFx0b25GaWxlT3BlbjogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQncGF0aEdsb2InOiAnKiovKi5nbycsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXBkYXRlU2VydmljZSwgeyBvblN0YXRlQ2hhbmdlOiBFdmVudC5Ob25lLCBzdGF0ZTogU3RhdGUuVW5pbml0aWFsaXplZCB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UsIHsgaXNDb25uZWN0aW9uTWV0ZXJlZDogZmFsc2UsIG9uRGlkQ2hhbmdlSXNDb25uZWN0aW9uTWV0ZXJlZDogRXZlbnQuTm9uZSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvblRpcHNTZXJ2aWNlLCBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RFeHRlbnNpb25UaXBzU2VydmljZSkpKTtcblxuXHRcdG9uTW9kZWxBZGRlZEV2ZW50ID0gbmV3IEVtaXR0ZXI8SVRleHRNb2RlbD4oKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVudmlyb25tZW50U2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJQcm9taXNlKElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgJ2dldEluc3RhbGxlZCcsIFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgJ2lzRW5hYmxlZCcsIHRydWUpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJQcm9taXNlKElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgJ3F1ZXJ5JywgYVBhZ2U8SUdhbGxlcnlFeHRlbnNpb24+KC4uLm1vY2tFeHRlbnNpb25HYWxsZXJ5KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YlByb21pc2UoSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCAnZ2V0RXh0ZW5zaW9ucycsIG1vY2tFeHRlbnNpb25HYWxsZXJ5KTtcblxuXHRcdHByb21wdGVkID0gZmFsc2U7XG5cblx0XHRjbGFzcyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZTIgZXh0ZW5kcyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSB7XG5cdFx0XHRwdWJsaWMgb3ZlcnJpZGUgcHJvbXB0KHNldmVyaXR5OiBTZXZlcml0eSwgbWVzc2FnZTogc3RyaW5nLCBjaG9pY2VzOiBJUHJvbXB0Q2hvaWNlW10sIG9wdGlvbnM/OiBJUHJvbXB0T3B0aW9ucykge1xuXHRcdFx0XHRwcm9tcHRlZCA9IHRydWU7XG5cdFx0XHRcdHByb21wdGVkRW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdHJldHVybiBzdXBlci5wcm9tcHQoc2V2ZXJpdHksIG1lc3NhZ2UsIGNob2ljZXMsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZTIoKSk7XG5cblx0XHR0ZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ29uZmlndXJhdGlvbktleSwgeyBpZ25vcmVSZWNvbW1lbmRhdGlvbnM6IGZhbHNlIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1vZGVsU2VydmljZSwgPElNb2RlbFNlcnZpY2U+e1xuXHRcdFx0Z2V0TW9kZWxzKCk6IGFueSB7IHJldHVybiBbXTsgfSxcblx0XHRcdG9uTW9kZWxBZGRlZDogb25Nb2RlbEFkZGVkRXZlbnQuZXZlbnRcblx0XHR9KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gc2V0VXBGb2xkZXJXb3Jrc3BhY2UoZm9sZGVyTmFtZTogc3RyaW5nLCByZWNvbW1lbmRlZEV4dGVuc2lvbnM6IHN0cmluZ1tdLCBpZ25vcmVkUmVjb21tZW5kYXRpb25zOiBzdHJpbmdbXSA9IFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHNldFVwRm9sZGVyKGZvbGRlck5hbWUsIHJlY29tbWVuZGVkRXh0ZW5zaW9ucywgaWdub3JlZFJlY29tbWVuZGF0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBzZXRVcEZvbGRlcihmb2xkZXJOYW1lOiBzdHJpbmcsIHJlY29tbWVuZGVkRXh0ZW5zaW9uczogc3RyaW5nW10sIGlnbm9yZWRSZWNvbW1lbmRhdGlvbnM6IHN0cmluZ1tdID0gW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGZvbGRlckRpciA9IGpvaW5QYXRoKFJPT1QsIGZvbGRlck5hbWUpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVNldHRpbmdzRGlyID0gam9pblBhdGgoZm9sZGVyRGlyLCAnLnZzY29kZScpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcih3b3Jrc3BhY2VTZXR0aW5nc0Rpcik7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGpvaW5QYXRoKHdvcmtzcGFjZVNldHRpbmdzRGlyLCAnZXh0ZW5zaW9ucy5qc29uJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGNvbmZpZ1BhdGgsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J3JlY29tbWVuZGF0aW9ucyc6IHJlY29tbWVuZGVkRXh0ZW5zaW9ucyxcblx0XHRcdCd1bndhbnRlZFJlY29tbWVuZGF0aW9ucyc6IGlnbm9yZWRSZWNvbW1lbmRhdGlvbnMsXG5cdFx0fSwgbnVsbCwgJ1xcdCcpKSk7XG5cblx0XHRjb25zdCBteVdvcmtzcGFjZSA9IHRlc3RXb3Jrc3BhY2UoZm9sZGVyRGlyKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0d29ya3NwYWNlU2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UobXlXb3Jrc3BhY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlKSkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gdGVzdE5vUHJvbXB0Rm9yVmFsaWRSZWNvbW1lbmRhdGlvbnMocmVjb21tZW5kYXRpb25zOiBzdHJpbmdbXSkge1xuXHRcdHJldHVybiBzZXRVcEZvbGRlcldvcmtzcGFjZSgnbXlGb2xkZXInLCByZWNvbW1lbmRhdGlvbnMpLnRoZW4oKCkgPT4ge1xuXHRcdFx0dGVzdE9iamVjdCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSkpO1xuXHRcdFx0cmV0dXJuIHRlc3RPYmplY3QuYWN0aXZhdGlvblByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3Qua2V5cyh0ZXN0T2JqZWN0LmdldEFsbFJlY29tbWVuZGF0aW9uc1dpdGhSZWFzb24oKSkubGVuZ3RoLCByZWNvbW1lbmRhdGlvbnMubGVuZ3RoKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFwcm9tcHRlZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRlc3ROb1Byb21wdE9yUmVjb21tZW5kYXRpb25zRm9yVmFsaWRSZWNvbW1lbmRhdGlvbnMocmVjb21tZW5kYXRpb25zOiBzdHJpbmdbXSkge1xuXHRcdHJldHVybiBzZXRVcEZvbGRlcldvcmtzcGFjZSgnbXlGb2xkZXInLCBtb2NrVGVzdERhdGEudmFsaWRSZWNvbW1lbmRlZEV4dGVuc2lvbnMpLnRoZW4oKCkgPT4ge1xuXHRcdFx0dGVzdE9iamVjdCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFwcm9tcHRlZCk7XG5cblx0XHRcdHJldHVybiB0ZXN0T2JqZWN0LmdldFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0LmtleXModGVzdE9iamVjdC5nZXRBbGxSZWNvbW1lbmRhdGlvbnNXaXRoUmVhc29uKCkpLmxlbmd0aCwgMCk7XG5cdFx0XHRcdGFzc2VydC5vayghcHJvbXB0ZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBObyBQcm9tcHQgZm9yIHZhbGlkIHdvcmtzcGFjZSByZWNvbW1lbmRhdGlvbnMgd2hlbiBnYWxsZXJ5U2VydmljZSBpcyBhYnNlbnQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnYWxsZXJ5UXVlcnlTcHkgPSBzaW5vbi5zcHkoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgeyBxdWVyeTogZ2FsbGVyeVF1ZXJ5U3B5LCBpc0VuYWJsZWQ6ICgpID0+IGZhbHNlIH0pO1xuXG5cdFx0cmV0dXJuIHRlc3ROb1Byb21wdE9yUmVjb21tZW5kYXRpb25zRm9yVmFsaWRSZWNvbW1lbmRhdGlvbnMobW9ja1Rlc3REYXRhLnZhbGlkUmVjb21tZW5kZWRFeHRlbnNpb25zKVxuXHRcdFx0LnRoZW4oKCkgPT4gYXNzZXJ0Lm9rKGdhbGxlcnlRdWVyeVNweS5ub3RDYWxsZWQpKTtcblx0fSkpO1xuXG5cdHRlc3QoJ0V4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IE5vIFByb21wdCBmb3IgdmFsaWQgd29ya3NwYWNlIHJlY29tbWVuZGF0aW9ucyBkdXJpbmcgZXh0ZW5zaW9uIGRldmVsb3BtZW50JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IGV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkk6IFtVUkkuZmlsZSgnL2ZvbGRlci9maWxlJyldLCBpc0V4dGVuc2lvbkRldmVsb3BtZW50OiB0cnVlIH0pO1xuXHRcdHJldHVybiB0ZXN0Tm9Qcm9tcHRPclJlY29tbWVuZGF0aW9uc0ZvclZhbGlkUmVjb21tZW5kYXRpb25zKG1vY2tUZXN0RGF0YS52YWxpZFJlY29tbWVuZGVkRXh0ZW5zaW9ucyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBObyB3b3Jrc3BhY2UgcmVjb21tZW5kYXRpb25zIG9yIHByb21wdHMgd2hlbiBleHRlbnNpb25zLmpzb24gaGFzIGVtcHR5IGFycmF5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3ROb1Byb21wdEZvclZhbGlkUmVjb21tZW5kYXRpb25zKFtdKTtcblx0fSkpO1xuXG5cdHRlc3QoJ0V4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IFByb21wdCBmb3IgdmFsaWQgd29ya3NwYWNlIHJlY29tbWVuZGF0aW9ucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNldFVwRm9sZGVyV29ya3NwYWNlKCdteUZvbGRlcicsIG1vY2tUZXN0RGF0YS5yZWNvbW1lbmRlZEV4dGVuc2lvbnMpO1xuXHRcdHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UpKTtcblxuXHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShwcm9tcHRlZEVtaXR0ZXIuZXZlbnQpO1xuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9ucyA9IE9iamVjdC5rZXlzKHRlc3RPYmplY3QuZ2V0QWxsUmVjb21tZW5kYXRpb25zV2l0aFJlYXNvbigpKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFsuLi5tb2NrVGVzdERhdGEudmFsaWRSZWNvbW1lbmRlZEV4dGVuc2lvbnMsICd1bmtub3duLmV4dGVuc2lvbiddO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNvbW1lbmRhdGlvbnMubGVuZ3RoLCBleHBlY3RlZC5sZW5ndGgpO1xuXHRcdGV4cGVjdGVkLmZvckVhY2goeCA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjb21tZW5kYXRpb25zLmluZGV4T2YoeC50b0xvd2VyQ2FzZSgpKSA+IC0xLCB0cnVlKTtcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ0V4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IE5vIFByb21wdCBmb3IgdmFsaWQgd29ya3NwYWNlIHJlY29tbWVuZGF0aW9ucyBpZiB0aGV5IGFyZSBhbHJlYWR5IGluc3RhbGxlZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJQcm9taXNlKElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgJ2dldEluc3RhbGxlZCcsIG1vY2tFeHRlbnNpb25Mb2NhbCk7XG5cdFx0cmV0dXJuIHRlc3ROb1Byb21wdEZvclZhbGlkUmVjb21tZW5kYXRpb25zKG1vY2tUZXN0RGF0YS52YWxpZFJlY29tbWVuZGVkRXh0ZW5zaW9ucyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBObyBQcm9tcHQgZm9yIHZhbGlkIHdvcmtzcGFjZSByZWNvbW1lbmRhdGlvbnMgd2l0aCBjYXNpbmcgbWlzbWF0Y2ggaWYgdGhleSBhcmUgYWxyZWFkeSBpbnN0YWxsZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViUHJvbWlzZShJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsICdnZXRJbnN0YWxsZWQnLCBtb2NrRXh0ZW5zaW9uTG9jYWwpO1xuXHRcdHJldHVybiB0ZXN0Tm9Qcm9tcHRGb3JWYWxpZFJlY29tbWVuZGF0aW9ucyhtb2NrVGVzdERhdGEudmFsaWRSZWNvbW1lbmRlZEV4dGVuc2lvbnMubWFwKHggPT4geC50b1VwcGVyQ2FzZSgpKSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBObyBQcm9tcHQgZm9yIHZhbGlkIHdvcmtzcGFjZSByZWNvbW1lbmRhdGlvbnMgaWYgaWdub3JlUmVjb21tZW5kYXRpb25zIGlzIHNldCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdHRlc3RDb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDb25maWd1cmF0aW9uS2V5LCB7IGlnbm9yZVJlY29tbWVuZGF0aW9uczogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gdGVzdE5vUHJvbXB0Rm9yVmFsaWRSZWNvbW1lbmRhdGlvbnMobW9ja1Rlc3REYXRhLnZhbGlkUmVjb21tZW5kZWRFeHRlbnNpb25zKTtcblx0fSkpO1xuXG5cdHRlc3QoJ0V4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IE5vIFByb21wdCBmb3IgdmFsaWQgd29ya3NwYWNlIHJlY29tbWVuZGF0aW9ucyBpZiBzaG93UmVjb21tZW5kYXRpb25zT25seU9uRGVtYW5kIGlzIHNldCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdHRlc3RDb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDb25maWd1cmF0aW9uS2V5LCB7IHNob3dSZWNvbW1lbmRhdGlvbnNPbmx5T25EZW1hbmQ6IHRydWUgfSk7XG5cdFx0cmV0dXJuIHNldFVwRm9sZGVyV29ya3NwYWNlKCdteUZvbGRlcicsIG1vY2tUZXN0RGF0YS52YWxpZFJlY29tbWVuZGVkRXh0ZW5zaW9ucykudGhlbigoKSA9PiB7XG5cdFx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4gdGVzdE9iamVjdC5hY3RpdmF0aW9uUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFwcm9tcHRlZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ0V4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IE5vIFByb21wdCBmb3IgdmFsaWQgd29ya3NwYWNlIHJlY29tbWVuZGF0aW9ucyBpZiBpZ25vcmVSZWNvbW1lbmRhdGlvbnMgaXMgc2V0IGZvciBjdXJyZW50IHdvcmtzcGFjZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpLnN0b3JlKCdleHRlbnNpb25zQXNzaXN0YW50L3dvcmtzcGFjZVJlY29tbWVuZGF0aW9uc0lnbm9yZScsIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0cmV0dXJuIHRlc3ROb1Byb21wdEZvclZhbGlkUmVjb21tZW5kYXRpb25zKG1vY2tUZXN0RGF0YS52YWxpZFJlY29tbWVuZGVkRXh0ZW5zaW9ucyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBObyBSZWNvbW1lbmRhdGlvbnMgb2YgZ2xvYmFsbHkgaWdub3JlZCByZWNvbW1lbmRhdGlvbnMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKS5zdG9yZSgnZXh0ZW5zaW9uc0Fzc2lzdGFudC93b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNJZ25vcmUnLCB0cnVlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpLnN0b3JlKCdleHRlbnNpb25zQXNzaXN0YW50L3JlY29tbWVuZGF0aW9ucycsICdbXCJtcy1kb3RuZXR0b29scy5jc2hhcnBcIiwgXCJtcy1weXRob24ucHl0aG9uXCIsIFwibXMtdnNjb2RlLnZzY29kZS10eXBlc2NyaXB0LXRzbGludC1wbHVnaW5cIl0nLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKS5zdG9yZSgnZXh0ZW5zaW9uc0Fzc2lzdGFudC9pZ25vcmVkX3JlY29tbWVuZGF0aW9ucycsICdbXCJtcy1kb3RuZXR0b29scy5jc2hhcnBcIiwgXCJtb2NrcHVibGlzaGVyMi5tb2NrZXh0ZW5zaW9uMlwiXScsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0cmV0dXJuIHNldFVwRm9sZGVyV29ya3NwYWNlKCdteUZvbGRlcicsIG1vY2tUZXN0RGF0YS52YWxpZFJlY29tbWVuZGVkRXh0ZW5zaW9ucykudGhlbigoKSA9PiB7XG5cdFx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4gdGVzdE9iamVjdC5hY3RpdmF0aW9uUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb25zID0gdGVzdE9iamVjdC5nZXRBbGxSZWNvbW1lbmRhdGlvbnNXaXRoUmVhc29uKCk7XG5cdFx0XHRcdGFzc2VydC5vayghcmVjb21tZW5kYXRpb25zWydtcy1kb3RuZXR0b29scy5jc2hhcnAnXSk7IC8vIHN0b3JlZCByZWNvbW1lbmRhdGlvbiB0aGF0IGhhcyBiZWVuIGdsb2JhbGx5IGlnbm9yZWRcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlY29tbWVuZGF0aW9uc1snbXMtcHl0aG9uLnB5dGhvbiddKTsgLy8gc3RvcmVkIHJlY29tbWVuZGF0aW9uXG5cdFx0XHRcdGFzc2VydC5vayhyZWNvbW1lbmRhdGlvbnNbJ21vY2twdWJsaXNoZXIxLm1vY2tleHRlbnNpb24xJ10pOyAvLyB3b3Jrc3BhY2UgcmVjb21tZW5kYXRpb25cblx0XHRcdFx0YXNzZXJ0Lm9rKCFyZWNvbW1lbmRhdGlvbnNbJ21vY2twdWJsaXNoZXIyLm1vY2tleHRlbnNpb24yJ10pOyAvLyB3b3Jrc3BhY2UgcmVjb21tZW5kYXRpb24gdGhhdCBoYXMgYmVlbiBnbG9iYWxseSBpZ25vcmVkXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ0V4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IE5vIFJlY29tbWVuZGF0aW9ucyBvZiB3b3Jrc3BhY2UgaWdub3JlZCByZWNvbW1lbmRhdGlvbnMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpZ25vcmVkUmVjb21tZW5kYXRpb25zID0gWydtcy1kb3RuZXR0b29scy5jc2hhcnAnLCAnbW9ja3B1Ymxpc2hlcjIubW9ja2V4dGVuc2lvbjInXTsgLy8gaWdub3JlIGEgc3RvcmVkIHJlY29tbWVuZGF0aW9uIGFuZCBhIHdvcmtzcGFjZSByZWNvbW1lbmRhdGlvbi5cblx0XHRjb25zdCBzdG9yZWRSZWNvbW1lbmRhdGlvbnMgPSAnW1wibXMtZG90bmV0dG9vbHMuY3NoYXJwXCIsIFwibXMtcHl0aG9uLnB5dGhvblwiXSc7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSkuc3RvcmUoJ2V4dGVuc2lvbnNBc3Npc3RhbnQvd29ya3NwYWNlUmVjb21tZW5kYXRpb25zSWdub3JlJywgdHJ1ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKS5zdG9yZSgnZXh0ZW5zaW9uc0Fzc2lzdGFudC9yZWNvbW1lbmRhdGlvbnMnLCBzdG9yZWRSZWNvbW1lbmRhdGlvbnMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0cmV0dXJuIHNldFVwRm9sZGVyV29ya3NwYWNlKCdteUZvbGRlcicsIG1vY2tUZXN0RGF0YS52YWxpZFJlY29tbWVuZGVkRXh0ZW5zaW9ucywgaWdub3JlZFJlY29tbWVuZGF0aW9ucykudGhlbigoKSA9PiB7XG5cdFx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4gdGVzdE9iamVjdC5hY3RpdmF0aW9uUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb25zID0gdGVzdE9iamVjdC5nZXRBbGxSZWNvbW1lbmRhdGlvbnNXaXRoUmVhc29uKCk7XG5cdFx0XHRcdGFzc2VydC5vayghcmVjb21tZW5kYXRpb25zWydtcy1kb3RuZXR0b29scy5jc2hhcnAnXSk7IC8vIHN0b3JlZCByZWNvbW1lbmRhdGlvbiB0aGF0IGhhcyBiZWVuIHdvcmtzcGFjZSBpZ25vcmVkXG5cdFx0XHRcdGFzc2VydC5vayhyZWNvbW1lbmRhdGlvbnNbJ21zLXB5dGhvbi5weXRob24nXSk7IC8vIHN0b3JlZCByZWNvbW1lbmRhdGlvblxuXHRcdFx0XHRhc3NlcnQub2socmVjb21tZW5kYXRpb25zWydtb2NrcHVibGlzaGVyMS5tb2NrZXh0ZW5zaW9uMSddKTsgLy8gd29ya3NwYWNlIHJlY29tbWVuZGF0aW9uXG5cdFx0XHRcdGFzc2VydC5vayghcmVjb21tZW5kYXRpb25zWydtb2NrcHVibGlzaGVyMi5tb2NrZXh0ZW5zaW9uMiddKTsgLy8gd29ya3NwYWNlIHJlY29tbWVuZGF0aW9uIHRoYXQgaGFzIGJlZW4gd29ya3NwYWNlIGlnbm9yZWRcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZTogQWJsZSB0byByZXRyaWV2ZSBjb2xsZWN0aW9uIG9mIGFsbCBpZ25vcmVkIHJlY29tbWVuZGF0aW9ucycsIGFzeW5jICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VJZ25vcmVkUmVjb21tZW5kYXRpb25zID0gWydtcy1kb3RuZXR0b29scy5jc2hhcnAnXTsgLy8gaWdub3JlIGEgc3RvcmVkIHJlY29tbWVuZGF0aW9uIGFuZCBhIHdvcmtzcGFjZSByZWNvbW1lbmRhdGlvbi5cblx0XHRjb25zdCBzdG9yZWRSZWNvbW1lbmRhdGlvbnMgPSAnW1wibXMtZG90bmV0dG9vbHMuY3NoYXJwXCIsIFwibXMtcHl0aG9uLnB5dGhvblwiXSc7XG5cdFx0Y29uc3QgZ2xvYmFsbHlJZ25vcmVkUmVjb21tZW5kYXRpb25zID0gJ1tcIm1vY2twdWJsaXNoZXIyLm1vY2tleHRlbnNpb24yXCJdJzsgLy8gaWdub3JlIGEgd29ya3NwYWNlIHJlY29tbWVuZGF0aW9uLlxuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdleHRlbnNpb25zQXNzaXN0YW50L3dvcmtzcGFjZVJlY29tbWVuZGF0aW9uc0lnbm9yZScsIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2V4dGVuc2lvbnNBc3Npc3RhbnQvcmVjb21tZW5kYXRpb25zJywgc3RvcmVkUmVjb21tZW5kYXRpb25zLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnZXh0ZW5zaW9uc0Fzc2lzdGFudC9pZ25vcmVkX3JlY29tbWVuZGF0aW9ucycsIGdsb2JhbGx5SWdub3JlZFJlY29tbWVuZGF0aW9ucywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRhd2FpdCBzZXRVcEZvbGRlcldvcmtzcGFjZSgnbXlGb2xkZXInLCBtb2NrVGVzdERhdGEudmFsaWRSZWNvbW1lbmRlZEV4dGVuc2lvbnMsIHdvcmtzcGFjZUlnbm9yZWRSZWNvbW1lbmRhdGlvbnMpO1xuXHRcdHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjdGl2YXRpb25Qcm9taXNlO1xuXG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb25zID0gdGVzdE9iamVjdC5nZXRBbGxSZWNvbW1lbmRhdGlvbnNXaXRoUmVhc29uKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3Qua2V5cyhyZWNvbW1lbmRhdGlvbnMpLCBbJ21zLXB5dGhvbi5weXRob24nLCAnbW9ja3B1Ymxpc2hlcjEubW9ja2V4dGVuc2lvbjEnXSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBBYmxlIHRvIGR5bmFtaWNhbGx5IGlnbm9yZS91bmlnbm9yZSBnbG9iYWwgcmVjb21tZW5kYXRpb25zJywgYXN5bmMgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHN0b3JlZFJlY29tbWVuZGF0aW9ucyA9ICdbXCJtcy1kb3RuZXR0b29scy5jc2hhcnBcIiwgXCJtcy1weXRob24ucHl0aG9uXCJdJztcblx0XHRjb25zdCBnbG9iYWxseUlnbm9yZWRSZWNvbW1lbmRhdGlvbnMgPSAnW1wibW9ja3B1Ymxpc2hlcjIubW9ja2V4dGVuc2lvbjJcIl0nOyAvLyBpZ25vcmUgYSB3b3Jrc3BhY2UgcmVjb21tZW5kYXRpb24uXG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2V4dGVuc2lvbnNBc3Npc3RhbnQvd29ya3NwYWNlUmVjb21tZW5kYXRpb25zSWdub3JlJywgdHJ1ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnZXh0ZW5zaW9uc0Fzc2lzdGFudC9yZWNvbW1lbmRhdGlvbnMnLCBzdG9yZWRSZWNvbW1lbmRhdGlvbnMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdleHRlbnNpb25zQXNzaXN0YW50L2lnbm9yZWRfcmVjb21tZW5kYXRpb25zJywgZ2xvYmFsbHlJZ25vcmVkUmVjb21tZW5kYXRpb25zLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGF3YWl0IHNldFVwRm9sZGVyV29ya3NwYWNlKCdteUZvbGRlcicsIG1vY2tUZXN0RGF0YS52YWxpZFJlY29tbWVuZGVkRXh0ZW5zaW9ucyk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKTtcblx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY3RpdmF0aW9uUHJvbWlzZTtcblxuXHRcdGxldCByZWNvbW1lbmRhdGlvbnMgPSB0ZXN0T2JqZWN0LmdldEFsbFJlY29tbWVuZGF0aW9uc1dpdGhSZWFzb24oKTtcblx0XHRhc3NlcnQub2socmVjb21tZW5kYXRpb25zWydtcy1weXRob24ucHl0aG9uJ10pO1xuXHRcdGFzc2VydC5vayhyZWNvbW1lbmRhdGlvbnNbJ21vY2twdWJsaXNoZXIxLm1vY2tleHRlbnNpb24xJ10pO1xuXHRcdGFzc2VydC5vayghcmVjb21tZW5kYXRpb25zWydtb2NrcHVibGlzaGVyMi5tb2NrZXh0ZW5zaW9uMiddKTtcblxuXHRcdGV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLnRvZ2dsZUdsb2JhbElnbm9yZWRSZWNvbW1lbmRhdGlvbignbW9ja3B1Ymxpc2hlcjEubW9ja2V4dGVuc2lvbjEnLCB0cnVlKTtcblxuXHRcdHJlY29tbWVuZGF0aW9ucyA9IHRlc3RPYmplY3QuZ2V0QWxsUmVjb21tZW5kYXRpb25zV2l0aFJlYXNvbigpO1xuXHRcdGFzc2VydC5vayhyZWNvbW1lbmRhdGlvbnNbJ21zLXB5dGhvbi5weXRob24nXSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZWNvbW1lbmRhdGlvbnNbJ21vY2twdWJsaXNoZXIxLm1vY2tleHRlbnNpb24xJ10pO1xuXHRcdGFzc2VydC5vayghcmVjb21tZW5kYXRpb25zWydtb2NrcHVibGlzaGVyMi5tb2NrZXh0ZW5zaW9uMiddKTtcblxuXHRcdGV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLnRvZ2dsZUdsb2JhbElnbm9yZWRSZWNvbW1lbmRhdGlvbignbW9ja3B1Ymxpc2hlcjEubW9ja2V4dGVuc2lvbjEnLCBmYWxzZSk7XG5cblx0XHRyZWNvbW1lbmRhdGlvbnMgPSB0ZXN0T2JqZWN0LmdldEFsbFJlY29tbWVuZGF0aW9uc1dpdGhSZWFzb24oKTtcblx0XHRhc3NlcnQub2socmVjb21tZW5kYXRpb25zWydtcy1weXRob24ucHl0aG9uJ10pO1xuXHRcdGFzc2VydC5vayhyZWNvbW1lbmRhdGlvbnNbJ21vY2twdWJsaXNoZXIxLm1vY2tleHRlbnNpb24xJ10pO1xuXHRcdGFzc2VydC5vayghcmVjb21tZW5kYXRpb25zWydtb2NrcHVibGlzaGVyMi5tb2NrZXh0ZW5zaW9uMiddKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Rlc3QgZ2xvYmFsIGV4dGVuc2lvbnMgYXJlIG1vZGlmaWVkIGFuZCByZWNvbW1lbmRhdGlvbiBjaGFuZ2UgZXZlbnQgaXMgZmlyZWQgd2hlbiBhbiBleHRlbnNpb24gaXMgaWdub3JlZCcsIGFzeW5jICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgY2hhbmdlSGFuZGxlclRhcmdldCA9IHNpbm9uLnNweSgpO1xuXHRcdGNvbnN0IGlnbm9yZWRFeHRlbnNpb25JZCA9ICdTb21lLkV4dGVuc2lvbic7XG5cblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnZXh0ZW5zaW9uc0Fzc2lzdGFudC93b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnNJZ25vcmUnLCB0cnVlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdleHRlbnNpb25zQXNzaXN0YW50L2lnbm9yZWRfcmVjb21tZW5kYXRpb25zJywgJ1tcIm1zLXZzY29kZS52c2NvZGVcIl0nLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGF3YWl0IHNldFVwRm9sZGVyV29ya3NwYWNlKCdteUZvbGRlcicsIFtdKTtcblx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlR2xvYmFsSWdub3JlZFJlY29tbWVuZGF0aW9uKGNoYW5nZUhhbmRsZXJUYXJnZXQpKTtcblx0XHRleHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZS50b2dnbGVHbG9iYWxJZ25vcmVkUmVjb21tZW5kYXRpb24oaWdub3JlZEV4dGVuc2lvbklkLCB0cnVlKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmFjdGl2YXRpb25Qcm9taXNlO1xuXG5cdFx0YXNzZXJ0Lm9rKGNoYW5nZUhhbmRsZXJUYXJnZXQuY2FsbGVkT25jZSk7XG5cdFx0YXNzZXJ0Lm9rKGNoYW5nZUhhbmRsZXJUYXJnZXQuZ2V0Q2FsbCgwKS5jYWxsZWRXaXRoTWF0Y2goeyBleHRlbnNpb25JZDogaWdub3JlZEV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCksIGlzUmVjb21tZW5kZWQ6IGZhbHNlIH0pKTtcblx0fSkpO1xuXG5cdHRlc3QoJ0V4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IEdldCBmaWxlIGJhc2VkIHJlY29tbWVuZGF0aW9ucyBmcm9tIHN0b3JhZ2UgKG9sZCBmb3JtYXQpJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmVkUmVjb21tZW5kYXRpb25zID0gJ1tcIm1zLWRvdG5ldHRvb2xzLmNzaGFycFwiLCBcIm1zLXB5dGhvbi5weXRob25cIiwgXCJtcy12c2NvZGUudnNjb2RlLXR5cGVzY3JpcHQtdHNsaW50LXBsdWdpblwiXSc7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSkuc3RvcmUoJ2V4dGVuc2lvbnNBc3Npc3RhbnQvcmVjb21tZW5kYXRpb25zJywgc3RvcmVkUmVjb21tZW5kYXRpb25zLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdHJldHVybiBzZXRVcEZvbGRlcldvcmtzcGFjZSgnbXlGb2xkZXInLCBbXSkudGhlbigoKSA9PiB7XG5cdFx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4gdGVzdE9iamVjdC5hY3RpdmF0aW9uUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb25zID0gdGVzdE9iamVjdC5nZXRGaWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY29tbWVuZGF0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQub2socmVjb21tZW5kYXRpb25zLnNvbWUoZXh0ZW5zaW9uSWQgPT4gZXh0ZW5zaW9uSWQgPT09ICdtcy1kb3RuZXR0b29scy5jc2hhcnAnKSk7IC8vIHN0b3JlZCByZWNvbW1lbmRhdGlvbiB0aGF0IGV4aXN0cyBpbiBwcm9kdWN0LmV4dGVuc2lvblRpcHNcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlY29tbWVuZGF0aW9ucy5zb21lKGV4dGVuc2lvbklkID0+IGV4dGVuc2lvbklkID09PSAnbXMtcHl0aG9uLnB5dGhvbicpKTsgLy8gc3RvcmVkIHJlY29tbWVuZGF0aW9uIHRoYXQgZXhpc3RzIGluIHByb2R1Y3QuZXh0ZW5zaW9uSW1wb3J0YW50VGlwc1xuXHRcdFx0XHRhc3NlcnQub2socmVjb21tZW5kYXRpb25zLmV2ZXJ5KGV4dGVuc2lvbklkID0+IGV4dGVuc2lvbklkICE9PSAnbXMtdnNjb2RlLnZzY29kZS10eXBlc2NyaXB0LXRzbGludC1wbHVnaW4nKSk7IC8vIHN0b3JlZCByZWNvbW1lbmRhdGlvbiB0aGF0IGlzIG5vIGxvbmdlciBpbiBuZWl0aGVyIHByb2R1Y3QuZXh0ZW5zaW9uVGlwcyBub3IgcHJvZHVjdC5leHRlbnNpb25JbXBvcnRhbnRUaXBzXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ0V4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IEdldCBmaWxlIGJhc2VkIHJlY29tbWVuZGF0aW9ucyBmcm9tIHN0b3JhZ2UgKG5ldyBmb3JtYXQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1pbGxpU2Vjb25kc0luQURheSA9IDEwMDAgKiA2MCAqIDYwICogMjQ7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCB0ZW5EYXlzT2xkID0gMTAgKiBtaWxsaVNlY29uZHNJbkFEYXk7XG5cdFx0Y29uc3Qgc3RvcmVkUmVjb21tZW5kYXRpb25zID0gYHtcIm1zLWRvdG5ldHRvb2xzLmNzaGFycFwiOiAke25vd30sIFwibXMtcHl0aG9uLnB5dGhvblwiOiAke25vd30sIFwibXMtdnNjb2RlLnZzY29kZS10eXBlc2NyaXB0LXRzbGludC1wbHVnaW5cIjogJHtub3d9LCBcImx1a2Vob2Jhbi5Hb1wiOiAke3RlbkRheXNPbGR9fWA7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSkuc3RvcmUoJ2V4dGVuc2lvbnNBc3Npc3RhbnQvcmVjb21tZW5kYXRpb25zJywgc3RvcmVkUmVjb21tZW5kYXRpb25zLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGF3YWl0IHNldFVwRm9sZGVyV29ya3NwYWNlKCdteUZvbGRlcicsIFtdKTtcblx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5hY3RpdmF0aW9uUHJvbWlzZTtcblxuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9ucyA9IHRlc3RPYmplY3QuZ2V0RmlsZUJhc2VkUmVjb21tZW5kYXRpb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY29tbWVuZGF0aW9ucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vayhyZWNvbW1lbmRhdGlvbnMuc29tZShleHRlbnNpb25JZCA9PiBleHRlbnNpb25JZCA9PT0gJ21zLWRvdG5ldHRvb2xzLmNzaGFycCcpKTsgLy8gc3RvcmVkIHJlY29tbWVuZGF0aW9uIHRoYXQgZXhpc3RzIGluIHByb2R1Y3QuZXh0ZW5zaW9uVGlwc1xuXHRcdGFzc2VydC5vayhyZWNvbW1lbmRhdGlvbnMuc29tZShleHRlbnNpb25JZCA9PiBleHRlbnNpb25JZCA9PT0gJ21zLXB5dGhvbi5weXRob24nKSk7IC8vIHN0b3JlZCByZWNvbW1lbmRhdGlvbiB0aGF0IGV4aXN0cyBpbiBwcm9kdWN0LmV4dGVuc2lvbkltcG9ydGFudFRpcHNcblx0XHRhc3NlcnQub2socmVjb21tZW5kYXRpb25zLmV2ZXJ5KGV4dGVuc2lvbklkID0+IGV4dGVuc2lvbklkICE9PSAnbXMtdnNjb2RlLnZzY29kZS10eXBlc2NyaXB0LXRzbGludC1wbHVnaW4nKSk7IC8vIHN0b3JlZCByZWNvbW1lbmRhdGlvbiB0aGF0IGlzIG5vIGxvbmdlciBpbiBuZWl0aGVyIHByb2R1Y3QuZXh0ZW5zaW9uVGlwcyBub3IgcHJvZHVjdC5leHRlbnNpb25JbXBvcnRhbnRUaXBzXG5cdFx0YXNzZXJ0Lm9rKHJlY29tbWVuZGF0aW9ucy5ldmVyeShleHRlbnNpb25JZCA9PiBleHRlbnNpb25JZCAhPT0gJ2x1a2Vob2Jhbi5HbycpKTsgLy9zdG9yZWQgcmVjb21tZW5kYXRpb24gdGhhdCBpcyBvbGRlciB0aGFuIGEgd2Vla1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxXQUFXO0FBQ3ZCLE9BQU8sWUFBWTtBQUNuQixZQUFZLFVBQVU7QUFDdEI7QUFBQSxFQUNDO0FBQUEsRUFBc0U7QUFBQSxFQUE2QjtBQUFBLEVBQXVCO0FBQUEsT0FDcEg7QUFDUCxTQUFTLHNDQUFzQyw0Q0FBNEM7QUFDM0YsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxvQkFBb0Isb0JBQW9CLDBCQUEwQjtBQUMzRSxTQUFTLDBCQUEwQixnQ0FBZ0M7QUFDbkUsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCLG1DQUFtQztBQUM5RCxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLHFCQUFx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
