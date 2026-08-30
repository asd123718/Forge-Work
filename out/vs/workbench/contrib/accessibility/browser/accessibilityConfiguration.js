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
import { localize } from "../../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { workbenchConfigurationNodeBase, Extensions as WorkbenchExtensions } from "../../../common/configuration.js";
import { AccessibilitySignal } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { AccessibilityVoiceSettingId, ISpeechService, SPEECH_LANGUAGES } from "../../speech/common/speechService.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { isDefined } from "../../../../base/common/types.js";
const accessibilityHelpIsShown = new RawContextKey("accessibilityHelpIsShown", false, true);
const accessibleViewIsShown = new RawContextKey("accessibleViewIsShown", false, true);
const accessibleViewSupportsNavigation = new RawContextKey("accessibleViewSupportsNavigation", false, true);
const accessibleViewVerbosityEnabled = new RawContextKey("accessibleViewVerbosityEnabled", false, true);
const accessibleViewGoToSymbolSupported = new RawContextKey("accessibleViewGoToSymbolSupported", false, true);
const accessibleViewOnLastLine = new RawContextKey("accessibleViewOnLastLine", false, true);
const accessibleViewCurrentProviderId = new RawContextKey("accessibleViewCurrentProviderId", void 0, void 0);
const accessibleViewInCodeBlock = new RawContextKey("accessibleViewInCodeBlock", void 0, void 0);
const accessibleViewContainsCodeBlocks = new RawContextKey("accessibleViewContainsCodeBlocks", void 0, void 0);
const accessibleViewHasUnassignedKeybindings = new RawContextKey("accessibleViewHasUnassignedKeybindings", void 0, void 0);
const accessibleViewHasAssignedKeybindings = new RawContextKey("accessibleViewHasAssignedKeybindings", void 0, void 0);
var AccessibilityWorkbenchSettingId = /* @__PURE__ */ ((AccessibilityWorkbenchSettingId2) => {
  AccessibilityWorkbenchSettingId2["DimUnfocusedEnabled"] = "accessibility.dimUnfocused.enabled";
  AccessibilityWorkbenchSettingId2["DimUnfocusedOpacity"] = "accessibility.dimUnfocused.opacity";
  AccessibilityWorkbenchSettingId2["HideAccessibleView"] = "accessibility.hideAccessibleView";
  AccessibilityWorkbenchSettingId2["AccessibleViewCloseOnKeyPress"] = "accessibility.accessibleView.closeOnKeyPress";
  AccessibilityWorkbenchSettingId2["VerboseChatProgressUpdates"] = "accessibility.verboseChatProgressUpdates";
  AccessibilityWorkbenchSettingId2["ShowChatCheckmarks"] = "accessibility.chat.showCheckmarks";
  return AccessibilityWorkbenchSettingId2;
})(AccessibilityWorkbenchSettingId || {});
var ViewDimUnfocusedOpacityProperties = /* @__PURE__ */ ((ViewDimUnfocusedOpacityProperties2) => {
  ViewDimUnfocusedOpacityProperties2[ViewDimUnfocusedOpacityProperties2["Default"] = 0.75] = "Default";
  ViewDimUnfocusedOpacityProperties2[ViewDimUnfocusedOpacityProperties2["Minimum"] = 0.2] = "Minimum";
  ViewDimUnfocusedOpacityProperties2[ViewDimUnfocusedOpacityProperties2["Maximum"] = 1] = "Maximum";
  return ViewDimUnfocusedOpacityProperties2;
})(ViewDimUnfocusedOpacityProperties || {});
var AccessibilityVerbositySettingId = /* @__PURE__ */ ((AccessibilityVerbositySettingId2) => {
  AccessibilityVerbositySettingId2["Terminal"] = "accessibility.verbosity.terminal";
  AccessibilityVerbositySettingId2["DiffEditor"] = "accessibility.verbosity.diffEditor";
  AccessibilityVerbositySettingId2["MergeEditor"] = "accessibility.verbosity.mergeEditor";
  AccessibilityVerbositySettingId2["Chat"] = "accessibility.verbosity.panelChat";
  AccessibilityVerbositySettingId2["InlineChat"] = "accessibility.verbosity.inlineChat";
  AccessibilityVerbositySettingId2["TerminalInlineChat"] = "accessibility.verbosity.terminalChat";
  AccessibilityVerbositySettingId2["TerminalChatOutput"] = "accessibility.verbosity.terminalChatOutput";
  AccessibilityVerbositySettingId2["InlineCompletions"] = "accessibility.verbosity.inlineCompletions";
  AccessibilityVerbositySettingId2["KeybindingsEditor"] = "accessibility.verbosity.keybindingsEditor";
  AccessibilityVerbositySettingId2["Notebook"] = "accessibility.verbosity.notebook";
  AccessibilityVerbositySettingId2["Editor"] = "accessibility.verbosity.editor";
  AccessibilityVerbositySettingId2["Hover"] = "accessibility.verbosity.hover";
  AccessibilityVerbositySettingId2["Notification"] = "accessibility.verbosity.notification";
  AccessibilityVerbositySettingId2["EmptyEditorHint"] = "accessibility.verbosity.emptyEditorHint";
  AccessibilityVerbositySettingId2["ReplEditor"] = "accessibility.verbosity.replEditor";
  AccessibilityVerbositySettingId2["Comments"] = "accessibility.verbosity.comments";
  AccessibilityVerbositySettingId2["DiffEditorActive"] = "accessibility.verbosity.diffEditorActive";
  AccessibilityVerbositySettingId2["Debug"] = "accessibility.verbosity.debug";
  AccessibilityVerbositySettingId2["Walkthrough"] = "accessibility.verbosity.walkthrough";
  AccessibilityVerbositySettingId2["SourceControl"] = "accessibility.verbosity.sourceControl";
  AccessibilityVerbositySettingId2["Find"] = "accessibility.verbosity.find";
  AccessibilityVerbositySettingId2["SessionsChat"] = "accessibility.verbosity.sessionsChat";
  AccessibilityVerbositySettingId2["SessionsChanges"] = "accessibility.verbosity.sessionsChanges";
  AccessibilityVerbositySettingId2["ChatQuestionCarousel"] = "accessibility.verbosity.chatQuestionCarousel";
  AccessibilityVerbositySettingId2["Survey"] = "accessibility.verbosity.survey";
  AccessibilityVerbositySettingId2["Automations"] = "accessibility.verbosity.automations";
  AccessibilityVerbositySettingId2["BrowserElementCommenting"] = "accessibility.verbosity.browserElementCommenting";
  return AccessibilityVerbositySettingId2;
})(AccessibilityVerbositySettingId || {});
const baseVerbosityProperty = {
  type: "boolean",
  default: true,
  tags: ["accessibility"]
};
const accessibilityConfigurationNodeBase = Object.freeze({
  id: "accessibility",
  title: localize("accessibilityConfigurationTitle", "Accessibility"),
  type: "object"
});
const soundFeatureBase = {
  "type": "string",
  "enum": ["auto", "on", "off"],
  "default": "auto",
  "enumDescriptions": [
    localize("sound.enabled.auto", "Enable sound when a screen reader is attached."),
    localize("sound.enabled.on", "Enable sound."),
    localize("sound.enabled.off", "Disable sound.")
  ],
  tags: ["accessibility"]
};
const signalFeatureBase = {
  "type": "object",
  "tags": ["accessibility"],
  additionalProperties: false,
  default: {
    sound: "auto",
    announcement: "auto"
  }
};
const announcementFeatureBase = {
  "type": "string",
  "enum": ["auto", "off"],
  "default": "auto",
  "enumDescriptions": [
    localize("announcement.enabled.auto", "Enable announcement, will only play when in screen reader optimized mode."),
    localize("announcement.enabled.off", "Disable announcement.")
  ],
  tags: ["accessibility"]
};
const defaultNoAnnouncement = {
  "type": "object",
  "tags": ["accessibility"],
  additionalProperties: false,
  "default": {
    "sound": "auto"
  }
};
const configuration = {
  ...accessibilityConfigurationNodeBase,
  scope: ConfigurationScope.RESOURCE,
  properties: {
    ["accessibility.verbosity.terminal" /* Terminal */]: {
      description: localize("verbosity.terminal.description", "Provide information about how to access the terminal accessibility help menu when the terminal is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.diffEditor" /* DiffEditor */]: {
      description: localize("verbosity.diffEditor.description", "Provide information about how to navigate changes in the diff editor when it is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.panelChat" /* Chat */]: {
      description: localize("verbosity.chat.description", "Provide information about how to access the chat help menu when the chat input is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.inlineChat" /* InlineChat */]: {
      description: localize("verbosity.interactiveEditor.description", "Provide information about how to access the inline editor chat accessibility help menu and alert with hints that describe how to use the feature when the input is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.terminalChatOutput" /* TerminalChatOutput */]: {
      description: localize("verbosity.terminalChatOutput.description", "Provide information about how to open the chat terminal output in the Accessible View."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.inlineCompletions" /* InlineCompletions */]: {
      description: localize("verbosity.inlineCompletions.description", "Provide information about how to access the inline completions hover and Accessible View."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.keybindingsEditor" /* KeybindingsEditor */]: {
      description: localize("verbosity.keybindingsEditor.description", "Provide information about how to change a keybinding in the keybindings editor when a row is focused and how to navigate to the results table."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.notebook" /* Notebook */]: {
      description: localize("verbosity.notebook", "Provide information about how to focus the cell container or inner editor when a notebook cell is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.hover" /* Hover */]: {
      description: localize("verbosity.hover", "Provide information about how to open the hover in an Accessible View."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.notification" /* Notification */]: {
      description: localize("verbosity.notification", "Provide information about how to open the notification in an Accessible View."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.emptyEditorHint" /* EmptyEditorHint */]: {
      description: localize("verbosity.emptyEditorHint", "Provide information about relevant actions in an empty text editor."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.replEditor" /* ReplEditor */]: {
      description: localize("verbosity.replEditor.description", "Provide information about how to access the REPL editor accessibility help menu when the REPL editor is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.comments" /* Comments */]: {
      description: localize("verbosity.comments", "Provide information about actions that can be taken in the comment widget or in a file which contains comments."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.diffEditorActive" /* DiffEditorActive */]: {
      description: localize("verbosity.diffEditorActive", "Indicate when a diff editor becomes the active editor."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.debug" /* Debug */]: {
      description: localize("verbosity.debug", "Provide information about how to access the debug console accessibility help dialog when the debug console or run and debug viewlet is focused. Note that a reload of the window is required for this to take effect."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.walkthrough" /* Walkthrough */]: {
      description: localize("verbosity.walkthrough", "Provide information about how to open the walkthrough in an Accessible View."),
      ...baseVerbosityProperty
    },
    ["accessibility.accessibleView.closeOnKeyPress" /* AccessibleViewCloseOnKeyPress */]: {
      markdownDescription: localize("terminal.integrated.accessibleView.closeOnKeyPress", "On keypress, close the Accessible View and focus the element from which it was invoked."),
      type: "boolean",
      default: true
    },
    ["accessibility.verbosity.sourceControl" /* SourceControl */]: {
      description: localize("verbosity.scm", "Provide information about how to access the source control accessibility help menu when the input is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.find" /* Find */]: {
      description: localize("verbosity.find", "Provide information about how to access the find accessibility help menu when the find input is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.sessionsChat" /* SessionsChat */]: {
      description: localize("verbosity.sessionsChat", "Provide information about how to access the Agents window accessibility help menu when the chat input is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.sessionsChanges" /* SessionsChanges */]: {
      description: localize("verbosity.sessionsChanges", "Provide information about how to access the Changes view accessibility help menu when the Changes view is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.chatQuestionCarousel" /* ChatQuestionCarousel */]: {
      description: localize("verbosity.chatQuestionCarousel", "Provide information about how to navigate and interact with the chat question carousel, including how to focus the terminal when applicable."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.survey" /* Survey */]: {
      description: localize("verbosity.survey", "Provide information about how to navigate and interact with the survey editor pane."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.automations" /* Automations */]: {
      description: localize("verbosity.automations", "Provide information about how to use Automations management views, including keyboard navigation and how to inspect scheduled runs."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.browserElementCommenting" /* BrowserElementCommenting */]: {
      description: localize("verbosity.browserElementCommenting", "Provide information about how to access element commenting accessibility help in the Integrated Browser."),
      ...baseVerbosityProperty
    },
    "accessibility.signalOptions.volume": {
      "description": localize("accessibility.signalOptions.volume", "The volume of the sounds in percent (0-100)."),
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "default": 70,
      "tags": ["accessibility"]
    },
    "accessibility.signalOptions.debouncePositionChanges": {
      "description": localize("accessibility.signalOptions.debouncePositionChanges", "Whether or not position changes should be debounced"),
      "type": "boolean",
      "default": false,
      "tags": ["accessibility"]
    },
    "accessibility.signalOptions.experimental.delays.general": {
      "type": "object",
      "description": "Delays for all signals besides error and warning at position",
      "additionalProperties": false,
      "properties": {
        "announcement": {
          "description": localize("accessibility.signalOptions.delays.general.announcement", "The delay in milliseconds before an announcement is made."),
          "type": "number",
          "minimum": 0,
          "default": 3e3
        },
        "sound": {
          "description": localize("accessibility.signalOptions.delays.general.sound", "The delay in milliseconds before a sound is played."),
          "type": "number",
          "minimum": 0,
          "default": 400
        }
      },
      "tags": ["accessibility"]
    },
    "accessibility.signalOptions.experimental.delays.warningAtPosition": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "announcement": {
          "description": localize("accessibility.signalOptions.delays.warningAtPosition.announcement", "The delay in milliseconds before an announcement is made when there's a warning at the position."),
          "type": "number",
          "minimum": 0,
          "default": 3e3
        },
        "sound": {
          "description": localize("accessibility.signalOptions.delays.warningAtPosition.sound", "The delay in milliseconds before a sound is played when there's a warning at the position."),
          "type": "number",
          "minimum": 0,
          "default": 1e3
        }
      },
      "tags": ["accessibility"]
    },
    "accessibility.signalOptions.experimental.delays.errorAtPosition": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "announcement": {
          "description": localize("accessibility.signalOptions.delays.errorAtPosition.announcement", "The delay in milliseconds before an announcement is made when there's an error at the position."),
          "type": "number",
          "minimum": 0,
          "default": 3e3
        },
        "sound": {
          "description": localize("accessibility.signalOptions.delays.errorAtPosition.sound", "The delay in milliseconds before a sound is played when there's an error at the position."),
          "type": "number",
          "minimum": 0,
          "default": 1e3
        }
      },
      "tags": ["accessibility"]
    },
    "accessibility.signals.lineHasBreakpoint": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.lineHasBreakpoint", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the active line has a breakpoint."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.lineHasBreakpoint.sound", "Plays a sound when the active line has a breakpoint."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.lineHasBreakpoint.announcement", "Announces when the active line has a breakpoint."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.lineHasInlineSuggestion": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.lineHasInlineSuggestion", "Plays a sound / audio cue when the active line has an inline suggestion."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.lineHasInlineSuggestion.sound", "Plays a sound when the active line has an inline suggestion."),
          ...soundFeatureBase,
          "default": "off"
        }
      }
    },
    "accessibility.signals.nextEditSuggestion": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.nextEditSuggestion", "Plays a signal - sound / audio cue and/or announcement (alert) when there is a next edit suggestion."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.nextEditSuggestion.sound", "Plays a sound when there is a next edit suggestion."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.nextEditSuggestion.announcement", "Announces when there is a next edit suggestion."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.lineHasError": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.lineHasError", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the active line has an error."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.lineHasError.sound", "Plays a sound when the active line has an error."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.lineHasError.announcement", "Announces when the active line has an error."),
          ...announcementFeatureBase,
          default: "off"
        }
      }
    },
    "accessibility.signals.lineHasFoldedArea": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.lineHasFoldedArea", "Plays a signal - sound (audio cue) and/or announcement (alert) - the active line has a folded area that can be unfolded."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.lineHasFoldedArea.sound", "Plays a sound when the active line has a folded area that can be unfolded."),
          ...soundFeatureBase,
          default: "off"
        },
        "announcement": {
          "description": localize("accessibility.signals.lineHasFoldedArea.announcement", "Announces when the active line has a folded area that can be unfolded."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.lineHasWarning": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.lineHasWarning", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the active line has a warning."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.lineHasWarning.sound", "Plays a sound when the active line has a warning."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.lineHasWarning.announcement", "Announces when the active line has a warning."),
          ...announcementFeatureBase,
          default: "off"
        }
      }
    },
    "accessibility.signals.positionHasError": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.positionHasError", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the active line has a warning."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.positionHasError.sound", "Plays a sound when the active line has a warning."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.positionHasError.announcement", "Announces when the active line has a warning."),
          ...announcementFeatureBase,
          default: "on"
        }
      }
    },
    "accessibility.signals.positionHasWarning": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.positionHasWarning", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the active line has a warning."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.positionHasWarning.sound", "Plays a sound when the active line has a warning."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.positionHasWarning.announcement", "Announces when the active line has a warning."),
          ...announcementFeatureBase,
          default: "on"
        }
      }
    },
    "accessibility.signals.onDebugBreak": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.onDebugBreak", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the debugger stopped on a breakpoint."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.onDebugBreak.sound", "Plays a sound when the debugger stopped on a breakpoint."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.onDebugBreak.announcement", "Announces when the debugger stopped on a breakpoint."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.noInlayHints": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.noInlayHints", "Plays a signal - sound (audio cue) and/or announcement (alert) - when trying to read a line with inlay hints that has no inlay hints."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.noInlayHints.sound", "Plays a sound when trying to read a line with inlay hints that has no inlay hints."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.noInlayHints.announcement", "Announces when trying to read a line with inlay hints that has no inlay hints."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.taskCompleted": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.taskCompleted", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a task is completed."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.taskCompleted.sound", "Plays a sound when a task is completed."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.taskCompleted.announcement", "Announces when a task is completed."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.taskFailed": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.taskFailed", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a task fails (non-zero exit code)."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.taskFailed.sound", "Plays a sound when a task fails (non-zero exit code)."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.taskFailed.announcement", "Announces when a task fails (non-zero exit code)."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.terminalCommandFailed": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.terminalCommandFailed", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a terminal command fails (non-zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.terminalCommandFailed.sound", "Plays a sound when a terminal command fails (non-zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.terminalCommandFailed.announcement", "Announces when a terminal command fails (non-zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.terminalCommandSucceeded": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.terminalCommandSucceeded", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a terminal command succeeds (zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.terminalCommandSucceeded.sound", "Plays a sound when a terminal command succeeds (zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.terminalCommandSucceeded.announcement", "Announces when a terminal command succeeds (zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.terminalQuickFix": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.terminalQuickFix", "Plays a signal - sound (audio cue) and/or announcement (alert) - when terminal Quick Fixes are available."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.terminalQuickFix.sound", "Plays a sound when terminal Quick Fixes are available."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.terminalQuickFix.announcement", "Announces when terminal Quick Fixes are available."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.terminalBell": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.terminalBell", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the terminal bell is ringing."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.terminalBell.sound", "Plays a sound when the terminal bell is ringing."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.terminalBell.announcement", "Announces when the terminal bell is ringing."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.diffLineInserted": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.diffLineInserted", "Plays a sound / audio cue when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.sound", "Plays a sound when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.diffLineModified": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.diffLineModified", "Plays a sound / audio cue when the focus moves to an modified line in Accessible Diff Viewer mode or to the next/previous change."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.diffLineModified.sound", "Plays a sound when the focus moves to a modified line in Accessible Diff Viewer mode or to the next/previous change."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.diffLineDeleted": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.diffLineDeleted", "Plays a sound / audio cue when the focus moves to an deleted line in Accessible Diff Viewer mode or to the next/previous change."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.diffLineDeleted.sound", "Plays a sound when the focus moves to an deleted line in Accessible Diff Viewer mode or to the next/previous change."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.chatEditModifiedFile": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.chatEditModifiedFile", "Plays a sound / audio cue when revealing a file with changes from chat edits"),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.chatEditModifiedFile.sound", "Plays a sound when revealing a file with changes from chat edits"),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.notebookCellCompleted": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.notebookCellCompleted", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a notebook cell execution is successfully completed."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.notebookCellCompleted.sound", "Plays a sound when a notebook cell execution is successfully completed."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.notebookCellCompleted.announcement", "Announces when a notebook cell execution is successfully completed."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.notebookCellFailed": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.notebookCellFailed", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a notebook cell execution fails."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.notebookCellFailed.sound", "Plays a sound when a notebook cell execution fails."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.notebookCellFailed.announcement", "Announces when a notebook cell execution fails."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.progress": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.progress", "Plays a signal - sound (audio cue) and/or announcement (alert) - on loop while progress is occurring."),
      "default": {
        "sound": "auto",
        "announcement": "off"
      },
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.progress.sound", "Plays a sound on loop while progress is occurring."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.progress.announcement", "Alerts on loop while progress is occurring."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.chatRequestSent": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.chatRequestSent", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a chat request is made."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.chatRequestSent.sound", "Plays a sound when a chat request is made."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.chatRequestSent.announcement", "Announces when a chat request is made."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.chatResponseReceived": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.chatResponseReceived", "Plays a sound / audio cue when the response has been received."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.chatResponseReceived.sound", "Plays a sound on when the response has been received."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.codeActionTriggered": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.codeActionTriggered", "Plays a sound / audio cue - when a code action has been triggered."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.codeActionTriggered.sound", "Plays a sound when a code action has been triggered."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.codeActionApplied": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.codeActionApplied", "Plays a sound / audio cue when the code action has been applied."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.codeActionApplied.sound", "Plays a sound when the code action has been applied."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.voiceRecordingStarted": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.voiceRecordingStarted", "Plays a sound / audio cue when the voice recording has started."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.voiceRecordingStarted.sound", "Plays a sound when the voice recording has started."),
          ...soundFeatureBase
        }
      },
      "default": {
        "sound": "on"
      }
    },
    "accessibility.signals.voiceModeStarted": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.voiceModeStarted", "Plays a signal - sound (audio cue) and/or announcement (alert) - when voice mode has started."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.voiceModeStarted.sound", "Plays a sound when voice mode has started."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.voiceModeStarted.announcement", "Announces when voice mode has started."),
          ...announcementFeatureBase
        }
      },
      "default": {
        "sound": "on",
        "announcement": "auto"
      }
    },
    "accessibility.signals.voiceRecordingStopped": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.voiceRecordingStopped", "Plays a sound / audio cue when the voice recording has stopped."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.voiceRecordingStopped.sound", "Plays a sound when the voice recording has stopped."),
          ...soundFeatureBase
        }
      },
      "default": {
        "sound": "on"
      }
    },
    "accessibility.signals.voiceModeStopped": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.voiceModeStopped", "Plays a signal - sound (audio cue) and/or announcement (alert) - when voice mode has stopped."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.voiceModeStopped.sound", "Plays a sound when voice mode has stopped."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.voiceModeStopped.announcement", "Announces when voice mode has stopped."),
          ...announcementFeatureBase
        }
      },
      "default": {
        "sound": "on",
        "announcement": "auto"
      }
    },
    "accessibility.signals.clear": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.clear", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a feature is cleared (for example, the terminal, Debug Console, or Output channel)."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.clear.sound", "Plays a sound when a feature is cleared."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.clear.announcement", "Announces when a feature is cleared."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.editsUndone": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.editsUndone", "Plays a signal - sound (audio cue) and/or announcement (alert) - when edits have been undone."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.editsUndone.sound", "Plays a sound when edits have been undone."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.editsUndone.announcement", "Announces when edits have been undone."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.editsKept": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.editsKept", "Plays a signal - sound (audio cue) and/or announcement (alert) - when edits are kept."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.editsKept.sound", "Plays a sound when edits are kept."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.editsKept.announcement", "Announces when edits are kept."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.save": {
      "type": "object",
      "tags": ["accessibility"],
      additionalProperties: false,
      "markdownDescription": localize("accessibility.signals.save", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a file is saved."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.save.sound", "Plays a sound when a file is saved."),
          "type": "string",
          "enum": ["userGesture", "always", "never"],
          "default": "never",
          "enumDescriptions": [
            localize("accessibility.signals.save.sound.userGesture", "Plays the sound when a user explicitly saves a file."),
            localize("accessibility.signals.save.sound.always", "Plays the sound whenever a file is saved, including auto save."),
            localize("accessibility.signals.save.sound.never", "Never plays the sound.")
          ]
        },
        "announcement": {
          "description": localize("accessibility.signals.save.announcement", "Announces when a file is saved."),
          "type": "string",
          "enum": ["userGesture", "always", "never"],
          "default": "never",
          "enumDescriptions": [
            localize("accessibility.signals.save.announcement.userGesture", "Announces when a user explicitly saves a file."),
            localize("accessibility.signals.save.announcement.always", "Announces whenever a file is saved, including auto save."),
            localize("accessibility.signals.save.announcement.never", "Never plays the announcement.")
          ]
        }
      },
      default: {
        "sound": "never",
        "announcement": "never"
      }
    },
    "accessibility.signals.format": {
      "type": "object",
      "tags": ["accessibility"],
      additionalProperties: false,
      "markdownDescription": localize("accessibility.signals.format", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a file or notebook is formatted."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.format.sound", "Plays a sound when a file or notebook is formatted."),
          "type": "string",
          "enum": ["userGesture", "always", "never"],
          "default": "never",
          "enumDescriptions": [
            localize("accessibility.signals.format.userGesture", "Plays the sound when a user explicitly formats a file."),
            localize("accessibility.signals.format.always", "Plays the sound whenever a file is formatted, including if it is set to format on save, type, or, paste, or run of a cell."),
            localize("accessibility.signals.format.never", "Never plays the sound.")
          ]
        },
        "announcement": {
          "description": localize("accessibility.signals.format.announcement", "Announces when a file or notebook is formatted."),
          "type": "string",
          "enum": ["userGesture", "always", "never"],
          "default": "never",
          "enumDescriptions": [
            localize("accessibility.signals.format.announcement.userGesture", "Announces when a user explicitly formats a file."),
            localize("accessibility.signals.format.announcement.always", "Announces whenever a file is formatted, including if it is set to format on save, type, or, paste, or run of a cell."),
            localize("accessibility.signals.format.announcement.never", "Never announces.")
          ]
        }
      },
      default: {
        "sound": "never",
        "announcement": "never"
      }
    },
    "accessibility.signals.chatUserActionRequired": {
      ...signalFeatureBase,
      "markdownDescription": localize("accessibility.signals.chatUserActionRequired", "Plays a signal - sound (audio cue) and/or announcement (alert) - when user action is required in the chat."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.chatUserActionRequired.sound", "Plays a sound when user action is required in the chat."),
          "type": "string",
          "enum": ["auto", "on", "off"],
          "enumDescriptions": [
            localize("sound.enabled.autoWindow", "Enable sound when a screen reader is attached."),
            localize("sound.enabled.on", "Enable sound."),
            localize("sound.enabled.off", "Disable sound.")
          ]
        },
        "announcement": {
          "description": localize("accessibility.signals.chatUserActionRequired.announcement", "Announces when a user action is required in the chat - including information about the action and how to take it."),
          ...announcementFeatureBase
        }
      },
      default: {
        "sound": "auto",
        "announcement": "auto"
      },
      tags: ["accessibility"]
    },
    "accessibility.underlineLinks": {
      "type": "boolean",
      "description": localize("accessibility.underlineLinks", "Controls whether links should be underlined in the workbench."),
      "default": false
    },
    "accessibility.debugWatchVariableAnnouncements": {
      "type": "boolean",
      "description": localize("accessibility.debugWatchVariableAnnouncements", "Controls whether variable changes should be announced in the debug watch view."),
      "default": true
    },
    "accessibility.replEditor.readLastExecutionOutput": {
      "type": "boolean",
      "description": localize("accessibility.replEditor.readLastExecutedOutput", "Controls whether the output from an execution in the native REPL will be announced."),
      "default": true
    },
    "accessibility.replEditor.autoFocusReplExecution": {
      type: "string",
      enum: ["none", "input", "lastExecution"],
      default: "input",
      description: localize("replEditor.autoFocusAppendedCell", "Control whether focus should automatically be sent to the REPL when code is executed.")
    },
    "accessibility.windowTitleOptimized": {
      "type": "boolean",
      "default": true,
      "markdownDescription": localize("accessibility.windowTitleOptimized", "Controls whether the {0} should be optimized for screen readers when in screen reader mode. When enabled, the window title will have {1} appended to the end.", "`#window.title#`", "`activeEditorState`")
    },
    "accessibility.openChatEditedFiles": {
      "type": "boolean",
      "default": false,
      "markdownDescription": localize("accessibility.openChatEditedFiles", "Controls whether files should be opened when the chat agent has applied edits to them.")
    },
    "accessibility.verboseChatProgressUpdates": {
      "type": "boolean",
      "default": true,
      "markdownDescription": localize("accessibility.verboseChatProgressUpdates", "Controls whether verbose progress announcements should be made when a chat request is in progress, including information like searched text for <search term> with X results, created file <file_name>, or read file <file path>.")
    }
  }
};
function registerAccessibilityConfiguration() {
  const registry = Registry.as(Extensions.Configuration);
  registry.registerConfiguration(configuration);
  registry.registerConfiguration({
    ...workbenchConfigurationNodeBase,
    properties: {
      ["accessibility.dimUnfocused.enabled" /* DimUnfocusedEnabled */]: {
        description: localize("dimUnfocusedEnabled", "Whether to dim unfocused editors and terminals, which makes it more clear where typed input will go to. This works with the majority of editors with the notable exceptions of those that utilize iframes like notebooks and extension webview editors."),
        type: "boolean",
        default: false,
        tags: ["accessibility"],
        scope: ConfigurationScope.APPLICATION
      },
      ["accessibility.dimUnfocused.opacity" /* DimUnfocusedOpacity */]: {
        markdownDescription: localize("dimUnfocusedOpacity", "The opacity fraction (0.2 to 1.0) to use for unfocused editors and terminals. This will only take effect when {0} is enabled.", `\`#${"accessibility.dimUnfocused.enabled" /* DimUnfocusedEnabled */}#\``),
        type: "number",
        minimum: 0.2 /* Minimum */,
        maximum: 1 /* Maximum */,
        default: 0.75 /* Default */,
        tags: ["accessibility"],
        scope: ConfigurationScope.APPLICATION
      },
      ["accessibility.hideAccessibleView" /* HideAccessibleView */]: {
        description: localize("accessibility.hideAccessibleView", "Controls whether the Accessible View is hidden."),
        type: "boolean",
        default: false,
        tags: ["accessibility"]
      },
      ["accessibility.verboseChatProgressUpdates" /* VerboseChatProgressUpdates */]: {
        "type": "boolean",
        "default": true,
        "markdownDescription": localize("accessibility.verboseChatProgressUpdates", "Controls whether verbose progress announcements should be made when a chat request is in progress, including information like searched text for <search term> with X results, created file <file_name>, or read file <file path>.")
      },
      ["accessibility.chat.showCheckmarks" /* ShowChatCheckmarks */]: {
        "type": "boolean",
        "default": false,
        "tags": ["accessibility"],
        "markdownDescription": localize("accessibility.chat.showCheckmarks", "Controls whether checkmark icons are shown on completed tool calls and other collapsible items in chat responses.")
      }
    }
  });
}
const SpeechTimeoutDefault = 0;
let DynamicSpeechAccessibilityConfiguration = class extends Disposable {
  constructor(speechService) {
    super();
    this.speechService = speechService;
    this._register(Event.runAndSubscribe(speechService.onDidChangeHasSpeechProvider, () => this.updateConfiguration()));
  }
  updateConfiguration() {
    if (!this.speechService.hasSpeechProvider) {
      return;
    }
    const languages = this.getLanguages();
    const languagesSorted = Object.keys(languages).sort((langA, langB) => {
      return languages[langA].name.localeCompare(languages[langB].name);
    });
    const registry = Registry.as(Extensions.Configuration);
    registry.registerConfiguration({
      ...accessibilityConfigurationNodeBase,
      properties: {
        [AccessibilityVoiceSettingId.SpeechTimeout]: {
          "markdownDescription": localize("voice.speechTimeout", "The duration in milliseconds that voice speech recognition remains active after you stop speaking. For example in a chat session, the transcribed text is submitted automatically after the timeout is met. Set to `0` to disable this feature."),
          "type": "number",
          "default": SpeechTimeoutDefault,
          "minimum": 0,
          "tags": ["accessibility"]
        },
        [AccessibilityVoiceSettingId.IgnoreCodeBlocks]: {
          "markdownDescription": localize("voice.ignoreCodeBlocks", "Whether to ignore code snippets in text-to-speech synthesis."),
          "type": "boolean",
          "default": false,
          "tags": ["accessibility"]
        },
        [AccessibilityVoiceSettingId.SpeechLanguage]: {
          "markdownDescription": localize("voice.speechLanguage", "The language that text-to-speech and speech-to-text should use. Select `auto` to use the configured display language if possible. Note that not all display languages maybe supported by speech recognition and synthesizers."),
          "type": "string",
          "enum": languagesSorted,
          "default": "auto",
          "tags": ["accessibility"],
          "enumDescriptions": languagesSorted.map((key) => languages[key].name),
          "enumItemLabels": languagesSorted.map((key) => languages[key].name)
        },
        [AccessibilityVoiceSettingId.AutoSynthesize]: {
          "type": "string",
          "enum": ["on", "off"],
          "enumDescriptions": [
            localize("accessibility.voice.autoSynthesize.on", "Enable the feature. When a screen reader is enabled, note that this will disable aria updates."),
            localize("accessibility.voice.autoSynthesize.off", "Disable the feature.")
          ],
          "markdownDescription": localize("autoSynthesize", "Whether a textual response should automatically be read out aloud when speech was used as input. For example in a chat session, a response is automatically synthesized when voice was used as chat request."),
          "default": "off",
          "tags": ["accessibility"]
        }
      }
    });
  }
  getLanguages() {
    return {
      ["auto"]: {
        name: localize("speechLanguage.auto", "Auto (Use Display Language)")
      },
      ...SPEECH_LANGUAGES
    };
  }
};
DynamicSpeechAccessibilityConfiguration.ID = "workbench.contrib.dynamicSpeechAccessibilityConfiguration";
DynamicSpeechAccessibilityConfiguration = __decorateClass([
  __decorateParam(0, ISpeechService)
], DynamicSpeechAccessibilityConfiguration);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "audioCues.volume",
  migrateFn: (value, accessor) => {
    return [
      ["accessibility.signalOptions.volume", { value }],
      ["audioCues.volume", { value: void 0 }]
    ];
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "audioCues.debouncePositionChanges",
  migrateFn: (value) => {
    return [
      ["accessibility.signalOptions.debouncePositionChanges", { value }],
      ["audioCues.debouncePositionChanges", { value: void 0 }]
    ];
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "accessibility.signalOptions",
  migrateFn: (value, accessor) => {
    const delayGeneral = getDelaysFromConfig(accessor, "general");
    const delayError = getDelaysFromConfig(accessor, "errorAtPosition");
    const delayWarning = getDelaysFromConfig(accessor, "warningAtPosition");
    const volume = getVolumeFromConfig(accessor);
    const debouncePositionChanges = getDebouncePositionChangesFromConfig(accessor);
    const result = [];
    if (!!volume) {
      result.push(["accessibility.signalOptions.volume", { value: volume }]);
    }
    if (!!delayGeneral) {
      result.push(["accessibility.signalOptions.experimental.delays.general", { value: delayGeneral }]);
    }
    if (!!delayError) {
      result.push(["accessibility.signalOptions.experimental.delays.errorAtPosition", { value: delayError }]);
    }
    if (!!delayWarning) {
      result.push(["accessibility.signalOptions.experimental.delays.warningAtPosition", { value: delayWarning }]);
    }
    if (!!debouncePositionChanges) {
      result.push(["accessibility.signalOptions.debouncePositionChanges", { value: debouncePositionChanges }]);
    }
    result.push(["accessibility.signalOptions", { value: void 0 }]);
    return result;
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "accessibility.signals.sounds.volume",
  migrateFn: (value) => {
    return [
      ["accessibility.signalOptions.volume", { value }],
      ["accessibility.signals.sounds.volume", { value: void 0 }]
    ];
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "accessibility.signals.debouncePositionChanges",
  migrateFn: (value) => {
    return [
      ["accessibility.signalOptions.debouncePositionChanges", { value }],
      ["accessibility.signals.debouncePositionChanges", { value: void 0 }]
    ];
  }
}]);
function getDelaysFromConfig(accessor, type) {
  return accessor(`accessibility.signalOptions.experimental.delays.${type}`) || accessor("accessibility.signalOptions")?.["experimental.delays"]?.[`${type}`] || accessor("accessibility.signalOptions")?.["delays"]?.[`${type}`];
}
function getVolumeFromConfig(accessor) {
  return accessor("accessibility.signalOptions.volume") || accessor("accessibility.signalOptions")?.volume || accessor("accessibility.signals.sounds.volume") || accessor("audioCues.volume");
}
function getDebouncePositionChangesFromConfig(accessor) {
  return accessor("accessibility.signalOptions.debouncePositionChanges") || accessor("accessibility.signalOptions")?.debouncePositionChanges || accessor("accessibility.signals.debouncePositionChanges") || accessor("audioCues.debouncePositionChanges");
}
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: AccessibilityVoiceSettingId.AutoSynthesize,
  migrateFn: (value) => {
    let newValue;
    if (value === true) {
      newValue = "on";
    } else if (value === false) {
      newValue = "off";
    } else {
      return [];
    }
    return [
      [AccessibilityVoiceSettingId.AutoSynthesize, { value: newValue }]
    ];
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "accessibility.signals.chatResponsePending",
  migrateFn: (value, accessor) => {
    return [
      ["accessibility.signals.progress", { value }],
      ["accessibility.signals.chatResponsePending", { value: void 0 }]
    ];
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations(AccessibilitySignal.allAccessibilitySignals.map((item) => item.legacySoundSettingsKey ? {
  key: item.legacySoundSettingsKey,
  migrateFn: (sound, accessor) => {
    const configurationKeyValuePairs = [];
    const legacyAnnouncementSettingsKey = item.legacyAnnouncementSettingsKey;
    let announcement;
    if (legacyAnnouncementSettingsKey) {
      announcement = accessor(legacyAnnouncementSettingsKey) ?? void 0;
      if (announcement !== void 0 && typeof announcement !== "string") {
        announcement = announcement ? "auto" : "off";
      }
    }
    configurationKeyValuePairs.push([`${item.legacySoundSettingsKey}`, { value: void 0 }]);
    configurationKeyValuePairs.push([`${item.settingsKey}`, { value: announcement !== void 0 ? { announcement, sound } : { sound } }]);
    return configurationKeyValuePairs;
  }
} : void 0).filter(isDefined));
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations(AccessibilitySignal.allAccessibilitySignals.filter((i) => !!i.legacyAnnouncementSettingsKey && !!i.legacySoundSettingsKey).map((item) => ({
  key: item.legacyAnnouncementSettingsKey,
  migrateFn: (announcement, accessor) => {
    const configurationKeyValuePairs = [];
    const sound = accessor(item.settingsKey)?.sound || accessor(item.legacySoundSettingsKey);
    if (announcement !== void 0 && typeof announcement !== "string") {
      announcement = announcement ? "auto" : "off";
    }
    configurationKeyValuePairs.push([`${item.settingsKey}`, { value: announcement !== void 0 ? { announcement, sound } : { sound } }]);
    configurationKeyValuePairs.push([`${item.legacyAnnouncementSettingsKey}`, { value: void 0 }]);
    configurationKeyValuePairs.push([`${item.legacySoundSettingsKey}`, { value: void 0 }]);
    return configurationKeyValuePairs;
  }
})));
export {
  AccessibilityVerbositySettingId,
  AccessibilityVoiceSettingId,
  AccessibilityWorkbenchSettingId,
  DynamicSpeechAccessibilityConfiguration,
  SpeechTimeoutDefault,
  ViewDimUnfocusedOpacityProperties,
  accessibilityConfigurationNodeBase,
  accessibilityHelpIsShown,
  accessibleViewContainsCodeBlocks,
  accessibleViewCurrentProviderId,
  accessibleViewGoToSymbolSupported,
  accessibleViewHasAssignedKeybindings,
  accessibleViewHasUnassignedKeybindings,
  accessibleViewInCodeBlock,
  accessibleViewIsShown,
  accessibleViewOnLastLine,
  accessibleViewSupportsNavigation,
  accessibleViewVerbosityEnabled,
  announcementFeatureBase,
  registerAccessibilityConfiguration,
  soundFeatureBase
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFjY2Vzc2liaWxpdHlcXGJyb3dzZXJcXGFjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk5vZGUsIElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlLCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnksIENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLCBDb25maWd1cmF0aW9uTWlncmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNpZ25hbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5Vm9pY2VTZXR0aW5nSWQsIElTcGVlY2hTZXJ2aWNlLCBTUEVFQ0hfTEFOR1VBR0VTIH0gZnJvbSAnLi4vLi4vc3BlZWNoL2NvbW1vbi9zcGVlY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5leHBvcnQgY29uc3QgYWNjZXNzaWJpbGl0eUhlbHBJc1Nob3duID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FjY2Vzc2liaWxpdHlIZWxwSXNTaG93bicsIGZhbHNlLCB0cnVlKTtcbmV4cG9ydCBjb25zdCBhY2Nlc3NpYmxlVmlld0lzU2hvd24gPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWNjZXNzaWJsZVZpZXdJc1Nob3duJywgZmFsc2UsIHRydWUpO1xuZXhwb3J0IGNvbnN0IGFjY2Vzc2libGVWaWV3U3VwcG9ydHNOYXZpZ2F0aW9uID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FjY2Vzc2libGVWaWV3U3VwcG9ydHNOYXZpZ2F0aW9uJywgZmFsc2UsIHRydWUpO1xuZXhwb3J0IGNvbnN0IGFjY2Vzc2libGVWaWV3VmVyYm9zaXR5RW5hYmxlZCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdhY2Nlc3NpYmxlVmlld1ZlcmJvc2l0eUVuYWJsZWQnLCBmYWxzZSwgdHJ1ZSk7XG5leHBvcnQgY29uc3QgYWNjZXNzaWJsZVZpZXdHb1RvU3ltYm9sU3VwcG9ydGVkID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FjY2Vzc2libGVWaWV3R29Ub1N5bWJvbFN1cHBvcnRlZCcsIGZhbHNlLCB0cnVlKTtcbmV4cG9ydCBjb25zdCBhY2Nlc3NpYmxlVmlld09uTGFzdExpbmUgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWNjZXNzaWJsZVZpZXdPbkxhc3RMaW5lJywgZmFsc2UsIHRydWUpO1xuZXhwb3J0IGNvbnN0IGFjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuZXhwb3J0IGNvbnN0IGFjY2Vzc2libGVWaWV3SW5Db2RlQmxvY2sgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWNjZXNzaWJsZVZpZXdJbkNvZGVCbG9jaycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbmV4cG9ydCBjb25zdCBhY2Nlc3NpYmxlVmlld0NvbnRhaW5zQ29kZUJsb2NrcyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdhY2Nlc3NpYmxlVmlld0NvbnRhaW5zQ29kZUJsb2NrcycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbmV4cG9ydCBjb25zdCBhY2Nlc3NpYmxlVmlld0hhc1VuYXNzaWduZWRLZXliaW5kaW5ncyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdhY2Nlc3NpYmxlVmlld0hhc1VuYXNzaWduZWRLZXliaW5kaW5ncycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbmV4cG9ydCBjb25zdCBhY2Nlc3NpYmxlVmlld0hhc0Fzc2lnbmVkS2V5YmluZGluZ3MgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWNjZXNzaWJsZVZpZXdIYXNBc3NpZ25lZEtleWJpbmRpbmdzJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXG4vKipcbiAqIE1pc2NlbGxhbmVvdXMgc2V0dGluZ3MgdGFnZ2VkIHdpdGggYWNjZXNzaWJpbGl0eSBhbmQgaW1wbGVtZW50ZWQgaW4gdGhlIGFjY2Vzc2liaWxpdHkgY29udHJpYiBidXRcbiAqIHdlcmUgYmV0dGVyIHRvIGxpdmUgdW5kZXIgd29ya2JlbmNoIGZvciBkaXNjb3ZlcmFiaWxpdHkuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIEFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQge1xuXHREaW1VbmZvY3VzZWRFbmFibGVkID0gJ2FjY2Vzc2liaWxpdHkuZGltVW5mb2N1c2VkLmVuYWJsZWQnLFxuXHREaW1VbmZvY3VzZWRPcGFjaXR5ID0gJ2FjY2Vzc2liaWxpdHkuZGltVW5mb2N1c2VkLm9wYWNpdHknLFxuXHRIaWRlQWNjZXNzaWJsZVZpZXcgPSAnYWNjZXNzaWJpbGl0eS5oaWRlQWNjZXNzaWJsZVZpZXcnLFxuXHRBY2Nlc3NpYmxlVmlld0Nsb3NlT25LZXlQcmVzcyA9ICdhY2Nlc3NpYmlsaXR5LmFjY2Vzc2libGVWaWV3LmNsb3NlT25LZXlQcmVzcycsXG5cdFZlcmJvc2VDaGF0UHJvZ3Jlc3NVcGRhdGVzID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zZUNoYXRQcm9ncmVzc1VwZGF0ZXMnLFxuXHRTaG93Q2hhdENoZWNrbWFya3MgPSAnYWNjZXNzaWJpbGl0eS5jaGF0LnNob3dDaGVja21hcmtzJ1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBWaWV3RGltVW5mb2N1c2VkT3BhY2l0eVByb3BlcnRpZXMge1xuXHREZWZhdWx0ID0gMC43NSxcblx0TWluaW11bSA9IDAuMixcblx0TWF4aW11bSA9IDFcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB7XG5cdFRlcm1pbmFsID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LnRlcm1pbmFsJyxcblx0RGlmZkVkaXRvciA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5kaWZmRWRpdG9yJyxcblx0TWVyZ2VFZGl0b3IgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkubWVyZ2VFZGl0b3InLFxuXHRDaGF0ID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LnBhbmVsQ2hhdCcsXG5cdElubGluZUNoYXQgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkuaW5saW5lQ2hhdCcsXG5cdFRlcm1pbmFsSW5saW5lQ2hhdCA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS50ZXJtaW5hbENoYXQnLFxuXHRUZXJtaW5hbENoYXRPdXRwdXQgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkudGVybWluYWxDaGF0T3V0cHV0Jyxcblx0SW5saW5lQ29tcGxldGlvbnMgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkuaW5saW5lQ29tcGxldGlvbnMnLFxuXHRLZXliaW5kaW5nc0VkaXRvciA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5rZXliaW5kaW5nc0VkaXRvcicsXG5cdE5vdGVib29rID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5Lm5vdGVib29rJyxcblx0RWRpdG9yID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmVkaXRvcicsXG5cdEhvdmVyID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmhvdmVyJyxcblx0Tm90aWZpY2F0aW9uID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5Lm5vdGlmaWNhdGlvbicsXG5cdEVtcHR5RWRpdG9ySGludCA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5lbXB0eUVkaXRvckhpbnQnLFxuXHRSZXBsRWRpdG9yID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LnJlcGxFZGl0b3InLFxuXHRDb21tZW50cyA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5jb21tZW50cycsXG5cdERpZmZFZGl0b3JBY3RpdmUgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkuZGlmZkVkaXRvckFjdGl2ZScsXG5cdERlYnVnID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmRlYnVnJyxcblx0V2Fsa3Rocm91Z2ggPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkud2Fsa3Rocm91Z2gnLFxuXHRTb3VyY2VDb250cm9sID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LnNvdXJjZUNvbnRyb2wnLFxuXHRGaW5kID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmZpbmQnLFxuXHRTZXNzaW9uc0NoYXQgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkuc2Vzc2lvbnNDaGF0Jyxcblx0U2Vzc2lvbnNDaGFuZ2VzID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LnNlc3Npb25zQ2hhbmdlcycsXG5cdENoYXRRdWVzdGlvbkNhcm91c2VsID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmNoYXRRdWVzdGlvbkNhcm91c2VsJyxcblx0U3VydmV5ID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LnN1cnZleScsXG5cdEF1dG9tYXRpb25zID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmF1dG9tYXRpb25zJyxcblx0QnJvd3NlckVsZW1lbnRDb21tZW50aW5nID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmJyb3dzZXJFbGVtZW50Q29tbWVudGluZydcbn1cblxuY29uc3QgYmFzZVZlcmJvc2l0eVByb3BlcnR5OiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHR0eXBlOiAnYm9vbGVhbicsXG5cdGRlZmF1bHQ6IHRydWUsXG5cdHRhZ3M6IFsnYWNjZXNzaWJpbGl0eSddXG59O1xuXG5leHBvcnQgY29uc3QgYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb25Ob2RlQmFzZSA9IE9iamVjdC5mcmVlemU8SUNvbmZpZ3VyYXRpb25Ob2RlPih7XG5cdGlkOiAnYWNjZXNzaWJpbGl0eScsXG5cdHRpdGxlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb25UaXRsZScsIFwiQWNjZXNzaWJpbGl0eVwiKSxcblx0dHlwZTogJ29iamVjdCdcbn0pO1xuXG5leHBvcnQgY29uc3Qgc291bmRGZWF0dXJlQmFzZTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0J3R5cGUnOiAnc3RyaW5nJyxcblx0J2VudW0nOiBbJ2F1dG8nLCAnb24nLCAnb2ZmJ10sXG5cdCdkZWZhdWx0JzogJ2F1dG8nLFxuXHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRsb2NhbGl6ZSgnc291bmQuZW5hYmxlZC5hdXRvJywgXCJFbmFibGUgc291bmQgd2hlbiBhIHNjcmVlbiByZWFkZXIgaXMgYXR0YWNoZWQuXCIpLFxuXHRcdGxvY2FsaXplKCdzb3VuZC5lbmFibGVkLm9uJywgXCJFbmFibGUgc291bmQuXCIpLFxuXHRcdGxvY2FsaXplKCdzb3VuZC5lbmFibGVkLm9mZicsIFwiRGlzYWJsZSBzb3VuZC5cIilcblx0XSxcblx0dGFnczogWydhY2Nlc3NpYmlsaXR5J10sXG59O1xuXG5jb25zdCBzaWduYWxGZWF0dXJlQmFzZTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0J3RhZ3MnOiBbJ2FjY2Vzc2liaWxpdHknXSxcblx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRkZWZhdWx0OiB7XG5cdFx0c291bmQ6ICdhdXRvJyxcblx0XHRhbm5vdW5jZW1lbnQ6ICdhdXRvJ1xuXHR9XG59O1xuXG5leHBvcnQgY29uc3QgYW5ub3VuY2VtZW50RmVhdHVyZUJhc2U6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgPSB7XG5cdCd0eXBlJzogJ3N0cmluZycsXG5cdCdlbnVtJzogWydhdXRvJywgJ29mZiddLFxuXHQnZGVmYXVsdCc6ICdhdXRvJyxcblx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0bG9jYWxpemUoJ2Fubm91bmNlbWVudC5lbmFibGVkLmF1dG8nLCBcIkVuYWJsZSBhbm5vdW5jZW1lbnQsIHdpbGwgb25seSBwbGF5IHdoZW4gaW4gc2NyZWVuIHJlYWRlciBvcHRpbWl6ZWQgbW9kZS5cIiksXG5cdFx0bG9jYWxpemUoJ2Fubm91bmNlbWVudC5lbmFibGVkLm9mZicsIFwiRGlzYWJsZSBhbm5vdW5jZW1lbnQuXCIpXG5cdF0sXG5cdHRhZ3M6IFsnYWNjZXNzaWJpbGl0eSddLFxufTtcblxuY29uc3QgZGVmYXVsdE5vQW5ub3VuY2VtZW50OiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHQndHlwZSc6ICdvYmplY3QnLFxuXHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdCdkZWZhdWx0Jzoge1xuXHRcdCdzb3VuZCc6ICdhdXRvJyxcblx0fVxufTtcblxuY29uc3QgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHQuLi5hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbk5vZGVCYXNlLFxuXHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuVGVybWluYWxdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS50ZXJtaW5hbC5kZXNjcmlwdGlvbicsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBhY2Nlc3MgdGhlIHRlcm1pbmFsIGFjY2Vzc2liaWxpdHkgaGVscCBtZW51IHdoZW4gdGhlIHRlcm1pbmFsIGlzIGZvY3VzZWQuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkRpZmZFZGl0b3JdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5kaWZmRWRpdG9yLmRlc2NyaXB0aW9uJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIG5hdmlnYXRlIGNoYW5nZXMgaW4gdGhlIGRpZmYgZWRpdG9yIHdoZW4gaXQgaXMgZm9jdXNlZC4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuQ2hhdF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LmNoYXQuZGVzY3JpcHRpb24nLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gYWNjZXNzIHRoZSBjaGF0IGhlbHAgbWVudSB3aGVuIHRoZSBjaGF0IGlucHV0IGlzIGZvY3VzZWQuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLklubGluZUNoYXRdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5pbnRlcmFjdGl2ZUVkaXRvci5kZXNjcmlwdGlvbicsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBhY2Nlc3MgdGhlIGlubGluZSBlZGl0b3IgY2hhdCBhY2Nlc3NpYmlsaXR5IGhlbHAgbWVudSBhbmQgYWxlcnQgd2l0aCBoaW50cyB0aGF0IGRlc2NyaWJlIGhvdyB0byB1c2UgdGhlIGZlYXR1cmUgd2hlbiB0aGUgaW5wdXQgaXMgZm9jdXNlZC4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuVGVybWluYWxDaGF0T3V0cHV0XToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkudGVybWluYWxDaGF0T3V0cHV0LmRlc2NyaXB0aW9uJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIG9wZW4gdGhlIGNoYXQgdGVybWluYWwgb3V0cHV0IGluIHRoZSBBY2Nlc3NpYmxlIFZpZXcuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLklubGluZUNvbXBsZXRpb25zXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuaW5saW5lQ29tcGxldGlvbnMuZGVzY3JpcHRpb24nLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gYWNjZXNzIHRoZSBpbmxpbmUgY29tcGxldGlvbnMgaG92ZXIgYW5kIEFjY2Vzc2libGUgVmlldy4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuS2V5YmluZGluZ3NFZGl0b3JdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5rZXliaW5kaW5nc0VkaXRvci5kZXNjcmlwdGlvbicsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBjaGFuZ2UgYSBrZXliaW5kaW5nIGluIHRoZSBrZXliaW5kaW5ncyBlZGl0b3Igd2hlbiBhIHJvdyBpcyBmb2N1c2VkIGFuZCBob3cgdG8gbmF2aWdhdGUgdG8gdGhlIHJlc3VsdHMgdGFibGUuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLk5vdGVib29rXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkubm90ZWJvb2snLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gZm9jdXMgdGhlIGNlbGwgY29udGFpbmVyIG9yIGlubmVyIGVkaXRvciB3aGVuIGEgbm90ZWJvb2sgY2VsbCBpcyBmb2N1c2VkLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5Ib3Zlcl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LmhvdmVyJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIG9wZW4gdGhlIGhvdmVyIGluIGFuIEFjY2Vzc2libGUgVmlldy4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuTm90aWZpY2F0aW9uXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkubm90aWZpY2F0aW9uJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIG9wZW4gdGhlIG5vdGlmaWNhdGlvbiBpbiBhbiBBY2Nlc3NpYmxlIFZpZXcuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkVtcHR5RWRpdG9ySGludF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LmVtcHR5RWRpdG9ySGludCcsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IHJlbGV2YW50IGFjdGlvbnMgaW4gYW4gZW1wdHkgdGV4dCBlZGl0b3IuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlJlcGxFZGl0b3JdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5yZXBsRWRpdG9yLmRlc2NyaXB0aW9uJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIGFjY2VzcyB0aGUgUkVQTCBlZGl0b3IgYWNjZXNzaWJpbGl0eSBoZWxwIG1lbnUgd2hlbiB0aGUgUkVQTCBlZGl0b3IgaXMgZm9jdXNlZC4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuQ29tbWVudHNdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5jb21tZW50cycsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGFjdGlvbnMgdGhhdCBjYW4gYmUgdGFrZW4gaW4gdGhlIGNvbW1lbnQgd2lkZ2V0IG9yIGluIGEgZmlsZSB3aGljaCBjb250YWlucyBjb21tZW50cy4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuRGlmZkVkaXRvckFjdGl2ZV06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LmRpZmZFZGl0b3JBY3RpdmUnLCAnSW5kaWNhdGUgd2hlbiBhIGRpZmYgZWRpdG9yIGJlY29tZXMgdGhlIGFjdGl2ZSBlZGl0b3IuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkRlYnVnXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuZGVidWcnLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gYWNjZXNzIHRoZSBkZWJ1ZyBjb25zb2xlIGFjY2Vzc2liaWxpdHkgaGVscCBkaWFsb2cgd2hlbiB0aGUgZGVidWcgY29uc29sZSBvciBydW4gYW5kIGRlYnVnIHZpZXdsZXQgaXMgZm9jdXNlZC4gTm90ZSB0aGF0IGEgcmVsb2FkIG9mIHRoZSB3aW5kb3cgaXMgcmVxdWlyZWQgZm9yIHRoaXMgdG8gdGFrZSBlZmZlY3QuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLldhbGt0aHJvdWdoXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkud2Fsa3Rocm91Z2gnLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gb3BlbiB0aGUgd2Fsa3Rocm91Z2ggaW4gYW4gQWNjZXNzaWJsZSBWaWV3LicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5BY2Nlc3NpYmxlVmlld0Nsb3NlT25LZXlQcmVzc106IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmFjY2Vzc2libGVWaWV3LmNsb3NlT25LZXlQcmVzcycsIFwiT24ga2V5cHJlc3MsIGNsb3NlIHRoZSBBY2Nlc3NpYmxlIFZpZXcgYW5kIGZvY3VzIHRoZSBlbGVtZW50IGZyb20gd2hpY2ggaXQgd2FzIGludm9rZWQuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuU291cmNlQ29udHJvbF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LnNjbScsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBhY2Nlc3MgdGhlIHNvdXJjZSBjb250cm9sIGFjY2Vzc2liaWxpdHkgaGVscCBtZW51IHdoZW4gdGhlIGlucHV0IGlzIGZvY3VzZWQuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkZpbmRdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5maW5kJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIGFjY2VzcyB0aGUgZmluZCBhY2Nlc3NpYmlsaXR5IGhlbHAgbWVudSB3aGVuIHRoZSBmaW5kIGlucHV0IGlzIGZvY3VzZWQuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlNlc3Npb25zQ2hhdF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LnNlc3Npb25zQ2hhdCcsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBhY2Nlc3MgdGhlIEFnZW50cyB3aW5kb3cgYWNjZXNzaWJpbGl0eSBoZWxwIG1lbnUgd2hlbiB0aGUgY2hhdCBpbnB1dCBpcyBmb2N1c2VkLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5TZXNzaW9uc0NoYW5nZXNdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5zZXNzaW9uc0NoYW5nZXMnLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gYWNjZXNzIHRoZSBDaGFuZ2VzIHZpZXcgYWNjZXNzaWJpbGl0eSBoZWxwIG1lbnUgd2hlbiB0aGUgQ2hhbmdlcyB2aWV3IGlzIGZvY3VzZWQuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkNoYXRRdWVzdGlvbkNhcm91c2VsXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuY2hhdFF1ZXN0aW9uQ2Fyb3VzZWwnLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gbmF2aWdhdGUgYW5kIGludGVyYWN0IHdpdGggdGhlIGNoYXQgcXVlc3Rpb24gY2Fyb3VzZWwsIGluY2x1ZGluZyBob3cgdG8gZm9jdXMgdGhlIHRlcm1pbmFsIHdoZW4gYXBwbGljYWJsZS4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuU3VydmV5XToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuc3VydmV5JywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIG5hdmlnYXRlIGFuZCBpbnRlcmFjdCB3aXRoIHRoZSBzdXJ2ZXkgZWRpdG9yIHBhbmUuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkF1dG9tYXRpb25zXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuYXV0b21hdGlvbnMnLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gdXNlIEF1dG9tYXRpb25zIG1hbmFnZW1lbnQgdmlld3MsIGluY2x1ZGluZyBrZXlib2FyZCBuYXZpZ2F0aW9uIGFuZCBob3cgdG8gaW5zcGVjdCBzY2hlZHVsZWQgcnVucy4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuQnJvd3NlckVsZW1lbnRDb21tZW50aW5nXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuYnJvd3NlckVsZW1lbnRDb21tZW50aW5nJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIGFjY2VzcyBlbGVtZW50IGNvbW1lbnRpbmcgYWNjZXNzaWJpbGl0eSBoZWxwIGluIHRoZSBJbnRlZ3JhdGVkIEJyb3dzZXIuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMudm9sdW1lJzoge1xuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy52b2x1bWUnLCBcIlRoZSB2b2x1bWUgb2YgdGhlIHNvdW5kcyBpbiBwZXJjZW50ICgwLTEwMCkuXCIpLFxuXHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdCdtaW5pbXVtJzogMCxcblx0XHRcdCdtYXhpbXVtJzogMTAwLFxuXHRcdFx0J2RlZmF1bHQnOiA3MCxcblx0XHRcdCd0YWdzJzogWydhY2Nlc3NpYmlsaXR5J11cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMnOiB7XG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzJywgXCJXaGV0aGVyIG9yIG5vdCBwb3NpdGlvbiBjaGFuZ2VzIHNob3VsZCBiZSBkZWJvdW5jZWRcIiksXG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmV4cGVyaW1lbnRhbC5kZWxheXMuZ2VuZXJhbCc6IHtcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiAnRGVsYXlzIGZvciBhbGwgc2lnbmFscyBiZXNpZGVzIGVycm9yIGFuZCB3YXJuaW5nIGF0IHBvc2l0aW9uJyxcblx0XHRcdCdhZGRpdGlvbmFsUHJvcGVydGllcyc6IGZhbHNlLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5kZWxheXMuZ2VuZXJhbC5hbm5vdW5jZW1lbnQnLCBcIlRoZSBkZWxheSBpbiBtaWxsaXNlY29uZHMgYmVmb3JlIGFuIGFubm91bmNlbWVudCBpcyBtYWRlLlwiKSxcblx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0XHRcdCdtaW5pbXVtJzogMCxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IDMwMDBcblx0XHRcdFx0fSxcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZGVsYXlzLmdlbmVyYWwuc291bmQnLCBcIlRoZSBkZWxheSBpbiBtaWxsaXNlY29uZHMgYmVmb3JlIGEgc291bmQgaXMgcGxheWVkLlwiKSxcblx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0XHRcdCdtaW5pbXVtJzogMCxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IDQwMFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3RhZ3MnOiBbJ2FjY2Vzc2liaWxpdHknXVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5leHBlcmltZW50YWwuZGVsYXlzLndhcm5pbmdBdFBvc2l0aW9uJzoge1xuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdhZGRpdGlvbmFsUHJvcGVydGllcyc6IGZhbHNlLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5kZWxheXMud2FybmluZ0F0UG9zaXRpb24uYW5ub3VuY2VtZW50JywgXCJUaGUgZGVsYXkgaW4gbWlsbGlzZWNvbmRzIGJlZm9yZSBhbiBhbm5vdW5jZW1lbnQgaXMgbWFkZSB3aGVuIHRoZXJlJ3MgYSB3YXJuaW5nIGF0IHRoZSBwb3NpdGlvbi5cIiksXG5cdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdFx0XHQnbWluaW11bSc6IDAsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAzMDAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmRlbGF5cy53YXJuaW5nQXRQb3NpdGlvbi5zb3VuZCcsIFwiVGhlIGRlbGF5IGluIG1pbGxpc2Vjb25kcyBiZWZvcmUgYSBzb3VuZCBpcyBwbGF5ZWQgd2hlbiB0aGVyZSdzIGEgd2FybmluZyBhdCB0aGUgcG9zaXRpb24uXCIpLFxuXHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcicsXG5cdFx0XHRcdFx0J21pbmltdW0nOiAwLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogMTAwMFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3RhZ3MnOiBbJ2FjY2Vzc2liaWxpdHknXVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5leHBlcmltZW50YWwuZGVsYXlzLmVycm9yQXRQb3NpdGlvbic6IHtcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQnYWRkaXRpb25hbFByb3BlcnRpZXMnOiBmYWxzZSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZGVsYXlzLmVycm9yQXRQb3NpdGlvbi5hbm5vdW5jZW1lbnQnLCBcIlRoZSBkZWxheSBpbiBtaWxsaXNlY29uZHMgYmVmb3JlIGFuIGFubm91bmNlbWVudCBpcyBtYWRlIHdoZW4gdGhlcmUncyBhbiBlcnJvciBhdCB0aGUgcG9zaXRpb24uXCIpLFxuXHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcicsXG5cdFx0XHRcdFx0J21pbmltdW0nOiAwLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogMzAwMFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5kZWxheXMuZXJyb3JBdFBvc2l0aW9uLnNvdW5kJywgXCJUaGUgZGVsYXkgaW4gbWlsbGlzZWNvbmRzIGJlZm9yZSBhIHNvdW5kIGlzIHBsYXllZCB3aGVuIHRoZXJlJ3MgYW4gZXJyb3IgYXQgdGhlIHBvc2l0aW9uLlwiKSxcblx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0XHRcdCdtaW5pbXVtJzogMCxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IDEwMDBcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCd0YWdzJzogWydhY2Nlc3NpYmlsaXR5J11cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0JyZWFrcG9pbnQnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0JyZWFrcG9pbnQnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGEgYnJlYWtwb2ludC5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0JyZWFrcG9pbnQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGEgYnJlYWtwb2ludC5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0JyZWFrcG9pbnQuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGEgYnJlYWtwb2ludC5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNJbmxpbmVTdWdnZXN0aW9uJzoge1xuXHRcdFx0Li4uZGVmYXVsdE5vQW5ub3VuY2VtZW50LFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzSW5saW5lU3VnZ2VzdGlvbicsIFwiUGxheXMgYSBzb3VuZCAvIGF1ZGlvIGN1ZSB3aGVuIHRoZSBhY3RpdmUgbGluZSBoYXMgYW4gaW5saW5lIHN1Z2dlc3Rpb24uXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNJbmxpbmVTdWdnZXN0aW9uLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhbiBpbmxpbmUgc3VnZ2VzdGlvbi5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZSxcblx0XHRcdFx0XHQnZGVmYXVsdCc6ICdvZmYnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubmV4dEVkaXRTdWdnZXN0aW9uJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5leHRFZGl0U3VnZ2VzdGlvbicsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAvIGF1ZGlvIGN1ZSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgd2hlbiB0aGVyZSBpcyBhIG5leHQgZWRpdCBzdWdnZXN0aW9uLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5uZXh0RWRpdFN1Z2dlc3Rpb24uc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGVyZSBpcyBhIG5leHQgZWRpdCBzdWdnZXN0aW9uLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubmV4dEVkaXRTdWdnZXN0aW9uLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gdGhlcmUgaXMgYSBuZXh0IGVkaXQgc3VnZ2VzdGlvbi5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNFcnJvcic6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzRXJyb3InLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGFuIGVycm9yLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzRXJyb3Iuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGFuIGVycm9yLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzRXJyb3IuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGFuIGVycm9yLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnb2ZmJ1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0ZvbGRlZEFyZWEnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0ZvbGRlZEFyZWEnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIGZvbGRlZCBhcmVhIHRoYXQgY2FuIGJlIHVuZm9sZGVkLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzRm9sZGVkQXJlYS5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHRoZSBhY3RpdmUgbGluZSBoYXMgYSBmb2xkZWQgYXJlYSB0aGF0IGNhbiBiZSB1bmZvbGRlZC5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnb2ZmJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0ZvbGRlZEFyZWEuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGEgZm9sZGVkIGFyZWEgdGhhdCBjYW4gYmUgdW5mb2xkZWQuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNXYXJuaW5nJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNXYXJuaW5nJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIHdhcm5pbmcuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNXYXJuaW5nLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIHdhcm5pbmcuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNXYXJuaW5nLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIHdhcm5pbmcuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICdvZmYnXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wb3NpdGlvbkhhc0Vycm9yJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnBvc2l0aW9uSGFzRXJyb3InLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGEgd2FybmluZy5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucG9zaXRpb25IYXNFcnJvci5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHRoZSBhY3RpdmUgbGluZSBoYXMgYSB3YXJuaW5nLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wb3NpdGlvbkhhc0Vycm9yLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIHdhcm5pbmcuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICdvbidcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnBvc2l0aW9uSGFzV2FybmluZyc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wb3NpdGlvbkhhc1dhcm5pbmcnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGEgd2FybmluZy5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucG9zaXRpb25IYXNXYXJuaW5nLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIHdhcm5pbmcuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnBvc2l0aW9uSGFzV2FybmluZy5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIHRoZSBhY3RpdmUgbGluZSBoYXMgYSB3YXJuaW5nLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnb24nXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5vbkRlYnVnQnJlYWsnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMub25EZWJ1Z0JyZWFrJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gdGhlIGRlYnVnZ2VyIHN0b3BwZWQgb24gYSBicmVha3BvaW50LlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5vbkRlYnVnQnJlYWsuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgZGVidWdnZXIgc3RvcHBlZCBvbiBhIGJyZWFrcG9pbnQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm9uRGVidWdCcmVhay5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIHRoZSBkZWJ1Z2dlciBzdG9wcGVkIG9uIGEgYnJlYWtwb2ludC5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm9JbmxheUhpbnRzJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vSW5sYXlIaW50cycsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIHRyeWluZyB0byByZWFkIGEgbGluZSB3aXRoIGlubGF5IGhpbnRzIHRoYXQgaGFzIG5vIGlubGF5IGhpbnRzLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5ub0lubGF5SGludHMuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0cnlpbmcgdG8gcmVhZCBhIGxpbmUgd2l0aCBpbmxheSBoaW50cyB0aGF0IGhhcyBubyBpbmxheSBoaW50cy5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm9JbmxheUhpbnRzLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gdHJ5aW5nIHRvIHJlYWQgYSBsaW5lIHdpdGggaW5sYXkgaGludHMgdGhhdCBoYXMgbm8gaW5sYXkgaGludHMuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRhc2tDb21wbGV0ZWQnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGFza0NvbXBsZXRlZCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIGEgdGFzayBpcyBjb21wbGV0ZWQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRhc2tDb21wbGV0ZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiBhIHRhc2sgaXMgY29tcGxldGVkLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50YXNrQ29tcGxldGVkLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gYSB0YXNrIGlzIGNvbXBsZXRlZC5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGFza0ZhaWxlZCc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50YXNrRmFpbGVkJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gYSB0YXNrIGZhaWxzIChub24temVybyBleGl0IGNvZGUpLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50YXNrRmFpbGVkLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gYSB0YXNrIGZhaWxzIChub24temVybyBleGl0IGNvZGUpLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50YXNrRmFpbGVkLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gYSB0YXNrIGZhaWxzIChub24temVybyBleGl0IGNvZGUpLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbENvbW1hbmRGYWlsZWQnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxDb21tYW5kRmFpbGVkJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gYSB0ZXJtaW5hbCBjb21tYW5kIGZhaWxzIChub24temVybyBleGl0IGNvZGUpIG9yIHdoZW4gYSBjb21tYW5kIHdpdGggc3VjaCBhbiBleGl0IGNvZGUgaXMgbmF2aWdhdGVkIHRvIGluIHRoZSBhY2Nlc3NpYmxlIHZpZXcuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQ29tbWFuZEZhaWxlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIGEgdGVybWluYWwgY29tbWFuZCBmYWlscyAobm9uLXplcm8gZXhpdCBjb2RlKSBvciB3aGVuIGEgY29tbWFuZCB3aXRoIHN1Y2ggYW4gZXhpdCBjb2RlIGlzIG5hdmlnYXRlZCB0byBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3LlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbENvbW1hbmRGYWlsZWQuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiBhIHRlcm1pbmFsIGNvbW1hbmQgZmFpbHMgKG5vbi16ZXJvIGV4aXQgY29kZSkgb3Igd2hlbiBhIGNvbW1hbmQgd2l0aCBzdWNoIGFuIGV4aXQgY29kZSBpcyBuYXZpZ2F0ZWQgdG8gaW4gdGhlIGFjY2Vzc2libGUgdmlldy5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxDb21tYW5kU3VjY2VlZGVkJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQ29tbWFuZFN1Y2NlZWRlZCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIGEgdGVybWluYWwgY29tbWFuZCBzdWNjZWVkcyAoemVybyBleGl0IGNvZGUpIG9yIHdoZW4gYSBjb21tYW5kIHdpdGggc3VjaCBhbiBleGl0IGNvZGUgaXMgbmF2aWdhdGVkIHRvIGluIHRoZSBhY2Nlc3NpYmxlIHZpZXcuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQ29tbWFuZFN1Y2NlZWRlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIGEgdGVybWluYWwgY29tbWFuZCBzdWNjZWVkcyAoemVybyBleGl0IGNvZGUpIG9yIHdoZW4gYSBjb21tYW5kIHdpdGggc3VjaCBhbiBleGl0IGNvZGUgaXMgbmF2aWdhdGVkIHRvIGluIHRoZSBhY2Nlc3NpYmxlIHZpZXcuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQ29tbWFuZFN1Y2NlZWRlZC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIGEgdGVybWluYWwgY29tbWFuZCBzdWNjZWVkcyAoemVybyBleGl0IGNvZGUpIG9yIHdoZW4gYSBjb21tYW5kIHdpdGggc3VjaCBhbiBleGl0IGNvZGUgaXMgbmF2aWdhdGVkIHRvIGluIHRoZSBhY2Nlc3NpYmxlIHZpZXcuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsUXVpY2tGaXgnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxRdWlja0ZpeCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIHRlcm1pbmFsIFF1aWNrIEZpeGVzIGFyZSBhdmFpbGFibGUuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsUXVpY2tGaXguc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0ZXJtaW5hbCBRdWljayBGaXhlcyBhcmUgYXZhaWxhYmxlLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbFF1aWNrRml4LmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gdGVybWluYWwgUXVpY2sgRml4ZXMgYXJlIGF2YWlsYWJsZS5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxCZWxsJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQmVsbCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIHRoZSB0ZXJtaW5hbCBiZWxsIGlzIHJpbmdpbmcuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQmVsbC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHRoZSB0ZXJtaW5hbCBiZWxsIGlzIHJpbmdpbmcuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQmVsbC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIHRoZSB0ZXJtaW5hbCBiZWxsIGlzIHJpbmdpbmcuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmRpZmZMaW5lSW5zZXJ0ZWQnOiB7XG5cdFx0XHQuLi5kZWZhdWx0Tm9Bbm5vdW5jZW1lbnQsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmRpZmZMaW5lSW5zZXJ0ZWQnLCBcIlBsYXlzIGEgc291bmQgLyBhdWRpbyBjdWUgd2hlbiB0aGUgZm9jdXMgbW92ZXMgdG8gYW4gaW5zZXJ0ZWQgbGluZSBpbiBBY2Nlc3NpYmxlIERpZmYgVmlld2VyIG1vZGUgb3IgdG8gdGhlIG5leHQvcHJldmlvdXMgY2hhbmdlLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHRoZSBmb2N1cyBtb3ZlcyB0byBhbiBpbnNlcnRlZCBsaW5lIGluIEFjY2Vzc2libGUgRGlmZiBWaWV3ZXIgbW9kZSBvciB0byB0aGUgbmV4dC9wcmV2aW91cyBjaGFuZ2UuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5kaWZmTGluZU1vZGlmaWVkJzoge1xuXHRcdFx0Li4uZGVmYXVsdE5vQW5ub3VuY2VtZW50LFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5kaWZmTGluZU1vZGlmaWVkJywgXCJQbGF5cyBhIHNvdW5kIC8gYXVkaW8gY3VlIHdoZW4gdGhlIGZvY3VzIG1vdmVzIHRvIGFuIG1vZGlmaWVkIGxpbmUgaW4gQWNjZXNzaWJsZSBEaWZmIFZpZXdlciBtb2RlIG9yIHRvIHRoZSBuZXh0L3ByZXZpb3VzIGNoYW5nZS5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZGlmZkxpbmVNb2RpZmllZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHRoZSBmb2N1cyBtb3ZlcyB0byBhIG1vZGlmaWVkIGxpbmUgaW4gQWNjZXNzaWJsZSBEaWZmIFZpZXdlciBtb2RlIG9yIHRvIHRoZSBuZXh0L3ByZXZpb3VzIGNoYW5nZS5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmRpZmZMaW5lRGVsZXRlZCc6IHtcblx0XHRcdC4uLmRlZmF1bHROb0Fubm91bmNlbWVudCxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZGlmZkxpbmVEZWxldGVkJywgXCJQbGF5cyBhIHNvdW5kIC8gYXVkaW8gY3VlIHdoZW4gdGhlIGZvY3VzIG1vdmVzIHRvIGFuIGRlbGV0ZWQgbGluZSBpbiBBY2Nlc3NpYmxlIERpZmYgVmlld2VyIG1vZGUgb3IgdG8gdGhlIG5leHQvcHJldmlvdXMgY2hhbmdlLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5kaWZmTGluZURlbGV0ZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgZm9jdXMgbW92ZXMgdG8gYW4gZGVsZXRlZCBsaW5lIGluIEFjY2Vzc2libGUgRGlmZiBWaWV3ZXIgbW9kZSBvciB0byB0aGUgbmV4dC9wcmV2aW91cyBjaGFuZ2UuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0RWRpdE1vZGlmaWVkRmlsZSc6IHtcblx0XHRcdC4uLmRlZmF1bHROb0Fubm91bmNlbWVudCxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdEVkaXRNb2RpZmllZEZpbGUnLCBcIlBsYXlzIGEgc291bmQgLyBhdWRpbyBjdWUgd2hlbiByZXZlYWxpbmcgYSBmaWxlIHdpdGggY2hhbmdlcyBmcm9tIGNoYXQgZWRpdHNcIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdEVkaXRNb2RpZmllZEZpbGUuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiByZXZlYWxpbmcgYSBmaWxlIHdpdGggY2hhbmdlcyBmcm9tIGNoYXQgZWRpdHNcIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vdGVib29rQ2VsbENvbXBsZXRlZCc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5ub3RlYm9va0NlbGxDb21wbGV0ZWQnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiBhIG5vdGVib29rIGNlbGwgZXhlY3V0aW9uIGlzIHN1Y2Nlc3NmdWxseSBjb21wbGV0ZWQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vdGVib29rQ2VsbENvbXBsZXRlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIGEgbm90ZWJvb2sgY2VsbCBleGVjdXRpb24gaXMgc3VjY2Vzc2Z1bGx5IGNvbXBsZXRlZC5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm90ZWJvb2tDZWxsQ29tcGxldGVkLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gYSBub3RlYm9vayBjZWxsIGV4ZWN1dGlvbiBpcyBzdWNjZXNzZnVsbHkgY29tcGxldGVkLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5ub3RlYm9va0NlbGxGYWlsZWQnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm90ZWJvb2tDZWxsRmFpbGVkJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gYSBub3RlYm9vayBjZWxsIGV4ZWN1dGlvbiBmYWlscy5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm90ZWJvb2tDZWxsRmFpbGVkLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gYSBub3RlYm9vayBjZWxsIGV4ZWN1dGlvbiBmYWlscy5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm90ZWJvb2tDZWxsRmFpbGVkLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gYSBub3RlYm9vayBjZWxsIGV4ZWN1dGlvbiBmYWlscy5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucHJvZ3Jlc3MnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucHJvZ3Jlc3MnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gb24gbG9vcCB3aGlsZSBwcm9ncmVzcyBpcyBvY2N1cnJpbmcuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB7XG5cdFx0XHRcdCdzb3VuZCc6ICdhdXRvJyxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6ICdvZmYnXG5cdFx0XHR9LFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnByb2dyZXNzLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIG9uIGxvb3Agd2hpbGUgcHJvZ3Jlc3MgaXMgb2NjdXJyaW5nLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wcm9ncmVzcy5hbm5vdW5jZW1lbnQnLCBcIkFsZXJ0cyBvbiBsb29wIHdoaWxlIHByb2dyZXNzIGlzIG9jY3VycmluZy5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRSZXF1ZXN0U2VudCc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVxdWVzdFNlbnQnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiBhIGNoYXQgcmVxdWVzdCBpcyBtYWRlLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVxdWVzdFNlbnQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiBhIGNoYXQgcmVxdWVzdCBpcyBtYWRlLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVxdWVzdFNlbnQuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiBhIGNoYXQgcmVxdWVzdCBpcyBtYWRlLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVzcG9uc2VSZWNlaXZlZCc6IHtcblx0XHRcdC4uLmRlZmF1bHROb0Fubm91bmNlbWVudCxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFJlc3BvbnNlUmVjZWl2ZWQnLCBcIlBsYXlzIGEgc291bmQgLyBhdWRpbyBjdWUgd2hlbiB0aGUgcmVzcG9uc2UgaGFzIGJlZW4gcmVjZWl2ZWQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRSZXNwb25zZVJlY2VpdmVkLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIG9uIHdoZW4gdGhlIHJlc3BvbnNlIGhhcyBiZWVuIHJlY2VpdmVkLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNvZGVBY3Rpb25UcmlnZ2VyZWQnOiB7XG5cdFx0XHQuLi5kZWZhdWx0Tm9Bbm5vdW5jZW1lbnQsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNvZGVBY3Rpb25UcmlnZ2VyZWQnLCBcIlBsYXlzIGEgc291bmQgLyBhdWRpbyBjdWUgLSB3aGVuIGEgY29kZSBhY3Rpb24gaGFzIGJlZW4gdHJpZ2dlcmVkLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jb2RlQWN0aW9uVHJpZ2dlcmVkLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gYSBjb2RlIGFjdGlvbiBoYXMgYmVlbiB0cmlnZ2VyZWQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jb2RlQWN0aW9uQXBwbGllZCc6IHtcblx0XHRcdC4uLmRlZmF1bHROb0Fubm91bmNlbWVudCxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY29kZUFjdGlvbkFwcGxpZWQnLCBcIlBsYXlzIGEgc291bmQgLyBhdWRpbyBjdWUgd2hlbiB0aGUgY29kZSBhY3Rpb24gaGFzIGJlZW4gYXBwbGllZC5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY29kZUFjdGlvbkFwcGxpZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgY29kZSBhY3Rpb24gaGFzIGJlZW4gYXBwbGllZC5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZVJlY29yZGluZ1N0YXJ0ZWQnOiB7XG5cdFx0XHQuLi5kZWZhdWx0Tm9Bbm5vdW5jZW1lbnQsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlUmVjb3JkaW5nU3RhcnRlZCcsIFwiUGxheXMgYSBzb3VuZCAvIGF1ZGlvIGN1ZSB3aGVuIHRoZSB2b2ljZSByZWNvcmRpbmcgaGFzIHN0YXJ0ZWQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlUmVjb3JkaW5nU3RhcnRlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHRoZSB2b2ljZSByZWNvcmRpbmcgaGFzIHN0YXJ0ZWQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0J2RlZmF1bHQnOiB7XG5cdFx0XHRcdCdzb3VuZCc6ICdvbidcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RhcnRlZCc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZU1vZGVTdGFydGVkJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gdm9pY2UgbW9kZSBoYXMgc3RhcnRlZC5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RhcnRlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHZvaWNlIG1vZGUgaGFzIHN0YXJ0ZWQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZU1vZGVTdGFydGVkLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gdm9pY2UgbW9kZSBoYXMgc3RhcnRlZC5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2UsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnZGVmYXVsdCc6IHtcblx0XHRcdFx0J3NvdW5kJzogJ29uJyxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6ICdhdXRvJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZVJlY29yZGluZ1N0b3BwZWQnOiB7XG5cdFx0XHQuLi5kZWZhdWx0Tm9Bbm5vdW5jZW1lbnQsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlUmVjb3JkaW5nU3RvcHBlZCcsIFwiUGxheXMgYSBzb3VuZCAvIGF1ZGlvIGN1ZSB3aGVuIHRoZSB2b2ljZSByZWNvcmRpbmcgaGFzIHN0b3BwZWQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlUmVjb3JkaW5nU3RvcHBlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHRoZSB2b2ljZSByZWNvcmRpbmcgaGFzIHN0b3BwZWQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0J2RlZmF1bHQnOiB7XG5cdFx0XHRcdCdzb3VuZCc6ICdvbidcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RvcHBlZCc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZU1vZGVTdG9wcGVkJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gdm9pY2UgbW9kZSBoYXMgc3RvcHBlZC5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RvcHBlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHZvaWNlIG1vZGUgaGFzIHN0b3BwZWQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZU1vZGVTdG9wcGVkLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gdm9pY2UgbW9kZSBoYXMgc3RvcHBlZC5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2UsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnZGVmYXVsdCc6IHtcblx0XHRcdFx0J3NvdW5kJzogJ29uJyxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6ICdhdXRvJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jbGVhcic6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jbGVhcicsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIGEgZmVhdHVyZSBpcyBjbGVhcmVkIChmb3IgZXhhbXBsZSwgdGhlIHRlcm1pbmFsLCBEZWJ1ZyBDb25zb2xlLCBvciBPdXRwdXQgY2hhbm5lbCkuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNsZWFyLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gYSBmZWF0dXJlIGlzIGNsZWFyZWQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNsZWFyLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gYSBmZWF0dXJlIGlzIGNsZWFyZWQuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5lZGl0c1VuZG9uZSc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5lZGl0c1VuZG9uZScsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIGVkaXRzIGhhdmUgYmVlbiB1bmRvbmUuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmVkaXRzVW5kb25lLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gZWRpdHMgaGF2ZSBiZWVuIHVuZG9uZS5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZWRpdHNVbmRvbmUuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiBlZGl0cyBoYXZlIGJlZW4gdW5kb25lLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZWRpdHNLZXB0Jzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmVkaXRzS2VwdCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIGVkaXRzIGFyZSBrZXB0LlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5lZGl0c0tlcHQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiBlZGl0cyBhcmUga2VwdC5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZWRpdHNLZXB0LmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gZWRpdHMgYXJlIGtlcHQuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5zYXZlJzoge1xuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCd0YWdzJzogWydhY2Nlc3NpYmlsaXR5J10sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZScsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIGEgZmlsZSBpcyBzYXZlZC5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZS5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIGEgZmlsZSBpcyBzYXZlZC5cIiksXG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZW51bSc6IFsndXNlckdlc3R1cmUnLCAnYWx3YXlzJywgJ25ldmVyJ10sXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnbmV2ZXInLFxuXHRcdFx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5zYXZlLnNvdW5kLnVzZXJHZXN0dXJlJywgXCJQbGF5cyB0aGUgc291bmQgd2hlbiBhIHVzZXIgZXhwbGljaXRseSBzYXZlcyBhIGZpbGUuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5zYXZlLnNvdW5kLmFsd2F5cycsIFwiUGxheXMgdGhlIHNvdW5kIHdoZW5ldmVyIGEgZmlsZSBpcyBzYXZlZCwgaW5jbHVkaW5nIGF1dG8gc2F2ZS5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNhdmUuc291bmQubmV2ZXInLCBcIk5ldmVyIHBsYXlzIHRoZSBzb3VuZC5cIilcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZS5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIGEgZmlsZSBpcyBzYXZlZC5cIiksXG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZW51bSc6IFsndXNlckdlc3R1cmUnLCAnYWx3YXlzJywgJ25ldmVyJ10sXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnbmV2ZXInLFxuXHRcdFx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5zYXZlLmFubm91bmNlbWVudC51c2VyR2VzdHVyZScsIFwiQW5ub3VuY2VzIHdoZW4gYSB1c2VyIGV4cGxpY2l0bHkgc2F2ZXMgYSBmaWxlLlwiKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZS5hbm5vdW5jZW1lbnQuYWx3YXlzJywgXCJBbm5vdW5jZXMgd2hlbmV2ZXIgYSBmaWxlIGlzIHNhdmVkLCBpbmNsdWRpbmcgYXV0byBzYXZlLlwiKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZS5hbm5vdW5jZW1lbnQubmV2ZXInLCBcIk5ldmVyIHBsYXlzIHRoZSBhbm5vdW5jZW1lbnQuXCIpXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdCdzb3VuZCc6ICduZXZlcicsXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiAnbmV2ZXInXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmZvcm1hdCc6IHtcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmZvcm1hdCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIGEgZmlsZSBvciBub3RlYm9vayBpcyBmb3JtYXR0ZWQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmZvcm1hdC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIGEgZmlsZSBvciBub3RlYm9vayBpcyBmb3JtYXR0ZWQuXCIpLFxuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2VudW0nOiBbJ3VzZXJHZXN0dXJlJywgJ2Fsd2F5cycsICduZXZlciddLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ25ldmVyJyxcblx0XHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZm9ybWF0LnVzZXJHZXN0dXJlJywgXCJQbGF5cyB0aGUgc291bmQgd2hlbiBhIHVzZXIgZXhwbGljaXRseSBmb3JtYXRzIGEgZmlsZS5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmZvcm1hdC5hbHdheXMnLCBcIlBsYXlzIHRoZSBzb3VuZCB3aGVuZXZlciBhIGZpbGUgaXMgZm9ybWF0dGVkLCBpbmNsdWRpbmcgaWYgaXQgaXMgc2V0IHRvIGZvcm1hdCBvbiBzYXZlLCB0eXBlLCBvciwgcGFzdGUsIG9yIHJ1biBvZiBhIGNlbGwuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5mb3JtYXQubmV2ZXInLCBcIk5ldmVyIHBsYXlzIHRoZSBzb3VuZC5cIilcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZm9ybWF0LmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gYSBmaWxlIG9yIG5vdGVib29rIGlzIGZvcm1hdHRlZC5cIiksXG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZW51bSc6IFsndXNlckdlc3R1cmUnLCAnYWx3YXlzJywgJ25ldmVyJ10sXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnbmV2ZXInLFxuXHRcdFx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5mb3JtYXQuYW5ub3VuY2VtZW50LnVzZXJHZXN0dXJlJywgXCJBbm5vdW5jZXMgd2hlbiBhIHVzZXIgZXhwbGljaXRseSBmb3JtYXRzIGEgZmlsZS5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmZvcm1hdC5hbm5vdW5jZW1lbnQuYWx3YXlzJywgXCJBbm5vdW5jZXMgd2hlbmV2ZXIgYSBmaWxlIGlzIGZvcm1hdHRlZCwgaW5jbHVkaW5nIGlmIGl0IGlzIHNldCB0byBmb3JtYXQgb24gc2F2ZSwgdHlwZSwgb3IsIHBhc3RlLCBvciBydW4gb2YgYSBjZWxsLlwiKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZm9ybWF0LmFubm91bmNlbWVudC5uZXZlcicsIFwiTmV2ZXIgYW5ub3VuY2VzLlwiKVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQnc291bmQnOiAnbmV2ZXInLFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50JzogJ25ldmVyJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0VXNlckFjdGlvblJlcXVpcmVkJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIHVzZXIgYWN0aW9uIGlzIHJlcXVpcmVkIGluIHRoZSBjaGF0LlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0VXNlckFjdGlvblJlcXVpcmVkLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdXNlciBhY3Rpb24gaXMgcmVxdWlyZWQgaW4gdGhlIGNoYXQuXCIpLFxuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2VudW0nOiBbJ2F1dG8nLCAnb24nLCAnb2ZmJ10sXG5cdFx0XHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnc291bmQuZW5hYmxlZC5hdXRvV2luZG93JywgXCJFbmFibGUgc291bmQgd2hlbiBhIHNjcmVlbiByZWFkZXIgaXMgYXR0YWNoZWQuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3NvdW5kLmVuYWJsZWQub24nLCBcIkVuYWJsZSBzb3VuZC5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnc291bmQuZW5hYmxlZC5vZmYnLCBcIkRpc2FibGUgc291bmQuXCIpXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiBhIHVzZXIgYWN0aW9uIGlzIHJlcXVpcmVkIGluIHRoZSBjaGF0IC0gaW5jbHVkaW5nIGluZm9ybWF0aW9uIGFib3V0IHRoZSBhY3Rpb24gYW5kIGhvdyB0byB0YWtlIGl0LlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0J3NvdW5kJzogJ2F1dG8nLFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50JzogJ2F1dG8nXG5cdFx0XHR9LFxuXHRcdFx0dGFnczogWydhY2Nlc3NpYmlsaXR5J11cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnVuZGVybGluZUxpbmtzJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS51bmRlcmxpbmVMaW5rcycsIFwiQ29udHJvbHMgd2hldGhlciBsaW5rcyBzaG91bGQgYmUgdW5kZXJsaW5lZCBpbiB0aGUgd29ya2JlbmNoLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5kZWJ1Z1dhdGNoVmFyaWFibGVBbm5vdW5jZW1lbnRzJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5kZWJ1Z1dhdGNoVmFyaWFibGVBbm5vdW5jZW1lbnRzJywgXCJDb250cm9scyB3aGV0aGVyIHZhcmlhYmxlIGNoYW5nZXMgc2hvdWxkIGJlIGFubm91bmNlZCBpbiB0aGUgZGVidWcgd2F0Y2ggdmlldy5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5yZXBsRWRpdG9yLnJlYWRMYXN0RXhlY3V0aW9uT3V0cHV0Jzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5yZXBsRWRpdG9yLnJlYWRMYXN0RXhlY3V0ZWRPdXRwdXQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIG91dHB1dCBmcm9tIGFuIGV4ZWN1dGlvbiBpbiB0aGUgbmF0aXZlIFJFUEwgd2lsbCBiZSBhbm5vdW5jZWQuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkucmVwbEVkaXRvci5hdXRvRm9jdXNSZXBsRXhlY3V0aW9uJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ25vbmUnLCAnaW5wdXQnLCAnbGFzdEV4ZWN1dGlvbiddLFxuXHRcdFx0ZGVmYXVsdDogJ2lucHV0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVwbEVkaXRvci5hdXRvRm9jdXNBcHBlbmRlZENlbGwnLCBcIkNvbnRyb2wgd2hldGhlciBmb2N1cyBzaG91bGQgYXV0b21hdGljYWxseSBiZSBzZW50IHRvIHRoZSBSRVBMIHdoZW4gY29kZSBpcyBleGVjdXRlZC5cIiksXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS53aW5kb3dUaXRsZU9wdGltaXplZCc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS53aW5kb3dUaXRsZU9wdGltaXplZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgezB9IHNob3VsZCBiZSBvcHRpbWl6ZWQgZm9yIHNjcmVlbiByZWFkZXJzIHdoZW4gaW4gc2NyZWVuIHJlYWRlciBtb2RlLiBXaGVuIGVuYWJsZWQsIHRoZSB3aW5kb3cgdGl0bGUgd2lsbCBoYXZlIHsxfSBhcHBlbmRlZCB0byB0aGUgZW5kLlwiLCAnYCN3aW5kb3cudGl0bGUjYCcsICdgYWN0aXZlRWRpdG9yU3RhdGVgJylcblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5Lm9wZW5DaGF0RWRpdGVkRmlsZXMnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5Lm9wZW5DaGF0RWRpdGVkRmlsZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgZmlsZXMgc2hvdWxkIGJlIG9wZW5lZCB3aGVuIHRoZSBjaGF0IGFnZW50IGhhcyBhcHBsaWVkIGVkaXRzIHRvIHRoZW0uXCIpXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS52ZXJib3NlQ2hhdFByb2dyZXNzVXBkYXRlcyc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS52ZXJib3NlQ2hhdFByb2dyZXNzVXBkYXRlcycsIFwiQ29udHJvbHMgd2hldGhlciB2ZXJib3NlIHByb2dyZXNzIGFubm91bmNlbWVudHMgc2hvdWxkIGJlIG1hZGUgd2hlbiBhIGNoYXQgcmVxdWVzdCBpcyBpbiBwcm9ncmVzcywgaW5jbHVkaW5nIGluZm9ybWF0aW9uIGxpa2Ugc2VhcmNoZWQgdGV4dCBmb3IgPHNlYXJjaCB0ZXJtPiB3aXRoIFggcmVzdWx0cywgY3JlYXRlZCBmaWxlIDxmaWxlX25hbWU+LCBvciByZWFkIGZpbGUgPGZpbGUgcGF0aD4uXCIpXG5cdFx0fVxuXHR9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJBY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbigpIHtcblx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRyZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbik7XG5cblx0cmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHQuLi53b3JrYmVuY2hDb25maWd1cmF0aW9uTm9kZUJhc2UsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0W0FjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuRGltVW5mb2N1c2VkRW5hYmxlZF06IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdkaW1VbmZvY3VzZWRFbmFibGVkJywgJ1doZXRoZXIgdG8gZGltIHVuZm9jdXNlZCBlZGl0b3JzIGFuZCB0ZXJtaW5hbHMsIHdoaWNoIG1ha2VzIGl0IG1vcmUgY2xlYXIgd2hlcmUgdHlwZWQgaW5wdXQgd2lsbCBnbyB0by4gVGhpcyB3b3JrcyB3aXRoIHRoZSBtYWpvcml0eSBvZiBlZGl0b3JzIHdpdGggdGhlIG5vdGFibGUgZXhjZXB0aW9ucyBvZiB0aG9zZSB0aGF0IHV0aWxpemUgaWZyYW1lcyBsaWtlIG5vdGVib29rcyBhbmQgZXh0ZW5zaW9uIHdlYnZpZXcgZWRpdG9ycy4nKSxcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0dGFnczogWydhY2Nlc3NpYmlsaXR5J10sXG5cdFx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR9LFxuXHRcdFx0W0FjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuRGltVW5mb2N1c2VkT3BhY2l0eV06IHtcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2RpbVVuZm9jdXNlZE9wYWNpdHknLCAnVGhlIG9wYWNpdHkgZnJhY3Rpb24gKDAuMiB0byAxLjApIHRvIHVzZSBmb3IgdW5mb2N1c2VkIGVkaXRvcnMgYW5kIHRlcm1pbmFscy4gVGhpcyB3aWxsIG9ubHkgdGFrZSBlZmZlY3Qgd2hlbiB7MH0gaXMgZW5hYmxlZC4nLCBgXFxgIyR7QWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5EaW1VbmZvY3VzZWRFbmFibGVkfSNcXGBgKSxcblx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdG1pbmltdW06IFZpZXdEaW1VbmZvY3VzZWRPcGFjaXR5UHJvcGVydGllcy5NaW5pbXVtLFxuXHRcdFx0XHRtYXhpbXVtOiBWaWV3RGltVW5mb2N1c2VkT3BhY2l0eVByb3BlcnRpZXMuTWF4aW11bSxcblx0XHRcdFx0ZGVmYXVsdDogVmlld0RpbVVuZm9jdXNlZE9wYWNpdHlQcm9wZXJ0aWVzLkRlZmF1bHQsXG5cdFx0XHRcdHRhZ3M6IFsnYWNjZXNzaWJpbGl0eSddLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0fSxcblx0XHRcdFtBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLkhpZGVBY2Nlc3NpYmxlVmlld106IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LmhpZGVBY2Nlc3NpYmxlVmlldycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgQWNjZXNzaWJsZSBWaWV3IGlzIGhpZGRlbi5cIiksXG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdHRhZ3M6IFsnYWNjZXNzaWJpbGl0eSddXG5cdFx0XHR9LFxuXHRcdFx0W0FjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuVmVyYm9zZUNoYXRQcm9ncmVzc1VwZGF0ZXNdOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkudmVyYm9zZUNoYXRQcm9ncmVzc1VwZGF0ZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdmVyYm9zZSBwcm9ncmVzcyBhbm5vdW5jZW1lbnRzIHNob3VsZCBiZSBtYWRlIHdoZW4gYSBjaGF0IHJlcXVlc3QgaXMgaW4gcHJvZ3Jlc3MsIGluY2x1ZGluZyBpbmZvcm1hdGlvbiBsaWtlIHNlYXJjaGVkIHRleHQgZm9yIDxzZWFyY2ggdGVybT4gd2l0aCBYIHJlc3VsdHMsIGNyZWF0ZWQgZmlsZSA8ZmlsZV9uYW1lPiwgb3IgcmVhZCBmaWxlIDxmaWxlIHBhdGg+LlwiKVxuXHRcdFx0fSxcblx0XHRcdFtBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLlNob3dDaGF0Q2hlY2ttYXJrc106IHtcblx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHRcdCd0YWdzJzogWydhY2Nlc3NpYmlsaXR5J10sXG5cdFx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuY2hhdC5zaG93Q2hlY2ttYXJrcycsIFwiQ29udHJvbHMgd2hldGhlciBjaGVja21hcmsgaWNvbnMgYXJlIHNob3duIG9uIGNvbXBsZXRlZCB0b29sIGNhbGxzIGFuZCBvdGhlciBjb2xsYXBzaWJsZSBpdGVtcyBpbiBjaGF0IHJlc3BvbnNlcy5cIilcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnQgeyBBY2Nlc3NpYmlsaXR5Vm9pY2VTZXR0aW5nSWQgfTtcblxuZXhwb3J0IGNvbnN0IFNwZWVjaFRpbWVvdXREZWZhdWx0ID0gMDtcblxuZXhwb3J0IGNsYXNzIER5bmFtaWNTcGVlY2hBY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuZHluYW1pY1NwZWVjaEFjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNwZWVjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzcGVlY2hTZXJ2aWNlOiBJU3BlZWNoU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHNwZWVjaFNlcnZpY2Uub25EaWRDaGFuZ2VIYXNTcGVlY2hQcm92aWRlciwgKCkgPT4gdGhpcy51cGRhdGVDb25maWd1cmF0aW9uKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29uZmlndXJhdGlvbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc3BlZWNoU2VydmljZS5oYXNTcGVlY2hQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuOyAvLyB0aGVzZSBzZXR0aW5ncyByZXF1aXJlIGEgc3BlZWNoIHByb3ZpZGVyXG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VzID0gdGhpcy5nZXRMYW5ndWFnZXMoKTtcblx0XHRjb25zdCBsYW5ndWFnZXNTb3J0ZWQgPSBPYmplY3Qua2V5cyhsYW5ndWFnZXMpLnNvcnQoKGxhbmdBLCBsYW5nQikgPT4ge1xuXHRcdFx0cmV0dXJuIGxhbmd1YWdlc1tsYW5nQV0ubmFtZS5sb2NhbGVDb21wYXJlKGxhbmd1YWdlc1tsYW5nQl0ubmFtZSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdFx0cmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdC4uLmFjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uTm9kZUJhc2UsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFtBY2Nlc3NpYmlsaXR5Vm9pY2VTZXR0aW5nSWQuU3BlZWNoVGltZW91dF06IHtcblx0XHRcdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCd2b2ljZS5zcGVlY2hUaW1lb3V0JywgXCJUaGUgZHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzIHRoYXQgdm9pY2Ugc3BlZWNoIHJlY29nbml0aW9uIHJlbWFpbnMgYWN0aXZlIGFmdGVyIHlvdSBzdG9wIHNwZWFraW5nLiBGb3IgZXhhbXBsZSBpbiBhIGNoYXQgc2Vzc2lvbiwgdGhlIHRyYW5zY3JpYmVkIHRleHQgaXMgc3VibWl0dGVkIGF1dG9tYXRpY2FsbHkgYWZ0ZXIgdGhlIHRpbWVvdXQgaXMgbWV0LiBTZXQgdG8gYDBgIHRvIGRpc2FibGUgdGhpcyBmZWF0dXJlLlwiKSxcblx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogU3BlZWNoVGltZW91dERlZmF1bHQsXG5cdFx0XHRcdFx0J21pbmltdW0nOiAwLFxuXHRcdFx0XHRcdCd0YWdzJzogWydhY2Nlc3NpYmlsaXR5J11cblx0XHRcdFx0fSxcblx0XHRcdFx0W0FjY2Vzc2liaWxpdHlWb2ljZVNldHRpbmdJZC5JZ25vcmVDb2RlQmxvY2tzXToge1xuXHRcdFx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ3ZvaWNlLmlnbm9yZUNvZGVCbG9ja3MnLCBcIldoZXRoZXIgdG8gaWdub3JlIGNvZGUgc25pcHBldHMgaW4gdGV4dC10by1zcGVlY2ggc3ludGhlc2lzLlwiKSxcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0XHRcdCd0YWdzJzogWydhY2Nlc3NpYmlsaXR5J11cblx0XHRcdFx0fSxcblx0XHRcdFx0W0FjY2Vzc2liaWxpdHlWb2ljZVNldHRpbmdJZC5TcGVlY2hMYW5ndWFnZV06IHtcblx0XHRcdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCd2b2ljZS5zcGVlY2hMYW5ndWFnZScsIFwiVGhlIGxhbmd1YWdlIHRoYXQgdGV4dC10by1zcGVlY2ggYW5kIHNwZWVjaC10by10ZXh0IHNob3VsZCB1c2UuIFNlbGVjdCBgYXV0b2AgdG8gdXNlIHRoZSBjb25maWd1cmVkIGRpc3BsYXkgbGFuZ3VhZ2UgaWYgcG9zc2libGUuIE5vdGUgdGhhdCBub3QgYWxsIGRpc3BsYXkgbGFuZ3VhZ2VzIG1heWJlIHN1cHBvcnRlZCBieSBzcGVlY2ggcmVjb2duaXRpb24gYW5kIHN5bnRoZXNpemVycy5cIiksXG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZW51bSc6IGxhbmd1YWdlc1NvcnRlZCxcblx0XHRcdFx0XHQnZGVmYXVsdCc6ICdhdXRvJyxcblx0XHRcdFx0XHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddLFxuXHRcdFx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogbGFuZ3VhZ2VzU29ydGVkLm1hcChrZXkgPT4gbGFuZ3VhZ2VzW2tleV0ubmFtZSksXG5cdFx0XHRcdFx0J2VudW1JdGVtTGFiZWxzJzogbGFuZ3VhZ2VzU29ydGVkLm1hcChrZXkgPT4gbGFuZ3VhZ2VzW2tleV0ubmFtZSlcblx0XHRcdFx0fSxcblx0XHRcdFx0W0FjY2Vzc2liaWxpdHlWb2ljZVNldHRpbmdJZC5BdXRvU3ludGhlc2l6ZV06IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdlbnVtJzogWydvbicsICdvZmYnXSxcblx0XHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnZvaWNlLmF1dG9TeW50aGVzaXplLm9uJywgXCJFbmFibGUgdGhlIGZlYXR1cmUuIFdoZW4gYSBzY3JlZW4gcmVhZGVyIGlzIGVuYWJsZWQsIG5vdGUgdGhhdCB0aGlzIHdpbGwgZGlzYWJsZSBhcmlhIHVwZGF0ZXMuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkudm9pY2UuYXV0b1N5bnRoZXNpemUub2ZmJywgXCJEaXNhYmxlIHRoZSBmZWF0dXJlLlwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2F1dG9TeW50aGVzaXplJywgXCJXaGV0aGVyIGEgdGV4dHVhbCByZXNwb25zZSBzaG91bGQgYXV0b21hdGljYWxseSBiZSByZWFkIG91dCBhbG91ZCB3aGVuIHNwZWVjaCB3YXMgdXNlZCBhcyBpbnB1dC4gRm9yIGV4YW1wbGUgaW4gYSBjaGF0IHNlc3Npb24sIGEgcmVzcG9uc2UgaXMgYXV0b21hdGljYWxseSBzeW50aGVzaXplZCB3aGVuIHZvaWNlIHdhcyB1c2VkIGFzIGNoYXQgcmVxdWVzdC5cIiksXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnb2ZmJyxcblx0XHRcdFx0XHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TGFuZ3VhZ2VzKCk6IHsgW2xvY2FsZTogc3RyaW5nXTogeyBuYW1lOiBzdHJpbmcgfSB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0WydhdXRvJ106IHtcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ3NwZWVjaExhbmd1YWdlLmF1dG8nLCBcIkF1dG8gKFVzZSBEaXNwbGF5IExhbmd1YWdlKVwiKVxuXHRcdFx0fSxcblx0XHRcdC4uLlNQRUVDSF9MQU5HVUFHRVNcblx0XHR9O1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6ICdhdWRpb0N1ZXMudm9sdW1lJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZSwgYWNjZXNzb3IpID0+IHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFsnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLnZvbHVtZScsIHsgdmFsdWUgfV0sXG5cdFx0XHRcdFsnYXVkaW9DdWVzLnZvbHVtZScsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XVxuXHRcdFx0XTtcblx0XHR9XG5cdH1dKTtcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25NaWdyYXRpb25SZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uTWlncmF0aW9uKVxuXHQucmVnaXN0ZXJDb25maWd1cmF0aW9uTWlncmF0aW9ucyhbe1xuXHRcdGtleTogJ2F1ZGlvQ3Vlcy5kZWJvdW5jZVBvc2l0aW9uQ2hhbmdlcycsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWUpID0+IHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFsnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzJywgeyB2YWx1ZSB9XSxcblx0XHRcdFx0WydhdWRpb0N1ZXMuZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV1cblx0XHRcdF07XG5cdFx0fVxuXHR9XSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgZGVsYXlHZW5lcmFsID0gZ2V0RGVsYXlzRnJvbUNvbmZpZyhhY2Nlc3NvciwgJ2dlbmVyYWwnKTtcblx0XHRcdGNvbnN0IGRlbGF5RXJyb3IgPSBnZXREZWxheXNGcm9tQ29uZmlnKGFjY2Vzc29yLCAnZXJyb3JBdFBvc2l0aW9uJyk7XG5cdFx0XHRjb25zdCBkZWxheVdhcm5pbmcgPSBnZXREZWxheXNGcm9tQ29uZmlnKGFjY2Vzc29yLCAnd2FybmluZ0F0UG9zaXRpb24nKTtcblx0XHRcdGNvbnN0IHZvbHVtZSA9IGdldFZvbHVtZUZyb21Db25maWcoYWNjZXNzb3IpO1xuXHRcdFx0Y29uc3QgZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMgPSBnZXREZWJvdW5jZVBvc2l0aW9uQ2hhbmdlc0Zyb21Db25maWcoYWNjZXNzb3IpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBba2V5OiBzdHJpbmcsIHsgdmFsdWU6IGFueSB9XVtdID0gW107XG5cdFx0XHRpZiAoISF2b2x1bWUpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goWydhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMudm9sdW1lJywgeyB2YWx1ZTogdm9sdW1lIH1dKTtcblx0XHRcdH1cblx0XHRcdGlmICghIWRlbGF5R2VuZXJhbCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChbJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5leHBlcmltZW50YWwuZGVsYXlzLmdlbmVyYWwnLCB7IHZhbHVlOiBkZWxheUdlbmVyYWwgfV0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCEhZGVsYXlFcnJvcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChbJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5leHBlcmltZW50YWwuZGVsYXlzLmVycm9yQXRQb3NpdGlvbicsIHsgdmFsdWU6IGRlbGF5RXJyb3IgfV0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCEhZGVsYXlXYXJuaW5nKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKFsnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmV4cGVyaW1lbnRhbC5kZWxheXMud2FybmluZ0F0UG9zaXRpb24nLCB7IHZhbHVlOiBkZWxheVdhcm5pbmcgfV0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCEhZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goWydhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMnLCB7IHZhbHVlOiBkZWJvdW5jZVBvc2l0aW9uQ2hhbmdlcyB9XSk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChbJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucycsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fV0pO1xuXG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc291bmRzLnZvbHVtZScsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWUpID0+IHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFsnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLnZvbHVtZScsIHsgdmFsdWUgfV0sXG5cdFx0XHRcdFsnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNvdW5kcy52b2x1bWUnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV1cblx0XHRcdF07XG5cdFx0fVxuXHR9XSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlKSA9PiB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRbJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5kZWJvdW5jZVBvc2l0aW9uQ2hhbmdlcycsIHsgdmFsdWUgfV0sXG5cdFx0XHRcdFsnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dXG5cdFx0XHRdO1xuXHRcdH1cblx0fV0pO1xuXG5mdW5jdGlvbiBnZXREZWxheXNGcm9tQ29uZmlnKGFjY2Vzc29yOiAoa2V5OiBzdHJpbmcpID0+IGFueSwgdHlwZTogJ2dlbmVyYWwnIHwgJ2Vycm9yQXRQb3NpdGlvbicgfCAnd2FybmluZ0F0UG9zaXRpb24nKTogeyBhbm5vdW5jZW1lbnQ6IG51bWJlcjsgc291bmQ6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGFjY2Vzc29yKGBhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZXhwZXJpbWVudGFsLmRlbGF5cy4ke3R5cGV9YCkgfHwgYWNjZXNzb3IoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucycpPy5bJ2V4cGVyaW1lbnRhbC5kZWxheXMnXT8uW2Ake3R5cGV9YF0gfHwgYWNjZXNzb3IoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucycpPy5bJ2RlbGF5cyddPy5bYCR7dHlwZX1gXTtcbn1cblxuZnVuY3Rpb24gZ2V0Vm9sdW1lRnJvbUNvbmZpZyhhY2Nlc3NvcjogKGtleTogc3RyaW5nKSA9PiBhbnkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gYWNjZXNzb3IoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy52b2x1bWUnKSB8fCBhY2Nlc3NvcignYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zJyk/LnZvbHVtZSB8fCBhY2Nlc3NvcignYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNvdW5kcy52b2x1bWUnKSB8fCBhY2Nlc3NvcignYXVkaW9DdWVzLnZvbHVtZScpO1xufVxuXG5mdW5jdGlvbiBnZXREZWJvdW5jZVBvc2l0aW9uQ2hhbmdlc0Zyb21Db25maWcoYWNjZXNzb3I6IChrZXk6IHN0cmluZykgPT4gYW55KTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGFjY2Vzc29yKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMnKSB8fCBhY2Nlc3NvcignYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zJyk/LmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzIHx8IGFjY2Vzc29yKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMnKSB8fCBhY2Nlc3NvcignYXVkaW9DdWVzLmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzJyk7XG59XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6IEFjY2Vzc2liaWxpdHlWb2ljZVNldHRpbmdJZC5BdXRvU3ludGhlc2l6ZSxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0bGV0IG5ld1ZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodmFsdWUgPT09IHRydWUpIHtcblx0XHRcdFx0bmV3VmFsdWUgPSAnb24nO1xuXHRcdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0bmV3VmFsdWUgPSAnb2ZmJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFtBY2Nlc3NpYmlsaXR5Vm9pY2VTZXR0aW5nSWQuQXV0b1N5bnRoZXNpemUsIHsgdmFsdWU6IG5ld1ZhbHVlIH1dLFxuXHRcdFx0XTtcblx0XHR9XG5cdH1dKTtcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25NaWdyYXRpb25SZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uTWlncmF0aW9uKVxuXHQucmVnaXN0ZXJDb25maWd1cmF0aW9uTWlncmF0aW9ucyhbe1xuXHRcdGtleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVzcG9uc2VQZW5kaW5nJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZSwgYWNjZXNzb3IpID0+IHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFsnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnByb2dyZXNzJywgeyB2YWx1ZSB9XSxcblx0XHRcdFx0WydhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFJlc3BvbnNlUGVuZGluZycsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XSxcblx0XHRcdF07XG5cdFx0fVxuXHR9XSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoQWNjZXNzaWJpbGl0eVNpZ25hbC5hbGxBY2Nlc3NpYmlsaXR5U2lnbmFscy5tYXA8Q29uZmlndXJhdGlvbk1pZ3JhdGlvbiB8IHVuZGVmaW5lZD4oaXRlbSA9PiBpdGVtLmxlZ2FjeVNvdW5kU2V0dGluZ3NLZXkgPyAoe1xuXHRcdGtleTogaXRlbS5sZWdhY3lTb3VuZFNldHRpbmdzS2V5LFxuXHRcdG1pZ3JhdGVGbjogKHNvdW5kLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbktleVZhbHVlUGFpcnM6IENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzID0gW107XG5cdFx0XHRjb25zdCBsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleSA9IGl0ZW0ubGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk7XG5cdFx0XHRsZXQgYW5ub3VuY2VtZW50OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXkpIHtcblx0XHRcdFx0YW5ub3VuY2VtZW50ID0gYWNjZXNzb3IobGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXkpID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGFubm91bmNlbWVudCAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBhbm5vdW5jZW1lbnQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0YW5ub3VuY2VtZW50ID0gYW5ub3VuY2VtZW50ID8gJ2F1dG8nIDogJ29mZic7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLnB1c2goW2Ake2l0ZW0ubGVnYWN5U291bmRTZXR0aW5nc0tleX1gLCB7IHZhbHVlOiB1bmRlZmluZWQgfV0pO1xuXHRcdFx0Y29uZmlndXJhdGlvbktleVZhbHVlUGFpcnMucHVzaChbYCR7aXRlbS5zZXR0aW5nc0tleX1gLCB7IHZhbHVlOiBhbm5vdW5jZW1lbnQgIT09IHVuZGVmaW5lZCA/IHsgYW5ub3VuY2VtZW50LCBzb3VuZCB9IDogeyBzb3VuZCB9IH1dKTtcblx0XHRcdHJldHVybiBjb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycztcblx0XHR9XG5cdH0pIDogdW5kZWZpbmVkKS5maWx0ZXIoaXNEZWZpbmVkKSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoQWNjZXNzaWJpbGl0eVNpZ25hbC5hbGxBY2Nlc3NpYmlsaXR5U2lnbmFscy5maWx0ZXIoaSA9PiAhIWkubGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXkgJiYgISFpLmxlZ2FjeVNvdW5kU2V0dGluZ3NLZXkpLm1hcChpdGVtID0+ICh7XG5cdFx0a2V5OiBpdGVtLmxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5ISxcblx0XHRtaWdyYXRlRm46IChhbm5vdW5jZW1lbnQsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uS2V5VmFsdWVQYWlyczogQ29uZmlndXJhdGlvbktleVZhbHVlUGFpcnMgPSBbXTtcblx0XHRcdGNvbnN0IHNvdW5kID0gYWNjZXNzb3IoaXRlbS5zZXR0aW5nc0tleSk/LnNvdW5kIHx8IGFjY2Vzc29yKGl0ZW0ubGVnYWN5U291bmRTZXR0aW5nc0tleSEpO1xuXHRcdFx0aWYgKGFubm91bmNlbWVudCAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiBhbm5vdW5jZW1lbnQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGFubm91bmNlbWVudCA9IGFubm91bmNlbWVudCA/ICdhdXRvJyA6ICdvZmYnO1xuXHRcdFx0fVxuXHRcdFx0Y29uZmlndXJhdGlvbktleVZhbHVlUGFpcnMucHVzaChbYCR7aXRlbS5zZXR0aW5nc0tleX1gLCB7IHZhbHVlOiBhbm5vdW5jZW1lbnQgIT09IHVuZGVmaW5lZCA/IHsgYW5ub3VuY2VtZW50LCBzb3VuZCB9IDogeyBzb3VuZCB9IH1dKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLnB1c2goW2Ake2l0ZW0ubGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXl9YCwgeyB2YWx1ZTogdW5kZWZpbmVkIH1dKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLnB1c2goW2Ake2l0ZW0ubGVnYWN5U291bmRTZXR0aW5nc0tleX1gLCB7IHZhbHVlOiB1bmRlZmluZWQgfV0pO1xuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzO1xuXHRcdH1cblx0fSkpKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0Isa0JBQTRGO0FBQ3pILFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDLGNBQWMsMkJBQWdIO0FBQ3ZLLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCLGdCQUFnQix3QkFBd0I7QUFDOUUsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlC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QXlELENBQUM7QUFDaEUsVUFBTSxRQUFRLFNBQVMsS0FBSyxXQUFXLEdBQUcsU0FBUyxTQUFTLEtBQUssc0JBQXVCO0FBQ3hGLFFBQUksaUJBQWlCLFVBQWEsT0FBTyxpQkFBaUIsVUFBVTtBQUNuRSxxQkFBZSxlQUFlLFNBQVM7QUFBQSxJQUN4QztBQUNBLCtCQUEyQixLQUFLLENBQUMsR0FBRyxLQUFLLFdBQVcsSUFBSSxFQUFFLE9BQU8saUJBQWlCLFNBQVksRUFBRSxjQUFjLE1BQU0sSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFDcEksK0JBQTJCLEtBQUssQ0FBQyxHQUFHLEtBQUssNkJBQTZCLElBQUksRUFBRSxPQUFPLE9BQVUsQ0FBQyxDQUFDO0FBQy9GLCtCQUEyQixLQUFLLENBQUMsR0FBRyxLQUFLLHNCQUFzQixJQUFJLEVBQUUsT0FBTyxPQUFVLENBQUMsQ0FBQztBQUN4RixXQUFPO0FBQUEsRUFDUjtBQUNELEVBQUUsQ0FBQzsiLAogICJuYW1lcyI6IFsiQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZCIsICJWaWV3RGltVW5mb2N1c2VkT3BhY2l0eVByb3BlcnRpZXMiLCAiQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCJdCn0K
