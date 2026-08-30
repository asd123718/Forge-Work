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
import { createCancelablePromise, RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import * as platform from "../../../../base/common/platform.js";
import * as resources from "../../../../base/common/resources.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { URI } from "../../../../base/common/uri.js";
import "./links.css";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { ClickLinkGesture } from "../../gotoSymbol/browser/link/clickLinkGesture.js";
import { getLinks } from "./getLinks.js";
import * as nls from "../../../../nls.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
let LinkDetector = class extends Disposable {
  constructor(editor, openerService, notificationService, languageFeaturesService, languageFeatureDebounceService) {
    super();
    this.editor = editor;
    this.openerService = openerService;
    this.notificationService = notificationService;
    this.languageFeaturesService = languageFeaturesService;
    this.providers = this.languageFeaturesService.linkProvider;
    this.debounceInformation = languageFeatureDebounceService.for(this.providers, "Links", { min: 1e3, max: 4e3 });
    this.computeLinks = this._register(new RunOnceScheduler(() => this.computeLinksNow(), 1e3));
    this.computePromise = null;
    this.activeLinksList = null;
    this.currentOccurrences = {};
    this.activeLinkDecorationId = null;
    const clickLinkGesture = this._register(new ClickLinkGesture(editor));
    this._register(clickLinkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
      this._onEditorMouseMove(mouseEvent, keyboardEvent);
    }));
    this._register(clickLinkGesture.onExecute((e) => {
      this.onEditorMouseUp(e);
    }));
    this._register(clickLinkGesture.onCancel((e) => {
      this.cleanUpActiveLinkDecoration();
    }));
    this._register(editor.onDidChangeConfiguration((e) => {
      if (!e.hasChanged(EditorOption.links)) {
        return;
      }
      this.updateDecorations([]);
      this.stop();
      this.computeLinks.schedule(0);
    }));
    this._register(editor.onDidChangeModelContent((e) => {
      if (!this.editor.hasModel()) {
        return;
      }
      this.computeLinks.schedule(this.debounceInformation.get(this.editor.getModel()));
    }));
    this._register(editor.onDidChangeModel((e) => {
      this.currentOccurrences = {};
      this.activeLinkDecorationId = null;
      this.stop();
      this.computeLinks.schedule(0);
    }));
    this._register(editor.onDidChangeModelLanguage((e) => {
      this.stop();
      this.computeLinks.schedule(0);
    }));
    this._register(this.providers.onDidChange((e) => {
      this.stop();
      this.computeLinks.schedule(0);
    }));
    this.computeLinks.schedule(0);
  }
  static get(editor) {
    return editor.getContribution(LinkDetector.ID);
  }
  async computeLinksNow() {
    if (!this.editor.hasModel() || !this.editor.getOption(EditorOption.links)) {
      return;
    }
    const model = this.editor.getModel();
    if (model.isTooLargeForSyncing()) {
      return;
    }
    if (!this.providers.has(model)) {
      return;
    }
    if (this.activeLinksList) {
      this.activeLinksList.dispose();
      this.activeLinksList = null;
    }
    this.computePromise = createCancelablePromise((token) => getLinks(this.providers, model, token));
    try {
      const sw = new StopWatch(false);
      this.activeLinksList = await this.computePromise;
      this.debounceInformation.update(model, sw.elapsed());
      if (model.isDisposed()) {
        return;
      }
      this.updateDecorations(this.activeLinksList.links);
    } catch (err) {
      onUnexpectedError(err);
    } finally {
      this.computePromise = null;
    }
  }
  updateDecorations(links) {
    const useMetaKey = this.editor.getOption(EditorOption.multiCursorModifier) === "altKey";
    const oldDecorations = [];
    const keys = Object.keys(this.currentOccurrences);
    for (const decorationId of keys) {
      const occurence = this.currentOccurrences[decorationId];
      oldDecorations.push(occurence.decorationId);
    }
    const newDecorations = [];
    if (links) {
      for (const link of links) {
        newDecorations.push(LinkOccurrence.decoration(link, useMetaKey));
      }
    }
    this.editor.changeDecorations((changeAccessor) => {
      const decorations = changeAccessor.deltaDecorations(oldDecorations, newDecorations);
      this.currentOccurrences = {};
      this.activeLinkDecorationId = null;
      for (let i = 0, len = decorations.length; i < len; i++) {
        const occurence = new LinkOccurrence(links[i], decorations[i]);
        this.currentOccurrences[occurence.decorationId] = occurence;
      }
    });
  }
  _onEditorMouseMove(mouseEvent, withKey) {
    const useMetaKey = this.editor.getOption(EditorOption.multiCursorModifier) === "altKey";
    if (this.isEnabled(mouseEvent, withKey)) {
      this.cleanUpActiveLinkDecoration();
      const occurrence = this.getLinkOccurrence(mouseEvent.target.position);
      if (occurrence) {
        this.editor.changeDecorations((changeAccessor) => {
          occurrence.activate(changeAccessor, useMetaKey);
          this.activeLinkDecorationId = occurrence.decorationId;
        });
      }
    } else {
      this.cleanUpActiveLinkDecoration();
    }
  }
  cleanUpActiveLinkDecoration() {
    const useMetaKey = this.editor.getOption(EditorOption.multiCursorModifier) === "altKey";
    if (this.activeLinkDecorationId) {
      const occurrence = this.currentOccurrences[this.activeLinkDecorationId];
      if (occurrence) {
        this.editor.changeDecorations((changeAccessor) => {
          occurrence.deactivate(changeAccessor, useMetaKey);
        });
      }
      this.activeLinkDecorationId = null;
    }
  }
  onEditorMouseUp(mouseEvent) {
    if (!this.isEnabled(mouseEvent)) {
      return;
    }
    const occurrence = this.getLinkOccurrence(mouseEvent.target.position);
    if (!occurrence) {
      return;
    }
    this.openLinkOccurrence(
      occurrence,
      mouseEvent.hasSideBySideModifier,
      true
      /* from user gesture */
    );
  }
  openLinkOccurrence(occurrence, openToSide, fromUserGesture = false) {
    if (!this.openerService) {
      return;
    }
    const { link } = occurrence;
    link.resolve(CancellationToken.None).then((uri) => {
      if (typeof uri === "string" && this.editor.hasModel()) {
        const modelUri = this.editor.getModel().uri;
        if (modelUri.scheme === Schemas.file && uri.startsWith(`${Schemas.file}:`)) {
          const parsedUri = URI.parse(uri);
          if (parsedUri.scheme === Schemas.file) {
            const fsPath = resources.originalFSPath(parsedUri);
            let relativePath = null;
            if (fsPath.startsWith("/./") || fsPath.startsWith("\\.\\")) {
              relativePath = `.${fsPath.substr(1)}`;
            } else if (fsPath.startsWith("//./") || fsPath.startsWith("\\\\.\\")) {
              relativePath = `.${fsPath.substr(2)}`;
            }
            if (relativePath) {
              uri = resources.joinPath(modelUri, relativePath);
            }
          }
        }
      }
      return this.openerService.open(uri, { openToSide, fromUserGesture, allowContributedOpeners: true, allowCommands: true, fromWorkspace: true });
    }, (err) => {
      const messageOrError = err instanceof Error ? err.message : err;
      if (messageOrError === "invalid") {
        this.notificationService.warn(nls.localize("invalid.url", "Failed to open this link because it is not well-formed: {0}", link.url.toString()));
      } else if (messageOrError === "missing") {
        this.notificationService.warn(nls.localize("missing.url", "Failed to open this link because its target is missing."));
      } else {
        onUnexpectedError(err);
      }
    });
  }
  getLinkOccurrence(position) {
    if (!this.editor.hasModel() || !position) {
      return null;
    }
    const decorations = this.editor.getModel().getDecorationsInRange({
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: position.lineNumber,
      endColumn: position.column
    }, 0, true);
    for (const decoration2 of decorations) {
      const currentOccurrence = this.currentOccurrences[decoration2.id];
      if (currentOccurrence) {
        return currentOccurrence;
      }
    }
    return null;
  }
  isEnabled(mouseEvent, withKey) {
    return Boolean(
      mouseEvent.target.type === MouseTargetType.CONTENT_TEXT && (mouseEvent.hasTriggerModifier || withKey && withKey.keyCodeIsTriggerKey || mouseEvent.isMiddleClick && mouseEvent.mouseMiddleClickAction === "openLink")
    );
  }
  stop() {
    this.computeLinks.cancel();
    if (this.activeLinksList) {
      this.activeLinksList?.dispose();
      this.activeLinksList = null;
    }
    if (this.computePromise) {
      this.computePromise.cancel();
      this.computePromise = null;
    }
  }
  dispose() {
    super.dispose();
    this.stop();
  }
};
LinkDetector.ID = "editor.linkDetector";
LinkDetector = __decorateClass([
  __decorateParam(1, IOpenerService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, ILanguageFeatureDebounceService)
], LinkDetector);
const decoration = {
  general: ModelDecorationOptions.register({
    description: "detected-link",
    stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    collapseOnReplaceEdit: true,
    inlineClassName: "detected-link"
  }),
  active: ModelDecorationOptions.register({
    description: "detected-link-active",
    stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    collapseOnReplaceEdit: true,
    inlineClassName: "detected-link-active"
  })
};
class LinkOccurrence {
  static decoration(link, useMetaKey) {
    return {
      range: link.range,
      options: LinkOccurrence._getOptions(link, useMetaKey, false)
    };
  }
  static _getOptions(link, useMetaKey, isActive) {
    const options = { ...isActive ? decoration.active : decoration.general };
    options.hoverMessage = getHoverMessage(link, useMetaKey);
    return options;
  }
  constructor(link, decorationId) {
    this.link = link;
    this.decorationId = decorationId;
  }
  activate(changeAccessor, useMetaKey) {
    changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurrence._getOptions(this.link, useMetaKey, true));
  }
  deactivate(changeAccessor, useMetaKey) {
    changeAccessor.changeDecorationOptions(this.decorationId, LinkOccurrence._getOptions(this.link, useMetaKey, false));
  }
}
function getHoverMessage(link, useMetaKey) {
  const executeCmd = link.url && /^command:/i.test(link.url.toString());
  const label = link.tooltip ? link.tooltip : executeCmd ? nls.localize("links.navigate.executeCmd", "Execute command") : nls.localize("links.navigate.follow", "Follow link");
  const kb = useMetaKey ? platform.isMacintosh ? nls.localize("links.navigate.kb.meta.mac", "cmd + click") : nls.localize("links.navigate.kb.meta", "ctrl + click") : platform.isMacintosh ? nls.localize("links.navigate.kb.alt.mac", "option + click") : nls.localize("links.navigate.kb.alt", "alt + click");
  if (link.url) {
    let nativeLabel = "";
    if (/^command:/i.test(link.url.toString())) {
      const match = link.url.toString().match(/^command:([^?#]+)/);
      if (match) {
        const commandId = match[1];
        nativeLabel = nls.localize("tooltip.explanation", "Execute command {0}", commandId);
      }
    }
    const hoverMessage = new MarkdownString("", true).appendLink(link.url.toString(true).replace(/ /g, "%20"), label, nativeLabel).appendMarkdown(` (${kb})`);
    return hoverMessage;
  } else {
    return new MarkdownString().appendText(`${label} (${kb})`);
  }
}
class OpenLinkAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.openLink",
      label: nls.localize2("label", "Open Link"),
      precondition: void 0
    });
  }
  run(accessor, editor) {
    const linkDetector = LinkDetector.get(editor);
    if (!linkDetector) {
      return;
    }
    if (!editor.hasModel()) {
      return;
    }
    const selections = editor.getSelections();
    for (const sel of selections) {
      const link = linkDetector.getLinkOccurrence(sel.getEndPosition());
      if (link) {
        linkDetector.openLinkOccurrence(link, false);
      }
    }
  }
}
registerEditorContribution(LinkDetector.ID, LinkDetector, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(OpenLinkAction);
export {
  LinkDetector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGxpbmtzXFxicm93c2VyXFxsaW5rcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBDYW5jZWxhYmxlUHJvbWlzZSwgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICcuL2xpbmtzLmNzcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgcmVnaXN0ZXJFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExpbmtQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvciwgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbiwgSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBDbGlja0xpbmtHZXN0dXJlLCBDbGlja0xpbmtLZXlib2FyZEV2ZW50LCBDbGlja0xpbmtNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vZ290b1N5bWJvbC9icm93c2VyL2xpbmsvY2xpY2tMaW5rR2VzdHVyZS5qcyc7XG5pbXBvcnQgeyBnZXRMaW5rcywgTGluaywgTGlua3NMaXN0IH0gZnJvbSAnLi9nZXRMaW5rcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBMaW5rRGV0ZWN0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gJ2VkaXRvci5saW5rRGV0ZWN0b3InO1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBMaW5rRGV0ZWN0b3IgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxMaW5rRGV0ZWN0b3I+KExpbmtEZXRlY3Rvci5JRCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb3ZpZGVyczogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8TGlua1Byb3ZpZGVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBkZWJvdW5jZUluZm9ybWF0aW9uOiBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgY29tcHV0ZUxpbmtzOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIGNvbXB1dGVQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxMaW5rc0xpc3Q+IHwgbnVsbDtcblx0cHJpdmF0ZSBhY3RpdmVMaW5rc0xpc3Q6IExpbmtzTGlzdCB8IG51bGw7XG5cdHByaXZhdGUgYWN0aXZlTGlua0RlY29yYXRpb25JZDogc3RyaW5nIHwgbnVsbDtcblx0cHJpdmF0ZSBjdXJyZW50T2NjdXJyZW5jZXM6IHsgW2RlY29yYXRpb25JZDogc3RyaW5nXTogTGlua09jY3VycmVuY2UgfTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5wcm92aWRlcnMgPSB0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmxpbmtQcm92aWRlcjtcblx0XHR0aGlzLmRlYm91bmNlSW5mb3JtYXRpb24gPSBsYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UuZm9yKHRoaXMucHJvdmlkZXJzLCAnTGlua3MnLCB7IG1pbjogMTAwMCwgbWF4OiA0MDAwIH0pO1xuXHRcdHRoaXMuY29tcHV0ZUxpbmtzID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5jb21wdXRlTGlua3NOb3coKSwgMTAwMCkpO1xuXHRcdHRoaXMuY29tcHV0ZVByb21pc2UgPSBudWxsO1xuXHRcdHRoaXMuYWN0aXZlTGlua3NMaXN0ID0gbnVsbDtcblx0XHR0aGlzLmN1cnJlbnRPY2N1cnJlbmNlcyA9IHt9O1xuXHRcdHRoaXMuYWN0aXZlTGlua0RlY29yYXRpb25JZCA9IG51bGw7XG5cblx0XHRjb25zdCBjbGlja0xpbmtHZXN0dXJlID0gdGhpcy5fcmVnaXN0ZXIobmV3IENsaWNrTGlua0dlc3R1cmUoZWRpdG9yKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihjbGlja0xpbmtHZXN0dXJlLm9uTW91c2VNb3ZlT3JSZWxldmFudEtleURvd24oKFttb3VzZUV2ZW50LCBrZXlib2FyZEV2ZW50XSkgPT4ge1xuXHRcdFx0dGhpcy5fb25FZGl0b3JNb3VzZU1vdmUobW91c2VFdmVudCwga2V5Ym9hcmRFdmVudCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWNrTGlua0dlc3R1cmUub25FeGVjdXRlKChlKSA9PiB7XG5cdFx0XHR0aGlzLm9uRWRpdG9yTW91c2VVcChlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpY2tMaW5rR2VzdHVyZS5vbkNhbmNlbCgoZSkgPT4ge1xuXHRcdFx0dGhpcy5jbGVhblVwQWN0aXZlTGlua0RlY29yYXRpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKCFlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxpbmtzKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBSZW1vdmUgYW55IGxpbmtzIChmb3IgdGhlIGdldHRpbmcgZGlzYWJsZWQgY2FzZSlcblx0XHRcdHRoaXMudXBkYXRlRGVjb3JhdGlvbnMoW10pO1xuXG5cdFx0XHQvLyBTdG9wIGFueSBjb21wdXRhdGlvbiAoZm9yIHRoZSBnZXR0aW5nIGRpc2FibGVkIGNhc2UpXG5cdFx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdFx0Ly8gU3RhcnQgY29tcHV0aW5nIChmb3IgdGhlIGdldHRpbmcgZW5hYmxlZCBjYXNlKVxuXHRcdFx0dGhpcy5jb21wdXRlTGlua3Muc2NoZWR1bGUoMCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuY29tcHV0ZUxpbmtzLnNjaGVkdWxlKHRoaXMuZGVib3VuY2VJbmZvcm1hdGlvbi5nZXQodGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoZSkgPT4ge1xuXHRcdFx0dGhpcy5jdXJyZW50T2NjdXJyZW5jZXMgPSB7fTtcblx0XHRcdHRoaXMuYWN0aXZlTGlua0RlY29yYXRpb25JZCA9IG51bGw7XG5cdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdHRoaXMuY29tcHV0ZUxpbmtzLnNjaGVkdWxlKDApO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKChlKSA9PiB7XG5cdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdHRoaXMuY29tcHV0ZUxpbmtzLnNjaGVkdWxlKDApO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnByb3ZpZGVycy5vbkRpZENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0XHR0aGlzLmNvbXB1dGVMaW5rcy5zY2hlZHVsZSgwKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmNvbXB1dGVMaW5rcy5zY2hlZHVsZSgwKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29tcHV0ZUxpbmtzTm93KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSB8fCAhdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5rcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRpZiAobW9kZWwuaXNUb29MYXJnZUZvclN5bmNpbmcoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5wcm92aWRlcnMuaGFzKG1vZGVsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmFjdGl2ZUxpbmtzTGlzdCkge1xuXHRcdFx0dGhpcy5hY3RpdmVMaW5rc0xpc3QuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5hY3RpdmVMaW5rc0xpc3QgPSBudWxsO1xuXHRcdH1cblxuXHRcdHRoaXMuY29tcHV0ZVByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiBnZXRMaW5rcyh0aGlzLnByb3ZpZGVycywgbW9kZWwsIHRva2VuKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaChmYWxzZSk7XG5cdFx0XHR0aGlzLmFjdGl2ZUxpbmtzTGlzdCA9IGF3YWl0IHRoaXMuY29tcHV0ZVByb21pc2U7XG5cdFx0XHR0aGlzLmRlYm91bmNlSW5mb3JtYXRpb24udXBkYXRlKG1vZGVsLCBzdy5lbGFwc2VkKCkpO1xuXHRcdFx0aWYgKG1vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZURlY29yYXRpb25zKHRoaXMuYWN0aXZlTGlua3NMaXN0LmxpbmtzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuY29tcHV0ZVByb21pc2UgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRGVjb3JhdGlvbnMobGlua3M6IExpbmtbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHVzZU1ldGFLZXkgPSAodGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5tdWx0aUN1cnNvck1vZGlmaWVyKSA9PT0gJ2FsdEtleScpO1xuXHRcdGNvbnN0IG9sZERlY29yYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLmN1cnJlbnRPY2N1cnJlbmNlcyk7XG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uSWQgb2Yga2V5cykge1xuXHRcdFx0Y29uc3Qgb2NjdXJlbmNlID0gdGhpcy5jdXJyZW50T2NjdXJyZW5jZXNbZGVjb3JhdGlvbklkXTtcblx0XHRcdG9sZERlY29yYXRpb25zLnB1c2gob2NjdXJlbmNlLmRlY29yYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3RGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0aWYgKGxpbmtzKSB7XG5cdFx0XHQvLyBOb3Qgc3VyZSB3aHkgdGhpcyBpcyBzb21ldGltZXMgbnVsbFxuXHRcdFx0Zm9yIChjb25zdCBsaW5rIG9mIGxpbmtzKSB7XG5cdFx0XHRcdG5ld0RlY29yYXRpb25zLnB1c2goTGlua09jY3VycmVuY2UuZGVjb3JhdGlvbihsaW5rLCB1c2VNZXRhS2V5KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IGNoYW5nZUFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbnMsIG5ld0RlY29yYXRpb25zKTtcblxuXHRcdFx0dGhpcy5jdXJyZW50T2NjdXJyZW5jZXMgPSB7fTtcblx0XHRcdHRoaXMuYWN0aXZlTGlua0RlY29yYXRpb25JZCA9IG51bGw7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZGVjb3JhdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgb2NjdXJlbmNlID0gbmV3IExpbmtPY2N1cnJlbmNlKGxpbmtzW2ldLCBkZWNvcmF0aW9uc1tpXSk7XG5cdFx0XHRcdHRoaXMuY3VycmVudE9jY3VycmVuY2VzW29jY3VyZW5jZS5kZWNvcmF0aW9uSWRdID0gb2NjdXJlbmNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FZGl0b3JNb3VzZU1vdmUobW91c2VFdmVudDogQ2xpY2tMaW5rTW91c2VFdmVudCwgd2l0aEtleTogQ2xpY2tMaW5rS2V5Ym9hcmRFdmVudCB8IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCB1c2VNZXRhS2V5ID0gKHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubXVsdGlDdXJzb3JNb2RpZmllcikgPT09ICdhbHRLZXknKTtcblx0XHRpZiAodGhpcy5pc0VuYWJsZWQobW91c2VFdmVudCwgd2l0aEtleSkpIHtcblx0XHRcdHRoaXMuY2xlYW5VcEFjdGl2ZUxpbmtEZWNvcmF0aW9uKCk7IC8vIGFsd2F5cyByZW1vdmUgcHJldmlvdXMgbGluayBkZWNvcmF0aW9uIGFzIHRoZWlyIGNhbiBvbmx5IGJlIG9uZVxuXHRcdFx0Y29uc3Qgb2NjdXJyZW5jZSA9IHRoaXMuZ2V0TGlua09jY3VycmVuY2UobW91c2VFdmVudC50YXJnZXQucG9zaXRpb24pO1xuXHRcdFx0aWYgKG9jY3VycmVuY2UpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdFx0b2NjdXJyZW5jZS5hY3RpdmF0ZShjaGFuZ2VBY2Nlc3NvciwgdXNlTWV0YUtleSk7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVMaW5rRGVjb3JhdGlvbklkID0gb2NjdXJyZW5jZS5kZWNvcmF0aW9uSWQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNsZWFuVXBBY3RpdmVMaW5rRGVjb3JhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYW5VcEFjdGl2ZUxpbmtEZWNvcmF0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHVzZU1ldGFLZXkgPSAodGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5tdWx0aUN1cnNvck1vZGlmaWVyKSA9PT0gJ2FsdEtleScpO1xuXHRcdGlmICh0aGlzLmFjdGl2ZUxpbmtEZWNvcmF0aW9uSWQpIHtcblx0XHRcdGNvbnN0IG9jY3VycmVuY2UgPSB0aGlzLmN1cnJlbnRPY2N1cnJlbmNlc1t0aGlzLmFjdGl2ZUxpbmtEZWNvcmF0aW9uSWRdO1xuXHRcdFx0aWYgKG9jY3VycmVuY2UpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdFx0b2NjdXJyZW5jZS5kZWFjdGl2YXRlKGNoYW5nZUFjY2Vzc29yLCB1c2VNZXRhS2V5KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuYWN0aXZlTGlua0RlY29yYXRpb25JZCA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvck1vdXNlVXAobW91c2VFdmVudDogQ2xpY2tMaW5rTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc0VuYWJsZWQobW91c2VFdmVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgb2NjdXJyZW5jZSA9IHRoaXMuZ2V0TGlua09jY3VycmVuY2UobW91c2VFdmVudC50YXJnZXQucG9zaXRpb24pO1xuXHRcdGlmICghb2NjdXJyZW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm9wZW5MaW5rT2NjdXJyZW5jZShvY2N1cnJlbmNlLCBtb3VzZUV2ZW50Lmhhc1NpZGVCeVNpZGVNb2RpZmllciwgdHJ1ZSAvKiBmcm9tIHVzZXIgZ2VzdHVyZSAqLyk7XG5cdH1cblxuXHRwdWJsaWMgb3BlbkxpbmtPY2N1cnJlbmNlKG9jY3VycmVuY2U6IExpbmtPY2N1cnJlbmNlLCBvcGVuVG9TaWRlOiBib29sZWFuLCBmcm9tVXNlckdlc3R1cmUgPSBmYWxzZSk6IHZvaWQge1xuXG5cdFx0aWYgKCF0aGlzLm9wZW5lclNlcnZpY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGxpbmsgfSA9IG9jY3VycmVuY2U7XG5cblx0XHRsaW5rLnJlc29sdmUoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbih1cmkgPT4ge1xuXG5cdFx0XHQvLyBTdXBwb3J0IGZvciByZWxhdGl2ZSBmaWxlIFVSSXMgb2YgdGhlIHNoYXBlIGZpbGU6Ly8uL3JlbGF0aXZlRmlsZS50eHQgb3IgZmlsZTovLy8uL3JlbGF0aXZlRmlsZS50eHRcblx0XHRcdGlmICh0eXBlb2YgdXJpID09PSAnc3RyaW5nJyAmJiB0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsVXJpID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKS51cmk7XG5cdFx0XHRcdGlmIChtb2RlbFVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiB1cmkuc3RhcnRzV2l0aChgJHtTY2hlbWFzLmZpbGV9OmApKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkVXJpID0gVVJJLnBhcnNlKHVyaSk7XG5cdFx0XHRcdFx0aWYgKHBhcnNlZFVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZnNQYXRoID0gcmVzb3VyY2VzLm9yaWdpbmFsRlNQYXRoKHBhcnNlZFVyaSk7XG5cblx0XHRcdFx0XHRcdGxldCByZWxhdGl2ZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHRcdFx0aWYgKGZzUGF0aC5zdGFydHNXaXRoKCcvLi8nKSB8fCBmc1BhdGguc3RhcnRzV2l0aCgnXFxcXC5cXFxcJykpIHtcblx0XHRcdFx0XHRcdFx0cmVsYXRpdmVQYXRoID0gYC4ke2ZzUGF0aC5zdWJzdHIoMSl9YDtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZnNQYXRoLnN0YXJ0c1dpdGgoJy8vLi8nKSB8fCBmc1BhdGguc3RhcnRzV2l0aCgnXFxcXFxcXFwuXFxcXCcpKSB7XG5cdFx0XHRcdFx0XHRcdHJlbGF0aXZlUGF0aCA9IGAuJHtmc1BhdGguc3Vic3RyKDIpfWA7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChyZWxhdGl2ZVBhdGgpIHtcblx0XHRcdFx0XHRcdFx0dXJpID0gcmVzb3VyY2VzLmpvaW5QYXRoKG1vZGVsVXJpLCByZWxhdGl2ZVBhdGgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4odXJpLCB7IG9wZW5Ub1NpZGUsIGZyb21Vc2VyR2VzdHVyZSwgYWxsb3dDb250cmlidXRlZE9wZW5lcnM6IHRydWUsIGFsbG93Q29tbWFuZHM6IHRydWUsIGZyb21Xb3Jrc3BhY2U6IHRydWUgfSk7XG5cblx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0Y29uc3QgbWVzc2FnZU9yRXJyb3IgPVxuXHRcdFx0XHRlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogZXJyO1xuXHRcdFx0Ly8gZGlmZmVyZW50IGVycm9yIGNhc2VzXG5cdFx0XHRpZiAobWVzc2FnZU9yRXJyb3IgPT09ICdpbnZhbGlkJykge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uud2FybihubHMubG9jYWxpemUoJ2ludmFsaWQudXJsJywgJ0ZhaWxlZCB0byBvcGVuIHRoaXMgbGluayBiZWNhdXNlIGl0IGlzIG5vdCB3ZWxsLWZvcm1lZDogezB9JywgbGluay51cmwhLnRvU3RyaW5nKCkpKTtcblx0XHRcdH0gZWxzZSBpZiAobWVzc2FnZU9yRXJyb3IgPT09ICdtaXNzaW5nJykge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uud2FybihubHMubG9jYWxpemUoJ21pc3NpbmcudXJsJywgJ0ZhaWxlZCB0byBvcGVuIHRoaXMgbGluayBiZWNhdXNlIGl0cyB0YXJnZXQgaXMgbWlzc2luZy4nKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldExpbmtPY2N1cnJlbmNlKHBvc2l0aW9uOiBQb3NpdGlvbiB8IG51bGwpOiBMaW5rT2NjdXJyZW5jZSB8IG51bGwge1xuXHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSB8fCAhcG9zaXRpb24pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCkuZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdHN0YXJ0Q29sdW1uOiBwb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0ZW5kQ29sdW1uOiBwb3NpdGlvbi5jb2x1bW5cblx0XHR9LCAwLCB0cnVlKTtcblxuXHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBkZWNvcmF0aW9ucykge1xuXHRcdFx0Y29uc3QgY3VycmVudE9jY3VycmVuY2UgPSB0aGlzLmN1cnJlbnRPY2N1cnJlbmNlc1tkZWNvcmF0aW9uLmlkXTtcblx0XHRcdGlmIChjdXJyZW50T2NjdXJyZW5jZSkge1xuXHRcdFx0XHRyZXR1cm4gY3VycmVudE9jY3VycmVuY2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGlzRW5hYmxlZChtb3VzZUV2ZW50OiBDbGlja0xpbmtNb3VzZUV2ZW50LCB3aXRoS2V5PzogQ2xpY2tMaW5rS2V5Ym9hcmRFdmVudCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gQm9vbGVhbihcblx0XHRcdChtb3VzZUV2ZW50LnRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUKVxuXHRcdFx0JiYgKChtb3VzZUV2ZW50Lmhhc1RyaWdnZXJNb2RpZmllciB8fCAod2l0aEtleSAmJiB3aXRoS2V5LmtleUNvZGVJc1RyaWdnZXJLZXkpKSB8fCBtb3VzZUV2ZW50LmlzTWlkZGxlQ2xpY2sgJiYgbW91c2VFdmVudC5tb3VzZU1pZGRsZUNsaWNrQWN0aW9uID09PSAnb3BlbkxpbmsnKVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHN0b3AoKTogdm9pZCB7XG5cdFx0dGhpcy5jb21wdXRlTGlua3MuY2FuY2VsKCk7XG5cdFx0aWYgKHRoaXMuYWN0aXZlTGlua3NMaXN0KSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUxpbmtzTGlzdD8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5hY3RpdmVMaW5rc0xpc3QgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jb21wdXRlUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5jb21wdXRlUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdHRoaXMuY29tcHV0ZVByb21pc2UgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLnN0b3AoKTtcblx0fVxufVxuXG5jb25zdCBkZWNvcmF0aW9uID0ge1xuXHRnZW5lcmFsOiBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRkZXNjcmlwdGlvbjogJ2RldGVjdGVkLWxpbmsnLFxuXHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdGNvbGxhcHNlT25SZXBsYWNlRWRpdDogdHJ1ZSxcblx0XHRpbmxpbmVDbGFzc05hbWU6ICdkZXRlY3RlZC1saW5rJ1xuXHR9KSxcblx0YWN0aXZlOiBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRkZXNjcmlwdGlvbjogJ2RldGVjdGVkLWxpbmstYWN0aXZlJyxcblx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHRjb2xsYXBzZU9uUmVwbGFjZUVkaXQ6IHRydWUsXG5cdFx0aW5saW5lQ2xhc3NOYW1lOiAnZGV0ZWN0ZWQtbGluay1hY3RpdmUnXG5cdH0pXG59O1xuXG5jbGFzcyBMaW5rT2NjdXJyZW5jZSB7XG5cblx0cHVibGljIHN0YXRpYyBkZWNvcmF0aW9uKGxpbms6IExpbmssIHVzZU1ldGFLZXk6IGJvb2xlYW4pOiBJTW9kZWxEZWx0YURlY29yYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogbGluay5yYW5nZSxcblx0XHRcdG9wdGlvbnM6IExpbmtPY2N1cnJlbmNlLl9nZXRPcHRpb25zKGxpbmssIHVzZU1ldGFLZXksIGZhbHNlKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0T3B0aW9ucyhsaW5rOiBMaW5rLCB1c2VNZXRhS2V5OiBib29sZWFuLCBpc0FjdGl2ZTogYm9vbGVhbik6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB7IC4uLiAoaXNBY3RpdmUgPyBkZWNvcmF0aW9uLmFjdGl2ZSA6IGRlY29yYXRpb24uZ2VuZXJhbCkgfTtcblx0XHRvcHRpb25zLmhvdmVyTWVzc2FnZSA9IGdldEhvdmVyTWVzc2FnZShsaW5rLCB1c2VNZXRhS2V5KTtcblx0XHRyZXR1cm4gb3B0aW9ucztcblx0fVxuXG5cdHB1YmxpYyBkZWNvcmF0aW9uSWQ6IHN0cmluZztcblx0cHVibGljIGxpbms6IExpbms7XG5cblx0Y29uc3RydWN0b3IobGluazogTGluaywgZGVjb3JhdGlvbklkOiBzdHJpbmcpIHtcblx0XHR0aGlzLmxpbmsgPSBsaW5rO1xuXHRcdHRoaXMuZGVjb3JhdGlvbklkID0gZGVjb3JhdGlvbklkO1xuXHR9XG5cblx0cHVibGljIGFjdGl2YXRlKGNoYW5nZUFjY2Vzc29yOiBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yLCB1c2VNZXRhS2V5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y2hhbmdlQWNjZXNzb3IuY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnModGhpcy5kZWNvcmF0aW9uSWQsIExpbmtPY2N1cnJlbmNlLl9nZXRPcHRpb25zKHRoaXMubGluaywgdXNlTWV0YUtleSwgdHJ1ZSkpO1xuXHR9XG5cblx0cHVibGljIGRlYWN0aXZhdGUoY2hhbmdlQWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IsIHVzZU1ldGFLZXk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjaGFuZ2VBY2Nlc3Nvci5jaGFuZ2VEZWNvcmF0aW9uT3B0aW9ucyh0aGlzLmRlY29yYXRpb25JZCwgTGlua09jY3VycmVuY2UuX2dldE9wdGlvbnModGhpcy5saW5rLCB1c2VNZXRhS2V5LCBmYWxzZSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEhvdmVyTWVzc2FnZShsaW5rOiBMaW5rLCB1c2VNZXRhS2V5OiBib29sZWFuKTogTWFya2Rvd25TdHJpbmcge1xuXHRjb25zdCBleGVjdXRlQ21kID0gbGluay51cmwgJiYgL15jb21tYW5kOi9pLnRlc3QobGluay51cmwudG9TdHJpbmcoKSk7XG5cblx0Y29uc3QgbGFiZWwgPSBsaW5rLnRvb2x0aXBcblx0XHQ/IGxpbmsudG9vbHRpcFxuXHRcdDogZXhlY3V0ZUNtZFxuXHRcdFx0PyBubHMubG9jYWxpemUoJ2xpbmtzLm5hdmlnYXRlLmV4ZWN1dGVDbWQnLCAnRXhlY3V0ZSBjb21tYW5kJylcblx0XHRcdDogbmxzLmxvY2FsaXplKCdsaW5rcy5uYXZpZ2F0ZS5mb2xsb3cnLCAnRm9sbG93IGxpbmsnKTtcblxuXHRjb25zdCBrYiA9IHVzZU1ldGFLZXlcblx0XHQ/IHBsYXRmb3JtLmlzTWFjaW50b3NoXG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgnbGlua3MubmF2aWdhdGUua2IubWV0YS5tYWMnLCBcImNtZCArIGNsaWNrXCIpXG5cdFx0XHQ6IG5scy5sb2NhbGl6ZSgnbGlua3MubmF2aWdhdGUua2IubWV0YScsIFwiY3RybCArIGNsaWNrXCIpXG5cdFx0OiBwbGF0Zm9ybS5pc01hY2ludG9zaFxuXHRcdFx0PyBubHMubG9jYWxpemUoJ2xpbmtzLm5hdmlnYXRlLmtiLmFsdC5tYWMnLCBcIm9wdGlvbiArIGNsaWNrXCIpXG5cdFx0XHQ6IG5scy5sb2NhbGl6ZSgnbGlua3MubmF2aWdhdGUua2IuYWx0JywgXCJhbHQgKyBjbGlja1wiKTtcblxuXHRpZiAobGluay51cmwpIHtcblx0XHRsZXQgbmF0aXZlTGFiZWwgPSAnJztcblx0XHRpZiAoL15jb21tYW5kOi9pLnRlc3QobGluay51cmwudG9TdHJpbmcoKSkpIHtcblx0XHRcdC8vIERvbid0IHNob3cgY29tcGxldGUgY29tbWFuZCBhcmd1bWVudHMgaW4gdGhlIG5hdGl2ZSB0b29sdGlwXG5cdFx0XHRjb25zdCBtYXRjaCA9IGxpbmsudXJsLnRvU3RyaW5nKCkubWF0Y2goL15jb21tYW5kOihbXj8jXSspLyk7XG5cdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZElkID0gbWF0Y2hbMV07XG5cdFx0XHRcdG5hdGl2ZUxhYmVsID0gbmxzLmxvY2FsaXplKCd0b29sdGlwLmV4cGxhbmF0aW9uJywgXCJFeGVjdXRlIGNvbW1hbmQgezB9XCIsIGNvbW1hbmRJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGhvdmVyTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygnJywgdHJ1ZSlcblx0XHRcdC5hcHBlbmRMaW5rKGxpbmsudXJsLnRvU3RyaW5nKHRydWUpLnJlcGxhY2UoLyAvZywgJyUyMCcpLCBsYWJlbCwgbmF0aXZlTGFiZWwpXG5cdFx0XHQuYXBwZW5kTWFya2Rvd24oYCAoJHtrYn0pYCk7XG5cdFx0cmV0dXJuIGhvdmVyTWVzc2FnZTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChgJHtsYWJlbH0gKCR7a2J9KWApO1xuXHR9XG59XG5cbmNsYXNzIE9wZW5MaW5rQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ub3BlbkxpbmsnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2xhYmVsJywgXCJPcGVuIExpbmtcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGxpbmtEZXRlY3RvciA9IExpbmtEZXRlY3Rvci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWxpbmtEZXRlY3Rvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0Zm9yIChjb25zdCBzZWwgb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0Y29uc3QgbGluayA9IGxpbmtEZXRlY3Rvci5nZXRMaW5rT2NjdXJyZW5jZShzZWwuZ2V0RW5kUG9zaXRpb24oKSk7XG5cdFx0XHRpZiAobGluaykge1xuXHRcdFx0XHRsaW5rRGV0ZWN0b3Iub3BlbkxpbmtPY2N1cnJlbmNlKGxpbmssIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oTGlua0RldGVjdG9yLklELCBMaW5rRGV0ZWN0b3IsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uQWZ0ZXJGaXJzdFJlbmRlcik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihPcGVuTGlua0FjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQTRDLHdCQUF3QjtBQUM3RSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsWUFBWSxjQUFjO0FBQzFCLFlBQVksZUFBZTtBQUMzQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsT0FBTztBQUNQLFNBQXNCLHVCQUF1QjtBQUM3QyxTQUFTLGNBQWMsaUNBQWlDLHNCQUFzQixrQ0FBb0Q7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
