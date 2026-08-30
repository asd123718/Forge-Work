import assert from "assert";
import { getCleanPromptName, isPromptOrInstructionsFile } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { URI } from "../../../../../../../base/common/uri.js";
suite("Prompt Constants", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getCleanPromptName", () => {
    test("returns a clean prompt name", () => {
      assert.strictEqual(
        getCleanPromptName(URI.file("/path/to/my-prompt.prompt.md")),
        "my-prompt"
      );
      assert.strictEqual(
        getCleanPromptName(URI.file("../common.prompt.md")),
        "common"
      );
      const expectedPromptName = `some-3095`;
      assert.strictEqual(
        getCleanPromptName(URI.file(`./${expectedPromptName}.prompt.md`)),
        expectedPromptName
      );
      assert.strictEqual(
        getCleanPromptName(URI.file(".github/copilot-instructions.md")),
        "copilot-instructions"
      );
      assert.strictEqual(
        getCleanPromptName(URI.file("/etc/prompts/my-prompt")),
        "my-prompt"
      );
      assert.strictEqual(
        getCleanPromptName(URI.file("../some-folder/frequent.txt")),
        "frequent.txt"
      );
      assert.strictEqual(
        getCleanPromptName(URI.parse("untitled:Untitled-1")),
        "Untitled-1"
      );
    });
  });
  suite("isPromptOrInstructionsFile", () => {
    test("returns `true` for prompt files", () => {
      assert(
        isPromptOrInstructionsFile(URI.file("/path/to/my-prompt.prompt.md"))
      );
      assert(
        isPromptOrInstructionsFile(URI.file("../common.prompt.md"))
      );
      assert(
        isPromptOrInstructionsFile(URI.file(`./some-38294.prompt.md`))
      );
      assert(
        isPromptOrInstructionsFile(URI.file(".github/copilot-instructions.md"))
      );
    });
    test("returns `false` for non-prompt files", () => {
      assert(
        !isPromptOrInstructionsFile(URI.file("/path/to/my-prompt.prompt.md1"))
      );
      assert(
        !isPromptOrInstructionsFile(URI.file("../common.md"))
      );
      assert(
        !isPromptOrInstructionsFile(URI.file(`./some-2530.txt`))
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFxjb25maWdcXGNvbnN0YW50cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZ2V0Q2xlYW5Qcm9tcHROYW1lLCBpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5cbnN1aXRlKCdQcm9tcHQgQ29uc3RhbnRzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnZ2V0Q2xlYW5Qcm9tcHROYW1lJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgYSBjbGVhbiBwcm9tcHQgbmFtZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0Q2xlYW5Qcm9tcHROYW1lKFVSSS5maWxlKCcvcGF0aC90by9teS1wcm9tcHQucHJvbXB0Lm1kJykpLFxuXHRcdFx0XHQnbXktcHJvbXB0Jyxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0Q2xlYW5Qcm9tcHROYW1lKFVSSS5maWxlKCcuLi9jb21tb24ucHJvbXB0Lm1kJykpLFxuXHRcdFx0XHQnY29tbW9uJyxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGV4cGVjdGVkUHJvbXB0TmFtZSA9IGBzb21lLTMwOTVgO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRDbGVhblByb21wdE5hbWUoVVJJLmZpbGUoYC4vJHtleHBlY3RlZFByb21wdE5hbWV9LnByb21wdC5tZGApKSxcblx0XHRcdFx0ZXhwZWN0ZWRQcm9tcHROYW1lLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRDbGVhblByb21wdE5hbWUoVVJJLmZpbGUoJy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnKSksXG5cdFx0XHRcdCdjb3BpbG90LWluc3RydWN0aW9ucycsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldENsZWFuUHJvbXB0TmFtZShVUkkuZmlsZSgnL2V0Yy9wcm9tcHRzL215LXByb21wdCcpKSxcblx0XHRcdFx0J215LXByb21wdCcsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldENsZWFuUHJvbXB0TmFtZShVUkkuZmlsZSgnLi4vc29tZS1mb2xkZXIvZnJlcXVlbnQudHh0JykpLFxuXHRcdFx0XHQnZnJlcXVlbnQudHh0Jyxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0Q2xlYW5Qcm9tcHROYW1lKFVSSS5wYXJzZSgndW50aXRsZWQ6VW50aXRsZWQtMScpKSxcblx0XHRcdFx0J1VudGl0bGVkLTEnLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgYHRydWVgIGZvciBwcm9tcHQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQoXG5cdFx0XHRcdGlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlKFVSSS5maWxlKCcvcGF0aC90by9teS1wcm9tcHQucHJvbXB0Lm1kJykpLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnLi4vY29tbW9uLnByb21wdC5tZCcpKSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydChcblx0XHRcdFx0aXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUoVVJJLmZpbGUoYC4vc29tZS0zODI5NC5wcm9tcHQubWRgKSksXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQoXG5cdFx0XHRcdGlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlKFVSSS5maWxlKCcuZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJykpLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgYGZhbHNlYCBmb3Igbm9uLXByb21wdCBmaWxlcycsICgpID0+IHtcblx0XHRcdGFzc2VydChcblx0XHRcdFx0IWlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlKFVSSS5maWxlKCcvcGF0aC90by9teS1wcm9tcHQucHJvbXB0Lm1kMScpKSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydChcblx0XHRcdFx0IWlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlKFVSSS5maWxlKCcuLi9jb21tb24ubWQnKSksXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQoXG5cdFx0XHRcdCFpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZShgLi9zb21lLTI1MzAudHh0YCkpLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG9CQUFvQixrQ0FBa0M7QUFDL0QsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxXQUFXO0FBR3BCLE1BQU0sb0JBQW9CLE1BQU07QUFDL0IsMENBQXdDO0FBRXhDLFFBQU0sc0JBQXNCLE1BQU07QUFDakMsU0FBSywrQkFBK0IsTUFBTTtBQUN6QyxhQUFPO0FBQUEsUUFDTixtQkFBbUIsSUFBSSxLQUFLLDhCQUE4QixDQUFDO0FBQUEsUUFDM0Q7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLFFBQ04sbUJBQW1CLElBQUksS0FBSyxxQkFBcUIsQ0FBQztBQUFBLFFBQ2xEO0FBQUEsTUFDRDtBQUVBLFlBQU0scUJBQXFCO0FBQzNCLGFBQU87QUFBQSxRQUNOLG1CQUFtQixJQUFJLEtBQUssS0FBSyxrQkFBa0IsWUFBWSxDQUFDO0FBQUEsUUFDaEU7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLFFBQ04sbUJBQW1CLElBQUksS0FBSyxpQ0FBaUMsQ0FBQztBQUFBLFFBQzlEO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxRQUNOLG1CQUFtQixJQUFJLEtBQUssd0JBQXdCLENBQUM7QUFBQSxRQUNyRDtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsUUFDTixtQkFBbUIsSUFBSSxLQUFLLDZCQUE2QixDQUFDO0FBQUEsUUFDMUQ7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLFFBQ04sbUJBQW1CLElBQUksTUFBTSxxQkFBcUIsQ0FBQztBQUFBLFFBQ25EO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sOEJBQThCLE1BQU07QUFDekMsU0FBSyxtQ0FBbUMsTUFBTTtBQUM3QztBQUFBLFFBQ0MsMkJBQTJCLElBQUksS0FBSyw4QkFBOEIsQ0FBQztBQUFBLE1BQ3BFO0FBRUE7QUFBQSxRQUNDLDJCQUEyQixJQUFJLEtBQUsscUJBQXFCLENBQUM7QUFBQSxNQUMzRDtBQUVBO0FBQUEsUUFDQywyQkFBMkIsSUFBSSxLQUFLLHdCQUF3QixDQUFDO0FBQUEsTUFDOUQ7QUFFQTtBQUFBLFFBQ0MsMkJBQTJCLElBQUksS0FBSyxpQ0FBaUMsQ0FBQztBQUFBLE1BQ3ZFO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx3Q0FBd0MsTUFBTTtBQUNsRDtBQUFBLFFBQ0MsQ0FBQywyQkFBMkIsSUFBSSxLQUFLLCtCQUErQixDQUFDO0FBQUEsTUFDdEU7QUFFQTtBQUFBLFFBQ0MsQ0FBQywyQkFBMkIsSUFBSSxLQUFLLGNBQWMsQ0FBQztBQUFBLE1BQ3JEO0FBRUE7QUFBQSxRQUNDLENBQUMsMkJBQTJCLElBQUksS0FBSyxpQkFBaUIsQ0FBQztBQUFBLE1BQ3hEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
