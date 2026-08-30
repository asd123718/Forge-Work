import { Codicon } from "../../../../base/common/codicons.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { isString } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import product from "../../../../platform/product/common/product.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { TerminalLocationConfigValue, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { terminalColorSchema, terminalIconSchema } from "../../../../platform/terminal/common/terminalPlatformConfiguration.js";
import { Extensions as WorkbenchExtensions } from "../../../common/configuration.js";
import { terminalContribConfiguration, TerminalContribSettingId } from "../terminalContribExports.js";
import { DEFAULT_COMMANDS_TO_SKIP_SHELL, DEFAULT_LETTER_SPACING, DEFAULT_LINE_HEIGHT, MAXIMUM_FONT_WEIGHT, MINIMUM_FONT_WEIGHT, SUGGESTIONS_FONT_WEIGHT } from "./terminal.js";
const terminalDescriptors = "\n- " + [
  "`${cwd}`: " + localize("cwd", "the terminal's current working directory."),
  "`${cwdFolder}`: " + localize("cwdFolder", "the terminal's current working directory, displayed for multi-root workspaces or in a single root workspace when the value differs from the initial working directory. On Windows, this will only be displayed when shell integration is enabled."),
  "`${workspaceFolder}`: " + localize("workspaceFolder", "the workspace in which the terminal was launched."),
  "`${workspaceFolderName}`: " + localize("workspaceFolderName", "the `name` of the workspace in which the terminal was launched."),
  "`${local}`: " + localize("local", "indicates a local terminal in a remote workspace."),
  "`${process}`: " + localize("process", "the name of the terminal process."),
  "`${progress}`: " + localize("progress", "the progress state as reported by the `OSC 9;4` sequence."),
  "`${separator}`: " + localize("separator", "a conditional separator {0} that only shows when it's surrounded by variables with values or static text.", "(` - `)"),
  "`${sequence}`: " + localize("sequence", "the name provided to the terminal by the process."),
  "`${task}`: " + localize("task", "indicates this terminal is associated with a task."),
  "`${shellType}`: " + localize("shellType", "the detected shell type."),
  "`${shellCommand}`: " + localize("shellCommand", "the command being executed according to shell integration. This also requires high confidence in the detected command line, which may not work in some prompt frameworks."),
  "`${shellPromptInput}`: " + localize("shellPromptInput", "the shell's full prompt input according to shell integration.")
].join("\n- ");
let terminalTitle = localize("terminalTitle", "Controls the terminal title. Variables are substituted based on the context:");
terminalTitle += terminalDescriptors;
let terminalDescription = localize("terminalDescription", "Controls the terminal description, which appears to the right of the title. Variables are substituted based on the context:");
terminalDescription += terminalDescriptors;
const defaultTerminalFontSize = isMacintosh ? 12 : 14;
const terminalConfiguration = {
  [TerminalSettingId.SendKeybindingsToShell]: {
    markdownDescription: localize("terminal.integrated.sendKeybindingsToShell", "Dispatches most keybindings to the terminal instead of the workbench, overriding {0}, which can be used alternatively for fine tuning.", "`#terminal.integrated.commandsToSkipShell#`"),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.TabsDefaultColor]: {
    description: localize("terminal.integrated.tabs.defaultColor", "A theme color ID to associate with terminal icons by default."),
    ...terminalColorSchema,
    scope: ConfigurationScope.RESOURCE
  },
  [TerminalSettingId.TabsDefaultIcon]: {
    description: localize("terminal.integrated.tabs.defaultIcon", "A codicon ID to associate with terminal icons by default."),
    ...terminalIconSchema,
    default: Codicon.terminal.id,
    scope: ConfigurationScope.RESOURCE
  },
  [TerminalSettingId.TabsEnabled]: {
    description: localize("terminal.integrated.tabs.enabled", "Controls whether terminal tabs display as a list to the side of the terminal. When this is disabled a dropdown will display instead."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.TabsEnableAnimation]: {
    description: localize("terminal.integrated.tabs.enableAnimation", "Controls whether terminal tab statuses support animation (eg. in progress tasks)."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.TabsHideCondition]: {
    description: localize("terminal.integrated.tabs.hideCondition", "Controls whether the terminal tabs view will hide under certain conditions."),
    type: "string",
    enum: ["never", "singleTerminal", "singleGroup"],
    enumDescriptions: [
      localize("terminal.integrated.tabs.hideCondition.never", "Never hide the terminal tabs view"),
      localize("terminal.integrated.tabs.hideCondition.singleTerminal", "Hide the terminal tabs view when there is only a single terminal opened"),
      localize("terminal.integrated.tabs.hideCondition.singleGroup", "Hide the terminal tabs view when there is only a single terminal group opened")
    ],
    default: "singleTerminal"
  },
  [TerminalSettingId.TabsShowActiveTerminal]: {
    description: localize("terminal.integrated.tabs.showActiveTerminal", "Shows the active terminal information in the view. This is particularly useful when the title within the tabs aren't visible."),
    type: "string",
    enum: ["always", "singleTerminal", "singleTerminalOrNarrow", "never"],
    enumDescriptions: [
      localize("terminal.integrated.tabs.showActiveTerminal.always", "Always show the active terminal"),
      localize("terminal.integrated.tabs.showActiveTerminal.singleTerminal", "Show the active terminal when it is the only terminal opened"),
      localize("terminal.integrated.tabs.showActiveTerminal.singleTerminalOrNarrow", "Show the active terminal when it is the only terminal opened or when the tabs view is in its narrow textless state"),
      localize("terminal.integrated.tabs.showActiveTerminal.never", "Never show the active terminal")
    ],
    default: "singleTerminalOrNarrow"
  },
  [TerminalSettingId.TabsShowActions]: {
    description: localize("terminal.integrated.tabs.showActions", "Controls whether terminal split and kill buttons are displays next to the new terminal button."),
    type: "string",
    enum: ["always", "singleTerminal", "singleTerminalOrNarrow", "never"],
    enumDescriptions: [
      localize("terminal.integrated.tabs.showActions.always", "Always show the actions"),
      localize("terminal.integrated.tabs.showActions.singleTerminal", "Show the actions when it is the only terminal opened"),
      localize("terminal.integrated.tabs.showActions.singleTerminalOrNarrow", "Show the actions when it is the only terminal opened or when the tabs view is in its narrow textless state"),
      localize("terminal.integrated.tabs.showActions.never", "Never show the actions")
    ],
    default: "singleTerminalOrNarrow"
  },
  [TerminalSettingId.TabsLocation]: {
    type: "string",
    enum: ["left", "right"],
    enumDescriptions: [
      localize("terminal.integrated.tabs.location.left", "Show the terminal tabs view to the left of the terminal"),
      localize("terminal.integrated.tabs.location.right", "Show the terminal tabs view to the right of the terminal")
    ],
    default: "right",
    description: localize("terminal.integrated.tabs.location", "Controls the location of the terminal tabs, either to the left or right of the actual terminal(s).")
  },
  [TerminalSettingId.DefaultLocation]: {
    type: "string",
    enum: [TerminalLocationConfigValue.Editor, TerminalLocationConfigValue.TerminalView],
    enumDescriptions: [
      localize("terminal.integrated.defaultLocation.editor", "Create terminals in the editor"),
      localize("terminal.integrated.defaultLocation.view", "Create terminals in the terminal view")
    ],
    default: "view",
    description: localize("terminal.integrated.defaultLocation", "Controls where newly created terminals will appear."),
    agentsWindow: { default: "view", readOnly: true }
  },
  [TerminalSettingId.TabsFocusMode]: {
    type: "string",
    enum: ["singleClick", "doubleClick"],
    enumDescriptions: [
      localize("terminal.integrated.tabs.focusMode.singleClick", "Focus the terminal when clicking a terminal tab"),
      localize("terminal.integrated.tabs.focusMode.doubleClick", "Focus the terminal when double-clicking a terminal tab")
    ],
    default: "doubleClick",
    description: localize("terminal.integrated.tabs.focusMode", "Controls whether focusing the terminal of a tab happens on double or single click.")
  },
  [TerminalSettingId.TabsAllowAgentCliTitle]: {
    description: localize("terminal.integrated.tabs.allowAgentCliTitle", "Controls whether agentic CLIs (such as Claude Code, Codex, Command Code, GitHub Copilot CLI, and Gemini CLI) are allowed to set the terminal tab title via escape sequences. When disabled, the configured tab title template is used instead."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.MacOptionIsMeta]: {
    description: localize("terminal.integrated.macOptionIsMeta", "Controls whether to treat the option key as the meta key in the terminal on macOS."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.MacOptionClickForcesSelection]: {
    description: localize("terminal.integrated.macOptionClickForcesSelection", "Controls whether to force selection when using Option+click on macOS. This will force a regular (line) selection and disallow the use of column selection mode. This enables copying and pasting using the regular terminal selection, for example, when mouse mode is enabled in tmux."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.AltClickMovesCursor]: {
    markdownDescription: localize("terminal.integrated.altClickMovesCursor", "If enabled, alt/option + click will reposition the prompt cursor to underneath the mouse when {0} is set to {1} (the default value). This may not work reliably depending on your shell.", "`#editor.multiCursorModifier#`", "`'alt'`"),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.CopyOnSelection]: {
    description: localize("terminal.integrated.copyOnSelection", "Controls whether text selected in the terminal will be copied to the clipboard."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.EnableMultiLinePasteWarning]: {
    markdownDescription: localize("terminal.integrated.enableMultiLinePasteWarning", "Controls whether to show a warning dialog when pasting multiple lines into the terminal."),
    type: "string",
    enum: ["auto", "always", "never"],
    markdownEnumDescriptions: [
      localize("terminal.integrated.enableMultiLinePasteWarning.auto", "Enable the warning but do not show it when:\n\n- Bracketed paste mode is enabled (the shell supports multi-line paste natively)\n- The paste is handled by the shell's readline (in the case of pwsh)"),
      localize("terminal.integrated.enableMultiLinePasteWarning.always", "Always show the warning if the text contains a new line."),
      localize("terminal.integrated.enableMultiLinePasteWarning.never", "Never show the warning.")
    ],
    default: "auto"
  },
  [TerminalSettingId.DrawBoldTextInBrightColors]: {
    description: localize("terminal.integrated.drawBoldTextInBrightColors", 'Controls whether bold text in the terminal will always use the "bright" ANSI color variant.'),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.FontFamily]: {
    markdownDescription: localize("terminal.integrated.fontFamily", "Controls the font family of the terminal. Defaults to {0}'s value.", "`#editor.fontFamily#`"),
    type: "string"
  },
  [TerminalSettingId.FontLigaturesEnabled]: {
    markdownDescription: localize("terminal.integrated.fontLigatures.enabled", "Controls whether font ligatures are enabled in the terminal. Ligatures will only work if the configured {0} supports them.", `\`#${TerminalSettingId.FontFamily}#\``),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.FontLigaturesFeatureSettings]: {
    markdownDescription: localize("terminal.integrated.fontLigatures.featureSettings", "Controls what font feature settings are used when ligatures are enabled, in the format of the `font-feature-settings` CSS property. Some examples which may be valid depending on the font:") + "\n\n- " + [
      `\`"calt" off, "ss03"\``,
      `\`"liga" on\``,
      `\`"calt" off, "dlig" on\``
    ].join("\n- "),
    type: "string",
    default: '"calt" on'
  },
  [TerminalSettingId.FontLigaturesFallbackLigatures]: {
    markdownDescription: localize("terminal.integrated.fontLigatures.fallbackLigatures", "When {0} is enabled and the particular {1} cannot be parsed, this is the set of character sequences that will always be drawn together. This allows the use of a fixed set of ligatures even when the font isn't supported.", `\`#${TerminalSettingId.GpuAcceleration}#\``, `\`#${TerminalSettingId.FontFamily}#\``),
    type: "array",
    items: [{ type: "string" }],
    default: [
      "<--",
      "<---",
      "<<-",
      "<-",
      "->",
      "->>",
      "-->",
      "--->",
      "<==",
      "<===",
      "<<=",
      "<=",
      "=>",
      "=>>",
      "==>",
      "===>",
      ">=",
      ">>=",
      "<->",
      "<-->",
      "<--->",
      "<---->",
      "<=>",
      "<==>",
      "<===>",
      "<====>",
      "::",
      ":::",
      "<~~",
      "</",
      "</>",
      "/>",
      "~~>",
      "==",
      "!=",
      "/=",
      "~=",
      "<>",
      "===",
      "!==",
      "!===",
      "<:",
      ":=",
      "*=",
      "*+",
      "<*",
      "<*>",
      "*>",
      "<|",
      "<|>",
      "|>",
      "+*",
      "=*",
      "=:",
      ":>",
      "/*",
      "*/",
      "+++",
      "<!--",
      "<!---"
    ]
  },
  [TerminalSettingId.FontSize]: {
    description: localize("terminal.integrated.fontSize", "Controls the font size in pixels of the terminal."),
    type: "number",
    default: defaultTerminalFontSize,
    minimum: 6,
    maximum: 100
  },
  [TerminalSettingId.LetterSpacing]: {
    description: localize("terminal.integrated.letterSpacing", "Controls the letter spacing of the terminal. This is an integer value which represents the number of additional pixels to add between characters."),
    type: "number",
    default: DEFAULT_LETTER_SPACING
  },
  [TerminalSettingId.LineHeight]: {
    description: localize("terminal.integrated.lineHeight", "Controls the line height of the terminal. This number is multiplied by the terminal font size to get the actual line-height in pixels."),
    type: "number",
    default: DEFAULT_LINE_HEIGHT
  },
  [TerminalSettingId.MinimumContrastRatio]: {
    markdownDescription: localize("terminal.integrated.minimumContrastRatio", "When set, the foreground color of each cell will change to try meet the contrast ratio specified. Note that this will not apply to `powerline` characters per #146406. Example values:\n\n- 1: Do nothing and use the standard theme colors.\n- 4.5: [WCAG AA compliance (minimum)](https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-contrast.html) (default).\n- 7: [WCAG AAA compliance (enhanced)](https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast7.html).\n- 21: White on black or black on white."),
    type: "number",
    default: 4.5,
    tags: ["accessibility"]
  },
  [TerminalSettingId.TabStopWidth]: {
    markdownDescription: localize("terminal.integrated.tabStopWidth", "The number of cells in a tab stop."),
    type: "number",
    minimum: 1,
    default: 8
  },
  [TerminalSettingId.FastScrollSensitivity]: {
    markdownDescription: localize("terminal.integrated.fastScrollSensitivity", "Scrolling speed multiplier when pressing `Alt`."),
    type: "number",
    default: 5
  },
  [TerminalSettingId.MouseWheelScrollSensitivity]: {
    markdownDescription: localize("terminal.integrated.mouseWheelScrollSensitivity", "A multiplier to be used on the `deltaY` of mouse wheel scroll events."),
    type: "number",
    default: 1
  },
  [TerminalSettingId.BellDuration]: {
    markdownDescription: localize("terminal.integrated.bellDuration", "The number of milliseconds to show the bell within a terminal tab when triggered."),
    type: "number",
    default: 1e3
  },
  [TerminalSettingId.FontWeight]: {
    "anyOf": [
      {
        type: "number",
        minimum: MINIMUM_FONT_WEIGHT,
        maximum: MAXIMUM_FONT_WEIGHT,
        errorMessage: localize("terminal.integrated.fontWeightError", 'Only "normal" and "bold" keywords or numbers between 1 and 1000 are allowed.')
      },
      {
        type: "string",
        pattern: "^(normal|bold|1000|[1-9][0-9]{0,2})$"
      },
      {
        enum: SUGGESTIONS_FONT_WEIGHT
      }
    ],
    description: localize("terminal.integrated.fontWeight", 'The font weight to use within the terminal for non-bold text. Accepts "normal" and "bold" keywords or numbers between 1 and 1000.'),
    default: "normal"
  },
  [TerminalSettingId.FontWeightBold]: {
    "anyOf": [
      {
        type: "number",
        minimum: MINIMUM_FONT_WEIGHT,
        maximum: MAXIMUM_FONT_WEIGHT,
        errorMessage: localize("terminal.integrated.fontWeightError", 'Only "normal" and "bold" keywords or numbers between 1 and 1000 are allowed.')
      },
      {
        type: "string",
        pattern: "^(normal|bold|1000|[1-9][0-9]{0,2})$"
      },
      {
        enum: SUGGESTIONS_FONT_WEIGHT
      }
    ],
    description: localize("terminal.integrated.fontWeightBold", 'The font weight to use within the terminal for bold text. Accepts "normal" and "bold" keywords or numbers between 1 and 1000.'),
    default: "bold"
  },
  [TerminalSettingId.CursorBlinking]: {
    description: localize("terminal.integrated.cursorBlinking", "Controls whether the terminal cursor blinks."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.TextBlinking]: {
    description: localize("terminal.integrated.textBlinking", "Controls whether text blinking is enabled in the terminal."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.CursorStyle]: {
    description: localize("terminal.integrated.cursorStyle", "Controls the style of terminal cursor when the terminal is focused."),
    enum: ["block", "line", "underline"],
    default: "block"
  },
  [TerminalSettingId.CursorStyleInactive]: {
    description: localize("terminal.integrated.cursorStyleInactive", "Controls the style of terminal cursor when the terminal is not focused."),
    enum: ["outline", "block", "line", "underline", "none"],
    default: "outline"
  },
  [TerminalSettingId.CursorWidth]: {
    markdownDescription: localize("terminal.integrated.cursorWidth", "Controls the width of the cursor when {0} is set to {1}.", "`#terminal.integrated.cursorStyle#`", "`line`"),
    type: "number",
    default: 1
  },
  [TerminalSettingId.Scrollback]: {
    description: localize("terminal.integrated.scrollback", "Controls the maximum number of lines the terminal keeps in its buffer. We pre-allocate memory based on this value in order to ensure a smooth experience. As such, as the value increases, so will the amount of memory."),
    type: "number",
    default: 1e3
  },
  [TerminalSettingId.DetectLocale]: {
    markdownDescription: localize("terminal.integrated.detectLocale", "Controls whether to detect and set the `$LANG` environment variable to a UTF-8 compliant option since VS Code's terminal only supports UTF-8 encoded data coming from the shell."),
    type: "string",
    enum: ["auto", "off", "on"],
    markdownEnumDescriptions: [
      localize("terminal.integrated.detectLocale.auto", "Set the `$LANG` environment variable if the existing variable does not exist or it does not end in `'.UTF-8'`."),
      localize("terminal.integrated.detectLocale.off", "Do not set the `$LANG` environment variable."),
      localize("terminal.integrated.detectLocale.on", "Always set the `$LANG` environment variable.")
    ],
    default: "auto"
  },
  [TerminalSettingId.GpuAcceleration]: {
    type: "string",
    enum: ["auto", "on", "off"],
    markdownEnumDescriptions: [
      localize("terminal.integrated.gpuAcceleration.auto", "Let VS Code detect which renderer will give the best experience."),
      localize("terminal.integrated.gpuAcceleration.on", "Enable GPU acceleration within the terminal."),
      localize("terminal.integrated.gpuAcceleration.off", "Disable GPU acceleration within the terminal. The terminal will render much slower when GPU acceleration is off but it should reliably work on all systems.")
    ],
    default: "auto",
    description: localize("terminal.integrated.gpuAcceleration", "Controls whether the terminal will leverage the GPU to do its rendering.")
  },
  [TerminalSettingId.TerminalTitleSeparator]: {
    "type": "string",
    "default": " - ",
    "markdownDescription": localize("terminal.integrated.tabs.separator", "Separator used by {0} and {1}.", `\`#${TerminalSettingId.TerminalTitle}#\``, `\`#${TerminalSettingId.TerminalDescription}#\``)
  },
  [TerminalSettingId.TerminalTitle]: {
    "type": "string",
    "default": "${process}",
    "markdownDescription": terminalTitle
  },
  [TerminalSettingId.TerminalDescription]: {
    "type": "string",
    "default": "${task}${separator}${local}${separator}${cwdFolder}",
    "markdownDescription": terminalDescription
  },
  [TerminalSettingId.RightClickBehavior]: {
    type: "string",
    enum: ["default", "copyPaste", "paste", "selectWord", "nothing"],
    enumDescriptions: [
      localize("terminal.integrated.rightClickBehavior.default", "Show the context menu."),
      localize("terminal.integrated.rightClickBehavior.copyPaste", "Copy when there is a selection, otherwise paste."),
      localize("terminal.integrated.rightClickBehavior.paste", "Paste on right click."),
      localize("terminal.integrated.rightClickBehavior.selectWord", "Select the word under the cursor and show the context menu."),
      localize("terminal.integrated.rightClickBehavior.nothing", "Do nothing and pass event to terminal.")
    ],
    default: isMacintosh ? "selectWord" : isWindows ? "copyPaste" : "default",
    description: localize("terminal.integrated.rightClickBehavior", "Controls how terminal reacts to right click.")
  },
  [TerminalSettingId.MiddleClickBehavior]: {
    type: "string",
    enum: ["default", "paste"],
    enumDescriptions: [
      localize("terminal.integrated.middleClickBehavior.default", "The platform default to focus the terminal. On Linux this will also paste the selection."),
      localize("terminal.integrated.middleClickBehavior.paste", "Paste on middle click.")
    ],
    default: "default",
    description: localize("terminal.integrated.middleClickBehavior", "Controls how terminal reacts to middle click.")
  },
  [TerminalSettingId.Cwd]: {
    restricted: true,
    description: localize("terminal.integrated.cwd", "An explicit start path where the terminal will be launched, this is used as the current working directory (cwd) for the shell process. This may be particularly useful in workspace settings if the root directory is not a convenient cwd."),
    type: "string",
    default: void 0,
    scope: ConfigurationScope.RESOURCE
  },
  [TerminalSettingId.ConfirmOnExit]: {
    description: localize("terminal.integrated.confirmOnExit", "Controls whether to confirm when the window closes if there are active terminal sessions. Background terminals like those launched by some extensions will not trigger the confirmation."),
    type: "string",
    enum: ["never", "always", "hasChildProcesses"],
    enumDescriptions: [
      localize("terminal.integrated.confirmOnExit.never", "Never confirm."),
      localize("terminal.integrated.confirmOnExit.always", "Always confirm if there are terminals."),
      localize("terminal.integrated.confirmOnExit.hasChildProcesses", "Confirm if there are any terminals that have child processes.")
    ],
    default: "never"
  },
  [TerminalSettingId.ConfirmOnKill]: {
    description: localize("terminal.integrated.confirmOnKill", "Controls whether to confirm killing terminals when they have child processes. When set to editor, terminals in the editor area will be marked as changed when they have child processes. Note that child process detection may not work well for shells like Git Bash which don't run their processes as child processes of the shell. Background terminals like those launched by some extensions will not trigger the confirmation."),
    type: "string",
    enum: ["never", "editor", "panel", "always"],
    enumDescriptions: [
      localize("terminal.integrated.confirmOnKill.never", "Never confirm."),
      localize("terminal.integrated.confirmOnKill.editor", "Confirm if the terminal is in the editor."),
      localize("terminal.integrated.confirmOnKill.panel", "Confirm if the terminal is in the panel."),
      localize("terminal.integrated.confirmOnKill.always", "Confirm if the terminal is either in the editor or panel.")
    ],
    default: "editor"
  },
  [TerminalSettingId.EnableBell]: {
    markdownDeprecationMessage: localize("terminal.integrated.enableBell", "This is now deprecated. Instead use the `terminal.integrated.enableVisualBell` and `accessibility.signals.terminalBell` settings."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.EnableVisualBell]: {
    description: localize("terminal.integrated.enableVisualBell", "Controls whether the visual terminal bell is enabled. This shows up next to the terminal's name."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.CommandsToSkipShell]: {
    markdownDescription: localize(
      "terminal.integrated.commandsToSkipShell",
      "A set of command IDs whose keybindings will not be sent to the shell but instead always be handled by VS Code. This allows keybindings that would normally be consumed by the shell to act instead the same as when the terminal is not focused, for example `Ctrl+P` to launch Quick Open.\n\n&nbsp;\n\nMany commands are skipped by default. To override a default and pass that command's keybinding to the shell instead, add the command prefixed with the `-` character. For example add `-workbench.action.quickOpen` to allow `Ctrl+P` to reach the shell.\n\n&nbsp;\n\nThe following list of default skipped commands is truncated when viewed in Settings Editor. To see the full list, {1} and search for the first command from the list below.\n\n&nbsp;\n\nDefault Skipped Commands:\n\n{0}",
      DEFAULT_COMMANDS_TO_SKIP_SHELL.sort().map((command) => `- ${command}`).join("\n"),
      `[${localize("openDefaultSettingsJson", "open the default settings JSON")}](command:workbench.action.openRawDefaultSettings '${localize("openDefaultSettingsJson.capitalized", "Open Default Settings (JSON)")}')`
    ),
    type: "array",
    items: {
      type: "string"
    },
    default: []
  },
  [TerminalSettingId.AllowChords]: {
    markdownDescription: localize("terminal.integrated.allowChords", "Whether or not to allow chord keybindings in the terminal. Note that when this is true and the keystroke results in a chord it will bypass {0}, setting this to false is particularly useful when you want ctrl+k to go to your shell (not VS Code).", "`#terminal.integrated.commandsToSkipShell#`"),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.AllowMnemonics]: {
    markdownDescription: localize("terminal.integrated.allowMnemonics", "Whether to allow menubar mnemonics (for example Alt+F) to trigger the open of the menubar. Note that this will cause all alt keystrokes to skip the shell when true. This does nothing on macOS."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.EnvMacOs]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.env.osx", "Object with environment variables that will be added to the VS Code process to be used by the terminal on macOS. Set to `null` to delete the environment variable."),
    type: "object",
    additionalProperties: {
      type: ["string", "null"]
    },
    default: {}
  },
  [TerminalSettingId.EnvLinux]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.env.linux", "Object with environment variables that will be added to the VS Code process to be used by the terminal on Linux. Set to `null` to delete the environment variable."),
    type: "object",
    additionalProperties: {
      type: ["string", "null"]
    },
    default: {}
  },
  [TerminalSettingId.EnvWindows]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.env.windows", "Object with environment variables that will be added to the VS Code process to be used by the terminal on Windows. Set to `null` to delete the environment variable."),
    type: "object",
    additionalProperties: {
      type: ["string", "null"]
    },
    default: {}
  },
  [TerminalSettingId.EnvironmentChangesRelaunch]: {
    markdownDescription: localize("terminal.integrated.environmentChangesRelaunch", "Whether to relaunch terminals automatically if extensions want to contribute to their environment and have not been interacted with yet."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.ShowExitAlert]: {
    description: localize("terminal.integrated.showExitAlert", 'Controls whether to show the alert "The terminal process terminated with exit code" when exit code is non-zero.'),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.WindowsUseConptyDll]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.windowsUseConptyDll", "Whether to use the conpty.dll (v1.25.260303002) shipped with VS Code, instead of the one bundled with Windows."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.SplitCwd]: {
    description: localize("terminal.integrated.splitCwd", "Controls the working directory a split terminal starts with."),
    type: "string",
    enum: ["workspaceRoot", "initial", "inherited"],
    enumDescriptions: [
      localize("terminal.integrated.splitCwd.workspaceRoot", "A new split terminal will use the workspace root as the working directory. In a multi-root workspace a choice for which root folder to use is offered."),
      localize("terminal.integrated.splitCwd.initial", "A new split terminal will use the working directory that the parent terminal started with."),
      localize("terminal.integrated.splitCwd.inherited", "On macOS and Linux, a new split terminal will use the working directory of the parent terminal. On Windows, this behaves the same as initial.")
    ],
    default: "inherited"
  },
  [TerminalSettingId.WordSeparators]: {
    markdownDescription: localize("terminal.integrated.wordSeparators", "A string containing all characters to be considered word separators when double-clicking to select word and in the fallback 'word' link detection. Since this is used for link detection, including characters such as `:` that are used when detecting links will cause the line and column part of links like `file:10:5` to be ignored."),
    type: "string",
    // allow-any-unicode-next-line
    default: " ()[]{}',\"`\u2500\u2018\u2019\u201C\u201D|"
  },
  [TerminalSettingId.EnableFileLinks]: {
    description: localize("terminal.integrated.enableFileLinks", "Whether to enable file links in terminals. Links can be slow when working on a network drive in particular because each file link is verified against the file system. Changing this will take effect only in new terminals."),
    type: "string",
    enum: ["off", "on", "notRemote"],
    enumDescriptions: [
      localize("enableFileLinks.off", "Always off."),
      localize("enableFileLinks.on", "Always on."),
      localize("enableFileLinks.notRemote", "Enable only when not in a remote workspace.")
    ],
    default: "on"
  },
  [TerminalSettingId.AllowedLinkSchemes]: {
    description: localize("terminal.integrated.allowedLinkSchemes", "An array of strings containing the URI schemes that the terminal is allowed to open links for. By default, only a small subset of possible schemes are allowed for security reasons."),
    type: "array",
    items: {
      type: "string"
    },
    default: [
      "file",
      "http",
      "https",
      "mailto",
      "vscode",
      "vscode-insiders"
    ]
  },
  [TerminalSettingId.UnicodeVersion]: {
    type: "string",
    enum: ["6", "11"],
    enumDescriptions: [
      localize("terminal.integrated.unicodeVersion.six", "Version 6 of Unicode. This is an older version which should work better on older systems."),
      localize("terminal.integrated.unicodeVersion.eleven", "Version 11 of Unicode. This version provides better support on modern systems that use modern versions of Unicode.")
    ],
    default: "11",
    description: localize("terminal.integrated.unicodeVersion", "Controls what version of Unicode to use when evaluating the width of characters in the terminal. If you experience emoji or other wide characters not taking up the right amount of space or backspace either deleting too much or too little then you may want to try tweaking this setting.")
  },
  [TerminalSettingId.EnablePersistentSessions]: {
    description: localize("terminal.integrated.enablePersistentSessions", "Persist terminal sessions/history for the workspace across window reloads."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.PersistentSessionReviveProcess]: {
    markdownDescription: localize("terminal.integrated.persistentSessionReviveProcess", "When the terminal process must be shut down (for example on window or application close), this determines when the previous terminal session contents/history should be restored and processes be recreated when the workspace is next opened.\n\nCaveats:\n\n- Restoring of the process current working directory depends on whether it is supported by the shell.\n- Time to persist the session during shutdown is limited, so it may be aborted when using high-latency remote connections."),
    type: "string",
    enum: ["onExit", "onExitAndWindowClose", "never"],
    markdownEnumDescriptions: [
      localize("terminal.integrated.persistentSessionReviveProcess.onExit", "Revive the processes after the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu)."),
      localize("terminal.integrated.persistentSessionReviveProcess.onExitAndWindowClose", "Revive the processes after the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu), or when the window is closed."),
      localize("terminal.integrated.persistentSessionReviveProcess.never", "Never restore the terminal buffers or recreate the process.")
    ],
    default: "onExit"
  },
  [TerminalSettingId.HideOnStartup]: {
    description: localize("terminal.integrated.hideOnStartup", "Whether to hide the terminal view on startup, avoiding creating a terminal when there are no persistent sessions."),
    type: "string",
    enum: ["never", "whenEmpty", "always"],
    markdownEnumDescriptions: [
      localize("hideOnStartup.never", "Never hide the terminal view on startup."),
      localize("hideOnStartup.whenEmpty", "Only hide the terminal when there are no persistent sessions restored."),
      localize("hideOnStartup.always", "Always hide the terminal, even when there are persistent sessions restored.")
    ],
    default: "never"
  },
  [TerminalSettingId.HideOnLastClosed]: {
    description: localize("terminal.integrated.hideOnLastClosed", "Whether to hide the terminal view when the last terminal is closed. This will only happen when the terminal is the only visible view in the view container."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.CustomGlyphs]: {
    markdownDescription: localize("terminal.integrated.customGlyphs", "Whether to draw custom glyphs instead of using the font for the following unicode ranges:\n\n{0}\n\nThis will typically result in better rendering with continuous lines, even when line height and letter spacing is used. This feature only works when {1} is enabled.", [
      "- Box Drawing (U+2500-U+257F)",
      "- Block Elements (U+2580-U+259F)",
      "- Braille Patterns (U+2800-U+28FF)",
      "- Powerline Symbols (U+E0A0-U+E0D4, Private Use Area)",
      "- Progress Indicators (U+EE00-U+EE0B, Private Use Area)",
      "- Git Branch Symbols (U+F5D0-U+F60D, Private Use Area)",
      "- Symbols for Legacy Computing (U+1FB00-U+1FBFF)"
    ].join("\n"), `\`#${TerminalSettingId.GpuAcceleration}#\``),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.RescaleOverlappingGlyphs]: {
    markdownDescription: localize("terminal.integrated.rescaleOverlappingGlyphs", "Whether to rescale glyphs horizontally that are a single cell wide but have glyphs that would overlap following cell(s). This typically happens for ambiguous width characters (eg. the roman numeral characters U+2160+) which aren't featured in monospace fonts. Emoji glyphs are never rescaled."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.EnableKittyKeyboardProtocol]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.enableKittyKeyboardProtocol", "Whether to enable the kitty keyboard protocol, which allows a program in the terminal to request more detailed keyboard input reporting. This can, for example, enable `Shift+Enter` to be handled by the program."),
    type: "boolean",
    default: true,
    tags: ["advanced"]
  },
  [TerminalSettingId.EnableWin32InputMode]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.enableWin32InputMode", "Whether to enable the win32 input mode, which provides enhanced keyboard input support on Windows."),
    type: "boolean",
    default: false,
    tags: ["experimental", "advanced"],
    experiment: {
      mode: "auto"
    }
  },
  [TerminalSettingId.ShellIntegrationEnabled]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.shellIntegration.enabled", "Determines whether or not shell integration is auto-injected to support features like enhanced command tracking and current working directory detection. \n\nShell integration works by injecting the shell with a startup script. The script gives VS Code insight into what is happening within the terminal.\n\nSupported shells:\n\n- Linux/macOS: bash, fish, pwsh, zsh\n - Windows: pwsh, git bash\n\nThis setting applies only when terminals are created, so you will need to restart your terminals for it to take effect.\n\n Note that the script injection may not work if you have custom arguments defined in the terminal profile, have enabled {1}, have a [complex bash `PROMPT_COMMAND`](https://code.visualstudio.com/docs/editor/integrated-terminal#_complex-bash-promptcommand), or other unsupported setup. To disable decorations, see {0}", "`#terminal.integrated.shellIntegration.decorationsEnabled#`", "`#editor.accessibilitySupport#`"),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.ShellIntegrationDecorationsEnabled]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.shellIntegration.decorationsEnabled", "When shell integration is enabled, adds a decoration for each command."),
    type: "string",
    enum: ["both", "gutter", "overviewRuler", "never"],
    enumDescriptions: [
      localize("terminal.integrated.shellIntegration.decorationsEnabled.both", "Show decorations in the gutter (left) and overview ruler (right)"),
      localize("terminal.integrated.shellIntegration.decorationsEnabled.gutter", "Show gutter decorations to the left of the terminal"),
      localize("terminal.integrated.shellIntegration.decorationsEnabled.overviewRuler", "Show overview ruler decorations to the right of the terminal"),
      localize("terminal.integrated.shellIntegration.decorationsEnabled.never", "Do not show decorations")
    ],
    default: "both"
  },
  [TerminalSettingId.ShellIntegrationTimeout]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.shellIntegration.timeout", "Configures the duration in milliseconds to wait for shell integration after launch before declaring it's not there. The default value {0} uses a variable wait time based on whether shell integration injection is enabled and whether it's a remote window. Values between 1 and 499 are clamped to 500ms. Consider setting this to a large value if your shell starts very slowly.", "`-1`"),
    type: "integer",
    minimum: -1,
    maximum: 6e4,
    default: -1
  },
  [TerminalSettingId.ShellIntegrationQuickFixEnabled]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.shellIntegration.quickFixEnabled", "When shell integration is enabled, enables quick fixes for terminal commands that appear as a lightbulb or sparkle icon to the left of the prompt."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.ShellIntegrationEnvironmentReporting]: {
    markdownDescription: localize("terminal.integrated.shellIntegration.environmentReporting", "Controls whether to report the shell environment, enabling its use in features such as {0}. This may cause a slowdown when printing your shell's prompt.", `\`#${TerminalContribSettingId.SuggestEnabled}#\``),
    type: "boolean",
    default: product.quality !== "stable"
  },
  [TerminalSettingId.SmoothScrolling]: {
    markdownDescription: localize("terminal.integrated.smoothScrolling", "Controls whether the terminal will scroll using an animation."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.IgnoreBracketedPasteMode]: {
    markdownDescription: localize("terminal.integrated.ignoreBracketedPasteMode", "Controls whether the terminal will ignore bracketed paste mode even if the terminal was put into the mode, omitting the {0} and {1} sequences when pasting. This is useful when the shell is not respecting the mode which can happen in sub-shells for example.", "`\\x1b[200~`", "`\\x1b[201~`"),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.EnableImages]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.enableImages", "Enables image support in the terminal, this will only work when {0} is enabled. Sixel and iTerm's inline image protocol are supported on Linux and macOS. The kitty graphics protocol is supported on all platforms. On Windows, all image protocols will only work for versions of ConPTY >= v2 which is shipped with Windows itself, see also {1}. Images will currently not be restored between window reloads/reconnects. When enabled, transparency mode is also turned on in the terminal.", `\`#${TerminalSettingId.GpuAcceleration}#\``, `\`#${TerminalSettingId.WindowsUseConptyDll}#\``),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.FocusAfterRun]: {
    markdownDescription: localize("terminal.integrated.focusAfterRun", "Controls whether the terminal, accessible buffer, or neither will be focused after `Terminal: Run Selected Text In Active Terminal` has been run."),
    enum: ["terminal", "accessible-buffer", "none"],
    default: "none",
    tags: ["accessibility"],
    markdownEnumDescriptions: [
      localize("terminal.integrated.focusAfterRun.terminal", "Always focus the terminal."),
      localize("terminal.integrated.focusAfterRun.accessible-buffer", "Always focus the accessible buffer."),
      localize("terminal.integrated.focusAfterRun.none", "Do nothing.")
    ]
  },
  [TerminalSettingId.AllowInUntrustedWorkspace]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.allowInUntrustedWorkspace", "Controls whether terminals can be created in an untrusted workspace.\n\n**This feature bypasses a security protection that prevents terminals from launching in untrusted workspaces. The reason this is a security risk is because shells are often set up to potentially execute code automatically based on the contents of the current working directory. This should be safe to use provided your shell is set up in such a way that code execution in the folder never happens.**"),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.DeveloperPtyHostLatency]: {
    description: localize("terminal.integrated.developer.ptyHost.latency", "Simulated latency in milliseconds applied to all calls made to the pty host. This is useful for testing terminal behavior under high latency conditions."),
    type: "number",
    minimum: 0,
    default: 0,
    tags: ["advanced"]
  },
  [TerminalSettingId.DeveloperPtyHostStartupDelay]: {
    description: localize("terminal.integrated.developer.ptyHost.startupDelay", "Simulated startup delay in milliseconds for the pty host process. This is useful for testing terminal initialization under slow startup conditions."),
    type: "number",
    minimum: 0,
    default: 0,
    tags: ["advanced"]
  },
  [TerminalSettingId.DevMode]: {
    description: localize("terminal.integrated.developer.devMode", "Enable developer mode for the terminal. This shows additional debug information and visualizations for shell integration sequences."),
    type: "boolean",
    default: false,
    tags: ["advanced"]
  },
  ...terminalContribConfiguration
};
async function registerTerminalConfiguration(getFontSnippets) {
  const configurationRegistry = Registry.as(Extensions.Configuration);
  configurationRegistry.registerConfiguration({
    id: "terminal",
    order: 100,
    title: localize("terminalIntegratedConfigurationTitle", "Integrated Terminal"),
    type: "object",
    properties: terminalConfiguration
  });
  terminalConfiguration[TerminalSettingId.FontFamily].defaultSnippets = await getFontSnippets();
}
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: TerminalSettingId.EnableBell,
  migrateFn: (enableBell, accessor) => {
    const configurationKeyValuePairs = [];
    let announcement = accessor("accessibility.signals.terminalBell")?.announcement ?? accessor("accessibility.alert.terminalBell");
    if (announcement !== void 0 && !isString(announcement)) {
      announcement = announcement ? "auto" : "off";
    }
    configurationKeyValuePairs.push(["accessibility.signals.terminalBell", { value: { sound: enableBell ? "on" : "off", announcement } }]);
    configurationKeyValuePairs.push([TerminalSettingId.EnableBell, { value: void 0 }]);
    configurationKeyValuePairs.push([TerminalSettingId.EnableVisualBell, { value: enableBell }]);
    return configurationKeyValuePairs;
  }
}]);
export {
  defaultTerminalFontSize,
  registerTerminalConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxjb21tb25cXHRlcm1pbmFsQ29uZmlndXJhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWFTbmlwcGV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnksIHR5cGUgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTG9jYXRpb25Db25maWdWYWx1ZSwgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgdGVybWluYWxDb2xvclNjaGVtYSwgdGVybWluYWxJY29uU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsUGxhdGZvcm1Db25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLCBJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyB0ZXJtaW5hbENvbnRyaWJDb25maWd1cmF0aW9uLCBUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQgfSBmcm9tICcuLi90ZXJtaW5hbENvbnRyaWJFeHBvcnRzLmpzJztcbmltcG9ydCB7IERFRkFVTFRfQ09NTUFORFNfVE9fU0tJUF9TSEVMTCwgREVGQVVMVF9MRVRURVJfU1BBQ0lORywgREVGQVVMVF9MSU5FX0hFSUdIVCwgTUFYSU1VTV9GT05UX1dFSUdIVCwgTUlOSU1VTV9GT05UX1dFSUdIVCwgU1VHR0VTVElPTlNfRk9OVF9XRUlHSFQgfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcblxuY29uc3QgdGVybWluYWxEZXNjcmlwdG9ycyA9ICdcXG4tICcgKyBbXG5cdCdgXFwke2N3ZH1gOiAnICsgbG9jYWxpemUoXCJjd2RcIiwgXCJ0aGUgdGVybWluYWwncyBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5LlwiKSxcblx0J2BcXCR7Y3dkRm9sZGVyfWA6ICcgKyBsb2NhbGl6ZSgnY3dkRm9sZGVyJywgXCJ0aGUgdGVybWluYWwncyBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5LCBkaXNwbGF5ZWQgZm9yIG11bHRpLXJvb3Qgd29ya3NwYWNlcyBvciBpbiBhIHNpbmdsZSByb290IHdvcmtzcGFjZSB3aGVuIHRoZSB2YWx1ZSBkaWZmZXJzIGZyb20gdGhlIGluaXRpYWwgd29ya2luZyBkaXJlY3RvcnkuIE9uIFdpbmRvd3MsIHRoaXMgd2lsbCBvbmx5IGJlIGRpc3BsYXllZCB3aGVuIHNoZWxsIGludGVncmF0aW9uIGlzIGVuYWJsZWQuXCIpLFxuXHQnYFxcJHt3b3Jrc3BhY2VGb2xkZXJ9YDogJyArIGxvY2FsaXplKCd3b3Jrc3BhY2VGb2xkZXInLCBcInRoZSB3b3Jrc3BhY2UgaW4gd2hpY2ggdGhlIHRlcm1pbmFsIHdhcyBsYXVuY2hlZC5cIiksXG5cdCdgXFwke3dvcmtzcGFjZUZvbGRlck5hbWV9YDogJyArIGxvY2FsaXplKCd3b3Jrc3BhY2VGb2xkZXJOYW1lJywgXCJ0aGUgYG5hbWVgIG9mIHRoZSB3b3Jrc3BhY2UgaW4gd2hpY2ggdGhlIHRlcm1pbmFsIHdhcyBsYXVuY2hlZC5cIiksXG5cdCdgXFwke2xvY2FsfWA6ICcgKyBsb2NhbGl6ZSgnbG9jYWwnLCBcImluZGljYXRlcyBhIGxvY2FsIHRlcm1pbmFsIGluIGEgcmVtb3RlIHdvcmtzcGFjZS5cIiksXG5cdCdgXFwke3Byb2Nlc3N9YDogJyArIGxvY2FsaXplKCdwcm9jZXNzJywgXCJ0aGUgbmFtZSBvZiB0aGUgdGVybWluYWwgcHJvY2Vzcy5cIiksXG5cdCdgXFwke3Byb2dyZXNzfWA6ICcgKyBsb2NhbGl6ZSgncHJvZ3Jlc3MnLCBcInRoZSBwcm9ncmVzcyBzdGF0ZSBhcyByZXBvcnRlZCBieSB0aGUgYE9TQyA5OzRgIHNlcXVlbmNlLlwiKSxcblx0J2BcXCR7c2VwYXJhdG9yfWA6ICcgKyBsb2NhbGl6ZSgnc2VwYXJhdG9yJywgXCJhIGNvbmRpdGlvbmFsIHNlcGFyYXRvciB7MH0gdGhhdCBvbmx5IHNob3dzIHdoZW4gaXQncyBzdXJyb3VuZGVkIGJ5IHZhcmlhYmxlcyB3aXRoIHZhbHVlcyBvciBzdGF0aWMgdGV4dC5cIiwgJyhgIC0gYCknKSxcblx0J2BcXCR7c2VxdWVuY2V9YDogJyArIGxvY2FsaXplKCdzZXF1ZW5jZScsIFwidGhlIG5hbWUgcHJvdmlkZWQgdG8gdGhlIHRlcm1pbmFsIGJ5IHRoZSBwcm9jZXNzLlwiKSxcblx0J2BcXCR7dGFza31gOiAnICsgbG9jYWxpemUoJ3Rhc2snLCBcImluZGljYXRlcyB0aGlzIHRlcm1pbmFsIGlzIGFzc29jaWF0ZWQgd2l0aCBhIHRhc2suXCIpLFxuXHQnYFxcJHtzaGVsbFR5cGV9YDogJyArIGxvY2FsaXplKCdzaGVsbFR5cGUnLCBcInRoZSBkZXRlY3RlZCBzaGVsbCB0eXBlLlwiKSxcblx0J2BcXCR7c2hlbGxDb21tYW5kfWA6ICcgKyBsb2NhbGl6ZSgnc2hlbGxDb21tYW5kJywgXCJ0aGUgY29tbWFuZCBiZWluZyBleGVjdXRlZCBhY2NvcmRpbmcgdG8gc2hlbGwgaW50ZWdyYXRpb24uIFRoaXMgYWxzbyByZXF1aXJlcyBoaWdoIGNvbmZpZGVuY2UgaW4gdGhlIGRldGVjdGVkIGNvbW1hbmQgbGluZSwgd2hpY2ggbWF5IG5vdCB3b3JrIGluIHNvbWUgcHJvbXB0IGZyYW1ld29ya3MuXCIpLFxuXHQnYFxcJHtzaGVsbFByb21wdElucHV0fWA6ICcgKyBsb2NhbGl6ZSgnc2hlbGxQcm9tcHRJbnB1dCcsIFwidGhlIHNoZWxsJ3MgZnVsbCBwcm9tcHQgaW5wdXQgYWNjb3JkaW5nIHRvIHNoZWxsIGludGVncmF0aW9uLlwiKSxcbl0uam9pbignXFxuLSAnKTsgLy8gaW50ZW50aW9uYWxseSBjb25jYXRlbmF0ZWQgdG8gbm90IHByb2R1Y2UgYSBzdHJpbmcgdGhhdCBpcyB0b28gbG9uZyBmb3IgdHJhbnNsYXRpb25zXG5cbmxldCB0ZXJtaW5hbFRpdGxlID0gbG9jYWxpemUoJ3Rlcm1pbmFsVGl0bGUnLCBcIkNvbnRyb2xzIHRoZSB0ZXJtaW5hbCB0aXRsZS4gVmFyaWFibGVzIGFyZSBzdWJzdGl0dXRlZCBiYXNlZCBvbiB0aGUgY29udGV4dDpcIik7XG50ZXJtaW5hbFRpdGxlICs9IHRlcm1pbmFsRGVzY3JpcHRvcnM7XG5cbmxldCB0ZXJtaW5hbERlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3Rlcm1pbmFsRGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHRoZSB0ZXJtaW5hbCBkZXNjcmlwdGlvbiwgd2hpY2ggYXBwZWFycyB0byB0aGUgcmlnaHQgb2YgdGhlIHRpdGxlLiBWYXJpYWJsZXMgYXJlIHN1YnN0aXR1dGVkIGJhc2VkIG9uIHRoZSBjb250ZXh0OlwiKTtcbnRlcm1pbmFsRGVzY3JpcHRpb24gKz0gdGVybWluYWxEZXNjcmlwdG9ycztcblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRUZXJtaW5hbEZvbnRTaXplID0gaXNNYWNpbnRvc2ggPyAxMiA6IDE0O1xuXG5jb25zdCB0ZXJtaW5hbENvbmZpZ3VyYXRpb246IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+ID0ge1xuXHRbVGVybWluYWxTZXR0aW5nSWQuU2VuZEtleWJpbmRpbmdzVG9TaGVsbF06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zZW5kS2V5YmluZGluZ3NUb1NoZWxsJywgXCJEaXNwYXRjaGVzIG1vc3Qga2V5YmluZGluZ3MgdG8gdGhlIHRlcm1pbmFsIGluc3RlYWQgb2YgdGhlIHdvcmtiZW5jaCwgb3ZlcnJpZGluZyB7MH0sIHdoaWNoIGNhbiBiZSB1c2VkIGFsdGVybmF0aXZlbHkgZm9yIGZpbmUgdHVuaW5nLlwiLCAnYCN0ZXJtaW5hbC5pbnRlZ3JhdGVkLmNvbW1hbmRzVG9Ta2lwU2hlbGwjYCcpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGFic0RlZmF1bHRDb2xvcl06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5kZWZhdWx0Q29sb3InLCBcIkEgdGhlbWUgY29sb3IgSUQgdG8gYXNzb2NpYXRlIHdpdGggdGVybWluYWwgaWNvbnMgYnkgZGVmYXVsdC5cIiksXG5cdFx0Li4udGVybWluYWxDb2xvclNjaGVtYSxcblx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UYWJzRGVmYXVsdEljb25dOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuZGVmYXVsdEljb24nLCBcIkEgY29kaWNvbiBJRCB0byBhc3NvY2lhdGUgd2l0aCB0ZXJtaW5hbCBpY29ucyBieSBkZWZhdWx0LlwiKSxcblx0XHQuLi50ZXJtaW5hbEljb25TY2hlbWEsXG5cdFx0ZGVmYXVsdDogQ29kaWNvbi50ZXJtaW5hbC5pZCxcblx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UYWJzRW5hYmxlZF06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5lbmFibGVkJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGVybWluYWwgdGFicyBkaXNwbGF5IGFzIGEgbGlzdCB0byB0aGUgc2lkZSBvZiB0aGUgdGVybWluYWwuIFdoZW4gdGhpcyBpcyBkaXNhYmxlZCBhIGRyb3Bkb3duIHdpbGwgZGlzcGxheSBpbnN0ZWFkLicpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGFic0VuYWJsZUFuaW1hdGlvbl06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5lbmFibGVBbmltYXRpb24nLCAnQ29udHJvbHMgd2hldGhlciB0ZXJtaW5hbCB0YWIgc3RhdHVzZXMgc3VwcG9ydCBhbmltYXRpb24gKGVnLiBpbiBwcm9ncmVzcyB0YXNrcykuJyksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWUsXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UYWJzSGlkZUNvbmRpdGlvbl06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5oaWRlQ29uZGl0aW9uJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIHRlcm1pbmFsIHRhYnMgdmlldyB3aWxsIGhpZGUgdW5kZXIgY2VydGFpbiBjb25kaXRpb25zLicpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnbmV2ZXInLCAnc2luZ2xlVGVybWluYWwnLCAnc2luZ2xlR3JvdXAnXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmhpZGVDb25kaXRpb24ubmV2ZXInLCBcIk5ldmVyIGhpZGUgdGhlIHRlcm1pbmFsIHRhYnMgdmlld1wiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuaGlkZUNvbmRpdGlvbi5zaW5nbGVUZXJtaW5hbCcsIFwiSGlkZSB0aGUgdGVybWluYWwgdGFicyB2aWV3IHdoZW4gdGhlcmUgaXMgb25seSBhIHNpbmdsZSB0ZXJtaW5hbCBvcGVuZWRcIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmhpZGVDb25kaXRpb24uc2luZ2xlR3JvdXAnLCBcIkhpZGUgdGhlIHRlcm1pbmFsIHRhYnMgdmlldyB3aGVuIHRoZXJlIGlzIG9ubHkgYSBzaW5nbGUgdGVybWluYWwgZ3JvdXAgb3BlbmVkXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ3NpbmdsZVRlcm1pbmFsJyxcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlRhYnNTaG93QWN0aXZlVGVybWluYWxdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuc2hvd0FjdGl2ZVRlcm1pbmFsJywgJ1Nob3dzIHRoZSBhY3RpdmUgdGVybWluYWwgaW5mb3JtYXRpb24gaW4gdGhlIHZpZXcuIFRoaXMgaXMgcGFydGljdWxhcmx5IHVzZWZ1bCB3aGVuIHRoZSB0aXRsZSB3aXRoaW4gdGhlIHRhYnMgYXJlblxcJ3QgdmlzaWJsZS4nKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ2Fsd2F5cycsICdzaW5nbGVUZXJtaW5hbCcsICdzaW5nbGVUZXJtaW5hbE9yTmFycm93JywgJ25ldmVyJ10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5zaG93QWN0aXZlVGVybWluYWwuYWx3YXlzJywgXCJBbHdheXMgc2hvdyB0aGUgYWN0aXZlIHRlcm1pbmFsXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5zaG93QWN0aXZlVGVybWluYWwuc2luZ2xlVGVybWluYWwnLCBcIlNob3cgdGhlIGFjdGl2ZSB0ZXJtaW5hbCB3aGVuIGl0IGlzIHRoZSBvbmx5IHRlcm1pbmFsIG9wZW5lZFwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuc2hvd0FjdGl2ZVRlcm1pbmFsLnNpbmdsZVRlcm1pbmFsT3JOYXJyb3cnLCBcIlNob3cgdGhlIGFjdGl2ZSB0ZXJtaW5hbCB3aGVuIGl0IGlzIHRoZSBvbmx5IHRlcm1pbmFsIG9wZW5lZCBvciB3aGVuIHRoZSB0YWJzIHZpZXcgaXMgaW4gaXRzIG5hcnJvdyB0ZXh0bGVzcyBzdGF0ZVwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuc2hvd0FjdGl2ZVRlcm1pbmFsLm5ldmVyJywgXCJOZXZlciBzaG93IHRoZSBhY3RpdmUgdGVybWluYWxcIiksXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnc2luZ2xlVGVybWluYWxPck5hcnJvdycsXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UYWJzU2hvd0FjdGlvbnNdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuc2hvd0FjdGlvbnMnLCAnQ29udHJvbHMgd2hldGhlciB0ZXJtaW5hbCBzcGxpdCBhbmQga2lsbCBidXR0b25zIGFyZSBkaXNwbGF5cyBuZXh0IHRvIHRoZSBuZXcgdGVybWluYWwgYnV0dG9uLicpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnYWx3YXlzJywgJ3NpbmdsZVRlcm1pbmFsJywgJ3NpbmdsZVRlcm1pbmFsT3JOYXJyb3cnLCAnbmV2ZXInXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLnNob3dBY3Rpb25zLmFsd2F5cycsIFwiQWx3YXlzIHNob3cgdGhlIGFjdGlvbnNcIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLnNob3dBY3Rpb25zLnNpbmdsZVRlcm1pbmFsJywgXCJTaG93IHRoZSBhY3Rpb25zIHdoZW4gaXQgaXMgdGhlIG9ubHkgdGVybWluYWwgb3BlbmVkXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5zaG93QWN0aW9ucy5zaW5nbGVUZXJtaW5hbE9yTmFycm93JywgXCJTaG93IHRoZSBhY3Rpb25zIHdoZW4gaXQgaXMgdGhlIG9ubHkgdGVybWluYWwgb3BlbmVkIG9yIHdoZW4gdGhlIHRhYnMgdmlldyBpcyBpbiBpdHMgbmFycm93IHRleHRsZXNzIHN0YXRlXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5zaG93QWN0aW9ucy5uZXZlcicsIFwiTmV2ZXIgc2hvdyB0aGUgYWN0aW9uc1wiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdzaW5nbGVUZXJtaW5hbE9yTmFycm93Jyxcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlRhYnNMb2NhdGlvbl06IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ2xlZnQnLCAncmlnaHQnXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmxvY2F0aW9uLmxlZnQnLCBcIlNob3cgdGhlIHRlcm1pbmFsIHRhYnMgdmlldyB0byB0aGUgbGVmdCBvZiB0aGUgdGVybWluYWxcIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmxvY2F0aW9uLnJpZ2h0JywgXCJTaG93IHRoZSB0ZXJtaW5hbCB0YWJzIHZpZXcgdG8gdGhlIHJpZ2h0IG9mIHRoZSB0ZXJtaW5hbFwiKVxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ3JpZ2h0Jyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5sb2NhdGlvbicsIFwiQ29udHJvbHMgdGhlIGxvY2F0aW9uIG9mIHRoZSB0ZXJtaW5hbCB0YWJzLCBlaXRoZXIgdG8gdGhlIGxlZnQgb3IgcmlnaHQgb2YgdGhlIGFjdHVhbCB0ZXJtaW5hbChzKS5cIilcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkRlZmF1bHRMb2NhdGlvbl06IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbVGVybWluYWxMb2NhdGlvbkNvbmZpZ1ZhbHVlLkVkaXRvciwgVGVybWluYWxMb2NhdGlvbkNvbmZpZ1ZhbHVlLlRlcm1pbmFsVmlld10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZGVmYXVsdExvY2F0aW9uLmVkaXRvcicsIFwiQ3JlYXRlIHRlcm1pbmFscyBpbiB0aGUgZWRpdG9yXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZGVmYXVsdExvY2F0aW9uLnZpZXcnLCBcIkNyZWF0ZSB0ZXJtaW5hbHMgaW4gdGhlIHRlcm1pbmFsIHZpZXdcIilcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICd2aWV3Jyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZGVmYXVsdExvY2F0aW9uJywgXCJDb250cm9scyB3aGVyZSBuZXdseSBjcmVhdGVkIHRlcm1pbmFscyB3aWxsIGFwcGVhci5cIiksXG5cdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6ICd2aWV3JywgcmVhZE9ubHk6IHRydWUgfSxcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlRhYnNGb2N1c01vZGVdOiB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWydzaW5nbGVDbGljaycsICdkb3VibGVDbGljayddLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuZm9jdXNNb2RlLnNpbmdsZUNsaWNrJywgXCJGb2N1cyB0aGUgdGVybWluYWwgd2hlbiBjbGlja2luZyBhIHRlcm1pbmFsIHRhYlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuZm9jdXNNb2RlLmRvdWJsZUNsaWNrJywgXCJGb2N1cyB0aGUgdGVybWluYWwgd2hlbiBkb3VibGUtY2xpY2tpbmcgYSB0ZXJtaW5hbCB0YWJcIilcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdkb3VibGVDbGljaycsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuZm9jdXNNb2RlJywgXCJDb250cm9scyB3aGV0aGVyIGZvY3VzaW5nIHRoZSB0ZXJtaW5hbCBvZiBhIHRhYiBoYXBwZW5zIG9uIGRvdWJsZSBvciBzaW5nbGUgY2xpY2suXCIpXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UYWJzQWxsb3dBZ2VudENsaVRpdGxlXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmFsbG93QWdlbnRDbGlUaXRsZScsIFwiQ29udHJvbHMgd2hldGhlciBhZ2VudGljIENMSXMgKHN1Y2ggYXMgQ2xhdWRlIENvZGUsIENvZGV4LCBDb21tYW5kIENvZGUsIEdpdEh1YiBDb3BpbG90IENMSSwgYW5kIEdlbWluaSBDTEkpIGFyZSBhbGxvd2VkIHRvIHNldCB0aGUgdGVybWluYWwgdGFiIHRpdGxlIHZpYSBlc2NhcGUgc2VxdWVuY2VzLiBXaGVuIGRpc2FibGVkLCB0aGUgY29uZmlndXJlZCB0YWIgdGl0bGUgdGVtcGxhdGUgaXMgdXNlZCBpbnN0ZWFkLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLk1hY09wdGlvbklzTWV0YV06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQubWFjT3B0aW9uSXNNZXRhJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHRyZWF0IHRoZSBvcHRpb24ga2V5IGFzIHRoZSBtZXRhIGtleSBpbiB0aGUgdGVybWluYWwgb24gbWFjT1MuXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuTWFjT3B0aW9uQ2xpY2tGb3JjZXNTZWxlY3Rpb25dOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLm1hY09wdGlvbkNsaWNrRm9yY2VzU2VsZWN0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHRvIGZvcmNlIHNlbGVjdGlvbiB3aGVuIHVzaW5nIE9wdGlvbitjbGljayBvbiBtYWNPUy4gVGhpcyB3aWxsIGZvcmNlIGEgcmVndWxhciAobGluZSkgc2VsZWN0aW9uIGFuZCBkaXNhbGxvdyB0aGUgdXNlIG9mIGNvbHVtbiBzZWxlY3Rpb24gbW9kZS4gVGhpcyBlbmFibGVzIGNvcHlpbmcgYW5kIHBhc3RpbmcgdXNpbmcgdGhlIHJlZ3VsYXIgdGVybWluYWwgc2VsZWN0aW9uLCBmb3IgZXhhbXBsZSwgd2hlbiBtb3VzZSBtb2RlIGlzIGVuYWJsZWQgaW4gdG11eC5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5BbHRDbGlja01vdmVzQ3Vyc29yXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmFsdENsaWNrTW92ZXNDdXJzb3InLCBcIklmIGVuYWJsZWQsIGFsdC9vcHRpb24gKyBjbGljayB3aWxsIHJlcG9zaXRpb24gdGhlIHByb21wdCBjdXJzb3IgdG8gdW5kZXJuZWF0aCB0aGUgbW91c2Ugd2hlbiB7MH0gaXMgc2V0IHRvIHsxfSAodGhlIGRlZmF1bHQgdmFsdWUpLiBUaGlzIG1heSBub3Qgd29yayByZWxpYWJseSBkZXBlbmRpbmcgb24geW91ciBzaGVsbC5cIiwgJ2AjZWRpdG9yLm11bHRpQ3Vyc29yTW9kaWZpZXIjYCcsICdgXFwnYWx0XFwnYCcpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5Db3B5T25TZWxlY3Rpb25dOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmNvcHlPblNlbGVjdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0ZXh0IHNlbGVjdGVkIGluIHRoZSB0ZXJtaW5hbCB3aWxsIGJlIGNvcGllZCB0byB0aGUgY2xpcGJvYXJkLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2Vcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZU11bHRpTGluZVBhc3RlV2FybmluZ106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5lbmFibGVNdWx0aUxpbmVQYXN0ZVdhcm5pbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gc2hvdyBhIHdhcm5pbmcgZGlhbG9nIHdoZW4gcGFzdGluZyBtdWx0aXBsZSBsaW5lcyBpbnRvIHRoZSB0ZXJtaW5hbC5cIiksXG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWydhdXRvJywgJ2Fsd2F5cycsICduZXZlciddLFxuXHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW5hYmxlTXVsdGlMaW5lUGFzdGVXYXJuaW5nLmF1dG8nLCBcIkVuYWJsZSB0aGUgd2FybmluZyBidXQgZG8gbm90IHNob3cgaXQgd2hlbjpcXG5cXG4tIEJyYWNrZXRlZCBwYXN0ZSBtb2RlIGlzIGVuYWJsZWQgKHRoZSBzaGVsbCBzdXBwb3J0cyBtdWx0aS1saW5lIHBhc3RlIG5hdGl2ZWx5KVxcbi0gVGhlIHBhc3RlIGlzIGhhbmRsZWQgYnkgdGhlIHNoZWxsJ3MgcmVhZGxpbmUgKGluIHRoZSBjYXNlIG9mIHB3c2gpXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW5hYmxlTXVsdGlMaW5lUGFzdGVXYXJuaW5nLmFsd2F5cycsIFwiQWx3YXlzIHNob3cgdGhlIHdhcm5pbmcgaWYgdGhlIHRleHQgY29udGFpbnMgYSBuZXcgbGluZS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5lbmFibGVNdWx0aUxpbmVQYXN0ZVdhcm5pbmcubmV2ZXInLCBcIk5ldmVyIHNob3cgdGhlIHdhcm5pbmcuXCIpXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnYXV0bydcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkRyYXdCb2xkVGV4dEluQnJpZ2h0Q29sb3JzXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5kcmF3Qm9sZFRleHRJbkJyaWdodENvbG9ycycsIFwiQ29udHJvbHMgd2hldGhlciBib2xkIHRleHQgaW4gdGhlIHRlcm1pbmFsIHdpbGwgYWx3YXlzIHVzZSB0aGUgXFxcImJyaWdodFxcXCIgQU5TSSBjb2xvciB2YXJpYW50LlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRm9udEZhbWlseV06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5mb250RmFtaWx5JywgXCJDb250cm9scyB0aGUgZm9udCBmYW1pbHkgb2YgdGhlIHRlcm1pbmFsLiBEZWZhdWx0cyB0byB7MH0ncyB2YWx1ZS5cIiwgJ2AjZWRpdG9yLmZvbnRGYW1pbHkjYCcpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRm9udExpZ2F0dXJlc0VuYWJsZWRdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZm9udExpZ2F0dXJlcy5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIGZvbnQgbGlnYXR1cmVzIGFyZSBlbmFibGVkIGluIHRoZSB0ZXJtaW5hbC4gTGlnYXR1cmVzIHdpbGwgb25seSB3b3JrIGlmIHRoZSBjb25maWd1cmVkIHswfSBzdXBwb3J0cyB0aGVtLlwiLCBgXFxgIyR7VGVybWluYWxTZXR0aW5nSWQuRm9udEZhbWlseX0jXFxgYCksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5Gb250TGlnYXR1cmVzRmVhdHVyZVNldHRpbmdzXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRMaWdhdHVyZXMuZmVhdHVyZVNldHRpbmdzJywgXCJDb250cm9scyB3aGF0IGZvbnQgZmVhdHVyZSBzZXR0aW5ncyBhcmUgdXNlZCB3aGVuIGxpZ2F0dXJlcyBhcmUgZW5hYmxlZCwgaW4gdGhlIGZvcm1hdCBvZiB0aGUgYGZvbnQtZmVhdHVyZS1zZXR0aW5nc2AgQ1NTIHByb3BlcnR5LiBTb21lIGV4YW1wbGVzIHdoaWNoIG1heSBiZSB2YWxpZCBkZXBlbmRpbmcgb24gdGhlIGZvbnQ6XCIpICsgJ1xcblxcbi0gJyArIFtcblx0XHRcdGBcXGBcImNhbHRcIiBvZmYsIFwic3MwM1wiXFxgYCxcblx0XHRcdGBcXGBcImxpZ2FcIiBvblxcYGAsXG5cdFx0XHRgXFxgXCJjYWx0XCIgb2ZmLCBcImRsaWdcIiBvblxcYGBcblx0XHRdLmpvaW4oJ1xcbi0gJyksXG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZGVmYXVsdDogJ1wiY2FsdFwiIG9uJ1xuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRm9udExpZ2F0dXJlc0ZhbGxiYWNrTGlnYXR1cmVzXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRMaWdhdHVyZXMuZmFsbGJhY2tMaWdhdHVyZXMnLCBcIldoZW4gezB9IGlzIGVuYWJsZWQgYW5kIHRoZSBwYXJ0aWN1bGFyIHsxfSBjYW5ub3QgYmUgcGFyc2VkLCB0aGlzIGlzIHRoZSBzZXQgb2YgY2hhcmFjdGVyIHNlcXVlbmNlcyB0aGF0IHdpbGwgYWx3YXlzIGJlIGRyYXduIHRvZ2V0aGVyLiBUaGlzIGFsbG93cyB0aGUgdXNlIG9mIGEgZml4ZWQgc2V0IG9mIGxpZ2F0dXJlcyBldmVuIHdoZW4gdGhlIGZvbnQgaXNuJ3Qgc3VwcG9ydGVkLlwiLCBgXFxgIyR7VGVybWluYWxTZXR0aW5nSWQuR3B1QWNjZWxlcmF0aW9ufSNcXGBgLCBgXFxgIyR7VGVybWluYWxTZXR0aW5nSWQuRm9udEZhbWlseX0jXFxgYCksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczogW3sgdHlwZTogJ3N0cmluZycgfV0sXG5cdFx0ZGVmYXVsdDogW1xuXHRcdFx0JzwtLScsICc8LS0tJywgJzw8LScsICc8LScsICctPicsICctPj4nLCAnLS0+JywgJy0tLT4nLFxuXHRcdFx0Jzw9PScsICc8PT09JywgJzw8PScsICc8PScsICc9PicsICc9Pj4nLCAnPT0+JywgJz09PT4nLCAnPj0nLCAnPj49Jyxcblx0XHRcdCc8LT4nLCAnPC0tPicsICc8LS0tPicsICc8LS0tLT4nLCAnPD0+JywgJzw9PT4nLCAnPD09PT4nLCAnPD09PT0+JywgJzo6JywgJzo6OicsXG5cdFx0XHQnPH5+JywgJzwvJywgJzwvPicsICcvPicsICd+fj4nLCAnPT0nLCAnIT0nLCAnLz0nLCAnfj0nLCAnPD4nLCAnPT09JywgJyE9PScsICchPT09Jyxcblx0XHRcdCc8OicsICc6PScsICcqPScsICcqKycsICc8KicsICc8Kj4nLCAnKj4nLCAnPHwnLCAnPHw+JywgJ3w+JywgJysqJywgJz0qJywgJz06JywgJzo+Jyxcblx0XHRcdCcvKicsICcqLycsICcrKysnLCAnPCEtLScsICc8IS0tLSdcblx0XHRdXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5Gb250U2l6ZV06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZm9udFNpemUnLCBcIkNvbnRyb2xzIHRoZSBmb250IHNpemUgaW4gcGl4ZWxzIG9mIHRoZSB0ZXJtaW5hbC5cIiksXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0ZGVmYXVsdDogZGVmYXVsdFRlcm1pbmFsRm9udFNpemUsXG5cdFx0bWluaW11bTogNixcblx0XHRtYXhpbXVtOiAxMDBcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkxldHRlclNwYWNpbmddOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmxldHRlclNwYWNpbmcnLCBcIkNvbnRyb2xzIHRoZSBsZXR0ZXIgc3BhY2luZyBvZiB0aGUgdGVybWluYWwuIFRoaXMgaXMgYW4gaW50ZWdlciB2YWx1ZSB3aGljaCByZXByZXNlbnRzIHRoZSBudW1iZXIgb2YgYWRkaXRpb25hbCBwaXhlbHMgdG8gYWRkIGJldHdlZW4gY2hhcmFjdGVycy5cIiksXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0ZGVmYXVsdDogREVGQVVMVF9MRVRURVJfU1BBQ0lOR1xuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuTGluZUhlaWdodF06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQubGluZUhlaWdodCcsIFwiQ29udHJvbHMgdGhlIGxpbmUgaGVpZ2h0IG9mIHRoZSB0ZXJtaW5hbC4gVGhpcyBudW1iZXIgaXMgbXVsdGlwbGllZCBieSB0aGUgdGVybWluYWwgZm9udCBzaXplIHRvIGdldCB0aGUgYWN0dWFsIGxpbmUtaGVpZ2h0IGluIHBpeGVscy5cIiksXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0ZGVmYXVsdDogREVGQVVMVF9MSU5FX0hFSUdIVFxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuTWluaW11bUNvbnRyYXN0UmF0aW9dOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQubWluaW11bUNvbnRyYXN0UmF0aW8nLCBcIldoZW4gc2V0LCB0aGUgZm9yZWdyb3VuZCBjb2xvciBvZiBlYWNoIGNlbGwgd2lsbCBjaGFuZ2UgdG8gdHJ5IG1lZXQgdGhlIGNvbnRyYXN0IHJhdGlvIHNwZWNpZmllZC4gTm90ZSB0aGF0IHRoaXMgd2lsbCBub3QgYXBwbHkgdG8gYHBvd2VybGluZWAgY2hhcmFjdGVycyBwZXIgIzE0NjQwNi4gRXhhbXBsZSB2YWx1ZXM6XFxuXFxuLSAxOiBEbyBub3RoaW5nIGFuZCB1c2UgdGhlIHN0YW5kYXJkIHRoZW1lIGNvbG9ycy5cXG4tIDQuNTogW1dDQUcgQUEgY29tcGxpYW5jZSAobWluaW11bSldKGh0dHBzOi8vd3d3LnczLm9yZy9UUi9VTkRFUlNUQU5ESU5HLVdDQUcyMC92aXN1YWwtYXVkaW8tY29udHJhc3QtY29udHJhc3QuaHRtbCkgKGRlZmF1bHQpLlxcbi0gNzogW1dDQUcgQUFBIGNvbXBsaWFuY2UgKGVuaGFuY2VkKV0oaHR0cHM6Ly93d3cudzMub3JnL1RSL1VOREVSU1RBTkRJTkctV0NBRzIwL3Zpc3VhbC1hdWRpby1jb250cmFzdDcuaHRtbCkuXFxuLSAyMTogV2hpdGUgb24gYmxhY2sgb3IgYmxhY2sgb24gd2hpdGUuXCIpLFxuXHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdGRlZmF1bHQ6IDQuNSxcblx0XHR0YWdzOiBbJ2FjY2Vzc2liaWxpdHknXVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGFiU3RvcFdpZHRoXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYlN0b3BXaWR0aCcsIFwiVGhlIG51bWJlciBvZiBjZWxscyBpbiBhIHRhYiBzdG9wLlwiKSxcblx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRtaW5pbXVtOiAxLFxuXHRcdGRlZmF1bHQ6IDhcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkZhc3RTY3JvbGxTZW5zaXRpdml0eV06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHknLCBcIlNjcm9sbGluZyBzcGVlZCBtdWx0aXBsaWVyIHdoZW4gcHJlc3NpbmcgYEFsdGAuXCIpLFxuXHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdGRlZmF1bHQ6IDVcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLk1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eV06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHknLCBcIkEgbXVsdGlwbGllciB0byBiZSB1c2VkIG9uIHRoZSBgZGVsdGFZYCBvZiBtb3VzZSB3aGVlbCBzY3JvbGwgZXZlbnRzLlwiKSxcblx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRkZWZhdWx0OiAxXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5CZWxsRHVyYXRpb25dOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuYmVsbER1cmF0aW9uJywgXCJUaGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byBzaG93IHRoZSBiZWxsIHdpdGhpbiBhIHRlcm1pbmFsIHRhYiB3aGVuIHRyaWdnZXJlZC5cIiksXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0ZGVmYXVsdDogMTAwMFxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRm9udFdlaWdodF06IHtcblx0XHQnYW55T2YnOiBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRtaW5pbXVtOiBNSU5JTVVNX0ZPTlRfV0VJR0hULFxuXHRcdFx0XHRtYXhpbXVtOiBNQVhJTVVNX0ZPTlRfV0VJR0hULFxuXHRcdFx0XHRlcnJvck1lc3NhZ2U6IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRXZWlnaHRFcnJvcicsIFwiT25seSBcXFwibm9ybWFsXFxcIiBhbmQgXFxcImJvbGRcXFwiIGtleXdvcmRzIG9yIG51bWJlcnMgYmV0d2VlbiAxIGFuZCAxMDAwIGFyZSBhbGxvd2VkLlwiKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHBhdHRlcm46ICdeKG5vcm1hbHxib2xkfDEwMDB8WzEtOV1bMC05XXswLDJ9KSQnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRlbnVtOiBTVUdHRVNUSU9OU19GT05UX1dFSUdIVCxcblx0XHRcdH1cblx0XHRdLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5mb250V2VpZ2h0JywgXCJUaGUgZm9udCB3ZWlnaHQgdG8gdXNlIHdpdGhpbiB0aGUgdGVybWluYWwgZm9yIG5vbi1ib2xkIHRleHQuIEFjY2VwdHMgXFxcIm5vcm1hbFxcXCIgYW5kIFxcXCJib2xkXFxcIiBrZXl3b3JkcyBvciBudW1iZXJzIGJldHdlZW4gMSBhbmQgMTAwMC5cIiksXG5cdFx0ZGVmYXVsdDogJ25vcm1hbCdcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkZvbnRXZWlnaHRCb2xkXToge1xuXHRcdCdhbnlPZic6IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdG1pbmltdW06IE1JTklNVU1fRk9OVF9XRUlHSFQsXG5cdFx0XHRcdG1heGltdW06IE1BWElNVU1fRk9OVF9XRUlHSFQsXG5cdFx0XHRcdGVycm9yTWVzc2FnZTogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZm9udFdlaWdodEVycm9yJywgXCJPbmx5IFxcXCJub3JtYWxcXFwiIGFuZCBcXFwiYm9sZFxcXCIga2V5d29yZHMgb3IgbnVtYmVycyBiZXR3ZWVuIDEgYW5kIDEwMDAgYXJlIGFsbG93ZWQuXCIpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0cGF0dGVybjogJ14obm9ybWFsfGJvbGR8MTAwMHxbMS05XVswLTldezAsMn0pJCdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGVudW06IFNVR0dFU1RJT05TX0ZPTlRfV0VJR0hULFxuXHRcdFx0fVxuXHRcdF0sXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRXZWlnaHRCb2xkJywgXCJUaGUgZm9udCB3ZWlnaHQgdG8gdXNlIHdpdGhpbiB0aGUgdGVybWluYWwgZm9yIGJvbGQgdGV4dC4gQWNjZXB0cyBcXFwibm9ybWFsXFxcIiBhbmQgXFxcImJvbGRcXFwiIGtleXdvcmRzIG9yIG51bWJlcnMgYmV0d2VlbiAxIGFuZCAxMDAwLlwiKSxcblx0XHRkZWZhdWx0OiAnYm9sZCdcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkN1cnNvckJsaW5raW5nXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jdXJzb3JCbGlua2luZycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgdGVybWluYWwgY3Vyc29yIGJsaW5rcy5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UZXh0QmxpbmtpbmddOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRleHRCbGlua2luZycsIFwiQ29udHJvbHMgd2hldGhlciB0ZXh0IGJsaW5raW5nIGlzIGVuYWJsZWQgaW4gdGhlIHRlcm1pbmFsLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2Vcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkN1cnNvclN0eWxlXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jdXJzb3JTdHlsZScsIFwiQ29udHJvbHMgdGhlIHN0eWxlIG9mIHRlcm1pbmFsIGN1cnNvciB3aGVuIHRoZSB0ZXJtaW5hbCBpcyBmb2N1c2VkLlwiKSxcblx0XHRlbnVtOiBbJ2Jsb2NrJywgJ2xpbmUnLCAndW5kZXJsaW5lJ10sXG5cdFx0ZGVmYXVsdDogJ2Jsb2NrJ1xuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQ3Vyc29yU3R5bGVJbmFjdGl2ZV06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY3Vyc29yU3R5bGVJbmFjdGl2ZScsIFwiQ29udHJvbHMgdGhlIHN0eWxlIG9mIHRlcm1pbmFsIGN1cnNvciB3aGVuIHRoZSB0ZXJtaW5hbCBpcyBub3QgZm9jdXNlZC5cIiksXG5cdFx0ZW51bTogWydvdXRsaW5lJywgJ2Jsb2NrJywgJ2xpbmUnLCAndW5kZXJsaW5lJywgJ25vbmUnXSxcblx0XHRkZWZhdWx0OiAnb3V0bGluZSdcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkN1cnNvcldpZHRoXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmN1cnNvcldpZHRoJywgXCJDb250cm9scyB0aGUgd2lkdGggb2YgdGhlIGN1cnNvciB3aGVuIHswfSBpcyBzZXQgdG8gezF9LlwiLCAnYCN0ZXJtaW5hbC5pbnRlZ3JhdGVkLmN1cnNvclN0eWxlI2AnLCAnYGxpbmVgJyksXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0ZGVmYXVsdDogMVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuU2Nyb2xsYmFja106IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2Nyb2xsYmFjaycsIFwiQ29udHJvbHMgdGhlIG1heGltdW0gbnVtYmVyIG9mIGxpbmVzIHRoZSB0ZXJtaW5hbCBrZWVwcyBpbiBpdHMgYnVmZmVyLiBXZSBwcmUtYWxsb2NhdGUgbWVtb3J5IGJhc2VkIG9uIHRoaXMgdmFsdWUgaW4gb3JkZXIgdG8gZW5zdXJlIGEgc21vb3RoIGV4cGVyaWVuY2UuIEFzIHN1Y2gsIGFzIHRoZSB2YWx1ZSBpbmNyZWFzZXMsIHNvIHdpbGwgdGhlIGFtb3VudCBvZiBtZW1vcnkuXCIpLFxuXHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdGRlZmF1bHQ6IDEwMDBcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkRldGVjdExvY2FsZV06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5kZXRlY3RMb2NhbGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gZGV0ZWN0IGFuZCBzZXQgdGhlIGAkTEFOR2AgZW52aXJvbm1lbnQgdmFyaWFibGUgdG8gYSBVVEYtOCBjb21wbGlhbnQgb3B0aW9uIHNpbmNlIFZTIENvZGUncyB0ZXJtaW5hbCBvbmx5IHN1cHBvcnRzIFVURi04IGVuY29kZWQgZGF0YSBjb21pbmcgZnJvbSB0aGUgc2hlbGwuXCIpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnYXV0bycsICdvZmYnLCAnb24nXSxcblx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRldGVjdExvY2FsZS5hdXRvJywgXCJTZXQgdGhlIGAkTEFOR2AgZW52aXJvbm1lbnQgdmFyaWFibGUgaWYgdGhlIGV4aXN0aW5nIHZhcmlhYmxlIGRvZXMgbm90IGV4aXN0IG9yIGl0IGRvZXMgbm90IGVuZCBpbiBgJy5VVEYtOCdgLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRldGVjdExvY2FsZS5vZmYnLCBcIkRvIG5vdCBzZXQgdGhlIGAkTEFOR2AgZW52aXJvbm1lbnQgdmFyaWFibGUuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZGV0ZWN0TG9jYWxlLm9uJywgXCJBbHdheXMgc2V0IHRoZSBgJExBTkdgIGVudmlyb25tZW50IHZhcmlhYmxlLlwiKVxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2F1dG8nXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5HcHVBY2NlbGVyYXRpb25dOiB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWydhdXRvJywgJ29uJywgJ29mZiddLFxuXHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZ3B1QWNjZWxlcmF0aW9uLmF1dG8nLCBcIkxldCBWUyBDb2RlIGRldGVjdCB3aGljaCByZW5kZXJlciB3aWxsIGdpdmUgdGhlIGJlc3QgZXhwZXJpZW5jZS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5ncHVBY2NlbGVyYXRpb24ub24nLCBcIkVuYWJsZSBHUFUgYWNjZWxlcmF0aW9uIHdpdGhpbiB0aGUgdGVybWluYWwuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZ3B1QWNjZWxlcmF0aW9uLm9mZicsIFwiRGlzYWJsZSBHUFUgYWNjZWxlcmF0aW9uIHdpdGhpbiB0aGUgdGVybWluYWwuIFRoZSB0ZXJtaW5hbCB3aWxsIHJlbmRlciBtdWNoIHNsb3dlciB3aGVuIEdQVSBhY2NlbGVyYXRpb24gaXMgb2ZmIGJ1dCBpdCBzaG91bGQgcmVsaWFibHkgd29yayBvbiBhbGwgc3lzdGVtcy5cIiksXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnYXV0bycsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmdwdUFjY2VsZXJhdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgdGVybWluYWwgd2lsbCBsZXZlcmFnZSB0aGUgR1BVIHRvIGRvIGl0cyByZW5kZXJpbmcuXCIpXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UZXJtaW5hbFRpdGxlU2VwYXJhdG9yXToge1xuXHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0J2RlZmF1bHQnOiAnIC0gJyxcblx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKFwidGVybWluYWwuaW50ZWdyYXRlZC50YWJzLnNlcGFyYXRvclwiLCBcIlNlcGFyYXRvciB1c2VkIGJ5IHswfSBhbmQgezF9LlwiLCBgXFxgIyR7VGVybWluYWxTZXR0aW5nSWQuVGVybWluYWxUaXRsZX0jXFxgYCwgYFxcYCMke1Rlcm1pbmFsU2V0dGluZ0lkLlRlcm1pbmFsRGVzY3JpcHRpb259I1xcYGApXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UZXJtaW5hbFRpdGxlXToge1xuXHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0J2RlZmF1bHQnOiAnJHtwcm9jZXNzfScsXG5cdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiB0ZXJtaW5hbFRpdGxlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UZXJtaW5hbERlc2NyaXB0aW9uXToge1xuXHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0J2RlZmF1bHQnOiAnJHt0YXNrfSR7c2VwYXJhdG9yfSR7bG9jYWx9JHtzZXBhcmF0b3J9JHtjd2RGb2xkZXJ9Jyxcblx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IHRlcm1pbmFsRGVzY3JpcHRpb25cblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlJpZ2h0Q2xpY2tCZWhhdmlvcl06IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ2RlZmF1bHQnLCAnY29weVBhc3RlJywgJ3Bhc3RlJywgJ3NlbGVjdFdvcmQnLCAnbm90aGluZyddLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnJpZ2h0Q2xpY2tCZWhhdmlvci5kZWZhdWx0JywgXCJTaG93IHRoZSBjb250ZXh0IG1lbnUuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQucmlnaHRDbGlja0JlaGF2aW9yLmNvcHlQYXN0ZScsIFwiQ29weSB3aGVuIHRoZXJlIGlzIGEgc2VsZWN0aW9uLCBvdGhlcndpc2UgcGFzdGUuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQucmlnaHRDbGlja0JlaGF2aW9yLnBhc3RlJywgXCJQYXN0ZSBvbiByaWdodCBjbGljay5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5yaWdodENsaWNrQmVoYXZpb3Iuc2VsZWN0V29yZCcsIFwiU2VsZWN0IHRoZSB3b3JkIHVuZGVyIHRoZSBjdXJzb3IgYW5kIHNob3cgdGhlIGNvbnRleHQgbWVudS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5yaWdodENsaWNrQmVoYXZpb3Iubm90aGluZycsIFwiRG8gbm90aGluZyBhbmQgcGFzcyBldmVudCB0byB0ZXJtaW5hbC5cIilcblx0XHRdLFxuXHRcdGRlZmF1bHQ6IGlzTWFjaW50b3NoID8gJ3NlbGVjdFdvcmQnIDogaXNXaW5kb3dzID8gJ2NvcHlQYXN0ZScgOiAnZGVmYXVsdCcsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnJpZ2h0Q2xpY2tCZWhhdmlvcicsIFwiQ29udHJvbHMgaG93IHRlcm1pbmFsIHJlYWN0cyB0byByaWdodCBjbGljay5cIilcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLk1pZGRsZUNsaWNrQmVoYXZpb3JdOiB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWydkZWZhdWx0JywgJ3Bhc3RlJ10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQubWlkZGxlQ2xpY2tCZWhhdmlvci5kZWZhdWx0JywgXCJUaGUgcGxhdGZvcm0gZGVmYXVsdCB0byBmb2N1cyB0aGUgdGVybWluYWwuIE9uIExpbnV4IHRoaXMgd2lsbCBhbHNvIHBhc3RlIHRoZSBzZWxlY3Rpb24uXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQubWlkZGxlQ2xpY2tCZWhhdmlvci5wYXN0ZScsIFwiUGFzdGUgb24gbWlkZGxlIGNsaWNrLlwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdkZWZhdWx0Jyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQubWlkZGxlQ2xpY2tCZWhhdmlvcicsIFwiQ29udHJvbHMgaG93IHRlcm1pbmFsIHJlYWN0cyB0byBtaWRkbGUgY2xpY2suXCIpXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5Dd2RdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY3dkJywgXCJBbiBleHBsaWNpdCBzdGFydCBwYXRoIHdoZXJlIHRoZSB0ZXJtaW5hbCB3aWxsIGJlIGxhdW5jaGVkLCB0aGlzIGlzIHVzZWQgYXMgdGhlIGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnkgKGN3ZCkgZm9yIHRoZSBzaGVsbCBwcm9jZXNzLiBUaGlzIG1heSBiZSBwYXJ0aWN1bGFybHkgdXNlZnVsIGluIHdvcmtzcGFjZSBzZXR0aW5ncyBpZiB0aGUgcm9vdCBkaXJlY3RvcnkgaXMgbm90IGEgY29udmVuaWVudCBjd2QuXCIpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGRlZmF1bHQ6IHVuZGVmaW5lZCxcblx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5Db25maXJtT25FeGl0XToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jb25maXJtT25FeGl0JywgXCJDb250cm9scyB3aGV0aGVyIHRvIGNvbmZpcm0gd2hlbiB0aGUgd2luZG93IGNsb3NlcyBpZiB0aGVyZSBhcmUgYWN0aXZlIHRlcm1pbmFsIHNlc3Npb25zLiBCYWNrZ3JvdW5kIHRlcm1pbmFscyBsaWtlIHRob3NlIGxhdW5jaGVkIGJ5IHNvbWUgZXh0ZW5zaW9ucyB3aWxsIG5vdCB0cmlnZ2VyIHRoZSBjb25maXJtYXRpb24uXCIpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnbmV2ZXInLCAnYWx3YXlzJywgJ2hhc0NoaWxkUHJvY2Vzc2VzJ10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY29uZmlybU9uRXhpdC5uZXZlcicsIFwiTmV2ZXIgY29uZmlybS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jb25maXJtT25FeGl0LmFsd2F5cycsIFwiQWx3YXlzIGNvbmZpcm0gaWYgdGhlcmUgYXJlIHRlcm1pbmFscy5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jb25maXJtT25FeGl0Lmhhc0NoaWxkUHJvY2Vzc2VzJywgXCJDb25maXJtIGlmIHRoZXJlIGFyZSBhbnkgdGVybWluYWxzIHRoYXQgaGF2ZSBjaGlsZCBwcm9jZXNzZXMuXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ25ldmVyJ1xuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQ29uZmlybU9uS2lsbF06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY29uZmlybU9uS2lsbCcsIFwiQ29udHJvbHMgd2hldGhlciB0byBjb25maXJtIGtpbGxpbmcgdGVybWluYWxzIHdoZW4gdGhleSBoYXZlIGNoaWxkIHByb2Nlc3Nlcy4gV2hlbiBzZXQgdG8gZWRpdG9yLCB0ZXJtaW5hbHMgaW4gdGhlIGVkaXRvciBhcmVhIHdpbGwgYmUgbWFya2VkIGFzIGNoYW5nZWQgd2hlbiB0aGV5IGhhdmUgY2hpbGQgcHJvY2Vzc2VzLiBOb3RlIHRoYXQgY2hpbGQgcHJvY2VzcyBkZXRlY3Rpb24gbWF5IG5vdCB3b3JrIHdlbGwgZm9yIHNoZWxscyBsaWtlIEdpdCBCYXNoIHdoaWNoIGRvbid0IHJ1biB0aGVpciBwcm9jZXNzZXMgYXMgY2hpbGQgcHJvY2Vzc2VzIG9mIHRoZSBzaGVsbC4gQmFja2dyb3VuZCB0ZXJtaW5hbHMgbGlrZSB0aG9zZSBsYXVuY2hlZCBieSBzb21lIGV4dGVuc2lvbnMgd2lsbCBub3QgdHJpZ2dlciB0aGUgY29uZmlybWF0aW9uLlwiKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ25ldmVyJywgJ2VkaXRvcicsICdwYW5lbCcsICdhbHdheXMnXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jb25maXJtT25LaWxsLm5ldmVyJywgXCJOZXZlciBjb25maXJtLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmNvbmZpcm1PbktpbGwuZWRpdG9yJywgXCJDb25maXJtIGlmIHRoZSB0ZXJtaW5hbCBpcyBpbiB0aGUgZWRpdG9yLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmNvbmZpcm1PbktpbGwucGFuZWwnLCBcIkNvbmZpcm0gaWYgdGhlIHRlcm1pbmFsIGlzIGluIHRoZSBwYW5lbC5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jb25maXJtT25LaWxsLmFsd2F5cycsIFwiQ29uZmlybSBpZiB0aGUgdGVybWluYWwgaXMgZWl0aGVyIGluIHRoZSBlZGl0b3Igb3IgcGFuZWwuXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2VkaXRvcidcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZUJlbGxdOiB7XG5cdFx0bWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVuYWJsZUJlbGwnLCBcIlRoaXMgaXMgbm93IGRlcHJlY2F0ZWQuIEluc3RlYWQgdXNlIHRoZSBgdGVybWluYWwuaW50ZWdyYXRlZC5lbmFibGVWaXN1YWxCZWxsYCBhbmQgYGFjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbEJlbGxgIHNldHRpbmdzLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2Vcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZVZpc3VhbEJlbGxdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVuYWJsZVZpc3VhbEJlbGwnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHZpc3VhbCB0ZXJtaW5hbCBiZWxsIGlzIGVuYWJsZWQuIFRoaXMgc2hvd3MgdXAgbmV4dCB0byB0aGUgdGVybWluYWwncyBuYW1lLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2Vcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkNvbW1hbmRzVG9Ta2lwU2hlbGxdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoXG5cdFx0XHQndGVybWluYWwuaW50ZWdyYXRlZC5jb21tYW5kc1RvU2tpcFNoZWxsJyxcblx0XHRcdFwiQSBzZXQgb2YgY29tbWFuZCBJRHMgd2hvc2Uga2V5YmluZGluZ3Mgd2lsbCBub3QgYmUgc2VudCB0byB0aGUgc2hlbGwgYnV0IGluc3RlYWQgYWx3YXlzIGJlIGhhbmRsZWQgYnkgVlMgQ29kZS4gVGhpcyBhbGxvd3Mga2V5YmluZGluZ3MgdGhhdCB3b3VsZCBub3JtYWxseSBiZSBjb25zdW1lZCBieSB0aGUgc2hlbGwgdG8gYWN0IGluc3RlYWQgdGhlIHNhbWUgYXMgd2hlbiB0aGUgdGVybWluYWwgaXMgbm90IGZvY3VzZWQsIGZvciBleGFtcGxlIGBDdHJsK1BgIHRvIGxhdW5jaCBRdWljayBPcGVuLlxcblxcbiZuYnNwO1xcblxcbk1hbnkgY29tbWFuZHMgYXJlIHNraXBwZWQgYnkgZGVmYXVsdC4gVG8gb3ZlcnJpZGUgYSBkZWZhdWx0IGFuZCBwYXNzIHRoYXQgY29tbWFuZCdzIGtleWJpbmRpbmcgdG8gdGhlIHNoZWxsIGluc3RlYWQsIGFkZCB0aGUgY29tbWFuZCBwcmVmaXhlZCB3aXRoIHRoZSBgLWAgY2hhcmFjdGVyLiBGb3IgZXhhbXBsZSBhZGQgYC13b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlbmAgdG8gYWxsb3cgYEN0cmwrUGAgdG8gcmVhY2ggdGhlIHNoZWxsLlxcblxcbiZuYnNwO1xcblxcblRoZSBmb2xsb3dpbmcgbGlzdCBvZiBkZWZhdWx0IHNraXBwZWQgY29tbWFuZHMgaXMgdHJ1bmNhdGVkIHdoZW4gdmlld2VkIGluIFNldHRpbmdzIEVkaXRvci4gVG8gc2VlIHRoZSBmdWxsIGxpc3QsIHsxfSBhbmQgc2VhcmNoIGZvciB0aGUgZmlyc3QgY29tbWFuZCBmcm9tIHRoZSBsaXN0IGJlbG93LlxcblxcbiZuYnNwO1xcblxcbkRlZmF1bHQgU2tpcHBlZCBDb21tYW5kczpcXG5cXG57MH1cIixcblx0XHRcdERFRkFVTFRfQ09NTUFORFNfVE9fU0tJUF9TSEVMTC5zb3J0KCkubWFwKGNvbW1hbmQgPT4gYC0gJHtjb21tYW5kfWApLmpvaW4oJ1xcbicpLFxuXHRcdFx0YFske2xvY2FsaXplKCdvcGVuRGVmYXVsdFNldHRpbmdzSnNvbicsIFwib3BlbiB0aGUgZGVmYXVsdCBzZXR0aW5ncyBKU09OXCIpfV0oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5SYXdEZWZhdWx0U2V0dGluZ3MgJyR7bG9jYWxpemUoJ29wZW5EZWZhdWx0U2V0dGluZ3NKc29uLmNhcGl0YWxpemVkJywgXCJPcGVuIERlZmF1bHQgU2V0dGluZ3MgKEpTT04pXCIpfScpYCxcblxuXHRcdCksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGRlZmF1bHQ6IFtdXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5BbGxvd0Nob3Jkc106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hbGxvd0Nob3JkcycsIFwiV2hldGhlciBvciBub3QgdG8gYWxsb3cgY2hvcmQga2V5YmluZGluZ3MgaW4gdGhlIHRlcm1pbmFsLiBOb3RlIHRoYXQgd2hlbiB0aGlzIGlzIHRydWUgYW5kIHRoZSBrZXlzdHJva2UgcmVzdWx0cyBpbiBhIGNob3JkIGl0IHdpbGwgYnlwYXNzIHswfSwgc2V0dGluZyB0aGlzIHRvIGZhbHNlIGlzIHBhcnRpY3VsYXJseSB1c2VmdWwgd2hlbiB5b3Ugd2FudCBjdHJsK2sgdG8gZ28gdG8geW91ciBzaGVsbCAobm90IFZTIENvZGUpLlwiLCAnYCN0ZXJtaW5hbC5pbnRlZ3JhdGVkLmNvbW1hbmRzVG9Ta2lwU2hlbGwjYCcpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5BbGxvd01uZW1vbmljc106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hbGxvd01uZW1vbmljcycsIFwiV2hldGhlciB0byBhbGxvdyBtZW51YmFyIG1uZW1vbmljcyAoZm9yIGV4YW1wbGUgQWx0K0YpIHRvIHRyaWdnZXIgdGhlIG9wZW4gb2YgdGhlIG1lbnViYXIuIE5vdGUgdGhhdCB0aGlzIHdpbGwgY2F1c2UgYWxsIGFsdCBrZXlzdHJva2VzIHRvIHNraXAgdGhlIHNoZWxsIHdoZW4gdHJ1ZS4gVGhpcyBkb2VzIG5vdGhpbmcgb24gbWFjT1MuXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRW52TWFjT3NdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5lbnYub3N4JywgXCJPYmplY3Qgd2l0aCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgdGhhdCB3aWxsIGJlIGFkZGVkIHRvIHRoZSBWUyBDb2RlIHByb2Nlc3MgdG8gYmUgdXNlZCBieSB0aGUgdGVybWluYWwgb24gbWFjT1MuIFNldCB0byBgbnVsbGAgdG8gZGVsZXRlIHRoZSBlbnZpcm9ubWVudCB2YXJpYWJsZS5cIiksXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXVxuXHRcdH0sXG5cdFx0ZGVmYXVsdDoge31cblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVudkxpbnV4XToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW52LmxpbnV4JywgXCJPYmplY3Qgd2l0aCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgdGhhdCB3aWxsIGJlIGFkZGVkIHRvIHRoZSBWUyBDb2RlIHByb2Nlc3MgdG8gYmUgdXNlZCBieSB0aGUgdGVybWluYWwgb24gTGludXguIFNldCB0byBgbnVsbGAgdG8gZGVsZXRlIHRoZSBlbnZpcm9ubWVudCB2YXJpYWJsZS5cIiksXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXVxuXHRcdH0sXG5cdFx0ZGVmYXVsdDoge31cblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVudldpbmRvd3NdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5lbnYud2luZG93cycsIFwiT2JqZWN0IHdpdGggZW52aXJvbm1lbnQgdmFyaWFibGVzIHRoYXQgd2lsbCBiZSBhZGRlZCB0byB0aGUgVlMgQ29kZSBwcm9jZXNzIHRvIGJlIHVzZWQgYnkgdGhlIHRlcm1pbmFsIG9uIFdpbmRvd3MuIFNldCB0byBgbnVsbGAgdG8gZGVsZXRlIHRoZSBlbnZpcm9ubWVudCB2YXJpYWJsZS5cIiksXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXVxuXHRcdH0sXG5cdFx0ZGVmYXVsdDoge31cblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVudmlyb25tZW50Q2hhbmdlc1JlbGF1bmNoXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVudmlyb25tZW50Q2hhbmdlc1JlbGF1bmNoJywgXCJXaGV0aGVyIHRvIHJlbGF1bmNoIHRlcm1pbmFscyBhdXRvbWF0aWNhbGx5IGlmIGV4dGVuc2lvbnMgd2FudCB0byBjb250cmlidXRlIHRvIHRoZWlyIGVudmlyb25tZW50IGFuZCBoYXZlIG5vdCBiZWVuIGludGVyYWN0ZWQgd2l0aCB5ZXQuXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5TaG93RXhpdEFsZXJ0XToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zaG93RXhpdEFsZXJ0JywgXCJDb250cm9scyB3aGV0aGVyIHRvIHNob3cgdGhlIGFsZXJ0IFxcXCJUaGUgdGVybWluYWwgcHJvY2VzcyB0ZXJtaW5hdGVkIHdpdGggZXhpdCBjb2RlXFxcIiB3aGVuIGV4aXQgY29kZSBpcyBub24temVyby5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWVcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLldpbmRvd3NVc2VDb25wdHlEbGxdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC53aW5kb3dzVXNlQ29ucHR5RGxsJywgXCJXaGV0aGVyIHRvIHVzZSB0aGUgY29ucHR5LmRsbCAodjEuMjUuMjYwMzAzMDAyKSBzaGlwcGVkIHdpdGggVlMgQ29kZSwgaW5zdGVhZCBvZiB0aGUgb25lIGJ1bmRsZWQgd2l0aCBXaW5kb3dzLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlNwbGl0Q3dkXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zcGxpdEN3ZCcsIFwiQ29udHJvbHMgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGEgc3BsaXQgdGVybWluYWwgc3RhcnRzIHdpdGguXCIpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnd29ya3NwYWNlUm9vdCcsICdpbml0aWFsJywgJ2luaGVyaXRlZCddLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNwbGl0Q3dkLndvcmtzcGFjZVJvb3QnLCBcIkEgbmV3IHNwbGl0IHRlcm1pbmFsIHdpbGwgdXNlIHRoZSB3b3Jrc3BhY2Ugcm9vdCBhcyB0aGUgd29ya2luZyBkaXJlY3RvcnkuIEluIGEgbXVsdGktcm9vdCB3b3Jrc3BhY2UgYSBjaG9pY2UgZm9yIHdoaWNoIHJvb3QgZm9sZGVyIHRvIHVzZSBpcyBvZmZlcmVkLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNwbGl0Q3dkLmluaXRpYWwnLCBcIkEgbmV3IHNwbGl0IHRlcm1pbmFsIHdpbGwgdXNlIHRoZSB3b3JraW5nIGRpcmVjdG9yeSB0aGF0IHRoZSBwYXJlbnQgdGVybWluYWwgc3RhcnRlZCB3aXRoLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNwbGl0Q3dkLmluaGVyaXRlZCcsIFwiT24gbWFjT1MgYW5kIExpbnV4LCBhIG5ldyBzcGxpdCB0ZXJtaW5hbCB3aWxsIHVzZSB0aGUgd29ya2luZyBkaXJlY3Rvcnkgb2YgdGhlIHBhcmVudCB0ZXJtaW5hbC4gT24gV2luZG93cywgdGhpcyBiZWhhdmVzIHRoZSBzYW1lIGFzIGluaXRpYWwuXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2luaGVyaXRlZCdcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLldvcmRTZXBhcmF0b3JzXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLndvcmRTZXBhcmF0b3JzJywgXCJBIHN0cmluZyBjb250YWluaW5nIGFsbCBjaGFyYWN0ZXJzIHRvIGJlIGNvbnNpZGVyZWQgd29yZCBzZXBhcmF0b3JzIHdoZW4gZG91YmxlLWNsaWNraW5nIHRvIHNlbGVjdCB3b3JkIGFuZCBpbiB0aGUgZmFsbGJhY2sgJ3dvcmQnIGxpbmsgZGV0ZWN0aW9uLiBTaW5jZSB0aGlzIGlzIHVzZWQgZm9yIGxpbmsgZGV0ZWN0aW9uLCBpbmNsdWRpbmcgY2hhcmFjdGVycyBzdWNoIGFzIGA6YCB0aGF0IGFyZSB1c2VkIHdoZW4gZGV0ZWN0aW5nIGxpbmtzIHdpbGwgY2F1c2UgdGhlIGxpbmUgYW5kIGNvbHVtbiBwYXJ0IG9mIGxpbmtzIGxpa2UgYGZpbGU6MTA6NWAgdG8gYmUgaWdub3JlZC5cIiksXG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0ZGVmYXVsdDogJyAoKVtde31cXCcsXCJgXHUyNTAwXHUyMDE4XHUyMDE5XHUyMDFDXHUyMDFEfCdcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZUZpbGVMaW5rc106IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW5hYmxlRmlsZUxpbmtzJywgXCJXaGV0aGVyIHRvIGVuYWJsZSBmaWxlIGxpbmtzIGluIHRlcm1pbmFscy4gTGlua3MgY2FuIGJlIHNsb3cgd2hlbiB3b3JraW5nIG9uIGEgbmV0d29yayBkcml2ZSBpbiBwYXJ0aWN1bGFyIGJlY2F1c2UgZWFjaCBmaWxlIGxpbmsgaXMgdmVyaWZpZWQgYWdhaW5zdCB0aGUgZmlsZSBzeXN0ZW0uIENoYW5naW5nIHRoaXMgd2lsbCB0YWtlIGVmZmVjdCBvbmx5IGluIG5ldyB0ZXJtaW5hbHMuXCIpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnb2ZmJywgJ29uJywgJ25vdFJlbW90ZSddLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCdlbmFibGVGaWxlTGlua3Mub2ZmJywgXCJBbHdheXMgb2ZmLlwiKSxcblx0XHRcdGxvY2FsaXplKCdlbmFibGVGaWxlTGlua3Mub24nLCBcIkFsd2F5cyBvbi5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnZW5hYmxlRmlsZUxpbmtzLm5vdFJlbW90ZScsIFwiRW5hYmxlIG9ubHkgd2hlbiBub3QgaW4gYSByZW1vdGUgd29ya3NwYWNlLlwiKVxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ29uJ1xuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQWxsb3dlZExpbmtTY2hlbWVzXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hbGxvd2VkTGlua1NjaGVtZXMnLCBcIkFuIGFycmF5IG9mIHN0cmluZ3MgY29udGFpbmluZyB0aGUgVVJJIHNjaGVtZXMgdGhhdCB0aGUgdGVybWluYWwgaXMgYWxsb3dlZCB0byBvcGVuIGxpbmtzIGZvci4gQnkgZGVmYXVsdCwgb25seSBhIHNtYWxsIHN1YnNldCBvZiBwb3NzaWJsZSBzY2hlbWVzIGFyZSBhbGxvd2VkIGZvciBzZWN1cml0eSByZWFzb25zLlwiKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0ZGVmYXVsdDogW1xuXHRcdFx0J2ZpbGUnLFxuXHRcdFx0J2h0dHAnLFxuXHRcdFx0J2h0dHBzJyxcblx0XHRcdCdtYWlsdG8nLFxuXHRcdFx0J3ZzY29kZScsXG5cdFx0XHQndnNjb2RlLWluc2lkZXJzJyxcblx0XHRdXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5Vbmljb2RlVmVyc2lvbl06IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJzYnLCAnMTEnXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC51bmljb2RlVmVyc2lvbi5zaXgnLCBcIlZlcnNpb24gNiBvZiBVbmljb2RlLiBUaGlzIGlzIGFuIG9sZGVyIHZlcnNpb24gd2hpY2ggc2hvdWxkIHdvcmsgYmV0dGVyIG9uIG9sZGVyIHN5c3RlbXMuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudW5pY29kZVZlcnNpb24uZWxldmVuJywgXCJWZXJzaW9uIDExIG9mIFVuaWNvZGUuIFRoaXMgdmVyc2lvbiBwcm92aWRlcyBiZXR0ZXIgc3VwcG9ydCBvbiBtb2Rlcm4gc3lzdGVtcyB0aGF0IHVzZSBtb2Rlcm4gdmVyc2lvbnMgb2YgVW5pY29kZS5cIilcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICcxMScsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnVuaWNvZGVWZXJzaW9uJywgXCJDb250cm9scyB3aGF0IHZlcnNpb24gb2YgVW5pY29kZSB0byB1c2Ugd2hlbiBldmFsdWF0aW5nIHRoZSB3aWR0aCBvZiBjaGFyYWN0ZXJzIGluIHRoZSB0ZXJtaW5hbC4gSWYgeW91IGV4cGVyaWVuY2UgZW1vamkgb3Igb3RoZXIgd2lkZSBjaGFyYWN0ZXJzIG5vdCB0YWtpbmcgdXAgdGhlIHJpZ2h0IGFtb3VudCBvZiBzcGFjZSBvciBiYWNrc3BhY2UgZWl0aGVyIGRlbGV0aW5nIHRvbyBtdWNoIG9yIHRvbyBsaXR0bGUgdGhlbiB5b3UgbWF5IHdhbnQgdG8gdHJ5IHR3ZWFraW5nIHRoaXMgc2V0dGluZy5cIilcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZVBlcnNpc3RlbnRTZXNzaW9uc106IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW5hYmxlUGVyc2lzdGVudFNlc3Npb25zJywgXCJQZXJzaXN0IHRlcm1pbmFsIHNlc3Npb25zL2hpc3RvcnkgZm9yIHRoZSB3b3Jrc3BhY2UgYWNyb3NzIHdpbmRvdyByZWxvYWRzLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuUGVyc2lzdGVudFNlc3Npb25SZXZpdmVQcm9jZXNzXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnBlcnNpc3RlbnRTZXNzaW9uUmV2aXZlUHJvY2VzcycsIFwiV2hlbiB0aGUgdGVybWluYWwgcHJvY2VzcyBtdXN0IGJlIHNodXQgZG93biAoZm9yIGV4YW1wbGUgb24gd2luZG93IG9yIGFwcGxpY2F0aW9uIGNsb3NlKSwgdGhpcyBkZXRlcm1pbmVzIHdoZW4gdGhlIHByZXZpb3VzIHRlcm1pbmFsIHNlc3Npb24gY29udGVudHMvaGlzdG9yeSBzaG91bGQgYmUgcmVzdG9yZWQgYW5kIHByb2Nlc3NlcyBiZSByZWNyZWF0ZWQgd2hlbiB0aGUgd29ya3NwYWNlIGlzIG5leHQgb3BlbmVkLlxcblxcbkNhdmVhdHM6XFxuXFxuLSBSZXN0b3Jpbmcgb2YgdGhlIHByb2Nlc3MgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSBkZXBlbmRzIG9uIHdoZXRoZXIgaXQgaXMgc3VwcG9ydGVkIGJ5IHRoZSBzaGVsbC5cXG4tIFRpbWUgdG8gcGVyc2lzdCB0aGUgc2Vzc2lvbiBkdXJpbmcgc2h1dGRvd24gaXMgbGltaXRlZCwgc28gaXQgbWF5IGJlIGFib3J0ZWQgd2hlbiB1c2luZyBoaWdoLWxhdGVuY3kgcmVtb3RlIGNvbm5lY3Rpb25zLlwiKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ29uRXhpdCcsICdvbkV4aXRBbmRXaW5kb3dDbG9zZScsICduZXZlciddLFxuXHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQucGVyc2lzdGVudFNlc3Npb25SZXZpdmVQcm9jZXNzLm9uRXhpdCcsIFwiUmV2aXZlIHRoZSBwcm9jZXNzZXMgYWZ0ZXIgdGhlIGxhc3Qgd2luZG93IGlzIGNsb3NlZCBvbiBXaW5kb3dzL0xpbnV4IG9yIHdoZW4gdGhlIGB3b3JrYmVuY2guYWN0aW9uLnF1aXRgIGNvbW1hbmQgaXMgdHJpZ2dlcmVkIChjb21tYW5kIHBhbGV0dGUsIGtleWJpbmRpbmcsIG1lbnUpLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnBlcnNpc3RlbnRTZXNzaW9uUmV2aXZlUHJvY2Vzcy5vbkV4aXRBbmRXaW5kb3dDbG9zZScsIFwiUmV2aXZlIHRoZSBwcm9jZXNzZXMgYWZ0ZXIgdGhlIGxhc3Qgd2luZG93IGlzIGNsb3NlZCBvbiBXaW5kb3dzL0xpbnV4IG9yIHdoZW4gdGhlIGB3b3JrYmVuY2guYWN0aW9uLnF1aXRgIGNvbW1hbmQgaXMgdHJpZ2dlcmVkIChjb21tYW5kIHBhbGV0dGUsIGtleWJpbmRpbmcsIG1lbnUpLCBvciB3aGVuIHRoZSB3aW5kb3cgaXMgY2xvc2VkLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnBlcnNpc3RlbnRTZXNzaW9uUmV2aXZlUHJvY2Vzcy5uZXZlcicsIFwiTmV2ZXIgcmVzdG9yZSB0aGUgdGVybWluYWwgYnVmZmVycyBvciByZWNyZWF0ZSB0aGUgcHJvY2Vzcy5cIilcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdvbkV4aXQnXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5IaWRlT25TdGFydHVwXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5oaWRlT25TdGFydHVwJywgXCJXaGV0aGVyIHRvIGhpZGUgdGhlIHRlcm1pbmFsIHZpZXcgb24gc3RhcnR1cCwgYXZvaWRpbmcgY3JlYXRpbmcgYSB0ZXJtaW5hbCB3aGVuIHRoZXJlIGFyZSBubyBwZXJzaXN0ZW50IHNlc3Npb25zLlwiKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ25ldmVyJywgJ3doZW5FbXB0eScsICdhbHdheXMnXSxcblx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCdoaWRlT25TdGFydHVwLm5ldmVyJywgXCJOZXZlciBoaWRlIHRoZSB0ZXJtaW5hbCB2aWV3IG9uIHN0YXJ0dXAuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2hpZGVPblN0YXJ0dXAud2hlbkVtcHR5JywgXCJPbmx5IGhpZGUgdGhlIHRlcm1pbmFsIHdoZW4gdGhlcmUgYXJlIG5vIHBlcnNpc3RlbnQgc2Vzc2lvbnMgcmVzdG9yZWQuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2hpZGVPblN0YXJ0dXAuYWx3YXlzJywgXCJBbHdheXMgaGlkZSB0aGUgdGVybWluYWwsIGV2ZW4gd2hlbiB0aGVyZSBhcmUgcGVyc2lzdGVudCBzZXNzaW9ucyByZXN0b3JlZC5cIilcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICduZXZlcicsXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5IaWRlT25MYXN0Q2xvc2VkXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5oaWRlT25MYXN0Q2xvc2VkJywgXCJXaGV0aGVyIHRvIGhpZGUgdGhlIHRlcm1pbmFsIHZpZXcgd2hlbiB0aGUgbGFzdCB0ZXJtaW5hbCBpcyBjbG9zZWQuIFRoaXMgd2lsbCBvbmx5IGhhcHBlbiB3aGVuIHRoZSB0ZXJtaW5hbCBpcyB0aGUgb25seSB2aXNpYmxlIHZpZXcgaW4gdGhlIHZpZXcgY29udGFpbmVyLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQ3VzdG9tR2x5cGhzXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmN1c3RvbUdseXBocycsIFwiV2hldGhlciB0byBkcmF3IGN1c3RvbSBnbHlwaHMgaW5zdGVhZCBvZiB1c2luZyB0aGUgZm9udCBmb3IgdGhlIGZvbGxvd2luZyB1bmljb2RlIHJhbmdlczpcXG5cXG57MH1cXG5cXG5UaGlzIHdpbGwgdHlwaWNhbGx5IHJlc3VsdCBpbiBiZXR0ZXIgcmVuZGVyaW5nIHdpdGggY29udGludW91cyBsaW5lcywgZXZlbiB3aGVuIGxpbmUgaGVpZ2h0IGFuZCBsZXR0ZXIgc3BhY2luZyBpcyB1c2VkLiBUaGlzIGZlYXR1cmUgb25seSB3b3JrcyB3aGVuIHsxfSBpcyBlbmFibGVkLlwiLCBbXG5cdFx0XHQnLSBCb3ggRHJhd2luZyAoVSsyNTAwLVUrMjU3RiknLFxuXHRcdFx0Jy0gQmxvY2sgRWxlbWVudHMgKFUrMjU4MC1VKzI1OUYpJyxcblx0XHRcdCctIEJyYWlsbGUgUGF0dGVybnMgKFUrMjgwMC1VKzI4RkYpJyxcblx0XHRcdCctIFBvd2VybGluZSBTeW1ib2xzIChVK0UwQTAtVStFMEQ0LCBQcml2YXRlIFVzZSBBcmVhKScsXG5cdFx0XHQnLSBQcm9ncmVzcyBJbmRpY2F0b3JzIChVK0VFMDAtVStFRTBCLCBQcml2YXRlIFVzZSBBcmVhKScsXG5cdFx0XHQnLSBHaXQgQnJhbmNoIFN5bWJvbHMgKFUrRjVEMC1VK0Y2MEQsIFByaXZhdGUgVXNlIEFyZWEpJyxcblx0XHRcdCctIFN5bWJvbHMgZm9yIExlZ2FjeSBDb21wdXRpbmcgKFUrMUZCMDAtVSsxRkJGRiknXG5cdFx0XS5qb2luKCdcXG4nKSwgYFxcYCMke1Rlcm1pbmFsU2V0dGluZ0lkLkdwdUFjY2VsZXJhdGlvbn0jXFxgYCksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWVcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlJlc2NhbGVPdmVybGFwcGluZ0dseXBoc106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5yZXNjYWxlT3ZlcmxhcHBpbmdHbHlwaHMnLCBcIldoZXRoZXIgdG8gcmVzY2FsZSBnbHlwaHMgaG9yaXpvbnRhbGx5IHRoYXQgYXJlIGEgc2luZ2xlIGNlbGwgd2lkZSBidXQgaGF2ZSBnbHlwaHMgdGhhdCB3b3VsZCBvdmVybGFwIGZvbGxvd2luZyBjZWxsKHMpLiBUaGlzIHR5cGljYWxseSBoYXBwZW5zIGZvciBhbWJpZ3VvdXMgd2lkdGggY2hhcmFjdGVycyAoZWcuIHRoZSByb21hbiBudW1lcmFsIGNoYXJhY3RlcnMgVSsyMTYwKykgd2hpY2ggYXJlbid0IGZlYXR1cmVkIGluIG1vbm9zcGFjZSBmb250cy4gRW1vamkgZ2x5cGhzIGFyZSBuZXZlciByZXNjYWxlZC5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWVcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZUtpdHR5S2V5Ym9hcmRQcm90b2NvbF06IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVuYWJsZUtpdHR5S2V5Ym9hcmRQcm90b2NvbCcsIFwiV2hldGhlciB0byBlbmFibGUgdGhlIGtpdHR5IGtleWJvYXJkIHByb3RvY29sLCB3aGljaCBhbGxvd3MgYSBwcm9ncmFtIGluIHRoZSB0ZXJtaW5hbCB0byByZXF1ZXN0IG1vcmUgZGV0YWlsZWQga2V5Ym9hcmQgaW5wdXQgcmVwb3J0aW5nLiBUaGlzIGNhbiwgZm9yIGV4YW1wbGUsIGVuYWJsZSBgU2hpZnQrRW50ZXJgIHRvIGJlIGhhbmRsZWQgYnkgdGhlIHByb2dyYW0uXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdHRhZ3M6IFsnYWR2YW5jZWQnXVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRW5hYmxlV2luMzJJbnB1dE1vZGVdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5lbmFibGVXaW4zMklucHV0TW9kZScsIFwiV2hldGhlciB0byBlbmFibGUgdGhlIHdpbjMyIGlucHV0IG1vZGUsIHdoaWNoIHByb3ZpZGVzIGVuaGFuY2VkIGtleWJvYXJkIGlucHV0IHN1cHBvcnQgb24gV2luZG93cy5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0fVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWRdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbEludGVncmF0aW9uLmVuYWJsZWQnLCBcIkRldGVybWluZXMgd2hldGhlciBvciBub3Qgc2hlbGwgaW50ZWdyYXRpb24gaXMgYXV0by1pbmplY3RlZCB0byBzdXBwb3J0IGZlYXR1cmVzIGxpa2UgZW5oYW5jZWQgY29tbWFuZCB0cmFja2luZyBhbmQgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSBkZXRlY3Rpb24uIFxcblxcblNoZWxsIGludGVncmF0aW9uIHdvcmtzIGJ5IGluamVjdGluZyB0aGUgc2hlbGwgd2l0aCBhIHN0YXJ0dXAgc2NyaXB0LiBUaGUgc2NyaXB0IGdpdmVzIFZTIENvZGUgaW5zaWdodCBpbnRvIHdoYXQgaXMgaGFwcGVuaW5nIHdpdGhpbiB0aGUgdGVybWluYWwuXFxuXFxuU3VwcG9ydGVkIHNoZWxsczpcXG5cXG4tIExpbnV4L21hY09TOiBiYXNoLCBmaXNoLCBwd3NoLCB6c2hcXG4gLSBXaW5kb3dzOiBwd3NoLCBnaXQgYmFzaFxcblxcblRoaXMgc2V0dGluZyBhcHBsaWVzIG9ubHkgd2hlbiB0ZXJtaW5hbHMgYXJlIGNyZWF0ZWQsIHNvIHlvdSB3aWxsIG5lZWQgdG8gcmVzdGFydCB5b3VyIHRlcm1pbmFscyBmb3IgaXQgdG8gdGFrZSBlZmZlY3QuXFxuXFxuIE5vdGUgdGhhdCB0aGUgc2NyaXB0IGluamVjdGlvbiBtYXkgbm90IHdvcmsgaWYgeW91IGhhdmUgY3VzdG9tIGFyZ3VtZW50cyBkZWZpbmVkIGluIHRoZSB0ZXJtaW5hbCBwcm9maWxlLCBoYXZlIGVuYWJsZWQgezF9LCBoYXZlIGEgW2NvbXBsZXggYmFzaCBgUFJPTVBUX0NPTU1BTkRgXShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2VkaXRvci9pbnRlZ3JhdGVkLXRlcm1pbmFsI19jb21wbGV4LWJhc2gtcHJvbXB0Y29tbWFuZCksIG9yIG90aGVyIHVuc3VwcG9ydGVkIHNldHVwLiBUbyBkaXNhYmxlIGRlY29yYXRpb25zLCBzZWUgezB9XCIsICdgI3Rlcm1pbmFsLmludGVncmF0ZWQuc2hlbGxJbnRlZ3JhdGlvbi5kZWNvcmF0aW9uc0VuYWJsZWQjYCcsICdgI2VkaXRvci5hY2Nlc3NpYmlsaXR5U3VwcG9ydCNgJyksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWVcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25EZWNvcmF0aW9uc0VuYWJsZWRdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbEludGVncmF0aW9uLmRlY29yYXRpb25zRW5hYmxlZCcsIFwiV2hlbiBzaGVsbCBpbnRlZ3JhdGlvbiBpcyBlbmFibGVkLCBhZGRzIGEgZGVjb3JhdGlvbiBmb3IgZWFjaCBjb21tYW5kLlwiKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ2JvdGgnLCAnZ3V0dGVyJywgJ292ZXJ2aWV3UnVsZXInLCAnbmV2ZXInXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbEludGVncmF0aW9uLmRlY29yYXRpb25zRW5hYmxlZC5ib3RoJywgXCJTaG93IGRlY29yYXRpb25zIGluIHRoZSBndXR0ZXIgKGxlZnQpIGFuZCBvdmVydmlldyBydWxlciAocmlnaHQpXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hlbGxJbnRlZ3JhdGlvbi5kZWNvcmF0aW9uc0VuYWJsZWQuZ3V0dGVyJywgXCJTaG93IGd1dHRlciBkZWNvcmF0aW9ucyB0byB0aGUgbGVmdCBvZiB0aGUgdGVybWluYWxcIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbEludGVncmF0aW9uLmRlY29yYXRpb25zRW5hYmxlZC5vdmVydmlld1J1bGVyJywgXCJTaG93IG92ZXJ2aWV3IHJ1bGVyIGRlY29yYXRpb25zIHRvIHRoZSByaWdodCBvZiB0aGUgdGVybWluYWxcIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbEludGVncmF0aW9uLmRlY29yYXRpb25zRW5hYmxlZC5uZXZlcicsIFwiRG8gbm90IHNob3cgZGVjb3JhdGlvbnNcIiksXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnYm90aCdcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25UaW1lb3V0XToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hlbGxJbnRlZ3JhdGlvbi50aW1lb3V0JywgXCJDb25maWd1cmVzIHRoZSBkdXJhdGlvbiBpbiBtaWxsaXNlY29uZHMgdG8gd2FpdCBmb3Igc2hlbGwgaW50ZWdyYXRpb24gYWZ0ZXIgbGF1bmNoIGJlZm9yZSBkZWNsYXJpbmcgaXQncyBub3QgdGhlcmUuIFRoZSBkZWZhdWx0IHZhbHVlIHswfSB1c2VzIGEgdmFyaWFibGUgd2FpdCB0aW1lIGJhc2VkIG9uIHdoZXRoZXIgc2hlbGwgaW50ZWdyYXRpb24gaW5qZWN0aW9uIGlzIGVuYWJsZWQgYW5kIHdoZXRoZXIgaXQncyBhIHJlbW90ZSB3aW5kb3cuIFZhbHVlcyBiZXR3ZWVuIDEgYW5kIDQ5OSBhcmUgY2xhbXBlZCB0byA1MDBtcy4gQ29uc2lkZXIgc2V0dGluZyB0aGlzIHRvIGEgbGFyZ2UgdmFsdWUgaWYgeW91ciBzaGVsbCBzdGFydHMgdmVyeSBzbG93bHkuXCIsICdgLTFgJyksXG5cdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdG1pbmltdW06IC0xLFxuXHRcdG1heGltdW06IDYwMDAwLFxuXHRcdGRlZmF1bHQ6IC0xXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uUXVpY2tGaXhFbmFibGVkXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hlbGxJbnRlZ3JhdGlvbi5xdWlja0ZpeEVuYWJsZWQnLCBcIldoZW4gc2hlbGwgaW50ZWdyYXRpb24gaXMgZW5hYmxlZCwgZW5hYmxlcyBxdWljayBmaXhlcyBmb3IgdGVybWluYWwgY29tbWFuZHMgdGhhdCBhcHBlYXIgYXMgYSBsaWdodGJ1bGIgb3Igc3BhcmtsZSBpY29uIHRvIHRoZSBsZWZ0IG9mIHRoZSBwcm9tcHQuXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uRW52aXJvbm1lbnRSZXBvcnRpbmddOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hlbGxJbnRlZ3JhdGlvbi5lbnZpcm9ubWVudFJlcG9ydGluZycsIFwiQ29udHJvbHMgd2hldGhlciB0byByZXBvcnQgdGhlIHNoZWxsIGVudmlyb25tZW50LCBlbmFibGluZyBpdHMgdXNlIGluIGZlYXR1cmVzIHN1Y2ggYXMgezB9LiBUaGlzIG1heSBjYXVzZSBhIHNsb3dkb3duIHdoZW4gcHJpbnRpbmcgeW91ciBzaGVsbCdzIHByb21wdC5cIiwgYFxcYCMke1Rlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5TdWdnZXN0RW5hYmxlZH0jXFxgYCksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZSdcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlNtb290aFNjcm9sbGluZ106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zbW9vdGhTY3JvbGxpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHRlcm1pbmFsIHdpbGwgc2Nyb2xsIHVzaW5nIGFuIGFuaW1hdGlvbi5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5JZ25vcmVCcmFja2V0ZWRQYXN0ZU1vZGVdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuaWdub3JlQnJhY2tldGVkUGFzdGVNb2RlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSB0ZXJtaW5hbCB3aWxsIGlnbm9yZSBicmFja2V0ZWQgcGFzdGUgbW9kZSBldmVuIGlmIHRoZSB0ZXJtaW5hbCB3YXMgcHV0IGludG8gdGhlIG1vZGUsIG9taXR0aW5nIHRoZSB7MH0gYW5kIHsxfSBzZXF1ZW5jZXMgd2hlbiBwYXN0aW5nLiBUaGlzIGlzIHVzZWZ1bCB3aGVuIHRoZSBzaGVsbCBpcyBub3QgcmVzcGVjdGluZyB0aGUgbW9kZSB3aGljaCBjYW4gaGFwcGVuIGluIHN1Yi1zaGVsbHMgZm9yIGV4YW1wbGUuXCIsICdgXFxcXHgxYlsyMDB+YCcsICdgXFxcXHgxYlsyMDF+YCcpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRW5hYmxlSW1hZ2VzXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW5hYmxlSW1hZ2VzJywgXCJFbmFibGVzIGltYWdlIHN1cHBvcnQgaW4gdGhlIHRlcm1pbmFsLCB0aGlzIHdpbGwgb25seSB3b3JrIHdoZW4gezB9IGlzIGVuYWJsZWQuIFNpeGVsIGFuZCBpVGVybSdzIGlubGluZSBpbWFnZSBwcm90b2NvbCBhcmUgc3VwcG9ydGVkIG9uIExpbnV4IGFuZCBtYWNPUy4gVGhlIGtpdHR5IGdyYXBoaWNzIHByb3RvY29sIGlzIHN1cHBvcnRlZCBvbiBhbGwgcGxhdGZvcm1zLiBPbiBXaW5kb3dzLCBhbGwgaW1hZ2UgcHJvdG9jb2xzIHdpbGwgb25seSB3b3JrIGZvciB2ZXJzaW9ucyBvZiBDb25QVFkgPj0gdjIgd2hpY2ggaXMgc2hpcHBlZCB3aXRoIFdpbmRvd3MgaXRzZWxmLCBzZWUgYWxzbyB7MX0uIEltYWdlcyB3aWxsIGN1cnJlbnRseSBub3QgYmUgcmVzdG9yZWQgYmV0d2VlbiB3aW5kb3cgcmVsb2Fkcy9yZWNvbm5lY3RzLiBXaGVuIGVuYWJsZWQsIHRyYW5zcGFyZW5jeSBtb2RlIGlzIGFsc28gdHVybmVkIG9uIGluIHRoZSB0ZXJtaW5hbC5cIiwgYFxcYCMke1Rlcm1pbmFsU2V0dGluZ0lkLkdwdUFjY2VsZXJhdGlvbn0jXFxgYCwgYFxcYCMke1Rlcm1pbmFsU2V0dGluZ0lkLldpbmRvd3NVc2VDb25wdHlEbGx9I1xcYGApLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRm9jdXNBZnRlclJ1bl06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5mb2N1c0FmdGVyUnVuJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSB0ZXJtaW5hbCwgYWNjZXNzaWJsZSBidWZmZXIsIG9yIG5laXRoZXIgd2lsbCBiZSBmb2N1c2VkIGFmdGVyIGBUZXJtaW5hbDogUnVuIFNlbGVjdGVkIFRleHQgSW4gQWN0aXZlIFRlcm1pbmFsYCBoYXMgYmVlbiBydW4uXCIpLFxuXHRcdGVudW06IFsndGVybWluYWwnLCAnYWNjZXNzaWJsZS1idWZmZXInLCAnbm9uZSddLFxuXHRcdGRlZmF1bHQ6ICdub25lJyxcblx0XHR0YWdzOiBbJ2FjY2Vzc2liaWxpdHknXSxcblx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvY3VzQWZ0ZXJSdW4udGVybWluYWwnLCBcIkFsd2F5cyBmb2N1cyB0aGUgdGVybWluYWwuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZm9jdXNBZnRlclJ1bi5hY2Nlc3NpYmxlLWJ1ZmZlcicsIFwiQWx3YXlzIGZvY3VzIHRoZSBhY2Nlc3NpYmxlIGJ1ZmZlci5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5mb2N1c0FmdGVyUnVuLm5vbmUnLCBcIkRvIG5vdGhpbmcuXCIpLFxuXHRcdF1cblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkFsbG93SW5VbnRydXN0ZWRXb3Jrc3BhY2VdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hbGxvd0luVW50cnVzdGVkV29ya3NwYWNlJywgXCJDb250cm9scyB3aGV0aGVyIHRlcm1pbmFscyBjYW4gYmUgY3JlYXRlZCBpbiBhbiB1bnRydXN0ZWQgd29ya3NwYWNlLlxcblxcbioqVGhpcyBmZWF0dXJlIGJ5cGFzc2VzIGEgc2VjdXJpdHkgcHJvdGVjdGlvbiB0aGF0IHByZXZlbnRzIHRlcm1pbmFscyBmcm9tIGxhdW5jaGluZyBpbiB1bnRydXN0ZWQgd29ya3NwYWNlcy4gVGhlIHJlYXNvbiB0aGlzIGlzIGEgc2VjdXJpdHkgcmlzayBpcyBiZWNhdXNlIHNoZWxscyBhcmUgb2Z0ZW4gc2V0IHVwIHRvIHBvdGVudGlhbGx5IGV4ZWN1dGUgY29kZSBhdXRvbWF0aWNhbGx5IGJhc2VkIG9uIHRoZSBjb250ZW50cyBvZiB0aGUgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeS4gVGhpcyBzaG91bGQgYmUgc2FmZSB0byB1c2UgcHJvdmlkZWQgeW91ciBzaGVsbCBpcyBzZXQgdXAgaW4gc3VjaCBhIHdheSB0aGF0IGNvZGUgZXhlY3V0aW9uIGluIHRoZSBmb2xkZXIgbmV2ZXIgaGFwcGVucy4qKlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2Vcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkRldmVsb3BlclB0eUhvc3RMYXRlbmN5XToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5kZXZlbG9wZXIucHR5SG9zdC5sYXRlbmN5JywgXCJTaW11bGF0ZWQgbGF0ZW5jeSBpbiBtaWxsaXNlY29uZHMgYXBwbGllZCB0byBhbGwgY2FsbHMgbWFkZSB0byB0aGUgcHR5IGhvc3QuIFRoaXMgaXMgdXNlZnVsIGZvciB0ZXN0aW5nIHRlcm1pbmFsIGJlaGF2aW9yIHVuZGVyIGhpZ2ggbGF0ZW5jeSBjb25kaXRpb25zLlwiKSxcblx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRtaW5pbXVtOiAwLFxuXHRcdGRlZmF1bHQ6IDAsXG5cdFx0dGFnczogWydhZHZhbmNlZCddXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5EZXZlbG9wZXJQdHlIb3N0U3RhcnR1cERlbGF5XToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5kZXZlbG9wZXIucHR5SG9zdC5zdGFydHVwRGVsYXknLCBcIlNpbXVsYXRlZCBzdGFydHVwIGRlbGF5IGluIG1pbGxpc2Vjb25kcyBmb3IgdGhlIHB0eSBob3N0IHByb2Nlc3MuIFRoaXMgaXMgdXNlZnVsIGZvciB0ZXN0aW5nIHRlcm1pbmFsIGluaXRpYWxpemF0aW9uIHVuZGVyIHNsb3cgc3RhcnR1cCBjb25kaXRpb25zLlwiKSxcblx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRtaW5pbXVtOiAwLFxuXHRcdGRlZmF1bHQ6IDAsXG5cdFx0dGFnczogWydhZHZhbmNlZCddXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5EZXZNb2RlXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5kZXZlbG9wZXIuZGV2TW9kZScsIFwiRW5hYmxlIGRldmVsb3BlciBtb2RlIGZvciB0aGUgdGVybWluYWwuIFRoaXMgc2hvd3MgYWRkaXRpb25hbCBkZWJ1ZyBpbmZvcm1hdGlvbiBhbmQgdmlzdWFsaXphdGlvbnMgZm9yIHNoZWxsIGludGVncmF0aW9uIHNlcXVlbmNlcy5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdHRhZ3M6IFsnYWR2YW5jZWQnXVxuXHR9LFxuXHQuLi50ZXJtaW5hbENvbnRyaWJDb25maWd1cmF0aW9uLFxufTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlZ2lzdGVyVGVybWluYWxDb25maWd1cmF0aW9uKGdldEZvbnRTbmlwcGV0czogKCkgPT4gUHJvbWlzZTxJSlNPTlNjaGVtYVNuaXBwZXRbXT4pIHtcblx0Y29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0aWQ6ICd0ZXJtaW5hbCcsXG5cdFx0b3JkZXI6IDEwMCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ3Rlcm1pbmFsSW50ZWdyYXRlZENvbmZpZ3VyYXRpb25UaXRsZScsIFwiSW50ZWdyYXRlZCBUZXJtaW5hbFwiKSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB0ZXJtaW5hbENvbmZpZ3VyYXRpb24sXG5cdH0pO1xuXHR0ZXJtaW5hbENvbmZpZ3VyYXRpb25bVGVybWluYWxTZXR0aW5nSWQuRm9udEZhbWlseV0uZGVmYXVsdFNuaXBwZXRzID0gYXdhaXQgZ2V0Rm9udFNuaXBwZXRzKCk7XG59XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6IFRlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZUJlbGwsXG5cdFx0bWlncmF0ZUZuOiAoZW5hYmxlQmVsbCwgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzOiBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycyA9IFtdO1xuXHRcdFx0bGV0IGFubm91bmNlbWVudCA9IGFjY2Vzc29yKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxCZWxsJyk/LmFubm91bmNlbWVudCA/PyBhY2Nlc3NvcignYWNjZXNzaWJpbGl0eS5hbGVydC50ZXJtaW5hbEJlbGwnKTtcblx0XHRcdGlmIChhbm5vdW5jZW1lbnQgIT09IHVuZGVmaW5lZCAmJiAhaXNTdHJpbmcoYW5ub3VuY2VtZW50KSkge1xuXHRcdFx0XHRhbm5vdW5jZW1lbnQgPSBhbm5vdW5jZW1lbnQgPyAnYXV0bycgOiAnb2ZmJztcblx0XHRcdH1cblx0XHRcdGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLnB1c2goWydhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxCZWxsJywgeyB2YWx1ZTogeyBzb3VuZDogZW5hYmxlQmVsbCA/ICdvbicgOiAnb2ZmJywgYW5ub3VuY2VtZW50IH0gfV0pO1xuXHRcdFx0Y29uZmlndXJhdGlvbktleVZhbHVlUGFpcnMucHVzaChbVGVybWluYWxTZXR0aW5nSWQuRW5hYmxlQmVsbCwgeyB2YWx1ZTogdW5kZWZpbmVkIH1dKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLnB1c2goW1Rlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZVZpc3VhbEJlbGwsIHsgdmFsdWU6IGVuYWJsZUJlbGwgfV0pO1xuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzO1xuXHRcdH1cblx0fV0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBR3hCLFNBQVMsYUFBYSxpQkFBaUI7QUFDdkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0Isa0JBQTZFO0FBQzFHLE9BQU8sYUFBYTtBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2Qix5QkFBeUI7QUFDL0QsU0FBUyxxQkFBcUIsMEJBQTBCO0FBQ3hELFNBQXNFLGNBQWMsMkJBQTJCO0FBQy9HLFNBQVMsOEJBQThCLGdDQUFnQztBQUN2RSxTQUFTLGdDQUFnQyx3QkFBd0IscUJBQXFCLHFCQUFxQixxQkFBcUIsK0JBQStCO0FBRS9KLE1BQU0sc0JBQXNCLFNBQVM7QUFBQSxFQUNwQyxlQUFnQixTQUFTLE9BQU8sMkNBQTJDO0FBQUEsRUFDM0UscUJBQXNCLFNBQVMsYUFBYSxtUEFBbVA7QUFBQSxFQUMvUiwyQkFBNEIsU0FB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
