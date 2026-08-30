import assert from "assert";
import { observableValue } from "../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { AgentHostSessionTypesAvailableContext, IsNewChatSessionContext, SessionHasWorkspaceContext } from "../../../../common/contextkeys.js";
import { createNewSessionViewV2Tour, NEW_SESSION_VIEW_V2_TOUR_ID } from "../../browser/tours/newSessionViewV2Tour.js";
import { createNewSessionViewV3Tour } from "../../browser/tours/newSessionViewV3Tour.js";
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from "../../browser/tours/newSessionTour.js";
import { createNewSessionViewTour } from "../../browser/tours/newSessionViewTour.js";
suite("NewSessionViewV2Tour", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("defines the interactive workspace, harness, and model flow", () => {
    const trigger = observableValue(disposables, false);
    const scenario = createNewSessionViewV2Tour(trigger);
    const steps = scenario.presentation.payload.steps;
    assert.deepStrictEqual({
      id: scenario.id,
      seenKey: scenario.seenKey,
      presentationKind: scenario.presentation.kind,
      priority: scenario.priority,
      experiment: scenario.experiment,
      steps: steps.map((step) => ({
        id: step.id,
        targetId: step.targetId,
        missingTarget: step.missingTarget,
        openTarget: step.openTarget,
        allowTargetInteraction: step.allowTargetInteraction,
        advanceWhenWorkspaceSelected: step.advanceWhen === SessionHasWorkspaceContext
      }))
    }, {
      id: NEW_SESSION_VIEW_V2_TOUR_ID,
      seenKey: NEW_SESSION_ONBOARDING_SEEN_KEY,
      presentationKind: "spotlight",
      priority: 110,
      experiment: {
        behaviorFlag: "onb.newSessionViewV2.show",
        assignmentContextIdFlag: "onb.newSessionViewV2.id"
      },
      steps: [
        {
          id: "workspacePicker",
          targetId: "sessions.newSession.workspacePicker",
          missingTarget: { kind: "skip" },
          openTarget: true,
          allowTargetInteraction: true,
          advanceWhenWorkspaceSelected: true
        },
        {
          id: "harnessPicker",
          targetId: "sessions.newSession.harnessPicker",
          missingTarget: { kind: "wait", timeoutMs: 5e3 },
          openTarget: false,
          allowTargetInteraction: true,
          advanceWhenWorkspaceSelected: false
        },
        {
          id: "modelPicker",
          targetId: "sessions.newSession.modelPicker",
          missingTarget: { kind: "wait", timeoutMs: 5e3 },
          openTarget: true,
          allowTargetInteraction: true,
          advanceWhenWorkspaceSelected: false
        }
      ]
    });
  });
  test("requires the new-session view for both view tours", () => {
    const trigger = observableValue(disposables, false);
    const scenarios = [createNewSessionViewTour(trigger), createNewSessionViewV2Tour(trigger)];
    assert.deepStrictEqual(
      scenarios.map((scenario) => scenario.when?.keys().includes(IsNewChatSessionContext.key)),
      [true, true]
    );
  });
  test("waits for an agent-host provider before running V2 or V3", () => {
    const trigger = observableValue(disposables, false);
    const scenarios = [createNewSessionViewV2Tour(trigger), createNewSessionViewV3Tour(trigger, () => true)];
    assert.deepStrictEqual(
      scenarios.map((scenario) => scenario.when?.keys().includes(AgentHostSessionTypesAvailableContext.key)),
      [true, true]
    );
  });
  test("keeps picker targets interactive in both view tours", () => {
    const trigger = observableValue(disposables, false);
    const scenarios = [createNewSessionViewTour(trigger), createNewSessionViewV2Tour(trigger)];
    assert.deepStrictEqual(
      scenarios.map((scenario) => scenario.presentation.payload.steps.map((step) => step.allowTargetInteraction)),
      [[true, true, true], [true, true, true]]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcb25ib2FyZGluZ1RvdXJzXFx0ZXN0XFxicm93c2VyXFxuZXdTZXNzaW9uVmlld1YyVG91ci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25UeXBlc0F2YWlsYWJsZUNvbnRleHQsIElzTmV3Q2hhdFNlc3Npb25Db250ZXh0LCBTZXNzaW9uSGFzV29ya3NwYWNlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOZXdTZXNzaW9uVmlld1YyVG91ciwgTkVXX1NFU1NJT05fVklFV19WMl9UT1VSX0lEIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b3Vycy9uZXdTZXNzaW9uVmlld1YyVG91ci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOZXdTZXNzaW9uVmlld1YzVG91ciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG91cnMvbmV3U2Vzc2lvblZpZXdWM1RvdXIuanMnO1xuaW1wb3J0IHsgTkVXX1NFU1NJT05fT05CT0FSRElOR19TRUVOX0tFWSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG91cnMvbmV3U2Vzc2lvblRvdXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTmV3U2Vzc2lvblZpZXdUb3VyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b3Vycy9uZXdTZXNzaW9uVmlld1RvdXIuanMnO1xuXG5zdWl0ZSgnTmV3U2Vzc2lvblZpZXdWMlRvdXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkZWZpbmVzIHRoZSBpbnRlcmFjdGl2ZSB3b3Jrc3BhY2UsIGhhcm5lc3MsIGFuZCBtb2RlbCBmbG93JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oZGlzcG9zYWJsZXMsIGZhbHNlKTtcblx0XHRjb25zdCBzY2VuYXJpbyA9IGNyZWF0ZU5ld1Nlc3Npb25WaWV3VjJUb3VyKHRyaWdnZXIpO1xuXHRcdGNvbnN0IHN0ZXBzID0gc2NlbmFyaW8ucHJlc2VudGF0aW9uLnBheWxvYWQuc3RlcHM7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlkOiBzY2VuYXJpby5pZCxcblx0XHRcdHNlZW5LZXk6IHNjZW5hcmlvLnNlZW5LZXksXG5cdFx0XHRwcmVzZW50YXRpb25LaW5kOiBzY2VuYXJpby5wcmVzZW50YXRpb24ua2luZCxcblx0XHRcdHByaW9yaXR5OiBzY2VuYXJpby5wcmlvcml0eSxcblx0XHRcdGV4cGVyaW1lbnQ6IHNjZW5hcmlvLmV4cGVyaW1lbnQsXG5cdFx0XHRzdGVwczogc3RlcHMubWFwKHN0ZXAgPT4gKHtcblx0XHRcdFx0aWQ6IHN0ZXAuaWQsXG5cdFx0XHRcdHRhcmdldElkOiBzdGVwLnRhcmdldElkLFxuXHRcdFx0XHRtaXNzaW5nVGFyZ2V0OiBzdGVwLm1pc3NpbmdUYXJnZXQsXG5cdFx0XHRcdG9wZW5UYXJnZXQ6IHN0ZXAub3BlblRhcmdldCxcblx0XHRcdFx0YWxsb3dUYXJnZXRJbnRlcmFjdGlvbjogc3RlcC5hbGxvd1RhcmdldEludGVyYWN0aW9uLFxuXHRcdFx0XHRhZHZhbmNlV2hlbldvcmtzcGFjZVNlbGVjdGVkOiBzdGVwLmFkdmFuY2VXaGVuID09PSBTZXNzaW9uSGFzV29ya3NwYWNlQ29udGV4dCxcblx0XHRcdH0pKSxcblx0XHR9LCB7XG5cdFx0XHRpZDogTkVXX1NFU1NJT05fVklFV19WMl9UT1VSX0lELFxuXHRcdFx0c2VlbktleTogTkVXX1NFU1NJT05fT05CT0FSRElOR19TRUVOX0tFWSxcblx0XHRcdHByZXNlbnRhdGlvbktpbmQ6ICdzcG90bGlnaHQnLFxuXHRcdFx0cHJpb3JpdHk6IDExMCxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0YmVoYXZpb3JGbGFnOiAnb25iLm5ld1Nlc3Npb25WaWV3VjIuc2hvdycsXG5cdFx0XHRcdGFzc2lnbm1lbnRDb250ZXh0SWRGbGFnOiAnb25iLm5ld1Nlc3Npb25WaWV3VjIuaWQnLFxuXHRcdFx0fSxcblx0XHRcdHN0ZXBzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3dvcmtzcGFjZVBpY2tlcicsXG5cdFx0XHRcdFx0dGFyZ2V0SWQ6ICdzZXNzaW9ucy5uZXdTZXNzaW9uLndvcmtzcGFjZVBpY2tlcicsXG5cdFx0XHRcdFx0bWlzc2luZ1RhcmdldDogeyBraW5kOiAnc2tpcCcgfSxcblx0XHRcdFx0XHRvcGVuVGFyZ2V0OiB0cnVlLFxuXHRcdFx0XHRcdGFsbG93VGFyZ2V0SW50ZXJhY3Rpb246IHRydWUsXG5cdFx0XHRcdFx0YWR2YW5jZVdoZW5Xb3Jrc3BhY2VTZWxlY3RlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnaGFybmVzc1BpY2tlcicsXG5cdFx0XHRcdFx0dGFyZ2V0SWQ6ICdzZXNzaW9ucy5uZXdTZXNzaW9uLmhhcm5lc3NQaWNrZXInLFxuXHRcdFx0XHRcdG1pc3NpbmdUYXJnZXQ6IHsga2luZDogJ3dhaXQnLCB0aW1lb3V0TXM6IDVfMDAwIH0sXG5cdFx0XHRcdFx0b3BlblRhcmdldDogZmFsc2UsXG5cdFx0XHRcdFx0YWxsb3dUYXJnZXRJbnRlcmFjdGlvbjogdHJ1ZSxcblx0XHRcdFx0XHRhZHZhbmNlV2hlbldvcmtzcGFjZVNlbGVjdGVkOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnbW9kZWxQaWNrZXInLFxuXHRcdFx0XHRcdHRhcmdldElkOiAnc2Vzc2lvbnMubmV3U2Vzc2lvbi5tb2RlbFBpY2tlcicsXG5cdFx0XHRcdFx0bWlzc2luZ1RhcmdldDogeyBraW5kOiAnd2FpdCcsIHRpbWVvdXRNczogNV8wMDAgfSxcblx0XHRcdFx0XHRvcGVuVGFyZ2V0OiB0cnVlLFxuXHRcdFx0XHRcdGFsbG93VGFyZ2V0SW50ZXJhY3Rpb246IHRydWUsXG5cdFx0XHRcdFx0YWR2YW5jZVdoZW5Xb3Jrc3BhY2VTZWxlY3RlZDogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1aXJlcyB0aGUgbmV3LXNlc3Npb24gdmlldyBmb3IgYm90aCB2aWV3IHRvdXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oZGlzcG9zYWJsZXMsIGZhbHNlKTtcblx0XHRjb25zdCBzY2VuYXJpb3MgPSBbY3JlYXRlTmV3U2Vzc2lvblZpZXdUb3VyKHRyaWdnZXIpLCBjcmVhdGVOZXdTZXNzaW9uVmlld1YyVG91cih0cmlnZ2VyKV07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c2NlbmFyaW9zLm1hcChzY2VuYXJpbyA9PiBzY2VuYXJpby53aGVuPy5rZXlzKCkuaW5jbHVkZXMoSXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQua2V5KSksXG5cdFx0XHRbdHJ1ZSwgdHJ1ZV0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnd2FpdHMgZm9yIGFuIGFnZW50LWhvc3QgcHJvdmlkZXIgYmVmb3JlIHJ1bm5pbmcgVjIgb3IgVjMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHJpZ2dlciA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPihkaXNwb3NhYmxlcywgZmFsc2UpO1xuXHRcdGNvbnN0IHNjZW5hcmlvcyA9IFtjcmVhdGVOZXdTZXNzaW9uVmlld1YyVG91cih0cmlnZ2VyKSwgY3JlYXRlTmV3U2Vzc2lvblZpZXdWM1RvdXIodHJpZ2dlciwgKCkgPT4gdHJ1ZSldO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNjZW5hcmlvcy5tYXAoc2NlbmFyaW8gPT4gc2NlbmFyaW8ud2hlbj8ua2V5cygpLmluY2x1ZGVzKEFnZW50SG9zdFNlc3Npb25UeXBlc0F2YWlsYWJsZUNvbnRleHQua2V5KSksXG5cdFx0XHRbdHJ1ZSwgdHJ1ZV0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgcGlja2VyIHRhcmdldHMgaW50ZXJhY3RpdmUgaW4gYm90aCB2aWV3IHRvdXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oZGlzcG9zYWJsZXMsIGZhbHNlKTtcblx0XHRjb25zdCBzY2VuYXJpb3MgPSBbY3JlYXRlTmV3U2Vzc2lvblZpZXdUb3VyKHRyaWdnZXIpLCBjcmVhdGVOZXdTZXNzaW9uVmlld1YyVG91cih0cmlnZ2VyKV07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c2NlbmFyaW9zLm1hcChzY2VuYXJpbyA9PiBzY2VuYXJpby5wcmVzZW50YXRpb24ucGF5bG9hZC5zdGVwcy5tYXAoc3RlcCA9PiBzdGVwLmFsbG93VGFyZ2V0SW50ZXJhY3Rpb24pKSxcblx0XHRcdFtbdHJ1ZSwgdHJ1ZSwgdHJ1ZV0sIFt0cnVlLCB0cnVlLCB0cnVlXV0sXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVDQUF1Qyx5QkFBeUIsa0NBQWtDO0FBQzNHLFNBQVMsNEJBQTRCLG1DQUFtQztBQUN4RSxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGdDQUFnQztBQUV6QyxNQUFNLHdCQUF3QixNQUFNO0FBRW5DLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLFVBQVUsZ0JBQXlCLGFBQWEsS0FBSztBQUMzRCxVQUFNLFdBQVcsMkJBQTJCLE9BQU87QUFDbkQsVUFBTSxRQUFRLFNBQVMsYUFBYSxRQUFRO0FBRTVDLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsSUFBSSxTQUFTO0FBQUEsTUFDYixTQUFTLFNBQVM7QUFBQSxNQUNsQixrQkFBa0IsU0FBUyxhQUFhO0FBQUEsTUFDeEMsVUFBVSxTQUFTO0FBQUEsTUFDbkIsWUFBWSxTQUFTO0FBQUEsTUFDckIsT0FBTyxNQUFNLElBQUksV0FBUztBQUFBLFFBQ3pCLElBQUksS0FBSztBQUFBLFFBQ1QsVUFBVSxLQUFLO0FBQUEsUUFDZixlQUFlLEtBQUs7QUFBQSxRQUNwQixZQUFZLEtBQUs7QUFBQSxRQUNqQix3QkFBd0IsS0FBSztBQUFBLFFBQzdCLDhCQUE4QixLQUFLLGdCQUFnQjtBQUFBLE1BQ3BELEVBQUU7QUFBQSxJQUNILEdBQUc7QUFBQSxNQUNGLElBQUk7QUFBQSxNQUNKLFNBQVM7QUFBQSxNQUNULGtCQUFrQjtBQUFBLE1BQ2xCLFVBQVU7QUFBQSxNQUNWLFlBQVk7QUFBQSxRQUNYLGNBQWM7QUFBQSxRQUNkLHlCQUF5QjtBQUFBLE1BQzFCO0FBQUEsTUFDQSxPQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osVUFBVTtBQUFBLFVBQ1YsZUFBZSxFQUFFLE1BQU0sT0FBTztBQUFBLFVBQzlCLFlBQVk7QUFBQSxVQUNaLHdCQUF3QjtBQUFBLFVBQ3hCLDhCQUE4QjtBQUFBLFFBQy9CO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osVUFBVTtBQUFBLFVBQ1YsZUFBZSxFQUFFLE1BQU0sUUFBUSxXQUFXLElBQU07QUFBQSxVQUNoRCxZQUFZO0FBQUEsVUFDWix3QkFBd0I7QUFBQSxVQUN4Qiw4QkFBOEI7QUFBQSxRQUMvQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLFVBQVU7QUFBQSxVQUNWLGVBQWUsRUFBRSxNQUFNLFFBQVEsV0FBVyxJQUFNO0FBQUEsVUFDaEQsWUFBWTtBQUFBLFVBQ1osd0JBQXdCO0FBQUEsVUFDeEIsOEJBQThCO0FBQUEsUUFDL0I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxVQUFNLFVBQVUsZ0JBQXlCLGFBQWEsS0FBSztBQUMzRCxVQUFNLFlBQVksQ0FBQyx5QkFBeUIsT0FBTyxHQUFHLDJCQUEyQixPQUFPLENBQUM7QUFFekYsV0FBTztBQUFBLE1BQ04sVUFBVSxJQUFJLGNBQVksU0FBUyxNQUFNLEtBQUssRUFBRSxTQUFTLHdCQUF3QixHQUFHLENBQUM7QUFBQSxNQUNyRixDQUFDLE1BQU0sSUFBSTtBQUFBLElBQ1o7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFVBQU0sVUFBVSxnQkFBeUIsYUFBYSxLQUFLO0FBQzNELFVBQU0sWUFBWSxDQUFDLDJCQUEyQixPQUFPLEdBQUcsMkJBQTJCLFNBQVMsTUFBTSxJQUFJLENBQUM7QUFFdkcsV0FBTztBQUFBLE1BQ04sVUFBVSxJQUFJLGNBQVksU0FBUyxNQUFNLEtBQUssRUFBRSxTQUFTLHNDQUFzQyxHQUFHLENBQUM7QUFBQSxNQUNuRyxDQUFDLE1BQU0sSUFBSTtBQUFBLElBQ1o7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFVBQU0sVUFBVSxnQkFBeUIsYUFBYSxLQUFLO0FBQzNELFVBQU0sWUFBWSxDQUFDLHlCQUF5QixPQUFPLEdBQUcsMkJBQTJCLE9BQU8sQ0FBQztBQUV6RixXQUFPO0FBQUEsTUFDTixVQUFVLElBQUksY0FBWSxTQUFTLGFBQWEsUUFBUSxNQUFNLElBQUksVUFBUSxLQUFLLHNCQUFzQixDQUFDO0FBQUEsTUFDdEcsQ0FBQyxDQUFDLE1BQU0sTUFBTSxJQUFJLEdBQUcsQ0FBQyxNQUFNLE1BQU0sSUFBSSxDQUFDO0FBQUEsSUFDeEM7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
