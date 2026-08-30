import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../../../platform/log/common/log.js";
import { NullTelemetryService } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { AskQuestionsTool } from "../../../../common/tools/builtinTools/askQuestionsTool.js";
class TestableAskQuestionsTool extends AskQuestionsTool {
  testConvertCarouselAnswers(questions, carouselAnswers) {
    const idToHeaderMap = /* @__PURE__ */ new Map();
    for (const q of questions) {
      idToHeaderMap.set(q.header, q.header);
    }
    return this.convertCarouselAnswers(questions, carouselAnswers, idToHeaderMap);
  }
}
suite("AskQuestionsTool - convertCarouselAnswers", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let tool;
  setup(() => {
    tool = store.add(new TestableAskQuestionsTool(
      null,
      NullTelemetryService,
      new NullLogService(),
      new TestConfigurationService()
    ));
  });
  teardown(() => {
    tool?.dispose();
  });
  test("marks all questions as skipped when answers are undefined", () => {
    const questions = [
      { header: "Q1", question: "First question?" },
      { header: "Q2", question: "Second question?" }
    ];
    const result = tool.testConvertCarouselAnswers(questions, void 0);
    const expected = {
      Q1: { selected: [], freeText: null, skipped: true },
      Q2: { selected: [], freeText: null, skipped: true }
    };
    assert.deepStrictEqual(result.answers, expected);
  });
  test("handles string answers as option selection or free text", () => {
    const questions = [
      { header: "Color", question: "Pick a color", options: [{ label: "Red" }, { label: "Blue" }] },
      { header: "Comment", question: "Any comment?" }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Color: "Blue", Comment: "Nice" });
    assert.deepStrictEqual(result.answers["Color"], { selected: ["Blue"], freeText: null, skipped: false });
    assert.deepStrictEqual(result.answers["Comment"], { selected: [], freeText: "Nice", skipped: false });
  });
  test("handles array answers for multi-select", () => {
    const questions = [
      { header: "Features", question: "Pick features", multiSelect: true, options: [{ label: "A" }, { label: "B" }] }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Features: { selectedValues: ["A", "B"] } });
    assert.deepStrictEqual(result.answers["Features"], { selected: ["A", "B"], freeText: null, skipped: false });
  });
  test("handles selectedValue object answers", () => {
    const questions = [
      { header: "Range", question: "Use range?", options: [{ label: "Yes" }, { label: "No" }] },
      { header: "Feedback", question: "Feedback?" }
    ];
    const result = tool.testConvertCarouselAnswers(questions, {
      Range: { selectedValue: "Yes" },
      Feedback: { selectedValue: "Great!" }
    });
    assert.deepStrictEqual(result.answers["Range"], { selected: ["Yes"], freeText: null, skipped: false });
    assert.deepStrictEqual(result.answers["Feedback"], { selected: [], freeText: "Great!", skipped: false });
  });
  test("handles selectedValues object answers", () => {
    const questions = [
      { header: "Options", question: "Pick options", multiSelect: true, options: [{ label: "X" }, { label: "Y" }] }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Options: { selectedValues: ["X"] } });
    assert.deepStrictEqual(result.answers["Options"], { selected: ["X"], freeText: null, skipped: false });
  });
  test("handles freeformValue with no selection", () => {
    const questions = [
      { header: "Choice", question: "Pick or write", options: [{ label: "A" }, { label: "B" }], allowFreeformInput: true }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Choice: { freeformValue: "Custom" } });
    assert.deepStrictEqual(result.answers["Choice"], { selected: [], freeText: "Custom", skipped: false });
  });
  test("marks unknown formats as skipped", () => {
    const questions = [
      { header: "Odd", question: "Unknown" }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Odd: 42 });
    assert.deepStrictEqual(result.answers["Odd"], { selected: [], freeText: null, skipped: true });
  });
  test("handles mixed answers and missing keys", () => {
    const questions = [
      { header: "Q1", question: "String answer" },
      { header: "Q2", question: "Object answer", options: [{ label: "A" }] },
      { header: "Q3", question: "Array answer", multiSelect: true },
      { header: "Q4", question: "Missing answer" }
    ];
    const result = tool.testConvertCarouselAnswers(questions, {
      Q1: "text",
      Q2: { selectedValue: "A" },
      Q3: { selectedValues: ["x", "y"] }
    });
    assert.strictEqual(result.answers["Q1"].freeText, "text");
    assert.deepStrictEqual(result.answers["Q2"].selected, ["A"]);
    assert.deepStrictEqual(result.answers["Q3"].selected, ["x", "y"]);
    assert.strictEqual(result.answers["Q4"].skipped, true);
  });
  test("is case-sensitive when matching options", () => {
    const questions = [
      { header: "Case", question: "Pick", options: [{ label: "Yes" }, { label: "No" }] }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Case: "yes" });
    assert.deepStrictEqual(result.answers["Case"], { selected: [], freeText: "yes", skipped: false });
  });
});
suite("AskQuestionsTool - invoke", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("marks the carousel used when invocation is cancelled after it is shown", async () => {
    let appendedCarousel;
    const request = {
      id: "request-1",
      message: { text: "" },
      modeInfo: void 0,
      response: void 0,
      terminalExecutionId: void 0
    };
    const chatService = {
      getSession: () => ({
        getRequests: () => [request]
      }),
      appendProgress: (_request, progress) => {
        appendedCarousel = progress;
      },
      onDidReceiveQuestionCarouselAnswer: Event.None
    };
    const tool = store.add(new AskQuestionsTool(
      chatService,
      NullTelemetryService,
      new NullLogService(),
      new TestConfigurationService()
    ));
    const tokenSource = new CancellationTokenSource();
    const invokePromise = tool.invoke({
      parameters: {
        questions: [{ header: "Theme", question: "What is your favorite theme in VS Code?" }]
      },
      context: { sessionResource: URI.parse("test://session") },
      chatRequestId: "request-1"
    }, void 0, { report: () => {
    } }, tokenSource.token);
    assert.ok(appendedCarousel, "expected question carousel to be appended before cancellation");
    tokenSource.cancel();
    await assert.rejects(invokePromise, (error) => error instanceof CancellationError);
    assert.ok(appendedCarousel, "expected appended carousel to remain available after cancellation");
    assert.strictEqual(appendedCarousel.isUsed, true);
    assert.deepStrictEqual(appendedCarousel.data, {});
    assert.strictEqual(appendedCarousel.completion.isResolved, true);
    assert.deepStrictEqual(appendedCarousel.completion.value, { answers: void 0 });
    assert.strictEqual(appendedCarousel.draftAnswers, void 0);
    assert.strictEqual(appendedCarousel.draftCurrentIndex, void 0);
    assert.strictEqual(appendedCarousel.draftCollapsed, void 0);
  });
  test("uses externally notified answers instead of showing skipped", async () => {
    let appendedCarousel;
    const onDidReceiveQuestionCarouselAnswer = new Emitter();
    const request = {
      id: "request-1",
      message: { text: "" },
      modeInfo: void 0,
      response: void 0,
      terminalExecutionId: void 0
    };
    const chatService = {
      getSession: () => ({
        getRequests: () => [request]
      }),
      appendProgress: (_request, progress) => {
        appendedCarousel = progress;
      },
      onDidReceiveQuestionCarouselAnswer: onDidReceiveQuestionCarouselAnswer.event
    };
    const tool = store.add(new AskQuestionsTool(
      chatService,
      NullTelemetryService,
      new NullLogService(),
      new TestConfigurationService()
    ));
    const invokePromise = tool.invoke({
      callId: "tool-call",
      chatStreamToolCallId: "remote-tool-call",
      parameters: {
        questions: [{ header: "Color", question: "What is your favorite color?", options: [{ label: "Blue" }, { label: "Red" }] }]
      },
      context: { sessionResource: URI.parse("test://session") },
      chatRequestId: "request-1",
      toolId: "vscode_askQuestions"
    }, void 0, { report: () => {
    } }, CancellationToken.None);
    assert.ok(appendedCarousel, "expected question carousel to be appended before external answer");
    onDidReceiveQuestionCarouselAnswer.fire({
      requestId: "ignored",
      resolveId: "remote-tool-call",
      answers: {
        "remote-tool-call:0": { selectedValue: "Blue" }
      }
    });
    const result = await invokePromise;
    assert.deepStrictEqual(JSON.parse(String(result.content[0].value)), {
      answers: {
        Color: { selected: ["Blue"], freeText: null, skipped: false }
      }
    });
    assert.strictEqual(appendedCarousel.isUsed, true);
    assert.deepStrictEqual(appendedCarousel.data, {
      "remote-tool-call:0": { selectedValue: "Blue" }
    });
  });
});
suite("AskQuestionsTool - prepareToolInvocation validation", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let tool;
  setup(() => {
    tool = store.add(new AskQuestionsTool(
      null,
      NullTelemetryService,
      new NullLogService(),
      new TestConfigurationService()
    ));
  });
  function makeContext(questions) {
    return {
      parameters: { questions },
      toolCallId: "test-call",
      chatRequestId: "request-1",
      chatSessionResource: URI.parse("test://session")
    };
  }
  test("rejects single option without freeform input", async () => {
    await assert.rejects(
      tool.prepareToolInvocation(makeContext([
        { header: "Q1", question: "Pick one", options: [{ label: "Only option" }] }
      ]), CancellationToken.None),
      /must have at least two options/
    );
  });
  test("allows single option with freeform input", async () => {
    const result = await tool.prepareToolInvocation(makeContext([
      { header: "Q1", question: "Pick one", options: [{ label: "Only option" }], allowFreeformInput: true }
    ]), CancellationToken.None);
    assert.ok(result);
  });
  test("allows two or more options without freeform input", async () => {
    const result = await tool.prepareToolInvocation(makeContext([
      { header: "Q1", question: "Pick one", options: [{ label: "A" }, { label: "B" }] }
    ]), CancellationToken.None);
    assert.ok(result);
  });
  test("allows no options (free text)", async () => {
    const result = await tool.prepareToolInvocation(makeContext([
      { header: "Q1", question: "Type something" }
    ]), CancellationToken.None);
    assert.ok(result);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xcYXNrUXVlc3Rpb25zVG9vbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRRdWVzdGlvbkFuc3dlcnMsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBc2tRdWVzdGlvbnNUb29sLCBJQW5zd2VyUmVzdWx0LCBJUXVlc3Rpb24sIElRdWVzdGlvbkFuc3dlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvYXNrUXVlc3Rpb25zVG9vbC5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLmpzJztcblxuY2xhc3MgVGVzdGFibGVBc2tRdWVzdGlvbnNUb29sIGV4dGVuZHMgQXNrUXVlc3Rpb25zVG9vbCB7XG5cdHB1YmxpYyB0ZXN0Q29udmVydENhcm91c2VsQW5zd2VycyhxdWVzdGlvbnM6IElRdWVzdGlvbltdLCBjYXJvdXNlbEFuc3dlcnM6IElDaGF0UXVlc3Rpb25BbnN3ZXJzIHwgdW5kZWZpbmVkKTogSUFuc3dlclJlc3VsdCB7XG5cdFx0Ly8gQ3JlYXRlIGFuIGlkZW50aXR5IG1hcCB3aGVyZSBlYWNoIGhlYWRlciBpcyBhbHNvIHRoZSBpbnRlcm5hbCBJRFxuXHRcdC8vIFRoaXMgc2ltdWxhdGVzIHRoZSBzaW1wbGUgY2FzZSBmb3IgdGVzdGluZyB0aGUgYW5zd2VyIGNvbnZlcnNpb24gbG9naWNcblx0XHRjb25zdCBpZFRvSGVhZGVyTWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHEgb2YgcXVlc3Rpb25zKSB7XG5cdFx0XHRpZFRvSGVhZGVyTWFwLnNldChxLmhlYWRlciwgcS5oZWFkZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9ucywgY2Fyb3VzZWxBbnN3ZXJzLCBpZFRvSGVhZGVyTWFwKTtcblx0fVxufVxuXG5zdWl0ZSgnQXNrUXVlc3Rpb25zVG9vbCAtIGNvbnZlcnRDYXJvdXNlbEFuc3dlcnMnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCB0b29sOiBUZXN0YWJsZUFza1F1ZXN0aW9uc1Rvb2w7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHRvb2wgPSBzdG9yZS5hZGQobmV3IFRlc3RhYmxlQXNrUXVlc3Rpb25zVG9vbChcblx0XHRcdG51bGwhIGFzIElDaGF0U2VydmljZSxcblx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKClcblx0XHQpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHRvb2w/LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbWFya3MgYWxsIHF1ZXN0aW9ucyBhcyBza2lwcGVkIHdoZW4gYW5zd2VycyBhcmUgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHF1ZXN0aW9uczogSVF1ZXN0aW9uW10gPSBbXG5cdFx0XHR7IGhlYWRlcjogJ1ExJywgcXVlc3Rpb246ICdGaXJzdCBxdWVzdGlvbj8nIH0sXG5cdFx0XHR7IGhlYWRlcjogJ1EyJywgcXVlc3Rpb246ICdTZWNvbmQgcXVlc3Rpb24/JyB9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRvb2wudGVzdENvbnZlcnRDYXJvdXNlbEFuc3dlcnMocXVlc3Rpb25zLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IFJlY29yZDxzdHJpbmcsIElRdWVzdGlvbkFuc3dlcj4gPSB7XG5cdFx0XHRRMTogeyBzZWxlY3RlZDogW10sIGZyZWVUZXh0OiBudWxsLCBza2lwcGVkOiB0cnVlIH0sXG5cdFx0XHRRMjogeyBzZWxlY3RlZDogW10sIGZyZWVUZXh0OiBudWxsLCBza2lwcGVkOiB0cnVlIH1cblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnMsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBzdHJpbmcgYW5zd2VycyBhcyBvcHRpb24gc2VsZWN0aW9uIG9yIGZyZWUgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCBxdWVzdGlvbnM6IElRdWVzdGlvbltdID0gW1xuXHRcdFx0eyBoZWFkZXI6ICdDb2xvcicsIHF1ZXN0aW9uOiAnUGljayBhIGNvbG9yJywgb3B0aW9uczogW3sgbGFiZWw6ICdSZWQnIH0sIHsgbGFiZWw6ICdCbHVlJyB9XSB9LFxuXHRcdFx0eyBoZWFkZXI6ICdDb21tZW50JywgcXVlc3Rpb246ICdBbnkgY29tbWVudD8nIH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdG9vbC50ZXN0Q29udmVydENhcm91c2VsQW5zd2VycyhxdWVzdGlvbnMsIHsgQ29sb3I6ICdCbHVlJywgQ29tbWVudDogJ05pY2UnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuYW5zd2Vyc1snQ29sb3InXSwgeyBzZWxlY3RlZDogWydCbHVlJ10sIGZyZWVUZXh0OiBudWxsLCBza2lwcGVkOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5hbnN3ZXJzWydDb21tZW50J10sIHsgc2VsZWN0ZWQ6IFtdLCBmcmVlVGV4dDogJ05pY2UnLCBza2lwcGVkOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBhcnJheSBhbnN3ZXJzIGZvciBtdWx0aS1zZWxlY3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcXVlc3Rpb25zOiBJUXVlc3Rpb25bXSA9IFtcblx0XHRcdHsgaGVhZGVyOiAnRmVhdHVyZXMnLCBxdWVzdGlvbjogJ1BpY2sgZmVhdHVyZXMnLCBtdWx0aVNlbGVjdDogdHJ1ZSwgb3B0aW9uczogW3sgbGFiZWw6ICdBJyB9LCB7IGxhYmVsOiAnQicgfV0gfVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSB0b29sLnRlc3RDb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9ucywgeyBGZWF0dXJlczogeyBzZWxlY3RlZFZhbHVlczogWydBJywgJ0InXSB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuYW5zd2Vyc1snRmVhdHVyZXMnXSwgeyBzZWxlY3RlZDogWydBJywgJ0InXSwgZnJlZVRleHQ6IG51bGwsIHNraXBwZWQ6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIHNlbGVjdGVkVmFsdWUgb2JqZWN0IGFuc3dlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcXVlc3Rpb25zOiBJUXVlc3Rpb25bXSA9IFtcblx0XHRcdHsgaGVhZGVyOiAnUmFuZ2UnLCBxdWVzdGlvbjogJ1VzZSByYW5nZT8nLCBvcHRpb25zOiBbeyBsYWJlbDogJ1llcycgfSwgeyBsYWJlbDogJ05vJyB9XSB9LFxuXHRcdFx0eyBoZWFkZXI6ICdGZWVkYmFjaycsIHF1ZXN0aW9uOiAnRmVlZGJhY2s/JyB9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRvb2wudGVzdENvbnZlcnRDYXJvdXNlbEFuc3dlcnMocXVlc3Rpb25zLCB7XG5cdFx0XHRSYW5nZTogeyBzZWxlY3RlZFZhbHVlOiAnWWVzJyB9LFxuXHRcdFx0RmVlZGJhY2s6IHsgc2VsZWN0ZWRWYWx1ZTogJ0dyZWF0IScgfVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuYW5zd2Vyc1snUmFuZ2UnXSwgeyBzZWxlY3RlZDogWydZZXMnXSwgZnJlZVRleHQ6IG51bGwsIHNraXBwZWQ6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnNbJ0ZlZWRiYWNrJ10sIHsgc2VsZWN0ZWQ6IFtdLCBmcmVlVGV4dDogJ0dyZWF0IScsIHNraXBwZWQ6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIHNlbGVjdGVkVmFsdWVzIG9iamVjdCBhbnN3ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHF1ZXN0aW9uczogSVF1ZXN0aW9uW10gPSBbXG5cdFx0XHR7IGhlYWRlcjogJ09wdGlvbnMnLCBxdWVzdGlvbjogJ1BpY2sgb3B0aW9ucycsIG11bHRpU2VsZWN0OiB0cnVlLCBvcHRpb25zOiBbeyBsYWJlbDogJ1gnIH0sIHsgbGFiZWw6ICdZJyB9XSB9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRvb2wudGVzdENvbnZlcnRDYXJvdXNlbEFuc3dlcnMocXVlc3Rpb25zLCB7IE9wdGlvbnM6IHsgc2VsZWN0ZWRWYWx1ZXM6IFsnWCddIH0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5hbnN3ZXJzWydPcHRpb25zJ10sIHsgc2VsZWN0ZWQ6IFsnWCddLCBmcmVlVGV4dDogbnVsbCwgc2tpcHBlZDogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgZnJlZWZvcm1WYWx1ZSB3aXRoIG5vIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBxdWVzdGlvbnM6IElRdWVzdGlvbltdID0gW1xuXHRcdFx0eyBoZWFkZXI6ICdDaG9pY2UnLCBxdWVzdGlvbjogJ1BpY2sgb3Igd3JpdGUnLCBvcHRpb25zOiBbeyBsYWJlbDogJ0EnIH0sIHsgbGFiZWw6ICdCJyB9XSwgYWxsb3dGcmVlZm9ybUlucHV0OiB0cnVlIH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdG9vbC50ZXN0Q29udmVydENhcm91c2VsQW5zd2VycyhxdWVzdGlvbnMsIHsgQ2hvaWNlOiB7IGZyZWVmb3JtVmFsdWU6ICdDdXN0b20nIH0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5hbnN3ZXJzWydDaG9pY2UnXSwgeyBzZWxlY3RlZDogW10sIGZyZWVUZXh0OiAnQ3VzdG9tJywgc2tpcHBlZDogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtzIHVua25vd24gZm9ybWF0cyBhcyBza2lwcGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHF1ZXN0aW9uczogSVF1ZXN0aW9uW10gPSBbXG5cdFx0XHR7IGhlYWRlcjogJ09kZCcsIHF1ZXN0aW9uOiAnVW5rbm93bicgfVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSB0b29sLnRlc3RDb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9ucywgeyBPZGQ6IDQyIGFzIHVua25vd24gYXMgb2JqZWN0IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuYW5zd2Vyc1snT2RkJ10sIHsgc2VsZWN0ZWQ6IFtdLCBmcmVlVGV4dDogbnVsbCwgc2tpcHBlZDogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBtaXhlZCBhbnN3ZXJzIGFuZCBtaXNzaW5nIGtleXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcXVlc3Rpb25zOiBJUXVlc3Rpb25bXSA9IFtcblx0XHRcdHsgaGVhZGVyOiAnUTEnLCBxdWVzdGlvbjogJ1N0cmluZyBhbnN3ZXInIH0sXG5cdFx0XHR7IGhlYWRlcjogJ1EyJywgcXVlc3Rpb246ICdPYmplY3QgYW5zd2VyJywgb3B0aW9uczogW3sgbGFiZWw6ICdBJyB9XSB9LFxuXHRcdFx0eyBoZWFkZXI6ICdRMycsIHF1ZXN0aW9uOiAnQXJyYXkgYW5zd2VyJywgbXVsdGlTZWxlY3Q6IHRydWUgfSxcblx0XHRcdHsgaGVhZGVyOiAnUTQnLCBxdWVzdGlvbjogJ01pc3NpbmcgYW5zd2VyJyB9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRvb2wudGVzdENvbnZlcnRDYXJvdXNlbEFuc3dlcnMocXVlc3Rpb25zLCB7XG5cdFx0XHRRMTogJ3RleHQnLFxuXHRcdFx0UTI6IHsgc2VsZWN0ZWRWYWx1ZTogJ0EnIH0sXG5cdFx0XHRRMzogeyBzZWxlY3RlZFZhbHVlczogWyd4JywgJ3knXSB9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnNbJ1ExJ10uZnJlZVRleHQsICd0ZXh0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuYW5zd2Vyc1snUTInXS5zZWxlY3RlZCwgWydBJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnNbJ1EzJ10uc2VsZWN0ZWQsIFsneCcsICd5J10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYW5zd2Vyc1snUTQnXS5za2lwcGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXMgY2FzZS1zZW5zaXRpdmUgd2hlbiBtYXRjaGluZyBvcHRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHF1ZXN0aW9uczogSVF1ZXN0aW9uW10gPSBbXG5cdFx0XHR7IGhlYWRlcjogJ0Nhc2UnLCBxdWVzdGlvbjogJ1BpY2snLCBvcHRpb25zOiBbeyBsYWJlbDogJ1llcycgfSwgeyBsYWJlbDogJ05vJyB9XSB9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRvb2wudGVzdENvbnZlcnRDYXJvdXNlbEFuc3dlcnMocXVlc3Rpb25zLCB7IENhc2U6ICd5ZXMnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuYW5zd2Vyc1snQ2FzZSddLCB7IHNlbGVjdGVkOiBbXSwgZnJlZVRleHQ6ICd5ZXMnLCBza2lwcGVkOiBmYWxzZSB9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0Fza1F1ZXN0aW9uc1Rvb2wgLSBpbnZva2UnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWFya3MgdGhlIGNhcm91c2VsIHVzZWQgd2hlbiBpbnZvY2F0aW9uIGlzIGNhbmNlbGxlZCBhZnRlciBpdCBpcyBzaG93bicsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgYXBwZW5kZWRDYXJvdXNlbDogQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB7XG5cdFx0XHRpZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICcnIH0sXG5cdFx0XHRtb2RlSW5mbzogdW5kZWZpbmVkLFxuXHRcdFx0cmVzcG9uc2U6IHVuZGVmaW5lZCxcblx0XHRcdHRlcm1pbmFsRXhlY3V0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0ge1xuXHRcdFx0Z2V0U2Vzc2lvbjogKCkgPT4gKHtcblx0XHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFtyZXF1ZXN0XSxcblx0XHRcdH0pLFxuXHRcdFx0YXBwZW5kUHJvZ3Jlc3M6IChfcmVxdWVzdDogdW5rbm93biwgcHJvZ3Jlc3M6IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSkgPT4ge1xuXHRcdFx0XHRhcHBlbmRlZENhcm91c2VsID0gcHJvZ3Jlc3M7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZWNlaXZlUXVlc3Rpb25DYXJvdXNlbEFuc3dlcjogRXZlbnQuTm9uZSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRTZXJ2aWNlO1xuXHRcdGNvbnN0IHRvb2wgPSBzdG9yZS5hZGQobmV3IEFza1F1ZXN0aW9uc1Rvb2woXG5cdFx0XHRjaGF0U2VydmljZSxcblx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKClcblx0XHQpKTtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgaW52b2tlUHJvbWlzZSA9IHRvb2wuaW52b2tlKHtcblx0XHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdFx0cXVlc3Rpb25zOiBbeyBoZWFkZXI6ICdUaGVtZScsIHF1ZXN0aW9uOiAnV2hhdCBpcyB5b3VyIGZhdm9yaXRlIHRoZW1lIGluIFZTIENvZGU/JyB9XSxcblx0XHRcdH0sXG5cdFx0XHRjb250ZXh0OiB7IHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpIH0sXG5cdFx0XHRjaGF0UmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHR9IGFzIG5ldmVyLCB1bmRlZmluZWQgYXMgbmV2ZXIsIHsgcmVwb3J0OiAoKSA9PiB7IH0gfSwgdG9rZW5Tb3VyY2UudG9rZW4pO1xuXG5cdFx0YXNzZXJ0Lm9rKGFwcGVuZGVkQ2Fyb3VzZWwsICdleHBlY3RlZCBxdWVzdGlvbiBjYXJvdXNlbCB0byBiZSBhcHBlbmRlZCBiZWZvcmUgY2FuY2VsbGF0aW9uJyk7XG5cdFx0dG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhpbnZva2VQcm9taXNlLCBlcnJvciA9PiBlcnJvciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKTtcblx0XHRhc3NlcnQub2soYXBwZW5kZWRDYXJvdXNlbCwgJ2V4cGVjdGVkIGFwcGVuZGVkIGNhcm91c2VsIHRvIHJlbWFpbiBhdmFpbGFibGUgYWZ0ZXIgY2FuY2VsbGF0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZGVkQ2Fyb3VzZWwuaXNVc2VkLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGVuZGVkQ2Fyb3VzZWwuZGF0YSwge30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRlZENhcm91c2VsLmNvbXBsZXRpb24uaXNSZXNvbHZlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBlbmRlZENhcm91c2VsLmNvbXBsZXRpb24udmFsdWUsIHsgYW5zd2VyczogdW5kZWZpbmVkIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRlZENhcm91c2VsLmRyYWZ0QW5zd2VycywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kZWRDYXJvdXNlbC5kcmFmdEN1cnJlbnRJbmRleCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kZWRDYXJvdXNlbC5kcmFmdENvbGxhcHNlZCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBleHRlcm5hbGx5IG5vdGlmaWVkIGFuc3dlcnMgaW5zdGVhZCBvZiBzaG93aW5nIHNraXBwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGFwcGVuZGVkQ2Fyb3VzZWw6IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvbkRpZFJlY2VpdmVRdWVzdGlvbkNhcm91c2VsQW5zd2VyID0gbmV3IEVtaXR0ZXI8eyByZXF1ZXN0SWQ6IHN0cmluZzsgcmVzb2x2ZUlkOiBzdHJpbmc7IGFuc3dlcnM6IElDaGF0UXVlc3Rpb25BbnN3ZXJzIHwgdW5kZWZpbmVkIH0+KCk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHtcblx0XHRcdGlkOiAncmVxdWVzdC0xJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJycgfSxcblx0XHRcdG1vZGVJbmZvOiB1bmRlZmluZWQsXG5cdFx0XHRyZXNwb25zZTogdW5kZWZpbmVkLFxuXHRcdFx0dGVybWluYWxFeGVjdXRpb25JZDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSB7XG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiAoe1xuXHRcdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3JlcXVlc3RdLFxuXHRcdFx0fSksXG5cdFx0XHRhcHBlbmRQcm9ncmVzczogKF9yZXF1ZXN0OiB1bmtub3duLCBwcm9ncmVzczogQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKSA9PiB7XG5cdFx0XHRcdGFwcGVuZGVkQ2Fyb3VzZWwgPSBwcm9ncmVzcztcblx0XHRcdH0sXG5cdFx0XHRvbkRpZFJlY2VpdmVRdWVzdGlvbkNhcm91c2VsQW5zd2VyOiBvbkRpZFJlY2VpdmVRdWVzdGlvbkNhcm91c2VsQW5zd2VyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFNlcnZpY2U7XG5cdFx0Y29uc3QgdG9vbCA9IHN0b3JlLmFkZChuZXcgQXNrUXVlc3Rpb25zVG9vbChcblx0XHRcdGNoYXRTZXJ2aWNlLFxuXHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKVxuXHRcdCkpO1xuXHRcdGNvbnN0IGludm9rZVByb21pc2UgPSB0b29sLmludm9rZSh7XG5cdFx0XHRjYWxsSWQ6ICd0b29sLWNhbGwnLFxuXHRcdFx0Y2hhdFN0cmVhbVRvb2xDYWxsSWQ6ICdyZW1vdGUtdG9vbC1jYWxsJyxcblx0XHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdFx0cXVlc3Rpb25zOiBbeyBoZWFkZXI6ICdDb2xvcicsIHF1ZXN0aW9uOiAnV2hhdCBpcyB5b3VyIGZhdm9yaXRlIGNvbG9yPycsIG9wdGlvbnM6IFt7IGxhYmVsOiAnQmx1ZScgfSwgeyBsYWJlbDogJ1JlZCcgfV0gfV0sXG5cdFx0XHR9LFxuXHRcdFx0Y29udGV4dDogeyBzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSB9LFxuXHRcdFx0Y2hhdFJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHR0b29sSWQ6ICd2c2NvZGVfYXNrUXVlc3Rpb25zJyxcblx0XHR9IGFzIG5ldmVyLCB1bmRlZmluZWQgYXMgbmV2ZXIsIHsgcmVwb3J0OiAoKSA9PiB7IH0gfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQub2soYXBwZW5kZWRDYXJvdXNlbCwgJ2V4cGVjdGVkIHF1ZXN0aW9uIGNhcm91c2VsIHRvIGJlIGFwcGVuZGVkIGJlZm9yZSBleHRlcm5hbCBhbnN3ZXInKTtcblx0XHRvbkRpZFJlY2VpdmVRdWVzdGlvbkNhcm91c2VsQW5zd2VyLmZpcmUoe1xuXHRcdFx0cmVxdWVzdElkOiAnaWdub3JlZCcsXG5cdFx0XHRyZXNvbHZlSWQ6ICdyZW1vdGUtdG9vbC1jYWxsJyxcblx0XHRcdGFuc3dlcnM6IHtcblx0XHRcdFx0J3JlbW90ZS10b29sLWNhbGw6MCc6IHsgc2VsZWN0ZWRWYWx1ZTogJ0JsdWUnIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlUHJvbWlzZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UoU3RyaW5nKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlKSksIHtcblx0XHRcdGFuc3dlcnM6IHtcblx0XHRcdFx0Q29sb3I6IHsgc2VsZWN0ZWQ6IFsnQmx1ZSddLCBmcmVlVGV4dDogbnVsbCwgc2tpcHBlZDogZmFsc2UgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZGVkQ2Fyb3VzZWwuaXNVc2VkLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGVuZGVkQ2Fyb3VzZWwuZGF0YSwge1xuXHRcdFx0J3JlbW90ZS10b29sLWNhbGw6MCc6IHsgc2VsZWN0ZWRWYWx1ZTogJ0JsdWUnIH0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBc2tRdWVzdGlvbnNUb29sIC0gcHJlcGFyZVRvb2xJbnZvY2F0aW9uIHZhbGlkYXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCB0b29sOiBBc2tRdWVzdGlvbnNUb29sO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR0b29sID0gc3RvcmUuYWRkKG5ldyBBc2tRdWVzdGlvbnNUb29sKFxuXHRcdFx0bnVsbCEgYXMgSUNoYXRTZXJ2aWNlLFxuXHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKVxuXHRcdCkpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBtYWtlQ29udGV4dChxdWVzdGlvbnM6IElRdWVzdGlvbltdKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBhcmFtZXRlcnM6IHsgcXVlc3Rpb25zIH0sXG5cdFx0XHR0b29sQ2FsbElkOiAndGVzdC1jYWxsJyxcblx0XHRcdGNoYXRSZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdyZWplY3RzIHNpbmdsZSBvcHRpb24gd2l0aG91dCBmcmVlZm9ybSBpbnB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKG1ha2VDb250ZXh0KFtcblx0XHRcdFx0eyBoZWFkZXI6ICdRMScsIHF1ZXN0aW9uOiAnUGljayBvbmUnLCBvcHRpb25zOiBbeyBsYWJlbDogJ09ubHkgb3B0aW9uJyB9XSB9XG5cdFx0XHRdKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHQvbXVzdCBoYXZlIGF0IGxlYXN0IHR3byBvcHRpb25zL1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyBzaW5nbGUgb3B0aW9uIHdpdGggZnJlZWZvcm0gaW5wdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24obWFrZUNvbnRleHQoW1xuXHRcdFx0eyBoZWFkZXI6ICdRMScsIHF1ZXN0aW9uOiAnUGljayBvbmUnLCBvcHRpb25zOiBbeyBsYWJlbDogJ09ubHkgb3B0aW9uJyB9XSwgYWxsb3dGcmVlZm9ybUlucHV0OiB0cnVlIH1cblx0XHRdKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyB0d28gb3IgbW9yZSBvcHRpb25zIHdpdGhvdXQgZnJlZWZvcm0gaW5wdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24obWFrZUNvbnRleHQoW1xuXHRcdFx0eyBoZWFkZXI6ICdRMScsIHF1ZXN0aW9uOiAnUGljayBvbmUnLCBvcHRpb25zOiBbeyBsYWJlbDogJ0EnIH0sIHsgbGFiZWw6ICdCJyB9XSB9XG5cdFx0XSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3Mgbm8gb3B0aW9ucyAoZnJlZSB0ZXh0KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihtYWtlQ29udGV4dChbXG5cdFx0XHR7IGhlYWRlcjogJ1ExJywgcXVlc3Rpb246ICdUeXBlIHNvbWV0aGluZycgfVxuXHRcdF0pLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsd0JBQW1FO0FBRzVFLE1BQU0saUNBQWlDLGlCQUFpQjtBQUFBLEVBQ2hELDJCQUEyQixXQUF3QixpQkFBa0U7QUFHM0gsVUFBTSxnQkFBZ0Isb0JBQUksSUFBb0I7QUFDOUMsZUFBVyxLQUFLLFdBQVc7QUFDMUIsb0JBQWMsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNO0FBQUEsSUFDckM7QUFDQSxXQUFPLEtBQUssdUJBQXVCLFdBQVcsaUJBQWlCLGFBQWE7QUFBQSxFQUM3RTtBQUNEO0FBRUEsTUFBTSw2Q0FBNkMsTUFBTTtBQUN4RCxRQUFNLFFBQVEsd0NBQXdDO0FBQ3RELE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxXQUFPLE1BQU0sSUFBSSxJQUFJO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJLGVBQWU7QUFBQSxNQUNuQixJQUFJLHlCQUF5QjtBQUFBLElBQzlCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxXQUFTLE1BQU07QUFDZCxVQUFNLFFBQVE7QUFBQSxFQUNmLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFVBQU0sWUFBeUI7QUFBQSxNQUM5QixFQUFFLFFBQVEsTUFBTSxVQUFVLGtCQUFrQjtBQUFBLE1BQzVDLEVBQUUsUUFBUSxNQUFNLFVBQVUsbUJBQW1CO0FBQUEsSUFDOUM7QUFFQSxVQUFN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
