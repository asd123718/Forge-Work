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
import { findNodeAtLocation, parseTree } from "../../../../../base/common/json.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { getLeadingWhitespace } from "../../../../../base/common/strings.js";
import { isString } from "../../../../../base/common/types.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { EditOperation } from "../../../../../editor/common/core/editOperation.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { registerEditorFeature } from "../../../../../editor/common/editorFeatures.js";
import { isITextModel } from "../../../../../editor/common/model.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { localize } from "../../../../../nls.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILanguageModelToolsService } from "../../common/tools/languageModelToolsService.js";
import { showToolsPicker } from "../actions/chatToolPicker.js";
let ToolSetsCodeLensProvider = class extends Disposable {
  constructor(languageFeaturesService, languageModelToolsService, instantiationService) {
    super();
    this.languageFeaturesService = languageFeaturesService;
    this.languageModelToolsService = languageModelToolsService;
    this.instantiationService = instantiationService;
    // `_`-prefix marks this as private command
    this.cmdId = `_configureToolSetTools/${generateUuid()}`;
    this._register(this.languageFeaturesService.codeLensProvider.register({ language: "jsonc" }, this));
    this._register(CommandsRegistry.registerCommand(this.cmdId, (_accessor, ...args) => {
      const modelArg = args[0];
      const rangeArg = args[1];
      const toolsArg = args[2];
      if (isITextModel(modelArg) && Range.isIRange(rangeArg) && Array.isArray(toolsArg) && toolsArg.every(isString)) {
        return this.updateTools(modelArg, Range.lift(rangeArg), toolsArg);
      }
      return void 0;
    }));
  }
  provideCodeLenses(model, _token) {
    if (!model.uri.path.endsWith(".toolsets.jsonc")) {
      return void 0;
    }
    const root = parseTree(model.getValue());
    if (!root || root.type !== "object" || !root.children) {
      return void 0;
    }
    const lenses = [];
    for (const property of root.children) {
      if (property.type !== "property" || !property.children || property.children.length !== 2) {
        continue;
      }
      const [keyNode, valueNode] = property.children;
      if (valueNode.type !== "object") {
        continue;
      }
      const toolsNode = findNodeAtLocation(valueNode, ["tools"]);
      if (!toolsNode || toolsNode.type !== "array") {
        continue;
      }
      const selectedTools = (toolsNode.children ?? []).filter((item) => item.type === "string" && isString(item.value)).map((item) => item.value);
      const keyStart = model.getPositionAt(keyNode.offset);
      const valueRange = this.rangeFromNode(model, toolsNode);
      lenses.push({
        range: Range.fromPositions(keyStart),
        command: {
          title: localize("configure-tools.capitalized.ellipsis", "Configure Tools..."),
          id: this.cmdId,
          arguments: [model, valueRange, selectedTools]
        }
      });
    }
    return { lenses };
  }
  rangeFromNode(model, node) {
    const start = model.getPositionAt(node.offset);
    const end = model.getPositionAt(node.offset + node.length);
    return Range.fromPositions(start, end);
  }
  async updateTools(model, range, selectedTools) {
    const getToolsEntries = () => this.languageModelToolsService.toToolAndToolSetEnablementMap(selectedTools, void 0);
    const newSelected = await this.instantiationService.invokeFunction(showToolsPicker, localize("placeholder", "Select tools"), "toolSetCodeLens", void 0, getToolsEntries);
    if (!newSelected) {
      return;
    }
    const newNames = this.languageModelToolsService.toFullReferenceNames(newSelected);
    const newValue = this.formatToolsArray(model, range, newNames);
    model.pushStackElement();
    model.pushEditOperations(null, [EditOperation.replaceMove(range, newValue)], () => null);
    model.pushStackElement();
  }
  formatToolsArray(model, range, toolNames) {
    if (toolNames.length === 0) {
      return "[]";
    }
    const { insertSpaces, indentSize } = model.getOptions();
    const oneIndent = insertSpaces ? " ".repeat(indentSize) : "	";
    const baseIndent = getLeadingWhitespace(model.getLineContent(range.startLineNumber));
    const itemIndent = baseIndent + oneIndent;
    const items = toolNames.map((name) => `${itemIndent}${JSON.stringify(name)}`).join(",\n");
    return `[
${items}
${baseIndent}]`;
  }
};
ToolSetsCodeLensProvider = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, ILanguageModelToolsService),
  __decorateParam(2, IInstantiationService)
], ToolSetsCodeLensProvider);
registerEditorFeature(ToolSetsCodeLensProvider);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdFN5bnRheFxccHJvbXB0VG9vbFNldHNDb2RlTGVuc1Byb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZmluZE5vZGVBdExvY2F0aW9uLCBOb2RlLCBwYXJzZVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2V0TGVhZGluZ1doaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJFZGl0b3JGZWF0dXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBDb2RlTGVucywgQ29kZUxlbnNMaXN0LCBDb2RlTGVuc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgaXNJVGV4dE1vZGVsLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2hvd1Rvb2xzUGlja2VyIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0VG9vbFBpY2tlci5qcyc7XG5cbi8qKlxuICogUHJvdmlkZXMgYSBcIkNvbmZpZ3VyZSBUb29scy4uLlwiIGNvZGUgbGVucyBhYm92ZSB0aGUgYHRvb2xzYCBhcnJheSBvZiBldmVyeVxuICogdG9vbCBzZXQgZGVmaW5lZCBpbiBhIGAudG9vbHNldHMuanNvbmNgIGZpbGUuIENsaWNraW5nIHRoZSBsZW5zIG9wZW5zIHRoZVxuICogc2hhcmVkIHRvb2xzIHBpY2tlciBzZWVkZWQgd2l0aCB0aGUgY3VycmVudGx5IHJlZmVyZW5jZWQgdG9vbHMgYW5kIHdyaXRlcyB0aGVcbiAqIG5ldyBzZWxlY3Rpb24gYmFjayBpbnRvIHRoZSBhcnJheSB1c2luZyBxdWFsaWZpZWQgcmVmZXJlbmNlIG5hbWVzLlxuICovXG5jbGFzcyBUb29sU2V0c0NvZGVMZW5zUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgQ29kZUxlbnNQcm92aWRlciB7XG5cblx0Ly8gYF9gLXByZWZpeCBtYXJrcyB0aGlzIGFzIHByaXZhdGUgY29tbWFuZFxuXHRwcml2YXRlIHJlYWRvbmx5IGNtZElkID0gYF9jb25maWd1cmVUb29sU2V0VG9vbHMvJHtnZW5lcmF0ZVV1aWQoKX1gO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlTGVuc1Byb3ZpZGVyLnJlZ2lzdGVyKHsgbGFuZ3VhZ2U6ICdqc29uYycgfSwgdGhpcykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQodGhpcy5jbWRJZCwgKF9hY2Nlc3NvciwgLi4uYXJncykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxBcmcgPSBhcmdzWzBdIGFzIElFZGl0b3JNb2RlbDtcblx0XHRcdGNvbnN0IHJhbmdlQXJnID0gYXJnc1sxXTtcblx0XHRcdGNvbnN0IHRvb2xzQXJnID0gYXJnc1syXTtcblx0XHRcdGlmIChpc0lUZXh0TW9kZWwobW9kZWxBcmcpICYmIFJhbmdlLmlzSVJhbmdlKHJhbmdlQXJnKSAmJiBBcnJheS5pc0FycmF5KHRvb2xzQXJnKSAmJiB0b29sc0FyZy5ldmVyeShpc1N0cmluZykpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudXBkYXRlVG9vbHMobW9kZWxBcmcsIFJhbmdlLmxpZnQocmFuZ2VBcmcpLCB0b29sc0FyZyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByb3ZpZGVDb2RlTGVuc2VzKG1vZGVsOiBJVGV4dE1vZGVsLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogQ29kZUxlbnNMaXN0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIW1vZGVsLnVyaS5wYXRoLmVuZHNXaXRoKCcudG9vbHNldHMuanNvbmMnKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByb290ID0gcGFyc2VUcmVlKG1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdGlmICghcm9vdCB8fCByb290LnR5cGUgIT09ICdvYmplY3QnIHx8ICFyb290LmNoaWxkcmVuKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxlbnNlczogQ29kZUxlbnNbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcHJvcGVydHkgb2Ygcm9vdC5jaGlsZHJlbikge1xuXHRcdFx0aWYgKHByb3BlcnR5LnR5cGUgIT09ICdwcm9wZXJ0eScgfHwgIXByb3BlcnR5LmNoaWxkcmVuIHx8IHByb3BlcnR5LmNoaWxkcmVuLmxlbmd0aCAhPT0gMikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IFtrZXlOb2RlLCB2YWx1ZU5vZGVdID0gcHJvcGVydHkuY2hpbGRyZW47XG5cdFx0XHRpZiAodmFsdWVOb2RlLnR5cGUgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9vbHNOb2RlID0gZmluZE5vZGVBdExvY2F0aW9uKHZhbHVlTm9kZSwgWyd0b29scyddKTtcblx0XHRcdGlmICghdG9vbHNOb2RlIHx8IHRvb2xzTm9kZS50eXBlICE9PSAnYXJyYXknKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZWxlY3RlZFRvb2xzID0gKHRvb2xzTm9kZS5jaGlsZHJlbiA/PyBbXSlcblx0XHRcdFx0LmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZSA9PT0gJ3N0cmluZycgJiYgaXNTdHJpbmcoaXRlbS52YWx1ZSkpXG5cdFx0XHRcdC5tYXAoaXRlbSA9PiBpdGVtLnZhbHVlIGFzIHN0cmluZyk7XG5cblx0XHRcdGNvbnN0IGtleVN0YXJ0ID0gbW9kZWwuZ2V0UG9zaXRpb25BdChrZXlOb2RlLm9mZnNldCk7XG5cdFx0XHRjb25zdCB2YWx1ZVJhbmdlID0gdGhpcy5yYW5nZUZyb21Ob2RlKG1vZGVsLCB0b29sc05vZGUpO1xuXG5cdFx0XHRsZW5zZXMucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKGtleVN0YXJ0KSxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29uZmlndXJlLXRvb2xzLmNhcGl0YWxpemVkLmVsbGlwc2lzJywgXCJDb25maWd1cmUgVG9vbHMuLi5cIiksXG5cdFx0XHRcdFx0aWQ6IHRoaXMuY21kSWQsXG5cdFx0XHRcdFx0YXJndW1lbnRzOiBbbW9kZWwsIHZhbHVlUmFuZ2UsIHNlbGVjdGVkVG9vbHNdXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGxlbnNlcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSByYW5nZUZyb21Ob2RlKG1vZGVsOiBJVGV4dE1vZGVsLCBub2RlOiBOb2RlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IHN0YXJ0ID0gbW9kZWwuZ2V0UG9zaXRpb25BdChub2RlLm9mZnNldCk7XG5cdFx0Y29uc3QgZW5kID0gbW9kZWwuZ2V0UG9zaXRpb25BdChub2RlLm9mZnNldCArIG5vZGUubGVuZ3RoKTtcblx0XHRyZXR1cm4gUmFuZ2UuZnJvbVBvc2l0aW9ucyhzdGFydCwgZW5kKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlVG9vbHMobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSwgc2VsZWN0ZWRUb29sczogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBnZXRUb29sc0VudHJpZXMgPSAoKSA9PiB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAoc2VsZWN0ZWRUb29scywgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBuZXdTZWxlY3RlZCA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oc2hvd1Rvb2xzUGlja2VyLCBsb2NhbGl6ZSgncGxhY2Vob2xkZXInLCBcIlNlbGVjdCB0b29sc1wiKSwgJ3Rvb2xTZXRDb2RlTGVucycsIHVuZGVmaW5lZCwgZ2V0VG9vbHNFbnRyaWVzKTtcblx0XHRpZiAoIW5ld1NlbGVjdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3TmFtZXMgPSB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UudG9GdWxsUmVmZXJlbmNlTmFtZXMobmV3U2VsZWN0ZWQpO1xuXHRcdGNvbnN0IG5ld1ZhbHVlID0gdGhpcy5mb3JtYXRUb29sc0FycmF5KG1vZGVsLCByYW5nZSwgbmV3TmFtZXMpO1xuXG5cdFx0bW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBbRWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZShyYW5nZSwgbmV3VmFsdWUpXSwgKCkgPT4gbnVsbCk7XG5cdFx0bW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRUb29sc0FycmF5KG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UsIHRvb2xOYW1lczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmcge1xuXHRcdGlmICh0b29sTmFtZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJ1tdJztcblx0XHR9XG5cblx0XHRjb25zdCB7IGluc2VydFNwYWNlcywgaW5kZW50U2l6ZSB9ID0gbW9kZWwuZ2V0T3B0aW9ucygpO1xuXHRcdGNvbnN0IG9uZUluZGVudCA9IGluc2VydFNwYWNlcyA/ICcgJy5yZXBlYXQoaW5kZW50U2l6ZSkgOiAnXFx0Jztcblx0XHRjb25zdCBiYXNlSW5kZW50ID0gZ2V0TGVhZGluZ1doaXRlc3BhY2UobW9kZWwuZ2V0TGluZUNvbnRlbnQocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0Y29uc3QgaXRlbUluZGVudCA9IGJhc2VJbmRlbnQgKyBvbmVJbmRlbnQ7XG5cblx0XHRjb25zdCBpdGVtcyA9IHRvb2xOYW1lcy5tYXAobmFtZSA9PiBgJHtpdGVtSW5kZW50fSR7SlNPTi5zdHJpbmdpZnkobmFtZSl9YCkuam9pbignLFxcbicpO1xuXHRcdHJldHVybiBgW1xcbiR7aXRlbXN9XFxuJHtiYXNlSW5kZW50fV1gO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yRmVhdHVyZShUb29sU2V0c0NvZGVMZW5zUHJvdmlkZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLG9CQUEwQixpQkFBaUI7QUFDcEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhO0FBRXRCLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsb0JBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsdUJBQXVCO0FBUWhDLElBQU0sMkJBQU4sY0FBdUMsV0FBdUM7QUFBQSxFQUs3RSxZQUM0Qyx5QkFDRSwyQkFDTCxzQkFDdkM7QUFDRCxVQUFNO0FBSnFDO0FBQ0U7QUFDTDtBQUx6QztBQUFBLFNBQWlCLFFBQVEsMEJBQTBCLGFBQWEsQ0FBQztBQVNoRSxTQUFLLFVBQVUsS0FBSyx3QkFBd0IsaUJBQWlCLFNBQVMsRUFBRSxVQUFVLFFBQVEsR0FBRyxJQUFJLENBQUM7QUFFbEcsU0FBSyxVQUFVLGlCQUFpQixnQkFBZ0IsS0FBSyxPQUFPLENBQUMsY0FBYyxTQUFTO0FBQ25GLFlBQU0sV0FBVyxLQUFLLENBQUM7QUFDdkIsWUFBTSxXQUFXLEtBQUssQ0FBQztBQUN2QixZQUFNLFdBQVcsS0FBSyxDQUFDO0FBQ3ZCLFVBQUksYUFBYSxRQUFRLEtB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
