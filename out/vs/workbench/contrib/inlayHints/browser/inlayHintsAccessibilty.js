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
import * as dom from "../../../../base/browser/dom.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorAction2, EditorContributionInstantiation, registerEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { asCommandLink } from "../../../../editor/contrib/inlayHints/browser/inlayHints.js";
import { InlayHintsController } from "../../../../editor/contrib/inlayHints/browser/inlayHintsController.js";
import { localize, localize2 } from "../../../../nls.js";
import { registerAction2 } from "../../../../platform/actions/common/actions.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Link } from "../../../../platform/opener/browser/link.js";
let InlayHintsAccessibility = class {
  constructor(_editor, contextKeyService, _accessibilitySignalService, _instaService) {
    this._editor = _editor;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._instaService = _instaService;
    this._sessionDispoosables = new DisposableStore();
    this._ariaElement = document.createElement("span");
    this._ariaElement.style.position = "fixed";
    this._ariaElement.className = "inlayhint-accessibility-element";
    this._ariaElement.tabIndex = 0;
    this._ariaElement.setAttribute("aria-description", localize("description", "Code with Inlay Hint Information"));
    this._ctxIsReading = InlayHintsAccessibility.IsReading.bindTo(contextKeyService);
  }
  static get(editor) {
    return editor.getContribution(InlayHintsAccessibility.ID) ?? void 0;
  }
  dispose() {
    this._sessionDispoosables.dispose();
    this._ctxIsReading.reset();
    this._ariaElement.remove();
  }
  _reset() {
    dom.clearNode(this._ariaElement);
    this._sessionDispoosables.clear();
    this._ctxIsReading.reset();
  }
  async _read(line, hints) {
    this._sessionDispoosables.clear();
    if (!this._ariaElement.isConnected) {
      this._editor.getDomNode()?.appendChild(this._ariaElement);
    }
    if (!this._editor.hasModel() || !this._ariaElement.isConnected) {
      this._ctxIsReading.set(false);
      return;
    }
    const cts = new CancellationTokenSource();
    this._sessionDispoosables.add(cts);
    for (const hint of hints) {
      await hint.resolve(cts.token);
    }
    if (cts.token.isCancellationRequested) {
      return;
    }
    const model = this._editor.getModel();
    const newChildren = [];
    let start = 0;
    let tooLongToRead = false;
    for (const item of hints) {
      const part = model.getValueInRange({ startLineNumber: line, startColumn: start + 1, endLineNumber: line, endColumn: item.hint.position.column });
      if (part.length > 0) {
        newChildren.push(part);
        start = item.hint.position.column - 1;
      }
      if (start > 750) {
        newChildren.push("\u2026");
        tooLongToRead = true;
        break;
      }
      const em = document.createElement("em");
      const { label } = item.hint;
      if (typeof label === "string") {
        em.innerText = label;
      } else {
        for (const part2 of label) {
          if (part2.command) {
            const link = this._instaService.createInstance(
              Link,
              em,
              { href: asCommandLink(part2.command), label: part2.label, title: part2.command.title },
              void 0
            );
            this._sessionDispoosables.add(link);
          } else {
            em.innerText += part2.label;
          }
        }
      }
      newChildren.push(em);
    }
    if (!tooLongToRead) {
      newChildren.push(model.getValueInRange({ startLineNumber: line, startColumn: start + 1, endLineNumber: line, endColumn: Number.MAX_SAFE_INTEGER }));
    }
    dom.reset(this._ariaElement, ...newChildren);
    this._ariaElement.focus();
    this._ctxIsReading.set(true);
    this._sessionDispoosables.add(dom.addDisposableListener(this._ariaElement, "focusout", () => {
      this._reset();
    }));
  }
  startInlayHintsReading() {
    if (!this._editor.hasModel()) {
      return;
    }
    const line = this._editor.getPosition().lineNumber;
    const hints = InlayHintsController.get(this._editor)?.getInlayHintsForLine(line);
    if (!hints || hints.length === 0) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.noInlayHints);
    } else {
      this._read(line, hints);
    }
  }
  stopInlayHintsReading() {
    this._reset();
    this._editor.focus();
  }
};
InlayHintsAccessibility.IsReading = new RawContextKey("isReadingLineWithInlayHints", false, { type: "boolean", description: localize("isReadingLineWithInlayHints", "Whether the current line and its inlay hints are currently focused") });
InlayHintsAccessibility.ID = "editor.contrib.InlayHintsAccessibility";
InlayHintsAccessibility = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IAccessibilitySignalService),
  __decorateParam(3, IInstantiationService)
], InlayHintsAccessibility);
registerAction2(class StartReadHints extends EditorAction2 {
  constructor() {
    super({
      id: "inlayHints.startReadingLineWithHint",
      title: localize2("read.title", "Read Line with Inlay Hints"),
      precondition: EditorContextKeys.hasInlayHintsProvider,
      f1: true
    });
  }
  runEditorCommand(_accessor, editor) {
    const ctrl = InlayHintsAccessibility.get(editor);
    ctrl?.startInlayHintsReading();
  }
});
registerAction2(class StopReadHints extends EditorAction2 {
  constructor() {
    super({
      id: "inlayHints.stopReadingLineWithHint",
      title: localize2("stop.title", "Stop Inlay Hints Reading"),
      precondition: InlayHintsAccessibility.IsReading,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.EditorContrib,
        primary: KeyCode.Escape
      }
    });
  }
  runEditorCommand(_accessor, editor) {
    const ctrl = InlayHintsAccessibility.get(editor);
    ctrl?.stopInlayHintsReading();
  }
});
registerEditorContribution(InlayHintsAccessibility.ID, InlayHintsAccessibility, EditorContributionInstantiation.Lazy);
export {
  InlayHintsAccessibility
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlubGF5SGludHNcXGJyb3dzZXJcXGlubGF5SGludHNBY2Nlc3NpYmlsdHkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24yLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJbmxheUhpbnRJdGVtLCBhc0NvbW1hbmRMaW5rIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5sYXlIaW50cy9icm93c2VyL2lubGF5SGludHMuanMnO1xuaW1wb3J0IHsgSW5sYXlIaW50c0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxheUhpbnRzL2Jyb3dzZXIvaW5sYXlIaW50c0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExpbmsgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvYnJvd3Nlci9saW5rLmpzJztcblxuXG5leHBvcnQgY2xhc3MgSW5sYXlIaW50c0FjY2Vzc2liaWxpdHkgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSXNSZWFkaW5nID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2lzUmVhZGluZ0xpbmVXaXRoSW5sYXlIaW50cycsIGZhbHNlLCB7IHR5cGU6ICdib29sZWFuJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdpc1JlYWRpbmdMaW5lV2l0aElubGF5SGludHMnLCBcIldoZXRoZXIgdGhlIGN1cnJlbnQgbGluZSBhbmQgaXRzIGlubGF5IGhpbnRzIGFyZSBjdXJyZW50bHkgZm9jdXNlZFwiKSB9KTtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICdlZGl0b3IuY29udHJpYi5JbmxheUhpbnRzQWNjZXNzaWJpbGl0eSc7XG5cblx0c3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogSW5sYXlIaW50c0FjY2Vzc2liaWxpdHkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElubGF5SGludHNBY2Nlc3NpYmlsaXR5PihJbmxheUhpbnRzQWNjZXNzaWJpbGl0eS5JRCkgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXJpYUVsZW1lbnQ6IEhUTUxTcGFuRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4SXNSZWFkaW5nOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGlzcG9vc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9hcmlhRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHR0aGlzLl9hcmlhRWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdmaXhlZCc7XG5cdFx0dGhpcy5fYXJpYUVsZW1lbnQuY2xhc3NOYW1lID0gJ2lubGF5aGludC1hY2Nlc3NpYmlsaXR5LWVsZW1lbnQnO1xuXHRcdHRoaXMuX2FyaWFFbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9hcmlhRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGVzY3JpcHRpb24nLCBsb2NhbGl6ZSgnZGVzY3JpcHRpb24nLCBcIkNvZGUgd2l0aCBJbmxheSBIaW50IEluZm9ybWF0aW9uXCIpKTtcblxuXHRcdHRoaXMuX2N0eElzUmVhZGluZyA9IElubGF5SGludHNBY2Nlc3NpYmlsaXR5LklzUmVhZGluZy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9vc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jdHhJc1JlYWRpbmcucmVzZXQoKTtcblx0XHR0aGlzLl9hcmlhRWxlbWVudC5yZW1vdmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0KCk6IHZvaWQge1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fYXJpYUVsZW1lbnQpO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb29zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9jdHhJc1JlYWRpbmcucmVzZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWQobGluZTogbnVtYmVyLCBoaW50czogSW5sYXlIaW50SXRlbVtdKSB7XG5cblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9vc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoIXRoaXMuX2FyaWFFbGVtZW50LmlzQ29ubmVjdGVkKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZ2V0RG9tTm9kZSgpPy5hcHBlbmRDaGlsZCh0aGlzLl9hcmlhRWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSB8fCAhdGhpcy5fYXJpYUVsZW1lbnQuaXNDb25uZWN0ZWQpIHtcblx0XHRcdHRoaXMuX2N0eElzUmVhZGluZy5zZXQoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb29zYWJsZXMuYWRkKGN0cyk7XG5cblx0XHRmb3IgKGNvbnN0IGhpbnQgb2YgaGludHMpIHtcblx0XHRcdGF3YWl0IGhpbnQucmVzb2x2ZShjdHMudG9rZW4pO1xuXHRcdH1cblxuXHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHQvLyBjb25zdCB0ZXh0ID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkuZ2V0TGluZUNvbnRlbnQobGluZSk7XG5cdFx0Y29uc3QgbmV3Q2hpbGRyZW46IChzdHJpbmcgfCBIVE1MRWxlbWVudClbXSA9IFtdO1xuXG5cdFx0bGV0IHN0YXJ0ID0gMDtcblx0XHRsZXQgdG9vTG9uZ1RvUmVhZCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGhpbnRzKSB7XG5cblx0XHRcdC8vIHRleHRcblx0XHRcdGNvbnN0IHBhcnQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UoeyBzdGFydExpbmVOdW1iZXI6IGxpbmUsIHN0YXJ0Q29sdW1uOiBzdGFydCArIDEsIGVuZExpbmVOdW1iZXI6IGxpbmUsIGVuZENvbHVtbjogaXRlbS5oaW50LnBvc2l0aW9uLmNvbHVtbiB9KTtcblx0XHRcdGlmIChwYXJ0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bmV3Q2hpbGRyZW4ucHVzaChwYXJ0KTtcblx0XHRcdFx0c3RhcnQgPSBpdGVtLmhpbnQucG9zaXRpb24uY29sdW1uIC0gMTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gY2hlY2sgbGVuZ3RoXG5cdFx0XHRpZiAoc3RhcnQgPiA3NTApIHtcblx0XHRcdFx0bmV3Q2hpbGRyZW4ucHVzaCgnXHUyMDI2Jyk7XG5cdFx0XHRcdHRvb0xvbmdUb1JlYWQgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Ly8gaGludFxuXHRcdFx0Y29uc3QgZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdlbScpO1xuXHRcdFx0Y29uc3QgeyBsYWJlbCB9ID0gaXRlbS5oaW50O1xuXHRcdFx0aWYgKHR5cGVvZiBsYWJlbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0ZW0uaW5uZXJUZXh0ID0gbGFiZWw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgbGFiZWwpIHtcblx0XHRcdFx0XHRpZiAocGFydC5jb21tYW5kKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5rID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpbmssIGVtLFxuXHRcdFx0XHRcdFx0XHR7IGhyZWY6IGFzQ29tbWFuZExpbmsocGFydC5jb21tYW5kKSwgbGFiZWw6IHBhcnQubGFiZWwsIHRpdGxlOiBwYXJ0LmNvbW1hbmQudGl0bGUgfSxcblx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvb3NhYmxlcy5hZGQobGluayk7XG5cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZW0uaW5uZXJUZXh0ICs9IHBhcnQubGFiZWw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRuZXdDaGlsZHJlbi5wdXNoKGVtKTtcblx0XHR9XG5cblx0XHQvLyB0cmFpbGluZyB0ZXh0XG5cdFx0aWYgKCF0b29Mb25nVG9SZWFkKSB7XG5cdFx0XHRuZXdDaGlsZHJlbi5wdXNoKG1vZGVsLmdldFZhbHVlSW5SYW5nZSh7IHN0YXJ0TGluZU51bWJlcjogbGluZSwgc3RhcnRDb2x1bW46IHN0YXJ0ICsgMSwgZW5kTGluZU51bWJlcjogbGluZSwgZW5kQ29sdW1uOiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiB9KSk7XG5cdFx0fVxuXG5cdFx0ZG9tLnJlc2V0KHRoaXMuX2FyaWFFbGVtZW50LCAuLi5uZXdDaGlsZHJlbik7XG5cdFx0dGhpcy5fYXJpYUVsZW1lbnQuZm9jdXMoKTtcblx0XHR0aGlzLl9jdHhJc1JlYWRpbmcuc2V0KHRydWUpO1xuXG5cdFx0Ly8gcmVzZXQgb24gYmx1clxuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb29zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fYXJpYUVsZW1lbnQsICdmb2N1c291dCcsICgpID0+IHtcblx0XHRcdHRoaXMuX3Jlc2V0KCk7XG5cdFx0fSkpO1xuXHR9XG5cblxuXG5cdHN0YXJ0SW5sYXlIaW50c1JlYWRpbmcoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaW5lID0gdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCkubGluZU51bWJlcjtcblx0XHRjb25zdCBoaW50cyA9IElubGF5SGludHNDb250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3IpPy5nZXRJbmxheUhpbnRzRm9yTGluZShsaW5lKTtcblx0XHRpZiAoIWhpbnRzIHx8IGhpbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLm5vSW5sYXlIaW50cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlYWQobGluZSwgaGludHMpO1xuXHRcdH1cblx0fVxuXG5cdHN0b3BJbmxheUhpbnRzUmVhZGluZygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXNldCgpO1xuXHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHR9XG59XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFN0YXJ0UmVhZEhpbnRzIGV4dGVuZHMgRWRpdG9yQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdpbmxheUhpbnRzLnN0YXJ0UmVhZGluZ0xpbmVXaXRoSGludCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZWFkLnRpdGxlJywgXCJSZWFkIExpbmUgd2l0aCBJbmxheSBIaW50c1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaGFzSW5sYXlIaW50c1Byb3ZpZGVyLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHJ1bkVkaXRvckNvbW1hbmQoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0Y29uc3QgY3RybCA9IElubGF5SGludHNBY2Nlc3NpYmlsaXR5LmdldChlZGl0b3IpO1xuXHRcdGN0cmw/LnN0YXJ0SW5sYXlIaW50c1JlYWRpbmcoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTdG9wUmVhZEhpbnRzIGV4dGVuZHMgRWRpdG9yQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdpbmxheUhpbnRzLnN0b3BSZWFkaW5nTGluZVdpdGhIaW50Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3N0b3AudGl0bGUnLCBcIlN0b3AgSW5sYXkgSGludHMgUmVhZGluZ1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogSW5sYXlIaW50c0FjY2Vzc2liaWxpdHkuSXNSZWFkaW5nLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuRWRpdG9yQ29tbWFuZChfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpIHtcblx0XHRjb25zdCBjdHJsID0gSW5sYXlIaW50c0FjY2Vzc2liaWxpdHkuZ2V0KGVkaXRvcik7XG5cdFx0Y3RybD8uc3RvcElubGF5SGludHNSZWFkaW5nKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihJbmxheUhpbnRzQWNjZXNzaWJpbGl0eS5JRCwgSW5sYXlIaW50c0FjY2Vzc2liaWxpdHksIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uTGF6eSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FB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
