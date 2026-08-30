import assert from "assert";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IModelService } from "../../../common/services/model.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { IConfigurationService, ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { TextResourceConfigurationService } from "../../../common/services/textResourceConfigurationService.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("TextResourceConfigurationService - Update", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationValue = {};
  let updateArgs;
  const configurationService = new class extends TestConfigurationService {
    inspect() {
      return configurationValue;
    }
    updateValue() {
      updateArgs = [...arguments];
      return Promise.resolve();
    }
  }();
  let language = null;
  let testObject;
  setup(() => {
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IModelService, { getModel() {
      return null;
    } });
    instantiationService.stub(ILanguageService, { guessLanguageIdByFilepathOrFirstLine() {
      return language;
    } });
    instantiationService.stub(IConfigurationService, configurationService);
    testObject = disposables.add(instantiationService.createInstance(TextResourceConfigurationService));
  });
  test("updateValue writes without target and overrides when no language is defined", async () => {
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes with target and without overrides when no language is defined", async () => {
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b", ConfigurationTarget.USER_LOCAL);
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into given memory target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspaceFolder: { value: "1" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b", ConfigurationTarget.MEMORY);
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.MEMORY]);
  });
  test("updateValue writes into given workspace target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspaceFolder: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b", ConfigurationTarget.WORKSPACE);
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.WORKSPACE]);
  });
  test("updateValue writes into given user target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspaceFolder: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b", ConfigurationTarget.USER);
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER]);
  });
  test("updateValue writes into given workspace folder target with overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspaceFolder: { value: "2", override: "1" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b", ConfigurationTarget.WORKSPACE_FOLDER);
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE_FOLDER]);
  });
  test("updateValue writes into derived workspace folder target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspaceFolder: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.WORKSPACE_FOLDER]);
  });
  test("updateValue writes into derived workspace folder target with overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspace: { value: "2", override: "1" },
      workspaceFolder: { value: "2", override: "2" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE_FOLDER]);
  });
  test("updateValue writes into derived workspace target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspace: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.WORKSPACE]);
  });
  test("updateValue writes into derived workspace target with overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspace: { value: "2", override: "2" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE]);
  });
  test("updateValue writes into derived workspace target with overrides and value defined in folder", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1", override: "3" },
      userLocal: { value: "2" },
      workspace: { value: "2", override: "2" },
      workspaceFolder: { value: "2" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE]);
  });
  test("updateValue writes into derived user remote target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      userRemote: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER_REMOTE]);
  });
  test("updateValue writes into derived user remote target with overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      userRemote: { value: "2", override: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
  });
  test("updateValue writes into derived user remote target with overrides and value defined in workspace", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      userRemote: { value: "2", override: "3" },
      workspace: { value: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
  });
  test("updateValue writes into derived user remote target with overrides and value defined in workspace folder", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2", override: "1" },
      userRemote: { value: "2", override: "3" },
      workspace: { value: "3" },
      workspaceFolder: { value: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
  });
  test("updateValue writes into derived user target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into derived user target with overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2", override: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "2");
    assert.deepStrictEqual(updateArgs, ["a", "2", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into derived user target with overrides and value is defined in remote", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2", override: "3" },
      userRemote: { value: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "2");
    assert.deepStrictEqual(updateArgs, ["a", "2", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into derived user target with overrides and value is defined in workspace", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2", override: "3" },
      workspaceValue: { value: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "2");
    assert.deepStrictEqual(updateArgs, ["a", "2", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into derived user target with overrides and value is defined in workspace folder", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1", override: "3" },
      userLocal: { value: "2", override: "3" },
      userRemote: { value: "3" },
      workspaceFolderValue: { value: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "2");
    assert.deepStrictEqual(updateArgs, ["a", "2", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into derived user target when overridden in default and not in user", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1", override: "3" },
      userLocal: { value: "2" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "2");
    assert.deepStrictEqual(updateArgs, ["a", "2", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue when not changed", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER_LOCAL]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcc2VydmljZXNcXHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uVmFsdWUsIElDb25maWd1cmF0aW9uU2VydmljZSwgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5cbnN1aXRlKCdUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSAtIFVwZGF0ZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblZhbHVlOiBJQ29uZmlndXJhdGlvblZhbHVlPGFueT4gPSB7fTtcblx0bGV0IHVwZGF0ZUFyZ3M6IGFueVtdO1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdFx0b3ZlcnJpZGUgaW5zcGVjdCgpIHtcblx0XHRcdHJldHVybiBjb25maWd1cmF0aW9uVmFsdWU7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIHVwZGF0ZVZhbHVlKCkge1xuXHRcdFx0dXBkYXRlQXJncyA9IFsuLi5hcmd1bWVudHNdO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0fSgpO1xuXHRsZXQgbGFuZ3VhZ2U6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRsZXQgdGVzdE9iamVjdDogVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTW9kZWxTZXJ2aWNlLCB7IGdldE1vZGVsKCkgeyByZXR1cm4gbnVsbDsgfSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZVNlcnZpY2UsIHsgZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKCkgeyByZXR1cm4gbGFuZ3VhZ2U7IH0gfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyB3aXRob3V0IHRhcmdldCBhbmQgb3ZlcnJpZGVzIHdoZW4gbm8gbGFuZ3VhZ2UgaXMgZGVmaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICdiJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiB1bmRlZmluZWQgfSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyB3aXRoIHRhcmdldCBhbmQgd2l0aG91dCBvdmVycmlkZXMgd2hlbiBubyBsYW5ndWFnZSBpcyBkZWZpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogdW5kZWZpbmVkIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBnaXZlbiBtZW1vcnkgdGFyZ2V0IHdpdGhvdXQgb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicgfSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogeyB2YWx1ZTogJzEnIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicsIENvbmZpZ3VyYXRpb25UYXJnZXQuTUVNT1JZKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICdiJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiB1bmRlZmluZWQgfSwgQ29uZmlndXJhdGlvblRhcmdldC5NRU1PUlldKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZ2l2ZW4gd29ya3NwYWNlIHRhcmdldCB3aXRob3V0IG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogdW5kZWZpbmVkIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGdpdmVuIHVzZXIgdGFyZ2V0IHdpdGhvdXQgb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicgfSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogeyB2YWx1ZTogJzInIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogdW5kZWZpbmVkIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBnaXZlbiB3b3Jrc3BhY2UgZm9sZGVyIHRhcmdldCB3aXRoIG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHsgdmFsdWU6ICcyJywgb3ZlcnJpZGU6ICcxJyB9LFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyczogW2xhbmd1YWdlXVxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUl0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBkZXJpdmVkIHdvcmtzcGFjZSBmb2xkZXIgdGFyZ2V0IHdpdGhvdXQgb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicgfSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogeyB2YWx1ZTogJzInIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IHVuZGVmaW5lZCB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVJdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZGVyaXZlZCB3b3Jrc3BhY2UgZm9sZGVyIHRhcmdldCB3aXRoIG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHR3b3Jrc3BhY2U6IHsgdmFsdWU6ICcyJywgb3ZlcnJpZGU6ICcxJyB9LFxuXHRcdFx0d29ya3NwYWNlRm9sZGVyOiB7IHZhbHVlOiAnMicsIG92ZXJyaWRlOiAnMicgfSxcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnM6IFtsYW5ndWFnZV1cblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGRlcml2ZWQgd29ya3NwYWNlIHRhcmdldCB3aXRob3V0IG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHR3b3Jrc3BhY2U6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICdiJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiB1bmRlZmluZWQgfSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZGVyaXZlZCB3b3Jrc3BhY2UgdGFyZ2V0IHdpdGggb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicgfSxcblx0XHRcdHdvcmtzcGFjZTogeyB2YWx1ZTogJzInLCBvdmVycmlkZTogJzInIH0sXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXJzOiBbbGFuZ3VhZ2VdXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGRlcml2ZWQgd29ya3NwYWNlIHRhcmdldCB3aXRoIG92ZXJyaWRlcyBhbmQgdmFsdWUgZGVmaW5lZCBpbiBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnLCBvdmVycmlkZTogJzMnIH0sXG5cdFx0XHR1c2VyTG9jYWw6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdFx0d29ya3NwYWNlOiB7IHZhbHVlOiAnMicsIG92ZXJyaWRlOiAnMicgfSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXJzOiBbbGFuZ3VhZ2VdXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGRlcml2ZWQgdXNlciByZW1vdGUgdGFyZ2V0IHdpdGhvdXQgb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicgfSxcblx0XHRcdHVzZXJSZW1vdGU6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICdiJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiB1bmRlZmluZWQgfSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBkZXJpdmVkIHVzZXIgcmVtb3RlIHRhcmdldCB3aXRoIG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHR1c2VyUmVtb3RlOiB7IHZhbHVlOiAnMicsIG92ZXJyaWRlOiAnMycgfSxcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnM6IFtsYW5ndWFnZV1cblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBkZXJpdmVkIHVzZXIgcmVtb3RlIHRhcmdldCB3aXRoIG92ZXJyaWRlcyBhbmQgdmFsdWUgZGVmaW5lZCBpbiB3b3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnIH0sXG5cdFx0XHR1c2VyTG9jYWw6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdFx0dXNlclJlbW90ZTogeyB2YWx1ZTogJzInLCBvdmVycmlkZTogJzMnIH0sXG5cdFx0XHR3b3Jrc3BhY2U6IHsgdmFsdWU6ICczJyB9LFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyczogW2xhbmd1YWdlXVxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICdiJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGRlcml2ZWQgdXNlciByZW1vdGUgdGFyZ2V0IHdpdGggb3ZlcnJpZGVzIGFuZCB2YWx1ZSBkZWZpbmVkIGluIHdvcmtzcGFjZSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnIH0sXG5cdFx0XHR1c2VyTG9jYWw6IHsgdmFsdWU6ICcyJywgb3ZlcnJpZGU6ICcxJyB9LFxuXHRcdFx0dXNlclJlbW90ZTogeyB2YWx1ZTogJzInLCBvdmVycmlkZTogJzMnIH0sXG5cdFx0XHR3b3Jrc3BhY2U6IHsgdmFsdWU6ICczJyB9LFxuXHRcdFx0d29ya3NwYWNlRm9sZGVyOiB7IHZhbHVlOiAnMycgfSxcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnM6IFtsYW5ndWFnZV1cblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBkZXJpdmVkIHVzZXIgdGFyZ2V0IHdpdGhvdXQgb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogdW5kZWZpbmVkIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBkZXJpdmVkIHVzZXIgdGFyZ2V0IHdpdGggb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicsIG92ZXJyaWRlOiAnMycgfSxcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnM6IFtsYW5ndWFnZV1cblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICcyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnMicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGRlcml2ZWQgdXNlciB0YXJnZXQgd2l0aCBvdmVycmlkZXMgYW5kIHZhbHVlIGlzIGRlZmluZWQgaW4gcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicsIG92ZXJyaWRlOiAnMycgfSxcblx0XHRcdHVzZXJSZW1vdGU6IHsgdmFsdWU6ICczJyB9LFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyczogW2xhbmd1YWdlXVxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJzInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICcyJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUxdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZGVyaXZlZCB1c2VyIHRhcmdldCB3aXRoIG92ZXJyaWRlcyBhbmQgdmFsdWUgaXMgZGVmaW5lZCBpbiB3b3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnIH0sXG5cdFx0XHR1c2VyTG9jYWw6IHsgdmFsdWU6ICcyJywgb3ZlcnJpZGU6ICczJyB9LFxuXHRcdFx0d29ya3NwYWNlVmFsdWU6IHsgdmFsdWU6ICczJyB9LFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyczogW2xhbmd1YWdlXVxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJzInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICcyJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUxdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZGVyaXZlZCB1c2VyIHRhcmdldCB3aXRoIG92ZXJyaWRlcyBhbmQgdmFsdWUgaXMgZGVmaW5lZCBpbiB3b3Jrc3BhY2UgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJywgb3ZlcnJpZGU6ICczJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicsIG92ZXJyaWRlOiAnMycgfSxcblx0XHRcdHVzZXJSZW1vdGU6IHsgdmFsdWU6ICczJyB9LFxuXHRcdFx0d29ya3NwYWNlRm9sZGVyVmFsdWU6IHsgdmFsdWU6ICczJyB9LFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyczogW2xhbmd1YWdlXVxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJzInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICcyJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUxdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZGVyaXZlZCB1c2VyIHRhcmdldCB3aGVuIG92ZXJyaWRkZW4gaW4gZGVmYXVsdCBhbmQgbm90IGluIHVzZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnLCBvdmVycmlkZTogJzMnIH0sXG5cdFx0XHR1c2VyTG9jYWw6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyczogW2xhbmd1YWdlXVxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJzInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICcyJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUxdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd2hlbiBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogdW5kZWZpbmVkIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTF0pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBOEIsdUJBQXVCLDJCQUEyQjtBQUNoRixTQUFTLHdDQUF3QztBQUNqRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFHeEQsTUFBTSw2Q0FBNkMsTUFBTTtBQUV4RCxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE1BQUk7QUFDSixNQUFJLHFCQUErQyxDQUFDO0FBQ3BELE1BQUk7QUFDSixRQUFNLHVCQUF1QixJQUFJLGNBQWMseUJBQXlCO0FBQUEsSUFDOUQsVUFBVTtBQUNsQixhQUFPO0FBQUEsSUFDUjtBQUFBLElBQ1MsY0FBYztBQUN0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
