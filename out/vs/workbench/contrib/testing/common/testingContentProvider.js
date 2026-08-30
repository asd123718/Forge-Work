var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { removeAnsiEscapeCodes } from "../../../../base/common/strings.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../nls.js";
import { ITestResultService } from "./testResultService.js";
import { TestMessageType } from "./testTypes.js";
import { TEST_DATA_SCHEME, TestUriType, parseTestUri } from "./testingUri.js";
let TestingContentProvider = class {
  constructor(textModelResolverService, languageService, modelService, resultService) {
    this.languageService = languageService;
    this.modelService = modelService;
    this.resultService = resultService;
    textModelResolverService.registerTextModelContentProvider(TEST_DATA_SCHEME, this);
  }
  /**
   * @inheritdoc
   */
  async provideTextContent(resource) {
    const existing = this.modelService.getModel(resource);
    if (existing && !existing.isDisposed()) {
      return existing;
    }
    const parsed = parseTestUri(resource);
    if (!parsed) {
      return null;
    }
    const result = this.resultService.getResult(parsed.resultId);
    if (!result) {
      return null;
    }
    if (parsed.type === TestUriType.TaskOutput) {
      const task = result.tasks[parsed.taskIndex];
      const model = this.modelService.createModel("", null, resource, false);
      const append = (text2) => model.applyEdits([{
        range: { startColumn: 1, endColumn: 1, startLineNumber: Infinity, endLineNumber: Infinity },
        text: text2
      }]);
      const init = VSBuffer.concat(task.output.buffers, task.output.length).toString();
      append(removeAnsiEscapeCodes(init));
      let hadContent = init.length > 0;
      const dispose = new DisposableStore();
      dispose.add(task.output.onDidWriteData((d) => {
        hadContent ||= d.byteLength > 0;
        append(removeAnsiEscapeCodes(d.toString()));
      }));
      task.output.endPromise.then(() => {
        if (dispose.isDisposed) {
          return;
        }
        if (!hadContent) {
          append(localize("runNoOutout", "The test run did not record any output."));
          dispose.dispose();
        }
      });
      dispose.add(model.onWillDispose(() => dispose.dispose()));
      return model;
    }
    const test = result?.getStateById(parsed.testExtId);
    if (!test) {
      return null;
    }
    let text;
    let language = null;
    switch (parsed.type) {
      case TestUriType.ResultActualOutput: {
        const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
        if (message?.type === TestMessageType.Error) {
          text = message.actual;
        }
        break;
      }
      case TestUriType.TestOutput: {
        text = "";
        const output = result.tasks[parsed.taskIndex].output;
        for (const message of test.tasks[parsed.taskIndex].messages) {
          if (message.type === TestMessageType.Output) {
            text += removeAnsiEscapeCodes(output.getRange(message.offset, message.length).toString());
          }
        }
        break;
      }
      case TestUriType.ResultExpectedOutput: {
        const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
        if (message?.type === TestMessageType.Error) {
          text = message.expected;
        }
        break;
      }
      case TestUriType.ResultMessage: {
        const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
        if (!message) {
          break;
        }
        if (message.type === TestMessageType.Output) {
          const content = result.tasks[parsed.taskIndex].output.getRange(message.offset, message.length);
          text = removeAnsiEscapeCodes(content.toString());
        } else if (typeof message.message === "string") {
          text = removeAnsiEscapeCodes(message.message);
        } else {
          text = message.message.value;
          language = this.languageService.createById("markdown");
        }
      }
    }
    if (text === void 0) {
      return null;
    }
    return this.modelService.createModel(text, language, resource, false);
  }
};
TestingContentProvider.ID = "workbench.contrib.testing.contentProvider";
TestingContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, ILanguageService),
  __decorateParam(2, IModelService),
  __decorateParam(3, ITestResultService)
], TestingContentProvider);
export {
  TestingContentProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGNvbW1vblxcdGVzdGluZ0NvbnRlbnRQcm92aWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByZW1vdmVBbnNpRXNjYXBlQ29kZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZWxlY3Rpb24sIElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFNlcnZpY2UgfSBmcm9tICcuL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RNZXNzYWdlVHlwZSB9IGZyb20gJy4vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IFRFU1RfREFUQV9TQ0hFTUUsIFRlc3RVcmlUeXBlLCBwYXJzZVRlc3RVcmkgfSBmcm9tICcuL3Rlc3RpbmdVcmkuanMnO1xuXG4vKipcbiAqIEEgY29udGVudCBwcm92aWRlciB0aGF0IHJldHVybnMgdmFyaW91cyBvdXRwdXRzIGZvciB0ZXN0cy4gVGhpcyBpcyB1c2VkXG4gKiBpbiB0aGUgaW5saW5lIHBlZWsgdmlldy5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlc3RpbmdDb250ZW50UHJvdmlkZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi50ZXN0aW5nLmNvbnRlbnRQcm92aWRlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlc3VsdFNlcnZpY2U6IElUZXN0UmVzdWx0U2VydmljZSxcblx0KSB7XG5cdFx0dGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKFRFU1RfREFUQV9TQ0hFTUUsIHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcHJvdmlkZVRleHRDb250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElUZXh0TW9kZWwgfCBudWxsPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nICYmICFleGlzdGluZy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVRlc3RVcmkocmVzb3VyY2UpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnJlc3VsdFNlcnZpY2UuZ2V0UmVzdWx0KHBhcnNlZC5yZXN1bHRJZCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChwYXJzZWQudHlwZSA9PT0gVGVzdFVyaVR5cGUuVGFza091dHB1dCkge1xuXHRcdFx0Y29uc3QgdGFzayA9IHJlc3VsdC50YXNrc1twYXJzZWQudGFza0luZGV4XTtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJycsIG51bGwsIHJlc291cmNlLCBmYWxzZSk7XG5cdFx0XHRjb25zdCBhcHBlbmQgPSAodGV4dDogc3RyaW5nKSA9PiBtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDEsIHN0YXJ0TGluZU51bWJlcjogSW5maW5pdHksIGVuZExpbmVOdW1iZXI6IEluZmluaXR5IH0sXG5cdFx0XHRcdHRleHQsXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IGluaXQgPSBWU0J1ZmZlci5jb25jYXQodGFzay5vdXRwdXQuYnVmZmVycywgdGFzay5vdXRwdXQubGVuZ3RoKS50b1N0cmluZygpO1xuXHRcdFx0YXBwZW5kKHJlbW92ZUFuc2lFc2NhcGVDb2Rlcyhpbml0KSk7XG5cblx0XHRcdGxldCBoYWRDb250ZW50ID0gaW5pdC5sZW5ndGggPiAwO1xuXHRcdFx0Y29uc3QgZGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGRpc3Bvc2UuYWRkKHRhc2sub3V0cHV0Lm9uRGlkV3JpdGVEYXRhKGQgPT4ge1xuXHRcdFx0XHRoYWRDb250ZW50IHx8PSBkLmJ5dGVMZW5ndGggPiAwO1xuXHRcdFx0XHRhcHBlbmQocmVtb3ZlQW5zaUVzY2FwZUNvZGVzKGQudG9TdHJpbmcoKSkpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGFzay5vdXRwdXQuZW5kUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKGRpc3Bvc2UuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWhhZENvbnRlbnQpIHtcblx0XHRcdFx0XHRhcHBlbmQobG9jYWxpemUoJ3J1bk5vT3V0b3V0JywgJ1RoZSB0ZXN0IHJ1biBkaWQgbm90IHJlY29yZCBhbnkgb3V0cHV0LicpKTtcblx0XHRcdFx0XHRkaXNwb3NlLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRkaXNwb3NlLmFkZChtb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IGRpc3Bvc2UuZGlzcG9zZSgpKSk7XG5cblx0XHRcdHJldHVybiBtb2RlbDtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXN0ID0gcmVzdWx0Py5nZXRTdGF0ZUJ5SWQocGFyc2VkLnRlc3RFeHRJZCk7XG5cdFx0aWYgKCF0ZXN0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgdGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBsYW5ndWFnZTogSUxhbmd1YWdlU2VsZWN0aW9uIHwgbnVsbCA9IG51bGw7XG5cdFx0c3dpdGNoIChwYXJzZWQudHlwZSkge1xuXHRcdFx0Y2FzZSBUZXN0VXJpVHlwZS5SZXN1bHRBY3R1YWxPdXRwdXQ6IHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IHRlc3QudGFza3NbcGFyc2VkLnRhc2tJbmRleF0ubWVzc2FnZXNbcGFyc2VkLm1lc3NhZ2VJbmRleF07XG5cdFx0XHRcdGlmIChtZXNzYWdlPy50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuRXJyb3IpIHsgdGV4dCA9IG1lc3NhZ2UuYWN0dWFsOyB9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBUZXN0VXJpVHlwZS5UZXN0T3V0cHV0OiB7XG5cdFx0XHRcdHRleHQgPSAnJztcblx0XHRcdFx0Y29uc3Qgb3V0cHV0ID0gcmVzdWx0LnRhc2tzW3BhcnNlZC50YXNrSW5kZXhdLm91dHB1dDtcblx0XHRcdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIHRlc3QudGFza3NbcGFyc2VkLnRhc2tJbmRleF0ubWVzc2FnZXMpIHtcblx0XHRcdFx0XHRpZiAobWVzc2FnZS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuT3V0cHV0KSB7XG5cdFx0XHRcdFx0XHR0ZXh0ICs9IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyhvdXRwdXQuZ2V0UmFuZ2UobWVzc2FnZS5vZmZzZXQsIG1lc3NhZ2UubGVuZ3RoKS50b1N0cmluZygpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFRlc3RVcmlUeXBlLlJlc3VsdEV4cGVjdGVkT3V0cHV0OiB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0ZXN0LnRhc2tzW3BhcnNlZC50YXNrSW5kZXhdLm1lc3NhZ2VzW3BhcnNlZC5tZXNzYWdlSW5kZXhdO1xuXHRcdFx0XHRpZiAobWVzc2FnZT8udHlwZSA9PT0gVGVzdE1lc3NhZ2VUeXBlLkVycm9yKSB7IHRleHQgPSBtZXNzYWdlLmV4cGVjdGVkOyB9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBUZXN0VXJpVHlwZS5SZXN1bHRNZXNzYWdlOiB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0ZXN0LnRhc2tzW3BhcnNlZC50YXNrSW5kZXhdLm1lc3NhZ2VzW3BhcnNlZC5tZXNzYWdlSW5kZXhdO1xuXHRcdFx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtZXNzYWdlLnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5PdXRwdXQpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gcmVzdWx0LnRhc2tzW3BhcnNlZC50YXNrSW5kZXhdLm91dHB1dC5nZXRSYW5nZShtZXNzYWdlLm9mZnNldCwgbWVzc2FnZS5sZW5ndGgpO1xuXHRcdFx0XHRcdHRleHQgPSByZW1vdmVBbnNpRXNjYXBlQ29kZXMoY29udGVudC50b1N0cmluZygpKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgbWVzc2FnZS5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRleHQgPSByZW1vdmVBbnNpRXNjYXBlQ29kZXMobWVzc2FnZS5tZXNzYWdlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0ZXh0ID0gbWVzc2FnZS5tZXNzYWdlLnZhbHVlO1xuXHRcdFx0XHRcdGxhbmd1YWdlID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZCgnbWFya2Rvd24nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0ZXh0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCh0ZXh0LCBsYW5ndWFnZSwgcmVzb3VyY2UsIGZhbHNlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUV0QyxTQUE2Qix3QkFBd0I7QUFFckQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBb0MseUJBQXlCO0FBQzdELFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsa0JBQWtCLGFBQWEsb0JBQW9CO0FBTXJELElBQU0seUJBQU4sTUFBMEY7QUFBQSxFQUdoRyxZQUNvQiwwQkFDZ0IsaUJBQ0gsY0FDSyxlQUNwQztBQUhrQztBQUNIO0FBQ0s7QUFFckMsNkJBQXlCLGlDQUFpQyxrQkFBa0IsSUFBSTtBQUFBLEVBQ2pGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxNQUFhLG1CQUFtQixVQUEyQztBQUMxRSxVQUFNLFdBQVcsS0FBSyxhQUFhLFNBQVMsUUFBUTtBQUNwRCxRQUFJLFlBQVksQ0FBQyxTQUFTLFdBQVcsR0FBRztBQUN2QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBUyxhQUFhLFFBQVE7QUFDcEMsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBUyxLQUFLLGNBQWMsVUFBVSxPQUFPLFFBQVE7QUFDM0QsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksT0FBTyxTQUFTLFlBQVksWUFBWTtBQUMzQyxZQUFNLE9BQU8sT0FBTyxNQUFNLE9BQU8sU0FBUztBQUMxQyxZQUFNLFFBQVEsS0FBSyxhQUFhLFlBQVksSUFBSSxNQUFNLFVBQVUsS0FBSztBQUNyRSxZQUFNLFNBQVMsQ0FBQ0EsVUFBaUIsTUFBTSxXQUFXLENBQUM7QUFBQSxRQUNsRCxPQUFPLEVBQUUsYUFBYSxHQUFHLFdBQVcsR0FBRyxpQkFBaUIsVUFBVSxlQUFlLFNBQVM7QUFBQSxRQUMxRixNQUFBQTtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBRUYsWUFBTSxPQUFPLFNBQVMsT0FBTyxLQUFLLE9BQU8sU0FBUyxLQUFLLE9BQU8sTUFBTSxFQUFFLFNBQVM7QUFDL0UsYUFBTyxzQkFBc0IsSUFBSSxDQUFDO0FBRWxDLFVBQUksYUFBYSxLQUFLLFNBQVM7QUFDL0IsWUFBTSxVQUFVLElBQUksZ0JBQWdCO0FBQ3BDLGNBQVEsSUFBSSxLQUFLLE9BQU8sZUFBZSxPQUFLO0FBQzNDLHVCQUFlLEVBQUUsYUFBYTtBQUM5QixlQUFPLHNCQUFzQixFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQUEsTUFDM0MsQ0FBQyxDQUFDO0FBQ0YsV0FBSyxPQUFPLFdBQVcsS0FBSyxNQUFNO0FBQ2pDLFlBQUksUUFBUSxZQUFZO0FBQ3ZCO0FBQUEsUUFDRDtBQUNBLFlBQUksQ0FBQyxZQUFZO0FBQ2hCLGlCQUFPLFNBQVMsZUFBZSx5Q0FBeUMsQ0FBQztBQUN6RSxrQkFBUSxRQUFRO0FBQUEsUUFDakI7QUFBQSxNQUNELENBQUM7QUFDRCxjQUFRLElBQUksTUFBTSxjQUFjLE1BQU0sUUFBUSxRQUFRLENBQUMsQ0FBQztBQUV4RCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sT0FBTyxRQUFRLGFBQWEsT0FBTyxTQUFTO0FBQ2xELFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJO0FBQ0osUUFBSSxXQUFzQztBQUMxQyxZQUFRLE9BQU8sTUFBTTtBQUFBLE1BQ3BCLEtBQUssWUFBWSxvQkFBb0I7QUFDcEMsY0FBTSxVQUFVLEtBQUssTUFBTSxPQUFPLFNBQVMsRUFBRSxTQUFTLE9BQU8sWUFBWTtBQUN6RSxZQUFJLFNBQVMsU0FBUyxnQkFBZ0IsT0FBTztBQUFFLGlCQUFPLFFBQVE7QUFBQSxRQUFRO0FBQ3RFO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxZQUFZLFlBQVk7QUFDNUIsZUFBTztBQUNQLGNBQU0sU0FBUyxPQUFPLE1BQU0sT0FBTyxTQUFTLEVBQUU7QUFDOUMsbUJBQVcsV0FBVyxLQUFLLE1BQU0sT0FBTyxTQUFTLEVBQUUsVUFBVTtBQUM1RCxjQUFJLFFBQVEsU0FBUyxnQkFBZ0IsUUFBUTtBQUM1QyxvQkFBUSxzQkFBc0IsT0FBTyxTQUFTLFFBQVEsUUFBUSxRQUFRLE1BQU0sRUFBRSxTQUFTLENBQUM7QUFBQSxVQUN6RjtBQUFBLFFBQ0Q7QUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssWUFBWSxzQkFBc0I7QUFDdEMsY0FBTSxVQUFVLEtBQUssTUFBTSxPQUFPLFNBQVMsRUFBRSxTQUFTLE9BQU8sWUFBWTtBQUN6RSxZQUFJLFNBQVMsU0FBUyxnQkFBZ0IsT0FBTztBQUFFLGlCQUFPLFFBQVE7QUFBQSxRQUFVO0FBQ3hFO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxZQUFZLGVBQWU7QUFDL0IsY0FBTSxVQUFVLEtBQUssTUFBTSxPQUFPLFNBQVMsRUFBRSxTQUFTLE9BQU8sWUFBWTtBQUN6RSxZQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsUUFDRDtBQUVBLFlBQUksUUFBUSxTQUFTLGdCQUFnQixRQUFRO0FBQzVDLGdCQUFNLFVBQVUsT0FBTyxNQUFNLE9BQU8sU0FBUyxFQUFFLE9BQU8sU0FBUyxRQUFRLFFBQVEsUUFBUSxNQUFNO0FBQzdGLGlCQUFPLHNCQUFzQixRQUFRLFNBQVMsQ0FBQztBQUFBLFFBQ2hELFdBQVcsT0FBTyxRQUFRLFlBQVksVUFBVTtBQUMvQyxpQkFBTyxzQkFBc0IsUUFBUSxPQUFPO0FBQUEsUUFDN0MsT0FBTztBQUNOLGlCQUFPLFFBQVEsUUFBUTtBQUN2QixxQkFBVyxLQUFLLGdCQUFnQixXQUFXLFVBQVU7QUFBQSxRQUN0RDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxTQUFTLFFBQVc7QUFDdkIsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUssYUFBYSxZQUFZLE1BQU0sVUFBVSxVQUFVLEtBQUs7QUFBQSxFQUNyRTtBQUNEO0FBbEhhLHVCQUNXLEtBQUs7QUFEaEIseUJBQU47QUFBQSxFQUlKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFsidGV4dCJdCn0K
