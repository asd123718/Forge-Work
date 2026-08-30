import assert from "assert";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { ExtensionsListView } from "../../browser/extensionsViews.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IExtensionsWorkbenchService } from "../../common/extensions.js";
import { ExtensionsWorkbenchService } from "../../browser/extensionsWorkbenchService.js";
import {
  IExtensionManagementService,
  IExtensionGalleryService,
  getTargetPlatform,
  SortBy
} from "../../../../../platform/extensionManagement/common/extensionManagement.js";
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from "../../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionRecommendationsService, ExtensionRecommendationReason } from "../../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { getGalleryExtensionId } from "../../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { TestExtensionEnablementService } from "../../../../services/extensionManagement/test/browser/extensionEnablementService.test.js";
import { ExtensionGalleryService } from "../../../../../platform/extensionManagement/common/extensionGalleryService.js";
import { IURLService } from "../../../../../platform/url/common/url.js";
import { Event } from "../../../../../base/common/event.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { IExtensionService, toExtensionDescription } from "../../../../services/extensions/common/extensions.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { TestMenuService } from "../../../../test/browser/workbenchTestServices.js";
import { TestSharedProcessService } from "../../../../test/electron-browser/workbenchTestServices.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { NativeURLService } from "../../../../../platform/url/common/urlService.js";
import { URI } from "../../../../../base/common/uri.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { RemoteAgentService } from "../../../../services/remote/electron-browser/remoteAgentService.js";
import { ExtensionType } from "../../../../../platform/extensions/common/extensions.js";
import { ISharedProcessService } from "../../../../../platform/ipc/electron-browser/services.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { TestContextService } from "../../../../test/common/workbenchTestServices.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../common/views.js";
import { Schemas } from "../../../../../base/common/network.js";
import { platform } from "../../../../../base/common/platform.js";
import { arch } from "../../../../../base/common/process.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IUpdateService, State } from "../../../../../platform/update/common/update.js";
import { IMeteredConnectionService } from "../../../../../platform/meteredConnection/common/meteredConnection.js";
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from "../../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { IUserDataProfileService } from "../../../../services/userDataProfile/common/userDataProfile.js";
import { UserDataProfileService } from "../../../../services/userDataProfile/common/userDataProfileService.js";
import { toUserDataProfile } from "../../../../../platform/userDataProfile/common/userDataProfile.js";
suite("ExtensionsViews Tests", () => {
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let testableView;
  const localEnabledTheme = aLocalExtension("first-enabled-extension", { categories: ["Themes", "random"] }, { installedTimestamp: 123456 });
  const localEnabledLanguage = aLocalExtension("second-enabled-extension", { categories: ["Programming languages"], version: "1.0.0" }, { installedTimestamp: Date.now(), updated: false });
  const localDisabledTheme = aLocalExtension("first-disabled-extension", { categories: ["themes"] }, { installedTimestamp: 234567 });
  const localDisabledLanguage = aLocalExtension("second-disabled-extension", { categories: ["programming languages"] }, { installedTimestamp: Date.now() - 5e4, updated: true });
  const localRandom = aLocalExtension("random-enabled-extension", { categories: ["random"] }, { installedTimestamp: 345678 });
  const builtInTheme = aLocalExtension("my-theme", { categories: ["Themes"], contributes: { themes: ["my-theme"] } }, { type: ExtensionType.System, installedTimestamp: 222 });
  const builtInBasic = aLocalExtension("my-lang", { categories: ["Programming Languages"], contributes: { grammars: [{ language: "my-language" }] } }, { type: ExtensionType.System, installedTimestamp: 666666 });
  let queryPage = aPage([]);
  const galleryExtensions = [];
  const workspaceRecommendationA = aGalleryExtension("workspace-recommendation-A");
  const workspaceRecommendationB = aGalleryExtension("workspace-recommendation-B");
  const configBasedRecommendationA = aGalleryExtension("configbased-recommendation-A");
  const configBasedRecommendationB = aGalleryExtension("configbased-recommendation-B");
  const fileBasedRecommendationA = aGalleryExtension("filebased-recommendation-A");
  const fileBasedRecommendationB = aGalleryExtension("filebased-recommendation-B");
  const otherRecommendationA = aGalleryExtension("other-recommendation-A");
  setup(async () => {
    instantiationService = disposableStore.add(new TestInstantiationService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(ILogService, NullLogService);
    instantiationService.stub(IFileService, disposableStore.add(new FileService(new NullLogService())));
    instantiationService.stub(IProductService, {});
    instantiationService.stub(IWorkspaceContextService, new TestContextService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
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
      async getInstalledWorkspaceExtensions() {
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
      },
      async updateMetadata(local) {
        return local;
      }
    });
    instantiationService.stub(IRemoteAgentService, RemoteAgentService);
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IMenuService, new TestMenuService());
    const localExtensionManagementServer = { extensionManagementService: instantiationService.get(IExtensionManagementService), label: "local", id: "vscode-local" };
    instantiationService.stub(IExtensionManagementServerService, {
      get localExtensionManagementServer() {
        return localExtensionManagementServer;
      },
      getExtensionManagementServer(extension) {
        if (extension.location.scheme === Schemas.file) {
          return localExtensionManagementServer;
        }
        throw new Error(`Invalid Extension ${extension.location}`);
      }
    });
    instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
    instantiationService.stub(IUserDataProfileService, disposableStore.add(new UserDataProfileService(toUserDataProfile("test", "test", URI.file("foo"), URI.file("cache")))));
    const reasons = {};
    reasons[workspaceRecommendationA.identifier.id] = { reasonId: ExtensionRecommendationReason.Workspace };
    reasons[workspaceRecommendationB.identifier.id] = { reasonId: ExtensionRecommendationReason.Workspace };
    reasons[fileBasedRecommendationA.identifier.id] = { reasonId: ExtensionRecommendationReason.File };
    reasons[fileBasedRecommendationB.identifier.id] = { reasonId: ExtensionRecommendationReason.File };
    reasons[otherRecommendationA.identifier.id] = { reasonId: ExtensionRecommendationReason.Executable };
    reasons[configBasedRecommendationA.identifier.id] = { reasonId: ExtensionRecommendationReason.WorkspaceConfig };
    instantiationService.stub(IExtensionRecommendationsService, {
      getWorkspaceRecommendations() {
        return Promise.resolve([
          workspaceRecommendationA.identifier.id,
          workspaceRecommendationB.identifier.id
        ]);
      },
      getConfigBasedRecommendations() {
        return Promise.resolve({
          important: [configBasedRecommendationA.identifier.id],
          others: [configBasedRecommendationB.identifier.id]
        });
      },
      getImportantRecommendations() {
        return Promise.resolve([]);
      },
      getFileBasedRecommendations() {
        return [
          fileBasedRecommendationA.identifier.id,
          fileBasedRecommendationB.identifier.id
        ];
      },
      getOtherRecommendations() {
        return Promise.resolve([
          configBasedRecommendationB.identifier.id,
          otherRecommendationA.identifier.id
        ]);
      },
      getAllRecommendationsWithReason() {
        return reasons;
      }
    });
    instantiationService.stub(IURLService, NativeURLService);
    instantiationService.stubPromise(IExtensionManagementService, "getInstalled", [localEnabledTheme, localEnabledLanguage, localRandom, localDisabledTheme, localDisabledLanguage, builtInTheme, builtInBasic]);
    instantiationService.stubPromise(IExtensionManagementService, "getExtensgetExtensionsControlManifestionsReport", {});
    instantiationService.stub(IExtensionGalleryService, {
      query: async () => {
        return queryPage;
      },
      getCompatibleExtension: async (gallery) => {
        return gallery;
      },
      getExtensions: async (infos) => {
        const result = [];
        for (const info of infos) {
          const extension = galleryExtensions.find((e) => e.identifier.id === info.id);
          if (extension) {
            result.push(extension);
          }
        }
        return result;
      },
      isEnabled: () => true,
      isExtensionCompatible: async () => true
    });
    instantiationService.stub(IViewDescriptorService, {
      getViewLocationById() {
        return ViewContainerLocation.Sidebar;
      },
      onDidChangeLocation: Event.None
    });
    instantiationService.stub(IExtensionService, {
      onDidChangeExtensions: Event.None,
      extensions: [
        toExtensionDescription(localEnabledTheme),
        toExtensionDescription(localEnabledLanguage),
        toExtensionDescription(localRandom),
        toExtensionDescription(builtInTheme),
        toExtensionDescription(builtInBasic)
      ],
      canAddExtension: (extension) => true,
      whenInstalledExtensionsRegistered: () => Promise.resolve(true)
    });
    await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localDisabledTheme], EnablementState.DisabledGlobally);
    await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localDisabledLanguage], EnablementState.DisabledGlobally);
    instantiationService.stub(IUpdateService, { onStateChange: Event.None, state: State.Uninitialized });
    instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: Event.None });
    instantiationService.set(IExtensionsWorkbenchService, disposableStore.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
    testableView = disposableStore.add(instantiationService.createInstance(ExtensionsListView, {}, { id: "", title: "" }));
    queryPage = aPage([]);
    galleryExtensions.splice(0, galleryExtensions.length, ...[
      workspaceRecommendationA,
      workspaceRecommendationB,
      configBasedRecommendationA,
      configBasedRecommendationB,
      fileBasedRecommendationA,
      fileBasedRecommendationB,
      otherRecommendationA
    ]);
  });
  test("Test query types", () => {
    assert.strictEqual(ExtensionsListView.isBuiltInExtensionsQuery("@builtin"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@installed"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@enabled"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@disabled"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@outdated"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@updates"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@sort:name"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@sort:updateDate"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@installed searchText"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@enabled searchText"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@disabled searchText"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@outdated searchText"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@updates searchText"), true);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@agentPlugins @installed"), false);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@agentPlugins @installed searchText"), false);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@mcp @installed"), false);
    assert.strictEqual(ExtensionsListView.isLocalExtensionsQuery("@mcp @installed searchText"), false);
  });
  test("Test empty query equates to sort by install count", async () => {
    const target = instantiationService.stubPromise(IExtensionGalleryService, "query", aPage());
    await testableView.show("");
    assert.ok(target.calledOnce);
    const options = target.args[0][0];
    assert.strictEqual(options.sortBy, SortBy.InstallCount);
  });
  test("Test non empty query without sort doesnt use sortBy", async () => {
    const target = instantiationService.stubPromise(IExtensionGalleryService, "query", aPage());
    await testableView.show("some extension");
    assert.ok(target.calledOnce);
    const options = target.args[0][0];
    assert.strictEqual(options.sortBy, void 0);
  });
  test("Test query with sort uses sortBy", async () => {
    const target = instantiationService.stubPromise(IExtensionGalleryService, "query", aPage());
    await testableView.show("some extension @sort:rating");
    assert.ok(target.calledOnce);
    const options = target.args[0][0];
    assert.strictEqual(options.sortBy, SortBy.WeightedRating);
  });
  test("Test default view actions required sorting", async () => {
    queryPage = aPage([aGalleryExtension(localEnabledLanguage.manifest.name, { ...localEnabledLanguage.manifest, version: "1.0.1", identifier: localDisabledLanguage.identifier })]);
    const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
    const extension = (await workbenchService.queryLocal()).find((ex) => ex.identifier.id === localEnabledLanguage.identifier.id);
    await new Promise((c) => {
      const disposable = workbenchService.onChange(() => {
        if (extension?.outdated) {
          disposable.dispose();
          c();
        }
      });
      instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
    });
    const result = await testableView.show("@installed");
    assert.strictEqual(result.length, 5, "Unexpected number of results for @installed query");
    const actual = [result.get(0).name, result.get(1).name, result.get(2).name, result.get(3).name, result.get(4).name];
    const expected = [localEnabledLanguage.manifest.name, localEnabledTheme.manifest.name, localRandom.manifest.name, localDisabledTheme.manifest.name, localDisabledLanguage.manifest.name];
    for (let i = 0; i < result.length; i++) {
      assert.strictEqual(actual[i], expected[i], "Unexpected extension for @installed query with outadted extension.");
    }
  });
  test("Test installed query results", async () => {
    await testableView.show("@installed").then((result) => {
      assert.strictEqual(result.length, 5, "Unexpected number of results for @installed query");
      const actual = [result.get(0).name, result.get(1).name, result.get(2).name, result.get(3).name, result.get(4).name].sort();
      const expected = [localDisabledTheme.manifest.name, localEnabledTheme.manifest.name, localRandom.manifest.name, localDisabledLanguage.manifest.name, localEnabledLanguage.manifest.name];
      for (let i = 0; i < result.length; i++) {
        assert.strictEqual(actual[i], expected[i], "Unexpected extension for @installed query.");
      }
    });
    await testableView.show("@installed first").then((result) => {
      assert.strictEqual(result.length, 2, "Unexpected number of results for @installed query");
      assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, "Unexpected extension for @installed query with search text.");
      assert.strictEqual(result.get(1).name, localDisabledTheme.manifest.name, "Unexpected extension for @installed query with search text.");
    });
    await testableView.show("@disabled").then((result) => {
      assert.strictEqual(result.length, 2, "Unexpected number of results for @disabled query");
      assert.strictEqual(result.get(0).name, localDisabledTheme.manifest.name, "Unexpected extension for @disabled query.");
      assert.strictEqual(result.get(1).name, localDisabledLanguage.manifest.name, "Unexpected extension for @disabled query.");
    });
    await testableView.show("@enabled").then((result) => {
      assert.strictEqual(result.length, 3, "Unexpected number of results for @enabled query");
      assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, "Unexpected extension for @enabled query.");
      assert.strictEqual(result.get(1).name, localRandom.manifest.name, "Unexpected extension for @enabled query.");
      assert.strictEqual(result.get(2).name, localEnabledLanguage.manifest.name, "Unexpected extension for @enabled query.");
    });
    await testableView.show("@builtin category:themes").then((result) => {
      assert.strictEqual(result.length, 1, "Unexpected number of results for @builtin category:themes query");
      assert.strictEqual(result.get(0).name, builtInTheme.manifest.name, "Unexpected extension for @builtin:themes query.");
    });
    await testableView.show('@builtin category:"programming languages"').then((result) => {
      assert.strictEqual(result.length, 1, "Unexpected number of results for @builtin:basics query");
      assert.strictEqual(result.get(0).name, builtInBasic.manifest.name, "Unexpected extension for @builtin:basics query.");
    });
    await testableView.show("@builtin").then((result) => {
      assert.strictEqual(result.length, 2, "Unexpected number of results for @builtin query");
      assert.strictEqual(result.get(0).name, builtInBasic.manifest.name, "Unexpected extension for @builtin query.");
      assert.strictEqual(result.get(1).name, builtInTheme.manifest.name, "Unexpected extension for @builtin query.");
    });
    await testableView.show("@builtin my-theme").then((result) => {
      assert.strictEqual(result.length, 1, "Unexpected number of results for @builtin query");
      assert.strictEqual(result.get(0).name, builtInTheme.manifest.name, "Unexpected extension for @builtin query.");
    });
  });
  test("Test installed query with category", async () => {
    await testableView.show("@installed category:themes").then((result) => {
      assert.strictEqual(result.length, 2, "Unexpected number of results for @installed query with category");
      assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, "Unexpected extension for @installed query with category.");
      assert.strictEqual(result.get(1).name, localDisabledTheme.manifest.name, "Unexpected extension for @installed query with category.");
    });
    await testableView.show('@installed category:"themes"').then((result) => {
      assert.strictEqual(result.length, 2, "Unexpected number of results for @installed query with quoted category");
      assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, "Unexpected extension for @installed query with quoted category.");
      assert.strictEqual(result.get(1).name, localDisabledTheme.manifest.name, "Unexpected extension for @installed query with quoted category.");
    });
    await testableView.show('@installed category:"programming languages"').then((result) => {
      assert.strictEqual(result.length, 2, "Unexpected number of results for @installed query with quoted category including space");
      assert.strictEqual(result.get(0).name, localEnabledLanguage.manifest.name, "Unexpected extension for @installed query with quoted category including space.");
      assert.strictEqual(result.get(1).name, localDisabledLanguage.manifest.name, "Unexpected extension for @installed query with quoted category inlcuding space.");
    });
    await testableView.show("@installed category:themes category:random").then((result) => {
      assert.strictEqual(result.length, 3, "Unexpected number of results for @installed query with multiple category");
      assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, "Unexpected extension for @installed query with multiple category.");
      assert.strictEqual(result.get(1).name, localRandom.manifest.name, "Unexpected extension for @installed query with multiple category.");
      assert.strictEqual(result.get(2).name, localDisabledTheme.manifest.name, "Unexpected extension for @installed query with multiple category.");
    });
    await testableView.show("@enabled category:themes").then((result) => {
      assert.strictEqual(result.length, 1, "Unexpected number of results for @enabled query with category");
      assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, "Unexpected extension for @enabled query with category.");
    });
    await testableView.show('@enabled category:"themes"').then((result) => {
      assert.strictEqual(result.length, 1, "Unexpected number of results for @enabled query with quoted category");
      assert.strictEqual(result.get(0).name, localEnabledTheme.manifest.name, "Unexpected extension for @enabled query with quoted category.");
    });
    await testableView.show('@enabled category:"programming languages"').then((result) => {
      assert.strictEqual(result.length, 1, "Unexpected number of results for @enabled query with quoted category inlcuding space");
      assert.strictEqual(result.get(0).name, localEnabledLanguage.manifest.name, "Unexpected extension for @enabled query with quoted category including space.");
    });
    await testableView.show("@disabled category:themes").then((result) => {
      assert.strictEqual(result.length, 1, "Unexpected number of results for @disabled query with category");
      assert.strictEqual(result.get(0).name, localDisabledTheme.manifest.name, "Unexpected extension for @disabled query with category.");
    });
    await testableView.show('@disabled category:"themes"').then((result) => {
      assert.strictEqual(result.length, 1, "Unexpected number of results for @disabled query with quoted category");
      assert.strictEqual(result.get(0).name, localDisabledTheme.manifest.name, "Unexpected extension for @disabled query with quoted category.");
    });
    await testableView.show('@disabled category:"programming languages"').then((result) => {
      assert.strictEqual(result.length, 1, "Unexpected number of results for @disabled query with quoted category inlcuding space");
      assert.strictEqual(result.get(0).name, localDisabledLanguage.manifest.name, "Unexpected extension for @disabled query with quoted category including space.");
    });
  });
  test("Test local query with sorting order", async () => {
    await testableView.show("@recentlyUpdated").then((result) => {
      assert.strictEqual(result.length, 1, "Unexpected number of results for @recentlyUpdated");
      assert.strictEqual(result.get(0).name, localDisabledLanguage.manifest.name, "Unexpected default sort order of extensions for @recentlyUpdate query");
    });
    await testableView.show("@installed @sort:updateDate").then((result) => {
      assert.strictEqual(result.length, 5, "Unexpected number of results for @sort:updateDate. Expected all localy installed Extension which are not builtin");
      const actual = [result.get(0).local?.installedTimestamp, result.get(1).local?.installedTimestamp, result.get(2).local?.installedTimestamp, result.get(3).local?.installedTimestamp, result.get(4).local?.installedTimestamp];
      const expected = [localEnabledLanguage.installedTimestamp, localDisabledLanguage.installedTimestamp, localRandom.installedTimestamp, localDisabledTheme.installedTimestamp, localEnabledTheme.installedTimestamp];
      for (let i = 0; i < result.length; i++) {
        assert.strictEqual(actual[i], expected[i], "Unexpected extension sorting for @sort:updateDate query.");
      }
    });
  });
  test("Test @recommended:workspace query", () => {
    const workspaceRecommendedExtensions = [
      workspaceRecommendationA,
      workspaceRecommendationB,
      configBasedRecommendationA
    ];
    return testableView.show("@recommended:workspace").then((result) => {
      assert.strictEqual(result.length, workspaceRecommendedExtensions.length);
      for (let i = 0; i < workspaceRecommendedExtensions.length; i++) {
        assert.strictEqual(result.get(i).identifier.id, workspaceRecommendedExtensions[i].identifier.id);
      }
    });
  });
  test("Test @recommended query", async () => {
    const allRecommendedExtensions = [
      fileBasedRecommendationA,
      fileBasedRecommendationB,
      configBasedRecommendationB,
      otherRecommendationA
    ];
    const result = await testableView.show("@recommended");
    assert.strictEqual(result.length, allRecommendedExtensions.length);
    for (let i = 0; i < allRecommendedExtensions.length; i++) {
      assert.strictEqual(result.get(i).identifier.id, allRecommendedExtensions[i].identifier.id);
    }
  });
  test("Test @recommended:all query", async () => {
    const allRecommendedExtensions = [
      workspaceRecommendationA,
      workspaceRecommendationB,
      configBasedRecommendationA,
      fileBasedRecommendationA,
      fileBasedRecommendationB,
      configBasedRecommendationB,
      otherRecommendationA
    ];
    const result = await testableView.show("@recommended:all");
    assert.strictEqual(result.length, allRecommendedExtensions.length);
    for (let i = 0; i < allRecommendedExtensions.length; i++) {
      assert.strictEqual(result.get(i).identifier.id, allRecommendedExtensions[i].identifier.id);
    }
  });
  test("Test search", async () => {
    const results = [
      fileBasedRecommendationA,
      workspaceRecommendationA,
      otherRecommendationA,
      workspaceRecommendationB
    ];
    queryPage = aPage(results);
    const result = await testableView.show("search-me");
    assert.strictEqual(result.length, results.length);
    for (let i = 0; i < results.length; i++) {
      assert.strictEqual(result.get(i).identifier.id, results[i].identifier.id);
    }
  });
  test("Test preferred search experiment", async () => {
    queryPage = aPage([
      fileBasedRecommendationA,
      workspaceRecommendationA,
      otherRecommendationA,
      workspaceRecommendationB
    ], 5);
    const notInFirstPage = aGalleryExtension("not-in-first-page");
    galleryExtensions.push(notInFirstPage);
    const expected = [
      workspaceRecommendationA,
      notInFirstPage,
      workspaceRecommendationB,
      fileBasedRecommendationA,
      otherRecommendationA
    ];
    instantiationService.stubPromise(IWorkbenchExtensionManagementService, "getExtensionsControlManifest", {
      malicious: [],
      deprecated: {},
      search: [{
        query: "search-me",
        preferredResults: [
          workspaceRecommendationA.identifier.id,
          notInFirstPage.identifier.id,
          workspaceRecommendationB.identifier.id
        ]
      }]
    });
    const testObject = disposableStore.add(instantiationService.createInstance(ExtensionsListView, {}, { id: "", title: "" }));
    const result = await testObject.show("search-me");
    assert.strictEqual(result.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      assert.strictEqual(result.get(i).identifier.id, expected[i].identifier.id);
    }
  });
  test("Skip preferred search experiment when user defines sort order", async () => {
    const realResults = [
      fileBasedRecommendationA,
      workspaceRecommendationA,
      otherRecommendationA,
      workspaceRecommendationB
    ];
    queryPage = aPage(realResults);
    const result = await testableView.show("search-me @sort:installs");
    assert.strictEqual(result.length, realResults.length);
    for (let i = 0; i < realResults.length; i++) {
      assert.strictEqual(result.get(i).identifier.id, realResults[i].identifier.id);
    }
  });
  function aLocalExtension(name = "someext", manifest = {}, properties = {}) {
    manifest = { name, publisher: "pub", version: "1.0.0", ...manifest };
    properties = {
      type: ExtensionType.User,
      location: URI.file(`pub.${name}`),
      identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name) },
      metadata: { id: getGalleryExtensionId(manifest.publisher, manifest.name), publisherId: manifest.publisher, publisherDisplayName: "somename" },
      ...properties,
      isValid: properties.isValid ?? true
    };
    properties.isBuiltin = properties.type === ExtensionType.System;
    return /* @__PURE__ */ Object.create({ manifest, ...properties });
  }
  function aGalleryExtension(name, properties = {}, galleryExtensionProperties = {}, assets = {}) {
    const targetPlatform = getTargetPlatform(platform, arch);
    const galleryExtension = /* @__PURE__ */ Object.create({ name, publisher: "pub", version: "1.0.0", allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, ...properties });
    galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
    galleryExtension.assets = { ...galleryExtension.assets, ...assets };
    galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
    return galleryExtension;
  }
  function aPage(objects = [], total) {
    return { firstPage: objects, total: total ?? objects.length, pageSize: objects.length, getPage: () => null };
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXGV4dGVuc2lvbnNWaWV3cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zTGlzdFZpZXcgfSBmcm9tICcuLi8uLi9icm93c2VyL2V4dGVuc2lvbnNWaWV3cy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0SUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElMb2NhbEV4dGVuc2lvbiwgSUdhbGxlcnlFeHRlbnNpb24sIElRdWVyeU9wdGlvbnMsXG5cdGdldFRhcmdldFBsYXRmb3JtLCBTb3J0Qnlcbn0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIEVuYWJsZW1lbnRTdGF0ZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgSVByb2ZpbGVBd2FyZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLCBFeHRlbnNpb25SZWNvbW1lbmRhdGlvblJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IGdldEdhbGxlcnlFeHRlbnNpb25JZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IFRlc3RFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvdGVzdC9icm93c2VyL2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLnRlc3QuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVVJMU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVBhZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGFnaW5nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlLCB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBUZXN0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RTaGFyZWRQcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvZWxlY3Ryb24tYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBOYXRpdmVVUkxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi91cmxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTaW5vblN0dWIgfSBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2VsZWN0cm9uLWJyb3dzZXIvcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUsIElFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElTaGFyZWRQcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2lwYy9lbGVjdHJvbi1icm93c2VyL3NlcnZpY2VzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IHBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYXJjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVXBkYXRlU2VydmljZSwgU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWV0ZXJlZENvbm5lY3Rpb24vY29tbW9uL21ldGVyZWRDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cywgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0b1VzZXJEYXRhUHJvZmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcblxuc3VpdGUoJ0V4dGVuc2lvbnNWaWV3cyBUZXN0cycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHRlc3RhYmxlVmlldzogRXh0ZW5zaW9uc0xpc3RWaWV3O1xuXG5cdGNvbnN0IGxvY2FsRW5hYmxlZFRoZW1lID0gYUxvY2FsRXh0ZW5zaW9uKCdmaXJzdC1lbmFibGVkLWV4dGVuc2lvbicsIHsgY2F0ZWdvcmllczogWydUaGVtZXMnLCAncmFuZG9tJ10gfSwgeyBpbnN0YWxsZWRUaW1lc3RhbXA6IDEyMzQ1NiB9KTtcblx0Y29uc3QgbG9jYWxFbmFibGVkTGFuZ3VhZ2UgPSBhTG9jYWxFeHRlbnNpb24oJ3NlY29uZC1lbmFibGVkLWV4dGVuc2lvbicsIHsgY2F0ZWdvcmllczogWydQcm9ncmFtbWluZyBsYW5ndWFnZXMnXSwgdmVyc2lvbjogJzEuMC4wJyB9LCB7IGluc3RhbGxlZFRpbWVzdGFtcDogRGF0ZS5ub3coKSwgdXBkYXRlZDogZmFsc2UgfSk7XG5cdGNvbnN0IGxvY2FsRGlzYWJsZWRUaGVtZSA9IGFMb2NhbEV4dGVuc2lvbignZmlyc3QtZGlzYWJsZWQtZXh0ZW5zaW9uJywgeyBjYXRlZ29yaWVzOiBbJ3RoZW1lcyddIH0sIHsgaW5zdGFsbGVkVGltZXN0YW1wOiAyMzQ1NjcgfSk7XG5cdGNvbnN0IGxvY2FsRGlzYWJsZWRMYW5ndWFnZSA9IGFMb2NhbEV4dGVuc2lvbignc2Vjb25kLWRpc2FibGVkLWV4dGVuc2lvbicsIHsgY2F0ZWdvcmllczogWydwcm9ncmFtbWluZyBsYW5ndWFnZXMnXSB9LCB7IGluc3RhbGxlZFRpbWVzdGFtcDogRGF0ZS5ub3coKSAtIDUwMDAwLCB1cGRhdGVkOiB0cnVlIH0pO1xuXHRjb25zdCBsb2NhbFJhbmRvbSA9IGFMb2NhbEV4dGVuc2lvbigncmFuZG9tLWVuYWJsZWQtZXh0ZW5zaW9uJywgeyBjYXRlZ29yaWVzOiBbJ3JhbmRvbSddIH0sIHsgaW5zdGFsbGVkVGltZXN0YW1wOiAzNDU2NzggfSk7XG5cdGNvbnN0IGJ1aWx0SW5UaGVtZSA9IGFMb2NhbEV4dGVuc2lvbignbXktdGhlbWUnLCB7IGNhdGVnb3JpZXM6IFsnVGhlbWVzJ10sIGNvbnRyaWJ1dGVzOiB7IHRoZW1lczogWydteS10aGVtZSddIH0gfSwgeyB0eXBlOiBFeHRlbnNpb25UeXBlLlN5c3RlbSwgaW5zdGFsbGVkVGltZXN0YW1wOiAyMjIgfSk7XG5cdGNvbnN0IGJ1aWx0SW5CYXNpYyA9IGFMb2NhbEV4dGVuc2lvbignbXktbGFuZycsIHsgY2F0ZWdvcmllczogWydQcm9ncmFtbWluZyBMYW5ndWFnZXMnXSwgY29udHJpYnV0ZXM6IHsgZ3JhbW1hcnM6IFt7IGxhbmd1YWdlOiAnbXktbGFuZ3VhZ2UnIH1dIH0gfSwgeyB0eXBlOiBFeHRlbnNpb25UeXBlLlN5c3RlbSwgaW5zdGFsbGVkVGltZXN0YW1wOiA2NjY2NjYgfSk7XG5cblx0bGV0IHF1ZXJ5UGFnZSA9IGFQYWdlKFtdKTtcblx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnM6IElHYWxsZXJ5RXh0ZW5zaW9uW10gPSBbXTtcblxuXHRjb25zdCB3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbkEgPSBhR2FsbGVyeUV4dGVuc2lvbignd29ya3NwYWNlLXJlY29tbWVuZGF0aW9uLUEnKTtcblx0Y29uc3Qgd29ya3NwYWNlUmVjb21tZW5kYXRpb25CID0gYUdhbGxlcnlFeHRlbnNpb24oJ3dvcmtzcGFjZS1yZWNvbW1lbmRhdGlvbi1CJyk7XG5cdGNvbnN0IGNvbmZpZ0Jhc2VkUmVjb21tZW5kYXRpb25BID0gYUdhbGxlcnlFeHRlbnNpb24oJ2NvbmZpZ2Jhc2VkLXJlY29tbWVuZGF0aW9uLUEnKTtcblx0Y29uc3QgY29uZmlnQmFzZWRSZWNvbW1lbmRhdGlvbkIgPSBhR2FsbGVyeUV4dGVuc2lvbignY29uZmlnYmFzZWQtcmVjb21tZW5kYXRpb24tQicpO1xuXHRjb25zdCBmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbkEgPSBhR2FsbGVyeUV4dGVuc2lvbignZmlsZWJhc2VkLXJlY29tbWVuZGF0aW9uLUEnKTtcblx0Y29uc3QgZmlsZUJhc2VkUmVjb21tZW5kYXRpb25CID0gYUdhbGxlcnlFeHRlbnNpb24oJ2ZpbGViYXNlZC1yZWNvbW1lbmRhdGlvbi1CJyk7XG5cdGNvbnN0IG90aGVyUmVjb21tZW5kYXRpb25BID0gYUdhbGxlcnlFeHRlbnNpb24oJ290aGVyLXJlY29tbWVuZGF0aW9uLUEnKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZHVjdFNlcnZpY2UsIHt9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIEV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZENoYW5nZUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdDogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQ2hhbmdlRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzOiBFdmVudC5Ob25lLFxuXHRcdFx0ZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzOiBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMuVW5hdmFpbGFibGUsXG5cdFx0XHRhc3luYyBnZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKSB7IHJldHVybiBudWxsOyB9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2hhcmVkUHJvY2Vzc1NlcnZpY2UsIFRlc3RTaGFyZWRQcm9jZXNzU2VydmljZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwge1xuXHRcdFx0b25JbnN0YWxsRXh0ZW5zaW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRJbnN0YWxsRXh0ZW5zaW9uczogRXZlbnQuTm9uZSxcblx0XHRcdG9uVW5pbnN0YWxsRXh0ZW5zaW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRVbmluc3RhbGxFeHRlbnNpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRDaGFuZ2VQcm9maWxlOiBFdmVudC5Ob25lLFxuXHRcdFx0b25Qcm9maWxlQXdhcmVEaWRJbnN0YWxsRXh0ZW5zaW9uczogRXZlbnQuTm9uZSxcblx0XHRcdGFzeW5jIGdldEluc3RhbGxlZCgpIHsgcmV0dXJuIFtdOyB9LFxuXHRcdFx0YXN5bmMgZ2V0SW5zdGFsbGVkV29ya3NwYWNlRXh0ZW5zaW9ucygpIHsgcmV0dXJuIFtdOyB9LFxuXHRcdFx0YXN5bmMgY2FuSW5zdGFsbCgpIHsgcmV0dXJuIHRydWU7IH0sXG5cdFx0XHRhc3luYyBnZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCkgeyByZXR1cm4geyBtYWxpY2lvdXM6IFtdLCBkZXByZWNhdGVkOiB7fSwgc2VhcmNoOiBbXSwgcHVibGlzaGVyTWFwcGluZzoge30gfTsgfSxcblx0XHRcdGFzeW5jIGdldFRhcmdldFBsYXRmb3JtKCkgeyByZXR1cm4gZ2V0VGFyZ2V0UGxhdGZvcm0ocGxhdGZvcm0sIGFyY2gpOyB9LFxuXHRcdFx0YXN5bmMgdXBkYXRlTWV0YWRhdGEobG9jYWwpIHsgcmV0dXJuIGxvY2FsOyB9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVtb3RlQWdlbnRTZXJ2aWNlLCBSZW1vdGVBZ2VudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1lbnVTZXJ2aWNlLCBuZXcgVGVzdE1lbnVTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyID0geyBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSkgYXMgSVByb2ZpbGVBd2FyZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBsYWJlbDogJ2xvY2FsJywgaWQ6ICd2c2NvZGUtbG9jYWwnIH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsIHtcblx0XHRcdGdldCBsb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIoKTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyO1xuXHRcdFx0fSxcblx0XHRcdGdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgfCBudWxsIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbi5sb2NhdGlvbi5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIEV4dGVuc2lvbiAke2V4dGVuc2lvbi5sb2NhdGlvbn1gKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBUZXN0RXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVXNlckRhdGFQcm9maWxlU2VydmljZSh0b1VzZXJEYXRhUHJvZmlsZSgndGVzdCcsICd0ZXN0JywgVVJJLmZpbGUoJ2ZvbycpLCBVUkkuZmlsZSgnY2FjaGUnKSkpKSk7XG5cblx0XHRjb25zdCByZWFzb25zOiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0ge307XG5cdFx0cmVhc29uc1t3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbkEuaWRlbnRpZmllci5pZF0gPSB7IHJlYXNvbklkOiBFeHRlbnNpb25SZWNvbW1lbmRhdGlvblJlYXNvbi5Xb3Jrc3BhY2UgfTtcblx0XHRyZWFzb25zW3dvcmtzcGFjZVJlY29tbWVuZGF0aW9uQi5pZGVudGlmaWVyLmlkXSA9IHsgcmVhc29uSWQ6IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uUmVhc29uLldvcmtzcGFjZSB9O1xuXHRcdHJlYXNvbnNbZmlsZUJhc2VkUmVjb21tZW5kYXRpb25BLmlkZW50aWZpZXIuaWRdID0geyByZWFzb25JZDogRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25SZWFzb24uRmlsZSB9O1xuXHRcdHJlYXNvbnNbZmlsZUJhc2VkUmVjb21tZW5kYXRpb25CLmlkZW50aWZpZXIuaWRdID0geyByZWFzb25JZDogRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25SZWFzb24uRmlsZSB9O1xuXHRcdHJlYXNvbnNbb3RoZXJSZWNvbW1lbmRhdGlvbkEuaWRlbnRpZmllci5pZF0gPSB7IHJlYXNvbklkOiBFeHRlbnNpb25SZWNvbW1lbmRhdGlvblJlYXNvbi5FeGVjdXRhYmxlIH07XG5cdFx0cmVhc29uc1tjb25maWdCYXNlZFJlY29tbWVuZGF0aW9uQS5pZGVudGlmaWVyLmlkXSA9IHsgcmVhc29uSWQ6IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uUmVhc29uLldvcmtzcGFjZUNvbmZpZyB9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UsIHtcblx0XHRcdGdldFdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucygpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXG5cdFx0XHRcdFx0d29ya3NwYWNlUmVjb21tZW5kYXRpb25BLmlkZW50aWZpZXIuaWQsXG5cdFx0XHRcdFx0d29ya3NwYWNlUmVjb21tZW5kYXRpb25CLmlkZW50aWZpZXIuaWRdKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRDb25maWdCYXNlZFJlY29tbWVuZGF0aW9ucygpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdFx0aW1wb3J0YW50OiBbY29uZmlnQmFzZWRSZWNvbW1lbmRhdGlvbkEuaWRlbnRpZmllci5pZF0sXG5cdFx0XHRcdFx0b3RoZXJzOiBbY29uZmlnQmFzZWRSZWNvbW1lbmRhdGlvbkIuaWRlbnRpZmllci5pZF0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldEltcG9ydGFudFJlY29tbWVuZGF0aW9ucygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0fSxcblx0XHRcdGdldEZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucygpIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbkEuaWRlbnRpZmllci5pZCxcblx0XHRcdFx0XHRmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbkIuaWRlbnRpZmllci5pZFxuXHRcdFx0XHRdO1xuXHRcdFx0fSxcblx0XHRcdGdldE90aGVyUmVjb21tZW5kYXRpb25zKCkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtcblx0XHRcdFx0XHRjb25maWdCYXNlZFJlY29tbWVuZGF0aW9uQi5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHRcdG90aGVyUmVjb21tZW5kYXRpb25BLmlkZW50aWZpZXIuaWRcblx0XHRcdFx0XSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QWxsUmVjb21tZW5kYXRpb25zV2l0aFJlYXNvbigpIHtcblx0XHRcdFx0cmV0dXJuIHJlYXNvbnM7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVVJMU2VydmljZSwgTmF0aXZlVVJMU2VydmljZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViUHJvbWlzZShJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsICdnZXRJbnN0YWxsZWQnLCBbbG9jYWxFbmFibGVkVGhlbWUsIGxvY2FsRW5hYmxlZExhbmd1YWdlLCBsb2NhbFJhbmRvbSwgbG9jYWxEaXNhYmxlZFRoZW1lLCBsb2NhbERpc2FibGVkTGFuZ3VhZ2UsIGJ1aWx0SW5UaGVtZSwgYnVpbHRJbkJhc2ljXSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YlByb21pc2UoSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCAnZ2V0RXh0ZW5zZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdGlvbnNSZXBvcnQnLCB7fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgPFBhcnRpYWw8SUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlPj57XG5cdFx0XHRxdWVyeTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcXVlcnlQYWdlO1xuXHRcdFx0fSxcblx0XHRcdGdldENvbXBhdGlibGVFeHRlbnNpb246IGFzeW5jIChnYWxsZXJ5KSA9PiB7XG5cdFx0XHRcdHJldHVybiBnYWxsZXJ5O1xuXHRcdFx0fSxcblx0XHRcdGdldEV4dGVuc2lvbnM6IGFzeW5jIChpbmZvcykgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IElHYWxsZXJ5RXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBpbmZvIG9mIGluZm9zKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZ2FsbGVyeUV4dGVuc2lvbnMuZmluZChlID0+IGUuaWRlbnRpZmllci5pZCA9PT0gaW5mby5pZCk7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0sXG5cdFx0XHRpc0VuYWJsZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRpc0V4dGVuc2lvbkNvbXBhdGlibGU6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIHtcblx0XHRcdGdldFZpZXdMb2NhdGlvbkJ5SWQoKTogVmlld0NvbnRhaW5lckxvY2F0aW9uIHtcblx0XHRcdFx0cmV0dXJuIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlTG9jYXRpb246IEV2ZW50Lk5vbmVcblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvblNlcnZpY2UsIHtcblx0XHRcdG9uRGlkQ2hhbmdlRXh0ZW5zaW9uczogRXZlbnQuTm9uZSxcblx0XHRcdGV4dGVuc2lvbnM6IFtcblx0XHRcdFx0dG9FeHRlbnNpb25EZXNjcmlwdGlvbihsb2NhbEVuYWJsZWRUaGVtZSksXG5cdFx0XHRcdHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24obG9jYWxFbmFibGVkTGFuZ3VhZ2UpLFxuXHRcdFx0XHR0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKGxvY2FsUmFuZG9tKSxcblx0XHRcdFx0dG9FeHRlbnNpb25EZXNjcmlwdGlvbihidWlsdEluVGhlbWUpLFxuXHRcdFx0XHR0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKGJ1aWx0SW5CYXNpYylcblx0XHRcdF0sXG5cdFx0XHRjYW5BZGRFeHRlbnNpb246IChleHRlbnNpb24pID0+IHRydWUsXG5cdFx0XHR3aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQ6ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKVxuXHRcdH0pO1xuXHRcdGF3YWl0ICg8VGVzdEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlPmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UpKS5zZXRFbmFibGVtZW50KFtsb2NhbERpc2FibGVkVGhlbWVdLCBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRHbG9iYWxseSk7XG5cdFx0YXdhaXQgKDxUZXN0RXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U+aW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSkpLnNldEVuYWJsZW1lbnQoW2xvY2FsRGlzYWJsZWRMYW5ndWFnZV0sIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEdsb2JhbGx5KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVwZGF0ZVNlcnZpY2UsIHsgb25TdGF0ZUNoYW5nZTogRXZlbnQuTm9uZSwgc3RhdGU6IFN0YXRlLlVuaW5pdGlhbGl6ZWQgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLCB7IGlzQ29ubmVjdGlvbk1ldGVyZWQ6IGZhbHNlLCBvbkRpZENoYW5nZUlzQ29ubmVjdGlvbk1ldGVyZWQ6IEV2ZW50Lk5vbmUgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSkpKTtcblx0XHR0ZXN0YWJsZVZpZXcgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNMaXN0Vmlldywge30sIHsgaWQ6ICcnLCB0aXRsZTogJycgfSkpO1xuXHRcdHF1ZXJ5UGFnZSA9IGFQYWdlKFtdKTtcblxuXHRcdGdhbGxlcnlFeHRlbnNpb25zLnNwbGljZSgwLCBnYWxsZXJ5RXh0ZW5zaW9ucy5sZW5ndGgsIC4uLltcblx0XHRcdHdvcmtzcGFjZVJlY29tbWVuZGF0aW9uQSxcblx0XHRcdHdvcmtzcGFjZVJlY29tbWVuZGF0aW9uQixcblx0XHRcdGNvbmZpZ0Jhc2VkUmVjb21tZW5kYXRpb25BLFxuXHRcdFx0Y29uZmlnQmFzZWRSZWNvbW1lbmRhdGlvbkIsXG5cdFx0XHRmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbkEsXG5cdFx0XHRmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbkIsXG5cdFx0XHRvdGhlclJlY29tbWVuZGF0aW9uQVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IHF1ZXJ5IHR5cGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChFeHRlbnNpb25zTGlzdFZpZXcuaXNCdWlsdEluRXh0ZW5zaW9uc1F1ZXJ5KCdAYnVpbHRpbicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTG9jYWxFeHRlbnNpb25zUXVlcnkoJ0BpbnN0YWxsZWQnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEV4dGVuc2lvbnNMaXN0Vmlldy5pc0xvY2FsRXh0ZW5zaW9uc1F1ZXJ5KCdAZW5hYmxlZCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTG9jYWxFeHRlbnNpb25zUXVlcnkoJ0BkaXNhYmxlZCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTG9jYWxFeHRlbnNpb25zUXVlcnkoJ0BvdXRkYXRlZCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTG9jYWxFeHRlbnNpb25zUXVlcnkoJ0B1cGRhdGVzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChFeHRlbnNpb25zTGlzdFZpZXcuaXNMb2NhbEV4dGVuc2lvbnNRdWVyeSgnQHNvcnQ6bmFtZScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTG9jYWxFeHRlbnNpb25zUXVlcnkoJ0Bzb3J0OnVwZGF0ZURhdGUnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEV4dGVuc2lvbnNMaXN0Vmlldy5pc0xvY2FsRXh0ZW5zaW9uc1F1ZXJ5KCdAaW5zdGFsbGVkIHNlYXJjaFRleHQnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEV4dGVuc2lvbnNMaXN0Vmlldy5pc0xvY2FsRXh0ZW5zaW9uc1F1ZXJ5KCdAZW5hYmxlZCBzZWFyY2hUZXh0JyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChFeHRlbnNpb25zTGlzdFZpZXcuaXNMb2NhbEV4dGVuc2lvbnNRdWVyeSgnQGRpc2FibGVkIHNlYXJjaFRleHQnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEV4dGVuc2lvbnNMaXN0Vmlldy5pc0xvY2FsRXh0ZW5zaW9uc1F1ZXJ5KCdAb3V0ZGF0ZWQgc2VhcmNoVGV4dCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTG9jYWxFeHRlbnNpb25zUXVlcnkoJ0B1cGRhdGVzIHNlYXJjaFRleHQnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEV4dGVuc2lvbnNMaXN0Vmlldy5pc0xvY2FsRXh0ZW5zaW9uc1F1ZXJ5KCdAYWdlbnRQbHVnaW5zIEBpbnN0YWxsZWQnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChFeHRlbnNpb25zTGlzdFZpZXcuaXNMb2NhbEV4dGVuc2lvbnNRdWVyeSgnQGFnZW50UGx1Z2lucyBAaW5zdGFsbGVkIHNlYXJjaFRleHQnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChFeHRlbnNpb25zTGlzdFZpZXcuaXNMb2NhbEV4dGVuc2lvbnNRdWVyeSgnQG1jcCBAaW5zdGFsbGVkJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzTG9jYWxFeHRlbnNpb25zUXVlcnkoJ0BtY3AgQGluc3RhbGxlZCBzZWFyY2hUZXh0JyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCBlbXB0eSBxdWVyeSBlcXVhdGVzIHRvIHNvcnQgYnkgaW5zdGFsbCBjb3VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSA8U2lub25TdHViPmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJQcm9taXNlKElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgJ3F1ZXJ5JywgYVBhZ2UoKSk7XG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJycpO1xuXHRcdGFzc2VydC5vayh0YXJnZXQuY2FsbGVkT25jZSk7XG5cdFx0Y29uc3Qgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucyA9IHRhcmdldC5hcmdzWzBdWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLnNvcnRCeSwgU29ydEJ5Lkluc3RhbGxDb3VudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3Qgbm9uIGVtcHR5IHF1ZXJ5IHdpdGhvdXQgc29ydCBkb2VzbnQgdXNlIHNvcnRCeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSA8U2lub25TdHViPmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJQcm9taXNlKElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgJ3F1ZXJ5JywgYVBhZ2UoKSk7XG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ3NvbWUgZXh0ZW5zaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldC5jYWxsZWRPbmNlKTtcblx0XHRjb25zdCBvcHRpb25zOiBJUXVlcnlPcHRpb25zID0gdGFyZ2V0LmFyZ3NbMF1bMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuc29ydEJ5LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IHF1ZXJ5IHdpdGggc29ydCB1c2VzIHNvcnRCeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSA8U2lub25TdHViPmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJQcm9taXNlKElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgJ3F1ZXJ5JywgYVBhZ2UoKSk7XG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ3NvbWUgZXh0ZW5zaW9uIEBzb3J0OnJhdGluZycpO1xuXHRcdGFzc2VydC5vayh0YXJnZXQuY2FsbGVkT25jZSk7XG5cdFx0Y29uc3Qgb3B0aW9uczogSVF1ZXJ5T3B0aW9ucyA9IHRhcmdldC5hcmdzWzBdWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLnNvcnRCeSwgU29ydEJ5LldlaWdodGVkUmF0aW5nKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCBkZWZhdWx0IHZpZXcgYWN0aW9ucyByZXF1aXJlZCBzb3J0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdHF1ZXJ5UGFnZSA9IGFQYWdlKFthR2FsbGVyeUV4dGVuc2lvbihsb2NhbEVuYWJsZWRMYW5ndWFnZS5tYW5pZmVzdC5uYW1lLCB7IC4uLmxvY2FsRW5hYmxlZExhbmd1YWdlLm1hbmlmZXN0LCB2ZXJzaW9uOiAnMS4wLjEnLCBpZGVudGlmaWVyOiBsb2NhbERpc2FibGVkTGFuZ3VhZ2UuaWRlbnRpZmllciB9KV0pO1xuXG5cdFx0Y29uc3Qgd29ya2JlbmNoU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IChhd2FpdCB3b3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwoKSkuZmluZChleCA9PiBleC5pZGVudGlmaWVyLmlkID09PSBsb2NhbEVuYWJsZWRMYW5ndWFnZS5pZGVudGlmaWVyLmlkKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KGMgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHdvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uPy5vdXRkYXRlZCkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5xdWVyeUdhbGxlcnkoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0YWJsZVZpZXcuc2hvdygnQGluc3RhbGxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCA1LCAnVW5leHBlY3RlZCBudW1iZXIgb2YgcmVzdWx0cyBmb3IgQGluc3RhbGxlZCBxdWVyeScpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IFtyZXN1bHQuZ2V0KDApLm5hbWUsIHJlc3VsdC5nZXQoMSkubmFtZSwgcmVzdWx0LmdldCgyKS5uYW1lLCByZXN1bHQuZ2V0KDMpLm5hbWUsIHJlc3VsdC5nZXQoNCkubmFtZV07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbbG9jYWxFbmFibGVkTGFuZ3VhZ2UubWFuaWZlc3QubmFtZSwgbG9jYWxFbmFibGVkVGhlbWUubWFuaWZlc3QubmFtZSwgbG9jYWxSYW5kb20ubWFuaWZlc3QubmFtZSwgbG9jYWxEaXNhYmxlZFRoZW1lLm1hbmlmZXN0Lm5hbWUsIGxvY2FsRGlzYWJsZWRMYW5ndWFnZS5tYW5pZmVzdC5uYW1lXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJlc3VsdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFtpXSwgZXhwZWN0ZWRbaV0sICdVbmV4cGVjdGVkIGV4dGVuc2lvbiBmb3IgQGluc3RhbGxlZCBxdWVyeSB3aXRoIG91dGFkdGVkIGV4dGVuc2lvbi4nKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgaW5zdGFsbGVkIHF1ZXJ5IHJlc3VsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ0BpbnN0YWxsZWQnKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgNSwgJ1VuZXhwZWN0ZWQgbnVtYmVyIG9mIHJlc3VsdHMgZm9yIEBpbnN0YWxsZWQgcXVlcnknKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IFtyZXN1bHQuZ2V0KDApLm5hbWUsIHJlc3VsdC5nZXQoMSkubmFtZSwgcmVzdWx0LmdldCgyKS5uYW1lLCByZXN1bHQuZ2V0KDMpLm5hbWUsIHJlc3VsdC5nZXQoNCkubmFtZV0uc29ydCgpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbbG9jYWxEaXNhYmxlZFRoZW1lLm1hbmlmZXN0Lm5hbWUsIGxvY2FsRW5hYmxlZFRoZW1lLm1hbmlmZXN0Lm5hbWUsIGxvY2FsUmFuZG9tLm1hbmlmZXN0Lm5hbWUsIGxvY2FsRGlzYWJsZWRMYW5ndWFnZS5tYW5pZmVzdC5uYW1lLCBsb2NhbEVuYWJsZWRMYW5ndWFnZS5tYW5pZmVzdC5uYW1lXTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdWx0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbaV0sIGV4cGVjdGVkW2ldLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBpbnN0YWxsZWQgcXVlcnkuJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0ZXN0YWJsZVZpZXcuc2hvdygnQGluc3RhbGxlZCBmaXJzdCcpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyLCAnVW5leHBlY3RlZCBudW1iZXIgb2YgcmVzdWx0cyBmb3IgQGluc3RhbGxlZCBxdWVyeScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoMCkubmFtZSwgbG9jYWxFbmFibGVkVGhlbWUubWFuaWZlc3QubmFtZSwgJ1VuZXhwZWN0ZWQgZXh0ZW5zaW9uIGZvciBAaW5zdGFsbGVkIHF1ZXJ5IHdpdGggc2VhcmNoIHRleHQuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCgxKS5uYW1lLCBsb2NhbERpc2FibGVkVGhlbWUubWFuaWZlc3QubmFtZSwgJ1VuZXhwZWN0ZWQgZXh0ZW5zaW9uIGZvciBAaW5zdGFsbGVkIHF1ZXJ5IHdpdGggc2VhcmNoIHRleHQuJyk7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0ZXN0YWJsZVZpZXcuc2hvdygnQGRpc2FibGVkJykudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdVbmV4cGVjdGVkIG51bWJlciBvZiByZXN1bHRzIGZvciBAZGlzYWJsZWQgcXVlcnknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDApLm5hbWUsIGxvY2FsRGlzYWJsZWRUaGVtZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBkaXNhYmxlZCBxdWVyeS4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDEpLm5hbWUsIGxvY2FsRGlzYWJsZWRMYW5ndWFnZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBkaXNhYmxlZCBxdWVyeS4nKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IHRlc3RhYmxlVmlldy5zaG93KCdAZW5hYmxlZCcpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAzLCAnVW5leHBlY3RlZCBudW1iZXIgb2YgcmVzdWx0cyBmb3IgQGVuYWJsZWQgcXVlcnknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDApLm5hbWUsIGxvY2FsRW5hYmxlZFRoZW1lLm1hbmlmZXN0Lm5hbWUsICdVbmV4cGVjdGVkIGV4dGVuc2lvbiBmb3IgQGVuYWJsZWQgcXVlcnkuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCgxKS5uYW1lLCBsb2NhbFJhbmRvbS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBlbmFibGVkIHF1ZXJ5LicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoMikubmFtZSwgbG9jYWxFbmFibGVkTGFuZ3VhZ2UubWFuaWZlc3QubmFtZSwgJ1VuZXhwZWN0ZWQgZXh0ZW5zaW9uIGZvciBAZW5hYmxlZCBxdWVyeS4nKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IHRlc3RhYmxlVmlldy5zaG93KCdAYnVpbHRpbiBjYXRlZ29yeTp0aGVtZXMnKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1VuZXhwZWN0ZWQgbnVtYmVyIG9mIHJlc3VsdHMgZm9yIEBidWlsdGluIGNhdGVnb3J5OnRoZW1lcyBxdWVyeScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoMCkubmFtZSwgYnVpbHRJblRoZW1lLm1hbmlmZXN0Lm5hbWUsICdVbmV4cGVjdGVkIGV4dGVuc2lvbiBmb3IgQGJ1aWx0aW46dGhlbWVzIHF1ZXJ5LicpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ0BidWlsdGluIGNhdGVnb3J5OlwicHJvZ3JhbW1pbmcgbGFuZ3VhZ2VzXCInKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1VuZXhwZWN0ZWQgbnVtYmVyIG9mIHJlc3VsdHMgZm9yIEBidWlsdGluOmJhc2ljcyBxdWVyeScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoMCkubmFtZSwgYnVpbHRJbkJhc2ljLm1hbmlmZXN0Lm5hbWUsICdVbmV4cGVjdGVkIGV4dGVuc2lvbiBmb3IgQGJ1aWx0aW46YmFzaWNzIHF1ZXJ5LicpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ0BidWlsdGluJykudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdVbmV4cGVjdGVkIG51bWJlciBvZiByZXN1bHRzIGZvciBAYnVpbHRpbiBxdWVyeScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoMCkubmFtZSwgYnVpbHRJbkJhc2ljLm1hbmlmZXN0Lm5hbWUsICdVbmV4cGVjdGVkIGV4dGVuc2lvbiBmb3IgQGJ1aWx0aW4gcXVlcnkuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCgxKS5uYW1lLCBidWlsdEluVGhlbWUubWFuaWZlc3QubmFtZSwgJ1VuZXhwZWN0ZWQgZXh0ZW5zaW9uIGZvciBAYnVpbHRpbiBxdWVyeS4nKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IHRlc3RhYmxlVmlldy5zaG93KCdAYnVpbHRpbiBteS10aGVtZScpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxLCAnVW5leHBlY3RlZCBudW1iZXIgb2YgcmVzdWx0cyBmb3IgQGJ1aWx0aW4gcXVlcnknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDApLm5hbWUsIGJ1aWx0SW5UaGVtZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBidWlsdGluIHF1ZXJ5LicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IGluc3RhbGxlZCBxdWVyeSB3aXRoIGNhdGVnb3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RhYmxlVmlldy5zaG93KCdAaW5zdGFsbGVkIGNhdGVnb3J5OnRoZW1lcycpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyLCAnVW5leHBlY3RlZCBudW1iZXIgb2YgcmVzdWx0cyBmb3IgQGluc3RhbGxlZCBxdWVyeSB3aXRoIGNhdGVnb3J5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCgwKS5uYW1lLCBsb2NhbEVuYWJsZWRUaGVtZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBpbnN0YWxsZWQgcXVlcnkgd2l0aCBjYXRlZ29yeS4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDEpLm5hbWUsIGxvY2FsRGlzYWJsZWRUaGVtZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBpbnN0YWxsZWQgcXVlcnkgd2l0aCBjYXRlZ29yeS4nKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IHRlc3RhYmxlVmlldy5zaG93KCdAaW5zdGFsbGVkIGNhdGVnb3J5OlwidGhlbWVzXCInKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMiwgJ1VuZXhwZWN0ZWQgbnVtYmVyIG9mIHJlc3VsdHMgZm9yIEBpbnN0YWxsZWQgcXVlcnkgd2l0aCBxdW90ZWQgY2F0ZWdvcnknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDApLm5hbWUsIGxvY2FsRW5hYmxlZFRoZW1lLm1hbmlmZXN0Lm5hbWUsICdVbmV4cGVjdGVkIGV4dGVuc2lvbiBmb3IgQGluc3RhbGxlZCBxdWVyeSB3aXRoIHF1b3RlZCBjYXRlZ29yeS4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDEpLm5hbWUsIGxvY2FsRGlzYWJsZWRUaGVtZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBpbnN0YWxsZWQgcXVlcnkgd2l0aCBxdW90ZWQgY2F0ZWdvcnkuJyk7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0ZXN0YWJsZVZpZXcuc2hvdygnQGluc3RhbGxlZCBjYXRlZ29yeTpcInByb2dyYW1taW5nIGxhbmd1YWdlc1wiJykudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdVbmV4cGVjdGVkIG51bWJlciBvZiByZXN1bHRzIGZvciBAaW5zdGFsbGVkIHF1ZXJ5IHdpdGggcXVvdGVkIGNhdGVnb3J5IGluY2x1ZGluZyBzcGFjZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoMCkubmFtZSwgbG9jYWxFbmFibGVkTGFuZ3VhZ2UubWFuaWZlc3QubmFtZSwgJ1VuZXhwZWN0ZWQgZXh0ZW5zaW9uIGZvciBAaW5zdGFsbGVkIHF1ZXJ5IHdpdGggcXVvdGVkIGNhdGVnb3J5IGluY2x1ZGluZyBzcGFjZS4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDEpLm5hbWUsIGxvY2FsRGlzYWJsZWRMYW5ndWFnZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBpbnN0YWxsZWQgcXVlcnkgd2l0aCBxdW90ZWQgY2F0ZWdvcnkgaW5sY3VkaW5nIHNwYWNlLicpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ0BpbnN0YWxsZWQgY2F0ZWdvcnk6dGhlbWVzIGNhdGVnb3J5OnJhbmRvbScpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAzLCAnVW5leHBlY3RlZCBudW1iZXIgb2YgcmVzdWx0cyBmb3IgQGluc3RhbGxlZCBxdWVyeSB3aXRoIG11bHRpcGxlIGNhdGVnb3J5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCgwKS5uYW1lLCBsb2NhbEVuYWJsZWRUaGVtZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBpbnN0YWxsZWQgcXVlcnkgd2l0aCBtdWx0aXBsZSBjYXRlZ29yeS4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDEpLm5hbWUsIGxvY2FsUmFuZG9tLm1hbmlmZXN0Lm5hbWUsICdVbmV4cGVjdGVkIGV4dGVuc2lvbiBmb3IgQGluc3RhbGxlZCBxdWVyeSB3aXRoIG11bHRpcGxlIGNhdGVnb3J5LicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoMikubmFtZSwgbG9jYWxEaXNhYmxlZFRoZW1lLm1hbmlmZXN0Lm5hbWUsICdVbmV4cGVjdGVkIGV4dGVuc2lvbiBmb3IgQGluc3RhbGxlZCBxdWVyeSB3aXRoIG11bHRpcGxlIGNhdGVnb3J5LicpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ0BlbmFibGVkIGNhdGVnb3J5OnRoZW1lcycpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxLCAnVW5leHBlY3RlZCBudW1iZXIgb2YgcmVzdWx0cyBmb3IgQGVuYWJsZWQgcXVlcnkgd2l0aCBjYXRlZ29yeScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoMCkubmFtZSwgbG9jYWxFbmFibGVkVGhlbWUubWFuaWZlc3QubmFtZSwgJ1VuZXhwZWN0ZWQgZXh0ZW5zaW9uIGZvciBAZW5hYmxlZCBxdWVyeSB3aXRoIGNhdGVnb3J5LicpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ0BlbmFibGVkIGNhdGVnb3J5OlwidGhlbWVzXCInKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1VuZXhwZWN0ZWQgbnVtYmVyIG9mIHJlc3VsdHMgZm9yIEBlbmFibGVkIHF1ZXJ5IHdpdGggcXVvdGVkIGNhdGVnb3J5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCgwKS5uYW1lLCBsb2NhbEVuYWJsZWRUaGVtZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBlbmFibGVkIHF1ZXJ5IHdpdGggcXVvdGVkIGNhdGVnb3J5LicpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ0BlbmFibGVkIGNhdGVnb3J5OlwicHJvZ3JhbW1pbmcgbGFuZ3VhZ2VzXCInKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1VuZXhwZWN0ZWQgbnVtYmVyIG9mIHJlc3VsdHMgZm9yIEBlbmFibGVkIHF1ZXJ5IHdpdGggcXVvdGVkIGNhdGVnb3J5IGlubGN1ZGluZyBzcGFjZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoMCkubmFtZSwgbG9jYWxFbmFibGVkTGFuZ3VhZ2UubWFuaWZlc3QubmFtZSwgJ1VuZXhwZWN0ZWQgZXh0ZW5zaW9uIGZvciBAZW5hYmxlZCBxdWVyeSB3aXRoIHF1b3RlZCBjYXRlZ29yeSBpbmNsdWRpbmcgc3BhY2UuJyk7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0ZXN0YWJsZVZpZXcuc2hvdygnQGRpc2FibGVkIGNhdGVnb3J5OnRoZW1lcycpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxLCAnVW5leHBlY3RlZCBudW1iZXIgb2YgcmVzdWx0cyBmb3IgQGRpc2FibGVkIHF1ZXJ5IHdpdGggY2F0ZWdvcnknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDApLm5hbWUsIGxvY2FsRGlzYWJsZWRUaGVtZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBkaXNhYmxlZCBxdWVyeSB3aXRoIGNhdGVnb3J5LicpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ0BkaXNhYmxlZCBjYXRlZ29yeTpcInRoZW1lc1wiJykudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEsICdVbmV4cGVjdGVkIG51bWJlciBvZiByZXN1bHRzIGZvciBAZGlzYWJsZWQgcXVlcnkgd2l0aCBxdW90ZWQgY2F0ZWdvcnknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDApLm5hbWUsIGxvY2FsRGlzYWJsZWRUaGVtZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBleHRlbnNpb24gZm9yIEBkaXNhYmxlZCBxdWVyeSB3aXRoIHF1b3RlZCBjYXRlZ29yeS4nKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IHRlc3RhYmxlVmlldy5zaG93KCdAZGlzYWJsZWQgY2F0ZWdvcnk6XCJwcm9ncmFtbWluZyBsYW5ndWFnZXNcIicpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxLCAnVW5leHBlY3RlZCBudW1iZXIgb2YgcmVzdWx0cyBmb3IgQGRpc2FibGVkIHF1ZXJ5IHdpdGggcXVvdGVkIGNhdGVnb3J5IGlubGN1ZGluZyBzcGFjZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoMCkubmFtZSwgbG9jYWxEaXNhYmxlZExhbmd1YWdlLm1hbmlmZXN0Lm5hbWUsICdVbmV4cGVjdGVkIGV4dGVuc2lvbiBmb3IgQGRpc2FibGVkIHF1ZXJ5IHdpdGggcXVvdGVkIGNhdGVnb3J5IGluY2x1ZGluZyBzcGFjZS4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCBsb2NhbCBxdWVyeSB3aXRoIHNvcnRpbmcgb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ0ByZWNlbnRseVVwZGF0ZWQnKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1VuZXhwZWN0ZWQgbnVtYmVyIG9mIHJlc3VsdHMgZm9yIEByZWNlbnRseVVwZGF0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KDApLm5hbWUsIGxvY2FsRGlzYWJsZWRMYW5ndWFnZS5tYW5pZmVzdC5uYW1lLCAnVW5leHBlY3RlZCBkZWZhdWx0IHNvcnQgb3JkZXIgb2YgZXh0ZW5zaW9ucyBmb3IgQHJlY2VudGx5VXBkYXRlIHF1ZXJ5Jyk7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0ZXN0YWJsZVZpZXcuc2hvdygnQGluc3RhbGxlZCBAc29ydDp1cGRhdGVEYXRlJykudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDUsICdVbmV4cGVjdGVkIG51bWJlciBvZiByZXN1bHRzIGZvciBAc29ydDp1cGRhdGVEYXRlLiBFeHBlY3RlZCBhbGwgbG9jYWx5IGluc3RhbGxlZCBFeHRlbnNpb24gd2hpY2ggYXJlIG5vdCBidWlsdGluJyk7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBbcmVzdWx0LmdldCgwKS5sb2NhbD8uaW5zdGFsbGVkVGltZXN0YW1wLCByZXN1bHQuZ2V0KDEpLmxvY2FsPy5pbnN0YWxsZWRUaW1lc3RhbXAsIHJlc3VsdC5nZXQoMikubG9jYWw/Lmluc3RhbGxlZFRpbWVzdGFtcCwgcmVzdWx0LmdldCgzKS5sb2NhbD8uaW5zdGFsbGVkVGltZXN0YW1wLCByZXN1bHQuZ2V0KDQpLmxvY2FsPy5pbnN0YWxsZWRUaW1lc3RhbXBdO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbbG9jYWxFbmFibGVkTGFuZ3VhZ2UuaW5zdGFsbGVkVGltZXN0YW1wLCBsb2NhbERpc2FibGVkTGFuZ3VhZ2UuaW5zdGFsbGVkVGltZXN0YW1wLCBsb2NhbFJhbmRvbS5pbnN0YWxsZWRUaW1lc3RhbXAsIGxvY2FsRGlzYWJsZWRUaGVtZS5pbnN0YWxsZWRUaW1lc3RhbXAsIGxvY2FsRW5hYmxlZFRoZW1lLmluc3RhbGxlZFRpbWVzdGFtcF07XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJlc3VsdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsW2ldLCBleHBlY3RlZFtpXSwgJ1VuZXhwZWN0ZWQgZXh0ZW5zaW9uIHNvcnRpbmcgZm9yIEBzb3J0OnVwZGF0ZURhdGUgcXVlcnkuJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgQHJlY29tbWVuZGVkOndvcmtzcGFjZSBxdWVyeScsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnMgPSBbXG5cdFx0XHR3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbkEsXG5cdFx0XHR3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbkIsXG5cdFx0XHRjb25maWdCYXNlZFJlY29tbWVuZGF0aW9uQSxcblx0XHRdO1xuXG5cdFx0cmV0dXJuIHRlc3RhYmxlVmlldy5zaG93KCdAcmVjb21tZW5kZWQ6d29ya3NwYWNlJykudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIHdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9ucy5sZW5ndGgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB3b3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoaSkuaWRlbnRpZmllci5pZCwgd29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zW2ldLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IEByZWNvbW1lbmRlZCBxdWVyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhbGxSZWNvbW1lbmRlZEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbkEsXG5cdFx0XHRmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbkIsXG5cdFx0XHRjb25maWdCYXNlZFJlY29tbWVuZGF0aW9uQixcblx0XHRcdG90aGVyUmVjb21tZW5kYXRpb25BXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RhYmxlVmlldy5zaG93KCdAcmVjb21tZW5kZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgYWxsUmVjb21tZW5kZWRFeHRlbnNpb25zLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhbGxSZWNvbW1lbmRlZEV4dGVuc2lvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KGkpLmlkZW50aWZpZXIuaWQsIGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uc1tpXS5pZGVudGlmaWVyLmlkKTtcblx0XHR9XG5cdH0pO1xuXG5cblx0dGVzdCgnVGVzdCBAcmVjb21tZW5kZWQ6YWxsIHF1ZXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9ucyA9IFtcblx0XHRcdHdvcmtzcGFjZVJlY29tbWVuZGF0aW9uQSxcblx0XHRcdHdvcmtzcGFjZVJlY29tbWVuZGF0aW9uQixcblx0XHRcdGNvbmZpZ0Jhc2VkUmVjb21tZW5kYXRpb25BLFxuXHRcdFx0ZmlsZUJhc2VkUmVjb21tZW5kYXRpb25BLFxuXHRcdFx0ZmlsZUJhc2VkUmVjb21tZW5kYXRpb25CLFxuXHRcdFx0Y29uZmlnQmFzZWRSZWNvbW1lbmRhdGlvbkIsXG5cdFx0XHRvdGhlclJlY29tbWVuZGF0aW9uQSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ0ByZWNvbW1lbmRlZDphbGwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgYWxsUmVjb21tZW5kZWRFeHRlbnNpb25zLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhbGxSZWNvbW1lbmRlZEV4dGVuc2lvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KGkpLmlkZW50aWZpZXIuaWQsIGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uc1tpXS5pZGVudGlmaWVyLmlkKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3Qgc2VhcmNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBbXG5cdFx0XHRmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbkEsXG5cdFx0XHR3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbkEsXG5cdFx0XHRvdGhlclJlY29tbWVuZGF0aW9uQSxcblx0XHRcdHdvcmtzcGFjZVJlY29tbWVuZGF0aW9uQlxuXHRcdF07XG5cdFx0cXVlcnlQYWdlID0gYVBhZ2UocmVzdWx0cyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdGFibGVWaWV3LnNob3coJ3NlYXJjaC1tZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCByZXN1bHRzLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXN1bHRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldChpKS5pZGVudGlmaWVyLmlkLCByZXN1bHRzW2ldLmlkZW50aWZpZXIuaWQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnVGVzdCBwcmVmZXJyZWQgc2VhcmNoIGV4cGVyaW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cXVlcnlQYWdlID0gYVBhZ2UoW1xuXHRcdFx0ZmlsZUJhc2VkUmVjb21tZW5kYXRpb25BLFxuXHRcdFx0d29ya3NwYWNlUmVjb21tZW5kYXRpb25BLFxuXHRcdFx0b3RoZXJSZWNvbW1lbmRhdGlvbkEsXG5cdFx0XHR3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbkJcblx0XHRdLCA1KTtcblx0XHRjb25zdCBub3RJbkZpcnN0UGFnZSA9IGFHYWxsZXJ5RXh0ZW5zaW9uKCdub3QtaW4tZmlyc3QtcGFnZScpO1xuXHRcdGdhbGxlcnlFeHRlbnNpb25zLnB1c2gobm90SW5GaXJzdFBhZ2UpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0d29ya3NwYWNlUmVjb21tZW5kYXRpb25BLFxuXHRcdFx0bm90SW5GaXJzdFBhZ2UsXG5cdFx0XHR3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbkIsXG5cdFx0XHRmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbkEsXG5cdFx0XHRvdGhlclJlY29tbWVuZGF0aW9uQSxcblx0XHRdO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YlByb21pc2UoSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCAnZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCcsIHtcblx0XHRcdG1hbGljaW91czogW10sIGRlcHJlY2F0ZWQ6IHt9LFxuXHRcdFx0c2VhcmNoOiBbe1xuXHRcdFx0XHRxdWVyeTogJ3NlYXJjaC1tZScsXG5cdFx0XHRcdHByZWZlcnJlZFJlc3VsdHM6IFtcblx0XHRcdFx0XHR3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbkEuaWRlbnRpZmllci5pZCxcblx0XHRcdFx0XHRub3RJbkZpcnN0UGFnZS5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHRcdHdvcmtzcGFjZVJlY29tbWVuZGF0aW9uQi5pZGVudGlmaWVyLmlkXG5cdFx0XHRcdF1cblx0XHRcdH1dXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zTGlzdFZpZXcsIHt9LCB7IGlkOiAnJywgdGl0bGU6ICcnIH0pKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0T2JqZWN0LnNob3coJ3NlYXJjaC1tZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCBleHBlY3RlZC5sZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZXhwZWN0ZWQubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0KGkpLmlkZW50aWZpZXIuaWQsIGV4cGVjdGVkW2ldLmlkZW50aWZpZXIuaWQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnU2tpcCBwcmVmZXJyZWQgc2VhcmNoIGV4cGVyaW1lbnQgd2hlbiB1c2VyIGRlZmluZXMgc29ydCBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWFsUmVzdWx0cyA9IFtcblx0XHRcdGZpbGVCYXNlZFJlY29tbWVuZGF0aW9uQSxcblx0XHRcdHdvcmtzcGFjZVJlY29tbWVuZGF0aW9uQSxcblx0XHRcdG90aGVyUmVjb21tZW5kYXRpb25BLFxuXHRcdFx0d29ya3NwYWNlUmVjb21tZW5kYXRpb25CXG5cdFx0XTtcblx0XHRxdWVyeVBhZ2UgPSBhUGFnZShyZWFsUmVzdWx0cyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0YWJsZVZpZXcuc2hvdygnc2VhcmNoLW1lIEBzb3J0Omluc3RhbGxzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIHJlYWxSZXN1bHRzLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZWFsUmVzdWx0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXQoaSkuaWRlbnRpZmllci5pZCwgcmVhbFJlc3VsdHNbaV0uaWRlbnRpZmllci5pZCk7XG5cdFx0fVxuXHR9KTtcblxuXHRmdW5jdGlvbiBhTG9jYWxFeHRlbnNpb24obmFtZTogc3RyaW5nID0gJ3NvbWVleHQnLCBtYW5pZmVzdDogYW55ID0ge30sIHByb3BlcnRpZXM6IGFueSA9IHt9KTogSUxvY2FsRXh0ZW5zaW9uIHtcblx0XHRtYW5pZmVzdCA9IHsgbmFtZSwgcHVibGlzaGVyOiAncHViJywgdmVyc2lvbjogJzEuMC4wJywgLi4ubWFuaWZlc3QgfTtcblx0XHRwcm9wZXJ0aWVzID0ge1xuXHRcdFx0dHlwZTogRXh0ZW5zaW9uVHlwZS5Vc2VyLFxuXHRcdFx0bG9jYXRpb246IFVSSS5maWxlKGBwdWIuJHtuYW1lfWApLFxuXHRcdFx0aWRlbnRpZmllcjogeyBpZDogZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSkgfSxcblx0XHRcdG1ldGFkYXRhOiB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKSwgcHVibGlzaGVySWQ6IG1hbmlmZXN0LnB1Ymxpc2hlciwgcHVibGlzaGVyRGlzcGxheU5hbWU6ICdzb21lbmFtZScgfSxcblx0XHRcdC4uLnByb3BlcnRpZXMsXG5cdFx0XHRpc1ZhbGlkOiBwcm9wZXJ0aWVzLmlzVmFsaWQgPz8gdHJ1ZSxcblx0XHR9O1xuXHRcdHByb3BlcnRpZXMuaXNCdWlsdGluID0gcHJvcGVydGllcy50eXBlID09PSBFeHRlbnNpb25UeXBlLlN5c3RlbTtcblx0XHRyZXR1cm4gPElMb2NhbEV4dGVuc2lvbj5PYmplY3QuY3JlYXRlKHsgbWFuaWZlc3QsIC4uLnByb3BlcnRpZXMgfSk7XG5cdH1cblxuXHRmdW5jdGlvbiBhR2FsbGVyeUV4dGVuc2lvbihuYW1lOiBzdHJpbmcsIHByb3BlcnRpZXM6IGFueSA9IHt9LCBnYWxsZXJ5RXh0ZW5zaW9uUHJvcGVydGllczogYW55ID0ge30sIGFzc2V0czogYW55ID0ge30pOiBJR2FsbGVyeUV4dGVuc2lvbiB7XG5cdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSBnZXRUYXJnZXRQbGF0Zm9ybShwbGF0Zm9ybSwgYXJjaCk7XG5cdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbiA9IDxJR2FsbGVyeUV4dGVuc2lvbj5PYmplY3QuY3JlYXRlKHsgbmFtZSwgcHVibGlzaGVyOiAncHViJywgdmVyc2lvbjogJzEuMC4wJywgYWxsVGFyZ2V0UGxhdGZvcm1zOiBbdGFyZ2V0UGxhdGZvcm1dLCBwcm9wZXJ0aWVzOiB7fSwgYXNzZXRzOiB7fSwgLi4ucHJvcGVydGllcyB9KTtcblx0XHRnYWxsZXJ5RXh0ZW5zaW9uLnByb3BlcnRpZXMgPSB7IC4uLmdhbGxlcnlFeHRlbnNpb24ucHJvcGVydGllcywgZGVwZW5kZW5jaWVzOiBbXSwgdGFyZ2V0UGxhdGZvcm0sIC4uLmdhbGxlcnlFeHRlbnNpb25Qcm9wZXJ0aWVzIH07XG5cdFx0Z2FsbGVyeUV4dGVuc2lvbi5hc3NldHMgPSB7IC4uLmdhbGxlcnlFeHRlbnNpb24uYXNzZXRzLCAuLi5hc3NldHMgfTtcblx0XHRnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIgPSB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQoZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXIsIGdhbGxlcnlFeHRlbnNpb24ubmFtZSksIHV1aWQ6IGdlbmVyYXRlVXVpZCgpIH07XG5cdFx0cmV0dXJuIDxJR2FsbGVyeUV4dGVuc2lvbj5nYWxsZXJ5RXh0ZW5zaW9uO1xuXHR9XG5cblx0ZnVuY3Rpb24gYVBhZ2U8VD4ob2JqZWN0czogSUdhbGxlcnlFeHRlbnNpb25bXSA9IFtdLCB0b3RhbD86IG51bWJlcik6IElQYWdlcjxJR2FsbGVyeUV4dGVuc2lvbj4ge1xuXHRcdHJldHVybiB7IGZpcnN0UGFnZTogb2JqZWN0cywgdG90YWw6IHRvdGFsID8/IG9iamVjdHMubGVuZ3RoLCBwYWdlU2l6ZTogb2JqZWN0cy5sZW5ndGgsIGdldFBhZ2U6ICgpID0+IG51bGwhIH07XG5cdH1cblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxrQ0FBa0M7QUFDM0M7QUFBQSxFQUNDO0FBQUEsRUFBNkI7QUFBQSxFQUM3QjtBQUFBLEVBQW1CO0FBQUEsT0FDYjtBQUNQLFNBQVMs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QUEsRUFDRCxDQUFDO0FBRUQsV0FBUyxnQkFBZ0IsT0FBZSxXQUFXLFdBQWdCLENBQUMsR0FBRyxhQUFrQixDQUFDLEdBQW9CO0FBQzdHLGVBQVcsRUFBRSxNQUFNLFdBQVcsT0FBTyxTQUFTLFNBQVMsR0FBRyxTQUFTO0FBQ25FLGlCQUFhO0FBQUEsTUFDWixNQUFNLGNBQWM7QUFBQSxNQUNwQixVQUFVLElBQUksS0FBSyxPQUFPLElBQUksRUFBRTtBQUFBLE1BQ2hDLFlBQVksRUFBRSxJQUFJLHNCQUFzQixTQUFTLFdBQVcsU0FBUyxJQUFJLEVBQUU7QUFBQSxNQUMzRSxVQUFVLEVBQUUsSUFBSSxzQkFBc0IsU0FBUyxXQUFXLFNBQVMsSUFBSSxHQUFHLGFBQWEsU0FBUyxXQUFXLHNCQUFzQixXQUFXO0FBQUEsTUFDNUksR0FBRztBQUFBLE1BQ0gsU0FBUyxXQUFXLFdBQVc7QUFBQSxJQUNoQztBQUNBLGVBQVcsWUFBWSxXQUFXLFNBQVMsY0FBYztBQUN6RCxXQUF3Qix1QkFBTyxPQUFPLEVBQUUsVUFBVSxHQUFHLFdBQVcsQ0FBQztBQUFBLEVBQ2xFO0FBRUEsV0FBUyxrQkFBa0IsTUFBYyxhQUFrQixDQUFDLEdBQUcsNkJBQWtDLENBQUMsR0FBRyxTQUFjLENBQUMsR0FBc0I7QUFDekksVUFBTSxpQkFBaUIsa0JBQWtCLFVBQVUsSUFBSTtBQUN2RCxVQUFNLG1CQUFzQyx1QkFBTyxPQUFPLEVBQUUsTUFBTSxXQUFXLE9BQU8sU0FBUyxTQUFTLG9CQUFvQixDQUFDLGNBQWMsR0FBRyxZQUFZLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxHQUFHLFdBQVcsQ0FBQztBQUN2TCxxQkFBaUIsYUFBYSxFQUFFLEdBQUcsaUJBQWlCLFlBQVksY0FBYyxDQUFDLEdBQUcsZ0JBQWdCLEdBQUcsMkJBQTJCO0FBQ2hJLHFCQUFpQixTQUFTLEVBQUUsR0FBRyxpQkFBaUIsUUFBUSxHQUFHLE9BQU87QUFDbEUscUJBQWlCLGFBQWEsRUFBRSxJQUFJLHNCQUFzQixpQkFBaUIsV0FBVyxpQkFBaUIsSUFBSSxHQUFHLE1BQU0sYUFBYSxFQUFFO0FBQ25JLFdBQTBCO0FBQUEsRUFDM0I7QUFFQSxXQUFTLE1BQVMsVUFBK0IsQ0FBQyxHQUFHLE9BQTJDO0FBQy9GLFdBQU8sRUFBRSxXQUFXLFNBQVMsT0FBTyxTQUFTLFFBQVEsUUFBUSxVQUFVLFFBQVEsUUFBUSxTQUFTLE1BQU0sS0FBTTtBQUFBLEVBQzdHO0FBRUQsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
