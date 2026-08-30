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
import * as nls from "../../../../nls.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import { registerEditorContribution, EditorAction, registerEditorAction, EditorContributionInstantiation } from "../../../../editor/browser/editorExtensions.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Handler } from "../../../../editor/common/editorCommon.js";
import { EndOfLinePreference } from "../../../../editor/common/model.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { SelectionClipboardContributionID } from "../browser/selectionClipboard.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Event } from "../../../../base/common/event.js";
import { addDisposableListener, onDidRegisterWindow } from "../../../../base/browser/dom.js";
let SelectionClipboard = class extends Disposable {
  constructor(editor, clipboardService) {
    super();
    if (platform.isLinux) {
      let isEnabled = editor.getOption(EditorOption.selectionClipboard);
      this._register(editor.onDidChangeConfiguration((e) => {
        if (e.hasChanged(EditorOption.selectionClipboard)) {
          isEnabled = editor.getOption(EditorOption.selectionClipboard);
        }
      }));
      const setSelectionToClipboard = this._register(new RunOnceScheduler(() => {
        if (!editor.hasModel()) {
          return;
        }
        const model = editor.getModel();
        let selections = editor.getSelections();
        selections = selections.slice(0);
        selections.sort(Range.compareRangesUsingStarts);
        let resultLength = 0;
        for (const sel of selections) {
          if (sel.isEmpty()) {
            return;
          }
          resultLength += model.getValueLengthInRange(sel);
        }
        if (resultLength > SelectionClipboard.SELECTION_LENGTH_LIMIT) {
          return;
        }
        const result = [];
        for (const sel of selections) {
          result.push(model.getValueInRange(sel, EndOfLinePreference.TextDefined));
        }
        const textToCopy = result.join(model.getEOL());
        clipboardService.writeText(textToCopy, "selection");
      }, 100));
      this._register(editor.onDidChangeCursorSelection((e) => {
        if (!isEnabled) {
          return;
        }
        if (e.source === "restoreState") {
          return;
        }
        setSelectionToClipboard.schedule();
      }));
    }
  }
};
SelectionClipboard.SELECTION_LENGTH_LIMIT = 65536;
SelectionClipboard = __decorateClass([
  __decorateParam(1, IClipboardService)
], SelectionClipboard);
let LinuxSelectionClipboardPastePreventer = class extends Disposable {
  constructor(configurationService) {
    super();
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      disposables.add(addDisposableListener(window.document, "mouseup", (e) => {
        if (e.button === 1) {
          const config = configurationService.getValue("editor");
          if (!config.selectionClipboard) {
            e.preventDefault();
          }
        }
      }));
    }, { window: mainWindow, disposables: this._store }));
  }
};
LinuxSelectionClipboardPastePreventer.ID = "workbench.contrib.linuxSelectionClipboardPastePreventer";
LinuxSelectionClipboardPastePreventer = __decorateClass([
  __decorateParam(0, IConfigurationService)
], LinuxSelectionClipboardPastePreventer);
class PasteSelectionClipboardAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.selectionClipboardPaste",
      label: nls.localize2("actions.pasteSelectionClipboard", "Paste Selection Clipboard"),
      precondition: EditorContextKeys.writable
    });
  }
  async run(accessor, editor, args) {
    const clipboardService = accessor.get(IClipboardService);
    const text = await clipboardService.readText("selection");
    editor.trigger("keyboard", Handler.Paste, {
      text,
      pasteOnNewLine: false,
      multicursorText: null
    });
  }
}
registerEditorContribution(SelectionClipboardContributionID, SelectionClipboard, EditorContributionInstantiation.Eager);
if (platform.isLinux) {
  registerWorkbenchContribution2(LinuxSelectionClipboardPastePreventer.ID, LinuxSelectionClipboardPastePreventer, WorkbenchPhase.BlockRestore);
  registerEditorAction(PasteSelectionClipboardAction);
}
export {
  SelectionClipboard
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGVsZWN0cm9uLWJyb3dzZXJcXHNlbGVjdGlvbkNsaXBib2FyZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCBFZGl0b3JBY3Rpb24sIFNlcnZpY2VzQWNjZXNzb3IsIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElDdXJzb3JTZWxlY3Rpb25DaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2N1cnNvckV2ZW50cy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uLCBIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lUHJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uQ2xpcGJvYXJkQ29udHJpYnV0aW9uSUQgfSBmcm9tICcuLi9icm93c2VyL3NlbGVjdGlvbkNsaXBib2FyZC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIG9uRGlkUmVnaXN0ZXJXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcblxuZXhwb3J0IGNsYXNzIFNlbGVjdGlvbkNsaXBib2FyZCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VMRUNUSU9OX0xFTkdUSF9MSU1JVCA9IDY1NTM2O1xuXG5cdGNvbnN0cnVjdG9yKGVkaXRvcjogSUNvZGVFZGl0b3IsIEBJQ2xpcGJvYXJkU2VydmljZSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAocGxhdGZvcm0uaXNMaW51eCkge1xuXHRcdFx0bGV0IGlzRW5hYmxlZCA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNlbGVjdGlvbkNsaXBib2FyZCk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGU6IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uc2VsZWN0aW9uQ2xpcGJvYXJkKSkge1xuXHRcdFx0XHRcdGlzRW5hYmxlZCA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNlbGVjdGlvbkNsaXBib2FyZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3Qgc2V0U2VsZWN0aW9uVG9DbGlwYm9hcmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdFx0bGV0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0XHRzZWxlY3Rpb25zID0gc2VsZWN0aW9ucy5zbGljZSgwKTtcblx0XHRcdFx0c2VsZWN0aW9ucy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cblx0XHRcdFx0bGV0IHJlc3VsdExlbmd0aCA9IDA7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2VsIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRpZiAoc2VsLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdFx0Ly8gT25seSB3cml0ZSBpZiBhbGwgY3Vyc29ycyBoYXZlIHNlbGVjdGlvblxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXN1bHRMZW5ndGggKz0gbW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHNlbCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocmVzdWx0TGVuZ3RoID4gU2VsZWN0aW9uQ2xpcGJvYXJkLlNFTEVDVElPTl9MRU5HVEhfTElNSVQpIHtcblx0XHRcdFx0XHQvLyBUaGlzIGlzIGEgbGFyZ2Ugc2VsZWN0aW9uIVxuXHRcdFx0XHRcdC8vID0+IGRvIG5vdCB3cml0ZSBpdCB0byB0aGUgc2VsZWN0aW9uIGNsaXBib2FyZFxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBzZWwgb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKG1vZGVsLmdldFZhbHVlSW5SYW5nZShzZWwsIEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRleHRUb0NvcHkgPSByZXN1bHQuam9pbihtb2RlbC5nZXRFT0woKSk7XG5cdFx0XHRcdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRleHRUb0NvcHksICdzZWxlY3Rpb24nKTtcblx0XHRcdH0sIDEwMCkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGU6IElDdXJzb3JTZWxlY3Rpb25DaGFuZ2VkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKCFpc0VuYWJsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuc291cmNlID09PSAncmVzdG9yZVN0YXRlJykge1xuXHRcdFx0XHRcdC8vIGRvIG5vdCBzZXQgc2VsZWN0aW9uIHRvIGNsaXBib2FyZCBpZiB0aGlzIHNlbGVjdGlvbiBjaGFuZ2Vcblx0XHRcdFx0XHQvLyB3YXMgY2F1c2VkIGJ5IHJlc3RvcmluZyBlZGl0b3JzLi4uXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldFNlbGVjdGlvblRvQ2xpcGJvYXJkLnNjaGVkdWxlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cbn1cblxuY2xhc3MgTGludXhTZWxlY3Rpb25DbGlwYm9hcmRQYXN0ZVByZXZlbnRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubGludXhTZWxlY3Rpb25DbGlwYm9hcmRQYXN0ZVByZXZlbnRlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUob25EaWRSZWdpc3RlcldpbmRvdywgKHsgd2luZG93LCBkaXNwb3NhYmxlcyB9KSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbmRvdy5kb2N1bWVudCwgJ21vdXNldXAnLCBlID0+IHtcblx0XHRcdFx0aWYgKGUuYnV0dG9uID09PSAxKSB7XG5cdFx0XHRcdFx0Ly8gbWlkZGxlIGJ1dHRvblxuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgc2VsZWN0aW9uQ2xpcGJvYXJkOiBib29sZWFuIH0+KCdlZGl0b3InKTtcblx0XHRcdFx0XHRpZiAoIWNvbmZpZy5zZWxlY3Rpb25DbGlwYm9hcmQpIHtcblx0XHRcdFx0XHRcdC8vIHNlbGVjdGlvbiBjbGlwYm9hcmQgaXMgZGlzYWJsZWRcblx0XHRcdFx0XHRcdC8vIHRyeSB0byBzdG9wIHRoZSB1cGNvbWluZyBwYXN0ZVxuXHRcdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0sIHsgd2luZG93OiBtYWluV2luZG93LCBkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUgfSkpO1xuXHR9XG59XG5cbmNsYXNzIFBhc3RlU2VsZWN0aW9uQ2xpcGJvYXJkQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uc2VsZWN0aW9uQ2xpcGJvYXJkUGFzdGUnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMucGFzdGVTZWxlY3Rpb25DbGlwYm9hcmQnLCBcIlBhc3RlIFNlbGVjdGlvbiBDbGlwYm9hcmRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cblx0XHQvLyByZWFkIHNlbGVjdGlvbiBjbGlwYm9hcmRcblx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgY2xpcGJvYXJkU2VydmljZS5yZWFkVGV4dCgnc2VsZWN0aW9uJyk7XG5cblx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCBIYW5kbGVyLlBhc3RlLCB7XG5cdFx0XHR0ZXh0OiB0ZXh0LFxuXHRcdFx0cGFzdGVPbk5ld0xpbmU6IGZhbHNlLFxuXHRcdFx0bXVsdGljdXJzb3JUZXh0OiBudWxsXG5cdFx0fSk7XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oU2VsZWN0aW9uQ2xpcGJvYXJkQ29udHJpYnV0aW9uSUQsIFNlbGVjdGlvbkNsaXBib2FyZCwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5FYWdlcik7IC8vIGVhZ2VyIGJlY2F1c2UgaXQgbmVlZHMgdG8gbGlzdGVuIHRvIHNlbGVjdGlvbiBjaGFuZ2UgZXZlbnRzXG5pZiAocGxhdGZvcm0uaXNMaW51eCkge1xuXHRyZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTGludXhTZWxlY3Rpb25DbGlwYm9hcmRQYXN0ZVByZXZlbnRlci5JRCwgTGludXhTZWxlY3Rpb25DbGlwYm9hcmRQYXN0ZVByZXZlbnRlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTsgLy8gZWFnZXIgYmVjYXVzZSBpdCBsaXN0ZW5zIHRvIG1vdXNlLXVwIGV2ZW50cyBnbG9iYWxseVxuXHRyZWdpc3RlckVkaXRvckFjdGlvbihQYXN0ZVNlbGVjdGlvbkNsaXBib2FyZEFjdGlvbik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtCQUFrQjtBQUMzQixZQUFZLGNBQWM7QUFFMUIsU0FBUyw0QkFBNEIsY0FBZ0Msc0JBQXNCLHVDQUF1QztBQUNsSSxTQUFvQyxvQkFBb0I7QUFFeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQThCLGVBQWU7QUFDN0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBaUMsZ0JBQWdCLHNDQUFzQztBQUN2RixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUIsMkJBQTJCO0FBRXBELElBQU0scUJBQU4sY0FBaUMsV0FBMEM7QUFBQSxFQUdqRixZQUFZLFFBQXdDLGtCQUFxQztBQUN4RixVQUFNO0FBRU4sUUFBSSxTQUFTLFNBQVM7QUFDckIsVUFBSSxZQUFZLE9BQU8sVUFBVSxhQUFhLGtCQUFrQjtBQUVoRSxXQUFLLFVBQVUsT0FBTyx5QkFBeUIsQ0FBQyxNQUFpQztBQUNoRixZQUFJLEVBQUUsV0FBVyxhQUFhLGtCQUFrQixHQUFHO0FBQ2xELHNCQUFZLE9BQU8sVUFBVSxhQUFhLGtCQUFrQjtBQUFBLFFBQzdEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixZQUFNLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxpQkFBaUIsTUFBTTtBQUN6RSxZQUFJLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDdkI7QUFBQSxRQUNEO0FBQ0EsY0FBTSxRQUFRLE9BQU8sU0FBUztB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
