import { isLinux } from "../../../../base/common/platform.js";
import * as nls from "../../../../nls.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { defaultTerminalContribCommandsToSkipShell } from "../terminalContribExports.js";
const TERMINAL_VIEW_ID = "terminal";
const TERMINAL_CREATION_COMMANDS = ["workbench.action.terminal.toggleTerminal", "workbench.action.terminal.new", "workbench.action.togglePanel", "workbench.action.terminal.focus"];
const TERMINAL_CONFIG_SECTION = "terminal.integrated";
const DEFAULT_LETTER_SPACING = 0;
const MINIMUM_LETTER_SPACING = -5;
const DEFAULT_LINE_HEIGHT = isLinux ? 1.1 : 1;
const MINIMUM_FONT_WEIGHT = 1;
const MAXIMUM_FONT_WEIGHT = 1e3;
const DEFAULT_FONT_WEIGHT = "normal";
const DEFAULT_BOLD_FONT_WEIGHT = "bold";
const SUGGESTIONS_FONT_WEIGHT = ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
const ITerminalProfileResolverService = createDecorator("terminalProfileResolverService");
const ITerminalProfileService = createDecorator("terminalProfileService");
const isTerminalProcessManager = (t) => typeof t.write === "function";
var ProcessState = /* @__PURE__ */ ((ProcessState2) => {
  ProcessState2[ProcessState2["Uninitialized"] = 1] = "Uninitialized";
  ProcessState2[ProcessState2["Launching"] = 2] = "Launching";
  ProcessState2[ProcessState2["Running"] = 3] = "Running";
  ProcessState2[ProcessState2["KilledDuringLaunch"] = 4] = "KilledDuringLaunch";
  ProcessState2[ProcessState2["KilledByUser"] = 5] = "KilledByUser";
  ProcessState2[ProcessState2["KilledByProcess"] = 6] = "KilledByProcess";
  return ProcessState2;
})(ProcessState || {});
const QUICK_LAUNCH_PROFILE_CHOICE = "workbench.action.terminal.profile.choice";
var TerminalCommandId = /* @__PURE__ */ ((TerminalCommandId2) => {
  TerminalCommandId2["Toggle"] = "workbench.action.terminal.toggleTerminal";
  TerminalCommandId2["Kill"] = "workbench.action.terminal.kill";
  TerminalCommandId2["KillViewOrEditor"] = "workbench.action.terminal.killViewOrEditor";
  TerminalCommandId2["KillEditor"] = "workbench.action.terminal.killEditor";
  TerminalCommandId2["KillActiveTab"] = "workbench.action.terminal.killActiveTab";
  TerminalCommandId2["KillAll"] = "workbench.action.terminal.killAll";
  TerminalCommandId2["QuickKill"] = "workbench.action.terminal.quickKill";
  TerminalCommandId2["ConfigureTerminalSettings"] = "workbench.action.terminal.openSettings";
  TerminalCommandId2["ShellIntegrationLearnMore"] = "workbench.action.terminal.learnMore";
  TerminalCommandId2["CopyLastCommand"] = "workbench.action.terminal.copyLastCommand";
  TerminalCommandId2["CopyLastCommandOutput"] = "workbench.action.terminal.copyLastCommandOutput";
  TerminalCommandId2["CopyLastCommandAndLastCommandOutput"] = "workbench.action.terminal.copyLastCommandAndLastCommandOutput";
  TerminalCommandId2["CopyAndClearSelection"] = "workbench.action.terminal.copyAndClearSelection";
  TerminalCommandId2["CopySelection"] = "workbench.action.terminal.copySelection";
  TerminalCommandId2["CopySelectionAsHtml"] = "workbench.action.terminal.copySelectionAsHtml";
  TerminalCommandId2["SelectAll"] = "workbench.action.terminal.selectAll";
  TerminalCommandId2["DeleteWordLeft"] = "workbench.action.terminal.deleteWordLeft";
  TerminalCommandId2["DeleteWordRight"] = "workbench.action.terminal.deleteWordRight";
  TerminalCommandId2["DeleteToLineStart"] = "workbench.action.terminal.deleteToLineStart";
  TerminalCommandId2["MoveToLineStart"] = "workbench.action.terminal.moveToLineStart";
  TerminalCommandId2["MoveToLineEnd"] = "workbench.action.terminal.moveToLineEnd";
  TerminalCommandId2["New"] = "workbench.action.terminal.new";
  TerminalCommandId2["NewWithCwd"] = "workbench.action.terminal.newWithCwd";
  TerminalCommandId2["NewLocal"] = "workbench.action.terminal.newLocal";
  TerminalCommandId2["NewInActiveWorkspace"] = "workbench.action.terminal.newInActiveWorkspace";
  TerminalCommandId2["NewWithProfile"] = "workbench.action.terminal.newWithProfile";
  TerminalCommandId2["Split"] = "workbench.action.terminal.split";
  TerminalCommandId2["SplitActiveTab"] = "workbench.action.terminal.splitActiveTab";
  TerminalCommandId2["SplitInActiveWorkspace"] = "workbench.action.terminal.splitInActiveWorkspace";
  TerminalCommandId2["Unsplit"] = "workbench.action.terminal.unsplit";
  TerminalCommandId2["JoinActiveTab"] = "workbench.action.terminal.joinActiveTab";
  TerminalCommandId2["Join"] = "workbench.action.terminal.join";
  TerminalCommandId2["Relaunch"] = "workbench.action.terminal.relaunch";
  TerminalCommandId2["FocusPreviousPane"] = "workbench.action.terminal.focusPreviousPane";
  TerminalCommandId2["CreateTerminalEditor"] = "workbench.action.createTerminalEditor";
  TerminalCommandId2["CreateTerminalEditorSameGroup"] = "workbench.action.createTerminalEditorSameGroup";
  TerminalCommandId2["CreateTerminalEditorSide"] = "workbench.action.createTerminalEditorSide";
  TerminalCommandId2["FocusTabs"] = "workbench.action.terminal.focusTabs";
  TerminalCommandId2["FocusNextPane"] = "workbench.action.terminal.focusNextPane";
  TerminalCommandId2["ResizePaneLeft"] = "workbench.action.terminal.resizePaneLeft";
  TerminalCommandId2["ResizePaneRight"] = "workbench.action.terminal.resizePaneRight";
  TerminalCommandId2["ResizePaneUp"] = "workbench.action.terminal.resizePaneUp";
  TerminalCommandId2["SizeToContentWidth"] = "workbench.action.terminal.sizeToContentWidth";
  TerminalCommandId2["SizeToContentWidthActiveTab"] = "workbench.action.terminal.sizeToContentWidthActiveTab";
  TerminalCommandId2["ResizePaneDown"] = "workbench.action.terminal.resizePaneDown";
  TerminalCommandId2["Focus"] = "workbench.action.terminal.focus";
  TerminalCommandId2["FocusInstance"] = "workbench.action.terminal.focusInstance";
  TerminalCommandId2["FocusNext"] = "workbench.action.terminal.focusNext";
  TerminalCommandId2["FocusPrevious"] = "workbench.action.terminal.focusPrevious";
  TerminalCommandId2["Paste"] = "workbench.action.terminal.paste";
  TerminalCommandId2["PastePwsh"] = "workbench.action.terminal.pastePwsh";
  TerminalCommandId2["PasteSelection"] = "workbench.action.terminal.pasteSelection";
  TerminalCommandId2["SelectDefaultProfile"] = "workbench.action.terminal.selectDefaultShell";
  TerminalCommandId2["RunSelectedText"] = "workbench.action.terminal.runSelectedText";
  TerminalCommandId2["RunActiveFile"] = "workbench.action.terminal.runActiveFile";
  TerminalCommandId2["SwitchTerminal"] = "workbench.action.terminal.switchTerminal";
  TerminalCommandId2["ScrollDownLine"] = "workbench.action.terminal.scrollDown";
  TerminalCommandId2["ScrollDownPage"] = "workbench.action.terminal.scrollDownPage";
  TerminalCommandId2["ScrollToBottom"] = "workbench.action.terminal.scrollToBottom";
  TerminalCommandId2["ScrollUpLine"] = "workbench.action.terminal.scrollUp";
  TerminalCommandId2["ScrollUpPage"] = "workbench.action.terminal.scrollUpPage";
  TerminalCommandId2["ScrollToTop"] = "workbench.action.terminal.scrollToTop";
  TerminalCommandId2["Clear"] = "workbench.action.terminal.clear";
  TerminalCommandId2["ClearSelection"] = "workbench.action.terminal.clearSelection";
  TerminalCommandId2["ChangeIcon"] = "workbench.action.terminal.changeIcon";
  TerminalCommandId2["ChangeIconActiveTab"] = "workbench.action.terminal.changeIconActiveTab";
  TerminalCommandId2["ChangeColor"] = "workbench.action.terminal.changeColor";
  TerminalCommandId2["ChangeColorActiveTab"] = "workbench.action.terminal.changeColorActiveTab";
  TerminalCommandId2["Rename"] = "workbench.action.terminal.rename";
  TerminalCommandId2["RenameActiveTab"] = "workbench.action.terminal.renameActiveTab";
  TerminalCommandId2["RenameWithArgs"] = "workbench.action.terminal.renameWithArg";
  TerminalCommandId2["ScrollToPreviousCommand"] = "workbench.action.terminal.scrollToPreviousCommand";
  TerminalCommandId2["ScrollToNextCommand"] = "workbench.action.terminal.scrollToNextCommand";
  TerminalCommandId2["SelectToPreviousCommand"] = "workbench.action.terminal.selectToPreviousCommand";
  TerminalCommandId2["SelectToNextCommand"] = "workbench.action.terminal.selectToNextCommand";
  TerminalCommandId2["SelectToPreviousLine"] = "workbench.action.terminal.selectToPreviousLine";
  TerminalCommandId2["SelectToNextLine"] = "workbench.action.terminal.selectToNextLine";
  TerminalCommandId2["SendSequence"] = "workbench.action.terminal.sendSequence";
  TerminalCommandId2["SendSignal"] = "workbench.action.terminal.sendSignal";
  TerminalCommandId2["AttachToSession"] = "workbench.action.terminal.attachToSession";
  TerminalCommandId2["DetachSession"] = "workbench.action.terminal.detachSession";
  TerminalCommandId2["MoveToEditor"] = "workbench.action.terminal.moveToEditor";
  TerminalCommandId2["MoveToTerminalPanel"] = "workbench.action.terminal.moveToTerminalPanel";
  TerminalCommandId2["MoveIntoNewWindow"] = "workbench.action.terminal.moveIntoNewWindow";
  TerminalCommandId2["NewInNewWindow"] = "workbench.action.terminal.newInNewWindow";
  TerminalCommandId2["SetDimensions"] = "workbench.action.terminal.setDimensions";
  TerminalCommandId2["FocusHover"] = "workbench.action.terminal.focusHover";
  TerminalCommandId2["ShowEnvironmentContributions"] = "workbench.action.terminal.showEnvironmentContributions";
  TerminalCommandId2["StartVoice"] = "workbench.action.terminal.startVoice";
  TerminalCommandId2["StopVoice"] = "workbench.action.terminal.stopVoice";
  TerminalCommandId2["RevealCommand"] = "workbench.action.terminal.revealCommand";
  return TerminalCommandId2;
})(TerminalCommandId || {});
const DEFAULT_COMMANDS_TO_SKIP_SHELL = [
  "workbench.action.terminal.clearSelection" /* ClearSelection */,
  "workbench.action.terminal.clear" /* Clear */,
  "workbench.action.terminal.copyAndClearSelection" /* CopyAndClearSelection */,
  "workbench.action.terminal.copySelection" /* CopySelection */,
  "workbench.action.terminal.copySelectionAsHtml" /* CopySelectionAsHtml */,
  "workbench.action.terminal.copyLastCommand" /* CopyLastCommand */,
  "workbench.action.terminal.copyLastCommandOutput" /* CopyLastCommandOutput */,
  "workbench.action.terminal.copyLastCommandAndLastCommandOutput" /* CopyLastCommandAndLastCommandOutput */,
  "workbench.action.terminal.deleteToLineStart" /* DeleteToLineStart */,
  "workbench.action.terminal.deleteWordLeft" /* DeleteWordLeft */,
  "workbench.action.terminal.deleteWordRight" /* DeleteWordRight */,
  "workbench.action.terminal.focusNextPane" /* FocusNextPane */,
  "workbench.action.terminal.focusNext" /* FocusNext */,
  "workbench.action.terminal.focusPreviousPane" /* FocusPreviousPane */,
  "workbench.action.terminal.focusPrevious" /* FocusPrevious */,
  "workbench.action.terminal.focus" /* Focus */,
  "workbench.action.terminal.sizeToContentWidth" /* SizeToContentWidth */,
  "workbench.action.terminal.kill" /* Kill */,
  "workbench.action.terminal.killEditor" /* KillEditor */,
  "workbench.action.terminal.moveToEditor" /* MoveToEditor */,
  "workbench.action.terminal.moveToLineEnd" /* MoveToLineEnd */,
  "workbench.action.terminal.moveToLineStart" /* MoveToLineStart */,
  "workbench.action.terminal.moveToTerminalPanel" /* MoveToTerminalPanel */,
  "workbench.action.terminal.newInActiveWorkspace" /* NewInActiveWorkspace */,
  "workbench.action.terminal.new" /* New */,
  "workbench.action.terminal.newInNewWindow" /* NewInNewWindow */,
  "workbench.action.terminal.paste" /* Paste */,
  "workbench.action.terminal.pastePwsh" /* PastePwsh */,
  "workbench.action.terminal.pasteSelection" /* PasteSelection */,
  "workbench.action.terminal.resizePaneDown" /* ResizePaneDown */,
  "workbench.action.terminal.resizePaneLeft" /* ResizePaneLeft */,
  "workbench.action.terminal.resizePaneRight" /* ResizePaneRight */,
  "workbench.action.terminal.resizePaneUp" /* ResizePaneUp */,
  "workbench.action.terminal.runActiveFile" /* RunActiveFile */,
  "workbench.action.terminal.runSelectedText" /* RunSelectedText */,
  "workbench.action.terminal.scrollDown" /* ScrollDownLine */,
  "workbench.action.terminal.scrollDownPage" /* ScrollDownPage */,
  "workbench.action.terminal.scrollToBottom" /* ScrollToBottom */,
  "workbench.action.terminal.scrollToNextCommand" /* ScrollToNextCommand */,
  "workbench.action.terminal.scrollToPreviousCommand" /* ScrollToPreviousCommand */,
  "workbench.action.terminal.scrollToTop" /* ScrollToTop */,
  "workbench.action.terminal.scrollUp" /* ScrollUpLine */,
  "workbench.action.terminal.scrollUpPage" /* ScrollUpPage */,
  "workbench.action.terminal.sendSequence" /* SendSequence */,
  "workbench.action.terminal.selectAll" /* SelectAll */,
  "workbench.action.terminal.selectToNextCommand" /* SelectToNextCommand */,
  "workbench.action.terminal.selectToNextLine" /* SelectToNextLine */,
  "workbench.action.terminal.selectToPreviousCommand" /* SelectToPreviousCommand */,
  "workbench.action.terminal.selectToPreviousLine" /* SelectToPreviousLine */,
  "workbench.action.terminal.splitInActiveWorkspace" /* SplitInActiveWorkspace */,
  "workbench.action.terminal.split" /* Split */,
  "workbench.action.terminal.toggleTerminal" /* Toggle */,
  "workbench.action.terminal.focusHover" /* FocusHover */,
  AccessibilityCommandId.OpenAccessibilityHelp,
  "workbench.action.terminal.stopVoice" /* StopVoice */,
  "workbench.action.terminal.sendSignal" /* SendSignal */,
  "workbench.action.tasks.rerunForActiveTerminal",
  "editor.action.toggleTabFocusMode",
  "notifications.hideList",
  "notifications.hideToasts",
  "workbench.action.closeQuickOpen",
  "workbench.action.quickOpen",
  "workbench.action.quickOpenPreviousEditor",
  "workbench.action.showCommands",
  "workbench.action.tasks.build",
  "workbench.action.tasks.restartTask",
  "workbench.action.tasks.runTask",
  "workbench.action.tasks.reRunTask",
  "workbench.action.tasks.showLog",
  "workbench.action.tasks.showTasks",
  "workbench.action.tasks.terminate",
  "workbench.action.tasks.test",
  "workbench.action.toggleFullScreen",
  "workbench.action.terminal.focusAtIndex1",
  "workbench.action.terminal.focusAtIndex2",
  "workbench.action.terminal.focusAtIndex3",
  "workbench.action.terminal.focusAtIndex4",
  "workbench.action.terminal.focusAtIndex5",
  "workbench.action.terminal.focusAtIndex6",
  "workbench.action.terminal.focusAtIndex7",
  "workbench.action.terminal.focusAtIndex8",
  "workbench.action.terminal.focusAtIndex9",
  "workbench.action.focusSecondEditorGroup",
  "workbench.action.focusThirdEditorGroup",
  "workbench.action.focusFourthEditorGroup",
  "workbench.action.focusFifthEditorGroup",
  "workbench.action.focusSixthEditorGroup",
  "workbench.action.focusSeventhEditorGroup",
  "workbench.action.focusEighthEditorGroup",
  "workbench.action.focusNextPart",
  "workbench.action.focusPreviousPart",
  "workbench.action.nextPanelView",
  "workbench.action.previousPanelView",
  "workbench.action.nextSideBarView",
  "workbench.action.previousSideBarView",
  "workbench.action.debug.disconnect",
  "workbench.action.debug.start",
  "workbench.action.debug.stop",
  "workbench.action.debug.run",
  "workbench.action.debug.restart",
  "workbench.action.debug.continue",
  "workbench.action.debug.pause",
  "workbench.action.debug.stepInto",
  "workbench.action.debug.stepOut",
  "workbench.action.debug.stepOver",
  "sessions.goBack",
  "sessions.goForward",
  "sessions.focusActiveSession",
  "sessions.focusSessionInGrid1",
  "sessions.focusSessionInGrid2",
  "sessions.focusSessionInGrid3",
  "sessions.focusSessionInGrid4",
  "sessions.focusSessionInGrid5",
  "sessions.focusSessionInGrid6",
  "sessions.focusSessionInGrid7",
  "sessions.focusSessionInGrid8",
  "sessions.focusSessionInGrid9",
  "sessionsViewPane.navigatePreviousSession",
  "sessionsViewPane.navigateNextSession",
  "workbench.action.nextEditor",
  "workbench.action.previousEditor",
  "workbench.action.nextEditorInGroup",
  "workbench.action.previousEditorInGroup",
  "workbench.action.openNextRecentlyUsedEditor",
  "workbench.action.openPreviousRecentlyUsedEditor",
  "workbench.action.openNextRecentlyUsedEditorInGroup",
  "workbench.action.openPreviousRecentlyUsedEditorInGroup",
  "workbench.action.quickOpenPreviousRecentlyUsedEditor",
  "workbench.action.quickOpenLeastRecentlyUsedEditor",
  "workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup",
  "workbench.action.quickOpenLeastRecentlyUsedEditorInGroup",
  "workbench.action.focusActiveEditorGroup",
  "workbench.action.focusFirstEditorGroup",
  "workbench.action.focusLastEditorGroup",
  "workbench.action.firstEditorInGroup",
  "workbench.action.lastEditorInGroup",
  "workbench.action.navigateUp",
  "workbench.action.navigateDown",
  "workbench.action.navigateRight",
  "workbench.action.navigateLeft",
  "workbench.action.togglePanel",
  "workbench.action.quickOpenView",
  "workbench.action.toggleMaximizedPanel",
  "workbench.action.zoomIn",
  "workbench.action.zoomOut",
  "workbench.action.zoomReset",
  "notification.acceptPrimaryAction",
  "runCommands",
  "workbench.action.terminal.chat.start",
  "workbench.action.terminal.chat.close",
  "workbench.action.terminal.chat.discard",
  "workbench.action.terminal.chat.makeRequest",
  "workbench.action.terminal.chat.cancel",
  "workbench.action.terminal.chat.feedbackHelpful",
  "workbench.action.terminal.chat.feedbackUnhelpful",
  "workbench.action.terminal.chat.feedbackReportIssue",
  "workbench.action.terminal.chat.runCommand",
  "workbench.action.terminal.chat.insertCommand",
  "workbench.action.terminal.chat.viewInChat",
  ...defaultTerminalContribCommandsToSkipShell
];
const terminalContributionsDescriptor = {
  extensionPoint: "terminal",
  defaultExtensionKind: ["workspace"],
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      for (const profileContrib of contrib.profiles ?? []) {
        yield `onTerminalProfile:${profileContrib.id}`;
      }
    }
  },
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.terminal", "Contributes terminal functionality."),
    type: "object",
    properties: {
      profiles: {
        type: "array",
        description: nls.localize("vscode.extension.contributes.terminal.profiles", "Defines additional terminal profiles that the user can create."),
        items: {
          type: "object",
          required: ["id", "title"],
          defaultSnippets: [{
            body: {
              id: "$1",
              title: "$2"
            }
          }],
          properties: {
            id: {
              description: nls.localize("vscode.extension.contributes.terminal.profiles.id", "The ID of the terminal profile provider."),
              type: "string"
            },
            title: {
              description: nls.localize("vscode.extension.contributes.terminal.profiles.title", "Title for this terminal profile."),
              type: "string"
            },
            icon: {
              description: nls.localize("vscode.extension.contributes.terminal.types.icon", "A codicon, URI, or light and dark URIs to associate with this terminal type."),
              anyOf: [
                {
                  type: "string"
                },
                {
                  type: "object",
                  properties: {
                    light: {
                      description: nls.localize("vscode.extension.contributes.terminal.types.icon.light", "Icon path when a light theme is used"),
                      type: "string"
                    },
                    dark: {
                      description: nls.localize("vscode.extension.contributes.terminal.types.icon.dark", "Icon path when a dark theme is used"),
                      type: "string"
                    }
                  }
                }
              ]
            },
            titleTemplate: {
              description: nls.localize("vscode.extension.contributes.terminal.profiles.titleTemplate", "A title template string for the terminal tab. Supports variables like ${sequence}, ${process}, ${cwd}, etc. Overrides the default terminal.integrated.tabs.title setting for terminals created with this profile."),
              type: "string"
            }
          }
        }
      },
      completionProviders: {
        type: "array",
        description: nls.localize("vscode.extension.contributes.terminal.completionProviders", "Defines terminal completion providers that will be registered when the extension activates."),
        items: {
          type: "object",
          required: ["id"],
          defaultSnippets: [{
            body: {
              id: "$1",
              description: "$2"
            }
          }],
          properties: {
            description: {
              description: nls.localize("vscode.extension.contributes.terminal.completionProviders.description", "A description of what the completion provider does. This will be shown in the settings UI."),
              type: "string"
            }
          }
        }
      }
    }
  }
};
export {
  DEFAULT_BOLD_FONT_WEIGHT,
  DEFAULT_COMMANDS_TO_SKIP_SHELL,
  DEFAULT_FONT_WEIGHT,
  DEFAULT_LETTER_SPACING,
  DEFAULT_LINE_HEIGHT,
  ITerminalProfileResolverService,
  ITerminalProfileService,
  MAXIMUM_FONT_WEIGHT,
  MINIMUM_FONT_WEIGHT,
  MINIMUM_LETTER_SPACING,
  ProcessState,
  QUICK_LAUNCH_PROFILE_CHOICE,
  SUGGESTIONS_FONT_WEIGHT,
  TERMINAL_CONFIG_SECTION,
  TERMINAL_CREATION_COMMANDS,
  TERMINAL_VIEW_ID,
  TerminalCommandId,
  isTerminalProcessManager,
  terminalContributionsDescriptor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxjb21tb25cXHRlcm1pbmFsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc0xpbnV4LCBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVNlcmlhbGl6ZWRDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSwgSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSU1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgSUNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlT3B0aW9ucywgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZSwgSUZpeGVkVGVybWluYWxEaW1lbnNpb25zLCBJVGVybWluYWxMYXVuY2hSZXN1bHQsIElQcm9jZXNzRGF0YUV2ZW50LCBJUHJvY2Vzc1Byb3BlcnR5LCBJUHJvY2Vzc1Byb3BlcnR5TWFwLCBJUHJvY2Vzc1JlYWR5RXZlbnQsIElQcm9jZXNzUmVhZHlXaW5kb3dzUHR5LCBJU2hlbGxMYXVuY2hDb25maWcsIElUZXJtaW5hbEJhY2tlbmQsIElUZXJtaW5hbENvbnRyaWJ1dGlvbnMsIElUZXJtaW5hbEVudmlyb25tZW50LCBJVGVybWluYWxMYXVuY2hFcnJvciwgSVRlcm1pbmFsUHJvZmlsZSwgSVRlcm1pbmFsUHJvZmlsZU9iamVjdCwgSVRlcm1pbmFsVGFiQWN0aW9uLCBQcm9jZXNzUHJvcGVydHlUeXBlLCBUZXJtaW5hbEljb24sIFRlcm1pbmFsTG9jYXRpb25Db25maWdWYWx1ZSwgVGl0bGVFdmVudFNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFZhcmlhYmxlSW5mbyB9IGZyb20gJy4vZW52aXJvbm1lbnRWYXJpYWJsZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUG9pbnREZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRUZXJtaW5hbENvbnRyaWJDb21tYW5kc1RvU2tpcFNoZWxsIH0gZnJvbSAnLi4vdGVybWluYWxDb250cmliRXhwb3J0cy5qcyc7XG5pbXBvcnQgdHlwZSB7IFNpbmdsZU9yTWFueSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGNvbnN0IFRFUk1JTkFMX1ZJRVdfSUQgPSAndGVybWluYWwnO1xuXG5leHBvcnQgY29uc3QgVEVSTUlOQUxfQ1JFQVRJT05fQ09NTUFORFMgPSBbJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwudG9nZ2xlVGVybWluYWwnLCAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXcnLCAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVQYW5lbCcsICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzJ107XG5cbmV4cG9ydCBjb25zdCBURVJNSU5BTF9DT05GSUdfU0VDVElPTiA9ICd0ZXJtaW5hbC5pbnRlZ3JhdGVkJztcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTEVUVEVSX1NQQUNJTkcgPSAwO1xuZXhwb3J0IGNvbnN0IE1JTklNVU1fTEVUVEVSX1NQQUNJTkcgPSAtNTtcbi8vIEhBQ0s6IE9uIExpbnV4IGl0J3MgY29tbW9uIGZvciBmb250cyB0byBpbmNsdWRlIGFuIHVuZGVybGluZSB0aGF0IGlzIHJlbmRlcmVkIGxvd2VyIHRoYW4gdGhlXG4vLyBib3R0b20gb2YgdGhlIGNlbGwgd2hpY2ggY2F1c2VzIGl0IHRvIGJlIGN1dCBvZmYgZHVlIHRvIGBvdmVyZmxvdzpoaWRkZW5gIGluIHRoZSBET00gcmVuZGVyZXIuXG4vLyBTZWU6XG4vLyAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMTE5MzNcbi8vIC0gaHR0cHM6Ly9naXRodWIuY29tL3h0ZXJtanMveHRlcm0uanMvaXNzdWVzLzQwNjdcbmV4cG9ydCBjb25zdCBERUZBVUxUX0xJTkVfSEVJR0hUID0gaXNMaW51eCA/IDEuMSA6IDE7XG5cbmV4cG9ydCBjb25zdCBNSU5JTVVNX0ZPTlRfV0VJR0hUID0gMTtcbmV4cG9ydCBjb25zdCBNQVhJTVVNX0ZPTlRfV0VJR0hUID0gMTAwMDtcbmV4cG9ydCBjb25zdCBERUZBVUxUX0ZPTlRfV0VJR0hUID0gJ25vcm1hbCc7XG5leHBvcnQgY29uc3QgREVGQVVMVF9CT0xEX0ZPTlRfV0VJR0hUID0gJ2JvbGQnO1xuZXhwb3J0IGNvbnN0IFNVR0dFU1RJT05TX0ZPTlRfV0VJR0hUID0gWydub3JtYWwnLCAnYm9sZCcsICcxMDAnLCAnMjAwJywgJzMwMCcsICc0MDAnLCAnNTAwJywgJzYwMCcsICc3MDAnLCAnODAwJywgJzkwMCddO1xuXG5leHBvcnQgY29uc3QgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlPigndGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlJyk7XG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgZGVmYXVsdFByb2ZpbGVOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBpY29uIG9mIGEgc2hlbGwgbGF1bmNoIGNvbmZpZyBpZiB0aGlzIHdpbGwgdXNlIHRoZSBkZWZhdWx0IHByb2ZpbGVcblx0ICovXG5cdHJlc29sdmVJY29uKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiB2b2lkO1xuXHRyZXNvbHZlU2hlbGxMYXVuY2hDb25maWcoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZywgb3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRnZXREZWZhdWx0UHJvZmlsZShvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZT47XG5cdGdldERlZmF1bHRTaGVsbChvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8c3RyaW5nPjtcblx0Z2V0RGVmYXVsdFNoZWxsQXJncyhvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8U2luZ2xlT3JNYW55PHN0cmluZz4+O1xuXHRnZXREZWZhdWx0SWNvbigpOiBUZXJtaW5hbEljb24gJiBUaGVtZUljb247XG5cdGdldEVudmlyb25tZW50KHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50Pjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVnaXN0ZXJDb250cmlidXRlZFByb2ZpbGVBcmdzIHtcblx0ZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nOyBpZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nOyBvcHRpb25zOiBJQ3JlYXRlQ29udHJpYnV0ZWRUZXJtaW5hbFByb2ZpbGVPcHRpb25zOyB0aXRsZVRlbXBsYXRlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVRlcm1pbmFsUHJvZmlsZVNlcnZpY2U+KCd0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlJyk7XG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBhdmFpbGFibGVQcm9maWxlczogSVRlcm1pbmFsUHJvZmlsZVtdO1xuXHRyZWFkb25seSBjb250cmlidXRlZFByb2ZpbGVzOiBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlW107XG5cdHJlYWRvbmx5IHByb2ZpbGVzUmVhZHk6IFByb21pc2U8dm9pZD47XG5cdGdldFBsYXRmb3JtS2V5KCk6IFByb21pc2U8c3RyaW5nPjtcblx0cmVmcmVzaEF2YWlsYWJsZVByb2ZpbGVzKCk6IHZvaWQ7XG5cdGdldERlZmF1bHRQcm9maWxlTmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldERlZmF1bHRQcm9maWxlKG9zPzogT3BlcmF0aW5nU3lzdGVtKTogSVRlcm1pbmFsUHJvZmlsZSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBdmFpbGFibGVQcm9maWxlczogRXZlbnQ8SVRlcm1pbmFsUHJvZmlsZVtdPjtcblx0Z2V0Q29udHJpYnV0ZWREZWZhdWx0UHJvZmlsZShzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnKTogUHJvbWlzZTxJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlIHwgdW5kZWZpbmVkPjtcblx0cmVnaXN0ZXJDb250cmlidXRlZFByb2ZpbGUoYXJnczogSVJlZ2lzdGVyQ29udHJpYnV0ZWRQcm9maWxlQXJncyk6IFByb21pc2U8dm9pZD47XG5cdHJlZ2lzdGVySW50ZXJuYWxDb250cmlidXRlZFByb2ZpbGUocHJvZmlsZTogSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZSk6IElEaXNwb3NhYmxlO1xuXHRnZXRDb250cmlidXRlZFByb2ZpbGVQcm92aWRlcihleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiBJVGVybWluYWxQcm9maWxlUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdHJlZ2lzdGVyVGVybWluYWxQcm9maWxlUHJvdmlkZXIoZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBpZDogc3RyaW5nLCBwcm9maWxlUHJvdmlkZXI6IElUZXJtaW5hbFByb2ZpbGVQcm92aWRlcik6IElEaXNwb3NhYmxlO1xuXHQvKipcblx0ICogT3ZlcnJpZGVzIHRoZSBkZWZhdWx0IGNvbnRyaWJ1dGVkIHRlcm1pbmFsIHByb2ZpbGUuIFdoZW4gc2V0LFxuXHQgKiB7QGxpbmsgZ2V0Q29udHJpYnV0ZWREZWZhdWx0UHJvZmlsZX0gcmV0dXJucyB0aGUgbWF0Y2hpbmcgcHJvZmlsZVxuXHQgKiByZWdhcmRsZXNzIG9mIHRoZSB1c2VyJ3MgY29uZmlndXJhdGlvbi4gRGlzcG9zZSB0aGUgcmV0dXJuZWRcblx0ICogZGlzcG9zYWJsZSB0byByZW1vdmUgdGhlIG92ZXJyaWRlLlxuXHQgKi9cblx0b3ZlcnJpZGVEZWZhdWx0UHJvZmlsZShleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmcsIGlkOiBzdHJpbmcpOiBJRGlzcG9zYWJsZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxQcm9maWxlUHJvdmlkZXIge1xuXHRjcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZShvcHRpb25zOiBJQ3JlYXRlQ29udHJpYnV0ZWRUZXJtaW5hbFByb2ZpbGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyB7XG5cdHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRvczogT3BlcmF0aW5nU3lzdGVtO1xuXHRhbGxvd0F1dG9tYXRpb25TaGVsbD86IGJvb2xlYW47XG5cdGFsbG93QWdlbnRIb3N0U2hlbGw/OiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBGb250V2VpZ2h0ID0gJ25vcm1hbCcgfCAnYm9sZCcgfCBudW1iZXI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsUHJvZmlsZXMge1xuXHRsaW51eDogeyBba2V5OiBzdHJpbmddOiBJVGVybWluYWxQcm9maWxlT2JqZWN0IH07XG5cdG9zeDogeyBba2V5OiBzdHJpbmddOiBJVGVybWluYWxQcm9maWxlT2JqZWN0IH07XG5cdHdpbmRvd3M6IHsgW2tleTogc3RyaW5nXTogSVRlcm1pbmFsUHJvZmlsZU9iamVjdCB9O1xufVxuXG5leHBvcnQgdHlwZSBDb25maXJtT25LaWxsID0gJ25ldmVyJyB8ICdhbHdheXMnIHwgJ2VkaXRvcicgfCAncGFuZWwnO1xuZXhwb3J0IHR5cGUgQ29uZmlybU9uRXhpdCA9ICduZXZlcicgfCAnYWx3YXlzJyB8ICdoYXNDaGlsZFByb2Nlc3Nlcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBsZXRlVGVybWluYWxDb25maWd1cmF0aW9uIHtcblx0J3Rlcm1pbmFsLmludGVncmF0ZWQuZW52LndpbmRvd3MnOiBJVGVybWluYWxFbnZpcm9ubWVudDtcblx0J3Rlcm1pbmFsLmludGVncmF0ZWQuZW52Lm9zeCc6IElUZXJtaW5hbEVudmlyb25tZW50O1xuXHQndGVybWluYWwuaW50ZWdyYXRlZC5lbnYubGludXgnOiBJVGVybWluYWxFbnZpcm9ubWVudDtcblx0J3Rlcm1pbmFsLmludGVncmF0ZWQuY3dkJzogc3RyaW5nO1xuXHQndGVybWluYWwuaW50ZWdyYXRlZC5kZXRlY3RMb2NhbGUnOiAnYXV0bycgfCAnb2ZmJyB8ICdvbic7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsQ29uZmlndXJhdGlvbiB7XG5cdHNoZWxsOiB7XG5cdFx0bGludXg6IHN0cmluZyB8IG51bGw7XG5cdFx0b3N4OiBzdHJpbmcgfCBudWxsO1xuXHRcdHdpbmRvd3M6IHN0cmluZyB8IG51bGw7XG5cdH07XG5cdGF1dG9tYXRpb25TaGVsbDoge1xuXHRcdGxpbnV4OiBzdHJpbmcgfCBudWxsO1xuXHRcdG9zeDogc3RyaW5nIHwgbnVsbDtcblx0XHR3aW5kb3dzOiBzdHJpbmcgfCBudWxsO1xuXHR9O1xuXHRzaGVsbEFyZ3M6IHtcblx0XHRsaW51eDogc3RyaW5nW107XG5cdFx0b3N4OiBzdHJpbmdbXTtcblx0XHR3aW5kb3dzOiBzdHJpbmdbXTtcblx0fTtcblx0cHJvZmlsZXM6IElUZXJtaW5hbFByb2ZpbGVzO1xuXHRkZWZhdWx0UHJvZmlsZToge1xuXHRcdGxpbnV4OiBzdHJpbmcgfCBudWxsO1xuXHRcdG9zeDogc3RyaW5nIHwgbnVsbDtcblx0XHR3aW5kb3dzOiBzdHJpbmcgfCBudWxsO1xuXHR9O1xuXHR1c2VXc2xQcm9maWxlczogYm9vbGVhbjtcblx0YWx0Q2xpY2tNb3Zlc0N1cnNvcjogYm9vbGVhbjtcblx0bWFjT3B0aW9uSXNNZXRhOiBib29sZWFuO1xuXHRtYWNPcHRpb25DbGlja0ZvcmNlc1NlbGVjdGlvbjogYm9vbGVhbjtcblx0Z3B1QWNjZWxlcmF0aW9uOiAnYXV0bycgfCAnb24nIHwgJ29mZic7XG5cdHJpZ2h0Q2xpY2tCZWhhdmlvcjogJ2RlZmF1bHQnIHwgJ2NvcHlQYXN0ZScgfCAncGFzdGUnIHwgJ3NlbGVjdFdvcmQnIHwgJ25vdGhpbmcnO1xuXHRtaWRkbGVDbGlja0JlaGF2aW9yOiAnZGVmYXVsdCcgfCAncGFzdGUnO1xuXHRjdXJzb3JCbGlua2luZzogYm9vbGVhbjtcblx0dGV4dEJsaW5raW5nOiBib29sZWFuO1xuXHRjdXJzb3JTdHlsZTogJ2Jsb2NrJyB8ICd1bmRlcmxpbmUnIHwgJ2xpbmUnO1xuXHRjdXJzb3JTdHlsZUluYWN0aXZlOiAnb3V0bGluZScgfCAnYmxvY2snIHwgJ3VuZGVybGluZScgfCAnbGluZScgfCAnbm9uZSc7XG5cdGN1cnNvcldpZHRoOiBudW1iZXI7XG5cdGRyYXdCb2xkVGV4dEluQnJpZ2h0Q29sb3JzOiBib29sZWFuO1xuXHRmYXN0U2Nyb2xsU2Vuc2l0aXZpdHk6IG51bWJlcjtcblx0Zm9udEZhbWlseTogc3RyaW5nO1xuXHRmb250V2VpZ2h0OiBGb250V2VpZ2h0O1xuXHRmb250V2VpZ2h0Qm9sZDogRm9udFdlaWdodDtcblx0bWluaW11bUNvbnRyYXN0UmF0aW86IG51bWJlcjtcblx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiBudW1iZXI7XG5cdHRhYlN0b3BXaWR0aDogbnVtYmVyO1xuXHRzZW5kS2V5YmluZGluZ3NUb1NoZWxsOiBib29sZWFuO1xuXHRmb250U2l6ZTogbnVtYmVyO1xuXHRsZXR0ZXJTcGFjaW5nOiBudW1iZXI7XG5cdGxpbmVIZWlnaHQ6IG51bWJlcjtcblx0ZGV0ZWN0TG9jYWxlOiAnYXV0bycgfCAnb2ZmJyB8ICdvbic7XG5cdHNjcm9sbGJhY2s6IG51bWJlcjtcblx0Y29tbWFuZHNUb1NraXBTaGVsbDogc3RyaW5nW107XG5cdGFsbG93Q2hvcmRzOiBib29sZWFuO1xuXHRhbGxvd01uZW1vbmljczogYm9vbGVhbjtcblx0Y3dkOiBzdHJpbmc7XG5cdGNvbmZpcm1PbkV4aXQ6IENvbmZpcm1PbkV4aXQ7XG5cdGNvbmZpcm1PbktpbGw6IENvbmZpcm1PbktpbGw7XG5cdGVuYWJsZUJlbGw6IGJvb2xlYW47XG5cdGVudjoge1xuXHRcdGxpbnV4OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuXHRcdG9zeDogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcblx0XHR3aW5kb3dzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuXHR9O1xuXHRlbnZpcm9ubWVudENoYW5nZXNSZWxhdW5jaDogYm9vbGVhbjtcblx0c2hvd0V4aXRBbGVydDogYm9vbGVhbjtcblx0c3BsaXRDd2Q6ICd3b3Jrc3BhY2VSb290JyB8ICdpbml0aWFsJyB8ICdpbmhlcml0ZWQnO1xuXHR3aW5kb3dzVXNlQ29ucHR5RGxsPzogYm9vbGVhbjtcblx0d29yZFNlcGFyYXRvcnM6IHN0cmluZztcblx0ZW5hYmxlRmlsZUxpbmtzOiAnb2ZmJyB8ICdvbicgfCAnbm90UmVtb3RlJztcblx0YWxsb3dlZExpbmtTY2hlbWVzOiBzdHJpbmdbXTtcblx0dW5pY29kZVZlcnNpb246ICc2JyB8ICcxMSc7XG5cdGVuYWJsZVBlcnNpc3RlbnRTZXNzaW9uczogYm9vbGVhbjtcblx0dGFiczoge1xuXHRcdGVuYWJsZWQ6IGJvb2xlYW47XG5cdFx0aGlkZUNvbmRpdGlvbjogJ25ldmVyJyB8ICdzaW5nbGVUZXJtaW5hbCcgfCAnc2luZ2xlR3JvdXAnO1xuXHRcdHNob3dBY3RpdmVUZXJtaW5hbDogJ2Fsd2F5cycgfCAnc2luZ2xlVGVybWluYWwnIHwgJ3NpbmdsZVRlcm1pbmFsT3JOYXJyb3cnIHwgJ3NpbmdsZUdyb3VwJyB8ICduZXZlcic7XG5cdFx0bG9jYXRpb246ICdsZWZ0JyB8ICdyaWdodCc7XG5cdFx0Zm9jdXNNb2RlOiAnc2luZ2xlQ2xpY2snIHwgJ2RvdWJsZUNsaWNrJztcblx0XHR0aXRsZTogc3RyaW5nO1xuXHRcdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdFx0c2VwYXJhdG9yOiBzdHJpbmc7XG5cdFx0YWxsb3dBZ2VudENsaVRpdGxlOiBib29sZWFuO1xuXHR9O1xuXHRiZWxsRHVyYXRpb246IG51bWJlcjtcblx0ZGVmYXVsdExvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uQ29uZmlnVmFsdWU7XG5cdGN1c3RvbUdseXBoczogYm9vbGVhbjtcblx0cGVyc2lzdGVudFNlc3Npb25SZXZpdmVQcm9jZXNzOiAnb25FeGl0JyB8ICdvbkV4aXRBbmRXaW5kb3dDbG9zZScgfCAnbmV2ZXInO1xuXHRpZ25vcmVQcm9jZXNzTmFtZXM6IHN0cmluZ1tdO1xuXHRzaGVsbEludGVncmF0aW9uPzoge1xuXHRcdGVuYWJsZWQ6IGJvb2xlYW47XG5cdFx0ZGVjb3JhdGlvbnNFbmFibGVkOiAnYm90aCcgfCAnZ3V0dGVyJyB8ICdvdmVydmlld1J1bGVyJyB8ICduZXZlcic7XG5cdH07XG5cdGVuYWJsZUltYWdlczogYm9vbGVhbjtcblx0c21vb3RoU2Nyb2xsaW5nOiBib29sZWFuO1xuXHRpZ25vcmVCcmFja2V0ZWRQYXN0ZU1vZGU6IGJvb2xlYW47XG5cdHJlc2NhbGVPdmVybGFwcGluZ0dseXBoczogYm9vbGVhbjtcblx0ZW5hYmxlS2l0dHlLZXlib2FyZFByb3RvY29sOiBib29sZWFuO1xuXHRlbmFibGVXaW4zMklucHV0TW9kZTogYm9vbGVhbjtcblx0Zm9udExpZ2F0dXJlcz86IHtcblx0XHRlbmFibGVkOiBib29sZWFuO1xuXHRcdGZlYXR1cmVTZXR0aW5nczogc3RyaW5nO1xuXHRcdGZhbGxiYWNrTGlnYXR1cmVzOiBzdHJpbmdbXTtcblx0fTtcblx0aGlkZU9uTGFzdENsb3NlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxGb250IHtcblx0Zm9udEZhbWlseTogc3RyaW5nO1xuXHRmb250U2l6ZTogbnVtYmVyO1xuXHRsZXR0ZXJTcGFjaW5nOiBudW1iZXI7XG5cdGxpbmVIZWlnaHQ6IG51bWJlcjtcblx0Y2hhcldpZHRoPzogbnVtYmVyO1xuXHRjaGFySGVpZ2h0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZW1vdGVUZXJtaW5hbEF0dGFjaFRhcmdldCB7XG5cdGlkOiBudW1iZXI7XG5cdHBpZDogbnVtYmVyO1xuXHR0aXRsZTogc3RyaW5nO1xuXHR0aXRsZVNvdXJjZTogVGl0bGVFdmVudFNvdXJjZTtcblx0Y3dkOiBzdHJpbmc7XG5cdHdvcmtzcGFjZUlkOiBzdHJpbmc7XG5cdHdvcmtzcGFjZU5hbWU6IHN0cmluZztcblx0aXNPcnBoYW46IGJvb2xlYW47XG5cdGljb246IFVSSSB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH0gfCB7IGlkOiBzdHJpbmc7IGNvbG9yPzogeyBpZDogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0Y29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Zml4ZWREaW1lbnNpb25zOiBJRml4ZWRUZXJtaW5hbERpbWVuc2lvbnMgfCB1bmRlZmluZWQ7XG5cdHNoZWxsSW50ZWdyYXRpb25Ob25jZTogc3RyaW5nO1xuXHR0YWJBY3Rpb25zPzogSVRlcm1pbmFsVGFiQWN0aW9uW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJlZm9yZVByb2Nlc3NEYXRhRXZlbnQge1xuXHQvKipcblx0ICogVGhlIGRhdGEgb2YgdGhlIGV2ZW50LCB0aGlzIGNhbiBiZSBtb2RpZmllZCBieSB0aGUgZXZlbnQgbGlzdGVuZXIgdG8gY2hhbmdlIHdoYXQgZ2V0cyBzZW50XG5cdCAqIHRvIHRoZSB0ZXJtaW5hbC5cblx0ICovXG5cdGRhdGE6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGVmYXVsdFNoZWxsQW5kQXJnc1JlcXVlc3Qge1xuXHR1c2VBdXRvbWF0aW9uU2hlbGw6IGJvb2xlYW47XG5cdGNhbGxiYWNrOiAoc2hlbGw6IHN0cmluZywgYXJnczogc3RyaW5nW10gfCBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG59XG5cbi8qKiBSZWFkLW9ubHkgcHJvY2VzcyBpbmZvcm1hdGlvbiB0aGF0IGNhbiBhcHBseSB0byBkZXRhY2hlZCB0ZXJtaW5hbHMuICovXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbFByb2Nlc3NJbmZvIHtcblx0cmVhZG9ubHkgcHJvY2Vzc1N0YXRlOiBQcm9jZXNzU3RhdGU7XG5cdHJlYWRvbmx5IHB0eVByb2Nlc3NSZWFkeTogUHJvbWlzZTx2b2lkPjtcblx0cmVhZG9ubHkgc2hlbGxQcm9jZXNzSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9zOiBPcGVyYXRpbmdTeXN0ZW0gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHVzZXJIb21lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGluaXRpYWxDd2Q6IHN0cmluZztcblx0cmVhZG9ubHkgZW52aXJvbm1lbnRWYXJpYWJsZUluZm86IElFbnZpcm9ubWVudFZhcmlhYmxlSW5mbyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcGVyc2lzdGVudFByb2Nlc3NJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzaG91bGRQZXJzaXN0OiBib29sZWFuO1xuXHRyZWFkb25seSBoYXNXcml0dGVuRGF0YTogYm9vbGVhbjtcblx0cmVhZG9ubHkgaGFzQ2hpbGRQcm9jZXNzZXM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGJhY2tlbmQ6IElUZXJtaW5hbEJhY2tlbmQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllczogSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlO1xuXHRyZWFkb25seSBzaGVsbEludGVncmF0aW9uTm9uY2U6IHN0cmluZztcblx0cmVhZG9ubHkgZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb246IElNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNvbnN0IGlzVGVybWluYWxQcm9jZXNzTWFuYWdlciA9ICh0OiBJVGVybWluYWxQcm9jZXNzSW5mbyB8IElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyKTogdCBpcyBJVGVybWluYWxQcm9jZXNzTWFuYWdlciA9PiB0eXBlb2YgKHQgYXMgSVRlcm1pbmFsUHJvY2Vzc01hbmFnZXIpLndyaXRlID09PSAnZnVuY3Rpb24nO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyIGV4dGVuZHMgSURpc3Bvc2FibGUsIElUZXJtaW5hbFByb2Nlc3NJbmZvIHtcblx0cmVhZG9ubHkgcHJvY2Vzc1RyYWl0czogSVByb2Nlc3NSZWFkeUV2ZW50IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBwcm9jZXNzUmVhZHlUaW1lc3RhbXA6IG51bWJlcjtcblxuXHRyZWFkb25seSBvblB0eURpc2Nvbm5lY3Q6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvblB0eVJlY29ubmVjdDogRXZlbnQ8dm9pZD47XG5cblx0cmVhZG9ubHkgb25Qcm9jZXNzUmVhZHk6IEV2ZW50PElQcm9jZXNzUmVhZHlFdmVudD47XG5cdHJlYWRvbmx5IG9uQmVmb3JlUHJvY2Vzc0RhdGE6IEV2ZW50PElCZWZvcmVQcm9jZXNzRGF0YUV2ZW50Pjtcblx0cmVhZG9ubHkgb25Qcm9jZXNzRGF0YTogRXZlbnQ8SVByb2Nlc3NEYXRhRXZlbnQ+O1xuXHRyZWFkb25seSBvblByb2Nlc3NSZXBsYXlDb21wbGV0ZTogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRW52aXJvbm1lbnRWYXJpYWJsZUluZm9DaGFuZ2VkOiBFdmVudDxJRW52aXJvbm1lbnRWYXJpYWJsZUluZm8+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb3BlcnR5OiBFdmVudDxJUHJvY2Vzc1Byb3BlcnR5Pjtcblx0cmVhZG9ubHkgb25Qcm9jZXNzRXhpdDogRXZlbnQ8bnVtYmVyIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgb25SZXN0b3JlQ29tbWFuZHM6IEV2ZW50PElTZXJpYWxpemVkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk+O1xuXG5cdGRpc3Bvc2UoaW1tZWRpYXRlPzogYm9vbGVhbik6IHZvaWQ7XG5cdGRldGFjaEZyb21Qcm9jZXNzKGZvcmNlUGVyc2lzdD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+O1xuXHRjcmVhdGVQcm9jZXNzKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsIGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyKTogUHJvbWlzZTxJVGVybWluYWxMYXVuY2hFcnJvciB8IElUZXJtaW5hbExhdW5jaFJlc3VsdCB8IHVuZGVmaW5lZD47XG5cdHJlbGF1bmNoKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsIGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyLCByZXNldDogYm9vbGVhbik6IFByb21pc2U8SVRlcm1pbmFsTGF1bmNoRXJyb3IgfCBJVGVybWluYWxMYXVuY2hSZXN1bHQgfCB1bmRlZmluZWQ+O1xuXHR3cml0ZShkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZW5kU2lnbmFsKHNpZ25hbDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0c2V0RGltZW5zaW9ucyhjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgc3luYz86IHVuZGVmaW5lZCwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXREaW1lbnNpb25zKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyLCBzeW5jOiBmYWxzZSwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXREaW1lbnNpb25zKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyLCBzeW5jOiB0cnVlLCBwaXhlbFdpZHRoPzogbnVtYmVyLCBwaXhlbEhlaWdodD86IG51bWJlcik6IHZvaWQ7XG5cdGNsZWFyQnVmZmVyKCk6IFByb21pc2U8dm9pZD47XG5cdHNldFVuaWNvZGVWZXJzaW9uKHZlcnNpb246ICc2JyB8ICcxMScpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXROZXh0Q29tbWFuZElkKGNvbW1hbmRMaW5lOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0YWNrbm93bGVkZ2VEYXRhRXZlbnQoY2hhckNvdW50OiBudW1iZXIpOiB2b2lkO1xuXHRwcm9jZXNzQmluYXJ5KGRhdGE6IHN0cmluZyk6IHZvaWQ7XG5cblx0cmVmcmVzaFByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPih0eXBlOiBUKTogUHJvbWlzZTxJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdPjtcblx0dXBkYXRlUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KHByb3BlcnR5OiBULCB2YWx1ZTogSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXSk6IFByb21pc2U8dm9pZD47XG5cdGdldEJhY2tlbmRPUygpOiBQcm9taXNlPE9wZXJhdGluZ1N5c3RlbT47XG5cdGZyZWVQb3J0S2lsbFByb2Nlc3MocG9ydDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUHJvY2Vzc1N0YXRlIHtcblx0Ly8gVGhlIHByb2Nlc3MgaGFzIG5vdCBiZWVuIGluaXRpYWxpemVkIHlldC5cblx0VW5pbml0aWFsaXplZCA9IDEsXG5cdC8vIFRoZSBwcm9jZXNzIGlzIGN1cnJlbnRseSBsYXVuY2hpbmcsIHRoZSBwcm9jZXNzIGlzIG1hcmtlZCBhcyBsYXVuY2hpbmdcblx0Ly8gZm9yIGEgc2hvcnQgZHVyYXRpb24gYWZ0ZXIgYmVpbmcgY3JlYXRlZCBhbmQgaXMgaGVscGZ1bCB0byBpbmRpY2F0ZVxuXHQvLyB3aGV0aGVyIHRoZSBwcm9jZXNzIGRpZWQgYXMgYSByZXN1bHQgb2YgYmFkIHNoZWxsIGFuZCBhcmdzLlxuXHRMYXVuY2hpbmcgPSAyLFxuXHQvLyBUaGUgcHJvY2VzcyBpcyBydW5uaW5nIG5vcm1hbGx5LlxuXHRSdW5uaW5nID0gMyxcblx0Ly8gVGhlIHByb2Nlc3Mgd2FzIGtpbGxlZCBkdXJpbmcgbGF1bmNoLCBsaWtlbHkgYXMgYSByZXN1bHQgb2YgYmFkIHNoZWxsIGFuZFxuXHQvLyBhcmdzLlxuXHRLaWxsZWREdXJpbmdMYXVuY2ggPSA0LFxuXHQvLyBUaGUgcHJvY2VzcyB3YXMga2lsbGVkIGJ5IHRoZSB1c2VyICh0aGUgZXZlbnQgb3JpZ2luYXRlZCBmcm9tIFZTIENvZGUpLlxuXHRLaWxsZWRCeVVzZXIgPSA1LFxuXHQvLyBUaGUgcHJvY2VzcyB3YXMga2lsbGVkIGJ5IGl0c2VsZiwgZm9yIGV4YW1wbGUgdGhlIHNoZWxsIGNyYXNoZWQgb3IgYGV4aXRgXG5cdC8vIHdhcyBydW4uXG5cdEtpbGxlZEJ5UHJvY2VzcyA9IDZcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5IGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBpbnN0YW5jZUlkOiBudW1iZXI7XG5cblx0ZW1pdERhdGEoZGF0YTogc3RyaW5nKTogdm9pZDtcblx0ZW1pdFByb2Nlc3NQcm9wZXJ0eShwcm9wZXJ0eTogSVByb2Nlc3NQcm9wZXJ0eSk6IHZvaWQ7XG5cdGVtaXRSZWFkeShwaWQ6IG51bWJlciwgY3dkOiBzdHJpbmcsIHdpbmRvd3NQdHk6IElQcm9jZXNzUmVhZHlXaW5kb3dzUHR5IHwgdW5kZWZpbmVkKTogdm9pZDtcblx0ZW1pdEV4aXQoZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0cmVhZG9ubHkgb25JbnB1dDogRXZlbnQ8c3RyaW5nPjtcblx0cmVhZG9ubHkgb25CaW5hcnk6IEV2ZW50PHN0cmluZz47XG5cdHJlYWRvbmx5IG9uUmVzaXplOiBFdmVudDx7IGNvbHM6IG51bWJlcjsgcm93czogbnVtYmVyIH0+O1xuXHRyZWFkb25seSBvbkFja25vd2xlZGdlRGF0YUV2ZW50OiBFdmVudDxudW1iZXI+O1xuXHRyZWFkb25seSBvblNodXRkb3duOiBFdmVudDxib29sZWFuPjtcblx0cmVhZG9ubHkgb25SZXF1ZXN0SW5pdGlhbEN3ZDogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uUmVxdWVzdEN3ZDogRXZlbnQ8dm9pZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0YXJ0RXh0ZW5zaW9uVGVybWluYWxSZXF1ZXN0IHtcblx0cHJveHk6IElUZXJtaW5hbFByb2Nlc3NFeHRIb3N0UHJveHk7XG5cdGNvbHM6IG51bWJlcjtcblx0cm93czogbnVtYmVyO1xuXHRjYWxsYmFjazogKGVycm9yOiBJVGVybWluYWxMYXVuY2hFcnJvciB8IHVuZGVmaW5lZCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxTdGF0dXMge1xuXHQvKiogQW4gaW50ZXJuYWwgc3RyaW5nIElEIHVzZWQgdG8gaWRlbnRpZnkgdGhlIHN0YXR1cy4gKi9cblx0aWQ6IHN0cmluZztcblx0LyoqXG5cdCAqIFRoZSBzZXZlcml0eSBvZiB0aGUgc3RhdHVzLCB0aGlzIGRlZmluZXMgYm90aCB0aGUgY29sb3IgYW5kIGhvdyBsaWtlbHkgdGhlIHN0YXR1cyBpcyB0byBiZVxuXHQgKiB0aGUgXCJwcmltYXJ5IHN0YXR1c1wiLlxuXHQgKi9cblx0c2V2ZXJpdHk6IFNldmVyaXR5O1xuXHQvKipcblx0ICogQW4gaWNvbiByZXByZXNlbnRpbmcgdGhlIHN0YXR1cywgaWYgdGhpcyBpcyBub3Qgc3BlY2lmaWVkIGl0IHdpbGwgbm90IHNob3cgdXAgb24gdGhlIHRlcm1pbmFsXG5cdCAqIHRhYiBhbmQgd2lsbCB1c2UgdGhlIGdlbmVyaWMgYGluZm9gIGljb24gd2hlbiBob3ZlcmluZy5cblx0ICovXG5cdGljb24/OiBUaGVtZUljb247XG5cdC8qKlxuXHQgKiBXaGF0IHRvIHNob3cgZm9yIHRoaXMgc3RhdHVzIGluIHRoZSB0ZXJtaW5hbCdzIGhvdmVyLlxuXHQgKi9cblx0dG9vbHRpcD86IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIFdoYXQgdG8gc2hvdyBmb3IgdGhpcyBzdGF0dXMgaW4gdGhlIHRlcm1pbmFsJ3MgaG92ZXIgd2hlbiBkZXRhaWxzIGFyZSB0b2dnbGVkLlxuXHQgKi9cblx0ZGV0YWlsZWRUb29sdGlwPzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogQWN0aW9ucyB0byBleHBvc2Ugb24gaG92ZXIuXG5cdCAqL1xuXHRob3ZlckFjdGlvbnM/OiBJVGVybWluYWxTdGF0dXNIb3ZlckFjdGlvbltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbFN0YXR1c0hvdmVyQWN0aW9uIHtcblx0bGFiZWw6IHN0cmluZztcblx0Y29tbWFuZElkOiBzdHJpbmc7XG5cdHJ1bjogKCkgPT4gdm9pZDtcbn1cblxuLyoqXG4gKiBDb250ZXh0IGZvciBhY3Rpb25zIHRha2VuIG9uIHRlcm1pbmFsIGluc3RhbmNlcy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXplZFRlcm1pbmFsSW5zdGFuY2VDb250ZXh0IHtcblx0JG1pZDogTWFyc2hhbGxlZElkLlRlcm1pbmFsQ29udGV4dDtcblx0aW5zdGFuY2VJZDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgUVVJQ0tfTEFVTkNIX1BST0ZJTEVfQ0hPSUNFID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucHJvZmlsZS5jaG9pY2UnO1xuXG5leHBvcnQgY29uc3QgZW51bSBUZXJtaW5hbENvbW1hbmRJZCB7XG5cdFRvZ2dsZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnRvZ2dsZVRlcm1pbmFsJyxcblx0S2lsbCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmtpbGwnLFxuXHRLaWxsVmlld09yRWRpdG9yID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwua2lsbFZpZXdPckVkaXRvcicsXG5cdEtpbGxFZGl0b3IgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5raWxsRWRpdG9yJyxcblx0S2lsbEFjdGl2ZVRhYiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmtpbGxBY3RpdmVUYWInLFxuXHRLaWxsQWxsID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwua2lsbEFsbCcsXG5cdFF1aWNrS2lsbCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnF1aWNrS2lsbCcsXG5cdENvbmZpZ3VyZVRlcm1pbmFsU2V0dGluZ3MgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5vcGVuU2V0dGluZ3MnLFxuXHRTaGVsbEludGVncmF0aW9uTGVhcm5Nb3JlID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubGVhcm5Nb3JlJyxcblx0Q29weUxhc3RDb21tYW5kID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY29weUxhc3RDb21tYW5kJyxcblx0Q29weUxhc3RDb21tYW5kT3V0cHV0ID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY29weUxhc3RDb21tYW5kT3V0cHV0Jyxcblx0Q29weUxhc3RDb21tYW5kQW5kTGFzdENvbW1hbmRPdXRwdXQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jb3B5TGFzdENvbW1hbmRBbmRMYXN0Q29tbWFuZE91dHB1dCcsXG5cdENvcHlBbmRDbGVhclNlbGVjdGlvbiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNvcHlBbmRDbGVhclNlbGVjdGlvbicsXG5cdENvcHlTZWxlY3Rpb24gPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jb3B5U2VsZWN0aW9uJyxcblx0Q29weVNlbGVjdGlvbkFzSHRtbCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNvcHlTZWxlY3Rpb25Bc0h0bWwnLFxuXHRTZWxlY3RBbGwgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3RBbGwnLFxuXHREZWxldGVXb3JkTGVmdCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmRlbGV0ZVdvcmRMZWZ0Jyxcblx0RGVsZXRlV29yZFJpZ2h0ID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZGVsZXRlV29yZFJpZ2h0Jyxcblx0RGVsZXRlVG9MaW5lU3RhcnQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5kZWxldGVUb0xpbmVTdGFydCcsXG5cdE1vdmVUb0xpbmVTdGFydCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm1vdmVUb0xpbmVTdGFydCcsXG5cdE1vdmVUb0xpbmVFbmQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5tb3ZlVG9MaW5lRW5kJyxcblx0TmV3ID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3Jyxcblx0TmV3V2l0aEN3ZCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm5ld1dpdGhDd2QnLFxuXHROZXdMb2NhbCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm5ld0xvY2FsJyxcblx0TmV3SW5BY3RpdmVXb3Jrc3BhY2UgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdJbkFjdGl2ZVdvcmtzcGFjZScsXG5cdE5ld1dpdGhQcm9maWxlID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3V2l0aFByb2ZpbGUnLFxuXHRTcGxpdCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNwbGl0Jyxcblx0U3BsaXRBY3RpdmVUYWIgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zcGxpdEFjdGl2ZVRhYicsXG5cdFNwbGl0SW5BY3RpdmVXb3Jrc3BhY2UgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zcGxpdEluQWN0aXZlV29ya3NwYWNlJyxcblx0VW5zcGxpdCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnVuc3BsaXQnLFxuXHRKb2luQWN0aXZlVGFiID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuam9pbkFjdGl2ZVRhYicsXG5cdEpvaW4gPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5qb2luJyxcblx0UmVsYXVuY2ggPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZWxhdW5jaCcsXG5cdEZvY3VzUHJldmlvdXNQYW5lID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNQcmV2aW91c1BhbmUnLFxuXHRDcmVhdGVUZXJtaW5hbEVkaXRvciA9ICd3b3JrYmVuY2guYWN0aW9uLmNyZWF0ZVRlcm1pbmFsRWRpdG9yJyxcblx0Q3JlYXRlVGVybWluYWxFZGl0b3JTYW1lR3JvdXAgPSAnd29ya2JlbmNoLmFjdGlvbi5jcmVhdGVUZXJtaW5hbEVkaXRvclNhbWVHcm91cCcsXG5cdENyZWF0ZVRlcm1pbmFsRWRpdG9yU2lkZSA9ICd3b3JrYmVuY2guYWN0aW9uLmNyZWF0ZVRlcm1pbmFsRWRpdG9yU2lkZScsXG5cdEZvY3VzVGFicyA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzVGFicycsXG5cdEZvY3VzTmV4dFBhbmUgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c05leHRQYW5lJyxcblx0UmVzaXplUGFuZUxlZnQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZXNpemVQYW5lTGVmdCcsXG5cdFJlc2l6ZVBhbmVSaWdodCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlc2l6ZVBhbmVSaWdodCcsXG5cdFJlc2l6ZVBhbmVVcCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlc2l6ZVBhbmVVcCcsXG5cdFNpemVUb0NvbnRlbnRXaWR0aCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNpemVUb0NvbnRlbnRXaWR0aCcsXG5cdFNpemVUb0NvbnRlbnRXaWR0aEFjdGl2ZVRhYiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNpemVUb0NvbnRlbnRXaWR0aEFjdGl2ZVRhYicsXG5cdFJlc2l6ZVBhbmVEb3duID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVzaXplUGFuZURvd24nLFxuXHRGb2N1cyA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzJyxcblx0Rm9jdXNJbnN0YW5jZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzSW5zdGFuY2UnLFxuXHRGb2N1c05leHQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c05leHQnLFxuXHRGb2N1c1ByZXZpb3VzID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNQcmV2aW91cycsXG5cdFBhc3RlID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucGFzdGUnLFxuXHRQYXN0ZVB3c2ggPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5wYXN0ZVB3c2gnLFxuXHRQYXN0ZVNlbGVjdGlvbiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnBhc3RlU2VsZWN0aW9uJyxcblx0U2VsZWN0RGVmYXVsdFByb2ZpbGUgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3REZWZhdWx0U2hlbGwnLFxuXHRSdW5TZWxlY3RlZFRleHQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5ydW5TZWxlY3RlZFRleHQnLFxuXHRSdW5BY3RpdmVGaWxlID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucnVuQWN0aXZlRmlsZScsXG5cdFN3aXRjaFRlcm1pbmFsID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc3dpdGNoVGVybWluYWwnLFxuXHRTY3JvbGxEb3duTGluZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNjcm9sbERvd24nLFxuXHRTY3JvbGxEb3duUGFnZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNjcm9sbERvd25QYWdlJyxcblx0U2Nyb2xsVG9Cb3R0b20gPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxUb0JvdHRvbScsXG5cdFNjcm9sbFVwTGluZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNjcm9sbFVwJyxcblx0U2Nyb2xsVXBQYWdlID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2Nyb2xsVXBQYWdlJyxcblx0U2Nyb2xsVG9Ub3AgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxUb1RvcCcsXG5cdENsZWFyID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2xlYXInLFxuXHRDbGVhclNlbGVjdGlvbiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNsZWFyU2VsZWN0aW9uJyxcblx0Q2hhbmdlSWNvbiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYW5nZUljb24nLFxuXHRDaGFuZ2VJY29uQWN0aXZlVGFiID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhbmdlSWNvbkFjdGl2ZVRhYicsXG5cdENoYW5nZUNvbG9yID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhbmdlQ29sb3InLFxuXHRDaGFuZ2VDb2xvckFjdGl2ZVRhYiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYW5nZUNvbG9yQWN0aXZlVGFiJyxcblx0UmVuYW1lID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVuYW1lJyxcblx0UmVuYW1lQWN0aXZlVGFiID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVuYW1lQWN0aXZlVGFiJyxcblx0UmVuYW1lV2l0aEFyZ3MgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZW5hbWVXaXRoQXJnJyxcblx0U2Nyb2xsVG9QcmV2aW91c0NvbW1hbmQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxUb1ByZXZpb3VzQ29tbWFuZCcsXG5cdFNjcm9sbFRvTmV4dENvbW1hbmQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxUb05leHRDb21tYW5kJyxcblx0U2VsZWN0VG9QcmV2aW91c0NvbW1hbmQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3RUb1ByZXZpb3VzQ29tbWFuZCcsXG5cdFNlbGVjdFRvTmV4dENvbW1hbmQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3RUb05leHRDb21tYW5kJyxcblx0U2VsZWN0VG9QcmV2aW91c0xpbmUgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3RUb1ByZXZpb3VzTGluZScsXG5cdFNlbGVjdFRvTmV4dExpbmUgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3RUb05leHRMaW5lJyxcblx0U2VuZFNlcXVlbmNlID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VuZFNlcXVlbmNlJyxcblx0U2VuZFNpZ25hbCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbmRTaWduYWwnLFxuXHRBdHRhY2hUb1Nlc3Npb24gPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5hdHRhY2hUb1Nlc3Npb24nLFxuXHREZXRhY2hTZXNzaW9uID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZGV0YWNoU2Vzc2lvbicsXG5cdE1vdmVUb0VkaXRvciA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm1vdmVUb0VkaXRvcicsXG5cdE1vdmVUb1Rlcm1pbmFsUGFuZWwgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5tb3ZlVG9UZXJtaW5hbFBhbmVsJyxcblx0TW92ZUludG9OZXdXaW5kb3cgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5tb3ZlSW50b05ld1dpbmRvdycsXG5cdE5ld0luTmV3V2luZG93ID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3SW5OZXdXaW5kb3cnLFxuXHRTZXREaW1lbnNpb25zID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2V0RGltZW5zaW9ucycsXG5cdEZvY3VzSG92ZXIgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c0hvdmVyJyxcblx0U2hvd0Vudmlyb25tZW50Q29udHJpYnV0aW9ucyA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNob3dFbnZpcm9ubWVudENvbnRyaWJ1dGlvbnMnLFxuXHRTdGFydFZvaWNlID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc3RhcnRWb2ljZScsXG5cdFN0b3BWb2ljZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnN0b3BWb2ljZScsXG5cdFJldmVhbENvbW1hbmQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZXZlYWxDb21tYW5kJyxcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfQ09NTUFORFNfVE9fU0tJUF9TSEVMTDogc3RyaW5nW10gPSBbXG5cdFRlcm1pbmFsQ29tbWFuZElkLkNsZWFyU2VsZWN0aW9uLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5DbGVhcixcblx0VGVybWluYWxDb21tYW5kSWQuQ29weUFuZENsZWFyU2VsZWN0aW9uLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Db3B5U2VsZWN0aW9uLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Db3B5U2VsZWN0aW9uQXNIdG1sLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Db3B5TGFzdENvbW1hbmQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLkNvcHlMYXN0Q29tbWFuZE91dHB1dCxcblx0VGVybWluYWxDb21tYW5kSWQuQ29weUxhc3RDb21tYW5kQW5kTGFzdENvbW1hbmRPdXRwdXQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLkRlbGV0ZVRvTGluZVN0YXJ0LFxuXHRUZXJtaW5hbENvbW1hbmRJZC5EZWxldGVXb3JkTGVmdCxcblx0VGVybWluYWxDb21tYW5kSWQuRGVsZXRlV29yZFJpZ2h0LFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Gb2N1c05leHRQYW5lLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Gb2N1c05leHQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLkZvY3VzUHJldmlvdXNQYW5lLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Gb2N1c1ByZXZpb3VzLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Gb2N1cyxcblx0VGVybWluYWxDb21tYW5kSWQuU2l6ZVRvQ29udGVudFdpZHRoLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5LaWxsLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5LaWxsRWRpdG9yLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Nb3ZlVG9FZGl0b3IsXG5cdFRlcm1pbmFsQ29tbWFuZElkLk1vdmVUb0xpbmVFbmQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLk1vdmVUb0xpbmVTdGFydCxcblx0VGVybWluYWxDb21tYW5kSWQuTW92ZVRvVGVybWluYWxQYW5lbCxcblx0VGVybWluYWxDb21tYW5kSWQuTmV3SW5BY3RpdmVXb3Jrc3BhY2UsXG5cdFRlcm1pbmFsQ29tbWFuZElkLk5ldyxcblx0VGVybWluYWxDb21tYW5kSWQuTmV3SW5OZXdXaW5kb3csXG5cdFRlcm1pbmFsQ29tbWFuZElkLlBhc3RlLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5QYXN0ZVB3c2gsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlBhc3RlU2VsZWN0aW9uLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5SZXNpemVQYW5lRG93bixcblx0VGVybWluYWxDb21tYW5kSWQuUmVzaXplUGFuZUxlZnQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlJlc2l6ZVBhbmVSaWdodCxcblx0VGVybWluYWxDb21tYW5kSWQuUmVzaXplUGFuZVVwLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5SdW5BY3RpdmVGaWxlLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5SdW5TZWxlY3RlZFRleHQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbERvd25MaW5lLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxEb3duUGFnZSxcblx0VGVybWluYWxDb21tYW5kSWQuU2Nyb2xsVG9Cb3R0b20sXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbFRvTmV4dENvbW1hbmQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbFRvUHJldmlvdXNDb21tYW5kLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxUb1RvcCxcblx0VGVybWluYWxDb21tYW5kSWQuU2Nyb2xsVXBMaW5lLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxVcFBhZ2UsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNlbmRTZXF1ZW5jZSxcblx0VGVybWluYWxDb21tYW5kSWQuU2VsZWN0QWxsLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3RUb05leHRDb21tYW5kLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3RUb05leHRMaW5lLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TZWxlY3RUb1ByZXZpb3VzQ29tbWFuZCxcblx0VGVybWluYWxDb21tYW5kSWQuU2VsZWN0VG9QcmV2aW91c0xpbmUsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0SW5BY3RpdmVXb3Jrc3BhY2UsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0LFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Ub2dnbGUsXG5cdFRlcm1pbmFsQ29tbWFuZElkLkZvY3VzSG92ZXIsXG5cdEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuT3BlbkFjY2Vzc2liaWxpdHlIZWxwLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TdG9wVm9pY2UsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNlbmRTaWduYWwsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJlcnVuRm9yQWN0aXZlVGVybWluYWwnLFxuXHQnZWRpdG9yLmFjdGlvbi50b2dnbGVUYWJGb2N1c01vZGUnLFxuXHQnbm90aWZpY2F0aW9ucy5oaWRlTGlzdCcsXG5cdCdub3RpZmljYXRpb25zLmhpZGVUb2FzdHMnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5jbG9zZVF1aWNrT3BlbicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlbicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlblByZXZpb3VzRWRpdG9yJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uc2hvd0NvbW1hbmRzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGFza3MuYnVpbGQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5yZXN0YXJ0VGFzaycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJ1blRhc2snLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5yZVJ1blRhc2snLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5zaG93TG9nJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGFza3Muc2hvd1Rhc2tzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGFza3MudGVybWluYXRlJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGFza3MudGVzdCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUZ1bGxTY3JlZW4nLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c0F0SW5kZXgxJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNBdEluZGV4MicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzQXRJbmRleDMnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c0F0SW5kZXg0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNBdEluZGV4NScsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzQXRJbmRleDYnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c0F0SW5kZXg3Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNBdEluZGV4OCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzQXRJbmRleDknLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1NlY29uZEVkaXRvckdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNUaGlyZEVkaXRvckdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNGb3VydGhFZGl0b3JHcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZvY3VzRmlmdGhFZGl0b3JHcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZvY3VzU2l4dGhFZGl0b3JHcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZvY3VzU2V2ZW50aEVkaXRvckdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNFaWdodGhFZGl0b3JHcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZvY3VzTmV4dFBhcnQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1ByZXZpb3VzUGFydCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm5leHRQYW5lbFZpZXcnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5wcmV2aW91c1BhbmVsVmlldycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm5leHRTaWRlQmFyVmlldycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnByZXZpb3VzU2lkZUJhclZpZXcnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5kaXNjb25uZWN0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RhcnQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zdG9wJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZGVidWcucnVuJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZGVidWcucmVzdGFydCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLmNvbnRpbnVlJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZGVidWcucGF1c2UnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zdGVwSW50bycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnN0ZXBPdXQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zdGVwT3ZlcicsXG5cdCdzZXNzaW9ucy5nb0JhY2snLFxuXHQnc2Vzc2lvbnMuZ29Gb3J3YXJkJyxcblx0J3Nlc3Npb25zLmZvY3VzQWN0aXZlU2Vzc2lvbicsXG5cdCdzZXNzaW9ucy5mb2N1c1Nlc3Npb25JbkdyaWQxJyxcblx0J3Nlc3Npb25zLmZvY3VzU2Vzc2lvbkluR3JpZDInLFxuXHQnc2Vzc2lvbnMuZm9jdXNTZXNzaW9uSW5HcmlkMycsXG5cdCdzZXNzaW9ucy5mb2N1c1Nlc3Npb25JbkdyaWQ0Jyxcblx0J3Nlc3Npb25zLmZvY3VzU2Vzc2lvbkluR3JpZDUnLFxuXHQnc2Vzc2lvbnMuZm9jdXNTZXNzaW9uSW5HcmlkNicsXG5cdCdzZXNzaW9ucy5mb2N1c1Nlc3Npb25JbkdyaWQ3Jyxcblx0J3Nlc3Npb25zLmZvY3VzU2Vzc2lvbkluR3JpZDgnLFxuXHQnc2Vzc2lvbnMuZm9jdXNTZXNzaW9uSW5HcmlkOScsXG5cdCdzZXNzaW9uc1ZpZXdQYW5lLm5hdmlnYXRlUHJldmlvdXNTZXNzaW9uJyxcblx0J3Nlc3Npb25zVmlld1BhbmUubmF2aWdhdGVOZXh0U2Vzc2lvbicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm5leHRFZGl0b3InLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5wcmV2aW91c0VkaXRvcicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm5leHRFZGl0b3JJbkdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ucHJldmlvdXNFZGl0b3JJbkdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3Blbk5leHRSZWNlbnRseVVzZWRFZGl0b3InLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3InLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvckluR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tPcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3InLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5MZWFzdFJlY2VudGx5VXNlZEVkaXRvcicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlbkxlYXN0UmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZvY3VzQWN0aXZlRWRpdG9yR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0ZpcnN0RWRpdG9yR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0xhc3RFZGl0b3JHcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZpcnN0RWRpdG9ySW5Hcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmxhc3RFZGl0b3JJbkdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ubmF2aWdhdGVVcCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm5hdmlnYXRlRG93bicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm5hdmlnYXRlUmlnaHQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5uYXZpZ2F0ZUxlZnQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVQYW5lbCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlblZpZXcnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVNYXhpbWl6ZWRQYW5lbCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnpvb21JbicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnpvb21PdXQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi56b29tUmVzZXQnLFxuXHQnbm90aWZpY2F0aW9uLmFjY2VwdFByaW1hcnlBY3Rpb24nLFxuXHQncnVuQ29tbWFuZHMnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGF0LnN0YXJ0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhdC5jbG9zZScsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQuZGlzY2FyZCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQubWFrZVJlcXVlc3QnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGF0LmNhbmNlbCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQuZmVlZGJhY2tIZWxwZnVsJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhdC5mZWVkYmFja1VuaGVscGZ1bCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQuZmVlZGJhY2tSZXBvcnRJc3N1ZScsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQucnVuQ29tbWFuZCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQuaW5zZXJ0Q29tbWFuZCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQudmlld0luQ2hhdCcsXG5cdC4uLmRlZmF1bHRUZXJtaW5hbENvbnRyaWJDb21tYW5kc1RvU2tpcFNoZWxsLFxuXTtcblxuZXhwb3J0IGNvbnN0IHRlcm1pbmFsQ29udHJpYnV0aW9uc0Rlc2NyaXB0b3I6IElFeHRlbnNpb25Qb2ludERlc2NyaXB0b3I8SVRlcm1pbmFsQ29udHJpYnV0aW9ucz4gPSB7XG5cdGV4dGVuc2lvblBvaW50OiAndGVybWluYWwnLFxuXHRkZWZhdWx0RXh0ZW5zaW9uS2luZDogWyd3b3Jrc3BhY2UnXSxcblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjogZnVuY3Rpb24qIChjb250cmliczogcmVhZG9ubHkgSVRlcm1pbmFsQ29udHJpYnV0aW9uc1tdKSB7XG5cdFx0Zm9yIChjb25zdCBjb250cmliIG9mIGNvbnRyaWJzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb2ZpbGVDb250cmliIG9mIChjb250cmliLnByb2ZpbGVzID8/IFtdKSkge1xuXHRcdFx0XHR5aWVsZCBgb25UZXJtaW5hbFByb2ZpbGU6JHtwcm9maWxlQ29udHJpYi5pZH1gO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGVybWluYWwnLCAnQ29udHJpYnV0ZXMgdGVybWluYWwgZnVuY3Rpb25hbGl0eS4nKSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRwcm9maWxlczoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRlcm1pbmFsLnByb2ZpbGVzJywgXCJEZWZpbmVzIGFkZGl0aW9uYWwgdGVybWluYWwgcHJvZmlsZXMgdGhhdCB0aGUgdXNlciBjYW4gY3JlYXRlLlwiKSxcblx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydpZCcsICd0aXRsZSddLFxuXHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3tcblx0XHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdFx0aWQ6ICckMScsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiAnJDInXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50ZXJtaW5hbC5wcm9maWxlcy5pZCcsIFwiVGhlIElEIG9mIHRoZSB0ZXJtaW5hbCBwcm9maWxlIHByb3ZpZGVyLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50ZXJtaW5hbC5wcm9maWxlcy50aXRsZScsIFwiVGl0bGUgZm9yIHRoaXMgdGVybWluYWwgcHJvZmlsZS5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGljb246IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50ZXJtaW5hbC50eXBlcy5pY29uJywgXCJBIGNvZGljb24sIFVSSSwgb3IgbGlnaHQgYW5kIGRhcmsgVVJJcyB0byBhc3NvY2lhdGUgd2l0aCB0aGlzIHRlcm1pbmFsIHR5cGUuXCIpLFxuXHRcdFx0XHRcdFx0XHRhbnlPZjogW3tcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGxpZ2h0OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGVybWluYWwudHlwZXMuaWNvbi5saWdodCcsICdJY29uIHBhdGggd2hlbiBhIGxpZ2h0IHRoZW1lIGlzIHVzZWQnKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRkYXJrOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGVybWluYWwudHlwZXMuaWNvbi5kYXJrJywgJ0ljb24gcGF0aCB3aGVuIGEgZGFyayB0aGVtZSBpcyB1c2VkJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHRpdGxlVGVtcGxhdGU6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50ZXJtaW5hbC5wcm9maWxlcy50aXRsZVRlbXBsYXRlJywgXCJBIHRpdGxlIHRlbXBsYXRlIHN0cmluZyBmb3IgdGhlIHRlcm1pbmFsIHRhYi4gU3VwcG9ydHMgdmFyaWFibGVzIGxpa2UgJFxce3NlcXVlbmNlfSwgJFxce3Byb2Nlc3N9LCAkXFx7Y3dkfSwgZXRjLiBPdmVycmlkZXMgdGhlIGRlZmF1bHQgdGVybWluYWwuaW50ZWdyYXRlZC50YWJzLnRpdGxlIHNldHRpbmcgZm9yIHRlcm1pbmFscyBjcmVhdGVkIHdpdGggdGhpcyBwcm9maWxlLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0Y29tcGxldGlvblByb3ZpZGVyczoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRlcm1pbmFsLmNvbXBsZXRpb25Qcm92aWRlcnMnLCBcIkRlZmluZXMgdGVybWluYWwgY29tcGxldGlvbiBwcm92aWRlcnMgdGhhdCB3aWxsIGJlIHJlZ2lzdGVyZWQgd2hlbiB0aGUgZXh0ZW5zaW9uIGFjdGl2YXRlcy5cIiksXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaWQnXSxcblx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdFx0XHRib2R5OiB7XG5cdFx0XHRcdFx0XHRcdGlkOiAnJDEnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJyQyJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGVybWluYWwuY29tcGxldGlvblByb3ZpZGVycy5kZXNjcmlwdGlvbicsIFwiQSBkZXNjcmlwdGlvbiBvZiB3aGF0IHRoZSBjb21wbGV0aW9uIHByb3ZpZGVyIGRvZXMuIFRoaXMgd2lsbCBiZSBzaG93biBpbiB0aGUgc2V0dGluZ3MgVUkuXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0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LHVCQUF1QjtBQUFBLEVBQ3ZCO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtB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
