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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { ToolDataSource } from "../../../../chat/common/tools/languageModelToolsService.js";
import { ITerminalService } from "../../../../terminal/browser/terminal.js";
import { TerminalToolId } from "./toolIds.js";
const GetTerminalSelectionToolData = {
  id: TerminalToolId.TerminalSelection,
  toolReferenceName: "terminalSelection",
  legacyToolReferenceFullNames: ["runCommands/terminalSelection"],
  displayName: localize("terminalSelectionTool.displayName", "Get Terminal Selection"),
  modelDescription: "Get the current selection in the active terminal.",
  source: ToolDataSource.Internal,
  icon: Codicon.terminal
};
let GetTerminalSelectionTool = class extends Disposable {
  constructor(_terminalService) {
    super();
    this._terminalService = _terminalService;
  }
  async prepareToolInvocation(context, token) {
    return {
      invocationMessage: localize("getTerminalSelection.progressive", "Reading terminal selection"),
      pastTenseMessage: localize("getTerminalSelection.past", "Read terminal selection")
    };
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const activeInstance = this._terminalService.activeInstance;
    if (!activeInstance) {
      return {
        content: [{
          kind: "text",
          value: "No active terminal instance found."
        }]
      };
    }
    const selection = activeInstance.selection;
    if (!selection) {
      return {
        content: [{
          kind: "text",
          value: "No text is currently selected in the active terminal."
        }]
      };
    }
    return {
      content: [{
        kind: "text",
        value: `The active terminal's selection:
${selection}`
      }]
    };
  }
};
GetTerminalSelectionTool = __decorateClass([
  __decorateParam(0, ITerminalService)
], GetTerminalSelectionTool);
export {
  GetTerminalSelectionTool,
  GetTerminalSelectionToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFxnZXRUZXJtaW5hbFNlbGVjdGlvblRvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFRvb2xEYXRhU291cmNlLCB0eXBlIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sRGF0YSwgdHlwZSBJVG9vbEltcGwsIHR5cGUgSVRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdHlwZSBJVG9vbFJlc3VsdCwgdHlwZSBDb3VudFRva2Vuc0NhbGxiYWNrLCB0eXBlIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUb29sSWQgfSBmcm9tICcuL3Rvb2xJZHMuanMnO1xuXG5leHBvcnQgY29uc3QgR2V0VGVybWluYWxTZWxlY3Rpb25Ub29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogVGVybWluYWxUb29sSWQuVGVybWluYWxTZWxlY3Rpb24sXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiAndGVybWluYWxTZWxlY3Rpb24nLFxuXHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ3J1bkNvbW1hbmRzL3Rlcm1pbmFsU2VsZWN0aW9uJ10sXG5cdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndGVybWluYWxTZWxlY3Rpb25Ub29sLmRpc3BsYXlOYW1lJywgJ0dldCBUZXJtaW5hbCBTZWxlY3Rpb24nKSxcblx0bW9kZWxEZXNjcmlwdGlvbjogJ0dldCB0aGUgY3VycmVudCBzZWxlY3Rpb24gaW4gdGhlIGFjdGl2ZSB0ZXJtaW5hbC4nLFxuXHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRpY29uOiBDb2RpY29uLnRlcm1pbmFsLFxufTtcblxuZXhwb3J0IGNsYXNzIEdldFRlcm1pbmFsU2VsZWN0aW9uVG9vbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdnZXRUZXJtaW5hbFNlbGVjdGlvbi5wcm9ncmVzc2l2ZScsIFwiUmVhZGluZyB0ZXJtaW5hbCBzZWxlY3Rpb25cIiksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgnZ2V0VGVybWluYWxTZWxlY3Rpb24ucGFzdCcsIFwiUmVhZCB0ZXJtaW5hbCBzZWxlY3Rpb25cIiksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRpZiAoIWFjdGl2ZUluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogJ05vIGFjdGl2ZSB0ZXJtaW5hbCBpbnN0YW5jZSBmb3VuZC4nXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGFjdGl2ZUluc3RhbmNlLnNlbGVjdGlvbjtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6ICdObyB0ZXh0IGlzIGN1cnJlbnRseSBzZWxlY3RlZCBpbiB0aGUgYWN0aXZlIHRlcm1pbmFsLidcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0dmFsdWU6IGBUaGUgYWN0aXZlIHRlcm1pbmFsJ3Mgc2VsZWN0aW9uOlxcbiR7c2VsZWN0aW9ufWBcblx0XHRcdH1dXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBaU47QUFDMU4sU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSwrQkFBMEM7QUFBQSxFQUN0RCxJQUFJLGVBQWU7QUFBQSxFQUNuQixtQkFBbUI7QUFBQSxFQUNuQiw4QkFBOEIsQ0FBQywrQkFBK0I7QUFBQSxFQUM5RCxhQUFhLFNBQVMscUNBQXFDLHdCQUF3QjtBQUFBLEVBQ25GLGtCQUFrQjtBQUFBLEVBQ2xCLFFBQVEsZUFBZTtBQUFBLEVBQ3ZCLE1BQU0sUUFBUTtBQUNmO0FBRU8sSUFBTSwyQkFBTixjQUF1QyxXQUFnQztBQUFBLEVBRTdFLFlBQ29DLGtCQUNsQztBQUNELFVBQU07QUFGNkI7QUFBQSxFQUdwQztBQUFBLEVBRUEsTUFBTSxzQkFBc0IsU0FBNEMsT0FBd0U7QUFDL0ksV0FBTztBQUFBLE1BQ04sbUJBQW1CLFNBQVMsb0NBQW9DLDRCQUE0QjtBQUFBLE1BQzVGLGtCQUFrQixTQUFTLDZCQUE2Qix5QkFBeUI7QUFBQSxJQUNsRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sT0FBTyxZQUE2QixjQUFtQyxXQUF5QixPQUFnRDtBQUNySixVQUFNLGlCQUFpQixLQUFLLGlCQUFpQjtBQUM3QyxRQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLGFBQU87QUFBQSxRQUNOLFNBQVMsQ0FBQztBQUFBLFVBQ1QsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFFBQ1IsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLGVBQWU7QUFDakMsUUFBSSxDQUFDLFdBQVc7QUFDZixhQUFPO0FBQUEsUUFDTixTQUFTLENBQUM7QUFBQSxVQUNULE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNSLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxNQUNOLFNBQVMsQ0FBQztBQUFBLFFBQ1QsTUFBTTtBQUFBLFFBQ04sT0FBTztBQUFBLEVBQXFDLFNBQVM7QUFBQSxNQUN0RCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFDRDtBQTNDYSwyQkFBTjtBQUFBLEVBR0o7QUFBQSxHQUhVOyIsCiAgIm5hbWVzIjogW10KfQo=
