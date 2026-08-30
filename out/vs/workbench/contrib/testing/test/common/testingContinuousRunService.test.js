import * as assert from "assert";
import { Emitter } from "../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { mock, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { TestingContinuousRunService } from "../../common/testingContinuousRunService.js";
import { TestRunProfileBitset } from "../../common/testTypes.js";
suite("TestingContinuousRunService", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let testService;
  let cr;
  const profile1 = { profileId: 1, controllerId: "ctrl", group: TestRunProfileBitset.Run, label: "label", supportsContinuousRun: true, isDefault: false, hasConfigurationHandler: true, tag: null };
  const profile2 = { profileId: 2, controllerId: "ctrl", group: TestRunProfileBitset.Run, label: "label", supportsContinuousRun: true, isDefault: false, hasConfigurationHandler: true, tag: null };
  class MockTestService extends mock() {
    constructor() {
      super(...arguments);
      this.requests = /* @__PURE__ */ new Set();
      this.log = [];
    }
    startContinuousRun(req, token) {
      this.requests.add(req);
      this.log.push(["start", req.targets[0].profileId, req.targets[0].testIds]);
      ds.add(token.onCancellationRequested(() => {
        this.log.push(["stop", req.targets[0].profileId, req.targets[0].testIds]);
        this.requests.delete(req);
      }));
      return Promise.resolve();
    }
  }
  class MockProfilesService extends mock() {
    constructor() {
      super(...arguments);
      this.didChangeEmitter = ds.add(new Emitter());
      this.onDidChange = this.didChangeEmitter.event;
    }
    getGroupDefaultProfiles(group, controllerId) {
      return [];
    }
  }
  setup(() => {
    testService = new MockTestService();
    cr = ds.add(new TestingContinuousRunService(
      testService,
      ds.add(new TestStorageService()),
      ds.add(new MockContextKeyService()),
      new MockProfilesService()
    ));
  });
  test("isSpecificallyEnabledFor", () => {
    assert.strictEqual(cr.isEnabled(), false);
    assert.strictEqual(cr.isSpecificallyEnabledFor("testId"), false);
    cr.start([profile1], "testId\0child");
    assert.strictEqual(cr.isSpecificallyEnabledFor("testId"), false);
    assert.strictEqual(cr.isSpecificallyEnabledFor("testId\0child"), true);
    assert.deepStrictEqual(testService.log, [
      ["start", 1, ["testId\0child"]]
    ]);
  });
  test("isEnabledForAParentOf", () => {
    assert.strictEqual(cr.isEnabled(), false);
    assert.strictEqual(cr.isEnabledForAParentOf("testId"), false);
    cr.start([profile1], "parentTestId\0testId");
    assert.strictEqual(cr.isEnabledForAParentOf("parentTestId"), false);
    assert.strictEqual(cr.isEnabledForAParentOf("parentTestId\0testId"), true);
    assert.strictEqual(cr.isEnabledForAParentOf("parentTestId\0testId\0nestd"), true);
    assert.strictEqual(cr.isEnabled(), true);
    assert.deepStrictEqual(testService.log, [
      ["start", 1, ["parentTestId\0testId"]]
    ]);
  });
  test("isEnabledForAChildOf", () => {
    assert.strictEqual(cr.isEnabled(), false);
    assert.strictEqual(cr.isEnabledForAChildOf("testId"), false);
    cr.start([profile1], "testId\0childTestId");
    assert.strictEqual(cr.isEnabledForAChildOf("testId"), true);
    assert.strictEqual(cr.isEnabledForAChildOf("testId\0childTestId"), true);
    assert.strictEqual(cr.isEnabledForAChildOf("testId\0childTestId\0neested"), false);
    assert.strictEqual(cr.isEnabled(), true);
  });
  suite("lifecycle", () => {
    test("stops general in DFS order", () => {
      cr.start([profile1], "a\0b\0c\0d");
      cr.start([profile1], "a\0b");
      cr.start([profile1], "a\0b\0c");
      cr.stop();
      assert.deepStrictEqual(testService.log, [
        ["start", 1, ["a\0b\0c\0d"]],
        ["start", 1, ["a\0b"]],
        ["start", 1, ["a\0b\0c"]],
        ["stop", 1, ["a\0b\0c\0d"]],
        ["stop", 1, ["a\0b\0c"]],
        ["stop", 1, ["a\0b"]]
      ]);
      assert.strictEqual(cr.isEnabled(), false);
    });
    test("stops profiles in DFS order", () => {
      cr.start([profile1], "a\0b\0c\0d");
      cr.start([profile1], "a\0b");
      cr.start([profile1], "a\0b\0c");
      cr.stopProfile(profile1);
      assert.deepStrictEqual(testService.log, [
        ["start", 1, ["a\0b\0c\0d"]],
        ["start", 1, ["a\0b"]],
        ["start", 1, ["a\0b\0c"]],
        ["stop", 1, ["a\0b\0c\0d"]],
        ["stop", 1, ["a\0b\0c"]],
        ["stop", 1, ["a\0b"]]
      ]);
      assert.strictEqual(cr.isEnabled(), false);
    });
    test("updates profile for a test if profile is changed", () => {
      cr.start([profile1], "parent\0testId");
      cr.start([profile2], "parent\0testId");
      assert.strictEqual(cr.isEnabled(), true);
      cr.stop();
      assert.strictEqual(cr.isEnabled(), false);
      assert.deepStrictEqual(testService.log, [
        ["start", 1, ["parent\0testId"]],
        ["start", 2, ["parent\0testId"]],
        ["stop", 1, ["parent\0testId"]],
        ["stop", 2, ["parent\0testId"]]
      ]);
      assert.strictEqual(cr.isEnabled(), false);
    });
    test("stops a single profile test", () => {
      cr.start([profile1, profile2], "parent\0testId");
      cr.stopProfile(profile1);
      assert.deepStrictEqual(testService.log, [
        ["start", 1, ["parent\0testId"]],
        ["start", 2, ["parent\0testId"]],
        ["stop", 1, ["parent\0testId"]]
      ]);
      assert.strictEqual(cr.isEnabled(), true);
      cr.stopProfile(profile2);
      assert.deepStrictEqual(testService.log, [
        ["start", 1, ["parent\0testId"]],
        ["start", 2, ["parent\0testId"]],
        ["stop", 1, ["parent\0testId"]],
        ["stop", 2, ["parent\0testId"]]
      ]);
      assert.strictEqual(cr.isEnabled(), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXHRlc3RcXGNvbW1vblxcdGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1vY2ssIFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLCBUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0UHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFByb2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVzdFJ1blByb2ZpbGUsIFJlc29sdmVkVGVzdFJ1blJlcXVlc3QsIFRlc3RSdW5Qcm9maWxlQml0c2V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5cbnN1aXRlKCdUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCB0ZXN0U2VydmljZTogTW9ja1Rlc3RTZXJ2aWNlO1xuXHRsZXQgY3I6IElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2U7XG5cblx0Y29uc3QgcHJvZmlsZTE6IElUZXN0UnVuUHJvZmlsZSA9IHsgcHJvZmlsZUlkOiAxLCBjb250cm9sbGVySWQ6ICdjdHJsJywgZ3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1biwgbGFiZWw6ICdsYWJlbCcsIHN1cHBvcnRzQ29udGludW91c1J1bjogdHJ1ZSwgaXNEZWZhdWx0OiBmYWxzZSwgaGFzQ29uZmlndXJhdGlvbkhhbmRsZXI6IHRydWUsIHRhZzogbnVsbCB9O1xuXHRjb25zdCBwcm9maWxlMjogSVRlc3RSdW5Qcm9maWxlID0geyBwcm9maWxlSWQ6IDIsIGNvbnRyb2xsZXJJZDogJ2N0cmwnLCBncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLCBsYWJlbDogJ2xhYmVsJywgc3VwcG9ydHNDb250aW51b3VzUnVuOiB0cnVlLCBpc0RlZmF1bHQ6IGZhbHNlLCBoYXNDb25maWd1cmF0aW9uSGFuZGxlcjogdHJ1ZSwgdGFnOiBudWxsIH07XG5cblx0Y2xhc3MgTW9ja1Rlc3RTZXJ2aWNlIGV4dGVuZHMgbW9jazxJVGVzdFNlcnZpY2U+KCkge1xuXHRcdHB1YmxpYyByZXF1ZXN0cyA9IG5ldyBTZXQ8UmVzb2x2ZWRUZXN0UnVuUmVxdWVzdD4oKTtcblx0XHRwdWJsaWMgbG9nOiBba2luZDogJ3N0YXJ0JyB8ICdzdG9wJywgcHJvZmlsZUlkOiBudW1iZXIsIHRlc3RJZHM6IHN0cmluZ1tdXVtdID0gW107XG5cblx0XHRvdmVycmlkZSBzdGFydENvbnRpbnVvdXNSdW4ocmVxOiBSZXNvbHZlZFRlc3RSdW5SZXF1ZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHRoaXMucmVxdWVzdHMuYWRkKHJlcSk7XG5cdFx0XHR0aGlzLmxvZy5wdXNoKFsnc3RhcnQnLCByZXEudGFyZ2V0c1swXS5wcm9maWxlSWQsIHJlcS50YXJnZXRzWzBdLnRlc3RJZHNdKTtcblx0XHRcdGRzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMubG9nLnB1c2goWydzdG9wJywgcmVxLnRhcmdldHNbMF0ucHJvZmlsZUlkLCByZXEudGFyZ2V0c1swXS50ZXN0SWRzXSk7XG5cdFx0XHRcdHRoaXMucmVxdWVzdHMuZGVsZXRlKHJlcSk7XG5cdFx0XHR9KSk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgTW9ja1Byb2ZpbGVzU2VydmljZSBleHRlbmRzIG1vY2s8SVRlc3RQcm9maWxlU2VydmljZT4oKSB7XG5cdFx0cHVibGljIGRpZENoYW5nZUVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2UgPSB0aGlzLmRpZENoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cblx0XHRvdmVycmlkZSBnZXRHcm91cERlZmF1bHRQcm9maWxlcyhncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQsIGNvbnRyb2xsZXJJZD86IHN0cmluZyk6IElUZXN0UnVuUHJvZmlsZVtdIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0dGVzdFNlcnZpY2UgPSBuZXcgTW9ja1Rlc3RTZXJ2aWNlKCk7XG5cdFx0Y3IgPSBkcy5hZGQobmV3IFRlc3RpbmdDb250aW51b3VzUnVuU2VydmljZShcblx0XHRcdHRlc3RTZXJ2aWNlLFxuXHRcdFx0ZHMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSksXG5cdFx0XHRkcy5hZGQobmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKSxcblx0XHRcdG5ldyBNb2NrUHJvZmlsZXNTZXJ2aWNlKCksXG5cdFx0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzU3BlY2lmaWNhbGx5RW5hYmxlZEZvcicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3IuaXNFbmFibGVkKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3IuaXNTcGVjaWZpY2FsbHlFbmFibGVkRm9yKCd0ZXN0SWQnKSwgZmFsc2UpO1xuXG5cdFx0Y3Iuc3RhcnQoW3Byb2ZpbGUxXSwgJ3Rlc3RJZFxcMGNoaWxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyLmlzU3BlY2lmaWNhbGx5RW5hYmxlZEZvcigndGVzdElkJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3IuaXNTcGVjaWZpY2FsbHlFbmFibGVkRm9yKCd0ZXN0SWRcXDBjaGlsZCcpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdFNlcnZpY2UubG9nLCBbXG5cdFx0XHRbJ3N0YXJ0JywgMSwgWyd0ZXN0SWRcXDBjaGlsZCddXSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaXNFbmFibGVkRm9yQVBhcmVudE9mJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjci5pc0VuYWJsZWQoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjci5pc0VuYWJsZWRGb3JBUGFyZW50T2YoJ3Rlc3RJZCcpLCBmYWxzZSk7XG5cdFx0Y3Iuc3RhcnQoW3Byb2ZpbGUxXSwgJ3BhcmVudFRlc3RJZFxcMHRlc3RJZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjci5pc0VuYWJsZWRGb3JBUGFyZW50T2YoJ3BhcmVudFRlc3RJZCcpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyLmlzRW5hYmxlZEZvckFQYXJlbnRPZigncGFyZW50VGVzdElkXFwwdGVzdElkJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjci5pc0VuYWJsZWRGb3JBUGFyZW50T2YoJ3BhcmVudFRlc3RJZFxcMHRlc3RJZFxcMG5lc3RkJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjci5pc0VuYWJsZWQoKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RTZXJ2aWNlLmxvZywgW1xuXHRcdFx0WydzdGFydCcsIDEsIFsncGFyZW50VGVzdElkXFwwdGVzdElkJ11dLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0VuYWJsZWRGb3JBQ2hpbGRPZicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3IuaXNFbmFibGVkKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3IuaXNFbmFibGVkRm9yQUNoaWxkT2YoJ3Rlc3RJZCcpLCBmYWxzZSk7XG5cdFx0Y3Iuc3RhcnQoW3Byb2ZpbGUxXSwgJ3Rlc3RJZFxcMGNoaWxkVGVzdElkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyLmlzRW5hYmxlZEZvckFDaGlsZE9mKCd0ZXN0SWQnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyLmlzRW5hYmxlZEZvckFDaGlsZE9mKCd0ZXN0SWRcXDBjaGlsZFRlc3RJZCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3IuaXNFbmFibGVkRm9yQUNoaWxkT2YoJ3Rlc3RJZFxcMGNoaWxkVGVzdElkXFwwbmVlc3RlZCcpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyLmlzRW5hYmxlZCgpLCB0cnVlKTtcblx0fSk7XG5cblx0c3VpdGUoJ2xpZmVjeWNsZScsICgpID0+IHtcblx0XHR0ZXN0KCdzdG9wcyBnZW5lcmFsIGluIERGUyBvcmRlcicsICgpID0+IHtcblx0XHRcdGNyLnN0YXJ0KFtwcm9maWxlMV0sICdhXFwwYlxcMGNcXDBkJyk7XG5cdFx0XHRjci5zdGFydChbcHJvZmlsZTFdLCAnYVxcMGInKTtcblx0XHRcdGNyLnN0YXJ0KFtwcm9maWxlMV0sICdhXFwwYlxcMGMnKTtcblx0XHRcdGNyLnN0b3AoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdFNlcnZpY2UubG9nLCBbXG5cdFx0XHRcdFsnc3RhcnQnLCAxLCBbJ2FcXDBiXFwwY1xcMGQnXV0sXG5cdFx0XHRcdFsnc3RhcnQnLCAxLCBbJ2FcXDBiJ11dLFxuXHRcdFx0XHRbJ3N0YXJ0JywgMSwgWydhXFwwYlxcMGMnXV0sXG5cdFx0XHRcdFsnc3RvcCcsIDEsIFsnYVxcMGJcXDBjXFwwZCddXSxcblx0XHRcdFx0WydzdG9wJywgMSwgWydhXFwwYlxcMGMnXV0sXG5cdFx0XHRcdFsnc3RvcCcsIDEsIFsnYVxcMGInXV0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjci5pc0VuYWJsZWQoKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcHMgcHJvZmlsZXMgaW4gREZTIG9yZGVyJywgKCkgPT4ge1xuXHRcdFx0Y3Iuc3RhcnQoW3Byb2ZpbGUxXSwgJ2FcXDBiXFwwY1xcMGQnKTtcblx0XHRcdGNyLnN0YXJ0KFtwcm9maWxlMV0sICdhXFwwYicpO1xuXHRcdFx0Y3Iuc3RhcnQoW3Byb2ZpbGUxXSwgJ2FcXDBiXFwwYycpO1xuXHRcdFx0Y3Iuc3RvcFByb2ZpbGUocHJvZmlsZTEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0U2VydmljZS5sb2csIFtcblx0XHRcdFx0WydzdGFydCcsIDEsIFsnYVxcMGJcXDBjXFwwZCddXSxcblx0XHRcdFx0WydzdGFydCcsIDEsIFsnYVxcMGInXV0sXG5cdFx0XHRcdFsnc3RhcnQnLCAxLCBbJ2FcXDBiXFwwYyddXSxcblx0XHRcdFx0WydzdG9wJywgMSwgWydhXFwwYlxcMGNcXDBkJ11dLFxuXHRcdFx0XHRbJ3N0b3AnLCAxLCBbJ2FcXDBiXFwwYyddXSxcblx0XHRcdFx0WydzdG9wJywgMSwgWydhXFwwYiddXSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyLmlzRW5hYmxlZCgpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIHByb2ZpbGUgZm9yIGEgdGVzdCBpZiBwcm9maWxlIGlzIGNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0XHRjci5zdGFydChbcHJvZmlsZTFdLCAncGFyZW50XFwwdGVzdElkJyk7XG5cdFx0XHRjci5zdGFydChbcHJvZmlsZTJdLCAncGFyZW50XFwwdGVzdElkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3IuaXNFbmFibGVkKCksIHRydWUpO1xuXHRcdFx0Y3Iuc3RvcCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyLmlzRW5hYmxlZCgpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RTZXJ2aWNlLmxvZywgW1xuXHRcdFx0XHRbJ3N0YXJ0JywgMSwgWydwYXJlbnRcXDB0ZXN0SWQnXV0sXG5cdFx0XHRcdFsnc3RhcnQnLCAyLCBbJ3BhcmVudFxcMHRlc3RJZCddXSxcblx0XHRcdFx0WydzdG9wJywgMSwgWydwYXJlbnRcXDB0ZXN0SWQnXV0sXG5cdFx0XHRcdFsnc3RvcCcsIDIsIFsncGFyZW50XFwwdGVzdElkJ11dLFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3IuaXNFbmFibGVkKCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3BzIGEgc2luZ2xlIHByb2ZpbGUgdGVzdCcsICgpID0+IHtcblx0XHRcdGNyLnN0YXJ0KFtwcm9maWxlMSwgcHJvZmlsZTJdLCAncGFyZW50XFwwdGVzdElkJyk7XG5cdFx0XHRjci5zdG9wUHJvZmlsZShwcm9maWxlMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RTZXJ2aWNlLmxvZywgW1xuXHRcdFx0XHRbJ3N0YXJ0JywgMSwgWydwYXJlbnRcXDB0ZXN0SWQnXV0sXG5cdFx0XHRcdFsnc3RhcnQnLCAyLCBbJ3BhcmVudFxcMHRlc3RJZCddXSxcblx0XHRcdFx0WydzdG9wJywgMSwgWydwYXJlbnRcXDB0ZXN0SWQnXV0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjci5pc0VuYWJsZWQoKSwgdHJ1ZSk7XG5cblx0XHRcdGNyLnN0b3BQcm9maWxlKHByb2ZpbGUyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdFNlcnZpY2UubG9nLCBbXG5cdFx0XHRcdFsnc3RhcnQnLCAxLCBbJ3BhcmVudFxcMHRlc3RJZCddXSxcblx0XHRcdFx0WydzdGFydCcsIDIsIFsncGFyZW50XFwwdGVzdElkJ11dLFxuXHRcdFx0XHRbJ3N0b3AnLCAxLCBbJ3BhcmVudFxcMHRlc3RJZCddXSxcblx0XHRcdFx0WydzdG9wJywgMiwgWydwYXJlbnRcXDB0ZXN0SWQnXV0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjci5pc0VuYWJsZWQoKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBRXhCLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLE1BQU0sMEJBQTBCO0FBQ3pDLFNBQXVDLG1DQUFtQztBQUcxRSxTQUFrRCw0QkFBNEI7QUFFOUUsTUFBTSwrQkFBK0IsTUFBTTtBQUMxQyxRQUFNLEtBQUssd0NBQXdDO0FBQ25ELE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxXQUE0QixFQUFFLFdBQVcsR0FBRyxjQUFjLFFBQVEsT0FBTyxxQkFBcUIsS0FBSyxPQUFPLFNBQVMsdUJBQXVCLE1BQU0sV0FBVyxPQUFPLHlCQUF5QixNQUFNLEtBQUssS0FBSztBQUNqTixRQUFNLFdBQTRCLEVBQUUsV0FBVyxHQUFHLGNBQWMsUUFBUSxPQUFPLHFCQUFxQixLQUFLLE9BQU8sU0FBUyx1QkFBdUIsTUFBTSxXQUFXLE9BQU8seUJBQXlCLE1BQU0sS0FBSyxLQUFLO0FBQUEsRUFFak4sTUFBTSx3QkFBd0IsS0FBbUIsRUFBRTtBQUFBLElBQW5EO0FBQUE7QUFDQyxXQUFPLFdBQVcsb0JBQUksSUFBNEI7QUFDbEQsV0FBTyxNQUF3RSxDQUFDO0FBQUE7QUFBQSxJQUV2RSxtQkFBbUIsS0FBNkIsT0FBeUM7QUFDakcsV0FBSyxTQUFTLElBQUksR0FBRztBQUNyQixXQUFLLElBQUksS0FBSyxDQUFDLFNBQVMsSUFBSSxRQUFRLENBQUMsRUFBRSxXQUFXLElBQUksUUFBUSxDQUFDLEVBQUUsT0FBTyxDQUFDO0FBQ3pFLFNBQUcsSUFBSSxNQUFNLHdCQUF3QixNQUFNO0FBQzFDLGFBQUssSUFBSSxLQUFLLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxFQUFFLFdBQVcsSUFBSSxRQUFRLENBQUMsRUFBRSxPQUFPLENBQUM7QUFDeEUsYUFBSyxTQUFTLE9BQU8sR0FBRztBQUFB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
