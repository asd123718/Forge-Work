import { Event } from "../../../../../base/common/event.js";
import { Color } from "../../../../../base/common/color.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { CodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { TokenizationRegistry } from "../../../../../editor/common/languages.js";
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from "../../browser/agentFeedbackService.js";
import { AgentFeedbackEditorWidget } from "../../browser/agentFeedbackEditorWidget.js";
import { AgentFeedbackEditorWidgetContribution } from "../../browser/agentFeedbackEditorWidgetContribution.js";
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from "../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js";
import { ICodeReviewService } from "../../../codeReview/browser/codeReviewService.js";
import { createMockCodeReviewService } from "../../../../../workbench/test/browser/componentFixtures/sessions/mockCodeReviewService.js";
import { SessionEditorCommentSource } from "../../browser/sessionEditorComments.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
const sessionResource = URI.parse("vscode-agent-session://fixture/session-1");
const fileResource = URI.parse("inmemory://model/agent-feedback-widget.ts");
const sampleCode = [
  "function alpha() {",
  "	const first = 1;",
  "	return first;",
  "}",
  "",
  "function beta() {",
  "	const second = 2;",
  "	const third = second + 1;",
  "	return third;",
  "}",
  "",
  "function gamma() {",
  "	const done = true;",
  "	return done;",
  "}"
].join("\n");
const longSampleCode = Array.from({ length: 100 }, (_, i) => {
  const line = i + 1;
  if (line % 6 === 1) {
    return `function fn${line}() {`;
  }
  if (line % 6 === 0) {
    return "}";
  }
  if (line % 6 === 5) {
    return `	return value${line};`;
  }
  return `	const value${line} = ${line} + compute${line}();`;
}).join("\n");
function createRange(startLineNumber, endLineNumber = startLineNumber) {
  return {
    startLineNumber,
    startColumn: 1,
    endLineNumber,
    endColumn: 1
  };
}
function createFeedbackComment(id, text, startLineNumber, endLineNumber = startLineNumber, suggestion, replies) {
  return {
    id: `agentFeedback:${id}`,
    sourceId: id,
    source: SessionEditorCommentSource.AgentFeedback,
    kind: AgentFeedbackKind.UserReview,
    sessionResource,
    resourceUri: fileResource,
    range: createRange(startLineNumber, endLineNumber),
    text,
    suggestion,
    canConvertToAgentFeedback: false,
    replies
  };
}
function createPRReviewComment(id, text, startLineNumber, endLineNumber = startLineNumber) {
  return {
    id: `prReview:${id}`,
    sourceId: id,
    source: SessionEditorCommentSource.PRReview,
    kind: AgentFeedbackKind.PRReview,
    text,
    resourceUri: fileResource,
    range: createRange(startLineNumber, endLineNumber),
    sessionResource,
    canConvertToAgentFeedback: true
  };
}
function createMockAgentFeedbackService() {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeFeedback = Event.None;
      this.onDidChangeNavigation = Event.None;
      this.onDidChangeFeedbackScope = Event.None;
      this.onDidAddFeedback = Event.None;
      this.onDidConvertFeedback = Event.None;
      this.onDidAddReply = Event.None;
      this.onDidSubmitFeedback = Event.None;
    }
    addFeedback() {
      throw new Error("Not implemented for fixture");
    }
    removeFeedback() {
    }
    addReply() {
    }
    getFeedback() {
      return [];
    }
    getFeedbackSessionResource() {
      return void 0;
    }
    getMostRecentSessionForResource() {
      return void 0;
    }
    async revealFeedback() {
    }
    getNextFeedback() {
      return void 0;
    }
    getNavigationBearing() {
      return { activeIdx: -1, totalCount: 0 };
    }
    getNextNavigableItem() {
      return void 0;
    }
    setNavigationAnchor() {
    }
    clearFeedback() {
    }
    async addFeedbackAndSubmit() {
    }
  }();
}
function ensureTokenColorMap() {
  if (TokenizationRegistry.getColorMap()?.length) {
    return;
  }
  const colorMap = [
    Color.fromHex("#000000"),
    Color.fromHex("#d4d4d4"),
    Color.fromHex("#9cdcfe"),
    Color.fromHex("#ce9178"),
    Color.fromHex("#b5cea8"),
    Color.fromHex("#4fc1ff"),
    Color.fromHex("#c586c0"),
    Color.fromHex("#569cd6"),
    Color.fromHex("#dcdcaa"),
    Color.fromHex("#f44747")
  ];
  TokenizationRegistry.setColorMap(colorMap);
}
function renderWidget(context, options) {
  const scopedDisposables = context.disposableStore.add(new DisposableStore());
  context.container.style.width = "760px";
  context.container.style.height = "420px";
  context.container.style.border = "1px solid var(--vscode-editorWidget-border)";
  context.container.style.background = "var(--vscode-editor-background)";
  ensureTokenColorMap();
  const agentFeedbackService = createMockAgentFeedbackService();
  const codeReviewService = createMockCodeReviewService();
  const instantiationService = createEditorServices(scopedDisposables, {
    colorTheme: context.theme,
    additionalServices: (reg) => {
      reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
      reg.defineInstance(ICodeReviewService, codeReviewService);
      reg.define(IMarkdownRendererService, MarkdownRendererService);
    }
  });
  const model = scopedDisposables.add(createTextModel(instantiationService, sampleCode, fileResource, "typescript"));
  const editorOptions = {
    contributions: []
  };
  const editor = scopedDisposables.add(instantiationService.createInstance(
    CodeEditorWidget,
    context.container,
    {
      automaticLayout: true,
      lineNumbers: "on",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineHeight: 20
    },
    editorOptions
  ));
  editor.setModel(model);
  const widget = scopedDisposables.add(instantiationService.createInstance(
    AgentFeedbackEditorWidget,
    editor,
    options.commentItems,
    sessionResource,
    void 0
  ));
  widget.layout(options.commentItems[0].range.startLineNumber);
  if (options.expanded) {
    widget.expand();
  }
  if (options.focusedCommentId) {
    widget.focusFeedback(options.focusedCommentId);
  }
  if (options.hidden) {
    const domNode = widget.getDomNode();
    domNode.style.transition = "none";
    domNode.style.animation = "none";
    widget.toggle(false);
  }
}
function renderViaContribution(context, code, comments) {
  const scopedDisposables = context.disposableStore.add(new DisposableStore());
  context.container.style.width = "760px";
  context.container.style.height = "420px";
  context.container.style.border = "1px solid var(--vscode-editorWidget-border)";
  context.container.style.background = "var(--vscode-editor-background)";
  ensureTokenColorMap();
  const feedback = comments.map((comment) => ({
    id: comment.sourceId,
    text: comment.text,
    resourceUri: comment.resourceUri,
    range: comment.range,
    sessionResource: comment.sessionResource,
    suggestion: comment.suggestion,
    kind: comment.kind,
    replies: comment.replies,
    state: comment.state ?? AgentFeedbackState.Accepted
  }));
  const agentFeedbackService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeFeedback = Event.None;
      this.onDidChangeNavigation = Event.None;
      this.onDidChangeFeedbackScope = Event.None;
    }
    getSessionForFile(resourceUri) {
      return resourceUri.toString() === fileResource.toString() ? { resource: sessionResource } : void 0;
    }
    getFeedbackSessionResource(resourceUri) {
      return resourceUri.toString() === fileResource.toString() ? sessionResource : void 0;
    }
    getFeedback(resource) {
      return resource.toString() === sessionResource.toString() ? feedback : [];
    }
    getNavigationBearing() {
      return { activeIdx: -1, totalCount: feedback.length };
    }
  }();
  const sessionsManagementService = new class extends mock() {
    getSession() {
      return void 0;
    }
  }();
  const codeReviewService = createMockCodeReviewService();
  const instantiationService = createEditorServices(scopedDisposables, {
    colorTheme: context.theme,
    additionalServices: (reg) => {
      reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
      reg.defineInstance(ISessionsManagementService, sessionsManagementService);
      reg.defineInstance(ICodeReviewService, codeReviewService);
      reg.define(IMarkdownRendererService, MarkdownRendererService);
    }
  });
  const model = scopedDisposables.add(createTextModel(instantiationService, code, fileResource, "typescript"));
  const editor = scopedDisposables.add(instantiationService.createInstance(
    CodeEditorWidget,
    context.container,
    {
      automaticLayout: true,
      lineNumbers: "on",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineHeight: 20
    },
    { contributions: [] }
  ));
  editor.setModel(model);
  scopedDisposables.add(instantiationService.createInstance(AgentFeedbackEditorWidgetContribution, editor));
}
const singleFeedback = [
  createFeedbackComment("f-1", "Prefer a clearer variable name on this line.", 2)
];
const groupedFeedback = [
  createFeedbackComment("f-1", "Prefer a clearer variable name on this line.", 2),
  createFeedbackComment("f-2", "This return statement can be simplified.", 3),
  createFeedbackComment("f-3", "Consider documenting why this branch is needed.", 6, 8)
];
const reviewOnly = [
  createFeedbackComment("r-1", "Handle the null case before returning here.", 7),
  createFeedbackComment("r-2", "This branch needs a stronger explanation.", 8)
];
const mixedComments = [
  createFeedbackComment("f-1", "Prefer a clearer variable name on this line.", 2),
  createFeedbackComment("r-1", "This should be extracted into a helper.", 3),
  createFeedbackComment("f-2", "Consider renaming this for readability.", 4)
];
const reviewSuggestion = {
  edits: [
    { range: createRange(8), oldText: "	const third = second + 1;", newText: "	const third = second + computeOffset();" }
  ]
};
const suggestionMix = [
  createFeedbackComment("r-3", "Prefer using the helper so the intent is explicit.", 8, 8, reviewSuggestion),
  createFeedbackComment("f-3", "Keep the helper name aligned with the domain concept.", 9)
];
const prReviewOnly = [
  createPRReviewComment("pr-1", "This variable should be renamed to match our naming conventions.", 2),
  createPRReviewComment("pr-2", "Please add error handling for the edge case when second is zero.", 7, 8)
];
const threadedFeedback = [
  createFeedbackComment(
    "f-thread",
    "Consider extracting this into a helper function.",
    7,
    7,
    void 0,
    [
      "I agree, and we should also unit test the helper.",
      "Make sure the helper name matches the domain concept."
    ]
  )
];
const allSourcesMixed = [
  createFeedbackComment("f-1", "Prefer a clearer variable name on this line.", 2),
  createPRReviewComment("pr-1", "Our style guide says to use descriptive names here.", 3),
  createFeedbackComment("r-1", "This should be extracted into a helper.", 6),
  createPRReviewComment("pr-2", "This logic duplicates what we have in utils.ts \u2014 consider reusing.", 8, 9)
];
const longFileFeedback = [
  createFeedbackComment("lf-1", "Consider validating this input before using it.", 5),
  createFeedbackComment("lf-2", "This computation is duplicated further down \u2014 extract a helper.", 20)
];
var agentFeedbackEditorWidget_fixture_default = defineThemedFixtureGroup({ path: "sessions/agentFeedback/" }, {
  CollapsedSingleComment: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: singleFeedback
    })
  }),
  ExpandedSingleComment: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: singleFeedback,
      expanded: true
    })
  }),
  CollapsedMultiComment: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: groupedFeedback
    })
  }),
  ExpandedMultiComment: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: groupedFeedback,
      expanded: true
    })
  }),
  ExpandedFocusedFeedback: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: groupedFeedback,
      expanded: true,
      focusedCommentId: "agentFeedback:f-2"
    })
  }),
  ExpandedReviewOnly: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: reviewOnly,
      expanded: true
    })
  }),
  ExpandedMixedComments: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: mixedComments,
      expanded: true
    })
  }),
  ExpandedFocusedReviewComment: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: mixedComments,
      expanded: true,
      focusedCommentId: "agentFeedback:r-1"
    })
  }),
  ExpandedReviewSuggestion: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: suggestionMix,
      expanded: true
    })
  }),
  ExpandedPRReviewOnly: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: prReviewOnly,
      expanded: true
    })
  }),
  ExpandedAllSourcesMixed: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: allSourcesMixed,
      expanded: true
    })
  }),
  ExpandedFocusedPRReview: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: allSourcesMixed,
      expanded: true,
      focusedCommentId: "prReview:pr-2"
    })
  }),
  ExpandedThreadedFeedback: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: threadedFeedback,
      expanded: true
    })
  }),
  HiddenWidget: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderWidget(context, {
      commentItems: mixedComments,
      hidden: true
    })
  }),
  LongFileTwoComments: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderViaContribution(context, longSampleCode, longFileFeedback)
  })
});
export {
  agentFeedbackEditorWidget_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcdGVzdFxcYnJvd3NlclxcYWdlbnRGZWVkYmFja0VkaXRvcldpZGdldC5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIE1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQsIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRGZWVkYmFja0tpbmQsIEFnZW50RmVlZGJhY2tTdGF0ZSwgSUFnZW50RmVlZGJhY2ssIElBZ2VudEZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRGZWVkYmFja0VkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRGZWVkYmFja0VkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBBZ2VudEZlZWRiYWNrRWRpdG9yV2lkZ2V0Q29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hZ2VudEZlZWRiYWNrRWRpdG9yV2lkZ2V0Q29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgY3JlYXRlVGV4dE1vZGVsLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvdGVzdC9icm93c2VyL2NvbXBvbmVudEZpeHR1cmVzL2ZpeHR1cmVVdGlscy5qcyc7XG5pbXBvcnQgeyBJQ29kZVJldmlld1NlcnZpY2UsIElDb2RlUmV2aWV3U3VnZ2VzdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvZGVSZXZpZXcvYnJvd3Nlci9jb2RlUmV2aWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNb2NrQ29kZVJldmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvdGVzdC9icm93c2VyL2NvbXBvbmVudEZpeHR1cmVzL3Nlc3Npb25zL21vY2tDb2RlUmV2aWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkVkaXRvckNvbW1lbnQsIFNlc3Npb25FZGl0b3JDb21tZW50U291cmNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uRWRpdG9yQ29tbWVudHMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuXG5jb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1hZ2VudC1zZXNzaW9uOi8vZml4dHVyZS9zZXNzaW9uLTEnKTtcbmNvbnN0IGZpbGVSZXNvdXJjZSA9IFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9tb2RlbC9hZ2VudC1mZWVkYmFjay13aWRnZXQudHMnKTtcblxuY29uc3Qgc2FtcGxlQ29kZSA9IFtcblx0J2Z1bmN0aW9uIGFscGhhKCkgeycsXG5cdCdcXHRjb25zdCBmaXJzdCA9IDE7Jyxcblx0J1xcdHJldHVybiBmaXJzdDsnLFxuXHQnfScsXG5cdCcnLFxuXHQnZnVuY3Rpb24gYmV0YSgpIHsnLFxuXHQnXFx0Y29uc3Qgc2Vjb25kID0gMjsnLFxuXHQnXFx0Y29uc3QgdGhpcmQgPSBzZWNvbmQgKyAxOycsXG5cdCdcXHRyZXR1cm4gdGhpcmQ7Jyxcblx0J30nLFxuXHQnJyxcblx0J2Z1bmN0aW9uIGdhbW1hKCkgeycsXG5cdCdcXHRjb25zdCBkb25lID0gdHJ1ZTsnLFxuXHQnXFx0cmV0dXJuIGRvbmU7Jyxcblx0J30nLFxuXS5qb2luKCdcXG4nKTtcblxuY29uc3QgbG9uZ1NhbXBsZUNvZGUgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMDAgfSwgKF8sIGkpID0+IHtcblx0Y29uc3QgbGluZSA9IGkgKyAxO1xuXHRpZiAobGluZSAlIDYgPT09IDEpIHtcblx0XHRyZXR1cm4gYGZ1bmN0aW9uIGZuJHtsaW5lfSgpIHtgO1xuXHR9XG5cdGlmIChsaW5lICUgNiA9PT0gMCkge1xuXHRcdHJldHVybiAnfSc7XG5cdH1cblx0aWYgKGxpbmUgJSA2ID09PSA1KSB7XG5cdFx0cmV0dXJuIGBcXHRyZXR1cm4gdmFsdWUke2xpbmV9O2A7XG5cdH1cblx0cmV0dXJuIGBcXHRjb25zdCB2YWx1ZSR7bGluZX0gPSAke2xpbmV9ICsgY29tcHV0ZSR7bGluZX0oKTtgO1xufSkuam9pbignXFxuJyk7XG5cbmludGVyZmFjZSBJRml4dHVyZU9wdGlvbnMge1xuXHRyZWFkb25seSBleHBhbmRlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGZvY3VzZWRDb21tZW50SWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhpZGRlbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbW1lbnRJdGVtczogcmVhZG9ubHkgSVNlc3Npb25FZGl0b3JDb21tZW50W107XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVJhbmdlKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIgPSBzdGFydExpbmVOdW1iZXIpOiBJUmFuZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0TGluZU51bWJlcixcblx0XHRzdGFydENvbHVtbjogMSxcblx0XHRlbmRMaW5lTnVtYmVyLFxuXHRcdGVuZENvbHVtbjogMSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRmVlZGJhY2tDb21tZW50KGlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciA9IHN0YXJ0TGluZU51bWJlciwgc3VnZ2VzdGlvbj86IElDb2RlUmV2aWV3U3VnZ2VzdGlvbiwgcmVwbGllcz86IHJlYWRvbmx5IHN0cmluZ1tdKTogSVNlc3Npb25FZGl0b3JDb21tZW50IHtcblx0cmV0dXJuIHtcblx0XHRpZDogYGFnZW50RmVlZGJhY2s6JHtpZH1gLFxuXHRcdHNvdXJjZUlkOiBpZCxcblx0XHRzb3VyY2U6IFNlc3Npb25FZGl0b3JDb21tZW50U291cmNlLkFnZW50RmVlZGJhY2ssXG5cdFx0a2luZDogQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldyxcblx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0cmVzb3VyY2VVcmk6IGZpbGVSZXNvdXJjZSxcblx0XHRyYW5nZTogY3JlYXRlUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyKSxcblx0XHR0ZXh0LFxuXHRcdHN1Z2dlc3Rpb24sXG5cdFx0Y2FuQ29udmVydFRvQWdlbnRGZWVkYmFjazogZmFsc2UsXG5cdFx0cmVwbGllcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUFJSZXZpZXdDb21tZW50KGlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciA9IHN0YXJ0TGluZU51bWJlcik6IElTZXNzaW9uRWRpdG9yQ29tbWVudCB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IGBwclJldmlldzoke2lkfWAsXG5cdFx0c291cmNlSWQ6IGlkLFxuXHRcdHNvdXJjZTogU2Vzc2lvbkVkaXRvckNvbW1lbnRTb3VyY2UuUFJSZXZpZXcsXG5cdFx0a2luZDogQWdlbnRGZWVkYmFja0tpbmQuUFJSZXZpZXcsXG5cdFx0dGV4dCxcblx0XHRyZXNvdXJjZVVyaTogZmlsZVJlc291cmNlLFxuXHRcdHJhbmdlOiBjcmVhdGVSYW5nZShzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIpLFxuXHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRjYW5Db252ZXJ0VG9BZ2VudEZlZWRiYWNrOiB0cnVlLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQWdlbnRGZWVkYmFja1NlcnZpY2UoKTogSUFnZW50RmVlZGJhY2tTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50RmVlZGJhY2tTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZlZWRiYWNrID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU5hdmlnYXRpb24gPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZSA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBZGRGZWVkYmFjayA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDb252ZXJ0RmVlZGJhY2sgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWRkUmVwbHkgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0RmVlZGJhY2sgPSBFdmVudC5Ob25lO1xuXG5cdFx0b3ZlcnJpZGUgYWRkRmVlZGJhY2soKTogSUFnZW50RmVlZGJhY2sge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQgZm9yIGZpeHR1cmUnKTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSByZW1vdmVGZWVkYmFjaygpOiB2b2lkIHsgfVxuXG5cdFx0b3ZlcnJpZGUgYWRkUmVwbHkoKTogdm9pZCB7IH1cblxuXHRcdG92ZXJyaWRlIGdldEZlZWRiYWNrKCk6IHJlYWRvbmx5IElBZ2VudEZlZWRiYWNrW10ge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGdldE1vc3RSZWNlbnRTZXNzaW9uRm9yUmVzb3VyY2UoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgYXN5bmMgcmV2ZWFsRmVlZGJhY2soKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRcdG92ZXJyaWRlIGdldE5leHRGZWVkYmFjaygpOiBJQWdlbnRGZWVkYmFjayB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGdldE5hdmlnYXRpb25CZWFyaW5nKCkge1xuXHRcdFx0cmV0dXJuIHsgYWN0aXZlSWR4OiAtMSwgdG90YWxDb3VudDogMCB9O1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGdldE5leHROYXZpZ2FibGVJdGVtKCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBzZXROYXZpZ2F0aW9uQW5jaG9yKCk6IHZvaWQgeyB9XG5cblx0XHRvdmVycmlkZSBjbGVhckZlZWRiYWNrKCk6IHZvaWQgeyB9XG5cblx0XHRvdmVycmlkZSBhc3luYyBhZGRGZWVkYmFja0FuZFN1Ym1pdCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZVRva2VuQ29sb3JNYXAoKTogdm9pZCB7XG5cdGlmIChUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRDb2xvck1hcCgpPy5sZW5ndGgpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBjb2xvck1hcCA9IFtcblx0XHRDb2xvci5mcm9tSGV4KCcjMDAwMDAwJyksXG5cdFx0Q29sb3IuZnJvbUhleCgnI2Q0ZDRkNCcpLFxuXHRcdENvbG9yLmZyb21IZXgoJyM5Y2RjZmUnKSxcblx0XHRDb2xvci5mcm9tSGV4KCcjY2U5MTc4JyksXG5cdFx0Q29sb3IuZnJvbUhleCgnI2I1Y2VhOCcpLFxuXHRcdENvbG9yLmZyb21IZXgoJyM0ZmMxZmYnKSxcblx0XHRDb2xvci5mcm9tSGV4KCcjYzU4NmMwJyksXG5cdFx0Q29sb3IuZnJvbUhleCgnIzU2OWNkNicpLFxuXHRcdENvbG9yLmZyb21IZXgoJyNkY2RjYWEnKSxcblx0XHRDb2xvci5mcm9tSGV4KCcjZjQ0NzQ3JyksXG5cdF07XG5cblx0VG9rZW5pemF0aW9uUmVnaXN0cnkuc2V0Q29sb3JNYXAoY29sb3JNYXApO1xufVxuXG5mdW5jdGlvbiByZW5kZXJXaWRnZXQoY29udGV4dDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIG9wdGlvbnM6IElGaXh0dXJlT3B0aW9ucyk6IHZvaWQge1xuXHRjb25zdCBzY29wZWREaXNwb3NhYmxlcyA9IGNvbnRleHQuZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRjb250ZXh0LmNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICc3NjBweCc7XG5cdGNvbnRleHQuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICc0MjBweCc7XG5cdGNvbnRleHQuY29udGFpbmVyLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgdmFyKC0tdnNjb2RlLWVkaXRvcldpZGdldC1ib3JkZXIpJztcblx0Y29udGV4dC5jb250YWluZXIuc3R5bGUuYmFja2dyb3VuZCA9ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJztcblxuXHRlbnN1cmVUb2tlbkNvbG9yTWFwKCk7XG5cblx0Y29uc3QgYWdlbnRGZWVkYmFja1NlcnZpY2UgPSBjcmVhdGVNb2NrQWdlbnRGZWVkYmFja1NlcnZpY2UoKTtcblx0Y29uc3QgY29kZVJldmlld1NlcnZpY2UgPSBjcmVhdGVNb2NrQ29kZVJldmlld1NlcnZpY2UoKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhzY29wZWREaXNwb3NhYmxlcywge1xuXHRcdGNvbG9yVGhlbWU6IGNvbnRleHQudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiByZWcgPT4ge1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEZlZWRiYWNrU2VydmljZSwgYWdlbnRGZWVkYmFja1NlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDb2RlUmV2aWV3U2VydmljZSwgY29kZVJldmlld1NlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZShJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIE1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKTtcblx0XHR9LFxuXHR9KTtcblx0Y29uc3QgbW9kZWwgPSBzY29wZWREaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzYW1wbGVDb2RlLCBmaWxlUmVzb3VyY2UsICd0eXBlc2NyaXB0JykpO1xuXG5cdGNvbnN0IGVkaXRvck9wdGlvbnM6IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyA9IHtcblx0XHRjb250cmlidXRpb25zOiBbXSxcblx0fTtcblxuXHRjb25zdCBlZGl0b3IgPSBzY29wZWREaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0Q29kZUVkaXRvcldpZGdldCxcblx0XHRjb250ZXh0LmNvbnRhaW5lcixcblx0XHR7XG5cdFx0XHRhdXRvbWF0aWNMYXlvdXQ6IHRydWUsXG5cdFx0XHRsaW5lTnVtYmVyczogJ29uJyxcblx0XHRcdG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdGZvbnRTaXplOiAxMyxcblx0XHRcdGxpbmVIZWlnaHQ6IDIwLFxuXHRcdH0sXG5cdFx0ZWRpdG9yT3B0aW9uc1xuXHQpKTtcblxuXHRlZGl0b3Iuc2V0TW9kZWwobW9kZWwpO1xuXG5cdGNvbnN0IHdpZGdldCA9IHNjb3BlZERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRBZ2VudEZlZWRiYWNrRWRpdG9yV2lkZ2V0LFxuXHRcdGVkaXRvcixcblx0XHRvcHRpb25zLmNvbW1lbnRJdGVtcyxcblx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0dW5kZWZpbmVkLFxuXHQpKTtcblxuXHR3aWRnZXQubGF5b3V0KG9wdGlvbnMuY29tbWVudEl0ZW1zWzBdLnJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cblx0aWYgKG9wdGlvbnMuZXhwYW5kZWQpIHtcblx0XHR3aWRnZXQuZXhwYW5kKCk7XG5cdH1cblxuXHRpZiAob3B0aW9ucy5mb2N1c2VkQ29tbWVudElkKSB7XG5cdFx0d2lkZ2V0LmZvY3VzRmVlZGJhY2sob3B0aW9ucy5mb2N1c2VkQ29tbWVudElkKTtcblx0fVxuXG5cdGlmIChvcHRpb25zLmhpZGRlbikge1xuXHRcdGNvbnN0IGRvbU5vZGUgPSB3aWRnZXQuZ2V0RG9tTm9kZSgpO1xuXHRcdGRvbU5vZGUuc3R5bGUudHJhbnNpdGlvbiA9ICdub25lJztcblx0XHRkb21Ob2RlLnN0eWxlLmFuaW1hdGlvbiA9ICdub25lJztcblx0XHR3aWRnZXQudG9nZ2xlKGZhbHNlKTtcblx0fVxufVxuXG4vKipcbiAqIFJlbmRlcnMgdGhlIGFnZW50IGZlZWRiYWNrIHdpZGdldHMgdGhlIHNhbWUgd2F5IHByb2R1Y3Rpb24gZG9lczogYnlcbiAqIGluc3RhbnRpYXRpbmcgdGhlIHJlYWwge0BsaW5rIEFnZW50RmVlZGJhY2tFZGl0b3JXaWRnZXRDb250cmlidXRpb259IGFuZFxuICogZmVlZGluZyBpdCBjb21tZW50cyB0aHJvdWdoIHRoZSBzZXJ2aWNlcy4gVGhpcyBleGVyY2lzZXMgdGhlIHByb2R1Y3Rpb25cbiAqIGdyb3VwaW5nIChmYXItYXBhcnQgY29tbWVudHMgYmVjb21lIHNlcGFyYXRlIHdpZGdldHMpIGFuZCBzY3JvbGwgaGFuZGxpbmdcbiAqICh3aWRnZXRzIGZvbGxvdyB0aGVpciBhbmNob3IgbGluZSBhcyB0aGUgZWRpdG9yIHNjcm9sbHMpLCB3aGljaCBhIGRpcmVjdGx5XG4gKiBjb25zdHJ1Y3RlZCB7QGxpbmsgQWdlbnRGZWVkYmFja0VkaXRvcldpZGdldH0gZG9lcyBub3QuXG4gKi9cbmZ1bmN0aW9uIHJlbmRlclZpYUNvbnRyaWJ1dGlvbihjb250ZXh0OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgY29kZTogc3RyaW5nLCBjb21tZW50czogcmVhZG9ubHkgSVNlc3Npb25FZGl0b3JDb21tZW50W10pOiB2b2lkIHtcblx0Y29uc3Qgc2NvcGVkRGlzcG9zYWJsZXMgPSBjb250ZXh0LmRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0Y29udGV4dC5jb250YWluZXIuc3R5bGUud2lkdGggPSAnNzYwcHgnO1xuXHRjb250ZXh0LmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnNDIwcHgnO1xuXHRjb250ZXh0LmNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYm9yZGVyKSc7XG5cdGNvbnRleHQuY29udGFpbmVyLnN0eWxlLmJhY2tncm91bmQgPSAndmFyKC0tdnNjb2RlLWVkaXRvci1iYWNrZ3JvdW5kKSc7XG5cblx0ZW5zdXJlVG9rZW5Db2xvck1hcCgpO1xuXG5cdGNvbnN0IGZlZWRiYWNrOiByZWFkb25seSBJQWdlbnRGZWVkYmFja1tdID0gY29tbWVudHMubWFwKGNvbW1lbnQgPT4gKHtcblx0XHRpZDogY29tbWVudC5zb3VyY2VJZCxcblx0XHR0ZXh0OiBjb21tZW50LnRleHQsXG5cdFx0cmVzb3VyY2VVcmk6IGNvbW1lbnQucmVzb3VyY2VVcmksXG5cdFx0cmFuZ2U6IGNvbW1lbnQucmFuZ2UsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBjb21tZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHRzdWdnZXN0aW9uOiBjb21tZW50LnN1Z2dlc3Rpb24sXG5cdFx0a2luZDogY29tbWVudC5raW5kLFxuXHRcdHJlcGxpZXM6IGNvbW1lbnQucmVwbGllcyxcblx0XHRzdGF0ZTogY29tbWVudC5zdGF0ZSA/PyBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQsXG5cdH0pKTtcblxuXHRjb25zdCBhZ2VudEZlZWRiYWNrU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50RmVlZGJhY2tTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZlZWRiYWNrID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU5hdmlnYXRpb24gPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZSA9IEV2ZW50Lk5vbmU7XG5cblx0XHRvdmVycmlkZSBnZXRTZXNzaW9uRm9yRmlsZShyZXNvdXJjZVVyaTogVVJJKTogSVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0cmV0dXJuIHJlc291cmNlVXJpLnRvU3RyaW5nKCkgPT09IGZpbGVSZXNvdXJjZS50b1N0cmluZygpID8geyByZXNvdXJjZTogc2Vzc2lvblJlc291cmNlIH0gYXMgSVNlc3Npb24gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgZ2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2UocmVzb3VyY2VVcmk6IFVSSSk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VVcmkudG9TdHJpbmcoKSA9PT0gZmlsZVJlc291cmNlLnRvU3RyaW5nKCkgPyBzZXNzaW9uUmVzb3VyY2UgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgZ2V0RmVlZGJhY2socmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IElBZ2VudEZlZWRiYWNrW10ge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpID8gZmVlZGJhY2sgOiBbXTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBnZXROYXZpZ2F0aW9uQmVhcmluZygpIHtcblx0XHRcdHJldHVybiB7IGFjdGl2ZUlkeDogLTEsIHRvdGFsQ291bnQ6IGZlZWRiYWNrLmxlbmd0aCB9O1xuXHRcdH1cblx0fSgpO1xuXG5cdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXRTZXNzaW9uKCk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9KCk7XG5cblx0Y29uc3QgY29kZVJldmlld1NlcnZpY2UgPSBjcmVhdGVNb2NrQ29kZVJldmlld1NlcnZpY2UoKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhzY29wZWREaXNwb3NhYmxlcywge1xuXHRcdGNvbG9yVGhlbWU6IGNvbnRleHQudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiByZWcgPT4ge1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEZlZWRiYWNrU2VydmljZSwgYWdlbnRGZWVkYmFja1NlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ29kZVJldmlld1NlcnZpY2UsIGNvZGVSZXZpZXdTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmUoSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBNYXJrZG93blJlbmRlcmVyU2VydmljZSk7XG5cdFx0fSxcblx0fSk7XG5cdGNvbnN0IG1vZGVsID0gc2NvcGVkRGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgY29kZSwgZmlsZVJlc291cmNlLCAndHlwZXNjcmlwdCcpKTtcblxuXHRjb25zdCBlZGl0b3IgPSBzY29wZWREaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0Q29kZUVkaXRvcldpZGdldCxcblx0XHRjb250ZXh0LmNvbnRhaW5lcixcblx0XHR7XG5cdFx0XHRhdXRvbWF0aWNMYXlvdXQ6IHRydWUsXG5cdFx0XHRsaW5lTnVtYmVyczogJ29uJyxcblx0XHRcdG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdGZvbnRTaXplOiAxMyxcblx0XHRcdGxpbmVIZWlnaHQ6IDIwLFxuXHRcdH0sXG5cdFx0eyBjb250cmlidXRpb25zOiBbXSB9XG5cdCkpO1xuXG5cdGVkaXRvci5zZXRNb2RlbChtb2RlbCk7XG5cblx0Ly8gVGhlIGNvbnRyaWJ1dGlvbiBidWlsZHMsIGdyb3VwcywgcG9zaXRpb25zIGFuZCBrZWVwcyB0aGUgd2lkZ2V0cyBpbiBzeW5jXG5cdC8vIHdpdGggZWRpdG9yIHNjcm9sbCBcdTIwMTQgZXhhY3RseSBhcyBpbiBwcm9kdWN0aW9uLlxuXHRzY29wZWREaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRGZWVkYmFja0VkaXRvcldpZGdldENvbnRyaWJ1dGlvbiwgZWRpdG9yKSk7XG59XG5cbmNvbnN0IHNpbmdsZUZlZWRiYWNrID0gW1xuXHRjcmVhdGVGZWVkYmFja0NvbW1lbnQoJ2YtMScsICdQcmVmZXIgYSBjbGVhcmVyIHZhcmlhYmxlIG5hbWUgb24gdGhpcyBsaW5lLicsIDIpLFxuXTtcblxuY29uc3QgZ3JvdXBlZEZlZWRiYWNrID0gW1xuXHRjcmVhdGVGZWVkYmFja0NvbW1lbnQoJ2YtMScsICdQcmVmZXIgYSBjbGVhcmVyIHZhcmlhYmxlIG5hbWUgb24gdGhpcyBsaW5lLicsIDIpLFxuXHRjcmVhdGVGZWVkYmFja0NvbW1lbnQoJ2YtMicsICdUaGlzIHJldHVybiBzdGF0ZW1lbnQgY2FuIGJlIHNpbXBsaWZpZWQuJywgMyksXG5cdGNyZWF0ZUZlZWRiYWNrQ29tbWVudCgnZi0zJywgJ0NvbnNpZGVyIGRvY3VtZW50aW5nIHdoeSB0aGlzIGJyYW5jaCBpcyBuZWVkZWQuJywgNiwgOCksXG5dO1xuXG5jb25zdCByZXZpZXdPbmx5ID0gW1xuXHRjcmVhdGVGZWVkYmFja0NvbW1lbnQoJ3ItMScsICdIYW5kbGUgdGhlIG51bGwgY2FzZSBiZWZvcmUgcmV0dXJuaW5nIGhlcmUuJywgNyksXG5cdGNyZWF0ZUZlZWRiYWNrQ29tbWVudCgnci0yJywgJ1RoaXMgYnJhbmNoIG5lZWRzIGEgc3Ryb25nZXIgZXhwbGFuYXRpb24uJywgOCksXG5dO1xuXG5jb25zdCBtaXhlZENvbW1lbnRzID0gW1xuXHRjcmVhdGVGZWVkYmFja0NvbW1lbnQoJ2YtMScsICdQcmVmZXIgYSBjbGVhcmVyIHZhcmlhYmxlIG5hbWUgb24gdGhpcyBsaW5lLicsIDIpLFxuXHRjcmVhdGVGZWVkYmFja0NvbW1lbnQoJ3ItMScsICdUaGlzIHNob3VsZCBiZSBleHRyYWN0ZWQgaW50byBhIGhlbHBlci4nLCAzKSxcblx0Y3JlYXRlRmVlZGJhY2tDb21tZW50KCdmLTInLCAnQ29uc2lkZXIgcmVuYW1pbmcgdGhpcyBmb3IgcmVhZGFiaWxpdHkuJywgNCksXG5dO1xuXG5jb25zdCByZXZpZXdTdWdnZXN0aW9uOiBJQ29kZVJldmlld1N1Z2dlc3Rpb24gPSB7XG5cdGVkaXRzOiBbXG5cdFx0eyByYW5nZTogY3JlYXRlUmFuZ2UoOCksIG9sZFRleHQ6ICdcXHRjb25zdCB0aGlyZCA9IHNlY29uZCArIDE7JywgbmV3VGV4dDogJ1xcdGNvbnN0IHRoaXJkID0gc2Vjb25kICsgY29tcHV0ZU9mZnNldCgpOycgfSxcblx0XSxcbn07XG5cbmNvbnN0IHN1Z2dlc3Rpb25NaXggPSBbXG5cdGNyZWF0ZUZlZWRiYWNrQ29tbWVudCgnci0zJywgJ1ByZWZlciB1c2luZyB0aGUgaGVscGVyIHNvIHRoZSBpbnRlbnQgaXMgZXhwbGljaXQuJywgOCwgOCwgcmV2aWV3U3VnZ2VzdGlvbiksXG5cdGNyZWF0ZUZlZWRiYWNrQ29tbWVudCgnZi0zJywgJ0tlZXAgdGhlIGhlbHBlciBuYW1lIGFsaWduZWQgd2l0aCB0aGUgZG9tYWluIGNvbmNlcHQuJywgOSksXG5dO1xuXG5jb25zdCBwclJldmlld09ubHkgPSBbXG5cdGNyZWF0ZVBSUmV2aWV3Q29tbWVudCgncHItMScsICdUaGlzIHZhcmlhYmxlIHNob3VsZCBiZSByZW5hbWVkIHRvIG1hdGNoIG91ciBuYW1pbmcgY29udmVudGlvbnMuJywgMiksXG5cdGNyZWF0ZVBSUmV2aWV3Q29tbWVudCgncHItMicsICdQbGVhc2UgYWRkIGVycm9yIGhhbmRsaW5nIGZvciB0aGUgZWRnZSBjYXNlIHdoZW4gc2Vjb25kIGlzIHplcm8uJywgNywgOCksXG5dO1xuXG5jb25zdCB0aHJlYWRlZEZlZWRiYWNrID0gW1xuXHRjcmVhdGVGZWVkYmFja0NvbW1lbnQoXG5cdFx0J2YtdGhyZWFkJyxcblx0XHQnQ29uc2lkZXIgZXh0cmFjdGluZyB0aGlzIGludG8gYSBoZWxwZXIgZnVuY3Rpb24uJyxcblx0XHQ3LFxuXHRcdDcsXG5cdFx0dW5kZWZpbmVkLFxuXHRcdFtcblx0XHRcdCdJIGFncmVlLCBhbmQgd2Ugc2hvdWxkIGFsc28gdW5pdCB0ZXN0IHRoZSBoZWxwZXIuJyxcblx0XHRcdCdNYWtlIHN1cmUgdGhlIGhlbHBlciBuYW1lIG1hdGNoZXMgdGhlIGRvbWFpbiBjb25jZXB0LicsXG5cdFx0XSxcblx0KSxcbl07XG5cbmNvbnN0IGFsbFNvdXJjZXNNaXhlZCA9IFtcblx0Y3JlYXRlRmVlZGJhY2tDb21tZW50KCdmLTEnLCAnUHJlZmVyIGEgY2xlYXJlciB2YXJpYWJsZSBuYW1lIG9uIHRoaXMgbGluZS4nLCAyKSxcblx0Y3JlYXRlUFJSZXZpZXdDb21tZW50KCdwci0xJywgJ091ciBzdHlsZSBndWlkZSBzYXlzIHRvIHVzZSBkZXNjcmlwdGl2ZSBuYW1lcyBoZXJlLicsIDMpLFxuXHRjcmVhdGVGZWVkYmFja0NvbW1lbnQoJ3ItMScsICdUaGlzIHNob3VsZCBiZSBleHRyYWN0ZWQgaW50byBhIGhlbHBlci4nLCA2KSxcblx0Y3JlYXRlUFJSZXZpZXdDb21tZW50KCdwci0yJywgJ1RoaXMgbG9naWMgZHVwbGljYXRlcyB3aGF0IHdlIGhhdmUgaW4gdXRpbHMudHMgXHUyMDE0IGNvbnNpZGVyIHJldXNpbmcuJywgOCwgOSksXG5dO1xuXG5jb25zdCBsb25nRmlsZUZlZWRiYWNrID0gW1xuXHRjcmVhdGVGZWVkYmFja0NvbW1lbnQoJ2xmLTEnLCAnQ29uc2lkZXIgdmFsaWRhdGluZyB0aGlzIGlucHV0IGJlZm9yZSB1c2luZyBpdC4nLCA1KSxcblx0Y3JlYXRlRmVlZGJhY2tDb21tZW50KCdsZi0yJywgJ1RoaXMgY29tcHV0YXRpb24gaXMgZHVwbGljYXRlZCBmdXJ0aGVyIGRvd24gXHUyMDE0IGV4dHJhY3QgYSBoZWxwZXIuJywgMjApLFxuXTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ3Nlc3Npb25zL2FnZW50RmVlZGJhY2svJyB9LCB7XG5cdENvbGxhcHNlZFNpbmdsZUNvbW1lbnQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyV2lkZ2V0KGNvbnRleHQsIHtcblx0XHRcdGNvbW1lbnRJdGVtczogc2luZ2xlRmVlZGJhY2ssXG5cdFx0fSksXG5cdH0pLFxuXG5cdEV4cGFuZGVkU2luZ2xlQ29tbWVudDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJXaWRnZXQoY29udGV4dCwge1xuXHRcdFx0Y29tbWVudEl0ZW1zOiBzaW5nbGVGZWVkYmFjayxcblx0XHRcdGV4cGFuZGVkOiB0cnVlLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRDb2xsYXBzZWRNdWx0aUNvbW1lbnQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyV2lkZ2V0KGNvbnRleHQsIHtcblx0XHRcdGNvbW1lbnRJdGVtczogZ3JvdXBlZEZlZWRiYWNrLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRFeHBhbmRlZE11bHRpQ29tbWVudDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJXaWRnZXQoY29udGV4dCwge1xuXHRcdFx0Y29tbWVudEl0ZW1zOiBncm91cGVkRmVlZGJhY2ssXG5cdFx0XHRleHBhbmRlZDogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0RXhwYW5kZWRGb2N1c2VkRmVlZGJhY2s6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyV2lkZ2V0KGNvbnRleHQsIHtcblx0XHRcdGNvbW1lbnRJdGVtczogZ3JvdXBlZEZlZWRiYWNrLFxuXHRcdFx0ZXhwYW5kZWQ6IHRydWUsXG5cdFx0XHRmb2N1c2VkQ29tbWVudElkOiAnYWdlbnRGZWVkYmFjazpmLTInLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRFeHBhbmRlZFJldmlld09ubHk6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyV2lkZ2V0KGNvbnRleHQsIHtcblx0XHRcdGNvbW1lbnRJdGVtczogcmV2aWV3T25seSxcblx0XHRcdGV4cGFuZGVkOiB0cnVlLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRFeHBhbmRlZE1peGVkQ29tbWVudHM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyV2lkZ2V0KGNvbnRleHQsIHtcblx0XHRcdGNvbW1lbnRJdGVtczogbWl4ZWRDb21tZW50cyxcblx0XHRcdGV4cGFuZGVkOiB0cnVlLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRFeHBhbmRlZEZvY3VzZWRSZXZpZXdDb21tZW50OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlcldpZGdldChjb250ZXh0LCB7XG5cdFx0XHRjb21tZW50SXRlbXM6IG1peGVkQ29tbWVudHMsXG5cdFx0XHRleHBhbmRlZDogdHJ1ZSxcblx0XHRcdGZvY3VzZWRDb21tZW50SWQ6ICdhZ2VudEZlZWRiYWNrOnItMScsXG5cdFx0fSksXG5cdH0pLFxuXG5cdEV4cGFuZGVkUmV2aWV3U3VnZ2VzdGlvbjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJXaWRnZXQoY29udGV4dCwge1xuXHRcdFx0Y29tbWVudEl0ZW1zOiBzdWdnZXN0aW9uTWl4LFxuXHRcdFx0ZXhwYW5kZWQ6IHRydWUsXG5cdFx0fSksXG5cdH0pLFxuXG5cdEV4cGFuZGVkUFJSZXZpZXdPbmx5OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlcldpZGdldChjb250ZXh0LCB7XG5cdFx0XHRjb21tZW50SXRlbXM6IHByUmV2aWV3T25seSxcblx0XHRcdGV4cGFuZGVkOiB0cnVlLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRFeHBhbmRlZEFsbFNvdXJjZXNNaXhlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJXaWRnZXQoY29udGV4dCwge1xuXHRcdFx0Y29tbWVudEl0ZW1zOiBhbGxTb3VyY2VzTWl4ZWQsXG5cdFx0XHRleHBhbmRlZDogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0RXhwYW5kZWRGb2N1c2VkUFJSZXZpZXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyV2lkZ2V0KGNvbnRleHQsIHtcblx0XHRcdGNvbW1lbnRJdGVtczogYWxsU291cmNlc01peGVkLFxuXHRcdFx0ZXhwYW5kZWQ6IHRydWUsXG5cdFx0XHRmb2N1c2VkQ29tbWVudElkOiAncHJSZXZpZXc6cHItMicsXG5cdFx0fSksXG5cdH0pLFxuXG5cdEV4cGFuZGVkVGhyZWFkZWRGZWVkYmFjazogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJXaWRnZXQoY29udGV4dCwge1xuXHRcdFx0Y29tbWVudEl0ZW1zOiB0aHJlYWRlZEZlZWRiYWNrLFxuXHRcdFx0ZXhwYW5kZWQ6IHRydWUsXG5cdFx0fSksXG5cdH0pLFxuXG5cdEhpZGRlbldpZGdldDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJXaWRnZXQoY29udGV4dCwge1xuXHRcdFx0Y29tbWVudEl0ZW1zOiBtaXhlZENvbW1lbnRzLFxuXHRcdFx0aGlkZGVuOiB0cnVlLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRMb25nRmlsZVR3b0NvbW1lbnRzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlclZpYUNvbnRyaWJ1dGlvbihjb250ZXh0LCBsb25nU2FtcGxlQ29kZSwgbG9uZ0ZpbGVGZWVkYmFjayksXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCLCtCQUErQjtBQUNsRSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsd0JBQWtEO0FBRTNELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsbUJBQW1CLG9CQUFvQyw2QkFBNkI7QUFDN0YsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw2Q0FBNkM7QUFDdEQsU0FBa0Msc0JBQXNCLGlCQUFpQix3QkFBd0IsZ0NBQWdDO0FBQ2pJLFNBQVMsMEJBQWlEO0FBQzFELFNBQVMsbUNBQW1DO0FBQzVDLFNBQWdDLGtDQUFrQztBQUNsRSxTQUFTLGtDQUFrQztBQUczQyxNQUFNLGtCQUFrQixJQUFJLE1BQU0sMENBQTBDO0FBQzVFLE1BQU0sZUFBZSxJQUFJLE1BQU0sMkNBQTJDO0FBRTFFLE1BQU0sYUFBYTtBQUFBLEVBQ2xCO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtB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
