import assert from "assert";
import { stub } from "sinon";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { normalize } from "../../../../../base/common/path.js";
import * as platform from "../../../../../base/common/platform.js";
import { isLinux, isMacintosh, isWindows } from "../../../../../base/common/platform.js";
import { isObject } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Selection } from "../../../../../editor/common/core/selection.js";
import { EditorType } from "../../../../../editor/common/editorCommon.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { testWorkspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
import { TestEditorService, TestQuickInputService } from "../../../../test/browser/workbenchTestServices.js";
import { TestContextService, TestExtensionService, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { BaseConfigurationResolverService } from "../../browser/baseConfigurationResolverService.js";
import { ConfigurationResolverExpression } from "../../common/configurationResolverExpression.js";
const mockLineNumber = 10;
class TestEditorServiceWithActiveEditor extends TestEditorService {
  get activeTextEditorControl() {
    return {
      getEditorType() {
        return EditorType.ICodeEditor;
      },
      getSelection() {
        return new Selection(mockLineNumber, 1, mockLineNumber, 10);
      }
    };
  }
  get activeEditor() {
    return {
      get resource() {
        return URI.parse("file:///VSCode/workspaceLocation/file");
      }
    };
  }
}
class TestConfigurationResolverService extends BaseConfigurationResolverService {
}
const nullContext = {
  getAppRoot: () => void 0,
  getExecPath: () => void 0
};
suite("Configuration Resolver Service", () => {
  let configurationResolverService;
  const envVariables = { key1: "Value for key1", key2: "Value for key2" };
  let mockCommandService;
  let editorService;
  let containingWorkspace;
  let workspace;
  let quickInputService;
  let labelService;
  let pathService;
  let extensionService;
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    mockCommandService = new MockCommandService();
    editorService = disposables.add(new TestEditorServiceWithActiveEditor());
    quickInputService = new TestQuickInputService();
    labelService = new MockLabelService();
    pathService = new MockPathService();
    extensionService = new TestExtensionService();
    containingWorkspace = testWorkspace(URI.parse("file:///VSCode/workspaceLocation"));
    workspace = containingWorkspace.folders[0];
    configurationResolverService = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), editorService, new MockInputsConfigurationService(), mockCommandService, new TestContextService(containingWorkspace), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
  });
  teardown(() => {
    configurationResolverService = null;
  });
  test("substitute one", async () => {
    if (platform.isWindows) {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "abc ${workspaceFolder} xyz"), "abc \\VSCode\\workspaceLocation xyz");
    } else {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "abc ${workspaceFolder} xyz"), "abc /VSCode/workspaceLocation xyz");
    }
  });
  test("does not preserve platform config even when not matched", async () => {
    const obj = {
      program: "osx.sh",
      windows: {
        program: "windows.exe"
      },
      linux: {
        program: "linux.sh"
      }
    };
    const config = await configurationResolverService.resolveAsync(workspace, obj);
    const expected = isWindows ? "windows.exe" : isMacintosh ? "osx.sh" : isLinux ? "linux.sh" : void 0;
    assert.strictEqual(config.windows, void 0);
    assert.strictEqual(config.osx, void 0);
    assert.strictEqual(config.linux, void 0);
    assert.strictEqual(config.program, expected);
  });
  test("apples platform specific config", async () => {
    const expected = isWindows ? "windows.exe" : isMacintosh ? "osx.sh" : isLinux ? "linux.sh" : void 0;
    const obj = {
      windows: {
        program: "windows.exe"
      },
      osx: {
        program: "osx.sh"
      },
      linux: {
        program: "linux.sh"
      }
    };
    const originalObj = JSON.stringify(obj);
    const config = await configurationResolverService.resolveAsync(workspace, obj);
    assert.strictEqual(config.program, expected);
    assert.strictEqual(config.windows, void 0);
    assert.strictEqual(config.osx, void 0);
    assert.strictEqual(config.linux, void 0);
    assert.strictEqual(JSON.stringify(obj), originalObj);
  });
  test("workspace folder with argument", async () => {
    if (platform.isWindows) {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "abc ${workspaceFolder:workspaceLocation} xyz"), "abc \\VSCode\\workspaceLocation xyz");
    } else {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "abc ${workspaceFolder:workspaceLocation} xyz"), "abc /VSCode/workspaceLocation xyz");
    }
  });
  test("workspace folder with invalid argument", async () => {
    await assert.rejects(async () => await configurationResolverService.resolveAsync(workspace, "abc ${workspaceFolder:invalidLocation} xyz"));
  });
  test("workspace folder with undefined workspace folder", async () => {
    await assert.rejects(async () => await configurationResolverService.resolveAsync(void 0, "abc ${workspaceFolder} xyz"));
  });
  test("workspace folder with argument and undefined workspace folder", async () => {
    if (platform.isWindows) {
      assert.strictEqual(await configurationResolverService.resolveAsync(void 0, "abc ${workspaceFolder:workspaceLocation} xyz"), "abc \\VSCode\\workspaceLocation xyz");
    } else {
      assert.strictEqual(await configurationResolverService.resolveAsync(void 0, "abc ${workspaceFolder:workspaceLocation} xyz"), "abc /VSCode/workspaceLocation xyz");
    }
  });
  test("workspace folder with invalid argument and undefined workspace folder", () => {
    assert.rejects(async () => await configurationResolverService.resolveAsync(void 0, "abc ${workspaceFolder:invalidLocation} xyz"));
  });
  test("workspace root folder name", async () => {
    assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "abc ${workspaceRootFolderName} xyz"), "abc workspaceLocation xyz");
  });
  test("current selected line number", async () => {
    assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "abc ${lineNumber} xyz"), `abc ${mockLineNumber} xyz`);
  });
  test("relative file", async () => {
    assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "abc ${relativeFile} xyz"), "abc file xyz");
  });
  test("relative file with argument", async () => {
    assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "abc ${relativeFile:workspaceLocation} xyz"), "abc file xyz");
  });
  test("relative file with invalid argument", () => {
    assert.rejects(async () => await configurationResolverService.resolveAsync(workspace, "abc ${relativeFile:invalidLocation} xyz"));
  });
  test("relative file with undefined workspace folder", async () => {
    if (platform.isWindows) {
      assert.strictEqual(await configurationResolverService.resolveAsync(void 0, "abc ${relativeFile} xyz"), "abc \\VSCode\\workspaceLocation\\file xyz");
    } else {
      assert.strictEqual(await configurationResolverService.resolveAsync(void 0, "abc ${relativeFile} xyz"), "abc /VSCode/workspaceLocation/file xyz");
    }
  });
  test("relative file with argument and undefined workspace folder", async () => {
    assert.strictEqual(await configurationResolverService.resolveAsync(void 0, "abc ${relativeFile:workspaceLocation} xyz"), "abc file xyz");
  });
  test("relative file with invalid argument and undefined workspace folder", () => {
    assert.rejects(async () => await configurationResolverService.resolveAsync(void 0, "abc ${relativeFile:invalidLocation} xyz"));
  });
  test("substitute many", async () => {
    if (platform.isWindows) {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "${workspaceFolder} - ${workspaceFolder}"), "\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation");
    } else {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "${workspaceFolder} - ${workspaceFolder}"), "/VSCode/workspaceLocation - /VSCode/workspaceLocation");
    }
  });
  test("substitute one env variable", async () => {
    if (platform.isWindows) {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "abc ${workspaceFolder} ${env:key1} xyz"), "abc \\VSCode\\workspaceLocation Value for key1 xyz");
    } else {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "abc ${workspaceFolder} ${env:key1} xyz"), "abc /VSCode/workspaceLocation Value for key1 xyz");
    }
  });
  test("substitute many env variable", async () => {
    if (platform.isWindows) {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}"), "\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for key1 - Value for key2");
    } else {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}"), "/VSCode/workspaceLocation - /VSCode/workspaceLocation Value for key1 - Value for key2");
    }
  });
  test("disallows nested keys (#77289)", async () => {
    assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "${env:key1} ${env:key1${env:key2}}"), "Value for key1 ");
  });
  test("supports extensionDir", async () => {
    const getExtension = stub(extensionService, "getExtension");
    getExtension.withArgs("publisher.extId").returns(Promise.resolve({ extensionLocation: URI.file("/some/path") }));
    assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "${extensionInstallFolder:publisher.extId}"), URI.file("/some/path").fsPath);
  });
  test("substitute one env variable using platform case sensitivity", async () => {
    if (platform.isWindows) {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "${env:key1} - ${env:Key1}"), "Value for key1 - Value for key1");
    } else {
      assert.strictEqual(await configurationResolverService.resolveAsync(workspace, "${env:key1} - ${env:Key1}"), "Value for key1 - ");
    }
  });
  test("substitute one configuration variable", async () => {
    const configurationService = new TestConfigurationService({
      editor: {
        fontFamily: "foo"
      },
      terminal: {
        integrated: {
          fontFamily: "bar"
        }
      }
    });
    const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    assert.strictEqual(await service.resolveAsync(workspace, "abc ${config:editor.fontFamily} xyz"), "abc foo xyz");
  });
  test("inlines an array (#245718)", async () => {
    const configurationService = new TestConfigurationService({
      editor: {
        fontFamily: ["foo", "bar"]
      }
    });
    const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    assert.strictEqual(await service.resolveAsync(workspace, "abc ${config:editor.fontFamily} xyz"), "abc foo,bar xyz");
  });
  test("substitute configuration variable with undefined workspace folder", async () => {
    const configurationService = new TestConfigurationService({
      editor: {
        fontFamily: "foo"
      }
    });
    const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    assert.strictEqual(await service.resolveAsync(void 0, "abc ${config:editor.fontFamily} xyz"), "abc foo xyz");
  });
  test("substitute many configuration variables", async () => {
    const configurationService = new TestConfigurationService({
      editor: {
        fontFamily: "foo"
      },
      terminal: {
        integrated: {
          fontFamily: "bar"
        }
      }
    });
    const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    assert.strictEqual(await service.resolveAsync(workspace, "abc ${config:editor.fontFamily} ${config:terminal.integrated.fontFamily} xyz"), "abc foo bar xyz");
  });
  test("substitute one env variable and a configuration variable", async () => {
    const configurationService = new TestConfigurationService({
      editor: {
        fontFamily: "foo"
      },
      terminal: {
        integrated: {
          fontFamily: "bar"
        }
      }
    });
    const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    if (platform.isWindows) {
      assert.strictEqual(await service.resolveAsync(workspace, "abc ${config:editor.fontFamily} ${workspaceFolder} ${env:key1} xyz"), "abc foo \\VSCode\\workspaceLocation Value for key1 xyz");
    } else {
      assert.strictEqual(await service.resolveAsync(workspace, "abc ${config:editor.fontFamily} ${workspaceFolder} ${env:key1} xyz"), "abc foo /VSCode/workspaceLocation Value for key1 xyz");
    }
  });
  test("recursively resolve variables", async () => {
    const configurationService = new TestConfigurationService({
      key1: "key1=${config:key2}",
      key2: "key2=${config:key3}",
      key3: "we did it!"
    });
    const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    assert.strictEqual(await service.resolveAsync(workspace, "${config:key1}"), "key1=key2=we did it!");
  });
  test("substitute many env variable and a configuration variable", async () => {
    const configurationService = new TestConfigurationService({
      editor: {
        fontFamily: "foo"
      },
      terminal: {
        integrated: {
          fontFamily: "bar"
        }
      }
    });
    const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    if (platform.isWindows) {
      assert.strictEqual(await service.resolveAsync(workspace, "${config:editor.fontFamily} ${config:terminal.integrated.fontFamily} ${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}"), "foo bar \\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for key1 - Value for key2");
    } else {
      assert.strictEqual(await service.resolveAsync(workspace, "${config:editor.fontFamily} ${config:terminal.integrated.fontFamily} ${workspaceFolder} - ${workspaceFolder} ${env:key1} - ${env:key2}"), "foo bar /VSCode/workspaceLocation - /VSCode/workspaceLocation Value for key1 - Value for key2");
    }
  });
  test("mixed types of configuration variables", async () => {
    const configurationService = new TestConfigurationService({
      editor: {
        fontFamily: "foo",
        lineNumbers: 123,
        insertSpaces: false
      },
      terminal: {
        integrated: {
          fontFamily: "bar"
        }
      },
      json: {
        schemas: [
          {
            fileMatch: [
              "/myfile",
              "/myOtherfile"
            ],
            url: "schemaURL"
          }
        ]
      }
    });
    const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    assert.strictEqual(await service.resolveAsync(workspace, "abc ${config:editor.fontFamily} ${config:editor.lineNumbers} ${config:editor.insertSpaces} xyz"), "abc foo 123 false xyz");
  });
  test("uses original variable as fallback", async () => {
    const configurationService = new TestConfigurationService({
      editor: {}
    });
    const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    assert.strictEqual(await service.resolveAsync(workspace, "abc ${unknownVariable} xyz"), "abc ${unknownVariable} xyz");
    assert.strictEqual(await service.resolveAsync(workspace, "abc ${env:unknownVariable} xyz"), "abc  xyz");
  });
  test("configuration variables with invalid accessor", () => {
    const configurationService = new TestConfigurationService({
      editor: {
        fontFamily: "foo"
      }
    });
    const service = new TestConfigurationResolverService(nullContext, Promise.resolve(envVariables), disposables.add(new TestEditorServiceWithActiveEditor()), configurationService, mockCommandService, new TestContextService(), quickInputService, labelService, pathService, extensionService, disposables.add(new TestStorageService()));
    assert.rejects(async () => await service.resolveAsync(workspace, "abc ${env} xyz"));
    assert.rejects(async () => await service.resolveAsync(workspace, "abc ${env:} xyz"));
    assert.rejects(async () => await service.resolveAsync(workspace, "abc ${config} xyz"));
    assert.rejects(async () => await service.resolveAsync(workspace, "abc ${config:} xyz"));
    assert.rejects(async () => await service.resolveAsync(workspace, "abc ${config:editor} xyz"));
    assert.rejects(async () => await service.resolveAsync(workspace, "abc ${config:editor..fontFamily} xyz"));
    assert.rejects(async () => await service.resolveAsync(workspace, "abc ${config:editor.none.none2} xyz"));
  });
  test("a single command variable", () => {
    const configuration = {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "processId": "${command:command1}",
      "port": 5858,
      "sourceMaps": false,
      "outDir": null
    };
    return configurationResolverService.resolveWithInteractionReplace(void 0, configuration).then((result) => {
      assert.deepStrictEqual({ ...result }, {
        "name": "Attach to Process",
        "type": "node",
        "request": "attach",
        "processId": "command1-result",
        "port": 5858,
        "sourceMaps": false,
        "outDir": null
      });
      assert.strictEqual(1, mockCommandService.callCount);
    });
  });
  test("an old style command variable", () => {
    const configuration = {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "processId": "${command:commandVariable1}",
      "port": 5858,
      "sourceMaps": false,
      "outDir": null
    };
    const commandVariables = /* @__PURE__ */ Object.create(null);
    commandVariables["commandVariable1"] = "command1";
    return configurationResolverService.resolveWithInteractionReplace(void 0, configuration, void 0, commandVariables).then((result) => {
      assert.deepStrictEqual({ ...result }, {
        "name": "Attach to Process",
        "type": "node",
        "request": "attach",
        "processId": "command1-result",
        "port": 5858,
        "sourceMaps": false,
        "outDir": null
      });
      assert.strictEqual(1, mockCommandService.callCount);
    });
  });
  test("multiple new and old-style command variables", () => {
    const configuration = {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "processId": "${command:commandVariable1}",
      "pid": "${command:command2}",
      "sourceMaps": false,
      "outDir": "src/${command:command2}",
      "env": {
        "processId": "__${command:command2}__"
      }
    };
    const commandVariables = /* @__PURE__ */ Object.create(null);
    commandVariables["commandVariable1"] = "command1";
    return configurationResolverService.resolveWithInteractionReplace(void 0, configuration, void 0, commandVariables).then((result) => {
      const expected = {
        "name": "Attach to Process",
        "type": "node",
        "request": "attach",
        "processId": "command1-result",
        "pid": "command2-result",
        "sourceMaps": false,
        "outDir": "src/command2-result",
        "env": {
          "processId": "__command2-result__"
        }
      };
      assert.deepStrictEqual(Object.keys(result), Object.keys(expected));
      Object.keys(result).forEach((property) => {
        const expectedProperty = expected[property];
        if (isObject(result[property])) {
          assert.deepStrictEqual({ ...result[property] }, expectedProperty);
        } else {
          assert.deepStrictEqual(result[property], expectedProperty);
        }
      });
      assert.strictEqual(2, mockCommandService.callCount);
    });
  });
  test("a command variable that relies on resolved env vars", () => {
    const configuration = {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "processId": "${command:commandVariable1}",
      "value": "${env:key1}"
    };
    const commandVariables = /* @__PURE__ */ Object.create(null);
    commandVariables["commandVariable1"] = "command1";
    return configurationResolverService.resolveWithInteractionReplace(void 0, configuration, void 0, commandVariables).then((result) => {
      assert.deepStrictEqual({ ...result }, {
        "name": "Attach to Process",
        "type": "node",
        "request": "attach",
        "processId": "Value for key1",
        "value": "Value for key1"
      });
      assert.strictEqual(1, mockCommandService.callCount);
    });
  });
  test("a single prompt input variable", () => {
    const configuration = {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "processId": "${input:input1}",
      "port": 5858,
      "sourceMaps": false,
      "outDir": null
    };
    return configurationResolverService.resolveWithInteractionReplace(workspace, configuration, "tasks").then((result) => {
      assert.deepStrictEqual({ ...result }, {
        "name": "Attach to Process",
        "type": "node",
        "request": "attach",
        "processId": "resolvedEnterinput1",
        "port": 5858,
        "sourceMaps": false,
        "outDir": null
      });
      assert.strictEqual(0, mockCommandService.callCount);
    });
  });
  test("a single pick input variable", () => {
    const configuration = {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "processId": "${input:input2}",
      "port": 5858,
      "sourceMaps": false,
      "outDir": null
    };
    return configurationResolverService.resolveWithInteractionReplace(workspace, configuration, "tasks").then((result) => {
      assert.deepStrictEqual({ ...result }, {
        "name": "Attach to Process",
        "type": "node",
        "request": "attach",
        "processId": "selectedPick",
        "port": 5858,
        "sourceMaps": false,
        "outDir": null
      });
      assert.strictEqual(0, mockCommandService.callCount);
    });
  });
  test("a single command input variable", () => {
    const configuration = {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "processId": "${input:input4}",
      "port": 5858,
      "sourceMaps": false,
      "outDir": null
    };
    return configurationResolverService.resolveWithInteractionReplace(workspace, configuration, "tasks").then((result) => {
      assert.deepStrictEqual({ ...result }, {
        "name": "Attach to Process",
        "type": "node",
        "request": "attach",
        "processId": "arg for command",
        "port": 5858,
        "sourceMaps": false,
        "outDir": null
      });
      assert.strictEqual(1, mockCommandService.callCount);
    });
  });
  test("several input variables and command", () => {
    const configuration = {
      "name": "${input:input3}",
      "type": "${command:command1}",
      "request": "${input:input1}",
      "processId": "${input:input2}",
      "command": "${input:input4}",
      "port": 5858,
      "sourceMaps": false,
      "outDir": null
    };
    return configurationResolverService.resolveWithInteractionReplace(workspace, configuration, "tasks").then((result) => {
      assert.deepStrictEqual({ ...result }, {
        "name": "resolvedEnterinput3",
        "type": "command1-result",
        "request": "resolvedEnterinput1",
        "processId": "selectedPick",
        "command": "arg for command",
        "port": 5858,
        "sourceMaps": false,
        "outDir": null
      });
      assert.strictEqual(2, mockCommandService.callCount);
    });
  });
  test("input variable with undefined workspace folder", () => {
    const configuration = {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "processId": "${input:input1}",
      "port": 5858,
      "sourceMaps": false,
      "outDir": null
    };
    return configurationResolverService.resolveWithInteractionReplace(void 0, configuration, "tasks").then((result) => {
      assert.deepStrictEqual({ ...result }, {
        "name": "Attach to Process",
        "type": "node",
        "request": "attach",
        "processId": "resolvedEnterinput1",
        "port": 5858,
        "sourceMaps": false,
        "outDir": null
      });
      assert.strictEqual(0, mockCommandService.callCount);
    });
  });
  test("contributed variable", () => {
    const buildTask = "npm: compile";
    const variable = "defaultBuildTask";
    const configuration = {
      "name": "${" + variable + "}"
    };
    configurationResolverService.contributeVariable(variable, async () => {
      return buildTask;
    });
    return configurationResolverService.resolveWithInteractionReplace(workspace, configuration).then((result) => {
      assert.deepStrictEqual({ ...result }, {
        "name": `${buildTask}`
      });
    });
  });
  test("contributed taskVar variable", () => {
    const url = "http://localhost:5678";
    const variable = "taskVar:componentExplorerUrl";
    const configuration = {
      "url": "${taskVar:componentExplorerUrl}/___explorer"
    };
    configurationResolverService.contributeVariable(variable, async () => {
      return url;
    });
    return configurationResolverService.resolveWithInteractionReplace(workspace, configuration).then((result) => {
      assert.deepStrictEqual({ ...result }, {
        "url": `${url}/___explorer`
      });
    });
  });
  test("resolveWithEnvironment", async () => {
    const env = {
      "VAR_1": "VAL_1",
      "VAR_2": "VAL_2"
    };
    const configuration = "echo ${env:VAR_1}${env:VAR_2}";
    const resolvedResult = await configurationResolverService.resolveWithEnvironment({ ...env }, void 0, configuration);
    assert.deepStrictEqual(resolvedResult, "echo VAL_1VAL_2");
  });
  test("substitution in object key", async () => {
    const configuration = {
      "name": "Test",
      "mappings": {
        "pos1": "value1",
        "${workspaceFolder}/test1": "${workspaceFolder}/test2",
        "pos3": "value3"
      }
    };
    return configurationResolverService.resolveWithInteractionReplace(workspace, configuration, "tasks").then((result) => {
      if (platform.isWindows) {
        assert.deepStrictEqual({ ...result }, {
          "name": "Test",
          "mappings": {
            "pos1": "value1",
            "\\VSCode\\workspaceLocation/test1": "\\VSCode\\workspaceLocation/test2",
            "pos3": "value3"
          }
        });
      } else {
        assert.deepStrictEqual({ ...result }, {
          "name": "Test",
          "mappings": {
            "pos1": "value1",
            "/VSCode/workspaceLocation/test1": "/VSCode/workspaceLocation/test2",
            "pos3": "value3"
          }
        });
      }
      assert.strictEqual(0, mockCommandService.callCount);
    });
  });
  test("canceled input", async () => {
    stub(quickInputService, "input").resolves(void 0);
    const configuration = {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "processId": "${input:input1}",
      "port": 5858,
      "sourceMaps": false,
      "outDir": null
    };
    const result = await configurationResolverService.resolveWithInteractionReplace(workspace, configuration, "tasks");
    assert.strictEqual(result, void 0);
  });
});
class MockCommandService {
  constructor() {
    this.callCount = 0;
    this.onWillExecuteCommand = () => Disposable.None;
    this.onDidExecuteCommand = () => Disposable.None;
  }
  executeCommand(commandId, ...args) {
    this.callCount++;
    let result = `${commandId}-result`;
    if (args.length >= 1) {
      if (args[0] && args[0].value) {
        result = args[0].value;
      }
    }
    return Promise.resolve(result);
  }
}
class MockLabelService {
  constructor() {
    this.onDidChangeFormatters = new Emitter().event;
  }
  getUriLabel(resource, options) {
    return normalize(resource.fsPath);
  }
  getUriBasenameLabel(resource) {
    throw new Error("Method not implemented.");
  }
  getWorkspaceLabel(workspace, options) {
    throw new Error("Method not implemented.");
  }
  getHostLabel(scheme, authority) {
    throw new Error("Method not implemented.");
  }
  getHostTooltip() {
    throw new Error("Method not implemented.");
  }
  getSeparator(scheme, authority) {
    throw new Error("Method not implemented.");
  }
  registerFormatter(formatter) {
    throw new Error("Method not implemented.");
  }
  registerCachedFormatter(formatter) {
    throw new Error("Method not implemented.");
  }
}
class MockPathService {
  constructor() {
    this.defaultUriScheme = Schemas.file;
  }
  get path() {
    throw new Error("Property not implemented");
  }
  fileURI(path) {
    throw new Error("Method not implemented.");
  }
  userHome(options) {
    const uri = URI.file("c:\\users\\username");
    return options?.preferLocal ? uri : Promise.resolve(uri);
  }
  hasValidBasename(resource, arg2, name) {
    throw new Error("Method not implemented.");
  }
}
class MockInputsConfigurationService extends TestConfigurationService {
  getValue(arg1, arg2) {
    let configuration;
    if (arg1 === "tasks") {
      configuration = {
        inputs: [
          {
            id: "input1",
            type: "promptString",
            description: "Enterinput1",
            default: "default input1"
          },
          {
            id: "input2",
            type: "pickString",
            description: "Enterinput1",
            default: "option2",
            options: ["option1", "option2", "option3"]
          },
          {
            id: "input3",
            type: "promptString",
            description: "Enterinput3",
            default: "default input3",
            provide: true,
            password: true
          },
          {
            id: "input4",
            type: "command",
            command: "command1",
            args: {
              value: "arg for command"
            }
          }
        ]
      };
    }
    return configuration;
  }
  inspect(key, overrides) {
    return {
      value: void 0,
      defaultValue: void 0,
      userValue: void 0,
      overrideIdentifiers: []
    };
  }
}
suite("ConfigurationResolverExpression", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parse empty object", () => {
    const expr = ConfigurationResolverExpression.parse({});
    assert.strictEqual(Array.from(expr.unresolved()).length, 0);
    assert.deepStrictEqual(expr.toObject(), {});
  });
  test("parse simple string", () => {
    const expr = ConfigurationResolverExpression.parse({ value: "${env:HOME}" });
    const unresolved = Array.from(expr.unresolved());
    assert.strictEqual(unresolved.length, 1);
    assert.strictEqual(unresolved[0].name, "env");
    assert.strictEqual(unresolved[0].arg, "HOME");
  });
  test("parse string with argument and colon", () => {
    const expr = ConfigurationResolverExpression.parse({ value: "${config:path:to:value}" });
    const unresolved = Array.from(expr.unresolved());
    assert.strictEqual(unresolved.length, 1);
    assert.strictEqual(unresolved[0].name, "config");
    assert.strictEqual(unresolved[0].arg, "path:to:value");
  });
  test("parse object with nested variables", () => {
    const expr = ConfigurationResolverExpression.parse({
      name: "${env:USERNAME}",
      path: "${env:HOME}/folder",
      settings: {
        value: "${config:path}"
      },
      array: ["${env:TERM}", { key: "${env:KEY}" }]
    });
    const unresolved = Array.from(expr.unresolved());
    assert.strictEqual(unresolved.length, 5);
    assert.deepStrictEqual(unresolved.map((r) => r.name).sort(), ["config", "env", "env", "env", "env"]);
  });
  test("resolve and get result", () => {
    const expr = ConfigurationResolverExpression.parse({
      name: "${env:USERNAME}",
      path: "${env:HOME}/folder"
    });
    expr.resolve({ inner: "env:USERNAME", id: "${env:USERNAME}", name: "env", arg: "USERNAME" }, "testuser");
    expr.resolve({ inner: "env:HOME", id: "${env:HOME}", name: "env", arg: "HOME" }, "/home/testuser");
    assert.deepStrictEqual(expr.toObject(), {
      name: "testuser",
      path: "/home/testuser/folder"
    });
  });
  test("keeps unresolved variables", () => {
    const expr = ConfigurationResolverExpression.parse({
      name: "${env:USERNAME}"
    });
    assert.deepStrictEqual(expr.toObject(), {
      name: "${env:USERNAME}"
    });
  });
  test("deduplicates identical variables", () => {
    const expr = ConfigurationResolverExpression.parse({
      first: "${env:HOME}",
      second: "${env:HOME}"
    });
    const unresolved = Array.from(expr.unresolved());
    assert.strictEqual(unresolved.length, 1);
    assert.strictEqual(unresolved[0].name, "env");
    assert.strictEqual(unresolved[0].arg, "HOME");
    expr.resolve(unresolved[0], "/home/user");
    assert.deepStrictEqual(expr.toObject(), {
      first: "/home/user",
      second: "/home/user"
    });
  });
  test("handles root string value", () => {
    const expr = ConfigurationResolverExpression.parse("abc ${env:HOME} xyz");
    const unresolved = Array.from(expr.unresolved());
    assert.strictEqual(unresolved.length, 1);
    assert.strictEqual(unresolved[0].name, "env");
    assert.strictEqual(unresolved[0].arg, "HOME");
    expr.resolve(unresolved[0], "/home/user");
    assert.strictEqual(expr.toObject(), "abc /home/user xyz");
  });
  test("handles root string value with multiple variables", () => {
    const expr = ConfigurationResolverExpression.parse("${env:HOME}/folder${env:SHELL}");
    const unresolved = Array.from(expr.unresolved());
    assert.strictEqual(unresolved.length, 2);
    expr.resolve({ id: "${env:HOME}", inner: "env:HOME", name: "env", arg: "HOME" }, "/home/user");
    expr.resolve({ id: "${env:SHELL}", inner: "env:SHELL", name: "env", arg: "SHELL" }, "/bin/bash");
    assert.strictEqual(expr.toObject(), "/home/user/folder/bin/bash");
  });
  test("handles root string with escaped variables", () => {
    const expr = ConfigurationResolverExpression.parse("abc ${env:HOME${env:USER}} xyz");
    const unresolved = Array.from(expr.unresolved());
    assert.strictEqual(unresolved.length, 1);
    assert.strictEqual(unresolved[0].name, "env");
    assert.strictEqual(unresolved[0].arg, "HOME${env:USER}");
  });
  test("resolves nested values", () => {
    const expr = ConfigurationResolverExpression.parse({
      name: "${env:REDIRECTED}",
      "key that is ${env:REDIRECTED}": "cool!"
    });
    for (const r of expr.unresolved()) {
      if (r.arg === "REDIRECTED") {
        expr.resolve(r, "username: ${env:USERNAME}");
      } else if (r.arg === "USERNAME") {
        expr.resolve(r, "testuser");
      }
    }
    assert.deepStrictEqual(expr.toObject(), {
      name: "username: testuser",
      "key that is username: testuser": "cool!"
    });
  });
  test("resolves nested values 2 (#245798)", () => {
    const expr = ConfigurationResolverExpression.parse({
      env: {
        SITE: "${input:site}",
        TLD: "${input:tld}",
        HOST: "${input:host}"
      }
    });
    for (const r of expr.unresolved()) {
      if (r.arg === "site") {
        expr.resolve(r, "example");
      } else if (r.arg === "tld") {
        expr.resolve(r, "com");
      } else if (r.arg === "host") {
        expr.resolve(r, "local.${input:site}.${input:tld}");
      }
    }
    assert.deepStrictEqual(expr.toObject(), {
      env: {
        SITE: "example",
        TLD: "com",
        HOST: "local.example.com"
      }
    });
  });
  test("out-of-order key resolution (#248550)", () => {
    const expr = ConfigurationResolverExpression.parse({
      "${input:key}": "${input:value}"
    });
    for (const r of expr.unresolved()) {
      if (r.arg === "key") {
        expr.resolve(r, "the-key");
      }
    }
    for (const r of expr.unresolved()) {
      if (r.arg === "value") {
        expr.resolve(r, "the-value");
      }
    }
    assert.deepStrictEqual(expr.toObject(), {
      "the-key": "the-value"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb25maWd1cmF0aW9uUmVzb2x2ZXJcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHN0dWIgfSBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElQYXRoLCBub3JtYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQ29uZmlndXJhdGlvblZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElGb3JtYXR0ZXJDaGFuZ2VFdmVudCwgSUxhYmVsU2VydmljZSwgUmVzb3VyY2VMYWJlbEZvcm1hdHRlciwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2VJZGVudGlmaWVyLCBXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyB0ZXN0V29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL3Rlc3QvY29tbW9uL3Rlc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVGVzdEVkaXRvclNlcnZpY2UsIFRlc3RRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlLCBUZXN0RXh0ZW5zaW9uU2VydmljZSwgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBCYXNlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYmFzZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5qcyc7XG5cbmNvbnN0IG1vY2tMaW5lTnVtYmVyID0gMTA7XG5jbGFzcyBUZXN0RWRpdG9yU2VydmljZVdpdGhBY3RpdmVFZGl0b3IgZXh0ZW5kcyBUZXN0RWRpdG9yU2VydmljZSB7XG5cdG92ZXJyaWRlIGdldCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCgpOiBhbnkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRFZGl0b3JUeXBlKCkge1xuXHRcdFx0XHRyZXR1cm4gRWRpdG9yVHlwZS5JQ29kZUVkaXRvcjtcblx0XHRcdH0sXG5cdFx0XHRnZXRTZWxlY3Rpb24oKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKG1vY2tMaW5lTnVtYmVyLCAxLCBtb2NrTGluZU51bWJlciwgMTApO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblx0b3ZlcnJpZGUgZ2V0IGFjdGl2ZUVkaXRvcigpOiBhbnkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXQgcmVzb3VyY2UoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFVSSS5wYXJzZSgnZmlsZTovLy9WU0NvZGUvd29ya3NwYWNlTG9jYXRpb24vZmlsZScpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgVGVzdENvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgZXh0ZW5kcyBCYXNlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB7XG5cbn1cblxuY29uc3QgbnVsbENvbnRleHQgPSB7XG5cdGdldEFwcFJvb3Q6ICgpID0+IHVuZGVmaW5lZCxcblx0Z2V0RXhlY1BhdGg6ICgpID0+IHVuZGVmaW5lZFxufTtcblxuc3VpdGUoJ0NvbmZpZ3VyYXRpb24gUmVzb2x2ZXIgU2VydmljZScsICgpID0+IHtcblx0bGV0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIHwgbnVsbDtcblx0Y29uc3QgZW52VmFyaWFibGVzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0geyBrZXkxOiAnVmFsdWUgZm9yIGtleTEnLCBrZXkyOiAnVmFsdWUgZm9yIGtleTInIH07XG5cdC8vIGxldCBlbnZpcm9ubWVudFNlcnZpY2U6IE1vY2tXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2U7XG5cdGxldCBtb2NrQ29tbWFuZFNlcnZpY2U6IE1vY2tDb21tYW5kU2VydmljZTtcblx0bGV0IGVkaXRvclNlcnZpY2U6IFRlc3RFZGl0b3JTZXJ2aWNlV2l0aEFjdGl2ZUVkaXRvcjtcblx0bGV0IGNvbnRhaW5pbmdXb3Jrc3BhY2U6IFdvcmtzcGFjZTtcblx0bGV0IHdvcmtzcGFjZTogSVdvcmtzcGFjZUZvbGRlcjtcblx0bGV0IHF1aWNrSW5wdXRTZXJ2aWNlOiBUZXN0UXVpY2tJbnB1dFNlcnZpY2U7XG5cdGxldCBsYWJlbFNlcnZpY2U6IE1vY2tMYWJlbFNlcnZpY2U7XG5cdGxldCBwYXRoU2VydmljZTogTW9ja1BhdGhTZXJ2aWNlO1xuXHRsZXQgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2U7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bW9ja0NvbW1hbmRTZXJ2aWNlID0gbmV3IE1vY2tDb21tYW5kU2VydmljZSgpO1xuXHRcdGVkaXRvclNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JTZXJ2aWNlV2l0aEFjdGl2ZUVkaXRvcigpKTtcblx0XHRxdWlja0lucHV0U2VydmljZSA9IG5ldyBUZXN0UXVpY2tJbnB1dFNlcnZpY2UoKTtcblx0XHQvLyBlbnZpcm9ubWVudFNlcnZpY2UgPSBuZXcgTW9ja1dvcmtiZW5jaEVudmlyb25tZW50U2VydmljZShlbnZWYXJpYWJsZXMpO1xuXHRcdGxhYmVsU2VydmljZSA9IG5ldyBNb2NrTGFiZWxTZXJ2aWNlKCk7XG5cdFx0cGF0aFNlcnZpY2UgPSBuZXcgTW9ja1BhdGhTZXJ2aWNlKCk7XG5cdFx0ZXh0ZW5zaW9uU2VydmljZSA9IG5ldyBUZXN0RXh0ZW5zaW9uU2VydmljZSgpO1xuXHRcdGNvbnRhaW5pbmdXb3Jrc3BhY2UgPSB0ZXN0V29ya3NwYWNlKFVSSS5wYXJzZSgnZmlsZTovLy9WU0NvZGUvd29ya3NwYWNlTG9jYXRpb24nKSk7XG5cdFx0d29ya3NwYWNlID0gY29udGFpbmluZ1dvcmtzcGFjZS5mb2xkZXJzWzBdO1xuXHRcdGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UobnVsbENvbnRleHQsIFByb21pc2UucmVzb2x2ZShlbnZWYXJpYWJsZXMpLCBlZGl0b3JTZXJ2aWNlLCBuZXcgTW9ja0lucHV0c0NvbmZpZ3VyYXRpb25TZXJ2aWNlKCksIG1vY2tDb21tYW5kU2VydmljZSwgbmV3IFRlc3RDb250ZXh0U2VydmljZShjb250YWluaW5nV29ya3NwYWNlKSwgcXVpY2tJbnB1dFNlcnZpY2UsIGxhYmVsU2VydmljZSwgcGF0aFNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgPSBudWxsO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJzdGl0dXRlIG9uZScsIGFzeW5jICgpID0+IHtcblx0XHRpZiAocGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZSwgJ2FiYyAke3dvcmtzcGFjZUZvbGRlcn0geHl6JyksICdhYmMgXFxcXFZTQ29kZVxcXFx3b3Jrc3BhY2VMb2NhdGlvbiB4eXonKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICdhYmMgJHt3b3Jrc3BhY2VGb2xkZXJ9IHh5eicpLCAnYWJjIC9WU0NvZGUvd29ya3NwYWNlTG9jYXRpb24geHl6Jyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBwcmVzZXJ2ZSBwbGF0Zm9ybSBjb25maWcgZXZlbiB3aGVuIG5vdCBtYXRjaGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9iaiA9IHtcblx0XHRcdHByb2dyYW06ICdvc3guc2gnLFxuXHRcdFx0d2luZG93czoge1xuXHRcdFx0XHRwcm9ncmFtOiAnd2luZG93cy5leGUnXG5cdFx0XHR9LFxuXHRcdFx0bGludXg6IHtcblx0XHRcdFx0cHJvZ3JhbTogJ2xpbnV4LnNoJ1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgY29uZmlnOiBhbnkgPSBhd2FpdCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCBvYmopO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBpc1dpbmRvd3MgPyAnd2luZG93cy5leGUnIDogaXNNYWNpbnRvc2ggPyAnb3N4LnNoJyA6IGlzTGludXggPyAnbGludXguc2gnIDogdW5kZWZpbmVkO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy53aW5kb3dzLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcub3N4LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcubGludXgsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5wcm9ncmFtLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGxlcyBwbGF0Zm9ybSBzcGVjaWZpYyBjb25maWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBpc1dpbmRvd3MgPyAnd2luZG93cy5leGUnIDogaXNNYWNpbnRvc2ggPyAnb3N4LnNoJyA6IGlzTGludXggPyAnbGludXguc2gnIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG9iaiA9IHtcblx0XHRcdHdpbmRvd3M6IHtcblx0XHRcdFx0cHJvZ3JhbTogJ3dpbmRvd3MuZXhlJ1xuXHRcdFx0fSxcblx0XHRcdG9zeDoge1xuXHRcdFx0XHRwcm9ncmFtOiAnb3N4LnNoJ1xuXHRcdFx0fSxcblx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdHByb2dyYW06ICdsaW51eC5zaCdcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IG9yaWdpbmFsT2JqID0gSlNPTi5zdHJpbmdpZnkob2JqKTtcblx0XHRjb25zdCBjb25maWc6IGFueSA9IGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsIG9iaik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLnByb2dyYW0sIGV4cGVjdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLndpbmRvd3MsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5vc3gsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5saW51eCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSlNPTi5zdHJpbmdpZnkob2JqKSwgb3JpZ2luYWxPYmopOyAvLyBkaWQgbm90IG11dGF0ZSBvcmlnaW5hbFxuXHR9KTtcblxuXHR0ZXN0KCd3b3Jrc3BhY2UgZm9sZGVyIHdpdGggYXJndW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICdhYmMgJHt3b3Jrc3BhY2VGb2xkZXI6d29ya3NwYWNlTG9jYXRpb259IHh5eicpLCAnYWJjIFxcXFxWU0NvZGVcXFxcd29ya3NwYWNlTG9jYXRpb24geHl6Jyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7d29ya3NwYWNlRm9sZGVyOndvcmtzcGFjZUxvY2F0aW9ufSB4eXonKSwgJ2FiYyAvVlNDb2RlL3dvcmtzcGFjZUxvY2F0aW9uIHh5eicpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnd29ya3NwYWNlIGZvbGRlciB3aXRoIGludmFsaWQgYXJndW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoYXN5bmMgKCkgPT4gYXdhaXQgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZSwgJ2FiYyAke3dvcmtzcGFjZUZvbGRlcjppbnZhbGlkTG9jYXRpb259IHh5eicpKTtcblx0fSk7XG5cblx0dGVzdCgnd29ya3NwYWNlIGZvbGRlciB3aXRoIHVuZGVmaW5lZCB3b3Jrc3BhY2UgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGFzeW5jICgpID0+IGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh1bmRlZmluZWQsICdhYmMgJHt3b3Jrc3BhY2VGb2xkZXJ9IHh5eicpKTtcblx0fSk7XG5cblx0dGVzdCgnd29ya3NwYWNlIGZvbGRlciB3aXRoIGFyZ3VtZW50IGFuZCB1bmRlZmluZWQgd29ya3NwYWNlIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRpZiAocGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZUFzeW5jKHVuZGVmaW5lZCwgJ2FiYyAke3dvcmtzcGFjZUZvbGRlcjp3b3Jrc3BhY2VMb2NhdGlvbn0geHl6JyksICdhYmMgXFxcXFZTQ29kZVxcXFx3b3Jrc3BhY2VMb2NhdGlvbiB4eXonKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh1bmRlZmluZWQsICdhYmMgJHt3b3Jrc3BhY2VGb2xkZXI6d29ya3NwYWNlTG9jYXRpb259IHh5eicpLCAnYWJjIC9WU0NvZGUvd29ya3NwYWNlTG9jYXRpb24geHl6Jyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd3b3Jrc3BhY2UgZm9sZGVyIHdpdGggaW52YWxpZCBhcmd1bWVudCBhbmQgdW5kZWZpbmVkIHdvcmtzcGFjZSBmb2xkZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnJlamVjdHMoYXN5bmMgKCkgPT4gYXdhaXQgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZUFzeW5jKHVuZGVmaW5lZCwgJ2FiYyAke3dvcmtzcGFjZUZvbGRlcjppbnZhbGlkTG9jYXRpb259IHh5eicpKTtcblx0fSk7XG5cblx0dGVzdCgnd29ya3NwYWNlIHJvb3QgZm9sZGVyIG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICdhYmMgJHt3b3Jrc3BhY2VSb290Rm9sZGVyTmFtZX0geHl6JyksICdhYmMgd29ya3NwYWNlTG9jYXRpb24geHl6Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnJlbnQgc2VsZWN0ZWQgbGluZSBudW1iZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICdhYmMgJHtsaW5lTnVtYmVyfSB4eXonKSwgYGFiYyAke21vY2tMaW5lTnVtYmVyfSB4eXpgKTtcblx0fSk7XG5cblx0dGVzdCgncmVsYXRpdmUgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZSwgJ2FiYyAke3JlbGF0aXZlRmlsZX0geHl6JyksICdhYmMgZmlsZSB4eXonKTtcblx0fSk7XG5cblx0dGVzdCgncmVsYXRpdmUgZmlsZSB3aXRoIGFyZ3VtZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7cmVsYXRpdmVGaWxlOndvcmtzcGFjZUxvY2F0aW9ufSB4eXonKSwgJ2FiYyBmaWxlIHh5eicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxhdGl2ZSBmaWxlIHdpdGggaW52YWxpZCBhcmd1bWVudCcsICgpID0+IHtcblx0XHRhc3NlcnQucmVqZWN0cyhhc3luYyAoKSA9PiBhd2FpdCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7cmVsYXRpdmVGaWxlOmludmFsaWRMb2NhdGlvbn0geHl6JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxhdGl2ZSBmaWxlIHdpdGggdW5kZWZpbmVkIHdvcmtzcGFjZSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh1bmRlZmluZWQsICdhYmMgJHtyZWxhdGl2ZUZpbGV9IHh5eicpLCAnYWJjIFxcXFxWU0NvZGVcXFxcd29ya3NwYWNlTG9jYXRpb25cXFxcZmlsZSB4eXonKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh1bmRlZmluZWQsICdhYmMgJHtyZWxhdGl2ZUZpbGV9IHh5eicpLCAnYWJjIC9WU0NvZGUvd29ya3NwYWNlTG9jYXRpb24vZmlsZSB4eXonKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF0aXZlIGZpbGUgd2l0aCBhcmd1bWVudCBhbmQgdW5kZWZpbmVkIHdvcmtzcGFjZSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh1bmRlZmluZWQsICdhYmMgJHtyZWxhdGl2ZUZpbGU6d29ya3NwYWNlTG9jYXRpb259IHh5eicpLCAnYWJjIGZpbGUgeHl6Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF0aXZlIGZpbGUgd2l0aCBpbnZhbGlkIGFyZ3VtZW50IGFuZCB1bmRlZmluZWQgd29ya3NwYWNlIGZvbGRlcicsICgpID0+IHtcblx0XHRhc3NlcnQucmVqZWN0cyhhc3luYyAoKSA9PiBhd2FpdCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlQXN5bmModW5kZWZpbmVkLCAnYWJjICR7cmVsYXRpdmVGaWxlOmludmFsaWRMb2NhdGlvbn0geHl6JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJzdGl0dXRlIG1hbnknLCBhc3luYyAoKSA9PiB7XG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICcke3dvcmtzcGFjZUZvbGRlcn0gLSAke3dvcmtzcGFjZUZvbGRlcn0nKSwgJ1xcXFxWU0NvZGVcXFxcd29ya3NwYWNlTG9jYXRpb24gLSBcXFxcVlNDb2RlXFxcXHdvcmtzcGFjZUxvY2F0aW9uJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnJHt3b3Jrc3BhY2VGb2xkZXJ9IC0gJHt3b3Jrc3BhY2VGb2xkZXJ9JyksICcvVlNDb2RlL3dvcmtzcGFjZUxvY2F0aW9uIC0gL1ZTQ29kZS93b3Jrc3BhY2VMb2NhdGlvbicpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc3Vic3RpdHV0ZSBvbmUgZW52IHZhcmlhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGlmIChwbGF0Zm9ybS5pc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7d29ya3NwYWNlRm9sZGVyfSAke2VudjprZXkxfSB4eXonKSwgJ2FiYyBcXFxcVlNDb2RlXFxcXHdvcmtzcGFjZUxvY2F0aW9uIFZhbHVlIGZvciBrZXkxIHh5eicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZSwgJ2FiYyAke3dvcmtzcGFjZUZvbGRlcn0gJHtlbnY6a2V5MX0geHl6JyksICdhYmMgL1ZTQ29kZS93b3Jrc3BhY2VMb2NhdGlvbiBWYWx1ZSBmb3Iga2V5MSB4eXonKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3N1YnN0aXR1dGUgbWFueSBlbnYgdmFyaWFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICcke3dvcmtzcGFjZUZvbGRlcn0gLSAke3dvcmtzcGFjZUZvbGRlcn0gJHtlbnY6a2V5MX0gLSAke2VudjprZXkyfScpLCAnXFxcXFZTQ29kZVxcXFx3b3Jrc3BhY2VMb2NhdGlvbiAtIFxcXFxWU0NvZGVcXFxcd29ya3NwYWNlTG9jYXRpb24gVmFsdWUgZm9yIGtleTEgLSBWYWx1ZSBmb3Iga2V5MicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZSwgJyR7d29ya3NwYWNlRm9sZGVyfSAtICR7d29ya3NwYWNlRm9sZGVyfSAke2VudjprZXkxfSAtICR7ZW52OmtleTJ9JyksICcvVlNDb2RlL3dvcmtzcGFjZUxvY2F0aW9uIC0gL1ZTQ29kZS93b3Jrc3BhY2VMb2NhdGlvbiBWYWx1ZSBmb3Iga2V5MSAtIFZhbHVlIGZvciBrZXkyJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdkaXNhbGxvd3MgbmVzdGVkIGtleXMgKCM3NzI4OSknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICcke2VudjprZXkxfSAke2VudjprZXkxJHtlbnY6a2V5Mn19JyksICdWYWx1ZSBmb3Iga2V5MSAnKTtcblx0fSk7XG5cblx0dGVzdCgnc3VwcG9ydHMgZXh0ZW5zaW9uRGlyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdldEV4dGVuc2lvbiA9IHN0dWIoZXh0ZW5zaW9uU2VydmljZSwgJ2dldEV4dGVuc2lvbicpO1xuXHRcdGdldEV4dGVuc2lvbi53aXRoQXJncygncHVibGlzaGVyLmV4dElkJykucmV0dXJucyhQcm9taXNlLnJlc29sdmUoeyBleHRlbnNpb25Mb2NhdGlvbjogVVJJLmZpbGUoJy9zb21lL3BhdGgnKSB9IGFzIElFeHRlbnNpb25EZXNjcmlwdGlvbikpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICcke2V4dGVuc2lvbkluc3RhbGxGb2xkZXI6cHVibGlzaGVyLmV4dElkfScpLCBVUkkuZmlsZSgnL3NvbWUvcGF0aCcpLmZzUGF0aCk7XG5cdH0pO1xuXG5cdC8vIHRlc3QoJ3N1YnN0aXR1dGUga2V5cyBhbmQgdmFsdWVzIGluIG9iamVjdCcsICgpID0+IHtcblx0Ly8gXHRjb25zdCBteU9iamVjdCA9IHtcblx0Ly8gXHRcdCcke3dvcmtzcGFjZVJvb3RGb2xkZXJOYW1lfSc6ICcke2xpbmVOdW1iZXJ9Jyxcblx0Ly8gXHRcdCdoZXkgJHtlbnY6a2V5MX0gJzogJyR7d29ya3NwYWNlUm9vdEZvbGRlck5hbWV9J1xuXHQvLyBcdH07XG5cdC8vIFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCBteU9iamVjdCksIHtcblx0Ly8gXHRcdCd3b3Jrc3BhY2VMb2NhdGlvbic6IGAke2VkaXRvclNlcnZpY2UubW9ja0xpbmVOdW1iZXJ9YCxcblx0Ly8gXHRcdCdoZXkgVmFsdWUgZm9yIGtleTEgJzogJ3dvcmtzcGFjZUxvY2F0aW9uJ1xuXHQvLyBcdH0pO1xuXHQvLyB9KTtcblxuXG5cdHRlc3QoJ3N1YnN0aXR1dGUgb25lIGVudiB2YXJpYWJsZSB1c2luZyBwbGF0Zm9ybSBjYXNlIHNlbnNpdGl2aXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGlmIChwbGF0Zm9ybS5pc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnJHtlbnY6a2V5MX0gLSAke2VudjpLZXkxfScpLCAnVmFsdWUgZm9yIGtleTEgLSBWYWx1ZSBmb3Iga2V5MScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZSwgJyR7ZW52OmtleTF9IC0gJHtlbnY6S2V5MX0nKSwgJ1ZhbHVlIGZvciBrZXkxIC0gJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzdWJzdGl0dXRlIG9uZSBjb25maWd1cmF0aW9uIHZhcmlhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRmb250RmFtaWx5OiAnZm9vJ1xuXHRcdFx0fSxcblx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRmb250RmFtaWx5OiAnYmFyJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKG51bGxDb250ZXh0LCBQcm9taXNlLnJlc29sdmUoZW52VmFyaWFibGVzKSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RWRpdG9yU2VydmljZVdpdGhBY3RpdmVFZGl0b3IoKSksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2NrQ29tbWFuZFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSwgcXVpY2tJbnB1dFNlcnZpY2UsIGxhYmVsU2VydmljZSwgcGF0aFNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7Y29uZmlnOmVkaXRvci5mb250RmFtaWx5fSB4eXonKSwgJ2FiYyBmb28geHl6Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubGluZXMgYW4gYXJyYXkgKCMyNDU3MTgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRmb250RmFtaWx5OiBbJ2ZvbycsICdiYXInXVxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UobnVsbENvbnRleHQsIFByb21pc2UucmVzb2x2ZShlbnZWYXJpYWJsZXMpLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JTZXJ2aWNlV2l0aEFjdGl2ZUVkaXRvcigpKSwgY29uZmlndXJhdGlvblNlcnZpY2UsIG1vY2tDb21tYW5kU2VydmljZSwgbmV3IFRlc3RDb250ZXh0U2VydmljZSgpLCBxdWlja0lucHV0U2VydmljZSwgbGFiZWxTZXJ2aWNlLCBwYXRoU2VydmljZSwgZXh0ZW5zaW9uU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICdhYmMgJHtjb25maWc6ZWRpdG9yLmZvbnRGYW1pbHl9IHh5eicpLCAnYWJjIGZvbyxiYXIgeHl6Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1YnN0aXR1dGUgY29uZmlndXJhdGlvbiB2YXJpYWJsZSB3aXRoIHVuZGVmaW5lZCB3b3Jrc3BhY2UgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRmb250RmFtaWx5OiAnZm9vJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZShudWxsQ29udGV4dCwgUHJvbWlzZS5yZXNvbHZlKGVudlZhcmlhYmxlcyksIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvclNlcnZpY2VXaXRoQWN0aXZlRWRpdG9yKCkpLCBjb25maWd1cmF0aW9uU2VydmljZSwgbW9ja0NvbW1hbmRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksIHF1aWNrSW5wdXRTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIHBhdGhTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UucmVzb2x2ZUFzeW5jKHVuZGVmaW5lZCwgJ2FiYyAke2NvbmZpZzplZGl0b3IuZm9udEZhbWlseX0geHl6JyksICdhYmMgZm9vIHh5eicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJzdGl0dXRlIG1hbnkgY29uZmlndXJhdGlvbiB2YXJpYWJsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRmb250RmFtaWx5OiAnZm9vJ1xuXHRcdFx0fSxcblx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRmb250RmFtaWx5OiAnYmFyJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKG51bGxDb250ZXh0LCBQcm9taXNlLnJlc29sdmUoZW52VmFyaWFibGVzKSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RWRpdG9yU2VydmljZVdpdGhBY3RpdmVFZGl0b3IoKSksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2NrQ29tbWFuZFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSwgcXVpY2tJbnB1dFNlcnZpY2UsIGxhYmVsU2VydmljZSwgcGF0aFNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7Y29uZmlnOmVkaXRvci5mb250RmFtaWx5fSAke2NvbmZpZzp0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRGYW1pbHl9IHh5eicpLCAnYWJjIGZvbyBiYXIgeHl6Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1YnN0aXR1dGUgb25lIGVudiB2YXJpYWJsZSBhbmQgYSBjb25maWd1cmF0aW9uIHZhcmlhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0Zm9udEZhbWlseTogJ2Zvbydcblx0XHRcdH0sXG5cdFx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0XHRpbnRlZ3JhdGVkOiB7XG5cdFx0XHRcdFx0Zm9udEZhbWlseTogJ2Jhcidcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZShudWxsQ29udGV4dCwgUHJvbWlzZS5yZXNvbHZlKGVudlZhcmlhYmxlcyksIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvclNlcnZpY2VXaXRoQWN0aXZlRWRpdG9yKCkpLCBjb25maWd1cmF0aW9uU2VydmljZSwgbW9ja0NvbW1hbmRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksIHF1aWNrSW5wdXRTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIHBhdGhTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZSwgJ2FiYyAke2NvbmZpZzplZGl0b3IuZm9udEZhbWlseX0gJHt3b3Jrc3BhY2VGb2xkZXJ9ICR7ZW52OmtleTF9IHh5eicpLCAnYWJjIGZvbyBcXFxcVlNDb2RlXFxcXHdvcmtzcGFjZUxvY2F0aW9uIFZhbHVlIGZvciBrZXkxIHh5eicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7Y29uZmlnOmVkaXRvci5mb250RmFtaWx5fSAke3dvcmtzcGFjZUZvbGRlcn0gJHtlbnY6a2V5MX0geHl6JyksICdhYmMgZm9vIC9WU0NvZGUvd29ya3NwYWNlTG9jYXRpb24gVmFsdWUgZm9yIGtleTEgeHl6Jyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWN1cnNpdmVseSByZXNvbHZlIHZhcmlhYmxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0a2V5MTogJ2tleTE9JHtjb25maWc6a2V5Mn0nLFxuXHRcdFx0a2V5MjogJ2tleTI9JHtjb25maWc6a2V5M30nLFxuXHRcdFx0a2V5MzogJ3dlIGRpZCBpdCEnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZShudWxsQ29udGV4dCwgUHJvbWlzZS5yZXNvbHZlKGVudlZhcmlhYmxlcyksIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvclNlcnZpY2VXaXRoQWN0aXZlRWRpdG9yKCkpLCBjb25maWd1cmF0aW9uU2VydmljZSwgbW9ja0NvbW1hbmRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksIHF1aWNrSW5wdXRTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIHBhdGhTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZSwgJyR7Y29uZmlnOmtleTF9JyksICdrZXkxPWtleTI9d2UgZGlkIGl0IScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJzdGl0dXRlIG1hbnkgZW52IHZhcmlhYmxlIGFuZCBhIGNvbmZpZ3VyYXRpb24gdmFyaWFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRmb250RmFtaWx5OiAnZm9vJ1xuXHRcdFx0fSxcblx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRmb250RmFtaWx5OiAnYmFyJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKG51bGxDb250ZXh0LCBQcm9taXNlLnJlc29sdmUoZW52VmFyaWFibGVzKSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RWRpdG9yU2VydmljZVdpdGhBY3RpdmVFZGl0b3IoKSksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2NrQ29tbWFuZFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSwgcXVpY2tJbnB1dFNlcnZpY2UsIGxhYmVsU2VydmljZSwgcGF0aFNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpZiAocGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnJHtjb25maWc6ZWRpdG9yLmZvbnRGYW1pbHl9ICR7Y29uZmlnOnRlcm1pbmFsLmludGVncmF0ZWQuZm9udEZhbWlseX0gJHt3b3Jrc3BhY2VGb2xkZXJ9IC0gJHt3b3Jrc3BhY2VGb2xkZXJ9ICR7ZW52OmtleTF9IC0gJHtlbnY6a2V5Mn0nKSwgJ2ZvbyBiYXIgXFxcXFZTQ29kZVxcXFx3b3Jrc3BhY2VMb2NhdGlvbiAtIFxcXFxWU0NvZGVcXFxcd29ya3NwYWNlTG9jYXRpb24gVmFsdWUgZm9yIGtleTEgLSBWYWx1ZSBmb3Iga2V5MicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnJHtjb25maWc6ZWRpdG9yLmZvbnRGYW1pbHl9ICR7Y29uZmlnOnRlcm1pbmFsLmludGVncmF0ZWQuZm9udEZhbWlseX0gJHt3b3Jrc3BhY2VGb2xkZXJ9IC0gJHt3b3Jrc3BhY2VGb2xkZXJ9ICR7ZW52OmtleTF9IC0gJHtlbnY6a2V5Mn0nKSwgJ2ZvbyBiYXIgL1ZTQ29kZS93b3Jrc3BhY2VMb2NhdGlvbiAtIC9WU0NvZGUvd29ya3NwYWNlTG9jYXRpb24gVmFsdWUgZm9yIGtleTEgLSBWYWx1ZSBmb3Iga2V5MicpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbWl4ZWQgdHlwZXMgb2YgY29uZmlndXJhdGlvbiB2YXJpYWJsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRmb250RmFtaWx5OiAnZm9vJyxcblx0XHRcdFx0bGluZU51bWJlcnM6IDEyMyxcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdHRlcm1pbmFsOiB7XG5cdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRmb250RmFtaWx5OiAnYmFyJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0anNvbjoge1xuXHRcdFx0XHRzY2hlbWFzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZmlsZU1hdGNoOiBbXG5cdFx0XHRcdFx0XHRcdCcvbXlmaWxlJyxcblx0XHRcdFx0XHRcdFx0Jy9teU90aGVyZmlsZSdcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHR1cmw6ICdzY2hlbWFVUkwnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKG51bGxDb250ZXh0LCBQcm9taXNlLnJlc29sdmUoZW52VmFyaWFibGVzKSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RWRpdG9yU2VydmljZVdpdGhBY3RpdmVFZGl0b3IoKSksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2NrQ29tbWFuZFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSwgcXVpY2tJbnB1dFNlcnZpY2UsIGxhYmVsU2VydmljZSwgcGF0aFNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7Y29uZmlnOmVkaXRvci5mb250RmFtaWx5fSAke2NvbmZpZzplZGl0b3IubGluZU51bWJlcnN9ICR7Y29uZmlnOmVkaXRvci5pbnNlcnRTcGFjZXN9IHh5eicpLCAnYWJjIGZvbyAxMjMgZmFsc2UgeHl6Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgb3JpZ2luYWwgdmFyaWFibGUgYXMgZmFsbGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdGVkaXRvcjoge31cblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UobnVsbENvbnRleHQsIFByb21pc2UucmVzb2x2ZShlbnZWYXJpYWJsZXMpLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JTZXJ2aWNlV2l0aEFjdGl2ZUVkaXRvcigpKSwgY29uZmlndXJhdGlvblNlcnZpY2UsIG1vY2tDb21tYW5kU2VydmljZSwgbmV3IFRlc3RDb250ZXh0U2VydmljZSgpLCBxdWlja0lucHV0U2VydmljZSwgbGFiZWxTZXJ2aWNlLCBwYXRoU2VydmljZSwgZXh0ZW5zaW9uU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICdhYmMgJHt1bmtub3duVmFyaWFibGV9IHh5eicpLCAnYWJjICR7dW5rbm93blZhcmlhYmxlfSB4eXonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7ZW52OnVua25vd25WYXJpYWJsZX0geHl6JyksICdhYmMgIHh5eicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmF0aW9uIHZhcmlhYmxlcyB3aXRoIGludmFsaWQgYWNjZXNzb3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRmb250RmFtaWx5OiAnZm9vJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZShudWxsQ29udGV4dCwgUHJvbWlzZS5yZXNvbHZlKGVudlZhcmlhYmxlcyksIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEVkaXRvclNlcnZpY2VXaXRoQWN0aXZlRWRpdG9yKCkpLCBjb25maWd1cmF0aW9uU2VydmljZSwgbW9ja0NvbW1hbmRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksIHF1aWNrSW5wdXRTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIHBhdGhTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSk7XG5cblx0XHRhc3NlcnQucmVqZWN0cyhhc3luYyAoKSA9PiBhd2FpdCBzZXJ2aWNlLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICdhYmMgJHtlbnZ9IHh5eicpKTtcblx0XHRhc3NlcnQucmVqZWN0cyhhc3luYyAoKSA9PiBhd2FpdCBzZXJ2aWNlLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICdhYmMgJHtlbnY6fSB4eXonKSk7XG5cdFx0YXNzZXJ0LnJlamVjdHMoYXN5bmMgKCkgPT4gYXdhaXQgc2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7Y29uZmlnfSB4eXonKSk7XG5cdFx0YXNzZXJ0LnJlamVjdHMoYXN5bmMgKCkgPT4gYXdhaXQgc2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7Y29uZmlnOn0geHl6JykpO1xuXHRcdGFzc2VydC5yZWplY3RzKGFzeW5jICgpID0+IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZSwgJ2FiYyAke2NvbmZpZzplZGl0b3J9IHh5eicpKTtcblx0XHRhc3NlcnQucmVqZWN0cyhhc3luYyAoKSA9PiBhd2FpdCBzZXJ2aWNlLnJlc29sdmVBc3luYyh3b3Jrc3BhY2UsICdhYmMgJHtjb25maWc6ZWRpdG9yLi5mb250RmFtaWx5fSB4eXonKSk7XG5cdFx0YXNzZXJ0LnJlamVjdHMoYXN5bmMgKCkgPT4gYXdhaXQgc2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlLCAnYWJjICR7Y29uZmlnOmVkaXRvci5ub25lLm5vbmUyfSB4eXonKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc2luZ2xlIGNvbW1hbmQgdmFyaWFibGUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0ge1xuXHRcdFx0J25hbWUnOiAnQXR0YWNoIHRvIFByb2Nlc3MnLFxuXHRcdFx0J3R5cGUnOiAnbm9kZScsXG5cdFx0XHQncmVxdWVzdCc6ICdhdHRhY2gnLFxuXHRcdFx0J3Byb2Nlc3NJZCc6ICcke2NvbW1hbmQ6Y29tbWFuZDF9Jyxcblx0XHRcdCdwb3J0JzogNTg1OCxcblx0XHRcdCdzb3VyY2VNYXBzJzogZmFsc2UsXG5cdFx0XHQnb3V0RGlyJzogbnVsbFxuXHRcdH07XG5cblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZVdpdGhJbnRlcmFjdGlvblJlcGxhY2UodW5kZWZpbmVkLCBjb25maWd1cmF0aW9uKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgLi4ucmVzdWx0IH0sIHtcblx0XHRcdFx0J25hbWUnOiAnQXR0YWNoIHRvIFByb2Nlc3MnLFxuXHRcdFx0XHQndHlwZSc6ICdub2RlJyxcblx0XHRcdFx0J3JlcXVlc3QnOiAnYXR0YWNoJyxcblx0XHRcdFx0J3Byb2Nlc3NJZCc6ICdjb21tYW5kMS1yZXN1bHQnLFxuXHRcdFx0XHQncG9ydCc6IDU4NTgsXG5cdFx0XHRcdCdzb3VyY2VNYXBzJzogZmFsc2UsXG5cdFx0XHRcdCdvdXREaXInOiBudWxsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIG1vY2tDb21tYW5kU2VydmljZS5jYWxsQ291bnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBvbGQgc3R5bGUgY29tbWFuZCB2YXJpYWJsZScsICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0ge1xuXHRcdFx0J25hbWUnOiAnQXR0YWNoIHRvIFByb2Nlc3MnLFxuXHRcdFx0J3R5cGUnOiAnbm9kZScsXG5cdFx0XHQncmVxdWVzdCc6ICdhdHRhY2gnLFxuXHRcdFx0J3Byb2Nlc3NJZCc6ICcke2NvbW1hbmQ6Y29tbWFuZFZhcmlhYmxlMX0nLFxuXHRcdFx0J3BvcnQnOiA1ODU4LFxuXHRcdFx0J3NvdXJjZU1hcHMnOiBmYWxzZSxcblx0XHRcdCdvdXREaXInOiBudWxsXG5cdFx0fTtcblx0XHRjb25zdCBjb21tYW5kVmFyaWFibGVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRjb21tYW5kVmFyaWFibGVzWydjb21tYW5kVmFyaWFibGUxJ10gPSAnY29tbWFuZDEnO1xuXG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVXaXRoSW50ZXJhY3Rpb25SZXBsYWNlKHVuZGVmaW5lZCwgY29uZmlndXJhdGlvbiwgdW5kZWZpbmVkLCBjb21tYW5kVmFyaWFibGVzKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgLi4ucmVzdWx0IH0sIHtcblx0XHRcdFx0J25hbWUnOiAnQXR0YWNoIHRvIFByb2Nlc3MnLFxuXHRcdFx0XHQndHlwZSc6ICdub2RlJyxcblx0XHRcdFx0J3JlcXVlc3QnOiAnYXR0YWNoJyxcblx0XHRcdFx0J3Byb2Nlc3NJZCc6ICdjb21tYW5kMS1yZXN1bHQnLFxuXHRcdFx0XHQncG9ydCc6IDU4NTgsXG5cdFx0XHRcdCdzb3VyY2VNYXBzJzogZmFsc2UsXG5cdFx0XHRcdCdvdXREaXInOiBudWxsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIG1vY2tDb21tYW5kU2VydmljZS5jYWxsQ291bnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBuZXcgYW5kIG9sZC1zdHlsZSBjb21tYW5kIHZhcmlhYmxlcycsICgpID0+IHtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHQnbmFtZSc6ICdBdHRhY2ggdG8gUHJvY2VzcycsXG5cdFx0XHQndHlwZSc6ICdub2RlJyxcblx0XHRcdCdyZXF1ZXN0JzogJ2F0dGFjaCcsXG5cdFx0XHQncHJvY2Vzc0lkJzogJyR7Y29tbWFuZDpjb21tYW5kVmFyaWFibGUxfScsXG5cdFx0XHQncGlkJzogJyR7Y29tbWFuZDpjb21tYW5kMn0nLFxuXHRcdFx0J3NvdXJjZU1hcHMnOiBmYWxzZSxcblx0XHRcdCdvdXREaXInOiAnc3JjLyR7Y29tbWFuZDpjb21tYW5kMn0nLFxuXHRcdFx0J2Vudic6IHtcblx0XHRcdFx0J3Byb2Nlc3NJZCc6ICdfXyR7Y29tbWFuZDpjb21tYW5kMn1fXycsXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBjb21tYW5kVmFyaWFibGVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRjb21tYW5kVmFyaWFibGVzWydjb21tYW5kVmFyaWFibGUxJ10gPSAnY29tbWFuZDEnO1xuXG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVXaXRoSW50ZXJhY3Rpb25SZXBsYWNlKHVuZGVmaW5lZCwgY29uZmlndXJhdGlvbiwgdW5kZWZpbmVkLCBjb21tYW5kVmFyaWFibGVzKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IHtcblx0XHRcdFx0J25hbWUnOiAnQXR0YWNoIHRvIFByb2Nlc3MnLFxuXHRcdFx0XHQndHlwZSc6ICdub2RlJyxcblx0XHRcdFx0J3JlcXVlc3QnOiAnYXR0YWNoJyxcblx0XHRcdFx0J3Byb2Nlc3NJZCc6ICdjb21tYW5kMS1yZXN1bHQnLFxuXHRcdFx0XHQncGlkJzogJ2NvbW1hbmQyLXJlc3VsdCcsXG5cdFx0XHRcdCdzb3VyY2VNYXBzJzogZmFsc2UsXG5cdFx0XHRcdCdvdXREaXInOiAnc3JjL2NvbW1hbmQyLXJlc3VsdCcsXG5cdFx0XHRcdCdlbnYnOiB7XG5cdFx0XHRcdFx0J3Byb2Nlc3NJZCc6ICdfX2NvbW1hbmQyLXJlc3VsdF9fJyxcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3Qua2V5cyhyZXN1bHQpLCBPYmplY3Qua2V5cyhleHBlY3RlZCkpO1xuXHRcdFx0T2JqZWN0LmtleXMocmVzdWx0KS5mb3JFYWNoKHByb3BlcnR5ID0+IHtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRQcm9wZXJ0eSA9IChleHBlY3RlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcHJvcGVydHldO1xuXHRcdFx0XHRpZiAoaXNPYmplY3QocmVzdWx0W3Byb3BlcnR5XSkpIHtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgLi4ucmVzdWx0W3Byb3BlcnR5XSB9LCBleHBlY3RlZFByb3BlcnR5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFtwcm9wZXJ0eV0sIGV4cGVjdGVkUHJvcGVydHkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgyLCBtb2NrQ29tbWFuZFNlcnZpY2UuY2FsbENvdW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBjb21tYW5kIHZhcmlhYmxlIHRoYXQgcmVsaWVzIG9uIHJlc29sdmVkIGVudiB2YXJzJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHtcblx0XHRcdCduYW1lJzogJ0F0dGFjaCB0byBQcm9jZXNzJyxcblx0XHRcdCd0eXBlJzogJ25vZGUnLFxuXHRcdFx0J3JlcXVlc3QnOiAnYXR0YWNoJyxcblx0XHRcdCdwcm9jZXNzSWQnOiAnJHtjb21tYW5kOmNvbW1hbmRWYXJpYWJsZTF9Jyxcblx0XHRcdCd2YWx1ZSc6ICcke2VudjprZXkxfSdcblx0XHR9O1xuXHRcdGNvbnN0IGNvbW1hbmRWYXJpYWJsZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGNvbW1hbmRWYXJpYWJsZXNbJ2NvbW1hbmRWYXJpYWJsZTEnXSA9ICdjb21tYW5kMSc7XG5cblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZVdpdGhJbnRlcmFjdGlvblJlcGxhY2UodW5kZWZpbmVkLCBjb25maWd1cmF0aW9uLCB1bmRlZmluZWQsIGNvbW1hbmRWYXJpYWJsZXMpLnRoZW4ocmVzdWx0ID0+IHtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IC4uLnJlc3VsdCB9LCB7XG5cdFx0XHRcdCduYW1lJzogJ0F0dGFjaCB0byBQcm9jZXNzJyxcblx0XHRcdFx0J3R5cGUnOiAnbm9kZScsXG5cdFx0XHRcdCdyZXF1ZXN0JzogJ2F0dGFjaCcsXG5cdFx0XHRcdCdwcm9jZXNzSWQnOiAnVmFsdWUgZm9yIGtleTEnLFxuXHRcdFx0XHQndmFsdWUnOiAnVmFsdWUgZm9yIGtleTEnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIG1vY2tDb21tYW5kU2VydmljZS5jYWxsQ291bnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHNpbmdsZSBwcm9tcHQgaW5wdXQgdmFyaWFibGUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0ge1xuXHRcdFx0J25hbWUnOiAnQXR0YWNoIHRvIFByb2Nlc3MnLFxuXHRcdFx0J3R5cGUnOiAnbm9kZScsXG5cdFx0XHQncmVxdWVzdCc6ICdhdHRhY2gnLFxuXHRcdFx0J3Byb2Nlc3NJZCc6ICcke2lucHV0OmlucHV0MX0nLFxuXHRcdFx0J3BvcnQnOiA1ODU4LFxuXHRcdFx0J3NvdXJjZU1hcHMnOiBmYWxzZSxcblx0XHRcdCdvdXREaXInOiBudWxsXG5cdFx0fTtcblxuXHRcdHJldHVybiBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlV2l0aEludGVyYWN0aW9uUmVwbGFjZSh3b3Jrc3BhY2UsIGNvbmZpZ3VyYXRpb24sICd0YXNrcycpLnRoZW4ocmVzdWx0ID0+IHtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IC4uLnJlc3VsdCB9LCB7XG5cdFx0XHRcdCduYW1lJzogJ0F0dGFjaCB0byBQcm9jZXNzJyxcblx0XHRcdFx0J3R5cGUnOiAnbm9kZScsXG5cdFx0XHRcdCdyZXF1ZXN0JzogJ2F0dGFjaCcsXG5cdFx0XHRcdCdwcm9jZXNzSWQnOiAncmVzb2x2ZWRFbnRlcmlucHV0MScsXG5cdFx0XHRcdCdwb3J0JzogNTg1OCxcblx0XHRcdFx0J3NvdXJjZU1hcHMnOiBmYWxzZSxcblx0XHRcdFx0J291dERpcic6IG51bGxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMCwgbW9ja0NvbW1hbmRTZXJ2aWNlLmNhbGxDb3VudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc2luZ2xlIHBpY2sgaW5wdXQgdmFyaWFibGUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0ge1xuXHRcdFx0J25hbWUnOiAnQXR0YWNoIHRvIFByb2Nlc3MnLFxuXHRcdFx0J3R5cGUnOiAnbm9kZScsXG5cdFx0XHQncmVxdWVzdCc6ICdhdHRhY2gnLFxuXHRcdFx0J3Byb2Nlc3NJZCc6ICcke2lucHV0OmlucHV0Mn0nLFxuXHRcdFx0J3BvcnQnOiA1ODU4LFxuXHRcdFx0J3NvdXJjZU1hcHMnOiBmYWxzZSxcblx0XHRcdCdvdXREaXInOiBudWxsXG5cdFx0fTtcblxuXHRcdHJldHVybiBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlV2l0aEludGVyYWN0aW9uUmVwbGFjZSh3b3Jrc3BhY2UsIGNvbmZpZ3VyYXRpb24sICd0YXNrcycpLnRoZW4ocmVzdWx0ID0+IHtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IC4uLnJlc3VsdCB9LCB7XG5cdFx0XHRcdCduYW1lJzogJ0F0dGFjaCB0byBQcm9jZXNzJyxcblx0XHRcdFx0J3R5cGUnOiAnbm9kZScsXG5cdFx0XHRcdCdyZXF1ZXN0JzogJ2F0dGFjaCcsXG5cdFx0XHRcdCdwcm9jZXNzSWQnOiAnc2VsZWN0ZWRQaWNrJyxcblx0XHRcdFx0J3BvcnQnOiA1ODU4LFxuXHRcdFx0XHQnc291cmNlTWFwcyc6IGZhbHNlLFxuXHRcdFx0XHQnb3V0RGlyJzogbnVsbFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgwLCBtb2NrQ29tbWFuZFNlcnZpY2UuY2FsbENvdW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBzaW5nbGUgY29tbWFuZCBpbnB1dCB2YXJpYWJsZScsICgpID0+IHtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHQnbmFtZSc6ICdBdHRhY2ggdG8gUHJvY2VzcycsXG5cdFx0XHQndHlwZSc6ICdub2RlJyxcblx0XHRcdCdyZXF1ZXN0JzogJ2F0dGFjaCcsXG5cdFx0XHQncHJvY2Vzc0lkJzogJyR7aW5wdXQ6aW5wdXQ0fScsXG5cdFx0XHQncG9ydCc6IDU4NTgsXG5cdFx0XHQnc291cmNlTWFwcyc6IGZhbHNlLFxuXHRcdFx0J291dERpcic6IG51bGxcblx0XHR9O1xuXG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVXaXRoSW50ZXJhY3Rpb25SZXBsYWNlKHdvcmtzcGFjZSwgY29uZmlndXJhdGlvbiwgJ3Rhc2tzJykudGhlbihyZXN1bHQgPT4ge1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgLi4ucmVzdWx0IH0sIHtcblx0XHRcdFx0J25hbWUnOiAnQXR0YWNoIHRvIFByb2Nlc3MnLFxuXHRcdFx0XHQndHlwZSc6ICdub2RlJyxcblx0XHRcdFx0J3JlcXVlc3QnOiAnYXR0YWNoJyxcblx0XHRcdFx0J3Byb2Nlc3NJZCc6ICdhcmcgZm9yIGNvbW1hbmQnLFxuXHRcdFx0XHQncG9ydCc6IDU4NTgsXG5cdFx0XHRcdCdzb3VyY2VNYXBzJzogZmFsc2UsXG5cdFx0XHRcdCdvdXREaXInOiBudWxsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIG1vY2tDb21tYW5kU2VydmljZS5jYWxsQ291bnQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXZlcmFsIGlucHV0IHZhcmlhYmxlcyBhbmQgY29tbWFuZCcsICgpID0+IHtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHQnbmFtZSc6ICcke2lucHV0OmlucHV0M30nLFxuXHRcdFx0J3R5cGUnOiAnJHtjb21tYW5kOmNvbW1hbmQxfScsXG5cdFx0XHQncmVxdWVzdCc6ICcke2lucHV0OmlucHV0MX0nLFxuXHRcdFx0J3Byb2Nlc3NJZCc6ICcke2lucHV0OmlucHV0Mn0nLFxuXHRcdFx0J2NvbW1hbmQnOiAnJHtpbnB1dDppbnB1dDR9Jyxcblx0XHRcdCdwb3J0JzogNTg1OCxcblx0XHRcdCdzb3VyY2VNYXBzJzogZmFsc2UsXG5cdFx0XHQnb3V0RGlyJzogbnVsbFxuXHRcdH07XG5cblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZVdpdGhJbnRlcmFjdGlvblJlcGxhY2Uod29ya3NwYWNlLCBjb25maWd1cmF0aW9uLCAndGFza3MnKS50aGVuKHJlc3VsdCA9PiB7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyAuLi5yZXN1bHQgfSwge1xuXHRcdFx0XHQnbmFtZSc6ICdyZXNvbHZlZEVudGVyaW5wdXQzJyxcblx0XHRcdFx0J3R5cGUnOiAnY29tbWFuZDEtcmVzdWx0Jyxcblx0XHRcdFx0J3JlcXVlc3QnOiAncmVzb2x2ZWRFbnRlcmlucHV0MScsXG5cdFx0XHRcdCdwcm9jZXNzSWQnOiAnc2VsZWN0ZWRQaWNrJyxcblx0XHRcdFx0J2NvbW1hbmQnOiAnYXJnIGZvciBjb21tYW5kJyxcblx0XHRcdFx0J3BvcnQnOiA1ODU4LFxuXHRcdFx0XHQnc291cmNlTWFwcyc6IGZhbHNlLFxuXHRcdFx0XHQnb3V0RGlyJzogbnVsbFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgyLCBtb2NrQ29tbWFuZFNlcnZpY2UuY2FsbENvdW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5wdXQgdmFyaWFibGUgd2l0aCB1bmRlZmluZWQgd29ya3NwYWNlIGZvbGRlcicsICgpID0+IHtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHQnbmFtZSc6ICdBdHRhY2ggdG8gUHJvY2VzcycsXG5cdFx0XHQndHlwZSc6ICdub2RlJyxcblx0XHRcdCdyZXF1ZXN0JzogJ2F0dGFjaCcsXG5cdFx0XHQncHJvY2Vzc0lkJzogJyR7aW5wdXQ6aW5wdXQxfScsXG5cdFx0XHQncG9ydCc6IDU4NTgsXG5cdFx0XHQnc291cmNlTWFwcyc6IGZhbHNlLFxuXHRcdFx0J291dERpcic6IG51bGxcblx0XHR9O1xuXG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVXaXRoSW50ZXJhY3Rpb25SZXBsYWNlKHVuZGVmaW5lZCwgY29uZmlndXJhdGlvbiwgJ3Rhc2tzJykudGhlbihyZXN1bHQgPT4ge1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgLi4ucmVzdWx0IH0sIHtcblx0XHRcdFx0J25hbWUnOiAnQXR0YWNoIHRvIFByb2Nlc3MnLFxuXHRcdFx0XHQndHlwZSc6ICdub2RlJyxcblx0XHRcdFx0J3JlcXVlc3QnOiAnYXR0YWNoJyxcblx0XHRcdFx0J3Byb2Nlc3NJZCc6ICdyZXNvbHZlZEVudGVyaW5wdXQxJyxcblx0XHRcdFx0J3BvcnQnOiA1ODU4LFxuXHRcdFx0XHQnc291cmNlTWFwcyc6IGZhbHNlLFxuXHRcdFx0XHQnb3V0RGlyJzogbnVsbFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgwLCBtb2NrQ29tbWFuZFNlcnZpY2UuY2FsbENvdW50KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29udHJpYnV0ZWQgdmFyaWFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVpbGRUYXNrID0gJ25wbTogY29tcGlsZSc7XG5cdFx0Y29uc3QgdmFyaWFibGUgPSAnZGVmYXVsdEJ1aWxkVGFzayc7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHtcblx0XHRcdCduYW1lJzogJyR7JyArIHZhcmlhYmxlICsgJ30nLFxuXHRcdH07XG5cdFx0Y29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEuY29udHJpYnV0ZVZhcmlhYmxlKHZhcmlhYmxlLCBhc3luYyAoKSA9PiB7IHJldHVybiBidWlsZFRhc2s7IH0pO1xuXHRcdHJldHVybiBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlV2l0aEludGVyYWN0aW9uUmVwbGFjZSh3b3Jrc3BhY2UsIGNvbmZpZ3VyYXRpb24pLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyAuLi5yZXN1bHQgfSwge1xuXHRcdFx0XHQnbmFtZSc6IGAke2J1aWxkVGFza31gXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29udHJpYnV0ZWQgdGFza1ZhciB2YXJpYWJsZScsICgpID0+IHtcblx0XHRjb25zdCB1cmwgPSAnaHR0cDovL2xvY2FsaG9zdDo1Njc4Jztcblx0XHRjb25zdCB2YXJpYWJsZSA9ICd0YXNrVmFyOmNvbXBvbmVudEV4cGxvcmVyVXJsJztcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0ge1xuXHRcdFx0J3VybCc6ICcke3Rhc2tWYXI6Y29tcG9uZW50RXhwbG9yZXJVcmx9L19fX2V4cGxvcmVyJyxcblx0XHR9O1xuXHRcdGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLmNvbnRyaWJ1dGVWYXJpYWJsZSh2YXJpYWJsZSwgYXN5bmMgKCkgPT4geyByZXR1cm4gdXJsOyB9KTtcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSEucmVzb2x2ZVdpdGhJbnRlcmFjdGlvblJlcGxhY2Uod29ya3NwYWNlLCBjb25maWd1cmF0aW9uKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgLi4ucmVzdWx0IH0sIHtcblx0XHRcdFx0J3VybCc6IGAke3VybH0vX19fZXhwbG9yZXJgXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdpdGhFbnZpcm9ubWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbnYgPSB7XG5cdFx0XHQnVkFSXzEnOiAnVkFMXzEnLFxuXHRcdFx0J1ZBUl8yJzogJ1ZBTF8yJ1xuXHRcdH07XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9ICdlY2hvICR7ZW52OlZBUl8xfSR7ZW52OlZBUl8yfSc7XG5cdFx0Y29uc3QgcmVzb2x2ZWRSZXN1bHQgPSBhd2FpdCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlV2l0aEVudmlyb25tZW50KHsgLi4uZW52IH0sIHVuZGVmaW5lZCwgY29uZmlndXJhdGlvbik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlZFJlc3VsdCwgJ2VjaG8gVkFMXzFWQUxfMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJzdGl0dXRpb24gaW4gb2JqZWN0IGtleScsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHQnbmFtZSc6ICdUZXN0Jyxcblx0XHRcdCdtYXBwaW5ncyc6IHtcblx0XHRcdFx0J3BvczEnOiAndmFsdWUxJyxcblx0XHRcdFx0JyR7d29ya3NwYWNlRm9sZGVyfS90ZXN0MSc6ICcke3dvcmtzcGFjZUZvbGRlcn0vdGVzdDInLFxuXHRcdFx0XHQncG9zMyc6ICd2YWx1ZTMnXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJldHVybiBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIS5yZXNvbHZlV2l0aEludGVyYWN0aW9uUmVwbGFjZSh3b3Jrc3BhY2UsIGNvbmZpZ3VyYXRpb24sICd0YXNrcycpLnRoZW4ocmVzdWx0ID0+IHtcblxuXHRcdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgLi4ucmVzdWx0IH0sIHtcblx0XHRcdFx0XHQnbmFtZSc6ICdUZXN0Jyxcblx0XHRcdFx0XHQnbWFwcGluZ3MnOiB7XG5cdFx0XHRcdFx0XHQncG9zMSc6ICd2YWx1ZTEnLFxuXHRcdFx0XHRcdFx0J1xcXFxWU0NvZGVcXFxcd29ya3NwYWNlTG9jYXRpb24vdGVzdDEnOiAnXFxcXFZTQ29kZVxcXFx3b3Jrc3BhY2VMb2NhdGlvbi90ZXN0MicsXG5cdFx0XHRcdFx0XHQncG9zMyc6ICd2YWx1ZTMnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyAuLi5yZXN1bHQgfSwge1xuXHRcdFx0XHRcdCduYW1lJzogJ1Rlc3QnLFxuXHRcdFx0XHRcdCdtYXBwaW5ncyc6IHtcblx0XHRcdFx0XHRcdCdwb3MxJzogJ3ZhbHVlMScsXG5cdFx0XHRcdFx0XHQnL1ZTQ29kZS93b3Jrc3BhY2VMb2NhdGlvbi90ZXN0MSc6ICcvVlNDb2RlL3dvcmtzcGFjZUxvY2F0aW9uL3Rlc3QyJyxcblx0XHRcdFx0XHRcdCdwb3MzJzogJ3ZhbHVlMydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMCwgbW9ja0NvbW1hbmRTZXJ2aWNlLmNhbGxDb3VudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGVkIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHN0dWIocXVpY2tJbnB1dFNlcnZpY2UsICdpbnB1dCcpLnJlc29sdmVzKHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0ge1xuXHRcdFx0J25hbWUnOiAnQXR0YWNoIHRvIFByb2Nlc3MnLFxuXHRcdFx0J3R5cGUnOiAnbm9kZScsXG5cdFx0XHQncmVxdWVzdCc6ICdhdHRhY2gnLFxuXHRcdFx0J3Byb2Nlc3NJZCc6ICcke2lucHV0OmlucHV0MX0nLFxuXHRcdFx0J3BvcnQnOiA1ODU4LFxuXHRcdFx0J3NvdXJjZU1hcHMnOiBmYWxzZSxcblx0XHRcdCdvdXREaXInOiBudWxsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UhLnJlc29sdmVXaXRoSW50ZXJhY3Rpb25SZXBsYWNlKHdvcmtzcGFjZSwgY29uZmlndXJhdGlvbiwgJ3Rhc2tzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcblxuXG5jbGFzcyBNb2NrQ29tbWFuZFNlcnZpY2UgaW1wbGVtZW50cyBJQ29tbWFuZFNlcnZpY2Uge1xuXG5cdHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHB1YmxpYyBjYWxsQ291bnQgPSAwO1xuXG5cdG9uV2lsbEV4ZWN1dGVDb21tYW5kID0gKCkgPT4gRGlzcG9zYWJsZS5Ob25lO1xuXHRvbkRpZEV4ZWN1dGVDb21tYW5kID0gKCkgPT4gRGlzcG9zYWJsZS5Ob25lO1xuXHRwdWJsaWMgZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkOiBzdHJpbmcsIC4uLmFyZ3M6IGFueVtdKTogUHJvbWlzZTxhbnk+IHtcblx0XHR0aGlzLmNhbGxDb3VudCsrO1xuXG5cdFx0bGV0IHJlc3VsdCA9IGAke2NvbW1hbmRJZH0tcmVzdWx0YDtcblx0XHRpZiAoYXJncy5sZW5ndGggPj0gMSkge1xuXHRcdFx0aWYgKGFyZ3NbMF0gJiYgYXJnc1swXS52YWx1ZSkge1xuXHRcdFx0XHRyZXN1bHQgPSBhcmdzWzBdLnZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcblx0fVxufVxuXG5jbGFzcyBNb2NrTGFiZWxTZXJ2aWNlIGltcGxlbWVudHMgSUxhYmVsU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0Z2V0VXJpTGFiZWwocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IHsgcmVsYXRpdmU/OiBib29sZWFuIHwgdW5kZWZpbmVkOyBub1ByZWZpeD86IGJvb2xlYW4gfCB1bmRlZmluZWQgfSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG5vcm1hbGl6ZShyZXNvdXJjZS5mc1BhdGgpO1xuXHR9XG5cdGdldFVyaUJhc2VuYW1lTGFiZWwocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGdldFdvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZTogVVJJIHwgSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJV29ya3NwYWNlLCBvcHRpb25zPzogeyB2ZXJib3NlOiBWZXJib3NpdHkgfSk6IHN0cmluZyB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGdldEhvc3RMYWJlbChzY2hlbWU6IHN0cmluZywgYXV0aG9yaXR5Pzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0cHVibGljIGdldEhvc3RUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGdldFNlcGFyYXRvcihzY2hlbWU6IHN0cmluZywgYXV0aG9yaXR5Pzogc3RyaW5nKTogJy8nIHwgJ1xcXFwnIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0cmVnaXN0ZXJGb3JtYXR0ZXIoZm9ybWF0dGVyOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRyZWdpc3RlckNhY2hlZEZvcm1hdHRlcihmb3JtYXR0ZXI6IFJlc291cmNlTGFiZWxGb3JtYXR0ZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9ybWF0dGVyczogRXZlbnQ8SUZvcm1hdHRlckNoYW5nZUV2ZW50PiA9IG5ldyBFbWl0dGVyPElGb3JtYXR0ZXJDaGFuZ2VFdmVudD4oKS5ldmVudDtcbn1cblxuY2xhc3MgTW9ja1BhdGhTZXJ2aWNlIGltcGxlbWVudHMgSVBhdGhTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRnZXQgcGF0aCgpOiBQcm9taXNlPElQYXRoPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdQcm9wZXJ0eSBub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXHRkZWZhdWx0VXJpU2NoZW1lOiBzdHJpbmcgPSBTY2hlbWFzLmZpbGU7XG5cdGZpbGVVUkkocGF0aDogc3RyaW5nKTogUHJvbWlzZTxVUkk+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0dXNlckhvbWUob3B0aW9ucz86IHsgcHJlZmVyTG9jYWw6IGJvb2xlYW4gfSk6IFByb21pc2U8VVJJPjtcblx0dXNlckhvbWUob3B0aW9uczogeyBwcmVmZXJMb2NhbDogdHJ1ZSB9KTogVVJJO1xuXHR1c2VySG9tZShvcHRpb25zPzogeyBwcmVmZXJMb2NhbDogYm9vbGVhbiB9KTogUHJvbWlzZTxVUkk+IHwgVVJJIHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnYzpcXFxcdXNlcnNcXFxcdXNlcm5hbWUnKTtcblx0XHRyZXR1cm4gb3B0aW9ucz8ucHJlZmVyTG9jYWwgPyB1cmkgOiBQcm9taXNlLnJlc29sdmUodXJpKTtcblx0fVxuXHRoYXNWYWxpZEJhc2VuYW1lKHJlc291cmNlOiBVUkksIGJhc2VuYW1lPzogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPjtcblx0aGFzVmFsaWRCYXNlbmFtZShyZXNvdXJjZTogVVJJLCBvczogcGxhdGZvcm0uT3BlcmF0aW5nU3lzdGVtLCBiYXNlbmFtZT86IHN0cmluZyk6IGJvb2xlYW47XG5cdGhhc1ZhbGlkQmFzZW5hbWUocmVzb3VyY2U6IFVSSSwgYXJnMj86IHN0cmluZyB8IHBsYXRmb3JtLk9wZXJhdGluZ1N5c3RlbSwgbmFtZT86IHN0cmluZyk6IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0cmVzb2x2ZWRVc2VySG9tZTogVVJJIHwgdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBNb2NrSW5wdXRzQ29uZmlndXJhdGlvblNlcnZpY2UgZXh0ZW5kcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0VmFsdWUoYXJnMT86IGFueSwgYXJnMj86IGFueSk6IGFueSB7XG5cdFx0bGV0IGNvbmZpZ3VyYXRpb247XG5cdFx0aWYgKGFyZzEgPT09ICd0YXNrcycpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdGlucHV0czogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlkOiAnaW5wdXQxJyxcblx0XHRcdFx0XHRcdHR5cGU6ICdwcm9tcHRTdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdFbnRlcmlucHV0MScsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnZGVmYXVsdCBpbnB1dDEnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZDogJ2lucHV0MicsXG5cdFx0XHRcdFx0XHR0eXBlOiAncGlja1N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0VudGVyaW5wdXQxJyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdvcHRpb24yJyxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IFsnb3B0aW9uMScsICdvcHRpb24yJywgJ29wdGlvbjMnXVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6ICdpbnB1dDMnLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3Byb21wdFN0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0VudGVyaW5wdXQzJyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0IGlucHV0MycsXG5cdFx0XHRcdFx0XHRwcm92aWRlOiB0cnVlLFxuXHRcdFx0XHRcdFx0cGFzc3dvcmQ6IHRydWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlkOiAnaW5wdXQ0Jyxcblx0XHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6ICdjb21tYW5kMScsXG5cdFx0XHRcdFx0XHRhcmdzOiB7XG5cdFx0XHRcdFx0XHRcdHZhbHVlOiAnYXJnIGZvciBjb21tYW5kJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgaW5zcGVjdDxUPihrZXk6IHN0cmluZywgb3ZlcnJpZGVzPzogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBJQ29uZmlndXJhdGlvblZhbHVlPFQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdGRlZmF1bHRWYWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0dXNlclZhbHVlOiB1bmRlZmluZWQsXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXJzOiBbXVxuXHRcdH07XG5cdH1cbn1cblxuc3VpdGUoJ0NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24nLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3BhcnNlIGVtcHR5IG9iamVjdCcsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZSh7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEFycmF5LmZyb20oZXhwci51bnJlc29sdmVkKCkpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHByLnRvT2JqZWN0KCksIHt9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2Ugc2ltcGxlIHN0cmluZycsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZSh7IHZhbHVlOiAnJHtlbnY6SE9NRX0nIH0pO1xuXHRcdGNvbnN0IHVucmVzb2x2ZWQgPSBBcnJheS5mcm9tKGV4cHIudW5yZXNvbHZlZCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5yZXNvbHZlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnJlc29sdmVkWzBdLm5hbWUsICdlbnYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5yZXNvbHZlZFswXS5hcmcsICdIT01FJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlIHN0cmluZyB3aXRoIGFyZ3VtZW50IGFuZCBjb2xvbicsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZSh7IHZhbHVlOiAnJHtjb25maWc6cGF0aDp0bzp2YWx1ZX0nIH0pO1xuXHRcdGNvbnN0IHVucmVzb2x2ZWQgPSBBcnJheS5mcm9tKGV4cHIudW5yZXNvbHZlZCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5yZXNvbHZlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnJlc29sdmVkWzBdLm5hbWUsICdjb25maWcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5yZXNvbHZlZFswXS5hcmcsICdwYXRoOnRvOnZhbHVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlIG9iamVjdCB3aXRoIG5lc3RlZCB2YXJpYWJsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2Uoe1xuXHRcdFx0bmFtZTogJyR7ZW52OlVTRVJOQU1FfScsXG5cdFx0XHRwYXRoOiAnJHtlbnY6SE9NRX0vZm9sZGVyJyxcblx0XHRcdHNldHRpbmdzOiB7XG5cdFx0XHRcdHZhbHVlOiAnJHtjb25maWc6cGF0aH0nXG5cdFx0XHR9LFxuXHRcdFx0YXJyYXk6IFsnJHtlbnY6VEVSTX0nLCB7IGtleTogJyR7ZW52OktFWX0nIH1dXG5cdFx0fSk7XG5cblx0XHRjb25zdCB1bnJlc29sdmVkID0gQXJyYXkuZnJvbShleHByLnVucmVzb2x2ZWQoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVucmVzb2x2ZWQubGVuZ3RoLCA1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVucmVzb2x2ZWQubWFwKHIgPT4gci5uYW1lKS5zb3J0KCksIFsnY29uZmlnJywgJ2VudicsICdlbnYnLCAnZW52JywgJ2VudiddKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSBhbmQgZ2V0IHJlc3VsdCcsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZSh7XG5cdFx0XHRuYW1lOiAnJHtlbnY6VVNFUk5BTUV9Jyxcblx0XHRcdHBhdGg6ICcke2VudjpIT01FfS9mb2xkZXInXG5cdFx0fSk7XG5cblx0XHRleHByLnJlc29sdmUoeyBpbm5lcjogJ2VudjpVU0VSTkFNRScsIGlkOiAnJHtlbnY6VVNFUk5BTUV9JywgbmFtZTogJ2VudicsIGFyZzogJ1VTRVJOQU1FJyB9LCAndGVzdHVzZXInKTtcblx0XHRleHByLnJlc29sdmUoeyBpbm5lcjogJ2VudjpIT01FJywgaWQ6ICcke2VudjpIT01FfScsIG5hbWU6ICdlbnYnLCBhcmc6ICdIT01FJyB9LCAnL2hvbWUvdGVzdHVzZXInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwci50b09iamVjdCgpLCB7XG5cdFx0XHRuYW1lOiAndGVzdHVzZXInLFxuXHRcdFx0cGF0aDogJy9ob21lL3Rlc3R1c2VyL2ZvbGRlcidcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdW5yZXNvbHZlZCB2YXJpYWJsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2Uoe1xuXHRcdFx0bmFtZTogJyR7ZW52OlVTRVJOQU1FfSdcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwci50b09iamVjdCgpLCB7XG5cdFx0XHRuYW1lOiAnJHtlbnY6VVNFUk5BTUV9J1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWR1cGxpY2F0ZXMgaWRlbnRpY2FsIHZhcmlhYmxlcycsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZSh7XG5cdFx0XHRmaXJzdDogJyR7ZW52OkhPTUV9Jyxcblx0XHRcdHNlY29uZDogJyR7ZW52OkhPTUV9J1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdW5yZXNvbHZlZCA9IEFycmF5LmZyb20oZXhwci51bnJlc29sdmVkKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnJlc29sdmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVucmVzb2x2ZWRbMF0ubmFtZSwgJ2VudicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnJlc29sdmVkWzBdLmFyZywgJ0hPTUUnKTtcblxuXHRcdGV4cHIucmVzb2x2ZSh1bnJlc29sdmVkWzBdLCAnL2hvbWUvdXNlcicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwci50b09iamVjdCgpLCB7XG5cdFx0XHRmaXJzdDogJy9ob21lL3VzZXInLFxuXHRcdFx0c2Vjb25kOiAnL2hvbWUvdXNlcidcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyByb290IHN0cmluZyB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZSgnYWJjICR7ZW52OkhPTUV9IHh5eicpO1xuXHRcdGNvbnN0IHVucmVzb2x2ZWQgPSBBcnJheS5mcm9tKGV4cHIudW5yZXNvbHZlZCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5yZXNvbHZlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnJlc29sdmVkWzBdLm5hbWUsICdlbnYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5yZXNvbHZlZFswXS5hcmcsICdIT01FJyk7XG5cblx0XHRleHByLnJlc29sdmUodW5yZXNvbHZlZFswXSwgJy9ob21lL3VzZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwci50b09iamVjdCgpLCAnYWJjIC9ob21lL3VzZXIgeHl6Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgcm9vdCBzdHJpbmcgdmFsdWUgd2l0aCBtdWx0aXBsZSB2YXJpYWJsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2UoJyR7ZW52OkhPTUV9L2ZvbGRlciR7ZW52OlNIRUxMfScpO1xuXHRcdGNvbnN0IHVucmVzb2x2ZWQgPSBBcnJheS5mcm9tKGV4cHIudW5yZXNvbHZlZCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5yZXNvbHZlZC5sZW5ndGgsIDIpO1xuXG5cdFx0ZXhwci5yZXNvbHZlKHsgaWQ6ICcke2VudjpIT01FfScsIGlubmVyOiAnZW52OkhPTUUnLCBuYW1lOiAnZW52JywgYXJnOiAnSE9NRScgfSwgJy9ob21lL3VzZXInKTtcblx0XHRleHByLnJlc29sdmUoeyBpZDogJyR7ZW52OlNIRUxMfScsIGlubmVyOiAnZW52OlNIRUxMJywgbmFtZTogJ2VudicsIGFyZzogJ1NIRUxMJyB9LCAnL2Jpbi9iYXNoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cHIudG9PYmplY3QoKSwgJy9ob21lL3VzZXIvZm9sZGVyL2Jpbi9iYXNoJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgcm9vdCBzdHJpbmcgd2l0aCBlc2NhcGVkIHZhcmlhYmxlcycsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZSgnYWJjICR7ZW52OkhPTUUke2VudjpVU0VSfX0geHl6Jyk7XG5cdFx0Y29uc3QgdW5yZXNvbHZlZCA9IEFycmF5LmZyb20oZXhwci51bnJlc29sdmVkKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnJlc29sdmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVucmVzb2x2ZWRbMF0ubmFtZSwgJ2VudicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnJlc29sdmVkWzBdLmFyZywgJ0hPTUUke2VudjpVU0VSfScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBuZXN0ZWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKHtcblx0XHRcdG5hbWU6ICcke2VudjpSRURJUkVDVEVEfScsXG5cdFx0XHQna2V5IHRoYXQgaXMgJHtlbnY6UkVESVJFQ1RFRH0nOiAnY29vbCEnLFxuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCByIG9mIGV4cHIudW5yZXNvbHZlZCgpKSB7XG5cdFx0XHRpZiAoci5hcmcgPT09ICdSRURJUkVDVEVEJykge1xuXHRcdFx0XHRleHByLnJlc29sdmUociwgJ3VzZXJuYW1lOiAke2VudjpVU0VSTkFNRX0nKTtcblx0XHRcdH0gZWxzZSBpZiAoci5hcmcgPT09ICdVU0VSTkFNRScpIHtcblx0XHRcdFx0ZXhwci5yZXNvbHZlKHIsICd0ZXN0dXNlcicpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwci50b09iamVjdCgpLCB7XG5cdFx0XHRuYW1lOiAndXNlcm5hbWU6IHRlc3R1c2VyJyxcblx0XHRcdCdrZXkgdGhhdCBpcyB1c2VybmFtZTogdGVzdHVzZXInOiAnY29vbCEnXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIG5lc3RlZCB2YWx1ZXMgMiAoIzI0NTc5OCknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2Uoe1xuXHRcdFx0ZW52OiB7XG5cdFx0XHRcdFNJVEU6ICcke2lucHV0OnNpdGV9Jyxcblx0XHRcdFx0VExEOiAnJHtpbnB1dDp0bGR9Jyxcblx0XHRcdFx0SE9TVDogJyR7aW5wdXQ6aG9zdH0nLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3QgciBvZiBleHByLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0aWYgKHIuYXJnID09PSAnc2l0ZScpIHtcblx0XHRcdFx0ZXhwci5yZXNvbHZlKHIsICdleGFtcGxlJyk7XG5cdFx0XHR9IGVsc2UgaWYgKHIuYXJnID09PSAndGxkJykge1xuXHRcdFx0XHRleHByLnJlc29sdmUociwgJ2NvbScpO1xuXHRcdFx0fSBlbHNlIGlmIChyLmFyZyA9PT0gJ2hvc3QnKSB7XG5cdFx0XHRcdGV4cHIucmVzb2x2ZShyLCAnbG9jYWwuJHtpbnB1dDpzaXRlfS4ke2lucHV0OnRsZH0nKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4cHIudG9PYmplY3QoKSwge1xuXHRcdFx0ZW52OiB7XG5cdFx0XHRcdFNJVEU6ICdleGFtcGxlJyxcblx0XHRcdFx0VExEOiAnY29tJyxcblx0XHRcdFx0SE9TVDogJ2xvY2FsLmV4YW1wbGUuY29tJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvdXQtb2Ytb3JkZXIga2V5IHJlc29sdXRpb24gKCMyNDg1NTApJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4cHIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLnBhcnNlKHtcblx0XHRcdCcke2lucHV0OmtleX0nOiAnJHtpbnB1dDp2YWx1ZX0nLFxuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCByIG9mIGV4cHIudW5yZXNvbHZlZCgpKSB7XG5cdFx0XHRpZiAoci5hcmcgPT09ICdrZXknKSB7XG5cdFx0XHRcdGV4cHIucmVzb2x2ZShyLCAndGhlLWtleScpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHIgb2YgZXhwci51bnJlc29sdmVkKCkpIHtcblx0XHRcdGlmIChyLmFyZyA9PT0gJ3ZhbHVlJykge1xuXHRcdFx0XHRleHByLnJlc29sdmUociwgJ3RoZS12YWx1ZScpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwci50b09iamVjdCgpLCB7XG5cdFx0XHQndGhlLWtleSc6ICd0aGUtdmFsdWUnXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQWdCLGlCQUFpQjtBQUNqQyxZQUFZLGNBQWM7QUFDMUIsU0FBUyxTQUFTLGFBQWEsaUJBQWlCO0FBQ2hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGtCQUFrQjtBQUczQixTQUFTLGdDQUFnQztBQUl6QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQiw2QkFBNkI7QUFDekQsU0FBUyxvQkFBb0Isc0JBQXNCLDBCQUEwQjtBQUc3RSxTQUFTLHdDQUF3QztBQUVqRCxTQUFTLHVDQUF1QztBQUVoRCxNQUFNLGlCQUFpQjtBQUN2QixNQUFNLDBDQUEwQyxrQkFBa0I7QUFBQSxFQUNqRSxJQUFhLDBCQUErQjtBQUMzQyxXQUFPO0FBQUEsTUFDTixnQkFBZ0I7QUFDZixlQUFPLFdBQVc7QUFBQSxNQUNuQjtBQUFBLE1BQ0EsZUFBZTtBQUNkLGVBQU8sSUFBSSxVQUFVLGdCQUFnQixHQUFHLGdCQUFnQixFQUFFO0FBQUEsTUFDM0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBQ0EsSUFBYSxlQUFvQjtBQUNoQyxXQUFPO0FBQUEsTUFDTixJQUFJLFdBQWdCO0FBQ25CLGVBQU8sSUFBSSxNQUFNLHVDQUF1QztBQUFBLE1BQ3pEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0seUNBQXlDLGlDQUFpQztBQUVoRjtBQUVBLE1BQU0sY0FB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
