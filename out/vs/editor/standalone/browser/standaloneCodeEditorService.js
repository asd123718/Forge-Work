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
import { windowOpenNoOpener } from "../../../base/browser/dom.js";
import { Schemas } from "../../../base/common/network.js";
import { AbstractCodeEditorService } from "../../browser/services/abstractCodeEditorService.js";
import { ICodeEditorService } from "../../browser/services/codeEditorService.js";
import { ScrollType } from "../../common/editorCommon.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { InstantiationType, registerSingleton } from "../../../platform/instantiation/common/extensions.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
let StandaloneCodeEditorService = class extends AbstractCodeEditorService {
  constructor(contextKeyService, themeService) {
    super(themeService);
    this._register(this.onCodeEditorAdd(() => this._checkContextKey()));
    this._register(this.onCodeEditorRemove(() => this._checkContextKey()));
    this._editorIsOpen = contextKeyService.createKey("editorIsOpen", false);
    this._activeCodeEditor = null;
    this._register(this.registerCodeEditorOpenHandler(async (input, source, sideBySide) => {
      if (!source) {
        return null;
      }
      return this.doOpenEditor(source, input);
    }));
  }
  _checkContextKey() {
    let hasCodeEditor = false;
    for (const editor of this.listCodeEditors()) {
      if (!editor.isSimpleWidget) {
        hasCodeEditor = true;
        break;
      }
    }
    this._editorIsOpen.set(hasCodeEditor);
  }
  setActiveCodeEditor(activeCodeEditor) {
    this._activeCodeEditor = activeCodeEditor;
  }
  getActiveCodeEditor() {
    return this._activeCodeEditor;
  }
  doOpenEditor(editor, input) {
    const model = this.findModel(editor, input.resource);
    if (!model) {
      if (input.resource) {
        const schema = input.resource.scheme;
        if (schema === Schemas.http || schema === Schemas.https) {
          windowOpenNoOpener(input.resource.toString());
          return editor;
        }
      }
      return null;
    }
    const selection = input.options ? input.options.selection : null;
    if (selection) {
      if (typeof selection.endLineNumber === "number" && typeof selection.endColumn === "number") {
        editor.setSelection(selection);
        editor.revealRangeInCenter(selection, ScrollType.Immediate);
      } else {
        const pos = {
          lineNumber: selection.startLineNumber,
          column: selection.startColumn
        };
        editor.setPosition(pos);
        editor.revealPositionInCenter(pos, ScrollType.Immediate);
      }
    }
    return editor;
  }
  findModel(editor, resource) {
    const model = editor.getModel();
    if (model && model.uri.toString() !== resource.toString()) {
      return null;
    }
    return model;
  }
};
StandaloneCodeEditorService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IThemeService)
], StandaloneCodeEditorService);
registerSingleton(ICodeEditorService, StandaloneCodeEditorService, InstantiationType.Eager);
export {
  StandaloneCodeEditorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHN0YW5kYWxvbmVcXGJyb3dzZXJcXHN0YW5kYWxvbmVDb2RlRWRpdG9yU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHdpbmRvd09wZW5Ob09wZW5lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEFic3RyYWN0Q29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3NlcnZpY2VzL2Fic3RyYWN0Q29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgU3RhbmRhbG9uZUNvZGVFZGl0b3JTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RDb2RlRWRpdG9yU2VydmljZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9ySXNPcGVuOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYWN0aXZlQ29kZUVkaXRvcjogSUNvZGVFZGl0b3IgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkNvZGVFZGl0b3JBZGQoKCkgPT4gdGhpcy5fY2hlY2tDb250ZXh0S2V5KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uQ29kZUVkaXRvclJlbW92ZSgoKSA9PiB0aGlzLl9jaGVja0NvbnRleHRLZXkoKSkpO1xuXHRcdHRoaXMuX2VkaXRvcklzT3BlbiA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgnZWRpdG9ySXNPcGVuJywgZmFsc2UpO1xuXHRcdHRoaXMuX2FjdGl2ZUNvZGVFZGl0b3IgPSBudWxsO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZWdpc3RlckNvZGVFZGl0b3JPcGVuSGFuZGxlcihhc3luYyAoaW5wdXQsIHNvdXJjZSwgc2lkZUJ5U2lkZSkgPT4ge1xuXHRcdFx0aWYgKCFzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5kb09wZW5FZGl0b3Ioc291cmNlLCBpbnB1dCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hlY2tDb250ZXh0S2V5KCk6IHZvaWQge1xuXHRcdGxldCBoYXNDb2RlRWRpdG9yID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgdGhpcy5saXN0Q29kZUVkaXRvcnMoKSkge1xuXHRcdFx0aWYgKCFlZGl0b3IuaXNTaW1wbGVXaWRnZXQpIHtcblx0XHRcdFx0aGFzQ29kZUVkaXRvciA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9lZGl0b3JJc09wZW4uc2V0KGhhc0NvZGVFZGl0b3IpO1xuXHR9XG5cblx0cHVibGljIHNldEFjdGl2ZUNvZGVFZGl0b3IoYWN0aXZlQ29kZUVkaXRvcjogSUNvZGVFZGl0b3IgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlQ29kZUVkaXRvciA9IGFjdGl2ZUNvZGVFZGl0b3I7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWN0aXZlQ29kZUVkaXRvcigpOiBJQ29kZUVkaXRvciB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVDb2RlRWRpdG9yO1xuXHR9XG5cblxuXHRwcml2YXRlIGRvT3BlbkVkaXRvcihlZGl0b3I6IElDb2RlRWRpdG9yLCBpbnB1dDogSVRleHRSZXNvdXJjZUVkaXRvcklucHV0KTogSUNvZGVFZGl0b3IgfCBudWxsIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZmluZE1vZGVsKGVkaXRvciwgaW5wdXQucmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdGlmIChpbnB1dC5yZXNvdXJjZSkge1xuXG5cdFx0XHRcdGNvbnN0IHNjaGVtYSA9IGlucHV0LnJlc291cmNlLnNjaGVtZTtcblx0XHRcdFx0aWYgKHNjaGVtYSA9PT0gU2NoZW1hcy5odHRwIHx8IHNjaGVtYSA9PT0gU2NoZW1hcy5odHRwcykge1xuXHRcdFx0XHRcdC8vIFRoaXMgaXMgYSBmdWxseSBxdWFsaWZpZWQgaHR0cCBvciBodHRwcyBVUkxcblx0XHRcdFx0XHR3aW5kb3dPcGVuTm9PcGVuZXIoaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0cmV0dXJuIGVkaXRvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gPElSYW5nZT4oaW5wdXQub3B0aW9ucyA/IGlucHV0Lm9wdGlvbnMuc2VsZWN0aW9uIDogbnVsbCk7XG5cdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0aWYgKHR5cGVvZiBzZWxlY3Rpb24uZW5kTGluZU51bWJlciA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHNlbGVjdGlvbi5lbmRDb2x1bW4gPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uKTtcblx0XHRcdFx0ZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXIoc2VsZWN0aW9uLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBwb3MgPSB7XG5cdFx0XHRcdFx0bGluZU51bWJlcjogc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRjb2x1bW46IHNlbGVjdGlvbi5zdGFydENvbHVtblxuXHRcdFx0XHR9O1xuXHRcdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24ocG9zKTtcblx0XHRcdFx0ZWRpdG9yLnJldmVhbFBvc2l0aW9uSW5DZW50ZXIocG9zLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdHByaXZhdGUgZmluZE1vZGVsKGVkaXRvcjogSUNvZGVFZGl0b3IsIHJlc291cmNlOiBVUkkpOiBJVGV4dE1vZGVsIHwgbnVsbCB7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwgJiYgbW9kZWwudXJpLnRvU3RyaW5nKCkgIT09IHJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQ29kZUVkaXRvclNlcnZpY2UsIFN0YW5kYWxvbmVDb2RlRWRpdG9yU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFHeEIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxrQkFBa0I7QUFFM0IsU0FBc0IsMEJBQTBCO0FBRWhELFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHFCQUFxQjtBQUV2QixJQUFNLDhCQUFOLGNBQTBDLDBCQUEwQjtBQUFBLEVBSzFFLFlBQ3FCLG1CQUNMLGNBQ2Q7QUFDRCxVQUFNLFlBQVk7QUFDbEIsU0FBSyxVQUFVLEtBQUssZ0JBQWdCLE1BQU0sS0FBSyxpQkFBaUIsQ0FBQyxDQUFDO0FBQ2xFLFNBQUssVUFBVSxLQUFLLG1CQUFtQixNQUFNLEtBQUssaUJBQWlCLENBQUMsQ0FBQztBQUNyRSxTQUFLLGdCQUFnQixrQkFBa0IsVUFBVSxnQkFBZ0IsS0FBSztBQUN0RSxTQUFLLG9CQUFvQjtBQUV6QixTQUFLLFVBQVUsS0FBSyw4QkFBOEIsT0FBTyxPQUFPLFFBQVEsZUFBZTtBQUN0RixVQUFJLENBQUMsUUFBUTtBQUNaLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTyxLQUFLLGFBQWEsUUFBUSxLQUFLO0FBQUEsSUFDdkMsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsbUJBQXlCO0FBQ2hDLFFBQUksZ0JBQWdCO0FBQ3BCLGVBQVcsVUFBVSxLQUFLLGdCQUFnQixHQUFHO0FBQzVDLFVBQUksQ0FBQyxPQUFPLGdCQUFnQjtBQUMzQix3QkFBZ0I7QUFDaEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFNBQUssY0FBYyxJQUFJLGFBQWE7QUFBQSxFQUNyQztBQUFBLEVBRU8sb0JBQW9CLGtCQUE0QztBQUN0RSxTQUFLLG9CQUFvQjtBQUFBLEVBQzFCO0FBQUEsRUFFTyxzQkFBMEM7QUFDaEQsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBR1EsYUFBYSxRQUFxQixPQUFxRDtBQUM5RixVQUFNLFFBQVEsS0FBSyxVQUFVLFFBQVEsTUFBTSxRQUFRO0FBQ25ELFFBQUksQ0FBQyxPQUFPO0FBQ1gsVUFBSSxNQUFNLFVBQVU7QUFFbkIsY0FBTSxTQUFTLE1BQU0sU0FBUztBQUM5QixZQUFJLFdBQVcsUUFBUSxRQUFRLFdBQVcsUUFBUSxPQUFPO0FBRXhELDZCQUFtQixNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQzVDLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sWUFBcUIsTUFBTSxVQUFVLE1BQU0sUUFBUSxZQUFZO0FBQ3JFLFFBQUksV0FBVztBQUNkLFVBQUksT0FBTyxVQUFVLGtCQUFrQixZQUFZLE9BQU8sVUFBVSxjQUFjLFVBQVU7QUFDM0YsZUFBTyxhQUFhLFNBQVM7QUFDN0IsZUFBTyxvQkFBb0IsV0FBVyxXQUFXLFNBQVM7QUFBQSxNQUMzRCxPQUFPO0FBQ04sY0FBTSxNQUFNO0FBQUEsVUFDWCxZQUFZLFVBQVU7QUFBQSxVQUN0QixRQUFRLFVBQVU7QUFBQSxRQUNuQjtBQUNBLGVBQU8sWUFBWSxHQUFHO0FBQ3RCLGVBQU8sdUJBQXVCLEtBQUssV0FBVyxTQUFTO0FBQUEsTUFDeEQ7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLFVBQVUsUUFBcUIsVUFBa0M7QUFDeEUsVUFBTSxRQUFRLE9BQU8sU0FBUztBQUM5QixRQUFJLFNBQVMsTUFBTSxJQUFJLFNBQVMsTUFBTSxTQUFTLFNBQVMsR0FBRztBQUMxRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFwRmEsOEJBQU47QUFBQSxFQU1KO0FBQUEsRUFDQTtBQUFBLEdBUFU7QUFzRmIsa0JBQWtCLG9CQUFvQiw2QkFBNkIsa0JBQWtCLEtBQUs7IiwKICAibmFtZXMiOiBbXQp9Cg==
