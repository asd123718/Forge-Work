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
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { ActionBar, ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action } from "../../../../base/common/actions.js";
import { mapFindFirst } from "../../../../base/common/arraysFind.js";
import { assert, assertNever } from "../../../../base/common/assert.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent, observableValue } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isUriComponents, URI } from "../../../../base/common/uri.js";
import { isCodeEditor, MouseTargetType, OverlayWidgetPositionPreference } from "../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { InjectedTextCursorStops, MinimapPosition } from "../../../../editor/common/model.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { bindContextKey, observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { ActiveEditorContext } from "../../../common/contextkeys.js";
import { TEXT_FILE_EDITOR_ID } from "../../files/common/files.js";
import { getTestingConfiguration, TestingConfigKeys } from "../common/configuration.js";
import { TestCommandId, Testing } from "../common/constants.js";
import { FileCoverage } from "../common/testCoverage.js";
import { ITestCoverageService } from "../common/testCoverageService.js";
import { TestId } from "../common/testId.js";
import { ITestService } from "../common/testService.js";
import { DetailType } from "../common/testTypes.js";
import { TestingContextKeys } from "../common/testingContextKeys.js";
import * as coverUtils from "./codeCoverageDisplayUtils.js";
import { testingCoverageMissingBranch, testingCoverageReport, testingFilterIcon, testingRerunIcon } from "./icons.js";
import { ManagedTestCoverageBars } from "./testCoverageBars.js";
import { testingCoveredMinimapBackground, testingUncoveredMinimapBackground } from "./theme.js";
const CLASS_HIT = "coverage-deco-hit";
const CLASS_MISS = "coverage-deco-miss";
const TOGGLE_INLINE_COMMAND_TEXT = localize("testing.toggleInlineCoverage", "Toggle Inline");
const TOGGLE_INLINE_COMMAND_ID = "testing.toggleInlineCoverage";
const BRANCH_MISS_INDICATOR_CHARS = 4;
const GO_TO_NEXT_MISSED_LINE_TITLE = localize2("testing.goToNextMissedLine", "Go to Next Uncovered Line");
const GO_TO_PREVIOUS_MISSED_LINE_TITLE = localize2("testing.goToPreviousMissedLine", "Go to Previous Uncovered Line");
let CodeCoverageDecorations = class extends Disposable {
  constructor(editor, instantiationService, coverage, configurationService, log, contextKeyService) {
    super();
    this.editor = editor;
    this.coverage = coverage;
    this.log = log;
    this.displayedStore = this._register(new DisposableStore());
    this.hoveredStore = this._register(new DisposableStore());
    this.decorationIds = /* @__PURE__ */ new Map();
    this.hasInlineCoverageDetails = observableValue("hasInlineCoverageDetails", false);
    this.summaryWidget = new Lazy(() => this._register(instantiationService.createInstance(CoverageToolbarWidget, this.editor)));
    const modelObs = observableFromEvent(this, editor.onDidChangeModel, () => editor.getModel());
    const configObs = observableFromEvent(this, editor.onDidChangeConfiguration, (i) => i);
    const fileCoverage = derived((reader) => {
      const report = coverage.selected.read(reader);
      if (!report) {
        return;
      }
      const model = modelObs.read(reader);
      if (!model) {
        return;
      }
      const file = report.getUri(model.uri);
      if (!file) {
        return;
      }
      report.didAddCoverage.read(reader);
      return { file, testId: coverage.filterToTest.read(reader) };
    });
    this._register(bindContextKey(
      TestingContextKeys.hasPerTestCoverage,
      contextKeyService,
      (reader) => !!fileCoverage.read(reader)?.file.perTestData?.size
    ));
    this._register(bindContextKey(
      TestingContextKeys.hasCoverageInFile,
      contextKeyService,
      (reader) => !!fileCoverage.read(reader)?.file
    ));
    this._register(bindContextKey(
      TestingContextKeys.hasInlineCoverageDetails,
      contextKeyService,
      (reader) => this.hasInlineCoverageDetails.read(reader)
    ));
    const minimapEnabled = observableConfigValue(TestingConfigKeys.CoverageMinimapEnabled, true, configurationService);
    this._register(autorun((reader) => {
      const c = fileCoverage.read(reader);
      if (c) {
        this.apply(editor.getModel(), c.file, c.testId, coverage.showInline.read(reader), minimapEnabled.read(reader));
      } else {
        this.clear();
      }
    }));
    const toolbarEnabled = observableConfigValue(TestingConfigKeys.CoverageToolbarEnabled, true, configurationService);
    this._register(autorun((reader) => {
      const c = fileCoverage.read(reader);
      if (c && toolbarEnabled.read(reader)) {
        this.summaryWidget.value.setCoverage(c.file, c.testId);
      } else {
        this.summaryWidget.rawValue?.clearCoverage();
      }
    }));
    this._register(autorun((reader) => {
      const c = fileCoverage.read(reader);
      if (c) {
        const evt = configObs.read(reader);
        if (evt?.hasChanged(EditorOption.lineHeight) !== false) {
          this.updateEditorStyles();
        }
      }
    }));
    this._register(editor.onMouseMove((e) => {
      const model = editor.getModel();
      if (e.target.type === MouseTargetType.GUTTER_LINE_NUMBERS && model) {
        this.hoverLineNumber(editor.getModel());
      } else if (coverage.showInline.get() && e.target.type === MouseTargetType.CONTENT_TEXT && model) {
        this.hoverInlineDecoration(model, e.target.position);
      } else {
        this.hoveredStore.clear();
      }
    }));
    this._register(editor.onWillChangeModel(() => {
      const model = editor.getModel();
      if (!this.details || !model) {
        return;
      }
      for (const decoration of model.getAllDecorations()) {
        const own = this.decorationIds.get(decoration.id);
        if (own) {
          own.detail.range = decoration.range;
        }
      }
    }));
  }
  updateEditorStyles() {
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    const { style } = this.editor.getContainerDomNode();
    style.setProperty("--vscode-testing-coverage-lineHeight", `${lineHeight}px`);
  }
  hoverInlineDecoration(model, position) {
    const allDecorations = model.getDecorationsInRange(Range.fromPositions(position));
    const decoration = mapFindFirst(allDecorations, ({ id }) => this.decorationIds.has(id) ? { id, deco: this.decorationIds.get(id) } : void 0);
    if (decoration === this.hoveredSubject) {
      return;
    }
    this.hoveredStore.clear();
    this.hoveredSubject = decoration;
    if (!decoration) {
      return;
    }
    model.changeDecorations((e) => {
      e.changeDecorationOptions(decoration.id, {
        ...decoration.deco.options,
        className: `${decoration.deco.options.className} coverage-deco-hovered`
      });
    });
    this.hoveredStore.add(toDisposable(() => {
      this.hoveredSubject = void 0;
      model.changeDecorations((e) => {
        e.changeDecorationOptions(decoration.id, decoration.deco.options);
      });
    }));
  }
  hoverLineNumber(model) {
    if (this.hoveredSubject === "lineNo" || !this.details || this.coverage.showInline.get()) {
      return;
    }
    this.hoveredStore.clear();
    this.hoveredSubject = "lineNo";
    model.changeDecorations((e) => {
      for (const [id, decoration] of this.decorationIds) {
        const { applyHoverOptions, options } = decoration;
        const dup = { ...options };
        applyHoverOptions(dup);
        e.changeDecorationOptions(id, dup);
      }
    });
    this.hoveredStore.add(this.editor.onMouseLeave(() => {
      this.hoveredStore.clear();
    }));
    this.hoveredStore.add(toDisposable(() => {
      this.hoveredSubject = void 0;
      model.changeDecorations((e) => {
        for (const [id, decoration] of this.decorationIds) {
          e.changeDecorationOptions(id, decoration.options);
        }
      });
    }));
  }
  /**
   * Navigate to the next missed (uncovered) line from the current cursor position.
   * @returns true if navigation occurred, false if no missed line was found
   */
  goToNextMissedLine() {
    return this.navigateToMissedLine(true);
  }
  /**
   * Navigate to the previous missed (uncovered) line from the current cursor position.
   * @returns true if navigation occurred, false if no missed line was found
   */
  goToPreviousMissedLine() {
    return this.navigateToMissedLine(false);
  }
  navigateToMissedLine(next) {
    const model = this.editor.getModel();
    const position = this.editor.getPosition();
    if (!model || !position || !this.details) {
      return false;
    }
    const currentLine = position.lineNumber;
    let closestBefore;
    let closestAfter;
    let firstMissed;
    let lastMissed;
    for (const [, { detail, options }] of this.decorationIds) {
      if (options.lineNumberClassName?.includes(CLASS_MISS)) {
        const range = detail.range;
        if (range.isEmpty()) {
          continue;
        }
        const lineNumber = range.startLineNumber;
        const missedLine = { lineNumber, range };
        if (!firstMissed || lineNumber < firstMissed.lineNumber) {
          firstMissed = missedLine;
        }
        if (!lastMissed || lineNumber > lastMissed.lineNumber) {
          lastMissed = missedLine;
        }
        if (lineNumber < currentLine) {
          if (!closestBefore || lineNumber > closestBefore.lineNumber) {
            closestBefore = missedLine;
          }
        } else if (lineNumber > currentLine) {
          if (!closestAfter || lineNumber < closestAfter.lineNumber) {
            closestAfter = missedLine;
          }
        }
      }
    }
    const targetLine = next ? closestAfter || firstMissed : closestBefore || lastMissed;
    if (targetLine) {
      this.editor.setPosition(new Position(targetLine.lineNumber, 1));
      this.editor.revealLineInCenter(targetLine.lineNumber);
      return true;
    }
    return false;
  }
  async apply(model, coverage, testId, showInlineByDefault, showMinimap) {
    const details = this.details = await this.loadDetails(coverage, testId, model);
    if (!details) {
      this.hasInlineCoverageDetails.set(false, void 0);
      return this.clear();
    }
    this.hasInlineCoverageDetails.set(details.ranges.length > 0, void 0);
    this.displayedStore.clear();
    model.changeDecorations((e) => {
      for (const detailRange of details.ranges) {
        const { metadata: { detail, description }, range, primary } = detailRange;
        if (detail.type === DetailType.Branch) {
          const hits = detail.detail.branches[detail.branch].count;
          const cls = hits ? CLASS_HIT : CLASS_MISS;
          const showMissIndicator = !hits && range.isEmpty() && detail.detail.branches.some((b) => b.count);
          const options = {
            showIfCollapsed: showMissIndicator,
            // only avoid collapsing if we want to show the miss indicator
            description: "coverage-gutter",
            lineNumberClassName: `coverage-deco-gutter ${cls}`,
            minimap: showMinimap ? {
              color: themeColorFromId(hits ? testingCoveredMinimapBackground : testingUncoveredMinimapBackground),
              position: MinimapPosition.Gutter
            } : void 0
          };
          const applyHoverOptions = (target) => {
            target.hoverMessage = description;
            if (showMissIndicator) {
              target.after = {
                content: "\xA0".repeat(BRANCH_MISS_INDICATOR_CHARS),
                // nbsp
                inlineClassName: `coverage-deco-branch-miss-indicator ${ThemeIcon.asClassName(testingCoverageMissingBranch)}`,
                inlineClassNameAffectsLetterSpacing: true,
                cursorStops: InjectedTextCursorStops.None
              };
            } else {
              target.className = `coverage-deco-inline ${cls}`;
              if (primary && typeof hits === "number") {
                target.before = countBadge(hits);
              }
            }
          };
          if (showInlineByDefault) {
            applyHoverOptions(options);
          }
          this.decorationIds.set(e.addDecoration(range, options), { options, applyHoverOptions, detail: detailRange });
        } else if (detail.type === DetailType.Statement) {
          const cls = detail.count ? CLASS_HIT : CLASS_MISS;
          const options = {
            showIfCollapsed: false,
            description: "coverage-inline",
            lineNumberClassName: `coverage-deco-gutter ${cls}`,
            minimap: showMinimap ? {
              color: themeColorFromId(detail.count ? testingCoveredMinimapBackground : testingUncoveredMinimapBackground),
              position: MinimapPosition.Gutter
            } : void 0
          };
          const applyHoverOptions = (target) => {
            target.className = `coverage-deco-inline ${cls}`;
            target.hoverMessage = description;
            if (primary && typeof detail.count === "number") {
              target.before = countBadge(detail.count);
            }
          };
          if (showInlineByDefault) {
            applyHoverOptions(options);
          }
          this.decorationIds.set(e.addDecoration(range, options), { options, applyHoverOptions, detail: detailRange });
        }
      }
    });
    this.displayedStore.add(toDisposable(() => {
      model.changeDecorations((e) => {
        for (const decoration of this.decorationIds.keys()) {
          e.removeDecoration(decoration);
        }
        this.decorationIds.clear();
      });
    }));
  }
  clear() {
    this.loadingCancellation?.cancel();
    this.loadingCancellation = void 0;
    this.displayedStore.clear();
    this.hoveredStore.clear();
    this.hasInlineCoverageDetails.set(false, void 0);
  }
  async loadDetails(coverage, testId, textModel) {
    const cts = this.loadingCancellation = new CancellationTokenSource();
    this.displayedStore.add(this.loadingCancellation);
    try {
      const details = testId ? await coverage.detailsForTest(testId, this.loadingCancellation.token) : await coverage.details(this.loadingCancellation.token);
      if (cts.token.isCancellationRequested) {
        return;
      }
      return new CoverageDetailsModel(details, textModel);
    } catch (e) {
      this.log.error("Error loading coverage details", e);
    }
    return void 0;
  }
};
CodeCoverageDecorations.ID = Testing.CoverageDecorationsContributionId;
CodeCoverageDecorations = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ITestCoverageService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IContextKeyService)
], CodeCoverageDecorations);
const countBadge = (count) => {
  if (count === 0) {
    return void 0;
  }
  return {
    content: `${count > 99 ? "99+" : count}x`,
    cursorStops: InjectedTextCursorStops.None,
    inlineClassName: `coverage-deco-inline-count`,
    inlineClassNameAffectsLetterSpacing: true
  };
};
class CoverageDetailsModel {
  constructor(details, textModel) {
    this.details = details;
    this.ranges = [];
    const detailRanges = details.map((detail) => ({
      range: tidyLocation(detail.location),
      primary: true,
      metadata: { detail, description: this.describe(detail, textModel) }
    }));
    for (const { range, metadata: { detail } } of detailRanges) {
      if (detail.type === DetailType.Statement && detail.branches) {
        for (let i = 0; i < detail.branches.length; i++) {
          const branch = { type: DetailType.Branch, branch: i, detail };
          detailRanges.push({
            range: tidyLocation(detail.branches[i].location || Range.fromPositions(range.getEndPosition())),
            primary: true,
            metadata: {
              detail: branch,
              description: this.describe(branch, textModel)
            }
          });
        }
      }
    }
    detailRanges.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range) || a.metadata.detail.type - b.metadata.detail.type);
    const stack = [];
    const result = this.ranges = [];
    const pop = () => {
      const next = stack.pop();
      const prev = stack[stack.length - 1];
      if (prev) {
        prev.range = prev.range.setStartPosition(next.range.endLineNumber, next.range.endColumn);
      }
      result.push(next);
    };
    for (const item of detailRanges) {
      const start = item.range.getStartPosition();
      while (stack[stack.length - 1]?.range.containsPosition(start) === false) {
        pop();
      }
      if (item.range.isEmpty()) {
        result.push(item);
        continue;
      }
      const prev = stack[stack.length - 1];
      if (prev) {
        const primary = prev.primary;
        const si = prev.range.setEndPosition(start.lineNumber, start.column);
        prev.range = prev.range.setStartPosition(item.range.endLineNumber, item.range.endColumn);
        prev.primary = false;
        if (prev.range.isEmpty()) {
          stack.pop();
        }
        result.push({ range: si, primary, metadata: prev.metadata });
      }
      stack.push(item);
    }
    while (stack.length) {
      pop();
    }
  }
  /** Gets the markdown description for the given detail */
  describe(detail, model) {
    if (detail.type === DetailType.Declaration) {
      return namedDetailLabel(detail.name, detail);
    } else if (detail.type === DetailType.Statement) {
      const text = wrapName(model.getValueInRange(tidyLocation(detail.location)).trim() || `<empty statement>`);
      if (detail.branches?.length) {
        const covered = detail.branches.filter((b) => !!b.count).length;
        return new MarkdownString().appendMarkdown(localize("coverage.branches", "{0} of {1} of branches in {2} were covered.", covered, detail.branches.length, text));
      } else {
        return namedDetailLabel(text, detail);
      }
    } else if (detail.type === DetailType.Branch) {
      const text = wrapName(model.getValueInRange(tidyLocation(detail.detail.location)).trim() || `<empty statement>`);
      const { count, label } = detail.detail.branches[detail.branch];
      const label2 = label ? wrapInBackticks(label) : `#${detail.branch + 1}`;
      if (!count) {
        return new MarkdownString().appendMarkdown(localize("coverage.branchNotCovered", "Branch {0} in {1} was not covered.", label2, text));
      } else if (count === true) {
        return new MarkdownString().appendMarkdown(localize("coverage.branchCoveredYes", "Branch {0} in {1} was executed.", label2, text));
      } else {
        return new MarkdownString().appendMarkdown(localize("coverage.branchCovered", "Branch {0} in {1} was executed {2} time(s).", label2, text, count));
      }
    }
    assertNever(detail);
  }
}
function namedDetailLabel(name, detail) {
  return new MarkdownString().appendMarkdown(
    !detail.count ? localize("coverage.declExecutedNo", "`{0}` was not executed.", name) : typeof detail.count === "number" ? localize("coverage.declExecutedCount", "`{0}` was executed {1} time(s).", name, detail.count) : localize("coverage.declExecutedYes", "`{0}` was executed.", name)
  );
}
function tidyLocation(location) {
  if (location instanceof Position) {
    return Range.fromPositions(location, new Position(location.lineNumber, 2147483647));
  }
  return location;
}
function wrapInBackticks(str) {
  return "`" + str.replace(/[\n\r`]/g, "") + "`";
}
function wrapName(functionNameOrCode) {
  if (functionNameOrCode.length > 50) {
    functionNameOrCode = functionNameOrCode.slice(0, 40) + "...";
  }
  return wrapInBackticks(functionNameOrCode);
}
let CoverageToolbarWidget = class extends Disposable {
  constructor(editor, configurationService, contextMenuService, testService, keybindingService, commandService, coverage, instaService) {
    super();
    this.editor = editor;
    this.configurationService = configurationService;
    this.contextMenuService = contextMenuService;
    this.testService = testService;
    this.keybindingService = keybindingService;
    this.commandService = commandService;
    this.coverage = coverage;
    this.registered = false;
    this.isRunning = false;
    this.showStore = this._register(new DisposableStore());
    this._domNode = dom.h("div.coverage-summary-widget", [
      dom.h("div", [
        dom.h("span.bars@bars"),
        dom.h("span.toolbar@toolbar")
      ])
    ]);
    this.bars = this._register(instaService.createInstance(ManagedTestCoverageBars, {
      compact: false,
      overall: false,
      container: this._domNode.bars
    }));
    this.actionBar = this._register(instaService.createInstance(ActionBar, this._domNode.toolbar, {
      orientation: ActionsOrientation.HORIZONTAL,
      actionViewItemProvider: (action, options) => {
        if (action instanceof ActionWithIcon) {
          if (action.iconOnly) {
            action.class = ThemeIcon.asClassName(action.icon);
            return new ActionViewItem(void 0, action, { ...options, label: false, icon: true });
          }
          const vm = new CodiconActionViewItem(void 0, action, options);
          vm.themeIcon = action.icon;
          return vm;
        }
        return void 0;
      }
    }));
    this._register(autorun((reader) => {
      coverage.showInline.read(reader);
      this.setActions();
    }));
    this._register(dom.addStandardDisposableListener(this._domNode.root, dom.EventType.CONTEXT_MENU, (e) => {
      this.contextMenuService.showContextMenu({
        menuId: MenuId.StickyScrollContext,
        getAnchor: () => e
      });
    }));
  }
  /** @inheritdoc */
  getId() {
    return "coverage-summary-widget";
  }
  /** @inheritdoc */
  getDomNode() {
    return this._domNode.root;
  }
  /** @inheritdoc */
  getPosition() {
    return {
      preference: OverlayWidgetPositionPreference.TOP_CENTER,
      stackOrdinal: 9
    };
  }
  clearCoverage() {
    this.current = void 0;
    this.bars.setCoverageInfo(void 0);
    this.hide();
  }
  setCoverage(coverage, testId) {
    this.current = { coverage, testId };
    this.bars.setCoverageInfo(coverage);
    if (!coverage) {
      this.hide();
    } else {
      this.setActions();
      this.show();
    }
  }
  setActions() {
    this.actionBar.clear();
    const current = this.current;
    if (!current) {
      return;
    }
    const toggleAction = new ActionWithIcon(
      "toggleInline",
      this.coverage.showInline.get() ? localize("testing.hideInlineCoverage", "Hide Inline") : localize("testing.showInlineCoverage", "Show Inline"),
      testingCoverageReport,
      void 0,
      () => this.coverage.showInline.set(!this.coverage.showInline.get(), void 0)
    );
    toggleAction.tooltip = this.keybindingService.appendKeybinding(TOGGLE_INLINE_COMMAND_TEXT, TOGGLE_INLINE_COMMAND_ID);
    const hasUncoveredStmt = current.coverage.statement.covered < current.coverage.statement.total;
    this.actionBar.push(new ActionWithIcon(
      "goToPreviousMissed",
      GO_TO_PREVIOUS_MISSED_LINE_TITLE.value,
      Codicon.arrowUp,
      hasUncoveredStmt,
      () => this.commandService.executeCommand(TestCommandId.CoverageGoToPreviousMissedLine),
      true
    ));
    this.actionBar.push(new ActionWithIcon(
      "goToNextMissed",
      GO_TO_NEXT_MISSED_LINE_TITLE.value,
      Codicon.arrowDown,
      hasUncoveredStmt,
      () => this.commandService.executeCommand(TestCommandId.CoverageGoToNextMissedLine),
      true
    ));
    this.actionBar.push(toggleAction);
    if (current.testId) {
      const testItem = current.coverage.fromResult.getTestById(current.testId.toString());
      assert(!!testItem, "got coverage for an unreported test");
      this.actionBar.push(new ActionWithIcon(
        "perTestFilter",
        coverUtils.labels.showingFilterFor(testItem.label),
        testingFilterIcon,
        void 0,
        () => this.commandService.executeCommand(TestCommandId.CoverageFilterToTestInEditor, this.current, this.editor)
      ));
    } else if (current.coverage.perTestData?.size) {
      this.actionBar.push(new ActionWithIcon(
        "perTestFilter",
        localize("testing.coverageForTestAvailable", "{0} test(s) ran code in this file", current.coverage.perTestData.size),
        testingFilterIcon,
        void 0,
        () => this.commandService.executeCommand(TestCommandId.CoverageFilterToTestInEditor, this.current, this.editor)
      ));
    }
    this.actionBar.push(new ActionWithIcon(
      "rerun",
      localize("testing.rerun", "Rerun"),
      testingRerunIcon,
      !this.isRunning,
      () => this.rerunTest()
    ));
  }
  show() {
    if (this.registered) {
      return;
    }
    this.registered = true;
    let viewZoneId;
    const ds = this.showStore;
    this.editor.addOverlayWidget(this);
    this.editor.changeViewZones((accessor) => {
      viewZoneId = accessor.addZone({
        // make space for the widget
        afterLineNumber: 0,
        afterColumn: 0,
        domNode: document.createElement("div"),
        heightInPx: 30,
        ordinal: -1
        // show before code lenses
      });
    });
    ds.add(toDisposable(() => {
      this.registered = false;
      this.editor.removeOverlayWidget(this);
      this.editor.changeViewZones((accessor) => {
        accessor.removeZone(viewZoneId);
      });
    }));
    ds.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (this.current && (e.affectsConfiguration(TestingConfigKeys.CoverageBarThresholds) || e.affectsConfiguration(TestingConfigKeys.CoveragePercent))) {
        this.setCoverage(this.current.coverage, this.current.testId);
      }
    }));
  }
  rerunTest() {
    const current = this.current;
    if (current) {
      this.isRunning = true;
      this.setActions();
      this.testService.runResolvedTests(current.coverage.fromResult.request).finally(() => {
        this.isRunning = false;
        this.setActions();
      });
    }
  }
  hide() {
    this.showStore.clear();
  }
};
CoverageToolbarWidget = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, ITestService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, ITestCoverageService),
  __decorateParam(7, IInstantiationService)
], CoverageToolbarWidget);
registerAction2(class ToggleInlineCoverage extends Action2 {
  constructor() {
    super({
      id: TOGGLE_INLINE_COMMAND_ID,
      // note: ideally this would be "show inline", but the command palette does
      // not use the 'toggled' titles, so we need to make this generic.
      title: localize2("coverage.toggleInline", "Toggle Inline Coverage"),
      category: Categories.Test,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI)
      },
      toggled: {
        condition: TestingContextKeys.inlineCoverageEnabled,
        title: localize("coverage.hideInline", "Hide Inline Coverage")
      },
      icon: testingCoverageReport,
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
        { id: MenuId.EditorTitle, when: ContextKeyExpr.and(TestingContextKeys.hasInlineCoverageDetails, TestingContextKeys.coverageToolbarEnabled.notEqualsTo(true)), group: "navigation" }
      ]
    });
  }
  run(accessor) {
    const coverage = accessor.get(ITestCoverageService);
    coverage.showInline.set(!coverage.showInline.get(), void 0);
  }
});
registerAction2(class ToggleCoverageToolbar extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageToggleToolbar,
      title: localize2("testing.toggleToolbarTitle", "Show Test Coverage Toolbar"),
      metadata: {
        description: localize2("testing.toggleToolbarDesc", "Toggle the sticky coverage bar in the editor.")
      },
      category: Categories.Test,
      toggled: {
        condition: TestingContextKeys.coverageToolbarEnabled
      },
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
        { id: MenuId.StickyScrollContext, when: TestingContextKeys.isTestCoverageOpen },
        { id: MenuId.EditorTitle, when: TestingContextKeys.hasCoverageInFile, group: "coverage", order: 1 }
      ]
    });
  }
  run(accessor) {
    const config = accessor.get(IConfigurationService);
    const value = getTestingConfiguration(config, TestingConfigKeys.CoverageToolbarEnabled);
    config.updateValue(TestingConfigKeys.CoverageToolbarEnabled, !value);
  }
});
registerAction2(class FilterCoverageToTestInEditor extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageFilterToTestInEditor,
      title: localize2("testing.filterActionLabel", "Filter Coverage to Test"),
      category: Categories.Test,
      icon: Codicon.filter,
      toggled: {
        icon: Codicon.filterFilled,
        condition: TestingContextKeys.isCoverageFilteredToTest
      },
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(
            TestingContextKeys.hasCoverageInFile,
            TestingContextKeys.coverageToolbarEnabled.notEqualsTo(true),
            TestingContextKeys.hasPerTestCoverage,
            ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID)
          ),
          group: "navigation"
        }
      ]
    });
  }
  run(accessor, coverageOrUri, editor) {
    const testCoverageService = accessor.get(ITestCoverageService);
    const quickInputService = accessor.get(IQuickInputService);
    const commandService = accessor.get(ICommandService);
    const activeEditor = isCodeEditor(editor) ? editor : accessor.get(ICodeEditorService).getActiveCodeEditor();
    let coverage;
    if (coverageOrUri instanceof FileCoverage) {
      coverage = coverageOrUri;
    } else if (isUriComponents(coverageOrUri)) {
      coverage = testCoverageService.selected.get()?.getUri(URI.from(coverageOrUri));
    } else {
      const uri = activeEditor?.getModel()?.uri;
      coverage = uri && testCoverageService.selected.get()?.getUri(uri);
    }
    if (!coverage || !coverage.perTestData?.size) {
      return;
    }
    const tests = [...coverage.perTestData].map(TestId.fromString);
    const commonPrefix = TestId.getLengthOfCommonPrefix(tests.length, (i) => tests[i]);
    const result = coverage.fromResult;
    const previousSelection = testCoverageService.filterToTest.get();
    const buttons = [{
      iconClass: "codicon-go-to-file",
      tooltip: "Go to Test"
    }];
    const items = [
      { label: coverUtils.labels.allTests, testId: void 0 },
      { type: "separator" },
      ...tests.map((id) => ({ ...coverUtils.getLabelForItem(result, id, commonPrefix), testId: id, buttons }))
    ];
    const scrollTop = activeEditor?.getScrollTop() || 0;
    const revealScrollCts = new MutableDisposable();
    quickInputService.pick(items, {
      activeItem: items.find((item) => "testId" in item && item.testId?.toString() === previousSelection?.toString()),
      placeHolder: coverUtils.labels.pickShowCoverage,
      onDidTriggerItemButton: (context) => {
        commandService.executeCommand("vscode.revealTest", context.item.testId?.toString());
      },
      onDidFocus: (entry) => {
        if (!entry.testId) {
          revealScrollCts.clear();
          activeEditor?.setScrollTop(scrollTop);
          testCoverageService.filterToTest.set(void 0, void 0);
        } else {
          const cts = revealScrollCts.value = new CancellationTokenSource();
          coverage.detailsForTest(entry.testId, cts.token).then(
            (details) => {
              const first = details.find((d) => d.type === DetailType.Statement);
              if (!cts.token.isCancellationRequested && first) {
                activeEditor?.revealLineNearTop(first.location instanceof Position ? first.location.lineNumber : first.location.startLineNumber);
              }
            },
            () => {
            }
          );
          testCoverageService.filterToTest.set(entry.testId, void 0);
        }
      }
    }).then((selected) => {
      if (!selected) {
        activeEditor?.setScrollTop(scrollTop);
      }
      revealScrollCts.dispose();
      testCoverageService.filterToTest.set(selected ? selected.testId : previousSelection, void 0);
    });
  }
});
registerAction2(class ToggleCoverageInExplorer extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageToggleInExplorer,
      title: localize2("testing.toggleCoverageInExplorerTitle", "Toggle Coverage in Explorer"),
      metadata: {
        description: localize2("testing.toggleCoverageInExplorerDesc", "Toggle the display of test coverage in the File Explorer view.")
      },
      category: Categories.Test,
      toggled: {
        condition: ContextKeyExpr.equals("config.testing.showCoverageInExplorer", true),
        title: localize("testing.hideCoverageInExplorer", "Hide Coverage in Explorer")
      },
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen }
      ]
    });
  }
  run(accessor) {
    const config = accessor.get(IConfigurationService);
    const value = getTestingConfiguration(config, TestingConfigKeys.ShowCoverageInExplorer);
    config.updateValue(TestingConfigKeys.ShowCoverageInExplorer, !value);
  }
});
registerAction2(class GoToNextMissedCoverageLine extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageGoToNextMissedLine,
      title: GO_TO_NEXT_MISSED_LINE_TITLE,
      metadata: {
        description: localize2("testing.goToNextMissedLineDesc", "Navigate to the next line that is not covered by tests.")
      },
      category: Categories.Test,
      icon: Codicon.arrowDown,
      precondition: TestingContextKeys.hasCoverageInFile,
      keybinding: {
        when: ActiveEditorContext,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyMod.Alt | KeyCode.F9
      },
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
        { id: MenuId.EditorTitle, when: TestingContextKeys.hasCoverageInFile, group: "coverage", order: 2 }
      ]
    });
  }
  run(accessor) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const activeEditor = codeEditorService.getActiveCodeEditor();
    if (!activeEditor) {
      return;
    }
    const contribution = activeEditor.getContribution(CodeCoverageDecorations.ID);
    contribution?.goToNextMissedLine();
  }
});
registerAction2(class GoToPreviousMissedCoverageLine extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageGoToPreviousMissedLine,
      title: GO_TO_PREVIOUS_MISSED_LINE_TITLE,
      metadata: {
        description: localize2("testing.goToPreviousMissedLineDesc", "Navigate to the previous line that is not covered by tests.")
      },
      category: Categories.Test,
      icon: Codicon.arrowUp,
      precondition: TestingContextKeys.hasCoverageInFile,
      keybinding: {
        when: ActiveEditorContext,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F9
      },
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
        { id: MenuId.EditorTitle, when: TestingContextKeys.hasCoverageInFile, group: "coverage", order: 3 }
      ]
    });
  }
  run(accessor) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const activeEditor = codeEditorService.getActiveCodeEditor();
    if (!activeEditor) {
      return;
    }
    const contribution = activeEditor.getContribution(CodeCoverageDecorations.ID);
    contribution?.goToPreviousMissedLine();
  }
});
class ActionWithIcon extends Action {
  constructor(id, title, icon, enabled, run, iconOnly = false) {
    super(id, title, void 0, enabled, run);
    this.icon = icon;
    this.iconOnly = iconOnly;
  }
}
class CodiconActionViewItem extends ActionViewItem {
  updateLabel() {
    if (this.options.label && this.label && this.themeIcon) {
      dom.reset(this.label, renderIcon(this.themeIcon), this.action.label);
    }
  }
}
export {
  CodeCoverageDecorations,
  CoverageDetailsModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXGNvZGVDb3ZlcmFnZURlY29yYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIEFjdGlvbnNPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBtYXBGaW5kRmlyc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IGFzc2VydCwgYXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzVXJpQ29tcG9uZW50cywgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJT3ZlcmxheVdpZGdldCwgSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiwgaXNDb2RlRWRpdG9yLCBNb3VzZVRhcmdldFR5cGUsIE92ZXJsYXlXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElNb2RlbERlY29yYXRpb25PcHRpb25zLCBJbmplY3RlZFRleHRDdXJzb3JTdG9wcywgSW5qZWN0ZWRUZXh0T3B0aW9ucywgSVRleHRNb2RlbCwgTWluaW1hcFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGJpbmRDb250ZXh0S2V5LCBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgdGhlbWVDb2xvckZyb21JZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBURVhUX0ZJTEVfRURJVE9SX0lEIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGdldFRlc3RpbmdDb25maWd1cmF0aW9uLCBUZXN0aW5nQ29uZmlnS2V5cyB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb21tYW5kSWQsIFRlc3RpbmcgfSBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEZpbGVDb3ZlcmFnZSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0Q292ZXJhZ2UuanMnO1xuaW1wb3J0IHsgSVRlc3RDb3ZlcmFnZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdENvdmVyYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi9jb21tb24vdGVzdElkLmpzJztcbmltcG9ydCB7IElUZXN0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb3ZlcmFnZURldGFpbHMsIERldGFpbFR5cGUsIElEZWNsYXJhdGlvbkNvdmVyYWdlLCBJU3RhdGVtZW50Q292ZXJhZ2UgfSBmcm9tICcuLi9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IFRlc3RpbmdDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nQ29udGV4dEtleXMuanMnO1xuaW1wb3J0ICogYXMgY292ZXJVdGlscyBmcm9tICcuL2NvZGVDb3ZlcmFnZURpc3BsYXlVdGlscy5qcyc7XG5pbXBvcnQgeyB0ZXN0aW5nQ292ZXJhZ2VNaXNzaW5nQnJhbmNoLCB0ZXN0aW5nQ292ZXJhZ2VSZXBvcnQsIHRlc3RpbmdGaWx0ZXJJY29uLCB0ZXN0aW5nUmVydW5JY29uIH0gZnJvbSAnLi9pY29ucy5qcyc7XG5pbXBvcnQgeyBNYW5hZ2VkVGVzdENvdmVyYWdlQmFycyB9IGZyb20gJy4vdGVzdENvdmVyYWdlQmFycy5qcyc7XG5pbXBvcnQgeyB0ZXN0aW5nQ292ZXJlZE1pbmltYXBCYWNrZ3JvdW5kLCB0ZXN0aW5nVW5jb3ZlcmVkTWluaW1hcEJhY2tncm91bmQgfSBmcm9tICcuL3RoZW1lLmpzJztcblxuY29uc3QgQ0xBU1NfSElUID0gJ2NvdmVyYWdlLWRlY28taGl0JztcbmNvbnN0IENMQVNTX01JU1MgPSAnY292ZXJhZ2UtZGVjby1taXNzJztcbmNvbnN0IFRPR0dMRV9JTkxJTkVfQ09NTUFORF9URVhUID0gbG9jYWxpemUoJ3Rlc3RpbmcudG9nZ2xlSW5saW5lQ292ZXJhZ2UnLCAnVG9nZ2xlIElubGluZScpO1xuY29uc3QgVE9HR0xFX0lOTElORV9DT01NQU5EX0lEID0gJ3Rlc3RpbmcudG9nZ2xlSW5saW5lQ292ZXJhZ2UnO1xuY29uc3QgQlJBTkNIX01JU1NfSU5ESUNBVE9SX0NIQVJTID0gNDtcbmNvbnN0IEdPX1RPX05FWFRfTUlTU0VEX0xJTkVfVElUTEUgPSBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZ29Ub05leHRNaXNzZWRMaW5lJywgXCJHbyB0byBOZXh0IFVuY292ZXJlZCBMaW5lXCIpO1xuY29uc3QgR09fVE9fUFJFVklPVVNfTUlTU0VEX0xJTkVfVElUTEUgPSBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZ29Ub1ByZXZpb3VzTWlzc2VkTGluZScsIFwiR28gdG8gUHJldmlvdXMgVW5jb3ZlcmVkIExpbmVcIik7XG5cbmV4cG9ydCBjbGFzcyBDb2RlQ292ZXJhZ2VEZWNvcmF0aW9ucyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9IFRlc3RpbmcuQ292ZXJhZ2VEZWNvcmF0aW9uc0NvbnRyaWJ1dGlvbklkO1xuXG5cdHByaXZhdGUgbG9hZGluZ0NhbmNlbGxhdGlvbj86IENhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3BsYXllZFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBob3ZlcmVkU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN1bW1hcnlXaWRnZXQ6IExhenk8Q292ZXJhZ2VUb29sYmFyV2lkZ2V0Pjtcblx0cHJpdmF0ZSBkZWNvcmF0aW9uSWRzID0gbmV3IE1hcDxzdHJpbmcsIHtcblx0XHRkZXRhaWw6IERldGFpbFJhbmdlO1xuXHRcdG9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRcdGFwcGx5SG92ZXJPcHRpb25zKHRhcmdldDogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMpOiB2b2lkO1xuXHR9PigpO1xuXHRwcml2YXRlIGhvdmVyZWRTdWJqZWN0PzogdW5rbm93bjtcblx0cHJpdmF0ZSBkZXRhaWxzPzogQ292ZXJhZ2VEZXRhaWxzTW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzSW5saW5lQ292ZXJhZ2VEZXRhaWxzID0gb2JzZXJ2YWJsZVZhbHVlKCdoYXNJbmxpbmVDb3ZlcmFnZURldGFpbHMnLCBmYWxzZSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlc3RDb3ZlcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb3ZlcmFnZTogSVRlc3RDb3ZlcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZzogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zdW1tYXJ5V2lkZ2V0ID0gbmV3IExhenkoKCkgPT4gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ292ZXJhZ2VUb29sYmFyV2lkZ2V0LCB0aGlzLmVkaXRvcikpKTtcblxuXHRcdGNvbnN0IG1vZGVsT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCwgKCkgPT4gZWRpdG9yLmdldE1vZGVsKCkpO1xuXHRcdGNvbnN0IGNvbmZpZ09icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgaSA9PiBpKTtcblxuXHRcdGNvbnN0IGZpbGVDb3ZlcmFnZSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJlcG9ydCA9IGNvdmVyYWdlLnNlbGVjdGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghcmVwb3J0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlsZSA9IHJlcG9ydC5nZXRVcmkobW9kZWwudXJpKTtcblx0XHRcdGlmICghZmlsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHJlcG9ydC5kaWRBZGRDb3ZlcmFnZS5yZWFkKHJlYWRlcik7IC8vIHJlLXJlYWQgaWYgY2hhbmdlcyB3aGVuIHRoZXJlJ3Mgbm8gcmVwb3J0XG5cdFx0XHRyZXR1cm4geyBmaWxlLCB0ZXN0SWQ6IGNvdmVyYWdlLmZpbHRlclRvVGVzdC5yZWFkKHJlYWRlcikgfTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KFxuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmhhc1BlclRlc3RDb3ZlcmFnZSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+ICEhZmlsZUNvdmVyYWdlLnJlYWQocmVhZGVyKT8uZmlsZS5wZXJUZXN0RGF0YT8uc2l6ZSxcblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KFxuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmhhc0NvdmVyYWdlSW5GaWxlLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRyZWFkZXIgPT4gISFmaWxlQ292ZXJhZ2UucmVhZChyZWFkZXIpPy5maWxlLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaGFzSW5saW5lQ292ZXJhZ2VEZXRhaWxzLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRyZWFkZXIgPT4gdGhpcy5oYXNJbmxpbmVDb3ZlcmFnZURldGFpbHMucmVhZChyZWFkZXIpLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgbWluaW1hcEVuYWJsZWQgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUoVGVzdGluZ0NvbmZpZ0tleXMuQ292ZXJhZ2VNaW5pbWFwRW5hYmxlZCwgdHJ1ZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGMgPSBmaWxlQ292ZXJhZ2UucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGMpIHtcblx0XHRcdFx0dGhpcy5hcHBseShlZGl0b3IuZ2V0TW9kZWwoKSEsIGMuZmlsZSwgYy50ZXN0SWQsIGNvdmVyYWdlLnNob3dJbmxpbmUucmVhZChyZWFkZXIpLCBtaW5pbWFwRW5hYmxlZC5yZWFkKHJlYWRlcikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHRvb2xiYXJFbmFibGVkID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKFRlc3RpbmdDb25maWdLZXlzLkNvdmVyYWdlVG9vbGJhckVuYWJsZWQsIHRydWUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjID0gZmlsZUNvdmVyYWdlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjICYmIHRvb2xiYXJFbmFibGVkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHR0aGlzLnN1bW1hcnlXaWRnZXQudmFsdWUuc2V0Q292ZXJhZ2UoYy5maWxlLCBjLnRlc3RJZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnN1bW1hcnlXaWRnZXQucmF3VmFsdWU/LmNsZWFyQ292ZXJhZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjID0gZmlsZUNvdmVyYWdlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjKSB7XG5cdFx0XHRcdGNvbnN0IGV2dCA9IGNvbmZpZ09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChldnQ/Lmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlRWRpdG9yU3R5bGVzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25Nb3VzZU1vdmUoZSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKGUudGFyZ2V0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9OVU1CRVJTICYmIG1vZGVsKSB7XG5cdFx0XHRcdHRoaXMuaG92ZXJMaW5lTnVtYmVyKGVkaXRvci5nZXRNb2RlbCgpISk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvdmVyYWdlLnNob3dJbmxpbmUuZ2V0KCkgJiYgZS50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCAmJiBtb2RlbCkge1xuXHRcdFx0XHR0aGlzLmhvdmVySW5saW5lRGVjb3JhdGlvbihtb2RlbCwgZS50YXJnZXQucG9zaXRpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5ob3ZlcmVkU3RvcmUuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25XaWxsQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICghdGhpcy5kZXRhaWxzIHx8ICFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIERlY29yYXRpb25zIGFkanVzdCB0byBsb2NhbCBjaGFuZ2VzIG1hZGUgaW4tZWRpdG9yLCBrZWVwIHRoZW0gc3luY2VkIGluIGNhc2UgdGhlIGZpbGUgaXMgcmVvcGVuZWQ6XG5cdFx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgbW9kZWwuZ2V0QWxsRGVjb3JhdGlvbnMoKSkge1xuXHRcdFx0XHRjb25zdCBvd24gPSB0aGlzLmRlY29yYXRpb25JZHMuZ2V0KGRlY29yYXRpb24uaWQpO1xuXHRcdFx0XHRpZiAob3duKSB7XG5cdFx0XHRcdFx0b3duLmRldGFpbC5yYW5nZSA9IGRlY29yYXRpb24ucmFuZ2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVkaXRvclN0eWxlcygpIHtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCB7IHN0eWxlIH0gPSB0aGlzLmVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCk7XG5cdFx0c3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLXRlc3RpbmctY292ZXJhZ2UtbGluZUhlaWdodCcsIGAke2xpbmVIZWlnaHR9cHhgKTtcblx0fVxuXG5cdHByaXZhdGUgaG92ZXJJbmxpbmVEZWNvcmF0aW9uKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24pIHtcblx0XHRjb25zdCBhbGxEZWNvcmF0aW9ucyA9IG1vZGVsLmdldERlY29yYXRpb25zSW5SYW5nZShSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKSk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbiA9IG1hcEZpbmRGaXJzdChhbGxEZWNvcmF0aW9ucywgKHsgaWQgfSkgPT4gdGhpcy5kZWNvcmF0aW9uSWRzLmhhcyhpZCkgPyB7IGlkLCBkZWNvOiB0aGlzLmRlY29yYXRpb25JZHMuZ2V0KGlkKSEgfSA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKGRlY29yYXRpb24gPT09IHRoaXMuaG92ZXJlZFN1YmplY3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmhvdmVyZWRTdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuaG92ZXJlZFN1YmplY3QgPSBkZWNvcmF0aW9uO1xuXG5cdFx0aWYgKCFkZWNvcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoZSA9PiB7XG5cdFx0XHRlLmNoYW5nZURlY29yYXRpb25PcHRpb25zKGRlY29yYXRpb24uaWQsIHtcblx0XHRcdFx0Li4uZGVjb3JhdGlvbi5kZWNvLm9wdGlvbnMsXG5cdFx0XHRcdGNsYXNzTmFtZTogYCR7ZGVjb3JhdGlvbi5kZWNvLm9wdGlvbnMuY2xhc3NOYW1lfSBjb3ZlcmFnZS1kZWNvLWhvdmVyZWRgLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmhvdmVyZWRTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuaG92ZXJlZFN1YmplY3QgPSB1bmRlZmluZWQ7XG5cdFx0XHRtb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucyhlID0+IHtcblx0XHRcdFx0ZS5jaGFuZ2VEZWNvcmF0aW9uT3B0aW9ucyhkZWNvcmF0aW9uIS5pZCwgZGVjb3JhdGlvbiEuZGVjby5vcHRpb25zKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgaG92ZXJMaW5lTnVtYmVyKG1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdFx0aWYgKHRoaXMuaG92ZXJlZFN1YmplY3QgPT09ICdsaW5lTm8nIHx8ICF0aGlzLmRldGFpbHMgfHwgdGhpcy5jb3ZlcmFnZS5zaG93SW5saW5lLmdldCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5ob3ZlcmVkU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLmhvdmVyZWRTdWJqZWN0ID0gJ2xpbmVObyc7XG5cblx0XHRtb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucyhlID0+IHtcblx0XHRcdGZvciAoY29uc3QgW2lkLCBkZWNvcmF0aW9uXSBvZiB0aGlzLmRlY29yYXRpb25JZHMpIHtcblx0XHRcdFx0Y29uc3QgeyBhcHBseUhvdmVyT3B0aW9ucywgb3B0aW9ucyB9ID0gZGVjb3JhdGlvbjtcblx0XHRcdFx0Y29uc3QgZHVwID0geyAuLi5vcHRpb25zIH07XG5cdFx0XHRcdGFwcGx5SG92ZXJPcHRpb25zKGR1cCk7XG5cdFx0XHRcdGUuY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnMoaWQsIGR1cCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmhvdmVyZWRTdG9yZS5hZGQodGhpcy5lZGl0b3Iub25Nb3VzZUxlYXZlKCgpID0+IHtcblx0XHRcdHRoaXMuaG92ZXJlZFN0b3JlLmNsZWFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5ob3ZlcmVkU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmhvdmVyZWRTdWJqZWN0ID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRtb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucyhlID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBbaWQsIGRlY29yYXRpb25dIG9mIHRoaXMuZGVjb3JhdGlvbklkcykge1xuXHRcdFx0XHRcdGUuY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnMoaWQsIGRlY29yYXRpb24ub3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOYXZpZ2F0ZSB0byB0aGUgbmV4dCBtaXNzZWQgKHVuY292ZXJlZCkgbGluZSBmcm9tIHRoZSBjdXJyZW50IGN1cnNvciBwb3NpdGlvbi5cblx0ICogQHJldHVybnMgdHJ1ZSBpZiBuYXZpZ2F0aW9uIG9jY3VycmVkLCBmYWxzZSBpZiBubyBtaXNzZWQgbGluZSB3YXMgZm91bmRcblx0ICovXG5cdHB1YmxpYyBnb1RvTmV4dE1pc3NlZExpbmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubmF2aWdhdGVUb01pc3NlZExpbmUodHJ1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogTmF2aWdhdGUgdG8gdGhlIHByZXZpb3VzIG1pc3NlZCAodW5jb3ZlcmVkKSBsaW5lIGZyb20gdGhlIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uLlxuXHQgKiBAcmV0dXJucyB0cnVlIGlmIG5hdmlnYXRpb24gb2NjdXJyZWQsIGZhbHNlIGlmIG5vIG1pc3NlZCBsaW5lIHdhcyBmb3VuZFxuXHQgKi9cblx0cHVibGljIGdvVG9QcmV2aW91c01pc3NlZExpbmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubmF2aWdhdGVUb01pc3NlZExpbmUoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBuYXZpZ2F0ZVRvTWlzc2VkTGluZShuZXh0OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRpZiAoIW1vZGVsIHx8ICFwb3NpdGlvbiB8fCAhdGhpcy5kZXRhaWxzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudExpbmUgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGxldCBjbG9zZXN0QmVmb3JlOiB7IGxpbmVOdW1iZXI6IG51bWJlcjsgcmFuZ2U6IFJhbmdlIH0gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNsb3Nlc3RBZnRlcjogeyBsaW5lTnVtYmVyOiBudW1iZXI7IHJhbmdlOiBSYW5nZSB9IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBmaXJzdE1pc3NlZDogeyBsaW5lTnVtYmVyOiBudW1iZXI7IHJhbmdlOiBSYW5nZSB9IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBsYXN0TWlzc2VkOiB7IGxpbmVOdW1iZXI6IG51bWJlcjsgcmFuZ2U6IFJhbmdlIH0gfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBGaW5kIHRoZSBjbG9zZXN0IG1pc3NlZCBsaW5lIGJlZm9yZSBhbmQgYWZ0ZXIgdGhlIGN1cnJlbnQgcG9zaXRpb25cblx0XHRmb3IgKGNvbnN0IFssIHsgZGV0YWlsLCBvcHRpb25zIH1dIG9mIHRoaXMuZGVjb3JhdGlvbklkcykge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyBhIG1pc3NlZCBsaW5lIChDTEFTU19NSVNTIGluIGxpbmVOdW1iZXJDbGFzc05hbWUpXG5cdFx0XHRpZiAob3B0aW9ucy5saW5lTnVtYmVyQ2xhc3NOYW1lPy5pbmNsdWRlcyhDTEFTU19NSVNTKSkge1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IGRldGFpbC5yYW5nZTtcblx0XHRcdFx0aWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0Y29uc3QgbWlzc2VkTGluZSA9IHsgbGluZU51bWJlciwgcmFuZ2UgfTtcblxuXHRcdFx0XHQvLyBUcmFjayBmaXJzdCBhbmQgbGFzdCBtaXNzZWQgbGluZXMgZm9yIHdyYXAtYXJvdW5kXG5cdFx0XHRcdGlmICghZmlyc3RNaXNzZWQgfHwgbGluZU51bWJlciA8IGZpcnN0TWlzc2VkLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRmaXJzdE1pc3NlZCA9IG1pc3NlZExpbmU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFsYXN0TWlzc2VkIHx8IGxpbmVOdW1iZXIgPiBsYXN0TWlzc2VkLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRsYXN0TWlzc2VkID0gbWlzc2VkTGluZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFRyYWNrIGNsb3Nlc3QgYmVmb3JlIGFuZCBhZnRlciBjdXJyZW50IGxpbmVcblx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPCBjdXJyZW50TGluZSkge1xuXHRcdFx0XHRcdGlmICghY2xvc2VzdEJlZm9yZSB8fCBsaW5lTnVtYmVyID4gY2xvc2VzdEJlZm9yZS5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRjbG9zZXN0QmVmb3JlID0gbWlzc2VkTGluZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAobGluZU51bWJlciA+IGN1cnJlbnRMaW5lKSB7XG5cdFx0XHRcdFx0aWYgKCFjbG9zZXN0QWZ0ZXIgfHwgbGluZU51bWJlciA8IGNsb3Nlc3RBZnRlci5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRjbG9zZXN0QWZ0ZXIgPSBtaXNzZWRMaW5lO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSB0YXJnZXQgbGluZSBiYXNlZCBvbiBkaXJlY3Rpb25cblx0XHRjb25zdCB0YXJnZXRMaW5lID0gbmV4dFxuXHRcdFx0PyAoY2xvc2VzdEFmdGVyIHx8IGZpcnN0TWlzc2VkKSAgLy8gTmV4dDogY2xvc2VzdCBhZnRlciwgb3Igd3JhcCB0byBmaXJzdFxuXHRcdFx0OiAoY2xvc2VzdEJlZm9yZSB8fCBsYXN0TWlzc2VkKTsgIC8vIFByZXZpb3VzOiBjbG9zZXN0IGJlZm9yZSwgb3Igd3JhcCB0byBsYXN0XG5cblx0XHRpZiAodGFyZ2V0TGluZSkge1xuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKHRhcmdldExpbmUubGluZU51bWJlciwgMSkpO1xuXHRcdFx0dGhpcy5lZGl0b3IucmV2ZWFsTGluZUluQ2VudGVyKHRhcmdldExpbmUubGluZU51bWJlcik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFwcGx5KG1vZGVsOiBJVGV4dE1vZGVsLCBjb3ZlcmFnZTogRmlsZUNvdmVyYWdlLCB0ZXN0SWQ6IFRlc3RJZCB8IHVuZGVmaW5lZCwgc2hvd0lubGluZUJ5RGVmYXVsdDogYm9vbGVhbiwgc2hvd01pbmltYXA6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBkZXRhaWxzID0gdGhpcy5kZXRhaWxzID0gYXdhaXQgdGhpcy5sb2FkRGV0YWlscyhjb3ZlcmFnZSwgdGVzdElkLCBtb2RlbCk7XG5cdFx0aWYgKCFkZXRhaWxzKSB7XG5cdFx0XHR0aGlzLmhhc0lubGluZUNvdmVyYWdlRGV0YWlscy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5jbGVhcigpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBjb250ZXh0IGtleSB0byBpbmRpY2F0ZSBpbmxpbmUgY292ZXJhZ2UgZGV0YWlscyBhcmUgYXZhaWxhYmxlXG5cdFx0dGhpcy5oYXNJbmxpbmVDb3ZlcmFnZURldGFpbHMuc2V0KGRldGFpbHMucmFuZ2VzLmxlbmd0aCA+IDAsIHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLmRpc3BsYXllZFN0b3JlLmNsZWFyKCk7XG5cblx0XHRtb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucyhlID0+IHtcblx0XHRcdGZvciAoY29uc3QgZGV0YWlsUmFuZ2Ugb2YgZGV0YWlscy5yYW5nZXMpIHtcblx0XHRcdFx0Y29uc3QgeyBtZXRhZGF0YTogeyBkZXRhaWwsIGRlc2NyaXB0aW9uIH0sIHJhbmdlLCBwcmltYXJ5IH0gPSBkZXRhaWxSYW5nZTtcblx0XHRcdFx0aWYgKGRldGFpbC50eXBlID09PSBEZXRhaWxUeXBlLkJyYW5jaCkge1xuXHRcdFx0XHRcdGNvbnN0IGhpdHMgPSBkZXRhaWwuZGV0YWlsLmJyYW5jaGVzIVtkZXRhaWwuYnJhbmNoXS5jb3VudDtcblx0XHRcdFx0XHRjb25zdCBjbHMgPSBoaXRzID8gQ0xBU1NfSElUIDogQ0xBU1NfTUlTUztcblx0XHRcdFx0XHQvLyBkb24ndCBib3RoZXIgc2hvd2luZyB0aGUgbWlzcyBpbmRpY2F0b3IgaWYgdGhlIGNvbmRpdGlvbiB3YXNuJ3QgZXhlY3V0ZWQgYXQgYWxsOlxuXHRcdFx0XHRcdGNvbnN0IHNob3dNaXNzSW5kaWNhdG9yID0gIWhpdHMgJiYgcmFuZ2UuaXNFbXB0eSgpICYmIGRldGFpbC5kZXRhaWwuYnJhbmNoZXMhLnNvbWUoYiA9PiBiLmNvdW50KTtcblx0XHRcdFx0XHRjb25zdCBvcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogc2hvd01pc3NJbmRpY2F0b3IsIC8vIG9ubHkgYXZvaWQgY29sbGFwc2luZyBpZiB3ZSB3YW50IHRvIHNob3cgdGhlIG1pc3MgaW5kaWNhdG9yXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2NvdmVyYWdlLWd1dHRlcicsXG5cdFx0XHRcdFx0XHRsaW5lTnVtYmVyQ2xhc3NOYW1lOiBgY292ZXJhZ2UtZGVjby1ndXR0ZXIgJHtjbHN9YCxcblx0XHRcdFx0XHRcdG1pbmltYXA6IHNob3dNaW5pbWFwID8ge1xuXHRcdFx0XHRcdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChoaXRzID8gdGVzdGluZ0NvdmVyZWRNaW5pbWFwQmFja2dyb3VuZCA6IHRlc3RpbmdVbmNvdmVyZWRNaW5pbWFwQmFja2dyb3VuZCksXG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBNaW5pbWFwUG9zaXRpb24uR3V0dGVyLFxuXHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Y29uc3QgYXBwbHlIb3Zlck9wdGlvbnMgPSAodGFyZ2V0OiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdFx0dGFyZ2V0LmhvdmVyTWVzc2FnZSA9IGRlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdFx0aWYgKHNob3dNaXNzSW5kaWNhdG9yKSB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldC5hZnRlciA9IHtcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50OiAnXFx4YTAnLnJlcGVhdChCUkFOQ0hfTUlTU19JTkRJQ0FUT1JfQ0hBUlMpLCAvLyBuYnNwXG5cdFx0XHRcdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiBgY292ZXJhZ2UtZGVjby1icmFuY2gtbWlzcy1pbmRpY2F0b3IgJHtUaGVtZUljb24uYXNDbGFzc05hbWUodGVzdGluZ0NvdmVyYWdlTWlzc2luZ0JyYW5jaCl9YCxcblx0XHRcdFx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWVBZmZlY3RzTGV0dGVyU3BhY2luZzogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRjdXJzb3JTdG9wczogSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMuTm9uZSxcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldC5jbGFzc05hbWUgPSBgY292ZXJhZ2UtZGVjby1pbmxpbmUgJHtjbHN9YDtcblx0XHRcdFx0XHRcdFx0aWYgKHByaW1hcnkgJiYgdHlwZW9mIGhpdHMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGFyZ2V0LmJlZm9yZSA9IGNvdW50QmFkZ2UoaGl0cyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0aWYgKHNob3dJbmxpbmVCeURlZmF1bHQpIHtcblx0XHRcdFx0XHRcdGFwcGx5SG92ZXJPcHRpb25zKG9wdGlvbnMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuZGVjb3JhdGlvbklkcy5zZXQoZS5hZGREZWNvcmF0aW9uKHJhbmdlLCBvcHRpb25zKSwgeyBvcHRpb25zLCBhcHBseUhvdmVyT3B0aW9ucywgZGV0YWlsOiBkZXRhaWxSYW5nZSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChkZXRhaWwudHlwZSA9PT0gRGV0YWlsVHlwZS5TdGF0ZW1lbnQpIHtcblx0XHRcdFx0XHRjb25zdCBjbHMgPSBkZXRhaWwuY291bnQgPyBDTEFTU19ISVQgOiBDTEFTU19NSVNTO1xuXHRcdFx0XHRcdGNvbnN0IG9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zID0ge1xuXHRcdFx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnY292ZXJhZ2UtaW5saW5lJyxcblx0XHRcdFx0XHRcdGxpbmVOdW1iZXJDbGFzc05hbWU6IGBjb3ZlcmFnZS1kZWNvLWd1dHRlciAke2Nsc31gLFxuXHRcdFx0XHRcdFx0bWluaW1hcDogc2hvd01pbmltYXAgPyB7XG5cdFx0XHRcdFx0XHRcdGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKGRldGFpbC5jb3VudCA/IHRlc3RpbmdDb3ZlcmVkTWluaW1hcEJhY2tncm91bmQgOiB0ZXN0aW5nVW5jb3ZlcmVkTWluaW1hcEJhY2tncm91bmQpLFxuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogTWluaW1hcFBvc2l0aW9uLkd1dHRlcixcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGNvbnN0IGFwcGx5SG92ZXJPcHRpb25zID0gKHRhcmdldDogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRcdHRhcmdldC5jbGFzc05hbWUgPSBgY292ZXJhZ2UtZGVjby1pbmxpbmUgJHtjbHN9YDtcblx0XHRcdFx0XHRcdHRhcmdldC5ob3Zlck1lc3NhZ2UgPSBkZXNjcmlwdGlvbjtcblx0XHRcdFx0XHRcdGlmIChwcmltYXJ5ICYmIHR5cGVvZiBkZXRhaWwuY291bnQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldC5iZWZvcmUgPSBjb3VudEJhZGdlKGRldGFpbC5jb3VudCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGlmIChzaG93SW5saW5lQnlEZWZhdWx0KSB7XG5cdFx0XHRcdFx0XHRhcHBseUhvdmVyT3B0aW9ucyhvcHRpb25zKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLmRlY29yYXRpb25JZHMuc2V0KGUuYWRkRGVjb3JhdGlvbihyYW5nZSwgb3B0aW9ucyksIHsgb3B0aW9ucywgYXBwbHlIb3Zlck9wdGlvbnMsIGRldGFpbDogZGV0YWlsUmFuZ2UgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuZGlzcGxheWVkU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRtb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucyhlID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIHRoaXMuZGVjb3JhdGlvbklkcy5rZXlzKCkpIHtcblx0XHRcdFx0XHRlLnJlbW92ZURlY29yYXRpb24oZGVjb3JhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5kZWNvcmF0aW9uSWRzLmNsZWFyKCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCkge1xuXHRcdHRoaXMubG9hZGluZ0NhbmNlbGxhdGlvbj8uY2FuY2VsKCk7XG5cdFx0dGhpcy5sb2FkaW5nQ2FuY2VsbGF0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuZGlzcGxheWVkU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLmhvdmVyZWRTdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuaGFzSW5saW5lQ292ZXJhZ2VEZXRhaWxzLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZERldGFpbHMoY292ZXJhZ2U6IEZpbGVDb3ZlcmFnZSwgdGVzdElkOiBUZXN0SWQgfCB1bmRlZmluZWQsIHRleHRNb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdGNvbnN0IGN0cyA9IHRoaXMubG9hZGluZ0NhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuZGlzcGxheWVkU3RvcmUuYWRkKHRoaXMubG9hZGluZ0NhbmNlbGxhdGlvbik7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IHRlc3RJZFxuXHRcdFx0XHQ/IGF3YWl0IGNvdmVyYWdlLmRldGFpbHNGb3JUZXN0KHRlc3RJZCwgdGhpcy5sb2FkaW5nQ2FuY2VsbGF0aW9uLnRva2VuKVxuXHRcdFx0XHQ6IGF3YWl0IGNvdmVyYWdlLmRldGFpbHModGhpcy5sb2FkaW5nQ2FuY2VsbGF0aW9uLnRva2VuKTtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBDb3ZlcmFnZURldGFpbHNNb2RlbChkZXRhaWxzLCB0ZXh0TW9kZWwpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nLmVycm9yKCdFcnJvciBsb2FkaW5nIGNvdmVyYWdlIGRldGFpbHMnLCBlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNvbnN0IGNvdW50QmFkZ2UgPSAoY291bnQ6IG51bWJlcik6IEluamVjdGVkVGV4dE9wdGlvbnMgfCB1bmRlZmluZWQgPT4ge1xuXHRpZiAoY291bnQgPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRjb250ZW50OiBgJHtjb3VudCA+IDk5ID8gJzk5KycgOiBjb3VudH14YCxcblx0XHRjdXJzb3JTdG9wczogSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMuTm9uZSxcblx0XHRpbmxpbmVDbGFzc05hbWU6IGBjb3ZlcmFnZS1kZWNvLWlubGluZS1jb3VudGAsXG5cdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IHRydWUsXG5cdH07XG59O1xuXG50eXBlIENvdmVyYWdlRGV0YWlsc1dpdGhCcmFuY2ggPSBDb3ZlcmFnZURldGFpbHMgfCB7IHR5cGU6IERldGFpbFR5cGUuQnJhbmNoOyBicmFuY2g6IG51bWJlcjsgZGV0YWlsOiBJU3RhdGVtZW50Q292ZXJhZ2UgfTtcbnR5cGUgRGV0YWlsUmFuZ2UgPSB7IHJhbmdlOiBSYW5nZTsgcHJpbWFyeTogYm9vbGVhbjsgbWV0YWRhdGE6IHsgZGV0YWlsOiBDb3ZlcmFnZURldGFpbHNXaXRoQnJhbmNoOyBkZXNjcmlwdGlvbjogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIH0gfTtcblxuZXhwb3J0IGNsYXNzIENvdmVyYWdlRGV0YWlsc01vZGVsIHtcblx0cHVibGljIHJlYWRvbmx5IHJhbmdlczogRGV0YWlsUmFuZ2VbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBkZXRhaWxzOiBDb3ZlcmFnZURldGFpbHNbXSwgdGV4dE1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cblx0XHQvLyNyZWdpb24gZGVjb3JhdGlvbiBnZW5lcmF0aW9uXG5cdFx0Ly8gQ292ZXJhZ2UgZnJvbSBhIHByb3ZpZGVyIGNhbiBoYXZlIGEgcmFuZ2UgdGhhdCBjb250YWlucyBzbWFsbGVyIHJhbmdlcyxcblx0XHQvLyBzdWNoIGFzIGEgZnVuY3Rpb24gZGVjbGFyYXRpb24gdGhhdCBoYXMgbmVzdGVkIHN0YXRlbWVudHMuIEluIHRoaXMgd2Vcblx0XHQvLyBtYWtlIHNlcXVlbnRpYWwsIG5vbi1vdmVybGFwcGluZyByYW5nZXMgZm9yIGVhY2ggZGV0YWlsIGZvciBkaXNwbGF5IGluXG5cdFx0Ly8gdGhlIGVkaXRvciB3aXRob3V0IHVnbHkgb3ZlcmxhcHMuXG5cdFx0Y29uc3QgZGV0YWlsUmFuZ2VzOiBEZXRhaWxSYW5nZVtdID0gZGV0YWlscy5tYXAoZGV0YWlsID0+ICh7XG5cdFx0XHRyYW5nZTogdGlkeUxvY2F0aW9uKGRldGFpbC5sb2NhdGlvbiksXG5cdFx0XHRwcmltYXJ5OiB0cnVlLFxuXHRcdFx0bWV0YWRhdGE6IHsgZGV0YWlsLCBkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmliZShkZXRhaWwsIHRleHRNb2RlbCkgfVxuXHRcdH0pKTtcblxuXHRcdGZvciAoY29uc3QgeyByYW5nZSwgbWV0YWRhdGE6IHsgZGV0YWlsIH0gfSBvZiBkZXRhaWxSYW5nZXMpIHtcblx0XHRcdGlmIChkZXRhaWwudHlwZSA9PT0gRGV0YWlsVHlwZS5TdGF0ZW1lbnQgJiYgZGV0YWlsLmJyYW5jaGVzKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGV0YWlsLmJyYW5jaGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgYnJhbmNoOiBDb3ZlcmFnZURldGFpbHNXaXRoQnJhbmNoID0geyB0eXBlOiBEZXRhaWxUeXBlLkJyYW5jaCwgYnJhbmNoOiBpLCBkZXRhaWwgfTtcblx0XHRcdFx0XHRkZXRhaWxSYW5nZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRyYW5nZTogdGlkeUxvY2F0aW9uKGRldGFpbC5icmFuY2hlc1tpXS5sb2NhdGlvbiB8fCBSYW5nZS5mcm9tUG9zaXRpb25zKHJhbmdlLmdldEVuZFBvc2l0aW9uKCkpKSxcblx0XHRcdFx0XHRcdHByaW1hcnk6IHRydWUsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0XHRkZXRhaWw6IGJyYW5jaCxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuZGVzY3JpYmUoYnJhbmNoLCB0ZXh0TW9kZWwpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHR5cGUgb3JkZXJpbmcgaXMgZG9uZSBzbyB0aGF0IGZ1bmN0aW9uIGRlY2xhcmF0aW9ucyBjb21lIGZpcnN0IG9uIGEgdGllIHNvIHRoYXRcblx0XHQvLyBzaW5nbGUtc3RhdGVtZW50IGZ1bmN0aW9ucyAoYCgpID0+IGZvbygpYCBmb3IgZXhhbXBsZSkgZ2V0IGlubGluZSBkZWNvcmF0aW9ucy5cblx0XHRkZXRhaWxSYW5nZXMuc29ydCgoYSwgYikgPT4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpIHx8IGEubWV0YWRhdGEuZGV0YWlsLnR5cGUgLSBiLm1ldGFkYXRhLmRldGFpbC50eXBlKTtcblxuXHRcdGNvbnN0IHN0YWNrOiBEZXRhaWxSYW5nZVtdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0OiBEZXRhaWxSYW5nZVtdID0gdGhpcy5yYW5nZXMgPSBbXTtcblx0XHRjb25zdCBwb3AgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXh0ID0gc3RhY2sucG9wKCkhO1xuXHRcdFx0Y29uc3QgcHJldiA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdO1xuXHRcdFx0aWYgKHByZXYpIHtcblx0XHRcdFx0cHJldi5yYW5nZSA9IHByZXYucmFuZ2Uuc2V0U3RhcnRQb3NpdGlvbihuZXh0LnJhbmdlLmVuZExpbmVOdW1iZXIsIG5leHQucmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRcdH1cblxuXHRcdFx0cmVzdWx0LnB1c2gobmV4dCk7XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBkZXRhaWxSYW5nZXMpIHtcblx0XHRcdC8vIDEuIEVuc3VyZSB0aGF0IGFueSByYW5nZXMgaW4gdGhlIHN0YWNrIHRoYXQgZW5kZWQgYmVmb3JlIHRoaXMgYXJlIGZsdXNoZWRcblx0XHRcdGNvbnN0IHN0YXJ0ID0gaXRlbS5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHR3aGlsZSAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0/LnJhbmdlLmNvbnRhaW5zUG9zaXRpb24oc3RhcnQpID09PSBmYWxzZSkge1xuXHRcdFx0XHRwb3AoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW1wdHkgcmFuZ2VzICh1c3VhbGx5IHJlcHJlc2VudGluZyBtaXNzaW5nIGJyYW5jaGVzKSBjYW4gYmUgYWRkZWRcblx0XHRcdC8vIHdpdGhvdXQgd29ycnkgYWJvdXQgb3ZlcmxheS5cblx0XHRcdGlmIChpdGVtLnJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIDIuIFRha2UgdGhlIGxhc3QgKG92ZXJsYXBwaW5nKSBpdGVtIGluIHRoZSBzdGFjaywgcHVzaCByYW5nZSBiZWZvcmVcblx0XHRcdC8vIHRoZSBgaXRlbS5yYW5nZWAgaW50byB0aGUgcmVzdWx0IGFuZCBtb2RpZnkgaXRzIHN0YWNrIHRvIHB1c2ggdGhlIHN0YXJ0XG5cdFx0XHQvLyB1bnRpbCBhZnRlciB0aGUgYGl0ZW0ucmFuZ2VgIGVuZHMuXG5cdFx0XHRjb25zdCBwcmV2ID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAocHJldikge1xuXHRcdFx0XHRjb25zdCBwcmltYXJ5ID0gcHJldi5wcmltYXJ5O1xuXHRcdFx0XHRjb25zdCBzaSA9IHByZXYucmFuZ2Uuc2V0RW5kUG9zaXRpb24oc3RhcnQubGluZU51bWJlciwgc3RhcnQuY29sdW1uKTtcblx0XHRcdFx0cHJldi5yYW5nZSA9IHByZXYucmFuZ2Uuc2V0U3RhcnRQb3NpdGlvbihpdGVtLnJhbmdlLmVuZExpbmVOdW1iZXIsIGl0ZW0ucmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRcdFx0cHJldi5wcmltYXJ5ID0gZmFsc2U7XG5cdFx0XHRcdC8vIGRpc2NhcmQgdGhlIHByZXZpb3VzIHJhbmdlIGlmIGl0IGJlY2FtZSBlbXB0eSwgZS5nLiBhIG5lc3RlZCBzdGF0ZW1lbnRcblx0XHRcdFx0aWYgKHByZXYucmFuZ2UuaXNFbXB0eSgpKSB7IHN0YWNrLnBvcCgpOyB9XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgcmFuZ2U6IHNpLCBwcmltYXJ5LCBtZXRhZGF0YTogcHJldi5tZXRhZGF0YSB9KTtcblx0XHRcdH1cblxuXHRcdFx0c3RhY2sucHVzaChpdGVtKTtcblx0XHR9XG5cdFx0d2hpbGUgKHN0YWNrLmxlbmd0aCkge1xuXHRcdFx0cG9wKCk7XG5cdFx0fVxuXHRcdC8vI2VuZHJlZ2lvblxuXHR9XG5cblx0LyoqIEdldHMgdGhlIG1hcmtkb3duIGRlc2NyaXB0aW9uIGZvciB0aGUgZ2l2ZW4gZGV0YWlsICovXG5cdHB1YmxpYyBkZXNjcmliZShkZXRhaWw6IENvdmVyYWdlRGV0YWlsc1dpdGhCcmFuY2gsIG1vZGVsOiBJVGV4dE1vZGVsKTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZGV0YWlsLnR5cGUgPT09IERldGFpbFR5cGUuRGVjbGFyYXRpb24pIHtcblx0XHRcdHJldHVybiBuYW1lZERldGFpbExhYmVsKGRldGFpbC5uYW1lLCBkZXRhaWwpO1xuXHRcdH0gZWxzZSBpZiAoZGV0YWlsLnR5cGUgPT09IERldGFpbFR5cGUuU3RhdGVtZW50KSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gd3JhcE5hbWUobW9kZWwuZ2V0VmFsdWVJblJhbmdlKHRpZHlMb2NhdGlvbihkZXRhaWwubG9jYXRpb24pKS50cmltKCkgfHwgYDxlbXB0eSBzdGF0ZW1lbnQ+YCk7XG5cdFx0XHRpZiAoZGV0YWlsLmJyYW5jaGVzPy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgY292ZXJlZCA9IGRldGFpbC5icmFuY2hlcy5maWx0ZXIoYiA9PiAhIWIuY291bnQpLmxlbmd0aDtcblx0XHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdjb3ZlcmFnZS5icmFuY2hlcycsICd7MH0gb2YgezF9IG9mIGJyYW5jaGVzIGluIHsyfSB3ZXJlIGNvdmVyZWQuJywgY292ZXJlZCwgZGV0YWlsLmJyYW5jaGVzLmxlbmd0aCwgdGV4dCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5hbWVkRGV0YWlsTGFiZWwodGV4dCwgZGV0YWlsKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGRldGFpbC50eXBlID09PSBEZXRhaWxUeXBlLkJyYW5jaCkge1xuXHRcdFx0Y29uc3QgdGV4dCA9IHdyYXBOYW1lKG1vZGVsLmdldFZhbHVlSW5SYW5nZSh0aWR5TG9jYXRpb24oZGV0YWlsLmRldGFpbC5sb2NhdGlvbikpLnRyaW0oKSB8fCBgPGVtcHR5IHN0YXRlbWVudD5gKTtcblx0XHRcdGNvbnN0IHsgY291bnQsIGxhYmVsIH0gPSBkZXRhaWwuZGV0YWlsLmJyYW5jaGVzIVtkZXRhaWwuYnJhbmNoXTtcblx0XHRcdGNvbnN0IGxhYmVsMiA9IGxhYmVsID8gd3JhcEluQmFja3RpY2tzKGxhYmVsKSA6IGAjJHtkZXRhaWwuYnJhbmNoICsgMX1gO1xuXHRcdFx0aWYgKCFjb3VudCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ2NvdmVyYWdlLmJyYW5jaE5vdENvdmVyZWQnLCAnQnJhbmNoIHswfSBpbiB7MX0gd2FzIG5vdCBjb3ZlcmVkLicsIGxhYmVsMiwgdGV4dCkpO1xuXHRcdFx0fSBlbHNlIGlmIChjb3VudCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ2NvdmVyYWdlLmJyYW5jaENvdmVyZWRZZXMnLCAnQnJhbmNoIHswfSBpbiB7MX0gd2FzIGV4ZWN1dGVkLicsIGxhYmVsMiwgdGV4dCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdjb3ZlcmFnZS5icmFuY2hDb3ZlcmVkJywgJ0JyYW5jaCB7MH0gaW4gezF9IHdhcyBleGVjdXRlZCB7Mn0gdGltZShzKS4nLCBsYWJlbDIsIHRleHQsIGNvdW50KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXNzZXJ0TmV2ZXIoZGV0YWlsKTtcblx0fVxufVxuXG5mdW5jdGlvbiBuYW1lZERldGFpbExhYmVsKG5hbWU6IHN0cmluZywgZGV0YWlsOiBJU3RhdGVtZW50Q292ZXJhZ2UgfCBJRGVjbGFyYXRpb25Db3ZlcmFnZSkge1xuXHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24oXG5cdFx0IWRldGFpbC5jb3VudCAvLyAwIG9yIGZhbHNlXG5cdFx0XHQ/IGxvY2FsaXplKCdjb3ZlcmFnZS5kZWNsRXhlY3V0ZWRObycsICdgezB9YCB3YXMgbm90IGV4ZWN1dGVkLicsIG5hbWUpXG5cdFx0XHQ6IHR5cGVvZiBkZXRhaWwuY291bnQgPT09ICdudW1iZXInXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NvdmVyYWdlLmRlY2xFeGVjdXRlZENvdW50JywgJ2B7MH1gIHdhcyBleGVjdXRlZCB7MX0gdGltZShzKS4nLCBuYW1lLCBkZXRhaWwuY291bnQpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NvdmVyYWdlLmRlY2xFeGVjdXRlZFllcycsICdgezB9YCB3YXMgZXhlY3V0ZWQuJywgbmFtZSlcblx0KTtcbn1cblxuLy8gJ3RpZGllcycgdGhlIHJhbmdlIGJ5IG5vcm1hbGl6aW5nIGl0IGludG8gYSByYW5nZSBhbmQgcmVtb3ZpbmcgbGVhZGluZ1xuLy8gYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2UuXG5mdW5jdGlvbiB0aWR5TG9jYXRpb24obG9jYXRpb246IFJhbmdlIHwgUG9zaXRpb24pOiBSYW5nZSB7XG5cdGlmIChsb2NhdGlvbiBpbnN0YW5jZW9mIFBvc2l0aW9uKSB7XG5cdFx0cmV0dXJuIFJhbmdlLmZyb21Qb3NpdGlvbnMobG9jYXRpb24sIG5ldyBQb3NpdGlvbihsb2NhdGlvbi5saW5lTnVtYmVyLCAweDdGRkZGRkZGKSk7XG5cdH1cblxuXHRyZXR1cm4gbG9jYXRpb247XG59XG5cbmZ1bmN0aW9uIHdyYXBJbkJhY2t0aWNrcyhzdHI6IHN0cmluZykge1xuXHRyZXR1cm4gJ2AnICsgc3RyLnJlcGxhY2UoL1tcXG5cXHJgXS9nLCAnJykgKyAnYCc7XG59XG5cbmZ1bmN0aW9uIHdyYXBOYW1lKGZ1bmN0aW9uTmFtZU9yQ29kZTogc3RyaW5nKSB7XG5cdGlmIChmdW5jdGlvbk5hbWVPckNvZGUubGVuZ3RoID4gNTApIHtcblx0XHRmdW5jdGlvbk5hbWVPckNvZGUgPSBmdW5jdGlvbk5hbWVPckNvZGUuc2xpY2UoMCwgNDApICsgJy4uLic7XG5cdH1cblx0cmV0dXJuIHdyYXBJbkJhY2t0aWNrcyhmdW5jdGlvbk5hbWVPckNvZGUpO1xufVxuXG5jbGFzcyBDb3ZlcmFnZVRvb2xiYXJXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU92ZXJsYXlXaWRnZXQge1xuXHRwcml2YXRlIGN1cnJlbnQ6IHsgY292ZXJhZ2U6IEZpbGVDb3ZlcmFnZTsgdGVzdElkOiBUZXN0SWQgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWdpc3RlcmVkID0gZmFsc2U7XG5cdHByaXZhdGUgaXNSdW5uaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2hvd1N0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZSA9IGRvbS5oKCdkaXYuY292ZXJhZ2Utc3VtbWFyeS13aWRnZXQnLCBbXG5cdFx0ZG9tLmgoJ2RpdicsIFtcblx0XHRcdGRvbS5oKCdzcGFuLmJhcnNAYmFycycpLFxuXHRcdFx0ZG9tLmgoJ3NwYW4udG9vbGJhckB0b29sYmFyJyksXG5cdFx0XSksXG5cdF0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYmFyczogTWFuYWdlZFRlc3RDb3ZlcmFnZUJhcnM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVzdENvdmVyYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvdmVyYWdlOiBJVGVzdENvdmVyYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5iYXJzID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hbmFnZWRUZXN0Q292ZXJhZ2VCYXJzLCB7XG5cdFx0XHRjb21wYWN0OiBmYWxzZSxcblx0XHRcdG92ZXJhbGw6IGZhbHNlLFxuXHRcdFx0Y29udGFpbmVyOiB0aGlzLl9kb21Ob2RlLmJhcnMsXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5hY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWN0aW9uQmFyLCB0aGlzLl9kb21Ob2RlLnRvb2xiYXIsIHtcblx0XHRcdG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uSE9SSVpPTlRBTCxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIEFjdGlvbldpdGhJY29uKSB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbi5pY29uT25seSkge1xuXHRcdFx0XHRcdFx0YWN0aW9uLmNsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGFjdGlvbi5pY29uKTtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgQWN0aW9uVmlld0l0ZW0odW5kZWZpbmVkLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgbGFiZWw6IGZhbHNlLCBpY29uOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHZtID0gbmV3IENvZGljb25BY3Rpb25WaWV3SXRlbSh1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHRcdFx0dm0udGhlbWVJY29uID0gYWN0aW9uLmljb247XG5cdFx0XHRcdFx0cmV0dXJuIHZtO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvdmVyYWdlLnNob3dJbmxpbmUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5zZXRBY3Rpb25zKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUucm9vdCwgZG9tLkV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuU3RpY2t5U2Nyb2xsQ29udGV4dCxcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnY292ZXJhZ2Utc3VtbWFyeS13aWRnZXQnO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZS5yb290O1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBnZXRQb3NpdGlvbigpOiBJT3ZlcmxheVdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByZWZlcmVuY2U6IE92ZXJsYXlXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuVE9QX0NFTlRFUixcblx0XHRcdHN0YWNrT3JkaW5hbDogOSxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGNsZWFyQ292ZXJhZ2UoKSB7XG5cdFx0dGhpcy5jdXJyZW50ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuYmFycy5zZXRDb3ZlcmFnZUluZm8odW5kZWZpbmVkKTtcblx0XHR0aGlzLmhpZGUoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRDb3ZlcmFnZShjb3ZlcmFnZTogRmlsZUNvdmVyYWdlLCB0ZXN0SWQ6IFRlc3RJZCB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuY3VycmVudCA9IHsgY292ZXJhZ2UsIHRlc3RJZCB9O1xuXHRcdHRoaXMuYmFycy5zZXRDb3ZlcmFnZUluZm8oY292ZXJhZ2UpO1xuXG5cdFx0aWYgKCFjb3ZlcmFnZSkge1xuXHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0QWN0aW9ucygpO1xuXHRcdFx0dGhpcy5zaG93KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRBY3Rpb25zKCkge1xuXHRcdHRoaXMuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuY3VycmVudDtcblx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b2dnbGVBY3Rpb24gPSBuZXcgQWN0aW9uV2l0aEljb24oXG5cdFx0XHQndG9nZ2xlSW5saW5lJyxcblx0XHRcdHRoaXMuY292ZXJhZ2Uuc2hvd0lubGluZS5nZXQoKVxuXHRcdFx0XHQ/IGxvY2FsaXplKCd0ZXN0aW5nLmhpZGVJbmxpbmVDb3ZlcmFnZScsICdIaWRlIElubGluZScpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3Rlc3Rpbmcuc2hvd0lubGluZUNvdmVyYWdlJywgJ1Nob3cgSW5saW5lJyksXG5cdFx0XHR0ZXN0aW5nQ292ZXJhZ2VSZXBvcnQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQoKSA9PiB0aGlzLmNvdmVyYWdlLnNob3dJbmxpbmUuc2V0KCF0aGlzLmNvdmVyYWdlLnNob3dJbmxpbmUuZ2V0KCksIHVuZGVmaW5lZCksXG5cdFx0KTtcblxuXHRcdHRvZ2dsZUFjdGlvbi50b29sdGlwID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKFRPR0dMRV9JTkxJTkVfQ09NTUFORF9URVhULCBUT0dHTEVfSU5MSU5FX0NPTU1BTkRfSUQpO1xuXG5cdFx0Y29uc3QgaGFzVW5jb3ZlcmVkU3RtdCA9IGN1cnJlbnQuY292ZXJhZ2Uuc3RhdGVtZW50LmNvdmVyZWQgPCBjdXJyZW50LmNvdmVyYWdlLnN0YXRlbWVudC50b3RhbDtcblx0XHQvLyBOYXZpZ2F0aW9uIGJ1dHRvbnMgZm9yIG1pc3NlZCBjb3ZlcmFnZSBsaW5lc1xuXHRcdHRoaXMuYWN0aW9uQmFyLnB1c2gobmV3IEFjdGlvbldpdGhJY29uKFxuXHRcdFx0J2dvVG9QcmV2aW91c01pc3NlZCcsXG5cdFx0XHRHT19UT19QUkVWSU9VU19NSVNTRURfTElORV9USVRMRS52YWx1ZSxcblx0XHRcdENvZGljb24uYXJyb3dVcCxcblx0XHRcdGhhc1VuY292ZXJlZFN0bXQsXG5cdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VHb1RvUHJldmlvdXNNaXNzZWRMaW5lKSxcblx0XHRcdHRydWUsXG5cdFx0KSk7XG5cblx0XHR0aGlzLmFjdGlvbkJhci5wdXNoKG5ldyBBY3Rpb25XaXRoSWNvbihcblx0XHRcdCdnb1RvTmV4dE1pc3NlZCcsXG5cdFx0XHRHT19UT19ORVhUX01JU1NFRF9MSU5FX1RJVExFLnZhbHVlLFxuXHRcdFx0Q29kaWNvbi5hcnJvd0Rvd24sXG5cdFx0XHRoYXNVbmNvdmVyZWRTdG10LFxuXHRcdFx0KCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChUZXN0Q29tbWFuZElkLkNvdmVyYWdlR29Ub05leHRNaXNzZWRMaW5lKSxcblx0XHRcdHRydWUsXG5cdFx0KSk7XG5cblx0XHR0aGlzLmFjdGlvbkJhci5wdXNoKHRvZ2dsZUFjdGlvbik7XG5cblx0XHRpZiAoY3VycmVudC50ZXN0SWQpIHtcblx0XHRcdGNvbnN0IHRlc3RJdGVtID0gY3VycmVudC5jb3ZlcmFnZS5mcm9tUmVzdWx0LmdldFRlc3RCeUlkKGN1cnJlbnQudGVzdElkLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0KCEhdGVzdEl0ZW0sICdnb3QgY292ZXJhZ2UgZm9yIGFuIHVucmVwb3J0ZWQgdGVzdCcpO1xuXHRcdFx0dGhpcy5hY3Rpb25CYXIucHVzaChuZXcgQWN0aW9uV2l0aEljb24oJ3BlclRlc3RGaWx0ZXInLFxuXHRcdFx0XHRjb3ZlclV0aWxzLmxhYmVscy5zaG93aW5nRmlsdGVyRm9yKHRlc3RJdGVtLmxhYmVsKSxcblx0XHRcdFx0dGVzdGluZ0ZpbHRlckljb24sXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0KCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChUZXN0Q29tbWFuZElkLkNvdmVyYWdlRmlsdGVyVG9UZXN0SW5FZGl0b3IsIHRoaXMuY3VycmVudCwgdGhpcy5lZGl0b3IpLFxuXHRcdFx0KSk7XG5cdFx0fSBlbHNlIGlmIChjdXJyZW50LmNvdmVyYWdlLnBlclRlc3REYXRhPy5zaXplKSB7XG5cdFx0XHR0aGlzLmFjdGlvbkJhci5wdXNoKG5ldyBBY3Rpb25XaXRoSWNvbigncGVyVGVzdEZpbHRlcicsXG5cdFx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLmNvdmVyYWdlRm9yVGVzdEF2YWlsYWJsZScsIFwiezB9IHRlc3QocykgcmFuIGNvZGUgaW4gdGhpcyBmaWxlXCIsIGN1cnJlbnQuY292ZXJhZ2UucGVyVGVzdERhdGEuc2l6ZSksXG5cdFx0XHRcdHRlc3RpbmdGaWx0ZXJJY29uLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUZpbHRlclRvVGVzdEluRWRpdG9yLCB0aGlzLmN1cnJlbnQsIHRoaXMuZWRpdG9yKSxcblx0XHRcdCkpO1xuXHRcdH1cblxuXHRcdHRoaXMuYWN0aW9uQmFyLnB1c2gobmV3IEFjdGlvbldpdGhJY29uKFxuXHRcdFx0J3JlcnVuJyxcblx0XHRcdGxvY2FsaXplKCd0ZXN0aW5nLnJlcnVuJywgJ1JlcnVuJyksXG5cdFx0XHR0ZXN0aW5nUmVydW5JY29uLFxuXHRcdFx0IXRoaXMuaXNSdW5uaW5nLFxuXHRcdFx0KCkgPT4gdGhpcy5yZXJ1blRlc3QoKVxuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93KCkge1xuXHRcdGlmICh0aGlzLnJlZ2lzdGVyZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlZ2lzdGVyZWQgPSB0cnVlO1xuXHRcdGxldCB2aWV3Wm9uZUlkOiBzdHJpbmc7XG5cdFx0Y29uc3QgZHMgPSB0aGlzLnNob3dTdG9yZTtcblxuXHRcdHRoaXMuZWRpdG9yLmFkZE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0dGhpcy5lZGl0b3IuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdHZpZXdab25lSWQgPSBhY2Nlc3Nvci5hZGRab25lKHsgLy8gbWFrZSBzcGFjZSBmb3IgdGhlIHdpZGdldFxuXHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IDAsXG5cdFx0XHRcdGFmdGVyQ29sdW1uOiAwLFxuXHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcblx0XHRcdFx0aGVpZ2h0SW5QeDogMzAsXG5cdFx0XHRcdG9yZGluYWw6IC0xLCAvLyBzaG93IGJlZm9yZSBjb2RlIGxlbnNlc1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRkcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMucmVnaXN0ZXJlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5lZGl0b3IucmVtb3ZlT3ZlcmxheVdpZGdldCh0aGlzKTtcblx0XHRcdHRoaXMuZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUodmlld1pvbmVJZCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRkcy5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50ICYmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlc3RpbmdDb25maWdLZXlzLkNvdmVyYWdlQmFyVGhyZXNob2xkcykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXN0aW5nQ29uZmlnS2V5cy5Db3ZlcmFnZVBlcmNlbnQpKSkge1xuXHRcdFx0XHR0aGlzLnNldENvdmVyYWdlKHRoaXMuY3VycmVudC5jb3ZlcmFnZSwgdGhpcy5jdXJyZW50LnRlc3RJZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXJ1blRlc3QoKSB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuY3VycmVudDtcblx0XHRpZiAoY3VycmVudCkge1xuXHRcdFx0dGhpcy5pc1J1bm5pbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy5zZXRBY3Rpb25zKCk7XG5cdFx0XHR0aGlzLnRlc3RTZXJ2aWNlLnJ1blJlc29sdmVkVGVzdHMoY3VycmVudC5jb3ZlcmFnZS5mcm9tUmVzdWx0LnJlcXVlc3QpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmlzUnVubmluZyA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLnNldEFjdGlvbnMoKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGlkZSgpIHtcblx0XHR0aGlzLnNob3dTdG9yZS5jbGVhcigpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVJbmxpbmVDb3ZlcmFnZSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVE9HR0xFX0lOTElORV9DT01NQU5EX0lELFxuXHRcdFx0Ly8gbm90ZTogaWRlYWxseSB0aGlzIHdvdWxkIGJlIFwic2hvdyBpbmxpbmVcIiwgYnV0IHRoZSBjb21tYW5kIHBhbGV0dGUgZG9lc1xuXHRcdFx0Ly8gbm90IHVzZSB0aGUgJ3RvZ2dsZWQnIHRpdGxlcywgc28gd2UgbmVlZCB0byBtYWtlIHRoaXMgZ2VuZXJpYy5cblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvdmVyYWdlLnRvZ2dsZUlubGluZScsIFwiVG9nZ2xlIElubGluZSBDb3ZlcmFnZVwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlRlc3QsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5SSksXG5cdFx0XHR9LFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IFRlc3RpbmdDb250ZXh0S2V5cy5pbmxpbmVDb3ZlcmFnZUVuYWJsZWQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY292ZXJhZ2UuaGlkZUlubGluZScsIFwiSGlkZSBJbmxpbmUgQ292ZXJhZ2VcIiksXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjogdGVzdGluZ0NvdmVyYWdlUmVwb3J0LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7IGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5pc1Rlc3RDb3ZlcmFnZU9wZW4gfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLkVkaXRvclRpdGxlLCB3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVzdGluZ0NvbnRleHRLZXlzLmhhc0lubGluZUNvdmVyYWdlRGV0YWlscywgVGVzdGluZ0NvbnRleHRLZXlzLmNvdmVyYWdlVG9vbGJhckVuYWJsZWQubm90RXF1YWxzVG8odHJ1ZSkpLCBncm91cDogJ25hdmlnYXRpb24nIH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY292ZXJhZ2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RDb3ZlcmFnZVNlcnZpY2UpO1xuXHRcdGNvdmVyYWdlLnNob3dJbmxpbmUuc2V0KCFjb3ZlcmFnZS5zaG93SW5saW5lLmdldCgpLCB1bmRlZmluZWQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZUNvdmVyYWdlVG9vbGJhciBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db3ZlcmFnZVRvZ2dsZVRvb2xiYXIsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnRvZ2dsZVRvb2xiYXJUaXRsZScsIFwiU2hvdyBUZXN0IENvdmVyYWdlIFRvb2xiYXJcIiksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUyKCd0ZXN0aW5nLnRvZ2dsZVRvb2xiYXJEZXNjJywgJ1RvZ2dsZSB0aGUgc3RpY2t5IGNvdmVyYWdlIGJhciBpbiB0aGUgZWRpdG9yLicpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVGVzdCxcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBUZXN0aW5nQ29udGV4dEtleXMuY292ZXJhZ2VUb29sYmFyRW5hYmxlZCxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgd2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmlzVGVzdENvdmVyYWdlT3BlbiB9LFxuXHRcdFx0XHR7IGlkOiBNZW51SWQuU3RpY2t5U2Nyb2xsQ29udGV4dCwgd2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmlzVGVzdENvdmVyYWdlT3BlbiB9LFxuXHRcdFx0XHR7IGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsIHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNDb3ZlcmFnZUluRmlsZSwgZ3JvdXA6ICdjb3ZlcmFnZScsIG9yZGVyOiAxIH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWcgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB2YWx1ZSA9IGdldFRlc3RpbmdDb25maWd1cmF0aW9uKGNvbmZpZywgVGVzdGluZ0NvbmZpZ0tleXMuQ292ZXJhZ2VUb29sYmFyRW5hYmxlZCk7XG5cdFx0Y29uZmlnLnVwZGF0ZVZhbHVlKFRlc3RpbmdDb25maWdLZXlzLkNvdmVyYWdlVG9vbGJhckVuYWJsZWQsICF2YWx1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRmlsdGVyQ292ZXJhZ2VUb1Rlc3RJbkVkaXRvciBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUZpbHRlclRvVGVzdEluRWRpdG9yLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5maWx0ZXJBY3Rpb25MYWJlbCcsIFwiRmlsdGVyIENvdmVyYWdlIHRvIFRlc3RcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5UZXN0LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5maWx0ZXIsXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGljb246IENvZGljb24uZmlsdGVyRmlsbGVkLFxuXHRcdFx0XHRjb25kaXRpb246IFRlc3RpbmdDb250ZXh0S2V5cy5pc0NvdmVyYWdlRmlsdGVyZWRUb1Rlc3QsXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaGFzQ292ZXJhZ2VJbkZpbGUsXG5cdFx0XHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuY292ZXJhZ2VUb29sYmFyRW5hYmxlZC5ub3RFcXVhbHNUbyh0cnVlKSxcblx0XHRcdFx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5oYXNQZXJUZXN0Q292ZXJhZ2UsXG5cdFx0XHRcdFx0XHRBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhURVhUX0ZJTEVfRURJVE9SX0lEKSxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvdmVyYWdlT3JVcmk/OiBGaWxlQ292ZXJhZ2UgfCBVUkksIGVkaXRvcj86IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVzdENvdmVyYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdENvdmVyYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGlzQ29kZUVkaXRvcihlZGl0b3IpID8gZWRpdG9yIDogYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdGxldCBjb3ZlcmFnZTogRmlsZUNvdmVyYWdlIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChjb3ZlcmFnZU9yVXJpIGluc3RhbmNlb2YgRmlsZUNvdmVyYWdlKSB7XG5cdFx0XHRjb3ZlcmFnZSA9IGNvdmVyYWdlT3JVcmk7XG5cdFx0fSBlbHNlIGlmIChpc1VyaUNvbXBvbmVudHMoY292ZXJhZ2VPclVyaSkpIHtcblx0XHRcdGNvdmVyYWdlID0gdGVzdENvdmVyYWdlU2VydmljZS5zZWxlY3RlZC5nZXQoKT8uZ2V0VXJpKFVSSS5mcm9tKGNvdmVyYWdlT3JVcmkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdXJpID0gYWN0aXZlRWRpdG9yPy5nZXRNb2RlbCgpPy51cmk7XG5cdFx0XHRjb3ZlcmFnZSA9IHVyaSAmJiB0ZXN0Q292ZXJhZ2VTZXJ2aWNlLnNlbGVjdGVkLmdldCgpPy5nZXRVcmkodXJpKTtcblx0XHR9XG5cblx0XHRpZiAoIWNvdmVyYWdlIHx8ICFjb3ZlcmFnZS5wZXJUZXN0RGF0YT8uc2l6ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRlc3RzID0gWy4uLmNvdmVyYWdlLnBlclRlc3REYXRhXS5tYXAoVGVzdElkLmZyb21TdHJpbmcpO1xuXHRcdGNvbnN0IGNvbW1vblByZWZpeCA9IFRlc3RJZC5nZXRMZW5ndGhPZkNvbW1vblByZWZpeCh0ZXN0cy5sZW5ndGgsIGkgPT4gdGVzdHNbaV0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvdmVyYWdlLmZyb21SZXN1bHQ7XG5cdFx0Y29uc3QgcHJldmlvdXNTZWxlY3Rpb24gPSB0ZXN0Q292ZXJhZ2VTZXJ2aWNlLmZpbHRlclRvVGVzdC5nZXQoKTtcblxuXHRcdHR5cGUgVEl0ZW0gPSB7IGxhYmVsOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nOyB0ZXN0SWQ6IFRlc3RJZCB8IHVuZGVmaW5lZDsgYnV0dG9ucz86IElRdWlja0lucHV0QnV0dG9uW10gfTtcblxuXHRcdGNvbnN0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbe1xuXHRcdFx0aWNvbkNsYXNzOiAnY29kaWNvbi1nby10by1maWxlJyxcblx0XHRcdHRvb2x0aXA6ICdHbyB0byBUZXN0Jyxcblx0XHR9XTtcblx0XHRjb25zdCBpdGVtczogUXVpY2tQaWNrSW5wdXQ8VEl0ZW0+W10gPSBbXG5cdFx0XHR7IGxhYmVsOiBjb3ZlclV0aWxzLmxhYmVscy5hbGxUZXN0cywgdGVzdElkOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicgfSxcblx0XHRcdC4uLnRlc3RzLm1hcChpZCA9PiAoeyAuLi5jb3ZlclV0aWxzLmdldExhYmVsRm9ySXRlbShyZXN1bHQsIGlkLCBjb21tb25QcmVmaXgpLCB0ZXN0SWQ6IGlkLCBidXR0b25zIH0pKSxcblx0XHRdO1xuXG5cdFx0Ly8gVGhlc2UgaGFuZGxlIHRoZSBiZWhhdmlvciB0aGF0IHJldmVhbHMgdGhlIHN0YXJ0IG9mIGNvdmVyYWdlIHdoZW4gdGhlXG5cdFx0Ly8gdXNlciBwaWNrcyBmcm9tIHRoZSBxdWlja3BpY2suIFNjcm9sbCBwb3NpdGlvbiBpcyByZXN0b3JlZCBpZiB0aGUgdXNlclxuXHRcdC8vIGV4aXRzIHdpdGhvdXQgcGlja2luZyBhbiBpdGVtLCBvciBwaWNrcyBcImFsbCB0ZXN0c1wiLlxuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IGFjdGl2ZUVkaXRvcj8uZ2V0U2Nyb2xsVG9wKCkgfHwgMDtcblx0XHRjb25zdCByZXZlYWxTY3JvbGxDdHMgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCk7XG5cblx0XHRxdWlja0lucHV0U2VydmljZS5waWNrKGl0ZW1zLCB7XG5cdFx0XHRhY3RpdmVJdGVtOiBpdGVtcy5maW5kKChpdGVtKTogaXRlbSBpcyBUSXRlbSA9PiAndGVzdElkJyBpbiBpdGVtICYmIGl0ZW0udGVzdElkPy50b1N0cmluZygpID09PSBwcmV2aW91c1NlbGVjdGlvbj8udG9TdHJpbmcoKSksXG5cdFx0XHRwbGFjZUhvbGRlcjogY292ZXJVdGlscy5sYWJlbHMucGlja1Nob3dDb3ZlcmFnZSxcblx0XHRcdG9uRGlkVHJpZ2dlckl0ZW1CdXR0b246IChjb250ZXh0KSA9PiB7XG5cdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUucmV2ZWFsVGVzdCcsIGNvbnRleHQuaXRlbS50ZXN0SWQ/LnRvU3RyaW5nKCkpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkRm9jdXM6IChlbnRyeSkgPT4ge1xuXHRcdFx0XHRpZiAoIWVudHJ5LnRlc3RJZCkge1xuXHRcdFx0XHRcdHJldmVhbFNjcm9sbEN0cy5jbGVhcigpO1xuXHRcdFx0XHRcdGFjdGl2ZUVkaXRvcj8uc2V0U2Nyb2xsVG9wKHNjcm9sbFRvcCk7XG5cdFx0XHRcdFx0dGVzdENvdmVyYWdlU2VydmljZS5maWx0ZXJUb1Rlc3Quc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBjdHMgPSByZXZlYWxTY3JvbGxDdHMudmFsdWUgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdFx0XHRjb3ZlcmFnZS5kZXRhaWxzRm9yVGVzdChlbnRyeS50ZXN0SWQsIGN0cy50b2tlbikudGhlbihcblx0XHRcdFx0XHRcdGRldGFpbHMgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmaXJzdCA9IGRldGFpbHMuZmluZChkID0+IGQudHlwZSA9PT0gRGV0YWlsVHlwZS5TdGF0ZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCAmJiBmaXJzdCkge1xuXHRcdFx0XHRcdFx0XHRcdGFjdGl2ZUVkaXRvcj8ucmV2ZWFsTGluZU5lYXJUb3AoZmlyc3QubG9jYXRpb24gaW5zdGFuY2VvZiBQb3NpdGlvbiA/IGZpcnN0LmxvY2F0aW9uLmxpbmVOdW1iZXIgOiBmaXJzdC5sb2NhdGlvbi5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0KCkgPT4geyAvKiBpZ25vcmVkICovIH1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHRlc3RDb3ZlcmFnZVNlcnZpY2UuZmlsdGVyVG9UZXN0LnNldChlbnRyeS50ZXN0SWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSkudGhlbihzZWxlY3RlZCA9PiB7XG5cdFx0XHRpZiAoIXNlbGVjdGVkKSB7XG5cdFx0XHRcdGFjdGl2ZUVkaXRvcj8uc2V0U2Nyb2xsVG9wKHNjcm9sbFRvcCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldmVhbFNjcm9sbEN0cy5kaXNwb3NlKCk7XG5cdFx0XHR0ZXN0Q292ZXJhZ2VTZXJ2aWNlLmZpbHRlclRvVGVzdC5zZXQoc2VsZWN0ZWQgPyBzZWxlY3RlZC50ZXN0SWQgOiBwcmV2aW91c1NlbGVjdGlvbiwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVDb3ZlcmFnZUluRXhwbG9yZXIgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VUb2dnbGVJbkV4cGxvcmVyLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy50b2dnbGVDb3ZlcmFnZUluRXhwbG9yZXJUaXRsZScsIFwiVG9nZ2xlIENvdmVyYWdlIGluIEV4cGxvcmVyXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndGVzdGluZy50b2dnbGVDb3ZlcmFnZUluRXhwbG9yZXJEZXNjJywgJ1RvZ2dsZSB0aGUgZGlzcGxheSBvZiB0ZXN0IGNvdmVyYWdlIGluIHRoZSBGaWxlIEV4cGxvcmVyIHZpZXcuJylcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5UZXN0LFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLnRlc3Rpbmcuc2hvd0NvdmVyYWdlSW5FeHBsb3JlcicsIHRydWUpLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Rlc3RpbmcuaGlkZUNvdmVyYWdlSW5FeHBsb3JlcicsIFwiSGlkZSBDb3ZlcmFnZSBpbiBFeHBsb3JlclwiKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgd2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmlzVGVzdENvdmVyYWdlT3BlbiB9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlnID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbihjb25maWcsIFRlc3RpbmdDb25maWdLZXlzLlNob3dDb3ZlcmFnZUluRXhwbG9yZXIpO1xuXHRcdGNvbmZpZy51cGRhdGVWYWx1ZShUZXN0aW5nQ29uZmlnS2V5cy5TaG93Q292ZXJhZ2VJbkV4cGxvcmVyLCAhdmFsdWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdvVG9OZXh0TWlzc2VkQ292ZXJhZ2VMaW5lIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvdmVyYWdlR29Ub05leHRNaXNzZWRMaW5lLFxuXHRcdFx0dGl0bGU6IEdPX1RPX05FWFRfTUlTU0VEX0xJTkVfVElUTEUsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUyKCd0ZXN0aW5nLmdvVG9OZXh0TWlzc2VkTGluZURlc2MnLCAnTmF2aWdhdGUgdG8gdGhlIG5leHQgbGluZSB0aGF0IGlzIG5vdCBjb3ZlcmVkIGJ5IHRlc3RzLicpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVGVzdCxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dEb3duLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzQ292ZXJhZ2VJbkZpbGUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEFjdGl2ZUVkaXRvckNvbnRleHQsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GOSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgd2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmlzVGVzdENvdmVyYWdlT3BlbiB9LFxuXHRcdFx0XHR7IGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsIHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNDb3ZlcmFnZUluRmlsZSwgZ3JvdXA6ICdjb3ZlcmFnZScsIG9yZGVyOiAyIH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGFjdGl2ZUVkaXRvci5nZXRDb250cmlidXRpb248Q29kZUNvdmVyYWdlRGVjb3JhdGlvbnM+KENvZGVDb3ZlcmFnZURlY29yYXRpb25zLklEKTtcblx0XHRjb250cmlidXRpb24/LmdvVG9OZXh0TWlzc2VkTGluZSgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdvVG9QcmV2aW91c01pc3NlZENvdmVyYWdlTGluZSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUdvVG9QcmV2aW91c01pc3NlZExpbmUsXG5cdFx0XHR0aXRsZTogR09fVE9fUFJFVklPVVNfTUlTU0VEX0xJTkVfVElUTEUsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUyKCd0ZXN0aW5nLmdvVG9QcmV2aW91c01pc3NlZExpbmVEZXNjJywgJ05hdmlnYXRlIHRvIHRoZSBwcmV2aW91cyBsaW5lIHRoYXQgaXMgbm90IGNvdmVyZWQgYnkgdGVzdHMuJylcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5UZXN0LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd1VwLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzQ292ZXJhZ2VJbkZpbGUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IEFjdGl2ZUVkaXRvckNvbnRleHQsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GOSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgd2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmlzVGVzdENvdmVyYWdlT3BlbiB9LFxuXHRcdFx0XHR7IGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsIHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNDb3ZlcmFnZUluRmlsZSwgZ3JvdXA6ICdjb3ZlcmFnZScsIG9yZGVyOiAzIH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGFjdGl2ZUVkaXRvci5nZXRDb250cmlidXRpb248Q29kZUNvdmVyYWdlRGVjb3JhdGlvbnM+KENvZGVDb3ZlcmFnZURlY29yYXRpb25zLklEKTtcblx0XHRjb250cmlidXRpb24/LmdvVG9QcmV2aW91c01pc3NlZExpbmUoKTtcblx0fVxufSk7XG5cbmNsYXNzIEFjdGlvbldpdGhJY29uIGV4dGVuZHMgQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZywgcHVibGljIHJlYWRvbmx5IGljb246IFRoZW1lSWNvbiwgZW5hYmxlZDogYm9vbGVhbiB8IHVuZGVmaW5lZCwgcnVuOiAoKSA9PiB2b2lkLCBwdWJsaWMgaWNvbk9ubHkgPSBmYWxzZSkge1xuXHRcdHN1cGVyKGlkLCB0aXRsZSwgdW5kZWZpbmVkLCBlbmFibGVkLCBydW4pO1xuXHR9XG59XG5cbmNsYXNzIENvZGljb25BY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblxuXHRwdWJsaWMgdGhlbWVJY29uPzogVGhlbWVJY29uO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vcHRpb25zLmxhYmVsICYmIHRoaXMubGFiZWwgJiYgdGhpcy50aGVtZUljb24pIHtcblx0XHRcdGRvbS5yZXNldCh0aGlzLmxhYmVsLCByZW5kZXJJY29uKHRoaXMudGhlbWVJY29uKSwgdGhpcy5hY3Rpb24ubGFiZWwpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZ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
