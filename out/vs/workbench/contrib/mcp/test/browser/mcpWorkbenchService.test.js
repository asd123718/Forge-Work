import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { GalleryMcpServerStatus, IAllowedMcpServersService, IMcpGalleryService, McpAccessValue, McpGalleryResolveStatus, mcpAccessConfig, TransportType } from "../../../../../platform/mcp/common/mcpManagement.js";
import { IMcpGalleryManifestService, McpGalleryManifestStatus } from "../../../../../platform/mcp/common/mcpGalleryManifest.js";
import { McpServerType } from "../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IURLService } from "../../../../../platform/url/common/url.js";
import { IUserDataProfilesService } from "../../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { IWorkbenchMcpManagementService, LocalMcpServerScope } from "../../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { TestProductService } from "../../../../test/common/workbenchTestServices.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { McpWorkbenchService } from "../../browser/mcpWorkbenchService.js";
import { IMcpService } from "../../common/mcpTypes.js";
class TestMcpGalleryService extends mock() {
  constructor(store) {
    super();
    this.requests = [];
    this.nextRequestIndex = 0;
    this.queryItems = [];
    this.onDidRequestEmitter = store.add(new Emitter());
  }
  get requestCount() {
    return this.requests.length;
  }
  isEnabled() {
    return true;
  }
  resolveMcpServersFromGallery(infos) {
    const result = new DeferredPromise();
    this.requests.push({ infos, result });
    this.onDidRequestEmitter.fire();
    return result.p;
  }
  async query() {
    await this.queryBarrier?.p;
    return {
      firstPage: { items: this.queryItems, hasMore: false },
      getNextPage: async () => ({ items: [], hasMore: false })
    };
  }
  async nextRequest() {
    if (this.nextRequestIndex >= this.requests.length) {
      await Event.toPromise(this.onDidRequestEmitter.event);
    }
    return this.requests[this.nextRequestIndex++];
  }
}
class TestMcpGalleryManifestService extends mock() {
  constructor(store) {
    super();
    this.mcpGalleryManifestStatus = McpGalleryManifestStatus.Available;
    this.onDidChangeMcpGalleryManifestStatus = Event.None;
    this.onDidChangeMcpGalleryManifestEmitter = store.add(new Emitter());
    this.onDidChangeMcpGalleryManifest = this.onDidChangeMcpGalleryManifestEmitter.event;
  }
  fireChange() {
    this.onDidChangeMcpGalleryManifestEmitter.fire(null);
  }
}
class TestWorkbenchMcpManagementService extends mock() {
  constructor(store) {
    super();
    this.onInstallMcpServer = Event.None;
    this.onDidInstallMcpServers = Event.None;
    this.onDidUpdateMcpServers = Event.None;
    this.onUninstallMcpServer = Event.None;
    this.onDidUninstallMcpServer = Event.None;
    this.onInstallMcpServerInCurrentProfile = Event.None;
    this.onUninstallMcpServerInCurrentProfile = Event.None;
    this.onDidUninstallMcpServerInCurrentProfile = Event.None;
    this.installed = [];
    this.installedResults = [];
    this.onDidInstallMcpServersInCurrentProfileEmitter = store.add(new Emitter());
    this.onDidInstallMcpServersInCurrentProfile = this.onDidInstallMcpServersInCurrentProfileEmitter.event;
    this.onDidUpdateMcpServersInCurrentProfileEmitter = store.add(new Emitter());
    this.onDidUpdateMcpServersInCurrentProfile = this.onDidUpdateMcpServersInCurrentProfileEmitter.event;
    this.onDidChangeProfileEmitter = store.add(new Emitter());
    this.onDidChangeProfile = this.onDidChangeProfileEmitter.event;
  }
  async getInstalled() {
    return this.installedResults.shift() ?? this.installed;
  }
  canInstall() {
    return true;
  }
  async install(_server) {
    throw new Error("Not supported");
  }
  async installFromGallery(server, _options) {
    const local = this.installFromGalleryResult;
    if (!local) {
      throw new Error("No gallery install result configured");
    }
    await this.installFromGalleryBarrier?.p;
    this.installed.push(local);
    this.fireInstall([{ name: server.name, local, source: server, mcpResource: local.mcpResource }]);
    return local;
  }
  async updateMetadata() {
    throw new Error("Not supported");
  }
  async uninstall() {
  }
  fireInstall(results) {
    this.onDidInstallMcpServersInCurrentProfileEmitter.fire(results);
  }
  fireUpdate(results) {
    this.onDidUpdateMcpServersInCurrentProfileEmitter.fire(results);
  }
  fireProfileChange() {
    this.onDidChangeProfileEmitter.fire();
  }
  queueInstalledResult(result) {
    this.installedResults.push(result);
  }
}
function createGallery(name, remoteUrls = []) {
  return {
    name,
    displayName: name,
    description: "",
    version: "1.0.0",
    isLatest: true,
    status: GalleryMcpServerStatus.Active,
    configuration: {
      remotes: remoteUrls.map((url) => ({ type: TransportType.STREAMABLE_HTTP, url }))
    },
    publisher: "test"
  };
}
function createLocal(name, scope = LocalMcpServerScope.User, config) {
  return {
    id: `${scope}/${name}`,
    name,
    config: config ?? { type: McpServerType.LOCAL, command: "node" },
    mcpResource: URI.parse(`test://${scope}/mcp.json`),
    scope,
    source: "local"
  };
}
function found(server) {
  return { status: McpGalleryResolveStatus.Found, server };
}
function failed() {
  return { status: McpGalleryResolveStatus.Failed };
}
function notFound() {
  return { status: McpGalleryResolveStatus.NotFound };
}
suite("McpWorkbenchService - registry-only enforcement", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  async function createFixture(installed, accessValue = McpAccessValue.Registry) {
    const galleryService = new TestMcpGalleryService(store);
    const manifestService = new TestMcpGalleryManifestService(store);
    const managementService = new TestWorkbenchMcpManagementService(store);
    managementService.installed = [...installed];
    const configurationService = new TestConfigurationService({ [mcpAccessConfig]: accessValue });
    const allowedMcpServersEmitter = store.add(new Emitter());
    const services = new ServiceCollection(
      [IMcpGalleryManifestService, manifestService],
      [IMcpGalleryService, galleryService],
      [IWorkbenchMcpManagementService, managementService],
      [IEditorService, upcastPartial({})],
      [IUserDataProfilesService, upcastPartial({ profiles: [] })],
      [IUriIdentityService, upcastPartial({})],
      [IWorkspaceContextService, upcastPartial({})],
      [IWorkbenchEnvironmentService, upcastPartial({})],
      [ILabelService, upcastPartial({})],
      [IProductService, TestProductService],
      [IRemoteAgentService, upcastPartial({})],
      [IConfigurationService, configurationService],
      [ITelemetryService, NullTelemetryService],
      [ILogService, store.add(new NullLogService())],
      [IExtensionsWorkbenchService, upcastPartial({})],
      [IAllowedMcpServersService, upcastPartial({ onDidChangeAllowedMcpServers: allowedMcpServersEmitter.event })],
      [IMcpService, upcastPartial({ servers: constObservable([]) })],
      [IURLService, upcastPartial({ registerHandler: () => Disposable.None })],
      [IFileService, upcastPartial({})]
    );
    const instantiationService = store.add(new TestInstantiationService(services));
    const service = store.add(instantiationService.createInstance(McpWorkbenchService));
    await Event.toPromise(service.onChange);
    return { service, galleryService, manifestService, managementService, allowedMcpServersEmitter };
  }
  async function complete(request, result) {
    await request.result.complete(result);
    await timeout(0);
    await timeout(0);
  }
  test("enables only manually configured servers found in the registry", async () => {
    const foundLocal = createLocal("found");
    const missingLocal = createLocal("missing");
    const failedLocal = createLocal("failed");
    const { service, galleryService } = await createFixture([foundLocal, missingLocal, failedLocal]);
    const request = await galleryService.nextRequest();
    await complete(request, /* @__PURE__ */ new Map([
      ["found", found(createGallery("found"))],
      ["missing", notFound()],
      ["failed", failed()]
    ]));
    assert.deepStrictEqual({
      requested: request.infos.map((info) => info.name).sort(),
      enabled: service.getEnabledLocalMcpServers().map((server) => server.name),
      verified: service.local.map((server) => [server.name, !!server.gallery])
    }, {
      requested: ["failed", "found", "missing"],
      enabled: ["found"],
      verified: [["failed", false], ["found", true], ["missing", false]]
    });
  });
  test("preserves verified membership on transient failure and clears it on not found", async () => {
    const verified = createLocal("verified");
    const removed = createLocal("removed");
    const { service, galleryService, managementService } = await createFixture([verified, removed]);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      ["verified", found(createGallery("verified"))],
      ["removed", found(createGallery("removed"))]
    ]));
    const added = createLocal("added");
    managementService.fireInstall([{ name: added.name, local: added, mcpResource: added.mcpResource }]);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      ["verified", failed()],
      ["removed", notFound()],
      ["added", failed()]
    ]));
    assert.deepStrictEqual({
      enabled: service.getEnabledLocalMcpServers().map((server) => server.name),
      verified: service.local.map((server) => [server.name, !!server.gallery])
    }, {
      enabled: ["verified"],
      verified: [["added", false], ["removed", false], ["verified", true]]
    });
  });
  test("invalidates membership immediately when the active registry changes", async () => {
    const local = createLocal("server");
    const { service, galleryService, manifestService } = await createFixture([local]);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [local.name, found(createGallery(local.name))]
    ]));
    manifestService.fireChange();
    const enabledAfterInvalidation = service.getEnabledLocalMcpServers().map((server) => server.name);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [local.name, failed()]
    ]));
    assert.deepStrictEqual({
      enabledAfterInvalidation,
      enabledAfterFailure: service.getEnabledLocalMcpServers().map((server) => server.name),
      hasGallery: !!service.local[0].gallery
    }, {
      enabledAfterInvalidation: [],
      enabledAfterFailure: [],
      hasGallery: false
    });
  });
  test("replaces and re-verifies installed servers when the profile changes", async () => {
    const oldLocal = createLocal("old-profile");
    const newLocal = createLocal("new-profile");
    const { service, galleryService, managementService } = await createFixture([oldLocal]);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [oldLocal.name, found(createGallery(oldLocal.name))]
    ]));
    const resetPromise = Event.toPromise(service.onReset);
    managementService.installed = [newLocal];
    managementService.fireProfileChange();
    const enabledAfterInvalidation = service.getEnabledLocalMcpServers().map((server) => server.name);
    await resetPromise;
    const request = await galleryService.nextRequest();
    await complete(request, /* @__PURE__ */ new Map([
      [newLocal.name, found(createGallery(newLocal.name))]
    ]));
    assert.deepStrictEqual({
      enabledAfterInvalidation,
      requested: request.infos.map((info) => info.name),
      local: service.local.map((server) => server.name),
      enabled: service.getEnabledLocalMcpServers().map((server) => server.name)
    }, {
      enabledAfterInvalidation: [],
      requested: [newLocal.name],
      local: [newLocal.name],
      enabled: [newLocal.name]
    });
  });
  test("ignores an older profile query that completes after a newer profile query", async () => {
    const initial = createLocal("initial-profile");
    const older = createLocal("older-profile");
    const newer = createLocal("newer-profile");
    const { service, galleryService, managementService } = await createFixture([initial]);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [initial.name, found(createGallery(initial.name))]
    ]));
    const olderResult = new DeferredPromise();
    const newerResult = new DeferredPromise();
    managementService.queueInstalledResult(olderResult.p);
    managementService.queueInstalledResult(newerResult.p);
    let resetCount = 0;
    store.add(service.onReset(() => resetCount++));
    const resetPromise = Event.toPromise(service.onReset);
    managementService.fireProfileChange();
    managementService.fireProfileChange();
    await newerResult.complete([newer]);
    await resetPromise;
    const request = await galleryService.nextRequest();
    await complete(request, /* @__PURE__ */ new Map([
      [newer.name, found(createGallery(newer.name))]
    ]));
    await olderResult.complete([older]);
    await timeout(0);
    assert.deepStrictEqual({
      requested: request.infos.map((info) => info.name),
      local: service.local.map((server) => server.name),
      enabled: service.getEnabledLocalMcpServers().map((server) => server.name),
      resetCount
    }, {
      requested: [newer.name],
      local: [newer.name],
      enabled: [newer.name],
      resetCount: 1
    });
  });
  test("re-verifies the current profile when a public local query supersedes its profile query", async () => {
    const initial = createLocal("initial-profile");
    const current = createLocal("current-profile");
    const { service, galleryService, managementService } = await createFixture([initial]);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [initial.name, found(createGallery(initial.name))]
    ]));
    const profileResult = new DeferredPromise();
    const publicResult = new DeferredPromise();
    managementService.queueInstalledResult(profileResult.p);
    managementService.queueInstalledResult(publicResult.p);
    const resetPromise = Event.toPromise(service.onReset);
    managementService.fireProfileChange();
    const publicQuery = service.queryLocal();
    await publicResult.complete([current]);
    await publicQuery;
    await profileResult.complete([initial]);
    await resetPromise;
    const request = await galleryService.nextRequest();
    await complete(request, /* @__PURE__ */ new Map([
      [current.name, found(createGallery(current.name))]
    ]));
    assert.deepStrictEqual({
      requested: request.infos.map((info) => info.name),
      local: service.local.map((server) => server.name),
      enabled: service.getEnabledLocalMcpServers().map((server) => server.name)
    }, {
      requested: [current.name],
      local: [current.name],
      enabled: [current.name]
    });
  });
  test("ignores stale lookup results after a local configuration update", async () => {
    const local = createLocal("server");
    const { service, galleryService, managementService } = await createFixture([local]);
    const staleRequest = await galleryService.nextRequest();
    managementService.fireUpdate([{ name: local.name, local, mcpResource: local.mcpResource }]);
    managementService.fireUpdate([{ name: local.name, local, mcpResource: local.mcpResource }]);
    managementService.fireUpdate([{ name: local.name, local, mcpResource: local.mcpResource }]);
    await complete(staleRequest, /* @__PURE__ */ new Map([
      [local.name, found(createGallery(local.name))]
    ]));
    const currentRequest = await galleryService.nextRequest();
    const staleResultApplied = !!service.local[0].gallery;
    await complete(currentRequest, /* @__PURE__ */ new Map([
      [local.name, notFound()]
    ]));
    assert.deepStrictEqual({
      staleResultApplied,
      enabled: service.getEnabledLocalMcpServers().map((server) => server.name),
      requestCount: galleryService.requestCount
    }, {
      staleResultApplied: false,
      enabled: [],
      requestCount: 2
    });
  });
  test("preserves matching trusted update sources and rejects mismatched sources", async () => {
    const local = createLocal("updated");
    const { service, galleryService, managementService } = await createFixture([local]);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [local.name, found(createGallery(local.name))]
    ]));
    const trustedUpdate = createGallery(local.name);
    galleryService.queryItems = [trustedUpdate];
    await service.queryGallery();
    managementService.fireUpdate([{ name: local.name, local, source: trustedUpdate, mcpResource: local.mcpResource }]);
    const trustedUpdateApplied = service.local[0].gallery === trustedUpdate;
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [local.name, failed()]
    ]));
    const mismatchedUpdate = createGallery("different-name");
    managementService.fireUpdate([{ name: local.name, local, source: mismatchedUpdate, mcpResource: local.mcpResource }]);
    const mismatchedUpdateApplied = service.local[0].gallery === mismatchedUpdate;
    const enabledAfterMismatch = service.getEnabledLocalMcpServers().map((server) => server.name);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [local.name, failed()]
    ]));
    assert.deepStrictEqual({
      trustedUpdateApplied,
      mismatchedUpdateApplied,
      enabledAfterMismatch,
      enabledAfterFailure: service.getEnabledLocalMcpServers().map((server) => server.name)
    }, {
      trustedUpdateApplied: true,
      mismatchedUpdateApplied: false,
      enabledAfterMismatch: [local.name],
      enabledAfterFailure: [local.name]
    });
  });
  test("deduplicates registry lookups for the same server name across scopes", async () => {
    const user = createLocal("duplicate", LocalMcpServerScope.User);
    const workspace = { ...createLocal("duplicate", LocalMcpServerScope.Workspace), galleryId: "registry-id" };
    const { service, galleryService } = await createFixture([user, workspace]);
    const request = await galleryService.nextRequest();
    await complete(request, /* @__PURE__ */ new Map([
      ["duplicate", found(createGallery("duplicate"))]
    ]));
    assert.deepStrictEqual({
      requested: request.infos,
      verified: service.local.map((server) => !!server.gallery),
      enabledScopes: service.getEnabledLocalMcpServers().map((server) => server.scope)
    }, {
      requested: [{ name: "duplicate", id: "registry-id" }],
      verified: [true, true],
      enabledScopes: [LocalMcpServerScope.Workspace]
    });
  });
  test("keeps trusted gallery metadata while an install is revalidated", async () => {
    const { service, galleryService, managementService } = await createFixture([]);
    const gallery = createGallery("gallery-install");
    const local = createLocal(gallery.name);
    galleryService.queryItems = [gallery];
    managementService.installFromGalleryResult = local;
    const pager = await service.queryGallery();
    const installed = await service.install(pager.firstPage.items[0]);
    const enabledBeforeRevalidation = service.getEnabledLocalMcpServers().map((server) => server.name);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [local.name, failed()]
    ]));
    assert.deepStrictEqual({
      trustedGalleryPreserved: installed.gallery === gallery,
      enabledBeforeRevalidation,
      enabledAfterFailure: service.getEnabledLocalMcpServers().map((server) => server.name)
    }, {
      trustedGalleryPreserved: true,
      enabledBeforeRevalidation: [local.name],
      enabledAfterFailure: [local.name]
    });
  });
  test("rejects gallery metadata from an install that completes after a registry change", async () => {
    const { service, galleryService, manifestService, managementService } = await createFixture([]);
    const gallery = createGallery("stale-gallery-install");
    const local = createLocal(gallery.name);
    const installBarrier = new DeferredPromise();
    galleryService.queryItems = [gallery];
    managementService.installFromGalleryResult = local;
    managementService.installFromGalleryBarrier = installBarrier;
    const pager = await service.queryGallery();
    const installPromise = service.install(pager.firstPage.items[0]);
    await timeout(0);
    manifestService.fireChange();
    await installBarrier.complete();
    const installed = await installPromise;
    const request = await galleryService.nextRequest();
    await complete(request, /* @__PURE__ */ new Map([
      [local.name, failed()]
    ]));
    assert.deepStrictEqual({
      staleGalleryApplied: installed.gallery === gallery,
      enabled: service.getEnabledLocalMcpServers().map((server) => server.name)
    }, {
      staleGalleryApplied: false,
      enabled: []
    });
  });
  test("rejects gallery metadata returned by a query that completes after a registry change", async () => {
    const { service, galleryService, manifestService, managementService } = await createFixture([]);
    const gallery = createGallery("stale-gallery-query");
    const local = createLocal(gallery.name);
    const queryBarrier = new DeferredPromise();
    galleryService.queryItems = [gallery];
    galleryService.queryBarrier = queryBarrier;
    const queryPromise = service.queryGallery();
    await timeout(0);
    manifestService.fireChange();
    await queryBarrier.complete();
    const pager = await queryPromise;
    managementService.fireInstall([{ name: local.name, local, source: pager.firstPage.items[0].gallery, mcpResource: local.mcpResource }]);
    const request = await galleryService.nextRequest();
    await complete(request, /* @__PURE__ */ new Map([
      [local.name, failed()]
    ]));
    assert.deepStrictEqual({
      staleGalleryApplied: service.local[0].gallery === gallery,
      enabled: service.getEnabledLocalMcpServers().map((server) => server.name)
    }, {
      staleGalleryApplied: false,
      enabled: []
    });
  });
  test("trusts gallery metadata propagated by an external gallery install", async () => {
    const { service, galleryService, managementService } = await createFixture([]);
    const gallery = createGallery("external-gallery-install");
    const local = createLocal(gallery.name);
    galleryService.queryItems = [gallery];
    await service.queryGallery();
    managementService.fireInstall([{ name: local.name, local, source: gallery, mcpResource: local.mcpResource }]);
    const enabledBeforeRevalidation = service.getEnabledLocalMcpServers().map((server) => server.name);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [local.name, failed()]
    ]));
    assert.deepStrictEqual({
      galleryPreserved: service.local[0].gallery === gallery,
      enabledBeforeRevalidation,
      enabledAfterFailure: service.getEnabledLocalMcpServers().map((server) => server.name)
    }, {
      galleryPreserved: true,
      enabledBeforeRevalidation: [local.name],
      enabledAfterFailure: [local.name]
    });
  });
  test("rejects gallery metadata from an update that completes after a registry change", async () => {
    const local = createLocal("stale-gallery-update");
    const { service, galleryService, manifestService, managementService } = await createFixture([local]);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [local.name, found(createGallery(local.name))]
    ]));
    const staleGallery = createGallery(local.name);
    galleryService.queryItems = [staleGallery];
    await service.queryGallery();
    manifestService.fireChange();
    managementService.fireUpdate([{ name: local.name, local, source: staleGallery, mcpResource: local.mcpResource }]);
    const request = await galleryService.nextRequest();
    await complete(request, /* @__PURE__ */ new Map([
      [local.name, failed()]
    ]));
    assert.deepStrictEqual({
      staleGalleryApplied: service.local[0].gallery === staleGallery,
      enabled: service.getEnabledLocalMcpServers().map((server) => server.name)
    }, {
      staleGalleryApplied: false,
      enabled: []
    });
  });
  test("requires remote URLs to match the registry entry exactly", async () => {
    const allowed = createLocal("allowed", LocalMcpServerScope.User, { type: McpServerType.REMOTE, url: "https://allowed.test/mcp" });
    const blocked = createLocal("blocked", LocalMcpServerScope.User, { type: McpServerType.REMOTE, url: "https://blocked.test/mcp" });
    const { service, galleryService } = await createFixture([allowed, blocked]);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [allowed.name, found(createGallery(allowed.name, ["https://allowed.test/mcp"]))],
      [blocked.name, found(createGallery(blocked.name, ["https://different.test/mcp"]))]
    ]));
    assert.deepStrictEqual(service.getEnabledLocalMcpServers().map((server) => server.name), ["allowed"]);
  });
  test("keeps a stable order for duplicate server names across repeated sorts", async () => {
    const user = createLocal("duplicate", LocalMcpServerScope.User);
    const workspaceA = { ...createLocal("duplicate", LocalMcpServerScope.Workspace), id: "workspace/a/duplicate" };
    const workspaceB = { ...createLocal("duplicate", LocalMcpServerScope.Workspace), id: "workspace/b/duplicate" };
    const { service, galleryService, allowedMcpServersEmitter } = await createFixture([user, workspaceA, workspaceB], McpAccessValue.All);
    await complete(await galleryService.nextRequest(), /* @__PURE__ */ new Map([
      [user.name, notFound()]
    ]));
    const orderBefore = service.local.map((server) => server.id);
    const winnerBefore = service.getEnabledLocalMcpServers().map((server) => server.id);
    for (let i = 0; i < 10; i++) {
      allowedMcpServersEmitter.fire();
      assert.deepStrictEqual(service.local.map((server) => server.id), orderBefore);
      assert.deepStrictEqual(service.getEnabledLocalMcpServers().map((server) => server.id), winnerBefore);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcYnJvd3NlclxcbWNwV29ya2JlbmNoU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jaywgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBHYWxsZXJ5TWNwU2VydmVyU3RhdHVzLCBJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLCBJR2FsbGVyeU1jcFNlcnZlciwgSU1jcEdhbGxlcnlTZXJ2ZXJSZXNvbHZlUmVzdWx0LCBJTWNwR2FsbGVyeVNlcnZpY2UsIElJbnN0YWxsYWJsZU1jcFNlcnZlciwgSW5zdGFsbE9wdGlvbnMsIE1jcEFjY2Vzc1ZhbHVlLCBNY3BHYWxsZXJ5UmVzb2x2ZVN0YXR1cywgbWNwQWNjZXNzQ29uZmlnLCBUcmFuc3BvcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElNY3BHYWxsZXJ5TWFuaWZlc3QsIElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLCBNY3BHYWxsZXJ5TWFuaWZlc3RTdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcEdhbGxlcnlNYW5pZmVzdC5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiwgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElVUkxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi91cmwuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyLCBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UsIElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0LCBMb2NhbE1jcFNlcnZlclNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbWNwL2NvbW1vbi9tY3BXb3JrYmVuY2hNYW5hZ2VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTWNwV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWNwV29ya2JlbmNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5cbmludGVyZmFjZSBJUmVzb2x2ZVJlcXVlc3Qge1xuXHRyZWFkb25seSBpbmZvczogcmVhZG9ubHkgeyBuYW1lOiBzdHJpbmc7IGlkPzogc3RyaW5nIH1bXTtcblx0cmVhZG9ubHkgcmVzdWx0OiBEZWZlcnJlZFByb21pc2U8TWFwPHN0cmluZywgSU1jcEdhbGxlcnlTZXJ2ZXJSZXNvbHZlUmVzdWx0Pj47XG59XG5cbmNsYXNzIFRlc3RNY3BHYWxsZXJ5U2VydmljZSBleHRlbmRzIG1vY2s8SU1jcEdhbGxlcnlTZXJ2aWNlPigpIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RzOiBJUmVzb2x2ZVJlcXVlc3RbXSA9IFtdO1xuXHRwcml2YXRlIG5leHRSZXF1ZXN0SW5kZXggPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkUmVxdWVzdEVtaXR0ZXI6IEVtaXR0ZXI8dm9pZD47XG5cdHF1ZXJ5SXRlbXM6IElHYWxsZXJ5TWNwU2VydmVyW10gPSBbXTtcblx0cXVlcnlCYXJyaWVyOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdGdldCByZXF1ZXN0Q291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucmVxdWVzdHMubGVuZ3RoOyB9XG5cblx0Y29uc3RydWN0b3Ioc3RvcmU6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4pIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub25EaWRSZXF1ZXN0RW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlc29sdmVNY3BTZXJ2ZXJzRnJvbUdhbGxlcnkoaW5mb3M6IHsgbmFtZTogc3RyaW5nOyBpZD86IHN0cmluZyB9W10pOiBQcm9taXNlPE1hcDxzdHJpbmcsIElNY3BHYWxsZXJ5U2VydmVyUmVzb2x2ZVJlc3VsdD4+IHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPE1hcDxzdHJpbmcsIElNY3BHYWxsZXJ5U2VydmVyUmVzb2x2ZVJlc3VsdD4+KCk7XG5cdFx0dGhpcy5yZXF1ZXN0cy5wdXNoKHsgaW5mb3MsIHJlc3VsdCB9KTtcblx0XHR0aGlzLm9uRGlkUmVxdWVzdEVtaXR0ZXIuZmlyZSgpO1xuXHRcdHJldHVybiByZXN1bHQucDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHF1ZXJ5KCkge1xuXHRcdGF3YWl0IHRoaXMucXVlcnlCYXJyaWVyPy5wO1xuXHRcdHJldHVybiB7XG5cdFx0XHRmaXJzdFBhZ2U6IHsgaXRlbXM6IHRoaXMucXVlcnlJdGVtcywgaGFzTW9yZTogZmFsc2UgfSxcblx0XHRcdGdldE5leHRQYWdlOiBhc3luYyAoKSA9PiAoeyBpdGVtczogW10sIGhhc01vcmU6IGZhbHNlIH0pXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIG5leHRSZXF1ZXN0KCk6IFByb21pc2U8SVJlc29sdmVSZXF1ZXN0PiB7XG5cdFx0aWYgKHRoaXMubmV4dFJlcXVlc3RJbmRleCA+PSB0aGlzLnJlcXVlc3RzLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHRoaXMub25EaWRSZXF1ZXN0RW1pdHRlci5ldmVudCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJlcXVlc3RzW3RoaXMubmV4dFJlcXVlc3RJbmRleCsrXTtcblx0fVxufVxuXG5jbGFzcyBUZXN0TWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSBleHRlbmRzIG1vY2s8SU1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2U+KCkge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IG1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cyA9IE1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cy5BdmFpbGFibGU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzID0gRXZlbnQuTm9uZTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZU1jcEdhbGxlcnlNYW5pZmVzdEVtaXR0ZXI6IEVtaXR0ZXI8SU1jcEdhbGxlcnlNYW5pZmVzdCB8IG51bGw+O1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU1jcEdhbGxlcnlNYW5pZmVzdDogRXZlbnQ8SU1jcEdhbGxlcnlNYW5pZmVzdCB8IG51bGw+O1xuXG5cdGNvbnN0cnVjdG9yKHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlTWNwR2FsbGVyeU1hbmlmZXN0RW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJTWNwR2FsbGVyeU1hbmlmZXN0IHwgbnVsbD4oKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZU1jcEdhbGxlcnlNYW5pZmVzdCA9IHRoaXMub25EaWRDaGFuZ2VNY3BHYWxsZXJ5TWFuaWZlc3RFbWl0dGVyLmV2ZW50O1xuXHR9XG5cblx0ZmlyZUNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlTWNwR2FsbGVyeU1hbmlmZXN0RW1pdHRlci5maXJlKG51bGwpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RXb3JrYmVuY2hNY3BNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaE1jcE1hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRvdmVycmlkZSByZWFkb25seSBvbkluc3RhbGxNY3BTZXJ2ZXIgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEluc3RhbGxNY3BTZXJ2ZXJzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRVcGRhdGVNY3BTZXJ2ZXJzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25Vbmluc3RhbGxNY3BTZXJ2ZXIgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZFVuaW5zdGFsbE1jcFNlcnZlciA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uSW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvblVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZFVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUgPSBFdmVudC5Ob25lO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvZmlsZUVtaXR0ZXI6IEVtaXR0ZXI8dm9pZD47XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvZmlsZTogRXZlbnQ8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRJbnN0YWxsTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGVFbWl0dGVyOiBFbWl0dGVyPHJlYWRvbmx5IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10+O1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEluc3RhbGxNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZTogRXZlbnQ8cmVhZG9ubHkgSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHRbXT47XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRVcGRhdGVNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZUVtaXR0ZXI6IEVtaXR0ZXI8cmVhZG9ubHkgSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHRbXT47XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkVXBkYXRlTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGU6IEV2ZW50PHJlYWRvbmx5IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10+O1xuXHRpbnN0YWxsZWQ6IElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcltdID0gW107XG5cdGluc3RhbGxGcm9tR2FsbGVyeVJlc3VsdDogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyIHwgdW5kZWZpbmVkO1xuXHRpbnN0YWxsRnJvbUdhbGxlcnlCYXJyaWVyOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5zdGFsbGVkUmVzdWx0czogUHJvbWlzZTxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXJbXT5bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm9uRGlkSW5zdGFsbE1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxyZWFkb25seSBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdPigpKTtcblx0XHR0aGlzLm9uRGlkSW5zdGFsbE1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlID0gdGhpcy5vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZUVtaXR0ZXIuZXZlbnQ7XG5cdFx0dGhpcy5vbkRpZFVwZGF0ZU1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxyZWFkb25seSBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdPigpKTtcblx0XHR0aGlzLm9uRGlkVXBkYXRlTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGUgPSB0aGlzLm9uRGlkVXBkYXRlTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGVFbWl0dGVyLmV2ZW50O1xuXHRcdHRoaXMub25EaWRDaGFuZ2VQcm9maWxlRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlUHJvZmlsZSA9IHRoaXMub25EaWRDaGFuZ2VQcm9maWxlRW1pdHRlci5ldmVudDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGdldEluc3RhbGxlZCgpOiBQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFsbGVkUmVzdWx0cy5zaGlmdCgpID8/IHRoaXMuaW5zdGFsbGVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2FuSW5zdGFsbCgpOiB0cnVlIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGluc3RhbGwoX3NlcnZlcjogSUluc3RhbGxhYmxlTWNwU2VydmVyKTogUHJvbWlzZTxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGluc3RhbGxGcm9tR2FsbGVyeShzZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyLCBfb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHRjb25zdCBsb2NhbCA9IHRoaXMuaW5zdGFsbEZyb21HYWxsZXJ5UmVzdWx0O1xuXHRcdGlmICghbG9jYWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gZ2FsbGVyeSBpbnN0YWxsIHJlc3VsdCBjb25maWd1cmVkJyk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuaW5zdGFsbEZyb21HYWxsZXJ5QmFycmllcj8ucDtcblx0XHR0aGlzLmluc3RhbGxlZC5wdXNoKGxvY2FsKTtcblx0XHR0aGlzLmZpcmVJbnN0YWxsKFt7IG5hbWU6IHNlcnZlci5uYW1lLCBsb2NhbCwgc291cmNlOiBzZXJ2ZXIsIG1jcFJlc291cmNlOiBsb2NhbC5tY3BSZXNvdXJjZSB9XSk7XG5cdFx0cmV0dXJuIGxvY2FsO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgdXBkYXRlTWV0YWRhdGEoKTogUHJvbWlzZTxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHVuaW5zdGFsbCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGZpcmVJbnN0YWxsKHJlc3VsdHM6IHJlYWRvbmx5IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10pOiB2b2lkIHtcblx0XHR0aGlzLm9uRGlkSW5zdGFsbE1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlRW1pdHRlci5maXJlKHJlc3VsdHMpO1xuXHR9XG5cblx0ZmlyZVVwZGF0ZShyZXN1bHRzOiByZWFkb25seSBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdKTogdm9pZCB7XG5cdFx0dGhpcy5vbkRpZFVwZGF0ZU1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlRW1pdHRlci5maXJlKHJlc3VsdHMpO1xuXHR9XG5cblx0ZmlyZVByb2ZpbGVDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVByb2ZpbGVFbWl0dGVyLmZpcmUoKTtcblx0fVxuXG5cdHF1ZXVlSW5zdGFsbGVkUmVzdWx0KHJlc3VsdDogUHJvbWlzZTxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXJbXT4pOiB2b2lkIHtcblx0XHR0aGlzLmluc3RhbGxlZFJlc3VsdHMucHVzaChyZXN1bHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUdhbGxlcnkobmFtZTogc3RyaW5nLCByZW1vdGVVcmxzOiByZWFkb25seSBzdHJpbmdbXSA9IFtdKTogSUdhbGxlcnlNY3BTZXJ2ZXIge1xuXHRyZXR1cm4ge1xuXHRcdG5hbWUsXG5cdFx0ZGlzcGxheU5hbWU6IG5hbWUsXG5cdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0aXNMYXRlc3Q6IHRydWUsXG5cdFx0c3RhdHVzOiBHYWxsZXJ5TWNwU2VydmVyU3RhdHVzLkFjdGl2ZSxcblx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRyZW1vdGVzOiByZW1vdGVVcmxzLm1hcCh1cmwgPT4gKHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVFJFQU1BQkxFX0hUVFAsIHVybCB9KSlcblx0XHR9LFxuXHRcdHB1Ymxpc2hlcjogJ3Rlc3QnXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxvY2FsKG5hbWU6IHN0cmluZywgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUgPSBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIsIGNvbmZpZz86IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKTogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyIHtcblx0cmV0dXJuIHtcblx0XHRpZDogYCR7c2NvcGV9LyR7bmFtZX1gLFxuXHRcdG5hbWUsXG5cdFx0Y29uZmlnOiBjb25maWcgPz8geyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kOiAnbm9kZScgfSxcblx0XHRtY3BSZXNvdXJjZTogVVJJLnBhcnNlKGB0ZXN0Oi8vJHtzY29wZX0vbWNwLmpzb25gKSxcblx0XHRzY29wZSxcblx0XHRzb3VyY2U6ICdsb2NhbCdcblx0fTtcbn1cblxuZnVuY3Rpb24gZm91bmQoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlcik6IElNY3BHYWxsZXJ5U2VydmVyUmVzb2x2ZVJlc3VsdCB7XG5cdHJldHVybiB7IHN0YXR1czogTWNwR2FsbGVyeVJlc29sdmVTdGF0dXMuRm91bmQsIHNlcnZlciB9O1xufVxuXG5mdW5jdGlvbiBmYWlsZWQoKTogSU1jcEdhbGxlcnlTZXJ2ZXJSZXNvbHZlUmVzdWx0IHtcblx0cmV0dXJuIHsgc3RhdHVzOiBNY3BHYWxsZXJ5UmVzb2x2ZVN0YXR1cy5GYWlsZWQgfTtcbn1cblxuZnVuY3Rpb24gbm90Rm91bmQoKTogSU1jcEdhbGxlcnlTZXJ2ZXJSZXNvbHZlUmVzdWx0IHtcblx0cmV0dXJuIHsgc3RhdHVzOiBNY3BHYWxsZXJ5UmVzb2x2ZVN0YXR1cy5Ob3RGb3VuZCB9O1xufVxuXG5zdWl0ZSgnTWNwV29ya2JlbmNoU2VydmljZSAtIHJlZ2lzdHJ5LW9ubHkgZW5mb3JjZW1lbnQnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVGaXh0dXJlKGluc3RhbGxlZDogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyW10sIGFjY2Vzc1ZhbHVlOiBNY3BBY2Nlc3NWYWx1ZSA9IE1jcEFjY2Vzc1ZhbHVlLlJlZ2lzdHJ5KSB7XG5cdFx0Y29uc3QgZ2FsbGVyeVNlcnZpY2UgPSBuZXcgVGVzdE1jcEdhbGxlcnlTZXJ2aWNlKHN0b3JlKTtcblx0XHRjb25zdCBtYW5pZmVzdFNlcnZpY2UgPSBuZXcgVGVzdE1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2Uoc3RvcmUpO1xuXHRcdGNvbnN0IG1hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IFRlc3RXb3JrYmVuY2hNY3BNYW5hZ2VtZW50U2VydmljZShzdG9yZSk7XG5cdFx0bWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbGVkID0gWy4uLmluc3RhbGxlZF07XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgW21jcEFjY2Vzc0NvbmZpZ106IGFjY2Vzc1ZhbHVlIH0pO1xuXHRcdGNvbnN0IGFsbG93ZWRNY3BTZXJ2ZXJzRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSwgbWFuaWZlc3RTZXJ2aWNlXSxcblx0XHRcdFtJTWNwR2FsbGVyeVNlcnZpY2UsIGdhbGxlcnlTZXJ2aWNlXSxcblx0XHRcdFtJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UsIG1hbmFnZW1lbnRTZXJ2aWNlXSxcblx0XHRcdFtJRWRpdG9yU2VydmljZSwgdXBjYXN0UGFydGlhbDxJRWRpdG9yU2VydmljZT4oe30pXSxcblx0XHRcdFtJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlPih7IHByb2ZpbGVzOiBbXSB9KV0sXG5cdFx0XHRbSVVyaUlkZW50aXR5U2VydmljZSwgdXBjYXN0UGFydGlhbDxJVXJpSWRlbnRpdHlTZXJ2aWNlPih7fSldLFxuXHRcdFx0W0lXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgdXBjYXN0UGFydGlhbDxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KHt9KV0sXG5cdFx0XHRbSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwgdXBjYXN0UGFydGlhbDxJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlPih7fSldLFxuXHRcdFx0W0lMYWJlbFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SUxhYmVsU2VydmljZT4oe30pXSxcblx0XHRcdFtJUHJvZHVjdFNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZV0sXG5cdFx0XHRbSVJlbW90ZUFnZW50U2VydmljZSwgdXBjYXN0UGFydGlhbDxJUmVtb3RlQWdlbnRTZXJ2aWNlPih7fSldLFxuXHRcdFx0W0lDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2VdLFxuXHRcdFx0W0lUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZV0sXG5cdFx0XHRbSUxvZ1NlcnZpY2UsIHN0b3JlLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSldLFxuXHRcdFx0W0lFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgdXBjYXN0UGFydGlhbDxJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U+KHt9KV0sXG5cdFx0XHRbSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSwgdXBjYXN0UGFydGlhbDxJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlPih7IG9uRGlkQ2hhbmdlQWxsb3dlZE1jcFNlcnZlcnM6IGFsbG93ZWRNY3BTZXJ2ZXJzRW1pdHRlci5ldmVudCB9KV0sXG5cdFx0XHRbSU1jcFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SU1jcFNlcnZpY2U+KHsgc2VydmVyczogY29uc3RPYnNlcnZhYmxlKFtdKSB9KV0sXG5cdFx0XHRbSVVSTFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SVVSTFNlcnZpY2U+KHsgcmVnaXN0ZXJIYW5kbGVyOiAoKSA9PiBEaXNwb3NhYmxlLk5vbmUgfSldLFxuXHRcdFx0W0lGaWxlU2VydmljZSwgdXBjYXN0UGFydGlhbDxJRmlsZVNlcnZpY2U+KHt9KV0sXG5cdFx0KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BXb3JrYmVuY2hTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25DaGFuZ2UpO1xuXHRcdHJldHVybiB7IHNlcnZpY2UsIGdhbGxlcnlTZXJ2aWNlLCBtYW5pZmVzdFNlcnZpY2UsIG1hbmFnZW1lbnRTZXJ2aWNlLCBhbGxvd2VkTWNwU2VydmVyc0VtaXR0ZXIgfTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNvbXBsZXRlKHJlcXVlc3Q6IElSZXNvbHZlUmVxdWVzdCwgcmVzdWx0OiBNYXA8c3RyaW5nLCBJTWNwR2FsbGVyeVNlcnZlclJlc29sdmVSZXN1bHQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgcmVxdWVzdC5yZXN1bHQuY29tcGxldGUocmVzdWx0KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdH1cblxuXHR0ZXN0KCdlbmFibGVzIG9ubHkgbWFudWFsbHkgY29uZmlndXJlZCBzZXJ2ZXJzIGZvdW5kIGluIHRoZSByZWdpc3RyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb3VuZExvY2FsID0gY3JlYXRlTG9jYWwoJ2ZvdW5kJyk7XG5cdFx0Y29uc3QgbWlzc2luZ0xvY2FsID0gY3JlYXRlTG9jYWwoJ21pc3NpbmcnKTtcblx0XHRjb25zdCBmYWlsZWRMb2NhbCA9IGNyZWF0ZUxvY2FsKCdmYWlsZWQnKTtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGdhbGxlcnlTZXJ2aWNlIH0gPSBhd2FpdCBjcmVhdGVGaXh0dXJlKFtmb3VuZExvY2FsLCBtaXNzaW5nTG9jYWwsIGZhaWxlZExvY2FsXSk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCk7XG5cblx0XHRhd2FpdCBjb21wbGV0ZShyZXF1ZXN0LCBuZXcgTWFwKFtcblx0XHRcdFsnZm91bmQnLCBmb3VuZChjcmVhdGVHYWxsZXJ5KCdmb3VuZCcpKV0sXG5cdFx0XHRbJ21pc3NpbmcnLCBub3RGb3VuZCgpXSxcblx0XHRcdFsnZmFpbGVkJywgZmFpbGVkKCldLFxuXHRcdF0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVxdWVzdGVkOiByZXF1ZXN0LmluZm9zLm1hcChpbmZvID0+IGluZm8ubmFtZSkuc29ydCgpLFxuXHRcdFx0ZW5hYmxlZDogc2VydmljZS5nZXRFbmFibGVkTG9jYWxNY3BTZXJ2ZXJzKCkubWFwKHNlcnZlciA9PiBzZXJ2ZXIubmFtZSksXG5cdFx0XHR2ZXJpZmllZDogc2VydmljZS5sb2NhbC5tYXAoc2VydmVyID0+IFtzZXJ2ZXIubmFtZSwgISFzZXJ2ZXIuZ2FsbGVyeV0pLFxuXHRcdH0sIHtcblx0XHRcdHJlcXVlc3RlZDogWydmYWlsZWQnLCAnZm91bmQnLCAnbWlzc2luZyddLFxuXHRcdFx0ZW5hYmxlZDogWydmb3VuZCddLFxuXHRcdFx0dmVyaWZpZWQ6IFtbJ2ZhaWxlZCcsIGZhbHNlXSwgWydmb3VuZCcsIHRydWVdLCBbJ21pc3NpbmcnLCBmYWxzZV1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgdmVyaWZpZWQgbWVtYmVyc2hpcCBvbiB0cmFuc2llbnQgZmFpbHVyZSBhbmQgY2xlYXJzIGl0IG9uIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2ZXJpZmllZCA9IGNyZWF0ZUxvY2FsKCd2ZXJpZmllZCcpO1xuXHRcdGNvbnN0IHJlbW92ZWQgPSBjcmVhdGVMb2NhbCgncmVtb3ZlZCcpO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgZ2FsbGVyeVNlcnZpY2UsIG1hbmFnZW1lbnRTZXJ2aWNlIH0gPSBhd2FpdCBjcmVhdGVGaXh0dXJlKFt2ZXJpZmllZCwgcmVtb3ZlZF0pO1xuXHRcdGF3YWl0IGNvbXBsZXRlKGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCksIG5ldyBNYXAoW1xuXHRcdFx0Wyd2ZXJpZmllZCcsIGZvdW5kKGNyZWF0ZUdhbGxlcnkoJ3ZlcmlmaWVkJykpXSxcblx0XHRcdFsncmVtb3ZlZCcsIGZvdW5kKGNyZWF0ZUdhbGxlcnkoJ3JlbW92ZWQnKSldLFxuXHRcdF0pKTtcblxuXHRcdGNvbnN0IGFkZGVkID0gY3JlYXRlTG9jYWwoJ2FkZGVkJyk7XG5cdFx0bWFuYWdlbWVudFNlcnZpY2UuZmlyZUluc3RhbGwoW3sgbmFtZTogYWRkZWQubmFtZSwgbG9jYWw6IGFkZGVkLCBtY3BSZXNvdXJjZTogYWRkZWQubWNwUmVzb3VyY2UgfV0pO1xuXHRcdGF3YWl0IGNvbXBsZXRlKGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCksIG5ldyBNYXAoW1xuXHRcdFx0Wyd2ZXJpZmllZCcsIGZhaWxlZCgpXSxcblx0XHRcdFsncmVtb3ZlZCcsIG5vdEZvdW5kKCldLFxuXHRcdFx0WydhZGRlZCcsIGZhaWxlZCgpXSxcblx0XHRdKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVuYWJsZWQ6IHNlcnZpY2UuZ2V0RW5hYmxlZExvY2FsTWNwU2VydmVycygpLm1hcChzZXJ2ZXIgPT4gc2VydmVyLm5hbWUpLFxuXHRcdFx0dmVyaWZpZWQ6IHNlcnZpY2UubG9jYWwubWFwKHNlcnZlciA9PiBbc2VydmVyLm5hbWUsICEhc2VydmVyLmdhbGxlcnldKSxcblx0XHR9LCB7XG5cdFx0XHRlbmFibGVkOiBbJ3ZlcmlmaWVkJ10sXG5cdFx0XHR2ZXJpZmllZDogW1snYWRkZWQnLCBmYWxzZV0sIFsncmVtb3ZlZCcsIGZhbHNlXSwgWyd2ZXJpZmllZCcsIHRydWVdXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZGF0ZXMgbWVtYmVyc2hpcCBpbW1lZGlhdGVseSB3aGVuIHRoZSBhY3RpdmUgcmVnaXN0cnkgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IGNyZWF0ZUxvY2FsKCdzZXJ2ZXInKTtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGdhbGxlcnlTZXJ2aWNlLCBtYW5pZmVzdFNlcnZpY2UgfSA9IGF3YWl0IGNyZWF0ZUZpeHR1cmUoW2xvY2FsXSk7XG5cdFx0YXdhaXQgY29tcGxldGUoYXdhaXQgZ2FsbGVyeVNlcnZpY2UubmV4dFJlcXVlc3QoKSwgbmV3IE1hcChbXG5cdFx0XHRbbG9jYWwubmFtZSwgZm91bmQoY3JlYXRlR2FsbGVyeShsb2NhbC5uYW1lKSldLFxuXHRcdF0pKTtcblxuXHRcdG1hbmlmZXN0U2VydmljZS5maXJlQ2hhbmdlKCk7XG5cdFx0Y29uc3QgZW5hYmxlZEFmdGVySW52YWxpZGF0aW9uID0gc2VydmljZS5nZXRFbmFibGVkTG9jYWxNY3BTZXJ2ZXJzKCkubWFwKHNlcnZlciA9PiBzZXJ2ZXIubmFtZSk7XG5cdFx0YXdhaXQgY29tcGxldGUoYXdhaXQgZ2FsbGVyeVNlcnZpY2UubmV4dFJlcXVlc3QoKSwgbmV3IE1hcChbXG5cdFx0XHRbbG9jYWwubmFtZSwgZmFpbGVkKCldLFxuXHRcdF0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZW5hYmxlZEFmdGVySW52YWxpZGF0aW9uLFxuXHRcdFx0ZW5hYmxlZEFmdGVyRmFpbHVyZTogc2VydmljZS5nZXRFbmFibGVkTG9jYWxNY3BTZXJ2ZXJzKCkubWFwKHNlcnZlciA9PiBzZXJ2ZXIubmFtZSksXG5cdFx0XHRoYXNHYWxsZXJ5OiAhIXNlcnZpY2UubG9jYWxbMF0uZ2FsbGVyeSxcblx0XHR9LCB7XG5cdFx0XHRlbmFibGVkQWZ0ZXJJbnZhbGlkYXRpb246IFtdLFxuXHRcdFx0ZW5hYmxlZEFmdGVyRmFpbHVyZTogW10sXG5cdFx0XHRoYXNHYWxsZXJ5OiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZXMgYW5kIHJlLXZlcmlmaWVzIGluc3RhbGxlZCBzZXJ2ZXJzIHdoZW4gdGhlIHByb2ZpbGUgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvbGRMb2NhbCA9IGNyZWF0ZUxvY2FsKCdvbGQtcHJvZmlsZScpO1xuXHRcdGNvbnN0IG5ld0xvY2FsID0gY3JlYXRlTG9jYWwoJ25ldy1wcm9maWxlJyk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBnYWxsZXJ5U2VydmljZSwgbWFuYWdlbWVudFNlcnZpY2UgfSA9IGF3YWl0IGNyZWF0ZUZpeHR1cmUoW29sZExvY2FsXSk7XG5cdFx0YXdhaXQgY29tcGxldGUoYXdhaXQgZ2FsbGVyeVNlcnZpY2UubmV4dFJlcXVlc3QoKSwgbmV3IE1hcChbXG5cdFx0XHRbb2xkTG9jYWwubmFtZSwgZm91bmQoY3JlYXRlR2FsbGVyeShvbGRMb2NhbC5uYW1lKSldLFxuXHRcdF0pKTtcblx0XHRjb25zdCByZXNldFByb21pc2UgPSBFdmVudC50b1Byb21pc2Uoc2VydmljZS5vblJlc2V0KTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsZWQgPSBbbmV3TG9jYWxdO1xuXG5cdFx0bWFuYWdlbWVudFNlcnZpY2UuZmlyZVByb2ZpbGVDaGFuZ2UoKTtcblx0XHRjb25zdCBlbmFibGVkQWZ0ZXJJbnZhbGlkYXRpb24gPSBzZXJ2aWNlLmdldEVuYWJsZWRMb2NhbE1jcFNlcnZlcnMoKS5tYXAoc2VydmVyID0+IHNlcnZlci5uYW1lKTtcblx0XHRhd2FpdCByZXNldFByb21pc2U7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCk7XG5cdFx0YXdhaXQgY29tcGxldGUocmVxdWVzdCwgbmV3IE1hcChbXG5cdFx0XHRbbmV3TG9jYWwubmFtZSwgZm91bmQoY3JlYXRlR2FsbGVyeShuZXdMb2NhbC5uYW1lKSldLFxuXHRcdF0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZW5hYmxlZEFmdGVySW52YWxpZGF0aW9uLFxuXHRcdFx0cmVxdWVzdGVkOiByZXF1ZXN0LmluZm9zLm1hcChpbmZvID0+IGluZm8ubmFtZSksXG5cdFx0XHRsb2NhbDogc2VydmljZS5sb2NhbC5tYXAoc2VydmVyID0+IHNlcnZlci5uYW1lKSxcblx0XHRcdGVuYWJsZWQ6IHNlcnZpY2UuZ2V0RW5hYmxlZExvY2FsTWNwU2VydmVycygpLm1hcChzZXJ2ZXIgPT4gc2VydmVyLm5hbWUpLFxuXHRcdH0sIHtcblx0XHRcdGVuYWJsZWRBZnRlckludmFsaWRhdGlvbjogW10sXG5cdFx0XHRyZXF1ZXN0ZWQ6IFtuZXdMb2NhbC5uYW1lXSxcblx0XHRcdGxvY2FsOiBbbmV3TG9jYWwubmFtZV0sXG5cdFx0XHRlbmFibGVkOiBbbmV3TG9jYWwubmFtZV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgYW4gb2xkZXIgcHJvZmlsZSBxdWVyeSB0aGF0IGNvbXBsZXRlcyBhZnRlciBhIG5ld2VyIHByb2ZpbGUgcXVlcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5pdGlhbCA9IGNyZWF0ZUxvY2FsKCdpbml0aWFsLXByb2ZpbGUnKTtcblx0XHRjb25zdCBvbGRlciA9IGNyZWF0ZUxvY2FsKCdvbGRlci1wcm9maWxlJyk7XG5cdFx0Y29uc3QgbmV3ZXIgPSBjcmVhdGVMb2NhbCgnbmV3ZXItcHJvZmlsZScpO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgZ2FsbGVyeVNlcnZpY2UsIG1hbmFnZW1lbnRTZXJ2aWNlIH0gPSBhd2FpdCBjcmVhdGVGaXh0dXJlKFtpbml0aWFsXSk7XG5cdFx0YXdhaXQgY29tcGxldGUoYXdhaXQgZ2FsbGVyeVNlcnZpY2UubmV4dFJlcXVlc3QoKSwgbmV3IE1hcChbXG5cdFx0XHRbaW5pdGlhbC5uYW1lLCBmb3VuZChjcmVhdGVHYWxsZXJ5KGluaXRpYWwubmFtZSkpXSxcblx0XHRdKSk7XG5cdFx0Y29uc3Qgb2xkZXJSZXN1bHQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcltdPigpO1xuXHRcdGNvbnN0IG5ld2VyUmVzdWx0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXJbXT4oKTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5xdWV1ZUluc3RhbGxlZFJlc3VsdChvbGRlclJlc3VsdC5wKTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5xdWV1ZUluc3RhbGxlZFJlc3VsdChuZXdlclJlc3VsdC5wKTtcblx0XHRsZXQgcmVzZXRDb3VudCA9IDA7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25SZXNldCgoKSA9PiByZXNldENvdW50KyspKTtcblx0XHRjb25zdCByZXNldFByb21pc2UgPSBFdmVudC50b1Byb21pc2Uoc2VydmljZS5vblJlc2V0KTtcblxuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLmZpcmVQcm9maWxlQ2hhbmdlKCk7XG5cdFx0bWFuYWdlbWVudFNlcnZpY2UuZmlyZVByb2ZpbGVDaGFuZ2UoKTtcblx0XHRhd2FpdCBuZXdlclJlc3VsdC5jb21wbGV0ZShbbmV3ZXJdKTtcblx0XHRhd2FpdCByZXNldFByb21pc2U7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCk7XG5cdFx0YXdhaXQgY29tcGxldGUocmVxdWVzdCwgbmV3IE1hcChbXG5cdFx0XHRbbmV3ZXIubmFtZSwgZm91bmQoY3JlYXRlR2FsbGVyeShuZXdlci5uYW1lKSldLFxuXHRcdF0pKTtcblx0XHRhd2FpdCBvbGRlclJlc3VsdC5jb21wbGV0ZShbb2xkZXJdKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXF1ZXN0ZWQ6IHJlcXVlc3QuaW5mb3MubWFwKGluZm8gPT4gaW5mby5uYW1lKSxcblx0XHRcdGxvY2FsOiBzZXJ2aWNlLmxvY2FsLm1hcChzZXJ2ZXIgPT4gc2VydmVyLm5hbWUpLFxuXHRcdFx0ZW5hYmxlZDogc2VydmljZS5nZXRFbmFibGVkTG9jYWxNY3BTZXJ2ZXJzKCkubWFwKHNlcnZlciA9PiBzZXJ2ZXIubmFtZSksXG5cdFx0XHRyZXNldENvdW50LFxuXHRcdH0sIHtcblx0XHRcdHJlcXVlc3RlZDogW25ld2VyLm5hbWVdLFxuXHRcdFx0bG9jYWw6IFtuZXdlci5uYW1lXSxcblx0XHRcdGVuYWJsZWQ6IFtuZXdlci5uYW1lXSxcblx0XHRcdHJlc2V0Q291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlLXZlcmlmaWVzIHRoZSBjdXJyZW50IHByb2ZpbGUgd2hlbiBhIHB1YmxpYyBsb2NhbCBxdWVyeSBzdXBlcnNlZGVzIGl0cyBwcm9maWxlIHF1ZXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluaXRpYWwgPSBjcmVhdGVMb2NhbCgnaW5pdGlhbC1wcm9maWxlJyk7XG5cdFx0Y29uc3QgY3VycmVudCA9IGNyZWF0ZUxvY2FsKCdjdXJyZW50LXByb2ZpbGUnKTtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGdhbGxlcnlTZXJ2aWNlLCBtYW5hZ2VtZW50U2VydmljZSB9ID0gYXdhaXQgY3JlYXRlRml4dHVyZShbaW5pdGlhbF0pO1xuXHRcdGF3YWl0IGNvbXBsZXRlKGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCksIG5ldyBNYXAoW1xuXHRcdFx0W2luaXRpYWwubmFtZSwgZm91bmQoY3JlYXRlR2FsbGVyeShpbml0aWFsLm5hbWUpKV0sXG5cdFx0XSkpO1xuXHRcdGNvbnN0IHByb2ZpbGVSZXN1bHQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcltdPigpO1xuXHRcdGNvbnN0IHB1YmxpY1Jlc3VsdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8SVdvcmtiZW5jaExvY2FsTWNwU2VydmVyW10+KCk7XG5cdFx0bWFuYWdlbWVudFNlcnZpY2UucXVldWVJbnN0YWxsZWRSZXN1bHQocHJvZmlsZVJlc3VsdC5wKTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5xdWV1ZUluc3RhbGxlZFJlc3VsdChwdWJsaWNSZXN1bHQucCk7XG5cdFx0Y29uc3QgcmVzZXRQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHNlcnZpY2Uub25SZXNldCk7XG5cblx0XHRtYW5hZ2VtZW50U2VydmljZS5maXJlUHJvZmlsZUNoYW5nZSgpO1xuXHRcdGNvbnN0IHB1YmxpY1F1ZXJ5ID0gc2VydmljZS5xdWVyeUxvY2FsKCk7XG5cdFx0YXdhaXQgcHVibGljUmVzdWx0LmNvbXBsZXRlKFtjdXJyZW50XSk7XG5cdFx0YXdhaXQgcHVibGljUXVlcnk7XG5cdFx0YXdhaXQgcHJvZmlsZVJlc3VsdC5jb21wbGV0ZShbaW5pdGlhbF0pO1xuXHRcdGF3YWl0IHJlc2V0UHJvbWlzZTtcblx0XHRjb25zdCByZXF1ZXN0ID0gYXdhaXQgZ2FsbGVyeVNlcnZpY2UubmV4dFJlcXVlc3QoKTtcblx0XHRhd2FpdCBjb21wbGV0ZShyZXF1ZXN0LCBuZXcgTWFwKFtcblx0XHRcdFtjdXJyZW50Lm5hbWUsIGZvdW5kKGNyZWF0ZUdhbGxlcnkoY3VycmVudC5uYW1lKSldLFxuXHRcdF0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVxdWVzdGVkOiByZXF1ZXN0LmluZm9zLm1hcChpbmZvID0+IGluZm8ubmFtZSksXG5cdFx0XHRsb2NhbDogc2VydmljZS5sb2NhbC5tYXAoc2VydmVyID0+IHNlcnZlci5uYW1lKSxcblx0XHRcdGVuYWJsZWQ6IHNlcnZpY2UuZ2V0RW5hYmxlZExvY2FsTWNwU2VydmVycygpLm1hcChzZXJ2ZXIgPT4gc2VydmVyLm5hbWUpLFxuXHRcdH0sIHtcblx0XHRcdHJlcXVlc3RlZDogW2N1cnJlbnQubmFtZV0sXG5cdFx0XHRsb2NhbDogW2N1cnJlbnQubmFtZV0sXG5cdFx0XHRlbmFibGVkOiBbY3VycmVudC5uYW1lXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBzdGFsZSBsb29rdXAgcmVzdWx0cyBhZnRlciBhIGxvY2FsIGNvbmZpZ3VyYXRpb24gdXBkYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsID0gY3JlYXRlTG9jYWwoJ3NlcnZlcicpO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgZ2FsbGVyeVNlcnZpY2UsIG1hbmFnZW1lbnRTZXJ2aWNlIH0gPSBhd2FpdCBjcmVhdGVGaXh0dXJlKFtsb2NhbF0pO1xuXHRcdGNvbnN0IHN0YWxlUmVxdWVzdCA9IGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCk7XG5cblx0XHRtYW5hZ2VtZW50U2VydmljZS5maXJlVXBkYXRlKFt7IG5hbWU6IGxvY2FsLm5hbWUsIGxvY2FsLCBtY3BSZXNvdXJjZTogbG9jYWwubWNwUmVzb3VyY2UgfV0pO1xuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLmZpcmVVcGRhdGUoW3sgbmFtZTogbG9jYWwubmFtZSwgbG9jYWwsIG1jcFJlc291cmNlOiBsb2NhbC5tY3BSZXNvdXJjZSB9XSk7XG5cdFx0bWFuYWdlbWVudFNlcnZpY2UuZmlyZVVwZGF0ZShbeyBuYW1lOiBsb2NhbC5uYW1lLCBsb2NhbCwgbWNwUmVzb3VyY2U6IGxvY2FsLm1jcFJlc291cmNlIH1dKTtcblx0XHRhd2FpdCBjb21wbGV0ZShzdGFsZVJlcXVlc3QsIG5ldyBNYXAoW1xuXHRcdFx0W2xvY2FsLm5hbWUsIGZvdW5kKGNyZWF0ZUdhbGxlcnkobG9jYWwubmFtZSkpXSxcblx0XHRdKSk7XG5cdFx0Y29uc3QgY3VycmVudFJlcXVlc3QgPSBhd2FpdCBnYWxsZXJ5U2VydmljZS5uZXh0UmVxdWVzdCgpO1xuXHRcdGNvbnN0IHN0YWxlUmVzdWx0QXBwbGllZCA9ICEhc2VydmljZS5sb2NhbFswXS5nYWxsZXJ5O1xuXHRcdGF3YWl0IGNvbXBsZXRlKGN1cnJlbnRSZXF1ZXN0LCBuZXcgTWFwKFtcblx0XHRcdFtsb2NhbC5uYW1lLCBub3RGb3VuZCgpXSxcblx0XHRdKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YWxlUmVzdWx0QXBwbGllZCxcblx0XHRcdGVuYWJsZWQ6IHNlcnZpY2UuZ2V0RW5hYmxlZExvY2FsTWNwU2VydmVycygpLm1hcChzZXJ2ZXIgPT4gc2VydmVyLm5hbWUpLFxuXHRcdFx0cmVxdWVzdENvdW50OiBnYWxsZXJ5U2VydmljZS5yZXF1ZXN0Q291bnQsXG5cdFx0fSwge1xuXHRcdFx0c3RhbGVSZXN1bHRBcHBsaWVkOiBmYWxzZSxcblx0XHRcdGVuYWJsZWQ6IFtdLFxuXHRcdFx0cmVxdWVzdENvdW50OiAyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgbWF0Y2hpbmcgdHJ1c3RlZCB1cGRhdGUgc291cmNlcyBhbmQgcmVqZWN0cyBtaXNtYXRjaGVkIHNvdXJjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWwgPSBjcmVhdGVMb2NhbCgndXBkYXRlZCcpO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgZ2FsbGVyeVNlcnZpY2UsIG1hbmFnZW1lbnRTZXJ2aWNlIH0gPSBhd2FpdCBjcmVhdGVGaXh0dXJlKFtsb2NhbF0pO1xuXHRcdGF3YWl0IGNvbXBsZXRlKGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCksIG5ldyBNYXAoW1xuXHRcdFx0W2xvY2FsLm5hbWUsIGZvdW5kKGNyZWF0ZUdhbGxlcnkobG9jYWwubmFtZSkpXSxcblx0XHRdKSk7XG5cdFx0Y29uc3QgdHJ1c3RlZFVwZGF0ZSA9IGNyZWF0ZUdhbGxlcnkobG9jYWwubmFtZSk7XG5cdFx0Z2FsbGVyeVNlcnZpY2UucXVlcnlJdGVtcyA9IFt0cnVzdGVkVXBkYXRlXTtcblx0XHRhd2FpdCBzZXJ2aWNlLnF1ZXJ5R2FsbGVyeSgpO1xuXG5cdFx0bWFuYWdlbWVudFNlcnZpY2UuZmlyZVVwZGF0ZShbeyBuYW1lOiBsb2NhbC5uYW1lLCBsb2NhbCwgc291cmNlOiB0cnVzdGVkVXBkYXRlLCBtY3BSZXNvdXJjZTogbG9jYWwubWNwUmVzb3VyY2UgfV0pO1xuXHRcdGNvbnN0IHRydXN0ZWRVcGRhdGVBcHBsaWVkID0gc2VydmljZS5sb2NhbFswXS5nYWxsZXJ5ID09PSB0cnVzdGVkVXBkYXRlO1xuXHRcdGF3YWl0IGNvbXBsZXRlKGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCksIG5ldyBNYXAoW1xuXHRcdFx0W2xvY2FsLm5hbWUsIGZhaWxlZCgpXSxcblx0XHRdKSk7XG5cdFx0Y29uc3QgbWlzbWF0Y2hlZFVwZGF0ZSA9IGNyZWF0ZUdhbGxlcnkoJ2RpZmZlcmVudC1uYW1lJyk7XG5cblx0XHRtYW5hZ2VtZW50U2VydmljZS5maXJlVXBkYXRlKFt7IG5hbWU6IGxvY2FsLm5hbWUsIGxvY2FsLCBzb3VyY2U6IG1pc21hdGNoZWRVcGRhdGUsIG1jcFJlc291cmNlOiBsb2NhbC5tY3BSZXNvdXJjZSB9XSk7XG5cdFx0Y29uc3QgbWlzbWF0Y2hlZFVwZGF0ZUFwcGxpZWQgPSBzZXJ2aWNlLmxvY2FsWzBdLmdhbGxlcnkgPT09IG1pc21hdGNoZWRVcGRhdGU7XG5cdFx0Y29uc3QgZW5hYmxlZEFmdGVyTWlzbWF0Y2ggPSBzZXJ2aWNlLmdldEVuYWJsZWRMb2NhbE1jcFNlcnZlcnMoKS5tYXAoc2VydmVyID0+IHNlcnZlci5uYW1lKTtcblx0XHRhd2FpdCBjb21wbGV0ZShhd2FpdCBnYWxsZXJ5U2VydmljZS5uZXh0UmVxdWVzdCgpLCBuZXcgTWFwKFtcblx0XHRcdFtsb2NhbC5uYW1lLCBmYWlsZWQoKV0sXG5cdFx0XSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0cnVzdGVkVXBkYXRlQXBwbGllZCxcblx0XHRcdG1pc21hdGNoZWRVcGRhdGVBcHBsaWVkLFxuXHRcdFx0ZW5hYmxlZEFmdGVyTWlzbWF0Y2gsXG5cdFx0XHRlbmFibGVkQWZ0ZXJGYWlsdXJlOiBzZXJ2aWNlLmdldEVuYWJsZWRMb2NhbE1jcFNlcnZlcnMoKS5tYXAoc2VydmVyID0+IHNlcnZlci5uYW1lKSxcblx0XHR9LCB7XG5cdFx0XHR0cnVzdGVkVXBkYXRlQXBwbGllZDogdHJ1ZSxcblx0XHRcdG1pc21hdGNoZWRVcGRhdGVBcHBsaWVkOiBmYWxzZSxcblx0XHRcdGVuYWJsZWRBZnRlck1pc21hdGNoOiBbbG9jYWwubmFtZV0sXG5cdFx0XHRlbmFibGVkQWZ0ZXJGYWlsdXJlOiBbbG9jYWwubmFtZV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZHVwbGljYXRlcyByZWdpc3RyeSBsb29rdXBzIGZvciB0aGUgc2FtZSBzZXJ2ZXIgbmFtZSBhY3Jvc3Mgc2NvcGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVzZXIgPSBjcmVhdGVMb2NhbCgnZHVwbGljYXRlJywgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB7IC4uLmNyZWF0ZUxvY2FsKCdkdXBsaWNhdGUnLCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSksIGdhbGxlcnlJZDogJ3JlZ2lzdHJ5LWlkJyB9O1xuXHRcdGNvbnN0IHsgc2VydmljZSwgZ2FsbGVyeVNlcnZpY2UgfSA9IGF3YWl0IGNyZWF0ZUZpeHR1cmUoW3VzZXIsIHdvcmtzcGFjZV0pO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBhd2FpdCBnYWxsZXJ5U2VydmljZS5uZXh0UmVxdWVzdCgpO1xuXHRcdGF3YWl0IGNvbXBsZXRlKHJlcXVlc3QsIG5ldyBNYXAoW1xuXHRcdFx0WydkdXBsaWNhdGUnLCBmb3VuZChjcmVhdGVHYWxsZXJ5KCdkdXBsaWNhdGUnKSldLFxuXHRcdF0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVxdWVzdGVkOiByZXF1ZXN0LmluZm9zLFxuXHRcdFx0dmVyaWZpZWQ6IHNlcnZpY2UubG9jYWwubWFwKHNlcnZlciA9PiAhIXNlcnZlci5nYWxsZXJ5KSxcblx0XHRcdGVuYWJsZWRTY29wZXM6IHNlcnZpY2UuZ2V0RW5hYmxlZExvY2FsTWNwU2VydmVycygpLm1hcChzZXJ2ZXIgPT4gc2VydmVyLnNjb3BlKSxcblx0XHR9LCB7XG5cdFx0XHRyZXF1ZXN0ZWQ6IFt7IG5hbWU6ICdkdXBsaWNhdGUnLCBpZDogJ3JlZ2lzdHJ5LWlkJyB9XSxcblx0XHRcdHZlcmlmaWVkOiBbdHJ1ZSwgdHJ1ZV0sXG5cdFx0XHRlbmFibGVkU2NvcGVzOiBbTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2VdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0cnVzdGVkIGdhbGxlcnkgbWV0YWRhdGEgd2hpbGUgYW4gaW5zdGFsbCBpcyByZXZhbGlkYXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGdhbGxlcnlTZXJ2aWNlLCBtYW5hZ2VtZW50U2VydmljZSB9ID0gYXdhaXQgY3JlYXRlRml4dHVyZShbXSk7XG5cdFx0Y29uc3QgZ2FsbGVyeSA9IGNyZWF0ZUdhbGxlcnkoJ2dhbGxlcnktaW5zdGFsbCcpO1xuXHRcdGNvbnN0IGxvY2FsID0gY3JlYXRlTG9jYWwoZ2FsbGVyeS5uYW1lKTtcblx0XHRnYWxsZXJ5U2VydmljZS5xdWVyeUl0ZW1zID0gW2dhbGxlcnldO1xuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeVJlc3VsdCA9IGxvY2FsO1xuXHRcdGNvbnN0IHBhZ2VyID0gYXdhaXQgc2VydmljZS5xdWVyeUdhbGxlcnkoKTtcblxuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHNlcnZpY2UuaW5zdGFsbChwYWdlci5maXJzdFBhZ2UuaXRlbXNbMF0pO1xuXHRcdGNvbnN0IGVuYWJsZWRCZWZvcmVSZXZhbGlkYXRpb24gPSBzZXJ2aWNlLmdldEVuYWJsZWRMb2NhbE1jcFNlcnZlcnMoKS5tYXAoc2VydmVyID0+IHNlcnZlci5uYW1lKTtcblx0XHRhd2FpdCBjb21wbGV0ZShhd2FpdCBnYWxsZXJ5U2VydmljZS5uZXh0UmVxdWVzdCgpLCBuZXcgTWFwKFtcblx0XHRcdFtsb2NhbC5uYW1lLCBmYWlsZWQoKV0sXG5cdFx0XSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0cnVzdGVkR2FsbGVyeVByZXNlcnZlZDogaW5zdGFsbGVkLmdhbGxlcnkgPT09IGdhbGxlcnksXG5cdFx0XHRlbmFibGVkQmVmb3JlUmV2YWxpZGF0aW9uLFxuXHRcdFx0ZW5hYmxlZEFmdGVyRmFpbHVyZTogc2VydmljZS5nZXRFbmFibGVkTG9jYWxNY3BTZXJ2ZXJzKCkubWFwKHNlcnZlciA9PiBzZXJ2ZXIubmFtZSksXG5cdFx0fSwge1xuXHRcdFx0dHJ1c3RlZEdhbGxlcnlQcmVzZXJ2ZWQ6IHRydWUsXG5cdFx0XHRlbmFibGVkQmVmb3JlUmV2YWxpZGF0aW9uOiBbbG9jYWwubmFtZV0sXG5cdFx0XHRlbmFibGVkQWZ0ZXJGYWlsdXJlOiBbbG9jYWwubmFtZV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgZ2FsbGVyeSBtZXRhZGF0YSBmcm9tIGFuIGluc3RhbGwgdGhhdCBjb21wbGV0ZXMgYWZ0ZXIgYSByZWdpc3RyeSBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBnYWxsZXJ5U2VydmljZSwgbWFuaWZlc3RTZXJ2aWNlLCBtYW5hZ2VtZW50U2VydmljZSB9ID0gYXdhaXQgY3JlYXRlRml4dHVyZShbXSk7XG5cdFx0Y29uc3QgZ2FsbGVyeSA9IGNyZWF0ZUdhbGxlcnkoJ3N0YWxlLWdhbGxlcnktaW5zdGFsbCcpO1xuXHRcdGNvbnN0IGxvY2FsID0gY3JlYXRlTG9jYWwoZ2FsbGVyeS5uYW1lKTtcblx0XHRjb25zdCBpbnN0YWxsQmFycmllciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRnYWxsZXJ5U2VydmljZS5xdWVyeUl0ZW1zID0gW2dhbGxlcnldO1xuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeVJlc3VsdCA9IGxvY2FsO1xuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeUJhcnJpZXIgPSBpbnN0YWxsQmFycmllcjtcblx0XHRjb25zdCBwYWdlciA9IGF3YWl0IHNlcnZpY2UucXVlcnlHYWxsZXJ5KCk7XG5cblx0XHRjb25zdCBpbnN0YWxsUHJvbWlzZSA9IHNlcnZpY2UuaW5zdGFsbChwYWdlci5maXJzdFBhZ2UuaXRlbXNbMF0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0bWFuaWZlc3RTZXJ2aWNlLmZpcmVDaGFuZ2UoKTtcblx0XHRhd2FpdCBpbnN0YWxsQmFycmllci5jb21wbGV0ZSgpO1xuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IGluc3RhbGxQcm9taXNlO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBhd2FpdCBnYWxsZXJ5U2VydmljZS5uZXh0UmVxdWVzdCgpO1xuXHRcdGF3YWl0IGNvbXBsZXRlKHJlcXVlc3QsIG5ldyBNYXAoW1xuXHRcdFx0W2xvY2FsLm5hbWUsIGZhaWxlZCgpXSxcblx0XHRdKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YWxlR2FsbGVyeUFwcGxpZWQ6IGluc3RhbGxlZC5nYWxsZXJ5ID09PSBnYWxsZXJ5LFxuXHRcdFx0ZW5hYmxlZDogc2VydmljZS5nZXRFbmFibGVkTG9jYWxNY3BTZXJ2ZXJzKCkubWFwKHNlcnZlciA9PiBzZXJ2ZXIubmFtZSksXG5cdFx0fSwge1xuXHRcdFx0c3RhbGVHYWxsZXJ5QXBwbGllZDogZmFsc2UsXG5cdFx0XHRlbmFibGVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBnYWxsZXJ5IG1ldGFkYXRhIHJldHVybmVkIGJ5IGEgcXVlcnkgdGhhdCBjb21wbGV0ZXMgYWZ0ZXIgYSByZWdpc3RyeSBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBnYWxsZXJ5U2VydmljZSwgbWFuaWZlc3RTZXJ2aWNlLCBtYW5hZ2VtZW50U2VydmljZSB9ID0gYXdhaXQgY3JlYXRlRml4dHVyZShbXSk7XG5cdFx0Y29uc3QgZ2FsbGVyeSA9IGNyZWF0ZUdhbGxlcnkoJ3N0YWxlLWdhbGxlcnktcXVlcnknKTtcblx0XHRjb25zdCBsb2NhbCA9IGNyZWF0ZUxvY2FsKGdhbGxlcnkubmFtZSk7XG5cdFx0Y29uc3QgcXVlcnlCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGdhbGxlcnlTZXJ2aWNlLnF1ZXJ5SXRlbXMgPSBbZ2FsbGVyeV07XG5cdFx0Z2FsbGVyeVNlcnZpY2UucXVlcnlCYXJyaWVyID0gcXVlcnlCYXJyaWVyO1xuXG5cdFx0Y29uc3QgcXVlcnlQcm9taXNlID0gc2VydmljZS5xdWVyeUdhbGxlcnkoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdG1hbmlmZXN0U2VydmljZS5maXJlQ2hhbmdlKCk7XG5cdFx0YXdhaXQgcXVlcnlCYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgcGFnZXIgPSBhd2FpdCBxdWVyeVByb21pc2U7XG5cdFx0bWFuYWdlbWVudFNlcnZpY2UuZmlyZUluc3RhbGwoW3sgbmFtZTogbG9jYWwubmFtZSwgbG9jYWwsIHNvdXJjZTogcGFnZXIuZmlyc3RQYWdlLml0ZW1zWzBdLmdhbGxlcnksIG1jcFJlc291cmNlOiBsb2NhbC5tY3BSZXNvdXJjZSB9XSk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCk7XG5cdFx0YXdhaXQgY29tcGxldGUocmVxdWVzdCwgbmV3IE1hcChbXG5cdFx0XHRbbG9jYWwubmFtZSwgZmFpbGVkKCldLFxuXHRcdF0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhbGVHYWxsZXJ5QXBwbGllZDogc2VydmljZS5sb2NhbFswXS5nYWxsZXJ5ID09PSBnYWxsZXJ5LFxuXHRcdFx0ZW5hYmxlZDogc2VydmljZS5nZXRFbmFibGVkTG9jYWxNY3BTZXJ2ZXJzKCkubWFwKHNlcnZlciA9PiBzZXJ2ZXIubmFtZSksXG5cdFx0fSwge1xuXHRcdFx0c3RhbGVHYWxsZXJ5QXBwbGllZDogZmFsc2UsXG5cdFx0XHRlbmFibGVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJ1c3RzIGdhbGxlcnkgbWV0YWRhdGEgcHJvcGFnYXRlZCBieSBhbiBleHRlcm5hbCBnYWxsZXJ5IGluc3RhbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBnYWxsZXJ5U2VydmljZSwgbWFuYWdlbWVudFNlcnZpY2UgfSA9IGF3YWl0IGNyZWF0ZUZpeHR1cmUoW10pO1xuXHRcdGNvbnN0IGdhbGxlcnkgPSBjcmVhdGVHYWxsZXJ5KCdleHRlcm5hbC1nYWxsZXJ5LWluc3RhbGwnKTtcblx0XHRjb25zdCBsb2NhbCA9IGNyZWF0ZUxvY2FsKGdhbGxlcnkubmFtZSk7XG5cdFx0Z2FsbGVyeVNlcnZpY2UucXVlcnlJdGVtcyA9IFtnYWxsZXJ5XTtcblx0XHRhd2FpdCBzZXJ2aWNlLnF1ZXJ5R2FsbGVyeSgpO1xuXG5cdFx0bWFuYWdlbWVudFNlcnZpY2UuZmlyZUluc3RhbGwoW3sgbmFtZTogbG9jYWwubmFtZSwgbG9jYWwsIHNvdXJjZTogZ2FsbGVyeSwgbWNwUmVzb3VyY2U6IGxvY2FsLm1jcFJlc291cmNlIH1dKTtcblx0XHRjb25zdCBlbmFibGVkQmVmb3JlUmV2YWxpZGF0aW9uID0gc2VydmljZS5nZXRFbmFibGVkTG9jYWxNY3BTZXJ2ZXJzKCkubWFwKHNlcnZlciA9PiBzZXJ2ZXIubmFtZSk7XG5cdFx0YXdhaXQgY29tcGxldGUoYXdhaXQgZ2FsbGVyeVNlcnZpY2UubmV4dFJlcXVlc3QoKSwgbmV3IE1hcChbXG5cdFx0XHRbbG9jYWwubmFtZSwgZmFpbGVkKCldLFxuXHRcdF0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2FsbGVyeVByZXNlcnZlZDogc2VydmljZS5sb2NhbFswXS5nYWxsZXJ5ID09PSBnYWxsZXJ5LFxuXHRcdFx0ZW5hYmxlZEJlZm9yZVJldmFsaWRhdGlvbixcblx0XHRcdGVuYWJsZWRBZnRlckZhaWx1cmU6IHNlcnZpY2UuZ2V0RW5hYmxlZExvY2FsTWNwU2VydmVycygpLm1hcChzZXJ2ZXIgPT4gc2VydmVyLm5hbWUpLFxuXHRcdH0sIHtcblx0XHRcdGdhbGxlcnlQcmVzZXJ2ZWQ6IHRydWUsXG5cdFx0XHRlbmFibGVkQmVmb3JlUmV2YWxpZGF0aW9uOiBbbG9jYWwubmFtZV0sXG5cdFx0XHRlbmFibGVkQWZ0ZXJGYWlsdXJlOiBbbG9jYWwubmFtZV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgZ2FsbGVyeSBtZXRhZGF0YSBmcm9tIGFuIHVwZGF0ZSB0aGF0IGNvbXBsZXRlcyBhZnRlciBhIHJlZ2lzdHJ5IGNoYW5nZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbCA9IGNyZWF0ZUxvY2FsKCdzdGFsZS1nYWxsZXJ5LXVwZGF0ZScpO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgZ2FsbGVyeVNlcnZpY2UsIG1hbmlmZXN0U2VydmljZSwgbWFuYWdlbWVudFNlcnZpY2UgfSA9IGF3YWl0IGNyZWF0ZUZpeHR1cmUoW2xvY2FsXSk7XG5cdFx0YXdhaXQgY29tcGxldGUoYXdhaXQgZ2FsbGVyeVNlcnZpY2UubmV4dFJlcXVlc3QoKSwgbmV3IE1hcChbXG5cdFx0XHRbbG9jYWwubmFtZSwgZm91bmQoY3JlYXRlR2FsbGVyeShsb2NhbC5uYW1lKSldLFxuXHRcdF0pKTtcblx0XHRjb25zdCBzdGFsZUdhbGxlcnkgPSBjcmVhdGVHYWxsZXJ5KGxvY2FsLm5hbWUpO1xuXHRcdGdhbGxlcnlTZXJ2aWNlLnF1ZXJ5SXRlbXMgPSBbc3RhbGVHYWxsZXJ5XTtcblx0XHRhd2FpdCBzZXJ2aWNlLnF1ZXJ5R2FsbGVyeSgpO1xuXG5cdFx0bWFuaWZlc3RTZXJ2aWNlLmZpcmVDaGFuZ2UoKTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5maXJlVXBkYXRlKFt7IG5hbWU6IGxvY2FsLm5hbWUsIGxvY2FsLCBzb3VyY2U6IHN0YWxlR2FsbGVyeSwgbWNwUmVzb3VyY2U6IGxvY2FsLm1jcFJlc291cmNlIH1dKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gYXdhaXQgZ2FsbGVyeVNlcnZpY2UubmV4dFJlcXVlc3QoKTtcblx0XHRhd2FpdCBjb21wbGV0ZShyZXF1ZXN0LCBuZXcgTWFwKFtcblx0XHRcdFtsb2NhbC5uYW1lLCBmYWlsZWQoKV0sXG5cdFx0XSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFsZUdhbGxlcnlBcHBsaWVkOiBzZXJ2aWNlLmxvY2FsWzBdLmdhbGxlcnkgPT09IHN0YWxlR2FsbGVyeSxcblx0XHRcdGVuYWJsZWQ6IHNlcnZpY2UuZ2V0RW5hYmxlZExvY2FsTWNwU2VydmVycygpLm1hcChzZXJ2ZXIgPT4gc2VydmVyLm5hbWUpLFxuXHRcdH0sIHtcblx0XHRcdHN0YWxlR2FsbGVyeUFwcGxpZWQ6IGZhbHNlLFxuXHRcdFx0ZW5hYmxlZDogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVpcmVzIHJlbW90ZSBVUkxzIHRvIG1hdGNoIHRoZSByZWdpc3RyeSBlbnRyeSBleGFjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFsbG93ZWQgPSBjcmVhdGVMb2NhbCgnYWxsb3dlZCcsIExvY2FsTWNwU2VydmVyU2NvcGUuVXNlciwgeyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLlJFTU9URSwgdXJsOiAnaHR0cHM6Ly9hbGxvd2VkLnRlc3QvbWNwJyB9KTtcblx0XHRjb25zdCBibG9ja2VkID0gY3JlYXRlTG9jYWwoJ2Jsb2NrZWQnLCBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIsIHsgdHlwZTogTWNwU2VydmVyVHlwZS5SRU1PVEUsIHVybDogJ2h0dHBzOi8vYmxvY2tlZC50ZXN0L21jcCcgfSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBnYWxsZXJ5U2VydmljZSB9ID0gYXdhaXQgY3JlYXRlRml4dHVyZShbYWxsb3dlZCwgYmxvY2tlZF0pO1xuXHRcdGF3YWl0IGNvbXBsZXRlKGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCksIG5ldyBNYXAoW1xuXHRcdFx0W2FsbG93ZWQubmFtZSwgZm91bmQoY3JlYXRlR2FsbGVyeShhbGxvd2VkLm5hbWUsIFsnaHR0cHM6Ly9hbGxvd2VkLnRlc3QvbWNwJ10pKV0sXG5cdFx0XHRbYmxvY2tlZC5uYW1lLCBmb3VuZChjcmVhdGVHYWxsZXJ5KGJsb2NrZWQubmFtZSwgWydodHRwczovL2RpZmZlcmVudC50ZXN0L21jcCddKSldLFxuXHRcdF0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbmFibGVkTG9jYWxNY3BTZXJ2ZXJzKCkubWFwKHNlcnZlciA9PiBzZXJ2ZXIubmFtZSksIFsnYWxsb3dlZCddKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgYSBzdGFibGUgb3JkZXIgZm9yIGR1cGxpY2F0ZSBzZXJ2ZXIgbmFtZXMgYWNyb3NzIHJlcGVhdGVkIHNvcnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVzZXIgPSBjcmVhdGVMb2NhbCgnZHVwbGljYXRlJywgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VBID0geyAuLi5jcmVhdGVMb2NhbCgnZHVwbGljYXRlJywgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpLCBpZDogJ3dvcmtzcGFjZS9hL2R1cGxpY2F0ZScgfTtcblx0XHRjb25zdCB3b3Jrc3BhY2VCID0geyAuLi5jcmVhdGVMb2NhbCgnZHVwbGljYXRlJywgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpLCBpZDogJ3dvcmtzcGFjZS9iL2R1cGxpY2F0ZScgfTtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGdhbGxlcnlTZXJ2aWNlLCBhbGxvd2VkTWNwU2VydmVyc0VtaXR0ZXIgfSA9IGF3YWl0IGNyZWF0ZUZpeHR1cmUoW3VzZXIsIHdvcmtzcGFjZUEsIHdvcmtzcGFjZUJdLCBNY3BBY2Nlc3NWYWx1ZS5BbGwpO1xuXHRcdGF3YWl0IGNvbXBsZXRlKGF3YWl0IGdhbGxlcnlTZXJ2aWNlLm5leHRSZXF1ZXN0KCksIG5ldyBNYXAoW1xuXHRcdFx0W3VzZXIubmFtZSwgbm90Rm91bmQoKV0sXG5cdFx0XSkpO1xuXG5cdFx0Y29uc3Qgb3JkZXJCZWZvcmUgPSBzZXJ2aWNlLmxvY2FsLm1hcChzZXJ2ZXIgPT4gc2VydmVyLmlkKTtcblx0XHRjb25zdCB3aW5uZXJCZWZvcmUgPSBzZXJ2aWNlLmdldEVuYWJsZWRMb2NhbE1jcFNlcnZlcnMoKS5tYXAoc2VydmVyID0+IHNlcnZlci5pZCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7XG5cdFx0XHRhbGxvd2VkTWNwU2VydmVyc0VtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmxvY2FsLm1hcChzZXJ2ZXIgPT4gc2VydmVyLmlkKSwgb3JkZXJCZWZvcmUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVuYWJsZWRMb2NhbE1jcFNlcnZlcnMoKS5tYXAoc2VydmVyID0+IHNlcnZlci5pZCksIHdpbm5lckJlZm9yZSk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxrQkFBbUM7QUFDNUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsTUFBTSxxQkFBcUI7QUFDcEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHdCQUF3QiwyQkFBOEUsb0JBQTJELGdCQUFnQix5QkFBeUIsaUJBQWlCLHFCQUFxQjtBQUN6UCxTQUE4Qiw0QkFBNEIsZ0NBQWdDO0FBQzFGLFNBQWtDLHFCQUFxQjtBQUN2RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFtQyxnQ0FBa0UsMkJBQTJCO0FBQ2hJLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CO0FBTzVCLE1BQU0sOEJBQThCLEtBQXlCLEVBQUU7QUFBQSxFQVc5RCxZ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
