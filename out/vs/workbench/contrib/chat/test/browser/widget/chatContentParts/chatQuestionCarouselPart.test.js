import assert from "assert";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { ChatQuestionCarouselPart } from "../../../../browser/widget/chatContentParts/chatQuestionCarouselPart.js";
import { ChatQuestionCarouselData } from "../../../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { AgentHostAutoReplyAnswer } from "../../../../../../../platform/agentHost/common/agentHostSchema.js";
function createMockCarousel(questions, allowSkip = true) {
  return {
    kind: "questionCarousel",
    questions,
    allowSkip
  };
}
function createMockContext() {
  const context = { content: [], contentIndex: 0 };
  return context;
}
suite("ChatQuestionCarouselPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let widget;
  let submittedAnswers = null;
  function createWidget(carousel, onSubmit) {
    const instantiationService = workbenchInstantiationService(void 0, store);
    const options = {
      onSubmit: (answers) => {
        submittedAnswers = answers;
        onSubmit?.();
      }
    };
    widget = store.add(instantiationService.createInstance(ChatQuestionCarouselPart, carousel, createMockContext(), options));
    mainWindow.document.body.appendChild(widget.domNode);
    return widget;
  }
  teardown(() => {
    if (widget?.domNode?.parentNode) {
      widget.domNode.parentNode.removeChild(widget.domNode);
    }
    submittedAnswers = null;
  });
  suite("Basic Rendering", () => {
    test("renders carousel container with proper structure", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ]);
      createWidget(carousel);
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-container"));
      assert.ok(widget.domNode.querySelector(".chat-question-header-row"));
      assert.ok(widget.domNode.querySelector(".chat-question-carousel-content"));
    });
    test("renders question title", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "What is your name?", message: "What is your name?" }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title);
      assert.ok(title?.textContent?.includes("What is your name?"));
    });
    test("renders question title when message is not provided", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Fallback title text" }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title, "title element should exist when only title is provided");
      assert.ok(title?.textContent?.includes("Fallback title text"));
    });
    test("renders markdown in question message", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "text",
          title: "Question",
          message: new MarkdownString("Please review **details** in [docs](https://example.com)")
        }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title, "title element should exist");
      assert.ok(title?.querySelector(".rendered-markdown"), "markdown content should be rendered");
    });
    test("sanitizes agent-provided markdown", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "text",
          title: "Question",
          message: new MarkdownString("![remote](https://example.com/question.png)"),
          detailedMessage: new MarkdownString("![remote](https://example.com/details.png)")
        }
      ]);
      carousel.message = new MarkdownString("![remote](https://example.com/carousel.png)");
      createWidget(carousel);
      assert.deepStrictEqual({
        carouselMessageImages: widget.domNode.querySelectorAll(".chat-question-carousel-message img").length,
        questionMessageImages: widget.domNode.querySelectorAll(".chat-question-title img").length,
        detailedMessageImages: widget.domNode.querySelectorAll(".chat-question-detailed-message img").length
      }, {
        carouselMessageImages: 0,
        questionMessageImages: 0,
        detailedMessageImages: 0
      });
    });
    test("renders plain string question message as text", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "text",
          title: "Question",
          message: "Please review **details** in [docs](https://example.com)"
        }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title, "title element should exist");
      assert.ok(title?.textContent?.includes("details"), "content should be rendered");
    });
    test("renders progress indicator correctly", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1", message: "Question 1" },
        { id: "q2", type: "text", title: "Question 2", message: "Question 2" },
        { id: "q3", type: "text", title: "Question 3", message: "Question 3" }
      ]);
      createWidget(carousel);
      const stepIndicator = widget.domNode.querySelector(".chat-question-step-indicator");
      assert.ok(stepIndicator);
      assert.ok(stepIndicator?.textContent?.includes("1"));
      assert.ok(stepIndicator?.textContent?.includes("3"));
    });
    test("renders close button in title row for multi-question carousels", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      createWidget(carousel);
      const titleRow = widget.domNode.querySelector(".chat-question-title-row");
      assert.ok(titleRow, "title row should exist");
      const closeContainer = titleRow?.querySelector(".chat-question-close-container");
      assert.ok(closeContainer, "close button container should be rendered in the title row");
      const directChildCloseContainer = widget.domNode.querySelector(":scope > .chat-question-close-container");
      assert.strictEqual(directChildCloseContainer, null, "close button container should not be positioned as a direct child of the carousel container");
    });
    test("renders collapse button in title row even when skip is disabled", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], false);
      createWidget(carousel);
      const titleRow = widget.domNode.querySelector(".chat-question-title-row");
      assert.ok(titleRow, "title row should exist");
      const collapseButton = titleRow?.querySelector(".chat-question-collapse-toggle");
      assert.ok(collapseButton, "collapse button should be rendered even when skip is disabled");
    });
    test("renders collapse button to the right of close button", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      createWidget(carousel);
      const actionsContainer = widget.domNode.querySelector(".chat-question-header-actions");
      assert.ok(actionsContainer, "actions container should exist");
      if (!actionsContainer) {
        return;
      }
      const actionButtons = Array.from(actionsContainer.querySelectorAll(".monaco-button"));
      const closeIndex = actionButtons.findIndex((button) => button.classList.contains("chat-question-close"));
      const collapseIndex = actionButtons.findIndex((button) => button.classList.contains("chat-question-collapse-toggle"));
      assert.ok(closeIndex >= 0, "close button should exist");
      assert.ok(collapseIndex >= 0, "collapse button should exist");
      assert.ok(collapseIndex > closeIndex, "collapse button should be positioned to the right of close button");
    });
    test("toggles collapsed state and updates aria-expanded", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      createWidget(carousel);
      const collapseButton = widget.domNode.querySelector(".chat-question-collapse-toggle");
      assert.ok(collapseButton, "collapse button should exist");
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "true");
      collapseButton.click();
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-collapsed"), "widget should enter collapsed state");
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "false");
      const collapsedSummary = widget.domNode.querySelector(".chat-question-collapsed-summary");
      assert.strictEqual(collapsedSummary, null, "collapsed mode should not render an additional summary section");
      const titleRow = widget.domNode.querySelector(".chat-question-title-row");
      assert.ok(titleRow, "header should remain visible when collapsed");
      const inputScrollable = widget.domNode.querySelector(".chat-question-input-scrollable");
      assert.ok(inputScrollable, "input section exists in DOM but is hidden while collapsed");
      collapseButton.click();
      assert.ok(!widget.domNode.classList.contains("chat-question-carousel-collapsed"), "widget should exit collapsed state");
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "true");
    });
    test("restores draft collapsed state from carousel data", () => {
      const carousel = new ChatQuestionCarouselData([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      carousel.draftCollapsed = true;
      createWidget(carousel);
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-collapsed"), "widget should restore collapsed draft state");
      const collapseButton = widget.domNode.querySelector(".chat-question-collapse-toggle");
      assert.strictEqual(collapseButton?.getAttribute("aria-expanded"), "false");
    });
  });
  suite("Question Types", () => {
    test("renders text input for text type questions", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Enter your name" }
      ]);
      createWidget(carousel);
      const inputContainer = widget.domNode.querySelector(".chat-question-input-container");
      assert.ok(inputContainer);
      const inputBox = inputContainer?.querySelector(".monaco-inputbox input");
      assert.ok(inputBox, "Should have an input box for text questions");
    });
    test("renders list items for singleSelect type questions", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ]
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems.length, 2, "Should have 2 list items");
    });
    test("renders list items with checkboxes for multiSelect type questions", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" },
            { id: "c", label: "Option C", value: "c" }
          ]
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item.multi-select");
      assert.strictEqual(listItems.length, 3, "Should have 3 list items for multiSelect");
      const checkboxes = widget.domNode.querySelectorAll(".chat-question-list-checkbox");
      assert.strictEqual(checkboxes.length, 3, "Should have 3 checkboxes");
    });
    test("freeform textarea is rendered for singleSelect by default", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "a" }
          ]
        }
      ]);
      createWidget(carousel);
      const freeformTextarea = widget.domNode.querySelector(".chat-question-freeform-textarea");
      assert.ok(freeformTextarea, "Freeform textarea should be rendered by default for singleSelect");
    });
    test("freeform textarea is rendered for multiSelect by default", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          options: [
            { id: "a", label: "Option A", value: "a" }
          ]
        }
      ]);
      createWidget(carousel);
      const freeformTextarea = widget.domNode.querySelector(".chat-question-freeform-textarea");
      assert.ok(freeformTextarea, "Freeform textarea should be rendered by default for multiSelect");
    });
    test("freeform textarea is hidden when allowFreeformInput is false for singleSelect", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          allowFreeformInput: false,
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ]
        }
      ]);
      createWidget(carousel);
      const freeformTextarea = widget.domNode.querySelector(".chat-question-freeform-textarea");
      assert.strictEqual(freeformTextarea, null, "Freeform textarea should not be rendered when allowFreeformInput is false");
    });
    test("freeform textarea is hidden when allowFreeformInput is false for multiSelect", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          allowFreeformInput: false,
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ]
        }
      ]);
      createWidget(carousel);
      const freeformTextarea = widget.domNode.querySelector(".chat-question-freeform-textarea");
      assert.strictEqual(freeformTextarea, null, "Freeform textarea should not be rendered when allowFreeformInput is false");
    });
    test("default options are pre-selected for singleSelect", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ],
          defaultValue: "b"
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems[0].classList.contains("selected"), true, "Default option should be re-sorted to first and selected");
      assert.strictEqual(listItems[1].classList.contains("selected"), false);
    });
    test("default options are pre-selected for multiSelect", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" },
            { id: "c", label: "Option C", value: "c" }
          ],
          defaultValue: ["a", "c"]
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems[0].classList.contains("checked"), true, "First default option should be checked");
      assert.strictEqual(listItems[1].classList.contains("checked"), true, "Second default option should be checked (re-sorted from third)");
      assert.strictEqual(listItems[2].classList.contains("checked"), false, "Non-default option should not be checked");
    });
    test("singleSelect keeps value mapping after default-first reordering", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "value_a" },
            { id: "b", label: "Option B", value: "value_b" }
          ],
          defaultValue: "b"
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems.length, 2, "Expected two options");
      listItems[1].click();
      const answer = submittedAnswers?.get("q1");
      assert.strictEqual(answer.selectedValue, "value_a");
      assert.strictEqual(answer.freeformValue, void 0);
    });
    test("multiSelect keeps value mapping after default-first reordering", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          options: [
            { id: "a", label: "Option A", value: "value_a" },
            { id: "b", label: "Option B", value: "value_b" },
            { id: "c", label: "Option C", value: "value_c" }
          ],
          defaultValue: "c"
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems.length, 3, "Expected three options");
      listItems[1].click();
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      assert.ok(submitButton, "Submit button should exist");
      submitButton.click();
      const answer = submittedAnswers?.get("q1");
      assert.ok(Array.isArray(answer.selectedValues));
      assert.ok(answer.selectedValues.includes("value_a"));
      assert.ok(answer.selectedValues.includes("value_c"));
      assert.strictEqual(answer.selectedValues.length, 2);
      assert.strictEqual(answer.freeformValue, void 0);
    });
    test("does not render a summary after onSubmit disposes the part", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question", defaultValue: "answer" }
      ]);
      createWidget(carousel, () => widget.dispose());
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      submitButton.click();
      assert.strictEqual(widget.domNode.querySelector(".chat-question-carousel-summary"), null);
    });
  });
  suite("Navigation", () => {
    test("previous button is disabled on first question", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ]);
      createWidget(carousel);
      const navArrows = widget.domNode.querySelectorAll(".chat-question-nav-arrow");
      const prevButton = navArrows[0];
      assert.ok(prevButton, "Previous button should exist");
      assert.ok(prevButton.classList.contains("disabled") || prevButton.disabled, "Previous button should be disabled on first question");
    });
    test("next button stays as arrow and is disabled on last question", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Only Question" },
        { id: "q2", type: "text", title: "Question 2" }
      ]);
      createWidget(carousel);
      widget.navigateToNextQuestion();
      const navArrows = widget.domNode.querySelectorAll(".chat-question-nav-arrow");
      const nextButton = navArrows[1];
      assert.ok(nextButton, "Next button should exist");
      assert.ok(nextButton.classList.contains("disabled") || nextButton.disabled, "Next button should be disabled on last question");
    });
    test("submit button is shown on last question", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ]);
      createWidget(carousel);
      widget.navigateToNextQuestion();
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      assert.ok(submitButton, "Submit button should exist");
      assert.notStrictEqual(submitButton.style.display, "none", "Submit button should be visible on last question");
    });
  });
  suite("Skip Functionality", () => {
    test("skip succeeds when allowSkip is true and returns defaults", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1", defaultValue: "default answer" }
      ], true);
      createWidget(carousel);
      const result = widget.skip();
      assert.strictEqual(result, true, "skip() should return true when allowSkip is true");
      assert.ok(submittedAnswers instanceof Map, "Skip should call onSubmit with a Map");
      assert.strictEqual(submittedAnswers?.get("q1"), "default answer", "Skip should return default values");
    });
    test("skip fails when allowSkip is false", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], false);
      createWidget(carousel);
      const result = widget.skip();
      assert.strictEqual(result, false, "skip() should return false when allowSkip is false");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not have been called");
    });
    test("skip can only be called once", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      widget.skip();
      submittedAnswers = null;
      const result = widget.skip();
      assert.strictEqual(result, false, "Second skip() should return false");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not be called again");
    });
    test("skip no-ops when the carousel was already resolved externally", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1", defaultValue: "default answer" }
      ], true);
      createWidget(carousel);
      carousel.isUsed = true;
      const result = widget.skip();
      assert.strictEqual(result, false, "skip() must not re-submit a carousel resolved elsewhere");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not overwrite the external answers");
    });
  });
  suite("Ignore Functionality", () => {
    test("ignore succeeds when allowSkip is true and returns undefined", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      const result = widget.ignore();
      assert.strictEqual(result, true, "ignore() should return true when allowSkip is true");
      assert.strictEqual(submittedAnswers, void 0, "Ignore should call onSubmit with undefined");
    });
    test("ignore fails when allowSkip is false", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], false);
      createWidget(carousel);
      const result = widget.ignore();
      assert.strictEqual(result, false, "ignore() should return false when allowSkip is false");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not have been called");
    });
    test("ignore can only be called once", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      widget.ignore();
      submittedAnswers = null;
      const result = widget.ignore();
      assert.strictEqual(result, false, "Second ignore() should return false");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not be called again");
    });
    test("ignore no-ops when the carousel was already resolved externally", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      carousel.isUsed = true;
      const result = widget.ignore();
      assert.strictEqual(result, false, "ignore() must not re-submit a carousel resolved elsewhere");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not overwrite the external answers");
    });
    test("skip and ignore are mutually exclusive", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      widget.skip();
      submittedAnswers = null;
      const result = widget.ignore();
      assert.strictEqual(result, false, "ignore() should return false after skip()");
      assert.strictEqual(submittedAnswers, null, "onSubmit should not be called again");
    });
  });
  suite("Accessibility", () => {
    test("navigation area has proper role and aria-label", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ]);
      createWidget(carousel);
      const nav = widget.domNode.querySelector(".chat-question-carousel-nav");
      assert.strictEqual(nav?.getAttribute("role"), "navigation");
      assert.ok(nav?.getAttribute("aria-label"), "Navigation should have aria-label");
    });
    test("single select list has proper role and aria-label", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ]
        }
      ]);
      createWidget(carousel);
      const list = widget.domNode.querySelector(".chat-question-list");
      assert.strictEqual(list?.getAttribute("role"), "listbox");
      assert.strictEqual(list?.getAttribute("aria-label"), "Choose one");
    });
    test("list items have proper role and aria-selected", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "a" },
            { id: "b", label: "Option B", value: "b" }
          ]
        }
      ]);
      createWidget(carousel);
      const listItems = widget.domNode.querySelectorAll(".chat-question-list-item");
      assert.strictEqual(listItems.length, 2, "Should have 2 list items");
      const firstItem = listItems[0];
      assert.strictEqual(firstItem.getAttribute("role"), "option");
      assert.ok(firstItem.id, "List item should have an id");
      assert.strictEqual(firstItem.getAttribute("aria-selected"), "true", "First item should be auto-selected");
      const secondItem = listItems[1];
      assert.strictEqual(secondItem.getAttribute("role"), "option");
      assert.strictEqual(secondItem.getAttribute("aria-selected"), "false", "Unselected item should have aria-selected=false");
    });
  });
  suite("hasSameContent", () => {
    test("returns true for same carousel instance", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ]);
      createWidget(carousel);
      assert.strictEqual(widget.hasSameContent(carousel, [], {}), true);
    });
    test("returns false for different content type", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ]);
      createWidget(carousel);
      const differentContent = { kind: "markdown" };
      assert.strictEqual(widget.hasSameContent(differentContent, [], {}), false);
    });
  });
  suite("Auto-Approve (Yolo Mode)", () => {
    test("skip returns default values for text questions", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1", defaultValue: "default text" }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(submittedAnswers instanceof Map);
      assert.strictEqual(submittedAnswers?.get("q1"), "default text");
    });
    test("skip returns default values for singleSelect questions", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "singleSelect",
          title: "Choose one",
          options: [
            { id: "a", label: "Option A", value: "value_a" },
            { id: "b", label: "Option B", value: "value_b" }
          ],
          defaultValue: "b"
        }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(submittedAnswers instanceof Map);
      const answer = submittedAnswers?.get("q1");
      assert.strictEqual(answer.selectedValue, "value_b");
      assert.strictEqual(answer.freeformValue, void 0);
    });
    test("skip returns default values for multiSelect questions", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "multiSelect",
          title: "Choose multiple",
          options: [
            { id: "a", label: "Option A", value: "value_a" },
            { id: "b", label: "Option B", value: "value_b" },
            { id: "c", label: "Option C", value: "value_c" }
          ],
          defaultValue: ["a", "c"]
        }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(submittedAnswers instanceof Map);
      const answer = submittedAnswers?.get("q1");
      assert.ok(Array.isArray(answer.selectedValues));
      assert.strictEqual(answer.selectedValues.length, 2);
      assert.ok(answer.selectedValues.includes("value_a"));
      assert.ok(answer.selectedValues.includes("value_c"));
      assert.strictEqual(answer.freeformValue, void 0);
    });
    test("skip returns defaults for multiple questions", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Text Question", defaultValue: "text default" },
        {
          id: "q2",
          type: "singleSelect",
          title: "Single Select",
          options: [
            { id: "opt1", label: "First", value: "first_value" }
          ],
          defaultValue: "opt1"
        }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(submittedAnswers instanceof Map);
      assert.strictEqual(submittedAnswers?.get("q1"), "text default");
      const answer = submittedAnswers?.get("q2");
      assert.strictEqual(answer.selectedValue, "first_value");
      assert.strictEqual(answer.freeformValue, void 0);
    });
    test("skip returns empty map when no defaults are provided", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question without default" }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(submittedAnswers instanceof Map);
      assert.strictEqual(submittedAnswers?.size, 0, "Should return empty map when no defaults");
    });
  });
  suite("Used Carousel Summary", () => {
    test("retains current question after navigation without editing", () => {
      const carousel = new ChatQuestionCarouselData([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      const firstWidget = createWidget(carousel);
      const nextButton = firstWidget.domNode.querySelector(".chat-question-nav-next");
      assert.ok(nextButton, "next button should exist");
      nextButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      firstWidget.dispose();
      firstWidget.domNode.remove();
      const recreatedWidget = createWidget(carousel);
      const stepIndicator = recreatedWidget.domNode.querySelector(".chat-question-step-indicator");
      assert.strictEqual(stepIndicator?.textContent, "2/2", "should restore the current question index after navigation");
      const title = recreatedWidget.domNode.querySelector(".chat-question-title");
      assert.ok(title?.textContent?.includes("Question 2"), "should restore to the second question view");
    });
    test("retains draft answers and current question after widget recreation", () => {
      const carousel = new ChatQuestionCarouselData([
        { id: "q1", type: "text", title: "Question 1" },
        { id: "q2", type: "text", title: "Question 2" }
      ], true);
      const firstWidget = createWidget(carousel);
      const firstInput = firstWidget.domNode.querySelector(".monaco-inputbox input");
      assert.ok(firstInput, "first question input should exist");
      firstInput.value = "first draft answer";
      firstInput.dispatchEvent(new Event("input", { bubbles: true }));
      const nextButton = firstWidget.domNode.querySelector(".chat-question-nav-next");
      assert.ok(nextButton, "next button should exist");
      nextButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const secondInput = firstWidget.domNode.querySelector(".monaco-inputbox input");
      assert.ok(secondInput, "second question input should exist");
      secondInput.value = "second draft answer";
      secondInput.dispatchEvent(new Event("input", { bubbles: true }));
      firstWidget.dispose();
      firstWidget.domNode.remove();
      const recreatedWidget = createWidget(carousel);
      const stepIndicator = recreatedWidget.domNode.querySelector(".chat-question-step-indicator");
      assert.strictEqual(stepIndicator?.textContent, "2/2", "should restore the current question index");
      const recreatedSecondInput = recreatedWidget.domNode.querySelector(".monaco-inputbox input");
      assert.ok(recreatedSecondInput, "recreated second question input should exist");
      assert.strictEqual(recreatedSecondInput.value, "second draft answer", "should restore draft input for current question");
      const prevButton = recreatedWidget.domNode.querySelector(".chat-question-nav-prev");
      assert.ok(prevButton, "previous button should exist");
      prevButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const recreatedFirstInput = recreatedWidget.domNode.querySelector(".monaco-inputbox input");
      assert.ok(recreatedFirstInput, "recreated first question input should exist");
      assert.strictEqual(recreatedFirstInput.value, "first draft answer", "should restore draft input for previous question");
    });
    test("shows summary with answers after skip()", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1", defaultValue: "default answer" }
      ], true);
      createWidget(carousel);
      widget.skip();
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-used"), "Should have used class");
      const summary = widget.domNode.querySelector(".chat-question-carousel-summary");
      assert.ok(summary, "Should show summary container after skip");
      const summaryItem = summary?.querySelector(".chat-question-summary-item");
      assert.ok(summaryItem, "Should have summary item for the question");
      const summaryValue = summaryItem?.querySelector(".chat-question-summary-answer-title");
      assert.ok(summaryValue?.textContent?.includes("default answer"), "Summary should show the default answer");
    });
    test("shows skipped message after ignore()", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Question 1" }
      ], true);
      createWidget(carousel);
      widget.ignore();
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-used"), "Should have used class");
      const summary = widget.domNode.querySelector(".chat-question-carousel-summary");
      assert.ok(summary, "Should show summary container after ignore");
      const skippedMessage = summary?.querySelector(".chat-question-summary-skipped");
      assert.ok(skippedMessage, "Should show skipped message when ignored");
    });
    test("renders summary when constructed with isUsed and data", () => {
      const carousel = {
        kind: "questionCarousel",
        questions: [
          { id: "q1", type: "text", title: "Question 1" }
        ],
        allowSkip: true,
        isUsed: true,
        data: { q1: "saved answer" }
      };
      createWidget(carousel);
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-used"), "Should have used class");
      const summary = widget.domNode.querySelector(".chat-question-carousel-summary");
      assert.ok(summary, "Should show summary container when isUsed is true");
      const summaryValue = summary?.querySelector(".chat-question-summary-answer-title");
      assert.ok(summaryValue?.textContent?.includes("saved answer"), "Summary should show saved answer from data");
    });
    test("renders conversational summary with expandable selected options", () => {
      const carousel = new ChatQuestionCarouselData([{
        id: "q1",
        type: "singleSelect",
        title: "What should we prioritize if the refactor affects multiple platforms and may require migration work?",
        options: [
          { id: "fix", label: "Fix a bug", value: "fix" },
          { id: "feature", label: "Implement a feature", value: "feature" }
        ]
      }], true, void 0, { q1: { selectedValue: "fix" } }, true);
      carousel.answerPresentation = "conversation";
      createWidget(carousel.toJSON());
      const question = widget.domNode.querySelector(".chat-question-summary-question");
      const answerButton = widget.domNode.querySelector(".chat-question-answer-collapsible .monaco-button");
      assert.ok(question && answerButton);
      assert.strictEqual(widget.domNode.querySelector(".chat-question-summary-option-list"), null);
      answerButton.click();
      assert.deepStrictEqual({
        question: question.textContent,
        questionExpandable: question.hasAttribute("aria-expanded"),
        answer: answerButton.textContent,
        answerExpanded: answerButton.getAttribute("aria-expanded"),
        answerIcon: answerButton.querySelector(".chat-question-summary-answer-icon")?.classList.contains("codicon-comment"),
        hasChevron: !!answerButton.querySelector(".chat-collapsible-hover-chevron"),
        optionsTitle: widget.domNode.querySelector(".chat-question-summary-options-title")?.textContent,
        options: Array.from(widget.domNode.querySelectorAll(".chat-question-summary-option")).map((option) => ({
          label: option.querySelector(".chat-question-summary-option-label")?.textContent,
          selected: option.classList.contains("selected"),
          hasCompactCheck: !!option.querySelector(".chat-question-summary-option-selected .codicon-check-compact")
        }))
      }, {
        question: "Question: What should we prioritize if the refactor affects multiple platforms and may require migration work?",
        answer: "Answered: Fix a bug",
        questionExpandable: false,
        answerExpanded: "true",
        answerIcon: true,
        hasChevron: true,
        optionsTitle: "Options",
        options: [
          { label: "Fix a bug", selected: true, hasCompactCheck: true },
          { label: "Implement a feature", selected: false, hasCompactCheck: false }
        ]
      });
    });
    test("uses a non-interactive collapsible header for free responses", () => {
      const carousel = new ChatQuestionCarouselData([{
        id: "q1",
        type: "text",
        title: "What would you like me to help you with?"
      }], true, void 0, { q1: "Review the changes" }, true);
      carousel.answerPresentation = "conversation";
      createWidget(carousel.toJSON());
      const answerButton = widget.domNode.querySelector(".chat-question-answer-collapsible .monaco-button");
      assert.deepStrictEqual({
        answer: answerButton?.textContent,
        disabled: answerButton?.getAttribute("aria-disabled"),
        tabIndex: answerButton?.tabIndex,
        expanded: answerButton?.getAttribute("aria-expanded"),
        hasChevron: !!answerButton?.querySelector(".chat-collapsible-hover-chevron")
      }, {
        answer: "Answered: Review the changes",
        disabled: "true",
        tabIndex: -1,
        expanded: null,
        hasChevron: false
      });
    });
    test("shows skipped message when constructed with isUsed but no data", () => {
      const carousel = {
        kind: "questionCarousel",
        questions: [
          { id: "q1", type: "text", title: "Question 1" }
        ],
        allowSkip: true,
        isUsed: true
      };
      createWidget(carousel);
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-used"), "Should have used class");
      const summary = widget.domNode.querySelector(".chat-question-carousel-summary");
      assert.ok(summary, "Should show summary container");
      const skippedMessage = summary?.querySelector(".chat-question-summary-skipped");
      assert.ok(skippedMessage, "Should show skipped message when no data");
    });
    test("renders a skipped conversational question with its options", () => {
      const carousel = {
        kind: "questionCarousel",
        questions: [{
          id: "q1",
          type: "singleSelect",
          title: "Which environment?",
          options: [
            { id: "staging", label: "Staging", value: "staging" },
            { id: "production", label: "Production", value: "production" }
          ]
        }],
        allowSkip: true,
        isUsed: true,
        answerPresentation: "conversation"
      };
      createWidget(carousel);
      const answerButton = widget.domNode.querySelector(".chat-question-answer-collapsible .monaco-button");
      assert.ok(answerButton);
      answerButton.click();
      assert.deepStrictEqual({
        question: widget.domNode.querySelector(".chat-question-summary-question")?.textContent,
        answer: answerButton.textContent,
        answerIcon: answerButton.querySelector(".chat-question-summary-answer-icon")?.classList.contains("codicon-close-compact"),
        hasChevron: !!answerButton.querySelector(".chat-collapsible-hover-chevron"),
        options: Array.from(widget.domNode.querySelectorAll(".chat-question-summary-option-label")).map((option) => option.textContent)
      }, {
        question: "Question: Which environment?",
        answer: "Skipped question",
        answerIcon: true,
        hasChevron: true,
        options: ["Staging", "Production"]
      });
    });
    test("shows answered message when answeredExternally but no data", () => {
      const carousel = {
        kind: "questionCarousel",
        questions: [
          { id: "q1", type: "text", title: "Question 1" }
        ],
        allowSkip: true,
        isUsed: true,
        answeredExternally: true,
        answerPresentation: "conversation"
      };
      createWidget(carousel);
      assert.ok(widget.domNode.classList.contains("chat-question-carousel-used"), "Should have used class");
      const summary = widget.domNode.querySelector(".chat-question-carousel-summary");
      assert.ok(summary, "Should show summary container");
      assert.ok(!summary?.querySelector(".chat-question-summary-skipped"), "Should not show skipped message");
      assert.ok(summary?.querySelector(".chat-question-summary-answered"), "Should show answered message when answered externally");
      assert.ok(!summary?.querySelector(".codicon-copilot-compact"), "Should not present a generic external answer as an automatic reply");
    });
    test("renders a Copilot icon for a structured automatic answer", () => {
      const carousel = {
        kind: "questionCarousel",
        questions: [
          { id: "q1", type: "text", title: "What should we work on next?" }
        ],
        allowSkip: true,
        isUsed: true,
        answeredExternally: true,
        autoReply: true,
        answerPresentation: "conversation",
        data: { q1: AgentHostAutoReplyAnswer }
      };
      createWidget(carousel);
      assert.deepStrictEqual({
        question: widget.domNode.querySelector(".chat-question-summary-question")?.textContent,
        answer: widget.domNode.querySelector(".chat-question-answer-collapsible .monaco-button")?.textContent,
        answerIcon: widget.domNode.querySelector(".chat-question-summary-answer-icon")?.classList.contains("codicon-copilot-compact"),
        hasGenericMessage: !!widget.domNode.querySelector(".chat-question-summary-answered")
      }, {
        question: "Question: What should we work on next?",
        answer: `Answered: ${AgentHostAutoReplyAnswer}`,
        answerIcon: true,
        hasGenericMessage: false
      });
    });
  });
  suite("Description and Message", () => {
    test("renders question description when provided", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Email", description: "Enter your email address" }
      ]);
      createWidget(carousel);
      const desc = widget.domNode.querySelector(".chat-question-description");
      assert.ok(desc, "Description element should be rendered");
      assert.strictEqual(desc?.textContent, "Enter your email address");
    });
    test("does not render description element when not provided", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name" }
      ]);
      createWidget(carousel);
      const desc = widget.domNode.querySelector(".chat-question-description");
      assert.strictEqual(desc, null, "Description element should not exist when not provided");
    });
    test("renders carousel-level message on first question", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name" },
        { id: "q2", type: "text", title: "Email" }
      ]);
      carousel.message = "Please fill in the following:";
      createWidget(carousel);
      const message = widget.domNode.querySelector(".chat-question-carousel-message");
      assert.ok(message, "Carousel message should be rendered");
      assert.ok(message?.textContent?.includes("Please fill in the following:"));
    });
    test("renders carousel-level message as markdown", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name" }
      ]);
      carousel.message = new MarkdownString("**Important:** Fill this form");
      createWidget(carousel);
      const message = widget.domNode.querySelector(".chat-question-carousel-message");
      assert.ok(message, "Carousel message should be rendered");
      assert.ok(message?.querySelector(".rendered-markdown"), "Message should be rendered as markdown");
    });
    test("shows required indicator on required questions", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name", required: true }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title?.textContent?.includes("*"), "Required indicator (*) should be shown");
    });
    test("does not show required indicator on optional questions", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Nickname" }
      ]);
      createWidget(carousel);
      const title = widget.domNode.querySelector(".chat-question-title");
      assert.ok(title?.textContent);
      assert.ok(!title?.textContent?.includes("*"), "Required indicator should not be shown");
    });
  });
  suite("Validation", () => {
    test("renders validation message element", () => {
      const carousel = createMockCarousel([
        {
          id: "q1",
          type: "text",
          title: "Email",
          validation: { format: "email" }
        }
      ]);
      createWidget(carousel);
      const validationMsg = widget.domNode.querySelector(".chat-question-validation-message");
      assert.ok(validationMsg, "Validation message element should exist");
      assert.strictEqual(validationMsg?.style.display, "none", "Validation message should be hidden initially");
    });
    test("blocks submit on required empty text field", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name", required: true }
      ]);
      createWidget(carousel);
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      assert.ok(submitButton, "Submit button should exist");
      submitButton.click();
      const validationMsg = widget.domNode.querySelector(".chat-question-validation-message");
      assert.ok(validationMsg?.textContent, "Validation error should be shown");
      assert.strictEqual(submittedAnswers, null, "Should not have submitted");
    });
    test("next button is disabled when required text field is empty", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name", required: true },
        { id: "q2", type: "text", title: "Age" }
      ]);
      createWidget(carousel);
      const nextButton = widget.domNode.querySelector(".chat-question-nav-next");
      assert.ok(nextButton, "Next button should exist");
      assert.ok(nextButton.classList.contains("disabled"), "Next button should be disabled when required field is empty");
    });
    test("allows submit on required field with value", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Name", required: true }
      ]);
      createWidget(carousel);
      const inputBox = widget.domNode.querySelector(".monaco-inputbox input");
      assert.ok(inputBox, "Input should exist");
      inputBox.value = "John";
      inputBox.dispatchEvent(new Event("input", { bubbles: true }));
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      submitButton.click();
      assert.ok(submittedAnswers !== null, "Should have submitted");
    });
    test("validates required field across questions on submit", () => {
      const carousel = createMockCarousel([
        { id: "q1", type: "text", title: "Optional" },
        { id: "q2", type: "text", title: "Required", required: true }
      ]);
      createWidget(carousel);
      widget.navigateToNextQuestion();
      widget.navigateToPreviousQuestion();
      const submitButton = widget.domNode.querySelector(".chat-question-submit-button");
      if (submitButton) {
        submitButton.click();
      }
      assert.strictEqual(submittedAnswers, null, "Should not submit when required field is empty");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IENoYXRRdWVzdGlvbkNhcm91c2VsUGFydCwgSUNoYXRRdWVzdGlvbkNhcm91c2VsT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LmpzJztcbmltcG9ydCB7IElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZSwgSUNoYXRRdWVzdGlvbkNhcm91c2VsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QXV0b1JlcGx5QW5zd2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQ2Fyb3VzZWwocXVlc3Rpb25zOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxbJ3F1ZXN0aW9ucyddLCBhbGxvd1NraXA6IGJvb2xlYW4gPSB0cnVlKTogSUNoYXRRdWVzdGlvbkNhcm91c2VsIHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsXG5cdFx0cXVlc3Rpb25zLFxuXHRcdGFsbG93U2tpcCxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja0NvbnRleHQoKTogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQge1xuXHRjb25zdCBjb250ZXh0OiBQYXJ0aWFsPElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0PiA9IHsgY29udGVudDogW10sIGNvbnRlbnRJbmRleDogMCB9O1xuXHRyZXR1cm4gY29udGV4dCBhcyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dDtcbn1cblxuc3VpdGUoJ0NoYXRRdWVzdGlvbkNhcm91c2VsUGFydCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgd2lkZ2V0OiBDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQ7XG5cdGxldCBzdWJtaXR0ZWRBbnN3ZXJzOiBNYXA8c3RyaW5nLCBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWU+IHwgdW5kZWZpbmVkIHwgbnVsbCA9IG51bGw7XG5cblx0ZnVuY3Rpb24gY3JlYXRlV2lkZ2V0KGNhcm91c2VsOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIG9uU3VibWl0PzogKCkgPT4gdm9pZCk6IENoYXRRdWVzdGlvbkNhcm91c2VsUGFydCB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRjb25zdCBvcHRpb25zOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxPcHRpb25zID0ge1xuXHRcdFx0b25TdWJtaXQ6IChhbnN3ZXJzKSA9PiB7XG5cdFx0XHRcdHN1Ym1pdHRlZEFuc3dlcnMgPSBhbnN3ZXJzO1xuXHRcdFx0XHRvblN1Ym1pdD8uKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR3aWRnZXQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LCBjYXJvdXNlbCwgY3JlYXRlTW9ja0NvbnRleHQoKSwgb3B0aW9ucykpO1xuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3aWRnZXQuZG9tTm9kZSk7XG5cdFx0cmV0dXJuIHdpZGdldDtcblx0fVxuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRpZiAod2lkZ2V0Py5kb21Ob2RlPy5wYXJlbnROb2RlKSB7XG5cdFx0XHR3aWRnZXQuZG9tTm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0XHR9XG5cdFx0c3VibWl0dGVkQW5zd2VycyA9IG51bGw7XG5cdH0pO1xuXG5cdHN1aXRlKCdCYXNpYyBSZW5kZXJpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVuZGVycyBjYXJvdXNlbCBjb250YWluZXIgd2l0aCBwcm9wZXIgc3RydWN0dXJlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXF1ZXN0aW9uLWNhcm91c2VsLWNvbnRhaW5lcicpKTtcblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1oZWFkZXItcm93JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLWNvbnRlbnQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIHF1ZXN0aW9uIHRpdGxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnV2hhdCBpcyB5b3VyIG5hbWU/JywgbWVzc2FnZTogJ1doYXQgaXMgeW91ciBuYW1lPycgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCB0aXRsZSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXRpdGxlJyk7XG5cdFx0XHRhc3NlcnQub2sodGl0bGUpO1xuXHRcdFx0Ly8gVGl0bGUgaW5jbHVkZXMgcHJvZ3Jlc3MgcHJlZml4IGxpa2UgXCIoMS8xKSBXaGF0IGlzIHlvdXIgbmFtZT9cIlxuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlPy50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ1doYXQgaXMgeW91ciBuYW1lPycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgcXVlc3Rpb24gdGl0bGUgd2hlbiBtZXNzYWdlIGlzIG5vdCBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ0ZhbGxiYWNrIHRpdGxlIHRleHQnIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgdGl0bGUgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi10aXRsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlLCAndGl0bGUgZWxlbWVudCBzaG91bGQgZXhpc3Qgd2hlbiBvbmx5IHRpdGxlIGlzIHByb3ZpZGVkJyk7XG5cdFx0XHQvLyBUaXRsZSBzaG91bGQgZmFsbCBiYWNrIHRvIHRpdGxlIHByb3BlcnR5IHdoZW4gbWVzc2FnZSBpcyBub3QgcHJvdmlkZWRcblx0XHRcdGFzc2VydC5vayh0aXRsZT8udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdGYWxsYmFjayB0aXRsZSB0ZXh0JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBtYXJrZG93biBpbiBxdWVzdGlvbiBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ3RleHQnLFxuXHRcdFx0XHRcdHRpdGxlOiAnUXVlc3Rpb24nLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZygnUGxlYXNlIHJldmlldyAqKmRldGFpbHMqKiBpbiBbZG9jc10oaHR0cHM6Ly9leGFtcGxlLmNvbSknKVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHRpdGxlID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tdGl0bGUnKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZSwgJ3RpdGxlIGVsZW1lbnQgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQub2sodGl0bGU/LnF1ZXJ5U2VsZWN0b3IoJy5yZW5kZXJlZC1tYXJrZG93bicpLCAnbWFya2Rvd24gY29udGVudCBzaG91bGQgYmUgcmVuZGVyZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nhbml0aXplcyBhZ2VudC1wcm92aWRlZCBtYXJrZG93bicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ1F1ZXN0aW9uJyxcblx0XHRcdFx0XHRtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoJyFbcmVtb3RlXShodHRwczovL2V4YW1wbGUuY29tL3F1ZXN0aW9uLnBuZyknKSxcblx0XHRcdFx0XHRkZXRhaWxlZE1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZygnIVtyZW1vdGVdKGh0dHBzOi8vZXhhbXBsZS5jb20vZGV0YWlscy5wbmcpJylcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRjYXJvdXNlbC5tZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKCchW3JlbW90ZV0oaHR0cHM6Ly9leGFtcGxlLmNvbS9jYXJvdXNlbC5wbmcpJyk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2Fyb3VzZWxNZXNzYWdlSW1hZ2VzOiB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1tZXNzYWdlIGltZycpLmxlbmd0aCxcblx0XHRcdFx0cXVlc3Rpb25NZXNzYWdlSW1hZ2VzOiB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1xdWVzdGlvbi10aXRsZSBpbWcnKS5sZW5ndGgsXG5cdFx0XHRcdGRldGFpbGVkTWVzc2FnZUltYWdlczogd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtcXVlc3Rpb24tZGV0YWlsZWQtbWVzc2FnZSBpbWcnKS5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNhcm91c2VsTWVzc2FnZUltYWdlczogMCxcblx0XHRcdFx0cXVlc3Rpb25NZXNzYWdlSW1hZ2VzOiAwLFxuXHRcdFx0XHRkZXRhaWxlZE1lc3NhZ2VJbWFnZXM6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgcGxhaW4gc3RyaW5nIHF1ZXN0aW9uIG1lc3NhZ2UgYXMgdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ1F1ZXN0aW9uJyxcblx0XHRcdFx0XHRtZXNzYWdlOiAnUGxlYXNlIHJldmlldyAqKmRldGFpbHMqKiBpbiBbZG9jc10oaHR0cHM6Ly9leGFtcGxlLmNvbSknXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgdGl0bGUgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi10aXRsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlLCAndGl0bGUgZWxlbWVudCBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZT8udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdkZXRhaWxzJyksICdjb250ZW50IHNob3VsZCBiZSByZW5kZXJlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBwcm9ncmVzcyBpbmRpY2F0b3IgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScsIG1lc3NhZ2U6ICdRdWVzdGlvbiAxJyB9LFxuXHRcdFx0XHR7IGlkOiAncTInLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMicsIG1lc3NhZ2U6ICdRdWVzdGlvbiAyJyB9LFxuXHRcdFx0XHR7IGlkOiAncTMnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMycsIG1lc3NhZ2U6ICdRdWVzdGlvbiAzJyB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdC8vIFByb2dyZXNzIGlzIHNob3duIGluIHRoZSBzdGVwIGluZGljYXRvciBpbiB0aGUgZm9vdGVyIGFzIFwiMS8zXCJcblx0XHRcdGNvbnN0IHN0ZXBJbmRpY2F0b3IgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdGVwLWluZGljYXRvcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0ZXBJbmRpY2F0b3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0ZXBJbmRpY2F0b3I/LnRleHRDb250ZW50Py5pbmNsdWRlcygnMScpKTtcblx0XHRcdGFzc2VydC5vayhzdGVwSW5kaWNhdG9yPy50ZXh0Q29udGVudD8uaW5jbHVkZXMoJzMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIGNsb3NlIGJ1dHRvbiBpbiB0aXRsZSByb3cgZm9yIG11bHRpLXF1ZXN0aW9uIGNhcm91c2VscycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAyJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHRpdGxlUm93ID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tdGl0bGUtcm93Jyk7XG5cdFx0XHRhc3NlcnQub2sodGl0bGVSb3csICd0aXRsZSByb3cgc2hvdWxkIGV4aXN0Jyk7XG5cblx0XHRcdGNvbnN0IGNsb3NlQ29udGFpbmVyID0gdGl0bGVSb3c/LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNsb3NlLWNvbnRhaW5lcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNsb3NlQ29udGFpbmVyLCAnY2xvc2UgYnV0dG9uIGNvbnRhaW5lciBzaG91bGQgYmUgcmVuZGVyZWQgaW4gdGhlIHRpdGxlIHJvdycpO1xuXG5cdFx0XHRjb25zdCBkaXJlY3RDaGlsZENsb3NlQ29udGFpbmVyID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignOnNjb3BlID4gLmNoYXQtcXVlc3Rpb24tY2xvc2UtY29udGFpbmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlyZWN0Q2hpbGRDbG9zZUNvbnRhaW5lciwgbnVsbCwgJ2Nsb3NlIGJ1dHRvbiBjb250YWluZXIgc2hvdWxkIG5vdCBiZSBwb3NpdGlvbmVkIGFzIGEgZGlyZWN0IGNoaWxkIG9mIHRoZSBjYXJvdXNlbCBjb250YWluZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgY29sbGFwc2UgYnV0dG9uIGluIHRpdGxlIHJvdyBldmVuIHdoZW4gc2tpcCBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0sIGZhbHNlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHRpdGxlUm93ID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tdGl0bGUtcm93Jyk7XG5cdFx0XHRhc3NlcnQub2sodGl0bGVSb3csICd0aXRsZSByb3cgc2hvdWxkIGV4aXN0Jyk7XG5cblx0XHRcdGNvbnN0IGNvbGxhcHNlQnV0dG9uID0gdGl0bGVSb3c/LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNvbGxhcHNlLXRvZ2dsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbGxhcHNlQnV0dG9uLCAnY29sbGFwc2UgYnV0dG9uIHNob3VsZCBiZSByZW5kZXJlZCBldmVuIHdoZW4gc2tpcCBpcyBkaXNhYmxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBjb2xsYXBzZSBidXR0b24gdG8gdGhlIHJpZ2h0IG9mIGNsb3NlIGJ1dHRvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAyJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1oZWFkZXItYWN0aW9ucycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbnNDb250YWluZXIsICdhY3Rpb25zIGNvbnRhaW5lciBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGlmICghYWN0aW9uc0NvbnRhaW5lcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjdGlvbkJ1dHRvbnMgPSBBcnJheS5mcm9tKGFjdGlvbnNDb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1idXR0b24nKSk7XG5cdFx0XHRjb25zdCBjbG9zZUluZGV4ID0gYWN0aW9uQnV0dG9ucy5maW5kSW5kZXgoYnV0dG9uID0+IGJ1dHRvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcXVlc3Rpb24tY2xvc2UnKSk7XG5cdFx0XHRjb25zdCBjb2xsYXBzZUluZGV4ID0gYWN0aW9uQnV0dG9ucy5maW5kSW5kZXgoYnV0dG9uID0+IGJ1dHRvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcXVlc3Rpb24tY29sbGFwc2UtdG9nZ2xlJykpO1xuXG5cdFx0XHRhc3NlcnQub2soY2xvc2VJbmRleCA+PSAwLCAnY2xvc2UgYnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbGxhcHNlSW5kZXggPj0gMCwgJ2NvbGxhcHNlIGJ1dHRvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5vayhjb2xsYXBzZUluZGV4ID4gY2xvc2VJbmRleCwgJ2NvbGxhcHNlIGJ1dHRvbiBzaG91bGQgYmUgcG9zaXRpb25lZCB0byB0aGUgcmlnaHQgb2YgY2xvc2UgYnV0dG9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b2dnbGVzIGNvbGxhcHNlZCBzdGF0ZSBhbmQgdXBkYXRlcyBhcmlhLWV4cGFuZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfSxcblx0XHRcdFx0eyBpZDogJ3EyJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDInIH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jb2xsYXBzZS10b2dnbGUnKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGFzc2VydC5vayhjb2xsYXBzZUJ1dHRvbiwgJ2NvbGxhcHNlIGJ1dHRvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsYXBzZUJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSwgJ3RydWUnKTtcblxuXHRcdFx0Y29sbGFwc2VCdXR0b24uY2xpY2soKTtcblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtY29sbGFwc2VkJyksICd3aWRnZXQgc2hvdWxkIGVudGVyIGNvbGxhcHNlZCBzdGF0ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxhcHNlQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAnZmFsc2UnKTtcblx0XHRcdGNvbnN0IGNvbGxhcHNlZFN1bW1hcnkgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jb2xsYXBzZWQtc3VtbWFyeScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxhcHNlZFN1bW1hcnksIG51bGwsICdjb2xsYXBzZWQgbW9kZSBzaG91bGQgbm90IHJlbmRlciBhbiBhZGRpdGlvbmFsIHN1bW1hcnkgc2VjdGlvbicpO1xuXG5cdFx0XHRjb25zdCB0aXRsZVJvdyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXRpdGxlLXJvdycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlUm93LCAnaGVhZGVyIHNob3VsZCByZW1haW4gdmlzaWJsZSB3aGVuIGNvbGxhcHNlZCcpO1xuXG5cdFx0XHRjb25zdCBpbnB1dFNjcm9sbGFibGUgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1pbnB1dC1zY3JvbGxhYmxlJyk7XG5cdFx0XHRhc3NlcnQub2soaW5wdXRTY3JvbGxhYmxlLCAnaW5wdXQgc2VjdGlvbiBleGlzdHMgaW4gRE9NIGJ1dCBpcyBoaWRkZW4gd2hpbGUgY29sbGFwc2VkJyk7XG5cblx0XHRcdGNvbGxhcHNlQnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQub2soIXdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1jb2xsYXBzZWQnKSwgJ3dpZGdldCBzaG91bGQgZXhpdCBjb2xsYXBzZWQgc3RhdGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsYXBzZUJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSwgJ3RydWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3RvcmVzIGRyYWZ0IGNvbGxhcHNlZCBzdGF0ZSBmcm9tIGNhcm91c2VsIGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfSxcblx0XHRcdFx0eyBpZDogJ3EyJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDInIH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y2Fyb3VzZWwuZHJhZnRDb2xsYXBzZWQgPSB0cnVlO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1jb2xsYXBzZWQnKSwgJ3dpZGdldCBzaG91bGQgcmVzdG9yZSBjb2xsYXBzZWQgZHJhZnQgc3RhdGUnKTtcblx0XHRcdGNvbnN0IGNvbGxhcHNlQnV0dG9uID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tY29sbGFwc2UtdG9nZ2xlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGFwc2VCdXR0b24/LmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAnZmFsc2UnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1F1ZXN0aW9uIFR5cGVzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlbmRlcnMgdGV4dCBpbnB1dCBmb3IgdGV4dCB0eXBlIHF1ZXN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ0VudGVyIHlvdXIgbmFtZScgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCBpbnB1dENvbnRhaW5lciA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWlucHV0LWNvbnRhaW5lcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGlucHV0Q29udGFpbmVyKTtcblx0XHRcdGNvbnN0IGlucHV0Qm94ID0gaW5wdXRDb250YWluZXI/LnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28taW5wdXRib3ggaW5wdXQnKTtcblx0XHRcdGFzc2VydC5vayhpbnB1dEJveCwgJ1Nob3VsZCBoYXZlIGFuIGlucHV0IGJveCBmb3IgdGV4dCBxdWVzdGlvbnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgbGlzdCBpdGVtcyBmb3Igc2luZ2xlU2VsZWN0IHR5cGUgcXVlc3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2Ugb25lJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ2EnIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYicsIGxhYmVsOiAnT3B0aW9uIEInLCB2YWx1ZTogJ2InIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgbGlzdEl0ZW1zID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtcXVlc3Rpb24tbGlzdC1pdGVtJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdEl0ZW1zLmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIDIgbGlzdCBpdGVtcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBsaXN0IGl0ZW1zIHdpdGggY2hlY2tib3hlcyBmb3IgbXVsdGlTZWxlY3QgdHlwZSBxdWVzdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAnbXVsdGlTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlOiAnQ2hvb3NlIG11bHRpcGxlJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ2EnIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYicsIGxhYmVsOiAnT3B0aW9uIEInLCB2YWx1ZTogJ2InIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYycsIGxhYmVsOiAnT3B0aW9uIEMnLCB2YWx1ZTogJ2MnIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgbGlzdEl0ZW1zID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtcXVlc3Rpb24tbGlzdC1pdGVtLm11bHRpLXNlbGVjdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RJdGVtcy5sZW5ndGgsIDMsICdTaG91bGQgaGF2ZSAzIGxpc3QgaXRlbXMgZm9yIG11bHRpU2VsZWN0Jyk7XG5cdFx0XHRjb25zdCBjaGVja2JveGVzID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtcXVlc3Rpb24tbGlzdC1jaGVja2JveCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrYm94ZXMubGVuZ3RoLCAzLCAnU2hvdWxkIGhhdmUgMyBjaGVja2JveGVzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmcmVlZm9ybSB0ZXh0YXJlYSBpcyByZW5kZXJlZCBmb3Igc2luZ2xlU2VsZWN0IGJ5IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ0Nob29zZSBvbmUnLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICdhJywgbGFiZWw6ICdPcHRpb24gQScsIHZhbHVlOiAnYScgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCBmcmVlZm9ybVRleHRhcmVhID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tZnJlZWZvcm0tdGV4dGFyZWEnKTtcblx0XHRcdGFzc2VydC5vayhmcmVlZm9ybVRleHRhcmVhLCAnRnJlZWZvcm0gdGV4dGFyZWEgc2hvdWxkIGJlIHJlbmRlcmVkIGJ5IGRlZmF1bHQgZm9yIHNpbmdsZVNlbGVjdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnJlZWZvcm0gdGV4dGFyZWEgaXMgcmVuZGVyZWQgZm9yIG11bHRpU2VsZWN0IGJ5IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAnbXVsdGlTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlOiAnQ2hvb3NlIG11bHRpcGxlJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ2EnIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgZnJlZWZvcm1UZXh0YXJlYSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWZyZWVmb3JtLXRleHRhcmVhJyk7XG5cdFx0XHRhc3NlcnQub2soZnJlZWZvcm1UZXh0YXJlYSwgJ0ZyZWVmb3JtIHRleHRhcmVhIHNob3VsZCBiZSByZW5kZXJlZCBieSBkZWZhdWx0IGZvciBtdWx0aVNlbGVjdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnJlZWZvcm0gdGV4dGFyZWEgaXMgaGlkZGVuIHdoZW4gYWxsb3dGcmVlZm9ybUlucHV0IGlzIGZhbHNlIGZvciBzaW5nbGVTZWxlY3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ0Nob29zZSBvbmUnLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ2EnLCBsYWJlbDogJ09wdGlvbiBBJywgdmFsdWU6ICdhJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2InLCBsYWJlbDogJ09wdGlvbiBCJywgdmFsdWU6ICdiJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGZyZWVmb3JtVGV4dGFyZWEgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1mcmVlZm9ybS10ZXh0YXJlYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZyZWVmb3JtVGV4dGFyZWEsIG51bGwsICdGcmVlZm9ybSB0ZXh0YXJlYSBzaG91bGQgbm90IGJlIHJlbmRlcmVkIHdoZW4gYWxsb3dGcmVlZm9ybUlucHV0IGlzIGZhbHNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmcmVlZm9ybSB0ZXh0YXJlYSBpcyBoaWRkZW4gd2hlbiBhbGxvd0ZyZWVmb3JtSW5wdXQgaXMgZmFsc2UgZm9yIG11bHRpU2VsZWN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ211bHRpU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ0Nob29zZSBtdWx0aXBsZScsXG5cdFx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ2EnIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYicsIGxhYmVsOiAnT3B0aW9uIEInLCB2YWx1ZTogJ2InIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgZnJlZWZvcm1UZXh0YXJlYSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWZyZWVmb3JtLXRleHRhcmVhJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZnJlZWZvcm1UZXh0YXJlYSwgbnVsbCwgJ0ZyZWVmb3JtIHRleHRhcmVhIHNob3VsZCBub3QgYmUgcmVuZGVyZWQgd2hlbiBhbGxvd0ZyZWVmb3JtSW5wdXQgaXMgZmFsc2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHQgb3B0aW9ucyBhcmUgcHJlLXNlbGVjdGVkIGZvciBzaW5nbGVTZWxlY3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ0Nob29zZSBvbmUnLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICdhJywgbGFiZWw6ICdPcHRpb24gQScsIHZhbHVlOiAnYScgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdiJywgbGFiZWw6ICdPcHRpb24gQicsIHZhbHVlOiAnYicgfVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiAnYidcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHQvLyBEZWZhdWx0IG9wdGlvbiAnYicgaXMgcmUtc29ydGVkIHRvIGFwcGVhciBmaXJzdFxuXHRcdFx0Y29uc3QgbGlzdEl0ZW1zID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtcXVlc3Rpb24tbGlzdC1pdGVtJykgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdEl0ZW1zWzBdLmNsYXNzTGlzdC5jb250YWlucygnc2VsZWN0ZWQnKSwgdHJ1ZSwgJ0RlZmF1bHQgb3B0aW9uIHNob3VsZCBiZSByZS1zb3J0ZWQgdG8gZmlyc3QgYW5kIHNlbGVjdGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdEl0ZW1zWzFdLmNsYXNzTGlzdC5jb250YWlucygnc2VsZWN0ZWQnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVmYXVsdCBvcHRpb25zIGFyZSBwcmUtc2VsZWN0ZWQgZm9yIG11bHRpU2VsZWN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ211bHRpU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ0Nob29zZSBtdWx0aXBsZScsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ2EnLCBsYWJlbDogJ09wdGlvbiBBJywgdmFsdWU6ICdhJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2InLCBsYWJlbDogJ09wdGlvbiBCJywgdmFsdWU6ICdiJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2MnLCBsYWJlbDogJ09wdGlvbiBDJywgdmFsdWU6ICdjJyB9XG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IFsnYScsICdjJ11cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHQvLyBEZWZhdWx0IG9wdGlvbnMgJ2EnIGFuZCAnYycgYXJlIHJlLXNvcnRlZCB0byBhcHBlYXIgZmlyc3Rcblx0XHRcdGNvbnN0IGxpc3RJdGVtcyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtaXRlbScpIGFzIE5vZGVMaXN0T2Y8SFRNTEVsZW1lbnQ+O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RJdGVtc1swXS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoZWNrZWQnKSwgdHJ1ZSwgJ0ZpcnN0IGRlZmF1bHQgb3B0aW9uIHNob3VsZCBiZSBjaGVja2VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdEl0ZW1zWzFdLmNsYXNzTGlzdC5jb250YWlucygnY2hlY2tlZCcpLCB0cnVlLCAnU2Vjb25kIGRlZmF1bHQgb3B0aW9uIHNob3VsZCBiZSBjaGVja2VkIChyZS1zb3J0ZWQgZnJvbSB0aGlyZCknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0SXRlbXNbMl0uY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGVja2VkJyksIGZhbHNlLCAnTm9uLWRlZmF1bHQgb3B0aW9uIHNob3VsZCBub3QgYmUgY2hlY2tlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2luZ2xlU2VsZWN0IGtlZXBzIHZhbHVlIG1hcHBpbmcgYWZ0ZXIgZGVmYXVsdC1maXJzdCByZW9yZGVyaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2Ugb25lJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ3ZhbHVlX2EnIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYicsIGxhYmVsOiAnT3B0aW9uIEInLCB2YWx1ZTogJ3ZhbHVlX2InIH1cblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHRWYWx1ZTogJ2InXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgbGlzdEl0ZW1zID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtcXVlc3Rpb24tbGlzdC1pdGVtJykgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdEl0ZW1zLmxlbmd0aCwgMiwgJ0V4cGVjdGVkIHR3byBvcHRpb25zJyk7XG5cdFx0XHRsaXN0SXRlbXNbMV0uY2xpY2soKTsgLy8gT3B0aW9uIEEgYWZ0ZXIgZGVmYXVsdC1maXJzdCBvcmRlcmluZ1xuXG5cdFx0XHRjb25zdCBhbnN3ZXIgPSBzdWJtaXR0ZWRBbnN3ZXJzPy5nZXQoJ3ExJykgYXMgeyBzZWxlY3RlZFZhbHVlOiB1bmtub3duOyBmcmVlZm9ybVZhbHVlOiB1bmtub3duIH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5zd2VyLnNlbGVjdGVkVmFsdWUsICd2YWx1ZV9hJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5zd2VyLmZyZWVmb3JtVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aVNlbGVjdCBrZWVwcyB2YWx1ZSBtYXBwaW5nIGFmdGVyIGRlZmF1bHQtZmlyc3QgcmVvcmRlcmluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICdtdWx0aVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2UgbXVsdGlwbGUnLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICdhJywgbGFiZWw6ICdPcHRpb24gQScsIHZhbHVlOiAndmFsdWVfYScgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdiJywgbGFiZWw6ICdPcHRpb24gQicsIHZhbHVlOiAndmFsdWVfYicgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdjJywgbGFiZWw6ICdPcHRpb24gQycsIHZhbHVlOiAndmFsdWVfYycgfVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiAnYydcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCBsaXN0SXRlbXMgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1xdWVzdGlvbi1saXN0LWl0ZW0nKSBhcyBOb2RlTGlzdE9mPEhUTUxFbGVtZW50Pjtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0SXRlbXMubGVuZ3RoLCAzLCAnRXhwZWN0ZWQgdGhyZWUgb3B0aW9ucycpO1xuXHRcdFx0bGlzdEl0ZW1zWzFdLmNsaWNrKCk7IC8vIE9wdGlvbiBBIGFmdGVyIGRlZmF1bHQtZmlyc3Qgb3JkZXJpbmdcblxuXHRcdFx0Y29uc3Qgc3VibWl0QnV0dG9uID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VibWl0LWJ1dHRvbicpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdFx0YXNzZXJ0Lm9rKHN1Ym1pdEJ1dHRvbiwgJ1N1Ym1pdCBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRzdWJtaXRCdXR0b24uY2xpY2soKTtcblxuXHRcdFx0Y29uc3QgYW5zd2VyID0gc3VibWl0dGVkQW5zd2Vycz8uZ2V0KCdxMScpIGFzIHsgc2VsZWN0ZWRWYWx1ZXM6IHVua25vd25bXTsgZnJlZWZvcm1WYWx1ZTogdW5rbm93biB9O1xuXHRcdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkoYW5zd2VyLnNlbGVjdGVkVmFsdWVzKSk7XG5cdFx0XHRhc3NlcnQub2soYW5zd2VyLnNlbGVjdGVkVmFsdWVzLmluY2x1ZGVzKCd2YWx1ZV9hJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFuc3dlci5zZWxlY3RlZFZhbHVlcy5pbmNsdWRlcygndmFsdWVfYycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbnN3ZXIuc2VsZWN0ZWRWYWx1ZXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbnN3ZXIuZnJlZWZvcm1WYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHJlbmRlciBhIHN1bW1hcnkgYWZ0ZXIgb25TdWJtaXQgZGlzcG9zZXMgdGhlIHBhcnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbicsIGRlZmF1bHRWYWx1ZTogJ2Fuc3dlcicgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwsICgpID0+IHdpZGdldC5kaXNwb3NlKCkpO1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdWJtaXQtYnV0dG9uJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0XHRzdWJtaXRCdXR0b24uY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXN1bW1hcnknKSwgbnVsbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdOYXZpZ2F0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3ByZXZpb3VzIGJ1dHRvbiBpcyBkaXNhYmxlZCBvbiBmaXJzdCBxdWVzdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAyJyB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IG5hdkFycm93cyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXF1ZXN0aW9uLW5hdi1hcnJvdycpIGFzIE5vZGVMaXN0T2Y8SFRNTEJ1dHRvbkVsZW1lbnQ+O1xuXHRcdFx0Y29uc3QgcHJldkJ1dHRvbiA9IG5hdkFycm93c1swXTtcblx0XHRcdGFzc2VydC5vayhwcmV2QnV0dG9uLCAnUHJldmlvdXMgYnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByZXZCdXR0b24uY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpIHx8IHByZXZCdXR0b24uZGlzYWJsZWQsICdQcmV2aW91cyBidXR0b24gc2hvdWxkIGJlIGRpc2FibGVkIG9uIGZpcnN0IHF1ZXN0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXh0IGJ1dHRvbiBzdGF5cyBhcyBhcnJvdyBhbmQgaXMgZGlzYWJsZWQgb24gbGFzdCBxdWVzdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ09ubHkgUXVlc3Rpb24nIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAyJyB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdC8vIE5hdmlnYXRlIHRvIGxhc3QgcXVlc3Rpb25cblx0XHRcdHdpZGdldC5uYXZpZ2F0ZVRvTmV4dFF1ZXN0aW9uKCk7XG5cblx0XHRcdGNvbnN0IG5hdkFycm93cyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXF1ZXN0aW9uLW5hdi1hcnJvdycpIGFzIE5vZGVMaXN0T2Y8SFRNTEJ1dHRvbkVsZW1lbnQ+O1xuXHRcdFx0Y29uc3QgbmV4dEJ1dHRvbiA9IG5hdkFycm93c1sxXTtcblx0XHRcdGFzc2VydC5vayhuZXh0QnV0dG9uLCAnTmV4dCBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQub2sobmV4dEJ1dHRvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJykgfHwgbmV4dEJ1dHRvbi5kaXNhYmxlZCwgJ05leHQgYnV0dG9uIHNob3VsZCBiZSBkaXNhYmxlZCBvbiBsYXN0IHF1ZXN0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJtaXQgYnV0dG9uIGlzIHNob3duIG9uIGxhc3QgcXVlc3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9LFxuXHRcdFx0XHR7IGlkOiAncTInLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMicgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHQvLyBOYXZpZ2F0ZSB0byBsYXN0IHF1ZXN0aW9uXG5cdFx0XHR3aWRnZXQubmF2aWdhdGVUb05leHRRdWVzdGlvbigpO1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdWJtaXQtYnV0dG9uJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0QnV0dG9uLCAnU3VibWl0IGJ1dHRvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzdWJtaXRCdXR0b24uc3R5bGUuZGlzcGxheSwgJ25vbmUnLCAnU3VibWl0IGJ1dHRvbiBzaG91bGQgYmUgdmlzaWJsZSBvbiBsYXN0IHF1ZXN0aW9uJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTa2lwIEZ1bmN0aW9uYWxpdHknLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2tpcCBzdWNjZWVkcyB3aGVuIGFsbG93U2tpcCBpcyB0cnVlIGFuZCByZXR1cm5zIGRlZmF1bHRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScsIGRlZmF1bHRWYWx1ZTogJ2RlZmF1bHQgYW5zd2VyJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHdpZGdldC5za2lwKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlLCAnc2tpcCgpIHNob3VsZCByZXR1cm4gdHJ1ZSB3aGVuIGFsbG93U2tpcCBpcyB0cnVlJyk7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0dGVkQW5zd2VycyBpbnN0YW5jZW9mIE1hcCwgJ1NraXAgc2hvdWxkIGNhbGwgb25TdWJtaXQgd2l0aCBhIE1hcCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdHRlZEFuc3dlcnM/LmdldCgncTEnKSwgJ2RlZmF1bHQgYW5zd2VyJywgJ1NraXAgc2hvdWxkIHJldHVybiBkZWZhdWx0IHZhbHVlcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcCBmYWlscyB3aGVuIGFsbG93U2tpcCBpcyBmYWxzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0sIGZhbHNlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHdpZGdldC5za2lwKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSwgJ3NraXAoKSBzaG91bGQgcmV0dXJuIGZhbHNlIHdoZW4gYWxsb3dTa2lwIGlzIGZhbHNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2VycywgbnVsbCwgJ29uU3VibWl0IHNob3VsZCBub3QgaGF2ZSBiZWVuIGNhbGxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcCBjYW4gb25seSBiZSBjYWxsZWQgb25jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0d2lkZ2V0LnNraXAoKTtcblx0XHRcdHN1Ym1pdHRlZEFuc3dlcnMgPSBudWxsOyAvLyByZXNldFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gd2lkZ2V0LnNraXAoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlLCAnU2Vjb25kIHNraXAoKSBzaG91bGQgcmV0dXJuIGZhbHNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2VycywgbnVsbCwgJ29uU3VibWl0IHNob3VsZCBub3QgYmUgY2FsbGVkIGFnYWluJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwIG5vLW9wcyB3aGVuIHRoZSBjYXJvdXNlbCB3YXMgYWxyZWFkeSByZXNvbHZlZCBleHRlcm5hbGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScsIGRlZmF1bHRWYWx1ZTogJ2RlZmF1bHQgYW5zd2VyJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdC8vIEEgdm9pY2UgYW5zd2VyIHJlc29sdmVzIHRoZSBjYXJvdXNlbCBkaXJlY3RseSwgYWZ0ZXIgdGhpcyBwYXJ0IGhhc1xuXHRcdFx0Ly8gYWxyZWFkeSByZW5kZXJlZCBpbnRlcmFjdGl2ZWx5LiBUaGUgYXV0by1za2lwIHRoYXQgZmlyZXMgb24gdGhlIG5leHRcblx0XHRcdC8vIHJlcXVlc3Qgc3VibWl0IG11c3Qgbm90IG92ZXJ3cml0ZSBpdCB3aXRoIGRlZmF1bHRzLlxuXHRcdFx0Y2Fyb3VzZWwuaXNVc2VkID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gd2lkZ2V0LnNraXAoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlLCAnc2tpcCgpIG11c3Qgbm90IHJlLXN1Ym1pdCBhIGNhcm91c2VsIHJlc29sdmVkIGVsc2V3aGVyZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdHRlZEFuc3dlcnMsIG51bGwsICdvblN1Ym1pdCBzaG91bGQgbm90IG92ZXJ3cml0ZSB0aGUgZXh0ZXJuYWwgYW5zd2VycycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnSWdub3JlIEZ1bmN0aW9uYWxpdHknLCAoKSA9PiB7XG5cdFx0dGVzdCgnaWdub3JlIHN1Y2NlZWRzIHdoZW4gYWxsb3dTa2lwIGlzIHRydWUgYW5kIHJldHVybnMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfVxuXHRcdFx0XSwgdHJ1ZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB3aWRnZXQuaWdub3JlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlLCAnaWdub3JlKCkgc2hvdWxkIHJldHVybiB0cnVlIHdoZW4gYWxsb3dTa2lwIGlzIHRydWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtaXR0ZWRBbnN3ZXJzLCB1bmRlZmluZWQsICdJZ25vcmUgc2hvdWxkIGNhbGwgb25TdWJtaXQgd2l0aCB1bmRlZmluZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lnbm9yZSBmYWlscyB3aGVuIGFsbG93U2tpcCBpcyBmYWxzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0sIGZhbHNlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHdpZGdldC5pZ25vcmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlLCAnaWdub3JlKCkgc2hvdWxkIHJldHVybiBmYWxzZSB3aGVuIGFsbG93U2tpcCBpcyBmYWxzZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdHRlZEFuc3dlcnMsIG51bGwsICdvblN1Ym1pdCBzaG91bGQgbm90IGhhdmUgYmVlbiBjYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lnbm9yZSBjYW4gb25seSBiZSBjYWxsZWQgb25jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0d2lkZ2V0Lmlnbm9yZSgpO1xuXHRcdFx0c3VibWl0dGVkQW5zd2VycyA9IG51bGw7IC8vIHJlc2V0XG5cdFx0XHRjb25zdCByZXN1bHQgPSB3aWRnZXQuaWdub3JlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSwgJ1NlY29uZCBpZ25vcmUoKSBzaG91bGQgcmV0dXJuIGZhbHNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2VycywgbnVsbCwgJ29uU3VibWl0IHNob3VsZCBub3QgYmUgY2FsbGVkIGFnYWluJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmUgbm8tb3BzIHdoZW4gdGhlIGNhcm91c2VsIHdhcyBhbHJlYWR5IHJlc29sdmVkIGV4dGVybmFsbHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNhcm91c2VsLmlzVXNlZCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHdpZGdldC5pZ25vcmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlLCAnaWdub3JlKCkgbXVzdCBub3QgcmUtc3VibWl0IGEgY2Fyb3VzZWwgcmVzb2x2ZWQgZWxzZXdoZXJlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2VycywgbnVsbCwgJ29uU3VibWl0IHNob3VsZCBub3Qgb3ZlcndyaXRlIHRoZSBleHRlcm5hbCBhbnN3ZXJzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwIGFuZCBpZ25vcmUgYXJlIG11dHVhbGx5IGV4Y2x1c2l2ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0d2lkZ2V0LnNraXAoKTtcblx0XHRcdHN1Ym1pdHRlZEFuc3dlcnMgPSBudWxsOyAvLyByZXNldFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gd2lkZ2V0Lmlnbm9yZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UsICdpZ25vcmUoKSBzaG91bGQgcmV0dXJuIGZhbHNlIGFmdGVyIHNraXAoKScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdHRlZEFuc3dlcnMsIG51bGwsICdvblN1Ym1pdCBzaG91bGQgbm90IGJlIGNhbGxlZCBhZ2FpbicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWNjZXNzaWJpbGl0eScsICgpID0+IHtcblx0XHR0ZXN0KCduYXZpZ2F0aW9uIGFyZWEgaGFzIHByb3BlciByb2xlIGFuZCBhcmlhLWxhYmVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCBuYXYgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1uYXYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXY/LmdldEF0dHJpYnV0ZSgncm9sZScpLCAnbmF2aWdhdGlvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5hdj8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksICdOYXZpZ2F0aW9uIHNob3VsZCBoYXZlIGFyaWEtbGFiZWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbmdsZSBzZWxlY3QgbGlzdCBoYXMgcHJvcGVyIHJvbGUgYW5kIGFyaWEtbGFiZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ0Nob29zZSBvbmUnLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICdhJywgbGFiZWw6ICdPcHRpb24gQScsIHZhbHVlOiAnYScgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdiJywgbGFiZWw6ICdPcHRpb24gQicsIHZhbHVlOiAnYicgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHRjb25zdCBsaXN0ID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tbGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3Q/LmdldEF0dHJpYnV0ZSgncm9sZScpLCAnbGlzdGJveCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3Q/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLCAnQ2hvb3NlIG9uZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGlzdCBpdGVtcyBoYXZlIHByb3BlciByb2xlIGFuZCBhcmlhLXNlbGVjdGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2Ugb25lJyxcblx0XHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnLCB2YWx1ZTogJ2EnIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAnYicsIGxhYmVsOiAnT3B0aW9uIEInLCB2YWx1ZTogJ2InIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgbGlzdEl0ZW1zID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtcXVlc3Rpb24tbGlzdC1pdGVtJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdEl0ZW1zLmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIDIgbGlzdCBpdGVtcycpO1xuXG5cdFx0XHQvLyBGaXJzdCBpdGVtIHNob3VsZCBiZSBhdXRvLXNlbGVjdGVkIChubyBkZWZhdWx0IHZhbHVlLCBzbyBmaXJzdCBpcyBzZWxlY3RlZClcblx0XHRcdGNvbnN0IGZpcnN0SXRlbSA9IGxpc3RJdGVtc1swXSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdEl0ZW0uZ2V0QXR0cmlidXRlKCdyb2xlJyksICdvcHRpb24nKTtcblx0XHRcdGFzc2VydC5vayhmaXJzdEl0ZW0uaWQsICdMaXN0IGl0ZW0gc2hvdWxkIGhhdmUgYW4gaWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdEl0ZW0uZ2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJyksICd0cnVlJywgJ0ZpcnN0IGl0ZW0gc2hvdWxkIGJlIGF1dG8tc2VsZWN0ZWQnKTtcblxuXHRcdFx0Ly8gU2Vjb25kIGl0ZW0gc2hvdWxkIG5vdCBiZSBzZWxlY3RlZFxuXHRcdFx0Y29uc3Qgc2Vjb25kSXRlbSA9IGxpc3RJdGVtc1sxXSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmRJdGVtLmdldEF0dHJpYnV0ZSgncm9sZScpLCAnb3B0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kSXRlbS5nZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnKSwgJ2ZhbHNlJywgJ1Vuc2VsZWN0ZWQgaXRlbSBzaG91bGQgaGF2ZSBhcmlhLXNlbGVjdGVkPWZhbHNlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdoYXNTYW1lQ29udGVudCcsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIHNhbWUgY2Fyb3VzZWwgaW5zdGFuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuaGFzU2FtZUNvbnRlbnQoY2Fyb3VzZWwsIFtdLCB7fSBhcyBuZXZlciksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3IgZGlmZmVyZW50IGNvbnRlbnQgdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgZGlmZmVyZW50Q29udGVudCA9IHsga2luZDogJ21hcmtkb3duJyBhcyBjb25zdCB9IGFzIG5ldmVyO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5oYXNTYW1lQ29udGVudChkaWZmZXJlbnRDb250ZW50LCBbXSwge30gYXMgbmV2ZXIpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBdXRvLUFwcHJvdmUgKFlvbG8gTW9kZSknLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2tpcCByZXR1cm5zIGRlZmF1bHQgdmFsdWVzIGZvciB0ZXh0IHF1ZXN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnLCBkZWZhdWx0VmFsdWU6ICdkZWZhdWx0IHRleHQnIH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0d2lkZ2V0LnNraXAoKTtcblx0XHRcdGFzc2VydC5vayhzdWJtaXR0ZWRBbnN3ZXJzIGluc3RhbmNlb2YgTWFwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtaXR0ZWRBbnN3ZXJzPy5nZXQoJ3ExJyksICdkZWZhdWx0IHRleHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXAgcmV0dXJucyBkZWZhdWx0IHZhbHVlcyBmb3Igc2luZ2xlU2VsZWN0IHF1ZXN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlOiAnQ2hvb3NlIG9uZScsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ2EnLCBsYWJlbDogJ09wdGlvbiBBJywgdmFsdWU6ICd2YWx1ZV9hJyB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJ2InLCBsYWJlbDogJ09wdGlvbiBCJywgdmFsdWU6ICd2YWx1ZV9iJyB9XG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6ICdiJ1xuXHRcdFx0XHR9XG5cdFx0XHRdLCB0cnVlKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdHdpZGdldC5za2lwKCk7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0dGVkQW5zd2VycyBpbnN0YW5jZW9mIE1hcCk7XG5cdFx0XHQvLyBzaW5nbGVTZWxlY3QgYWx3YXlzIHJldHVybnMgc3RydWN0dXJlZCBmb3JtYXQgd2l0aCBmcmVlZm9ybVZhbHVlXG5cdFx0XHRjb25zdCBhbnN3ZXIgPSBzdWJtaXR0ZWRBbnN3ZXJzPy5nZXQoJ3ExJykgYXMgeyBzZWxlY3RlZFZhbHVlOiB1bmtub3duOyBmcmVlZm9ybVZhbHVlOiB1bmtub3duIH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5zd2VyLnNlbGVjdGVkVmFsdWUsICd2YWx1ZV9iJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5zd2VyLmZyZWVmb3JtVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwIHJldHVybnMgZGVmYXVsdCB2YWx1ZXMgZm9yIG11bHRpU2VsZWN0IHF1ZXN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdHR5cGU6ICdtdWx0aVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdDaG9vc2UgbXVsdGlwbGUnLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICdhJywgbGFiZWw6ICdPcHRpb24gQScsIHZhbHVlOiAndmFsdWVfYScgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdiJywgbGFiZWw6ICdPcHRpb24gQicsIHZhbHVlOiAndmFsdWVfYicgfSxcblx0XHRcdFx0XHRcdHsgaWQ6ICdjJywgbGFiZWw6ICdPcHRpb24gQycsIHZhbHVlOiAndmFsdWVfYycgfVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBbJ2EnLCAnYyddXG5cdFx0XHRcdH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0d2lkZ2V0LnNraXAoKTtcblx0XHRcdGFzc2VydC5vayhzdWJtaXR0ZWRBbnN3ZXJzIGluc3RhbmNlb2YgTWFwKTtcblx0XHRcdC8vIG11bHRpU2VsZWN0IGFsd2F5cyByZXR1cm5zIHN0cnVjdHVyZWQgZm9ybWF0IHdpdGggZnJlZWZvcm1WYWx1ZVxuXHRcdFx0Y29uc3QgYW5zd2VyID0gc3VibWl0dGVkQW5zd2Vycz8uZ2V0KCdxMScpIGFzIHsgc2VsZWN0ZWRWYWx1ZXM6IHVua25vd25bXTsgZnJlZWZvcm1WYWx1ZTogdW5rbm93biB9O1xuXHRcdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkoYW5zd2VyLnNlbGVjdGVkVmFsdWVzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5zd2VyLnNlbGVjdGVkVmFsdWVzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQub2soYW5zd2VyLnNlbGVjdGVkVmFsdWVzLmluY2x1ZGVzKCd2YWx1ZV9hJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFuc3dlci5zZWxlY3RlZFZhbHVlcy5pbmNsdWRlcygndmFsdWVfYycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbnN3ZXIuZnJlZWZvcm1WYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXAgcmV0dXJucyBkZWZhdWx0cyBmb3IgbXVsdGlwbGUgcXVlc3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnVGV4dCBRdWVzdGlvbicsIGRlZmF1bHRWYWx1ZTogJ3RleHQgZGVmYXVsdCcgfSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncTInLFxuXHRcdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlOiAnU2luZ2xlIFNlbGVjdCcsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ29wdDEnLCBsYWJlbDogJ0ZpcnN0JywgdmFsdWU6ICdmaXJzdF92YWx1ZScgfVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiAnb3B0MSdcblx0XHRcdFx0fVxuXHRcdFx0XSwgdHJ1ZSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXG5cdFx0XHR3aWRnZXQuc2tpcCgpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1Ym1pdHRlZEFuc3dlcnMgaW5zdGFuY2VvZiBNYXApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdHRlZEFuc3dlcnM/LmdldCgncTEnKSwgJ3RleHQgZGVmYXVsdCcpO1xuXHRcdFx0Ly8gc2luZ2xlU2VsZWN0IGFsd2F5cyByZXR1cm5zIHN0cnVjdHVyZWQgZm9ybWF0IHdpdGggZnJlZWZvcm1WYWx1ZVxuXHRcdFx0Y29uc3QgYW5zd2VyID0gc3VibWl0dGVkQW5zd2Vycz8uZ2V0KCdxMicpIGFzIHsgc2VsZWN0ZWRWYWx1ZTogdW5rbm93bjsgZnJlZWZvcm1WYWx1ZTogdW5rbm93biB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFuc3dlci5zZWxlY3RlZFZhbHVlLCAnZmlyc3RfdmFsdWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbnN3ZXIuZnJlZWZvcm1WYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXAgcmV0dXJucyBlbXB0eSBtYXAgd2hlbiBubyBkZWZhdWx0cyBhcmUgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiB3aXRob3V0IGRlZmF1bHQnIH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0d2lkZ2V0LnNraXAoKTtcblx0XHRcdGFzc2VydC5vayhzdWJtaXR0ZWRBbnN3ZXJzIGluc3RhbmNlb2YgTWFwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJtaXR0ZWRBbnN3ZXJzPy5zaXplLCAwLCAnU2hvdWxkIHJldHVybiBlbXB0eSBtYXAgd2hlbiBubyBkZWZhdWx0cycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVXNlZCBDYXJvdXNlbCBTdW1tYXJ5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldGFpbnMgY3VycmVudCBxdWVzdGlvbiBhZnRlciBuYXZpZ2F0aW9uIHdpdGhvdXQgZWRpdGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9LFxuXHRcdFx0XHR7IGlkOiAncTInLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMicgfVxuXHRcdFx0XSwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGZpcnN0V2lkZ2V0ID0gY3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblx0XHRcdGNvbnN0IG5leHRCdXR0b24gPSBmaXJzdFdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLW5hdi1uZXh0JykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0YXNzZXJ0Lm9rKG5leHRCdXR0b24sICduZXh0IGJ1dHRvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdG5leHRCdXR0b24uZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0XHRmaXJzdFdpZGdldC5kaXNwb3NlKCk7XG5cdFx0XHRmaXJzdFdpZGdldC5kb21Ob2RlLnJlbW92ZSgpO1xuXG5cdFx0XHRjb25zdCByZWNyZWF0ZWRXaWRnZXQgPSBjcmVhdGVXaWRnZXQoY2Fyb3VzZWwpO1xuXHRcdFx0Y29uc3Qgc3RlcEluZGljYXRvciA9IHJlY3JlYXRlZFdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN0ZXAtaW5kaWNhdG9yJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RlcEluZGljYXRvcj8udGV4dENvbnRlbnQsICcyLzInLCAnc2hvdWxkIHJlc3RvcmUgdGhlIGN1cnJlbnQgcXVlc3Rpb24gaW5kZXggYWZ0ZXIgbmF2aWdhdGlvbicpO1xuXG5cdFx0XHRjb25zdCB0aXRsZSA9IHJlY3JlYXRlZFdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXRpdGxlJyk7XG5cdFx0XHRhc3NlcnQub2sodGl0bGU/LnRleHRDb250ZW50Py5pbmNsdWRlcygnUXVlc3Rpb24gMicpLCAnc2hvdWxkIHJlc3RvcmUgdG8gdGhlIHNlY29uZCBxdWVzdGlvbiB2aWV3Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXRhaW5zIGRyYWZ0IGFuc3dlcnMgYW5kIGN1cnJlbnQgcXVlc3Rpb24gYWZ0ZXIgd2lkZ2V0IHJlY3JlYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfSxcblx0XHRcdFx0eyBpZDogJ3EyJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDInIH1cblx0XHRcdF0sIHRydWUpO1xuXG5cdFx0XHRjb25zdCBmaXJzdFdpZGdldCA9IGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cdFx0XHRjb25zdCBmaXJzdElucHV0ID0gZmlyc3RXaWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWlucHV0Ym94IGlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudCB8IG51bGw7XG5cdFx0XHRhc3NlcnQub2soZmlyc3RJbnB1dCwgJ2ZpcnN0IHF1ZXN0aW9uIGlucHV0IHNob3VsZCBleGlzdCcpO1xuXHRcdFx0Zmlyc3RJbnB1dC52YWx1ZSA9ICdmaXJzdCBkcmFmdCBhbnN3ZXInO1xuXHRcdFx0Zmlyc3RJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0XHRjb25zdCBuZXh0QnV0dG9uID0gZmlyc3RXaWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1uYXYtbmV4dCcpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRcdGFzc2VydC5vayhuZXh0QnV0dG9uLCAnbmV4dCBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRuZXh0QnV0dG9uLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdFx0Y29uc3Qgc2Vjb25kSW5wdXQgPSBmaXJzdFdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28taW5wdXRib3ggaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcblx0XHRcdGFzc2VydC5vayhzZWNvbmRJbnB1dCwgJ3NlY29uZCBxdWVzdGlvbiBpbnB1dCBzaG91bGQgZXhpc3QnKTtcblx0XHRcdHNlY29uZElucHV0LnZhbHVlID0gJ3NlY29uZCBkcmFmdCBhbnN3ZXInO1xuXHRcdFx0c2Vjb25kSW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdFx0Zmlyc3RXaWRnZXQuZGlzcG9zZSgpO1xuXHRcdFx0Zmlyc3RXaWRnZXQuZG9tTm9kZS5yZW1vdmUoKTtcblxuXHRcdFx0Y29uc3QgcmVjcmVhdGVkV2lkZ2V0ID0gY3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblx0XHRcdGNvbnN0IHN0ZXBJbmRpY2F0b3IgPSByZWNyZWF0ZWRXaWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdGVwLWluZGljYXRvcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ZXBJbmRpY2F0b3I/LnRleHRDb250ZW50LCAnMi8yJywgJ3Nob3VsZCByZXN0b3JlIHRoZSBjdXJyZW50IHF1ZXN0aW9uIGluZGV4Jyk7XG5cblx0XHRcdGNvbnN0IHJlY3JlYXRlZFNlY29uZElucHV0ID0gcmVjcmVhdGVkV2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1pbnB1dGJveCBpbnB1dCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlY3JlYXRlZFNlY29uZElucHV0LCAncmVjcmVhdGVkIHNlY29uZCBxdWVzdGlvbiBpbnB1dCBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNyZWF0ZWRTZWNvbmRJbnB1dC52YWx1ZSwgJ3NlY29uZCBkcmFmdCBhbnN3ZXInLCAnc2hvdWxkIHJlc3RvcmUgZHJhZnQgaW5wdXQgZm9yIGN1cnJlbnQgcXVlc3Rpb24nKTtcblxuXHRcdFx0Y29uc3QgcHJldkJ1dHRvbiA9IHJlY3JlYXRlZFdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLW5hdi1wcmV2JykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0YXNzZXJ0Lm9rKHByZXZCdXR0b24sICdwcmV2aW91cyBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRwcmV2QnV0dG9uLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdFx0Y29uc3QgcmVjcmVhdGVkRmlyc3RJbnB1dCA9IHJlY3JlYXRlZFdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28taW5wdXRib3ggaW5wdXQnKSBhcyBIVE1MSW5wdXRFbGVtZW50IHwgbnVsbDtcblx0XHRcdGFzc2VydC5vayhyZWNyZWF0ZWRGaXJzdElucHV0LCAncmVjcmVhdGVkIGZpcnN0IHF1ZXN0aW9uIGlucHV0IHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY3JlYXRlZEZpcnN0SW5wdXQudmFsdWUsICdmaXJzdCBkcmFmdCBhbnN3ZXInLCAnc2hvdWxkIHJlc3RvcmUgZHJhZnQgaW5wdXQgZm9yIHByZXZpb3VzIHF1ZXN0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBzdW1tYXJ5IHdpdGggYW5zd2VycyBhZnRlciBza2lwKCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJywgZGVmYXVsdFZhbHVlOiAnZGVmYXVsdCBhbnN3ZXInIH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0d2lkZ2V0LnNraXAoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC11c2VkJyksICdTaG91bGQgaGF2ZSB1c2VkIGNsYXNzJyk7XG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtc3VtbWFyeScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1bW1hcnksICdTaG91bGQgc2hvdyBzdW1tYXJ5IGNvbnRhaW5lciBhZnRlciBza2lwJyk7XG5cdFx0XHRjb25zdCBzdW1tYXJ5SXRlbSA9IHN1bW1hcnk/LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktaXRlbScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1bW1hcnlJdGVtLCAnU2hvdWxkIGhhdmUgc3VtbWFyeSBpdGVtIGZvciB0aGUgcXVlc3Rpb24nKTtcblx0XHRcdGNvbnN0IHN1bW1hcnlWYWx1ZSA9IHN1bW1hcnlJdGVtPy5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWFuc3dlci10aXRsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1bW1hcnlWYWx1ZT8udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdkZWZhdWx0IGFuc3dlcicpLCAnU3VtbWFyeSBzaG91bGQgc2hvdyB0aGUgZGVmYXVsdCBhbnN3ZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIHNraXBwZWQgbWVzc2FnZSBhZnRlciBpZ25vcmUoKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnIH1cblx0XHRcdF0sIHRydWUpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0d2lkZ2V0Lmlnbm9yZSgpO1xuXG5cdFx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXVzZWQnKSwgJ1Nob3VsZCBoYXZlIHVzZWQgY2xhc3MnKTtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1zdW1tYXJ5Jyk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeSwgJ1Nob3VsZCBzaG93IHN1bW1hcnkgY29udGFpbmVyIGFmdGVyIGlnbm9yZScpO1xuXHRcdFx0Y29uc3Qgc2tpcHBlZE1lc3NhZ2UgPSBzdW1tYXJ5Py5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LXNraXBwZWQnKTtcblx0XHRcdGFzc2VydC5vayhza2lwcGVkTWVzc2FnZSwgJ1Nob3VsZCBzaG93IHNraXBwZWQgbWVzc2FnZSB3aGVuIGlnbm9yZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgc3VtbWFyeSB3aGVuIGNvbnN0cnVjdGVkIHdpdGggaXNVc2VkIGFuZCBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCA9IHtcblx0XHRcdFx0a2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLFxuXHRcdFx0XHRxdWVzdGlvbnM6IFtcblx0XHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRhbGxvd1NraXA6IHRydWUsXG5cdFx0XHRcdGlzVXNlZDogdHJ1ZSxcblx0XHRcdFx0ZGF0YTogeyBxMTogJ3NhdmVkIGFuc3dlcicgfVxuXHRcdFx0fTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtdXNlZCcpLCAnU2hvdWxkIGhhdmUgdXNlZCBjbGFzcycpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXN1bW1hcnknKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5LCAnU2hvdWxkIHNob3cgc3VtbWFyeSBjb250YWluZXIgd2hlbiBpc1VzZWQgaXMgdHJ1ZScpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeVZhbHVlID0gc3VtbWFyeT8ucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1hbnN3ZXItdGl0bGUnKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5VmFsdWU/LnRleHRDb250ZW50Py5pbmNsdWRlcygnc2F2ZWQgYW5zd2VyJyksICdTdW1tYXJ5IHNob3VsZCBzaG93IHNhdmVkIGFuc3dlciBmcm9tIGRhdGEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgY29udmVyc2F0aW9uYWwgc3VtbWFyeSB3aXRoIGV4cGFuZGFibGUgc2VsZWN0ZWQgb3B0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShbe1xuXHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdHRpdGxlOiAnV2hhdCBzaG91bGQgd2UgcHJpb3JpdGl6ZSBpZiB0aGUgcmVmYWN0b3IgYWZmZWN0cyBtdWx0aXBsZSBwbGF0Zm9ybXMgYW5kIG1heSByZXF1aXJlIG1pZ3JhdGlvbiB3b3JrPycsXG5cdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHR7IGlkOiAnZml4JywgbGFiZWw6ICdGaXggYSBidWcnLCB2YWx1ZTogJ2ZpeCcgfSxcblx0XHRcdFx0XHR7IGlkOiAnZmVhdHVyZScsIGxhYmVsOiAnSW1wbGVtZW50IGEgZmVhdHVyZScsIHZhbHVlOiAnZmVhdHVyZScgfSxcblx0XHRcdFx0XSxcblx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsIHsgcTE6IHsgc2VsZWN0ZWRWYWx1ZTogJ2ZpeCcgfSB9LCB0cnVlKTtcblx0XHRcdGNhcm91c2VsLmFuc3dlclByZXNlbnRhdGlvbiA9ICdjb252ZXJzYXRpb24nO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsLnRvSlNPTigpKTtcblxuXHRcdFx0Y29uc3QgcXVlc3Rpb24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LXF1ZXN0aW9uJyk7XG5cdFx0XHRjb25zdCBhbnN3ZXJCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1hbnN3ZXItY29sbGFwc2libGUgLm1vbmFjby1idXR0b24nKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0XHRhc3NlcnQub2socXVlc3Rpb24gJiYgYW5zd2VyQnV0dG9uKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LW9wdGlvbi1saXN0JyksIG51bGwpO1xuXHRcdFx0YW5zd2VyQnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRxdWVzdGlvbjogcXVlc3Rpb24udGV4dENvbnRlbnQsXG5cdFx0XHRcdHF1ZXN0aW9uRXhwYW5kYWJsZTogcXVlc3Rpb24uaGFzQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksXG5cdFx0XHRcdGFuc3dlcjogYW5zd2VyQnV0dG9uLnRleHRDb250ZW50LFxuXHRcdFx0XHRhbnN3ZXJFeHBhbmRlZDogYW5zd2VyQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLFxuXHRcdFx0XHRhbnN3ZXJJY29uOiBhbnN3ZXJCdXR0b24ucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1hbnN3ZXItaWNvbicpPy5jbGFzc0xpc3QuY29udGFpbnMoJ2NvZGljb24tY29tbWVudCcpLFxuXHRcdFx0XHRoYXNDaGV2cm9uOiAhIWFuc3dlckJ1dHRvbi5xdWVyeVNlbGVjdG9yKCcuY2hhdC1jb2xsYXBzaWJsZS1ob3Zlci1jaGV2cm9uJyksXG5cdFx0XHRcdG9wdGlvbnNUaXRsZTogd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1vcHRpb25zLXRpdGxlJyk/LnRleHRDb250ZW50LFxuXHRcdFx0XHRvcHRpb25zOiBBcnJheS5mcm9tKHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9uJykpLm1hcChvcHRpb24gPT4gKHtcblx0XHRcdFx0XHRsYWJlbDogb3B0aW9uLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9uLWxhYmVsJyk/LnRleHRDb250ZW50LFxuXHRcdFx0XHRcdHNlbGVjdGVkOiBvcHRpb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdzZWxlY3RlZCcpLFxuXHRcdFx0XHRcdGhhc0NvbXBhY3RDaGVjazogISFvcHRpb24ucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1vcHRpb24tc2VsZWN0ZWQgLmNvZGljb24tY2hlY2stY29tcGFjdCcpLFxuXHRcdFx0XHR9KSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHF1ZXN0aW9uOiAnUXVlc3Rpb246IFdoYXQgc2hvdWxkIHdlIHByaW9yaXRpemUgaWYgdGhlIHJlZmFjdG9yIGFmZmVjdHMgbXVsdGlwbGUgcGxhdGZvcm1zIGFuZCBtYXkgcmVxdWlyZSBtaWdyYXRpb24gd29yaz8nLFxuXHRcdFx0XHRhbnN3ZXI6ICdBbnN3ZXJlZDogRml4IGEgYnVnJyxcblx0XHRcdFx0cXVlc3Rpb25FeHBhbmRhYmxlOiBmYWxzZSxcblx0XHRcdFx0YW5zd2VyRXhwYW5kZWQ6ICd0cnVlJyxcblx0XHRcdFx0YW5zd2VySWNvbjogdHJ1ZSxcblx0XHRcdFx0aGFzQ2hldnJvbjogdHJ1ZSxcblx0XHRcdFx0b3B0aW9uc1RpdGxlOiAnT3B0aW9ucycsXG5cdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHR7IGxhYmVsOiAnRml4IGEgYnVnJywgc2VsZWN0ZWQ6IHRydWUsIGhhc0NvbXBhY3RDaGVjazogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICdJbXBsZW1lbnQgYSBmZWF0dXJlJywgc2VsZWN0ZWQ6IGZhbHNlLCBoYXNDb21wYWN0Q2hlY2s6IGZhbHNlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgYSBub24taW50ZXJhY3RpdmUgY29sbGFwc2libGUgaGVhZGVyIGZvciBmcmVlIHJlc3BvbnNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShbe1xuXHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0dHlwZTogJ3RleHQnLFxuXHRcdFx0XHR0aXRsZTogJ1doYXQgd291bGQgeW91IGxpa2UgbWUgdG8gaGVscCB5b3Ugd2l0aD8nLFxuXHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgeyBxMTogJ1JldmlldyB0aGUgY2hhbmdlcycgfSwgdHJ1ZSk7XG5cdFx0XHRjYXJvdXNlbC5hbnN3ZXJQcmVzZW50YXRpb24gPSAnY29udmVyc2F0aW9uJztcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbC50b0pTT04oKSk7XG5cblx0XHRcdGNvbnN0IGFuc3dlckJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWFuc3dlci1jb2xsYXBzaWJsZSAubW9uYWNvLWJ1dHRvbicpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRhbnN3ZXI6IGFuc3dlckJ1dHRvbj8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGRpc2FibGVkOiBhbnN3ZXJCdXR0b24/LmdldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpLFxuXHRcdFx0XHR0YWJJbmRleDogYW5zd2VyQnV0dG9uPy50YWJJbmRleCxcblx0XHRcdFx0ZXhwYW5kZWQ6IGFuc3dlckJ1dHRvbj8uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksXG5cdFx0XHRcdGhhc0NoZXZyb246ICEhYW5zd2VyQnV0dG9uPy5xdWVyeVNlbGVjdG9yKCcuY2hhdC1jb2xsYXBzaWJsZS1ob3Zlci1jaGV2cm9uJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGFuc3dlcjogJ0Fuc3dlcmVkOiBSZXZpZXcgdGhlIGNoYW5nZXMnLFxuXHRcdFx0XHRkaXNhYmxlZDogJ3RydWUnLFxuXHRcdFx0XHR0YWJJbmRleDogLTEsXG5cdFx0XHRcdGV4cGFuZGVkOiBudWxsLFxuXHRcdFx0XHRoYXNDaGV2cm9uOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3Mgc2tpcHBlZCBtZXNzYWdlIHdoZW4gY29uc3RydWN0ZWQgd2l0aCBpc1VzZWQgYnV0IG5vIGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbDogSUNoYXRRdWVzdGlvbkNhcm91c2VsID0ge1xuXHRcdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsXG5cdFx0XHRcdHF1ZXN0aW9uczogW1xuXHRcdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdRdWVzdGlvbiAxJyB9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdGFsbG93U2tpcDogdHJ1ZSxcblx0XHRcdFx0aXNVc2VkOiB0cnVlXG5cdFx0XHR9O1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC11c2VkJyksICdTaG91bGQgaGF2ZSB1c2VkIGNsYXNzJyk7XG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtc3VtbWFyeScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1bW1hcnksICdTaG91bGQgc2hvdyBzdW1tYXJ5IGNvbnRhaW5lcicpO1xuXHRcdFx0Y29uc3Qgc2tpcHBlZE1lc3NhZ2UgPSBzdW1tYXJ5Py5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LXNraXBwZWQnKTtcblx0XHRcdGFzc2VydC5vayhza2lwcGVkTWVzc2FnZSwgJ1Nob3VsZCBzaG93IHNraXBwZWQgbWVzc2FnZSB3aGVuIG5vIGRhdGEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgYSBza2lwcGVkIGNvbnZlcnNhdGlvbmFsIHF1ZXN0aW9uIHdpdGggaXRzIG9wdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbDogSUNoYXRRdWVzdGlvbkNhcm91c2VsID0ge1xuXHRcdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsXG5cdFx0XHRcdHF1ZXN0aW9uczogW3tcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZTogJ1doaWNoIGVudmlyb25tZW50PycsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJ3N0YWdpbmcnLCBsYWJlbDogJ1N0YWdpbmcnLCB2YWx1ZTogJ3N0YWdpbmcnIH0sXG5cdFx0XHRcdFx0XHR7IGlkOiAncHJvZHVjdGlvbicsIGxhYmVsOiAnUHJvZHVjdGlvbicsIHZhbHVlOiAncHJvZHVjdGlvbicgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0YWxsb3dTa2lwOiB0cnVlLFxuXHRcdFx0XHRpc1VzZWQ6IHRydWUsXG5cdFx0XHRcdGFuc3dlclByZXNlbnRhdGlvbjogJ2NvbnZlcnNhdGlvbicsXG5cdFx0XHR9O1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgYW5zd2VyQnV0dG9uID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tYW5zd2VyLWNvbGxhcHNpYmxlIC5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0YXNzZXJ0Lm9rKGFuc3dlckJ1dHRvbik7XG5cdFx0XHRhbnN3ZXJCdXR0b24uY2xpY2soKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRxdWVzdGlvbjogd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1xdWVzdGlvbicpPy50ZXh0Q29udGVudCxcblx0XHRcdFx0YW5zd2VyOiBhbnN3ZXJCdXR0b24udGV4dENvbnRlbnQsXG5cdFx0XHRcdGFuc3dlckljb246IGFuc3dlckJ1dHRvbi5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWFuc3dlci1pY29uJyk/LmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbi1jbG9zZS1jb21wYWN0JyksXG5cdFx0XHRcdGhhc0NoZXZyb246ICEhYW5zd2VyQnV0dG9uLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWNvbGxhcHNpYmxlLWhvdmVyLWNoZXZyb24nKSxcblx0XHRcdFx0b3B0aW9uczogQXJyYXkuZnJvbSh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LW9wdGlvbi1sYWJlbCcpKS5tYXAob3B0aW9uID0+IG9wdGlvbi50ZXh0Q29udGVudCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHF1ZXN0aW9uOiAnUXVlc3Rpb246IFdoaWNoIGVudmlyb25tZW50PycsXG5cdFx0XHRcdGFuc3dlcjogJ1NraXBwZWQgcXVlc3Rpb24nLFxuXHRcdFx0XHRhbnN3ZXJJY29uOiB0cnVlLFxuXHRcdFx0XHRoYXNDaGV2cm9uOiB0cnVlLFxuXHRcdFx0XHRvcHRpb25zOiBbJ1N0YWdpbmcnLCAnUHJvZHVjdGlvbiddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBhbnN3ZXJlZCBtZXNzYWdlIHdoZW4gYW5zd2VyZWRFeHRlcm5hbGx5IGJ1dCBubyBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCA9IHtcblx0XHRcdFx0a2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLFxuXHRcdFx0XHRxdWVzdGlvbnM6IFtcblx0XHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnUXVlc3Rpb24gMScgfVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRhbGxvd1NraXA6IHRydWUsXG5cdFx0XHRcdGlzVXNlZDogdHJ1ZSxcblx0XHRcdFx0YW5zd2VyZWRFeHRlcm5hbGx5OiB0cnVlLFxuXHRcdFx0XHRhbnN3ZXJQcmVzZW50YXRpb246ICdjb252ZXJzYXRpb24nLFxuXHRcdFx0fTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtdXNlZCcpLCAnU2hvdWxkIGhhdmUgdXNlZCBjbGFzcycpO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXN1bW1hcnknKTtcblx0XHRcdGFzc2VydC5vayhzdW1tYXJ5LCAnU2hvdWxkIHNob3cgc3VtbWFyeSBjb250YWluZXInKTtcblx0XHRcdGFzc2VydC5vayghc3VtbWFyeT8ucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1za2lwcGVkJyksICdTaG91bGQgbm90IHNob3cgc2tpcHBlZCBtZXNzYWdlJyk7XG5cdFx0XHRhc3NlcnQub2soc3VtbWFyeT8ucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1hbnN3ZXJlZCcpLCAnU2hvdWxkIHNob3cgYW5zd2VyZWQgbWVzc2FnZSB3aGVuIGFuc3dlcmVkIGV4dGVybmFsbHknKTtcblx0XHRcdGFzc2VydC5vayghc3VtbWFyeT8ucXVlcnlTZWxlY3RvcignLmNvZGljb24tY29waWxvdC1jb21wYWN0JyksICdTaG91bGQgbm90IHByZXNlbnQgYSBnZW5lcmljIGV4dGVybmFsIGFuc3dlciBhcyBhbiBhdXRvbWF0aWMgcmVwbHknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgYSBDb3BpbG90IGljb24gZm9yIGEgc3RydWN0dXJlZCBhdXRvbWF0aWMgYW5zd2VyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCA9IHtcblx0XHRcdFx0a2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLFxuXHRcdFx0XHRxdWVzdGlvbnM6IFtcblx0XHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnV2hhdCBzaG91bGQgd2Ugd29yayBvbiBuZXh0PycgfVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRhbGxvd1NraXA6IHRydWUsXG5cdFx0XHRcdGlzVXNlZDogdHJ1ZSxcblx0XHRcdFx0YW5zd2VyZWRFeHRlcm5hbGx5OiB0cnVlLFxuXHRcdFx0XHRhdXRvUmVwbHk6IHRydWUsXG5cdFx0XHRcdGFuc3dlclByZXNlbnRhdGlvbjogJ2NvbnZlcnNhdGlvbicsXG5cdFx0XHRcdGRhdGE6IHsgcTE6IEFnZW50SG9zdEF1dG9SZXBseUFuc3dlciB9LFxuXHRcdFx0fTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRxdWVzdGlvbjogd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1xdWVzdGlvbicpPy50ZXh0Q29udGVudCxcblx0XHRcdFx0YW5zd2VyOiB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1hbnN3ZXItY29sbGFwc2libGUgLm1vbmFjby1idXR0b24nKT8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGFuc3dlckljb246IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktYW5zd2VyLWljb24nKT8uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2RpY29uLWNvcGlsb3QtY29tcGFjdCcpLFxuXHRcdFx0XHRoYXNHZW5lcmljTWVzc2FnZTogISF3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWFuc3dlcmVkJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHF1ZXN0aW9uOiAnUXVlc3Rpb246IFdoYXQgc2hvdWxkIHdlIHdvcmsgb24gbmV4dD8nLFxuXHRcdFx0XHRhbnN3ZXI6IGBBbnN3ZXJlZDogJHtBZ2VudEhvc3RBdXRvUmVwbHlBbnN3ZXJ9YCxcblx0XHRcdFx0YW5zd2VySWNvbjogdHJ1ZSxcblx0XHRcdFx0aGFzR2VuZXJpY01lc3NhZ2U6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdEZXNjcmlwdGlvbiBhbmQgTWVzc2FnZScsICgpID0+IHtcblx0XHR0ZXN0KCdyZW5kZXJzIHF1ZXN0aW9uIGRlc2NyaXB0aW9uIHdoZW4gcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdFbWFpbCcsIGRlc2NyaXB0aW9uOiAnRW50ZXIgeW91ciBlbWFpbCBhZGRyZXNzJyB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IGRlc2MgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi1kZXNjcmlwdGlvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlc2MsICdEZXNjcmlwdGlvbiBlbGVtZW50IHNob3VsZCBiZSByZW5kZXJlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlc2M/LnRleHRDb250ZW50LCAnRW50ZXIgeW91ciBlbWFpbCBhZGRyZXNzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZW5kZXIgZGVzY3JpcHRpb24gZWxlbWVudCB3aGVuIG5vdCBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ05hbWUnIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgZGVzYyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWRlc2NyaXB0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzYywgbnVsbCwgJ0Rlc2NyaXB0aW9uIGVsZW1lbnQgc2hvdWxkIG5vdCBleGlzdCB3aGVuIG5vdCBwcm92aWRlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBjYXJvdXNlbC1sZXZlbCBtZXNzYWdlIG9uIGZpcnN0IHF1ZXN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnTmFtZScgfSxcblx0XHRcdFx0eyBpZDogJ3EyJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ0VtYWlsJyB9XG5cdFx0XHRdKTtcblx0XHRcdGNhcm91c2VsLm1lc3NhZ2UgPSAnUGxlYXNlIGZpbGwgaW4gdGhlIGZvbGxvd2luZzonO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLW1lc3NhZ2UnKTtcblx0XHRcdGFzc2VydC5vayhtZXNzYWdlLCAnQ2Fyb3VzZWwgbWVzc2FnZSBzaG91bGQgYmUgcmVuZGVyZWQnKTtcblx0XHRcdGFzc2VydC5vayhtZXNzYWdlPy50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ1BsZWFzZSBmaWxsIGluIHRoZSBmb2xsb3dpbmc6JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBjYXJvdXNlbC1sZXZlbCBtZXNzYWdlIGFzIG1hcmtkb3duJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnTmFtZScgfVxuXHRcdFx0XSk7XG5cdFx0XHRjYXJvdXNlbC5tZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKCcqKkltcG9ydGFudDoqKiBGaWxsIHRoaXMgZm9ybScpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLW1lc3NhZ2UnKTtcblx0XHRcdGFzc2VydC5vayhtZXNzYWdlLCAnQ2Fyb3VzZWwgbWVzc2FnZSBzaG91bGQgYmUgcmVuZGVyZWQnKTtcblx0XHRcdGFzc2VydC5vayhtZXNzYWdlPy5xdWVyeVNlbGVjdG9yKCcucmVuZGVyZWQtbWFya2Rvd24nKSwgJ01lc3NhZ2Ugc2hvdWxkIGJlIHJlbmRlcmVkIGFzIG1hcmtkb3duJyk7XG5cdFx0fSk7XG5cblxuXG5cdFx0dGVzdCgnc2hvd3MgcmVxdWlyZWQgaW5kaWNhdG9yIG9uIHJlcXVpcmVkIHF1ZXN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ05hbWUnLCByZXF1aXJlZDogdHJ1ZSB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHRpdGxlID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tdGl0bGUnKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZT8udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCcqJyksICdSZXF1aXJlZCBpbmRpY2F0b3IgKCopIHNob3VsZCBiZSBzaG93bicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgc2hvdyByZXF1aXJlZCBpbmRpY2F0b3Igb24gb3B0aW9uYWwgcXVlc3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnTmlja25hbWUnIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Y29uc3QgdGl0bGUgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi10aXRsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlPy50ZXh0Q29udGVudCk7XG5cdFx0XHRhc3NlcnQub2soIXRpdGxlPy50ZXh0Q29udGVudD8uaW5jbHVkZXMoJyonKSwgJ1JlcXVpcmVkIGluZGljYXRvciBzaG91bGQgbm90IGJlIHNob3duJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdWYWxpZGF0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlbmRlcnMgdmFsaWRhdGlvbiBtZXNzYWdlIGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZU1vY2tDYXJvdXNlbChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdFx0dGl0bGU6ICdFbWFpbCcsXG5cdFx0XHRcdFx0dmFsaWRhdGlvbjogeyBmb3JtYXQ6ICdlbWFpbCcgfVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdGNvbnN0IHZhbGlkYXRpb25Nc2cgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi12YWxpZGF0aW9uLW1lc3NhZ2UnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0XHRhc3NlcnQub2sodmFsaWRhdGlvbk1zZywgJ1ZhbGlkYXRpb24gbWVzc2FnZSBlbGVtZW50IHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbGlkYXRpb25Nc2c/LnN0eWxlLmRpc3BsYXksICdub25lJywgJ1ZhbGlkYXRpb24gbWVzc2FnZSBzaG91bGQgYmUgaGlkZGVuIGluaXRpYWxseScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmxvY2tzIHN1Ym1pdCBvbiByZXF1aXJlZCBlbXB0eSB0ZXh0IGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnTmFtZScsIHJlcXVpcmVkOiB0cnVlIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Ly8gVHJ5IHRvIHN1Ym1pdCB3aXRob3V0IGVudGVyaW5nIGEgdmFsdWVcblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1Ym1pdC1idXR0b24nKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdGFzc2VydC5vayhzdWJtaXRCdXR0b24sICdTdWJtaXQgYnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0c3VibWl0QnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdC8vIFNob3VsZCBzaG93IHZhbGlkYXRpb24gZXJyb3IgYW5kIG5vdCBzdWJtaXRcblx0XHRcdGNvbnN0IHZhbGlkYXRpb25Nc2cgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1xdWVzdGlvbi12YWxpZGF0aW9uLW1lc3NhZ2UnKTtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0aW9uTXNnPy50ZXh0Q29udGVudCwgJ1ZhbGlkYXRpb24gZXJyb3Igc2hvdWxkIGJlIHNob3duJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2VycywgbnVsbCwgJ1Nob3VsZCBub3QgaGF2ZSBzdWJtaXR0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25leHQgYnV0dG9uIGlzIGRpc2FibGVkIHdoZW4gcmVxdWlyZWQgdGV4dCBmaWVsZCBpcyBlbXB0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlTW9ja0Nhcm91c2VsKFtcblx0XHRcdFx0eyBpZDogJ3ExJywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ05hbWUnLCByZXF1aXJlZDogdHJ1ZSB9LFxuXHRcdFx0XHR7IGlkOiAncTInLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnQWdlJyB9XG5cdFx0XHRdKTtcblx0XHRcdGNyZWF0ZVdpZGdldChjYXJvdXNlbCk7XG5cblx0XHRcdC8vIE5leHQgYnV0dG9uIHNob3VsZCBiZSBkaXNhYmxlZCBzaW5jZSByZXF1aXJlZCBmaWVsZCBoYXMgbm8gYW5zd2VyXG5cdFx0XHRjb25zdCBuZXh0QnV0dG9uID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcXVlc3Rpb24tbmF2LW5leHQnKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdGFzc2VydC5vayhuZXh0QnV0dG9uLCAnTmV4dCBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQub2sobmV4dEJ1dHRvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJyksICdOZXh0IGJ1dHRvbiBzaG91bGQgYmUgZGlzYWJsZWQgd2hlbiByZXF1aXJlZCBmaWVsZCBpcyBlbXB0eScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsb3dzIHN1Ym1pdCBvbiByZXF1aXJlZCBmaWVsZCB3aXRoIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnTmFtZScsIHJlcXVpcmVkOiB0cnVlIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Ly8gRW50ZXIgYSB2YWx1ZSBpbiB0aGUgdGV4dCBpbnB1dFxuXHRcdFx0Y29uc3QgaW5wdXRCb3ggPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWlucHV0Ym94IGlucHV0JykgYXMgSFRNTElucHV0RWxlbWVudDtcblx0XHRcdGFzc2VydC5vayhpbnB1dEJveCwgJ0lucHV0IHNob3VsZCBleGlzdCcpO1xuXHRcdFx0aW5wdXRCb3gudmFsdWUgPSAnSm9obic7XG5cdFx0XHRpbnB1dEJveC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0XHQvLyBTdWJtaXRcblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1Ym1pdC1idXR0b24nKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdHN1Ym1pdEJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHRhc3NlcnQub2soc3VibWl0dGVkQW5zd2VycyAhPT0gbnVsbCwgJ1Nob3VsZCBoYXZlIHN1Ym1pdHRlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWRhdGVzIHJlcXVpcmVkIGZpZWxkIGFjcm9zcyBxdWVzdGlvbnMgb24gc3VibWl0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBjcmVhdGVNb2NrQ2Fyb3VzZWwoW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0eXBlOiAndGV4dCcsIHRpdGxlOiAnT3B0aW9uYWwnIH0sXG5cdFx0XHRcdHsgaWQ6ICdxMicsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdSZXF1aXJlZCcsIHJlcXVpcmVkOiB0cnVlIH1cblx0XHRcdF0pO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNhcm91c2VsKTtcblxuXHRcdFx0Ly8gTmF2aWdhdGUgdG8gcTIgd2l0aG91dCBmaWxsaW5nIHExIChvcHRpb25hbCwgc28gYWxsb3dlZClcblx0XHRcdHdpZGdldC5uYXZpZ2F0ZVRvTmV4dFF1ZXN0aW9uKCk7XG5cblx0XHRcdC8vIEdvIGJhY2sgdG8gcTEgYW5kIHRyeSB0byBzdWJtaXQgKHEyIHJlcXVpcmVkIGJ1dCBlbXB0eSlcblx0XHRcdHdpZGdldC5uYXZpZ2F0ZVRvUHJldmlvdXNRdWVzdGlvbigpO1xuXG5cdFx0XHQvLyBDbWQrRW50ZXIgc2hvdWxkIGNoZWNrIGFsbCByZXF1aXJlZCBmaWVsZHNcblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXF1ZXN0aW9uLXN1Ym1pdC1idXR0b24nKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdGlmIChzdWJtaXRCdXR0b24pIHtcblx0XHRcdFx0c3VibWl0QnV0dG9uLmNsaWNrKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNob3VsZCBub3Qgc3VibWl0IGJlY2F1c2UgcTIgaXMgcmVxdWlyZWQgYnV0IGVtcHR5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VibWl0dGVkQW5zd2VycywgbnVsbCwgJ1Nob3VsZCBub3Qgc3VibWl0IHdoZW4gcmVxdWlyZWQgZmllbGQgaXMgZW1wdHknKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGdDQUE4RDtBQUd2RSxTQUFT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
