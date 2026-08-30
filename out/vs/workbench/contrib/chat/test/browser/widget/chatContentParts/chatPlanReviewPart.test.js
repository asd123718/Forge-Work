import assert from "assert";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IModelService } from "../../../../../../../editor/common/services/model.js";
import { IDialogService } from "../../../../../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../../../../../platform/dialogs/test/common/testDialogService.js";
import { FileChangesEvent, FileChangeType, IFileService } from "../../../../../../../platform/files/common/files.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from "../../../../browser/planReviewFeedback/planReviewFeedbackService.js";
import { ChatPlanReviewPart } from "../../../../browser/widget/chatContentParts/chatPlanReviewPart.js";
import { ChatPlanReviewData } from "../../../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { IUserInteractionService, MockUserInteractionService } from "../../../../../../../platform/userInteraction/browser/userInteractionService.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import sinon from "sinon";
import { ITextFileService } from "../../../../../../services/textfile/common/textfiles.js";
import { DeferredPromise } from "../../../../../../../base/common/async.js";
import { AgentEditorCommentsBridge, IAgentEditorCommentsBridge } from "../../../../../../services/agentEditorComments/common/agentEditorComments.js";
import { Emitter, Event as VSCodeEvent } from "../../../../../../../base/common/event.js";
function createMockReview(overrides) {
  return {
    kind: "planReview",
    title: "Review Plan",
    content: "# Plan\n- step 1\n- step 2",
    actions: [{ label: "Autopilot", default: true }],
    canProvideFeedback: false,
    ...overrides
  };
}
function createMockReviewWithPlan(overrides) {
  return createMockReview({
    canProvideFeedback: true,
    planUri: URI.parse("file:///plan.md").toJSON(),
    ...overrides
  });
}
function createMockContext() {
  return {
    element: { sessionResource: URI.parse("test://session/1") }
  };
}
function getFooterButtons(widget) {
  const container = widget.domNode.querySelector(".chat-plan-review-footer .chat-buttons");
  return container ? Array.from(container.querySelectorAll(".monaco-button")) : [];
}
function getInlineButtons(widget) {
  const container = widget.domNode.querySelector(".chat-plan-review-inline-actions");
  return container ? Array.from(container.querySelectorAll(".monaco-button")) : [];
}
function getReviewButton(widget) {
  return widget.domNode.querySelector(".chat-plan-review-review-button");
}
function getFeedbackSection(widget) {
  return widget.domNode.querySelector(".chat-plan-review-feedback");
}
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
suite("ChatPlanReviewPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let widget;
  let lastSubmitResult;
  let submitCount = 0;
  let lastFeedbackService;
  let lastEditorService;
  let lastTextFileService;
  let lastModelService;
  let lastCommentsBridge;
  let fileChangesEmitter;
  function createWidget(review, dialogService, onSubmit) {
    const instantiationService = workbenchInstantiationService(void 0, store);
    const commentsBridge = store.add(new AgentEditorCommentsBridge());
    const feedbackService = store.add(new PlanReviewFeedbackService(commentsBridge));
    instantiationService.stub(IAgentEditorCommentsBridge, commentsBridge);
    instantiationService.stub(IPlanReviewFeedbackService, feedbackService);
    instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
    lastFeedbackService = feedbackService;
    lastEditorService = instantiationService.get(IEditorService);
    lastTextFileService = instantiationService.get(ITextFileService);
    lastModelService = instantiationService.get(IModelService);
    lastCommentsBridge = commentsBridge;
    if (fileChangesEmitter) {
      sinon.stub(instantiationService.get(IFileService), "createWatcher").returns({
        onDidChange: fileChangesEmitter.event,
        dispose: () => {
        }
      });
    }
    if (dialogService) {
      instantiationService.stub(IDialogService, dialogService);
    }
    const options = {
      onSubmit: (result) => {
        lastSubmitResult = result;
        submitCount++;
        onSubmit?.();
      }
    };
    widget = store.add(instantiationService.createInstance(ChatPlanReviewPart, review, createMockContext(), options));
    mainWindow.document.body.appendChild(widget.domNode);
    return widget;
  }
  teardown(() => {
    if (widget?.domNode?.parentNode) {
      widget.domNode.parentNode.removeChild(widget.domNode);
    }
    lastSubmitResult = void 0;
    submitCount = 0;
    lastFeedbackService = void 0;
    lastEditorService = void 0;
    lastTextFileService = void 0;
    lastModelService = void 0;
    lastCommentsBridge = void 0;
    fileChangesEmitter = void 0;
    sinon.restore();
  });
  suite("Basic rendering", () => {
    test("renders container with proper structure", () => {
      createWidget(createMockReview());
      assert.ok(widget.domNode.classList.contains("chat-plan-review-container"));
      assert.ok(widget.domNode.querySelector(".chat-plan-review-title"));
      assert.ok(widget.domNode.querySelector(".chat-plan-review-body"));
      assert.ok(widget.domNode.querySelector(".chat-plan-review-footer"));
    });
    test("displays the review title", () => {
      createWidget(createMockReview({ title: "My Plan Title" }));
      const label = widget.domNode.querySelector(".chat-plan-review-title-label");
      assert.strictEqual(label?.textContent, "My Plan Title");
    });
    test("disallows remote images in agent plan markdown", () => {
      createWidget(createMockReview({ content: "Plan ![remote](https://example.com/image.png)" }));
      assert.strictEqual(widget.domNode.querySelectorAll(".chat-plan-review-body img").length, 0);
    });
    test("displays the outdated pill only for outdated summaries", () => {
      createWidget(createMockReviewWithPlan({ isOutdated: true }));
      const badge = widget.domNode.querySelector(".chat-plan-review-outdated");
      assert.deepStrictEqual({
        text: badge?.textContent,
        display: badge?.style.display,
        ariaLabel: badge?.getAttribute("aria-label")
      }, {
        text: "Outdated",
        display: "",
        ariaLabel: "Plan summary is outdated"
      });
    });
    test("hides the outdated pill for current summaries", () => {
      createWidget(createMockReviewWithPlan());
      assert.strictEqual(widget.domNode.querySelector(".chat-plan-review-outdated")?.style.display, "none");
    });
    test("marks the summary outdated when the plan model changes", () => {
      const planUri = URI.parse("file:///outdated-plan.md");
      const review = new ChatPlanReviewData(
        "Plan summary",
        "Generated summary",
        [{ label: "Go", default: true }],
        true,
        planUri.toJSON()
      );
      createWidget(review);
      const model = lastModelService.createModel("# Original plan", null, planUri);
      try {
        model.setValue("# Edited plan");
        assert.deepStrictEqual({
          isOutdated: review.isOutdated,
          persistedIsOutdated: review.toJSON().isOutdated,
          badgeDisplay: widget.domNode.querySelector(".chat-plan-review-outdated")?.style.display,
          summary: review.content
        }, {
          isOutdated: true,
          persistedIsOutdated: true,
          badgeDisplay: "",
          summary: "Generated summary"
        });
      } finally {
        model.dispose();
      }
    });
    test("marks the summary outdated when an open plan is deleted", () => {
      const planUri = URI.parse("file:///deleted-plan.md");
      const review = new ChatPlanReviewData(
        "Plan summary",
        "Generated summary",
        [{ label: "Go", default: true }],
        true,
        planUri.toJSON()
      );
      fileChangesEmitter = store.add(new Emitter());
      createWidget(review);
      const model = lastModelService.createModel("# Original plan", null, planUri);
      try {
        fileChangesEmitter.fire(new FileChangesEvent([{ resource: planUri, type: FileChangeType.DELETED }], false));
        assert.strictEqual(review.isOutdated, true);
      } finally {
        model.dispose();
      }
    });
    test("renders markdown content in the body", () => {
      createWidget(createMockReview({ content: "**bold text**" }));
      const body = widget.domNode.querySelector(".chat-plan-review-body");
      assert.ok(body);
      assert.ok(body?.querySelector(".rendered-markdown"));
    });
    test("uses the themed foreground for markdown links", () => {
      createWidget(createMockReview({ content: "[link](https://example.com)" }));
      const container = mainWindow.document.createElement("div");
      container.classList.add("interactive-session");
      container.style.setProperty("--vscode-textLink-foreground", "rgb(1, 2, 3)");
      mainWindow.document.body.appendChild(container);
      container.appendChild(widget.domNode);
      try {
        const link = widget.domNode.querySelector(".rendered-markdown a");
        assert.strictEqual(link && mainWindow.getComputedStyle(link).color, "rgb(1, 2, 3)");
      } finally {
        container.remove();
      }
    });
    test("renders approve and reject buttons in footer", () => {
      createWidget(createMockReview());
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.length >= 2, "should have at least approve and reject buttons");
      assert.ok(buttons.some((b) => b.textContent?.includes("Autopilot")), "should have approve button");
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "should have reject button");
    });
    test("hides feedback section initially when canProvideFeedback and planUri are both set", () => {
      createWidget(createMockReviewWithPlan());
      const feedbackSection = getFeedbackSection(widget);
      assert.ok(feedbackSection);
      assert.strictEqual(feedbackSection.style.display, "none");
    });
    test("shows feedback section by default when canProvideFeedback is true and there is no planUri", () => {
      createWidget(createMockReview({ canProvideFeedback: true }));
      const feedbackSection = getFeedbackSection(widget);
      assert.ok(feedbackSection);
      assert.notStrictEqual(feedbackSection.style.display, "none");
    });
    test("renders Review button when planUri is provided", () => {
      createWidget(createMockReviewWithPlan());
      const reviewButton = getReviewButton(widget);
      assert.ok(reviewButton, "Review button should exist");
    });
    test("does not render Review button when planUri is absent", () => {
      createWidget(createMockReview({ canProvideFeedback: true }));
      assert.strictEqual(getReviewButton(widget), null, "Review button should not exist without planUri");
    });
    test("does not render Provide Feedback footer button (legacy entry removed)", () => {
      createWidget(createMockReviewWithPlan());
      const buttons = getFooterButtons(widget);
      assert.ok(!buttons.some((b) => b.textContent?.includes("Provide Feedback")), "should not have legacy Provide Feedback button");
    });
  });
  suite("Submit results", () => {
    test("clicking approve submits action with label and rejected=false", () => {
      createWidget(createMockReview({ actions: [{ label: "Go", default: true }] }));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Go"));
      assert.ok(approveButton);
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Go", rejected: false });
    });
    test("clicking reject submits rejected=true", () => {
      createWidget(createMockReview());
      const rejectButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Reject"));
      assert.ok(rejectButton);
      rejectButton.click();
      assert.deepStrictEqual(lastSubmitResult, { rejected: true });
    });
    test("double-click does not submit twice", () => {
      let submitCount2 = 0;
      const instantiationService = workbenchInstantiationService(void 0, store);
      const options = {
        onSubmit: () => {
          submitCount2++;
        }
      };
      widget = store.add(instantiationService.createInstance(
        ChatPlanReviewPart,
        createMockReview(),
        createMockContext(),
        options
      ));
      mainWindow.document.body.appendChild(widget.domNode);
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      approveButton.click();
      approveButton.click();
      assert.strictEqual(submitCount2, 1);
    });
    test("buttons are removed after submission", () => {
      createWidget(createMockReview());
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      approveButton.click();
      assert.ok(widget.domNode.classList.contains("chat-plan-review-used"));
      assert.strictEqual(getFooterButtons(widget).length, 0, "footer buttons should be cleared");
    });
  });
  suite("Feedback mode", () => {
    test("clicking Review button opens the plan editor and shows Submit Feedback button", async () => {
      createWidget(createMockReviewWithPlan());
      const openEditorSpy = sinon.spy(lastEditorService, "openEditor");
      const reviewButton = getReviewButton(widget);
      reviewButton.click();
      await tick();
      assert.strictEqual(openEditorSpy.calledOnce, true, "plan file should open in an editor");
      const editorInput = openEditorSpy.firstCall.args[0];
      assert.strictEqual(editorInput.resource?.toString(), "file:///plan.md");
      assert.strictEqual(editorInput.options?.pinned, true);
      const feedbackSection = getFeedbackSection(widget);
      assert.notStrictEqual(feedbackSection.style.display, "none", "feedback section should be visible");
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Submit Feedback")), "should have Submit Feedback button");
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "should still have Reject button");
      assert.ok(!buttons.some((b) => b.textContent?.includes("Autopilot")), "approve button should be hidden");
    });
    test("reject button remains visible in feedback mode", async () => {
      createWidget(createMockReviewWithPlan());
      getReviewButton(widget).click();
      await tick();
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "reject button should still be visible");
    });
    test("clicking Review button opens feedback section and shows Submit Feedback button", async () => {
      createWidget(createMockReviewWithPlan());
      const reviewButton = getReviewButton(widget);
      reviewButton.click();
      await tick();
      const feedbackSection = getFeedbackSection(widget);
      assert.notStrictEqual(feedbackSection.style.display, "none", "feedback section should be visible");
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Submit Feedback")), "should have Submit Feedback button");
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "should still have Reject button");
      assert.ok(!buttons.some((b) => b.textContent?.includes("Autopilot")), "approve button should be hidden");
    });
    test("reject button remains visible in feedback mode", async () => {
      createWidget(createMockReviewWithPlan());
      getReviewButton(widget).click();
      await tick();
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "reject button should still be visible");
    });
    test("clicking Review button opens feedback section and shows Submit Feedback button", async () => {
      createWidget(createMockReviewWithPlan());
      const reviewButton = getReviewButton(widget);
      reviewButton.click();
      await tick();
      const feedbackSection = getFeedbackSection(widget);
      assert.notStrictEqual(feedbackSection.style.display, "none", "feedback section should be visible");
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Submit Feedback")), "should have Submit Feedback button");
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "should still have Reject button");
      assert.ok(!buttons.some((b) => b.textContent?.includes("Autopilot")), "approve button should be hidden");
    });
    test("reject button remains visible in feedback mode", async () => {
      createWidget(createMockReviewWithPlan());
      getReviewButton(widget).click();
      await tick();
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "reject button should still be visible");
    });
    test("clicking Review while in feedback mode reopens the plan editor", async () => {
      createWidget(createMockReviewWithPlan());
      const openEditorSpy = sinon.spy(lastEditorService, "openEditor");
      const reviewButton = getReviewButton(widget);
      reviewButton.click();
      await tick();
      reviewButton.click();
      await tick();
      const feedbackSection = getFeedbackSection(widget);
      assert.notStrictEqual(feedbackSection.style.display, "none", "feedback section should remain visible");
      assert.strictEqual(openEditorSpy.callCount, 2, "each click should reveal the plan editor");
    });
    test("approving with textarea content sends approval + feedback", () => {
      createWidget(createMockReview({ canProvideFeedback: true }));
      const textarea = widget.domNode.querySelector(".chat-plan-review-feedback-textarea");
      assert.ok(textarea);
      textarea.value = "Please also add tests";
      textarea.dispatchEvent(new Event("input"));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      assert.ok(approveButton, "Approve button should be available even with canProvideFeedback");
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, {
        action: "Autopilot",
        rejected: false,
        feedback: "Please also add tests",
        feedbackOverall: "Please also add tests"
      });
    });
    test("rejecting with textarea content sends rejection + feedback", () => {
      createWidget(createMockReview({ canProvideFeedback: true }));
      const textarea = widget.domNode.querySelector(".chat-plan-review-feedback-textarea");
      textarea.value = "Not the right approach";
      textarea.dispatchEvent(new Event("input"));
      const rejectButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Reject"));
      assert.ok(rejectButton);
      rejectButton.click();
      assert.deepStrictEqual(lastSubmitResult, {
        rejected: true,
        feedback: "Not the right approach",
        feedbackOverall: "Not the right approach"
      });
    });
    test("submit is disabled when feedback textarea is empty and no inline comments", async () => {
      createWidget(createMockReviewWithPlan());
      getReviewButton(widget).click();
      await tick();
      const submitButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Submit Feedback"));
      assert.ok(submitButton);
      assert.ok(submitButton.classList.contains("disabled"), "Submit Feedback should be disabled when nothing to submit");
    });
  });
  suite("Inline comments list", () => {
    test("renders comments list and updates Submit Feedback count when service has items", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 5, 1, "Fix this step");
      service.addFeedback(planUri, 12, 1, "Reword this");
      const rows = widget.domNode.querySelectorAll(".chat-plan-review-comment-row");
      assert.strictEqual(rows.length, 2, "should render one row per inline comment");
      const submitButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Submit Feedback"));
      assert.ok(submitButton);
      assert.ok((submitButton.textContent ?? "").includes("(2)"), "Submit label should reflect inline count");
    });
    test("live comments from the Markdown editor update the widget", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const planUri = URI.revive(review.planUri);
      const changed = store.add(new Emitter());
      const comments = [{
        id: "live-comment",
        resource: planUri,
        range: {
          startLineNumber: 5,
          startColumn: 1,
          endLineNumber: 5,
          endColumn: 10
        },
        body: "New live comment"
      }];
      store.add(lastCommentsBridge.registerProvider({
        priority: 100,
        onDidChangeComments: changed.event,
        onDidRevealComment: VSCodeEvent.None,
        acceptsComments: () => true,
        getComments: () => comments,
        addComment: () => {
        },
        deleteComment: () => {
        }
      }));
      changed.fire();
      assert.deepStrictEqual({
        rows: widget.domNode.querySelectorAll(".chat-plan-review-comment-row").length,
        submitLabel: getFooterButtons(widget).find((button) => button.textContent?.includes("Submit Feedback"))?.textContent
      }, {
        rows: 1,
        submitLabel: "Submit Feedback (1)"
      });
    });
    test("reveals a related comment in its own resource", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const planUri = URI.revive(review.planUri);
      const relatedUri = URI.parse("file:///related.ts");
      const changed = store.add(new Emitter());
      store.add(lastCommentsBridge.registerProvider({
        priority: 100,
        onDidChangeComments: changed.event,
        onDidRevealComment: VSCodeEvent.None,
        acceptsComments: () => true,
        getComments: () => [{
          id: "related-comment",
          resource: relatedUri,
          range: { startLineNumber: 7, startColumn: 3, endLineNumber: 7, endColumn: 8 },
          body: "Update this source"
        }],
        addComment: () => {
        },
        deleteComment: () => {
        }
      }));
      changed.fire();
      const openEditorSpy = sinon.spy(lastEditorService, "openEditor");
      widget.domNode.querySelector(".chat-plan-review-comment-reveal").click();
      await tick();
      const editorInput = openEditorSpy.lastCall.args[0];
      assert.deepStrictEqual({
        resource: editorInput.resource?.toString(),
        override: editorInput.options?.override,
        selection: editorInput.options?.selection,
        planResource: planUri.toString()
      }, {
        resource: relatedUri.toString(),
        override: void 0,
        selection: { startLineNumber: 7, startColumn: 3 },
        planResource: planUri.toString()
      });
    });
    test("inline comments alone are enough to enable Submit Feedback", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 1, 1, "Hi");
      const submitButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Submit Feedback"));
      assert.ok(submitButton);
      assert.ok(!submitButton.classList.contains("disabled"), "Submit Feedback should be enabled with one inline comment");
    });
    test("editor toolbar feedback submission updates the original plan widget", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review, void 0, () => widget.dispose());
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 5, 1, "Fix this step");
      let commentsChanged = 0;
      store.add(lastCommentsBridge.onDidChangeComments(() => commentsChanged++));
      const didSubmit = await service.submitAllFeedback(planUri);
      assert.deepStrictEqual({
        submitResult: lastSubmitResult,
        didSubmit,
        commentsChanged,
        remainingComments: lastCommentsBridge.getComments(planUri)
      }, {
        submitResult: {
          rejected: false,
          feedback: "Inline comments on `plan.md`:\n- **Line 5:** Fix this step",
          feedbackOverall: void 0,
          feedbackInlineMarkdown: "Inline comments on `plan.md`:\n- **Line 5:** Fix this step"
        },
        didSubmit: true,
        commentsChanged: 2,
        remainingComments: []
      });
      assert.ok(widget.domNode.classList.contains("chat-plan-review-used"));
    });
    test("editor toolbar submits an overall comment without inline comments", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      const textarea = widget.domNode.querySelector(".chat-plan-review-feedback-textarea");
      textarea.value = "Please simplify the rollout";
      textarea.dispatchEvent(new Event("input"));
      await lastFeedbackService.submitAllFeedback(URI.revive(review.planUri));
      assert.deepStrictEqual(lastSubmitResult, {
        rejected: false,
        feedback: "Please simplify the rollout",
        feedbackOverall: "Please simplify the rollout",
        feedbackInlineMarkdown: void 0
      });
    });
    test("comments added while the plan save is pending remain unsubmitted", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      const planUri = URI.revive(review.planUri);
      const changed = store.add(new Emitter());
      const comments = [{
        id: "submitted",
        resource: planUri,
        range: { startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: 2 },
        body: "Submit this"
      }];
      store.add(lastCommentsBridge.registerProvider({
        priority: 100,
        onDidChangeComments: changed.event,
        onDidRevealComment: VSCodeEvent.None,
        acceptsComments: () => true,
        getComments: () => comments,
        addComment: () => {
        },
        deleteComment: (_resource, id) => {
          const index = comments.findIndex((comment) => comment.id === id);
          if (index !== -1) {
            comments.splice(index, 1);
          }
        }
      }));
      changed.fire();
      const saveDeferred = new DeferredPromise();
      sinon.stub(lastTextFileService, "isDirty").returns(true);
      sinon.stub(lastTextFileService, "save").returns(saveDeferred.p);
      const submitButton = getFooterButtons(widget).find((button) => button.textContent?.includes("Submit Feedback"));
      submitButton.click();
      comments.push({
        id: "added-during-save",
        resource: planUri,
        range: { startLineNumber: 8, startColumn: 1, endLineNumber: 8, endColumn: 2 },
        body: "Keep this"
      });
      changed.fire();
      saveDeferred.complete(planUri);
      await tick();
      assert.deepStrictEqual({
        submittedFeedback: lastSubmitResult?.feedback,
        remainingCommentIds: lastCommentsBridge.getComments(planUri, true).map((comment) => comment.id)
      }, {
        submittedFeedback: "Inline comments on `plan.md`:\n- **Line 5:** Submit this",
        remainingCommentIds: ["added-during-save"]
      });
    });
    test("inline comments auto-promote into review mode even before Review button is clicked", () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      assert.strictEqual(getFeedbackSection(widget).style.display, "none");
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 1, 1, "Surprise comment");
      assert.notStrictEqual(getFeedbackSection(widget).style.display, "none", "section should auto-open when comments arrive");
    });
    test("per-row remove button removes only that comment from the service", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 5, 1, "Fix this");
      service.addFeedback(planUri, 12, 1, "Reword");
      service.addFeedback(planUri, 20, 1, "Add detail");
      const removeButtons = widget.domNode.querySelectorAll(".chat-plan-review-comment-remove");
      assert.strictEqual(removeButtons.length, 3, "should render one remove button per row");
      removeButtons[1].click();
      const remaining = service.getFeedback(planUri);
      assert.deepStrictEqual(remaining.map((i) => i.text), ["Fix this", "Add detail"], "middle comment should be removed");
    });
    test("Clear All button is hidden when there are no inline comments", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const clearAll = widget.domNode.querySelector(".chat-plan-review-feedback-clear-all");
      assert.ok(clearAll, "Clear All button should be in the DOM");
      assert.strictEqual(clearAll.style.display, "none", "Clear All should be hidden when list is empty");
    });
    test("Clear All button removes all inline comments after confirmation", async () => {
      const review = createMockReviewWithPlan();
      const dialogService = new TestDialogService({ confirmed: true });
      createWidget(review, dialogService);
      getReviewButton(widget).click();
      await tick();
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 1, 1, "a");
      service.addFeedback(planUri, 2, 1, "b");
      const clearAll = widget.domNode.querySelector(".chat-plan-review-feedback-clear-all");
      assert.ok(clearAll, "Clear All button should be present");
      assert.notStrictEqual(clearAll.style.display, "none", "Clear All should be visible when list has items");
      clearAll.click();
      await tick();
      assert.strictEqual(service.getFeedback(planUri).length, 0, "all comments should be cleared");
    });
    test("Clear All cancellation keeps inline comments intact", async () => {
      const review = createMockReviewWithPlan();
      const dialogService = new TestDialogService({ confirmed: false });
      createWidget(review, dialogService);
      getReviewButton(widget).click();
      await tick();
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 1, 1, "a");
      service.addFeedback(planUri, 2, 1, "b");
      const clearAll = widget.domNode.querySelector(".chat-plan-review-feedback-clear-all");
      clearAll.click();
      await tick();
      assert.strictEqual(service.getFeedback(planUri).length, 2, "comments should be untouched when user cancels");
    });
  });
  suite("Collapsed state", () => {
    test("toggles collapsed state via chevron button", () => {
      createWidget(createMockReview());
      const collapseButton = widget.domNode.querySelector(".chat-plan-review-title-icon-button:last-child");
      assert.ok(collapseButton);
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "true");
      collapseButton.click();
      assert.ok(widget.domNode.classList.contains("chat-plan-review-collapsed"));
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "false");
      collapseButton.click();
      assert.ok(!widget.domNode.classList.contains("chat-plan-review-collapsed"));
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "true");
    });
    test("collapsed view shows inline actions and hides footer", () => {
      createWidget(createMockReview());
      const collapseButton = widget.domNode.querySelector(".chat-plan-review-title-icon-button:last-child");
      collapseButton.click();
      const inlineButtons = getInlineButtons(widget);
      assert.ok(inlineButtons.length > 0, "should have inline action buttons when collapsed");
      const footerButtons = getFooterButtons(widget);
      assert.strictEqual(footerButtons.length, 0, "footer buttons should be empty when collapsed");
    });
    test("collapsed view does not show reject button", () => {
      createWidget(createMockReview());
      const collapseButton = widget.domNode.querySelector(".chat-plan-review-title-icon-button:last-child");
      collapseButton.click();
      const inlineButtons = getInlineButtons(widget);
      assert.ok(!inlineButtons.some((b) => b.textContent?.includes("Reject")), "reject should be omitted in collapsed view");
    });
    test("collapsing preserves feedback mode and inline buttons keep Submit Feedback", async () => {
      createWidget(createMockReviewWithPlan());
      getReviewButton(widget).click();
      await tick();
      const collapseButton = widget.domNode.querySelector(".chat-plan-review-title-icon-button:last-child");
      collapseButton.click();
      const inlineButtons = getInlineButtons(widget);
      assert.ok(inlineButtons.some((b) => b.textContent?.includes("Submit Feedback")), "inline action should be Submit Feedback when feedback mode is active");
      collapseButton.click();
      const footerButtons = getFooterButtons(widget);
      assert.ok(footerButtons.some((b) => b.textContent?.includes("Submit Feedback")), "submit feedback button should remain after expand");
      assert.ok(!footerButtons.some((b) => b.textContent?.includes("Autopilot")), "approve should still be hidden in feedback mode");
    });
    test("a comment added while collapsed is reflected in the inline action", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      const collapseButton = widget.domNode.querySelector(".chat-plan-review-title-icon-button:last-child");
      collapseButton.click();
      lastFeedbackService.addFeedback(URI.revive(review.planUri), 3, 1, "Clarify this step");
      await tick();
      const submitButton = getInlineButtons(widget).find((button) => button.textContent?.includes("Submit Feedback"));
      assert.ok(submitButton?.textContent?.includes("(1)"), "collapsed widget should show the pending comment count");
    });
    test("restores draft collapsed state from ChatPlanReviewData", () => {
      const data = new ChatPlanReviewData("Title", "Content", [{ label: "Go", default: true }], false);
      data.draftCollapsed = true;
      createWidget(data);
      assert.ok(widget.domNode.classList.contains("chat-plan-review-collapsed"));
    });
  });
  suite("Multiple actions", () => {
    test("persists edited plan content before submission", async () => {
      const planUri = URI.parse("file:///plan.md");
      const review = new ChatPlanReviewData(
        "Review Plan",
        "# Original plan",
        [{ id: "approve", label: "Approve", default: true }],
        true,
        planUri.toJSON()
      );
      createWidget(review);
      sinon.stub(lastTextFileService, "isDirty").returns(true);
      sinon.stub(lastTextFileService, "save").resolves(planUri);
      sinon.stub(lastTextFileService, "read").resolves({
        resource: planUri,
        name: "plan.md",
        size: 13,
        mtime: 1,
        ctime: 1,
        etag: "1",
        readonly: false,
        locked: false,
        executable: false,
        encoding: "utf8",
        value: "# Edited plan"
      });
      getFooterButtons(widget).find((button) => button.textContent?.includes("Approve")).click();
      await tick();
      assert.deepStrictEqual({
        content: review.content,
        serializedContent: review.toJSON().content
      }, {
        content: "# Edited plan",
        serializedContent: "# Edited plan"
      });
    });
    test("concurrent approval attempts submit only once", async () => {
      const review = createMockReviewWithPlan({
        actions: [{ id: "approve", label: "Approve", default: true }]
      });
      createWidget(review);
      const saveDeferred = new DeferredPromise();
      sinon.stub(lastTextFileService, "isDirty").returns(true);
      const saveStub = sinon.stub(lastTextFileService, "save").returns(saveDeferred.p);
      const approveButton = getFooterButtons(widget).find((button) => button.textContent?.includes("Approve"));
      approveButton.click();
      approveButton.click();
      assert.strictEqual(saveStub.callCount, 1);
      saveDeferred.complete(URI.revive(review.planUri));
      await tick();
      assert.deepStrictEqual(lastSubmitResult, { action: "Approve", actionId: "approve", rejected: false });
      assert.strictEqual(submitCount, 1);
    });
    test("renders dropdown when multiple actions exist", () => {
      const actions = [
        { label: "Autopilot", default: true },
        { label: "Interactive" }
      ];
      createWidget(createMockReview({ actions }));
      const dropdown = widget.domNode.querySelector(".monaco-button-dropdown");
      assert.ok(dropdown, "should render a button-with-dropdown for multiple actions");
    });
    test("renders plain button when single action exists", () => {
      createWidget(createMockReview({ actions: [{ label: "Go", default: true }] }));
      const dropdown = widget.domNode.querySelector(".monaco-button-dropdown");
      assert.strictEqual(dropdown, null, "should not render dropdown for a single action");
    });
    test("emits actionId for the default action when clicked", () => {
      createWidget(createMockReview({
        actions: [{ id: "approve", label: "Approve", default: true }]
      }));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Approve"));
      assert.ok(approveButton);
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Approve", actionId: "approve", rejected: false });
    });
    test("emits actionId for a non-default dropdown action when chosen", () => {
      const actions = [
        { id: "approve", label: "Approve", default: true },
        { id: "approveBypass", label: "Approve & Bypass Permissions" }
      ];
      createWidget(createMockReview({ actions }));
      const dropdown = widget.domNode.querySelector(".monaco-button-dropdown");
      assert.ok(dropdown);
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Approve") && !b.textContent?.includes("Bypass"));
      assert.ok(approveButton);
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Approve", actionId: "approve", rejected: false });
    });
    test("emits actionId when bypass action is the default", () => {
      createWidget(createMockReview({
        actions: [
          { id: "approveBypass", label: "Approve & Bypass Permissions", default: true },
          { id: "approve", label: "Approve" }
        ]
      }));
      const bypassButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Bypass"));
      assert.ok(bypassButton);
      bypassButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Approve & Bypass Permissions", actionId: "approveBypass", rejected: false });
    });
    test("omits actionId when the action has no id", () => {
      createWidget(createMockReview({ actions: [{ label: "Go", default: true }] }));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Go"));
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Go", rejected: false });
    });
  });
  suite("Autopilot confirmation dialog", () => {
    test("shows confirmation dialog for autopilot permission level and proceeds on confirm", async () => {
      createWidget(createMockReview({
        actions: [{ label: "Autopilot", default: true, permissionLevel: "autopilot" }]
      }));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      approveButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(lastSubmitResult, { action: "Autopilot", rejected: false });
    });
    test("cancels autopilot when dialog is dismissed", async () => {
      const dialogService = new TestDialogService(void 0, { result: false });
      createWidget(createMockReview({
        actions: [{ label: "Autopilot", default: true, permissionLevel: "autopilot" }]
      }), dialogService);
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      approveButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(lastSubmitResult, void 0, "should not submit when dialog is cancelled");
      assert.ok(!widget.domNode.classList.contains("chat-plan-review-used"), "should not mark as used");
    });
    test("no confirmation dialog for actions without permissionLevel", () => {
      createWidget(createMockReview({
        actions: [{ label: "Interactive", default: true }]
      }));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Interactive"));
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Interactive", rejected: false });
    });
  });
  suite("Used / submitted state", () => {
    test("marks widget as used when review.isUsed is true", () => {
      createWidget(createMockReview({ isUsed: true }));
      assert.ok(widget.domNode.classList.contains("chat-plan-review-used"));
    });
    test("disables feedback textarea after submission", () => {
      createWidget(createMockReview({ canProvideFeedback: true }));
      const textarea = widget.domNode.querySelector(".chat-plan-review-feedback-textarea");
      textarea.value = "some feedback";
      textarea.dispatchEvent(new Event("input"));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      assert.ok(approveButton, "Approve button should be available");
      approveButton.click();
      assert.strictEqual(textarea.disabled, true, "textarea should be disabled after submission");
    });
    test("dismiss disposes the active plan registration", () => {
      const review = new ChatPlanReviewData(
        "Review Plan",
        "# Plan",
        [{ label: "Go", default: true }],
        true,
        URI.parse("file:///plan.md").toJSON()
      );
      createWidget(review);
      const planUri = URI.revive(review.planUri);
      assert.strictEqual(lastFeedbackService.isActivePlanReview(planUri), true);
      review.dismiss();
      assert.deepStrictEqual({
        active: lastFeedbackService.isActivePlanReview(planUri),
        used: widget.domNode.classList.contains("chat-plan-review-used"),
        buttonCount: getFooterButtons(widget).length
      }, {
        active: false,
        used: true,
        buttonCount: 0
      });
    });
  });
  suite("hasSameContent", () => {
    test("returns false for different kind", () => {
      createWidget(createMockReview());
      const other = { kind: "disabledClaudeHooks" };
      assert.strictEqual(widget.hasSameContent(other, [], {}), false);
    });
    test("returns true for same resolveId", () => {
      createWidget(createMockReview({ resolveId: "abc-123" }));
      const other = createMockReview({ resolveId: "abc-123" });
      assert.strictEqual(widget.hasSameContent(other, [], {}), true);
    });
    test("returns false for different resolveId", () => {
      createWidget(createMockReview({ resolveId: "abc-123" }));
      const other = createMockReview({ resolveId: "def-456" });
      assert.strictEqual(widget.hasSameContent(other, [], {}), false);
    });
    test("returns false when isUsed mismatch", () => {
      createWidget(createMockReview({ isUsed: false }));
      const other = createMockReview({ isUsed: true });
      assert.strictEqual(widget.hasSameContent(other, [], {}), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFBsYW5SZXZpZXdQYXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgVGVzdERpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL3Rlc3QvY29tbW9uL3Rlc3REaWFsb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VzRXZlbnQsIEZpbGVDaGFuZ2VUeXBlLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlLCBQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wbGFuUmV2aWV3RmVlZGJhY2svcGxhblJldmlld0ZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UGxhblJldmlld1BhcnQsIElDaGF0UGxhblJldmlld1BhcnRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UGxhblJldmlld1BhcnQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgSUNoYXRQbGFuQXBwcm92YWxBY3Rpb24sIElDaGF0UGxhblJldmlldywgSUNoYXRQbGFuUmV2aWV3UmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVuZGVyZXJDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFBsYW5SZXZpZXdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRQbGFuUmV2aWV3RGF0YS5qcyc7XG5pbXBvcnQgeyBJVXNlckludGVyYWN0aW9uU2VydmljZSwgTW9ja1VzZXJJbnRlcmFjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VySW50ZXJhY3Rpb24vYnJvd3Nlci91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBJUmVzb3VyY2VFZGl0b3JJbnB1dCwgSVRleHRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlQ29udGVudCwgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZSwgSUFnZW50RWRpdG9yQ29tbWVudCwgSUFnZW50RWRpdG9yQ29tbWVudHNCcmlkZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hZ2VudEVkaXRvckNvbW1lbnRzL2NvbW1vbi9hZ2VudEVkaXRvckNvbW1lbnRzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IGFzIFZTQ29kZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVNb2NrUmV2aWV3KG92ZXJyaWRlcz86IFBhcnRpYWw8SUNoYXRQbGFuUmV2aWV3Pik6IElDaGF0UGxhblJldmlldyB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ3BsYW5SZXZpZXcnLFxuXHRcdHRpdGxlOiAnUmV2aWV3IFBsYW4nLFxuXHRcdGNvbnRlbnQ6ICcjIFBsYW5cXG4tIHN0ZXAgMVxcbi0gc3RlcCAyJyxcblx0XHRhY3Rpb25zOiBbeyBsYWJlbDogJ0F1dG9waWxvdCcsIGRlZmF1bHQ6IHRydWUgfV0sXG5cdFx0Y2FuUHJvdmlkZUZlZWRiYWNrOiBmYWxzZSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbihvdmVycmlkZXM/OiBQYXJ0aWFsPElDaGF0UGxhblJldmlldz4pOiBJQ2hhdFBsYW5SZXZpZXcge1xuXHRyZXR1cm4gY3JlYXRlTW9ja1Jldmlldyh7XG5cdFx0Y2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlLFxuXHRcdHBsYW5Vcmk6IFVSSS5wYXJzZSgnZmlsZTovLy9wbGFuLm1kJykudG9KU09OKCksXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja0NvbnRleHQoKTogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQge1xuXHRyZXR1cm4ge1xuXHRcdGVsZW1lbnQ6IHsgc2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLzEnKSB9LFxuXHR9IGFzIElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0O1xufVxuXG4vKiogUXVlcnkgYWxsIGAubW9uYWNvLWJ1dHRvbmAgZWxlbWVudHMgaW5zaWRlIHRoZSBmb290ZXIgYC5jaGF0LWJ1dHRvbnNgIGNvbnRhaW5lci4gKi9cbmZ1bmN0aW9uIGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0OiBDaGF0UGxhblJldmlld1BhcnQpOiBIVE1MRWxlbWVudFtdIHtcblx0Y29uc3QgY29udGFpbmVyID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctZm9vdGVyIC5jaGF0LWJ1dHRvbnMnKTtcblx0cmV0dXJuIGNvbnRhaW5lciA/IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tYnV0dG9uJykpIDogW107XG59XG5cbi8qKiBRdWVyeSBhbGwgYC5tb25hY28tYnV0dG9uYCBlbGVtZW50cyBpbnNpZGUgdGhlIGlubGluZS1hY3Rpb25zIGNvbnRhaW5lciAoY29sbGFwc2VkIHRpdGxlIGJhcikuICovXG5mdW5jdGlvbiBnZXRJbmxpbmVCdXR0b25zKHdpZGdldDogQ2hhdFBsYW5SZXZpZXdQYXJ0KTogSFRNTEVsZW1lbnRbXSB7XG5cdGNvbnN0IGNvbnRhaW5lciA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LWlubGluZS1hY3Rpb25zJyk7XG5cdHJldHVybiBjb250YWluZXIgPyBBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWJ1dHRvbicpKSA6IFtdO1xufVxuXG5mdW5jdGlvbiBnZXRSZXZpZXdCdXR0b24od2lkZ2V0OiBDaGF0UGxhblJldmlld1BhcnQpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuXHRyZXR1cm4gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctcmV2aWV3LWJ1dHRvbicpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbn1cblxuZnVuY3Rpb24gZ2V0RmVlZGJhY2tTZWN0aW9uKHdpZGdldDogQ2hhdFBsYW5SZXZpZXdQYXJ0KTogSFRNTEVsZW1lbnQge1xuXHRyZXR1cm4gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2snKSBhcyBIVE1MRWxlbWVudDtcbn1cblxuZnVuY3Rpb24gdGljaygpOiBQcm9taXNlPHZvaWQ+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG59XG5cbnN1aXRlKCdDaGF0UGxhblJldmlld1BhcnQnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHdpZGdldDogQ2hhdFBsYW5SZXZpZXdQYXJ0O1xuXHRsZXQgbGFzdFN1Ym1pdFJlc3VsdDogSUNoYXRQbGFuUmV2aWV3UmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRsZXQgc3VibWl0Q291bnQgPSAwO1xuXHRsZXQgbGFzdEZlZWRiYWNrU2VydmljZTogSVBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdGxldCBsYXN0RWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdGxldCBsYXN0VGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRsZXQgbGFzdE1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSB8IHVuZGVmaW5lZDtcblx0bGV0IGxhc3RDb21tZW50c0JyaWRnZTogQWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZSB8IHVuZGVmaW5lZDtcblx0bGV0IGZpbGVDaGFuZ2VzRW1pdHRlcjogRW1pdHRlcjxGaWxlQ2hhbmdlc0V2ZW50PiB8IHVuZGVmaW5lZDtcblxuXHRmdW5jdGlvbiBjcmVhdGVXaWRnZXQocmV2aWV3OiBJQ2hhdFBsYW5SZXZpZXcsIGRpYWxvZ1NlcnZpY2U/OiBUZXN0RGlhbG9nU2VydmljZSwgb25TdWJtaXQ/OiAoKSA9PiB2b2lkKTogQ2hhdFBsYW5SZXZpZXdQYXJ0IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGNvbnN0IGNvbW1lbnRzQnJpZGdlID0gc3RvcmUuYWRkKG5ldyBBZ2VudEVkaXRvckNvbW1lbnRzQnJpZGdlKCkpO1xuXHRcdGNvbnN0IGZlZWRiYWNrU2VydmljZSA9IHN0b3JlLmFkZChuZXcgUGxhblJldmlld0ZlZWRiYWNrU2VydmljZShjb21tZW50c0JyaWRnZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50RWRpdG9yQ29tbWVudHNCcmlkZ2UsIGNvbW1lbnRzQnJpZGdlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlLCBmZWVkYmFja1NlcnZpY2UpOyBpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlLCBuZXcgTW9ja1VzZXJJbnRlcmFjdGlvblNlcnZpY2UoKSk7XG5cblx0XHRsYXN0RmVlZGJhY2tTZXJ2aWNlID0gZmVlZGJhY2tTZXJ2aWNlO1xuXHRcdGxhc3RFZGl0b3JTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRsYXN0VGV4dEZpbGVTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElUZXh0RmlsZVNlcnZpY2UpO1xuXHRcdGxhc3RNb2RlbFNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSU1vZGVsU2VydmljZSk7XG5cdFx0bGFzdENvbW1lbnRzQnJpZGdlID0gY29tbWVudHNCcmlkZ2U7XG5cdFx0aWYgKGZpbGVDaGFuZ2VzRW1pdHRlcikge1xuXHRcdFx0c2lub24uc3R1YihpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUZpbGVTZXJ2aWNlKSwgJ2NyZWF0ZVdhdGNoZXInKS5yZXR1cm5zKHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IGZpbGVDaGFuZ2VzRW1pdHRlci5ldmVudCxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmIChkaWFsb2dTZXJ2aWNlKSB7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3B0aW9uczogSUNoYXRQbGFuUmV2aWV3UGFydE9wdGlvbnMgPSB7XG5cdFx0XHRvblN1Ym1pdDogcmVzdWx0ID0+IHtcblx0XHRcdFx0bGFzdFN1Ym1pdFJlc3VsdCA9IHJlc3VsdDtcblx0XHRcdFx0c3VibWl0Q291bnQrKztcblx0XHRcdFx0b25TdWJtaXQ/LigpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0d2lkZ2V0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRQbGFuUmV2aWV3UGFydCwgcmV2aWV3LCBjcmVhdGVNb2NrQ29udGV4dCgpLCBvcHRpb25zKSk7XG5cdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0XHRyZXR1cm4gd2lkZ2V0O1xuXHR9XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGlmICh3aWRnZXQ/LmRvbU5vZGU/LnBhcmVudE5vZGUpIHtcblx0XHRcdHdpZGdldC5kb21Ob2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQod2lkZ2V0LmRvbU5vZGUpO1xuXHRcdH1cblx0XHRsYXN0U3VibWl0UmVzdWx0ID0gdW5kZWZpbmVkO1xuXHRcdHN1Ym1pdENvdW50ID0gMDtcblx0XHRsYXN0RmVlZGJhY2tTZXJ2aWNlID0gdW5kZWZpbmVkO1xuXHRcdGxhc3RFZGl0b3JTZXJ2aWNlID0gdW5kZWZpbmVkO1xuXHRcdGxhc3RUZXh0RmlsZVNlcnZpY2UgPSB1bmRlZmluZWQ7XG5cdFx0bGFzdE1vZGVsU2VydmljZSA9IHVuZGVmaW5lZDtcblx0XHRsYXN0Q29tbWVudHNCcmlkZ2UgPSB1bmRlZmluZWQ7XG5cdFx0ZmlsZUNoYW5nZXNFbWl0dGVyID0gdW5kZWZpbmVkO1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSk7XG5cblx0c3VpdGUoJ0Jhc2ljIHJlbmRlcmluZycsICgpID0+IHtcblx0XHR0ZXN0KCdyZW5kZXJzIGNvbnRhaW5lciB3aXRoIHByb3BlciBzdHJ1Y3R1cmUnLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1JldmlldygpKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy1jb250YWluZXInKSk7XG5cdFx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctdGl0bGUnKSk7XG5cdFx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctYm9keScpKTtcblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1mb290ZXInKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwbGF5cyB0aGUgcmV2aWV3IHRpdGxlJywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoeyB0aXRsZTogJ015IFBsYW4gVGl0bGUnIH0pKTtcblxuXHRcdFx0Y29uc3QgbGFiZWwgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy10aXRsZS1sYWJlbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsPy50ZXh0Q29udGVudCwgJ015IFBsYW4gVGl0bGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc2FsbG93cyByZW1vdGUgaW1hZ2VzIGluIGFnZW50IHBsYW4gbWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlldyh7IGNvbnRlbnQ6ICdQbGFuICFbcmVtb3RlXShodHRwczovL2V4YW1wbGUuY29tL2ltYWdlLnBuZyknIH0pKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXBsYW4tcmV2aWV3LWJvZHkgaW1nJykubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3BsYXlzIHRoZSBvdXRkYXRlZCBwaWxsIG9ubHkgZm9yIG91dGRhdGVkIHN1bW1hcmllcycsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oeyBpc091dGRhdGVkOiB0cnVlIH0pKTtcblxuXHRcdFx0Y29uc3QgYmFkZ2UgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtcGxhbi1yZXZpZXctb3V0ZGF0ZWQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0ZXh0OiBiYWRnZT8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGRpc3BsYXk6IGJhZGdlPy5zdHlsZS5kaXNwbGF5LFxuXHRcdFx0XHRhcmlhTGFiZWw6IGJhZGdlPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJ091dGRhdGVkJyxcblx0XHRcdFx0ZGlzcGxheTogJycsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ1BsYW4gc3VtbWFyeSBpcyBvdXRkYXRlZCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hpZGVzIHRoZSBvdXRkYXRlZCBwaWxsIGZvciBjdXJyZW50IHN1bW1hcmllcycsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtcGxhbi1yZXZpZXctb3V0ZGF0ZWQnKT8uc3R5bGUuZGlzcGxheSwgJ25vbmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtzIHRoZSBzdW1tYXJ5IG91dGRhdGVkIHdoZW4gdGhlIHBsYW4gbW9kZWwgY2hhbmdlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vb3V0ZGF0ZWQtcGxhbi5tZCcpO1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gbmV3IENoYXRQbGFuUmV2aWV3RGF0YShcblx0XHRcdFx0J1BsYW4gc3VtbWFyeScsXG5cdFx0XHRcdCdHZW5lcmF0ZWQgc3VtbWFyeScsXG5cdFx0XHRcdFt7IGxhYmVsOiAnR28nLCBkZWZhdWx0OiB0cnVlIH1dLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRwbGFuVXJpLnRvSlNPTigpLFxuXHRcdFx0KTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBsYXN0TW9kZWxTZXJ2aWNlIS5jcmVhdGVNb2RlbCgnIyBPcmlnaW5hbCBwbGFuJywgbnVsbCwgcGxhblVyaSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdG1vZGVsLnNldFZhbHVlKCcjIEVkaXRlZCBwbGFuJyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0aXNPdXRkYXRlZDogcmV2aWV3LmlzT3V0ZGF0ZWQsXG5cdFx0XHRcdFx0cGVyc2lzdGVkSXNPdXRkYXRlZDogcmV2aWV3LnRvSlNPTigpLmlzT3V0ZGF0ZWQsXG5cdFx0XHRcdFx0YmFkZ2VEaXNwbGF5OiB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtcGxhbi1yZXZpZXctb3V0ZGF0ZWQnKT8uc3R5bGUuZGlzcGxheSxcblx0XHRcdFx0XHRzdW1tYXJ5OiByZXZpZXcuY29udGVudCxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGlzT3V0ZGF0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0cGVyc2lzdGVkSXNPdXRkYXRlZDogdHJ1ZSxcblx0XHRcdFx0XHRiYWRnZURpc3BsYXk6ICcnLFxuXHRcdFx0XHRcdHN1bW1hcnk6ICdHZW5lcmF0ZWQgc3VtbWFyeScsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFya3MgdGhlIHN1bW1hcnkgb3V0ZGF0ZWQgd2hlbiBhbiBvcGVuIHBsYW4gaXMgZGVsZXRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vZGVsZXRlZC1wbGFuLm1kJyk7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBuZXcgQ2hhdFBsYW5SZXZpZXdEYXRhKFxuXHRcdFx0XHQnUGxhbiBzdW1tYXJ5Jyxcblx0XHRcdFx0J0dlbmVyYXRlZCBzdW1tYXJ5Jyxcblx0XHRcdFx0W3sgbGFiZWw6ICdHbycsIGRlZmF1bHQ6IHRydWUgfV0sXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdHBsYW5VcmkudG9KU09OKCksXG5cdFx0XHQpO1xuXHRcdFx0ZmlsZUNoYW5nZXNFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPEZpbGVDaGFuZ2VzRXZlbnQ+KCkpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KHJldmlldyk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGxhc3RNb2RlbFNlcnZpY2UhLmNyZWF0ZU1vZGVsKCcjIE9yaWdpbmFsIHBsYW4nLCBudWxsLCBwbGFuVXJpKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZmlsZUNoYW5nZXNFbWl0dGVyLmZpcmUobmV3IEZpbGVDaGFuZ2VzRXZlbnQoW3sgcmVzb3VyY2U6IHBsYW5VcmksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfV0sIGZhbHNlKSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldmlldy5pc091dGRhdGVkLCB0cnVlKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgbWFya2Rvd24gY29udGVudCBpbiB0aGUgYm9keScsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgY29udGVudDogJyoqYm9sZCB0ZXh0KionIH0pKTtcblxuXHRcdFx0Y29uc3QgYm9keSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LWJvZHknKTtcblx0XHRcdGFzc2VydC5vayhib2R5KTtcblx0XHRcdGFzc2VydC5vayhib2R5Py5xdWVyeVNlbGVjdG9yKCcucmVuZGVyZWQtbWFya2Rvd24nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHRoZSB0aGVtZWQgZm9yZWdyb3VuZCBmb3IgbWFya2Rvd24gbGlua3MnLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlldyh7IGNvbnRlbnQ6ICdbbGlua10oaHR0cHM6Ly9leGFtcGxlLmNvbSknIH0pKTtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaW50ZXJhY3RpdmUtc2Vzc2lvbicpO1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS10ZXh0TGluay1mb3JlZ3JvdW5kJywgJ3JnYigxLCAyLCAzKScpO1xuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQod2lkZ2V0LmRvbU5vZGUpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBsaW5rID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5yZW5kZXJlZC1tYXJrZG93biBhJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5rICYmIG1haW5XaW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShsaW5rKS5jb2xvciwgJ3JnYigxLCAyLCAzKScpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0Y29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBhcHByb3ZlIGFuZCByZWplY3QgYnV0dG9ucyBpbiBmb290ZXInLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1JldmlldygpKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLmxlbmd0aCA+PSAyLCAnc2hvdWxkIGhhdmUgYXQgbGVhc3QgYXBwcm92ZSBhbmQgcmVqZWN0IGJ1dHRvbnMnKTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXV0b3BpbG90JykpLCAnc2hvdWxkIGhhdmUgYXBwcm92ZSBidXR0b24nKTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnUmVqZWN0JykpLCAnc2hvdWxkIGhhdmUgcmVqZWN0IGJ1dHRvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGlkZXMgZmVlZGJhY2sgc2VjdGlvbiBpbml0aWFsbHkgd2hlbiBjYW5Qcm92aWRlRmVlZGJhY2sgYW5kIHBsYW5VcmkgYXJlIGJvdGggc2V0JywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblxuXHRcdFx0Y29uc3QgZmVlZGJhY2tTZWN0aW9uID0gZ2V0RmVlZGJhY2tTZWN0aW9uKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soZmVlZGJhY2tTZWN0aW9uKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZWVkYmFja1NlY3Rpb24uc3R5bGUuZGlzcGxheSwgJ25vbmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIGZlZWRiYWNrIHNlY3Rpb24gYnkgZGVmYXVsdCB3aGVuIGNhblByb3ZpZGVGZWVkYmFjayBpcyB0cnVlIGFuZCB0aGVyZSBpcyBubyBwbGFuVXJpJywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoeyBjYW5Qcm92aWRlRmVlZGJhY2s6IHRydWUgfSkpO1xuXG5cdFx0XHRjb25zdCBmZWVkYmFja1NlY3Rpb24gPSBnZXRGZWVkYmFja1NlY3Rpb24od2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhmZWVkYmFja1NlY3Rpb24pO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZlZWRiYWNrU2VjdGlvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBSZXZpZXcgYnV0dG9uIHdoZW4gcGxhblVyaSBpcyBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKSk7XG5cblx0XHRcdGNvbnN0IHJldmlld0J1dHRvbiA9IGdldFJldmlld0J1dHRvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJldmlld0J1dHRvbiwgJ1JldmlldyBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZW5kZXIgUmV2aWV3IGJ1dHRvbiB3aGVuIHBsYW5VcmkgaXMgYWJzZW50JywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoeyBjYW5Qcm92aWRlRmVlZGJhY2s6IHRydWUgfSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmV2aWV3QnV0dG9uKHdpZGdldCksIG51bGwsICdSZXZpZXcgYnV0dG9uIHNob3VsZCBub3QgZXhpc3Qgd2l0aG91dCBwbGFuVXJpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZW5kZXIgUHJvdmlkZSBGZWVkYmFjayBmb290ZXIgYnV0dG9uIChsZWdhY3kgZW50cnkgcmVtb3ZlZCknLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCkpO1xuXG5cdFx0XHRjb25zdCBidXR0b25zID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnUHJvdmlkZSBGZWVkYmFjaycpKSwgJ3Nob3VsZCBub3QgaGF2ZSBsZWdhY3kgUHJvdmlkZSBGZWVkYmFjayBidXR0b24nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1N1Ym1pdCByZXN1bHRzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2NsaWNraW5nIGFwcHJvdmUgc3VibWl0cyBhY3Rpb24gd2l0aCBsYWJlbCBhbmQgcmVqZWN0ZWQ9ZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlldyh7IGFjdGlvbnM6IFt7IGxhYmVsOiAnR28nLCBkZWZhdWx0OiB0cnVlIH1dIH0pKTtcblxuXHRcdFx0Y29uc3QgYXBwcm92ZUJ1dHRvbiA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ0dvJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFwcHJvdmVCdXR0b24pO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3VibWl0UmVzdWx0LCB7IGFjdGlvbjogJ0dvJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xpY2tpbmcgcmVqZWN0IHN1Ym1pdHMgcmVqZWN0ZWQ9dHJ1ZScsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KCkpO1xuXG5cdFx0XHRjb25zdCByZWplY3RCdXR0b24gPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCkuZmluZChiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdSZWplY3QnKSk7XG5cdFx0XHRhc3NlcnQub2socmVqZWN0QnV0dG9uKTtcblx0XHRcdHJlamVjdEJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3VibWl0UmVzdWx0LCB7IHJlamVjdGVkOiB0cnVlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG91YmxlLWNsaWNrIGRvZXMgbm90IHN1Ym1pdCB0d2ljZScsICgpID0+IHtcblx0XHRcdGxldCBzdWJtaXRDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdFx0Y29uc3Qgb3B0aW9uczogSUNoYXRQbGFuUmV2aWV3UGFydE9wdGlvbnMgPSB7XG5cdFx0XHRcdG9uU3VibWl0OiAoKSA9PiB7IHN1Ym1pdENvdW50Kys7IH1cblx0XHRcdH07XG5cdFx0XHR3aWRnZXQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRQbGFuUmV2aWV3UGFydCxcblx0XHRcdFx0Y3JlYXRlTW9ja1JldmlldygpLFxuXHRcdFx0XHRjcmVhdGVNb2NrQ29udGV4dCgpLFxuXHRcdFx0XHRvcHRpb25zXG5cdFx0XHQpKTtcblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3aWRnZXQuZG9tTm9kZSk7XG5cblx0XHRcdGNvbnN0IGFwcHJvdmVCdXR0b24gPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCkuZmluZChiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBdXRvcGlsb3QnKSk7XG5cdFx0XHRhcHByb3ZlQnV0dG9uIS5jbGljaygpO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdENvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2J1dHRvbnMgYXJlIHJlbW92ZWQgYWZ0ZXIgc3VibWlzc2lvbicsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KCkpO1xuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXV0b3BpbG90JykpO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy11c2VkJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5sZW5ndGgsIDAsICdmb290ZXIgYnV0dG9ucyBzaG91bGQgYmUgY2xlYXJlZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRmVlZGJhY2sgbW9kZScsICgpID0+IHtcblx0XHR0ZXN0KCdjbGlja2luZyBSZXZpZXcgYnV0dG9uIG9wZW5zIHRoZSBwbGFuIGVkaXRvciBhbmQgc2hvd3MgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKSk7XG5cdFx0XHRjb25zdCBvcGVuRWRpdG9yU3B5ID0gc2lub24uc3B5KGxhc3RFZGl0b3JTZXJ2aWNlISwgJ29wZW5FZGl0b3InKTtcblxuXHRcdFx0Y29uc3QgcmV2aWV3QnV0dG9uID0gZ2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhO1xuXHRcdFx0cmV2aWV3QnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcGVuRWRpdG9yU3B5LmNhbGxlZE9uY2UsIHRydWUsICdwbGFuIGZpbGUgc2hvdWxkIG9wZW4gaW4gYW4gZWRpdG9yJyk7XG5cdFx0XHRjb25zdCBlZGl0b3JJbnB1dCA9IG9wZW5FZGl0b3JTcHkuZmlyc3RDYWxsLmFyZ3NbMF0gYXMgSVJlc291cmNlRWRpdG9ySW5wdXQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9ySW5wdXQucmVzb3VyY2U/LnRvU3RyaW5nKCksICdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JJbnB1dC5vcHRpb25zPy5waW5uZWQsIHRydWUpO1xuXG5cdFx0XHQvLyBGZWVkYmFjayBzZWN0aW9uIHNob3VsZCBub3cgYmUgdmlzaWJsZS5cblx0XHRcdGNvbnN0IGZlZWRiYWNrU2VjdGlvbiA9IGdldEZlZWRiYWNrU2VjdGlvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZlZWRiYWNrU2VjdGlvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdmZWVkYmFjayBzZWN0aW9uIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cblx0XHRcdC8vIEZvb3RlciBzaG91bGQgaGF2ZSBTdWJtaXQgRmVlZGJhY2sgKyBSZWplY3QgKG5vIGFwcHJvdmUsIG5vIFByb3ZpZGUgRmVlZGJhY2spLlxuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpLCAnc2hvdWxkIGhhdmUgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdSZWplY3QnKSksICdzaG91bGQgc3RpbGwgaGF2ZSBSZWplY3QgYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soIWJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBdXRvcGlsb3QnKSksICdhcHByb3ZlIGJ1dHRvbiBzaG91bGQgYmUgaGlkZGVuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3QgYnV0dG9uIHJlbWFpbnMgdmlzaWJsZSBpbiBmZWVkYmFjayBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9ucy5zb21lKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ1JlamVjdCcpKSwgJ3JlamVjdCBidXR0b24gc2hvdWxkIHN0aWxsIGJlIHZpc2libGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsaWNraW5nIFJldmlldyBidXR0b24gb3BlbnMgZmVlZGJhY2sgc2VjdGlvbiBhbmQgc2hvd3MgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKSk7XG5cblx0XHRcdGNvbnN0IHJldmlld0J1dHRvbiA9IGdldFJldmlld0J1dHRvbih3aWRnZXQpITtcblx0XHRcdHJldmlld0J1dHRvbi5jbGljaygpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHQvLyBGZWVkYmFjayBzZWN0aW9uIHNob3VsZCBub3cgYmUgdmlzaWJsZS5cblx0XHRcdGNvbnN0IGZlZWRiYWNrU2VjdGlvbiA9IGdldEZlZWRiYWNrU2VjdGlvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZlZWRiYWNrU2VjdGlvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdmZWVkYmFjayBzZWN0aW9uIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cblx0XHRcdC8vIEZvb3RlciBzaG91bGQgaGF2ZSBTdWJtaXQgRmVlZGJhY2sgKyBSZWplY3QgKG5vIGFwcHJvdmUsIG5vIFByb3ZpZGUgRmVlZGJhY2spLlxuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpLCAnc2hvdWxkIGhhdmUgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdSZWplY3QnKSksICdzaG91bGQgc3RpbGwgaGF2ZSBSZWplY3QgYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soIWJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBdXRvcGlsb3QnKSksICdhcHByb3ZlIGJ1dHRvbiBzaG91bGQgYmUgaGlkZGVuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3QgYnV0dG9uIHJlbWFpbnMgdmlzaWJsZSBpbiBmZWVkYmFjayBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9ucy5zb21lKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ1JlamVjdCcpKSwgJ3JlamVjdCBidXR0b24gc2hvdWxkIHN0aWxsIGJlIHZpc2libGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsaWNraW5nIFJldmlldyBidXR0b24gb3BlbnMgZmVlZGJhY2sgc2VjdGlvbiBhbmQgc2hvd3MgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKSk7XG5cblx0XHRcdGNvbnN0IHJldmlld0J1dHRvbiA9IGdldFJldmlld0J1dHRvbih3aWRnZXQpITtcblx0XHRcdHJldmlld0J1dHRvbi5jbGljaygpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHQvLyBGZWVkYmFjayBzZWN0aW9uIHNob3VsZCBub3cgYmUgdmlzaWJsZS5cblx0XHRcdGNvbnN0IGZlZWRiYWNrU2VjdGlvbiA9IGdldEZlZWRiYWNrU2VjdGlvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZlZWRiYWNrU2VjdGlvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdmZWVkYmFjayBzZWN0aW9uIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cblx0XHRcdC8vIEZvb3RlciBzaG91bGQgaGF2ZSBTdWJtaXQgRmVlZGJhY2sgKyBSZWplY3QgKG5vIGFwcHJvdmUsIG5vIFByb3ZpZGUgRmVlZGJhY2spLlxuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpLCAnc2hvdWxkIGhhdmUgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdSZWplY3QnKSksICdzaG91bGQgc3RpbGwgaGF2ZSBSZWplY3QgYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soIWJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBdXRvcGlsb3QnKSksICdhcHByb3ZlIGJ1dHRvbiBzaG91bGQgYmUgaGlkZGVuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3QgYnV0dG9uIHJlbWFpbnMgdmlzaWJsZSBpbiBmZWVkYmFjayBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9ucy5zb21lKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ1JlamVjdCcpKSwgJ3JlamVjdCBidXR0b24gc2hvdWxkIHN0aWxsIGJlIHZpc2libGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsaWNraW5nIFJldmlldyB3aGlsZSBpbiBmZWVkYmFjayBtb2RlIHJlb3BlbnMgdGhlIHBsYW4gZWRpdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblx0XHRcdGNvbnN0IG9wZW5FZGl0b3JTcHkgPSBzaW5vbi5zcHkobGFzdEVkaXRvclNlcnZpY2UhLCAnb3BlbkVkaXRvcicpO1xuXG5cdFx0XHRjb25zdCByZXZpZXdCdXR0b24gPSBnZXRSZXZpZXdCdXR0b24od2lkZ2V0KSE7XG5cdFx0XHRyZXZpZXdCdXR0b24uY2xpY2soKTtcblx0XHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdFx0cmV2aWV3QnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGZlZWRiYWNrU2VjdGlvbiA9IGdldEZlZWRiYWNrU2VjdGlvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZlZWRiYWNrU2VjdGlvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdmZWVkYmFjayBzZWN0aW9uIHNob3VsZCByZW1haW4gdmlzaWJsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5FZGl0b3JTcHkuY2FsbENvdW50LCAyLCAnZWFjaCBjbGljayBzaG91bGQgcmV2ZWFsIHRoZSBwbGFuIGVkaXRvcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwcm92aW5nIHdpdGggdGV4dGFyZWEgY29udGVudCBzZW5kcyBhcHByb3ZhbCArIGZlZWRiYWNrJywgKCkgPT4ge1xuXHRcdFx0Ly8gY2FuUHJvdmlkZUZlZWRiYWNrIHdpdGhvdXQgcGxhblVyaSBzaG93cyB0aGUgdGV4dGFyZWEgYWxvbmdzaWRlXG5cdFx0XHQvLyB0aGUgcmVndWxhciBBcHByb3ZlL1JlamVjdCBidXR0b25zOyB0eXBlZCBmZWVkYmFjayByaWRlcyBhbG9uZ1xuXHRcdFx0Ly8gd2l0aCB3aGljaGV2ZXIgYWN0aW9uIHRoZSB1c2VyIHBpY2tzLlxuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoeyBjYW5Qcm92aWRlRmVlZGJhY2s6IHRydWUgfSkpO1xuXG5cdFx0XHRjb25zdCB0ZXh0YXJlYSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrLXRleHRhcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudDtcblx0XHRcdGFzc2VydC5vayh0ZXh0YXJlYSk7XG5cdFx0XHR0ZXh0YXJlYS52YWx1ZSA9ICdQbGVhc2UgYWxzbyBhZGQgdGVzdHMnO1xuXHRcdFx0dGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JykpO1xuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXV0b3BpbG90JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFwcHJvdmVCdXR0b24sICdBcHByb3ZlIGJ1dHRvbiBzaG91bGQgYmUgYXZhaWxhYmxlIGV2ZW4gd2l0aCBjYW5Qcm92aWRlRmVlZGJhY2snKTtcblx0XHRcdGFwcHJvdmVCdXR0b24hLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwge1xuXHRcdFx0XHRhY3Rpb246ICdBdXRvcGlsb3QnLFxuXHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRcdGZlZWRiYWNrOiAnUGxlYXNlIGFsc28gYWRkIHRlc3RzJyxcblx0XHRcdFx0ZmVlZGJhY2tPdmVyYWxsOiAnUGxlYXNlIGFsc28gYWRkIHRlc3RzJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0aW5nIHdpdGggdGV4dGFyZWEgY29udGVudCBzZW5kcyByZWplY3Rpb24gKyBmZWVkYmFjaycsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgY2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlIH0pKTtcblxuXHRcdFx0Y29uc3QgdGV4dGFyZWEgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjay10ZXh0YXJlYScpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG5cdFx0XHR0ZXh0YXJlYS52YWx1ZSA9ICdOb3QgdGhlIHJpZ2h0IGFwcHJvYWNoJztcblx0XHRcdHRleHRhcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcpKTtcblxuXHRcdFx0Y29uc3QgcmVqZWN0QnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnUmVqZWN0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlamVjdEJ1dHRvbik7XG5cdFx0XHRyZWplY3RCdXR0b24hLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwge1xuXHRcdFx0XHRyZWplY3RlZDogdHJ1ZSxcblx0XHRcdFx0ZmVlZGJhY2s6ICdOb3QgdGhlIHJpZ2h0IGFwcHJvYWNoJyxcblx0XHRcdFx0ZmVlZGJhY2tPdmVyYWxsOiAnTm90IHRoZSByaWdodCBhcHByb2FjaCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1Ym1pdCBpcyBkaXNhYmxlZCB3aGVuIGZlZWRiYWNrIHRleHRhcmVhIGlzIGVtcHR5IGFuZCBubyBpbmxpbmUgY29tbWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCkpO1xuXG5cdFx0XHRnZXRSZXZpZXdCdXR0b24od2lkZ2V0KSEuY2xpY2soKTtcblx0XHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdFx0Y29uc3Qgc3VibWl0QnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1Ym1pdEJ1dHRvbik7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0QnV0dG9uIS5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJyksICdTdWJtaXQgRmVlZGJhY2sgc2hvdWxkIGJlIGRpc2FibGVkIHdoZW4gbm90aGluZyB0byBzdWJtaXQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0lubGluZSBjb21tZW50cyBsaXN0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlbmRlcnMgY29tbWVudHMgbGlzdCBhbmQgdXBkYXRlcyBTdWJtaXQgRmVlZGJhY2sgY291bnQgd2hlbiBzZXJ2aWNlIGhhcyBpdGVtcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJldmlldyA9IGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KHJldmlldyk7XG5cblx0XHRcdC8vIEVudGVyIGZlZWRiYWNrIG1vZGUgc28gdGhlIGZlZWRiYWNrIHNlY3Rpb24gaXMgdmlzaWJsZS5cblx0XHRcdGdldFJldmlld0J1dHRvbih3aWRnZXQpIS5jbGljaygpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbGFzdEZlZWRiYWNrU2VydmljZSE7XG5cdFx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnJldml2ZShyZXZpZXcucGxhblVyaSEpO1xuXHRcdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCA1LCAxLCAnRml4IHRoaXMgc3RlcCcpO1xuXHRcdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxMiwgMSwgJ1Jld29yZCB0aGlzJyk7XG5cblx0XHRcdGNvbnN0IHJvd3MgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1wbGFuLXJldmlldy1jb21tZW50LXJvdycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvd3MubGVuZ3RoLCAyLCAnc2hvdWxkIHJlbmRlciBvbmUgcm93IHBlciBpbmxpbmUgY29tbWVudCcpO1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdXR0b24gPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCkuZmluZChiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdTdWJtaXQgRmVlZGJhY2snKSk7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0QnV0dG9uKTtcblx0XHRcdGFzc2VydC5vaygoc3VibWl0QnV0dG9uIS50ZXh0Q29udGVudCA/PyAnJykuaW5jbHVkZXMoJygyKScpLCAnU3VibWl0IGxhYmVsIHNob3VsZCByZWZsZWN0IGlubGluZSBjb3VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGl2ZSBjb21tZW50cyBmcm9tIHRoZSBNYXJrZG93biBlZGl0b3IgdXBkYXRlIHRoZSB3aWRnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcpO1xuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3QgY29tbWVudHMgPSBbe1xuXHRcdFx0XHRpZDogJ2xpdmUtY29tbWVudCcsXG5cdFx0XHRcdHJlc291cmNlOiBwbGFuVXJpLFxuXHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogNSxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA1LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMTAsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJvZHk6ICdOZXcgbGl2ZSBjb21tZW50Jyxcblx0XHRcdH1dO1xuXHRcdFx0c3RvcmUuYWRkKGxhc3RDb21tZW50c0JyaWRnZSEucmVnaXN0ZXJQcm92aWRlcih7XG5cdFx0XHRcdHByaW9yaXR5OiAxMDAsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ29tbWVudHM6IGNoYW5nZWQuZXZlbnQsXG5cdFx0XHRcdG9uRGlkUmV2ZWFsQ29tbWVudDogVlNDb2RlRXZlbnQuTm9uZSxcblx0XHRcdFx0YWNjZXB0c0NvbW1lbnRzOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRnZXRDb21tZW50czogKCkgPT4gY29tbWVudHMsXG5cdFx0XHRcdGFkZENvbW1lbnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0ZGVsZXRlQ29tbWVudDogKCkgPT4geyB9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y2hhbmdlZC5maXJlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyb3dzOiB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1wbGFuLXJldmlldy1jb21tZW50LXJvdycpLmxlbmd0aCxcblx0XHRcdFx0c3VibWl0TGFiZWw6IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGJ1dHRvbiA9PiBidXR0b24udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdTdWJtaXQgRmVlZGJhY2snKSk/LnRleHRDb250ZW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyb3dzOiAxLFxuXHRcdFx0XHRzdWJtaXRMYWJlbDogJ1N1Ym1pdCBGZWVkYmFjayAoMSknLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXZlYWxzIGEgcmVsYXRlZCBjb21tZW50IGluIGl0cyBvd24gcmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcpO1xuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRjb25zdCByZWxhdGVkVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlbGF0ZWQudHMnKTtcblx0XHRcdGNvbnN0IGNoYW5nZWQgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0XHRzdG9yZS5hZGQobGFzdENvbW1lbnRzQnJpZGdlIS5yZWdpc3RlclByb3ZpZGVyKHtcblx0XHRcdFx0cHJpb3JpdHk6IDEwMCxcblx0XHRcdFx0b25EaWRDaGFuZ2VDb21tZW50czogY2hhbmdlZC5ldmVudCxcblx0XHRcdFx0b25EaWRSZXZlYWxDb21tZW50OiBWU0NvZGVFdmVudC5Ob25lLFxuXHRcdFx0XHRhY2NlcHRzQ29tbWVudHM6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldENvbW1lbnRzOiAoKSA9PiBbe1xuXHRcdFx0XHRcdGlkOiAncmVsYXRlZC1jb21tZW50Jyxcblx0XHRcdFx0XHRyZXNvdXJjZTogcmVsYXRlZFVyaSxcblx0XHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDcsIHN0YXJ0Q29sdW1uOiAzLCBlbmRMaW5lTnVtYmVyOiA3LCBlbmRDb2x1bW46IDggfSxcblx0XHRcdFx0XHRib2R5OiAnVXBkYXRlIHRoaXMgc291cmNlJyxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGFkZENvbW1lbnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0ZGVsZXRlQ29tbWVudDogKCkgPT4geyB9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y2hhbmdlZC5maXJlKCk7XG5cdFx0XHRjb25zdCBvcGVuRWRpdG9yU3B5ID0gc2lub24uc3B5KGxhc3RFZGl0b3JTZXJ2aWNlISwgJ29wZW5FZGl0b3InKTtcblxuXHRcdFx0KHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LWNvbW1lbnQtcmV2ZWFsJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQpLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGVkaXRvcklucHV0ID0gb3BlbkVkaXRvclNweS5sYXN0Q2FsbC5hcmdzWzBdIGFzIElSZXNvdXJjZUVkaXRvcklucHV0O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlc291cmNlOiBlZGl0b3JJbnB1dC5yZXNvdXJjZT8udG9TdHJpbmcoKSxcblx0XHRcdFx0b3ZlcnJpZGU6IGVkaXRvcklucHV0Lm9wdGlvbnM/Lm92ZXJyaWRlLFxuXHRcdFx0XHRzZWxlY3Rpb246IChlZGl0b3JJbnB1dC5vcHRpb25zIGFzIElUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk/LnNlbGVjdGlvbixcblx0XHRcdFx0cGxhblJlc291cmNlOiBwbGFuVXJpLnRvU3RyaW5nKCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc291cmNlOiByZWxhdGVkVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdG92ZXJyaWRlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlbGVjdGlvbjogeyBzdGFydExpbmVOdW1iZXI6IDcsIHN0YXJ0Q29sdW1uOiAzIH0sXG5cdFx0XHRcdHBsYW5SZXNvdXJjZTogcGxhblVyaS50b1N0cmluZygpLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmxpbmUgY29tbWVudHMgYWxvbmUgYXJlIGVub3VnaCB0byBlbmFibGUgU3VibWl0IEZlZWRiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBsYXN0RmVlZGJhY2tTZXJ2aWNlITtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDEsIDEsICdIaScpO1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdXR0b24gPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCkuZmluZChiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdTdWJtaXQgRmVlZGJhY2snKSk7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0QnV0dG9uKTtcblx0XHRcdGFzc2VydC5vayghc3VibWl0QnV0dG9uIS5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJyksICdTdWJtaXQgRmVlZGJhY2sgc2hvdWxkIGJlIGVuYWJsZWQgd2l0aCBvbmUgaW5saW5lIGNvbW1lbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VkaXRvciB0b29sYmFyIGZlZWRiYWNrIHN1Ym1pc3Npb24gdXBkYXRlcyB0aGUgb3JpZ2luYWwgcGxhbiB3aWRnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcsIHVuZGVmaW5lZCwgKCkgPT4gd2lkZ2V0LmRpc3Bvc2UoKSk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBsYXN0RmVlZGJhY2tTZXJ2aWNlITtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDUsIDEsICdGaXggdGhpcyBzdGVwJyk7XG5cdFx0XHRsZXQgY29tbWVudHNDaGFuZ2VkID0gMDtcblx0XHRcdHN0b3JlLmFkZChsYXN0Q29tbWVudHNCcmlkZ2UhLm9uRGlkQ2hhbmdlQ29tbWVudHMoKCkgPT4gY29tbWVudHNDaGFuZ2VkKyspKTtcblxuXHRcdFx0Y29uc3QgZGlkU3VibWl0ID0gYXdhaXQgc2VydmljZS5zdWJtaXRBbGxGZWVkYmFjayhwbGFuVXJpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN1Ym1pdFJlc3VsdDogbGFzdFN1Ym1pdFJlc3VsdCxcblx0XHRcdFx0ZGlkU3VibWl0LFxuXHRcdFx0XHRjb21tZW50c0NoYW5nZWQsXG5cdFx0XHRcdHJlbWFpbmluZ0NvbW1lbnRzOiBsYXN0Q29tbWVudHNCcmlkZ2UhLmdldENvbW1lbnRzKHBsYW5VcmkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdWJtaXRSZXN1bHQ6IHtcblx0XHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZmVlZGJhY2s6ICdJbmxpbmUgY29tbWVudHMgb24gYHBsYW4ubWRgOlxcbi0gKipMaW5lIDU6KiogRml4IHRoaXMgc3RlcCcsXG5cdFx0XHRcdFx0ZmVlZGJhY2tPdmVyYWxsOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZmVlZGJhY2tJbmxpbmVNYXJrZG93bjogJ0lubGluZSBjb21tZW50cyBvbiBgcGxhbi5tZGA6XFxuLSAqKkxpbmUgNToqKiBGaXggdGhpcyBzdGVwJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlkU3VibWl0OiB0cnVlLFxuXHRcdFx0XHRjb21tZW50c0NoYW5nZWQ6IDIsXG5cdFx0XHRcdHJlbWFpbmluZ0NvbW1lbnRzOiBbXSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy11c2VkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZWRpdG9yIHRvb2xiYXIgc3VibWl0cyBhbiBvdmVyYWxsIGNvbW1lbnQgd2l0aG91dCBpbmxpbmUgY29tbWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcpO1xuXG5cdFx0XHRjb25zdCB0ZXh0YXJlYSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrLXRleHRhcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudDtcblx0XHRcdHRleHRhcmVhLnZhbHVlID0gJ1BsZWFzZSBzaW1wbGlmeSB0aGUgcm9sbG91dCc7XG5cdFx0XHR0ZXh0YXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnKSk7XG5cblx0XHRcdGF3YWl0IGxhc3RGZWVkYmFja1NlcnZpY2UhLnN1Ym1pdEFsbEZlZWRiYWNrKFVSSS5yZXZpdmUocmV2aWV3LnBsYW5VcmkhKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwge1xuXHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRcdGZlZWRiYWNrOiAnUGxlYXNlIHNpbXBsaWZ5IHRoZSByb2xsb3V0Jyxcblx0XHRcdFx0ZmVlZGJhY2tPdmVyYWxsOiAnUGxlYXNlIHNpbXBsaWZ5IHRoZSByb2xsb3V0Jyxcblx0XHRcdFx0ZmVlZGJhY2tJbmxpbmVNYXJrZG93bjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21tZW50cyBhZGRlZCB3aGlsZSB0aGUgcGxhbiBzYXZlIGlzIHBlbmRpbmcgcmVtYWluIHVuc3VibWl0dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3QgY29tbWVudHM6IElBZ2VudEVkaXRvckNvbW1lbnRbXSA9IFt7XG5cdFx0XHRcdGlkOiAnc3VibWl0dGVkJyxcblx0XHRcdFx0cmVzb3VyY2U6IHBsYW5VcmksXG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogNSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDUsIGVuZENvbHVtbjogMiB9LFxuXHRcdFx0XHRib2R5OiAnU3VibWl0IHRoaXMnLFxuXHRcdFx0fV07XG5cdFx0XHRzdG9yZS5hZGQobGFzdENvbW1lbnRzQnJpZGdlIS5yZWdpc3RlclByb3ZpZGVyKHtcblx0XHRcdFx0cHJpb3JpdHk6IDEwMCxcblx0XHRcdFx0b25EaWRDaGFuZ2VDb21tZW50czogY2hhbmdlZC5ldmVudCxcblx0XHRcdFx0b25EaWRSZXZlYWxDb21tZW50OiBWU0NvZGVFdmVudC5Ob25lLFxuXHRcdFx0XHRhY2NlcHRzQ29tbWVudHM6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldENvbW1lbnRzOiAoKSA9PiBjb21tZW50cyxcblx0XHRcdFx0YWRkQ29tbWVudDogKCkgPT4geyB9LFxuXHRcdFx0XHRkZWxldGVDb21tZW50OiAoX3Jlc291cmNlLCBpZCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gY29tbWVudHMuZmluZEluZGV4KGNvbW1lbnQgPT4gY29tbWVudC5pZCA9PT0gaWQpO1xuXHRcdFx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdGNvbW1lbnRzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y2hhbmdlZC5maXJlKCk7XG5cdFx0XHRjb25zdCBzYXZlRGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4oKTtcblx0XHRcdHNpbm9uLnN0dWIobGFzdFRleHRGaWxlU2VydmljZSEsICdpc0RpcnR5JykucmV0dXJucyh0cnVlKTtcblx0XHRcdHNpbm9uLnN0dWIobGFzdFRleHRGaWxlU2VydmljZSEsICdzYXZlJykucmV0dXJucyhzYXZlRGVmZXJyZWQucCk7XG5cblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGJ1dHRvbiA9PiBidXR0b24udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdTdWJtaXQgRmVlZGJhY2snKSkhO1xuXHRcdFx0c3VibWl0QnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRjb21tZW50cy5wdXNoKHtcblx0XHRcdFx0aWQ6ICdhZGRlZC1kdXJpbmctc2F2ZScsXG5cdFx0XHRcdHJlc291cmNlOiBwbGFuVXJpLFxuXHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDgsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA4LCBlbmRDb2x1bW46IDIgfSxcblx0XHRcdFx0Ym9keTogJ0tlZXAgdGhpcycsXG5cdFx0XHR9KTtcblx0XHRcdGNoYW5nZWQuZmlyZSgpO1xuXHRcdFx0c2F2ZURlZmVycmVkLmNvbXBsZXRlKHBsYW5VcmkpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3VibWl0dGVkRmVlZGJhY2s6IGxhc3RTdWJtaXRSZXN1bHQ/LmZlZWRiYWNrLFxuXHRcdFx0XHRyZW1haW5pbmdDb21tZW50SWRzOiBsYXN0Q29tbWVudHNCcmlkZ2UhLmdldENvbW1lbnRzKHBsYW5VcmksIHRydWUpLm1hcChjb21tZW50ID0+IGNvbW1lbnQuaWQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdWJtaXR0ZWRGZWVkYmFjazogJ0lubGluZSBjb21tZW50cyBvbiBgcGxhbi5tZGA6XFxuLSAqKkxpbmUgNToqKiBTdWJtaXQgdGhpcycsXG5cdFx0XHRcdHJlbWFpbmluZ0NvbW1lbnRJZHM6IFsnYWRkZWQtZHVyaW5nLXNhdmUnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5saW5lIGNvbW1lbnRzIGF1dG8tcHJvbW90ZSBpbnRvIHJldmlldyBtb2RlIGV2ZW4gYmVmb3JlIFJldmlldyBidXR0b24gaXMgY2xpY2tlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJldmlldyA9IGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KHJldmlldyk7XG5cblx0XHRcdC8vIFNlY3Rpb24gc3RhcnRzIGhpZGRlbiB3aGVuIHBsYW5VcmkgaXMgcHJlc2VudC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRGZWVkYmFja1NlY3Rpb24od2lkZ2V0KS5zdHlsZS5kaXNwbGF5LCAnbm9uZScpO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbGFzdEZlZWRiYWNrU2VydmljZSE7XG5cdFx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnJldml2ZShyZXZpZXcucGxhblVyaSEpO1xuXHRcdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxLCAxLCAnU3VycHJpc2UgY29tbWVudCcpO1xuXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZ2V0RmVlZGJhY2tTZWN0aW9uKHdpZGdldCkuc3R5bGUuZGlzcGxheSwgJ25vbmUnLCAnc2VjdGlvbiBzaG91bGQgYXV0by1vcGVuIHdoZW4gY29tbWVudHMgYXJyaXZlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZXItcm93IHJlbW92ZSBidXR0b24gcmVtb3ZlcyBvbmx5IHRoYXQgY29tbWVudCBmcm9tIHRoZSBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBsYXN0RmVlZGJhY2tTZXJ2aWNlITtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDUsIDEsICdGaXggdGhpcycpO1xuXHRcdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxMiwgMSwgJ1Jld29yZCcpO1xuXHRcdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAyMCwgMSwgJ0FkZCBkZXRhaWwnKTtcblxuXHRcdFx0Y29uc3QgcmVtb3ZlQnV0dG9ucyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXBsYW4tcmV2aWV3LWNvbW1lbnQtcmVtb3ZlJykgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlQnV0dG9ucy5sZW5ndGgsIDMsICdzaG91bGQgcmVuZGVyIG9uZSByZW1vdmUgYnV0dG9uIHBlciByb3cnKTtcblxuXHRcdFx0Ly8gUmVtb3ZlIHRoZSBtaWRkbGUgb25lLlxuXHRcdFx0cmVtb3ZlQnV0dG9uc1sxXS5jbGljaygpO1xuXG5cdFx0XHRjb25zdCByZW1haW5pbmcgPSBzZXJ2aWNlLmdldEZlZWRiYWNrKHBsYW5VcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1haW5pbmcubWFwKGkgPT4gaS50ZXh0KSwgWydGaXggdGhpcycsICdBZGQgZGV0YWlsJ10sICdtaWRkbGUgY29tbWVudCBzaG91bGQgYmUgcmVtb3ZlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xlYXIgQWxsIGJ1dHRvbiBpcyBoaWRkZW4gd2hlbiB0aGVyZSBhcmUgbm8gaW5saW5lIGNvbW1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGNsZWFyQWxsID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2stY2xlYXItYWxsJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soY2xlYXJBbGwsICdDbGVhciBBbGwgYnV0dG9uIHNob3VsZCBiZSBpbiB0aGUgRE9NJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYXJBbGwuc3R5bGUuZGlzcGxheSwgJ25vbmUnLCAnQ2xlYXIgQWxsIHNob3VsZCBiZSBoaWRkZW4gd2hlbiBsaXN0IGlzIGVtcHR5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDbGVhciBBbGwgYnV0dG9uIHJlbW92ZXMgYWxsIGlubGluZSBjb21tZW50cyBhZnRlciBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKTtcblx0XHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBuZXcgVGVzdERpYWxvZ1NlcnZpY2UoeyBjb25maXJtZWQ6IHRydWUgfSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3LCBkaWFsb2dTZXJ2aWNlKTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBsYXN0RmVlZGJhY2tTZXJ2aWNlITtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDEsIDEsICdhJyk7XG5cdFx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDIsIDEsICdiJyk7XG5cblx0XHRcdGNvbnN0IGNsZWFyQWxsID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2stY2xlYXItYWxsJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soY2xlYXJBbGwsICdDbGVhciBBbGwgYnV0dG9uIHNob3VsZCBiZSBwcmVzZW50Jyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY2xlYXJBbGwuc3R5bGUuZGlzcGxheSwgJ25vbmUnLCAnQ2xlYXIgQWxsIHNob3VsZCBiZSB2aXNpYmxlIHdoZW4gbGlzdCBoYXMgaXRlbXMnKTtcblx0XHRcdGNsZWFyQWxsLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEZlZWRiYWNrKHBsYW5VcmkpLmxlbmd0aCwgMCwgJ2FsbCBjb21tZW50cyBzaG91bGQgYmUgY2xlYXJlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xlYXIgQWxsIGNhbmNlbGxhdGlvbiBrZWVwcyBpbmxpbmUgY29tbWVudHMgaW50YWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gbmV3IFRlc3REaWFsb2dTZXJ2aWNlKHsgY29uZmlybWVkOiBmYWxzZSB9KTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcsIGRpYWxvZ1NlcnZpY2UpO1xuXG5cdFx0XHRnZXRSZXZpZXdCdXR0b24od2lkZ2V0KSEuY2xpY2soKTtcblx0XHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGxhc3RGZWVkYmFja1NlcnZpY2UhO1xuXHRcdFx0Y29uc3QgcGxhblVyaSA9IFVSSS5yZXZpdmUocmV2aWV3LnBsYW5VcmkhKTtcblx0XHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMSwgMSwgJ2EnKTtcblx0XHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMiwgMSwgJ2InKTtcblxuXHRcdFx0Y29uc3QgY2xlYXJBbGwgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjay1jbGVhci1hbGwnKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGNsZWFyQWxsLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEZlZWRiYWNrKHBsYW5VcmkpLmxlbmd0aCwgMiwgJ2NvbW1lbnRzIHNob3VsZCBiZSB1bnRvdWNoZWQgd2hlbiB1c2VyIGNhbmNlbHMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0NvbGxhcHNlZCBzdGF0ZScsICgpID0+IHtcblx0XHR0ZXN0KCd0b2dnbGVzIGNvbGxhcHNlZCBzdGF0ZSB2aWEgY2hldnJvbiBidXR0b24nLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1JldmlldygpKTtcblxuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy10aXRsZS1pY29uLWJ1dHRvbjpsYXN0LWNoaWxkJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soY29sbGFwc2VCdXR0b24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxhcHNlQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAndHJ1ZScpO1xuXG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy1jb2xsYXBzZWQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGFwc2VCdXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksICdmYWxzZScpO1xuXG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXHRcdFx0YXNzZXJ0Lm9rKCF3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcGxhbi1yZXZpZXctY29sbGFwc2VkJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxhcHNlQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAndHJ1ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29sbGFwc2VkIHZpZXcgc2hvd3MgaW5saW5lIGFjdGlvbnMgYW5kIGhpZGVzIGZvb3RlcicsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KCkpO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZUJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWljb24tYnV0dG9uOmxhc3QtY2hpbGQnKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGNvbGxhcHNlQnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGNvbnN0IGlubGluZUJ1dHRvbnMgPSBnZXRJbmxpbmVCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soaW5saW5lQnV0dG9ucy5sZW5ndGggPiAwLCAnc2hvdWxkIGhhdmUgaW5saW5lIGFjdGlvbiBidXR0b25zIHdoZW4gY29sbGFwc2VkJyk7XG5cblx0XHRcdGNvbnN0IGZvb3RlckJ1dHRvbnMgPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vdGVyQnV0dG9ucy5sZW5ndGgsIDAsICdmb290ZXIgYnV0dG9ucyBzaG91bGQgYmUgZW1wdHkgd2hlbiBjb2xsYXBzZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbGxhcHNlZCB2aWV3IGRvZXMgbm90IHNob3cgcmVqZWN0IGJ1dHRvbicsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KCkpO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZUJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWljb24tYnV0dG9uOmxhc3QtY2hpbGQnKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGNvbGxhcHNlQnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGNvbnN0IGlubGluZUJ1dHRvbnMgPSBnZXRJbmxpbmVCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soIWlubGluZUJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdSZWplY3QnKSksICdyZWplY3Qgc2hvdWxkIGJlIG9taXR0ZWQgaW4gY29sbGFwc2VkIHZpZXcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbGxhcHNpbmcgcHJlc2VydmVzIGZlZWRiYWNrIG1vZGUgYW5kIGlubGluZSBidXR0b25zIGtlZXAgU3VibWl0IEZlZWRiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblxuXHRcdFx0Ly8gRW50ZXIgZmVlZGJhY2sgbW9kZSB2aWEgdGhlIFJldmlldyBidXR0b24uXG5cdFx0XHRnZXRSZXZpZXdCdXR0b24od2lkZ2V0KSEuY2xpY2soKTtcblx0XHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdFx0Ly8gTm93IGNvbGxhcHNlLlxuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy10aXRsZS1pY29uLWJ1dHRvbjpsYXN0LWNoaWxkJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHQvLyBJbmxpbmUgYWN0aW9uIHNob3VsZCBiZSBTdWJtaXQgRmVlZGJhY2sgKHByZXNlcnZlcyB0aGUgbW9kZSkuXG5cdFx0XHRjb25zdCBpbmxpbmVCdXR0b25zID0gZ2V0SW5saW5lQnV0dG9ucyh3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGlubGluZUJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdTdWJtaXQgRmVlZGJhY2snKSksICdpbmxpbmUgYWN0aW9uIHNob3VsZCBiZSBTdWJtaXQgRmVlZGJhY2sgd2hlbiBmZWVkYmFjayBtb2RlIGlzIGFjdGl2ZScpO1xuXG5cdFx0XHQvLyBFeHBhbmQgYWdhaW4gXHUyMDE0IHN0aWxsIGluIGZlZWRiYWNrIG1vZGUuXG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXHRcdFx0Y29uc3QgZm9vdGVyQnV0dG9ucyA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhmb290ZXJCdXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpLCAnc3VibWl0IGZlZWRiYWNrIGJ1dHRvbiBzaG91bGQgcmVtYWluIGFmdGVyIGV4cGFuZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFmb290ZXJCdXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXV0b3BpbG90JykpLCAnYXBwcm92ZSBzaG91bGQgc3RpbGwgYmUgaGlkZGVuIGluIGZlZWRiYWNrIG1vZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgY29tbWVudCBhZGRlZCB3aGlsZSBjb2xsYXBzZWQgaXMgcmVmbGVjdGVkIGluIHRoZSBpbmxpbmUgYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblxuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy10aXRsZS1pY29uLWJ1dHRvbjpsYXN0LWNoaWxkJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHRsYXN0RmVlZGJhY2tTZXJ2aWNlIS5hZGRGZWVkYmFjayhVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISksIDMsIDEsICdDbGFyaWZ5IHRoaXMgc3RlcCcpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdXR0b24gPSBnZXRJbmxpbmVCdXR0b25zKHdpZGdldCkuZmluZChidXR0b24gPT4gYnV0dG9uLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1Ym1pdEJ1dHRvbj8udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCcoMSknKSwgJ2NvbGxhcHNlZCB3aWRnZXQgc2hvdWxkIHNob3cgdGhlIHBlbmRpbmcgY29tbWVudCBjb3VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZXMgZHJhZnQgY29sbGFwc2VkIHN0YXRlIGZyb20gQ2hhdFBsYW5SZXZpZXdEYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGF0YSA9IG5ldyBDaGF0UGxhblJldmlld0RhdGEoJ1RpdGxlJywgJ0NvbnRlbnQnLCBbeyBsYWJlbDogJ0dvJywgZGVmYXVsdDogdHJ1ZSB9XSwgZmFsc2UpO1xuXHRcdFx0ZGF0YS5kcmFmdENvbGxhcHNlZCA9IHRydWU7XG5cdFx0XHRjcmVhdGVXaWRnZXQoZGF0YSk7XG5cblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcGxhbi1yZXZpZXctY29sbGFwc2VkJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTXVsdGlwbGUgYWN0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdwZXJzaXN0cyBlZGl0ZWQgcGxhbiBjb250ZW50IGJlZm9yZSBzdWJtaXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGxhblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wbGFuLm1kJyk7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBuZXcgQ2hhdFBsYW5SZXZpZXdEYXRhKFxuXHRcdFx0XHQnUmV2aWV3IFBsYW4nLFxuXHRcdFx0XHQnIyBPcmlnaW5hbCBwbGFuJyxcblx0XHRcdFx0W3sgaWQ6ICdhcHByb3ZlJywgbGFiZWw6ICdBcHByb3ZlJywgZGVmYXVsdDogdHJ1ZSB9XSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0cGxhblVyaS50b0pTT04oKSxcblx0XHRcdCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblx0XHRcdHNpbm9uLnN0dWIobGFzdFRleHRGaWxlU2VydmljZSEsICdpc0RpcnR5JykucmV0dXJucyh0cnVlKTtcblx0XHRcdHNpbm9uLnN0dWIobGFzdFRleHRGaWxlU2VydmljZSEsICdzYXZlJykucmVzb2x2ZXMocGxhblVyaSk7XG5cdFx0XHRzaW5vbi5zdHViKGxhc3RUZXh0RmlsZVNlcnZpY2UhLCAncmVhZCcpLnJlc29sdmVzKHtcblx0XHRcdFx0cmVzb3VyY2U6IHBsYW5VcmksXG5cdFx0XHRcdG5hbWU6ICdwbGFuLm1kJyxcblx0XHRcdFx0c2l6ZTogMTMsXG5cdFx0XHRcdG10aW1lOiAxLFxuXHRcdFx0XHRjdGltZTogMSxcblx0XHRcdFx0ZXRhZzogJzEnLFxuXHRcdFx0XHRyZWFkb25seTogZmFsc2UsXG5cdFx0XHRcdGxvY2tlZDogZmFsc2UsXG5cdFx0XHRcdGV4ZWN1dGFibGU6IGZhbHNlLFxuXHRcdFx0XHRlbmNvZGluZzogJ3V0ZjgnLFxuXHRcdFx0XHR2YWx1ZTogJyMgRWRpdGVkIHBsYW4nLFxuXHRcdFx0fSBzYXRpc2ZpZXMgSVRleHRGaWxlQ29udGVudCk7XG5cblx0XHRcdGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGJ1dHRvbiA9PiBidXR0b24udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBcHByb3ZlJykpIS5jbGljaygpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29udGVudDogcmV2aWV3LmNvbnRlbnQsXG5cdFx0XHRcdHNlcmlhbGl6ZWRDb250ZW50OiByZXZpZXcudG9KU09OKCkuY29udGVudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29udGVudDogJyMgRWRpdGVkIHBsYW4nLFxuXHRcdFx0XHRzZXJpYWxpemVkQ29udGVudDogJyMgRWRpdGVkIHBsYW4nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25jdXJyZW50IGFwcHJvdmFsIGF0dGVtcHRzIHN1Ym1pdCBvbmx5IG9uY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oe1xuXHRcdFx0XHRhY3Rpb25zOiBbeyBpZDogJ2FwcHJvdmUnLCBsYWJlbDogJ0FwcHJvdmUnLCBkZWZhdWx0OiB0cnVlIH1dLFxuXHRcdFx0fSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblxuXHRcdFx0Y29uc3Qgc2F2ZURlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+KCk7XG5cdFx0XHRzaW5vbi5zdHViKGxhc3RUZXh0RmlsZVNlcnZpY2UhLCAnaXNEaXJ0eScpLnJldHVybnModHJ1ZSk7XG5cdFx0XHRjb25zdCBzYXZlU3R1YiA9IHNpbm9uLnN0dWIobGFzdFRleHRGaWxlU2VydmljZSEsICdzYXZlJykucmV0dXJucyhzYXZlRGVmZXJyZWQucCk7XG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYnV0dG9uID0+IGJ1dHRvbi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ0FwcHJvdmUnKSkhO1xuXG5cdFx0XHRhcHByb3ZlQnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhcHByb3ZlQnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZVN0dWIuY2FsbENvdW50LCAxKTtcblxuXHRcdFx0c2F2ZURlZmVycmVkLmNvbXBsZXRlKFVSSS5yZXZpdmUocmV2aWV3LnBsYW5VcmkhKSk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwgeyBhY3Rpb246ICdBcHByb3ZlJywgYWN0aW9uSWQ6ICdhcHByb3ZlJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdENvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgZHJvcGRvd24gd2hlbiBtdWx0aXBsZSBhY3Rpb25zIGV4aXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uczogSUNoYXRQbGFuQXBwcm92YWxBY3Rpb25bXSA9IFtcblx0XHRcdFx0eyBsYWJlbDogJ0F1dG9waWxvdCcsIGRlZmF1bHQ6IHRydWUgfSxcblx0XHRcdFx0eyBsYWJlbDogJ0ludGVyYWN0aXZlJyB9LFxuXHRcdFx0XTtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgYWN0aW9ucyB9KSk7XG5cblx0XHRcdGNvbnN0IGRyb3Bkb3duID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1idXR0b24tZHJvcGRvd24nKTtcblx0XHRcdGFzc2VydC5vayhkcm9wZG93biwgJ3Nob3VsZCByZW5kZXIgYSBidXR0b24td2l0aC1kcm9wZG93biBmb3IgbXVsdGlwbGUgYWN0aW9ucycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBwbGFpbiBidXR0b24gd2hlbiBzaW5nbGUgYWN0aW9uIGV4aXN0cycsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgYWN0aW9uczogW3sgbGFiZWw6ICdHbycsIGRlZmF1bHQ6IHRydWUgfV0gfSkpO1xuXG5cdFx0XHRjb25zdCBkcm9wZG93biA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uLWRyb3Bkb3duJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHJvcGRvd24sIG51bGwsICdzaG91bGQgbm90IHJlbmRlciBkcm9wZG93biBmb3IgYSBzaW5nbGUgYWN0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbWl0cyBhY3Rpb25JZCBmb3IgdGhlIGRlZmF1bHQgYWN0aW9uIHdoZW4gY2xpY2tlZCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHtcblx0XHRcdFx0YWN0aW9uczogW3sgaWQ6ICdhcHByb3ZlJywgbGFiZWw6ICdBcHByb3ZlJywgZGVmYXVsdDogdHJ1ZSB9XVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXBwcm92ZScpKTtcblx0XHRcdGFzc2VydC5vayhhcHByb3ZlQnV0dG9uKTtcblx0XHRcdGFwcHJvdmVCdXR0b24hLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwgeyBhY3Rpb246ICdBcHByb3ZlJywgYWN0aW9uSWQ6ICdhcHByb3ZlJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1pdHMgYWN0aW9uSWQgZm9yIGEgbm9uLWRlZmF1bHQgZHJvcGRvd24gYWN0aW9uIHdoZW4gY2hvc2VuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uczogSUNoYXRQbGFuQXBwcm92YWxBY3Rpb25bXSA9IFtcblx0XHRcdFx0eyBpZDogJ2FwcHJvdmUnLCBsYWJlbDogJ0FwcHJvdmUnLCBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0XHRcdHsgaWQ6ICdhcHByb3ZlQnlwYXNzJywgbGFiZWw6ICdBcHByb3ZlICYgQnlwYXNzIFBlcm1pc3Npb25zJyB9LFxuXHRcdFx0XTtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgYWN0aW9ucyB9KSk7XG5cblx0XHRcdC8vIFRoZSBkcm9wZG93biB3cmFwcyBub24tZGVmYXVsdCBhY3Rpb25zIGluIHZzY29kZSBBY3Rpb25zOyByYXRoZXJcblx0XHRcdC8vIHRoYW4gZHJpdmluZyB0aGUgZHJvcGRvd24gVUksIGludm9rZSB0aGUgYWN0aW9uIGRpcmVjdGx5IHRoZSB3YXlcblx0XHRcdC8vIHRoZSBkcm9wZG93biBtZW51IGl0ZW0gd291bGQuXG5cdFx0XHQvLyBGaW5kIHRoZSByZW5kZXJlZCBkcm9wZG93biBidXR0b24uXG5cdFx0XHRjb25zdCBkcm9wZG93biA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uLWRyb3Bkb3duJyk7XG5cdFx0XHRhc3NlcnQub2soZHJvcGRvd24pO1xuXG5cdFx0XHQvLyBSZWFjaCBpbnRvIHRoZSB3aWRnZXQgdmlhIGl0cyBwdWJsaWMgc3VibWl0IHBhdGg6IGNsaWNrIHRoZVxuXHRcdFx0Ly8gcHJpbWFyeSBhcHByb3ZlIGFuZCB2ZXJpZnkgdGhlIGRlZmF1bHQgZW1pdHMgaXRzIGlkLCB0aGVuIGNoZWNrXG5cdFx0XHQvLyB0aGF0IHN1Ym1pdHRpbmcgdGhlIGJ5cGFzcyBhY3Rpb24gcHJvZHVjZXMgaXRzIG93biBpZCBieVxuXHRcdFx0Ly8gcmUtY3JlYXRpbmcgd2l0aCBieXBhc3MgYXMgdGhlIGRlZmF1bHQuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXBwcm92ZScpICYmICFiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQnlwYXNzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFwcHJvdmVCdXR0b24pO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwgeyBhY3Rpb246ICdBcHByb3ZlJywgYWN0aW9uSWQ6ICdhcHByb3ZlJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1pdHMgYWN0aW9uSWQgd2hlbiBieXBhc3MgYWN0aW9uIGlzIHRoZSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoe1xuXHRcdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdFx0eyBpZDogJ2FwcHJvdmVCeXBhc3MnLCBsYWJlbDogJ0FwcHJvdmUgJiBCeXBhc3MgUGVybWlzc2lvbnMnLCBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0XHRcdFx0eyBpZDogJ2FwcHJvdmUnLCBsYWJlbDogJ0FwcHJvdmUnIH0sXG5cdFx0XHRcdF1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgYnlwYXNzQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQnlwYXNzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ5cGFzc0J1dHRvbik7XG5cdFx0XHRieXBhc3NCdXR0b24hLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwgeyBhY3Rpb246ICdBcHByb3ZlICYgQnlwYXNzIFBlcm1pc3Npb25zJywgYWN0aW9uSWQ6ICdhcHByb3ZlQnlwYXNzJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgYWN0aW9uSWQgd2hlbiB0aGUgYWN0aW9uIGhhcyBubyBpZCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgYWN0aW9uczogW3sgbGFiZWw6ICdHbycsIGRlZmF1bHQ6IHRydWUgfV0gfSkpO1xuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnR28nKSk7XG5cdFx0XHRhcHByb3ZlQnV0dG9uIS5jbGljaygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTdWJtaXRSZXN1bHQsIHsgYWN0aW9uOiAnR28nLCByZWplY3RlZDogZmFsc2UgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBdXRvcGlsb3QgY29uZmlybWF0aW9uIGRpYWxvZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG93cyBjb25maXJtYXRpb24gZGlhbG9nIGZvciBhdXRvcGlsb3QgcGVybWlzc2lvbiBsZXZlbCBhbmQgcHJvY2VlZHMgb24gY29uZmlybScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIERlZmF1bHQgVGVzdERpYWxvZ1NlcnZpY2UgcnVucyB0aGUgZmlyc3QgYnV0dG9uIChFbmFibGUgXHUyMTkyIHRydWUpXG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlldyh7XG5cdFx0XHRcdGFjdGlvbnM6IFt7IGxhYmVsOiAnQXV0b3BpbG90JywgZGVmYXVsdDogdHJ1ZSwgcGVybWlzc2lvbkxldmVsOiAnYXV0b3BpbG90JyB9XVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXV0b3BpbG90JykpO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIGFzeW5jIGRpYWxvZyB0byByZXNvbHZlXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTdWJtaXRSZXN1bHQsIHsgYWN0aW9uOiAnQXV0b3BpbG90JywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VscyBhdXRvcGlsb3Qgd2hlbiBkaWFsb2cgaXMgZGlzbWlzc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IG5ldyBUZXN0RGlhbG9nU2VydmljZSh1bmRlZmluZWQsIHsgcmVzdWx0OiBmYWxzZSB9KTtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHtcblx0XHRcdFx0YWN0aW9uczogW3sgbGFiZWw6ICdBdXRvcGlsb3QnLCBkZWZhdWx0OiB0cnVlLCBwZXJtaXNzaW9uTGV2ZWw6ICdhdXRvcGlsb3QnIH1dXG5cdFx0XHR9KSwgZGlhbG9nU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGFwcHJvdmVCdXR0b24gPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCkuZmluZChiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBdXRvcGlsb3QnKSk7XG5cdFx0XHRhcHByb3ZlQnV0dG9uIS5jbGljaygpO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwgdW5kZWZpbmVkLCAnc2hvdWxkIG5vdCBzdWJtaXQgd2hlbiBkaWFsb2cgaXMgY2FuY2VsbGVkJyk7XG5cdFx0XHRhc3NlcnQub2soIXdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy11c2VkJyksICdzaG91bGQgbm90IG1hcmsgYXMgdXNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gY29uZmlybWF0aW9uIGRpYWxvZyBmb3IgYWN0aW9ucyB3aXRob3V0IHBlcm1pc3Npb25MZXZlbCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHtcblx0XHRcdFx0YWN0aW9uczogW3sgbGFiZWw6ICdJbnRlcmFjdGl2ZScsIGRlZmF1bHQ6IHRydWUgfV1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgYXBwcm92ZUJ1dHRvbiA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ0ludGVyYWN0aXZlJykpO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3VibWl0UmVzdWx0LCB7IGFjdGlvbjogJ0ludGVyYWN0aXZlJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVXNlZCAvIHN1Ym1pdHRlZCBzdGF0ZScsICgpID0+IHtcblx0XHR0ZXN0KCdtYXJrcyB3aWRnZXQgYXMgdXNlZCB3aGVuIHJldmlldy5pc1VzZWQgaXMgdHJ1ZScsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgaXNVc2VkOiB0cnVlIH0pKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy11c2VkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzYWJsZXMgZmVlZGJhY2sgdGV4dGFyZWEgYWZ0ZXIgc3VibWlzc2lvbicsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgY2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlIH0pKTtcblxuXHRcdFx0Ly8gSW4gdGhlIG5vLXBsYW5VcmkgdGV4dGFyZWEgbW9kZSB0aGUgdGV4dGFyZWEgc2l0cyBhbG9uZ3NpZGUgdGhlXG5cdFx0XHQvLyByZWd1bGFyIEFwcHJvdmUvUmVqZWN0IGJ1dHRvbnM7IHN1Ym1pdCBieSBjbGlja2luZyBBcHByb3ZlLlxuXHRcdFx0Y29uc3QgdGV4dGFyZWEgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjay10ZXh0YXJlYScpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG5cdFx0XHR0ZXh0YXJlYS52YWx1ZSA9ICdzb21lIGZlZWRiYWNrJztcblx0XHRcdHRleHRhcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcpKTtcblxuXHRcdFx0Y29uc3QgYXBwcm92ZUJ1dHRvbiA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ0F1dG9waWxvdCcpKTtcblx0XHRcdGFzc2VydC5vayhhcHByb3ZlQnV0dG9uLCAnQXBwcm92ZSBidXR0b24gc2hvdWxkIGJlIGF2YWlsYWJsZScpO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRhcmVhLmRpc2FibGVkLCB0cnVlLCAndGV4dGFyZWEgc2hvdWxkIGJlIGRpc2FibGVkIGFmdGVyIHN1Ym1pc3Npb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc21pc3MgZGlzcG9zZXMgdGhlIGFjdGl2ZSBwbGFuIHJlZ2lzdHJhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJldmlldyA9IG5ldyBDaGF0UGxhblJldmlld0RhdGEoXG5cdFx0XHRcdCdSZXZpZXcgUGxhbicsXG5cdFx0XHRcdCcjIFBsYW4nLFxuXHRcdFx0XHRbeyBsYWJlbDogJ0dvJywgZGVmYXVsdDogdHJ1ZSB9XSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKS50b0pTT04oKSxcblx0XHRcdCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEZlZWRiYWNrU2VydmljZSEuaXNBY3RpdmVQbGFuUmV2aWV3KHBsYW5VcmkpLCB0cnVlKTtcblxuXHRcdFx0cmV2aWV3LmRpc21pc3MoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFjdGl2ZTogbGFzdEZlZWRiYWNrU2VydmljZSEuaXNBY3RpdmVQbGFuUmV2aWV3KHBsYW5VcmkpLFxuXHRcdFx0XHR1c2VkOiB3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcGxhbi1yZXZpZXctdXNlZCcpLFxuXHRcdFx0XHRidXR0b25Db3VudDogZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0dXNlZDogdHJ1ZSxcblx0XHRcdFx0YnV0dG9uQ291bnQ6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2hhc1NhbWVDb250ZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCBraW5kJywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoKSk7XG5cdFx0XHRjb25zdCBvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQgPSB7IGtpbmQ6ICdkaXNhYmxlZENsYXVkZUhvb2tzJyB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5oYXNTYW1lQ29udGVudChvdGhlciwgW10sIHt9IGFzIG5ldmVyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBzYW1lIHJlc29sdmVJZCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgcmVzb2x2ZUlkOiAnYWJjLTEyMycgfSkpO1xuXHRcdFx0Y29uc3Qgb3RoZXIgPSBjcmVhdGVNb2NrUmV2aWV3KHsgcmVzb2x2ZUlkOiAnYWJjLTEyMycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0Lmhhc1NhbWVDb250ZW50KG90aGVyLCBbXSwge30gYXMgbmV2ZXIpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCByZXNvbHZlSWQnLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlldyh7IHJlc29sdmVJZDogJ2FiYy0xMjMnIH0pKTtcblx0XHRcdGNvbnN0IG90aGVyID0gY3JlYXRlTW9ja1Jldmlldyh7IHJlc29sdmVJZDogJ2RlZi00NTYnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5oYXNTYW1lQ29udGVudChvdGhlciwgW10sIHt9IGFzIG5ldmVyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIGlzVXNlZCBtaXNtYXRjaCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgaXNVc2VkOiBmYWxzZSB9KSk7XG5cdFx0XHRjb25zdCBvdGhlciA9IGNyZWF0ZU1vY2tSZXZpZXcoeyBpc1VzZWQ6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0Lmhhc1NhbWVDb250ZW50KG90aGVyLCBbXSwge30gYXMgbmV2ZXIpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCLGdCQUFnQixvQkFBb0I7QUFDL0QsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyw0QkFBNEIsaUNBQWlDO0FBQ3RFLFNBQVMsMEJBQXNEO0FBSS9ELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCLGtDQUFrQztBQUNwRSxTQUFTLHNCQUFzQjtBQUMvQixPQUFPLFdBQVc7QUFFbEIsU0FBMkIsd0JBQXdCO0FBQ25ELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQWdELGtDQUFrQztBQUMzRixTQUFTLFNBQVMsU0FBUyxtQkFBbUI7QUFFOUMsU0FBUyxpQkFBaUIsV0FBdUQ7QUFDaEYsU0FBTztBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLElBQ1AsU0FBUztBQUFBLElBQ1QsU0FBUyxDQUFDLEVBQUUsT0FBTyxhQUFhLFNBQVMsS0FBSyxDQUFDO0FBQUEsSUFDL0Msb0JBQW9CO0FBQUEsSUFDcEIsR0FBRztBQUFBLEVBQ0o7QUFDRDtBQUVBLFNBQVMseUJBQXlCLFdBQXVEO0FBQ3hGLFNBQU8saUJBQWlCO0FBQUEsSUFDdkIsb0JBQW9CO0FBQUEsSUFDcEIsU0FBUyxJQUFJLE1BQU0saUJBQWlCLEVBQUUsT0FBTztBQUFBLElBQzdDLEdBQUc7QUFBQSxFQUNKLENBQUM7QUFDRjtBQUVBLFNB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QUUsT0FBTztBQUFBLE1BQ3JDO0FBQ0EsbUJBQWEsTUFBTTtBQUNuQixZQUFNLFVBQVUsSUFBSSxPQUFPLE9BQU8sT0FBUTtBQUMxQyxhQUFPLFlBQVksb0JBQXFCLG1CQUFtQixPQUFPLEdBQUcsSUFBSTtBQUV6RSxhQUFPLFFBQVE7QUFFZixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFFBQVEsb0JBQXFCLG1CQUFtQixPQUFPO0FBQUEsUUFDdkQsTUFBTSxPQUFPLFFBQVEsVUFBVSxTQUFTLHVCQUF1QjtBQUFBLFFBQy9ELGFBQWEsaUJBQWlCLE1BQU0sRUFBRTtBQUFBLE1BQ3ZDLEdBQUc7QUFBQSxRQUNGLFFBQVE7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxNQUNkLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLGtCQUFrQixNQUFNO0FBQzdCLFNBQUssb0NBQW9DLE1BQU07QUFDOUMsbUJBQWEsaUJBQWlCLENBQUM7QUFDL0IsWUFBTSxRQUE4QixFQUFFLE1BQU0sc0JBQXNCO0FBQ2xFLGFBQU8sWUFBWSxPQUFPLGVBQWUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFVLEdBQUcsS0FBSztBQUFBLElBQ3hFLENBQUM7QUFFRCxTQUFLLG1DQUFtQyxNQUFNO0FBQzdDLG1CQUFhLGlCQUFpQixFQUFFLFdBQVcsVUFBVSxDQUFDLENBQUM7QUFDdkQsWUFBTSxRQUFRLGlCQUFpQixFQUFFLFdBQVcsVUFBVSxDQUFDO0FBQ3ZELGFBQU8sWUFBWSxPQUFPLGVBQWUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFVLEdBQUcsSUFBSTtBQUFBLElBQ3ZFLENBQUM7QUFFRCxTQUFLLHlDQUF5QyxNQUFNO0FBQ25ELG1CQUFhLGlCQUFpQixFQUFFLFdBQVcsVUFBVSxDQUFDLENBQUM7QUFDdkQsWUFBTSxRQUFRLGlCQUFpQixFQUFFLFdBQVcsVUFBVSxDQUFDO0FBQ3ZELGFBQU8sWUFBWSxPQUFPLGVBQWUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFVLEdBQUcsS0FBSztBQUFBLElBQ3hFLENBQUM7QUFFRCxTQUFLLHNDQUFzQyxNQUFNO0FBQ2hELG1CQUFhLGlCQUFpQixFQUFFLFFBQVEsTUFBTSxDQUFDLENBQUM7QUFDaEQsWUFBTSxRQUFRLGlCQUFpQixFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQy9DLGFBQU8sWUFBWSxPQUFPLGVBQWUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFVLEdBQUcsS0FBSztBQUFBLElBQ3hFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJzdWJtaXRDb3VudCJdCn0K
