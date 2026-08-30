import assert from "assert";
import { TestInstantiationService } from "../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { Event } from "../../../base/common/event.js";
import { URI } from "../../../base/common/uri.js";
import { IFileService } from "../../../platform/files/common/files.js";
import { ILogService, NullLogService } from "../../../platform/log/common/log.js";
import { ITelemetryService, TelemetryLevel } from "../../../platform/telemetry/common/telemetry.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../platform/configuration/test/common/testConfigurationService.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { ModelService } from "../../../editor/common/services/modelService.js";
import { FileService } from "../../../platform/files/common/fileService.js";
import { Schemas } from "../../../base/common/network.js";
import { TestIPCFileSystemProvider } from "./workbenchTestServices.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { LanguageService } from "../../../editor/common/services/languageService.js";
import { TestColorTheme, TestThemeService } from "../../../platform/theme/test/common/testThemeService.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { ITextResourcePropertiesService } from "../../../editor/common/services/textResourceConfiguration.js";
import { TestTextResourcePropertiesService } from "../common/workbenchTestServices.js";
import { TestLanguageConfigurationService } from "../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { ILanguageConfigurationService } from "../../../editor/common/languages/languageConfigurationRegistry.js";
import { IUndoRedoService } from "../../../platform/undoRedo/common/undoRedo.js";
import { UndoRedoService } from "../../../platform/undoRedo/common/undoRedoService.js";
import { TestDialogService } from "../../../platform/dialogs/test/common/testDialogService.js";
import { TestNotificationService } from "../../../platform/notification/test/common/testNotificationService.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { TokenStyle } from "../../../platform/theme/common/tokenClassificationRegistry.js";
import { Color } from "../../../base/common/color.js";
import { Range } from "../../../editor/common/core/range.js";
import { ITreeSitterLibraryService } from "../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { TreeSitterLibraryService } from "../../services/treeSitter/browser/treeSitterLibraryService.js";
import { autorunHandleChanges, recordChanges, waitForState } from "../../../base/common/observable.js";
import { ITreeSitterThemeService } from "../../../editor/common/services/treeSitter/treeSitterThemeService.js";
import { TreeSitterThemeService } from "../../services/treeSitter/browser/treeSitterThemeService.js";
class MockTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.NONE;
    this.sessionId = "";
    this.machineId = "";
    this.sqmId = "";
    this.devDeviceId = "";
    this.firstSessionDate = "";
    this.sendErrorTelemetry = false;
  }
  publicLog(eventName, data) {
  }
  publicLog2(eventName, data) {
  }
  publicLogError(errorEventName, data) {
  }
  publicLogError2(eventName, data) {
  }
  setExperimentProperty(name, value) {
  }
  setCommonProperty(name, value) {
  }
}
class TestTreeSitterColorTheme extends TestColorTheme {
  resolveScopes(scopes, definitions) {
    return new TokenStyle(Color.red, void 0, void 0, void 0, void 0);
  }
  getTokenColorIndex() {
    return { get: () => 10 };
  }
}
suite("Tree Sitter TokenizationFeature", function() {
  let instantiationService;
  let modelService;
  let fileService;
  let textResourcePropertiesService;
  let languageConfigurationService;
  let telemetryService;
  let logService;
  let configurationService;
  let themeService;
  let languageService;
  let environmentService;
  let disposables;
  setup(async () => {
    disposables = new DisposableStore();
    instantiationService = disposables.add(new TestInstantiationService());
    telemetryService = new MockTelemetryService();
    logService = new NullLogService();
    configurationService = new TestConfigurationService({ "editor.experimental.preferTreeSitter.typescript": true });
    themeService = new TestThemeService(new TestTreeSitterColorTheme());
    environmentService = {};
    instantiationService.set(IEnvironmentService, environmentService);
    instantiationService.set(IConfigurationService, configurationService);
    instantiationService.set(ILogService, logService);
    instantiationService.set(ITelemetryService, telemetryService);
    languageService = disposables.add(instantiationService.createInstance(LanguageService));
    instantiationService.set(ILanguageService, languageService);
    instantiationService.set(IThemeService, themeService);
    textResourcePropertiesService = instantiationService.createInstance(TestTextResourcePropertiesService);
    instantiationService.set(ITextResourcePropertiesService, textResourcePropertiesService);
    languageConfigurationService = disposables.add(instantiationService.createInstance(TestLanguageConfigurationService));
    instantiationService.set(ILanguageConfigurationService, languageConfigurationService);
    fileService = disposables.add(instantiationService.createInstance(FileService));
    const fileSystemProvider = new TestIPCFileSystemProvider();
    disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    instantiationService.set(IFileService, fileService);
    const libraryService = disposables.add(instantiationService.createInstance(TreeSitterLibraryService));
    libraryService.isTest = true;
    instantiationService.set(ITreeSitterLibraryService, libraryService);
    instantiationService.set(ITreeSitterThemeService, instantiationService.createInstance(TreeSitterThemeService));
    const dialogService = new TestDialogService();
    const notificationService = new TestNotificationService();
    const undoRedoService = new UndoRedoService(dialogService, notificationService);
    instantiationService.set(IUndoRedoService, undoRedoService);
    modelService = new ModelService(
      configurationService,
      textResourcePropertiesService,
      undoRedoService,
      instantiationService
    );
    instantiationService.set(IModelService, modelService);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function tokensContentSize(tokens) {
    return tokens[tokens.length - 1].startOffsetInclusive + tokens[tokens.length - 1].length;
  }
  let nameNumber = 1;
  async function getModelAndPrepTree(content) {
    const model = disposables.add(modelService.createModel(content, { languageId: "typescript", onDidChange: Event.None }, URI.file(`file${nameNumber++}.ts`)));
    const treeSitterTreeObs = disposables.add(model.tokenization.tokens.get()).tree;
    const tokenizationImplObs = disposables.add(model.tokenization.tokens.get()).tokenizationImpl;
    const treeSitterTree = treeSitterTreeObs.get() ?? await waitForState(treeSitterTreeObs);
    if (!treeSitterTree.tree.get()) {
      await waitForState(treeSitterTree.tree);
    }
    const tokenizationImpl = tokenizationImplObs.get() ?? await waitForState(tokenizationImplObs);
    assert.ok(treeSitterTree);
    return { model, treeSitterTree, tokenizationImpl };
  }
  function verifyTokens(tokens) {
    assert.ok(tokens);
    for (let i = 1; i < tokens.length; i++) {
      const previousToken = tokens[i - 1];
      const token = tokens[i];
      assert.deepStrictEqual(previousToken.startOffsetInclusive + previousToken.length, token.startOffsetInclusive);
    }
  }
  test("Three changes come back to back ", async () => {
    const content = `/**
**/
class x {
}




class y {
}`;
    const { model, treeSitterTree } = await getModelAndPrepTree(content);
    let updateListener;
    const changePromise = new Promise((resolve) => {
      updateListener = autorunHandleChanges({
        owner: this,
        changeTracker: recordChanges({ tree: treeSitterTree.tree })
      }, (reader, ctx) => {
        const changeEvent = ctx.changes.at(0)?.change;
        if (changeEvent) {
          resolve(changeEvent);
        }
      });
    });
    const edit1 = new Promise((resolve) => {
      model.applyEdits([{ range: new Range(7, 1, 8, 1), text: "" }]);
      resolve();
    });
    const edit2 = new Promise((resolve) => {
      model.applyEdits([{ range: new Range(6, 1, 7, 1), text: "" }]);
      resolve();
    });
    const edit3 = new Promise((resolve) => {
      model.applyEdits([{ range: new Range(5, 1, 6, 1), text: "" }]);
      resolve();
    });
    const edits = Promise.all([edit1, edit2, edit3]);
    const change = await changePromise;
    await edits;
    assert.ok(change);
    assert.strictEqual(change.versionId, 4);
    assert.strictEqual(change.ranges[0].newRangeStartOffset, 0);
    assert.strictEqual(change.ranges[0].newRangeEndOffset, 32);
    assert.strictEqual(change.ranges[0].newRange.startLineNumber, 1);
    assert.strictEqual(change.ranges[0].newRange.endLineNumber, 7);
    updateListener?.dispose();
    modelService.destroyModel(model.uri);
  });
  test("File single line file", async () => {
    const content = `console.log('x');`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 1, 18), 0, 17);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 9);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with new lines at beginning and end", async () => {
    const content = `
console.log('x');
`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 3, 1), 0, 19);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 11);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with new lines at beginning and end \\r\\n", async () => {
    const content = "\r\nconsole.log('x');\r\n";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 3, 1), 0, 21);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 11);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with empty lines in the middle", async () => {
    const content = `
console.log('x');

console.log('7');
`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 38);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 21);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with empty lines in the middle \\r\\n", async () => {
    const content = "\r\nconsole.log('x');\r\n\r\nconsole.log('7');\r\n";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 42);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 21);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with non-empty lines that match no scopes", async () => {
    const content = `console.log('x');
;
{
}
`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 24);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 16);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with non-empty lines that match no scopes \\r\\n", async () => {
    const content = "console.log('x');\r\n;\r\n{\r\n}\r\n";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 28);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 16);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with tree-sitter token that spans multiple lines", async () => {
    const content = `/**
**/

console.log('x');

`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 6, 1), 0, 28);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 12);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with tree-sitter token that spans multiple lines \\r\\n", async () => {
    const content = "/**\r\n**/\r\n\r\nconsole.log('x');\r\n\r\n";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 6, 1), 0, 33);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 12);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with tabs", async () => {
    const content = `function x() {
	return true;
}

class Y {
	private z = false;
}`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 7, 1), 0, 63);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 30);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with tabs \\r\\n", async () => {
    const content = "function x() {\r\n	return true;\r\n}\r\n\r\nclass Y {\r\n	private z = false;\r\n}";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 7, 1), 0, 69);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 30);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("Template string", async () => {
    const content = "`t ${6}`";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 1, 8), 0, 8);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 6);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("Many nested scopes", async () => {
    const content = `y = new x(ttt({
	message: '{0} i\\n\\n [commandName]({1}).',
	args: ['Test', \`command:\${openSettingsCommand}?\${encodeURIComponent('["SettingName"]')}\`],
	// To make sure the translators don't break the link
	comment: ["{Locked=']({'}"]
}));`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 6, 5), 0, 238);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 65);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXHRyZWVTaXR0ZXJUb2tlbml6YXRpb25GZWF0dXJlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5RGF0YSwgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2xhc3NpZmllZEV2ZW50LCBPbWl0TWV0YWRhdGEsIElHRFBSUHJvcGVydHksIFN0cmljdFByb3BlcnR5Q2hlY2sgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL2dkcHJUeXBpbmdzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsU2VydmljZS5qcyc7XG5cbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFRlc3RJUENGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbG9yVGhlbWUsIFRlc3RUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS90ZXN0L2NvbW1vbi90ZXN0VGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVzL3Rlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG9TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3REaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy90ZXN0L2NvbW1vbi90ZXN0RGlhbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Tm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFByb2JlU2NvcGUsIFRva2VuU3R5bGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFRleHRNYXRlVGhlbWluZ1J1bGVEZWZpbml0aW9ucyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3RoZW1lcy9jb21tb24vY29sb3JUaGVtZURhdGEuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUb2tlblVwZGF0ZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdG9rZW5zL3RyZWVTaXR0ZXIvdG9rZW5TdG9yZS5qcyc7XG5pbXBvcnQgeyBJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90cmVlU2l0dGVyL3RyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90cmVlU2l0dGVyL2Jyb3dzZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblRleHRNb2RlbFBhcnQgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3Rva2Vucy90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJTeW50YXhUb2tlbkJhY2tlbmQgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3Rva2Vucy90cmVlU2l0dGVyL3RyZWVTaXR0ZXJTeW50YXhUb2tlbkJhY2tlbmQuanMnO1xuaW1wb3J0IHsgVHJlZVBhcnNlVXBkYXRlRXZlbnQsIFRyZWVTaXR0ZXJUcmVlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90b2tlbnMvdHJlZVNpdHRlci90cmVlU2l0dGVyVHJlZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUcmVlU2l0dGVyVG9rZW5pemF0aW9uSW1wbCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdG9rZW5zL3RyZWVTaXR0ZXIvdHJlZVNpdHRlclRva2VuaXphdGlvbkltcGwuanMnO1xuaW1wb3J0IHsgYXV0b3J1bkhhbmRsZUNoYW5nZXMsIHJlY29yZENoYW5nZXMsIHdhaXRGb3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVRyZWVTaXR0ZXJUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvdHJlZVNpdHRlclRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUcmVlU2l0dGVyVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdHJlZVNpdHRlci9icm93c2VyL3RyZWVTaXR0ZXJUaGVtZVNlcnZpY2UuanMnO1xuXG5jbGFzcyBNb2NrVGVsZW1ldHJ5U2VydmljZSBpbXBsZW1lbnRzIElUZWxlbWV0cnlTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwgPSBUZWxlbWV0cnlMZXZlbC5OT05FO1xuXHRzZXNzaW9uSWQ6IHN0cmluZyA9ICcnO1xuXHRtYWNoaW5lSWQ6IHN0cmluZyA9ICcnO1xuXHRzcW1JZDogc3RyaW5nID0gJyc7XG5cdGRldkRldmljZUlkOiBzdHJpbmcgPSAnJztcblx0Zmlyc3RTZXNzaW9uRGF0ZTogc3RyaW5nID0gJyc7XG5cdHNlbmRFcnJvclRlbGVtZXRyeTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwdWJsaWNMb2coZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiBJVGVsZW1ldHJ5RGF0YSk6IHZvaWQge1xuXHR9XG5cdHB1YmxpY0xvZzI8RSBleHRlbmRzIENsYXNzaWZpZWRFdmVudDxPbWl0TWV0YWRhdGE8VD4+ID0gbmV2ZXIsIFQgZXh0ZW5kcyBJR0RQUlByb3BlcnR5ID0gbmV2ZXI+KGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPzogU3RyaWN0UHJvcGVydHlDaGVjazxULCBFPik6IHZvaWQge1xuXHR9XG5cdHB1YmxpY0xvZ0Vycm9yKGVycm9yRXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiBJVGVsZW1ldHJ5RGF0YSk6IHZvaWQge1xuXHR9XG5cdHB1YmxpY0xvZ0Vycm9yMjxFIGV4dGVuZHMgQ2xhc3NpZmllZEV2ZW50PE9taXRNZXRhZGF0YTxUPj4gPSBuZXZlciwgVCBleHRlbmRzIElHRFBSUHJvcGVydHkgPSBuZXZlcj4oZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiBTdHJpY3RQcm9wZXJ0eUNoZWNrPFQsIEU+KTogdm9pZCB7XG5cdH1cblx0c2V0RXhwZXJpbWVudFByb3BlcnR5KG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHR9XG5cdHNldENvbW1vblByb3BlcnR5KG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHR9XG59XG5cblxuY2xhc3MgVGVzdFRyZWVTaXR0ZXJDb2xvclRoZW1lIGV4dGVuZHMgVGVzdENvbG9yVGhlbWUge1xuXHRwdWJsaWMgcmVzb2x2ZVNjb3BlcyhzY29wZXM6IFByb2JlU2NvcGVbXSwgZGVmaW5pdGlvbnM/OiBUZXh0TWF0ZVRoZW1pbmdSdWxlRGVmaW5pdGlvbnMpOiBUb2tlblN0eWxlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gbmV3IFRva2VuU3R5bGUoQ29sb3IucmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cdHB1YmxpYyBnZXRUb2tlbkNvbG9ySW5kZXgoKTogeyBnZXQ6ICgpID0+IG51bWJlciB9IHtcblx0XHRyZXR1cm4geyBnZXQ6ICgpID0+IDEwIH07XG5cdH1cbn1cblxuc3VpdGUoJ1RyZWUgU2l0dGVyIFRva2VuaXphdGlvbkZlYXR1cmUnLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2U7XG5cdGxldCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXHRsZXQgdGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2U6IElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZTtcblx0bGV0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2U7XG5cdGxldCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2U7XG5cdGxldCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2U7XG5cdGxldCBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2U7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHR0ZWxlbWV0cnlTZXJ2aWNlID0gbmV3IE1vY2tUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0bG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7ICdlZGl0b3IuZXhwZXJpbWVudGFsLnByZWZlclRyZWVTaXR0ZXIudHlwZXNjcmlwdCc6IHRydWUgfSk7XG5cdFx0dGhlbWVTZXJ2aWNlID0gbmV3IFRlc3RUaGVtZVNlcnZpY2UobmV3IFRlc3RUcmVlU2l0dGVyQ29sb3JUaGVtZSgpKTtcblx0XHRlbnZpcm9ubWVudFNlcnZpY2UgPSB7fSBhcyBJRW52aXJvbm1lbnRTZXJ2aWNlO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElFbnZpcm9ubWVudFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJTG9nU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElUZWxlbWV0cnlTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRsYW5ndWFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VTZXJ2aWNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElMYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElUaGVtZVNlcnZpY2UsIHRoZW1lU2VydmljZSk7XG5cdFx0dGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsIHRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlKTtcblx0XHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZmlsZVN5c3RlbVByb3ZpZGVyID0gbmV3IFRlc3RJUENGaWxlU3lzdGVtUHJvdmlkZXIoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGxpYnJhcnlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSkpO1xuXHRcdGxpYnJhcnlTZXJ2aWNlLmlzVGVzdCA9IHRydWU7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UsIGxpYnJhcnlTZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVHJlZVNpdHRlclRoZW1lU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZVNpdHRlclRoZW1lU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IG5ldyBUZXN0RGlhbG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCB1bmRvUmVkb1NlcnZpY2UgPSBuZXcgVW5kb1JlZG9TZXJ2aWNlKGRpYWxvZ1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVW5kb1JlZG9TZXJ2aWNlLCB1bmRvUmVkb1NlcnZpY2UpO1xuXHRcdG1vZGVsU2VydmljZSA9IG5ldyBNb2RlbFNlcnZpY2UoXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdFx0dW5kb1JlZG9TZXJ2aWNlLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Vcblx0XHQpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJTW9kZWxTZXJ2aWNlLCBtb2RlbFNlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0b2tlbnNDb250ZW50U2l6ZSh0b2tlbnM6IFRva2VuVXBkYXRlW10pIHtcblx0XHRyZXR1cm4gdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS5zdGFydE9mZnNldEluY2x1c2l2ZSArIHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0ubGVuZ3RoO1xuXHR9XG5cblx0bGV0IG5hbWVOdW1iZXIgPSAxO1xuXHRhc3luYyBmdW5jdGlvbiBnZXRNb2RlbEFuZFByZXBUcmVlKGNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8eyBtb2RlbDogSVRleHRNb2RlbDsgdHJlZVNpdHRlclRyZWU6IFRyZWVTaXR0ZXJUcmVlOyB0b2tlbml6YXRpb25JbXBsOiBUcmVlU2l0dGVyVG9rZW5pemF0aW9uSW1wbCB9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKGNvbnRlbnQsIHsgbGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLCBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSB9LCBVUkkuZmlsZShgZmlsZSR7bmFtZU51bWJlcisrfS50c2ApKSk7XG5cdFx0Y29uc3QgdHJlZVNpdHRlclRyZWVPYnMgPSBkaXNwb3NhYmxlcy5hZGQoKG1vZGVsLnRva2VuaXphdGlvbiBhcyBUb2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0KS50b2tlbnMuZ2V0KCkgYXMgVHJlZVNpdHRlclN5bnRheFRva2VuQmFja2VuZCkudHJlZTtcblx0XHRjb25zdCB0b2tlbml6YXRpb25JbXBsT2JzID0gZGlzcG9zYWJsZXMuYWRkKChtb2RlbC50b2tlbml6YXRpb24gYXMgVG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydCkudG9rZW5zLmdldCgpIGFzIFRyZWVTaXR0ZXJTeW50YXhUb2tlbkJhY2tlbmQpLnRva2VuaXphdGlvbkltcGw7XG5cdFx0Y29uc3QgdHJlZVNpdHRlclRyZWUgPSB0cmVlU2l0dGVyVHJlZU9icy5nZXQoKSA/PyBhd2FpdCB3YWl0Rm9yU3RhdGUodHJlZVNpdHRlclRyZWVPYnMpO1xuXHRcdGlmICghdHJlZVNpdHRlclRyZWUudHJlZS5nZXQoKSkge1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHRyZWVTaXR0ZXJUcmVlLnRyZWUpO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbml6YXRpb25JbXBsID0gdG9rZW5pemF0aW9uSW1wbE9icy5nZXQoKSA/PyBhd2FpdCB3YWl0Rm9yU3RhdGUodG9rZW5pemF0aW9uSW1wbE9icyk7XG5cblx0XHRhc3NlcnQub2sodHJlZVNpdHRlclRyZWUpO1xuXHRcdHJldHVybiB7IG1vZGVsLCB0cmVlU2l0dGVyVHJlZSwgdG9rZW5pemF0aW9uSW1wbCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gdmVyaWZ5VG9rZW5zKHRva2VuczogVG9rZW5VcGRhdGVbXSB8IHVuZGVmaW5lZCkge1xuXHRcdGFzc2VydC5vayh0b2tlbnMpO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c1Rva2VuOiBUb2tlblVwZGF0ZSA9IHRva2Vuc1tpIC0gMV07XG5cdFx0XHRjb25zdCB0b2tlbjogVG9rZW5VcGRhdGUgPSB0b2tlbnNbaV07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByZXZpb3VzVG9rZW4uc3RhcnRPZmZzZXRJbmNsdXNpdmUgKyBwcmV2aW91c1Rva2VuLmxlbmd0aCwgdG9rZW4uc3RhcnRPZmZzZXRJbmNsdXNpdmUpO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ1RocmVlIGNoYW5nZXMgY29tZSBiYWNrIHRvIGJhY2sgJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBgLyoqXG4qKi9cbmNsYXNzIHgge1xufVxuXG5cblxuXG5jbGFzcyB5IHtcbn1gO1xuXHRcdGNvbnN0IHsgbW9kZWwsIHRyZWVTaXR0ZXJUcmVlIH0gPSBhd2FpdCBnZXRNb2RlbEFuZFByZXBUcmVlKGNvbnRlbnQpO1xuXG5cdFx0bGV0IHVwZGF0ZUxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjaGFuZ2VQcm9taXNlID0gbmV3IFByb21pc2U8VHJlZVBhcnNlVXBkYXRlRXZlbnQgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0dXBkYXRlTGlzdGVuZXIgPSBhdXRvcnVuSGFuZGxlQ2hhbmdlcyh7XG5cdFx0XHRcdG93bmVyOiB0aGlzLFxuXHRcdFx0XHRjaGFuZ2VUcmFja2VyOiByZWNvcmRDaGFuZ2VzKHsgdHJlZTogdHJlZVNpdHRlclRyZWUudHJlZSB9KSxcblx0XHRcdH0sIChyZWFkZXIsIGN0eCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VFdmVudCA9IGN0eC5jaGFuZ2VzLmF0KDApPy5jaGFuZ2U7XG5cdFx0XHRcdGlmIChjaGFuZ2VFdmVudCkge1xuXHRcdFx0XHRcdHJlc29sdmUoY2hhbmdlRXZlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVkaXQxID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRtb2RlbC5hcHBseUVkaXRzKFt7IHJhbmdlOiBuZXcgUmFuZ2UoNywgMSwgOCwgMSksIHRleHQ6ICcnIH1dKTtcblx0XHRcdHJlc29sdmUoKTtcblx0XHR9KTtcblx0XHRjb25zdCBlZGl0MiA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZTogbmV3IFJhbmdlKDYsIDEsIDcsIDEpLCB0ZXh0OiAnJyB9XSk7XG5cdFx0XHRyZXNvbHZlKCk7XG5cdFx0fSk7XG5cdFx0Y29uc3QgZWRpdDMgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2U6IG5ldyBSYW5nZSg1LCAxLCA2LCAxKSwgdGV4dDogJycgfV0pO1xuXHRcdFx0cmVzb2x2ZSgpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGVkaXRzID0gUHJvbWlzZS5hbGwoW2VkaXQxLCBlZGl0MiwgZWRpdDNdKTtcblx0XHRjb25zdCBjaGFuZ2UgPSBhd2FpdCBjaGFuZ2VQcm9taXNlO1xuXHRcdGF3YWl0IGVkaXRzO1xuXHRcdGFzc2VydC5vayhjaGFuZ2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZS52ZXJzaW9uSWQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2UucmFuZ2VzWzBdLm5ld1JhbmdlU3RhcnRPZmZzZXQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2UucmFuZ2VzWzBdLm5ld1JhbmdlRW5kT2Zmc2V0LCAzMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZS5yYW5nZXNbMF0ubmV3UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlLnJhbmdlc1swXS5uZXdSYW5nZS5lbmRMaW5lTnVtYmVyLCA3KTtcblxuXHRcdHVwZGF0ZUxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChtb2RlbC51cmkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIHNpbmdsZSBsaW5lIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGBjb25zb2xlLmxvZygneCcpO2A7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDE4KSwgMCwgMTcpO1xuXHRcdHZlcmlmeVRva2Vucyh0b2tlbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zPy5sZW5ndGgsIDkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zQ29udGVudFNpemUodG9rZW5zKSwgY29udGVudC5sZW5ndGgpO1xuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwobW9kZWwudXJpKTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZSB3aXRoIG5ldyBsaW5lcyBhdCBiZWdpbm5pbmcgYW5kIGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYFxuY29uc29sZS5sb2coJ3gnKTtcbmA7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDMsIDEpLCAwLCAxOSk7XG5cdFx0dmVyaWZ5VG9rZW5zKHRva2Vucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnM/Lmxlbmd0aCwgMTEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zQ29udGVudFNpemUodG9rZW5zKSwgY29udGVudC5sZW5ndGgpO1xuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwobW9kZWwudXJpKTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZSB3aXRoIG5ldyBsaW5lcyBhdCBiZWdpbm5pbmcgYW5kIGVuZCBcXFxcclxcXFxuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnXFxyXFxuY29uc29sZS5sb2coXFwneFxcJyk7XFxyXFxuJztcblx0XHRjb25zdCB7IG1vZGVsLCB0b2tlbml6YXRpb25JbXBsIH0gPSBhd2FpdCBnZXRNb2RlbEFuZFByZXBUcmVlKGNvbnRlbnQpO1xuXHRcdGNvbnN0IHRva2VucyA9IHRva2VuaXphdGlvbkltcGwuZ2V0VG9rZW5zSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMywgMSksIDAsIDIxKTtcblx0XHR2ZXJpZnlUb2tlbnModG9rZW5zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vucz8ubGVuZ3RoLCAxMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnNDb250ZW50U2l6ZSh0b2tlbnMpLCBjb250ZW50Lmxlbmd0aCk7XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChtb2RlbC51cmkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIHdpdGggZW1wdHkgbGluZXMgaW4gdGhlIG1pZGRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYFxuY29uc29sZS5sb2coJ3gnKTtcblxuY29uc29sZS5sb2coJzcnKTtcbmA7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDUsIDEpLCAwLCAzOCk7XG5cdFx0dmVyaWZ5VG9rZW5zKHRva2Vucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnM/Lmxlbmd0aCwgMjEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zQ29udGVudFNpemUodG9rZW5zKSwgY29udGVudC5sZW5ndGgpO1xuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwobW9kZWwudXJpKTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZSB3aXRoIGVtcHR5IGxpbmVzIGluIHRoZSBtaWRkbGUgXFxcXHJcXFxcbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ1xcclxcbmNvbnNvbGUubG9nKFxcJ3hcXCcpO1xcclxcblxcclxcbmNvbnNvbGUubG9nKFxcJzdcXCcpO1xcclxcbic7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDUsIDEpLCAwLCA0Mik7XG5cdFx0dmVyaWZ5VG9rZW5zKHRva2Vucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnM/Lmxlbmd0aCwgMjEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zQ29udGVudFNpemUodG9rZW5zKSwgY29udGVudC5sZW5ndGgpO1xuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwobW9kZWwudXJpKTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZSB3aXRoIG5vbi1lbXB0eSBsaW5lcyB0aGF0IG1hdGNoIG5vIHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYGNvbnNvbGUubG9nKCd4Jyk7XG47XG57XG59XG5gO1xuXHRcdGNvbnN0IHsgbW9kZWwsIHRva2VuaXphdGlvbkltcGwgfSA9IGF3YWl0IGdldE1vZGVsQW5kUHJlcFRyZWUoY29udGVudCk7XG5cdFx0Y29uc3QgdG9rZW5zID0gdG9rZW5pemF0aW9uSW1wbC5nZXRUb2tlbnNJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCA1LCAxKSwgMCwgMjQpO1xuXHRcdHZlcmlmeVRva2Vucyh0b2tlbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zPy5sZW5ndGgsIDE2KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vuc0NvbnRlbnRTaXplKHRva2VucyksIGNvbnRlbnQubGVuZ3RoKTtcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKG1vZGVsLnVyaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGUgd2l0aCBub24tZW1wdHkgbGluZXMgdGhhdCBtYXRjaCBubyBzY29wZXMgXFxcXHJcXFxcbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ2NvbnNvbGUubG9nKFxcJ3hcXCcpO1xcclxcbjtcXHJcXG57XFxyXFxufVxcclxcbic7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDUsIDEpLCAwLCAyOCk7XG5cdFx0dmVyaWZ5VG9rZW5zKHRva2Vucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnM/Lmxlbmd0aCwgMTYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zQ29udGVudFNpemUodG9rZW5zKSwgY29udGVudC5sZW5ndGgpO1xuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwobW9kZWwudXJpKTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZSB3aXRoIHRyZWUtc2l0dGVyIHRva2VuIHRoYXQgc3BhbnMgbXVsdGlwbGUgbGluZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGAvKipcbioqL1xuXG5jb25zb2xlLmxvZygneCcpO1xuXG5gO1xuXHRcdGNvbnN0IHsgbW9kZWwsIHRva2VuaXphdGlvbkltcGwgfSA9IGF3YWl0IGdldE1vZGVsQW5kUHJlcFRyZWUoY29udGVudCk7XG5cdFx0Y29uc3QgdG9rZW5zID0gdG9rZW5pemF0aW9uSW1wbC5nZXRUb2tlbnNJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCA2LCAxKSwgMCwgMjgpO1xuXHRcdHZlcmlmeVRva2Vucyh0b2tlbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zPy5sZW5ndGgsIDEyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vuc0NvbnRlbnRTaXplKHRva2VucyksIGNvbnRlbnQubGVuZ3RoKTtcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKG1vZGVsLnVyaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGUgd2l0aCB0cmVlLXNpdHRlciB0b2tlbiB0aGF0IHNwYW5zIG11bHRpcGxlIGxpbmVzIFxcXFxyXFxcXG4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICcvKipcXHJcXG4qKi9cXHJcXG5cXHJcXG5jb25zb2xlLmxvZyhcXCd4XFwnKTtcXHJcXG5cXHJcXG4nO1xuXHRcdGNvbnN0IHsgbW9kZWwsIHRva2VuaXphdGlvbkltcGwgfSA9IGF3YWl0IGdldE1vZGVsQW5kUHJlcFRyZWUoY29udGVudCk7XG5cdFx0Y29uc3QgdG9rZW5zID0gdG9rZW5pemF0aW9uSW1wbC5nZXRUb2tlbnNJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCA2LCAxKSwgMCwgMzMpO1xuXHRcdHZlcmlmeVRva2Vucyh0b2tlbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zPy5sZW5ndGgsIDEyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vuc0NvbnRlbnRTaXplKHRva2VucyksIGNvbnRlbnQubGVuZ3RoKTtcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKG1vZGVsLnVyaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGUgd2l0aCB0YWJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBgZnVuY3Rpb24geCgpIHtcblx0cmV0dXJuIHRydWU7XG59XG5cbmNsYXNzIFkge1xuXHRwcml2YXRlIHogPSBmYWxzZTtcbn1gO1xuXHRcdGNvbnN0IHsgbW9kZWwsIHRva2VuaXphdGlvbkltcGwgfSA9IGF3YWl0IGdldE1vZGVsQW5kUHJlcFRyZWUoY29udGVudCk7XG5cdFx0Y29uc3QgdG9rZW5zID0gdG9rZW5pemF0aW9uSW1wbC5nZXRUb2tlbnNJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCA3LCAxKSwgMCwgNjMpO1xuXHRcdHZlcmlmeVRva2Vucyh0b2tlbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zPy5sZW5ndGgsIDMwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vuc0NvbnRlbnRTaXplKHRva2VucyksIGNvbnRlbnQubGVuZ3RoKTtcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKG1vZGVsLnVyaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGUgd2l0aCB0YWJzIFxcXFxyXFxcXG4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdmdW5jdGlvbiB4KCkge1xcclxcblxcdHJldHVybiB0cnVlO1xcclxcbn1cXHJcXG5cXHJcXG5jbGFzcyBZIHtcXHJcXG5cXHRwcml2YXRlIHogPSBmYWxzZTtcXHJcXG59Jztcblx0XHRjb25zdCB7IG1vZGVsLCB0b2tlbml6YXRpb25JbXBsIH0gPSBhd2FpdCBnZXRNb2RlbEFuZFByZXBUcmVlKGNvbnRlbnQpO1xuXHRcdGNvbnN0IHRva2VucyA9IHRva2VuaXphdGlvbkltcGwuZ2V0VG9rZW5zSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgNywgMSksIDAsIDY5KTtcblx0XHR2ZXJpZnlUb2tlbnModG9rZW5zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vucz8ubGVuZ3RoLCAzMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnNDb250ZW50U2l6ZSh0b2tlbnMpLCBjb250ZW50Lmxlbmd0aCk7XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChtb2RlbC51cmkpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZW1wbGF0ZSBzdHJpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdgdCAkezZ9YCc7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDgpLCAwLCA4KTtcblx0XHR2ZXJpZnlUb2tlbnModG9rZW5zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vucz8ubGVuZ3RoLCA2KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vuc0NvbnRlbnRTaXplKHRva2VucyksIGNvbnRlbnQubGVuZ3RoKTtcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKG1vZGVsLnVyaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ01hbnkgbmVzdGVkIHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYHkgPSBuZXcgeCh0dHQoe1xuXHRtZXNzYWdlOiAnezB9IGlcXFxcblxcXFxuIFtjb21tYW5kTmFtZV0oezF9KS4nLFxuXHRhcmdzOiBbJ1Rlc3QnLCBcXGBjb21tYW5kOlxcJHtvcGVuU2V0dGluZ3NDb21tYW5kfT9cXCR7ZW5jb2RlVVJJQ29tcG9uZW50KCdbXCJTZXR0aW5nTmFtZVwiXScpfVxcYF0sXG5cdC8vIFRvIG1ha2Ugc3VyZSB0aGUgdHJhbnNsYXRvcnMgZG9uJ3QgYnJlYWsgdGhlIGxpbmtcblx0Y29tbWVudDogW1wie0xvY2tlZD0nXSh7J31cIl1cbn0pKTtgO1xuXHRcdGNvbnN0IHsgbW9kZWwsIHRva2VuaXphdGlvbkltcGwgfSA9IGF3YWl0IGdldE1vZGVsQW5kUHJlcFRyZWUoY29udGVudCk7XG5cdFx0Y29uc3QgdG9rZW5zID0gdG9rZW5pemF0aW9uSW1wbC5nZXRUb2tlbnNJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCA2LCA1KSwgMCwgMjM4KTtcblx0XHR2ZXJpZnlUb2tlbnModG9rZW5zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vucz8ubGVuZ3RoLCA2NSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnNDb250ZW50U2l6ZSh0b2tlbnMpLCBjb250ZW50Lmxlbmd0aCk7XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChtb2RlbC51cmkpO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQXlCLG1CQUFtQixzQkFBc0I7QUFFbEUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCLHdCQUF3QjtBQUNqRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHVCQUFvQztBQUM3QyxTQUFxQixrQkFBa0I7QUFFdkMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUV0QixTQUFTLGlDQUFpQztBQUMxQyxTQUFT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
