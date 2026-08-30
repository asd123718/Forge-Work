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
import { groupBy } from "../../../../base/common/arrays.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { isDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { getTestingConfiguration, TestingConfigKeys } from "./configuration.js";
import { MainThreadTestCollection } from "./mainThreadTestCollection.js";
import { MutableObservableValue } from "./observableValue.js";
import { StoredValue } from "./storedValue.js";
import { TestExclusions } from "./testExclusions.js";
import { TestId } from "./testId.js";
import { TestingContextKeys } from "./testingContextKeys.js";
import { canUseProfileWithTest, ITestProfileService } from "./testProfileService.js";
import { ITestResultService } from "./testResultService.js";
import { TestControllerCapability, TestDiffOpType } from "./testTypes.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
let TestService = class extends Disposable {
  constructor(contextKeyService, instantiationService, uriIdentityService, storage, editorService, testProfiles, notificationService, configurationService, testResults, workspaceTrustRequestService) {
    super();
    this.editorService = editorService;
    this.testProfiles = testProfiles;
    this.notificationService = notificationService;
    this.configurationService = configurationService;
    this.testResults = testResults;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.testControllers = observableValue("testControllers", /* @__PURE__ */ new Map());
    this.testExtHosts = /* @__PURE__ */ new Set();
    this.cancelExtensionTestRunEmitter = this._register(new Emitter());
    this.willProcessDiffEmitter = this._register(new Emitter());
    this.didProcessDiffEmitter = this._register(new Emitter());
    this.testRefreshCancellations = /* @__PURE__ */ new Set();
    /**
     * Cancellation for runs requested by the user being managed by the UI.
     * Test runs initiated by extensions are not included here.
     */
    this.uiRunningTests = /* @__PURE__ */ new Map();
    /**
     * @inheritdoc
     */
    this.onWillProcessDiff = this.willProcessDiffEmitter.event;
    /**
     * @inheritdoc
     */
    this.onDidProcessDiff = this.didProcessDiffEmitter.event;
    /**
     * @inheritdoc
     */
    this.onDidCancelTestRun = this.cancelExtensionTestRunEmitter.event;
    this.collection = new MainThreadTestCollection(uriIdentityService, this.expandTest.bind(this));
    this.showInlineOutput = this._register(MutableObservableValue.stored(new StoredValue({
      key: "inlineTestOutputVisible",
      scope: StorageScope.WORKSPACE,
      target: StorageTarget.USER
    }, storage), true));
    this.excluded = instantiationService.createInstance(TestExclusions);
    this.isRefreshingTests = TestingContextKeys.isRefreshingTests.bindTo(contextKeyService);
    this.activeEditorHasTests = TestingContextKeys.activeEditorHasTests.bindTo(contextKeyService);
    this._register(bindContextKey(
      TestingContextKeys.providerCount,
      contextKeyService,
      (reader) => this.testControllers.read(reader).size
    ));
    const bindCapability = (key, capability) => this._register(bindContextKey(
      key,
      contextKeyService,
      (reader) => Iterable.some(
        this.testControllers.read(reader).values(),
        (ctrl) => !!(ctrl.capabilities.read(reader) & capability)
      )
    ));
    bindCapability(TestingContextKeys.canRefreshTests, TestControllerCapability.Refresh);
    bindCapability(TestingContextKeys.canGoToRelatedCode, TestControllerCapability.CodeRelatedToTest);
    bindCapability(TestingContextKeys.canGoToRelatedTest, TestControllerCapability.TestRelatedToCode);
    this._register(editorService.onDidActiveEditorChange(() => this.updateEditorContextKeys()));
  }
  /**
   * @inheritdoc
   */
  async expandTest(id, levels) {
    await this.testControllers.get().get(TestId.fromString(id).controllerId)?.expandTest(id, levels);
  }
  /**
   * @inheritdoc
   */
  cancelTestRun(runId, taskId) {
    this.cancelExtensionTestRunEmitter.fire({ runId, taskId });
    if (runId === void 0) {
      for (const runCts of this.uiRunningTests.values()) {
        runCts.cancel();
      }
    } else if (!taskId) {
      this.uiRunningTests.get(runId)?.cancel();
    }
  }
  /**
   * @inheritdoc
   */
  async runTests(req, token = CancellationToken.None) {
    const byProfile = [];
    for (const test of req.tests) {
      const existing = byProfile.find((p) => canUseProfileWithTest(p.profile, test));
      if (existing) {
        existing.tests.push(test);
        continue;
      }
      const bestProfile = this.testProfiles.getDefaultProfileForTest(req.group, test);
      if (!bestProfile) {
        continue;
      }
      byProfile.push({ profile: bestProfile, tests: [test] });
    }
    const resolved = {
      targets: byProfile.map(({ profile, tests }) => ({
        profileId: profile.profileId,
        controllerId: tests[0].controllerId,
        testIds: tests.map((t) => t.item.extId)
      })),
      group: req.group,
      exclude: req.exclude?.map((t) => t.item.extId),
      continuous: req.continuous,
      preserveFocus: req.preserveFocus
    };
    if (resolved.targets.length === 0) {
      for (const byController of groupBy(req.tests, (a, b) => a.controllerId === b.controllerId ? 0 : 1)) {
        const profiles = this.testProfiles.getControllerProfiles(byController[0].controllerId);
        const withControllers = byController.map((test) => ({
          profile: profiles.find((p) => p.group === req.group && canUseProfileWithTest(p, test)),
          test
        }));
        for (const byProfile2 of groupBy(withControllers, (a, b) => a.profile === b.profile ? 0 : 1)) {
          const profile = byProfile2[0].profile;
          if (profile) {
            resolved.targets.push({
              testIds: byProfile2.map((t) => t.test.item.extId),
              profileId: profile.profileId,
              controllerId: profile.controllerId
            });
          }
        }
      }
    }
    return this.runResolvedTests(resolved, token);
  }
  /** @inheritdoc */
  async startContinuousRun(req, token) {
    if (!req.exclude) {
      req.exclude = [...this.excluded.all];
    }
    const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({
      message: localize("testTrust", "Running tests may execute code in your workspace.")
    });
    if (!trust) {
      return;
    }
    const byController = groupBy(req.targets, (a, b) => a.controllerId.localeCompare(b.controllerId));
    const requests = byController.map(
      (group) => this.getTestController(group[0].controllerId)?.startContinuousRun(
        group.map((controlReq) => ({
          excludeExtIds: req.exclude.filter((t) => !controlReq.testIds.includes(t)),
          profileId: controlReq.profileId,
          controllerId: controlReq.controllerId,
          testIds: controlReq.testIds
        })),
        token
      ).then((result) => {
        const errs = result.map((r) => r.error).filter(isDefined);
        if (errs.length) {
          this.notificationService.error(localize("testError", "An error occurred attempting to run tests: {0}", errs.join(" ")));
        }
      })
    );
    await Promise.all(requests);
  }
  /**
   * @inheritdoc
   */
  async runResolvedTests(req, token = CancellationToken.None) {
    if (!req.exclude) {
      req.exclude = [...this.excluded.all];
    }
    const result = this.testResults.createLiveResult(req);
    const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({
      message: localize("testTrust", "Running tests may execute code in your workspace.")
    });
    if (!trust) {
      result.markComplete();
      return result;
    }
    try {
      const cancelSource = new CancellationTokenSource(token);
      this.uiRunningTests.set(result.id, cancelSource);
      const byController = groupBy(req.targets, (a, b) => a.controllerId.localeCompare(b.controllerId));
      const requests = byController.map(
        (group) => this.getTestController(group[0].controllerId)?.runTests(
          group.map((controlReq) => ({
            runId: result.id,
            excludeExtIds: req.exclude.filter((t) => !controlReq.testIds.includes(t)),
            profileId: controlReq.profileId,
            controllerId: controlReq.controllerId,
            testIds: controlReq.testIds
          })),
          cancelSource.token
        ).then((result2) => {
          const errs = result2.map((r) => r.error).filter(isDefined);
          if (errs.length) {
            this.notificationService.error(localize("testError", "An error occurred attempting to run tests: {0}", errs.join(" ")));
          }
        })
      );
      await this.saveAllBeforeTest(req);
      await Promise.all(requests);
      return result;
    } finally {
      this.uiRunningTests.delete(result.id);
      result.markComplete();
    }
  }
  /**
   * @inheritdoc
   */
  async provideTestFollowups(req, token) {
    const reqs = await Promise.all([...this.testExtHosts].map(async (ctrl) => ({ ctrl, followups: await ctrl.provideTestFollowups(req, token) })));
    const followups = {
      followups: reqs.flatMap(({ ctrl, followups: followups2 }) => followups2.map((f) => ({
        message: f.title,
        execute: () => ctrl.executeTestFollowup(f.id)
      }))),
      dispose: () => {
        for (const { ctrl, followups: followups2 } of reqs) {
          ctrl.disposeTestFollowups(followups2.map((f) => f.id));
        }
      }
    };
    if (token.isCancellationRequested) {
      followups.dispose();
    }
    return followups;
  }
  /**
   * @inheritdoc
   */
  publishDiff(_controllerId, diff) {
    this.willProcessDiffEmitter.fire(diff);
    this.collection.apply(diff);
    this.updateEditorContextKeys();
    this.didProcessDiffEmitter.fire(diff);
  }
  /**
   * @inheritdoc
   */
  getTestController(id) {
    return this.testControllers.get().get(id);
  }
  /**
   * @inheritdoc
   */
  async syncTests() {
    const cts = new CancellationTokenSource();
    try {
      await Promise.all([...this.testControllers.get().values()].map((c) => c.syncTests(cts.token)));
    } finally {
      cts.dispose(true);
    }
  }
  /**
   * @inheritdoc
   */
  async refreshTests(controllerId) {
    const cts = new CancellationTokenSource();
    this.testRefreshCancellations.add(cts);
    this.isRefreshingTests.set(true);
    try {
      if (controllerId) {
        await this.getTestController(controllerId)?.refreshTests(cts.token);
      } else {
        await Promise.all([...this.testControllers.get().values()].map((c) => c.refreshTests(cts.token)));
      }
    } finally {
      this.testRefreshCancellations.delete(cts);
      this.isRefreshingTests.set(this.testRefreshCancellations.size > 0);
      cts.dispose(true);
    }
  }
  /**
   * @inheritdoc
   */
  cancelRefreshTests() {
    for (const cts of this.testRefreshCancellations) {
      cts.cancel();
    }
    this.testRefreshCancellations.clear();
    this.isRefreshingTests.set(false);
  }
  /**
   * @inheritdoc
   */
  registerExtHost(controller) {
    this.testExtHosts.add(controller);
    return toDisposable(() => this.testExtHosts.delete(controller));
  }
  /**
   * @inheritdoc
   */
  async getTestsRelatedToCode(uri, position, token = CancellationToken.None) {
    const testIds = await Promise.all([...this.testExtHosts.values()].map((v) => v.getTestsRelatedToCode(uri, position, token)));
    return testIds.flatMap((ids) => ids.map((id) => this.collection.getNodeById(id))).filter(isDefined);
  }
  /**
   * @inheritdoc
   */
  registerTestController(id, controller) {
    this.testControllers.set(new Map(this.testControllers.get()).set(id, controller), void 0);
    return toDisposable(() => {
      const diff = [];
      for (const root of this.collection.rootItems) {
        if (root.controllerId === id) {
          diff.push({ op: TestDiffOpType.Remove, itemId: root.item.extId });
        }
      }
      this.publishDiff(id, diff);
      const next = new Map(this.testControllers.get());
      next.delete(id);
      this.testControllers.set(next, void 0);
    });
  }
  /**
   * @inheritdoc
   */
  async getCodeRelatedToTest(test, token = CancellationToken.None) {
    return await this.testControllers.get().get(test.controllerId)?.getRelatedCode(test.item.extId, token) || [];
  }
  updateEditorContextKeys() {
    const uri = this.editorService.activeEditor?.resource;
    if (uri) {
      this.activeEditorHasTests.set(!Iterable.isEmpty(this.collection.getNodeByUrl(uri)));
    } else {
      this.activeEditorHasTests.set(false);
    }
  }
  async saveAllBeforeTest(req, configurationService = this.configurationService, editorService = this.editorService) {
    if (req.preserveFocus === true) {
      return;
    }
    const saveBeforeTest = getTestingConfiguration(this.configurationService, TestingConfigKeys.SaveBeforeTest);
    if (saveBeforeTest) {
      await editorService.saveAll();
    }
    return;
  }
};
TestService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, ITestProfileService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ITestResultService),
  __decorateParam(9, IWorkspaceTrustRequestService)
], TestService);
export {
  TestService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcdGVzdFNlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ3JvdXBCeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGJpbmRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IGdldFRlc3RpbmdDb25maWd1cmF0aW9uLCBUZXN0aW5nQ29uZmlnS2V5cyB9IGZyb20gJy4vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkVGVzdENvbGxlY3Rpb24gfSBmcm9tICcuL21haW5UaHJlYWRUZXN0Q29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlT2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi9vYnNlcnZhYmxlVmFsdWUuanMnO1xuaW1wb3J0IHsgU3RvcmVkVmFsdWUgfSBmcm9tICcuL3N0b3JlZFZhbHVlLmpzJztcbmltcG9ydCB7IFRlc3RFeGNsdXNpb25zIH0gZnJvbSAnLi90ZXN0RXhjbHVzaW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nQ29udGV4dEtleXMgfSBmcm9tICcuL3Rlc3RpbmdDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBjYW5Vc2VQcm9maWxlV2l0aFRlc3QsIElUZXN0UHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuL3Rlc3RQcm9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdCB9IGZyb20gJy4vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFNlcnZpY2UgfSBmcm9tICcuL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFtYmlndW91c1J1blRlc3RzUmVxdWVzdCwgSU1haW5UaHJlYWRUZXN0Q29udHJvbGxlciwgSU1haW5UaHJlYWRUZXN0SG9zdFByb3h5LCBJVGVzdEZvbGxvd3VwcywgSVRlc3RTZXJ2aWNlIH0gZnJvbSAnLi90ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnRlcm5hbFRlc3RJdGVtLCBJVGVzdFJ1blByb2ZpbGUsIFJlc29sdmVkVGVzdFJ1blJlcXVlc3QsIFRlc3RDb250cm9sbGVyQ2FwYWJpbGl0eSwgVGVzdERpZmZPcFR5cGUsIFRlc3RNZXNzYWdlRm9sbG93dXBSZXF1ZXN0LCBUZXN0c0RpZmYgfSBmcm9tICcuL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXN0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVzdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0ZXN0Q29udHJvbGxlcnMgPSBvYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlNYXA8c3RyaW5nLCBJTWFpblRocmVhZFRlc3RDb250cm9sbGVyPj4oJ3Rlc3RDb250cm9sbGVycycsIG5ldyBNYXA8c3RyaW5nLCBJTWFpblRocmVhZFRlc3RDb250cm9sbGVyPigpKTtcblx0cHJpdmF0ZSB0ZXN0RXh0SG9zdHMgPSBuZXcgU2V0PElNYWluVGhyZWFkVGVzdEhvc3RQcm94eT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNhbmNlbEV4dGVuc2lvblRlc3RSdW5FbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBydW5JZDogc3RyaW5nIHwgdW5kZWZpbmVkOyB0YXNrSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSB3aWxsUHJvY2Vzc0RpZmZFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGVzdHNEaWZmPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBkaWRQcm9jZXNzRGlmZkVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUZXN0c0RpZmY+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRlc3RSZWZyZXNoQ2FuY2VsbGF0aW9ucyA9IG5ldyBTZXQ8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgaXNSZWZyZXNoaW5nVGVzdHM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZUVkaXRvckhhc1Rlc3RzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHQvKipcblx0ICogQ2FuY2VsbGF0aW9uIGZvciBydW5zIHJlcXVlc3RlZCBieSB0aGUgdXNlciBiZWluZyBtYW5hZ2VkIGJ5IHRoZSBVSS5cblx0ICogVGVzdCBydW5zIGluaXRpYXRlZCBieSBleHRlbnNpb25zIGFyZSBub3QgaW5jbHVkZWQgaGVyZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgdWlSdW5uaW5nVGVzdHMgPSBuZXcgTWFwPHN0cmluZyAvKiBydW4gSUQgKi8sIENhbmNlbGxhdGlvblRva2VuU291cmNlPigpO1xuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbFByb2Nlc3NEaWZmID0gdGhpcy53aWxsUHJvY2Vzc0RpZmZFbWl0dGVyLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUHJvY2Vzc0RpZmYgPSB0aGlzLmRpZFByb2Nlc3NEaWZmRW1pdHRlci5ldmVudDtcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENhbmNlbFRlc3RSdW4gPSB0aGlzLmNhbmNlbEV4dGVuc2lvblRlc3RSdW5FbWl0dGVyLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IGNvbGxlY3Rpb246IE1haW5UaHJlYWRUZXN0Q29sbGVjdGlvbjtcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBleGNsdWRlZDogVGVzdEV4Y2x1c2lvbnM7XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgc2hvd0lubGluZU91dHB1dDogTXV0YWJsZU9ic2VydmFibGVWYWx1ZTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVRlc3RQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RQcm9maWxlczogSVRlc3RQcm9maWxlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlc3RSZXN1bHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFJlc3VsdHM6IElUZXN0UmVzdWx0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmNvbGxlY3Rpb24gPSBuZXcgTWFpblRocmVhZFRlc3RDb2xsZWN0aW9uKHVyaUlkZW50aXR5U2VydmljZSwgdGhpcy5leHBhbmRUZXN0LmJpbmQodGhpcykpO1xuXHRcdHRoaXMuc2hvd0lubGluZU91dHB1dCA9IHRoaXMuX3JlZ2lzdGVyKE11dGFibGVPYnNlcnZhYmxlVmFsdWUuc3RvcmVkKG5ldyBTdG9yZWRWYWx1ZTxib29sZWFuPih7XG5cdFx0XHRrZXk6ICdpbmxpbmVUZXN0T3V0cHV0VmlzaWJsZScsXG5cdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLldPUktTUEFDRSxcblx0XHRcdHRhcmdldDogU3RvcmFnZVRhcmdldC5VU0VSXG5cdFx0fSwgc3RvcmFnZSksIHRydWUpKTtcblxuXHRcdHRoaXMuZXhjbHVkZWQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0RXhjbHVzaW9ucyk7XG5cdFx0dGhpcy5pc1JlZnJlc2hpbmdUZXN0cyA9IFRlc3RpbmdDb250ZXh0S2V5cy5pc1JlZnJlc2hpbmdUZXN0cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuYWN0aXZlRWRpdG9ySGFzVGVzdHMgPSBUZXN0aW5nQ29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzVGVzdHMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KFRlc3RpbmdDb250ZXh0S2V5cy5wcm92aWRlckNvdW50LCBjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHJlYWRlciA9PiB0aGlzLnRlc3RDb250cm9sbGVycy5yZWFkKHJlYWRlcikuc2l6ZSkpO1xuXG5cdFx0Y29uc3QgYmluZENhcGFiaWxpdHkgPSAoa2V5OiBSYXdDb250ZXh0S2V5PGJvb2xlYW4+LCBjYXBhYmlsaXR5OiBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHkpID0+XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShrZXksIGNvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT5cblx0XHRcdFx0SXRlcmFibGUuc29tZShcblx0XHRcdFx0XHR0aGlzLnRlc3RDb250cm9sbGVycy5yZWFkKHJlYWRlcikudmFsdWVzKCksXG5cdFx0XHRcdFx0Y3RybCA9PiAhIShjdHJsLmNhcGFiaWxpdGllcy5yZWFkKHJlYWRlcikgJiBjYXBhYmlsaXR5KVxuXHRcdFx0XHQpLFxuXHRcdFx0KSk7XG5cblx0XHRiaW5kQ2FwYWJpbGl0eShUZXN0aW5nQ29udGV4dEtleXMuY2FuUmVmcmVzaFRlc3RzLCBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHkuUmVmcmVzaCk7XG5cdFx0YmluZENhcGFiaWxpdHkoVGVzdGluZ0NvbnRleHRLZXlzLmNhbkdvVG9SZWxhdGVkQ29kZSwgVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5LkNvZGVSZWxhdGVkVG9UZXN0KTtcblx0XHRiaW5kQ2FwYWJpbGl0eShUZXN0aW5nQ29udGV4dEtleXMuY2FuR29Ub1JlbGF0ZWRUZXN0LCBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHkuVGVzdFJlbGF0ZWRUb0NvZGUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZUVkaXRvckNvbnRleHRLZXlzKCkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGFzeW5jIGV4cGFuZFRlc3QoaWQ6IHN0cmluZywgbGV2ZWxzOiBudW1iZXIpIHtcblx0XHRhd2FpdCB0aGlzLnRlc3RDb250cm9sbGVycy5nZXQoKS5nZXQoVGVzdElkLmZyb21TdHJpbmcoaWQpLmNvbnRyb2xsZXJJZCk/LmV4cGFuZFRlc3QoaWQsIGxldmVscyk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBjYW5jZWxUZXN0UnVuKHJ1bklkPzogc3RyaW5nLCB0YXNrSWQ/OiBzdHJpbmcpIHtcblx0XHR0aGlzLmNhbmNlbEV4dGVuc2lvblRlc3RSdW5FbWl0dGVyLmZpcmUoeyBydW5JZCwgdGFza0lkIH0pO1xuXG5cdFx0aWYgKHJ1bklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGZvciAoY29uc3QgcnVuQ3RzIG9mIHRoaXMudWlSdW5uaW5nVGVzdHMudmFsdWVzKCkpIHtcblx0XHRcdFx0cnVuQ3RzLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIXRhc2tJZCkge1xuXHRcdFx0dGhpcy51aVJ1bm5pbmdUZXN0cy5nZXQocnVuSWQpPy5jYW5jZWwoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhc3luYyBydW5UZXN0cyhyZXE6IEFtYmlndW91c1J1blRlc3RzUmVxdWVzdCwgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJVGVzdFJlc3VsdD4ge1xuXHRcdC8vIFdlIHRyeSB0byBlbnN1cmUgdGhhdCBhbGwgdGVzdHMgaW4gdGhlIHJlcXVlc3Qgd2lsbCBiZSBydW4sIHByZWZlcnJpbmdcblx0XHQvLyB0byB1c2UgZGVmYXVsdCBwcm9maWxlcyBmb3IgZWFjaCBjb250cm9sbGVyIHdoZW4gcG9zc2libGUuXG5cdFx0Y29uc3QgYnlQcm9maWxlOiB7IHByb2ZpbGU6IElUZXN0UnVuUHJvZmlsZTsgdGVzdHM6IEludGVybmFsVGVzdEl0ZW1bXSB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgcmVxLnRlc3RzKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGJ5UHJvZmlsZS5maW5kKHAgPT4gY2FuVXNlUHJvZmlsZVdpdGhUZXN0KHAucHJvZmlsZSwgdGVzdCkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGV4aXN0aW5nLnRlc3RzLnB1c2godGVzdCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBiZXN0UHJvZmlsZSA9IHRoaXMudGVzdFByb2ZpbGVzLmdldERlZmF1bHRQcm9maWxlRm9yVGVzdChyZXEuZ3JvdXAsIHRlc3QpO1xuXHRcdFx0aWYgKCFiZXN0UHJvZmlsZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0YnlQcm9maWxlLnB1c2goeyBwcm9maWxlOiBiZXN0UHJvZmlsZSwgdGVzdHM6IFt0ZXN0XSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZDogUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdCA9IHtcblx0XHRcdHRhcmdldHM6IGJ5UHJvZmlsZS5tYXAoKHsgcHJvZmlsZSwgdGVzdHMgfSkgPT4gKHtcblx0XHRcdFx0cHJvZmlsZUlkOiBwcm9maWxlLnByb2ZpbGVJZCxcblx0XHRcdFx0Y29udHJvbGxlcklkOiB0ZXN0c1swXS5jb250cm9sbGVySWQsXG5cdFx0XHRcdHRlc3RJZHM6IHRlc3RzLm1hcCh0ID0+IHQuaXRlbS5leHRJZCksXG5cdFx0XHR9KSksXG5cdFx0XHRncm91cDogcmVxLmdyb3VwLFxuXHRcdFx0ZXhjbHVkZTogcmVxLmV4Y2x1ZGU/Lm1hcCh0ID0+IHQuaXRlbS5leHRJZCksXG5cdFx0XHRjb250aW51b3VzOiByZXEuY29udGludW91cyxcblx0XHRcdHByZXNlcnZlRm9jdXM6IHJlcS5wcmVzZXJ2ZUZvY3VzLFxuXHRcdH07XG5cblx0XHQvLyBJZiBubyB0ZXN0cyBhcmUgY292ZXJlZCBieSB0aGUgZGVmYXVsdHMsIGp1c3QgdXNlIHdoYXRldmVyIHRoZSBkZWZhdWx0c1xuXHRcdC8vIGZvciB0aGVpciBjb250cm9sbGVyIGFyZS4gVGhpcyBjYW4gaGFwcGVuIGlmIHRoZSB1c2VyIGNob3NlIHNwZWNpZmljXG5cdFx0Ly8gcHJvZmlsZXMgZm9yIHRoZSBydW4gYnV0dG9uLCBidXQgdGhlbiBhc2tlZCB0byBydW4gYSBzaW5nbGUgdGVzdCBmcm9tIHRoZVxuXHRcdC8vIGV4cGxvcmVyIG9yIGRlY29yYXRpb24uIFdlIHNob3VsZG4ndCBuby1vcC5cblx0XHRpZiAocmVzb2x2ZWQudGFyZ2V0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdGZvciAoY29uc3QgYnlDb250cm9sbGVyIG9mIGdyb3VwQnkocmVxLnRlc3RzLCAoYSwgYikgPT4gYS5jb250cm9sbGVySWQgPT09IGIuY29udHJvbGxlcklkID8gMCA6IDEpKSB7XG5cdFx0XHRcdGNvbnN0IHByb2ZpbGVzID0gdGhpcy50ZXN0UHJvZmlsZXMuZ2V0Q29udHJvbGxlclByb2ZpbGVzKGJ5Q29udHJvbGxlclswXS5jb250cm9sbGVySWQpO1xuXHRcdFx0XHRjb25zdCB3aXRoQ29udHJvbGxlcnMgPSBieUNvbnRyb2xsZXIubWFwKHRlc3QgPT4gKHtcblx0XHRcdFx0XHRwcm9maWxlOiBwcm9maWxlcy5maW5kKHAgPT4gcC5ncm91cCA9PT0gcmVxLmdyb3VwICYmIGNhblVzZVByb2ZpbGVXaXRoVGVzdChwLCB0ZXN0KSksXG5cdFx0XHRcdFx0dGVzdCxcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgYnlQcm9maWxlIG9mIGdyb3VwQnkod2l0aENvbnRyb2xsZXJzLCAoYSwgYikgPT4gYS5wcm9maWxlID09PSBiLnByb2ZpbGUgPyAwIDogMSkpIHtcblx0XHRcdFx0XHRjb25zdCBwcm9maWxlID0gYnlQcm9maWxlWzBdLnByb2ZpbGU7XG5cdFx0XHRcdFx0aWYgKHByb2ZpbGUpIHtcblx0XHRcdFx0XHRcdHJlc29sdmVkLnRhcmdldHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHRlc3RJZHM6IGJ5UHJvZmlsZS5tYXAodCA9PiB0LnRlc3QuaXRlbS5leHRJZCksXG5cdFx0XHRcdFx0XHRcdHByb2ZpbGVJZDogcHJvZmlsZS5wcm9maWxlSWQsXG5cdFx0XHRcdFx0XHRcdGNvbnRyb2xsZXJJZDogcHJvZmlsZS5jb250cm9sbGVySWQsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5ydW5SZXNvbHZlZFRlc3RzKHJlc29sdmVkLCB0b2tlbik7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGFzeW5jIHN0YXJ0Q29udGludW91c1J1bihyZXE6IFJlc29sdmVkVGVzdFJ1blJlcXVlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGlmICghcmVxLmV4Y2x1ZGUpIHtcblx0XHRcdHJlcS5leGNsdWRlID0gWy4uLnRoaXMuZXhjbHVkZWQuYWxsXTtcblx0XHR9XG5cblx0XHRjb25zdCB0cnVzdCA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3Qoe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Rlc3RUcnVzdCcsIFwiUnVubmluZyB0ZXN0cyBtYXkgZXhlY3V0ZSBjb2RlIGluIHlvdXIgd29ya3NwYWNlLlwiKSxcblx0XHR9KTtcblxuXHRcdGlmICghdHJ1c3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBieUNvbnRyb2xsZXIgPSBncm91cEJ5KHJlcS50YXJnZXRzLCAoYSwgYikgPT4gYS5jb250cm9sbGVySWQubG9jYWxlQ29tcGFyZShiLmNvbnRyb2xsZXJJZCkpO1xuXHRcdGNvbnN0IHJlcXVlc3RzID0gYnlDb250cm9sbGVyLm1hcChcblx0XHRcdGdyb3VwID0+IHRoaXMuZ2V0VGVzdENvbnRyb2xsZXIoZ3JvdXBbMF0uY29udHJvbGxlcklkKT8uc3RhcnRDb250aW51b3VzUnVuKFxuXHRcdFx0XHRncm91cC5tYXAoY29udHJvbFJlcSA9PiAoe1xuXHRcdFx0XHRcdGV4Y2x1ZGVFeHRJZHM6IHJlcS5leGNsdWRlIS5maWx0ZXIodCA9PiAhY29udHJvbFJlcS50ZXN0SWRzLmluY2x1ZGVzKHQpKSxcblx0XHRcdFx0XHRwcm9maWxlSWQ6IGNvbnRyb2xSZXEucHJvZmlsZUlkLFxuXHRcdFx0XHRcdGNvbnRyb2xsZXJJZDogY29udHJvbFJlcS5jb250cm9sbGVySWQsXG5cdFx0XHRcdFx0dGVzdElkczogY29udHJvbFJlcS50ZXN0SWRzLFxuXHRcdFx0XHR9KSksXG5cdFx0XHRcdHRva2VuLFxuXHRcdFx0KS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdGNvbnN0IGVycnMgPSByZXN1bHQubWFwKHIgPT4gci5lcnJvcikuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdFx0XHRcdGlmIChlcnJzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgndGVzdEVycm9yJywgJ0FuIGVycm9yIG9jY3VycmVkIGF0dGVtcHRpbmcgdG8gcnVuIHRlc3RzOiB7MH0nLCBlcnJzLmpvaW4oJyAnKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChyZXF1ZXN0cyk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhc3luYyBydW5SZXNvbHZlZFRlc3RzKHJlcTogUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdCwgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSB7XG5cdFx0aWYgKCFyZXEuZXhjbHVkZSkge1xuXHRcdFx0cmVxLmV4Y2x1ZGUgPSBbLi4udGhpcy5leGNsdWRlZC5hbGxdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMudGVzdFJlc3VsdHMuY3JlYXRlTGl2ZVJlc3VsdChyZXEpO1xuXHRcdGNvbnN0IHRydXN0ID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RXb3Jrc3BhY2VUcnVzdCh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndGVzdFRydXN0JywgXCJSdW5uaW5nIHRlc3RzIG1heSBleGVjdXRlIGNvZGUgaW4geW91ciB3b3Jrc3BhY2UuXCIpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCF0cnVzdCkge1xuXHRcdFx0cmVzdWx0Lm1hcmtDb21wbGV0ZSgpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2FuY2VsU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRcdHRoaXMudWlSdW5uaW5nVGVzdHMuc2V0KHJlc3VsdC5pZCwgY2FuY2VsU291cmNlKTtcblxuXHRcdFx0Y29uc3QgYnlDb250cm9sbGVyID0gZ3JvdXBCeShyZXEudGFyZ2V0cywgKGEsIGIpID0+IGEuY29udHJvbGxlcklkLmxvY2FsZUNvbXBhcmUoYi5jb250cm9sbGVySWQpKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RzID0gYnlDb250cm9sbGVyLm1hcChcblx0XHRcdFx0Z3JvdXAgPT4gdGhpcy5nZXRUZXN0Q29udHJvbGxlcihncm91cFswXS5jb250cm9sbGVySWQpPy5ydW5UZXN0cyhcblx0XHRcdFx0XHRncm91cC5tYXAoY29udHJvbFJlcSA9PiAoe1xuXHRcdFx0XHRcdFx0cnVuSWQ6IHJlc3VsdC5pZCxcblx0XHRcdFx0XHRcdGV4Y2x1ZGVFeHRJZHM6IHJlcS5leGNsdWRlIS5maWx0ZXIodCA9PiAhY29udHJvbFJlcS50ZXN0SWRzLmluY2x1ZGVzKHQpKSxcblx0XHRcdFx0XHRcdHByb2ZpbGVJZDogY29udHJvbFJlcS5wcm9maWxlSWQsXG5cdFx0XHRcdFx0XHRjb250cm9sbGVySWQ6IGNvbnRyb2xSZXEuY29udHJvbGxlcklkLFxuXHRcdFx0XHRcdFx0dGVzdElkczogY29udHJvbFJlcS50ZXN0SWRzLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRjYW5jZWxTb3VyY2UudG9rZW4sXG5cdFx0XHRcdCkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGVycnMgPSByZXN1bHQubWFwKHIgPT4gci5lcnJvcikuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdFx0XHRcdFx0aWYgKGVycnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3Rlc3RFcnJvcicsICdBbiBlcnJvciBvY2N1cnJlZCBhdHRlbXB0aW5nIHRvIHJ1biB0ZXN0czogezB9JywgZXJycy5qb2luKCcgJykpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHRcdFx0YXdhaXQgdGhpcy5zYXZlQWxsQmVmb3JlVGVzdChyZXEpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocmVxdWVzdHMpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy51aVJ1bm5pbmdUZXN0cy5kZWxldGUocmVzdWx0LmlkKTtcblx0XHRcdHJlc3VsdC5tYXJrQ29tcGxldGUoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhc3luYyBwcm92aWRlVGVzdEZvbGxvd3VwcyhyZXE6IFRlc3RNZXNzYWdlRm9sbG93dXBSZXF1ZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUZXN0Rm9sbG93dXBzPiB7XG5cdFx0Y29uc3QgcmVxcyA9IGF3YWl0IFByb21pc2UuYWxsKFsuLi50aGlzLnRlc3RFeHRIb3N0c10ubWFwKGFzeW5jIGN0cmwgPT5cblx0XHRcdCh7IGN0cmwsIGZvbGxvd3VwczogYXdhaXQgY3RybC5wcm92aWRlVGVzdEZvbGxvd3VwcyhyZXEsIHRva2VuKSB9KSkpO1xuXG5cdFx0Y29uc3QgZm9sbG93dXBzOiBJVGVzdEZvbGxvd3VwcyA9IHtcblx0XHRcdGZvbGxvd3VwczogcmVxcy5mbGF0TWFwKCh7IGN0cmwsIGZvbGxvd3VwcyB9KSA9PiBmb2xsb3d1cHMubWFwKGYgPT4gKHtcblx0XHRcdFx0bWVzc2FnZTogZi50aXRsZSxcblx0XHRcdFx0ZXhlY3V0ZTogKCkgPT4gY3RybC5leGVjdXRlVGVzdEZvbGxvd3VwKGYuaWQpXG5cdFx0XHR9KSkpLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgY3RybCwgZm9sbG93dXBzIH0gb2YgcmVxcykge1xuXHRcdFx0XHRcdGN0cmwuZGlzcG9zZVRlc3RGb2xsb3d1cHMoZm9sbG93dXBzLm1hcChmID0+IGYuaWQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGZvbGxvd3Vwcy5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZvbGxvd3Vwcztcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHB1Ymxpc2hEaWZmKF9jb250cm9sbGVySWQ6IHN0cmluZywgZGlmZjogVGVzdHNEaWZmKSB7XG5cdFx0dGhpcy53aWxsUHJvY2Vzc0RpZmZFbWl0dGVyLmZpcmUoZGlmZik7XG5cdFx0dGhpcy5jb2xsZWN0aW9uLmFwcGx5KGRpZmYpO1xuXHRcdHRoaXMudXBkYXRlRWRpdG9yQ29udGV4dEtleXMoKTtcblx0XHR0aGlzLmRpZFByb2Nlc3NEaWZmRW1pdHRlci5maXJlKGRpZmYpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0VGVzdENvbnRyb2xsZXIoaWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLnRlc3RDb250cm9sbGVycy5nZXQoKS5nZXQoaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgc3luY1Rlc3RzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4udGhpcy50ZXN0Q29udHJvbGxlcnMuZ2V0KCkudmFsdWVzKCldLm1hcChjID0+IGMuc3luY1Rlc3RzKGN0cy50b2tlbikpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcmVmcmVzaFRlc3RzKGNvbnRyb2xsZXJJZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMudGVzdFJlZnJlc2hDYW5jZWxsYXRpb25zLmFkZChjdHMpO1xuXHRcdHRoaXMuaXNSZWZyZXNoaW5nVGVzdHMuc2V0KHRydWUpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChjb250cm9sbGVySWQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5nZXRUZXN0Q29udHJvbGxlcihjb250cm9sbGVySWQpPy5yZWZyZXNoVGVzdHMoY3RzLnRva2VuKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi50aGlzLnRlc3RDb250cm9sbGVycy5nZXQoKS52YWx1ZXMoKV0ubWFwKGMgPT4gYy5yZWZyZXNoVGVzdHMoY3RzLnRva2VuKSkpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnRlc3RSZWZyZXNoQ2FuY2VsbGF0aW9ucy5kZWxldGUoY3RzKTtcblx0XHRcdHRoaXMuaXNSZWZyZXNoaW5nVGVzdHMuc2V0KHRoaXMudGVzdFJlZnJlc2hDYW5jZWxsYXRpb25zLnNpemUgPiAwKTtcblx0XHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGNhbmNlbFJlZnJlc2hUZXN0cygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGN0cyBvZiB0aGlzLnRlc3RSZWZyZXNoQ2FuY2VsbGF0aW9ucykge1xuXHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdH1cblx0XHR0aGlzLnRlc3RSZWZyZXNoQ2FuY2VsbGF0aW9ucy5jbGVhcigpO1xuXHRcdHRoaXMuaXNSZWZyZXNoaW5nVGVzdHMuc2V0KGZhbHNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlZ2lzdGVyRXh0SG9zdChjb250cm9sbGVyOiBJTWFpblRocmVhZFRlc3RIb3N0UHJveHkpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy50ZXN0RXh0SG9zdHMuYWRkKGNvbnRyb2xsZXIpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy50ZXN0RXh0SG9zdHMuZGVsZXRlKGNvbnRyb2xsZXIpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGFzeW5jIGdldFRlc3RzUmVsYXRlZFRvQ29kZSh1cmk6IFVSSSwgcG9zaXRpb246IFBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJbnRlcm5hbFRlc3RJdGVtW10+IHtcblx0XHRjb25zdCB0ZXN0SWRzID0gYXdhaXQgUHJvbWlzZS5hbGwoWy4uLnRoaXMudGVzdEV4dEhvc3RzLnZhbHVlcygpXS5tYXAodiA9PiB2LmdldFRlc3RzUmVsYXRlZFRvQ29kZSh1cmksIHBvc2l0aW9uLCB0b2tlbikpKTtcblx0XHQvLyBleHQgaG9zdCB3aWxsIGZsdXNoIGRpZmZzIGJlZm9yZSByZXR1cm5pbmcsIHNvIHdlIHNob3VsZCBoYXZlIGV2ZXJ5dGhpbmcgaGVyZTpcblx0XHRyZXR1cm4gdGVzdElkcy5mbGF0TWFwKGlkcyA9PiBpZHMubWFwKGlkID0+IHRoaXMuY29sbGVjdGlvbi5nZXROb2RlQnlJZChpZCkpKS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlZ2lzdGVyVGVzdENvbnRyb2xsZXIoaWQ6IHN0cmluZywgY29udHJvbGxlcjogSU1haW5UaHJlYWRUZXN0Q29udHJvbGxlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLnRlc3RDb250cm9sbGVycy5zZXQobmV3IE1hcCh0aGlzLnRlc3RDb250cm9sbGVycy5nZXQoKSkuc2V0KGlkLCBjb250cm9sbGVyKSwgdW5kZWZpbmVkKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZjogVGVzdHNEaWZmID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHJvb3Qgb2YgdGhpcy5jb2xsZWN0aW9uLnJvb3RJdGVtcykge1xuXHRcdFx0XHRpZiAocm9vdC5jb250cm9sbGVySWQgPT09IGlkKSB7XG5cdFx0XHRcdFx0ZGlmZi5wdXNoKHsgb3A6IFRlc3REaWZmT3BUeXBlLlJlbW92ZSwgaXRlbUlkOiByb290Lml0ZW0uZXh0SWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5wdWJsaXNoRGlmZihpZCwgZGlmZik7XG5cblx0XHRcdGNvbnN0IG5leHQgPSBuZXcgTWFwKHRoaXMudGVzdENvbnRyb2xsZXJzLmdldCgpKTtcblx0XHRcdG5leHQuZGVsZXRlKGlkKTtcblx0XHRcdHRoaXMudGVzdENvbnRyb2xsZXJzLnNldChuZXh0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgZ2V0Q29kZVJlbGF0ZWRUb1Rlc3QodGVzdDogSW50ZXJuYWxUZXN0SXRlbSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8TG9jYXRpb25bXT4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy50ZXN0Q29udHJvbGxlcnMuZ2V0KCkuZ2V0KHRlc3QuY29udHJvbGxlcklkKT8uZ2V0UmVsYXRlZENvZGUodGVzdC5pdGVtLmV4dElkLCB0b2tlbikpIHx8IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFZGl0b3JDb250ZXh0S2V5cygpIHtcblx0XHRjb25zdCB1cmkgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yPy5yZXNvdXJjZTtcblx0XHRpZiAodXJpKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckhhc1Rlc3RzLnNldCghSXRlcmFibGUuaXNFbXB0eSh0aGlzLmNvbGxlY3Rpb24uZ2V0Tm9kZUJ5VXJsKHVyaSkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JIYXNUZXN0cy5zZXQoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2F2ZUFsbEJlZm9yZVRlc3QocmVxOiBSZXNvbHZlZFRlc3RSdW5SZXF1ZXN0LCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UgPSB0aGlzLmVkaXRvclNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocmVxLnByZXNlcnZlRm9jdXMgPT09IHRydWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2F2ZUJlZm9yZVRlc3QgPSBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5TYXZlQmVmb3JlVGVzdCk7XG5cdFx0aWYgKHNhdmVCZWZvcmVUZXN0KSB7XG5cdFx0XHRhd2FpdCBlZGl0b3JT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
