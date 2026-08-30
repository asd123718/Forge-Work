import assert from "assert";
import { Event } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { AgentEditorCommentsBridge } from "../../../../../workbench/services/agentEditorComments/common/agentEditorComments.js";
import { AgentEditorCommentsProviderContribution } from "../../browser/agentEditorCommentsProvider.js";
import { AgentFeedbackKind, AgentFeedbackState } from "../../browser/agentFeedbackService.js";
suite("AgentEditorCommentsProviderContribution", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("related plan feedback includes only accepted agent feedback", () => {
    const planUri = URI.parse("file:///plan.md");
    const relatedUri = URI.parse("file:///related.ts");
    const sessionResource = URI.parse("test://session/1");
    const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 };
    const feedbackService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeFeedback = Event.None;
        this.onDidChangeFeedbackScope = Event.None;
        this.onDidRevealSessionComment = Event.None;
      }
      getFeedbackSessionResource() {
        return sessionResource;
      }
      getFeedback() {
        return [
          { id: "accepted", text: "Accepted", resourceUri: planUri, range, sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted },
          { id: "submitted", text: "Submitted", resourceUri: relatedUri, range, sessionResource, kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Submitted },
          { id: "created", text: "Created", resourceUri: relatedUri, range, sessionResource, kind: AgentFeedbackKind.AgentReview, state: AgentFeedbackState.Created }
        ];
      }
    }();
    const planReviewFeedbackService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangePlanReviewScope = Event.None;
      }
    }();
    const bridge = store.add(new AgentEditorCommentsBridge());
    store.add(new AgentEditorCommentsProviderContribution(feedbackService, planReviewFeedbackService, bridge));
    assert.deepStrictEqual(
      {
        visible: bridge.getComments(planUri, true).map((comment) => comment.body),
        allIds: bridge.getCommentIds(planUri, true)
      },
      {
        visible: ["Accepted"],
        allIds: [
          "agentFeedback:accepted",
          "agentFeedback:created",
          "agentFeedback:submitted"
        ]
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcdGVzdFxcYnJvd3NlclxcYWdlbnRFZGl0b3JDb21tZW50c1Byb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvcGxhblJldmlld0ZlZWRiYWNrL3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hZ2VudEVkaXRvckNvbW1lbnRzL2NvbW1vbi9hZ2VudEVkaXRvckNvbW1lbnRzLmpzJztcbmltcG9ydCB7IEFnZW50RWRpdG9yQ29tbWVudHNQcm92aWRlckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRFZGl0b3JDb21tZW50c1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tLaW5kLCBBZ2VudEZlZWRiYWNrU3RhdGUsIElBZ2VudEZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnQWdlbnRFZGl0b3JDb21tZW50c1Byb3ZpZGVyQ29udHJpYnV0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlbGF0ZWQgcGxhbiBmZWVkYmFjayBpbmNsdWRlcyBvbmx5IGFjY2VwdGVkIGFnZW50IGZlZWRiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGxhbi5tZCcpO1xuXHRcdGNvbnN0IHJlbGF0ZWRVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcmVsYXRlZC50cycpO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vMScpO1xuXHRcdGNvbnN0IHJhbmdlID0geyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDIgfTtcblx0XHRjb25zdCBmZWVkYmFja1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEZlZWRiYWNrU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZlZWRiYWNrID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFJldmVhbFNlc3Npb25Db21tZW50ID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKCk6IFVSSSB7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXRGZWVkYmFjaygpIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHR7IGlkOiAnYWNjZXB0ZWQnLCB0ZXh0OiAnQWNjZXB0ZWQnLCByZXNvdXJjZVVyaTogcGxhblVyaSwgcmFuZ2UsIHNlc3Npb25SZXNvdXJjZSwga2luZDogQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldywgc3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCB9LFxuXHRcdFx0XHRcdHsgaWQ6ICdzdWJtaXR0ZWQnLCB0ZXh0OiAnU3VibWl0dGVkJywgcmVzb3VyY2VVcmk6IHJlbGF0ZWRVcmksIHJhbmdlLCBzZXNzaW9uUmVzb3VyY2UsIGtpbmQ6IEFnZW50RmVlZGJhY2tLaW5kLlVzZXJSZXZpZXcsIHN0YXRlOiBBZ2VudEZlZWRiYWNrU3RhdGUuU3VibWl0dGVkIH0sXG5cdFx0XHRcdFx0eyBpZDogJ2NyZWF0ZWQnLCB0ZXh0OiAnQ3JlYXRlZCcsIHJlc291cmNlVXJpOiByZWxhdGVkVXJpLCByYW5nZSwgc2Vzc2lvblJlc291cmNlLCBraW5kOiBBZ2VudEZlZWRiYWNrS2luZC5BZ2VudFJldmlldywgc3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5DcmVhdGVkIH0sXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGxhblJldmlld1Njb3BlID0gRXZlbnQuTm9uZTtcblx0XHR9KCk7XG5cdFx0Y29uc3QgYnJpZGdlID0gc3RvcmUuYWRkKG5ldyBBZ2VudEVkaXRvckNvbW1lbnRzQnJpZGdlKCkpO1xuXHRcdHN0b3JlLmFkZChuZXcgQWdlbnRFZGl0b3JDb21tZW50c1Byb3ZpZGVyQ29udHJpYnV0aW9uKGZlZWRiYWNrU2VydmljZSwgcGxhblJldmlld0ZlZWRiYWNrU2VydmljZSwgYnJpZGdlKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHR2aXNpYmxlOiBicmlkZ2UuZ2V0Q29tbWVudHMocGxhblVyaSwgdHJ1ZSkubWFwKGNvbW1lbnQgPT4gY29tbWVudC5ib2R5KSxcblx0XHRcdFx0YWxsSWRzOiBicmlkZ2UuZ2V0Q29tbWVudElkcyhwbGFuVXJpLCB0cnVlKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHZpc2libGU6IFsnQWNjZXB0ZWQnXSxcblx0XHRcdFx0YWxsSWRzOiBbXG5cdFx0XHRcdFx0J2FnZW50RmVlZGJhY2s6YWNjZXB0ZWQnLFxuXHRcdFx0XHRcdCdhZ2VudEZlZWRiYWNrOmNyZWF0ZWQnLFxuXHRcdFx0XHRcdCdhZ2VudEZlZWRiYWNrOnN1Ym1pdHRlZCcsXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUIsMEJBQWlEO0FBRTdFLE1BQU0sMkNBQTJDLE1BQU07QUFDdEQsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFVBQU0sVUFBVSxJQUFJLE1BQU0saUJBQWlCO0FBQzNDLFVBQU0sYUFBYSxJQUFJLE1BQU0sb0JBQW9CO0FBQ2pELFVBQU0sa0JBQWtCLElBQUksTUFBTSxrQkFBa0I7QUFDcEQsVUFBTSxRQUFRLEVBQUUsaUJBQWlCLEdBQUcsYUFBYSxHQUFHLGVBQWUsR0FBRyxXQUFXLEVBQUU7QUFDbkYsVUFBTSxrQkFBa0IsSUFBSSxjQUFjLEtBQTRCLEVBQUU7QUFBQSxNQUE1QztBQUFBO0FBQzNCLGFBQWtCLHNCQUFzQixNQUFNO0FBQzlDLGFBQWtCLDJCQUEyQixNQUFNO0FBQ25ELGFBQWtCLDRCQUE0QixNQUFNO0FBQUE7QUFBQSxNQUMzQyw2QkFBa0M7QUFDMUMsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNTLGNBQWM7QUFDdEIsZUFBTztBQUFBLFVBQ04sRUFBRSxJQUFJLFlBQVksTUFBTSxZQUFZLGFBQWEsU0FBUyxPQUFPLGlCQUFpQixNQUFNLGtCQUFrQixZQUFZLE9BQU8sbUJBQW1CLFNBQVM7QUFBQSxVQUN6SixFQUFFLElBQUksYUFBYSxNQUFNLGFBQWEsYUFBYSxZQUFZLE9BQU8saUJBQWlCLE1BQU0sa0JBQWtCLFlBQVksT0FBTyxtQkFBbUIsVUFBVTtBQUFBLFVBQy9KLEVBQUUsSUFBSSxXQUFXLE1BQU0sV0FBVyxhQUFhLFlBQVksT0FBTyxpQkFBaUIsTUFBTSxrQkFBa0IsYUFBYSxPQUFPLG1CQUFtQixRQUFRO0FBQUEsUUFDM0o7QUFBQSxNQUNEO0FBQUEsSUFDRCxFQUFFO0FBQ0YsVUFBTSw0QkFBNEIsSUFBSSxjQUFjLEtBQWlDLEVBQUU7QUFBQSxNQUFqRDtBQUFBO0FBQ3JDLGFBQWtCLDZCQUE2QixNQUFNO0FBQUE7QUFBQSxJQUN0RCxFQUFFO0FBQ0YsVUFBTSxTQUFTLE1BQU0sSUFBSSxJQUFJLDBCQUEwQixDQUFDO0FBQ3hELFVBQU0sSUFBSSxJQUFJLHdDQUF3QyxpQkFBaUIsMkJBQTJCLE1BQU0sQ0FBQztBQUV6RyxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsU0FBUyxPQUFPLFlBQVksU0FBUyxJQUFJLEVBQUUsSUFBSSxhQUFXLFFBQVEsSUFBSTtBQUFBLFFBQ3RFLFFBQVEsT0FBTyxjQUFjLFNBQVMsSUFBSTtBQUFBLE1BQzNDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsU0FBUyxDQUFDLFVBQVU7QUFBQSxRQUNwQixRQUFRO0FBQUEsVUFDUDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
