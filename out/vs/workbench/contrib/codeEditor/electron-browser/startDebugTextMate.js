import * as nls from "../../../../nls.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { ITextMateTokenizationService } from "../../../services/textMate/browser/textMateTokenizationFeature.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Constants } from "../../../../base/common/uint.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { joinPath } from "../../../../base/common/resources.js";
import { IFileService } from "../../../../platform/files/common/files.js";
const _StartDebugTextMate = class _StartDebugTextMate extends Action2 {
  constructor() {
    super({
      id: "editor.action.startDebugTextMate",
      title: nls.localize2("startDebugTextMate", "Start TextMate Syntax Grammar Logging"),
      category: Categories.Developer,
      f1: true
    });
  }
  _getOrCreateModel(modelService) {
    const model = modelService.getModel(_StartDebugTextMate.resource);
    if (model) {
      return model;
    }
    return modelService.createModel("", null, _StartDebugTextMate.resource);
  }
  _append(model, str) {
    const lineCount = model.getLineCount();
    model.applyEdits([{
      range: new Range(lineCount, Constants.MAX_SAFE_SMALL_INTEGER, lineCount, Constants.MAX_SAFE_SMALL_INTEGER),
      text: str
    }]);
  }
  async run(accessor) {
    const textMateService = accessor.get(ITextMateTokenizationService);
    const modelService = accessor.get(IModelService);
    const editorService = accessor.get(IEditorService);
    const codeEditorService = accessor.get(ICodeEditorService);
    const hostService = accessor.get(IHostService);
    const environmentService = accessor.get(INativeWorkbenchEnvironmentService);
    const loggerService = accessor.get(ILoggerService);
    const fileService = accessor.get(IFileService);
    const pathInTemp = joinPath(environmentService.tmpDir, `vcode-tm-log-${generateUuid()}.txt`);
    await fileService.createFile(pathInTemp);
    const logger = loggerService.createLogger(pathInTemp, { name: "debug textmate" });
    const model = this._getOrCreateModel(modelService);
    const append = (str) => {
      this._append(model, str + "\n");
      scrollEditor();
      logger.info(str);
      logger.flush();
    };
    await hostService.openWindow([{ fileUri: pathInTemp }], { forceNewWindow: true });
    const textEditorPane = await editorService.openEditor({
      resource: model.uri,
      options: { pinned: true }
    });
    if (!textEditorPane) {
      return;
    }
    const scrollEditor = () => {
      const editors = codeEditorService.listCodeEditors();
      for (const editor of editors) {
        if (editor.hasModel()) {
          if (editor.getModel().uri.toString() === _StartDebugTextMate.resource.toString()) {
            editor.revealLine(editor.getModel().getLineCount());
          }
        }
      }
    };
    append(`// Open the file you want to test to the side and watch here`);
    append(`// Output mirrored at ${pathInTemp}`);
    textMateService.startDebugMode(
      (str) => {
        this._append(model, str + "\n");
        scrollEditor();
        logger.info(str);
        logger.flush();
      },
      () => {
      }
    );
  }
};
_StartDebugTextMate.resource = URI.parse(`inmemory:///tm-log.txt`);
let StartDebugTextMate = _StartDebugTextMate;
registerAction2(StartDebugTextMate);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGVsZWN0cm9uLWJyb3dzZXJcXHN0YXJ0RGVidWdUZXh0TWF0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IElUZXh0TWF0ZVRva2VuaXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0TWF0ZS9icm93c2VyL3RleHRNYXRlVG9rZW5pemF0aW9uRmVhdHVyZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9lbGVjdHJvbi1icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5cbmNsYXNzIFN0YXJ0RGVidWdUZXh0TWF0ZSBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlc291cmNlID0gVVJJLnBhcnNlKGBpbm1lbW9yeTovLy90bS1sb2cudHh0YCk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnN0YXJ0RGVidWdUZXh0TWF0ZScsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc3RhcnREZWJ1Z1RleHRNYXRlJywgXCJTdGFydCBUZXh0TWF0ZSBTeW50YXggR3JhbW1hciBMb2dnaW5nXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9yQ3JlYXRlTW9kZWwobW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlKTogSVRleHRNb2RlbCB7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwoU3RhcnREZWJ1Z1RleHRNYXRlLnJlc291cmNlKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHJldHVybiBtb2RlbDtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgbnVsbCwgU3RhcnREZWJ1Z1RleHRNYXRlLnJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGVuZChtb2RlbDogSVRleHRNb2RlbCwgc3RyOiBzdHJpbmcpIHtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKGxpbmVDb3VudCwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsIGxpbmVDb3VudCwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIpLFxuXHRcdFx0dGV4dDogc3RyXG5cdFx0fV0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgdGV4dE1hdGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0TWF0ZVRva2VuaXphdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTW9kZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ2dlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ2dlclNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCBwYXRoSW5UZW1wID0gam9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLnRtcERpciwgYHZjb2RlLXRtLWxvZy0ke2dlbmVyYXRlVXVpZCgpfS50eHRgKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGaWxlKHBhdGhJblRlbXApO1xuXHRcdGNvbnN0IGxvZ2dlciA9IGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKHBhdGhJblRlbXAsIHsgbmFtZTogJ2RlYnVnIHRleHRtYXRlJyB9KTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2dldE9yQ3JlYXRlTW9kZWwobW9kZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBhcHBlbmQgPSAoc3RyOiBzdHJpbmcpID0+IHtcblx0XHRcdHRoaXMuX2FwcGVuZChtb2RlbCwgc3RyICsgJ1xcbicpO1xuXHRcdFx0c2Nyb2xsRWRpdG9yKCk7XG5cdFx0XHRsb2dnZXIuaW5mbyhzdHIpO1xuXHRcdFx0bG9nZ2VyLmZsdXNoKCk7XG5cdFx0fTtcblx0XHRhd2FpdCBob3N0U2VydmljZS5vcGVuV2luZG93KFt7IGZpbGVVcmk6IHBhdGhJblRlbXAgfV0sIHsgZm9yY2VOZXdXaW5kb3c6IHRydWUgfSk7XG5cdFx0Y29uc3QgdGV4dEVkaXRvclBhbmUgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IG1vZGVsLnVyaSxcblx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH1cblx0XHR9KTtcblx0XHRpZiAoIXRleHRFZGl0b3JQYW5lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNjcm9sbEVkaXRvciA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvcnMgPSBjb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKTtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKGVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdFx0aWYgKGVkaXRvci5nZXRNb2RlbCgpLnVyaS50b1N0cmluZygpID09PSBTdGFydERlYnVnVGV4dE1hdGUucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdFx0ZWRpdG9yLnJldmVhbExpbmUoZWRpdG9yLmdldE1vZGVsKCkuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRhcHBlbmQoYC8vIE9wZW4gdGhlIGZpbGUgeW91IHdhbnQgdG8gdGVzdCB0byB0aGUgc2lkZSBhbmQgd2F0Y2ggaGVyZWApO1xuXHRcdGFwcGVuZChgLy8gT3V0cHV0IG1pcnJvcmVkIGF0ICR7cGF0aEluVGVtcH1gKTtcblxuXHRcdHRleHRNYXRlU2VydmljZS5zdGFydERlYnVnTW9kZShcblx0XHRcdChzdHIpID0+IHtcblx0XHRcdFx0dGhpcy5fYXBwZW5kKG1vZGVsLCBzdHIgKyAnXFxuJyk7XG5cdFx0XHRcdHNjcm9sbEVkaXRvcigpO1xuXHRcdFx0XHRsb2dnZXIuaW5mbyhzdHIpO1xuXHRcdFx0XHRsb2dnZXIuZmx1c2goKTtcblx0XHRcdH0sXG5cdFx0XHQoKSA9PiB7XG5cblx0XHRcdH1cblx0XHQpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihTdGFydERlYnVnVGV4dE1hdGUpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBDQUEwQztBQUNuRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQjtBQUc3QixNQUFNLHNCQUFOLE1BQU0sNEJBQTJCLFFBQVE7QUFBQSxFQUl4QyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsc0JBQXNCLHVDQUF1QztBQUFBLE1BQ2xGLFVBQVUsV0FBVztBQUFBLE1BQ3JCLElBQUk7QUFBQSxJQUNMLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxrQkFBa0IsY0FBeUM7QUFDbEUs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
