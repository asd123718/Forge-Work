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
import { isSafari } from "../../../../base/browser/browser.js";
import { BrowserFeatures } from "../../../../base/browser/canIUse.js";
import * as dom from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { Separator, SubmenuAction, toAction } from "../../../../base/common/actions.js";
import { distinct } from "../../../../base/common/arrays.js";
import { RunOnceScheduler, timeout } from "../../../../base/common/async.js";
import { memoize } from "../../../../base/common/decorators.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { dispose, disposeIfDisposable } from "../../../../base/common/lifecycle.js";
import * as env from "../../../../base/common/platform.js";
import severity from "../../../../base/common/severity.js";
import { noBreakWhitespace } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ContentWidgetPositionPreference, MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { GlyphMarginLane, OverviewRulerLane, TrackedRangeStickiness } from "../../../../editor/common/model.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { registerThemingParticipant, themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { GutterActionsRegistry } from "../../codeEditor/browser/editorLineNumberMenu.js";
import { getBreakpointMessageAndIcon } from "./breakpointsView.js";
import { BreakpointWidget } from "./breakpointWidget.js";
import * as icons from "./debugIcons.js";
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, BreakpointWidgetContext, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, DebuggerString, IDebugService, State } from "../common/debug.js";
const $ = dom.$;
const breakpointHelperDecoration = {
  description: "breakpoint-helper-decoration",
  glyphMarginClassName: ThemeIcon.asClassName(icons.debugBreakpointHint),
  glyphMargin: { position: GlyphMarginLane.Right },
  glyphMarginHoverMessage: new MarkdownString().appendText(nls.localize("breakpointHelper", "Click to add a breakpoint")),
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
};
function createBreakpointDecorations(accessor, model, breakpoints, state, breakpointsActivated, showBreakpointsInOverviewRuler) {
  const result = [];
  breakpoints.forEach((breakpoint) => {
    if (breakpoint.lineNumber > model.getLineCount()) {
      return;
    }
    const hasOtherBreakpointsOnLine = breakpoints.some((bp) => bp !== breakpoint && bp.lineNumber === breakpoint.lineNumber);
    const column = model.getLineFirstNonWhitespaceColumn(breakpoint.lineNumber);
    const range = model.validateRange(
      breakpoint.column ? new Range(breakpoint.lineNumber, breakpoint.column, breakpoint.lineNumber, breakpoint.column + 1) : new Range(breakpoint.lineNumber, column, breakpoint.lineNumber, column + 1)
      // Decoration has to have a width #20688
    );
    result.push({
      options: getBreakpointDecorationOptions(accessor, model, breakpoint, state, breakpointsActivated, showBreakpointsInOverviewRuler, hasOtherBreakpointsOnLine),
      range
    });
  });
  return result;
}
function getBreakpointDecorationOptions(accessor, model, breakpoint, state, breakpointsActivated, showBreakpointsInOverviewRuler, hasOtherBreakpointsOnLine) {
  const debugService = accessor.get(IDebugService);
  const languageService = accessor.get(ILanguageService);
  const labelService = accessor.get(ILabelService);
  const { icon, message, showAdapterUnverifiedMessage } = getBreakpointMessageAndIcon(state, breakpointsActivated, breakpoint, labelService, debugService.getModel());
  let glyphMarginHoverMessage;
  let unverifiedMessage;
  if (showAdapterUnverifiedMessage) {
    let langId;
    unverifiedMessage = debugService.getModel().getSessions().map((s) => {
      const dbg = debugService.getAdapterManager().getDebugger(s.configuration.type);
      const message2 = dbg?.strings?.[DebuggerString.UnverifiedBreakpoints];
      if (message2) {
        if (!langId) {
          langId = languageService.guessLanguageIdByFilepathOrFirstLine(breakpoint.uri) ?? void 0;
        }
        return langId && dbg.interestedInLanguage(langId) ? message2 : void 0;
      }
      return void 0;
    }).find((messages) => !!messages);
  }
  if (message) {
    glyphMarginHoverMessage = new MarkdownString(void 0, { isTrusted: true, supportThemeIcons: true });
    if (breakpoint.condition || breakpoint.hitCondition) {
      const languageId = model.getLanguageId();
      glyphMarginHoverMessage.appendCodeblock(languageId, message);
      if (unverifiedMessage) {
        glyphMarginHoverMessage.appendMarkdown("$(warning) " + unverifiedMessage);
      }
    } else {
      glyphMarginHoverMessage.appendText(message);
      if (unverifiedMessage) {
        glyphMarginHoverMessage.appendMarkdown("\n\n$(warning) " + unverifiedMessage);
      }
    }
  } else if (unverifiedMessage) {
    glyphMarginHoverMessage = new MarkdownString(void 0, { isTrusted: true, supportThemeIcons: true }).appendMarkdown(unverifiedMessage);
  }
  let overviewRulerDecoration = null;
  if (showBreakpointsInOverviewRuler) {
    overviewRulerDecoration = {
      color: themeColorFromId(debugIconBreakpointForeground),
      position: OverviewRulerLane.Left
    };
  }
  const renderInline = breakpoint.column && (hasOtherBreakpointsOnLine || breakpoint.column > model.getLineFirstNonWhitespaceColumn(breakpoint.lineNumber));
  return {
    description: "breakpoint-decoration",
    glyphMargin: { position: GlyphMarginLane.Right },
    glyphMarginClassName: ThemeIcon.asClassName(icon),
    glyphMarginHoverMessage,
    stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    before: renderInline ? {
      content: noBreakWhitespace,
      inlineClassName: `debug-breakpoint-placeholder`,
      inlineClassNameAffectsLetterSpacing: true
    } : void 0,
    overviewRuler: overviewRulerDecoration,
    zIndex: 9999
  };
}
async function requestBreakpointCandidateLocations(model, lineNumbers, session) {
  if (!session.capabilities.supportsBreakpointLocationsRequest) {
    return [];
  }
  return await Promise.all(distinct(lineNumbers, (l) => l).map(async (lineNumber) => {
    try {
      return { lineNumber, positions: await session.breakpointsLocations(model.uri, lineNumber) };
    } catch {
      return { lineNumber, positions: [] };
    }
  }));
}
function createCandidateDecorations(model, breakpointDecorations, lineBreakpoints) {
  const result = [];
  for (const { positions, lineNumber } of lineBreakpoints) {
    if (positions.length === 0) {
      continue;
    }
    const firstColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
    const lastColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
    positions.forEach((p) => {
      const range = new Range(p.lineNumber, p.column, p.lineNumber, p.column + 1);
      if (p.column <= firstColumn && !breakpointDecorations.some((bp) => bp.range.startColumn > firstColumn && bp.range.startLineNumber === p.lineNumber) || p.column > lastColumn) {
        return;
      }
      const breakpointAtPosition = breakpointDecorations.find((bpd) => bpd.range.equalsRange(range));
      if (breakpointAtPosition && breakpointAtPosition.inlineWidget) {
        return;
      }
      result.push({
        range,
        options: {
          description: "breakpoint-placeholder-decoration",
          stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          before: breakpointAtPosition ? void 0 : {
            content: noBreakWhitespace,
            inlineClassName: `debug-breakpoint-placeholder`,
            inlineClassNameAffectsLetterSpacing: true
          }
        },
        breakpoint: breakpointAtPosition ? breakpointAtPosition.breakpoint : void 0
      });
    });
  }
  return result;
}
let BreakpointEditorContribution = class {
  constructor(editor, debugService, contextMenuService, instantiationService, contextKeyService, dialogService, configurationService, labelService) {
    this.editor = editor;
    this.debugService = debugService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.labelService = labelService;
    this.breakpointHintDecoration = null;
    this.toDispose = [];
    this.ignoreDecorationsChangedEvent = false;
    this.ignoreBreakpointsChangeEvent = false;
    this.breakpointDecorations = [];
    this.candidateDecorations = [];
    this.breakpointWidgetVisible = CONTEXT_BREAKPOINT_WIDGET_VISIBLE.bindTo(contextKeyService);
    this.setDecorationsScheduler = new RunOnceScheduler(() => this.setDecorations(), 30);
    this.setDecorationsScheduler.schedule();
    this.registerListeners();
  }
  /**
   * Returns context menu actions at the line number if breakpoints can be
   * set. This is used by the {@link TestingDecorations} to allow breakpoint
   * setting on lines where breakpoint "run" actions are present.
   */
  getContextMenuActionsAtPosition(lineNumber, model) {
    if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
      return [];
    }
    if (!this.debugService.canSetBreakpointsIn(model)) {
      return [];
    }
    const breakpoints = this.debugService.getModel().getBreakpoints({ lineNumber, uri: model.uri });
    return this.getContextMenuActions(breakpoints, model.uri, lineNumber);
  }
  registerListeners() {
    this.toDispose.push(this.editor.onMouseDown(async (e) => {
      if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
        return;
      }
      const model = this.editor.getModel();
      if (!e.target.position || !model || e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.detail.isAfterLines || !this.marginFreeFromNonDebugDecorations(e.target.position.lineNumber) && !e.target.element?.className.includes("breakpoint")) {
        return;
      }
      const canSetBreakpoints = this.debugService.canSetBreakpointsIn(model);
      const lineNumber = e.target.position.lineNumber;
      const uri = model.uri;
      if (e.event.rightButton || env.isMacintosh && e.event.leftButton && e.event.ctrlKey) {
        return;
      } else {
        const breakpoints = this.debugService.getModel().getBreakpoints({ uri, lineNumber });
        if (breakpoints.length) {
          const isShiftPressed = e.event.shiftKey;
          const isAltPressed = e.event.altKey;
          const enabled = breakpoints.some((bp) => bp.enabled);
          if (isAltPressed) {
            this.showBreakpointWidget(breakpoints[0].lineNumber, breakpoints[0].column);
          } else if (isShiftPressed) {
            breakpoints.forEach((bp) => this.debugService.enableOrDisableBreakpoints(!enabled, bp));
          } else if (!env.isLinux && breakpoints.some((bp) => !!bp.condition || !!bp.logMessage || !!bp.hitCondition || !!bp.triggeredBy)) {
            const logPoint = breakpoints.every((bp) => !!bp.logMessage);
            const breakpointType = logPoint ? nls.localize("logPoint", "Logpoint") : nls.localize("breakpoint", "Breakpoint");
            const disabledBreakpointDialogMessage = nls.localize(
              "breakpointHasConditionDisabled",
              "This {0} has a {1} that will get lost on remove. Consider enabling the {0} instead.",
              breakpointType.toLowerCase(),
              logPoint ? nls.localize("message", "message") : nls.localize("condition", "condition")
            );
            const enabledBreakpointDialogMessage = nls.localize(
              "breakpointHasConditionEnabled",
              "This {0} has a {1} that will get lost on remove. Consider disabling the {0} instead.",
              breakpointType.toLowerCase(),
              logPoint ? nls.localize("message", "message") : nls.localize("condition", "condition")
            );
            await this.dialogService.prompt({
              type: severity.Info,
              message: enabled ? enabledBreakpointDialogMessage : disabledBreakpointDialogMessage,
              buttons: [
                {
                  label: nls.localize({ key: "removeLogPoint", comment: ["&& denotes a mnemonic"] }, "&&Remove {0}", breakpointType),
                  run: () => breakpoints.forEach((bp) => this.debugService.removeBreakpoints(bp.getId()))
                },
                {
                  label: nls.localize("disableLogPoint", "{0} {1}", enabled ? nls.localize({ key: "disable", comment: ["&& denotes a mnemonic"] }, "&&Disable") : nls.localize({ key: "enable", comment: ["&& denotes a mnemonic"] }, "&&Enable"), breakpointType),
                  run: () => breakpoints.forEach((bp) => this.debugService.enableOrDisableBreakpoints(!enabled, bp))
                }
              ],
              cancelButton: true
            });
          } else {
            if (!enabled) {
              breakpoints.forEach((bp) => this.debugService.enableOrDisableBreakpoints(!enabled, bp));
            } else {
              breakpoints.forEach((bp) => this.debugService.removeBreakpoints(bp.getId()));
            }
          }
        } else if (canSetBreakpoints) {
          if (e.event.altKey) {
            this.showBreakpointWidget(lineNumber, void 0, BreakpointWidgetContext.CONDITION);
          } else if (e.event.middleButton) {
            const action = this.configurationService.getValue("debug").gutterMiddleClickAction;
            if (action !== "none") {
              let context;
              switch (action) {
                case "logpoint":
                  context = BreakpointWidgetContext.LOG_MESSAGE;
                  break;
                case "conditionalBreakpoint":
                  context = BreakpointWidgetContext.CONDITION;
                  break;
                case "triggeredBreakpoint":
                  context = BreakpointWidgetContext.TRIGGER_POINT;
              }
              this.showBreakpointWidget(lineNumber, void 0, context);
            }
          } else {
            this.debugService.addBreakpoints(uri, [{ lineNumber }]);
          }
        }
      }
    }));
    if (!(BrowserFeatures.pointerEvents && isSafari)) {
      this.toDispose.push(this.editor.onMouseMove((e) => {
        if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
          return;
        }
        let showBreakpointHintAtLineNumber = -1;
        const model = this.editor.getModel();
        if (model && e.target.position && (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.type === MouseTargetType.GUTTER_LINE_NUMBERS) && this.debugService.canSetBreakpointsIn(model) && this.marginFreeFromNonDebugDecorations(e.target.position.lineNumber)) {
          const data = e.target.detail;
          if (!data.isAfterLines) {
            showBreakpointHintAtLineNumber = e.target.position.lineNumber;
          }
        }
        this.ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber);
      }));
      this.toDispose.push(this.editor.onMouseLeave(() => {
        this.ensureBreakpointHintDecoration(-1);
      }));
    }
    this.toDispose.push(this.editor.onDidChangeModel(async () => {
      this.closeBreakpointWidget();
      await this.setDecorations();
    }));
    this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => {
      if (!this.ignoreBreakpointsChangeEvent && !this.setDecorationsScheduler.isScheduled()) {
        this.setDecorationsScheduler.schedule();
      }
    }));
    this.toDispose.push(this.debugService.onDidChangeState(() => {
      if (!this.setDecorationsScheduler.isScheduled()) {
        this.setDecorationsScheduler.schedule();
      }
    }));
    this.toDispose.push(this.editor.onDidChangeModelDecorations(() => this.onModelDecorationsChanged()));
    this.toDispose.push(this.configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("debug.showBreakpointsInOverviewRuler") || e.affectsConfiguration("debug.showInlineBreakpointCandidates")) {
        await this.setDecorations();
      }
    }));
  }
  getContextMenuActions(breakpoints, uri, lineNumber, column) {
    const actions = [];
    if (breakpoints.length === 1) {
      const breakpointType = breakpoints[0].logMessage ? nls.localize("logPoint", "Logpoint") : nls.localize("breakpoint", "Breakpoint");
      actions.push(toAction({
        id: "debug.removeBreakpoint",
        label: nls.localize("removeBreakpoint", "Remove {0}", breakpointType),
        enabled: true,
        run: async () => {
          await this.debugService.removeBreakpoints(breakpoints[0].getId());
        }
      }));
      actions.push(toAction({
        id: "workbench.debug.action.editBreakpointAction",
        label: nls.localize("editBreakpoint", "Edit {0}...", breakpointType),
        enabled: true,
        run: () => Promise.resolve(this.showBreakpointWidget(breakpoints[0].lineNumber, breakpoints[0].column))
      }));
      actions.push(toAction({
        id: `workbench.debug.viewlet.action.toggleBreakpoint`,
        label: breakpoints[0].enabled ? nls.localize("disableBreakpoint", "Disable {0}", breakpointType) : nls.localize("enableBreakpoint", "Enable {0}", breakpointType),
        enabled: true,
        run: () => this.debugService.enableOrDisableBreakpoints(!breakpoints[0].enabled, breakpoints[0])
      }));
    } else if (breakpoints.length > 1) {
      const sorted = breakpoints.slice().sort((first, second) => first.column && second.column ? first.column - second.column : 1);
      actions.push(new SubmenuAction("debug.removeBreakpoints", nls.localize("removeBreakpoints", "Remove Breakpoints"), sorted.map((bp) => toAction({
        id: "removeInlineBreakpoint",
        label: bp.column ? nls.localize("removeInlineBreakpointOnColumn", "Remove Inline Breakpoint on Column {0}", bp.column) : nls.localize("removeLineBreakpoint", "Remove Line Breakpoint"),
        enabled: true,
        run: () => this.debugService.removeBreakpoints(bp.getId())
      }))));
      actions.push(new SubmenuAction("debug.editBreakpoints", nls.localize("editBreakpoints", "Edit Breakpoints"), sorted.map(
        (bp) => toAction({
          id: "editBreakpoint",
          label: bp.column ? nls.localize("editInlineBreakpointOnColumn", "Edit Inline Breakpoint on Column {0}", bp.column) : nls.localize("editLineBreakpoint", "Edit Line Breakpoint"),
          enabled: true,
          run: () => Promise.resolve(this.showBreakpointWidget(bp.lineNumber, bp.column))
        })
      )));
      actions.push(new SubmenuAction("debug.enableDisableBreakpoints", nls.localize("enableDisableBreakpoints", "Enable/Disable Breakpoints"), sorted.map((bp) => toAction({
        id: bp.enabled ? "disableColumnBreakpoint" : "enableColumnBreakpoint",
        label: bp.enabled ? bp.column ? nls.localize("disableInlineColumnBreakpoint", "Disable Inline Breakpoint on Column {0}", bp.column) : nls.localize("disableBreakpointOnLine", "Disable Line Breakpoint") : bp.column ? nls.localize("enableBreakpoints", "Enable Inline Breakpoint on Column {0}", bp.column) : nls.localize("enableBreakpointOnLine", "Enable Line Breakpoint"),
        enabled: true,
        run: () => this.debugService.enableOrDisableBreakpoints(!bp.enabled, bp)
      }))));
    } else {
      actions.push(toAction({
        id: "addBreakpoint",
        label: nls.localize("addBreakpoint", "Add Breakpoint"),
        enabled: true,
        run: () => this.debugService.addBreakpoints(uri, [{ lineNumber, column }])
      }));
      actions.push(toAction({
        id: "addConditionalBreakpoint",
        label: nls.localize("addConditionalBreakpoint", "Add Conditional Breakpoint..."),
        enabled: true,
        run: () => Promise.resolve(this.showBreakpointWidget(lineNumber, column, BreakpointWidgetContext.CONDITION))
      }));
      actions.push(toAction({
        id: "addLogPoint",
        label: nls.localize("addLogPoint", "Add Logpoint..."),
        enabled: true,
        run: () => Promise.resolve(this.showBreakpointWidget(lineNumber, column, BreakpointWidgetContext.LOG_MESSAGE))
      }));
      actions.push(toAction({
        id: "addTriggeredBreakpoint",
        label: nls.localize("addTriggeredBreakpoint", "Add Triggered Breakpoint..."),
        enabled: true,
        run: () => Promise.resolve(this.showBreakpointWidget(lineNumber, column, BreakpointWidgetContext.TRIGGER_POINT))
      }));
    }
    if (this.debugService.state === State.Stopped) {
      actions.push(new Separator());
      actions.push(toAction({
        id: "runToLine",
        label: nls.localize("runToLine", "Run to Line"),
        enabled: true,
        run: () => this.debugService.runTo(uri, lineNumber).catch(onUnexpectedError)
      }));
    }
    return actions;
  }
  marginFreeFromNonDebugDecorations(line) {
    const decorations = this.editor.getLineDecorations(line);
    if (decorations) {
      for (const { options } of decorations) {
        const clz = options.glyphMarginClassName;
        if (!clz) {
          continue;
        }
        const hasSomeActionableCodicon = !(clz.includes("codicon-") || clz.startsWith("coverage-deco-")) || clz.includes("codicon-testing-") || clz.includes("codicon-merge-") || clz.includes("codicon-arrow-") || clz.includes("codicon-loading") || clz.includes("codicon-fold") || clz.includes("codicon-gutter-lightbulb") || clz.includes("codicon-lightbulb-sparkle");
        if (hasSomeActionableCodicon) {
          return false;
        }
      }
    }
    return true;
  }
  ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber) {
    this.editor.changeDecorations((accessor) => {
      if (this.breakpointHintDecoration) {
        accessor.removeDecoration(this.breakpointHintDecoration);
        this.breakpointHintDecoration = null;
      }
      if (showBreakpointHintAtLineNumber !== -1) {
        this.breakpointHintDecoration = accessor.addDecoration(
          {
            startLineNumber: showBreakpointHintAtLineNumber,
            startColumn: 1,
            endLineNumber: showBreakpointHintAtLineNumber,
            endColumn: 1
          },
          breakpointHelperDecoration
        );
      }
    });
  }
  async setDecorations() {
    if (!this.editor.hasModel()) {
      return;
    }
    const setCandidateDecorations = (changeAccessor, desiredCandidatePositions2) => {
      const desiredCandidateDecorations = createCandidateDecorations(model, this.breakpointDecorations, desiredCandidatePositions2);
      const candidateDecorationIds = changeAccessor.deltaDecorations(this.candidateDecorations.map((c) => c.decorationId), desiredCandidateDecorations);
      this.candidateDecorations.forEach((candidate) => {
        candidate.inlineWidget.dispose();
      });
      this.candidateDecorations = candidateDecorationIds.map((decorationId, index) => {
        const candidate = desiredCandidateDecorations[index];
        const icon = candidate.breakpoint ? getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), candidate.breakpoint, this.labelService, this.debugService.getModel()).icon : icons.breakpoint.disabled;
        const contextMenuActions = () => this.getContextMenuActions(candidate.breakpoint ? [candidate.breakpoint] : [], activeCodeEditor.getModel().uri, candidate.range.startLineNumber, candidate.range.startColumn);
        const inlineWidget = new InlineBreakpointWidget(activeCodeEditor, decorationId, ThemeIcon.asClassName(icon), candidate.breakpoint, this.debugService, this.contextMenuService, contextMenuActions);
        return {
          decorationId,
          inlineWidget
        };
      });
    };
    const activeCodeEditor = this.editor;
    const model = activeCodeEditor.getModel();
    const breakpoints = this.debugService.getModel().getBreakpoints({ uri: model.uri });
    const debugSettings = this.configurationService.getValue("debug");
    const desiredBreakpointDecorations = this.instantiationService.invokeFunction((accessor) => createBreakpointDecorations(accessor, model, breakpoints, this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), debugSettings.showBreakpointsInOverviewRuler));
    const session = this.debugService.getViewModel().focusedSession;
    const desiredCandidatePositions = debugSettings.showInlineBreakpointCandidates && session ? requestBreakpointCandidateLocations(this.editor.getModel(), desiredBreakpointDecorations.map((bp) => bp.range.startLineNumber), session) : Promise.resolve([]);
    const desiredCandidatePositionsRaced = await Promise.race([desiredCandidatePositions, timeout(500).then(() => void 0)]);
    if (desiredCandidatePositionsRaced === void 0) {
      desiredCandidatePositions.then((v) => activeCodeEditor.changeDecorations((d) => setCandidateDecorations(d, v)));
    }
    try {
      this.ignoreDecorationsChangedEvent = true;
      activeCodeEditor.changeDecorations((changeAccessor) => {
        const decorationIds = changeAccessor.deltaDecorations(this.breakpointDecorations.map((bpd) => bpd.decorationId), desiredBreakpointDecorations);
        this.breakpointDecorations.forEach((bpd) => {
          bpd.inlineWidget?.dispose();
        });
        this.breakpointDecorations = decorationIds.map((decorationId, index) => {
          let inlineWidget = void 0;
          const breakpoint = breakpoints[index];
          if (desiredBreakpointDecorations[index].options.before) {
            const contextMenuActions = () => this.getContextMenuActions([breakpoint], activeCodeEditor.getModel().uri, breakpoint.lineNumber, breakpoint.column);
            inlineWidget = new InlineBreakpointWidget(activeCodeEditor, decorationId, desiredBreakpointDecorations[index].options.glyphMarginClassName, breakpoint, this.debugService, this.contextMenuService, contextMenuActions);
          }
          return {
            decorationId,
            breakpoint,
            range: desiredBreakpointDecorations[index].range,
            inlineWidget
          };
        });
        if (desiredCandidatePositionsRaced) {
          setCandidateDecorations(changeAccessor, desiredCandidatePositionsRaced);
        }
      });
    } finally {
      this.ignoreDecorationsChangedEvent = false;
    }
    for (const d of this.breakpointDecorations) {
      if (d.inlineWidget) {
        this.editor.layoutContentWidget(d.inlineWidget);
      }
    }
  }
  async onModelDecorationsChanged() {
    if (this.breakpointDecorations.length === 0 || this.ignoreDecorationsChangedEvent || !this.editor.hasModel()) {
      return;
    }
    let somethingChanged = false;
    const model = this.editor.getModel();
    this.breakpointDecorations.forEach((breakpointDecoration) => {
      if (somethingChanged) {
        return;
      }
      const newBreakpointRange = model.getDecorationRange(breakpointDecoration.decorationId);
      if (newBreakpointRange && !breakpointDecoration.range.equalsRange(newBreakpointRange)) {
        somethingChanged = true;
        breakpointDecoration.range = newBreakpointRange;
      }
    });
    if (!somethingChanged) {
      return;
    }
    const data = /* @__PURE__ */ new Map();
    for (let i = 0, len = this.breakpointDecorations.length; i < len; i++) {
      const breakpointDecoration = this.breakpointDecorations[i];
      const decorationRange = model.getDecorationRange(breakpointDecoration.decorationId);
      if (decorationRange) {
        if (breakpointDecoration.breakpoint) {
          data.set(breakpointDecoration.breakpoint.getId(), {
            lineNumber: decorationRange.startLineNumber,
            column: breakpointDecoration.breakpoint.column ? decorationRange.startColumn : void 0
          });
        }
      }
    }
    try {
      this.ignoreBreakpointsChangeEvent = true;
      await this.debugService.updateBreakpoints(model.uri, data, true);
    } finally {
      this.ignoreBreakpointsChangeEvent = false;
    }
  }
  // breakpoint widget
  showBreakpointWidget(lineNumber, column, context) {
    this.breakpointWidget?.dispose();
    this.breakpointWidget = this.instantiationService.createInstance(BreakpointWidget, this.editor, lineNumber, column, context);
    this.breakpointWidget.show({ lineNumber, column: 1 });
    this.breakpointWidgetVisible.set(true);
  }
  closeBreakpointWidget() {
    if (this.breakpointWidget) {
      this.breakpointWidget.dispose();
      this.breakpointWidget = void 0;
      this.breakpointWidgetVisible.reset();
      this.editor.focus();
    }
  }
  dispose() {
    this.breakpointWidget?.dispose();
    this.setDecorationsScheduler.dispose();
    this.editor.removeDecorations(this.breakpointDecorations.map((bpd) => bpd.decorationId));
    dispose(this.toDispose);
  }
};
BreakpointEditorContribution = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILabelService)
], BreakpointEditorContribution);
GutterActionsRegistry.registerGutterActionsGenerator(({ lineNumber, editor, accessor }, result) => {
  const model = editor.getModel();
  const debugService = accessor.get(IDebugService);
  if (!model || !debugService.getAdapterManager().hasEnabledDebuggers() || !debugService.canSetBreakpointsIn(model)) {
    return;
  }
  const breakpointEditorContribution = editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID);
  if (!breakpointEditorContribution) {
    return;
  }
  const actions = breakpointEditorContribution.getContextMenuActionsAtPosition(lineNumber, model);
  for (const action of actions) {
    result.push(action, "2_debug");
  }
});
class InlineBreakpointWidget {
  constructor(editor, decorationId, cssClass, breakpoint, debugService, contextMenuService, getContextMenuActions) {
    this.editor = editor;
    this.decorationId = decorationId;
    this.breakpoint = breakpoint;
    this.debugService = debugService;
    this.contextMenuService = contextMenuService;
    this.getContextMenuActions = getContextMenuActions;
    // editor.IContentWidget.allowEditorOverflow
    this.allowEditorOverflow = false;
    this.suppressMouseDown = true;
    this.toDispose = [];
    this.range = this.editor.getModel().getDecorationRange(decorationId);
    this.toDispose.push(this.editor.onDidChangeModelDecorations(() => {
      const model = this.editor.getModel();
      const range = model.getDecorationRange(this.decorationId);
      if (this.range && !this.range.equalsRange(range)) {
        this.range = range;
        this.editor.layoutContentWidget(this);
        this.updateSize();
      }
    }));
    this.create(cssClass);
    this.editor.addContentWidget(this);
    this.editor.layoutContentWidget(this);
  }
  create(cssClass) {
    this.domNode = $(".inline-breakpoint-widget");
    if (cssClass) {
      this.domNode.classList.add(...cssClass.split(" "));
    }
    this.toDispose.push(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, async (e) => {
      switch (this.breakpoint?.enabled) {
        case void 0:
          await this.debugService.addBreakpoints(this.editor.getModel().uri, [{ lineNumber: this.range.startLineNumber, column: this.range.startColumn }]);
          break;
        case true:
          await this.debugService.removeBreakpoints(this.breakpoint.getId());
          break;
        case false:
          this.debugService.enableOrDisableBreakpoints(true, this.breakpoint);
          break;
      }
    }));
    this.toDispose.push(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, (e) => {
      const event = new StandardMouseEvent(dom.getWindow(this.domNode), e);
      const actions = this.getContextMenuActions();
      this.contextMenuService.showContextMenu({
        getAnchor: () => event,
        getActions: () => actions,
        getActionsContext: () => this.breakpoint,
        onHide: () => disposeIfDisposable(actions)
      });
    }));
    this.updateSize();
    this.toDispose.push(this.editor.onDidChangeConfiguration((c) => {
      if (c.hasChanged(EditorOption.fontSize) || c.hasChanged(EditorOption.lineHeight)) {
        this.updateSize();
      }
    }));
  }
  updateSize() {
    const lineHeight = this.range ? this.editor.getLineHeightForPosition(this.range.getStartPosition()) : this.editor.getOption(EditorOption.lineHeight);
    this.domNode.style.height = `${lineHeight}px`;
    this.domNode.style.width = `${Math.ceil(0.8 * lineHeight)}px`;
    this.domNode.style.marginLeft = `4px`;
  }
  getId() {
    return generateUuid();
  }
  getDomNode() {
    return this.domNode;
  }
  getPosition() {
    if (!this.range) {
      return null;
    }
    this.domNode.classList.toggle("line-start", this.range.startColumn === 1);
    return {
      position: { lineNumber: this.range.startLineNumber, column: this.range.startColumn - 1 },
      preference: [ContentWidgetPositionPreference.EXACT]
    };
  }
  dispose() {
    this.editor.removeContentWidget(this);
    dispose(this.toDispose);
  }
}
__decorateClass([
  memoize
], InlineBreakpointWidget.prototype, "getId", 1);
registerThemingParticipant((theme, collector) => {
  const scope = ".monaco-editor .glyph-margin-widgets, .monaco-workbench .debug-breakpoints, .monaco-workbench .disassembly-view, .monaco-editor .contentWidgets";
  const debugIconBreakpointColor = theme.getColor(debugIconBreakpointForeground);
  if (debugIconBreakpointColor) {
    collector.addRule(`${scope} {
			${icons.allBreakpoints.map((b) => `${ThemeIcon.asCSSSelector(b.regular)}`).join(",\n		")},
			${ThemeIcon.asCSSSelector(icons.debugBreakpointUnsupported)},
			${ThemeIcon.asCSSSelector(icons.debugBreakpointHint)}:not([class*='codicon-debug-breakpoint']):not([class*='codicon-debug-stackframe']),
			${ThemeIcon.asCSSSelector(icons.breakpoint.regular)}${ThemeIcon.asCSSSelector(icons.debugStackframeFocused)}::after,
			${ThemeIcon.asCSSSelector(icons.breakpoint.regular)}${ThemeIcon.asCSSSelector(icons.debugStackframe)}::after {
				color: ${debugIconBreakpointColor} !important;
			}
		}`);
    collector.addRule(`${scope} {
			${ThemeIcon.asCSSSelector(icons.breakpoint.pending)} {
				color: ${debugIconBreakpointColor} !important;
				font-size: 12px !important;
			}
		}`);
  }
  const debugIconBreakpointDisabledColor = theme.getColor(debugIconBreakpointDisabledForeground);
  if (debugIconBreakpointDisabledColor) {
    collector.addRule(`${scope} {
			${icons.allBreakpoints.map((b) => ThemeIcon.asCSSSelector(b.disabled)).join(",\n		")} {
				color: ${debugIconBreakpointDisabledColor};
			}
		}`);
  }
  const debugIconBreakpointUnverifiedColor = theme.getColor(debugIconBreakpointUnverifiedForeground);
  if (debugIconBreakpointUnverifiedColor) {
    collector.addRule(`${scope} {
			${icons.allBreakpoints.map((b) => ThemeIcon.asCSSSelector(b.unverified)).join(",\n		")} {
				color: ${debugIconBreakpointUnverifiedColor};
			}
		}`);
  }
  const debugIconBreakpointCurrentStackframeForegroundColor = theme.getColor(debugIconBreakpointCurrentStackframeForeground);
  if (debugIconBreakpointCurrentStackframeForegroundColor) {
    collector.addRule(`
		.monaco-editor .debug-top-stack-frame-column {
			color: ${debugIconBreakpointCurrentStackframeForegroundColor} !important;
		}
		${scope} {
			${ThemeIcon.asCSSSelector(icons.debugStackframe)} {
				color: ${debugIconBreakpointCurrentStackframeForegroundColor} !important;
			}
		}
		`);
  }
  const debugIconBreakpointStackframeFocusedColor = theme.getColor(debugIconBreakpointStackframeForeground);
  if (debugIconBreakpointStackframeFocusedColor) {
    collector.addRule(`${scope} {
			${ThemeIcon.asCSSSelector(icons.debugStackframeFocused)} {
				color: ${debugIconBreakpointStackframeFocusedColor} !important;
			}
		}`);
  }
});
const debugIconBreakpointForeground = registerColor("debugIcon.breakpointForeground", "#E51400", nls.localize("debugIcon.breakpointForeground", "Icon color for breakpoints."));
const debugIconBreakpointDisabledForeground = registerColor("debugIcon.breakpointDisabledForeground", "#848484", nls.localize("debugIcon.breakpointDisabledForeground", "Icon color for disabled breakpoints."));
const debugIconBreakpointUnverifiedForeground = registerColor("debugIcon.breakpointUnverifiedForeground", "#848484", nls.localize("debugIcon.breakpointUnverifiedForeground", "Icon color for unverified breakpoints."));
const debugIconBreakpointCurrentStackframeForeground = registerColor("debugIcon.breakpointCurrentStackframeForeground", { dark: "#FFCC00", light: "#BE8700", hcDark: "#FFCC00", hcLight: "#BE8700" }, nls.localize("debugIcon.breakpointCurrentStackframeForeground", "Icon color for the current breakpoint stack frame."));
const debugIconBreakpointStackframeForeground = registerColor("debugIcon.breakpointStackframeForeground", "#89D185", nls.localize("debugIcon.breakpointStackframeForeground", "Icon color for all breakpoint stack frames."));
export {
  BreakpointEditorContribution,
  createBreakpointDecorations,
  debugIconBreakpointForeground
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxicmVha3BvaW50RWRpdG9yQ29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNTYWZhcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRmVhdHVyZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY2FuSVVzZS5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlLCBkaXNwb3NlSWZEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBlbnYgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IG5vQnJlYWtXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUFjdGl2ZUNvZGVFZGl0b3IsIElDb2RlRWRpdG9yLCBJQ29udGVudFdpZGdldCwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiwgSUVkaXRvck1vdXNlRXZlbnQsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IEdseXBoTWFyZ2luTGFuZSwgSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMsIElNb2RlbERlY29yYXRpb25PdmVydmlld1J1bGVyT3B0aW9ucywgSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvciwgSVRleHRNb2RlbCwgT3ZlcnZpZXdSdWxlckxhbmUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCwgdGhlbWVDb2xvckZyb21JZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR3V0dGVyQWN0aW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL2VkaXRvckxpbmVOdW1iZXJNZW51LmpzJztcbmltcG9ydCB7IGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbiB9IGZyb20gJy4vYnJlYWtwb2ludHNWaWV3LmpzJztcbmltcG9ydCB7IEJyZWFrcG9pbnRXaWRnZXQgfSBmcm9tICcuL2JyZWFrcG9pbnRXaWRnZXQuanMnO1xuaW1wb3J0ICogYXMgaWNvbnMgZnJvbSAnLi9kZWJ1Z0ljb25zLmpzJztcbmltcG9ydCB7IEJSRUFLUE9JTlRfRURJVE9SX0NPTlRSSUJVVElPTl9JRCwgQnJlYWtwb2ludFdpZGdldENvbnRleHQsIENPTlRFWFRfQlJFQUtQT0lOVF9XSURHRVRfVklTSUJMRSwgRGVidWdnZXJTdHJpbmcsIElCcmVha3BvaW50LCBJQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbiwgSUJyZWFrcG9pbnRVcGRhdGVEYXRhLCBJRGVidWdDb25maWd1cmF0aW9uLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuaW50ZXJmYWNlIElCcmVha3BvaW50RGVjb3JhdGlvbiB7XG5cdGRlY29yYXRpb25JZDogc3RyaW5nO1xuXHRicmVha3BvaW50OiBJQnJlYWtwb2ludDtcblx0cmFuZ2U6IFJhbmdlO1xuXHRpbmxpbmVXaWRnZXQ/OiBJbmxpbmVCcmVha3BvaW50V2lkZ2V0O1xufVxuXG5jb25zdCBicmVha3BvaW50SGVscGVyRGVjb3JhdGlvbjogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgPSB7XG5cdGRlc2NyaXB0aW9uOiAnYnJlYWtwb2ludC1oZWxwZXItZGVjb3JhdGlvbicsXG5cdGdseXBoTWFyZ2luQ2xhc3NOYW1lOiBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbnMuZGVidWdCcmVha3BvaW50SGludCksXG5cdGdseXBoTWFyZ2luOiB7IHBvc2l0aW9uOiBHbHlwaE1hcmdpbkxhbmUuUmlnaHQgfSxcblx0Z2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQobmxzLmxvY2FsaXplKCdicmVha3BvaW50SGVscGVyJywgXCJDbGljayB0byBhZGQgYSBicmVha3BvaW50XCIpKSxcblx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXNcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVCcmVha3BvaW50RGVjb3JhdGlvbnMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG1vZGVsOiBJVGV4dE1vZGVsLCBicmVha3BvaW50czogUmVhZG9ubHlBcnJheTxJQnJlYWtwb2ludD4sIHN0YXRlOiBTdGF0ZSwgYnJlYWtwb2ludHNBY3RpdmF0ZWQ6IGJvb2xlYW4sIHNob3dCcmVha3BvaW50c0luT3ZlcnZpZXdSdWxlcjogYm9vbGVhbik6IHsgcmFuZ2U6IFJhbmdlOyBvcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9W10ge1xuXHRjb25zdCByZXN1bHQ6IHsgcmFuZ2U6IFJhbmdlOyBvcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9W10gPSBbXTtcblx0YnJlYWtwb2ludHMuZm9yRWFjaCgoYnJlYWtwb2ludCkgPT4ge1xuXHRcdGlmIChicmVha3BvaW50LmxpbmVOdW1iZXIgPiBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBoYXNPdGhlckJyZWFrcG9pbnRzT25MaW5lID0gYnJlYWtwb2ludHMuc29tZShicCA9PiBicCAhPT0gYnJlYWtwb2ludCAmJiBicC5saW5lTnVtYmVyID09PSBicmVha3BvaW50LmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGNvbHVtbiA9IG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oYnJlYWtwb2ludC5saW5lTnVtYmVyKTtcblx0XHRjb25zdCByYW5nZSA9IG1vZGVsLnZhbGlkYXRlUmFuZ2UoXG5cdFx0XHRicmVha3BvaW50LmNvbHVtbiA/IG5ldyBSYW5nZShicmVha3BvaW50LmxpbmVOdW1iZXIsIGJyZWFrcG9pbnQuY29sdW1uLCBicmVha3BvaW50LmxpbmVOdW1iZXIsIGJyZWFrcG9pbnQuY29sdW1uICsgMSlcblx0XHRcdFx0OiBuZXcgUmFuZ2UoYnJlYWtwb2ludC5saW5lTnVtYmVyLCBjb2x1bW4sIGJyZWFrcG9pbnQubGluZU51bWJlciwgY29sdW1uICsgMSkgLy8gRGVjb3JhdGlvbiBoYXMgdG8gaGF2ZSBhIHdpZHRoICMyMDY4OFxuXHRcdCk7XG5cblx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRvcHRpb25zOiBnZXRCcmVha3BvaW50RGVjb3JhdGlvbk9wdGlvbnMoYWNjZXNzb3IsIG1vZGVsLCBicmVha3BvaW50LCBzdGF0ZSwgYnJlYWtwb2ludHNBY3RpdmF0ZWQsIHNob3dCcmVha3BvaW50c0luT3ZlcnZpZXdSdWxlciwgaGFzT3RoZXJCcmVha3BvaW50c09uTGluZSksXG5cdFx0XHRyYW5nZVxuXHRcdH0pO1xuXHR9KTtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBnZXRCcmVha3BvaW50RGVjb3JhdGlvbk9wdGlvbnMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG1vZGVsOiBJVGV4dE1vZGVsLCBicmVha3BvaW50OiBJQnJlYWtwb2ludCwgc3RhdGU6IFN0YXRlLCBicmVha3BvaW50c0FjdGl2YXRlZDogYm9vbGVhbiwgc2hvd0JyZWFrcG9pbnRzSW5PdmVydmlld1J1bGVyOiBib29sZWFuLCBoYXNPdGhlckJyZWFrcG9pbnRzT25MaW5lOiBib29sZWFuKTogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMge1xuXHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0Y29uc3QgbGFiZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpO1xuXHRjb25zdCB7IGljb24sIG1lc3NhZ2UsIHNob3dBZGFwdGVyVW52ZXJpZmllZE1lc3NhZ2UgfSA9IGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbihzdGF0ZSwgYnJlYWtwb2ludHNBY3RpdmF0ZWQsIGJyZWFrcG9pbnQsIGxhYmVsU2VydmljZSwgZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkpO1xuXHRsZXQgZ2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2U6IE1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGxldCB1bnZlcmlmaWVkTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRpZiAoc2hvd0FkYXB0ZXJVbnZlcmlmaWVkTWVzc2FnZSkge1xuXHRcdGxldCBsYW5nSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR1bnZlcmlmaWVkTWVzc2FnZSA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKCkubWFwKHMgPT4ge1xuXHRcdFx0Y29uc3QgZGJnID0gZGVidWdTZXJ2aWNlLmdldEFkYXB0ZXJNYW5hZ2VyKCkuZ2V0RGVidWdnZXIocy5jb25maWd1cmF0aW9uLnR5cGUpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGRiZz8uc3RyaW5ncz8uW0RlYnVnZ2VyU3RyaW5nLlVudmVyaWZpZWRCcmVha3BvaW50c107XG5cdFx0XHRpZiAobWVzc2FnZSkge1xuXHRcdFx0XHRpZiAoIWxhbmdJZCkge1xuXHRcdFx0XHRcdC8vIExhemlseSBjb21wdXRlIHRoaXMsIG9ubHkgaWYgbmVlZGVkIGZvciBzb21lIGRlYnVnIGFkYXB0ZXJcblx0XHRcdFx0XHRsYW5nSWQgPSBsYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKGJyZWFrcG9pbnQudXJpKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGxhbmdJZCAmJiBkYmcuaW50ZXJlc3RlZEluTGFuZ3VhZ2UobGFuZ0lkKSA/IG1lc3NhZ2UgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSlcblx0XHRcdC5maW5kKG1lc3NhZ2VzID0+ICEhbWVzc2FnZXMpO1xuXHR9XG5cblx0aWYgKG1lc3NhZ2UpIHtcblx0XHRnbHlwaE1hcmdpbkhvdmVyTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRpZiAoYnJlYWtwb2ludC5jb25kaXRpb24gfHwgYnJlYWtwb2ludC5oaXRDb25kaXRpb24pIHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBtb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0XHRnbHlwaE1hcmdpbkhvdmVyTWVzc2FnZS5hcHBlbmRDb2RlYmxvY2sobGFuZ3VhZ2VJZCwgbWVzc2FnZSk7XG5cdFx0XHRpZiAodW52ZXJpZmllZE1lc3NhZ2UpIHtcblx0XHRcdFx0Z2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oJyQod2FybmluZykgJyArIHVudmVyaWZpZWRNZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Z2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2UuYXBwZW5kVGV4dChtZXNzYWdlKTtcblx0XHRcdGlmICh1bnZlcmlmaWVkTWVzc2FnZSkge1xuXHRcdFx0XHRnbHlwaE1hcmdpbkhvdmVyTWVzc2FnZS5hcHBlbmRNYXJrZG93bignXFxuXFxuJCh3YXJuaW5nKSAnICsgdW52ZXJpZmllZE1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIGlmICh1bnZlcmlmaWVkTWVzc2FnZSkge1xuXHRcdGdseXBoTWFyZ2luSG92ZXJNZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pLmFwcGVuZE1hcmtkb3duKHVudmVyaWZpZWRNZXNzYWdlKTtcblx0fVxuXG5cdGxldCBvdmVydmlld1J1bGVyRGVjb3JhdGlvbjogSU1vZGVsRGVjb3JhdGlvbk92ZXJ2aWV3UnVsZXJPcHRpb25zIHwgbnVsbCA9IG51bGw7XG5cdGlmIChzaG93QnJlYWtwb2ludHNJbk92ZXJ2aWV3UnVsZXIpIHtcblx0XHRvdmVydmlld1J1bGVyRGVjb3JhdGlvbiA9IHtcblx0XHRcdGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKGRlYnVnSWNvbkJyZWFrcG9pbnRGb3JlZ3JvdW5kKSxcblx0XHRcdHBvc2l0aW9uOiBPdmVydmlld1J1bGVyTGFuZS5MZWZ0XG5cdFx0fTtcblx0fVxuXG5cdGNvbnN0IHJlbmRlcklubGluZSA9IGJyZWFrcG9pbnQuY29sdW1uICYmIChoYXNPdGhlckJyZWFrcG9pbnRzT25MaW5lIHx8IGJyZWFrcG9pbnQuY29sdW1uID4gbW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihicmVha3BvaW50LmxpbmVOdW1iZXIpKTtcblx0cmV0dXJuIHtcblx0XHRkZXNjcmlwdGlvbjogJ2JyZWFrcG9pbnQtZGVjb3JhdGlvbicsXG5cdFx0Z2x5cGhNYXJnaW46IHsgcG9zaXRpb246IEdseXBoTWFyZ2luTGFuZS5SaWdodCB9LFxuXHRcdGdseXBoTWFyZ2luQ2xhc3NOYW1lOiBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbiksXG5cdFx0Z2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2UsXG5cdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0YmVmb3JlOiByZW5kZXJJbmxpbmUgPyB7XG5cdFx0XHRjb250ZW50OiBub0JyZWFrV2hpdGVzcGFjZSxcblx0XHRcdGlubGluZUNsYXNzTmFtZTogYGRlYnVnLWJyZWFrcG9pbnQtcGxhY2Vob2xkZXJgLFxuXHRcdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IHRydWVcblx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdG92ZXJ2aWV3UnVsZXI6IG92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uLFxuXHRcdHpJbmRleDogOTk5OVxuXHR9O1xufVxuXG50eXBlIEJyZWFrcG9pbnRzRm9yTGluZSA9IHsgbGluZU51bWJlcjogbnVtYmVyOyBwb3NpdGlvbnM6IElQb3NpdGlvbltdIH07XG5cbmFzeW5jIGZ1bmN0aW9uIHJlcXVlc3RCcmVha3BvaW50Q2FuZGlkYXRlTG9jYXRpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBsaW5lTnVtYmVyczogbnVtYmVyW10sIHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPEJyZWFrcG9pbnRzRm9yTGluZVtdPiB7XG5cdGlmICghc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNCcmVha3BvaW50TG9jYXRpb25zUmVxdWVzdCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHJldHVybiBhd2FpdCBQcm9taXNlLmFsbChkaXN0aW5jdChsaW5lTnVtYmVycywgbCA9PiBsKS5tYXAoYXN5bmMgbGluZU51bWJlciA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB7IGxpbmVOdW1iZXIsIHBvc2l0aW9uczogYXdhaXQgc2Vzc2lvbi5icmVha3BvaW50c0xvY2F0aW9ucyhtb2RlbC51cmksIGxpbmVOdW1iZXIpIH07XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4geyBsaW5lTnVtYmVyLCBwb3NpdGlvbnM6IFtdIH07XG5cdFx0fVxuXHR9KSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNhbmRpZGF0ZURlY29yYXRpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBicmVha3BvaW50RGVjb3JhdGlvbnM6IElCcmVha3BvaW50RGVjb3JhdGlvbltdLCBsaW5lQnJlYWtwb2ludHM6IEJyZWFrcG9pbnRzRm9yTGluZVtdKTogeyByYW5nZTogUmFuZ2U7IG9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zOyBicmVha3BvaW50OiBJQnJlYWtwb2ludCB8IHVuZGVmaW5lZCB9W10ge1xuXHRjb25zdCByZXN1bHQ6IHsgcmFuZ2U6IFJhbmdlOyBvcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9uczsgYnJlYWtwb2ludDogSUJyZWFrcG9pbnQgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdGZvciAoY29uc3QgeyBwb3NpdGlvbnMsIGxpbmVOdW1iZXIgfSBvZiBsaW5lQnJlYWtwb2ludHMpIHtcblx0XHRpZiAocG9zaXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gRG8gbm90IHJlbmRlciBjYW5kaWRhdGVzIGlmIHRoZXJlIGlzIG9ubHkgb25lLCBzaW5jZSBpdCBpcyBhbHJlYWR5IGNvdmVyZWQgYnkgdGhlIGxpbmUgYnJlYWtwb2ludFxuXHRcdGNvbnN0IGZpcnN0Q29sdW1uID0gbW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRjb25zdCBsYXN0Q29sdW1uID0gbW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdHBvc2l0aW9ucy5mb3JFYWNoKHAgPT4ge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UocC5saW5lTnVtYmVyLCBwLmNvbHVtbiwgcC5saW5lTnVtYmVyLCBwLmNvbHVtbiArIDEpO1xuXHRcdFx0aWYgKChwLmNvbHVtbiA8PSBmaXJzdENvbHVtbiAmJiAhYnJlYWtwb2ludERlY29yYXRpb25zLnNvbWUoYnAgPT4gYnAucmFuZ2Uuc3RhcnRDb2x1bW4gPiBmaXJzdENvbHVtbiAmJiBicC5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHAubGluZU51bWJlcikpIHx8IHAuY29sdW1uID4gbGFzdENvbHVtbikge1xuXHRcdFx0XHQvLyBEbyBub3QgcmVuZGVyIGNhbmRpZGF0ZXMgb24gdGhlIHN0YXJ0IG9mIHRoZSBsaW5lIGlmIHRoZXJlJ3Mgbm8gb3RoZXIgYnJlYWtwb2ludCBvbiB0aGUgbGluZS5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBicmVha3BvaW50QXRQb3NpdGlvbiA9IGJyZWFrcG9pbnREZWNvcmF0aW9ucy5maW5kKGJwZCA9PiBicGQucmFuZ2UuZXF1YWxzUmFuZ2UocmFuZ2UpKTtcblx0XHRcdGlmIChicmVha3BvaW50QXRQb3NpdGlvbiAmJiBicmVha3BvaW50QXRQb3NpdGlvbi5pbmxpbmVXaWRnZXQpIHtcblx0XHRcdFx0Ly8gU3BhY2UgYWxyZWFkeSBvY2N1cGllZCwgZG8gbm90IHJlbmRlciBjYW5kaWRhdGUuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2JyZWFrcG9pbnQtcGxhY2Vob2xkZXItZGVjb3JhdGlvbicsXG5cdFx0XHRcdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0XHRcdFx0YmVmb3JlOiBicmVha3BvaW50QXRQb3NpdGlvbiA/IHVuZGVmaW5lZCA6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IG5vQnJlYWtXaGl0ZXNwYWNlLFxuXHRcdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiBgZGVidWctYnJlYWtwb2ludC1wbGFjZWhvbGRlcmAsXG5cdFx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWVBZmZlY3RzTGV0dGVyU3BhY2luZzogdHJ1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJyZWFrcG9pbnQ6IGJyZWFrcG9pbnRBdFBvc2l0aW9uID8gYnJlYWtwb2ludEF0UG9zaXRpb24uYnJlYWtwb2ludCA6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgY2xhc3MgQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElCcmVha3BvaW50RWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIGJyZWFrcG9pbnRIaW50RGVjb3JhdGlvbjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgYnJlYWtwb2ludFdpZGdldDogQnJlYWtwb2ludFdpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBicmVha3BvaW50V2lkZ2V0VmlzaWJsZSE6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHRvRGlzcG9zZTogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRwcml2YXRlIGlnbm9yZURlY29yYXRpb25zQ2hhbmdlZEV2ZW50ID0gZmFsc2U7XG5cdHByaXZhdGUgaWdub3JlQnJlYWtwb2ludHNDaGFuZ2VFdmVudCA9IGZhbHNlO1xuXHRwcml2YXRlIGJyZWFrcG9pbnREZWNvcmF0aW9uczogSUJyZWFrcG9pbnREZWNvcmF0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSBjYW5kaWRhdGVEZWNvcmF0aW9uczogeyBkZWNvcmF0aW9uSWQ6IHN0cmluZzsgaW5saW5lV2lkZ2V0OiBJbmxpbmVCcmVha3BvaW50V2lkZ2V0IH1bXSA9IFtdO1xuXHRwcml2YXRlIHNldERlY29yYXRpb25zU2NoZWR1bGVyITogUnVuT25jZVNjaGVkdWxlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuYnJlYWtwb2ludFdpZGdldFZpc2libGUgPSBDT05URVhUX0JSRUFLUE9JTlRfV0lER0VUX1ZJU0lCTEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNldERlY29yYXRpb25zU2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5zZXREZWNvcmF0aW9ucygpLCAzMCk7XG5cdFx0dGhpcy5zZXREZWNvcmF0aW9uc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGNvbnRleHQgbWVudSBhY3Rpb25zIGF0IHRoZSBsaW5lIG51bWJlciBpZiBicmVha3BvaW50cyBjYW4gYmVcblx0ICogc2V0LiBUaGlzIGlzIHVzZWQgYnkgdGhlIHtAbGluayBUZXN0aW5nRGVjb3JhdGlvbnN9IHRvIGFsbG93IGJyZWFrcG9pbnRcblx0ICogc2V0dGluZyBvbiBsaW5lcyB3aGVyZSBicmVha3BvaW50IFwicnVuXCIgYWN0aW9ucyBhcmUgcHJlc2VudC5cblx0ICovXG5cdHB1YmxpYyBnZXRDb250ZXh0TWVudUFjdGlvbnNBdFBvc2l0aW9uKGxpbmVOdW1iZXI6IG51bWJlciwgbW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHRpZiAoIXRoaXMuZGVidWdTZXJ2aWNlLmdldEFkYXB0ZXJNYW5hZ2VyKCkuaGFzRW5hYmxlZERlYnVnZ2VycygpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmRlYnVnU2VydmljZS5jYW5TZXRCcmVha3BvaW50c0luKG1vZGVsKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJyZWFrcG9pbnRzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cyh7IGxpbmVOdW1iZXIsIHVyaTogbW9kZWwudXJpIH0pO1xuXHRcdHJldHVybiB0aGlzLmdldENvbnRleHRNZW51QWN0aW9ucyhicmVha3BvaW50cywgbW9kZWwudXJpLCBsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvci5vbk1vdXNlRG93bihhc3luYyAoZTogSUVkaXRvck1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmICghdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0QWRhcHRlck1hbmFnZXIoKS5oYXNFbmFibGVkRGVidWdnZXJzKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoIWUudGFyZ2V0LnBvc2l0aW9uXG5cdFx0XHRcdHx8ICFtb2RlbFxuXHRcdFx0XHR8fCBlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0dMWVBIX01BUkdJTlxuXHRcdFx0XHR8fCBlLnRhcmdldC5kZXRhaWwuaXNBZnRlckxpbmVzXG5cdFx0XHRcdHx8ICF0aGlzLm1hcmdpbkZyZWVGcm9tTm9uRGVidWdEZWNvcmF0aW9ucyhlLnRhcmdldC5wb3NpdGlvbi5saW5lTnVtYmVyKVxuXHRcdFx0XHQvLyBkb24ndCByZXR1cm4gZWFybHkgaWYgdGhlcmUncyBhIGJyZWFrcG9pbnRcblx0XHRcdFx0JiYgIWUudGFyZ2V0LmVsZW1lbnQ/LmNsYXNzTmFtZS5pbmNsdWRlcygnYnJlYWtwb2ludCcpXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2FuU2V0QnJlYWtwb2ludHMgPSB0aGlzLmRlYnVnU2VydmljZS5jYW5TZXRCcmVha3BvaW50c0luKG1vZGVsKTtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBlLnRhcmdldC5wb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgdXJpID0gbW9kZWwudXJpO1xuXG5cdFx0XHRpZiAoZS5ldmVudC5yaWdodEJ1dHRvbiB8fCAoZW52LmlzTWFjaW50b3NoICYmIGUuZXZlbnQubGVmdEJ1dHRvbiAmJiBlLmV2ZW50LmN0cmxLZXkpKSB7XG5cdFx0XHRcdC8vIGhhbmRsZWQgYnkgZWRpdG9yIGd1dHRlciBjb250ZXh0IG1lbnVcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgYnJlYWtwb2ludHMgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRzKHsgdXJpLCBsaW5lTnVtYmVyIH0pO1xuXG5cdFx0XHRcdGlmIChicmVha3BvaW50cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBpc1NoaWZ0UHJlc3NlZCA9IGUuZXZlbnQuc2hpZnRLZXk7XG5cdFx0XHRcdFx0Y29uc3QgaXNBbHRQcmVzc2VkID0gZS5ldmVudC5hbHRLZXk7XG5cdFx0XHRcdFx0Y29uc3QgZW5hYmxlZCA9IGJyZWFrcG9pbnRzLnNvbWUoYnAgPT4gYnAuZW5hYmxlZCk7XG5cblx0XHRcdFx0XHRpZiAoaXNBbHRQcmVzc2VkKSB7XG5cdFx0XHRcdFx0XHQvLyBBbHQrY2xpY2sgb24gZXhpc3RpbmcgYnJlYWtwb2ludCBvcGVucyB0aGUgYnJlYWtwb2ludCB3aWRnZXQgZm9yIGVkaXRpbmdcblx0XHRcdFx0XHRcdHRoaXMuc2hvd0JyZWFrcG9pbnRXaWRnZXQoYnJlYWtwb2ludHNbMF0ubGluZU51bWJlciwgYnJlYWtwb2ludHNbMF0uY29sdW1uKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzU2hpZnRQcmVzc2VkKSB7XG5cdFx0XHRcdFx0XHRicmVha3BvaW50cy5mb3JFYWNoKGJwID0+IHRoaXMuZGVidWdTZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKCFlbmFibGVkLCBicCkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoIWVudi5pc0xpbnV4ICYmIGJyZWFrcG9pbnRzLnNvbWUoYnAgPT4gISFicC5jb25kaXRpb24gfHwgISFicC5sb2dNZXNzYWdlIHx8ICEhYnAuaGl0Q29uZGl0aW9uIHx8ICEhYnAudHJpZ2dlcmVkQnkpKSB7XG5cdFx0XHRcdFx0XHQvLyBTaG93IHRoZSBkaWFsb2cgaWYgdGhlcmUgaXMgYSBwb3RlbnRpYWwgY29uZGl0aW9uIHRvIGJlIGFjY2lkZW50bHkgbG9zdC5cblx0XHRcdFx0XHRcdC8vIERvIG5vdCBzaG93IGRpYWxvZyBvbiBsaW51eCBkdWUgdG8gZWxlY3Ryb24gaXNzdWUgZnJlZXppbmcgdGhlIG1vdXNlICM1MDAyNlxuXHRcdFx0XHRcdFx0Y29uc3QgbG9nUG9pbnQgPSBicmVha3BvaW50cy5ldmVyeShicCA9PiAhIWJwLmxvZ01lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0Y29uc3QgYnJlYWtwb2ludFR5cGUgPSBsb2dQb2ludCA/IG5scy5sb2NhbGl6ZSgnbG9nUG9pbnQnLCBcIkxvZ3BvaW50XCIpIDogbmxzLmxvY2FsaXplKCdicmVha3BvaW50JywgXCJCcmVha3BvaW50XCIpO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBkaXNhYmxlZEJyZWFrcG9pbnREaWFsb2dNZXNzYWdlID0gbmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHQnYnJlYWtwb2ludEhhc0NvbmRpdGlvbkRpc2FibGVkJyxcblx0XHRcdFx0XHRcdFx0XCJUaGlzIHswfSBoYXMgYSB7MX0gdGhhdCB3aWxsIGdldCBsb3N0IG9uIHJlbW92ZS4gQ29uc2lkZXIgZW5hYmxpbmcgdGhlIHswfSBpbnN0ZWFkLlwiLFxuXHRcdFx0XHRcdFx0XHRicmVha3BvaW50VHlwZS50b0xvd2VyQ2FzZSgpLFxuXHRcdFx0XHRcdFx0XHRsb2dQb2ludCA/IG5scy5sb2NhbGl6ZSgnbWVzc2FnZScsIFwibWVzc2FnZVwiKSA6IG5scy5sb2NhbGl6ZSgnY29uZGl0aW9uJywgXCJjb25kaXRpb25cIilcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRjb25zdCBlbmFibGVkQnJlYWtwb2ludERpYWxvZ01lc3NhZ2UgPSBubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdCdicmVha3BvaW50SGFzQ29uZGl0aW9uRW5hYmxlZCcsXG5cdFx0XHRcdFx0XHRcdFwiVGhpcyB7MH0gaGFzIGEgezF9IHRoYXQgd2lsbCBnZXQgbG9zdCBvbiByZW1vdmUuIENvbnNpZGVyIGRpc2FibGluZyB0aGUgezB9IGluc3RlYWQuXCIsXG5cdFx0XHRcdFx0XHRcdGJyZWFrcG9pbnRUeXBlLnRvTG93ZXJDYXNlKCksXG5cdFx0XHRcdFx0XHRcdGxvZ1BvaW50ID8gbmxzLmxvY2FsaXplKCdtZXNzYWdlJywgXCJtZXNzYWdlXCIpIDogbmxzLmxvY2FsaXplKCdjb25kaXRpb24nLCBcImNvbmRpdGlvblwiKVxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IHNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGVuYWJsZWQgPyBlbmFibGVkQnJlYWtwb2ludERpYWxvZ01lc3NhZ2UgOiBkaXNhYmxlZEJyZWFrcG9pbnREaWFsb2dNZXNzYWdlLFxuXHRcdFx0XHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ3JlbW92ZUxvZ1BvaW50JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmVtb3ZlIHswfVwiLCBicmVha3BvaW50VHlwZSksXG5cdFx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IGJyZWFrcG9pbnRzLmZvckVhY2goYnAgPT4gdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnAuZ2V0SWQoKSkpXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdkaXNhYmxlTG9nUG9pbnQnLCBcInswfSB7MX1cIiwgZW5hYmxlZCA/IG5scy5sb2NhbGl6ZSh7IGtleTogJ2Rpc2FibGUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZEaXNhYmxlXCIpIDogbmxzLmxvY2FsaXplKHsga2V5OiAnZW5hYmxlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRW5hYmxlXCIpLCBicmVha3BvaW50VHlwZSksXG5cdFx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IGJyZWFrcG9pbnRzLmZvckVhY2goYnAgPT4gdGhpcy5kZWJ1Z1NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoIWVuYWJsZWQsIGJwKSlcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdGNhbmNlbEJ1dHRvbjogdHJ1ZVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlmICghZW5hYmxlZCkge1xuXHRcdFx0XHRcdFx0XHRicmVha3BvaW50cy5mb3JFYWNoKGJwID0+IHRoaXMuZGVidWdTZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKCFlbmFibGVkLCBicCkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YnJlYWtwb2ludHMuZm9yRWFjaChicCA9PiB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhicC5nZXRJZCgpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGNhblNldEJyZWFrcG9pbnRzKSB7XG5cdFx0XHRcdFx0aWYgKGUuZXZlbnQuYWx0S2V5KSB7XG5cdFx0XHRcdFx0XHQvLyBBbHQrY2xpY2sgb24gZW1wdHkgZ3V0dGVyIG9wZW5zIHRoZSBicmVha3BvaW50IHdpZGdldCBmb3IgYWRkaW5nIGEgY29uZGl0aW9uYWwgYnJlYWtwb2ludFxuXHRcdFx0XHRcdFx0dGhpcy5zaG93QnJlYWtwb2ludFdpZGdldChsaW5lTnVtYmVyLCB1bmRlZmluZWQsIEJyZWFrcG9pbnRXaWRnZXRDb250ZXh0LkNPTkRJVElPTik7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChlLmV2ZW50Lm1pZGRsZUJ1dHRvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5ndXR0ZXJNaWRkbGVDbGlja0FjdGlvbjtcblx0XHRcdFx0XHRcdGlmIChhY3Rpb24gIT09ICdub25lJykge1xuXHRcdFx0XHRcdFx0XHRsZXQgY29udGV4dDogQnJlYWtwb2ludFdpZGdldENvbnRleHQ7XG5cdFx0XHRcdFx0XHRcdHN3aXRjaCAoYWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2FzZSAnbG9ncG9pbnQnOlxuXHRcdFx0XHRcdFx0XHRcdFx0Y29udGV4dCA9IEJyZWFrcG9pbnRXaWRnZXRDb250ZXh0LkxPR19NRVNTQUdFO1xuXHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0Y2FzZSAnY29uZGl0aW9uYWxCcmVha3BvaW50Jzpcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnRleHQgPSBCcmVha3BvaW50V2lkZ2V0Q29udGV4dC5DT05ESVRJT047XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRjYXNlICd0cmlnZ2VyZWRCcmVha3BvaW50Jzpcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnRleHQgPSBCcmVha3BvaW50V2lkZ2V0Q29udGV4dC5UUklHR0VSX1BPSU5UO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2hvd0JyZWFrcG9pbnRXaWRnZXQobGluZU51bWJlciwgdW5kZWZpbmVkLCBjb250ZXh0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuYWRkQnJlYWtwb2ludHModXJpLCBbeyBsaW5lTnVtYmVyIH1dKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIShCcm93c2VyRmVhdHVyZXMucG9pbnRlckV2ZW50cyAmJiBpc1NhZmFyaSkpIHtcblx0XHRcdC8qKlxuXHRcdFx0ICogV2UgZGlzYWJsZSB0aGUgaG92ZXIgZmVhdHVyZSBmb3IgU2FmYXJpIG9uIGlPUyBhc1xuXHRcdFx0ICogMS4gQnJvd3NlciBob3ZlciBldmVudHMgYXJlIGhhbmRsZWQgc3BlY2lhbGx5IGJ5IHRoZSBzeXN0ZW0gKGl0IHRyZWF0cyBmaXJzdCBjbGljayBhcyBob3ZlciBpZiB0aGVyZSBpcyBgOmhvdmVyYCBjc3MgcmVnaXN0ZXJlZCkuIEJlbG93IGhvdmVyIGJlaGF2aW9yIHdpbGwgY29uZnVzZSB1c2VycyB3aXRoIGluY29uc2lzdGVudCBleHBlaXJlbmNlLlxuXHRcdFx0ICogMi4gV2hlbiB1c2VycyBjbGljayBvbiBsaW5lIG51bWJlcnMsIHRoZSBicmVha3BvaW50IGhpbnQgZGlzcGxheXMgaW1tZWRpYXRlbHksIGhvd2V2ZXIgaXQgZG9lc24ndCBjcmVhdGUgdGhlIGJyZWFrcG9pbnQgdW5sZXNzIHVzZXJzIGNsaWNrIG9uIHRoZSBsZWZ0IGd1dHRlci4gT24gYSB0b3VjaCBzY3JlZW4sIGl0J3MgaGFyZCB0byBjbGljayBvbiB0aGF0IHNtYWxsIGFyZWEuXG5cdFx0XHQgKi9cblx0XHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25Nb3VzZU1vdmUoKGU6IElFZGl0b3JNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0QWRhcHRlck1hbmFnZXIoKS5oYXNFbmFibGVkRGVidWdnZXJzKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgc2hvd0JyZWFrcG9pbnRIaW50QXRMaW5lTnVtYmVyID0gLTE7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdFx0aWYgKG1vZGVsICYmIGUudGFyZ2V0LnBvc2l0aW9uICYmIChlLnRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0dMWVBIX01BUkdJTiB8fCBlLnRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfTlVNQkVSUykgJiYgdGhpcy5kZWJ1Z1NlcnZpY2UuY2FuU2V0QnJlYWtwb2ludHNJbihtb2RlbCkgJiZcblx0XHRcdFx0XHR0aGlzLm1hcmdpbkZyZWVGcm9tTm9uRGVidWdEZWNvcmF0aW9ucyhlLnRhcmdldC5wb3NpdGlvbi5saW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBlLnRhcmdldC5kZXRhaWw7XG5cdFx0XHRcdFx0aWYgKCFkYXRhLmlzQWZ0ZXJMaW5lcykge1xuXHRcdFx0XHRcdFx0c2hvd0JyZWFrcG9pbnRIaW50QXRMaW5lTnVtYmVyID0gZS50YXJnZXQucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5lbnN1cmVCcmVha3BvaW50SGludERlY29yYXRpb24oc2hvd0JyZWFrcG9pbnRIaW50QXRMaW5lTnVtYmVyKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25Nb3VzZUxlYXZlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5lbnN1cmVCcmVha3BvaW50SGludERlY29yYXRpb24oLTEpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuY2xvc2VCcmVha3BvaW50V2lkZ2V0KCk7XG5cdFx0XHRhd2FpdCB0aGlzLnNldERlY29yYXRpb25zKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5pZ25vcmVCcmVha3BvaW50c0NoYW5nZUV2ZW50ICYmICF0aGlzLnNldERlY29yYXRpb25zU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5zZXREZWNvcmF0aW9uc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZGVidWdTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdGUoKCkgPT4ge1xuXHRcdFx0Ly8gV2UgbmVlZCB0byB1cGRhdGUgYnJlYWtwb2ludCBkZWNvcmF0aW9ucyB3aGVuIHN0YXRlIGNoYW5nZXMgc2luY2UgdGhlIHRvcCBzdGFjayBmcmFtZSBhbmQgYnJlYWtwb2ludCBkZWNvcmF0aW9uIG1pZ2h0IGNoYW5nZVxuXHRcdFx0aWYgKCF0aGlzLnNldERlY29yYXRpb25zU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5zZXREZWNvcmF0aW9uc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxEZWNvcmF0aW9ucygoKSA9PiB0aGlzLm9uTW9kZWxEZWNvcmF0aW9uc0NoYW5nZWQoKSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oYXN5bmMgKGUpID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkZWJ1Zy5zaG93QnJlYWtwb2ludHNJbk92ZXJ2aWV3UnVsZXInKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkZWJ1Zy5zaG93SW5saW5lQnJlYWtwb2ludENhbmRpZGF0ZXMnKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNldERlY29yYXRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250ZXh0TWVudUFjdGlvbnMoYnJlYWtwb2ludHM6IFJlYWRvbmx5QXJyYXk8SUJyZWFrcG9pbnQ+LCB1cmk6IFVSSSwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW4/OiBudW1iZXIpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdFx0aWYgKGJyZWFrcG9pbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgYnJlYWtwb2ludFR5cGUgPSBicmVha3BvaW50c1swXS5sb2dNZXNzYWdlID8gbmxzLmxvY2FsaXplKCdsb2dQb2ludCcsIFwiTG9ncG9pbnRcIikgOiBubHMubG9jYWxpemUoJ2JyZWFrcG9pbnQnLCBcIkJyZWFrcG9pbnRcIik7XG5cdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ2RlYnVnLnJlbW92ZUJyZWFrcG9pbnQnLCBsYWJlbDogbmxzLmxvY2FsaXplKCdyZW1vdmVCcmVha3BvaW50JywgXCJSZW1vdmUgezB9XCIsIGJyZWFrcG9pbnRUeXBlKSwgZW5hYmxlZDogdHJ1ZSwgcnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnJlYWtwb2ludHNbMF0uZ2V0SWQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLmFjdGlvbi5lZGl0QnJlYWtwb2ludEFjdGlvbicsXG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2VkaXRCcmVha3BvaW50JywgXCJFZGl0IHswfS4uLlwiLCBicmVha3BvaW50VHlwZSksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2hvd0JyZWFrcG9pbnRXaWRnZXQoYnJlYWtwb2ludHNbMF0ubGluZU51bWJlciwgYnJlYWtwb2ludHNbMF0uY29sdW1uKSlcblx0XHRcdH0pKTsgYWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24udG9nZ2xlQnJlYWtwb2ludGAsXG5cdFx0XHRcdGxhYmVsOiBicmVha3BvaW50c1swXS5lbmFibGVkID8gbmxzLmxvY2FsaXplKCdkaXNhYmxlQnJlYWtwb2ludCcsIFwiRGlzYWJsZSB7MH1cIiwgYnJlYWtwb2ludFR5cGUpIDogbmxzLmxvY2FsaXplKCdlbmFibGVCcmVha3BvaW50JywgXCJFbmFibGUgezB9XCIsIGJyZWFrcG9pbnRUeXBlKSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyghYnJlYWtwb2ludHNbMF0uZW5hYmxlZCwgYnJlYWtwb2ludHNbMF0pXG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIGlmIChicmVha3BvaW50cy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBzb3J0ZWQgPSBicmVha3BvaW50cy5zbGljZSgpLnNvcnQoKGZpcnN0LCBzZWNvbmQpID0+IChmaXJzdC5jb2x1bW4gJiYgc2Vjb25kLmNvbHVtbikgPyBmaXJzdC5jb2x1bW4gLSBzZWNvbmQuY29sdW1uIDogMSk7XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24oJ2RlYnVnLnJlbW92ZUJyZWFrcG9pbnRzJywgbmxzLmxvY2FsaXplKCdyZW1vdmVCcmVha3BvaW50cycsIFwiUmVtb3ZlIEJyZWFrcG9pbnRzXCIpLCBzb3J0ZWQubWFwKGJwID0+IHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdyZW1vdmVJbmxpbmVCcmVha3BvaW50Jyxcblx0XHRcdFx0bGFiZWw6IGJwLmNvbHVtbiA/IG5scy5sb2NhbGl6ZSgncmVtb3ZlSW5saW5lQnJlYWtwb2ludE9uQ29sdW1uJywgXCJSZW1vdmUgSW5saW5lIEJyZWFrcG9pbnQgb24gQ29sdW1uIHswfVwiLCBicC5jb2x1bW4pIDogbmxzLmxvY2FsaXplKCdyZW1vdmVMaW5lQnJlYWtwb2ludCcsIFwiUmVtb3ZlIExpbmUgQnJlYWtwb2ludFwiKSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhicC5nZXRJZCgpKVxuXHRcdFx0fSkpKSk7IGFjdGlvbnMucHVzaChuZXcgU3VibWVudUFjdGlvbignZGVidWcuZWRpdEJyZWFrcG9pbnRzJywgbmxzLmxvY2FsaXplKCdlZGl0QnJlYWtwb2ludHMnLCBcIkVkaXQgQnJlYWtwb2ludHNcIiksIHNvcnRlZC5tYXAoYnAgPT5cblx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdGlkOiAnZWRpdEJyZWFrcG9pbnQnLFxuXHRcdFx0XHRcdGxhYmVsOiBicC5jb2x1bW4gPyBubHMubG9jYWxpemUoJ2VkaXRJbmxpbmVCcmVha3BvaW50T25Db2x1bW4nLCBcIkVkaXQgSW5saW5lIEJyZWFrcG9pbnQgb24gQ29sdW1uIHswfVwiLCBicC5jb2x1bW4pIDogbmxzLmxvY2FsaXplKCdlZGl0TGluZUJyZWFrcG9pbnQnLCBcIkVkaXQgTGluZSBCcmVha3BvaW50XCIpLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBQcm9taXNlLnJlc29sdmUodGhpcy5zaG93QnJlYWtwb2ludFdpZGdldChicC5saW5lTnVtYmVyLCBicC5jb2x1bW4pKVxuXHRcdFx0XHR9KVxuXHRcdFx0KSkpOyBhY3Rpb25zLnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24oJ2RlYnVnLmVuYWJsZURpc2FibGVCcmVha3BvaW50cycsIG5scy5sb2NhbGl6ZSgnZW5hYmxlRGlzYWJsZUJyZWFrcG9pbnRzJywgXCJFbmFibGUvRGlzYWJsZSBCcmVha3BvaW50c1wiKSwgc29ydGVkLm1hcChicCA9PiB0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiBicC5lbmFibGVkID8gJ2Rpc2FibGVDb2x1bW5CcmVha3BvaW50JyA6ICdlbmFibGVDb2x1bW5CcmVha3BvaW50Jyxcblx0XHRcdFx0bGFiZWw6IGJwLmVuYWJsZWQgPyAoYnAuY29sdW1uID8gbmxzLmxvY2FsaXplKCdkaXNhYmxlSW5saW5lQ29sdW1uQnJlYWtwb2ludCcsIFwiRGlzYWJsZSBJbmxpbmUgQnJlYWtwb2ludCBvbiBDb2x1bW4gezB9XCIsIGJwLmNvbHVtbikgOiBubHMubG9jYWxpemUoJ2Rpc2FibGVCcmVha3BvaW50T25MaW5lJywgXCJEaXNhYmxlIExpbmUgQnJlYWtwb2ludFwiKSlcblx0XHRcdFx0XHQ6IChicC5jb2x1bW4gPyBubHMubG9jYWxpemUoJ2VuYWJsZUJyZWFrcG9pbnRzJywgXCJFbmFibGUgSW5saW5lIEJyZWFrcG9pbnQgb24gQ29sdW1uIHswfVwiLCBicC5jb2x1bW4pIDogbmxzLmxvY2FsaXplKCdlbmFibGVCcmVha3BvaW50T25MaW5lJywgXCJFbmFibGUgTGluZSBCcmVha3BvaW50XCIpKSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyghYnAuZW5hYmxlZCwgYnApXG5cdFx0XHR9KSkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdhZGRCcmVha3BvaW50Jyxcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnYWRkQnJlYWtwb2ludCcsIFwiQWRkIEJyZWFrcG9pbnRcIiksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5kZWJ1Z1NlcnZpY2UuYWRkQnJlYWtwb2ludHModXJpLCBbeyBsaW5lTnVtYmVyLCBjb2x1bW4gfV0pXG5cdFx0XHR9KSk7XG5cdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ2FkZENvbmRpdGlvbmFsQnJlYWtwb2ludCcsXG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2FkZENvbmRpdGlvbmFsQnJlYWtwb2ludCcsIFwiQWRkIENvbmRpdGlvbmFsIEJyZWFrcG9pbnQuLi5cIiksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2hvd0JyZWFrcG9pbnRXaWRnZXQobGluZU51bWJlciwgY29sdW1uLCBCcmVha3BvaW50V2lkZ2V0Q29udGV4dC5DT05ESVRJT04pKVxuXHRcdFx0fSkpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdhZGRMb2dQb2ludCcsXG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2FkZExvZ1BvaW50JywgXCJBZGQgTG9ncG9pbnQuLi5cIiksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2hvd0JyZWFrcG9pbnRXaWRnZXQobGluZU51bWJlciwgY29sdW1uLCBCcmVha3BvaW50V2lkZ2V0Q29udGV4dC5MT0dfTUVTU0FHRSkpXG5cdFx0XHR9KSk7XG5cdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ2FkZFRyaWdnZXJlZEJyZWFrcG9pbnQnLFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdhZGRUcmlnZ2VyZWRCcmVha3BvaW50JywgXCJBZGQgVHJpZ2dlcmVkIEJyZWFrcG9pbnQuLi5cIiksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2hvd0JyZWFrcG9pbnRXaWRnZXQobGluZU51bWJlciwgY29sdW1uLCBCcmVha3BvaW50V2lkZ2V0Q29udGV4dC5UUklHR0VSX1BPSU5UKSlcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhdGUgPT09IFN0YXRlLlN0b3BwZWQpIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdydW5Ub0xpbmUnLFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdydW5Ub0xpbmUnLCBcIlJ1biB0byBMaW5lXCIpLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuZGVidWdTZXJ2aWNlLnJ1blRvKHVyaSwgbGluZU51bWJlcikuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpXG5cdFx0XHR9KSk7XG5cdFx0fSByZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgbWFyZ2luRnJlZUZyb21Ob25EZWJ1Z0RlY29yYXRpb25zKGxpbmU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5lZGl0b3IuZ2V0TGluZURlY29yYXRpb25zKGxpbmUpO1xuXHRcdGlmIChkZWNvcmF0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCB7IG9wdGlvbnMgfSBvZiBkZWNvcmF0aW9ucykge1xuXHRcdFx0XHRjb25zdCBjbHogPSBvcHRpb25zLmdseXBoTWFyZ2luQ2xhc3NOYW1lO1xuXHRcdFx0XHRpZiAoIWNseikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGhhc1NvbWVBY3Rpb25hYmxlQ29kaWNvbiA9ICEoY2x6LmluY2x1ZGVzKCdjb2RpY29uLScpIHx8IGNsei5zdGFydHNXaXRoKCdjb3ZlcmFnZS1kZWNvLScpKSB8fCBjbHouaW5jbHVkZXMoJ2NvZGljb24tdGVzdGluZy0nKSB8fCBjbHouaW5jbHVkZXMoJ2NvZGljb24tbWVyZ2UtJykgfHwgY2x6LmluY2x1ZGVzKCdjb2RpY29uLWFycm93LScpIHx8IGNsei5pbmNsdWRlcygnY29kaWNvbi1sb2FkaW5nJykgfHwgY2x6LmluY2x1ZGVzKCdjb2RpY29uLWZvbGQnKSB8fCBjbHouaW5jbHVkZXMoJ2NvZGljb24tZ3V0dGVyLWxpZ2h0YnVsYicpIHx8IGNsei5pbmNsdWRlcygnY29kaWNvbi1saWdodGJ1bGItc3BhcmtsZScpO1xuXHRcdFx0XHRpZiAoaGFzU29tZUFjdGlvbmFibGVDb2RpY29uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZUJyZWFrcG9pbnRIaW50RGVjb3JhdGlvbihzaG93QnJlYWtwb2ludEhpbnRBdExpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0aWYgKHRoaXMuYnJlYWtwb2ludEhpbnREZWNvcmF0aW9uKSB7XG5cdFx0XHRcdGFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24odGhpcy5icmVha3BvaW50SGludERlY29yYXRpb24pO1xuXHRcdFx0XHR0aGlzLmJyZWFrcG9pbnRIaW50RGVjb3JhdGlvbiA9IG51bGw7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2hvd0JyZWFrcG9pbnRIaW50QXRMaW5lTnVtYmVyICE9PSAtMSkge1xuXHRcdFx0XHR0aGlzLmJyZWFrcG9pbnRIaW50RGVjb3JhdGlvbiA9IGFjY2Vzc29yLmFkZERlY29yYXRpb24oe1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc2hvd0JyZWFrcG9pbnRIaW50QXRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHNob3dCcmVha3BvaW50SGludEF0TGluZU51bWJlcixcblx0XHRcdFx0XHRlbmRDb2x1bW46IDFcblx0XHRcdFx0fSwgYnJlYWtwb2ludEhlbHBlckRlY29yYXRpb25cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0RGVjb3JhdGlvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2V0Q2FuZGlkYXRlRGVjb3JhdGlvbnMgPSAoY2hhbmdlQWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IsIGRlc2lyZWRDYW5kaWRhdGVQb3NpdGlvbnM6IEJyZWFrcG9pbnRzRm9yTGluZVtdKSA9PiB7XG5cdFx0XHRjb25zdCBkZXNpcmVkQ2FuZGlkYXRlRGVjb3JhdGlvbnMgPSBjcmVhdGVDYW5kaWRhdGVEZWNvcmF0aW9ucyhtb2RlbCwgdGhpcy5icmVha3BvaW50RGVjb3JhdGlvbnMsIGRlc2lyZWRDYW5kaWRhdGVQb3NpdGlvbnMpO1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlRGVjb3JhdGlvbklkcyA9IGNoYW5nZUFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnModGhpcy5jYW5kaWRhdGVEZWNvcmF0aW9ucy5tYXAoYyA9PiBjLmRlY29yYXRpb25JZCksIGRlc2lyZWRDYW5kaWRhdGVEZWNvcmF0aW9ucyk7XG5cdFx0XHR0aGlzLmNhbmRpZGF0ZURlY29yYXRpb25zLmZvckVhY2goY2FuZGlkYXRlID0+IHtcblx0XHRcdFx0Y2FuZGlkYXRlLmlubGluZVdpZGdldC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuY2FuZGlkYXRlRGVjb3JhdGlvbnMgPSBjYW5kaWRhdGVEZWNvcmF0aW9uSWRzLm1hcCgoZGVjb3JhdGlvbklkLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBkZXNpcmVkQ2FuZGlkYXRlRGVjb3JhdGlvbnNbaW5kZXhdO1xuXHRcdFx0XHQvLyBDYW5kaWRhdGUgZGVjb3JhdGlvbiBoYXMgYSBicmVha3BvaW50IGF0dGFjaGVkIHdoZW4gYSBicmVha3BvaW50IGlzIGFscmVhZHkgYXQgdGhhdCBsb2NhdGlvbiBhbmQgd2UgZGlkIG5vdCB5ZXQgc2V0IGEgZGVjb3JhdGlvbiB0aGVyZVxuXHRcdFx0XHQvLyBJbiBwcmFjdGljZSB0aGlzIGhhcHBlbnMgZm9yIHRoZSBmaXJzdCBicmVha3BvaW50IHRoYXQgd2FzIHNldCBvbiBhIGxpbmVcblx0XHRcdFx0Ly8gV2UgY291bGQgaGF2ZSBhbHNvIHJlbmRlcmVkIHRoaXMgZmlyc3QgZGVjb3JhdGlvbiBhcyBwYXJ0IG9mIGRlc2lyZWRCcmVha3BvaW50RGVjb3JhdGlvbnMgaG93ZXZlciBhdCB0aGF0IG1vbWVudCB3ZSBoYXZlIG5vIGxvY2F0aW9uIGluZm9ybWF0aW9uXG5cdFx0XHRcdGNvbnN0IGljb24gPSBjYW5kaWRhdGUuYnJlYWtwb2ludCA/IGdldEJyZWFrcG9pbnRNZXNzYWdlQW5kSWNvbih0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpLCBjYW5kaWRhdGUuYnJlYWtwb2ludCwgdGhpcy5sYWJlbFNlcnZpY2UsIHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkpLmljb24gOiBpY29ucy5icmVha3BvaW50LmRpc2FibGVkO1xuXHRcdFx0XHRjb25zdCBjb250ZXh0TWVudUFjdGlvbnMgPSAoKSA9PiB0aGlzLmdldENvbnRleHRNZW51QWN0aW9ucyhjYW5kaWRhdGUuYnJlYWtwb2ludCA/IFtjYW5kaWRhdGUuYnJlYWtwb2ludF0gOiBbXSwgYWN0aXZlQ29kZUVkaXRvci5nZXRNb2RlbCgpLnVyaSwgY2FuZGlkYXRlLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgY2FuZGlkYXRlLnJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRcdFx0Y29uc3QgaW5saW5lV2lkZ2V0ID0gbmV3IElubGluZUJyZWFrcG9pbnRXaWRnZXQoYWN0aXZlQ29kZUVkaXRvciwgZGVjb3JhdGlvbklkLCBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbiksIGNhbmRpZGF0ZS5icmVha3BvaW50LCB0aGlzLmRlYnVnU2VydmljZSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIGNvbnRleHRNZW51QWN0aW9ucyk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRkZWNvcmF0aW9uSWQsXG5cdFx0XHRcdFx0aW5saW5lV2lkZ2V0XG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aXZlQ29kZUVkaXRvciA9IHRoaXMuZWRpdG9yO1xuXHRcdGNvbnN0IG1vZGVsID0gYWN0aXZlQ29kZUVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGJyZWFrcG9pbnRzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cyh7IHVyaTogbW9kZWwudXJpIH0pO1xuXHRcdGNvbnN0IGRlYnVnU2V0dGluZ3MgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpO1xuXHRcdGNvbnN0IGRlc2lyZWRCcmVha3BvaW50RGVjb3JhdGlvbnMgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGNyZWF0ZUJyZWFrcG9pbnREZWNvcmF0aW9ucyhhY2Nlc3NvciwgbW9kZWwsIGJyZWFrcG9pbnRzLCB0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSwgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpLCBkZWJ1Z1NldHRpbmdzLnNob3dCcmVha3BvaW50c0luT3ZlcnZpZXdSdWxlcikpO1xuXG5cdFx0Ly8gdHJ5IHRvIHNldCBicmVha3BvaW50IGxvY2F0aW9uIGNhbmRpZGF0ZXMgaW4gdGhlIHNhbWUgY2hhbmdlRGVjb3JhdGlvbnMoKVxuXHRcdC8vIGNhbGwgdG8gYXZvaWQgZmxpY2tlcmluZywgaWYgdGhlIERBIHJlc3BvbmRzIHJlYXNvbmFibHkgcXVpY2tseS5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0Y29uc3QgZGVzaXJlZENhbmRpZGF0ZVBvc2l0aW9ucyA9IGRlYnVnU2V0dGluZ3Muc2hvd0lubGluZUJyZWFrcG9pbnRDYW5kaWRhdGVzICYmIHNlc3Npb24gPyByZXF1ZXN0QnJlYWtwb2ludENhbmRpZGF0ZUxvY2F0aW9ucyh0aGlzLmVkaXRvci5nZXRNb2RlbCgpLCBkZXNpcmVkQnJlYWtwb2ludERlY29yYXRpb25zLm1hcChicCA9PiBicC5yYW5nZS5zdGFydExpbmVOdW1iZXIpLCBzZXNzaW9uKSA6IFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0Y29uc3QgZGVzaXJlZENhbmRpZGF0ZVBvc2l0aW9uc1JhY2VkID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtkZXNpcmVkQ2FuZGlkYXRlUG9zaXRpb25zLCB0aW1lb3V0KDUwMCkudGhlbigoKSA9PiB1bmRlZmluZWQpXSk7XG5cdFx0aWYgKGRlc2lyZWRDYW5kaWRhdGVQb3NpdGlvbnNSYWNlZCA9PT0gdW5kZWZpbmVkKSB7IC8vIHRoZSB0aW1lb3V0IHJlc29sdmVkIGZpcnN0XG5cdFx0XHRkZXNpcmVkQ2FuZGlkYXRlUG9zaXRpb25zLnRoZW4odiA9PiBhY3RpdmVDb2RlRWRpdG9yLmNoYW5nZURlY29yYXRpb25zKGQgPT4gc2V0Q2FuZGlkYXRlRGVjb3JhdGlvbnMoZCwgdikpKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5pZ25vcmVEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCA9IHRydWU7XG5cblx0XHRcdC8vIFNldCBicmVha3BvaW50IGRlY29yYXRpb25zXG5cdFx0XHRhY3RpdmVDb2RlRWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uSWRzID0gY2hhbmdlQWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyh0aGlzLmJyZWFrcG9pbnREZWNvcmF0aW9ucy5tYXAoYnBkID0+IGJwZC5kZWNvcmF0aW9uSWQpLCBkZXNpcmVkQnJlYWtwb2ludERlY29yYXRpb25zKTtcblx0XHRcdFx0dGhpcy5icmVha3BvaW50RGVjb3JhdGlvbnMuZm9yRWFjaChicGQgPT4ge1xuXHRcdFx0XHRcdGJwZC5pbmxpbmVXaWRnZXQ/LmRpc3Bvc2UoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuYnJlYWtwb2ludERlY29yYXRpb25zID0gZGVjb3JhdGlvbklkcy5tYXAoKGRlY29yYXRpb25JZCwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRsZXQgaW5saW5lV2lkZ2V0OiBJbmxpbmVCcmVha3BvaW50V2lkZ2V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGJyZWFrcG9pbnQgPSBicmVha3BvaW50c1tpbmRleF07XG5cdFx0XHRcdFx0aWYgKGRlc2lyZWRCcmVha3BvaW50RGVjb3JhdGlvbnNbaW5kZXhdLm9wdGlvbnMuYmVmb3JlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb250ZXh0TWVudUFjdGlvbnMgPSAoKSA9PiB0aGlzLmdldENvbnRleHRNZW51QWN0aW9ucyhbYnJlYWtwb2ludF0sIGFjdGl2ZUNvZGVFZGl0b3IuZ2V0TW9kZWwoKS51cmksIGJyZWFrcG9pbnQubGluZU51bWJlciwgYnJlYWtwb2ludC5jb2x1bW4pO1xuXHRcdFx0XHRcdFx0aW5saW5lV2lkZ2V0ID0gbmV3IElubGluZUJyZWFrcG9pbnRXaWRnZXQoYWN0aXZlQ29kZUVkaXRvciwgZGVjb3JhdGlvbklkLCBkZXNpcmVkQnJlYWtwb2ludERlY29yYXRpb25zW2luZGV4XS5vcHRpb25zLmdseXBoTWFyZ2luQ2xhc3NOYW1lLCBicmVha3BvaW50LCB0aGlzLmRlYnVnU2VydmljZSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIGNvbnRleHRNZW51QWN0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGRlY29yYXRpb25JZCxcblx0XHRcdFx0XHRcdGJyZWFrcG9pbnQsXG5cdFx0XHRcdFx0XHRyYW5nZTogZGVzaXJlZEJyZWFrcG9pbnREZWNvcmF0aW9uc1tpbmRleF0ucmFuZ2UsXG5cdFx0XHRcdFx0XHRpbmxpbmVXaWRnZXRcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoZGVzaXJlZENhbmRpZGF0ZVBvc2l0aW9uc1JhY2VkKSB7XG5cdFx0XHRcdFx0c2V0Q2FuZGlkYXRlRGVjb3JhdGlvbnMoY2hhbmdlQWNjZXNzb3IsIGRlc2lyZWRDYW5kaWRhdGVQb3NpdGlvbnNSYWNlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmlnbm9yZURlY29yYXRpb25zQ2hhbmdlZEV2ZW50ID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBkIG9mIHRoaXMuYnJlYWtwb2ludERlY29yYXRpb25zKSB7XG5cdFx0XHRpZiAoZC5pbmxpbmVXaWRnZXQpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldChkLmlubGluZVdpZGdldCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbk1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmJyZWFrcG9pbnREZWNvcmF0aW9ucy5sZW5ndGggPT09IDAgfHwgdGhpcy5pZ25vcmVEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCB8fCAhdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0Ly8gSSBoYXZlIG5vIGRlY29yYXRpb25zXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBzb21ldGhpbmdDaGFuZ2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdHRoaXMuYnJlYWtwb2ludERlY29yYXRpb25zLmZvckVhY2goYnJlYWtwb2ludERlY29yYXRpb24gPT4ge1xuXHRcdFx0aWYgKHNvbWV0aGluZ0NoYW5nZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmV3QnJlYWtwb2ludFJhbmdlID0gbW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGJyZWFrcG9pbnREZWNvcmF0aW9uLmRlY29yYXRpb25JZCk7XG5cdFx0XHRpZiAobmV3QnJlYWtwb2ludFJhbmdlICYmICghYnJlYWtwb2ludERlY29yYXRpb24ucmFuZ2UuZXF1YWxzUmFuZ2UobmV3QnJlYWtwb2ludFJhbmdlKSkpIHtcblx0XHRcdFx0c29tZXRoaW5nQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdGJyZWFrcG9pbnREZWNvcmF0aW9uLnJhbmdlID0gbmV3QnJlYWtwb2ludFJhbmdlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmICghc29tZXRoaW5nQ2hhbmdlZCkge1xuXHRcdFx0Ly8gbm90aGluZyB0byBkbywgbXkgZGVjb3JhdGlvbnMgZGlkIG5vdCBjaGFuZ2UuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IG5ldyBNYXA8c3RyaW5nLCBJQnJlYWtwb2ludFVwZGF0ZURhdGE+KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuYnJlYWtwb2ludERlY29yYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBicmVha3BvaW50RGVjb3JhdGlvbiA9IHRoaXMuYnJlYWtwb2ludERlY29yYXRpb25zW2ldO1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvblJhbmdlID0gbW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGJyZWFrcG9pbnREZWNvcmF0aW9uLmRlY29yYXRpb25JZCk7XG5cdFx0XHQvLyBjaGVjayBpZiB0aGUgbGluZSBnb3QgZGVsZXRlZC5cblx0XHRcdGlmIChkZWNvcmF0aW9uUmFuZ2UpIHtcblx0XHRcdFx0Ly8gc2luY2Ugd2Uga25vdyBpdCBpcyBjb2xsYXBzZWQsIGl0IGNhbm5vdCBncm93IHRvIG11bHRpcGxlIGxpbmVzXG5cdFx0XHRcdGlmIChicmVha3BvaW50RGVjb3JhdGlvbi5icmVha3BvaW50KSB7XG5cdFx0XHRcdFx0ZGF0YS5zZXQoYnJlYWtwb2ludERlY29yYXRpb24uYnJlYWtwb2ludC5nZXRJZCgpLCB7XG5cdFx0XHRcdFx0XHRsaW5lTnVtYmVyOiBkZWNvcmF0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0Y29sdW1uOiBicmVha3BvaW50RGVjb3JhdGlvbi5icmVha3BvaW50LmNvbHVtbiA/IGRlY29yYXRpb25SYW5nZS5zdGFydENvbHVtbiA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmlnbm9yZUJyZWFrcG9pbnRzQ2hhbmdlRXZlbnQgPSB0cnVlO1xuXHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2UudXBkYXRlQnJlYWtwb2ludHMobW9kZWwudXJpLCBkYXRhLCB0cnVlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5pZ25vcmVCcmVha3BvaW50c0NoYW5nZUV2ZW50ID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0Ly8gYnJlYWtwb2ludCB3aWRnZXRcblx0c2hvd0JyZWFrcG9pbnRXaWRnZXQobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZCwgY29udGV4dD86IEJyZWFrcG9pbnRXaWRnZXRDb250ZXh0KTogdm9pZCB7XG5cdFx0dGhpcy5icmVha3BvaW50V2lkZ2V0Py5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLmJyZWFrcG9pbnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJyZWFrcG9pbnRXaWRnZXQsIHRoaXMuZWRpdG9yLCBsaW5lTnVtYmVyLCBjb2x1bW4sIGNvbnRleHQpO1xuXHRcdHRoaXMuYnJlYWtwb2ludFdpZGdldC5zaG93KHsgbGluZU51bWJlciwgY29sdW1uOiAxIH0pO1xuXHRcdHRoaXMuYnJlYWtwb2ludFdpZGdldFZpc2libGUuc2V0KHRydWUpO1xuXHR9XG5cblx0Y2xvc2VCcmVha3BvaW50V2lkZ2V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmJyZWFrcG9pbnRXaWRnZXQpIHtcblx0XHRcdHRoaXMuYnJlYWtwb2ludFdpZGdldC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmJyZWFrcG9pbnRXaWRnZXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmJyZWFrcG9pbnRXaWRnZXRWaXNpYmxlLnJlc2V0KCk7XG5cdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5icmVha3BvaW50V2lkZ2V0Py5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zZXREZWNvcmF0aW9uc1NjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5lZGl0b3IucmVtb3ZlRGVjb3JhdGlvbnModGhpcy5icmVha3BvaW50RGVjb3JhdGlvbnMubWFwKGJwZCA9PiBicGQuZGVjb3JhdGlvbklkKSk7XG5cdFx0ZGlzcG9zZSh0aGlzLnRvRGlzcG9zZSk7XG5cdH1cbn1cblxuR3V0dGVyQWN0aW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyR3V0dGVyQWN0aW9uc0dlbmVyYXRvcigoeyBsaW5lTnVtYmVyLCBlZGl0b3IsIGFjY2Vzc29yIH0sIHJlc3VsdCkgPT4ge1xuXHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdGlmICghbW9kZWwgfHwgIWRlYnVnU2VydmljZS5nZXRBZGFwdGVyTWFuYWdlcigpLmhhc0VuYWJsZWREZWJ1Z2dlcnMoKSB8fCAhZGVidWdTZXJ2aWNlLmNhblNldEJyZWFrcG9pbnRzSW4obW9kZWwpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgYnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbiA9IGVkaXRvci5nZXRDb250cmlidXRpb248SUJyZWFrcG9pbnRFZGl0b3JDb250cmlidXRpb24+KEJSRUFLUE9JTlRfRURJVE9SX0NPTlRSSUJVVElPTl9JRCk7XG5cdGlmICghYnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbikge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGFjdGlvbnMgPSBicmVha3BvaW50RWRpdG9yQ29udHJpYnV0aW9uLmdldENvbnRleHRNZW51QWN0aW9uc0F0UG9zaXRpb24obGluZU51bWJlciwgbW9kZWwpO1xuXG5cdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRyZXN1bHQucHVzaChhY3Rpb24sICcyX2RlYnVnJyk7XG5cdH1cbn0pO1xuXG5jbGFzcyBJbmxpbmVCcmVha3BvaW50V2lkZ2V0IGltcGxlbWVudHMgSUNvbnRlbnRXaWRnZXQsIElEaXNwb3NhYmxlIHtcblxuXHQvLyBlZGl0b3IuSUNvbnRlbnRXaWRnZXQuYWxsb3dFZGl0b3JPdmVyZmxvd1xuXHRhbGxvd0VkaXRvck92ZXJmbG93ID0gZmFsc2U7XG5cdHN1cHByZXNzTW91c2VEb3duID0gdHJ1ZTtcblxuXHRwcml2YXRlIGRvbU5vZGUhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByYW5nZTogUmFuZ2UgfCBudWxsO1xuXHRwcml2YXRlIHRvRGlzcG9zZTogSURpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRpb25JZDogc3RyaW5nLFxuXHRcdGNzc0NsYXNzOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYnJlYWtwb2ludDogSUJyZWFrcG9pbnQgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBnZXRDb250ZXh0TWVudUFjdGlvbnM6ICgpID0+IElBY3Rpb25bXVxuXHQpIHtcblx0XHR0aGlzLnJhbmdlID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKS5nZXREZWNvcmF0aW9uUmFuZ2UoZGVjb3JhdGlvbklkKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxEZWNvcmF0aW9ucygoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRjb25zdCByYW5nZSA9IG1vZGVsLmdldERlY29yYXRpb25SYW5nZSh0aGlzLmRlY29yYXRpb25JZCk7XG5cdFx0XHRpZiAodGhpcy5yYW5nZSAmJiAhdGhpcy5yYW5nZS5lcXVhbHNSYW5nZShyYW5nZSkpIHtcblx0XHRcdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdFx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNpemUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5jcmVhdGUoY3NzQ2xhc3MpO1xuXG5cdFx0dGhpcy5lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGUoY3NzQ2xhc3M6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUgPSAkKCcuaW5saW5lLWJyZWFrcG9pbnQtd2lkZ2V0Jyk7XG5cdFx0aWYgKGNzc0NsYXNzKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCguLi5jc3NDbGFzcy5zcGxpdCgnICcpKTtcblx0XHR9XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5DTElDSywgYXN5bmMgZSA9PiB7XG5cdFx0XHRzd2l0Y2ggKHRoaXMuYnJlYWtwb2ludD8uZW5hYmxlZCkge1xuXHRcdFx0XHRjYXNlIHVuZGVmaW5lZDpcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRlYnVnU2VydmljZS5hZGRCcmVha3BvaW50cyh0aGlzLmVkaXRvci5nZXRNb2RlbCgpLnVyaSwgW3sgbGluZU51bWJlcjogdGhpcy5yYW5nZSEuc3RhcnRMaW5lTnVtYmVyLCBjb2x1bW46IHRoaXMucmFuZ2UhLnN0YXJ0Q29sdW1uIH1dKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSB0cnVlOlxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZGVidWdTZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKHRoaXMuYnJlYWtwb2ludC5nZXRJZCgpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBmYWxzZTpcblx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyh0cnVlLCB0aGlzLmJyZWFrcG9pbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZG9tLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLCBlKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmdldENvbnRleHRNZW51QWN0aW9ucygpO1xuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IHRoaXMuYnJlYWtwb2ludCxcblx0XHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NlSWZEaXNwb3NhYmxlKGFjdGlvbnMpXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZVNpemUoKTtcblxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGMgPT4ge1xuXHRcdFx0aWYgKGMuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udFNpemUpIHx8IGMuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGluZUhlaWdodCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTaXplKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTaXplKCkge1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLnJhbmdlID8gdGhpcy5lZGl0b3IuZ2V0TGluZUhlaWdodEZvclBvc2l0aW9uKHRoaXMucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSA6IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmhlaWdodCA9IGAke2xpbmVIZWlnaHR9cHhgO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS53aWR0aCA9IGAke01hdGguY2VpbCgwLjggKiBsaW5lSGVpZ2h0KX1weGA7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLm1hcmdpbkxlZnQgPSBgNHB4YDtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGdlbmVyYXRlVXVpZCgpO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMucmFuZ2UpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHQvLyBXb3JrYXJvdW5kOiBzaW5jZSB0aGUgY29udGVudCB3aWRnZXQgY2FuIG5vdCBiZSBwbGFjZWQgYmVmb3JlIHRoZSBmaXJzdCBjb2x1bW4gd2UgbmVlZCB0byBmb3JjZSB0aGUgbGVmdCBwb3NpdGlvblxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdsaW5lLXN0YXJ0JywgdGhpcy5yYW5nZS5zdGFydENvbHVtbiA9PT0gMSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHsgbGluZU51bWJlcjogdGhpcy5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogdGhpcy5yYW5nZS5zdGFydENvbHVtbiAtIDEgfSxcblx0XHRcdHByZWZlcmVuY2U6IFtDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkVYQUNUXVxuXHRcdH07XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yLnJlbW92ZUNvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0ZGlzcG9zZSh0aGlzLnRvRGlzcG9zZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3Qgc2NvcGUgPSAnLm1vbmFjby1lZGl0b3IgLmdseXBoLW1hcmdpbi13aWRnZXRzLCAubW9uYWNvLXdvcmtiZW5jaCAuZGVidWctYnJlYWtwb2ludHMsIC5tb25hY28td29ya2JlbmNoIC5kaXNhc3NlbWJseS12aWV3LCAubW9uYWNvLWVkaXRvciAuY29udGVudFdpZGdldHMnO1xuXHRjb25zdCBkZWJ1Z0ljb25CcmVha3BvaW50Q29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25CcmVha3BvaW50Rm9yZWdyb3VuZCk7XG5cdGlmIChkZWJ1Z0ljb25CcmVha3BvaW50Q29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgJHtzY29wZX0ge1xuXHRcdFx0JHtpY29ucy5hbGxCcmVha3BvaW50cy5tYXAoYiA9PiBgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihiLnJlZ3VsYXIpfWApLmpvaW4oJyxcXG5cdFx0Jyl9LFxuXHRcdFx0JHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z0JyZWFrcG9pbnRVbnN1cHBvcnRlZCl9LFxuXHRcdFx0JHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5kZWJ1Z0JyZWFrcG9pbnRIaW50KX06bm90KFtjbGFzcyo9J2NvZGljb24tZGVidWctYnJlYWtwb2ludCddKTpub3QoW2NsYXNzKj0nY29kaWNvbi1kZWJ1Zy1zdGFja2ZyYW1lJ10pLFxuXHRcdFx0JHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5icmVha3BvaW50LnJlZ3VsYXIpfSR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGFja2ZyYW1lRm9jdXNlZCl9OjphZnRlcixcblx0XHRcdCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuYnJlYWtwb2ludC5yZWd1bGFyKX0ke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnU3RhY2tmcmFtZSl9OjphZnRlciB7XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnSWNvbkJyZWFrcG9pbnRDb2xvcn0gIWltcG9ydGFudDtcblx0XHRcdH1cblx0XHR9YCk7XG5cblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgJHtzY29wZX0ge1xuXHRcdFx0JHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy5icmVha3BvaW50LnBlbmRpbmcpfSB7XG5cdFx0XHRcdGNvbG9yOiAke2RlYnVnSWNvbkJyZWFrcG9pbnRDb2xvcn0gIWltcG9ydGFudDtcblx0XHRcdFx0Zm9udC1zaXplOiAxMnB4ICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0fWApO1xuXHR9XG5cblx0Y29uc3QgZGVidWdJY29uQnJlYWtwb2ludERpc2FibGVkQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25CcmVha3BvaW50RGlzYWJsZWRGb3JlZ3JvdW5kKTtcblx0aWYgKGRlYnVnSWNvbkJyZWFrcG9pbnREaXNhYmxlZENvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYCR7c2NvcGV9IHtcblx0XHRcdCR7aWNvbnMuYWxsQnJlYWtwb2ludHMubWFwKGIgPT4gVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoYi5kaXNhYmxlZCkpLmpvaW4oJyxcXG5cdFx0Jyl9IHtcblx0XHRcdFx0Y29sb3I6ICR7ZGVidWdJY29uQnJlYWtwb2ludERpc2FibGVkQ29sb3J9O1xuXHRcdFx0fVxuXHRcdH1gKTtcblx0fVxuXG5cdGNvbnN0IGRlYnVnSWNvbkJyZWFrcG9pbnRVbnZlcmlmaWVkQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihkZWJ1Z0ljb25CcmVha3BvaW50VW52ZXJpZmllZEZvcmVncm91bmQpO1xuXHRpZiAoZGVidWdJY29uQnJlYWtwb2ludFVudmVyaWZpZWRDb2xvcikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAke3Njb3BlfSB7XG5cdFx0XHQke2ljb25zLmFsbEJyZWFrcG9pbnRzLm1hcChiID0+IFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGIudW52ZXJpZmllZCkpLmpvaW4oJyxcXG5cdFx0Jyl9IHtcblx0XHRcdFx0Y29sb3I6ICR7ZGVidWdJY29uQnJlYWtwb2ludFVudmVyaWZpZWRDb2xvcn07XG5cdFx0XHR9XG5cdFx0fWApO1xuXHR9XG5cblx0Y29uc3QgZGVidWdJY29uQnJlYWtwb2ludEN1cnJlbnRTdGFja2ZyYW1lRm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdJY29uQnJlYWtwb2ludEN1cnJlbnRTdGFja2ZyYW1lRm9yZWdyb3VuZCk7XG5cdGlmIChkZWJ1Z0ljb25CcmVha3BvaW50Q3VycmVudFN0YWNrZnJhbWVGb3JlZ3JvdW5kQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0Lm1vbmFjby1lZGl0b3IgLmRlYnVnLXRvcC1zdGFjay1mcmFtZS1jb2x1bW4ge1xuXHRcdFx0Y29sb3I6ICR7ZGVidWdJY29uQnJlYWtwb2ludEN1cnJlbnRTdGFja2ZyYW1lRm9yZWdyb3VuZENvbG9yfSAhaW1wb3J0YW50O1xuXHRcdH1cblx0XHQke3Njb3BlfSB7XG5cdFx0XHQke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb25zLmRlYnVnU3RhY2tmcmFtZSl9IHtcblx0XHRcdFx0Y29sb3I6ICR7ZGVidWdJY29uQnJlYWtwb2ludEN1cnJlbnRTdGFja2ZyYW1lRm9yZWdyb3VuZENvbG9yfSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRgKTtcblx0fVxuXG5cdGNvbnN0IGRlYnVnSWNvbkJyZWFrcG9pbnRTdGFja2ZyYW1lRm9jdXNlZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZGVidWdJY29uQnJlYWtwb2ludFN0YWNrZnJhbWVGb3JlZ3JvdW5kKTtcblx0aWYgKGRlYnVnSWNvbkJyZWFrcG9pbnRTdGFja2ZyYW1lRm9jdXNlZENvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYCR7c2NvcGV9IHtcblx0XHRcdCR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbnMuZGVidWdTdGFja2ZyYW1lRm9jdXNlZCl9IHtcblx0XHRcdFx0Y29sb3I6ICR7ZGVidWdJY29uQnJlYWtwb2ludFN0YWNrZnJhbWVGb2N1c2VkQ29sb3J9ICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0fWApO1xuXHR9XG59KTtcblxuZXhwb3J0IGNvbnN0IGRlYnVnSWNvbkJyZWFrcG9pbnRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLmJyZWFrcG9pbnRGb3JlZ3JvdW5kJywgJyNFNTE0MDAnLCBubHMubG9jYWxpemUoJ2RlYnVnSWNvbi5icmVha3BvaW50Rm9yZWdyb3VuZCcsICdJY29uIGNvbG9yIGZvciBicmVha3BvaW50cy4nKSk7XG5jb25zdCBkZWJ1Z0ljb25CcmVha3BvaW50RGlzYWJsZWRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLmJyZWFrcG9pbnREaXNhYmxlZEZvcmVncm91bmQnLCAnIzg0ODQ4NCcsIG5scy5sb2NhbGl6ZSgnZGVidWdJY29uLmJyZWFrcG9pbnREaXNhYmxlZEZvcmVncm91bmQnLCAnSWNvbiBjb2xvciBmb3IgZGlzYWJsZWQgYnJlYWtwb2ludHMuJykpO1xuY29uc3QgZGVidWdJY29uQnJlYWtwb2ludFVudmVyaWZpZWRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZGVidWdJY29uLmJyZWFrcG9pbnRVbnZlcmlmaWVkRm9yZWdyb3VuZCcsICcjODQ4NDg0JywgbmxzLmxvY2FsaXplKCdkZWJ1Z0ljb24uYnJlYWtwb2ludFVudmVyaWZpZWRGb3JlZ3JvdW5kJywgJ0ljb24gY29sb3IgZm9yIHVudmVyaWZpZWQgYnJlYWtwb2ludHMuJykpO1xuY29uc3QgZGVidWdJY29uQnJlYWtwb2ludEN1cnJlbnRTdGFja2ZyYW1lRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5icmVha3BvaW50Q3VycmVudFN0YWNrZnJhbWVGb3JlZ3JvdW5kJywgeyBkYXJrOiAnI0ZGQ0MwMCcsIGxpZ2h0OiAnI0JFODcwMCcsIGhjRGFyazogJyNGRkNDMDAnLCBoY0xpZ2h0OiAnI0JFODcwMCcgfSwgbmxzLmxvY2FsaXplKCdkZWJ1Z0ljb24uYnJlYWtwb2ludEN1cnJlbnRTdGFja2ZyYW1lRm9yZWdyb3VuZCcsICdJY29uIGNvbG9yIGZvciB0aGUgY3VycmVudCBicmVha3BvaW50IHN0YWNrIGZyYW1lLicpKTtcbmNvbnN0IGRlYnVnSWNvbkJyZWFrcG9pbnRTdGFja2ZyYW1lRm9yZWdyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2RlYnVnSWNvbi5icmVha3BvaW50U3RhY2tmcmFtZUZvcmVncm91bmQnLCAnIzg5RDE4NScsIG5scy5sb2NhbGl6ZSgnZGVidWdJY29uLmJyZWFrcG9pbnRTdGFja2ZyYW1lRm9yZWdyb3VuZCcsICdJY29uIGNvbG9yIGZvciBhbGwgYnJlYWtwb2ludCBzdGFjayBmcmFtZXMuJykpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBa0IsV0FBVyxlQUFlLGdCQUFnQjtBQUM1RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQixlQUFlO0FBQzFDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFNBQVMsMkJBQXdDO0FBQzFELFlBQVksU0FBUztBQUNyQixPQUFPLGNBQWM7QUFDckIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQ0FBNEgsdUJBQXVCO0FBQzVKLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlCQUE2SCxtQkFBbUIsOEJBQThCO0FBQ3ZMLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw0QkFBNEIsd0JBQXdCO0FBQzdELFNBQVMsNkJBQTZCO0FBQ3RD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QUFRLEdBQUcsS0FBSztBQUFBLEtBQ3ZCLE1BQU0sZUFBZSxJQUFJLE9BQUssVUFBVSxjQUFjLEVBQUUsUUFBUSxDQUFDLEVBQUUsS0FBSyxPQUFPLENBQUM7QUFBQSxhQUN4RSxnQ0FBZ0M7QUFBQTtBQUFBLElBRXpDO0FBQUEsRUFDSDtBQUVBLFFBQU0scUNBQXFDLE1BQU0sU0FBUyx1Q0FBdUM7QUFDakcsTUFBSSxvQ0FBb0M7QUFDdkMsY0FBVSxRQUFRLEdBQUcsS0FBSztBQUFBLEtBQ3ZCLE1BQU0sZUFBZSxJQUFJLE9BQUssVUFBVSxjQUFjLEVBQUUsVUFBVSxDQUFDLEVBQUUsS0FBSyxPQUFPLENBQUM7QUFBQSxhQUMxRSxrQ0FBa0M7QUFBQTtBQUFBLElBRTNDO0FBQUEsRUFDSDtBQUVBLFFBQU0sc0RBQXNELE1BQU0sU0FBUyw4Q0FBOEM7QUFDekgsTUFBSSxxREFBcUQ7QUFDeEQsY0FBVSxRQUFRO0FBQUE7QUFBQSxZQUVSLG1EQUFtRDtBQUFBO0FBQUEsSUFFM0QsS0FBSztBQUFBLEtBQ0osVUFBVSxjQUFjLE1BQU0sZUFBZSxDQUFDO0FBQUEsYUFDdEMsbURBQW1EO0FBQUE7QUFBQTtBQUFBLEdBRzdEO0FBQUEsRUFDRjtBQUVBLFFBQU0sNENBQTRDLE1BQU0sU0FBUyx1Q0FBdUM7QUFDeEcsTUFBSSwyQ0FBMkM7QUFDOUMsY0FBVSxRQUFRLEdBQUcsS0FBSztBQUFBLEtBQ3ZCLFVBQVUsY0FBYyxNQUFNLHNCQUFzQixDQUFDO0FBQUEsYUFDN0MseUNBQXlDO0FBQUE7QUFBQSxJQUVsRDtBQUFBLEVBQ0g7QUFDRCxDQUFDO0FBRU0sTUFBTSxnQ0FBZ0MsY0FBYyxrQ0FBa0MsV0FBVyxJQUFJLFNBQVMsa0NBQWtDLDZCQUE2QixDQUFDO0FBQ3JMLE1BQU0sd0NBQXdDLGNBQWMsMENBQTBDLFdBQVcsSUFBSSxTQUFTLDBDQUEwQyxzQ0FBc0MsQ0FBQztBQUMvTSxNQUFNLDBDQUEwQyxjQUFjLDRDQUE0QyxXQUFXLElBQUksU0FBUyw0Q0FBNEMsd0NBQXdDLENBQUM7QUFDdk4sTUFBTSxpREFBaUQsY0FBYyxtREFBbUQsRUFBRSxNQUFNLFdBQVcsT0FBTyxXQUFXLFFBQVEsV0FBVyxTQUFTLFVBQVUsR0FBRyxJQUFJLFNBQVMsbURBQW1ELG9EQUFvRCxDQUFDO0FBQzNULE1BQU0sMENBQTBDLGNBQWMsNENBQTRDLFdBQVcsSUFBSSxTQUFTLDRDQUE0Qyw2Q0FBNkMsQ0FBQzsiLAogICJuYW1lcyI6IFsibWVzc2FnZSIsICJkZXNpcmVkQ2FuZGlkYXRlUG9zaXRpb25zIl0KfQo=
