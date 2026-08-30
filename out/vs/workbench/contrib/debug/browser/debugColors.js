import { registerColor, foreground, editorInfoForeground, editorWarningForeground, errorForeground, badgeBackground, badgeForeground, listDeemphasizedForeground, contrastBorder, inputBorder, toolbarHoverBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Color } from "../../../../base/common/color.js";
import { localize } from "../../../../nls.js";
import * as icons from "./debugIcons.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
const debugToolBarBackground = registerColor("debugToolBar.background", {
  dark: "#333333",
  light: "#F3F3F3",
  hcDark: "#000000",
  hcLight: "#FFFFFF"
}, localize("debugToolBarBackground", "Debug toolbar background color."));
const debugToolBarBorder = registerColor("debugToolBar.border", null, localize("debugToolBarBorder", "Debug toolbar border color."));
const debugIconStartForeground = registerColor("debugIcon.startForeground", {
  dark: "#89D185",
  light: "#388A34",
  hcDark: "#89D185",
  hcLight: "#388A34"
}, localize("debugIcon.startForeground", "Debug toolbar icon for start debugging."));
function registerColors() {
  const debugTokenExpressionName = registerColor("debugTokenExpression.name", { dark: "#c586c0", light: "#9b46b0", hcDark: foreground, hcLight: foreground }, "Foreground color for the token names shown in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionType = registerColor("debugTokenExpression.type", { dark: "#4A90E2", light: "#4A90E2", hcDark: foreground, hcLight: foreground }, "Foreground color for the token types shown in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionValue = registerColor("debugTokenExpression.value", { dark: "#cccccc99", light: "#6c6c6ccc", hcDark: foreground, hcLight: foreground }, "Foreground color for the token values shown in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionString = registerColor("debugTokenExpression.string", { dark: "#ce9178", light: "#a31515", hcDark: "#f48771", hcLight: "#a31515" }, "Foreground color for strings in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionBoolean = registerColor("debugTokenExpression.boolean", { dark: "#4e94ce", light: "#0000ff", hcDark: "#75bdfe", hcLight: "#0000ff" }, "Foreground color for booleans in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionNumber = registerColor("debugTokenExpression.number", { dark: "#b5cea8", light: "#098658", hcDark: "#89d185", hcLight: "#098658" }, "Foreground color for numbers in the debug views (ie. the Variables or Watch view).");
  const debugTokenExpressionError = registerColor("debugTokenExpression.error", { dark: "#f48771", light: "#e51400", hcDark: "#f48771", hcLight: "#e51400" }, "Foreground color for expression errors in the debug views (ie. the Variables or Watch view) and for error logs shown in the debug console.");
  const debugViewExceptionLabelForeground = registerColor("debugView.exceptionLabelForeground", { dark: foreground, light: "#FFF", hcDark: foreground, hcLight: foreground }, "Foreground color for a label shown in the CALL STACK view when the debugger breaks on an exception.");
  const debugViewExceptionLabelBackground = registerColor("debugView.exceptionLabelBackground", { dark: "#6C2022", light: "#A31515", hcDark: "#6C2022", hcLight: "#A31515" }, "Background color for a label shown in the CALL STACK view when the debugger breaks on an exception.");
  const debugViewStateLabelForeground = registerColor("debugView.stateLabelForeground", foreground, "Foreground color for a label in the CALL STACK view showing the current session's or thread's state.");
  const debugViewStateLabelBackground = registerColor("debugView.stateLabelBackground", "#88888844", "Background color for a label in the CALL STACK view showing the current session's or thread's state.");
  const debugViewValueChangedHighlight = registerColor("debugView.valueChangedHighlight", "#569CD6", "Color used to highlight value changes in the debug views (ie. in the Variables view).");
  const debugConsoleInfoForeground = registerColor("debugConsole.infoForeground", { dark: editorInfoForeground, light: editorInfoForeground, hcDark: foreground, hcLight: foreground }, "Foreground color for info messages in debug REPL console.");
  const debugConsoleWarningForeground = registerColor("debugConsole.warningForeground", { dark: editorWarningForeground, light: editorWarningForeground, hcDark: "#008000", hcLight: editorWarningForeground }, "Foreground color for warning messages in debug REPL console.");
  const debugConsoleErrorForeground = registerColor("debugConsole.errorForeground", errorForeground, "Foreground color for error messages in debug REPL console.");
  const debugConsoleSourceForeground = registerColor("debugConsole.sourceForeground", foreground, "Foreground color for source filenames in debug REPL console.");
  const debugConsoleInputIconForeground = registerColor("debugConsoleInputIcon.foreground", foreground, "Foreground color for debug console input marker icon.");
  const debugIconPauseForeground = registerColor("debugIcon.pauseForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.pauseForeground", "Debug toolbar icon for pause."));
  const debugIconStopForeground = registerColor("debugIcon.stopForeground", {
    dark: "#F48771",
    light: "#A1260D",
    hcDark: "#F48771",
    hcLight: "#A1260D"
  }, localize("debugIcon.stopForeground", "Debug toolbar icon for stop."));
  const debugIconDisconnectForeground = registerColor("debugIcon.disconnectForeground", {
    dark: "#F48771",
    light: "#A1260D",
    hcDark: "#F48771",
    hcLight: "#A1260D"
  }, localize("debugIcon.disconnectForeground", "Debug toolbar icon for disconnect."));
  const debugIconRestartForeground = registerColor("debugIcon.restartForeground", {
    dark: "#89D185",
    light: "#388A34",
    hcDark: "#89D185",
    hcLight: "#388A34"
  }, localize("debugIcon.restartForeground", "Debug toolbar icon for restart."));
  const debugIconStepOverForeground = registerColor("debugIcon.stepOverForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.stepOverForeground", "Debug toolbar icon for step over."));
  const debugIconStepIntoForeground = registerColor("debugIcon.stepIntoForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.stepIntoForeground", "Debug toolbar icon for step into."));
  const debugIconStepOutForeground = registerColor("debugIcon.stepOutForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.stepOutForeground", "Debug toolbar icon for step over."));
  const debugIconContinueForeground = registerColor("debugIcon.continueForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.continueForeground", "Debug toolbar icon for continue."));
  const debugIconStepBackForeground = registerColor("debugIcon.stepBackForeground", {
    dark: "#75BEFF",
    light: "#007ACC",
    hcDark: "#75BEFF",
    hcLight: "#007ACC"
  }, localize("debugIcon.stepBackForeground", "Debug toolbar icon for step back."));
  registerThemingParticipant((theme, collector) => {
    const badgeBackgroundColor = theme.getColor(badgeBackground);
    const badgeForegroundColor = theme.getColor(badgeForeground);
    const listDeemphasizedForegroundColor = theme.getColor(listDeemphasizedForeground);
    const debugViewExceptionLabelForegroundColor = theme.getColor(debugViewExceptionLabelForeground);
    const debugViewExceptionLabelBackgroundColor = theme.getColor(debugViewExceptionLabelBackground);
    const debugViewStateLabelForegroundColor = theme.getColor(debugViewStateLabelForeground);
    const debugViewStateLabelBackgroundColor = theme.getColor(debugViewStateLabelBackground);
    const debugViewValueChangedHighlightColor = theme.getColor(debugViewValueChangedHighlight);
    const toolbarHoverBackgroundColor = theme.getColor(toolbarHoverBackground);
    collector.addRule(`
			/* Text colour of the call stack row's filename */
			.debug-pane .debug-call-stack .monaco-list-row:not(.selected) .stack-frame > .file .file-name {
				color: ${listDeemphasizedForegroundColor}
			}

			/* Line & column number "badge" for selected call stack row */
			.debug-pane .monaco-list-row.selected .line-number {
				background-color: ${badgeBackgroundColor};
				color: ${badgeForegroundColor};
			}

			/* Line & column number "badge" for unselected call stack row (basically all other rows) */
			.debug-pane .line-number {
				background-color: ${badgeBackgroundColor.transparent(0.6)};
				color: ${badgeForegroundColor.transparent(0.6)};
			}

			/* State "badge" displaying the active session's current state.
			* Only visible when there are more active debug sessions/threads running.
			*/
			.debug-pane .debug-call-stack .thread > .state.label,
			.debug-pane .debug-call-stack .session > .state.label {
				background-color: ${debugViewStateLabelBackgroundColor};
				color: ${debugViewStateLabelForegroundColor};
			}

			/* State "badge" displaying the active session's current state.
			* Only visible when there are more active debug sessions/threads running
			* and thread paused due to a thrown exception.
			*/
			.debug-pane .debug-call-stack .thread > .state.label.exception,
			.debug-pane .debug-call-stack .session > .state.label.exception {
				background-color: ${debugViewExceptionLabelBackgroundColor};
				color: ${debugViewExceptionLabelForegroundColor};
			}

			/* Info "badge" shown when the debugger pauses due to a thrown exception. */
			.debug-pane .call-stack-state-message > .label.exception {
				background-color: ${debugViewExceptionLabelBackgroundColor};
				color: ${debugViewExceptionLabelForegroundColor};
			}

			/* Animation of changed values in Debug viewlet */
			@keyframes debugViewletValueChanged {
				0%   { background-color: ${debugViewValueChangedHighlightColor.transparent(0)} }
				5%   { background-color: ${debugViewValueChangedHighlightColor.transparent(0.9)} }
				100% { background-color: ${debugViewValueChangedHighlightColor.transparent(0.3)} }
			}

			.debug-pane .monaco-list-row .expression .value.changed {
				background-color: ${debugViewValueChangedHighlightColor.transparent(0.3)};
				animation-name: debugViewletValueChanged;
				animation-duration: 1s;
				animation-fill-mode: forwards;
			}

			.monaco-list-row .expression .lazy-button:hover {
				background-color: ${toolbarHoverBackgroundColor}
			}
		`);
    const contrastBorderColor = theme.getColor(contrastBorder);
    if (contrastBorderColor) {
      collector.addRule(`
			.debug-pane .line-number {
				border: 1px solid ${contrastBorderColor};
			}
			`);
    }
    if (isHighContrast(theme.type)) {
      collector.addRule(`
			.debug-pane .line-number {
				background-color: ${badgeBackgroundColor};
				color: ${badgeForegroundColor};
			}`);
    }
    const tokenNameColor = theme.getColor(debugTokenExpressionName);
    const tokenTypeColor = theme.getColor(debugTokenExpressionType);
    const tokenValueColor = theme.getColor(debugTokenExpressionValue);
    const tokenStringColor = theme.getColor(debugTokenExpressionString);
    const tokenBooleanColor = theme.getColor(debugTokenExpressionBoolean);
    const tokenErrorColor = theme.getColor(debugTokenExpressionError);
    const tokenNumberColor = theme.getColor(debugTokenExpressionNumber);
    collector.addRule(`
			.monaco-workbench .monaco-list-row .expression .name {
				color: ${tokenNameColor};
			}

			.monaco-workbench .monaco-list-row .expression .type {
				color: ${tokenTypeColor};
			}

			.monaco-workbench .monaco-list-row .expression .value,
			.monaco-workbench .debug-hover-widget .value {
				color: ${tokenValueColor};
			}

			.monaco-workbench .monaco-list-row .expression .value.string,
			.monaco-workbench .debug-hover-widget .value.string {
				color: ${tokenStringColor};
			}

			.monaco-workbench .monaco-list-row .expression .value.boolean,
			.monaco-workbench .debug-hover-widget .value.boolean {
				color: ${tokenBooleanColor};
			}

			.monaco-workbench .monaco-list-row .expression .error,
			.monaco-workbench .debug-hover-widget .error,
			.monaco-workbench .debug-pane .debug-variables .scope .error {
				color: ${tokenErrorColor};
			}

			.monaco-workbench .monaco-list-row .expression .value.number,
			.monaco-workbench .debug-hover-widget .value.number {
				color: ${tokenNumberColor};
			}
		`);
    const debugConsoleInputBorderColor = theme.getColor(inputBorder) || Color.fromHex("#80808060");
    const debugConsoleInfoForegroundColor = theme.getColor(debugConsoleInfoForeground);
    const debugConsoleWarningForegroundColor = theme.getColor(debugConsoleWarningForeground);
    const debugConsoleErrorForegroundColor = theme.getColor(debugConsoleErrorForeground);
    const debugConsoleSourceForegroundColor = theme.getColor(debugConsoleSourceForeground);
    const debugConsoleInputIconForegroundColor = theme.getColor(debugConsoleInputIconForeground);
    collector.addRule(`
			.repl .repl-input-wrapper {
				border-top: 1px solid ${debugConsoleInputBorderColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .value.info {
				color: ${debugConsoleInfoForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .value.warn {
				color: ${debugConsoleWarningForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .value.error {
				color: ${debugConsoleErrorForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .output .expression .source {
				color: ${debugConsoleSourceForegroundColor};
			}

			.monaco-workbench .repl .repl-tree .monaco-tl-contents .arrow {
				color: ${debugConsoleInputIconForegroundColor};
			}
		`);
    if (!theme.defines(debugConsoleInputIconForeground)) {
      collector.addRule(`
				.monaco-workbench.vs .repl .repl-tree .monaco-tl-contents .arrow {
					opacity: 0.25;
				}

				.monaco-workbench.vs-dark .repl .repl-tree .monaco-tl-contents .arrow {
					opacity: 0.4;
				}

				.monaco-workbench.hc-black .repl .repl-tree .monaco-tl-contents .arrow,
				.monaco-workbench.hc-light .repl .repl-tree .monaco-tl-contents .arrow {
					opacity: 1;
				}
			`);
    }
    const debugIconStartColor = theme.getColor(debugIconStartForeground);
    if (debugIconStartColor) {
      collector.addRule(`.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStart)} { color: ${debugIconStartColor}; }`);
    }
    const debugIconPauseColor = theme.getColor(debugIconPauseForeground);
    if (debugIconPauseColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugPause)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugPause)} { color: ${debugIconPauseColor}; }`);
    }
    const debugIconStopColor = theme.getColor(debugIconStopForeground);
    if (debugIconStopColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStop)},.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStop)} { color: ${debugIconStopColor}; }`);
    }
    const debugIconDisconnectColor = theme.getColor(debugIconDisconnectForeground);
    if (debugIconDisconnectColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugDisconnect)},.monaco-workbench .debug-view-content ${ThemeIcon.asCSSSelector(icons.debugDisconnect)}, .monaco-workbench .debug-toolbar ${ThemeIcon.asCSSSelector(icons.debugDisconnect)}, .monaco-workbench .command-center-center ${ThemeIcon.asCSSSelector(icons.debugDisconnect)} { color: ${debugIconDisconnectColor}; }`);
    }
    const debugIconRestartColor = theme.getColor(debugIconRestartForeground);
    if (debugIconRestartColor) {
      collector.addRule(`.monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugRestart)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugRestartFrame)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugRestart)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugRestartFrame)} { color: ${debugIconRestartColor}; }`);
    }
    const debugIconStepOverColor = theme.getColor(debugIconStepOverForeground);
    if (debugIconStepOverColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepOver)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepOver)} { color: ${debugIconStepOverColor}; }`);
    }
    const debugIconStepIntoColor = theme.getColor(debugIconStepIntoForeground);
    if (debugIconStepIntoColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepInto)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepInto)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepInto)} { color: ${debugIconStepIntoColor}; }`);
    }
    const debugIconStepOutColor = theme.getColor(debugIconStepOutForeground);
    if (debugIconStepOutColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepOut)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepOut)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepOut)} { color: ${debugIconStepOutColor}; }`);
    }
    const debugIconContinueColor = theme.getColor(debugIconContinueForeground);
    if (debugIconContinueColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugContinue)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugContinue)}, .monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugReverseContinue)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugReverseContinue)} { color: ${debugIconContinueColor}; }`);
    }
    const debugIconStepBackColor = theme.getColor(debugIconStepBackForeground);
    if (debugIconStepBackColor) {
      collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label${ThemeIcon.asCSSSelector(icons.debugStepBack)}, .monaco-workbench ${ThemeIcon.asCSSSelector(icons.debugStepBack)} { color: ${debugIconStepBackColor}; }`);
    }
  });
}
export {
  debugIconStartForeground,
  debugToolBarBackground,
  debugToolBarBorder,
  registerColors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0NvbG9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJlZ2lzdGVyQ29sb3IsIGZvcmVncm91bmQsIGVkaXRvckluZm9Gb3JlZ3JvdW5kLCBlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCwgZXJyb3JGb3JlZ3JvdW5kLCBiYWRnZUJhY2tncm91bmQsIGJhZGdlRm9yZWdyb3VuZCwgbGlzdERlZW1waGFzaXplZEZvcmVncm91bmQsIGNvbnRyYXN0Qm9yZGVyLCBpbnB1dEJvcmRlciwgdG9vbGJhckhvdmVyQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBpY29ucyBmcm9tICcuL2RlYnVnSWNvbnMuanMnO1xuaW1wb3J0IHsgaXNIaWdoQ29udHJhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuXG5leHBvcnQgY29uc3QgZGVidWdUb29sQmFyQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVG9vbEJhci5iYWNrZ3JvdW5kJywge1xuXHRkYXJrOiAnIzMzMzMzMycsXG5cdGxpZ2h0OiAnI0YzRjNGMycsXG5cdGhjRGFyazogJyMwMDAwMDAnLFxuXHRoY0xpZ2h0OiAnI0ZGRkZGRidcbn0sIGxvY2FsaXplKCdkZWJ1Z1Rvb2xCYXJCYWNrZ3JvdW5kJywgXCJEZWJ1ZyB0b29sYmFyIGJhY2tncm91bmQgY29sb3IuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGRlYnVnVG9vbEJhckJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVG9vbEJhci5ib3JkZXInLCBudWxsLCBsb2NhbGl6ZSgnZGVidWdUb29sQmFyQm9yZGVyJywgXCJEZWJ1ZyB0b29sYmFyIGJvcmRlciBjb2xvci5cIikpO1xuXG5leHBvcnQgY29uc3QgZGVidWdJY29uU3RhcnRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLnN0YXJ0Rm9yZWdyb3VuZCcsIHtcblx0ZGFyazogJyM4OUQxODUnLFxuXHRsaWdodDogJyMzODhBMzQnLFxuXHRoY0Rhcms6ICcjODlEMTg1Jyxcblx0aGNMaWdodDogJyMzODhBMzQnXG59LCBsb2NhbGl6ZSgnZGVidWdJY29uLnN0YXJ0Rm9yZWdyb3VuZCcsIFwiRGVidWcgdG9vbGJhciBpY29uIGZvciBzdGFydCBkZWJ1Z2dpbmcuXCIpKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29sb3JzKCkge1xuXG5cdGNvbnN0IGRlYnVnVG9rZW5FeHByZXNzaW9uTmFtZSA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVG9rZW5FeHByZXNzaW9uLm5hbWUnLCB7IGRhcms6ICcjYzU4NmMwJywgbGlnaHQ6ICcjOWI0NmIwJywgaGNEYXJrOiBmb3JlZ3JvdW5kLCBoY0xpZ2h0OiBmb3JlZ3JvdW5kIH0sICdGb3JlZ3JvdW5kIGNvbG9yIGZvciB0aGUgdG9rZW4gbmFtZXMgc2hvd24gaW4gdGhlIGRlYnVnIHZpZXdzIChpZS4gdGhlIFZhcmlhYmxlcyBvciBXYXRjaCB2aWV3KS4nKTtcblx0Y29uc3QgZGVidWdUb2tlbkV4cHJlc3Npb25UeXBlID0gcmVnaXN0ZXJDb2xvcignZGVidWdUb2tlbkV4cHJlc3Npb24udHlwZScsIHsgZGFyazogJyM0QTkwRTInLCBsaWdodDogJyM0QTkwRTInLCBoY0Rhcms6IGZvcmVncm91bmQsIGhjTGlnaHQ6IGZvcmVncm91bmQgfSwgJ0ZvcmVncm91bmQgY29sb3IgZm9yIHRoZSB0b2tlbiB0eXBlcyBzaG93biBpbiB0aGUgZGVidWcgdmlld3MgKGllLiB0aGUgVmFyaWFibGVzIG9yIFdhdGNoIHZpZXcpLicpO1xuXHRjb25zdCBkZWJ1Z1Rva2VuRXhwcmVzc2lvblZhbHVlID0gcmVnaXN0ZXJDb2xvcignZGVidWdUb2tlbkV4cHJlc3Npb24udmFsdWUnLCB7IGRhcms6ICcjY2NjY2NjOTknLCBsaWdodDogJyM2YzZjNmNjYycsIGhjRGFyazogZm9yZWdyb3VuZCwgaGNMaWdodDogZm9yZWdyb3VuZCB9LCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgdGhlIHRva2VuIHZhbHVlcyBzaG93biBpbiB0aGUgZGVidWcgdmlld3MgKGllLiB0aGUgVmFyaWFibGVzIG9yIFdhdGNoIHZpZXcpLicpO1xuXHRjb25zdCBkZWJ1Z1Rva2VuRXhwcmVzc2lvblN0cmluZyA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVG9rZW5FeHByZXNzaW9uLnN0cmluZycsIHsgZGFyazogJyNjZTkxNzgnLCBsaWdodDogJyNhMzE1MTUnLCBoY0Rhcms6ICcjZjQ4NzcxJywgaGNMaWdodDogJyNhMzE1MTUnIH0sICdGb3JlZ3JvdW5kIGNvbG9yIGZvciBzdHJpbmdzIGluIHRoZSBkZWJ1ZyB2aWV3cyAoaWUuIHRoZSBWYXJpYWJsZXMgb3IgV2F0Y2ggdmlldykuJyk7XG5cdGNvbnN0IGRlYnVnVG9rZW5FeHByZXNzaW9uQm9vbGVhbiA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVG9rZW5FeHByZXNzaW9uLmJvb2xlYW4nLCB7IGRhcms6ICcjNGU5NGNlJywgbGlnaHQ6ICcjMDAwMGZmJywgaGNEYXJrOiAnIzc1YmRmZScsIGhjTGlnaHQ6ICcjMDAwMGZmJyB9LCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgYm9vbGVhbnMgaW4gdGhlIGRlYnVnIHZpZXdzIChpZS4gdGhlIFZhcmlhYmxlcyBvciBXYXRjaCB2aWV3KS4nKTtcblx0Y29uc3QgZGVidWdUb2tlbkV4cHJlc3Npb25OdW1iZXIgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z1Rva2VuRXhwcmVzc2lvbi5udW1iZXInLCB7IGRhcms6ICcjYjVjZWE4JywgbGlnaHQ6ICcjMDk4NjU4JywgaGNEYXJrOiAnIzg5ZDE4NScsIGhjTGlnaHQ6ICcjMDk4NjU4JyB9LCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgbnVtYmVycyBpbiB0aGUgZGVidWcgdmlld3MgKGllLiB0aGUgVmFyaWFibGVzIG9yIFdhdGNoIHZpZXcpLicpO1xuXHRjb25zdCBkZWJ1Z1Rva2VuRXhwcmVzc2lvbkVycm9yID0gcmVnaXN0ZXJDb2xvcignZGVidWdUb2tlbkV4cHJlc3Npb24uZXJyb3InLCB7IGRhcms6ICcjZjQ4NzcxJywgbGlnaHQ6ICcjZTUxNDAwJywgaGNEYXJrOiAnI2Y0ODc3MScsIGhjTGlnaHQ6ICcjZTUxNDAwJyB9LCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgZXhwcmVzc2lvbiBlcnJvcnMgaW4gdGhlIGRlYnVnIHZpZXdzIChpZS4gdGhlIFZhcmlhYmxlcyBvciBXYXRjaCB2aWV3KSBhbmQgZm9yIGVycm9yIGxvZ3Mgc2hvd24gaW4gdGhlIGRlYnVnIGNvbnNvbGUuJyk7XG5cblx0Y29uc3QgZGVidWdWaWV3RXhjZXB0aW9uTGFiZWxGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdWaWV3LmV4Y2VwdGlvbkxhYmVsRm9yZWdyb3VuZCcsIHsgZGFyazogZm9yZWdyb3VuZCwgbGlnaHQ6ICcjRkZGJywgaGNEYXJrOiBmb3JlZ3JvdW5kLCBoY0xpZ2h0OiBmb3JlZ3JvdW5kIH0sICdGb3JlZ3JvdW5kIGNvbG9yIGZvciBhIGxhYmVsIHNob3duIGluIHRoZSBDQUxMIFNUQUNLIHZpZXcgd2hlbiB0aGUgZGVidWdnZXIgYnJlYWtzIG9uIGFuIGV4Y2VwdGlvbi4nKTtcblx0Y29uc3QgZGVidWdWaWV3RXhjZXB0aW9uTGFiZWxCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdWaWV3LmV4Y2VwdGlvbkxhYmVsQmFja2dyb3VuZCcsIHsgZGFyazogJyM2QzIwMjInLCBsaWdodDogJyNBMzE1MTUnLCBoY0Rhcms6ICcjNkMyMDIyJywgaGNMaWdodDogJyNBMzE1MTUnIH0sICdCYWNrZ3JvdW5kIGNvbG9yIGZvciBhIGxhYmVsIHNob3duIGluIHRoZSBDQUxMIFNUQUNLIHZpZXcgd2hlbiB0aGUgZGVidWdnZXIgYnJlYWtzIG9uIGFuIGV4Y2VwdGlvbi4nKTtcblx0Y29uc3QgZGVidWdWaWV3U3RhdGVMYWJlbEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z1ZpZXcuc3RhdGVMYWJlbEZvcmVncm91bmQnLCBmb3JlZ3JvdW5kLCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgYSBsYWJlbCBpbiB0aGUgQ0FMTCBTVEFDSyB2aWV3IHNob3dpbmcgdGhlIGN1cnJlbnQgc2Vzc2lvblxcJ3Mgb3IgdGhyZWFkXFwncyBzdGF0ZS4nKTtcblx0Y29uc3QgZGVidWdWaWV3U3RhdGVMYWJlbEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z1ZpZXcuc3RhdGVMYWJlbEJhY2tncm91bmQnLCAnIzg4ODg4ODQ0JywgJ0JhY2tncm91bmQgY29sb3IgZm9yIGEgbGFiZWwgaW4gdGhlIENBTEwgU1RBQ0sgdmlldyBzaG93aW5nIHRoZSBjdXJyZW50IHNlc3Npb25cXCdzIG9yIHRocmVhZFxcJ3Mgc3RhdGUuJyk7XG5cdGNvbnN0IGRlYnVnVmlld1ZhbHVlQ2hhbmdlZEhpZ2hsaWdodCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnVmlldy52YWx1ZUNoYW5nZWRIaWdobGlnaHQnLCAnIzU2OUNENicsICdDb2xvciB1c2VkIHRvIGhpZ2hsaWdodCB2YWx1ZSBjaGFuZ2VzIGluIHRoZSBkZWJ1ZyB2aWV3cyAoaWUuIGluIHRoZSBWYXJpYWJsZXMgdmlldykuJyk7XG5cblx0Y29uc3QgZGVidWdDb25zb2xlSW5mb0ZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z0NvbnNvbGUuaW5mb0ZvcmVncm91bmQnLCB7IGRhcms6IGVkaXRvckluZm9Gb3JlZ3JvdW5kLCBsaWdodDogZWRpdG9ySW5mb0ZvcmVncm91bmQsIGhjRGFyazogZm9yZWdyb3VuZCwgaGNMaWdodDogZm9yZWdyb3VuZCB9LCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgaW5mbyBtZXNzYWdlcyBpbiBkZWJ1ZyBSRVBMIGNvbnNvbGUuJyk7XG5cdGNvbnN0IGRlYnVnQ29uc29sZVdhcm5pbmdGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdDb25zb2xlLndhcm5pbmdGb3JlZ3JvdW5kJywgeyBkYXJrOiBlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCwgbGlnaHQ6IGVkaXRvcldhcm5pbmdGb3JlZ3JvdW5kLCBoY0Rhcms6ICcjMDA4MDAwJywgaGNMaWdodDogZWRpdG9yV2FybmluZ0ZvcmVncm91bmQgfSwgJ0ZvcmVncm91bmQgY29sb3IgZm9yIHdhcm5pbmcgbWVzc2FnZXMgaW4gZGVidWcgUkVQTCBjb25zb2xlLicpO1xuXHRjb25zdCBkZWJ1Z0NvbnNvbGVFcnJvckZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z0NvbnNvbGUuZXJyb3JGb3JlZ3JvdW5kJywgZXJyb3JGb3JlZ3JvdW5kLCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgZXJyb3IgbWVzc2FnZXMgaW4gZGVidWcgUkVQTCBjb25zb2xlLicpO1xuXHRjb25zdCBkZWJ1Z0NvbnNvbGVTb3VyY2VGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdDb25zb2xlLnNvdXJjZUZvcmVncm91bmQnLCBmb3JlZ3JvdW5kLCAnRm9yZWdyb3VuZCBjb2xvciBmb3Igc291cmNlIGZpbGVuYW1lcyBpbiBkZWJ1ZyBSRVBMIGNvbnNvbGUuJyk7XG5cdGNvbnN0IGRlYnVnQ29uc29sZUlucHV0SWNvbkZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z0NvbnNvbGVJbnB1dEljb24uZm9yZWdyb3VuZCcsIGZvcmVncm91bmQsICdGb3JlZ3JvdW5kIGNvbG9yIGZvciBkZWJ1ZyBjb25zb2xlIGlucHV0IG1hcmtlciBpY29uLicpO1xuXG5cdGNvbnN0IGRlYnVnSWNvblBhdXNlRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5wYXVzZUZvcmVncm91bmQnLCB7XG5cdFx0ZGFyazogJyM3NUJFRkYnLFxuXHRcdGxpZ2h0OiAnIzAwN0FDQycsXG5cdFx0aGNEYXJrOiAnIzc1QkVGRicsXG5cdFx0aGNMaWdodDogJyMwMDdBQ0MnXG5cdH0sIGxvY2FsaXplKCdkZWJ1Z0ljb24ucGF1c2VGb3JlZ3JvdW5kJywgXCJEZWJ1ZyB0b29sYmFyIGljb24gZm9yIHBhdXNlLlwiKSk7XG5cblx0Y29uc3QgZGVidWdJY29uU3RvcEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z0ljb24uc3RvcEZvcmVncm91bmQnLCB7XG5cdFx0ZGFyazogJyNGNDg3NzEnLFxuXHRcdGxpZ2h0OiAnI0ExMjYwRCcsXG5cdFx0aGNEYXJrOiAnI0Y0ODc3MScsXG5cdFx0aGNMaWdodDogJyNBMTI2MEQnXG5cdH0sIGxvY2FsaXplKCdkZWJ1Z0ljb24uc3RvcEZvcmVncm91bmQnLCBcIkRlYnVnIHRvb2xiYXIgaWNvbiBmb3Igc3RvcC5cIikpO1xuXG5cdGNvbnN0IGRlYnVnSWNvbkRpc2Nvbm5lY3RGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLmRpc2Nvbm5lY3RGb3JlZ3JvdW5kJywge1xuXHRcdGRhcms6ICcjRjQ4NzcxJyxcblx0XHRsaWdodDogJyNBMTI2MEQnLFxuXHRcdGhjRGFyazogJyNGNDg3NzEnLFxuXHRcdGhjTGlnaHQ6ICcjQTEyNjBEJ1xuXHR9LCBsb2NhbGl6ZSgnZGVidWdJY29uLmRpc2Nvbm5lY3RGb3JlZ3JvdW5kJywgXCJEZWJ1ZyB0b29sYmFyIGljb24gZm9yIGRpc2Nvbm5lY3QuXCIpKTtcblxuXHRjb25zdCBkZWJ1Z0ljb25SZXN0YXJ0Rm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5yZXN0YXJ0Rm9yZWdyb3VuZCcsIHtcblx0XHRkYXJrOiAnIzg5RDE4NScsXG5cdFx0bGlnaHQ6ICcjMzg4QTM0Jyxcblx0XHRoY0Rhcms6ICcjODlEMTg1Jyxcblx0XHRoY0xpZ2h0OiAnIzM4OEEzNCdcblx0fSwgbG9jYWxpemUoJ2RlYnVnSWNvbi5yZXN0YXJ0Rm9yZWdyb3VuZCcsIFwiRGVidWcgdG9vbGJhciBpY29uIGZvciByZXN0YXJ0LlwiKSk7XG5cblx0Y29uc3QgZGVidWdJY29uU3RlcE92ZXJGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLnN0ZXBPdmVyRm9yZWdyb3VuZCcsIHtcblx0XHRkYXJrOiAnIzc1QkVGRicsXG5cdFx0bGlnaHQ6ICcjMDA3QUNDJyxcblx0XHRoY0Rhcms6ICcjNzVCRUZGJyxcblx0XHRoY0xpZ2h0OiAnIzAwN0FDQydcblx0fSwgbG9jYWxpemUoJ2RlYnVnSWNvbi5zdGVwT3ZlckZvcmVncm91bmQnLCBcIkRlYnVnIHRvb2xiYXIgaWNvbiBmb3Igc3RlcCBvdmVyLlwiKSk7XG5cblx0Y29uc3QgZGVidWdJY29uU3RlcEludG9Gb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLnN0ZXBJbnRvRm9yZWdyb3VuZCcsIHtcblx0XHRkYXJrOiAnIzc1QkVGRicsXG5cdFx0bGlnaHQ6ICcjMDA3QUNDJyxcblx0XHRoY0Rhcms6ICcjNzVCRUZGJyxcblx0XHRoY0xpZ2h0OiAnIzAwN0FDQydcblx0fSwgbG9jYWxpemUoJ2RlYnVnSWNvbi5zdGVwSW50b0ZvcmVncm91bmQnLCBcIkRlYnVnIHRvb2xiYXIgaWNvbiBmb3Igc3RlcCBpbnRvLlwiKSk7XG5cblx0Y29uc3QgZGVidWdJY29uU3RlcE91dEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z0ljb24uc3RlcE91dEZvcmVncm91bmQnLCB7XG5cdFx0ZGFyazogJyM3NUJFRkYnLFxuXHRcdGxpZ2h0OiAnIzAwN0FDQycsXG5cdFx0aGNEYXJrOiAnIzc1QkVGRicsXG5cdFx0aGNMaWdodDogJyMwMDdBQ0MnXG5cdH0sIGxvY2FsaXplKCdkZWJ1Z0ljb24uc3RlcE91dEZvcmVncm91bmQnLCBcIkRlYnVnIHRvb2xiYXIgaWNvbiBmb3Igc3RlcCBvdmVyLlwiKSk7XG5cblx0Y29uc3QgZGVidWdJY29uQ29udGludWVGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLmNvbnRpbnVlRm9yZWdyb3VuZCcsIHtcblx0XHRkYXJrOiAnIzc1QkVGRicsXG5cdFx0bGlnaHQ6ICcjMDA3QUNDJyxcblx0XHRoY0Rhcms6ICcjNzVCRUZGJyxcblx0XHRoY0xpZ2h0OiAnIzAwN0FDQydcblx0fSwgbG9jYWxpemUoJ2RlYnVnSWNvbi5jb250aW51ZUZvcmVncm91bmQnLCBcIkRlYnVnIHRvb2xiYXIgaWNvbiBmb3IgY29udGludWUuXCIpKTtcblxuXHRjb25zdCBkZWJ1Z0ljb25TdGVwQmFja0ZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdkZWJ1Z0ljb24uc3RlcEJhY2tGb3JlZ3JvdW5kJywge1xuXHRcdGRhcms6ICcjNzVCRUZGJyxcblx0XHRsaWdodDogJyMwMDdBQ0MnLFxuXHRcdGhjRGFyazogJyM3NUJFRkYnLFxuXHRcdGhjTGlnaHQ6ICcjMDA3QUNDJ1xuXHR9LCBsb2NhbGl6ZSgnZGVidWdJY29uLnN0ZXBCYWNrRm9yZWdyb3VuZCcsIFwiRGVidWcgdG9vbGJhciBpY29uIGZvciBzdGVwIGJhY2suXCIpKTtcblxuXHRyZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXHRcdC8vIEFsbCB0aGVzZSBjb2xvdXJzIHByb3ZpZGUgYSBkZWZhdWx0IHZhbHVlIHNvIHRoZXkgd2lsbCBuZXZlciBiZSB1bmRlZmluZWQsIGhlbmNlIHRoZSBgIWBcblx0XHRjb25zdCBiYWRnZUJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGJhZGdlQmFja2dyb3VuZCkhO1xuXHRcdGNvbnN0IGJhZGdlRm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoYmFkZ2VGb3JlZ3JvdW5kKSE7XG5cdFx0Y29uc3QgbGlzdERlZW1waGFzaXplZEZvcmVncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGxpc3REZWVtcGhhc2l6ZWRGb3JlZ3JvdW5kKSE7XG5cdFx0Y29uc3QgZGVidWdWaWV3RXhjZXB0aW9uTGFiZWxGb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z1ZpZXdFeGNlcHRpb25MYWJlbEZvcmVncm91bmQpITtcblx0XHRjb25zdCBkZWJ1Z1ZpZXdFeGNlcHRpb25MYWJlbEJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnVmlld0V4Y2VwdGlvbkxhYmVsQmFja2dyb3VuZCkhO1xuXHRcdGNvbnN0IGRlYnVnVmlld1N0YXRlTGFiZWxGb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z1ZpZXdTdGF0ZUxhYmVsRm9yZWdyb3VuZCkhO1xuXHRcdGNvbnN0IGRlYnVnVmlld1N0YXRlTGFiZWxCYWNrZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z1ZpZXdTdGF0ZUxhYmVsQmFja2dyb3VuZCkhO1xuXHRcdGNvbnN0IGRlYnVnVmlld1ZhbHVlQ2hhbmdlZEhpZ2hsaWdodENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdWaWV3VmFsdWVDaGFuZ2VkSGlnaGxpZ2h0KSE7XG5cdFx0Y29uc3QgdG9vbGJhckhvdmVyQmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IodG9vbGJhckhvdmVyQmFja2dyb3VuZCk7XG5cblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQvKiBUZXh0IGNvbG91ciBvZiB0aGUgY2FsbCBzdGFjayByb3cncyBmaWxlbmFtZSAqL1xuXHRcdFx0LmRlYnVnLXBhbmUgLmRlYnVnLWNhbGwtc3RhY2sgLm1vbmFjby1saXN0LXJvdzpub3QoLnNlbGVjdGVkKSAuc3RhY2stZnJhbWUgPiAuZmlsZSAuZmlsZS1uYW1lIHtcblx0XHRcdFx0Y29sb3I6ICR7bGlzdERlZW1waGFzaXplZEZvcmVncm91bmRDb2xvcn1cblx0XHRcdH1cblxuXHRcdFx0LyogTGluZSAmIGNvbHVtbiBudW1iZXIgXCJiYWRnZVwiIGZvciBzZWxlY3RlZCBjYWxsIHN0YWNrIHJvdyAqL1xuXHRcdFx0LmRlYnVnLXBhbmUgLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCAubGluZS1udW1iZXIge1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke2JhZGdlQmFja2dyb3VuZENvbG9yfTtcblx0XHRcdFx0Y29sb3I6ICR7YmFkZ2VGb3JlZ3JvdW5kQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQvKiBMaW5lICYgY29sdW1uIG51bWJlciBcImJhZGdlXCIgZm9yIHVuc2VsZWN0ZWQgY2FsbCBzdGFjayByb3cgKGJhc2ljYWxseSBhbGwgb3RoZXIgcm93cykgKi9cblx0XHRcdC5kZWJ1Zy1wYW5lIC5saW5lLW51bWJlciB7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6ICR7YmFkZ2VCYWNrZ3JvdW5kQ29sb3IudHJhbnNwYXJlbnQoMC42KX07XG5cdFx0XHRcdGNvbG9yOiAke2JhZGdlRm9yZWdyb3VuZENvbG9yLnRyYW5zcGFyZW50KDAuNil9O1xuXHRcdFx0fVxuXG5cdFx0XHQvKiBTdGF0ZSBcImJhZGdlXCIgZGlzcGxheWluZyB0aGUgYWN0aXZlIHNlc3Npb24ncyBjdXJyZW50IHN0YXRlLlxuXHRcdFx0KiBPbmx5IHZpc2libGUgd2hlbiB0aGVyZSBhcmUgbW9yZSBhY3RpdmUgZGVidWcgc2Vzc2lvbnMvdGhyZWFkcyBydW5uaW5nLlxuXHRcdFx0Ki9cblx0XHRcdC5kZWJ1Zy1wYW5lIC5kZWJ1Zy1jYWxsLXN0YWNrIC50aHJlYWQgPiAuc3RhdGUubGFiZWwsXG5cdFx0XHQuZGVidWctcGFuZSAuZGVidWctY2FsbC1zdGFjayAuc2Vzc2lvbiA+IC5zdGF0ZS5sYWJlbCB7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6ICR7ZGVidWdWaWV3U3RhdGVMYWJlbEJhY2tncm91bmRDb2xvcn07XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnVmlld1N0YXRlTGFiZWxGb3JlZ3JvdW5kQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQvKiBTdGF0ZSBcImJhZGdlXCIgZGlzcGxheWluZyB0aGUgYWN0aXZlIHNlc3Npb24ncyBjdXJyZW50IHN0YXRlLlxuXHRcdFx0KiBPbmx5IHZpc2libGUgd2hlbiB0aGVyZSBhcmUgbW9yZSBhY3RpdmUgZGVidWcgc2Vzc2lvbnMvdGhyZWFkcyBydW5uaW5nXG5cdFx0XHQqIGFuZCB0aHJlYWQgcGF1c2VkIGR1ZSB0byBhIHRocm93biBleGNlcHRpb24uXG5cdFx0XHQqL1xuXHRcdFx0LmRlYnVnLXBhbmUgLmRlYnVnLWNhbGwtc3RhY2sgLnRocmVhZCA+IC5zdGF0ZS5sYWJlbC5leGNlcHRpb24sXG5cdFx0XHQuZGVidWctcGFuZSAuZGVidWctY2FsbC1zdGFjayAuc2Vzc2lvbiA+IC5zdGF0ZS5sYWJlbC5leGNlcHRpb24ge1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke2RlYnVnVmlld0V4Y2VwdGlvbkxhYmVsQmFja2dyb3VuZENvbG9yfTtcblx0XHRcdFx0Y29sb3I6ICR7ZGVidWdWaWV3RXhjZXB0aW9uTGFiZWxGb3JlZ3JvdW5kQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQvKiBJbmZvIFwiYmFkZ2VcIiBzaG93biB3aGVuIHRoZSBkZWJ1Z2dlciBwYXVzZXMgZHVlIHRvIGEgdGhyb3duIGV4Y2VwdGlvbi4gKi9cblx0XHRcdC5kZWJ1Zy1wYW5lIC5jYWxsLXN0YWNrLXN0YXRlLW1lc3NhZ2UgPiAubGFiZWwuZXhjZXB0aW9uIHtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHtkZWJ1Z1ZpZXdFeGNlcHRpb25MYWJlbEJhY2tncm91bmRDb2xvcn07XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnVmlld0V4Y2VwdGlvbkxhYmVsRm9yZWdyb3VuZENvbG9yfTtcblx0XHRcdH1cblxuXHRcdFx0LyogQW5pbWF0aW9uIG9mIGNoYW5nZWQgdmFsdWVzIGluIERlYnVnIHZpZXdsZXQgKi9cblx0XHRcdEBrZXlmcmFtZXMgZGVidWdWaWV3bGV0VmFsdWVDaGFuZ2VkIHtcblx0XHRcdFx0MCUgICB7IGJhY2tncm91bmQtY29sb3I6ICR7ZGVidWdWaWV3VmFsdWVDaGFuZ2VkSGlnaGxpZ2h0Q29sb3IudHJhbnNwYXJlbnQoMCl9IH1cblx0XHRcdFx0NSUgICB7IGJhY2tncm91bmQtY29sb3I6ICR7ZGVidWdWaWV3VmFsdWVDaGFuZ2VkSGlnaGxpZ2h0Q29sb3IudHJhbnNwYXJlbnQoMC45KX0gfVxuXHRcdFx0XHQxMDAlIHsgYmFja2dyb3VuZC1jb2xvcjogJHtkZWJ1Z1ZpZXdWYWx1ZUNoYW5nZWRIaWdobGlnaHRDb2xvci50cmFuc3BhcmVudCgwLjMpfSB9XG5cdFx0XHR9XG5cblx0XHRcdC5kZWJ1Zy1wYW5lIC5tb25hY28tbGlzdC1yb3cgLmV4cHJlc3Npb24gLnZhbHVlLmNoYW5nZWQge1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke2RlYnVnVmlld1ZhbHVlQ2hhbmdlZEhpZ2hsaWdodENvbG9yLnRyYW5zcGFyZW50KDAuMyl9O1xuXHRcdFx0XHRhbmltYXRpb24tbmFtZTogZGVidWdWaWV3bGV0VmFsdWVDaGFuZ2VkO1xuXHRcdFx0XHRhbmltYXRpb24tZHVyYXRpb246IDFzO1xuXHRcdFx0XHRhbmltYXRpb24tZmlsbC1tb2RlOiBmb3J3YXJkcztcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby1saXN0LXJvdyAuZXhwcmVzc2lvbiAubGF6eS1idXR0b246aG92ZXIge1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke3Rvb2xiYXJIb3ZlckJhY2tncm91bmRDb2xvcn1cblx0XHRcdH1cblx0XHRgKTtcblxuXHRcdGNvbnN0IGNvbnRyYXN0Qm9yZGVyQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihjb250cmFzdEJvcmRlcik7XG5cblx0XHRpZiAoY29udHJhc3RCb3JkZXJDb2xvcikge1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0LmRlYnVnLXBhbmUgLmxpbmUtbnVtYmVyIHtcblx0XHRcdFx0Ym9yZGVyOiAxcHggc29saWQgJHtjb250cmFzdEJvcmRlckNvbG9yfTtcblx0XHRcdH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdC8vIFVzZSBmdWxseS1vcGFxdWUgY29sb3JzIGZvciBsaW5lLW51bWJlciBiYWRnZXNcblx0XHRpZiAoaXNIaWdoQ29udHJhc3QodGhlbWUudHlwZSkpIHtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGBcblx0XHRcdC5kZWJ1Zy1wYW5lIC5saW5lLW51bWJlciB7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6ICR7YmFkZ2VCYWNrZ3JvdW5kQ29sb3J9O1xuXHRcdFx0XHRjb2xvcjogJHtiYWRnZUZvcmVncm91bmRDb2xvcn07XG5cdFx0XHR9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9rZW5OYW1lQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z1Rva2VuRXhwcmVzc2lvbk5hbWUpITtcblx0XHRjb25zdCB0b2tlblR5cGVDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnVG9rZW5FeHByZXNzaW9uVHlwZSkhO1xuXHRcdGNvbnN0IHRva2VuVmFsdWVDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnVG9rZW5FeHByZXNzaW9uVmFsdWUpITtcblx0XHRjb25zdCB0b2tlblN0cmluZ0NvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdUb2tlbkV4cHJlc3Npb25TdHJpbmcpITtcblx0XHRjb25zdCB0b2tlbkJvb2xlYW5Db2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnVG9rZW5FeHByZXNzaW9uQm9vbGVhbikhO1xuXHRcdGNvbnN0IHRva2VuRXJyb3JDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnVG9rZW5FeHByZXNzaW9uRXJyb3IpITtcblx0XHRjb25zdCB0b2tlbk51bWJlckNvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdUb2tlbkV4cHJlc3Npb25OdW1iZXIpITtcblxuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGBcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5tb25hY28tbGlzdC1yb3cgLmV4cHJlc3Npb24gLm5hbWUge1xuXHRcdFx0XHRjb2xvcjogJHt0b2tlbk5hbWVDb2xvcn07XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5tb25hY28tbGlzdC1yb3cgLmV4cHJlc3Npb24gLnR5cGUge1xuXHRcdFx0XHRjb2xvcjogJHt0b2tlblR5cGVDb2xvcn07XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5tb25hY28tbGlzdC1yb3cgLmV4cHJlc3Npb24gLnZhbHVlLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmRlYnVnLWhvdmVyLXdpZGdldCAudmFsdWUge1xuXHRcdFx0XHRjb2xvcjogJHt0b2tlblZhbHVlQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubW9uYWNvLWxpc3Qtcm93IC5leHByZXNzaW9uIC52YWx1ZS5zdHJpbmcsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuZGVidWctaG92ZXItd2lkZ2V0IC52YWx1ZS5zdHJpbmcge1xuXHRcdFx0XHRjb2xvcjogJHt0b2tlblN0cmluZ0NvbG9yfTtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLm1vbmFjby1saXN0LXJvdyAuZXhwcmVzc2lvbiAudmFsdWUuYm9vbGVhbixcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5kZWJ1Zy1ob3Zlci13aWRnZXQgLnZhbHVlLmJvb2xlYW4ge1xuXHRcdFx0XHRjb2xvcjogJHt0b2tlbkJvb2xlYW5Db2xvcn07XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5tb25hY28tbGlzdC1yb3cgLmV4cHJlc3Npb24gLmVycm9yLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmRlYnVnLWhvdmVyLXdpZGdldCAuZXJyb3IsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuZGVidWctcGFuZSAuZGVidWctdmFyaWFibGVzIC5zY29wZSAuZXJyb3Ige1xuXHRcdFx0XHRjb2xvcjogJHt0b2tlbkVycm9yQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAubW9uYWNvLWxpc3Qtcm93IC5leHByZXNzaW9uIC52YWx1ZS5udW1iZXIsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuZGVidWctaG92ZXItd2lkZ2V0IC52YWx1ZS5udW1iZXIge1xuXHRcdFx0XHRjb2xvcjogJHt0b2tlbk51bWJlckNvbG9yfTtcblx0XHRcdH1cblx0XHRgKTtcblxuXHRcdGNvbnN0IGRlYnVnQ29uc29sZUlucHV0Qm9yZGVyQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihpbnB1dEJvcmRlcikgfHwgQ29sb3IuZnJvbUhleCgnIzgwODA4MDYwJyk7XG5cdFx0Y29uc3QgZGVidWdDb25zb2xlSW5mb0ZvcmVncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnQ29uc29sZUluZm9Gb3JlZ3JvdW5kKSE7XG5cdFx0Y29uc3QgZGVidWdDb25zb2xlV2FybmluZ0ZvcmVncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnQ29uc29sZVdhcm5pbmdGb3JlZ3JvdW5kKSE7XG5cdFx0Y29uc3QgZGVidWdDb25zb2xlRXJyb3JGb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0NvbnNvbGVFcnJvckZvcmVncm91bmQpITtcblx0XHRjb25zdCBkZWJ1Z0NvbnNvbGVTb3VyY2VGb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0NvbnNvbGVTb3VyY2VGb3JlZ3JvdW5kKSE7XG5cdFx0Y29uc3QgZGVidWdDb25zb2xlSW5wdXRJY29uRm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdDb25zb2xlSW5wdXRJY29uRm9yZWdyb3VuZCkhO1xuXG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0LnJlcGwgLnJlcGwtaW5wdXQtd3JhcHBlciB7XG5cdFx0XHRcdGJvcmRlci10b3A6IDFweCBzb2xpZCAke2RlYnVnQ29uc29sZUlucHV0Qm9yZGVyQ29sb3J9O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucmVwbCAucmVwbC10cmVlIC5vdXRwdXQgLmV4cHJlc3Npb24gLnZhbHVlLmluZm8ge1xuXHRcdFx0XHRjb2xvcjogJHtkZWJ1Z0NvbnNvbGVJbmZvRm9yZWdyb3VuZENvbG9yfTtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnJlcGwgLnJlcGwtdHJlZSAub3V0cHV0IC5leHByZXNzaW9uIC52YWx1ZS53YXJuIHtcblx0XHRcdFx0Y29sb3I6ICR7ZGVidWdDb25zb2xlV2FybmluZ0ZvcmVncm91bmRDb2xvcn07XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5yZXBsIC5yZXBsLXRyZWUgLm91dHB1dCAuZXhwcmVzc2lvbiAudmFsdWUuZXJyb3Ige1xuXHRcdFx0XHRjb2xvcjogJHtkZWJ1Z0NvbnNvbGVFcnJvckZvcmVncm91bmRDb2xvcn07XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5yZXBsIC5yZXBsLXRyZWUgLm91dHB1dCAuZXhwcmVzc2lvbiAuc291cmNlIHtcblx0XHRcdFx0Y29sb3I6ICR7ZGVidWdDb25zb2xlU291cmNlRm9yZWdyb3VuZENvbG9yfTtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnJlcGwgLnJlcGwtdHJlZSAubW9uYWNvLXRsLWNvbnRlbnRzIC5hcnJvdyB7XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnQ29uc29sZUlucHV0SWNvbkZvcmVncm91bmRDb2xvcn07XG5cdFx0XHR9XG5cdFx0YCk7XG5cblx0XHRpZiAoIXRoZW1lLmRlZmluZXMoZGVidWdDb25zb2xlSW5wdXRJY29uRm9yZWdyb3VuZCkpIHtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGBcblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2gudnMgLnJlcGwgLnJlcGwtdHJlZSAubW9uYWNvLXRsLWNvbnRlbnRzIC5hcnJvdyB7XG5cdFx0XHRcdFx0b3BhY2l0eTogMC4yNTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoLnZzLWRhcmsgLnJlcGwgLnJlcGwtdHJlZSAubW9uYWNvLXRsLWNvbnRlbnRzIC5hcnJvdyB7XG5cdFx0XHRcdFx0b3BhY2l0eTogMC40O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2guaGMtYmxhY2sgLnJlcGwgLnJlcGwtdHJlZSAubW9uYWNvLXRsLWNvbnRlbnRzIC5hcnJvdyxcblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2guaGMtbGlnaHQgLnJlcGwgLnJlcGwtdHJlZSAubW9uYWNvLXRsLWNvbnRlbnRzIC5hcnJvdyB7XG5cdFx0XHRcdFx0b3BhY2l0eTogMTtcblx0XHRcdFx0fVxuXHRcdFx0YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVidWdJY29uU3RhcnRDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnSWNvblN0YXJ0Rm9yZWdyb3VuZCk7XG5cdFx0aWYgKGRlYnVnSWNvblN0YXJ0Q29sb3IpIHtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLXdvcmtiZW5jaCAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnU3RhcnQpfSB7IGNvbG9yOiAke2RlYnVnSWNvblN0YXJ0Q29sb3J9OyB9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVidWdJY29uUGF1c2VDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnSWNvblBhdXNlRm9yZWdyb3VuZCk7XG5cdFx0aWYgKGRlYnVnSWNvblBhdXNlQ29sb3IpIHtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLXdvcmtiZW5jaCAucGFydCA+IC50aXRsZSA+IC50aXRsZS1hY3Rpb25zIC5hY3Rpb24tbGFiZWwke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnUGF1c2UpfSwgLm1vbmFjby13b3JrYmVuY2ggJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1BhdXNlKX0geyBjb2xvcjogJHtkZWJ1Z0ljb25QYXVzZUNvbG9yfTsgfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlYnVnSWNvblN0b3BDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnSWNvblN0b3BGb3JlZ3JvdW5kKTtcblx0XHRpZiAoZGVidWdJY29uU3RvcENvbG9yKSB7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0b3ApfSwubW9uYWNvLXdvcmtiZW5jaCAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnU3RvcCl9IHsgY29sb3I6ICR7ZGVidWdJY29uU3RvcENvbG9yfTsgfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlYnVnSWNvbkRpc2Nvbm5lY3RDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnSWNvbkRpc2Nvbm5lY3RGb3JlZ3JvdW5kKTtcblx0XHRpZiAoZGVidWdJY29uRGlzY29ubmVjdENvbG9yKSB7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z0Rpc2Nvbm5lY3QpfSwubW9uYWNvLXdvcmtiZW5jaCAuZGVidWctdmlldy1jb250ZW50ICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdEaXNjb25uZWN0KX0sIC5tb25hY28td29ya2JlbmNoIC5kZWJ1Zy10b29sYmFyICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdEaXNjb25uZWN0KX0sIC5tb25hY28td29ya2JlbmNoIC5jb21tYW5kLWNlbnRlci1jZW50ZXIgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z0Rpc2Nvbm5lY3QpfSB7IGNvbG9yOiAke2RlYnVnSWNvbkRpc2Nvbm5lY3RDb2xvcn07IH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWJ1Z0ljb25SZXN0YXJ0Q29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25SZXN0YXJ0Rm9yZWdyb3VuZCk7XG5cdFx0aWYgKGRlYnVnSWNvblJlc3RhcnRDb2xvcikge1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdSZXN0YXJ0KX0sIC5tb25hY28td29ya2JlbmNoICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdSZXN0YXJ0RnJhbWUpfSwgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1Jlc3RhcnQpfSwgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1Jlc3RhcnRGcmFtZSl9IHsgY29sb3I6ICR7ZGVidWdJY29uUmVzdGFydENvbG9yfTsgfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlYnVnSWNvblN0ZXBPdmVyQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25TdGVwT3ZlckZvcmVncm91bmQpO1xuXHRcdGlmIChkZWJ1Z0ljb25TdGVwT3ZlckNvbG9yKSB7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0ZXBPdmVyKX0sIC5tb25hY28td29ya2JlbmNoICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGVwT3Zlcil9IHsgY29sb3I6ICR7ZGVidWdJY29uU3RlcE92ZXJDb2xvcn07IH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWJ1Z0ljb25TdGVwSW50b0NvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdJY29uU3RlcEludG9Gb3JlZ3JvdW5kKTtcblx0XHRpZiAoZGVidWdJY29uU3RlcEludG9Db2xvcikge1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGVwSW50byl9LCAubW9uYWNvLXdvcmtiZW5jaCAucGFydCA+IC50aXRsZSA+IC50aXRsZS1hY3Rpb25zIC5hY3Rpb24tbGFiZWwke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnU3RlcEludG8pfSwgLm1vbmFjby13b3JrYmVuY2ggJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0ZXBJbnRvKX0geyBjb2xvcjogJHtkZWJ1Z0ljb25TdGVwSW50b0NvbG9yfTsgfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlYnVnSWNvblN0ZXBPdXRDb2xvciA9IHRoZW1lLmdldENvbG9yKGRlYnVnSWNvblN0ZXBPdXRGb3JlZ3JvdW5kKTtcblx0XHRpZiAoZGVidWdJY29uU3RlcE91dENvbG9yKSB7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0ZXBPdXQpfSwgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0ZXBPdXQpfSwgLm1vbmFjby13b3JrYmVuY2ggJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0ZXBPdXQpfSB7IGNvbG9yOiAke2RlYnVnSWNvblN0ZXBPdXRDb2xvcn07IH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWJ1Z0ljb25Db250aW51ZUNvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdJY29uQ29udGludWVGb3JlZ3JvdW5kKTtcblx0XHRpZiAoZGVidWdJY29uQ29udGludWVDb2xvcikge1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5wYXJ0ID4gLnRpdGxlID4gLnRpdGxlLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdDb250aW51ZSl9LCAubW9uYWNvLXdvcmtiZW5jaCAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnQ29udGludWUpfSwgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1JldmVyc2VDb250aW51ZSl9LCAubW9uYWNvLXdvcmtiZW5jaCAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnUmV2ZXJzZUNvbnRpbnVlKX0geyBjb2xvcjogJHtkZWJ1Z0ljb25Db250aW51ZUNvbG9yfTsgfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlYnVnSWNvblN0ZXBCYWNrQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25TdGVwQmFja0ZvcmVncm91bmQpO1xuXHRcdGlmIChkZWJ1Z0ljb25TdGVwQmFja0NvbG9yKSB7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby13b3JrYmVuY2ggLnBhcnQgPiAudGl0bGUgPiAudGl0bGUtYWN0aW9ucyAuYWN0aW9uLWxhYmVsJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z1N0ZXBCYWNrKX0sIC5tb25hY28td29ya2JlbmNoICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGVwQmFjayl9IHsgY29sb3I6ICR7ZGVidWdJY29uU3RlcEJhY2tDb2xvcn07IH1gKTtcblx0XHR9XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlLFlBQVksc0JBQXNCLHlCQUF5QixpQkFBaUIsaUJBQWlCLGlCQUFpQiw0QkFBNEIsZ0JBQWdCLGFBQWEsOEJBQThCO0FBQzdOLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdC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
