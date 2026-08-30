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
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { OS } from "../../../../base/common/platform.js";
import { ContentWidgetPositionPreference } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { ReplEditorSettings } from "./interactiveCommon.js";
let ReplInputHintContentWidget = class extends Disposable {
  constructor(editor, configurationService, keybindingService) {
    super();
    this.editor = editor;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.ariaLabel = "";
    this._register(this.editor.onDidChangeConfiguration((e) => {
      if (this.domNode && e.hasChanged(EditorOption.fontInfo)) {
        this.editor.applyFontInfo(this.domNode);
      }
    }));
    const onDidFocusEditorText = Event.debounce(this.editor.onDidFocusEditorText, () => void 0, 500);
    this._register(onDidFocusEditorText(() => {
      if (this.editor.hasTextFocus() && this.ariaLabel && configurationService.getValue(AccessibilityVerbositySettingId.ReplEditor)) {
        status(this.ariaLabel);
      }
    }));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ReplEditorSettings.executeWithShiftEnter)) {
        this.setHint();
      }
    }));
    this.editor.addContentWidget(this);
  }
  getId() {
    return ReplInputHintContentWidget.ID;
  }
  getPosition() {
    return {
      position: { lineNumber: 1, column: 1 },
      preference: [ContentWidgetPositionPreference.EXACT]
    };
  }
  getDomNode() {
    if (!this.domNode) {
      this.domNode = dom.$(".empty-editor-hint");
      this.domNode.style.width = "max-content";
      this.domNode.style.paddingLeft = "4px";
      this.setHint();
      this._register(dom.addDisposableListener(this.domNode, "click", () => {
        this.editor.focus();
      }));
      this.editor.applyFontInfo(this.domNode);
      const lineHeight = this.editor.getLineHeightForPosition(new Position(1, 1));
      this.domNode.style.lineHeight = lineHeight + "px";
    }
    return this.domNode;
  }
  setHint() {
    if (!this.domNode) {
      return;
    }
    while (this.domNode.firstChild) {
      this.domNode.removeChild(this.domNode.firstChild);
    }
    const hintElement = dom.$("div.empty-hint-text");
    hintElement.style.cursor = "text";
    hintElement.style.whiteSpace = "nowrap";
    const keybinding = this.getKeybinding();
    const keybindingHintLabel = keybinding?.getLabel();
    if (keybinding && keybindingHintLabel) {
      const actionPart = localize("emptyHintText", "Press {0} to execute. ", keybindingHintLabel);
      const [before, after] = actionPart.split(keybindingHintLabel).map((fragment) => {
        const hintPart = dom.$("span", void 0, fragment);
        hintPart.style.fontStyle = "italic";
        return hintPart;
      });
      hintElement.appendChild(before);
      if (this.label) {
        this.label.dispose();
      }
      this.label = this._register(new KeybindingLabel(hintElement, OS));
      this.label.set(keybinding);
      this.label.element.style.width = "min-content";
      this.label.element.style.display = "inline";
      hintElement.appendChild(after);
      this.domNode.append(hintElement);
      const helpKeybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
      const helpInfo = helpKeybinding ? localize("ReplInputAriaLabelHelp", "Use {0} for accessibility help. ", helpKeybinding) : localize("ReplInputAriaLabelHelpNoKb", "Run the Open Accessibility Help command for more information. ");
      this.ariaLabel = actionPart.concat(helpInfo, localize("disableHint", " Toggle {0} in settings to disable this hint.", AccessibilityVerbositySettingId.ReplEditor));
    }
  }
  getKeybinding() {
    const keybindings = this.keybindingService.lookupKeybindings("interactive.execute");
    const shiftEnterConfig = this.configurationService.getValue(ReplEditorSettings.executeWithShiftEnter);
    const hasEnterChord = (kb, modifier = "") => {
      const chords = kb.getDispatchChords();
      const chord = modifier + "Enter";
      const chordAlt = modifier + "[Enter]";
      return chords.length === 1 && (chords[0] === chord || chords[0] === chordAlt);
    };
    if (shiftEnterConfig) {
      const keybinding = keybindings.find((kb) => hasEnterChord(kb, "shift+"));
      if (keybinding) {
        return keybinding;
      }
    } else {
      let keybinding = keybindings.find((kb) => hasEnterChord(kb));
      if (keybinding) {
        return keybinding;
      }
      keybinding = this.keybindingService.lookupKeybindings("python.execInREPLEnter").find((kb) => hasEnterChord(kb));
      if (keybinding) {
        return keybinding;
      }
    }
    return keybindings?.[0];
  }
  dispose() {
    super.dispose();
    this.editor.removeContentWidget(this);
    this.label?.dispose();
  }
};
ReplInputHintContentWidget.ID = "replInput.widget.emptyHint";
ReplInputHintContentWidget = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IKeybindingService)
], ReplInputHintContentWidget);
export {
  ReplInputHintContentWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGludGVyYWN0aXZlXFxicm93c2VyXFxyZXBsSW5wdXRIaW50Q29udGVudFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ0xhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2tleWJpbmRpbmdMYWJlbC9rZXliaW5kaW5nTGFiZWwuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUNvZGVFZGl0b3IsIElDb250ZW50V2lkZ2V0LCBJQ29udGVudFdpZGdldFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlDb21tYW5kSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUmVwbEVkaXRvclNldHRpbmdzIH0gZnJvbSAnLi9pbnRlcmFjdGl2ZUNvbW1vbi5qcyc7XG5cblxuZXhwb3J0IGNsYXNzIFJlcGxJbnB1dEhpbnRDb250ZW50V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb250ZW50V2lkZ2V0IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJRCA9ICdyZXBsSW5wdXQud2lkZ2V0LmVtcHR5SGludCc7XG5cblx0cHJpdmF0ZSBkb21Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhcmlhTGFiZWw6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIGxhYmVsOiBLZXliaW5kaW5nTGFiZWwgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlOiBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5kb21Ob2RlICYmIGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udEluZm8pKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmFwcGx5Rm9udEluZm8odGhpcy5kb21Ob2RlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3Qgb25EaWRGb2N1c0VkaXRvclRleHQgPSBFdmVudC5kZWJvdW5jZSh0aGlzLmVkaXRvci5vbkRpZEZvY3VzRWRpdG9yVGV4dCwgKCkgPT4gdW5kZWZpbmVkLCA1MDApO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkRm9jdXNFZGl0b3JUZXh0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmVkaXRvci5oYXNUZXh0Rm9jdXMoKSAmJiB0aGlzLmFyaWFMYWJlbCAmJiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlJlcGxFZGl0b3IpKSB7XG5cdFx0XHRcdHN0YXR1cyh0aGlzLmFyaWFMYWJlbCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFJlcGxFZGl0b3JTZXR0aW5ncy5leGVjdXRlV2l0aFNoaWZ0RW50ZXIpKSB7XG5cdFx0XHRcdHRoaXMuc2V0SGludCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLmVkaXRvci5hZGRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gUmVwbElucHV0SGludENvbnRlbnRXaWRnZXQuSUQ7XG5cdH1cblxuXHRnZXRQb3NpdGlvbigpOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBvc2l0aW9uOiB7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMSB9LFxuXHRcdFx0cHJlZmVyZW5jZTogW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuRVhBQ1RdXG5cdFx0fTtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdGlmICghdGhpcy5kb21Ob2RlKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLmVtcHR5LWVkaXRvci1oaW50Jyk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUud2lkdGggPSAnbWF4LWNvbnRlbnQnO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzRweCc7XG5cblx0XHRcdHRoaXMuc2V0SGludCgpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLmVkaXRvci5hcHBseUZvbnRJbmZvKHRoaXMuZG9tTm9kZSk7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0TGluZUhlaWdodEZvclBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUubGluZUhlaWdodCA9IGxpbmVIZWlnaHQgKyAncHgnO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvbU5vZGU7XG5cdH1cblxuXHRwcml2YXRlIHNldEhpbnQoKSB7XG5cdFx0aWYgKCF0aGlzLmRvbU5vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0d2hpbGUgKHRoaXMuZG9tTm9kZS5maXJzdENoaWxkKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUucmVtb3ZlQ2hpbGQodGhpcy5kb21Ob2RlLmZpcnN0Q2hpbGQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhpbnRFbGVtZW50ID0gZG9tLiQoJ2Rpdi5lbXB0eS1oaW50LXRleHQnKTtcblx0XHRoaW50RWxlbWVudC5zdHlsZS5jdXJzb3IgPSAndGV4dCc7XG5cdFx0aGludEVsZW1lbnQuc3R5bGUud2hpdGVTcGFjZSA9ICdub3dyYXAnO1xuXG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMuZ2V0S2V5YmluZGluZygpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdIaW50TGFiZWwgPSBrZXliaW5kaW5nPy5nZXRMYWJlbCgpO1xuXG5cdFx0aWYgKGtleWJpbmRpbmcgJiYga2V5YmluZGluZ0hpbnRMYWJlbCkge1xuXHRcdFx0Y29uc3QgYWN0aW9uUGFydCA9IGxvY2FsaXplKCdlbXB0eUhpbnRUZXh0JywgJ1ByZXNzIHswfSB0byBleGVjdXRlLiAnLCBrZXliaW5kaW5nSGludExhYmVsKTtcblxuXHRcdFx0Y29uc3QgW2JlZm9yZSwgYWZ0ZXJdID0gYWN0aW9uUGFydC5zcGxpdChrZXliaW5kaW5nSGludExhYmVsKS5tYXAoKGZyYWdtZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhpbnRQYXJ0ID0gZG9tLiQoJ3NwYW4nLCB1bmRlZmluZWQsIGZyYWdtZW50KTtcblx0XHRcdFx0aGludFBhcnQuc3R5bGUuZm9udFN0eWxlID0gJ2l0YWxpYyc7XG5cdFx0XHRcdHJldHVybiBoaW50UGFydDtcblx0XHRcdH0pO1xuXG5cdFx0XHRoaW50RWxlbWVudC5hcHBlbmRDaGlsZChiZWZvcmUpO1xuXG5cdFx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0XHR0aGlzLmxhYmVsLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMubGFiZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgS2V5YmluZGluZ0xhYmVsKGhpbnRFbGVtZW50LCBPUykpO1xuXHRcdFx0dGhpcy5sYWJlbC5zZXQoa2V5YmluZGluZyk7XG5cdFx0XHR0aGlzLmxhYmVsLmVsZW1lbnQuc3R5bGUud2lkdGggPSAnbWluLWNvbnRlbnQnO1xuXHRcdFx0dGhpcy5sYWJlbC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblxuXHRcdFx0aGludEVsZW1lbnQuYXBwZW5kQ2hpbGQoYWZ0ZXIpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLmFwcGVuZChoaW50RWxlbWVudCk7XG5cblx0XHRcdGNvbnN0IGhlbHBLZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuT3BlbkFjY2Vzc2liaWxpdHlIZWxwKT8uZ2V0TGFiZWwoKTtcblx0XHRcdGNvbnN0IGhlbHBJbmZvID0gaGVscEtleWJpbmRpbmdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnUmVwbElucHV0QXJpYUxhYmVsSGVscCcsIFwiVXNlIHswfSBmb3IgYWNjZXNzaWJpbGl0eSBoZWxwLiBcIiwgaGVscEtleWJpbmRpbmcpXG5cdFx0XHRcdDogbG9jYWxpemUoJ1JlcGxJbnB1dEFyaWFMYWJlbEhlbHBOb0tiJywgXCJSdW4gdGhlIE9wZW4gQWNjZXNzaWJpbGl0eSBIZWxwIGNvbW1hbmQgZm9yIG1vcmUgaW5mb3JtYXRpb24uIFwiKTtcblxuXHRcdFx0dGhpcy5hcmlhTGFiZWwgPSBhY3Rpb25QYXJ0LmNvbmNhdChoZWxwSW5mbywgbG9jYWxpemUoJ2Rpc2FibGVIaW50JywgJyBUb2dnbGUgezB9IGluIHNldHRpbmdzIHRvIGRpc2FibGUgdGhpcyBoaW50LicsIEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuUmVwbEVkaXRvcikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0S2V5YmluZGluZygpIHtcblx0XHRjb25zdCBrZXliaW5kaW5ncyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZ3MoJ2ludGVyYWN0aXZlLmV4ZWN1dGUnKTtcblx0XHRjb25zdCBzaGlmdEVudGVyQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShSZXBsRWRpdG9yU2V0dGluZ3MuZXhlY3V0ZVdpdGhTaGlmdEVudGVyKTtcblx0XHRjb25zdCBoYXNFbnRlckNob3JkID0gKGtiOiBSZXNvbHZlZEtleWJpbmRpbmcsIG1vZGlmaWVyOiBzdHJpbmcgPSAnJykgPT4ge1xuXHRcdFx0Y29uc3QgY2hvcmRzID0ga2IuZ2V0RGlzcGF0Y2hDaG9yZHMoKTtcblx0XHRcdGNvbnN0IGNob3JkID0gbW9kaWZpZXIgKyAnRW50ZXInO1xuXHRcdFx0Y29uc3QgY2hvcmRBbHQgPSBtb2RpZmllciArICdbRW50ZXJdJztcblx0XHRcdHJldHVybiBjaG9yZHMubGVuZ3RoID09PSAxICYmIChjaG9yZHNbMF0gPT09IGNob3JkIHx8IGNob3Jkc1swXSA9PT0gY2hvcmRBbHQpO1xuXHRcdH07XG5cblx0XHRpZiAoc2hpZnRFbnRlckNvbmZpZykge1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IGtleWJpbmRpbmdzLmZpbmQoa2IgPT4gaGFzRW50ZXJDaG9yZChrYiwgJ3NoaWZ0KycpKTtcblx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdHJldHVybiBrZXliaW5kaW5nO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQga2V5YmluZGluZyA9IGtleWJpbmRpbmdzLmZpbmQoa2IgPT4gaGFzRW50ZXJDaG9yZChrYikpO1xuXHRcdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdFx0cmV0dXJuIGtleWJpbmRpbmc7XG5cdFx0XHR9XG5cdFx0XHRrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5ncygncHl0aG9uLmV4ZWNJblJFUExFbnRlcicpXG5cdFx0XHRcdC5maW5kKGtiID0+IGhhc0VudGVyQ2hvcmQoa2IpKTtcblx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdHJldHVybiBrZXliaW5kaW5nO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBrZXliaW5kaW5ncz8uWzBdO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5lZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHR0aGlzLmxhYmVsPy5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUN2QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFFdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVO0FBQ25C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
