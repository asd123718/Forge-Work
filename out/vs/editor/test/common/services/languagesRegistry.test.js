import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { LanguagesRegistry } from "../../../common/services/languagesRegistry.js";
suite("LanguagesRegistry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("output language does not have a name", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "outputLangId",
      extensions: [],
      aliases: [],
      mimetypes: ["outputLanguageMimeType"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), []);
    registry.dispose();
  });
  test("language with alias does have a name", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId",
      extensions: [],
      aliases: ["LangName"],
      mimetypes: ["bla"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "LangName", languageId: "langId" }]);
    assert.deepStrictEqual(registry.getLanguageName("langId"), "LangName");
    registry.dispose();
  });
  test("language without alias gets a name", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId",
      extensions: [],
      mimetypes: ["bla"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "langId", languageId: "langId" }]);
    assert.deepStrictEqual(registry.getLanguageName("langId"), "langId");
    registry.dispose();
  });
  test("bug #4360: f# not shown in status bar", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId",
      extensions: [".ext1"],
      aliases: ["LangName"],
      mimetypes: ["bla"]
    }]);
    registry._registerLanguages([{
      id: "langId",
      extensions: [".ext2"],
      aliases: [],
      mimetypes: ["bla"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "LangName", languageId: "langId" }]);
    assert.deepStrictEqual(registry.getLanguageName("langId"), "LangName");
    registry.dispose();
  });
  test("issue #5278: Extension cannot override language name anymore", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId",
      extensions: [".ext1"],
      aliases: ["LangName"],
      mimetypes: ["bla"]
    }]);
    registry._registerLanguages([{
      id: "langId",
      extensions: [".ext2"],
      aliases: ["BetterLanguageName"],
      mimetypes: ["bla"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "BetterLanguageName", languageId: "langId" }]);
    assert.deepStrictEqual(registry.getLanguageName("langId"), "BetterLanguageName");
    registry.dispose();
  });
  test("mimetypes are generated if necessary", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId"
    }]);
    assert.deepStrictEqual(registry.getMimeType("langId"), "text/x-langId");
    registry.dispose();
  });
  test("first mimetype wins", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId",
      mimetypes: ["text/langId", "text/langId2"]
    }]);
    assert.deepStrictEqual(registry.getMimeType("langId"), "text/langId");
    registry.dispose();
  });
  test("first mimetype wins 2", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId"
    }]);
    registry._registerLanguages([{
      id: "langId",
      mimetypes: ["text/langId"]
    }]);
    assert.deepStrictEqual(registry.getMimeType("langId"), "text/x-langId");
    registry.dispose();
  });
  test("aliases", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a"
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "a", languageId: "a" }]);
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageName("a"), "a");
    registry._registerLanguages([{
      id: "a",
      aliases: ["A1", "A2"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "A1", languageId: "a" }]);
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a1"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a2"), "a");
    assert.deepStrictEqual(registry.getLanguageName("a"), "A1");
    registry._registerLanguages([{
      id: "a",
      aliases: ["A3", "A4"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "A3", languageId: "a" }]);
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a1"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a2"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a3"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a4"), "a");
    assert.deepStrictEqual(registry.getLanguageName("a"), "A3");
    registry.dispose();
  });
  test("empty aliases array means no alias", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a"
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "a", languageId: "a" }]);
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageName("a"), "a");
    registry._registerLanguages([{
      id: "b",
      aliases: []
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "a", languageId: "a" }]);
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("b"), "b");
    assert.deepStrictEqual(registry.getLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageName("b"), null);
    registry.dispose();
  });
  test("extensions", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a",
      aliases: ["aName"],
      extensions: ["aExt"]
    }]);
    assert.deepStrictEqual(registry.getExtensions("a"), ["aExt"]);
    registry._registerLanguages([{
      id: "a",
      extensions: ["aExt2"]
    }]);
    assert.deepStrictEqual(registry.getExtensions("a"), ["aExt", "aExt2"]);
    registry.dispose();
  });
  test("extensions of primary language registration come first", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a",
      extensions: ["aExt3"]
    }]);
    assert.deepStrictEqual(registry.getExtensions("a")[0], "aExt3");
    registry._registerLanguages([{
      id: "a",
      configuration: URI.file("conf.json"),
      extensions: ["aExt"]
    }]);
    assert.deepStrictEqual(registry.getExtensions("a")[0], "aExt");
    registry._registerLanguages([{
      id: "a",
      extensions: ["aExt2"]
    }]);
    assert.deepStrictEqual(registry.getExtensions("a")[0], "aExt");
    registry.dispose();
  });
  test("filenames", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a",
      aliases: ["aName"],
      filenames: ["aFilename"]
    }]);
    assert.deepStrictEqual(registry.getFilenames("a"), ["aFilename"]);
    registry._registerLanguages([{
      id: "a",
      filenames: ["aFilename2"]
    }]);
    assert.deepStrictEqual(registry.getFilenames("a"), ["aFilename", "aFilename2"]);
    registry.dispose();
  });
  test("configuration", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a",
      aliases: ["aName"],
      configuration: URI.file("/path/to/aFilename")
    }]);
    assert.deepStrictEqual(registry.getConfigurationFiles("a"), [URI.file("/path/to/aFilename")]);
    assert.deepStrictEqual(registry.getConfigurationFiles("aname"), []);
    assert.deepStrictEqual(registry.getConfigurationFiles("aName"), []);
    registry._registerLanguages([{
      id: "a",
      configuration: URI.file("/path/to/aFilename2")
    }]);
    assert.deepStrictEqual(registry.getConfigurationFiles("a"), [URI.file("/path/to/aFilename"), URI.file("/path/to/aFilename2")]);
    assert.deepStrictEqual(registry.getConfigurationFiles("aname"), []);
    assert.deepStrictEqual(registry.getConfigurationFiles("aName"), []);
    registry.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcc2VydmljZXNcXGxhbmd1YWdlc1JlZ2lzdHJ5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZXNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZXNSZWdpc3RyeS5qcyc7XG5cbnN1aXRlKCdMYW5ndWFnZXNSZWdpc3RyeScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdvdXRwdXQgbGFuZ3VhZ2UgZG9lcyBub3QgaGF2ZSBhIG5hbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ291dHB1dExhbmdJZCcsXG5cdFx0XHRleHRlbnNpb25zOiBbXSxcblx0XHRcdGFsaWFzZXM6IFtdLFxuXHRcdFx0bWltZXR5cGVzOiBbJ291dHB1dExhbmd1YWdlTWltZVR5cGUnXSxcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldFNvcnRlZFJlZ2lzdGVyZWRMYW5ndWFnZU5hbWVzKCksIFtdKTtcblxuXHRcdHJlZ2lzdHJ5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbGFuZ3VhZ2Ugd2l0aCBhbGlhcyBkb2VzIGhhdmUgYSBuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IExhbmd1YWdlc1JlZ2lzdHJ5KGZhbHNlKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdsYW5nSWQnLFxuXHRcdFx0ZXh0ZW5zaW9uczogW10sXG5cdFx0XHRhbGlhc2VzOiBbJ0xhbmdOYW1lJ10sXG5cdFx0XHRtaW1ldHlwZXM6IFsnYmxhJ10sXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpLCBbeyBsYW5ndWFnZU5hbWU6ICdMYW5nTmFtZScsIGxhbmd1YWdlSWQ6ICdsYW5nSWQnIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlTmFtZSgnbGFuZ0lkJyksICdMYW5nTmFtZScpO1xuXG5cdFx0cmVnaXN0cnkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdsYW5ndWFnZSB3aXRob3V0IGFsaWFzIGdldHMgYSBuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IExhbmd1YWdlc1JlZ2lzdHJ5KGZhbHNlKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdsYW5nSWQnLFxuXHRcdFx0ZXh0ZW5zaW9uczogW10sXG5cdFx0XHRtaW1ldHlwZXM6IFsnYmxhJ10sXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpLCBbeyBsYW5ndWFnZU5hbWU6ICdsYW5nSWQnLCBsYW5ndWFnZUlkOiAnbGFuZ0lkJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZU5hbWUoJ2xhbmdJZCcpLCAnbGFuZ0lkJyk7XG5cblx0XHRyZWdpc3RyeS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZyAjNDM2MDogZiMgbm90IHNob3duIGluIHN0YXR1cyBiYXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2xhbmdJZCcsXG5cdFx0XHRleHRlbnNpb25zOiBbJy5leHQxJ10sXG5cdFx0XHRhbGlhc2VzOiBbJ0xhbmdOYW1lJ10sXG5cdFx0XHRtaW1ldHlwZXM6IFsnYmxhJ10sXG5cdFx0fV0pO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2xhbmdJZCcsXG5cdFx0XHRleHRlbnNpb25zOiBbJy5leHQyJ10sXG5cdFx0XHRhbGlhc2VzOiBbXSxcblx0XHRcdG1pbWV0eXBlczogWydibGEnXSxcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldFNvcnRlZFJlZ2lzdGVyZWRMYW5ndWFnZU5hbWVzKCksIFt7IGxhbmd1YWdlTmFtZTogJ0xhbmdOYW1lJywgbGFuZ3VhZ2VJZDogJ2xhbmdJZCcgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VOYW1lKCdsYW5nSWQnKSwgJ0xhbmdOYW1lJyk7XG5cblx0XHRyZWdpc3RyeS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM1Mjc4OiBFeHRlbnNpb24gY2Fubm90IG92ZXJyaWRlIGxhbmd1YWdlIG5hbWUgYW55bW9yZScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBMYW5ndWFnZXNSZWdpc3RyeShmYWxzZSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnbGFuZ0lkJyxcblx0XHRcdGV4dGVuc2lvbnM6IFsnLmV4dDEnXSxcblx0XHRcdGFsaWFzZXM6IFsnTGFuZ05hbWUnXSxcblx0XHRcdG1pbWV0eXBlczogWydibGEnXSxcblx0XHR9XSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnbGFuZ0lkJyxcblx0XHRcdGV4dGVuc2lvbnM6IFsnLmV4dDInXSxcblx0XHRcdGFsaWFzZXM6IFsnQmV0dGVyTGFuZ3VhZ2VOYW1lJ10sXG5cdFx0XHRtaW1ldHlwZXM6IFsnYmxhJ10sXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpLCBbeyBsYW5ndWFnZU5hbWU6ICdCZXR0ZXJMYW5ndWFnZU5hbWUnLCBsYW5ndWFnZUlkOiAnbGFuZ0lkJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZU5hbWUoJ2xhbmdJZCcpLCAnQmV0dGVyTGFuZ3VhZ2VOYW1lJyk7XG5cblx0XHRyZWdpc3RyeS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pbWV0eXBlcyBhcmUgZ2VuZXJhdGVkIGlmIG5lY2Vzc2FyeScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBMYW5ndWFnZXNSZWdpc3RyeShmYWxzZSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnbGFuZ0lkJ1xuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TWltZVR5cGUoJ2xhbmdJZCcpLCAndGV4dC94LWxhbmdJZCcpO1xuXG5cdFx0cmVnaXN0cnkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCBtaW1ldHlwZSB3aW5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IExhbmd1YWdlc1JlZ2lzdHJ5KGZhbHNlKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdsYW5nSWQnLFxuXHRcdFx0bWltZXR5cGVzOiBbJ3RleHQvbGFuZ0lkJywgJ3RleHQvbGFuZ0lkMiddXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRNaW1lVHlwZSgnbGFuZ0lkJyksICd0ZXh0L2xhbmdJZCcpO1xuXG5cdFx0cmVnaXN0cnkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJzdCBtaW1ldHlwZSB3aW5zIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2xhbmdJZCdcblx0XHR9XSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnbGFuZ0lkJyxcblx0XHRcdG1pbWV0eXBlczogWyd0ZXh0L2xhbmdJZCddXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRNaW1lVHlwZSgnbGFuZ0lkJyksICd0ZXh0L3gtbGFuZ0lkJyk7XG5cblx0XHRyZWdpc3RyeS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsaWFzZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpLCBbeyBsYW5ndWFnZU5hbWU6ICdhJywgbGFuZ3VhZ2VJZDogJ2EnIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYScpLCAnYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VOYW1lKCdhJyksICdhJyk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnYScsXG5cdFx0XHRhbGlhc2VzOiBbJ0ExJywgJ0EyJ11cblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldFNvcnRlZFJlZ2lzdGVyZWRMYW5ndWFnZU5hbWVzKCksIFt7IGxhbmd1YWdlTmFtZTogJ0ExJywgbGFuZ3VhZ2VJZDogJ2EnIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYScpLCAnYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKCdhMScpLCAnYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKCdhMicpLCAnYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VOYW1lKCdhJyksICdBMScpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0YWxpYXNlczogWydBMycsICdBNCddXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpLCBbeyBsYW5ndWFnZU5hbWU6ICdBMycsIGxhbmd1YWdlSWQ6ICdhJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUoJ2EnKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYTEnKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYTInKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYTMnKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYTQnKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlTmFtZSgnYScpLCAnQTMnKTtcblxuXHRcdHJlZ2lzdHJ5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgYWxpYXNlcyBhcnJheSBtZWFucyBubyBhbGlhcycsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBMYW5ndWFnZXNSZWdpc3RyeShmYWxzZSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnYSdcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldFNvcnRlZFJlZ2lzdGVyZWRMYW5ndWFnZU5hbWVzKCksIFt7IGxhbmd1YWdlTmFtZTogJ2EnLCBsYW5ndWFnZUlkOiAnYScgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKCdhJyksICdhJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZU5hbWUoJ2EnKSwgJ2EnKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdiJyxcblx0XHRcdGFsaWFzZXM6IFtdXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpLCBbeyBsYW5ndWFnZU5hbWU6ICdhJywgbGFuZ3VhZ2VJZDogJ2EnIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYScpLCAnYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKCdiJyksICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZU5hbWUoJ2EnKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlTmFtZSgnYicpLCBudWxsKTtcblxuXHRcdHJlZ2lzdHJ5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBMYW5ndWFnZXNSZWdpc3RyeShmYWxzZSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnYScsXG5cdFx0XHRhbGlhc2VzOiBbJ2FOYW1lJ10sXG5cdFx0XHRleHRlbnNpb25zOiBbJ2FFeHQnXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0RXh0ZW5zaW9ucygnYScpLCBbJ2FFeHQnXSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnYScsXG5cdFx0XHRleHRlbnNpb25zOiBbJ2FFeHQyJ11cblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldEV4dGVuc2lvbnMoJ2EnKSwgWydhRXh0JywgJ2FFeHQyJ10pO1xuXG5cdFx0cmVnaXN0cnkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRlbnNpb25zIG9mIHByaW1hcnkgbGFuZ3VhZ2UgcmVnaXN0cmF0aW9uIGNvbWUgZmlyc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0ZXh0ZW5zaW9uczogWydhRXh0MyddXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRFeHRlbnNpb25zKCdhJylbMF0sICdhRXh0MycpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogVVJJLmZpbGUoJ2NvbmYuanNvbicpLFxuXHRcdFx0ZXh0ZW5zaW9uczogWydhRXh0J11cblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldEV4dGVuc2lvbnMoJ2EnKVswXSwgJ2FFeHQnKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdhJyxcblx0XHRcdGV4dGVuc2lvbnM6IFsnYUV4dDInXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0RXh0ZW5zaW9ucygnYScpWzBdLCAnYUV4dCcpO1xuXG5cdFx0cmVnaXN0cnkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlbmFtZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0YWxpYXNlczogWydhTmFtZSddLFxuXHRcdFx0ZmlsZW5hbWVzOiBbJ2FGaWxlbmFtZSddXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRGaWxlbmFtZXMoJ2EnKSwgWydhRmlsZW5hbWUnXSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnYScsXG5cdFx0XHRmaWxlbmFtZXM6IFsnYUZpbGVuYW1lMiddXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRGaWxlbmFtZXMoJ2EnKSwgWydhRmlsZW5hbWUnLCAnYUZpbGVuYW1lMiddKTtcblxuXHRcdHJlZ2lzdHJ5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBMYW5ndWFnZXNSZWdpc3RyeShmYWxzZSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnYScsXG5cdFx0XHRhbGlhc2VzOiBbJ2FOYW1lJ10sXG5cdFx0XHRjb25maWd1cmF0aW9uOiBVUkkuZmlsZSgnL3BhdGgvdG8vYUZpbGVuYW1lJylcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25GaWxlcygnYScpLCBbVVJJLmZpbGUoJy9wYXRoL3RvL2FGaWxlbmFtZScpXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uRmlsZXMoJ2FuYW1lJyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25GaWxlcygnYU5hbWUnKSwgW10pO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogVVJJLmZpbGUoJy9wYXRoL3RvL2FGaWxlbmFtZTInKVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvbkZpbGVzKCdhJyksIFtVUkkuZmlsZSgnL3BhdGgvdG8vYUZpbGVuYW1lJyksIFVSSS5maWxlKCcvcGF0aC90by9hRmlsZW5hbWUyJyldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25GaWxlcygnYW5hbWUnKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvbkZpbGVzKCdhTmFtZScpLCBbXSk7XG5cblx0XHRyZWdpc3RyeS5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBRWxDLE1BQU0scUJBQXFCLE1BQU07QUFFaEMsMENBQXdDO0FBRXhDLE9BQUssd0NBQXdDLE1B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
