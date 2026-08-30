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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { createCommandUri, MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import { InvisibleCharacters, isBasicASCII } from "../../../../base/common/strings.js";
import "./unicodeHighlighter.css";
import { EditorAction, EditorContributionInstantiation, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { inUntrustedWorkspace, EditorOption, unicodeHighlightConfigKeys } from "../../../common/config/editorOptions.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { UnicodeHighlighterReasonKind, UnicodeTextModelHighlighter } from "../../../common/services/unicodeTextModelHighlighter.js";
import { IEditorWorkerService } from "../../../common/services/editorWorker.js";
import { HoverAnchorType, HoverParticipantRegistry } from "../../hover/browser/hoverTypes.js";
import { MarkdownHover, renderMarkdownHovers } from "../../hover/browser/markdownHoverParticipant.js";
import { BannerController } from "./bannerController.js";
import * as nls from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { safeIntl } from "../../../../base/common/date.js";
import { isModelDecorationInComment, isModelDecorationInString, isModelDecorationVisible } from "../../../common/viewModel/viewModelDecoration.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
const warningIcon = registerIcon("extensions-warning-message", Codicon.warning, nls.localize("warningIcon", "Icon shown with a warning message in the extensions editor."));
let UnicodeHighlighter = class extends Disposable {
  constructor(_editor, _editorWorkerService, _workspaceTrustService, instantiationService) {
    super();
    this._editor = _editor;
    this._editorWorkerService = _editorWorkerService;
    this._workspaceTrustService = _workspaceTrustService;
    this._highlighter = null;
    this._bannerClosed = false;
    this._updateState = (state) => {
      if (state && state.hasMore) {
        if (this._bannerClosed) {
          return;
        }
        const max = Math.max(state.ambiguousCharacterCount, state.nonBasicAsciiCharacterCount, state.invisibleCharacterCount);
        let data;
        if (state.nonBasicAsciiCharacterCount >= max) {
          data = {
            message: nls.localize("unicodeHighlighting.thisDocumentHasManyNonBasicAsciiUnicodeCharacters", "This document contains many non-basic ASCII unicode characters"),
            command: new DisableHighlightingOfNonBasicAsciiCharactersAction()
          };
        } else if (state.ambiguousCharacterCount >= max) {
          data = {
            message: nls.localize("unicodeHighlighting.thisDocumentHasManyAmbiguousUnicodeCharacters", "This document contains many ambiguous unicode characters"),
            command: new DisableHighlightingOfAmbiguousCharactersAction()
          };
        } else if (state.invisibleCharacterCount >= max) {
          data = {
            message: nls.localize("unicodeHighlighting.thisDocumentHasManyInvisibleUnicodeCharacters", "This document contains many invisible unicode characters"),
            command: new DisableHighlightingOfInvisibleCharactersAction()
          };
        } else {
          throw new Error("Unreachable");
        }
        this._bannerController.show({
          id: "unicodeHighlightBanner",
          message: data.message,
          icon: warningIcon,
          actions: [
            {
              label: data.command.shortLabel,
              href: `command:${data.command.desc.id}`
            }
          ],
          onClose: () => {
            this._bannerClosed = true;
          }
        });
      } else {
        this._bannerController.hide();
      }
    };
    this._bannerController = this._register(instantiationService.createInstance(BannerController, _editor));
    this._register(this._editor.onDidChangeModel(() => {
      this._bannerClosed = false;
      this._updateHighlighter();
    }));
    this._options = _editor.getOption(EditorOption.unicodeHighlighting);
    this._register(_workspaceTrustService.onDidChangeTrust((e) => {
      this._updateHighlighter();
    }));
    this._register(_editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.unicodeHighlighting)) {
        this._options = _editor.getOption(EditorOption.unicodeHighlighting);
        this._updateHighlighter();
      }
    }));
    this._updateHighlighter();
  }
  dispose() {
    if (this._highlighter) {
      this._highlighter.dispose();
      this._highlighter = null;
    }
    super.dispose();
  }
  _updateHighlighter() {
    this._updateState(null);
    if (this._highlighter) {
      this._highlighter.dispose();
      this._highlighter = null;
    }
    if (!this._editor.hasModel()) {
      return;
    }
    const options = resolveOptions(this._workspaceTrustService.isWorkspaceTrusted(), this._options);
    if ([
      options.nonBasicASCII,
      options.ambiguousCharacters,
      options.invisibleCharacters
    ].every((option) => option === false)) {
      return;
    }
    const highlightOptions = {
      nonBasicASCII: options.nonBasicASCII,
      ambiguousCharacters: options.ambiguousCharacters,
      invisibleCharacters: options.invisibleCharacters,
      includeComments: options.includeComments,
      includeStrings: options.includeStrings,
      allowedCodePoints: Object.keys(options.allowedCharacters).map((c) => c.codePointAt(0)),
      allowedLocales: Object.keys(options.allowedLocales).map((locale) => {
        if (locale === "_os") {
          const osLocale = safeIntl.NumberFormat().value.resolvedOptions().locale;
          return osLocale;
        } else if (locale === "_vscode") {
          return platform.language;
        }
        return locale;
      })
    };
    if (this._editorWorkerService.canComputeUnicodeHighlights(this._editor.getModel().uri)) {
      this._highlighter = new DocumentUnicodeHighlighter(this._editor, highlightOptions, this._updateState, this._editorWorkerService);
    } else {
      this._highlighter = new ViewportUnicodeHighlighter(this._editor, highlightOptions, this._updateState);
    }
  }
  getDecorationInfo(decoration) {
    if (this._highlighter) {
      return this._highlighter.getDecorationInfo(decoration);
    }
    return null;
  }
};
UnicodeHighlighter.ID = "editor.contrib.unicodeHighlighter";
UnicodeHighlighter = __decorateClass([
  __decorateParam(1, IEditorWorkerService),
  __decorateParam(2, IWorkspaceTrustManagementService),
  __decorateParam(3, IInstantiationService)
], UnicodeHighlighter);
function resolveOptions(trusted, options) {
  return {
    nonBasicASCII: options.nonBasicASCII === inUntrustedWorkspace ? !trusted : options.nonBasicASCII,
    ambiguousCharacters: options.ambiguousCharacters,
    invisibleCharacters: options.invisibleCharacters,
    includeComments: options.includeComments === inUntrustedWorkspace ? !trusted : options.includeComments,
    includeStrings: options.includeStrings === inUntrustedWorkspace ? !trusted : options.includeStrings,
    allowedCharacters: options.allowedCharacters,
    allowedLocales: options.allowedLocales
  };
}
let DocumentUnicodeHighlighter = class extends Disposable {
  constructor(_editor, _options, _updateState, _editorWorkerService) {
    super();
    this._editor = _editor;
    this._options = _options;
    this._updateState = _updateState;
    this._editorWorkerService = _editorWorkerService;
    this._model = this._editor.getModel();
    this._decorations = this._editor.createDecorationsCollection();
    this._updateSoon = this._register(new RunOnceScheduler(() => this._update(), 250));
    this._register(this._editor.onDidChangeModelContent(() => {
      this._updateSoon.schedule();
    }));
    this._updateSoon.schedule();
  }
  dispose() {
    this._decorations.clear();
    super.dispose();
  }
  _update() {
    if (this._model.isDisposed()) {
      return;
    }
    if (!this._model.mightContainNonBasicASCII()) {
      this._decorations.clear();
      return;
    }
    const modelVersionId = this._model.getVersionId();
    this._editorWorkerService.computedUnicodeHighlights(this._model.uri, this._options).then((info) => {
      if (this._model.isDisposed()) {
        return;
      }
      if (this._model.getVersionId() !== modelVersionId) {
        return;
      }
      this._updateState(info);
      const decorations = [];
      if (!info.hasMore) {
        for (const range of info.ranges) {
          decorations.push({
            range,
            options: Decorations.instance.getDecorationFromOptions(this._options)
          });
        }
      }
      this._decorations.set(decorations);
    });
  }
  getDecorationInfo(decoration) {
    if (!this._decorations.has(decoration)) {
      return null;
    }
    const model = this._editor.getModel();
    if (!isModelDecorationVisible(model, decoration)) {
      return null;
    }
    const text = model.getValueInRange(decoration.range);
    return {
      reason: computeReason(text, this._options),
      inComment: isModelDecorationInComment(model, decoration),
      inString: isModelDecorationInString(model, decoration)
    };
  }
};
DocumentUnicodeHighlighter = __decorateClass([
  __decorateParam(3, IEditorWorkerService)
], DocumentUnicodeHighlighter);
class ViewportUnicodeHighlighter extends Disposable {
  constructor(_editor, _options, _updateState) {
    super();
    this._editor = _editor;
    this._options = _options;
    this._updateState = _updateState;
    this._model = this._editor.getModel();
    this._decorations = this._editor.createDecorationsCollection();
    this._updateSoon = this._register(new RunOnceScheduler(() => this._update(), 250));
    this._register(this._editor.onDidLayoutChange(() => {
      this._updateSoon.schedule();
    }));
    this._register(this._editor.onDidScrollChange(() => {
      this._updateSoon.schedule();
    }));
    this._register(this._editor.onDidChangeHiddenAreas(() => {
      this._updateSoon.schedule();
    }));
    this._register(this._editor.onDidChangeModelContent(() => {
      this._updateSoon.schedule();
    }));
    this._updateSoon.schedule();
  }
  dispose() {
    this._decorations.clear();
    super.dispose();
  }
  _update() {
    if (this._model.isDisposed()) {
      return;
    }
    if (!this._model.mightContainNonBasicASCII()) {
      this._decorations.clear();
      return;
    }
    const ranges = this._editor.getVisibleRanges();
    const decorations = [];
    const totalResult = {
      ranges: [],
      ambiguousCharacterCount: 0,
      invisibleCharacterCount: 0,
      nonBasicAsciiCharacterCount: 0,
      hasMore: false
    };
    for (const range of ranges) {
      const result = UnicodeTextModelHighlighter.computeUnicodeHighlights(this._model, this._options, range);
      for (const r of result.ranges) {
        totalResult.ranges.push(r);
      }
      totalResult.ambiguousCharacterCount += totalResult.ambiguousCharacterCount;
      totalResult.invisibleCharacterCount += totalResult.invisibleCharacterCount;
      totalResult.nonBasicAsciiCharacterCount += totalResult.nonBasicAsciiCharacterCount;
      totalResult.hasMore = totalResult.hasMore || result.hasMore;
    }
    if (!totalResult.hasMore) {
      for (const range of totalResult.ranges) {
        decorations.push({ range, options: Decorations.instance.getDecorationFromOptions(this._options) });
      }
    }
    this._updateState(totalResult);
    this._decorations.set(decorations);
  }
  getDecorationInfo(decoration) {
    if (!this._decorations.has(decoration)) {
      return null;
    }
    const model = this._editor.getModel();
    const text = model.getValueInRange(decoration.range);
    if (!isModelDecorationVisible(model, decoration)) {
      return null;
    }
    return {
      reason: computeReason(text, this._options),
      inComment: isModelDecorationInComment(model, decoration),
      inString: isModelDecorationInString(model, decoration)
    };
  }
}
class UnicodeHighlighterHover {
  constructor(owner, range, decoration) {
    this.owner = owner;
    this.range = range;
    this.decoration = decoration;
  }
  isValidForHoverAnchor(anchor) {
    return anchor.type === HoverAnchorType.Range && this.range.startColumn <= anchor.range.startColumn && this.range.endColumn >= anchor.range.endColumn;
  }
}
const configureUnicodeHighlightOptionsStr = nls.localize("unicodeHighlight.configureUnicodeHighlightOptions", "Configure Unicode Highlight Options");
let UnicodeHighlighterHoverParticipant = class {
  constructor(_editor, _markdownRendererService) {
    this._editor = _editor;
    this._markdownRendererService = _markdownRendererService;
    this.hoverOrdinal = 5;
  }
  computeSync(anchor, lineDecorations) {
    if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
      return [];
    }
    const model = this._editor.getModel();
    const unicodeHighlighter = this._editor.getContribution(UnicodeHighlighter.ID);
    if (!unicodeHighlighter) {
      return [];
    }
    const result = [];
    const existedReason = /* @__PURE__ */ new Set();
    let index = 300;
    for (const d of lineDecorations) {
      const highlightInfo = unicodeHighlighter.getDecorationInfo(d);
      if (!highlightInfo) {
        continue;
      }
      const char = model.getValueInRange(d.range);
      const codePoint = char.codePointAt(0);
      const codePointStr = formatCodePointMarkdown(codePoint);
      let reason;
      switch (highlightInfo.reason.kind) {
        case UnicodeHighlighterReasonKind.Ambiguous: {
          if (isBasicASCII(highlightInfo.reason.confusableWith)) {
            reason = nls.localize(
              "unicodeHighlight.characterIsAmbiguousASCII",
              "The character {0} could be confused with the ASCII character {1}, which is more common in source code.",
              codePointStr,
              formatCodePointMarkdown(highlightInfo.reason.confusableWith.codePointAt(0))
            );
          } else {
            reason = nls.localize(
              "unicodeHighlight.characterIsAmbiguous",
              "The character {0} could be confused with the character {1}, which is more common in source code.",
              codePointStr,
              formatCodePointMarkdown(highlightInfo.reason.confusableWith.codePointAt(0))
            );
          }
          break;
        }
        case UnicodeHighlighterReasonKind.Invisible:
          reason = nls.localize(
            "unicodeHighlight.characterIsInvisible",
            "The character {0} is invisible.",
            codePointStr
          );
          break;
        case UnicodeHighlighterReasonKind.NonBasicAscii:
          reason = nls.localize(
            "unicodeHighlight.characterIsNonBasicAscii",
            "The character {0} is not a basic ASCII character.",
            codePointStr
          );
          break;
      }
      if (existedReason.has(reason)) {
        continue;
      }
      existedReason.add(reason);
      const adjustSettingsArgs = {
        codePoint,
        reason: highlightInfo.reason,
        inComment: highlightInfo.inComment,
        inString: highlightInfo.inString
      };
      const adjustSettings = nls.localize("unicodeHighlight.adjustSettings", "Adjust settings");
      const uri = createCommandUri(ShowExcludeOptions.ID, adjustSettingsArgs);
      const markdown = new MarkdownString("", true).appendMarkdown(reason).appendText(" ").appendLink(uri, adjustSettings, configureUnicodeHighlightOptionsStr);
      result.push(new MarkdownHover(this, d.range, [markdown], false, index++));
    }
    return result;
  }
  renderHoverParts(context, hoverParts) {
    return renderMarkdownHovers(context, hoverParts, this._editor, this._markdownRendererService);
  }
  getAccessibleContent(hoverPart) {
    return hoverPart.contents.map((c) => c.value).join("\n");
  }
};
UnicodeHighlighterHoverParticipant = __decorateClass([
  __decorateParam(1, IMarkdownRendererService)
], UnicodeHighlighterHoverParticipant);
function codePointToHex(codePoint) {
  return `U+${codePoint.toString(16).padStart(4, "0")}`;
}
function formatCodePointMarkdown(codePoint) {
  let value = `\`${codePointToHex(codePoint)}\``;
  if (!InvisibleCharacters.isInvisibleCharacter(codePoint)) {
    value += ` "${`${renderCodePointAsInlineCode(codePoint)}`}"`;
  }
  return value;
}
function renderCodePointAsInlineCode(codePoint) {
  if (codePoint === CharCode.BackTick) {
    return "`` ` ``";
  }
  return "`" + String.fromCodePoint(codePoint) + "`";
}
function computeReason(char, options) {
  return UnicodeTextModelHighlighter.computeUnicodeHighlightReason(char, options);
}
const _Decorations = class _Decorations {
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  getDecorationFromOptions(options) {
    return this.getDecoration(!options.includeComments, !options.includeStrings);
  }
  getDecoration(hideInComments, hideInStrings) {
    const key = `${hideInComments}${hideInStrings}`;
    let options = this.map.get(key);
    if (!options) {
      options = ModelDecorationOptions.createDynamic({
        description: "unicode-highlight",
        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        className: "unicode-highlight",
        showIfCollapsed: true,
        overviewRuler: null,
        minimap: null,
        hideInCommentTokens: hideInComments,
        hideInStringTokens: hideInStrings
      });
      this.map.set(key, options);
    }
    return options;
  }
};
_Decorations.instance = new _Decorations();
let Decorations = _Decorations;
class DisableHighlightingInCommentsAction extends EditorAction {
  constructor() {
    super({
      id: DisableHighlightingOfAmbiguousCharactersAction.ID,
      label: nls.localize2("action.unicodeHighlight.disableHighlightingInComments", "Disable highlighting of characters in comments"),
      precondition: void 0
    });
    this.shortLabel = nls.localize("unicodeHighlight.disableHighlightingInComments.shortLabel", "Disable Highlight In Comments");
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    if (configurationService) {
      this.runAction(configurationService);
    }
  }
  async runAction(configurationService) {
    await configurationService.updateValue(unicodeHighlightConfigKeys.includeComments, false, ConfigurationTarget.USER);
  }
}
DisableHighlightingInCommentsAction.ID = "editor.action.unicodeHighlight.disableHighlightingInComments";
class DisableHighlightingInStringsAction extends EditorAction {
  constructor() {
    super({
      id: DisableHighlightingOfAmbiguousCharactersAction.ID,
      label: nls.localize2("action.unicodeHighlight.disableHighlightingInStrings", "Disable highlighting of characters in strings"),
      precondition: void 0
    });
    this.shortLabel = nls.localize("unicodeHighlight.disableHighlightingInStrings.shortLabel", "Disable Highlight In Strings");
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    if (configurationService) {
      this.runAction(configurationService);
    }
  }
  async runAction(configurationService) {
    await configurationService.updateValue(unicodeHighlightConfigKeys.includeStrings, false, ConfigurationTarget.USER);
  }
}
DisableHighlightingInStringsAction.ID = "editor.action.unicodeHighlight.disableHighlightingInStrings";
const _DisableHighlightingOfAmbiguousCharactersAction = class _DisableHighlightingOfAmbiguousCharactersAction extends Action2 {
  constructor() {
    super({
      id: _DisableHighlightingOfAmbiguousCharactersAction.ID,
      title: nls.localize2("action.unicodeHighlight.disableHighlightingOfAmbiguousCharacters", "Disable highlighting of ambiguous characters"),
      precondition: void 0,
      f1: false
    });
    this.shortLabel = nls.localize("unicodeHighlight.disableHighlightingOfAmbiguousCharacters.shortLabel", "Disable Ambiguous Highlight");
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    if (configurationService) {
      this.runAction(configurationService);
    }
  }
  async runAction(configurationService) {
    await configurationService.updateValue(unicodeHighlightConfigKeys.ambiguousCharacters, false, ConfigurationTarget.USER);
  }
};
_DisableHighlightingOfAmbiguousCharactersAction.ID = "editor.action.unicodeHighlight.disableHighlightingOfAmbiguousCharacters";
let DisableHighlightingOfAmbiguousCharactersAction = _DisableHighlightingOfAmbiguousCharactersAction;
const _DisableHighlightingOfInvisibleCharactersAction = class _DisableHighlightingOfInvisibleCharactersAction extends Action2 {
  constructor() {
    super({
      id: _DisableHighlightingOfInvisibleCharactersAction.ID,
      title: nls.localize2("action.unicodeHighlight.disableHighlightingOfInvisibleCharacters", "Disable highlighting of invisible characters"),
      precondition: void 0,
      f1: false
    });
    this.shortLabel = nls.localize("unicodeHighlight.disableHighlightingOfInvisibleCharacters.shortLabel", "Disable Invisible Highlight");
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    if (configurationService) {
      this.runAction(configurationService);
    }
  }
  async runAction(configurationService) {
    await configurationService.updateValue(unicodeHighlightConfigKeys.invisibleCharacters, false, ConfigurationTarget.USER);
  }
};
_DisableHighlightingOfInvisibleCharactersAction.ID = "editor.action.unicodeHighlight.disableHighlightingOfInvisibleCharacters";
let DisableHighlightingOfInvisibleCharactersAction = _DisableHighlightingOfInvisibleCharactersAction;
const _DisableHighlightingOfNonBasicAsciiCharactersAction = class _DisableHighlightingOfNonBasicAsciiCharactersAction extends Action2 {
  constructor() {
    super({
      id: _DisableHighlightingOfNonBasicAsciiCharactersAction.ID,
      title: nls.localize2("action.unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters", "Disable highlighting of non basic ASCII characters"),
      precondition: void 0,
      f1: false
    });
    this.shortLabel = nls.localize("unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters.shortLabel", "Disable Non ASCII Highlight");
  }
  async run(accessor, editor) {
    const configurationService = accessor.get(IConfigurationService);
    if (configurationService) {
      this.runAction(configurationService);
    }
  }
  async runAction(configurationService) {
    await configurationService.updateValue(unicodeHighlightConfigKeys.nonBasicASCII, false, ConfigurationTarget.USER);
  }
};
_DisableHighlightingOfNonBasicAsciiCharactersAction.ID = "editor.action.unicodeHighlight.disableHighlightingOfNonBasicAsciiCharacters";
let DisableHighlightingOfNonBasicAsciiCharactersAction = _DisableHighlightingOfNonBasicAsciiCharactersAction;
const _ShowExcludeOptions = class _ShowExcludeOptions extends Action2 {
  constructor() {
    super({
      id: _ShowExcludeOptions.ID,
      title: nls.localize2("action.unicodeHighlight.showExcludeOptions", "Show Exclude Options"),
      precondition: void 0,
      f1: false
    });
  }
  async run(accessor, args) {
    const { codePoint, reason, inString, inComment } = args;
    const char = String.fromCodePoint(codePoint);
    const quickPickService = accessor.get(IQuickInputService);
    const configurationService = accessor.get(IConfigurationService);
    function getExcludeCharFromBeingHighlightedLabel(codePoint2) {
      if (InvisibleCharacters.isInvisibleCharacter(codePoint2)) {
        return nls.localize("unicodeHighlight.excludeInvisibleCharFromBeingHighlighted", "Exclude {0} (invisible character) from being highlighted", codePointToHex(codePoint2));
      }
      return nls.localize("unicodeHighlight.excludeCharFromBeingHighlighted", "Exclude {0} from being highlighted", `${codePointToHex(codePoint2)} "${char}"`);
    }
    const options = [];
    if (reason.kind === UnicodeHighlighterReasonKind.Ambiguous) {
      for (const locale of reason.notAmbiguousInLocales) {
        options.push({
          label: nls.localize("unicodeHighlight.allowCommonCharactersInLanguage", 'Allow unicode characters that are more common in the language "{0}".', locale),
          run: async () => {
            excludeLocaleFromBeingHighlighted(configurationService, [locale]);
          }
        });
      }
    }
    options.push(
      {
        label: getExcludeCharFromBeingHighlightedLabel(codePoint),
        run: () => excludeCharFromBeingHighlighted(configurationService, [codePoint])
      }
    );
    if (inComment) {
      const action = new DisableHighlightingInCommentsAction();
      options.push({ label: action.label, run: async () => action.runAction(configurationService) });
    } else if (inString) {
      const action = new DisableHighlightingInStringsAction();
      options.push({ label: action.label, run: async () => action.runAction(configurationService) });
    }
    function getTitle(options2) {
      return typeof options2.desc.title === "string" ? options2.desc.title : options2.desc.title.value;
    }
    if (reason.kind === UnicodeHighlighterReasonKind.Ambiguous) {
      const action = new DisableHighlightingOfAmbiguousCharactersAction();
      options.push({ label: getTitle(action), run: async () => action.runAction(configurationService) });
    } else if (reason.kind === UnicodeHighlighterReasonKind.Invisible) {
      const action = new DisableHighlightingOfInvisibleCharactersAction();
      options.push({ label: getTitle(action), run: async () => action.runAction(configurationService) });
    } else if (reason.kind === UnicodeHighlighterReasonKind.NonBasicAscii) {
      const action = new DisableHighlightingOfNonBasicAsciiCharactersAction();
      options.push({ label: getTitle(action), run: async () => action.runAction(configurationService) });
    } else {
      expectNever(reason);
    }
    const result = await quickPickService.pick(
      options,
      { title: configureUnicodeHighlightOptionsStr }
    );
    if (result) {
      await result.run();
    }
  }
};
_ShowExcludeOptions.ID = "editor.action.unicodeHighlight.showExcludeOptions";
let ShowExcludeOptions = _ShowExcludeOptions;
async function excludeCharFromBeingHighlighted(configurationService, charCodes) {
  const existingValue = configurationService.getValue(unicodeHighlightConfigKeys.allowedCharacters);
  let value;
  if (typeof existingValue === "object" && existingValue) {
    value = existingValue;
  } else {
    value = {};
  }
  for (const charCode of charCodes) {
    value[String.fromCodePoint(charCode)] = true;
  }
  await configurationService.updateValue(unicodeHighlightConfigKeys.allowedCharacters, value, ConfigurationTarget.USER);
}
async function excludeLocaleFromBeingHighlighted(configurationService, locales) {
  const existingValue = configurationService.inspect(unicodeHighlightConfigKeys.allowedLocales).user?.value;
  let value;
  if (typeof existingValue === "object" && existingValue) {
    value = Object.assign({}, existingValue);
  } else {
    value = {};
  }
  for (const locale of locales) {
    value[locale] = true;
  }
  await configurationService.updateValue(unicodeHighlightConfigKeys.allowedLocales, value, ConfigurationTarget.USER);
}
function expectNever(value) {
  throw new Error(`Unexpected value: ${value}`);
}
registerAction2(DisableHighlightingOfAmbiguousCharactersAction);
registerAction2(DisableHighlightingOfInvisibleCharactersAction);
registerAction2(DisableHighlightingOfNonBasicAsciiCharactersAction);
registerAction2(ShowExcludeOptions);
registerEditorContribution(UnicodeHighlighter.ID, UnicodeHighlighter, EditorContributionInstantiation.AfterFirstRender);
HoverParticipantRegistry.register(UnicodeHighlighterHoverParticipant);
export {
  DisableHighlightingInCommentsAction,
  DisableHighlightingInStringsAction,
  DisableHighlightingOfAmbiguousCharactersAction,
  DisableHighlightingOfInvisibleCharactersAction,
  DisableHighlightingOfNonBasicAsciiCharactersAction,
  ShowExcludeOptions,
  UnicodeHighlighter,
  UnicodeHighlighterHover,
  UnicodeHighlighterHoverParticipant,
  warningIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHVuaWNvZGVIaWdobGlnaHRlclxcYnJvd3NlclxcdW5pY29kZUhpZ2hsaWdodGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbW1hbmRVcmksIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJbnZpc2libGVDaGFyYWN0ZXJzLCBpc0Jhc2ljQVNDSUkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCAnLi91bmljb2RlSGlnaGxpZ2h0ZXIuY3NzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEluVW50cnVzdGVkV29ya3NwYWNlLCBpblVudHJ1c3RlZFdvcmtzcGFjZSwgRWRpdG9yT3B0aW9uLCBJbnRlcm5hbFVuaWNvZGVIaWdobGlnaHRPcHRpb25zLCB1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElNb2RlbERlY29yYXRpb24sIElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSVRleHRNb2RlbCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zLCBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb24sIFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbktpbmQsIFVuaWNvZGVUZXh0TW9kZWxIaWdobGlnaHRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy91bmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UsIElVbmljb2RlSGlnaGxpZ2h0c1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgSG92ZXJBbmNob3IsIEhvdmVyQW5jaG9yVHlwZSwgSG92ZXJQYXJ0aWNpcGFudFJlZ2lzdHJ5LCBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudCwgSUVkaXRvckhvdmVyUmVuZGVyQ29udGV4dCwgSUhvdmVyUGFydCwgSVJlbmRlcmVkSG92ZXJQYXJ0cyB9IGZyb20gJy4uLy4uL2hvdmVyL2Jyb3dzZXIvaG92ZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93bkhvdmVyLCByZW5kZXJNYXJrZG93bkhvdmVycyB9IGZyb20gJy4uLy4uL2hvdmVyL2Jyb3dzZXIvbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LmpzJztcbmltcG9ydCB7IEJhbm5lckNvbnRyb2xsZXIgfSBmcm9tICcuL2Jhbm5lckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgaXNNb2RlbERlY29yYXRpb25JbkNvbW1lbnQsIGlzTW9kZWxEZWNvcmF0aW9uSW5TdHJpbmcsIGlzTW9kZWxEZWNvcmF0aW9uVmlzaWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld01vZGVsRGVjb3JhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuXG5leHBvcnQgY29uc3Qgd2FybmluZ0ljb24gPSByZWdpc3Rlckljb24oJ2V4dGVuc2lvbnMtd2FybmluZy1tZXNzYWdlJywgQ29kaWNvbi53YXJuaW5nLCBubHMubG9jYWxpemUoJ3dhcm5pbmdJY29uJywgJ0ljb24gc2hvd24gd2l0aCBhIHdhcm5pbmcgbWVzc2FnZSBpbiB0aGUgZXh0ZW5zaW9ucyBlZGl0b3IuJykpO1xuXG5leHBvcnQgY2xhc3MgVW5pY29kZUhpZ2hsaWdodGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLnVuaWNvZGVIaWdobGlnaHRlcic7XG5cblx0cHJpdmF0ZSBfaGlnaGxpZ2h0ZXI6IERvY3VtZW50VW5pY29kZUhpZ2hsaWdodGVyIHwgVmlld3BvcnRVbmljb2RlSGlnaGxpZ2h0ZXIgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfb3B0aW9uczogSW50ZXJuYWxVbmljb2RlSGlnaGxpZ2h0T3B0aW9ucztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9iYW5uZXJDb250cm9sbGVyOiBCYW5uZXJDb250cm9sbGVyO1xuXHRwcml2YXRlIF9iYW5uZXJDbG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJRWRpdG9yV29ya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JXb3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9iYW5uZXJDb250cm9sbGVyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQmFubmVyQ29udHJvbGxlciwgX2VkaXRvcikpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYmFubmVyQ2xvc2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLl91cGRhdGVIaWdobGlnaHRlcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX29wdGlvbnMgPSBfZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24udW5pY29kZUhpZ2hsaWdodGluZyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihfd29ya3NwYWNlVHJ1c3RTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QoZSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVIaWdobGlnaHRlcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKF9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24udW5pY29kZUhpZ2hsaWdodGluZykpIHtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucyA9IF9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi51bmljb2RlSGlnaGxpZ2h0aW5nKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlSGlnaGxpZ2h0ZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl91cGRhdGVIaWdobGlnaHRlcigpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2hpZ2hsaWdodGVyKSB7XG5cdFx0XHR0aGlzLl9oaWdobGlnaHRlci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9oaWdobGlnaHRlciA9IG51bGw7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZVN0YXRlID0gKHN0YXRlOiBJVW5pY29kZUhpZ2hsaWdodHNSZXN1bHQgfCBudWxsKTogdm9pZCA9PiB7XG5cdFx0aWYgKHN0YXRlICYmIHN0YXRlLmhhc01vcmUpIHtcblx0XHRcdGlmICh0aGlzLl9iYW5uZXJDbG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUaGlzIGRvY3VtZW50IGNvbnRhaW5zIG1hbnkgbm9uLWJhc2ljIEFTQ0lJIGNoYXJhY3RlcnMuXG5cdFx0XHRjb25zdCBtYXggPSBNYXRoLm1heChzdGF0ZS5hbWJpZ3VvdXNDaGFyYWN0ZXJDb3VudCwgc3RhdGUubm9uQmFzaWNBc2NpaUNoYXJhY3RlckNvdW50LCBzdGF0ZS5pbnZpc2libGVDaGFyYWN0ZXJDb3VudCk7XG5cblx0XHRcdGxldCBkYXRhO1xuXHRcdFx0aWYgKHN0YXRlLm5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJDb3VudCA+PSBtYXgpIHtcblx0XHRcdFx0ZGF0YSA9IHtcblx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHRpbmcudGhpc0RvY3VtZW50SGFzTWFueU5vbkJhc2ljQXNjaWlVbmljb2RlQ2hhcmFjdGVycycsICdUaGlzIGRvY3VtZW50IGNvbnRhaW5zIG1hbnkgbm9uLWJhc2ljIEFTQ0lJIHVuaWNvZGUgY2hhcmFjdGVycycpLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IG5ldyBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZOb25CYXNpY0FzY2lpQ2hhcmFjdGVyc0FjdGlvbigpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0ZS5hbWJpZ3VvdXNDaGFyYWN0ZXJDb3VudCA+PSBtYXgpIHtcblx0XHRcdFx0ZGF0YSA9IHtcblx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHRpbmcudGhpc0RvY3VtZW50SGFzTWFueUFtYmlndW91c1VuaWNvZGVDaGFyYWN0ZXJzJywgJ1RoaXMgZG9jdW1lbnQgY29udGFpbnMgbWFueSBhbWJpZ3VvdXMgdW5pY29kZSBjaGFyYWN0ZXJzJyksXG5cdFx0XHRcdFx0Y29tbWFuZDogbmV3IERpc2FibGVIaWdobGlnaHRpbmdPZkFtYmlndW91c0NoYXJhY3RlcnNBY3Rpb24oKSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAoc3RhdGUuaW52aXNpYmxlQ2hhcmFjdGVyQ291bnQgPj0gbWF4KSB7XG5cdFx0XHRcdGRhdGEgPSB7XG5cdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0aW5nLnRoaXNEb2N1bWVudEhhc01hbnlJbnZpc2libGVVbmljb2RlQ2hhcmFjdGVycycsICdUaGlzIGRvY3VtZW50IGNvbnRhaW5zIG1hbnkgaW52aXNpYmxlIHVuaWNvZGUgY2hhcmFjdGVycycpLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IG5ldyBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZJbnZpc2libGVDaGFyYWN0ZXJzQWN0aW9uKCksXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VucmVhY2hhYmxlJyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2Jhbm5lckNvbnRyb2xsZXIuc2hvdyh7XG5cdFx0XHRcdGlkOiAndW5pY29kZUhpZ2hsaWdodEJhbm5lcicsXG5cdFx0XHRcdG1lc3NhZ2U6IGRhdGEubWVzc2FnZSxcblx0XHRcdFx0aWNvbjogd2FybmluZ0ljb24sXG5cdFx0XHRcdGFjdGlvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogZGF0YS5jb21tYW5kLnNob3J0TGFiZWwsXG5cdFx0XHRcdFx0XHRocmVmOiBgY29tbWFuZDoke2RhdGEuY29tbWFuZC5kZXNjLmlkfWBcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdG9uQ2xvc2U6ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9iYW5uZXJDbG9zZWQgPSB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2Jhbm5lckNvbnRyb2xsZXIuaGlkZSgpO1xuXHRcdH1cblx0fTtcblxuXHRwcml2YXRlIF91cGRhdGVIaWdobGlnaHRlcigpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGVTdGF0ZShudWxsKTtcblxuXHRcdGlmICh0aGlzLl9oaWdobGlnaHRlcikge1xuXHRcdFx0dGhpcy5faGlnaGxpZ2h0ZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5faGlnaGxpZ2h0ZXIgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG9wdGlvbnMgPSByZXNvbHZlT3B0aW9ucyh0aGlzLl93b3Jrc3BhY2VUcnVzdFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCksIHRoaXMuX29wdGlvbnMpO1xuXG5cdFx0aWYgKFxuXHRcdFx0W1xuXHRcdFx0XHRvcHRpb25zLm5vbkJhc2ljQVNDSUksXG5cdFx0XHRcdG9wdGlvbnMuYW1iaWd1b3VzQ2hhcmFjdGVycyxcblx0XHRcdFx0b3B0aW9ucy5pbnZpc2libGVDaGFyYWN0ZXJzLFxuXHRcdFx0XS5ldmVyeSgob3B0aW9uKSA9PiBvcHRpb24gPT09IGZhbHNlKVxuXHRcdCkge1xuXHRcdFx0Ly8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgdGhlIGZlYXR1cmUgaXMgZnVsbHkgZGlzYWJsZWRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoaWdobGlnaHRPcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zID0ge1xuXHRcdFx0bm9uQmFzaWNBU0NJSTogb3B0aW9ucy5ub25CYXNpY0FTQ0lJLFxuXHRcdFx0YW1iaWd1b3VzQ2hhcmFjdGVyczogb3B0aW9ucy5hbWJpZ3VvdXNDaGFyYWN0ZXJzLFxuXHRcdFx0aW52aXNpYmxlQ2hhcmFjdGVyczogb3B0aW9ucy5pbnZpc2libGVDaGFyYWN0ZXJzLFxuXHRcdFx0aW5jbHVkZUNvbW1lbnRzOiBvcHRpb25zLmluY2x1ZGVDb21tZW50cyxcblx0XHRcdGluY2x1ZGVTdHJpbmdzOiBvcHRpb25zLmluY2x1ZGVTdHJpbmdzLFxuXHRcdFx0YWxsb3dlZENvZGVQb2ludHM6IE9iamVjdC5rZXlzKG9wdGlvbnMuYWxsb3dlZENoYXJhY3RlcnMpLm1hcChjID0+IGMuY29kZVBvaW50QXQoMCkhKSxcblx0XHRcdGFsbG93ZWRMb2NhbGVzOiBPYmplY3Qua2V5cyhvcHRpb25zLmFsbG93ZWRMb2NhbGVzKS5tYXAobG9jYWxlID0+IHtcblx0XHRcdFx0aWYgKGxvY2FsZSA9PT0gJ19vcycpIHtcblx0XHRcdFx0XHRjb25zdCBvc0xvY2FsZSA9IHNhZmVJbnRsLk51bWJlckZvcm1hdCgpLnZhbHVlLnJlc29sdmVkT3B0aW9ucygpLmxvY2FsZTtcblx0XHRcdFx0XHRyZXR1cm4gb3NMb2NhbGU7XG5cdFx0XHRcdH0gZWxzZSBpZiAobG9jYWxlID09PSAnX3ZzY29kZScpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGxhdGZvcm0ubGFuZ3VhZ2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGxvY2FsZTtcblx0XHRcdH0pLFxuXHRcdH07XG5cblx0XHRpZiAodGhpcy5fZWRpdG9yV29ya2VyU2VydmljZS5jYW5Db21wdXRlVW5pY29kZUhpZ2hsaWdodHModGhpcy5fZWRpdG9yLmdldE1vZGVsKCkudXJpKSkge1xuXHRcdFx0dGhpcy5faGlnaGxpZ2h0ZXIgPSBuZXcgRG9jdW1lbnRVbmljb2RlSGlnaGxpZ2h0ZXIodGhpcy5fZWRpdG9yLCBoaWdobGlnaHRPcHRpb25zLCB0aGlzLl91cGRhdGVTdGF0ZSwgdGhpcy5fZWRpdG9yV29ya2VyU2VydmljZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2hpZ2hsaWdodGVyID0gbmV3IFZpZXdwb3J0VW5pY29kZUhpZ2hsaWdodGVyKHRoaXMuX2VkaXRvciwgaGlnaGxpZ2h0T3B0aW9ucywgdGhpcy5fdXBkYXRlU3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXREZWNvcmF0aW9uSW5mbyhkZWNvcmF0aW9uOiBJTW9kZWxEZWNvcmF0aW9uKTogVW5pY29kZUhpZ2hsaWdodGVyRGVjb3JhdGlvbkluZm8gfCBudWxsIHtcblx0XHRpZiAodGhpcy5faGlnaGxpZ2h0ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLl9oaWdobGlnaHRlci5nZXREZWNvcmF0aW9uSW5mbyhkZWNvcmF0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBVbmljb2RlSGlnaGxpZ2h0ZXJEZWNvcmF0aW9uSW5mbyB7XG5cdHJlYXNvbjogVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uO1xuXHRpbkNvbW1lbnQ6IGJvb2xlYW47XG5cdGluU3RyaW5nOiBib29sZWFuO1xufVxuXG50eXBlIFJlc29sdmU8VD4gPVxuXHRUIGV4dGVuZHMgSW5VbnRydXN0ZWRXb3Jrc3BhY2UgPyBuZXZlclxuXHQ6IFQgZXh0ZW5kcyAnYXV0bycgPyBuZXZlciA6IFQ7XG5cbnR5cGUgUmVzb2x2ZWRPcHRpb25zID0geyBbVEtleSBpbiBrZXlvZiBJbnRlcm5hbFVuaWNvZGVIaWdobGlnaHRPcHRpb25zXTogUmVzb2x2ZTxJbnRlcm5hbFVuaWNvZGVIaWdobGlnaHRPcHRpb25zW1RLZXldPiB9O1xuXG5mdW5jdGlvbiByZXNvbHZlT3B0aW9ucyh0cnVzdGVkOiBib29sZWFuLCBvcHRpb25zOiBJbnRlcm5hbFVuaWNvZGVIaWdobGlnaHRPcHRpb25zKTogUmVzb2x2ZWRPcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHRub25CYXNpY0FTQ0lJOiBvcHRpb25zLm5vbkJhc2ljQVNDSUkgPT09IGluVW50cnVzdGVkV29ya3NwYWNlID8gIXRydXN0ZWQgOiBvcHRpb25zLm5vbkJhc2ljQVNDSUksXG5cdFx0YW1iaWd1b3VzQ2hhcmFjdGVyczogb3B0aW9ucy5hbWJpZ3VvdXNDaGFyYWN0ZXJzLFxuXHRcdGludmlzaWJsZUNoYXJhY3RlcnM6IG9wdGlvbnMuaW52aXNpYmxlQ2hhcmFjdGVycyxcblx0XHRpbmNsdWRlQ29tbWVudHM6IG9wdGlvbnMuaW5jbHVkZUNvbW1lbnRzID09PSBpblVudHJ1c3RlZFdvcmtzcGFjZSA/ICF0cnVzdGVkIDogb3B0aW9ucy5pbmNsdWRlQ29tbWVudHMsXG5cdFx0aW5jbHVkZVN0cmluZ3M6IG9wdGlvbnMuaW5jbHVkZVN0cmluZ3MgPT09IGluVW50cnVzdGVkV29ya3NwYWNlID8gIXRydXN0ZWQgOiBvcHRpb25zLmluY2x1ZGVTdHJpbmdzLFxuXHRcdGFsbG93ZWRDaGFyYWN0ZXJzOiBvcHRpb25zLmFsbG93ZWRDaGFyYWN0ZXJzLFxuXHRcdGFsbG93ZWRMb2NhbGVzOiBvcHRpb25zLmFsbG93ZWRMb2NhbGVzLFxuXHR9O1xufVxuXG5jbGFzcyBEb2N1bWVudFVuaWNvZGVIaWdobGlnaHRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVRleHRNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlU29vbjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBfZGVjb3JhdGlvbnM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZVN0YXRlOiAoc3RhdGU6IElVbmljb2RlSGlnaGxpZ2h0c1Jlc3VsdCB8IG51bGwpID0+IHZvaWQsXG5cdFx0QElFZGl0b3JXb3JrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcldvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX21vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMgPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy5fdXBkYXRlU29vbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX3VwZGF0ZSgpLCAyNTApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVTb29uLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlU29vbi5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fbW9kZWwubWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSgpKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsVmVyc2lvbklkID0gdGhpcy5fbW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cdFx0dGhpcy5fZWRpdG9yV29ya2VyU2VydmljZVxuXHRcdFx0LmNvbXB1dGVkVW5pY29kZUhpZ2hsaWdodHModGhpcy5fbW9kZWwudXJpLCB0aGlzLl9vcHRpb25zKVxuXHRcdFx0LnRoZW4oKGluZm8pID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX21vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5fbW9kZWwuZ2V0VmVyc2lvbklkKCkgIT09IG1vZGVsVmVyc2lvbklkKSB7XG5cdFx0XHRcdFx0Ly8gbW9kZWwgY2hhbmdlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlU3RhdGUoaW5mbyk7XG5cblx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0XHRcdGlmICghaW5mby5oYXNNb3JlKSB7XG5cdFx0XHRcdFx0Ly8gRG9uJ3Qgc2hvdyBkZWNvcmF0aW9uIGlmIHRoZXJlIGFyZSB0b28gbWFueS5cblx0XHRcdFx0XHQvLyBJbiB0aGlzIGNhc2UsIGEgYmFubmVyIGlzIHNob3duLlxuXHRcdFx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgaW5mby5yYW5nZXMpIHtcblx0XHRcdFx0XHRcdGRlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRyYW5nZTogcmFuZ2UsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IERlY29yYXRpb25zLmluc3RhbmNlLmdldERlY29yYXRpb25Gcm9tT3B0aW9ucyh0aGlzLl9vcHRpb25zKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5zZXQoZGVjb3JhdGlvbnMpO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVjb3JhdGlvbkluZm8oZGVjb3JhdGlvbjogSU1vZGVsRGVjb3JhdGlvbik6IFVuaWNvZGVIaWdobGlnaHRlckRlY29yYXRpb25JbmZvIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9kZWNvcmF0aW9ucy5oYXMoZGVjb3JhdGlvbikpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChcblx0XHRcdCFpc01vZGVsRGVjb3JhdGlvblZpc2libGUobW9kZWwsIGRlY29yYXRpb24pXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShkZWNvcmF0aW9uLnJhbmdlKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVhc29uOiBjb21wdXRlUmVhc29uKHRleHQsIHRoaXMuX29wdGlvbnMpISxcblx0XHRcdGluQ29tbWVudDogaXNNb2RlbERlY29yYXRpb25JbkNvbW1lbnQobW9kZWwsIGRlY29yYXRpb24pLFxuXHRcdFx0aW5TdHJpbmc6IGlzTW9kZWxEZWNvcmF0aW9uSW5TdHJpbmcobW9kZWwsIGRlY29yYXRpb24pLFxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgVmlld3BvcnRVbmljb2RlSGlnaGxpZ2h0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVRleHRNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlU29vbjogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZVN0YXRlOiAoc3RhdGU6IElVbmljb2RlSGlnaGxpZ2h0c1Jlc3VsdCB8IG51bGwpID0+IHZvaWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucyA9IHRoaXMuX2VkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVNvb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl91cGRhdGUoKSwgMjUwKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRMYXlvdXRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlU29vbi5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlU29vbi5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VIaWRkZW5BcmVhcygoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVTb29uLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVTb29uLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlU29vbi5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fbW9kZWwubWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSgpKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhbmdlcyA9IHRoaXMuX2VkaXRvci5nZXRWaXNpYmxlUmFuZ2VzKCk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0Y29uc3QgdG90YWxSZXN1bHQ6IElVbmljb2RlSGlnaGxpZ2h0c1Jlc3VsdCA9IHtcblx0XHRcdHJhbmdlczogW10sXG5cdFx0XHRhbWJpZ3VvdXNDaGFyYWN0ZXJDb3VudDogMCxcblx0XHRcdGludmlzaWJsZUNoYXJhY3RlckNvdW50OiAwLFxuXHRcdFx0bm9uQmFzaWNBc2NpaUNoYXJhY3RlckNvdW50OiAwLFxuXHRcdFx0aGFzTW9yZTogZmFsc2UsXG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlcykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gVW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLmNvbXB1dGVVbmljb2RlSGlnaGxpZ2h0cyh0aGlzLl9tb2RlbCwgdGhpcy5fb3B0aW9ucywgcmFuZ2UpO1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIHJlc3VsdC5yYW5nZXMpIHtcblx0XHRcdFx0dG90YWxSZXN1bHQucmFuZ2VzLnB1c2gocik7XG5cdFx0XHR9XG5cdFx0XHR0b3RhbFJlc3VsdC5hbWJpZ3VvdXNDaGFyYWN0ZXJDb3VudCArPSB0b3RhbFJlc3VsdC5hbWJpZ3VvdXNDaGFyYWN0ZXJDb3VudDtcblx0XHRcdHRvdGFsUmVzdWx0LmludmlzaWJsZUNoYXJhY3RlckNvdW50ICs9IHRvdGFsUmVzdWx0LmludmlzaWJsZUNoYXJhY3RlckNvdW50O1xuXHRcdFx0dG90YWxSZXN1bHQubm9uQmFzaWNBc2NpaUNoYXJhY3RlckNvdW50ICs9IHRvdGFsUmVzdWx0Lm5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJDb3VudDtcblx0XHRcdHRvdGFsUmVzdWx0Lmhhc01vcmUgPSB0b3RhbFJlc3VsdC5oYXNNb3JlIHx8IHJlc3VsdC5oYXNNb3JlO1xuXHRcdH1cblxuXHRcdGlmICghdG90YWxSZXN1bHQuaGFzTW9yZSkge1xuXHRcdFx0Ly8gRG9uJ3Qgc2hvdyBkZWNvcmF0aW9ucyBpZiB0aGVyZSBhcmUgdG9vIG1hbnkuXG5cdFx0XHQvLyBBIGJhbm5lciB3aWxsIGJlIHNob3duIGluc3RlYWQuXG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHRvdGFsUmVzdWx0LnJhbmdlcykge1xuXHRcdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2UsIG9wdGlvbnM6IERlY29yYXRpb25zLmluc3RhbmNlLmdldERlY29yYXRpb25Gcm9tT3B0aW9ucyh0aGlzLl9vcHRpb25zKSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlU3RhdGUodG90YWxSZXN1bHQpO1xuXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMuc2V0KGRlY29yYXRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREZWNvcmF0aW9uSW5mbyhkZWNvcmF0aW9uOiBJTW9kZWxEZWNvcmF0aW9uKTogVW5pY29kZUhpZ2hsaWdodGVyRGVjb3JhdGlvbkluZm8gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2RlY29yYXRpb25zLmhhcyhkZWNvcmF0aW9uKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShkZWNvcmF0aW9uLnJhbmdlKTtcblx0XHRpZiAoIWlzTW9kZWxEZWNvcmF0aW9uVmlzaWJsZShtb2RlbCwgZGVjb3JhdGlvbikpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVhc29uOiBjb21wdXRlUmVhc29uKHRleHQsIHRoaXMuX29wdGlvbnMpISxcblx0XHRcdGluQ29tbWVudDogaXNNb2RlbERlY29yYXRpb25JbkNvbW1lbnQobW9kZWwsIGRlY29yYXRpb24pLFxuXHRcdFx0aW5TdHJpbmc6IGlzTW9kZWxEZWNvcmF0aW9uSW5TdHJpbmcobW9kZWwsIGRlY29yYXRpb24pLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFVuaWNvZGVIaWdobGlnaHRlckhvdmVyIGltcGxlbWVudHMgSUhvdmVyUGFydCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBvd25lcjogSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8VW5pY29kZUhpZ2hsaWdodGVySG92ZXI+LFxuXHRcdHB1YmxpYyByZWFkb25seSByYW5nZTogUmFuZ2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRlY29yYXRpb246IElNb2RlbERlY29yYXRpb25cblx0KSB7IH1cblxuXHRwdWJsaWMgaXNWYWxpZEZvckhvdmVyQW5jaG9yKGFuY2hvcjogSG92ZXJBbmNob3IpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0YW5jaG9yLnR5cGUgPT09IEhvdmVyQW5jaG9yVHlwZS5SYW5nZVxuXHRcdFx0JiYgdGhpcy5yYW5nZS5zdGFydENvbHVtbiA8PSBhbmNob3IucmFuZ2Uuc3RhcnRDb2x1bW5cblx0XHRcdCYmIHRoaXMucmFuZ2UuZW5kQ29sdW1uID49IGFuY2hvci5yYW5nZS5lbmRDb2x1bW5cblx0XHQpO1xuXHR9XG59XG5cbmNvbnN0IGNvbmZpZ3VyZVVuaWNvZGVIaWdobGlnaHRPcHRpb25zU3RyID0gbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmNvbmZpZ3VyZVVuaWNvZGVIaWdobGlnaHRPcHRpb25zJywgJ0NvbmZpZ3VyZSBVbmljb2RlIEhpZ2hsaWdodCBPcHRpb25zJyk7XG5cbmV4cG9ydCBjbGFzcyBVbmljb2RlSGlnaGxpZ2h0ZXJIb3ZlclBhcnRpY2lwYW50IGltcGxlbWVudHMgSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8TWFya2Rvd25Ib3Zlcj4ge1xuXG5cdHB1YmxpYyByZWFkb25seSBob3Zlck9yZGluYWw6IG51bWJlciA9IDU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Y29tcHV0ZVN5bmMoYW5jaG9yOiBIb3ZlckFuY2hvciwgbGluZURlY29yYXRpb25zOiBJTW9kZWxEZWNvcmF0aW9uW10pOiBNYXJrZG93bkhvdmVyW10ge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgYW5jaG9yLnR5cGUgIT09IEhvdmVyQW5jaG9yVHlwZS5SYW5nZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRjb25zdCB1bmljb2RlSGlnaGxpZ2h0ZXIgPSB0aGlzLl9lZGl0b3IuZ2V0Q29udHJpYnV0aW9uPFVuaWNvZGVIaWdobGlnaHRlcj4oVW5pY29kZUhpZ2hsaWdodGVyLklEKTtcblx0XHRpZiAoIXVuaWNvZGVIaWdobGlnaHRlcikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogTWFya2Rvd25Ib3ZlcltdID0gW107XG5cdFx0Y29uc3QgZXhpc3RlZFJlYXNvbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGxldCBpbmRleCA9IDMwMDtcblx0XHRmb3IgKGNvbnN0IGQgb2YgbGluZURlY29yYXRpb25zKSB7XG5cblx0XHRcdGNvbnN0IGhpZ2hsaWdodEluZm8gPSB1bmljb2RlSGlnaGxpZ2h0ZXIuZ2V0RGVjb3JhdGlvbkluZm8oZCk7XG5cdFx0XHRpZiAoIWhpZ2hsaWdodEluZm8pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaGFyID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKGQucmFuZ2UpO1xuXHRcdFx0Ly8gdGV4dCByZWZlcnMgdG8gYSBzaW5nbGUgY2hhcmFjdGVyLlxuXHRcdFx0Y29uc3QgY29kZVBvaW50ID0gY2hhci5jb2RlUG9pbnRBdCgwKSE7XG5cblx0XHRcdGNvbnN0IGNvZGVQb2ludFN0ciA9IGZvcm1hdENvZGVQb2ludE1hcmtkb3duKGNvZGVQb2ludCk7XG5cblx0XHRcdGxldCByZWFzb246IHN0cmluZztcblx0XHRcdHN3aXRjaCAoaGlnaGxpZ2h0SW5mby5yZWFzb24ua2luZCkge1xuXHRcdFx0XHRjYXNlIFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbktpbmQuQW1iaWd1b3VzOiB7XG5cdFx0XHRcdFx0aWYgKGlzQmFzaWNBU0NJSShoaWdobGlnaHRJbmZvLnJlYXNvbi5jb25mdXNhYmxlV2l0aCkpIHtcblx0XHRcdFx0XHRcdHJlYXNvbiA9IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0J3VuaWNvZGVIaWdobGlnaHQuY2hhcmFjdGVySXNBbWJpZ3VvdXNBU0NJSScsXG5cdFx0XHRcdFx0XHRcdCdUaGUgY2hhcmFjdGVyIHswfSBjb3VsZCBiZSBjb25mdXNlZCB3aXRoIHRoZSBBU0NJSSBjaGFyYWN0ZXIgezF9LCB3aGljaCBpcyBtb3JlIGNvbW1vbiBpbiBzb3VyY2UgY29kZS4nLFxuXHRcdFx0XHRcdFx0XHRjb2RlUG9pbnRTdHIsXG5cdFx0XHRcdFx0XHRcdGZvcm1hdENvZGVQb2ludE1hcmtkb3duKGhpZ2hsaWdodEluZm8ucmVhc29uLmNvbmZ1c2FibGVXaXRoLmNvZGVQb2ludEF0KDApISlcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlYXNvbiA9IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0J3VuaWNvZGVIaWdobGlnaHQuY2hhcmFjdGVySXNBbWJpZ3VvdXMnLFxuXHRcdFx0XHRcdFx0XHQnVGhlIGNoYXJhY3RlciB7MH0gY291bGQgYmUgY29uZnVzZWQgd2l0aCB0aGUgY2hhcmFjdGVyIHsxfSwgd2hpY2ggaXMgbW9yZSBjb21tb24gaW4gc291cmNlIGNvZGUuJyxcblx0XHRcdFx0XHRcdFx0Y29kZVBvaW50U3RyLFxuXHRcdFx0XHRcdFx0XHRmb3JtYXRDb2RlUG9pbnRNYXJrZG93bihoaWdobGlnaHRJbmZvLnJlYXNvbi5jb25mdXNhYmxlV2l0aC5jb2RlUG9pbnRBdCgwKSEpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNhc2UgVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZC5JbnZpc2libGU6XG5cdFx0XHRcdFx0cmVhc29uID0gbmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J3VuaWNvZGVIaWdobGlnaHQuY2hhcmFjdGVySXNJbnZpc2libGUnLFxuXHRcdFx0XHRcdFx0J1RoZSBjaGFyYWN0ZXIgezB9IGlzIGludmlzaWJsZS4nLFxuXHRcdFx0XHRcdFx0Y29kZVBvaW50U3RyXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbktpbmQuTm9uQmFzaWNBc2NpaTpcblx0XHRcdFx0XHRyZWFzb24gPSBubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHQndW5pY29kZUhpZ2hsaWdodC5jaGFyYWN0ZXJJc05vbkJhc2ljQXNjaWknLFxuXHRcdFx0XHRcdFx0J1RoZSBjaGFyYWN0ZXIgezB9IGlzIG5vdCBhIGJhc2ljIEFTQ0lJIGNoYXJhY3Rlci4nLFxuXHRcdFx0XHRcdFx0Y29kZVBvaW50U3RyXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV4aXN0ZWRSZWFzb24uaGFzKHJlYXNvbikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRleGlzdGVkUmVhc29uLmFkZChyZWFzb24pO1xuXG5cdFx0XHRjb25zdCBhZGp1c3RTZXR0aW5nc0FyZ3M6IFNob3dFeGNsdWRlT3B0aW9uc0FyZ3MgPSB7XG5cdFx0XHRcdGNvZGVQb2ludDogY29kZVBvaW50LFxuXHRcdFx0XHRyZWFzb246IGhpZ2hsaWdodEluZm8ucmVhc29uLFxuXHRcdFx0XHRpbkNvbW1lbnQ6IGhpZ2hsaWdodEluZm8uaW5Db21tZW50LFxuXHRcdFx0XHRpblN0cmluZzogaGlnaGxpZ2h0SW5mby5pblN0cmluZyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFkanVzdFNldHRpbmdzID0gbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmFkanVzdFNldHRpbmdzJywgJ0FkanVzdCBzZXR0aW5ncycpO1xuXHRcdFx0Y29uc3QgdXJpID0gY3JlYXRlQ29tbWFuZFVyaShTaG93RXhjbHVkZU9wdGlvbnMuSUQsIGFkanVzdFNldHRpbmdzQXJncyk7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZygnJywgdHJ1ZSlcblx0XHRcdFx0LmFwcGVuZE1hcmtkb3duKHJlYXNvbilcblx0XHRcdFx0LmFwcGVuZFRleHQoJyAnKVxuXHRcdFx0XHQuYXBwZW5kTGluayh1cmksIGFkanVzdFNldHRpbmdzLCBjb25maWd1cmVVbmljb2RlSGlnaGxpZ2h0T3B0aW9uc1N0cik7XG5cdFx0XHRyZXN1bHQucHVzaChuZXcgTWFya2Rvd25Ib3Zlcih0aGlzLCBkLnJhbmdlLCBbbWFya2Rvd25dLCBmYWxzZSwgaW5kZXgrKykpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHJlbmRlckhvdmVyUGFydHMoY29udGV4dDogSUVkaXRvckhvdmVyUmVuZGVyQ29udGV4dCwgaG92ZXJQYXJ0czogTWFya2Rvd25Ib3ZlcltdKTogSVJlbmRlcmVkSG92ZXJQYXJ0czxNYXJrZG93bkhvdmVyPiB7XG5cdFx0cmV0dXJuIHJlbmRlck1hcmtkb3duSG92ZXJzKGNvbnRleHQsIGhvdmVyUGFydHMsIHRoaXMuX2VkaXRvciwgdGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIGdldEFjY2Vzc2libGVDb250ZW50KGhvdmVyUGFydDogTWFya2Rvd25Ib3Zlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGhvdmVyUGFydC5jb250ZW50cy5tYXAoYyA9PiBjLnZhbHVlKS5qb2luKCdcXG4nKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjb2RlUG9pbnRUb0hleChjb2RlUG9pbnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdHJldHVybiBgVSske2NvZGVQb2ludC50b1N0cmluZygxNikucGFkU3RhcnQoNCwgJzAnKX1gO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRDb2RlUG9pbnRNYXJrZG93bihjb2RlUG9pbnQ6IG51bWJlcikge1xuXHRsZXQgdmFsdWUgPSBgXFxgJHtjb2RlUG9pbnRUb0hleChjb2RlUG9pbnQpfVxcYGA7XG5cdGlmICghSW52aXNpYmxlQ2hhcmFjdGVycy5pc0ludmlzaWJsZUNoYXJhY3Rlcihjb2RlUG9pbnQpKSB7XG5cdFx0Ly8gRG9uJ3QgcmVuZGVyIGFueSBjb250cm9sIGNoYXJhY3RlcnMgb3IgYW55IGludmlzaWJsZSBjaGFyYWN0ZXJzLCBhcyB0aGV5IGNhbm5vdCBiZSBzZWVuIGFueXdheXMuXG5cdFx0dmFsdWUgKz0gYCBcIiR7YCR7cmVuZGVyQ29kZVBvaW50QXNJbmxpbmVDb2RlKGNvZGVQb2ludCl9YH1cImA7XG5cdH1cblx0cmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiByZW5kZXJDb2RlUG9pbnRBc0lubGluZUNvZGUoY29kZVBvaW50OiBudW1iZXIpOiBzdHJpbmcge1xuXHRpZiAoY29kZVBvaW50ID09PSBDaGFyQ29kZS5CYWNrVGljaykge1xuXHRcdHJldHVybiAnYGAgYCBgYCc7XG5cdH1cblx0cmV0dXJuICdgJyArIFN0cmluZy5mcm9tQ29kZVBvaW50KGNvZGVQb2ludCkgKyAnYCc7XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVSZWFzb24oY2hhcjogc3RyaW5nLCBvcHRpb25zOiBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zKTogVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uIHwgbnVsbCB7XG5cdHJldHVybiBVbmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXIuY29tcHV0ZVVuaWNvZGVIaWdobGlnaHRSZWFzb24oY2hhciwgb3B0aW9ucyk7XG59XG5cbmNsYXNzIERlY29yYXRpb25zIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBpbnN0YW5jZSA9IG5ldyBEZWNvcmF0aW9ucygpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwID0gbmV3IE1hcDxzdHJpbmcsIE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM+KCk7XG5cblx0Z2V0RGVjb3JhdGlvbkZyb21PcHRpb25zKG9wdGlvbnM6IFVuaWNvZGVIaWdobGlnaHRlck9wdGlvbnMpOiBNb2RlbERlY29yYXRpb25PcHRpb25zIHtcblx0XHRyZXR1cm4gdGhpcy5nZXREZWNvcmF0aW9uKCFvcHRpb25zLmluY2x1ZGVDb21tZW50cywgIW9wdGlvbnMuaW5jbHVkZVN0cmluZ3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWNvcmF0aW9uKGhpZGVJbkNvbW1lbnRzOiBib29sZWFuLCBoaWRlSW5TdHJpbmdzOiBib29sZWFuKTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdFx0Y29uc3Qga2V5ID0gYCR7aGlkZUluQ29tbWVudHN9JHtoaWRlSW5TdHJpbmdzfWA7XG5cdFx0bGV0IG9wdGlvbnMgPSB0aGlzLm1hcC5nZXQoa2V5KTtcblx0XHRpZiAoIW9wdGlvbnMpIHtcblx0XHRcdG9wdGlvbnMgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLmNyZWF0ZUR5bmFtaWMoe1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3VuaWNvZGUtaGlnaGxpZ2h0Jyxcblx0XHRcdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0XHRcdGNsYXNzTmFtZTogJ3VuaWNvZGUtaGlnaGxpZ2h0Jyxcblx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRvdmVydmlld1J1bGVyOiBudWxsLFxuXHRcdFx0XHRtaW5pbWFwOiBudWxsLFxuXHRcdFx0XHRoaWRlSW5Db21tZW50VG9rZW5zOiBoaWRlSW5Db21tZW50cyxcblx0XHRcdFx0aGlkZUluU3RyaW5nVG9rZW5zOiBoaWRlSW5TdHJpbmdzLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLm1hcC5zZXQoa2V5LCBvcHRpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9wdGlvbnM7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElEaXNhYmxlVW5pY29kZUhpZ2hsaWdodEFjdGlvbiB7XG5cdHNob3J0TGFiZWw6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIERpc2FibGVIaWdobGlnaHRpbmdJbkNvbW1lbnRzQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIGltcGxlbWVudHMgSURpc2FibGVVbmljb2RlSGlnaGxpZ2h0QWN0aW9uIHtcblx0cHVibGljIHN0YXRpYyBJRCA9ICdlZGl0b3IuYWN0aW9uLnVuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ0luQ29tbWVudHMnO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2hvcnRMYWJlbCA9IG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodC5kaXNhYmxlSGlnaGxpZ2h0aW5nSW5Db21tZW50cy5zaG9ydExhYmVsJywgJ0Rpc2FibGUgSGlnaGxpZ2h0IEluIENvbW1lbnRzJyk7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZBbWJpZ3VvdXNDaGFyYWN0ZXJzQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbi51bmljb2RlSGlnaGxpZ2h0LmRpc2FibGVIaWdobGlnaHRpbmdJbkNvbW1lbnRzJywgXCJEaXNhYmxlIGhpZ2hsaWdodGluZyBvZiBjaGFyYWN0ZXJzIGluIGNvbW1lbnRzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChjb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdFx0dGhpcy5ydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHVuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmluY2x1ZGVDb21tZW50cywgZmFsc2UsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc2FibGVIaWdobGlnaHRpbmdJblN0cmluZ3NBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24gaW1wbGVtZW50cyBJRGlzYWJsZVVuaWNvZGVIaWdobGlnaHRBY3Rpb24ge1xuXHRwdWJsaWMgc3RhdGljIElEID0gJ2VkaXRvci5hY3Rpb24udW5pY29kZUhpZ2hsaWdodC5kaXNhYmxlSGlnaGxpZ2h0aW5nSW5TdHJpbmdzJztcblx0cHVibGljIHJlYWRvbmx5IHNob3J0TGFiZWwgPSBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ0luU3RyaW5ncy5zaG9ydExhYmVsJywgJ0Rpc2FibGUgSGlnaGxpZ2h0IEluIFN0cmluZ3MnKTtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IERpc2FibGVIaWdobGlnaHRpbmdPZkFtYmlndW91c0NoYXJhY3RlcnNBY3Rpb24uSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignYWN0aW9uLnVuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ0luU3RyaW5ncycsIFwiRGlzYWJsZSBoaWdobGlnaHRpbmcgb2YgY2hhcmFjdGVycyBpbiBzdHJpbmdzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChjb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdFx0dGhpcy5ydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHVuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmluY2x1ZGVTdHJpbmdzLCBmYWxzZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlzYWJsZUhpZ2hsaWdodGluZ09mQW1iaWd1b3VzQ2hhcmFjdGVyc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIgaW1wbGVtZW50cyBJRGlzYWJsZVVuaWNvZGVIaWdobGlnaHRBY3Rpb24ge1xuXHRwdWJsaWMgc3RhdGljIElEID0gJ2VkaXRvci5hY3Rpb24udW5pY29kZUhpZ2hsaWdodC5kaXNhYmxlSGlnaGxpZ2h0aW5nT2ZBbWJpZ3VvdXNDaGFyYWN0ZXJzJztcblx0cHVibGljIHJlYWRvbmx5IHNob3J0TGFiZWwgPSBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ09mQW1iaWd1b3VzQ2hhcmFjdGVycy5zaG9ydExhYmVsJywgJ0Rpc2FibGUgQW1iaWd1b3VzIEhpZ2hsaWdodCcpO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRGlzYWJsZUhpZ2hsaWdodGluZ09mQW1iaWd1b3VzQ2hhcmFjdGVyc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhY3Rpb24udW5pY29kZUhpZ2hsaWdodC5kaXNhYmxlSGlnaGxpZ2h0aW5nT2ZBbWJpZ3VvdXNDaGFyYWN0ZXJzJywgXCJEaXNhYmxlIGhpZ2hsaWdodGluZyBvZiBhbWJpZ3VvdXMgY2hhcmFjdGVyc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0XHR0aGlzLnJ1bkFjdGlvbihjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bkFjdGlvbihjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUodW5pY29kZUhpZ2hsaWdodENvbmZpZ0tleXMuYW1iaWd1b3VzQ2hhcmFjdGVycywgZmFsc2UsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc2FibGVIaWdobGlnaHRpbmdPZkludmlzaWJsZUNoYXJhY3RlcnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIGltcGxlbWVudHMgSURpc2FibGVVbmljb2RlSGlnaGxpZ2h0QWN0aW9uIHtcblx0cHVibGljIHN0YXRpYyBJRCA9ICdlZGl0b3IuYWN0aW9uLnVuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ09mSW52aXNpYmxlQ2hhcmFjdGVycyc7XG5cdHB1YmxpYyByZWFkb25seSBzaG9ydExhYmVsID0gbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmRpc2FibGVIaWdobGlnaHRpbmdPZkludmlzaWJsZUNoYXJhY3RlcnMuc2hvcnRMYWJlbCcsICdEaXNhYmxlIEludmlzaWJsZSBIaWdobGlnaHQnKTtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IERpc2FibGVIaWdobGlnaHRpbmdPZkludmlzaWJsZUNoYXJhY3RlcnNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWN0aW9uLnVuaWNvZGVIaWdobGlnaHQuZGlzYWJsZUhpZ2hsaWdodGluZ09mSW52aXNpYmxlQ2hhcmFjdGVycycsIFwiRGlzYWJsZSBoaWdobGlnaHRpbmcgb2YgaW52aXNpYmxlIGNoYXJhY3RlcnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChjb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdFx0dGhpcy5ydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHVuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmludmlzaWJsZUNoYXJhY3RlcnMsIGZhbHNlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZOb25CYXNpY0FzY2lpQ2hhcmFjdGVyc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIgaW1wbGVtZW50cyBJRGlzYWJsZVVuaWNvZGVIaWdobGlnaHRBY3Rpb24ge1xuXHRwdWJsaWMgc3RhdGljIElEID0gJ2VkaXRvci5hY3Rpb24udW5pY29kZUhpZ2hsaWdodC5kaXNhYmxlSGlnaGxpZ2h0aW5nT2ZOb25CYXNpY0FzY2lpQ2hhcmFjdGVycyc7XG5cdHB1YmxpYyByZWFkb25seSBzaG9ydExhYmVsID0gbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmRpc2FibGVIaWdobGlnaHRpbmdPZk5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJzLnNob3J0TGFiZWwnLCAnRGlzYWJsZSBOb24gQVNDSUkgSGlnaGxpZ2h0Jyk7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZOb25CYXNpY0FzY2lpQ2hhcmFjdGVyc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhY3Rpb24udW5pY29kZUhpZ2hsaWdodC5kaXNhYmxlSGlnaGxpZ2h0aW5nT2ZOb25CYXNpY0FzY2lpQ2hhcmFjdGVycycsIFwiRGlzYWJsZSBoaWdobGlnaHRpbmcgb2Ygbm9uIGJhc2ljIEFTQ0lJIGNoYXJhY3RlcnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChjb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdFx0dGhpcy5ydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHVuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLm5vbkJhc2ljQVNDSUksIGZhbHNlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHR9XG59XG5cbmludGVyZmFjZSBTaG93RXhjbHVkZU9wdGlvbnNBcmdzIHtcblx0Y29kZVBvaW50OiBudW1iZXI7XG5cdHJlYXNvbjogVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uO1xuXHRpbkNvbW1lbnQ6IGJvb2xlYW47XG5cdGluU3RyaW5nOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgU2hvd0V4Y2x1ZGVPcHRpb25zIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHB1YmxpYyBzdGF0aWMgSUQgPSAnZWRpdG9yLmFjdGlvbi51bmljb2RlSGlnaGxpZ2h0LnNob3dFeGNsdWRlT3B0aW9ucyc7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTaG93RXhjbHVkZU9wdGlvbnMuSUQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWN0aW9uLnVuaWNvZGVIaWdobGlnaHQuc2hvd0V4Y2x1ZGVPcHRpb25zJywgXCJTaG93IEV4Y2x1ZGUgT3B0aW9uc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogYW55KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBjb2RlUG9pbnQsIHJlYXNvbiwgaW5TdHJpbmcsIGluQ29tbWVudCB9ID0gYXJncyBhcyBTaG93RXhjbHVkZU9wdGlvbnNBcmdzO1xuXG5cdFx0Y29uc3QgY2hhciA9IFN0cmluZy5mcm9tQ29kZVBvaW50KGNvZGVQb2ludCk7XG5cblx0XHRjb25zdCBxdWlja1BpY2tTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGludGVyZmFjZSBFeHRlbmRlZE9wdGlvbnMgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdFx0XHRydW4oKTogUHJvbWlzZTx2b2lkPjtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXRFeGNsdWRlQ2hhckZyb21CZWluZ0hpZ2hsaWdodGVkTGFiZWwoY29kZVBvaW50OiBudW1iZXIpIHtcblx0XHRcdGlmIChJbnZpc2libGVDaGFyYWN0ZXJzLmlzSW52aXNpYmxlQ2hhcmFjdGVyKGNvZGVQb2ludCkpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodC5leGNsdWRlSW52aXNpYmxlQ2hhckZyb21CZWluZ0hpZ2hsaWdodGVkJywgJ0V4Y2x1ZGUgezB9IChpbnZpc2libGUgY2hhcmFjdGVyKSBmcm9tIGJlaW5nIGhpZ2hsaWdodGVkJywgY29kZVBvaW50VG9IZXgoY29kZVBvaW50KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0LmV4Y2x1ZGVDaGFyRnJvbUJlaW5nSGlnaGxpZ2h0ZWQnLCAnRXhjbHVkZSB7MH0gZnJvbSBiZWluZyBoaWdobGlnaHRlZCcsIGAke2NvZGVQb2ludFRvSGV4KGNvZGVQb2ludCl9IFwiJHtjaGFyfVwiYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9uczogRXh0ZW5kZWRPcHRpb25zW10gPSBbXTtcblxuXHRcdGlmIChyZWFzb24ua2luZCA9PT0gVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZC5BbWJpZ3VvdXMpIHtcblx0XHRcdGZvciAoY29uc3QgbG9jYWxlIG9mIHJlYXNvbi5ub3RBbWJpZ3VvdXNJbkxvY2FsZXMpIHtcblx0XHRcdFx0b3B0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKFwidW5pY29kZUhpZ2hsaWdodC5hbGxvd0NvbW1vbkNoYXJhY3RlcnNJbkxhbmd1YWdlXCIsIFwiQWxsb3cgdW5pY29kZSBjaGFyYWN0ZXJzIHRoYXQgYXJlIG1vcmUgY29tbW9uIGluIHRoZSBsYW5ndWFnZSBcXFwiezB9XFxcIi5cIiwgbG9jYWxlKSxcblx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGV4Y2x1ZGVMb2NhbGVGcm9tQmVpbmdIaWdobGlnaHRlZChjb25maWd1cmF0aW9uU2VydmljZSwgW2xvY2FsZV0pO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdG9wdGlvbnMucHVzaChcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGdldEV4Y2x1ZGVDaGFyRnJvbUJlaW5nSGlnaGxpZ2h0ZWRMYWJlbChjb2RlUG9pbnQpLFxuXHRcdFx0XHRydW46ICgpID0+IGV4Y2x1ZGVDaGFyRnJvbUJlaW5nSGlnaGxpZ2h0ZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIFtjb2RlUG9pbnRdKVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRpZiAoaW5Db21tZW50KSB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBuZXcgRGlzYWJsZUhpZ2hsaWdodGluZ0luQ29tbWVudHNBY3Rpb24oKTtcblx0XHRcdG9wdGlvbnMucHVzaCh7IGxhYmVsOiBhY3Rpb24ubGFiZWwsIHJ1bjogYXN5bmMgKCkgPT4gYWN0aW9uLnJ1bkFjdGlvbihjb25maWd1cmF0aW9uU2VydmljZSkgfSk7XG5cdFx0fSBlbHNlIGlmIChpblN0cmluZykge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IERpc2FibGVIaWdobGlnaHRpbmdJblN0cmluZ3NBY3Rpb24oKTtcblx0XHRcdG9wdGlvbnMucHVzaCh7IGxhYmVsOiBhY3Rpb24ubGFiZWwsIHJ1bjogYXN5bmMgKCkgPT4gYWN0aW9uLnJ1bkFjdGlvbihjb25maWd1cmF0aW9uU2VydmljZSkgfSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZ2V0VGl0bGUob3B0aW9uczogQWN0aW9uMikge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiBvcHRpb25zLmRlc2MudGl0bGUgPT09ICdzdHJpbmcnID8gb3B0aW9ucy5kZXNjLnRpdGxlIDogb3B0aW9ucy5kZXNjLnRpdGxlLnZhbHVlO1xuXHRcdH1cblxuXHRcdGlmIChyZWFzb24ua2luZCA9PT0gVW5pY29kZUhpZ2hsaWdodGVyUmVhc29uS2luZC5BbWJpZ3VvdXMpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBEaXNhYmxlSGlnaGxpZ2h0aW5nT2ZBbWJpZ3VvdXNDaGFyYWN0ZXJzQWN0aW9uKCk7XG5cdFx0XHRvcHRpb25zLnB1c2goeyBsYWJlbDogZ2V0VGl0bGUoYWN0aW9uKSwgcnVuOiBhc3luYyAoKSA9PiBhY3Rpb24ucnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB9KTtcblx0XHR9IGVsc2UgaWYgKHJlYXNvbi5raW5kID09PSBVbmljb2RlSGlnaGxpZ2h0ZXJSZWFzb25LaW5kLkludmlzaWJsZSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IERpc2FibGVIaWdobGlnaHRpbmdPZkludmlzaWJsZUNoYXJhY3RlcnNBY3Rpb24oKTtcblx0XHRcdG9wdGlvbnMucHVzaCh7IGxhYmVsOiBnZXRUaXRsZShhY3Rpb24pLCBydW46IGFzeW5jICgpID0+IGFjdGlvbi5ydW5BY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2UpIH0pO1xuXHRcdH0gZWxzZSBpZiAocmVhc29uLmtpbmQgPT09IFVuaWNvZGVIaWdobGlnaHRlclJlYXNvbktpbmQuTm9uQmFzaWNBc2NpaSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IERpc2FibGVIaWdobGlnaHRpbmdPZk5vbkJhc2ljQXNjaWlDaGFyYWN0ZXJzQWN0aW9uKCk7XG5cdFx0XHRvcHRpb25zLnB1c2goeyBsYWJlbDogZ2V0VGl0bGUoYWN0aW9uKSwgcnVuOiBhc3luYyAoKSA9PiBhY3Rpb24ucnVuQWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXhwZWN0TmV2ZXIocmVhc29uKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBxdWlja1BpY2tTZXJ2aWNlLnBpY2soXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0eyB0aXRsZTogY29uZmlndXJlVW5pY29kZUhpZ2hsaWdodE9wdGlvbnNTdHIgfVxuXHRcdCk7XG5cblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRhd2FpdCByZXN1bHQucnVuKCk7XG5cdFx0fVxuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4Y2x1ZGVDaGFyRnJvbUJlaW5nSGlnaGxpZ2h0ZWQoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgY2hhckNvZGVzOiBudW1iZXJbXSkge1xuXHRjb25zdCBleGlzdGluZ1ZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodW5pY29kZUhpZ2hsaWdodENvbmZpZ0tleXMuYWxsb3dlZENoYXJhY3RlcnMpO1xuXG5cdGxldCB2YWx1ZTogUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG5cdGlmICgodHlwZW9mIGV4aXN0aW5nVmFsdWUgPT09ICdvYmplY3QnKSAmJiBleGlzdGluZ1ZhbHVlKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0dmFsdWUgPSBleGlzdGluZ1ZhbHVlIGFzIGFueTtcblx0fSBlbHNlIHtcblx0XHR2YWx1ZSA9IHt9O1xuXHR9XG5cblx0Zm9yIChjb25zdCBjaGFyQ29kZSBvZiBjaGFyQ29kZXMpIHtcblx0XHR2YWx1ZVtTdHJpbmcuZnJvbUNvZGVQb2ludChjaGFyQ29kZSldID0gdHJ1ZTtcblx0fVxuXG5cdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHVuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmFsbG93ZWRDaGFyYWN0ZXJzLCB2YWx1ZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZXhjbHVkZUxvY2FsZUZyb21CZWluZ0hpZ2hsaWdodGVkKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGxvY2FsZXM6IHN0cmluZ1tdKSB7XG5cdGNvbnN0IGV4aXN0aW5nVmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KHVuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmFsbG93ZWRMb2NhbGVzKS51c2VyPy52YWx1ZTtcblxuXHRsZXQgdmFsdWU6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+O1xuXHRpZiAoKHR5cGVvZiBleGlzdGluZ1ZhbHVlID09PSAnb2JqZWN0JykgJiYgZXhpc3RpbmdWYWx1ZSkge1xuXHRcdC8vIENvcHkgdmFsdWUsIGFzIHRoZSBleGlzdGluZyB2YWx1ZSBpcyByZWFkIG9ubHlcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHR2YWx1ZSA9IE9iamVjdC5hc3NpZ24oe30sIGV4aXN0aW5nVmFsdWUgYXMgYW55KTtcblx0fSBlbHNlIHtcblx0XHR2YWx1ZSA9IHt9O1xuXHR9XG5cblx0Zm9yIChjb25zdCBsb2NhbGUgb2YgbG9jYWxlcykge1xuXHRcdHZhbHVlW2xvY2FsZV0gPSB0cnVlO1xuXHR9XG5cblx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUodW5pY29kZUhpZ2hsaWdodENvbmZpZ0tleXMuYWxsb3dlZExvY2FsZXMsIHZhbHVlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xufVxuXG5mdW5jdGlvbiBleHBlY3ROZXZlcih2YWx1ZTogbmV2ZXIpIHtcblx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIHZhbHVlOiAke3ZhbHVlfWApO1xufVxuXG5yZWdpc3RlckFjdGlvbjIoRGlzYWJsZUhpZ2hsaWdodGluZ09mQW1iaWd1b3VzQ2hhcmFjdGVyc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRGlzYWJsZUhpZ2hsaWdodGluZ09mSW52aXNpYmxlQ2hhcmFjdGVyc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRGlzYWJsZUhpZ2hsaWdodGluZ09mTm9uQmFzaWNBc2NpaUNoYXJhY3RlcnNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNob3dFeGNsdWRlT3B0aW9ucyk7XG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihVbmljb2RlSGlnaGxpZ2h0ZXIuSUQsIFVuaWNvZGVIaWdobGlnaHRlciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5BZnRlckZpcnN0UmVuZGVyKTtcbkhvdmVyUGFydGljaXBhbnRSZWdpc3RyeS5yZWdpc3RlcihVbmljb2RlSGlnaGxpZ2h0ZXJIb3ZlclBhcnRpY2lwYW50KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCLHNCQUFzQjtBQUNqRCxTQUFTLGtCQUFrQjtBQUMzQixZQUFZLGNBQWM7QUFDMUIsU0FBUyxxQkFBcUIsb0JBQW9CO0FBQ2xELE9BQU87QUFFUCxTQUFTLGNBQWMsaUNBQWlDLGtDQUFvRDtBQUM1RyxTQUErQixzQkFBc0IsY0FBK0Msa0NBQWtDO0FBR3RJLFNBQThELDhCQUE4QjtBQUM1RixTQUFTLDhCQUE4QjtBQUN2QyxTQUE4RCw4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QUFLLFlBQVksT0FBTyxVQUFVLG9CQUFvQixFQUFFLENBQUM7QUFBQSxJQUNsRyxPQUFPO0FBQ04sa0JBQVksTUFBTTtBQUFBLElBQ25CO0FBRUEsVUFBTSxTQUFTLE1BQU0saUJBQWlCO0FBQUEsTUFDckM7QUFBQSxNQUNBLEVBQUUsT0FBTyxvQ0FBb0M7QUFBQSxJQUM5QztBQUVBLFFBQUksUUFBUTtBQUNYLFlBQU0sT0FBTyxJQUFJO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQ0Q7QUFwRmEsb0JBQ0UsS0FBSztBQURiLElBQU0scUJBQU47QUFzRlAsZUFBZSxnQ0FBZ0Msc0JBQTZDLFdBQXFCO0FBQ2hILFFBQU0sZ0JBQWdCLHFCQUFxQixTQUFTLDJCQUEyQixpQkFBaUI7QUFFaEcsTUFBSTtBQUNKLE1BQUssT0FBTyxrQkFBa0IsWUFBYSxlQUFlO0FBRXpELFlBQVE7QUFBQSxFQUNULE9BQU87QUFDTixZQUFRLENBQUM7QUFBQSxFQUNWO0FBRUEsYUFBVyxZQUFZLFdBQVc7QUFDakMsVUFBTSxPQUFPLGNBQWMsUUFBUSxDQUFDLElBQUk7QUFBQSxFQUN6QztBQUVBLFFBQU0scUJBQXFCLFlBQVksMkJBQTJCLG1CQUFtQixPQUFPLG9CQUFvQixJQUFJO0FBQ3JIO0FBRUEsZUFBZSxrQ0FBa0Msc0JBQTZDLFNBQW1CO0FBQ2hILFFBQU0sZ0JBQWdCLHFCQUFxQixRQUFRLDJCQUEyQixjQUFjLEVBQUUsTUFBTTtBQUVwRyxNQUFJO0FBQ0osTUFBSyxPQUFPLGtCQUFrQixZQUFhLGVBQWU7QUFHekQsWUFBUSxPQUFPLE9BQU8sQ0FBQyxHQUFHLGFBQW9CO0FBQUEsRUFDL0MsT0FBTztBQUNOLFlBQVEsQ0FBQztBQUFBLEVBQ1Y7QUFFQSxhQUFXLFVBQVUsU0FBUztBQUM3QixVQUFNLE1BQU0sSUFBSTtBQUFBLEVBQ2pCO0FBRUEsUUFBTSxxQkFBcUIsWUFBWSwyQkFBMkIsZ0JBQWdCLE9BQU8sb0JBQW9CLElBQUk7QUFDbEg7QUFFQSxTQUFTLFlBQVksT0FBYztBQUNsQyxRQUFNLElBQUksTUFBTSxxQkFBcUIsS0FBSyxFQUFFO0FBQzdDO0FBRUEsZ0JBQWdCLDhDQUE4QztBQUM5RCxnQkFBZ0IsOENBQThDO0FBQzlELGdCQUFnQixrREFBa0Q7QUFDbEUsZ0JBQWdCLGtCQUFrQjtBQUNsQywyQkFBMkIsbUJBQW1CLElBQUksb0JBQW9CLGdDQUFnQyxnQkFBZ0I7QUFDdEgseUJBQXlCLFNBQVMsa0NBQWtDOyIsCiAgIm5hbWVzIjogWyJjb2RlUG9pbnQiLCAib3B0aW9ucyJdCn0K
