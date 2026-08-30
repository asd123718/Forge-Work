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
import * as dom from "../../../../../../base/browser/dom.js";
import { allowedMarkdownHtmlAttributes } from "../../../../../../base/browser/markdownRenderer.js";
import { status } from "../../../../../../base/browser/ui/aria/aria.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { wrapTablesWithScrollable } from "./chatMarkdownTableScrolling.js";
import { coalesce } from "../../../../../../base/common/arrays.js";
import { findLast } from "../../../../../../base/common/arraysFind.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { isCancellationError } from "../../../../../../base/common/errors.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { Disposable, DisposableStore, dispose, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { autorun, autorunSelfDisposable, derived } from "../../../../../../base/common/observable.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { isLocation } from "../../../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { EditDeltaInfo } from "../../../../../../editor/common/textModelEditSource.js";
import { localize } from "../../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IEditorService, SIDE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { AccessibilityWorkbenchSettingId } from "../../../../accessibility/browser/accessibilityConfiguration.js";
import { IAiEditTelemetryService } from "../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { MarkedKatexSupport } from "../../../../markdown/browser/markedKatexSupport.js";
import { extractCodeblockUrisFromText, extractVulnerabilitiesFromText } from "../../../common/widget/annotations.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { isRequestVM, isResponseVM } from "../../../common/model/chatViewModel.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IChatOutputRendererService } from "../../chatOutputItemRenderer.js";
import { allowedChatMarkdownHtmlTags } from "../chatContentMarkdownRenderer.js";
import { MarkdownDiffBlockPart, parseUnifiedDiff } from "./chatDiffBlockPart.js";
import { ChatMarkdownDecorationsRenderer } from "./chatMarkdownDecorationsRenderer.js";
import { CodeBlockPart } from "./codeBlockPart.js";
import "./media/chatCodeBlockPill.css";
import { ChatEditPillElement, isResourceContentEmpty } from "./chatEditPillElement.js";
import { ChatExtensionsContentPart } from "./chatExtensionsContentPart.js";
import { ChatProgressSubPart } from "./chatProgressContentPart.js";
import { IncrementalDOMMorpher } from "./chatIncrementalRendering/chatIncrementalRendering.js";
import { IChatOutputPartStateCache } from "./chatOutputPartStateCache.js";
import "./media/chatMarkdownPart.css";
const $ = dom.$;
let ChatMarkdownContentPart = class extends Disposable {
  constructor(markdown, context, editorPool, fillInIncompleteTokens = false, codeBlockStartIndex = 0, renderer, markdownRenderOptions, currentWidth, rendererOptions, contextKeyService, configurationService, instantiationService, aiEditTelemetryService, chatOutputRendererService, chatSessionsService) {
    super();
    this.markdown = markdown;
    this.editorPool = editorPool;
    this.rendererOptions = rendererOptions;
    this.instantiationService = instantiationService;
    this.aiEditTelemetryService = aiEditTelemetryService;
    this.chatOutputRendererService = chatOutputRendererService;
    this.chatSessionsService = chatSessionsService;
    this.codeblocksPartId = String(++ChatMarkdownContentPart.ID_POOL);
    // This Event exists for one specific scenario and the pattern shouldn't be copied without a good reason
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._onDidChangeDiff = this._register(new Emitter());
    /**
     * Fires when any edit pill (CollapsedCodeBlock) in this markdown part updates its diff.
     * The data includes the total stats and current resources across all edit pills.
     */
    this.onDidChangeDiff = this._onDidChangeDiff.event;
    this._onDidFinishRendering = this._register(new Emitter());
    this.onDidFinishRendering = this._onDidFinishRendering.event;
    this.allRefs = [];
    this._codeblocks = [];
    this.mathLayoutParticipants = /* @__PURE__ */ new Set();
    const element = context.element;
    const inUndoStop = findLast(context.content, (e) => e.kind === "undoStop", context.contentIndex)?.id;
    let globalCodeBlockIndexStart = codeBlockStartIndex;
    this.domNode = $("div.chat-markdown-part");
    if (this.rendererOptions.accessibilityOptions?.statusMessage) {
      this.domNode.ariaLabel = this.rendererOptions.accessibilityOptions.statusMessage;
      if (configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates)) {
        status(this.rendererOptions.accessibilityOptions.statusMessage);
      }
    }
    const enableMath = configurationService.getValue(ChatConfiguration.EnableMath);
    const incrementalRenderingEnabled = configurationService.getValue(ChatConfiguration.IncrementalRendering);
    if (incrementalRenderingEnabled && isResponseVM(element) && fillInIncompleteTokens && !element.isComplete) {
      this._incrementalMorpher = this._register(instantiationService.createInstance(IncrementalDOMMorpher, this.domNode));
      this._register(this._incrementalMorpher.onDidDrain(() => this._onDidFinishRendering.fire()));
      this._incrementalMorpher.setRenderCallback((newMd) => {
        const savedMarkdown = this.markdown;
        const content = new MarkdownString(newMd, this.markdown.content);
        content.baseUri = URI.revive(this.markdown.content.baseUri);
        content.uris = this.markdown.content.uris;
        this.markdown = { ...this.markdown, content };
        doRenderMarkdown();
        this.markdown = savedMarkdown;
        this._onDidChangeHeight.fire();
      });
    }
    const renderStore = this._register(new MutableDisposable());
    const markdownDecorationsRenderer = this._register(instantiationService.createInstance(ChatMarkdownDecorationsRenderer));
    const doRenderMarkdown = () => {
      if (this._store.isDisposed) {
        return;
      }
      const previousRenderStore = renderStore.clearAndLeak();
      const reusableOutputCodeBlockRefs = /* @__PURE__ */ new Map();
      for (const ref of this.allRefs) {
        if (ref.object instanceof ChatOutputCodeBlockPart) {
          const outputRef = ref;
          previousRenderStore?.deleteAndLeak(outputRef);
          reusableOutputCodeBlockRefs.set(outputRef.object.reuseKey, outputRef);
        }
      }
      previousRenderStore?.dispose();
      const store = new DisposableStore();
      renderStore.value = store;
      dom.clearNode(this.domNode);
      this.allRefs.length = 0;
      this._codeblocks.length = 0;
      this.mathLayoutParticipants.clear();
      globalCodeBlockIndexStart = codeBlockStartIndex;
      const markedExtensions = enableMath ? coalesce([MarkedKatexSupport.getExtension(dom.getWindow(context.container), {
        throwOnError: false
      })]) : [];
      const markedOpts = {
        gfm: true,
        breaks: true
      };
      const configuredUriTransformer = markdownRenderOptions?.transformUri;
      const transformUri = isResponseVM(element) ? (href, kind) => this.chatSessionsService.resolveChatResponseUri(element.sessionResource, configuredUriTransformer?.(href, kind) ?? href, kind) : configuredUriTransformer;
      const result = store.add(renderer.render(this.markdown.content, {
        sanitizerConfig: MarkedKatexSupport.getSanitizerOptions({
          allowedTags: allowedChatMarkdownHtmlTags,
          allowedAttributes: allowedMarkdownHtmlAttributes
        }),
        fillInIncompleteTokens,
        codeBlockRendererSync: (languageId, text, raw) => {
          const isCodeBlockComplete = !isResponseVM(context.element) || context.element.isComplete || !raw || codeblockHasClosingBackticks(raw);
          const hasChatOutputRenderer = !!languageId && this.chatOutputRendererService.hasCodeBlockRenderer(languageId);
          if ((!text || text.startsWith("<vscode_codeblock_uri") && !text.includes("\n")) && !isCodeBlockComplete && !hasChatOutputRenderer) {
            const hideEmptyCodeblock = $("div");
            hideEmptyCodeblock.style.display = "none";
            return hideEmptyCodeblock;
          }
          if (languageId === "diff" && raw && this.rendererOptions.allowInlineDiffs) {
            const match = raw.match(/^```diff:(\w+)/);
            if (match && isResponseVM(context.element)) {
              const actualLanguageId = match[1];
              const codeBlockUri = extractCodeblockUrisFromText(text);
              const { before, after } = parseUnifiedDiff(codeBlockUri?.textWithoutResult ?? text);
              const diffData = {
                element: context.element,
                codeBlockIndex: globalCodeBlockIndexStart++,
                languageId: actualLanguageId,
                beforeContent: before,
                afterContent: after,
                codeBlockResource: codeBlockUri?.uri,
                isReadOnly: true,
                horizontalPadding: this.rendererOptions.horizontalPadding
              };
              const diffPart = this.instantiationService.createInstance(MarkdownDiffBlockPart, diffData, context.diffEditorPool, context.currentWidth.get());
              const ref2 = {
                object: diffPart,
                isStale: () => false,
                dispose: () => diffPart.dispose()
              };
              this.allRefs.push(ref2);
              store.add(ref2);
              return diffPart.element;
            }
          }
          if (languageId === "vscode-extensions") {
            const chatExtensions = store.add(instantiationService.createInstance(ChatExtensionsContentPart, { kind: "extensions", extensions: text.split(",") }));
            return chatExtensions.domNode;
          }
          const globalIndex = globalCodeBlockIndexStart++;
          let codeBlockText = text;
          const extractedVulns = extractVulnerabilitiesFromText(text);
          codeBlockText = fixCodeText(extractedVulns.newText, languageId);
          const vulns = extractedVulns.vulnerabilities;
          let codemapperUri;
          let isEdit;
          const codeblockUri = extractCodeblockUrisFromText(codeBlockText);
          if (codeblockUri) {
            codemapperUri = codeblockUri.uri;
            isEdit = codeblockUri.isEdit;
            codeBlockText = codeblockUri.textWithoutResult;
          }
          const hideToolbar = isResponseVM(element) && element.errorDetails?.responseIsFiltered;
          const renderOptions = {
            ...this.rendererOptions.codeBlockRenderOptions
          };
          if (hideToolbar !== void 0) {
            renderOptions.hideToolbar = hideToolbar;
          }
          const codeBlockInfo = { languageId, text: codeBlockText, codeBlockIndex: globalIndex, element, parentContextKeyService: contextKeyService, vulns, codemapperUri, renderOptions, chatSessionResource: element.sessionResource };
          const baseCodeBlockInfo = {
            ownerMarkdownPartId: this.codeblocksPartId,
            codeBlockIndex: globalIndex,
            elementId: element.id,
            chatSessionResource: element.sessionResource,
            languageId,
            editDeltaInfo: EditDeltaInfo.fromText(text)
          };
          if (element.isCompleteAddedRequest || !codemapperUri || !isEdit) {
            if (hasChatOutputRenderer) {
              const ref3 = this.renderChatOutputCodeBlock(languageId, codeBlockText, globalIndex, context, isCodeBlockComplete, reusableOutputCodeBlockRefs);
              this._codeblocks.push({
                ...baseCodeBlockInfo,
                codemapperUri: codeBlockInfo.codemapperUri,
                isStreamingEdit: false,
                get uri() {
                  return void 0;
                },
                focus() {
                  ref3.object.focus();
                }
              });
              store.add(ref3);
              return ref3.object.element;
            }
            const ref2 = this.renderCodeBlock(codeBlockInfo, currentWidth);
            this._codeblocks.push({
              ...baseCodeBlockInfo,
              codemapperUri: codeBlockInfo.codemapperUri,
              isStreamingEdit: false,
              get uri() {
                return ref2.object.uri;
              },
              focus() {
                ref2.object.focus();
              }
            });
            store.add(ref2);
            return ref2.object.element;
          }
          const requestId = isRequestVM(element) ? element.id : element.requestId;
          const ref = this.renderCodeBlockPill(element.sessionResource, requestId, inUndoStop, codemapperUri);
          this._codeblocks.push({
            ...baseCodeBlockInfo,
            codemapperUri,
            isStreamingEdit: !isCodeBlockComplete,
            get uri() {
              return void 0;
            },
            focus() {
              return ref.object.element.focus();
            }
          });
          store.add(ref);
          return ref.object.element;
        },
        markedOptions: markedOpts,
        markedExtensions,
        ...markdownRenderOptions,
        transformUri
      }, this.domNode));
      if (isResponseVM(element) && !element.model.codeBlockInfos && element.model.isComplete) {
        element.model.initializeCodeBlockInfos(this._codeblocks.map((info) => {
          return {
            suggestionId: this.aiEditTelemetryService.createSuggestionId({
              presentation: "codeBlock",
              feature: "sideBarChat",
              editDeltaInfo: info.editDeltaInfo,
              languageId: info.languageId,
              modeId: element.model.request?.modeInfo?.telemetryModeId,
              modelId: element.model.request?.modelId,
              applyCodeBlockSuggestionId: void 0,
              source: void 0,
              sourceRequestId: void 0
            })
          };
        }));
      }
      store.add(markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(this.markdown, result.element));
      const layoutParticipants = new Lazy(() => {
        const observer = store.add(new dom.DisposableResizeObserver("ChatMarkdownContentPart.mathLayout", () => this.mathLayoutParticipants.forEach((layout) => layout())));
        store.add(observer.observe(this.domNode));
        return this.mathLayoutParticipants;
      });
      for (const katexBlock of this.domNode.querySelectorAll(".katex-display")) {
        if (!dom.isHTMLElement(katexBlock)) {
          continue;
        }
        const scrollable = new DomScrollableElement(katexBlock.cloneNode(true), {
          vertical: ScrollbarVisibility.Hidden,
          horizontal: ScrollbarVisibility.Auto
        });
        store.add(scrollable);
        katexBlock.replaceWith(scrollable.getDomNode());
        layoutParticipants.value.add(() => {
          scrollable.scanDomNode();
        });
        scrollable.scanDomNode();
      }
      store.add(wrapTablesWithScrollable(this.domNode, layoutParticipants));
      dispose(reusableOutputCodeBlockRefs.values());
    };
    doRenderMarkdown();
    this._incrementalMorpher?.seed(
      markdown.content.value,
      /* animateInitial */
      true
    );
    if (enableMath && !MarkedKatexSupport.getExtension(dom.getWindow(context.container))) {
      MarkedKatexSupport.loadExtension(dom.getWindow(context.container)).then(() => {
        doRenderMarkdown();
      }).catch((e) => {
        console.error("Failed to load MarkedKatexSupport extension:", e);
      });
    }
  }
  get codeblocks() {
    return this._codeblocks;
  }
  dispose() {
    super.dispose();
    dispose(this.allRefs);
    this.allRefs.length = 0;
  }
  renderCodeBlockPill(sessionResource, requestId, inUndoStop, codemapperUri) {
    const codeBlock = this.instantiationService.createInstance(CollapsedCodeBlock, sessionResource, requestId, inUndoStop);
    const diffListenerStore = new DisposableStore();
    const ref = {
      object: codeBlock,
      isStale: () => false,
      dispose: () => {
        codeBlock.dispose();
        diffListenerStore.dispose();
      }
    };
    this.allRefs.push(ref);
    diffListenerStore.add(codeBlock.onDidChangeDiff(() => this.fireAggregatedDiff()));
    codeBlock.render(codemapperUri);
    return ref;
  }
  renderChatOutputCodeBlock(identifier, text, codeBlockIndex, context, isComplete, reusableOutputCodeBlockRefs) {
    const reuseKey = ChatOutputCodeBlockPart.reuseKey(context.element.id, codeBlockIndex, identifier);
    const reusableRef = reusableOutputCodeBlockRefs.get(reuseKey);
    if (reusableRef?.object.hasSameContent(identifier, text, isComplete)) {
      reusableOutputCodeBlockRefs.delete(reuseKey);
      this.allRefs.push(reusableRef);
      return reusableRef;
    }
    const codeBlock = this.instantiationService.createInstance(
      ChatOutputCodeBlockPart,
      identifier,
      text,
      codeBlockIndex,
      context,
      isComplete,
      () => this._onDidChangeHeight.fire()
    );
    const ref = {
      object: codeBlock,
      isStale: () => false,
      dispose: () => codeBlock.dispose()
    };
    this.allRefs.push(ref);
    return ref;
  }
  fireAggregatedDiff() {
    let totalAdded = 0;
    let totalRemoved = 0;
    const resources = [];
    for (const ref of this.allRefs) {
      if (ref.object instanceof CollapsedCodeBlock && ref.object.diff) {
        const diff = ref.object.diff;
        totalAdded += diff.added;
        totalRemoved += diff.removed;
        resources.push({
          resource: diff.modifiedURI,
          originalURI: diff.originalURI,
          modifiedURI: diff.isDeleted ? void 0 : diff.modifiedSnapshotURI ?? diff.modifiedURI
        });
      }
    }
    this._onDidChangeDiff.fire({ added: totalAdded, removed: totalRemoved, resources });
  }
  renderCodeBlock(data, currentWidth) {
    const key = CodeBlockPart.poolKey(data.element.id, data.codeBlockIndex);
    const ref = this.editorPool.get(key);
    this.allRefs.push(ref);
    ref.object.render(data, currentWidth);
    if (!this._store.isDisposed && isRequestVM(data.element)) {
      this._onDidChangeHeight.fire();
    }
    return ref;
  }
  hasSameContent(other) {
    if (other.kind !== "markdownContent") {
      return false;
    }
    if (other.content.value === this.markdown.content.value && equalsInlineReferences(other.inlineReferences, this.markdown.inlineReferences)) {
      return true;
    }
    const lastCodeblock = this._codeblocks.at(-1);
    if (lastCodeblock && lastCodeblock.codemapperUri !== void 0 && lastCodeblock.isStreamingEdit) {
      return other.content.value.lastIndexOf("```") === this.markdown.content.value.lastIndexOf("```");
    }
    return false;
  }
  get isRenderComplete() {
    return this._incrementalMorpher?.isDrained ?? true;
  }
  /**
   * Attempts an incremental DOM update for smooth streaming instead of
   * tearing down and rebuilding the entire markdown part.
   *
   * The morpher checks that the new content is a pure append, then
   * schedules a rAF-batched re-render through the full markdown
   * pipeline. Code blocks, tables, and all markdown features are
   * rendered correctly because the update goes through the standard
   * `doRenderMarkdown()` path.
   *
   * @param newMarkdown The new (appended) markdown content.
   * @returns `true` if the incremental update succeeded and the caller
   *          should treat this part as unchanged. `false` if a full
   *          re-render is needed.
   */
  tryIncrementalUpdate(newMarkdown) {
    if (!this._incrementalMorpher) {
      return false;
    }
    if (!equalsInlineReferences(newMarkdown.inlineReferences, this.markdown.inlineReferences)) {
      return false;
    }
    const success = this._incrementalMorpher.tryMorph(newMarkdown.content.value);
    if (success) {
      this.markdown = newMarkdown;
    }
    return success;
  }
  /**
   * Forward the stream's word-rate estimate to the morpher's buffer.
   */
  updateStreamRate(rate, isComplete) {
    this._incrementalMorpher?.updateStreamRate(rate, isComplete);
  }
  layout(width) {
    this.allRefs.forEach((ref, index) => {
      if (ref.object instanceof CodeBlockPart) {
        ref.object.layout(width);
      } else if (ref.object instanceof ChatOutputCodeBlockPart) {
        ref.object.layout(width);
      } else if (ref.object instanceof MarkdownDiffBlockPart) {
        ref.object.layout(width);
      } else if (ref.object instanceof CollapsedCodeBlock) {
        const codeblockModel = this._codeblocks[index];
        if (codeblockModel.codemapperUri && !isEqual(ref.object.uri, codeblockModel.codemapperUri)) {
          ref.object.render(codeblockModel.codemapperUri);
        }
      }
    });
    this.mathLayoutParticipants.forEach((layout) => layout());
  }
  onDidRemount() {
    for (const ref of this.allRefs) {
      if (ref.object instanceof CodeBlockPart || ref.object instanceof ChatOutputCodeBlockPart) {
        ref.object.onDidRemount();
      }
    }
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatMarkdownContentPart.ID_POOL = 0;
ChatMarkdownContentPart = __decorateClass([
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IAiEditTelemetryService),
  __decorateParam(13, IChatOutputRendererService),
  __decorateParam(14, IChatSessionsService)
], ChatMarkdownContentPart);
function equalsInlineReferences(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return !a && !b;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => equalsInlineReference(a[key], b[key]));
}
function equalsInlineReference(a, b) {
  if (!a || !b) {
    return !a && !b;
  }
  return a.resolveId === b.resolveId && a.name === b.name && equalsInlineReferenceValue(a.inlineReference, b.inlineReference);
}
const workspaceSymbolComparers = {
  name: (a, b) => a.name === b.name,
  containerName: (a, b) => a.containerName === b.containerName,
  kind: (a, b) => a.kind === b.kind,
  tags: (a, b) => equalsSymbolTags(a.tags, b.tags),
  location: (a, b) => isEqual(a.location.uri, b.location.uri) && Range.equalsRange(a.location.range, b.location.range)
};
const workspaceSymbolComparerKeys = Object.keys(workspaceSymbolComparers);
function equalsInlineReferenceValue(a, b) {
  if (URI.isUri(a) || URI.isUri(b)) {
    return URI.isUri(a) && URI.isUri(b) && isEqual(a, b);
  }
  if (isLocation(a) || isLocation(b)) {
    return isLocation(a) && isLocation(b) && isEqual(a.uri, b.uri) && Range.equalsRange(a.range, b.range);
  }
  return equalsWorkspaceSymbol(a, b);
}
function equalsWorkspaceSymbol(a, b) {
  return workspaceSymbolComparerKeys.every((key) => workspaceSymbolComparers[key](a, b));
}
function equalsSymbolTags(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every((tag, index) => tag === b[index]);
}
function codeblockHasClosingBackticks(str) {
  str = str.trim();
  return !!str.match(/\n```+$/);
}
let ChatOutputCodeBlockPart = class extends Disposable {
  constructor(identifier, text, codeBlockIndex, context, isComplete, onDidChangeHeight, instantiationService, chatOutputRendererService, stateCache) {
    super();
    this.identifier = identifier;
    this.text = text;
    this.context = context;
    this.isComplete = isComplete;
    this.onDidChangeHeight = onDidChangeHeight;
    this.instantiationService = instantiationService;
    this.chatOutputRendererService = chatOutputRendererService;
    this.stateCache = stateCache;
    this._disposeCts = this._register(new CancellationTokenSource());
    this._renderedOutputPart = this._register(new MutableDisposable());
    this.reuseKey = ChatOutputCodeBlockPart.reuseKey(context.element.id, codeBlockIndex, identifier);
    const title = localize("chat.renderedCodeBlockLabel", "Rendered code block {0}", codeBlockIndex + 1);
    this.element = $(".interactive-result-code-block.chat-output-code-block.tool-output-part");
    this.element.tabIndex = -1;
    this.element.ariaLabel = title;
    const parent = $(".webview-output");
    parent.style.maxHeight = "80vh";
    parent.style.minHeight = "38px";
    this.element.appendChild(parent);
    const stateCacheKey = `codeBlock/${context.element.sessionResource.toString()}/${context.element.id}/${codeBlockIndex}/${identifier.toLowerCase()}`;
    const partState = this.stateCache.get(stateCacheKey) ?? { height: 0 };
    this.stateCache.set(stateCacheKey, partState);
    if (partState.height) {
      parent.style.height = `${partState.height}px`;
    }
    const progressMessage = $("span");
    progressMessage.textContent = localize("chat.codeBlockOutputRendering", "Rendering code block...");
    const progressPart = this._register(this.instantiationService.createInstance(ChatProgressSubPart, progressMessage, ThemeIcon.modify(Codicon.loading, "spin"), void 0));
    parent.appendChild(progressPart.domNode);
    if (!isComplete) {
      this.onDidChangeHeight();
      return;
    }
    this.chatOutputRendererService.renderCodeBlock(identifier, new TextEncoder().encode(text), parent, {
      webviewState: partState.webviewState,
      title,
      chatSessionResource: this.context.element.sessionResource
    }, this._disposeCts.token).then((renderedItem) => {
      if (this._disposeCts.token.isCancellationRequested) {
        renderedItem.dispose();
        return;
      }
      this._renderedOutputPart.value = renderedItem;
      progressPart.domNode.remove();
      parent.style.minHeight = "";
      this.onDidChangeHeight();
      this._register(renderedItem.webview.onDidUpdateState((e) => {
        partState.webviewState = e;
      }));
      this._register(renderedItem.onDidChangeHeight((newHeight) => {
        partState.height = newHeight;
        this.onDidChangeHeight();
      }));
      this._register(this.context.onDidChangeVisibility((visible) => {
        if (visible) {
          renderedItem.reinitialize();
        }
      }));
    }, (error) => {
      if (isCancellationError(error)) {
        return;
      }
      console.error("Error rendering chat code block:", error);
      progressPart.domNode.replaceWith(this.renderError(error));
      parent.style.minHeight = "";
      this.onDidChangeHeight();
    });
  }
  static reuseKey(elementId, codeBlockIndex, identifier) {
    return `${elementId}/${codeBlockIndex}/${identifier.toLowerCase()}`;
  }
  hasSameContent(identifier, text, isComplete) {
    return identifier.toLowerCase() === this.identifier.toLowerCase() && text === this.text && isComplete === this.isComplete;
  }
  dispose() {
    this._disposeCts.dispose(true);
    super.dispose();
  }
  layout(width) {
    this.element.style.maxWidth = `${width}px`;
  }
  onDidRemount() {
    this._renderedOutputPart.value?.reinitialize();
  }
  focus() {
    const webview = this._renderedOutputPart.value?.webview;
    if (webview) {
      webview.focus();
    } else {
      this.element.focus();
    }
  }
  renderError(error) {
    const errorNode = $(".output-error");
    const errorHeaderNode = $(".output-error-header");
    dom.append(errorNode, errorHeaderNode);
    const iconElement = $("div");
    iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
    errorHeaderNode.append(iconElement);
    const errorTitleNode = $(".output-error-title");
    errorTitleNode.textContent = localize("chat.codeBlockOutputError", "Error rendering the code block");
    errorHeaderNode.append(errorTitleNode);
    const errorMessageNode = $(".output-error-details");
    errorMessageNode.textContent = error?.message || String(error);
    errorNode.append(errorMessageNode);
    return errorNode;
  }
};
ChatOutputCodeBlockPart = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IChatOutputRendererService),
  __decorateParam(8, IChatOutputPartStateCache)
], ChatOutputCodeBlockPart);
let CollapsedCodeBlock = class extends ChatEditPillElement {
  constructor(sessionResource, requestId, inUndoStop, labelService, editorService, modelService, languageService, contextMenuService, contextKeyService, menuService, hoverService, chatService, configurationService, textModelService) {
    super(labelService, modelService, languageService, hoverService);
    this.sessionResource = sessionResource;
    this.requestId = requestId;
    this.inUndoStop = inUndoStop;
    this.editorService = editorService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this.chatService = chatService;
    this.configurationService = configurationService;
    this.textModelService = textModelService;
    this._onDidChangeDiff = this._register(new Emitter());
    this.onDidChangeDiff = this._onDidChangeDiff.event;
    this.progressStore = this._store.add(new DisposableStore());
    this._register(this.onDidClick((e) => this.showDiff(e)));
    this._register(this.onDidContextMenu((event) => {
      this.contextMenuService.showContextMenu({
        contextKeyService: this.contextKeyService,
        getAnchor: () => event,
        getActions: () => {
          if (!this.uri) {
            return [];
          }
          const menu = this.menuService.getMenuActions(MenuId.ChatEditingCodeBlockContext, this.contextKeyService, {
            arg: {
              sessionResource: this.sessionResource,
              requestId: this.requestId,
              uri: this.uri,
              stopId: this.inUndoStop
            }
          });
          return getFlatContextMenuActions(menu);
        }
      });
    }));
  }
  get diff() {
    return this.currentDiff;
  }
  async showDiff({ editorOptions: options, openToSide }) {
    const group = openToSide ? SIDE_GROUP : void 0;
    if (this.currentDiff) {
      if (this.currentDiff.removed === 0 && await isResourceContentEmpty(this.textModelService, this.currentDiff.originalURI) && this.uri) {
        this.editorService.openEditor({ resource: this.uri, options }, group);
        return;
      }
      this.editorService.openEditor({
        original: { resource: this.currentDiff.originalURI },
        modified: { resource: this.currentDiff.modifiedURI },
        options
      }, group);
    } else if (this.uri) {
      this.editorService.openEditor({ resource: this.uri, options }, group);
    }
  }
  /**
   * @param uri URI of the file on-disk being changed
   */
  render(uri) {
    this.progressStore.clear();
    this.setUri(uri);
    this.setStatus(void 0, "");
    this.setLabelDetail("");
    this.setProgressFill(void 0);
    const session = this.chatService.getSession(this.sessionResource);
    const editSession = session?.editingSession;
    if (!editSession) {
      return;
    }
    const diffObservable = derived((reader) => {
      const entry = editSession.readEntry(uri, reader);
      return entry && editSession.getEntryDiffBetweenStops(entry.modifiedURI, this.requestId, this.inUndoStop);
    }).map((d, r) => d?.read(r));
    const isStreaming = derived((r) => {
      const entry = editSession.readEntry(uri, r);
      const currentlyModified = entry?.isCurrentlyBeingModifiedBy.read(r);
      return !!currentlyModified && currentlyModified.responseModel.requestId === this.requestId && currentlyModified.undoStopId === this.inUndoStop;
    });
    const iconText = this.labelService.getUriBasenameLabel(uri);
    this.progressStore.add(autorun((r) => {
      if (isStreaming.read(r)) {
        const codicon = ThemeIcon.modify(Codicon.loading, "spin");
        this.setStatus(codicon, localize("chat.codeblock.applyingEdits", "Applying edits"));
        const entry = editSession.readEntry(uri, r);
        const rwRatio = Math.floor((entry?.rewriteRatio.read(r) || 0) * 100);
        const showAnimation = this.configurationService.getValue(ChatConfiguration.ShowCodeBlockProgressAnimation);
        if (showAnimation) {
          this.setProgressFill(rwRatio);
          this.setLabelDetail("");
        } else {
          this.setProgressFill(void 0);
          this.setLabelDetail(rwRatio === 0 || !rwRatio ? localize("chat.codeblock.generating", "Generating edits...") : localize("chat.codeblock.applyingPercentage", "({0}%)...", rwRatio));
        }
      } else {
        this.setStatus(Codicon.check, localize("chat.codeblock.edited", "Edited"));
        this.setProgressFill(void 0);
        this.setLabelDetail("");
      }
    }));
    this.progressStore.add(autorunSelfDisposable((r) => {
      const changes = diffObservable.read(r);
      if (changes === void 0) {
        return;
      }
      if (changes && !changes?.identical && !changes?.quitEarly) {
        this.currentDiff = changes;
        this._onDidChangeDiff.fire(changes);
        this.setDiff({ added: changes.added, removed: changes.removed });
        const insertionsFragment = changes.added === 1 ? localize("chat.codeblock.insertions.one", "1 insertion") : localize("chat.codeblock.insertions", "{0} insertions", changes.added);
        const deletionsFragment = changes.removed === 1 ? localize("chat.codeblock.deletions.one", "1 deletion") : localize("chat.codeblock.deletions", "{0} deletions", changes.removed);
        this.setAriaLabel(localize("summary", "Edited {0}, {1}, {2}", iconText, insertionsFragment, deletionsFragment));
        if (changes.isFinal) {
          r.dispose();
        }
      }
    }));
  }
};
CollapsedCodeBlock = __decorateClass([
  __decorateParam(3, ILabelService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IModelService),
  __decorateParam(6, ILanguageService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IMenuService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IChatService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, ITextModelService)
], CollapsedCodeBlock);
function fixCodeText(text, languageId) {
  if (languageId === "php") {
    if (!text.trim().startsWith("<?")) {
      return `<?php
${text}`;
    }
  }
  return text;
}
export {
  ChatMarkdownContentPart,
  CollapsedCodeBlock,
  codeblockHasClosingBackticks
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdE1hcmtkb3duQ29udGVudFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBhbGxvd2VkTWFya2Rvd25IdG1sQXR0cmlidXRlcywgTWFya2Rvd25SZW5kZXJlck1hcmtlZE9wdGlvbnMsIHR5cGUgTWFya2Rvd25SZW5kZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgd3JhcFRhYmxlc1dpdGhTY3JvbGxhYmxlIH0gZnJvbSAnLi9jaGF0TWFya2Rvd25UYWJsZVNjcm9sbGluZy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBmaW5kTGFzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGF1dG9ydW5TZWxmRGlzcG9zYWJsZSwgZGVyaXZlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGlzTG9jYXRpb24sIHR5cGUgU3ltYm9sVGFnIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdERlbHRhSW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSU9wZW5FZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdFRlbGVtZXRyeS9icm93c2VyL3RlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnkvYWlFZGl0VGVsZW1ldHJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNYXJrZWRLYXRleFN1cHBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9tYXJrZG93bi9icm93c2VyL21hcmtlZEthdGV4U3VwcG9ydC5qcyc7XG5pbXBvcnQgeyBleHRyYWN0Q29kZWJsb2NrVXJpc0Zyb21UZXh0LCBleHRyYWN0VnVsbmVyYWJpbGl0aWVzRnJvbVRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vd2lkZ2V0L2Fubm90YXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFByb2dyZXNzUmVuZGVyYWJsZVJlc3BvbnNlQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlLCBJQ2hhdE1hcmtkb3duQ29udGVudCwgSUNoYXRTZXJ2aWNlLCBJQ2hhdFVuZG9TdG9wIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNSZXF1ZXN0Vk0sIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvZGVCbG9ja0luZm8gfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlLCB0eXBlIFJlbmRlcmVkT3V0cHV0UGFydCB9IGZyb20gJy4uLy4uL2NoYXRPdXRwdXRJdGVtUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgYWxsb3dlZENoYXRNYXJrZG93bkh0bWxUYWdzIH0gZnJvbSAnLi4vY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElNYXJrZG93bkRpZmZCbG9ja0RhdGEsIE1hcmtkb3duRGlmZkJsb2NrUGFydCwgcGFyc2VVbmlmaWVkRGlmZiB9IGZyb20gJy4vY2hhdERpZmZCbG9ja1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRNYXJrZG93bkRlY29yYXRpb25zUmVuZGVyZXIgfSBmcm9tICcuL2NoYXRNYXJrZG93bkRlY29yYXRpb25zUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQ29kZUJsb2NrUGFydCwgSUNvZGVCbG9ja0RhdGEsIElDb2RlQmxvY2tSZW5kZXJPcHRpb25zIH0gZnJvbSAnLi9jb2RlQmxvY2tQYXJ0LmpzJztcbmltcG9ydCAnLi9tZWRpYS9jaGF0Q29kZUJsb2NrUGlsbC5jc3MnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGVSZWZlcmVuY2UgfSBmcm9tICcuL2NoYXRDb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQb29sIH0gZnJvbSAnLi9jaGF0Q29udGVudENvZGVQb29scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0LCBJQ2hhdENvbnRlbnRQYXJ0RGlmZkRhdGEsIElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRFZGl0UGlsbEVsZW1lbnQsIGlzUmVzb3VyY2VDb250ZW50RW1wdHkgfSBmcm9tICcuL2NoYXRFZGl0UGlsbEVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ2hhdEV4dGVuc2lvbnNDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdEV4dGVuc2lvbnNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UHJvZ3Jlc3NTdWJQYXJ0IH0gZnJvbSAnLi9jaGF0UHJvZ3Jlc3NDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBJbmNyZW1lbnRhbERPTU1vcnBoZXIgfSBmcm9tICcuL2NoYXRJbmNyZW1lbnRhbFJlbmRlcmluZy9jaGF0SW5jcmVtZW50YWxSZW5kZXJpbmcuanMnO1xuaW1wb3J0IHsgSUNoYXRPdXRwdXRQYXJ0U3RhdGVDYWNoZSwgSU91dHB1dFBhcnRTdGF0ZSB9IGZyb20gJy4vY2hhdE91dHB1dFBhcnRTdGF0ZUNhY2hlLmpzJztcbmltcG9ydCAnLi9tZWRpYS9jaGF0TWFya2Rvd25QYXJ0LmNzcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1hcmtkb3duQ29udGVudFBhcnRPcHRpb25zIHtcblx0cmVhZG9ubHkgY29kZUJsb2NrUmVuZGVyT3B0aW9ucz86IElDb2RlQmxvY2tSZW5kZXJPcHRpb25zO1xuXHRyZWFkb25seSBhbGxvd0lubGluZURpZmZzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG9yaXpvbnRhbFBhZGRpbmc/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlPcHRpb25zPzoge1xuXHRcdC8qKlxuXHRcdCAqIE1lc3NhZ2UgdG8gYW5ub3VuY2UgdG8gc2NyZWVuIHJlYWRlcnMgYXMgYSBzdGF0dXMgdXBkYXRlIGlmIFZlcmJvc2VDaGF0UHJvZ3Jlc3NVcGRhdGVzIGlzIGVuYWJsZWQuXG5cdFx0ICogV2lsbCBhbHNvIGJlIHVzZWQgYXMgdGhlIGFyaWEtbGFiZWwgZm9yIHRoZSBjb250YWluZXIuXG5cdFx0ICogKi9cblx0XHRzdGF0dXNNZXNzYWdlPzogc3RyaW5nO1xuXHR9O1xufVxuXG5pbnRlcmZhY2UgSU1hcmtkb3duUGFydENvZGVCbG9ja0luZm8gZXh0ZW5kcyBJQ2hhdENvZGVCbG9ja0luZm8ge1xuXHRpc1N0cmVhbWluZ0VkaXQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0TWFya2Rvd25Db250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblxuXHRwcml2YXRlIHN0YXRpYyBJRF9QT09MID0gMDtcblxuXHRyZWFkb25seSBjb2RlYmxvY2tzUGFydElkID0gU3RyaW5nKCsrQ2hhdE1hcmtkb3duQ29udGVudFBhcnQuSURfUE9PTCk7XG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdC8vIFRoaXMgRXZlbnQgZXhpc3RzIGZvciBvbmUgc3BlY2lmaWMgc2NlbmFyaW8gYW5kIHRoZSBwYXR0ZXJuIHNob3VsZG4ndCBiZSBjb3BpZWQgd2l0aG91dCBhIGdvb2QgcmVhc29uXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGlmZiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0Q29udGVudFBhcnREaWZmRGF0YT4oKSk7XG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGFueSBlZGl0IHBpbGwgKENvbGxhcHNlZENvZGVCbG9jaykgaW4gdGhpcyBtYXJrZG93biBwYXJ0IHVwZGF0ZXMgaXRzIGRpZmYuXG5cdCAqIFRoZSBkYXRhIGluY2x1ZGVzIHRoZSB0b3RhbCBzdGF0cyBhbmQgY3VycmVudCByZXNvdXJjZXMgYWNyb3NzIGFsbCBlZGl0IHBpbGxzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaWZmOiBFdmVudDxJQ2hhdENvbnRlbnRQYXJ0RGlmZkRhdGE+ID0gdGhpcy5fb25EaWRDaGFuZ2VEaWZmLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRmluaXNoUmVuZGVyaW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRmluaXNoUmVuZGVyaW5nOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRmluaXNoUmVuZGVyaW5nLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWxsUmVmczogSURpc3Bvc2FibGVSZWZlcmVuY2U8Q29kZUJsb2NrUGFydCB8IENoYXRPdXRwdXRDb2RlQmxvY2tQYXJ0IHwgQ29sbGFwc2VkQ29kZUJsb2NrIHwgTWFya2Rvd25EaWZmQmxvY2tQYXJ0PltdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29kZWJsb2NrczogSU1hcmtkb3duUGFydENvZGVCbG9ja0luZm9bXSA9IFtdO1xuXHRwdWJsaWMgZ2V0IGNvZGVibG9ja3MoKTogSUNoYXRDb2RlQmxvY2tJbmZvW10ge1xuXHRcdHJldHVybiB0aGlzLl9jb2RlYmxvY2tzO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBtYXRoTGF5b3V0UGFydGljaXBhbnRzID0gbmV3IFNldDwoKSA9PiB2b2lkPigpO1xuXG5cdC8qKiBJbmNyZW1lbnRhbCByZW5kZXJpbmcgbW9ycGhlciBcdTIwMTQgb25seSBjcmVhdGVkIHdoZW4gdGhlIGV4cGVyaW1lbnQgaXMgZW5hYmxlZC4gKi9cblx0cHJpdmF0ZSBfaW5jcmVtZW50YWxNb3JwaGVyOiBJbmNyZW1lbnRhbERPTU1vcnBoZXIgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBtYXJrZG93bjogSUNoYXRNYXJrZG93bkNvbnRlbnQsXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JQb29sOiBFZGl0b3JQb29sLFxuXHRcdGZpbGxJbkluY29tcGxldGVUb2tlbnMgPSBmYWxzZSxcblx0XHRjb2RlQmxvY2tTdGFydEluZGV4ID0gMCxcblx0XHRyZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXIsXG5cdFx0bWFya2Rvd25SZW5kZXJPcHRpb25zOiBNYXJrZG93blJlbmRlck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0Y3VycmVudFdpZHRoOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJlck9wdGlvbnM6IElDaGF0TWFya2Rvd25Db250ZW50UGFydE9wdGlvbnMsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhaUVkaXRUZWxlbWV0cnlTZXJ2aWNlOiBJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNoYXRPdXRwdXRSZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlOiBJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGVsZW1lbnQgPSBjb250ZXh0LmVsZW1lbnQ7XG5cdFx0Y29uc3QgaW5VbmRvU3RvcCA9IChmaW5kTGFzdChjb250ZXh0LmNvbnRlbnQsIGUgPT4gZS5raW5kID09PSAndW5kb1N0b3AnLCBjb250ZXh0LmNvbnRlbnRJbmRleCkgYXMgSUNoYXRVbmRvU3RvcCB8IHVuZGVmaW5lZCk/LmlkO1xuXG5cdFx0Ly8gTmVlZCB0byB0cmFjayB0aGUgaW5kZXggb2YgdGhlIGNvZGVibG9jayB3aXRoaW4gdGhlIHJlc3BvbnNlIHNvIGl0IGNhbiBoYXZlIGEgdW5pcXVlIElELFxuXHRcdC8vIGFuZCB3aXRoaW4gdGhpcyBwYXJ0IHRvIGZpbmQgaXQgd2l0aGluIHRoZSBjb2RlYmxvY2tzIGFycmF5XG5cdFx0bGV0IGdsb2JhbENvZGVCbG9ja0luZGV4U3RhcnQgPSBjb2RlQmxvY2tTdGFydEluZGV4O1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gJCgnZGl2LmNoYXQtbWFya2Rvd24tcGFydCcpO1xuXG5cdFx0aWYgKHRoaXMucmVuZGVyZXJPcHRpb25zLmFjY2Vzc2liaWxpdHlPcHRpb25zPy5zdGF0dXNNZXNzYWdlKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuYXJpYUxhYmVsID0gdGhpcy5yZW5kZXJlck9wdGlvbnMuYWNjZXNzaWJpbGl0eU9wdGlvbnMuc3RhdHVzTWVzc2FnZTtcblx0XHRcdGlmIChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLlZlcmJvc2VDaGF0UHJvZ3Jlc3NVcGRhdGVzKSkge1xuXHRcdFx0XHRzdGF0dXModGhpcy5yZW5kZXJlck9wdGlvbnMuYWNjZXNzaWJpbGl0eU9wdGlvbnMuc3RhdHVzTWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5hYmxlTWF0aCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkVuYWJsZU1hdGgpO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBpbmNyZW1lbnRhbCByZW5kZXJpbmcgbW9ycGhlciB3aGVuIHRoZSBleHBlcmltZW50IGlzIGVuYWJsZWQuXG5cdFx0Ly8gT25seSBjcmVhdGUgZm9yIGFjdGl2ZWx5IHN0cmVhbWluZyByZXNwb25zZXMgKCFlbGVtZW50LmlzQ29tcGxldGUpLFxuXHRcdC8vIG5vdCBmb3IgY29tcGxldGVkIHJlc3BvbnNlcyBsb2FkZWQgZnJvbSBoaXN0b3J5IFx1MjAxNCBldmVuIGlmXG5cdFx0Ly8gZmlsbEluSW5jb21wbGV0ZVRva2VucyBpcyB0cnVlIChlLmcuIGNhbmNlbGVkIG9yIGluY29tcGxldGUgcmVzcG9uc2VzKS5cblx0XHRjb25zdCBpbmNyZW1lbnRhbFJlbmRlcmluZ0VuYWJsZWQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5JbmNyZW1lbnRhbFJlbmRlcmluZyk7XG5cdFx0aWYgKGluY3JlbWVudGFsUmVuZGVyaW5nRW5hYmxlZCAmJiBpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgZmlsbEluSW5jb21wbGV0ZVRva2VucyAmJiAhZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHR0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmNyZW1lbnRhbERPTU1vcnBoZXIsIHRoaXMuZG9tTm9kZSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5jcmVtZW50YWxNb3JwaGVyLm9uRGlkRHJhaW4oKCkgPT4gdGhpcy5fb25EaWRGaW5pc2hSZW5kZXJpbmcuZmlyZSgpKSk7XG5cdFx0XHR0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXIuc2V0UmVuZGVyQ2FsbGJhY2soKG5ld01kKSA9PiB7XG5cdFx0XHRcdC8vIFRlbXBvcmFyaWx5IHN3YXAgdGhpcy5tYXJrZG93biB0byB0aGUgYnVmZmVyZWQgY29udGVudFxuXHRcdFx0XHQvLyBmb3IgZG9SZW5kZXJNYXJrZG93bigpLCB0aGVuIHJlc3RvcmUgaXQuIFRoZSBtb3JwaGVyIG1heVxuXHRcdFx0XHQvLyByZW5kZXIgYSBzdWJzZXQgb2YgdGhlIGZ1bGwgbWFya2Rvd24gKHdvcmQvcGFyYWdyYXBoXG5cdFx0XHRcdC8vIGJ1ZmZlcmluZyksIGJ1dCB0aGlzLm1hcmtkb3duIG11c3QgYWx3YXlzIHJlZmxlY3QgdGhlXG5cdFx0XHRcdC8vIGxhdGVzdCBmdWxsIGNvbnRlbnQgZnJvbSB0cnlJbmNyZW1lbnRhbFVwZGF0ZSBzbyB0aGF0XG5cdFx0XHRcdC8vIGhhc1NhbWVDb250ZW50KCkgcmV0dXJucyB0cnVlIGFuZCBhdm9pZHMgdW5uZWNlc3Nhcnlcblx0XHRcdFx0Ly8gcmUtZGlmZnMgb24gdGhlIG5leHQgcmVuZGVyRWxlbWVudCBjYWxsLlxuXHRcdFx0XHRjb25zdCBzYXZlZE1hcmtkb3duID0gdGhpcy5tYXJrZG93bjtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IG5ldyBNYXJrZG93blN0cmluZyhuZXdNZCwgdGhpcy5tYXJrZG93bi5jb250ZW50KTtcblx0XHRcdFx0Y29udGVudC5iYXNlVXJpID0gVVJJLnJldml2ZSh0aGlzLm1hcmtkb3duLmNvbnRlbnQuYmFzZVVyaSk7XG5cdFx0XHRcdGNvbnRlbnQudXJpcyA9IHRoaXMubWFya2Rvd24uY29udGVudC51cmlzO1xuXHRcdFx0XHR0aGlzLm1hcmtkb3duID0geyAuLi50aGlzLm1hcmtkb3duLCBjb250ZW50IH07XG5cdFx0XHRcdGRvUmVuZGVyTWFya2Rvd24oKTtcblx0XHRcdFx0dGhpcy5tYXJrZG93biA9IHNhdmVkTWFya2Rvd247XG5cdFx0XHRcdC8vIE5vdGlmeSB0aGUgbGlzdCB0aGF0IG91ciBoZWlnaHQgY2hhbmdlZCBzbyBpdCBjYW5cblx0XHRcdFx0Ly8gdXBkYXRlIHNjcm9sbCBwb3NpdGlvbi4gVGhlIG1vcnBoZXIgcmVuZGVycyB2aWEgckFGLFxuXHRcdFx0XHQvLyBvdXRzaWRlIHRoZSBub3JtYWwgcmVuZGVyRWxlbWVudCBmbG93LCBzbyB0aGUgbGlzdFxuXHRcdFx0XHQvLyB3b24ndCBwaWNrIHRoaXMgdXAgd2l0aG91dCBhbiBleHBsaWNpdCBub3RpZmljYXRpb24uXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbmRlclN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdFx0Y29uc3QgbWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1hcmtkb3duRGVjb3JhdGlvbnNSZW5kZXJlcikpO1xuXG5cdFx0Y29uc3QgZG9SZW5kZXJNYXJrZG93biA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJldmlvdXNSZW5kZXJTdG9yZSA9IHJlbmRlclN0b3JlLmNsZWFyQW5kTGVhaygpO1xuXHRcdFx0Y29uc3QgcmV1c2FibGVPdXRwdXRDb2RlQmxvY2tSZWZzID0gbmV3IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlUmVmZXJlbmNlPENoYXRPdXRwdXRDb2RlQmxvY2tQYXJ0Pj4oKTtcblx0XHRcdGZvciAoY29uc3QgcmVmIG9mIHRoaXMuYWxsUmVmcykge1xuXHRcdFx0XHRpZiAocmVmLm9iamVjdCBpbnN0YW5jZW9mIENoYXRPdXRwdXRDb2RlQmxvY2tQYXJ0KSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3V0cHV0UmVmID0gcmVmIGFzIElEaXNwb3NhYmxlUmVmZXJlbmNlPENoYXRPdXRwdXRDb2RlQmxvY2tQYXJ0Pjtcblx0XHRcdFx0XHRwcmV2aW91c1JlbmRlclN0b3JlPy5kZWxldGVBbmRMZWFrKG91dHB1dFJlZik7XG5cdFx0XHRcdFx0cmV1c2FibGVPdXRwdXRDb2RlQmxvY2tSZWZzLnNldChvdXRwdXRSZWYub2JqZWN0LnJldXNlS2V5LCBvdXRwdXRSZWYpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRwcmV2aW91c1JlbmRlclN0b3JlPy5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIFJlc2V0IHN0YXRlIGZvciByZS1yZW5kZXJcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0cmVuZGVyU3RvcmUudmFsdWUgPSBzdG9yZTtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5kb21Ob2RlKTtcblx0XHRcdHRoaXMuYWxsUmVmcy5sZW5ndGggPSAwO1xuXHRcdFx0dGhpcy5fY29kZWJsb2Nrcy5sZW5ndGggPSAwO1xuXHRcdFx0dGhpcy5tYXRoTGF5b3V0UGFydGljaXBhbnRzLmNsZWFyKCk7XG5cdFx0XHRnbG9iYWxDb2RlQmxvY2tJbmRleFN0YXJ0ID0gY29kZUJsb2NrU3RhcnRJbmRleDtcblxuXHRcdFx0Ly8gVE9ETzogTW92ZSBrYXRleCBzdXBwb3J0IGludG8gY2hhdE1hcmtkb3duUmVuZGVyZXJcblx0XHRcdGNvbnN0IG1hcmtlZEV4dGVuc2lvbnMgPSBlbmFibGVNYXRoXG5cdFx0XHRcdD8gY29hbGVzY2UoW01hcmtlZEthdGV4U3VwcG9ydC5nZXRFeHRlbnNpb24oZG9tLmdldFdpbmRvdyhjb250ZXh0LmNvbnRhaW5lciksIHtcblx0XHRcdFx0XHR0aHJvd09uRXJyb3I6IGZhbHNlXG5cdFx0XHRcdH0pXSlcblx0XHRcdFx0OiBbXTtcblxuXHRcdFx0Ly8gRW5hYmxlcyBnaXRodWItZmxhdm9yZWQtbWFya2Rvd24gKyBsaW5lIGJyZWFrcyB3aXRoIHNpbmdsZSBuZXdsaW5lc1xuXHRcdFx0Ly8gKHdoaWNoIG1hdGNoZXMgdHlwaWNhbCBleHBlY3RhdGlvbnMgYnV0IGlzbid0IFwicHJvcGVyXCIgaW4gbWFya2Rvd24pXG5cdFx0XHRjb25zdCBtYXJrZWRPcHRzOiBNYXJrZG93blJlbmRlcmVyTWFya2VkT3B0aW9ucyA9IHtcblx0XHRcdFx0Z2ZtOiB0cnVlLFxuXHRcdFx0XHRicmVha3M6IHRydWUsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBjb25maWd1cmVkVXJpVHJhbnNmb3JtZXIgPSBtYXJrZG93blJlbmRlck9wdGlvbnM/LnRyYW5zZm9ybVVyaTtcblx0XHRcdGNvbnN0IHRyYW5zZm9ybVVyaSA9IGlzUmVzcG9uc2VWTShlbGVtZW50KVxuXHRcdFx0XHQ/IChocmVmOiBzdHJpbmcsIGtpbmQ6ICdsaW5rJyB8ICdpbWFnZScpID0+IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5yZXNvbHZlQ2hhdFJlc3BvbnNlVXJpKGVsZW1lbnQuc2Vzc2lvblJlc291cmNlLCBjb25maWd1cmVkVXJpVHJhbnNmb3JtZXI/LihocmVmLCBraW5kKSA/PyBocmVmLCBraW5kKVxuXHRcdFx0XHQ6IGNvbmZpZ3VyZWRVcmlUcmFuc2Zvcm1lcjtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJlci5yZW5kZXIodGhpcy5tYXJrZG93bi5jb250ZW50LCB7XG5cdFx0XHRcdHNhbml0aXplckNvbmZpZzogTWFya2VkS2F0ZXhTdXBwb3J0LmdldFNhbml0aXplck9wdGlvbnMoe1xuXHRcdFx0XHRcdGFsbG93ZWRUYWdzOiBhbGxvd2VkQ2hhdE1hcmtkb3duSHRtbFRhZ3MsXG5cdFx0XHRcdFx0YWxsb3dlZEF0dHJpYnV0ZXM6IGFsbG93ZWRNYXJrZG93bkh0bWxBdHRyaWJ1dGVzLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0ZmlsbEluSW5jb21wbGV0ZVRva2Vucyxcblx0XHRcdFx0Y29kZUJsb2NrUmVuZGVyZXJTeW5jOiAobGFuZ3VhZ2VJZCwgdGV4dCwgcmF3KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaXNDb2RlQmxvY2tDb21wbGV0ZSA9ICFpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSB8fCBjb250ZXh0LmVsZW1lbnQuaXNDb21wbGV0ZSB8fCAhcmF3IHx8IGNvZGVibG9ja0hhc0Nsb3NpbmdCYWNrdGlja3MocmF3KTtcblx0XHRcdFx0XHRjb25zdCBoYXNDaGF0T3V0cHV0UmVuZGVyZXIgPSAhIWxhbmd1YWdlSWRcblx0XHRcdFx0XHRcdCYmIHRoaXMuY2hhdE91dHB1dFJlbmRlcmVyU2VydmljZS5oYXNDb2RlQmxvY2tSZW5kZXJlcihsYW5ndWFnZUlkKTtcblx0XHRcdFx0XHRpZiAoKCF0ZXh0IHx8ICh0ZXh0LnN0YXJ0c1dpdGgoJzx2c2NvZGVfY29kZWJsb2NrX3VyaScpICYmICF0ZXh0LmluY2x1ZGVzKCdcXG4nKSkpXG5cdFx0XHRcdFx0XHQmJiAhaXNDb2RlQmxvY2tDb21wbGV0ZVxuXHRcdFx0XHRcdFx0JiYgIWhhc0NoYXRPdXRwdXRSZW5kZXJlcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgaGlkZUVtcHR5Q29kZWJsb2NrID0gJCgnZGl2Jyk7XG5cdFx0XHRcdFx0XHRoaWRlRW1wdHlDb2RlYmxvY2suc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0XHRcdHJldHVybiBoaWRlRW1wdHlDb2RlYmxvY2s7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChsYW5ndWFnZUlkID09PSAnZGlmZicgJiYgcmF3ICYmIHRoaXMucmVuZGVyZXJPcHRpb25zLmFsbG93SW5saW5lRGlmZnMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoID0gcmF3Lm1hdGNoKC9eYGBgZGlmZjooXFx3KykvKTtcblx0XHRcdFx0XHRcdGlmIChtYXRjaCAmJiBpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhY3R1YWxMYW5ndWFnZUlkID0gbWF0Y2hbMV07XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvZGVCbG9ja1VyaSA9IGV4dHJhY3RDb2RlYmxvY2tVcmlzRnJvbVRleHQodGV4dCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHsgYmVmb3JlLCBhZnRlciB9ID0gcGFyc2VVbmlmaWVkRGlmZihjb2RlQmxvY2tVcmk/LnRleHRXaXRob3V0UmVzdWx0ID8/IHRleHQpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkaWZmRGF0YTogSU1hcmtkb3duRGlmZkJsb2NrRGF0YSA9IHtcblx0XHRcdFx0XHRcdFx0XHRlbGVtZW50OiBjb250ZXh0LmVsZW1lbnQsXG5cdFx0XHRcdFx0XHRcdFx0Y29kZUJsb2NrSW5kZXg6IGdsb2JhbENvZGVCbG9ja0luZGV4U3RhcnQrKyxcblx0XHRcdFx0XHRcdFx0XHRsYW5ndWFnZUlkOiBhY3R1YWxMYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IGJlZm9yZSxcblx0XHRcdFx0XHRcdFx0XHRhZnRlckNvbnRlbnQ6IGFmdGVyLFxuXHRcdFx0XHRcdFx0XHRcdGNvZGVCbG9ja1Jlc291cmNlOiBjb2RlQmxvY2tVcmk/LnVyaSxcblx0XHRcdFx0XHRcdFx0XHRpc1JlYWRPbmx5OiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdGhvcml6b250YWxQYWRkaW5nOiB0aGlzLnJlbmRlcmVyT3B0aW9ucy5ob3Jpem9udGFsUGFkZGluZyxcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZGlmZlBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmtkb3duRGlmZkJsb2NrUGFydCwgZGlmZkRhdGEsIGNvbnRleHQuZGlmZkVkaXRvclBvb2wsIGNvbnRleHQuY3VycmVudFdpZHRoLmdldCgpKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVmOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxNYXJrZG93bkRpZmZCbG9ja1BhcnQ+ID0ge1xuXHRcdFx0XHRcdFx0XHRcdG9iamVjdDogZGlmZlBhcnQsXG5cdFx0XHRcdFx0XHRcdFx0aXNTdGFsZTogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gZGlmZlBhcnQuZGlzcG9zZSgpXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdHRoaXMuYWxsUmVmcy5wdXNoKHJlZik7XG5cdFx0XHRcdFx0XHRcdHN0b3JlLmFkZChyZWYpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZGlmZlBhcnQuZWxlbWVudDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGxhbmd1YWdlSWQgPT09ICd2c2NvZGUtZXh0ZW5zaW9ucycpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNoYXRFeHRlbnNpb25zID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFeHRlbnNpb25zQ29udGVudFBhcnQsIHsga2luZDogJ2V4dGVuc2lvbnMnLCBleHRlbnNpb25zOiB0ZXh0LnNwbGl0KCcsJykgfSkpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNoYXRFeHRlbnNpb25zLmRvbU5vZGU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGdsb2JhbEluZGV4ID0gZ2xvYmFsQ29kZUJsb2NrSW5kZXhTdGFydCsrO1xuXHRcdFx0XHRcdGxldCBjb2RlQmxvY2tUZXh0ID0gdGV4dDtcblx0XHRcdFx0XHRjb25zdCBleHRyYWN0ZWRWdWxucyA9IGV4dHJhY3RWdWxuZXJhYmlsaXRpZXNGcm9tVGV4dCh0ZXh0KTtcblx0XHRcdFx0XHRjb2RlQmxvY2tUZXh0ID0gZml4Q29kZVRleHQoZXh0cmFjdGVkVnVsbnMubmV3VGV4dCwgbGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdFx0Y29uc3QgdnVsbnMgPSBleHRyYWN0ZWRWdWxucy52dWxuZXJhYmlsaXRpZXM7XG5cblx0XHRcdFx0XHRsZXQgY29kZW1hcHBlclVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGxldCBpc0VkaXQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgY29kZWJsb2NrVXJpID0gZXh0cmFjdENvZGVibG9ja1VyaXNGcm9tVGV4dChjb2RlQmxvY2tUZXh0KTtcblx0XHRcdFx0XHRpZiAoY29kZWJsb2NrVXJpKSB7XG5cdFx0XHRcdFx0XHRjb2RlbWFwcGVyVXJpID0gY29kZWJsb2NrVXJpLnVyaTtcblx0XHRcdFx0XHRcdGlzRWRpdCA9IGNvZGVibG9ja1VyaS5pc0VkaXQ7XG5cdFx0XHRcdFx0XHRjb2RlQmxvY2tUZXh0ID0gY29kZWJsb2NrVXJpLnRleHRXaXRob3V0UmVzdWx0O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGhpZGVUb29sYmFyID0gaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmIGVsZW1lbnQuZXJyb3JEZXRhaWxzPy5yZXNwb25zZUlzRmlsdGVyZWQ7XG5cdFx0XHRcdFx0Y29uc3QgcmVuZGVyT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRcdC4uLnRoaXMucmVuZGVyZXJPcHRpb25zLmNvZGVCbG9ja1JlbmRlck9wdGlvbnMsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAoaGlkZVRvb2xiYXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0cmVuZGVyT3B0aW9ucy5oaWRlVG9vbGJhciA9IGhpZGVUb29sYmFyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjb2RlQmxvY2tJbmZvOiBJQ29kZUJsb2NrRGF0YSA9IHsgbGFuZ3VhZ2VJZCwgdGV4dDogY29kZUJsb2NrVGV4dCwgY29kZUJsb2NrSW5kZXg6IGdsb2JhbEluZGV4LCBlbGVtZW50LCBwYXJlbnRDb250ZXh0S2V5U2VydmljZTogY29udGV4dEtleVNlcnZpY2UsIHZ1bG5zLCBjb2RlbWFwcGVyVXJpLCByZW5kZXJPcHRpb25zLCBjaGF0U2Vzc2lvblJlc291cmNlOiBlbGVtZW50LnNlc3Npb25SZXNvdXJjZSB9O1xuXHRcdFx0XHRcdGNvbnN0IGJhc2VDb2RlQmxvY2tJbmZvID0ge1xuXHRcdFx0XHRcdFx0b3duZXJNYXJrZG93blBhcnRJZDogdGhpcy5jb2RlYmxvY2tzUGFydElkLFxuXHRcdFx0XHRcdFx0Y29kZUJsb2NrSW5kZXg6IGdsb2JhbEluZGV4LFxuXHRcdFx0XHRcdFx0ZWxlbWVudElkOiBlbGVtZW50LmlkLFxuXHRcdFx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0ZWRpdERlbHRhSW5mbzogRWRpdERlbHRhSW5mby5mcm9tVGV4dCh0ZXh0KSxcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0aWYgKGVsZW1lbnQuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCB8fCAhY29kZW1hcHBlclVyaSB8fCAhaXNFZGl0KSB7XG5cdFx0XHRcdFx0XHRpZiAoaGFzQ2hhdE91dHB1dFJlbmRlcmVyKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlZiA9IHRoaXMucmVuZGVyQ2hhdE91dHB1dENvZGVCbG9jayhsYW5ndWFnZUlkLCBjb2RlQmxvY2tUZXh0LCBnbG9iYWxJbmRleCwgY29udGV4dCwgaXNDb2RlQmxvY2tDb21wbGV0ZSwgcmV1c2FibGVPdXRwdXRDb2RlQmxvY2tSZWZzKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fY29kZWJsb2Nrcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHQuLi5iYXNlQ29kZUJsb2NrSW5mbyxcblx0XHRcdFx0XHRcdFx0XHRjb2RlbWFwcGVyVXJpOiBjb2RlQmxvY2tJbmZvLmNvZGVtYXBwZXJVcmksXG5cdFx0XHRcdFx0XHRcdFx0aXNTdHJlYW1pbmdFZGl0OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRnZXQgdXJpKCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGZvY3VzKCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmVmLm9iamVjdC5mb2N1cygpO1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRzdG9yZS5hZGQocmVmKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlZi5vYmplY3QuZWxlbWVudDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgcmVmID0gdGhpcy5yZW5kZXJDb2RlQmxvY2soY29kZUJsb2NrSW5mbywgY3VycmVudFdpZHRoKTtcblx0XHRcdFx0XHRcdHRoaXMuX2NvZGVibG9ja3MucHVzaCh7XG5cdFx0XHRcdFx0XHRcdC4uLmJhc2VDb2RlQmxvY2tJbmZvLFxuXHRcdFx0XHRcdFx0XHRjb2RlbWFwcGVyVXJpOiBjb2RlQmxvY2tJbmZvLmNvZGVtYXBwZXJVcmksXG5cdFx0XHRcdFx0XHRcdGlzU3RyZWFtaW5nRWRpdDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdGdldCB1cmkoKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlZi5vYmplY3QudXJpO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRmb2N1cygpIHtcblx0XHRcdFx0XHRcdFx0XHRyZWYub2JqZWN0LmZvY3VzKCk7XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHN0b3JlLmFkZChyZWYpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlZi5vYmplY3QuZWxlbWVudDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCByZXF1ZXN0SWQgPSBpc1JlcXVlc3RWTShlbGVtZW50KSA/IGVsZW1lbnQuaWQgOiBlbGVtZW50LnJlcXVlc3RJZDtcblx0XHRcdFx0XHRjb25zdCByZWYgPSB0aGlzLnJlbmRlckNvZGVCbG9ja1BpbGwoZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RJZCwgaW5VbmRvU3RvcCwgY29kZW1hcHBlclVyaSk7XG5cdFx0XHRcdFx0dGhpcy5fY29kZWJsb2Nrcy5wdXNoKHtcblx0XHRcdFx0XHRcdC4uLmJhc2VDb2RlQmxvY2tJbmZvLFxuXHRcdFx0XHRcdFx0Y29kZW1hcHBlclVyaSxcblx0XHRcdFx0XHRcdGlzU3RyZWFtaW5nRWRpdDogIWlzQ29kZUJsb2NrQ29tcGxldGUsXG5cdFx0XHRcdFx0XHRnZXQgdXJpKCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGZvY3VzKCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVmLm9iamVjdC5lbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHN0b3JlLmFkZChyZWYpO1xuXHRcdFx0XHRcdHJldHVybiByZWYub2JqZWN0LmVsZW1lbnQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1hcmtlZE9wdGlvbnM6IG1hcmtlZE9wdHMsXG5cdFx0XHRcdG1hcmtlZEV4dGVuc2lvbnMsXG5cdFx0XHRcdC4uLm1hcmtkb3duUmVuZGVyT3B0aW9ucyxcblx0XHRcdFx0dHJhbnNmb3JtVXJpLFxuXHRcdFx0fSwgdGhpcy5kb21Ob2RlKSk7XG5cblx0XHRcdC8vIElkZWFsbHkgdGhpcyB3b3VsZCBoYXBwZW4gZWFybGllciwgYnV0IHdlIG5lZWQgdG8gcGFyc2UgdGhlIG1hcmtkb3duLlxuXHRcdFx0aWYgKGlzUmVzcG9uc2VWTShlbGVtZW50KSAmJiAhZWxlbWVudC5tb2RlbC5jb2RlQmxvY2tJbmZvcyAmJiBlbGVtZW50Lm1vZGVsLmlzQ29tcGxldGUpIHtcblx0XHRcdFx0ZWxlbWVudC5tb2RlbC5pbml0aWFsaXplQ29kZUJsb2NrSW5mb3ModGhpcy5fY29kZWJsb2Nrcy5tYXAoaW5mbyA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHN1Z2dlc3Rpb25JZDogdGhpcy5haUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmNyZWF0ZVN1Z2dlc3Rpb25JZCh7XG5cdFx0XHRcdFx0XHRcdHByZXNlbnRhdGlvbjogJ2NvZGVCbG9jaycsXG5cdFx0XHRcdFx0XHRcdGZlYXR1cmU6ICdzaWRlQmFyQ2hhdCcsXG5cdFx0XHRcdFx0XHRcdGVkaXREZWx0YUluZm86IGluZm8uZWRpdERlbHRhSW5mbyxcblx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2VJZDogaW5mby5sYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0XHRtb2RlSWQ6IGVsZW1lbnQubW9kZWwucmVxdWVzdD8ubW9kZUluZm8/LnRlbGVtZXRyeU1vZGVJZCxcblx0XHRcdFx0XHRcdFx0bW9kZWxJZDogZWxlbWVudC5tb2RlbC5yZXF1ZXN0Py5tb2RlbElkLFxuXHRcdFx0XHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c291cmNlUmVxdWVzdElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0c3RvcmUuYWRkKG1hcmtkb3duRGVjb3JhdGlvbnNSZW5kZXJlci53YWxrVHJlZUFuZEFubm90YXRlUmVmZXJlbmNlTGlua3ModGhpcy5tYXJrZG93biwgcmVzdWx0LmVsZW1lbnQpKTtcblxuXHRcdFx0Y29uc3QgbGF5b3V0UGFydGljaXBhbnRzID0gbmV3IExhenkoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBvYnNlcnZlciA9IHN0b3JlLmFkZChuZXcgZG9tLkRpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQ2hhdE1hcmtkb3duQ29udGVudFBhcnQubWF0aExheW91dCcsICgpID0+IHRoaXMubWF0aExheW91dFBhcnRpY2lwYW50cy5mb3JFYWNoKGxheW91dCA9PiBsYXlvdXQoKSkpKTtcblx0XHRcdFx0c3RvcmUuYWRkKG9ic2VydmVyLm9ic2VydmUodGhpcy5kb21Ob2RlKSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLm1hdGhMYXlvdXRQYXJ0aWNpcGFudHM7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTWFrZSBrYXRleCBibG9ja3MgaG9yaXpvbnRhbGx5IHNjcm9sbGFibGVcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Zm9yIChjb25zdCBrYXRleEJsb2NrIG9mIHRoaXMuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcua2F0ZXgtZGlzcGxheScpKSB7XG5cdFx0XHRcdGlmICghZG9tLmlzSFRNTEVsZW1lbnQoa2F0ZXhCbG9jaykpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNjcm9sbGFibGUgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoa2F0ZXhCbG9jay5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEVsZW1lbnQsIHtcblx0XHRcdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0c3RvcmUuYWRkKHNjcm9sbGFibGUpO1xuXHRcdFx0XHRrYXRleEJsb2NrLnJlcGxhY2VXaXRoKHNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdFx0XHRsYXlvdXRQYXJ0aWNpcGFudHMudmFsdWUuYWRkKCgpID0+IHsgc2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpOyB9KTtcblx0XHRcdFx0c2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRzdG9yZS5hZGQod3JhcFRhYmxlc1dpdGhTY3JvbGxhYmxlKHRoaXMuZG9tTm9kZSwgbGF5b3V0UGFydGljaXBhbnRzKSk7XG5cdFx0XHRkaXNwb3NlKHJldXNhYmxlT3V0cHV0Q29kZUJsb2NrUmVmcy52YWx1ZXMoKSk7XG5cdFx0fTtcblxuXHRcdC8vIEFsd2F5cyByZW5kZXIgaW1tZWRpYXRlbHlcblx0XHRkb1JlbmRlck1hcmtkb3duKCk7XG5cblx0XHQvLyBTZWVkIHRoZSBtb3JwaGVyICphZnRlciogdGhlIGluaXRpYWwgcmVuZGVyIHNvIGl0IGNhcHR1cmVzXG5cdFx0Ly8gdGhlIGNvcnJlY3QgbWFya2Rvd24gYmFzZWxpbmUuIFBhc3MgYGFuaW1hdGVJbml0aWFsOiB0cnVlYFxuXHRcdC8vIHNvIHRoZSBpbml0aWFsIERPTSBjaGlsZHJlbiByZWNlaXZlIHRoZSBlbnRyYW5jZSBhbmltYXRpb24gXHUyMDE0XG5cdFx0Ly8gdGhpcyBpcyBpbXBvcnRhbnQgd2hlbiBhIG1hcmtkb3duIHBhcnQgZmlyc3QgYXBwZWFycyAoZS5nLlxuXHRcdC8vIGFmdGVyIHRoaW5raW5nIGNvbnRlbnQpIGFuZCBhbHJlYWR5IGNvbnRhaW5zIHZpc2libGUgY29udGVudC5cblx0XHR0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXI/LnNlZWQobWFya2Rvd24uY29udGVudC52YWx1ZSwgLyogYW5pbWF0ZUluaXRpYWwgKi8gdHJ1ZSk7XG5cblx0XHRpZiAoZW5hYmxlTWF0aCAmJiAhTWFya2VkS2F0ZXhTdXBwb3J0LmdldEV4dGVuc2lvbihkb20uZ2V0V2luZG93KGNvbnRleHQuY29udGFpbmVyKSkpIHtcblx0XHRcdC8vIEthVGVYIG5vdCB5ZXQgbG9hZGVkIC0gbG9hZCBpdCBhbmQgcmUtcmVuZGVyIHdoZW4gcmVhZHlcblx0XHRcdE1hcmtlZEthdGV4U3VwcG9ydC5sb2FkRXh0ZW5zaW9uKGRvbS5nZXRXaW5kb3coY29udGV4dC5jb250YWluZXIpKVxuXHRcdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0ZG9SZW5kZXJNYXJrZG93bigpO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHQuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgTWFya2VkS2F0ZXhTdXBwb3J0IGV4dGVuc2lvbjonLCBlKTtcblx0XHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHRkaXNwb3NlKHRoaXMuYWxsUmVmcyk7XG5cdFx0dGhpcy5hbGxSZWZzLmxlbmd0aCA9IDA7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvZGVCbG9ja1BpbGwoc2Vzc2lvblJlc291cmNlOiBVUkksIHJlcXVlc3RJZDogc3RyaW5nLCBpblVuZG9TdG9wOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvZGVtYXBwZXJVcmk6IFVSSSk6IElEaXNwb3NhYmxlUmVmZXJlbmNlPENvbGxhcHNlZENvZGVCbG9jaz4ge1xuXHRcdGNvbnN0IGNvZGVCbG9jayA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29sbGFwc2VkQ29kZUJsb2NrLCBzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RJZCwgaW5VbmRvU3RvcCk7XG5cdFx0Y29uc3QgZGlmZkxpc3RlbmVyU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcmVmOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2xsYXBzZWRDb2RlQmxvY2s+ID0ge1xuXHRcdFx0b2JqZWN0OiBjb2RlQmxvY2ssXG5cdFx0XHRpc1N0YWxlOiAoKSA9PiBmYWxzZSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Y29kZUJsb2NrLmRpc3Bvc2UoKTtcblx0XHRcdFx0ZGlmZkxpc3RlbmVyU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBQdXNoIHRvIGFsbFJlZnMgYW5kIHJlZ2lzdGVyIHRoZSBkaWZmIGxpc3RlbmVyIGJlZm9yZSBjYWxsaW5nIHJlbmRlcigpLFxuXHRcdC8vIHNpbmNlIGRpZmYgb2JzZXJ2YWJsZXMgbWF5IGZpcmUgc3luY2hyb25vdXNseSB3aGVuIHRoZSBlZGl0aW5nIHNlc3Npb25cblx0XHQvLyBhbHJlYWR5IGhhcyBmaW5hbGl6ZWQgZGlmZiBkYXRhIChlLmcuIG9uIHNlc3Npb24gcmVzdG9yZSkuXG5cdFx0dGhpcy5hbGxSZWZzLnB1c2gocmVmKTtcblx0XHRkaWZmTGlzdGVuZXJTdG9yZS5hZGQoY29kZUJsb2NrLm9uRGlkQ2hhbmdlRGlmZigoKSA9PiB0aGlzLmZpcmVBZ2dyZWdhdGVkRGlmZigpKSk7XG5cdFx0Y29kZUJsb2NrLnJlbmRlcihjb2RlbWFwcGVyVXJpKTtcblx0XHRyZXR1cm4gcmVmO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDaGF0T3V0cHV0Q29kZUJsb2NrKFxuXHRcdGlkZW50aWZpZXI6IHN0cmluZyxcblx0XHR0ZXh0OiBzdHJpbmcsXG5cdFx0Y29kZUJsb2NrSW5kZXg6IG51bWJlcixcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRpc0NvbXBsZXRlOiBib29sZWFuLFxuXHRcdHJldXNhYmxlT3V0cHV0Q29kZUJsb2NrUmVmczogTWFwPHN0cmluZywgSURpc3Bvc2FibGVSZWZlcmVuY2U8Q2hhdE91dHB1dENvZGVCbG9ja1BhcnQ+Pixcblx0KTogSURpc3Bvc2FibGVSZWZlcmVuY2U8Q2hhdE91dHB1dENvZGVCbG9ja1BhcnQ+IHtcblx0XHRjb25zdCByZXVzZUtleSA9IENoYXRPdXRwdXRDb2RlQmxvY2tQYXJ0LnJldXNlS2V5KGNvbnRleHQuZWxlbWVudC5pZCwgY29kZUJsb2NrSW5kZXgsIGlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHJldXNhYmxlUmVmID0gcmV1c2FibGVPdXRwdXRDb2RlQmxvY2tSZWZzLmdldChyZXVzZUtleSk7XG5cdFx0aWYgKHJldXNhYmxlUmVmPy5vYmplY3QuaGFzU2FtZUNvbnRlbnQoaWRlbnRpZmllciwgdGV4dCwgaXNDb21wbGV0ZSkpIHtcblx0XHRcdHJldXNhYmxlT3V0cHV0Q29kZUJsb2NrUmVmcy5kZWxldGUocmV1c2VLZXkpO1xuXHRcdFx0dGhpcy5hbGxSZWZzLnB1c2gocmV1c2FibGVSZWYpO1xuXHRcdFx0cmV0dXJuIHJldXNhYmxlUmVmO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvZGVCbG9jayA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0T3V0cHV0Q29kZUJsb2NrUGFydCxcblx0XHRcdGlkZW50aWZpZXIsXG5cdFx0XHR0ZXh0LFxuXHRcdFx0Y29kZUJsb2NrSW5kZXgsXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0aXNDb21wbGV0ZSxcblx0XHRcdCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKVxuXHRcdCk7XG5cdFx0Y29uc3QgcmVmOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDaGF0T3V0cHV0Q29kZUJsb2NrUGFydD4gPSB7XG5cdFx0XHRvYmplY3Q6IGNvZGVCbG9jayxcblx0XHRcdGlzU3RhbGU6ICgpID0+IGZhbHNlLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gY29kZUJsb2NrLmRpc3Bvc2UoKVxuXHRcdH07XG5cdFx0dGhpcy5hbGxSZWZzLnB1c2gocmVmKTtcblx0XHRyZXR1cm4gcmVmO1xuXHR9XG5cblx0cHJpdmF0ZSBmaXJlQWdncmVnYXRlZERpZmYoKTogdm9pZCB7XG5cdFx0bGV0IHRvdGFsQWRkZWQgPSAwO1xuXHRcdGxldCB0b3RhbFJlbW92ZWQgPSAwO1xuXHRcdGNvbnN0IHJlc291cmNlczogSUNoYXRDb250ZW50UGFydERpZmZEYXRhWydyZXNvdXJjZXMnXVtudW1iZXJdW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiB0aGlzLmFsbFJlZnMpIHtcblx0XHRcdGlmIChyZWYub2JqZWN0IGluc3RhbmNlb2YgQ29sbGFwc2VkQ29kZUJsb2NrICYmIHJlZi5vYmplY3QuZGlmZikge1xuXHRcdFx0XHRjb25zdCBkaWZmID0gcmVmLm9iamVjdC5kaWZmO1xuXHRcdFx0XHR0b3RhbEFkZGVkICs9IGRpZmYuYWRkZWQ7XG5cdFx0XHRcdHRvdGFsUmVtb3ZlZCArPSBkaWZmLnJlbW92ZWQ7XG5cdFx0XHRcdHJlc291cmNlcy5wdXNoKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogZGlmZi5tb2RpZmllZFVSSSxcblx0XHRcdFx0XHRvcmlnaW5hbFVSSTogZGlmZi5vcmlnaW5hbFVSSSxcblx0XHRcdFx0XHRtb2RpZmllZFVSSTogZGlmZi5pc0RlbGV0ZWQgPyB1bmRlZmluZWQgOiBkaWZmLm1vZGlmaWVkU25hcHNob3RVUkkgPz8gZGlmZi5tb2RpZmllZFVSSSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlmZi5maXJlKHsgYWRkZWQ6IHRvdGFsQWRkZWQsIHJlbW92ZWQ6IHRvdGFsUmVtb3ZlZCwgcmVzb3VyY2VzIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb2RlQmxvY2soZGF0YTogSUNvZGVCbG9ja0RhdGEsIGN1cnJlbnRXaWR0aDogbnVtYmVyKTogSURpc3Bvc2FibGVSZWZlcmVuY2U8Q29kZUJsb2NrUGFydD4ge1xuXHRcdGNvbnN0IGtleSA9IENvZGVCbG9ja1BhcnQucG9vbEtleShkYXRhLmVsZW1lbnQuaWQsIGRhdGEuY29kZUJsb2NrSW5kZXgpO1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuZWRpdG9yUG9vbC5nZXQoa2V5KTtcblx0XHR0aGlzLmFsbFJlZnMucHVzaChyZWYpO1xuXHRcdHJlZi5vYmplY3QucmVuZGVyKGRhdGEsIGN1cnJlbnRXaWR0aCk7XG5cblx0XHQvLyBUaGVyZSBpcyBhIHNjZW5hcmlvIHdoZXJlIHJlcXVlc3QgY29kZSBibG9jayBjb250ZW50IGNoYW5nZXMgd2l0aG91dCBhIFJlc2l6ZU9ic2VydmVyIGNhbGxiYWNrLlxuXHRcdC8vIFdvcmsgYXJvdW5kIGl0IHdpdGggdGhpcyB0YXJnZXRlZCBvbkRpZEhlaWdodENoYW5nZS4gQnV0IHRoaXMgcGF0dGVybiBnZW5lcmFsbHkgc2hvdWxkbid0IGJlIG5lY2Vzc2FyeSBhbmRcblx0XHQvLyBzaG91bGRuJ3QgYmUgY29waWVkIGVsc2V3aGVyZS5cblx0XHRpZiAoIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgJiYgaXNSZXF1ZXN0Vk0oZGF0YS5lbGVtZW50KSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZWY7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRQcm9ncmVzc1JlbmRlcmFibGVSZXNwb25zZUNvbnRlbnQpOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXIua2luZCAhPT0gJ21hcmtkb3duQ29udGVudCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAob3RoZXIuY29udGVudC52YWx1ZSA9PT0gdGhpcy5tYXJrZG93bi5jb250ZW50LnZhbHVlICYmIGVxdWFsc0lubGluZVJlZmVyZW5jZXMob3RoZXIuaW5saW5lUmVmZXJlbmNlcywgdGhpcy5tYXJrZG93bi5pbmxpbmVSZWZlcmVuY2VzKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgYXJlIHN0cmVhbWluZyBpbiBjb2RlIHNob3duIGluIGFuIGVkaXQgcGlsbCwgZG8gbm90IHJlLXJlbmRlciB0aGUgZW50aXJlIGNvbnRlbnQgYXMgbG9uZyBhcyBpdCdzIGNvbWluZyBpblxuXHRcdGNvbnN0IGxhc3RDb2RlYmxvY2sgPSB0aGlzLl9jb2RlYmxvY2tzLmF0KC0xKTtcblx0XHRpZiAobGFzdENvZGVibG9jayAmJiBsYXN0Q29kZWJsb2NrLmNvZGVtYXBwZXJVcmkgIT09IHVuZGVmaW5lZCAmJiBsYXN0Q29kZWJsb2NrLmlzU3RyZWFtaW5nRWRpdCkge1xuXHRcdFx0cmV0dXJuIG90aGVyLmNvbnRlbnQudmFsdWUubGFzdEluZGV4T2YoJ2BgYCcpID09PSB0aGlzLm1hcmtkb3duLmNvbnRlbnQudmFsdWUubGFzdEluZGV4T2YoJ2BgYCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldCBpc1JlbmRlckNvbXBsZXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXI/LmlzRHJhaW5lZCA/PyB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEF0dGVtcHRzIGFuIGluY3JlbWVudGFsIERPTSB1cGRhdGUgZm9yIHNtb290aCBzdHJlYW1pbmcgaW5zdGVhZCBvZlxuXHQgKiB0ZWFyaW5nIGRvd24gYW5kIHJlYnVpbGRpbmcgdGhlIGVudGlyZSBtYXJrZG93biBwYXJ0LlxuXHQgKlxuXHQgKiBUaGUgbW9ycGhlciBjaGVja3MgdGhhdCB0aGUgbmV3IGNvbnRlbnQgaXMgYSBwdXJlIGFwcGVuZCwgdGhlblxuXHQgKiBzY2hlZHVsZXMgYSByQUYtYmF0Y2hlZCByZS1yZW5kZXIgdGhyb3VnaCB0aGUgZnVsbCBtYXJrZG93blxuXHQgKiBwaXBlbGluZS4gQ29kZSBibG9ja3MsIHRhYmxlcywgYW5kIGFsbCBtYXJrZG93biBmZWF0dXJlcyBhcmVcblx0ICogcmVuZGVyZWQgY29ycmVjdGx5IGJlY2F1c2UgdGhlIHVwZGF0ZSBnb2VzIHRocm91Z2ggdGhlIHN0YW5kYXJkXG5cdCAqIGBkb1JlbmRlck1hcmtkb3duKClgIHBhdGguXG5cdCAqXG5cdCAqIEBwYXJhbSBuZXdNYXJrZG93biBUaGUgbmV3IChhcHBlbmRlZCkgbWFya2Rvd24gY29udGVudC5cblx0ICogQHJldHVybnMgYHRydWVgIGlmIHRoZSBpbmNyZW1lbnRhbCB1cGRhdGUgc3VjY2VlZGVkIGFuZCB0aGUgY2FsbGVyXG5cdCAqICAgICAgICAgIHNob3VsZCB0cmVhdCB0aGlzIHBhcnQgYXMgdW5jaGFuZ2VkLiBgZmFsc2VgIGlmIGEgZnVsbFxuXHQgKiAgICAgICAgICByZS1yZW5kZXIgaXMgbmVlZGVkLlxuXHQgKi9cblx0dHJ5SW5jcmVtZW50YWxVcGRhdGUobmV3TWFya2Rvd246IElDaGF0TWFya2Rvd25Db250ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIWVxdWFsc0lubGluZVJlZmVyZW5jZXMobmV3TWFya2Rvd24uaW5saW5lUmVmZXJlbmNlcywgdGhpcy5tYXJrZG93bi5pbmxpbmVSZWZlcmVuY2VzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1Y2Nlc3MgPSB0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXIudHJ5TW9ycGgobmV3TWFya2Rvd24uY29udGVudC52YWx1ZSk7XG5cblx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0Ly8gVXBkYXRlIHRoZSBzdG9yZWQgbWFya2Rvd24gc28gaGFzU2FtZUNvbnRlbnQoKSByZXR1cm5zIHRydWVcblx0XHRcdC8vIGZvciBzdWJzZXF1ZW50IGRpZmZzIHdpdGggdGhlIHNhbWUgY29udGVudCwgYWxsb3dpbmcgdGhlXG5cdFx0XHQvLyBwcm9ncmVzc2l2ZSByZW5kZXIgdG8gZGV0ZWN0IFwiY2F1Z2h0IHVwXCIgYW5kIFwiY29tcGxldGVcIiBzdGF0ZXMuXG5cdFx0XHR0aGlzLm1hcmtkb3duID0gbmV3TWFya2Rvd247XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1Y2Nlc3M7XG5cdH1cblxuXHQvKipcblx0ICogRm9yd2FyZCB0aGUgc3RyZWFtJ3Mgd29yZC1yYXRlIGVzdGltYXRlIHRvIHRoZSBtb3JwaGVyJ3MgYnVmZmVyLlxuXHQgKi9cblx0dXBkYXRlU3RyZWFtUmF0ZShyYXRlOiBudW1iZXIsIGlzQ29tcGxldGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXI/LnVwZGF0ZVN0cmVhbVJhdGUocmF0ZSwgaXNDb21wbGV0ZSk7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuYWxsUmVmcy5mb3JFYWNoKChyZWYsIGluZGV4KSA9PiB7XG5cdFx0XHRpZiAocmVmLm9iamVjdCBpbnN0YW5jZW9mIENvZGVCbG9ja1BhcnQpIHtcblx0XHRcdFx0cmVmLm9iamVjdC5sYXlvdXQod2lkdGgpO1xuXHRcdFx0fSBlbHNlIGlmIChyZWYub2JqZWN0IGluc3RhbmNlb2YgQ2hhdE91dHB1dENvZGVCbG9ja1BhcnQpIHtcblx0XHRcdFx0cmVmLm9iamVjdC5sYXlvdXQod2lkdGgpO1xuXHRcdFx0fSBlbHNlIGlmIChyZWYub2JqZWN0IGluc3RhbmNlb2YgTWFya2Rvd25EaWZmQmxvY2tQYXJ0KSB7XG5cdFx0XHRcdHJlZi5vYmplY3QubGF5b3V0KHdpZHRoKTtcblx0XHRcdH0gZWxzZSBpZiAocmVmLm9iamVjdCBpbnN0YW5jZW9mIENvbGxhcHNlZENvZGVCbG9jaykge1xuXHRcdFx0XHRjb25zdCBjb2RlYmxvY2tNb2RlbCA9IHRoaXMuX2NvZGVibG9ja3NbaW5kZXhdO1xuXHRcdFx0XHRpZiAoY29kZWJsb2NrTW9kZWwuY29kZW1hcHBlclVyaSAmJiAhaXNFcXVhbChyZWYub2JqZWN0LnVyaSwgY29kZWJsb2NrTW9kZWwuY29kZW1hcHBlclVyaSkpIHtcblx0XHRcdFx0XHRyZWYub2JqZWN0LnJlbmRlcihjb2RlYmxvY2tNb2RlbC5jb2RlbWFwcGVyVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5tYXRoTGF5b3V0UGFydGljaXBhbnRzLmZvckVhY2gobGF5b3V0ID0+IGxheW91dCgpKTtcblx0fVxuXG5cdG9uRGlkUmVtb3VudCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiB0aGlzLmFsbFJlZnMpIHtcblx0XHRcdGlmIChyZWYub2JqZWN0IGluc3RhbmNlb2YgQ29kZUJsb2NrUGFydCB8fCByZWYub2JqZWN0IGluc3RhbmNlb2YgQ2hhdE91dHB1dENvZGVCbG9ja1BhcnQpIHtcblx0XHRcdFx0cmVmLm9iamVjdC5vbkRpZFJlbW91bnQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhZGREaXNwb3NhYmxlKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZXF1YWxzSW5saW5lUmVmZXJlbmNlcyhhOiBSZWNvcmQ8c3RyaW5nLCBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2U+IHwgdW5kZWZpbmVkLCBiOiBSZWNvcmQ8c3RyaW5nLCBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2U+IHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmIChhID09PSBiKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0cmV0dXJuICFhICYmICFiO1xuXHR9XG5cblx0Y29uc3QgYUtleXMgPSBPYmplY3Qua2V5cyhhKTtcblx0Y29uc3QgYktleXMgPSBPYmplY3Qua2V5cyhiKTtcblx0aWYgKGFLZXlzLmxlbmd0aCAhPT0gYktleXMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIGFLZXlzLmV2ZXJ5KGtleSA9PiBlcXVhbHNJbmxpbmVSZWZlcmVuY2UoYVtrZXldLCBiW2tleV0pKTtcbn1cblxuZnVuY3Rpb24gZXF1YWxzSW5saW5lUmVmZXJlbmNlKGE6IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSB8IHVuZGVmaW5lZCwgYjogSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmICghYSB8fCAhYikge1xuXHRcdHJldHVybiAhYSAmJiAhYjtcblx0fVxuXG5cdHJldHVybiBhLnJlc29sdmVJZCA9PT0gYi5yZXNvbHZlSWRcblx0XHQmJiBhLm5hbWUgPT09IGIubmFtZVxuXHRcdCYmIGVxdWFsc0lubGluZVJlZmVyZW5jZVZhbHVlKGEuaW5saW5lUmVmZXJlbmNlLCBiLmlubGluZVJlZmVyZW5jZSk7XG59XG5cbnR5cGUgSW5saW5lUmVmZXJlbmNlVmFsdWUgPSBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2VbJ2lubGluZVJlZmVyZW5jZSddO1xudHlwZSBXb3Jrc3BhY2VTeW1ib2xJbmxpbmVSZWZlcmVuY2UgPSBFeHRyYWN0PElubGluZVJlZmVyZW5jZVZhbHVlLCB7IG5hbWU6IHN0cmluZzsgbG9jYXRpb246IHVua25vd24gfT47XG50eXBlIFdvcmtzcGFjZVN5bWJvbENvbXBhcmVyID0gKGE6IFdvcmtzcGFjZVN5bWJvbElubGluZVJlZmVyZW5jZSwgYjogV29ya3NwYWNlU3ltYm9sSW5saW5lUmVmZXJlbmNlKSA9PiBib29sZWFuO1xuXG5jb25zdCB3b3Jrc3BhY2VTeW1ib2xDb21wYXJlcnM6IHsgcmVhZG9ubHkgW0sgaW4ga2V5b2YgV29ya3NwYWNlU3ltYm9sSW5saW5lUmVmZXJlbmNlXS0/OiBXb3Jrc3BhY2VTeW1ib2xDb21wYXJlciB9ID0ge1xuXHRuYW1lOiAoYSwgYikgPT4gYS5uYW1lID09PSBiLm5hbWUsXG5cdGNvbnRhaW5lck5hbWU6IChhLCBiKSA9PiBhLmNvbnRhaW5lck5hbWUgPT09IGIuY29udGFpbmVyTmFtZSxcblx0a2luZDogKGEsIGIpID0+IGEua2luZCA9PT0gYi5raW5kLFxuXHR0YWdzOiAoYSwgYikgPT4gZXF1YWxzU3ltYm9sVGFncyhhLnRhZ3MsIGIudGFncyksXG5cdGxvY2F0aW9uOiAoYSwgYikgPT4gaXNFcXVhbChhLmxvY2F0aW9uLnVyaSwgYi5sb2NhdGlvbi51cmkpICYmIFJhbmdlLmVxdWFsc1JhbmdlKGEubG9jYXRpb24ucmFuZ2UsIGIubG9jYXRpb24ucmFuZ2UpLFxufTtcblxuY29uc3Qgd29ya3NwYWNlU3ltYm9sQ29tcGFyZXJLZXlzID0gT2JqZWN0LmtleXMod29ya3NwYWNlU3ltYm9sQ29tcGFyZXJzKSBhcyAoa2V5b2YgV29ya3NwYWNlU3ltYm9sSW5saW5lUmVmZXJlbmNlKVtdO1xuXG5mdW5jdGlvbiBlcXVhbHNJbmxpbmVSZWZlcmVuY2VWYWx1ZShhOiBJbmxpbmVSZWZlcmVuY2VWYWx1ZSwgYjogSW5saW5lUmVmZXJlbmNlVmFsdWUpOiBib29sZWFuIHtcblx0aWYgKFVSSS5pc1VyaShhKSB8fCBVUkkuaXNVcmkoYikpIHtcblx0XHRyZXR1cm4gVVJJLmlzVXJpKGEpICYmIFVSSS5pc1VyaShiKSAmJiBpc0VxdWFsKGEsIGIpO1xuXHR9XG5cdGlmIChpc0xvY2F0aW9uKGEpIHx8IGlzTG9jYXRpb24oYikpIHtcblx0XHRyZXR1cm4gaXNMb2NhdGlvbihhKSAmJiBpc0xvY2F0aW9uKGIpICYmIGlzRXF1YWwoYS51cmksIGIudXJpKSAmJiBSYW5nZS5lcXVhbHNSYW5nZShhLnJhbmdlLCBiLnJhbmdlKTtcblx0fVxuXG5cdHJldHVybiBlcXVhbHNXb3Jrc3BhY2VTeW1ib2woYSwgYik7XG59XG5cbmZ1bmN0aW9uIGVxdWFsc1dvcmtzcGFjZVN5bWJvbChhOiBXb3Jrc3BhY2VTeW1ib2xJbmxpbmVSZWZlcmVuY2UsIGI6IFdvcmtzcGFjZVN5bWJvbElubGluZVJlZmVyZW5jZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gd29ya3NwYWNlU3ltYm9sQ29tcGFyZXJLZXlzLmV2ZXJ5KGtleSA9PiB3b3Jrc3BhY2VTeW1ib2xDb21wYXJlcnNba2V5XShhLCBiKSk7XG59XG5cbmZ1bmN0aW9uIGVxdWFsc1N5bWJvbFRhZ3MoYTogcmVhZG9ubHkgU3ltYm9sVGFnW10gfCB1bmRlZmluZWQsIGI6IHJlYWRvbmx5IFN5bWJvbFRhZ1tdIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmIChhID09PSBiKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKCFhIHx8ICFiIHx8IGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gYS5ldmVyeSgodGFnLCBpbmRleCkgPT4gdGFnID09PSBiW2luZGV4XSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2RlYmxvY2tIYXNDbG9zaW5nQmFja3RpY2tzKHN0cjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHN0ciA9IHN0ci50cmltKCk7XG5cdHJldHVybiAhIXN0ci5tYXRjaCgvXFxuYGBgKyQvKTtcbn1cblxuY2xhc3MgQ2hhdE91dHB1dENvZGVCbG9ja1BhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmV1c2VLZXkoZWxlbWVudElkOiBzdHJpbmcsIGNvZGVCbG9ja0luZGV4OiBudW1iZXIsIGlkZW50aWZpZXI6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2VsZW1lbnRJZH0vJHtjb2RlQmxvY2tJbmRleH0vJHtpZGVudGlmaWVyLnRvTG93ZXJDYXNlKCl9YDtcblx0fVxuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSByZXVzZUtleTogc3RyaW5nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2VDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVkT3V0cHV0UGFydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxSZW5kZXJlZE91dHB1dFBhcnQ+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaWRlbnRpZmllcjogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGV4dDogc3RyaW5nLFxuXHRcdGNvZGVCbG9ja0luZGV4OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlzQ29tcGxldGU6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZUhlaWdodDogKCkgPT4gdm9pZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRPdXRwdXRSZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlOiBJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSxcblx0XHRASUNoYXRPdXRwdXRQYXJ0U3RhdGVDYWNoZSBwcml2YXRlIHJlYWRvbmx5IHN0YXRlQ2FjaGU6IElDaGF0T3V0cHV0UGFydFN0YXRlQ2FjaGUsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZXVzZUtleSA9IENoYXRPdXRwdXRDb2RlQmxvY2tQYXJ0LnJldXNlS2V5KGNvbnRleHQuZWxlbWVudC5pZCwgY29kZUJsb2NrSW5kZXgsIGlkZW50aWZpZXIpO1xuXG5cdFx0Y29uc3QgdGl0bGUgPSBsb2NhbGl6ZSgnY2hhdC5yZW5kZXJlZENvZGVCbG9ja0xhYmVsJywgXCJSZW5kZXJlZCBjb2RlIGJsb2NrIHswfVwiLCBjb2RlQmxvY2tJbmRleCArIDEpO1xuXHRcdHRoaXMuZWxlbWVudCA9ICQoJy5pbnRlcmFjdGl2ZS1yZXN1bHQtY29kZS1ibG9jay5jaGF0LW91dHB1dC1jb2RlLWJsb2NrLnRvb2wtb3V0cHV0LXBhcnQnKTtcblx0XHR0aGlzLmVsZW1lbnQudGFiSW5kZXggPSAtMTtcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGl0bGU7XG5cblx0XHRjb25zdCBwYXJlbnQgPSAkKCcud2Vidmlldy1vdXRwdXQnKTtcblx0XHRwYXJlbnQuc3R5bGUubWF4SGVpZ2h0ID0gJzgwdmgnO1xuXHRcdHBhcmVudC5zdHlsZS5taW5IZWlnaHQgPSAnMzhweCc7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHBhcmVudCk7XG5cblx0XHRjb25zdCBzdGF0ZUNhY2hlS2V5ID0gYGNvZGVCbG9jay8ke2NvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0vJHtjb250ZXh0LmVsZW1lbnQuaWR9LyR7Y29kZUJsb2NrSW5kZXh9LyR7aWRlbnRpZmllci50b0xvd2VyQ2FzZSgpfWA7XG5cdFx0Y29uc3QgcGFydFN0YXRlOiBJT3V0cHV0UGFydFN0YXRlID0gdGhpcy5zdGF0ZUNhY2hlLmdldChzdGF0ZUNhY2hlS2V5KSA/PyB7IGhlaWdodDogMCB9O1xuXHRcdHRoaXMuc3RhdGVDYWNoZS5zZXQoc3RhdGVDYWNoZUtleSwgcGFydFN0YXRlKTtcblx0XHRpZiAocGFydFN0YXRlLmhlaWdodCkge1xuXHRcdFx0cGFyZW50LnN0eWxlLmhlaWdodCA9IGAke3BhcnRTdGF0ZS5oZWlnaHR9cHhgO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2dyZXNzTWVzc2FnZSA9ICQoJ3NwYW4nKTtcblx0XHRwcm9ncmVzc01lc3NhZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5jb2RlQmxvY2tPdXRwdXRSZW5kZXJpbmcnLCBcIlJlbmRlcmluZyBjb2RlIGJsb2NrLi4uXCIpO1xuXHRcdGNvbnN0IHByb2dyZXNzUGFydCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFByb2dyZXNzU3ViUGFydCwgcHJvZ3Jlc3NNZXNzYWdlLCBUaGVtZUljb24ubW9kaWZ5KENvZGljb24ubG9hZGluZywgJ3NwaW4nKSwgdW5kZWZpbmVkKSk7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHByb2dyZXNzUGFydC5kb21Ob2RlKTtcblx0XHRpZiAoIWlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VIZWlnaHQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNoYXRPdXRwdXRSZW5kZXJlclNlcnZpY2UucmVuZGVyQ29kZUJsb2NrKGlkZW50aWZpZXIsIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh0ZXh0KSwgcGFyZW50LCB7XG5cdFx0XHR3ZWJ2aWV3U3RhdGU6IHBhcnRTdGF0ZS53ZWJ2aWV3U3RhdGUsXG5cdFx0XHR0aXRsZSxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHR9LCB0aGlzLl9kaXNwb3NlQ3RzLnRva2VuKS50aGVuKHJlbmRlcmVkSXRlbSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZGlzcG9zZUN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZW5kZXJlZEl0ZW0uZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlbmRlcmVkT3V0cHV0UGFydC52YWx1ZSA9IHJlbmRlcmVkSXRlbTtcblx0XHRcdHByb2dyZXNzUGFydC5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0cGFyZW50LnN0eWxlLm1pbkhlaWdodCA9ICcnO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUhlaWdodCgpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZW5kZXJlZEl0ZW0ud2Vidmlldy5vbkRpZFVwZGF0ZVN0YXRlKGUgPT4ge1xuXHRcdFx0XHRwYXJ0U3RhdGUud2Vidmlld1N0YXRlID0gZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVuZGVyZWRJdGVtLm9uRGlkQ2hhbmdlSGVpZ2h0KG5ld0hlaWdodCA9PiB7XG5cdFx0XHRcdHBhcnRTdGF0ZS5oZWlnaHQgPSBuZXdIZWlnaHQ7XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VIZWlnaHQoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dC5vbkRpZENoYW5nZVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdFx0cmVuZGVyZWRJdGVtLnJlaW5pdGlhbGl6ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSwgZXJyb3IgPT4ge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3IgcmVuZGVyaW5nIGNoYXQgY29kZSBibG9jazonLCBlcnJvcik7XG5cdFx0XHRwcm9ncmVzc1BhcnQuZG9tTm9kZS5yZXBsYWNlV2l0aCh0aGlzLnJlbmRlckVycm9yKGVycm9yKSk7XG5cdFx0XHRwYXJlbnQuc3R5bGUubWluSGVpZ2h0ID0gJyc7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlSGVpZ2h0KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChpZGVudGlmaWVyOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgaXNDb21wbGV0ZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpZGVudGlmaWVyLnRvTG93ZXJDYXNlKCkgPT09IHRoaXMuaWRlbnRpZmllci50b0xvd2VyQ2FzZSgpXG5cdFx0XHQmJiB0ZXh0ID09PSB0aGlzLnRleHRcblx0XHRcdCYmIGlzQ29tcGxldGUgPT09IHRoaXMuaXNDb21wbGV0ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zZUN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGxheW91dCh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLm1heFdpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHR9XG5cblx0b25EaWRSZW1vdW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVkT3V0cHV0UGFydC52YWx1ZT8ucmVpbml0aWFsaXplKCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHRjb25zdCB3ZWJ2aWV3ID0gdGhpcy5fcmVuZGVyZWRPdXRwdXRQYXJ0LnZhbHVlPy53ZWJ2aWV3O1xuXHRcdGlmICh3ZWJ2aWV3KSB7XG5cdFx0XHR3ZWJ2aWV3LmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRXJyb3IoZXJyb3I6IEVycm9yKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGVycm9yTm9kZSA9ICQoJy5vdXRwdXQtZXJyb3InKTtcblxuXHRcdGNvbnN0IGVycm9ySGVhZGVyTm9kZSA9ICQoJy5vdXRwdXQtZXJyb3ItaGVhZGVyJyk7XG5cdFx0ZG9tLmFwcGVuZChlcnJvck5vZGUsIGVycm9ySGVhZGVyTm9kZSk7XG5cblx0XHRjb25zdCBpY29uRWxlbWVudCA9ICQoJ2RpdicpO1xuXHRcdGljb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5lcnJvcikpO1xuXHRcdGVycm9ySGVhZGVyTm9kZS5hcHBlbmQoaWNvbkVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgZXJyb3JUaXRsZU5vZGUgPSAkKCcub3V0cHV0LWVycm9yLXRpdGxlJyk7XG5cdFx0ZXJyb3JUaXRsZU5vZGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5jb2RlQmxvY2tPdXRwdXRFcnJvcicsIFwiRXJyb3IgcmVuZGVyaW5nIHRoZSBjb2RlIGJsb2NrXCIpO1xuXHRcdGVycm9ySGVhZGVyTm9kZS5hcHBlbmQoZXJyb3JUaXRsZU5vZGUpO1xuXG5cdFx0Y29uc3QgZXJyb3JNZXNzYWdlTm9kZSA9ICQoJy5vdXRwdXQtZXJyb3ItZGV0YWlscycpO1xuXHRcdGVycm9yTWVzc2FnZU5vZGUudGV4dENvbnRlbnQgPSBlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpO1xuXHRcdGVycm9yTm9kZS5hcHBlbmQoZXJyb3JNZXNzYWdlTm9kZSk7XG5cblx0XHRyZXR1cm4gZXJyb3JOb2RlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb2xsYXBzZWRDb2RlQmxvY2sgZXh0ZW5kcyBDaGF0RWRpdFBpbGxFbGVtZW50IHtcblxuXHRwcml2YXRlIGN1cnJlbnREaWZmOiBJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ7XG5cdGdldCBkaWZmKCk6IElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudERpZmY7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURpZmYgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdFNlc3Npb25FbnRyeURpZmY+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURpZmY6IEV2ZW50PElFZGl0U2Vzc2lvbkVudHJ5RGlmZj4gPSB0aGlzLl9vbkRpZENoYW5nZURpZmYuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1N0b3JlID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5VbmRvU3RvcDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobGFiZWxTZXJ2aWNlLCBtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDbGljayhlID0+IHRoaXMuc2hvd0RpZmYoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ29udGV4dE1lbnUoZXZlbnQgPT4ge1xuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMudXJpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5DaGF0RWRpdGluZ0NvZGVCbG9ja0NvbnRleHQsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdGFyZzoge1xuXHRcdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHRoaXMuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRyZXF1ZXN0SWQ6IHRoaXMucmVxdWVzdElkLFxuXHRcdFx0XHRcdFx0XHR1cmk6IHRoaXMudXJpLFxuXHRcdFx0XHRcdFx0XHRzdG9wSWQ6IHRoaXMuaW5VbmRvU3RvcCxcblx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIENoYXRFZGl0aW5nQWN0aW9uQ29udGV4dCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm4gZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0RpZmYoeyBlZGl0b3JPcHRpb25zOiBvcHRpb25zLCBvcGVuVG9TaWRlIH06IElPcGVuRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGdyb3VwID0gb3BlblRvU2lkZSA/IFNJREVfR1JPVVAgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuY3VycmVudERpZmYpIHtcblx0XHRcdC8vIElmIHRoZSBjaGFuZ2UgaXMgYSBwdXJlIGFkZGl0aW9uIGludG8gYSBmaWxlIHdob3NlIG9yaWdpbmFsIHZlcnNpb24gZGlkIG5vdFxuXHRcdFx0Ly8gZXhpc3Qgb3Igd2FzIGVtcHR5LCB0aGVyZSBpcyBub3RoaW5nIG1lYW5pbmdmdWwgdG8gZGlmZiBhZ2FpbnN0LiBPcGVuIHRoZVxuXHRcdFx0Ly8gZmlsZSBpbiBhIG5vcm1hbCBlZGl0b3IgaW5zdGVhZCBvZiBhIGRpZmYgZWRpdG9yLlxuXHRcdFx0aWYgKHRoaXMuY3VycmVudERpZmYucmVtb3ZlZCA9PT0gMCAmJiBhd2FpdCBpc1Jlc291cmNlQ29udGVudEVtcHR5KHRoaXMudGV4dE1vZGVsU2VydmljZSwgdGhpcy5jdXJyZW50RGlmZi5vcmlnaW5hbFVSSSkgJiYgdGhpcy51cmkpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdGhpcy51cmksIG9wdGlvbnMgfSwgZ3JvdXApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiB0aGlzLmN1cnJlbnREaWZmLm9yaWdpbmFsVVJJIH0sXG5cdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiB0aGlzLmN1cnJlbnREaWZmLm1vZGlmaWVkVVJJIH0sXG5cdFx0XHRcdG9wdGlvbnNcblx0XHRcdH0sIGdyb3VwKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMudXJpKSB7XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB0aGlzLnVyaSwgb3B0aW9ucyB9LCBncm91cCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB1cmkgVVJJIG9mIHRoZSBmaWxlIG9uLWRpc2sgYmVpbmcgY2hhbmdlZFxuXHQgKi9cblx0cmVuZGVyKHVyaTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5wcm9ncmVzc1N0b3JlLmNsZWFyKCk7XG5cblx0XHR0aGlzLnNldFVyaSh1cmkpO1xuXHRcdHRoaXMuc2V0U3RhdHVzKHVuZGVmaW5lZCwgJycpO1xuXHRcdHRoaXMuc2V0TGFiZWxEZXRhaWwoJycpO1xuXHRcdHRoaXMuc2V0UHJvZ3Jlc3NGaWxsKHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHRoaXMuc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBlZGl0U2Vzc2lvbiA9IHNlc3Npb24/LmVkaXRpbmdTZXNzaW9uO1xuXHRcdGlmICghZWRpdFNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaWZmT2JzZXJ2YWJsZSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gZWRpdFNlc3Npb24ucmVhZEVudHJ5KHVyaSwgcmVhZGVyKTtcblx0XHRcdHJldHVybiBlbnRyeSAmJiBlZGl0U2Vzc2lvbi5nZXRFbnRyeURpZmZCZXR3ZWVuU3RvcHMoZW50cnkubW9kaWZpZWRVUkksIHRoaXMucmVxdWVzdElkLCB0aGlzLmluVW5kb1N0b3ApO1xuXHRcdH0pLm1hcCgoZCwgcikgPT4gZD8ucmVhZChyKSk7XG5cblx0XHRjb25zdCBpc1N0cmVhbWluZyA9IGRlcml2ZWQociA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGVkaXRTZXNzaW9uLnJlYWRFbnRyeSh1cmksIHIpO1xuXHRcdFx0Y29uc3QgY3VycmVudGx5TW9kaWZpZWQgPSBlbnRyeT8uaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnkucmVhZChyKTtcblx0XHRcdHJldHVybiAhIWN1cnJlbnRseU1vZGlmaWVkICYmIGN1cnJlbnRseU1vZGlmaWVkLnJlc3BvbnNlTW9kZWwucmVxdWVzdElkID09PSB0aGlzLnJlcXVlc3RJZCAmJiBjdXJyZW50bHlNb2RpZmllZC51bmRvU3RvcElkID09PSB0aGlzLmluVW5kb1N0b3A7XG5cdFx0fSk7XG5cblx0XHQvLyBTZXQgdGhlIGljb24vY2xhc3NlcyB3aGlsZSBlZGl0cyBhcmUgc3RyZWFtaW5nXG5cdFx0Y29uc3QgaWNvblRleHQgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHVyaSk7XG5cdFx0dGhpcy5wcm9ncmVzc1N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0aWYgKGlzU3RyZWFtaW5nLnJlYWQocikpIHtcblx0XHRcdFx0Y29uc3QgY29kaWNvbiA9IFRoZW1lSWNvbi5tb2RpZnkoQ29kaWNvbi5sb2FkaW5nLCAnc3BpbicpO1xuXHRcdFx0XHR0aGlzLnNldFN0YXR1cyhjb2RpY29uLCBsb2NhbGl6ZSgnY2hhdC5jb2RlYmxvY2suYXBwbHlpbmdFZGl0cycsICdBcHBseWluZyBlZGl0cycpKTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlZGl0U2Vzc2lvbi5yZWFkRW50cnkodXJpLCByKTtcblx0XHRcdFx0Y29uc3QgcndSYXRpbyA9IE1hdGguZmxvb3IoKGVudHJ5Py5yZXdyaXRlUmF0aW8ucmVhZChyKSB8fCAwKSAqIDEwMCk7XG5cblx0XHRcdFx0Y29uc3Qgc2hvd0FuaW1hdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uU2hvd0NvZGVCbG9ja1Byb2dyZXNzQW5pbWF0aW9uKTtcblx0XHRcdFx0aWYgKHNob3dBbmltYXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLnNldFByb2dyZXNzRmlsbChyd1JhdGlvKTtcblx0XHRcdFx0XHR0aGlzLnNldExhYmVsRGV0YWlsKCcnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNldFByb2dyZXNzRmlsbCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRoaXMuc2V0TGFiZWxEZXRhaWwocndSYXRpbyA9PT0gMCB8fCAhcndSYXRpbyA/IGxvY2FsaXplKCdjaGF0LmNvZGVibG9jay5nZW5lcmF0aW5nJywgXCJHZW5lcmF0aW5nIGVkaXRzLi4uXCIpIDogbG9jYWxpemUoJ2NoYXQuY29kZWJsb2NrLmFwcGx5aW5nUGVyY2VudGFnZScsIFwiKHswfSUpLi4uXCIsIHJ3UmF0aW8pKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zZXRTdGF0dXMoQ29kaWNvbi5jaGVjaywgbG9jYWxpemUoJ2NoYXQuY29kZWJsb2NrLmVkaXRlZCcsICdFZGl0ZWQnKSk7XG5cdFx0XHRcdHRoaXMuc2V0UHJvZ3Jlc3NGaWxsKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuc2V0TGFiZWxEZXRhaWwoJycpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlbmRlciB0aGUgKy8tIGRpZmZcblx0XHR0aGlzLnByb2dyZXNzU3RvcmUuYWRkKGF1dG9ydW5TZWxmRGlzcG9zYWJsZShyID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBkaWZmT2JzZXJ2YWJsZS5yZWFkKHIpO1xuXHRcdFx0aWYgKGNoYW5nZXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2VzICYmICFjaGFuZ2VzPy5pZGVudGljYWwgJiYgIWNoYW5nZXM/LnF1aXRFYXJseSkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnREaWZmID0gY2hhbmdlcztcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaWZmLmZpcmUoY2hhbmdlcyk7XG5cdFx0XHRcdHRoaXMuc2V0RGlmZih7IGFkZGVkOiBjaGFuZ2VzLmFkZGVkLCByZW1vdmVkOiBjaGFuZ2VzLnJlbW92ZWQgfSk7XG5cdFx0XHRcdGNvbnN0IGluc2VydGlvbnNGcmFnbWVudCA9IGNoYW5nZXMuYWRkZWQgPT09IDEgPyBsb2NhbGl6ZSgnY2hhdC5jb2RlYmxvY2suaW5zZXJ0aW9ucy5vbmUnLCBcIjEgaW5zZXJ0aW9uXCIpIDogbG9jYWxpemUoJ2NoYXQuY29kZWJsb2NrLmluc2VydGlvbnMnLCBcInswfSBpbnNlcnRpb25zXCIsIGNoYW5nZXMuYWRkZWQpO1xuXHRcdFx0XHRjb25zdCBkZWxldGlvbnNGcmFnbWVudCA9IGNoYW5nZXMucmVtb3ZlZCA9PT0gMSA/IGxvY2FsaXplKCdjaGF0LmNvZGVibG9jay5kZWxldGlvbnMub25lJywgXCIxIGRlbGV0aW9uXCIpIDogbG9jYWxpemUoJ2NoYXQuY29kZWJsb2NrLmRlbGV0aW9ucycsIFwiezB9IGRlbGV0aW9uc1wiLCBjaGFuZ2VzLnJlbW92ZWQpO1xuXHRcdFx0XHR0aGlzLnNldEFyaWFMYWJlbChsb2NhbGl6ZSgnc3VtbWFyeScsICdFZGl0ZWQgezB9LCB7MX0sIHsyfScsIGljb25UZXh0LCBpbnNlcnRpb25zRnJhZ21lbnQsIGRlbGV0aW9uc0ZyYWdtZW50KSk7XG5cblx0XHRcdFx0Ly8gTm8gbmVlZCB0byBrZWVwIHVwZGF0aW5nIG9uY2Ugd2UgZ2V0IHRoZSBkaWZmIGluZm9cblx0XHRcdFx0aWYgKGNoYW5nZXMuaXNGaW5hbCkge1xuXHRcdFx0XHRcdHIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZpeENvZGVUZXh0KHRleHQ6IHN0cmluZywgbGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKGxhbmd1YWdlSWQgPT09ICdwaHAnKSB7XG5cdFx0Ly8gPD9waHAgb3Igc2hvcnQgdGFnIHZlcnNpb24gPD9cblx0XHRpZiAoIXRleHQudHJpbSgpLnN0YXJ0c1dpdGgoJzw/JykpIHtcblx0XHRcdHJldHVybiBgPD9waHBcXG4ke3RleHR9YDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdGV4dDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMscUNBQWdHO0FBQ3pHLFNBQVMsY0FBYztBQUN2QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWSxpQkFBaUIsU0FBc0IseUJBQXlCO0FBQ3JGLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxTQUFTLHVCQUF1QixlQUFlO0FBQ3hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUNBQWlD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
