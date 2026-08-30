import assert from "assert";
import * as sinon from "sinon";
import sinonTest from "sinon-test";
import { mainWindow } from "../../../../base/browser/window.js";
import * as Errors from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import product from "../../../product/common/product.js";
import ErrorTelemetry from "../../browser/errorTelemetry.js";
import { TelemetryConfiguration, TelemetryLevel } from "../../common/telemetry.js";
import { TelemetryService } from "../../common/telemetryService.js";
import { NullAppender } from "../../common/telemetryUtils.js";
const sinonTestFn = sinonTest(sinon);
class TestTelemetryAppender {
  constructor() {
    this.events = [];
    this.isDisposed = false;
  }
  log(eventName, data) {
    this.events.push({ eventName, data });
  }
  getEventsCount() {
    return this.events.length;
  }
  flush() {
    this.isDisposed = true;
    return Promise.resolve(null);
  }
}
class ErrorTestingSettings {
  constructor() {
    this.randomUserFile = "a/path/that/doe_snt/con-tain/code/names.js";
    this.anonymizedRandomUserFile = "<REDACTED: user-file-path>";
    this.nodeModulePathToRetain = "node_modules/path/that/shouldbe/retained/names.js:14:15854";
    this.anonymizedNodeModulePath = "<REDACTED: user-file-path>/node_modules/path/that/shouldbe/retained/names.js:14:15854";
    this.nodeModuleAsarPathToRetain = "node_modules.asar/path/that/shouldbe/retained/names.js:14:12354";
    this.anonymizedNodeModuleAsarPath = "<REDACTED: user-file-path>/node_modules.asar/path/that/shouldbe/retained/names.js:14:12354";
    this.fullNodeModulePath = "/Users/username/projects/vscode/node_modules/@xterm/xterm/lib/xterm.js:1:243732";
    this.anonymizedFullNodeModulePath = "<REDACTED: user-file-path>/node_modules/@xterm/xterm/lib/xterm.js:1:243732";
    this.fullNodeModuleAsarPath = "/Users/username/projects/vscode/node_modules.asar/@xterm/xterm/lib/xterm.js:1:376066";
    this.anonymizedFullNodeModuleAsarPath = "<REDACTED: user-file-path>/node_modules.asar/@xterm/xterm/lib/xterm.js:1:376066";
    this.extensionPathToRetain = ".vscode/extensions/ms-python.python-2024.0.1/out/extension.js:144:145516";
    this.fullExtensionPath = "/Users/username/.vscode/extensions/ms-python.python-2024.0.1/out/extension.js:144:145516";
    this.anonymizedExtensionPath = "<REDACTED: user-file-path>/.vscode/extensions/ms-python.python-2024.0.1/out/extension.js:144:145516";
    this.serverInsidersExtensionPathToRetain = ".vscode-server-insiders/extensions/ms-vscode.remote-server-2024.1.0/out/server.js:99:8888";
    this.fullServerInsidersExtensionPath = "/home/user/.vscode-server-insiders/extensions/ms-vscode.remote-server-2024.1.0/out/server.js:99:8888";
    this.anonymizedServerInsidersExtensionPath = "<REDACTED: user-file-path>/.vscode-server-insiders/extensions/ms-vscode.remote-server-2024.1.0/out/server.js:99:8888";
    this.builtinExtensionPathToRetain = "Resources/app/extensions/git/out/git.js:42:1234";
    this.fullBuiltinExtensionPath = "/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/git/out/git.js:42:1234";
    this.anonymizedBuiltinExtensionPath = "<REDACTED: user-file-path>/Resources/app/extensions/git/out/git.js:42:1234";
    this.personalInfo = "DANGEROUS/PATH";
    this.importantInfo = "important/information";
    this.filePrefix = "file:///";
    this.dangerousPathWithImportantInfo = this.filePrefix + this.personalInfo + "/resources/app/" + this.importantInfo;
    this.dangerousPathWithoutImportantInfo = this.filePrefix + this.personalInfo;
    this.missingModelPrefix = "Received model events for missing model ";
    this.missingModelMessage = this.missingModelPrefix + " " + this.dangerousPathWithoutImportantInfo;
    this.noSuchFilePrefix = "ENOENT: no such file or directory";
    this.noSuchFileMessage = this.noSuchFilePrefix + " '" + this.personalInfo + "'";
    this.stack = [
      `at e._modelEvents (${this.randomUserFile}:11:7309)`,
      `    at t.AllWorkers (${this.randomUserFile}:6:8844)`,
      `    at e.(anonymous function) [as _modelEvents] (${this.randomUserFile}:5:29552)`,
      `    at Function.<anonymous> (${this.randomUserFile}:6:8272)`,
      `    at e.dispatch (${this.randomUserFile}:5:26931)`,
      `    at e.request (/${this.nodeModuleAsarPathToRetain})`,
      `    at t._handleMessage (${this.nodeModuleAsarPathToRetain})`,
      `    at t._onmessage (/${this.nodeModulePathToRetain})`,
      `    at t.onmessage (${this.nodeModulePathToRetain})`,
      `    at get dimensions (${this.fullNodeModulePath})`,
      `    at _._refreshCanvasDimensions (${this.fullNodeModuleAsarPath})`,
      `    at uv.provideCodeActions (${this.fullExtensionPath})`,
      `    at remote.handleConnection (${this.fullServerInsidersExtensionPath})`,
      `    at git.getRepositoryState (${this.fullBuiltinExtensionPath})`,
      `    at DedicatedWorkerGlobalScope.self.onmessage`,
      this.dangerousPathWithImportantInfo,
      this.dangerousPathWithoutImportantInfo,
      this.missingModelMessage,
      this.noSuchFileMessage
    ];
  }
}
suite("TelemetryService", () => {
  const TestProductService = { _serviceBrand: void 0, ...product };
  test("Disposing", sinonTestFn(function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
    service.publicLog("testPrivateEvent");
    assert.strictEqual(testAppender.getEventsCount(), 1);
    service.dispose();
    assert.strictEqual(!testAppender.isDisposed, true);
  }));
  test("Simple event", sinonTestFn(function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent");
    assert.strictEqual(testAppender.getEventsCount(), 1);
    assert.strictEqual(testAppender.events[0].eventName, "testEvent");
    assert.notStrictEqual(testAppender.events[0].data, null);
    service.dispose();
  }));
  test("Event with data", sinonTestFn(function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent", {
      "stringProp": "property",
      "numberProp": 1,
      "booleanProp": true,
      "complexProp": {
        "value": 0
      }
    });
    assert.strictEqual(testAppender.getEventsCount(), 1);
    assert.strictEqual(testAppender.events[0].eventName, "testEvent");
    assert.notStrictEqual(testAppender.events[0].data, null);
    assert.strictEqual(testAppender.events[0].data["stringProp"], "property");
    assert.strictEqual(testAppender.events[0].data["numberProp"], 1);
    assert.strictEqual(testAppender.events[0].data["booleanProp"], true);
    assert.strictEqual(testAppender.events[0].data["complexProp"].value, 0);
    service.dispose();
  }));
  test("common properties added to *all* events, simple event", function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({
      appenders: [testAppender],
      commonProperties: { foo: "JA!", get bar() {
        return Math.random() % 2 === 0;
      } }
    }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent");
    const [first] = testAppender.events;
    assert.strictEqual(Object.keys(first.data).length, 2);
    assert.strictEqual(typeof first.data["foo"], "string");
    assert.strictEqual(typeof first.data["bar"], "boolean");
    service.dispose();
  });
  test("common properties added to *all* events, event with data", function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({
      appenders: [testAppender],
      commonProperties: { foo: "JA!", get bar() {
        return Math.random() % 2 === 0;
      } }
    }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent", { hightower: "xl", price: 8e3 });
    const [first] = testAppender.events;
    assert.strictEqual(Object.keys(first.data).length, 4);
    assert.strictEqual(typeof first.data["foo"], "string");
    assert.strictEqual(typeof first.data["bar"], "boolean");
    assert.strictEqual(typeof first.data["hightower"], "string");
    assert.strictEqual(typeof first.data["price"], "number");
    service.dispose();
  });
  test("TelemetryInfo comes from properties", function() {
    const service = new TelemetryService({
      appenders: [NullAppender],
      commonProperties: {
        sessionID: "one",
        ["common.machineId"]: "three"
      }
    }, new TestConfigurationService(), TestProductService);
    assert.strictEqual(service.sessionId, "one");
    assert.strictEqual(service.machineId, "three");
    service.dispose();
  });
  test("setCommonProperty adds property to all subsequent events", function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({
      appenders: [testAppender]
    }, new TestConfigurationService(), TestProductService);
    service.publicLog("eventBeforeSet");
    service.setCommonProperty("common.copilotTrackingId", "test-tracking-id");
    service.publicLog("eventAfterSet");
    assert.strictEqual(testAppender.events[0].data["common.copilotTrackingId"], void 0);
    assert.strictEqual(testAppender.events[1].data["common.copilotTrackingId"], "test-tracking-id");
    service.dispose();
  });
  test("telemetry on by default", function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent");
    assert.strictEqual(testAppender.getEventsCount(), 1);
    assert.strictEqual(testAppender.events[0].eventName, "testEvent");
    service.dispose();
  });
  class TestErrorTelemetryService extends TelemetryService {
    constructor(config) {
      super({ ...config, sendErrorTelemetry: true }, new TestConfigurationService(), TestProductService);
    }
  }
  test("Error events", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const e = new Error("This is a test.");
      if (!e.stack) {
        e.stack = "blah";
      }
      Errors.onUnexpectedError(e);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      assert.strictEqual(testAppender.events[0].eventName, "UnhandledError");
      assert.strictEqual(testAppender.events[0].data.msg, "This is a test.");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Handle global errors", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const testError = new Error("test");
    mainWindow.onerror("Error Message", "file.js", 2, 42, testError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.alwaysCalledWithExactly("Error Message", "file.js", 2, 42, testError), true);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.getEventsCount(), 1);
    assert.strictEqual(testAppender.events[0].eventName, "UnhandledError");
    assert.strictEqual(testAppender.events[0].data.msg, "Error Message");
    assert.strictEqual(testAppender.events[0].data.file, "file.js");
    assert.strictEqual(testAppender.events[0].data.line, 2);
    assert.strictEqual(testAppender.events[0].data.column, 42);
    assert.strictEqual(testAppender.events[0].data.uncaught_error_msg, "test");
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Error Telemetry removes PII from filename with spaces", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const personInfoWithSpaces = settings.personalInfo.slice(0, 2) + " " + settings.personalInfo.slice(2);
    const dangerousFilenameError = new Error("dangerousFilename");
    dangerousFilenameError.stack = settings.stack;
    mainWindow.onerror("dangerousFilename", settings.dangerousPathWithImportantInfo.replace(settings.personalInfo, personInfoWithSpaces) + "/test.js", 2, 42, dangerousFilenameError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.file.indexOf(settings.dangerousPathWithImportantInfo.replace(settings.personalInfo, personInfoWithSpaces)), -1);
    assert.strictEqual(testAppender.events[0].data.file, settings.importantInfo + "/test.js");
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Uncaught Error Telemetry removes PII from filename", sinonTestFn(function() {
    const clock = this.clock;
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    let dangerousFilenameError = new Error("dangerousFilename");
    dangerousFilenameError.stack = settings.stack;
    mainWindow.onerror("dangerousFilename", settings.dangerousPathWithImportantInfo + "/test.js", 2, 42, dangerousFilenameError);
    clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.file.indexOf(settings.dangerousPathWithImportantInfo), -1);
    dangerousFilenameError = new Error("dangerousFilename");
    dangerousFilenameError.stack = settings.stack;
    mainWindow.onerror("dangerousFilename", settings.dangerousPathWithImportantInfo + "/test.js", 2, 42, dangerousFilenameError);
    clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 2);
    assert.strictEqual(testAppender.events[0].data.file.indexOf(settings.dangerousPathWithImportantInfo), -1);
    assert.strictEqual(testAppender.events[0].data.file, settings.importantInfo + "/test.js");
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes PII", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const dangerousPathWithoutImportantInfoError = new Error(settings.dangerousPathWithoutImportantInfo);
      dangerousPathWithoutImportantInfoError.stack = settings.stack;
      Errors.onUnexpectedError(dangerousPathWithoutImportantInfoError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Unexpected Error Telemetry redacts only offending frames and preserves the rest of the callstack", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const stack = [
        "Error: Something failed",
        "    at StorageService.getStorageKey (out/vs/platform/storage/storage.js:1:200)",
        "    at Foo.run (out/vs/workbench/foo.js:3:40)",
        "    at Bar.baz (out/vs/workbench/bar.js:5:60)"
      ];
      const error = new Error("Something failed");
      error.stack = stack.join("\n");
      Errors.onUnexpectedError(error);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      const cs = testAppender.events[0].data.callstack;
      assert.notStrictEqual(cs, "<REDACTED: Generic Secret>", "Entire callstack should not be redacted");
      assert.strictEqual(cs.split("\n").length, stack.length, "All frames should be preserved");
      assert.notStrictEqual(cs.indexOf("Foo.run"), -1, "Non-offending frames should be preserved");
      assert.notStrictEqual(cs.indexOf("Bar.baz"), -1, "Non-offending frames should be preserved");
      assert.strictEqual(cs.indexOf("getStorageKey"), -1, "Offending frame should be redacted");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Unexpected Error Telemetry still redacts a frame whose trailing token relies on the newline delimiter", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const stack = [
        "Error: boom",
        "    at Service.getApiKey",
        "    at Foo.run (out/vs/workbench/foo.js:3:40)"
      ];
      const error = new Error("boom");
      error.stack = stack.join("\n");
      Errors.onUnexpectedError(error);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      const cs = testAppender.events[0].data.callstack;
      assert.strictEqual(cs.indexOf("getApiKey"), -1, "Trailing-token frame should still be redacted");
      assert.notStrictEqual(cs.indexOf("Foo.run"), -1, "Other frames should be preserved");
      assert.strictEqual(cs.split("\n").length, stack.length, "All frames should be preserved");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes PII", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const dangerousPathWithoutImportantInfoError = new Error("dangerousPathWithoutImportantInfo");
    dangerousPathWithoutImportantInfoError.stack = settings.stack;
    mainWindow.onerror(settings.dangerousPathWithoutImportantInfo, "test.js", 2, 42, dangerousPathWithoutImportantInfoError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes PII but preserves Code file path", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const dangerousPathWithImportantInfoError = new Error(settings.dangerousPathWithImportantInfo);
      dangerousPathWithImportantInfoError.stack = settings.stack;
      Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes PII but preserves Code file path", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const dangerousPathWithImportantInfoError = new Error("dangerousPathWithImportantInfo");
    dangerousPathWithImportantInfoError.stack = settings.stack;
    mainWindow.onerror(settings.dangerousPathWithImportantInfo, "test.js", 2, 42, dangerousPathWithImportantInfoError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.anonymizedNodeModuleAsarPath), -1, "bare node_modules.asar path");
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.anonymizedNodeModulePath), -1, "bare node_modules path");
    assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes PII but preserves Code file path with node modules", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const dangerousPathWithImportantInfoError = new Error(settings.dangerousPathWithImportantInfo);
      dangerousPathWithImportantInfoError.stack = settings.stack;
      Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      const cs = testAppender.events[0].data.callstack;
      assert.notStrictEqual(cs.indexOf(settings.anonymizedNodeModuleAsarPath), -1, "bare node_modules.asar path");
      assert.notStrictEqual(cs.indexOf(settings.anonymizedNodeModulePath), -1, "bare node_modules path");
      assert.notStrictEqual(cs.indexOf(settings.anonymizedFullNodeModulePath), -1, "full node_modules path");
      assert.notStrictEqual(cs.indexOf(settings.anonymizedFullNodeModuleAsarPath), -1, "full node_modules.asar path");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Unexpected Error Telemetry removes PII but preserves extension path", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const dangerousPathWithImportantInfoError = new Error(settings.dangerousPathWithImportantInfo);
      dangerousPathWithImportantInfoError.stack = settings.stack;
      Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.extensionPathToRetain), -1, "User extension path should be retained");
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.anonymizedExtensionPath), -1, "User extension path should be anonymized with preserved extension name");
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("/Users/username/"), -1, "Username should be redacted from extension path");
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.serverInsidersExtensionPathToRetain), -1, "Server-insiders extension path should be retained");
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.anonymizedServerInsidersExtensionPath), -1, "Server-insiders extension path should be anonymized with preserved extension name");
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("/home/user/"), -1, "Home directory should be redacted from server-insiders extension path");
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.builtinExtensionPathToRetain), -1, "Built-in extension path should be retained");
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.anonymizedBuiltinExtensionPath), -1, "Built-in extension path should be anonymized with preserved extension name");
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("/Applications/Visual Studio Code.app"), -1, "App path should be redacted from built-in extension path");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Unexpected Error Telemetry removes PII but preserves Code file path when PIIPath is configured", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender], piiPaths: [settings.personalInfo + "/resources/app/"] });
      const errorTelemetry = new ErrorTelemetry(service);
      const dangerousPathWithImportantInfoError = new Error(settings.dangerousPathWithImportantInfo);
      dangerousPathWithImportantInfoError.stack = settings.stack;
      Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes PII but preserves Code file path when PIIPath is configured", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender], piiPaths: [settings.personalInfo + "/resources/app/"] });
    const errorTelemetry = new ErrorTelemetry(service);
    const dangerousPathWithImportantInfoError = new Error("dangerousPathWithImportantInfo");
    dangerousPathWithImportantInfoError.stack = settings.stack;
    mainWindow.onerror(settings.dangerousPathWithImportantInfo, "test.js", 2, 42, dangerousPathWithImportantInfoError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes PII but preserves Missing Model error message", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const missingModelError = new Error(settings.missingModelMessage);
      missingModelError.stack = settings.stack;
      Errors.onUnexpectedError(missingModelError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.missingModelPrefix), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.missingModelPrefix), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes PII but preserves Missing Model error message", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const missingModelError = new Error("missingModelMessage");
    missingModelError.stack = settings.stack;
    mainWindow.onerror(settings.missingModelMessage, "test.js", 2, 42, missingModelError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.missingModelPrefix), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.missingModelPrefix), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes PII but preserves No Such File error message", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const noSuchFileError = new Error(settings.noSuchFileMessage);
      noSuchFileError.stack = settings.stack;
      Errors.onUnexpectedError(noSuchFileError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.noSuchFilePrefix), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.noSuchFilePrefix), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes PII but preserves No Such File error message", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const errorStub = sinon.stub();
      mainWindow.onerror = errorStub;
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const noSuchFileError = new Error("noSuchFileMessage");
      noSuchFileError.stack = settings.stack;
      mainWindow.onerror(settings.noSuchFileMessage, "test.js", 2, 42, noSuchFileError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(errorStub.callCount, 1);
      Errors.onUnexpectedError(noSuchFileError);
      assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.noSuchFilePrefix), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.noSuchFilePrefix), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
      sinon.restore();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Telemetry Service sends events when telemetry is on", sinonTestFn(function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent");
    assert.strictEqual(testAppender.getEventsCount(), 1);
    service.dispose();
  }));
  test("Telemetry Service checks with config service", function() {
    let telemetryLevel = TelemetryConfiguration.OFF;
    const emitter = new Emitter();
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({
      appenders: [testAppender]
    }, new class extends TestConfigurationService {
      constructor() {
        super(...arguments);
        this.onDidChangeConfiguration = emitter.event;
      }
      getValue() {
        return telemetryLevel;
      }
    }(), TestProductService);
    assert.strictEqual(service.telemetryLevel, TelemetryLevel.NONE);
    telemetryLevel = TelemetryConfiguration.ON;
    emitter.fire({ affectsConfiguration: () => true });
    assert.strictEqual(service.telemetryLevel, TelemetryLevel.USAGE);
    telemetryLevel = TelemetryConfiguration.ERROR;
    emitter.fire({ affectsConfiguration: () => true });
    assert.strictEqual(service.telemetryLevel, TelemetryLevel.ERROR);
    service.dispose();
  });
  test("Unexpected Error Telemetry removes Windows PII but preserves code path", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const windowsUserPath = "c:/Users/bpasero/AppData/Local/Programs/Microsoft%20VS%20Code%20Insiders/resources/app/";
      const codePath = "out/vs/workbench/workbench.desktop.main.js";
      const stack = [
        `    at cTe.gc (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:81492)`,
        `    at async cTe.setInput (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:80650)`,
        `    at async qJe.S (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:58520)`,
        `    at async qJe.L (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:57080)`,
        `    at async qJe.openEditor (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:56162)`
      ];
      const windowsError = new Error("The editor could not be opened because the file was not found.");
      windowsError.stack = stack.join("\n");
      Errors.onUnexpectedError(windowsError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("bpasero"), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Users"), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("c:/Users"), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes Windows PII but preserves code path", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const windowsUserPath = "c:/Users/bpasero/AppData/Local/Programs/Microsoft%20VS%20Code%20Insiders/resources/app/";
    const codePath = "out/vs/workbench/workbench.desktop.main.js";
    const stack = [
      `    at cTe.gc (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:81492)`,
      `    at async cTe.setInput (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:80650)`,
      `    at async qJe.S (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:58520)`
    ];
    const windowsError = new Error("The editor could not be opened because the file was not found.");
    windowsError.stack = stack.join("\n");
    mainWindow.onerror("The editor could not be opened because the file was not found.", "test.js", 2, 42, windowsError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("bpasero"), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Users"), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("c:/Users"), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes macOS PII but preserves code path", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const macUserPath = "Applications/Visual%20Studio%20Code%20-%20Insiders.app/Contents/Resources/app/";
      const codePath = "out/vs/workbench/workbench.desktop.main.js";
      const stack = [
        `    at uTe.gc (vscode-file://vscode-app/${macUserPath}${codePath}:2720:81492)`,
        `    at async uTe.setInput (vscode-file://vscode-app/${macUserPath}${codePath}:2720:80650)`,
        `    at async JJe.S (vscode-file://vscode-app/${macUserPath}${codePath}:698:58520)`,
        `    at async JJe.L (vscode-file://vscode-app/${macUserPath}${codePath}:698:57080)`,
        `    at async JJe.openEditor (vscode-file://vscode-app/${macUserPath}${codePath}:698:56162)`
      ];
      const macError = new Error("The editor could not be opened because the file was not found.");
      macError.stack = stack.join("\n");
      Errors.onUnexpectedError(macError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Applications/Visual"), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Visual%20Studio%20Code"), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes macOS PII but preserves code path", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const macUserPath = "Applications/Visual%20Studio%20Code%20-%20Insiders.app/Contents/Resources/app/";
    const codePath = "out/vs/workbench/workbench.desktop.main.js";
    const stack = [
      `    at uTe.gc (vscode-file://vscode-app/${macUserPath}${codePath}:2720:81492)`,
      `    at async uTe.setInput (vscode-file://vscode-app/${macUserPath}${codePath}:2720:80650)`,
      `    at async JJe.S (vscode-file://vscode-app/${macUserPath}${codePath}:698:58520)`
    ];
    const macError = new Error("The editor could not be opened because the file was not found.");
    macError.stack = stack.join("\n");
    mainWindow.onerror("The editor could not be opened because the file was not found.", "test.js", 2, 42, macError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Applications/Visual"), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Visual%20Studio%20Code"), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes Linux PII but preserves code path", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const linuxUserPath = "/home/parallels/GitDevelopment/vscode-node-sqlite3-perf/";
      const linuxSystemPath = "usr/share/code-insiders/resources/app/";
      const codePath = "out/vs/workbench/workbench.desktop.main.js";
      const stack = [
        `    at _kt.G (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65940)`,
        `    at _kt.F (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65765)`,
        `    at async axt.L (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3830:9998)`,
        `    at async axt.readStream (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3830:9773)`,
        `    at async mye.Eb (vscode-file://vscode-app/${linuxSystemPath}${codePath}:1313:12359)`
      ];
      const linuxError = new Error(`Invalid fake file 'git:${linuxUserPath}index.js.git?{"path":"${linuxUserPath}index.js","ref":""}' (Canceled: Canceled)`);
      linuxError.stack = stack.join("\n");
      Errors.onUnexpectedError(linuxError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf("parallels"), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf("/home/parallels"), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf("GitDevelopment"), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("parallels"), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("/home/parallels"), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes Linux PII but preserves code path", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const linuxUserPath = "/home/parallels/GitDevelopment/vscode-node-sqlite3-perf/";
    const linuxSystemPath = "usr/share/code-insiders/resources/app/";
    const codePath = "out/vs/workbench/workbench.desktop.main.js";
    const stack = [
      `    at _kt.G (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65940)`,
      `    at _kt.F (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65765)`,
      `    at async axt.L (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3830:9998)`
    ];
    const linuxError = new Error(`Unable to read file 'git:${linuxUserPath}index.js.git'`);
    linuxError.stack = stack.join("\n");
    mainWindow.onerror(`Unable to read file 'git:${linuxUserPath}index.js.git'`, "test.js", 2, 42, linuxError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf("parallels"), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf("/home/parallels"), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf("GitDevelopment"), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("parallels"), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("/home/parallels"), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry strips web origin but preserves path in web stack traces when piiPaths includes origin", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const webOrigin = "https://codespace-host.github.dev";
      const service = new TestErrorTelemetryService({ appenders: [testAppender], piiPaths: [webOrigin] });
      const errorTelemetry = new ErrorTelemetry(service);
      const bundlePath = "/static/build/bundle.js";
      const stack = [
        `Error: Something failed`,
        `    at x3t._delegate (${webOrigin}${bundlePath}:1:200953)`,
        `    at y4u.run (${webOrigin}${bundlePath}:1:304822)`,
        `    at DedicatedWorkerGlobalScope.self.onmessage`
      ];
      const webError = new Error("Something failed");
      webError.stack = stack.join("\n");
      Errors.onUnexpectedError(webError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      const cs = testAppender.events[0].data.callstack;
      assert.strictEqual(cs.indexOf(webOrigin), -1, "Web origin should be stripped");
      assert.strictEqual(cs.indexOf("https://"), -1, "HTTPS scheme should be stripped");
      assert.notStrictEqual(cs.indexOf(bundlePath), -1, "Bundle path should be preserved");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVsZW1ldHJ5XFx0ZXN0XFxicm93c2VyXFx0ZWxlbWV0cnlTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHNpbm9uVGVzdCBmcm9tICdzaW5vbi10ZXN0JztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCAqIGFzIEVycm9ycyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgRXJyb3JUZWxlbWV0cnkgZnJvbSAnLi4vLi4vYnJvd3Nlci9lcnJvclRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBUZWxlbWV0cnlDb25maWd1cmF0aW9uLCBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2VDb25maWcsIFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVsZW1ldHJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5QXBwZW5kZXIsIE51bGxBcHBlbmRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5cbmNvbnN0IHNpbm9uVGVzdEZuID0gc2lub25UZXN0KHNpbm9uKTtcblxuY2xhc3MgVGVzdFRlbGVtZXRyeUFwcGVuZGVyIGltcGxlbWVudHMgSVRlbGVtZXRyeUFwcGVuZGVyIHtcblxuXHRwdWJsaWMgZXZlbnRzOiBhbnlbXTtcblx0cHVibGljIGlzRGlzcG9zZWQ6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5ldmVudHMgPSBbXTtcblx0XHR0aGlzLmlzRGlzcG9zZWQgPSBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBsb2coZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiBhbnkpOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHR9XG5cblx0cHVibGljIGdldEV2ZW50c0NvdW50KCkge1xuXHRcdHJldHVybiB0aGlzLmV2ZW50cy5sZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgZmx1c2goKTogUHJvbWlzZTxhbnk+IHtcblx0XHR0aGlzLmlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdH1cbn1cblxuY2xhc3MgRXJyb3JUZXN0aW5nU2V0dGluZ3Mge1xuXHRwdWJsaWMgcGVyc29uYWxJbmZvOiBzdHJpbmc7XG5cdHB1YmxpYyBpbXBvcnRhbnRJbmZvOiBzdHJpbmc7XG5cdHB1YmxpYyBmaWxlUHJlZml4OiBzdHJpbmc7XG5cdHB1YmxpYyBkYW5nZXJvdXNQYXRoV2l0aG91dEltcG9ydGFudEluZm86IHN0cmluZztcblx0cHVibGljIGRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mbzogc3RyaW5nO1xuXHRwdWJsaWMgbWlzc2luZ01vZGVsUHJlZml4OiBzdHJpbmc7XG5cdHB1YmxpYyBtaXNzaW5nTW9kZWxNZXNzYWdlOiBzdHJpbmc7XG5cdHB1YmxpYyBub1N1Y2hGaWxlUHJlZml4OiBzdHJpbmc7XG5cdHB1YmxpYyBub1N1Y2hGaWxlTWVzc2FnZTogc3RyaW5nO1xuXHRwdWJsaWMgc3RhY2s6IHN0cmluZ1tdO1xuXHRwdWJsaWMgcmFuZG9tVXNlckZpbGU6IHN0cmluZyA9ICdhL3BhdGgvdGhhdC9kb2Vfc250L2Nvbi10YWluL2NvZGUvbmFtZXMuanMnO1xuXHRwdWJsaWMgYW5vbnltaXplZFJhbmRvbVVzZXJGaWxlOiBzdHJpbmcgPSAnPFJFREFDVEVEOiB1c2VyLWZpbGUtcGF0aD4nO1xuXHRwdWJsaWMgbm9kZU1vZHVsZVBhdGhUb1JldGFpbjogc3RyaW5nID0gJ25vZGVfbW9kdWxlcy9wYXRoL3RoYXQvc2hvdWxkYmUvcmV0YWluZWQvbmFtZXMuanM6MTQ6MTU4NTQnO1xuXHRwdWJsaWMgYW5vbnltaXplZE5vZGVNb2R1bGVQYXRoOiBzdHJpbmcgPSAnPFJFREFDVEVEOiB1c2VyLWZpbGUtcGF0aD4vbm9kZV9tb2R1bGVzL3BhdGgvdGhhdC9zaG91bGRiZS9yZXRhaW5lZC9uYW1lcy5qczoxNDoxNTg1NCc7XG5cdHB1YmxpYyBub2RlTW9kdWxlQXNhclBhdGhUb1JldGFpbjogc3RyaW5nID0gJ25vZGVfbW9kdWxlcy5hc2FyL3BhdGgvdGhhdC9zaG91bGRiZS9yZXRhaW5lZC9uYW1lcy5qczoxNDoxMjM1NCc7XG5cdHB1YmxpYyBhbm9ueW1pemVkTm9kZU1vZHVsZUFzYXJQYXRoOiBzdHJpbmcgPSAnPFJFREFDVEVEOiB1c2VyLWZpbGUtcGF0aD4vbm9kZV9tb2R1bGVzLmFzYXIvcGF0aC90aGF0L3Nob3VsZGJlL3JldGFpbmVkL25hbWVzLmpzOjE0OjEyMzU0Jztcblx0cHVibGljIGZ1bGxOb2RlTW9kdWxlUGF0aDogc3RyaW5nID0gJy9Vc2Vycy91c2VybmFtZS9wcm9qZWN0cy92c2NvZGUvbm9kZV9tb2R1bGVzL0B4dGVybS94dGVybS9saWIveHRlcm0uanM6MToyNDM3MzInO1xuXHRwdWJsaWMgYW5vbnltaXplZEZ1bGxOb2RlTW9kdWxlUGF0aDogc3RyaW5nID0gJzxSRURBQ1RFRDogdXNlci1maWxlLXBhdGg+L25vZGVfbW9kdWxlcy9AeHRlcm0veHRlcm0vbGliL3h0ZXJtLmpzOjE6MjQzNzMyJztcblx0cHVibGljIGZ1bGxOb2RlTW9kdWxlQXNhclBhdGg6IHN0cmluZyA9ICcvVXNlcnMvdXNlcm5hbWUvcHJvamVjdHMvdnNjb2RlL25vZGVfbW9kdWxlcy5hc2FyL0B4dGVybS94dGVybS9saWIveHRlcm0uanM6MTozNzYwNjYnO1xuXHRwdWJsaWMgYW5vbnltaXplZEZ1bGxOb2RlTW9kdWxlQXNhclBhdGg6IHN0cmluZyA9ICc8UkVEQUNURUQ6IHVzZXItZmlsZS1wYXRoPi9ub2RlX21vZHVsZXMuYXNhci9AeHRlcm0veHRlcm0vbGliL3h0ZXJtLmpzOjE6Mzc2MDY2Jztcblx0cHVibGljIGV4dGVuc2lvblBhdGhUb1JldGFpbjogc3RyaW5nID0gJy52c2NvZGUvZXh0ZW5zaW9ucy9tcy1weXRob24ucHl0aG9uLTIwMjQuMC4xL291dC9leHRlbnNpb24uanM6MTQ0OjE0NTUxNic7XG5cdHB1YmxpYyBmdWxsRXh0ZW5zaW9uUGF0aDogc3RyaW5nID0gJy9Vc2Vycy91c2VybmFtZS8udnNjb2RlL2V4dGVuc2lvbnMvbXMtcHl0aG9uLnB5dGhvbi0yMDI0LjAuMS9vdXQvZXh0ZW5zaW9uLmpzOjE0NDoxNDU1MTYnO1xuXHRwdWJsaWMgYW5vbnltaXplZEV4dGVuc2lvblBhdGg6IHN0cmluZyA9ICc8UkVEQUNURUQ6IHVzZXItZmlsZS1wYXRoPi8udnNjb2RlL2V4dGVuc2lvbnMvbXMtcHl0aG9uLnB5dGhvbi0yMDI0LjAuMS9vdXQvZXh0ZW5zaW9uLmpzOjE0NDoxNDU1MTYnO1xuXHRwdWJsaWMgc2VydmVySW5zaWRlcnNFeHRlbnNpb25QYXRoVG9SZXRhaW46IHN0cmluZyA9ICcudnNjb2RlLXNlcnZlci1pbnNpZGVycy9leHRlbnNpb25zL21zLXZzY29kZS5yZW1vdGUtc2VydmVyLTIwMjQuMS4wL291dC9zZXJ2ZXIuanM6OTk6ODg4OCc7XG5cdHB1YmxpYyBmdWxsU2VydmVySW5zaWRlcnNFeHRlbnNpb25QYXRoOiBzdHJpbmcgPSAnL2hvbWUvdXNlci8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9leHRlbnNpb25zL21zLXZzY29kZS5yZW1vdGUtc2VydmVyLTIwMjQuMS4wL291dC9zZXJ2ZXIuanM6OTk6ODg4OCc7XG5cdHB1YmxpYyBhbm9ueW1pemVkU2VydmVySW5zaWRlcnNFeHRlbnNpb25QYXRoOiBzdHJpbmcgPSAnPFJFREFDVEVEOiB1c2VyLWZpbGUtcGF0aD4vLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvZXh0ZW5zaW9ucy9tcy12c2NvZGUucmVtb3RlLXNlcnZlci0yMDI0LjEuMC9vdXQvc2VydmVyLmpzOjk5Ojg4ODgnO1xuXHRwdWJsaWMgYnVpbHRpbkV4dGVuc2lvblBhdGhUb1JldGFpbjogc3RyaW5nID0gJ1Jlc291cmNlcy9hcHAvZXh0ZW5zaW9ucy9naXQvb3V0L2dpdC5qczo0MjoxMjM0Jztcblx0cHVibGljIGZ1bGxCdWlsdGluRXh0ZW5zaW9uUGF0aDogc3RyaW5nID0gJy9BcHBsaWNhdGlvbnMvVmlzdWFsIFN0dWRpbyBDb2RlLmFwcC9Db250ZW50cy9SZXNvdXJjZXMvYXBwL2V4dGVuc2lvbnMvZ2l0L291dC9naXQuanM6NDI6MTIzNCc7XG5cdHB1YmxpYyBhbm9ueW1pemVkQnVpbHRpbkV4dGVuc2lvblBhdGg6IHN0cmluZyA9ICc8UkVEQUNURUQ6IHVzZXItZmlsZS1wYXRoPi9SZXNvdXJjZXMvYXBwL2V4dGVuc2lvbnMvZ2l0L291dC9naXQuanM6NDI6MTIzNCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5wZXJzb25hbEluZm8gPSAnREFOR0VST1VTL1BBVEgnO1xuXHRcdHRoaXMuaW1wb3J0YW50SW5mbyA9ICdpbXBvcnRhbnQvaW5mb3JtYXRpb24nO1xuXHRcdHRoaXMuZmlsZVByZWZpeCA9ICdmaWxlOi8vLyc7XG5cdFx0dGhpcy5kYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm8gPSB0aGlzLmZpbGVQcmVmaXggKyB0aGlzLnBlcnNvbmFsSW5mbyArICcvcmVzb3VyY2VzL2FwcC8nICsgdGhpcy5pbXBvcnRhbnRJbmZvO1xuXHRcdHRoaXMuZGFuZ2Vyb3VzUGF0aFdpdGhvdXRJbXBvcnRhbnRJbmZvID0gdGhpcy5maWxlUHJlZml4ICsgdGhpcy5wZXJzb25hbEluZm87XG5cblx0XHR0aGlzLm1pc3NpbmdNb2RlbFByZWZpeCA9ICdSZWNlaXZlZCBtb2RlbCBldmVudHMgZm9yIG1pc3NpbmcgbW9kZWwgJztcblx0XHR0aGlzLm1pc3NpbmdNb2RlbE1lc3NhZ2UgPSB0aGlzLm1pc3NpbmdNb2RlbFByZWZpeCArICcgJyArIHRoaXMuZGFuZ2Vyb3VzUGF0aFdpdGhvdXRJbXBvcnRhbnRJbmZvO1xuXG5cdFx0dGhpcy5ub1N1Y2hGaWxlUHJlZml4ID0gJ0VOT0VOVDogbm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeSc7XG5cdFx0dGhpcy5ub1N1Y2hGaWxlTWVzc2FnZSA9IHRoaXMubm9TdWNoRmlsZVByZWZpeCArICcgXFwnJyArIHRoaXMucGVyc29uYWxJbmZvICsgJ1xcJyc7XG5cblx0XHR0aGlzLnN0YWNrID0gW2BhdCBlLl9tb2RlbEV2ZW50cyAoJHt0aGlzLnJhbmRvbVVzZXJGaWxlfToxMTo3MzA5KWAsXG5cdFx0YCAgICBhdCB0LkFsbFdvcmtlcnMgKCR7dGhpcy5yYW5kb21Vc2VyRmlsZX06Njo4ODQ0KWAsXG5cdFx0YCAgICBhdCBlLihhbm9ueW1vdXMgZnVuY3Rpb24pIFthcyBfbW9kZWxFdmVudHNdICgke3RoaXMucmFuZG9tVXNlckZpbGV9OjU6Mjk1NTIpYCxcblx0XHRgICAgIGF0IEZ1bmN0aW9uLjxhbm9ueW1vdXM+ICgke3RoaXMucmFuZG9tVXNlckZpbGV9OjY6ODI3MilgLFxuXHRcdGAgICAgYXQgZS5kaXNwYXRjaCAoJHt0aGlzLnJhbmRvbVVzZXJGaWxlfTo1OjI2OTMxKWAsXG5cdFx0YCAgICBhdCBlLnJlcXVlc3QgKC8ke3RoaXMubm9kZU1vZHVsZUFzYXJQYXRoVG9SZXRhaW59KWAsXG5cdFx0YCAgICBhdCB0Ll9oYW5kbGVNZXNzYWdlICgke3RoaXMubm9kZU1vZHVsZUFzYXJQYXRoVG9SZXRhaW59KWAsXG5cdFx0YCAgICBhdCB0Ll9vbm1lc3NhZ2UgKC8ke3RoaXMubm9kZU1vZHVsZVBhdGhUb1JldGFpbn0pYCxcblx0XHRgICAgIGF0IHQub25tZXNzYWdlICgke3RoaXMubm9kZU1vZHVsZVBhdGhUb1JldGFpbn0pYCxcblx0XHRgICAgIGF0IGdldCBkaW1lbnNpb25zICgke3RoaXMuZnVsbE5vZGVNb2R1bGVQYXRofSlgLFxuXHRcdGAgICAgYXQgXy5fcmVmcmVzaENhbnZhc0RpbWVuc2lvbnMgKCR7dGhpcy5mdWxsTm9kZU1vZHVsZUFzYXJQYXRofSlgLFxuXHRcdGAgICAgYXQgdXYucHJvdmlkZUNvZGVBY3Rpb25zICgke3RoaXMuZnVsbEV4dGVuc2lvblBhdGh9KWAsXG5cdFx0YCAgICBhdCByZW1vdGUuaGFuZGxlQ29ubmVjdGlvbiAoJHt0aGlzLmZ1bGxTZXJ2ZXJJbnNpZGVyc0V4dGVuc2lvblBhdGh9KWAsXG5cdFx0YCAgICBhdCBnaXQuZ2V0UmVwb3NpdG9yeVN0YXRlICgke3RoaXMuZnVsbEJ1aWx0aW5FeHRlbnNpb25QYXRofSlgLFxuXHRcdFx0YCAgICBhdCBEZWRpY2F0ZWRXb3JrZXJHbG9iYWxTY29wZS5zZWxmLm9ubWVzc2FnZWAsXG5cdFx0dGhpcy5kYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm8sXG5cdFx0dGhpcy5kYW5nZXJvdXNQYXRoV2l0aG91dEltcG9ydGFudEluZm8sXG5cdFx0dGhpcy5taXNzaW5nTW9kZWxNZXNzYWdlLFxuXHRcdHRoaXMubm9TdWNoRmlsZU1lc3NhZ2VdO1xuXHR9XG59XG5cbnN1aXRlKCdUZWxlbWV0cnlTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IFRlc3RQcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIC4uLnByb2R1Y3QgfTtcblxuXHR0ZXN0KCdEaXNwb3NpbmcnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLCBUZXN0UHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0c2VydmljZS5wdWJsaWNMb2coJ3Rlc3RQcml2YXRlRXZlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCF0ZXN0QXBwZW5kZXIuaXNEaXNwb3NlZCwgdHJ1ZSk7XG5cdH0pKTtcblxuXHQvLyBldmVudCByZXBvcnRpbmdcblx0dGVzdCgnU2ltcGxlIGV2ZW50Jywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0sIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdHNlcnZpY2UucHVibGljTG9nKCd0ZXN0RXZlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmV2ZW50TmFtZSwgJ3Rlc3RFdmVudCcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEsIG51bGwpO1xuXG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdFdmVudCB3aXRoIGRhdGEnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLCBUZXN0UHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0c2VydmljZS5wdWJsaWNMb2coJ3Rlc3RFdmVudCcsIHtcblx0XHRcdCdzdHJpbmdQcm9wJzogJ3Byb3BlcnR5Jyxcblx0XHRcdCdudW1iZXJQcm9wJzogMSxcblx0XHRcdCdib29sZWFuUHJvcCc6IHRydWUsXG5cdFx0XHQnY29tcGxleFByb3AnOiB7XG5cdFx0XHRcdCd2YWx1ZSc6IDBcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZ2V0RXZlbnRzQ291bnQoKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZXZlbnROYW1lLCAndGVzdEV2ZW50Jyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YVsnc3RyaW5nUHJvcCddLCAncHJvcGVydHknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhWydudW1iZXJQcm9wJ10sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGFbJ2Jvb2xlYW5Qcm9wJ10sIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGFbJ2NvbXBsZXhQcm9wJ10udmFsdWUsIDApO1xuXG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdjb21tb24gcHJvcGVydGllcyBhZGRlZCB0byAqYWxsKiBldmVudHMsIHNpbXBsZSBldmVudCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZWxlbWV0cnlTZXJ2aWNlKHtcblx0XHRcdGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0sXG5cdFx0XHRjb21tb25Qcm9wZXJ0aWVzOiB7IGZvbzogJ0pBIScsIGdldCBiYXIoKSB7IHJldHVybiBNYXRoLnJhbmRvbSgpICUgMiA9PT0gMDsgfSB9XG5cdFx0fSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLCBUZXN0UHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0c2VydmljZS5wdWJsaWNMb2coJ3Rlc3RFdmVudCcpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSB0ZXN0QXBwZW5kZXIuZXZlbnRzO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5rZXlzKGZpcnN0LmRhdGEpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBmaXJzdC5kYXRhWydmb28nXSwgJ3N0cmluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgZmlyc3QuZGF0YVsnYmFyJ10sICdib29sZWFuJyk7XG5cblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY29tbW9uIHByb3BlcnRpZXMgYWRkZWQgdG8gKmFsbCogZXZlbnRzLCBldmVudCB3aXRoIGRhdGEnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVsZW1ldHJ5U2VydmljZSh7XG5cdFx0XHRhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdLFxuXHRcdFx0Y29tbW9uUHJvcGVydGllczogeyBmb286ICdKQSEnLCBnZXQgYmFyKCkgeyByZXR1cm4gTWF0aC5yYW5kb20oKSAlIDIgPT09IDA7IH0gfVxuXHRcdH0sIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdHNlcnZpY2UucHVibGljTG9nKCd0ZXN0RXZlbnQnLCB7IGhpZ2h0b3dlcjogJ3hsJywgcHJpY2U6IDgwMDAgfSk7XG5cdFx0Y29uc3QgW2ZpcnN0XSA9IHRlc3RBcHBlbmRlci5ldmVudHM7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0LmtleXMoZmlyc3QuZGF0YSkubGVuZ3RoLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGZpcnN0LmRhdGFbJ2ZvbyddLCAnc3RyaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBmaXJzdC5kYXRhWydiYXInXSwgJ2Jvb2xlYW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGZpcnN0LmRhdGFbJ2hpZ2h0b3dlciddLCAnc3RyaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBmaXJzdC5kYXRhWydwcmljZSddLCAnbnVtYmVyJyk7XG5cblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnVGVsZW1ldHJ5SW5mbyBjb21lcyBmcm9tIHByb3BlcnRpZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZWxlbWV0cnlTZXJ2aWNlKHtcblx0XHRcdGFwcGVuZGVyczogW051bGxBcHBlbmRlcl0sXG5cdFx0XHRjb21tb25Qcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHNlc3Npb25JRDogJ29uZScsXG5cdFx0XHRcdFsnY29tbW9uLm1hY2hpbmVJZCddOiAndGhyZWUnLFxuXHRcdFx0fVxuXHRcdH0sIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnNlc3Npb25JZCwgJ29uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLm1hY2hpbmVJZCwgJ3RocmVlJyk7XG5cblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0Q29tbW9uUHJvcGVydHkgYWRkcyBwcm9wZXJ0eSB0byBhbGwgc3Vic2VxdWVudCBldmVudHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVsZW1ldHJ5U2VydmljZSh7XG5cdFx0XHRhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdLFxuXHRcdH0sIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdHNlcnZpY2UucHVibGljTG9nKCdldmVudEJlZm9yZVNldCcpO1xuXHRcdHNlcnZpY2Uuc2V0Q29tbW9uUHJvcGVydHkoJ2NvbW1vbi5jb3BpbG90VHJhY2tpbmdJZCcsICd0ZXN0LXRyYWNraW5nLWlkJyk7XG5cdFx0c2VydmljZS5wdWJsaWNMb2coJ2V2ZW50QWZ0ZXJTZXQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGFbJ2NvbW1vbi5jb3BpbG90VHJhY2tpbmdJZCddLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzFdLmRhdGFbJ2NvbW1vbi5jb3BpbG90VHJhY2tpbmdJZCddLCAndGVzdC10cmFja2luZy1pZCcpO1xuXG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RlbGVtZXRyeSBvbiBieSBkZWZhdWx0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0sIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdHNlcnZpY2UucHVibGljTG9nKCd0ZXN0RXZlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmV2ZW50TmFtZSwgJ3Rlc3RFdmVudCcpO1xuXG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGNsYXNzIFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UgZXh0ZW5kcyBUZWxlbWV0cnlTZXJ2aWNlIHtcblx0XHRjb25zdHJ1Y3Rvcihjb25maWc6IElUZWxlbWV0cnlTZXJ2aWNlQ29uZmlnKSB7XG5cdFx0XHRzdXBlcih7IC4uLmNvbmZpZywgc2VuZEVycm9yVGVsZW1ldHJ5OiB0cnVlIH0sIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnRXJyb3IgZXZlbnRzJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IEVycm9ycy5lcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cblx0XHRcdGNvbnN0IGU6IGFueSA9IG5ldyBFcnJvcignVGhpcyBpcyBhIHRlc3QuJyk7XG5cdFx0XHQvLyBmb3IgUGhhbnRvbVxuXHRcdFx0aWYgKCFlLnN0YWNrKSB7XG5cdFx0XHRcdGUuc3RhY2sgPSAnYmxhaCc7XG5cdFx0XHR9XG5cblx0XHRcdEVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmV2ZW50TmFtZSwgJ1VuaGFuZGxlZEVycm9yJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZywgJ1RoaXMgaXMgYSB0ZXN0LicpO1xuXG5cdFx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0Ly8gXHR0ZXN0KCdVbmhhbmRsZWQgUHJvbWlzZSBFcnJvciBldmVudHMnLCBzaW5vblRlc3RGbihmdW5jdGlvbigpIHtcblx0Ly9cblx0Ly8gXHRcdGxldCBvcmlnRXJyb3JIYW5kbGVyID0gRXJyb3JzLmVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdC8vIFx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7fSk7XG5cdC8vXG5cdC8vIFx0XHR0cnkge1xuXHQvLyBcdFx0XHRsZXQgc2VydmljZSA9IG5ldyBNYWluVGVsZW1ldHJ5U2VydmljZSgpO1xuXHQvLyBcdFx0XHRsZXQgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHQvLyBcdFx0XHRzZXJ2aWNlLmFkZFRlbGVtZXRyeUFwcGVuZGVyKHRlc3RBcHBlbmRlcik7XG5cdC8vXG5cdC8vIFx0XHRcdHdpbmpzLlByb21pc2Uud3JhcEVycm9yKG5ldyBFcnJvcignVGhpcyBzaG91bGQgbm90IGdldCBsb2dnZWQnKSk7XG5cdC8vIFx0XHRcdHdpbmpzLlRQcm9taXNlLmFzKHRydWUpLnRoZW4oKCkgPT4ge1xuXHQvLyBcdFx0XHRcdHRocm93IG5ldyBFcnJvcignVGhpcyBzaG91bGQgZ2V0IGxvZ2dlZCcpO1xuXHQvLyBcdFx0XHR9KTtcblx0Ly8gXHRcdFx0Ly8gcHJldmVudCBjb25zb2xlIG91dHB1dCBmcm9tIGZhaWxpbmcgdGhlIHRlc3Rcblx0Ly8gXHRcdFx0dGhpcy5zdHViKGNvbnNvbGUsICdsb2cnKTtcblx0Ly8gXHRcdFx0Ly8gYWxsb3cgZm9yIHRoZSBwcm9taXNlIHRvIGZpbmlzaFxuXHQvLyBcdFx0XHR0aGlzLmNsb2NrLnRpY2soTWFpbkVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXHQvL1xuXHQvLyBcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXHQvLyBcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5ldmVudE5hbWUsICdVbmhhbmRsZWRFcnJvcicpO1xuXHQvLyBcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZywgICdUaGlzIHNob3VsZCBnZXQgbG9nZ2VkJyk7XG5cdC8vXG5cdC8vIFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHQvLyBcdFx0fSBmaW5hbGx5IHtcblx0Ly8gXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdC8vIFx0XHR9XG5cdC8vIFx0fSkpO1xuXG5cdHRlc3QoJ0hhbmRsZSBnbG9iYWwgZXJyb3JzJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IGVycm9yU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHRtYWluV2luZG93Lm9uZXJyb3IgPSBlcnJvclN0dWI7XG5cblx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRlc3RFcnJvciA9IG5ldyBFcnJvcigndGVzdCcpO1xuXHRcdChtYWluV2luZG93Lm9uZXJyb3IpKCdFcnJvciBNZXNzYWdlJywgJ2ZpbGUuanMnLCAyLCA0MiwgdGVzdEVycm9yKTtcblx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JTdHViLmFsd2F5c0NhbGxlZFdpdGhFeGFjdGx5KCdFcnJvciBNZXNzYWdlJywgJ2ZpbGUuanMnLCAyLCA0MiwgdGVzdEVycm9yKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yU3R1Yi5jYWxsQ291bnQsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5ldmVudE5hbWUsICdVbmhhbmRsZWRFcnJvcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLCAnRXJyb3IgTWVzc2FnZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuZmlsZSwgJ2ZpbGUuanMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmxpbmUsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY29sdW1uLCA0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS51bmNhdWdodF9lcnJvcl9tc2csICd0ZXN0Jyk7XG5cblx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgUElJIGZyb20gZmlsZW5hbWUgd2l0aCBzcGFjZXMnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3QgZXJyb3JTdHViID0gc2lub24uc3R1YigpO1xuXHRcdG1haW5XaW5kb3cub25lcnJvciA9IGVycm9yU3R1Yjtcblx0XHRjb25zdCBzZXR0aW5ncyA9IG5ldyBFcnJvclRlc3RpbmdTZXR0aW5ncygpO1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcGVyc29uSW5mb1dpdGhTcGFjZXMgPSBzZXR0aW5ncy5wZXJzb25hbEluZm8uc2xpY2UoMCwgMikgKyAnICcgKyBzZXR0aW5ncy5wZXJzb25hbEluZm8uc2xpY2UoMik7XG5cdFx0Y29uc3QgZGFuZ2Vyb3VzRmlsZW5hbWVFcnJvcjogYW55ID0gbmV3IEVycm9yKCdkYW5nZXJvdXNGaWxlbmFtZScpO1xuXHRcdGRhbmdlcm91c0ZpbGVuYW1lRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblx0XHRtYWluV2luZG93Lm9uZXJyb3IoJ2Rhbmdlcm91c0ZpbGVuYW1lJywgc2V0dGluZ3MuZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvLnJlcGxhY2Uoc2V0dGluZ3MucGVyc29uYWxJbmZvLCBwZXJzb25JbmZvV2l0aFNwYWNlcykgKyAnL3Rlc3QuanMnLCAyLCA0MiwgZGFuZ2Vyb3VzRmlsZW5hbWVFcnJvcik7XG5cdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuZmlsZS5pbmRleE9mKHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mby5yZXBsYWNlKHNldHRpbmdzLnBlcnNvbmFsSW5mbywgcGVyc29uSW5mb1dpdGhTcGFjZXMpKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuZmlsZSwgc2V0dGluZ3MuaW1wb3J0YW50SW5mbyArICcvdGVzdC5qcycpO1xuXG5cdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ1VuY2F1Z2h0IEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIFBJSSBmcm9tIGZpbGVuYW1lJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IGNsb2NrID0gdGhpcy5jbG9jaztcblx0XHRjb25zdCBlcnJvclN0dWIgPSBzaW5vbi5zdHViKCk7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yID0gZXJyb3JTdHViO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRsZXQgZGFuZ2Vyb3VzRmlsZW5hbWVFcnJvcjogYW55ID0gbmV3IEVycm9yKCdkYW5nZXJvdXNGaWxlbmFtZScpO1xuXHRcdGRhbmdlcm91c0ZpbGVuYW1lRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblx0XHRtYWluV2luZG93Lm9uZXJyb3IoJ2Rhbmdlcm91c0ZpbGVuYW1lJywgc2V0dGluZ3MuZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvICsgJy90ZXN0LmpzJywgMiwgNDIsIGRhbmdlcm91c0ZpbGVuYW1lRXJyb3IpO1xuXHRcdGNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuZmlsZS5pbmRleE9mKHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mbyksIC0xKTtcblxuXHRcdGRhbmdlcm91c0ZpbGVuYW1lRXJyb3IgPSBuZXcgRXJyb3IoJ2Rhbmdlcm91c0ZpbGVuYW1lJyk7XG5cdFx0ZGFuZ2Vyb3VzRmlsZW5hbWVFcnJvci5zdGFjayA9IHNldHRpbmdzLnN0YWNrO1xuXHRcdG1haW5XaW5kb3cub25lcnJvcignZGFuZ2Vyb3VzRmlsZW5hbWUnLCBzZXR0aW5ncy5kYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm8gKyAnL3Rlc3QuanMnLCAyLCA0MiwgZGFuZ2Vyb3VzRmlsZW5hbWVFcnJvcik7XG5cdFx0Y2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JTdHViLmNhbGxDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5maWxlLmluZGV4T2Yoc2V0dGluZ3MuZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuZmlsZSwgc2V0dGluZ3MuaW1wb3J0YW50SW5mbyArICcvdGVzdC5qcycpO1xuXG5cdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgUElJJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXR0aW5ncyA9IG5ldyBFcnJvclRlc3RpbmdTZXR0aW5ncygpO1xuXHRcdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBkYW5nZXJvdXNQYXRoV2l0aG91dEltcG9ydGFudEluZm9FcnJvcjogYW55ID0gbmV3IEVycm9yKHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRob3V0SW1wb3J0YW50SW5mbyk7XG5cdFx0XHRkYW5nZXJvdXNQYXRoV2l0aG91dEltcG9ydGFudEluZm9FcnJvci5zdGFjayA9IHNldHRpbmdzLnN0YWNrO1xuXHRcdFx0RXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKGRhbmdlcm91c1BhdGhXaXRob3V0SW1wb3J0YW50SW5mb0Vycm9yKTtcblx0XHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5zdGFja1s0XS5yZXBsYWNlKHNldHRpbmdzLnJhbmRvbVVzZXJGaWxlLCBzZXR0aW5ncy5hbm9ueW1pemVkUmFuZG9tVXNlckZpbGUpKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suc3BsaXQoJ1xcbicpLmxlbmd0aCwgc2V0dGluZ3Muc3RhY2subGVuZ3RoKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBFcnJvciBUZWxlbWV0cnkgcmVkYWN0cyBvbmx5IG9mZmVuZGluZyBmcmFtZXMgYW5kIHByZXNlcnZlcyB0aGUgcmVzdCBvZiB0aGUgY2FsbHN0YWNrJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRcdC8vIEEgZnJhbWUgd2hvc2UgZnVuY3Rpb24gbmFtZSBtYXRjaGVzIHRoZSBicm9hZCBgR2VuZXJpYyBTZWNyZXRgIGhldXJpc3RpY1xuXHRcdFx0Ly8gKGBnZXRTdG9yYWdlS2V5YCBjb250YWlucyBga2V5KGApIHByZXZpb3VzbHkgY2F1c2VkIHRoZSBlbnRpcmUgY2FsbHN0YWNrXG5cdFx0XHQvLyB0byBiZSByZWRhY3RlZC4gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMDEyMDAuXG5cdFx0XHRjb25zdCBzdGFjayA9IFtcblx0XHRcdFx0J0Vycm9yOiBTb21ldGhpbmcgZmFpbGVkJyxcblx0XHRcdFx0JyAgICBhdCBTdG9yYWdlU2VydmljZS5nZXRTdG9yYWdlS2V5IChvdXQvdnMvcGxhdGZvcm0vc3RvcmFnZS9zdG9yYWdlLmpzOjE6MjAwKScsXG5cdFx0XHRcdCcgICAgYXQgRm9vLnJ1biAob3V0L3ZzL3dvcmtiZW5jaC9mb28uanM6Mzo0MCknLFxuXHRcdFx0XHQnICAgIGF0IEJhci5iYXogKG91dC92cy93b3JrYmVuY2gvYmFyLmpzOjU6NjApJyxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGVycm9yOiBhbnkgPSBuZXcgRXJyb3IoJ1NvbWV0aGluZyBmYWlsZWQnKTtcblx0XHRcdGVycm9yLnN0YWNrID0gc3RhY2suam9pbignXFxuJyk7XG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXHRcdFx0Y29uc3QgY3M6IHN0cmluZyA9IHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2s7XG5cdFx0XHQvLyBUaGUgd2hvbGUgc3RhY2sgbXVzdCBub3QgY29sbGFwc2UgaW50byBhIHNpbmdsZSByZWRhY3Rpb24gbWFya2VyLlxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGNzLCAnPFJFREFDVEVEOiBHZW5lcmljIFNlY3JldD4nLCAnRW50aXJlIGNhbGxzdGFjayBzaG91bGQgbm90IGJlIHJlZGFjdGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3Muc3BsaXQoJ1xcbicpLmxlbmd0aCwgc3RhY2subGVuZ3RoLCAnQWxsIGZyYW1lcyBzaG91bGQgYmUgcHJlc2VydmVkJyk7XG5cdFx0XHQvLyBPbmx5IHRoZSBvZmZlbmRpbmcgZnJhbWUgaXMgcmVkYWN0ZWQsIHRoZSBvdGhlcnMgcmVtYWluIGludGFjdC5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjcy5pbmRleE9mKCdGb28ucnVuJyksIC0xLCAnTm9uLW9mZmVuZGluZyBmcmFtZXMgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGNzLmluZGV4T2YoJ0Jhci5iYXonKSwgLTEsICdOb24tb2ZmZW5kaW5nIGZyYW1lcyBzaG91bGQgYmUgcHJlc2VydmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3MuaW5kZXhPZignZ2V0U3RvcmFnZUtleScpLCAtMSwgJ09mZmVuZGluZyBmcmFtZSBzaG91bGQgYmUgcmVkYWN0ZWQnKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBFcnJvciBUZWxlbWV0cnkgc3RpbGwgcmVkYWN0cyBhIGZyYW1lIHdob3NlIHRyYWlsaW5nIHRva2VuIHJlbGllcyBvbiB0aGUgbmV3bGluZSBkZWxpbWl0ZXInLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IEVycm9ycy5lcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdFx0Ly8gYGdldEFwaUtleWAgZW5kcyB0aGUgbGluZSwgc28gdGhlIGBHZW5lcmljIFNlY3JldGAgaGV1cmlzdGljIG9ubHlcblx0XHRcdC8vIG1hdGNoZXMgYmVjYXVzZSBvZiB0aGUgZm9sbG93aW5nIG5ld2xpbmUuIFBlci1saW5lIHJlZGFjdGlvbiBtdXN0XG5cdFx0XHQvLyByZS1hcHBlbmQgdGhhdCBkZWxpbWl0ZXIgc28gdGhpcyBmcmFtZSBpcyBzdGlsbCByZWRhY3RlZCwgbWF0Y2hpbmdcblx0XHRcdC8vIHRoZSBwcmV2aW91cyB3aG9sZS1zdHJpbmcgYmVoYXZpb3IuXG5cdFx0XHRjb25zdCBzdGFjayA9IFtcblx0XHRcdFx0J0Vycm9yOiBib29tJyxcblx0XHRcdFx0JyAgICBhdCBTZXJ2aWNlLmdldEFwaUtleScsXG5cdFx0XHRcdCcgICAgYXQgRm9vLnJ1biAob3V0L3ZzL3dvcmtiZW5jaC9mb28uanM6Mzo0MCknLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgZXJyb3I6IGFueSA9IG5ldyBFcnJvcignYm9vbScpO1xuXHRcdFx0ZXJyb3Iuc3RhY2sgPSBzdGFjay5qb2luKCdcXG4nKTtcblx0XHRcdEVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZ2V0RXZlbnRzQ291bnQoKSwgMSk7XG5cdFx0XHRjb25zdCBjczogc3RyaW5nID0gdGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjaztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcy5pbmRleE9mKCdnZXRBcGlLZXknKSwgLTEsICdUcmFpbGluZy10b2tlbiBmcmFtZSBzaG91bGQgc3RpbGwgYmUgcmVkYWN0ZWQnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjcy5pbmRleE9mKCdGb28ucnVuJyksIC0xLCAnT3RoZXIgZnJhbWVzIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcy5zcGxpdCgnXFxuJykubGVuZ3RoLCBzdGFjay5sZW5ndGgsICdBbGwgZnJhbWVzIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5jYXVnaHQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgUElJJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IGVycm9yU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHRtYWluV2luZG93Lm9uZXJyb3IgPSBlcnJvclN0dWI7XG5cdFx0Y29uc3Qgc2V0dGluZ3MgPSBuZXcgRXJyb3JUZXN0aW5nU2V0dGluZ3MoKTtcblx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGRhbmdlcm91c1BhdGhXaXRob3V0SW1wb3J0YW50SW5mb0Vycm9yOiBhbnkgPSBuZXcgRXJyb3IoJ2Rhbmdlcm91c1BhdGhXaXRob3V0SW1wb3J0YW50SW5mbycpO1xuXHRcdGRhbmdlcm91c1BhdGhXaXRob3V0SW1wb3J0YW50SW5mb0Vycm9yLnN0YWNrID0gc2V0dGluZ3Muc3RhY2s7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yKHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRob3V0SW1wb3J0YW50SW5mbywgJ3Rlc3QuanMnLCAyLCA0MiwgZGFuZ2Vyb3VzUGF0aFdpdGhvdXRJbXBvcnRhbnRJbmZvRXJyb3IpO1xuXHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvclN0dWIuY2FsbENvdW50LCAxKTtcblx0XHQvLyBUZXN0IHRoYXQgbm8gZmlsZSBpbmZvcm1hdGlvbiByZW1haW5zLCBlc3AuIHBlcnNvbmFsIGluZm9cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3Muc3RhY2tbNF0ucmVwbGFjZShzZXR0aW5ncy5yYW5kb21Vc2VyRmlsZSwgc2V0dGluZ3MuYW5vbnltaXplZFJhbmRvbVVzZXJGaWxlKSksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5zcGxpdCgnXFxuJykubGVuZ3RoLCBzZXR0aW5ncy5zdGFjay5sZW5ndGgpO1xuXG5cdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgUElJIGJ1dCBwcmVzZXJ2ZXMgQ29kZSBmaWxlIHBhdGgnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cblx0XHRjb25zdCBvcmlnRXJyb3JIYW5kbGVyID0gRXJyb3JzLmVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXR0aW5ncyA9IG5ldyBFcnJvclRlc3RpbmdTZXR0aW5ncygpO1xuXHRcdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvcjogYW55ID0gbmV3IEVycm9yKHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mbyk7XG5cdFx0XHRkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvci5zdGFjayA9IHNldHRpbmdzLnN0YWNrO1xuXG5cdFx0XHQvLyBUZXN0IHRoYXQgaW1wb3J0YW50IGluZm9ybWF0aW9uIHJlbWFpbnMgYnV0IHBlcnNvbmFsIGluZm8gZG9lcyBub3Rcblx0XHRcdEVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvcik7XG5cdFx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MuaW1wb3J0YW50SW5mbyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5pbXBvcnRhbnRJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnN0YWNrWzRdLnJlcGxhY2Uoc2V0dGluZ3MucmFuZG9tVXNlckZpbGUsIHNldHRpbmdzLmFub255bWl6ZWRSYW5kb21Vc2VyRmlsZSkpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5zcGxpdCgnXFxuJykubGVuZ3RoLCBzZXR0aW5ncy5zdGFjay5sZW5ndGgpO1xuXG5cdFx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0ZmluYWxseSB7XG5cdFx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihvcmlnRXJyb3JIYW5kbGVyKTtcblx0XHR9XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmNhdWdodCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBQSUkgYnV0IHByZXNlcnZlcyBDb2RlIGZpbGUgcGF0aCcsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBlcnJvclN0dWIgPSBzaW5vbi5zdHViKCk7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yID0gZXJyb3JTdHViO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRjb25zdCBkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvcjogYW55ID0gbmV3IEVycm9yKCdkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm8nKTtcblx0XHRkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvci5zdGFjayA9IHNldHRpbmdzLnN0YWNrO1xuXHRcdG1haW5XaW5kb3cub25lcnJvcihzZXR0aW5ncy5kYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm8sICd0ZXN0LmpzJywgMiwgNDIsIGRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mb0Vycm9yKTtcblx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0Ly8gVGVzdCB0aGF0IGltcG9ydGFudCBpbmZvcm1hdGlvbiByZW1haW5zIGJ1dCBwZXJzb25hbCBpbmZvIGRvZXMgbm90XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5hbm9ueW1pemVkTm9kZU1vZHVsZUFzYXJQYXRoKSwgLTEsICdiYXJlIG5vZGVfbW9kdWxlcy5hc2FyIHBhdGgnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmFub255bWl6ZWROb2RlTW9kdWxlUGF0aCksIC0xLCAnYmFyZSBub2RlX21vZHVsZXMgcGF0aCcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MuaW1wb3J0YW50SW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5pbXBvcnRhbnRJbmZvKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnN0YWNrWzRdLnJlcGxhY2Uoc2V0dGluZ3MucmFuZG9tVXNlckZpbGUsIHNldHRpbmdzLmFub255bWl6ZWRSYW5kb21Vc2VyRmlsZSkpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suc3BsaXQoJ1xcbicpLmxlbmd0aCwgc2V0dGluZ3Muc3RhY2subGVuZ3RoKTtcblxuXHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmV4cGVjdGVkIEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIFBJSSBidXQgcHJlc2VydmVzIENvZGUgZmlsZSBwYXRoIHdpdGggbm9kZSBtb2R1bGVzJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IEVycm9ycy5lcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBuZXcgRXJyb3JUZXN0aW5nU2V0dGluZ3MoKTtcblx0XHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3I6IGFueSA9IG5ldyBFcnJvcihzZXR0aW5ncy5kYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm8pO1xuXHRcdFx0ZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblxuXG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHQvLyBBbGwgbm9kZV9tb2R1bGVzIHBhdGhzIChiYXJlIGFuZCBmdWxsKSBzaG91bGQgcHJlc2VydmUgdGhlIG5vZGVfbW9kdWxlcy8uLi4gc3VmZml4IGFmdGVyIHJlZGFjdGlvblxuXHRcdFx0Y29uc3QgY3MgPSB0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGNzLmluZGV4T2Yoc2V0dGluZ3MuYW5vbnltaXplZE5vZGVNb2R1bGVBc2FyUGF0aCksIC0xLCAnYmFyZSBub2RlX21vZHVsZXMuYXNhciBwYXRoJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY3MuaW5kZXhPZihzZXR0aW5ncy5hbm9ueW1pemVkTm9kZU1vZHVsZVBhdGgpLCAtMSwgJ2JhcmUgbm9kZV9tb2R1bGVzIHBhdGgnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjcy5pbmRleE9mKHNldHRpbmdzLmFub255bWl6ZWRGdWxsTm9kZU1vZHVsZVBhdGgpLCAtMSwgJ2Z1bGwgbm9kZV9tb2R1bGVzIHBhdGgnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjcy5pbmRleE9mKHNldHRpbmdzLmFub255bWl6ZWRGdWxsTm9kZU1vZHVsZUFzYXJQYXRoKSwgLTEsICdmdWxsIG5vZGVfbW9kdWxlcy5hc2FyIHBhdGgnKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBQSUkgYnV0IHByZXNlcnZlcyBleHRlbnNpb24gcGF0aCcsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblxuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mb0Vycm9yOiBhbnkgPSBuZXcgRXJyb3Ioc2V0dGluZ3MuZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvKTtcblx0XHRcdGRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mb0Vycm9yLnN0YWNrID0gc2V0dGluZ3Muc3RhY2s7XG5cblx0XHRcdEVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvcik7XG5cdFx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRcdC8vIFZlcmlmeSB1c2VyIGV4dGVuc2lvbiBwYXRoIGlzIHByZXNlcnZlZCBidXQgcGFyZW50IGZvbGRlciBpcyByZWRhY3RlZFxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5leHRlbnNpb25QYXRoVG9SZXRhaW4pLCAtMSwgJ1VzZXIgZXh0ZW5zaW9uIHBhdGggc2hvdWxkIGJlIHJldGFpbmVkJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmFub255bWl6ZWRFeHRlbnNpb25QYXRoKSwgLTEsICdVc2VyIGV4dGVuc2lvbiBwYXRoIHNob3VsZCBiZSBhbm9ueW1pemVkIHdpdGggcHJlc2VydmVkIGV4dGVuc2lvbiBuYW1lJyk7XG5cdFx0XHQvLyBWZXJpZnkgdGhlIHVzZXJuYW1lIGlzIHJlbW92ZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJy9Vc2Vycy91c2VybmFtZS8nKSwgLTEsICdVc2VybmFtZSBzaG91bGQgYmUgcmVkYWN0ZWQgZnJvbSBleHRlbnNpb24gcGF0aCcpO1xuXG5cdFx0XHQvLyBWZXJpZnkgc2VydmVyLWluc2lkZXJzIGV4dGVuc2lvbiBwYXRoIGlzIHByZXNlcnZlZCAobXVsdGktc2VnbWVudCBzdWZmaXggbGlrZSAudnNjb2RlLXNlcnZlci1pbnNpZGVycylcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3Muc2VydmVySW5zaWRlcnNFeHRlbnNpb25QYXRoVG9SZXRhaW4pLCAtMSwgJ1NlcnZlci1pbnNpZGVycyBleHRlbnNpb24gcGF0aCBzaG91bGQgYmUgcmV0YWluZWQnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuYW5vbnltaXplZFNlcnZlckluc2lkZXJzRXh0ZW5zaW9uUGF0aCksIC0xLCAnU2VydmVyLWluc2lkZXJzIGV4dGVuc2lvbiBwYXRoIHNob3VsZCBiZSBhbm9ueW1pemVkIHdpdGggcHJlc2VydmVkIGV4dGVuc2lvbiBuYW1lJyk7XG5cdFx0XHQvLyBWZXJpZnkgdGhlIGhvbWUgZGlyZWN0b3J5IGlzIHJlbW92ZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJy9ob21lL3VzZXIvJyksIC0xLCAnSG9tZSBkaXJlY3Rvcnkgc2hvdWxkIGJlIHJlZGFjdGVkIGZyb20gc2VydmVyLWluc2lkZXJzIGV4dGVuc2lvbiBwYXRoJyk7XG5cblx0XHRcdC8vIFZlcmlmeSBidWlsdC1pbiBleHRlbnNpb24gcGF0aCBpcyBwcmVzZXJ2ZWQgYnV0IGFwcCBmb2xkZXIgaXMgcmVkYWN0ZWRcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuYnVpbHRpbkV4dGVuc2lvblBhdGhUb1JldGFpbiksIC0xLCAnQnVpbHQtaW4gZXh0ZW5zaW9uIHBhdGggc2hvdWxkIGJlIHJldGFpbmVkJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmFub255bWl6ZWRCdWlsdGluRXh0ZW5zaW9uUGF0aCksIC0xLCAnQnVpbHQtaW4gZXh0ZW5zaW9uIHBhdGggc2hvdWxkIGJlIGFub255bWl6ZWQgd2l0aCBwcmVzZXJ2ZWQgZXh0ZW5zaW9uIG5hbWUnKTtcblx0XHRcdC8vIFZlcmlmeSB0aGUgYXBwIHBhdGggaXMgcmVtb3ZlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignL0FwcGxpY2F0aW9ucy9WaXN1YWwgU3R1ZGlvIENvZGUuYXBwJyksIC0xLCAnQXBwIHBhdGggc2hvdWxkIGJlIHJlZGFjdGVkIGZyb20gYnVpbHQtaW4gZXh0ZW5zaW9uIHBhdGgnKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBQSUkgYnV0IHByZXNlcnZlcyBDb2RlIGZpbGUgcGF0aCB3aGVuIFBJSVBhdGggaXMgY29uZmlndXJlZCcsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblxuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdLCBwaWlQYXRoczogW3NldHRpbmdzLnBlcnNvbmFsSW5mbyArICcvcmVzb3VyY2VzL2FwcC8nXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvcjogYW55ID0gbmV3IEVycm9yKHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mbyk7XG5cdFx0XHRkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvci5zdGFjayA9IHNldHRpbmdzLnN0YWNrO1xuXG5cdFx0XHQvLyBUZXN0IHRoYXQgaW1wb3J0YW50IGluZm9ybWF0aW9uIHJlbWFpbnMgYnV0IHBlcnNvbmFsIGluZm8gZG9lcyBub3Rcblx0XHRcdEVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvcik7XG5cdFx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MuaW1wb3J0YW50SW5mbyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5pbXBvcnRhbnRJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnN0YWNrWzRdLnJlcGxhY2Uoc2V0dGluZ3MucmFuZG9tVXNlckZpbGUsIHNldHRpbmdzLmFub255bWl6ZWRSYW5kb21Vc2VyRmlsZSkpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5zcGxpdCgnXFxuJykubGVuZ3RoLCBzZXR0aW5ncy5zdGFjay5sZW5ndGgpO1xuXG5cdFx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0ZmluYWxseSB7XG5cdFx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihvcmlnRXJyb3JIYW5kbGVyKTtcblx0XHR9XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmNhdWdodCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBQSUkgYnV0IHByZXNlcnZlcyBDb2RlIGZpbGUgcGF0aCB3aGVuIFBJSVBhdGggaXMgY29uZmlndXJlZCcsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBlcnJvclN0dWIgPSBzaW5vbi5zdHViKCk7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yID0gZXJyb3JTdHViO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0sIHBpaVBhdGhzOiBbc2V0dGluZ3MucGVyc29uYWxJbmZvICsgJy9yZXNvdXJjZXMvYXBwLyddIH0pO1xuXHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3I6IGFueSA9IG5ldyBFcnJvcignZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvJyk7XG5cdFx0ZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblx0XHRtYWluV2luZG93Lm9uZXJyb3Ioc2V0dGluZ3MuZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvLCAndGVzdC5qcycsIDIsIDQyLCBkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvcik7XG5cdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdC8vIFRlc3QgdGhhdCBpbXBvcnRhbnQgaW5mb3JtYXRpb24gcmVtYWlucyBidXQgcGVyc29uYWwgaW5mbyBkb2VzIG5vdFxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MuaW1wb3J0YW50SW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5pbXBvcnRhbnRJbmZvKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnN0YWNrWzRdLnJlcGxhY2Uoc2V0dGluZ3MucmFuZG9tVXNlckZpbGUsIHNldHRpbmdzLmFub255bWl6ZWRSYW5kb21Vc2VyRmlsZSkpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suc3BsaXQoJ1xcbicpLmxlbmd0aCwgc2V0dGluZ3Muc3RhY2subGVuZ3RoKTtcblxuXHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmV4cGVjdGVkIEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIFBJSSBidXQgcHJlc2VydmVzIE1pc3NpbmcgTW9kZWwgZXJyb3IgbWVzc2FnZScsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblxuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRcdGNvbnN0IG1pc3NpbmdNb2RlbEVycm9yOiBhbnkgPSBuZXcgRXJyb3Ioc2V0dGluZ3MubWlzc2luZ01vZGVsTWVzc2FnZSk7XG5cdFx0XHRtaXNzaW5nTW9kZWxFcnJvci5zdGFjayA9IHNldHRpbmdzLnN0YWNrO1xuXG5cdFx0XHQvLyBUZXN0IHRoYXQgbm8gZmlsZSBpbmZvcm1hdGlvbiByZW1haW5zLCBidXQgdGhpcyBwYXJ0aWN1bGFyXG5cdFx0XHQvLyBlcnJvciBtZXNzYWdlIGRvZXMgKFJlY2VpdmVkIG1vZGVsIGV2ZW50cyBmb3IgbWlzc2luZyBtb2RlbClcblx0XHRcdEVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihtaXNzaW5nTW9kZWxFcnJvcik7XG5cdFx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MubWlzc2luZ01vZGVsUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLm1pc3NpbmdNb2RlbFByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5zdGFja1s0XS5yZXBsYWNlKHNldHRpbmdzLnJhbmRvbVVzZXJGaWxlLCBzZXR0aW5ncy5hbm9ueW1pemVkUmFuZG9tVXNlckZpbGUpKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suc3BsaXQoJ1xcbicpLmxlbmd0aCwgc2V0dGluZ3Muc3RhY2subGVuZ3RoKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ1VuY2F1Z2h0IEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIFBJSSBidXQgcHJlc2VydmVzIE1pc3NpbmcgTW9kZWwgZXJyb3IgbWVzc2FnZScsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBlcnJvclN0dWIgPSBzaW5vbi5zdHViKCk7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yID0gZXJyb3JTdHViO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRjb25zdCBtaXNzaW5nTW9kZWxFcnJvcjogYW55ID0gbmV3IEVycm9yKCdtaXNzaW5nTW9kZWxNZXNzYWdlJyk7XG5cdFx0bWlzc2luZ01vZGVsRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblx0XHRtYWluV2luZG93Lm9uZXJyb3Ioc2V0dGluZ3MubWlzc2luZ01vZGVsTWVzc2FnZSwgJ3Rlc3QuanMnLCAyLCA0MiwgbWlzc2luZ01vZGVsRXJyb3IpO1xuXHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvclN0dWIuY2FsbENvdW50LCAxKTtcblx0XHQvLyBUZXN0IHRoYXQgbm8gZmlsZSBpbmZvcm1hdGlvbiByZW1haW5zLCBidXQgdGhpcyBwYXJ0aWN1bGFyXG5cdFx0Ly8gZXJyb3IgbWVzc2FnZSBkb2VzIChSZWNlaXZlZCBtb2RlbCBldmVudHMgZm9yIG1pc3NpbmcgbW9kZWwpXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5taXNzaW5nTW9kZWxQcmVmaXgpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MubWlzc2luZ01vZGVsUHJlZml4KSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnN0YWNrWzRdLnJlcGxhY2Uoc2V0dGluZ3MucmFuZG9tVXNlckZpbGUsIHNldHRpbmdzLmFub255bWl6ZWRSYW5kb21Vc2VyRmlsZSkpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suc3BsaXQoJ1xcbicpLmxlbmd0aCwgc2V0dGluZ3Muc3RhY2subGVuZ3RoKTtcblxuXHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmV4cGVjdGVkIEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIFBJSSBidXQgcHJlc2VydmVzIE5vIFN1Y2ggRmlsZSBlcnJvciBtZXNzYWdlJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IEVycm9ycy5lcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBuZXcgRXJyb3JUZXN0aW5nU2V0dGluZ3MoKTtcblx0XHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3Qgbm9TdWNoRmlsZUVycm9yOiBhbnkgPSBuZXcgRXJyb3Ioc2V0dGluZ3Mubm9TdWNoRmlsZU1lc3NhZ2UpO1xuXHRcdFx0bm9TdWNoRmlsZUVycm9yLnN0YWNrID0gc2V0dGluZ3Muc3RhY2s7XG5cblx0XHRcdC8vIFRlc3QgdGhhdCBubyBmaWxlIGluZm9ybWF0aW9uIHJlbWFpbnMsIGJ1dCB0aGlzIHBhcnRpY3VsYXJcblx0XHRcdC8vIGVycm9yIG1lc3NhZ2UgZG9lcyAoRU5PRU5UOiBubyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5KVxuXHRcdFx0RXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKG5vU3VjaEZpbGVFcnJvcik7XG5cdFx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3Mubm9TdWNoRmlsZVByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5ub1N1Y2hGaWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnN0YWNrWzRdLnJlcGxhY2Uoc2V0dGluZ3MucmFuZG9tVXNlckZpbGUsIHNldHRpbmdzLmFub255bWl6ZWRSYW5kb21Vc2VyRmlsZSkpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5zcGxpdCgnXFxuJykubGVuZ3RoLCBzZXR0aW5ncy5zdGFjay5sZW5ndGgpO1xuXG5cdFx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5jYXVnaHQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgUElJIGJ1dCBwcmVzZXJ2ZXMgTm8gU3VjaCBGaWxlIGVycm9yIG1lc3NhZ2UnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IEVycm9ycy5lcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXJyb3JTdHViID0gc2lub24uc3R1YigpO1xuXHRcdFx0bWFpbldpbmRvdy5vbmVycm9yID0gZXJyb3JTdHViO1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBuZXcgRXJyb3JUZXN0aW5nU2V0dGluZ3MoKTtcblx0XHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3Qgbm9TdWNoRmlsZUVycm9yOiBhbnkgPSBuZXcgRXJyb3IoJ25vU3VjaEZpbGVNZXNzYWdlJyk7XG5cdFx0XHRub1N1Y2hGaWxlRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblx0XHRcdG1haW5XaW5kb3cub25lcnJvcihzZXR0aW5ncy5ub1N1Y2hGaWxlTWVzc2FnZSwgJ3Rlc3QuanMnLCAyLCA0Miwgbm9TdWNoRmlsZUVycm9yKTtcblx0XHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdFx0Ly8gVGVzdCB0aGF0IG5vIGZpbGUgaW5mb3JtYXRpb24gcmVtYWlucywgYnV0IHRoaXMgcGFydGljdWxhclxuXHRcdFx0Ly8gZXJyb3IgbWVzc2FnZSBkb2VzIChFTk9FTlQ6IG5vIHN1Y2ggZmlsZSBvciBkaXJlY3RvcnkpXG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3Iobm9TdWNoRmlsZUVycm9yKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3Mubm9TdWNoRmlsZVByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5ub1N1Y2hGaWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnN0YWNrWzRdLnJlcGxhY2Uoc2V0dGluZ3MucmFuZG9tVXNlckZpbGUsIHNldHRpbmdzLmFub255bWl6ZWRSYW5kb21Vc2VyRmlsZSkpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5zcGxpdCgnXFxuJykubGVuZ3RoLCBzZXR0aW5ncy5zdGFjay5sZW5ndGgpO1xuXG5cdFx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVGVsZW1ldHJ5IFNlcnZpY2Ugc2VuZHMgZXZlbnRzIHdoZW4gdGVsZW1ldHJ5IGlzIG9uJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0sIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlLnB1YmxpY0xvZygndGVzdEV2ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ1RlbGVtZXRyeSBTZXJ2aWNlIGNoZWNrcyB3aXRoIGNvbmZpZyBzZXJ2aWNlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IHRlbGVtZXRyeUxldmVsID0gVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5PRkY7XG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPGFueT4oKTtcblxuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlbGVtZXRyeVNlcnZpY2Uoe1xuXHRcdFx0YXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXVxuXHRcdH0sIG5ldyBjbGFzcyBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSBlbWl0dGVyLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0VmFsdWU8VD4oKTogVCB7XG5cdFx0XHRcdHJldHVybiB0ZWxlbWV0cnlMZXZlbCBhcyBUO1xuXHRcdFx0fVxuXHRcdH0oKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnRlbGVtZXRyeUxldmVsLCBUZWxlbWV0cnlMZXZlbC5OT05FKTtcblxuXHRcdHRlbGVtZXRyeUxldmVsID0gVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5PTjtcblx0XHRlbWl0dGVyLmZpcmUoeyBhZmZlY3RzQ29uZmlndXJhdGlvbjogKCkgPT4gdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZWxlbWV0cnlMZXZlbCwgVGVsZW1ldHJ5TGV2ZWwuVVNBR0UpO1xuXG5cdFx0dGVsZW1ldHJ5TGV2ZWwgPSBUZWxlbWV0cnlDb25maWd1cmF0aW9uLkVSUk9SO1xuXHRcdGVtaXR0ZXIuZmlyZSh7IGFmZmVjdHNDb25maWd1cmF0aW9uOiAoKSA9PiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnRlbGVtZXRyeUxldmVsLCBUZWxlbWV0cnlMZXZlbC5FUlJPUik7XG5cblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBXaW5kb3dzIFBJSSBidXQgcHJlc2VydmVzIGNvZGUgcGF0aCcsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBvcmlnRXJyb3JIYW5kbGVyID0gRXJyb3JzLmVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHdpbmRvd3NVc2VyUGF0aCA9ICdjOi9Vc2Vycy9icGFzZXJvL0FwcERhdGEvTG9jYWwvUHJvZ3JhbXMvTWljcm9zb2Z0JTIwVlMlMjBDb2RlJTIwSW5zaWRlcnMvcmVzb3VyY2VzL2FwcC8nO1xuXHRcdFx0Y29uc3QgY29kZVBhdGggPSAnb3V0L3ZzL3dvcmtiZW5jaC93b3JrYmVuY2guZGVza3RvcC5tYWluLmpzJztcblx0XHRcdGNvbnN0IHN0YWNrID0gW1xuXHRcdFx0XHRgICAgIGF0IGNUZS5nYyAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7d2luZG93c1VzZXJQYXRofSR7Y29kZVBhdGh9OjI3MjQ6ODE0OTIpYCxcblx0XHRcdFx0YCAgICBhdCBhc3luYyBjVGUuc2V0SW5wdXQgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke3dpbmRvd3NVc2VyUGF0aH0ke2NvZGVQYXRofToyNzI0OjgwNjUwKWAsXG5cdFx0XHRcdGAgICAgYXQgYXN5bmMgcUplLlMgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke3dpbmRvd3NVc2VyUGF0aH0ke2NvZGVQYXRofTo2OTg6NTg1MjApYCxcblx0XHRcdFx0YCAgICBhdCBhc3luYyBxSmUuTCAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7d2luZG93c1VzZXJQYXRofSR7Y29kZVBhdGh9OjY5ODo1NzA4MClgLFxuXHRcdFx0XHRgICAgIGF0IGFzeW5jIHFKZS5vcGVuRWRpdG9yICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHt3aW5kb3dzVXNlclBhdGh9JHtjb2RlUGF0aH06Njk4OjU2MTYyKWBcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHdpbmRvd3NFcnJvcjogYW55ID0gbmV3IEVycm9yKCdUaGUgZWRpdG9yIGNvdWxkIG5vdCBiZSBvcGVuZWQgYmVjYXVzZSB0aGUgZmlsZSB3YXMgbm90IGZvdW5kLicpO1xuXHRcdFx0d2luZG93c0Vycm9yLnN0YWNrID0gc3RhY2suam9pbignXFxuJyk7XG5cblx0XHRcdEVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcih3aW5kb3dzRXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXHRcdFx0Ly8gVmVyaWZ5IFBJSSAodXNlcm5hbWUgYW5kIHBhdGgpIGlzIHJlbW92ZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ2JwYXNlcm8nKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignVXNlcnMnKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignYzovVXNlcnMnKSwgLTEpO1xuXHRcdFx0Ly8gVmVyaWZ5IGltcG9ydGFudCBjb2RlIHBhdGggaXMgcHJlc2VydmVkXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKGNvZGVQYXRoKSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignb3V0L3ZzL3dvcmtiZW5jaCcpLCAtMSk7XG5cblx0XHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihvcmlnRXJyb3JIYW5kbGVyKTtcblx0XHR9XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmNhdWdodCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBXaW5kb3dzIFBJSSBidXQgcHJlc2VydmVzIGNvZGUgcGF0aCcsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBlcnJvclN0dWIgPSBzaW5vbi5zdHViKCk7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yID0gZXJyb3JTdHViO1xuXG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRjb25zdCB3aW5kb3dzVXNlclBhdGggPSAnYzovVXNlcnMvYnBhc2Vyby9BcHBEYXRhL0xvY2FsL1Byb2dyYW1zL01pY3Jvc29mdCUyMFZTJTIwQ29kZSUyMEluc2lkZXJzL3Jlc291cmNlcy9hcHAvJztcblx0XHRjb25zdCBjb2RlUGF0aCA9ICdvdXQvdnMvd29ya2JlbmNoL3dvcmtiZW5jaC5kZXNrdG9wLm1haW4uanMnO1xuXHRcdGNvbnN0IHN0YWNrID0gW1xuXHRcdFx0YCAgICBhdCBjVGUuZ2MgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke3dpbmRvd3NVc2VyUGF0aH0ke2NvZGVQYXRofToyNzI0OjgxNDkyKWAsXG5cdFx0XHRgICAgIGF0IGFzeW5jIGNUZS5zZXRJbnB1dCAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7d2luZG93c1VzZXJQYXRofSR7Y29kZVBhdGh9OjI3MjQ6ODA2NTApYCxcblx0XHRcdGAgICAgYXQgYXN5bmMgcUplLlMgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke3dpbmRvd3NVc2VyUGF0aH0ke2NvZGVQYXRofTo2OTg6NTg1MjApYFxuXHRcdF07XG5cblx0XHRjb25zdCB3aW5kb3dzRXJyb3I6IGFueSA9IG5ldyBFcnJvcignVGhlIGVkaXRvciBjb3VsZCBub3QgYmUgb3BlbmVkIGJlY2F1c2UgdGhlIGZpbGUgd2FzIG5vdCBmb3VuZC4nKTtcblx0XHR3aW5kb3dzRXJyb3Iuc3RhY2sgPSBzdGFjay5qb2luKCdcXG4nKTtcblxuXHRcdG1haW5XaW5kb3cub25lcnJvcignVGhlIGVkaXRvciBjb3VsZCBub3QgYmUgb3BlbmVkIGJlY2F1c2UgdGhlIGZpbGUgd2FzIG5vdCBmb3VuZC4nLCAndGVzdC5qcycsIDIsIDQyLCB3aW5kb3dzRXJyb3IpO1xuXHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvclN0dWIuY2FsbENvdW50LCAxKTtcblx0XHQvLyBWZXJpZnkgUElJICh1c2VybmFtZSBhbmQgcGF0aCkgaXMgcmVtb3ZlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ2JwYXNlcm8nKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ1VzZXJzJyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdjOi9Vc2VycycpLCAtMSk7XG5cdFx0Ly8gVmVyaWZ5IGltcG9ydGFudCBjb2RlIHBhdGggaXMgcHJlc2VydmVkXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihjb2RlUGF0aCksIC0xKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdvdXQvdnMvd29ya2JlbmNoJyksIC0xKTtcblxuXHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmV4cGVjdGVkIEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIG1hY09TIFBJSSBidXQgcHJlc2VydmVzIGNvZGUgcGF0aCcsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBvcmlnRXJyb3JIYW5kbGVyID0gRXJyb3JzLmVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRcdGNvbnN0IG1hY1VzZXJQYXRoID0gJ0FwcGxpY2F0aW9ucy9WaXN1YWwlMjBTdHVkaW8lMjBDb2RlJTIwLSUyMEluc2lkZXJzLmFwcC9Db250ZW50cy9SZXNvdXJjZXMvYXBwLyc7XG5cdFx0XHRjb25zdCBjb2RlUGF0aCA9ICdvdXQvdnMvd29ya2JlbmNoL3dvcmtiZW5jaC5kZXNrdG9wLm1haW4uanMnO1xuXHRcdFx0Y29uc3Qgc3RhY2sgPSBbXG5cdFx0XHRcdGAgICAgYXQgdVRlLmdjICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHttYWNVc2VyUGF0aH0ke2NvZGVQYXRofToyNzIwOjgxNDkyKWAsXG5cdFx0XHRcdGAgICAgYXQgYXN5bmMgdVRlLnNldElucHV0ICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHttYWNVc2VyUGF0aH0ke2NvZGVQYXRofToyNzIwOjgwNjUwKWAsXG5cdFx0XHRcdGAgICAgYXQgYXN5bmMgSkplLlMgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke21hY1VzZXJQYXRofSR7Y29kZVBhdGh9OjY5ODo1ODUyMClgLFxuXHRcdFx0XHRgICAgIGF0IGFzeW5jIEpKZS5MICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHttYWNVc2VyUGF0aH0ke2NvZGVQYXRofTo2OTg6NTcwODApYCxcblx0XHRcdFx0YCAgICBhdCBhc3luYyBKSmUub3BlbkVkaXRvciAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bWFjVXNlclBhdGh9JHtjb2RlUGF0aH06Njk4OjU2MTYyKWBcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IG1hY0Vycm9yOiBhbnkgPSBuZXcgRXJyb3IoJ1RoZSBlZGl0b3IgY291bGQgbm90IGJlIG9wZW5lZCBiZWNhdXNlIHRoZSBmaWxlIHdhcyBub3QgZm91bmQuJyk7XG5cdFx0XHRtYWNFcnJvci5zdGFjayA9IHN0YWNrLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3IobWFjRXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXHRcdFx0Ly8gVmVyaWZ5IFBJSSAoYXBwbGljYXRpb24gcGF0aCkgaXMgcmVtb3ZlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignQXBwbGljYXRpb25zL1Zpc3VhbCcpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdWaXN1YWwlMjBTdHVkaW8lMjBDb2RlJyksIC0xKTtcblx0XHRcdC8vIFZlcmlmeSBpbXBvcnRhbnQgY29kZSBwYXRoIGlzIHByZXNlcnZlZFxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihjb2RlUGF0aCksIC0xKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ291dC92cy93b3JrYmVuY2gnKSwgLTEpO1xuXG5cdFx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5jYXVnaHQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgbWFjT1MgUElJIGJ1dCBwcmVzZXJ2ZXMgY29kZSBwYXRoJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IGVycm9yU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHRtYWluV2luZG93Lm9uZXJyb3IgPSBlcnJvclN0dWI7XG5cblx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1hY1VzZXJQYXRoID0gJ0FwcGxpY2F0aW9ucy9WaXN1YWwlMjBTdHVkaW8lMjBDb2RlJTIwLSUyMEluc2lkZXJzLmFwcC9Db250ZW50cy9SZXNvdXJjZXMvYXBwLyc7XG5cdFx0Y29uc3QgY29kZVBhdGggPSAnb3V0L3ZzL3dvcmtiZW5jaC93b3JrYmVuY2guZGVza3RvcC5tYWluLmpzJztcblx0XHRjb25zdCBzdGFjayA9IFtcblx0XHRcdGAgICAgYXQgdVRlLmdjICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHttYWNVc2VyUGF0aH0ke2NvZGVQYXRofToyNzIwOjgxNDkyKWAsXG5cdFx0XHRgICAgIGF0IGFzeW5jIHVUZS5zZXRJbnB1dCAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bWFjVXNlclBhdGh9JHtjb2RlUGF0aH06MjcyMDo4MDY1MClgLFxuXHRcdFx0YCAgICBhdCBhc3luYyBKSmUuUyAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bWFjVXNlclBhdGh9JHtjb2RlUGF0aH06Njk4OjU4NTIwKWBcblx0XHRdO1xuXG5cdFx0Y29uc3QgbWFjRXJyb3I6IGFueSA9IG5ldyBFcnJvcignVGhlIGVkaXRvciBjb3VsZCBub3QgYmUgb3BlbmVkIGJlY2F1c2UgdGhlIGZpbGUgd2FzIG5vdCBmb3VuZC4nKTtcblx0XHRtYWNFcnJvci5zdGFjayA9IHN0YWNrLmpvaW4oJ1xcbicpO1xuXG5cdFx0bWFpbldpbmRvdy5vbmVycm9yKCdUaGUgZWRpdG9yIGNvdWxkIG5vdCBiZSBvcGVuZWQgYmVjYXVzZSB0aGUgZmlsZSB3YXMgbm90IGZvdW5kLicsICd0ZXN0LmpzJywgMiwgNDIsIG1hY0Vycm9yKTtcblx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0Ly8gVmVyaWZ5IFBJSSAoYXBwbGljYXRpb24gcGF0aCkgaXMgcmVtb3ZlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ0FwcGxpY2F0aW9ucy9WaXN1YWwnKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ1Zpc3VhbCUyMFN0dWRpbyUyMENvZGUnKSwgLTEpO1xuXHRcdC8vIFZlcmlmeSBpbXBvcnRhbnQgY29kZSBwYXRoIGlzIHByZXNlcnZlZFxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoY29kZVBhdGgpLCAtMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignb3V0L3ZzL3dvcmtiZW5jaCcpLCAtMSk7XG5cblx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBMaW51eCBQSUkgYnV0IHByZXNlcnZlcyBjb2RlIHBhdGgnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IEVycm9ycy5lcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBsaW51eFVzZXJQYXRoID0gJy9ob21lL3BhcmFsbGVscy9HaXREZXZlbG9wbWVudC92c2NvZGUtbm9kZS1zcWxpdGUzLXBlcmYvJztcblx0XHRcdGNvbnN0IGxpbnV4U3lzdGVtUGF0aCA9ICd1c3Ivc2hhcmUvY29kZS1pbnNpZGVycy9yZXNvdXJjZXMvYXBwLyc7XG5cdFx0XHRjb25zdCBjb2RlUGF0aCA9ICdvdXQvdnMvd29ya2JlbmNoL3dvcmtiZW5jaC5kZXNrdG9wLm1haW4uanMnO1xuXHRcdFx0Y29uc3Qgc3RhY2sgPSBbXG5cdFx0XHRcdGAgICAgYXQgX2t0LkcgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke2xpbnV4U3lzdGVtUGF0aH0ke2NvZGVQYXRofTozODI1OjY1OTQwKWAsXG5cdFx0XHRcdGAgICAgYXQgX2t0LkYgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke2xpbnV4U3lzdGVtUGF0aH0ke2NvZGVQYXRofTozODI1OjY1NzY1KWAsXG5cdFx0XHRcdGAgICAgYXQgYXN5bmMgYXh0LkwgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke2xpbnV4U3lzdGVtUGF0aH0ke2NvZGVQYXRofTozODMwOjk5OTgpYCxcblx0XHRcdFx0YCAgICBhdCBhc3luYyBheHQucmVhZFN0cmVhbSAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bGludXhTeXN0ZW1QYXRofSR7Y29kZVBhdGh9OjM4MzA6OTc3MylgLFxuXHRcdFx0XHRgICAgIGF0IGFzeW5jIG15ZS5FYiAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bGludXhTeXN0ZW1QYXRofSR7Y29kZVBhdGh9OjEzMTM6MTIzNTkpYFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgbGludXhFcnJvcjogYW55ID0gbmV3IEVycm9yKGBJbnZhbGlkIGZha2UgZmlsZSAnZ2l0OiR7bGludXhVc2VyUGF0aH1pbmRleC5qcy5naXQ/e1wicGF0aFwiOlwiJHtsaW51eFVzZXJQYXRofWluZGV4LmpzXCIsXCJyZWZcIjpcIlwifScgKENhbmNlbGVkOiBDYW5jZWxlZClgKTtcblx0XHRcdGxpbnV4RXJyb3Iuc3RhY2sgPSBzdGFjay5qb2luKCdcXG4nKTtcblxuXHRcdFx0RXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKGxpbnV4RXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXHRcdFx0Ly8gVmVyaWZ5IFBJSSAodXNlcm5hbWUgYW5kIGhvbWUgZGlyZWN0b3J5KSBpcyByZW1vdmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKCdwYXJhbGxlbHMnKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZignL2hvbWUvcGFyYWxsZWxzJyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2YoJ0dpdERldmVsb3BtZW50JyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ3BhcmFsbGVscycpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCcvaG9tZS9wYXJhbGxlbHMnKSwgLTEpO1xuXHRcdFx0Ly8gVmVyaWZ5IGltcG9ydGFudCBjb2RlIHBhdGggaXMgcHJlc2VydmVkXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKGNvZGVQYXRoKSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignb3V0L3ZzL3dvcmtiZW5jaCcpLCAtMSk7XG5cblx0XHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihvcmlnRXJyb3JIYW5kbGVyKTtcblx0XHR9XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmNhdWdodCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBMaW51eCBQSUkgYnV0IHByZXNlcnZlcyBjb2RlIHBhdGgnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3QgZXJyb3JTdHViID0gc2lub24uc3R1YigpO1xuXHRcdG1haW5XaW5kb3cub25lcnJvciA9IGVycm9yU3R1YjtcblxuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbGludXhVc2VyUGF0aCA9ICcvaG9tZS9wYXJhbGxlbHMvR2l0RGV2ZWxvcG1lbnQvdnNjb2RlLW5vZGUtc3FsaXRlMy1wZXJmLyc7XG5cdFx0Y29uc3QgbGludXhTeXN0ZW1QYXRoID0gJ3Vzci9zaGFyZS9jb2RlLWluc2lkZXJzL3Jlc291cmNlcy9hcHAvJztcblx0XHRjb25zdCBjb2RlUGF0aCA9ICdvdXQvdnMvd29ya2JlbmNoL3dvcmtiZW5jaC5kZXNrdG9wLm1haW4uanMnO1xuXHRcdGNvbnN0IHN0YWNrID0gW1xuXHRcdFx0YCAgICBhdCBfa3QuRyAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bGludXhTeXN0ZW1QYXRofSR7Y29kZVBhdGh9OjM4MjU6NjU5NDApYCxcblx0XHRcdGAgICAgYXQgX2t0LkYgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke2xpbnV4U3lzdGVtUGF0aH0ke2NvZGVQYXRofTozODI1OjY1NzY1KWAsXG5cdFx0XHRgICAgIGF0IGFzeW5jIGF4dC5MICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHtsaW51eFN5c3RlbVBhdGh9JHtjb2RlUGF0aH06MzgzMDo5OTk4KWBcblx0XHRdO1xuXG5cdFx0Y29uc3QgbGludXhFcnJvcjogYW55ID0gbmV3IEVycm9yKGBVbmFibGUgdG8gcmVhZCBmaWxlICdnaXQ6JHtsaW51eFVzZXJQYXRofWluZGV4LmpzLmdpdCdgKTtcblx0XHRsaW51eEVycm9yLnN0YWNrID0gc3RhY2suam9pbignXFxuJyk7XG5cblx0XHRtYWluV2luZG93Lm9uZXJyb3IoYFVuYWJsZSB0byByZWFkIGZpbGUgJ2dpdDoke2xpbnV4VXNlclBhdGh9aW5kZXguanMuZ2l0J2AsICd0ZXN0LmpzJywgMiwgNDIsIGxpbnV4RXJyb3IpO1xuXHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvclN0dWIuY2FsbENvdW50LCAxKTtcblx0XHQvLyBWZXJpZnkgUElJICh1c2VybmFtZSBhbmQgaG9tZSBkaXJlY3RvcnkpIGlzIHJlbW92ZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKCdwYXJhbGxlbHMnKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2YoJy9ob21lL3BhcmFsbGVscycpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZignR2l0RGV2ZWxvcG1lbnQnKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ3BhcmFsbGVscycpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignL2hvbWUvcGFyYWxsZWxzJyksIC0xKTtcblx0XHQvLyBWZXJpZnkgaW1wb3J0YW50IGNvZGUgcGF0aCBpcyBwcmVzZXJ2ZWRcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKGNvZGVQYXRoKSwgLTEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ291dC92cy93b3JrYmVuY2gnKSwgLTEpO1xuXG5cdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgRXJyb3IgVGVsZW1ldHJ5IHN0cmlwcyB3ZWIgb3JpZ2luIGJ1dCBwcmVzZXJ2ZXMgcGF0aCBpbiB3ZWIgc3RhY2sgdHJhY2VzIHdoZW4gcGlpUGF0aHMgaW5jbHVkZXMgb3JpZ2luJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRcdGNvbnN0IHdlYk9yaWdpbiA9ICdodHRwczovL2NvZGVzcGFjZS1ob3N0LmdpdGh1Yi5kZXYnO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSwgcGlpUGF0aHM6IFt3ZWJPcmlnaW5dIH0pO1xuXHRcdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGJ1bmRsZVBhdGggPSAnL3N0YXRpYy9idWlsZC9idW5kbGUuanMnO1xuXHRcdFx0Y29uc3Qgc3RhY2sgPSBbXG5cdFx0XHRcdGBFcnJvcjogU29tZXRoaW5nIGZhaWxlZGAsXG5cdFx0XHRcdGAgICAgYXQgeDN0Ll9kZWxlZ2F0ZSAoJHt3ZWJPcmlnaW59JHtidW5kbGVQYXRofToxOjIwMDk1MylgLFxuXHRcdFx0XHRgICAgIGF0IHk0dS5ydW4gKCR7d2ViT3JpZ2lufSR7YnVuZGxlUGF0aH06MTozMDQ4MjIpYCxcblx0XHRcdFx0YCAgICBhdCBEZWRpY2F0ZWRXb3JrZXJHbG9iYWxTY29wZS5zZWxmLm9ubWVzc2FnZWAsXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCB3ZWJFcnJvcjogYW55ID0gbmV3IEVycm9yKCdTb21ldGhpbmcgZmFpbGVkJyk7XG5cdFx0XHR3ZWJFcnJvci5zdGFjayA9IHN0YWNrLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3Iod2ViRXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXHRcdFx0Y29uc3QgY3MgPSB0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrO1xuXHRcdFx0Ly8gVmVyaWZ5IHRoZSB3ZWIgb3JpZ2luIGlzIHN0cmlwcGVkIChub3QgbGVha2VkIGFzIFBJSSlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcy5pbmRleE9mKHdlYk9yaWdpbiksIC0xLCAnV2ViIG9yaWdpbiBzaG91bGQgYmUgc3RyaXBwZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcy5pbmRleE9mKCdodHRwczovLycpLCAtMSwgJ0hUVFBTIHNjaGVtZSBzaG91bGQgYmUgc3RyaXBwZWQnKTtcblx0XHRcdC8vIFZlcmlmeSB0aGUgYnVuZGxlIHBhdGggaXMgcHJlc2VydmVkIGZvciBkZWJ1Z2dpbmdcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjcy5pbmRleE9mKGJ1bmRsZVBhdGgpLCAtMSwgJ0J1bmRsZSBwYXRoIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxXQUFXO0FBQ3ZCLE9BQU8sZUFBZTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixZQUFZLFlBQVk7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLE9BQU8sYUFBYTtBQUVwQixPQUFPLG9CQUFvQjtBQUMzQixTQUFTLHdCQUF3QixzQkFBc0I7QUFDdkQsU0FBa0Msd0JB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
