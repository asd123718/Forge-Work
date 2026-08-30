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
import { RunOnceScheduler } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { createSingleCallFunction } from "../../../base/common/functional.js";
import { hash } from "../../../base/common/hash.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { isDefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { TestCommandId } from "../../contrib/testing/common/constants.js";
import { TestId, TestPosition } from "../../contrib/testing/common/testId.js";
import { InvalidTestItemError } from "../../contrib/testing/common/testItemCollection.js";
import { AbstractIncrementalTestCollection, TestControllerCapability, TestResultState, TestsDiffOp, isStartControllerTests } from "../../contrib/testing/common/testTypes.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { MainContext } from "./extHost.protocol.js";
import { IExtHostCommands } from "./extHostCommands.js";
import { IExtHostDocumentsAndEditors } from "./extHostDocumentsAndEditors.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ExtHostTestItemCollection, TestItemImpl, TestItemRootImpl, toItemFromContext } from "./extHostTestItem.js";
import * as Convert from "./extHostTypeConverters.js";
import { FileCoverage, TestRunProfileBase, TestRunRequest } from "./extHostTypes.js";
let followupCounter = 0;
const testResultInternalIDs = /* @__PURE__ */ new WeakMap();
const IExtHostTesting = createDecorator("IExtHostTesting");
let ExtHostTesting = class extends Disposable {
  constructor(rpc, logService, commands, editors) {
    super();
    this.logService = logService;
    this.commands = commands;
    this.editors = editors;
    this.resultsChangedEmitter = this._register(new Emitter());
    this.controllers = /* @__PURE__ */ new Map();
    this.defaultProfilesChangedEmitter = this._register(new Emitter());
    this.followupProviders = /* @__PURE__ */ new Set();
    this.testFollowups = /* @__PURE__ */ new Map();
    this.onResultsChanged = this.resultsChangedEmitter.event;
    this.results = [];
    this.proxy = rpc.getProxy(MainContext.MainThreadTesting);
    this.observer = new TestObservers(this.proxy);
    this.runTracker = new TestRunCoordinator(this.proxy, logService);
    commands.registerArgumentProcessor({
      processArgument: (arg) => {
        switch (arg?.$mid) {
          case MarshalledId.TestItemContext: {
            const cast = arg;
            const targetTest = cast.tests[cast.tests.length - 1].item.extId;
            const controller = this.controllers.get(TestId.root(targetTest));
            return controller?.collection.tree.get(targetTest)?.actual ?? toItemFromContext(arg);
          }
          case MarshalledId.TestMessageMenuArgs: {
            const { test, message } = arg;
            const extId = test.item.extId;
            return {
              test: this.controllers.get(TestId.root(extId))?.collection.tree.get(extId)?.actual ?? toItemFromContext({ $mid: MarshalledId.TestItemContext, tests: [test] }),
              message: Convert.TestMessage.to(message)
            };
          }
          default:
            return arg;
        }
      }
    });
    commands.registerCommand(false, "testing.getExplorerSelection", async () => {
      const inner = await commands.executeCommand(TestCommandId.GetExplorerSelection);
      const lookup = (i) => {
        const controller = this.controllers.get(TestId.root(i));
        if (!controller) {
          return void 0;
        }
        return TestId.isRoot(i) ? controller.controller : controller.collection.tree.get(i)?.actual;
      };
      return {
        include: inner?.include.map(lookup).filter(isDefined) || [],
        exclude: inner?.exclude.map(lookup).filter(isDefined) || []
      };
    });
  }
  //#region public API
  /**
   * Implements vscode.test.registerTestProvider
   */
  createTestController(extension, controllerId, label, refreshHandler) {
    if (this.controllers.has(controllerId)) {
      throw new Error(`Attempt to insert a duplicate controller with ID "${controllerId}"`);
    }
    const disposable = new DisposableStore();
    const collection = disposable.add(new ExtHostTestItemCollection(controllerId, label, this.editors));
    collection.root.label = label;
    const profiles = /* @__PURE__ */ new Map();
    const activeProfiles = /* @__PURE__ */ new Set();
    const proxy = this.proxy;
    const getCapability = () => {
      let cap = 0;
      if (refreshHandler) {
        cap |= TestControllerCapability.Refresh;
      }
      const rcp = info.relatedCodeProvider;
      if (rcp) {
        if (rcp?.provideRelatedTests) {
          cap |= TestControllerCapability.TestRelatedToCode;
        }
        if (rcp?.provideRelatedCode) {
          cap |= TestControllerCapability.CodeRelatedToTest;
        }
      }
      return cap;
    };
    const controller = {
      items: collection.root.children,
      get label() {
        return label;
      },
      set label(value) {
        label = value;
        collection.root.label = value;
        proxy.$updateController(controllerId, { label });
      },
      get refreshHandler() {
        return refreshHandler;
      },
      set refreshHandler(value) {
        refreshHandler = value;
        proxy.$updateController(controllerId, { capabilities: getCapability() });
      },
      get id() {
        return controllerId;
      },
      get relatedCodeProvider() {
        return info.relatedCodeProvider;
      },
      set relatedCodeProvider(value) {
        checkProposedApiEnabled(extension, "testRelatedCode");
        info.relatedCodeProvider = value;
        proxy.$updateController(controllerId, { capabilities: getCapability() });
      },
      createRunProfile: (label2, group, runHandler, isDefault, tag, supportsContinuousRun) => {
        let profileId = hash(label2);
        while (profiles.has(profileId)) {
          profileId++;
        }
        return new TestRunProfileImpl(this.proxy, profiles, activeProfiles, this.defaultProfilesChangedEmitter.event, controllerId, profileId, label2, group, runHandler, isDefault, tag, supportsContinuousRun);
      },
      createTestItem(id, label2, uri) {
        return new TestItemImpl(controllerId, id, label2, uri);
      },
      createTestRun: (request, name, persist = true) => {
        return this.runTracker.createTestRun(extension, controllerId, collection, request, name, persist);
      },
      invalidateTestResults: (items) => {
        if (items === void 0) {
          this.proxy.$markTestRetired(void 0);
        } else {
          const itemsArr = items instanceof Array ? items : [items];
          this.proxy.$markTestRetired(itemsArr.map((i) => TestId.fromExtHostTestItem(i, controllerId).toString()));
        }
      },
      set resolveHandler(fn) {
        collection.resolveHandler = fn;
      },
      get resolveHandler() {
        return collection.resolveHandler;
      },
      dispose: () => {
        disposable.dispose();
      }
    };
    const info = { controller, collection, profiles, extension, activeProfiles };
    proxy.$registerTestController(controllerId, label, getCapability());
    disposable.add(toDisposable(() => proxy.$unregisterTestController(controllerId)));
    this.controllers.set(controllerId, info);
    disposable.add(toDisposable(() => this.controllers.delete(controllerId)));
    disposable.add(collection.onDidGenerateDiff((diff) => proxy.$publishDiff(controllerId, diff.map(TestsDiffOp.serialize))));
    return controller;
  }
  /**
   * Implements vscode.test.createTestObserver
   */
  createTestObserver() {
    return this.observer.checkout();
  }
  /**
   * Implements vscode.test.runTests
   */
  async runTests(req, token = CancellationToken.None) {
    const profile = tryGetProfileFromTestRunReq(req);
    if (!profile) {
      throw new Error("The request passed to `vscode.test.runTests` must include a profile");
    }
    const controller = this.controllers.get(profile.controllerId);
    if (!controller) {
      throw new Error("Controller not found");
    }
    await this.proxy.$runTests({
      preserveFocus: req.preserveFocus ?? true,
      group: Convert.TestRunProfileKind.from(profile.kind),
      targets: [{
        testIds: req.include?.map((t) => TestId.fromExtHostTestItem(t, controller.collection.root.id).toString()) ?? [controller.collection.root.id],
        profileId: profile.profileId,
        controllerId: profile.controllerId
      }],
      exclude: req.exclude?.map((t) => t.id)
    }, token);
  }
  /**
   * Implements vscode.test.registerTestFollowupProvider
   */
  registerTestFollowupProvider(provider) {
    this.followupProviders.add(provider);
    return { dispose: () => {
      this.followupProviders.delete(provider);
    } };
  }
  //#endregion
  //#region RPC methods
  /**
   * @inheritdoc
   */
  async $getTestsRelatedToCode(uri, _position, token) {
    const doc = this.editors.getDocument(URI.revive(uri));
    if (!doc) {
      return [];
    }
    const position = Convert.Position.to(_position);
    const related = [];
    await Promise.all([...this.controllers.values()].map(async (c) => {
      let tests;
      try {
        tests = await c.relatedCodeProvider?.provideRelatedTests?.(doc.document, position, token);
      } catch (e) {
        if (!token.isCancellationRequested) {
          this.logService.warn(`Error thrown while providing related tests for ${c.controller.label}`, e);
        }
      }
      if (tests) {
        for (const test of tests) {
          related.push(TestId.fromExtHostTestItem(test, c.controller.id).toString());
        }
        c.collection.flushDiff();
      }
    }));
    return related;
  }
  /**
   * @inheritdoc
   */
  async $getCodeRelatedToTest(testId, token) {
    const controller = this.controllers.get(TestId.root(testId));
    if (!controller) {
      return [];
    }
    const test = controller.collection.tree.get(testId);
    if (!test) {
      return [];
    }
    const locations = await controller.relatedCodeProvider?.provideRelatedCode?.(test.actual, token);
    return locations?.map(Convert.location.from) ?? [];
  }
  /**
   * @inheritdoc
   */
  $syncTests() {
    for (const { collection } of this.controllers.values()) {
      collection.flushDiff();
    }
    return Promise.resolve();
  }
  /**
   * @inheritdoc
   */
  async $getCoverageDetails(coverageId, testId, token) {
    const details = await this.runTracker.getCoverageDetails(coverageId, testId, token);
    return details?.map(Convert.TestCoverage.fromDetails);
  }
  /**
   * @inheritdoc
   */
  async $disposeRun(runId) {
    this.runTracker.disposeTestRun(runId);
  }
  /** @inheritdoc */
  $configureRunProfile(controllerId, profileId) {
    this.controllers.get(controllerId)?.profiles.get(profileId)?.configureHandler?.();
  }
  /** @inheritdoc */
  $setDefaultRunProfiles(profiles) {
    const evt = /* @__PURE__ */ new Map();
    for (const [controllerId, profileIds] of Object.entries(profiles)) {
      const ctrl = this.controllers.get(controllerId);
      if (!ctrl) {
        continue;
      }
      const changes = /* @__PURE__ */ new Map();
      const added = profileIds.filter((id) => !ctrl.activeProfiles.has(id));
      const removed = [...ctrl.activeProfiles].filter((id) => !profileIds.includes(id));
      for (const id of added) {
        changes.set(id, true);
        ctrl.activeProfiles.add(id);
      }
      for (const id of removed) {
        changes.set(id, false);
        ctrl.activeProfiles.delete(id);
      }
      if (changes.size) {
        evt.set(controllerId, changes);
      }
    }
    this.defaultProfilesChangedEmitter.fire(evt);
  }
  /** @inheritdoc */
  async $refreshTests(controllerId, token) {
    await this.controllers.get(controllerId)?.controller.refreshHandler?.(token);
  }
  /**
   * Updates test results shown to extensions.
   * @override
   */
  $publishTestResults(results) {
    this.results = Object.freeze(
      results.map((r) => {
        const o = Convert.TestResults.to(r);
        const taskWithCoverage = r.tasks.findIndex((t) => t.hasCoverage);
        if (taskWithCoverage !== -1) {
          o.getDetailedCoverage = (uri, token = CancellationToken.None) => this.proxy.$getCoverageDetails(r.id, taskWithCoverage, uri, token).then((r2) => r2.map(Convert.TestCoverage.to));
        }
        testResultInternalIDs.set(o, r.id);
        return o;
      }).concat(this.results).sort((a, b) => b.completedAt - a.completedAt).slice(0, 32)
    );
    this.resultsChangedEmitter.fire();
  }
  /**
   * Expands the nodes in the test tree. If levels is less than zero, it will
   * be treated as infinite.
   */
  async $expandTest(testId, levels) {
    const collection = this.controllers.get(TestId.fromString(testId).controllerId)?.collection;
    if (collection) {
      await collection.expand(testId, levels < 0 ? Infinity : levels);
      collection.flushDiff();
    }
  }
  /**
   * Receives a test update from the main thread. Called (eventually) whenever
   * tests change.
   */
  $acceptDiff(diff) {
    this.observer.applyDiff(diff.map((d) => TestsDiffOp.deserialize({ asCanonicalUri: (u) => u }, d)));
  }
  /**
   * Runs tests with the given set of IDs. Allows for test from multiple
   * providers to be run.
   * @inheritdoc
   */
  async $runControllerTests(reqs, token) {
    return Promise.all(reqs.map((req) => this.runControllerTestRequest(req, false, token)));
  }
  /**
   * Starts continuous test runs with the given set of IDs. Allows for test from
   * multiple providers to be run.
   * @inheritdoc
   */
  async $startContinuousRun(reqs, token) {
    const cts = new CancellationTokenSource(token);
    const res = await Promise.all(reqs.map((req) => this.runControllerTestRequest(req, true, cts.token)));
    if (!token.isCancellationRequested && !res.some((r) => r.error)) {
      await new Promise((r) => token.onCancellationRequested(r));
    }
    cts.dispose(true);
    return res;
  }
  /** @inheritdoc */
  async $provideTestFollowups(req, token) {
    const results = this.results.find((r) => testResultInternalIDs.get(r) === req.resultId);
    const test = results && findTestInResultSnapshot(TestId.fromString(req.extId), results?.results);
    if (!test) {
      return [];
    }
    let followups = [];
    await Promise.all([...this.followupProviders].map(async (provider) => {
      try {
        const r = await provider.provideFollowup(results, test, req.taskIndex, req.messageIndex, token);
        if (r) {
          followups = followups.concat(r);
        }
      } catch (e) {
        this.logService.error(`Error thrown while providing followup for test message`, e);
      }
    }));
    if (token.isCancellationRequested) {
      return [];
    }
    return followups.map((command) => {
      const id = followupCounter++;
      this.testFollowups.set(id, command);
      return { title: command.title, id };
    });
  }
  $disposeTestFollowups(id) {
    for (const i of id) {
      this.testFollowups.delete(i);
    }
  }
  $executeTestFollowup(id) {
    const command = this.testFollowups.get(id);
    if (!command) {
      return Promise.resolve();
    }
    return this.commands.executeCommand(command.command, ...command.arguments || []);
  }
  /**
   * Cancels an ongoing test run.
   */
  $cancelExtensionTestRun(runId, taskId) {
    if (runId === void 0) {
      this.runTracker.cancelAllRuns();
    } else {
      this.runTracker.cancelRunById(runId, taskId);
    }
  }
  //#endregion
  getMetadataForRun(run) {
    for (const tracker of this.runTracker.trackers) {
      const taskId = tracker.getTaskIdForRun(run);
      if (taskId) {
        return { taskId, runId: tracker.id };
      }
    }
    return void 0;
  }
  async runControllerTestRequest(req, isContinuous, token) {
    const lookup = this.controllers.get(req.controllerId);
    if (!lookup) {
      return {};
    }
    const { collection, profiles, extension } = lookup;
    const profile = profiles.get(req.profileId);
    if (!profile) {
      return {};
    }
    const includeTests = req.testIds.map((testId) => collection.tree.get(testId)).filter(isDefined);
    const excludeTests = req.excludeExtIds.map((id) => lookup.collection.tree.get(id)).filter(isDefined).filter((exclude) => includeTests.some(
      (include) => include.fullId.compare(exclude.fullId) === TestPosition.IsChild
    ));
    if (!includeTests.length) {
      return {};
    }
    const publicReq = new TestRunRequest(
      includeTests.some((i) => i.actual instanceof TestItemRootImpl) ? void 0 : includeTests.map((t) => t.actual),
      excludeTests.map((t) => t.actual),
      profile,
      isContinuous
    );
    const tracker = isStartControllerTests(req) && this.runTracker.prepareForMainThreadTestRun(
      extension,
      publicReq,
      TestRunDto.fromInternal(req, lookup.collection),
      profile,
      token
    );
    try {
      await profile.runHandler(publicReq, token);
      return {};
    } catch (e) {
      return { error: String(e) };
    } finally {
      if (tracker) {
        if (tracker.hasRunningTasks && !token.isCancellationRequested) {
          await Event.toPromise(tracker.onEnd);
        }
      }
    }
  }
};
ExtHostTesting = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IExtHostCommands),
  __decorateParam(3, IExtHostDocumentsAndEditors)
], ExtHostTesting);
const RUN_CANCEL_DEADLINE = 1e4;
var TestRunTrackerState = /* @__PURE__ */ ((TestRunTrackerState2) => {
  TestRunTrackerState2[TestRunTrackerState2["Running"] = 0] = "Running";
  TestRunTrackerState2[TestRunTrackerState2["Cancelling"] = 1] = "Cancelling";
  TestRunTrackerState2[TestRunTrackerState2["Ended"] = 2] = "Ended";
  return TestRunTrackerState2;
})(TestRunTrackerState || {});
class TestRunTracker extends Disposable {
  constructor(dto, proxy, logService, profile, extension, parentToken) {
    super();
    this.dto = dto;
    this.proxy = proxy;
    this.logService = logService;
    this.profile = profile;
    this.extension = extension;
    this.state = 0 /* Running */;
    this.running = 0;
    this.tasks = /* @__PURE__ */ new Map();
    this.sharedTestIds = /* @__PURE__ */ new Set();
    this.endEmitter = this._register(new Emitter());
    this.publishedCoverage = /* @__PURE__ */ new Map();
    /**
     * Fires when a test ends, and no more tests are left running.
     */
    this.onEnd = this.endEmitter.event;
    this.cts = this._register(new CancellationTokenSource(parentToken));
    const forciblyEnd = this._register(new RunOnceScheduler(() => this.forciblyEndTasks(), RUN_CANCEL_DEADLINE));
    this._register(this.cts.token.onCancellationRequested(() => forciblyEnd.schedule()));
    const didDisposeEmitter = new Emitter();
    this.onDidDispose = didDisposeEmitter.event;
    this._register(toDisposable(() => {
      didDisposeEmitter.fire();
      didDisposeEmitter.dispose();
    }));
  }
  /**
   * Gets whether there are any tests running.
   */
  get hasRunningTasks() {
    return this.running > 0;
  }
  /**
   * Gets the run ID.
   */
  get id() {
    return this.dto.id;
  }
  /** Gets the task ID from a test run object. */
  getTaskIdForRun(run) {
    for (const [taskId, { run: r }] of this.tasks) {
      if (r === run) {
        return taskId;
      }
    }
    return void 0;
  }
  /** Requests cancellation of the run. On the second call, forces cancellation. */
  cancel(taskId) {
    if (taskId) {
      this.tasks.get(taskId)?.cts.cancel();
    } else if (this.state === 0 /* Running */) {
      this.cts.cancel();
      this.state = 1 /* Cancelling */;
    } else if (this.state === 1 /* Cancelling */) {
      this.forciblyEndTasks();
    }
  }
  /** Gets details for a previously-emitted coverage object. */
  async getCoverageDetails(id, testId, token) {
    const [, taskId] = TestId.fromString(id).path;
    const coverage = this.publishedCoverage.get(id);
    if (!coverage) {
      return [];
    }
    const { report, extIds } = coverage;
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error("unreachable: run task was not found");
    }
    let testItem;
    if (testId && report instanceof FileCoverage) {
      const index = extIds.indexOf(testId);
      if (index === -1) {
        return [];
      }
      testItem = report.includesTests[index];
    }
    const details = testItem ? this.profile?.loadDetailedCoverageForTest?.(task.run, report, testItem, token) : this.profile?.loadDetailedCoverage?.(task.run, report, token);
    return await details ?? [];
  }
  /** Creates the public test run interface to give to extensions. */
  createRun(name) {
    const runId = this.dto.id;
    const ctrlId = this.dto.controllerId;
    const taskId = generateUuid();
    const guardTestMutation = (fn) => (test, ...args) => {
      if (ended) {
        this.logService.warn(`Setting the state of test "${test.id}" is a no-op after the run ends.`);
        return;
      }
      this.ensureTestIsKnown(test);
      fn(test, ...args);
    };
    const appendMessages = (test, messages) => {
      const converted = messages instanceof Array ? messages.map(Convert.TestMessage.from) : [Convert.TestMessage.from(messages)];
      if (test.uri && test.range) {
        const defaultLocation = { range: Convert.Range.from(test.range), uri: test.uri };
        for (const message of converted) {
          message.location = message.location || defaultLocation;
        }
      }
      this.proxy.$appendTestMessagesInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), converted);
    };
    let ended = false;
    const cts = this._register(new CancellationTokenSource(this.cts.token));
    const run = {
      isPersisted: this.dto.isPersisted,
      token: cts.token,
      name,
      onDidDispose: this.onDidDispose,
      addCoverage: (coverage) => {
        if (ended) {
          return;
        }
        const includesTests = coverage instanceof FileCoverage ? coverage.includesTests : [];
        if (includesTests.length) {
          for (const test of includesTests) {
            this.ensureTestIsKnown(test);
          }
        }
        const uriStr = coverage.uri.toString();
        const id = new TestId([runId, taskId, uriStr]).toString();
        this.publishedCoverage.set(id, { report: coverage, extIds: includesTests.map((t) => TestId.fromExtHostTestItem(t, ctrlId).toString()) });
        this.proxy.$appendCoverage(runId, taskId, Convert.TestCoverage.fromFile(ctrlId, id, coverage));
      },
      //#region state mutation
      enqueued: guardTestMutation((test) => {
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Queued);
      }),
      skipped: guardTestMutation((test) => {
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Skipped);
      }),
      started: guardTestMutation((test) => {
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Running);
      }),
      errored: guardTestMutation((test, messages, duration) => {
        appendMessages(test, messages);
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Errored, duration);
      }),
      failed: guardTestMutation((test, messages, duration) => {
        appendMessages(test, messages);
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Failed, duration);
      }),
      passed: guardTestMutation((test, duration) => {
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, this.dto.controllerId).toString(), TestResultState.Passed, duration);
      }),
      //#endregion
      appendOutput: (output, location, test) => {
        if (ended) {
          return;
        }
        if (test) {
          this.ensureTestIsKnown(test);
        }
        this.proxy.$appendOutputToRun(
          runId,
          taskId,
          VSBuffer.fromString(output),
          location && Convert.location.from(location),
          test && TestId.fromExtHostTestItem(test, ctrlId).toString()
        );
      },
      end: () => {
        if (ended) {
          return;
        }
        ended = true;
        this.proxy.$finishedTestRunTask(runId, taskId);
        if (!--this.running) {
          this.markEnded();
        }
      }
    };
    this.running++;
    this.tasks.set(taskId, { run, cts });
    this.proxy.$startedTestRunTask(runId, {
      id: taskId,
      ctrlId: this.dto.controllerId,
      name: name || this.extension.displayName || this.extension.identifier.value,
      running: true
    });
    return run;
  }
  forciblyEndTasks() {
    for (const { run } of this.tasks.values()) {
      run.end();
    }
  }
  markEnded() {
    if (this.state !== 2 /* Ended */) {
      this.state = 2 /* Ended */;
      this.endEmitter.fire();
    }
  }
  ensureTestIsKnown(test) {
    if (!(test instanceof TestItemImpl)) {
      throw new InvalidTestItemError(test.id);
    }
    if (this.sharedTestIds.has(TestId.fromExtHostTestItem(test, this.dto.controllerId).toString())) {
      return;
    }
    const chain = [];
    const root = this.dto.colllection.root;
    while (true) {
      const converted = Convert.TestItem.from(test);
      chain.unshift(converted);
      if (this.sharedTestIds.has(converted.extId)) {
        break;
      }
      this.sharedTestIds.add(converted.extId);
      if (test === root) {
        break;
      }
      test = test.parent || root;
    }
    this.proxy.$addTestsToRun(this.dto.controllerId, this.dto.id, chain);
  }
  dispose() {
    this.markEnded();
    super.dispose();
  }
}
class TestRunCoordinator {
  constructor(proxy, logService) {
    this.proxy = proxy;
    this.logService = logService;
    this.tracked = /* @__PURE__ */ new Map();
    this.trackedById = /* @__PURE__ */ new Map();
  }
  get trackers() {
    return this.tracked.values();
  }
  /**
   * Gets a coverage report for a given run and task ID.
   */
  getCoverageDetails(id, testId, token) {
    const runId = TestId.root(id);
    return this.trackedById.get(runId)?.getCoverageDetails(id, testId, token) || [];
  }
  /**
   * Disposes the test run, called when the main thread is no longer interested
   * in associated data.
   */
  disposeTestRun(runId) {
    this.trackedById.get(runId)?.dispose();
    this.trackedById.delete(runId);
    for (const [req, { id }] of this.tracked) {
      if (id === runId) {
        this.tracked.delete(req);
      }
    }
  }
  /**
   * Registers a request as being invoked by the main thread, so
   * `$startedExtensionTestRun` is not invoked. The run must eventually
   * be cancelled manually.
   */
  prepareForMainThreadTestRun(extension, req, dto, profile, token) {
    return this.getTracker(req, dto, profile, extension, token);
  }
  /**
   * Cancels an existing test run via its cancellation token.
   */
  cancelRunById(runId, taskId) {
    this.trackedById.get(runId)?.cancel(taskId);
  }
  /**
   * Cancels an existing test run via its cancellation token.
   */
  cancelAllRuns() {
    for (const tracker of this.tracked.values()) {
      tracker.cancel();
    }
  }
  /**
   * Implements the public `createTestRun` API.
   */
  createTestRun(extension, controllerId, collection, request, name, persist) {
    const existing = this.tracked.get(request);
    if (existing) {
      return existing.createRun(name);
    }
    const dto = TestRunDto.fromPublic(controllerId, collection, request, persist);
    const profile = tryGetProfileFromTestRunReq(request);
    this.proxy.$startedExtensionTestRun({
      controllerId,
      continuous: !!request.continuous,
      profile: profile && { group: Convert.TestRunProfileKind.from(profile.kind), id: profile.profileId },
      exclude: request.exclude?.map((t) => TestId.fromExtHostTestItem(t, collection.root.id).toString()) ?? [],
      id: dto.id,
      include: request.include?.map((t) => TestId.fromExtHostTestItem(t, collection.root.id).toString()) ?? [collection.root.id],
      preserveFocus: request.preserveFocus ?? true,
      persist
    });
    const tracker = this.getTracker(request, dto, request.profile, extension);
    Event.once(tracker.onEnd)(() => {
      this.proxy.$finishedExtensionTestRun(dto.id);
    });
    return tracker.createRun(name);
  }
  getTracker(req, dto, profile, extension, token) {
    const tracker = new TestRunTracker(dto, this.proxy, this.logService, profile, extension, token);
    this.tracked.set(req, tracker);
    this.trackedById.set(tracker.id, tracker);
    return tracker;
  }
}
const tryGetProfileFromTestRunReq = (request) => {
  if (!request.profile) {
    return void 0;
  }
  if (!(request.profile instanceof TestRunProfileImpl)) {
    throw new Error(`TestRunRequest.profile is not an instance created from TestController.createRunProfile`);
  }
  return request.profile;
};
class TestRunDto {
  constructor(controllerId, id, isPersisted, colllection) {
    this.controllerId = controllerId;
    this.id = id;
    this.isPersisted = isPersisted;
    this.colllection = colllection;
  }
  static fromPublic(controllerId, collection, request, persist) {
    return new TestRunDto(
      controllerId,
      generateUuid(),
      persist,
      collection
    );
  }
  static fromInternal(request, collection) {
    return new TestRunDto(
      request.controllerId,
      request.runId,
      true,
      collection
    );
  }
}
class MirroredChangeCollector {
  constructor(emitter) {
    this.emitter = emitter;
    this.added = /* @__PURE__ */ new Set();
    this.updated = /* @__PURE__ */ new Set();
    this.removed = /* @__PURE__ */ new Set();
    this.alreadyRemoved = /* @__PURE__ */ new Set();
  }
  get isEmpty() {
    return this.added.size === 0 && this.removed.size === 0 && this.updated.size === 0;
  }
  /**
   * @inheritdoc
   */
  add(node) {
    this.added.add(node);
  }
  /**
   * @inheritdoc
   */
  update(node) {
    Object.assign(node.revived, Convert.TestItem.toPlain(node.item));
    if (!this.added.has(node)) {
      this.updated.add(node);
    }
  }
  /**
   * @inheritdoc
   */
  remove(node) {
    if (this.added.delete(node)) {
      return;
    }
    this.updated.delete(node);
    const parentId = TestId.parentId(node.item.extId);
    if (parentId && this.alreadyRemoved.has(parentId.toString())) {
      this.alreadyRemoved.add(node.item.extId);
      return;
    }
    this.removed.add(node);
  }
  /**
   * @inheritdoc
   */
  getChangeEvent() {
    const { added, updated, removed } = this;
    return {
      get added() {
        return [...added].map((n) => n.revived);
      },
      get updated() {
        return [...updated].map((n) => n.revived);
      },
      get removed() {
        return [...removed].map((n) => n.revived);
      }
    };
  }
  complete() {
    if (!this.isEmpty) {
      this.emitter.fire(this.getChangeEvent());
    }
  }
}
class MirroredTestCollection extends AbstractIncrementalTestCollection {
  constructor() {
    super(...arguments);
    this.changeEmitter = new Emitter();
    /**
     * Change emitter that fires with the same semantics as `TestObserver.onDidChangeTests`.
     */
    this.onDidChangeTests = this.changeEmitter.event;
  }
  /**
   * Gets a list of root test items.
   */
  get rootTests() {
    return this.roots;
  }
  /**
   *
   * If the test ID exists, returns its underlying ID.
   */
  getMirroredTestDataById(itemId) {
    return this.items.get(itemId);
  }
  /**
   * If the test item is a mirrored test item, returns its underlying ID.
   */
  getMirroredTestDataByReference(item) {
    return this.items.get(item.id);
  }
  /**
   * @override
   */
  createItem(item, parent) {
    return {
      ...item,
      // todo@connor4312: make this work well again with children
      revived: Convert.TestItem.toPlain(item.item),
      depth: parent ? parent.depth + 1 : 0,
      children: /* @__PURE__ */ new Set()
    };
  }
  /**
   * @override
   */
  createChangeCollector() {
    return new MirroredChangeCollector(this.changeEmitter);
  }
}
class TestObservers {
  constructor(proxy) {
    this.proxy = proxy;
  }
  checkout() {
    if (!this.current) {
      this.current = this.createObserverData();
    }
    const current = this.current;
    current.observers++;
    return {
      onDidChangeTest: current.tests.onDidChangeTests,
      get tests() {
        return [...current.tests.rootTests].map((t) => t.revived);
      },
      dispose: createSingleCallFunction(() => {
        if (--current.observers === 0) {
          this.proxy.$unsubscribeFromDiffs();
          this.current = void 0;
        }
      })
    };
  }
  /**
   * Gets the internal test data by its reference.
   */
  getMirroredTestDataByReference(ref) {
    return this.current?.tests.getMirroredTestDataByReference(ref);
  }
  /**
   * Applies test diffs to the current set of observed tests.
   */
  applyDiff(diff) {
    this.current?.tests.apply(diff);
  }
  createObserverData() {
    const tests = new MirroredTestCollection({ asCanonicalUri: (u) => u });
    this.proxy.$subscribeToDiffs();
    return { observers: 0, tests };
  }
}
const updateProfile = (impl, proxy, initial, update) => {
  if (initial) {
    Object.assign(initial, update);
  } else {
    proxy.$updateTestRunConfig(impl.controllerId, impl.profileId, update);
  }
};
class TestRunProfileImpl extends TestRunProfileBase {
  constructor(proxy, profiles, activeProfiles, onDidChangeActiveProfiles, controllerId, profileId, _label, kind, runHandler, _isDefault = false, _tag = void 0, _supportsContinuousRun = false) {
    super(controllerId, profileId, kind);
    this._label = _label;
    this.runHandler = runHandler;
    this._tag = _tag;
    this._supportsContinuousRun = _supportsContinuousRun;
    this.#proxy = proxy;
    this.#profiles = profiles;
    this.#activeProfiles = activeProfiles;
    this.#onDidChangeDefaultProfiles = onDidChangeActiveProfiles;
    profiles.set(profileId, this);
    const groupBitset = Convert.TestRunProfileKind.from(kind);
    if (_isDefault) {
      activeProfiles.add(profileId);
    }
    this.#initialPublish = {
      profileId,
      controllerId,
      tag: _tag ? Convert.TestTag.namespace(this.controllerId, _tag.id) : null,
      label: _label,
      group: groupBitset,
      isDefault: _isDefault,
      hasConfigurationHandler: false,
      supportsContinuousRun: _supportsContinuousRun
    };
    queueMicrotask(() => {
      if (this.#initialPublish) {
        this.#proxy.$publishTestRunProfile(this.#initialPublish);
        this.#initialPublish = void 0;
      }
    });
  }
  #proxy;
  #activeProfiles;
  #onDidChangeDefaultProfiles;
  #initialPublish;
  #profiles;
  get label() {
    return this._label;
  }
  set label(label) {
    if (label !== this._label) {
      this._label = label;
      updateProfile(this, this.#proxy, this.#initialPublish, { label });
    }
  }
  get supportsContinuousRun() {
    return this._supportsContinuousRun;
  }
  set supportsContinuousRun(supports) {
    if (supports !== this._supportsContinuousRun) {
      this._supportsContinuousRun = supports;
      updateProfile(this, this.#proxy, this.#initialPublish, { supportsContinuousRun: supports });
    }
  }
  get isDefault() {
    return this.#activeProfiles.has(this.profileId);
  }
  set isDefault(isDefault) {
    if (isDefault !== this.isDefault) {
      if (isDefault) {
        this.#activeProfiles.add(this.profileId);
      } else {
        this.#activeProfiles.delete(this.profileId);
      }
      updateProfile(this, this.#proxy, this.#initialPublish, { isDefault });
    }
  }
  get tag() {
    return this._tag;
  }
  set tag(tag) {
    if (tag?.id !== this._tag?.id) {
      this._tag = tag;
      updateProfile(this, this.#proxy, this.#initialPublish, {
        tag: tag ? Convert.TestTag.namespace(this.controllerId, tag.id) : null
      });
    }
  }
  get configureHandler() {
    return this._configureHandler;
  }
  set configureHandler(handler) {
    if (handler !== this._configureHandler) {
      this._configureHandler = handler;
      updateProfile(this, this.#proxy, this.#initialPublish, { hasConfigurationHandler: !!handler });
    }
  }
  get onDidChangeDefault() {
    return Event.chain(
      this.#onDidChangeDefaultProfiles,
      ($) => $.map((ev) => ev.get(this.controllerId)?.get(this.profileId)).filter(isDefined)
    );
  }
  dispose() {
    if (this.#profiles?.delete(this.profileId)) {
      this.#profiles = void 0;
      this.#proxy.$removeTestProfile(this.controllerId, this.profileId);
    }
    this.#initialPublish = void 0;
  }
}
function findTestInResultSnapshot(extId, snapshot) {
  for (let i = 0; i < extId.path.length; i++) {
    const item = snapshot.find((s) => s.id === extId.path[i]);
    if (!item) {
      return void 0;
    }
    if (i === extId.path.length - 1) {
      return item;
    }
    snapshot = item.children;
  }
  return void 0;
}
export {
  ExtHostTesting,
  IExtHostTesting,
  TestRunCoordinator,
  TestRunDto,
  TestRunProfileImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VGVzdGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZnVuY3Rpb25hbC5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVGVzdENvbW1hbmRJZCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVzdGluZy9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFRlc3RJZCwgVGVzdFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgSW52YWxpZFRlc3RJdGVtRXJyb3IgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RJdGVtQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb24sIENvdmVyYWdlRGV0YWlscywgSUNhbGxQcm9maWxlUnVuSGFuZGxlciwgSVNlcmlhbGl6ZWRUZXN0UmVzdWx0cywgSVN0YXJ0Q29udHJvbGxlclRlc3RzLCBJU3RhcnRDb250cm9sbGVyVGVzdHNSZXN1bHQsIElUZXN0RXJyb3JNZXNzYWdlLCBJVGVzdEl0ZW0sIElUZXN0SXRlbUNvbnRleHQsIElUZXN0TWVzc2FnZU1lbnVBcmdzLCBJVGVzdFJ1blByb2ZpbGUsIEluY3JlbWVudGFsQ2hhbmdlQ29sbGVjdG9yLCBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbSwgSW50ZXJuYWxUZXN0SXRlbSwgVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5LCBUZXN0TWVzc2FnZUZvbGxvd3VwUmVxdWVzdCwgVGVzdE1lc3NhZ2VGb2xsb3d1cFJlc3BvbnNlLCBUZXN0UmVzdWx0U3RhdGUsIFRlc3RzRGlmZiwgVGVzdHNEaWZmT3AsIGlzU3RhcnRDb250cm9sbGVyVGVzdHMgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRlc3RpbmdTaGFwZSwgSUxvY2F0aW9uRHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZFRlc3RpbmdTaGFwZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RUZXN0SXRlbUNvbGxlY3Rpb24sIFRlc3RJdGVtSW1wbCwgVGVzdEl0ZW1Sb290SW1wbCwgdG9JdGVtRnJvbUNvbnRleHQgfSBmcm9tICcuL2V4dEhvc3RUZXN0SXRlbS5qcyc7XG5pbXBvcnQgKiBhcyBDb252ZXJ0IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IEZpbGVDb3ZlcmFnZSwgVGVzdFJ1blByb2ZpbGVCYXNlLCBUZXN0UnVuUmVxdWVzdCB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcblxuaW50ZXJmYWNlIENvbnRyb2xsZXJJbmZvIHtcblx0Y29udHJvbGxlcjogdnNjb2RlLlRlc3RDb250cm9sbGVyO1xuXHRwcm9maWxlczogTWFwPG51bWJlciwgdnNjb2RlLlRlc3RSdW5Qcm9maWxlPjtcblx0Y29sbGVjdGlvbjogRXh0SG9zdFRlc3RJdGVtQ29sbGVjdGlvbjtcblx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdHJlbGF0ZWRDb2RlUHJvdmlkZXI/OiB2c2NvZGUuVGVzdFJlbGF0ZWRDb2RlUHJvdmlkZXI7XG5cdGFjdGl2ZVByb2ZpbGVzOiBTZXQ8bnVtYmVyPjtcbn1cblxudHlwZSBEZWZhdWx0UHJvZmlsZUNoYW5nZUV2ZW50ID0gTWFwPC8qIGNvbnRyb2xsZXJJZCAqLyBzdHJpbmcsIE1hcDwgLyogcHJvZmlsZUlkICovbnVtYmVyLCBib29sZWFuPj47XG5cbmxldCBmb2xsb3d1cENvdW50ZXIgPSAwO1xuXG5jb25zdCB0ZXN0UmVzdWx0SW50ZXJuYWxJRHMgPSBuZXcgV2Vha01hcDx2c2NvZGUuVGVzdFJ1blJlc3VsdCwgc3RyaW5nPigpO1xuXG5leHBvcnQgY29uc3QgSUV4dEhvc3RUZXN0aW5nID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0VGVzdGluZz4oJ0lFeHRIb3N0VGVzdGluZycpO1xuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdFRlc3RpbmcgZXh0ZW5kcyBFeHRIb3N0VGVzdGluZyB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RUZXN0aW5nIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIEV4dEhvc3RUZXN0aW5nU2hhcGUge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlc3VsdHNDaGFuZ2VkRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgY29udHJvbGxlcnMgPSBuZXcgTWFwPC8qIGNvbnRyb2xsZXIgSUQgKi8gc3RyaW5nLCBDb250cm9sbGVySW5mbz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBwcm94eTogTWFpblRocmVhZFRlc3RpbmdTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBydW5UcmFja2VyOiBUZXN0UnVuQ29vcmRpbmF0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgb2JzZXJ2ZXI6IFRlc3RPYnNlcnZlcnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdFByb2ZpbGVzQ2hhbmdlZEVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEZWZhdWx0UHJvZmlsZUNoYW5nZUV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBmb2xsb3d1cFByb3ZpZGVycyA9IG5ldyBTZXQ8dnNjb2RlLlRlc3RGb2xsb3d1cFByb3ZpZGVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRlc3RGb2xsb3d1cHMgPSBuZXcgTWFwPG51bWJlciwgdnNjb2RlLkNvbW1hbmQ+KCk7XG5cblx0cHVibGljIG9uUmVzdWx0c0NoYW5nZWQgPSB0aGlzLnJlc3VsdHNDaGFuZ2VkRW1pdHRlci5ldmVudDtcblx0cHVibGljIHJlc3VsdHM6IFJlYWRvbmx5QXJyYXk8dnNjb2RlLlRlc3RSdW5SZXN1bHQ+ID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBycGM6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dEhvc3RDb21tYW5kcyBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRzOiBJRXh0SG9zdENvbW1hbmRzLFxuXHRcdEBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JzOiBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5wcm94eSA9IHJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkVGVzdGluZyk7XG5cdFx0dGhpcy5vYnNlcnZlciA9IG5ldyBUZXN0T2JzZXJ2ZXJzKHRoaXMucHJveHkpO1xuXHRcdHRoaXMucnVuVHJhY2tlciA9IG5ldyBUZXN0UnVuQ29vcmRpbmF0b3IodGhpcy5wcm94eSwgbG9nU2VydmljZSk7XG5cblx0XHRjb21tYW5kcy5yZWdpc3RlckFyZ3VtZW50UHJvY2Vzc29yKHtcblx0XHRcdHByb2Nlc3NBcmd1bWVudDogYXJnID0+IHtcblx0XHRcdFx0c3dpdGNoIChhcmc/LiRtaWQpIHtcblx0XHRcdFx0XHRjYXNlIE1hcnNoYWxsZWRJZC5UZXN0SXRlbUNvbnRleHQ6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNhc3QgPSBhcmcgYXMgSVRlc3RJdGVtQ29udGV4dDtcblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldFRlc3QgPSBjYXN0LnRlc3RzW2Nhc3QudGVzdHMubGVuZ3RoIC0gMV0uaXRlbS5leHRJZDtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmNvbnRyb2xsZXJzLmdldChUZXN0SWQucm9vdCh0YXJnZXRUZXN0KSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY29udHJvbGxlcj8uY29sbGVjdGlvbi50cmVlLmdldCh0YXJnZXRUZXN0KT8uYWN0dWFsID8/IHRvSXRlbUZyb21Db250ZXh0KGFyZyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgTWFyc2hhbGxlZElkLlRlc3RNZXNzYWdlTWVudUFyZ3M6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHsgdGVzdCwgbWVzc2FnZSB9ID0gYXJnIGFzIElUZXN0TWVzc2FnZU1lbnVBcmdzO1xuXHRcdFx0XHRcdFx0Y29uc3QgZXh0SWQgPSB0ZXN0Lml0ZW0uZXh0SWQ7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHR0ZXN0OiB0aGlzLmNvbnRyb2xsZXJzLmdldChUZXN0SWQucm9vdChleHRJZCkpPy5jb2xsZWN0aW9uLnRyZWUuZ2V0KGV4dElkKT8uYWN0dWFsXG5cdFx0XHRcdFx0XHRcdFx0Pz8gdG9JdGVtRnJvbUNvbnRleHQoeyAkbWlkOiBNYXJzaGFsbGVkSWQuVGVzdEl0ZW1Db250ZXh0LCB0ZXN0czogW3Rlc3RdIH0pLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBDb252ZXJ0LlRlc3RNZXNzYWdlLnRvKG1lc3NhZ2UgYXMgSVRlc3RFcnJvck1lc3NhZ2UuU2VyaWFsaXplZCksXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkZWZhdWx0OiByZXR1cm4gYXJnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb21tYW5kcy5yZWdpc3RlckNvbW1hbmQoZmFsc2UsICd0ZXN0aW5nLmdldEV4cGxvcmVyU2VsZWN0aW9uJywgYXN5bmMgKCk6IFByb21pc2U8YW55PiA9PiB7XG5cdFx0XHRjb25zdCBpbm5lciA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHtcblx0XHRcdFx0aW5jbHVkZTogc3RyaW5nW107XG5cdFx0XHRcdGV4Y2x1ZGU6IHN0cmluZ1tdO1xuXHRcdFx0fT4oVGVzdENvbW1hbmRJZC5HZXRFeHBsb3JlclNlbGVjdGlvbik7XG5cblx0XHRcdGNvbnN0IGxvb2t1cCA9IChpOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY29udHJvbGxlcnMuZ2V0KFRlc3RJZC5yb290KGkpKTtcblx0XHRcdFx0aWYgKCFjb250cm9sbGVyKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0cmV0dXJuIFRlc3RJZC5pc1Jvb3QoaSkgPyBjb250cm9sbGVyLmNvbnRyb2xsZXIgOiBjb250cm9sbGVyLmNvbGxlY3Rpb24udHJlZS5nZXQoaSk/LmFjdHVhbDtcblx0XHRcdH07XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluY2x1ZGU6IGlubmVyPy5pbmNsdWRlLm1hcChsb29rdXApLmZpbHRlcihpc0RlZmluZWQpIHx8IFtdLFxuXHRcdFx0XHRleGNsdWRlOiBpbm5lcj8uZXhjbHVkZS5tYXAobG9va3VwKS5maWx0ZXIoaXNEZWZpbmVkKSB8fCBbXSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHQvLyNyZWdpb24gcHVibGljIEFQSVxuXG5cdC8qKlxuXHQgKiBJbXBsZW1lbnRzIHZzY29kZS50ZXN0LnJlZ2lzdGVyVGVzdFByb3ZpZGVyXG5cdCAqL1xuXHRwdWJsaWMgY3JlYXRlVGVzdENvbnRyb2xsZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGNvbnRyb2xsZXJJZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCByZWZyZXNoSGFuZGxlcj86ICh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFRoZW5hYmxlPHZvaWQ+IHwgdm9pZCk6IHZzY29kZS5UZXN0Q29udHJvbGxlciB7XG5cdFx0aWYgKHRoaXMuY29udHJvbGxlcnMuaGFzKGNvbnRyb2xsZXJJZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQXR0ZW1wdCB0byBpbnNlcnQgYSBkdXBsaWNhdGUgY29udHJvbGxlciB3aXRoIElEIFwiJHtjb250cm9sbGVySWR9XCJgKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBkaXNwb3NhYmxlLmFkZChuZXcgRXh0SG9zdFRlc3RJdGVtQ29sbGVjdGlvbihjb250cm9sbGVySWQsIGxhYmVsLCB0aGlzLmVkaXRvcnMpKTtcblx0XHRjb2xsZWN0aW9uLnJvb3QubGFiZWwgPSBsYWJlbDtcblxuXHRcdGNvbnN0IHByb2ZpbGVzID0gbmV3IE1hcDxudW1iZXIsIHZzY29kZS5UZXN0UnVuUHJvZmlsZT4oKTtcblx0XHRjb25zdCBhY3RpdmVQcm9maWxlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdGNvbnN0IHByb3h5ID0gdGhpcy5wcm94eTtcblxuXHRcdGNvbnN0IGdldENhcGFiaWxpdHkgPSAoKSA9PiB7XG5cdFx0XHRsZXQgY2FwID0gMDtcblx0XHRcdGlmIChyZWZyZXNoSGFuZGxlcikge1xuXHRcdFx0XHRjYXAgfD0gVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5LlJlZnJlc2g7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByY3AgPSBpbmZvLnJlbGF0ZWRDb2RlUHJvdmlkZXI7XG5cdFx0XHRpZiAocmNwKSB7XG5cdFx0XHRcdGlmIChyY3A/LnByb3ZpZGVSZWxhdGVkVGVzdHMpIHtcblx0XHRcdFx0XHRjYXAgfD0gVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5LlRlc3RSZWxhdGVkVG9Db2RlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyY3A/LnByb3ZpZGVSZWxhdGVkQ29kZSkge1xuXHRcdFx0XHRcdGNhcCB8PSBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHkuQ29kZVJlbGF0ZWRUb1Rlc3Q7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBjYXAgYXMgVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5O1xuXHRcdH07XG5cblx0XHRjb25zdCBjb250cm9sbGVyOiB2c2NvZGUuVGVzdENvbnRyb2xsZXIgPSB7XG5cdFx0XHRpdGVtczogY29sbGVjdGlvbi5yb290LmNoaWxkcmVuLFxuXHRcdFx0Z2V0IGxhYmVsKCkge1xuXHRcdFx0XHRyZXR1cm4gbGFiZWw7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGxhYmVsKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRcdFx0bGFiZWwgPSB2YWx1ZTtcblx0XHRcdFx0Y29sbGVjdGlvbi5yb290LmxhYmVsID0gdmFsdWU7XG5cdFx0XHRcdHByb3h5LiR1cGRhdGVDb250cm9sbGVyKGNvbnRyb2xsZXJJZCwgeyBsYWJlbCB9KTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgcmVmcmVzaEhhbmRsZXIoKSB7XG5cdFx0XHRcdHJldHVybiByZWZyZXNoSGFuZGxlcjtcblx0XHRcdH0sXG5cdFx0XHRzZXQgcmVmcmVzaEhhbmRsZXIodmFsdWU6ICgodG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBUaGVuYWJsZTx2b2lkPiB8IHZvaWQpIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJlZnJlc2hIYW5kbGVyID0gdmFsdWU7XG5cdFx0XHRcdHByb3h5LiR1cGRhdGVDb250cm9sbGVyKGNvbnRyb2xsZXJJZCwgeyBjYXBhYmlsaXRpZXM6IGdldENhcGFiaWxpdHkoKSB9KTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaWQoKSB7XG5cdFx0XHRcdHJldHVybiBjb250cm9sbGVySWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHJlbGF0ZWRDb2RlUHJvdmlkZXIoKSB7XG5cdFx0XHRcdHJldHVybiBpbmZvLnJlbGF0ZWRDb2RlUHJvdmlkZXI7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHJlbGF0ZWRDb2RlUHJvdmlkZXIodmFsdWU6IHZzY29kZS5UZXN0UmVsYXRlZENvZGVQcm92aWRlciB8IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICd0ZXN0UmVsYXRlZENvZGUnKTtcblx0XHRcdFx0aW5mby5yZWxhdGVkQ29kZVByb3ZpZGVyID0gdmFsdWU7XG5cdFx0XHRcdHByb3h5LiR1cGRhdGVDb250cm9sbGVyKGNvbnRyb2xsZXJJZCwgeyBjYXBhYmlsaXRpZXM6IGdldENhcGFiaWxpdHkoKSB9KTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVSdW5Qcm9maWxlOiAobGFiZWwsIGdyb3VwLCBydW5IYW5kbGVyLCBpc0RlZmF1bHQsIHRhZz86IHZzY29kZS5UZXN0VGFnIHwgdW5kZWZpbmVkLCBzdXBwb3J0c0NvbnRpbnVvdXNSdW4/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdC8vIERlcml2ZSB0aGUgcHJvZmlsZSBJRCBmcm9tIGEgaGFzaCBzbyB0aGF0IHRoZSBzYW1lIHByb2ZpbGUgd2lsbCB0ZW5kXG5cdFx0XHRcdC8vIHRvIGhhdmUgdGhlIHNhbWUgaGFzaGVzLCBhbGxvd2luZyByZS1ydW4gcmVxdWVzdHMgdG8gd29yayBhY3Jvc3MgcmVsb2Fkcy5cblx0XHRcdFx0bGV0IHByb2ZpbGVJZCA9IGhhc2gobGFiZWwpO1xuXHRcdFx0XHR3aGlsZSAocHJvZmlsZXMuaGFzKHByb2ZpbGVJZCkpIHtcblx0XHRcdFx0XHRwcm9maWxlSWQrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBuZXcgVGVzdFJ1blByb2ZpbGVJbXBsKHRoaXMucHJveHksIHByb2ZpbGVzLCBhY3RpdmVQcm9maWxlcywgdGhpcy5kZWZhdWx0UHJvZmlsZXNDaGFuZ2VkRW1pdHRlci5ldmVudCwgY29udHJvbGxlcklkLCBwcm9maWxlSWQsIGxhYmVsLCBncm91cCwgcnVuSGFuZGxlciwgaXNEZWZhdWx0LCB0YWcsIHN1cHBvcnRzQ29udGludW91c1J1bik7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlVGVzdEl0ZW0oaWQsIGxhYmVsLCB1cmkpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBUZXN0SXRlbUltcGwoY29udHJvbGxlcklkLCBpZCwgbGFiZWwsIHVyaSk7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlVGVzdFJ1bjogKHJlcXVlc3QsIG5hbWUsIHBlcnNpc3QgPSB0cnVlKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJ1blRyYWNrZXIuY3JlYXRlVGVzdFJ1bihleHRlbnNpb24sIGNvbnRyb2xsZXJJZCwgY29sbGVjdGlvbiwgcmVxdWVzdCwgbmFtZSwgcGVyc2lzdCk7XG5cdFx0XHR9LFxuXHRcdFx0aW52YWxpZGF0ZVRlc3RSZXN1bHRzOiBpdGVtcyA9PiB7XG5cdFx0XHRcdGlmIChpdGVtcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm94eS4kbWFya1Rlc3RSZXRpcmVkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbXNBcnIgPSBpdGVtcyBpbnN0YW5jZW9mIEFycmF5ID8gaXRlbXMgOiBbaXRlbXNdO1xuXHRcdFx0XHRcdHRoaXMucHJveHkuJG1hcmtUZXN0UmV0aXJlZChpdGVtc0Fyci5tYXAoaSA9PiBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbShpISwgY29udHJvbGxlcklkKS50b1N0cmluZygpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRzZXQgcmVzb2x2ZUhhbmRsZXIoZm4pIHtcblx0XHRcdFx0Y29sbGVjdGlvbi5yZXNvbHZlSGFuZGxlciA9IGZuO1xuXHRcdFx0fSxcblx0XHRcdGdldCByZXNvbHZlSGFuZGxlcigpIHtcblx0XHRcdFx0cmV0dXJuIGNvbGxlY3Rpb24ucmVzb2x2ZUhhbmRsZXIgYXMgdW5kZWZpbmVkIHwgKChpdGVtPzogdnNjb2RlLlRlc3RJdGVtKSA9PiB2b2lkKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5mbzogQ29udHJvbGxlckluZm8gPSB7IGNvbnRyb2xsZXIsIGNvbGxlY3Rpb24sIHByb2ZpbGVzLCBleHRlbnNpb24sIGFjdGl2ZVByb2ZpbGVzIH07XG5cdFx0cHJveHkuJHJlZ2lzdGVyVGVzdENvbnRyb2xsZXIoY29udHJvbGxlcklkLCBsYWJlbCwgZ2V0Q2FwYWJpbGl0eSgpKTtcblx0XHRkaXNwb3NhYmxlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcHJveHkuJHVucmVnaXN0ZXJUZXN0Q29udHJvbGxlcihjb250cm9sbGVySWQpKSk7XG5cblx0XHR0aGlzLmNvbnRyb2xsZXJzLnNldChjb250cm9sbGVySWQsIGluZm8pO1xuXHRcdGRpc3Bvc2FibGUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNvbnRyb2xsZXJzLmRlbGV0ZShjb250cm9sbGVySWQpKSk7XG5cblx0XHRkaXNwb3NhYmxlLmFkZChjb2xsZWN0aW9uLm9uRGlkR2VuZXJhdGVEaWZmKGRpZmYgPT4gcHJveHkuJHB1Ymxpc2hEaWZmKGNvbnRyb2xsZXJJZCwgZGlmZi5tYXAoVGVzdHNEaWZmT3Auc2VyaWFsaXplKSkpKTtcblxuXHRcdHJldHVybiBjb250cm9sbGVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIEltcGxlbWVudHMgdnNjb2RlLnRlc3QuY3JlYXRlVGVzdE9ic2VydmVyXG5cdCAqL1xuXHRwdWJsaWMgY3JlYXRlVGVzdE9ic2VydmVyKCkge1xuXHRcdHJldHVybiB0aGlzLm9ic2VydmVyLmNoZWNrb3V0KCk7XG5cdH1cblxuXG5cdC8qKlxuXHQgKiBJbXBsZW1lbnRzIHZzY29kZS50ZXN0LnJ1blRlc3RzXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcnVuVGVzdHMocmVxOiB2c2NvZGUuVGVzdFJ1blJlcXVlc3QsIHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkge1xuXHRcdGNvbnN0IHByb2ZpbGUgPSB0cnlHZXRQcm9maWxlRnJvbVRlc3RSdW5SZXEocmVxKTtcblx0XHRpZiAoIXByb2ZpbGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGhlIHJlcXVlc3QgcGFzc2VkIHRvIGB2c2NvZGUudGVzdC5ydW5UZXN0c2AgbXVzdCBpbmNsdWRlIGEgcHJvZmlsZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmNvbnRyb2xsZXJzLmdldChwcm9maWxlLmNvbnRyb2xsZXJJZCk7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvbnRyb2xsZXIgbm90IGZvdW5kJyk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5wcm94eS4kcnVuVGVzdHMoe1xuXHRcdFx0cHJlc2VydmVGb2N1czogcmVxLnByZXNlcnZlRm9jdXMgPz8gdHJ1ZSxcblx0XHRcdGdyb3VwOiBDb252ZXJ0LlRlc3RSdW5Qcm9maWxlS2luZC5mcm9tKHByb2ZpbGUua2luZCksXG5cdFx0XHR0YXJnZXRzOiBbe1xuXHRcdFx0XHR0ZXN0SWRzOiByZXEuaW5jbHVkZT8ubWFwKHQgPT4gVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odCwgY29udHJvbGxlci5jb2xsZWN0aW9uLnJvb3QuaWQpLnRvU3RyaW5nKCkpID8/IFtjb250cm9sbGVyLmNvbGxlY3Rpb24ucm9vdC5pZF0sXG5cdFx0XHRcdHByb2ZpbGVJZDogcHJvZmlsZS5wcm9maWxlSWQsXG5cdFx0XHRcdGNvbnRyb2xsZXJJZDogcHJvZmlsZS5jb250cm9sbGVySWQsXG5cdFx0XHR9XSxcblx0XHRcdGV4Y2x1ZGU6IHJlcS5leGNsdWRlPy5tYXAodCA9PiB0LmlkKSxcblx0XHR9LCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogSW1wbGVtZW50cyB2c2NvZGUudGVzdC5yZWdpc3RlclRlc3RGb2xsb3d1cFByb3ZpZGVyXG5cdCAqL1xuXHRwdWJsaWMgcmVnaXN0ZXJUZXN0Rm9sbG93dXBQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLlRlc3RGb2xsb3d1cFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdHRoaXMuZm9sbG93dXBQcm92aWRlcnMuYWRkKHByb3ZpZGVyKTtcblx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IHRoaXMuZm9sbG93dXBQcm92aWRlcnMuZGVsZXRlKHByb3ZpZGVyKTsgfSB9O1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJQQyBtZXRob2RzXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0YXN5bmMgJGdldFRlc3RzUmVsYXRlZFRvQ29kZSh1cmk6IFVyaUNvbXBvbmVudHMsIF9wb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5lZGl0b3JzLmdldERvY3VtZW50KFVSSS5yZXZpdmUodXJpKSk7XG5cdFx0aWYgKCFkb2MpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IENvbnZlcnQuUG9zaXRpb24udG8oX3Bvc2l0aW9uKTtcblx0XHRjb25zdCByZWxhdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi50aGlzLmNvbnRyb2xsZXJzLnZhbHVlcygpXS5tYXAoYXN5bmMgKGMpID0+IHtcblx0XHRcdGxldCB0ZXN0czogdnNjb2RlLlRlc3RJdGVtW10gfCB1bmRlZmluZWQgfCBudWxsO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGVzdHMgPSBhd2FpdCBjLnJlbGF0ZWRDb2RlUHJvdmlkZXI/LnByb3ZpZGVSZWxhdGVkVGVzdHM/Lihkb2MuZG9jdW1lbnQsIHBvc2l0aW9uLCB0b2tlbik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3IgdGhyb3duIHdoaWxlIHByb3ZpZGluZyByZWxhdGVkIHRlc3RzIGZvciAke2MuY29udHJvbGxlci5sYWJlbH1gLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGVzdHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0ZXN0IG9mIHRlc3RzKSB7XG5cdFx0XHRcdFx0cmVsYXRlZC5wdXNoKFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKHRlc3QsIGMuY29udHJvbGxlci5pZCkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Yy5jb2xsZWN0aW9uLmZsdXNoRGlmZigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiByZWxhdGVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRhc3luYyAkZ2V0Q29kZVJlbGF0ZWRUb1Rlc3QodGVzdElkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUxvY2F0aW9uRHRvW10+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5jb250cm9sbGVycy5nZXQoVGVzdElkLnJvb3QodGVzdElkKSk7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVzdCA9IGNvbnRyb2xsZXIuY29sbGVjdGlvbi50cmVlLmdldCh0ZXN0SWQpO1xuXHRcdGlmICghdGVzdCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2F0aW9ucyA9IGF3YWl0IGNvbnRyb2xsZXIucmVsYXRlZENvZGVQcm92aWRlcj8ucHJvdmlkZVJlbGF0ZWRDb2RlPy4odGVzdC5hY3R1YWwsIHRva2VuKTtcblx0XHRyZXR1cm4gbG9jYXRpb25zPy5tYXAoQ29udmVydC5sb2NhdGlvbi5mcm9tKSA/PyBbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0JHN5bmNUZXN0cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHsgY29sbGVjdGlvbiB9IG9mIHRoaXMuY29udHJvbGxlcnMudmFsdWVzKCkpIHtcblx0XHRcdGNvbGxlY3Rpb24uZmx1c2hEaWZmKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRhc3luYyAkZ2V0Q292ZXJhZ2VEZXRhaWxzKGNvdmVyYWdlSWQ6IHN0cmluZywgdGVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Q292ZXJhZ2VEZXRhaWxzLlNlcmlhbGl6ZWRbXT4ge1xuXHRcdGNvbnN0IGRldGFpbHMgPSBhd2FpdCB0aGlzLnJ1blRyYWNrZXIuZ2V0Q292ZXJhZ2VEZXRhaWxzKGNvdmVyYWdlSWQsIHRlc3RJZCwgdG9rZW4pO1xuXHRcdHJldHVybiBkZXRhaWxzPy5tYXAoQ29udmVydC5UZXN0Q292ZXJhZ2UuZnJvbURldGFpbHMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRhc3luYyAkZGlzcG9zZVJ1bihydW5JZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5ydW5UcmFja2VyLmRpc3Bvc2VUZXN0UnVuKHJ1bklkKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHQkY29uZmlndXJlUnVuUHJvZmlsZShjb250cm9sbGVySWQ6IHN0cmluZywgcHJvZmlsZUlkOiBudW1iZXIpIHtcblx0XHR0aGlzLmNvbnRyb2xsZXJzLmdldChjb250cm9sbGVySWQpPy5wcm9maWxlcy5nZXQocHJvZmlsZUlkKT8uY29uZmlndXJlSGFuZGxlcj8uKCk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0JHNldERlZmF1bHRSdW5Qcm9maWxlcyhwcm9maWxlczogUmVjb3JkPC8qIGNvbnRyb2xsZXIgaWQgKi9zdHJpbmcsIC8qIHByb2ZpbGUgaWQgKi8gbnVtYmVyW10+KTogdm9pZCB7XG5cdFx0Y29uc3QgZXZ0OiBEZWZhdWx0UHJvZmlsZUNoYW5nZUV2ZW50ID0gbmV3IE1hcCgpO1xuXHRcdGZvciAoY29uc3QgW2NvbnRyb2xsZXJJZCwgcHJvZmlsZUlkc10gb2YgT2JqZWN0LmVudHJpZXMocHJvZmlsZXMpKSB7XG5cdFx0XHRjb25zdCBjdHJsID0gdGhpcy5jb250cm9sbGVycy5nZXQoY29udHJvbGxlcklkKTtcblx0XHRcdGlmICghY3RybCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBuZXcgTWFwPG51bWJlciwgYm9vbGVhbj4oKTtcblx0XHRcdGNvbnN0IGFkZGVkID0gcHJvZmlsZUlkcy5maWx0ZXIoaWQgPT4gIWN0cmwuYWN0aXZlUHJvZmlsZXMuaGFzKGlkKSk7XG5cdFx0XHRjb25zdCByZW1vdmVkID0gWy4uLmN0cmwuYWN0aXZlUHJvZmlsZXNdLmZpbHRlcihpZCA9PiAhcHJvZmlsZUlkcy5pbmNsdWRlcyhpZCkpO1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBhZGRlZCkge1xuXHRcdFx0XHRjaGFuZ2VzLnNldChpZCwgdHJ1ZSk7XG5cdFx0XHRcdGN0cmwuYWN0aXZlUHJvZmlsZXMuYWRkKGlkKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgaWQgb2YgcmVtb3ZlZCkge1xuXHRcdFx0XHRjaGFuZ2VzLnNldChpZCwgZmFsc2UpO1xuXHRcdFx0XHRjdHJsLmFjdGl2ZVByb2ZpbGVzLmRlbGV0ZShpZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hhbmdlcy5zaXplKSB7XG5cdFx0XHRcdGV2dC5zZXQoY29udHJvbGxlcklkLCBjaGFuZ2VzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmRlZmF1bHRQcm9maWxlc0NoYW5nZWRFbWl0dGVyLmZpcmUoZXZ0KTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRhc3luYyAkcmVmcmVzaFRlc3RzKGNvbnRyb2xsZXJJZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRhd2FpdCB0aGlzLmNvbnRyb2xsZXJzLmdldChjb250cm9sbGVySWQpPy5jb250cm9sbGVyLnJlZnJlc2hIYW5kbGVyPy4odG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGVzdCByZXN1bHRzIHNob3duIHRvIGV4dGVuc2lvbnMuXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljICRwdWJsaXNoVGVzdFJlc3VsdHMocmVzdWx0czogSVNlcmlhbGl6ZWRUZXN0UmVzdWx0c1tdKTogdm9pZCB7XG5cdFx0dGhpcy5yZXN1bHRzID0gT2JqZWN0LmZyZWV6ZShcblx0XHRcdHJlc3VsdHNcblx0XHRcdFx0Lm1hcChyID0+IHtcblx0XHRcdFx0XHRjb25zdCBvID0gQ29udmVydC5UZXN0UmVzdWx0cy50byhyKTtcblx0XHRcdFx0XHRjb25zdCB0YXNrV2l0aENvdmVyYWdlID0gci50YXNrcy5maW5kSW5kZXgodCA9PiB0Lmhhc0NvdmVyYWdlKTtcblx0XHRcdFx0XHRpZiAodGFza1dpdGhDb3ZlcmFnZSAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdG8uZ2V0RGV0YWlsZWRDb3ZlcmFnZSA9ICh1cmksIHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkgPT5cblx0XHRcdFx0XHRcdFx0dGhpcy5wcm94eS4kZ2V0Q292ZXJhZ2VEZXRhaWxzKHIuaWQsIHRhc2tXaXRoQ292ZXJhZ2UsIHVyaSwgdG9rZW4pLnRoZW4ociA9PiByLm1hcChDb252ZXJ0LlRlc3RDb3ZlcmFnZS50bykpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRlc3RSZXN1bHRJbnRlcm5hbElEcy5zZXQobywgci5pZCk7XG5cdFx0XHRcdFx0cmV0dXJuIG87XG5cdFx0XHRcdH0pXG5cdFx0XHRcdC5jb25jYXQodGhpcy5yZXN1bHRzKVxuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4gYi5jb21wbGV0ZWRBdCAtIGEuY29tcGxldGVkQXQpXG5cdFx0XHRcdC5zbGljZSgwLCAzMiksXG5cdFx0KTtcblxuXHRcdHRoaXMucmVzdWx0c0NoYW5nZWRFbWl0dGVyLmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeHBhbmRzIHRoZSBub2RlcyBpbiB0aGUgdGVzdCB0cmVlLiBJZiBsZXZlbHMgaXMgbGVzcyB0aGFuIHplcm8sIGl0IHdpbGxcblx0ICogYmUgdHJlYXRlZCBhcyBpbmZpbml0ZS5cblx0ICovXG5cdHB1YmxpYyBhc3luYyAkZXhwYW5kVGVzdCh0ZXN0SWQ6IHN0cmluZywgbGV2ZWxzOiBudW1iZXIpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gdGhpcy5jb250cm9sbGVycy5nZXQoVGVzdElkLmZyb21TdHJpbmcodGVzdElkKS5jb250cm9sbGVySWQpPy5jb2xsZWN0aW9uO1xuXHRcdGlmIChjb2xsZWN0aW9uKSB7XG5cdFx0XHRhd2FpdCBjb2xsZWN0aW9uLmV4cGFuZCh0ZXN0SWQsIGxldmVscyA8IDAgPyBJbmZpbml0eSA6IGxldmVscyk7XG5cdFx0XHRjb2xsZWN0aW9uLmZsdXNoRGlmZigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNlaXZlcyBhIHRlc3QgdXBkYXRlIGZyb20gdGhlIG1haW4gdGhyZWFkLiBDYWxsZWQgKGV2ZW50dWFsbHkpIHdoZW5ldmVyXG5cdCAqIHRlc3RzIGNoYW5nZS5cblx0ICovXG5cdHB1YmxpYyAkYWNjZXB0RGlmZihkaWZmOiBUZXN0c0RpZmZPcC5TZXJpYWxpemVkW10pOiB2b2lkIHtcblx0XHR0aGlzLm9ic2VydmVyLmFwcGx5RGlmZihkaWZmLm1hcChkID0+IFRlc3RzRGlmZk9wLmRlc2VyaWFsaXplKHsgYXNDYW5vbmljYWxVcmk6IHUgPT4gdSB9LCBkKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJ1bnMgdGVzdHMgd2l0aCB0aGUgZ2l2ZW4gc2V0IG9mIElEcy4gQWxsb3dzIGZvciB0ZXN0IGZyb20gbXVsdGlwbGVcblx0ICogcHJvdmlkZXJzIHRvIGJlIHJ1bi5cblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhc3luYyAkcnVuQ29udHJvbGxlclRlc3RzKHJlcXM6IElTdGFydENvbnRyb2xsZXJUZXN0c1tdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTdGFydENvbnRyb2xsZXJUZXN0c1Jlc3VsdFtdPiB7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHJlcXMubWFwKHJlcSA9PiB0aGlzLnJ1bkNvbnRyb2xsZXJUZXN0UmVxdWVzdChyZXEsIGZhbHNlLCB0b2tlbikpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdGFydHMgY29udGludW91cyB0ZXN0IHJ1bnMgd2l0aCB0aGUgZ2l2ZW4gc2V0IG9mIElEcy4gQWxsb3dzIGZvciB0ZXN0IGZyb21cblx0ICogbXVsdGlwbGUgcHJvdmlkZXJzIHRvIGJlIHJ1bi5cblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhc3luYyAkc3RhcnRDb250aW51b3VzUnVuKHJlcXM6IElTdGFydENvbnRyb2xsZXJUZXN0c1tdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTdGFydENvbnRyb2xsZXJUZXN0c1Jlc3VsdFtdPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRjb25zdCByZXMgPSBhd2FpdCBQcm9taXNlLmFsbChyZXFzLm1hcChyZXEgPT4gdGhpcy5ydW5Db250cm9sbGVyVGVzdFJlcXVlc3QocmVxLCB0cnVlLCBjdHMudG9rZW4pKSk7XG5cblx0XHQvLyBhdm9pZCByZXR1cm5pbmcgdW50aWwgY2FuY2VsbGF0aW9uIGlzIHJlcXVlc3RlZCwgb3RoZXJ3aXNlIGlwYyBkaXNwb3NlcyBvZiB0aGUgdG9rZW5cblx0XHRpZiAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkICYmICFyZXMuc29tZShyID0+IHIuZXJyb3IpKSB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKHIpKTtcblx0XHR9XG5cblx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblx0XHRyZXR1cm4gcmVzO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBhc3luYyAkcHJvdmlkZVRlc3RGb2xsb3d1cHMocmVxOiBUZXN0TWVzc2FnZUZvbGxvd3VwUmVxdWVzdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxUZXN0TWVzc2FnZUZvbGxvd3VwUmVzcG9uc2VbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSB0aGlzLnJlc3VsdHMuZmluZChyID0+IHRlc3RSZXN1bHRJbnRlcm5hbElEcy5nZXQocikgPT09IHJlcS5yZXN1bHRJZCk7XG5cdFx0Y29uc3QgdGVzdCA9IHJlc3VsdHMgJiYgZmluZFRlc3RJblJlc3VsdFNuYXBzaG90KFRlc3RJZC5mcm9tU3RyaW5nKHJlcS5leHRJZCksIHJlc3VsdHM/LnJlc3VsdHMpO1xuXHRcdGlmICghdGVzdCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGxldCBmb2xsb3d1cHM6IHZzY29kZS5Db21tYW5kW10gPSBbXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4udGhpcy5mb2xsb3d1cFByb3ZpZGVyc10ubWFwKGFzeW5jIHByb3ZpZGVyID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHIgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlRm9sbG93dXAocmVzdWx0cywgdGVzdCwgcmVxLnRhc2tJbmRleCwgcmVxLm1lc3NhZ2VJbmRleCwgdG9rZW4pO1xuXHRcdFx0XHRpZiAocikge1xuXHRcdFx0XHRcdGZvbGxvd3VwcyA9IGZvbGxvd3Vwcy5jb25jYXQocik7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciB0aHJvd24gd2hpbGUgcHJvdmlkaW5nIGZvbGxvd3VwIGZvciB0ZXN0IG1lc3NhZ2VgLCBlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZm9sbG93dXBzLm1hcChjb21tYW5kID0+IHtcblx0XHRcdGNvbnN0IGlkID0gZm9sbG93dXBDb3VudGVyKys7XG5cdFx0XHR0aGlzLnRlc3RGb2xsb3d1cHMuc2V0KGlkLCBjb21tYW5kKTtcblx0XHRcdHJldHVybiB7IHRpdGxlOiBjb21tYW5kLnRpdGxlLCBpZCB9O1xuXHRcdH0pO1xuXHR9XG5cblx0JGRpc3Bvc2VUZXN0Rm9sbG93dXBzKGlkOiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaSBvZiBpZCkge1xuXHRcdFx0dGhpcy50ZXN0Rm9sbG93dXBzLmRlbGV0ZShpKTtcblx0XHR9XG5cdH1cblxuXHQkZXhlY3V0ZVRlc3RGb2xsb3d1cChpZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IHRoaXMudGVzdEZvbGxvd3Vwcy5nZXQoaWQpO1xuXHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQuY29tbWFuZCwgLi4uKGNvbW1hbmQuYXJndW1lbnRzIHx8IFtdKSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FuY2VscyBhbiBvbmdvaW5nIHRlc3QgcnVuLlxuXHQgKi9cblx0cHVibGljICRjYW5jZWxFeHRlbnNpb25UZXN0UnVuKHJ1bklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRhc2tJZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHJ1bklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMucnVuVHJhY2tlci5jYW5jZWxBbGxSdW5zKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucnVuVHJhY2tlci5jYW5jZWxSdW5CeUlkKHJ1bklkLCB0YXNrSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHB1YmxpYyBnZXRNZXRhZGF0YUZvclJ1bihydW46IHZzY29kZS5UZXN0UnVuKSB7XG5cdFx0Zm9yIChjb25zdCB0cmFja2VyIG9mIHRoaXMucnVuVHJhY2tlci50cmFja2Vycykge1xuXHRcdFx0Y29uc3QgdGFza0lkID0gdHJhY2tlci5nZXRUYXNrSWRGb3JSdW4ocnVuKTtcblx0XHRcdGlmICh0YXNrSWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgdGFza0lkLCBydW5JZDogdHJhY2tlci5pZCB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJ1bkNvbnRyb2xsZXJUZXN0UmVxdWVzdChyZXE6IElDYWxsUHJvZmlsZVJ1bkhhbmRsZXIgfCBJQ2FsbFByb2ZpbGVSdW5IYW5kbGVyLCBpc0NvbnRpbnVvdXM6IGJvb2xlYW4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVN0YXJ0Q29udHJvbGxlclRlc3RzUmVzdWx0PiB7XG5cdFx0Y29uc3QgbG9va3VwID0gdGhpcy5jb250cm9sbGVycy5nZXQocmVxLmNvbnRyb2xsZXJJZCk7XG5cdFx0aWYgKCFsb29rdXApIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGNvbGxlY3Rpb24sIHByb2ZpbGVzLCBleHRlbnNpb24gfSA9IGxvb2t1cDtcblx0XHRjb25zdCBwcm9maWxlID0gcHJvZmlsZXMuZ2V0KHJlcS5wcm9maWxlSWQpO1xuXHRcdGlmICghcHJvZmlsZSkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGluY2x1ZGVUZXN0cyA9IHJlcS50ZXN0SWRzXG5cdFx0XHQubWFwKCh0ZXN0SWQpID0+IGNvbGxlY3Rpb24udHJlZS5nZXQodGVzdElkKSlcblx0XHRcdC5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdGNvbnN0IGV4Y2x1ZGVUZXN0cyA9IHJlcS5leGNsdWRlRXh0SWRzXG5cdFx0XHQubWFwKGlkID0+IGxvb2t1cC5jb2xsZWN0aW9uLnRyZWUuZ2V0KGlkKSlcblx0XHRcdC5maWx0ZXIoaXNEZWZpbmVkKVxuXHRcdFx0LmZpbHRlcihleGNsdWRlID0+IGluY2x1ZGVUZXN0cy5zb21lKFxuXHRcdFx0XHRpbmNsdWRlID0+IGluY2x1ZGUuZnVsbElkLmNvbXBhcmUoZXhjbHVkZS5mdWxsSWQpID09PSBUZXN0UG9zaXRpb24uSXNDaGlsZCxcblx0XHRcdCkpO1xuXG5cdFx0aWYgKCFpbmNsdWRlVGVzdHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHVibGljUmVxID0gbmV3IFRlc3RSdW5SZXF1ZXN0KFxuXHRcdFx0aW5jbHVkZVRlc3RzLnNvbWUoaSA9PiBpLmFjdHVhbCBpbnN0YW5jZW9mIFRlc3RJdGVtUm9vdEltcGwpID8gdW5kZWZpbmVkIDogaW5jbHVkZVRlc3RzLm1hcCh0ID0+IHQuYWN0dWFsKSxcblx0XHRcdGV4Y2x1ZGVUZXN0cy5tYXAodCA9PiB0LmFjdHVhbCksXG5cdFx0XHRwcm9maWxlLFxuXHRcdFx0aXNDb250aW51b3VzLFxuXHRcdCk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gaXNTdGFydENvbnRyb2xsZXJUZXN0cyhyZXEpICYmIHRoaXMucnVuVHJhY2tlci5wcmVwYXJlRm9yTWFpblRocmVhZFRlc3RSdW4oXG5cdFx0XHRleHRlbnNpb24sXG5cdFx0XHRwdWJsaWNSZXEsXG5cdFx0XHRUZXN0UnVuRHRvLmZyb21JbnRlcm5hbChyZXEsIGxvb2t1cC5jb2xsZWN0aW9uKSxcblx0XHRcdHByb2ZpbGUsXG5cdFx0XHR0b2tlbixcblx0XHQpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHByb2ZpbGUucnVuSGFuZGxlcihwdWJsaWNSZXEsIHRva2VuKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRyZXR1cm4geyBlcnJvcjogU3RyaW5nKGUpIH07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmICh0cmFja2VyKSB7XG5cdFx0XHRcdGlmICh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcyAmJiAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodHJhY2tlci5vbkVuZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLy8gRGVhZGxpbmUgYWZ0ZXIgYmVpbmcgcmVxdWVzdGVkIGJ5IGEgdXNlciB0aGF0IGEgdGVzdCBydW4gaXMgZm9yY2libHkgY2FuY2VsbGVkLlxuY29uc3QgUlVOX0NBTkNFTF9ERUFETElORSA9IDEwXzAwMDtcblxuY29uc3QgZW51bSBUZXN0UnVuVHJhY2tlclN0YXRlIHtcblx0Ly8gRGVmYXVsdCBzdGF0ZVxuXHRSdW5uaW5nLFxuXHQvLyBDYW5jZWxsYXRpb24gaXMgcmVxdWVzdGVkLCBidXQgdGhlIHJ1biBpcyBzdGlsbCBnb2luZy5cblx0Q2FuY2VsbGluZyxcblx0Ly8gQWxsIHRhc2tzIGhhdmUgZW5kZWRcblx0RW5kZWQsXG59XG5cbmNsYXNzIFRlc3RSdW5UcmFja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGUgPSBUZXN0UnVuVHJhY2tlclN0YXRlLlJ1bm5pbmc7XG5cdHByaXZhdGUgcnVubmluZyA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGFza3MgPSBuZXcgTWFwPC8qIHRhc2sgSUQgKi9zdHJpbmcsIHsgY3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTsgcnVuOiB2c2NvZGUuVGVzdFJ1biB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNoYXJlZFRlc3RJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVuZEVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZERpc3Bvc2U6IEV2ZW50PHZvaWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHB1Ymxpc2hlZENvdmVyYWdlID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVwb3J0OiB2c2NvZGUuRmlsZUNvdmVyYWdlOyBleHRJZHM6IHN0cmluZ1tdIH0+KCk7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gYSB0ZXN0IGVuZHMsIGFuZCBubyBtb3JlIHRlc3RzIGFyZSBsZWZ0IHJ1bm5pbmcuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb25FbmQgPSB0aGlzLmVuZEVtaXR0ZXIuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEdldHMgd2hldGhlciB0aGVyZSBhcmUgYW55IHRlc3RzIHJ1bm5pbmcuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGhhc1J1bm5pbmdUYXNrcygpIHtcblx0XHRyZXR1cm4gdGhpcy5ydW5uaW5nID4gMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBydW4gSUQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGlkKCkge1xuXHRcdHJldHVybiB0aGlzLmR0by5pZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZHRvOiBUZXN0UnVuRHRvLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJveHk6IE1haW5UaHJlYWRUZXN0aW5nU2hhcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGU6IHZzY29kZS5UZXN0UnVuUHJvZmlsZSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdHBhcmVudFRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UocGFyZW50VG9rZW4pKTtcblxuXHRcdGNvbnN0IGZvcmNpYmx5RW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5mb3JjaWJseUVuZFRhc2tzKCksIFJVTl9DQU5DRUxfREVBRExJTkUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmN0cy50b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBmb3JjaWJseUVuZC5zY2hlZHVsZSgpKSk7XG5cblx0XHRjb25zdCBkaWREaXNwb3NlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0dGhpcy5vbkRpZERpc3Bvc2UgPSBkaWREaXNwb3NlRW1pdHRlci5ldmVudDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZGlkRGlzcG9zZUVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0ZGlkRGlzcG9zZUVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBHZXRzIHRoZSB0YXNrIElEIGZyb20gYSB0ZXN0IHJ1biBvYmplY3QuICovXG5cdHB1YmxpYyBnZXRUYXNrSWRGb3JSdW4ocnVuOiB2c2NvZGUuVGVzdFJ1bikge1xuXHRcdGZvciAoY29uc3QgW3Rhc2tJZCwgeyBydW46IHIgfV0gb2YgdGhpcy50YXNrcykge1xuXHRcdFx0aWYgKHIgPT09IHJ1bikge1xuXHRcdFx0XHRyZXR1cm4gdGFza0lkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogUmVxdWVzdHMgY2FuY2VsbGF0aW9uIG9mIHRoZSBydW4uIE9uIHRoZSBzZWNvbmQgY2FsbCwgZm9yY2VzIGNhbmNlbGxhdGlvbi4gKi9cblx0cHVibGljIGNhbmNlbCh0YXNrSWQ/OiBzdHJpbmcpIHtcblx0XHRpZiAodGFza0lkKSB7XG5cdFx0XHR0aGlzLnRhc2tzLmdldCh0YXNrSWQpPy5jdHMuY2FuY2VsKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBUZXN0UnVuVHJhY2tlclN0YXRlLlJ1bm5pbmcpIHtcblx0XHRcdHRoaXMuY3RzLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5zdGF0ZSA9IFRlc3RSdW5UcmFja2VyU3RhdGUuQ2FuY2VsbGluZztcblx0XHR9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IFRlc3RSdW5UcmFja2VyU3RhdGUuQ2FuY2VsbGluZykge1xuXHRcdFx0dGhpcy5mb3JjaWJseUVuZFRhc2tzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEdldHMgZGV0YWlscyBmb3IgYSBwcmV2aW91c2x5LWVtaXR0ZWQgY292ZXJhZ2Ugb2JqZWN0LiAqL1xuXHRwdWJsaWMgYXN5bmMgZ2V0Q292ZXJhZ2VEZXRhaWxzKGlkOiBzdHJpbmcsIHRlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5GaWxlQ292ZXJhZ2VEZXRhaWxbXT4ge1xuXHRcdGNvbnN0IFssIHRhc2tJZF0gPSBUZXN0SWQuZnJvbVN0cmluZyhpZCkucGF0aDsgLyoqIHJ1bklkLCB0YXNrSWQsIFVSSSAqL1xuXHRcdGNvbnN0IGNvdmVyYWdlID0gdGhpcy5wdWJsaXNoZWRDb3ZlcmFnZS5nZXQoaWQpO1xuXHRcdGlmICghY292ZXJhZ2UpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHJlcG9ydCwgZXh0SWRzIH0gPSBjb3ZlcmFnZTtcblx0XHRjb25zdCB0YXNrID0gdGhpcy50YXNrcy5nZXQodGFza0lkKTtcblx0XHRpZiAoIXRhc2spIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigndW5yZWFjaGFibGU6IHJ1biB0YXNrIHdhcyBub3QgZm91bmQnKTtcblx0XHR9XG5cblx0XHRsZXQgdGVzdEl0ZW06IHZzY29kZS5UZXN0SXRlbSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGVzdElkICYmIHJlcG9ydCBpbnN0YW5jZW9mIEZpbGVDb3ZlcmFnZSkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBleHRJZHMuaW5kZXhPZih0ZXN0SWQpO1xuXHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4gW107IC8vID8/XG5cdFx0XHR9XG5cdFx0XHR0ZXN0SXRlbSA9IHJlcG9ydC5pbmNsdWRlc1Rlc3RzW2luZGV4XTtcblx0XHR9XG5cblx0XHRjb25zdCBkZXRhaWxzID0gdGVzdEl0ZW1cblx0XHRcdD8gdGhpcy5wcm9maWxlPy5sb2FkRGV0YWlsZWRDb3ZlcmFnZUZvclRlc3Q/Lih0YXNrLnJ1biwgcmVwb3J0LCB0ZXN0SXRlbSwgdG9rZW4pXG5cdFx0XHQ6IHRoaXMucHJvZmlsZT8ubG9hZERldGFpbGVkQ292ZXJhZ2U/Lih0YXNrLnJ1biwgcmVwb3J0LCB0b2tlbik7XG5cblx0XHRyZXR1cm4gKGF3YWl0IGRldGFpbHMpID8/IFtdO1xuXHR9XG5cblx0LyoqIENyZWF0ZXMgdGhlIHB1YmxpYyB0ZXN0IHJ1biBpbnRlcmZhY2UgdG8gZ2l2ZSB0byBleHRlbnNpb25zLiAqL1xuXHRwdWJsaWMgY3JlYXRlUnVuKG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZzY29kZS5UZXN0UnVuIHtcblx0XHRjb25zdCBydW5JZCA9IHRoaXMuZHRvLmlkO1xuXHRcdGNvbnN0IGN0cmxJZCA9IHRoaXMuZHRvLmNvbnRyb2xsZXJJZDtcblx0XHRjb25zdCB0YXNrSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHRcdGNvbnN0IGd1YXJkVGVzdE11dGF0aW9uID0gPEFyZ3MgZXh0ZW5kcyB1bmtub3duW10+KGZuOiAodGVzdDogdnNjb2RlLlRlc3RJdGVtLCAuLi5hcmdzOiBBcmdzKSA9PiB2b2lkKSA9PlxuXHRcdFx0KHRlc3Q6IHZzY29kZS5UZXN0SXRlbSwgLi4uYXJnczogQXJncykgPT4ge1xuXHRcdFx0XHRpZiAoZW5kZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgU2V0dGluZyB0aGUgc3RhdGUgb2YgdGVzdCBcIiR7dGVzdC5pZH1cIiBpcyBhIG5vLW9wIGFmdGVyIHRoZSBydW4gZW5kcy5gKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmVuc3VyZVRlc3RJc0tub3duKHRlc3QpO1xuXHRcdFx0XHRmbih0ZXN0LCAuLi5hcmdzKTtcblx0XHRcdH07XG5cblx0XHRjb25zdCBhcHBlbmRNZXNzYWdlcyA9ICh0ZXN0OiB2c2NvZGUuVGVzdEl0ZW0sIG1lc3NhZ2VzOiB2c2NvZGUuVGVzdE1lc3NhZ2UgfCByZWFkb25seSB2c2NvZGUuVGVzdE1lc3NhZ2VbXSkgPT4ge1xuXHRcdFx0Y29uc3QgY29udmVydGVkID0gbWVzc2FnZXMgaW5zdGFuY2VvZiBBcnJheVxuXHRcdFx0XHQ/IG1lc3NhZ2VzLm1hcChDb252ZXJ0LlRlc3RNZXNzYWdlLmZyb20pXG5cdFx0XHRcdDogW0NvbnZlcnQuVGVzdE1lc3NhZ2UuZnJvbShtZXNzYWdlcyldO1xuXG5cdFx0XHRpZiAodGVzdC51cmkgJiYgdGVzdC5yYW5nZSkge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0TG9jYXRpb246IElMb2NhdGlvbkR0byA9IHsgcmFuZ2U6IENvbnZlcnQuUmFuZ2UuZnJvbSh0ZXN0LnJhbmdlKSwgdXJpOiB0ZXN0LnVyaSB9O1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgY29udmVydGVkKSB7XG5cdFx0XHRcdFx0bWVzc2FnZS5sb2NhdGlvbiA9IG1lc3NhZ2UubG9jYXRpb24gfHwgZGVmYXVsdExvY2F0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucHJveHkuJGFwcGVuZFRlc3RNZXNzYWdlc0luUnVuKHJ1bklkLCB0YXNrSWQsIFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKHRlc3QsIGN0cmxJZCkudG9TdHJpbmcoKSwgY29udmVydGVkKTtcblx0XHR9O1xuXG5cdFx0bGV0IGVuZGVkID0gZmFsc2U7XG5cdFx0Ly8gdGFza3MgYXJlIGFsaXZlIGZvciBhcyBsb25nIGFzIHRoZSB0cmFja2VyIGlzIGFsaXZlLCBzbyBzaW1wbGUgdGhpcy5fcmVnaXN0ZXIgaXMgZmluZTpcblx0XHRjb25zdCBjdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodGhpcy5jdHMudG9rZW4pKTtcblxuXHRcdC8vIG9uZS1vZmYgbWFwIHVzZWQgdG8gYXNzb2NpYXRlIHRlc3QgaXRlbXMgd2l0aCBpbmNyZW1lbnRpbmcgSURzIGluIGBhZGRDb3ZlcmFnZWAuXG5cdFx0Ly8gVGhlcmUncyBubyBuZWVkIHRvIGluY2x1ZGUgdGhlaXIgZW50aXJlIElELCB3ZSBqdXN0IHdhbnQgdG8gbWFrZSBzdXJlIHRoZXkncmVcblx0XHQvLyBzdGFibGUgYW5kIHVuaXF1ZS4gTm9ybWFsIG1hcCBpcyBva2F5IHNpbmNlIFRlc3RSdW4gbGlmZXRpbWVzIGFyZSBsaW1pdGVkLlxuXHRcdGNvbnN0IHJ1bjogdnNjb2RlLlRlc3RSdW4gPSB7XG5cdFx0XHRpc1BlcnNpc3RlZDogdGhpcy5kdG8uaXNQZXJzaXN0ZWQsXG5cdFx0XHR0b2tlbjogY3RzLnRva2VuLFxuXHRcdFx0bmFtZSxcblx0XHRcdG9uRGlkRGlzcG9zZTogdGhpcy5vbkRpZERpc3Bvc2UsXG5cdFx0XHRhZGRDb3ZlcmFnZTogKGNvdmVyYWdlKSA9PiB7XG5cdFx0XHRcdGlmIChlbmRlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGluY2x1ZGVzVGVzdHMgPSBjb3ZlcmFnZSBpbnN0YW5jZW9mIEZpbGVDb3ZlcmFnZSA/IGNvdmVyYWdlLmluY2x1ZGVzVGVzdHMgOiBbXTtcblx0XHRcdFx0aWYgKGluY2x1ZGVzVGVzdHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0ZXN0IG9mIGluY2x1ZGVzVGVzdHMpIHtcblx0XHRcdFx0XHRcdHRoaXMuZW5zdXJlVGVzdElzS25vd24odGVzdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdXJpU3RyID0gY292ZXJhZ2UudXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IGlkID0gbmV3IFRlc3RJZChbcnVuSWQsIHRhc2tJZCwgdXJpU3RyXSkudG9TdHJpbmcoKTtcblx0XHRcdFx0Ly8gaXQncyBhIGxpbCBmdW5reSwgYnV0IGl0J3MgcG9zc2libGUgZm9yIGEgdGVzdCBpdGVtJ3MgSUQgdG8gY2hhbmdlIGFmdGVyXG5cdFx0XHRcdC8vIGl0J3MgYmVlbiByZXBvcnRlZCBpZiBpdCdzIHJlaG9tZWQgdW5kZXIgYSBkaWZmZXJlbnQgcGFyZW50LiBSZWNvcmQgaXRzXG5cdFx0XHRcdC8vIElEIGF0IHRoZSB0aW1lIHdoZW4gdGhlIGNvdmVyYWdlIHJlcG9ydCBpcyBnZW5lcmF0ZWQgc28gd2UgY2FuIHJlZmVyZW5jZVxuXHRcdFx0XHQvLyBpdCBsYXRlciBpZiBuZWVkZWVkLlxuXHRcdFx0XHR0aGlzLnB1Ymxpc2hlZENvdmVyYWdlLnNldChpZCwgeyByZXBvcnQ6IGNvdmVyYWdlLCBleHRJZHM6IGluY2x1ZGVzVGVzdHMubWFwKHQgPT4gVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odCwgY3RybElkKS50b1N0cmluZygpKSB9KTtcblx0XHRcdFx0dGhpcy5wcm94eS4kYXBwZW5kQ292ZXJhZ2UocnVuSWQsIHRhc2tJZCwgQ29udmVydC5UZXN0Q292ZXJhZ2UuZnJvbUZpbGUoY3RybElkLCBpZCwgY292ZXJhZ2UpKTtcblx0XHRcdH0sXG5cdFx0XHQvLyNyZWdpb24gc3RhdGUgbXV0YXRpb25cblx0XHRcdGVucXVldWVkOiBndWFyZFRlc3RNdXRhdGlvbih0ZXN0ID0+IHtcblx0XHRcdFx0dGhpcy5wcm94eS4kdXBkYXRlVGVzdFN0YXRlSW5SdW4ocnVuSWQsIHRhc2tJZCwgVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odGVzdCwgY3RybElkKS50b1N0cmluZygpLCBUZXN0UmVzdWx0U3RhdGUuUXVldWVkKTtcblx0XHRcdH0pLFxuXHRcdFx0c2tpcHBlZDogZ3VhcmRUZXN0TXV0YXRpb24odGVzdCA9PiB7XG5cdFx0XHRcdHRoaXMucHJveHkuJHVwZGF0ZVRlc3RTdGF0ZUluUnVuKHJ1bklkLCB0YXNrSWQsIFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKHRlc3QsIGN0cmxJZCkudG9TdHJpbmcoKSwgVGVzdFJlc3VsdFN0YXRlLlNraXBwZWQpO1xuXHRcdFx0fSksXG5cdFx0XHRzdGFydGVkOiBndWFyZFRlc3RNdXRhdGlvbih0ZXN0ID0+IHtcblx0XHRcdFx0dGhpcy5wcm94eS4kdXBkYXRlVGVzdFN0YXRlSW5SdW4ocnVuSWQsIHRhc2tJZCwgVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odGVzdCwgY3RybElkKS50b1N0cmluZygpLCBUZXN0UmVzdWx0U3RhdGUuUnVubmluZyk7XG5cdFx0XHR9KSxcblx0XHRcdGVycm9yZWQ6IGd1YXJkVGVzdE11dGF0aW9uKCh0ZXN0LCBtZXNzYWdlcywgZHVyYXRpb24pID0+IHtcblx0XHRcdFx0YXBwZW5kTWVzc2FnZXModGVzdCwgbWVzc2FnZXMpO1xuXHRcdFx0XHR0aGlzLnByb3h5LiR1cGRhdGVUZXN0U3RhdGVJblJ1bihydW5JZCwgdGFza0lkLCBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbSh0ZXN0LCBjdHJsSWQpLnRvU3RyaW5nKCksIFRlc3RSZXN1bHRTdGF0ZS5FcnJvcmVkLCBkdXJhdGlvbik7XG5cdFx0XHR9KSxcblx0XHRcdGZhaWxlZDogZ3VhcmRUZXN0TXV0YXRpb24oKHRlc3QsIG1lc3NhZ2VzLCBkdXJhdGlvbikgPT4ge1xuXHRcdFx0XHRhcHBlbmRNZXNzYWdlcyh0ZXN0LCBtZXNzYWdlcyk7XG5cdFx0XHRcdHRoaXMucHJveHkuJHVwZGF0ZVRlc3RTdGF0ZUluUnVuKHJ1bklkLCB0YXNrSWQsIFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKHRlc3QsIGN0cmxJZCkudG9TdHJpbmcoKSwgVGVzdFJlc3VsdFN0YXRlLkZhaWxlZCwgZHVyYXRpb24pO1xuXHRcdFx0fSksXG5cdFx0XHRwYXNzZWQ6IGd1YXJkVGVzdE11dGF0aW9uKCh0ZXN0LCBkdXJhdGlvbikgPT4ge1xuXHRcdFx0XHR0aGlzLnByb3h5LiR1cGRhdGVUZXN0U3RhdGVJblJ1bihydW5JZCwgdGFza0lkLCBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbSh0ZXN0LCB0aGlzLmR0by5jb250cm9sbGVySWQpLnRvU3RyaW5nKCksIFRlc3RSZXN1bHRTdGF0ZS5QYXNzZWQsIGR1cmF0aW9uKTtcblx0XHRcdH0pLFxuXHRcdFx0Ly8jZW5kcmVnaW9uXG5cdFx0XHRhcHBlbmRPdXRwdXQ6IChvdXRwdXQsIGxvY2F0aW9uPzogdnNjb2RlLkxvY2F0aW9uLCB0ZXN0PzogdnNjb2RlLlRlc3RJdGVtKSA9PiB7XG5cdFx0XHRcdGlmIChlbmRlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0ZXN0KSB7XG5cdFx0XHRcdFx0dGhpcy5lbnN1cmVUZXN0SXNLbm93bih0ZXN0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMucHJveHkuJGFwcGVuZE91dHB1dFRvUnVuKFxuXHRcdFx0XHRcdHJ1bklkLFxuXHRcdFx0XHRcdHRhc2tJZCxcblx0XHRcdFx0XHRWU0J1ZmZlci5mcm9tU3RyaW5nKG91dHB1dCksXG5cdFx0XHRcdFx0bG9jYXRpb24gJiYgQ29udmVydC5sb2NhdGlvbi5mcm9tKGxvY2F0aW9uKSxcblx0XHRcdFx0XHR0ZXN0ICYmIFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKHRlc3QsIGN0cmxJZCkudG9TdHJpbmcoKSxcblx0XHRcdFx0KTtcblx0XHRcdH0sXG5cdFx0XHRlbmQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKGVuZGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZW5kZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnByb3h5LiRmaW5pc2hlZFRlc3RSdW5UYXNrKHJ1bklkLCB0YXNrSWQpO1xuXHRcdFx0XHRpZiAoIS0tdGhpcy5ydW5uaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5tYXJrRW5kZWQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLnJ1bm5pbmcrKztcblx0XHR0aGlzLnRhc2tzLnNldCh0YXNrSWQsIHsgcnVuLCBjdHMgfSk7XG5cdFx0dGhpcy5wcm94eS4kc3RhcnRlZFRlc3RSdW5UYXNrKHJ1bklkLCB7XG5cdFx0XHRpZDogdGFza0lkLFxuXHRcdFx0Y3RybElkOiB0aGlzLmR0by5jb250cm9sbGVySWQsXG5cdFx0XHRuYW1lOiBuYW1lIHx8IHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRydW5uaW5nOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJ1bjtcblx0fVxuXG5cdHByaXZhdGUgZm9yY2libHlFbmRUYXNrcygpIHtcblx0XHRmb3IgKGNvbnN0IHsgcnVuIH0gb2YgdGhpcy50YXNrcy52YWx1ZXMoKSkge1xuXHRcdFx0cnVuLmVuZCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbWFya0VuZGVkKCkge1xuXHRcdGlmICh0aGlzLnN0YXRlICE9PSBUZXN0UnVuVHJhY2tlclN0YXRlLkVuZGVkKSB7XG5cdFx0XHR0aGlzLnN0YXRlID0gVGVzdFJ1blRyYWNrZXJTdGF0ZS5FbmRlZDtcblx0XHRcdHRoaXMuZW5kRW1pdHRlci5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVUZXN0SXNLbm93bih0ZXN0OiB2c2NvZGUuVGVzdEl0ZW0pIHtcblx0XHRpZiAoISh0ZXN0IGluc3RhbmNlb2YgVGVzdEl0ZW1JbXBsKSkge1xuXHRcdFx0dGhyb3cgbmV3IEludmFsaWRUZXN0SXRlbUVycm9yKHRlc3QuaWQpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNoYXJlZFRlc3RJZHMuaGFzKFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKHRlc3QsIHRoaXMuZHRvLmNvbnRyb2xsZXJJZCkudG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGFpbjogSVRlc3RJdGVtLlNlcmlhbGl6ZWRbXSA9IFtdO1xuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLmR0by5jb2xsbGVjdGlvbi5yb290O1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBjb252ZXJ0ZWQgPSBDb252ZXJ0LlRlc3RJdGVtLmZyb20odGVzdCBhcyBUZXN0SXRlbUltcGwpO1xuXHRcdFx0Y2hhaW4udW5zaGlmdChjb252ZXJ0ZWQpO1xuXG5cdFx0XHRpZiAodGhpcy5zaGFyZWRUZXN0SWRzLmhhcyhjb252ZXJ0ZWQuZXh0SWQpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNoYXJlZFRlc3RJZHMuYWRkKGNvbnZlcnRlZC5leHRJZCk7XG5cdFx0XHRpZiAodGVzdCA9PT0gcm9vdCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0dGVzdCA9IHRlc3QucGFyZW50IHx8IHJvb3Q7XG5cdFx0fVxuXG5cdFx0dGhpcy5wcm94eS4kYWRkVGVzdHNUb1J1bih0aGlzLmR0by5jb250cm9sbGVySWQsIHRoaXMuZHRvLmlkLCBjaGFpbik7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLm1hcmtFbmRlZCgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIFF1ZXVlcyBydW5zIGZvciBhIHNpbmdsZSBleHRlbnNpb24gYW5kIHByb3ZpZGVzIHRoZSBjdXJyZW50bHktZXhlY3V0aW5nXG4gKiBydW4gc28gdGhhdCBgY3JlYXRlVGVzdFJ1bmAgY2FuIGJlIHByb3Blcmx5IGNvcnJlbGF0ZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXN0UnVuQ29vcmRpbmF0b3Ige1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyYWNrZWQgPSBuZXcgTWFwPHZzY29kZS5UZXN0UnVuUmVxdWVzdCwgVGVzdFJ1blRyYWNrZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJhY2tlZEJ5SWQgPSBuZXcgTWFwPHN0cmluZywgVGVzdFJ1blRyYWNrZXI+KCk7XG5cblx0cHVibGljIGdldCB0cmFja2VycygpIHtcblx0XHRyZXR1cm4gdGhpcy50cmFja2VkLnZhbHVlcygpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm94eTogTWFpblRocmVhZFRlc3RpbmdTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdC8qKlxuXHQgKiBHZXRzIGEgY292ZXJhZ2UgcmVwb3J0IGZvciBhIGdpdmVuIHJ1biBhbmQgdGFzayBJRC5cblx0ICovXG5cdHB1YmxpYyBnZXRDb3ZlcmFnZURldGFpbHMoaWQ6IHN0cmluZywgdGVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRjb25zdCBydW5JZCA9IFRlc3RJZC5yb290KGlkKTtcblx0XHRyZXR1cm4gdGhpcy50cmFja2VkQnlJZC5nZXQocnVuSWQpPy5nZXRDb3ZlcmFnZURldGFpbHMoaWQsIHRlc3RJZCwgdG9rZW4pIHx8IFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2VzIHRoZSB0ZXN0IHJ1biwgY2FsbGVkIHdoZW4gdGhlIG1haW4gdGhyZWFkIGlzIG5vIGxvbmdlciBpbnRlcmVzdGVkXG5cdCAqIGluIGFzc29jaWF0ZWQgZGF0YS5cblx0ICovXG5cdHB1YmxpYyBkaXNwb3NlVGVzdFJ1bihydW5JZDogc3RyaW5nKSB7XG5cdFx0dGhpcy50cmFja2VkQnlJZC5nZXQocnVuSWQpPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy50cmFja2VkQnlJZC5kZWxldGUocnVuSWQpO1xuXHRcdGZvciAoY29uc3QgW3JlcSwgeyBpZCB9XSBvZiB0aGlzLnRyYWNrZWQpIHtcblx0XHRcdGlmIChpZCA9PT0gcnVuSWQpIHtcblx0XHRcdFx0dGhpcy50cmFja2VkLmRlbGV0ZShyZXEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSByZXF1ZXN0IGFzIGJlaW5nIGludm9rZWQgYnkgdGhlIG1haW4gdGhyZWFkLCBzb1xuXHQgKiBgJHN0YXJ0ZWRFeHRlbnNpb25UZXN0UnVuYCBpcyBub3QgaW52b2tlZC4gVGhlIHJ1biBtdXN0IGV2ZW50dWFsbHlcblx0ICogYmUgY2FuY2VsbGVkIG1hbnVhbGx5LlxuXHQgKi9cblx0cHVibGljIHByZXBhcmVGb3JNYWluVGhyZWFkVGVzdFJ1bihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgcmVxOiB2c2NvZGUuVGVzdFJ1blJlcXVlc3QsIGR0bzogVGVzdFJ1bkR0bywgcHJvZmlsZTogdnNjb2RlLlRlc3RSdW5Qcm9maWxlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRUcmFja2VyKHJlcSwgZHRvLCBwcm9maWxlLCBleHRlbnNpb24sIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWxzIGFuIGV4aXN0aW5nIHRlc3QgcnVuIHZpYSBpdHMgY2FuY2VsbGF0aW9uIHRva2VuLlxuXHQgKi9cblx0cHVibGljIGNhbmNlbFJ1bkJ5SWQocnVuSWQ6IHN0cmluZywgdGFza0lkPzogc3RyaW5nKSB7XG5cdFx0dGhpcy50cmFja2VkQnlJZC5nZXQocnVuSWQpPy5jYW5jZWwodGFza0lkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWxzIGFuIGV4aXN0aW5nIHRlc3QgcnVuIHZpYSBpdHMgY2FuY2VsbGF0aW9uIHRva2VuLlxuXHQgKi9cblx0cHVibGljIGNhbmNlbEFsbFJ1bnMoKSB7XG5cdFx0Zm9yIChjb25zdCB0cmFja2VyIG9mIHRoaXMudHJhY2tlZC52YWx1ZXMoKSkge1xuXHRcdFx0dHJhY2tlci5jYW5jZWwoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSW1wbGVtZW50cyB0aGUgcHVibGljIGBjcmVhdGVUZXN0UnVuYCBBUEkuXG5cdCAqL1xuXHRwdWJsaWMgY3JlYXRlVGVzdFJ1bihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgY29udHJvbGxlcklkOiBzdHJpbmcsIGNvbGxlY3Rpb246IEV4dEhvc3RUZXN0SXRlbUNvbGxlY3Rpb24sIHJlcXVlc3Q6IHZzY29kZS5UZXN0UnVuUmVxdWVzdCwgbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBwZXJzaXN0OiBib29sZWFuKTogdnNjb2RlLlRlc3RSdW4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy50cmFja2VkLmdldChyZXF1ZXN0KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZy5jcmVhdGVSdW4obmFtZSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgbm90IGFuIGV4aXN0aW5nIHRyYWNrZWQgZXh0ZW5zaW9uIGZvciB0aGUgcmVxdWVzdCwgc3RhcnRcblx0XHQvLyBhIG5ldywgZGV0YWNoZWQgc2Vzc2lvbi5cblx0XHRjb25zdCBkdG8gPSBUZXN0UnVuRHRvLmZyb21QdWJsaWMoY29udHJvbGxlcklkLCBjb2xsZWN0aW9uLCByZXF1ZXN0LCBwZXJzaXN0KTtcblx0XHRjb25zdCBwcm9maWxlID0gdHJ5R2V0UHJvZmlsZUZyb21UZXN0UnVuUmVxKHJlcXVlc3QpO1xuXHRcdHRoaXMucHJveHkuJHN0YXJ0ZWRFeHRlbnNpb25UZXN0UnVuKHtcblx0XHRcdGNvbnRyb2xsZXJJZCxcblx0XHRcdGNvbnRpbnVvdXM6ICEhcmVxdWVzdC5jb250aW51b3VzLFxuXHRcdFx0cHJvZmlsZTogcHJvZmlsZSAmJiB7IGdyb3VwOiBDb252ZXJ0LlRlc3RSdW5Qcm9maWxlS2luZC5mcm9tKHByb2ZpbGUua2luZCksIGlkOiBwcm9maWxlLnByb2ZpbGVJZCB9LFxuXHRcdFx0ZXhjbHVkZTogcmVxdWVzdC5leGNsdWRlPy5tYXAodCA9PiBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbSh0LCBjb2xsZWN0aW9uLnJvb3QuaWQpLnRvU3RyaW5nKCkpID8/IFtdLFxuXHRcdFx0aWQ6IGR0by5pZCxcblx0XHRcdGluY2x1ZGU6IHJlcXVlc3QuaW5jbHVkZT8ubWFwKHQgPT4gVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odCwgY29sbGVjdGlvbi5yb290LmlkKS50b1N0cmluZygpKSA/PyBbY29sbGVjdGlvbi5yb290LmlkXSxcblx0XHRcdHByZXNlcnZlRm9jdXM6IHJlcXVlc3QucHJlc2VydmVGb2N1cyA/PyB0cnVlLFxuXHRcdFx0cGVyc2lzdFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJhY2tlciA9IHRoaXMuZ2V0VHJhY2tlcihyZXF1ZXN0LCBkdG8sIHJlcXVlc3QucHJvZmlsZSwgZXh0ZW5zaW9uKTtcblx0XHRFdmVudC5vbmNlKHRyYWNrZXIub25FbmQpKCgpID0+IHtcblx0XHRcdHRoaXMucHJveHkuJGZpbmlzaGVkRXh0ZW5zaW9uVGVzdFJ1bihkdG8uaWQpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRyYWNrZXIuY3JlYXRlUnVuKG5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUcmFja2VyKHJlcTogdnNjb2RlLlRlc3RSdW5SZXF1ZXN0LCBkdG86IFRlc3RSdW5EdG8sIHByb2ZpbGU6IHZzY29kZS5UZXN0UnVuUHJvZmlsZSB8IHVuZGVmaW5lZCwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRjb25zdCB0cmFja2VyID0gbmV3IFRlc3RSdW5UcmFja2VyKGR0bywgdGhpcy5wcm94eSwgdGhpcy5sb2dTZXJ2aWNlLCBwcm9maWxlLCBleHRlbnNpb24sIHRva2VuKTtcblx0XHR0aGlzLnRyYWNrZWQuc2V0KHJlcSwgdHJhY2tlcik7XG5cdFx0dGhpcy50cmFja2VkQnlJZC5zZXQodHJhY2tlci5pZCwgdHJhY2tlcik7XG5cdFx0cmV0dXJuIHRyYWNrZXI7XG5cdH1cbn1cblxuY29uc3QgdHJ5R2V0UHJvZmlsZUZyb21UZXN0UnVuUmVxID0gKHJlcXVlc3Q6IHZzY29kZS5UZXN0UnVuUmVxdWVzdCkgPT4ge1xuXHRpZiAoIXJlcXVlc3QucHJvZmlsZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpZiAoIShyZXF1ZXN0LnByb2ZpbGUgaW5zdGFuY2VvZiBUZXN0UnVuUHJvZmlsZUltcGwpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBUZXN0UnVuUmVxdWVzdC5wcm9maWxlIGlzIG5vdCBhbiBpbnN0YW5jZSBjcmVhdGVkIGZyb20gVGVzdENvbnRyb2xsZXIuY3JlYXRlUnVuUHJvZmlsZWApO1xuXHR9XG5cblx0cmV0dXJuIHJlcXVlc3QucHJvZmlsZTtcbn07XG5cbmV4cG9ydCBjbGFzcyBUZXN0UnVuRHRvIHtcblx0cHVibGljIHN0YXRpYyBmcm9tUHVibGljKGNvbnRyb2xsZXJJZDogc3RyaW5nLCBjb2xsZWN0aW9uOiBFeHRIb3N0VGVzdEl0ZW1Db2xsZWN0aW9uLCByZXF1ZXN0OiB2c2NvZGUuVGVzdFJ1blJlcXVlc3QsIHBlcnNpc3Q6IGJvb2xlYW4pIHtcblx0XHRyZXR1cm4gbmV3IFRlc3RSdW5EdG8oXG5cdFx0XHRjb250cm9sbGVySWQsXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdHBlcnNpc3QsXG5cdFx0XHRjb2xsZWN0aW9uLFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZyb21JbnRlcm5hbChyZXF1ZXN0OiBJU3RhcnRDb250cm9sbGVyVGVzdHMsIGNvbGxlY3Rpb246IEV4dEhvc3RUZXN0SXRlbUNvbGxlY3Rpb24pIHtcblx0XHRyZXR1cm4gbmV3IFRlc3RSdW5EdG8oXG5cdFx0XHRyZXF1ZXN0LmNvbnRyb2xsZXJJZCxcblx0XHRcdHJlcXVlc3QucnVuSWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0Y29sbGVjdGlvbixcblx0XHQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGNvbnRyb2xsZXJJZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBpc1BlcnNpc3RlZDogYm9vbGVhbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29sbGxlY3Rpb246IEV4dEhvc3RUZXN0SXRlbUNvbGxlY3Rpb24sXG5cdCkge1xuXHR9XG59XG5cbi8qKlxuICogQHByaXZhdGVcbiAqL1xuaW50ZXJmYWNlIE1pcnJvcmVkQ29sbGVjdGlvblRlc3RJdGVtIGV4dGVuZHMgSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0ge1xuXHRyZXZpdmVkOiB2c2NvZGUuVGVzdEl0ZW07XG5cdGRlcHRoOiBudW1iZXI7XG59XG5cbmNsYXNzIE1pcnJvcmVkQ2hhbmdlQ29sbGVjdG9yIGltcGxlbWVudHMgSW5jcmVtZW50YWxDaGFuZ2VDb2xsZWN0b3I8TWlycm9yZWRDb2xsZWN0aW9uVGVzdEl0ZW0+IHtcblx0cHJpdmF0ZSByZWFkb25seSBhZGRlZCA9IG5ldyBTZXQ8TWlycm9yZWRDb2xsZWN0aW9uVGVzdEl0ZW0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlZCA9IG5ldyBTZXQ8TWlycm9yZWRDb2xsZWN0aW9uVGVzdEl0ZW0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVtb3ZlZCA9IG5ldyBTZXQ8TWlycm9yZWRDb2xsZWN0aW9uVGVzdEl0ZW0+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhbHJlYWR5UmVtb3ZlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHB1YmxpYyBnZXQgaXNFbXB0eSgpIHtcblx0XHRyZXR1cm4gdGhpcy5hZGRlZC5zaXplID09PSAwICYmIHRoaXMucmVtb3ZlZC5zaXplID09PSAwICYmIHRoaXMudXBkYXRlZC5zaXplID09PSAwO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBlbWl0dGVyOiBFbWl0dGVyPHZzY29kZS5UZXN0c0NoYW5nZUV2ZW50Pikge1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgYWRkKG5vZGU6IE1pcnJvcmVkQ29sbGVjdGlvblRlc3RJdGVtKTogdm9pZCB7XG5cdFx0dGhpcy5hZGRlZC5hZGQobm9kZSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyB1cGRhdGUobm9kZTogTWlycm9yZWRDb2xsZWN0aW9uVGVzdEl0ZW0pOiB2b2lkIHtcblx0XHRPYmplY3QuYXNzaWduKG5vZGUucmV2aXZlZCwgQ29udmVydC5UZXN0SXRlbS50b1BsYWluKG5vZGUuaXRlbSkpO1xuXHRcdGlmICghdGhpcy5hZGRlZC5oYXMobm9kZSkpIHtcblx0XHRcdHRoaXMudXBkYXRlZC5hZGQobm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVtb3ZlKG5vZGU6IE1pcnJvcmVkQ29sbGVjdGlvblRlc3RJdGVtKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYWRkZWQuZGVsZXRlKG5vZGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVkLmRlbGV0ZShub2RlKTtcblxuXHRcdGNvbnN0IHBhcmVudElkID0gVGVzdElkLnBhcmVudElkKG5vZGUuaXRlbS5leHRJZCk7XG5cdFx0aWYgKHBhcmVudElkICYmIHRoaXMuYWxyZWFkeVJlbW92ZWQuaGFzKHBhcmVudElkLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHR0aGlzLmFscmVhZHlSZW1vdmVkLmFkZChub2RlLml0ZW0uZXh0SWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVtb3ZlZC5hZGQobm9kZSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBnZXRDaGFuZ2VFdmVudCgpOiB2c2NvZGUuVGVzdHNDaGFuZ2VFdmVudCB7XG5cdFx0Y29uc3QgeyBhZGRlZCwgdXBkYXRlZCwgcmVtb3ZlZCB9ID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0IGFkZGVkKCkgeyByZXR1cm4gWy4uLmFkZGVkXS5tYXAobiA9PiBuLnJldml2ZWQpOyB9LFxuXHRcdFx0Z2V0IHVwZGF0ZWQoKSB7IHJldHVybiBbLi4udXBkYXRlZF0ubWFwKG4gPT4gbi5yZXZpdmVkKTsgfSxcblx0XHRcdGdldCByZW1vdmVkKCkgeyByZXR1cm4gWy4uLnJlbW92ZWRdLm1hcChuID0+IG4ucmV2aXZlZCk7IH0sXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBjb21wbGV0ZSgpIHtcblx0XHRpZiAoIXRoaXMuaXNFbXB0eSkge1xuXHRcdFx0dGhpcy5lbWl0dGVyLmZpcmUodGhpcy5nZXRDaGFuZ2VFdmVudCgpKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBNYWludGFpbnMgdGVzdHMgaW4gdGhpcyBleHRlbnNpb24gaG9zdCBzZW50IGZyb20gdGhlIG1haW4gdGhyZWFkLlxuICogQHByaXZhdGVcbiAqL1xuY2xhc3MgTWlycm9yZWRUZXN0Q29sbGVjdGlvbiBleHRlbmRzIEFic3RyYWN0SW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbjxNaXJyb3JlZENvbGxlY3Rpb25UZXN0SXRlbT4ge1xuXHRwcml2YXRlIGNoYW5nZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGVzdHNDaGFuZ2VFdmVudD4oKTtcblxuXHQvKipcblx0ICogQ2hhbmdlIGVtaXR0ZXIgdGhhdCBmaXJlcyB3aXRoIHRoZSBzYW1lIHNlbWFudGljcyBhcyBgVGVzdE9ic2VydmVyLm9uRGlkQ2hhbmdlVGVzdHNgLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGVzdHMgPSB0aGlzLmNoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEdldHMgYSBsaXN0IG9mIHJvb3QgdGVzdCBpdGVtcy5cblx0ICovXG5cdHB1YmxpYyBnZXQgcm9vdFRlc3RzKCkge1xuXHRcdHJldHVybiB0aGlzLnJvb3RzO1xuXHR9XG5cblx0LyoqXG5cdCAqXG5cdCAqIElmIHRoZSB0ZXN0IElEIGV4aXN0cywgcmV0dXJucyBpdHMgdW5kZXJseWluZyBJRC5cblx0ICovXG5cdHB1YmxpYyBnZXRNaXJyb3JlZFRlc3REYXRhQnlJZChpdGVtSWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zLmdldChpdGVtSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIElmIHRoZSB0ZXN0IGl0ZW0gaXMgYSBtaXJyb3JlZCB0ZXN0IGl0ZW0sIHJldHVybnMgaXRzIHVuZGVybHlpbmcgSUQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0TWlycm9yZWRUZXN0RGF0YUJ5UmVmZXJlbmNlKGl0ZW06IHZzY29kZS5UZXN0SXRlbSkge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zLmdldChpdGVtLmlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHByb3RlY3RlZCBjcmVhdGVJdGVtKGl0ZW06IEludGVybmFsVGVzdEl0ZW0sIHBhcmVudD86IE1pcnJvcmVkQ29sbGVjdGlvblRlc3RJdGVtKTogTWlycm9yZWRDb2xsZWN0aW9uVGVzdEl0ZW0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5pdGVtLFxuXHRcdFx0Ly8gdG9kb0Bjb25ub3I0MzEyOiBtYWtlIHRoaXMgd29yayB3ZWxsIGFnYWluIHdpdGggY2hpbGRyZW5cblx0XHRcdHJldml2ZWQ6IENvbnZlcnQuVGVzdEl0ZW0udG9QbGFpbihpdGVtLml0ZW0pIGFzIHZzY29kZS5UZXN0SXRlbSxcblx0XHRcdGRlcHRoOiBwYXJlbnQgPyBwYXJlbnQuZGVwdGggKyAxIDogMCxcblx0XHRcdGNoaWxkcmVuOiBuZXcgU2V0KCksXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVDaGFuZ2VDb2xsZWN0b3IoKSB7XG5cdFx0cmV0dXJuIG5ldyBNaXJyb3JlZENoYW5nZUNvbGxlY3Rvcih0aGlzLmNoYW5nZUVtaXR0ZXIpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RPYnNlcnZlcnMge1xuXHRwcml2YXRlIGN1cnJlbnQ/OiB7XG5cdFx0b2JzZXJ2ZXJzOiBudW1iZXI7XG5cdFx0dGVzdHM6IE1pcnJvcmVkVGVzdENvbGxlY3Rpb247XG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm94eTogTWFpblRocmVhZFRlc3RpbmdTaGFwZSxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgY2hlY2tvdXQoKTogdnNjb2RlLlRlc3RPYnNlcnZlciB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnQpIHtcblx0XHRcdHRoaXMuY3VycmVudCA9IHRoaXMuY3JlYXRlT2JzZXJ2ZXJEYXRhKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuY3VycmVudDtcblx0XHRjdXJyZW50Lm9ic2VydmVycysrO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGlkQ2hhbmdlVGVzdDogY3VycmVudC50ZXN0cy5vbkRpZENoYW5nZVRlc3RzLFxuXHRcdFx0Z2V0IHRlc3RzKCkgeyByZXR1cm4gWy4uLmN1cnJlbnQudGVzdHMucm9vdFRlc3RzXS5tYXAodCA9PiB0LnJldml2ZWQpOyB9LFxuXHRcdFx0ZGlzcG9zZTogY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uKCgpID0+IHtcblx0XHRcdFx0aWYgKC0tY3VycmVudC5vYnNlcnZlcnMgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLnByb3h5LiR1bnN1YnNjcmliZUZyb21EaWZmcygpO1xuXHRcdFx0XHRcdHRoaXMuY3VycmVudCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBpbnRlcm5hbCB0ZXN0IGRhdGEgYnkgaXRzIHJlZmVyZW5jZS5cblx0ICovXG5cdHB1YmxpYyBnZXRNaXJyb3JlZFRlc3REYXRhQnlSZWZlcmVuY2UocmVmOiB2c2NvZGUuVGVzdEl0ZW0pIHtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50Py50ZXN0cy5nZXRNaXJyb3JlZFRlc3REYXRhQnlSZWZlcmVuY2UocmVmKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBsaWVzIHRlc3QgZGlmZnMgdG8gdGhlIGN1cnJlbnQgc2V0IG9mIG9ic2VydmVkIHRlc3RzLlxuXHQgKi9cblx0cHVibGljIGFwcGx5RGlmZihkaWZmOiBUZXN0c0RpZmYpIHtcblx0XHR0aGlzLmN1cnJlbnQ/LnRlc3RzLmFwcGx5KGRpZmYpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVPYnNlcnZlckRhdGEoKSB7XG5cdFx0Y29uc3QgdGVzdHMgPSBuZXcgTWlycm9yZWRUZXN0Q29sbGVjdGlvbih7IGFzQ2Fub25pY2FsVXJpOiB1ID0+IHUgfSk7XG5cdFx0dGhpcy5wcm94eS4kc3Vic2NyaWJlVG9EaWZmcygpO1xuXHRcdHJldHVybiB7IG9ic2VydmVyczogMCwgdGVzdHMsIH07XG5cdH1cbn1cblxuY29uc3QgdXBkYXRlUHJvZmlsZSA9IChpbXBsOiBUZXN0UnVuUHJvZmlsZUltcGwsIHByb3h5OiBNYWluVGhyZWFkVGVzdGluZ1NoYXBlLCBpbml0aWFsOiBJVGVzdFJ1blByb2ZpbGUgfCB1bmRlZmluZWQsIHVwZGF0ZTogUGFydGlhbDxJVGVzdFJ1blByb2ZpbGU+KSA9PiB7XG5cdGlmIChpbml0aWFsKSB7XG5cdFx0T2JqZWN0LmFzc2lnbihpbml0aWFsLCB1cGRhdGUpO1xuXHR9IGVsc2Uge1xuXHRcdHByb3h5LiR1cGRhdGVUZXN0UnVuQ29uZmlnKGltcGwuY29udHJvbGxlcklkLCBpbXBsLnByb2ZpbGVJZCwgdXBkYXRlKTtcblx0fVxufTtcblxuZXhwb3J0IGNsYXNzIFRlc3RSdW5Qcm9maWxlSW1wbCBleHRlbmRzIFRlc3RSdW5Qcm9maWxlQmFzZSBpbXBsZW1lbnRzIHZzY29kZS5UZXN0UnVuUHJvZmlsZSB7XG5cdHJlYWRvbmx5ICNwcm94eTogTWFpblRocmVhZFRlc3RpbmdTaGFwZTtcblx0cmVhZG9ubHkgI2FjdGl2ZVByb2ZpbGVzOiBTZXQ8bnVtYmVyPjtcblx0cmVhZG9ubHkgI29uRGlkQ2hhbmdlRGVmYXVsdFByb2ZpbGVzOiBFdmVudDxEZWZhdWx0UHJvZmlsZUNoYW5nZUV2ZW50Pjtcblx0I2luaXRpYWxQdWJsaXNoPzogSVRlc3RSdW5Qcm9maWxlO1xuXHQjcHJvZmlsZXM/OiBNYXA8bnVtYmVyLCB2c2NvZGUuVGVzdFJ1blByb2ZpbGU+O1xuXHRwcml2YXRlIF9jb25maWd1cmVIYW5kbGVyPzogKCgpID0+IHZvaWQpO1xuXG5cdHB1YmxpYyBnZXQgbGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhYmVsO1xuXHR9XG5cblx0cHVibGljIHNldCBsYWJlbChsYWJlbDogc3RyaW5nKSB7XG5cdFx0aWYgKGxhYmVsICE9PSB0aGlzLl9sYWJlbCkge1xuXHRcdFx0dGhpcy5fbGFiZWwgPSBsYWJlbDtcblx0XHRcdHVwZGF0ZVByb2ZpbGUodGhpcywgdGhpcy4jcHJveHksIHRoaXMuI2luaXRpYWxQdWJsaXNoLCB7IGxhYmVsIH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgc3VwcG9ydHNDb250aW51b3VzUnVuKCkge1xuXHRcdHJldHVybiB0aGlzLl9zdXBwb3J0c0NvbnRpbnVvdXNSdW47XG5cdH1cblxuXHRwdWJsaWMgc2V0IHN1cHBvcnRzQ29udGludW91c1J1bihzdXBwb3J0czogYm9vbGVhbikge1xuXHRcdGlmIChzdXBwb3J0cyAhPT0gdGhpcy5fc3VwcG9ydHNDb250aW51b3VzUnVuKSB7XG5cdFx0XHR0aGlzLl9zdXBwb3J0c0NvbnRpbnVvdXNSdW4gPSBzdXBwb3J0cztcblx0XHRcdHVwZGF0ZVByb2ZpbGUodGhpcywgdGhpcy4jcHJveHksIHRoaXMuI2luaXRpYWxQdWJsaXNoLCB7IHN1cHBvcnRzQ29udGludW91c1J1bjogc3VwcG9ydHMgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCBpc0RlZmF1bHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuI2FjdGl2ZVByb2ZpbGVzLmhhcyh0aGlzLnByb2ZpbGVJZCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0IGlzRGVmYXVsdChpc0RlZmF1bHQ6IGJvb2xlYW4pIHtcblx0XHRpZiAoaXNEZWZhdWx0ICE9PSB0aGlzLmlzRGVmYXVsdCkge1xuXHRcdFx0Ly8gI2FjdGl2ZVByb2ZpbGVzIGlzIHN5bmNlZCBmcm9tIHRoZSBtYWluIHRocmVhZCwgc28gd2UgY2FuIG1ha2Vcblx0XHRcdC8vIHByb3Zpc2lvbmFsIGNoYW5nZXMgaGVyZSB0aGF0IHdpbGwgZ2V0IGNvbmZpcm1lZCBtb21lbnRhcmlseVxuXHRcdFx0aWYgKGlzRGVmYXVsdCkge1xuXHRcdFx0XHR0aGlzLiNhY3RpdmVQcm9maWxlcy5hZGQodGhpcy5wcm9maWxlSWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy4jYWN0aXZlUHJvZmlsZXMuZGVsZXRlKHRoaXMucHJvZmlsZUlkKTtcblx0XHRcdH1cblxuXHRcdFx0dXBkYXRlUHJvZmlsZSh0aGlzLCB0aGlzLiNwcm94eSwgdGhpcy4jaW5pdGlhbFB1Ymxpc2gsIHsgaXNEZWZhdWx0IH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgdGFnKCkge1xuXHRcdHJldHVybiB0aGlzLl90YWc7XG5cdH1cblxuXHRwdWJsaWMgc2V0IHRhZyh0YWc6IHZzY29kZS5UZXN0VGFnIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRhZz8uaWQgIT09IHRoaXMuX3RhZz8uaWQpIHtcblx0XHRcdHRoaXMuX3RhZyA9IHRhZztcblx0XHRcdHVwZGF0ZVByb2ZpbGUodGhpcywgdGhpcy4jcHJveHksIHRoaXMuI2luaXRpYWxQdWJsaXNoLCB7XG5cdFx0XHRcdHRhZzogdGFnID8gQ29udmVydC5UZXN0VGFnLm5hbWVzcGFjZSh0aGlzLmNvbnRyb2xsZXJJZCwgdGFnLmlkKSA6IG51bGwsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvbmZpZ3VyZUhhbmRsZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyZUhhbmRsZXI7XG5cdH1cblxuXHRwdWJsaWMgc2V0IGNvbmZpZ3VyZUhhbmRsZXIoaGFuZGxlcjogdW5kZWZpbmVkIHwgKCgpID0+IHZvaWQpKSB7XG5cdFx0aWYgKGhhbmRsZXIgIT09IHRoaXMuX2NvbmZpZ3VyZUhhbmRsZXIpIHtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyZUhhbmRsZXIgPSBoYW5kbGVyO1xuXHRcdFx0dXBkYXRlUHJvZmlsZSh0aGlzLCB0aGlzLiNwcm94eSwgdGhpcy4jaW5pdGlhbFB1Ymxpc2gsIHsgaGFzQ29uZmlndXJhdGlvbkhhbmRsZXI6ICEhaGFuZGxlciB9KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlRGVmYXVsdCgpIHtcblx0XHRyZXR1cm4gRXZlbnQuY2hhaW4odGhpcy4jb25EaWRDaGFuZ2VEZWZhdWx0UHJvZmlsZXMsICQgPT4gJFxuXHRcdFx0Lm1hcChldiA9PiBldi5nZXQodGhpcy5jb250cm9sbGVySWQpPy5nZXQodGhpcy5wcm9maWxlSWQpKVxuXHRcdFx0LmZpbHRlcihpc0RlZmluZWQpXG5cdFx0KTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3h5OiBNYWluVGhyZWFkVGVzdGluZ1NoYXBlLFxuXHRcdHByb2ZpbGVzOiBNYXA8bnVtYmVyLCB2c2NvZGUuVGVzdFJ1blByb2ZpbGU+LFxuXHRcdGFjdGl2ZVByb2ZpbGVzOiBTZXQ8bnVtYmVyPixcblx0XHRvbkRpZENoYW5nZUFjdGl2ZVByb2ZpbGVzOiBFdmVudDxEZWZhdWx0UHJvZmlsZUNoYW5nZUV2ZW50Pixcblx0XHRjb250cm9sbGVySWQ6IHN0cmluZyxcblx0XHRwcm9maWxlSWQ6IG51bWJlcixcblx0XHRwcml2YXRlIF9sYWJlbDogc3RyaW5nLFxuXHRcdGtpbmQ6IHZzY29kZS5UZXN0UnVuUHJvZmlsZUtpbmQsXG5cdFx0cHVibGljIHJ1bkhhbmRsZXI6IChyZXF1ZXN0OiB2c2NvZGUuVGVzdFJ1blJlcXVlc3QsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFRoZW5hYmxlPHZvaWQ+IHwgdm9pZCxcblx0XHRfaXNEZWZhdWx0ID0gZmFsc2UsXG5cdFx0cHVibGljIF90YWc6IHZzY29kZS5UZXN0VGFnIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX3N1cHBvcnRzQ29udGludW91c1J1biA9IGZhbHNlLFxuXHQpIHtcblx0XHRzdXBlcihjb250cm9sbGVySWQsIHByb2ZpbGVJZCwga2luZCk7XG5cblx0XHR0aGlzLiNwcm94eSA9IHByb3h5O1xuXHRcdHRoaXMuI3Byb2ZpbGVzID0gcHJvZmlsZXM7XG5cdFx0dGhpcy4jYWN0aXZlUHJvZmlsZXMgPSBhY3RpdmVQcm9maWxlcztcblx0XHR0aGlzLiNvbkRpZENoYW5nZURlZmF1bHRQcm9maWxlcyA9IG9uRGlkQ2hhbmdlQWN0aXZlUHJvZmlsZXM7XG5cdFx0cHJvZmlsZXMuc2V0KHByb2ZpbGVJZCwgdGhpcyk7XG5cblx0XHRjb25zdCBncm91cEJpdHNldCA9IENvbnZlcnQuVGVzdFJ1blByb2ZpbGVLaW5kLmZyb20oa2luZCk7XG5cdFx0aWYgKF9pc0RlZmF1bHQpIHtcblx0XHRcdGFjdGl2ZVByb2ZpbGVzLmFkZChwcm9maWxlSWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuI2luaXRpYWxQdWJsaXNoID0ge1xuXHRcdFx0cHJvZmlsZUlkOiBwcm9maWxlSWQsXG5cdFx0XHRjb250cm9sbGVySWQsXG5cdFx0XHR0YWc6IF90YWcgPyBDb252ZXJ0LlRlc3RUYWcubmFtZXNwYWNlKHRoaXMuY29udHJvbGxlcklkLCBfdGFnLmlkKSA6IG51bGwsXG5cdFx0XHRsYWJlbDogX2xhYmVsLFxuXHRcdFx0Z3JvdXA6IGdyb3VwQml0c2V0LFxuXHRcdFx0aXNEZWZhdWx0OiBfaXNEZWZhdWx0LFxuXHRcdFx0aGFzQ29uZmlndXJhdGlvbkhhbmRsZXI6IGZhbHNlLFxuXHRcdFx0c3VwcG9ydHNDb250aW51b3VzUnVuOiBfc3VwcG9ydHNDb250aW51b3VzUnVuLFxuXHRcdH07XG5cblx0XHQvLyB3ZSBzZW5kIHRoZSBpbml0aWFsIHByb2ZpbGUgcHVibGlzaCBvdXQgb24gdGhlIG5leHQgbWljcm90YXNrIHNvIHRoYXRcblx0XHQvLyBpbml0aWFsbHkgc2V0dGluZyB0aGUgaXNEZWZhdWx0IHZhbHVlIGRvZXNuJ3Qgb3ZlcndyaXRlIGEgdXNlci1jb25maWd1cmVkIHZhbHVlXG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuI2luaXRpYWxQdWJsaXNoKSB7XG5cdFx0XHRcdHRoaXMuI3Byb3h5LiRwdWJsaXNoVGVzdFJ1blByb2ZpbGUodGhpcy4jaW5pdGlhbFB1Ymxpc2gpO1xuXHRcdFx0XHR0aGlzLiNpbml0aWFsUHVibGlzaCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuI3Byb2ZpbGVzPy5kZWxldGUodGhpcy5wcm9maWxlSWQpKSB7XG5cdFx0XHR0aGlzLiNwcm9maWxlcyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuI3Byb3h5LiRyZW1vdmVUZXN0UHJvZmlsZSh0aGlzLmNvbnRyb2xsZXJJZCwgdGhpcy5wcm9maWxlSWQpO1xuXHRcdH1cblx0XHR0aGlzLiNpbml0aWFsUHVibGlzaCA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBmaW5kVGVzdEluUmVzdWx0U25hcHNob3QoZXh0SWQ6IFRlc3RJZCwgc25hcHNob3Q6IHJlYWRvbmx5IFJlYWRvbmx5PHZzY29kZS5UZXN0UmVzdWx0U25hcHNob3Q+W10pIHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleHRJZC5wYXRoLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgaXRlbSA9IHNuYXBzaG90LmZpbmQocyA9PiBzLmlkID09PSBleHRJZC5wYXRoW2ldKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGkgPT09IGV4dElkLnBhdGgubGVuZ3RoIC0gMSkge1xuXHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0fVxuXG5cdFx0c25hcHNob3QgPSBpdGVtLmNoaWxkcmVuO1xuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsWUFBWTtBQUNyQixTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBRzdCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsUUFBUSxvQkFBb0I7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxtQ0FBNFQsMEJBQW1GLGlCQUE0QixhQUFhLDhCQUE4QjtBQUMvZCxTQUFTLCtCQUErQjtBQUN4QyxTQUE0QyxtQkFBMkM7QUFDdkYsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkIsY0FBYyxrQkFBa0IseUJBQXlCO0FBQzdGLFlBQVksYUFBYTtBQUN6QixTQUFTLGNBQWMsb0JBQW9CLHNCQUFzQjtBQWFqRSxJQUFJLGtCQUFrQjtBQUV0QixNQUFNLHdCQUF3QixvQkFBSSxRQUFzQztBQUVqRSxNQUFNLGtCQUFrQixnQkFBaUMsaUJBQWlCO0FBSzFFLElBQU0saUJBQU4sY0FBNkIsV0FBMEM7QUFBQSxFQWU3RSxZQUNxQixLQUNVLFlBQ0ssVUFDVyxTQUM3QztBQUNELFVBQU07QUFKd0I7QUFDSztBQUNXO0FBaEIvQyxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzNFLFNBQW1CLGNBQWMsb0JBQUksSUFBZ0Q7QUFJckYsU0FBaUIsZ0NBQWdDLEtBQUssVUFBVSxJQUFJLFFBQW1DLENBQUM7QUFDeEcsU0FBaUIsb0JBQW9CLG9CQUFJLElBQWlDO0FBQzFFLFNBQWlCLGdCQUFnQixvQkFBSSxJQUE0QjtBQUVqRSxTQUFPLG1CQUFtQixLQUFLLHNCQUFzQjtBQUNyRCxTQUFPLFVBQStDLENBQUM7QUFTdEQsU0FBSyxRQUFRLElBQUksU0FBUyxZQUFZLGlCQUFpQjtBQUN2RCxTQUFLLFdBQVcsSUFBSSxjQUFjLEtBQUssS0FBSztBQUM1QyxTQUFLLGFBQWEsSUFBSSxtQkFBbUIsS0FBSyxPQUFPLFVBQVU7QUFFL0QsYUFBUywwQkFBMEI7QUFBQSxNQUNsQyxpQkFBaUIsU0FBTztBQUN2QixnQkFBUSxLQUFLLE1BQU07QUFBQSxVQUNsQixLQUFLLGFBQWEsaUJBQWlCO0FBQ2xDLGtCQUFNLE9BQU87QUFDYixrQkFBTSxhQUFhLEtBQUssTUFBTSxLQUFLLE1BQU0sU0FBUyxDQUFDLEVBQUUsS0FBSztBQUMxRCxrQkFBTSxhQUFhLEtBQUssWUFBWSxJQUFJLE9BQU8sS0FBSyxVQUFVLENBQUM7QUFDL0QsbUJBQU8sWUFBWSxXQUFXLEtBQUssSUFBSSxVQUFVLEdBQUcsVUFBVSxrQkFBa0IsR0FBRztBQUFBLFVBQ3BGO0FBQUEsVUFDQSxLQUFLLGFBQWEscUJBQXFCO0FBQ3RDLGtCQUFNLEVBQUUsTUFBTSxRQUFRLElBQUk7QUFDMUIsa0JBQU0sUUFBUSxLQUFLLEtBQUs7QUFDeEIsbUJBQU87QUFBQSxjQUNOLE1BQU0sS0FBSyxZQUFZLElBQUksT0FBTyxLQUFLLEtBQUssQ0FBQyxHQUFHLFdBQVcsS0FBSyxJQUFJLEtBQUssR0FBRyxVQUN4RSxrQkFBa0IsRUFBRSxNQUFNLGFBQWEsaUJBQWlCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUFBLGNBQzNFLFNBQVMsUUFBUSxZQUFZLEdBQUcsT0FBdUM7QUFBQSxZQUN4RTtBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQVMsbUJBQU87QUFBQSxRQUNqQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxhQUFTLGdCQUFnQixPQUFPLGdDQUFnQyxZQUEwQjtBQUN6RixZQUFNLFFBQVEsTUFBTSxTQUFTLGVBRzFCLGNBQWMsb0JBQW9CO0FBRXJDLFlBQU0sU0FBUyxDQUFDLE1BQWM7QUFDN0IsY0FBTSxhQUFhLEtBQUssWUFBWSxJQUFJLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFDdEQsWUFBSSxDQUFDLFlBQVk7QUFBRSxpQkFBTztBQUFBLFFBQVc7QUFDckMsZUFBTyxPQUFPLE9BQU8sQ0FBQyxJQUFJLFdBQVcsYUFBYSxXQUFXLFdBQVcsS0FBSyxJQUFJLENBQUMsR0FBRztBQUFBLE1BQ3RGO0FBRUEsYUFBTztBQUFBLFFBQ04sU0FBUyxPQUFPLFFBQVEsSUFBSSxNQUFNLEVBQUUsT0FBTyxTQUFTLEtBQUssQ0FBQztBQUFBLFFBQzFELFNBQVMsT0FBTyxRQUFRLElBQUksTUFBTSxFQUFFLE9BQU8sU0FBUyxLQUFLLENBQUM7QUFBQSxNQUMzRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT08scUJBQXFCLFdBQWtDLGNBQXNCLE9BQWUsZ0JBQTZGO0FBQy9MLFFBQUksS0FBSyxZQUFZLElBQUksWUFBWSxHQUFHO0FBQ3ZDLFlBQU0sSUFBSSxNQUFNLHFEQUFxRCxZQUFZLEdBQUc7QUFBQSxJQUNyRjtBQUVBLFVBQU0sYUFBYSxJQUFJLGdCQUFnQjtBQUN2QyxVQUFNLGFBQWEsV0FBVyxJQUFJLElBQUksMEJBQTBCLGNBQWMsT0FBTyxLQUFLLE9BQU8sQ0FBQztBQUNsRyxlQUFXLEtBQUssUUFBUTtBQUV4QixVQUFNLFdBQVcsb0JBQUksSUFBbUM7QUFDeEQsVUFBTSxpQkFBaUIsb0JBQUksSUFBWTtBQUN2QyxVQUFNLFFBQVEsS0FBSztBQUVuQixVQUFNLGdCQUFnQixNQUFNO0FBQzNCLFVBQUksTUFBTTtBQUNWLFVBQUksZ0JBQWdCO0FBQ25CLGVBQU8seUJBQXlCO0FBQUEsTUFDakM7QUFDQSxZQUFNLE1BQU0sS0FBSztBQUNqQixVQUFJLEtBQUs7QUFDUixZQUFJLEtBQUsscUJBQXFCO0FBQzdCLGlCQUFPLHlCQUF5QjtBQUFBLFFBQ2pDO0FBQ0EsWUFBSSxLQUFLLG9CQUFvQjtBQUM1QixpQkFBTyx5QkFBeUI7QUFBQSxRQUNqQztBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sYUFBb0M7QUFBQSxNQUN6QyxPQUFPLFdBQVcsS0FBSztBQUFBLE1BQ3ZCLElBQUksUUFBUTtBQUNYLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxJQUFJLE1BQU0sT0FBZTtBQUN4QixnQkFBUTtBQUNSLG1CQUFXLEtBQUssUUFBUTtBQUN4QixjQUFNLGtCQUFrQixjQUFjLEVBQUUsTUFBTSxDQUFDO0FBQUEsTUFDaEQ7QUFBQSxNQUNBLElBQUksaUJBQWlCO0FBQ3BCLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxJQUFJLGVBQWUsT0FBMEU7QUFDNUYseUJBQWlCO0FBQ2pCLGNBQU0sa0JBQWtCLGNBQWMsRUFBRSxjQUFjLGNBQWMsRUFBRSxDQUFDO0FBQUEsTUFDeEU7QUFBQSxNQUNBLElBQUksS0FBSztBQUNSLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxJQUFJLHNCQUFzQjtBQUN6QixlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsTUFDQSxJQUFJLG9CQUFvQixPQUFtRDtBQUMxRSxnQ0FBd0IsV0FBVyxpQkFBaUI7QUFDcEQsYUFBSyxzQkFBc0I7QUFDM0IsY0FBTSxrQkFBa0IsY0FBYyxFQUFFLGNBQWMsY0FBYyxFQUFFLENBQUM7QUFBQSxNQUN4RTtBQUFBLE1BQ0Esa0JBQWtCLENBQUNBLFFBQU8sT0FBTyxZQUFZLFdBQVcsS0FBa0MsMEJBQW9DO0FBRzdILFlBQUksWUFBWSxLQUFLQSxNQUFLO0FBQzFCLGVBQU8sU0FBUyxJQUFJLFNBQVMsR0FBRztBQUMvQjtBQUFBLFFBQ0Q7QUFFQSxlQUFPLElBQUksbUJBQW1CLEtBQUssT0FBTyxVQUFVLGdCQUFnQixLQUFLLDhCQUE4QixPQUFPLGNBQWMsV0FBV0EsUUFBTyxPQUFPLFlBQVksV0FBVyxLQUFLLHFCQUFxQjtBQUFBLE1BQ3ZNO0FBQUEsTUFDQSxlQUFlLElBQUlBLFFBQU8sS0FBSztBQUM5QixlQUFPLElBQUksYUFBYSxjQUFjLElBQUlBLFFBQU8sR0FBRztBQUFBLE1BQ3JEO0FBQUEsTUFDQSxlQUFlLENBQUMsU0FBUyxNQUFNLFVBQVUsU0FBUztBQUNqRCxlQUFPLEtBQUssV0FBVyxjQUFjLFdBQVcsY0FBYyxZQUFZLFNBQVMsTUFBTSxPQUFPO0FBQUEsTUFDakc7QUFBQSxNQUNBLHVCQUF1QixXQUFTO0FBQy9CLFlBQUksVUFBVSxRQUFXO0FBQ3hCLGVBQUssTUFBTSxpQkFBaUIsTUFBUztBQUFBLFFBQ3RDLE9BQU87QUFDTixnQkFBTSxXQUFXLGlCQUFpQixRQUFRLFFBQVEsQ0FBQyxLQUFLO0FBQ3hELGVBQUssTUFBTSxpQkFBaUIsU0FBUyxJQUFJLE9BQUssT0FBTyxvQkFBb0IsR0FBSSxZQUFZLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFBQSxRQUN2RztBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksZUFBZSxJQUFJO0FBQ3RCLG1CQUFXLGlCQUFpQjtBQUFBLE1BQzdCO0FBQUEsTUFDQSxJQUFJLGlCQUFpQjtBQUNwQixlQUFPLFdBQVc7QUFBQSxNQUNuQjtBQUFBLE1BQ0EsU0FBUyxNQUFNO0FBQ2QsbUJBQVcsUUFBUTtBQUFBLE1BQ3BCO0FBQUEsSUFDRDtBQUVBLFVBQU0sT0FBdUIsRUFBRSxZQUFZLFlBQVksVUFBVSxXQUFXLGVBQWU7QUFDM0YsVUFBTSx3QkFBd0IsY0FBYyxPQUFPLGNBQWMsQ0FBQztBQUNsRSxlQUFXLElBQUksYUFBYSxNQUFNLE1BQU0sMEJBQTBCLFlBQVksQ0FBQyxDQUFDO0FBRWhGLFNBQUssWUFBWSxJQUFJLGNBQWMsSUFBSTtBQUN2QyxlQUFXLElBQUksYUFBYSxNQUFNLEtBQUssWUFBWSxPQUFPLFlBQVksQ0FBQyxDQUFDO0FBRXhFLGVBQVcsSUFBSSxXQUFXLGtCQUFrQixVQUFRLE1BQU0sYUFBYSxjQUFjLEtBQUssSUFBSSxZQUFZLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFFdEgsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLHFCQUFxQjtBQUMzQixXQUFPLEtBQUssU0FBUyxTQUFTO0FBQUEsRUFDL0I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWEsU0FBUyxLQUE0QixRQUFRLGtCQUFrQixNQUFNO0FBQ2pGLFVBQU0sVUFBVSw0QkFBNEIsR0FBRztBQUMvQyxRQUFJLENBQUMsU0FBUztBQUNiLFlBQU0sSUFBSSxNQUFNLHFFQUFxRTtBQUFBLElBQ3RGO0FBRUEsVUFBTSxhQUFhLEtBQUssWUFBWSxJQUFJLFFBQVEsWUFBWTtBQUM1RCxRQUFJLENBQUMsWUFBWTtBQUNoQixZQUFNLElBQUksTUFBTSxzQkFBc0I7QUFBQSxJQUN2QztBQUVBLFVBQU0sS0FBSyxNQUFNLFVBQVU7QUFBQSxNQUMxQixlQUFlLElBQUksaUJBQWlCO0FBQUEsTUFDcEMsT0FBTyxRQUFRLG1CQUFtQixLQUFLLFFBQVEsSUFBSTtBQUFBLE1BQ25ELFNBQVMsQ0FBQztBQUFBLFFBQ1QsU0FBUyxJQUFJLFNBQVMsSUFBSSxPQUFLLE9BQU8sb0JBQW9CLEdBQUcsV0FBVyxXQUFXLEtBQUssRUFBRSxFQUFFLFNBQVMsQ0FBQyxLQUFLLENBQUMsV0FBVyxXQUFXLEtBQUssRUFBRTtBQUFBLFFBQ3pJLFdBQVcsUUFBUTtBQUFBLFFBQ25CLGNBQWMsUUFBUTtBQUFBLE1BQ3ZCLENBQUM7QUFBQSxNQUNELFNBQVMsSUFBSSxTQUFTLElBQUksT0FBSyxFQUFFLEVBQUU7QUFBQSxJQUNwQyxHQUFHLEtBQUs7QUFBQSxFQUNUO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyw2QkFBNkIsVUFBMEQ7QUFDN0YsU0FBSyxrQkFBa0IsSUFBSSxRQUFRO0FBQ25DLFdBQU8sRUFBRSxTQUFTLE1BQU07QUFBRSxXQUFLLGtCQUFrQixPQUFPLFFBQVE7QUFBQSxJQUFHLEVBQUU7QUFBQSxFQUN0RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLE1BQU0sdUJBQXVCLEtBQW9CLFdBQXNCLE9BQTZDO0FBQ25ILFVBQU0sTUFBTSxLQUFLLFFBQVEsWUFBWSxJQUFJLE9BQU8sR0FBRyxDQUFDO0FBQ3BELFFBQUksQ0FBQyxLQUFLO0FBQ1QsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sV0FBVyxRQUFRLFNBQVMsR0FBRyxTQUFTO0FBQzlDLFVBQU0sVUFBb0IsQ0FBQztBQUMzQixVQUFNLFFBQVEsSUFBSSxDQUFDLEdBQUcsS0FBSyxZQUFZLE9BQU8sQ0FBQyxFQUFFLElBQUksT0FBTyxNQUFNO0FBQ2pFLFVBQUk7QUFDSixVQUFJO0FBQ0gsZ0JBQVEsTUFBTSxFQUFFLHFCQUFxQixzQkFBc0IsSUFBSSxVQUFVLFVBQVUsS0FBSztBQUFBLE1BQ3pGLFNBQVMsR0FBRztBQUNYLFlBQUksQ0FBQyxNQUFNLHlCQUF5QjtBQUNuQyxlQUFLLFdBQVcsS0FBSyxrREFBa0QsRUFBRSxXQUFXLEtBQUssSUFBSSxDQUFDO0FBQUEsUUFDL0Y7QUFBQSxNQUNEO0FBRUEsVUFBSSxPQUFPO0FBQ1YsbUJBQVcsUUFBUSxPQUFPO0FBQ3pCLGtCQUFRLEtBQUssT0FBTyxvQkFBb0IsTUFBTSxFQUFFLFdBQVcsRUFBRSxFQUFFLFNBQVMsQ0FBQztBQUFBLFFBQzFFO0FBQ0EsVUFBRSxXQUFXLFVBQVU7QUFBQSxNQUN4QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQU0sc0JBQXNCLFFBQWdCLE9BQW1EO0FBQzlGLFVBQU0sYUFBYSxLQUFLLFlBQVksSUFBSSxPQUFPLEtBQUssTUFBTSxDQUFDO0FBQzNELFFBQUksQ0FBQyxZQUFZO0FBQ2hCLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxVQUFNLE9BQU8sV0FBVyxXQUFXLEtBQUssSUFBSSxNQUFNO0FBQ2xELFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sWUFBWSxNQUFNLFdBQVcscUJBQXFCLHFCQUFxQixLQUFLLFFBQVEsS0FBSztBQUMvRixXQUFPLFdBQVcsSUFBSSxRQUFRLFNBQVMsSUFBSSxLQUFLLENBQUM7QUFBQSxFQUNsRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsYUFBNEI7QUFDM0IsZUFBVyxFQUFFLFdBQVcsS0FBSyxLQUFLLFlBQVksT0FBTyxHQUFHO0FBQ3ZELGlCQUFXLFVBQVU7QUFBQSxJQUN0QjtBQUVBLFdBQU8sUUFBUSxRQUFRO0FBQUEsRUFDeEI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQU0sb0JBQW9CLFlBQW9CLFFBQTRCLE9BQWlFO0FBQzFJLFVBQU0sVUFBVSxNQUFNLEtBQUssV0FBVyxtQkFBbUIsWUFBWSxRQUFRLEtBQUs7QUFDbEYsV0FBTyxTQUFTLElBQUksUUFBUSxhQUFhLFdBQVc7QUFBQSxFQUNyRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBTSxZQUFZLE9BQWU7QUFDaEMsU0FBSyxXQUFXLGVBQWUsS0FBSztBQUFBLEVBQ3JDO0FBQUE7QUFBQSxFQUdBLHFCQUFxQixjQUFzQixXQUFtQjtBQUM3RCxTQUFLLFlBQVksSUFBSSxZQUFZLEdBQUcsU0FBUyxJQUFJLFNBQVMsR0FBRyxtQkFBbUI7QUFBQSxFQUNqRjtBQUFBO0FBQUEsRUFHQSx1QkFBdUIsVUFBOEU7QUFDcEcsVUFBTSxNQUFpQyxvQkFBSSxJQUFJO0FBQy9DLGVBQVcsQ0FBQyxjQUFjLFVBQVUsS0FBSyxPQUFPLFFBQVEsUUFBUSxHQUFHO0FBQ2xFLFlBQU0sT0FBTyxLQUFLLFlBQVksSUFBSSxZQUFZO0FBQzlDLFVBQUksQ0FBQyxNQUFNO0FBQ1Y7QUFBQSxNQUNEO0FBQ0EsWUFBTSxVQUFVLG9CQUFJLElBQXFCO0FBQ3pDLFlBQU0sUUFBUSxXQUFXLE9BQU8sUUFBTSxDQUFDLEtBQUssZUFBZSxJQUFJLEVBQUUsQ0FBQztBQUNsRSxZQUFNLFVBQVUsQ0FBQyxHQUFHLEtBQUssY0FBYyxFQUFFLE9BQU8sUUFBTSxDQUFDLFdBQVcsU0FBUyxFQUFFLENBQUM7QUFDOUUsaUJBQVcsTUFBTSxPQUFPO0FBQ3ZCLGdCQUFRLElBQUksSUFBSSxJQUFJO0FBQ3BCLGFBQUssZUFBZSxJQUFJLEVBQUU7QUFBQSxNQUMzQjtBQUNBLGlCQUFXLE1BQU0sU0FBUztBQUN6QixnQkFBUSxJQUFJLElBQUksS0FBSztBQUNyQixhQUFLLGVBQWUsT0FBTyxFQUFFO0FBQUEsTUFDOUI7QUFDQSxVQUFJLFFBQVEsTUFBTTtBQUNqQixZQUFJLElBQUksY0FBYyxPQUFPO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBRUEsU0FBSyw4QkFBOEIsS0FBSyxHQUFHO0FBQUEsRUFDNUM7QUFBQTtBQUFBLEVBR0EsTUFBTSxjQUFjLGNBQXNCLE9BQTBCO0FBQ25FLFVBQU0sS0FBSyxZQUFZLElBQUksWUFBWSxHQUFHLFdBQVcsaUJBQWlCLEtBQUs7QUFBQSxFQUM1RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNTyxvQkFBb0IsU0FBeUM7QUFDbkUsU0FBSyxVQUFVLE9BQU87QUFBQSxNQUNyQixRQUNFLElBQUksT0FBSztBQUNULGNBQU0sSUFBSSxRQUFRLFlBQVksR0FBRyxDQUFDO0FBQ2xDLGNBQU0sbUJBQW1CLEVBQUUsTUFBTSxVQUFVLE9BQUssRUFBRSxXQUFXO0FBQzdELFlBQUkscUJBQXFCLElBQUk7QUFDNUIsWUFBRSxzQkFBc0IsQ0FBQyxLQUFLLFFBQVEsa0JBQWtCLFNBQ3ZELEtBQUssTUFBTSxvQkFBb0IsRUFBRSxJQUFJLGtCQUFrQixLQUFLLEtBQUssRUFBRSxLQUFLLENBQUFDLE9BQUtBLEdBQUUsSUFBSSxRQUFRLGFBQWEsRUFBRSxDQUFDO0FBQUEsUUFDN0c7QUFFQSw4QkFBc0IsSUFBSSxHQUFHLEVBQUUsRUFBRTtBQUNqQyxlQUFPO0FBQUEsTUFDUixDQUFDLEVBQ0EsT0FBTyxLQUFLLE9BQU8sRUFDbkIsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQzVDLE1BQU0sR0FBRyxFQUFFO0FBQUEsSUFDZDtBQUVBLFNBQUssc0JBQXNCLEtBQUs7QUFBQSxFQUNqQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFhLFlBQVksUUFBZ0IsUUFBZ0I7QUFDeEQsVUFBTSxhQUFhLEtBQUssWUFBWSxJQUFJLE9BQU8sV0FBVyxNQUFNLEVBQUUsWUFBWSxHQUFHO0FBQ2pGLFFBQUksWUFBWTtBQUNmLFlBQU0sV0FBVyxPQUFPLFFBQVEsU0FBUyxJQUFJLFdBQVcsTUFBTTtBQUM5RCxpQkFBVyxVQUFVO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1PLFlBQVksTUFBc0M7QUFDeEQsU0FBSyxTQUFTLFVBQVUsS0FBSyxJQUFJLE9BQUssWUFBWSxZQUFZLEVBQUUsZ0JBQWdCLE9BQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDOUY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxNQUFhLG9CQUFvQixNQUErQixPQUFrRTtBQUNqSSxXQUFPLFFBQVEsSUFBSSxLQUFLLElBQUksU0FBTyxLQUFLLHlCQUF5QixLQUFLLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFBQSxFQUNyRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE1BQWEsb0JBQW9CLE1BQStCLE9BQWtFO0FBQ2pJLFVBQU0sTUFBTSxJQUFJLHdCQUF3QixLQUFLO0FBQzdDLFVBQU0sTUFBTSxNQUFNLFFBQVEsSUFBSSxLQUFLLElBQUksU0FBTyxLQUFLLHlCQUF5QixLQUFLLE1BQU0sSUFBSSxLQUFLLENBQUMsQ0FBQztBQUdsRyxRQUFJLENBQUMsTUFBTSwyQkFBMkIsQ0FBQyxJQUFJLEtBQUssT0FBSyxFQUFFLEtBQUssR0FBRztBQUM5RCxZQUFNLElBQUksUUFBUSxPQUFLLE1BQU0sd0JBQXdCLENBQUMsQ0FBQztBQUFBLElBQ3hEO0FBRUEsUUFBSSxRQUFRLElBQUk7QUFDaEIsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBR0EsTUFBYSxzQkFBc0IsS0FBaUMsT0FBa0U7QUFDckksVUFBTSxVQUFVLEtBQUssUUFBUSxLQUFLLE9BQUssc0JBQXNCLElBQUksQ0FBQyxNQUFNLElBQUksUUFBUTtBQUNwRixVQUFNLE9BQU8sV0FBVyx5QkFBeUIsT0FBTyxXQUFXLElBQUksS0FBSyxHQUFHLFNBQVMsT0FBTztBQUMvRixRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxRQUFJLFlBQThCLENBQUM7QUFDbkMsVUFBTSxRQUFRLElBQUksQ0FBQyxHQUFHLEtBQUssaUJBQWlCLEVBQUUsSUFBSSxPQUFNLGFBQVk7QUFDbkUsVUFBSTtBQUNILGNBQU0sSUFBSSxNQUFNLFNBQVMsZ0JBQWdCLFNBQVMsTUFBTSxJQUFJLFdBQVcsSUFBSSxjQUFjLEtBQUs7QUFDOUYsWUFBSSxHQUFHO0FBQ04sc0JBQVksVUFBVSxPQUFPLENBQUM7QUFBQSxRQUMvQjtBQUFBLE1BQ0QsU0FBUyxHQUFHO0FBQ1gsYUFBSyxXQUFXLE1BQU0sMERBQTBELENBQUM7QUFBQSxNQUNsRjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsUUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsV0FBTyxVQUFVLElBQUksYUFBVztBQUMvQixZQUFNLEtBQUs7QUFDWCxXQUFLLGNBQWMsSUFBSSxJQUFJLE9BQU87QUFDbEMsYUFBTyxFQUFFLE9BQU8sUUFBUSxPQUFPLEdBQUc7QUFBQSxJQUNuQyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsc0JBQXNCLElBQW9CO0FBQ3pDLGVBQVcsS0FBSyxJQUFJO0FBQ25CLFdBQUssY0FBYyxPQUFPLENBQUM7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLHFCQUFxQixJQUEyQjtBQUMvQyxVQUFNLFVBQVUsS0FBSyxjQUFjLElBQUksRUFBRTtBQUN6QyxRQUFJLENBQUMsU0FBUztBQUNiLGFBQU8sUUFBUSxRQUFRO0FBQUEsSUFDeEI7QUFFQSxXQUFPLEtBQUssU0FBUyxlQUFlLFFBQVEsU0FBUyxHQUFJLFFBQVEsYUFBYSxDQUFDLENBQUU7QUFBQSxFQUNsRjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sd0JBQXdCLE9BQTJCLFFBQTRCO0FBQ3JGLFFBQUksVUFBVSxRQUFXO0FBQ3hCLFdBQUssV0FBVyxjQUFjO0FBQUEsSUFDL0IsT0FBTztBQUNOLFdBQUssV0FBVyxjQUFjLE9BQU8sTUFBTTtBQUFBLElBQzVDO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFJTyxrQkFBa0IsS0FBcUI7QUFDN0MsZUFBVyxXQUFXLEtBQUssV0FBVyxVQUFVO0FBQy9DLFlBQU0sU0FBUyxRQUFRLGdCQUFnQixHQUFHO0FBQzFDLFVBQUksUUFBUTtBQUNYLGVBQU8sRUFBRSxRQUFRLE9BQU8sUUFBUSxHQUFHO0FBQUEsTUFDcEM7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMseUJBQXlCLEtBQXNELGNBQXVCLE9BQWdFO0FBQ25MLFVBQU0sU0FBUyxLQUFLLFlBQVksSUFBSSxJQUFJLFlBQVk7QUFDcEQsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsVUFBTSxFQUFFLFlBQVksVUFBVSxVQUFVLElBQUk7QUFDNUMsVUFBTSxVQUFVLFNBQVMsSUFBSSxJQUFJLFNBQVM7QUFDMUMsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsVUFBTSxlQUFlLElBQUksUUFDdkIsSUFBSSxDQUFDLFdBQVcsV0FBVyxLQUFLLElBQUksTUFBTSxDQUFDLEVBQzNDLE9BQU8sU0FBUztBQUVsQixVQUFNLGVBQWUsSUFBSSxjQUN2QixJQUFJLFFBQU0sT0FBTyxXQUFXLEtBQUssSUFBSSxFQUFFLENBQUMsRUFDeEMsT0FBTyxTQUFTLEVBQ2hCLE9BQU8sYUFBVyxhQUFhO0FBQUEsTUFDL0IsYUFBVyxRQUFRLE9BQU8sUUFBUSxRQUFRLE1BQU0sTUFBTSxhQUFhO0FBQUEsSUFDcEUsQ0FBQztBQUVGLFFBQUksQ0FBQyxhQUFhLFFBQVE7QUFDekIsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sWUFBWSxJQUFJO0FBQUEsTUFDckIsYUFBYSxLQUFLLE9BQUssRUFBRSxrQkFBa0IsZ0JBQWdCLElBQUksU0FBWSxhQUFhLElBQUksT0FBSyxFQUFFLE1BQU07QUFBQSxNQUN6RyxhQUFhLElBQUksT0FBSyxFQUFFLE1BQU07QUFBQSxNQUM5QjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLHVCQUF1QixHQUFHLEtBQUssS0FBSyxXQUFXO0FBQUEsTUFDOUQ7QUFBQSxNQUNBO0FBQUEsTUFDQSxXQUFXLGFBQWEsS0FBSyxPQUFPLFVBQVU7QUFBQSxNQUM5QztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNILFlBQU0sUUFBUSxXQUFXLFdBQVcsS0FBSztBQUN6QyxhQUFPLENBQUM7QUFBQSxJQUNULFNBQVMsR0FBRztBQUNYLGFBQU8sRUFBRSxPQUFPLE9BQU8sQ0FBQyxFQUFFO0FBQUEsSUFDM0IsVUFBRTtBQUNELFVBQUksU0FBUztBQUNaLFlBQUksUUFBUSxtQkFBbUIsQ0FBQyxNQUFNLHlCQUF5QjtBQUM5RCxnQkFBTSxNQUFNLFVBQVUsUUFBUSxLQUFLO0FBQUEsUUFDcEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQXRoQmEsaUJBQU47QUFBQSxFQWdCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbkJVO0FBeWhCYixNQUFNLHNCQUFzQjtBQUU1QixJQUFXLHNCQUFYLGtCQUFXQyx5QkFBWDtBQUVDLEVBQUFBLDBDQUFBO0FBRUEsRUFBQUEsMENBQUE7QUFFQSxFQUFBQSwwQ0FBQTtBQU5VLFNBQUFBO0FBQUEsR0FBQTtBQVNYLE1BQU0sdUJBQXVCLFdBQVc7QUFBQSxFQTZCdkMsWUFDa0IsS0FDQSxPQUNBLFlBQ0EsU0FDQSxXQUNqQixhQUNDO0FBQ0QsVUFBTTtBQVBXO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFqQ2xCLFNBQVEsUUFBUTtBQUNoQixTQUFRLFVBQVU7QUFDbEIsU0FBaUIsUUFBUSxvQkFBSSxJQUFnRjtBQUM3RyxTQUFpQixnQkFBZ0Isb0JBQUksSUFBWTtBQUVqRCxTQUFpQixhQUFhLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUVoRSxTQUFpQixvQkFBb0Isb0JBQUksSUFBK0Q7QUFLeEc7QUFBQTtBQUFBO0FBQUEsU0FBZ0IsUUFBUSxLQUFLLFdBQVc7QUF5QnZDLFNBQUssTUFBTSxLQUFLLFVBQVUsSUFBSSx3QkFBd0IsV0FBVyxDQUFDO0FBRWxFLFVBQU0sY0FBYyxLQUFLLFVBQVUsSUFBSSxpQkFBaUIsTUFBTSxLQUFLLGlCQUFpQixHQUFHLG1CQUFtQixDQUFDO0FBQzNHLFNBQUssVUFBVSxLQUFLLElBQUksTUFBTSx3QkFBd0IsTUFBTSxZQUFZLFNBQVMsQ0FBQyxDQUFDO0FBRW5GLFVBQU0sb0JBQW9CLElBQUksUUFBYztBQUM1QyxTQUFLLGVBQWUsa0JBQWtCO0FBQ3RDLFNBQUssVUFBVSxhQUFhLE1BQU07QUFDakMsd0JBQWtCLEtBQUs7QUFDdkIsd0JBQWtCLFFBQVE7QUFBQSxJQUMzQixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUEvQkEsSUFBVyxrQkFBa0I7QUFDNUIsV0FBTyxLQUFLLFVBQVU7QUFBQSxFQUN2QjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsSUFBVyxLQUFLO0FBQ2YsV0FBTyxLQUFLLElBQUk7QUFBQSxFQUNqQjtBQUFBO0FBQUEsRUF5Qk8sZ0JBQWdCLEtBQXFCO0FBQzNDLGVBQVcsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsS0FBSyxLQUFLLE9BQU87QUFDOUMsVUFBSSxNQUFNLEtBQUs7QUFDZCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUEsRUFHTyxPQUFPLFFBQWlCO0FBQzlCLFFBQUksUUFBUTtBQUNYLFdBQUssTUFBTSxJQUFJLE1BQU0sR0FBRyxJQUFJLE9BQU87QUFBQSxJQUNwQyxXQUFXLEtBQUssVUFBVSxpQkFBNkI7QUFDdEQsV0FBSyxJQUFJLE9BQU87QUFDaEIsV0FBSyxRQUFRO0FBQUEsSUFDZCxXQUFXLEtBQUssVUFBVSxvQkFBZ0M7QUFDekQsV0FBSyxpQkFBaUI7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR0EsTUFBYSxtQkFBbUIsSUFBWSxRQUE0QixPQUFnRTtBQUN2SSxVQUFNLENBQUMsRUFBRSxNQUFNLElBQUksT0FBTyxXQUFXLEVBQUUsRUFBRTtBQUN6QyxVQUFNLFdBQVcsS0FBSyxrQkFBa0IsSUFBSSxFQUFFO0FBQzlDLFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sRUFBRSxRQUFRLE9BQU8sSUFBSTtBQUMzQixVQUFNLE9BQU8sS0FBSyxNQUFNLElBQUksTUFBTTtBQUNsQyxRQUFJLENBQUMsTUFBTTtBQUNWLFlBQU0sSUFBSSxNQUFNLHFDQUFxQztBQUFBLElBQ3REO0FBRUEsUUFBSTtBQUNKLFFBQUksVUFBVSxrQkFBa0IsY0FBYztBQUM3QyxZQUFNLFFBQVEsT0FBTyxRQUFRLE1BQU07QUFDbkMsVUFBSSxVQUFVLElBQUk7QUFDakIsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUNBLGlCQUFXLE9BQU8sY0FBYyxLQUFLO0FBQUEsSUFDdEM7QUFFQSxVQUFNLFVBQVUsV0FDYixLQUFLLFNBQVMsOEJBQThCLEtBQUssS0FBSyxRQUFRLFVBQVUsS0FBSyxJQUM3RSxLQUFLLFNBQVMsdUJBQXVCLEtBQUssS0FBSyxRQUFRLEtBQUs7QUFFL0QsV0FBUSxNQUFNLFdBQVksQ0FBQztBQUFBLEVBQzVCO0FBQUE7QUFBQSxFQUdPLFVBQVUsTUFBMEM7QUFDMUQsVUFBTSxRQUFRLEtBQUssSUFBSTtBQUN2QixVQUFNLFNBQVMsS0FBSyxJQUFJO0FBQ3hCLFVBQU0sU0FBUyxhQUFhO0FBRTVCLFVBQU0sb0JBQW9CLENBQXlCLE9BQ2xELENBQUMsU0FBMEIsU0FBZTtBQUN6QyxVQUFJLE9BQU87QUFDVixhQUFLLFdBQVcsS0FBSyw4QkFBOEIsS0FBSyxFQUFFLGtDQUFrQztBQUM1RjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGtCQUFrQixJQUFJO0FBQzNCLFNBQUcsTUFBTSxHQUFHLElBQUk7QUFBQSxJQUNqQjtBQUVELFVBQU0saUJBQWlCLENBQUMsTUFBdUIsYUFBaUU7QUFDL0csWUFBTSxZQUFZLG9CQUFvQixRQUNuQyxTQUFTLElBQUksUUFBUSxZQUFZLElBQUksSUFDckMsQ0FBQyxRQUFRLFlBQVksS0FBSyxRQUFRLENBQUM7QUFFdEMsVUFBSSxLQUFLLE9BQU8sS0FBSyxPQUFPO0FBQzNCLGNBQU0sa0JBQWdDLEVBQUUsT0FBTyxRQUFRLE1BQU0sS0FBSyxLQUFLLEtBQUssR0FBRyxLQUFLLEtBQUssSUFBSTtBQUM3RixtQkFBVyxXQUFXLFdBQVc7QUFDaEMsa0JBQVEsV0FBVyxRQUFRLFlBQVk7QUFBQSxRQUN4QztBQUFBLE1BQ0Q7QUFFQSxXQUFLLE1BQU0seUJBQXlCLE9BQU8sUUFBUSxPQUFPLG9CQUFvQixNQUFNLE1BQU0sRUFBRSxTQUFTLEdBQUcsU0FBUztBQUFBLElBQ2xIO0FBRUEsUUFBSSxRQUFRO0FBRVosVUFBTSxNQUFNLEtBQUssVUFBVSxJQUFJLHdCQUF3QixLQUFLLElBQUksS0FBSyxDQUFDO0FBS3RFLFVBQU0sTUFBc0I7QUFBQSxNQUMzQixhQUFhLEtBQUssSUFBSTtBQUFBLE1BQ3RCLE9BQU8sSUFBSTtBQUFBLE1BQ1g7QUFBQSxNQUNBLGNBQWMsS0FBSztBQUFBLE1BQ25CLGFBQWEsQ0FBQyxhQUFhO0FBQzFCLFlBQUksT0FBTztBQUNWO0FBQUEsUUFDRDtBQUVBLGNBQU0sZ0JBQWdCLG9CQUFvQixlQUFlLFNBQVMsZ0JBQWdCLENBQUM7QUFDbkYsWUFBSSxjQUFjLFFBQVE7QUFDekIscUJBQVcsUUFBUSxlQUFlO0FBQ2pDLGlCQUFLLGtCQUFrQixJQUFJO0FBQUEsVUFDNUI7QUFBQSxRQUNEO0FBRUEsY0FBTSxTQUFTLFNBQVMsSUFBSSxTQUFTO0FBQ3JDLGNBQU0sS0FBSyxJQUFJLE9BQU8sQ0FBQyxPQUFPLFFBQVEsTUFBTSxDQUFDLEVBQUUsU0FBUztBQUt4RCxhQUFLLGtCQUFrQixJQUFJLElBQUksRUFBRSxRQUFRLFVBQVUsUUFBUSxjQUFjLElBQUksT0FBSyxPQUFPLG9CQUFvQixHQUFHLE1BQU0sRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDO0FBQ3JJLGFBQUssTUFBTSxnQkFBZ0IsT0FBTyxRQUFRLFFBQVEsYUFBYSxTQUFTLFFBQVEsSUFBSSxRQUFRLENBQUM7QUFBQSxNQUM5RjtBQUFBO0FBQUEsTUFFQSxVQUFVLGtCQUFrQixVQUFRO0FBQ25DLGFBQUssTUFBTSxzQkFBc0IsT0FBTyxRQUFRLE9BQU8sb0JBQW9CLE1BQU0sTUFBTSxFQUFFLFNBQVMsR0FBRyxnQkFBZ0IsTUFBTTtBQUFBLE1BQzVILENBQUM7QUFBQSxNQUNELFNBQVMsa0JBQWtCLFVBQVE7QUFDbEMsYUFBSyxNQUFNLHNCQUFzQixPQUFPLFFBQVEsT0FBTyxvQkFBb0IsTUFBTSxNQUFNLEVBQUUsU0FBUyxHQUFHLGdCQUFnQixPQUFPO0FBQUEsTUFDN0gsQ0FBQztBQUFBLE1BQ0QsU0FBUyxrQkFBa0IsVUFBUTtBQUNsQyxhQUFLLE1BQU0sc0JBQXNCLE9BQU8sUUFBUSxPQUFPLG9CQUFvQixNQUFNLE1BQU0sRUFBRSxTQUFTLEdBQUcsZ0JBQWdCLE9BQU87QUFBQSxNQUM3SCxDQUFDO0FBQUEsTUFDRCxTQUFTLGtCQUFrQixDQUFDLE1BQU0sVUFBVSxhQUFhO0FBQ3hELHVCQUFlLE1BQU0sUUFBUTtBQUM3QixhQUFLLE1BQU0sc0JBQXNCLE9BQU8sUUFBUSxPQUFPLG9CQUFvQixNQUFNLE1BQU0sRUFBRSxTQUFTLEdBQUcsZ0JBQWdCLFNBQVMsUUFBUTtBQUFBLE1BQ3ZJLENBQUM7QUFBQSxNQUNELFFBQVEsa0JBQWtCLENBQUMsTUFBTSxVQUFVLGFBQWE7QUFDdkQsdUJBQWUsTUFBTSxRQUFRO0FBQzdCLGFBQUssTUFBTSxzQkFBc0IsT0FBTyxRQUFRLE9BQU8sb0JBQW9CLE1BQU0sTUFBTSxFQUFFLFNBQVMsR0FBRyxnQkFBZ0IsUUFBUSxRQUFRO0FBQUEsTUFDdEksQ0FBQztBQUFBLE1BQ0QsUUFBUSxrQkFBa0IsQ0FBQyxNQUFNLGFBQWE7QUFDN0MsYUFBSyxNQUFNLHNCQUFzQixPQUFPLFFBQVEsT0FBTyxvQkFBb0IsTUFBTSxLQUFLLElBQUksWUFBWSxFQUFFLFNBQVMsR0FBRyxnQkFBZ0IsUUFBUSxRQUFRO0FBQUEsTUFDckosQ0FBQztBQUFBO0FBQUEsTUFFRCxjQUFjLENBQUMsUUFBUSxVQUE0QixTQUEyQjtBQUM3RSxZQUFJLE9BQU87QUFDVjtBQUFBLFFBQ0Q7QUFFQSxZQUFJLE1BQU07QUFDVCxlQUFLLGtCQUFrQixJQUFJO0FBQUEsUUFDNUI7QUFFQSxhQUFLLE1BQU07QUFBQSxVQUNWO0FBQUEsVUFDQTtBQUFBLFVBQ0EsU0FBUyxXQUFXLE1BQU07QUFBQSxVQUMxQixZQUFZLFFBQVEsU0FBUyxLQUFLLFFBQVE7QUFBQSxVQUMxQyxRQUFRLE9BQU8sb0JBQW9CLE1BQU0sTUFBTSxFQUFFLFNBQVM7QUFBQSxRQUMzRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssTUFBTTtBQUNWLFlBQUksT0FBTztBQUNWO0FBQUEsUUFDRDtBQUVBLGdCQUFRO0FBQ1IsYUFBSyxNQUFNLHFCQUFxQixPQUFPLE1BQU07QUFDN0MsWUFBSSxDQUFDLEVBQUUsS0FBSyxTQUFTO0FBQ3BCLGVBQUssVUFBVTtBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLO0FBQ0wsU0FBSyxNQUFNLElBQUksUUFBUSxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQ25DLFNBQUssTUFBTSxvQkFBb0IsT0FBTztBQUFBLE1BQ3JDLElBQUk7QUFBQSxNQUNKLFFBQVEsS0FBSyxJQUFJO0FBQUEsTUFDakIsTUFBTSxRQUFRLEtBQUssVUFBVSxlQUFlLEtBQUssVUFBVSxXQUFXO0FBQUEsTUFDdEUsU0FBUztBQUFBLElBQ1YsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxtQkFBbUI7QUFDMUIsZUFBVyxFQUFFLElBQUksS0FBSyxLQUFLLE1BQU0sT0FBTyxHQUFHO0FBQzFDLFVBQUksSUFBSTtBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxZQUFZO0FBQ25CLFFBQUksS0FBSyxVQUFVLGVBQTJCO0FBQzdDLFdBQUssUUFBUTtBQUNiLFdBQUssV0FBVyxLQUFLO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsTUFBdUI7QUFDaEQsUUFBSSxFQUFFLGdCQUFnQixlQUFlO0FBQ3BDLFlBQU0sSUFBSSxxQkFBcUIsS0FBSyxFQUFFO0FBQUEsSUFDdkM7QUFFQSxRQUFJLEtBQUssY0FBYyxJQUFJLE9BQU8sb0JBQW9CLE1BQU0sS0FBSyxJQUFJLFlBQVksRUFBRSxTQUFTLENBQUMsR0FBRztBQUMvRjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQWdDLENBQUM7QUFDdkMsVUFBTSxPQUFPLEtBQUssSUFBSSxZQUFZO0FBQ2xDLFdBQU8sTUFBTTtBQUNaLFlBQU0sWUFBWSxRQUFRLFNBQVMsS0FBSyxJQUFvQjtBQUM1RCxZQUFNLFFBQVEsU0FBUztBQUV2QixVQUFJLEtBQUssY0FBYyxJQUFJLFVBQVUsS0FBSyxHQUFHO0FBQzVDO0FBQUEsTUFDRDtBQUVBLFdBQUssY0FBYyxJQUFJLFVBQVUsS0FBSztBQUN0QyxVQUFJLFNBQVMsTUFBTTtBQUNsQjtBQUFBLE1BQ0Q7QUFFQSxhQUFPLEtBQUssVUFBVTtBQUFBLElBQ3ZCO0FBRUEsU0FBSyxNQUFNLGVBQWUsS0FBSyxJQUFJLGNBQWMsS0FBSyxJQUFJLElBQUksS0FBSztBQUFBLEVBQ3BFO0FBQUEsRUFFZ0IsVUFBZ0I7QUFDL0IsU0FBSyxVQUFVO0FBQ2YsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBTU8sTUFBTSxtQkFBbUI7QUFBQSxFQVEvQixZQUNrQixPQUNBLFlBQ2hCO0FBRmdCO0FBQ0E7QUFUbEIsU0FBaUIsVUFBVSxvQkFBSSxJQUEyQztBQUMxRSxTQUFpQixjQUFjLG9CQUFJLElBQTRCO0FBQUEsRUFTM0Q7QUFBQSxFQVBKLElBQVcsV0FBVztBQUNyQixXQUFPLEtBQUssUUFBUSxPQUFPO0FBQUEsRUFDNUI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVPLG1CQUFtQixJQUFZLFFBQTRCLE9BQWlDO0FBQ2xHLFVBQU0sUUFBUSxPQUFPLEtBQUssRUFBRTtBQUM1QixXQUFPLEtBQUssWUFBWSxJQUFJLEtBQUssR0FBRyxtQkFBbUIsSUFBSSxRQUFRLEtBQUssS0FBSyxDQUFDO0FBQUEsRUFDL0U7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTU8sZUFBZSxPQUFlO0FBQ3BDLFNBQUssWUFBWSxJQUFJLEtBQUssR0FBRyxRQUFRO0FBQ3JDLFNBQUssWUFBWSxPQUFPLEtBQUs7QUFDN0IsZUFBVyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSyxLQUFLLFNBQVM7QUFDekMsVUFBSSxPQUFPLE9BQU87QUFDakIsYUFBSyxRQUFRLE9BQU8sR0FBRztBQUFBLE1BQ3hCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPTyw0QkFBNEIsV0FBa0MsS0FBNEIsS0FBaUIsU0FBZ0MsT0FBMEI7QUFDM0ssV0FBTyxLQUFLLFdBQVcsS0FBSyxLQUFLLFNBQVMsV0FBVyxLQUFLO0FBQUEsRUFDM0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLGNBQWMsT0FBZSxRQUFpQjtBQUNwRCxTQUFLLFlBQVksSUFBSSxLQUFLLEdBQUcsT0FBTyxNQUFNO0FBQUEsRUFDM0M7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLGdCQUFnQjtBQUN0QixlQUFXLFdBQVcsS0FBSyxRQUFRLE9BQU8sR0FBRztBQUM1QyxjQUFRLE9BQU87QUFBQSxJQUNoQjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLGNBQWMsV0FBa0MsY0FBc0IsWUFBdUMsU0FBZ0MsTUFBMEIsU0FBa0M7QUFDL00sVUFBTSxXQUFXLEtBQUssUUFBUSxJQUFJLE9BQU87QUFDekMsUUFBSSxVQUFVO0FBQ2IsYUFBTyxTQUFTLFVBQVUsSUFBSTtBQUFBLElBQy9CO0FBSUEsVUFBTSxNQUFNLFdBQVcsV0FBVyxjQUFjLFlBQVksU0FBUyxPQUFPO0FBQzVFLFVBQU0sVUFBVSw0QkFBNEIsT0FBTztBQUNuRCxTQUFLLE1BQU0seUJBQXlCO0FBQUEsTUFDbkM7QUFBQSxNQUNBLFlBQVksQ0FBQyxDQUFDLFFBQVE7QUFBQSxNQUN0QixTQUFTLFdBQVcsRUFBRSxPQUFPLFFBQVEsbUJBQW1CLEtBQUssUUFBUSxJQUFJLEdBQUcsSUFBSSxRQUFRLFVBQVU7QUFBQSxNQUNsRyxTQUFTLFFBQVEsU0FBUyxJQUFJLE9BQUssT0FBTyxvQkFBb0IsR0FBRyxXQUFXLEtBQUssRUFBRSxFQUFFLFNBQVMsQ0FBQyxLQUFLLENBQUM7QUFBQSxNQUNyRyxJQUFJLElBQUk7QUFBQSxNQUNSLFNBQVMsUUFBUSxTQUFTLElBQUksT0FBSyxPQUFPLG9CQUFvQixHQUFHLFdBQVcsS0FBSyxFQUFFLEVBQUUsU0FBUyxDQUFDLEtBQUssQ0FBQyxXQUFXLEtBQUssRUFBRTtBQUFBLE1BQ3ZILGVBQWUsUUFBUSxpQkFBaUI7QUFBQSxNQUN4QztBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sVUFBVSxLQUFLLFdBQVcsU0FBUyxLQUFLLFFBQVEsU0FBUyxTQUFTO0FBQ3hFLFVBQU0sS0FBSyxRQUFRLEtBQUssRUFBRSxNQUFNO0FBQy9CLFdBQUssTUFBTSwwQkFBMEIsSUFBSSxFQUFFO0FBQUEsSUFDNUMsQ0FBQztBQUVELFdBQU8sUUFBUSxVQUFVLElBQUk7QUFBQSxFQUM5QjtBQUFBLEVBRVEsV0FBVyxLQUE0QixLQUFpQixTQUE0QyxXQUFrQyxPQUEyQjtBQUN4SyxVQUFNLFVBQVUsSUFBSSxlQUFlLEtBQUssS0FBSyxPQUFPLEtBQUssWUFBWSxTQUFTLFdBQVcsS0FBSztBQUM5RixTQUFLLFFBQVEsSUFBSSxLQUFLLE9BQU87QUFDN0IsU0FBSyxZQUFZLElBQUksUUFBUSxJQUFJLE9BQU87QUFDeEMsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLE1BQU0sOEJBQThCLENBQUMsWUFBbUM7QUFDdkUsTUFBSSxDQUFDLFFBQVEsU0FBUztBQUNyQixXQUFPO0FBQUEsRUFDUjtBQUVBLE1BQUksRUFBRSxRQUFRLG1CQUFtQixxQkFBcUI7QUFDckQsVUFBTSxJQUFJLE1BQU0sd0ZBQXdGO0FBQUEsRUFDekc7QUFFQSxTQUFPLFFBQVE7QUFDaEI7QUFFTyxNQUFNLFdBQVc7QUFBQSxFQW1CdkIsWUFDaUIsY0FDQSxJQUNBLGFBQ0EsYUFDZjtBQUplO0FBQ0E7QUFDQTtBQUNBO0FBQUEsRUFFakI7QUFBQSxFQXhCQSxPQUFjLFdBQVcsY0FBc0IsWUFBdUMsU0FBZ0MsU0FBa0I7QUFDdkksV0FBTyxJQUFJO0FBQUEsTUFDVjtBQUFBLE1BQ0EsYUFBYTtBQUFBLE1BQ2I7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQWMsYUFBYSxTQUFnQyxZQUF1QztBQUNqRyxXQUFPLElBQUk7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUNSLFFBQVE7QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBU0Q7QUFVQSxNQUFNLHdCQUEwRjtBQUFBLEVBVy9GLFlBQTZCLFNBQTJDO0FBQTNDO0FBVjdCLFNBQWlCLFFBQVEsb0JBQUksSUFBZ0M7QUFDN0QsU0FBaUIsVUFBVSxvQkFBSSxJQUFnQztBQUMvRCxTQUFpQixVQUFVLG9CQUFJLElBQWdDO0FBRS9ELFNBQWlCLGlCQUFpQixvQkFBSSxJQUFZO0FBQUEsRUFPbEQ7QUFBQSxFQUxBLElBQVcsVUFBVTtBQUNwQixXQUFPLEtBQUssTUFBTSxTQUFTLEtBQUssS0FBSyxRQUFRLFNBQVMsS0FBSyxLQUFLLFFBQVEsU0FBUztBQUFBLEVBQ2xGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRTyxJQUFJLE1BQXdDO0FBQ2xELFNBQUssTUFBTSxJQUFJLElBQUk7QUFBQSxFQUNwQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sT0FBTyxNQUF3QztBQUNyRCxXQUFPLE9BQU8sS0FBSyxTQUFTLFFBQVEsU0FBUyxRQUFRLEtBQUssSUFBSSxDQUFDO0FBQy9ELFFBQUksQ0FBQyxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUc7QUFDMUIsV0FBSyxRQUFRLElBQUksSUFBSTtBQUFBLElBQ3RCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sT0FBTyxNQUF3QztBQUNyRCxRQUFJLEtBQUssTUFBTSxPQUFPLElBQUksR0FBRztBQUM1QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLFFBQVEsT0FBTyxJQUFJO0FBRXhCLFVBQU0sV0FBVyxPQUFPLFNBQVMsS0FBSyxLQUFLLEtBQUs7QUFDaEQsUUFBSSxZQUFZLEtBQUssZUFBZSxJQUFJLFNBQVMsU0FBUyxDQUFDLEdBQUc7QUFDN0QsV0FBSyxlQUFlLElBQUksS0FBSyxLQUFLLEtBQUs7QUFDdkM7QUFBQSxJQUNEO0FBRUEsU0FBSyxRQUFRLElBQUksSUFBSTtBQUFBLEVBQ3RCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxpQkFBMEM7QUFDaEQsVUFBTSxFQUFFLE9BQU8sU0FBUyxRQUFRLElBQUk7QUFDcEMsV0FBTztBQUFBLE1BQ04sSUFBSSxRQUFRO0FBQUUsZUFBTyxDQUFDLEdBQUcsS0FBSyxFQUFFLElBQUksT0FBSyxFQUFFLE9BQU87QUFBQSxNQUFHO0FBQUEsTUFDckQsSUFBSSxVQUFVO0FBQUUsZUFBTyxDQUFDLEdBQUcsT0FBTyxFQUFFLElBQUksT0FBSyxFQUFFLE9BQU87QUFBQSxNQUFHO0FBQUEsTUFDekQsSUFBSSxVQUFVO0FBQUUsZUFBTyxDQUFDLEdBQUcsT0FBTyxFQUFFLElBQUksT0FBSyxFQUFFLE9BQU87QUFBQSxNQUFHO0FBQUEsSUFDMUQ7QUFBQSxFQUNEO0FBQUEsRUFFTyxXQUFXO0FBQ2pCLFFBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEIsV0FBSyxRQUFRLEtBQUssS0FBSyxlQUFlLENBQUM7QUFBQSxJQUN4QztBQUFBLEVBQ0Q7QUFDRDtBQU1BLE1BQU0sK0JBQStCLGtDQUE4RDtBQUFBLEVBQW5HO0FBQUE7QUFDQyxTQUFRLGdCQUFnQixJQUFJLFFBQWlDO0FBSzdEO0FBQUE7QUFBQTtBQUFBLFNBQWdCLG1CQUFtQixLQUFLLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS3RELElBQVcsWUFBWTtBQUN0QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1PLHdCQUF3QixRQUFnQjtBQUM5QyxXQUFPLEtBQUssTUFBTSxJQUFJLE1BQU07QUFBQSxFQUM3QjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sK0JBQStCLE1BQXVCO0FBQzVELFdBQU8sS0FBSyxNQUFNLElBQUksS0FBSyxFQUFFO0FBQUEsRUFDOUI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtVLFdBQVcsTUFBd0IsUUFBaUU7QUFDN0csV0FBTztBQUFBLE1BQ04sR0FBRztBQUFBO0FBQUEsTUFFSCxTQUFTLFFBQVEsU0FBUyxRQUFRLEtBQUssSUFBSTtBQUFBLE1BQzNDLE9BQU8sU0FBUyxPQUFPLFFBQVEsSUFBSTtBQUFBLE1BQ25DLFVBQVUsb0JBQUksSUFBSTtBQUFBLElBQ25CO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS21CLHdCQUF3QjtBQUMxQyxXQUFPLElBQUksd0JBQXdCLEtBQUssYUFBYTtBQUFBLEVBQ3REO0FBQ0Q7QUFFQSxNQUFNLGNBQWM7QUFBQSxFQU1uQixZQUNrQixPQUNoQjtBQURnQjtBQUFBLEVBRWxCO0FBQUEsRUFFTyxXQUFnQztBQUN0QyxRQUFJLENBQUMsS0FBSyxTQUFTO0FBQ2xCLFdBQUssVUFBVSxLQUFLLG1CQUFtQjtBQUFBLElBQ3hDO0FBRUEsVUFBTSxVQUFVLEtBQUs7QUFDckIsWUFBUTtBQUVSLFdBQU87QUFBQSxNQUNOLGlCQUFpQixRQUFRLE1BQU07QUFBQSxNQUMvQixJQUFJLFFBQVE7QUFBRSxlQUFPLENBQUMsR0FBRyxRQUFRLE1BQU0sU0FBUyxFQUFFLElBQUksT0FBSyxFQUFFLE9BQU87QUFBQSxNQUFHO0FBQUEsTUFDdkUsU0FBUyx5QkFBeUIsTUFBTTtBQUN2QyxZQUFJLEVBQUUsUUFBUSxjQUFjLEdBQUc7QUFDOUIsZUFBSyxNQUFNLHNCQUFzQjtBQUNqQyxlQUFLLFVBQVU7QUFBQSxRQUNoQjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTywrQkFBK0IsS0FBc0I7QUFDM0QsV0FBTyxLQUFLLFNBQVMsTUFBTSwrQkFBK0IsR0FBRztBQUFBLEVBQzlEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxVQUFVLE1BQWlCO0FBQ2pDLFNBQUssU0FBUyxNQUFNLE1BQU0sSUFBSTtBQUFBLEVBQy9CO0FBQUEsRUFFUSxxQkFBcUI7QUFDNUIsVUFBTSxRQUFRLElBQUksdUJBQXVCLEVBQUUsZ0JBQWdCLE9BQUssRUFBRSxDQUFDO0FBQ25FLFNBQUssTUFBTSxrQkFBa0I7QUFDN0IsV0FBTyxFQUFFLFdBQVcsR0FBRyxNQUFPO0FBQUEsRUFDL0I7QUFDRDtBQUVBLE1BQU0sZ0JBQWdCLENBQUMsTUFBMEIsT0FBK0IsU0FBc0MsV0FBcUM7QUFDMUosTUFBSSxTQUFTO0FBQ1osV0FBTyxPQUFPLFNBQVMsTUFBTTtBQUFBLEVBQzlCLE9BQU87QUFDTixVQUFNLHFCQUFxQixLQUFLLGNBQWMsS0FBSyxXQUFXLE1BQU07QUFBQSxFQUNyRTtBQUNEO0FBRU8sTUFBTSwyQkFBMkIsbUJBQW9EO0FBQUEsRUErRTNGLFlBQ0MsT0FDQSxVQUNBLGdCQUNBLDJCQUNBLGNBQ0EsV0FDUSxRQUNSLE1BQ08sWUFDUCxhQUFhLE9BQ04sT0FBbUMsUUFDbEMseUJBQXlCLE9BQ2hDO0FBQ0QsVUFBTSxjQUFjLFdBQVcsSUFBSTtBQVAzQjtBQUVEO0FBRUE7QUFDQztBQUlSLFNBQUssU0FBUztBQUNkLFNBQUssWUFBWTtBQUNqQixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLDhCQUE4QjtBQUNuQyxhQUFTLElBQUksV0FBVyxJQUFJO0FBRTVCLFVBQU0sY0FBYyxRQUFRLG1CQUFtQixLQUFLLElBQUk7QUFDeEQsUUFBSSxZQUFZO0FBQ2YscUJBQWUsSUFBSSxTQUFTO0FBQUEsSUFDN0I7QUFFQSxTQUFLLGtCQUFrQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsS0FBSyxPQUFPLFFBQVEsUUFBUSxVQUFVLEtBQUssY0FBYyxLQUFLLEVBQUUsSUFBSTtBQUFBLE1BQ3BFLE9BQU87QUFBQSxNQUNQLE9BQU87QUFBQSxNQUNQLFdBQVc7QUFBQSxNQUNYLHlCQUF5QjtBQUFBLE1BQ3pCLHVCQUF1QjtBQUFBLElBQ3hCO0FBSUEsbUJBQWUsTUFBTTtBQUNwQixVQUFJLEtBQUssaUJBQWlCO0FBQ3pCLGFBQUssT0FBTyx1QkFBdUIsS0FBSyxlQUFlO0FBQ3ZELGFBQUssa0JBQWtCO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUE1SFM7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ1Q7QUFBQSxFQUNBO0FBQUEsRUFHQSxJQUFXLFFBQVE7QUFDbEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBVyxNQUFNLE9BQWU7QUFDL0IsUUFBSSxVQUFVLEtBQUssUUFBUTtBQUMxQixXQUFLLFNBQVM7QUFDZCxvQkFBYyxNQUFNLEtBQUssUUFBUSxLQUFLLGlCQUFpQixFQUFFLE1BQU0sQ0FBQztBQUFBLElBQ2pFO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBVyx3QkFBd0I7QUFDbEMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBVyxzQkFBc0IsVUFBbUI7QUFDbkQsUUFBSSxhQUFhLEtBQUssd0JBQXdCO0FBQzdDLFdBQUsseUJBQXlCO0FBQzlCLG9CQUFjLE1BQU0sS0FBSyxRQUFRLEtBQUssaUJBQWlCLEVBQUUsdUJBQXVCLFNBQVMsQ0FBQztBQUFBLElBQzNGO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBVyxZQUFZO0FBQ3RCLFdBQU8sS0FBSyxnQkFBZ0IsSUFBSSxLQUFLLFNBQVM7QUFBQSxFQUMvQztBQUFBLEVBRUEsSUFBVyxVQUFVLFdBQW9CO0FBQ3hDLFFBQUksY0FBYyxLQUFLLFdBQVc7QUFHakMsVUFBSSxXQUFXO0FBQ2QsYUFBSyxnQkFBZ0IsSUFBSSxLQUFLLFNBQVM7QUFBQSxNQUN4QyxPQUFPO0FBQ04sYUFBSyxnQkFBZ0IsT0FBTyxLQUFLLFNBQVM7QUFBQSxNQUMzQztBQUVBLG9CQUFjLE1BQU0sS0FBSyxRQUFRLEtBQUssaUJBQWlCLEVBQUUsVUFBVSxDQUFDO0FBQUEsSUFDckU7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFXLE1BQU07QUFDaEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBVyxJQUFJLEtBQWlDO0FBQy9DLFFBQUksS0FBSyxPQUFPLEtBQUssTUFBTSxJQUFJO0FBQzlCLFdBQUssT0FBTztBQUNaLG9CQUFjLE1BQU0sS0FBSyxRQUFRLEtBQUssaUJBQWlCO0FBQUEsUUFDdEQsS0FBSyxNQUFNLFFBQVEsUUFBUSxVQUFVLEtBQUssY0FBYyxJQUFJLEVBQUUsSUFBSTtBQUFBLE1BQ25FLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBVyxtQkFBbUI7QUFDN0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBVyxpQkFBaUIsU0FBbUM7QUFDOUQsUUFBSSxZQUFZLEtBQUssbUJBQW1CO0FBQ3ZDLFdBQUssb0JBQW9CO0FBQ3pCLG9CQUFjLE1BQU0sS0FBSyxRQUFRLEtBQUssaUJBQWlCLEVBQUUseUJBQXlCLENBQUMsQ0FBQyxRQUFRLENBQUM7QUFBQSxJQUM5RjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQVcscUJBQXFCO0FBQy9CLFdBQU8sTUFBTTtBQUFBLE1BQU0sS0FBSztBQUFBLE1BQTZCLE9BQUssRUFDeEQsSUFBSSxRQUFNLEdBQUcsSUFBSSxLQUFLLFlBQVksR0FBRyxJQUFJLEtBQUssU0FBUyxDQUFDLEVBQ3hELE9BQU8sU0FBUztBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUFBLEVBa0RBLFVBQWdCO0FBQ2YsUUFBSSxLQUFLLFdBQVcsT0FBTyxLQUFLLFNBQVMsR0FBRztBQUMzQyxXQUFLLFlBQVk7QUFDakIsV0FBSyxPQUFPLG1CQUFtQixLQUFLLGNBQWMsS0FBSyxTQUFTO0FBQUEsSUFDakU7QUFDQSxTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQ0Q7QUFFQSxTQUFTLHlCQUF5QixPQUFlLFVBQTBEO0FBQzFHLFdBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxLQUFLLFFBQVEsS0FBSztBQUMzQyxVQUFNLE9BQU8sU0FBUyxLQUFLLE9BQUssRUFBRSxPQUFPLE1BQU0sS0FBSyxDQUFDLENBQUM7QUFDdEQsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksTUFBTSxNQUFNLEtBQUssU0FBUyxHQUFHO0FBQ2hDLGFBQU87QUFBQSxJQUNSO0FBRUEsZUFBVyxLQUFLO0FBQUEsRUFDakI7QUFFQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImxhYmVsIiwgInIiLCAiVGVzdFJ1blRyYWNrZXJTdGF0ZSJdCn0K
