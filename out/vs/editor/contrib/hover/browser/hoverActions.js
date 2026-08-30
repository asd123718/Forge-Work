import { DECREASE_HOVER_VERBOSITY_ACTION_ID, DECREASE_HOVER_VERBOSITY_ACTION_LABEL, GO_TO_BOTTOM_HOVER_ACTION_ID, GO_TO_TOP_HOVER_ACTION_ID, HIDE_HOVER_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_LABEL, PAGE_DOWN_HOVER_ACTION_ID, PAGE_UP_HOVER_ACTION_ID, SCROLL_DOWN_HOVER_ACTION_ID, SCROLL_LEFT_HOVER_ACTION_ID, SCROLL_RIGHT_HOVER_ACTION_ID, SCROLL_UP_HOVER_ACTION_ID, SHOW_DEFINITION_PREVIEW_HOVER_ACTION_ID, SHOW_OR_FOCUS_HOVER_ACTION_ID } from "./hoverActionIds.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { EditorAction } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { GotoDefinitionAtPositionEditorContribution } from "../../gotoSymbol/browser/link/goToDefinitionAtPosition.js";
import { HoverStartMode, HoverStartSource } from "./hoverOperation.js";
import { AccessibilitySupport } from "../../../../platform/accessibility/common/accessibility.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ContentHoverController } from "./contentHoverController.js";
import { HoverVerbosityAction } from "../../../common/languages.js";
import * as nls from "../../../../nls.js";
import "./hover.css";
var HoverFocusBehavior = /* @__PURE__ */ ((HoverFocusBehavior2) => {
  HoverFocusBehavior2["NoAutoFocus"] = "noAutoFocus";
  HoverFocusBehavior2["FocusIfVisible"] = "focusIfVisible";
  HoverFocusBehavior2["AutoFocusImmediately"] = "autoFocusImmediately";
  return HoverFocusBehavior2;
})(HoverFocusBehavior || {});
class ShowOrFocusHoverAction extends EditorAction {
  constructor() {
    super({
      id: SHOW_OR_FOCUS_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "showOrFocusHover",
        comment: [
          "Label for action that will trigger the showing/focusing of a hover in the editor.",
          "If the hover is not visible, it will show the hover.",
          "This allows for users to show the hover without using the mouse."
        ]
      }, "Show or Focus Hover"),
      metadata: {
        description: nls.localize2("showOrFocusHoverDescription", "Show or focus the editor hover which shows documentation, references, and other content for a symbol at the current cursor position."),
        args: [{
          name: "args",
          schema: {
            type: "object",
            properties: {
              "focus": {
                description: "Controls if and when the hover should take focus upon being triggered by this action.",
                enum: ["noAutoFocus" /* NoAutoFocus */, "focusIfVisible" /* FocusIfVisible */, "autoFocusImmediately" /* AutoFocusImmediately */],
                enumDescriptions: [
                  nls.localize("showOrFocusHover.focus.noAutoFocus", "The hover will not automatically take focus."),
                  nls.localize("showOrFocusHover.focus.focusIfVisible", "The hover will take focus only if it is already visible."),
                  nls.localize("showOrFocusHover.focus.autoFocusImmediately", "The hover will automatically take focus when it appears.")
                ],
                default: "focusIfVisible" /* FocusIfVisible */
              }
            }
          }
        }]
      },
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    const focusArgument = args?.focus;
    let focusOption = "focusIfVisible" /* FocusIfVisible */;
    if (Object.values(HoverFocusBehavior).includes(focusArgument)) {
      focusOption = focusArgument;
    } else if (typeof focusArgument === "boolean" && focusArgument) {
      focusOption = "autoFocusImmediately" /* AutoFocusImmediately */;
    }
    const showContentHover = (focus) => {
      const position = editor.getPosition();
      const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
      controller.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Keyboard, focus);
    };
    const accessibilitySupportEnabled = editor.getOption(EditorOption.accessibilitySupport) === AccessibilitySupport.Enabled;
    if (controller.isHoverVisible) {
      if (focusOption !== "noAutoFocus" /* NoAutoFocus */) {
        controller.focus();
      } else {
        showContentHover(accessibilitySupportEnabled);
      }
    } else {
      showContentHover(accessibilitySupportEnabled || focusOption === "autoFocusImmediately" /* AutoFocusImmediately */);
    }
  }
}
class ShowDefinitionPreviewHoverAction extends EditorAction {
  constructor() {
    super({
      id: SHOW_DEFINITION_PREVIEW_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "showDefinitionPreviewHover",
        comment: [
          "Label for action that will trigger the showing of definition preview hover in the editor.",
          "This allows for users to show the definition preview hover without using the mouse."
        ]
      }, "Show Definition Preview Hover"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("showDefinitionPreviewHoverDescription", "Show the definition preview hover in the editor.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    const position = editor.getPosition();
    if (!position) {
      return;
    }
    const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
    const goto = GotoDefinitionAtPositionEditorContribution.get(editor);
    if (!goto) {
      return;
    }
    const promise = goto.startFindDefinitionFromCursor(position);
    promise.then(() => {
      controller.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Keyboard, true);
    });
  }
}
class HideContentHoverAction extends EditorAction {
  constructor() {
    super({
      id: HIDE_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "hideHover",
        comment: ["Label for action that will hide the hover in the editor."]
      }, "Hide Hover"),
      alias: "Hide Content Hover",
      precondition: void 0
    });
  }
  run(accessor, editor) {
    ContentHoverController.get(editor)?.hideContentHover();
  }
}
class ScrollUpHoverAction extends EditorAction {
  constructor() {
    super({
      id: SCROLL_UP_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "scrollUpHover",
        comment: [
          "Action that allows to scroll up in the hover widget with the up arrow when the hover widget is focused."
        ]
      }, "Scroll Up Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.UpArrow,
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("scrollUpHoverDescription", "Scroll up the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.scrollUp();
  }
}
class ScrollDownHoverAction extends EditorAction {
  constructor() {
    super({
      id: SCROLL_DOWN_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "scrollDownHover",
        comment: [
          "Action that allows to scroll down in the hover widget with the up arrow when the hover widget is focused."
        ]
      }, "Scroll Down Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.DownArrow,
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("scrollDownHoverDescription", "Scroll down the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.scrollDown();
  }
}
class ScrollLeftHoverAction extends EditorAction {
  constructor() {
    super({
      id: SCROLL_LEFT_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "scrollLeftHover",
        comment: [
          "Action that allows to scroll left in the hover widget with the left arrow when the hover widget is focused."
        ]
      }, "Scroll Left Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.LeftArrow,
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("scrollLeftHoverDescription", "Scroll left the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.scrollLeft();
  }
}
class ScrollRightHoverAction extends EditorAction {
  constructor() {
    super({
      id: SCROLL_RIGHT_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "scrollRightHover",
        comment: [
          "Action that allows to scroll right in the hover widget with the right arrow when the hover widget is focused."
        ]
      }, "Scroll Right Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.RightArrow,
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("scrollRightHoverDescription", "Scroll right the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.scrollRight();
  }
}
class PageUpHoverAction extends EditorAction {
  constructor() {
    super({
      id: PAGE_UP_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "pageUpHover",
        comment: [
          "Action that allows to page up in the hover widget with the page up command when the hover widget is focused."
        ]
      }, "Page Up Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.PageUp,
        secondary: [KeyMod.Alt | KeyCode.UpArrow],
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("pageUpHoverDescription", "Page up the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.pageUp();
  }
}
class PageDownHoverAction extends EditorAction {
  constructor() {
    super({
      id: PAGE_DOWN_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "pageDownHover",
        comment: [
          "Action that allows to page down in the hover widget with the page down command when the hover widget is focused."
        ]
      }, "Page Down Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.PageDown,
        secondary: [KeyMod.Alt | KeyCode.DownArrow],
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("pageDownHoverDescription", "Page down the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.pageDown();
  }
}
class GoToTopHoverAction extends EditorAction {
  constructor() {
    super({
      id: GO_TO_TOP_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "goToTopHover",
        comment: [
          "Action that allows to go to the top of the hover widget with the home command when the hover widget is focused."
        ]
      }, "Go To Top Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.Home,
        secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("goToTopHoverDescription", "Go to the top of the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.goToTop();
  }
}
class GoToBottomHoverAction extends EditorAction {
  constructor() {
    super({
      id: GO_TO_BOTTOM_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "goToBottomHover",
        comment: [
          "Action that allows to go to the bottom in the hover widget with the end command when the hover widget is focused."
        ]
      }, "Go To Bottom Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.End,
        secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("goToBottomHoverDescription", "Go to the bottom of the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.goToBottom();
  }
}
class IncreaseHoverVerbosityLevel extends EditorAction {
  constructor() {
    super({
      id: INCREASE_HOVER_VERBOSITY_ACTION_ID,
      label: INCREASE_HOVER_VERBOSITY_ACTION_LABEL,
      alias: "Increase Hover Verbosity Level",
      precondition: EditorContextKeys.hoverVisible
    });
  }
  run(accessor, editor, args) {
    const hoverController = ContentHoverController.get(editor);
    if (!hoverController) {
      return;
    }
    const index = args?.index !== void 0 ? args.index : hoverController.focusedHoverPartIndex();
    hoverController.updateHoverVerbosityLevel(HoverVerbosityAction.Increase, index, args?.focus);
  }
}
class DecreaseHoverVerbosityLevel extends EditorAction {
  constructor() {
    super({
      id: DECREASE_HOVER_VERBOSITY_ACTION_ID,
      label: DECREASE_HOVER_VERBOSITY_ACTION_LABEL,
      alias: "Decrease Hover Verbosity Level",
      precondition: EditorContextKeys.hoverVisible
    });
  }
  run(accessor, editor, args) {
    const hoverController = ContentHoverController.get(editor);
    if (!hoverController) {
      return;
    }
    const index = args?.index !== void 0 ? args.index : hoverController.focusedHoverPartIndex();
    ContentHoverController.get(editor)?.updateHoverVerbosityLevel(HoverVerbosityAction.Decrease, index, args?.focus);
  }
}
export {
  DecreaseHoverVerbosityLevel,
  GoToBottomHoverAction,
  GoToTopHoverAction,
  HideContentHoverAction,
  IncreaseHoverVerbosityLevel,
  PageDownHoverAction,
  PageUpHoverAction,
  ScrollDownHoverAction,
  ScrollLeftHoverAction,
  ScrollRightHoverAction,
  ScrollUpHoverAction,
  ShowDefinitionPreviewHoverAction,
  ShowOrFocusHoverAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGhvdmVyXFxicm93c2VyXFxob3ZlckFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBERUNSRUFTRV9IT1ZFUl9WRVJCT1NJVFlfQUNUSU9OX0lELCBERUNSRUFTRV9IT1ZFUl9WRVJCT1NJVFlfQUNUSU9OX0xBQkVMLCBHT19UT19CT1RUT01fSE9WRVJfQUNUSU9OX0lELCBHT19UT19UT1BfSE9WRVJfQUNUSU9OX0lELCBISURFX0hPVkVSX0FDVElPTl9JRCwgSU5DUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9JRCwgSU5DUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9MQUJFTCwgUEFHRV9ET1dOX0hPVkVSX0FDVElPTl9JRCwgUEFHRV9VUF9IT1ZFUl9BQ1RJT05fSUQsIFNDUk9MTF9ET1dOX0hPVkVSX0FDVElPTl9JRCwgU0NST0xMX0xFRlRfSE9WRVJfQUNUSU9OX0lELCBTQ1JPTExfUklHSFRfSE9WRVJfQUNUSU9OX0lELCBTQ1JPTExfVVBfSE9WRVJfQUNUSU9OX0lELCBTSE9XX0RFRklOSVRJT05fUFJFVklFV19IT1ZFUl9BQ1RJT05fSUQsIFNIT1dfT1JfRk9DVVNfSE9WRVJfQUNUSU9OX0lEIH0gZnJvbSAnLi9ob3ZlckFjdGlvbklkcy5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEdvdG9EZWZpbml0aW9uQXRQb3NpdGlvbkVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2dvdG9TeW1ib2wvYnJvd3Nlci9saW5rL2dvVG9EZWZpbml0aW9uQXRQb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0YXJ0TW9kZSwgSG92ZXJTdGFydFNvdXJjZSB9IGZyb20gJy4vaG92ZXJPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVN1cHBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIgfSBmcm9tICcuL2NvbnRlbnRIb3ZlckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSG92ZXJWZXJib3NpdHlBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICcuL2hvdmVyLmNzcyc7XG5cbmVudW0gSG92ZXJGb2N1c0JlaGF2aW9yIHtcblx0Tm9BdXRvRm9jdXMgPSAnbm9BdXRvRm9jdXMnLFxuXHRGb2N1c0lmVmlzaWJsZSA9ICdmb2N1c0lmVmlzaWJsZScsXG5cdEF1dG9Gb2N1c0ltbWVkaWF0ZWx5ID0gJ2F1dG9Gb2N1c0ltbWVkaWF0ZWx5J1xufVxuXG5leHBvcnQgY2xhc3MgU2hvd09yRm9jdXNIb3ZlckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNIT1dfT1JfRk9DVVNfSE9WRVJfQUNUSU9OX0lELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoe1xuXHRcdFx0XHRrZXk6ICdzaG93T3JGb2N1c0hvdmVyJyxcblx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdCdMYWJlbCBmb3IgYWN0aW9uIHRoYXQgd2lsbCB0cmlnZ2VyIHRoZSBzaG93aW5nL2ZvY3VzaW5nIG9mIGEgaG92ZXIgaW4gdGhlIGVkaXRvci4nLFxuXHRcdFx0XHRcdCdJZiB0aGUgaG92ZXIgaXMgbm90IHZpc2libGUsIGl0IHdpbGwgc2hvdyB0aGUgaG92ZXIuJyxcblx0XHRcdFx0XHQnVGhpcyBhbGxvd3MgZm9yIHVzZXJzIHRvIHNob3cgdGhlIGhvdmVyIHdpdGhvdXQgdXNpbmcgdGhlIG1vdXNlLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJTaG93IG9yIEZvY3VzIEhvdmVyXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3Nob3dPckZvY3VzSG92ZXJEZXNjcmlwdGlvbicsICdTaG93IG9yIGZvY3VzIHRoZSBlZGl0b3IgaG92ZXIgd2hpY2ggc2hvd3MgZG9jdW1lbnRhdGlvbiwgcmVmZXJlbmNlcywgYW5kIG90aGVyIGNvbnRlbnQgZm9yIGEgc3ltYm9sIGF0IHRoZSBjdXJyZW50IGN1cnNvciBwb3NpdGlvbi4nKSxcblx0XHRcdFx0YXJnczogW3tcblx0XHRcdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0J2ZvY3VzJzoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29udHJvbHMgaWYgYW5kIHdoZW4gdGhlIGhvdmVyIHNob3VsZCB0YWtlIGZvY3VzIHVwb24gYmVpbmcgdHJpZ2dlcmVkIGJ5IHRoaXMgYWN0aW9uLicsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogW0hvdmVyRm9jdXNCZWhhdmlvci5Ob0F1dG9Gb2N1cywgSG92ZXJGb2N1c0JlaGF2aW9yLkZvY3VzSWZWaXNpYmxlLCBIb3ZlckZvY3VzQmVoYXZpb3IuQXV0b0ZvY3VzSW1tZWRpYXRlbHldLFxuXHRcdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2hvd09yRm9jdXNIb3Zlci5mb2N1cy5ub0F1dG9Gb2N1cycsICdUaGUgaG92ZXIgd2lsbCBub3QgYXV0b21hdGljYWxseSB0YWtlIGZvY3VzLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzaG93T3JGb2N1c0hvdmVyLmZvY3VzLmZvY3VzSWZWaXNpYmxlJywgJ1RoZSBob3ZlciB3aWxsIHRha2UgZm9jdXMgb25seSBpZiBpdCBpcyBhbHJlYWR5IHZpc2libGUuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Nob3dPckZvY3VzSG92ZXIuZm9jdXMuYXV0b0ZvY3VzSW1tZWRpYXRlbHknLCAnVGhlIGhvdmVyIHdpbGwgYXV0b21hdGljYWxseSB0YWtlIGZvY3VzIHdoZW4gaXQgYXBwZWFycy4nKSxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IEhvdmVyRm9jdXNCZWhhdmlvci5Gb2N1c0lmVmlzaWJsZSxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiBhbnkpOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNBcmd1bWVudCA9IGFyZ3M/LmZvY3VzO1xuXHRcdGxldCBmb2N1c09wdGlvbiA9IEhvdmVyRm9jdXNCZWhhdmlvci5Gb2N1c0lmVmlzaWJsZTtcblx0XHRpZiAoT2JqZWN0LnZhbHVlcyhIb3ZlckZvY3VzQmVoYXZpb3IpLmluY2x1ZGVzKGZvY3VzQXJndW1lbnQpKSB7XG5cdFx0XHRmb2N1c09wdGlvbiA9IGZvY3VzQXJndW1lbnQ7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgZm9jdXNBcmd1bWVudCA9PT0gJ2Jvb2xlYW4nICYmIGZvY3VzQXJndW1lbnQpIHtcblx0XHRcdGZvY3VzT3B0aW9uID0gSG92ZXJGb2N1c0JlaGF2aW9yLkF1dG9Gb2N1c0ltbWVkaWF0ZWx5O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3dDb250ZW50SG92ZXIgPSAoZm9jdXM6IGJvb2xlYW4pID0+IHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0XHRjb250cm9sbGVyLnNob3dDb250ZW50SG92ZXIocmFuZ2UsIEhvdmVyU3RhcnRNb2RlLkltbWVkaWF0ZSwgSG92ZXJTdGFydFNvdXJjZS5LZXlib2FyZCwgZm9jdXMpO1xuXHRcdH07XG5cblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U3VwcG9ydEVuYWJsZWQgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hY2Nlc3NpYmlsaXR5U3VwcG9ydCkgPT09IEFjY2Vzc2liaWxpdHlTdXBwb3J0LkVuYWJsZWQ7XG5cblx0XHRpZiAoY29udHJvbGxlci5pc0hvdmVyVmlzaWJsZSkge1xuXHRcdFx0aWYgKGZvY3VzT3B0aW9uICE9PSBIb3ZlckZvY3VzQmVoYXZpb3IuTm9BdXRvRm9jdXMpIHtcblx0XHRcdFx0Y29udHJvbGxlci5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2hvd0NvbnRlbnRIb3ZlcihhY2Nlc3NpYmlsaXR5U3VwcG9ydEVuYWJsZWQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzaG93Q29udGVudEhvdmVyKGFjY2Vzc2liaWxpdHlTdXBwb3J0RW5hYmxlZCB8fCBmb2N1c09wdGlvbiA9PT0gSG92ZXJGb2N1c0JlaGF2aW9yLkF1dG9Gb2N1c0ltbWVkaWF0ZWx5KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNob3dEZWZpbml0aW9uUHJldmlld0hvdmVyQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU0hPV19ERUZJTklUSU9OX1BSRVZJRVdfSE9WRVJfQUNUSU9OX0lELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoe1xuXHRcdFx0XHRrZXk6ICdzaG93RGVmaW5pdGlvblByZXZpZXdIb3ZlcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnTGFiZWwgZm9yIGFjdGlvbiB0aGF0IHdpbGwgdHJpZ2dlciB0aGUgc2hvd2luZyBvZiBkZWZpbml0aW9uIHByZXZpZXcgaG92ZXIgaW4gdGhlIGVkaXRvci4nLFxuXHRcdFx0XHRcdCdUaGlzIGFsbG93cyBmb3IgdXNlcnMgdG8gc2hvdyB0aGUgZGVmaW5pdGlvbiBwcmV2aWV3IGhvdmVyIHdpdGhvdXQgdXNpbmcgdGhlIG1vdXNlLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJTaG93IERlZmluaXRpb24gUHJldmlldyBIb3ZlclwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3Nob3dEZWZpbml0aW9uUHJldmlld0hvdmVyRGVzY3JpcHRpb24nLCAnU2hvdyB0aGUgZGVmaW5pdGlvbiBwcmV2aWV3IGhvdmVyIGluIHRoZSBlZGl0b3IuJyksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb250ZW50SG92ZXJDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwb3NpdGlvbiA9IGVkaXRvci5nZXRQb3NpdGlvbigpO1xuXG5cdFx0aWYgKCFwb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0XHRjb25zdCBnb3RvID0gR290b0RlZmluaXRpb25BdFBvc2l0aW9uRWRpdG9yQ29udHJpYnV0aW9uLmdldChlZGl0b3IpO1xuXHRcdGlmICghZ290bykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb21pc2UgPSBnb3RvLnN0YXJ0RmluZERlZmluaXRpb25Gcm9tQ3Vyc29yKHBvc2l0aW9uKTtcblx0XHRwcm9taXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0Y29udHJvbGxlci5zaG93Q29udGVudEhvdmVyKHJhbmdlLCBIb3ZlclN0YXJ0TW9kZS5JbW1lZGlhdGUsIEhvdmVyU3RhcnRTb3VyY2UuS2V5Ym9hcmQsIHRydWUpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBIaWRlQ29udGVudEhvdmVyQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSElERV9IT1ZFUl9BQ1RJT05fSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMih7XG5cdFx0XHRcdGtleTogJ2hpZGVIb3ZlcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFsnTGFiZWwgZm9yIGFjdGlvbiB0aGF0IHdpbGwgaGlkZSB0aGUgaG92ZXIgaW4gdGhlIGVkaXRvci4nXVxuXHRcdFx0fSwgXCJIaWRlIEhvdmVyXCIpLFxuXHRcdFx0YWxpYXM6ICdIaWRlIENvbnRlbnQgSG92ZXInLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRDb250ZW50SG92ZXJDb250cm9sbGVyLmdldChlZGl0b3IpPy5oaWRlQ29udGVudEhvdmVyKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNjcm9sbFVwSG92ZXJBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTQ1JPTExfVVBfSE9WRVJfQUNUSU9OX0lELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoe1xuXHRcdFx0XHRrZXk6ICdzY3JvbGxVcEhvdmVyJyxcblx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdCdBY3Rpb24gdGhhdCBhbGxvd3MgdG8gc2Nyb2xsIHVwIGluIHRoZSBob3ZlciB3aWRnZXQgd2l0aCB0aGUgdXAgYXJyb3cgd2hlbiB0aGUgaG92ZXIgd2lkZ2V0IGlzIGZvY3VzZWQuJ1xuXHRcdFx0XHRdXG5cdFx0XHR9LCBcIlNjcm9sbCBVcCBIb3ZlclwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3Njcm9sbFVwSG92ZXJEZXNjcmlwdGlvbicsICdTY3JvbGwgdXAgdGhlIGVkaXRvciBob3Zlci4nKVxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29udGVudEhvdmVyQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29udHJvbGxlci5zY3JvbGxVcCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTY3JvbGxEb3duSG92ZXJBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTQ1JPTExfRE9XTl9IT1ZFUl9BQ1RJT05fSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMih7XG5cdFx0XHRcdGtleTogJ3Njcm9sbERvd25Ib3ZlcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnQWN0aW9uIHRoYXQgYWxsb3dzIHRvIHNjcm9sbCBkb3duIGluIHRoZSBob3ZlciB3aWRnZXQgd2l0aCB0aGUgdXAgYXJyb3cgd2hlbiB0aGUgaG92ZXIgd2lkZ2V0IGlzIGZvY3VzZWQuJ1xuXHRcdFx0XHRdXG5cdFx0XHR9LCBcIlNjcm9sbCBEb3duIEhvdmVyXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdzY3JvbGxEb3duSG92ZXJEZXNjcmlwdGlvbicsICdTY3JvbGwgZG93biB0aGUgZWRpdG9yIGhvdmVyLicpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29udGVudEhvdmVyQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29udHJvbGxlci5zY3JvbGxEb3duKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNjcm9sbExlZnRIb3ZlckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNDUk9MTF9MRUZUX0hPVkVSX0FDVElPTl9JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKHtcblx0XHRcdFx0a2V5OiAnc2Nyb2xsTGVmdEhvdmVyJyxcblx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdCdBY3Rpb24gdGhhdCBhbGxvd3MgdG8gc2Nyb2xsIGxlZnQgaW4gdGhlIGhvdmVyIHdpZGdldCB3aXRoIHRoZSBsZWZ0IGFycm93IHdoZW4gdGhlIGhvdmVyIHdpZGdldCBpcyBmb2N1c2VkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJTY3JvbGwgTGVmdCBIb3ZlclwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkxlZnRBcnJvdyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignc2Nyb2xsTGVmdEhvdmVyRGVzY3JpcHRpb24nLCAnU2Nyb2xsIGxlZnQgdGhlIGVkaXRvciBob3Zlci4nKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIuc2Nyb2xsTGVmdCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTY3JvbGxSaWdodEhvdmVyQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU0NST0xMX1JJR0hUX0hPVkVSX0FDVElPTl9JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKHtcblx0XHRcdFx0a2V5OiAnc2Nyb2xsUmlnaHRIb3ZlcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnQWN0aW9uIHRoYXQgYWxsb3dzIHRvIHNjcm9sbCByaWdodCBpbiB0aGUgaG92ZXIgd2lkZ2V0IHdpdGggdGhlIHJpZ2h0IGFycm93IHdoZW4gdGhlIGhvdmVyIHdpZGdldCBpcyBmb2N1c2VkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJTY3JvbGwgUmlnaHQgSG92ZXJcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5SaWdodEFycm93LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdzY3JvbGxSaWdodEhvdmVyRGVzY3JpcHRpb24nLCAnU2Nyb2xsIHJpZ2h0IHRoZSBlZGl0b3IgaG92ZXIuJylcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIuc2Nyb2xsUmlnaHQoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUGFnZVVwSG92ZXJBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBQQUdFX1VQX0hPVkVSX0FDVElPTl9JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKHtcblx0XHRcdFx0a2V5OiAncGFnZVVwSG92ZXInLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0J0FjdGlvbiB0aGF0IGFsbG93cyB0byBwYWdlIHVwIGluIHRoZSBob3ZlciB3aWRnZXQgd2l0aCB0aGUgcGFnZSB1cCBjb21tYW5kIHdoZW4gdGhlIGhvdmVyIHdpZGdldCBpcyBmb2N1c2VkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJQYWdlIFVwIEhvdmVyXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuUGFnZVVwLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQWx0IHwgS2V5Q29kZS5VcEFycm93XSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMigncGFnZVVwSG92ZXJEZXNjcmlwdGlvbicsICdQYWdlIHVwIHRoZSBlZGl0b3IgaG92ZXIuJyksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb250ZW50SG92ZXJDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLnBhZ2VVcCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQYWdlRG93bkhvdmVyQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUEFHRV9ET1dOX0hPVkVSX0FDVElPTl9JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKHtcblx0XHRcdFx0a2V5OiAncGFnZURvd25Ib3ZlcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnQWN0aW9uIHRoYXQgYWxsb3dzIHRvIHBhZ2UgZG93biBpbiB0aGUgaG92ZXIgd2lkZ2V0IHdpdGggdGhlIHBhZ2UgZG93biBjb21tYW5kIHdoZW4gdGhlIGhvdmVyIHdpZGdldCBpcyBmb2N1c2VkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJQYWdlIERvd24gSG92ZXJcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5QYWdlRG93bixcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkFsdCB8IEtleUNvZGUuRG93bkFycm93XSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMigncGFnZURvd25Ib3ZlckRlc2NyaXB0aW9uJywgJ1BhZ2UgZG93biB0aGUgZWRpdG9yIGhvdmVyLicpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29udGVudEhvdmVyQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29udHJvbGxlci5wYWdlRG93bigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBHb1RvVG9wSG92ZXJBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBHT19UT19UT1BfSE9WRVJfQUNUSU9OX0lELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoe1xuXHRcdFx0XHRrZXk6ICdnb1RvVG9wSG92ZXInLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0J0FjdGlvbiB0aGF0IGFsbG93cyB0byBnbyB0byB0aGUgdG9wIG9mIHRoZSBob3ZlciB3aWRnZXQgd2l0aCB0aGUgaG9tZSBjb21tYW5kIHdoZW4gdGhlIGhvdmVyIHdpZGdldCBpcyBmb2N1c2VkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJHbyBUbyBUb3AgSG92ZXJcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Ib21lLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvd10sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ2dvVG9Ub3BIb3ZlckRlc2NyaXB0aW9uJywgJ0dvIHRvIHRoZSB0b3Agb2YgdGhlIGVkaXRvciBob3Zlci4nKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIuZ29Ub1RvcCgpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIEdvVG9Cb3R0b21Ib3ZlckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEdPX1RPX0JPVFRPTV9IT1ZFUl9BQ1RJT05fSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMih7XG5cdFx0XHRcdGtleTogJ2dvVG9Cb3R0b21Ib3ZlcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnQWN0aW9uIHRoYXQgYWxsb3dzIHRvIGdvIHRvIHRoZSBib3R0b20gaW4gdGhlIGhvdmVyIHdpZGdldCB3aXRoIHRoZSBlbmQgY29tbWFuZCB3aGVuIHRoZSBob3ZlciB3aWRnZXQgaXMgZm9jdXNlZC4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiR28gVG8gQm90dG9tIEhvdmVyXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW5kLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93XSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignZ29Ub0JvdHRvbUhvdmVyRGVzY3JpcHRpb24nLCAnR28gdG8gdGhlIGJvdHRvbSBvZiB0aGUgZWRpdG9yIGhvdmVyLicpXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb250ZW50SG92ZXJDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLmdvVG9Cb3R0b20oKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5jcmVhc2VIb3ZlclZlcmJvc2l0eUxldmVsIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSU5DUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9JRCxcblx0XHRcdGxhYmVsOiBJTkNSRUFTRV9IT1ZFUl9WRVJCT1NJVFlfQUNUSU9OX0xBQkVMLFxuXHRcdFx0YWxpYXM6ICdJbmNyZWFzZSBIb3ZlciBWZXJib3NpdHkgTGV2ZWwnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlclZpc2libGVcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M/OiB7IGluZGV4OiBudW1iZXI7IGZvY3VzOiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRjb25zdCBob3ZlckNvbnRyb2xsZXIgPSBDb250ZW50SG92ZXJDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghaG92ZXJDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluZGV4ID0gYXJncz8uaW5kZXggIT09IHVuZGVmaW5lZCA/IGFyZ3MuaW5kZXggOiBob3ZlckNvbnRyb2xsZXIuZm9jdXNlZEhvdmVyUGFydEluZGV4KCk7XG5cdFx0aG92ZXJDb250cm9sbGVyLnVwZGF0ZUhvdmVyVmVyYm9zaXR5TGV2ZWwoSG92ZXJWZXJib3NpdHlBY3Rpb24uSW5jcmVhc2UsIGluZGV4LCBhcmdzPy5mb2N1cyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlY3JlYXNlSG92ZXJWZXJib3NpdHlMZXZlbCBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IERFQ1JFQVNFX0hPVkVSX1ZFUkJPU0lUWV9BQ1RJT05fSUQsXG5cdFx0XHRsYWJlbDogREVDUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9MQUJFTCxcblx0XHRcdGFsaWFzOiAnRGVjcmVhc2UgSG92ZXIgVmVyYm9zaXR5IExldmVsJyxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJWaXNpYmxlXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzPzogeyBpbmRleDogbnVtYmVyOyBmb2N1czogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0Y29uc3QgaG92ZXJDb250cm9sbGVyID0gQ29udGVudEhvdmVyQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWhvdmVyQ29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbmRleCA9IGFyZ3M/LmluZGV4ICE9PSB1bmRlZmluZWQgPyBhcmdzLmluZGV4IDogaG92ZXJDb250cm9sbGVyLmZvY3VzZWRIb3ZlclBhcnRJbmRleCgpO1xuXHRcdENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LnVwZGF0ZUhvdmVyVmVyYm9zaXR5TGV2ZWwoSG92ZXJWZXJib3NpdHlBY3Rpb24uRGVjcmVhc2UsIGluZGV4LCBhcmdzPy5mb2N1cyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsb0NBQW9DLHVDQUF1Qyw4QkFBOEIsMkJBQTJCLHNCQUFzQixvQ0FBb0MsdUNBQXVDLDJCQUEyQix5QkFBeUIsNkJBQTZCLDZCQUE2Qiw4QkFBOEIsMkJBQTJCLHlDQUF5QyxxQ0FBcUM7QUFDbmUsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUUxQyxTQUFTLG9CQUFzQztBQUMvQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGFBQWE7QUFDdEIsU0FBUyx5QkFBeUI7QUFD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QVUsT0FBTyxNQUFNLEtBQUs7QUFBQSxFQUM1RjtBQUNEO0FBRU8sTUFBTSxvQ0FBb0MsYUFBYTtBQUFBLEVBRTdELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsTUFDUCxPQUFPO0FBQUEsTUFDUCxjQUFjLGtCQUFrQjtBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxJQUFJLFVBQTRCLFFBQXFCLE1BQWdEO0FBQzNHLFVBQU0sa0JBQWtCLHVCQUF1QixJQUFJLE1BQU07QUFDekQsUUFBSSxDQUFDLGlCQUFpQjtBQUNyQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFFBQVEsTUFBTSxVQUFVLFNBQVksS0FBSyxRQUFRLGdCQUFnQixzQkFBc0I7QUFDN0YsMkJBQXVCLElBQUksTUFBTSxHQUFHLDBCQUEwQixxQkFBcUIsVUFBVSxPQUFPLE1BQU0sS0FBSztBQUFBLEVBQ2hIO0FBQ0Q7IiwKICAibmFtZXMiOiBbIkhvdmVyRm9jdXNCZWhhdmlvciJdCn0K
