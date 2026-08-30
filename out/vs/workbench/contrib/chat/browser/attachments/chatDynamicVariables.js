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
import { coalesce } from "../../../../../base/common/arrays.js";
import { Emitter } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, dispose, isDisposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { isLocation } from "../../../../../editor/common/languages.js";
import { Action2, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IChatRequestVariableEntry, isImageVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { toAttachedContextDynamicVariable } from "../../common/attachments/chatVariables.js";
const dynamicVariableDecorationType = "chat-dynamic-variable";
let ChatDynamicVariableModel = class extends Disposable {
  constructor(widget, labelService) {
    super();
    this.widget = widget;
    this.labelService = labelService;
    this._variables = [];
    this._onDidChangeReferences = this._register(new Emitter());
    /**
     * Fires whenever the set of dynamic-variable references changes (added,
     * removed, moved, or restored). Consumers that render UI derived from the
     * references should listen to this instead of relying on
     * `onDidChangeParsedInput`, which does not fire when a reference is added
     * without changing the parsed request (e.g. a `/command` reference that the
     * parser resolves as a slash-prompt part).
     */
    this.onDidChangeReferences = this._onDidChangeReferences.event;
    this.decorationData = [];
    this._editorListener = this._register(new MutableDisposable());
    this._subscribeToEditor();
    this._register(widget.onDidChangeActiveInputEditor(() => {
      this._subscribeToEditor();
      this.updateDecorations();
    }));
    this._register(widget.input.attachmentModel.onDidChange(() => this.updateDecorations()));
  }
  get variables() {
    return [...this._variables];
  }
  get id() {
    return ChatDynamicVariableModel.ID;
  }
  _subscribeToEditor() {
    this._editorListener.value = this.widget.inputEditor.onDidChangeModelContent((e) => {
      const removed = [];
      let didChange = false;
      this._variables = coalesce(this._variables.map((ref, idx) => {
        const model = this.widget.inputEditor.getModel();
        if (!model) {
          removed.push(ref);
          return null;
        }
        const data = this.decorationData[idx];
        if (!data) {
          removed.push(ref);
          return null;
        }
        const newRange = model.getDecorationRange(data.id);
        if (!newRange) {
          removed.push(ref);
          return null;
        }
        const newText = model.getValueInRange(newRange);
        if (newText !== data.text) {
          const replacement = e.changes.find(
            (change) => change.rangeOffset <= data.rangeOffset && change.rangeOffset + change.rangeLength >= data.rangeOffset + data.text.length
          );
          const preservedRange = replacement && this.findReferenceRangeInReplacement(model, e.changes, replacement, data);
          if (preservedRange) {
            didChange = true;
            return { ...ref, range: preservedRange };
          }
          if (!replacement) {
            this.widget.inputEditor.executeEdits(this.id, [{
              range: newRange,
              text: ""
            }]);
            this.widget.refreshParsedInput();
          }
          removed.push(ref);
          return null;
        }
        if (newRange.equalsRange(ref.range)) {
          return ref;
        }
        didChange = true;
        return { ...ref, range: newRange };
      }));
      dispose(removed.filter(isDisposable));
      if (didChange || removed.length > 0) {
        this.widget.refreshParsedInput();
        this._onDidChangeReferences.fire();
      }
      this.updateDecorations();
    });
  }
  findReferenceRangeInReplacement(model, changes, replacement, data) {
    if (!data.text) {
      return void 0;
    }
    const previousRelativeOffset = data.rangeOffset - replacement.rangeOffset;
    let matchOffset = replacement.text.indexOf(data.text);
    let closestMatchOffset = matchOffset;
    while (matchOffset !== -1) {
      if (Math.abs(matchOffset - previousRelativeOffset) < Math.abs(closestMatchOffset - previousRelativeOffset)) {
        closestMatchOffset = matchOffset;
      }
      matchOffset = replacement.text.indexOf(data.text, matchOffset + data.text.length);
    }
    if (closestMatchOffset === -1) {
      return void 0;
    }
    const precedingChangesDelta = changes.reduce((delta, change) => change.rangeOffset < replacement.rangeOffset ? delta + change.text.length - change.rangeLength : delta, 0);
    const startOffset = replacement.rangeOffset + precedingChangesDelta + closestMatchOffset;
    const range = Range.fromPositions(
      model.getPositionAt(startOffset),
      model.getPositionAt(startOffset + data.text.length)
    );
    return model.getValueInRange(range) === data.text ? range : void 0;
  }
  getInputState(contrib) {
    contrib[ChatDynamicVariableModel.ID] = [...this._variables];
  }
  setInputState(contrib) {
    let s = contrib[ChatDynamicVariableModel.ID];
    if (!Array.isArray(s)) {
      s = [];
    }
    this.disposeVariables();
    this._variables = [];
    for (const variable of s) {
      if (!isDynamicVariable(variable)) {
        continue;
      }
      this.addReference(variable);
    }
  }
  addReference(ref) {
    if (!isValidEditorRange(ref.range)) {
      return;
    }
    const existingAttachment = this.widget.input.attachmentModel.attachments.find((attachment) => attachment.id === ref.id && !attachment.range);
    if (existingAttachment) {
      ref = toAttachedContextDynamicVariable(existingAttachment, ref.range);
    }
    this._variables.push(ref);
    this.updateDecorations();
    this.widget.refreshParsedInput();
    this._onDidChangeReferences.fire();
  }
  updateDecorations() {
    const model = this.widget.inputEditor.getModel();
    if (!model) {
      this.decorationData = [];
      return;
    }
    const validVariables = this._variables.filter((v) => isValidEditorRange(v.range));
    const decorationIds = this.widget.inputEditor.setDecorationsByType("chat", dynamicVariableDecorationType, validVariables.map((r) => ({
      range: r.range,
      hoverMessage: this.getHoverForReference(r)
    })));
    this._variables = validVariables.slice(0, decorationIds.length);
    this.decorationData = [];
    for (let i = 0; i < decorationIds.length; i++) {
      const range = this._variables[i].range;
      this.decorationData.push({
        id: decorationIds[i],
        text: model.getValueInRange(range),
        rangeOffset: model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn })
      });
    }
  }
  getHoverForReference(ref) {
    const attachment = this.widget.input.attachmentModel.attachments.find((attachment2) => attachment2.id === ref.id && !attachment2.range);
    if (attachment) {
      return isImageVariableEntry(attachment) ? void 0 : this.createAttachmentLabelHover(attachment);
    }
    const value = ref.data;
    if (URI.isUri(value)) {
      return new MarkdownString(this.labelService.getUriLabel(value, { relative: true }));
    } else if (isLocation(value)) {
      const prefix = ref.fullName ? ` ${ref.fullName}` : "";
      const rangeString = `#${value.range.startLineNumber}-${value.range.endLineNumber}`;
      return new MarkdownString(prefix + this.labelService.getUriLabel(value.uri, { relative: true }) + rangeString);
    } else {
      return void 0;
    }
  }
  createAttachmentLabelHover(attachment) {
    const resource = IChatRequestVariableEntry.toUri(attachment) ?? attachment.references?.find((reference) => URI.isUri(reference.reference))?.reference;
    const label = URI.isUri(resource) ? this.labelService.getUriLabel(resource, { relative: true }) : attachment.modelDescription ?? attachment.fullName ?? attachment.name;
    return new MarkdownString().appendText(label);
  }
  /**
   * Dispose all existing variables.
   */
  disposeVariables() {
    for (const variable of this._variables) {
      if (isDisposable(variable)) {
        variable.dispose();
      }
    }
  }
  dispose() {
    this.disposeVariables();
    super.dispose();
  }
};
ChatDynamicVariableModel.ID = "chatDynamicVariableModel";
ChatDynamicVariableModel = __decorateClass([
  __decorateParam(1, ILabelService)
], ChatDynamicVariableModel);
function isDynamicVariable(obj) {
  return obj && typeof obj.id === "string" && Range.isIRange(obj.range) && isValidEditorRange(obj.range) && "data" in obj;
}
function isValidEditorRange(range) {
  if (range.startLineNumber < 1 || range.endLineNumber < 1 || range.startColumn < 1 || range.endColumn < 1) {
    return false;
  }
  if (range.startLineNumber > range.endLineNumber) {
    return false;
  }
  if (range.startLineNumber === range.endLineNumber && range.startColumn >= range.endColumn) {
    return false;
  }
  return true;
}
function isAddDynamicVariableContext(context) {
  return "widget" in context && "range" in context && "variableData" in context;
}
const _AddDynamicVariableAction = class _AddDynamicVariableAction extends Action2 {
  constructor() {
    super({
      id: _AddDynamicVariableAction.ID,
      title: ""
      // not displayed
    });
  }
  async run(accessor, ...args) {
    const context = args[0];
    if (!isAddDynamicVariableContext(context)) {
      return;
    }
    let range = context.range;
    const variableData = context.variableData;
    const doCleanup = () => {
      context.widget.inputEditor.executeEdits("chatInsertDynamicVariableWithArguments", [{ range: context.range, text: `` }]);
    };
    if (context.command) {
      const commandService = accessor.get(ICommandService);
      const selection = await commandService.executeCommand(context.command.id, ...context.command.arguments ?? []);
      if (!selection) {
        doCleanup();
        return;
      }
      const insertText = ":" + selection;
      const insertRange = new Range(range.startLineNumber, range.endColumn, range.endLineNumber, range.endColumn + insertText.length);
      range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + insertText.length);
      const editor = context.widget.inputEditor;
      const success = editor.executeEdits("chatInsertDynamicVariableWithArguments", [{ range: insertRange, text: insertText + " " }]);
      if (!success) {
        doCleanup();
        return;
      }
    }
    context.widget.getContrib(ChatDynamicVariableModel.ID)?.addReference({
      id: context.id,
      range,
      isFile: true,
      data: variableData
    });
  }
};
_AddDynamicVariableAction.ID = "workbench.action.chat.addDynamicVariable";
let AddDynamicVariableAction = _AddDynamicVariableAction;
registerAction2(AddDynamicVariableAction);
export {
  AddDynamicVariableAction,
  ChatDynamicVariableModel,
  dynamicVariableDecorationType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGF0dGFjaG1lbnRzXFxjaGF0RHluYW1pY1ZhcmlhYmxlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIGRpc3Bvc2UsIGlzRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgQ29tbWFuZCwgaXNMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL21pcnJvclRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzSW1hZ2VWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVWYWx1ZSwgSUR5bmFtaWNWYXJpYWJsZSwgdG9BdHRhY2hlZENvbnRleHREeW5hbWljVmFyaWFibGUgfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRDb250cmliIH0gZnJvbSAnLi4vd2lkZ2V0L2NoYXRXaWRnZXQuanMnO1xuXG5leHBvcnQgY29uc3QgZHluYW1pY1ZhcmlhYmxlRGVjb3JhdGlvblR5cGUgPSAnY2hhdC1keW5hbWljLXZhcmlhYmxlJztcblxuXG5cbmV4cG9ydCBjbGFzcyBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRXaWRnZXRDb250cmliIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwnO1xuXG5cdHByaXZhdGUgX3ZhcmlhYmxlczogSUR5bmFtaWNWYXJpYWJsZVtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZWZlcmVuY2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuZXZlciB0aGUgc2V0IG9mIGR5bmFtaWMtdmFyaWFibGUgcmVmZXJlbmNlcyBjaGFuZ2VzIChhZGRlZCxcblx0ICogcmVtb3ZlZCwgbW92ZWQsIG9yIHJlc3RvcmVkKS4gQ29uc3VtZXJzIHRoYXQgcmVuZGVyIFVJIGRlcml2ZWQgZnJvbSB0aGVcblx0ICogcmVmZXJlbmNlcyBzaG91bGQgbGlzdGVuIHRvIHRoaXMgaW5zdGVhZCBvZiByZWx5aW5nIG9uXG5cdCAqIGBvbkRpZENoYW5nZVBhcnNlZElucHV0YCwgd2hpY2ggZG9lcyBub3QgZmlyZSB3aGVuIGEgcmVmZXJlbmNlIGlzIGFkZGVkXG5cdCAqIHdpdGhvdXQgY2hhbmdpbmcgdGhlIHBhcnNlZCByZXF1ZXN0IChlLmcuIGEgYC9jb21tYW5kYCByZWZlcmVuY2UgdGhhdCB0aGVcblx0ICogcGFyc2VyIHJlc29sdmVzIGFzIGEgc2xhc2gtcHJvbXB0IHBhcnQpLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWZlcmVuY2VzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlUmVmZXJlbmNlcy5ldmVudDtcblxuXHRnZXQgdmFyaWFibGVzKCk6IFJlYWRvbmx5QXJyYXk8SUR5bmFtaWNWYXJpYWJsZT4ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fdmFyaWFibGVzXTtcblx0fVxuXG5cdGdldCBpZCgpIHtcblx0XHRyZXR1cm4gQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLklEO1xuXHR9XG5cblx0cHJpdmF0ZSBkZWNvcmF0aW9uRGF0YTogeyBpZDogc3RyaW5nOyB0ZXh0OiBzdHJpbmc7IHJhbmdlT2Zmc2V0OiBudW1iZXIgfVtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3aWRnZXQ6IElDaGF0V2lkZ2V0LFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fc3Vic2NyaWJlVG9FZGl0b3IoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih3aWRnZXQub25EaWRDaGFuZ2VBY3RpdmVJbnB1dEVkaXRvcigoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdWJzY3JpYmVUb0VkaXRvcigpO1xuXHRcdFx0dGhpcy51cGRhdGVEZWNvcmF0aW9ucygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih3aWRnZXQuaW5wdXQuYXR0YWNobWVudE1vZGVsLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlRGVjb3JhdGlvbnMoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3Vic2NyaWJlVG9FZGl0b3IoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yTGlzdGVuZXIudmFsdWUgPSB0aGlzLndpZGdldC5pbnB1dEVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudChlID0+IHtcblxuXHRcdFx0Y29uc3QgcmVtb3ZlZDogSUR5bmFtaWNWYXJpYWJsZVtdID0gW107XG5cdFx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cblx0XHRcdC8vIERvbid0IG11dGF0ZSBlbnRyaWVzIGluIF92YXJpYWJsZXMsIHNpbmNlIHRoZXkgd2lsbCBiZSByZXR1cm5lZCBmcm9tIHRoZSBnZXR0ZXJcblx0XHRcdHRoaXMuX3ZhcmlhYmxlcyA9IGNvYWxlc2NlKHRoaXMuX3ZhcmlhYmxlcy5tYXAoKHJlZiwgaWR4KTogSUR5bmFtaWNWYXJpYWJsZSB8IG51bGwgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRcdHJlbW92ZWQucHVzaChyZWYpO1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuZGVjb3JhdGlvbkRhdGFbaWR4XTtcblx0XHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdFx0cmVtb3ZlZC5wdXNoKHJlZik7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbmV3UmFuZ2UgPSBtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoZGF0YS5pZCk7XG5cblx0XHRcdFx0aWYgKCFuZXdSYW5nZSkge1xuXHRcdFx0XHRcdC8vIGdvbmVcblx0XHRcdFx0XHRyZW1vdmVkLnB1c2gocmVmKTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5ld1RleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3UmFuZ2UpO1xuXHRcdFx0XHRpZiAobmV3VGV4dCAhPT0gZGF0YS50ZXh0KSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSBlLmNoYW5nZXMuZmluZChjaGFuZ2UgPT5cblx0XHRcdFx0XHRcdGNoYW5nZS5yYW5nZU9mZnNldCA8PSBkYXRhLnJhbmdlT2Zmc2V0XG5cdFx0XHRcdFx0XHQmJiBjaGFuZ2UucmFuZ2VPZmZzZXQgKyBjaGFuZ2UucmFuZ2VMZW5ndGggPj0gZGF0YS5yYW5nZU9mZnNldCArIGRhdGEudGV4dC5sZW5ndGhcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGNvbnN0IHByZXNlcnZlZFJhbmdlID0gcmVwbGFjZW1lbnQgJiYgdGhpcy5maW5kUmVmZXJlbmNlUmFuZ2VJblJlcGxhY2VtZW50KG1vZGVsLCBlLmNoYW5nZXMsIHJlcGxhY2VtZW50LCBkYXRhKTtcblx0XHRcdFx0XHRpZiAocHJlc2VydmVkUmFuZ2UpIHtcblx0XHRcdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyAuLi5yZWYsIHJhbmdlOiBwcmVzZXJ2ZWRSYW5nZSB9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghcmVwbGFjZW1lbnQpIHtcblx0XHRcdFx0XHRcdHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLmV4ZWN1dGVFZGl0cyh0aGlzLmlkLCBbe1xuXHRcdFx0XHRcdFx0XHRyYW5nZTogbmV3UmFuZ2UsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0XHRcdFx0fV0pO1xuXHRcdFx0XHRcdFx0dGhpcy53aWRnZXQucmVmcmVzaFBhcnNlZElucHV0KCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVtb3ZlZC5wdXNoKHJlZik7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobmV3UmFuZ2UuZXF1YWxzUmFuZ2UocmVmLnJhbmdlKSkge1xuXHRcdFx0XHRcdC8vIGFsbCBnb29kXG5cdFx0XHRcdFx0cmV0dXJuIHJlZjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cblx0XHRcdFx0cmV0dXJuIHsgLi4ucmVmLCByYW5nZTogbmV3UmFuZ2UgfTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gY2xlYW51cCBkaXNwb3NhYmxlIHZhcmlhYmxlc1xuXHRcdFx0ZGlzcG9zZShyZW1vdmVkLmZpbHRlcihpc0Rpc3Bvc2FibGUpKTtcblxuXHRcdFx0aWYgKGRpZENoYW5nZSB8fCByZW1vdmVkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy53aWRnZXQucmVmcmVzaFBhcnNlZElucHV0KCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVmZXJlbmNlcy5maXJlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudXBkYXRlRGVjb3JhdGlvbnMoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZmluZFJlZmVyZW5jZVJhbmdlSW5SZXBsYWNlbWVudChcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRjaGFuZ2VzOiByZWFkb25seSBJTW9kZWxDb250ZW50Q2hhbmdlW10sXG5cdFx0cmVwbGFjZW1lbnQ6IElNb2RlbENvbnRlbnRDaGFuZ2UsXG5cdFx0ZGF0YTogeyB0ZXh0OiBzdHJpbmc7IHJhbmdlT2Zmc2V0OiBudW1iZXIgfVxuXHQpOiBSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFkYXRhLnRleHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNSZWxhdGl2ZU9mZnNldCA9IGRhdGEucmFuZ2VPZmZzZXQgLSByZXBsYWNlbWVudC5yYW5nZU9mZnNldDtcblx0XHRsZXQgbWF0Y2hPZmZzZXQgPSByZXBsYWNlbWVudC50ZXh0LmluZGV4T2YoZGF0YS50ZXh0KTtcblx0XHRsZXQgY2xvc2VzdE1hdGNoT2Zmc2V0ID0gbWF0Y2hPZmZzZXQ7XG5cdFx0d2hpbGUgKG1hdGNoT2Zmc2V0ICE9PSAtMSkge1xuXHRcdFx0aWYgKE1hdGguYWJzKG1hdGNoT2Zmc2V0IC0gcHJldmlvdXNSZWxhdGl2ZU9mZnNldCkgPCBNYXRoLmFicyhjbG9zZXN0TWF0Y2hPZmZzZXQgLSBwcmV2aW91c1JlbGF0aXZlT2Zmc2V0KSkge1xuXHRcdFx0XHRjbG9zZXN0TWF0Y2hPZmZzZXQgPSBtYXRjaE9mZnNldDtcblx0XHRcdH1cblx0XHRcdG1hdGNoT2Zmc2V0ID0gcmVwbGFjZW1lbnQudGV4dC5pbmRleE9mKGRhdGEudGV4dCwgbWF0Y2hPZmZzZXQgKyBkYXRhLnRleHQubGVuZ3RoKTtcblx0XHR9XG5cblx0XHRpZiAoY2xvc2VzdE1hdGNoT2Zmc2V0ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwcmVjZWRpbmdDaGFuZ2VzRGVsdGEgPSBjaGFuZ2VzLnJlZHVjZSgoZGVsdGEsIGNoYW5nZSkgPT5cblx0XHRcdGNoYW5nZS5yYW5nZU9mZnNldCA8IHJlcGxhY2VtZW50LnJhbmdlT2Zmc2V0ID8gZGVsdGEgKyBjaGFuZ2UudGV4dC5sZW5ndGggLSBjaGFuZ2UucmFuZ2VMZW5ndGggOiBkZWx0YSwgMCk7XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSByZXBsYWNlbWVudC5yYW5nZU9mZnNldCArIHByZWNlZGluZ0NoYW5nZXNEZWx0YSArIGNsb3Nlc3RNYXRjaE9mZnNldDtcblx0XHRjb25zdCByYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMoXG5cdFx0XHRtb2RlbC5nZXRQb3NpdGlvbkF0KHN0YXJ0T2Zmc2V0KSxcblx0XHRcdG1vZGVsLmdldFBvc2l0aW9uQXQoc3RhcnRPZmZzZXQgKyBkYXRhLnRleHQubGVuZ3RoKVxuXHRcdCk7XG5cdFx0cmV0dXJuIG1vZGVsLmdldFZhbHVlSW5SYW5nZShyYW5nZSkgPT09IGRhdGEudGV4dCA/IHJhbmdlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0SW5wdXRTdGF0ZShjb250cmliOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRcdGNvbnRyaWJbQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLklEXSA9IFsuLi50aGlzLl92YXJpYWJsZXNdO1xuXHR9XG5cblx0c2V0SW5wdXRTdGF0ZShjb250cmliOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4pOiB2b2lkIHtcblx0XHRsZXQgcyA9IGNvbnRyaWJbQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLklEXSBhcyB1bmtub3duW107XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHMpKSB7XG5cdFx0XHRzID0gW107XG5cdFx0fVxuXG5cdFx0dGhpcy5kaXNwb3NlVmFyaWFibGVzKCk7XG5cdFx0dGhpcy5fdmFyaWFibGVzID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIHMpIHtcblx0XHRcdGlmICghaXNEeW5hbWljVmFyaWFibGUodmFyaWFibGUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFkZFJlZmVyZW5jZSh2YXJpYWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0YWRkUmVmZXJlbmNlKHJlZjogSUR5bmFtaWNWYXJpYWJsZSk6IHZvaWQge1xuXHRcdGlmICghaXNWYWxpZEVkaXRvclJhbmdlKHJlZi5yYW5nZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZ0F0dGFjaG1lbnQgPSB0aGlzLndpZGdldC5pbnB1dC5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMuZmluZChhdHRhY2htZW50ID0+IGF0dGFjaG1lbnQuaWQgPT09IHJlZi5pZCAmJiAhYXR0YWNobWVudC5yYW5nZSk7XG5cdFx0aWYgKGV4aXN0aW5nQXR0YWNobWVudCkge1xuXHRcdFx0cmVmID0gdG9BdHRhY2hlZENvbnRleHREeW5hbWljVmFyaWFibGUoZXhpc3RpbmdBdHRhY2htZW50LCByZWYucmFuZ2UpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZhcmlhYmxlcy5wdXNoKHJlZik7XG5cdFx0dGhpcy51cGRhdGVEZWNvcmF0aW9ucygpO1xuXHRcdHRoaXMud2lkZ2V0LnJlZnJlc2hQYXJzZWRJbnB1dCgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVmZXJlbmNlcy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZURlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy53aWRnZXQuaW5wdXRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aGlzLmRlY29yYXRpb25EYXRhID0gW107XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsaWRWYXJpYWJsZXMgPSB0aGlzLl92YXJpYWJsZXMuZmlsdGVyKHYgPT4gaXNWYWxpZEVkaXRvclJhbmdlKHYucmFuZ2UpKTtcblx0XHRjb25zdCBkZWNvcmF0aW9uSWRzID0gdGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUoJ2NoYXQnLCBkeW5hbWljVmFyaWFibGVEZWNvcmF0aW9uVHlwZSwgdmFsaWRWYXJpYWJsZXMubWFwKChyKTogSURlY29yYXRpb25PcHRpb25zID0+ICh7XG5cdFx0XHRyYW5nZTogci5yYW5nZSxcblx0XHRcdGhvdmVyTWVzc2FnZTogdGhpcy5nZXRIb3ZlckZvclJlZmVyZW5jZShyKVxuXHRcdH0pKSk7XG5cblx0XHR0aGlzLl92YXJpYWJsZXMgPSB2YWxpZFZhcmlhYmxlcy5zbGljZSgwLCBkZWNvcmF0aW9uSWRzLmxlbmd0aCk7XG5cdFx0dGhpcy5kZWNvcmF0aW9uRGF0YSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGVjb3JhdGlvbklkcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl92YXJpYWJsZXNbaV0ucmFuZ2U7XG5cdFx0XHR0aGlzLmRlY29yYXRpb25EYXRhLnB1c2goe1xuXHRcdFx0XHRpZDogZGVjb3JhdGlvbklkc1tpXSxcblx0XHRcdFx0dGV4dDogbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJhbmdlKSxcblx0XHRcdFx0cmFuZ2VPZmZzZXQ6IG1vZGVsLmdldE9mZnNldEF0KHsgbGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjb2x1bW46IHJhbmdlLnN0YXJ0Q29sdW1uIH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEhvdmVyRm9yUmVmZXJlbmNlKHJlZjogSUR5bmFtaWNWYXJpYWJsZSk6IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0YWNobWVudCA9IHRoaXMud2lkZ2V0LmlucHV0LmF0dGFjaG1lbnRNb2RlbC5hdHRhY2htZW50cy5maW5kKGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudC5pZCA9PT0gcmVmLmlkICYmICFhdHRhY2htZW50LnJhbmdlKTtcblx0XHRpZiAoYXR0YWNobWVudCkge1xuXHRcdFx0cmV0dXJuIGlzSW1hZ2VWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpID8gdW5kZWZpbmVkIDogdGhpcy5jcmVhdGVBdHRhY2htZW50TGFiZWxIb3ZlcihhdHRhY2htZW50KTtcblx0XHR9XG5cblx0XHRjb25zdCB2YWx1ZSA9IHJlZi5kYXRhO1xuXHRcdGlmIChVUkkuaXNVcmkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHZhbHVlLCB7IHJlbGF0aXZlOiB0cnVlIH0pKTtcblx0XHR9IGVsc2UgaWYgKGlzTG9jYXRpb24odmFsdWUpKSB7XG5cdFx0XHRjb25zdCBwcmVmaXggPSByZWYuZnVsbE5hbWUgPyBgICR7cmVmLmZ1bGxOYW1lfWAgOiAnJztcblx0XHRcdGNvbnN0IHJhbmdlU3RyaW5nID0gYCMke3ZhbHVlLnJhbmdlLnN0YXJ0TGluZU51bWJlcn0tJHt2YWx1ZS5yYW5nZS5lbmRMaW5lTnVtYmVyfWA7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKHByZWZpeCArIHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHZhbHVlLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSArIHJhbmdlU3RyaW5nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUF0dGFjaG1lbnRMYWJlbEhvdmVyKGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBJTWFya2Rvd25TdHJpbmcge1xuXHRcdGNvbnN0IHJlc291cmNlID0gSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeS50b1VyaShhdHRhY2htZW50KSA/PyBhdHRhY2htZW50LnJlZmVyZW5jZXM/LmZpbmQocmVmZXJlbmNlID0+IFVSSS5pc1VyaShyZWZlcmVuY2UucmVmZXJlbmNlKSk/LnJlZmVyZW5jZTtcblx0XHRjb25zdCBsYWJlbCA9IFVSSS5pc1VyaShyZXNvdXJjZSlcblx0XHRcdD8gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSlcblx0XHRcdDogYXR0YWNobWVudC5tb2RlbERlc2NyaXB0aW9uID8/IGF0dGFjaG1lbnQuZnVsbE5hbWUgPz8gYXR0YWNobWVudC5uYW1lO1xuXHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KGxhYmVsKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlIGFsbCBleGlzdGluZyB2YXJpYWJsZXMuXG5cdCAqL1xuXHRwcml2YXRlIGRpc3Bvc2VWYXJpYWJsZXMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiB0aGlzLl92YXJpYWJsZXMpIHtcblx0XHRcdGlmIChpc0Rpc3Bvc2FibGUodmFyaWFibGUpKSB7XG5cdFx0XHRcdHZhcmlhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLmRpc3Bvc2VWYXJpYWJsZXMoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBMb29zZSBjaGVjayB0byBmaWx0ZXIgb2JqZWN0cyB0aGF0IGFyZSBvYnZpb3VzbHkgbWlzc2luZyBkYXRhXG4gKi9cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5mdW5jdGlvbiBpc0R5bmFtaWNWYXJpYWJsZShvYmo6IGFueSk6IG9iaiBpcyBJRHluYW1pY1ZhcmlhYmxlIHtcblx0cmV0dXJuIG9iaiAmJlxuXHRcdHR5cGVvZiBvYmouaWQgPT09ICdzdHJpbmcnICYmXG5cdFx0UmFuZ2UuaXNJUmFuZ2Uob2JqLnJhbmdlKSAmJlxuXHRcdGlzVmFsaWRFZGl0b3JSYW5nZShvYmoucmFuZ2UpICYmXG5cdFx0J2RhdGEnIGluIG9iajtcbn1cblxuZnVuY3Rpb24gaXNWYWxpZEVkaXRvclJhbmdlKHJhbmdlOiBJUmFuZ2UpOiBib29sZWFuIHtcblx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciA8IDEgfHwgcmFuZ2UuZW5kTGluZU51bWJlciA8IDEgfHwgcmFuZ2Uuc3RhcnRDb2x1bW4gPCAxIHx8IHJhbmdlLmVuZENvbHVtbiA8IDEpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIgJiYgcmFuZ2Uuc3RhcnRDb2x1bW4gPj0gcmFuZ2UuZW5kQ29sdW1uKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cblxuXG5leHBvcnQgaW50ZXJmYWNlIElBZGREeW5hbWljVmFyaWFibGVDb250ZXh0IHtcblx0aWQ6IHN0cmluZztcblx0d2lkZ2V0OiBJQ2hhdFdpZGdldDtcblx0cmFuZ2U6IElSYW5nZTtcblx0dmFyaWFibGVEYXRhOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZVZhbHVlO1xuXHRjb21tYW5kPzogQ29tbWFuZDtcbn1cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmZ1bmN0aW9uIGlzQWRkRHluYW1pY1ZhcmlhYmxlQ29udGV4dChjb250ZXh0OiBhbnkpOiBjb250ZXh0IGlzIElBZGREeW5hbWljVmFyaWFibGVDb250ZXh0IHtcblx0cmV0dXJuICd3aWRnZXQnIGluIGNvbnRleHQgJiZcblx0XHQncmFuZ2UnIGluIGNvbnRleHQgJiZcblx0XHQndmFyaWFibGVEYXRhJyBpbiBjb250ZXh0O1xufVxuXG5leHBvcnQgY2xhc3MgQWRkRHluYW1pY1ZhcmlhYmxlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYWRkRHluYW1pY1ZhcmlhYmxlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQWRkRHluYW1pY1ZhcmlhYmxlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6ICcnIC8vIG5vdCBkaXNwbGF5ZWRcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGFyZ3NbMF07XG5cdFx0aWYgKCFpc0FkZER5bmFtaWNWYXJpYWJsZUNvbnRleHQoY29udGV4dCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgcmFuZ2UgPSBjb250ZXh0LnJhbmdlO1xuXHRcdGNvbnN0IHZhcmlhYmxlRGF0YSA9IGNvbnRleHQudmFyaWFibGVEYXRhO1xuXG5cdFx0Y29uc3QgZG9DbGVhbnVwID0gKCkgPT4ge1xuXHRcdFx0Ly8gRmFpbGVkLCByZW1vdmUgdGhlIGRhbmdsaW5nIHZhcmlhYmxlIHByZWZpeFxuXHRcdFx0Y29udGV4dC53aWRnZXQuaW5wdXRFZGl0b3IuZXhlY3V0ZUVkaXRzKCdjaGF0SW5zZXJ0RHluYW1pY1ZhcmlhYmxlV2l0aEFyZ3VtZW50cycsIFt7IHJhbmdlOiBjb250ZXh0LnJhbmdlLCB0ZXh0OiBgYCB9XSk7XG5cdFx0fTtcblxuXHRcdC8vIElmIHRoaXMgY29tcGxldGlvbiBpdGVtIGhhcyBubyBjb21tYW5kLCByZXR1cm4gaXQgZGlyZWN0bHlcblx0XHRpZiAoY29udGV4dC5jb21tYW5kKSB7XG5cdFx0XHQvLyBJbnZva2UgdGhlIGNvbW1hbmQgb24gdGhpcyBjb21wbGV0aW9uIGl0ZW0gYWxvbmcgd2l0aCBpdHMgYXJncyBhbmQgcmV0dXJuIHRoZSByZXN1bHRcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbnRleHQuY29tbWFuZC5pZCwgLi4uKGNvbnRleHQuY29tbWFuZC5hcmd1bWVudHMgPz8gW10pKTtcblx0XHRcdGlmICghc2VsZWN0aW9uKSB7XG5cdFx0XHRcdGRvQ2xlYW51cCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbXB1dGUgbmV3IHJhbmdlIGFuZCB2YXJpYWJsZURhdGFcblx0XHRcdGNvbnN0IGluc2VydFRleHQgPSAnOicgKyBzZWxlY3Rpb247XG5cdFx0XHRjb25zdCBpbnNlcnRSYW5nZSA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uICsgaW5zZXJ0VGV4dC5sZW5ndGgpO1xuXHRcdFx0cmFuZ2UgPSBuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uICsgaW5zZXJ0VGV4dC5sZW5ndGgpO1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gY29udGV4dC53aWRnZXQuaW5wdXRFZGl0b3I7XG5cdFx0XHRjb25zdCBzdWNjZXNzID0gZWRpdG9yLmV4ZWN1dGVFZGl0cygnY2hhdEluc2VydER5bmFtaWNWYXJpYWJsZVdpdGhBcmd1bWVudHMnLCBbeyByYW5nZTogaW5zZXJ0UmFuZ2UsIHRleHQ6IGluc2VydFRleHQgKyAnICcgfV0pO1xuXHRcdFx0aWYgKCFzdWNjZXNzKSB7XG5cdFx0XHRcdGRvQ2xlYW51cCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29udGV4dC53aWRnZXQuZ2V0Q29udHJpYjxDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWw+KENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCk/LmFkZFJlZmVyZW5jZSh7XG5cdFx0XHRpZDogY29udGV4dC5pZCxcblx0XHRcdHJhbmdlOiByYW5nZSxcblx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdGRhdGE6IHZhcmlhYmxlRGF0YVxuXHRcdH0pO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoQWRkRHluYW1pY1ZhcmlhYmxlQWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFzQjtBQUMvQixTQUEwQixzQkFBc0I7QUFDaEQsU0FBUyxZQUFZLFNBQVMsY0FBYyx5QkFBeUI7QUFDckUsU0FBUyxXQUFXO0FBQ3BCLFNBQWlCLGFBQWE7QUFFOUIsU0FBa0Isa0JBQWtCO0FBR3BDLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMs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QTRCLFNBQXFEO0FBQ3pGLFNBQU8sWUFBWSxXQUNsQixXQUFXLFdBQ1gsa0JBQWtCO0FBQ3BCO0FBRU8sTUFBTSw0QkFBTixNQUFNLGtDQUFpQyxRQUFRO0FBQUEsRUFHckQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUksMEJBQXlCO0FBQUEsTUFDN0IsT0FBTztBQUFBO0FBQUEsSUFDUixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLGFBQStCLE1BQWlCO0FBQ3pELFVBQU0sVUFBVSxLQUFLLENBQUM7QUFDdEIsUUFBSSxDQUFDLDRCQUE0QixPQUFPLEdBQUc7QUFDMUM7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFRLFFBQVE7QUFDcEIsVUFBTSxlQUFlLFFBQVE7QUFFN0IsVUFBTSxZQUFZLE1BQU07QUFFdkIsY0FBUSxPQUFPLFlBQVksYUFBYSwwQ0FBMEMsQ0FBQyxFQUFFLE9BQU8sUUFBUSxPQUFPLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFBQSxJQUN2SDtBQUdBLFFBQUksUUFBUSxTQUFTO0FBRXBCLFlBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFlBQU0sWUFBZ0MsTUFBTSxlQUFlLGVBQWUsUUFBUSxRQUFRLElBQUksR0FBSSxRQUFRLFFBQVEsYUFBYSxDQUFDLENBQUU7QUFDbEksVUFBSSxDQUFDLFdBQVc7QUFDZixrQkFBVTtBQUNWO0FBQUEsTUFDRDtBQUdBLFlBQU0sYUFBYSxNQUFNO0FBQ3pCLFlBQU0sY0FBYyxJQUFJLE1BQU0sTUFBTSxpQkFBaUIsTUFBTSxXQUFXLE1BQU0sZUFBZSxNQUFNLFlBQVksV0FBVyxNQUFNO0FBQzlILGNBQVEsSUFBSSxNQUFNLE1BQU0saUJBQWlCLE1BQU0sYUFBYSxNQUFNLGVBQWUsTUFBTSxZQUFZLFdBQVcsTUFBTTtBQUNwSCxZQUFNLFNBQVMsUUFBUSxPQUFPO0FBQzlCLFlBQU0sVUFBVSxPQUFPLGFBQWEsMENBQTBDLENBQUMsRUFBRSxPQUFPLGFBQWEsTUFBTSxhQUFhLElBQUksQ0FBQyxDQUFDO0FBQzlILFVBQUksQ0FBQyxTQUFTO0FBQ2Isa0JBQVU7QUFDVjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsWUFBUSxPQUFPLFdBQXFDLHlCQUF5QixFQUFFLEdBQUcsYUFBYTtBQUFBLE1BQzlGLElBQUksUUFBUTtBQUFBLE1BQ1o7QUFBQSxNQUNBLFFBQVE7QUFBQSxNQUNSLE1BQU07QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFyRGEsMEJBQ0ksS0FBSztBQURmLElBQU0sMkJBQU47QUFzRFAsZ0JBQWdCLHdCQUF3QjsiLAogICJuYW1lcyI6IFsiYXR0YWNobWVudCJdCn0K
