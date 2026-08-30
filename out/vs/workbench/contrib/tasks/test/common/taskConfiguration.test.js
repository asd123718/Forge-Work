import { URI } from "../../../../../base/common/uri.js";
import assert from "assert";
import Severity from "../../../../../base/common/severity.js";
import * as UUID from "../../../../../base/common/uuid.js";
import * as Types from "../../../../../base/common/types.js";
import * as Platform from "../../../../../base/common/platform.js";
import { ValidationStatus } from "../../../../../base/common/parsers.js";
import { FileLocationKind, ApplyToKind } from "../../common/problemMatcher.js";
import { WorkspaceFolder } from "../../../../../platform/workspace/common/workspace.js";
import * as Tasks from "../../common/tasks.js";
import { parse, TaskConfigSource, ProblemMatcherConverter, UUIDMap, TaskParser } from "../../common/taskConfiguration.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { Workspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const workspaceFolder = new WorkspaceFolder({
  uri: URI.file("/workspace/folderOne"),
  name: "folderOne",
  index: 0
});
const workspace = new Workspace("id", [workspaceFolder]);
class ProblemReporter {
  constructor() {
    this._validationStatus = new ValidationStatus();
    this.receivedMessage = false;
    this.lastMessage = void 0;
  }
  info(message) {
    this.log(message);
  }
  warn(message) {
    this.log(message);
  }
  error(message) {
    this.log(message);
  }
  fatal(message) {
    this.log(message);
  }
  get status() {
    return this._validationStatus;
  }
  log(message) {
    this.receivedMessage = true;
    this.lastMessage = message;
  }
  clearMessage() {
    this.lastMessage = void 0;
  }
}
class ConfigurationBuilder {
  constructor() {
    this.result = [];
    this.builders = [];
  }
  task(name, command) {
    const builder = new CustomTaskBuilder(this, name, command);
    this.builders.push(builder);
    this.result.push(builder.result);
    return builder;
  }
  done() {
    for (const builder of this.builders) {
      builder.done();
    }
  }
}
class PresentationBuilder {
  constructor(parent) {
    this.parent = parent;
    this.result = { echo: false, reveal: Tasks.RevealKind.Always, revealProblems: Tasks.RevealProblemKind.Never, focus: false, panel: Tasks.PanelKind.Shared, showReuseMessage: true, clear: false, close: false };
  }
  echo(value) {
    this.result.echo = value;
    return this;
  }
  reveal(value) {
    this.result.reveal = value;
    return this;
  }
  focus(value) {
    this.result.focus = value;
    return this;
  }
  instance(value) {
    this.result.panel = value;
    return this;
  }
  showReuseMessage(value) {
    this.result.showReuseMessage = value;
    return this;
  }
  close(value) {
    this.result.close = value;
    return this;
  }
  done() {
  }
}
class CommandConfigurationBuilder {
  constructor(parent, command) {
    this.parent = parent;
    this.presentationBuilder = new PresentationBuilder(this);
    this.result = {
      name: command,
      runtime: Tasks.RuntimeType.Process,
      args: [],
      options: {
        cwd: "${workspaceFolder}"
      },
      presentation: this.presentationBuilder.result,
      suppressTaskName: false
    };
  }
  name(value) {
    this.result.name = value;
    return this;
  }
  runtime(value) {
    this.result.runtime = value;
    return this;
  }
  args(value) {
    this.result.args = value;
    return this;
  }
  options(value) {
    this.result.options = value;
    return this;
  }
  taskSelector(value) {
    this.result.taskSelector = value;
    return this;
  }
  suppressTaskName(value) {
    this.result.suppressTaskName = value;
    return this;
  }
  presentation() {
    return this.presentationBuilder;
  }
  done(taskName) {
    this.result.args = this.result.args.map((arg) => arg === "$name" ? taskName : arg);
    this.presentationBuilder.done();
  }
}
class CustomTaskBuilder {
  constructor(parent, name, command) {
    this.parent = parent;
    this.commandBuilder = new CommandConfigurationBuilder(this, command);
    this.result = new Tasks.CustomTask(
      name,
      { kind: Tasks.TaskSourceKind.Workspace, label: "workspace", config: { workspaceFolder, element: void 0, index: -1, file: ".vscode/tasks.json" } },
      name,
      Tasks.CUSTOMIZED_TASK_TYPE,
      this.commandBuilder.result,
      false,
      { reevaluateOnRerun: true },
      {
        identifier: name,
        name,
        isBackground: false,
        promptOnClose: true,
        problemMatchers: []
      }
    );
  }
  identifier(value) {
    this.result.configurationProperties.identifier = value;
    return this;
  }
  group(value) {
    this.result.configurationProperties.group = value;
    return this;
  }
  isBackground(value) {
    this.result.configurationProperties.isBackground = value;
    return this;
  }
  promptOnClose(value) {
    this.result.configurationProperties.promptOnClose = value;
    return this;
  }
  problemMatcher() {
    const builder = new ProblemMatcherBuilder(this);
    this.result.configurationProperties.problemMatchers.push(builder.result);
    return builder;
  }
  command() {
    return this.commandBuilder;
  }
  done() {
    this.commandBuilder.done(this.result.configurationProperties.name);
  }
}
const _ProblemMatcherBuilder = class _ProblemMatcherBuilder {
  constructor(parent) {
    this.parent = parent;
    this.result = {
      owner: _ProblemMatcherBuilder.DEFAULT_UUID,
      applyTo: ApplyToKind.allDocuments,
      severity: void 0,
      fileLocation: FileLocationKind.Relative,
      filePrefix: "${workspaceFolder}",
      pattern: void 0
    };
  }
  owner(value) {
    this.result.owner = value;
    return this;
  }
  applyTo(value) {
    this.result.applyTo = value;
    return this;
  }
  severity(value) {
    this.result.severity = value;
    return this;
  }
  fileLocation(value) {
    this.result.fileLocation = value;
    return this;
  }
  filePrefix(value) {
    this.result.filePrefix = value;
    return this;
  }
  pattern(regExp) {
    const builder = new PatternBuilder(this, regExp);
    if (!this.result.pattern) {
      this.result.pattern = builder.result;
    }
    return builder;
  }
};
_ProblemMatcherBuilder.DEFAULT_UUID = UUID.generateUuid();
let ProblemMatcherBuilder = _ProblemMatcherBuilder;
class PatternBuilder {
  constructor(parent, regExp) {
    this.parent = parent;
    this.result = {
      regexp: regExp,
      file: 1,
      message: 0,
      line: 2,
      character: 3
    };
  }
  file(value) {
    this.result.file = value;
    return this;
  }
  message(value) {
    this.result.message = value;
    return this;
  }
  location(value) {
    this.result.location = value;
    return this;
  }
  line(value) {
    this.result.line = value;
    return this;
  }
  character(value) {
    this.result.character = value;
    return this;
  }
  endLine(value) {
    this.result.endLine = value;
    return this;
  }
  endCharacter(value) {
    this.result.endCharacter = value;
    return this;
  }
  code(value) {
    this.result.code = value;
    return this;
  }
  severity(value) {
    this.result.severity = value;
    return this;
  }
  loop(value) {
    this.result.loop = value;
    return this;
  }
}
class TasksMockContextKeyService extends MockContextKeyService {
  getContext(domNode) {
    return {
      getValue: (_key) => {
        return true;
      }
    };
  }
}
function testDefaultProblemMatcher(external, resolved) {
  const reporter = new ProblemReporter();
  const result = parse(workspaceFolder, workspace, Platform.platform, external, reporter, TaskConfigSource.TasksJson, new TasksMockContextKeyService());
  assert.ok(!reporter.receivedMessage);
  assert.strictEqual(result.custom.length, 1);
  const task = result.custom[0];
  assert.ok(task);
  assert.strictEqual(task.configurationProperties.problemMatchers.length, resolved);
}
function testConfiguration(external, builder) {
  builder.done();
  const reporter = new ProblemReporter();
  const result = parse(workspaceFolder, workspace, Platform.platform, external, reporter, TaskConfigSource.TasksJson, new TasksMockContextKeyService());
  if (reporter.receivedMessage) {
    assert.ok(false, reporter.lastMessage);
  }
  assertConfiguration(result, builder.result);
}
class TaskGroupMap {
  constructor() {
    this._store = /* @__PURE__ */ Object.create(null);
  }
  add(group, task) {
    let tasks = this._store[group];
    if (!tasks) {
      tasks = [];
      this._store[group] = tasks;
    }
    tasks.push(task);
  }
  static assert(actual, expected) {
    const actualKeys = Object.keys(actual._store);
    const expectedKeys = Object.keys(expected._store);
    if (actualKeys.length === 0 && expectedKeys.length === 0) {
      return;
    }
    assert.strictEqual(actualKeys.length, expectedKeys.length);
    actualKeys.forEach((key) => assert.ok(expected._store[key]));
    expectedKeys.forEach((key) => actual._store[key]);
    actualKeys.forEach((key) => {
      const actualTasks = actual._store[key];
      const expectedTasks = expected._store[key];
      assert.strictEqual(actualTasks.length, expectedTasks.length);
      if (actualTasks.length === 1) {
        assert.strictEqual(actualTasks[0].configurationProperties.name, expectedTasks[0].configurationProperties.name);
        return;
      }
      const expectedTaskMap = /* @__PURE__ */ Object.create(null);
      expectedTasks.forEach((task) => expectedTaskMap[task.configurationProperties.name] = true);
      actualTasks.forEach((task) => delete expectedTaskMap[task.configurationProperties.name]);
      assert.strictEqual(Object.keys(expectedTaskMap).length, 0);
    });
  }
}
function assertConfiguration(result, expected) {
  assert.ok(result.validationStatus.isOK());
  const actual = result.custom;
  assert.strictEqual(typeof actual, typeof expected);
  if (!actual) {
    return;
  }
  const actualTasks = /* @__PURE__ */ Object.create(null);
  const actualId2Name = /* @__PURE__ */ Object.create(null);
  const actualTaskGroups = new TaskGroupMap();
  actual.forEach((task) => {
    assert.ok(!actualTasks[task.configurationProperties.name]);
    actualTasks[task.configurationProperties.name] = task;
    actualId2Name[task._id] = task.configurationProperties.name;
    const taskId = Tasks.TaskGroup.from(task.configurationProperties.group)?._id;
    if (taskId) {
      actualTaskGroups.add(taskId, task);
    }
  });
  const expectedTasks = /* @__PURE__ */ Object.create(null);
  const expectedTaskGroup = new TaskGroupMap();
  expected.forEach((task) => {
    assert.ok(!expectedTasks[task.configurationProperties.name]);
    expectedTasks[task.configurationProperties.name] = task;
    const taskId = Tasks.TaskGroup.from(task.configurationProperties.group)?._id;
    if (taskId) {
      expectedTaskGroup.add(taskId, task);
    }
  });
  const actualKeys = Object.keys(actualTasks);
  assert.strictEqual(actualKeys.length, expected.length);
  actualKeys.forEach((key) => {
    const actualTask = actualTasks[key];
    const expectedTask = expectedTasks[key];
    assert.ok(expectedTask);
    assertTask(actualTask, expectedTask);
  });
  TaskGroupMap.assert(actualTaskGroups, expectedTaskGroup);
}
function assertTask(actual, expected) {
  assert.ok(actual._id);
  assert.strictEqual(actual.configurationProperties.name, expected.configurationProperties.name, "name");
  if (!Tasks.InMemoryTask.is(actual) && !Tasks.InMemoryTask.is(expected)) {
    assertCommandConfiguration(actual.command, expected.command);
  }
  assert.strictEqual(actual.configurationProperties.isBackground, expected.configurationProperties.isBackground, "isBackground");
  assert.strictEqual(typeof actual.configurationProperties.problemMatchers, typeof expected.configurationProperties.problemMatchers);
  assert.strictEqual(actual.configurationProperties.promptOnClose, expected.configurationProperties.promptOnClose, "promptOnClose");
  assert.strictEqual(typeof actual.configurationProperties.group, typeof expected.configurationProperties.group, `group types unequal`);
  if (actual.configurationProperties.problemMatchers && expected.configurationProperties.problemMatchers) {
    assert.strictEqual(actual.configurationProperties.problemMatchers.length, expected.configurationProperties.problemMatchers.length);
    for (let i = 0; i < actual.configurationProperties.problemMatchers.length; i++) {
      assertProblemMatcher(actual.configurationProperties.problemMatchers[i], expected.configurationProperties.problemMatchers[i]);
    }
  }
  if (actual.configurationProperties.group && expected.configurationProperties.group) {
    if (Types.isString(actual.configurationProperties.group)) {
      assert.strictEqual(actual.configurationProperties.group, expected.configurationProperties.group);
    } else {
      assertGroup(actual.configurationProperties.group, expected.configurationProperties.group);
    }
  }
}
function assertCommandConfiguration(actual, expected) {
  assert.strictEqual(typeof actual, typeof expected);
  if (actual && expected) {
    assertPresentation(actual.presentation, expected.presentation);
    assert.strictEqual(actual.name, expected.name, "name");
    assert.strictEqual(actual.runtime, expected.runtime, "runtime type");
    assert.strictEqual(actual.suppressTaskName, expected.suppressTaskName, "suppressTaskName");
    assert.strictEqual(actual.taskSelector, expected.taskSelector, "taskSelector");
    assert.deepStrictEqual(actual.args, expected.args, "args");
    assert.strictEqual(typeof actual.options, typeof expected.options);
    if (actual.options && expected.options) {
      assert.strictEqual(actual.options.cwd, expected.options.cwd, "cwd");
      assert.strictEqual(typeof actual.options.env, typeof expected.options.env, "env");
      if (actual.options.env && expected.options.env) {
        assert.deepStrictEqual(actual.options.env, expected.options.env, "env");
      }
    }
  }
}
function assertGroup(actual, expected) {
  assert.strictEqual(typeof actual, typeof expected);
  if (actual && expected) {
    assert.strictEqual(actual._id, expected._id, `group ids unequal. actual: ${actual._id} expected ${expected._id}`);
    assert.strictEqual(actual.isDefault, expected.isDefault, `group defaults unequal. actual: ${actual.isDefault} expected ${expected.isDefault}`);
  }
}
function assertPresentation(actual, expected) {
  assert.strictEqual(typeof actual, typeof expected);
  if (actual && expected) {
    assert.strictEqual(actual.echo, expected.echo);
    assert.strictEqual(actual.reveal, expected.reveal);
  }
}
function assertProblemMatcher(actual, expected) {
  assert.strictEqual(typeof actual, typeof expected);
  if (typeof actual === "string" && typeof expected === "string") {
    assert.strictEqual(actual, expected, "Problem matcher references are different");
    return;
  }
  if (typeof actual !== "string" && typeof expected !== "string") {
    if (expected.owner === ProblemMatcherBuilder.DEFAULT_UUID) {
      assert.ok(UUID.isUUID(actual.owner), "Owner must be a UUID");
    } else {
      assert.strictEqual(actual.owner, expected.owner);
    }
    assert.strictEqual(actual.applyTo, expected.applyTo);
    assert.strictEqual(actual.severity, expected.severity);
    assert.strictEqual(actual.fileLocation, expected.fileLocation);
    assert.strictEqual(actual.filePrefix, expected.filePrefix);
    if (actual.pattern && expected.pattern) {
      assertProblemPatterns(actual.pattern, expected.pattern);
    }
  }
}
function assertProblemPatterns(actual, expected) {
  assert.strictEqual(typeof actual, typeof expected);
  if (Array.isArray(actual)) {
    const actuals = actual;
    const expecteds = expected;
    assert.strictEqual(actuals.length, expecteds.length);
    for (let i = 0; i < actuals.length; i++) {
      assertProblemPattern(actuals[i], expecteds[i]);
    }
  } else {
    assertProblemPattern(actual, expected);
  }
}
function assertProblemPattern(actual, expected) {
  assert.strictEqual(actual.regexp.toString(), expected.regexp.toString());
  assert.strictEqual(actual.file, expected.file);
  assert.strictEqual(actual.message, expected.message);
  if (typeof expected.location !== "undefined") {
    assert.strictEqual(actual.location, expected.location);
  } else {
    assert.strictEqual(actual.line, expected.line);
    assert.strictEqual(actual.character, expected.character);
    assert.strictEqual(actual.endLine, expected.endLine);
    assert.strictEqual(actual.endCharacter, expected.endCharacter);
  }
  assert.strictEqual(actual.code, expected.code);
  assert.strictEqual(actual.severity, expected.severity);
  assert.strictEqual(actual.loop, expected.loop);
}
suite("Tasks version 0.1.0", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("tasks: all default", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true);
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc"
      },
      builder
    );
  });
  test("tasks: global isShellCommand", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).runtime(Tasks.RuntimeType.Shell);
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc",
        isShellCommand: true
      },
      builder
    );
  });
  test("tasks: global show output silent", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).presentation().reveal(Tasks.RevealKind.Silent);
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc",
        showOutput: "silent"
      },
      builder
    );
  });
  test("tasks: global promptOnClose default", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true);
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc",
        promptOnClose: true
      },
      builder
    );
  });
  test("tasks: global promptOnClose", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).promptOnClose(false).command().suppressTaskName(true);
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc",
        promptOnClose: false
      },
      builder
    );
  });
  test("tasks: global promptOnClose default watching", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).isBackground(true).promptOnClose(false).command().suppressTaskName(true);
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc",
        isWatching: true
      },
      builder
    );
  });
  test("tasks: global show output never", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).presentation().reveal(Tasks.RevealKind.Never);
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc",
        showOutput: "never"
      },
      builder
    );
  });
  test("tasks: global echo Command", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).presentation().echo(true);
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc",
        echoCommand: true
      },
      builder
    );
  });
  test("tasks: global args", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).args(["--p"]);
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc",
        args: [
          "--p"
        ]
      },
      builder
    );
  });
  test("tasks: options - cwd", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).options({
      cwd: "myPath"
    });
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc",
        options: {
          cwd: "myPath"
        }
      },
      builder
    );
  });
  test("tasks: options - env", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).options({ cwd: "${workspaceFolder}", env: { key: "value" } });
    testConfiguration(
      {
        version: "0.1.0",
        command: "tsc",
        options: {
          env: {
            key: "value"
          }
        }
      },
      builder
    );
  });
  test("tasks: os windows", () => {
    const name = Platform.isWindows ? "tsc.win" : "tsc";
    const builder = new ConfigurationBuilder();
    builder.task(name, name).group(Tasks.TaskGroup.Build).command().suppressTaskName(true);
    const external = {
      version: "0.1.0",
      command: "tsc",
      windows: {
        command: "tsc.win"
      }
    };
    testConfiguration(external, builder);
  });
  test("tasks: os windows & global isShellCommand", () => {
    const name = Platform.isWindows ? "tsc.win" : "tsc";
    const builder = new ConfigurationBuilder();
    builder.task(name, name).group(Tasks.TaskGroup.Build).command().suppressTaskName(true).runtime(Tasks.RuntimeType.Shell);
    const external = {
      version: "0.1.0",
      command: "tsc",
      isShellCommand: true,
      windows: {
        command: "tsc.win"
      }
    };
    testConfiguration(external, builder);
  });
  test("tasks: os mac", () => {
    const name = Platform.isMacintosh ? "tsc.osx" : "tsc";
    const builder = new ConfigurationBuilder();
    builder.task(name, name).group(Tasks.TaskGroup.Build).command().suppressTaskName(true);
    const external = {
      version: "0.1.0",
      command: "tsc",
      osx: {
        command: "tsc.osx"
      }
    };
    testConfiguration(external, builder);
  });
  test("tasks: os linux", () => {
    const name = Platform.isLinux ? "tsc.linux" : "tsc";
    const builder = new ConfigurationBuilder();
    builder.task(name, name).group(Tasks.TaskGroup.Build).command().suppressTaskName(true);
    const external = {
      version: "0.1.0",
      command: "tsc",
      linux: {
        command: "tsc.linux"
      }
    };
    testConfiguration(external, builder);
  });
  test("tasks: overwrite showOutput", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).presentation().reveal(Platform.isWindows ? Tasks.RevealKind.Always : Tasks.RevealKind.Never);
    const external = {
      version: "0.1.0",
      command: "tsc",
      showOutput: "never",
      windows: {
        showOutput: "always"
      }
    };
    testConfiguration(external, builder);
  });
  test("tasks: overwrite echo Command", () => {
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).presentation().echo(Platform.isWindows ? false : true);
    const external = {
      version: "0.1.0",
      command: "tsc",
      echoCommand: true,
      windows: {
        echoCommand: false
      }
    };
    testConfiguration(external, builder);
  });
  test("tasks: global problemMatcher one", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      problemMatcher: "$msCompile"
    };
    testDefaultProblemMatcher(external, 1);
  });
  test("tasks: global problemMatcher two", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      problemMatcher: ["$eslint-compact", "$msCompile"]
    };
    testDefaultProblemMatcher(external, 2);
  });
  test("tasks: task definition", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").command().args(["$name"]);
    testConfiguration(external, builder);
  });
  test("tasks: build task", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName",
          isBuildCommand: true
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").group(Tasks.TaskGroup.Build).command().args(["$name"]);
    testConfiguration(external, builder);
  });
  test("tasks: default build task", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "build"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("build", "tsc").group(Tasks.TaskGroup.Build).command().args(["$name"]);
    testConfiguration(external, builder);
  });
  test("tasks: test task", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName",
          isTestCommand: true
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").group(Tasks.TaskGroup.Test).command().args(["$name"]);
    testConfiguration(external, builder);
  });
  test("tasks: default test task", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "test"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("test", "tsc").group(Tasks.TaskGroup.Test).command().args(["$name"]);
    testConfiguration(external, builder);
  });
  test("tasks: task with values", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "test",
          showOutput: "never",
          echoCommand: true,
          args: ["--p"],
          isWatching: true
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("test", "tsc").group(Tasks.TaskGroup.Test).isBackground(true).promptOnClose(false).command().args(["$name", "--p"]).presentation().echo(true).reveal(Tasks.RevealKind.Never);
    testConfiguration(external, builder);
  });
  test("tasks: task inherits global values", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      showOutput: "never",
      echoCommand: true,
      tasks: [
        {
          taskName: "test"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("test", "tsc").group(Tasks.TaskGroup.Test).command().args(["$name"]).presentation().echo(true).reveal(Tasks.RevealKind.Never);
    testConfiguration(external, builder);
  });
  test("tasks: problem matcher default", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName",
          problemMatcher: {
            pattern: {
              regexp: "abc"
            }
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").command().args(["$name"]).parent.problemMatcher().pattern(/abc/);
    testConfiguration(external, builder);
  });
  test("tasks: problem matcher .* regular expression", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName",
          problemMatcher: {
            pattern: {
              regexp: ".*"
            }
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").command().args(["$name"]).parent.problemMatcher().pattern(/.*/);
    testConfiguration(external, builder);
  });
  test("tasks: problem matcher owner, applyTo, severity and fileLocation", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName",
          problemMatcher: {
            owner: "myOwner",
            applyTo: "closedDocuments",
            severity: "warning",
            fileLocation: "absolute",
            pattern: {
              regexp: "abc"
            }
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").command().args(["$name"]).parent.problemMatcher().owner("myOwner").applyTo(ApplyToKind.closedDocuments).severity(Severity.Warning).fileLocation(FileLocationKind.Absolute).filePrefix(void 0).pattern(/abc/);
    testConfiguration(external, builder);
  });
  test("tasks: problem matcher fileLocation and filePrefix", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName",
          problemMatcher: {
            fileLocation: ["relative", "myPath"],
            pattern: {
              regexp: "abc"
            }
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").command().args(["$name"]).parent.problemMatcher().fileLocation(FileLocationKind.Relative).filePrefix("myPath").pattern(/abc/);
    testConfiguration(external, builder);
  });
  test("tasks: problem pattern location", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName",
          problemMatcher: {
            pattern: {
              regexp: "abc",
              file: 10,
              message: 11,
              location: 12,
              severity: 13,
              code: 14
            }
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").command().args(["$name"]).parent.problemMatcher().pattern(/abc/).file(10).message(11).location(12).severity(13).code(14);
    testConfiguration(external, builder);
  });
  test("tasks: problem pattern line & column", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName",
          problemMatcher: {
            pattern: {
              regexp: "abc",
              file: 10,
              message: 11,
              line: 12,
              column: 13,
              endLine: 14,
              endColumn: 15,
              severity: 16,
              code: 17
            }
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").command().args(["$name"]).parent.problemMatcher().pattern(/abc/).file(10).message(11).line(12).character(13).endLine(14).endCharacter(15).severity(16).code(17);
    testConfiguration(external, builder);
  });
  test("tasks: prompt on close default", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").promptOnClose(true).command().args(["$name"]);
    testConfiguration(external, builder);
  });
  test("tasks: prompt on close watching", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName",
          isWatching: true
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").isBackground(true).promptOnClose(false).command().args(["$name"]);
    testConfiguration(external, builder);
  });
  test("tasks: prompt on close set", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskName",
          promptOnClose: false
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").promptOnClose(false).command().args(["$name"]);
    testConfiguration(external, builder);
  });
  test("tasks: task selector set", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      taskSelector: "/t:",
      tasks: [
        {
          taskName: "taskName"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").command().taskSelector("/t:").args(["/t:taskName"]);
    testConfiguration(external, builder);
  });
  test("tasks: suppress task name set", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      suppressTaskName: false,
      tasks: [
        {
          taskName: "taskName",
          suppressTaskName: true
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").command().suppressTaskName(true);
    testConfiguration(external, builder);
  });
  test("tasks: suppress task name inherit", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      suppressTaskName: true,
      tasks: [
        {
          taskName: "taskName"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskName", "tsc").command().suppressTaskName(true);
    testConfiguration(external, builder);
  });
  test("tasks: two tasks", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskNameOne"
        },
        {
          taskName: "taskNameTwo"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskNameOne", "tsc").command().args(["$name"]);
    builder.task("taskNameTwo", "tsc").command().args(["$name"]);
    testConfiguration(external, builder);
  });
  test("tasks: with command", () => {
    const external = {
      version: "0.1.0",
      tasks: [
        {
          taskName: "taskNameOne",
          command: "tsc"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskNameOne", "tsc").command().suppressTaskName(true);
    testConfiguration(external, builder);
  });
  test("tasks: two tasks with command", () => {
    const external = {
      version: "0.1.0",
      tasks: [
        {
          taskName: "taskNameOne",
          command: "tsc"
        },
        {
          taskName: "taskNameTwo",
          command: "dir"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskNameOne", "tsc").command().suppressTaskName(true);
    builder.task("taskNameTwo", "dir").command().suppressTaskName(true);
    testConfiguration(external, builder);
  });
  test("tasks: with command and args", () => {
    const external = {
      version: "0.1.0",
      tasks: [
        {
          taskName: "taskNameOne",
          command: "tsc",
          isShellCommand: true,
          args: ["arg"],
          options: {
            cwd: "cwd",
            env: {
              env: "env"
            }
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskNameOne", "tsc").command().suppressTaskName(true).runtime(Tasks.RuntimeType.Shell).args(["arg"]).options({ cwd: "cwd", env: { env: "env" } });
    testConfiguration(external, builder);
  });
  test("tasks: with command os specific", () => {
    const name = Platform.isWindows ? "tsc.win" : "tsc";
    const external = {
      version: "0.1.0",
      tasks: [
        {
          taskName: "taskNameOne",
          command: "tsc",
          windows: {
            command: "tsc.win"
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskNameOne", name).command().suppressTaskName(true);
    testConfiguration(external, builder);
  });
  test("tasks: with Windows specific args", () => {
    const args = Platform.isWindows ? ["arg1", "arg2"] : ["arg1"];
    const external = {
      version: "0.1.0",
      tasks: [
        {
          taskName: "tsc",
          command: "tsc",
          args: ["arg1"],
          windows: {
            args: ["arg2"]
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").command().suppressTaskName(true).args(args);
    testConfiguration(external, builder);
  });
  test("tasks: with Linux specific args", () => {
    const args = Platform.isLinux ? ["arg1", "arg2"] : ["arg1"];
    const external = {
      version: "0.1.0",
      tasks: [
        {
          taskName: "tsc",
          command: "tsc",
          args: ["arg1"],
          linux: {
            args: ["arg2"]
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("tsc", "tsc").command().suppressTaskName(true).args(args);
    testConfiguration(external, builder);
  });
  test("tasks: global command and task command properties", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      tasks: [
        {
          taskName: "taskNameOne",
          isShellCommand: true
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskNameOne", "tsc").command().runtime(Tasks.RuntimeType.Shell).args(["$name"]);
    testConfiguration(external, builder);
  });
  test("tasks: global and tasks args", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      args: ["global"],
      tasks: [
        {
          taskName: "taskNameOne",
          args: ["local"]
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskNameOne", "tsc").command().args(["global", "$name", "local"]);
    testConfiguration(external, builder);
  });
  test("tasks: global and tasks args with task selector", () => {
    const external = {
      version: "0.1.0",
      command: "tsc",
      args: ["global"],
      taskSelector: "/t:",
      tasks: [
        {
          taskName: "taskNameOne",
          args: ["local"]
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("taskNameOne", "tsc").command().taskSelector("/t:").args(["global", "/t:taskNameOne", "local"]);
    testConfiguration(external, builder);
  });
});
suite("Tasks version 2.0.0", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test.skip("Build workspace task", () => {
    const external = {
      version: "2.0.0",
      tasks: [
        {
          taskName: "dir",
          command: "dir",
          type: "shell",
          group: "build"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("dir", "dir").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).runtime(Tasks.RuntimeType.Shell).presentation().echo(true);
    testConfiguration(external, builder);
  });
  test("Global group none", () => {
    const external = {
      version: "2.0.0",
      command: "dir",
      type: "shell",
      group: "none"
    };
    const builder = new ConfigurationBuilder();
    builder.task("dir", "dir").command().suppressTaskName(true).runtime(Tasks.RuntimeType.Shell).presentation().echo(true);
    testConfiguration(external, builder);
  });
  test.skip("Global group build", () => {
    const external = {
      version: "2.0.0",
      command: "dir",
      type: "shell",
      group: "build"
    };
    const builder = new ConfigurationBuilder();
    builder.task("dir", "dir").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).runtime(Tasks.RuntimeType.Shell).presentation().echo(true);
    testConfiguration(external, builder);
  });
  test.skip("Global group default build", () => {
    const external = {
      version: "2.0.0",
      command: "dir",
      type: "shell",
      group: { kind: "build", isDefault: true }
    };
    const builder = new ConfigurationBuilder();
    const taskGroup = Tasks.TaskGroup.Build;
    taskGroup.isDefault = true;
    builder.task("dir", "dir").group(taskGroup).command().suppressTaskName(true).runtime(Tasks.RuntimeType.Shell).presentation().echo(true);
    testConfiguration(external, builder);
  });
  test("Local group none", () => {
    const external = {
      version: "2.0.0",
      tasks: [
        {
          taskName: "dir",
          command: "dir",
          type: "shell",
          group: "none"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("dir", "dir").command().suppressTaskName(true).runtime(Tasks.RuntimeType.Shell).presentation().echo(true);
    testConfiguration(external, builder);
  });
  test.skip("Local group build", () => {
    const external = {
      version: "2.0.0",
      tasks: [
        {
          taskName: "dir",
          command: "dir",
          type: "shell",
          group: "build"
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("dir", "dir").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).runtime(Tasks.RuntimeType.Shell).presentation().echo(true);
    testConfiguration(external, builder);
  });
  test.skip("Local group default build", () => {
    const external = {
      version: "2.0.0",
      tasks: [
        {
          taskName: "dir",
          command: "dir",
          type: "shell",
          group: { kind: "build", isDefault: true }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    const taskGroup = Tasks.TaskGroup.Build;
    taskGroup.isDefault = true;
    builder.task("dir", "dir").group(taskGroup).command().suppressTaskName(true).runtime(Tasks.RuntimeType.Shell).presentation().echo(true);
    testConfiguration(external, builder);
  });
  test("Arg overwrite", () => {
    const external = {
      version: "2.0.0",
      tasks: [
        {
          label: "echo",
          type: "shell",
          command: "echo",
          args: [
            "global"
          ],
          windows: {
            args: [
              "windows"
            ]
          },
          linux: {
            args: [
              "linux"
            ]
          },
          osx: {
            args: [
              "osx"
            ]
          }
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    if (Platform.isWindows) {
      builder.task("echo", "echo").command().suppressTaskName(true).args(["windows"]).runtime(Tasks.RuntimeType.Shell).presentation().echo(true);
      testConfiguration(external, builder);
    } else if (Platform.isLinux) {
      builder.task("echo", "echo").command().suppressTaskName(true).args(["linux"]).runtime(Tasks.RuntimeType.Shell).presentation().echo(true);
      testConfiguration(external, builder);
    } else if (Platform.isMacintosh) {
      builder.task("echo", "echo").command().suppressTaskName(true).args(["osx"]).runtime(Tasks.RuntimeType.Shell).presentation().echo(true);
      testConfiguration(external, builder);
    }
  });
});
suite("Bugs / regression tests", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  (Platform.isLinux ? test.skip : test)("Bug 19548", () => {
    const external = {
      version: "0.1.0",
      windows: {
        command: "powershell",
        options: {
          cwd: "${workspaceFolder}"
        },
        tasks: [
          {
            taskName: "composeForDebug",
            suppressTaskName: true,
            args: [
              "-ExecutionPolicy",
              "RemoteSigned",
              ".\\dockerTask.ps1",
              "-ComposeForDebug",
              "-Environment",
              "debug"
            ],
            isBuildCommand: false,
            showOutput: "always",
            echoCommand: true
          }
        ]
      },
      osx: {
        command: "/bin/bash",
        options: {
          cwd: "${workspaceFolder}"
        },
        tasks: [
          {
            taskName: "composeForDebug",
            suppressTaskName: true,
            args: [
              "-c",
              "./dockerTask.sh composeForDebug debug"
            ],
            isBuildCommand: false,
            showOutput: "always"
          }
        ]
      }
    };
    const builder = new ConfigurationBuilder();
    if (Platform.isWindows) {
      builder.task("composeForDebug", "powershell").command().suppressTaskName(true).args(["-ExecutionPolicy", "RemoteSigned", ".\\dockerTask.ps1", "-ComposeForDebug", "-Environment", "debug"]).options({ cwd: "${workspaceFolder}" }).presentation().echo(true).reveal(Tasks.RevealKind.Always);
      testConfiguration(external, builder);
    } else if (Platform.isMacintosh) {
      builder.task("composeForDebug", "/bin/bash").command().suppressTaskName(true).args(["-c", "./dockerTask.sh composeForDebug debug"]).options({ cwd: "${workspaceFolder}" }).presentation().reveal(Tasks.RevealKind.Always);
      testConfiguration(external, builder);
    }
  });
  test("Bug 28489", () => {
    const external = {
      version: "0.1.0",
      command: "",
      isShellCommand: true,
      args: [""],
      showOutput: "always",
      "tasks": [
        {
          taskName: "build",
          command: "bash",
          args: [
            "build.sh"
          ]
        }
      ]
    };
    const builder = new ConfigurationBuilder();
    builder.task("build", "bash").group(Tasks.TaskGroup.Build).command().suppressTaskName(true).args(["build.sh"]).runtime(Tasks.RuntimeType.Shell);
    testConfiguration(external, builder);
  });
});
class TestNamedProblemMatcher {
}
class TestParseContext {
}
class TestTaskDefinitionRegistry {
  get(key) {
    return this._task;
  }
  set(task) {
    this._task = task;
  }
}
suite("Task configuration conversions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const globals = {};
  const taskConfigSource = {};
  const TaskDefinitionRegistry = new TestTaskDefinitionRegistry();
  let instantiationService;
  let parseContext;
  let namedProblemMatcher;
  let problemReporter;
  setup(() => {
    instantiationService = new TestInstantiationService();
    namedProblemMatcher = instantiationService.createInstance(TestNamedProblemMatcher);
    namedProblemMatcher.name = "real";
    namedProblemMatcher.label = "real label";
    problemReporter = new ProblemReporter();
    parseContext = instantiationService.createInstance(TestParseContext);
    parseContext.problemReporter = problemReporter;
    parseContext.namedProblemMatchers = { "real": namedProblemMatcher };
    parseContext.uuidMap = new UUIDMap();
  });
  teardown(() => {
    instantiationService.dispose();
  });
  suite("ProblemMatcherConverter.from", () => {
    test("returns [] and an error for an unknown problem matcher", () => {
      const result = ProblemMatcherConverter.from("$fake", parseContext);
      assert.deepEqual(result.value, []);
      assert.strictEqual(result.errors?.length, 1);
    });
    test("returns config for a known problem matcher", () => {
      const result = ProblemMatcherConverter.from("$real", parseContext);
      assert.strictEqual(result.errors?.length, 0);
      assert.deepEqual(result.value, [{ "label": "real label" }]);
    });
    test("returns config for a known problem matcher including applyTo", () => {
      namedProblemMatcher.applyTo = ApplyToKind.closedDocuments;
      const result = ProblemMatcherConverter.from("$real", parseContext);
      assert.strictEqual(result.errors?.length, 0);
      assert.deepEqual(result.value, [{ "label": "real label", "applyTo": ApplyToKind.closedDocuments }]);
    });
  });
  suite("TaskParser.from", () => {
    suite("CustomTask", () => {
      suite("incomplete config reports an appropriate error for missing", () => {
        test("name", () => {
          const result = TaskParser.from([{}], globals, parseContext, taskConfigSource);
          assertTaskParseResult(result, void 0, problemReporter, "Error: a task must provide a label property");
        });
        test("command", () => {
          const result = TaskParser.from([{ taskName: "task" }], globals, parseContext, taskConfigSource);
          assertTaskParseResult(result, void 0, problemReporter, `Error: the task 'task' doesn't define a command`);
        });
      });
      test("returns expected result", () => {
        const expected = [
          { taskName: "task", command: "echo test" },
          { taskName: "task 2", command: "echo test" }
        ];
        const result = TaskParser.from(expected, globals, parseContext, taskConfigSource);
        assertTaskParseResult(result, { custom: expected }, problemReporter, void 0);
      });
    });
    suite("ConfiguredTask", () => {
      test("returns expected result", () => {
        const expected = [{ taskName: "task", command: "echo test", type: "any", label: "task" }, { taskName: "task 2", command: "echo test", type: "any", label: "task 2" }];
        TaskDefinitionRegistry.set({ extensionId: "registered", taskType: "any", properties: {} });
        const result = TaskParser.from(expected, globals, parseContext, taskConfigSource, TaskDefinitionRegistry);
        assertTaskParseResult(result, { configured: expected }, problemReporter, void 0);
      });
    });
  });
});
function assertTaskParseResult(actual, expected, problemReporter, expectedMessage) {
  if (expectedMessage === void 0) {
    assert.strictEqual(problemReporter.lastMessage, void 0);
  } else {
    assert.ok(problemReporter.lastMessage?.includes(expectedMessage));
  }
  assert.deepEqual(actual.custom.length, expected?.custom?.length || 0);
  assert.deepEqual(actual.configured.length, expected?.configured?.length || 0);
  let index = 0;
  if (expected?.configured) {
    for (const taskParseResult of expected?.configured) {
      assert.strictEqual(actual.configured[index]._label, taskParseResult.label);
      index++;
    }
  }
  index = 0;
  if (expected?.custom) {
    for (const taskParseResult of expected?.custom) {
      assert.strictEqual(actual.custom[index]._label, taskParseResult.taskName);
      index++;
    }
  }
  problemReporter.clearMessage();
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFx0ZXN0XFxjb21tb25cXHRhc2tDb25maWd1cmF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgKiBhcyBVVUlEIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuXG5pbXBvcnQgKiBhcyBUeXBlcyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBQbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBWYWxpZGF0aW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBQcm9ibGVtTWF0Y2hlciwgRmlsZUxvY2F0aW9uS2luZCwgSVByb2JsZW1QYXR0ZXJuLCBBcHBseVRvS2luZCwgSU5hbWVkUHJvYmxlbU1hdGNoZXIgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvYmxlbU1hdGNoZXIuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuXG5pbXBvcnQgKiBhcyBUYXNrcyBmcm9tICcuLi8uLi9jb21tb24vdGFza3MuanMnO1xuaW1wb3J0IHsgcGFyc2UsIElQYXJzZVJlc3VsdCwgSVByb2JsZW1SZXBvcnRlciwgSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24sIElDdXN0b21UYXNrLCBUYXNrQ29uZmlnU291cmNlLCBJUGFyc2VDb250ZXh0LCBQcm9ibGVtTWF0Y2hlckNvbnZlcnRlciwgSUdsb2JhbHMsIElUYXNrUGFyc2VSZXN1bHQsIFVVSURNYXAsIFRhc2tQYXJzZXIgfSBmcm9tICcuLi8uLi9jb21tb24vdGFza0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS90ZXN0L2NvbW1vbi90ZXN0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rhc2tEZWZpbml0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmNvbnN0IHdvcmtzcGFjZUZvbGRlcjogV29ya3NwYWNlRm9sZGVyID0gbmV3IFdvcmtzcGFjZUZvbGRlcih7XG5cdHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvZm9sZGVyT25lJyksXG5cdG5hbWU6ICdmb2xkZXJPbmUnLFxuXHRpbmRleDogMFxufSk7XG5cbmNvbnN0IHdvcmtzcGFjZTogSVdvcmtzcGFjZSA9IG5ldyBXb3Jrc3BhY2UoJ2lkJywgW3dvcmtzcGFjZUZvbGRlcl0pO1xuXG5jbGFzcyBQcm9ibGVtUmVwb3J0ZXIgaW1wbGVtZW50cyBJUHJvYmxlbVJlcG9ydGVyIHtcblxuXHRwcml2YXRlIF92YWxpZGF0aW9uU3RhdHVzOiBWYWxpZGF0aW9uU3RhdHVzID0gbmV3IFZhbGlkYXRpb25TdGF0dXMoKTtcblxuXHRwdWJsaWMgcmVjZWl2ZWRNZXNzYWdlOiBib29sZWFuID0gZmFsc2U7XG5cdHB1YmxpYyBsYXN0TWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBpbmZvKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubG9nKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIHdhcm4obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sb2cobWVzc2FnZSk7XG5cdH1cblxuXHRwdWJsaWMgZXJyb3IobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sb2cobWVzc2FnZSk7XG5cdH1cblxuXHRwdWJsaWMgZmF0YWwobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sb2cobWVzc2FnZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHN0YXR1cygpOiBWYWxpZGF0aW9uU3RhdHVzIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsaWRhdGlvblN0YXR1cztcblx0fVxuXG5cdHByaXZhdGUgbG9nKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucmVjZWl2ZWRNZXNzYWdlID0gdHJ1ZTtcblx0XHR0aGlzLmxhc3RNZXNzYWdlID0gbWVzc2FnZTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhck1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0TWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBDb25maWd1cmF0aW9uQnVpbGRlciB7XG5cblx0cHVibGljIHJlc3VsdDogVGFza3MuVGFza1tdO1xuXHRwcml2YXRlIGJ1aWxkZXJzOiBDdXN0b21UYXNrQnVpbGRlcltdO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMucmVzdWx0ID0gW107XG5cdFx0dGhpcy5idWlsZGVycyA9IFtdO1xuXHR9XG5cblx0cHVibGljIHRhc2sobmFtZTogc3RyaW5nLCBjb21tYW5kOiBzdHJpbmcpOiBDdXN0b21UYXNrQnVpbGRlciB7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDdXN0b21UYXNrQnVpbGRlcih0aGlzLCBuYW1lLCBjb21tYW5kKTtcblx0XHR0aGlzLmJ1aWxkZXJzLnB1c2goYnVpbGRlcik7XG5cdFx0dGhpcy5yZXN1bHQucHVzaChidWlsZGVyLnJlc3VsdCk7XG5cdFx0cmV0dXJuIGJ1aWxkZXI7XG5cdH1cblxuXHRwdWJsaWMgZG9uZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGJ1aWxkZXIgb2YgdGhpcy5idWlsZGVycykge1xuXHRcdFx0YnVpbGRlci5kb25lKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFByZXNlbnRhdGlvbkJ1aWxkZXIge1xuXG5cdHB1YmxpYyByZXN1bHQ6IFRhc2tzLklQcmVzZW50YXRpb25PcHRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBwYXJlbnQ6IENvbW1hbmRDb25maWd1cmF0aW9uQnVpbGRlcikge1xuXHRcdHRoaXMucmVzdWx0ID0geyBlY2hvOiBmYWxzZSwgcmV2ZWFsOiBUYXNrcy5SZXZlYWxLaW5kLkFsd2F5cywgcmV2ZWFsUHJvYmxlbXM6IFRhc2tzLlJldmVhbFByb2JsZW1LaW5kLk5ldmVyLCBmb2N1czogZmFsc2UsIHBhbmVsOiBUYXNrcy5QYW5lbEtpbmQuU2hhcmVkLCBzaG93UmV1c2VNZXNzYWdlOiB0cnVlLCBjbGVhcjogZmFsc2UsIGNsb3NlOiBmYWxzZSB9O1xuXHR9XG5cblx0cHVibGljIGVjaG8odmFsdWU6IGJvb2xlYW4pOiBQcmVzZW50YXRpb25CdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC5lY2hvID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsKHZhbHVlOiBUYXNrcy5SZXZlYWxLaW5kKTogUHJlc2VudGF0aW9uQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQucmV2ZWFsID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXModmFsdWU6IGJvb2xlYW4pOiBQcmVzZW50YXRpb25CdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC5mb2N1cyA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGluc3RhbmNlKHZhbHVlOiBUYXNrcy5QYW5lbEtpbmQpOiBQcmVzZW50YXRpb25CdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC5wYW5lbCA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIHNob3dSZXVzZU1lc3NhZ2UodmFsdWU6IGJvb2xlYW4pOiBQcmVzZW50YXRpb25CdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC5zaG93UmV1c2VNZXNzYWdlID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgY2xvc2UodmFsdWU6IGJvb2xlYW4pOiBQcmVzZW50YXRpb25CdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC5jbG9zZSA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGRvbmUoKTogdm9pZCB7XG5cdH1cbn1cblxuY2xhc3MgQ29tbWFuZENvbmZpZ3VyYXRpb25CdWlsZGVyIHtcblx0cHVibGljIHJlc3VsdDogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uO1xuXG5cdHByaXZhdGUgcHJlc2VudGF0aW9uQnVpbGRlcjogUHJlc2VudGF0aW9uQnVpbGRlcjtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcGFyZW50OiBDdXN0b21UYXNrQnVpbGRlciwgY29tbWFuZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5wcmVzZW50YXRpb25CdWlsZGVyID0gbmV3IFByZXNlbnRhdGlvbkJ1aWxkZXIodGhpcyk7XG5cdFx0dGhpcy5yZXN1bHQgPSB7XG5cdFx0XHRuYW1lOiBjb21tYW5kLFxuXHRcdFx0cnVudGltZTogVGFza3MuUnVudGltZVR5cGUuUHJvY2Vzcyxcblx0XHRcdGFyZ3M6IFtdLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRjd2Q6ICcke3dvcmtzcGFjZUZvbGRlcn0nXG5cdFx0XHR9LFxuXHRcdFx0cHJlc2VudGF0aW9uOiB0aGlzLnByZXNlbnRhdGlvbkJ1aWxkZXIucmVzdWx0LFxuXHRcdFx0c3VwcHJlc3NUYXNrTmFtZTogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIG5hbWUodmFsdWU6IHN0cmluZyk6IENvbW1hbmRDb25maWd1cmF0aW9uQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQubmFtZSA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIHJ1bnRpbWUodmFsdWU6IFRhc2tzLlJ1bnRpbWVUeXBlKTogQ29tbWFuZENvbmZpZ3VyYXRpb25CdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC5ydW50aW1lID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgYXJncyh2YWx1ZTogc3RyaW5nW10pOiBDb21tYW5kQ29uZmlndXJhdGlvbkJ1aWxkZXIge1xuXHRcdHRoaXMucmVzdWx0LmFyZ3MgPSB2YWx1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBvcHRpb25zKHZhbHVlOiBUYXNrcy5Db21tYW5kT3B0aW9ucyk6IENvbW1hbmRDb25maWd1cmF0aW9uQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQub3B0aW9ucyA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIHRhc2tTZWxlY3Rvcih2YWx1ZTogc3RyaW5nKTogQ29tbWFuZENvbmZpZ3VyYXRpb25CdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC50YXNrU2VsZWN0b3IgPSB2YWx1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBzdXBwcmVzc1Rhc2tOYW1lKHZhbHVlOiBib29sZWFuKTogQ29tbWFuZENvbmZpZ3VyYXRpb25CdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC5zdXBwcmVzc1Rhc2tOYW1lID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgcHJlc2VudGF0aW9uKCk6IFByZXNlbnRhdGlvbkJ1aWxkZXIge1xuXHRcdHJldHVybiB0aGlzLnByZXNlbnRhdGlvbkJ1aWxkZXI7XG5cdH1cblxuXHRwdWJsaWMgZG9uZSh0YXNrTmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5yZXN1bHQuYXJncyA9IHRoaXMucmVzdWx0LmFyZ3MhLm1hcChhcmcgPT4gYXJnID09PSAnJG5hbWUnID8gdGFza05hbWUgOiBhcmcpO1xuXHRcdHRoaXMucHJlc2VudGF0aW9uQnVpbGRlci5kb25lKCk7XG5cdH1cbn1cblxuY2xhc3MgQ3VzdG9tVGFza0J1aWxkZXIge1xuXG5cdHB1YmxpYyByZXN1bHQ6IFRhc2tzLkN1c3RvbVRhc2s7XG5cdHByaXZhdGUgY29tbWFuZEJ1aWxkZXI6IENvbW1hbmRDb25maWd1cmF0aW9uQnVpbGRlcjtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcGFyZW50OiBDb25maWd1cmF0aW9uQnVpbGRlciwgbmFtZTogc3RyaW5nLCBjb21tYW5kOiBzdHJpbmcpIHtcblx0XHR0aGlzLmNvbW1hbmRCdWlsZGVyID0gbmV3IENvbW1hbmRDb25maWd1cmF0aW9uQnVpbGRlcih0aGlzLCBjb21tYW5kKTtcblx0XHR0aGlzLnJlc3VsdCA9IG5ldyBUYXNrcy5DdXN0b21UYXNrKFxuXHRcdFx0bmFtZSxcblx0XHRcdHsga2luZDogVGFza3MuVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlLCBsYWJlbDogJ3dvcmtzcGFjZScsIGNvbmZpZzogeyB3b3Jrc3BhY2VGb2xkZXI6IHdvcmtzcGFjZUZvbGRlciwgZWxlbWVudDogdW5kZWZpbmVkLCBpbmRleDogLTEsIGZpbGU6ICcudnNjb2RlL3Rhc2tzLmpzb24nIH0gfSxcblx0XHRcdG5hbWUsXG5cdFx0XHRUYXNrcy5DVVNUT01JWkVEX1RBU0tfVFlQRSxcblx0XHRcdHRoaXMuY29tbWFuZEJ1aWxkZXIucmVzdWx0LFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR7IHJlZXZhbHVhdGVPblJlcnVuOiB0cnVlIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkZW50aWZpZXI6IG5hbWUsXG5cdFx0XHRcdG5hbWU6IG5hbWUsXG5cdFx0XHRcdGlzQmFja2dyb3VuZDogZmFsc2UsXG5cdFx0XHRcdHByb21wdE9uQ2xvc2U6IHRydWUsXG5cdFx0XHRcdHByb2JsZW1NYXRjaGVyczogW10sXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBpZGVudGlmaWVyKHZhbHVlOiBzdHJpbmcpOiBDdXN0b21UYXNrQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllciA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGdyb3VwKHZhbHVlOiBzdHJpbmcgfCBUYXNrcy5UYXNrR3JvdXApOiBDdXN0b21UYXNrQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPSB2YWx1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBpc0JhY2tncm91bmQodmFsdWU6IGJvb2xlYW4pOiBDdXN0b21UYXNrQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgcHJvbXB0T25DbG9zZSh2YWx1ZTogYm9vbGVhbik6IEN1c3RvbVRhc2tCdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9tcHRPbkNsb3NlID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgcHJvYmxlbU1hdGNoZXIoKTogUHJvYmxlbU1hdGNoZXJCdWlsZGVyIHtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IFByb2JsZW1NYXRjaGVyQnVpbGRlcih0aGlzKTtcblx0XHR0aGlzLnJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMhLnB1c2goYnVpbGRlci5yZXN1bHQpO1xuXHRcdHJldHVybiBidWlsZGVyO1xuXHR9XG5cblx0cHVibGljIGNvbW1hbmQoKTogQ29tbWFuZENvbmZpZ3VyYXRpb25CdWlsZGVyIHtcblx0XHRyZXR1cm4gdGhpcy5jb21tYW5kQnVpbGRlcjtcblx0fVxuXG5cdHB1YmxpYyBkb25lKCk6IHZvaWQge1xuXHRcdHRoaXMuY29tbWFuZEJ1aWxkZXIuZG9uZSh0aGlzLnJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lISk7XG5cdH1cbn1cblxuY2xhc3MgUHJvYmxlbU1hdGNoZXJCdWlsZGVyIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IERFRkFVTFRfVVVJRCA9IFVVSUQuZ2VuZXJhdGVVdWlkKCk7XG5cblx0cHVibGljIHJlc3VsdDogUHJvYmxlbU1hdGNoZXI7XG5cblx0Y29uc3RydWN0b3IocHVibGljIHBhcmVudDogQ3VzdG9tVGFza0J1aWxkZXIpIHtcblx0XHR0aGlzLnJlc3VsdCA9IHtcblx0XHRcdG93bmVyOiBQcm9ibGVtTWF0Y2hlckJ1aWxkZXIuREVGQVVMVF9VVUlELFxuXHRcdFx0YXBwbHlUbzogQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzLFxuXHRcdFx0c2V2ZXJpdHk6IHVuZGVmaW5lZCxcblx0XHRcdGZpbGVMb2NhdGlvbjogRmlsZUxvY2F0aW9uS2luZC5SZWxhdGl2ZSxcblx0XHRcdGZpbGVQcmVmaXg6ICcke3dvcmtzcGFjZUZvbGRlcn0nLFxuXHRcdFx0cGF0dGVybjogdW5kZWZpbmVkIVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgb3duZXIodmFsdWU6IHN0cmluZyk6IFByb2JsZW1NYXRjaGVyQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQub3duZXIgPSB2YWx1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBhcHBseVRvKHZhbHVlOiBBcHBseVRvS2luZCk6IFByb2JsZW1NYXRjaGVyQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQuYXBwbHlUbyA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIHNldmVyaXR5KHZhbHVlOiBTZXZlcml0eSk6IFByb2JsZW1NYXRjaGVyQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQuc2V2ZXJpdHkgPSB2YWx1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBmaWxlTG9jYXRpb24odmFsdWU6IEZpbGVMb2NhdGlvbktpbmQpOiBQcm9ibGVtTWF0Y2hlckJ1aWxkZXIge1xuXHRcdHRoaXMucmVzdWx0LmZpbGVMb2NhdGlvbiA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGZpbGVQcmVmaXgodmFsdWU6IHN0cmluZyk6IFByb2JsZW1NYXRjaGVyQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQuZmlsZVByZWZpeCA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIHBhdHRlcm4ocmVnRXhwOiBSZWdFeHApOiBQYXR0ZXJuQnVpbGRlciB7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBQYXR0ZXJuQnVpbGRlcih0aGlzLCByZWdFeHApO1xuXHRcdGlmICghdGhpcy5yZXN1bHQucGF0dGVybikge1xuXHRcdFx0dGhpcy5yZXN1bHQucGF0dGVybiA9IGJ1aWxkZXIucmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gYnVpbGRlcjtcblx0fVxufVxuXG5jbGFzcyBQYXR0ZXJuQnVpbGRlciB7XG5cdHB1YmxpYyByZXN1bHQ6IElQcm9ibGVtUGF0dGVybjtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcGFyZW50OiBQcm9ibGVtTWF0Y2hlckJ1aWxkZXIsIHJlZ0V4cDogUmVnRXhwKSB7XG5cdFx0dGhpcy5yZXN1bHQgPSB7XG5cdFx0XHRyZWdleHA6IHJlZ0V4cCxcblx0XHRcdGZpbGU6IDEsXG5cdFx0XHRtZXNzYWdlOiAwLFxuXHRcdFx0bGluZTogMixcblx0XHRcdGNoYXJhY3RlcjogM1xuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZmlsZSh2YWx1ZTogbnVtYmVyKTogUGF0dGVybkJ1aWxkZXIge1xuXHRcdHRoaXMucmVzdWx0LmZpbGUgPSB2YWx1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBtZXNzYWdlKHZhbHVlOiBudW1iZXIpOiBQYXR0ZXJuQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQubWVzc2FnZSA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGxvY2F0aW9uKHZhbHVlOiBudW1iZXIpOiBQYXR0ZXJuQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQubG9jYXRpb24gPSB2YWx1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBsaW5lKHZhbHVlOiBudW1iZXIpOiBQYXR0ZXJuQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQubGluZSA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGNoYXJhY3Rlcih2YWx1ZTogbnVtYmVyKTogUGF0dGVybkJ1aWxkZXIge1xuXHRcdHRoaXMucmVzdWx0LmNoYXJhY3RlciA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGVuZExpbmUodmFsdWU6IG51bWJlcik6IFBhdHRlcm5CdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC5lbmRMaW5lID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgZW5kQ2hhcmFjdGVyKHZhbHVlOiBudW1iZXIpOiBQYXR0ZXJuQnVpbGRlciB7XG5cdFx0dGhpcy5yZXN1bHQuZW5kQ2hhcmFjdGVyID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgY29kZSh2YWx1ZTogbnVtYmVyKTogUGF0dGVybkJ1aWxkZXIge1xuXHRcdHRoaXMucmVzdWx0LmNvZGUgPSB2YWx1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBzZXZlcml0eSh2YWx1ZTogbnVtYmVyKTogUGF0dGVybkJ1aWxkZXIge1xuXHRcdHRoaXMucmVzdWx0LnNldmVyaXR5ID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgbG9vcCh2YWx1ZTogYm9vbGVhbik6IFBhdHRlcm5CdWlsZGVyIHtcblx0XHR0aGlzLnJlc3VsdC5sb29wID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn1cblxuY2xhc3MgVGFza3NNb2NrQ29udGV4dEtleVNlcnZpY2UgZXh0ZW5kcyBNb2NrQ29udGV4dEtleVNlcnZpY2Uge1xuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0Q29udGV4dChkb21Ob2RlOiBIVE1MRWxlbWVudCk6IElDb250ZXh0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0VmFsdWU6IDxUPihfa2V5OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0cmV0dXJuIDxUPjx1bmtub3duPnRydWU7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiB0ZXN0RGVmYXVsdFByb2JsZW1NYXRjaGVyKGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiwgcmVzb2x2ZWQ6IG51bWJlcikge1xuXHRjb25zdCByZXBvcnRlciA9IG5ldyBQcm9ibGVtUmVwb3J0ZXIoKTtcblx0Y29uc3QgcmVzdWx0ID0gcGFyc2Uod29ya3NwYWNlRm9sZGVyLCB3b3Jrc3BhY2UsIFBsYXRmb3JtLnBsYXRmb3JtLCBleHRlcm5hbCwgcmVwb3J0ZXIsIFRhc2tDb25maWdTb3VyY2UuVGFza3NKc29uLCBuZXcgVGFza3NNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdGFzc2VydC5vayghcmVwb3J0ZXIucmVjZWl2ZWRNZXNzYWdlKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jdXN0b20ubGVuZ3RoLCAxKTtcblx0Y29uc3QgdGFzayA9IHJlc3VsdC5jdXN0b21bMF07XG5cdGFzc2VydC5vayh0YXNrKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzIS5sZW5ndGgsIHJlc29sdmVkKTtcbn1cblxuZnVuY3Rpb24gdGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uLCBidWlsZGVyOiBDb25maWd1cmF0aW9uQnVpbGRlcik6IHZvaWQge1xuXHRidWlsZGVyLmRvbmUoKTtcblx0Y29uc3QgcmVwb3J0ZXIgPSBuZXcgUHJvYmxlbVJlcG9ydGVyKCk7XG5cdGNvbnN0IHJlc3VsdCA9IHBhcnNlKHdvcmtzcGFjZUZvbGRlciwgd29ya3NwYWNlLCBQbGF0Zm9ybS5wbGF0Zm9ybSwgZXh0ZXJuYWwsIHJlcG9ydGVyLCBUYXNrQ29uZmlnU291cmNlLlRhc2tzSnNvbiwgbmV3IFRhc2tzTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRpZiAocmVwb3J0ZXIucmVjZWl2ZWRNZXNzYWdlKSB7XG5cdFx0YXNzZXJ0Lm9rKGZhbHNlLCByZXBvcnRlci5sYXN0TWVzc2FnZSk7XG5cdH1cblx0YXNzZXJ0Q29uZmlndXJhdGlvbihyZXN1bHQsIGJ1aWxkZXIucmVzdWx0KTtcbn1cblxuY2xhc3MgVGFza0dyb3VwTWFwIHtcblx0cHJpdmF0ZSBfc3RvcmU6IHsgW2tleTogc3RyaW5nXTogVGFza3MuVGFza1tdIH07XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fc3RvcmUgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHR9XG5cblx0cHVibGljIGFkZChncm91cDogc3RyaW5nLCB0YXNrOiBUYXNrcy5UYXNrKTogdm9pZCB7XG5cdFx0bGV0IHRhc2tzID0gdGhpcy5fc3RvcmVbZ3JvdXBdO1xuXHRcdGlmICghdGFza3MpIHtcblx0XHRcdHRhc2tzID0gW107XG5cdFx0XHR0aGlzLl9zdG9yZVtncm91cF0gPSB0YXNrcztcblx0XHR9XG5cdFx0dGFza3MucHVzaCh0YXNrKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgYXNzZXJ0KGFjdHVhbDogVGFza0dyb3VwTWFwLCBleHBlY3RlZDogVGFza0dyb3VwTWFwKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0dWFsS2V5cyA9IE9iamVjdC5rZXlzKGFjdHVhbC5fc3RvcmUpO1xuXHRcdGNvbnN0IGV4cGVjdGVkS2V5cyA9IE9iamVjdC5rZXlzKGV4cGVjdGVkLl9zdG9yZSk7XG5cdFx0aWYgKGFjdHVhbEtleXMubGVuZ3RoID09PSAwICYmIGV4cGVjdGVkS2V5cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbEtleXMubGVuZ3RoLCBleHBlY3RlZEtleXMubGVuZ3RoKTtcblx0XHRhY3R1YWxLZXlzLmZvckVhY2goa2V5ID0+IGFzc2VydC5vayhleHBlY3RlZC5fc3RvcmVba2V5XSkpO1xuXHRcdGV4cGVjdGVkS2V5cy5mb3JFYWNoKGtleSA9PiBhY3R1YWwuX3N0b3JlW2tleV0pO1xuXHRcdGFjdHVhbEtleXMuZm9yRWFjaCgoa2V5KSA9PiB7XG5cdFx0XHRjb25zdCBhY3R1YWxUYXNrcyA9IGFjdHVhbC5fc3RvcmVba2V5XTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkVGFza3MgPSBleHBlY3RlZC5fc3RvcmVba2V5XTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxUYXNrcy5sZW5ndGgsIGV4cGVjdGVkVGFza3MubGVuZ3RoKTtcblx0XHRcdGlmIChhY3R1YWxUYXNrcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFRhc2tzWzBdLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUsIGV4cGVjdGVkVGFza3NbMF0uY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4cGVjdGVkVGFza01hcDogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0ZXhwZWN0ZWRUYXNrcy5mb3JFYWNoKHRhc2sgPT4gZXhwZWN0ZWRUYXNrTWFwW3Rhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSFdID0gdHJ1ZSk7XG5cdFx0XHRhY3R1YWxUYXNrcy5mb3JFYWNoKHRhc2sgPT4gZGVsZXRlIGV4cGVjdGVkVGFza01hcFt0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUhXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0LmtleXMoZXhwZWN0ZWRUYXNrTWFwKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFzc2VydENvbmZpZ3VyYXRpb24ocmVzdWx0OiBJUGFyc2VSZXN1bHQsIGV4cGVjdGVkOiBUYXNrcy5UYXNrW10pOiB2b2lkIHtcblx0YXNzZXJ0Lm9rKHJlc3VsdC52YWxpZGF0aW9uU3RhdHVzLmlzT0soKSk7XG5cdGNvbnN0IGFjdHVhbCA9IHJlc3VsdC5jdXN0b207XG5cdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgYWN0dWFsLCB0eXBlb2YgZXhwZWN0ZWQpO1xuXHRpZiAoIWFjdHVhbCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIFdlIGNhbid0IGNvbXBhcmUgSWRzIHNpbmNlIHRoZSBwYXJzZXIgdXNlcyBVVUlEIHdoaWNoIGFyZSByYW5kb21cblx0Ly8gU28gY3JlYXRlIGEgbmV3IG1hcCB1c2luZyB0aGUgbmFtZS5cblx0Y29uc3QgYWN0dWFsVGFza3M6IHsgW2tleTogc3RyaW5nXTogVGFza3MuVGFzayB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0Y29uc3QgYWN0dWFsSWQyTmFtZTogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdGNvbnN0IGFjdHVhbFRhc2tHcm91cHMgPSBuZXcgVGFza0dyb3VwTWFwKCk7XG5cdGFjdHVhbC5mb3JFYWNoKHRhc2sgPT4ge1xuXHRcdGFzc2VydC5vayghYWN0dWFsVGFza3NbdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lIV0pO1xuXHRcdGFjdHVhbFRhc2tzW3Rhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSFdID0gdGFzaztcblx0XHRhY3R1YWxJZDJOYW1lW3Rhc2suX2lkXSA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSE7XG5cblx0XHRjb25zdCB0YXNrSWQgPSBUYXNrcy5UYXNrR3JvdXAuZnJvbSh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwKT8uX2lkO1xuXHRcdGlmICh0YXNrSWQpIHtcblx0XHRcdGFjdHVhbFRhc2tHcm91cHMuYWRkKHRhc2tJZCwgdGFzayk7XG5cdFx0fVxuXHR9KTtcblx0Y29uc3QgZXhwZWN0ZWRUYXNrczogeyBba2V5OiBzdHJpbmddOiBUYXNrcy5UYXNrIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRjb25zdCBleHBlY3RlZFRhc2tHcm91cCA9IG5ldyBUYXNrR3JvdXBNYXAoKTtcblx0ZXhwZWN0ZWQuZm9yRWFjaCh0YXNrID0+IHtcblx0XHRhc3NlcnQub2soIWV4cGVjdGVkVGFza3NbdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lIV0pO1xuXHRcdGV4cGVjdGVkVGFza3NbdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lIV0gPSB0YXNrO1xuXHRcdGNvbnN0IHRhc2tJZCA9IFRhc2tzLlRhc2tHcm91cC5mcm9tKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXApPy5faWQ7XG5cdFx0aWYgKHRhc2tJZCkge1xuXHRcdFx0ZXhwZWN0ZWRUYXNrR3JvdXAuYWRkKHRhc2tJZCwgdGFzayk7XG5cdFx0fVxuXHR9KTtcblx0Y29uc3QgYWN0dWFsS2V5cyA9IE9iamVjdC5rZXlzKGFjdHVhbFRhc2tzKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbEtleXMubGVuZ3RoLCBleHBlY3RlZC5sZW5ndGgpO1xuXHRhY3R1YWxLZXlzLmZvckVhY2goKGtleSkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbFRhc2sgPSBhY3R1YWxUYXNrc1trZXldO1xuXHRcdGNvbnN0IGV4cGVjdGVkVGFzayA9IGV4cGVjdGVkVGFza3Nba2V5XTtcblx0XHRhc3NlcnQub2soZXhwZWN0ZWRUYXNrKTtcblx0XHRhc3NlcnRUYXNrKGFjdHVhbFRhc2ssIGV4cGVjdGVkVGFzayk7XG5cdH0pO1xuXHRUYXNrR3JvdXBNYXAuYXNzZXJ0KGFjdHVhbFRhc2tHcm91cHMsIGV4cGVjdGVkVGFza0dyb3VwKTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0VGFzayhhY3R1YWw6IFRhc2tzLlRhc2ssIGV4cGVjdGVkOiBUYXNrcy5UYXNrKSB7XG5cdGFzc2VydC5vayhhY3R1YWwuX2lkKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lLCBleHBlY3RlZC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lLCAnbmFtZScpO1xuXHRpZiAoIVRhc2tzLkluTWVtb3J5VGFzay5pcyhhY3R1YWwpICYmICFUYXNrcy5Jbk1lbW9yeVRhc2suaXMoZXhwZWN0ZWQpKSB7XG5cdFx0YXNzZXJ0Q29tbWFuZENvbmZpZ3VyYXRpb24oYWN0dWFsLmNvbW1hbmQsIGV4cGVjdGVkLmNvbW1hbmQpO1xuXHR9XG5cdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kLCBleHBlY3RlZC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQsICdpc0JhY2tncm91bmQnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBhY3R1YWwuY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzLCB0eXBlb2YgZXhwZWN0ZWQuY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9tcHRPbkNsb3NlLCBleHBlY3RlZC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9tcHRPbkNsb3NlLCAncHJvbXB0T25DbG9zZScpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGFjdHVhbC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCwgdHlwZW9mIGV4cGVjdGVkLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwLCBgZ3JvdXAgdHlwZXMgdW5lcXVhbGApO1xuXG5cdGlmIChhY3R1YWwuY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzICYmIGV4cGVjdGVkLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycykge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzLmxlbmd0aCwgZXhwZWN0ZWQuY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhY3R1YWwuY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRhc3NlcnRQcm9ibGVtTWF0Y2hlcihhY3R1YWwuY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzW2ldLCBleHBlY3RlZC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnNbaV0pO1xuXHRcdH1cblx0fVxuXG5cdGlmIChhY3R1YWwuY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgJiYgZXhwZWN0ZWQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXApIHtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoYWN0dWFsLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwKSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCwgZXhwZWN0ZWQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnRHcm91cChhY3R1YWwuY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgYXMgVGFza3MuVGFza0dyb3VwLCBleHBlY3RlZC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCBhcyBUYXNrcy5UYXNrR3JvdXApO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBhc3NlcnRDb21tYW5kQ29uZmlndXJhdGlvbihhY3R1YWw6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiwgZXhwZWN0ZWQ6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbikge1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGFjdHVhbCwgdHlwZW9mIGV4cGVjdGVkKTtcblx0aWYgKGFjdHVhbCAmJiBleHBlY3RlZCkge1xuXHRcdGFzc2VydFByZXNlbnRhdGlvbihhY3R1YWwucHJlc2VudGF0aW9uISwgZXhwZWN0ZWQucHJlc2VudGF0aW9uISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5uYW1lLCBleHBlY3RlZC5uYW1lLCAnbmFtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucnVudGltZSwgZXhwZWN0ZWQucnVudGltZSwgJ3J1bnRpbWUgdHlwZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuc3VwcHJlc3NUYXNrTmFtZSwgZXhwZWN0ZWQuc3VwcHJlc3NUYXNrTmFtZSwgJ3N1cHByZXNzVGFza05hbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnRhc2tTZWxlY3RvciwgZXhwZWN0ZWQudGFza1NlbGVjdG9yLCAndGFza1NlbGVjdG9yJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuYXJncywgZXhwZWN0ZWQuYXJncywgJ2FyZ3MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGFjdHVhbC5vcHRpb25zLCB0eXBlb2YgZXhwZWN0ZWQub3B0aW9ucyk7XG5cdFx0aWYgKGFjdHVhbC5vcHRpb25zICYmIGV4cGVjdGVkLm9wdGlvbnMpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwub3B0aW9ucy5jd2QsIGV4cGVjdGVkLm9wdGlvbnMuY3dkLCAnY3dkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGFjdHVhbC5vcHRpb25zLmVudiwgdHlwZW9mIGV4cGVjdGVkLm9wdGlvbnMuZW52LCAnZW52Jyk7XG5cdFx0XHRpZiAoYWN0dWFsLm9wdGlvbnMuZW52ICYmIGV4cGVjdGVkLm9wdGlvbnMuZW52KSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLm9wdGlvbnMuZW52LCBleHBlY3RlZC5vcHRpb25zLmVudiwgJ2VudicpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBhc3NlcnRHcm91cChhY3R1YWw6IFRhc2tzLlRhc2tHcm91cCwgZXhwZWN0ZWQ6IFRhc2tzLlRhc2tHcm91cCkge1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGFjdHVhbCwgdHlwZW9mIGV4cGVjdGVkKTtcblx0aWYgKGFjdHVhbCAmJiBleHBlY3RlZCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuX2lkLCBleHBlY3RlZC5faWQsIGBncm91cCBpZHMgdW5lcXVhbC4gYWN0dWFsOiAke2FjdHVhbC5faWR9IGV4cGVjdGVkICR7ZXhwZWN0ZWQuX2lkfWApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuaXNEZWZhdWx0LCBleHBlY3RlZC5pc0RlZmF1bHQsIGBncm91cCBkZWZhdWx0cyB1bmVxdWFsLiBhY3R1YWw6ICR7YWN0dWFsLmlzRGVmYXVsdH0gZXhwZWN0ZWQgJHtleHBlY3RlZC5pc0RlZmF1bHR9YCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNzZXJ0UHJlc2VudGF0aW9uKGFjdHVhbDogVGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnMsIGV4cGVjdGVkOiBUYXNrcy5JUHJlc2VudGF0aW9uT3B0aW9ucykge1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGFjdHVhbCwgdHlwZW9mIGV4cGVjdGVkKTtcblx0aWYgKGFjdHVhbCAmJiBleHBlY3RlZCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZWNobywgZXhwZWN0ZWQuZWNobyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZXZlYWwsIGV4cGVjdGVkLnJldmVhbCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNzZXJ0UHJvYmxlbU1hdGNoZXIoYWN0dWFsOiBzdHJpbmcgfCBQcm9ibGVtTWF0Y2hlciwgZXhwZWN0ZWQ6IHN0cmluZyB8IFByb2JsZW1NYXRjaGVyKSB7XG5cdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgYWN0dWFsLCB0eXBlb2YgZXhwZWN0ZWQpO1xuXHRpZiAodHlwZW9mIGFjdHVhbCA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGV4cGVjdGVkID09PSAnc3RyaW5nJykge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCAnUHJvYmxlbSBtYXRjaGVyIHJlZmVyZW5jZXMgYXJlIGRpZmZlcmVudCcpO1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAodHlwZW9mIGFjdHVhbCAhPT0gJ3N0cmluZycgJiYgdHlwZW9mIGV4cGVjdGVkICE9PSAnc3RyaW5nJykge1xuXHRcdGlmIChleHBlY3RlZC5vd25lciA9PT0gUHJvYmxlbU1hdGNoZXJCdWlsZGVyLkRFRkFVTFRfVVVJRCkge1xuXHRcdFx0YXNzZXJ0Lm9rKFVVSUQuaXNVVUlEKGFjdHVhbC5vd25lciksICdPd25lciBtdXN0IGJlIGEgVVVJRCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm93bmVyLCBleHBlY3RlZC5vd25lcik7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuYXBwbHlUbywgZXhwZWN0ZWQuYXBwbHlUbyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5zZXZlcml0eSwgZXhwZWN0ZWQuc2V2ZXJpdHkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZmlsZUxvY2F0aW9uLCBleHBlY3RlZC5maWxlTG9jYXRpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZmlsZVByZWZpeCwgZXhwZWN0ZWQuZmlsZVByZWZpeCk7XG5cdFx0aWYgKGFjdHVhbC5wYXR0ZXJuICYmIGV4cGVjdGVkLnBhdHRlcm4pIHtcblx0XHRcdGFzc2VydFByb2JsZW1QYXR0ZXJucyhhY3R1YWwucGF0dGVybiwgZXhwZWN0ZWQucGF0dGVybik7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGFzc2VydFByb2JsZW1QYXR0ZXJucyhhY3R1YWw6IFR5cGVzLlNpbmdsZU9yTWFueTxJUHJvYmxlbVBhdHRlcm4+LCBleHBlY3RlZDogVHlwZXMuU2luZ2xlT3JNYW55PElQcm9ibGVtUGF0dGVybj4pIHtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBhY3R1YWwsIHR5cGVvZiBleHBlY3RlZCk7XG5cdGlmIChBcnJheS5pc0FycmF5KGFjdHVhbCkpIHtcblx0XHRjb25zdCBhY3R1YWxzID0gPElQcm9ibGVtUGF0dGVybltdPmFjdHVhbDtcblx0XHRjb25zdCBleHBlY3RlZHMgPSA8SVByb2JsZW1QYXR0ZXJuW10+ZXhwZWN0ZWQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbHMubGVuZ3RoLCBleHBlY3RlZHMubGVuZ3RoKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFjdHVhbHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFzc2VydFByb2JsZW1QYXR0ZXJuKGFjdHVhbHNbaV0sIGV4cGVjdGVkc1tpXSk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGFzc2VydFByb2JsZW1QYXR0ZXJuKDxJUHJvYmxlbVBhdHRlcm4+YWN0dWFsLCA8SVByb2JsZW1QYXR0ZXJuPmV4cGVjdGVkKTtcblx0fVxufVxuXG5mdW5jdGlvbiBhc3NlcnRQcm9ibGVtUGF0dGVybihhY3R1YWw6IElQcm9ibGVtUGF0dGVybiwgZXhwZWN0ZWQ6IElQcm9ibGVtUGF0dGVybikge1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlZ2V4cC50b1N0cmluZygpLCBleHBlY3RlZC5yZWdleHAudG9TdHJpbmcoKSk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZmlsZSwgZXhwZWN0ZWQuZmlsZSk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVzc2FnZSwgZXhwZWN0ZWQubWVzc2FnZSk7XG5cdGlmICh0eXBlb2YgZXhwZWN0ZWQubG9jYXRpb24gIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhdGlvbiwgZXhwZWN0ZWQubG9jYXRpb24pO1xuXHR9IGVsc2Uge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubGluZSwgZXhwZWN0ZWQubGluZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jaGFyYWN0ZXIsIGV4cGVjdGVkLmNoYXJhY3Rlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5lbmRMaW5lLCBleHBlY3RlZC5lbmRMaW5lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmVuZENoYXJhY3RlciwgZXhwZWN0ZWQuZW5kQ2hhcmFjdGVyKTtcblx0fVxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvZGUsIGV4cGVjdGVkLmNvZGUpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnNldmVyaXR5LCBleHBlY3RlZC5zZXZlcml0eSk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9vcCwgZXhwZWN0ZWQubG9vcCk7XG59XG5cbnN1aXRlKCdUYXNrcyB2ZXJzaW9uIDAuMS4wJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd0YXNrczogYWxsIGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndHNjJywgJ3RzYycpLlxuXHRcdFx0Z3JvdXAoVGFza3MuVGFza0dyb3VwLkJ1aWxkKS5cblx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKFxuXHRcdFx0e1xuXHRcdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0XHRjb21tYW5kOiAndHNjJ1xuXHRcdFx0fSwgYnVpbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBnbG9iYWwgaXNTaGVsbENvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndHNjJywgJ3RzYycpLlxuXHRcdFx0Z3JvdXAoVGFza3MuVGFza0dyb3VwLkJ1aWxkKS5cblx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpLlxuXHRcdFx0cnVudGltZShUYXNrcy5SdW50aW1lVHlwZS5TaGVsbCk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oXG5cdFx0XHR7XG5cdFx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0XHRpc1NoZWxsQ29tbWFuZDogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogZ2xvYmFsIHNob3cgb3V0cHV0IHNpbGVudCcsICgpID0+IHtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci5cblx0XHRcdHRhc2soJ3RzYycsICd0c2MnKS5cblx0XHRcdGdyb3VwKFRhc2tzLlRhc2tHcm91cC5CdWlsZCkuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdHByZXNlbnRhdGlvbigpLnJldmVhbChUYXNrcy5SZXZlYWxLaW5kLlNpbGVudCk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oXG5cdFx0XHR7XG5cdFx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0XHRzaG93T3V0cHV0OiAnc2lsZW50J1xuXHRcdFx0fSxcblx0XHRcdGJ1aWxkZXJcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogZ2xvYmFsIHByb21wdE9uQ2xvc2UgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0c2MnLCAndHNjJykuXG5cdFx0XHRncm91cChUYXNrcy5UYXNrR3JvdXAuQnVpbGQpLlxuXHRcdFx0Y29tbWFuZCgpLnN1cHByZXNzVGFza05hbWUodHJ1ZSk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oXG5cdFx0XHR7XG5cdFx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0XHRwcm9tcHRPbkNsb3NlOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0YnVpbGRlclxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBnbG9iYWwgcHJvbXB0T25DbG9zZScsICgpID0+IHtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0c2MnLCAndHNjJykuXG5cdFx0XHRncm91cChUYXNrcy5UYXNrR3JvdXAuQnVpbGQpLlxuXHRcdFx0cHJvbXB0T25DbG9zZShmYWxzZSkuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihcblx0XHRcdHtcblx0XHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHRcdHByb21wdE9uQ2xvc2U6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0YnVpbGRlclxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBnbG9iYWwgcHJvbXB0T25DbG9zZSBkZWZhdWx0IHdhdGNoaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRidWlsZGVyLnRhc2soJ3RzYycsICd0c2MnKS5cblx0XHRcdGdyb3VwKFRhc2tzLlRhc2tHcm91cC5CdWlsZCkuXG5cdFx0XHRpc0JhY2tncm91bmQodHJ1ZSkuXG5cdFx0XHRwcm9tcHRPbkNsb3NlKGZhbHNlKS5cblx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKFxuXHRcdFx0e1xuXHRcdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0XHRjb21tYW5kOiAndHNjJyxcblx0XHRcdFx0aXNXYXRjaGluZzogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGJ1aWxkZXJcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogZ2xvYmFsIHNob3cgb3V0cHV0IG5ldmVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRidWlsZGVyLlxuXHRcdFx0dGFzaygndHNjJywgJ3RzYycpLlxuXHRcdFx0Z3JvdXAoVGFza3MuVGFza0dyb3VwLkJ1aWxkKS5cblx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpLlxuXHRcdFx0cHJlc2VudGF0aW9uKCkucmV2ZWFsKFRhc2tzLlJldmVhbEtpbmQuTmV2ZXIpO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKFxuXHRcdFx0e1xuXHRcdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0XHRjb21tYW5kOiAndHNjJyxcblx0XHRcdFx0c2hvd091dHB1dDogJ25ldmVyJ1xuXHRcdFx0fSxcblx0XHRcdGJ1aWxkZXJcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogZ2xvYmFsIGVjaG8gQ29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci5cblx0XHRcdHRhc2soJ3RzYycsICd0c2MnKS5cblx0XHRcdGdyb3VwKFRhc2tzLlRhc2tHcm91cC5CdWlsZCkuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdHByZXNlbnRhdGlvbigpLlxuXHRcdFx0ZWNobyh0cnVlKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihcblx0XHRcdHtcblx0XHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHRcdGVjaG9Db21tYW5kOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0YnVpbGRlclxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBnbG9iYWwgYXJncycsICgpID0+IHtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci5cblx0XHRcdHRhc2soJ3RzYycsICd0c2MnKS5cblx0XHRcdGdyb3VwKFRhc2tzLlRhc2tHcm91cC5CdWlsZCkuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdGFyZ3MoWyctLXAnXSk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oXG5cdFx0XHR7XG5cdFx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0XHRhcmdzOiBbXG5cdFx0XHRcdFx0Jy0tcCdcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdGJ1aWxkZXJcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogb3B0aW9ucyAtIGN3ZCcsICgpID0+IHtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci5cblx0XHRcdHRhc2soJ3RzYycsICd0c2MnKS5cblx0XHRcdGdyb3VwKFRhc2tzLlRhc2tHcm91cC5CdWlsZCkuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdG9wdGlvbnMoe1xuXHRcdFx0XHRjd2Q6ICdteVBhdGgnXG5cdFx0XHR9KTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihcblx0XHRcdHtcblx0XHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRjd2Q6ICdteVBhdGgnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRidWlsZGVyXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IG9wdGlvbnMgLSBlbnYnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIuXG5cdFx0XHR0YXNrKCd0c2MnLCAndHNjJykuXG5cdFx0XHRncm91cChUYXNrcy5UYXNrR3JvdXAuQnVpbGQpLlxuXHRcdFx0Y29tbWFuZCgpLnN1cHByZXNzVGFza05hbWUodHJ1ZSkuXG5cdFx0XHRvcHRpb25zKHsgY3dkOiAnJHt3b3Jrc3BhY2VGb2xkZXJ9JywgZW52OiB7IGtleTogJ3ZhbHVlJyB9IH0pO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKFxuXHRcdFx0e1xuXHRcdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0XHRjb21tYW5kOiAndHNjJyxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdGVudjoge1xuXHRcdFx0XHRcdFx0a2V5OiAndmFsdWUnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YnVpbGRlclxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBvcyB3aW5kb3dzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5hbWU6IHN0cmluZyA9IFBsYXRmb3JtLmlzV2luZG93cyA/ICd0c2Mud2luJyA6ICd0c2MnO1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRidWlsZGVyLlxuXHRcdFx0dGFzayhuYW1lLCBuYW1lKS5cblx0XHRcdGdyb3VwKFRhc2tzLlRhc2tHcm91cC5CdWlsZCkuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKTtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHR3aW5kb3dzOiB7XG5cdFx0XHRcdGNvbW1hbmQ6ICd0c2Mud2luJ1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogb3Mgd2luZG93cyAmIGdsb2JhbCBpc1NoZWxsQ29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBuYW1lOiBzdHJpbmcgPSBQbGF0Zm9ybS5pc1dpbmRvd3MgPyAndHNjLndpbicgOiAndHNjJztcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci5cblx0XHRcdHRhc2sobmFtZSwgbmFtZSkuXG5cdFx0XHRncm91cChUYXNrcy5UYXNrR3JvdXAuQnVpbGQpLlxuXHRcdFx0Y29tbWFuZCgpLnN1cHByZXNzVGFza05hbWUodHJ1ZSkuXG5cdFx0XHRydW50aW1lKFRhc2tzLlJ1bnRpbWVUeXBlLlNoZWxsKTtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHRpc1NoZWxsQ29tbWFuZDogdHJ1ZSxcblx0XHRcdHdpbmRvd3M6IHtcblx0XHRcdFx0Y29tbWFuZDogJ3RzYy53aW4nXG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBvcyBtYWMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmFtZTogc3RyaW5nID0gUGxhdGZvcm0uaXNNYWNpbnRvc2ggPyAndHNjLm9zeCcgOiAndHNjJztcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci5cblx0XHRcdHRhc2sobmFtZSwgbmFtZSkuXG5cdFx0XHRncm91cChUYXNrcy5UYXNrR3JvdXAuQnVpbGQpLlxuXHRcdFx0Y29tbWFuZCgpLnN1cHByZXNzVGFza05hbWUodHJ1ZSk7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0b3N4OiB7XG5cdFx0XHRcdGNvbW1hbmQ6ICd0c2Mub3N4J1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogb3MgbGludXgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmFtZTogc3RyaW5nID0gUGxhdGZvcm0uaXNMaW51eCA/ICd0c2MubGludXgnIDogJ3RzYyc7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIuXG5cdFx0XHR0YXNrKG5hbWUsIG5hbWUpLlxuXHRcdFx0Z3JvdXAoVGFza3MuVGFza0dyb3VwLkJ1aWxkKS5cblx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpO1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRjb21tYW5kOiAndHNjJyxcblx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdGNvbW1hbmQ6ICd0c2MubGludXgnXG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBvdmVyd3JpdGUgc2hvd091dHB1dCcsICgpID0+IHtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci5cblx0XHRcdHRhc2soJ3RzYycsICd0c2MnKS5cblx0XHRcdGdyb3VwKFRhc2tzLlRhc2tHcm91cC5CdWlsZCkuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdHByZXNlbnRhdGlvbigpLnJldmVhbChQbGF0Zm9ybS5pc1dpbmRvd3MgPyBUYXNrcy5SZXZlYWxLaW5kLkFsd2F5cyA6IFRhc2tzLlJldmVhbEtpbmQuTmV2ZXIpO1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRjb21tYW5kOiAndHNjJyxcblx0XHRcdHNob3dPdXRwdXQ6ICduZXZlcicsXG5cdFx0XHR3aW5kb3dzOiB7XG5cdFx0XHRcdHNob3dPdXRwdXQ6ICdhbHdheXMnXG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBvdmVyd3JpdGUgZWNobyBDb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRidWlsZGVyLlxuXHRcdFx0dGFzaygndHNjJywgJ3RzYycpLlxuXHRcdFx0Z3JvdXAoVGFza3MuVGFza0dyb3VwLkJ1aWxkKS5cblx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpLlxuXHRcdFx0cHJlc2VudGF0aW9uKCkuXG5cdFx0XHRlY2hvKFBsYXRmb3JtLmlzV2luZG93cyA/IGZhbHNlIDogdHJ1ZSk7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0ZWNob0NvbW1hbmQ6IHRydWUsXG5cdFx0XHR3aW5kb3dzOiB7XG5cdFx0XHRcdGVjaG9Db21tYW5kOiBmYWxzZVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogZ2xvYmFsIHByb2JsZW1NYXRjaGVyIG9uZScsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHRwcm9ibGVtTWF0Y2hlcjogJyRtc0NvbXBpbGUnXG5cdFx0fTtcblx0XHR0ZXN0RGVmYXVsdFByb2JsZW1NYXRjaGVyKGV4dGVybmFsLCAxKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IGdsb2JhbCBwcm9ibGVtTWF0Y2hlciB0d28nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0cHJvYmxlbU1hdGNoZXI6IFsnJGVzbGludC1jb21wYWN0JywgJyRtc0NvbXBpbGUnXVxuXHRcdH07XG5cdFx0dGVzdERlZmF1bHRQcm9ibGVtTWF0Y2hlcihleHRlcm5hbCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiB0YXNrIGRlZmluaXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhc2tOYW1lOiAndGFza05hbWUnXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRidWlsZGVyLnRhc2soJ3Rhc2tOYW1lJywgJ3RzYycpLmNvbW1hbmQoKS5hcmdzKFsnJG5hbWUnXSk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogYnVpbGQgdGFzaycsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZScsXG5cdFx0XHRcdFx0aXNCdWlsZENvbW1hbmQ6IHRydWVcblx0XHRcdFx0fSBhcyBJQ3VzdG9tVGFza1xuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndGFza05hbWUnLCAndHNjJykuZ3JvdXAoVGFza3MuVGFza0dyb3VwLkJ1aWxkKS5jb21tYW5kKCkuYXJncyhbJyRuYW1lJ10pO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IGRlZmF1bHQgYnVpbGQgdGFzaycsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICdidWlsZCdcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygnYnVpbGQnLCAndHNjJykuZ3JvdXAoVGFza3MuVGFza0dyb3VwLkJ1aWxkKS5jb21tYW5kKCkuYXJncyhbJyRuYW1lJ10pO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IHRlc3QgdGFzaycsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZScsXG5cdFx0XHRcdFx0aXNUZXN0Q29tbWFuZDogdHJ1ZVxuXHRcdFx0XHR9IGFzIElDdXN0b21UYXNrXG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZScsICd0c2MnKS5ncm91cChUYXNrcy5UYXNrR3JvdXAuVGVzdCkuY29tbWFuZCgpLmFyZ3MoWyckbmFtZSddKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBkZWZhdWx0IHRlc3QgdGFzaycsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0ZXN0J1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0ZXN0JywgJ3RzYycpLmdyb3VwKFRhc2tzLlRhc2tHcm91cC5UZXN0KS5jb21tYW5kKCkuYXJncyhbJyRuYW1lJ10pO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IHRhc2sgd2l0aCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhc2tOYW1lOiAndGVzdCcsXG5cdFx0XHRcdFx0c2hvd091dHB1dDogJ25ldmVyJyxcblx0XHRcdFx0XHRlY2hvQ29tbWFuZDogdHJ1ZSxcblx0XHRcdFx0XHRhcmdzOiBbJy0tcCddLFxuXHRcdFx0XHRcdGlzV2F0Y2hpbmc6IHRydWVcblx0XHRcdFx0fSBhcyBJQ3VzdG9tVGFza1xuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndGVzdCcsICd0c2MnKS5cblx0XHRcdGdyb3VwKFRhc2tzLlRhc2tHcm91cC5UZXN0KS5cblx0XHRcdGlzQmFja2dyb3VuZCh0cnVlKS5cblx0XHRcdHByb21wdE9uQ2xvc2UoZmFsc2UpLlxuXHRcdFx0Y29tbWFuZCgpLmFyZ3MoWyckbmFtZScsICctLXAnXSkuXG5cdFx0XHRwcmVzZW50YXRpb24oKS5cblx0XHRcdGVjaG8odHJ1ZSkucmV2ZWFsKFRhc2tzLlJldmVhbEtpbmQuTmV2ZXIpO1xuXG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogdGFzayBpbmhlcml0cyBnbG9iYWwgdmFsdWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRjb21tYW5kOiAndHNjJyxcblx0XHRcdHNob3dPdXRwdXQ6ICduZXZlcicsXG5cdFx0XHRlY2hvQ29tbWFuZDogdHJ1ZSxcblx0XHRcdHRhc2tzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0YXNrTmFtZTogJ3Rlc3QnXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRidWlsZGVyLnRhc2soJ3Rlc3QnLCAndHNjJykuXG5cdFx0XHRncm91cChUYXNrcy5UYXNrR3JvdXAuVGVzdCkuXG5cdFx0XHRjb21tYW5kKCkuYXJncyhbJyRuYW1lJ10pLnByZXNlbnRhdGlvbigpLlxuXHRcdFx0ZWNobyh0cnVlKS5yZXZlYWwoVGFza3MuUmV2ZWFsS2luZC5OZXZlcik7XG5cblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBwcm9ibGVtIG1hdGNoZXIgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZScsXG5cdFx0XHRcdFx0cHJvYmxlbU1hdGNoZXI6IHtcblx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0cmVnZXhwOiAnYWJjJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndGFza05hbWUnLCAndHNjJykuXG5cdFx0XHRjb21tYW5kKCkuYXJncyhbJyRuYW1lJ10pLnBhcmVudC5cblx0XHRcdHByb2JsZW1NYXRjaGVyKCkucGF0dGVybigvYWJjLyk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogcHJvYmxlbSBtYXRjaGVyIC4qIHJlZ3VsYXIgZXhwcmVzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZScsXG5cdFx0XHRcdFx0cHJvYmxlbU1hdGNoZXI6IHtcblx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0cmVnZXhwOiAnLionXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZScsICd0c2MnKS5cblx0XHRcdGNvbW1hbmQoKS5hcmdzKFsnJG5hbWUnXSkucGFyZW50LlxuXHRcdFx0cHJvYmxlbU1hdGNoZXIoKS5wYXR0ZXJuKC8uKi8pO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IHByb2JsZW0gbWF0Y2hlciBvd25lciwgYXBwbHlUbywgc2V2ZXJpdHkgYW5kIGZpbGVMb2NhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZScsXG5cdFx0XHRcdFx0cHJvYmxlbU1hdGNoZXI6IHtcblx0XHRcdFx0XHRcdG93bmVyOiAnbXlPd25lcicsXG5cdFx0XHRcdFx0XHRhcHBseVRvOiAnY2xvc2VkRG9jdW1lbnRzJyxcblx0XHRcdFx0XHRcdHNldmVyaXR5OiAnd2FybmluZycsXG5cdFx0XHRcdFx0XHRmaWxlTG9jYXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdHJlZ2V4cDogJ2FiYydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRidWlsZGVyLnRhc2soJ3Rhc2tOYW1lJywgJ3RzYycpLlxuXHRcdFx0Y29tbWFuZCgpLmFyZ3MoWyckbmFtZSddKS5wYXJlbnQuXG5cdFx0XHRwcm9ibGVtTWF0Y2hlcigpLlxuXHRcdFx0b3duZXIoJ215T3duZXInKS5cblx0XHRcdGFwcGx5VG8oQXBwbHlUb0tpbmQuY2xvc2VkRG9jdW1lbnRzKS5cblx0XHRcdHNldmVyaXR5KFNldmVyaXR5Lldhcm5pbmcpLlxuXHRcdFx0ZmlsZUxvY2F0aW9uKEZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUpLlxuXHRcdFx0ZmlsZVByZWZpeCh1bmRlZmluZWQhKS5cblx0XHRcdHBhdHRlcm4oL2FiYy8pO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IHByb2JsZW0gbWF0Y2hlciBmaWxlTG9jYXRpb24gYW5kIGZpbGVQcmVmaXgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhc2tOYW1lOiAndGFza05hbWUnLFxuXHRcdFx0XHRcdHByb2JsZW1NYXRjaGVyOiB7XG5cdFx0XHRcdFx0XHRmaWxlTG9jYXRpb246IFsncmVsYXRpdmUnLCAnbXlQYXRoJ10sXG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdHJlZ2V4cDogJ2FiYydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRidWlsZGVyLnRhc2soJ3Rhc2tOYW1lJywgJ3RzYycpLlxuXHRcdFx0Y29tbWFuZCgpLmFyZ3MoWyckbmFtZSddKS5wYXJlbnQuXG5cdFx0XHRwcm9ibGVtTWF0Y2hlcigpLlxuXHRcdFx0ZmlsZUxvY2F0aW9uKEZpbGVMb2NhdGlvbktpbmQuUmVsYXRpdmUpLlxuXHRcdFx0ZmlsZVByZWZpeCgnbXlQYXRoJykuXG5cdFx0XHRwYXR0ZXJuKC9hYmMvKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBwcm9ibGVtIHBhdHRlcm4gbG9jYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhc2tOYW1lOiAndGFza05hbWUnLFxuXHRcdFx0XHRcdHByb2JsZW1NYXRjaGVyOiB7XG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdHJlZ2V4cDogJ2FiYycsXG5cdFx0XHRcdFx0XHRcdGZpbGU6IDEwLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiAxMSxcblx0XHRcdFx0XHRcdFx0bG9jYXRpb246IDEyLFxuXHRcdFx0XHRcdFx0XHRzZXZlcml0eTogMTMsXG5cdFx0XHRcdFx0XHRcdGNvZGU6IDE0XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZScsICd0c2MnKS5cblx0XHRcdGNvbW1hbmQoKS5hcmdzKFsnJG5hbWUnXSkucGFyZW50LlxuXHRcdFx0cHJvYmxlbU1hdGNoZXIoKS5cblx0XHRcdHBhdHRlcm4oL2FiYy8pLmZpbGUoMTApLm1lc3NhZ2UoMTEpLmxvY2F0aW9uKDEyKS5zZXZlcml0eSgxMykuY29kZSgxNCk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogcHJvYmxlbSBwYXR0ZXJuIGxpbmUgJiBjb2x1bW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhc2tOYW1lOiAndGFza05hbWUnLFxuXHRcdFx0XHRcdHByb2JsZW1NYXRjaGVyOiB7XG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdHJlZ2V4cDogJ2FiYycsXG5cdFx0XHRcdFx0XHRcdGZpbGU6IDEwLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiAxMSxcblx0XHRcdFx0XHRcdFx0bGluZTogMTIsXG5cdFx0XHRcdFx0XHRcdGNvbHVtbjogMTMsXG5cdFx0XHRcdFx0XHRcdGVuZExpbmU6IDE0LFxuXHRcdFx0XHRcdFx0XHRlbmRDb2x1bW46IDE1LFxuXHRcdFx0XHRcdFx0XHRzZXZlcml0eTogMTYsXG5cdFx0XHRcdFx0XHRcdGNvZGU6IDE3XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZScsICd0c2MnKS5cblx0XHRcdGNvbW1hbmQoKS5hcmdzKFsnJG5hbWUnXSkucGFyZW50LlxuXHRcdFx0cHJvYmxlbU1hdGNoZXIoKS5cblx0XHRcdHBhdHRlcm4oL2FiYy8pLmZpbGUoMTApLm1lc3NhZ2UoMTEpLlxuXHRcdFx0bGluZSgxMikuY2hhcmFjdGVyKDEzKS5lbmRMaW5lKDE0KS5lbmRDaGFyYWN0ZXIoMTUpLlxuXHRcdFx0c2V2ZXJpdHkoMTYpLmNvZGUoMTcpO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IHByb21wdCBvbiBjbG9zZSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRjb21tYW5kOiAndHNjJyxcblx0XHRcdHRhc2tzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0YXNrTmFtZTogJ3Rhc2tOYW1lJ1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZScsICd0c2MnKS5cblx0XHRcdHByb21wdE9uQ2xvc2UodHJ1ZSkuXG5cdFx0XHRjb21tYW5kKCkuYXJncyhbJyRuYW1lJ10pO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IHByb21wdCBvbiBjbG9zZSB3YXRjaGluZycsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZScsXG5cdFx0XHRcdFx0aXNXYXRjaGluZzogdHJ1ZVxuXHRcdFx0XHR9IGFzIElDdXN0b21UYXNrXG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZScsICd0c2MnKS5cblx0XHRcdGlzQmFja2dyb3VuZCh0cnVlKS5wcm9tcHRPbkNsb3NlKGZhbHNlKS5cblx0XHRcdGNvbW1hbmQoKS5hcmdzKFsnJG5hbWUnXSk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogcHJvbXB0IG9uIGNsb3NlIHNldCcsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZScsXG5cdFx0XHRcdFx0cHJvbXB0T25DbG9zZTogZmFsc2Vcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndGFza05hbWUnLCAndHNjJykuXG5cdFx0XHRwcm9tcHRPbkNsb3NlKGZhbHNlKS5cblx0XHRcdGNvbW1hbmQoKS5hcmdzKFsnJG5hbWUnXSk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogdGFzayBzZWxlY3RvciBzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0dGFza1NlbGVjdG9yOiAnL3Q6Jyxcblx0XHRcdHRhc2tzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0YXNrTmFtZTogJ3Rhc2tOYW1lJyxcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndGFza05hbWUnLCAndHNjJykuXG5cdFx0XHRjb21tYW5kKCkuXG5cdFx0XHR0YXNrU2VsZWN0b3IoJy90OicpLlxuXHRcdFx0YXJncyhbJy90OnRhc2tOYW1lJ10pO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IHN1cHByZXNzIHRhc2sgbmFtZSBzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0c3VwcHJlc3NUYXNrTmFtZTogZmFsc2UsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZScsXG5cdFx0XHRcdFx0c3VwcHJlc3NUYXNrTmFtZTogdHJ1ZVxuXHRcdFx0XHR9IGFzIElDdXN0b21UYXNrXG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZScsICd0c2MnKS5cblx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IHN1cHByZXNzIHRhc2sgbmFtZSBpbmhlcml0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRjb21tYW5kOiAndHNjJyxcblx0XHRcdHN1cHByZXNzVGFza05hbWU6IHRydWUsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZSdcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndGFza05hbWUnLCAndHNjJykuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiB0d28gdGFza3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhc2tOYW1lOiAndGFza05hbWVPbmUnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0YXNrTmFtZTogJ3Rhc2tOYW1lVHdvJ1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZU9uZScsICd0c2MnKS5cblx0XHRcdGNvbW1hbmQoKS5hcmdzKFsnJG5hbWUnXSk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZVR3bycsICd0c2MnKS5cblx0XHRcdGNvbW1hbmQoKS5hcmdzKFsnJG5hbWUnXSk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogd2l0aCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZU9uZScsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3RzYydcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndGFza05hbWVPbmUnLCAndHNjJykuY29tbWFuZCgpLnN1cHByZXNzVGFza05hbWUodHJ1ZSk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogdHdvIHRhc2tzIHdpdGggY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhc2tOYW1lOiAndGFza05hbWVPbmUnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICd0c2MnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0YXNrTmFtZTogJ3Rhc2tOYW1lVHdvJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZGlyJ1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZU9uZScsICd0c2MnKS5jb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKTtcblx0XHRidWlsZGVyLnRhc2soJ3Rhc2tOYW1lVHdvJywgJ2RpcicpLmNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IHdpdGggY29tbWFuZCBhbmQgYXJncycsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhc2tOYW1lOiAndGFza05hbWVPbmUnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0XHRcdGlzU2hlbGxDb21tYW5kOiB0cnVlLFxuXHRcdFx0XHRcdGFyZ3M6IFsnYXJnJ10sXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0Y3dkOiAnY3dkJyxcblx0XHRcdFx0XHRcdGVudjoge1xuXHRcdFx0XHRcdFx0XHRlbnY6ICdlbnYnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGFzIElDdXN0b21UYXNrXG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZU9uZScsICd0c2MnKS5jb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdHJ1bnRpbWUoVGFza3MuUnVudGltZVR5cGUuU2hlbGwpLmFyZ3MoWydhcmcnXSkub3B0aW9ucyh7IGN3ZDogJ2N3ZCcsIGVudjogeyBlbnY6ICdlbnYnIH0gfSk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogd2l0aCBjb21tYW5kIG9zIHNwZWNpZmljJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5hbWU6IHN0cmluZyA9IFBsYXRmb3JtLmlzV2luZG93cyA/ICd0c2Mud2luJyA6ICd0c2MnO1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0YXNrTmFtZU9uZScsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHRcdFx0d2luZG93czoge1xuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ3RzYy53aW4nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0YXNrTmFtZU9uZScsIG5hbWUpLmNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cblx0dGVzdCgndGFza3M6IHdpdGggV2luZG93cyBzcGVjaWZpYyBhcmdzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFyZ3M6IHN0cmluZ1tdID0gUGxhdGZvcm0uaXNXaW5kb3dzID8gWydhcmcxJywgJ2FyZzInXSA6IFsnYXJnMSddO1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0c2MnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0XHRcdGFyZ3M6IFsnYXJnMSddLFxuXHRcdFx0XHRcdHdpbmRvd3M6IHtcblx0XHRcdFx0XHRcdGFyZ3M6IFsnYXJnMiddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCd0c2MnLCAndHNjJykuY29tbWFuZCgpLnN1cHByZXNzVGFza05hbWUodHJ1ZSkuYXJncyhhcmdzKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiB3aXRoIExpbnV4IHNwZWNpZmljIGFyZ3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXJnczogc3RyaW5nW10gPSBQbGF0Zm9ybS5pc0xpbnV4ID8gWydhcmcxJywgJ2FyZzInXSA6IFsnYXJnMSddO1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICd0c2MnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0XHRcdGFyZ3M6IFsnYXJnMSddLFxuXHRcdFx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdFx0XHRhcmdzOiBbJ2FyZzInXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndHNjJywgJ3RzYycpLmNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpLmFyZ3MoYXJncyk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogZ2xvYmFsIGNvbW1hbmQgYW5kIHRhc2sgY29tbWFuZCBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRjb21tYW5kOiAndHNjJyxcblx0XHRcdHRhc2tzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0YXNrTmFtZTogJ3Rhc2tOYW1lT25lJyxcblx0XHRcdFx0XHRpc1NoZWxsQ29tbWFuZDogdHJ1ZSxcblx0XHRcdFx0fSBhcyBJQ3VzdG9tVGFza1xuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndGFza05hbWVPbmUnLCAndHNjJykuY29tbWFuZCgpLnJ1bnRpbWUoVGFza3MuUnVudGltZVR5cGUuU2hlbGwpLmFyZ3MoWyckbmFtZSddKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tzOiBnbG9iYWwgYW5kIHRhc2tzIGFyZ3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdGNvbW1hbmQ6ICd0c2MnLFxuXHRcdFx0YXJnczogWydnbG9iYWwnXSxcblx0XHRcdHRhc2tzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0YXNrTmFtZTogJ3Rhc2tOYW1lT25lJyxcblx0XHRcdFx0XHRhcmdzOiBbJ2xvY2FsJ11cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndGFza05hbWVPbmUnLCAndHNjJykuY29tbWFuZCgpLmFyZ3MoWydnbG9iYWwnLCAnJG5hbWUnLCAnbG9jYWwnXSk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YXNrczogZ2xvYmFsIGFuZCB0YXNrcyBhcmdzIHdpdGggdGFzayBzZWxlY3RvcicsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMC4xLjAnLFxuXHRcdFx0Y29tbWFuZDogJ3RzYycsXG5cdFx0XHRhcmdzOiBbJ2dsb2JhbCddLFxuXHRcdFx0dGFza1NlbGVjdG9yOiAnL3Q6Jyxcblx0XHRcdHRhc2tzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0YXNrTmFtZTogJ3Rhc2tOYW1lT25lJyxcblx0XHRcdFx0XHRhcmdzOiBbJ2xvY2FsJ11cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygndGFza05hbWVPbmUnLCAndHNjJykuY29tbWFuZCgpLnRhc2tTZWxlY3RvcignL3Q6JykuYXJncyhbJ2dsb2JhbCcsICcvdDp0YXNrTmFtZU9uZScsICdsb2NhbCddKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdUYXNrcyB2ZXJzaW9uIDIuMC4wJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0LnNraXAoJ0J1aWxkIHdvcmtzcGFjZSB0YXNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcyLjAuMCcsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICdkaXInLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkaXInLFxuXHRcdFx0XHRcdHR5cGU6ICdzaGVsbCcsXG5cdFx0XHRcdFx0Z3JvdXA6ICdidWlsZCdcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygnZGlyJywgJ2RpcicpLlxuXHRcdFx0Z3JvdXAoVGFza3MuVGFza0dyb3VwLkJ1aWxkKS5cblx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpLlxuXHRcdFx0cnVudGltZShUYXNrcy5SdW50aW1lVHlwZS5TaGVsbCkuXG5cdFx0XHRwcmVzZW50YXRpb24oKS5lY2hvKHRydWUpO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cdHRlc3QoJ0dsb2JhbCBncm91cCBub25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcyLjAuMCcsXG5cdFx0XHRjb21tYW5kOiAnZGlyJyxcblx0XHRcdHR5cGU6ICdzaGVsbCcsXG5cdFx0XHRncm91cDogJ25vbmUnXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCdkaXInLCAnZGlyJykuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdHJ1bnRpbWUoVGFza3MuUnVudGltZVR5cGUuU2hlbGwpLlxuXHRcdFx0cHJlc2VudGF0aW9uKCkuZWNobyh0cnVlKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXHR0ZXN0LnNraXAoJ0dsb2JhbCBncm91cCBidWlsZCcsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMi4wLjAnLFxuXHRcdFx0Y29tbWFuZDogJ2RpcicsXG5cdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0Z3JvdXA6ICdidWlsZCdcblx0XHR9O1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRidWlsZGVyLnRhc2soJ2RpcicsICdkaXInKS5cblx0XHRcdGdyb3VwKFRhc2tzLlRhc2tHcm91cC5CdWlsZCkuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdHJ1bnRpbWUoVGFza3MuUnVudGltZVR5cGUuU2hlbGwpLlxuXHRcdFx0cHJlc2VudGF0aW9uKCkuZWNobyh0cnVlKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXHR0ZXN0LnNraXAoJ0dsb2JhbCBncm91cCBkZWZhdWx0IGJ1aWxkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcyLjAuMCcsXG5cdFx0XHRjb21tYW5kOiAnZGlyJyxcblx0XHRcdHR5cGU6ICdzaGVsbCcsXG5cdFx0XHRncm91cDogeyBraW5kOiAnYnVpbGQnLCBpc0RlZmF1bHQ6IHRydWUgfVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGNvbnN0IHRhc2tHcm91cCA9IFRhc2tzLlRhc2tHcm91cC5CdWlsZDtcblx0XHR0YXNrR3JvdXAuaXNEZWZhdWx0ID0gdHJ1ZTtcblx0XHRidWlsZGVyLnRhc2soJ2RpcicsICdkaXInKS5cblx0XHRcdGdyb3VwKHRhc2tHcm91cCkuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdHJ1bnRpbWUoVGFza3MuUnVudGltZVR5cGUuU2hlbGwpLlxuXHRcdFx0cHJlc2VudGF0aW9uKCkuZWNobyh0cnVlKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXHR0ZXN0KCdMb2NhbCBncm91cCBub25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcyLjAuMCcsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICdkaXInLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkaXInLFxuXHRcdFx0XHRcdHR5cGU6ICdzaGVsbCcsXG5cdFx0XHRcdFx0Z3JvdXA6ICdub25lJ1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBidWlsZGVyID0gbmV3IENvbmZpZ3VyYXRpb25CdWlsZGVyKCk7XG5cdFx0YnVpbGRlci50YXNrKCdkaXInLCAnZGlyJykuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdHJ1bnRpbWUoVGFza3MuUnVudGltZVR5cGUuU2hlbGwpLlxuXHRcdFx0cHJlc2VudGF0aW9uKCkuZWNobyh0cnVlKTtcblx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdH0pO1xuXHR0ZXN0LnNraXAoJ0xvY2FsIGdyb3VwIGJ1aWxkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dGVybmFsOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdHZlcnNpb246ICcyLjAuMCcsXG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICdkaXInLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkaXInLFxuXHRcdFx0XHRcdHR5cGU6ICdzaGVsbCcsXG5cdFx0XHRcdFx0Z3JvdXA6ICdidWlsZCdcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb25maWd1cmF0aW9uQnVpbGRlcigpO1xuXHRcdGJ1aWxkZXIudGFzaygnZGlyJywgJ2RpcicpLlxuXHRcdFx0Z3JvdXAoVGFza3MuVGFza0dyb3VwLkJ1aWxkKS5cblx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpLlxuXHRcdFx0cnVudGltZShUYXNrcy5SdW50aW1lVHlwZS5TaGVsbCkuXG5cdFx0XHRwcmVzZW50YXRpb24oKS5lY2hvKHRydWUpO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG5cdHRlc3Quc2tpcCgnTG9jYWwgZ3JvdXAgZGVmYXVsdCBidWlsZCcsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMi4wLjAnLFxuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRhc2tOYW1lOiAnZGlyJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZGlyJyxcblx0XHRcdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0XHRcdGdyb3VwOiB7IGtpbmQ6ICdidWlsZCcsIGlzRGVmYXVsdDogdHJ1ZSB9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRjb25zdCB0YXNrR3JvdXAgPSBUYXNrcy5UYXNrR3JvdXAuQnVpbGQ7XG5cdFx0dGFza0dyb3VwLmlzRGVmYXVsdCA9IHRydWU7XG5cdFx0YnVpbGRlci50YXNrKCdkaXInLCAnZGlyJykuXG5cdFx0XHRncm91cCh0YXNrR3JvdXApLlxuXHRcdFx0Y29tbWFuZCgpLnN1cHByZXNzVGFza05hbWUodHJ1ZSkuXG5cdFx0XHRydW50aW1lKFRhc2tzLlJ1bnRpbWVUeXBlLlNoZWxsKS5cblx0XHRcdHByZXNlbnRhdGlvbigpLmVjaG8odHJ1ZSk7XG5cdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHR9KTtcblx0dGVzdCgnQXJnIG92ZXJ3cml0ZScsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbDogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHR2ZXJzaW9uOiAnMi4wLjAnLFxuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiAnZWNobycsXG5cdFx0XHRcdFx0dHlwZTogJ3NoZWxsJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZWNobycsXG5cdFx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdFx0J2dsb2JhbCdcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdHdpbmRvd3M6IHtcblx0XHRcdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHRcdFx0J3dpbmRvd3MnXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsaW51eDoge1xuXHRcdFx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdFx0XHQnbGludXgnXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRvc3g6IHtcblx0XHRcdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHRcdFx0J29zeCdcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRpZiAoUGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRidWlsZGVyLnRhc2soJ2VjaG8nLCAnZWNobycpLlxuXHRcdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5hcmdzKFsnd2luZG93cyddKS5cblx0XHRcdFx0cnVudGltZShUYXNrcy5SdW50aW1lVHlwZS5TaGVsbCkuXG5cdFx0XHRcdHByZXNlbnRhdGlvbigpLmVjaG8odHJ1ZSk7XG5cdFx0XHR0ZXN0Q29uZmlndXJhdGlvbihleHRlcm5hbCwgYnVpbGRlcik7XG5cdFx0fSBlbHNlIGlmIChQbGF0Zm9ybS5pc0xpbnV4KSB7XG5cdFx0XHRidWlsZGVyLnRhc2soJ2VjaG8nLCAnZWNobycpLlxuXHRcdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5hcmdzKFsnbGludXgnXSkuXG5cdFx0XHRcdHJ1bnRpbWUoVGFza3MuUnVudGltZVR5cGUuU2hlbGwpLlxuXHRcdFx0XHRwcmVzZW50YXRpb24oKS5lY2hvKHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHRcdH0gZWxzZSBpZiAoUGxhdGZvcm0uaXNNYWNpbnRvc2gpIHtcblx0XHRcdGJ1aWxkZXIudGFzaygnZWNobycsICdlY2hvJykuXG5cdFx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpLmFyZ3MoWydvc3gnXSkuXG5cdFx0XHRcdHJ1bnRpbWUoVGFza3MuUnVudGltZVR5cGUuU2hlbGwpLlxuXHRcdFx0XHRwcmVzZW50YXRpb24oKS5lY2hvKHRydWUpO1xuXHRcdFx0dGVzdENvbmZpZ3VyYXRpb24oZXh0ZXJuYWwsIGJ1aWxkZXIpO1xuXHRcdH1cblx0fSk7XG59KTtcblxuc3VpdGUoJ0J1Z3MgLyByZWdyZXNzaW9uIHRlc3RzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQoUGxhdGZvcm0uaXNMaW51eCA/IHRlc3Quc2tpcCA6IHRlc3QpKCdCdWcgMTk1NDgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0ZXJuYWw6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0dmVyc2lvbjogJzAuMS4wJyxcblx0XHRcdHdpbmRvd3M6IHtcblx0XHRcdFx0Y29tbWFuZDogJ3Bvd2Vyc2hlbGwnLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0Y3dkOiAnJHt3b3Jrc3BhY2VGb2xkZXJ9J1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0YXNrczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHRhc2tOYW1lOiAnY29tcG9zZUZvckRlYnVnJyxcblx0XHRcdFx0XHRcdHN1cHByZXNzVGFza05hbWU6IHRydWUsXG5cdFx0XHRcdFx0XHRhcmdzOiBbXG5cdFx0XHRcdFx0XHRcdCctRXhlY3V0aW9uUG9saWN5Jyxcblx0XHRcdFx0XHRcdFx0J1JlbW90ZVNpZ25lZCcsXG5cdFx0XHRcdFx0XHRcdCcuXFxcXGRvY2tlclRhc2sucHMxJyxcblx0XHRcdFx0XHRcdFx0Jy1Db21wb3NlRm9yRGVidWcnLFxuXHRcdFx0XHRcdFx0XHQnLUVudmlyb25tZW50Jyxcblx0XHRcdFx0XHRcdFx0J2RlYnVnJ1xuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGlzQnVpbGRDb21tYW5kOiBmYWxzZSxcblx0XHRcdFx0XHRcdHNob3dPdXRwdXQ6ICdhbHdheXMnLFxuXHRcdFx0XHRcdFx0ZWNob0NvbW1hbmQ6IHRydWVcblx0XHRcdFx0XHR9IGFzIElDdXN0b21UYXNrXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHRvc3g6IHtcblx0XHRcdFx0Y29tbWFuZDogJy9iaW4vYmFzaCcsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRjd2Q6ICcke3dvcmtzcGFjZUZvbGRlcn0nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRhc2tzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dGFza05hbWU6ICdjb21wb3NlRm9yRGVidWcnLFxuXHRcdFx0XHRcdFx0c3VwcHJlc3NUYXNrTmFtZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHRcdFx0Jy1jJyxcblx0XHRcdFx0XHRcdFx0Jy4vZG9ja2VyVGFzay5zaCBjb21wb3NlRm9yRGVidWcgZGVidWcnXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0aXNCdWlsZENvbW1hbmQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0c2hvd091dHB1dDogJ2Fsd2F5cydcblx0XHRcdFx0XHR9IGFzIElDdXN0b21UYXNrXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRpZiAoUGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRidWlsZGVyLnRhc2soJ2NvbXBvc2VGb3JEZWJ1ZycsICdwb3dlcnNoZWxsJykuXG5cdFx0XHRcdGNvbW1hbmQoKS5zdXBwcmVzc1Rhc2tOYW1lKHRydWUpLlxuXHRcdFx0XHRhcmdzKFsnLUV4ZWN1dGlvblBvbGljeScsICdSZW1vdGVTaWduZWQnLCAnLlxcXFxkb2NrZXJUYXNrLnBzMScsICctQ29tcG9zZUZvckRlYnVnJywgJy1FbnZpcm9ubWVudCcsICdkZWJ1ZyddKS5cblx0XHRcdFx0b3B0aW9ucyh7IGN3ZDogJyR7d29ya3NwYWNlRm9sZGVyfScgfSkuXG5cdFx0XHRcdHByZXNlbnRhdGlvbigpLmVjaG8odHJ1ZSkucmV2ZWFsKFRhc2tzLlJldmVhbEtpbmQuQWx3YXlzKTtcblx0XHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0XHR9IGVsc2UgaWYgKFBsYXRmb3JtLmlzTWFjaW50b3NoKSB7XG5cdFx0XHRidWlsZGVyLnRhc2soJ2NvbXBvc2VGb3JEZWJ1ZycsICcvYmluL2Jhc2gnKS5cblx0XHRcdFx0Y29tbWFuZCgpLnN1cHByZXNzVGFza05hbWUodHJ1ZSkuXG5cdFx0XHRcdGFyZ3MoWyctYycsICcuL2RvY2tlclRhc2suc2ggY29tcG9zZUZvckRlYnVnIGRlYnVnJ10pLlxuXHRcdFx0XHRvcHRpb25zKHsgY3dkOiAnJHt3b3Jrc3BhY2VGb2xkZXJ9JyB9KS5cblx0XHRcdFx0cHJlc2VudGF0aW9uKCkucmV2ZWFsKFRhc2tzLlJldmVhbEtpbmQuQWx3YXlzKTtcblx0XHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0J1ZyAyODQ4OScsICgpID0+IHtcblx0XHRjb25zdCBleHRlcm5hbCA9IHtcblx0XHRcdHZlcnNpb246ICcwLjEuMCcsXG5cdFx0XHRjb21tYW5kOiAnJyxcblx0XHRcdGlzU2hlbGxDb21tYW5kOiB0cnVlLFxuXHRcdFx0YXJnczogWycnXSxcblx0XHRcdHNob3dPdXRwdXQ6ICdhbHdheXMnLFxuXHRcdFx0J3Rhc2tzJzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dGFza05hbWU6ICdidWlsZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2Jhc2gnLFxuXHRcdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHRcdCdidWlsZC5zaCdcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29uZmlndXJhdGlvbkJ1aWxkZXIoKTtcblx0XHRidWlsZGVyLnRhc2soJ2J1aWxkJywgJ2Jhc2gnKS5cblx0XHRcdGdyb3VwKFRhc2tzLlRhc2tHcm91cC5CdWlsZCkuXG5cdFx0XHRjb21tYW5kKCkuc3VwcHJlc3NUYXNrTmFtZSh0cnVlKS5cblx0XHRcdGFyZ3MoWydidWlsZC5zaCddKS5cblx0XHRcdHJ1bnRpbWUoVGFza3MuUnVudGltZVR5cGUuU2hlbGwpO1xuXHRcdHRlc3RDb25maWd1cmF0aW9uKGV4dGVybmFsLCBidWlsZGVyKTtcblx0fSk7XG59KTtcblxuY2xhc3MgVGVzdE5hbWVkUHJvYmxlbU1hdGNoZXIgaW1wbGVtZW50cyBQYXJ0aWFsPFByb2JsZW1NYXRjaGVyPiB7XG59XG5cbmNsYXNzIFRlc3RQYXJzZUNvbnRleHQgaW1wbGVtZW50cyBQYXJ0aWFsPElQYXJzZUNvbnRleHQ+IHtcbn1cblxuY2xhc3MgVGVzdFRhc2tEZWZpbml0aW9uUmVnaXN0cnkgaW1wbGVtZW50cyBQYXJ0aWFsPElUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5PiB7XG5cdHByaXZhdGUgX3Rhc2s6IFRhc2tzLklUYXNrRGVmaW5pdGlvbiB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldChrZXk6IHN0cmluZyk6IFRhc2tzLklUYXNrRGVmaW5pdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rhc2shO1xuXHR9XG5cdHB1YmxpYyBzZXQodGFzazogVGFza3MuSVRhc2tEZWZpbml0aW9uKSB7XG5cdFx0dGhpcy5fdGFzayA9IHRhc2s7XG5cdH1cbn1cblxuc3VpdGUoJ1Rhc2sgY29uZmlndXJhdGlvbiBjb252ZXJzaW9ucycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgZ2xvYmFscyA9IHt9IGFzIElHbG9iYWxzO1xuXHRjb25zdCB0YXNrQ29uZmlnU291cmNlID0ge30gYXMgVGFza0NvbmZpZ1NvdXJjZTtcblx0Y29uc3QgVGFza0RlZmluaXRpb25SZWdpc3RyeSA9IG5ldyBUZXN0VGFza0RlZmluaXRpb25SZWdpc3RyeSgpO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHBhcnNlQ29udGV4dDogSVBhcnNlQ29udGV4dDtcblx0bGV0IG5hbWVkUHJvYmxlbU1hdGNoZXI6IElOYW1lZFByb2JsZW1NYXRjaGVyO1xuXHRsZXQgcHJvYmxlbVJlcG9ydGVyOiBQcm9ibGVtUmVwb3J0ZXI7XG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0XHRuYW1lZFByb2JsZW1NYXRjaGVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdE5hbWVkUHJvYmxlbU1hdGNoZXIpO1xuXHRcdG5hbWVkUHJvYmxlbU1hdGNoZXIubmFtZSA9ICdyZWFsJztcblx0XHRuYW1lZFByb2JsZW1NYXRjaGVyLmxhYmVsID0gJ3JlYWwgbGFiZWwnO1xuXHRcdHByb2JsZW1SZXBvcnRlciA9IG5ldyBQcm9ibGVtUmVwb3J0ZXIoKTtcblx0XHRwYXJzZUNvbnRleHQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UGFyc2VDb250ZXh0KTtcblx0XHRwYXJzZUNvbnRleHQucHJvYmxlbVJlcG9ydGVyID0gcHJvYmxlbVJlcG9ydGVyO1xuXHRcdHBhcnNlQ29udGV4dC5uYW1lZFByb2JsZW1NYXRjaGVycyA9IHsgJ3JlYWwnOiBuYW1lZFByb2JsZW1NYXRjaGVyIH07XG5cdFx0cGFyc2VDb250ZXh0LnV1aWRNYXAgPSBuZXcgVVVJRE1hcCgpO1xuXHR9KTtcblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cdHN1aXRlKCdQcm9ibGVtTWF0Y2hlckNvbnZlcnRlci5mcm9tJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgW10gYW5kIGFuIGVycm9yIGZvciBhbiB1bmtub3duIHByb2JsZW0gbWF0Y2hlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IChQcm9ibGVtTWF0Y2hlckNvbnZlcnRlci5mcm9tKCckZmFrZScsIHBhcnNlQ29udGV4dCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQudmFsdWUsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzPy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3JldHVybnMgY29uZmlnIGZvciBhIGtub3duIHByb2JsZW0gbWF0Y2hlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IChQcm9ibGVtTWF0Y2hlckNvbnZlcnRlci5mcm9tKCckcmVhbCcsIHBhcnNlQ29udGV4dCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvcnM/Lmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC52YWx1ZSwgW3sgJ2xhYmVsJzogJ3JlYWwgbGFiZWwnIH1dKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdyZXR1cm5zIGNvbmZpZyBmb3IgYSBrbm93biBwcm9ibGVtIG1hdGNoZXIgaW5jbHVkaW5nIGFwcGx5VG8nLCAoKSA9PiB7XG5cdFx0XHRuYW1lZFByb2JsZW1NYXRjaGVyLmFwcGx5VG8gPSBBcHBseVRvS2luZC5jbG9zZWREb2N1bWVudHM7XG5cdFx0XHRjb25zdCByZXN1bHQgPSAoUHJvYmxlbU1hdGNoZXJDb252ZXJ0ZXIuZnJvbSgnJHJlYWwnLCBwYXJzZUNvbnRleHQpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzPy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQudmFsdWUsIFt7ICdsYWJlbCc6ICdyZWFsIGxhYmVsJywgJ2FwcGx5VG8nOiBBcHBseVRvS2luZC5jbG9zZWREb2N1bWVudHMgfV0pO1xuXHRcdH0pO1xuXHR9KTtcblx0c3VpdGUoJ1Rhc2tQYXJzZXIuZnJvbScsICgpID0+IHtcblx0XHRzdWl0ZSgnQ3VzdG9tVGFzaycsICgpID0+IHtcblx0XHRcdHN1aXRlKCdpbmNvbXBsZXRlIGNvbmZpZyByZXBvcnRzIGFuIGFwcHJvcHJpYXRlIGVycm9yIGZvciBtaXNzaW5nJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCduYW1lJywgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IFRhc2tQYXJzZXIuZnJvbShbe30gYXMgSUN1c3RvbVRhc2tdLCBnbG9iYWxzLCBwYXJzZUNvbnRleHQsIHRhc2tDb25maWdTb3VyY2UpO1xuXHRcdFx0XHRcdGFzc2VydFRhc2tQYXJzZVJlc3VsdChyZXN1bHQsIHVuZGVmaW5lZCwgcHJvYmxlbVJlcG9ydGVyLCAnRXJyb3I6IGEgdGFzayBtdXN0IHByb3ZpZGUgYSBsYWJlbCBwcm9wZXJ0eScpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnY29tbWFuZCcsICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBUYXNrUGFyc2VyLmZyb20oW3sgdGFza05hbWU6ICd0YXNrJyB9IGFzIElDdXN0b21UYXNrXSwgZ2xvYmFscywgcGFyc2VDb250ZXh0LCB0YXNrQ29uZmlnU291cmNlKTtcblx0XHRcdFx0XHRhc3NlcnRUYXNrUGFyc2VSZXN1bHQocmVzdWx0LCB1bmRlZmluZWQsIHByb2JsZW1SZXBvcnRlciwgYEVycm9yOiB0aGUgdGFzayAndGFzaycgZG9lc24ndCBkZWZpbmUgYSBjb21tYW5kYCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdyZXR1cm5zIGV4cGVjdGVkIHJlc3VsdCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRcdFx0eyB0YXNrTmFtZTogJ3Rhc2snLCBjb21tYW5kOiAnZWNobyB0ZXN0JyB9IGFzIElDdXN0b21UYXNrLFxuXHRcdFx0XHRcdHsgdGFza05hbWU6ICd0YXNrIDInLCBjb21tYW5kOiAnZWNobyB0ZXN0JyB9IGFzIElDdXN0b21UYXNrXG5cdFx0XHRcdF07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IFRhc2tQYXJzZXIuZnJvbShleHBlY3RlZCwgZ2xvYmFscywgcGFyc2VDb250ZXh0LCB0YXNrQ29uZmlnU291cmNlKTtcblx0XHRcdFx0YXNzZXJ0VGFza1BhcnNlUmVzdWx0KHJlc3VsdCwgeyBjdXN0b206IGV4cGVjdGVkIH0sIHByb2JsZW1SZXBvcnRlciwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdDb25maWd1cmVkVGFzaycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3JldHVybnMgZXhwZWN0ZWQgcmVzdWx0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IFt7IHRhc2tOYW1lOiAndGFzaycsIGNvbW1hbmQ6ICdlY2hvIHRlc3QnLCB0eXBlOiAnYW55JywgbGFiZWw6ICd0YXNrJyB9LCB7IHRhc2tOYW1lOiAndGFzayAyJywgY29tbWFuZDogJ2VjaG8gdGVzdCcsIHR5cGU6ICdhbnknLCBsYWJlbDogJ3Rhc2sgMicgfV07XG5cdFx0XHRcdFRhc2tEZWZpbml0aW9uUmVnaXN0cnkuc2V0KHsgZXh0ZW5zaW9uSWQ6ICdyZWdpc3RlcmVkJywgdGFza1R5cGU6ICdhbnknLCBwcm9wZXJ0aWVzOiB7fSB9IGFzIFRhc2tzLklUYXNrRGVmaW5pdGlvbik7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IFRhc2tQYXJzZXIuZnJvbShleHBlY3RlZCwgZ2xvYmFscywgcGFyc2VDb250ZXh0LCB0YXNrQ29uZmlnU291cmNlLCBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5KTtcblx0XHRcdFx0YXNzZXJ0VGFza1BhcnNlUmVzdWx0KHJlc3VsdCwgeyBjb25maWd1cmVkOiBleHBlY3RlZCB9LCBwcm9ibGVtUmVwb3J0ZXIsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gYXNzZXJ0VGFza1BhcnNlUmVzdWx0KGFjdHVhbDogSVRhc2tQYXJzZVJlc3VsdCwgZXhwZWN0ZWQ6IElUZXN0VGFza1BhcnNlUmVzdWx0IHwgdW5kZWZpbmVkLCBwcm9ibGVtUmVwb3J0ZXI6IFByb2JsZW1SZXBvcnRlciwgZXhwZWN0ZWRNZXNzYWdlPzogc3RyaW5nKTogdm9pZCB7XG5cdGlmIChleHBlY3RlZE1lc3NhZ2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9ibGVtUmVwb3J0ZXIubGFzdE1lc3NhZ2UsIHVuZGVmaW5lZCk7XG5cdH0gZWxzZSB7XG5cdFx0YXNzZXJ0Lm9rKHByb2JsZW1SZXBvcnRlci5sYXN0TWVzc2FnZT8uaW5jbHVkZXMoZXhwZWN0ZWRNZXNzYWdlKSk7XG5cdH1cblxuXHRhc3NlcnQuZGVlcEVxdWFsKGFjdHVhbC5jdXN0b20ubGVuZ3RoLCBleHBlY3RlZD8uY3VzdG9tPy5sZW5ndGggfHwgMCk7XG5cdGFzc2VydC5kZWVwRXF1YWwoYWN0dWFsLmNvbmZpZ3VyZWQubGVuZ3RoLCBleHBlY3RlZD8uY29uZmlndXJlZD8ubGVuZ3RoIHx8IDApO1xuXG5cdGxldCBpbmRleCA9IDA7XG5cdGlmIChleHBlY3RlZD8uY29uZmlndXJlZCkge1xuXHRcdGZvciAoY29uc3QgdGFza1BhcnNlUmVzdWx0IG9mIGV4cGVjdGVkPy5jb25maWd1cmVkKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZpZ3VyZWRbaW5kZXhdLl9sYWJlbCwgdGFza1BhcnNlUmVzdWx0LmxhYmVsKTtcblx0XHRcdGluZGV4Kys7XG5cdFx0fVxuXHR9XG5cdGluZGV4ID0gMDtcblx0aWYgKGV4cGVjdGVkPy5jdXN0b20pIHtcblx0XHRmb3IgKGNvbnN0IHRhc2tQYXJzZVJlc3VsdCBvZiBleHBlY3RlZD8uY3VzdG9tKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmN1c3RvbVtpbmRleF0uX2xhYmVsLCB0YXNrUGFyc2VSZXN1bHQudGFza05hbWUpO1xuXHRcdFx0aW5kZXgrKztcblx0XHR9XG5cdH1cblx0cHJvYmxlbVJlcG9ydGVyLmNsZWFyTWVzc2FnZSgpO1xufVxuXG5pbnRlcmZhY2UgSVRlc3RUYXNrUGFyc2VSZXN1bHQge1xuXHRjdXN0b20/OiBQYXJ0aWFsPElDdXN0b21UYXNrPltdO1xuXHRjb25maWd1cmVkPzogUGFydGlhbDxJVGVzdENvbmZpZ3VyaW5nVGFzaz5bXTtcbn1cblxuaW50ZXJmYWNlIElUZXN0Q29uZmlndXJpbmdUYXNrIGV4dGVuZHMgUGFydGlhbDxUYXNrcy5Db25maWd1cmluZ1Rhc2s+IHtcblx0bGFiZWw6IHN0cmluZztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLFNBQVMsV0FBVztBQUNwQixPQUFPLFlBQVk7QUFDbkIsT0FBTyxjQUFjO0FBQ3JCLFlBQVksVUFBVTtBQUV0QixZQUFZLFdBQVc7QUFDdkIsWUFBWSxjQUFjO0FBQzFCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQXlCLGtCQUFtQyxtQkFBeUM7QUFDckcsU0FBUyx1QkFBbUM7QUFFNUMsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsT0FBc0Ysa0JBQWlDLHlCQUFxRCxTQUFTLGtCQUFrQjtBQUNoTixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdDQUFnQztBQUV6QyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLGtCQUFtQyxJQUFJLGdCQUFnQjtBQUFBLEVBQzVELEtBQUssSUFBSSxLQUFLLHNCQUFzQjtBQUFBLEVBQ3BDLE1BQU07QUFBQSxFQUNOLE9BQU87QUFDUixDQUFDO0FBRUQsTUFBTSxZQUF3QixJQUFJLFVBQVUsTUFBTSxDQUFDLGVBQWUsQ0FBQztBQUVuRSxNQUFNLGdCQUE0QztBQUFBLEVBQWxEO0FBRUMsU0FBUSxvQkFBc0MsSUFBSSxpQkFBaUI7QUFFbkUsU0FBTyxrQkFBMkI7QUFDbEMsU0FBTyxjQUFrQztBQUFBO0FBQUEsRUFFbEMsS0FBSyxTQUF1QjtBQUNsQyxTQUFLLElBQUksT0FBTztBQUFBLEVBQ2pCO0FBQUEsRUFFTyxLQUFL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
