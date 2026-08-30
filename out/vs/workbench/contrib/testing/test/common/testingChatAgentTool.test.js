import assert from "assert";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Event } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { FileCoverage, TestCoverage } from "../../common/testCoverage.js";
import { LiveTestResult } from "../../common/testResult.js";
import { DetailType, TestMessageType, TestResultState, TestRunProfileBitset } from "../../common/testTypes.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { TestId } from "../../common/testId.js";
import { RunTestTool, buildTestRunSummary, getCoverageSummary, getOverallCoverageSummary, getFileCoverageDetails, mergeLineRanges, getFailureDetails } from "../../common/testingChatAgentTool.js";
suite("Workbench - RunTestTool", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let insertCounter = 0;
  let tool;
  const noopProgress = {
    report: (_update) => {
    }
  };
  const noopCountTokens = () => Promise.resolve(0);
  function createLiveTestResult(request) {
    const req = request ?? {
      group: TestRunProfileBitset.Run,
      targets: [{ profileId: 0, controllerId: "ctrlId", testIds: ["id-a"] }]
    };
    return ds.add(new LiveTestResult(
      `result-${insertCounter++}`,
      false,
      req,
      insertCounter,
      NullTelemetryService
    ));
  }
  function createTestCoverage(files) {
    const result = createLiveTestResult();
    const accessor = {
      getCoverageDetails: (id, _testId, _token) => {
        const entry = files.find((f) => f.uri.toString() === id);
        return Promise.resolve(entry?.details ?? []);
      }
    };
    const uriIdentity = upcastPartial({
      asCanonicalUri: (uri) => uri,
      extUri: upcastPartial({
        isEqual: (a, b) => a.toString() === b.toString(),
        ignorePathCasing: () => false
      })
    });
    const coverage = new TestCoverage(result, "task-1", uriIdentity, accessor);
    for (const f of files) {
      const fileCoverage = {
        id: f.uri.toString(),
        uri: f.uri,
        statement: f.statement,
        branch: f.branch,
        declaration: f.declaration
      };
      coverage.append(fileCoverage, void 0);
    }
    return coverage;
  }
  function makeStatement(line, count, endLine, branches) {
    return {
      type: DetailType.Statement,
      count,
      location: new Range(line, 1, endLine ?? line, 1),
      branches
    };
  }
  function makeDeclaration(name, line, count) {
    return {
      type: DetailType.Declaration,
      name,
      count,
      location: new Range(line, 1, line, 1)
    };
  }
  function makeBranch(line, count, label) {
    return {
      count,
      label,
      location: new Range(line, 1, line, 1)
    };
  }
  function createResultWithCoverage(coverageData) {
    const result = createLiveTestResult();
    result.addTask({ id: "task-1", name: "Test Task", running: true, ctrlId: "ctrlId" });
    const taskCov = result.tasks[0].coverage;
    taskCov.set(coverageData, void 0);
    return result;
  }
  function createResultWithTests(tests) {
    const result = createLiveTestResult();
    result.addTask({ id: "t", name: "Test Task", running: true, ctrlId: "ctrlId" });
    for (const t of tests) {
      const chain = TestId.split(t.extId);
      const items = chain.map((segment, i) => ({
        extId: new TestId(chain.slice(0, i + 1)).toString(),
        label: i === chain.length - 1 ? t.label : segment,
        busy: false,
        description: null,
        error: null,
        range: null,
        sortText: null,
        tags: [],
        uri: void 0
      }));
      result.addTestChainToRun("ctrlId", items);
    }
    for (const t of tests) {
      result.updateState(t.extId, "t", t.state);
      if (t.messages) {
        for (const msg of t.messages) {
          result.appendMessage(t.extId, "t", {
            type: msg.type,
            message: msg.message,
            expected: msg.expected,
            actual: msg.actual,
            contextValue: void 0,
            location: msg.location ? { uri: msg.location.uri, range: msg.location.range } : void 0,
            stackTrace: msg.stackTrace?.map((f) => ({
              uri: f.uri,
              position: f.position ? new Position(f.position.lineNumber, f.position.column) : void 0,
              label: f.label
            }))
          });
        }
      }
    }
    return result;
  }
  function createFileCov(uri, statement, details, opts) {
    const result = createLiveTestResult();
    const accessor = {
      getCoverageDetails: () => Promise.resolve(details)
    };
    return new FileCoverage({ id: "file-1", uri, statement, branch: opts?.branch, declaration: opts?.declaration }, result, accessor);
  }
  setup(() => {
    insertCounter = 0;
    const mockTestService = upcastPartial({
      collection: upcastPartial({
        rootItems: [],
        rootIds: [],
        expand: () => Promise.resolve(),
        getNodeById: () => void 0,
        getNodeByUrl: () => []
      }),
      runTests: () => Promise.resolve(upcastPartial({})),
      cancelTestRun: () => {
      }
    });
    const mockResultService = upcastPartial({
      onResultsChanged: Event.None
    });
    const mockProfileService = upcastPartial({
      capabilitiesForTest: () => TestRunProfileBitset.Run | TestRunProfileBitset.Coverage
    });
    const mockUriIdentity = upcastPartial({
      asCanonicalUri: (uri) => uri,
      extUri: upcastPartial({ isEqual: (a, b) => a.toString() === b.toString() })
    });
    const mockWorkspaceContext = upcastPartial({
      getWorkspace: () => upcastPartial({ id: "test", folders: [upcastPartial({ uri: URI.file("/workspace") })] })
    });
    tool = new RunTestTool(
      mockTestService,
      mockUriIdentity,
      mockWorkspaceContext,
      mockResultService,
      mockProfileService
    );
  });
  suite("invoke", () => {
    test("returns error when no tests found", async () => {
      const result = await tool.invoke(
        upcastPartial({ parameters: { files: ["/nonexistent/test.ts"] } }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(result.toolResultError);
      assert.ok(result.content[0].kind === "text" && result.content[0].value.includes("No tests found"));
    });
  });
  suite("_buildSummary", () => {
    test("includes pass/fail counts", async () => {
      const result = createResultWithTests([
        { extId: new TestId(["ctrlId", "a"]).toString(), label: "a", state: TestResultState.Passed },
        { extId: new TestId(["ctrlId", "b"]).toString(), label: "b", state: TestResultState.Failed, messages: [{ type: TestMessageType.Error, message: "boom" }] }
      ]);
      result.markComplete();
      const summary = await buildTestRunSummary(result, "run", void 0);
      assert.ok(summary.includes("<summary passed=1 failed=1 />"));
    });
    test("combines errored and failed in failure count", async () => {
      const result = createResultWithTests([
        { extId: new TestId(["ctrlId", "a"]).toString(), label: "a", state: TestResultState.Failed, messages: [{ type: TestMessageType.Error, message: "fail" }] },
        { extId: new TestId(["ctrlId", "b"]).toString(), label: "b", state: TestResultState.Errored, messages: [{ type: TestMessageType.Error, message: "error" }] },
        { extId: new TestId(["ctrlId", "c"]).toString(), label: "c", state: TestResultState.Passed }
      ]);
      result.markComplete();
      const summary = await buildTestRunSummary(result, "run", void 0);
      assert.ok(summary.includes("failed=2"));
    });
    test("includes coverage when mode is coverage", async () => {
      const coverageData = createTestCoverage([
        { uri: URI.file("/src/a.ts"), statement: { covered: 8, total: 10 } }
      ]);
      const result = createResultWithCoverage(coverageData);
      result.markComplete();
      const summary = await buildTestRunSummary(result, "coverage", void 0);
      assert.ok(summary.includes("<coverageSummary>"));
    });
    test("omits coverage when mode is run", async () => {
      const result = createLiveTestResult();
      result.addTask({ id: "t", name: "n", running: true, ctrlId: "ctrl" });
      result.markComplete();
      const summary = await buildTestRunSummary(result, "run", void 0);
      assert.ok(!summary.includes("<coverage"));
    });
  });
  suite("getCoverageSummary", () => {
    test("returns overall summary when no coverageFiles specified", async () => {
      const fileA = URI.file("/src/a.ts");
      const fileB = URI.file("/src/b.ts");
      const coverageData = createTestCoverage([
        { uri: fileA, statement: { covered: 5, total: 10 } },
        { uri: fileB, statement: { covered: 10, total: 10 } }
      ]);
      const result = createResultWithCoverage(coverageData);
      const summary = await getCoverageSummary(result, void 0);
      assert.ok(summary.includes("<coverageSummary>"));
      assert.ok(summary.includes(fileA.fsPath));
      assert.ok(!summary.includes(fileB.fsPath));
    });
    test("returns detailed summary for specified coverageFiles", async () => {
      const fileA = URI.file("/src/a.ts");
      const details = [
        makeDeclaration("uncoveredFn", 10, 0),
        makeStatement(20, 0, 25)
      ];
      const coverageData = createTestCoverage([
        { uri: fileA, statement: { covered: 8, total: 10 }, declaration: { covered: 0, total: 1 }, details }
      ]);
      const result = createResultWithCoverage(coverageData);
      const summary = await getCoverageSummary(result, [fileA.fsPath]);
      assert.ok(summary.includes(`<coverage path="${fileA.fsPath}"`));
      assert.ok(summary.includes("uncovered functions:"));
      assert.ok(summary.includes("uncoveredFn(L10)"));
      assert.ok(summary.includes("uncovered lines:"));
    });
    test("returns empty string when no coverage data exists", async () => {
      const fileA = URI.file("/src/a.ts");
      const result = createLiveTestResult();
      result.addTask({ id: "t", name: "n", running: true, ctrlId: "ctrl" });
      const summary = await getCoverageSummary(result, [fileA.fsPath]);
      assert.strictEqual(summary, "");
    });
    test("handles multiple coverageFiles", async () => {
      const fileA = URI.file("/src/a.ts");
      const fileB = URI.file("/src/b.ts");
      const coverageData = createTestCoverage([
        { uri: fileA, statement: { covered: 8, total: 10 }, details: [makeStatement(5, 0)] },
        { uri: fileB, statement: { covered: 3, total: 10 }, details: [makeDeclaration("fn", 1, 0)] }
      ]);
      const result = createResultWithCoverage(coverageData);
      const summary = await getCoverageSummary(result, [fileA.fsPath, fileB.fsPath]);
      assert.ok(summary.includes(fileA.fsPath));
      assert.ok(summary.includes(fileB.fsPath));
    });
    test("skips non-matching coverageFiles gracefully", async () => {
      const fileA = URI.file("/src/a.ts");
      const nonExistent = URI.file("/src/nonexistent.ts");
      const coverageData = createTestCoverage([
        { uri: fileA, statement: { covered: 8, total: 10 } }
      ]);
      const result = createResultWithCoverage(coverageData);
      const summary = await getCoverageSummary(result, [nonExistent.fsPath]);
      assert.strictEqual(summary, "");
    });
  });
  suite("getOverallCoverageSummary", () => {
    test("returns all-covered message when everything is 100%", () => {
      const coverage = createTestCoverage([
        { uri: URI.file("/src/a.ts"), statement: { covered: 10, total: 10 } },
        { uri: URI.file("/src/b.ts"), statement: { covered: 5, total: 5 } }
      ]);
      assert.strictEqual(
        getOverallCoverageSummary(coverage),
        "<coverageSummary>All files have 100% coverage.</coverageSummary>\n"
      );
    });
    test("sorts files by coverage ascending", () => {
      const high = URI.file("/src/high.ts");
      const low = URI.file("/src/low.ts");
      const mid = URI.file("/src/mid.ts");
      const coverage = createTestCoverage([
        { uri: high, statement: { covered: 9, total: 10 } },
        { uri: low, statement: { covered: 3, total: 10 } },
        { uri: mid, statement: { covered: 7, total: 10 } }
      ]);
      const summary = getOverallCoverageSummary(coverage);
      const lowIdx = summary.indexOf(low.fsPath);
      const midIdx = summary.indexOf(mid.fsPath);
      const highIdx = summary.indexOf(high.fsPath);
      assert.ok(lowIdx < midIdx && midIdx < highIdx);
    });
    test("excludes 100% files from listing", () => {
      const partial = URI.file("/src/partial.ts");
      const full = URI.file("/src/full.ts");
      const coverage = createTestCoverage([
        { uri: partial, statement: { covered: 5, total: 10 } },
        { uri: full, statement: { covered: 10, total: 10 } }
      ]);
      const summary = getOverallCoverageSummary(coverage);
      assert.ok(summary.includes(partial.fsPath));
      assert.ok(!summary.includes(full.fsPath));
    });
    test("includes percentage in output", () => {
      const coverage = createTestCoverage([
        { uri: URI.file("/src/a.ts"), statement: { covered: 7, total: 10 } }
      ]);
      const summary = getOverallCoverageSummary(coverage);
      assert.ok(summary.includes("percent=70.0"));
    });
  });
  suite("getFileCoverageDetails", () => {
    test("shows header with statement counts", async () => {
      const uri = URI.file("/src/foo.ts");
      const file = createFileCov(uri, { covered: 8, total: 10 }, []);
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(output.includes("statements=8/10"));
      assert.ok(output.includes("percent=80.0"));
      assert.ok(output.startsWith(`<coverage path="${uri.fsPath}"`));
      assert.ok(output.endsWith("</coverage>\n"));
    });
    test("includes branch counts when available", async () => {
      const uri = URI.file("/src/foo.ts");
      const file = createFileCov(uri, { covered: 8, total: 10 }, [], { branch: { covered: 3, total: 5 } });
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(output.includes("branches=3/5"));
    });
    test("includes declaration counts when available", async () => {
      const uri = URI.file("/src/foo.ts");
      const file = createFileCov(uri, { covered: 8, total: 10 }, [], { declaration: { covered: 2, total: 4 } });
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(output.includes("declarations=2/4"));
    });
    test("omits branch/declaration when not available", async () => {
      const uri = URI.file("/src/foo.ts");
      const file = createFileCov(uri, { covered: 8, total: 10 }, []);
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(!output.includes("branches="));
      assert.ok(!output.includes("declarations="));
    });
    test("lists uncovered declarations", async () => {
      const uri = URI.file("/src/foo.ts");
      const details = [
        makeDeclaration("handleError", 89, 0),
        makeDeclaration("processQueue", 120, 0),
        makeDeclaration("coveredFn", 50, 3)
      ];
      const file = createFileCov(uri, { covered: 8, total: 10 }, details, { declaration: { covered: 1, total: 3 } });
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(output.includes("uncovered functions: handleError(L89), processQueue(L120)"));
      assert.ok(!output.includes("coveredFn"));
    });
    test("lists uncovered branches with labels", async () => {
      const uri = URI.file("/src/foo.ts");
      const details = [
        makeStatement(34, 5, void 0, [
          makeBranch(34, 5, "then"),
          makeBranch(36, 0, "else")
        ]),
        makeStatement(56, 2, void 0, [
          makeBranch(56, 0, 'case "foo"'),
          makeBranch(58, 2, 'case "bar"')
        ])
      ];
      const file = createFileCov(uri, { covered: 8, total: 10 }, details, { branch: { covered: 2, total: 4 } });
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(output.includes('uncovered branches: L36(else), L56(case "foo")'));
    });
    test("lists uncovered branches without labels", async () => {
      const uri = URI.file("/src/foo.ts");
      const details = [
        makeStatement(10, 1, void 0, [makeBranch(10, 0)])
      ];
      const file = createFileCov(uri, { covered: 8, total: 10 }, details);
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(output.includes("uncovered branches: L10\n"));
    });
    test("uses parent statement location when branch has no location", async () => {
      const uri = URI.file("/src/foo.ts");
      const details = [
        makeStatement(42, 1, void 0, [{ count: 0, label: "else" }])
      ];
      const file = createFileCov(uri, { covered: 8, total: 10 }, details);
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(output.includes("L42(else)"));
    });
    test("lists merged uncovered line ranges", async () => {
      const uri = URI.file("/src/foo.ts");
      const details = [
        makeStatement(23, 0, 27),
        makeStatement(28, 0, 30),
        makeStatement(45, 0),
        makeStatement(67, 0, 72),
        makeStatement(100, 0, 105),
        makeStatement(50, 5)
        // covered
      ];
      const file = createFileCov(uri, { covered: 5, total: 11 }, details);
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(output.includes("uncovered lines: 23-30, 45, 67-72, 100-105"));
    });
    test("omits uncovered sections when all covered", async () => {
      const uri = URI.file("/src/foo.ts");
      const details = [
        makeDeclaration("fn", 10, 3),
        makeStatement(20, 5),
        makeStatement(30, 1, void 0, [makeBranch(30, 1, "then"), makeBranch(32, 2, "else")])
      ];
      const file = createFileCov(uri, { covered: 10, total: 10 }, details);
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(!output.includes("uncovered"));
    });
    test("handles details() throwing gracefully", async () => {
      const uri = URI.file("/src/err.ts");
      const result = createLiveTestResult();
      const accessor = {
        getCoverageDetails: () => Promise.reject(new Error("not available"))
      };
      const file = new FileCoverage({ id: "err", uri, statement: { covered: 5, total: 10 } }, result, accessor);
      const output = await getFileCoverageDetails(file, uri.fsPath);
      assert.ok(output.includes(`<coverage path="${uri.fsPath}"`));
      assert.ok(output.includes("</coverage>"));
      assert.ok(!output.includes("uncovered"));
    });
    test("full output snapshot", async () => {
      const uri = URI.file("/src/foo.ts");
      const details = [
        makeDeclaration("uncoveredFn", 10, 0),
        makeDeclaration("coveredFn", 20, 3),
        makeStatement(30, 0, 32),
        makeStatement(40, 5, void 0, [
          makeBranch(40, 5, "then"),
          makeBranch(42, 0, "else")
        ]),
        makeStatement(50, 3)
      ];
      const file = createFileCov(
        uri,
        { covered: 8, total: 10 },
        details,
        { branch: { covered: 1, total: 2 }, declaration: { covered: 1, total: 2 } }
      );
      assert.deepStrictEqual(
        await getFileCoverageDetails(file, uri.fsPath),
        `<coverage path="${uri.fsPath}" percent=71.4 statements=8/10 branches=1/2 declarations=1/2>
uncovered functions: uncoveredFn(L10)
uncovered branches: L42(else)
uncovered lines: 30-32
</coverage>
`
      );
    });
  });
  suite("mergeLineRanges", () => {
    test("returns empty for empty input", () => {
      assert.strictEqual(mergeLineRanges([]), "");
    });
    test("single range", () => {
      assert.strictEqual(mergeLineRanges([[5, 10]]), "5-10");
    });
    test("single line", () => {
      assert.strictEqual(mergeLineRanges([[5, 5]]), "5");
    });
    test("merges contiguous ranges", () => {
      assert.strictEqual(mergeLineRanges([[1, 3], [4, 6]]), "1-6");
    });
    test("keeps non-contiguous ranges separate", () => {
      assert.strictEqual(mergeLineRanges([[1, 3], [10, 12]]), "1-3, 10-12");
    });
    test("merges overlapping ranges", () => {
      assert.strictEqual(mergeLineRanges([[1, 5], [3, 8]]), "1-8");
    });
    test("merges adjacent single-line ranges", () => {
      assert.strictEqual(mergeLineRanges([[5, 5], [6, 6], [10, 10]]), "5-6, 10");
    });
    test("handles unsorted input", () => {
      assert.strictEqual(mergeLineRanges([[10, 12], [1, 3], [4, 6]]), "1-6, 10-12");
    });
    test("handles complex mixed ranges", () => {
      assert.strictEqual(mergeLineRanges([[1, 1], [3, 5], [2, 2], [7, 9], [10, 10]]), "1-5, 7-10");
    });
  });
  suite("getFailureDetails", () => {
    test("formats expected/actual outputs", async () => {
      const result = createResultWithTests([{
        extId: new TestId(["ctrlId", "suite", "myTest"]).toString(),
        label: "myTest",
        state: TestResultState.Failed,
        messages: [{
          type: TestMessageType.Error,
          message: "Assertion failed",
          expected: "hello",
          actual: "world"
        }]
      }]);
      result.markComplete();
      const output = await getFailureDetails(result);
      assert.ok(output.includes("<expectedOutput>\nhello\n</expectedOutput>"));
      assert.ok(output.includes("<actualOutput>\nworld\n</actualOutput>"));
    });
    test("formats plain message when no expected/actual", async () => {
      const result = createResultWithTests([{
        extId: new TestId(["ctrlId", "myTest"]).toString(),
        label: "myTest",
        state: TestResultState.Failed,
        messages: [{
          type: TestMessageType.Error,
          message: "Something went wrong"
        }]
      }]);
      result.markComplete();
      const output = await getFailureDetails(result);
      assert.ok(output.includes("<message>\nSomething went wrong\n</message>"));
    });
    test("includes test name and path", async () => {
      const result = createResultWithTests([{
        extId: new TestId(["ctrlId", "suite1", "suite2", "myTest"]).toString(),
        label: "myTest",
        state: TestResultState.Failed,
        messages: [{ type: TestMessageType.Error, message: "fail" }]
      }]);
      result.markComplete();
      const output = await getFailureDetails(result);
      assert.ok(output.includes('name="myTest"'));
      assert.ok(output.includes('path="suite1 > suite2"'));
    });
    test("includes stack trace frames", async () => {
      const testUri = URI.file("/src/test.ts");
      const helperUri = URI.file("/src/helper.ts");
      const result = createResultWithTests([{
        extId: new TestId(["ctrlId", "myTest"]).toString(),
        label: "myTest",
        state: TestResultState.Failed,
        messages: [{
          type: TestMessageType.Error,
          message: "fail",
          stackTrace: [
            { uri: testUri, position: { lineNumber: 10, column: 5 }, label: "testFn" },
            { uri: helperUri, position: void 0, label: "helperFn" },
            { uri: void 0, position: void 0, label: "anonymous" }
          ]
        }]
      }]);
      result.markComplete();
      const output = await getFailureDetails(result);
      assert.ok(output.includes(`path="${testUri.fsPath}" line="10" col="5"`));
      assert.ok(output.includes(`path="${helperUri.fsPath}">helperFn</stackFrame>`));
      assert.ok(output.includes(">anonymous</stackFrame>"));
    });
    test("includes location information", async () => {
      const testUri = URI.file("/src/test.ts");
      const result = createResultWithTests([{
        extId: new TestId(["ctrlId", "myTest"]).toString(),
        label: "myTest",
        state: TestResultState.Failed,
        messages: [{
          type: TestMessageType.Error,
          message: "fail",
          location: { uri: testUri, range: new Range(42, 8, 42, 20) }
        }]
      }]);
      result.markComplete();
      const output = await getFailureDetails(result);
      assert.ok(output.includes(`path="${testUri.fsPath}" line="42" col="8"`));
    });
    test("skips passing tests", async () => {
      const result = createResultWithTests([
        { extId: new TestId(["ctrlId", "pass"]).toString(), label: "pass", state: TestResultState.Passed },
        { extId: new TestId(["ctrlId", "fail"]).toString(), label: "fail", state: TestResultState.Failed, messages: [{ type: TestMessageType.Error, message: "boom" }] }
      ]);
      result.markComplete();
      const output = await getFailureDetails(result);
      assert.ok(!output.includes('name="pass"'));
      assert.ok(output.includes('name="fail"'));
    });
    test("shows task output when no per-test messages", async () => {
      const result = createResultWithTests([{
        extId: new TestId(["ctrlId", "myTest"]).toString(),
        label: "myTest",
        state: TestResultState.Failed
      }]);
      result.appendOutput(VSBuffer.fromString("raw test output"), "t");
      result.markComplete();
      const output = await getFailureDetails(result);
      assert.ok(output.includes("<output>\nraw test output\n</output>"));
    });
  });
  suite("prepareToolInvocation", () => {
    test("shows file names in confirmation", async () => {
      const prepared = await tool.prepareToolInvocation(
        upcastPartial({ parameters: { files: ["/path/to/test1.ts", "/path/to/test2.ts"] }, toolCallId: "call-1", chatSessionResource: void 0 }),
        CancellationToken.None
      );
      assert.ok(prepared);
      const msg = prepared.confirmationMessages?.message;
      assert.ok(msg);
      const msgStr = typeof msg === "string" ? msg : msg.value;
      assert.ok(msgStr.includes("test1.ts"));
      assert.ok(msgStr.includes("test2.ts"));
    });
    test("shows all-tests message when no files", async () => {
      const prepared = await tool.prepareToolInvocation(
        upcastPartial({ parameters: {}, toolCallId: "call-2", chatSessionResource: void 0 }),
        CancellationToken.None
      );
      assert.ok(prepared);
      const msg = prepared.confirmationMessages?.message;
      assert.ok(msg);
      const msgStr = typeof msg === "string" ? msg : msg.value;
      assert.ok(msgStr.toLowerCase().includes("all tests"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXHRlc3RcXGNvbW1vblxcdGVzdGluZ0NoYXRBZ2VudFRvb2wudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSUV4dFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFByb2dyZXNzU3RlcCB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZUNvdmVyYWdlLCBJQ292ZXJhZ2VBY2Nlc3NvciwgVGVzdENvdmVyYWdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RDb3ZlcmFnZS5qcyc7XG5pbXBvcnQgeyBMaXZlVGVzdFJlc3VsdCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0UmVzdWx0LmpzJztcbmltcG9ydCB7IElUZXN0UmVzdWx0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0UmVzdWx0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFpblRocmVhZFRlc3RDb2xsZWN0aW9uLCBJVGVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ292ZXJhZ2VEZXRhaWxzLCBEZXRhaWxUeXBlLCBJQnJhbmNoQ292ZXJhZ2UsIElEZWNsYXJhdGlvbkNvdmVyYWdlLCBJRmlsZUNvdmVyYWdlLCBJU3RhdGVtZW50Q292ZXJhZ2UsIFJlc29sdmVkVGVzdFJ1blJlcXVlc3QsIFRlc3RNZXNzYWdlVHlwZSwgVGVzdFJlc3VsdFN0YXRlLCBUZXN0UnVuUHJvZmlsZUJpdHNldCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVRlc3RQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0UHJvZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdElkLmpzJztcbmltcG9ydCB7IFJ1blRlc3RUb29sLCBidWlsZFRlc3RSdW5TdW1tYXJ5LCBnZXRDb3ZlcmFnZVN1bW1hcnksIGdldE92ZXJhbGxDb3ZlcmFnZVN1bW1hcnksIGdldEZpbGVDb3ZlcmFnZURldGFpbHMsIG1lcmdlTGluZVJhbmdlcywgZ2V0RmFpbHVyZURldGFpbHMgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdGluZ0NoYXRBZ2VudFRvb2wuanMnO1xuXG5zdWl0ZSgnV29ya2JlbmNoIC0gUnVuVGVzdFRvb2wnLCAoKSA9PiB7XG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc2VydENvdW50ZXIgPSAwO1xuXHRsZXQgdG9vbDogUnVuVGVzdFRvb2w7XG5cblx0Y29uc3Qgbm9vcFByb2dyZXNzID0ge1xuXHRcdHJlcG9ydDogKF91cGRhdGU6IElUb29sUHJvZ3Jlc3NTdGVwKSA9PiB7IH0sXG5cdH07XG5cdGNvbnN0IG5vb3BDb3VudFRva2VucyA9ICgpID0+IFByb21pc2UucmVzb2x2ZSgwKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVMaXZlVGVzdFJlc3VsdChyZXF1ZXN0PzogUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdCk6IExpdmVUZXN0UmVzdWx0IHtcblx0XHRjb25zdCByZXEgPSByZXF1ZXN0ID8/IHtcblx0XHRcdGdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sXG5cdFx0XHR0YXJnZXRzOiBbeyBwcm9maWxlSWQ6IDAsIGNvbnRyb2xsZXJJZDogJ2N0cmxJZCcsIHRlc3RJZHM6IFsnaWQtYSddIH1dLFxuXHRcdH07XG5cdFx0cmV0dXJuIGRzLmFkZChuZXcgTGl2ZVRlc3RSZXN1bHQoXG5cdFx0XHRgcmVzdWx0LSR7aW5zZXJ0Q291bnRlcisrfWAsXG5cdFx0XHRmYWxzZSxcblx0XHRcdHJlcSxcblx0XHRcdGluc2VydENvdW50ZXIsXG5cdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHQpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRlc3RDb3ZlcmFnZShmaWxlczogeyB1cmk6IFVSSTsgc3RhdGVtZW50OiB7IGNvdmVyZWQ6IG51bWJlcjsgdG90YWw6IG51bWJlciB9OyBicmFuY2g/OiB7IGNvdmVyZWQ6IG51bWJlcjsgdG90YWw6IG51bWJlciB9OyBkZWNsYXJhdGlvbj86IHsgY292ZXJlZDogbnVtYmVyOyB0b3RhbDogbnVtYmVyIH07IGRldGFpbHM/OiBDb3ZlcmFnZURldGFpbHNbXSB9W10pOiBUZXN0Q292ZXJhZ2Uge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZUxpdmVUZXN0UmVzdWx0KCk7XG5cdFx0Y29uc3QgYWNjZXNzb3I6IElDb3ZlcmFnZUFjY2Vzc29yID0ge1xuXHRcdFx0Z2V0Q292ZXJhZ2VEZXRhaWxzOiAoaWQsIF90ZXN0SWQsIF90b2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IGZpbGVzLmZpbmQoZiA9PiBmLnVyaS50b1N0cmluZygpID09PSBpZCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZW50cnk/LmRldGFpbHMgPz8gW10pO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IHVyaUlkZW50aXR5ID0gdXBjYXN0UGFydGlhbDxJVXJpSWRlbnRpdHlTZXJ2aWNlPih7XG5cdFx0XHRhc0Nhbm9uaWNhbFVyaTogKHVyaTogVVJJKSA9PiB1cmksXG5cdFx0XHRleHRVcmk6IHVwY2FzdFBhcnRpYWw8SUV4dFVyaT4oe1xuXHRcdFx0XHRpc0VxdWFsOiAoYTogVVJJLCBiOiBVUkkpID0+IGEudG9TdHJpbmcoKSA9PT0gYi50b1N0cmluZygpLFxuXHRcdFx0XHRpZ25vcmVQYXRoQ2FzaW5nOiAoKSA9PiBmYWxzZSxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvdmVyYWdlID0gbmV3IFRlc3RDb3ZlcmFnZShyZXN1bHQsICd0YXNrLTEnLCB1cmlJZGVudGl0eSwgYWNjZXNzb3IpO1xuXHRcdGZvciAoY29uc3QgZiBvZiBmaWxlcykge1xuXHRcdFx0Y29uc3QgZmlsZUNvdmVyYWdlOiBJRmlsZUNvdmVyYWdlID0ge1xuXHRcdFx0XHRpZDogZi51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0dXJpOiBmLnVyaSxcblx0XHRcdFx0c3RhdGVtZW50OiBmLnN0YXRlbWVudCxcblx0XHRcdFx0YnJhbmNoOiBmLmJyYW5jaCxcblx0XHRcdFx0ZGVjbGFyYXRpb246IGYuZGVjbGFyYXRpb24sXG5cdFx0XHR9O1xuXHRcdFx0Y292ZXJhZ2UuYXBwZW5kKGZpbGVDb3ZlcmFnZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvdmVyYWdlO1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZVN0YXRlbWVudChsaW5lOiBudW1iZXIsIGNvdW50OiBudW1iZXIsIGVuZExpbmU/OiBudW1iZXIsIGJyYW5jaGVzPzogSUJyYW5jaENvdmVyYWdlW10pOiBJU3RhdGVtZW50Q292ZXJhZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBEZXRhaWxUeXBlLlN0YXRlbWVudCxcblx0XHRcdGNvdW50LFxuXHRcdFx0bG9jYXRpb246IG5ldyBSYW5nZShsaW5lLCAxLCBlbmRMaW5lID8/IGxpbmUsIDEpLFxuXHRcdFx0YnJhbmNoZXMsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VEZWNsYXJhdGlvbihuYW1lOiBzdHJpbmcsIGxpbmU6IG51bWJlciwgY291bnQ6IG51bWJlcik6IElEZWNsYXJhdGlvbkNvdmVyYWdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogRGV0YWlsVHlwZS5EZWNsYXJhdGlvbixcblx0XHRcdG5hbWUsXG5cdFx0XHRjb3VudCxcblx0XHRcdGxvY2F0aW9uOiBuZXcgUmFuZ2UobGluZSwgMSwgbGluZSwgMSksXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VCcmFuY2gobGluZTogbnVtYmVyLCBjb3VudDogbnVtYmVyLCBsYWJlbD86IHN0cmluZyk6IElCcmFuY2hDb3ZlcmFnZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvdW50LFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRsb2NhdGlvbjogbmV3IFJhbmdlKGxpbmUsIDEsIGxpbmUsIDEpLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVSZXN1bHRXaXRoQ292ZXJhZ2UoY292ZXJhZ2VEYXRhOiBUZXN0Q292ZXJhZ2UpOiBMaXZlVGVzdFJlc3VsdCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY3JlYXRlTGl2ZVRlc3RSZXN1bHQoKTtcblx0XHRyZXN1bHQuYWRkVGFzayh7IGlkOiAndGFzay0xJywgbmFtZTogJ1Rlc3QgVGFzaycsIHJ1bm5pbmc6IHRydWUsIGN0cmxJZDogJ2N0cmxJZCcgfSk7XG5cdFx0Y29uc3QgdGFza0NvdiA9IHJlc3VsdC50YXNrc1swXS5jb3ZlcmFnZSBhcyBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8VGVzdENvdmVyYWdlIHwgdW5kZWZpbmVkPj47XG5cdFx0dGFza0Nvdi5zZXQoY292ZXJhZ2VEYXRhLCB1bmRlZmluZWQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVSZXN1bHRXaXRoVGVzdHModGVzdHM6IHsgZXh0SWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgc3RhdGU6IFRlc3RSZXN1bHRTdGF0ZTsgbWVzc2FnZXM/OiB7IHR5cGU6IFRlc3RNZXNzYWdlVHlwZTsgbWVzc2FnZTogc3RyaW5nOyBleHBlY3RlZD86IHN0cmluZzsgYWN0dWFsPzogc3RyaW5nOyBsb2NhdGlvbj86IHsgdXJpOiBVUkk7IHJhbmdlOiBSYW5nZSB9OyBzdGFja1RyYWNlPzogeyB1cmk/OiBVUkk7IHBvc2l0aW9uPzogeyBsaW5lTnVtYmVyOiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07IGxhYmVsOiBzdHJpbmcgfVtdIH1bXSB9W10pOiBMaXZlVGVzdFJlc3VsdCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY3JlYXRlTGl2ZVRlc3RSZXN1bHQoKTtcblx0XHRyZXN1bHQuYWRkVGFzayh7IGlkOiAndCcsIG5hbWU6ICdUZXN0IFRhc2snLCBydW5uaW5nOiB0cnVlLCBjdHJsSWQ6ICdjdHJsSWQnIH0pO1xuXG5cdFx0Zm9yIChjb25zdCB0IG9mIHRlc3RzKSB7XG5cdFx0XHRjb25zdCBjaGFpbiA9IFRlc3RJZC5zcGxpdCh0LmV4dElkKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gY2hhaW4ubWFwKChzZWdtZW50LCBpKSA9PiAoe1xuXHRcdFx0XHRleHRJZDogbmV3IFRlc3RJZChjaGFpbi5zbGljZSgwLCBpICsgMSkpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiBpID09PSBjaGFpbi5sZW5ndGggLSAxID8gdC5sYWJlbCA6IHNlZ21lbnQsXG5cdFx0XHRcdGJ1c3k6IGZhbHNlLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbnVsbCxcblx0XHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRcdHJhbmdlOiBudWxsLFxuXHRcdFx0XHRzb3J0VGV4dDogbnVsbCxcblx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdHVyaTogdW5kZWZpbmVkLFxuXHRcdFx0fSkpO1xuXHRcdFx0cmVzdWx0LmFkZFRlc3RDaGFpblRvUnVuKCdjdHJsSWQnLCBpdGVtcyk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB0IG9mIHRlc3RzKSB7XG5cdFx0XHRyZXN1bHQudXBkYXRlU3RhdGUodC5leHRJZCwgJ3QnLCB0LnN0YXRlKTtcblx0XHRcdGlmICh0Lm1lc3NhZ2VzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbXNnIG9mIHQubWVzc2FnZXMpIHtcblx0XHRcdFx0XHRyZXN1bHQuYXBwZW5kTWVzc2FnZSh0LmV4dElkLCAndCcsIHtcblx0XHRcdFx0XHRcdHR5cGU6IG1zZy50eXBlIGFzIFRlc3RNZXNzYWdlVHlwZS5FcnJvcixcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IG1zZy5tZXNzYWdlLFxuXHRcdFx0XHRcdFx0ZXhwZWN0ZWQ6IG1zZy5leHBlY3RlZCxcblx0XHRcdFx0XHRcdGFjdHVhbDogbXNnLmFjdHVhbCxcblx0XHRcdFx0XHRcdGNvbnRleHRWYWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bG9jYXRpb246IG1zZy5sb2NhdGlvbiA/IHsgdXJpOiBtc2cubG9jYXRpb24udXJpLCByYW5nZTogbXNnLmxvY2F0aW9uLnJhbmdlIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzdGFja1RyYWNlOiBtc2cuc3RhY2tUcmFjZT8ubWFwKGYgPT4gKHtcblx0XHRcdFx0XHRcdFx0dXJpOiBmLnVyaSxcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IGYucG9zaXRpb24gPyBuZXcgUG9zaXRpb24oZi5wb3NpdGlvbi5saW5lTnVtYmVyLCBmLnBvc2l0aW9uLmNvbHVtbikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBmLmxhYmVsLFxuXHRcdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUZpbGVDb3YodXJpOiBVUkksIHN0YXRlbWVudDogeyBjb3ZlcmVkOiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfSwgZGV0YWlsczogQ292ZXJhZ2VEZXRhaWxzW10sIG9wdHM/OiB7IGJyYW5jaD86IHsgY292ZXJlZDogbnVtYmVyOyB0b3RhbDogbnVtYmVyIH07IGRlY2xhcmF0aW9uPzogeyBjb3ZlcmVkOiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfSB9KTogRmlsZUNvdmVyYWdlIHtcblx0XHRjb25zdCByZXN1bHQgPSBjcmVhdGVMaXZlVGVzdFJlc3VsdCgpO1xuXHRcdGNvbnN0IGFjY2Vzc29yOiBJQ292ZXJhZ2VBY2Nlc3NvciA9IHtcblx0XHRcdGdldENvdmVyYWdlRGV0YWlsczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKGRldGFpbHMpLFxuXHRcdH07XG5cdFx0cmV0dXJuIG5ldyBGaWxlQ292ZXJhZ2UoeyBpZDogJ2ZpbGUtMScsIHVyaSwgc3RhdGVtZW50LCBicmFuY2g6IG9wdHM/LmJyYW5jaCwgZGVjbGFyYXRpb246IG9wdHM/LmRlY2xhcmF0aW9uIH0sIHJlc3VsdCwgYWNjZXNzb3IpO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc2VydENvdW50ZXIgPSAwO1xuXG5cdFx0Y29uc3QgbW9ja1Rlc3RTZXJ2aWNlID0gdXBjYXN0UGFydGlhbDxJVGVzdFNlcnZpY2U+KHtcblx0XHRcdGNvbGxlY3Rpb246IHVwY2FzdFBhcnRpYWw8SU1haW5UaHJlYWRUZXN0Q29sbGVjdGlvbj4oe1xuXHRcdFx0XHRyb290SXRlbXM6IFtdLFxuXHRcdFx0XHRyb290SWRzOiBbXSxcblx0XHRcdFx0ZXhwYW5kOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0Z2V0Tm9kZUJ5SWQ6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0Tm9kZUJ5VXJsOiAoKSA9PiBbXSxcblx0XHRcdH0pLFxuXHRcdFx0cnVuVGVzdHM6ICgpID0+IFByb21pc2UucmVzb2x2ZSh1cGNhc3RQYXJ0aWFsKHt9KSksXG5cdFx0XHRjYW5jZWxUZXN0UnVuOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBtb2NrUmVzdWx0U2VydmljZSA9IHVwY2FzdFBhcnRpYWw8SVRlc3RSZXN1bHRTZXJ2aWNlPih7XG5cdFx0XHRvblJlc3VsdHNDaGFuZ2VkOiBFdmVudC5Ob25lLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbW9ja1Byb2ZpbGVTZXJ2aWNlID0gdXBjYXN0UGFydGlhbDxJVGVzdFByb2ZpbGVTZXJ2aWNlPih7XG5cdFx0XHRjYXBhYmlsaXRpZXNGb3JUZXN0OiAoKSA9PiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4gfCBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IG1vY2tVcmlJZGVudGl0eSA9IHVwY2FzdFBhcnRpYWw8SVVyaUlkZW50aXR5U2VydmljZT4oe1xuXHRcdFx0YXNDYW5vbmljYWxVcmk6ICh1cmk6IFVSSSkgPT4gdXJpLFxuXHRcdFx0ZXh0VXJpOiB1cGNhc3RQYXJ0aWFsPElFeHRVcmk+KHsgaXNFcXVhbDogKGE6IFVSSSwgYjogVVJJKSA9PiBhLnRvU3RyaW5nKCkgPT09IGIudG9TdHJpbmcoKSB9KSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IG1vY2tXb3Jrc3BhY2VDb250ZXh0ID0gdXBjYXN0UGFydGlhbDxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KHtcblx0XHRcdGdldFdvcmtzcGFjZTogKCkgPT4gdXBjYXN0UGFydGlhbDxJV29ya3NwYWNlPih7IGlkOiAndGVzdCcsIGZvbGRlcnM6IFt1cGNhc3RQYXJ0aWFsPElXb3Jrc3BhY2VGb2xkZXI+KHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpIH0pXSB9KSxcblx0XHR9KTtcblxuXHRcdHRvb2wgPSBuZXcgUnVuVGVzdFRvb2woXG5cdFx0XHRtb2NrVGVzdFNlcnZpY2UsXG5cdFx0XHRtb2NrVXJpSWRlbnRpdHksXG5cdFx0XHRtb2NrV29ya3NwYWNlQ29udGV4dCxcblx0XHRcdG1vY2tSZXN1bHRTZXJ2aWNlLFxuXHRcdFx0bW9ja1Byb2ZpbGVTZXJ2aWNlLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpbnZva2UnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIG5vIHRlc3RzIGZvdW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdHVwY2FzdFBhcnRpYWw8SVRvb2xJbnZvY2F0aW9uPih7IHBhcmFtZXRlcnM6IHsgZmlsZXM6IFsnL25vbmV4aXN0ZW50L3Rlc3QudHMnXSB9IH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LnRvb2xSZXN1bHRFcnJvcik7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ3RleHQnICYmIHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLmluY2x1ZGVzKCdObyB0ZXN0cyBmb3VuZCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ19idWlsZFN1bW1hcnknLCAoKSA9PiB7XG5cdFx0dGVzdCgnaW5jbHVkZXMgcGFzcy9mYWlsIGNvdW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZVJlc3VsdFdpdGhUZXN0cyhbXG5cdFx0XHRcdHsgZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnYSddKS50b1N0cmluZygpLCBsYWJlbDogJ2EnLCBzdGF0ZTogVGVzdFJlc3VsdFN0YXRlLlBhc3NlZCB9LFxuXHRcdFx0XHR7IGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ2InXSkudG9TdHJpbmcoKSwgbGFiZWw6ICdiJywgc3RhdGU6IFRlc3RSZXN1bHRTdGF0ZS5GYWlsZWQsIG1lc3NhZ2VzOiBbeyB0eXBlOiBUZXN0TWVzc2FnZVR5cGUuRXJyb3IsIG1lc3NhZ2U6ICdib29tJyB9XSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRyZXN1bHQubWFya0NvbXBsZXRlKCk7XG5cblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCBidWlsZFRlc3RSdW5TdW1tYXJ5KHJlc3VsdCwgJ3J1bicsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeS5pbmNsdWRlcygnPHN1bW1hcnkgcGFzc2VkPTEgZmFpbGVkPTEgLz4nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21iaW5lcyBlcnJvcmVkIGFuZCBmYWlsZWQgaW4gZmFpbHVyZSBjb3VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZVJlc3VsdFdpdGhUZXN0cyhbXG5cdFx0XHRcdHsgZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnYSddKS50b1N0cmluZygpLCBsYWJlbDogJ2EnLCBzdGF0ZTogVGVzdFJlc3VsdFN0YXRlLkZhaWxlZCwgbWVzc2FnZXM6IFt7IHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5FcnJvciwgbWVzc2FnZTogJ2ZhaWwnIH1dIH0sXG5cdFx0XHRcdHsgZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnYiddKS50b1N0cmluZygpLCBsYWJlbDogJ2InLCBzdGF0ZTogVGVzdFJlc3VsdFN0YXRlLkVycm9yZWQsIG1lc3NhZ2VzOiBbeyB0eXBlOiBUZXN0TWVzc2FnZVR5cGUuRXJyb3IsIG1lc3NhZ2U6ICdlcnJvcicgfV0gfSxcblx0XHRcdFx0eyBleHRJZDogbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdjJ10pLnRvU3RyaW5nKCksIGxhYmVsOiAnYycsIHN0YXRlOiBUZXN0UmVzdWx0U3RhdGUuUGFzc2VkIH0sXG5cdFx0XHRdKTtcblx0XHRcdHJlc3VsdC5tYXJrQ29tcGxldGUoKTtcblxuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGF3YWl0IGJ1aWxkVGVzdFJ1blN1bW1hcnkocmVzdWx0LCAncnVuJywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5LmluY2x1ZGVzKCdmYWlsZWQ9MicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIGNvdmVyYWdlIHdoZW4gbW9kZSBpcyBjb3ZlcmFnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvdmVyYWdlRGF0YSA9IGNyZWF0ZVRlc3RDb3ZlcmFnZShbXG5cdFx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3NyYy9hLnRzJyksIHN0YXRlbWVudDogeyBjb3ZlcmVkOiA4LCB0b3RhbDogMTAgfSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjcmVhdGVSZXN1bHRXaXRoQ292ZXJhZ2UoY292ZXJhZ2VEYXRhKTtcblx0XHRcdHJlc3VsdC5tYXJrQ29tcGxldGUoKTtcblxuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGF3YWl0IGJ1aWxkVGVzdFJ1blN1bW1hcnkocmVzdWx0LCAnY292ZXJhZ2UnLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1bW1hcnkuaW5jbHVkZXMoJzxjb3ZlcmFnZVN1bW1hcnk+JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgY292ZXJhZ2Ugd2hlbiBtb2RlIGlzIHJ1bicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZUxpdmVUZXN0UmVzdWx0KCk7XG5cdFx0XHRyZXN1bHQuYWRkVGFzayh7IGlkOiAndCcsIG5hbWU6ICduJywgcnVubmluZzogdHJ1ZSwgY3RybElkOiAnY3RybCcgfSk7XG5cdFx0XHRyZXN1bHQubWFya0NvbXBsZXRlKCk7XG5cblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCBidWlsZFRlc3RSdW5TdW1tYXJ5KHJlc3VsdCwgJ3J1bicsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQub2soIXN1bW1hcnkuaW5jbHVkZXMoJzxjb3ZlcmFnZScpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldENvdmVyYWdlU3VtbWFyeScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIG92ZXJhbGwgc3VtbWFyeSB3aGVuIG5vIGNvdmVyYWdlRmlsZXMgc3BlY2lmaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZUEgPSBVUkkuZmlsZSgnL3NyYy9hLnRzJyk7XG5cdFx0XHRjb25zdCBmaWxlQiA9IFVSSS5maWxlKCcvc3JjL2IudHMnKTtcblx0XHRcdGNvbnN0IGNvdmVyYWdlRGF0YSA9IGNyZWF0ZVRlc3RDb3ZlcmFnZShbXG5cdFx0XHRcdHsgdXJpOiBmaWxlQSwgc3RhdGVtZW50OiB7IGNvdmVyZWQ6IDUsIHRvdGFsOiAxMCB9IH0sXG5cdFx0XHRcdHsgdXJpOiBmaWxlQiwgc3RhdGVtZW50OiB7IGNvdmVyZWQ6IDEwLCB0b3RhbDogMTAgfSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjcmVhdGVSZXN1bHRXaXRoQ292ZXJhZ2UoY292ZXJhZ2VEYXRhKTtcblxuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGF3YWl0IGdldENvdmVyYWdlU3VtbWFyeShyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeS5pbmNsdWRlcygnPGNvdmVyYWdlU3VtbWFyeT4nKSk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeS5pbmNsdWRlcyhmaWxlQS5mc1BhdGgpKTtcblx0XHRcdGFzc2VydC5vayghc3VtbWFyeS5pbmNsdWRlcyhmaWxlQi5mc1BhdGgpKTsgLy8gMTAwJSBjb3ZlcmVkLCBleGNsdWRlZFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBkZXRhaWxlZCBzdW1tYXJ5IGZvciBzcGVjaWZpZWQgY292ZXJhZ2VGaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVBID0gVVJJLmZpbGUoJy9zcmMvYS50cycpO1xuXHRcdFx0Y29uc3QgZGV0YWlsczogQ292ZXJhZ2VEZXRhaWxzW10gPSBbXG5cdFx0XHRcdG1ha2VEZWNsYXJhdGlvbigndW5jb3ZlcmVkRm4nLCAxMCwgMCksXG5cdFx0XHRcdG1ha2VTdGF0ZW1lbnQoMjAsIDAsIDI1KSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBjb3ZlcmFnZURhdGEgPSBjcmVhdGVUZXN0Q292ZXJhZ2UoW1xuXHRcdFx0XHR7IHVyaTogZmlsZUEsIHN0YXRlbWVudDogeyBjb3ZlcmVkOiA4LCB0b3RhbDogMTAgfSwgZGVjbGFyYXRpb246IHsgY292ZXJlZDogMCwgdG90YWw6IDEgfSwgZGV0YWlscyB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjcmVhdGVSZXN1bHRXaXRoQ292ZXJhZ2UoY292ZXJhZ2VEYXRhKTtcblxuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGF3YWl0IGdldENvdmVyYWdlU3VtbWFyeShyZXN1bHQsIFtmaWxlQS5mc1BhdGhdKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5LmluY2x1ZGVzKGA8Y292ZXJhZ2UgcGF0aD1cIiR7ZmlsZUEuZnNQYXRofVwiYCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1bW1hcnkuaW5jbHVkZXMoJ3VuY292ZXJlZCBmdW5jdGlvbnM6JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1bW1hcnkuaW5jbHVkZXMoJ3VuY292ZXJlZEZuKEwxMCknKSk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeS5pbmNsdWRlcygndW5jb3ZlcmVkIGxpbmVzOicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgc3RyaW5nIHdoZW4gbm8gY292ZXJhZ2UgZGF0YSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlQSA9IFVSSS5maWxlKCcvc3JjL2EudHMnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZUxpdmVUZXN0UmVzdWx0KCk7XG5cdFx0XHRyZXN1bHQuYWRkVGFzayh7IGlkOiAndCcsIG5hbWU6ICduJywgcnVubmluZzogdHJ1ZSwgY3RybElkOiAnY3RybCcgfSk7XG5cblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCBnZXRDb3ZlcmFnZVN1bW1hcnkocmVzdWx0LCBbZmlsZUEuZnNQYXRoXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBtdWx0aXBsZSBjb3ZlcmFnZUZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZUEgPSBVUkkuZmlsZSgnL3NyYy9hLnRzJyk7XG5cdFx0XHRjb25zdCBmaWxlQiA9IFVSSS5maWxlKCcvc3JjL2IudHMnKTtcblx0XHRcdGNvbnN0IGNvdmVyYWdlRGF0YSA9IGNyZWF0ZVRlc3RDb3ZlcmFnZShbXG5cdFx0XHRcdHsgdXJpOiBmaWxlQSwgc3RhdGVtZW50OiB7IGNvdmVyZWQ6IDgsIHRvdGFsOiAxMCB9LCBkZXRhaWxzOiBbbWFrZVN0YXRlbWVudCg1LCAwKV0gfSxcblx0XHRcdFx0eyB1cmk6IGZpbGVCLCBzdGF0ZW1lbnQ6IHsgY292ZXJlZDogMywgdG90YWw6IDEwIH0sIGRldGFpbHM6IFttYWtlRGVjbGFyYXRpb24oJ2ZuJywgMSwgMCldIH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZVJlc3VsdFdpdGhDb3ZlcmFnZShjb3ZlcmFnZURhdGEpO1xuXG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gYXdhaXQgZ2V0Q292ZXJhZ2VTdW1tYXJ5KHJlc3VsdCwgW2ZpbGVBLmZzUGF0aCwgZmlsZUIuZnNQYXRoXSk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeS5pbmNsdWRlcyhmaWxlQS5mc1BhdGgpKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5LmluY2x1ZGVzKGZpbGVCLmZzUGF0aCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgbm9uLW1hdGNoaW5nIGNvdmVyYWdlRmlsZXMgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVBID0gVVJJLmZpbGUoJy9zcmMvYS50cycpO1xuXHRcdFx0Y29uc3Qgbm9uRXhpc3RlbnQgPSBVUkkuZmlsZSgnL3NyYy9ub25leGlzdGVudC50cycpO1xuXHRcdFx0Y29uc3QgY292ZXJhZ2VEYXRhID0gY3JlYXRlVGVzdENvdmVyYWdlKFtcblx0XHRcdFx0eyB1cmk6IGZpbGVBLCBzdGF0ZW1lbnQ6IHsgY292ZXJlZDogOCwgdG90YWw6IDEwIH0gfSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY3JlYXRlUmVzdWx0V2l0aENvdmVyYWdlKGNvdmVyYWdlRGF0YSk7XG5cblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBhd2FpdCBnZXRDb3ZlcmFnZVN1bW1hcnkocmVzdWx0LCBbbm9uRXhpc3RlbnQuZnNQYXRoXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSwgJycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0T3ZlcmFsbENvdmVyYWdlU3VtbWFyeScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGFsbC1jb3ZlcmVkIG1lc3NhZ2Ugd2hlbiBldmVyeXRoaW5nIGlzIDEwMCUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb3ZlcmFnZSA9IGNyZWF0ZVRlc3RDb3ZlcmFnZShbXG5cdFx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3NyYy9hLnRzJyksIHN0YXRlbWVudDogeyBjb3ZlcmVkOiAxMCwgdG90YWw6IDEwIH0gfSxcblx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvc3JjL2IudHMnKSwgc3RhdGVtZW50OiB7IGNvdmVyZWQ6IDUsIHRvdGFsOiA1IH0gfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRPdmVyYWxsQ292ZXJhZ2VTdW1tYXJ5KGNvdmVyYWdlKSxcblx0XHRcdFx0Jzxjb3ZlcmFnZVN1bW1hcnk+QWxsIGZpbGVzIGhhdmUgMTAwJSBjb3ZlcmFnZS48L2NvdmVyYWdlU3VtbWFyeT5cXG4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NvcnRzIGZpbGVzIGJ5IGNvdmVyYWdlIGFzY2VuZGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGhpZ2ggPSBVUkkuZmlsZSgnL3NyYy9oaWdoLnRzJyk7XG5cdFx0XHRjb25zdCBsb3cgPSBVUkkuZmlsZSgnL3NyYy9sb3cudHMnKTtcblx0XHRcdGNvbnN0IG1pZCA9IFVSSS5maWxlKCcvc3JjL21pZC50cycpO1xuXHRcdFx0Y29uc3QgY292ZXJhZ2UgPSBjcmVhdGVUZXN0Q292ZXJhZ2UoW1xuXHRcdFx0XHR7IHVyaTogaGlnaCwgc3RhdGVtZW50OiB7IGNvdmVyZWQ6IDksIHRvdGFsOiAxMCB9IH0sXG5cdFx0XHRcdHsgdXJpOiBsb3csIHN0YXRlbWVudDogeyBjb3ZlcmVkOiAzLCB0b3RhbDogMTAgfSB9LFxuXHRcdFx0XHR7IHVyaTogbWlkLCBzdGF0ZW1lbnQ6IHsgY292ZXJlZDogNywgdG90YWw6IDEwIH0gfSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGdldE92ZXJhbGxDb3ZlcmFnZVN1bW1hcnkoY292ZXJhZ2UpO1xuXHRcdFx0Y29uc3QgbG93SWR4ID0gc3VtbWFyeS5pbmRleE9mKGxvdy5mc1BhdGgpO1xuXHRcdFx0Y29uc3QgbWlkSWR4ID0gc3VtbWFyeS5pbmRleE9mKG1pZC5mc1BhdGgpO1xuXHRcdFx0Y29uc3QgaGlnaElkeCA9IHN1bW1hcnkuaW5kZXhPZihoaWdoLmZzUGF0aCk7XG5cdFx0XHRhc3NlcnQub2sobG93SWR4IDwgbWlkSWR4ICYmIG1pZElkeCA8IGhpZ2hJZHgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgMTAwJSBmaWxlcyBmcm9tIGxpc3RpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0aWFsID0gVVJJLmZpbGUoJy9zcmMvcGFydGlhbC50cycpO1xuXHRcdFx0Y29uc3QgZnVsbCA9IFVSSS5maWxlKCcvc3JjL2Z1bGwudHMnKTtcblx0XHRcdGNvbnN0IGNvdmVyYWdlID0gY3JlYXRlVGVzdENvdmVyYWdlKFtcblx0XHRcdFx0eyB1cmk6IHBhcnRpYWwsIHN0YXRlbWVudDogeyBjb3ZlcmVkOiA1LCB0b3RhbDogMTAgfSB9LFxuXHRcdFx0XHR7IHVyaTogZnVsbCwgc3RhdGVtZW50OiB7IGNvdmVyZWQ6IDEwLCB0b3RhbDogMTAgfSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gZ2V0T3ZlcmFsbENvdmVyYWdlU3VtbWFyeShjb3ZlcmFnZSk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeS5pbmNsdWRlcyhwYXJ0aWFsLmZzUGF0aCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzdW1tYXJ5LmluY2x1ZGVzKGZ1bGwuZnNQYXRoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBwZXJjZW50YWdlIGluIG91dHB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvdmVyYWdlID0gY3JlYXRlVGVzdENvdmVyYWdlKFtcblx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvc3JjL2EudHMnKSwgc3RhdGVtZW50OiB7IGNvdmVyZWQ6IDcsIHRvdGFsOiAxMCB9IH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBnZXRPdmVyYWxsQ292ZXJhZ2VTdW1tYXJ5KGNvdmVyYWdlKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5LmluY2x1ZGVzKCdwZXJjZW50PTcwLjAnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRGaWxlQ292ZXJhZ2VEZXRhaWxzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3dzIGhlYWRlciB3aXRoIHN0YXRlbWVudCBjb3VudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NyYy9mb28udHMnKTtcblx0XHRcdGNvbnN0IGZpbGUgPSBjcmVhdGVGaWxlQ292KHVyaSwgeyBjb3ZlcmVkOiA4LCB0b3RhbDogMTAgfSwgW10pO1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZ2V0RmlsZUNvdmVyYWdlRGV0YWlscyhmaWxlLCB1cmkuZnNQYXRoKTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoJ3N0YXRlbWVudHM9OC8xMCcpKTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoJ3BlcmNlbnQ9ODAuMCcpKTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuc3RhcnRzV2l0aChgPGNvdmVyYWdlIHBhdGg9XCIke3VyaS5mc1BhdGh9XCJgKSk7XG5cdFx0XHRhc3NlcnQub2sob3V0cHV0LmVuZHNXaXRoKCc8L2NvdmVyYWdlPlxcbicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIGJyYW5jaCBjb3VudHMgd2hlbiBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NyYy9mb28udHMnKTtcblx0XHRcdGNvbnN0IGZpbGUgPSBjcmVhdGVGaWxlQ292KHVyaSwgeyBjb3ZlcmVkOiA4LCB0b3RhbDogMTAgfSwgW10sIHsgYnJhbmNoOiB7IGNvdmVyZWQ6IDMsIHRvdGFsOiA1IH0gfSk7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCBnZXRGaWxlQ292ZXJhZ2VEZXRhaWxzKGZpbGUsIHVyaS5mc1BhdGgpO1xuXHRcdFx0YXNzZXJ0Lm9rKG91dHB1dC5pbmNsdWRlcygnYnJhbmNoZXM9My81JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgZGVjbGFyYXRpb24gY291bnRzIHdoZW4gYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9zcmMvZm9vLnRzJyk7XG5cdFx0XHRjb25zdCBmaWxlID0gY3JlYXRlRmlsZUNvdih1cmksIHsgY292ZXJlZDogOCwgdG90YWw6IDEwIH0sIFtdLCB7IGRlY2xhcmF0aW9uOiB7IGNvdmVyZWQ6IDIsIHRvdGFsOiA0IH0gfSk7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCBnZXRGaWxlQ292ZXJhZ2VEZXRhaWxzKGZpbGUsIHVyaS5mc1BhdGgpO1xuXHRcdFx0YXNzZXJ0Lm9rKG91dHB1dC5pbmNsdWRlcygnZGVjbGFyYXRpb25zPTIvNCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIGJyYW5jaC9kZWNsYXJhdGlvbiB3aGVuIG5vdCBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NyYy9mb28udHMnKTtcblx0XHRcdGNvbnN0IGZpbGUgPSBjcmVhdGVGaWxlQ292KHVyaSwgeyBjb3ZlcmVkOiA4LCB0b3RhbDogMTAgfSwgW10pO1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZ2V0RmlsZUNvdmVyYWdlRGV0YWlscyhmaWxlLCB1cmkuZnNQYXRoKTtcblx0XHRcdGFzc2VydC5vayghb3V0cHV0LmluY2x1ZGVzKCdicmFuY2hlcz0nKSk7XG5cdFx0XHRhc3NlcnQub2soIW91dHB1dC5pbmNsdWRlcygnZGVjbGFyYXRpb25zPScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpc3RzIHVuY292ZXJlZCBkZWNsYXJhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NyYy9mb28udHMnKTtcblx0XHRcdGNvbnN0IGRldGFpbHM6IENvdmVyYWdlRGV0YWlsc1tdID0gW1xuXHRcdFx0XHRtYWtlRGVjbGFyYXRpb24oJ2hhbmRsZUVycm9yJywgODksIDApLFxuXHRcdFx0XHRtYWtlRGVjbGFyYXRpb24oJ3Byb2Nlc3NRdWV1ZScsIDEyMCwgMCksXG5cdFx0XHRcdG1ha2VEZWNsYXJhdGlvbignY292ZXJlZEZuJywgNTAsIDMpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGZpbGUgPSBjcmVhdGVGaWxlQ292KHVyaSwgeyBjb3ZlcmVkOiA4LCB0b3RhbDogMTAgfSwgZGV0YWlscywgeyBkZWNsYXJhdGlvbjogeyBjb3ZlcmVkOiAxLCB0b3RhbDogMyB9IH0pO1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZ2V0RmlsZUNvdmVyYWdlRGV0YWlscyhmaWxlLCB1cmkuZnNQYXRoKTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoJ3VuY292ZXJlZCBmdW5jdGlvbnM6IGhhbmRsZUVycm9yKEw4OSksIHByb2Nlc3NRdWV1ZShMMTIwKScpKTtcblx0XHRcdGFzc2VydC5vayghb3V0cHV0LmluY2x1ZGVzKCdjb3ZlcmVkRm4nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaXN0cyB1bmNvdmVyZWQgYnJhbmNoZXMgd2l0aCBsYWJlbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NyYy9mb28udHMnKTtcblx0XHRcdGNvbnN0IGRldGFpbHM6IENvdmVyYWdlRGV0YWlsc1tdID0gW1xuXHRcdFx0XHRtYWtlU3RhdGVtZW50KDM0LCA1LCB1bmRlZmluZWQsIFtcblx0XHRcdFx0XHRtYWtlQnJhbmNoKDM0LCA1LCAndGhlbicpLFxuXHRcdFx0XHRcdG1ha2VCcmFuY2goMzYsIDAsICdlbHNlJyksXG5cdFx0XHRcdF0pLFxuXHRcdFx0XHRtYWtlU3RhdGVtZW50KDU2LCAyLCB1bmRlZmluZWQsIFtcblx0XHRcdFx0XHRtYWtlQnJhbmNoKDU2LCAwLCAnY2FzZSBcImZvb1wiJyksXG5cdFx0XHRcdFx0bWFrZUJyYW5jaCg1OCwgMiwgJ2Nhc2UgXCJiYXJcIicpLFxuXHRcdFx0XHRdKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBmaWxlID0gY3JlYXRlRmlsZUNvdih1cmksIHsgY292ZXJlZDogOCwgdG90YWw6IDEwIH0sIGRldGFpbHMsIHsgYnJhbmNoOiB7IGNvdmVyZWQ6IDIsIHRvdGFsOiA0IH0gfSk7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCBnZXRGaWxlQ292ZXJhZ2VEZXRhaWxzKGZpbGUsIHVyaS5mc1BhdGgpO1xuXHRcdFx0YXNzZXJ0Lm9rKG91dHB1dC5pbmNsdWRlcygndW5jb3ZlcmVkIGJyYW5jaGVzOiBMMzYoZWxzZSksIEw1NihjYXNlIFwiZm9vXCIpJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGlzdHMgdW5jb3ZlcmVkIGJyYW5jaGVzIHdpdGhvdXQgbGFiZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9zcmMvZm9vLnRzJyk7XG5cdFx0XHRjb25zdCBkZXRhaWxzOiBDb3ZlcmFnZURldGFpbHNbXSA9IFtcblx0XHRcdFx0bWFrZVN0YXRlbWVudCgxMCwgMSwgdW5kZWZpbmVkLCBbbWFrZUJyYW5jaCgxMCwgMCldKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBmaWxlID0gY3JlYXRlRmlsZUNvdih1cmksIHsgY292ZXJlZDogOCwgdG90YWw6IDEwIH0sIGRldGFpbHMpO1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZ2V0RmlsZUNvdmVyYWdlRGV0YWlscyhmaWxlLCB1cmkuZnNQYXRoKTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoJ3VuY292ZXJlZCBicmFuY2hlczogTDEwXFxuJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBwYXJlbnQgc3RhdGVtZW50IGxvY2F0aW9uIHdoZW4gYnJhbmNoIGhhcyBubyBsb2NhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvc3JjL2Zvby50cycpO1xuXHRcdFx0Y29uc3QgZGV0YWlsczogQ292ZXJhZ2VEZXRhaWxzW10gPSBbXG5cdFx0XHRcdG1ha2VTdGF0ZW1lbnQoNDIsIDEsIHVuZGVmaW5lZCwgW3sgY291bnQ6IDAsIGxhYmVsOiAnZWxzZScgfV0pLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGZpbGUgPSBjcmVhdGVGaWxlQ292KHVyaSwgeyBjb3ZlcmVkOiA4LCB0b3RhbDogMTAgfSwgZGV0YWlscyk7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCBnZXRGaWxlQ292ZXJhZ2VEZXRhaWxzKGZpbGUsIHVyaS5mc1BhdGgpO1xuXHRcdFx0YXNzZXJ0Lm9rKG91dHB1dC5pbmNsdWRlcygnTDQyKGVsc2UpJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGlzdHMgbWVyZ2VkIHVuY292ZXJlZCBsaW5lIHJhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvc3JjL2Zvby50cycpO1xuXHRcdFx0Y29uc3QgZGV0YWlsczogQ292ZXJhZ2VEZXRhaWxzW10gPSBbXG5cdFx0XHRcdG1ha2VTdGF0ZW1lbnQoMjMsIDAsIDI3KSxcblx0XHRcdFx0bWFrZVN0YXRlbWVudCgyOCwgMCwgMzApLFxuXHRcdFx0XHRtYWtlU3RhdGVtZW50KDQ1LCAwKSxcblx0XHRcdFx0bWFrZVN0YXRlbWVudCg2NywgMCwgNzIpLFxuXHRcdFx0XHRtYWtlU3RhdGVtZW50KDEwMCwgMCwgMTA1KSxcblx0XHRcdFx0bWFrZVN0YXRlbWVudCg1MCwgNSksIC8vIGNvdmVyZWRcblx0XHRcdF07XG5cdFx0XHRjb25zdCBmaWxlID0gY3JlYXRlRmlsZUNvdih1cmksIHsgY292ZXJlZDogNSwgdG90YWw6IDExIH0sIGRldGFpbHMpO1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZ2V0RmlsZUNvdmVyYWdlRGV0YWlscyhmaWxlLCB1cmkuZnNQYXRoKTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoJ3VuY292ZXJlZCBsaW5lczogMjMtMzAsIDQ1LCA2Ny03MiwgMTAwLTEwNScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIHVuY292ZXJlZCBzZWN0aW9ucyB3aGVuIGFsbCBjb3ZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9zcmMvZm9vLnRzJyk7XG5cdFx0XHRjb25zdCBkZXRhaWxzOiBDb3ZlcmFnZURldGFpbHNbXSA9IFtcblx0XHRcdFx0bWFrZURlY2xhcmF0aW9uKCdmbicsIDEwLCAzKSxcblx0XHRcdFx0bWFrZVN0YXRlbWVudCgyMCwgNSksXG5cdFx0XHRcdG1ha2VTdGF0ZW1lbnQoMzAsIDEsIHVuZGVmaW5lZCwgW21ha2VCcmFuY2goMzAsIDEsICd0aGVuJyksIG1ha2VCcmFuY2goMzIsIDIsICdlbHNlJyldKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBmaWxlID0gY3JlYXRlRmlsZUNvdih1cmksIHsgY292ZXJlZDogMTAsIHRvdGFsOiAxMCB9LCBkZXRhaWxzKTtcblx0XHRcdGNvbnN0IG91dHB1dCA9IGF3YWl0IGdldEZpbGVDb3ZlcmFnZURldGFpbHMoZmlsZSwgdXJpLmZzUGF0aCk7XG5cdFx0XHRhc3NlcnQub2soIW91dHB1dC5pbmNsdWRlcygndW5jb3ZlcmVkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBkZXRhaWxzKCkgdGhyb3dpbmcgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvc3JjL2Vyci50cycpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY3JlYXRlTGl2ZVRlc3RSZXN1bHQoKTtcblx0XHRcdGNvbnN0IGFjY2Vzc29yOiBJQ292ZXJhZ2VBY2Nlc3NvciA9IHtcblx0XHRcdFx0Z2V0Q292ZXJhZ2VEZXRhaWxzOiAoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ25vdCBhdmFpbGFibGUnKSksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZmlsZSA9IG5ldyBGaWxlQ292ZXJhZ2UoeyBpZDogJ2VycicsIHVyaSwgc3RhdGVtZW50OiB7IGNvdmVyZWQ6IDUsIHRvdGFsOiAxMCB9IH0sIHJlc3VsdCwgYWNjZXNzb3IpO1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZ2V0RmlsZUNvdmVyYWdlRGV0YWlscyhmaWxlLCB1cmkuZnNQYXRoKTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoYDxjb3ZlcmFnZSBwYXRoPVwiJHt1cmkuZnNQYXRofVwiYCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKG91dHB1dC5pbmNsdWRlcygnPC9jb3ZlcmFnZT4nKSk7XG5cdFx0XHRhc3NlcnQub2soIW91dHB1dC5pbmNsdWRlcygndW5jb3ZlcmVkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnVsbCBvdXRwdXQgc25hcHNob3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NyYy9mb28udHMnKTtcblx0XHRcdGNvbnN0IGRldGFpbHM6IENvdmVyYWdlRGV0YWlsc1tdID0gW1xuXHRcdFx0XHRtYWtlRGVjbGFyYXRpb24oJ3VuY292ZXJlZEZuJywgMTAsIDApLFxuXHRcdFx0XHRtYWtlRGVjbGFyYXRpb24oJ2NvdmVyZWRGbicsIDIwLCAzKSxcblx0XHRcdFx0bWFrZVN0YXRlbWVudCgzMCwgMCwgMzIpLFxuXHRcdFx0XHRtYWtlU3RhdGVtZW50KDQwLCA1LCB1bmRlZmluZWQsIFtcblx0XHRcdFx0XHRtYWtlQnJhbmNoKDQwLCA1LCAndGhlbicpLFxuXHRcdFx0XHRcdG1ha2VCcmFuY2goNDIsIDAsICdlbHNlJyksXG5cdFx0XHRcdF0pLFxuXHRcdFx0XHRtYWtlU3RhdGVtZW50KDUwLCAzKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBmaWxlID0gY3JlYXRlRmlsZUNvdihcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHR7IGNvdmVyZWQ6IDgsIHRvdGFsOiAxMCB9LFxuXHRcdFx0XHRkZXRhaWxzLFxuXHRcdFx0XHR7IGJyYW5jaDogeyBjb3ZlcmVkOiAxLCB0b3RhbDogMiB9LCBkZWNsYXJhdGlvbjogeyBjb3ZlcmVkOiAxLCB0b3RhbDogMiB9IH0sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0YXdhaXQgZ2V0RmlsZUNvdmVyYWdlRGV0YWlscyhmaWxlLCB1cmkuZnNQYXRoKSxcblx0XHRcdFx0YDxjb3ZlcmFnZSBwYXRoPVwiJHt1cmkuZnNQYXRofVwiIHBlcmNlbnQ9NzEuNCBzdGF0ZW1lbnRzPTgvMTAgYnJhbmNoZXM9MS8yIGRlY2xhcmF0aW9ucz0xLzI+XFxuYCArXG5cdFx0XHRcdCd1bmNvdmVyZWQgZnVuY3Rpb25zOiB1bmNvdmVyZWRGbihMMTApXFxuJyArXG5cdFx0XHRcdCd1bmNvdmVyZWQgYnJhbmNoZXM6IEw0MihlbHNlKVxcbicgK1xuXHRcdFx0XHQndW5jb3ZlcmVkIGxpbmVzOiAzMC0zMlxcbicgK1xuXHRcdFx0XHQnPC9jb3ZlcmFnZT5cXG4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21lcmdlTGluZVJhbmdlcycsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGZvciBlbXB0eSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXJnZUxpbmVSYW5nZXMoW10pLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVyZ2VMaW5lUmFuZ2VzKFtbNSwgMTBdXSksICc1LTEwJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUgbGluZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXJnZUxpbmVSYW5nZXMoW1s1LCA1XV0pLCAnNScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWVyZ2VzIGNvbnRpZ3VvdXMgcmFuZ2VzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lcmdlTGluZVJhbmdlcyhbWzEsIDNdLCBbNCwgNl1dKSwgJzEtNicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgbm9uLWNvbnRpZ3VvdXMgcmFuZ2VzIHNlcGFyYXRlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lcmdlTGluZVJhbmdlcyhbWzEsIDNdLCBbMTAsIDEyXV0pLCAnMS0zLCAxMC0xMicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWVyZ2VzIG92ZXJsYXBwaW5nIHJhbmdlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXJnZUxpbmVSYW5nZXMoW1sxLCA1XSwgWzMsIDhdXSksICcxLTgnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21lcmdlcyBhZGphY2VudCBzaW5nbGUtbGluZSByYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVyZ2VMaW5lUmFuZ2VzKFtbNSwgNV0sIFs2LCA2XSwgWzEwLCAxMF1dKSwgJzUtNiwgMTAnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgdW5zb3J0ZWQgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVyZ2VMaW5lUmFuZ2VzKFtbMTAsIDEyXSwgWzEsIDNdLCBbNCwgNl1dKSwgJzEtNiwgMTAtMTInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgY29tcGxleCBtaXhlZCByYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVyZ2VMaW5lUmFuZ2VzKFtbMSwgMV0sIFszLCA1XSwgWzIsIDJdLCBbNywgOV0sIFsxMCwgMTBdXSksICcxLTUsIDctMTAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldEZhaWx1cmVEZXRhaWxzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Zvcm1hdHMgZXhwZWN0ZWQvYWN0dWFsIG91dHB1dHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjcmVhdGVSZXN1bHRXaXRoVGVzdHMoW3tcblx0XHRcdFx0ZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnc3VpdGUnLCAnbXlUZXN0J10pLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiAnbXlUZXN0Jyxcblx0XHRcdFx0c3RhdGU6IFRlc3RSZXN1bHRTdGF0ZS5GYWlsZWQsXG5cdFx0XHRcdG1lc3NhZ2VzOiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiAnQXNzZXJ0aW9uIGZhaWxlZCcsXG5cdFx0XHRcdFx0ZXhwZWN0ZWQ6ICdoZWxsbycsXG5cdFx0XHRcdFx0YWN0dWFsOiAnd29ybGQnLFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dKTtcblx0XHRcdHJlc3VsdC5tYXJrQ29tcGxldGUoKTtcblxuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZ2V0RmFpbHVyZURldGFpbHMocmVzdWx0KTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoJzxleHBlY3RlZE91dHB1dD5cXG5oZWxsb1xcbjwvZXhwZWN0ZWRPdXRwdXQ+JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG91dHB1dC5pbmNsdWRlcygnPGFjdHVhbE91dHB1dD5cXG53b3JsZFxcbjwvYWN0dWFsT3V0cHV0PicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zvcm1hdHMgcGxhaW4gbWVzc2FnZSB3aGVuIG5vIGV4cGVjdGVkL2FjdHVhbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZVJlc3VsdFdpdGhUZXN0cyhbe1xuXHRcdFx0XHRleHRJZDogbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdteVRlc3QnXSkudG9TdHJpbmcoKSxcblx0XHRcdFx0bGFiZWw6ICdteVRlc3QnLFxuXHRcdFx0XHRzdGF0ZTogVGVzdFJlc3VsdFN0YXRlLkZhaWxlZCxcblx0XHRcdFx0bWVzc2FnZXM6IFt7XG5cdFx0XHRcdFx0dHlwZTogVGVzdE1lc3NhZ2VUeXBlLkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdTb21ldGhpbmcgd2VudCB3cm9uZycsXG5cdFx0XHRcdH1dLFxuXHRcdFx0fV0pO1xuXHRcdFx0cmVzdWx0Lm1hcmtDb21wbGV0ZSgpO1xuXG5cdFx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCBnZXRGYWlsdXJlRGV0YWlscyhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKG91dHB1dC5pbmNsdWRlcygnPG1lc3NhZ2U+XFxuU29tZXRoaW5nIHdlbnQgd3JvbmdcXG48L21lc3NhZ2U+JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgdGVzdCBuYW1lIGFuZCBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY3JlYXRlUmVzdWx0V2l0aFRlc3RzKFt7XG5cdFx0XHRcdGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ3N1aXRlMScsICdzdWl0ZTInLCAnbXlUZXN0J10pLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiAnbXlUZXN0Jyxcblx0XHRcdFx0c3RhdGU6IFRlc3RSZXN1bHRTdGF0ZS5GYWlsZWQsXG5cdFx0XHRcdG1lc3NhZ2VzOiBbeyB0eXBlOiBUZXN0TWVzc2FnZVR5cGUuRXJyb3IsIG1lc3NhZ2U6ICdmYWlsJyB9XSxcblx0XHRcdH1dKTtcblx0XHRcdHJlc3VsdC5tYXJrQ29tcGxldGUoKTtcblxuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZ2V0RmFpbHVyZURldGFpbHMocmVzdWx0KTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoJ25hbWU9XCJteVRlc3RcIicpKTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoJ3BhdGg9XCJzdWl0ZTEgPiBzdWl0ZTJcIicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIHN0YWNrIHRyYWNlIGZyYW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RVcmkgPSBVUkkuZmlsZSgnL3NyYy90ZXN0LnRzJyk7XG5cdFx0XHRjb25zdCBoZWxwZXJVcmkgPSBVUkkuZmlsZSgnL3NyYy9oZWxwZXIudHMnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZVJlc3VsdFdpdGhUZXN0cyhbe1xuXHRcdFx0XHRleHRJZDogbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdteVRlc3QnXSkudG9TdHJpbmcoKSxcblx0XHRcdFx0bGFiZWw6ICdteVRlc3QnLFxuXHRcdFx0XHRzdGF0ZTogVGVzdFJlc3VsdFN0YXRlLkZhaWxlZCxcblx0XHRcdFx0bWVzc2FnZXM6IFt7XG5cdFx0XHRcdFx0dHlwZTogVGVzdE1lc3NhZ2VUeXBlLkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdmYWlsJyxcblx0XHRcdFx0XHRzdGFja1RyYWNlOiBbXG5cdFx0XHRcdFx0XHR7IHVyaTogdGVzdFVyaSwgcG9zaXRpb246IHsgbGluZU51bWJlcjogMTAsIGNvbHVtbjogNSB9LCBsYWJlbDogJ3Rlc3RGbicgfSxcblx0XHRcdFx0XHRcdHsgdXJpOiBoZWxwZXJVcmksIHBvc2l0aW9uOiB1bmRlZmluZWQsIGxhYmVsOiAnaGVscGVyRm4nIH0sXG5cdFx0XHRcdFx0XHR7IHVyaTogdW5kZWZpbmVkLCBwb3NpdGlvbjogdW5kZWZpbmVkLCBsYWJlbDogJ2Fub255bW91cycgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dKTtcblx0XHRcdHJlc3VsdC5tYXJrQ29tcGxldGUoKTtcblxuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZ2V0RmFpbHVyZURldGFpbHMocmVzdWx0KTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoYHBhdGg9XCIke3Rlc3RVcmkuZnNQYXRofVwiIGxpbmU9XCIxMFwiIGNvbD1cIjVcImApKTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoYHBhdGg9XCIke2hlbHBlclVyaS5mc1BhdGh9XCI+aGVscGVyRm48L3N0YWNrRnJhbWU+YCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKG91dHB1dC5pbmNsdWRlcygnPmFub255bW91czwvc3RhY2tGcmFtZT4nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBsb2NhdGlvbiBpbmZvcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RVcmkgPSBVUkkuZmlsZSgnL3NyYy90ZXN0LnRzJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjcmVhdGVSZXN1bHRXaXRoVGVzdHMoW3tcblx0XHRcdFx0ZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnbXlUZXN0J10pLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiAnbXlUZXN0Jyxcblx0XHRcdFx0c3RhdGU6IFRlc3RSZXN1bHRTdGF0ZS5GYWlsZWQsXG5cdFx0XHRcdG1lc3NhZ2VzOiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiAnZmFpbCcsXG5cdFx0XHRcdFx0bG9jYXRpb246IHsgdXJpOiB0ZXN0VXJpLCByYW5nZTogbmV3IFJhbmdlKDQyLCA4LCA0MiwgMjApIH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fV0pO1xuXHRcdFx0cmVzdWx0Lm1hcmtDb21wbGV0ZSgpO1xuXG5cdFx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCBnZXRGYWlsdXJlRGV0YWlscyhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKG91dHB1dC5pbmNsdWRlcyhgcGF0aD1cIiR7dGVzdFVyaS5mc1BhdGh9XCIgbGluZT1cIjQyXCIgY29sPVwiOFwiYCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgcGFzc2luZyB0ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNyZWF0ZVJlc3VsdFdpdGhUZXN0cyhbXG5cdFx0XHRcdHsgZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAncGFzcyddKS50b1N0cmluZygpLCBsYWJlbDogJ3Bhc3MnLCBzdGF0ZTogVGVzdFJlc3VsdFN0YXRlLlBhc3NlZCB9LFxuXHRcdFx0XHR7IGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ2ZhaWwnXSkudG9TdHJpbmcoKSwgbGFiZWw6ICdmYWlsJywgc3RhdGU6IFRlc3RSZXN1bHRTdGF0ZS5GYWlsZWQsIG1lc3NhZ2VzOiBbeyB0eXBlOiBUZXN0TWVzc2FnZVR5cGUuRXJyb3IsIG1lc3NhZ2U6ICdib29tJyB9XSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRyZXN1bHQubWFya0NvbXBsZXRlKCk7XG5cblx0XHRcdGNvbnN0IG91dHB1dCA9IGF3YWl0IGdldEZhaWx1cmVEZXRhaWxzKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQub2soIW91dHB1dC5pbmNsdWRlcygnbmFtZT1cInBhc3NcIicpKTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoJ25hbWU9XCJmYWlsXCInKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyB0YXNrIG91dHB1dCB3aGVuIG5vIHBlci10ZXN0IG1lc3NhZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY3JlYXRlUmVzdWx0V2l0aFRlc3RzKFt7XG5cdFx0XHRcdGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ215VGVzdCddKS50b1N0cmluZygpLFxuXHRcdFx0XHRsYWJlbDogJ215VGVzdCcsXG5cdFx0XHRcdHN0YXRlOiBUZXN0UmVzdWx0U3RhdGUuRmFpbGVkLFxuXHRcdFx0fV0pO1xuXHRcdFx0cmVzdWx0LmFwcGVuZE91dHB1dChWU0J1ZmZlci5mcm9tU3RyaW5nKCdyYXcgdGVzdCBvdXRwdXQnKSwgJ3QnKTtcblx0XHRcdHJlc3VsdC5tYXJrQ29tcGxldGUoKTtcblxuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZ2V0RmFpbHVyZURldGFpbHMocmVzdWx0KTtcblx0XHRcdGFzc2VydC5vayhvdXRwdXQuaW5jbHVkZXMoJzxvdXRwdXQ+XFxucmF3IHRlc3Qgb3V0cHV0XFxuPC9vdXRwdXQ+JykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncHJlcGFyZVRvb2xJbnZvY2F0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3dzIGZpbGUgbmFtZXMgaW4gY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdFx0dXBjYXN0UGFydGlhbDxJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQ+KHsgcGFyYW1ldGVyczogeyBmaWxlczogWycvcGF0aC90by90ZXN0MS50cycsICcvcGF0aC90by90ZXN0Mi50cyddIH0sIHRvb2xDYWxsSWQ6ICdjYWxsLTEnLCBjaGF0U2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQgfSksXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByZXBhcmVkKTtcblx0XHRcdGNvbnN0IG1zZyA9IHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5tZXNzYWdlO1xuXHRcdFx0YXNzZXJ0Lm9rKG1zZyk7XG5cdFx0XHRjb25zdCBtc2dTdHIgPSB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZy52YWx1ZTtcblx0XHRcdGFzc2VydC5vayhtc2dTdHIuaW5jbHVkZXMoJ3Rlc3QxLnRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1zZ1N0ci5pbmNsdWRlcygndGVzdDIudHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBhbGwtdGVzdHMgbWVzc2FnZSB3aGVuIG5vIGZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdFx0dXBjYXN0UGFydGlhbDxJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQ+KHsgcGFyYW1ldGVyczoge30sIHRvb2xDYWxsSWQ6ICdjYWxsLTInLCBjaGF0U2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQgfSksXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByZXBhcmVkKTtcblx0XHRcdGNvbnN0IG1zZyA9IHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5tZXNzYWdlO1xuXHRcdFx0YXNzZXJ0Lm9rKG1zZyk7XG5cdFx0XHRjb25zdCBtc2dTdHIgPSB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZy52YWx1ZTtcblx0XHRcdGFzc2VydC5vayhtc2dTdHIudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnYWxsIHRlc3RzJykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBS3JDLFNBQVMsY0FBaUMsb0JBQW9CO0FBQzlELFNBQVMsc0JBQXNCO0FBRy9CLFNBQTBCLFlBQThHLGlCQUFpQixpQkFBaUIsNEJBQTRCO0FBR3RNLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWEscUJBQXFCLG9CQUFvQiwyQkFBMkIsd0JBQXdCLGlCQUFpQix5QkFBeUI7QUFFNUosTUFBTSwyQkFBMkIsTUFBTTtBQUN0QyxRQUFNLEtBQUssd0NBQXdDO0FBRW5ELE1BQUksZ0JBQWdCO0FBQ3BCLE1BQUk7QUFFSixRQUFNLGVBQWU7QUFBQSxJQUNwQixRQUFRLENBQUMsWUFBK0I7QUFBQSxJQUFFO0FBQUEsRUFDM0M7QUFDQSxRQUFNLGtCQUFrQixNQUFNLFFBQVEsUUFBUSxDQUFDO0FBRS9DLFdBQVMscUJBQXFCLFNBQWtEO0FBQy9FLFVBQU0sTUFBTSxXQUFXO0FBQUEsTUFDdEIsT0FBTyxxQkFBcUI7QUFBQSxNQUM1QixTQUFTLENBQUMsRUFBRSxXQUFXLEdBQUcsY0FBYyxVQUFVLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUFBLElBQ3RFO0FB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
