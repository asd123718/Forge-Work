"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownEditorProvider = void 0;
exports.getMarkdownCodeBlockEditorApiV1 = getMarkdownCodeBlockEditorApiV1;
exports.isSupportedMarkdownCodeBlockEditorApiVersion = isSupportedMarkdownCodeBlockEditorApiVersion;
exports.lineRangesToGutterMarkers = lineRangesToGutterMarkers;
const vscode = __importStar(require("vscode"));
const dispose_1 = require("../util/dispose");
const resources_1 = require("../util/resources");
const lineDiff_1 = require("./lineDiff");
const webviewInitialState_1 = require("./webviewInitialState");
const uuid_1 = require("../util/uuid");
const markdownEditorRichLinks_1 = require("./markdownEditorRichLinks");
/**
 * Authenticates messages sent from the extension host to one Markdown editor webview.
 */
class AuthenticatedWebview {
    webview;
    #messageSecret = (0, uuid_1.generateUuid)();
    constructor(webview) {
        this.webview = webview;
    }
    get messageSecret() {
        return this.#messageSecret;
    }
    postMessage(message) {
        return this.webview.postMessage({ ...message, messageSecret: this.#messageSecret });
    }
}
/**
 * Experimental hybrid (WYSIWYG) Markdown editor backed by the
 * `@vscode/markdown-editor` component. The {@link vscode.TextDocument} remains
 * the single source of truth, so native undo/redo, dirty state and hot-exit are
 * preserved.
 */
class MarkdownEditorProvider extends dispose_1.Disposable {
    static viewType = 'vscode.markdown.editor';
    /**
     * Memento key under which the last chosen edit/read-only mode is remembered.
     * The value is a single global default shared by every Markdown editor, so
     * flipping the lock in one editor becomes the initial mode for the next.
     */
    static #readonlyStateKey = 'markdown.editor.readonly';
    #mediaRoot;
    #extensionUri;
    #globalState;
    #linkOpener;
    #contributions;
    #logger;
    #tryOpenLink;
    #webviewPanels = new Map();
    #focusedWebviewPanels = new Set();
    #providerApis = new Map();
    #resolvedCodeBlockEditors = new Map();
    #resolvedCodeBlockEditorResources = new Set();
    constructor(extensionUri, globalState, linkOpener, contributions, logger, tryOpenLink) {
        super();
        this.#extensionUri = extensionUri;
        this.#globalState = globalState;
        this.#linkOpener = linkOpener;
        this.#contributions = contributions;
        this.#logger = logger;
        this.#tryOpenLink = tryOpenLink;
        this.#mediaRoot = vscode.Uri.joinPath(this.#extensionUri, 'markdown-editor-out');
        this._register(new vscode.Disposable(() => {
            void vscode.commands.executeCommand('setContext', 'markdownEditorFocus', false);
        }));
    }
    async resolveCustomTextEditor(document, webviewPanel, token) {
        await this.#resolveEditor(document, webviewPanel, token);
    }
    async resolveCustomTextEditorInlineDiff(documents, webviewPanel, token) {
        await this.#resolveEditor(documents.modified, webviewPanel, token, documents.original);
    }
    async #resolveEditor(document, webviewPanel, token, originalDocument) {
        if (!vscode.workspace.isTrusted) {
            const cancel = { title: vscode.l10n.t("Cancel"), isCloseAffordance: true };
            const openAnyway = { title: vscode.l10n.t("Open Anyway") };
            const choice = await vscode.window.showWarningMessage(vscode.l10n.t("This Markdown file is in an untrusted workspace. Do you want to open it anyway?"), {
                modal: true,
                detail: vscode.l10n.t("For your security, only continue if you trust the source of this Markdown file."),
            }, cancel, openAnyway);
            if (choice !== openAnyway || token.isCancellationRequested) {
                webviewPanel.dispose();
                return;
            }
        }
        if (token.isCancellationRequested) {
            return;
        }
        const webview = new AuthenticatedWebview(webviewPanel.webview);
        this.#webviewPanels.set(webviewPanel, webview);
        const codeBlockEditorProviders = this.#loadCodeBlockEditorProviders();
        this.#wireSingle(document, webviewPanel, originalDocument, codeBlockEditorProviders, webview);
        this.#configureWebview(document, webview);
    }
    #configureWebview(document, editorWebview) {
        const webview = editorWebview.webview;
        webview.options = {
            enableScripts: true,
            localResourceRoots: (0, resources_1.getMarkdownLocalResourceRoots)(document.uri, [this.#mediaRoot], {
                includeWorkspaceResources: vscode.workspace.isTrusted,
            }),
        };
        webview.html = this.#getHtml(document, webview, editorWebview.messageSecret);
    }
    #wireSingle(document, webviewPanel, originalDocument, initialCodeBlockEditorProviders, editorWebview) {
        let isUpdatingFromWebview = false;
        let editQueue = Promise.resolve();
        let webviewReady = false;
        let codeBlockEditorProviders;
        let contributionUpdate = 0;
        const resolveCancellation = new vscode.CancellationTokenSource();
        const richLinks = new markdownEditorRichLinks_1.MarkdownEditorRichLinkController(document, this.#linkOpener, this.#logger, message => editorWebview.postMessage(message));
        const postCodeBlockEditorProviders = async () => {
            if (webviewReady && codeBlockEditorProviders) {
                await editorWebview.postMessage({ type: 'codeBlockEditorProviders', codeBlockEditorProviders });
            }
        };
        const initialContributionUpdate = contributionUpdate;
        void initialCodeBlockEditorProviders.then(async (providers) => {
            if (initialContributionUpdate !== contributionUpdate || resolveCancellation.token.isCancellationRequested) {
                return;
            }
            codeBlockEditorProviders = providers;
            await postCodeBlockEditorProviders();
        }).catch(error => {
            if (!resolveCancellation.token.isCancellationRequested) {
                this.#logger.trace('Markdown code block editor', 'Failed to initialize contributed editors', error);
            }
        });
        const onMessage = editorWebview.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready': {
                    webviewReady = true;
                    if (message.documentVersion !== document.version) {
                        await editorWebview.postMessage({ type: 'update', content: document.getText() });
                    }
                    await postCodeBlockEditorProviders();
                    break;
                }
                case 'resolveCodeBlockEditor': {
                    const requestId = message.requestId;
                    const provider = typeof message.providerId === 'string'
                        ? this.#contributions.contributions.codeBlockEditorProviders.find(candidate => candidate.id === message.providerId)
                        : undefined;
                    const descriptor = provider && typeof message.language === 'string'
                        ? await this.#resolveCodeBlockEditor(provider, document.uri, message.language)
                        : undefined;
                    if (resolveCancellation.token.isCancellationRequested) {
                        break;
                    }
                    await editorWebview.postMessage({
                        type: 'resolvedCodeBlockEditor',
                        requestId,
                        descriptor,
                    });
                    break;
                }
                case 'codeBlockEditorDiagnostic': {
                    if (typeof message.message === 'string') {
                        this.#logger.trace('Markdown code block editor', message.message);
                    }
                    break;
                }
                case 'richLinkTargets': {
                    if (Array.isArray(message.hrefs)) {
                        richLinks.updateTargets(message.hrefs.filter((href) => typeof href === 'string'));
                    }
                    break;
                }
                case 'editorFocusChanged': {
                    if (message.focused) {
                        this.#focusedWebviewPanels.add(webviewPanel);
                    }
                    else {
                        this.#focusedWebviewPanels.delete(webviewPanel);
                    }
                    await this.#updateEditorFocusContext();
                    break;
                }
                case 'setReadonly': {
                    // Remember the edit/read-only choice as the global default for the
                    // next Markdown editor.
                    await this.#globalState.update(_a.#readonlyStateKey, !!message.readonly);
                    break;
                }
                case 'history': {
                    // The TextDocument owns undo/redo, so route the chord to the built-in
                    // command; the active custom editor input scopes it to this resource's
                    // history, shared with the Edit menu and Command Palette. Drain any
                    // in-flight edit first and only act while this panel is active, so the
                    // chord cannot race a pending edit or land on a different document.
                    if (message.command === 'undo' || message.command === 'redo') {
                        await editQueue;
                        if (webviewPanel.active) {
                            await vscode.commands.executeCommand(message.command);
                        }
                    }
                    break;
                }
                case 'openLink': {
                    if (typeof message.href === 'string' && !await this.#tryOpenLink(message.href)) {
                        await this.#linkOpener.openDocumentLink(message.href, document.uri);
                    }
                    break;
                }
                case 'edit': {
                    editQueue = editQueue.then(async () => {
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(document.uri, new vscode.Range(document.positionAt(message.start), document.positionAt(message.endExclusive)), message.text);
                        isUpdatingFromWebview = true;
                        try {
                            await vscode.workspace.applyEdit(edit);
                        }
                        finally {
                            isUpdatingFromWebview = false;
                        }
                    });
                    await editQueue;
                    break;
                }
            }
        });
        const onDocumentChange = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() !== document.uri.toString() || isUpdatingFromWebview) {
                return;
            }
            editorWebview.postMessage({ type: 'update', content: document.getText() });
        });
        const highlight = this.#wireHighlight(editorWebview);
        const quickDiff = originalDocument
            ? this.#wireDocumentDiff(originalDocument, document, editorWebview)
            : this.#wireQuickDiff(document, editorWebview);
        const comments = this.#wireComments(document, editorWebview);
        const onDidGrantWorkspaceTrust = vscode.workspace.onDidGrantWorkspaceTrust(() => {
            webviewReady = false;
            this.#configureWebview(document, editorWebview);
        });
        const refreshCodeBlockEditorProviders = async (clearProviderApis, force) => {
            const update = ++contributionUpdate;
            if (clearProviderApis) {
                this.#clearCodeBlockEditorCaches();
            }
            else {
                this.#resolvedCodeBlockEditors.clear();
                this.#resolvedCodeBlockEditorResources.clear();
            }
            const updatedCodeBlockEditorProviders = await this.#loadCodeBlockEditorProviders();
            if (update !== contributionUpdate
                || (!force && codeBlockEditorProviders && codeBlockEditorDefinitionsEqual(codeBlockEditorProviders, updatedCodeBlockEditorProviders))) {
                return;
            }
            codeBlockEditorProviders = updatedCodeBlockEditorProviders;
            await postCodeBlockEditorProviders();
        };
        const onContributionsChanged = this.#contributions.onContributionsChanged(() => {
            void refreshCodeBlockEditorProviders(true, false);
        });
        const invalidateResourceCache = (resources) => {
            const resourceKeys = resources.map(resource => resource.toString());
            const dynamicResourceChanged = resourceKeys.some(resource => this.#resolvedCodeBlockEditorResources.has(resource));
            const staticResourceChanged = this.#contributions.contributions.codeBlockEditorProviders.some(provider => provider.source.kind === 'static' && resourceKeys.includes(provider.source.resource.toString()));
            if (dynamicResourceChanged || staticResourceChanged) {
                void refreshCodeBlockEditorProviders(false, dynamicResourceChanged);
            }
        };
        const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(document => invalidateResourceCache([document.uri]));
        const onDidCreateFiles = vscode.workspace.onDidCreateFiles(event => invalidateResourceCache(event.files));
        const onDidDeleteFiles = vscode.workspace.onDidDeleteFiles(event => invalidateResourceCache(event.files));
        const onDidRenameFiles = vscode.workspace.onDidRenameFiles(event => invalidateResourceCache(event.files.flatMap(file => [file.oldUri, file.newUri])));
        const onDidChangeViewState = webviewPanel.onDidChangeViewState(() => this.#updateEditorFocusContext());
        const onDidChangeRichLinksConfiguration = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('markdown.experimental.richLinks.enabled', document.uri)) {
                richLinks.updateTargets([]);
                webviewReady = false;
                this.#configureWebview(document, editorWebview);
            }
        });
        const onDidChangeLinkPresentationRules = vscode.window.onDidChangeLinkPresentationRules(() => {
            richLinks.updateTargets([]);
            webviewReady = false;
            this.#configureWebview(document, editorWebview);
        });
        webviewPanel.onDidDispose(() => {
            contributionUpdate++;
            resolveCancellation.cancel();
            resolveCancellation.dispose();
            this.#webviewPanels.delete(webviewPanel);
            this.#focusedWebviewPanels.delete(webviewPanel);
            this.#updateEditorFocusContext();
            onMessage.dispose();
            onDocumentChange.dispose();
            highlight.dispose();
            quickDiff.dispose();
            comments.dispose();
            onDidGrantWorkspaceTrust.dispose();
            onContributionsChanged.dispose();
            onDidSaveTextDocument.dispose();
            onDidCreateFiles.dispose();
            onDidDeleteFiles.dispose();
            onDidRenameFiles.dispose();
            onDidChangeViewState.dispose();
            onDidChangeRichLinksConfiguration.dispose();
            onDidChangeLinkPresentationRules.dispose();
            richLinks.dispose();
        });
    }
    async executeCommand(command) {
        const activeWebview = Array.from(this.#webviewPanels).find(([panel]) => panel.active)?.[1];
        if (!activeWebview) {
            this.#logger.trace('Markdown editor command', `Ignored ${command} because no Markdown editor is active`);
            return;
        }
        await activeWebview.postMessage({ type: 'command', command });
    }
    async #updateEditorFocusContext() {
        const focused = Array.from(this.#focusedWebviewPanels).some(panel => panel.active);
        await vscode.commands.executeCommand('setContext', 'markdownEditorFocus', focused);
    }
    async #loadCodeBlockEditorProviders() {
        const result = [];
        for (const provider of this.#contributions.contributions.codeBlockEditorProviders) {
            if (provider.source.kind === 'exportApi') {
                if (!isSupportedMarkdownCodeBlockEditorApiVersion(provider.source.apiVersion)) {
                    this.#logger.trace('Markdown code block editor', `Ignoring provider ${provider.id} because API version ${provider.source.apiVersion} is not supported`);
                    continue;
                }
                result.push({
                    id: provider.id,
                    selector: provider.selector,
                    source: { kind: 'exportApi' },
                });
                continue;
            }
            try {
                const bytes = await vscode.workspace.fs.readFile(provider.source.resource);
                result.push({
                    id: provider.id,
                    selector: provider.selector,
                    source: {
                        kind: 'static',
                        descriptor: {
                            html: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
                            contentType: provider.contentType,
                            initialHeight: provider.initialHeight,
                            sandbox: provider.sandbox,
                        },
                    },
                });
            }
            catch (error) {
                this.#logger.trace('Markdown code block editor', `Failed to load ${provider.id} from ${provider.source.resource.toString()}`, error);
            }
        }
        return result;
    }
    async #resolveCodeBlockEditor(contribution, documentUri, language) {
        if (contribution.source.kind !== 'exportApi' || !vscode.workspace.isTrusted) {
            return undefined;
        }
        const requestCacheKey = `${contribution.id}\0${documentUri.toString()}\0${language}`;
        let cached = this.#resolvedCodeBlockEditors.get(requestCacheKey);
        if (!cached) {
            cached = this.#doResolveCodeBlockEditor(contribution, documentUri, language);
            this.#resolvedCodeBlockEditors.set(requestCacheKey, cached);
            cached.then(result => {
                if (!result) {
                    if (this.#resolvedCodeBlockEditors.get(requestCacheKey) === cached) {
                        this.#resolvedCodeBlockEditors.delete(requestCacheKey);
                    }
                }
                else if (result.cacheKey) {
                    this.#resolvedCodeBlockEditors.set(`${contribution.id}\0${result.cacheKey}`, Promise.resolve(result));
                }
            }, () => {
                this.#resolvedCodeBlockEditors.delete(requestCacheKey);
            });
        }
        return cached;
    }
    async #doResolveCodeBlockEditor(contribution, documentUri, language) {
        const cancellation = new vscode.CancellationTokenSource();
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            cancellation.cancel();
        }, 10_000);
        let cancellationListener;
        const cancelled = new Promise(resolve => {
            cancellationListener = cancellation.token.onCancellationRequested(() => resolve(undefined));
        });
        try {
            const operation = async () => {
                const provider = await this.#getCodeBlockEditorProvider(contribution);
                if (!provider || cancellation.token.isCancellationRequested) {
                    return undefined;
                }
                const value = await provider.resolve({
                    providerId: contribution.providerId,
                    language,
                    documentUri,
                }, cancellation.token);
                if (!value || cancellation.token.isCancellationRequested) {
                    return undefined;
                }
                if (value.content.uri !== undefined) {
                    this.#resolvedCodeBlockEditorResources.add(value.content.uri.toString());
                }
                return await this.#readResolvedCodeBlockEditor(contribution, value);
            };
            const result = await Promise.race([operation(), cancelled]);
            if (timedOut) {
                this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} timed out resolving ${language}`);
                return undefined;
            }
            return result;
        }
        catch (error) {
            this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} failed to resolve ${language}`, error);
            return undefined;
        }
        finally {
            clearTimeout(timeout);
            cancellationListener?.dispose();
            cancellation.dispose();
        }
    }
    async #getCodeBlockEditorProvider(contribution) {
        if (contribution.source.kind !== 'exportApi' || !isSupportedMarkdownCodeBlockEditorApiVersion(contribution.source.apiVersion)) {
            return undefined;
        }
        let cached = this.#providerApis.get(contribution.id);
        if (!cached) {
            cached = (async () => {
                const exports = await contribution.extension.activate();
                const api = getMarkdownCodeBlockEditorApiV1(exports);
                if (!api) {
                    this.#logger.trace('Markdown code block editor', `Extension ${contribution.extension.id} does not export markdownCodeBlockEditors.apiV1`);
                    return undefined;
                }
                const provider = api.getProvider(contribution.providerId);
                if (!isMarkdownCodeBlockEditorProviderApi(provider)) {
                    this.#logger.trace('Markdown code block editor', `Extension ${contribution.extension.id} did not return provider ${contribution.providerId}`);
                    return undefined;
                }
                return provider;
            })();
            this.#providerApis.set(contribution.id, cached);
        }
        return cached;
    }
    async #readResolvedCodeBlockEditor(contribution, value) {
        if (!isProviderResolvedCodeBlockEditor(value)) {
            this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} returned an invalid descriptor`);
            return undefined;
        }
        let html;
        if (value.content.html !== undefined) {
            html = value.content.html;
        }
        else {
            if (!isAllowedCodeBlockEditorResource(value.content.uri, contribution.extension.extensionUri)) {
                this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} returned a resource outside its extension and the workspace`);
                return undefined;
            }
            const bytes = await vscode.workspace.fs.readFile(value.content.uri);
            html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        }
        return {
            cacheKey: value.cacheKey,
            html,
            contentType: value.contentType ?? contribution.contentType,
            initialHeight: value.initialHeight ?? contribution.initialHeight,
            sandbox: intersectSandbox(contribution.sandbox, value.sandbox),
        };
    }
    #clearCodeBlockEditorCaches() {
        this.#providerApis.clear();
        this.#resolvedCodeBlockEditors.clear();
        this.#resolvedCodeBlockEditorResources.clear();
    }
    /**
     * Forwards the source-control change information for the document (the same
     * added/modified/deleted line changes shown in the editor gutter) to the
     * webview, where it is painted in the Markdown editor's gutter. Line ranges
     * are converted to source character offsets here, since the webview works in
     * offsets.
     */
    #wireQuickDiff(document, editorWebview) {
        const webview = editorWebview.webview;
        const diffProvider = vscode.window.createSourceControlDiffInformation(document.uri);
        const postMarkers = () => {
            const diffInformation = diffProvider.diffInformation;
            // The changes are computed asynchronously against a specific document
            // version. Only map them to offsets while that version still matches the
            // document we hold, otherwise the line positions could be stale. A newer
            // diff for the current version will arrive via onDidChange.
            if (!diffInformation || diffInformation.isStale) {
                return;
            }
            editorWebview.postMessage({ type: 'gutterMarkers', markers: toGutterMarkers(document, diffInformation.changes) });
        };
        const onChange = diffProvider.onDidChange(postMarkers);
        // Re-send once the webview has (re)initialized its model, and whenever the
        // document settles on the version the changes were computed for.
        const onMessage = webview.onDidReceiveMessage((message) => {
            if (message.type === 'ready') {
                postMarkers();
            }
        });
        const onDocumentChange = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === document.uri.toString()) {
                postMarkers();
            }
        });
        return vscode.Disposable.from(diffProvider, onChange, onMessage, onDocumentChange);
    }
    #wireDocumentDiff(originalDocument, modifiedDocument, editorWebview) {
        const webview = editorWebview.webview;
        const lineDiffProvider = new lineDiff_1.MarkdownPreviewLineDiffProvider(originalDocument, modifiedDocument);
        const postMarkers = async () => {
            const originalVersion = originalDocument.version;
            const modifiedVersion = modifiedDocument.version;
            const changes = await lineDiffProvider.getChangedLineRanges();
            if (originalVersion !== originalDocument.version || modifiedVersion !== modifiedDocument.version) {
                return;
            }
            editorWebview.postMessage({ type: 'gutterMarkers', markers: lineRangesToGutterMarkers(modifiedDocument, changes) });
        };
        const onMessage = webview.onDidReceiveMessage(message => {
            if (message.type === 'ready') {
                void postMarkers();
            }
        });
        const onDocumentChange = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri.toString() === originalDocument.uri.toString() || event.document.uri.toString() === modifiedDocument.uri.toString()) {
                void postMarkers();
            }
        });
        return vscode.Disposable.from(onMessage, onDocumentChange);
    }
    /**
     * Bridges the workbench's agent/session comments (the same store the code
     * editor renders its comments from) to the webview: existing comments are
     * forwarded for rendering, and comments the user adds in the Markdown editor
     * are written back to the shared store so they appear in the code editor too.
     * Comment ranges are converted between {@link vscode.Range} and the source
     * character offsets the webview works in.
     */
    #wireComments(document, editorWebview) {
        const webview = editorWebview.webview;
        const commentsProvider = vscode.window.createAgentEditorComments(document.uri);
        let webviewReady = false;
        let revealedCommentId;
        const postComments = () => {
            const comments = commentsProvider.comments.map(comment => ({
                id: comment.id,
                start: document.offsetAt(comment.range.start),
                endExclusive: document.offsetAt(comment.range.end),
                body: comment.body,
                author: comment.author,
            }));
            editorWebview.postMessage({ type: 'comments', comments, acceptsComments: commentsProvider.acceptsComments });
        };
        const postReveal = () => {
            if (webviewReady && revealedCommentId) {
                editorWebview.postMessage({ type: 'revealComment', id: revealedCommentId });
            }
        };
        const onChange = commentsProvider.onDidChange(postComments);
        const onDidRevealComment = commentsProvider.onDidRevealComment(id => {
            revealedCommentId = id;
            postReveal();
        });
        const onMessage = webview.onDidReceiveMessage((message) => {
            if (message.type === 'ready') {
                webviewReady = true;
                postComments();
                postReveal();
            }
            else if (message.type === 'addComment') {
                const range = new vscode.Range(document.positionAt(message.start), document.positionAt(message.endExclusive));
                commentsProvider.addComment(range, message.text);
            }
            else if (message.type === 'deleteComment') {
                commentsProvider.deleteComment(message.id);
            }
        });
        return vscode.Disposable.from(commentsProvider, onChange, onDidRevealComment, onMessage);
    }
    /**
     * Proxies the webview's syntax highlighting requests to the
     * `documentSyntaxHighlighting` proposed API, since the webview cannot call
     * it directly. Also forwards theme changes so the webview can re-highlight.
     */
    #wireHighlight(editorWebview) {
        const webview = editorWebview.webview;
        const onMessage = webview.onDidReceiveMessage(async (message) => {
            if (message.type !== 'highlight') {
                return;
            }
            const result = await vscode.languages.computeFullSyntaxHighlighting(message.source, message.languageId);
            editorWebview.postMessage({
                type: 'highlightResult',
                requestId: message.requestId,
                tokens: result.tokens,
                colorMap: result.colorMap,
            });
        });
        const onThemeChange = vscode.languages.onDidChangeSyntaxHighlighting(() => {
            editorWebview.postMessage({ type: 'highlightThemeChanged' });
        });
        return vscode.Disposable.from(onMessage, onThemeChange);
    }
    #getHtml(document, webview, messageSecret) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.#mediaRoot, 'editor.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.#mediaRoot, 'editor.css'));
        const baseUri = webview.asWebviewUri(document.uri);
        const nonce = getNonce();
        const initialState = (0, webviewInitialState_1.encodeWebviewInitialState)({
            content: document.getText(),
            documentVersion: document.version,
            readonly: this.#globalState.get(_a.#readonlyStateKey, true),
            richLinksEnabled: vscode.workspace.getConfiguration('markdown').get('experimental.richLinks.enabled', false),
            linkPresentationRules: vscode.window.linkPresentationRules.map(rule => ({
                id: rule.id,
                source: rule.uriPattern.source,
                flags: rule.uriPattern.flags,
                initialKind: rule.initialKind,
            })),
        });
        const body = /* html */ `
	<div id="editor"></div>`;
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; frame-src 'self';" />
	<meta name="vscode-markdown-editor-script-nonce" content="${nonce}" />
	<meta name="vscode-markdown-editor-message-secret" content="${messageSecret}" />
	<meta id="vscode-markdown-editor-initial-state" content="${initialState}" />
	<base href="${baseUri}" />
	<link rel="stylesheet" href="${styleUri}" />
	<title>Markdown Editor</title>
</head>
<body>${body}
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.MarkdownEditorProvider = MarkdownEditorProvider;
_a = MarkdownEditorProvider;
function codeBlockEditorDefinitionsEqual(a, b) {
    return a.length === b.length && a.every((editor, index) => {
        const other = b[index];
        return editor.id === other.id
            && editor.selector.language === other.selector.language
            && editor.selector.languagePrefix === other.selector.languagePrefix
            && editor.source.kind === other.source.kind
            && (editor.source.kind !== 'static'
                || (other.source.kind === 'static' && resolvedCodeBlockEditorsEqual(editor.source.descriptor, other.source.descriptor)));
    });
}
function resolvedCodeBlockEditorsEqual(a, b) {
    return a.cacheKey === b.cacheKey
        && a.html === b.html
        && a.contentType === b.contentType
        && a.initialHeight === b.initialHeight
        && a.sandbox?.forms === b.sandbox?.forms
        && a.sandbox?.downloads === b.sandbox?.downloads
        && a.sandbox?.pointerLock === b.sandbox?.pointerLock
        && a.sandbox?.clipboardWrite === b.sandbox?.clipboardWrite;
}
function getMarkdownCodeBlockEditorApiV1(value) {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const namespace = value.markdownCodeBlockEditors;
    if (!namespace || typeof namespace !== 'object') {
        return undefined;
    }
    const api = namespace.apiV1;
    return isMarkdownCodeBlockEditorApiV1(api) ? api : undefined;
}
function isSupportedMarkdownCodeBlockEditorApiVersion(value) {
    return value === 1;
}
function isMarkdownCodeBlockEditorApiV1(value) {
    return typeof value === 'object'
        && value !== null
        && typeof value.getProvider === 'function';
}
function isMarkdownCodeBlockEditorProviderApi(value) {
    return typeof value === 'object'
        && value !== null
        && typeof value.resolve === 'function';
}
function isProviderResolvedCodeBlockEditor(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const descriptor = value;
    if ((descriptor.contentType !== undefined && descriptor.contentType !== 'text' && descriptor.contentType !== 'json')
        || (descriptor.cacheKey !== undefined && typeof descriptor.cacheKey !== 'string')
        || (descriptor.initialHeight !== undefined && (!Number.isFinite(descriptor.initialHeight) || descriptor.initialHeight <= 0))
        || !isSandbox(descriptor.sandbox)
        || !descriptor.content
        || typeof descriptor.content !== 'object') {
        return false;
    }
    const content = descriptor.content;
    return (typeof content.html === 'string' && content.uri === undefined)
        || (content.html === undefined && content.uri instanceof vscode.Uri);
}
function isSandbox(value) {
    if (value === undefined) {
        return true;
    }
    if (!value || typeof value !== 'object') {
        return false;
    }
    const sandbox = value;
    return ['forms', 'downloads', 'pointerLock', 'clipboardWrite']
        .every(key => sandbox[key] === undefined || typeof sandbox[key] === 'boolean');
}
function intersectSandbox(maximum, requested) {
    return {
        forms: maximum?.forms === true && requested?.forms !== false,
        downloads: maximum?.downloads === true && requested?.downloads !== false,
        pointerLock: maximum?.pointerLock === true && requested?.pointerLock !== false,
        clipboardWrite: maximum?.clipboardWrite === true && requested?.clipboardWrite !== false,
    };
}
function isAllowedCodeBlockEditorResource(resource, extensionUri) {
    if (vscode.workspace.getWorkspaceFolder(resource)) {
        return true;
    }
    if (resource.scheme !== extensionUri.scheme || resource.authority !== extensionUri.authority) {
        return false;
    }
    const caseInsensitive = resource.scheme === 'file';
    const resourcePath = caseInsensitive ? resource.path.toLowerCase() : resource.path;
    const extensionPath = caseInsensitive ? extensionUri.path.toLowerCase() : extensionUri.path;
    const extensionPrefix = extensionPath.endsWith('/') ? extensionPath : `${extensionPath}/`;
    return resourcePath === extensionPath || resourcePath.startsWith(extensionPrefix);
}
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
/**
 * Converts the line-based source control changes into source character offset
 * ranges understood by the Markdown editor's `gutterMarkers`. Added/modified
 * changes map to the offset span of their modified lines; deleted changes map to
 * an empty range at the boundary where the removed text used to be.
 *
 * Line ranges use {@link vscode.TextEditorLineRange} semantics: 1-based
 * `startLineNumber` and exclusive `endLineNumberExclusive`.
 */
function toGutterMarkers(document, changes) {
    const markers = [];
    for (const change of changes) {
        if (change.kind === vscode.TextEditorChangeKind.Deletion) {
            // The modified range is empty; place an empty marker at the start of the
            // line where the removed content used to be.
            const line = Math.max(0, change.modified.startLineNumber - 1);
            const offset = document.offsetAt(new vscode.Position(line, 0));
            markers.push({ start: offset, endExclusive: offset, type: 'deleted' });
            continue;
        }
        const start = document.offsetAt(new vscode.Position(change.modified.startLineNumber - 1, 0));
        const endExclusive = document.offsetAt(document.lineAt(change.modified.endLineNumberExclusive - 2).range.end);
        markers.push({
            start,
            endExclusive,
            type: change.kind === vscode.TextEditorChangeKind.Addition ? 'added' : 'modified',
        });
    }
    return markers;
}
function lineRangesToGutterMarkers(document, changes) {
    return changes.map(change => {
        if (change.modifiedRange.isEmpty) {
            const offset = document.offsetAt(change.modifiedRange.start);
            return { start: offset, endExclusive: offset, type: 'deleted' };
        }
        const start = document.offsetAt(change.modifiedRange.start);
        const endExclusive = document.offsetAt(document.lineAt(change.modifiedRange.end.line - 1).range.end);
        return {
            start,
            endExclusive,
            type: change.originalRange.isEmpty ? 'added' : 'modified',
        };
    });
}
//# sourceMappingURL=markdownEditorProvider.js.map