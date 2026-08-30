import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostWorkspace } from "../../common/extHostWorkspace.js";
import { ExtHostConfigProvider } from "../../common/extHostConfiguration.js";
import { ConfigurationModel, ConfigurationModelParser } from "../../../../platform/configuration/common/configurationModels.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { mock } from "../../../../base/test/common/mock.js";
import { WorkspaceFolder } from "../../../../platform/workspace/common/workspace.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { FileSystemProviderCapabilities } from "../../../../platform/files/common/files.js";
import { isLinux } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostConfiguration", function() {
  class RecordingShape extends mock() {
    $updateConfigurationOption(target, key, value) {
      this.lastArgs = [target, key, value];
      return Promise.resolve(void 0);
    }
  }
  function createExtHostWorkspace() {
    return new ExtHostWorkspace(new TestRPCProtocol(), new class extends mock() {
    }(), new class extends mock() {
      getCapabilities() {
        return isLinux ? FileSystemProviderCapabilities.PathCaseSensitive : void 0;
      }
    }(), new NullLogService(), new class extends mock() {
    }());
  }
  function createExtHostConfiguration(contents = /* @__PURE__ */ Object.create(null), shape) {
    if (!shape) {
      shape = new class extends mock() {
      }();
    }
    return new ExtHostConfigProvider(shape, createExtHostWorkspace(), createConfigurationData(contents), new NullLogService());
  }
  function createConfigurationData(contents) {
    return {
      defaults: new ConfigurationModel(contents, [], [], void 0, new NullLogService()),
      policy: ConfigurationModel.createEmptyModel(new NullLogService()),
      application: ConfigurationModel.createEmptyModel(new NullLogService()),
      userLocal: new ConfigurationModel(contents, [], [], void 0, new NullLogService()),
      userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
      workspace: ConfigurationModel.createEmptyModel(new NullLogService()),
      folders: [],
      configurationScopes: []
    };
  }
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("getConfiguration fails regression test 1.7.1 -> 1.8 #15552", function() {
    const extHostConfig = createExtHostConfiguration({
      "search": {
        "exclude": {
          "**/node_modules": true
        }
      }
    });
    assert.strictEqual(extHostConfig.getConfiguration("search.exclude")["**/node_modules"], true);
    assert.strictEqual(extHostConfig.getConfiguration("search.exclude").get("**/node_modules"), true);
    assert.strictEqual(extHostConfig.getConfiguration("search").get("exclude")["**/node_modules"], true);
    assert.strictEqual(extHostConfig.getConfiguration("search.exclude").has("**/node_modules"), true);
    assert.strictEqual(extHostConfig.getConfiguration("search").has("exclude.**/node_modules"), true);
  });
  test("has/get", () => {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "nested": {
          "config1": 42,
          "config2": "Das Pferd frisst kein Reis."
        },
        "config4": ""
      }
    });
    const config = all.getConfiguration("farboo");
    assert.ok(config.has("config0"));
    assert.strictEqual(config.get("config0"), true);
    assert.strictEqual(config.get("config4"), "");
    assert.strictEqual(config["config0"], true);
    assert.strictEqual(config["config4"], "");
    assert.ok(config.has("nested.config1"));
    assert.strictEqual(config.get("nested.config1"), 42);
    assert.ok(config.has("nested.config2"));
    assert.strictEqual(config.get("nested.config2"), "Das Pferd frisst kein Reis.");
    assert.ok(config.has("nested"));
    assert.deepStrictEqual(config.get("nested"), { config1: 42, config2: "Das Pferd frisst kein Reis." });
  });
  test("get nested config", () => {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "nested": {
          "config1": 42,
          "config2": "Das Pferd frisst kein Reis."
        },
        "config4": ""
      }
    });
    assert.deepStrictEqual(all.getConfiguration("farboo.nested").get("config1"), 42);
    assert.deepStrictEqual(all.getConfiguration("farboo.nested").get("config2"), "Das Pferd frisst kein Reis.");
    assert.deepStrictEqual(all.getConfiguration("farboo.nested")["config1"], 42);
    assert.deepStrictEqual(all.getConfiguration("farboo.nested")["config2"], "Das Pferd frisst kein Reis.");
    assert.deepStrictEqual(all.getConfiguration("farboo.nested1").get("config1"), void 0);
    assert.deepStrictEqual(all.getConfiguration("farboo.nested1").get("config2"), void 0);
    assert.deepStrictEqual(all.getConfiguration("farboo.config0.config1").get("a"), void 0);
    assert.deepStrictEqual(all.getConfiguration("farboo.config0.config1")["a"], void 0);
  });
  test("can modify the returned configuration", function() {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "nested": {
          "config1": 42,
          "config2": "Das Pferd frisst kein Reis."
        },
        "config4": ""
      },
      "workbench": {
        "colorCustomizations": {
          "statusBar.foreground": "somevalue"
        }
      }
    });
    let testObject = all.getConfiguration();
    let actual = testObject.get("farboo");
    actual["nested"]["config1"] = 41;
    assert.strictEqual(41, actual["nested"]["config1"]);
    actual["farboo1"] = "newValue";
    assert.strictEqual("newValue", actual["farboo1"]);
    testObject = all.getConfiguration();
    actual = testObject.get("farboo");
    assert.strictEqual(actual["nested"]["config1"], 42);
    assert.strictEqual(actual["farboo1"], void 0);
    testObject = all.getConfiguration();
    actual = testObject.get("farboo");
    assert.strictEqual(actual["config0"], true);
    actual["config0"] = false;
    assert.strictEqual(actual["config0"], false);
    testObject = all.getConfiguration();
    actual = testObject.get("farboo");
    assert.strictEqual(actual["config0"], true);
    testObject = all.getConfiguration();
    actual = testObject.inspect("farboo");
    actual["value"] = "effectiveValue";
    assert.strictEqual("effectiveValue", actual["value"]);
    testObject = all.getConfiguration("workbench");
    actual = testObject.get("colorCustomizations");
    actual["statusBar.foreground"] = void 0;
    assert.strictEqual(actual["statusBar.foreground"], void 0);
    testObject = all.getConfiguration("workbench");
    actual = testObject.get("colorCustomizations");
    assert.strictEqual(actual["statusBar.foreground"], "somevalue");
  });
  test("Stringify returned configuration", function() {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "nested": {
          "config1": 42,
          "config2": "Das Pferd frisst kein Reis."
        },
        "config4": ""
      },
      "workbench": {
        "colorCustomizations": {
          "statusBar.foreground": "somevalue"
        },
        "emptyobjectkey": {}
      }
    });
    const testObject = all.getConfiguration();
    let actual = testObject.get("farboo");
    assert.deepStrictEqual(JSON.stringify({
      "config0": true,
      "nested": {
        "config1": 42,
        "config2": "Das Pferd frisst kein Reis."
      },
      "config4": ""
    }), JSON.stringify(actual));
    assert.deepStrictEqual(void 0, JSON.stringify(testObject.get("unknownkey")));
    actual = testObject.get("farboo");
    actual["config0"] = false;
    assert.deepStrictEqual(JSON.stringify({
      "config0": false,
      "nested": {
        "config1": 42,
        "config2": "Das Pferd frisst kein Reis."
      },
      "config4": ""
    }), JSON.stringify(actual));
    actual = testObject.get("workbench")["colorCustomizations"];
    actual["statusBar.background"] = "anothervalue";
    assert.deepStrictEqual(JSON.stringify({
      "statusBar.foreground": "somevalue",
      "statusBar.background": "anothervalue"
    }), JSON.stringify(actual));
    actual = testObject.get("workbench");
    actual["unknownkey"] = "somevalue";
    assert.deepStrictEqual(JSON.stringify({
      "colorCustomizations": {
        "statusBar.foreground": "somevalue"
      },
      "emptyobjectkey": {},
      "unknownkey": "somevalue"
    }), JSON.stringify(actual));
    actual = all.getConfiguration("workbench").get("emptyobjectkey");
    actual = {
      ...actual || {},
      "statusBar.background": `#0ff`,
      "statusBar.foreground": `#ff0`
    };
    assert.deepStrictEqual(JSON.stringify({
      "statusBar.background": `#0ff`,
      "statusBar.foreground": `#ff0`
    }), JSON.stringify(actual));
    actual = all.getConfiguration("workbench").get("unknownkey");
    actual = {
      ...actual || {},
      "statusBar.background": `#0ff`,
      "statusBar.foreground": `#ff0`
    };
    assert.deepStrictEqual(JSON.stringify({
      "statusBar.background": `#0ff`,
      "statusBar.foreground": `#ff0`
    }), JSON.stringify(actual));
  });
  test("cannot modify returned configuration", function() {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "nested": {
          "config1": 42,
          "config2": "Das Pferd frisst kein Reis."
        },
        "config4": ""
      }
    });
    const testObject = all.getConfiguration();
    try {
      testObject["get"] = null;
      assert.fail("This should be readonly");
    } catch (e) {
    }
    try {
      testObject["farboo"]["config0"] = false;
      assert.fail("This should be readonly");
    } catch (e) {
    }
    try {
      testObject["farboo"]["farboo1"] = "hello";
      assert.fail("This should be readonly");
    } catch (e) {
    }
  });
  test("inspect in no workspace context", function() {
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      createExtHostWorkspace(),
      {
        defaults: new ConfigurationModel({
          "editor": {
            "wordWrap": "off",
            "lineNumbers": "on",
            "fontSize": "12px"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        policy: ConfigurationModel.createEmptyModel(new NullLogService()),
        application: ConfigurationModel.createEmptyModel(new NullLogService()),
        userLocal: new ConfigurationModel({
          "editor": {
            "wordWrap": "on",
            "lineNumbers": "off"
          }
        }, ["editor.wordWrap", "editor.lineNumbers"], [], void 0, new NullLogService()),
        userRemote: new ConfigurationModel({
          "editor": {
            "lineNumbers": "relative"
          }
        }, ["editor.lineNumbers"], [], {
          "editor": {
            "lineNumbers": "relative",
            "fontSize": "14px"
          }
        }, new NullLogService()),
        workspace: new ConfigurationModel({}, [], [], void 0, new NullLogService()),
        folders: [],
        configurationScopes: []
      },
      new NullLogService()
    );
    let actual = testObject.getConfiguration().inspect("editor.wordWrap");
    assert.strictEqual(actual.defaultValue, "off");
    assert.strictEqual(actual.globalLocalValue, "on");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.globalValue, "on");
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    actual = testObject.getConfiguration("editor").inspect("wordWrap");
    assert.strictEqual(actual.defaultValue, "off");
    assert.strictEqual(actual.globalLocalValue, "on");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.globalValue, "on");
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    actual = testObject.getConfiguration("editor").inspect("lineNumbers");
    assert.strictEqual(actual.defaultValue, "on");
    assert.strictEqual(actual.globalLocalValue, "off");
    assert.strictEqual(actual.globalRemoteValue, "relative");
    assert.strictEqual(actual.globalValue, "relative");
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    assert.strictEqual(testObject.getConfiguration("editor").get("fontSize"), "12px");
    actual = testObject.getConfiguration("editor").inspect("fontSize");
    assert.strictEqual(actual.defaultValue, "12px");
    assert.strictEqual(actual.globalLocalValue, void 0);
    assert.strictEqual(actual.globalRemoteValue, "14px");
    assert.strictEqual(actual.globalValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
  });
  test("inspect in single root context", function() {
    const workspaceUri = URI.file("foo");
    const folders = [];
    const workspace = new ConfigurationModel({
      "editor": {
        "wordWrap": "bounded"
      }
    }, ["editor.wordWrap"], [], void 0, new NullLogService());
    folders.push([workspaceUri, workspace]);
    const extHostWorkspace = createExtHostWorkspace();
    extHostWorkspace.$initializeWorkspace({
      "id": "foo",
      "folders": [aWorkspaceFolder(URI.file("foo"), 0)],
      "name": "foo"
    }, true);
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      extHostWorkspace,
      {
        defaults: new ConfigurationModel({
          "editor": {
            "wordWrap": "off"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        policy: ConfigurationModel.createEmptyModel(new NullLogService()),
        application: ConfigurationModel.createEmptyModel(new NullLogService()),
        userLocal: new ConfigurationModel({
          "editor": {
            "wordWrap": "on"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
        workspace,
        folders,
        configurationScopes: []
      },
      new NullLogService()
    );
    let actual1 = testObject.getConfiguration().inspect("editor.wordWrap");
    assert.strictEqual(actual1.defaultValue, "off");
    assert.strictEqual(actual1.globalLocalValue, "on");
    assert.strictEqual(actual1.globalRemoteValue, void 0);
    assert.strictEqual(actual1.globalValue, "on");
    assert.strictEqual(actual1.workspaceValue, "bounded");
    assert.strictEqual(actual1.workspaceFolderValue, void 0);
    actual1 = testObject.getConfiguration("editor").inspect("wordWrap");
    assert.strictEqual(actual1.defaultValue, "off");
    assert.strictEqual(actual1.globalLocalValue, "on");
    assert.strictEqual(actual1.globalRemoteValue, void 0);
    assert.strictEqual(actual1.globalValue, "on");
    assert.strictEqual(actual1.workspaceValue, "bounded");
    assert.strictEqual(actual1.workspaceFolderValue, void 0);
    let actual2 = testObject.getConfiguration(void 0, workspaceUri).inspect("editor.wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "bounded");
    actual2 = testObject.getConfiguration("editor", workspaceUri).inspect("wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "bounded");
  });
  test("inspect in multi root context", function() {
    const workspace = new ConfigurationModel({
      "editor": {
        "wordWrap": "bounded"
      }
    }, ["editor.wordWrap"], [], void 0, new NullLogService());
    const firstRoot = URI.file("foo1");
    const secondRoot = URI.file("foo2");
    const thirdRoot = URI.file("foo3");
    const folders = [];
    folders.push([firstRoot, new ConfigurationModel({
      "editor": {
        "wordWrap": "off",
        "lineNumbers": "relative"
      }
    }, ["editor.wordWrap"], [], void 0, new NullLogService())]);
    folders.push([secondRoot, new ConfigurationModel({
      "editor": {
        "wordWrap": "on"
      }
    }, ["editor.wordWrap"], [], void 0, new NullLogService())]);
    folders.push([thirdRoot, new ConfigurationModel({}, [], [], void 0, new NullLogService())]);
    const extHostWorkspace = createExtHostWorkspace();
    extHostWorkspace.$initializeWorkspace({
      "id": "foo",
      "folders": [aWorkspaceFolder(firstRoot, 0), aWorkspaceFolder(secondRoot, 1)],
      "name": "foo"
    }, true);
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      extHostWorkspace,
      {
        defaults: new ConfigurationModel({
          "editor": {
            "wordWrap": "off",
            "lineNumbers": "on"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        policy: ConfigurationModel.createEmptyModel(new NullLogService()),
        application: ConfigurationModel.createEmptyModel(new NullLogService()),
        userLocal: new ConfigurationModel({
          "editor": {
            "wordWrap": "on"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
        workspace,
        folders,
        configurationScopes: []
      },
      new NullLogService()
    );
    let actual1 = testObject.getConfiguration().inspect("editor.wordWrap");
    assert.strictEqual(actual1.defaultValue, "off");
    assert.strictEqual(actual1.globalValue, "on");
    assert.strictEqual(actual1.globalLocalValue, "on");
    assert.strictEqual(actual1.globalRemoteValue, void 0);
    assert.strictEqual(actual1.workspaceValue, "bounded");
    assert.strictEqual(actual1.workspaceFolderValue, void 0);
    actual1 = testObject.getConfiguration("editor").inspect("wordWrap");
    assert.strictEqual(actual1.defaultValue, "off");
    assert.strictEqual(actual1.globalValue, "on");
    assert.strictEqual(actual1.globalLocalValue, "on");
    assert.strictEqual(actual1.globalRemoteValue, void 0);
    assert.strictEqual(actual1.workspaceValue, "bounded");
    assert.strictEqual(actual1.workspaceFolderValue, void 0);
    actual1 = testObject.getConfiguration("editor").inspect("lineNumbers");
    assert.strictEqual(actual1.defaultValue, "on");
    assert.strictEqual(actual1.globalValue, void 0);
    assert.strictEqual(actual1.globalLocalValue, void 0);
    assert.strictEqual(actual1.globalRemoteValue, void 0);
    assert.strictEqual(actual1.workspaceValue, void 0);
    assert.strictEqual(actual1.workspaceFolderValue, void 0);
    let actual2 = testObject.getConfiguration(void 0, firstRoot).inspect("editor.wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "off");
    actual2 = testObject.getConfiguration("editor", firstRoot).inspect("wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "off");
    actual2 = testObject.getConfiguration("editor", firstRoot).inspect("lineNumbers");
    assert.strictEqual(actual2.defaultValue, "on");
    assert.strictEqual(actual2.globalValue, void 0);
    assert.strictEqual(actual2.globalLocalValue, void 0);
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, void 0);
    assert.strictEqual(actual2.workspaceFolderValue, "relative");
    actual2 = testObject.getConfiguration(void 0, secondRoot).inspect("editor.wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "on");
    actual2 = testObject.getConfiguration("editor", secondRoot).inspect("wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "on");
    actual2 = testObject.getConfiguration(void 0, thirdRoot).inspect("editor.wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.ok(Object.keys(actual2).indexOf("workspaceFolderValue") !== -1);
    assert.strictEqual(actual2.workspaceFolderValue, void 0);
    actual2 = testObject.getConfiguration("editor", thirdRoot).inspect("wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.ok(Object.keys(actual2).indexOf("workspaceFolderValue") !== -1);
    assert.strictEqual(actual2.workspaceFolderValue, void 0);
  });
  test("inspect with language overrides", function() {
    const firstRoot = URI.file("foo1");
    const secondRoot = URI.file("foo2");
    const folders = [];
    folders.push([firstRoot, toConfigurationModel({
      "editor.wordWrap": "bounded",
      "[typescript]": {
        "editor.wordWrap": "unbounded"
      }
    })]);
    folders.push([secondRoot, toConfigurationModel({})]);
    const extHostWorkspace = createExtHostWorkspace();
    extHostWorkspace.$initializeWorkspace({
      "id": "foo",
      "folders": [aWorkspaceFolder(firstRoot, 0), aWorkspaceFolder(secondRoot, 1)],
      "name": "foo"
    }, true);
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      extHostWorkspace,
      {
        defaults: toConfigurationModel({
          "editor.wordWrap": "off",
          "[markdown]": {
            "editor.wordWrap": "bounded"
          }
        }),
        policy: ConfigurationModel.createEmptyModel(new NullLogService()),
        application: ConfigurationModel.createEmptyModel(new NullLogService()),
        userLocal: toConfigurationModel({
          "editor.wordWrap": "bounded",
          "[typescript]": {
            "editor.lineNumbers": "off"
          }
        }),
        userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
        workspace: toConfigurationModel({
          "[typescript]": {
            "editor.wordWrap": "unbounded",
            "editor.lineNumbers": "off"
          }
        }),
        folders,
        configurationScopes: []
      },
      new NullLogService()
    );
    let actual = testObject.getConfiguration(void 0, { uri: firstRoot, languageId: "typescript" }).inspect("editor.wordWrap");
    assert.strictEqual(actual.defaultValue, "off");
    assert.strictEqual(actual.globalValue, "bounded");
    assert.strictEqual(actual.globalLocalValue, "bounded");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, "bounded");
    assert.strictEqual(actual.defaultLanguageValue, void 0);
    assert.strictEqual(actual.globalLanguageValue, void 0);
    assert.strictEqual(actual.workspaceLanguageValue, "unbounded");
    assert.strictEqual(actual.workspaceFolderLanguageValue, "unbounded");
    assert.deepStrictEqual(actual.languageIds, ["markdown", "typescript"]);
    actual = testObject.getConfiguration(void 0, { uri: secondRoot, languageId: "typescript" }).inspect("editor.wordWrap");
    assert.strictEqual(actual.defaultValue, "off");
    assert.strictEqual(actual.globalValue, "bounded");
    assert.strictEqual(actual.globalLocalValue, "bounded");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    assert.strictEqual(actual.defaultLanguageValue, void 0);
    assert.strictEqual(actual.globalLanguageValue, void 0);
    assert.strictEqual(actual.workspaceLanguageValue, "unbounded");
    assert.strictEqual(actual.workspaceFolderLanguageValue, void 0);
    assert.deepStrictEqual(actual.languageIds, ["markdown", "typescript"]);
  });
  test("application is not set in inspect", () => {
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      createExtHostWorkspace(),
      {
        defaults: new ConfigurationModel({
          "editor": {
            "wordWrap": "off",
            "lineNumbers": "on",
            "fontSize": "12px"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        policy: ConfigurationModel.createEmptyModel(new NullLogService()),
        application: new ConfigurationModel({
          "editor": {
            "wordWrap": "on"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        userLocal: new ConfigurationModel({
          "editor": {
            "wordWrap": "auto",
            "lineNumbers": "off"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
        workspace: new ConfigurationModel({}, [], [], void 0, new NullLogService()),
        folders: [],
        configurationScopes: []
      },
      new NullLogService()
    );
    let actual = testObject.getConfiguration().inspect("editor.wordWrap");
    assert.strictEqual(actual.defaultValue, "off");
    assert.strictEqual(actual.globalValue, "auto");
    assert.strictEqual(actual.globalLocalValue, "auto");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    assert.strictEqual(testObject.getConfiguration().get("editor.wordWrap"), "auto");
    actual = testObject.getConfiguration().inspect("editor.lineNumbers");
    assert.strictEqual(actual.defaultValue, "on");
    assert.strictEqual(actual.globalValue, "off");
    assert.strictEqual(actual.globalLocalValue, "off");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    assert.strictEqual(testObject.getConfiguration().get("editor.lineNumbers"), "off");
    actual = testObject.getConfiguration().inspect("editor.fontSize");
    assert.strictEqual(actual.defaultValue, "12px");
    assert.strictEqual(actual.globalLocalValue, void 0);
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.globalValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    assert.strictEqual(testObject.getConfiguration().get("editor.fontSize"), "12px");
  });
  test("getConfiguration vs get", function() {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "config4": 38
      }
    });
    let config = all.getConfiguration("farboo.config0");
    assert.strictEqual(config.get(""), void 0);
    assert.strictEqual(config.has(""), false);
    config = all.getConfiguration("farboo");
    assert.strictEqual(config.get("config0"), true);
    assert.strictEqual(config.has("config0"), true);
  });
  test("name vs property", function() {
    const all = createExtHostConfiguration({
      "farboo": {
        "get": "get-prop"
      }
    });
    const config = all.getConfiguration("farboo");
    assert.ok(config.has("get"));
    assert.strictEqual(config.get("get"), "get-prop");
    assert.deepStrictEqual(config["get"], config.get);
    assert.throws(() => config["get"] = "get-prop");
  });
  test("update: no target passes null", function() {
    const shape = new RecordingShape();
    const allConfig = createExtHostConfiguration({
      "foo": {
        "bar": 1,
        "far": 1
      }
    }, shape);
    const config = allConfig.getConfiguration("foo");
    config.update("bar", 42);
    assert.strictEqual(shape.lastArgs[0], null);
  });
  test("update/section to key", function() {
    const shape = new RecordingShape();
    const allConfig = createExtHostConfiguration({
      "foo": {
        "bar": 1,
        "far": 1
      }
    }, shape);
    let config = allConfig.getConfiguration("foo");
    config.update("bar", 42, true);
    assert.strictEqual(shape.lastArgs[0], ConfigurationTarget.USER);
    assert.strictEqual(shape.lastArgs[1], "foo.bar");
    assert.strictEqual(shape.lastArgs[2], 42);
    config = allConfig.getConfiguration("");
    config.update("bar", 42, true);
    assert.strictEqual(shape.lastArgs[1], "bar");
    config.update("foo.bar", 42, true);
    assert.strictEqual(shape.lastArgs[1], "foo.bar");
  });
  test("update, what is #15834", function() {
    const shape = new RecordingShape();
    const allConfig = createExtHostConfiguration({
      "editor": {
        "formatOnSave": true
      }
    }, shape);
    allConfig.getConfiguration("editor").update("formatOnSave", { extensions: ["ts"] });
    assert.strictEqual(shape.lastArgs[1], "editor.formatOnSave");
    assert.deepStrictEqual(shape.lastArgs[2], { extensions: ["ts"] });
  });
  test("update/error-state not OK", function() {
    const shape = new class extends mock() {
      $updateConfigurationOption(target, key, value) {
        return Promise.reject(new Error("Unknown Key"));
      }
    }();
    return createExtHostConfiguration({}, shape).getConfiguration("").update("", true, false).then(() => assert.ok(false), (err) => {
    });
  });
  test("configuration change event", (done) => {
    const workspaceFolder = aWorkspaceFolder(URI.file("folder1"), 0);
    const extHostWorkspace = createExtHostWorkspace();
    extHostWorkspace.$initializeWorkspace({
      "id": "foo",
      "folders": [workspaceFolder],
      "name": "foo"
    }, true);
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      extHostWorkspace,
      createConfigurationData({
        "farboo": {
          "config": false,
          "updatedConfig": false
        }
      }),
      new NullLogService()
    );
    const newConfigData = createConfigurationData({
      "farboo": {
        "config": false,
        "updatedConfig": true,
        "newConfig": true
      }
    });
    const configEventData = { keys: ["farboo.updatedConfig", "farboo.newConfig"], overrides: [] };
    store.add(testObject.onDidChangeConfiguration((e) => {
      assert.deepStrictEqual(testObject.getConfiguration().get("farboo"), {
        "config": false,
        "updatedConfig": true,
        "newConfig": true
      });
      assert.ok(e.affectsConfiguration("farboo"));
      assert.ok(e.affectsConfiguration("farboo", workspaceFolder.uri));
      assert.ok(e.affectsConfiguration("farboo", URI.file("any")));
      assert.ok(e.affectsConfiguration("farboo.updatedConfig"));
      assert.ok(e.affectsConfiguration("farboo.updatedConfig", workspaceFolder.uri));
      assert.ok(e.affectsConfiguration("farboo.updatedConfig", URI.file("any")));
      assert.ok(e.affectsConfiguration("farboo.newConfig"));
      assert.ok(e.affectsConfiguration("farboo.newConfig", workspaceFolder.uri));
      assert.ok(e.affectsConfiguration("farboo.newConfig", URI.file("any")));
      assert.ok(!e.affectsConfiguration("farboo.config"));
      assert.ok(!e.affectsConfiguration("farboo.config", workspaceFolder.uri));
      assert.ok(!e.affectsConfiguration("farboo.config", URI.file("any")));
      done();
    }));
    testObject.$acceptConfigurationChanged(newConfigData, configEventData);
  });
  test("get return instance of array value", function() {
    const testObject = createExtHostConfiguration({ "far": { "boo": [] } });
    const value = testObject.getConfiguration().get("far.boo", []);
    value.push("a");
    const actual = testObject.getConfiguration().get("far.boo", []);
    assert.deepStrictEqual(actual, []);
  });
  function aWorkspaceFolder(uri, index, name = "") {
    return new WorkspaceFolder({ uri, name, index });
  }
  function toConfigurationModel(obj) {
    const parser = new ConfigurationModelParser("test", new NullLogService());
    parser.parse(JSON.stringify(obj));
    return parser.configurationModel;
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdENvbmZpZ3VyYXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0V29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkluc3BlY3QsIEV4dEhvc3RDb25maWdQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlLCBJQ29uZmlndXJhdGlvbkluaXREYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbk1vZGVsLCBDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uTW9kZWxzLmpzJztcbmltcG9ydCB7IFRlc3RSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyLCBXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvbk1vZGVsLCBJQ29uZmlndXJhdGlvbkNoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RmlsZVN5c3RlbUluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLmpzJztcbmltcG9ydCB7IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVVSSVRyYW5zZm9ybWVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VXJpVHJhbnNmb3JtZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnRXh0SG9zdENvbmZpZ3VyYXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cblx0Y2xhc3MgUmVjb3JkaW5nU2hhcGUgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb25maWd1cmF0aW9uU2hhcGU+KCkge1xuXHRcdGxhc3RBcmdzITogW0NvbmZpZ3VyYXRpb25UYXJnZXQsIHN0cmluZywgYW55XTtcblx0XHRvdmVycmlkZSAkdXBkYXRlQ29uZmlndXJhdGlvbk9wdGlvbih0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHR0aGlzLmxhc3RBcmdzID0gW3RhcmdldCwga2V5LCB2YWx1ZV07XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZSgpOiBFeHRIb3N0V29ya3NwYWNlIHtcblx0XHRyZXR1cm4gbmV3IEV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlPigpIHsgfSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvPigpIHsgb3ZlcnJpZGUgZ2V0Q2FwYWJpbGl0aWVzKCkgeyByZXR1cm4gaXNMaW51eCA/IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZSA6IHVuZGVmaW5lZDsgfSB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVVJJVHJhbnNmb3JtZXJTZXJ2aWNlPigpIHsgfSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbihjb250ZW50czogYW55ID0gT2JqZWN0LmNyZWF0ZShudWxsKSwgc2hhcGU/OiBNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlKSB7XG5cdFx0aWYgKCFzaGFwZSkge1xuXHRcdFx0c2hhcGUgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb25maWd1cmF0aW9uU2hhcGU+KCkgeyB9O1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEV4dEhvc3RDb25maWdQcm92aWRlcihzaGFwZSwgY3JlYXRlRXh0SG9zdFdvcmtzcGFjZSgpLCBjcmVhdGVDb25maWd1cmF0aW9uRGF0YShjb250ZW50cyksIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNvbmZpZ3VyYXRpb25EYXRhKGNvbnRlbnRzOiBhbnkpOiBJQ29uZmlndXJhdGlvbkluaXREYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGVmYXVsdHM6IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoY29udGVudHMsIFtdLCBbXSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRwb2xpY3k6IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdGFwcGxpY2F0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHR1c2VyTG9jYWw6IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoY29udGVudHMsIFtdLCBbXSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHR1c2VyUmVtb3RlOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHR3b3Jrc3BhY2U6IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdGZvbGRlcnM6IFtdLFxuXHRcdFx0Y29uZmlndXJhdGlvblNjb3BlczogW11cblx0XHR9O1xuXHR9XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdnZXRDb25maWd1cmF0aW9uIGZhaWxzIHJlZ3Jlc3Npb24gdGVzdCAxLjcuMSAtPiAxLjggIzE1NTUyJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV4dEhvc3RDb25maWcgPSBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7XG5cdFx0XHQnc2VhcmNoJzoge1xuXHRcdFx0XHQnZXhjbHVkZSc6IHtcblx0XHRcdFx0XHQnKiovbm9kZV9tb2R1bGVzJzogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdENvbmZpZy5nZXRDb25maWd1cmF0aW9uKCdzZWFyY2guZXhjbHVkZScpWycqKi9ub2RlX21vZHVsZXMnXSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RDb25maWcuZ2V0Q29uZmlndXJhdGlvbignc2VhcmNoLmV4Y2x1ZGUnKS5nZXQoJyoqL25vZGVfbW9kdWxlcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdENvbmZpZy5nZXRDb25maWd1cmF0aW9uKCdzZWFyY2gnKS5nZXQ8YW55PignZXhjbHVkZScpWycqKi9ub2RlX21vZHVsZXMnXSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdENvbmZpZy5nZXRDb25maWd1cmF0aW9uKCdzZWFyY2guZXhjbHVkZScpLmhhcygnKiovbm9kZV9tb2R1bGVzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0Q29uZmlnLmdldENvbmZpZ3VyYXRpb24oJ3NlYXJjaCcpLmhhcygnZXhjbHVkZS4qKi9ub2RlX21vZHVsZXMnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhcy9nZXQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBhbGwgPSBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7XG5cdFx0XHQnZmFyYm9vJzoge1xuXHRcdFx0XHQnY29uZmlnMCc6IHRydWUsXG5cdFx0XHRcdCduZXN0ZWQnOiB7XG5cdFx0XHRcdFx0J2NvbmZpZzEnOiA0Mixcblx0XHRcdFx0XHQnY29uZmlnMic6ICdEYXMgUGZlcmQgZnJpc3N0IGtlaW4gUmVpcy4nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdjb25maWc0JzogJydcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGFsbC5nZXRDb25maWd1cmF0aW9uKCdmYXJib28nKTtcblxuXHRcdGFzc2VydC5vayhjb25maWcuaGFzKCdjb25maWcwJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuZ2V0KCdjb25maWcwJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuZ2V0KCdjb25maWc0JyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnWydjb25maWcwJ10sIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWdbJ2NvbmZpZzQnXSwgJycpO1xuXG5cdFx0YXNzZXJ0Lm9rKGNvbmZpZy5oYXMoJ25lc3RlZC5jb25maWcxJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuZ2V0KCduZXN0ZWQuY29uZmlnMScpLCA0Mik7XG5cdFx0YXNzZXJ0Lm9rKGNvbmZpZy5oYXMoJ25lc3RlZC5jb25maWcyJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuZ2V0KCduZXN0ZWQuY29uZmlnMicpLCAnRGFzIFBmZXJkIGZyaXNzdCBrZWluIFJlaXMuJyk7XG5cblx0XHRhc3NlcnQub2soY29uZmlnLmhhcygnbmVzdGVkJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlnLmdldCgnbmVzdGVkJyksIHsgY29uZmlnMTogNDIsIGNvbmZpZzI6ICdEYXMgUGZlcmQgZnJpc3N0IGtlaW4gUmVpcy4nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXQgbmVzdGVkIGNvbmZpZycsICgpID0+IHtcblxuXHRcdGNvbnN0IGFsbCA9IGNyZWF0ZUV4dEhvc3RDb25maWd1cmF0aW9uKHtcblx0XHRcdCdmYXJib28nOiB7XG5cdFx0XHRcdCdjb25maWcwJzogdHJ1ZSxcblx0XHRcdFx0J25lc3RlZCc6IHtcblx0XHRcdFx0XHQnY29uZmlnMSc6IDQyLFxuXHRcdFx0XHRcdCdjb25maWcyJzogJ0RhcyBQZmVyZCBmcmlzc3Qga2VpbiBSZWlzLidcblx0XHRcdFx0fSxcblx0XHRcdFx0J2NvbmZpZzQnOiAnJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vLm5lc3RlZCcpLmdldCgnY29uZmlnMScpLCA0Mik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vLm5lc3RlZCcpLmdldCgnY29uZmlnMicpLCAnRGFzIFBmZXJkIGZyaXNzdCBrZWluIFJlaXMuJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vLm5lc3RlZCcpWydjb25maWcxJ10sIDQyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFsbC5nZXRDb25maWd1cmF0aW9uKCdmYXJib28ubmVzdGVkJylbJ2NvbmZpZzInXSwgJ0RhcyBQZmVyZCBmcmlzc3Qga2VpbiBSZWlzLicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWxsLmdldENvbmZpZ3VyYXRpb24oJ2ZhcmJvby5uZXN0ZWQxJykuZ2V0KCdjb25maWcxJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vLm5lc3RlZDEnKS5nZXQoJ2NvbmZpZzInKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFsbC5nZXRDb25maWd1cmF0aW9uKCdmYXJib28uY29uZmlnMC5jb25maWcxJykuZ2V0KCdhJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vLmNvbmZpZzAuY29uZmlnMScpWydhJ10sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBtb2RpZnkgdGhlIHJldHVybmVkIGNvbmZpZ3VyYXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBhbGwgPSBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7XG5cdFx0XHQnZmFyYm9vJzoge1xuXHRcdFx0XHQnY29uZmlnMCc6IHRydWUsXG5cdFx0XHRcdCduZXN0ZWQnOiB7XG5cdFx0XHRcdFx0J2NvbmZpZzEnOiA0Mixcblx0XHRcdFx0XHQnY29uZmlnMic6ICdEYXMgUGZlcmQgZnJpc3N0IGtlaW4gUmVpcy4nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdjb25maWc0JzogJydcblx0XHRcdH0sXG5cdFx0XHQnd29ya2JlbmNoJzoge1xuXHRcdFx0XHQnY29sb3JDdXN0b21pemF0aW9ucyc6IHtcblx0XHRcdFx0XHQnc3RhdHVzQmFyLmZvcmVncm91bmQnOiAnc29tZXZhbHVlJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsZXQgdGVzdE9iamVjdCA9IGFsbC5nZXRDb25maWd1cmF0aW9uKCk7XG5cdFx0bGV0IGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0PGFueT4oJ2ZhcmJvbycpITtcblx0XHRhY3R1YWxbJ25lc3RlZCddWydjb25maWcxJ10gPSA0MTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoNDEsIGFjdHVhbFsnbmVzdGVkJ11bJ2NvbmZpZzEnXSk7XG5cdFx0YWN0dWFsWydmYXJib28xJ10gPSAnbmV3VmFsdWUnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnbmV3VmFsdWUnLCBhY3R1YWxbJ2ZhcmJvbzEnXSk7XG5cblx0XHR0ZXN0T2JqZWN0ID0gYWxsLmdldENvbmZpZ3VyYXRpb24oKTtcblx0XHRhY3R1YWwgPSB0ZXN0T2JqZWN0LmdldCgnZmFyYm9vJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbJ25lc3RlZCddWydjb25maWcxJ10sIDQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsWydmYXJib28xJ10sIHVuZGVmaW5lZCk7XG5cblx0XHR0ZXN0T2JqZWN0ID0gYWxsLmdldENvbmZpZ3VyYXRpb24oKTtcblx0XHRhY3R1YWwgPSB0ZXN0T2JqZWN0LmdldCgnZmFyYm9vJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbJ2NvbmZpZzAnXSwgdHJ1ZSk7XG5cdFx0YWN0dWFsWydjb25maWcwJ10gPSBmYWxzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsWydjb25maWcwJ10sIGZhbHNlKTtcblxuXHRcdHRlc3RPYmplY3QgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbigpO1xuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0KCdmYXJib28nKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFsnY29uZmlnMCddLCB0cnVlKTtcblxuXHRcdHRlc3RPYmplY3QgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbigpO1xuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuaW5zcGVjdCgnZmFyYm9vJykhO1xuXHRcdGFjdHVhbFsndmFsdWUnXSA9ICdlZmZlY3RpdmVWYWx1ZSc7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCdlZmZlY3RpdmVWYWx1ZScsIGFjdHVhbFsndmFsdWUnXSk7XG5cblx0XHR0ZXN0T2JqZWN0ID0gYWxsLmdldENvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaCcpO1xuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0KCdjb2xvckN1c3RvbWl6YXRpb25zJykhO1xuXHRcdGFjdHVhbFsnc3RhdHVzQmFyLmZvcmVncm91bmQnXSA9IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsWydzdGF0dXNCYXIuZm9yZWdyb3VuZCddLCB1bmRlZmluZWQpO1xuXHRcdHRlc3RPYmplY3QgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbignd29ya2JlbmNoJyk7XG5cdFx0YWN0dWFsID0gdGVzdE9iamVjdC5nZXQoJ2NvbG9yQ3VzdG9taXphdGlvbnMnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFsnc3RhdHVzQmFyLmZvcmVncm91bmQnXSwgJ3NvbWV2YWx1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdTdHJpbmdpZnkgcmV0dXJuZWQgY29uZmlndXJhdGlvbicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGFsbCA9IGNyZWF0ZUV4dEhvc3RDb25maWd1cmF0aW9uKHtcblx0XHRcdCdmYXJib28nOiB7XG5cdFx0XHRcdCdjb25maWcwJzogdHJ1ZSxcblx0XHRcdFx0J25lc3RlZCc6IHtcblx0XHRcdFx0XHQnY29uZmlnMSc6IDQyLFxuXHRcdFx0XHRcdCdjb25maWcyJzogJ0RhcyBQZmVyZCBmcmlzc3Qga2VpbiBSZWlzLidcblx0XHRcdFx0fSxcblx0XHRcdFx0J2NvbmZpZzQnOiAnJ1xuXHRcdFx0fSxcblx0XHRcdCd3b3JrYmVuY2gnOiB7XG5cdFx0XHRcdCdjb2xvckN1c3RvbWl6YXRpb25zJzoge1xuXHRcdFx0XHRcdCdzdGF0dXNCYXIuZm9yZWdyb3VuZCc6ICdzb21ldmFsdWUnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlbXB0eW9iamVjdGtleSc6IHtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFsbC5nZXRDb25maWd1cmF0aW9uKCk7XG5cdFx0bGV0IGFjdHVhbDogYW55ID0gdGVzdE9iamVjdC5nZXQoJ2ZhcmJvbycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J2NvbmZpZzAnOiB0cnVlLFxuXHRcdFx0J25lc3RlZCc6IHtcblx0XHRcdFx0J2NvbmZpZzEnOiA0Mixcblx0XHRcdFx0J2NvbmZpZzInOiAnRGFzIFBmZXJkIGZyaXNzdCBrZWluIFJlaXMuJ1xuXHRcdFx0fSxcblx0XHRcdCdjb25maWc0JzogJydcblx0XHR9KSwgSlNPTi5zdHJpbmdpZnkoYWN0dWFsKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVuZGVmaW5lZCwgSlNPTi5zdHJpbmdpZnkodGVzdE9iamVjdC5nZXQoJ3Vua25vd25rZXknKSkpO1xuXG5cdFx0YWN0dWFsID0gdGVzdE9iamVjdC5nZXQoJ2ZhcmJvbycpITtcblx0XHRhY3R1YWxbJ2NvbmZpZzAnXSA9IGZhbHNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J2NvbmZpZzAnOiBmYWxzZSxcblx0XHRcdCduZXN0ZWQnOiB7XG5cdFx0XHRcdCdjb25maWcxJzogNDIsXG5cdFx0XHRcdCdjb25maWcyJzogJ0RhcyBQZmVyZCBmcmlzc3Qga2VpbiBSZWlzLidcblx0XHRcdH0sXG5cdFx0XHQnY29uZmlnNCc6ICcnXG5cdFx0fSksIEpTT04uc3RyaW5naWZ5KGFjdHVhbCkpO1xuXG5cdFx0YWN0dWFsID0gdGVzdE9iamVjdC5nZXQ8YW55Pignd29ya2JlbmNoJykhWydjb2xvckN1c3RvbWl6YXRpb25zJ10hO1xuXHRcdGFjdHVhbFsnc3RhdHVzQmFyLmJhY2tncm91bmQnXSA9ICdhbm90aGVydmFsdWUnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J3N0YXR1c0Jhci5mb3JlZ3JvdW5kJzogJ3NvbWV2YWx1ZScsXG5cdFx0XHQnc3RhdHVzQmFyLmJhY2tncm91bmQnOiAnYW5vdGhlcnZhbHVlJ1xuXHRcdH0pLCBKU09OLnN0cmluZ2lmeShhY3R1YWwpKTtcblxuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0KCd3b3JrYmVuY2gnKTtcblx0XHRhY3R1YWxbJ3Vua25vd25rZXknXSA9ICdzb21ldmFsdWUnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J2NvbG9yQ3VzdG9taXphdGlvbnMnOiB7XG5cdFx0XHRcdCdzdGF0dXNCYXIuZm9yZWdyb3VuZCc6ICdzb21ldmFsdWUnXG5cdFx0XHR9LFxuXHRcdFx0J2VtcHR5b2JqZWN0a2V5Jzoge30sXG5cdFx0XHQndW5rbm93bmtleSc6ICdzb21ldmFsdWUnXG5cdFx0fSksIEpTT04uc3RyaW5naWZ5KGFjdHVhbCkpO1xuXG5cdFx0YWN0dWFsID0gYWxsLmdldENvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaCcpLmdldCgnZW1wdHlvYmplY3RrZXknKTtcblx0XHRhY3R1YWwgPSB7XG5cdFx0XHQuLi4oYWN0dWFsIHx8IHt9KSxcblx0XHRcdCdzdGF0dXNCYXIuYmFja2dyb3VuZCc6IGAjMGZmYCxcblx0XHRcdCdzdGF0dXNCYXIuZm9yZWdyb3VuZCc6IGAjZmYwYCxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J3N0YXR1c0Jhci5iYWNrZ3JvdW5kJzogYCMwZmZgLFxuXHRcdFx0J3N0YXR1c0Jhci5mb3JlZ3JvdW5kJzogYCNmZjBgLFxuXHRcdH0pLCBKU09OLnN0cmluZ2lmeShhY3R1YWwpKTtcblxuXHRcdGFjdHVhbCA9IGFsbC5nZXRDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gnKS5nZXQoJ3Vua25vd25rZXknKTtcblx0XHRhY3R1YWwgPSB7XG5cdFx0XHQuLi4oYWN0dWFsIHx8IHt9KSxcblx0XHRcdCdzdGF0dXNCYXIuYmFja2dyb3VuZCc6IGAjMGZmYCxcblx0XHRcdCdzdGF0dXNCYXIuZm9yZWdyb3VuZCc6IGAjZmYwYCxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0J3N0YXR1c0Jhci5iYWNrZ3JvdW5kJzogYCMwZmZgLFxuXHRcdFx0J3N0YXR1c0Jhci5mb3JlZ3JvdW5kJzogYCNmZjBgLFxuXHRcdH0pLCBKU09OLnN0cmluZ2lmeShhY3R1YWwpKTtcblx0fSk7XG5cblx0dGVzdCgnY2Fubm90IG1vZGlmeSByZXR1cm5lZCBjb25maWd1cmF0aW9uJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgYWxsID0gY3JlYXRlRXh0SG9zdENvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2ZhcmJvbyc6IHtcblx0XHRcdFx0J2NvbmZpZzAnOiB0cnVlLFxuXHRcdFx0XHQnbmVzdGVkJzoge1xuXHRcdFx0XHRcdCdjb25maWcxJzogNDIsXG5cdFx0XHRcdFx0J2NvbmZpZzInOiAnRGFzIFBmZXJkIGZyaXNzdCBrZWluIFJlaXMuJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQnY29uZmlnNCc6ICcnXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0OiBhbnkgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbigpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRlc3RPYmplY3RbJ2dldCddID0gbnVsbDtcblx0XHRcdGFzc2VydC5mYWlsKCdUaGlzIHNob3VsZCBiZSByZWFkb25seScpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGVzdE9iamVjdFsnZmFyYm9vJ11bJ2NvbmZpZzAnXSA9IGZhbHNlO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1RoaXMgc2hvdWxkIGJlIHJlYWRvbmx5Jyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0ZXN0T2JqZWN0WydmYXJib28nXVsnZmFyYm9vMSddID0gJ2hlbGxvJztcblx0XHRcdGFzc2VydC5mYWlsKCdUaGlzIHNob3VsZCBiZSByZWFkb25seScpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2luc3BlY3QgaW4gbm8gd29ya3NwYWNlIGNvbnRleHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBFeHRIb3N0Q29uZmlnUHJvdmlkZXIoXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb25maWd1cmF0aW9uU2hhcGU+KCkgeyB9LFxuXHRcdFx0Y3JlYXRlRXh0SG9zdFdvcmtzcGFjZSgpLFxuXHRcdFx0e1xuXHRcdFx0XHRkZWZhdWx0czogbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHRcdFx0J2VkaXRvcic6IHtcblx0XHRcdFx0XHRcdCd3b3JkV3JhcCc6ICdvZmYnLFxuXHRcdFx0XHRcdFx0J2xpbmVOdW1iZXJzJzogJ29uJyxcblx0XHRcdFx0XHRcdCdmb250U2l6ZSc6ICcxMnB4J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHRwb2xpY3k6IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0YXBwbGljYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0dXNlckxvY2FsOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHRcdFx0J3dvcmRXcmFwJzogJ29uJyxcblx0XHRcdFx0XHRcdCdsaW5lTnVtYmVycyc6ICdvZmYnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCBbJ2VkaXRvci53b3JkV3JhcCcsICdlZGl0b3IubGluZU51bWJlcnMnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHR1c2VyUmVtb3RlOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHRcdFx0J2xpbmVOdW1iZXJzJzogJ3JlbGF0aXZlJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgWydlZGl0b3IubGluZU51bWJlcnMnXSwgW10sIHtcblx0XHRcdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHRcdFx0J2xpbmVOdW1iZXJzJzogJ3JlbGF0aXZlJyxcblx0XHRcdFx0XHRcdCdmb250U2l6ZSc6ICcxNHB4J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHR3b3Jrc3BhY2U6IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoe30sIFtdLCBbXSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdGZvbGRlcnM6IFtdLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uU2NvcGVzOiBbXVxuXHRcdFx0fSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpXG5cdFx0KTtcblxuXHRcdGxldCBhY3R1YWw6IENvbmZpZ3VyYXRpb25JbnNwZWN0PHN0cmluZz4gPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oKS5pbnNwZWN0KCdlZGl0b3Iud29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbExvY2FsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YWN0dWFsID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InKS5pbnNwZWN0KCd3b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRhY3R1YWwgPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oJ2VkaXRvcicpLmluc3BlY3QoJ2xpbmVOdW1iZXJzJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZGVmYXVsdFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbExvY2FsVmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbFJlbW90ZVZhbHVlLCAncmVsYXRpdmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbFZhbHVlLCAncmVsYXRpdmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InKS5nZXQoJ2ZvbnRTaXplJyksICcxMnB4Jyk7XG5cblx0XHRhY3R1YWwgPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oJ2VkaXRvcicpLmluc3BlY3QoJ2ZvbnRTaXplJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZGVmYXVsdFZhbHVlLCAnMTJweCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsTG9jYWxWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbFJlbW90ZVZhbHVlLCAnMTRweCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNwZWN0IGluIHNpbmdsZSByb290IGNvbnRleHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gVVJJLmZpbGUoJ2ZvbycpO1xuXHRcdGNvbnN0IGZvbGRlcnM6IFtVcmlDb21wb25lbnRzLCBJQ29uZmlndXJhdGlvbk1vZGVsXVtdID0gW107XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHQnd29yZFdyYXAnOiAnYm91bmRlZCdcblx0XHRcdH1cblx0XHR9LCBbJ2VkaXRvci53b3JkV3JhcCddLCBbXSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Zm9sZGVycy5wdXNoKFt3b3Jrc3BhY2VVcmksIHdvcmtzcGFjZV0pO1xuXHRcdGNvbnN0IGV4dEhvc3RXb3Jrc3BhY2UgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKCk7XG5cdFx0ZXh0SG9zdFdvcmtzcGFjZS4kaW5pdGlhbGl6ZVdvcmtzcGFjZSh7XG5cdFx0XHQnaWQnOiAnZm9vJyxcblx0XHRcdCdmb2xkZXJzJzogW2FXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJ2ZvbycpLCAwKV0sXG5cdFx0XHQnbmFtZSc6ICdmb28nXG5cdFx0fSwgdHJ1ZSk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBFeHRIb3N0Q29uZmlnUHJvdmlkZXIoXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb25maWd1cmF0aW9uU2hhcGU+KCkgeyB9LFxuXHRcdFx0ZXh0SG9zdFdvcmtzcGFjZSxcblx0XHRcdHtcblx0XHRcdFx0ZGVmYXVsdHM6IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoe1xuXHRcdFx0XHRcdCdlZGl0b3InOiB7XG5cdFx0XHRcdFx0XHQnd29yZFdyYXAnOiAnb2ZmJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHRwb2xpY3k6IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0YXBwbGljYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0dXNlckxvY2FsOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHRcdFx0J3dvcmRXcmFwJzogJ29uJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHR1c2VyUmVtb3RlOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdFx0Zm9sZGVycyxcblx0XHRcdFx0Y29uZmlndXJhdGlvblNjb3BlczogW11cblx0XHRcdH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKVxuXHRcdCk7XG5cblx0XHRsZXQgYWN0dWFsMTogQ29uZmlndXJhdGlvbkluc3BlY3Q8c3RyaW5nPiA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbigpLmluc3BlY3QoJ2VkaXRvci53b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5nbG9iYWxMb2NhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEud29ya3NwYWNlVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRhY3R1YWwxID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InKS5pbnNwZWN0KCd3b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5nbG9iYWxMb2NhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEud29ya3NwYWNlVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRsZXQgYWN0dWFsMjogQ29uZmlndXJhdGlvbkluc3BlY3Q8c3RyaW5nPiA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbih1bmRlZmluZWQsIHdvcmtzcGFjZVVyaSkuaW5zcGVjdCgnZWRpdG9yLndvcmRXcmFwJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbExvY2FsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VWYWx1ZSwgJ2JvdW5kZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgJ2JvdW5kZWQnKTtcblxuXHRcdGFjdHVhbDIgPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oJ2VkaXRvcicsIHdvcmtzcGFjZVVyaSkuaW5zcGVjdCgnd29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZVZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZUZvbGRlclZhbHVlLCAnYm91bmRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNwZWN0IGluIG11bHRpIHJvb3QgY29udGV4dCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdCdlZGl0b3InOiB7XG5cdFx0XHRcdCd3b3JkV3JhcCc6ICdib3VuZGVkJ1xuXHRcdFx0fVxuXHRcdH0sIFsnZWRpdG9yLndvcmRXcmFwJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGZpcnN0Um9vdCA9IFVSSS5maWxlKCdmb28xJyk7XG5cdFx0Y29uc3Qgc2Vjb25kUm9vdCA9IFVSSS5maWxlKCdmb28yJyk7XG5cdFx0Y29uc3QgdGhpcmRSb290ID0gVVJJLmZpbGUoJ2ZvbzMnKTtcblx0XHRjb25zdCBmb2xkZXJzOiBbVXJpQ29tcG9uZW50cywgSUNvbmZpZ3VyYXRpb25Nb2RlbF1bXSA9IFtdO1xuXHRcdGZvbGRlcnMucHVzaChbZmlyc3RSb290LCBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdCdlZGl0b3InOiB7XG5cdFx0XHRcdCd3b3JkV3JhcCc6ICdvZmYnLFxuXHRcdFx0XHQnbGluZU51bWJlcnMnOiAncmVsYXRpdmUnXG5cdFx0XHR9XG5cdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpXSk7XG5cdFx0Zm9sZGVycy5wdXNoKFtzZWNvbmRSb290LCBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdCdlZGl0b3InOiB7XG5cdFx0XHRcdCd3b3JkV3JhcCc6ICdvbidcblx0XHRcdH1cblx0XHR9LCBbJ2VkaXRvci53b3JkV3JhcCddLCBbXSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSldKTtcblx0XHRmb2xkZXJzLnB1c2goW3RoaXJkUm9vdCwgbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7fSwgW10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKV0pO1xuXG5cdFx0Y29uc3QgZXh0SG9zdFdvcmtzcGFjZSA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UoKTtcblx0XHRleHRIb3N0V29ya3NwYWNlLiRpbml0aWFsaXplV29ya3NwYWNlKHtcblx0XHRcdCdpZCc6ICdmb28nLFxuXHRcdFx0J2ZvbGRlcnMnOiBbYVdvcmtzcGFjZUZvbGRlcihmaXJzdFJvb3QsIDApLCBhV29ya3NwYWNlRm9sZGVyKHNlY29uZFJvb3QsIDEpXSxcblx0XHRcdCduYW1lJzogJ2Zvbydcblx0XHR9LCB0cnVlKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEV4dEhvc3RDb25maWdQcm92aWRlcihcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZENvbmZpZ3VyYXRpb25TaGFwZT4oKSB7IH0sXG5cdFx0XHRleHRIb3N0V29ya3NwYWNlLFxuXHRcdFx0e1xuXHRcdFx0XHRkZWZhdWx0czogbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHRcdFx0J2VkaXRvcic6IHtcblx0XHRcdFx0XHRcdCd3b3JkV3JhcCc6ICdvZmYnLFxuXHRcdFx0XHRcdFx0J2xpbmVOdW1iZXJzJzogJ29uJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHRwb2xpY3k6IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0YXBwbGljYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0dXNlckxvY2FsOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHRcdFx0J3dvcmRXcmFwJzogJ29uJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHR1c2VyUmVtb3RlOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdFx0Zm9sZGVycyxcblx0XHRcdFx0Y29uZmlndXJhdGlvblNjb3BlczogW11cblx0XHRcdH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKVxuXHRcdCk7XG5cblx0XHRsZXQgYWN0dWFsMTogQ29uZmlndXJhdGlvbkluc3BlY3Q8c3RyaW5nPiA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbigpLmluc3BlY3QoJ2VkaXRvci53b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEud29ya3NwYWNlVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRhY3R1YWwxID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InKS5pbnNwZWN0KCd3b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEud29ya3NwYWNlVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRhY3R1YWwxID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InKS5pbnNwZWN0KCdsaW5lTnVtYmVycycpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5kZWZhdWx0VmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLmdsb2JhbFZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLmdsb2JhbExvY2FsVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEud29ya3NwYWNlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRsZXQgYWN0dWFsMjogQ29uZmlndXJhdGlvbkluc3BlY3Q8c3RyaW5nPiA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbih1bmRlZmluZWQsIGZpcnN0Um9vdCkuaW5zcGVjdCgnZWRpdG9yLndvcmRXcmFwJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxMb2NhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VWYWx1ZSwgJ2JvdW5kZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgJ29mZicpO1xuXG5cdFx0YWN0dWFsMiA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbignZWRpdG9yJywgZmlyc3RSb290KS5pbnNwZWN0KCd3b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIud29ya3NwYWNlVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIud29ya3NwYWNlRm9sZGVyVmFsdWUsICdvZmYnKTtcblxuXHRcdGFjdHVhbDIgPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oJ2VkaXRvcicsIGZpcnN0Um9vdCkuaW5zcGVjdCgnbGluZU51bWJlcnMnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZGVmYXVsdFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxMb2NhbFZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZUZvbGRlclZhbHVlLCAncmVsYXRpdmUnKTtcblxuXHRcdGFjdHVhbDIgPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCBzZWNvbmRSb290KS5pbnNwZWN0KCdlZGl0b3Iud29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbExvY2FsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZVZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZUZvbGRlclZhbHVlLCAnb24nKTtcblxuXHRcdGFjdHVhbDIgPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oJ2VkaXRvcicsIHNlY29uZFJvb3QpLmluc3BlY3QoJ3dvcmRXcmFwJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxMb2NhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VWYWx1ZSwgJ2JvdW5kZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgJ29uJyk7XG5cblx0XHRhY3R1YWwyID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKHVuZGVmaW5lZCwgdGhpcmRSb290KS5pbnNwZWN0KCdlZGl0b3Iud29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbExvY2FsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZVZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5vayhPYmplY3Qua2V5cyhhY3R1YWwyKS5pbmRleE9mKCd3b3Jrc3BhY2VGb2xkZXJWYWx1ZScpICE9PSAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRhY3R1YWwyID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InLCB0aGlyZFJvb3QpLmluc3BlY3QoJ3dvcmRXcmFwJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxMb2NhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VWYWx1ZSwgJ2JvdW5kZWQnKTtcblx0XHRhc3NlcnQub2soT2JqZWN0LmtleXMoYWN0dWFsMikuaW5kZXhPZignd29ya3NwYWNlRm9sZGVyVmFsdWUnKSAhPT0gLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNwZWN0IHdpdGggbGFuZ3VhZ2Ugb3ZlcnJpZGVzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpcnN0Um9vdCA9IFVSSS5maWxlKCdmb28xJyk7XG5cdFx0Y29uc3Qgc2Vjb25kUm9vdCA9IFVSSS5maWxlKCdmb28yJyk7XG5cdFx0Y29uc3QgZm9sZGVyczogW1VyaUNvbXBvbmVudHMsIElDb25maWd1cmF0aW9uTW9kZWxdW10gPSBbXTtcblx0XHRmb2xkZXJzLnB1c2goW2ZpcnN0Um9vdCwgdG9Db25maWd1cmF0aW9uTW9kZWwoe1xuXHRcdFx0J2VkaXRvci53b3JkV3JhcCc6ICdib3VuZGVkJyxcblx0XHRcdCdbdHlwZXNjcmlwdF0nOiB7XG5cdFx0XHRcdCdlZGl0b3Iud29yZFdyYXAnOiAndW5ib3VuZGVkJyxcblx0XHRcdH1cblx0XHR9KV0pO1xuXHRcdGZvbGRlcnMucHVzaChbc2Vjb25kUm9vdCwgdG9Db25maWd1cmF0aW9uTW9kZWwoe30pXSk7XG5cblx0XHRjb25zdCBleHRIb3N0V29ya3NwYWNlID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZSgpO1xuXHRcdGV4dEhvc3RXb3Jrc3BhY2UuJGluaXRpYWxpemVXb3Jrc3BhY2Uoe1xuXHRcdFx0J2lkJzogJ2ZvbycsXG5cdFx0XHQnZm9sZGVycyc6IFthV29ya3NwYWNlRm9sZGVyKGZpcnN0Um9vdCwgMCksIGFXb3Jrc3BhY2VGb2xkZXIoc2Vjb25kUm9vdCwgMSldLFxuXHRcdFx0J25hbWUnOiAnZm9vJ1xuXHRcdH0sIHRydWUpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgRXh0SG9zdENvbmZpZ1Byb3ZpZGVyKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlPigpIHsgfSxcblx0XHRcdGV4dEhvc3RXb3Jrc3BhY2UsXG5cdFx0XHR7XG5cdFx0XHRcdGRlZmF1bHRzOiB0b0NvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHRcdFx0J2VkaXRvci53b3JkV3JhcCc6ICdvZmYnLFxuXHRcdFx0XHRcdCdbbWFya2Rvd25dJzoge1xuXHRcdFx0XHRcdFx0J2VkaXRvci53b3JkV3JhcCc6ICdib3VuZGVkJyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRwb2xpY3k6IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0YXBwbGljYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0dXNlckxvY2FsOiB0b0NvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHRcdFx0J2VkaXRvci53b3JkV3JhcCc6ICdib3VuZGVkJyxcblx0XHRcdFx0XHQnW3R5cGVzY3JpcHRdJzoge1xuXHRcdFx0XHRcdFx0J2VkaXRvci5saW5lTnVtYmVycyc6ICdvZmYnLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksXG5cdFx0XHRcdHVzZXJSZW1vdGU6IENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0d29ya3NwYWNlOiB0b0NvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHRcdFx0J1t0eXBlc2NyaXB0XSc6IHtcblx0XHRcdFx0XHRcdCdlZGl0b3Iud29yZFdyYXAnOiAndW5ib3VuZGVkJyxcblx0XHRcdFx0XHRcdCdlZGl0b3IubGluZU51bWJlcnMnOiAnb2ZmJyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRmb2xkZXJzLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uU2NvcGVzOiBbXVxuXHRcdFx0fSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpXG5cdFx0KTtcblxuXHRcdGxldCBhY3R1YWw6IENvbmZpZ3VyYXRpb25JbnNwZWN0PHN0cmluZz4gPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCB7IHVyaTogZmlyc3RSb290LCBsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcgfSkuaW5zcGVjdCgnZWRpdG9yLndvcmRXcmFwJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxWYWx1ZSwgJ2JvdW5kZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbExvY2FsVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlRm9sZGVyVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5kZWZhdWx0TGFuZ3VhZ2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbExhbmd1YWdlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VMYW5ndWFnZVZhbHVlLCAndW5ib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VGb2xkZXJMYW5ndWFnZVZhbHVlLCAndW5ib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubGFuZ3VhZ2VJZHMsIFsnbWFya2Rvd24nLCAndHlwZXNjcmlwdCddKTtcblxuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbih1bmRlZmluZWQsIHsgdXJpOiBzZWNvbmRSb290LCBsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcgfSkuaW5zcGVjdCgnZWRpdG9yLndvcmRXcmFwJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxWYWx1ZSwgJ2JvdW5kZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbExvY2FsVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5kZWZhdWx0TGFuZ3VhZ2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbExhbmd1YWdlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VMYW5ndWFnZVZhbHVlLCAndW5ib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VGb2xkZXJMYW5ndWFnZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxhbmd1YWdlSWRzLCBbJ21hcmtkb3duJywgJ3R5cGVzY3JpcHQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGxpY2F0aW9uIGlzIG5vdCBzZXQgaW4gaW5zcGVjdCcsICgpID0+IHtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgRXh0SG9zdENvbmZpZ1Byb3ZpZGVyKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlPigpIHsgfSxcblx0XHRcdGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UoKSxcblx0XHRcdHtcblx0XHRcdFx0ZGVmYXVsdHM6IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoe1xuXHRcdFx0XHRcdCdlZGl0b3InOiB7XG5cdFx0XHRcdFx0XHQnd29yZFdyYXAnOiAnb2ZmJyxcblx0XHRcdFx0XHRcdCdsaW5lTnVtYmVycyc6ICdvbicsXG5cdFx0XHRcdFx0XHQnZm9udFNpemUnOiAnMTJweCdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFsnZWRpdG9yLndvcmRXcmFwJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0cG9saWN5OiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdGFwcGxpY2F0aW9uOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHRcdFx0J3dvcmRXcmFwJzogJ29uJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHR1c2VyTG9jYWw6IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoe1xuXHRcdFx0XHRcdCdlZGl0b3InOiB7XG5cdFx0XHRcdFx0XHQnd29yZFdyYXAnOiAnYXV0bycsXG5cdFx0XHRcdFx0XHQnbGluZU51bWJlcnMnOiAnb2ZmJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHR1c2VyUmVtb3RlOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdHdvcmtzcGFjZTogbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7fSwgW10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0Zm9sZGVyczogW10sXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TY29wZXM6IFtdXG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKClcblx0XHQpO1xuXG5cdFx0bGV0IGFjdHVhbDogQ29uZmlndXJhdGlvbkluc3BlY3Q8c3RyaW5nPiA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbigpLmluc3BlY3QoJ2VkaXRvci53b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsVmFsdWUsICdhdXRvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxMb2NhbFZhbHVlLCAnYXV0bycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oKS5nZXQoJ2VkaXRvci53b3JkV3JhcCcpLCAnYXV0bycpO1xuXG5cdFx0YWN0dWFsID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCkuaW5zcGVjdCgnZWRpdG9yLmxpbmVOdW1iZXJzJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZGVmYXVsdFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxMb2NhbFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbigpLmdldCgnZWRpdG9yLmxpbmVOdW1iZXJzJyksICdvZmYnKTtcblxuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbigpLmluc3BlY3QoJ2VkaXRvci5mb250U2l6ZScpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmRlZmF1bHRWYWx1ZSwgJzEycHgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbExvY2FsVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbFZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCkuZ2V0KCdlZGl0b3IuZm9udFNpemUnKSwgJzEycHgnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29uZmlndXJhdGlvbiB2cyBnZXQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBhbGwgPSBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7XG5cdFx0XHQnZmFyYm9vJzoge1xuXHRcdFx0XHQnY29uZmlnMCc6IHRydWUsXG5cdFx0XHRcdCdjb25maWc0JzogMzhcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxldCBjb25maWcgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vLmNvbmZpZzAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmdldCgnJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5oYXMoJycpLCBmYWxzZSk7XG5cblx0XHRjb25maWcgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5nZXQoJ2NvbmZpZzAnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5oYXMoJ2NvbmZpZzAnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25hbWUgdnMgcHJvcGVydHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgYWxsID0gY3JlYXRlRXh0SG9zdENvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2ZhcmJvbyc6IHtcblx0XHRcdFx0J2dldCc6ICdnZXQtcHJvcCdcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBjb25maWcgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vJyk7XG5cblx0XHRhc3NlcnQub2soY29uZmlnLmhhcygnZ2V0JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuZ2V0KCdnZXQnKSwgJ2dldC1wcm9wJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWdbJ2dldCddLCBjb25maWcuZ2V0KTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNvbmZpZ1snZ2V0J10gPSA8YW55PidnZXQtcHJvcCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGU6IG5vIHRhcmdldCBwYXNzZXMgbnVsbCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzaGFwZSA9IG5ldyBSZWNvcmRpbmdTaGFwZSgpO1xuXHRcdGNvbnN0IGFsbENvbmZpZyA9IGNyZWF0ZUV4dEhvc3RDb25maWd1cmF0aW9uKHtcblx0XHRcdCdmb28nOiB7XG5cdFx0XHRcdCdiYXInOiAxLFxuXHRcdFx0XHQnZmFyJzogMVxuXHRcdFx0fVxuXHRcdH0sIHNoYXBlKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGFsbENvbmZpZy5nZXRDb25maWd1cmF0aW9uKCdmb28nKTtcblx0XHRjb25maWcudXBkYXRlKCdiYXInLCA0Mik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hhcGUubGFzdEFyZ3NbMF0sIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUvc2VjdGlvbiB0byBrZXknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBzaGFwZSA9IG5ldyBSZWNvcmRpbmdTaGFwZSgpO1xuXHRcdGNvbnN0IGFsbENvbmZpZyA9IGNyZWF0ZUV4dEhvc3RDb25maWd1cmF0aW9uKHtcblx0XHRcdCdmb28nOiB7XG5cdFx0XHRcdCdiYXInOiAxLFxuXHRcdFx0XHQnZmFyJzogMVxuXHRcdFx0fVxuXHRcdH0sIHNoYXBlKTtcblxuXHRcdGxldCBjb25maWcgPSBhbGxDb25maWcuZ2V0Q29uZmlndXJhdGlvbignZm9vJyk7XG5cdFx0Y29uZmlnLnVwZGF0ZSgnYmFyJywgNDIsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNoYXBlLmxhc3RBcmdzWzBdLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaGFwZS5sYXN0QXJnc1sxXSwgJ2Zvby5iYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hhcGUubGFzdEFyZ3NbMl0sIDQyKTtcblxuXHRcdGNvbmZpZyA9IGFsbENvbmZpZy5nZXRDb25maWd1cmF0aW9uKCcnKTtcblx0XHRjb25maWcudXBkYXRlKCdiYXInLCA0MiwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNoYXBlLmxhc3RBcmdzWzFdLCAnYmFyJyk7XG5cblx0XHRjb25maWcudXBkYXRlKCdmb28uYmFyJywgNDIsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaGFwZS5sYXN0QXJnc1sxXSwgJ2Zvby5iYXInKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlLCB3aGF0IGlzICMxNTgzNCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzaGFwZSA9IG5ldyBSZWNvcmRpbmdTaGFwZSgpO1xuXHRcdGNvbnN0IGFsbENvbmZpZyA9IGNyZWF0ZUV4dEhvc3RDb25maWd1cmF0aW9uKHtcblx0XHRcdCdlZGl0b3InOiB7XG5cdFx0XHRcdCdmb3JtYXRPblNhdmUnOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSwgc2hhcGUpO1xuXG5cdFx0YWxsQ29uZmlnLmdldENvbmZpZ3VyYXRpb24oJ2VkaXRvcicpLnVwZGF0ZSgnZm9ybWF0T25TYXZlJywgeyBleHRlbnNpb25zOiBbJ3RzJ10gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNoYXBlLmxhc3RBcmdzWzFdLCAnZWRpdG9yLmZvcm1hdE9uU2F2ZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hhcGUubGFzdEFyZ3NbMl0sIHsgZXh0ZW5zaW9uczogWyd0cyddIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUvZXJyb3Itc3RhdGUgbm90IE9LJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qgc2hhcGUgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb25maWd1cmF0aW9uU2hhcGU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgJHVwZGF0ZUNvbmZpZ3VyYXRpb25PcHRpb24odGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IFByb21pc2U8YW55PiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1Vua25vd24gS2V5JykpOyAvLyBzb21ldGhpbmcgIT09IE9LXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJldHVybiBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7fSwgc2hhcGUpXG5cdFx0XHQuZ2V0Q29uZmlndXJhdGlvbignJylcblx0XHRcdC51cGRhdGUoJycsIHRydWUsIGZhbHNlKVxuXHRcdFx0LnRoZW4oKCkgPT4gYXNzZXJ0Lm9rKGZhbHNlKSwgZXJyID0+IHsgLyogZXhwZWN0aW5nIHJlamVjdGlvbiAqLyB9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJhdGlvbiBjaGFuZ2UgZXZlbnQnLCAoZG9uZSkgPT4ge1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gYVdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnZm9sZGVyMScpLCAwKTtcblx0XHRjb25zdCBleHRIb3N0V29ya3NwYWNlID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZSgpO1xuXHRcdGV4dEhvc3RXb3Jrc3BhY2UuJGluaXRpYWxpemVXb3Jrc3BhY2Uoe1xuXHRcdFx0J2lkJzogJ2ZvbycsXG5cdFx0XHQnZm9sZGVycyc6IFt3b3Jrc3BhY2VGb2xkZXJdLFxuXHRcdFx0J25hbWUnOiAnZm9vJ1xuXHRcdH0sIHRydWUpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgRXh0SG9zdENvbmZpZ1Byb3ZpZGVyKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlPigpIHsgfSxcblx0XHRcdGV4dEhvc3RXb3Jrc3BhY2UsXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uRGF0YSh7XG5cdFx0XHRcdCdmYXJib28nOiB7XG5cdFx0XHRcdFx0J2NvbmZpZyc6IGZhbHNlLFxuXHRcdFx0XHRcdCd1cGRhdGVkQ29uZmlnJzogZmFsc2Vcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKVxuXHRcdCk7XG5cblx0XHRjb25zdCBuZXdDb25maWdEYXRhID0gY3JlYXRlQ29uZmlndXJhdGlvbkRhdGEoe1xuXHRcdFx0J2ZhcmJvbyc6IHtcblx0XHRcdFx0J2NvbmZpZyc6IGZhbHNlLFxuXHRcdFx0XHQndXBkYXRlZENvbmZpZyc6IHRydWUsXG5cdFx0XHRcdCduZXdDb25maWcnOiB0cnVlLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbmZpZ0V2ZW50RGF0YTogSUNvbmZpZ3VyYXRpb25DaGFuZ2UgPSB7IGtleXM6IFsnZmFyYm9vLnVwZGF0ZWRDb25maWcnLCAnZmFyYm9vLm5ld0NvbmZpZyddLCBvdmVycmlkZXM6IFtdIH07XG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbigpLmdldCgnZmFyYm9vJyksIHtcblx0XHRcdFx0J2NvbmZpZyc6IGZhbHNlLFxuXHRcdFx0XHQndXBkYXRlZENvbmZpZyc6IHRydWUsXG5cdFx0XHRcdCduZXdDb25maWcnOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdmYXJib28nKSk7XG5cdFx0XHRhc3NlcnQub2soZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmFyYm9vJywgd29ya3NwYWNlRm9sZGVyLnVyaSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZhcmJvbycsIFVSSS5maWxlKCdhbnknKSkpO1xuXG5cdFx0XHRhc3NlcnQub2soZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmFyYm9vLnVwZGF0ZWRDb25maWcnKSk7XG5cdFx0XHRhc3NlcnQub2soZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmFyYm9vLnVwZGF0ZWRDb25maWcnLCB3b3Jrc3BhY2VGb2xkZXIudXJpKSk7XG5cdFx0XHRhc3NlcnQub2soZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmFyYm9vLnVwZGF0ZWRDb25maWcnLCBVUkkuZmlsZSgnYW55JykpKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZhcmJvby5uZXdDb25maWcnKSk7XG5cdFx0XHRhc3NlcnQub2soZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmFyYm9vLm5ld0NvbmZpZycsIHdvcmtzcGFjZUZvbGRlci51cmkpKTtcblx0XHRcdGFzc2VydC5vayhlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdmYXJib28ubmV3Q29uZmlnJywgVVJJLmZpbGUoJ2FueScpKSk7XG5cblx0XHRcdGFzc2VydC5vayghZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmFyYm9vLmNvbmZpZycpKTtcblx0XHRcdGFzc2VydC5vayghZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmFyYm9vLmNvbmZpZycsIHdvcmtzcGFjZUZvbGRlci51cmkpKTtcblx0XHRcdGFzc2VydC5vayghZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmFyYm9vLmNvbmZpZycsIFVSSS5maWxlKCdhbnknKSkpO1xuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRlc3RPYmplY3QuJGFjY2VwdENvbmZpZ3VyYXRpb25DaGFuZ2VkKG5ld0NvbmZpZ0RhdGEsIGNvbmZpZ0V2ZW50RGF0YSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldCByZXR1cm4gaW5zdGFuY2Ugb2YgYXJyYXkgdmFsdWUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGNyZWF0ZUV4dEhvc3RDb25maWd1cmF0aW9uKHsgJ2Zhcic6IHsgJ2Jvbyc6IFtdIH0gfSk7XG5cblx0XHRjb25zdCB2YWx1ZTogc3RyaW5nW10gPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oKS5nZXQoJ2Zhci5ib28nLCBbXSk7XG5cdFx0dmFsdWUucHVzaCgnYScpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCkuZ2V0KCdmYXIuYm9vJywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGFXb3Jrc3BhY2VGb2xkZXIodXJpOiBVUkksIGluZGV4OiBudW1iZXIsIG5hbWU6IHN0cmluZyA9ICcnKTogSVdvcmtzcGFjZUZvbGRlciB7XG5cdFx0cmV0dXJuIG5ldyBXb3Jrc3BhY2VGb2xkZXIoeyB1cmksIG5hbWUsIGluZGV4IH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9Db25maWd1cmF0aW9uTW9kZWwob2JqOiBhbnkpOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdGNvbnN0IHBhcnNlciA9IG5ldyBDb25maWd1cmF0aW9uTW9kZWxQYXJzZXIoJ3Rlc3QnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0cGFyc2VyLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9iaikpO1xuXHRcdHJldHVybiBwYXJzZXIuY29uZmlndXJhdGlvbk1vZGVsO1xuXHR9XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBK0IsNkJBQTZCO0FBRTVELFNBQVMsb0JBQW9CLGdDQUFnQztBQUM3RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBMkIsdUJBQXVCO0FBQ2xELFNBQVMsMkJBQXNFO0FBQy9FLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsZUFBZTtBQUV4QixTQUFTLCtDQUErQztBQUV4RCxNQUFNLHdCQUF3QixXQUFZO0FBQUEsRUFFekMsTUFBTSx1QkFBdUIsS0FBbUMsRUFBRTtBQUFBLElBRXhELDJCQUEyQixRQUE2QixLQUFhLE9BQTJCO0FBQ3hHLFdBQUssV0FBVyxDQUFDLFFBQVEsS0FBSyxLQUFLO0FBQ25DLGFBQU8sUUFBUSxRQUFRLE1BQVM7QUFBQSxJQUNqQztBQUFBLEVBQ0Q7QUFFQSxXQUFTLHlCQUEyQztBQUNuRCxXQUFPLElBQUksaUJBQWlCLElBQUksZ0JBQWdCLEdBQUcsSUFBSSxjQUFjLEtBQThCLEVBQUU7QUFBQSxJQUFFLEtBQUcsSUFBSSxjQUFjLEtBQTZCLEVBQUU7QUFBQSxNQUFXLGtCQUFrQjtBQUFFLGVBQU8sVUFB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
