import assert from "assert";
import * as dom from "../../../../../../base/browser/dom.js";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { buildPlanReviewProgressContent, ChatListItemRenderer, endsWithActiveSubagentContent, endsWithCompletedQuestionInteraction, formatCompletedResponseDisclosureLabel, formatResponseTokenStats, getCompletedResponseCollapseEndIndex, getFinalResponseStartIndex, getFinalResponseStartIndexAfterMovingResponseOutcomeTools, getVisibleCompletedResponseItemCount, getWorkingProgressRelevantParts, isFinalResponseRendered, isWaitingForMcpServers, moveResponseOutcomeToolsAfterFinalResponse, reconcileChatItemHeight, renderChatRequestTimestamp, renderChatResponseDetails, shouldCollapseCompletedResponsePart, shouldCreateGroupedThinkingPart, shouldHideChatUserIdentity, shouldPinToolInvocationToThinking, shouldRenderInitialProgressiveContentImmediately, shouldScheduleInitialHeightChange, shouldShowFileChangesSummaryForSettings, shouldShowPillsSummaryForSettings, shouldStartNewCollapsedThinkingGroup } from "../../../browser/widget/chatListRenderer.js";
import { ChatWidget } from "../../../browser/widget/chatWidget.js";
import { isChatTurnStatusPillsEnabled } from "../../../browser/widget/chatTurnPills.js";
import { ChatSubagentContentPart } from "../../../browser/widget/chatContentParts/chatSubagentContentPart.js";
import { ChatCollapsibleContentPart } from "../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js";
import { ChatRequestQueueKind, IChatService, IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { formatChatRequestTimestamp, formatChatResponseDetails, formatElapsedTime } from "../../../common/chatProgressFormatting.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode, ThinkingDisplayMode } from "../../../common/constants.js";
import { ChatModel } from "../../../common/model/chatModel.js";
import { ChatViewModel, isRequestVM, isResponseVM } from "../../../common/model/chatViewModel.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { ChatAgentService, IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatRequestTextPart } from "../../../common/requestParser/chatParserTypes.js";
import { ToolDataSource } from "../../../common/tools/languageModelToolsService.js";
import { shouldRenderGeneratedImageResult, shouldRenderSessionCreatedResult } from "../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js";
import { getGeneratedImageResultParts, getGeneratedImageResultPartsFromContent } from "../../../browser/widget/chatContentParts/toolInvocationParts/chatGeneratedImageResultSubPart.js";
import { MockChatService } from "../../common/chatService/mockChatService.js";
suite("ChatListRenderer", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("shouldScheduleInitialHeightChange", () => {
    test("only schedules first measurement updates when needed to avoid clipping", () => {
      assert.deepStrictEqual([
        shouldScheduleInitialHeightChange(120, void 0),
        shouldScheduleInitialHeightChange(120, 120),
        shouldScheduleInitialHeightChange(120, 120.1),
        shouldScheduleInitialHeightChange(121, 120),
        shouldScheduleInitialHeightChange(121, 120.1)
      ], [
        true,
        false,
        false,
        true,
        true
      ]);
    });
    suite("getFinalResponseStartIndex", () => {
      test("finds the trailing markdown response while leaving trailing adjuncts in place", () => {
        assert.deepStrictEqual([
          getFinalResponseStartIndex([
            { kind: "references", references: [] },
            { kind: "markdownContent", content: new MarkdownString("Final response") },
            { kind: "references", references: [] }
          ]),
          getFinalResponseStartIndex([
            { kind: "markdownContent", content: new MarkdownString("Earlier response") },
            { kind: "references", references: [] },
            { kind: "markdownContent", content: new MarkdownString("First segment") },
            { kind: "markdownContent", content: new MarkdownString("Second segment") }
          ]),
          getFinalResponseStartIndex([
            { kind: "references", references: [] },
            { kind: "markdownContent", content: new MarkdownString("") }
          ])
        ], [
          1,
          2,
          void 0
        ]);
      });
      test("formats completed response disclosure step count and timing", () => {
        assert.deepStrictEqual([
          formatCompletedResponseDisclosureLabel(1, 83e3),
          formatCompletedResponseDisclosureLabel(6, 83e3),
          formatCompletedResponseDisclosureLabel(6, void 0)
        ], [
          "Completed 1 step in 1m 23s",
          "Completed 6 steps in 1m 23s",
          "Completed 6 steps"
        ]);
      });
      test("counts visible completed response items", () => {
        const hidden = document.createElement("div");
        hidden.style.display = "none";
        const first = document.createElement("div");
        const second = document.createElement("div");
        assert.deepStrictEqual([
          getVisibleCompletedResponseItemCount([hidden, first]),
          getVisibleCompletedResponseItemCount([hidden, first, second])
        ], [
          1,
          2
        ]);
      });
      test("keeps MCP apps outside completed response disclosure", () => {
        const tool = {
          kind: "toolInvocationSerialized",
          toolCallId: "mcp-app",
          toolId: "create_issue",
          invocationMessage: "Creating issue...",
          originMessage: void 0,
          pastTenseMessage: "Created issue",
          isComplete: true,
          isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          presentation: void 0,
          source: ToolDataSource.Internal
        };
        const mcpAppTool = {
          ...tool,
          toolSpecificData: {
            kind: "input",
            rawInput: {},
            mcpAppData: {
              kind: "local",
              resourceUri: "ui://github/create-issue",
              serverDefinitionId: "github",
              collectionId: "github"
            }
          }
        };
        const finalResponse = { kind: "markdownContent", content: new MarkdownString("Final response") };
        assert.deepStrictEqual({
          regularToolCollapses: shouldCollapseCompletedResponsePart(tool),
          mcpAppCollapses: shouldCollapseCompletedResponsePart(mcpAppTool),
          withoutMcpApp: getCompletedResponseCollapseEndIndex([tool, tool, finalResponse], 2),
          mcpAppAfterOneStep: getCompletedResponseCollapseEndIndex([tool, mcpAppTool, tool, finalResponse], 3),
          mcpAppFirst: getCompletedResponseCollapseEndIndex([mcpAppTool, tool, finalResponse], 2),
          multipleMcpApps: getCompletedResponseCollapseEndIndex([tool, mcpAppTool, tool, mcpAppTool, finalResponse], 4)
        }, {
          regularToolCollapses: true,
          mcpAppCollapses: false,
          withoutMcpApp: 2,
          mcpAppAfterOneStep: 1,
          mcpAppFirst: 0,
          multipleMcpApps: 1
        });
      });
      test("moves durable tool outcomes after the final response and before trailing adjuncts", () => {
        const tool = {
          kind: "toolInvocationSerialized",
          toolCallId: "create-session",
          toolId: "create_session",
          invocationMessage: "Creating session...",
          originMessage: void 0,
          pastTenseMessage: "Created session",
          isComplete: true,
          isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          presentation: void 0,
          source: ToolDataSource.Internal,
          toolSpecificData: {
            kind: "sessionCreated",
            openLink: "agent-host-session://local/session",
            label: "Implement issue"
          }
        };
        const generatedImage = {
          kind: "toolInvocationSerialized",
          toolCallId: "generated-image",
          toolId: "image_gen.imagegen",
          invocationMessage: "Generating image",
          originMessage: void 0,
          pastTenseMessage: "Generated image",
          isComplete: true,
          isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          presentation: void 0,
          source: ToolDataSource.Internal,
          toolSpecificData: { kind: "generatedImage" },
          resultDetails: {
            input: '{"prompt":"Draw a fox"}',
            output: [{ type: "embed", value: "aW1hZ2U=", mimeType: "image/png" }]
          }
        };
        const firstStep = { kind: "markdownContent", content: new MarkdownString("First step") };
        const finalResponse = { kind: "markdownContent", content: new MarkdownString("Final response") };
        const trailingAdjunct = { kind: "references", references: [] };
        const content = [firstStep, tool, generatedImage, finalResponse, trailingAdjunct];
        assert.deepStrictEqual({
          content: moveResponseOutcomeToolsAfterFinalResponse(content),
          finalResponseStartIndex: getFinalResponseStartIndexAfterMovingResponseOutcomeTools(content)
        }, {
          content: [firstStep, finalResponse, tool, generatedImage, trailingAdjunct],
          finalResponseStartIndex: 1
        });
      });
      test("leaves created-session tools in place when there is no final response", () => {
        const tool = {
          kind: "toolInvocationSerialized",
          toolCallId: "create-session",
          toolId: "create_session",
          invocationMessage: "Creating session...",
          originMessage: void 0,
          pastTenseMessage: "Created session",
          isComplete: true,
          isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          presentation: void 0,
          source: ToolDataSource.Internal,
          toolSpecificData: {
            kind: "sessionCreated",
            openLink: "agent-host-session://local/session",
            label: "Implement issue"
          }
        };
        assert.deepStrictEqual(moveResponseOutcomeToolsAfterFinalResponse([tool]), [tool]);
      });
      test("waits for the final response before creating the completed-work disclosure", () => {
        const finalResponse = { kind: "markdownContent", content: new MarkdownString("Final response") };
        assert.deepStrictEqual([
          isFinalResponseRendered([], 2),
          isFinalResponseRendered([{ kind: "references", references: [] }, finalResponse], 1)
        ], [
          false,
          true
        ]);
      });
      test("renders the created-session result only after the response completes", () => {
        assert.deepStrictEqual([
          shouldRenderSessionCreatedResult("sessionCreated", false),
          shouldRenderSessionCreatedResult("sessionCreated", true),
          shouldRenderSessionCreatedResult("terminal", true)
        ], [
          false,
          true,
          false
        ]);
      });
      test("renders generated images as outcomes only after the response completes", () => {
        assert.deepStrictEqual([
          shouldRenderGeneratedImageResult("generatedImage", false),
          shouldRenderGeneratedImageResult("generatedImage", true),
          shouldRenderGeneratedImageResult("terminal", true)
        ], [
          false,
          true,
          false
        ]);
      });
      test("builds generated image previews from embedded image results", () => {
        const sessionResource = URI.parse("agent-host://local/session");
        const parts = getGeneratedImageResultParts({
          input: '{"prompt":"Draw a fox"}',
          output: [
            { type: "embed", value: "aW1hZ2U=", mimeType: "image/png" },
            { type: "embed", value: "aW1hZ2Uy", mimeType: "image/jpeg" },
            { type: "embed", value: "details", mimeType: "text/plain", isText: true }
          ]
        }, sessionResource, "image-call");
        assert.deepStrictEqual(parts.map((part) => ({
          kind: part.kind,
          base64Value: part.base64Value,
          mimeType: part.mimeType,
          path: part.uri.path
        })), [{
          kind: "data",
          base64Value: "aW1hZ2U=",
          mimeType: "image/png",
          path: "/tool/image-call/0/generated-image.png"
        }, {
          kind: "data",
          base64Value: "aW1hZ2Uy",
          mimeType: "image/jpeg",
          path: "/tool/image-call/1/generated-image.jpe"
        }]);
      });
      test("combines generated image results from multiple tool calls into one gallery", () => {
        const sessionResource = URI.parse("agent-host://local/session");
        const createImageTool = (toolCallId, value) => ({
          kind: "toolInvocationSerialized",
          toolCallId,
          toolId: "image_gen.imagegen",
          toolSpecificData: { kind: "generatedImage" },
          invocationMessage: "Generating image",
          originMessage: void 0,
          pastTenseMessage: "Generated image",
          presentation: void 0,
          isConfirmed: true,
          isComplete: true,
          source: ToolDataSource.Internal,
          resultDetails: {
            input: '{"prompt":"Draw a fox"}',
            output: [{ type: "embed", value, mimeType: "image/png" }]
          }
        });
        const parts = getGeneratedImageResultPartsFromContent([
          createImageTool("image-call-1", "aW1hZ2Ux"),
          createImageTool("image-call-2", "aW1hZ2Uy")
        ], sessionResource);
        assert.deepStrictEqual(parts.map((part) => ({
          base64Value: part.base64Value,
          path: part.uri.path
        })), [{
          base64Value: "aW1hZ2Ux",
          path: "/tool/image-call-1/0/generated-image-1.png"
        }, {
          base64Value: "aW1hZ2Uy",
          path: "/tool/image-call-2/0/generated-image-2.png"
        }]);
      });
    });
  });
  suite("reconcileChatItemHeight", () => {
    const run = (steps, allocatedHeight, initialStored) => {
      let stored = initialStored;
      return steps.map(({ measured, isBeingRendered }) => {
        const update = reconcileChatItemHeight(measured, stored, isBeingRendered, allocatedHeight);
        stored = update.nextRenderedHeight;
        return { kind: update.kind, height: update.height, stored };
      });
    };
    test("does not strand a grown height first seen while the row is being rendered", () => {
      assert.deepStrictEqual(
        run(
          [
            { measured: 900, isBeingRendered: true },
            // grew mid-render -> suppressed, defer
            { measured: 900, isBeingRendered: false }
            // deferred re-measure delivers the height
          ],
          /*allocatedHeight*/
          500,
          /*initialStored*/
          500
        ),
        [
          { kind: "deferReMeasure", height: 900, stored: 500 },
          { kind: "fire", height: 900, stored: 900 }
        ]
      );
    });
    test("notifies the tree on async growth and ignores an unchanged measurement", () => {
      assert.deepStrictEqual(
        run(
          [
            { measured: 700, isBeingRendered: false },
            // async growth -> notify
            { measured: 700, isBeingRendered: false }
            // unchanged -> no-op
          ],
          /*allocatedHeight*/
          500,
          /*initialStored*/
          500
        ),
        [
          { kind: "fire", height: 700, stored: 700 },
          { kind: "none", height: 700, stored: 700 }
        ]
      );
    });
    test("first measurement (no stored height) only schedules an update when content would clip", () => {
      assert.deepStrictEqual([
        // Initial measurement that fits within the allocated height -> no notification.
        run(
          [{ measured: 500, isBeingRendered: false }],
          /*allocatedHeight*/
          500,
          /*initialStored*/
          void 0
        ),
        // Initial measurement larger than the allocation -> schedule an initial update.
        run(
          [{ measured: 700, isBeingRendered: false }],
          /*allocatedHeight*/
          500,
          /*initialStored*/
          void 0
        )
      ], [
        [{ kind: "none", height: 500, stored: 500 }],
        [{ kind: "scheduleInitial", height: 700, stored: 700 }]
      ]);
    });
  });
  suite("shouldRenderInitialProgressiveContentImmediately", () => {
    test("renders accumulated markdown immediately only when progressive rendering has not started", () => {
      assert.deepStrictEqual([
        shouldRenderInitialProgressiveContentImmediately(false, true, false),
        shouldRenderInitialProgressiveContentImmediately(false, true, true),
        shouldRenderInitialProgressiveContentImmediately(true, true, false),
        shouldRenderInitialProgressiveContentImmediately(false, false, false)
      ], [
        true,
        false,
        false,
        false
      ]);
    });
  });
  suite("shouldStartNewCollapsedThinkingGroup", () => {
    test("separates reasoning and grouped items only in collapsed mode", () => {
      assert.deepStrictEqual({
        reasoningToItems: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, "reasoning", "items"),
        itemsToReasoning: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, "items", "reasoning"),
        reasoningToReasoning: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, "reasoning", "reasoning"),
        itemsToItems: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, "items", "items"),
        fixedScrolling: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.FixedScrolling, "reasoning", "items"),
        collapsedPreview: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.CollapsedPreview, "reasoning", "items")
      }, {
        reasoningToItems: true,
        itemsToReasoning: true,
        reasoningToReasoning: false,
        itemsToItems: false,
        fixedScrolling: false,
        collapsedPreview: false
      });
    });
  });
  suite("shouldCreateGroupedThinkingPart", () => {
    test("honors withThinking unless a reasoning group was just separated", () => {
      assert.deepStrictEqual({
        withThinkingWithoutReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.WithThinking, false),
        withThinkingAfterReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.WithThinking, true),
        alwaysWithoutReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.Always, false)
      }, {
        withThinkingWithoutReasoning: false,
        withThinkingAfterReasoning: true,
        alwaysWithoutReasoning: true
      });
    });
  });
  suite("formatChatResponseDetails", () => {
    test("formats completion metadata for the footer", () => {
      assert.deepStrictEqual([
        formatChatResponseDetails("GPT-5.6 Sol \u2022 1.5 credits", "4:56 PM"),
        formatChatResponseDetails("GPT-5.6 Sol", void 0),
        formatChatResponseDetails(void 0, "4:56 PM"),
        formatElapsedTime(83e3)
      ], [
        "4:56 PM \u2022 GPT-5.6 Sol \u2022 1.5 credits",
        "GPT-5.6 Sol",
        "4:56 PM",
        "1m 23s"
      ]);
    });
    test("renders completion time with elapsed-time alternate only in verbose mode", () => {
      const container = document.createElement("div");
      container.className = "chat-footer-details";
      const completedAt = Date.now() - 60 * 60 * 1e3;
      renderChatResponseDetails(container, "Claude Opus 4.8", completedAt, 24e3, false);
      const compact = {
        text: container.textContent,
        timing: container.querySelector(".chat-response-timing"),
        tabIndex: container.tabIndex
      };
      renderChatResponseDetails(container, "Claude Opus 4.8", completedAt, 24e3, true);
      assert.deepStrictEqual({
        compact,
        completionDateTime: container.querySelector("time")?.dateTime,
        hasAlternate: container.querySelector(".chat-response-timing")?.classList.contains("has-alternate"),
        duration: container.querySelector(".chat-response-alternate")?.textContent,
        details: container.querySelector(".chat-response-model-details")?.textContent,
        separatorHidden: container.querySelector(".chat-response-details-separator")?.getAttribute("aria-hidden"),
        ariaIncludesElapsed: container.ariaLabel?.includes("24s") ?? false,
        tabIndex: container.tabIndex
      }, {
        compact: {
          text: "Claude Opus 4.8",
          timing: null,
          tabIndex: 0
        },
        completionDateTime: new Date(completedAt).toISOString(),
        hasAlternate: true,
        duration: "24s",
        details: "Claude Opus 4.8",
        separatorHidden: "true",
        ariaIncludesElapsed: true,
        tabIndex: 0
      });
      renderChatResponseDetails(container, void 0, void 0, 24e3, true);
      assert.deepStrictEqual({
        text: container.textContent,
        timing: container.querySelector(".chat-response-timing"),
        hidden: container.classList.contains("hidden"),
        tabIndex: container.tabIndex
      }, {
        text: "",
        timing: null,
        hidden: true,
        tabIndex: -1
      });
      const oldCompletion = Date.now() - 25 * 60 * 60 * 1e3;
      renderChatResponseDetails(container, void 0, oldCompletion, 24e3, true);
      assert.deepStrictEqual({
        compact: container.querySelector(".chat-response-completed-at")?.textContent,
        alternateEndsWithElapsed: container.querySelector(".chat-response-alternate")?.textContent?.endsWith(" \u2022 24s"),
        hasAlternate: container.querySelector(".chat-response-timing")?.classList.contains("has-alternate")
      }, {
        compact: "1 day",
        alternateEndsWithElapsed: true,
        hasAlternate: true
      });
    });
    test("summarizes per-model token usage for the footer stat hover", () => {
      const stats = formatResponseTokenStats([
        { model: "Claude Opus 4.8", inputTokens: 12400, cachedTokens: 9e3, outputTokens: 830 },
        { model: "gpt-5.5", inputTokens: 40, cachedTokens: 0, outputTokens: 12 }
      ]);
      assert.deepStrictEqual({ markdown: stats?.markdown.value, ariaLabel: stats?.ariaLabel }, {
        markdown: "**Tokens used this turn**\n\nClaude Opus 4.8 \u2014 12K in, 830 out, 9K cached\n\ngpt-5.5 \u2014 40 in, 12 out\n\n",
        ariaLabel: "Tokens used this turn. Claude Opus 4.8: 12400 input tokens, 830 output tokens, 9000 cached tokens. gpt-5.5: 40 input tokens, 12 output tokens"
      });
    });
    test("reports no token usage summary when the provider reported none", () => {
      assert.deepStrictEqual([
        formatResponseTokenStats(void 0),
        formatResponseTokenStats([])
      ], [
        void 0,
        void 0
      ]);
    });
    test("folds the token usage summary into the footer accessible name", () => {
      const container = document.createElement("div");
      const withStats = "Tokens used this turn. gpt-5.5: 40 input tokens, 12 output tokens";
      renderChatResponseDetails(container, "GPT-5.5 \u2022 2 credits", void 0, void 0, false, withStats);
      const included = container.ariaLabel;
      renderChatResponseDetails(container, "GPT-5.5 \u2022 2 credits", void 0, void 0, false);
      assert.deepStrictEqual({ included, omitted: container.ariaLabel }, {
        included: `GPT-5.5 \u2022 2 credits, ${withStats}`,
        omitted: "GPT-5.5 \u2022 2 credits"
      });
    });
  });
  suite("formatChatRequestTimestamp", () => {
    test("formats valid persisted timestamps and rejects legacy placeholders", () => {
      const timestamp = Date.UTC(2026, 6, 8, 23, 18, 41);
      const formatted = formatChatRequestTimestamp(timestamp);
      assert.deepStrictEqual({
        hasText: !!formatted?.text,
        hasFullText: !!formatted?.fullText,
        dateTime: formatted?.dateTime,
        invalid: formatChatRequestTimestamp(-1)
      }, {
        hasText: true,
        hasFullText: true,
        dateTime: "2026-07-08T23:18:41.000Z",
        invalid: void 0
      });
    });
    test("uses relative days after 24 hours", () => {
      assert.deepStrictEqual([
        formatChatRequestTimestamp(Date.now() - 25 * 60 * 60 * 1e3)?.text,
        formatChatRequestTimestamp(Date.now() - 49 * 60 * 60 * 1e3)?.text
      ], [
        "1 day",
        "2 days"
      ]);
    });
    test("renders compact days with an animated full date alternate", () => {
      const container = document.createElement("div");
      const timestamp = Date.now() - 25 * 60 * 60 * 1e3;
      const rendered = renderChatRequestTimestamp(container, timestamp);
      assert.deepStrictEqual({
        compact: container.querySelector(".chat-request-relative")?.textContent,
        fullDate: container.querySelector(".chat-request-full-date")?.textContent,
        hasAlternate: container.querySelector(".chat-request-timing")?.classList.contains("has-alternate"),
        focusable: rendered?.element.tabIndex,
        managedHoverText: rendered?.hoverText
      }, {
        compact: "1 day",
        fullDate: formatChatRequestTimestamp(timestamp)?.fullText,
        hasAlternate: true,
        focusable: 0,
        managedHoverText: void 0
      });
    });
  });
  test("pending divider clears a timestamp from a recycled request template", () => {
    const disposables = store.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration("chat.editRequests", "hover");
    configurationService.setUserConfiguration("chat.checkpoints.enabled", false);
    configurationService.setUserConfiguration("chat.checkpoints.showFileChanges", false);
    configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
    const model = disposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, void 0));
    const text = "test";
    model.addRequest({
      text,
      parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
    }, { variables: [] }, Date.now());
    const requestViewModel = viewModel.getItems().find(isRequestVM);
    assert.ok(requestViewModel);
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    disposables.add(toDisposable(() => container.remove()));
    const renderer = disposables.add(instantiationService.createInstance(
      ChatListItemRenderer,
      {},
      {},
      {
        getListLength: () => 1,
        onDidScroll: () => toDisposable(() => {
        }),
        container,
        currentChatMode: () => ChatModeKind.Agent
      },
      void 0,
      viewModel
    ));
    const template = renderer.renderTemplate(container);
    disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
    const node = (element) => ({ element, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: void 0 });
    renderer.renderElement(node(requestViewModel), 0, template);
    const hadTimestamp = !!template.requestTimestampContainer.querySelector("time");
    renderer.renderElement(node({
      kind: "pendingDivider",
      id: "pending-divider-steering",
      sessionResource: model.sessionResource,
      isComplete: true,
      dividerKind: ChatRequestQueueKind.Steering,
      currentRenderedHeight: void 0
    }), 0, template);
    assert.deepStrictEqual({
      hadTimestamp,
      hasTimestamp: !!template.requestTimestampContainer.querySelector("time"),
      dividerLabel: template.value.textContent
    }, {
      hadTimestamp: true,
      hasTimestamp: false,
      dividerLabel: "Steering"
    });
    disposables.dispose();
  });
  test("inline editing keeps a populated timestamp after the edit input with verbose timestamps disabled", () => {
    const disposables = store.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
    configurationService.setUserConfiguration("chat.editRequests", "hover");
    configurationService.setUserConfiguration("chat.checkpoints.enabled", false);
    configurationService.setUserConfiguration("chat.checkpoints.showFileChanges", false);
    configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
    const model = disposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, void 0));
    const text = "test";
    const request = model.addRequest({
      text,
      parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
    }, { variables: [] }, Date.now());
    const requestViewModel = viewModel.getItems().find(isRequestVM);
    assert.ok(requestViewModel);
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    disposables.add(toDisposable(() => container.remove()));
    const renderer = disposables.add(instantiationService.createInstance(
      ChatListItemRenderer,
      {},
      {},
      {
        getListLength: () => 1,
        onDidScroll: () => toDisposable(() => {
        }),
        container,
        currentChatMode: () => ChatModeKind.Agent
      },
      void 0,
      viewModel
    ));
    const template = renderer.renderTemplate(container);
    disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
    renderer.renderElement({ element: requestViewModel, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: void 0 }, 0, template);
    const widget = {
      viewModel,
      configurationService,
      recentlyRestoredCheckpoint: false,
      inputPart: {
        currentModeObs: { get: () => ({ id: ChatModeKind.Agent }) },
        currentModeInfo: {},
        setEditing: () => {
        },
        toggleChatInputOverlay: () => {
        },
        dnd: { setDisabledOverlay: () => {
        } },
        onDidClickOverlay: () => toDisposable(() => {
        })
      },
      input: {
        setChatMode: () => {
        },
        setPermissionLevel: () => {
        },
        setEditing: () => {
        },
        renderAttachedContext: () => {
        },
        setValue: () => {
        },
        attachmentModel: { addContext: () => {
        } },
        inputEditor: {
          getModel: () => void 0,
          focus: () => {
          }
        }
      },
      inlineInputPart: {
        inputEditor: {
          onDidChangeModelContent: () => toDisposable(() => {
          }),
          onDidChangeCursorSelection: () => toDisposable(() => {
          })
        }
      },
      listWidget: {
        acquireAutoScrollHold: () => toDisposable(() => {
        }),
        scrollToCurrentItem: () => {
        }
      },
      _editingAutoScrollHold: disposables.add(new MutableDisposable()),
      createInput: () => {
      },
      onDidChangeItems: () => {
      },
      getContrib: () => void 0,
      _onDidChangeActiveInputEditor: { fire: () => {
      } },
      _register: (disposable) => disposables.add(disposable),
      telemetryService: { publicLog2: () => {
      } }
    };
    ChatWidget.prototype.clickedRequest.call(widget, template);
    assert.deepStrictEqual({
      editingRequestId: viewModel.editing?.id,
      showsVerboseDetails: template.rowContainer.classList.contains("show-verbose-details"),
      timestampPopulated: !!template.requestTimestampContainer.querySelector("time"),
      previousSiblingClass: template.requestTimestampContainer.previousElementSibling?.className
    }, {
      editingRequestId: request.id,
      showsVerboseDetails: false,
      timestampPopulated: true,
      previousSiblingClass: "chat-edit-input-container"
    });
    disposables.dispose();
  });
  suite("turn status pills setting", () => {
    test("normalizes boolean and legacy object values", () => {
      assert.deepStrictEqual([
        isChatTurnStatusPillsEnabled(void 0),
        isChatTurnStatusPillsEnabled(false),
        isChatTurnStatusPillsEnabled(true),
        isChatTurnStatusPillsEnabled({}),
        isChatTurnStatusPillsEnabled({ changes: false, preview: false, browser: false }),
        isChatTurnStatusPillsEnabled({ changes: true }),
        isChatTurnStatusPillsEnabled({ preview: true }),
        isChatTurnStatusPillsEnabled({ browser: true })
      ], [false, false, true, false, false, true, true, true]);
    });
    test("computes pill and legacy file summaries independently", () => {
      assert.deepStrictEqual({
        fileSummary: shouldShowFileChangesSummaryForSettings(true, true, true),
        fileSummaryIncomplete: shouldShowFileChangesSummaryForSettings(false, true, true),
        fileSummaryNonLocal: shouldShowFileChangesSummaryForSettings(true, false, true),
        fileSummaryDisabled: shouldShowFileChangesSummaryForSettings(true, true, false),
        pillsSummary: shouldShowPillsSummaryForSettings(true, true, true),
        pillsSummaryLegacy: shouldShowPillsSummaryForSettings(true, true, { preview: true }),
        pillsSummaryIncomplete: shouldShowPillsSummaryForSettings(false, true, true),
        pillsSummaryNonAgentHost: shouldShowPillsSummaryForSettings(true, false, true),
        pillsSummaryDisabled: shouldShowPillsSummaryForSettings(true, true, false)
      }, {
        fileSummary: true,
        fileSummaryIncomplete: false,
        fileSummaryNonLocal: false,
        fileSummaryDisabled: false,
        pillsSummary: true,
        pillsSummaryLegacy: true,
        pillsSummaryIncomplete: false,
        pillsSummaryNonAgentHost: false,
        pillsSummaryDisabled: false
      });
    });
  });
  suite("shouldPinToolInvocationToThinking", () => {
    test("keeps tool invocations requiring user input or MCP apps outside Thinking", () => {
      assert.deepStrictEqual({
        executionConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForConfirmation, false, false),
        resultApproval: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForPostApproval, false, false),
        authentication: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForAuthentication, false, false),
        executingWithConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, true, false),
        executingWithoutConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, false, false),
        executingWithMcpApp: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, false, true),
        streamingWithMcpApp: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Streaming, false, true)
      }, {
        executionConfirmation: false,
        resultApproval: false,
        authentication: false,
        executingWithConfirmation: false,
        executingWithoutConfirmation: true,
        executingWithMcpApp: false,
        streamingWithMcpApp: false
      });
      suite("endsWithCompletedQuestionInteraction", () => {
        test("resumes working progress after completed ask interactions", () => {
          const completedTool = {
            kind: "toolInvocationSerialized",
            toolCallId: "ask-1",
            toolId: "ask_user",
            invocationMessage: "Waiting for answer...",
            originMessage: void 0,
            pastTenseMessage: void 0,
            isComplete: true,
            isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
            presentation: void 0,
            source: ToolDataSource.Internal
          };
          const completedQuestion = {
            kind: "questionCarousel",
            questions: [],
            allowSkip: true,
            isUsed: true
          };
          assert.deepStrictEqual([
            endsWithCompletedQuestionInteraction([completedTool]),
            endsWithCompletedQuestionInteraction([completedTool, completedQuestion]),
            endsWithCompletedQuestionInteraction([{ ...completedQuestion, isUsed: false }]),
            endsWithCompletedQuestionInteraction([{ ...completedTool, toolId: "read_file" }])
          ], [true, true, false, false]);
        });
      });
    });
  });
  suite("shouldHideChatUserIdentity", () => {
    test("hides local Copilot and Agent Host Copilot response identity", () => {
      assert.deepStrictEqual([
        shouldHideChatUserIdentity("GitHub Copilot", URI.from({ scheme: "vscode-chat-editor" }), true, false, false),
        shouldHideChatUserIdentity("Copilot", URI.from({ scheme: "agent-host-copilotcli" }), true, false, false),
        shouldHideChatUserIdentity("Copilot", URI.from({ scheme: "agent-host-copilotcli" }), false, false, false),
        shouldHideChatUserIdentity("Copilot", URI.from({ scheme: "remote-test-authority-copilotcli" }), true, false, false),
        shouldHideChatUserIdentity("Copilot", URI.from({ scheme: "remote-test-authority-copilotcli" }), false, false, false),
        shouldHideChatUserIdentity("Claude", URI.from({ scheme: "remote-test-authority-claude" }), true, false, false),
        shouldHideChatUserIdentity("Claude", URI.from({ scheme: "agent-host-claude" }), true, false, false),
        shouldHideChatUserIdentity("Claude", URI.from({ scheme: "agent-host-claude" }), true, true, false),
        shouldHideChatUserIdentity("User", URI.from({ scheme: "vscode-chat-editor" }), false, false, true)
      ], [
        true,
        true,
        false,
        true,
        false,
        false,
        false,
        true,
        true
      ]);
    });
  });
  suite("buildPlanReviewProgressContent", () => {
    test("keeps plan summary and full plan link after approval", () => {
      const content = buildPlanReviewProgressContent({
        kind: "planReview",
        title: "Review Plan",
        content: "## Plan summary",
        actions: [{ id: "interactive", label: "Implement Plan" }],
        canProvideFeedback: true,
        planUri: URI.file("/sessions/abc/plan.md").toJSON(),
        isUsed: true,
        data: { rejected: false, action: "Implement Plan", actionId: "interactive" }
      }, "Approved plan");
      assert.strictEqual(content.value, "Approved&nbsp;plan\n\n## Plan summary\n\n[Open full plan file (plan.md)](file:///sessions/abc/plan.md?vscodeLinkType=file)");
    });
    test("renders structured feedback as markdown before the plan", () => {
      const content = buildPlanReviewProgressContent({
        kind: "planReview",
        title: "Review Plan",
        content: "## Plan summary",
        actions: [{ id: "interactive", label: "Implement Plan" }],
        canProvideFeedback: true,
        planUri: URI.file("/sessions/abc/plan.md").toJSON(),
        isUsed: true,
        data: {
          rejected: false,
          feedback: "Use **named helpers**.\n\nInline comments on `plan.md`:\n- **Line 6:** Extract this",
          feedbackOverall: "Use **named helpers**.",
          feedbackInlineMarkdown: "Inline comments on `plan.md`:\n- **Line 6:** Extract this"
        }
      }, "Provided feedback");
      assert.strictEqual(content.value, [
        "Provided&nbsp;feedback",
        "Use **named helpers**.",
        "Inline comments on `plan.md`:\n- **Line 6:** Extract this",
        "## Plan summary",
        "[Open full plan file (plan.md)](file:///sessions/abc/plan.md?vscodeLinkType=file)"
      ].join("\n\n"));
    });
    test("renders combined legacy feedback as markdown", () => {
      const content = buildPlanReviewProgressContent({
        kind: "planReview",
        title: "Review Plan",
        content: "",
        actions: [{ id: "interactive", label: "Implement Plan" }],
        canProvideFeedback: true,
        isUsed: true,
        data: {
          rejected: false,
          feedback: "Overall **comment**\n\nInline comments:\n- **Line 7:** Rename this"
        }
      }, "Provided feedback");
      assert.strictEqual(content.value, [
        "Provided&nbsp;feedback",
        "Overall **comment**",
        "Inline comments:\n- **Line 7:** Rename this"
      ].join("\n\n"));
    });
  });
  test("working progress ignores subagent-owned response parts", () => {
    const parentSubagent = {
      kind: "toolInvocationSerialized",
      toolCallId: "subagent-1",
      toolId: "task",
      source: ToolDataSource.Internal,
      invocationMessage: "Running subagent",
      originMessage: void 0,
      pastTenseMessage: void 0,
      isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      isComplete: true,
      presentation: void 0,
      toolSpecificData: { kind: "subagent", description: "Investigate", isActive: true }
    };
    const childTool = {
      ...parentSubagent,
      toolCallId: "child-1",
      toolId: "search",
      subAgentInvocationId: "subagent-1",
      toolSpecificData: void 0
    };
    const secondParentSubagent = {
      ...parentSubagent,
      toolCallId: "subagent-2",
      toolSpecificData: { kind: "subagent", description: "Review tests", isActive: true }
    };
    const secondChildTool = {
      ...childTool,
      toolCallId: "child-2",
      subAgentInvocationId: "subagent-2"
    };
    const parts = [
      { kind: "references", references: [] },
      parentSubagent,
      childTool,
      { kind: "markdownContent", content: { value: '<vscode_codeblock_uri subAgentInvocationId="subagent-1">file:///test.txt</vscode_codeblock_uri>' } },
      { kind: "hook", hookType: "PreToolUse", subAgentInvocationId: "subagent-1" }
    ];
    const parallelSubagentParts = [
      { kind: "references", references: [] },
      parentSubagent,
      childTool,
      secondParentSubagent,
      secondChildTool
    ];
    assert.deepStrictEqual({
      relevantParts: getWorkingProgressRelevantParts(parts).map((part) => part.kind),
      endsWithTaggedMarkdown: endsWithActiveSubagentContent(parts.slice(0, 4)),
      endsWithSubagentHook: endsWithActiveSubagentContent(parts),
      endsWithSubagentChildTool: endsWithActiveSubagentContent(parts.slice(0, 3)),
      endsWithParentSubagentTool: endsWithActiveSubagentContent(parts.slice(0, 2)),
      endsWithParallelSubagents: endsWithActiveSubagentContent(parallelSubagentParts),
      endsWithParentMarkdownBeforeNestedUpdates: endsWithActiveSubagentContent([
        ...parallelSubagentParts,
        { kind: "markdownContent", content: { value: "Waiting on the remaining reviewers." } },
        { ...childTool, toolCallId: "child-3" },
        { kind: "hook", hookType: "PostToolUse", subAgentInvocationId: "subagent-2" }
      ])
    }, {
      relevantParts: ["references"],
      endsWithTaggedMarkdown: true,
      endsWithSubagentHook: true,
      endsWithSubagentChildTool: true,
      endsWithParentSubagentTool: true,
      endsWithParallelSubagents: true,
      endsWithParentMarkdownBeforeNestedUpdates: false
    });
    parentSubagent.toolSpecificData = { kind: "subagent", description: "Investigate", isActive: false };
    assert.strictEqual(endsWithActiveSubagentContent(parts), false);
  });
  test("working progress is hidden while MCP servers are starting", () => {
    const servers = observableValue("servers", [{ id: "a", name: "alpha" }]);
    const part = {
      kind: "mcpServersStartingSlow",
      sessionResource: URI.parse("chat-session://test/session1"),
      servers
    };
    const whileStarting = isWaitingForMcpServers([part]);
    servers.set([], void 0);
    const afterStarting = isWaitingForMcpServers([part]);
    assert.deepStrictEqual({ whileStarting, afterStarting }, { whileStarting: true, afterStarting: false });
  });
  test("final markdown remains mounted after thinking and tool progress completes with reduced motion", async () => {
    const disposables = store.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
    configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.FixedScrolling);
    configurationService.setUserConfiguration("chat.agent.thinking.collapsedTools", CollapsedToolsDisplayMode.Always);
    configurationService.setUserConfiguration("chat.checkpoints.enabled", false);
    configurationService.setUserConfiguration("chat.checkpoints.showFileChanges", false);
    configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
    configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
    configurationService.setUserConfiguration("workbench.reduceMotion", "on");
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
    const model = disposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, void 0));
    const text = "test";
    const request = model.addRequest({
      text,
      parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
    }, { variables: [] }, 0);
    const response = viewModel.getItems().find(isResponseVM);
    assert.ok(response);
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    disposables.add(toDisposable(() => container.remove()));
    const renderer = disposables.add(instantiationService.createInstance(
      ChatListItemRenderer,
      {},
      { progressMessageAtBottomOfResponse: true },
      {
        getListLength: () => 1,
        onDidScroll: () => toDisposable(() => {
        }),
        container,
        currentChatMode: () => ChatModeKind.Agent
      },
      void 0,
      viewModel
    ));
    const template = renderer.renderTemplate(container);
    disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
    const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: void 0 };
    model.acceptResponseProgress(request, { kind: "thinking", value: "Thinking ...", id: "thinking-1" });
    renderer.renderElement(node, 0, template);
    const toolInvocation = new ChatToolInvocation({
      invocationMessage: "Running tool...",
      pastTenseMessage: "Tool completed"
    }, {
      id: "my-tool",
      displayName: "My Tool",
      modelDescription: "Test tool",
      source: ToolDataSource.Internal
    }, "call-1", void 0, {}, {}, request.id);
    model.acceptResponseProgress(request, toolInvocation);
    renderer.renderElement(node, 0, template);
    await toolInvocation.didExecuteTool(void 0);
    renderer.renderElement(node, 0, template);
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("Final response") });
    renderer.renderElement(node, 0, template);
    const mountedWhileStreaming = template.value.textContent?.includes("Final response") ?? false;
    request.response?.complete();
    renderer.renderElement(node, 0, template);
    assert.deepStrictEqual({
      mountedWhileStreaming,
      mountedAfterCompletion: template.value.textContent?.includes("Final response") ?? false
    }, {
      mountedWhileStreaming: true,
      mountedAfterCompletion: true
    });
    disposables.dispose();
  });
  test("generated image completion does not leave a compact duplicate inside thinking", async () => {
    const disposables = store.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
    configurationService.setUserConfiguration("chat.agent.thinking.collapsedTools", CollapsedToolsDisplayMode.Always);
    configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
    configurationService.setUserConfiguration("chat.checkpoints.enabled", false);
    configurationService.setUserConfiguration("chat.checkpoints.showFileChanges", false);
    configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
    configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
    const model = disposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, void 0));
    const text = "generate an image";
    const request = model.addRequest({
      text,
      parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
    }, { variables: [] }, 0);
    const response = viewModel.getItems().find(isResponseVM);
    assert.ok(response);
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    disposables.add(toDisposable(() => container.remove()));
    const renderer = disposables.add(instantiationService.createInstance(
      ChatListItemRenderer,
      {},
      {},
      {
        getListLength: () => 1,
        onDidScroll: () => toDisposable(() => {
        }),
        container,
        currentChatMode: () => ChatModeKind.Agent
      },
      void 0,
      viewModel
    ));
    const template = renderer.renderTemplate(container);
    disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
    const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: void 0 };
    const createImageTool = (toolCallId) => new ChatToolInvocation({
      invocationMessage: "Generating image",
      pastTenseMessage: "Generated image"
    }, {
      id: "image_gen.imagegen",
      displayName: "Generate image",
      modelDescription: "Generate image",
      source: ToolDataSource.Internal
    }, toolCallId, void 0, {}, {}, request.id);
    const imageTools = [createImageTool("image-call-1"), createImageTool("image-call-2")];
    model.acceptResponseProgress(request, { kind: "thinking", value: "Reviewing the image skill", id: "thinking-1" });
    const shellTool = new ChatToolInvocation({
      invocationMessage: "Reading image skill",
      pastTenseMessage: "Read image skill"
    }, {
      id: "shell",
      displayName: "Run shell command",
      modelDescription: "Run shell command",
      source: ToolDataSource.Internal
    }, "shell-call", void 0, {}, {}, request.id);
    model.acceptResponseProgress(request, shellTool);
    renderer.renderElement(node, 0, template);
    await shellTool.didExecuteTool({ content: [] });
    renderer.renderElement(node, 0, template);
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("I will create two variations.") });
    model.acceptResponseProgress(request, { kind: "thinking", value: "Planning image variations", id: "thinking-2" });
    renderer.renderElement(node, 0, template);
    for (const [index, imageTool] of imageTools.entries()) {
      model.acceptResponseProgress(request, imageTool);
      renderer.renderElement(node, 0, template);
      await imageTool.didExecuteTool({
        content: [],
        toolSpecificData: { kind: "generatedImage" },
        toolResultDetails: {
          input: '{"prompt":"Draw a fox"}',
          output: [{ type: "embed", value: `aW1hZ2U${index}`, mimeType: "image/png" }]
        }
      });
      renderer.renderElement(node, 0, template);
      if (index === 0) {
        model.acceptResponseProgress(request, { kind: "thinking", value: "Planning the second variation", id: "thinking-3" });
        renderer.renderElement(node, 0, template);
      }
    }
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("\n\n") });
    renderer.renderElement(node, 0, template);
    request.response?.complete();
    renderer.renderElement(node, 0, template);
    assert.deepStrictEqual({
      resourceGroups: template.value.querySelectorAll(".chat-collapsible-io-resource-group").length,
      largeOutcomes: template.value.querySelectorAll(".chat-generated-image-result").length,
      multipleImageOutcomes: template.value.querySelectorAll(".chat-generated-image-result.multiple").length,
      generatedImageInvocations: template.value.querySelectorAll(".generated-image-tool-invocation").length
    }, {
      resourceGroups: 1,
      largeOutcomes: 1,
      multipleImageOutcomes: 1,
      generatedImageInvocations: 1
    });
    disposables.dispose();
  });
  test("completed response disclosure announces user toggles so the list can anchor its summary", async () => {
    const disposables = store.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
    configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
    configurationService.setUserConfiguration("chat.checkpoints.enabled", false);
    configurationService.setUserConfiguration("chat.checkpoints.showFileChanges", false);
    configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
    configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
    const model = disposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, void 0));
    const text = "test";
    const request = model.addRequest({
      text,
      parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
    }, { variables: [] }, 0);
    const response = viewModel.getItems().find(isResponseVM);
    assert.ok(response);
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    disposables.add(toDisposable(() => container.remove()));
    const renderer = disposables.add(instantiationService.createInstance(
      ChatListItemRenderer,
      {},
      {},
      {
        getListLength: () => 1,
        onDidScroll: () => toDisposable(() => {
        }),
        container,
        currentChatMode: () => ChatModeKind.Agent
      },
      void 0,
      viewModel
    ));
    const template = renderer.renderTemplate(container);
    disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
    const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: void 0 };
    for (const callId of ["call-1", "call-2"]) {
      const toolInvocation = new ChatToolInvocation({
        invocationMessage: "Running tool...",
        pastTenseMessage: "Tool completed"
      }, {
        id: "my-tool",
        displayName: "My Tool",
        modelDescription: "Test tool",
        source: ToolDataSource.Internal
      }, callId, void 0, {}, {}, request.id);
      model.acceptResponseProgress(request, toolInvocation);
      await toolInvocation.didExecuteTool(void 0);
    }
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("Final response") });
    request.response?.complete();
    renderer.renderElement(node, 0, template);
    const disclosure = container.querySelector(".completed-response-disclosure");
    const summary = disclosure?.querySelector(".completed-response-summary");
    let announcedToggles = 0;
    const listener = () => announcedToggles++;
    container.addEventListener(ChatCollapsibleContentPart.userToggleEvent, listener);
    disposables.add(toDisposable(() => container.removeEventListener(ChatCollapsibleContentPart.userToggleEvent, listener)));
    summary?.click();
    assert.deepStrictEqual({
      hasDisclosure: !!disclosure,
      summaryLabel: summary?.textContent,
      announcedToggles
    }, {
      hasDisclosure: true,
      summaryLabel: "Completed 2 steps",
      announcedToggles: 1
    });
    disposables.dispose();
  });
  test("reconstructs a large collapsed subagent history through one renderer batch", async () => {
    const disposables = store.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration("chat.agent.thinking.collapsedTools", CollapsedToolsDisplayMode.Off);
    configurationService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, false);
    configurationService.setUserConfiguration("chat.checkpoints.enabled", false);
    configurationService.setUserConfiguration("chat.checkpoints.showFileChanges", false);
    configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
    const model = disposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, void 0));
    model.addRequest({
      text: "test",
      parts: [new ChatRequestTextPart(new OffsetRange(0, 4), new Range(1, 1, 1, 5), "test")]
    }, { variables: [] }, 0);
    const response = viewModel.getItems().find(isResponseVM);
    assert.ok(response);
    const parentSubagent = {
      kind: "toolInvocationSerialized",
      toolCallId: "subagent-1",
      toolId: "task",
      source: ToolDataSource.Internal,
      invocationMessage: "Running subagent",
      originMessage: void 0,
      pastTenseMessage: void 0,
      isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      isComplete: false,
      presentation: void 0,
      toolSpecificData: { kind: "subagent", description: "Investigate", isActive: true }
    };
    const toolData = {
      id: "search",
      displayName: "Search",
      modelDescription: "Search files",
      source: ToolDataSource.Internal
    };
    const childTools = Array.from({ length: 128 }, (_, index) => new ChatToolInvocation(
      {
        invocationMessage: `Completed tool ${index}`,
        pastTenseMessage: `Completed tool ${index}`
      },
      toolData,
      `child-${index}`,
      parentSubagent.toolCallId,
      {}
    ));
    await Promise.all(childTools.map((tool) => tool.didExecuteTool(void 0)));
    const content = [parentSubagent, ...childTools];
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    disposables.add(toDisposable(() => container.remove()));
    const renderer = disposables.add(instantiationService.createInstance(
      ChatListItemRenderer,
      {},
      {},
      {
        getListLength: () => 1,
        onDidScroll: () => toDisposable(() => {
        }),
        container,
        currentChatMode: () => ChatModeKind.Agent
      },
      void 0,
      viewModel
    ));
    const template = renderer.renderTemplate(container);
    disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
    const privateRenderer = renderer;
    privateRenderer.renderChatContentDiff(content, content, response, 0, template);
    privateRenderer.clearRenderedParts(template);
    privateRenderer.renderChatContentDiff(content, content, response, 0, template);
    const subagentPart = template.renderedParts?.find((part) => part instanceof ChatSubagentContentPart);
    assert.ok(subagentPart);
    const titleBeforeExpansion = subagentPart.domNode.textContent ?? "";
    const expandButton = subagentPart.domNode.querySelector(".chat-used-context-label > .monaco-button");
    assert.ok(expandButton);
    expandButton.click();
    assert.deepStrictEqual({
      titleIncludesLatestTool: titleBeforeExpansion.includes("Completed tool 127"),
      renderedToolCount: subagentPart.domNode.querySelectorAll(".chat-thinking-tool-wrapper").length
    }, {
      titleIncludesLatestTool: true,
      renderedToolCount: 128
    });
    disposables.dispose();
  });
  test.skip("fireItemHeightChange defers a mid-render measurement and delivers it after the render pass", async () => {
    const disposables = store.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
    const model = disposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, void 0));
    const text = "test";
    const request = model.addRequest({
      text,
      parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
    }, { variables: [] }, 0);
    const response = viewModel.getItems().find(isResponseVM);
    assert.ok(response);
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    disposables.add(toDisposable(() => container.remove()));
    const renderer = disposables.add(instantiationService.createInstance(
      ChatListItemRenderer,
      {},
      { progressMessageAtBottomOfResponse: true },
      {
        getListLength: () => 1,
        onDidScroll: () => toDisposable(() => {
        }),
        container,
        currentChatMode: () => ChatModeKind.Agent
      },
      void 0,
      viewModel
    ));
    const template = renderer.renderTemplate(container);
    disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
    const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: void 0 };
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("Some initial content") });
    renderer.renderElement(node, 0, template);
    request.response?.complete();
    renderer.renderElement(node, 0, template);
    const privateRenderer = renderer;
    const nextFrame = () => new Promise((resolve) => dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => resolve()));
    await nextFrame();
    await nextFrame();
    const renderedHeight = Math.ceil(template.rowContainer.getBoundingClientRect().height);
    assert.ok(renderedHeight > 1, "row should have a real rendered height");
    response.currentRenderedHeight = renderedHeight - 1;
    const heightEvents = [];
    disposables.add(renderer.onDidChangeItemHeight((e) => heightEvents.push(e.height)));
    privateRenderer._elementBeingRendered = response;
    privateRenderer.fireItemHeightChange(template);
    assert.deepStrictEqual(
      { events: [...heightEvents], stored: response.currentRenderedHeight },
      { events: [], stored: renderedHeight - 1 }
    );
    privateRenderer._elementBeingRendered = void 0;
    await nextFrame();
    assert.deepStrictEqual(
      { events: [...heightEvents], stored: response.currentRenderedHeight },
      { events: [renderedHeight], stored: renderedHeight }
    );
    disposables.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdExpc3RSZW5kZXJlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgYnVpbGRQbGFuUmV2aWV3UHJvZ3Jlc3NDb250ZW50LCBDaGF0TGlzdEl0ZW1SZW5kZXJlciwgZW5kc1dpdGhBY3RpdmVTdWJhZ2VudENvbnRlbnQsIGVuZHNXaXRoQ29tcGxldGVkUXVlc3Rpb25JbnRlcmFjdGlvbiwgZm9ybWF0Q29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlTGFiZWwsIGZvcm1hdFJlc3BvbnNlVG9rZW5TdGF0cywgZ2V0Q29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4LCBnZXRGaW5hbFJlc3BvbnNlU3RhcnRJbmRleCwgZ2V0RmluYWxSZXNwb25zZVN0YXJ0SW5kZXhBZnRlck1vdmluZ1Jlc3BvbnNlT3V0Y29tZVRvb2xzLCBnZXRWaXNpYmxlQ29tcGxldGVkUmVzcG9uc2VJdGVtQ291bnQsIGdldFdvcmtpbmdQcm9ncmVzc1JlbGV2YW50UGFydHMsIElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgaXNGaW5hbFJlc3BvbnNlUmVuZGVyZWQsIGlzV2FpdGluZ0Zvck1jcFNlcnZlcnMsIG1vdmVSZXNwb25zZU91dGNvbWVUb29sc0FmdGVyRmluYWxSZXNwb25zZSwgcmVjb25jaWxlQ2hhdEl0ZW1IZWlnaHQsIHJlbmRlckNoYXRSZXF1ZXN0VGltZXN0YW1wLCByZW5kZXJDaGF0UmVzcG9uc2VEZXRhaWxzLCBzaG91bGRDb2xsYXBzZUNvbXBsZXRlZFJlc3BvbnNlUGFydCwgc2hvdWxkQ3JlYXRlR3JvdXBlZFRoaW5raW5nUGFydCwgc2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHksIHNob3VsZFBpblRvb2xJbnZvY2F0aW9uVG9UaGlua2luZywgc2hvdWxkUmVuZGVySW5pdGlhbFByb2dyZXNzaXZlQ29udGVudEltbWVkaWF0ZWx5LCBzaG91bGRTY2hlZHVsZUluaXRpYWxIZWlnaHRDaGFuZ2UsIHNob3VsZFNob3dGaWxlQ2hhbmdlc1N1bW1hcnlGb3JTZXR0aW5ncywgc2hvdWxkU2hvd1BpbGxzU3VtbWFyeUZvclNldHRpbmdzLCBzaG91bGRTdGFydE5ld0NvbGxhcHNlZFRoaW5raW5nR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0TGlzdFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IENoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IGlzQ2hhdFR1cm5TdGF0dXNQaWxsc0VuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0VHVyblBpbGxzLmpzJztcbmltcG9ydCB7IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0U3ViYWdlbnRDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQsIElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nU2xvdywgSUNoYXRRdWVzdGlvbkNhcm91c2VsLCBJQ2hhdFNlcnZpY2UsIElDaGF0VG9vbEludm9jYXRpb24sIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZm9ybWF0Q2hhdFJlcXVlc3RUaW1lc3RhbXAsIGZvcm1hdENoYXRSZXNwb25zZURldGFpbHMsIGZvcm1hdEVsYXBzZWRUaW1lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRQcm9ncmVzc0Zvcm1hdHRpbmcuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQsIENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUsIFRoaW5raW5nRGlzcGxheU1vZGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdNb2RlbCwgSUNoYXRQZW5kaW5nRGl2aWRlclZpZXdNb2RlbCwgSUNoYXRSZW5kZXJlckNvbnRlbnQsIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGlzUmVxdWVzdFZNLCBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFRvb2xJbnZvY2F0aW9uLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudFNlcnZpY2UsIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0VGV4dFBhcnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgVG9vbERhdGFTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRPcHRpb25zLmpzJztcbmltcG9ydCB7IHNob3VsZFJlbmRlckdlbmVyYXRlZEltYWdlUmVzdWx0LCBzaG91bGRSZW5kZXJTZXNzaW9uQ3JlYXRlZFJlc3VsdCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VG9vbEludm9jYXRpb25QYXJ0LmpzJztcbmltcG9ydCB7IGdldEdlbmVyYXRlZEltYWdlUmVzdWx0UGFydHMsIGdldEdlbmVyYXRlZEltYWdlUmVzdWx0UGFydHNGcm9tQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0R2VuZXJhdGVkSW1hZ2VSZXN1bHRTdWJQYXJ0LmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnQ2hhdExpc3RSZW5kZXJlcicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnc2hvdWxkU2NoZWR1bGVJbml0aWFsSGVpZ2h0Q2hhbmdlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ29ubHkgc2NoZWR1bGVzIGZpcnN0IG1lYXN1cmVtZW50IHVwZGF0ZXMgd2hlbiBuZWVkZWQgdG8gYXZvaWQgY2xpcHBpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0c2hvdWxkU2NoZWR1bGVJbml0aWFsSGVpZ2h0Q2hhbmdlKDEyMCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0c2hvdWxkU2NoZWR1bGVJbml0aWFsSGVpZ2h0Q2hhbmdlKDEyMCwgMTIwKSxcblx0XHRcdFx0c2hvdWxkU2NoZWR1bGVJbml0aWFsSGVpZ2h0Q2hhbmdlKDEyMCwgMTIwLjEpLFxuXHRcdFx0XHRzaG91bGRTY2hlZHVsZUluaXRpYWxIZWlnaHRDaGFuZ2UoMTIxLCAxMjApLFxuXHRcdFx0XHRzaG91bGRTY2hlZHVsZUluaXRpYWxIZWlnaHRDaGFuZ2UoMTIxLCAxMjAuMSksXG5cdFx0XHRdLCBbXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2dldEZpbmFsUmVzcG9uc2VTdGFydEluZGV4JywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZmluZHMgdGhlIHRyYWlsaW5nIG1hcmtkb3duIHJlc3BvbnNlIHdoaWxlIGxlYXZpbmcgdHJhaWxpbmcgYWRqdW5jdHMgaW4gcGxhY2UnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRcdGdldEZpbmFsUmVzcG9uc2VTdGFydEluZGV4KFtcblx0XHRcdFx0XHRcdHsga2luZDogJ3JlZmVyZW5jZXMnLCByZWZlcmVuY2VzOiBbXSB9LFxuXHRcdFx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdGaW5hbCByZXNwb25zZScpIH0sXG5cdFx0XHRcdFx0XHR7IGtpbmQ6ICdyZWZlcmVuY2VzJywgcmVmZXJlbmNlczogW10gfSxcblx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XHRnZXRGaW5hbFJlc3BvbnNlU3RhcnRJbmRleChbXG5cdFx0XHRcdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0VhcmxpZXIgcmVzcG9uc2UnKSB9LFxuXHRcdFx0XHRcdFx0eyBraW5kOiAncmVmZXJlbmNlcycsIHJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRcdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0ZpcnN0IHNlZ21lbnQnKSB9LFxuXHRcdFx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdTZWNvbmQgc2VnbWVudCcpIH0sXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0Z2V0RmluYWxSZXNwb25zZVN0YXJ0SW5kZXgoW1xuXHRcdFx0XHRcdFx0eyBraW5kOiAncmVmZXJlbmNlcycsIHJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRcdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJycpIH0sXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdF0sIFtcblx0XHRcdFx0XHQxLFxuXHRcdFx0XHRcdDIsXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmb3JtYXRzIGNvbXBsZXRlZCByZXNwb25zZSBkaXNjbG9zdXJlIHN0ZXAgY291bnQgYW5kIHRpbWluZycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdFx0Zm9ybWF0Q29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlTGFiZWwoMSwgODNfMDAwKSxcblx0XHRcdFx0XHRmb3JtYXRDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVMYWJlbCg2LCA4M18wMDApLFxuXHRcdFx0XHRcdGZvcm1hdENvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZUxhYmVsKDYsIHVuZGVmaW5lZCksXG5cdFx0XHRcdF0sIFtcblx0XHRcdFx0XHQnQ29tcGxldGVkIDEgc3RlcCBpbiAxbSAyM3MnLFxuXHRcdFx0XHRcdCdDb21wbGV0ZWQgNiBzdGVwcyBpbiAxbSAyM3MnLFxuXHRcdFx0XHRcdCdDb21wbGV0ZWQgNiBzdGVwcycsXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2NvdW50cyB2aXNpYmxlIGNvbXBsZXRlZCByZXNwb25zZSBpdGVtcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaGlkZGVuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdGhpZGRlbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHRjb25zdCBmaXJzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRjb25zdCBzZWNvbmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0XHRnZXRWaXNpYmxlQ29tcGxldGVkUmVzcG9uc2VJdGVtQ291bnQoW2hpZGRlbiwgZmlyc3RdKSxcblx0XHRcdFx0XHRnZXRWaXNpYmxlQ29tcGxldGVkUmVzcG9uc2VJdGVtQ291bnQoW2hpZGRlbiwgZmlyc3QsIHNlY29uZF0pLFxuXHRcdFx0XHRdLCBbXG5cdFx0XHRcdFx0MSxcblx0XHRcdFx0XHQyLFxuXHRcdFx0XHRdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdrZWVwcyBNQ1AgYXBwcyBvdXRzaWRlIGNvbXBsZXRlZCByZXNwb25zZSBkaXNjbG9zdXJlJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0b29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCA9IHtcblx0XHRcdFx0XHRraW5kOiAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnbWNwLWFwcCcsXG5cdFx0XHRcdFx0dG9vbElkOiAnY3JlYXRlX2lzc3VlJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0NyZWF0aW5nIGlzc3VlLi4uJyxcblx0XHRcdFx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0NyZWF0ZWQgaXNzdWUnLFxuXHRcdFx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0aXNDb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0XHRcdHByZXNlbnRhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IG1jcEFwcFRvb2w6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkID0ge1xuXHRcdFx0XHRcdC4uLnRvb2wsXG5cdFx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdFx0a2luZDogJ2lucHV0Jyxcblx0XHRcdFx0XHRcdHJhd0lucHV0OiB7fSxcblx0XHRcdFx0XHRcdG1jcEFwcERhdGE6IHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ2xvY2FsJyxcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2dpdGh1Yi9jcmVhdGUtaXNzdWUnLFxuXHRcdFx0XHRcdFx0XHRzZXJ2ZXJEZWZpbml0aW9uSWQ6ICdnaXRodWInLFxuXHRcdFx0XHRcdFx0XHRjb2xsZWN0aW9uSWQ6ICdnaXRodWInLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBmaW5hbFJlc3BvbnNlID0geyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdGaW5hbCByZXNwb25zZScpIH0gYXMgY29uc3Q7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0cmVndWxhclRvb2xDb2xsYXBzZXM6IHNob3VsZENvbGxhcHNlQ29tcGxldGVkUmVzcG9uc2VQYXJ0KHRvb2wpLFxuXHRcdFx0XHRcdG1jcEFwcENvbGxhcHNlczogc2hvdWxkQ29sbGFwc2VDb21wbGV0ZWRSZXNwb25zZVBhcnQobWNwQXBwVG9vbCksXG5cdFx0XHRcdFx0d2l0aG91dE1jcEFwcDogZ2V0Q29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4KFt0b29sLCB0b29sLCBmaW5hbFJlc3BvbnNlXSwgMiksXG5cdFx0XHRcdFx0bWNwQXBwQWZ0ZXJPbmVTdGVwOiBnZXRDb21wbGV0ZWRSZXNwb25zZUNvbGxhcHNlRW5kSW5kZXgoW3Rvb2wsIG1jcEFwcFRvb2wsIHRvb2wsIGZpbmFsUmVzcG9uc2VdLCAzKSxcblx0XHRcdFx0XHRtY3BBcHBGaXJzdDogZ2V0Q29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4KFttY3BBcHBUb29sLCB0b29sLCBmaW5hbFJlc3BvbnNlXSwgMiksXG5cdFx0XHRcdFx0bXVsdGlwbGVNY3BBcHBzOiBnZXRDb21wbGV0ZWRSZXNwb25zZUNvbGxhcHNlRW5kSW5kZXgoW3Rvb2wsIG1jcEFwcFRvb2wsIHRvb2wsIG1jcEFwcFRvb2wsIGZpbmFsUmVzcG9uc2VdLCA0KSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHJlZ3VsYXJUb29sQ29sbGFwc2VzOiB0cnVlLFxuXHRcdFx0XHRcdG1jcEFwcENvbGxhcHNlczogZmFsc2UsXG5cdFx0XHRcdFx0d2l0aG91dE1jcEFwcDogMixcblx0XHRcdFx0XHRtY3BBcHBBZnRlck9uZVN0ZXA6IDEsXG5cdFx0XHRcdFx0bWNwQXBwRmlyc3Q6IDAsXG5cdFx0XHRcdFx0bXVsdGlwbGVNY3BBcHBzOiAxLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdtb3ZlcyBkdXJhYmxlIHRvb2wgb3V0Y29tZXMgYWZ0ZXIgdGhlIGZpbmFsIHJlc3BvbnNlIGFuZCBiZWZvcmUgdHJhaWxpbmcgYWRqdW5jdHMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRvb2w6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkID0ge1xuXHRcdFx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdjcmVhdGUtc2Vzc2lvbicsXG5cdFx0XHRcdFx0dG9vbElkOiAnY3JlYXRlX3Nlc3Npb24nLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnQ3JlYXRpbmcgc2Vzc2lvbi4uLicsXG5cdFx0XHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdDcmVhdGVkIHNlc3Npb24nLFxuXHRcdFx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0aXNDb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0XHRcdHByZXNlbnRhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdFx0a2luZDogJ3Nlc3Npb25DcmVhdGVkJyxcblx0XHRcdFx0XHRcdG9wZW5MaW5rOiAnYWdlbnQtaG9zdC1zZXNzaW9uOi8vbG9jYWwvc2Vzc2lvbicsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ0ltcGxlbWVudCBpc3N1ZScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgZ2VuZXJhdGVkSW1hZ2U6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkID0ge1xuXHRcdFx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdnZW5lcmF0ZWQtaW1hZ2UnLFxuXHRcdFx0XHRcdHRvb2xJZDogJ2ltYWdlX2dlbi5pbWFnZWdlbicsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdHZW5lcmF0aW5nIGltYWdlJyxcblx0XHRcdFx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0dlbmVyYXRlZCBpbWFnZScsXG5cdFx0XHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRpc0NvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7IGtpbmQ6ICdnZW5lcmF0ZWRJbWFnZScgfSxcblx0XHRcdFx0XHRyZXN1bHREZXRhaWxzOiB7XG5cdFx0XHRcdFx0XHRpbnB1dDogJ3tcInByb21wdFwiOlwiRHJhdyBhIGZveFwifScsXG5cdFx0XHRcdFx0XHRvdXRwdXQ6IFt7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiAnYVcxaFoyVT0nLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycgfV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgZmlyc3RTdGVwID0geyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdGaXJzdCBzdGVwJykgfSBhcyBjb25zdDtcblx0XHRcdFx0Y29uc3QgZmluYWxSZXNwb25zZSA9IHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnRmluYWwgcmVzcG9uc2UnKSB9IGFzIGNvbnN0O1xuXHRcdFx0XHRjb25zdCB0cmFpbGluZ0FkanVuY3QgPSB7IGtpbmQ6ICdyZWZlcmVuY2VzJywgcmVmZXJlbmNlczogW10gfSBhcyBjb25zdDtcblxuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW2ZpcnN0U3RlcCwgdG9vbCwgZ2VuZXJhdGVkSW1hZ2UsIGZpbmFsUmVzcG9uc2UsIHRyYWlsaW5nQWRqdW5jdF07XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGNvbnRlbnQ6IG1vdmVSZXNwb25zZU91dGNvbWVUb29sc0FmdGVyRmluYWxSZXNwb25zZShjb250ZW50KSxcblx0XHRcdFx0XHRmaW5hbFJlc3BvbnNlU3RhcnRJbmRleDogZ2V0RmluYWxSZXNwb25zZVN0YXJ0SW5kZXhBZnRlck1vdmluZ1Jlc3BvbnNlT3V0Y29tZVRvb2xzKGNvbnRlbnQpLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0Y29udGVudDogW2ZpcnN0U3RlcCwgZmluYWxSZXNwb25zZSwgdG9vbCwgZ2VuZXJhdGVkSW1hZ2UsIHRyYWlsaW5nQWRqdW5jdF0sXG5cdFx0XHRcdFx0ZmluYWxSZXNwb25zZVN0YXJ0SW5kZXg6IDEsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2xlYXZlcyBjcmVhdGVkLXNlc3Npb24gdG9vbHMgaW4gcGxhY2Ugd2hlbiB0aGVyZSBpcyBubyBmaW5hbCByZXNwb25zZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdG9vbDogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgPSB7XG5cdFx0XHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2NyZWF0ZS1zZXNzaW9uJyxcblx0XHRcdFx0XHR0b29sSWQ6ICdjcmVhdGVfc2Vzc2lvbicsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdDcmVhdGluZyBzZXNzaW9uLi4uJyxcblx0XHRcdFx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0NyZWF0ZWQgc2Vzc2lvbicsXG5cdFx0XHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRpc0NvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnc2Vzc2lvbkNyZWF0ZWQnLFxuXHRcdFx0XHRcdFx0b3Blbkxpbms6ICdhZ2VudC1ob3N0LXNlc3Npb246Ly9sb2NhbC9zZXNzaW9uJyxcblx0XHRcdFx0XHRcdGxhYmVsOiAnSW1wbGVtZW50IGlzc3VlJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW92ZVJlc3BvbnNlT3V0Y29tZVRvb2xzQWZ0ZXJGaW5hbFJlc3BvbnNlKFt0b29sXSksIFt0b29sXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnd2FpdHMgZm9yIHRoZSBmaW5hbCByZXNwb25zZSBiZWZvcmUgY3JlYXRpbmcgdGhlIGNvbXBsZXRlZC13b3JrIGRpc2Nsb3N1cmUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbmFsUmVzcG9uc2UgPSB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0ZpbmFsIHJlc3BvbnNlJykgfSBhcyBjb25zdDtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdFx0aXNGaW5hbFJlc3BvbnNlUmVuZGVyZWQoW10sIDIpLFxuXHRcdFx0XHRcdGlzRmluYWxSZXNwb25zZVJlbmRlcmVkKFt7IGtpbmQ6ICdyZWZlcmVuY2VzJywgcmVmZXJlbmNlczogW10gfSwgZmluYWxSZXNwb25zZV0sIDEpLFxuXHRcdFx0XHRdLCBbXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmVuZGVycyB0aGUgY3JlYXRlZC1zZXNzaW9uIHJlc3VsdCBvbmx5IGFmdGVyIHRoZSByZXNwb25zZSBjb21wbGV0ZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRcdHNob3VsZFJlbmRlclNlc3Npb25DcmVhdGVkUmVzdWx0KCdzZXNzaW9uQ3JlYXRlZCcsIGZhbHNlKSxcblx0XHRcdFx0XHRzaG91bGRSZW5kZXJTZXNzaW9uQ3JlYXRlZFJlc3VsdCgnc2Vzc2lvbkNyZWF0ZWQnLCB0cnVlKSxcblx0XHRcdFx0XHRzaG91bGRSZW5kZXJTZXNzaW9uQ3JlYXRlZFJlc3VsdCgndGVybWluYWwnLCB0cnVlKSxcblx0XHRcdFx0XSwgW1xuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JlbmRlcnMgZ2VuZXJhdGVkIGltYWdlcyBhcyBvdXRjb21lcyBvbmx5IGFmdGVyIHRoZSByZXNwb25zZSBjb21wbGV0ZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRcdHNob3VsZFJlbmRlckdlbmVyYXRlZEltYWdlUmVzdWx0KCdnZW5lcmF0ZWRJbWFnZScsIGZhbHNlKSxcblx0XHRcdFx0XHRzaG91bGRSZW5kZXJHZW5lcmF0ZWRJbWFnZVJlc3VsdCgnZ2VuZXJhdGVkSW1hZ2UnLCB0cnVlKSxcblx0XHRcdFx0XHRzaG91bGRSZW5kZXJHZW5lcmF0ZWRJbWFnZVJlc3VsdCgndGVybWluYWwnLCB0cnVlKSxcblx0XHRcdFx0XSwgW1xuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2J1aWxkcyBnZW5lcmF0ZWQgaW1hZ2UgcHJldmlld3MgZnJvbSBlbWJlZGRlZCBpbWFnZSByZXN1bHRzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3Q6Ly9sb2NhbC9zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IHBhcnRzID0gZ2V0R2VuZXJhdGVkSW1hZ2VSZXN1bHRQYXJ0cyh7XG5cdFx0XHRcdFx0aW5wdXQ6ICd7XCJwcm9tcHRcIjpcIkRyYXcgYSBmb3hcIn0nLFxuXHRcdFx0XHRcdG91dHB1dDogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiAnZW1iZWQnLCB2YWx1ZTogJ2FXMWhaMlU9JywgbWltZVR5cGU6ICdpbWFnZS9wbmcnIH0sXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiAnYVcxaFoyVXknLCBtaW1lVHlwZTogJ2ltYWdlL2pwZWcnIH0sXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiAnZGV0YWlscycsIG1pbWVUeXBlOiAndGV4dC9wbGFpbicsIGlzVGV4dDogdHJ1ZSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sIHNlc3Npb25SZXNvdXJjZSwgJ2ltYWdlLWNhbGwnKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnRzLm1hcChwYXJ0ID0+ICh7XG5cdFx0XHRcdFx0a2luZDogcGFydC5raW5kLFxuXHRcdFx0XHRcdGJhc2U2NFZhbHVlOiBwYXJ0LmJhc2U2NFZhbHVlLFxuXHRcdFx0XHRcdG1pbWVUeXBlOiBwYXJ0Lm1pbWVUeXBlLFxuXHRcdFx0XHRcdHBhdGg6IHBhcnQudXJpLnBhdGgsXG5cdFx0XHRcdH0pKSwgW3tcblx0XHRcdFx0XHRraW5kOiAnZGF0YScsXG5cdFx0XHRcdFx0YmFzZTY0VmFsdWU6ICdhVzFoWjJVPScsXG5cdFx0XHRcdFx0bWltZVR5cGU6ICdpbWFnZS9wbmcnLFxuXHRcdFx0XHRcdHBhdGg6ICcvdG9vbC9pbWFnZS1jYWxsLzAvZ2VuZXJhdGVkLWltYWdlLnBuZycsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRraW5kOiAnZGF0YScsXG5cdFx0XHRcdFx0YmFzZTY0VmFsdWU6ICdhVzFoWjJVeScsXG5cdFx0XHRcdFx0bWltZVR5cGU6ICdpbWFnZS9qcGVnJyxcblx0XHRcdFx0XHRwYXRoOiAnL3Rvb2wvaW1hZ2UtY2FsbC8xL2dlbmVyYXRlZC1pbWFnZS5qcGUnLFxuXHRcdFx0XHR9XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnY29tYmluZXMgZ2VuZXJhdGVkIGltYWdlIHJlc3VsdHMgZnJvbSBtdWx0aXBsZSB0b29sIGNhbGxzIGludG8gb25lIGdhbGxlcnknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDovL2xvY2FsL3Nlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgY3JlYXRlSW1hZ2VUb29sID0gKHRvb2xDYWxsSWQ6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkID0+ICh7XG5cdFx0XHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHR0b29sSWQ6ICdpbWFnZV9nZW4uaW1hZ2VnZW4nLFxuXHRcdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHsga2luZDogJ2dlbmVyYXRlZEltYWdlJyB9LFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnR2VuZXJhdGluZyBpbWFnZScsXG5cdFx0XHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdHZW5lcmF0ZWQgaW1hZ2UnLFxuXHRcdFx0XHRcdHByZXNlbnRhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGlzQ29uZmlybWVkOiB0cnVlLFxuXHRcdFx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0XHRyZXN1bHREZXRhaWxzOiB7XG5cdFx0XHRcdFx0XHRpbnB1dDogJ3tcInByb21wdFwiOlwiRHJhdyBhIGZveFwifScsXG5cdFx0XHRcdFx0XHRvdXRwdXQ6IFt7IHR5cGU6ICdlbWJlZCcsIHZhbHVlLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycgfV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHBhcnRzID0gZ2V0R2VuZXJhdGVkSW1hZ2VSZXN1bHRQYXJ0c0Zyb21Db250ZW50KFtcblx0XHRcdFx0XHRjcmVhdGVJbWFnZVRvb2woJ2ltYWdlLWNhbGwtMScsICdhVzFoWjJVeCcpLFxuXHRcdFx0XHRcdGNyZWF0ZUltYWdlVG9vbCgnaW1hZ2UtY2FsbC0yJywgJ2FXMWhaMlV5JyksXG5cdFx0XHRcdF0sIHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0cy5tYXAocGFydCA9PiAoe1xuXHRcdFx0XHRcdGJhc2U2NFZhbHVlOiBwYXJ0LmJhc2U2NFZhbHVlLFxuXHRcdFx0XHRcdHBhdGg6IHBhcnQudXJpLnBhdGgsXG5cdFx0XHRcdH0pKSwgW3tcblx0XHRcdFx0XHRiYXNlNjRWYWx1ZTogJ2FXMWhaMlV4Jyxcblx0XHRcdFx0XHRwYXRoOiAnL3Rvb2wvaW1hZ2UtY2FsbC0xLzAvZ2VuZXJhdGVkLWltYWdlLTEucG5nJyxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGJhc2U2NFZhbHVlOiAnYVcxaFoyVXknLFxuXHRcdFx0XHRcdHBhdGg6ICcvdG9vbC9pbWFnZS1jYWxsLTIvMC9nZW5lcmF0ZWQtaW1hZ2UtMi5wbmcnLFxuXHRcdFx0XHR9XSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlY29uY2lsZUNoYXRJdGVtSGVpZ2h0JywgKCkgPT4ge1xuXHRcdC8vIEhlbHBlcjogcnVuIGEgc2VxdWVuY2Ugb2YgbWVhc3VyZW1lbnRzIHRocm91Z2ggdGhlIHJlY29uY2lsZXIsIHRocmVhZGluZ1xuXHRcdC8vIGBjdXJyZW50UmVuZGVyZWRIZWlnaHRgIHRoZSB3YXkgYGZpcmVJdGVtSGVpZ2h0Q2hhbmdlYCBkb2VzLCBhbmQgY2FwdHVyZSB0aGVcblx0XHQvLyBub3RpZmljYXRpb24ga2luZCArIHRoZSBzdG9yZWQgaGVpZ2h0IGFmdGVyIGVhY2ggc3RlcC4gYGluaXRpYWxTdG9yZWRgIGlzIHRoZVxuXHRcdC8vIGVsZW1lbnQncyBgY3VycmVudFJlbmRlcmVkSGVpZ2h0YCBiZWZvcmUgdGhlIGZpcnN0IHN0ZXAgKHVuZGVmaW5lZCA9IG5ldmVyIG1lYXN1cmVkKS5cblx0XHRjb25zdCBydW4gPSAoc3RlcHM6IHJlYWRvbmx5IHsgbWVhc3VyZWQ6IG51bWJlcjsgaXNCZWluZ1JlbmRlcmVkOiBib29sZWFuIH1bXSwgYWxsb2NhdGVkSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQsIGluaXRpYWxTdG9yZWQ6IG51bWJlciB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0bGV0IHN0b3JlZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gaW5pdGlhbFN0b3JlZDtcblx0XHRcdHJldHVybiBzdGVwcy5tYXAoKHsgbWVhc3VyZWQsIGlzQmVpbmdSZW5kZXJlZCB9KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZSA9IHJlY29uY2lsZUNoYXRJdGVtSGVpZ2h0KG1lYXN1cmVkLCBzdG9yZWQsIGlzQmVpbmdSZW5kZXJlZCwgYWxsb2NhdGVkSGVpZ2h0KTtcblx0XHRcdFx0c3RvcmVkID0gdXBkYXRlLm5leHRSZW5kZXJlZEhlaWdodDtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogdXBkYXRlLmtpbmQsIGhlaWdodDogdXBkYXRlLmhlaWdodCwgc3RvcmVkIH07XG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0Ly8gUmVncmVzc2lvbiB0ZXN0IGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzI2OTUyLlxuXHRcdC8vIEEgcm93IGdyb3dzIGR1cmluZyBzdHJlYW1pbmcgYW5kIGlzIG1lYXN1cmVkIHN5bmNocm9ub3VzbHkgd2hpbGUgaXQgaXMgYmVpbmcgcmVuZGVyZWRcblx0XHQvLyAobm90aWZpY2F0aW9uIHN1cHByZXNzZWQpLiBUaGUgc3RvcmVkIGhlaWdodCBtdXN0IE5PVCBhZHZhbmNlLCBhbmQgYSBkZWZlcnJlZCByZS1tZWFzdXJlXG5cdFx0Ly8gbXVzdCBiZSByZXF1ZXN0ZWQsIHNvIGEgZm9sbG93LXVwIG1lYXN1cmVtZW50IG9mIHRoZSBncm93biBoZWlnaHQgYWN0dWFsbHkgcmVhY2hlcyB0aGVcblx0XHQvLyB0cmVlIGluc3RlYWQgb2YgYmVpbmcgZGVkdXBlZCBhd2F5ICh3aGljaCB3b3VsZCBzdHJhbmQgdGhlIGNvbnRlbnQgdW50aWwgYSB3aW5kb3cgcmVzaXplKS5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzdHJhbmQgYSBncm93biBoZWlnaHQgZmlyc3Qgc2VlbiB3aGlsZSB0aGUgcm93IGlzIGJlaW5nIHJlbmRlcmVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cnVuKFtcblx0XHRcdFx0XHR7IG1lYXN1cmVkOiA5MDAsIGlzQmVpbmdSZW5kZXJlZDogdHJ1ZSB9LCAgIC8vIGdyZXcgbWlkLXJlbmRlciAtPiBzdXBwcmVzc2VkLCBkZWZlclxuXHRcdFx0XHRcdHsgbWVhc3VyZWQ6IDkwMCwgaXNCZWluZ1JlbmRlcmVkOiBmYWxzZSB9LCAgLy8gZGVmZXJyZWQgcmUtbWVhc3VyZSBkZWxpdmVycyB0aGUgaGVpZ2h0XG5cdFx0XHRcdF0sIC8qYWxsb2NhdGVkSGVpZ2h0Ki8gNTAwLCAvKmluaXRpYWxTdG9yZWQqLyA1MDApLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBraW5kOiAnZGVmZXJSZU1lYXN1cmUnLCBoZWlnaHQ6IDkwMCwgc3RvcmVkOiA1MDAgfSxcblx0XHRcdFx0XHR7IGtpbmQ6ICdmaXJlJywgaGVpZ2h0OiA5MDAsIHN0b3JlZDogOTAwIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90aWZpZXMgdGhlIHRyZWUgb24gYXN5bmMgZ3Jvd3RoIGFuZCBpZ25vcmVzIGFuIHVuY2hhbmdlZCBtZWFzdXJlbWVudCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJ1bihbXG5cdFx0XHRcdFx0eyBtZWFzdXJlZDogNzAwLCBpc0JlaW5nUmVuZGVyZWQ6IGZhbHNlIH0sICAvLyBhc3luYyBncm93dGggLT4gbm90aWZ5XG5cdFx0XHRcdFx0eyBtZWFzdXJlZDogNzAwLCBpc0JlaW5nUmVuZGVyZWQ6IGZhbHNlIH0sICAvLyB1bmNoYW5nZWQgLT4gbm8tb3Bcblx0XHRcdFx0XSwgLyphbGxvY2F0ZWRIZWlnaHQqLyA1MDAsIC8qaW5pdGlhbFN0b3JlZCovIDUwMCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IGtpbmQ6ICdmaXJlJywgaGVpZ2h0OiA3MDAsIHN0b3JlZDogNzAwIH0sXG5cdFx0XHRcdFx0eyBraW5kOiAnbm9uZScsIGhlaWdodDogNzAwLCBzdG9yZWQ6IDcwMCB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpcnN0IG1lYXN1cmVtZW50IChubyBzdG9yZWQgaGVpZ2h0KSBvbmx5IHNjaGVkdWxlcyBhbiB1cGRhdGUgd2hlbiBjb250ZW50IHdvdWxkIGNsaXAnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0Ly8gSW5pdGlhbCBtZWFzdXJlbWVudCB0aGF0IGZpdHMgd2l0aGluIHRoZSBhbGxvY2F0ZWQgaGVpZ2h0IC0+IG5vIG5vdGlmaWNhdGlvbi5cblx0XHRcdFx0cnVuKFt7IG1lYXN1cmVkOiA1MDAsIGlzQmVpbmdSZW5kZXJlZDogZmFsc2UgfV0sIC8qYWxsb2NhdGVkSGVpZ2h0Ki8gNTAwLCAvKmluaXRpYWxTdG9yZWQqLyB1bmRlZmluZWQpLFxuXHRcdFx0XHQvLyBJbml0aWFsIG1lYXN1cmVtZW50IGxhcmdlciB0aGFuIHRoZSBhbGxvY2F0aW9uIC0+IHNjaGVkdWxlIGFuIGluaXRpYWwgdXBkYXRlLlxuXHRcdFx0XHRydW4oW3sgbWVhc3VyZWQ6IDcwMCwgaXNCZWluZ1JlbmRlcmVkOiBmYWxzZSB9XSwgLyphbGxvY2F0ZWRIZWlnaHQqLyA1MDAsIC8qaW5pdGlhbFN0b3JlZCovIHVuZGVmaW5lZCksXG5cdFx0XHRdLCBbXG5cdFx0XHRcdFt7IGtpbmQ6ICdub25lJywgaGVpZ2h0OiA1MDAsIHN0b3JlZDogNTAwIH1dLFxuXHRcdFx0XHRbeyBraW5kOiAnc2NoZWR1bGVJbml0aWFsJywgaGVpZ2h0OiA3MDAsIHN0b3JlZDogNzAwIH1dLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaG91bGRSZW5kZXJJbml0aWFsUHJvZ3Jlc3NpdmVDb250ZW50SW1tZWRpYXRlbHknLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVuZGVycyBhY2N1bXVsYXRlZCBtYXJrZG93biBpbW1lZGlhdGVseSBvbmx5IHdoZW4gcHJvZ3Jlc3NpdmUgcmVuZGVyaW5nIGhhcyBub3Qgc3RhcnRlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRzaG91bGRSZW5kZXJJbml0aWFsUHJvZ3Jlc3NpdmVDb250ZW50SW1tZWRpYXRlbHkoZmFsc2UsIHRydWUsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkUmVuZGVySW5pdGlhbFByb2dyZXNzaXZlQ29udGVudEltbWVkaWF0ZWx5KGZhbHNlLCB0cnVlLCB0cnVlKSxcblx0XHRcdFx0c2hvdWxkUmVuZGVySW5pdGlhbFByb2dyZXNzaXZlQ29udGVudEltbWVkaWF0ZWx5KHRydWUsIHRydWUsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkUmVuZGVySW5pdGlhbFByb2dyZXNzaXZlQ29udGVudEltbWVkaWF0ZWx5KGZhbHNlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaG91bGRTdGFydE5ld0NvbGxhcHNlZFRoaW5raW5nR3JvdXAnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2VwYXJhdGVzIHJlYXNvbmluZyBhbmQgZ3JvdXBlZCBpdGVtcyBvbmx5IGluIGNvbGxhcHNlZCBtb2RlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlYXNvbmluZ1RvSXRlbXM6IHNob3VsZFN0YXJ0TmV3Q29sbGFwc2VkVGhpbmtpbmdHcm91cChUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZCwgJ3JlYXNvbmluZycsICdpdGVtcycpLFxuXHRcdFx0XHRpdGVtc1RvUmVhc29uaW5nOiBzaG91bGRTdGFydE5ld0NvbGxhcHNlZFRoaW5raW5nR3JvdXAoVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWQsICdpdGVtcycsICdyZWFzb25pbmcnKSxcblx0XHRcdFx0cmVhc29uaW5nVG9SZWFzb25pbmc6IHNob3VsZFN0YXJ0TmV3Q29sbGFwc2VkVGhpbmtpbmdHcm91cChUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZCwgJ3JlYXNvbmluZycsICdyZWFzb25pbmcnKSxcblx0XHRcdFx0aXRlbXNUb0l0ZW1zOiBzaG91bGRTdGFydE5ld0NvbGxhcHNlZFRoaW5raW5nR3JvdXAoVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWQsICdpdGVtcycsICdpdGVtcycpLFxuXHRcdFx0XHRmaXhlZFNjcm9sbGluZzogc2hvdWxkU3RhcnROZXdDb2xsYXBzZWRUaGlua2luZ0dyb3VwKFRoaW5raW5nRGlzcGxheU1vZGUuRml4ZWRTY3JvbGxpbmcsICdyZWFzb25pbmcnLCAnaXRlbXMnKSxcblx0XHRcdFx0Y29sbGFwc2VkUHJldmlldzogc2hvdWxkU3RhcnROZXdDb2xsYXBzZWRUaGlua2luZ0dyb3VwKFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkUHJldmlldywgJ3JlYXNvbmluZycsICdpdGVtcycpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZWFzb25pbmdUb0l0ZW1zOiB0cnVlLFxuXHRcdFx0XHRpdGVtc1RvUmVhc29uaW5nOiB0cnVlLFxuXHRcdFx0XHRyZWFzb25pbmdUb1JlYXNvbmluZzogZmFsc2UsXG5cdFx0XHRcdGl0ZW1zVG9JdGVtczogZmFsc2UsXG5cdFx0XHRcdGZpeGVkU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0Y29sbGFwc2VkUHJldmlldzogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Nob3VsZENyZWF0ZUdyb3VwZWRUaGlua2luZ1BhcnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaG9ub3JzIHdpdGhUaGlua2luZyB1bmxlc3MgYSByZWFzb25pbmcgZ3JvdXAgd2FzIGp1c3Qgc2VwYXJhdGVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHdpdGhUaGlua2luZ1dpdGhvdXRSZWFzb25pbmc6IHNob3VsZENyZWF0ZUdyb3VwZWRUaGlua2luZ1BhcnQoQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5XaXRoVGhpbmtpbmcsIGZhbHNlKSxcblx0XHRcdFx0d2l0aFRoaW5raW5nQWZ0ZXJSZWFzb25pbmc6IHNob3VsZENyZWF0ZUdyb3VwZWRUaGlua2luZ1BhcnQoQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5XaXRoVGhpbmtpbmcsIHRydWUpLFxuXHRcdFx0XHRhbHdheXNXaXRob3V0UmVhc29uaW5nOiBzaG91bGRDcmVhdGVHcm91cGVkVGhpbmtpbmdQYXJ0KENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUuQWx3YXlzLCBmYWxzZSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdpdGhUaGlua2luZ1dpdGhvdXRSZWFzb25pbmc6IGZhbHNlLFxuXHRcdFx0XHR3aXRoVGhpbmtpbmdBZnRlclJlYXNvbmluZzogdHJ1ZSxcblx0XHRcdFx0YWx3YXlzV2l0aG91dFJlYXNvbmluZzogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZm9ybWF0Q2hhdFJlc3BvbnNlRGV0YWlscycsICgpID0+IHtcblx0XHR0ZXN0KCdmb3JtYXRzIGNvbXBsZXRpb24gbWV0YWRhdGEgZm9yIHRoZSBmb290ZXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0Zm9ybWF0Q2hhdFJlc3BvbnNlRGV0YWlscygnR1BULTUuNiBTb2wgXFx1MjAyMiAxLjUgY3JlZGl0cycsICc0OjU2IFBNJyksXG5cdFx0XHRcdGZvcm1hdENoYXRSZXNwb25zZURldGFpbHMoJ0dQVC01LjYgU29sJywgdW5kZWZpbmVkKSxcblx0XHRcdFx0Zm9ybWF0Q2hhdFJlc3BvbnNlRGV0YWlscyh1bmRlZmluZWQsICc0OjU2IFBNJyksXG5cdFx0XHRcdGZvcm1hdEVsYXBzZWRUaW1lKDgzXzAwMCksXG5cdFx0XHRdLCBbXG5cdFx0XHRcdCc0OjU2IFBNIFxcdTIwMjIgR1BULTUuNiBTb2wgXFx1MjAyMiAxLjUgY3JlZGl0cycsXG5cdFx0XHRcdCdHUFQtNS42IFNvbCcsXG5cdFx0XHRcdCc0OjU2IFBNJyxcblx0XHRcdFx0JzFtIDIzcycsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgY29tcGxldGlvbiB0aW1lIHdpdGggZWxhcHNlZC10aW1lIGFsdGVybmF0ZSBvbmx5IGluIHZlcmJvc2UgbW9kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTmFtZSA9ICdjaGF0LWZvb3Rlci1kZXRhaWxzJztcblx0XHRcdGNvbnN0IGNvbXBsZXRlZEF0ID0gRGF0ZS5ub3coKSAtIDYwICogNjAgKiAxMDAwO1xuXG5cdFx0XHRyZW5kZXJDaGF0UmVzcG9uc2VEZXRhaWxzKGNvbnRhaW5lciwgJ0NsYXVkZSBPcHVzIDQuOCcsIGNvbXBsZXRlZEF0LCAyNF8wMDAsIGZhbHNlKTtcblx0XHRcdGNvbnN0IGNvbXBhY3QgPSB7XG5cdFx0XHRcdHRleHQ6IGNvbnRhaW5lci50ZXh0Q29udGVudCxcblx0XHRcdFx0dGltaW5nOiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcmVzcG9uc2UtdGltaW5nJyksXG5cdFx0XHRcdHRhYkluZGV4OiBjb250YWluZXIudGFiSW5kZXgsXG5cdFx0XHR9O1xuXG5cdFx0XHRyZW5kZXJDaGF0UmVzcG9uc2VEZXRhaWxzKGNvbnRhaW5lciwgJ0NsYXVkZSBPcHVzIDQuOCcsIGNvbXBsZXRlZEF0LCAyNF8wMDAsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvbXBhY3QsXG5cdFx0XHRcdGNvbXBsZXRpb25EYXRlVGltZTogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ3RpbWUnKT8uZGF0ZVRpbWUsXG5cdFx0XHRcdGhhc0FsdGVybmF0ZTogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXJlc3BvbnNlLXRpbWluZycpPy5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1hbHRlcm5hdGUnKSxcblx0XHRcdFx0ZHVyYXRpb246IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yZXNwb25zZS1hbHRlcm5hdGUnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGRldGFpbHM6IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yZXNwb25zZS1tb2RlbC1kZXRhaWxzJyk/LnRleHRDb250ZW50LFxuXHRcdFx0XHRzZXBhcmF0b3JIaWRkZW46IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yZXNwb25zZS1kZXRhaWxzLXNlcGFyYXRvcicpPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJyksXG5cdFx0XHRcdGFyaWFJbmNsdWRlc0VsYXBzZWQ6IGNvbnRhaW5lci5hcmlhTGFiZWw/LmluY2x1ZGVzKCcyNHMnKSA/PyBmYWxzZSxcblx0XHRcdFx0dGFiSW5kZXg6IGNvbnRhaW5lci50YWJJbmRleCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29tcGFjdDoge1xuXHRcdFx0XHRcdHRleHQ6ICdDbGF1ZGUgT3B1cyA0LjgnLFxuXHRcdFx0XHRcdHRpbWluZzogbnVsbCxcblx0XHRcdFx0XHR0YWJJbmRleDogMCxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tcGxldGlvbkRhdGVUaW1lOiBuZXcgRGF0ZShjb21wbGV0ZWRBdCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0aGFzQWx0ZXJuYXRlOiB0cnVlLFxuXHRcdFx0XHRkdXJhdGlvbjogJzI0cycsXG5cdFx0XHRcdGRldGFpbHM6ICdDbGF1ZGUgT3B1cyA0LjgnLFxuXHRcdFx0XHRzZXBhcmF0b3JIaWRkZW46ICd0cnVlJyxcblx0XHRcdFx0YXJpYUluY2x1ZGVzRWxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0dGFiSW5kZXg6IDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0cmVuZGVyQ2hhdFJlc3BvbnNlRGV0YWlscyhjb250YWluZXIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAyNF8wMDAsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRleHQ6IGNvbnRhaW5lci50ZXh0Q29udGVudCxcblx0XHRcdFx0dGltaW5nOiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcmVzcG9uc2UtdGltaW5nJyksXG5cdFx0XHRcdGhpZGRlbjogY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGlkZGVuJyksXG5cdFx0XHRcdHRhYkluZGV4OiBjb250YWluZXIudGFiSW5kZXgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0XHR0aW1pbmc6IG51bGwsXG5cdFx0XHRcdGhpZGRlbjogdHJ1ZSxcblx0XHRcdFx0dGFiSW5kZXg6IC0xLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG9sZENvbXBsZXRpb24gPSBEYXRlLm5vdygpIC0gMjUgKiA2MCAqIDYwICogMTAwMDtcblx0XHRcdHJlbmRlckNoYXRSZXNwb25zZURldGFpbHMoY29udGFpbmVyLCB1bmRlZmluZWQsIG9sZENvbXBsZXRpb24sIDI0XzAwMCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29tcGFjdDogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXJlc3BvbnNlLWNvbXBsZXRlZC1hdCcpPy50ZXh0Q29udGVudCxcblx0XHRcdFx0YWx0ZXJuYXRlRW5kc1dpdGhFbGFwc2VkOiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcmVzcG9uc2UtYWx0ZXJuYXRlJyk/LnRleHRDb250ZW50Py5lbmRzV2l0aCgnIFxcdTIwMjIgMjRzJyksXG5cdFx0XHRcdGhhc0FsdGVybmF0ZTogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXJlc3BvbnNlLXRpbWluZycpPy5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1hbHRlcm5hdGUnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29tcGFjdDogJzEgZGF5Jyxcblx0XHRcdFx0YWx0ZXJuYXRlRW5kc1dpdGhFbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRoYXNBbHRlcm5hdGU6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1bW1hcml6ZXMgcGVyLW1vZGVsIHRva2VuIHVzYWdlIGZvciB0aGUgZm9vdGVyIHN0YXQgaG92ZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0cyA9IGZvcm1hdFJlc3BvbnNlVG9rZW5TdGF0cyhbXG5cdFx0XHRcdHsgbW9kZWw6ICdDbGF1ZGUgT3B1cyA0LjgnLCBpbnB1dFRva2VuczogMTJfNDAwLCBjYWNoZWRUb2tlbnM6IDlfMDAwLCBvdXRwdXRUb2tlbnM6IDgzMCB9LFxuXHRcdFx0XHR7IG1vZGVsOiAnZ3B0LTUuNScsIGlucHV0VG9rZW5zOiA0MCwgY2FjaGVkVG9rZW5zOiAwLCBvdXRwdXRUb2tlbnM6IDEyIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG1hcmtkb3duOiBzdGF0cz8ubWFya2Rvd24udmFsdWUsIGFyaWFMYWJlbDogc3RhdHM/LmFyaWFMYWJlbCB9LCB7XG5cdFx0XHRcdG1hcmtkb3duOiAnKipUb2tlbnMgdXNlZCB0aGlzIHR1cm4qKlxcblxcbkNsYXVkZSBPcHVzIDQuOCBcdTIwMTQgMTJLIGluLCA4MzAgb3V0LCA5SyBjYWNoZWRcXG5cXG5ncHQtNS41IFx1MjAxNCA0MCBpbiwgMTIgb3V0XFxuXFxuJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnVG9rZW5zIHVzZWQgdGhpcyB0dXJuLiBDbGF1ZGUgT3B1cyA0Ljg6IDEyNDAwIGlucHV0IHRva2VucywgODMwIG91dHB1dCB0b2tlbnMsIDkwMDAgY2FjaGVkIHRva2Vucy4gZ3B0LTUuNTogNDAgaW5wdXQgdG9rZW5zLCAxMiBvdXRwdXQgdG9rZW5zJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwb3J0cyBubyB0b2tlbiB1c2FnZSBzdW1tYXJ5IHdoZW4gdGhlIHByb3ZpZGVyIHJlcG9ydGVkIG5vbmUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0Zm9ybWF0UmVzcG9uc2VUb2tlblN0YXRzKHVuZGVmaW5lZCksXG5cdFx0XHRcdGZvcm1hdFJlc3BvbnNlVG9rZW5TdGF0cyhbXSksXG5cdFx0XHRdLCBbXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb2xkcyB0aGUgdG9rZW4gdXNhZ2Ugc3VtbWFyeSBpbnRvIHRoZSBmb290ZXIgYWNjZXNzaWJsZSBuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjb25zdCB3aXRoU3RhdHMgPSAnVG9rZW5zIHVzZWQgdGhpcyB0dXJuLiBncHQtNS41OiA0MCBpbnB1dCB0b2tlbnMsIDEyIG91dHB1dCB0b2tlbnMnO1xuXG5cdFx0XHRyZW5kZXJDaGF0UmVzcG9uc2VEZXRhaWxzKGNvbnRhaW5lciwgJ0dQVC01LjUgXHUyMDIyIDIgY3JlZGl0cycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSwgd2l0aFN0YXRzKTtcblx0XHRcdGNvbnN0IGluY2x1ZGVkID0gY29udGFpbmVyLmFyaWFMYWJlbDtcblxuXHRcdFx0cmVuZGVyQ2hhdFJlc3BvbnNlRGV0YWlscyhjb250YWluZXIsICdHUFQtNS41IFx1MjAyMiAyIGNyZWRpdHMnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGluY2x1ZGVkLCBvbWl0dGVkOiBjb250YWluZXIuYXJpYUxhYmVsIH0sIHtcblx0XHRcdFx0aW5jbHVkZWQ6IGBHUFQtNS41IFx1MjAyMiAyIGNyZWRpdHMsICR7d2l0aFN0YXRzfWAsXG5cdFx0XHRcdG9taXR0ZWQ6ICdHUFQtNS41IFx1MjAyMiAyIGNyZWRpdHMnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmb3JtYXRDaGF0UmVxdWVzdFRpbWVzdGFtcCcsICgpID0+IHtcblx0XHR0ZXN0KCdmb3JtYXRzIHZhbGlkIHBlcnNpc3RlZCB0aW1lc3RhbXBzIGFuZCByZWplY3RzIGxlZ2FjeSBwbGFjZWhvbGRlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0aW1lc3RhbXAgPSBEYXRlLlVUQygyMDI2LCA2LCA4LCAyMywgMTgsIDQxKTtcblx0XHRcdGNvbnN0IGZvcm1hdHRlZCA9IGZvcm1hdENoYXRSZXF1ZXN0VGltZXN0YW1wKHRpbWVzdGFtcCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aGFzVGV4dDogISFmb3JtYXR0ZWQ/LnRleHQsXG5cdFx0XHRcdGhhc0Z1bGxUZXh0OiAhIWZvcm1hdHRlZD8uZnVsbFRleHQsXG5cdFx0XHRcdGRhdGVUaW1lOiBmb3JtYXR0ZWQ/LmRhdGVUaW1lLFxuXHRcdFx0XHRpbnZhbGlkOiBmb3JtYXRDaGF0UmVxdWVzdFRpbWVzdGFtcCgtMSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGhhc1RleHQ6IHRydWUsXG5cdFx0XHRcdGhhc0Z1bGxUZXh0OiB0cnVlLFxuXHRcdFx0XHRkYXRlVGltZTogJzIwMjYtMDctMDhUMjM6MTg6NDEuMDAwWicsXG5cdFx0XHRcdGludmFsaWQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyByZWxhdGl2ZSBkYXlzIGFmdGVyIDI0IGhvdXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGZvcm1hdENoYXRSZXF1ZXN0VGltZXN0YW1wKERhdGUubm93KCkgLSAyNSAqIDYwICogNjAgKiAxMDAwKT8udGV4dCxcblx0XHRcdFx0Zm9ybWF0Q2hhdFJlcXVlc3RUaW1lc3RhbXAoRGF0ZS5ub3coKSAtIDQ5ICogNjAgKiA2MCAqIDEwMDApPy50ZXh0LFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQnMSBkYXknLFxuXHRcdFx0XHQnMiBkYXlzJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBjb21wYWN0IGRheXMgd2l0aCBhbiBhbmltYXRlZCBmdWxsIGRhdGUgYWx0ZXJuYXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjb25zdCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpIC0gMjUgKiA2MCAqIDYwICogMTAwMDtcblxuXHRcdFx0Y29uc3QgcmVuZGVyZWQgPSByZW5kZXJDaGF0UmVxdWVzdFRpbWVzdGFtcChjb250YWluZXIsIHRpbWVzdGFtcCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjb21wYWN0OiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcmVxdWVzdC1yZWxhdGl2ZScpPy50ZXh0Q29udGVudCxcblx0XHRcdFx0ZnVsbERhdGU6IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yZXF1ZXN0LWZ1bGwtZGF0ZScpPy50ZXh0Q29udGVudCxcblx0XHRcdFx0aGFzQWx0ZXJuYXRlOiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcmVxdWVzdC10aW1pbmcnKT8uY2xhc3NMaXN0LmNvbnRhaW5zKCdoYXMtYWx0ZXJuYXRlJyksXG5cdFx0XHRcdGZvY3VzYWJsZTogcmVuZGVyZWQ/LmVsZW1lbnQudGFiSW5kZXgsXG5cdFx0XHRcdG1hbmFnZWRIb3ZlclRleHQ6IHJlbmRlcmVkPy5ob3ZlclRleHQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvbXBhY3Q6ICcxIGRheScsXG5cdFx0XHRcdGZ1bGxEYXRlOiBmb3JtYXRDaGF0UmVxdWVzdFRpbWVzdGFtcCh0aW1lc3RhbXApPy5mdWxsVGV4dCxcblx0XHRcdFx0aGFzQWx0ZXJuYXRlOiB0cnVlLFxuXHRcdFx0XHRmb2N1c2FibGU6IDAsXG5cdFx0XHRcdG1hbmFnZWRIb3ZlclRleHQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwZW5kaW5nIGRpdmlkZXIgY2xlYXJzIGEgdGltZXN0YW1wIGZyb20gYSByZWN5Y2xlZCByZXF1ZXN0IHRlbXBsYXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5lZGl0UmVxdWVzdHMnLCAnaG92ZXInKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5jaGVja3BvaW50cy5lbmFibGVkJywgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmNoZWNrcG9pbnRzLnNob3dGaWxlQ2hhbmdlcycsIGZhbHNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5UdXJuU3RhdHVzUGlsbHMsIGZhbHNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWdlbnRTZXJ2aWNlKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsLCB1bmRlZmluZWQsIHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRWaWV3TW9kZWwsIG1vZGVsLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0ZXh0ID0gJ3Rlc3QnO1xuXHRcdG1vZGVsLmFkZFJlcXVlc3Qoe1xuXHRcdFx0dGV4dCxcblx0XHRcdHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIDEsIDEsIHRleHQubGVuZ3RoICsgMSksIHRleHQpXVxuXHRcdH0sIHsgdmFyaWFibGVzOiBbXSB9LCBEYXRlLm5vdygpKTtcblx0XHRjb25zdCByZXF1ZXN0Vmlld01vZGVsID0gdmlld01vZGVsLmdldEl0ZW1zKCkuZmluZChpc1JlcXVlc3RWTSk7XG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3RWaWV3TW9kZWwpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXHRcdGNvbnN0IHJlbmRlcmVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdExpc3RJdGVtUmVuZGVyZXIsXG5cdFx0XHR7fSBhcyBDaGF0RWRpdG9yT3B0aW9ucyxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRMaXN0TGVuZ3RoOiAoKSA9PiAxLFxuXHRcdFx0XHRvbkRpZFNjcm9sbDogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0Y3VycmVudENoYXRNb2RlOiAoKSA9PiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHR9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dmlld01vZGVsLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gcmVuZGVyZXIucmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHJlbmRlcmVyLmRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZSkpKTtcblx0XHRjb25zdCBub2RlID0gKGVsZW1lbnQ6IElDaGF0UGVuZGluZ0RpdmlkZXJWaWV3TW9kZWwgfCB0eXBlb2YgcmVxdWVzdFZpZXdNb2RlbCkgPT4gKHsgZWxlbWVudCwgY2hpbGRyZW46IFtdLCBkZXB0aDogMCwgdmlzaWJsZUNoaWxkcmVuQ291bnQ6IDAsIHZpc2libGVDaGlsZEluZGV4OiAwLCBjb2xsYXBzaWJsZTogZmFsc2UsIGNvbGxhcHNlZDogZmFsc2UsIHZpc2libGU6IHRydWUsIGZpbHRlckRhdGE6IHVuZGVmaW5lZCB9KTtcblxuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQobm9kZShyZXF1ZXN0Vmlld01vZGVsKSwgMCwgdGVtcGxhdGUpO1xuXHRcdGNvbnN0IGhhZFRpbWVzdGFtcCA9ICEhdGVtcGxhdGUucmVxdWVzdFRpbWVzdGFtcENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCd0aW1lJyk7XG5cdFx0cmVuZGVyZXIucmVuZGVyRWxlbWVudChub2RlKHtcblx0XHRcdGtpbmQ6ICdwZW5kaW5nRGl2aWRlcicsXG5cdFx0XHRpZDogJ3BlbmRpbmctZGl2aWRlci1zdGVlcmluZycsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IG1vZGVsLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRkaXZpZGVyS2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcsXG5cdFx0XHRjdXJyZW50UmVuZGVyZWRIZWlnaHQ6IHVuZGVmaW5lZCxcblx0XHR9KSwgMCwgdGVtcGxhdGUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYWRUaW1lc3RhbXAsXG5cdFx0XHRoYXNUaW1lc3RhbXA6ICEhdGVtcGxhdGUucmVxdWVzdFRpbWVzdGFtcENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCd0aW1lJyksXG5cdFx0XHRkaXZpZGVyTGFiZWw6IHRlbXBsYXRlLnZhbHVlLnRleHRDb250ZW50LFxuXHRcdH0sIHtcblx0XHRcdGhhZFRpbWVzdGFtcDogdHJ1ZSxcblx0XHRcdGhhc1RpbWVzdGFtcDogZmFsc2UsXG5cdFx0XHRkaXZpZGVyTGFiZWw6ICdTdGVlcmluZycsXG5cdFx0fSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubGluZSBlZGl0aW5nIGtlZXBzIGEgcG9wdWxhdGVkIHRpbWVzdGFtcCBhZnRlciB0aGUgZWRpdCBpbnB1dCB3aXRoIHZlcmJvc2UgdGltZXN0YW1wcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uVmVyYm9zZSwgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmVkaXRSZXF1ZXN0cycsICdob3ZlcicpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmNoZWNrcG9pbnRzLmVuYWJsZWQnLCBmYWxzZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuY2hlY2twb2ludHMuc2hvd0ZpbGVDaGFuZ2VzJywgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlR1cm5TdGF0dXNQaWxscywgZmFsc2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBZ2VudFNlcnZpY2UpKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFZpZXdNb2RlbCwgbW9kZWwsIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRleHQgPSAndGVzdCc7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3Qoe1xuXHRcdFx0dGV4dCxcblx0XHRcdHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIDEsIDEsIHRleHQubGVuZ3RoICsgMSksIHRleHQpXVxuXHRcdH0sIHsgdmFyaWFibGVzOiBbXSB9LCBEYXRlLm5vdygpKTtcblx0XHRjb25zdCByZXF1ZXN0Vmlld01vZGVsID0gdmlld01vZGVsLmdldEl0ZW1zKCkuZmluZChpc1JlcXVlc3RWTSk7XG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3RWaWV3TW9kZWwpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXHRcdGNvbnN0IHJlbmRlcmVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdExpc3RJdGVtUmVuZGVyZXIsXG5cdFx0XHR7fSBhcyBDaGF0RWRpdG9yT3B0aW9ucyxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRMaXN0TGVuZ3RoOiAoKSA9PiAxLFxuXHRcdFx0XHRvbkRpZFNjcm9sbDogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0Y3VycmVudENoYXRNb2RlOiAoKSA9PiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHR9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dmlld01vZGVsLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gcmVuZGVyZXIucmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHJlbmRlcmVyLmRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZSkpKTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KHsgZWxlbWVudDogcmVxdWVzdFZpZXdNb2RlbCwgY2hpbGRyZW46IFtdLCBkZXB0aDogMCwgdmlzaWJsZUNoaWxkcmVuQ291bnQ6IDAsIHZpc2libGVDaGlsZEluZGV4OiAwLCBjb2xsYXBzaWJsZTogZmFsc2UsIGNvbGxhcHNlZDogZmFsc2UsIHZpc2libGU6IHRydWUsIGZpbHRlckRhdGE6IHVuZGVmaW5lZCB9LCAwLCB0ZW1wbGF0ZSk7XG5cblx0XHRjb25zdCB3aWRnZXQgPSB7XG5cdFx0XHR2aWV3TW9kZWwsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHJlY2VudGx5UmVzdG9yZWRDaGVja3BvaW50OiBmYWxzZSxcblx0XHRcdGlucHV0UGFydDoge1xuXHRcdFx0XHRjdXJyZW50TW9kZU9iczogeyBnZXQ6ICgpID0+ICh7IGlkOiBDaGF0TW9kZUtpbmQuQWdlbnQgfSkgfSxcblx0XHRcdFx0Y3VycmVudE1vZGVJbmZvOiB7fSxcblx0XHRcdFx0c2V0RWRpdGluZzogKCkgPT4geyB9LFxuXHRcdFx0XHR0b2dnbGVDaGF0SW5wdXRPdmVybGF5OiAoKSA9PiB7IH0sXG5cdFx0XHRcdGRuZDogeyBzZXREaXNhYmxlZE92ZXJsYXk6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRvbkRpZENsaWNrT3ZlcmxheTogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHR9LFxuXHRcdFx0aW5wdXQ6IHtcblx0XHRcdFx0c2V0Q2hhdE1vZGU6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0UGVybWlzc2lvbkxldmVsOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldEVkaXRpbmc6ICgpID0+IHsgfSxcblx0XHRcdFx0cmVuZGVyQXR0YWNoZWRDb250ZXh0OiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldFZhbHVlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGF0dGFjaG1lbnRNb2RlbDogeyBhZGRDb250ZXh0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0aW5wdXRFZGl0b3I6IHtcblx0XHRcdFx0XHRnZXRNb2RlbDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGZvY3VzOiAoKSA9PiB7IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0aW5saW5lSW5wdXRQYXJ0OiB7XG5cdFx0XHRcdGlucHV0RWRpdG9yOiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VNb2RlbENvbnRlbnQ6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRsaXN0V2lkZ2V0OiB7XG5cdFx0XHRcdGFjcXVpcmVBdXRvU2Nyb2xsSG9sZDogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdHNjcm9sbFRvQ3VycmVudEl0ZW06ICgpID0+IHsgfSxcblx0XHRcdH0sXG5cdFx0XHRfZWRpdGluZ0F1dG9TY3JvbGxIb2xkOiBkaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpLFxuXHRcdFx0Y3JlYXRlSW5wdXQ6ICgpID0+IHsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlSXRlbXM6ICgpID0+IHsgfSxcblx0XHRcdGdldENvbnRyaWI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdF9vbkRpZENoYW5nZUFjdGl2ZUlucHV0RWRpdG9yOiB7IGZpcmU6ICgpID0+IHsgfSB9LFxuXHRcdFx0X3JlZ2lzdGVyOiA8VCBleHRlbmRzIHsgZGlzcG9zZSgpOiB2b2lkIH0+KGRpc3Bvc2FibGU6IFQpID0+IGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKSxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2U6IHsgcHVibGljTG9nMjogKCkgPT4geyB9IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENoYXRXaWRnZXQ7XG5cdFx0KENoYXRXaWRnZXQucHJvdG90eXBlIGFzIHVua25vd24gYXMgeyBjbGlja2VkUmVxdWVzdCh0aGlzOiBDaGF0V2lkZ2V0LCBpdGVtOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIH0pLmNsaWNrZWRSZXF1ZXN0LmNhbGwod2lkZ2V0LCB0ZW1wbGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRpbmdSZXF1ZXN0SWQ6IHZpZXdNb2RlbC5lZGl0aW5nPy5pZCxcblx0XHRcdHNob3dzVmVyYm9zZURldGFpbHM6IHRlbXBsYXRlLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ3Nob3ctdmVyYm9zZS1kZXRhaWxzJyksXG5cdFx0XHR0aW1lc3RhbXBQb3B1bGF0ZWQ6ICEhdGVtcGxhdGUucmVxdWVzdFRpbWVzdGFtcENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCd0aW1lJyksXG5cdFx0XHRwcmV2aW91c1NpYmxpbmdDbGFzczogdGVtcGxhdGUucmVxdWVzdFRpbWVzdGFtcENvbnRhaW5lci5wcmV2aW91c0VsZW1lbnRTaWJsaW5nPy5jbGFzc05hbWUsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdGluZ1JlcXVlc3RJZDogcmVxdWVzdC5pZCxcblx0XHRcdHNob3dzVmVyYm9zZURldGFpbHM6IGZhbHNlLFxuXHRcdFx0dGltZXN0YW1wUG9wdWxhdGVkOiB0cnVlLFxuXHRcdFx0cHJldmlvdXNTaWJsaW5nQ2xhc3M6ICdjaGF0LWVkaXQtaW5wdXQtY29udGFpbmVyJyxcblx0XHR9KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0c3VpdGUoJ3R1cm4gc3RhdHVzIHBpbGxzIHNldHRpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbm9ybWFsaXplcyBib29sZWFuIGFuZCBsZWdhY3kgb2JqZWN0IHZhbHVlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRpc0NoYXRUdXJuU3RhdHVzUGlsbHNFbmFibGVkKHVuZGVmaW5lZCksXG5cdFx0XHRcdGlzQ2hhdFR1cm5TdGF0dXNQaWxsc0VuYWJsZWQoZmFsc2UpLFxuXHRcdFx0XHRpc0NoYXRUdXJuU3RhdHVzUGlsbHNFbmFibGVkKHRydWUpLFxuXHRcdFx0XHRpc0NoYXRUdXJuU3RhdHVzUGlsbHNFbmFibGVkKHt9KSxcblx0XHRcdFx0aXNDaGF0VHVyblN0YXR1c1BpbGxzRW5hYmxlZCh7IGNoYW5nZXM6IGZhbHNlLCBwcmV2aWV3OiBmYWxzZSwgYnJvd3NlcjogZmFsc2UgfSksXG5cdFx0XHRcdGlzQ2hhdFR1cm5TdGF0dXNQaWxsc0VuYWJsZWQoeyBjaGFuZ2VzOiB0cnVlIH0pLFxuXHRcdFx0XHRpc0NoYXRUdXJuU3RhdHVzUGlsbHNFbmFibGVkKHsgcHJldmlldzogdHJ1ZSB9KSxcblx0XHRcdFx0aXNDaGF0VHVyblN0YXR1c1BpbGxzRW5hYmxlZCh7IGJyb3dzZXI6IHRydWUgfSksXG5cdFx0XHRdLCBbZmFsc2UsIGZhbHNlLCB0cnVlLCBmYWxzZSwgZmFsc2UsIHRydWUsIHRydWUsIHRydWVdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXB1dGVzIHBpbGwgYW5kIGxlZ2FjeSBmaWxlIHN1bW1hcmllcyBpbmRlcGVuZGVudGx5JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGZpbGVTdW1tYXJ5OiBzaG91bGRTaG93RmlsZUNoYW5nZXNTdW1tYXJ5Rm9yU2V0dGluZ3ModHJ1ZSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRcdGZpbGVTdW1tYXJ5SW5jb21wbGV0ZTogc2hvdWxkU2hvd0ZpbGVDaGFuZ2VzU3VtbWFyeUZvclNldHRpbmdzKGZhbHNlLCB0cnVlLCB0cnVlKSxcblx0XHRcdFx0ZmlsZVN1bW1hcnlOb25Mb2NhbDogc2hvdWxkU2hvd0ZpbGVDaGFuZ2VzU3VtbWFyeUZvclNldHRpbmdzKHRydWUsIGZhbHNlLCB0cnVlKSxcblx0XHRcdFx0ZmlsZVN1bW1hcnlEaXNhYmxlZDogc2hvdWxkU2hvd0ZpbGVDaGFuZ2VzU3VtbWFyeUZvclNldHRpbmdzKHRydWUsIHRydWUsIGZhbHNlKSxcblx0XHRcdFx0cGlsbHNTdW1tYXJ5OiBzaG91bGRTaG93UGlsbHNTdW1tYXJ5Rm9yU2V0dGluZ3ModHJ1ZSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRcdHBpbGxzU3VtbWFyeUxlZ2FjeTogc2hvdWxkU2hvd1BpbGxzU3VtbWFyeUZvclNldHRpbmdzKHRydWUsIHRydWUsIHsgcHJldmlldzogdHJ1ZSB9KSxcblx0XHRcdFx0cGlsbHNTdW1tYXJ5SW5jb21wbGV0ZTogc2hvdWxkU2hvd1BpbGxzU3VtbWFyeUZvclNldHRpbmdzKGZhbHNlLCB0cnVlLCB0cnVlKSxcblx0XHRcdFx0cGlsbHNTdW1tYXJ5Tm9uQWdlbnRIb3N0OiBzaG91bGRTaG93UGlsbHNTdW1tYXJ5Rm9yU2V0dGluZ3ModHJ1ZSwgZmFsc2UsIHRydWUpLFxuXHRcdFx0XHRwaWxsc1N1bW1hcnlEaXNhYmxlZDogc2hvdWxkU2hvd1BpbGxzU3VtbWFyeUZvclNldHRpbmdzKHRydWUsIHRydWUsIGZhbHNlKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZmlsZVN1bW1hcnk6IHRydWUsXG5cdFx0XHRcdGZpbGVTdW1tYXJ5SW5jb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdGZpbGVTdW1tYXJ5Tm9uTG9jYWw6IGZhbHNlLFxuXHRcdFx0XHRmaWxlU3VtbWFyeURpc2FibGVkOiBmYWxzZSxcblx0XHRcdFx0cGlsbHNTdW1tYXJ5OiB0cnVlLFxuXHRcdFx0XHRwaWxsc1N1bW1hcnlMZWdhY3k6IHRydWUsXG5cdFx0XHRcdHBpbGxzU3VtbWFyeUluY29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRwaWxsc1N1bW1hcnlOb25BZ2VudEhvc3Q6IGZhbHNlLFxuXHRcdFx0XHRwaWxsc1N1bW1hcnlEaXNhYmxlZDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Nob3VsZFBpblRvb2xJbnZvY2F0aW9uVG9UaGlua2luZycsICgpID0+IHtcblx0XHR0ZXN0KCdrZWVwcyB0b29sIGludm9jYXRpb25zIHJlcXVpcmluZyB1c2VyIGlucHV0IG9yIE1DUCBhcHBzIG91dHNpZGUgVGhpbmtpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZXhlY3V0aW9uQ29uZmlybWF0aW9uOiBzaG91bGRQaW5Ub29sSW52b2NhdGlvblRvVGhpbmtpbmcoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdFx0cmVzdWx0QXBwcm92YWw6IHNob3VsZFBpblRvb2xJbnZvY2F0aW9uVG9UaGlua2luZyhJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XHRhdXRoZW50aWNhdGlvbjogc2hvdWxkUGluVG9vbEludm9jYXRpb25Ub1RoaW5raW5nKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbiwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdFx0ZXhlY3V0aW5nV2l0aENvbmZpcm1hdGlvbjogc2hvdWxkUGluVG9vbEludm9jYXRpb25Ub1RoaW5raW5nKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZywgdHJ1ZSwgZmFsc2UpLFxuXHRcdFx0XHRleGVjdXRpbmdXaXRob3V0Q29uZmlybWF0aW9uOiBzaG91bGRQaW5Ub29sSW52b2NhdGlvblRvVGhpbmtpbmcoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XHRleGVjdXRpbmdXaXRoTWNwQXBwOiBzaG91bGRQaW5Ub29sSW52b2NhdGlvblRvVGhpbmtpbmcoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLCBmYWxzZSwgdHJ1ZSksXG5cdFx0XHRcdHN0cmVhbWluZ1dpdGhNY3BBcHA6IHNob3VsZFBpblRvb2xJbnZvY2F0aW9uVG9UaGlua2luZyhJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcsIGZhbHNlLCB0cnVlKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZXhlY3V0aW9uQ29uZmlybWF0aW9uOiBmYWxzZSxcblx0XHRcdFx0cmVzdWx0QXBwcm92YWw6IGZhbHNlLFxuXHRcdFx0XHRhdXRoZW50aWNhdGlvbjogZmFsc2UsXG5cdFx0XHRcdGV4ZWN1dGluZ1dpdGhDb25maXJtYXRpb246IGZhbHNlLFxuXHRcdFx0XHRleGVjdXRpbmdXaXRob3V0Q29uZmlybWF0aW9uOiB0cnVlLFxuXHRcdFx0XHRleGVjdXRpbmdXaXRoTWNwQXBwOiBmYWxzZSxcblx0XHRcdFx0c3RyZWFtaW5nV2l0aE1jcEFwcDogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ2VuZHNXaXRoQ29tcGxldGVkUXVlc3Rpb25JbnRlcmFjdGlvbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgncmVzdW1lcyB3b3JraW5nIHByb2dyZXNzIGFmdGVyIGNvbXBsZXRlZCBhc2sgaW50ZXJhY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbXBsZXRlZFRvb2w6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkID0ge1xuXHRcdFx0XHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAnYXNrLTEnLFxuXHRcdFx0XHRcdFx0dG9vbElkOiAnYXNrX3VzZXInLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXYWl0aW5nIGZvciBhbnN3ZXIuLi4nLFxuXHRcdFx0XHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGlzQ29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSxcblx0XHRcdFx0XHRcdHByZXNlbnRhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNvbnN0IGNvbXBsZXRlZFF1ZXN0aW9uOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwgPSB7XG5cdFx0XHRcdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsXG5cdFx0XHRcdFx0XHRxdWVzdGlvbnM6IFtdLFxuXHRcdFx0XHRcdFx0YWxsb3dTa2lwOiB0cnVlLFxuXHRcdFx0XHRcdFx0aXNVc2VkOiB0cnVlLFxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0XHRcdGVuZHNXaXRoQ29tcGxldGVkUXVlc3Rpb25JbnRlcmFjdGlvbihbY29tcGxldGVkVG9vbF0pLFxuXHRcdFx0XHRcdFx0ZW5kc1dpdGhDb21wbGV0ZWRRdWVzdGlvbkludGVyYWN0aW9uKFtjb21wbGV0ZWRUb29sLCBjb21wbGV0ZWRRdWVzdGlvbl0pLFxuXHRcdFx0XHRcdFx0ZW5kc1dpdGhDb21wbGV0ZWRRdWVzdGlvbkludGVyYWN0aW9uKFt7IC4uLmNvbXBsZXRlZFF1ZXN0aW9uLCBpc1VzZWQ6IGZhbHNlIH1dKSxcblx0XHRcdFx0XHRcdGVuZHNXaXRoQ29tcGxldGVkUXVlc3Rpb25JbnRlcmFjdGlvbihbeyAuLi5jb21wbGV0ZWRUb29sLCB0b29sSWQ6ICdyZWFkX2ZpbGUnIH1dKSxcblx0XHRcdFx0XHRdLCBbdHJ1ZSwgdHJ1ZSwgZmFsc2UsIGZhbHNlXSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaG91bGRIaWRlQ2hhdFVzZXJJZGVudGl0eScsICgpID0+IHtcblx0XHR0ZXN0KCdoaWRlcyBsb2NhbCBDb3BpbG90IGFuZCBBZ2VudCBIb3N0IENvcGlsb3QgcmVzcG9uc2UgaWRlbnRpdHknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0c2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHkoJ0dpdEh1YiBDb3BpbG90JywgVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtY2hhdC1lZGl0b3InIH0pLCB0cnVlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XHRzaG91bGRIaWRlQ2hhdFVzZXJJZGVudGl0eSgnQ29waWxvdCcsIFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyB9KSwgdHJ1ZSwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHkoJ0NvcGlsb3QnLCBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScgfSksIGZhbHNlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XHRzaG91bGRIaWRlQ2hhdFVzZXJJZGVudGl0eSgnQ29waWxvdCcsIFVSSS5mcm9tKHsgc2NoZW1lOiAncmVtb3RlLXRlc3QtYXV0aG9yaXR5LWNvcGlsb3RjbGknIH0pLCB0cnVlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XHRzaG91bGRIaWRlQ2hhdFVzZXJJZGVudGl0eSgnQ29waWxvdCcsIFVSSS5mcm9tKHsgc2NoZW1lOiAncmVtb3RlLXRlc3QtYXV0aG9yaXR5LWNvcGlsb3RjbGknIH0pLCBmYWxzZSwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHkoJ0NsYXVkZScsIFVSSS5mcm9tKHsgc2NoZW1lOiAncmVtb3RlLXRlc3QtYXV0aG9yaXR5LWNsYXVkZScgfSksIHRydWUsIGZhbHNlLCBmYWxzZSksXG5cdFx0XHRcdHNob3VsZEhpZGVDaGF0VXNlcklkZW50aXR5KCdDbGF1ZGUnLCBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY2xhdWRlJyB9KSwgdHJ1ZSwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHkoJ0NsYXVkZScsIFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jbGF1ZGUnIH0pLCB0cnVlLCB0cnVlLCBmYWxzZSksXG5cdFx0XHRcdHNob3VsZEhpZGVDaGF0VXNlcklkZW50aXR5KCdVc2VyJywgVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtY2hhdC1lZGl0b3InIH0pLCBmYWxzZSwgZmFsc2UsIHRydWUpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRQbGFuUmV2aWV3UHJvZ3Jlc3NDb250ZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ2tlZXBzIHBsYW4gc3VtbWFyeSBhbmQgZnVsbCBwbGFuIGxpbmsgYWZ0ZXIgYXBwcm92YWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYnVpbGRQbGFuUmV2aWV3UHJvZ3Jlc3NDb250ZW50KHtcblx0XHRcdFx0a2luZDogJ3BsYW5SZXZpZXcnLFxuXHRcdFx0XHR0aXRsZTogJ1JldmlldyBQbGFuJyxcblx0XHRcdFx0Y29udGVudDogJyMjIFBsYW4gc3VtbWFyeScsXG5cdFx0XHRcdGFjdGlvbnM6IFt7IGlkOiAnaW50ZXJhY3RpdmUnLCBsYWJlbDogJ0ltcGxlbWVudCBQbGFuJyB9XSxcblx0XHRcdFx0Y2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlLFxuXHRcdFx0XHRwbGFuVXJpOiBVUkkuZmlsZSgnL3Nlc3Npb25zL2FiYy9wbGFuLm1kJykudG9KU09OKCksXG5cdFx0XHRcdGlzVXNlZDogdHJ1ZSxcblx0XHRcdFx0ZGF0YTogeyByZWplY3RlZDogZmFsc2UsIGFjdGlvbjogJ0ltcGxlbWVudCBQbGFuJywgYWN0aW9uSWQ6ICdpbnRlcmFjdGl2ZScgfSxcblx0XHRcdH0sICdBcHByb3ZlZCBwbGFuJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLCAnQXBwcm92ZWQmbmJzcDtwbGFuXFxuXFxuIyMgUGxhbiBzdW1tYXJ5XFxuXFxuW09wZW4gZnVsbCBwbGFuIGZpbGUgKHBsYW4ubWQpXShmaWxlOi8vL3Nlc3Npb25zL2FiYy9wbGFuLm1kP3ZzY29kZUxpbmtUeXBlPWZpbGUpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIHN0cnVjdHVyZWQgZmVlZGJhY2sgYXMgbWFya2Rvd24gYmVmb3JlIHRoZSBwbGFuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGJ1aWxkUGxhblJldmlld1Byb2dyZXNzQ29udGVudCh7XG5cdFx0XHRcdGtpbmQ6ICdwbGFuUmV2aWV3Jyxcblx0XHRcdFx0dGl0bGU6ICdSZXZpZXcgUGxhbicsXG5cdFx0XHRcdGNvbnRlbnQ6ICcjIyBQbGFuIHN1bW1hcnknLFxuXHRcdFx0XHRhY3Rpb25zOiBbeyBpZDogJ2ludGVyYWN0aXZlJywgbGFiZWw6ICdJbXBsZW1lbnQgUGxhbicgfV0sXG5cdFx0XHRcdGNhblByb3ZpZGVGZWVkYmFjazogdHJ1ZSxcblx0XHRcdFx0cGxhblVyaTogVVJJLmZpbGUoJy9zZXNzaW9ucy9hYmMvcGxhbi5tZCcpLnRvSlNPTigpLFxuXHRcdFx0XHRpc1VzZWQ6IHRydWUsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZmVlZGJhY2s6ICdVc2UgKipuYW1lZCBoZWxwZXJzKiouXFxuXFxuSW5saW5lIGNvbW1lbnRzIG9uIGBwbGFuLm1kYDpcXG4tICoqTGluZSA2OioqIEV4dHJhY3QgdGhpcycsXG5cdFx0XHRcdFx0ZmVlZGJhY2tPdmVyYWxsOiAnVXNlICoqbmFtZWQgaGVscGVycyoqLicsXG5cdFx0XHRcdFx0ZmVlZGJhY2tJbmxpbmVNYXJrZG93bjogJ0lubGluZSBjb21tZW50cyBvbiBgcGxhbi5tZGA6XFxuLSAqKkxpbmUgNjoqKiBFeHRyYWN0IHRoaXMnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgJ1Byb3ZpZGVkIGZlZWRiYWNrJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLCBbXG5cdFx0XHRcdCdQcm92aWRlZCZuYnNwO2ZlZWRiYWNrJyxcblx0XHRcdFx0J1VzZSAqKm5hbWVkIGhlbHBlcnMqKi4nLFxuXHRcdFx0XHQnSW5saW5lIGNvbW1lbnRzIG9uIGBwbGFuLm1kYDpcXG4tICoqTGluZSA2OioqIEV4dHJhY3QgdGhpcycsXG5cdFx0XHRcdCcjIyBQbGFuIHN1bW1hcnknLFxuXHRcdFx0XHQnW09wZW4gZnVsbCBwbGFuIGZpbGUgKHBsYW4ubWQpXShmaWxlOi8vL3Nlc3Npb25zL2FiYy9wbGFuLm1kP3ZzY29kZUxpbmtUeXBlPWZpbGUpJyxcblx0XHRcdF0uam9pbignXFxuXFxuJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBjb21iaW5lZCBsZWdhY3kgZmVlZGJhY2sgYXMgbWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYnVpbGRQbGFuUmV2aWV3UHJvZ3Jlc3NDb250ZW50KHtcblx0XHRcdFx0a2luZDogJ3BsYW5SZXZpZXcnLFxuXHRcdFx0XHR0aXRsZTogJ1JldmlldyBQbGFuJyxcblx0XHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRcdGFjdGlvbnM6IFt7IGlkOiAnaW50ZXJhY3RpdmUnLCBsYWJlbDogJ0ltcGxlbWVudCBQbGFuJyB9XSxcblx0XHRcdFx0Y2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlLFxuXHRcdFx0XHRpc1VzZWQ6IHRydWUsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZmVlZGJhY2s6ICdPdmVyYWxsICoqY29tbWVudCoqXFxuXFxuSW5saW5lIGNvbW1lbnRzOlxcbi0gKipMaW5lIDc6KiogUmVuYW1lIHRoaXMnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgJ1Byb3ZpZGVkIGZlZWRiYWNrJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLCBbXG5cdFx0XHRcdCdQcm92aWRlZCZuYnNwO2ZlZWRiYWNrJyxcblx0XHRcdFx0J092ZXJhbGwgKipjb21tZW50KionLFxuXHRcdFx0XHQnSW5saW5lIGNvbW1lbnRzOlxcbi0gKipMaW5lIDc6KiogUmVuYW1lIHRoaXMnLFxuXHRcdFx0XS5qb2luKCdcXG5cXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmtpbmcgcHJvZ3Jlc3MgaWdub3JlcyBzdWJhZ2VudC1vd25lZCByZXNwb25zZSBwYXJ0cycsICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnRTdWJhZ2VudDogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgPSB7XG5cdFx0XHRraW5kOiAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICdzdWJhZ2VudC0xJyxcblx0XHRcdHRvb2xJZDogJ3Rhc2snLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBzdWJhZ2VudCcsXG5cdFx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRpc0NvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7IGtpbmQ6ICdzdWJhZ2VudCcsIGRlc2NyaXB0aW9uOiAnSW52ZXN0aWdhdGUnLCBpc0FjdGl2ZTogdHJ1ZSB9LFxuXHRcdH07XG5cdFx0Y29uc3QgY2hpbGRUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCA9IHtcblx0XHRcdC4uLnBhcmVudFN1YmFnZW50LFxuXHRcdFx0dG9vbENhbGxJZDogJ2NoaWxkLTEnLFxuXHRcdFx0dG9vbElkOiAnc2VhcmNoJyxcblx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiAnc3ViYWdlbnQtMScsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRjb25zdCBzZWNvbmRQYXJlbnRTdWJhZ2VudDogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgPSB7XG5cdFx0XHQuLi5wYXJlbnRTdWJhZ2VudCxcblx0XHRcdHRvb2xDYWxsSWQ6ICdzdWJhZ2VudC0yJyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHsga2luZDogJ3N1YmFnZW50JywgZGVzY3JpcHRpb246ICdSZXZpZXcgdGVzdHMnLCBpc0FjdGl2ZTogdHJ1ZSB9LFxuXHRcdH07XG5cdFx0Y29uc3Qgc2Vjb25kQ2hpbGRUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCA9IHtcblx0XHRcdC4uLmNoaWxkVG9vbCxcblx0XHRcdHRvb2xDYWxsSWQ6ICdjaGlsZC0yJyxcblx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiAnc3ViYWdlbnQtMicsXG5cdFx0fTtcblx0XHRjb25zdCBwYXJ0czogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSA9IFtcblx0XHRcdHsga2luZDogJ3JlZmVyZW5jZXMnLCByZWZlcmVuY2VzOiBbXSB9LFxuXHRcdFx0cGFyZW50U3ViYWdlbnQsXG5cdFx0XHRjaGlsZFRvb2wsXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiB7IHZhbHVlOiAnPHZzY29kZV9jb2RlYmxvY2tfdXJpIHN1YkFnZW50SW52b2NhdGlvbklkPVwic3ViYWdlbnQtMVwiPmZpbGU6Ly8vdGVzdC50eHQ8L3ZzY29kZV9jb2RlYmxvY2tfdXJpPicgfSB9LFxuXHRcdFx0eyBraW5kOiAnaG9vaycsIGhvb2tUeXBlOiAnUHJlVG9vbFVzZScsIHN1YkFnZW50SW52b2NhdGlvbklkOiAnc3ViYWdlbnQtMScgfSxcblx0XHRdO1xuXHRcdGNvbnN0IHBhcmFsbGVsU3ViYWdlbnRQYXJ0czogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSA9IFtcblx0XHRcdHsga2luZDogJ3JlZmVyZW5jZXMnLCByZWZlcmVuY2VzOiBbXSB9LFxuXHRcdFx0cGFyZW50U3ViYWdlbnQsXG5cdFx0XHRjaGlsZFRvb2wsXG5cdFx0XHRzZWNvbmRQYXJlbnRTdWJhZ2VudCxcblx0XHRcdHNlY29uZENoaWxkVG9vbCxcblx0XHRdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZWxldmFudFBhcnRzOiBnZXRXb3JraW5nUHJvZ3Jlc3NSZWxldmFudFBhcnRzKHBhcnRzKS5tYXAocGFydCA9PiBwYXJ0LmtpbmQpLFxuXHRcdFx0ZW5kc1dpdGhUYWdnZWRNYXJrZG93bjogZW5kc1dpdGhBY3RpdmVTdWJhZ2VudENvbnRlbnQocGFydHMuc2xpY2UoMCwgNCkpLFxuXHRcdFx0ZW5kc1dpdGhTdWJhZ2VudEhvb2s6IGVuZHNXaXRoQWN0aXZlU3ViYWdlbnRDb250ZW50KHBhcnRzKSxcblx0XHRcdGVuZHNXaXRoU3ViYWdlbnRDaGlsZFRvb2w6IGVuZHNXaXRoQWN0aXZlU3ViYWdlbnRDb250ZW50KHBhcnRzLnNsaWNlKDAsIDMpKSxcblx0XHRcdGVuZHNXaXRoUGFyZW50U3ViYWdlbnRUb29sOiBlbmRzV2l0aEFjdGl2ZVN1YmFnZW50Q29udGVudChwYXJ0cy5zbGljZSgwLCAyKSksXG5cdFx0XHRlbmRzV2l0aFBhcmFsbGVsU3ViYWdlbnRzOiBlbmRzV2l0aEFjdGl2ZVN1YmFnZW50Q29udGVudChwYXJhbGxlbFN1YmFnZW50UGFydHMpLFxuXHRcdFx0ZW5kc1dpdGhQYXJlbnRNYXJrZG93bkJlZm9yZU5lc3RlZFVwZGF0ZXM6IGVuZHNXaXRoQWN0aXZlU3ViYWdlbnRDb250ZW50KFtcblx0XHRcdFx0Li4ucGFyYWxsZWxTdWJhZ2VudFBhcnRzLFxuXHRcdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiB7IHZhbHVlOiAnV2FpdGluZyBvbiB0aGUgcmVtYWluaW5nIHJldmlld2Vycy4nIH0gfSxcblx0XHRcdFx0eyAuLi5jaGlsZFRvb2wsIHRvb2xDYWxsSWQ6ICdjaGlsZC0zJyB9LFxuXHRcdFx0XHR7IGtpbmQ6ICdob29rJywgaG9va1R5cGU6ICdQb3N0VG9vbFVzZScsIHN1YkFnZW50SW52b2NhdGlvbklkOiAnc3ViYWdlbnQtMicgfSxcblx0XHRcdF0pLFxuXHRcdH0sIHtcblx0XHRcdHJlbGV2YW50UGFydHM6IFsncmVmZXJlbmNlcyddLFxuXHRcdFx0ZW5kc1dpdGhUYWdnZWRNYXJrZG93bjogdHJ1ZSxcblx0XHRcdGVuZHNXaXRoU3ViYWdlbnRIb29rOiB0cnVlLFxuXHRcdFx0ZW5kc1dpdGhTdWJhZ2VudENoaWxkVG9vbDogdHJ1ZSxcblx0XHRcdGVuZHNXaXRoUGFyZW50U3ViYWdlbnRUb29sOiB0cnVlLFxuXHRcdFx0ZW5kc1dpdGhQYXJhbGxlbFN1YmFnZW50czogdHJ1ZSxcblx0XHRcdGVuZHNXaXRoUGFyZW50TWFya2Rvd25CZWZvcmVOZXN0ZWRVcGRhdGVzOiBmYWxzZSxcblx0XHR9KTtcblxuXHRcdHBhcmVudFN1YmFnZW50LnRvb2xTcGVjaWZpY0RhdGEgPSB7IGtpbmQ6ICdzdWJhZ2VudCcsIGRlc2NyaXB0aW9uOiAnSW52ZXN0aWdhdGUnLCBpc0FjdGl2ZTogZmFsc2UgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kc1dpdGhBY3RpdmVTdWJhZ2VudENvbnRlbnQocGFydHMpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmtpbmcgcHJvZ3Jlc3MgaXMgaGlkZGVuIHdoaWxlIE1DUCBzZXJ2ZXJzIGFyZSBzdGFydGluZycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXJzID0gb2JzZXJ2YWJsZVZhbHVlKCdzZXJ2ZXJzJywgW3sgaWQ6ICdhJywgbmFtZTogJ2FscGhhJyB9XSk7XG5cdFx0Y29uc3QgcGFydDogSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdTbG93ID0ge1xuXHRcdFx0a2luZDogJ21jcFNlcnZlcnNTdGFydGluZ1Nsb3cnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbjEnKSxcblx0XHRcdHNlcnZlcnMsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHdoaWxlU3RhcnRpbmcgPSBpc1dhaXRpbmdGb3JNY3BTZXJ2ZXJzKFtwYXJ0XSk7XG5cdFx0c2VydmVycy5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgYWZ0ZXJTdGFydGluZyA9IGlzV2FpdGluZ0Zvck1jcFNlcnZlcnMoW3BhcnRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyB3aGlsZVN0YXJ0aW5nLCBhZnRlclN0YXJ0aW5nIH0sIHsgd2hpbGVTdGFydGluZzogdHJ1ZSwgYWZ0ZXJTdGFydGluZzogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmFsIG1hcmtkb3duIHJlbWFpbnMgbW91bnRlZCBhZnRlciB0aGlua2luZyBhbmQgdG9vbCBwcm9ncmVzcyBjb21wbGV0ZXMgd2l0aCByZWR1Y2VkIG1vdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmcsIGZhbHNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5UaGlua2luZ1N0eWxlLCBUaGlua2luZ0Rpc3BsYXlNb2RlLkZpeGVkU2Nyb2xsaW5nKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5hZ2VudC50aGlua2luZy5jb2xsYXBzZWRUb29scycsIENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUuQWx3YXlzKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5jaGVja3BvaW50cy5lbmFibGVkJywgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmNoZWNrcG9pbnRzLnNob3dGaWxlQ2hhbmdlcycsIGZhbHNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5UdXJuU3RhdHVzUGlsbHMsIGZhbHNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5WZXJib3NlLCBmYWxzZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5yZWR1Y2VNb3Rpb24nLCAnb24nKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWdlbnRTZXJ2aWNlKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsLCB1bmRlZmluZWQsIHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRWaWV3TW9kZWwsIG1vZGVsLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0ZXh0ID0gJ3Rlc3QnO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHtcblx0XHRcdHRleHQsXG5cdFx0XHRwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCAxLCAxLCB0ZXh0Lmxlbmd0aCArIDEpLCB0ZXh0KV1cblx0XHR9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSB2aWV3TW9kZWwuZ2V0SXRlbXMoKS5maW5kKGlzUmVzcG9uc2VWTSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250YWluZXIucmVtb3ZlKCkpKTtcblx0XHRjb25zdCByZW5kZXJlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRMaXN0SXRlbVJlbmRlcmVyLFxuXHRcdFx0e30gYXMgQ2hhdEVkaXRvck9wdGlvbnMsXG5cdFx0XHR7IHByb2dyZXNzTWVzc2FnZUF0Qm90dG9tT2ZSZXNwb25zZTogdHJ1ZSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRMaXN0TGVuZ3RoOiAoKSA9PiAxLFxuXHRcdFx0XHRvbkRpZFNjcm9sbDogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0Y3VycmVudENoYXRNb2RlOiAoKSA9PiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHR9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dmlld01vZGVsLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gcmVuZGVyZXIucmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHJlbmRlcmVyLmRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZSkpKTtcblx0XHRjb25zdCBub2RlID0geyBlbGVtZW50OiByZXNwb25zZSwgY2hpbGRyZW46IFtdLCBkZXB0aDogMCwgdmlzaWJsZUNoaWxkcmVuQ291bnQ6IDAsIHZpc2libGVDaGlsZEluZGV4OiAwLCBjb2xsYXBzaWJsZTogZmFsc2UsIGNvbGxhcHNlZDogZmFsc2UsIHZpc2libGU6IHRydWUsIGZpbHRlckRhdGE6IHVuZGVmaW5lZCB9O1xuXG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd0aGlua2luZycsIHZhbHVlOiAnVGhpbmtpbmcgLi4uJywgaWQ6ICd0aGlua2luZy0xJyB9KTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblxuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gbmV3IENoYXRUb29sSW52b2NhdGlvbih7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgdG9vbC4uLicsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnVG9vbCBjb21wbGV0ZWQnLFxuXHRcdH0sIHtcblx0XHRcdGlkOiAnbXktdG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ015IFRvb2wnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgdG9vbCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH0sICdjYWxsLTEnLCB1bmRlZmluZWQsIHt9LCB7fSwgcmVxdWVzdC5pZCk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB0b29sSW52b2NhdGlvbik7XG5cdFx0cmVuZGVyZXIucmVuZGVyRWxlbWVudChub2RlLCAwLCB0ZW1wbGF0ZSk7XG5cblx0XHRhd2FpdCB0b29sSW52b2NhdGlvbi5kaWRFeGVjdXRlVG9vbCh1bmRlZmluZWQpO1xuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQobm9kZSwgMCwgdGVtcGxhdGUpO1xuXG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0ZpbmFsIHJlc3BvbnNlJykgfSk7XG5cdFx0cmVuZGVyZXIucmVuZGVyRWxlbWVudChub2RlLCAwLCB0ZW1wbGF0ZSk7XG5cdFx0Y29uc3QgbW91bnRlZFdoaWxlU3RyZWFtaW5nID0gdGVtcGxhdGUudmFsdWUudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdGaW5hbCByZXNwb25zZScpID8/IGZhbHNlO1xuXG5cdFx0cmVxdWVzdC5yZXNwb25zZT8uY29tcGxldGUoKTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1vdW50ZWRXaGlsZVN0cmVhbWluZyxcblx0XHRcdG1vdW50ZWRBZnRlckNvbXBsZXRpb246IHRlbXBsYXRlLnZhbHVlLnRleHRDb250ZW50Py5pbmNsdWRlcygnRmluYWwgcmVzcG9uc2UnKSA/PyBmYWxzZSxcblx0XHR9LCB7XG5cdFx0XHRtb3VudGVkV2hpbGVTdHJlYW1pbmc6IHRydWUsXG5cdFx0XHRtb3VudGVkQWZ0ZXJDb21wbGV0aW9uOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZW5lcmF0ZWQgaW1hZ2UgY29tcGxldGlvbiBkb2VzIG5vdCBsZWF2ZSBhIGNvbXBhY3QgZHVwbGljYXRlIGluc2lkZSB0aGlua2luZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmcsIHRydWUpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzJywgQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5BbHdheXMpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkNvbGxhcHNlQ29tcGxldGVkUmVzcG9uc2VzLCB0cnVlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5jaGVja3BvaW50cy5lbmFibGVkJywgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmNoZWNrcG9pbnRzLnNob3dGaWxlQ2hhbmdlcycsIGZhbHNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5UdXJuU3RhdHVzUGlsbHMsIGZhbHNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5WZXJib3NlLCBmYWxzZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IE1vY2tDaGF0U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50U2VydmljZSkpKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Vmlld01vZGVsLCBtb2RlbCwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdGV4dCA9ICdnZW5lcmF0ZSBhbiBpbWFnZSc7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3Qoe1xuXHRcdFx0dGV4dCxcblx0XHRcdHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIDEsIDEsIHRleHQubGVuZ3RoICsgMSksIHRleHQpXVxuXHRcdH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHZpZXdNb2RlbC5nZXRJdGVtcygpLmZpbmQoaXNSZXNwb25zZVZNKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2UpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXHRcdGNvbnN0IHJlbmRlcmVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdExpc3RJdGVtUmVuZGVyZXIsXG5cdFx0XHR7fSBhcyBDaGF0RWRpdG9yT3B0aW9ucyxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRMaXN0TGVuZ3RoOiAoKSA9PiAxLFxuXHRcdFx0XHRvbkRpZFNjcm9sbDogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0Y3VycmVudENoYXRNb2RlOiAoKSA9PiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHR9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dmlld01vZGVsLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gcmVuZGVyZXIucmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHJlbmRlcmVyLmRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZSkpKTtcblx0XHRjb25zdCBub2RlID0geyBlbGVtZW50OiByZXNwb25zZSwgY2hpbGRyZW46IFtdLCBkZXB0aDogMCwgdmlzaWJsZUNoaWxkcmVuQ291bnQ6IDAsIHZpc2libGVDaGlsZEluZGV4OiAwLCBjb2xsYXBzaWJsZTogZmFsc2UsIGNvbGxhcHNlZDogZmFsc2UsIHZpc2libGU6IHRydWUsIGZpbHRlckRhdGE6IHVuZGVmaW5lZCB9O1xuXG5cdFx0Y29uc3QgY3JlYXRlSW1hZ2VUb29sID0gKHRvb2xDYWxsSWQ6IHN0cmluZykgPT4gbmV3IENoYXRUb29sSW52b2NhdGlvbih7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0dlbmVyYXRpbmcgaW1hZ2UnLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0dlbmVyYXRlZCBpbWFnZScsXG5cdFx0fSwge1xuXHRcdFx0aWQ6ICdpbWFnZV9nZW4uaW1hZ2VnZW4nLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdHZW5lcmF0ZSBpbWFnZScsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnR2VuZXJhdGUgaW1hZ2UnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9LCB0b29sQ2FsbElkLCB1bmRlZmluZWQsIHt9LCB7fSwgcmVxdWVzdC5pZCk7XG5cdFx0Y29uc3QgaW1hZ2VUb29scyA9IFtjcmVhdGVJbWFnZVRvb2woJ2ltYWdlLWNhbGwtMScpLCBjcmVhdGVJbWFnZVRvb2woJ2ltYWdlLWNhbGwtMicpXTtcblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsga2luZDogJ3RoaW5raW5nJywgdmFsdWU6ICdSZXZpZXdpbmcgdGhlIGltYWdlIHNraWxsJywgaWQ6ICd0aGlua2luZy0xJyB9KTtcblx0XHRjb25zdCBzaGVsbFRvb2wgPSBuZXcgQ2hhdFRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBpbWFnZSBza2lsbCcsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmVhZCBpbWFnZSBza2lsbCcsXG5cdFx0fSwge1xuXHRcdFx0aWQ6ICdzaGVsbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBzaGVsbCBjb21tYW5kJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdSdW4gc2hlbGwgY29tbWFuZCcsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH0sICdzaGVsbC1jYWxsJywgdW5kZWZpbmVkLCB7fSwge30sIHJlcXVlc3QuaWQpO1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgc2hlbGxUb29sKTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblx0XHRhd2FpdCBzaGVsbFRvb2wuZGlkRXhlY3V0ZVRvb2woeyBjb250ZW50OiBbXSB9KTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnSSB3aWxsIGNyZWF0ZSB0d28gdmFyaWF0aW9ucy4nKSB9KTtcblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsga2luZDogJ3RoaW5raW5nJywgdmFsdWU6ICdQbGFubmluZyBpbWFnZSB2YXJpYXRpb25zJywgaWQ6ICd0aGlua2luZy0yJyB9KTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblxuXHRcdGZvciAoY29uc3QgW2luZGV4LCBpbWFnZVRvb2xdIG9mIGltYWdlVG9vbHMuZW50cmllcygpKSB7XG5cdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIGltYWdlVG9vbCk7XG5cdFx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblx0XHRcdGF3YWl0IGltYWdlVG9vbC5kaWRFeGVjdXRlVG9vbCh7XG5cdFx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7IGtpbmQ6ICdnZW5lcmF0ZWRJbWFnZScgfSxcblx0XHRcdFx0dG9vbFJlc3VsdERldGFpbHM6IHtcblx0XHRcdFx0XHRpbnB1dDogJ3tcInByb21wdFwiOlwiRHJhdyBhIGZveFwifScsXG5cdFx0XHRcdFx0b3V0cHV0OiBbeyB0eXBlOiAnZW1iZWQnLCB2YWx1ZTogYGFXMWhaMlUke2luZGV4fWAsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyB9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0cmVuZGVyZXIucmVuZGVyRWxlbWVudChub2RlLCAwLCB0ZW1wbGF0ZSk7XG5cdFx0XHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd0aGlua2luZycsIHZhbHVlOiAnUGxhbm5pbmcgdGhlIHNlY29uZCB2YXJpYXRpb24nLCBpZDogJ3RoaW5raW5nLTMnIH0pO1xuXHRcdFx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1xcblxcbicpIH0pO1xuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQobm9kZSwgMCwgdGVtcGxhdGUpO1xuXHRcdHJlcXVlc3QucmVzcG9uc2U/LmNvbXBsZXRlKCk7XG5cdFx0cmVuZGVyZXIucmVuZGVyRWxlbWVudChub2RlLCAwLCB0ZW1wbGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc291cmNlR3JvdXBzOiB0ZW1wbGF0ZS52YWx1ZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1jb2xsYXBzaWJsZS1pby1yZXNvdXJjZS1ncm91cCcpLmxlbmd0aCxcblx0XHRcdGxhcmdlT3V0Y29tZXM6IHRlbXBsYXRlLnZhbHVlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWdlbmVyYXRlZC1pbWFnZS1yZXN1bHQnKS5sZW5ndGgsXG5cdFx0XHRtdWx0aXBsZUltYWdlT3V0Y29tZXM6IHRlbXBsYXRlLnZhbHVlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWdlbmVyYXRlZC1pbWFnZS1yZXN1bHQubXVsdGlwbGUnKS5sZW5ndGgsXG5cdFx0XHRnZW5lcmF0ZWRJbWFnZUludm9jYXRpb25zOiB0ZW1wbGF0ZS52YWx1ZS5xdWVyeVNlbGVjdG9yQWxsKCcuZ2VuZXJhdGVkLWltYWdlLXRvb2wtaW52b2NhdGlvbicpLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRyZXNvdXJjZUdyb3VwczogMSxcblx0XHRcdGxhcmdlT3V0Y29tZXM6IDEsXG5cdFx0XHRtdWx0aXBsZUltYWdlT3V0Y29tZXM6IDEsXG5cdFx0XHRnZW5lcmF0ZWRJbWFnZUludm9jYXRpb25zOiAxLFxuXHRcdH0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wbGV0ZWQgcmVzcG9uc2UgZGlzY2xvc3VyZSBhbm5vdW5jZXMgdXNlciB0b2dnbGVzIHNvIHRoZSBsaXN0IGNhbiBhbmNob3IgaXRzIHN1bW1hcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nLCBmYWxzZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQ29sbGFwc2VDb21wbGV0ZWRSZXNwb25zZXMsIHRydWUpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmNoZWNrcG9pbnRzLmVuYWJsZWQnLCBmYWxzZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuY2hlY2twb2ludHMuc2hvd0ZpbGVDaGFuZ2VzJywgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlR1cm5TdGF0dXNQaWxscywgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlZlcmJvc2UsIGZhbHNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWdlbnRTZXJ2aWNlKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsLCB1bmRlZmluZWQsIHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRWaWV3TW9kZWwsIG1vZGVsLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0ZXh0ID0gJ3Rlc3QnO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHtcblx0XHRcdHRleHQsXG5cdFx0XHRwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCAxLCAxLCB0ZXh0Lmxlbmd0aCArIDEpLCB0ZXh0KV1cblx0XHR9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSB2aWV3TW9kZWwuZ2V0SXRlbXMoKS5maW5kKGlzUmVzcG9uc2VWTSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250YWluZXIucmVtb3ZlKCkpKTtcblx0XHRjb25zdCByZW5kZXJlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRMaXN0SXRlbVJlbmRlcmVyLFxuXHRcdFx0e30gYXMgQ2hhdEVkaXRvck9wdGlvbnMsXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Z2V0TGlzdExlbmd0aDogKCkgPT4gMSxcblx0XHRcdFx0b25EaWRTY3JvbGw6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0XHRjb250YWluZXIsXG5cdFx0XHRcdGN1cnJlbnRDaGF0TW9kZTogKCkgPT4gQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0fSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHZpZXdNb2RlbCxcblx0XHQpKTtcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IHJlbmRlcmVyLnJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByZW5kZXJlci5kaXNwb3NlVGVtcGxhdGUodGVtcGxhdGUpKSk7XG5cdFx0Y29uc3Qgbm9kZSA9IHsgZWxlbWVudDogcmVzcG9uc2UsIGNoaWxkcmVuOiBbXSwgZGVwdGg6IDAsIHZpc2libGVDaGlsZHJlbkNvdW50OiAwLCB2aXNpYmxlQ2hpbGRJbmRleDogMCwgY29sbGFwc2libGU6IGZhbHNlLCBjb2xsYXBzZWQ6IGZhbHNlLCB2aXNpYmxlOiB0cnVlLCBmaWx0ZXJEYXRhOiB1bmRlZmluZWQgfTtcblxuXHRcdGZvciAoY29uc3QgY2FsbElkIG9mIFsnY2FsbC0xJywgJ2NhbGwtMiddKSB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IG5ldyBDaGF0VG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgdG9vbC4uLicsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdUb29sIGNvbXBsZXRlZCcsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiAnbXktdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnTXkgVG9vbCcsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IHRvb2wnLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0fSwgY2FsbElkLCB1bmRlZmluZWQsIHt9LCB7fSwgcmVxdWVzdC5pZCk7XG5cdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHRvb2xJbnZvY2F0aW9uKTtcblx0XHRcdGF3YWl0IHRvb2xJbnZvY2F0aW9uLmRpZEV4ZWN1dGVUb29sKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdGaW5hbCByZXNwb25zZScpIH0pO1xuXHRcdHJlcXVlc3QucmVzcG9uc2U/LmNvbXBsZXRlKCk7XG5cdFx0cmVuZGVyZXIucmVuZGVyRWxlbWVudChub2RlLCAwLCB0ZW1wbGF0ZSk7XG5cblx0XHRjb25zdCBkaXNjbG9zdXJlID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTERldGFpbHNFbGVtZW50PignLmNvbXBsZXRlZC1yZXNwb25zZS1kaXNjbG9zdXJlJyk7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IGRpc2Nsb3N1cmU/LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY29tcGxldGVkLXJlc3BvbnNlLXN1bW1hcnknKTtcblxuXHRcdGxldCBhbm5vdW5jZWRUb2dnbGVzID0gMDtcblx0XHRjb25zdCBsaXN0ZW5lciA9ICgpID0+IGFubm91bmNlZFRvZ2dsZXMrKztcblx0XHRjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcihDaGF0Q29sbGFwc2libGVDb250ZW50UGFydC51c2VyVG9nZ2xlRXZlbnQsIGxpc3RlbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmVFdmVudExpc3RlbmVyKENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LnVzZXJUb2dnbGVFdmVudCwgbGlzdGVuZXIpKSk7XG5cdFx0c3VtbWFyeT8uY2xpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzRGlzY2xvc3VyZTogISFkaXNjbG9zdXJlLFxuXHRcdFx0c3VtbWFyeUxhYmVsOiBzdW1tYXJ5Py50ZXh0Q29udGVudCxcblx0XHRcdGFubm91bmNlZFRvZ2dsZXMsXG5cdFx0fSwge1xuXHRcdFx0aGFzRGlzY2xvc3VyZTogdHJ1ZSxcblx0XHRcdHN1bW1hcnlMYWJlbDogJ0NvbXBsZXRlZCAyIHN0ZXBzJyxcblx0XHRcdGFubm91bmNlZFRvZ2dsZXM6IDEsXG5cdFx0fSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29uc3RydWN0cyBhIGxhcmdlIGNvbGxhcHNlZCBzdWJhZ2VudCBoaXN0b3J5IHRocm91Z2ggb25lIHJlbmRlcmVyIGJhdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5hZ2VudC50aGlua2luZy5jb2xsYXBzZWRUb29scycsIENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUuT2ZmKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5TdWJhZ2VudHNVc2VSaWNoUmVuZGVyaW5nLCBmYWxzZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuY2hlY2twb2ludHMuZW5hYmxlZCcsIGZhbHNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5jaGVja3BvaW50cy5zaG93RmlsZUNoYW5nZXMnLCBmYWxzZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uVHVyblN0YXR1c1BpbGxzLCBmYWxzZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IE1vY2tDaGF0U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50U2VydmljZSkpKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Vmlld01vZGVsLCBtb2RlbCwgdW5kZWZpbmVkKSk7XG5cdFx0bW9kZWwuYWRkUmVxdWVzdCh7XG5cdFx0XHR0ZXh0OiAndGVzdCcsXG5cdFx0XHRwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCA0KSwgbmV3IFJhbmdlKDEsIDEsIDEsIDUpLCAndGVzdCcpXVxuXHRcdH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHZpZXdNb2RlbC5nZXRJdGVtcygpLmZpbmQoaXNSZXNwb25zZVZNKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2UpO1xuXG5cdFx0Y29uc3QgcGFyZW50U3ViYWdlbnQ6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkID0ge1xuXHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHR0b29sQ2FsbElkOiAnc3ViYWdlbnQtMScsXG5cdFx0XHR0b29sSWQ6ICd0YXNrJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgc3ViYWdlbnQnLFxuXHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0aXNDb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0aXNDb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZCxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHsga2luZDogJ3N1YmFnZW50JywgZGVzY3JpcHRpb246ICdJbnZlc3RpZ2F0ZScsIGlzQWN0aXZlOiB0cnVlIH0sXG5cdFx0fTtcblx0XHRjb25zdCB0b29sRGF0YSA9IHtcblx0XHRcdGlkOiAnc2VhcmNoJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnU2VhcmNoJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdTZWFyY2ggZmlsZXMnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXHRcdGNvbnN0IGNoaWxkVG9vbHM6IENoYXRUb29sSW52b2NhdGlvbltdID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTI4IH0sIChfLCBpbmRleCkgPT4gbmV3IENoYXRUb29sSW52b2NhdGlvbihcblx0XHRcdHtcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGBDb21wbGV0ZWQgdG9vbCAke2luZGV4fWAsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGBDb21wbGV0ZWQgdG9vbCAke2luZGV4fWAsXG5cdFx0XHR9LFxuXHRcdFx0dG9vbERhdGEsXG5cdFx0XHRgY2hpbGQtJHtpbmRleH1gLFxuXHRcdFx0cGFyZW50U3ViYWdlbnQudG9vbENhbGxJZCxcblx0XHRcdHt9LFxuXHRcdCkpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKGNoaWxkVG9vbHMubWFwKHRvb2wgPT4gdG9vbC5kaWRFeGVjdXRlVG9vbCh1bmRlZmluZWQpKSk7XG5cdFx0Y29uc3QgY29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSA9IFtwYXJlbnRTdWJhZ2VudCwgLi4uY2hpbGRUb29sc107XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY29udGFpbmVyLnJlbW92ZSgpKSk7XG5cdFx0Y29uc3QgcmVuZGVyZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TGlzdEl0ZW1SZW5kZXJlcixcblx0XHRcdHt9IGFzIENoYXRFZGl0b3JPcHRpb25zLFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGdldExpc3RMZW5ndGg6ICgpID0+IDEsXG5cdFx0XHRcdG9uRGlkU2Nyb2xsOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0XHRjdXJyZW50Q2hhdE1vZGU6ICgpID0+IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR2aWV3TW9kZWwsXG5cdFx0KSk7XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSByZW5kZXJlci5yZW5kZXJUZW1wbGF0ZShjb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcmVuZGVyZXIuZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlKSkpO1xuXHRcdGNvbnN0IHByaXZhdGVSZW5kZXJlciA9IHJlbmRlcmVyIGFzIHVua25vd24gYXMge1xuXHRcdFx0cmVuZGVyQ2hhdENvbnRlbnREaWZmKHBhcnRzVG9SZW5kZXI6IFJlYWRvbmx5QXJyYXk8SUNoYXRSZW5kZXJlckNvbnRlbnQgfCBudWxsPiwgY29udGVudEZvclRoaXNUdXJuOiBSZWFkb25seUFycmF5PElDaGF0UmVuZGVyZXJDb250ZW50PiwgZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgZWxlbWVudEluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZDtcblx0XHRcdGNsZWFyUmVuZGVyZWRQYXJ0cyh0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IHZvaWQ7XG5cdFx0fTtcblxuXHRcdHByaXZhdGVSZW5kZXJlci5yZW5kZXJDaGF0Q29udGVudERpZmYoY29udGVudCwgY29udGVudCwgcmVzcG9uc2UsIDAsIHRlbXBsYXRlKTtcblx0XHRwcml2YXRlUmVuZGVyZXIuY2xlYXJSZW5kZXJlZFBhcnRzKHRlbXBsYXRlKTtcblx0XHRwcml2YXRlUmVuZGVyZXIucmVuZGVyQ2hhdENvbnRlbnREaWZmKGNvbnRlbnQsIGNvbnRlbnQsIHJlc3BvbnNlLCAwLCB0ZW1wbGF0ZSk7XG5cblx0XHRjb25zdCBzdWJhZ2VudFBhcnQgPSB0ZW1wbGF0ZS5yZW5kZXJlZFBhcnRzPy5maW5kKHBhcnQgPT4gcGFydCBpbnN0YW5jZW9mIENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0KTtcblx0XHRhc3NlcnQub2soc3ViYWdlbnRQYXJ0KTtcblx0XHRjb25zdCB0aXRsZUJlZm9yZUV4cGFuc2lvbiA9IHN1YmFnZW50UGFydC5kb21Ob2RlLnRleHRDb250ZW50ID8/ICcnO1xuXHRcdGNvbnN0IGV4cGFuZEJ1dHRvbiA9IHN1YmFnZW50UGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC11c2VkLWNvbnRleHQtbGFiZWwgPiAubW9uYWNvLWJ1dHRvbicpO1xuXHRcdGFzc2VydC5vayhleHBhbmRCdXR0b24pO1xuXHRcdGV4cGFuZEJ1dHRvbi5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZUluY2x1ZGVzTGF0ZXN0VG9vbDogdGl0bGVCZWZvcmVFeHBhbnNpb24uaW5jbHVkZXMoJ0NvbXBsZXRlZCB0b29sIDEyNycpLFxuXHRcdFx0cmVuZGVyZWRUb29sQ291bnQ6IHN1YmFnZW50UGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXRoaW5raW5nLXRvb2wtd3JhcHBlcicpLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZUluY2x1ZGVzTGF0ZXN0VG9vbDogdHJ1ZSxcblx0XHRcdHJlbmRlcmVkVG9vbENvdW50OiAxMjgsXG5cdFx0fSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdC8vIEVuZC10by1lbmQgcmVncmVzc2lvbiB0ZXN0IGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzI2OTUyOiBhIGhlaWdodFxuXHQvLyBtZWFzdXJlZCBzeW5jaHJvbm91c2x5ICpkdXJpbmcqIHRoZSByZW5kZXIgcGFzcyBtdXN0IGJlIGRlZmVycmVkIChub3QgZmlyZWQgcmUtZW50cmFudGx5IGFuZFxuXHQvLyBub3Qgc3RvcmVkKSwgdGhlbiByZWxpYWJseSBkZWxpdmVyZWQgdG8gdGhlIHRyZWUgYWZ0ZXJ3YXJkcyB2aWEgYSByZS1tZWFzdXJlIFx1MjAxNCBzbyBzdHJlYW1lZFxuXHQvLyBjb250ZW50IGNhbid0IGdldCBzdHJhbmRlZCBiZWxvdyBhIHN0YWxlIHJvdyBoZWlnaHQgdW50aWwgYSB3aW5kb3cgcmVzaXplLlxuXHQvLyBza2lwcGVkIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzI3NDAyXG5cdHRlc3Quc2tpcCgnZmlyZUl0ZW1IZWlnaHRDaGFuZ2UgZGVmZXJzIGEgbWlkLXJlbmRlciBtZWFzdXJlbWVudCBhbmQgZGVsaXZlcnMgaXQgYWZ0ZXIgdGhlIHJlbmRlciBwYXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWdlbnRTZXJ2aWNlKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsLCB1bmRlZmluZWQsIHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRWaWV3TW9kZWwsIG1vZGVsLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0ZXh0ID0gJ3Rlc3QnO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHtcblx0XHRcdHRleHQsXG5cdFx0XHRwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCAxLCAxLCB0ZXh0Lmxlbmd0aCArIDEpLCB0ZXh0KV1cblx0XHR9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSB2aWV3TW9kZWwuZ2V0SXRlbXMoKS5maW5kKGlzUmVzcG9uc2VWTSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250YWluZXIucmVtb3ZlKCkpKTtcblx0XHRjb25zdCByZW5kZXJlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRMaXN0SXRlbVJlbmRlcmVyLFxuXHRcdFx0e30gYXMgQ2hhdEVkaXRvck9wdGlvbnMsXG5cdFx0XHR7IHByb2dyZXNzTWVzc2FnZUF0Qm90dG9tT2ZSZXNwb25zZTogdHJ1ZSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRMaXN0TGVuZ3RoOiAoKSA9PiAxLFxuXHRcdFx0XHRvbkRpZFNjcm9sbDogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0Y3VycmVudENoYXRNb2RlOiAoKSA9PiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHR9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dmlld01vZGVsLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gcmVuZGVyZXIucmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHJlbmRlcmVyLmRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZSkpKTtcblx0XHRjb25zdCBub2RlID0geyBlbGVtZW50OiByZXNwb25zZSwgY2hpbGRyZW46IFtdLCBkZXB0aDogMCwgdmlzaWJsZUNoaWxkcmVuQ291bnQ6IDAsIHZpc2libGVDaGlsZEluZGV4OiAwLCBjb2xsYXBzaWJsZTogZmFsc2UsIGNvbGxhcHNlZDogZmFsc2UsIHZpc2libGU6IHRydWUsIGZpbHRlckRhdGE6IHVuZGVmaW5lZCB9O1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdTb21lIGluaXRpYWwgY29udGVudCcpIH0pO1xuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQobm9kZSwgMCwgdGVtcGxhdGUpO1xuXHRcdC8vIENvbXBsZXRlIHRoZSByZXNwb25zZSBzbyBwcm9ncmVzc2l2ZSByZW5kZXJpbmcgc3RvcHMuIE90aGVyd2lzZSBhIHN0cmVhbWluZyByZXNwb25zZSBrZWVwc1xuXHRcdC8vIHNjaGVkdWxpbmcgYHJ1blByb2dyZXNzaXZlUmVuZGVyYCBvbiBhbmltYXRpb24gZnJhbWVzLCB3aGljaCBjcmVhdGVzIGFcblx0XHQvLyBDaGF0V29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnQgdGhhdCBvdXRsaXZlcyB0aGUgdGVzdCAobGVha2VkIGRpc3Bvc2FibGUgKyBzdHJheSBjb25zb2xlXG5cdFx0Ly8gb3V0cHV0IGR1cmluZyB0ZWFyZG93bikuXG5cdFx0cmVxdWVzdC5yZXNwb25zZT8uY29tcGxldGUoKTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblxuXHRcdGNvbnN0IHByaXZhdGVSZW5kZXJlciA9IHJlbmRlcmVyIGFzIHVua25vd24gYXMge1xuXHRcdFx0X2VsZW1lbnRCZWluZ1JlbmRlcmVkOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdFx0ZmlyZUl0ZW1IZWlnaHRDaGFuZ2UodGVtcGxhdGU6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgbWVhc3VyZWRIZWlnaHQ/OiBudW1iZXIpOiB2b2lkO1xuXHRcdH07XG5cdFx0Y29uc3QgbmV4dEZyYW1lID0gKCkgPT4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KGNvbnRhaW5lciksICgpID0+IHJlc29sdmUoKSkpO1xuXG5cdFx0Ly8gTGV0IHRoZSBpbml0aWFsIHJlbmRlcidzIGhlaWdodCBhY3Rpdml0eSAoUmVzaXplT2JzZXJ2ZXIgLyBzY2hlZHVsZWQgdXBkYXRlcykgc2V0dGxlLlxuXHRcdGF3YWl0IG5leHRGcmFtZSgpO1xuXHRcdGF3YWl0IG5leHRGcmFtZSgpO1xuXG5cdFx0Ly8gVGhlIHJvdydzIHJlYWwgcmVuZGVyZWQgaGVpZ2h0LiBUaGUgRE9NIGlzIE5PVCBtdXRhdGVkIGFmdGVyIHRoaXMgcG9pbnQsIHNvIHRoZSByb3cnc1xuXHRcdC8vIFJlc2l6ZU9ic2VydmVyIHN0YXlzIHF1aWV0IGFuZCBvbmx5IHRoZSBjb2RlIHVuZGVyIHRlc3QgY2FuIGRlbGl2ZXIgYSBmdXJ0aGVyIHVwZGF0ZS5cblx0XHRjb25zdCByZW5kZXJlZEhlaWdodCA9IE1hdGguY2VpbCh0ZW1wbGF0ZS5yb3dDb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0KTtcblx0XHRhc3NlcnQub2socmVuZGVyZWRIZWlnaHQgPiAxLCAncm93IHNob3VsZCBoYXZlIGEgcmVhbCByZW5kZXJlZCBoZWlnaHQnKTtcblxuXHRcdC8vIFNpbXVsYXRlIHN0cmVhbWluZyB0aGF0IGdyZXcgdGhlIHJvdyBwYXN0IHRoZSBoZWlnaHQgdGhlIHRyZWUgbGFzdCBhY2tub3dsZWRnZWQuXG5cdFx0cmVzcG9uc2UuY3VycmVudFJlbmRlcmVkSGVpZ2h0ID0gcmVuZGVyZWRIZWlnaHQgLSAxO1xuXHRcdGNvbnN0IGhlaWdodEV2ZW50czogbnVtYmVyW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVuZGVyZXIub25EaWRDaGFuZ2VJdGVtSGVpZ2h0KGUgPT4gaGVpZ2h0RXZlbnRzLnB1c2goZS5oZWlnaHQpKSk7XG5cblx0XHQvLyAoYSkgQSBtZWFzdXJlbWVudCBzZWVuIHN5bmNocm9ub3VzbHkgZHVyaW5nIHRoZSByZW5kZXIgcGFzcyBtdXN0IG5vdCBub3RpZnkgdGhlIHRyZWVcblx0XHQvLyByZS1lbnRyYW50bHkgYW5kIG11c3Qgbm90IGFkdmFuY2UgdGhlIHN0b3JlZCBoZWlnaHQuXG5cdFx0cHJpdmF0ZVJlbmRlcmVyLl9lbGVtZW50QmVpbmdSZW5kZXJlZCA9IHJlc3BvbnNlO1xuXHRcdHByaXZhdGVSZW5kZXJlci5maXJlSXRlbUhlaWdodENoYW5nZSh0ZW1wbGF0ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgZXZlbnRzOiBbLi4uaGVpZ2h0RXZlbnRzXSwgc3RvcmVkOiByZXNwb25zZS5jdXJyZW50UmVuZGVyZWRIZWlnaHQgfSxcblx0XHRcdHsgZXZlbnRzOiBbXSwgc3RvcmVkOiByZW5kZXJlZEhlaWdodCAtIDEgfSxcblx0XHQpO1xuXG5cdFx0Ly8gKGIpIE9uY2UgdGhlIHJlbmRlciBwYXNzIGlzIG92ZXIgdGhlIGRlZmVycmVkIHJlLW1lYXN1cmUgZGVsaXZlcnMgdGhlIHJlYWwgaGVpZ2h0LlxuXHRcdHByaXZhdGVSZW5kZXJlci5fZWxlbWVudEJlaW5nUmVuZGVyZWQgPSB1bmRlZmluZWQ7XG5cdFx0YXdhaXQgbmV4dEZyYW1lKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgZXZlbnRzOiBbLi4uaGVpZ2h0RXZlbnRzXSwgc3RvcmVkOiByZXNwb25zZS5jdXJyZW50UmVuZGVyZWRIZWlnaHQgfSxcblx0XHRcdHsgZXZlbnRzOiBbcmVuZGVyZWRIZWlnaHRdLCBzdG9yZWQ6IHJlbmRlcmVkSGVpZ2h0IH0sXG5cdFx0KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQ2pFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUN0QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxnQ0FBZ0Msc0JBQXNCLCtCQUErQixzQ0FBc0Msd0NBQXdDLDBCQUEwQixzQ0FBc0MsNEJBQTRCLDJEQUEyRCxzQ0FBc0MsaUNBQXdELHlCQUF5Qix3QkFBd0IsNENBQTRDLHlCQUF5Qiw0QkFBNEIsMkJBQTJCLHFDQUFxQyxpQ0FBaUMsNEJBQTRC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QU0sV0FBVyxTQUFTLGVBQWUsU0FBUztBQUNsRCxnQkFBWSxJQUFJLGFBQWEsTUFBTSxTQUFTLGdCQUFnQixRQUFRLENBQUMsQ0FBQztBQUN0RSxVQUFNLE9BQU8sRUFBRSxTQUFTLFVBQVUsVUFBVSxDQUFDLEdBQUcsT0FBTyxHQUFHLHNCQUFzQixHQUFHLG1CQUFtQixHQUFHLGFBQWEsT0FBTyxXQUFXLE9BQU8sU0FBUyxNQUFNLFlBQVksT0FBVTtBQUNwTCxVQUFNLHVCQUF1QixTQUFTLEVBQUUsTUFBTSxtQkFBbUIsU0FBUyxJQUFJLGVBQWUsc0JBQXNCLEVBQUUsQ0FBQztBQUN0SCxhQUFTLGNBQWMsTUFBTSxHQUFHLFFBQVE7QUFLeEMsWUFBUSxVQUFVLFNBQVM7QUFDM0IsYUFBUyxjQUFjLE1BQU0sR0FBRyxRQUFRO0FBRXhDLFVBQU0sa0JBQWtCO0FBSXhCLFVBQU0sWUFBWSxNQUFNLElBQUksUUFBYyxhQUFXLElBQUksNkJBQTZCLElBQUksVUFBVSxTQUFTLEdBQUcsTUFBTSxRQUFRLENBQUMsQ0FBQztBQUdoSSxVQUFNLFVBQVU7QUFDaEIsVUFBTSxVQUFVO0FBSWhCLFVBQU0saUJBQWlCLEtBQUssS0FBSyxTQUFTLGFBQWEsc0JBQXNCLEVBQUUsTUFBTTtBQUNyRixXQUFPLEdBQUcsaUJBQWlCLEdBQUcsd0NBQXdDO0FBR3RFLGFBQVMsd0JBQXdCLGlCQUFpQjtBQUNsRCxVQUFNLGVBQXlCLENBQUM7QUFDaEMsZ0JBQVksSUFBSSxTQUFTLHNCQUFzQixPQUFLLGFBQWEsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBSWhGLG9CQUFnQix3QkFBd0I7QUFDeEMsb0JBQWdCLHFCQUFxQixRQUFRO0FBQzdDLFdBQU87QUFBQSxNQUNOLEVBQUUsUUFBUSxDQUFDLEdBQUcsWUFBWSxHQUFHLFFBQVEsU0FBUyxzQkFBc0I7QUFBQSxNQUNwRSxFQUFFLFFBQVEsQ0FBQyxHQUFHLFFBQVEsaUJBQWlCLEVBQUU7QUFBQSxJQUMxQztBQUdBLG9CQUFnQix3QkFBd0I7QUFDeEMsVUFBTSxVQUFVO0FBQ2hCLFdBQU87QUFBQSxNQUNOLEVBQUUsUUFBUSxDQUFDLEdBQUcsWUFBWSxHQUFHLFFBQVEsU0FBUyxzQkFBc0I7QUFBQSxNQUNwRSxFQUFFLFFBQVEsQ0FBQyxjQUFjLEdBQUcsUUFBUSxlQUFlO0FBQUEsSUFDcEQ7QUFFQSxnQkFBWSxRQUFRO0FBQUEsRUFDckIsQ0FBQztBQUVGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
