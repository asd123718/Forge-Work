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
import { getWindow } from "../../../../../../base/browser/dom.js";
import { coalesce } from "../../../../../../base/common/arrays.js";
import { DeferredPromise, runWhenGlobalIdle } from "../../../../../../base/common/async.js";
import { decodeBase64 } from "../../../../../../base/common/buffer.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { getExtensionForMimeType, isTextStreamMime } from "../../../../../../base/common/mime.js";
import { FileAccess, Schemas, matchesScheme, matchesSomeScheme } from "../../../../../../base/common/network.js";
import { equals } from "../../../../../../base/common/objects.js";
import * as osPath from "../../../../../../base/common/path.js";
import { isMacintosh, isWeb } from "../../../../../../base/common/platform.js";
import { dirname, extname, isEqual, joinPath } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import * as UUID from "../../../../../../base/common/uuid.js";
import { TokenizationRegistry } from "../../../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { generateTokensCSSForColorMap } from "../../../../../../editor/common/languages/supports/tokenization.js";
import { tokenizeToString } from "../../../../../../editor/common/languages/textToHtmlTokenizer.js";
import * as nls from "../../../../../../nls.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IFileDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { EditorOpenSource } from "../../../../../../platform/editor/common/editor.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { extractSelection, IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { editorFindMatch, editorFindMatchHighlight } from "../../../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, Themable } from "../../../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { CellEditState, RenderOutputType } from "../../notebookBrowser.js";
import { NOTEBOOK_WEBVIEW_BOUNDARY } from "../notebookCellList.js";
import { preloadsScriptStr } from "./webviewPreloads.js";
import { transformWebviewThemeVars } from "./webviewThemeMapping.js";
import { MarkupCellViewModel } from "../../viewModel/markupCellViewModel.js";
import { CellUri, RendererMessagingSpec } from "../../../common/notebookCommon.js";
import { INotebookLoggingService } from "../../../common/notebookLoggingService.js";
import { INotebookService } from "../../../common/notebookService.js";
import { IWebviewService, WebviewContentPurpose, WebviewOriginStore } from "../../../../webview/browser/webview.js";
import { WebviewWindowDragMonitor } from "../../../../webview/browser/webviewWindowDragMonitor.js";
import { asWebviewUri, webviewGenericCspSource } from "../../../../webview/common/webview.js";
import { IEditorGroupsService } from "../../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { getOutputText, getOutputStreamText, TEXT_BASED_MIMETYPES } from "../../viewModel/cellOutputTextHelper.js";
const LINE_COLUMN_REGEX = /:([\d]+)(?::([\d]+))?$/;
const LineQueryRegex = /line=(\d+)$/;
const FRAGMENT_REGEX = /^(.*)#([^#]*)$/;
let BackLayerWebView = class extends Themable {
  constructor(notebookEditor, id, notebookViewType, documentUri, options, rendererMessaging, webviewService, openerService, notebookService, contextService, environmentService, fileDialogService, fileService, contextMenuService, contextKeyService, workspaceTrustManagementService, configurationService, languageService, workspaceContextService, editorGroupService, editorService, storageService, pathService, notebookLogService, themeService, telemetryService) {
    super(themeService);
    this.notebookEditor = notebookEditor;
    this.id = id;
    this.notebookViewType = notebookViewType;
    this.documentUri = documentUri;
    this.options = options;
    this.rendererMessaging = rendererMessaging;
    this.webviewService = webviewService;
    this.openerService = openerService;
    this.notebookService = notebookService;
    this.contextService = contextService;
    this.environmentService = environmentService;
    this.fileDialogService = fileDialogService;
    this.fileService = fileService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.configurationService = configurationService;
    this.languageService = languageService;
    this.workspaceContextService = workspaceContextService;
    this.editorGroupService = editorGroupService;
    this.editorService = editorService;
    this.storageService = storageService;
    this.pathService = pathService;
    this.notebookLogService = notebookLogService;
    this.telemetryService = telemetryService;
    this.webview = void 0;
    this.insetMapping = /* @__PURE__ */ new Map();
    this.pendingWebviewIdleCreationRequest = /* @__PURE__ */ new Map();
    this.pendingWebviewIdleInsetMapping = /* @__PURE__ */ new Map();
    this.reversedPendingWebviewIdleInsetMapping = /* @__PURE__ */ new Map();
    this.markupPreviewMapping = /* @__PURE__ */ new Map();
    this.hiddenInsetMapping = /* @__PURE__ */ new Set();
    this.reversedInsetMapping = /* @__PURE__ */ new Map();
    this.localResourceRootsCache = void 0;
    this._onMessage = this._register(new Emitter());
    this._preloadsCache = /* @__PURE__ */ new Set();
    this.onMessage = this._onMessage.event;
    this._disposed = false;
    this.firstInit = true;
    this.nonce = UUID.generateUuid();
    this._logRendererDebugMessage("Creating backlayer webview for notebook");
    this.element = document.createElement("div");
    this.element.style.height = "1400px";
    this.element.style.position = "absolute";
    if (rendererMessaging) {
      this._register(rendererMessaging);
      rendererMessaging.receiveMessageHandler = (rendererId, message) => {
        if (!this.webview || this._disposed) {
          return Promise.resolve(false);
        }
        this._sendMessageToWebview({
          __vscode_notebook_message: true,
          type: "customRendererMessage",
          rendererId,
          message
        });
        return Promise.resolve(true);
      };
    }
    this._register(workspaceTrustManagementService.onDidChangeTrust((e) => {
      const baseUrl = this.asWebviewUri(this.getNotebookBaseUri(), void 0);
      const htmlContent = this.generateContent(baseUrl.toString());
      this.webview?.setHtml(htmlContent);
    }));
    this._register(TokenizationRegistry.onDidChange(() => {
      this._sendMessageToWebview({
        type: "tokenizedStylesChanged",
        css: getTokenizationCss()
      });
    }));
  }
  static getOriginStore(storageService) {
    this._originStore ??= new WebviewOriginStore("notebook.backlayerWebview.origins", storageService);
    return this._originStore;
  }
  updateOptions(options) {
    this.options = options;
    this._updateStyles();
    this._updateOptions();
  }
  _logRendererDebugMessage(msg) {
    this.notebookLogService.debug("BacklayerWebview", `${this.documentUri} (${this.id}) - ${msg}`);
  }
  _updateStyles() {
    this._sendMessageToWebview({
      type: "notebookStyles",
      styles: this._generateStyles()
    });
  }
  _updateOptions() {
    this._sendMessageToWebview({
      type: "notebookOptions",
      options: {
        dragAndDropEnabled: this.options.dragAndDropEnabled
      },
      renderOptions: {
        lineLimit: this.options.outputLineLimit,
        outputScrolling: this.options.outputScrolling,
        outputWordWrap: this.options.outputWordWrap,
        linkifyFilePaths: this.options.outputLinkifyFilePaths,
        minimalError: this.options.minimalError
      }
    });
  }
  _generateStyles() {
    return {
      "notebook-output-left-margin": `${this.options.leftMargin + this.options.runGutter}px`,
      "notebook-output-width": `calc(100% - ${this.options.leftMargin + this.options.rightMargin + this.options.runGutter}px)`,
      "notebook-output-node-padding": `${this.options.outputNodePadding}px`,
      "notebook-run-gutter": `${this.options.runGutter}px`,
      "notebook-preview-node-padding": `${this.options.previewNodePadding}px`,
      "notebook-markdown-left-margin": `${this.options.markdownLeftMargin}px`,
      "notebook-output-node-left-padding": `${this.options.outputNodeLeftPadding}px`,
      "notebook-markdown-min-height": `${this.options.previewNodePadding * 2}px`,
      "notebook-markup-font-size": typeof this.options.markupFontSize === "number" && this.options.markupFontSize > 0 ? `${this.options.markupFontSize}px` : `calc(${this.options.fontSize}px * 1.2)`,
      "notebook-markdown-line-height": typeof this.options.markdownLineHeight === "number" && this.options.markdownLineHeight > 0 ? `${this.options.markdownLineHeight}px` : `normal`,
      "notebook-cell-output-font-size": `${this.options.outputFontSize || this.options.fontSize}px`,
      "notebook-cell-output-line-height": `${this.options.outputLineHeight}px`,
      "notebook-cell-output-max-height": `${this.options.outputLineHeight * this.options.outputLineLimit + 2}px`,
      "notebook-cell-output-font-family": this.options.outputFontFamily || this.options.fontFamily,
      "notebook-cell-markup-empty-content": nls.localize("notebook.emptyMarkdownPlaceholder", "Empty markdown cell, double-click or press enter to edit."),
      "notebook-cell-renderer-not-found-error": nls.localize({
        key: "notebook.error.rendererNotFound",
        comment: ["$0 is a placeholder for the mime type"]
      }, "No renderer found for '$0'"),
      "notebook-cell-renderer-fallbacks-exhausted": nls.localize({
        key: "notebook.error.rendererFallbacksExhausted",
        comment: ["$0 is a placeholder for the mime type"]
      }, "Could not render content for '$0'"),
      "notebook-markup-font-family": this.options.markupFontFamily
    };
  }
  generateContent(baseUrl) {
    const renderersData = this.getRendererData();
    const preloadsData = this.getStaticPreloadsData();
    const renderOptions = {
      lineLimit: this.options.outputLineLimit,
      outputScrolling: this.options.outputScrolling,
      outputWordWrap: this.options.outputWordWrap,
      linkifyFilePaths: this.options.outputLinkifyFilePaths,
      minimalError: this.options.minimalError
    };
    const preloadScript = preloadsScriptStr(
      {
        ...this.options,
        tokenizationCss: getTokenizationCss()
      },
      { dragAndDropEnabled: this.options.dragAndDropEnabled },
      renderOptions,
      renderersData,
      preloadsData,
      this.workspaceTrustManagementService.isWorkspaceTrusted(),
      this.nonce
    );
    const enableCsp = this.configurationService.getValue("notebook.experimental.enableCsp");
    const currentHighlight = this.getColor(editorFindMatch);
    const findMatchHighlight = this.getColor(editorFindMatchHighlight);
    return (
      /* html */
      `
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<base href="${baseUrl}/" />
				${enableCsp ? `<meta http-equiv="Content-Security-Policy" content="
					default-src 'none';
					script-src ${webviewGenericCspSource} 'unsafe-inline' 'unsafe-eval';
					style-src ${webviewGenericCspSource} 'unsafe-inline';
					img-src ${webviewGenericCspSource} https: http: data:;
					font-src ${webviewGenericCspSource} https:;
					connect-src https:;
					child-src https: data:;
				">` : ""}
				<style nonce="${this.nonce}">
					::highlight(find-highlight) {
						background-color: var(--vscode-editor-findMatchBackground, ${findMatchHighlight});
					}

					::highlight(current-find-highlight) {
						background-color: var(--vscode-editor-findMatchHighlightBackground, ${currentHighlight});
					}

					#container .cell_container {
						width: 100%;
					}

					#container .output_container {
						width: 100%;
					}

					#container .cell_container.nb-insertHighlight div.output_container div.output {
						background-color: var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground));
					}

					#container > div > div > div.output {
						font-size: var(--notebook-cell-output-font-size);
						width: var(--notebook-output-width);
						margin-left: var(--notebook-output-left-margin);
						background-color: var(--theme-notebook-output-background);
						padding-top: var(--notebook-output-node-padding);
						padding-right: var(--notebook-output-node-padding);
						padding-bottom: var(--notebook-output-node-padding);
						padding-left: var(--notebook-output-node-left-padding);
						box-sizing: border-box;
						border-top: none;
					}

					/* markdown */
					#container div.preview {
						width: 100%;
						padding-right: var(--notebook-preview-node-padding);
						padding-left: var(--notebook-markdown-left-margin);
						padding-top: var(--notebook-preview-node-padding);
						padding-bottom: var(--notebook-preview-node-padding);

						box-sizing: border-box;
						white-space: nowrap;
						overflow: hidden;
						white-space: initial;

						font-size: var(--notebook-markup-font-size);
						line-height: var(--notebook-markdown-line-height);
						color: var(--theme-ui-foreground);
						font-family: var(--notebook-markup-font-family);
					}

					#container div.preview.draggable {
						user-select: none;
						-webkit-user-select: none;
						-ms-user-select: none;
						cursor: grab;
					}

					#container div.preview.selected {
						background: var(--theme-notebook-cell-selected-background);
					}

					#container div.preview.dragging {
						background-color: var(--theme-background);
						opacity: 0.5 !important;
					}

					.monaco-workbench.vs-dark .notebookOverlay .cell.markdown .latex img,
					.monaco-workbench.vs-dark .notebookOverlay .cell.markdown .latex-block img {
						filter: brightness(0) invert(1)
					}

					#container .markup > div.nb-symbolHighlight {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .markup > div.nb-insertHighlight {
						background-color: var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground));
					}

					#container .nb-symbolHighlight .output_container .output {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .markup > div.nb-multiCellHighlight {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .nb-multiCellHighlight .output_container .output {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .nb-chatGenerationHighlight .output_container .output {
						background-color: var(--vscode-notebook-selectedCellBackground);
					}

					#container > div.nb-cellDeleted .output_container {
						background-color: var(--theme-notebook-diff-removed-background);
					}

					#container > div.nb-cellAdded .output_container {
						background-color: var(--theme-notebook-diff-inserted-background);
					}

					#container > div > div:not(.preview) > div {
						overflow-x: auto;
					}

					#container .no-renderer-error {
						color: var(--vscode-editorError-foreground);
					}

					body {
						padding: 0px;
						height: 100%;
						width: 100%;
					}

					table, thead, tr, th, td, tbody {
						border: none;
						border-color: transparent;
						border-spacing: 0;
						border-collapse: collapse;
					}

					table, th, tr {
						vertical-align: middle;
						text-align: right;
					}

					thead {
						font-weight: bold;
						background-color: rgba(130, 130, 130, 0.16);
					}

					th, td {
						padding: 4px 8px;
					}

					tr:nth-child(even) {
						background-color: rgba(130, 130, 130, 0.08);
					}

					tbody th {
						font-weight: normal;
					}

					.find-match {
						background-color: var(--vscode-editor-findMatchHighlightBackground);
					}

					.current-find-match {
						background-color: var(--vscode-editor-findMatchBackground);
					}

					#_defaultColorPalatte {
						color: var(--vscode-editor-findMatchHighlightBackground);
						background-color: var(--vscode-editor-findMatchBackground);
					}
				</style>
			</head>
			<body style="overflow: hidden;">
				<div id='findStart' tabIndex=-1></div>
				<div id='container' class="widgetarea" style="position: absolute;width:100%;top: 0px"></div>
				<div id="_defaultColorPalatte"></div>
				<script type="module">${preloadScript}<\/script>
			</body>
		</html>`
    );
  }
  getRendererData() {
    return this.notebookService.getRenderers().map((renderer) => {
      const entrypoint = {
        extends: renderer.entrypoint.extends,
        path: this.asWebviewUri(renderer.entrypoint.path, renderer.extensionLocation).toString()
      };
      return {
        id: renderer.id,
        entrypoint,
        mimeTypes: renderer.mimeTypes,
        messaging: renderer.messaging !== RendererMessagingSpec.Never && !!this.rendererMessaging,
        isBuiltin: renderer.isBuiltin
      };
    });
  }
  getStaticPreloadsData() {
    return Array.from(this.notebookService.getStaticPreloads(this.notebookViewType), (preload) => {
      return { entrypoint: this.asWebviewUri(preload.entrypoint, preload.extensionLocation).toString().toString() };
    });
  }
  asWebviewUri(uri, fromExtension) {
    return asWebviewUri(uri, fromExtension?.scheme === Schemas.vscodeRemote ? { isRemote: true, authority: fromExtension.authority } : void 0);
  }
  postKernelMessage(message) {
    this._sendMessageToWebview({
      __vscode_notebook_message: true,
      type: "customKernelMessage",
      message
    });
  }
  resolveOutputId(id) {
    const output = this.reversedInsetMapping.get(id);
    if (!output) {
      return;
    }
    const cellInfo = this.insetMapping.get(output).cellInfo;
    return { cellInfo, output };
  }
  isResolved() {
    return !!this.webview;
  }
  createWebview(targetWindow) {
    const baseUrl = this.asWebviewUri(this.getNotebookBaseUri(), void 0);
    const htmlContent = this.generateContent(baseUrl.toString());
    return this._initialize(htmlContent, targetWindow);
  }
  getNotebookBaseUri() {
    if (this.documentUri.scheme === Schemas.untitled) {
      const folder = this.workspaceContextService.getWorkspaceFolder(this.documentUri);
      if (folder) {
        return folder.uri;
      }
      const folders = this.workspaceContextService.getWorkspace().folders;
      if (folders.length) {
        return folders[0].uri;
      }
    }
    return dirname(this.documentUri);
  }
  getBuiltinLocalResourceRoots() {
    if (!this.documentUri.path.toLowerCase().endsWith(".ipynb")) {
      return [];
    }
    if (isWeb) {
      return [];
    }
    return [
      dirname(FileAccess.asFileUri("vs/nls.js"))
    ];
  }
  _initialize(content, targetWindow) {
    if (!getWindow(this.element).document.body.contains(this.element)) {
      throw new Error("Element is already detached from the DOM tree");
    }
    this.webview = this._createInset(this.webviewService, content);
    this.webview.mountTo(this.element, targetWindow);
    this._register(this.webview);
    this._register(new WebviewWindowDragMonitor(targetWindow, () => this.webview));
    const initializePromise = new DeferredPromise();
    this._register(this.webview.onFatalError((e) => {
      initializePromise.error(new Error(`Could not initialize webview: ${e.message}}`));
    }));
    this._register(this.webview.onMessage(async (message) => {
      const data = message.message;
      if (this._disposed) {
        return;
      }
      if (!data.__vscode_notebook_message) {
        return;
      }
      switch (data.type) {
        case "initialized": {
          initializePromise.complete();
          this.initializeWebViewState();
          break;
        }
        case "initializedMarkup": {
          if (this.initializeMarkupPromise?.requestId === data.requestId) {
            this.initializeMarkupPromise?.p.complete();
            this.initializeMarkupPromise = void 0;
          }
          break;
        }
        case "dimension": {
          for (const update of data.updates) {
            const height = update.height;
            if (update.isOutput) {
              const resolvedResult = this.resolveOutputId(update.id);
              if (resolvedResult) {
                const { cellInfo, output } = resolvedResult;
                this.notebookEditor.updateOutputHeight(cellInfo, output, height, !!update.init, "webview#dimension");
                this.notebookEditor.scheduleOutputHeightAck(cellInfo, update.id, height);
              } else if (update.init) {
                const outputRequest = this.reversedPendingWebviewIdleInsetMapping.get(update.id);
                if (outputRequest) {
                  const inset = this.pendingWebviewIdleInsetMapping.get(outputRequest);
                  this.pendingWebviewIdleCreationRequest.delete(outputRequest);
                  this.pendingWebviewIdleCreationRequest.delete(outputRequest);
                  const cellInfo = inset.cellInfo;
                  this.reversedInsetMapping.set(update.id, outputRequest);
                  this.insetMapping.set(outputRequest, inset);
                  this.notebookEditor.updateOutputHeight(cellInfo, outputRequest, height, !!update.init, "webview#dimension");
                  this.notebookEditor.scheduleOutputHeightAck(cellInfo, update.id, height);
                }
                this.reversedPendingWebviewIdleInsetMapping.delete(update.id);
              }
              {
                if (!update.init) {
                  continue;
                }
                const output = this.reversedInsetMapping.get(update.id);
                if (!output) {
                  continue;
                }
                const inset = this.insetMapping.get(output);
                inset.initialized = true;
              }
            } else {
              this.notebookEditor.updateMarkupCellHeight(update.id, height, !!update.init);
            }
          }
          break;
        }
        case "mouseenter": {
          const resolvedResult = this.resolveOutputId(data.id);
          if (resolvedResult) {
            const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
            if (latestCell) {
              latestCell.outputIsHovered = true;
            }
          }
          break;
        }
        case "mouseleave": {
          const resolvedResult = this.resolveOutputId(data.id);
          if (resolvedResult) {
            const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
            if (latestCell) {
              latestCell.outputIsHovered = false;
            }
          }
          break;
        }
        case "outputFocus": {
          const resolvedResult = this.resolveOutputId(data.id);
          if (resolvedResult) {
            const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
            if (latestCell) {
              latestCell.outputIsFocused = true;
              this.notebookEditor.focusNotebookCell(latestCell, "output", { outputId: resolvedResult.output.model.outputId, skipReveal: true, outputWebviewFocused: true });
            }
          }
          break;
        }
        case "outputBlur": {
          const resolvedResult = this.resolveOutputId(data.id);
          if (resolvedResult) {
            const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
            if (latestCell) {
              latestCell.outputIsFocused = false;
              latestCell.inputInOutputIsFocused = false;
            }
          }
          break;
        }
        case "scroll-ack": {
          break;
        }
        case "scroll-to-reveal": {
          this.notebookEditor.setScrollTop(data.scrollTop - NOTEBOOK_WEBVIEW_BOUNDARY);
          break;
        }
        case "did-scroll-wheel": {
          this.notebookEditor.triggerScroll({
            ...data.payload,
            preventDefault: () => {
            },
            stopPropagation: () => {
            }
          });
          break;
        }
        case "focus-editor": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell) {
            if (data.focusNext) {
              this.notebookEditor.focusNextNotebookCell(cell, "editor");
            } else {
              await this.notebookEditor.focusNotebookCell(cell, "editor");
            }
          }
          break;
        }
        case "clicked-data-url": {
          this._onDidClickDataLink(data);
          break;
        }
        case "clicked-link": {
          if (matchesScheme(data.href, Schemas.command)) {
            const uri = URI.parse(data.href);
            if (uri.path === "workbench.action.openLargeOutput") {
              const outputId = uri.query;
              const group = this.editorGroupService.activeGroup;
              if (group) {
                if (group.activeEditor) {
                  group.pinEditor(group.activeEditor);
                }
              }
              this.openerService.open(CellUri.generateCellOutputUriWithId(this.documentUri, outputId));
              return;
            }
            if (uri.path === "cellOutput.enableScrolling") {
              const outputId = uri.query;
              const cell = this.reversedInsetMapping.get(outputId);
              if (cell) {
                this.telemetryService.publicLog2("workbenchActionExecuted", { id: "notebook.cell.toggleOutputScrolling", from: "inlineLink" });
                cell.cellViewModel.outputsViewModels.forEach((vm) => {
                  if (vm.model.metadata) {
                    vm.model.metadata["scrollable"] = true;
                    vm.resetRenderer();
                  }
                });
              }
              return;
            }
            this.openerService.open(data.href, {
              fromUserGesture: true,
              fromWorkspace: true,
              allowCommands: [
                "github-issues.authNow",
                "workbench.extensions.search",
                "workbench.action.openSettings",
                "_notebook.selectKernel",
                // TODO@rebornix explore open output channel with name command
                "jupyter.viewOutput",
                "jupyter.createPythonEnvAndSelectController"
              ]
            });
            return;
          }
          if (matchesSomeScheme(data.href, Schemas.http, Schemas.https, Schemas.mailto)) {
            this.openerService.open(data.href, { fromUserGesture: true, fromWorkspace: true });
          } else if (matchesScheme(data.href, Schemas.vscodeNotebookCell)) {
            const uri = URI.parse(data.href);
            await this._handleNotebookCellResource(uri);
          } else if (!/^[\w\-]+:/.test(data.href)) {
            await this._handleResourceOpening(tryDecodeURIComponent(data.href));
          } else {
            if (osPath.isAbsolute(data.href)) {
              await this._openUri(URI.file(data.href));
            } else {
              await this._openUri(URI.parse(data.href));
            }
          }
          break;
        }
        case "customKernelMessage": {
          this._onMessage.fire({ message: data.message });
          break;
        }
        case "customRendererMessage": {
          this.rendererMessaging?.postMessage(data.rendererId, data.message);
          break;
        }
        case "clickMarkupCell": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell) {
            if (data.shiftKey || (isMacintosh ? data.metaKey : data.ctrlKey)) {
              this.notebookEditor.toggleNotebookCellSelection(
                cell,
                /* fromPrevious */
                data.shiftKey
              );
            } else {
              await this.notebookEditor.focusNotebookCell(cell, "container", { skipReveal: true });
            }
          }
          break;
        }
        case "contextMenuMarkupCell": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell) {
            await this.notebookEditor.focusNotebookCell(cell, "container", { skipReveal: true });
            const webviewRect = this.element.getBoundingClientRect();
            this.contextMenuService.showContextMenu({
              menuId: MenuId.NotebookCellTitle,
              contextKeyService: this.contextKeyService,
              getAnchor: () => ({
                x: webviewRect.x + data.clientX,
                y: webviewRect.y + data.clientY
              })
            });
          }
          break;
        }
        case "toggleMarkupPreview": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell && !this.notebookEditor.creationOptions.isReadOnly) {
            this.notebookEditor.setMarkupCellEditState(data.cellId, CellEditState.Editing);
            await this.notebookEditor.focusNotebookCell(cell, "editor", { skipReveal: true });
          }
          break;
        }
        case "mouseEnterMarkupCell": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell instanceof MarkupCellViewModel) {
            cell.cellIsHovered = true;
          }
          break;
        }
        case "mouseLeaveMarkupCell": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell instanceof MarkupCellViewModel) {
            cell.cellIsHovered = false;
          }
          break;
        }
        case "cell-drag-start": {
          this.notebookEditor.didStartDragMarkupCell(data.cellId, data);
          break;
        }
        case "cell-drag": {
          this.notebookEditor.didDragMarkupCell(data.cellId, data);
          break;
        }
        case "cell-drop": {
          this.notebookEditor.didDropMarkupCell(data.cellId, {
            dragOffsetY: data.dragOffsetY,
            ctrlKey: data.ctrlKey,
            altKey: data.altKey
          });
          break;
        }
        case "cell-drag-end": {
          this.notebookEditor.didEndDragMarkupCell(data.cellId);
          break;
        }
        case "renderedMarkup": {
          const cell = this.notebookEditor.getCellById(data.cellId);
          if (cell instanceof MarkupCellViewModel) {
            cell.renderedHtml = data.html;
          }
          this._handleHighlightCodeBlock(data.codeBlocks);
          break;
        }
        case "renderedCellOutput": {
          this._handleHighlightCodeBlock(data.codeBlocks);
          break;
        }
        case "outputResized": {
          this.notebookEditor.didResizeOutput(data.cellId);
          break;
        }
        case "getOutputItem": {
          const resolvedResult = this.resolveOutputId(data.outputId);
          const output = resolvedResult?.output.model.outputs.find((output2) => output2.mime === data.mime);
          this._sendMessageToWebview({
            type: "returnOutputItem",
            requestId: data.requestId,
            output: output ? { mime: output.mime, valueBytes: output.data.buffer } : void 0
          });
          break;
        }
        case "logRendererDebugMessage": {
          this._logRendererDebugMessage(`${data.message}${data.data ? " " + JSON.stringify(data.data, null, 4) : ""}`);
          break;
        }
        case "notebookPerformanceMessage": {
          this.notebookEditor.updatePerformanceMetadata(data.cellId, data.executionId, data.duration, data.rendererId);
          if (data.outputSize && data.rendererId === "vscode.builtin-renderer") {
            this._sendPerformanceData(data.outputSize, data.duration);
          }
          break;
        }
        case "outputInputFocus": {
          const resolvedResult = this.resolveOutputId(data.id);
          if (resolvedResult) {
            const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
            if (latestCell) {
              latestCell.inputInOutputIsFocused = data.inputFocused;
            }
          }
          this.notebookEditor.didFocusOutputInputChange(data.inputFocused);
        }
      }
    }));
    return initializePromise.p;
  }
  _sendPerformanceData(outputSize, renderTime) {
    const telemetryData = {
      outputSize,
      renderTime
    };
    this.telemetryService.publicLog2("NotebookCellOutputRender", telemetryData);
  }
  _handleNotebookCellResource(uri) {
    const notebookResource = uri.path.length > 0 ? uri : this.documentUri;
    const lineMatch = /(?:^|&)line=([^&]+)/.exec(uri.query);
    let editorOptions = void 0;
    if (lineMatch) {
      const parsedLineNumber = parseInt(lineMatch[1], 10);
      if (!isNaN(parsedLineNumber)) {
        const lineNumber = parsedLineNumber;
        editorOptions = {
          selection: { startLineNumber: lineNumber, startColumn: 1 }
        };
      }
    }
    const executionMatch = /(?:^|&)execution_count=([^&]+)/.exec(uri.query);
    if (executionMatch) {
      const executionCount = parseInt(executionMatch[1], 10);
      if (!isNaN(executionCount)) {
        const notebookModel = this.notebookService.getNotebookTextModel(notebookResource);
        const cell = notebookModel?.cells.slice().reverse().find((cell2) => {
          return cell2.internalMetadata.executionOrder === executionCount;
        });
        if (cell?.uri) {
          return this.openerService.open(cell.uri, {
            fromUserGesture: true,
            fromWorkspace: true,
            editorOptions
          });
        }
      }
    }
    const fragmentLineMatch = /\?line=(\d+)$/.exec(uri.fragment);
    if (fragmentLineMatch) {
      const parsedLineNumber = parseInt(fragmentLineMatch[1], 10);
      if (!isNaN(parsedLineNumber)) {
        const lineNumber = parsedLineNumber + 1;
        const fragment = uri.fragment.substring(0, fragmentLineMatch.index);
        const editorOptions2 = {
          selection: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 }
        };
        return this.openerService.open(notebookResource.with({ fragment }), {
          fromUserGesture: true,
          fromWorkspace: true,
          editorOptions: editorOptions2
        });
      }
    }
    return this.openerService.open(notebookResource, { fromUserGesture: true, fromWorkspace: true });
  }
  async _handleResourceOpening(href) {
    let linkToOpen = void 0;
    let fragment = void 0;
    const hrefWithFragment = FRAGMENT_REGEX.exec(href);
    if (hrefWithFragment) {
      href = hrefWithFragment[1];
      fragment = hrefWithFragment[2];
    }
    if (href.startsWith("/")) {
      linkToOpen = await this.pathService.fileURI(href);
      const folders = this.workspaceContextService.getWorkspace().folders;
      if (folders.length) {
        linkToOpen = linkToOpen.with({
          scheme: folders[0].uri.scheme,
          authority: folders[0].uri.authority
        });
      }
    } else if (href.startsWith("~")) {
      const userHome = await this.pathService.userHome();
      if (userHome) {
        linkToOpen = URI.joinPath(userHome, href.substring(2));
      }
    } else {
      if (this.documentUri.scheme === Schemas.untitled) {
        const folders = this.workspaceContextService.getWorkspace().folders;
        if (!folders.length) {
          return;
        }
        linkToOpen = URI.joinPath(folders[0].uri, href);
      } else {
        linkToOpen = URI.joinPath(dirname(this.documentUri), href);
      }
    }
    if (linkToOpen) {
      if (fragment) {
        linkToOpen = linkToOpen.with({ fragment });
      }
      await this._openUri(linkToOpen);
    }
  }
  async _openUri(uri) {
    let lineNumber = void 0;
    let column = void 0;
    const lineCol = LINE_COLUMN_REGEX.exec(uri.path);
    if (lineCol) {
      uri = uri.with({
        path: uri.path.slice(0, lineCol.index),
        fragment: `L${lineCol[0].slice(1)}`
      });
      lineNumber = parseInt(lineCol[1], 10);
      column = lineCol[2] ? parseInt(lineCol[2], 10) : 1;
    }
    const lineMatch = LineQueryRegex.exec(uri.query);
    if (lineMatch) {
      const parsedLineNumber = parseInt(lineMatch[1], 10);
      if (!isNaN(parsedLineNumber)) {
        lineNumber = parsedLineNumber + 1;
        column = 1;
        uri = uri.with({ fragment: `L${lineNumber}` });
      }
    }
    uri = uri.with({
      query: null
    });
    const extractedSelection = extractSelection(uri);
    const selection = lineNumber !== void 0 && column !== void 0 ? { startLineNumber: lineNumber, startColumn: column } : extractedSelection.selection;
    const resource = extractedSelection.uri;
    if (!this.fileService.hasProvider(resource) || this.workspaceContextService.isInsideWorkspace(resource)) {
      await this.openerService.open(uri, { fromUserGesture: true, fromWorkspace: true });
      return;
    }
    let match = void 0;
    for (const group of this.editorGroupService.groups) {
      const editorInput = group.editors.find((editor) => editor.resource && isEqual(editor.resource, resource, true));
      if (editorInput) {
        match = { group, editor: editorInput };
        break;
      }
    }
    const options = {
      selection,
      source: EditorOpenSource.USER
    };
    if (match) {
      await this.editorService.openEditors([{
        editor: match.editor,
        options
      }], match.group, { validateTrust: true });
    } else {
      await this.editorService.openEditors([{
        resource,
        options
      }], void 0, { validateTrust: true });
    }
  }
  _handleHighlightCodeBlock(codeBlocks) {
    for (const { id, value, lang } of codeBlocks) {
      const languageId = this.languageService.getLanguageIdByLanguageName(lang);
      if (!languageId) {
        continue;
      }
      tokenizeToString(this.languageService, value, languageId).then((html) => {
        if (this._disposed) {
          return;
        }
        this._sendMessageToWebview({
          type: "tokenizedCodeBlock",
          html,
          codeBlockId: id
        });
      });
    }
  }
  async _onDidClickDataLink(event) {
    if (typeof event.data !== "string") {
      return;
    }
    const [splitStart, splitData] = event.data.split(";base64,");
    if (!splitData || !splitStart) {
      return;
    }
    const defaultDir = extname(this.documentUri) === ".interactive" ? this.workspaceContextService.getWorkspace().folders[0]?.uri ?? await this.fileDialogService.defaultFilePath() : dirname(this.documentUri);
    let defaultName;
    if (event.downloadName) {
      defaultName = event.downloadName;
    } else {
      const mimeType = splitStart.replace(/^data:/, "");
      const candidateExtension = mimeType && getExtensionForMimeType(mimeType);
      defaultName = candidateExtension ? `download${candidateExtension}` : "download";
    }
    const defaultUri = joinPath(defaultDir, defaultName);
    const newFileUri = await this.fileDialogService.showSaveDialog({
      defaultUri
    });
    if (!newFileUri) {
      return;
    }
    const buff = decodeBase64(splitData);
    await this.fileService.writeFile(newFileUri, buff);
    await this.openerService.open(newFileUri);
  }
  _createInset(webviewService, content) {
    this.localResourceRootsCache = this._getResourceRootsCache();
    const webview = webviewService.createWebviewElement({
      origin: BackLayerWebView.getOriginStore(this.storageService).getOrigin(this.notebookViewType, void 0),
      title: nls.localize("webview title", "Notebook webview content"),
      options: {
        purpose: WebviewContentPurpose.NotebookRenderer,
        enableFindWidget: false,
        transformCssVariables: transformWebviewThemeVars
      },
      contentOptions: {
        allowMultipleAPIAcquire: true,
        allowScripts: true,
        forwardUntrustedKeypressEvents: false,
        localResourceRoots: this.localResourceRootsCache
      },
      extension: void 0,
      providedViewType: "notebook.output"
    });
    webview.setHtml(content);
    webview.setContextKeyService(this.contextKeyService);
    return webview;
  }
  _getResourceRootsCache() {
    const workspaceFolders = this.contextService.getWorkspace().folders.map((x) => x.uri);
    const notebookDir = this.getNotebookBaseUri();
    return [
      this.notebookService.getNotebookProviderResourceRoots(),
      this.notebookService.getRenderers().map((x) => dirname(x.entrypoint.path)),
      ...Array.from(this.notebookService.getStaticPreloads(this.notebookViewType), (x) => [
        dirname(x.entrypoint),
        ...x.localResourceRoots
      ]),
      workspaceFolders,
      notebookDir,
      this.getBuiltinLocalResourceRoots()
    ].flat();
  }
  initializeWebViewState() {
    this._preloadsCache.clear();
    if (this._currentKernel) {
      this._updatePreloadsFromKernel(this._currentKernel);
    }
    for (const [output, inset] of this.insetMapping.entries()) {
      this._sendMessageToWebview({ ...inset.cachedCreation, initiallyHidden: this.hiddenInsetMapping.has(output) });
    }
    if (this.initializeMarkupPromise?.isFirstInit) {
    } else {
      const mdCells = [...this.markupPreviewMapping.values()];
      this.markupPreviewMapping.clear();
      this.initializeMarkup(mdCells);
    }
    this._updateStyles();
    this._updateOptions();
  }
  shouldUpdateInset(cell, output, cellTop, outputOffset) {
    if (this._disposed) {
      return false;
    }
    if ("isOutputCollapsed" in cell && cell.isOutputCollapsed) {
      return false;
    }
    if (this.hiddenInsetMapping.has(output)) {
      return true;
    }
    const outputCache = this.insetMapping.get(output);
    if (!outputCache) {
      return false;
    }
    if (outputOffset === outputCache.cachedCreation.outputOffset && cellTop === outputCache.cachedCreation.cellTop) {
      return false;
    }
    return true;
  }
  ackHeight(updates) {
    this._sendMessageToWebview({
      type: "ack-dimension",
      updates
    });
  }
  updateScrollTops(outputRequests, markupPreviews) {
    if (this._disposed) {
      return;
    }
    const widgets = coalesce(outputRequests.map((request) => {
      const outputCache = this.insetMapping.get(request.output);
      if (!outputCache) {
        return;
      }
      if (!request.forceDisplay && !this.shouldUpdateInset(request.cell, request.output, request.cellTop, request.outputOffset)) {
        return;
      }
      const id = outputCache.outputId;
      outputCache.cachedCreation.cellTop = request.cellTop;
      outputCache.cachedCreation.outputOffset = request.outputOffset;
      this.hiddenInsetMapping.delete(request.output);
      return {
        cellId: request.cell.id,
        outputId: id,
        cellTop: request.cellTop,
        outputOffset: request.outputOffset,
        forceDisplay: request.forceDisplay
      };
    }));
    if (!widgets.length && !markupPreviews.length) {
      return;
    }
    this._sendMessageToWebview({
      type: "view-scroll",
      widgets,
      markupCells: markupPreviews
    });
  }
  async createMarkupPreview(initialization) {
    if (this._disposed) {
      return;
    }
    if (this.markupPreviewMapping.has(initialization.cellId)) {
      console.error("Trying to create markup preview that already exists");
      return;
    }
    this.markupPreviewMapping.set(initialization.cellId, initialization);
    this._sendMessageToWebview({
      type: "createMarkupCell",
      cell: initialization
    });
  }
  async showMarkupPreview(newContent) {
    if (this._disposed) {
      return;
    }
    const entry = this.markupPreviewMapping.get(newContent.cellId);
    if (!entry) {
      return this.createMarkupPreview(newContent);
    }
    const sameContent = newContent.content === entry.content;
    const sameMetadata = equals(newContent.metadata, entry.metadata);
    if (!sameContent || !sameMetadata || !entry.visible) {
      this._sendMessageToWebview({
        type: "showMarkupCell",
        id: newContent.cellId,
        handle: newContent.cellHandle,
        // If the content has not changed, we still want to make sure the
        // preview is visible but don't need to send anything over
        content: sameContent ? void 0 : newContent.content,
        top: newContent.offset,
        metadata: sameMetadata ? void 0 : newContent.metadata
      });
    }
    entry.metadata = newContent.metadata;
    entry.content = newContent.content;
    entry.offset = newContent.offset;
    entry.visible = true;
  }
  async hideMarkupPreviews(cellIds) {
    if (this._disposed) {
      return;
    }
    const cellsToHide = [];
    for (const cellId of cellIds) {
      const entry = this.markupPreviewMapping.get(cellId);
      if (entry) {
        if (entry.visible) {
          cellsToHide.push(cellId);
          entry.visible = false;
        }
      }
    }
    if (cellsToHide.length) {
      this._sendMessageToWebview({
        type: "hideMarkupCells",
        ids: cellsToHide
      });
    }
  }
  async unhideMarkupPreviews(cellIds) {
    if (this._disposed) {
      return;
    }
    const toUnhide = [];
    for (const cellId of cellIds) {
      const entry = this.markupPreviewMapping.get(cellId);
      if (entry) {
        if (!entry.visible) {
          entry.visible = true;
          toUnhide.push(cellId);
        }
      } else {
        console.error(`Trying to unhide a preview that does not exist: ${cellId}`);
      }
    }
    this._sendMessageToWebview({
      type: "unhideMarkupCells",
      ids: toUnhide
    });
  }
  async deleteMarkupPreviews(cellIds) {
    if (this._disposed) {
      return;
    }
    for (const id of cellIds) {
      if (!this.markupPreviewMapping.has(id)) {
        console.error(`Trying to delete a preview that does not exist: ${id}`);
      }
      this.markupPreviewMapping.delete(id);
    }
    if (cellIds.length) {
      this._sendMessageToWebview({
        type: "deleteMarkupCell",
        ids: cellIds
      });
    }
  }
  async updateMarkupPreviewSelections(selectedCellsIds) {
    if (this._disposed) {
      return;
    }
    this._sendMessageToWebview({
      type: "updateSelectedMarkupCells",
      selectedCellIds: selectedCellsIds.filter((id) => this.markupPreviewMapping.has(id))
    });
  }
  async initializeMarkup(cells) {
    if (this._disposed) {
      return;
    }
    this.initializeMarkupPromise?.p.complete();
    const requestId = UUID.generateUuid();
    this.initializeMarkupPromise = { p: new DeferredPromise(), requestId, isFirstInit: this.firstInit };
    this.firstInit = false;
    for (const cell of cells) {
      this.markupPreviewMapping.set(cell.cellId, cell);
    }
    this._sendMessageToWebview({
      type: "initializeMarkup",
      cells,
      requestId
    });
    return this.initializeMarkupPromise.p.p;
  }
  /**
   * Validate if cached inset is out of date and require a rerender
   * Note that it doesn't account for output content change.
   */
  _cachedInsetEqual(cachedInset, content) {
    if (content.type === RenderOutputType.Extension) {
      return cachedInset.renderer?.id === content.renderer.id;
    } else {
      return cachedInset.cachedCreation.type === "html";
    }
  }
  requestCreateOutputWhenWebviewIdle(cellInfo, content, cellTop, offset) {
    if (this._disposed) {
      return;
    }
    if (this.insetMapping.has(content.source)) {
      return;
    }
    if (this.pendingWebviewIdleCreationRequest.has(content.source)) {
      return;
    }
    if (this.pendingWebviewIdleInsetMapping.has(content.source)) {
      return;
    }
    this.pendingWebviewIdleCreationRequest.set(content.source, runWhenGlobalIdle(() => {
      const { message, renderer, transfer: transferable } = this._createOutputCreationMessage(cellInfo, content, cellTop, offset, true, true);
      this._sendMessageToWebview(message, transferable);
      this.pendingWebviewIdleInsetMapping.set(content.source, { outputId: message.outputId, versionId: content.source.model.versionId, cellInfo, renderer, cachedCreation: message });
      this.reversedPendingWebviewIdleInsetMapping.set(message.outputId, content.source);
      this.pendingWebviewIdleCreationRequest.delete(content.source);
    }));
  }
  createOutput(cellInfo, content, cellTop, offset) {
    if (this._disposed) {
      return;
    }
    const cachedInset = this.insetMapping.get(content.source);
    this.pendingWebviewIdleCreationRequest.get(content.source)?.dispose();
    this.pendingWebviewIdleCreationRequest.delete(content.source);
    this.pendingWebviewIdleInsetMapping.delete(content.source);
    if (cachedInset) {
      this.reversedPendingWebviewIdleInsetMapping.delete(cachedInset.outputId);
    }
    if (cachedInset && this._cachedInsetEqual(cachedInset, content)) {
      this.hiddenInsetMapping.delete(content.source);
      this._sendMessageToWebview({
        type: "showOutput",
        cellId: cachedInset.cellInfo.cellId,
        outputId: cachedInset.outputId,
        cellTop,
        outputOffset: offset
      });
      return;
    }
    const { message, renderer, transfer: transferable } = this._createOutputCreationMessage(cellInfo, content, cellTop, offset, false, false);
    this._sendMessageToWebview(message, transferable);
    this.insetMapping.set(content.source, { outputId: message.outputId, versionId: content.source.model.versionId, cellInfo, renderer, cachedCreation: message });
    this.hiddenInsetMapping.delete(content.source);
    this.reversedInsetMapping.set(message.outputId, content.source);
  }
  createMetadata(output, mimeType) {
    if (mimeType.startsWith("image")) {
      const buffer = output.outputs.find((out) => out.mime === "text/plain")?.data.buffer;
      if (buffer?.length && buffer?.length > 0) {
        const altText = new TextDecoder().decode(buffer);
        return { ...output.metadata, vscode_altText: altText };
      }
    }
    return output.metadata;
  }
  _createOutputCreationMessage(cellInfo, content, cellTop, offset, createOnIdle, initiallyHidden) {
    const messageBase = {
      type: "html",
      executionId: cellInfo.executionId,
      cellId: cellInfo.cellId,
      cellTop,
      outputOffset: offset,
      left: 0,
      requiredPreloads: [],
      createOnIdle
    };
    const transfer = [];
    let message;
    let renderer;
    if (content.type === RenderOutputType.Extension) {
      const output = content.source.model;
      renderer = content.renderer;
      const first = output.outputs.find((op) => op.mime === content.mimeType);
      const metadata = this.createMetadata(output, content.mimeType);
      const valueBytes = copyBufferIfNeeded(first.data.buffer, transfer);
      message = {
        ...messageBase,
        outputId: output.outputId,
        rendererId: content.renderer.id,
        content: {
          type: RenderOutputType.Extension,
          outputId: output.outputId,
          metadata,
          output: {
            mime: first.mime,
            valueBytes
          },
          allOutputs: output.outputs.map((output2) => ({ mime: output2.mime }))
        },
        initiallyHidden
      };
    } else {
      message = {
        ...messageBase,
        outputId: UUID.generateUuid(),
        content: {
          type: content.type,
          htmlContent: content.htmlContent
        },
        initiallyHidden
      };
    }
    return {
      message,
      renderer,
      transfer
    };
  }
  updateOutput(cellInfo, content, cellTop, offset) {
    if (this._disposed) {
      return;
    }
    if (!this.insetMapping.has(content.source)) {
      this.createOutput(cellInfo, content, cellTop, offset);
      return;
    }
    const outputCache = this.insetMapping.get(content.source);
    if (outputCache.versionId === content.source.model.versionId) {
      return;
    }
    this.hiddenInsetMapping.delete(content.source);
    let updatedContent = void 0;
    const transfer = [];
    if (content.type === RenderOutputType.Extension) {
      const output = content.source.model;
      const firstBuffer = output.outputs.find((op) => op.mime === content.mimeType);
      const appenededData = output.appendedSinceVersion(outputCache.versionId, content.mimeType);
      const appended = appenededData ? { valueBytes: appenededData.buffer, previousVersion: outputCache.versionId } : void 0;
      const valueBytes = copyBufferIfNeeded(firstBuffer.data.buffer, transfer);
      updatedContent = {
        type: RenderOutputType.Extension,
        outputId: outputCache.outputId,
        metadata: output.metadata,
        output: {
          mime: content.mimeType,
          valueBytes,
          appended
        },
        allOutputs: output.outputs.map((output2) => ({ mime: output2.mime }))
      };
    }
    this._sendMessageToWebview({
      type: "showOutput",
      cellId: outputCache.cellInfo.cellId,
      outputId: outputCache.outputId,
      cellTop,
      outputOffset: offset,
      content: updatedContent
    }, transfer);
    outputCache.versionId = content.source.model.versionId;
    return;
  }
  async copyImage(output) {
    const textAlternates = [];
    const cellOutput = output.model;
    for (const outputItem of cellOutput.outputs) {
      if (TEXT_BASED_MIMETYPES.includes(outputItem.mime)) {
        const text = isTextStreamMime(outputItem.mime) ? getOutputStreamText(output).text : getOutputText(outputItem.mime, outputItem);
        textAlternates.push({
          mimeType: outputItem.mime,
          content: text
        });
      }
    }
    this._sendMessageToWebview({
      type: "copyImage",
      outputId: output.model.outputId,
      altOutputId: output.model.alternativeOutputId,
      textAlternates: textAlternates.length > 0 ? textAlternates : void 0
    });
  }
  removeInsets(outputs) {
    if (this._disposed) {
      return;
    }
    for (const output of outputs) {
      const outputCache = this.insetMapping.get(output);
      if (!outputCache) {
        continue;
      }
      const id = outputCache.outputId;
      this._sendMessageToWebview({
        type: "clearOutput",
        rendererId: outputCache.cachedCreation.rendererId,
        cellUri: outputCache.cellInfo.cellUri.toString(),
        outputId: id,
        cellId: outputCache.cellInfo.cellId
      });
      this.insetMapping.delete(output);
      this.pendingWebviewIdleCreationRequest.get(output)?.dispose();
      this.pendingWebviewIdleCreationRequest.delete(output);
      this.pendingWebviewIdleInsetMapping.delete(output);
      this.reversedPendingWebviewIdleInsetMapping.delete(id);
      this.reversedInsetMapping.delete(id);
    }
  }
  hideInset(output) {
    if (this._disposed) {
      return;
    }
    const outputCache = this.insetMapping.get(output);
    if (!outputCache) {
      return;
    }
    this.hiddenInsetMapping.add(output);
    this._sendMessageToWebview({
      type: "hideOutput",
      outputId: outputCache.outputId,
      cellId: outputCache.cellInfo.cellId
    });
  }
  focusWebview() {
    if (this._disposed) {
      return;
    }
    this.webview?.focus();
  }
  selectOutputContents(cell) {
    if (this._disposed) {
      return;
    }
    const output = cell.outputsViewModels.find((o) => o.model.outputId === cell.focusedOutputId);
    const outputId = output ? this.insetMapping.get(output)?.outputId : void 0;
    this._sendMessageToWebview({
      type: "select-output-contents",
      cellOrOutputId: outputId || cell.id
    });
  }
  selectInputContents(cell) {
    if (this._disposed) {
      return;
    }
    const output = cell.outputsViewModels.find((o) => o.model.outputId === cell.focusedOutputId);
    const outputId = output ? this.insetMapping.get(output)?.outputId : void 0;
    this._sendMessageToWebview({
      type: "select-input-contents",
      cellOrOutputId: outputId || cell.id
    });
  }
  focusOutput(cellOrOutputId, alternateId, viewFocused) {
    if (this._disposed) {
      return;
    }
    if (!viewFocused) {
      this.webview?.focus();
    }
    this._sendMessageToWebview({
      type: "focus-output",
      cellOrOutputId,
      alternateId
    });
  }
  blurOutput() {
    if (this._disposed) {
      return;
    }
    this._sendMessageToWebview({
      type: "blur-output"
    });
  }
  async find(query, options) {
    if (query === "") {
      this._sendMessageToWebview({
        type: "findStop",
        ownerID: options.ownerID
      });
      return [];
    }
    const p = new Promise((resolve) => {
      const sub = this.webview?.onMessage((e) => {
        if (e.message.type === "didFind") {
          resolve(e.message.matches);
          sub?.dispose();
        }
      });
    });
    this._sendMessageToWebview({
      type: "find",
      query,
      options
    });
    const ret = await p;
    return ret;
  }
  findStop(ownerID) {
    this._sendMessageToWebview({
      type: "findStop",
      ownerID
    });
  }
  async findHighlightCurrent(index, ownerID) {
    const p = new Promise((resolve) => {
      const sub = this.webview?.onMessage((e) => {
        if (e.message.type === "didFindHighlightCurrent") {
          resolve(e.message.offset);
          sub?.dispose();
        }
      });
    });
    this._sendMessageToWebview({
      type: "findHighlightCurrent",
      index,
      ownerID
    });
    const ret = await p;
    return ret;
  }
  async findUnHighlightCurrent(index, ownerID) {
    this._sendMessageToWebview({
      type: "findUnHighlightCurrent",
      index,
      ownerID
    });
  }
  deltaCellOutputContainerClassNames(cellId, added, removed) {
    this._sendMessageToWebview({
      type: "decorations",
      cellId,
      addedClassNames: added,
      removedClassNames: removed
    });
  }
  deltaMarkupPreviewClassNames(cellId, added, removed) {
    if (this.markupPreviewMapping.get(cellId)) {
      this._sendMessageToWebview({
        type: "markupDecorations",
        cellId,
        addedClassNames: added,
        removedClassNames: removed
      });
    }
  }
  updateOutputRenderers() {
    if (!this.webview) {
      return;
    }
    const renderersData = this.getRendererData();
    this.localResourceRootsCache = this._getResourceRootsCache();
    const mixedResourceRoots = [
      ...this.localResourceRootsCache || [],
      ...this._currentKernel ? [this._currentKernel.localResourceRoot] : []
    ];
    this.webview.localResourcesRoot = mixedResourceRoots;
    this._sendMessageToWebview({
      type: "updateRenderers",
      rendererData: renderersData
    });
  }
  async updateKernelPreloads(kernel) {
    if (this._disposed || kernel === this._currentKernel) {
      return;
    }
    const previousKernel = this._currentKernel;
    this._currentKernel = kernel;
    if (previousKernel && previousKernel.preloadUris.length > 0) {
      this.webview?.reload();
    } else if (kernel) {
      this._updatePreloadsFromKernel(kernel);
    }
  }
  _updatePreloadsFromKernel(kernel) {
    const resources = [];
    for (const preload of kernel.preloadUris) {
      const uri = this.environmentService.isExtensionDevelopment && (preload.scheme === "http" || preload.scheme === "https") ? preload : this.asWebviewUri(preload, void 0);
      if (!this._preloadsCache.has(uri.toString())) {
        resources.push({ uri: uri.toString(), originalUri: preload.toString() });
        this._preloadsCache.add(uri.toString());
      }
    }
    if (!resources.length) {
      return;
    }
    this._updatePreloads(resources);
  }
  _updatePreloads(resources) {
    if (!this.webview) {
      return;
    }
    const mixedResourceRoots = [
      ...this.localResourceRootsCache || [],
      ...this._currentKernel ? [this._currentKernel.localResourceRoot] : []
    ];
    this.webview.localResourcesRoot = mixedResourceRoots;
    this._sendMessageToWebview({
      type: "preload",
      resources
    });
  }
  _sendMessageToWebview(message, transfer) {
    if (this._disposed) {
      return;
    }
    this.webview?.postMessage(message, transfer);
  }
  dispose() {
    this._disposed = true;
    this.webview?.dispose();
    this.webview = void 0;
    this.notebookEditor = null;
    this.insetMapping.clear();
    this.pendingWebviewIdleCreationRequest.clear();
    super.dispose();
  }
};
BackLayerWebView = __decorateClass([
  __decorateParam(6, IWebviewService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, INotebookService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IFileDialogService),
  __decorateParam(12, IFileService),
  __decorateParam(13, IContextMenuService),
  __decorateParam(14, IContextKeyService),
  __decorateParam(15, IWorkspaceTrustManagementService),
  __decorateParam(16, IConfigurationService),
  __decorateParam(17, ILanguageService),
  __decorateParam(18, IWorkspaceContextService),
  __decorateParam(19, IEditorGroupsService),
  __decorateParam(20, IEditorService),
  __decorateParam(21, IStorageService),
  __decorateParam(22, IPathService),
  __decorateParam(23, INotebookLoggingService),
  __decorateParam(24, IThemeService),
  __decorateParam(25, ITelemetryService)
], BackLayerWebView);
function copyBufferIfNeeded(buffer, transfer) {
  if (buffer.byteLength === buffer.buffer.byteLength) {
    return buffer;
  } else {
    const valueBytes = new Uint8Array(buffer);
    transfer.push(valueBytes.buffer);
    return valueBytes;
  }
}
function getTokenizationCss() {
  const colorMap = TokenizationRegistry.getColorMap();
  const tokenizationCss = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
  return tokenizationCss;
}
function tryDecodeURIComponent(uri) {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}
export {
  BackLayerWebView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxyZW5kZXJlcnNcXGJhY2tMYXllcldlYlZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElNb3VzZVdoZWVsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBDb2RlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHJ1bldoZW5HbG9iYWxJZGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZGVjb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZ2V0RXh0ZW5zaW9uRm9yTWltZVR5cGUsIGlzVGV4dFN0cmVhbU1pbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIFNjaGVtYXMsIG1hdGNoZXNTY2hlbWUsIG1hdGNoZXNTb21lU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIG9zUGF0aCBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGV4dG5hbWUsIGlzRXF1YWwsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBVVUlEIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3N1cHBvcnRzL3Rva2VuaXphdGlvbi5qcyc7XG5pbXBvcnQgeyB0b2tlbml6ZVRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvdGV4dFRvSHRtbFRva2VuaXplci5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3BlblNvdXJjZSwgSVRleHRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGV4dHJhY3RTZWxlY3Rpb24sIElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGVkaXRvckZpbmRNYXRjaCwgZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgVGhlbWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSwgSUNlbGxPdXRwdXRWaWV3TW9kZWwsIElDZWxsVmlld01vZGVsLCBJQ29tbW9uQ2VsbEluZm8sIElEaXNwbGF5T3V0cHV0TGF5b3V0VXBkYXRlUmVxdWVzdCwgSURpc3BsYXlPdXRwdXRWaWV3TW9kZWwsIElGb2N1c05vdGVib29rQ2VsbE9wdGlvbnMsIElHZW5lcmljQ2VsbFZpZXdNb2RlbCwgSUluc2V0UmVuZGVyT3V0cHV0LCBJTm90ZWJvb2tFZGl0b3JDcmVhdGlvbk9wdGlvbnMsIElOb3RlYm9va1dlYnZpZXdNZXNzYWdlLCBSZW5kZXJPdXRwdXRUeXBlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX1dFQlZJRVdfQk9VTkRBUlkgfSBmcm9tICcuLi9ub3RlYm9va0NlbGxMaXN0LmpzJztcbmltcG9ydCB7IHByZWxvYWRzU2NyaXB0U3RyIH0gZnJvbSAnLi93ZWJ2aWV3UHJlbG9hZHMuanMnO1xuaW1wb3J0IHsgdHJhbnNmb3JtV2Vidmlld1RoZW1lVmFycyB9IGZyb20gJy4vd2Vidmlld1RoZW1lTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBNYXJrdXBDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL21hcmt1cENlbGxWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbFVyaSwgSUNlbGxPdXRwdXQsIElOb3RlYm9va1JlbmRlcmVySW5mbywgUmVuZGVyZXJNZXNzYWdpbmdTcGVjIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0tlcm5lbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tMb2dnaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2NvcGVkUmVuZGVyZXJNZXNzYWdpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdFbGVtZW50LCBJV2Vidmlld1NlcnZpY2UsIFdlYnZpZXdDb250ZW50UHVycG9zZSwgV2Vidmlld09yaWdpblN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd2Vidmlldy9icm93c2VyL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgV2Vidmlld1dpbmRvd0RyYWdNb25pdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vd2Vidmlldy9icm93c2VyL3dlYnZpZXdXaW5kb3dEcmFnTW9uaXRvci5qcyc7XG5pbXBvcnQgeyBhc1dlYnZpZXdVcmksIHdlYnZpZXdHZW5lcmljQ3NwU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd2Vidmlldy9jb21tb24vd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZyb21XZWJ2aWV3TWVzc2FnZSwgSUFja091dHB1dEhlaWdodCwgSUNsaWNrZWREYXRhVXJsTWVzc2FnZSwgSUNvZGVCbG9ja0hpZ2hsaWdodFJlcXVlc3QsIElDb250ZW50V2lkZ2V0VG9wUmVxdWVzdCwgSUNvbnRyb2xsZXJQcmVsb2FkLCBJQ3JlYXRpb25Db250ZW50LCBJQ3JlYXRpb25SZXF1ZXN0TWVzc2FnZSwgSUZpbmRNYXRjaCwgSU1hcmt1cENlbGxJbml0aWFsaXphdGlvbiwgUmVuZGVyZXJNZXRhZGF0YSwgU3RhdGljUHJlbG9hZE1ldGFkYXRhLCBUb1dlYnZpZXdNZXNzYWdlIH0gZnJvbSAnLi93ZWJ2aWV3TWVzc2FnZXMuanMnO1xuaW1wb3J0IHsgZ2V0T3V0cHV0VGV4dCwgZ2V0T3V0cHV0U3RyZWFtVGV4dCwgVEVYVF9CQVNFRF9NSU1FVFlQRVMgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvY2VsbE91dHB1dFRleHRIZWxwZXIuanMnO1xuXG5jb25zdCBMSU5FX0NPTFVNTl9SRUdFWCA9IC86KFtcXGRdKykoPzo6KFtcXGRdKykpPyQvO1xuY29uc3QgTGluZVF1ZXJ5UmVnZXggPSAvbGluZT0oXFxkKykkLztcbmNvbnN0IEZSQUdNRU5UX1JFR0VYID0gL14oLiopIyhbXiNdKikkLztcblxuZXhwb3J0IGludGVyZmFjZSBJQ2FjaGVkSW5zZXQ8SyBleHRlbmRzIElDb21tb25DZWxsSW5mbz4ge1xuXHRvdXRwdXRJZDogc3RyaW5nO1xuXHR2ZXJzaW9uSWQ6IG51bWJlcjtcblx0Y2VsbEluZm86IEs7XG5cdHJlbmRlcmVyPzogSU5vdGVib29rUmVuZGVyZXJJbmZvO1xuXHRjYWNoZWRDcmVhdGlvbjogSUNyZWF0aW9uUmVxdWVzdE1lc3NhZ2U7XG5cdGluaXRpYWxpemVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVzb2x2ZWRCYWNrTGF5ZXJXZWJ2aWV3IHtcblx0d2VidmlldzogSVdlYnZpZXdFbGVtZW50O1xufVxuXG4vKipcbiAqIE5vdGVib29rIEVkaXRvciBEZWxlZ2F0ZSBmb3IgYmFjayBsYXllciB3ZWJ2aWV3XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rRGVsZWdhdGVGb3JXZWJ2aWV3IHtcblx0cmVhZG9ubHkgY3JlYXRpb25PcHRpb25zOiBJTm90ZWJvb2tFZGl0b3JDcmVhdGlvbk9wdGlvbnM7XG5cdGdldENlbGxCeUlkKGNlbGxJZDogc3RyaW5nKTogSUdlbmVyaWNDZWxsVmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRmb2N1c05vdGVib29rQ2VsbChjZWxsOiBJR2VuZXJpY0NlbGxWaWV3TW9kZWwsIGZvY3VzOiAnZWRpdG9yJyB8ICdjb250YWluZXInIHwgJ291dHB1dCcsIG9wdGlvbnM/OiBJRm9jdXNOb3RlYm9va0NlbGxPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0dG9nZ2xlTm90ZWJvb2tDZWxsU2VsZWN0aW9uKGNlbGw6IElHZW5lcmljQ2VsbFZpZXdNb2RlbCwgc2VsZWN0RnJvbVByZXZpb3VzOiBib29sZWFuKTogdm9pZDtcblx0Z2V0Q2VsbEJ5SW5mbyhjZWxsSW5mbzogSUNvbW1vbkNlbGxJbmZvKTogSUdlbmVyaWNDZWxsVmlld01vZGVsO1xuXHRmb2N1c05leHROb3RlYm9va0NlbGwoY2VsbDogSUdlbmVyaWNDZWxsVmlld01vZGVsLCBmb2N1czogJ2VkaXRvcicgfCAnY29udGFpbmVyJyB8ICdvdXRwdXQnKTogUHJvbWlzZTx2b2lkPjtcblx0dXBkYXRlT3V0cHV0SGVpZ2h0KGNlbGxJbmZvOiBJQ29tbW9uQ2VsbEluZm8sIG91dHB1dDogSURpc3BsYXlPdXRwdXRWaWV3TW9kZWwsIGhlaWdodDogbnVtYmVyLCBpc0luaXQ6IGJvb2xlYW4sIHNvdXJjZT86IHN0cmluZyk6IHZvaWQ7XG5cdHNjaGVkdWxlT3V0cHV0SGVpZ2h0QWNrKGNlbGxJbmZvOiBJQ29tbW9uQ2VsbEluZm8sIG91dHB1dElkOiBzdHJpbmcsIGhlaWdodDogbnVtYmVyKTogdm9pZDtcblx0dXBkYXRlTWFya3VwQ2VsbEhlaWdodChjZWxsSWQ6IHN0cmluZywgaGVpZ2h0OiBudW1iZXIsIGlzSW5pdDogYm9vbGVhbik6IHZvaWQ7XG5cdHNldE1hcmt1cENlbGxFZGl0U3RhdGUoY2VsbElkOiBzdHJpbmcsIGVkaXRTdGF0ZTogQ2VsbEVkaXRTdGF0ZSk6IHZvaWQ7XG5cdGRpZFN0YXJ0RHJhZ01hcmt1cENlbGwoY2VsbElkOiBzdHJpbmcsIGV2ZW50OiB7IGRyYWdPZmZzZXRZOiBudW1iZXIgfSk6IHZvaWQ7XG5cdGRpZERyYWdNYXJrdXBDZWxsKGNlbGxJZDogc3RyaW5nLCBldmVudDogeyBkcmFnT2Zmc2V0WTogbnVtYmVyIH0pOiB2b2lkO1xuXHRkaWREcm9wTWFya3VwQ2VsbChjZWxsSWQ6IHN0cmluZywgZXZlbnQ6IHsgZHJhZ09mZnNldFk6IG51bWJlcjsgY3RybEtleTogYm9vbGVhbjsgYWx0S2V5OiBib29sZWFuIH0pOiB2b2lkO1xuXHRkaWRFbmREcmFnTWFya3VwQ2VsbChjZWxsSWQ6IHN0cmluZyk6IHZvaWQ7XG5cdGRpZFJlc2l6ZU91dHB1dChjZWxsSWQ6IHN0cmluZyk6IHZvaWQ7XG5cdHNldFNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlcik6IHZvaWQ7XG5cdHRyaWdnZXJTY3JvbGwoZXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpOiB2b2lkO1xuXHR1cGRhdGVQZXJmb3JtYW5jZU1ldGFkYXRhKGNlbGxJZDogc3RyaW5nLCBleGVjdXRpb25JZDogc3RyaW5nLCBkdXJhdGlvbjogbnVtYmVyLCByZW5kZXJlcklkOiBzdHJpbmcpOiB2b2lkO1xuXHRkaWRGb2N1c091dHB1dElucHV0Q2hhbmdlKGlucHV0Rm9jdXNlZDogYm9vbGVhbik6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBCYWNrbGF5ZXJXZWJ2aWV3T3B0aW9ucyB7XG5cdHJlYWRvbmx5IG91dHB1dE5vZGVQYWRkaW5nOiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dHB1dE5vZGVMZWZ0UGFkZGluZzogbnVtYmVyO1xuXHRyZWFkb25seSBwcmV2aWV3Tm9kZVBhZGRpbmc6IG51bWJlcjtcblx0cmVhZG9ubHkgbWFya2Rvd25MZWZ0TWFyZ2luOiBudW1iZXI7XG5cdHJlYWRvbmx5IGxlZnRNYXJnaW46IG51bWJlcjtcblx0cmVhZG9ubHkgcmlnaHRNYXJnaW46IG51bWJlcjtcblx0cmVhZG9ubHkgcnVuR3V0dGVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRyYWdBbmREcm9wRW5hYmxlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgZm9udFNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgb3V0cHV0Rm9udFNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgZm9udEZhbWlseTogc3RyaW5nO1xuXHRyZWFkb25seSBvdXRwdXRGb250RmFtaWx5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1hcmt1cEZvbnRTaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1hcmtkb3duTGluZUhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBvdXRwdXRMaW5lSGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dHB1dFNjcm9sbGluZzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3V0cHV0V29yZFdyYXA6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG91dHB1dExpbmVMaW1pdDogbnVtYmVyO1xuXHRyZWFkb25seSBvdXRwdXRMaW5raWZ5RmlsZVBhdGhzOiBib29sZWFuO1xuXHRyZWFkb25seSBtaW5pbWFsRXJyb3I6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1hcmt1cEZvbnRGYW1pbHk6IHN0cmluZztcbn1cblxuXG5leHBvcnQgY2xhc3MgQmFja0xheWVyV2ViVmlldzxUIGV4dGVuZHMgSUNvbW1vbkNlbGxJbmZvPiBleHRlbmRzIFRoZW1hYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyBfb3JpZ2luU3RvcmU/OiBXZWJ2aWV3T3JpZ2luU3RvcmU7XG5cblx0cHJpdmF0ZSBzdGF0aWMgZ2V0T3JpZ2luU3RvcmUoc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IFdlYnZpZXdPcmlnaW5TdG9yZSB7XG5cdFx0dGhpcy5fb3JpZ2luU3RvcmUgPz89IG5ldyBXZWJ2aWV3T3JpZ2luU3RvcmUoJ25vdGVib29rLmJhY2tsYXllcldlYnZpZXcub3JpZ2lucycsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRyZXR1cm4gdGhpcy5fb3JpZ2luU3RvcmU7XG5cdH1cblxuXHRlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0d2VidmlldzogSVdlYnZpZXdFbGVtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRpbnNldE1hcHBpbmc6IE1hcDxJRGlzcGxheU91dHB1dFZpZXdNb2RlbCwgSUNhY2hlZEluc2V0PFQ+PiA9IG5ldyBNYXAoKTtcblx0cGVuZGluZ1dlYnZpZXdJZGxlQ3JlYXRpb25SZXF1ZXN0OiBNYXA8SURpc3BsYXlPdXRwdXRWaWV3TW9kZWwsIElEaXNwb3NhYmxlPiA9IG5ldyBNYXAoKTtcblx0cGVuZGluZ1dlYnZpZXdJZGxlSW5zZXRNYXBwaW5nOiBNYXA8SURpc3BsYXlPdXRwdXRWaWV3TW9kZWwsIElDYWNoZWRJbnNldDxUPj4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmV2ZXJzZWRQZW5kaW5nV2Vidmlld0lkbGVJbnNldE1hcHBpbmc6IE1hcDxzdHJpbmcsIElEaXNwbGF5T3V0cHV0Vmlld01vZGVsPiA9IG5ldyBNYXAoKTtcblxuXHRyZWFkb25seSBtYXJrdXBQcmV2aWV3TWFwcGluZyA9IG5ldyBNYXA8c3RyaW5nLCBJTWFya3VwQ2VsbEluaXRpYWxpemF0aW9uPigpO1xuXHRwcml2YXRlIGhpZGRlbkluc2V0TWFwcGluZzogU2V0PElEaXNwbGF5T3V0cHV0Vmlld01vZGVsPiA9IG5ldyBTZXQoKTtcblx0cHJpdmF0ZSByZXZlcnNlZEluc2V0TWFwcGluZzogTWFwPHN0cmluZywgSURpc3BsYXlPdXRwdXRWaWV3TW9kZWw+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIGxvY2FsUmVzb3VyY2VSb290c0NhY2hlOiBVUklbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25NZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU5vdGVib29rV2Vidmlld01lc3NhZ2U+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmVsb2Fkc0NhY2hlID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1lc3NhZ2U6IEV2ZW50PElOb3RlYm9va1dlYnZpZXdNZXNzYWdlPiA9IHRoaXMuX29uTWVzc2FnZS5ldmVudDtcblx0cHJpdmF0ZSBfZGlzcG9zZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY3VycmVudEtlcm5lbD86IElOb3RlYm9va0tlcm5lbDtcblxuXHRwcml2YXRlIGZpcnN0SW5pdCA9IHRydWU7XG5cdHByaXZhdGUgaW5pdGlhbGl6ZU1hcmt1cFByb21pc2U/OiB7IHJlYWRvbmx5IHJlcXVlc3RJZDogc3RyaW5nOyByZWFkb25seSBwOiBEZWZlcnJlZFByb21pc2U8dm9pZD47IHJlYWRvbmx5IGlzRmlyc3RJbml0OiBib29sZWFuIH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBub25jZSA9IFVVSUQuZ2VuZXJhdGVVdWlkKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tEZWxlZ2F0ZUZvcldlYnZpZXcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBub3RlYm9va1ZpZXdUeXBlOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRvY3VtZW50VXJpOiBVUkksXG5cdFx0cHJpdmF0ZSBvcHRpb25zOiBCYWNrbGF5ZXJXZWJ2aWV3T3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlcmVyTWVzc2FnaW5nOiBJU2NvcGVkUmVuZGVyZXJNZXNzYWdpbmcgfCB1bmRlZmluZWQsXG5cdFx0QElXZWJ2aWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdlYnZpZXdTZXJ2aWNlOiBJV2Vidmlld1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0xvZ1NlcnZpY2U6IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcih0aGVtZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fbG9nUmVuZGVyZXJEZWJ1Z01lc3NhZ2UoJ0NyZWF0aW5nIGJhY2tsYXllciB3ZWJ2aWV3IGZvciBub3RlYm9vaycpO1xuXG5cdFx0dGhpcy5lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJzE0MDBweCc7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblxuXHRcdGlmIChyZW5kZXJlck1lc3NhZ2luZykge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVuZGVyZXJNZXNzYWdpbmcpO1xuXHRcdFx0cmVuZGVyZXJNZXNzYWdpbmcucmVjZWl2ZU1lc3NhZ2VIYW5kbGVyID0gKHJlbmRlcmVySWQsIG1lc3NhZ2UpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLndlYnZpZXcgfHwgdGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdFx0XHRfX3ZzY29kZV9ub3RlYm9va19tZXNzYWdlOiB0cnVlLFxuXHRcdFx0XHRcdHR5cGU6ICdjdXN0b21SZW5kZXJlck1lc3NhZ2UnLFxuXHRcdFx0XHRcdHJlbmRlcmVySWQ6IHJlbmRlcmVySWQsXG5cdFx0XHRcdFx0bWVzc2FnZTogbWVzc2FnZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QoZSA9PiB7XG5cdFx0XHRjb25zdCBiYXNlVXJsID0gdGhpcy5hc1dlYnZpZXdVcmkodGhpcy5nZXROb3RlYm9va0Jhc2VVcmkoKSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGh0bWxDb250ZW50ID0gdGhpcy5nZW5lcmF0ZUNvbnRlbnQoYmFzZVVybC50b1N0cmluZygpKTtcblx0XHRcdHRoaXMud2Vidmlldz8uc2V0SHRtbChodG1sQ29udGVudCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoVG9rZW5pemF0aW9uUmVnaXN0cnkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0XHR0eXBlOiAndG9rZW5pemVkU3R5bGVzQ2hhbmdlZCcsXG5cdFx0XHRcdGNzczogZ2V0VG9rZW5pemF0aW9uQ3NzKCksXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnM6IEJhY2tsYXllcldlYnZpZXdPcHRpb25zKSB7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLl91cGRhdGVTdHlsZXMoKTtcblx0XHR0aGlzLl91cGRhdGVPcHRpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2dSZW5kZXJlckRlYnVnTWVzc2FnZShtc2c6IHN0cmluZykge1xuXHRcdHRoaXMubm90ZWJvb2tMb2dTZXJ2aWNlLmRlYnVnKCdCYWNrbGF5ZXJXZWJ2aWV3JywgYCR7dGhpcy5kb2N1bWVudFVyaX0gKCR7dGhpcy5pZH0pIC0gJHttc2d9YCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTdHlsZXMoKSB7XG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ25vdGVib29rU3R5bGVzJyxcblx0XHRcdHN0eWxlczogdGhpcy5fZ2VuZXJhdGVTdHlsZXMoKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlT3B0aW9ucygpIHtcblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnbm90ZWJvb2tPcHRpb25zJyxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZHJhZ0FuZERyb3BFbmFibGVkOiB0aGlzLm9wdGlvbnMuZHJhZ0FuZERyb3BFbmFibGVkXG5cdFx0XHR9LFxuXHRcdFx0cmVuZGVyT3B0aW9uczoge1xuXHRcdFx0XHRsaW5lTGltaXQ6IHRoaXMub3B0aW9ucy5vdXRwdXRMaW5lTGltaXQsXG5cdFx0XHRcdG91dHB1dFNjcm9sbGluZzogdGhpcy5vcHRpb25zLm91dHB1dFNjcm9sbGluZyxcblx0XHRcdFx0b3V0cHV0V29yZFdyYXA6IHRoaXMub3B0aW9ucy5vdXRwdXRXb3JkV3JhcCxcblx0XHRcdFx0bGlua2lmeUZpbGVQYXRoczogdGhpcy5vcHRpb25zLm91dHB1dExpbmtpZnlGaWxlUGF0aHMsXG5cdFx0XHRcdG1pbmltYWxFcnJvcjogdGhpcy5vcHRpb25zLm1pbmltYWxFcnJvclxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2VuZXJhdGVTdHlsZXMoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCdub3RlYm9vay1vdXRwdXQtbGVmdC1tYXJnaW4nOiBgJHt0aGlzLm9wdGlvbnMubGVmdE1hcmdpbiArIHRoaXMub3B0aW9ucy5ydW5HdXR0ZXJ9cHhgLFxuXHRcdFx0J25vdGVib29rLW91dHB1dC13aWR0aCc6IGBjYWxjKDEwMCUgLSAke3RoaXMub3B0aW9ucy5sZWZ0TWFyZ2luICsgdGhpcy5vcHRpb25zLnJpZ2h0TWFyZ2luICsgdGhpcy5vcHRpb25zLnJ1bkd1dHRlcn1weClgLFxuXHRcdFx0J25vdGVib29rLW91dHB1dC1ub2RlLXBhZGRpbmcnOiBgJHt0aGlzLm9wdGlvbnMub3V0cHV0Tm9kZVBhZGRpbmd9cHhgLFxuXHRcdFx0J25vdGVib29rLXJ1bi1ndXR0ZXInOiBgJHt0aGlzLm9wdGlvbnMucnVuR3V0dGVyfXB4YCxcblx0XHRcdCdub3RlYm9vay1wcmV2aWV3LW5vZGUtcGFkZGluZyc6IGAke3RoaXMub3B0aW9ucy5wcmV2aWV3Tm9kZVBhZGRpbmd9cHhgLFxuXHRcdFx0J25vdGVib29rLW1hcmtkb3duLWxlZnQtbWFyZ2luJzogYCR7dGhpcy5vcHRpb25zLm1hcmtkb3duTGVmdE1hcmdpbn1weGAsXG5cdFx0XHQnbm90ZWJvb2stb3V0cHV0LW5vZGUtbGVmdC1wYWRkaW5nJzogYCR7dGhpcy5vcHRpb25zLm91dHB1dE5vZGVMZWZ0UGFkZGluZ31weGAsXG5cdFx0XHQnbm90ZWJvb2stbWFya2Rvd24tbWluLWhlaWdodCc6IGAke3RoaXMub3B0aW9ucy5wcmV2aWV3Tm9kZVBhZGRpbmcgKiAyfXB4YCxcblx0XHRcdCdub3RlYm9vay1tYXJrdXAtZm9udC1zaXplJzogdHlwZW9mIHRoaXMub3B0aW9ucy5tYXJrdXBGb250U2l6ZSA9PT0gJ251bWJlcicgJiYgdGhpcy5vcHRpb25zLm1hcmt1cEZvbnRTaXplID4gMCA/IGAke3RoaXMub3B0aW9ucy5tYXJrdXBGb250U2l6ZX1weGAgOiBgY2FsYygke3RoaXMub3B0aW9ucy5mb250U2l6ZX1weCAqIDEuMilgLFxuXHRcdFx0J25vdGVib29rLW1hcmtkb3duLWxpbmUtaGVpZ2h0JzogdHlwZW9mIHRoaXMub3B0aW9ucy5tYXJrZG93bkxpbmVIZWlnaHQgPT09ICdudW1iZXInICYmIHRoaXMub3B0aW9ucy5tYXJrZG93bkxpbmVIZWlnaHQgPiAwID8gYCR7dGhpcy5vcHRpb25zLm1hcmtkb3duTGluZUhlaWdodH1weGAgOiBgbm9ybWFsYCxcblx0XHRcdCdub3RlYm9vay1jZWxsLW91dHB1dC1mb250LXNpemUnOiBgJHt0aGlzLm9wdGlvbnMub3V0cHV0Rm9udFNpemUgfHwgdGhpcy5vcHRpb25zLmZvbnRTaXplfXB4YCxcblx0XHRcdCdub3RlYm9vay1jZWxsLW91dHB1dC1saW5lLWhlaWdodCc6IGAke3RoaXMub3B0aW9ucy5vdXRwdXRMaW5lSGVpZ2h0fXB4YCxcblx0XHRcdCdub3RlYm9vay1jZWxsLW91dHB1dC1tYXgtaGVpZ2h0JzogYCR7dGhpcy5vcHRpb25zLm91dHB1dExpbmVIZWlnaHQgKiB0aGlzLm9wdGlvbnMub3V0cHV0TGluZUxpbWl0ICsgMn1weGAsXG5cdFx0XHQnbm90ZWJvb2stY2VsbC1vdXRwdXQtZm9udC1mYW1pbHknOiB0aGlzLm9wdGlvbnMub3V0cHV0Rm9udEZhbWlseSB8fCB0aGlzLm9wdGlvbnMuZm9udEZhbWlseSxcblx0XHRcdCdub3RlYm9vay1jZWxsLW1hcmt1cC1lbXB0eS1jb250ZW50JzogbmxzLmxvY2FsaXplKCdub3RlYm9vay5lbXB0eU1hcmtkb3duUGxhY2Vob2xkZXInLCBcIkVtcHR5IG1hcmtkb3duIGNlbGwsIGRvdWJsZS1jbGljayBvciBwcmVzcyBlbnRlciB0byBlZGl0LlwiKSxcblx0XHRcdCdub3RlYm9vay1jZWxsLXJlbmRlcmVyLW5vdC1mb3VuZC1lcnJvcic6IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ25vdGVib29rLmVycm9yLnJlbmRlcmVyTm90Rm91bmQnLFxuXHRcdFx0XHRjb21tZW50OiBbJyQwIGlzIGEgcGxhY2Vob2xkZXIgZm9yIHRoZSBtaW1lIHR5cGUnXVxuXHRcdFx0fSwgXCJObyByZW5kZXJlciBmb3VuZCBmb3IgJyQwJ1wiKSxcblx0XHRcdCdub3RlYm9vay1jZWxsLXJlbmRlcmVyLWZhbGxiYWNrcy1leGhhdXN0ZWQnOiBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRrZXk6ICdub3RlYm9vay5lcnJvci5yZW5kZXJlckZhbGxiYWNrc0V4aGF1c3RlZCcsXG5cdFx0XHRcdGNvbW1lbnQ6IFsnJDAgaXMgYSBwbGFjZWhvbGRlciBmb3IgdGhlIG1pbWUgdHlwZSddXG5cdFx0XHR9LCBcIkNvdWxkIG5vdCByZW5kZXIgY29udGVudCBmb3IgJyQwJ1wiKSxcblx0XHRcdCdub3RlYm9vay1tYXJrdXAtZm9udC1mYW1pbHknOiB0aGlzLm9wdGlvbnMubWFya3VwRm9udEZhbWlseSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZUNvbnRlbnQoYmFzZVVybDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVuZGVyZXJzRGF0YSA9IHRoaXMuZ2V0UmVuZGVyZXJEYXRhKCk7XG5cdFx0Y29uc3QgcHJlbG9hZHNEYXRhID0gdGhpcy5nZXRTdGF0aWNQcmVsb2Fkc0RhdGEoKTtcblx0XHRjb25zdCByZW5kZXJPcHRpb25zID0ge1xuXHRcdFx0bGluZUxpbWl0OiB0aGlzLm9wdGlvbnMub3V0cHV0TGluZUxpbWl0LFxuXHRcdFx0b3V0cHV0U2Nyb2xsaW5nOiB0aGlzLm9wdGlvbnMub3V0cHV0U2Nyb2xsaW5nLFxuXHRcdFx0b3V0cHV0V29yZFdyYXA6IHRoaXMub3B0aW9ucy5vdXRwdXRXb3JkV3JhcCxcblx0XHRcdGxpbmtpZnlGaWxlUGF0aHM6IHRoaXMub3B0aW9ucy5vdXRwdXRMaW5raWZ5RmlsZVBhdGhzLFxuXHRcdFx0bWluaW1hbEVycm9yOiB0aGlzLm9wdGlvbnMubWluaW1hbEVycm9yXG5cdFx0fTtcblx0XHRjb25zdCBwcmVsb2FkU2NyaXB0ID0gcHJlbG9hZHNTY3JpcHRTdHIoXG5cdFx0XHR7XG5cdFx0XHRcdC4uLnRoaXMub3B0aW9ucyxcblx0XHRcdFx0dG9rZW5pemF0aW9uQ3NzOiBnZXRUb2tlbml6YXRpb25Dc3MoKSxcblx0XHRcdH0sXG5cdFx0XHR7IGRyYWdBbmREcm9wRW5hYmxlZDogdGhpcy5vcHRpb25zLmRyYWdBbmREcm9wRW5hYmxlZCB9LFxuXHRcdFx0cmVuZGVyT3B0aW9ucyxcblx0XHRcdHJlbmRlcmVyc0RhdGEsXG5cdFx0XHRwcmVsb2Fkc0RhdGEsXG5cdFx0XHR0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCksXG5cdFx0XHR0aGlzLm5vbmNlKTtcblxuXHRcdGNvbnN0IGVuYWJsZUNzcCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ25vdGVib29rLmV4cGVyaW1lbnRhbC5lbmFibGVDc3AnKTtcblx0XHRjb25zdCBjdXJyZW50SGlnaGxpZ2h0ID0gdGhpcy5nZXRDb2xvcihlZGl0b3JGaW5kTWF0Y2gpO1xuXHRcdGNvbnN0IGZpbmRNYXRjaEhpZ2hsaWdodCA9IHRoaXMuZ2V0Q29sb3IoZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0KTtcblx0XHRyZXR1cm4gLyogaHRtbCAqL2Bcblx0XHQ8aHRtbCBsYW5nPVwiZW5cIj5cblx0XHRcdDxoZWFkPlxuXHRcdFx0XHQ8bWV0YSBjaGFyc2V0PVwiVVRGLThcIj5cblx0XHRcdFx0PGJhc2UgaHJlZj1cIiR7YmFzZVVybH0vXCIgLz5cblx0XHRcdFx0JHtlbmFibGVDc3AgP1xuXHRcdFx0XHRgPG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtU2VjdXJpdHktUG9saWN5XCIgY29udGVudD1cIlxuXHRcdFx0XHRcdGRlZmF1bHQtc3JjICdub25lJztcblx0XHRcdFx0XHRzY3JpcHQtc3JjICR7d2Vidmlld0dlbmVyaWNDc3BTb3VyY2V9ICd1bnNhZmUtaW5saW5lJyAndW5zYWZlLWV2YWwnO1xuXHRcdFx0XHRcdHN0eWxlLXNyYyAke3dlYnZpZXdHZW5lcmljQ3NwU291cmNlfSAndW5zYWZlLWlubGluZSc7XG5cdFx0XHRcdFx0aW1nLXNyYyAke3dlYnZpZXdHZW5lcmljQ3NwU291cmNlfSBodHRwczogaHR0cDogZGF0YTo7XG5cdFx0XHRcdFx0Zm9udC1zcmMgJHt3ZWJ2aWV3R2VuZXJpY0NzcFNvdXJjZX0gaHR0cHM6O1xuXHRcdFx0XHRcdGNvbm5lY3Qtc3JjIGh0dHBzOjtcblx0XHRcdFx0XHRjaGlsZC1zcmMgaHR0cHM6IGRhdGE6O1xuXHRcdFx0XHRcIj5gIDogJyd9XG5cdFx0XHRcdDxzdHlsZSBub25jZT1cIiR7dGhpcy5ub25jZX1cIj5cblx0XHRcdFx0XHQ6OmhpZ2hsaWdodChmaW5kLWhpZ2hsaWdodCkge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWVkaXRvci1maW5kTWF0Y2hCYWNrZ3JvdW5kLCAke2ZpbmRNYXRjaEhpZ2hsaWdodH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdDo6aGlnaGxpZ2h0KGN1cnJlbnQtZmluZC1oaWdobGlnaHQpIHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1lZGl0b3ItZmluZE1hdGNoSGlnaGxpZ2h0QmFja2dyb3VuZCwgJHtjdXJyZW50SGlnaGxpZ2h0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciAuY2VsbF9jb250YWluZXIge1xuXHRcdFx0XHRcdFx0d2lkdGg6IDEwMCU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciAub3V0cHV0X2NvbnRhaW5lciB7XG5cdFx0XHRcdFx0XHR3aWR0aDogMTAwJTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyIC5jZWxsX2NvbnRhaW5lci5uYi1pbnNlcnRIaWdobGlnaHQgZGl2Lm91dHB1dF9jb250YWluZXIgZGl2Lm91dHB1dCB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtZGlmZkVkaXRvci1pbnNlcnRlZExpbmVCYWNrZ3JvdW5kLCB2YXIoLS12c2NvZGUtZGlmZkVkaXRvci1pbnNlcnRlZFRleHRCYWNrZ3JvdW5kKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciA+IGRpdiA+IGRpdiA+IGRpdi5vdXRwdXQge1xuXHRcdFx0XHRcdFx0Zm9udC1zaXplOiB2YXIoLS1ub3RlYm9vay1jZWxsLW91dHB1dC1mb250LXNpemUpO1xuXHRcdFx0XHRcdFx0d2lkdGg6IHZhcigtLW5vdGVib29rLW91dHB1dC13aWR0aCk7XG5cdFx0XHRcdFx0XHRtYXJnaW4tbGVmdDogdmFyKC0tbm90ZWJvb2stb3V0cHV0LWxlZnQtbWFyZ2luKTtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXRoZW1lLW5vdGVib29rLW91dHB1dC1iYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHRcdHBhZGRpbmctdG9wOiB2YXIoLS1ub3RlYm9vay1vdXRwdXQtbm9kZS1wYWRkaW5nKTtcblx0XHRcdFx0XHRcdHBhZGRpbmctcmlnaHQ6IHZhcigtLW5vdGVib29rLW91dHB1dC1ub2RlLXBhZGRpbmcpO1xuXHRcdFx0XHRcdFx0cGFkZGluZy1ib3R0b206IHZhcigtLW5vdGVib29rLW91dHB1dC1ub2RlLXBhZGRpbmcpO1xuXHRcdFx0XHRcdFx0cGFkZGluZy1sZWZ0OiB2YXIoLS1ub3RlYm9vay1vdXRwdXQtbm9kZS1sZWZ0LXBhZGRpbmcpO1xuXHRcdFx0XHRcdFx0Ym94LXNpemluZzogYm9yZGVyLWJveDtcblx0XHRcdFx0XHRcdGJvcmRlci10b3A6IG5vbmU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0LyogbWFya2Rvd24gKi9cblx0XHRcdFx0XHQjY29udGFpbmVyIGRpdi5wcmV2aWV3IHtcblx0XHRcdFx0XHRcdHdpZHRoOiAxMDAlO1xuXHRcdFx0XHRcdFx0cGFkZGluZy1yaWdodDogdmFyKC0tbm90ZWJvb2stcHJldmlldy1ub2RlLXBhZGRpbmcpO1xuXHRcdFx0XHRcdFx0cGFkZGluZy1sZWZ0OiB2YXIoLS1ub3RlYm9vay1tYXJrZG93bi1sZWZ0LW1hcmdpbik7XG5cdFx0XHRcdFx0XHRwYWRkaW5nLXRvcDogdmFyKC0tbm90ZWJvb2stcHJldmlldy1ub2RlLXBhZGRpbmcpO1xuXHRcdFx0XHRcdFx0cGFkZGluZy1ib3R0b206IHZhcigtLW5vdGVib29rLXByZXZpZXctbm9kZS1wYWRkaW5nKTtcblxuXHRcdFx0XHRcdFx0Ym94LXNpemluZzogYm9yZGVyLWJveDtcblx0XHRcdFx0XHRcdHdoaXRlLXNwYWNlOiBub3dyYXA7XG5cdFx0XHRcdFx0XHRvdmVyZmxvdzogaGlkZGVuO1xuXHRcdFx0XHRcdFx0d2hpdGUtc3BhY2U6IGluaXRpYWw7XG5cblx0XHRcdFx0XHRcdGZvbnQtc2l6ZTogdmFyKC0tbm90ZWJvb2stbWFya3VwLWZvbnQtc2l6ZSk7XG5cdFx0XHRcdFx0XHRsaW5lLWhlaWdodDogdmFyKC0tbm90ZWJvb2stbWFya2Rvd24tbGluZS1oZWlnaHQpO1xuXHRcdFx0XHRcdFx0Y29sb3I6IHZhcigtLXRoZW1lLXVpLWZvcmVncm91bmQpO1xuXHRcdFx0XHRcdFx0Zm9udC1mYW1pbHk6IHZhcigtLW5vdGVib29rLW1hcmt1cC1mb250LWZhbWlseSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciBkaXYucHJldmlldy5kcmFnZ2FibGUge1xuXHRcdFx0XHRcdFx0dXNlci1zZWxlY3Q6IG5vbmU7XG5cdFx0XHRcdFx0XHQtd2Via2l0LXVzZXItc2VsZWN0OiBub25lO1xuXHRcdFx0XHRcdFx0LW1zLXVzZXItc2VsZWN0OiBub25lO1xuXHRcdFx0XHRcdFx0Y3Vyc29yOiBncmFiO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgZGl2LnByZXZpZXcuc2VsZWN0ZWQge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZDogdmFyKC0tdGhlbWUtbm90ZWJvb2stY2VsbC1zZWxlY3RlZC1iYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyIGRpdi5wcmV2aWV3LmRyYWdnaW5nIHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXRoZW1lLWJhY2tncm91bmQpO1xuXHRcdFx0XHRcdFx0b3BhY2l0eTogMC41ICFpbXBvcnRhbnQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2gudnMtZGFyayAubm90ZWJvb2tPdmVybGF5IC5jZWxsLm1hcmtkb3duIC5sYXRleCBpbWcsXG5cdFx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2gudnMtZGFyayAubm90ZWJvb2tPdmVybGF5IC5jZWxsLm1hcmtkb3duIC5sYXRleC1ibG9jayBpbWcge1xuXHRcdFx0XHRcdFx0ZmlsdGVyOiBicmlnaHRuZXNzKDApIGludmVydCgxKVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgLm1hcmt1cCA+IGRpdi5uYi1zeW1ib2xIaWdobGlnaHQge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdGhlbWUtbm90ZWJvb2stc3ltYm9sLWhpZ2hsaWdodC1iYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyIC5tYXJrdXAgPiBkaXYubmItaW5zZXJ0SGlnaGxpZ2h0IHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1kaWZmRWRpdG9yLWluc2VydGVkTGluZUJhY2tncm91bmQsIHZhcigtLXZzY29kZS1kaWZmRWRpdG9yLWluc2VydGVkVGV4dEJhY2tncm91bmQpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyIC5uYi1zeW1ib2xIaWdobGlnaHQgLm91dHB1dF9jb250YWluZXIgLm91dHB1dCB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS10aGVtZS1ub3RlYm9vay1zeW1ib2wtaGlnaGxpZ2h0LWJhY2tncm91bmQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgLm1hcmt1cCA+IGRpdi5uYi1tdWx0aUNlbGxIaWdobGlnaHQge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdGhlbWUtbm90ZWJvb2stc3ltYm9sLWhpZ2hsaWdodC1iYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjY29udGFpbmVyIC5uYi1tdWx0aUNlbGxIaWdobGlnaHQgLm91dHB1dF9jb250YWluZXIgLm91dHB1dCB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS10aGVtZS1ub3RlYm9vay1zeW1ib2wtaGlnaGxpZ2h0LWJhY2tncm91bmQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgLm5iLWNoYXRHZW5lcmF0aW9uSGlnaGxpZ2h0IC5vdXRwdXRfY29udGFpbmVyIC5vdXRwdXQge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLW5vdGVib29rLXNlbGVjdGVkQ2VsbEJhY2tncm91bmQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgPiBkaXYubmItY2VsbERlbGV0ZWQgLm91dHB1dF9jb250YWluZXIge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdGhlbWUtbm90ZWJvb2stZGlmZi1yZW1vdmVkLWJhY2tncm91bmQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNjb250YWluZXIgPiBkaXYubmItY2VsbEFkZGVkIC5vdXRwdXRfY29udGFpbmVyIHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXRoZW1lLW5vdGVib29rLWRpZmYtaW5zZXJ0ZWQtYmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciA+IGRpdiA+IGRpdjpub3QoLnByZXZpZXcpID4gZGl2IHtcblx0XHRcdFx0XHRcdG92ZXJmbG93LXg6IGF1dG87XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I2NvbnRhaW5lciAubm8tcmVuZGVyZXItZXJyb3Ige1xuXHRcdFx0XHRcdFx0Y29sb3I6IHZhcigtLXZzY29kZS1lZGl0b3JFcnJvci1mb3JlZ3JvdW5kKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRib2R5IHtcblx0XHRcdFx0XHRcdHBhZGRpbmc6IDBweDtcblx0XHRcdFx0XHRcdGhlaWdodDogMTAwJTtcblx0XHRcdFx0XHRcdHdpZHRoOiAxMDAlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRhYmxlLCB0aGVhZCwgdHIsIHRoLCB0ZCwgdGJvZHkge1xuXHRcdFx0XHRcdFx0Ym9yZGVyOiBub25lO1xuXHRcdFx0XHRcdFx0Ym9yZGVyLWNvbG9yOiB0cmFuc3BhcmVudDtcblx0XHRcdFx0XHRcdGJvcmRlci1zcGFjaW5nOiAwO1xuXHRcdFx0XHRcdFx0Ym9yZGVyLWNvbGxhcHNlOiBjb2xsYXBzZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0YWJsZSwgdGgsIHRyIHtcblx0XHRcdFx0XHRcdHZlcnRpY2FsLWFsaWduOiBtaWRkbGU7XG5cdFx0XHRcdFx0XHR0ZXh0LWFsaWduOiByaWdodDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGVhZCB7XG5cdFx0XHRcdFx0XHRmb250LXdlaWdodDogYm9sZDtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHJnYmEoMTMwLCAxMzAsIDEzMCwgMC4xNik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGgsIHRkIHtcblx0XHRcdFx0XHRcdHBhZGRpbmc6IDRweCA4cHg7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dHI6bnRoLWNoaWxkKGV2ZW4pIHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHJnYmEoMTMwLCAxMzAsIDEzMCwgMC4wOCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGJvZHkgdGgge1xuXHRcdFx0XHRcdFx0Zm9udC13ZWlnaHQ6IG5vcm1hbDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQuZmluZC1tYXRjaCB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtZWRpdG9yLWZpbmRNYXRjaEhpZ2hsaWdodEJhY2tncm91bmQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC5jdXJyZW50LWZpbmQtbWF0Y2gge1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogdmFyKC0tdnNjb2RlLWVkaXRvci1maW5kTWF0Y2hCYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjX2RlZmF1bHRDb2xvclBhbGF0dGUge1xuXHRcdFx0XHRcdFx0Y29sb3I6IHZhcigtLXZzY29kZS1lZGl0b3ItZmluZE1hdGNoSGlnaGxpZ2h0QmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtZWRpdG9yLWZpbmRNYXRjaEJhY2tncm91bmQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0PC9zdHlsZT5cblx0XHRcdDwvaGVhZD5cblx0XHRcdDxib2R5IHN0eWxlPVwib3ZlcmZsb3c6IGhpZGRlbjtcIj5cblx0XHRcdFx0PGRpdiBpZD0nZmluZFN0YXJ0JyB0YWJJbmRleD0tMT48L2Rpdj5cblx0XHRcdFx0PGRpdiBpZD0nY29udGFpbmVyJyBjbGFzcz1cIndpZGdldGFyZWFcIiBzdHlsZT1cInBvc2l0aW9uOiBhYnNvbHV0ZTt3aWR0aDoxMDAlO3RvcDogMHB4XCI+PC9kaXY+XG5cdFx0XHRcdDxkaXYgaWQ9XCJfZGVmYXVsdENvbG9yUGFsYXR0ZVwiPjwvZGl2PlxuXHRcdFx0XHQ8c2NyaXB0IHR5cGU9XCJtb2R1bGVcIj4ke3ByZWxvYWRTY3JpcHR9PC9zY3JpcHQ+XG5cdFx0XHQ8L2JvZHk+XG5cdFx0PC9odG1sPmA7XG5cdH1cblxuXHRwcml2YXRlIGdldFJlbmRlcmVyRGF0YSgpOiBSZW5kZXJlck1ldGFkYXRhW10ge1xuXHRcdHJldHVybiB0aGlzLm5vdGVib29rU2VydmljZS5nZXRSZW5kZXJlcnMoKS5tYXAoKHJlbmRlcmVyKTogUmVuZGVyZXJNZXRhZGF0YSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeXBvaW50ID0ge1xuXHRcdFx0XHRleHRlbmRzOiByZW5kZXJlci5lbnRyeXBvaW50LmV4dGVuZHMsXG5cdFx0XHRcdHBhdGg6IHRoaXMuYXNXZWJ2aWV3VXJpKHJlbmRlcmVyLmVudHJ5cG9pbnQucGF0aCwgcmVuZGVyZXIuZXh0ZW5zaW9uTG9jYXRpb24pLnRvU3RyaW5nKClcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogcmVuZGVyZXIuaWQsXG5cdFx0XHRcdGVudHJ5cG9pbnQsXG5cdFx0XHRcdG1pbWVUeXBlczogcmVuZGVyZXIubWltZVR5cGVzLFxuXHRcdFx0XHRtZXNzYWdpbmc6IHJlbmRlcmVyLm1lc3NhZ2luZyAhPT0gUmVuZGVyZXJNZXNzYWdpbmdTcGVjLk5ldmVyICYmICEhdGhpcy5yZW5kZXJlck1lc3NhZ2luZyxcblx0XHRcdFx0aXNCdWlsdGluOiByZW5kZXJlci5pc0J1aWx0aW5cblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFN0YXRpY1ByZWxvYWRzRGF0YSgpOiBTdGF0aWNQcmVsb2FkTWV0YWRhdGFbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5ub3RlYm9va1NlcnZpY2UuZ2V0U3RhdGljUHJlbG9hZHModGhpcy5ub3RlYm9va1ZpZXdUeXBlKSwgcHJlbG9hZCA9PiB7XG5cdFx0XHRyZXR1cm4geyBlbnRyeXBvaW50OiB0aGlzLmFzV2Vidmlld1VyaShwcmVsb2FkLmVudHJ5cG9pbnQsIHByZWxvYWQuZXh0ZW5zaW9uTG9jYXRpb24pLnRvU3RyaW5nKCkudG9TdHJpbmcoKSB9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc1dlYnZpZXdVcmkodXJpOiBVUkksIGZyb21FeHRlbnNpb246IFVSSSB8IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBhc1dlYnZpZXdVcmkodXJpLCBmcm9tRXh0ZW5zaW9uPy5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlID8geyBpc1JlbW90ZTogdHJ1ZSwgYXV0aG9yaXR5OiBmcm9tRXh0ZW5zaW9uLmF1dGhvcml0eSB9IDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdHBvc3RLZXJuZWxNZXNzYWdlKG1lc3NhZ2U6IGFueSkge1xuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdF9fdnNjb2RlX25vdGVib29rX21lc3NhZ2U6IHRydWUsXG5cdFx0XHR0eXBlOiAnY3VzdG9tS2VybmVsTWVzc2FnZScsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlT3V0cHV0SWQoaWQ6IHN0cmluZyk6IHsgY2VsbEluZm86IFQ7IG91dHB1dDogSUNlbGxPdXRwdXRWaWV3TW9kZWwgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gdGhpcy5yZXZlcnNlZEluc2V0TWFwcGluZy5nZXQoaWQpO1xuXHRcdGlmICghb3V0cHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbEluZm8gPSB0aGlzLmluc2V0TWFwcGluZy5nZXQob3V0cHV0KSEuY2VsbEluZm87XG5cdFx0cmV0dXJuIHsgY2VsbEluZm8sIG91dHB1dCB9O1xuXHR9XG5cblx0aXNSZXNvbHZlZCgpOiB0aGlzIGlzIElSZXNvbHZlZEJhY2tMYXllcldlYnZpZXcge1xuXHRcdHJldHVybiAhIXRoaXMud2Vidmlldztcblx0fVxuXG5cdGNyZWF0ZVdlYnZpZXcodGFyZ2V0V2luZG93OiBDb2RlV2luZG93KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYmFzZVVybCA9IHRoaXMuYXNXZWJ2aWV3VXJpKHRoaXMuZ2V0Tm90ZWJvb2tCYXNlVXJpKCksIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgaHRtbENvbnRlbnQgPSB0aGlzLmdlbmVyYXRlQ29udGVudChiYXNlVXJsLnRvU3RyaW5nKCkpO1xuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsaXplKGh0bWxDb250ZW50LCB0YXJnZXRXaW5kb3cpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROb3RlYm9va0Jhc2VVcmkoKSB7XG5cdFx0aWYgKHRoaXMuZG9jdW1lbnRVcmkuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcih0aGlzLmRvY3VtZW50VXJpKTtcblx0XHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdFx0cmV0dXJuIGZvbGRlci51cmk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRpZiAoZm9sZGVycy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGZvbGRlcnNbMF0udXJpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBkaXJuYW1lKHRoaXMuZG9jdW1lbnRVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRCdWlsdGluTG9jYWxSZXNvdXJjZVJvb3RzKCk6IFVSSVtdIHtcblx0XHQvLyBQeXRob24gbm90ZWJvb2tzIGFzc3VtZSB0aGF0IHJlcXVpcmVqcyBpcyBhIGdsb2JhbC5cblx0XHQvLyBGb3IgYWxsIG90aGVyIG5vdGVib29rcywgdGhleSBuZWVkIHRvIHByb3ZpZGUgdGhlaXIgb3duIGxvYWRlci5cblx0XHRpZiAoIXRoaXMuZG9jdW1lbnRVcmkucGF0aC50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKCcuaXB5bmInKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0cmV0dXJuIFtdOyAvLyBzY3JpcHQgaXMgaW5saW5lZFxuXHRcdH1cblxuXHRcdHJldHVybiBbXG5cdFx0XHRkaXJuYW1lKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9ubHMuanMnKSksXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgX2luaXRpYWxpemUoY29udGVudDogc3RyaW5nLCB0YXJnZXRXaW5kb3c6IENvZGVXaW5kb3cpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWdldFdpbmRvdyh0aGlzLmVsZW1lbnQpLmRvY3VtZW50LmJvZHkuY29udGFpbnModGhpcy5lbGVtZW50KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFbGVtZW50IGlzIGFscmVhZHkgZGV0YWNoZWQgZnJvbSB0aGUgRE9NIHRyZWUnKTtcblx0XHR9XG5cblx0XHR0aGlzLndlYnZpZXcgPSB0aGlzLl9jcmVhdGVJbnNldCh0aGlzLndlYnZpZXdTZXJ2aWNlLCBjb250ZW50KTtcblx0XHR0aGlzLndlYnZpZXcubW91bnRUbyh0aGlzLmVsZW1lbnQsIHRhcmdldFdpbmRvdyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53ZWJ2aWV3KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBXZWJ2aWV3V2luZG93RHJhZ01vbml0b3IodGFyZ2V0V2luZG93LCAoKSA9PiB0aGlzLndlYnZpZXcpKTtcblxuXHRcdGNvbnN0IGluaXRpYWxpemVQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53ZWJ2aWV3Lm9uRmF0YWxFcnJvcihlID0+IHtcblx0XHRcdGluaXRpYWxpemVQcm9taXNlLmVycm9yKG5ldyBFcnJvcihgQ291bGQgbm90IGluaXRpYWxpemUgd2VidmlldzogJHtlLm1lc3NhZ2V9fWApKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndlYnZpZXcub25NZXNzYWdlKGFzeW5jIChtZXNzYWdlKSA9PiB7XG5cdFx0XHRjb25zdCBkYXRhOiBGcm9tV2Vidmlld01lc3NhZ2UgfCB7IHJlYWRvbmx5IF9fdnNjb2RlX25vdGVib29rX21lc3NhZ2U6IHVuZGVmaW5lZCB9ID0gbWVzc2FnZS5tZXNzYWdlO1xuXHRcdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFkYXRhLl9fdnNjb2RlX25vdGVib29rX21lc3NhZ2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzd2l0Y2ggKGRhdGEudHlwZSkge1xuXHRcdFx0XHRjYXNlICdpbml0aWFsaXplZCc6IHtcblx0XHRcdFx0XHRpbml0aWFsaXplUHJvbWlzZS5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdHRoaXMuaW5pdGlhbGl6ZVdlYlZpZXdTdGF0ZSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2luaXRpYWxpemVkTWFya3VwJzoge1xuXHRcdFx0XHRcdGlmICh0aGlzLmluaXRpYWxpemVNYXJrdXBQcm9taXNlPy5yZXF1ZXN0SWQgPT09IGRhdGEucmVxdWVzdElkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmluaXRpYWxpemVNYXJrdXBQcm9taXNlPy5wLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLmluaXRpYWxpemVNYXJrdXBQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdkaW1lbnNpb24nOiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB1cGRhdGUgb2YgZGF0YS51cGRhdGVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBoZWlnaHQgPSB1cGRhdGUuaGVpZ2h0O1xuXHRcdFx0XHRcdFx0aWYgKHVwZGF0ZS5pc091dHB1dCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXNvbHZlZFJlc3VsdCA9IHRoaXMucmVzb2x2ZU91dHB1dElkKHVwZGF0ZS5pZCk7XG5cdFx0XHRcdFx0XHRcdGlmIChyZXNvbHZlZFJlc3VsdCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHsgY2VsbEluZm8sIG91dHB1dCB9ID0gcmVzb2x2ZWRSZXN1bHQ7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci51cGRhdGVPdXRwdXRIZWlnaHQoY2VsbEluZm8sIG91dHB1dCwgaGVpZ2h0LCAhIXVwZGF0ZS5pbml0LCAnd2VidmlldyNkaW1lbnNpb24nKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnNjaGVkdWxlT3V0cHV0SGVpZ2h0QWNrKGNlbGxJbmZvLCB1cGRhdGUuaWQsIGhlaWdodCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodXBkYXRlLmluaXQpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBtaWdodCBiZSBpZGxlIHJlbmRlciByZXF1ZXN0J3MgYWNrXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgb3V0cHV0UmVxdWVzdCA9IHRoaXMucmV2ZXJzZWRQZW5kaW5nV2Vidmlld0lkbGVJbnNldE1hcHBpbmcuZ2V0KHVwZGF0ZS5pZCk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKG91dHB1dFJlcXVlc3QpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGluc2V0ID0gdGhpcy5wZW5kaW5nV2Vidmlld0lkbGVJbnNldE1hcHBpbmcuZ2V0KG91dHB1dFJlcXVlc3QpITtcblxuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gY2xlYXIgdGhlIHBlbmRpbmcgbWFwcGluZ1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5wZW5kaW5nV2Vidmlld0lkbGVDcmVhdGlvblJlcXVlc3QuZGVsZXRlKG91dHB1dFJlcXVlc3QpO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5wZW5kaW5nV2Vidmlld0lkbGVDcmVhdGlvblJlcXVlc3QuZGVsZXRlKG91dHB1dFJlcXVlc3QpO1xuXG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBjZWxsSW5mbyA9IGluc2V0LmNlbGxJbmZvO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5yZXZlcnNlZEluc2V0TWFwcGluZy5zZXQodXBkYXRlLmlkLCBvdXRwdXRSZXF1ZXN0KTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuaW5zZXRNYXBwaW5nLnNldChvdXRwdXRSZXF1ZXN0LCBpbnNldCk7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnVwZGF0ZU91dHB1dEhlaWdodChjZWxsSW5mbywgb3V0cHV0UmVxdWVzdCwgaGVpZ2h0LCAhIXVwZGF0ZS5pbml0LCAnd2VidmlldyNkaW1lbnNpb24nKTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3Iuc2NoZWR1bGVPdXRwdXRIZWlnaHRBY2soY2VsbEluZm8sIHVwZGF0ZS5pZCwgaGVpZ2h0KTtcblxuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdHRoaXMucmV2ZXJzZWRQZW5kaW5nV2Vidmlld0lkbGVJbnNldE1hcHBpbmcuZGVsZXRlKHVwZGF0ZS5pZCk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCF1cGRhdGUuaW5pdCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgb3V0cHV0ID0gdGhpcy5yZXZlcnNlZEluc2V0TWFwcGluZy5nZXQodXBkYXRlLmlkKTtcblxuXHRcdFx0XHRcdFx0XHRcdGlmICghb3V0cHV0KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRjb25zdCBpbnNldCA9IHRoaXMuaW5zZXRNYXBwaW5nLmdldChvdXRwdXQpITtcblx0XHRcdFx0XHRcdFx0XHRpbnNldC5pbml0aWFsaXplZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IudXBkYXRlTWFya3VwQ2VsbEhlaWdodCh1cGRhdGUuaWQsIGhlaWdodCwgISF1cGRhdGUuaW5pdCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ21vdXNlZW50ZXInOiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRSZXN1bHQgPSB0aGlzLnJlc29sdmVPdXRwdXRJZChkYXRhLmlkKTtcblx0XHRcdFx0XHRpZiAocmVzb2x2ZWRSZXN1bHQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhdGVzdENlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUluZm8ocmVzb2x2ZWRSZXN1bHQuY2VsbEluZm8pO1xuXHRcdFx0XHRcdFx0aWYgKGxhdGVzdENlbGwpIHtcblx0XHRcdFx0XHRcdFx0bGF0ZXN0Q2VsbC5vdXRwdXRJc0hvdmVyZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdtb3VzZWxlYXZlJzoge1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkUmVzdWx0ID0gdGhpcy5yZXNvbHZlT3V0cHV0SWQoZGF0YS5pZCk7XG5cdFx0XHRcdFx0aWYgKHJlc29sdmVkUmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYXRlc3RDZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsQnlJbmZvKHJlc29sdmVkUmVzdWx0LmNlbGxJbmZvKTtcblx0XHRcdFx0XHRcdGlmIChsYXRlc3RDZWxsKSB7XG5cdFx0XHRcdFx0XHRcdGxhdGVzdENlbGwub3V0cHV0SXNIb3ZlcmVkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ291dHB1dEZvY3VzJzoge1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkUmVzdWx0ID0gdGhpcy5yZXNvbHZlT3V0cHV0SWQoZGF0YS5pZCk7XG5cdFx0XHRcdFx0aWYgKHJlc29sdmVkUmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYXRlc3RDZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsQnlJbmZvKHJlc29sdmVkUmVzdWx0LmNlbGxJbmZvKTtcblx0XHRcdFx0XHRcdGlmIChsYXRlc3RDZWxsKSB7XG5cdFx0XHRcdFx0XHRcdGxhdGVzdENlbGwub3V0cHV0SXNGb2N1c2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChsYXRlc3RDZWxsLCAnb3V0cHV0JywgeyBvdXRwdXRJZDogcmVzb2x2ZWRSZXN1bHQub3V0cHV0Lm1vZGVsLm91dHB1dElkLCBza2lwUmV2ZWFsOiB0cnVlLCBvdXRwdXRXZWJ2aWV3Rm9jdXNlZDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnb3V0cHV0Qmx1cic6IHtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZFJlc3VsdCA9IHRoaXMucmVzb2x2ZU91dHB1dElkKGRhdGEuaWQpO1xuXHRcdFx0XHRcdGlmIChyZXNvbHZlZFJlc3VsdCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGF0ZXN0Q2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SW5mbyhyZXNvbHZlZFJlc3VsdC5jZWxsSW5mbyk7XG5cdFx0XHRcdFx0XHRpZiAobGF0ZXN0Q2VsbCkge1xuXHRcdFx0XHRcdFx0XHRsYXRlc3RDZWxsLm91dHB1dElzRm9jdXNlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRsYXRlc3RDZWxsLmlucHV0SW5PdXRwdXRJc0ZvY3VzZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnc2Nyb2xsLWFjayc6IHtcblx0XHRcdFx0XHQvLyBjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcblx0XHRcdFx0XHQvLyBjb25zdCB0b3AgPSBkYXRhLmRhdGEudG9wO1xuXHRcdFx0XHRcdC8vIGNvbnNvbGUubG9nKCdhY2sgdG9wICcsIHRvcCwgJyB2ZXJzaW9uOiAnLCBkYXRhLnZlcnNpb24sICcgLSAnLCBkYXRlLmdldE1pbnV0ZXMoKSArICc6JyArIGRhdGUuZ2V0U2Vjb25kcygpICsgJzonICsgZGF0ZS5nZXRNaWxsaXNlY29uZHMoKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnc2Nyb2xsLXRvLXJldmVhbCc6IHtcblx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLnNldFNjcm9sbFRvcChkYXRhLnNjcm9sbFRvcCAtIE5PVEVCT09LX1dFQlZJRVdfQk9VTkRBUlkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2RpZC1zY3JvbGwtd2hlZWwnOiB7XG5cdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci50cmlnZ2VyU2Nyb2xsKHtcblx0XHRcdFx0XHRcdC4uLmRhdGEucGF5bG9hZCxcblx0XHRcdFx0XHRcdHByZXZlbnREZWZhdWx0OiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0XHRzdG9wUHJvcGFnYXRpb246ICgpID0+IHsgfVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2ZvY3VzLWVkaXRvcic6IHtcblx0XHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsQnlJZChkYXRhLmNlbGxJZCk7XG5cdFx0XHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0XHRcdGlmIChkYXRhLmZvY3VzTmV4dCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmZvY3VzTmV4dE5vdGVib29rQ2VsbChjZWxsLCAnZWRpdG9yJyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGNlbGwsICdlZGl0b3InKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnY2xpY2tlZC1kYXRhLXVybCc6IHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrRGF0YUxpbmsoZGF0YSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnY2xpY2tlZC1saW5rJzoge1xuXHRcdFx0XHRcdGlmIChtYXRjaGVzU2NoZW1lKGRhdGEuaHJlZiwgU2NoZW1hcy5jb21tYW5kKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGRhdGEuaHJlZik7XG5cblx0XHRcdFx0XHRcdGlmICh1cmkucGF0aCA9PT0gJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkxhcmdlT3V0cHV0Jykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvdXRwdXRJZCA9IHVyaS5xdWVyeTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cDtcblx0XHRcdFx0XHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGdyb3VwLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0Z3JvdXAucGluRWRpdG9yKGdyb3VwLmFjdGl2ZUVkaXRvcik7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oQ2VsbFVyaS5nZW5lcmF0ZUNlbGxPdXRwdXRVcmlXaXRoSWQodGhpcy5kb2N1bWVudFVyaSwgb3V0cHV0SWQpKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHVyaS5wYXRoID09PSAnY2VsbE91dHB1dC5lbmFibGVTY3JvbGxpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG91dHB1dElkID0gdXJpLnF1ZXJ5O1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5yZXZlcnNlZEluc2V0TWFwcGluZy5nZXQob3V0cHV0SWQpO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj5cblx0XHRcdFx0XHRcdFx0XHRcdCgnd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiAnbm90ZWJvb2suY2VsbC50b2dnbGVPdXRwdXRTY3JvbGxpbmcnLCBmcm9tOiAnaW5saW5lTGluaycgfSk7XG5cblx0XHRcdFx0XHRcdFx0XHRjZWxsLmNlbGxWaWV3TW9kZWwub3V0cHV0c1ZpZXdNb2RlbHMuZm9yRWFjaCgodm0pID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmICh2bS5tb2RlbC5tZXRhZGF0YSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR2bS5tb2RlbC5tZXRhZGF0YVsnc2Nyb2xsYWJsZSddID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dm0ucmVzZXRSZW5kZXJlcigpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBXZSBhbGxvdyBhIHZlcnkgbGltaXRlZCBzZXQgb2YgY29tbWFuZHNcblx0XHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGRhdGEuaHJlZiwge1xuXHRcdFx0XHRcdFx0XHRmcm9tVXNlckdlc3R1cmU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGZyb21Xb3Jrc3BhY2U6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGFsbG93Q29tbWFuZHM6IFtcblx0XHRcdFx0XHRcdFx0XHQnZ2l0aHViLWlzc3Vlcy5hdXRoTm93Jyxcblx0XHRcdFx0XHRcdFx0XHQnd29ya2JlbmNoLmV4dGVuc2lvbnMuc2VhcmNoJyxcblx0XHRcdFx0XHRcdFx0XHQnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLFxuXHRcdFx0XHRcdFx0XHRcdCdfbm90ZWJvb2suc2VsZWN0S2VybmVsJyxcblx0XHRcdFx0XHRcdFx0XHQvLyBUT0RPQHJlYm9ybml4IGV4cGxvcmUgb3BlbiBvdXRwdXQgY2hhbm5lbCB3aXRoIG5hbWUgY29tbWFuZFxuXHRcdFx0XHRcdFx0XHRcdCdqdXB5dGVyLnZpZXdPdXRwdXQnLFxuXHRcdFx0XHRcdFx0XHRcdCdqdXB5dGVyLmNyZWF0ZVB5dGhvbkVudkFuZFNlbGVjdENvbnRyb2xsZXInLFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKG1hdGNoZXNTb21lU2NoZW1lKGRhdGEuaHJlZiwgU2NoZW1hcy5odHRwLCBTY2hlbWFzLmh0dHBzLCBTY2hlbWFzLm1haWx0bykpIHtcblx0XHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGRhdGEuaHJlZiwgeyBmcm9tVXNlckdlc3R1cmU6IHRydWUsIGZyb21Xb3Jrc3BhY2U6IHRydWUgfSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChtYXRjaGVzU2NoZW1lKGRhdGEuaHJlZiwgU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoZGF0YS5ocmVmKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZU5vdGVib29rQ2VsbFJlc291cmNlKHVyaSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICghL15bXFx3XFwtXSs6Ly50ZXN0KGRhdGEuaHJlZikpIHtcblx0XHRcdFx0XHRcdC8vIFVyaSB3aXRob3V0IHNjaGVtZSwgc3VjaCBhcyBhIGZpbGUgcGF0aFxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5faGFuZGxlUmVzb3VyY2VPcGVuaW5nKHRyeURlY29kZVVSSUNvbXBvbmVudChkYXRhLmhyZWYpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gdXJpIHdpdGggc2NoZW1lXG5cdFx0XHRcdFx0XHRpZiAob3NQYXRoLmlzQWJzb2x1dGUoZGF0YS5ocmVmKSkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9vcGVuVXJpKFVSSS5maWxlKGRhdGEuaHJlZikpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fb3BlblVyaShVUkkucGFyc2UoZGF0YS5ocmVmKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2N1c3RvbUtlcm5lbE1lc3NhZ2UnOiB7XG5cdFx0XHRcdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUoeyBtZXNzYWdlOiBkYXRhLm1lc3NhZ2UgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnY3VzdG9tUmVuZGVyZXJNZXNzYWdlJzoge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyZXJNZXNzYWdpbmc/LnBvc3RNZXNzYWdlKGRhdGEucmVuZGVyZXJJZCwgZGF0YS5tZXNzYWdlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdjbGlja01hcmt1cENlbGwnOiB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SWQoZGF0YS5jZWxsSWQpO1xuXHRcdFx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdFx0XHRpZiAoZGF0YS5zaGlmdEtleSB8fCAoaXNNYWNpbnRvc2ggPyBkYXRhLm1ldGFLZXkgOiBkYXRhLmN0cmxLZXkpKSB7XG5cdFx0XHRcdFx0XHRcdC8vIE1vZGlmeSBzZWxlY3Rpb25cblx0XHRcdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci50b2dnbGVOb3RlYm9va0NlbGxTZWxlY3Rpb24oY2VsbCwgLyogZnJvbVByZXZpb3VzICovIGRhdGEuc2hpZnRLZXkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gTm9ybWFsIGNsaWNrXG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoY2VsbCwgJ2NvbnRhaW5lcicsIHsgc2tpcFJldmVhbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnY29udGV4dE1lbnVNYXJrdXBDZWxsJzoge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUlkKGRhdGEuY2VsbElkKTtcblx0XHRcdFx0XHRpZiAoY2VsbCkge1xuXHRcdFx0XHRcdFx0Ly8gRm9jdXMgdGhlIGNlbGwgZmlyc3Rcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoY2VsbCwgJ2NvbnRhaW5lcicsIHsgc2tpcFJldmVhbDogdHJ1ZSB9KTtcblxuXHRcdFx0XHRcdFx0Ly8gVGhlbiBzaG93IHRoZSBjb250ZXh0IG1lbnVcblx0XHRcdFx0XHRcdGNvbnN0IHdlYnZpZXdSZWN0ID0gdGhpcy5lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0XHRcdFx0bWVudUlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+ICh7XG5cdFx0XHRcdFx0XHRcdFx0eDogd2Vidmlld1JlY3QueCArIGRhdGEuY2xpZW50WCxcblx0XHRcdFx0XHRcdFx0XHR5OiB3ZWJ2aWV3UmVjdC55ICsgZGF0YS5jbGllbnRZXG5cdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAndG9nZ2xlTWFya3VwUHJldmlldyc6IHtcblx0XHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsQnlJZChkYXRhLmNlbGxJZCk7XG5cdFx0XHRcdFx0aWYgKGNlbGwgJiYgIXRoaXMubm90ZWJvb2tFZGl0b3IuY3JlYXRpb25PcHRpb25zLmlzUmVhZE9ubHkpIHtcblx0XHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3Iuc2V0TWFya3VwQ2VsbEVkaXRTdGF0ZShkYXRhLmNlbGxJZCwgQ2VsbEVkaXRTdGF0ZS5FZGl0aW5nKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoY2VsbCwgJ2VkaXRvcicsIHsgc2tpcFJldmVhbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnbW91c2VFbnRlck1hcmt1cENlbGwnOiB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SWQoZGF0YS5jZWxsSWQpO1xuXHRcdFx0XHRcdGlmIChjZWxsIGluc3RhbmNlb2YgTWFya3VwQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdFx0Y2VsbC5jZWxsSXNIb3ZlcmVkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnbW91c2VMZWF2ZU1hcmt1cENlbGwnOiB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SWQoZGF0YS5jZWxsSWQpO1xuXHRcdFx0XHRcdGlmIChjZWxsIGluc3RhbmNlb2YgTWFya3VwQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdFx0Y2VsbC5jZWxsSXNIb3ZlcmVkID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2NlbGwtZHJhZy1zdGFydCc6IHtcblx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmRpZFN0YXJ0RHJhZ01hcmt1cENlbGwoZGF0YS5jZWxsSWQsIGRhdGEpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2NlbGwtZHJhZyc6IHtcblx0XHRcdFx0XHR0aGlzLm5vdGVib29rRWRpdG9yLmRpZERyYWdNYXJrdXBDZWxsKGRhdGEuY2VsbElkLCBkYXRhKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdjZWxsLWRyb3AnOiB7XG5cdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5kaWREcm9wTWFya3VwQ2VsbChkYXRhLmNlbGxJZCwge1xuXHRcdFx0XHRcdFx0ZHJhZ09mZnNldFk6IGRhdGEuZHJhZ09mZnNldFksXG5cdFx0XHRcdFx0XHRjdHJsS2V5OiBkYXRhLmN0cmxLZXksXG5cdFx0XHRcdFx0XHRhbHRLZXk6IGRhdGEuYWx0S2V5LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2NlbGwtZHJhZy1lbmQnOiB7XG5cdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5kaWRFbmREcmFnTWFya3VwQ2VsbChkYXRhLmNlbGxJZCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAncmVuZGVyZWRNYXJrdXAnOiB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SWQoZGF0YS5jZWxsSWQpO1xuXHRcdFx0XHRcdGlmIChjZWxsIGluc3RhbmNlb2YgTWFya3VwQ2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdFx0Y2VsbC5yZW5kZXJlZEh0bWwgPSBkYXRhLmh0bWw7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5faGFuZGxlSGlnaGxpZ2h0Q29kZUJsb2NrKGRhdGEuY29kZUJsb2Nrcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAncmVuZGVyZWRDZWxsT3V0cHV0Jzoge1xuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZUhpZ2hsaWdodENvZGVCbG9jayhkYXRhLmNvZGVCbG9ja3MpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ291dHB1dFJlc2l6ZWQnOiB7XG5cdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci5kaWRSZXNpemVPdXRwdXQoZGF0YS5jZWxsSWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2dldE91dHB1dEl0ZW0nOiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRSZXN1bHQgPSB0aGlzLnJlc29sdmVPdXRwdXRJZChkYXRhLm91dHB1dElkKTtcblx0XHRcdFx0XHRjb25zdCBvdXRwdXQgPSByZXNvbHZlZFJlc3VsdD8ub3V0cHV0Lm1vZGVsLm91dHB1dHMuZmluZChvdXRwdXQgPT4gb3V0cHV0Lm1pbWUgPT09IGRhdGEubWltZSk7XG5cblx0XHRcdFx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHRcdFx0XHR0eXBlOiAncmV0dXJuT3V0cHV0SXRlbScsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0SWQ6IGRhdGEucmVxdWVzdElkLFxuXHRcdFx0XHRcdFx0b3V0cHV0OiBvdXRwdXQgPyB7IG1pbWU6IG91dHB1dC5taW1lLCB2YWx1ZUJ5dGVzOiBvdXRwdXQuZGF0YS5idWZmZXIgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdsb2dSZW5kZXJlckRlYnVnTWVzc2FnZSc6IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dSZW5kZXJlckRlYnVnTWVzc2FnZShgJHtkYXRhLm1lc3NhZ2V9JHtkYXRhLmRhdGEgPyAnICcgKyBKU09OLnN0cmluZ2lmeShkYXRhLmRhdGEsIG51bGwsIDQpIDogJyd9YCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnbm90ZWJvb2tQZXJmb3JtYW5jZU1lc3NhZ2UnOiB7XG5cdFx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvci51cGRhdGVQZXJmb3JtYW5jZU1ldGFkYXRhKGRhdGEuY2VsbElkLCBkYXRhLmV4ZWN1dGlvbklkLCBkYXRhLmR1cmF0aW9uLCBkYXRhLnJlbmRlcmVySWQpO1xuXHRcdFx0XHRcdGlmIChkYXRhLm91dHB1dFNpemUgJiYgZGF0YS5yZW5kZXJlcklkID09PSAndnNjb2RlLmJ1aWx0aW4tcmVuZGVyZXInKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZW5kUGVyZm9ybWFuY2VEYXRhKGRhdGEub3V0cHV0U2l6ZSwgZGF0YS5kdXJhdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ291dHB1dElucHV0Rm9jdXMnOiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRSZXN1bHQgPSB0aGlzLnJlc29sdmVPdXRwdXRJZChkYXRhLmlkKTtcblx0XHRcdFx0XHRpZiAocmVzb2x2ZWRSZXN1bHQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhdGVzdENlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmdldENlbGxCeUluZm8ocmVzb2x2ZWRSZXN1bHQuY2VsbEluZm8pO1xuXHRcdFx0XHRcdFx0aWYgKGxhdGVzdENlbGwpIHtcblx0XHRcdFx0XHRcdFx0bGF0ZXN0Q2VsbC5pbnB1dEluT3V0cHV0SXNGb2N1c2VkID0gZGF0YS5pbnB1dEZvY3VzZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3IuZGlkRm9jdXNPdXRwdXRJbnB1dENoYW5nZShkYXRhLmlucHV0Rm9jdXNlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gaW5pdGlhbGl6ZVByb21pc2UucDtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRQZXJmb3JtYW5jZURhdGEob3V0cHV0U2l6ZTogbnVtYmVyLCByZW5kZXJUaW1lOiBudW1iZXIpIHtcblx0XHR0eXBlIE5vdGVib29rT3V0cHV0UmVuZGVyQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2FtdW5nZXInO1xuXHRcdFx0Y29tbWVudDogJ1RyYWNrIHBlcmZvcm1hbmNlIGRhdGEgZm9yIG91dHB1dCByZW5kZXJpbmcnO1xuXHRcdFx0b3V0cHV0U2l6ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1NpemUgb2YgdGhlIG91dHB1dCBkYXRhIGJ1ZmZlci4nOyBpc01lYXN1cmVtZW50OiB0cnVlIH07XG5cdFx0XHRyZW5kZXJUaW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGltZSBzcGVudCByZW5kZXJpbmcgb3V0cHV0Lic7IGlzTWVhc3VyZW1lbnQ6IHRydWUgfTtcblx0XHR9O1xuXG5cdFx0dHlwZSBOb3RlYm9va091dHB1dFJlbmRlckV2ZW50ID0ge1xuXHRcdFx0b3V0cHV0U2l6ZTogbnVtYmVyO1xuXHRcdFx0cmVuZGVyVGltZTogbnVtYmVyO1xuXHRcdH07XG5cblx0XHRjb25zdCB0ZWxlbWV0cnlEYXRhID0ge1xuXHRcdFx0b3V0cHV0U2l6ZSxcblx0XHRcdHJlbmRlclRpbWVcblx0XHR9O1xuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Tm90ZWJvb2tPdXRwdXRSZW5kZXJFdmVudCwgTm90ZWJvb2tPdXRwdXRSZW5kZXJDbGFzc2lmaWNhdGlvbj4oJ05vdGVib29rQ2VsbE91dHB1dFJlbmRlcicsIHRlbGVtZXRyeURhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlTm90ZWJvb2tDZWxsUmVzb3VyY2UodXJpOiBVUkkpIHtcblx0XHRjb25zdCBub3RlYm9va1Jlc291cmNlID0gdXJpLnBhdGgubGVuZ3RoID4gMCA/IHVyaSA6IHRoaXMuZG9jdW1lbnRVcmk7XG5cblx0XHRjb25zdCBsaW5lTWF0Y2ggPSAvKD86XnwmKWxpbmU9KFteJl0rKS8uZXhlYyh1cmkucXVlcnkpO1xuXHRcdGxldCBlZGl0b3JPcHRpb25zOiBJVGV4dEVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGxpbmVNYXRjaCkge1xuXHRcdFx0Y29uc3QgcGFyc2VkTGluZU51bWJlciA9IHBhcnNlSW50KGxpbmVNYXRjaFsxXSwgMTApO1xuXHRcdFx0aWYgKCFpc05hTihwYXJzZWRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gcGFyc2VkTGluZU51bWJlcjtcblxuXHRcdFx0XHRlZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHRcdHNlbGVjdGlvbjogeyBzdGFydExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiAxIH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBleGVjdXRpb25NYXRjaCA9IC8oPzpefCYpZXhlY3V0aW9uX2NvdW50PShbXiZdKykvLmV4ZWModXJpLnF1ZXJ5KTtcblx0XHRpZiAoZXhlY3V0aW9uTWF0Y2gpIHtcblx0XHRcdGNvbnN0IGV4ZWN1dGlvbkNvdW50ID0gcGFyc2VJbnQoZXhlY3V0aW9uTWF0Y2hbMV0sIDEwKTtcblx0XHRcdGlmICghaXNOYU4oZXhlY3V0aW9uQ291bnQpKSB7XG5cdFx0XHRcdGNvbnN0IG5vdGVib29rTW9kZWwgPSB0aGlzLm5vdGVib29rU2VydmljZS5nZXROb3RlYm9va1RleHRNb2RlbChub3RlYm9va1Jlc291cmNlKTtcblx0XHRcdFx0Ly8gbXVsdGlwbGUgY2VsbHMgd2l0aCB0aGUgc2FtZSBleGVjdXRpb24gY291bnQgY2FuIGV4aXN0IGlmIHRoZSBrZXJuZWwgaXMgcmVzdGFydGVkXG5cdFx0XHRcdC8vIHNvIGxvb2sgZm9yIHRoZSBtb3N0IHJlY2VudGx5IGFkZGVkIGNlbGwgd2l0aCB0aGUgbWF0Y2hpbmcgZXhlY3V0aW9uIGNvdW50LlxuXHRcdFx0XHQvLyBTb21ld2hhdCBtb3JlIGxpa2VseSB0byBiZSBjb3JyZWN0IGluIG5vdGVib29rcywgYW4gbXVjaCBtb3JlIGxpa2VseSBmb3IgdGhlIGludGVyYWN0aXZlIHdpbmRvd1xuXHRcdFx0XHRjb25zdCBjZWxsID0gbm90ZWJvb2tNb2RlbD8uY2VsbHMuc2xpY2UoKS5yZXZlcnNlKCkuZmluZChjZWxsID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gY2VsbC5pbnRlcm5hbE1ldGFkYXRhLmV4ZWN1dGlvbk9yZGVyID09PSBleGVjdXRpb25Db3VudDtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChjZWxsPy51cmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oY2VsbC51cmksIHtcblx0XHRcdFx0XHRcdGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGZyb21Xb3Jrc3BhY2U6IHRydWUsXG5cdFx0XHRcdFx0XHRlZGl0b3JPcHRpb25zOiBlZGl0b3JPcHRpb25zXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVUkxzIGJ1aWx0IGJ5IHRoZSBqdXB5dGVyIGV4dGVuc2lvbiBwdXQgdGhlIGxpbmUgcXVlcnkgcGFyYW0gaW4gdGhlIGZyYWdtZW50XG5cdFx0Ly8gVGhleSBhbHNvIGhhdmUgdGhlIGNlbGwgZnJhZ21lbnQgcHJlLWNhbGN1bGF0ZWRcblx0XHRjb25zdCBmcmFnbWVudExpbmVNYXRjaCA9IC9cXD9saW5lPShcXGQrKSQvLmV4ZWModXJpLmZyYWdtZW50KTtcblx0XHRpZiAoZnJhZ21lbnRMaW5lTWF0Y2gpIHtcblx0XHRcdGNvbnN0IHBhcnNlZExpbmVOdW1iZXIgPSBwYXJzZUludChmcmFnbWVudExpbmVNYXRjaFsxXSwgMTApO1xuXHRcdFx0aWYgKCFpc05hTihwYXJzZWRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gcGFyc2VkTGluZU51bWJlciArIDE7XG5cdFx0XHRcdGNvbnN0IGZyYWdtZW50ID0gdXJpLmZyYWdtZW50LnN1YnN0cmluZygwLCBmcmFnbWVudExpbmVNYXRjaC5pbmRleCk7XG5cblx0XHRcdFx0Ly8gb3BlbiB0aGUgdXJpIHdpdGggc2VsZWN0aW9uXG5cdFx0XHRcdGNvbnN0IGVkaXRvck9wdGlvbnM6IElUZXh0RWRpdG9yT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRzZWxlY3Rpb246IHsgc3RhcnRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogbGluZU51bWJlciwgZW5kQ29sdW1uOiAxIH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4obm90ZWJvb2tSZXNvdXJjZS53aXRoKHsgZnJhZ21lbnQgfSksIHtcblx0XHRcdFx0XHRmcm9tVXNlckdlc3R1cmU6IHRydWUsXG5cdFx0XHRcdFx0ZnJvbVdvcmtzcGFjZTogdHJ1ZSxcblx0XHRcdFx0XHRlZGl0b3JPcHRpb25zOiBlZGl0b3JPcHRpb25zXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbihub3RlYm9va1Jlc291cmNlLCB7IGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSwgZnJvbVdvcmtzcGFjZTogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVJlc291cmNlT3BlbmluZyhocmVmOiBzdHJpbmcpIHtcblx0XHRsZXQgbGlua1RvT3BlbjogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBmcmFnbWVudDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gU2VwYXJhdGUgb3V0IHRoZSBmcmFnbWVudCBzbyB0aGF0IHRoZSBzdWJzZXF1ZW50IGNhbGxzXG5cdFx0Ly8gdG8gVVJJLmpvaW5QYXRoKCkgZG9uJ3QgVVJMIGVuY29kZSBpdC4gVGhpcyBhbGxvd3Mgb3BlbmluZ1xuXHRcdC8vIGxpbmtzIHdpdGggYm90aCBwYXRocyBhbmQgZnJhZ21lbnRzLlxuXHRcdGNvbnN0IGhyZWZXaXRoRnJhZ21lbnQgPSBGUkFHTUVOVF9SRUdFWC5leGVjKGhyZWYpO1xuXHRcdGlmIChocmVmV2l0aEZyYWdtZW50KSB7XG5cdFx0XHRocmVmID0gaHJlZldpdGhGcmFnbWVudFsxXTtcblx0XHRcdGZyYWdtZW50ID0gaHJlZldpdGhGcmFnbWVudFsyXTtcblx0XHR9XG5cblx0XHRpZiAoaHJlZi5zdGFydHNXaXRoKCcvJykpIHtcblx0XHRcdGxpbmtUb09wZW4gPSBhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLmZpbGVVUkkoaHJlZik7XG5cdFx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdFx0aWYgKGZvbGRlcnMubGVuZ3RoKSB7XG5cdFx0XHRcdGxpbmtUb09wZW4gPSBsaW5rVG9PcGVuLndpdGgoe1xuXHRcdFx0XHRcdHNjaGVtZTogZm9sZGVyc1swXS51cmkuc2NoZW1lLFxuXHRcdFx0XHRcdGF1dGhvcml0eTogZm9sZGVyc1swXS51cmkuYXV0aG9yaXR5XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaHJlZi5zdGFydHNXaXRoKCd+JykpIHtcblx0XHRcdGNvbnN0IHVzZXJIb21lID0gYXdhaXQgdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdFx0aWYgKHVzZXJIb21lKSB7XG5cdFx0XHRcdGxpbmtUb09wZW4gPSBVUkkuam9pblBhdGgodXNlckhvbWUsIGhyZWYuc3Vic3RyaW5nKDIpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuZG9jdW1lbnRVcmkuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRcdGlmICghZm9sZGVycy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0bGlua1RvT3BlbiA9IFVSSS5qb2luUGF0aChmb2xkZXJzWzBdLnVyaSwgaHJlZik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBSZXNvbHZlIHJlbGF0aXZlIHRvIG5vdGVib29rIGRvY3VtZW50XG5cdFx0XHRcdGxpbmtUb09wZW4gPSBVUkkuam9pblBhdGgoZGlybmFtZSh0aGlzLmRvY3VtZW50VXJpKSwgaHJlZik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmtUb09wZW4pIHtcblx0XHRcdC8vIFJlLWF0dGFjaCBmcmFnbWVudCBub3cgdGhhdCB3ZSBoYXZlIHRoZSBmdWxsIGZpbGUgcGF0aC5cblx0XHRcdGlmIChmcmFnbWVudCkge1xuXHRcdFx0XHRsaW5rVG9PcGVuID0gbGlua1RvT3Blbi53aXRoKHsgZnJhZ21lbnQgfSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9vcGVuVXJpKGxpbmtUb09wZW4pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5VcmkodXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgbGluZU51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBjb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBsaW5lQ29sID0gTElORV9DT0xVTU5fUkVHRVguZXhlYyh1cmkucGF0aCk7XG5cdFx0aWYgKGxpbmVDb2wpIHtcblx0XHRcdHVyaSA9IHVyaS53aXRoKHtcblx0XHRcdFx0cGF0aDogdXJpLnBhdGguc2xpY2UoMCwgbGluZUNvbC5pbmRleCksXG5cdFx0XHRcdGZyYWdtZW50OiBgTCR7bGluZUNvbFswXS5zbGljZSgxKX1gXG5cdFx0XHR9KTtcblx0XHRcdGxpbmVOdW1iZXIgPSBwYXJzZUludChsaW5lQ29sWzFdLCAxMCk7XG5cdFx0XHRjb2x1bW4gPSBsaW5lQ29sWzJdID8gcGFyc2VJbnQobGluZUNvbFsyXSwgMTApIDogMTtcblx0XHR9XG5cblx0XHQvLyNyZWdpb24gZXJyb3IgcmVuZGVyZXIgbWlncmF0aW9uLCByZW1vdmUgb25jZSBkb25lXG5cdFx0Y29uc3QgbGluZU1hdGNoID0gTGluZVF1ZXJ5UmVnZXguZXhlYyh1cmkucXVlcnkpO1xuXHRcdGlmIChsaW5lTWF0Y2gpIHtcblx0XHRcdGNvbnN0IHBhcnNlZExpbmVOdW1iZXIgPSBwYXJzZUludChsaW5lTWF0Y2hbMV0sIDEwKTtcblx0XHRcdGlmICghaXNOYU4ocGFyc2VkTGluZU51bWJlcikpIHtcblx0XHRcdFx0bGluZU51bWJlciA9IHBhcnNlZExpbmVOdW1iZXIgKyAxO1xuXHRcdFx0XHRjb2x1bW4gPSAxO1xuXHRcdFx0XHR1cmkgPSB1cmkud2l0aCh7IGZyYWdtZW50OiBgTCR7bGluZU51bWJlcn1gIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHVyaSA9IHVyaS53aXRoKHtcblx0XHRcdHF1ZXJ5OiBudWxsXG5cdFx0fSk7XG5cdFx0Ly8jZW5kcmVnaW9uXG5cblx0XHRjb25zdCBleHRyYWN0ZWRTZWxlY3Rpb24gPSBleHRyYWN0U2VsZWN0aW9uKHVyaSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gbGluZU51bWJlciAhPT0gdW5kZWZpbmVkICYmIGNvbHVtbiAhPT0gdW5kZWZpbmVkID8geyBzdGFydExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiBjb2x1bW4gfSA6IGV4dHJhY3RlZFNlbGVjdGlvbi5zZWxlY3Rpb247XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBleHRyYWN0ZWRTZWxlY3Rpb24udXJpO1xuXG5cdFx0aWYgKCF0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHJlc291cmNlKSB8fCB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmlzSW5zaWRlV29ya3NwYWNlKHJlc291cmNlKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4odXJpLCB7IGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSwgZnJvbVdvcmtzcGFjZTogdHJ1ZSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgbWF0Y2g6IHsgZ3JvdXA6IElFZGl0b3JHcm91cDsgZWRpdG9yOiBFZGl0b3JJbnB1dCB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMpIHtcblx0XHRcdGNvbnN0IGVkaXRvcklucHV0ID0gZ3JvdXAuZWRpdG9ycy5maW5kKGVkaXRvciA9PiBlZGl0b3IucmVzb3VyY2UgJiYgaXNFcXVhbChlZGl0b3IucmVzb3VyY2UsIHJlc291cmNlLCB0cnVlKSk7XG5cdFx0XHRpZiAoZWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0bWF0Y2ggPSB7IGdyb3VwLCBlZGl0b3I6IGVkaXRvcklucHV0IH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRzZWxlY3Rpb24sXG5cdFx0XHRzb3VyY2U6IEVkaXRvck9wZW5Tb3VyY2UuVVNFUlxuXHRcdH07XG5cblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhbe1xuXHRcdFx0XHRlZGl0b3I6IG1hdGNoLmVkaXRvcixcblx0XHRcdFx0b3B0aW9uc1xuXHRcdFx0fV0sIG1hdGNoLmdyb3VwLCB7IHZhbGlkYXRlVHJ1c3Q6IHRydWUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhbe1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0b3B0aW9uc1xuXHRcdFx0fV0sIHVuZGVmaW5lZCwgeyB2YWxpZGF0ZVRydXN0OiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUhpZ2hsaWdodENvZGVCbG9jayhjb2RlQmxvY2tzOiBSZWFkb25seUFycmF5PElDb2RlQmxvY2tIaWdobGlnaHRSZXF1ZXN0Pikge1xuXHRcdGZvciAoY29uc3QgeyBpZCwgdmFsdWUsIGxhbmcgfSBvZiBjb2RlQmxvY2tzKSB7XG5cdFx0XHQvLyBUaGUgbGFuZ3VhZ2UgaWQgbWF5IGJlIGEgbGFuZ3VhZ2UgYWxpYXNlcyAoZS5nLmpzIGluc3RlYWQgb2YgamF2YXNjcmlwdClcblx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUobGFuZyk7XG5cdFx0XHRpZiAoIWxhbmd1YWdlSWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRva2VuaXplVG9TdHJpbmcodGhpcy5sYW5ndWFnZVNlcnZpY2UsIHZhbHVlLCBsYW5ndWFnZUlkKS50aGVuKChodG1sKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHRcdFx0dHlwZTogJ3Rva2VuaXplZENvZGVCbG9jaycsXG5cdFx0XHRcdFx0aHRtbCxcblx0XHRcdFx0XHRjb2RlQmxvY2tJZDogaWRcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblx0cHJpdmF0ZSBhc3luYyBfb25EaWRDbGlja0RhdGFMaW5rKGV2ZW50OiBJQ2xpY2tlZERhdGFVcmxNZXNzYWdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHR5cGVvZiBldmVudC5kYXRhICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtzcGxpdFN0YXJ0LCBzcGxpdERhdGFdID0gZXZlbnQuZGF0YS5zcGxpdCgnO2Jhc2U2NCwnKTtcblx0XHRpZiAoIXNwbGl0RGF0YSB8fCAhc3BsaXRTdGFydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmF1bHREaXIgPSBleHRuYW1lKHRoaXMuZG9jdW1lbnRVcmkpID09PSAnLmludGVyYWN0aXZlJyA/XG5cdFx0XHR0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0/LnVyaSA/PyBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLmRlZmF1bHRGaWxlUGF0aCgpIDpcblx0XHRcdGRpcm5hbWUodGhpcy5kb2N1bWVudFVyaSk7XG5cdFx0bGV0IGRlZmF1bHROYW1lOiBzdHJpbmc7XG5cdFx0aWYgKGV2ZW50LmRvd25sb2FkTmFtZSkge1xuXHRcdFx0ZGVmYXVsdE5hbWUgPSBldmVudC5kb3dubG9hZE5hbWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1pbWVUeXBlID0gc3BsaXRTdGFydC5yZXBsYWNlKC9eZGF0YTovLCAnJyk7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGVFeHRlbnNpb24gPSBtaW1lVHlwZSAmJiBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZShtaW1lVHlwZSk7XG5cdFx0XHRkZWZhdWx0TmFtZSA9IGNhbmRpZGF0ZUV4dGVuc2lvbiA/IGBkb3dubG9hZCR7Y2FuZGlkYXRlRXh0ZW5zaW9ufWAgOiAnZG93bmxvYWQnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmF1bHRVcmkgPSBqb2luUGF0aChkZWZhdWx0RGlyLCBkZWZhdWx0TmFtZSk7XG5cdFx0Y29uc3QgbmV3RmlsZVVyaSA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coe1xuXHRcdFx0ZGVmYXVsdFVyaVxuXHRcdH0pO1xuXHRcdGlmICghbmV3RmlsZVVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJ1ZmYgPSBkZWNvZGVCYXNlNjQoc3BsaXREYXRhKTtcblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShuZXdGaWxlVXJpLCBidWZmKTtcblx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihuZXdGaWxlVXJpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUluc2V0KHdlYnZpZXdTZXJ2aWNlOiBJV2Vidmlld1NlcnZpY2UsIGNvbnRlbnQ6IHN0cmluZykge1xuXHRcdHRoaXMubG9jYWxSZXNvdXJjZVJvb3RzQ2FjaGUgPSB0aGlzLl9nZXRSZXNvdXJjZVJvb3RzQ2FjaGUoKTtcblx0XHRjb25zdCB3ZWJ2aWV3ID0gd2Vidmlld1NlcnZpY2UuY3JlYXRlV2Vidmlld0VsZW1lbnQoe1xuXHRcdFx0b3JpZ2luOiBCYWNrTGF5ZXJXZWJWaWV3LmdldE9yaWdpblN0b3JlKHRoaXMuc3RvcmFnZVNlcnZpY2UpLmdldE9yaWdpbih0aGlzLm5vdGVib29rVmlld1R5cGUsIHVuZGVmaW5lZCksXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCd3ZWJ2aWV3IHRpdGxlJywgXCJOb3RlYm9vayB3ZWJ2aWV3IGNvbnRlbnRcIiksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHB1cnBvc2U6IFdlYnZpZXdDb250ZW50UHVycG9zZS5Ob3RlYm9va1JlbmRlcmVyLFxuXHRcdFx0XHRlbmFibGVGaW5kV2lkZ2V0OiBmYWxzZSxcblx0XHRcdFx0dHJhbnNmb3JtQ3NzVmFyaWFibGVzOiB0cmFuc2Zvcm1XZWJ2aWV3VGhlbWVWYXJzLFxuXHRcdFx0fSxcblx0XHRcdGNvbnRlbnRPcHRpb25zOiB7XG5cdFx0XHRcdGFsbG93TXVsdGlwbGVBUElBY3F1aXJlOiB0cnVlLFxuXHRcdFx0XHRhbGxvd1NjcmlwdHM6IHRydWUsXG5cdFx0XHRcdGZvcndhcmRVbnRydXN0ZWRLZXlwcmVzc0V2ZW50czogZmFsc2UsXG5cdFx0XHRcdGxvY2FsUmVzb3VyY2VSb290czogdGhpcy5sb2NhbFJlc291cmNlUm9vdHNDYWNoZSxcblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb246IHVuZGVmaW5lZCxcblx0XHRcdHByb3ZpZGVkVmlld1R5cGU6ICdub3RlYm9vay5vdXRwdXQnXG5cdFx0fSk7XG5cblx0XHR3ZWJ2aWV3LnNldEh0bWwoY29udGVudCk7XG5cdFx0d2Vidmlldy5zZXRDb250ZXh0S2V5U2VydmljZSh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRyZXR1cm4gd2Vidmlldztcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlc291cmNlUm9vdHNDYWNoZSgpOiBVUklbXSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoeCA9PiB4LnVyaSk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tEaXIgPSB0aGlzLmdldE5vdGVib29rQmFzZVVyaSgpO1xuXHRcdHJldHVybiBbXG5cdFx0XHR0aGlzLm5vdGVib29rU2VydmljZS5nZXROb3RlYm9va1Byb3ZpZGVyUmVzb3VyY2VSb290cygpLFxuXHRcdFx0dGhpcy5ub3RlYm9va1NlcnZpY2UuZ2V0UmVuZGVyZXJzKCkubWFwKHggPT4gZGlybmFtZSh4LmVudHJ5cG9pbnQucGF0aCkpLFxuXHRcdFx0Li4uQXJyYXkuZnJvbSh0aGlzLm5vdGVib29rU2VydmljZS5nZXRTdGF0aWNQcmVsb2Fkcyh0aGlzLm5vdGVib29rVmlld1R5cGUpLCB4ID0+IFtcblx0XHRcdFx0ZGlybmFtZSh4LmVudHJ5cG9pbnQpLFxuXHRcdFx0XHQuLi54LmxvY2FsUmVzb3VyY2VSb290cyxcblx0XHRcdF0pLFxuXHRcdFx0d29ya3NwYWNlRm9sZGVycyxcblx0XHRcdG5vdGVib29rRGlyLFxuXHRcdFx0dGhpcy5nZXRCdWlsdGluTG9jYWxSZXNvdXJjZVJvb3RzKClcblx0XHRdLmZsYXQoKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZVdlYlZpZXdTdGF0ZSgpIHtcblx0XHR0aGlzLl9wcmVsb2Fkc0NhY2hlLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRLZXJuZWwpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZVByZWxvYWRzRnJvbUtlcm5lbCh0aGlzLl9jdXJyZW50S2VybmVsKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFtvdXRwdXQsIGluc2V0XSBvZiB0aGlzLmluc2V0TWFwcGluZy5lbnRyaWVzKCkpIHtcblx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHsgLi4uaW5zZXQuY2FjaGVkQ3JlYXRpb24sIGluaXRpYWxseUhpZGRlbjogdGhpcy5oaWRkZW5JbnNldE1hcHBpbmcuaGFzKG91dHB1dCkgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaW5pdGlhbGl6ZU1hcmt1cFByb21pc2U/LmlzRmlyc3RJbml0KSB7XG5cdFx0XHQvLyBPbiBmaXJzdCBydW4gdGhlIGNvbnRlbnRzIGhhdmUgYWxyZWFkeSBiZWVuIGluaXRpYWxpemVkIHNvIHdlIGRvbid0IG5lZWQgdG8gaW5pdCB0aGVtIGFnYWluXG5cdFx0XHQvLyBubyBvcFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBtZENlbGxzID0gWy4uLnRoaXMubWFya3VwUHJldmlld01hcHBpbmcudmFsdWVzKCldO1xuXHRcdFx0dGhpcy5tYXJrdXBQcmV2aWV3TWFwcGluZy5jbGVhcigpO1xuXHRcdFx0dGhpcy5pbml0aWFsaXplTWFya3VwKG1kQ2VsbHMpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3VwZGF0ZVN0eWxlcygpO1xuXHRcdHRoaXMuX3VwZGF0ZU9wdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkVXBkYXRlSW5zZXQoY2VsbDogSUdlbmVyaWNDZWxsVmlld01vZGVsLCBvdXRwdXQ6IElDZWxsT3V0cHV0Vmlld01vZGVsLCBjZWxsVG9wOiBudW1iZXIsIG91dHB1dE9mZnNldDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCdpc091dHB1dENvbGxhcHNlZCcgaW4gY2VsbCAmJiAoY2VsbCBhcyBJQ2VsbFZpZXdNb2RlbCkuaXNPdXRwdXRDb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5oaWRkZW5JbnNldE1hcHBpbmcuaGFzKG91dHB1dCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG91dHB1dENhY2hlID0gdGhpcy5pbnNldE1hcHBpbmcuZ2V0KG91dHB1dCk7XG5cdFx0aWYgKCFvdXRwdXRDYWNoZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChvdXRwdXRPZmZzZXQgPT09IG91dHB1dENhY2hlLmNhY2hlZENyZWF0aW9uLm91dHB1dE9mZnNldCAmJiBjZWxsVG9wID09PSBvdXRwdXRDYWNoZS5jYWNoZWRDcmVhdGlvbi5jZWxsVG9wKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhY2tIZWlnaHQodXBkYXRlczogcmVhZG9ubHkgSUFja091dHB1dEhlaWdodFtdKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ2Fjay1kaW1lbnNpb24nLFxuXHRcdFx0dXBkYXRlc1xuXHRcdH0pO1xuXHR9XG5cblx0dXBkYXRlU2Nyb2xsVG9wcyhvdXRwdXRSZXF1ZXN0czogSURpc3BsYXlPdXRwdXRMYXlvdXRVcGRhdGVSZXF1ZXN0W10sIG1hcmt1cFByZXZpZXdzOiB7IGlkOiBzdHJpbmc7IHRvcDogbnVtYmVyIH1bXSkge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpZGdldHMgPSBjb2FsZXNjZShvdXRwdXRSZXF1ZXN0cy5tYXAoKHJlcXVlc3QpOiBJQ29udGVudFdpZGdldFRvcFJlcXVlc3QgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0Q2FjaGUgPSB0aGlzLmluc2V0TWFwcGluZy5nZXQocmVxdWVzdC5vdXRwdXQpO1xuXHRcdFx0aWYgKCFvdXRwdXRDYWNoZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghcmVxdWVzdC5mb3JjZURpc3BsYXkgJiYgIXRoaXMuc2hvdWxkVXBkYXRlSW5zZXQocmVxdWVzdC5jZWxsLCByZXF1ZXN0Lm91dHB1dCwgcmVxdWVzdC5jZWxsVG9wLCByZXF1ZXN0Lm91dHB1dE9mZnNldCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpZCA9IG91dHB1dENhY2hlLm91dHB1dElkO1xuXHRcdFx0b3V0cHV0Q2FjaGUuY2FjaGVkQ3JlYXRpb24uY2VsbFRvcCA9IHJlcXVlc3QuY2VsbFRvcDtcblx0XHRcdG91dHB1dENhY2hlLmNhY2hlZENyZWF0aW9uLm91dHB1dE9mZnNldCA9IHJlcXVlc3Qub3V0cHV0T2Zmc2V0O1xuXHRcdFx0dGhpcy5oaWRkZW5JbnNldE1hcHBpbmcuZGVsZXRlKHJlcXVlc3Qub3V0cHV0KTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y2VsbElkOiByZXF1ZXN0LmNlbGwuaWQsXG5cdFx0XHRcdG91dHB1dElkOiBpZCxcblx0XHRcdFx0Y2VsbFRvcDogcmVxdWVzdC5jZWxsVG9wLFxuXHRcdFx0XHRvdXRwdXRPZmZzZXQ6IHJlcXVlc3Qub3V0cHV0T2Zmc2V0LFxuXHRcdFx0XHRmb3JjZURpc3BsYXk6IHJlcXVlc3QuZm9yY2VEaXNwbGF5LFxuXHRcdFx0fTtcblx0XHR9KSk7XG5cblx0XHRpZiAoIXdpZGdldHMubGVuZ3RoICYmICFtYXJrdXBQcmV2aWV3cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAndmlldy1zY3JvbGwnLFxuXHRcdFx0d2lkZ2V0czogd2lkZ2V0cyxcblx0XHRcdG1hcmt1cENlbGxzOiBtYXJrdXBQcmV2aWV3cyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlTWFya3VwUHJldmlldyhpbml0aWFsaXphdGlvbjogSU1hcmt1cENlbGxJbml0aWFsaXphdGlvbikge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm1hcmt1cFByZXZpZXdNYXBwaW5nLmhhcyhpbml0aWFsaXphdGlvbi5jZWxsSWQpKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdUcnlpbmcgdG8gY3JlYXRlIG1hcmt1cCBwcmV2aWV3IHRoYXQgYWxyZWFkeSBleGlzdHMnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm1hcmt1cFByZXZpZXdNYXBwaW5nLnNldChpbml0aWFsaXphdGlvbi5jZWxsSWQsIGluaXRpYWxpemF0aW9uKTtcblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnY3JlYXRlTWFya3VwQ2VsbCcsXG5cdFx0XHRjZWxsOiBpbml0aWFsaXphdGlvblxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgc2hvd01hcmt1cFByZXZpZXcobmV3Q29udGVudDogSU1hcmt1cENlbGxJbml0aWFsaXphdGlvbikge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5tYXJrdXBQcmV2aWV3TWFwcGluZy5nZXQobmV3Q29udGVudC5jZWxsSWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZU1hcmt1cFByZXZpZXcobmV3Q29udGVudCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2FtZUNvbnRlbnQgPSBuZXdDb250ZW50LmNvbnRlbnQgPT09IGVudHJ5LmNvbnRlbnQ7XG5cdFx0Y29uc3Qgc2FtZU1ldGFkYXRhID0gKGVxdWFscyhuZXdDb250ZW50Lm1ldGFkYXRhLCBlbnRyeS5tZXRhZGF0YSkpO1xuXHRcdGlmICghc2FtZUNvbnRlbnQgfHwgIXNhbWVNZXRhZGF0YSB8fCAhZW50cnkudmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0XHR0eXBlOiAnc2hvd01hcmt1cENlbGwnLFxuXHRcdFx0XHRpZDogbmV3Q29udGVudC5jZWxsSWQsXG5cdFx0XHRcdGhhbmRsZTogbmV3Q29udGVudC5jZWxsSGFuZGxlLFxuXHRcdFx0XHQvLyBJZiB0aGUgY29udGVudCBoYXMgbm90IGNoYW5nZWQsIHdlIHN0aWxsIHdhbnQgdG8gbWFrZSBzdXJlIHRoZVxuXHRcdFx0XHQvLyBwcmV2aWV3IGlzIHZpc2libGUgYnV0IGRvbid0IG5lZWQgdG8gc2VuZCBhbnl0aGluZyBvdmVyXG5cdFx0XHRcdGNvbnRlbnQ6IHNhbWVDb250ZW50ID8gdW5kZWZpbmVkIDogbmV3Q29udGVudC5jb250ZW50LFxuXHRcdFx0XHR0b3A6IG5ld0NvbnRlbnQub2Zmc2V0LFxuXHRcdFx0XHRtZXRhZGF0YTogc2FtZU1ldGFkYXRhID8gdW5kZWZpbmVkIDogbmV3Q29udGVudC5tZXRhZGF0YVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGVudHJ5Lm1ldGFkYXRhID0gbmV3Q29udGVudC5tZXRhZGF0YTtcblx0XHRlbnRyeS5jb250ZW50ID0gbmV3Q29udGVudC5jb250ZW50O1xuXHRcdGVudHJ5Lm9mZnNldCA9IG5ld0NvbnRlbnQub2Zmc2V0O1xuXHRcdGVudHJ5LnZpc2libGUgPSB0cnVlO1xuXHR9XG5cblx0YXN5bmMgaGlkZU1hcmt1cFByZXZpZXdzKGNlbGxJZHM6IHJlYWRvbmx5IHN0cmluZ1tdKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbHNUb0hpZGU6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBjZWxsSWQgb2YgY2VsbElkcykge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLm1hcmt1cFByZXZpZXdNYXBwaW5nLmdldChjZWxsSWQpO1xuXHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdGlmIChlbnRyeS52aXNpYmxlKSB7XG5cdFx0XHRcdFx0Y2VsbHNUb0hpZGUucHVzaChjZWxsSWQpO1xuXHRcdFx0XHRcdGVudHJ5LnZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjZWxsc1RvSGlkZS5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdFx0dHlwZTogJ2hpZGVNYXJrdXBDZWxscycsXG5cdFx0XHRcdGlkczogY2VsbHNUb0hpZGVcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVuaGlkZU1hcmt1cFByZXZpZXdzKGNlbGxJZHM6IHJlYWRvbmx5IHN0cmluZ1tdKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9VbmhpZGU6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBjZWxsSWQgb2YgY2VsbElkcykge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLm1hcmt1cFByZXZpZXdNYXBwaW5nLmdldChjZWxsSWQpO1xuXHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdGlmICghZW50cnkudmlzaWJsZSkge1xuXHRcdFx0XHRcdGVudHJ5LnZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHRcdHRvVW5oaWRlLnB1c2goY2VsbElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgVHJ5aW5nIHRvIHVuaGlkZSBhIHByZXZpZXcgdGhhdCBkb2VzIG5vdCBleGlzdDogJHtjZWxsSWR9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ3VuaGlkZU1hcmt1cENlbGxzJyxcblx0XHRcdGlkczogdG9VbmhpZGUsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBkZWxldGVNYXJrdXBQcmV2aWV3cyhjZWxsSWRzOiByZWFkb25seSBzdHJpbmdbXSkge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgaWQgb2YgY2VsbElkcykge1xuXHRcdFx0aWYgKCF0aGlzLm1hcmt1cFByZXZpZXdNYXBwaW5nLmhhcyhpZCkpIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgVHJ5aW5nIHRvIGRlbGV0ZSBhIHByZXZpZXcgdGhhdCBkb2VzIG5vdCBleGlzdDogJHtpZH1gKTtcblx0XHRcdH1cblx0XHRcdHRoaXMubWFya3VwUHJldmlld01hcHBpbmcuZGVsZXRlKGlkKTtcblx0XHR9XG5cblx0XHRpZiAoY2VsbElkcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdFx0dHlwZTogJ2RlbGV0ZU1hcmt1cENlbGwnLFxuXHRcdFx0XHRpZHM6IGNlbGxJZHNcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1hcmt1cFByZXZpZXdTZWxlY3Rpb25zKHNlbGVjdGVkQ2VsbHNJZHM6IHN0cmluZ1tdKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ3VwZGF0ZVNlbGVjdGVkTWFya3VwQ2VsbHMnLFxuXHRcdFx0c2VsZWN0ZWRDZWxsSWRzOiBzZWxlY3RlZENlbGxzSWRzLmZpbHRlcihpZCA9PiB0aGlzLm1hcmt1cFByZXZpZXdNYXBwaW5nLmhhcyhpZCkpLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZU1hcmt1cChjZWxsczogcmVhZG9ubHkgSU1hcmt1cENlbGxJbml0aWFsaXphdGlvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5pbml0aWFsaXplTWFya3VwUHJvbWlzZT8ucC5jb21wbGV0ZSgpO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IFVVSUQuZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5pbml0aWFsaXplTWFya3VwUHJvbWlzZSA9IHsgcDogbmV3IERlZmVycmVkUHJvbWlzZSgpLCByZXF1ZXN0SWQsIGlzRmlyc3RJbml0OiB0aGlzLmZpcnN0SW5pdCB9O1xuXG5cdFx0dGhpcy5maXJzdEluaXQgPSBmYWxzZTtcblxuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0dGhpcy5tYXJrdXBQcmV2aWV3TWFwcGluZy5zZXQoY2VsbC5jZWxsSWQsIGNlbGwpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdpbml0aWFsaXplTWFya3VwJyxcblx0XHRcdGNlbGxzLFxuXHRcdFx0cmVxdWVzdElkLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6ZU1hcmt1cFByb21pc2UucC5wO1xuXHR9XG5cblx0LyoqXG5cdCAqIFZhbGlkYXRlIGlmIGNhY2hlZCBpbnNldCBpcyBvdXQgb2YgZGF0ZSBhbmQgcmVxdWlyZSBhIHJlcmVuZGVyXG5cdCAqIE5vdGUgdGhhdCBpdCBkb2Vzbid0IGFjY291bnQgZm9yIG91dHB1dCBjb250ZW50IGNoYW5nZS5cblx0ICovXG5cdHByaXZhdGUgX2NhY2hlZEluc2V0RXF1YWwoY2FjaGVkSW5zZXQ6IElDYWNoZWRJbnNldDxUPiwgY29udGVudDogSUluc2V0UmVuZGVyT3V0cHV0KSB7XG5cdFx0aWYgKGNvbnRlbnQudHlwZSA9PT0gUmVuZGVyT3V0cHV0VHlwZS5FeHRlbnNpb24pIHtcblx0XHRcdC8vIFVzZSBhIG5ldyByZW5kZXJlclxuXHRcdFx0cmV0dXJuIGNhY2hlZEluc2V0LnJlbmRlcmVyPy5pZCA9PT0gY29udGVudC5yZW5kZXJlci5pZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVGhlIG5ldyByZW5kZXJlciBpcyB0aGUgZGVmYXVsdCBIVE1MIHJlbmRlcmVyXG5cdFx0XHRyZXR1cm4gY2FjaGVkSW5zZXQuY2FjaGVkQ3JlYXRpb24udHlwZSA9PT0gJ2h0bWwnO1xuXHRcdH1cblx0fVxuXG5cdHJlcXVlc3RDcmVhdGVPdXRwdXRXaGVuV2Vidmlld0lkbGUoY2VsbEluZm86IFQsIGNvbnRlbnQ6IElJbnNldFJlbmRlck91dHB1dCwgY2VsbFRvcDogbnVtYmVyLCBvZmZzZXQ6IG51bWJlcikge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmluc2V0TWFwcGluZy5oYXMoY29udGVudC5zb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucGVuZGluZ1dlYnZpZXdJZGxlQ3JlYXRpb25SZXF1ZXN0Lmhhcyhjb250ZW50LnNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5wZW5kaW5nV2Vidmlld0lkbGVJbnNldE1hcHBpbmcuaGFzKGNvbnRlbnQuc291cmNlKSkge1xuXHRcdFx0Ly8gaGFuZGxlZCBpbiByZW5kZXJlciBwcm9jZXNzLCB3YWl0aW5nIGZvciB3ZWJ2aWV3IHRvIHByb2Nlc3MgaXQgd2hlbiBpZGxlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nV2Vidmlld0lkbGVDcmVhdGlvblJlcXVlc3Quc2V0KGNvbnRlbnQuc291cmNlLCBydW5XaGVuR2xvYmFsSWRsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCB7IG1lc3NhZ2UsIHJlbmRlcmVyLCB0cmFuc2ZlcjogdHJhbnNmZXJhYmxlIH0gPSB0aGlzLl9jcmVhdGVPdXRwdXRDcmVhdGlvbk1lc3NhZ2UoY2VsbEluZm8sIGNvbnRlbnQsIGNlbGxUb3AsIG9mZnNldCwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2VidmlldyhtZXNzYWdlLCB0cmFuc2ZlcmFibGUpO1xuXHRcdFx0dGhpcy5wZW5kaW5nV2Vidmlld0lkbGVJbnNldE1hcHBpbmcuc2V0KGNvbnRlbnQuc291cmNlLCB7IG91dHB1dElkOiBtZXNzYWdlLm91dHB1dElkLCB2ZXJzaW9uSWQ6IGNvbnRlbnQuc291cmNlLm1vZGVsLnZlcnNpb25JZCwgY2VsbEluZm86IGNlbGxJbmZvLCByZW5kZXJlciwgY2FjaGVkQ3JlYXRpb246IG1lc3NhZ2UgfSk7XG5cdFx0XHR0aGlzLnJldmVyc2VkUGVuZGluZ1dlYnZpZXdJZGxlSW5zZXRNYXBwaW5nLnNldChtZXNzYWdlLm91dHB1dElkLCBjb250ZW50LnNvdXJjZSk7XG5cdFx0XHR0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUNyZWF0aW9uUmVxdWVzdC5kZWxldGUoY29udGVudC5zb3VyY2UpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGNyZWF0ZU91dHB1dChjZWxsSW5mbzogVCwgY29udGVudDogSUluc2V0UmVuZGVyT3V0cHV0LCBjZWxsVG9wOiBudW1iZXIsIG9mZnNldDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVkSW5zZXQgPSB0aGlzLmluc2V0TWFwcGluZy5nZXQoY29udGVudC5zb3VyY2UpO1xuXG5cdFx0Ly8gd2Ugbm93IHJlcXVlc3QgdG8gcmVuZGVyIHRoZSBvdXRwdXQgaW1tZWRpYXRlbHksIHNvIHdlIGNhbiByZW1vdmUgdGhlIHBlbmRpbmcgcmVxdWVzdFxuXHRcdC8vIGRpc3Bvc2UgdGhlIHBlbmRpbmcgcmVxdWVzdCBpbiByZW5kZXJlciBwcm9jZXNzIGlmIGl0IGV4aXN0c1xuXHRcdHRoaXMucGVuZGluZ1dlYnZpZXdJZGxlQ3JlYXRpb25SZXF1ZXN0LmdldChjb250ZW50LnNvdXJjZSk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUNyZWF0aW9uUmVxdWVzdC5kZWxldGUoY29udGVudC5zb3VyY2UpO1xuXG5cdFx0Ly8gaWYgcmVxdWVzdCBoYXMgYWxyZWFkeSBiZWVuIHNlbnQgb3V0LCB3ZSB0aGVuIHJlbW92ZSBpdCBmcm9tIHRoZSBwZW5kaW5nIG1hcHBpbmdcblx0XHR0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUluc2V0TWFwcGluZy5kZWxldGUoY29udGVudC5zb3VyY2UpO1xuXHRcdGlmIChjYWNoZWRJbnNldCkge1xuXHRcdFx0dGhpcy5yZXZlcnNlZFBlbmRpbmdXZWJ2aWV3SWRsZUluc2V0TWFwcGluZy5kZWxldGUoY2FjaGVkSW5zZXQub3V0cHV0SWQpO1xuXHRcdH1cblxuXHRcdGlmIChjYWNoZWRJbnNldCAmJiB0aGlzLl9jYWNoZWRJbnNldEVxdWFsKGNhY2hlZEluc2V0LCBjb250ZW50KSkge1xuXHRcdFx0dGhpcy5oaWRkZW5JbnNldE1hcHBpbmcuZGVsZXRlKGNvbnRlbnQuc291cmNlKTtcblx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdFx0dHlwZTogJ3Nob3dPdXRwdXQnLFxuXHRcdFx0XHRjZWxsSWQ6IGNhY2hlZEluc2V0LmNlbGxJbmZvLmNlbGxJZCxcblx0XHRcdFx0b3V0cHV0SWQ6IGNhY2hlZEluc2V0Lm91dHB1dElkLFxuXHRcdFx0XHRjZWxsVG9wOiBjZWxsVG9wLFxuXHRcdFx0XHRvdXRwdXRPZmZzZXQ6IG9mZnNldFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gY3JlYXRlIG5ldyBvdXRwdXRcblx0XHRjb25zdCB7IG1lc3NhZ2UsIHJlbmRlcmVyLCB0cmFuc2ZlcjogdHJhbnNmZXJhYmxlIH0gPSB0aGlzLl9jcmVhdGVPdXRwdXRDcmVhdGlvbk1lc3NhZ2UoY2VsbEluZm8sIGNvbnRlbnQsIGNlbGxUb3AsIG9mZnNldCwgZmFsc2UsIGZhbHNlKTtcblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2VidmlldyhtZXNzYWdlLCB0cmFuc2ZlcmFibGUpO1xuXHRcdHRoaXMuaW5zZXRNYXBwaW5nLnNldChjb250ZW50LnNvdXJjZSwgeyBvdXRwdXRJZDogbWVzc2FnZS5vdXRwdXRJZCwgdmVyc2lvbklkOiBjb250ZW50LnNvdXJjZS5tb2RlbC52ZXJzaW9uSWQsIGNlbGxJbmZvOiBjZWxsSW5mbywgcmVuZGVyZXIsIGNhY2hlZENyZWF0aW9uOiBtZXNzYWdlIH0pO1xuXHRcdHRoaXMuaGlkZGVuSW5zZXRNYXBwaW5nLmRlbGV0ZShjb250ZW50LnNvdXJjZSk7XG5cdFx0dGhpcy5yZXZlcnNlZEluc2V0TWFwcGluZy5zZXQobWVzc2FnZS5vdXRwdXRJZCwgY29udGVudC5zb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVNZXRhZGF0YShvdXRwdXQ6IElDZWxsT3V0cHV0LCBtaW1lVHlwZTogc3RyaW5nKSB7XG5cdFx0aWYgKG1pbWVUeXBlLnN0YXJ0c1dpdGgoJ2ltYWdlJykpIHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IG91dHB1dC5vdXRwdXRzLmZpbmQob3V0ID0+IG91dC5taW1lID09PSAndGV4dC9wbGFpbicpPy5kYXRhLmJ1ZmZlcjtcblx0XHRcdGlmIChidWZmZXI/Lmxlbmd0aCAmJiBidWZmZXI/Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgYWx0VGV4dCA9IG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShidWZmZXIpO1xuXHRcdFx0XHRyZXR1cm4geyAuLi5vdXRwdXQubWV0YWRhdGEsIHZzY29kZV9hbHRUZXh0OiBhbHRUZXh0IH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQubWV0YWRhdGE7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVPdXRwdXRDcmVhdGlvbk1lc3NhZ2UoY2VsbEluZm86IFQsIGNvbnRlbnQ6IElJbnNldFJlbmRlck91dHB1dCwgY2VsbFRvcDogbnVtYmVyLCBvZmZzZXQ6IG51bWJlciwgY3JlYXRlT25JZGxlOiBib29sZWFuLCBpbml0aWFsbHlIaWRkZW46IGJvb2xlYW4pOiB7IHJlYWRvbmx5IG1lc3NhZ2U6IElDcmVhdGlvblJlcXVlc3RNZXNzYWdlOyByZWFkb25seSByZW5kZXJlcjogSU5vdGVib29rUmVuZGVyZXJJbmZvIHwgdW5kZWZpbmVkOyB0cmFuc2ZlcjogcmVhZG9ubHkgQXJyYXlCdWZmZXJbXSB9IHtcblx0XHRjb25zdCBtZXNzYWdlQmFzZSA9IHtcblx0XHRcdHR5cGU6ICdodG1sJyxcblx0XHRcdGV4ZWN1dGlvbklkOiBjZWxsSW5mby5leGVjdXRpb25JZCxcblx0XHRcdGNlbGxJZDogY2VsbEluZm8uY2VsbElkLFxuXHRcdFx0Y2VsbFRvcDogY2VsbFRvcCxcblx0XHRcdG91dHB1dE9mZnNldDogb2Zmc2V0LFxuXHRcdFx0bGVmdDogMCxcblx0XHRcdHJlcXVpcmVkUHJlbG9hZHM6IFtdLFxuXHRcdFx0Y3JlYXRlT25JZGxlOiBjcmVhdGVPbklkbGVcblx0XHR9IGFzIGNvbnN0O1xuXG5cdFx0Y29uc3QgdHJhbnNmZXI6IEFycmF5QnVmZmVyW10gPSBbXTtcblxuXHRcdGxldCBtZXNzYWdlOiBJQ3JlYXRpb25SZXF1ZXN0TWVzc2FnZTtcblx0XHRsZXQgcmVuZGVyZXI6IElOb3RlYm9va1JlbmRlcmVySW5mbyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY29udGVudC50eXBlID09PSBSZW5kZXJPdXRwdXRUeXBlLkV4dGVuc2lvbikge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gY29udGVudC5zb3VyY2UubW9kZWw7XG5cdFx0XHRyZW5kZXJlciA9IGNvbnRlbnQucmVuZGVyZXI7XG5cdFx0XHRjb25zdCBmaXJzdCA9IG91dHB1dC5vdXRwdXRzLmZpbmQob3AgPT4gb3AubWltZSA9PT0gY29udGVudC5taW1lVHlwZSkhO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLmNyZWF0ZU1ldGFkYXRhKG91dHB1dCwgY29udGVudC5taW1lVHlwZSk7XG5cdFx0XHRjb25zdCB2YWx1ZUJ5dGVzID0gY29weUJ1ZmZlcklmTmVlZGVkKGZpcnN0LmRhdGEuYnVmZmVyLCB0cmFuc2Zlcik7XG5cdFx0XHRtZXNzYWdlID0ge1xuXHRcdFx0XHQuLi5tZXNzYWdlQmFzZSxcblx0XHRcdFx0b3V0cHV0SWQ6IG91dHB1dC5vdXRwdXRJZCxcblx0XHRcdFx0cmVuZGVyZXJJZDogY29udGVudC5yZW5kZXJlci5pZCxcblx0XHRcdFx0Y29udGVudDoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbmRlck91dHB1dFR5cGUuRXh0ZW5zaW9uLFxuXHRcdFx0XHRcdG91dHB1dElkOiBvdXRwdXQub3V0cHV0SWQsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IG1ldGFkYXRhLFxuXHRcdFx0XHRcdG91dHB1dDoge1xuXHRcdFx0XHRcdFx0bWltZTogZmlyc3QubWltZSxcblx0XHRcdFx0XHRcdHZhbHVlQnl0ZXMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhbGxPdXRwdXRzOiBvdXRwdXQub3V0cHV0cy5tYXAob3V0cHV0ID0+ICh7IG1pbWU6IG91dHB1dC5taW1lIH0pKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5pdGlhbGx5SGlkZGVuOiBpbml0aWFsbHlIaWRkZW5cblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lc3NhZ2UgPSB7XG5cdFx0XHRcdC4uLm1lc3NhZ2VCYXNlLFxuXHRcdFx0XHRvdXRwdXRJZDogVVVJRC5nZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0Y29udGVudDoge1xuXHRcdFx0XHRcdHR5cGU6IGNvbnRlbnQudHlwZSxcblx0XHRcdFx0XHRodG1sQ29udGVudDogY29udGVudC5odG1sQ29udGVudCxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5pdGlhbGx5SGlkZGVuOiBpbml0aWFsbHlIaWRkZW5cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRyZW5kZXJlcixcblx0XHRcdHRyYW5zZmVyLFxuXHRcdH07XG5cdH1cblxuXHR1cGRhdGVPdXRwdXQoY2VsbEluZm86IFQsIGNvbnRlbnQ6IElJbnNldFJlbmRlck91dHB1dCwgY2VsbFRvcDogbnVtYmVyLCBvZmZzZXQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5pbnNldE1hcHBpbmcuaGFzKGNvbnRlbnQuc291cmNlKSkge1xuXHRcdFx0dGhpcy5jcmVhdGVPdXRwdXQoY2VsbEluZm8sIGNvbnRlbnQsIGNlbGxUb3AsIG9mZnNldCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3V0cHV0Q2FjaGUgPSB0aGlzLmluc2V0TWFwcGluZy5nZXQoY29udGVudC5zb3VyY2UpITtcblxuXHRcdGlmIChvdXRwdXRDYWNoZS52ZXJzaW9uSWQgPT09IGNvbnRlbnQuc291cmNlLm1vZGVsLnZlcnNpb25JZCkge1xuXHRcdFx0Ly8gYWxyZWFkeSBzZW50IHRoaXMgb3V0cHV0IHZlcnNpb24gdG8gdGhlIHJlbmRlcmVyXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5oaWRkZW5JbnNldE1hcHBpbmcuZGVsZXRlKGNvbnRlbnQuc291cmNlKTtcblx0XHRsZXQgdXBkYXRlZENvbnRlbnQ6IElDcmVhdGlvbkNvbnRlbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB0cmFuc2ZlcjogQXJyYXlCdWZmZXJbXSA9IFtdO1xuXHRcdGlmIChjb250ZW50LnR5cGUgPT09IFJlbmRlck91dHB1dFR5cGUuRXh0ZW5zaW9uKSB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBjb250ZW50LnNvdXJjZS5tb2RlbDtcblx0XHRcdGNvbnN0IGZpcnN0QnVmZmVyID0gb3V0cHV0Lm91dHB1dHMuZmluZChvcCA9PiBvcC5taW1lID09PSBjb250ZW50Lm1pbWVUeXBlKSE7XG5cdFx0XHRjb25zdCBhcHBlbmVkZWREYXRhID0gb3V0cHV0LmFwcGVuZGVkU2luY2VWZXJzaW9uKG91dHB1dENhY2hlLnZlcnNpb25JZCwgY29udGVudC5taW1lVHlwZSk7XG5cdFx0XHRjb25zdCBhcHBlbmRlZCA9IGFwcGVuZWRlZERhdGEgPyB7IHZhbHVlQnl0ZXM6IGFwcGVuZWRlZERhdGEuYnVmZmVyLCBwcmV2aW91c1ZlcnNpb246IG91dHB1dENhY2hlLnZlcnNpb25JZCB9IDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCB2YWx1ZUJ5dGVzID0gY29weUJ1ZmZlcklmTmVlZGVkKGZpcnN0QnVmZmVyLmRhdGEuYnVmZmVyLCB0cmFuc2Zlcik7XG5cdFx0XHR1cGRhdGVkQ29udGVudCA9IHtcblx0XHRcdFx0dHlwZTogUmVuZGVyT3V0cHV0VHlwZS5FeHRlbnNpb24sXG5cdFx0XHRcdG91dHB1dElkOiBvdXRwdXRDYWNoZS5vdXRwdXRJZCxcblx0XHRcdFx0bWV0YWRhdGE6IG91dHB1dC5tZXRhZGF0YSxcblx0XHRcdFx0b3V0cHV0OiB7XG5cdFx0XHRcdFx0bWltZTogY29udGVudC5taW1lVHlwZSxcblx0XHRcdFx0XHR2YWx1ZUJ5dGVzLFxuXHRcdFx0XHRcdGFwcGVuZGVkOiBhcHBlbmRlZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhbGxPdXRwdXRzOiBvdXRwdXQub3V0cHV0cy5tYXAob3V0cHV0ID0+ICh7IG1pbWU6IG91dHB1dC5taW1lIH0pKVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnc2hvd091dHB1dCcsXG5cdFx0XHRjZWxsSWQ6IG91dHB1dENhY2hlLmNlbGxJbmZvLmNlbGxJZCxcblx0XHRcdG91dHB1dElkOiBvdXRwdXRDYWNoZS5vdXRwdXRJZCxcblx0XHRcdGNlbGxUb3A6IGNlbGxUb3AsXG5cdFx0XHRvdXRwdXRPZmZzZXQ6IG9mZnNldCxcblx0XHRcdGNvbnRlbnQ6IHVwZGF0ZWRDb250ZW50XG5cdFx0fSwgdHJhbnNmZXIpO1xuXG5cdFx0b3V0cHV0Q2FjaGUudmVyc2lvbklkID0gY29udGVudC5zb3VyY2UubW9kZWwudmVyc2lvbklkO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGFzeW5jIGNvcHlJbWFnZShvdXRwdXQ6IElDZWxsT3V0cHV0Vmlld01vZGVsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ29sbGVjdCB0ZXh0IGFsdGVybmF0ZXMgZnJvbSB0aGUgc2FtZSBjZWxsIG91dHB1dFxuXHRcdGNvbnN0IHRleHRBbHRlcm5hdGVzOiB7IG1pbWVUeXBlOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZyB9W10gPSBbXTtcblx0XHRjb25zdCBjZWxsT3V0cHV0ID0gb3V0cHV0Lm1vZGVsO1xuXG5cdFx0Zm9yIChjb25zdCBvdXRwdXRJdGVtIG9mIGNlbGxPdXRwdXQub3V0cHV0cykge1xuXHRcdFx0aWYgKFRFWFRfQkFTRURfTUlNRVRZUEVTLmluY2x1ZGVzKG91dHB1dEl0ZW0ubWltZSkpIHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGlzVGV4dFN0cmVhbU1pbWUob3V0cHV0SXRlbS5taW1lKSA/XG5cdFx0XHRcdFx0Z2V0T3V0cHV0U3RyZWFtVGV4dChvdXRwdXQpLnRleHQgOlxuXHRcdFx0XHRcdGdldE91dHB1dFRleHQob3V0cHV0SXRlbS5taW1lLCBvdXRwdXRJdGVtKTtcblx0XHRcdFx0dGV4dEFsdGVybmF0ZXMucHVzaCh7XG5cdFx0XHRcdFx0bWltZVR5cGU6IG91dHB1dEl0ZW0ubWltZSxcblx0XHRcdFx0XHRjb250ZW50OiB0ZXh0XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdjb3B5SW1hZ2UnLFxuXHRcdFx0b3V0cHV0SWQ6IG91dHB1dC5tb2RlbC5vdXRwdXRJZCxcblx0XHRcdGFsdE91dHB1dElkOiBvdXRwdXQubW9kZWwuYWx0ZXJuYXRpdmVPdXRwdXRJZCxcblx0XHRcdHRleHRBbHRlcm5hdGVzOiB0ZXh0QWx0ZXJuYXRlcy5sZW5ndGggPiAwID8gdGV4dEFsdGVybmF0ZXMgOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHJlbW92ZUluc2V0cyhvdXRwdXRzOiByZWFkb25seSBJQ2VsbE91dHB1dFZpZXdNb2RlbFtdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBvdXRwdXQgb2Ygb3V0cHV0cykge1xuXHRcdFx0Y29uc3Qgb3V0cHV0Q2FjaGUgPSB0aGlzLmluc2V0TWFwcGluZy5nZXQob3V0cHV0KTtcblx0XHRcdGlmICghb3V0cHV0Q2FjaGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGlkID0gb3V0cHV0Q2FjaGUub3V0cHV0SWQ7XG5cblx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdFx0dHlwZTogJ2NsZWFyT3V0cHV0Jyxcblx0XHRcdFx0cmVuZGVyZXJJZDogb3V0cHV0Q2FjaGUuY2FjaGVkQ3JlYXRpb24ucmVuZGVyZXJJZCxcblx0XHRcdFx0Y2VsbFVyaTogb3V0cHV0Q2FjaGUuY2VsbEluZm8uY2VsbFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRvdXRwdXRJZDogaWQsXG5cdFx0XHRcdGNlbGxJZDogb3V0cHV0Q2FjaGUuY2VsbEluZm8uY2VsbElkXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuaW5zZXRNYXBwaW5nLmRlbGV0ZShvdXRwdXQpO1xuXHRcdFx0dGhpcy5wZW5kaW5nV2Vidmlld0lkbGVDcmVhdGlvblJlcXVlc3QuZ2V0KG91dHB1dCk/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMucGVuZGluZ1dlYnZpZXdJZGxlQ3JlYXRpb25SZXF1ZXN0LmRlbGV0ZShvdXRwdXQpO1xuXHRcdFx0dGhpcy5wZW5kaW5nV2Vidmlld0lkbGVJbnNldE1hcHBpbmcuZGVsZXRlKG91dHB1dCk7XG5cdFx0XHR0aGlzLnJldmVyc2VkUGVuZGluZ1dlYnZpZXdJZGxlSW5zZXRNYXBwaW5nLmRlbGV0ZShpZCk7XG5cdFx0XHR0aGlzLnJldmVyc2VkSW5zZXRNYXBwaW5nLmRlbGV0ZShpZCk7XG5cdFx0fVxuXHR9XG5cblx0aGlkZUluc2V0KG91dHB1dDogSUNlbGxPdXRwdXRWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvdXRwdXRDYWNoZSA9IHRoaXMuaW5zZXRNYXBwaW5nLmdldChvdXRwdXQpO1xuXHRcdGlmICghb3V0cHV0Q2FjaGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmhpZGRlbkluc2V0TWFwcGluZy5hZGQob3V0cHV0KTtcblxuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdoaWRlT3V0cHV0Jyxcblx0XHRcdG91dHB1dElkOiBvdXRwdXRDYWNoZS5vdXRwdXRJZCxcblx0XHRcdGNlbGxJZDogb3V0cHV0Q2FjaGUuY2VsbEluZm8uY2VsbElkLFxuXHRcdH0pO1xuXHR9XG5cblx0Zm9jdXNXZWJ2aWV3KCkge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMud2Vidmlldz8uZm9jdXMoKTtcblx0fVxuXG5cdHNlbGVjdE91dHB1dENvbnRlbnRzKGNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG91dHB1dCA9IGNlbGwub3V0cHV0c1ZpZXdNb2RlbHMuZmluZChvID0+IG8ubW9kZWwub3V0cHV0SWQgPT09IGNlbGwuZm9jdXNlZE91dHB1dElkKTtcblx0XHRjb25zdCBvdXRwdXRJZCA9IG91dHB1dCA/IHRoaXMuaW5zZXRNYXBwaW5nLmdldChvdXRwdXQpPy5vdXRwdXRJZCA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnc2VsZWN0LW91dHB1dC1jb250ZW50cycsXG5cdFx0XHRjZWxsT3JPdXRwdXRJZDogb3V0cHV0SWQgfHwgY2VsbC5pZFxuXHRcdH0pO1xuXHR9XG5cblx0c2VsZWN0SW5wdXRDb250ZW50cyhjZWxsOiBJQ2VsbFZpZXdNb2RlbCkge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBvdXRwdXQgPSBjZWxsLm91dHB1dHNWaWV3TW9kZWxzLmZpbmQobyA9PiBvLm1vZGVsLm91dHB1dElkID09PSBjZWxsLmZvY3VzZWRPdXRwdXRJZCk7XG5cdFx0Y29uc3Qgb3V0cHV0SWQgPSBvdXRwdXQgPyB0aGlzLmluc2V0TWFwcGluZy5nZXQob3V0cHV0KT8ub3V0cHV0SWQgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ3NlbGVjdC1pbnB1dC1jb250ZW50cycsXG5cdFx0XHRjZWxsT3JPdXRwdXRJZDogb3V0cHV0SWQgfHwgY2VsbC5pZFxuXHRcdH0pO1xuXHR9XG5cblx0Zm9jdXNPdXRwdXQoY2VsbE9yT3V0cHV0SWQ6IHN0cmluZywgYWx0ZXJuYXRlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdmlld0ZvY3VzZWQ6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXZpZXdGb2N1c2VkKSB7XG5cdFx0XHR0aGlzLndlYnZpZXc/LmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ2ZvY3VzLW91dHB1dCcsXG5cdFx0XHRjZWxsT3JPdXRwdXRJZDogY2VsbE9yT3V0cHV0SWQsXG5cdFx0XHRhbHRlcm5hdGVJZDogYWx0ZXJuYXRlSWRcblx0XHR9KTtcblx0fVxuXG5cdGJsdXJPdXRwdXQoKSB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ2JsdXItb3V0cHV0J1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZmluZChxdWVyeTogc3RyaW5nLCBvcHRpb25zOiB7IHdob2xlV29yZD86IGJvb2xlYW47IGNhc2VTZW5zaXRpdmU/OiBib29sZWFuOyBpbmNsdWRlTWFya3VwOiBib29sZWFuOyBpbmNsdWRlT3V0cHV0OiBib29sZWFuOyBzaG91bGRHZXRTZWFyY2hQcmV2aWV3SW5mbzogYm9vbGVhbjsgb3duZXJJRDogc3RyaW5nOyBmaW5kSWRzOiBzdHJpbmdbXSB9KTogUHJvbWlzZTxJRmluZE1hdGNoW10+IHtcblx0XHRpZiAocXVlcnkgPT09ICcnKSB7XG5cdFx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHRcdHR5cGU6ICdmaW5kU3RvcCcsXG5cdFx0XHRcdG93bmVySUQ6IG9wdGlvbnMub3duZXJJRFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcCA9IG5ldyBQcm9taXNlPElGaW5kTWF0Y2hbXT4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBzdWIgPSB0aGlzLndlYnZpZXc/Lm9uTWVzc2FnZShlID0+IHtcblx0XHRcdFx0aWYgKGUubWVzc2FnZS50eXBlID09PSAnZGlkRmluZCcpIHtcblx0XHRcdFx0XHRyZXNvbHZlKGUubWVzc2FnZS5tYXRjaGVzKTtcblx0XHRcdFx0XHRzdWI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnZmluZCcsXG5cdFx0XHRxdWVyeTogcXVlcnksXG5cdFx0XHRvcHRpb25zXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXQgPSBhd2FpdCBwO1xuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRmaW5kU3RvcChvd25lcklEOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnZmluZFN0b3AnLFxuXHRcdFx0b3duZXJJRFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZmluZEhpZ2hsaWdodEN1cnJlbnQoaW5kZXg6IG51bWJlciwgb3duZXJJRDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCBwID0gbmV3IFByb21pc2U8bnVtYmVyPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IHN1YiA9IHRoaXMud2Vidmlldz8ub25NZXNzYWdlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5tZXNzYWdlLnR5cGUgPT09ICdkaWRGaW5kSGlnaGxpZ2h0Q3VycmVudCcpIHtcblx0XHRcdFx0XHRyZXNvbHZlKGUubWVzc2FnZS5vZmZzZXQpO1xuXHRcdFx0XHRcdHN1Yj8uZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICdmaW5kSGlnaGxpZ2h0Q3VycmVudCcsXG5cdFx0XHRpbmRleCxcblx0XHRcdG93bmVySURcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJldCA9IGF3YWl0IHA7XG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdGFzeW5jIGZpbmRVbkhpZ2hsaWdodEN1cnJlbnQoaW5kZXg6IG51bWJlciwgb3duZXJJRDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ2ZpbmRVbkhpZ2hsaWdodEN1cnJlbnQnLFxuXHRcdFx0aW5kZXgsXG5cdFx0XHRvd25lcklEXG5cdFx0fSk7XG5cdH1cblxuXG5cdGRlbHRhQ2VsbE91dHB1dENvbnRhaW5lckNsYXNzTmFtZXMoY2VsbElkOiBzdHJpbmcsIGFkZGVkOiBzdHJpbmdbXSwgcmVtb3ZlZDogc3RyaW5nW10pIHtcblx0XHR0aGlzLl9zZW5kTWVzc2FnZVRvV2Vidmlldyh7XG5cdFx0XHR0eXBlOiAnZGVjb3JhdGlvbnMnLFxuXHRcdFx0Y2VsbElkLFxuXHRcdFx0YWRkZWRDbGFzc05hbWVzOiBhZGRlZCxcblx0XHRcdHJlbW92ZWRDbGFzc05hbWVzOiByZW1vdmVkXG5cdFx0fSk7XG5cdH1cblxuXHRkZWx0YU1hcmt1cFByZXZpZXdDbGFzc05hbWVzKGNlbGxJZDogc3RyaW5nLCBhZGRlZDogc3RyaW5nW10sIHJlbW92ZWQ6IHN0cmluZ1tdKSB7XG5cdFx0aWYgKHRoaXMubWFya3VwUHJldmlld01hcHBpbmcuZ2V0KGNlbGxJZCkpIHtcblx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdFx0dHlwZTogJ21hcmt1cERlY29yYXRpb25zJyxcblx0XHRcdFx0Y2VsbElkLFxuXHRcdFx0XHRhZGRlZENsYXNzTmFtZXM6IGFkZGVkLFxuXHRcdFx0XHRyZW1vdmVkQ2xhc3NOYW1lczogcmVtb3ZlZFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlT3V0cHV0UmVuZGVyZXJzKCkge1xuXHRcdGlmICghdGhpcy53ZWJ2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVuZGVyZXJzRGF0YSA9IHRoaXMuZ2V0UmVuZGVyZXJEYXRhKCk7XG5cdFx0dGhpcy5sb2NhbFJlc291cmNlUm9vdHNDYWNoZSA9IHRoaXMuX2dldFJlc291cmNlUm9vdHNDYWNoZSgpO1xuXHRcdGNvbnN0IG1peGVkUmVzb3VyY2VSb290cyA9IFtcblx0XHRcdC4uLih0aGlzLmxvY2FsUmVzb3VyY2VSb290c0NhY2hlIHx8IFtdKSxcblx0XHRcdC4uLih0aGlzLl9jdXJyZW50S2VybmVsID8gW3RoaXMuX2N1cnJlbnRLZXJuZWwubG9jYWxSZXNvdXJjZVJvb3RdIDogW10pLFxuXHRcdF07XG5cblx0XHR0aGlzLndlYnZpZXcubG9jYWxSZXNvdXJjZXNSb290ID0gbWl4ZWRSZXNvdXJjZVJvb3RzO1xuXHRcdHRoaXMuX3NlbmRNZXNzYWdlVG9XZWJ2aWV3KHtcblx0XHRcdHR5cGU6ICd1cGRhdGVSZW5kZXJlcnMnLFxuXHRcdFx0cmVuZGVyZXJEYXRhOiByZW5kZXJlcnNEYXRhXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVLZXJuZWxQcmVsb2FkcyhrZXJuZWw6IElOb3RlYm9va0tlcm5lbCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCB8fCBrZXJuZWwgPT09IHRoaXMuX2N1cnJlbnRLZXJuZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c0tlcm5lbCA9IHRoaXMuX2N1cnJlbnRLZXJuZWw7XG5cdFx0dGhpcy5fY3VycmVudEtlcm5lbCA9IGtlcm5lbDtcblxuXHRcdGlmIChwcmV2aW91c0tlcm5lbCAmJiBwcmV2aW91c0tlcm5lbC5wcmVsb2FkVXJpcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLndlYnZpZXc/LnJlbG9hZCgpOyAvLyBwcmVsb2FkcyB3aWxsIGJlIHJlc3RvcmVkIGFmdGVyIHJlbG9hZFxuXHRcdH0gZWxzZSBpZiAoa2VybmVsKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVQcmVsb2Fkc0Zyb21LZXJuZWwoa2VybmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVQcmVsb2Fkc0Zyb21LZXJuZWwoa2VybmVsOiBJTm90ZWJvb2tLZXJuZWwpIHtcblx0XHRjb25zdCByZXNvdXJjZXM6IElDb250cm9sbGVyUHJlbG9hZFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBwcmVsb2FkIG9mIGtlcm5lbC5wcmVsb2FkVXJpcykge1xuXHRcdFx0Y29uc3QgdXJpID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCAmJiAocHJlbG9hZC5zY2hlbWUgPT09ICdodHRwJyB8fCBwcmVsb2FkLnNjaGVtZSA9PT0gJ2h0dHBzJylcblx0XHRcdFx0PyBwcmVsb2FkIDogdGhpcy5hc1dlYnZpZXdVcmkocHJlbG9hZCwgdW5kZWZpbmVkKTtcblxuXHRcdFx0aWYgKCF0aGlzLl9wcmVsb2Fkc0NhY2hlLmhhcyh1cmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0cmVzb3VyY2VzLnB1c2goeyB1cmk6IHVyaS50b1N0cmluZygpLCBvcmlnaW5hbFVyaTogcHJlbG9hZC50b1N0cmluZygpIH0pO1xuXHRcdFx0XHR0aGlzLl9wcmVsb2Fkc0NhY2hlLmFkZCh1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXNvdXJjZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlUHJlbG9hZHMocmVzb3VyY2VzKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVByZWxvYWRzKHJlc291cmNlczogSUNvbnRyb2xsZXJQcmVsb2FkW10pIHtcblx0XHRpZiAoIXRoaXMud2Vidmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1peGVkUmVzb3VyY2VSb290cyA9IFtcblx0XHRcdC4uLih0aGlzLmxvY2FsUmVzb3VyY2VSb290c0NhY2hlIHx8IFtdKSxcblx0XHRcdC4uLih0aGlzLl9jdXJyZW50S2VybmVsID8gW3RoaXMuX2N1cnJlbnRLZXJuZWwubG9jYWxSZXNvdXJjZVJvb3RdIDogW10pLFxuXHRcdF07XG5cblx0XHR0aGlzLndlYnZpZXcubG9jYWxSZXNvdXJjZXNSb290ID0gbWl4ZWRSZXNvdXJjZVJvb3RzO1xuXG5cdFx0dGhpcy5fc2VuZE1lc3NhZ2VUb1dlYnZpZXcoe1xuXHRcdFx0dHlwZTogJ3ByZWxvYWQnLFxuXHRcdFx0cmVzb3VyY2VzOiByZXNvdXJjZXMsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kTWVzc2FnZVRvV2VidmlldyhtZXNzYWdlOiBUb1dlYnZpZXdNZXNzYWdlLCB0cmFuc2Zlcj86IHJlYWRvbmx5IEFycmF5QnVmZmVyW10pIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLndlYnZpZXc/LnBvc3RNZXNzYWdlKG1lc3NhZ2UsIHRyYW5zZmVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMud2Vidmlldz8uZGlzcG9zZSgpO1xuXHRcdHRoaXMud2VidmlldyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLm5vdGVib29rRWRpdG9yID0gbnVsbCE7XG5cdFx0dGhpcy5pbnNldE1hcHBpbmcuY2xlYXIoKTtcblx0XHR0aGlzLnBlbmRpbmdXZWJ2aWV3SWRsZUNyZWF0aW9uUmVxdWVzdC5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjb3B5QnVmZmVySWZOZWVkZWQoYnVmZmVyOiBVaW50OEFycmF5LCB0cmFuc2ZlcjogQXJyYXlCdWZmZXJbXSk6IFVpbnQ4QXJyYXkge1xuXHRpZiAoYnVmZmVyLmJ5dGVMZW5ndGggPT09IGJ1ZmZlci5idWZmZXIuYnl0ZUxlbmd0aCkge1xuXHRcdC8vIE5vIGNvcHkgbmVlZGVkIGJ1dCB3ZSBjYW4ndCB0cmFuc2ZlciBlaXRoZXJcblx0XHRyZXR1cm4gYnVmZmVyO1xuXHR9IGVsc2Uge1xuXHRcdC8vIFRoZSBidWZmZXIgaXMgc21hbGxlciB0aGFuIGl0cyBiYWNraW5nIGFycmF5IGJ1ZmZlci5cblx0XHQvLyBDcmVhdGUgYSBjb3B5IHRvIGF2b2lkIHNlbmRpbmcgdGhlIGVudGlyZSBhcnJheSBidWZmZXIuXG5cdFx0Y29uc3QgdmFsdWVCeXRlcyA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcik7XG5cdFx0dHJhbnNmZXIucHVzaCh2YWx1ZUJ5dGVzLmJ1ZmZlcik7XG5cdFx0cmV0dXJuIHZhbHVlQnl0ZXM7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0VG9rZW5pemF0aW9uQ3NzKCkge1xuXHRjb25zdCBjb2xvck1hcCA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LmdldENvbG9yTWFwKCk7XG5cdGNvbnN0IHRva2VuaXphdGlvbkNzcyA9IGNvbG9yTWFwID8gZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcChjb2xvck1hcCkgOiAnJztcblx0cmV0dXJuIHRva2VuaXphdGlvbkNzcztcbn1cblxuZnVuY3Rpb24gdHJ5RGVjb2RlVVJJQ29tcG9uZW50KHVyaTogc3RyaW5nKSB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudCh1cmkpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdXJpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBSTFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCLHlCQUF5QjtBQUNuRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQXNCO0FBRS9CLFNBQVMseUJBQXlCLHdCQUF3QjtBQUMxRCxTQUFTLFlBQVksU0FBUyxlQUFlLHlCQUF5QjtBQUN0RSxTQUFTLGNBQWM7QUFDdkIsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsYUFBYSxhQUFhO0FBQ25DLFNBQVMsU0FBUyxTQUFTLFNBQVMsZ0JBQWdCO0FBQ3BELFNBQVMsV0FBVztBQUNwQixZQUFZLFVBQVU7QUFDdEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx3QkFBd0I7QUFDakMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUN2QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUE0QztBQUNyRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQixzQkFBc0I7QUFDakQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUIsZ0NBQWdDO0FBQzFELFNBQVMsZUFBZSxnQkFBZ0I7QUFDeEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx3Q0FBd0M7QUFFakQsU0FBUyxlQUFpUSx3QkFBd0I7QUFDbFMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxTQUE2Qyw2QkFBNkI7QUFFbkYsU0FBUywrQkFB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QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLHFCQUFxQjtBQUFBLE1BQzFCLEdBQUksS0FBSywyQkFBMkIsQ0FBQztBQUFBLE1BQ3JDLEdBQUksS0FBSyxpQkFBaUIsQ0FBQyxLQUFLLGVBQWUsaUJBQWlCLElBQUksQ0FBQztBQUFBLElBQ3RFO0FBRUEsU0FBSyxRQUFRLHFCQUFxQjtBQUVsQyxTQUFLLHNCQUFzQjtBQUFBLE1BQzFCLE1BQU07QUFBQSxNQUNOO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsc0JBQXNCLFNBQTJCLFVBQW1DO0FBQzNGLFFBQUksS0FBSyxXQUFXO0FBQ25CO0FBQUEsSUFDRDtBQUVBLFNBQUssU0FBUyxZQUFZLFNBQVMsUUFBUTtBQUFBLEVBQzVDO0FBQUEsRUFFUyxVQUFVO0FBQ2xCLFNBQUssWUFBWTtBQUNqQixTQUFLLFNBQVMsUUFBUTtBQUN0QixTQUFLLFVBQVU7QUFDZixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGFBQWEsTUFBTTtBQUN4QixTQUFLLGtDQUFrQyxNQUFNO0FBQzdDLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQW4xRGEsbUJBQU47QUFBQSxFQXNDSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXpEVTtBQXExRGIsU0FBUyxtQkFBbUIsUUFBb0IsVUFBcUM7QUFDcEYsTUFBSSxPQUFPLGVBQWUsT0FBTyxPQUFPLFlBQVk7QUFFbkQsV0FBTztBQUFBLEVBQ1IsT0FBTztBQUdOLFVBQU0sYUFBYSxJQUFJLFdBQVcsTUFBTTtBQUN4QyxhQUFTLEtBQUssV0FBVyxNQUFNO0FBQy9CLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxTQUFTLHFCQUFxQjtBQUM3QixRQUFNLFdBQVcscUJBQXFCLFlBQVk7QUFDbEQsUUFBTSxrQkFBa0IsV0FBVyw2QkFBNkIsUUFBUSxJQUFJO0FBQzVFLFNBQU87QUFDUjtBQUVBLFNBQVMsc0JBQXNCLEtBQWE7QUFDM0MsTUFBSTtBQUNILFdBQU8sbUJBQW1CLEdBQUc7QUFBQSxFQUM5QixRQUFRO0FBQ1AsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFsib3V0cHV0IiwgImNlbGwiLCAiZWRpdG9yT3B0aW9ucyJdCn0K
