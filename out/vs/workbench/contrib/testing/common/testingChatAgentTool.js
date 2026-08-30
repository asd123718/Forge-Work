var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { disposableTimeout, RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { basename, isAbsolute } from "../../../../base/common/path.js";
import { isDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import {
  ILanguageModelToolsService,
  ToolDataSource
} from "../../chat/common/tools/languageModelToolsService.js";
import { TestId } from "./testId.js";
import { getTotalCoveragePercent } from "./testCoverage.js";
import { collectTestStateCounts, getTestProgressText } from "./testingProgressMessages.js";
import { isFailedState } from "./testingStates.js";
import { ITestResultService } from "./testResultService.js";
import { ITestService, testsInFile, waitForTestToBeIdle } from "./testService.js";
import { DetailType, TestItemExpandState, TestMessageType, TestResultState, TestRunProfileBitset } from "./testTypes.js";
import { Position } from "../../../../editor/common/core/position.js";
import { ITestProfileService } from "./testProfileService.js";
let TestingChatAgentToolContribution = class extends Disposable {
  constructor(instantiationService, toolsService) {
    super();
    const runTestsTool = instantiationService.createInstance(RunTestTool);
    this._register(toolsService.registerTool(RunTestTool.DEFINITION, runTestsTool));
    this._register(toolsService.executeToolSet.addTool(RunTestTool.DEFINITION));
    const testFailureTool = instantiationService.createInstance(TestFailureTool);
    this._register(toolsService.registerTool(TestFailureTool.DEFINITION, testFailureTool));
    this._register(toolsService.executeToolSet.addTool(TestFailureTool.DEFINITION));
  }
};
TestingChatAgentToolContribution.ID = "workbench.contrib.testing.chatAgentTool";
TestingChatAgentToolContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ILanguageModelToolsService)
], TestingChatAgentToolContribution);
let RunTestTool = class {
  constructor(_testService, _uriIdentityService, _workspaceContextService, _testResultService, _testProfileService) {
    this._testService = _testService;
    this._uriIdentityService = _uriIdentityService;
    this._workspaceContextService = _workspaceContextService;
    this._testResultService = _testResultService;
    this._testProfileService = _testProfileService;
  }
  async invoke(invocation, countTokens, progress, token) {
    const params = invocation.parameters;
    const mode = params.mode === "coverage" ? "coverage" : "run";
    let group = mode === "coverage" ? TestRunProfileBitset.Coverage : TestRunProfileBitset.Run;
    const coverageFiles = mode === "coverage" ? params.coverageFiles && params.coverageFiles.length ? params.coverageFiles : void 0 : void 0;
    const testFiles = await this._getFileTestsToRun(params, progress);
    const testCases = await this._getTestCasesToRun(params, testFiles, progress);
    if (!testCases.length) {
      return {
        content: [{ kind: "text", value: "No tests found in the files. Ensure the correct absolute paths are passed to the tool." }],
        toolResultError: localize("runTestTool.noTests", "No tests found in the files")
      };
    }
    progress.report({ message: localize("runTestTool.invoke.progress", "Starting test run...") });
    if (group === TestRunProfileBitset.Coverage) {
      if (!testCases.some((tc) => this._testProfileService.capabilitiesForTest(tc.item) & TestRunProfileBitset.Coverage)) {
        group = TestRunProfileBitset.Run;
      }
    }
    const result = await this._captureTestResult(testCases, group, token);
    if (!result) {
      return {
        content: [{ kind: "text", value: "No test run was started. Instruct the user to ensure their test runner is correctly configured" }],
        toolResultError: localize("runTestTool.noRunStarted", "No test run was started. This may be an issue with your test runner or extension.")
      };
    }
    await this._monitorRunProgress(result, progress, token);
    if (token.isCancellationRequested) {
      this._testService.cancelTestRun(result.id);
      return {
        content: [{ kind: "text", value: localize("runTestTool.invoke.cancelled", "Test run was cancelled.") }],
        toolResultMessage: localize("runTestTool.invoke.cancelled", "Test run was cancelled.")
      };
    }
    const summary = await buildTestRunSummary(result, mode, coverageFiles);
    const content = [{ kind: "text", value: summary }];
    return {
      content,
      toolResultMessage: getTestProgressText(collectTestStateCounts(false, [result]))
    };
  }
  /** Updates the UI progress as the test runs, resolving when the run is finished. */
  async _monitorRunProgress(result, progress, token) {
    const store = new DisposableStore();
    const update = () => {
      const counts = collectTestStateCounts(!result.completedAt, [result]);
      const text = getTestProgressText(counts);
      progress.report({ message: text, progress: counts.runSoFar / counts.totalWillBeRun });
    };
    const throttler = store.add(new RunOnceScheduler(update, 500));
    return new Promise((resolve) => {
      store.add(result.onChange(() => {
        if (!throttler.isScheduled) {
          throttler.schedule();
        }
      }));
      store.add(token.onCancellationRequested(() => {
        this._testService.cancelTestRun(result.id);
        resolve();
      }));
      store.add(result.onComplete(() => {
        update();
        resolve();
      }));
    }).finally(() => store.dispose());
  }
  /**
   * Captures the test result. This is a little tricky because some extensions
   * trigger an 'out of bound' test run, so we actually wait for the first
   * test run to come in that contains one or more tasks and treat that as the
   * one we're looking for.
   */
  async _captureTestResult(testCases, group, token) {
    const store = new DisposableStore();
    const onDidTimeout = store.add(new Emitter());
    return new Promise((resolve) => {
      store.add(onDidTimeout.event(() => {
        resolve(void 0);
      }));
      store.add(this._testResultService.onResultsChanged((ev) => {
        if ("started" in ev) {
          store.add(ev.started.onNewTask(() => {
            store.dispose();
            resolve(ev.started);
          }));
        }
      }));
      this._testService.runTests({
        group,
        tests: testCases,
        preserveFocus: true
      }, token).then(() => {
        if (!store.isDisposed) {
          store.add(disposableTimeout(() => onDidTimeout.fire(), 5e3));
        }
      });
    }).finally(() => store.dispose());
  }
  /** Filters the test files to individual test cases based on the provided parameters. */
  async _getTestCasesToRun(params, tests, progress) {
    if (!params.testNames?.length) {
      return tests;
    }
    progress.report({ message: localize("runTestTool.invoke.filterProgress", "Filtering tests...") });
    const testNames = params.testNames.map((t) => t.toLowerCase().trim());
    const filtered = [];
    const doFilter = async (test) => {
      const name = test.item.label.toLowerCase().trim();
      if (testNames.some((tn) => name.includes(tn))) {
        filtered.push(test);
        return;
      }
      if (test.expand === TestItemExpandState.Expandable) {
        await this._testService.collection.expand(test.item.extId, 1);
      }
      await waitForTestToBeIdle(this._testService, test);
      await Promise.all([...test.children].map(async (id) => {
        const item = this._testService.collection.getNodeById(id);
        if (item) {
          await doFilter(item);
        }
      }));
    };
    await Promise.all(tests.map(doFilter));
    return filtered;
  }
  /** Gets the file tests to run based on the provided parameters. */
  async _getFileTestsToRun(params, progress) {
    if (!params.files?.length) {
      return [...this._testService.collection.rootItems];
    }
    progress.report({ message: localize("runTestTool.invoke.filesProgress", "Discovering tests...") });
    const firstWorkspaceFolder = this._workspaceContextService.getWorkspace().folders.at(0)?.uri;
    const uris = params.files.map((f) => {
      if (isAbsolute(f)) {
        return URI.file(f);
      } else if (firstWorkspaceFolder) {
        return URI.joinPath(firstWorkspaceFolder, f);
      } else {
        return void 0;
      }
    }).filter(isDefined);
    const tests = [];
    for (const uri of uris) {
      for await (const files of testsInFile(this._testService, this._uriIdentityService, uri, void 0, false)) {
        for (const file of files) {
          tests.push(file);
        }
      }
    }
    return tests;
  }
  prepareToolInvocation(context, token) {
    const params = context.parameters;
    const title = localize("runTestTool.confirm.title", "Allow test run?");
    const inFiles = params.files?.map((f) => "`" + basename(f) + "`");
    return Promise.resolve({
      invocationMessage: localize("runTestTool.confirm.invocation", "Running tests..."),
      confirmationMessages: {
        title,
        message: inFiles?.length ? new MarkdownString().appendMarkdown(localize("runTestTool.confirm.message", "The model wants to run tests in {0}.", inFiles.join(", "))) : localize("runTestTool.confirm.all", "The model wants to run all tests."),
        allowAutoConfirm: true
      }
    });
  }
};
RunTestTool.ID = "runTests";
RunTestTool.DEFINITION = {
  id: RunTestTool.ID,
  toolReferenceName: "runTests",
  legacyToolReferenceFullNames: ["runTests"],
  displayName: "Run tests",
  modelDescription: 'Runs unit tests in files. Use this tool if the user asks to run tests or when you want to validate changes using unit tests, and prefer using this tool instead of the terminal tool. When possible, always try to provide `files` paths containing the relevant unit tests in order to avoid unnecessarily long test runs. This tool outputs detailed information about the results of the test run. Set mode="coverage" to also collect coverage and optionally provide coverageFiles for focused reporting.',
  icon: Codicon.beaker,
  inputSchema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "Absolute paths to the test files to run. If not provided, all test files will be run."
      },
      testNames: {
        type: "array",
        items: { type: "string" },
        description: "An array of test names to run. Depending on the context, test names defined in code may be strings or the names of functions or classes containing the test cases. If not provided, all tests in the files will be run."
      },
      mode: {
        type: "string",
        enum: ["run", "coverage"],
        description: 'Execution mode: "run" (default) runs tests normally, "coverage" collects coverage.'
      },
      coverageFiles: {
        type: "array",
        items: { type: "string" },
        description: 'When mode="coverage": absolute file paths to include detailed coverage info for. If not provided, a file-level summary of all files with incomplete coverage is shown.'
      }
    }
  },
  userDescription: localize("runTestTool.userDescription", "Run unit tests (optionally with coverage)"),
  source: ToolDataSource.Internal,
  tags: [
    "vscode_editing_with_tests",
    "enable_other_tool_copilot_readFile",
    "enable_other_tool_copilot_listDirectory",
    "enable_other_tool_copilot_findFiles",
    "enable_other_tool_copilot_runTests",
    "enable_other_tool_copilot_runTestsWithCoverage",
    "enable_other_tool_testFailure"
  ]
};
RunTestTool = __decorateClass([
  __decorateParam(0, ITestService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, ITestResultService),
  __decorateParam(4, ITestProfileService)
], RunTestTool);
let TestFailureTool = class {
  constructor(_testResultService) {
    this._testResultService = _testResultService;
  }
  async invoke(invocation, countTokens, progress, token) {
    const result = this._testResultService.results.find((r) => r.tasks.length > 0);
    if (!result) {
      return {
        content: [{ kind: "text", value: "No test failures were found yet, call the runTests tool to run tests and find failures." }]
      };
    }
    const details = await getFailureDetails(result);
    return {
      content: [{ kind: "text", value: details }]
    };
  }
  prepareToolInvocation(context, token) {
    return Promise.resolve({
      invocationMessage: localize("testFailureTool.invocation", "Finding test failures"),
      pastTenseMessage: localize("testFailureTool.pastTense", "Found test failures")
    });
  }
};
TestFailureTool.ID = "testFailure";
TestFailureTool.DEFINITION = {
  id: TestFailureTool.ID,
  toolReferenceName: "testFailure",
  legacyToolReferenceFullNames: ["copilot_testFailure"],
  displayName: localize("testFailureTool.displayName", "Test failures"),
  modelDescription: "Includes test failure information in the prompt. Use this tool to get the details of test failures from the most recent test run. If there are no failures yet, suggest running tests first.",
  icon: Codicon.beaker,
  inputSchema: {
    type: "object",
    properties: {}
  },
  userDescription: localize("testFailureTool.userDescription", "Include test failure information"),
  source: ToolDataSource.Internal,
  tags: [
    "vscode_editing_with_tests",
    "enable_other_tool_copilot_readFile",
    "enable_other_tool_copilot_listDirectory",
    "enable_other_tool_copilot_findFiles",
    "enable_other_tool_copilot_runTests"
  ]
};
TestFailureTool = __decorateClass([
  __decorateParam(0, ITestResultService)
], TestFailureTool);
async function buildTestRunSummary(result, mode, coverageFiles) {
  const failures = result.counts[TestResultState.Errored] + result.counts[TestResultState.Failed];
  let str = `<summary passed=${result.counts[TestResultState.Passed]} failed=${failures} />
`;
  if (failures !== 0) {
    str += await getFailureDetails(result);
  }
  if (mode === "coverage") {
    str += await getCoverageSummary(result, coverageFiles);
  }
  return str;
}
async function getCoverageSummary(result, coverageFiles) {
  let str = "";
  for (const task of result.tasks) {
    const coverage = task.coverage.get();
    if (!coverage) {
      continue;
    }
    if (!coverageFiles || !coverageFiles.length) {
      str += getOverallCoverageSummary(coverage);
      continue;
    }
    const normalized = coverageFiles.map((file) => URI.file(file).fsPath);
    const coveredFilesMap = /* @__PURE__ */ new Map();
    for (const file of coverage.getAllFiles().values()) {
      coveredFilesMap.set(file.uri.fsPath, file);
    }
    for (const path of normalized) {
      const file = coveredFilesMap.get(path);
      if (!file) {
        continue;
      }
      str += await getFileCoverageDetails(file, path);
    }
  }
  return str;
}
function getOverallCoverageSummary(coverage) {
  const files = [...coverage.getAllFiles().values()].map((f) => ({ path: f.uri.fsPath, pct: getTotalCoveragePercent(f.statement, f.branch, f.declaration) * 100 })).filter((f) => f.pct < 100).sort((a, b) => a.pct - b.pct);
  if (!files.length) {
    return "<coverageSummary>All files have 100% coverage.</coverageSummary>\n";
  }
  let str = "<coverageSummary>\n";
  for (const f of files) {
    str += `<file path="${f.path}" percent=${f.pct.toFixed(1)} />
`;
  }
  str += "</coverageSummary>\n";
  return str;
}
async function getFileCoverageDetails(file, path) {
  const pct = getTotalCoveragePercent(file.statement, file.branch, file.declaration) * 100;
  let str = `<coverage path="${path}" percent=${pct.toFixed(1)} statements=${file.statement.covered}/${file.statement.total}`;
  if (file.branch) {
    str += ` branches=${file.branch.covered}/${file.branch.total}`;
  }
  if (file.declaration) {
    str += ` declarations=${file.declaration.covered}/${file.declaration.total}`;
  }
  str += ">\n";
  try {
    const details = await file.details();
    const uncoveredDeclarations = [];
    const uncoveredBranches = [];
    const uncoveredLines = [];
    for (const detail of details) {
      if (detail.type === DetailType.Declaration) {
        if (!detail.count) {
          const line = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
          uncoveredDeclarations.push({ name: detail.name, line });
        }
      } else {
        if (!detail.count) {
          const startLine = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
          const endLine = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.endLineNumber;
          uncoveredLines.push([startLine, endLine]);
        }
        if (detail.branches) {
          for (const branch of detail.branches) {
            if (!branch.count) {
              let line;
              if (branch.location) {
                line = Position.isIPosition(branch.location) ? branch.location.lineNumber : branch.location.startLineNumber;
              } else {
                line = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
              }
              uncoveredBranches.push({ line, label: branch.label });
            }
          }
        }
      }
    }
    if (uncoveredDeclarations.length) {
      str += "uncovered functions: " + uncoveredDeclarations.map((d) => `${d.name}(L${d.line})`).join(", ") + "\n";
    }
    if (uncoveredBranches.length) {
      str += "uncovered branches: " + uncoveredBranches.map((b) => b.label ? `L${b.line}(${b.label})` : `L${b.line}`).join(", ") + "\n";
    }
    if (uncoveredLines.length) {
      str += "uncovered lines: " + mergeLineRanges(uncoveredLines) + "\n";
    }
  } catch {
  }
  str += "</coverage>\n";
  return str;
}
function mergeLineRanges(ranges) {
  if (!ranges.length) {
    return "";
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    const [start, end] = ranges[i];
    if (start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`).join(", ");
}
async function getFailureDetails(result) {
  let str = "";
  let hadMessages = false;
  for (const failure of result.tests) {
    if (!isFailedState(failure.ownComputedState)) {
      continue;
    }
    const [, ...testPath] = TestId.split(failure.item.extId);
    const testName = testPath.pop();
    str += `<testFailure name=${JSON.stringify(testName)} path=${JSON.stringify(testPath.join(" > "))}>
`;
    for (const task of failure.tasks) {
      for (const message of task.messages.filter((m) => m.type === TestMessageType.Error)) {
        hadMessages = true;
        if (message.expected !== void 0 && message.actual !== void 0) {
          str += `<expectedOutput>
${message.expected}
</expectedOutput>
`;
          str += `<actualOutput>
${message.actual}
</actualOutput>
`;
        } else {
          const messageText = typeof message.message === "string" ? message.message : message.message.value;
          str += `<message>
${messageText}
</message>
`;
        }
        if (message.stackTrace && message.stackTrace.length > 0) {
          for (const frame of message.stackTrace.slice(0, 10)) {
            if (frame.uri && frame.position) {
              str += `<stackFrame path="${frame.uri.fsPath}" line="${frame.position.lineNumber}" col="${frame.position.column}" />
`;
            } else if (frame.uri) {
              str += `<stackFrame path="${frame.uri.fsPath}">${frame.label}</stackFrame>
`;
            } else {
              str += `<stackFrame>${frame.label}</stackFrame>
`;
            }
          }
        }
        if (message.location) {
          str += `<location path="${message.location.uri.fsPath}" line="${message.location.range.startLineNumber}" col="${message.location.range.startColumn}" />
`;
        }
      }
    }
    str += `</testFailure>
`;
  }
  if (!hadMessages) {
    const output = result.tasks.map((t) => t.output.getRange(0, t.output.length).toString().trim()).join("\n");
    if (output) {
      str += `<output>
${output}
</output>
`;
    }
  }
  return str;
}
export {
  RunTestTool,
  TestFailureTool,
  TestingChatAgentToolContribution,
  buildTestRunSummary,
  getCoverageSummary,
  getFailureDetails,
  getFileCoverageDetails,
  getOverallCoverageSummary,
  mergeLineRanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcdGVzdGluZ0NoYXRBZ2VudFRvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCwgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzQWJzb2x1dGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCwgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7XG5cdENvdW50VG9rZW5zQ2FsbGJhY2ssXG5cdElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRJUHJlcGFyZWRUb29sSW52b2NhdGlvbixcblx0SVRvb2xEYXRhLFxuXHRJVG9vbEltcGwsXG5cdElUb29sSW52b2NhdGlvbixcblx0SVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LFxuXHRJVG9vbFJlc3VsdCxcblx0VG9vbERhdGFTb3VyY2UsXG5cdFRvb2xQcm9ncmVzcyxcbn0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBGaWxlQ292ZXJhZ2UsIFRlc3RDb3ZlcmFnZSwgZ2V0VG90YWxDb3ZlcmFnZVBlcmNlbnQgfSBmcm9tICcuL3Rlc3RDb3ZlcmFnZS5qcyc7XG5pbXBvcnQgeyBjb2xsZWN0VGVzdFN0YXRlQ291bnRzLCBnZXRUZXN0UHJvZ3Jlc3NUZXh0IH0gZnJvbSAnLi90ZXN0aW5nUHJvZ3Jlc3NNZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBpc0ZhaWxlZFN0YXRlIH0gZnJvbSAnLi90ZXN0aW5nU3RhdGVzLmpzJztcbmltcG9ydCB7IElUZXN0UmVzdWx0LCBMaXZlVGVzdFJlc3VsdCB9IGZyb20gJy4vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFNlcnZpY2UgfSBmcm9tICcuL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0U2VydmljZSwgdGVzdHNJbkZpbGUsIHdhaXRGb3JUZXN0VG9CZUlkbGUgfSBmcm9tICcuL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERldGFpbFR5cGUsIEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtLCBUZXN0SXRlbUV4cGFuZFN0YXRlLCBUZXN0TWVzc2FnZVR5cGUsIFRlc3RSZXN1bHRTdGF0ZSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQgfSBmcm9tICcuL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVzdFByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi90ZXN0UHJvZmlsZVNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVzdGluZ0NoYXRBZ2VudFRvb2xDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIudGVzdGluZy5jaGF0QWdlbnRUb29sJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgcnVuVGVzdHNUb29sID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUnVuVGVzdFRvb2wpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2woUnVuVGVzdFRvb2wuREVGSU5JVElPTiwgcnVuVGVzdHNUb29sKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9vbHNTZXJ2aWNlLmV4ZWN1dGVUb29sU2V0LmFkZFRvb2woUnVuVGVzdFRvb2wuREVGSU5JVElPTikpO1xuXG5cdFx0Y29uc3QgdGVzdEZhaWx1cmVUb29sID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdEZhaWx1cmVUb29sKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sKFRlc3RGYWlsdXJlVG9vbC5ERUZJTklUSU9OLCB0ZXN0RmFpbHVyZVRvb2wpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b29sc1NlcnZpY2UuZXhlY3V0ZVRvb2xTZXQuYWRkVG9vbChUZXN0RmFpbHVyZVRvb2wuREVGSU5JVElPTikpO1xuXHR9XG59XG5cbnR5cGUgTW9kZSA9ICdydW4nIHwgJ2NvdmVyYWdlJztcblxuaW50ZXJmYWNlIElSdW5UZXN0VG9vbFBhcmFtcyB7XG5cdGZpbGVzPzogc3RyaW5nW107XG5cdHRlc3ROYW1lcz86IHN0cmluZ1tdO1xuXHQvKiogRmlsZSBwYXRocyB0byByZXR1cm4gY292ZXJhZ2UgaW5mbyBmb3IgKG9ubHkgdXNlZCB3aGVuIG1vZGUgPT09ICdjb3ZlcmFnZScpICovXG5cdGNvdmVyYWdlRmlsZXM/OiBzdHJpbmdbXTtcblx0bW9kZT86IE1vZGU7XG59XG5cbmV4cG9ydCBjbGFzcyBSdW5UZXN0VG9vbCBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAncnVuVGVzdHMnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IERFRklOSVRJT046IElUb29sRGF0YSA9IHtcblx0XHRpZDogdGhpcy5JRCxcblx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3J1blRlc3RzJyxcblx0XHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ3J1blRlc3RzJ10sXG5cdFx0ZGlzcGxheU5hbWU6ICdSdW4gdGVzdHMnLFxuXHRcdG1vZGVsRGVzY3JpcHRpb246ICdSdW5zIHVuaXQgdGVzdHMgaW4gZmlsZXMuIFVzZSB0aGlzIHRvb2wgaWYgdGhlIHVzZXIgYXNrcyB0byBydW4gdGVzdHMgb3Igd2hlbiB5b3Ugd2FudCB0byB2YWxpZGF0ZSBjaGFuZ2VzIHVzaW5nIHVuaXQgdGVzdHMsIGFuZCBwcmVmZXIgdXNpbmcgdGhpcyB0b29sIGluc3RlYWQgb2YgdGhlIHRlcm1pbmFsIHRvb2wuIFdoZW4gcG9zc2libGUsIGFsd2F5cyB0cnkgdG8gcHJvdmlkZSBgZmlsZXNgIHBhdGhzIGNvbnRhaW5pbmcgdGhlIHJlbGV2YW50IHVuaXQgdGVzdHMgaW4gb3JkZXIgdG8gYXZvaWQgdW5uZWNlc3NhcmlseSBsb25nIHRlc3QgcnVucy4gVGhpcyB0b29sIG91dHB1dHMgZGV0YWlsZWQgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHJlc3VsdHMgb2YgdGhlIHRlc3QgcnVuLiBTZXQgbW9kZT1cImNvdmVyYWdlXCIgdG8gYWxzbyBjb2xsZWN0IGNvdmVyYWdlIGFuZCBvcHRpb25hbGx5IHByb3ZpZGUgY292ZXJhZ2VGaWxlcyBmb3IgZm9jdXNlZCByZXBvcnRpbmcuJyxcblx0XHRpY29uOiBDb2RpY29uLmJlYWtlcixcblx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGZpbGVzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQWJzb2x1dGUgcGF0aHMgdG8gdGhlIHRlc3QgZmlsZXMgdG8gcnVuLiBJZiBub3QgcHJvdmlkZWQsIGFsbCB0ZXN0IGZpbGVzIHdpbGwgYmUgcnVuLicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRlc3ROYW1lczoge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0FuIGFycmF5IG9mIHRlc3QgbmFtZXMgdG8gcnVuLiBEZXBlbmRpbmcgb24gdGhlIGNvbnRleHQsIHRlc3QgbmFtZXMgZGVmaW5lZCBpbiBjb2RlIG1heSBiZSBzdHJpbmdzIG9yIHRoZSBuYW1lcyBvZiBmdW5jdGlvbnMgb3IgY2xhc3NlcyBjb250YWluaW5nIHRoZSB0ZXN0IGNhc2VzLiBJZiBub3QgcHJvdmlkZWQsIGFsbCB0ZXN0cyBpbiB0aGUgZmlsZXMgd2lsbCBiZSBydW4uJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0bW9kZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsncnVuJywgJ2NvdmVyYWdlJ10sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdFeGVjdXRpb24gbW9kZTogXCJydW5cIiAoZGVmYXVsdCkgcnVucyB0ZXN0cyBub3JtYWxseSwgXCJjb3ZlcmFnZVwiIGNvbGxlY3RzIGNvdmVyYWdlLicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvdmVyYWdlRmlsZXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXaGVuIG1vZGU9XCJjb3ZlcmFnZVwiOiBhYnNvbHV0ZSBmaWxlIHBhdGhzIHRvIGluY2x1ZGUgZGV0YWlsZWQgY292ZXJhZ2UgaW5mbyBmb3IuIElmIG5vdCBwcm92aWRlZCwgYSBmaWxlLWxldmVsIHN1bW1hcnkgb2YgYWxsIGZpbGVzIHdpdGggaW5jb21wbGV0ZSBjb3ZlcmFnZSBpcyBzaG93bi4nXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSxcblx0XHR1c2VyRGVzY3JpcHRpb246IGxvY2FsaXplKCdydW5UZXN0VG9vbC51c2VyRGVzY3JpcHRpb24nLCAnUnVuIHVuaXQgdGVzdHMgKG9wdGlvbmFsbHkgd2l0aCBjb3ZlcmFnZSknKSxcblx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdHRhZ3M6IFtcblx0XHRcdCd2c2NvZGVfZWRpdGluZ193aXRoX3Rlc3RzJyxcblx0XHRcdCdlbmFibGVfb3RoZXJfdG9vbF9jb3BpbG90X3JlYWRGaWxlJyxcblx0XHRcdCdlbmFibGVfb3RoZXJfdG9vbF9jb3BpbG90X2xpc3REaXJlY3RvcnknLFxuXHRcdFx0J2VuYWJsZV9vdGhlcl90b29sX2NvcGlsb3RfZmluZEZpbGVzJyxcblx0XHRcdCdlbmFibGVfb3RoZXJfdG9vbF9jb3BpbG90X3J1blRlc3RzJyxcblx0XHRcdCdlbmFibGVfb3RoZXJfdG9vbF9jb3BpbG90X3J1blRlc3RzV2l0aENvdmVyYWdlJyxcblx0XHRcdCdlbmFibGVfb3RoZXJfdG9vbF90ZXN0RmFpbHVyZScsXG5cdFx0XSxcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVRlc3RSZXN1bHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlc3RSZXN1bHRTZXJ2aWNlOiBJVGVzdFJlc3VsdFNlcnZpY2UsXG5cdFx0QElUZXN0UHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVzdFByb2ZpbGVTZXJ2aWNlOiBJVGVzdFByb2ZpbGVTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIGNvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBwcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgcGFyYW1zOiBJUnVuVGVzdFRvb2xQYXJhbXMgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnM7XG5cdFx0Y29uc3QgbW9kZTogTW9kZSA9IChwYXJhbXMubW9kZSA9PT0gJ2NvdmVyYWdlJyA/ICdjb3ZlcmFnZScgOiAncnVuJyk7XG5cdFx0bGV0IGdyb3VwID0gKG1vZGUgPT09ICdjb3ZlcmFnZScgPyBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSA6IFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bik7XG5cdFx0Y29uc3QgY292ZXJhZ2VGaWxlcyA9IChtb2RlID09PSAnY292ZXJhZ2UnID8gKHBhcmFtcy5jb3ZlcmFnZUZpbGVzICYmIHBhcmFtcy5jb3ZlcmFnZUZpbGVzLmxlbmd0aCA/IHBhcmFtcy5jb3ZlcmFnZUZpbGVzIDogdW5kZWZpbmVkKSA6IHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCB0ZXN0RmlsZXMgPSBhd2FpdCB0aGlzLl9nZXRGaWxlVGVzdHNUb1J1bihwYXJhbXMsIHByb2dyZXNzKTtcblx0XHRjb25zdCB0ZXN0Q2FzZXMgPSBhd2FpdCB0aGlzLl9nZXRUZXN0Q2FzZXNUb1J1bihwYXJhbXMsIHRlc3RGaWxlcywgcHJvZ3Jlc3MpO1xuXHRcdGlmICghdGVzdENhc2VzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ05vIHRlc3RzIGZvdW5kIGluIHRoZSBmaWxlcy4gRW5zdXJlIHRoZSBjb3JyZWN0IGFic29sdXRlIHBhdGhzIGFyZSBwYXNzZWQgdG8gdGhlIHRvb2wuJyB9XSxcblx0XHRcdFx0dG9vbFJlc3VsdEVycm9yOiBsb2NhbGl6ZSgncnVuVGVzdFRvb2wubm9UZXN0cycsICdObyB0ZXN0cyBmb3VuZCBpbiB0aGUgZmlsZXMnKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ3J1blRlc3RUb29sLmludm9rZS5wcm9ncmVzcycsICdTdGFydGluZyB0ZXN0IHJ1bi4uLicpIH0pO1xuXG5cdFx0Ly8gSWYgdGhlIG1vZGVsIGFza3MgZm9yIGNvdmVyYWdlIGJ1dCB0aGUgdGVzdCBwcm92aWRlciBkb2Vzbid0IHN1cHBvcnQgaXQsIHVzZSBub3JtYWwgJ3J1bicgbW9kZVxuXHRcdGlmIChncm91cCA9PT0gVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UpIHtcblx0XHRcdGlmICghdGVzdENhc2VzLnNvbWUodGMgPT4gdGhpcy5fdGVzdFByb2ZpbGVTZXJ2aWNlLmNhcGFiaWxpdGllc0ZvclRlc3QodGMuaXRlbSkgJiBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSkpIHtcblx0XHRcdFx0Z3JvdXAgPSBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fY2FwdHVyZVRlc3RSZXN1bHQodGVzdENhc2VzLCBncm91cCwgdG9rZW4pO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnTm8gdGVzdCBydW4gd2FzIHN0YXJ0ZWQuIEluc3RydWN0IHRoZSB1c2VyIHRvIGVuc3VyZSB0aGVpciB0ZXN0IHJ1bm5lciBpcyBjb3JyZWN0bHkgY29uZmlndXJlZCcgfV0sXG5cdFx0XHRcdHRvb2xSZXN1bHRFcnJvcjogbG9jYWxpemUoJ3J1blRlc3RUb29sLm5vUnVuU3RhcnRlZCcsICdObyB0ZXN0IHJ1biB3YXMgc3RhcnRlZC4gVGhpcyBtYXkgYmUgYW4gaXNzdWUgd2l0aCB5b3VyIHRlc3QgcnVubmVyIG9yIGV4dGVuc2lvbi4nKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fbW9uaXRvclJ1blByb2dyZXNzKHJlc3VsdCwgcHJvZ3Jlc3MsIHRva2VuKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhpcy5fdGVzdFNlcnZpY2UuY2FuY2VsVGVzdFJ1bihyZXN1bHQuaWQpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogbG9jYWxpemUoJ3J1blRlc3RUb29sLmludm9rZS5jYW5jZWxsZWQnLCAnVGVzdCBydW4gd2FzIGNhbmNlbGxlZC4nKSB9XSxcblx0XHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2U6IGxvY2FsaXplKCdydW5UZXN0VG9vbC5pbnZva2UuY2FuY2VsbGVkJywgJ1Rlc3QgcnVuIHdhcyBjYW5jZWxsZWQuJyksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCBidWlsZFRlc3RSdW5TdW1tYXJ5KHJlc3VsdCwgbW9kZSwgY292ZXJhZ2VGaWxlcyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IHN1bW1hcnkgfSBhcyBjb25zdF07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogY29udGVudCBhcyBNdXRhYmxlPElUb29sUmVzdWx0Wydjb250ZW50J10+LFxuXHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2U6IGdldFRlc3RQcm9ncmVzc1RleHQoY29sbGVjdFRlc3RTdGF0ZUNvdW50cyhmYWxzZSwgW3Jlc3VsdF0pKSxcblx0XHR9O1xuXHR9XG5cblx0LyoqIFVwZGF0ZXMgdGhlIFVJIHByb2dyZXNzIGFzIHRoZSB0ZXN0IHJ1bnMsIHJlc29sdmluZyB3aGVuIHRoZSBydW4gaXMgZmluaXNoZWQuICovXG5cdHByaXZhdGUgYXN5bmMgX21vbml0b3JSdW5Qcm9ncmVzcyhyZXN1bHQ6IExpdmVUZXN0UmVzdWx0LCBwcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IHVwZGF0ZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGNvdW50cyA9IGNvbGxlY3RUZXN0U3RhdGVDb3VudHMoIXJlc3VsdC5jb21wbGV0ZWRBdCwgW3Jlc3VsdF0pO1xuXHRcdFx0Y29uc3QgdGV4dCA9IGdldFRlc3RQcm9ncmVzc1RleHQoY291bnRzKTtcblx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IHRleHQsIHByb2dyZXNzOiBjb3VudHMucnVuU29GYXIgLyBjb3VudHMudG90YWxXaWxsQmVSdW4gfSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRocm90dGxlciA9IHN0b3JlLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcih1cGRhdGUsIDUwMCkpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHJlc3VsdC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhyb3R0bGVyLmlzU2NoZWR1bGVkKSB7XG5cdFx0XHRcdFx0dGhyb3R0bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fdGVzdFNlcnZpY2UuY2FuY2VsVGVzdFJ1bihyZXN1bHQuaWQpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHN0b3JlLmFkZChyZXN1bHQub25Db21wbGV0ZSgoKSA9PiB7XG5cdFx0XHRcdHVwZGF0ZSgpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiBzdG9yZS5kaXNwb3NlKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhcHR1cmVzIHRoZSB0ZXN0IHJlc3VsdC4gVGhpcyBpcyBhIGxpdHRsZSB0cmlja3kgYmVjYXVzZSBzb21lIGV4dGVuc2lvbnNcblx0ICogdHJpZ2dlciBhbiAnb3V0IG9mIGJvdW5kJyB0ZXN0IHJ1biwgc28gd2UgYWN0dWFsbHkgd2FpdCBmb3IgdGhlIGZpcnN0XG5cdCAqIHRlc3QgcnVuIHRvIGNvbWUgaW4gdGhhdCBjb250YWlucyBvbmUgb3IgbW9yZSB0YXNrcyBhbmQgdHJlYXQgdGhhdCBhcyB0aGVcblx0ICogb25lIHdlJ3JlIGxvb2tpbmcgZm9yLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY2FwdHVyZVRlc3RSZXN1bHQodGVzdENhc2VzOiBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbVtdLCBncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TGl2ZVRlc3RSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBvbkRpZFRpbWVvdXQgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8TGl2ZVRlc3RSZXN1bHQgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKG9uRGlkVGltZW91dC5ldmVudCgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKHRoaXMuX3Rlc3RSZXN1bHRTZXJ2aWNlLm9uUmVzdWx0c0NoYW5nZWQoZXYgPT4ge1xuXHRcdFx0XHRpZiAoJ3N0YXJ0ZWQnIGluIGV2KSB7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKGV2LnN0YXJ0ZWQub25OZXdUYXNrKCgpID0+IHtcblx0XHRcdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoZXYuc3RhcnRlZCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3Rlc3RTZXJ2aWNlLnJ1blRlc3RzKHtcblx0XHRcdFx0Z3JvdXAsXG5cdFx0XHRcdHRlc3RzOiB0ZXN0Q2FzZXMsXG5cdFx0XHRcdHByZXNlcnZlRm9jdXM6IHRydWUsXG5cdFx0XHR9LCB0b2tlbikudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmICghc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiBvbkRpZFRpbWVvdXQuZmlyZSgpLCA1XzAwMCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHN0b3JlLmRpc3Bvc2UoKSk7XG5cdH1cblxuXHQvKiogRmlsdGVycyB0aGUgdGVzdCBmaWxlcyB0byBpbmRpdmlkdWFsIHRlc3QgY2FzZXMgYmFzZWQgb24gdGhlIHByb3ZpZGVkIHBhcmFtZXRlcnMuICovXG5cdHByaXZhdGUgYXN5bmMgX2dldFRlc3RDYXNlc1RvUnVuKHBhcmFtczogSVJ1blRlc3RUb29sUGFyYW1zLCB0ZXN0czogSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW1bXSwgcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcyk6IFByb21pc2U8SW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW1bXT4ge1xuXHRcdGlmICghcGFyYW1zLnRlc3ROYW1lcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGVzdHM7XG5cdFx0fVxuXG5cdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ3J1blRlc3RUb29sLmludm9rZS5maWx0ZXJQcm9ncmVzcycsICdGaWx0ZXJpbmcgdGVzdHMuLi4nKSB9KTtcblxuXHRcdGNvbnN0IHRlc3ROYW1lcyA9IHBhcmFtcy50ZXN0TmFtZXMubWFwKHQgPT4gdC50b0xvd2VyQ2FzZSgpLnRyaW0oKSk7XG5cdFx0Y29uc3QgZmlsdGVyZWQ6IEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtW10gPSBbXTtcblx0XHRjb25zdCBkb0ZpbHRlciA9IGFzeW5jICh0ZXN0OiBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbSkgPT4ge1xuXHRcdFx0Y29uc3QgbmFtZSA9IHRlc3QuaXRlbS5sYWJlbC50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcblx0XHRcdGlmICh0ZXN0TmFtZXMuc29tZSh0biA9PiBuYW1lLmluY2x1ZGVzKHRuKSkpIHtcblx0XHRcdFx0ZmlsdGVyZWQucHVzaCh0ZXN0KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGVzdC5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuRXhwYW5kYWJsZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90ZXN0U2VydmljZS5jb2xsZWN0aW9uLmV4cGFuZCh0ZXN0Lml0ZW0uZXh0SWQsIDEpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgd2FpdEZvclRlc3RUb0JlSWRsZSh0aGlzLl90ZXN0U2VydmljZSwgdGVzdCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4udGVzdC5jaGlsZHJlbl0ubWFwKGFzeW5jIGlkID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuX3Rlc3RTZXJ2aWNlLmNvbGxlY3Rpb24uZ2V0Tm9kZUJ5SWQoaWQpO1xuXHRcdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHRcdGF3YWl0IGRvRmlsdGVyKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKHRlc3RzLm1hcChkb0ZpbHRlcikpO1xuXHRcdHJldHVybiBmaWx0ZXJlZDtcblx0fVxuXG5cdC8qKiBHZXRzIHRoZSBmaWxlIHRlc3RzIHRvIHJ1biBiYXNlZCBvbiB0aGUgcHJvdmlkZWQgcGFyYW1ldGVycy4gKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0RmlsZVRlc3RzVG9SdW4ocGFyYW1zOiBJUnVuVGVzdFRvb2xQYXJhbXMsIHByb2dyZXNzOiBUb29sUHJvZ3Jlc3MpOiBQcm9taXNlPEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtW10+IHtcblx0XHRpZiAoIXBhcmFtcy5maWxlcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gWy4uLnRoaXMuX3Rlc3RTZXJ2aWNlLmNvbGxlY3Rpb24ucm9vdEl0ZW1zXTtcblx0XHR9XG5cblx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgncnVuVGVzdFRvb2wuaW52b2tlLmZpbGVzUHJvZ3Jlc3MnLCAnRGlzY292ZXJpbmcgdGVzdHMuLi4nKSB9KTtcblxuXHRcdGNvbnN0IGZpcnN0V29ya3NwYWNlRm9sZGVyID0gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5hdCgwKT8udXJpO1xuXHRcdGNvbnN0IHVyaXMgPSBwYXJhbXMuZmlsZXMubWFwKGYgPT4ge1xuXHRcdFx0aWYgKGlzQWJzb2x1dGUoZikpIHtcblx0XHRcdFx0cmV0dXJuIFVSSS5maWxlKGYpO1xuXHRcdFx0fSBlbHNlIGlmIChmaXJzdFdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRyZXR1cm4gVVJJLmpvaW5QYXRoKGZpcnN0V29ya3NwYWNlRm9sZGVyLCBmKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHRjb25zdCB0ZXN0czogSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIHVyaXMpIHtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgZmlsZXMgb2YgdGVzdHNJbkZpbGUodGhpcy5fdGVzdFNlcnZpY2UsIHRoaXMuX3VyaUlkZW50aXR5U2VydmljZSwgdXJpLCB1bmRlZmluZWQsIGZhbHNlKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdFx0XHR0ZXN0cy5wdXNoKGZpbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRlc3RzO1xuXHR9XG5cblx0cHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcmFtczogSVJ1blRlc3RUb29sUGFyYW1zID0gY29udGV4dC5wYXJhbWV0ZXJzO1xuXHRcdGNvbnN0IHRpdGxlID0gbG9jYWxpemUoJ3J1blRlc3RUb29sLmNvbmZpcm0udGl0bGUnLCAnQWxsb3cgdGVzdCBydW4/Jyk7XG5cdFx0Y29uc3QgaW5GaWxlcyA9IHBhcmFtcy5maWxlcz8ubWFwKChmOiBzdHJpbmcpID0+ICdgJyArIGJhc2VuYW1lKGYpICsgJ2AnKTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdydW5UZXN0VG9vbC5jb25maXJtLmludm9jYXRpb24nLCAnUnVubmluZyB0ZXN0cy4uLicpLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdG1lc3NhZ2U6IGluRmlsZXM/Lmxlbmd0aFxuXHRcdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ3J1blRlc3RUb29sLmNvbmZpcm0ubWVzc2FnZScsICdUaGUgbW9kZWwgd2FudHMgdG8gcnVuIHRlc3RzIGluIHswfS4nLCBpbkZpbGVzLmpvaW4oJywgJykpKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ3J1blRlc3RUb29sLmNvbmZpcm0uYWxsJywgJ1RoZSBtb2RlbCB3YW50cyB0byBydW4gYWxsIHRlc3RzLicpLFxuXHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdEZhaWx1cmVUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd0ZXN0RmFpbHVyZSc7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgREVGSU5JVElPTjogSVRvb2xEYXRhID0ge1xuXHRcdGlkOiB0aGlzLklELFxuXHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAndGVzdEZhaWx1cmUnLFxuXHRcdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsnY29waWxvdF90ZXN0RmFpbHVyZSddLFxuXHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndGVzdEZhaWx1cmVUb29sLmRpc3BsYXlOYW1lJywgJ1Rlc3QgZmFpbHVyZXMnKSxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiAnSW5jbHVkZXMgdGVzdCBmYWlsdXJlIGluZm9ybWF0aW9uIGluIHRoZSBwcm9tcHQuIFVzZSB0aGlzIHRvb2wgdG8gZ2V0IHRoZSBkZXRhaWxzIG9mIHRlc3QgZmFpbHVyZXMgZnJvbSB0aGUgbW9zdCByZWNlbnQgdGVzdCBydW4uIElmIHRoZXJlIGFyZSBubyBmYWlsdXJlcyB5ZXQsIHN1Z2dlc3QgcnVubmluZyB0ZXN0cyBmaXJzdC4nLFxuXHRcdGljb246IENvZGljb24uYmVha2VyLFxuXHRcdGlucHV0U2NoZW1hOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHt9LFxuXHRcdH0sXG5cdFx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdEZhaWx1cmVUb29sLnVzZXJEZXNjcmlwdGlvbicsICdJbmNsdWRlIHRlc3QgZmFpbHVyZSBpbmZvcm1hdGlvbicpLFxuXHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0dGFnczogW1xuXHRcdFx0J3ZzY29kZV9lZGl0aW5nX3dpdGhfdGVzdHMnLFxuXHRcdFx0J2VuYWJsZV9vdGhlcl90b29sX2NvcGlsb3RfcmVhZEZpbGUnLFxuXHRcdFx0J2VuYWJsZV9vdGhlcl90b29sX2NvcGlsb3RfbGlzdERpcmVjdG9yeScsXG5cdFx0XHQnZW5hYmxlX290aGVyX3Rvb2xfY29waWxvdF9maW5kRmlsZXMnLFxuXHRcdFx0J2VuYWJsZV9vdGhlcl90b29sX2NvcGlsb3RfcnVuVGVzdHMnLFxuXHRcdF0sXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXN0UmVzdWx0U2VydmljZTogSVRlc3RSZXN1bHRTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIGNvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBwcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fdGVzdFJlc3VsdFNlcnZpY2UucmVzdWx0cy5maW5kKHIgPT4gci50YXNrcy5sZW5ndGggPiAwKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ05vIHRlc3QgZmFpbHVyZXMgd2VyZSBmb3VuZCB5ZXQsIGNhbGwgdGhlIHJ1blRlc3RzIHRvb2wgdG8gcnVuIHRlc3RzIGFuZCBmaW5kIGZhaWx1cmVzLicgfV0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGRldGFpbHMgPSBhd2FpdCBnZXRGYWlsdXJlRGV0YWlscyhyZXN1bHQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBkZXRhaWxzIH1dLFxuXHRcdH07XG5cdH1cblxuXHRwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rlc3RGYWlsdXJlVG9vbC5pbnZvY2F0aW9uJywgJ0ZpbmRpbmcgdGVzdCBmYWlsdXJlcycpLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbG9jYWxpemUoJ3Rlc3RGYWlsdXJlVG9vbC5wYXN0VGVuc2UnLCAnRm91bmQgdGVzdCBmYWlsdXJlcycpLFxuXHRcdH0pO1xuXHR9XG59XG5cbi8qKiBCdWlsZHMgdGhlIGZ1bGwgc3VtbWFyeSBzdHJpbmcgZm9yIGEgY29tcGxldGVkIHRlc3QgcnVuLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJ1aWxkVGVzdFJ1blN1bW1hcnkocmVzdWx0OiBMaXZlVGVzdFJlc3VsdCwgbW9kZTogTW9kZSwgY292ZXJhZ2VGaWxlczogc3RyaW5nW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRjb25zdCBmYWlsdXJlcyA9IHJlc3VsdC5jb3VudHNbVGVzdFJlc3VsdFN0YXRlLkVycm9yZWRdICsgcmVzdWx0LmNvdW50c1tUZXN0UmVzdWx0U3RhdGUuRmFpbGVkXTtcblx0bGV0IHN0ciA9IGA8c3VtbWFyeSBwYXNzZWQ9JHtyZXN1bHQuY291bnRzW1Rlc3RSZXN1bHRTdGF0ZS5QYXNzZWRdfSBmYWlsZWQ9JHtmYWlsdXJlc30gLz5cXG5gO1xuXHRpZiAoZmFpbHVyZXMgIT09IDApIHtcblx0XHRzdHIgKz0gYXdhaXQgZ2V0RmFpbHVyZURldGFpbHMocmVzdWx0KTtcblx0fVxuXHRpZiAobW9kZSA9PT0gJ2NvdmVyYWdlJykge1xuXHRcdHN0ciArPSBhd2FpdCBnZXRDb3ZlcmFnZVN1bW1hcnkocmVzdWx0LCBjb3ZlcmFnZUZpbGVzKTtcblx0fVxuXHRyZXR1cm4gc3RyO1xufVxuXG4vKiogR2V0cyBhIGNvdmVyYWdlIHN1bW1hcnkgZnJvbSBhIHRlc3QgcmVzdWx0LCBlaXRoZXIgb3ZlcmFsbCBvciBwZXItZmlsZS4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDb3ZlcmFnZVN1bW1hcnkocmVzdWx0OiBMaXZlVGVzdFJlc3VsdCwgY292ZXJhZ2VGaWxlczogc3RyaW5nW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRsZXQgc3RyID0gJyc7XG5cdGZvciAoY29uc3QgdGFzayBvZiByZXN1bHQudGFza3MpIHtcblx0XHRjb25zdCBjb3ZlcmFnZSA9IHRhc2suY292ZXJhZ2UuZ2V0KCk7XG5cdFx0aWYgKCFjb3ZlcmFnZSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKCFjb3ZlcmFnZUZpbGVzIHx8ICFjb3ZlcmFnZUZpbGVzLmxlbmd0aCkge1xuXHRcdFx0c3RyICs9IGdldE92ZXJhbGxDb3ZlcmFnZVN1bW1hcnkoY292ZXJhZ2UpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IGNvdmVyYWdlRmlsZXMubWFwKGZpbGUgPT4gVVJJLmZpbGUoZmlsZSkuZnNQYXRoKTtcblx0XHRjb25zdCBjb3ZlcmVkRmlsZXNNYXAgPSBuZXcgTWFwPHN0cmluZywgRmlsZUNvdmVyYWdlPigpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBjb3ZlcmFnZS5nZXRBbGxGaWxlcygpLnZhbHVlcygpKSB7XG5cdFx0XHRjb3ZlcmVkRmlsZXNNYXAuc2V0KGZpbGUudXJpLmZzUGF0aCwgZmlsZSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBwYXRoIG9mIG5vcm1hbGl6ZWQpIHtcblx0XHRcdGNvbnN0IGZpbGUgPSBjb3ZlcmVkRmlsZXNNYXAuZ2V0KHBhdGgpO1xuXHRcdFx0aWYgKCFmaWxlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c3RyICs9IGF3YWl0IGdldEZpbGVDb3ZlcmFnZURldGFpbHMoZmlsZSwgcGF0aCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBzdHI7XG59XG5cbi8qKiBHZXRzIGEgZmlsZS1sZXZlbCBjb3ZlcmFnZSBvdmVydmlldyBzb3J0ZWQgYnkgbG93ZXN0IGNvdmVyYWdlIGZpcnN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldE92ZXJhbGxDb3ZlcmFnZVN1bW1hcnkoY292ZXJhZ2U6IFRlc3RDb3ZlcmFnZSk6IHN0cmluZyB7XG5cdGNvbnN0IGZpbGVzID0gWy4uLmNvdmVyYWdlLmdldEFsbEZpbGVzKCkudmFsdWVzKCldXG5cdFx0Lm1hcChmID0+ICh7IHBhdGg6IGYudXJpLmZzUGF0aCwgcGN0OiBnZXRUb3RhbENvdmVyYWdlUGVyY2VudChmLnN0YXRlbWVudCwgZi5icmFuY2gsIGYuZGVjbGFyYXRpb24pICogMTAwIH0pKVxuXHRcdC5maWx0ZXIoZiA9PiBmLnBjdCA8IDEwMClcblx0XHQuc29ydCgoYSwgYikgPT4gYS5wY3QgLSBiLnBjdCk7XG5cblx0aWYgKCFmaWxlcy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gJzxjb3ZlcmFnZVN1bW1hcnk+QWxsIGZpbGVzIGhhdmUgMTAwJSBjb3ZlcmFnZS48L2NvdmVyYWdlU3VtbWFyeT5cXG4nO1xuXHR9XG5cblx0bGV0IHN0ciA9ICc8Y292ZXJhZ2VTdW1tYXJ5Plxcbic7XG5cdGZvciAoY29uc3QgZiBvZiBmaWxlcykge1xuXHRcdHN0ciArPSBgPGZpbGUgcGF0aD1cIiR7Zi5wYXRofVwiIHBlcmNlbnQ9JHtmLnBjdC50b0ZpeGVkKDEpfSAvPlxcbmA7XG5cdH1cblx0c3RyICs9ICc8L2NvdmVyYWdlU3VtbWFyeT5cXG4nO1xuXHRyZXR1cm4gc3RyO1xufVxuXG4vKiogR2V0cyBkZXRhaWxlZCBjb3ZlcmFnZSBpbmZvcm1hdGlvbiBmb3IgYSBzaW5nbGUgZmlsZSBpbmNsdWRpbmcgdW5jb3ZlcmVkIGl0ZW1zLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEZpbGVDb3ZlcmFnZURldGFpbHMoZmlsZTogRmlsZUNvdmVyYWdlLCBwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRjb25zdCBwY3QgPSBnZXRUb3RhbENvdmVyYWdlUGVyY2VudChmaWxlLnN0YXRlbWVudCwgZmlsZS5icmFuY2gsIGZpbGUuZGVjbGFyYXRpb24pICogMTAwO1xuXHRsZXQgc3RyID0gYDxjb3ZlcmFnZSBwYXRoPVwiJHtwYXRofVwiIHBlcmNlbnQ9JHtwY3QudG9GaXhlZCgxKX0gc3RhdGVtZW50cz0ke2ZpbGUuc3RhdGVtZW50LmNvdmVyZWR9LyR7ZmlsZS5zdGF0ZW1lbnQudG90YWx9YDtcblx0aWYgKGZpbGUuYnJhbmNoKSB7XG5cdFx0c3RyICs9IGAgYnJhbmNoZXM9JHtmaWxlLmJyYW5jaC5jb3ZlcmVkfS8ke2ZpbGUuYnJhbmNoLnRvdGFsfWA7XG5cdH1cblx0aWYgKGZpbGUuZGVjbGFyYXRpb24pIHtcblx0XHRzdHIgKz0gYCBkZWNsYXJhdGlvbnM9JHtmaWxlLmRlY2xhcmF0aW9uLmNvdmVyZWR9LyR7ZmlsZS5kZWNsYXJhdGlvbi50b3RhbH1gO1xuXHR9XG5cdHN0ciArPSAnPlxcbic7XG5cblx0dHJ5IHtcblx0XHRjb25zdCBkZXRhaWxzID0gYXdhaXQgZmlsZS5kZXRhaWxzKCk7XG5cblx0XHRjb25zdCB1bmNvdmVyZWREZWNsYXJhdGlvbnM6IHsgbmFtZTogc3RyaW5nOyBsaW5lOiBudW1iZXIgfVtdID0gW107XG5cdFx0Y29uc3QgdW5jb3ZlcmVkQnJhbmNoZXM6IHsgbGluZTogbnVtYmVyOyBsYWJlbD86IHN0cmluZyB9W10gPSBbXTtcblx0XHRjb25zdCB1bmNvdmVyZWRMaW5lczogW251bWJlciwgbnVtYmVyXVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGRldGFpbCBvZiBkZXRhaWxzKSB7XG5cdFx0XHRpZiAoZGV0YWlsLnR5cGUgPT09IERldGFpbFR5cGUuRGVjbGFyYXRpb24pIHtcblx0XHRcdFx0aWYgKCFkZXRhaWwuY291bnQpIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lID0gUG9zaXRpb24uaXNJUG9zaXRpb24oZGV0YWlsLmxvY2F0aW9uKSA/IGRldGFpbC5sb2NhdGlvbi5saW5lTnVtYmVyIDogZGV0YWlsLmxvY2F0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0XHR1bmNvdmVyZWREZWNsYXJhdGlvbnMucHVzaCh7IG5hbWU6IGRldGFpbC5uYW1lLCBsaW5lIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIWRldGFpbC5jb3VudCkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0TGluZSA9IFBvc2l0aW9uLmlzSVBvc2l0aW9uKGRldGFpbC5sb2NhdGlvbikgPyBkZXRhaWwubG9jYXRpb24ubGluZU51bWJlciA6IGRldGFpbC5sb2NhdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0Y29uc3QgZW5kTGluZSA9IFBvc2l0aW9uLmlzSVBvc2l0aW9uKGRldGFpbC5sb2NhdGlvbikgPyBkZXRhaWwubG9jYXRpb24ubGluZU51bWJlciA6IGRldGFpbC5sb2NhdGlvbi5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdHVuY292ZXJlZExpbmVzLnB1c2goW3N0YXJ0TGluZSwgZW5kTGluZV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChkZXRhaWwuYnJhbmNoZXMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGJyYW5jaCBvZiBkZXRhaWwuYnJhbmNoZXMpIHtcblx0XHRcdFx0XHRcdGlmICghYnJhbmNoLmNvdW50KSB7XG5cdFx0XHRcdFx0XHRcdGxldCBsaW5lOiBudW1iZXI7XG5cdFx0XHRcdFx0XHRcdGlmIChicmFuY2gubG9jYXRpb24pIHtcblx0XHRcdFx0XHRcdFx0XHRsaW5lID0gUG9zaXRpb24uaXNJUG9zaXRpb24oYnJhbmNoLmxvY2F0aW9uKSA/IGJyYW5jaC5sb2NhdGlvbi5saW5lTnVtYmVyIDogYnJhbmNoLmxvY2F0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRsaW5lID0gUG9zaXRpb24uaXNJUG9zaXRpb24oZGV0YWlsLmxvY2F0aW9uKSA/IGRldGFpbC5sb2NhdGlvbi5saW5lTnVtYmVyIDogZGV0YWlsLmxvY2F0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR1bmNvdmVyZWRCcmFuY2hlcy5wdXNoKHsgbGluZSwgbGFiZWw6IGJyYW5jaC5sYWJlbCB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodW5jb3ZlcmVkRGVjbGFyYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0c3RyICs9ICd1bmNvdmVyZWQgZnVuY3Rpb25zOiAnICsgdW5jb3ZlcmVkRGVjbGFyYXRpb25zLm1hcChkID0+IGAke2QubmFtZX0oTCR7ZC5saW5lfSlgKS5qb2luKCcsICcpICsgJ1xcbic7XG5cdFx0fVxuXHRcdGlmICh1bmNvdmVyZWRCcmFuY2hlcy5sZW5ndGgpIHtcblx0XHRcdHN0ciArPSAndW5jb3ZlcmVkIGJyYW5jaGVzOiAnICsgdW5jb3ZlcmVkQnJhbmNoZXMubWFwKGIgPT4gYi5sYWJlbCA/IGBMJHtiLmxpbmV9KCR7Yi5sYWJlbH0pYCA6IGBMJHtiLmxpbmV9YCkuam9pbignLCAnKSArICdcXG4nO1xuXHRcdH1cblx0XHRpZiAodW5jb3ZlcmVkTGluZXMubGVuZ3RoKSB7XG5cdFx0XHRzdHIgKz0gJ3VuY292ZXJlZCBsaW5lczogJyArIG1lcmdlTGluZVJhbmdlcyh1bmNvdmVyZWRMaW5lcykgKyAnXFxuJztcblx0XHR9XG5cdH0gY2F0Y2ggeyAvKiBpZ25vcmUgLSBkZXRhaWxzIG5vdCBhdmFpbGFibGUgKi8gfVxuXG5cdHN0ciArPSAnPC9jb3ZlcmFnZT5cXG4nO1xuXHRyZXR1cm4gc3RyO1xufVxuXG4vKiogTWVyZ2VzIG92ZXJsYXBwaW5nL2NvbnRpZ3VvdXMgbGluZSByYW5nZXMgYW5kIGZvcm1hdHMgdGhlbSBjb21wYWN0bHkuICovXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VMaW5lUmFuZ2VzKHJhbmdlczogW251bWJlciwgbnVtYmVyXVtdKTogc3RyaW5nIHtcblx0aWYgKCFyYW5nZXMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdHJhbmdlcy5zb3J0KChhLCBiKSA9PiBhWzBdIC0gYlswXSk7XG5cdGNvbnN0IG1lcmdlZDogW251bWJlciwgbnVtYmVyXVtdID0gW3Jhbmdlc1swXV07XG5cdGZvciAobGV0IGkgPSAxOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgbGFzdCA9IG1lcmdlZFttZXJnZWQubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgW3N0YXJ0LCBlbmRdID0gcmFuZ2VzW2ldO1xuXHRcdGlmIChzdGFydCA8PSBsYXN0WzFdICsgMSkge1xuXHRcdFx0bGFzdFsxXSA9IE1hdGgubWF4KGxhc3RbMV0sIGVuZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lcmdlZC5wdXNoKFtzdGFydCwgZW5kXSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBtZXJnZWQubWFwKChbcywgZV0pID0+IHMgPT09IGUgPyBgJHtzfWAgOiBgJHtzfS0ke2V9YCkuam9pbignLCAnKTtcbn1cblxuLyoqIEZvcm1hdHMgZmFpbHVyZSBkZXRhaWxzIGZyb20gYSB0ZXN0IHJlc3VsdCBpbnRvIGFuIFhNTC1saWtlIHN0cmluZy4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRGYWlsdXJlRGV0YWlscyhyZXN1bHQ6IElUZXN0UmVzdWx0KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0bGV0IHN0ciA9ICcnO1xuXHRsZXQgaGFkTWVzc2FnZXMgPSBmYWxzZTtcblx0Zm9yIChjb25zdCBmYWlsdXJlIG9mIHJlc3VsdC50ZXN0cykge1xuXHRcdGlmICghaXNGYWlsZWRTdGF0ZShmYWlsdXJlLm93bkNvbXB1dGVkU3RhdGUpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBbLCAuLi50ZXN0UGF0aF0gPSBUZXN0SWQuc3BsaXQoZmFpbHVyZS5pdGVtLmV4dElkKTtcblx0XHRjb25zdCB0ZXN0TmFtZSA9IHRlc3RQYXRoLnBvcCgpO1xuXHRcdHN0ciArPSBgPHRlc3RGYWlsdXJlIG5hbWU9JHtKU09OLnN0cmluZ2lmeSh0ZXN0TmFtZSl9IHBhdGg9JHtKU09OLnN0cmluZ2lmeSh0ZXN0UGF0aC5qb2luKCcgPiAnKSl9PlxcbmA7XG5cdFx0Zm9yIChjb25zdCB0YXNrIG9mIGZhaWx1cmUudGFza3MpIHtcblx0XHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiB0YXNrLm1lc3NhZ2VzLmZpbHRlcihtID0+IG0udHlwZSA9PT0gVGVzdE1lc3NhZ2VUeXBlLkVycm9yKSkge1xuXHRcdFx0XHRoYWRNZXNzYWdlcyA9IHRydWU7XG5cblx0XHRcdFx0aWYgKG1lc3NhZ2UuZXhwZWN0ZWQgIT09IHVuZGVmaW5lZCAmJiBtZXNzYWdlLmFjdHVhbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0c3RyICs9IGA8ZXhwZWN0ZWRPdXRwdXQ+XFxuJHttZXNzYWdlLmV4cGVjdGVkfVxcbjwvZXhwZWN0ZWRPdXRwdXQ+XFxuYDtcblx0XHRcdFx0XHRzdHIgKz0gYDxhY3R1YWxPdXRwdXQ+XFxuJHttZXNzYWdlLmFjdHVhbH1cXG48L2FjdHVhbE91dHB1dD5cXG5gO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2VUZXh0ID0gdHlwZW9mIG1lc3NhZ2UubWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlLm1lc3NhZ2UgOiBtZXNzYWdlLm1lc3NhZ2UudmFsdWU7XG5cdFx0XHRcdFx0c3RyICs9IGA8bWVzc2FnZT5cXG4ke21lc3NhZ2VUZXh0fVxcbjwvbWVzc2FnZT5cXG5gO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1lc3NhZ2Uuc3RhY2tUcmFjZSAmJiBtZXNzYWdlLnN0YWNrVHJhY2UubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZnJhbWUgb2YgbWVzc2FnZS5zdGFja1RyYWNlLnNsaWNlKDAsIDEwKSkge1xuXHRcdFx0XHRcdFx0aWYgKGZyYW1lLnVyaSAmJiBmcmFtZS5wb3NpdGlvbikge1xuXHRcdFx0XHRcdFx0XHRzdHIgKz0gYDxzdGFja0ZyYW1lIHBhdGg9XCIke2ZyYW1lLnVyaS5mc1BhdGh9XCIgbGluZT1cIiR7ZnJhbWUucG9zaXRpb24ubGluZU51bWJlcn1cIiBjb2w9XCIke2ZyYW1lLnBvc2l0aW9uLmNvbHVtbn1cIiAvPlxcbmA7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGZyYW1lLnVyaSkge1xuXHRcdFx0XHRcdFx0XHRzdHIgKz0gYDxzdGFja0ZyYW1lIHBhdGg9XCIke2ZyYW1lLnVyaS5mc1BhdGh9XCI+JHtmcmFtZS5sYWJlbH08L3N0YWNrRnJhbWU+XFxuYDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHN0ciArPSBgPHN0YWNrRnJhbWU+JHtmcmFtZS5sYWJlbH08L3N0YWNrRnJhbWU+XFxuYDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobWVzc2FnZS5sb2NhdGlvbikge1xuXHRcdFx0XHRcdHN0ciArPSBgPGxvY2F0aW9uIHBhdGg9XCIke21lc3NhZ2UubG9jYXRpb24udXJpLmZzUGF0aH1cIiBsaW5lPVwiJHttZXNzYWdlLmxvY2F0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlcn1cIiBjb2w9XCIke21lc3NhZ2UubG9jYXRpb24ucmFuZ2Uuc3RhcnRDb2x1bW59XCIgLz5cXG5gO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3RyICs9IGA8L3Rlc3RGYWlsdXJlPlxcbmA7XG5cdH1cblxuXHRpZiAoIWhhZE1lc3NhZ2VzKSB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gcmVzdWx0LnRhc2tzLm1hcCh0ID0+IHQub3V0cHV0LmdldFJhbmdlKDAsIHQub3V0cHV0Lmxlbmd0aCkudG9TdHJpbmcoKS50cmltKCkpLmpvaW4oJ1xcbicpO1xuXHRcdGlmIChvdXRwdXQpIHtcblx0XHRcdHN0ciArPSBgPG91dHB1dD5cXG4ke291dHB1dH1cXG48L291dHB1dD5cXG5gO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBzdHI7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CLHdCQUF3QjtBQUVwRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxVQUFVLGtCQUFrQjtBQUNyQyxTQUFTLGlCQUEwQjtBQUNuQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUFFekM7QUFBQSxFQUVDO0FBQUEsRUFPQTtBQUFBLE9BRU07QUFDUCxTQUFTLGNBQWM7QUFDdkIsU0FBcUMsK0JBQStCO0FBQ3BFLFNBQVMsd0JBQXdCLDJCQUEyQjtBQUM1RCxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQWMsYUFBYSwyQkFBMkI7QUFDL0QsU0FBUyxZQUEyQyxxQkFBcUIsaUJBQWlCLGlCQUFpQiw0QkFBNEI7QUFDdkksU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFFN0IsSUFBTSxtQ0FBTixjQUErQyxXQUE2QztBQUFBLEVBR2xHLFlBQ3dCLHNCQUNLLGNBQzNCO0FBQ0QsVUFBTTtBQUNOLFVBQU0sZUFBZSxxQkFBcUIsZUFBZSxXQUFXO0FBQ3BFLFNBQUssVUFBVSxhQUFhLGFBQWEsWUFBWSxZQUFZLFlBQVksQ0FBQztBQUM5RSxTQUFLLFVBQVUsYUFBYSxlQUFlLFFBQVEsWUFBWSxVQUFVLENBQUM7QUFFMUUsVUFBTSxrQkFBa0IscUJBQXFCLGVBQWUsZUFBZTtBQUMzRSxTQUFLLFVBQVUsYUFBYSxhQUFhLGdCQUFnQixZQUFZLGVBQWUsQ0FBQztBQUNyRixTQUFLLFVBQVUsYUFBYSxlQUFlLFFBQVEsZ0JBQWdCLFVBQVUsQ0FBQztBQUFBLEVBQy9FO0FBQ0Q7QUFoQmEsaUNBQ1csS0FBSztBQURoQixtQ0FBTjtBQUFBLEVBSUo7QUFBQSxFQUNBO0FBQUEsR0FMVTtBQTRCTixJQUFNLGNBQU4sTUFBdUM7QUFBQSxFQStDN0MsWUFDZ0MsY0FDTyxxQkFDSywwQkFDTixvQkFDQyxxQkFDckM7QUFMOEI7QUFDTztBQUNLO0FBQ047QUFDQztBQUFBLEVBQ25DO0FBQUEsRUFFSixNQUFNLE9BQU8sWUFBNkIsYUFBa0MsVUFBd0IsT0FBZ0Q7QUFDbkosVUFBTSxTQUE2QixXQUFXO0FBQzlDLFVBQU0sT0FBYyxPQUFPLFNBQVMsYUFBYSxhQUFhO0FBQzlELFFBQUksUUFBUyxTQUFTLGFBQWEscUJBQXFCLFdBQVcscUJBQXFCO0FBQ3hGLFVBQU0sZ0JBQWlCLFNBQVMsYUFBYyxPQUFPLGlCQUFpQixPQUFPLGNBQWMsU0FBUyxPQUFPLGdCQUFnQixTQUFhO0FBRXhJLFVBQU0sWUFBWSxNQUFNLEtBQUssbUJBQW1CLFFBQVEsUUFBUTtBQUNoRSxVQUFNLFlBQVksTUFBTSxLQUFLLG1CQUFtQixRQUFRLFdBQVcsUUFBUTtBQUMzRSxRQUFJLENBQUMsVUFBVSxRQUFRO0FBQ3RCLGFBQU87QUFBQSxRQUNOLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxPQUFPLHlGQUF5RixDQUFDO0FBQUEsUUFDM0gsaUJBQWlCLFNBQVMsdUJBQXVCLDZCQUE2QjtBQUFBLE1BQy9FO0FBQUEsSUFDRDtBQUVBLGFBQVMsT0FBTyxFQUFFLFNBQVMsU0FBUywrQkFBK0Isc0JBQXNCLEVBQUUsQ0FBQztBQUc1RixRQUFJLFVBQVUscUJBQXFCLFVBQVU7QUFDNUMsVUFBSSxDQUFDLFVBQVUsS0FBSyxRQUFNLEtBQUssb0JBQW9CLG9CQUFvQixHQUFHLElBQUksSUFBSSxxQkFBcUIsUUFBUSxHQUFHO0FBQ2pILGdCQUFRLHFCQUFxQjtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBUyxNQUFNLEtBQUssbUJBQW1CLFdBQVcsT0FBTyxLQUFLO0FBQ3BFLFFBQUksQ0FBQyxRQUFRO0FBQ1osYUFBTztBQUFBLFFBQ04sU0FBUyxDQUFDLEVBQUUsTUFBTSxRQUFRLE9BQU8saUdBQWlHLENBQUM7QUFBQSxRQUNuSSxpQkFBaUIsU0FBUyw0QkFBNEIsbUZBQW1GO0FBQUEsTUFDMUk7QUFBQSxJQUNEO0FBRUEsVUFBTSxLQUFLLG9CQUFvQixRQUFRLFVBQVUsS0FBSztBQUV0RCxRQUFJLE1BQU0seUJBQXlCO0FBQ2xDLFdBQUssYUFBYSxjQUFjLE9BQU8sRUFBRTtBQUN6QyxhQUFPO0FBQUEsUUFDTixTQUFTLENBQUMsRUFBRSxNQUFNLFFBQVEsT0FBTyxTQUFTLGdDQUFnQyx5QkFBeUIsRUFBRSxDQUFDO0FBQUEsUUFDdEcsbUJBQW1CLFNBQVMsZ0NBQWdDLHlCQUF5QjtBQUFBLE1BQ3RGO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBVSxNQUFNLG9CQUFvQixRQUFRLE1BQU0sYUFBYTtBQUNyRSxVQUFNLFVBQVUsQ0FBQyxFQUFFLE1BQU0sUUFBUSxPQUFPLFFBQVEsQ0FBVTtBQUUxRCxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0EsbUJBQW1CLG9CQUFvQix1QkFBdUIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQUEsSUFDL0U7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdBLE1BQWMsb0JBQW9CLFFBQXdCLFVBQXdCLE9BQXlDO0FBQzFILFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUVsQyxVQUFNLFNBQVMsTUFBTTtBQUNwQixZQUFNLFNBQVMsdUJBQXVCLENBQUMsT0FBTyxhQUFhLENBQUMsTUFBTSxDQUFDO0FBQ25FLFlBQU0sT0FBTyxvQkFBb0IsTUFBTTtBQUN2QyxlQUFTLE9BQU8sRUFBRSxTQUFTLE1BQU0sVUFBVSxPQUFPLFdBQVcsT0FBTyxlQUFlLENBQUM7QUFBQSxJQUNyRjtBQUVBLFVBQU0sWUFBWSxNQUFNLElBQUksSUFBSSxpQkFBaUIsUUFBUSxHQUFHLENBQUM7QUFFN0QsV0FBTyxJQUFJLFFBQWMsYUFBVztBQUNuQyxZQUFNLElBQUksT0FBTyxTQUFTLE1BQU07QUFDL0IsWUFBSSxDQUFDLFVBQVUsYUFBYTtBQUMzQixvQkFBVSxTQUFTO0FBQUEsUUFDcEI7QUFBQSxNQUNELENBQUMsQ0FBQztBQUVGLFlBQU0sSUFBSSxNQUFNLHdCQUF3QixNQUFNO0FBQzdDLGFBQUssYUFBYSxjQUFjLE9BQU8sRUFBRTtBQUN6QyxnQkFBUTtBQUFBLE1BQ1QsQ0FBQyxDQUFDO0FBRUYsWUFBTSxJQUFJLE9BQU8sV0FBVyxNQUFNO0FBQ2pDLGVBQU87QUFDUCxnQkFBUTtBQUFBLE1BQ1QsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDLEVBQUUsUUFBUSxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDakM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLE1BQWMsbUJBQW1CLFdBQTRDLE9BQTZCLE9BQStEO0FBQ3hLLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLGVBQWUsTUFBTSxJQUFJLElBQUksUUFBYyxDQUFDO0FBRWxELFdBQU8sSUFBSSxRQUFvQyxhQUFXO0FBQ3pELFlBQU0sSUFBSSxhQUFhLE1BQU0sTUFBTTtBQUNsQyxnQkFBUSxNQUFTO0FBQUEsTUFDbEIsQ0FBQyxDQUFDO0FBRUYsWUFBTSxJQUFJLEtBQUssbUJBQW1CLGlCQUFpQixRQUFNO0FBQ3hELFlBQUksYUFBYSxJQUFJO0FBQ3BCLGdCQUFNLElBQUksR0FBRyxRQUFRLFVBQVUsTUFBTTtBQUNwQyxrQkFBTSxRQUFRO0FBQ2Qsb0JBQVEsR0FBRyxPQUFPO0FBQUEsVUFDbkIsQ0FBQyxDQUFDO0FBQUEsUUFDSDtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBSyxhQUFhLFNBQVM7QUFBQSxRQUMxQjtBQUFBLFFBQ0EsT0FBTztBQUFBLFFBQ1AsZUFBZTtBQUFBLE1BQ2hCLEdBQUcsS0FBSyxFQUFFLEtBQUssTUFBTTtBQUNwQixZQUFJLENBQUMsTUFBTSxZQUFZO0FBQ3RCLGdCQUFNLElBQUksa0JBQWtCLE1BQU0sYUFBYSxLQUFLLEdBQUcsR0FBSyxDQUFDO0FBQUEsUUFDOUQ7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUMsRUFBRSxRQUFRLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFBQSxFQUNqQztBQUFBO0FBQUEsRUFHQSxNQUFjLG1CQUFtQixRQUE0QixPQUF3QyxVQUFrRTtBQUN0SyxRQUFJLENBQUMsT0FBTyxXQUFXLFFBQVE7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFFQSxhQUFTLE9BQU8sRUFBRSxTQUFTLFNBQVMscUNBQXFDLG9CQUFvQixFQUFFLENBQUM7QUFFaEcsVUFBTSxZQUFZLE9BQU8sVUFBVSxJQUFJLE9BQUssRUFBRSxZQUFZLEVBQUUsS0FBSyxDQUFDO0FBQ2xFLFVBQU0sV0FBNEMsQ0FBQztBQUNuRCxVQUFNLFdBQVcsT0FBTyxTQUF3QztBQUMvRCxZQUFNLE9BQU8sS0FBSyxLQUFLLE1BQU0sWUFBWSxFQUFFLEtBQUs7QUFDaEQsVUFBSSxVQUFVLEtBQUssUUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDLEdBQUc7QUFDNUMsaUJBQVMsS0FBSyxJQUFJO0FBQ2xCO0FBQUEsTUFDRDtBQUVBLFVBQUksS0FBSyxXQUFXLG9CQUFvQixZQUFZO0FBQ25ELGNBQU0sS0FBSyxhQUFhLFdBQVcsT0FBTyxLQUFLLEtBQUssT0FBTyxDQUFDO0FBQUEsTUFDN0Q7QUFDQSxZQUFNLG9CQUFvQixLQUFLLGNBQWMsSUFBSTtBQUNqRCxZQUFNLFFBQVEsSUFBSSxDQUFDLEdBQUcsS0FBSyxRQUFRLEVBQUUsSUFBSSxPQUFNLE9BQU07QUFDcEQsY0FBTSxPQUFPLEtBQUssYUFBYSxXQUFXLFlBQVksRUFBRTtBQUN4RCxZQUFJLE1BQU07QUFDVCxnQkFBTSxTQUFTLElBQUk7QUFBQSxRQUNwQjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFVBQU0sUUFBUSxJQUFJLE1BQU0sSUFBSSxRQUFRLENBQUM7QUFDckMsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBR0EsTUFBYyxtQkFBbUIsUUFBNEIsVUFBa0U7QUFDOUgsUUFBSSxDQUFDLE9BQU8sT0FBTyxRQUFRO0FBQzFCLGFBQU8sQ0FBQyxHQUFHLEtBQUssYUFBYSxXQUFXLFNBQVM7QUFBQSxJQUNsRDtBQUVBLGFBQVMsT0FBTyxFQUFFLFNBQVMsU0FBUyxvQ0FBb0Msc0JBQXNCLEVBQUUsQ0FBQztBQUVqRyxVQUFNLHVCQUF1QixLQUFLLHlCQUF5QixhQUFhLEVBQUUsUUFBUSxHQUFHLENBQUMsR0FBRztBQUN6RixVQUFNLE9BQU8sT0FBTyxNQUFNLElBQUksT0FBSztBQUNsQyxVQUFJLFdBQVcsQ0FBQyxHQUFHO0FBQ2xCLGVBQU8sSUFBSSxLQUFLLENBQUM7QUFBQSxNQUNsQixXQUFXLHNCQUFzQjtBQUNoQyxlQUFPLElBQUksU0FBUyxzQkFBc0IsQ0FBQztBQUFBLE1BQzVDLE9BQU87QUFDTixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQyxFQUFFLE9BQU8sU0FBUztBQUVuQixVQUFNLFFBQXlDLENBQUM7QUFDaEQsZUFBVyxPQUFPLE1BQU07QUFDdkIsdUJBQWlCLFNBQVMsWUFBWSxLQUFLLGNBQWMsS0FBSyxxQkFBcUIsS0FBSyxRQUFXLEtBQUssR0FBRztBQUMxRyxtQkFBVyxRQUFRLE9BQU87QUFDekIsZ0JBQU0sS0FBSyxJQUFJO0FBQUEsUUFDaEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxzQkFBc0IsU0FBNEMsT0FBd0U7QUFDekksVUFBTSxTQUE2QixRQUFRO0FBQzNDLFVBQU0sUUFBUSxTQUFTLDZCQUE2QixpQkFBaUI7QUFDckUsVUFBTSxVQUFVLE9BQU8sT0FBTyxJQUFJLENBQUMsTUFBYyxNQUFNLFNBQVMsQ0FBQyxJQUFJLEdBQUc7QUFFeEUsV0FBTyxRQUFRLFFBQVE7QUFBQSxNQUN0QixtQkFBbUIsU0FBUyxrQ0FBa0Msa0JBQWtCO0FBQUEsTUFDaEYsc0JBQXNCO0FBQUEsUUFDckI7QUFBQSxRQUNBLFNBQVMsU0FBUyxTQUNmLElBQUksZUFBZSxFQUFFLGVBQWUsU0FBUywrQkFBK0Isd0NBQXdDLFFBQVEsS0FBSyxJQUFJLENBQUMsQ0FBQyxJQUN2SSxTQUFTLDJCQUEyQixtQ0FBbUM7QUFBQSxRQUMxRSxrQkFBa0I7QUFBQSxNQUNuQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQTdQYSxZQUNXLEtBQUs7QUFEaEIsWUFFVyxhQUF3QjtBQUFBLEVBQzlDLElBQUksWUFBSztBQUFBLEVBQ1QsbUJBQW1CO0FBQUEsRUFDbkIsOEJBQThCLENBQUMsVUFBVTtBQUFBLEVBQ3pDLGFBQWE7QUFBQSxFQUNiLGtCQUFrQjtBQUFBLEVBQ2xCLE1BQU0sUUFBUTtBQUFBLEVBQ2QsYUFBYTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLE1BQ1gsT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sT0FBTyxFQUFFLE1BQU0sU0FBUztBQUFBLFFBQ3hCLGFBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQSxXQUFXO0FBQUEsUUFDVixNQUFNO0FBQUEsUUFDTixPQUFPLEVBQUUsTUFBTSxTQUFTO0FBQUEsUUFDeEIsYUFBYTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUNOLE1BQU0sQ0FBQyxPQUFPLFVBQVU7QUFBQSxRQUN4QixhQUFhO0FBQUEsTUFDZDtBQUFBLE1BQ0EsZUFBZTtBQUFBLFFBQ2QsTUFBTTtBQUFBLFFBQ04sT0FBTyxFQUFFLE1BQU0sU0FBUztBQUFBLFFBQ3hCLGFBQWE7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUNBLGlCQUFpQixTQUFTLCtCQUErQiwyQ0FBMkM7QUFBQSxFQUNwRyxRQUFRLGVBQWU7QUFBQSxFQUN2QixNQUFNO0FBQUEsSUFDTDtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFDRDtBQTdDWSxjQUFOO0FBQUEsRUFnREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FwRFU7QUErUE4sSUFBTSxrQkFBTixNQUEyQztBQUFBLEVBd0JqRCxZQUNzQyxvQkFDcEM7QUFEb0M7QUFBQSxFQUNsQztBQUFBLEVBRUosTUFBTSxPQUFPLFlBQTZCLGFBQWtDLFVBQXdCLE9BQWdEO0FBQ25KLFVBQU0sU0FBUyxLQUFLLG1CQUFtQixRQUFRLEtBQUssT0FBSyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBQzNFLFFBQUksQ0FBQyxRQUFRO0FBQ1osYUFBTztBQUFBLFFBQ04sU0FBUyxDQUFDLEVBQUUsTUFBTSxRQUFRLE9BQU8sMEZBQTBGLENBQUM7QUFBQSxNQUM3SDtBQUFBLElBQ0Q7QUFFQSxVQUFNLFVBQVUsTUFBTSxrQkFBa0IsTUFBTTtBQUM5QyxXQUFPO0FBQUEsTUFDTixTQUFTLENBQUMsRUFBRSxNQUFNLFFBQVEsT0FBTyxRQUFRLENBQUM7QUFBQSxJQUMzQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLHNCQUFzQixTQUE0QyxPQUF3RTtBQUN6SSxXQUFPLFFBQVEsUUFBUTtBQUFBLE1BQ3RCLG1CQUFtQixTQUFTLDhCQUE4Qix1QkFBdUI7QUFBQSxNQUNqRixrQkFBa0IsU0FBUyw2QkFBNkIscUJBQXFCO0FBQUEsSUFDOUUsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQWhEYSxnQkFDVyxLQUFLO0FBRGhCLGdCQUVXLGFBQXdCO0FBQUEsRUFDOUMsSUFBSSxnQkFBSztBQUFBLEVBQ1QsbUJBQW1CO0FBQUEsRUFDbkIsOEJBQThCLENBQUMscUJBQXFCO0FBQUEsRUFDcEQsYUFBYSxTQUFTLCtCQUErQixlQUFlO0FBQUEsRUFDcEUsa0JBQWtCO0FBQUEsRUFDbEIsTUFBTSxRQUFRO0FBQUEsRUFDZCxhQUFhO0FBQUEsSUFDWixNQUFNO0FBQUEsSUFDTixZQUFZLENBQUM7QUFBQSxFQUNkO0FBQUEsRUFDQSxpQkFBaUIsU0FBUyxtQ0FBbUMsa0NBQWtDO0FBQUEsRUFDL0YsUUFBUSxlQUFlO0FBQUEsRUFDdkIsTUFBTTtBQUFBLElBQ0w7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUNEO0FBdEJZLGtCQUFOO0FBQUEsRUF5Qko7QUFBQSxHQXpCVTtBQW1EYixlQUFzQixvQkFBb0IsUUFBd0IsTUFBWSxlQUFzRDtBQUNuSSxRQUFNLFdBQVcsT0FBTyxPQUFPLGdCQUFnQixPQUFPLElBQUksT0FBTyxPQUFPLGdCQUFnQixNQUFNO0FBQzlGLE1BQUksTUFBTSxtQkFBbUIsT0FBTyxPQUFPLGdCQUFnQixNQUFNLENBQUMsV0FBVyxRQUFRO0FBQUE7QUFDckYsTUFBSSxhQUFhLEdBQUc7QUFDbkIsV0FBTyxNQUFNLGtCQUFrQixNQUFNO0FBQUEsRUFDdEM7QUFDQSxNQUFJLFNBQVMsWUFBWTtBQUN4QixXQUFPLE1BQU0sbUJBQW1CLFFBQVEsYUFBYTtBQUFBLEVBQ3REO0FBQ0EsU0FBTztBQUNSO0FBR0EsZUFBc0IsbUJBQW1CLFFBQXdCLGVBQXNEO0FBQ3RILE1BQUksTUFBTTtBQUNWLGFBQVcsUUFBUSxPQUFPLE9BQU87QUFDaEMsVUFBTSxXQUFXLEtBQUssU0FBUyxJQUFJO0FBQ25DLFFBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsUUFBUTtBQUM1QyxhQUFPLDBCQUEwQixRQUFRO0FBQ3pDO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxjQUFjLElBQUksVUFBUSxJQUFJLEtBQUssSUFBSSxFQUFFLE1BQU07QUFDbEUsVUFBTSxrQkFBa0Isb0JBQUksSUFBMEI7QUFDdEQsZUFBVyxRQUFRLFNBQVMsWUFBWSxFQUFFLE9BQU8sR0FBRztBQUNuRCxzQkFBZ0IsSUFBSSxLQUFLLElBQUksUUFBUSxJQUFJO0FBQUEsSUFDMUM7QUFFQSxlQUFXLFFBQVEsWUFBWTtBQUM5QixZQUFNLE9BQU8sZ0JBQWdCLElBQUksSUFBSTtBQUNyQyxVQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsTUFDRDtBQUNBLGFBQU8sTUFBTSx1QkFBdUIsTUFBTSxJQUFJO0FBQUEsSUFDL0M7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBR08sU0FBUywwQkFBMEIsVUFBZ0M7QUFDekUsUUFBTSxRQUFRLENBQUMsR0FBRyxTQUFTLFlBQVksRUFBRSxPQUFPLENBQUMsRUFDL0MsSUFBSSxRQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksUUFBUSxLQUFLLHdCQUF3QixFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsV0FBVyxJQUFJLElBQUksRUFBRSxFQUMzRyxPQUFPLE9BQUssRUFBRSxNQUFNLEdBQUcsRUFDdkIsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHO0FBRTlCLE1BQUksQ0FBQyxNQUFNLFFBQVE7QUFDbEIsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLE1BQU07QUFDVixhQUFXLEtBQUssT0FBTztBQUN0QixXQUFPLGVBQWUsRUFBRSxJQUFJLGFBQWEsRUFBRSxJQUFJLFFBQVEsQ0FBQyxDQUFDO0FBQUE7QUFBQSxFQUMxRDtBQUNBLFNBQU87QUFDUCxTQUFPO0FBQ1I7QUFHQSxlQUFzQix1QkFBdUIsTUFBb0IsTUFBK0I7QUFDL0YsUUFBTSxNQUFNLHdCQUF3QixLQUFLLFdBQVcsS0FBSyxRQUFRLEtBQUssV0FBVyxJQUFJO0FBQ3JGLE1BQUksTUFBTSxtQkFBbUIsSUFBSSxhQUFhLElBQUksUUFBUSxDQUFDLENBQUMsZUFBZSxLQUFLLFVBQVUsT0FBTyxJQUFJLEtBQUssVUFBVSxLQUFLO0FBQ3pILE1BQUksS0FBSyxRQUFRO0FBQ2hCLFdBQU8sYUFBYSxLQUFLLE9BQU8sT0FBTyxJQUFJLEtBQUssT0FBTyxLQUFLO0FBQUEsRUFDN0Q7QUFDQSxNQUFJLEtBQUssYUFBYTtBQUNyQixXQUFPLGlCQUFpQixLQUFLLFlBQVksT0FBTyxJQUFJLEtBQUssWUFBWSxLQUFLO0FBQUEsRUFDM0U7QUFDQSxTQUFPO0FBRVAsTUFBSTtBQUNILFVBQU0sVUFBVSxNQUFNLEtBQUssUUFBUTtBQUVuQyxVQUFNLHdCQUEwRCxDQUFDO0FBQ2pFLFVBQU0sb0JBQXdELENBQUM7QUFDL0QsVUFBTSxpQkFBcUMsQ0FBQztBQUU1QyxlQUFXLFVBQVUsU0FBUztBQUM3QixVQUFJLE9BQU8sU0FBUyxXQUFXLGFBQWE7QUFDM0MsWUFBSSxDQUFDLE9BQU8sT0FBTztBQUNsQixnQkFBTSxPQUFPLFNBQVMsWUFBWSxPQUFPLFFBQVEsSUFBSSxPQUFPLFNBQVMsYUFBYSxPQUFPLFNBQVM7QUFDbEcsZ0NBQXNCLEtBQUssRUFBRSxNQUFNLE9BQU8sTUFBTSxLQUFLLENBQUM7QUFBQSxRQUN2RDtBQUFBLE1BQ0QsT0FBTztBQUNOLFlBQUksQ0FBQyxPQUFPLE9BQU87QUFDbEIsZ0JBQU0sWUFBWSxTQUFTLFlBQVksT0FBTyxRQUFRLElBQUksT0FBTyxTQUFTLGFBQWEsT0FBTyxTQUFTO0FBQ3ZHLGdCQUFNLFVBQVUsU0FBUyxZQUFZLE9BQU8sUUFBUSxJQUFJLE9BQU8sU0FBUyxhQUFhLE9BQU8sU0FBUztBQUNyRyx5QkFBZSxLQUFLLENBQUMsV0FBVyxPQUFPLENBQUM7QUFBQSxRQUN6QztBQUNBLFlBQUksT0FBTyxVQUFVO0FBQ3BCLHFCQUFXLFVBQVUsT0FBTyxVQUFVO0FBQ3JDLGdCQUFJLENBQUMsT0FBTyxPQUFPO0FBQ2xCLGtCQUFJO0FBQ0osa0JBQUksT0FBTyxVQUFVO0FBQ3BCLHVCQUFPLFNBQVMsWUFBWSxPQUFPLFFBQVEsSUFBSSxPQUFPLFNBQVMsYUFBYSxPQUFPLFNBQVM7QUFBQSxjQUM3RixPQUFPO0FBQ04sdUJBQU8sU0FBUyxZQUFZLE9BQU8sUUFBUSxJQUFJLE9BQU8sU0FBUyxhQUFhLE9BQU8sU0FBUztBQUFBLGNBQzdGO0FBQ0EsZ0NBQWtCLEtBQUssRUFBRSxNQUFNLE9BQU8sT0FBTyxNQUFNLENBQUM7QUFBQSxZQUNyRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLHNCQUFzQixRQUFRO0FBQ2pDLGFBQU8sMEJBQTBCLHNCQUFzQixJQUFJLE9BQUssR0FBRyxFQUFFLElBQUksS0FBSyxFQUFFLElBQUksR0FBRyxFQUFFLEtBQUssSUFBSSxJQUFJO0FBQUEsSUFDdkc7QUFDQSxRQUFJLGtCQUFrQixRQUFRO0FBQzdCLGFBQU8seUJBQXlCLGtCQUFrQixJQUFJLE9BQUssRUFBRSxRQUFRLElBQUksRUFBRSxJQUFJLElBQUksRUFBRSxLQUFLLE1BQU0sSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxJQUFJO0FBQUEsSUFDNUg7QUFDQSxRQUFJLGVBQWUsUUFBUTtBQUMxQixhQUFPLHNCQUFzQixnQkFBZ0IsY0FBYyxJQUFJO0FBQUEsSUFDaEU7QUFBQSxFQUNELFFBQVE7QUFBQSxFQUF1QztBQUUvQyxTQUFPO0FBQ1AsU0FBTztBQUNSO0FBR08sU0FBUyxnQkFBZ0IsUUFBb0M7QUFDbkUsTUFBSSxDQUFDLE9BQU8sUUFBUTtBQUNuQixXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztBQUNqQyxRQUFNLFNBQTZCLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDN0MsV0FBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLFFBQVEsS0FBSztBQUN2QyxVQUFNLE9BQU8sT0FBTyxPQUFPLFNBQVMsQ0FBQztBQUNyQyxVQUFNLENBQUMsT0FBTyxHQUFHLElBQUksT0FBTyxDQUFDO0FBQzdCLFFBQUksU0FBUyxLQUFLLENBQUMsSUFBSSxHQUFHO0FBQ3pCLFdBQUssQ0FBQyxJQUFJLEtBQUssSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFHO0FBQUEsSUFDaEMsT0FBTztBQUNOLGFBQU8sS0FBSyxDQUFDLE9BQU8sR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQ0EsU0FBTyxPQUFPLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLE1BQU0sSUFBSSxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxLQUFLLElBQUk7QUFDeEU7QUFHQSxlQUFzQixrQkFBa0IsUUFBc0M7QUFDN0UsTUFBSSxNQUFNO0FBQ1YsTUFBSSxjQUFjO0FBQ2xCLGFBQVcsV0FBVyxPQUFPLE9BQU87QUFDbkMsUUFBSSxDQUFDLGNBQWMsUUFBUSxnQkFBZ0IsR0FBRztBQUM3QztBQUFBLElBQ0Q7QUFFQSxVQUFNLENBQUMsRUFBRSxHQUFHLFFBQVEsSUFBSSxPQUFPLE1BQU0sUUFBUSxLQUFLLEtBQUs7QUFDdkQsVUFBTSxXQUFXLFNBQVMsSUFBSTtBQUM5QixXQUFPLHFCQUFxQixLQUFLLFVBQVUsUUFBUSxDQUFDLFNBQVMsS0FBSyxVQUFVLFNBQVMsS0FBSyxLQUFLLENBQUMsQ0FBQztBQUFBO0FBQ2pHLGVBQVcsUUFBUSxRQUFRLE9BQU87QUFDakMsaUJBQVcsV0FBVyxLQUFLLFNBQVMsT0FBTyxPQUFLLEVBQUUsU0FBUyxnQkFBZ0IsS0FBSyxHQUFHO0FBQ2xGLHNCQUFjO0FBRWQsWUFBSSxRQUFRLGFBQWEsVUFBYSxRQUFRLFdBQVcsUUFBVztBQUNuRSxpQkFBTztBQUFBLEVBQXFCLFFBQVEsUUFBUTtBQUFBO0FBQUE7QUFDNUMsaUJBQU87QUFBQSxFQUFtQixRQUFRLE1BQU07QUFBQTtBQUFBO0FBQUEsUUFDekMsT0FBTztBQUNOLGdCQUFNLGNBQWMsT0FBTyxRQUFRLFlBQVksV0FBVyxRQUFRLFVBQVUsUUFBUSxRQUFRO0FBQzVGLGlCQUFPO0FBQUEsRUFBYyxXQUFXO0FBQUE7QUFBQTtBQUFBLFFBQ2pDO0FBRUEsWUFBSSxRQUFRLGNBQWMsUUFBUSxXQUFXLFNBQVMsR0FBRztBQUN4RCxxQkFBVyxTQUFTLFFBQVEsV0FBVyxNQUFNLEdBQUcsRUFBRSxHQUFHO0FBQ3BELGdCQUFJLE1BQU0sT0FBTyxNQUFNLFVBQVU7QUFDaEMscUJBQU8scUJBQXFCLE1BQU0sSUFBSSxNQUFNLFdBQVcsTUFBTSxTQUFTLFVBQVUsVUFBVSxNQUFNLFNBQVMsTUFBTTtBQUFBO0FBQUEsWUFDaEgsV0FBVyxNQUFNLEtBQUs7QUFDckIscUJBQU8scUJBQXFCLE1BQU0sSUFBSSxNQUFNLEtBQUssTUFBTSxLQUFLO0FBQUE7QUFBQSxZQUM3RCxPQUFPO0FBQ04scUJBQU8sZUFBZSxNQUFNLEtBQUs7QUFBQTtBQUFBLFlBQ2xDO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSxZQUFJLFFBQVEsVUFBVTtBQUNyQixpQkFBTyxtQkFBbUIsUUFBUSxTQUFTLElBQUksTUFBTSxXQUFXLFFBQVEsU0FBUyxNQUFNLGVBQWUsVUFBVSxRQUFRLFNBQVMsTUFBTSxXQUFXO0FBQUE7QUFBQSxRQUNuSjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBO0FBQUEsRUFDUjtBQUVBLE1BQUksQ0FBQyxhQUFhO0FBQ2pCLFVBQU0sU0FBUyxPQUFPLE1BQU0sSUFBSSxPQUFLLEVBQUUsT0FBTyxTQUFTLEdBQUcsRUFBRSxPQUFPLE1BQU0sRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLEVBQUUsS0FBSyxJQUFJO0FBQ3ZHLFFBQUksUUFBUTtBQUNYLGFBQU87QUFBQSxFQUFhLE1BQU07QUFBQTtBQUFBO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogW10KfQo=
