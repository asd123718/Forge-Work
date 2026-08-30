import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { withTestCodeEditor } from "../../../../../editor/test/browser/testCodeEditor.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { PromptTemplatePlaceholderController, REPLACE_PROMPT_TEMPLATE_PLACEHOLDER_COMMAND_ID } from "../../browser/promptTemplatePlaceholder.js";
suite("PromptTemplatePlaceholderController", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("highlights a late-inserted placeholder and replaces it at the clicked position", () => {
    withTestCodeEditor("", {}, (editor) => {
      const disposables = new DisposableStore();
      try {
        let beforeReplaceCount = 0;
        const placeholder = "[describe the coding task]";
        const partialPrompt = `Help me complete ${placeholder}`;
        const prompt = `${partialPrompt} in this project. First, inspect the relevant files.`;
        const controller = disposables.add(new PromptTemplatePlaceholderController(editor, () => {
          beforeReplaceCount++;
          editor.setValue(prompt);
        }));
        controller.setPlaceholder(placeholder);
        editor.setValue(partialPrompt);
        const placeholderOffset = prompt.indexOf(placeholder);
        const decorationsBefore = editor.getModel().getAllDecorations().filter((decoration) => decoration.options.inlineClassName === "sessions-prompt-template-placeholder").map((decoration) => decoration.range.toString());
        const ignoredOutside = controller.replaceAt(new Position(1, 1));
        const replaced = controller.replaceAt(new Position(1, placeholderOffset + 2));
        const decorationsAfter = editor.getModel().getAllDecorations().filter((decoration) => decoration.options.inlineClassName === "sessions-prompt-template-placeholder");
        assert.deepStrictEqual({
          decorationsBefore,
          ignoredOutside,
          replaced,
          beforeReplaceCount,
          value: editor.getValue(),
          position: editor.getPosition(),
          decorationsAfter: decorationsAfter.length
        }, {
          decorationsBefore: [`[1,${placeholderOffset + 1} -> 1,${placeholderOffset + placeholder.length + 1}]`],
          ignoredOutside: false,
          replaced: true,
          beforeReplaceCount: 1,
          value: "Help me complete  in this project. First, inspect the relevant files.",
          position: new Position(1, placeholderOffset + 1),
          decorationsAfter: 0
        });
      } finally {
        disposables.dispose();
      }
    });
  });
  test("replaces the placeholder through the Enter command when the caret is inside", () => {
    withTestCodeEditor("Help me complete [describe the coding task] in this project.", {}, (editor) => {
      const disposables = new DisposableStore();
      try {
        const placeholder = "[describe the coding task]";
        const controller = disposables.add(new PromptTemplatePlaceholderController(editor, () => void 0));
        controller.setPlaceholder(placeholder);
        const placeholderOffset = editor.getValue().indexOf(placeholder);
        editor.setPosition(new Position(1, placeholderOffset + 2));
        CommandsRegistry.getCommand(REPLACE_PROMPT_TEMPLATE_PLACEHOLDER_COMMAND_ID).handler(void 0);
        assert.deepStrictEqual({ value: editor.getValue(), position: editor.getPosition() }, {
          value: "Help me complete  in this project.",
          position: new Position(1, placeholderOffset + 1)
        });
      } finally {
        disposables.dispose();
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3NlclxccHJvbXB0VGVtcGxhdGVQbGFjZWhvbGRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgd2l0aFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFByb21wdFRlbXBsYXRlUGxhY2Vob2xkZXJDb250cm9sbGVyLCBSRVBMQUNFX1BST01QVF9URU1QTEFURV9QTEFDRUhPTERFUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wcm9tcHRUZW1wbGF0ZVBsYWNlaG9sZGVyLmpzJztcblxuc3VpdGUoJ1Byb21wdFRlbXBsYXRlUGxhY2Vob2xkZXJDb250cm9sbGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdoaWdobGlnaHRzIGEgbGF0ZS1pbnNlcnRlZCBwbGFjZWhvbGRlciBhbmQgcmVwbGFjZXMgaXQgYXQgdGhlIGNsaWNrZWQgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKCcnLCB7fSwgZWRpdG9yID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGV0IGJlZm9yZVJlcGxhY2VDb3VudCA9IDA7XG5cdFx0XHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gJ1tkZXNjcmliZSB0aGUgY29kaW5nIHRhc2tdJztcblx0XHRcdFx0Y29uc3QgcGFydGlhbFByb21wdCA9IGBIZWxwIG1lIGNvbXBsZXRlICR7cGxhY2Vob2xkZXJ9YDtcblx0XHRcdFx0Y29uc3QgcHJvbXB0ID0gYCR7cGFydGlhbFByb21wdH0gaW4gdGhpcyBwcm9qZWN0LiBGaXJzdCwgaW5zcGVjdCB0aGUgcmVsZXZhbnQgZmlsZXMuYDtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUHJvbXB0VGVtcGxhdGVQbGFjZWhvbGRlckNvbnRyb2xsZXIoZWRpdG9yLCAoKSA9PiB7XG5cdFx0XHRcdFx0YmVmb3JlUmVwbGFjZUNvdW50Kys7XG5cdFx0XHRcdFx0ZWRpdG9yLnNldFZhbHVlKHByb21wdCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0Y29udHJvbGxlci5zZXRQbGFjZWhvbGRlcihwbGFjZWhvbGRlcik7XG5cdFx0XHRcdGVkaXRvci5zZXRWYWx1ZShwYXJ0aWFsUHJvbXB0KTtcblxuXHRcdFx0XHRjb25zdCBwbGFjZWhvbGRlck9mZnNldCA9IHByb21wdC5pbmRleE9mKHBsYWNlaG9sZGVyKTtcblx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbnNCZWZvcmUgPSBlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0QWxsRGVjb3JhdGlvbnMoKVxuXHRcdFx0XHRcdC5maWx0ZXIoZGVjb3JhdGlvbiA9PiBkZWNvcmF0aW9uLm9wdGlvbnMuaW5saW5lQ2xhc3NOYW1lID09PSAnc2Vzc2lvbnMtcHJvbXB0LXRlbXBsYXRlLXBsYWNlaG9sZGVyJylcblx0XHRcdFx0XHQubWFwKGRlY29yYXRpb24gPT4gZGVjb3JhdGlvbi5yYW5nZS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3QgaWdub3JlZE91dHNpZGUgPSBjb250cm9sbGVyLnJlcGxhY2VBdChuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdFx0XHRjb25zdCByZXBsYWNlZCA9IGNvbnRyb2xsZXIucmVwbGFjZUF0KG5ldyBQb3NpdGlvbigxLCBwbGFjZWhvbGRlck9mZnNldCArIDIpKTtcblx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbnNBZnRlciA9IGVkaXRvci5nZXRNb2RlbCgpIS5nZXRBbGxEZWNvcmF0aW9ucygpXG5cdFx0XHRcdFx0LmZpbHRlcihkZWNvcmF0aW9uID0+IGRlY29yYXRpb24ub3B0aW9ucy5pbmxpbmVDbGFzc05hbWUgPT09ICdzZXNzaW9ucy1wcm9tcHQtdGVtcGxhdGUtcGxhY2Vob2xkZXInKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRkZWNvcmF0aW9uc0JlZm9yZSxcblx0XHRcdFx0XHRpZ25vcmVkT3V0c2lkZSxcblx0XHRcdFx0XHRyZXBsYWNlZCxcblx0XHRcdFx0XHRiZWZvcmVSZXBsYWNlQ291bnQsXG5cdFx0XHRcdFx0dmFsdWU6IGVkaXRvci5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdHBvc2l0aW9uOiBlZGl0b3IuZ2V0UG9zaXRpb24oKSxcblx0XHRcdFx0XHRkZWNvcmF0aW9uc0FmdGVyOiBkZWNvcmF0aW9uc0FmdGVyLmxlbmd0aCxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGRlY29yYXRpb25zQmVmb3JlOiBbYFsxLCR7cGxhY2Vob2xkZXJPZmZzZXQgKyAxfSAtPiAxLCR7cGxhY2Vob2xkZXJPZmZzZXQgKyBwbGFjZWhvbGRlci5sZW5ndGggKyAxfV1gXSxcblx0XHRcdFx0XHRpZ25vcmVkT3V0c2lkZTogZmFsc2UsXG5cdFx0XHRcdFx0cmVwbGFjZWQ6IHRydWUsXG5cdFx0XHRcdFx0YmVmb3JlUmVwbGFjZUNvdW50OiAxLFxuXHRcdFx0XHRcdHZhbHVlOiAnSGVscCBtZSBjb21wbGV0ZSAgaW4gdGhpcyBwcm9qZWN0LiBGaXJzdCwgaW5zcGVjdCB0aGUgcmVsZXZhbnQgZmlsZXMuJyxcblx0XHRcdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIHBsYWNlaG9sZGVyT2Zmc2V0ICsgMSksXG5cdFx0XHRcdFx0ZGVjb3JhdGlvbnNBZnRlcjogMCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VzIHRoZSBwbGFjZWhvbGRlciB0aHJvdWdoIHRoZSBFbnRlciBjb21tYW5kIHdoZW4gdGhlIGNhcmV0IGlzIGluc2lkZScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoJ0hlbHAgbWUgY29tcGxldGUgW2Rlc2NyaWJlIHRoZSBjb2RpbmcgdGFza10gaW4gdGhpcyBwcm9qZWN0LicsIHt9LCBlZGl0b3IgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwbGFjZWhvbGRlciA9ICdbZGVzY3JpYmUgdGhlIGNvZGluZyB0YXNrXSc7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFByb21wdFRlbXBsYXRlUGxhY2Vob2xkZXJDb250cm9sbGVyKGVkaXRvciwgKCkgPT4gdW5kZWZpbmVkKSk7XG5cdFx0XHRcdGNvbnRyb2xsZXIuc2V0UGxhY2Vob2xkZXIocGxhY2Vob2xkZXIpO1xuXHRcdFx0XHRjb25zdCBwbGFjZWhvbGRlck9mZnNldCA9IGVkaXRvci5nZXRWYWx1ZSgpLmluZGV4T2YocGxhY2Vob2xkZXIpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIHBsYWNlaG9sZGVyT2Zmc2V0ICsgMikpO1xuXG5cdFx0XHRcdENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChSRVBMQUNFX1BST01QVF9URU1QTEFURV9QTEFDRUhPTERFUl9DT01NQU5EX0lEKSEuaGFuZGxlcih1bmRlZmluZWQgYXMgbmV2ZXIpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyB2YWx1ZTogZWRpdG9yLmdldFZhbHVlKCksIHBvc2l0aW9uOiBlZGl0b3IuZ2V0UG9zaXRpb24oKSB9LCB7XG5cdFx0XHRcdFx0dmFsdWU6ICdIZWxwIG1lIGNvbXBsZXRlICBpbiB0aGlzIHByb2plY3QuJyxcblx0XHRcdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIHBsYWNlaG9sZGVyT2Zmc2V0ICsgMSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUNBQXFDLHNEQUFzRDtBQUVwRyxNQUFNLHVDQUF1QyxNQUFNO0FBQ2xELDBDQUF3QztBQUV4QyxPQUFLLGtGQUFrRixNQUFNO0FBQzVGLHVCQUFtQixJQUFJLENBQUMsR0FBRyxZQUFVO0FBQ3BDLFlBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFJO0FBQ0gsWUFBSSxxQkFBcUI7QUFDekIsY0FBTSxjQUFjO0FBQ3BCLGNBQU0sZ0JBQWdCLG9CQUFvQixXQUFXO0FBQ3JELGNBQU0sU0FBUyxHQUFHLGFBQWE7QUFDL0IsY0FBTSxhQUFhLFlBQVksSUFBSSxJQUFJLG9DQUFvQyxRQUFRLE1BQU07QUFDeEY7QUFDQSxpQkFBTyxTQUFTLE1BQU07QUFBQSxRQUN2QixDQUFDLENBQUM7QUFDRixtQkFBVyxlQUFlLFdBQVc7QUFDckMsZUFBTyxTQUFTLGFBQWE7QUFFN0IsY0FBTSxvQkFBb0IsT0FBTyxRQUFRLFdBQVc7QUFDcEQsY0FBTSxvQkFBb0IsT0FBTyxTQUFTLEVBQUcsa0JBQWtCLEVBQzdELE9BQU8sZ0JBQWMsV0FBVyxRQUFRLG9CQUFvQixzQ0FBc0MsRUFDbEcsSUFBSSxnQkFBYyxXQUFXLE1BQU0sU0FBUyxDQUFDO0FBQy9DLGNBQU0saUJBQWlCLFdBQVcsVUFBVSxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDOUQsY0FBTSxXQUFXLFdBQVcsVUFBVSxJQUFJLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQyxDQUFDO0FBQzVFLGNBQU0sbUJBQW1CLE9BQU8sU0FBUyxFQUFHLGtCQUFrQixFQUM1RCxPQUFPLGdCQUFjLFdBQVcsUUFBUSxvQkFBb0Isc0NBQXNDO0FBRXBHLGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEI7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBLE9BQU8sT0FBTyxTQUFTO0FBQUEsVUFDdkIsVUFBVSxPQUFPLFlBQVk7QUFBQSxVQUM3QixrQkFBa0IsaUJBQWlCO0FBQUEsUUFDcEMsR0FBRztBQUFBLFVBQ0YsbUJBQW1CLENBQUMsTUFBTSxvQkFBb0IsQ0FBQyxTQUFTLG9CQUFvQixZQUFZLFNBQVMsQ0FBQyxHQUFHO0FBQUEsVUFDckcsZ0JBQWdCO0FBQUEsVUFDaEIsVUFBVTtBQUFBLFVBQ1Ysb0JBQW9CO0FBQUEsVUFDcEIsT0FBTztBQUFBLFVBQ1AsVUFBVSxJQUFJLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQztBQUFBLFVBQy9DLGtCQUFrQjtBQUFBLFFBQ25CLENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCxvQkFBWSxRQUFRO0FBQUEsTUFDckI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtFQUErRSxNQUFNO0FBQ3pGLHVCQUFtQixnRUFBZ0UsQ0FBQyxHQUFHLFlBQVU7QUFDaEcsWUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQUk7QUFDSCxjQUFNLGNBQWM7QUFDcEIsY0FBTSxhQUFhLFlBQVksSUFBSSxJQUFJLG9DQUFvQyxRQUFRLE1BQU0sTUFBUyxDQUFDO0FBQ25HLG1CQUFXLGVBQWUsV0FBVztBQUNyQyxjQUFNLG9CQUFvQixPQUFPLFNBQVMsRUFBRSxRQUFRLFdBQVc7QUFDL0QsZUFBTyxZQUFZLElBQUksU0FBUyxHQUFHLG9CQUFvQixDQUFDLENBQUM7QUFFekQseUJBQWlCLFdBQVcsOENBQThDLEVBQUcsUUFBUSxNQUFrQjtBQUV2RyxlQUFPLGdCQUFnQixFQUFFLE9BQU8sT0FBTyxTQUFTLEdBQUcsVUFBVSxPQUFPLFlBQVksRUFBRSxHQUFHO0FBQUEsVUFDcEYsT0FBTztBQUFBLFVBQ1AsVUFBVSxJQUFJLFNBQVMsR0FBRyxvQkFBb0IsQ0FBQztBQUFBLFFBQ2hELENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCxvQkFBWSxRQUFRO0FBQUEsTUFDckI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
