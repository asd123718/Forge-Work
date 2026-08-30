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
import { Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { observableValue, transaction } from "../../../base/common/observable.js";
import { WellDefinedPrefixTree } from "../../../base/common/prefixTree.js";
import { URI } from "../../../base/common/uri.js";
import { Range } from "../../../editor/common/core/range.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { TestCoverage } from "../../contrib/testing/common/testCoverage.js";
import { TestId } from "../../contrib/testing/common/testId.js";
import { ITestProfileService } from "../../contrib/testing/common/testProfileService.js";
import { LiveTestResult } from "../../contrib/testing/common/testResult.js";
import { ITestResultService } from "../../contrib/testing/common/testResultService.js";
import { ITestService } from "../../contrib/testing/common/testService.js";
import { CoverageDetails, IFileCoverage, ITestItem, ITestMessage, TestRunProfileBitset, TestsDiffOp } from "../../contrib/testing/common/testTypes.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
let MainThreadTesting = class extends Disposable {
  constructor(extHostContext, uriIdentityService, testService, testProfiles, resultService) {
    super();
    this.uriIdentityService = uriIdentityService;
    this.testService = testService;
    this.testProfiles = testProfiles;
    this.resultService = resultService;
    this.diffListener = this._register(new MutableDisposable());
    this.testProviderRegistrations = /* @__PURE__ */ new Map();
    this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostTesting);
    this._register(this.testService.registerExtHost({
      provideTestFollowups: (req, token) => this.proxy.$provideTestFollowups(req, token),
      executeTestFollowup: (id) => this.proxy.$executeTestFollowup(id),
      disposeTestFollowups: (ids) => this.proxy.$disposeTestFollowups(ids),
      getTestsRelatedToCode: (uri, position, token) => this.proxy.$getTestsRelatedToCode(uri, position, token)
    }));
    this._register(this.testService.onDidCancelTestRun(({ runId, taskId }) => {
      this.proxy.$cancelExtensionTestRun(runId, taskId);
    }));
    this._register(Event.debounce(testProfiles.onDidChange, (_last, e) => e)(() => {
      const obj = {};
      for (const group of [TestRunProfileBitset.Run, TestRunProfileBitset.Debug, TestRunProfileBitset.Coverage]) {
        for (const profile of this.testProfiles.getGroupDefaultProfiles(group)) {
          obj[profile.controllerId] ??= [];
          obj[profile.controllerId].push(profile.profileId);
        }
      }
      this.proxy.$setDefaultRunProfiles(obj);
    }));
    this._register(resultService.onResultsChanged((evt) => {
      if ("completed" in evt) {
        const serialized = evt.completed.toJSONWithMessages();
        if (serialized) {
          this.proxy.$publishTestResults([serialized]);
        }
      } else if ("removed" in evt) {
        evt.removed.forEach((r) => {
          if (r instanceof LiveTestResult) {
            this.proxy.$disposeRun(r.id);
          }
        });
      }
    }));
  }
  /**
   * @inheritdoc
   */
  $markTestRetired(testIds) {
    let tree;
    if (testIds) {
      tree = new WellDefinedPrefixTree();
      for (const id of testIds) {
        tree.insert(TestId.fromString(id).path, void 0);
      }
    }
    for (const result of this.resultService.results) {
      if (result instanceof LiveTestResult) {
        result.markRetired(tree);
      }
    }
  }
  /**
   * @inheritdoc
   */
  $publishTestRunProfile(profile) {
    const controller = this.testProviderRegistrations.get(profile.controllerId);
    if (controller) {
      this.testProfiles.addProfile(controller.instance, profile);
    }
  }
  /**
   * @inheritdoc
   */
  $updateTestRunConfig(controllerId, profileId, update) {
    this.testProfiles.updateProfile(controllerId, profileId, update);
  }
  /**
   * @inheritdoc
   */
  $removeTestProfile(controllerId, profileId) {
    this.testProfiles.removeProfile(controllerId, profileId);
  }
  /**
   * @inheritdoc
   */
  $addTestsToRun(controllerId, runId, tests) {
    this.withLiveRun(runId, (r) => r.addTestChainToRun(
      controllerId,
      tests.map((t) => ITestItem.deserialize(this.uriIdentityService, t))
    ));
  }
  /**
   * @inheritdoc
   */
  $appendCoverage(runId, taskId, coverage) {
    this.withLiveRun(runId, (run) => {
      const task = run.tasks.find((t) => t.id === taskId);
      if (!task) {
        return;
      }
      const deserialized = IFileCoverage.deserialize(this.uriIdentityService, coverage);
      transaction((tx) => {
        let value = task.coverage.read(void 0);
        if (!value) {
          value = new TestCoverage(run, taskId, this.uriIdentityService, {
            getCoverageDetails: (id, testId, token) => this.proxy.$getCoverageDetails(id, testId, token).then((r) => r.map(CoverageDetails.deserialize))
          });
          value.append(deserialized, tx);
          task.coverage.set(value, tx);
        } else {
          value.append(deserialized, tx);
        }
      });
    });
  }
  /**
   * @inheritdoc
   */
  $startedExtensionTestRun(req) {
    this.resultService.createLiveResult(req);
  }
  /**
   * @inheritdoc
   */
  $startedTestRunTask(runId, task) {
    this.withLiveRun(runId, (r) => r.addTask(task));
  }
  /**
   * @inheritdoc
   */
  $finishedTestRunTask(runId, taskId) {
    this.withLiveRun(runId, (r) => r.markTaskComplete(taskId));
  }
  /**
   * @inheritdoc
   */
  $finishedExtensionTestRun(runId) {
    this.withLiveRun(runId, (r) => r.markComplete());
  }
  /**
   * @inheritdoc
   */
  $updateTestStateInRun(runId, taskId, testId, state, duration) {
    this.withLiveRun(runId, (r) => r.updateState(testId, taskId, state, duration));
  }
  /**
   * @inheritdoc
   */
  $appendOutputToRun(runId, taskId, output, locationDto, testId) {
    const location = locationDto && {
      uri: URI.revive(locationDto.uri),
      range: Range.lift(locationDto.range)
    };
    this.withLiveRun(runId, (r) => r.appendOutput(output, taskId, location, testId));
  }
  /**
   * @inheritdoc
   */
  $appendTestMessagesInRun(runId, taskId, testId, messages) {
    const r = this.resultService.getResult(runId);
    if (r && r instanceof LiveTestResult) {
      for (const message of messages) {
        r.appendMessage(testId, taskId, ITestMessage.deserialize(this.uriIdentityService, message));
      }
    }
  }
  /**
   * @inheritdoc
   */
  $registerTestController(controllerId, _label, _capabilities) {
    const disposable = new DisposableStore();
    const label = observableValue(`${controllerId}.label`, _label);
    const capabilities = observableValue(`${controllerId}.cap`, _capabilities);
    const controller = {
      id: controllerId,
      label,
      capabilities,
      syncTests: () => this.proxy.$syncTests(),
      refreshTests: (token) => this.proxy.$refreshTests(controllerId, token),
      configureRunProfile: (id) => this.proxy.$configureRunProfile(controllerId, id),
      runTests: (reqs, token) => this.proxy.$runControllerTests(reqs, token),
      startContinuousRun: (reqs, token) => this.proxy.$startContinuousRun(reqs, token),
      expandTest: (testId, levels) => this.proxy.$expandTest(testId, isFinite(levels) ? levels : -1),
      getRelatedCode: (testId, token) => this.proxy.$getCodeRelatedToTest(testId, token).then(
        (locations) => locations.map((l) => ({
          uri: URI.revive(l.uri),
          range: Range.lift(l.range)
        }))
      )
    };
    disposable.add(toDisposable(() => this.testProfiles.removeProfile(controllerId)));
    disposable.add(this.testService.registerTestController(controllerId, controller));
    this.testProviderRegistrations.set(controllerId, {
      instance: controller,
      label,
      capabilities,
      disposable
    });
  }
  /**
   * @inheritdoc
   */
  $updateController(controllerId, patch) {
    const controller = this.testProviderRegistrations.get(controllerId);
    if (!controller) {
      return;
    }
    transaction((tx) => {
      if (patch.label !== void 0) {
        controller.label.set(patch.label, tx);
      }
      if (patch.capabilities !== void 0) {
        controller.capabilities.set(patch.capabilities, tx);
      }
    });
  }
  /**
   * @inheritdoc
   */
  $unregisterTestController(controllerId) {
    this.testProviderRegistrations.get(controllerId)?.disposable.dispose();
    this.testProviderRegistrations.delete(controllerId);
  }
  /**
   * @inheritdoc
   */
  $subscribeToDiffs() {
    this.proxy.$acceptDiff(this.testService.collection.getReviverDiff().map(TestsDiffOp.serialize));
    this.diffListener.value = this.testService.onDidProcessDiff(this.proxy.$acceptDiff, this.proxy);
  }
  /**
   * @inheritdoc
   */
  $unsubscribeFromDiffs() {
    this.diffListener.clear();
  }
  /**
   * @inheritdoc
   */
  $publishDiff(controllerId, diff) {
    this.testService.publishDiff(
      controllerId,
      diff.map((d) => TestsDiffOp.deserialize(this.uriIdentityService, d))
    );
  }
  /**
   * @inheritdoc
   */
  async $runTests(req, token) {
    const result = await this.testService.runResolvedTests(req, token);
    return result.id;
  }
  /**
   * @inheritdoc
   */
  async $getCoverageDetails(resultId, taskIndex, uri, token) {
    const details = await this.resultService.getResult(resultId)?.tasks[taskIndex]?.coverage.get()?.getUri(URI.from(uri))?.details(token);
    return details || [];
  }
  dispose() {
    super.dispose();
    for (const subscription of this.testProviderRegistrations.values()) {
      subscription.disposable.dispose();
    }
    this.testProviderRegistrations.clear();
  }
  withLiveRun(runId, fn) {
    const r = this.resultService.getResult(runId);
    return r && r instanceof LiveTestResult ? fn(r) : void 0;
  }
};
MainThreadTesting = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadTesting),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, ITestService),
  __decorateParam(3, ITestProfileService),
  __decorateParam(4, ITestResultService)
], MainThreadTesting);
export {
  MainThreadTesting
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZFRlc3RpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgV2VsbERlZmluZWRQcmVmaXhUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcHJlZml4VHJlZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBUZXN0Q292ZXJhZ2UgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RDb3ZlcmFnZS5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBJVGVzdFByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0UHJvZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGl2ZVRlc3RSZXN1bHQgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0UmVzdWx0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFpblRocmVhZFRlc3RDb250cm9sbGVyLCBJVGVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvdmVyYWdlRGV0YWlscywgRXh0ZW5zaW9uUnVuVGVzdHNSZXF1ZXN0LCBJRmlsZUNvdmVyYWdlLCBJVGVzdEl0ZW0sIElUZXN0TWVzc2FnZSwgSVRlc3RSdW5Qcm9maWxlLCBJVGVzdFJ1blRhc2ssIFJlc29sdmVkVGVzdFJ1blJlcXVlc3QsIFRlc3RDb250cm9sbGVyQ2FwYWJpbGl0eSwgVGVzdFJlc3VsdFN0YXRlLCBUZXN0UnVuUHJvZmlsZUJpdHNldCwgVGVzdHNEaWZmT3AgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbnRleHQsIGV4dEhvc3ROYW1lZEN1c3RvbWVyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgRXh0SG9zdFRlc3RpbmdTaGFwZSwgSUxvY2F0aW9uRHRvLCBJVGVzdENvbnRyb2xsZXJQYXRjaCwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRUZXN0aW5nU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkVGVzdGluZylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkVGVzdGluZyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkVGVzdGluZ1NoYXBlIHtcblx0cHJpdmF0ZSByZWFkb25seSBwcm94eTogRXh0SG9zdFRlc3RpbmdTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBkaWZmTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGVzdFByb3ZpZGVyUmVnaXN0cmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCB7XG5cdFx0aW5zdGFuY2U6IElNYWluVGhyZWFkVGVzdENvbnRyb2xsZXI7XG5cdFx0bGFiZWw6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nPjtcblx0XHRjYXBhYmlsaXRpZXM6IElTZXR0YWJsZU9ic2VydmFibGU8VGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5Pjtcblx0XHRkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcblx0fT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRcdEBJVGVzdFByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFByb2ZpbGVzOiBJVGVzdFByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXN1bHRTZXJ2aWNlOiBJVGVzdFJlc3VsdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RUZXN0aW5nKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGVzdFNlcnZpY2UucmVnaXN0ZXJFeHRIb3N0KHtcblx0XHRcdHByb3ZpZGVUZXN0Rm9sbG93dXBzOiAocmVxLCB0b2tlbikgPT4gdGhpcy5wcm94eS4kcHJvdmlkZVRlc3RGb2xsb3d1cHMocmVxLCB0b2tlbiksXG5cdFx0XHRleGVjdXRlVGVzdEZvbGxvd3VwOiBpZCA9PiB0aGlzLnByb3h5LiRleGVjdXRlVGVzdEZvbGxvd3VwKGlkKSxcblx0XHRcdGRpc3Bvc2VUZXN0Rm9sbG93dXBzOiBpZHMgPT4gdGhpcy5wcm94eS4kZGlzcG9zZVRlc3RGb2xsb3d1cHMoaWRzKSxcblx0XHRcdGdldFRlc3RzUmVsYXRlZFRvQ29kZTogKHVyaSwgcG9zaXRpb24sIHRva2VuKSA9PiB0aGlzLnByb3h5LiRnZXRUZXN0c1JlbGF0ZWRUb0NvZGUodXJpLCBwb3NpdGlvbiwgdG9rZW4pLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGVzdFNlcnZpY2Uub25EaWRDYW5jZWxUZXN0UnVuKCh7IHJ1bklkLCB0YXNrSWQgfSkgPT4ge1xuXHRcdFx0dGhpcy5wcm94eS4kY2FuY2VsRXh0ZW5zaW9uVGVzdFJ1bihydW5JZCwgdGFza0lkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5kZWJvdW5jZSh0ZXN0UHJvZmlsZXMub25EaWRDaGFuZ2UsIChfbGFzdCwgZSkgPT4gZSkoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb2JqOiBSZWNvcmQ8LyogY29udHJvbGxlciBpZCAqL3N0cmluZywgLyogcHJvZmlsZSBpZCAqLyBudW1iZXJbXT4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgW1Rlc3RSdW5Qcm9maWxlQml0c2V0LlJ1biwgVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcsIFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlXSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy50ZXN0UHJvZmlsZXMuZ2V0R3JvdXBEZWZhdWx0UHJvZmlsZXMoZ3JvdXApKSB7XG5cdFx0XHRcdFx0b2JqW3Byb2ZpbGUuY29udHJvbGxlcklkXSA/Pz0gW107XG5cdFx0XHRcdFx0b2JqW3Byb2ZpbGUuY29udHJvbGxlcklkXS5wdXNoKHByb2ZpbGUucHJvZmlsZUlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnByb3h5LiRzZXREZWZhdWx0UnVuUHJvZmlsZXMob2JqKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZXN1bHRTZXJ2aWNlLm9uUmVzdWx0c0NoYW5nZWQoZXZ0ID0+IHtcblx0XHRcdGlmICgnY29tcGxldGVkJyBpbiBldnQpIHtcblx0XHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IGV2dC5jb21wbGV0ZWQudG9KU09OV2l0aE1lc3NhZ2VzKCk7XG5cdFx0XHRcdGlmIChzZXJpYWxpemVkKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm94eS4kcHVibGlzaFRlc3RSZXN1bHRzKFtzZXJpYWxpemVkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoJ3JlbW92ZWQnIGluIGV2dCkge1xuXHRcdFx0XHRldnQucmVtb3ZlZC5mb3JFYWNoKHIgPT4ge1xuXHRcdFx0XHRcdGlmIChyIGluc3RhbmNlb2YgTGl2ZVRlc3RSZXN1bHQpIHtcblx0XHRcdFx0XHRcdHRoaXMucHJveHkuJGRpc3Bvc2VSdW4oci5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdCRtYXJrVGVzdFJldGlyZWQodGVzdElkczogc3RyaW5nW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRsZXQgdHJlZTogV2VsbERlZmluZWRQcmVmaXhUcmVlPHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRlc3RJZHMpIHtcblx0XHRcdHRyZWUgPSBuZXcgV2VsbERlZmluZWRQcmVmaXhUcmVlKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHRlc3RJZHMpIHtcblx0XHRcdFx0dHJlZS5pbnNlcnQoVGVzdElkLmZyb21TdHJpbmcoaWQpLnBhdGgsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgdGhpcy5yZXN1bHRTZXJ2aWNlLnJlc3VsdHMpIHtcblx0XHRcdC8vIGFsbCBub24tbGl2ZSByZXN1bHRzIGFyZSBhbHJlYWR5IGVudGlyZWx5IG91dGRhdGVkXG5cdFx0XHRpZiAocmVzdWx0IGluc3RhbmNlb2YgTGl2ZVRlc3RSZXN1bHQpIHtcblx0XHRcdFx0cmVzdWx0Lm1hcmtSZXRpcmVkKHRyZWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0JHB1Ymxpc2hUZXN0UnVuUHJvZmlsZShwcm9maWxlOiBJVGVzdFJ1blByb2ZpbGUpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy50ZXN0UHJvdmlkZXJSZWdpc3RyYXRpb25zLmdldChwcm9maWxlLmNvbnRyb2xsZXJJZCk7XG5cdFx0aWYgKGNvbnRyb2xsZXIpIHtcblx0XHRcdHRoaXMudGVzdFByb2ZpbGVzLmFkZFByb2ZpbGUoY29udHJvbGxlci5pbnN0YW5jZSwgcHJvZmlsZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHQkdXBkYXRlVGVzdFJ1bkNvbmZpZyhjb250cm9sbGVySWQ6IHN0cmluZywgcHJvZmlsZUlkOiBudW1iZXIsIHVwZGF0ZTogUGFydGlhbDxJVGVzdFJ1blByb2ZpbGU+KTogdm9pZCB7XG5cdFx0dGhpcy50ZXN0UHJvZmlsZXMudXBkYXRlUHJvZmlsZShjb250cm9sbGVySWQsIHByb2ZpbGVJZCwgdXBkYXRlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0JHJlbW92ZVRlc3RQcm9maWxlKGNvbnRyb2xsZXJJZDogc3RyaW5nLCBwcm9maWxlSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudGVzdFByb2ZpbGVzLnJlbW92ZVByb2ZpbGUoY29udHJvbGxlcklkLCBwcm9maWxlSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHQkYWRkVGVzdHNUb1J1bihjb250cm9sbGVySWQ6IHN0cmluZywgcnVuSWQ6IHN0cmluZywgdGVzdHM6IElUZXN0SXRlbS5TZXJpYWxpemVkW10pOiB2b2lkIHtcblx0XHR0aGlzLndpdGhMaXZlUnVuKHJ1bklkLCByID0+IHIuYWRkVGVzdENoYWluVG9SdW4oY29udHJvbGxlcklkLFxuXHRcdFx0dGVzdHMubWFwKHQgPT4gSVRlc3RJdGVtLmRlc2VyaWFsaXplKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0KSkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0JGFwcGVuZENvdmVyYWdlKHJ1bklkOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBjb3ZlcmFnZTogSUZpbGVDb3ZlcmFnZS5TZXJpYWxpemVkKTogdm9pZCB7XG5cdFx0dGhpcy53aXRoTGl2ZVJ1bihydW5JZCwgcnVuID0+IHtcblx0XHRcdGNvbnN0IHRhc2sgPSBydW4udGFza3MuZmluZCh0ID0+IHQuaWQgPT09IHRhc2tJZCk7XG5cdFx0XHRpZiAoIXRhc2spIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZXNlcmlhbGl6ZWQgPSBJRmlsZUNvdmVyYWdlLmRlc2VyaWFsaXplKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCBjb3ZlcmFnZSk7XG5cblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0bGV0IHZhbHVlID0gdGFzay5jb3ZlcmFnZS5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0XHR2YWx1ZSA9IG5ldyBUZXN0Q292ZXJhZ2UocnVuLCB0YXNrSWQsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0XHRnZXRDb3ZlcmFnZURldGFpbHM6IChpZCwgdGVzdElkLCB0b2tlbikgPT4gdGhpcy5wcm94eS4kZ2V0Q292ZXJhZ2VEZXRhaWxzKGlkLCB0ZXN0SWQsIHRva2VuKVxuXHRcdFx0XHRcdFx0XHQudGhlbihyID0+IHIubWFwKENvdmVyYWdlRGV0YWlscy5kZXNlcmlhbGl6ZSkpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHZhbHVlLmFwcGVuZChkZXNlcmlhbGl6ZWQsIHR4KTtcblx0XHRcdFx0XHQodGFzay5jb3ZlcmFnZSBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPFRlc3RDb3ZlcmFnZT4pLnNldCh2YWx1ZSwgdHgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHZhbHVlLmFwcGVuZChkZXNlcmlhbGl6ZWQsIHR4KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdCRzdGFydGVkRXh0ZW5zaW9uVGVzdFJ1bihyZXE6IEV4dGVuc2lvblJ1blRlc3RzUmVxdWVzdCk6IHZvaWQge1xuXHRcdHRoaXMucmVzdWx0U2VydmljZS5jcmVhdGVMaXZlUmVzdWx0KHJlcSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdCRzdGFydGVkVGVzdFJ1blRhc2socnVuSWQ6IHN0cmluZywgdGFzazogSVRlc3RSdW5UYXNrKTogdm9pZCB7XG5cdFx0dGhpcy53aXRoTGl2ZVJ1bihydW5JZCwgciA9PiByLmFkZFRhc2sodGFzaykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHQkZmluaXNoZWRUZXN0UnVuVGFzayhydW5JZDogc3RyaW5nLCB0YXNrSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMud2l0aExpdmVSdW4ocnVuSWQsIHIgPT4gci5tYXJrVGFza0NvbXBsZXRlKHRhc2tJZCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHQkZmluaXNoZWRFeHRlbnNpb25UZXN0UnVuKHJ1bklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLndpdGhMaXZlUnVuKHJ1bklkLCByID0+IHIubWFya0NvbXBsZXRlKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgJHVwZGF0ZVRlc3RTdGF0ZUluUnVuKHJ1bklkOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCB0ZXN0SWQ6IHN0cmluZywgc3RhdGU6IFRlc3RSZXN1bHRTdGF0ZSwgZHVyYXRpb24/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLndpdGhMaXZlUnVuKHJ1bklkLCByID0+IHIudXBkYXRlU3RhdGUodGVzdElkLCB0YXNrSWQsIHN0YXRlLCBkdXJhdGlvbikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgJGFwcGVuZE91dHB1dFRvUnVuKHJ1bklkOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBvdXRwdXQ6IFZTQnVmZmVyLCBsb2NhdGlvbkR0bz86IElMb2NhdGlvbkR0bywgdGVzdElkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSBsb2NhdGlvbkR0byAmJiB7XG5cdFx0XHR1cmk6IFVSSS5yZXZpdmUobG9jYXRpb25EdG8udXJpKSxcblx0XHRcdHJhbmdlOiBSYW5nZS5saWZ0KGxvY2F0aW9uRHRvLnJhbmdlKVxuXHRcdH07XG5cblx0XHR0aGlzLndpdGhMaXZlUnVuKHJ1bklkLCByID0+IHIuYXBwZW5kT3V0cHV0KG91dHB1dCwgdGFza0lkLCBsb2NhdGlvbiwgdGVzdElkKSk7XG5cdH1cblxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljICRhcHBlbmRUZXN0TWVzc2FnZXNJblJ1bihydW5JZDogc3RyaW5nLCB0YXNrSWQ6IHN0cmluZywgdGVzdElkOiBzdHJpbmcsIG1lc3NhZ2VzOiBJVGVzdE1lc3NhZ2UuU2VyaWFsaXplZFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgciA9IHRoaXMucmVzdWx0U2VydmljZS5nZXRSZXN1bHQocnVuSWQpO1xuXHRcdGlmIChyICYmIHIgaW5zdGFuY2VvZiBMaXZlVGVzdFJlc3VsdCkge1xuXHRcdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIG1lc3NhZ2VzKSB7XG5cdFx0XHRcdHIuYXBwZW5kTWVzc2FnZSh0ZXN0SWQsIHRhc2tJZCwgSVRlc3RNZXNzYWdlLmRlc2VyaWFsaXplKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCBtZXNzYWdlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgJHJlZ2lzdGVyVGVzdENvbnRyb2xsZXIoY29udHJvbGxlcklkOiBzdHJpbmcsIF9sYWJlbDogc3RyaW5nLCBfY2FwYWJpbGl0aWVzOiBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHkpIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGxhYmVsID0gb2JzZXJ2YWJsZVZhbHVlKGAke2NvbnRyb2xsZXJJZH0ubGFiZWxgLCBfbGFiZWwpO1xuXHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IG9ic2VydmFibGVWYWx1ZShgJHtjb250cm9sbGVySWR9LmNhcGAsIF9jYXBhYmlsaXRpZXMpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXI6IElNYWluVGhyZWFkVGVzdENvbnRyb2xsZXIgPSB7XG5cdFx0XHRpZDogY29udHJvbGxlcklkLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRjYXBhYmlsaXRpZXMsXG5cdFx0XHRzeW5jVGVzdHM6ICgpID0+IHRoaXMucHJveHkuJHN5bmNUZXN0cygpLFxuXHRcdFx0cmVmcmVzaFRlc3RzOiB0b2tlbiA9PiB0aGlzLnByb3h5LiRyZWZyZXNoVGVzdHMoY29udHJvbGxlcklkLCB0b2tlbiksXG5cdFx0XHRjb25maWd1cmVSdW5Qcm9maWxlOiBpZCA9PiB0aGlzLnByb3h5LiRjb25maWd1cmVSdW5Qcm9maWxlKGNvbnRyb2xsZXJJZCwgaWQpLFxuXHRcdFx0cnVuVGVzdHM6IChyZXFzLCB0b2tlbikgPT4gdGhpcy5wcm94eS4kcnVuQ29udHJvbGxlclRlc3RzKHJlcXMsIHRva2VuKSxcblx0XHRcdHN0YXJ0Q29udGludW91c1J1bjogKHJlcXMsIHRva2VuKSA9PiB0aGlzLnByb3h5LiRzdGFydENvbnRpbnVvdXNSdW4ocmVxcywgdG9rZW4pLFxuXHRcdFx0ZXhwYW5kVGVzdDogKHRlc3RJZCwgbGV2ZWxzKSA9PiB0aGlzLnByb3h5LiRleHBhbmRUZXN0KHRlc3RJZCwgaXNGaW5pdGUobGV2ZWxzKSA/IGxldmVscyA6IC0xKSxcblx0XHRcdGdldFJlbGF0ZWRDb2RlOiAodGVzdElkLCB0b2tlbikgPT4gdGhpcy5wcm94eS4kZ2V0Q29kZVJlbGF0ZWRUb1Rlc3QodGVzdElkLCB0b2tlbikudGhlbihsb2NhdGlvbnMgPT5cblx0XHRcdFx0bG9jYXRpb25zLm1hcChsID0+ICh7XG5cdFx0XHRcdFx0dXJpOiBVUkkucmV2aXZlKGwudXJpKSxcblx0XHRcdFx0XHRyYW5nZTogUmFuZ2UubGlmdChsLnJhbmdlKVxuXHRcdFx0XHR9KSksXG5cdFx0XHQpLFxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy50ZXN0UHJvZmlsZXMucmVtb3ZlUHJvZmlsZShjb250cm9sbGVySWQpKSk7XG5cdFx0ZGlzcG9zYWJsZS5hZGQodGhpcy50ZXN0U2VydmljZS5yZWdpc3RlclRlc3RDb250cm9sbGVyKGNvbnRyb2xsZXJJZCwgY29udHJvbGxlcikpO1xuXG5cdFx0dGhpcy50ZXN0UHJvdmlkZXJSZWdpc3RyYXRpb25zLnNldChjb250cm9sbGVySWQsIHtcblx0XHRcdGluc3RhbmNlOiBjb250cm9sbGVyLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRjYXBhYmlsaXRpZXMsXG5cdFx0XHRkaXNwb3NhYmxlXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyAkdXBkYXRlQ29udHJvbGxlcihjb250cm9sbGVySWQ6IHN0cmluZywgcGF0Y2g6IElUZXN0Q29udHJvbGxlclBhdGNoKSB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMudGVzdFByb3ZpZGVyUmVnaXN0cmF0aW9ucy5nZXQoY29udHJvbGxlcklkKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRpZiAocGF0Y2gubGFiZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250cm9sbGVyLmxhYmVsLnNldChwYXRjaC5sYWJlbCwgdHgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocGF0Y2guY2FwYWJpbGl0aWVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29udHJvbGxlci5jYXBhYmlsaXRpZXMuc2V0KHBhdGNoLmNhcGFiaWxpdGllcywgdHgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyAkdW5yZWdpc3RlclRlc3RDb250cm9sbGVyKGNvbnRyb2xsZXJJZDogc3RyaW5nKSB7XG5cdFx0dGhpcy50ZXN0UHJvdmlkZXJSZWdpc3RyYXRpb25zLmdldChjb250cm9sbGVySWQpPy5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLnRlc3RQcm92aWRlclJlZ2lzdHJhdGlvbnMuZGVsZXRlKGNvbnRyb2xsZXJJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyAkc3Vic2NyaWJlVG9EaWZmcygpOiB2b2lkIHtcblx0XHR0aGlzLnByb3h5LiRhY2NlcHREaWZmKHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5nZXRSZXZpdmVyRGlmZigpLm1hcChUZXN0c0RpZmZPcC5zZXJpYWxpemUpKTtcblx0XHR0aGlzLmRpZmZMaXN0ZW5lci52YWx1ZSA9IHRoaXMudGVzdFNlcnZpY2Uub25EaWRQcm9jZXNzRGlmZih0aGlzLnByb3h5LiRhY2NlcHREaWZmLCB0aGlzLnByb3h5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljICR1bnN1YnNjcmliZUZyb21EaWZmcygpOiB2b2lkIHtcblx0XHR0aGlzLmRpZmZMaXN0ZW5lci5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgJHB1Ymxpc2hEaWZmKGNvbnRyb2xsZXJJZDogc3RyaW5nLCBkaWZmOiBUZXN0c0RpZmZPcC5TZXJpYWxpemVkW10pOiB2b2lkIHtcblx0XHR0aGlzLnRlc3RTZXJ2aWNlLnB1Ymxpc2hEaWZmKGNvbnRyb2xsZXJJZCxcblx0XHRcdGRpZmYubWFwKGQgPT4gVGVzdHNEaWZmT3AuZGVzZXJpYWxpemUodGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIGQpKSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhc3luYyAkcnVuVGVzdHMocmVxOiBSZXNvbHZlZFRlc3RSdW5SZXF1ZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMudGVzdFNlcnZpY2UucnVuUmVzb2x2ZWRUZXN0cyhyZXEsIHRva2VuKTtcblx0XHRyZXR1cm4gcmVzdWx0LmlkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgJGdldENvdmVyYWdlRGV0YWlscyhyZXN1bHRJZDogc3RyaW5nLCB0YXNrSW5kZXg6IG51bWJlciwgdXJpOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPENvdmVyYWdlRGV0YWlscy5TZXJpYWxpemVkW10+IHtcblx0XHRjb25zdCBkZXRhaWxzID0gYXdhaXQgdGhpcy5yZXN1bHRTZXJ2aWNlLmdldFJlc3VsdChyZXN1bHRJZClcblx0XHRcdD8udGFza3NbdGFza0luZGV4XVxuXHRcdFx0Py5jb3ZlcmFnZS5nZXQoKVxuXHRcdFx0Py5nZXRVcmkoVVJJLmZyb20odXJpKSlcblx0XHRcdD8uZGV0YWlscyh0b2tlbik7XG5cblx0XHQvLyBSZXR1cm4gZW1wdHkgaWYgbm90aGluZy4gU29tZSBmYWlsdXJlIGlzIGFsd2F5cyBwb3NzaWJsZSBoZXJlIGJlY2F1c2Vcblx0XHQvLyByZXN1bHRzIG1pZ2h0IGJlIGNsZWFyZWQgaW4gdGhlIG1lYW50aW1lLlxuXHRcdHJldHVybiBkZXRhaWxzIHx8IFtdO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIHRoaXMudGVzdFByb3ZpZGVyUmVnaXN0cmF0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLnRlc3RQcm92aWRlclJlZ2lzdHJhdGlvbnMuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgd2l0aExpdmVSdW48VD4ocnVuSWQ6IHN0cmluZywgZm46IChydW46IExpdmVUZXN0UmVzdWx0KSA9PiBUKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgciA9IHRoaXMucmVzdWx0U2VydmljZS5nZXRSZXN1bHQocnVuSWQpO1xuXHRcdHJldHVybiByICYmIHIgaW5zdGFuY2VvZiBMaXZlVGVzdFJlc3VsdCA/IGZuKHIpIDogdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVksaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDMUYsU0FBOEIsaUJBQWlCLG1CQUFtQjtBQUNsRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsYUFBYTtBQUN0QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGNBQWM7QUFDdkIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBb0Msb0JBQW9CO0FBQ3hELFNBQVMsaUJBQTJDLGVBQWUsV0FBVyxjQUFnSCxzQkFBc0IsbUJBQW1CO0FBQ3ZPLFNBQTBCLDRCQUE0QjtBQUN0RCxTQUFTLGdCQUF5RSxtQkFBMkM7QUFHdEgsSUFBTSxvQkFBTixjQUFnQyxXQUE2QztBQUFBLEVBVW5GLFlBQ0MsZ0JB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
