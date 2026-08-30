import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { AhpSnapshotRecorder } from "./e2e/harness/ahpSnapshot.js";
suite("AhpSnapshotRecorder", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("omits tool success by provider name before snapshot normalization", () => {
    const recorder = new AhpSnapshotRecorder();
    recorder.record("s2c", {
      method: "action",
      params: {
        channel: "ahp-chat://session/chat",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tool-1",
          toolName: "bash",
          displayName: "Run command"
        }
      }
    });
    recorder.record("s2c", {
      method: "action",
      params: {
        channel: "ahp-chat://session/chat",
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tool-1",
          result: { success: false }
        }
      }
    });
    const snapshot = recorder.serialize({
      profile: "behavior",
      omitToolCallSuccessForToolNames: ["bash"]
    });
    assert.deepStrictEqual({
      normalizedToolName: snapshot.includes("toolName: ${shell}"),
      includesSuccess: snapshot.includes("success:")
    }, {
      normalizedToolName: true,
      includesSuccess: false
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhaHBTbmFwc2hvdC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IEFocFNuYXBzaG90UmVjb3JkZXIgfSBmcm9tICcuL2UyZS9oYXJuZXNzL2FocFNuYXBzaG90LmpzJztcblxuc3VpdGUoJ0FocFNuYXBzaG90UmVjb3JkZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnb21pdHMgdG9vbCBzdWNjZXNzIGJ5IHByb3ZpZGVyIG5hbWUgYmVmb3JlIHNuYXBzaG90IG5vcm1hbGl6YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVjb3JkZXIgPSBuZXcgQWhwU25hcHNob3RSZWNvcmRlcigpO1xuXHRcdHJlY29yZGVyLnJlY29yZCgnczJjJywge1xuXHRcdFx0bWV0aG9kOiAnYWN0aW9uJyxcblx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRjaGFubmVsOiAnYWhwLWNoYXQ6Ly9zZXNzaW9uL2NoYXQnLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBjb21tYW5kJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0cmVjb3JkZXIucmVjb3JkKCdzMmMnLCB7XG5cdFx0XHRtZXRob2Q6ICdhY3Rpb24nLFxuXHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdGNoYW5uZWw6ICdhaHAtY2hhdDovL3Nlc3Npb24vY2hhdCcsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgc3VjY2VzczogZmFsc2UgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzbmFwc2hvdCA9IHJlY29yZGVyLnNlcmlhbGl6ZSh7XG5cdFx0XHRwcm9maWxlOiAnYmVoYXZpb3InLFxuXHRcdFx0b21pdFRvb2xDYWxsU3VjY2Vzc0ZvclRvb2xOYW1lczogWydiYXNoJ10sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG5vcm1hbGl6ZWRUb29sTmFtZTogc25hcHNob3QuaW5jbHVkZXMoJ3Rvb2xOYW1lOiAke3NoZWxsfScpLFxuXHRcdFx0aW5jbHVkZXNTdWNjZXNzOiBzbmFwc2hvdC5pbmNsdWRlcygnc3VjY2VzczonKSxcblx0XHR9LCB7XG5cdFx0XHRub3JtYWxpemVkVG9vbE5hbWU6IHRydWUsXG5cdFx0XHRpbmNsdWRlc1N1Y2Nlc3M6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMkJBQTJCO0FBRXBDLE1BQU0sdUJBQXVCLE1BQU07QUFFbEMsMENBQXdDO0FBRXhDLE9BQUsscUVBQXFFLE1BQU07QUFDL0UsVUFBTSxXQUFXLElBQUksb0JBQW9CO0FBQ3pDLGFBQVMsT0FBTyxPQUFPO0FBQUEsTUFDdEIsUUFBUTtBQUFBLE1BQ1IsUUFBUTtBQUFBLFFBQ1AsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFVBQ1AsTUFBTSxXQUFXO0FBQUEsVUFDakIsUUFBUTtBQUFBLFVBQ1IsWUFBWTtBQUFBLFVBQ1osVUFBVTtBQUFBLFVBQ1YsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQ0QsYUFBUyxPQUFPLE9BQU87QUFBQSxNQUN0QixRQUFRO0FBQUEsTUFDUixRQUFRO0FBQUEsUUFDUCxTQUFTO0FBQUEsUUFDVCxRQUFRO0FBQUEsVUFDUCxNQUFNLFdBQVc7QUFBQSxVQUNqQixRQUFRO0FBQUEsVUFDUixZQUFZO0FBQUEsVUFDWixRQUFRLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFDMUI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxXQUFXLFNBQVMsVUFBVTtBQUFBLE1BQ25DLFNBQVM7QUFBQSxNQUNULGlDQUFpQyxDQUFDLE1BQU07QUFBQSxJQUN6QyxDQUFDO0FBRUQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixvQkFBb0IsU0FBUyxTQUFTLG9CQUFvQjtBQUFBLE1BQzFELGlCQUFpQixTQUFTLFNBQVMsVUFBVTtBQUFBLElBQzlDLEdBQUc7QUFBQSxNQUNGLG9CQUFvQjtBQUFBLE1BQ3BCLGlCQUFpQjtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
