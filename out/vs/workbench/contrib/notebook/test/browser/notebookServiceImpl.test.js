import assert from "assert";
import { Event } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NotebookProviderInfoStore } from "../../browser/services/notebookServiceImpl.js";
import { NotebookProviderInfo } from "../../common/notebookProvider.js";
import { EditorResolverService } from "../../../../services/editor/browser/editorResolverService.js";
import { RegisteredEditorPriority } from "../../../../services/editor/common/editorResolverService.js";
import { nullExtensionDescription } from "../../../../services/extensions/common/extensions.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
suite("NotebookProviderInfoStore", function() {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("Can't open untitled notebooks in test #119363", function() {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const store = new NotebookProviderInfoStore(
      new class extends mock() {
        get() {
          return "";
        }
        store() {
        }
        getObject() {
          return {};
        }
      }(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidRegisterExtensions = Event.None;
        }
      }(),
      disposables.add(instantiationService.createInstance(EditorResolverService)),
      new TestConfigurationService(),
      new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeScreenReaderOptimized = Event.None;
        }
      }(),
      instantiationService,
      new class extends mock() {
        hasProvider() {
          return true;
        }
      }(),
      new class extends mock() {
      }(),
      new class extends mock() {
      }()
    );
    disposables.add(store);
    const fooInfo = new NotebookProviderInfo({
      extension: nullExtensionDescription.identifier,
      id: "foo",
      displayName: "foo",
      selectors: [{ filenamePattern: "*.foo" }],
      priority: RegisteredEditorPriority.default,
      providerDisplayName: "foo"
    });
    const barInfo = new NotebookProviderInfo({
      extension: nullExtensionDescription.identifier,
      id: "bar",
      displayName: "bar",
      selectors: [{ filenamePattern: "*.bar" }],
      priority: RegisteredEditorPriority.default,
      providerDisplayName: "bar"
    });
    store.add(fooInfo);
    store.add(barInfo);
    assert.ok(store.get("foo"));
    assert.ok(store.get("bar"));
    assert.ok(!store.get("barfoo"));
    let providers = store.getContributedNotebook(URI.parse("file:///test/nb.foo"));
    assert.strictEqual(providers.length, 1);
    assert.strictEqual(providers[0] === fooInfo, true);
    providers = store.getContributedNotebook(URI.parse("file:///test/nb.bar"));
    assert.strictEqual(providers.length, 1);
    assert.strictEqual(providers[0] === barInfo, true);
    providers = store.getContributedNotebook(URI.parse("untitled:///Untitled-1"));
    assert.strictEqual(providers.length, 2);
    assert.strictEqual(providers[0] === fooInfo, true);
    assert.strictEqual(providers[1] === barInfo, true);
    providers = store.getContributedNotebook(URI.parse("untitled:///test/nb.bar"));
    assert.strictEqual(providers.length, 1);
    assert.strictEqual(providers[0] === barInfo, true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va1NlcnZpY2VJbXBsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1Byb3ZpZGVySW5mb1N0b3JlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tQcm92aWRlckluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvYnJvd3Nlci9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcblxuc3VpdGUoJ05vdGVib29rUHJvdmlkZXJJbmZvU3RvcmUnLCBmdW5jdGlvbiAoKSB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCkgYXMgUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPjtcblxuXHR0ZXN0KCdDYW5cXCd0IG9wZW4gdW50aXRsZWQgbm90ZWJvb2tzIGluIHRlc3QgIzExOTM2MycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IE5vdGVib29rUHJvdmlkZXJJbmZvU3RvcmUoXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTdG9yYWdlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGdldCgpIHsgcmV0dXJuICcnOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHN0b3JlKCkgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldE9iamVjdCgpIHsgcmV0dXJuIHt9OyB9XG5cdFx0XHR9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0ZW5zaW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG9uRGlkUmVnaXN0ZXJFeHRlbnNpb25zID0gRXZlbnQuTm9uZTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKSksXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBY2Nlc3NpYmlsaXR5U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9LFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGhhc1Byb3ZpZGVyKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0fSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVXJpSWRlbnRpdHlTZXJ2aWNlPigpIHsgfVxuXHRcdCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN0b3JlKTtcblxuXHRcdGNvbnN0IGZvb0luZm8gPSBuZXcgTm90ZWJvb2tQcm92aWRlckluZm8oe1xuXHRcdFx0ZXh0ZW5zaW9uOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdGlkOiAnZm9vJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnZm9vJyxcblx0XHRcdHNlbGVjdG9yczogW3sgZmlsZW5hbWVQYXR0ZXJuOiAnKi5mb28nIH1dLFxuXHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5kZWZhdWx0LFxuXHRcdFx0cHJvdmlkZXJEaXNwbGF5TmFtZTogJ2ZvbycsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYmFySW5mbyA9IG5ldyBOb3RlYm9va1Byb3ZpZGVySW5mbyh7XG5cdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0aWQ6ICdiYXInLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdiYXInLFxuXHRcdFx0c2VsZWN0b3JzOiBbeyBmaWxlbmFtZVBhdHRlcm46ICcqLmJhcicgfV0sXG5cdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHQsXG5cdFx0XHRwcm92aWRlckRpc3BsYXlOYW1lOiAnYmFyJyxcblx0XHR9KTtcblxuXHRcdHN0b3JlLmFkZChmb29JbmZvKTtcblx0XHRzdG9yZS5hZGQoYmFySW5mbyk7XG5cblx0XHRhc3NlcnQub2soc3RvcmUuZ2V0KCdmb28nKSk7XG5cdFx0YXNzZXJ0Lm9rKHN0b3JlLmdldCgnYmFyJykpO1xuXHRcdGFzc2VydC5vayghc3RvcmUuZ2V0KCdiYXJmb28nKSk7XG5cblx0XHRsZXQgcHJvdmlkZXJzID0gc3RvcmUuZ2V0Q29udHJpYnV0ZWROb3RlYm9vayhVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9uYi5mb28nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcnNbMF0gPT09IGZvb0luZm8sIHRydWUpO1xuXG5cdFx0cHJvdmlkZXJzID0gc3RvcmUuZ2V0Q29udHJpYnV0ZWROb3RlYm9vayhVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9uYi5iYXInKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcnNbMF0gPT09IGJhckluZm8sIHRydWUpO1xuXG5cdFx0cHJvdmlkZXJzID0gc3RvcmUuZ2V0Q29udHJpYnV0ZWROb3RlYm9vayhVUkkucGFyc2UoJ3VudGl0bGVkOi8vL1VudGl0bGVkLTEnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVycy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcnNbMF0gPT09IGZvb0luZm8sIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcnNbMV0gPT09IGJhckluZm8sIHRydWUpO1xuXG5cdFx0cHJvdmlkZXJzID0gc3RvcmUuZ2V0Q29udHJpYnV0ZWROb3RlYm9vayhVUkkucGFyc2UoJ3VudGl0bGVkOi8vL3Rlc3QvbmIuYmFyJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJzWzBdID09PSBiYXJJbmZvLCB0cnVlKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYTtBQUV0QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsZ0NBQWdDO0FBSXpDLFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQTRCLGdDQUFnQztBQUM1RCxTQUFTLHFDQUFxQztBQUU5QyxNQUFNLDZCQUE2QixXQUFZO0FBQzlDLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSyxpREFBa0QsV0FBWTtBQUNsRSxVQUFNLHVCQUF1Qiw4QkFBOEIsUUFBVyxXQUFXO0FBQ2pGLFVBQU0sUUFBUSxJQUFJO0FBQUEsTUFDakIsSUFBSSxjQUFjLEtBQXNCLEVBQUU7QUFBQSxRQUNoQyxNQUFNO0FBQUUsaUJBQU87QUFBQSxRQUFJO0FBQUEsUUFDbkIsUUFBUTtBQUFBLFFBQUU7QUFBQSxRQUNWLFlBQVk7QUFBRSxpQkFBTyxDQUFDO0FB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
