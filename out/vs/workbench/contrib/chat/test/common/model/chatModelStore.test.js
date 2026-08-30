import assert from "assert";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { ChatModelStore } from "../../../common/model/chatModelStore.js";
import { ChatAgentLocation } from "../../../common/constants.js";
import { MockChatModel } from "./mockChatModel.js";
suite("ChatModelStore", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let testObject;
  let createdModels;
  let willDisposePromises;
  setup(() => {
    createdModels = [];
    willDisposePromises = [];
    testObject = store.add(new ChatModelStore({
      createModel: (props) => {
        const model = new MockChatModel(props.sessionResource);
        createdModels.push(model);
        return model;
      },
      willDisposeModel: async (model) => {
        const p = new DeferredPromise();
        willDisposePromises.push(p);
        await p.p;
      }
    }, new NullLogService()));
  });
  test("create and dispose", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref = testObject.acquireOrCreate(props);
    assert.strictEqual(createdModels.length, 1);
    assert.strictEqual(ref.object, createdModels[0]);
    ref.dispose();
    assert.strictEqual(willDisposePromises.length, 1);
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
    assert.strictEqual(testObject.get(uri), void 0);
  });
  test("resurrection", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref1 = testObject.acquireOrCreate(props);
    const model1 = ref1.object;
    ref1.dispose();
    assert.strictEqual(willDisposePromises.length, 1);
    assert.strictEqual(testObject.get(uri), model1);
    const ref2 = testObject.acquireOrCreate(props);
    assert.strictEqual(ref2.object, model1);
    assert.strictEqual(createdModels.length, 1);
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
    assert.strictEqual(testObject.get(uri), model1);
    ref2.dispose();
  });
  test("get and has", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref = testObject.acquireOrCreate(props);
    assert.strictEqual(testObject.get(uri), ref.object);
    assert.strictEqual(testObject.has(uri), true);
    ref.dispose();
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
    assert.strictEqual(testObject.get(uri), void 0);
    assert.strictEqual(testObject.has(uri), false);
  });
  test("acquireExisting", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    assert.strictEqual(testObject.acquireExisting(uri), void 0);
    const ref1 = testObject.acquireOrCreate(props);
    const ref2 = testObject.acquireExisting(uri);
    assert.ok(ref2);
    assert.strictEqual(ref2.object, ref1.object);
    ref1.dispose();
    ref2.dispose();
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
  });
  test("values", async () => {
    const uri1 = URI.parse("test://session1");
    const uri2 = URI.parse("test://session2");
    const props1 = {
      sessionResource: uri1,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const props2 = {
      sessionResource: uri2,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref1 = testObject.acquireOrCreate(props1);
    const ref2 = testObject.acquireOrCreate(props2);
    const values = Array.from(testObject.values());
    assert.strictEqual(values.length, 2);
    assert.ok(values.includes(ref1.object));
    assert.ok(values.includes(ref2.object));
    ref1.dispose();
    ref2.dispose();
    willDisposePromises[0].complete();
    willDisposePromises[1].complete();
    await testObject.waitForModelDisposals();
  });
  test("dispose store", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref = testObject.acquireOrCreate(props);
    const model = ref.object;
    testObject.dispose();
    assert.strictEqual(model.isDisposed, true);
  });
  test("tracks reference owners and creation owner", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref1 = testObject.acquireOrCreate(props, "ChatModelStoreTest#create");
    const ref2 = testObject.acquireExisting(uri, "ChatModelStoreTest#existing");
    const ref3 = testObject.acquireExisting(uri, "ChatModelStoreTest#existing");
    assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
      totalModels: 1,
      totalReferences: 3,
      models: [{
        sessionResource: uri,
        title: "",
        createdBy: "ChatModelStoreTest#create",
        initialLocation: ChatAgentLocation.Chat,
        isImported: false,
        willKeepAlive: true,
        hasPendingEdits: false,
        pendingDisposal: false,
        referenceCount: 3,
        holders: [
          { holder: "ChatModelStoreTest#existing", count: 2 },
          { holder: "ChatModelStoreTest#create", count: 1 }
        ]
      }]
    });
    ref1.dispose();
    ref2?.dispose();
    ref3?.dispose();
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
  });
  test("reports pending disposal models without holders", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref = testObject.acquireOrCreate(props, "ChatModelStoreTest#create");
    ref.dispose();
    assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
      totalModels: 1,
      totalReferences: 0,
      models: [{
        sessionResource: uri,
        title: "",
        createdBy: "ChatModelStoreTest#create",
        initialLocation: ChatAgentLocation.Chat,
        isImported: false,
        willKeepAlive: true,
        hasPendingEdits: false,
        pendingDisposal: true,
        referenceCount: 0,
        holders: []
      }]
    });
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
  });
  test("resurrection preserves debug tracking", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref1 = testObject.acquireOrCreate(props, "OriginalCreator");
    ref1.dispose();
    const ref2 = testObject.acquireOrCreate(props, "Rescuer");
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
    assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
      totalModels: 1,
      totalReferences: 1,
      models: [{
        sessionResource: uri,
        title: "",
        createdBy: "OriginalCreator",
        initialLocation: ChatAgentLocation.Chat,
        isImported: false,
        willKeepAlive: true,
        hasPendingEdits: false,
        pendingDisposal: false,
        referenceCount: 1,
        holders: [{ holder: "Rescuer", count: 1 }]
      }]
    });
    ref2.dispose();
    willDisposePromises[1].complete();
    await testObject.waitForModelDisposals();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGNoYXRNb2RlbFN0b3JlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsU3RvcmUsIElTdGFydFNlc3Npb25Qcm9wcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWxTdG9yZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRNb2RlbCB9IGZyb20gJy4vbW9ja0NoYXRNb2RlbC5qcyc7XG5cbnN1aXRlKCdDaGF0TW9kZWxTdG9yZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgdGVzdE9iamVjdDogQ2hhdE1vZGVsU3RvcmU7XG5cdGxldCBjcmVhdGVkTW9kZWxzOiBNb2NrQ2hhdE1vZGVsW107XG5cdGxldCB3aWxsRGlzcG9zZVByb21pc2VzOiBEZWZlcnJlZFByb21pc2U8dm9pZD5bXTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y3JlYXRlZE1vZGVscyA9IFtdO1xuXHRcdHdpbGxEaXNwb3NlUHJvbWlzZXMgPSBbXTtcblx0XHR0ZXN0T2JqZWN0ID0gc3RvcmUuYWRkKG5ldyBDaGF0TW9kZWxTdG9yZSh7XG5cdFx0XHRjcmVhdGVNb2RlbDogKHByb3BzOiBJU3RhcnRTZXNzaW9uUHJvcHMpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgTW9ja0NoYXRNb2RlbChwcm9wcy5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRjcmVhdGVkTW9kZWxzLnB1c2gobW9kZWwpO1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwgYXMgdW5rbm93biBhcyBDaGF0TW9kZWw7XG5cdFx0XHR9LFxuXHRcdFx0d2lsbERpc3Bvc2VNb2RlbDogYXN5bmMgKG1vZGVsOiBDaGF0TW9kZWwpID0+IHtcblx0XHRcdFx0Y29uc3QgcCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdFx0d2lsbERpc3Bvc2VQcm9taXNlcy5wdXNoKHApO1xuXHRcdFx0XHRhd2FpdCBwLnA7XG5cdFx0XHR9XG5cdFx0fSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlIGFuZCBkaXNwb3NlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKTtcblx0XHRjb25zdCBwcm9wczogSVN0YXJ0U2Vzc2lvblByb3BzID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB1cmksXG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGNhblVzZVRvb2xzOiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZiA9IHRlc3RPYmplY3QuYWNxdWlyZU9yQ3JlYXRlKHByb3BzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZE1vZGVscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWYub2JqZWN0LCBjcmVhdGVkTW9kZWxzWzBdKTtcblxuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpbGxEaXNwb3NlUHJvbWlzZXMubGVuZ3RoLCAxKTtcblxuXHRcdHdpbGxEaXNwb3NlUHJvbWlzZXNbMF0uY29tcGxldGUoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndhaXRGb3JNb2RlbERpc3Bvc2FscygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldCh1cmkpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN1cnJlY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpO1xuXHRcdGNvbnN0IHByb3BzOiBJU3RhcnRTZXNzaW9uUHJvcHMgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVyaSxcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Y2FuVXNlVG9vbHM6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmMSA9IHRlc3RPYmplY3QuYWNxdWlyZU9yQ3JlYXRlKHByb3BzKTtcblx0XHRjb25zdCBtb2RlbDEgPSByZWYxLm9iamVjdDtcblx0XHRyZWYxLmRpc3Bvc2UoKTtcblxuXHRcdC8vIE1vZGVsIGlzIHBlbmRpbmcgZGlzcG9zYWxcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lsbERpc3Bvc2VQcm9taXNlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldCh1cmkpLCBtb2RlbDEpO1xuXG5cdFx0Ly8gQWNxdWlyZSBhZ2FpbiAtIHNob3VsZCBiZSByZXN1cnJlY3RlZFxuXHRcdGNvbnN0IHJlZjIgPSB0ZXN0T2JqZWN0LmFjcXVpcmVPckNyZWF0ZShwcm9wcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZjIub2JqZWN0LCBtb2RlbDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkTW9kZWxzLmxlbmd0aCwgMSk7XG5cblx0XHQvLyBGaW5pc2ggZGlzcG9zYWwgb2YgdGhlIGZpcnN0IHJlZlxuXHRcdHdpbGxEaXNwb3NlUHJvbWlzZXNbMF0uY29tcGxldGUoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndhaXRGb3JNb2RlbERpc3Bvc2FscygpO1xuXG5cdFx0Ly8gTW9kZWwgc2hvdWxkIHN0aWxsIGV4aXN0IGJlY2F1c2UgcmVmMiBob2xkcyBpdFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldCh1cmkpLCBtb2RlbDEpO1xuXG5cdFx0cmVmMi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldCBhbmQgaGFzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKTtcblx0XHRjb25zdCBwcm9wczogSVN0YXJ0U2Vzc2lvblByb3BzID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB1cmksXG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGNhblVzZVRvb2xzOiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZiA9IHRlc3RPYmplY3QuYWNxdWlyZU9yQ3JlYXRlKHByb3BzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXQodXJpKSwgcmVmLm9iamVjdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaGFzKHVyaSksIHRydWUpO1xuXG5cdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR3aWxsRGlzcG9zZVByb21pc2VzWzBdLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldCh1cmkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0Lmhhcyh1cmkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjcXVpcmVFeGlzdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyk7XG5cdFx0Y29uc3QgcHJvcHM6IElTdGFydFNlc3Npb25Qcm9wcyA9IHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLFxuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRjYW5Vc2VUb29sczogdHJ1ZVxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5hY3F1aXJlRXhpc3RpbmcodXJpKSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHJlZjEgPSB0ZXN0T2JqZWN0LmFjcXVpcmVPckNyZWF0ZShwcm9wcyk7XG5cdFx0Y29uc3QgcmVmMiA9IHRlc3RPYmplY3QuYWNxdWlyZUV4aXN0aW5nKHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHJlZjIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWYyLm9iamVjdCwgcmVmMS5vYmplY3QpO1xuXG5cdFx0cmVmMS5kaXNwb3NlKCk7XG5cdFx0cmVmMi5kaXNwb3NlKCk7XG5cdFx0d2lsbERpc3Bvc2VQcm9taXNlc1swXS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkxID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbjEnKTtcblx0XHRjb25zdCB1cmkyID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbjInKTtcblx0XHRjb25zdCBwcm9wczE6IElTdGFydFNlc3Npb25Qcm9wcyA9IHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpMSxcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Y2FuVXNlVG9vbHM6IHRydWVcblx0XHR9O1xuXHRcdGNvbnN0IHByb3BzMjogSVN0YXJ0U2Vzc2lvblByb3BzID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB1cmkyLFxuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRjYW5Vc2VUb29sczogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCByZWYxID0gdGVzdE9iamVjdC5hY3F1aXJlT3JDcmVhdGUocHJvcHMxKTtcblx0XHRjb25zdCByZWYyID0gdGVzdE9iamVjdC5hY3F1aXJlT3JDcmVhdGUocHJvcHMyKTtcblxuXHRcdGNvbnN0IHZhbHVlcyA9IEFycmF5LmZyb20odGVzdE9iamVjdC52YWx1ZXMoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vayh2YWx1ZXMuaW5jbHVkZXMocmVmMS5vYmplY3QpKTtcblx0XHRhc3NlcnQub2sodmFsdWVzLmluY2x1ZGVzKHJlZjIub2JqZWN0KSk7XG5cblx0XHRyZWYxLmRpc3Bvc2UoKTtcblx0XHRyZWYyLmRpc3Bvc2UoKTtcblx0XHR3aWxsRGlzcG9zZVByb21pc2VzWzBdLmNvbXBsZXRlKCk7XG5cdFx0d2lsbERpc3Bvc2VQcm9taXNlc1sxXS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2Ugc3RvcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpO1xuXHRcdGNvbnN0IHByb3BzOiBJU3RhcnRTZXNzaW9uUHJvcHMgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVyaSxcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Y2FuVXNlVG9vbHM6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmID0gdGVzdE9iamVjdC5hY3F1aXJlT3JDcmVhdGUocHJvcHMpO1xuXHRcdGNvbnN0IG1vZGVsID0gcmVmLm9iamVjdCBhcyB1bmtub3duIGFzIE1vY2tDaGF0TW9kZWw7XG5cdFx0dGVzdE9iamVjdC5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXNEaXNwb3NlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYWNrcyByZWZlcmVuY2Ugb3duZXJzIGFuZCBjcmVhdGlvbiBvd25lcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyk7XG5cdFx0Y29uc3QgcHJvcHM6IElTdGFydFNlc3Npb25Qcm9wcyA9IHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLFxuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRjYW5Vc2VUb29sczogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCByZWYxID0gdGVzdE9iamVjdC5hY3F1aXJlT3JDcmVhdGUocHJvcHMsICdDaGF0TW9kZWxTdG9yZVRlc3QjY3JlYXRlJyk7XG5cdFx0Y29uc3QgcmVmMiA9IHRlc3RPYmplY3QuYWNxdWlyZUV4aXN0aW5nKHVyaSwgJ0NoYXRNb2RlbFN0b3JlVGVzdCNleGlzdGluZycpO1xuXHRcdGNvbnN0IHJlZjMgPSB0ZXN0T2JqZWN0LmFjcXVpcmVFeGlzdGluZyh1cmksICdDaGF0TW9kZWxTdG9yZVRlc3QjZXhpc3RpbmcnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRSZWZlcmVuY2VEZWJ1Z1NuYXBzaG90KCksIHtcblx0XHRcdHRvdGFsTW9kZWxzOiAxLFxuXHRcdFx0dG90YWxSZWZlcmVuY2VzOiAzLFxuXHRcdFx0bW9kZWxzOiBbe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVyaSxcblx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRjcmVhdGVkQnk6ICdDaGF0TW9kZWxTdG9yZVRlc3QjY3JlYXRlJyxcblx0XHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRpc0ltcG9ydGVkOiBmYWxzZSxcblx0XHRcdFx0d2lsbEtlZXBBbGl2ZTogdHJ1ZSxcblx0XHRcdFx0aGFzUGVuZGluZ0VkaXRzOiBmYWxzZSxcblx0XHRcdFx0cGVuZGluZ0Rpc3Bvc2FsOiBmYWxzZSxcblx0XHRcdFx0cmVmZXJlbmNlQ291bnQ6IDMsXG5cdFx0XHRcdGhvbGRlcnM6IFtcblx0XHRcdFx0XHR7IGhvbGRlcjogJ0NoYXRNb2RlbFN0b3JlVGVzdCNleGlzdGluZycsIGNvdW50OiAyIH0sXG5cdFx0XHRcdFx0eyBob2xkZXI6ICdDaGF0TW9kZWxTdG9yZVRlc3QjY3JlYXRlJywgY291bnQ6IDEgfVxuXHRcdFx0XHRdXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0cmVmMS5kaXNwb3NlKCk7XG5cdFx0cmVmMj8uZGlzcG9zZSgpO1xuXHRcdHJlZjM/LmRpc3Bvc2UoKTtcblx0XHR3aWxsRGlzcG9zZVByb21pc2VzWzBdLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBwZW5kaW5nIGRpc3Bvc2FsIG1vZGVscyB3aXRob3V0IGhvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpO1xuXHRcdGNvbnN0IHByb3BzOiBJU3RhcnRTZXNzaW9uUHJvcHMgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVyaSxcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Y2FuVXNlVG9vbHM6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmID0gdGVzdE9iamVjdC5hY3F1aXJlT3JDcmVhdGUocHJvcHMsICdDaGF0TW9kZWxTdG9yZVRlc3QjY3JlYXRlJyk7XG5cdFx0cmVmLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRSZWZlcmVuY2VEZWJ1Z1NuYXBzaG90KCksIHtcblx0XHRcdHRvdGFsTW9kZWxzOiAxLFxuXHRcdFx0dG90YWxSZWZlcmVuY2VzOiAwLFxuXHRcdFx0bW9kZWxzOiBbe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVyaSxcblx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRjcmVhdGVkQnk6ICdDaGF0TW9kZWxTdG9yZVRlc3QjY3JlYXRlJyxcblx0XHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRpc0ltcG9ydGVkOiBmYWxzZSxcblx0XHRcdFx0d2lsbEtlZXBBbGl2ZTogdHJ1ZSxcblx0XHRcdFx0aGFzUGVuZGluZ0VkaXRzOiBmYWxzZSxcblx0XHRcdFx0cGVuZGluZ0Rpc3Bvc2FsOiB0cnVlLFxuXHRcdFx0XHRyZWZlcmVuY2VDb3VudDogMCxcblx0XHRcdFx0aG9sZGVyczogW11cblx0XHRcdH1dXG5cdFx0fSk7XG5cblx0XHR3aWxsRGlzcG9zZVByb21pc2VzWzBdLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdXJyZWN0aW9uIHByZXNlcnZlcyBkZWJ1ZyB0cmFja2luZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyk7XG5cdFx0Y29uc3QgcHJvcHM6IElTdGFydFNlc3Npb25Qcm9wcyA9IHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLFxuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRjYW5Vc2VUb29sczogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCByZWYxID0gdGVzdE9iamVjdC5hY3F1aXJlT3JDcmVhdGUocHJvcHMsICdPcmlnaW5hbENyZWF0b3InKTtcblx0XHRyZWYxLmRpc3Bvc2UoKTtcblxuXHRcdC8vIE1vZGVsIGlzIHBlbmRpbmcgZGlzcG9zYWwgXHUyMDE0IHJlLWFjcXVpcmUgYmVmb3JlIGRpc3Bvc2FsIGNvbXBsZXRlc1xuXHRcdGNvbnN0IHJlZjIgPSB0ZXN0T2JqZWN0LmFjcXVpcmVPckNyZWF0ZShwcm9wcywgJ1Jlc2N1ZXInKTtcblxuXHRcdC8vIENvbXBsZXRlIHRoZSBvbGQgZGlzcG9zYWwgXHUyMDE0IHNob3VsZCBOT1Qgd2lwZSB0aGUgbW9kZWwgb3IgdHJhY2tpbmdcblx0XHR3aWxsRGlzcG9zZVByb21pc2VzWzBdLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRSZWZlcmVuY2VEZWJ1Z1NuYXBzaG90KCksIHtcblx0XHRcdHRvdGFsTW9kZWxzOiAxLFxuXHRcdFx0dG90YWxSZWZlcmVuY2VzOiAxLFxuXHRcdFx0bW9kZWxzOiBbe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVyaSxcblx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRjcmVhdGVkQnk6ICdPcmlnaW5hbENyZWF0b3InLFxuXHRcdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdGlzSW1wb3J0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR3aWxsS2VlcEFsaXZlOiB0cnVlLFxuXHRcdFx0XHRoYXNQZW5kaW5nRWRpdHM6IGZhbHNlLFxuXHRcdFx0XHRwZW5kaW5nRGlzcG9zYWw6IGZhbHNlLFxuXHRcdFx0XHRyZWZlcmVuY2VDb3VudDogMSxcblx0XHRcdFx0aG9sZGVyczogW3sgaG9sZGVyOiAnUmVzY3VlcicsIGNvdW50OiAxIH1dXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0cmVmMi5kaXNwb3NlKCk7XG5cdFx0d2lsbERpc3Bvc2VQcm9taXNlc1sxXS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsc0JBQTBDO0FBQ25ELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBRTlCLE1BQU0sa0JBQWtCLE1BQU07QUFDN0IsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxvQkFBZ0IsQ0FBQztBQUNqQiwwQkFBc0IsQ0FBQztBQUN2QixpQkFBYSxNQUFN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
