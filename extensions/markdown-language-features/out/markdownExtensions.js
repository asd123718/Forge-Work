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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownContributions = void 0;
exports.getMarkdownExtensionContributions = getMarkdownExtensionContributions;
const vscode = __importStar(require("vscode"));
const arrays = __importStar(require("./util/arrays"));
const dispose_1 = require("./util/dispose");
function resolveExtensionResource(extension, resourcePath) {
    return vscode.Uri.joinPath(extension.extensionUri, resourcePath);
}
function* resolveExtensionResources(extension, resourcePaths) {
    if (Array.isArray(resourcePaths)) {
        for (const resource of resourcePaths) {
            try {
                yield resolveExtensionResource(extension, resource);
            }
            catch {
                // noop
            }
        }
    }
}
var MarkdownContributions;
(function (MarkdownContributions) {
    MarkdownContributions.Empty = {
        previewScripts: [],
        previewStyles: [],
        previewResourceRoots: [],
        markdownItPlugins: new Map(),
        codeBlockEditorProviders: [],
    };
    function merge(a, b) {
        return {
            previewScripts: [...a.previewScripts, ...b.previewScripts],
            previewStyles: [...a.previewStyles, ...b.previewStyles],
            previewResourceRoots: [...a.previewResourceRoots, ...b.previewResourceRoots],
            markdownItPlugins: new Map([...a.markdownItPlugins.entries(), ...b.markdownItPlugins.entries()]),
            codeBlockEditorProviders: [...a.codeBlockEditorProviders, ...b.codeBlockEditorProviders],
        };
    }
    MarkdownContributions.merge = merge;
    function uriEqual(a, b) {
        return a.toString() === b.toString();
    }
    function previewScriptEqual(a, b) {
        return uriEqual(a.resource, b.resource) && a.type === b.type;
    }
    function equal(a, b) {
        return arrays.equals(a.previewScripts, b.previewScripts, previewScriptEqual)
            && arrays.equals(a.previewStyles, b.previewStyles, uriEqual)
            && arrays.equals(a.previewResourceRoots, b.previewResourceRoots, uriEqual)
            && arrays.equals(Array.from(a.markdownItPlugins.keys()), Array.from(b.markdownItPlugins.keys()))
            && arrays.equals(a.codeBlockEditorProviders, b.codeBlockEditorProviders, (x, y) => x.id === y.id
                && x.providerId === y.providerId
                && x.extension.id === y.extension.id
                && x.extensionVersion === y.extensionVersion
                && selectorEqual(x.selector, y.selector)
                && sourceEqual(x.source, y.source)
                && x.contentType === y.contentType
                && x.initialHeight === y.initialHeight
                && sandboxEqual(x.sandbox, y.sandbox));
    }
    MarkdownContributions.equal = equal;
    function fromExtension(extension) {
        const contributions = extension.packageJSON?.contributes;
        if (!contributions) {
            return MarkdownContributions.Empty;
        }
        const previewStyles = Array.from(getContributedStyles(contributions, extension));
        const previewScripts = Array.from(getContributedScripts(contributions, extension));
        const previewResourceRoots = previewStyles.length || previewScripts.length ? [extension.extensionUri] : [];
        const markdownItPlugins = getContributedMarkdownItPlugins(contributions, extension);
        const codeBlockEditorProviders = Array.from(getContributedCodeBlockEditorProviders(contributions, extension));
        return {
            previewScripts,
            previewStyles,
            previewResourceRoots,
            markdownItPlugins,
            codeBlockEditorProviders,
        };
    }
    MarkdownContributions.fromExtension = fromExtension;
    function getContributedMarkdownItPlugins(contributes, extension) {
        const map = new Map();
        if (contributes['markdown.markdownItPlugins']) {
            map.set(extension.id, extension.activate().then(() => {
                if (extension.exports?.extendMarkdownIt) {
                    return (md) => extension.exports.extendMarkdownIt(md);
                }
                return (md) => md;
            }));
        }
        return map;
    }
    function getContributedScripts(contributes, extension) {
        return resolvePreviewScripts(extension, contributes['markdown.previewScripts']);
    }
    function getContributedStyles(contributes, extension) {
        return resolveExtensionResources(extension, contributes['markdown.previewStyles']);
    }
    function* getContributedCodeBlockEditorProviders(contributes, extension) {
        yield* getLegacyCodeBlockEditors(contributes, extension);
        const providers = contributes['markdown.codeBlockEditorProviders'];
        if (!Array.isArray(providers)) {
            return;
        }
        for (const value of providers) {
            if (!value || typeof value !== 'object') {
                continue;
            }
            const provider = value;
            const selector = readCodeBlockEditorSelector(provider.selector);
            const source = readCodeBlockEditorSource(provider.source, extension);
            if (typeof provider.id !== 'string'
                || !selector
                || !source
                || (provider.contentType !== undefined && provider.contentType !== 'text' && provider.contentType !== 'json')
                || (provider.initialHeight !== undefined && !isPositiveNumber(provider.initialHeight))) {
                continue;
            }
            yield {
                id: `${extension.id}/${provider.id}`,
                providerId: provider.id,
                extension,
                extensionVersion: typeof extension.packageJSON?.version === 'string' ? extension.packageJSON.version : '',
                selector,
                source,
                contentType: provider.contentType ?? 'text',
                initialHeight: provider.initialHeight,
                sandbox: readSandbox(provider.sandbox),
            };
        }
    }
    function* getLegacyCodeBlockEditors(contributes, extension) {
        const editors = contributes['markdown.codeBlockEditors'];
        if (!Array.isArray(editors)) {
            return;
        }
        for (const value of editors) {
            if (!value || typeof value !== 'object') {
                continue;
            }
            const editor = value;
            if (typeof editor.id !== 'string'
                || typeof editor.language !== 'string'
                || typeof editor.entrypoint !== 'string'
                || (editor.contentType !== undefined && editor.contentType !== 'text' && editor.contentType !== 'json')) {
                continue;
            }
            yield {
                id: `${extension.id}/${editor.id}`,
                providerId: editor.id,
                extension,
                extensionVersion: typeof extension.packageJSON?.version === 'string' ? extension.packageJSON.version : '',
                selector: { language: editor.language },
                source: {
                    kind: 'static',
                    resource: resolveExtensionResource(extension, editor.entrypoint),
                },
                contentType: editor.contentType ?? 'text',
            };
        }
    }
    function readCodeBlockEditorSelector(value) {
        if (!value || typeof value !== 'object') {
            return undefined;
        }
        const selector = value;
        const language = typeof selector.language === 'string' && selector.language.length > 0 ? selector.language : undefined;
        const languagePrefix = typeof selector.languagePrefix === 'string' && selector.languagePrefix.length > 0 ? selector.languagePrefix : undefined;
        if ((language === undefined) === (languagePrefix === undefined)) {
            return undefined;
        }
        if (language !== undefined) {
            return { language };
        }
        return languagePrefix !== undefined ? { languagePrefix } : undefined;
    }
    function readCodeBlockEditorSource(value, extension) {
        if (!value || typeof value !== 'object') {
            return undefined;
        }
        const source = value;
        if (source.kind === 'exportApi' && isPositiveInteger(source.apiVersion)) {
            return { kind: 'exportApi', apiVersion: source.apiVersion };
        }
        if (source.kind === 'static' && typeof source.entrypoint === 'string') {
            return { kind: 'static', resource: resolveExtensionResource(extension, source.entrypoint) };
        }
        return undefined;
    }
    function readSandbox(value) {
        if (!value || typeof value !== 'object') {
            return undefined;
        }
        const sandbox = value;
        return {
            forms: sandbox.forms === true,
            downloads: sandbox.downloads === true,
            pointerLock: sandbox.pointerLock === true,
            clipboardWrite: sandbox.clipboardWrite === true,
        };
    }
    function isPositiveNumber(value) {
        return typeof value === 'number' && Number.isFinite(value) && value > 0;
    }
    function isPositiveInteger(value) {
        return isPositiveNumber(value) && Number.isInteger(value);
    }
    function selectorEqual(a, b) {
        return a.language === b.language && a.languagePrefix === b.languagePrefix;
    }
    function sourceEqual(a, b) {
        if (a.kind !== b.kind) {
            return false;
        }
        return a.kind === 'static'
            ? b.kind === 'static' && uriEqual(a.resource, b.resource)
            : b.kind === 'exportApi' && a.apiVersion === b.apiVersion;
    }
    function sandboxEqual(a, b) {
        return a?.forms === b?.forms
            && a?.downloads === b?.downloads
            && a?.pointerLock === b?.pointerLock
            && a?.clipboardWrite === b?.clipboardWrite;
    }
    function* resolvePreviewScripts(extension, scripts) {
        if (!Array.isArray(scripts)) {
            return;
        }
        for (const script of scripts) {
            const contribution = getPreviewScriptContribution(script);
            if (!contribution) {
                continue;
            }
            try {
                yield {
                    resource: resolveExtensionResource(extension, contribution.path),
                    type: contribution.type,
                };
            }
            catch {
                // noop
            }
        }
    }
    function getPreviewScriptContribution(script) {
        if (typeof script === 'string') {
            return { path: script };
        }
        if (!script || typeof script !== 'object') {
            return undefined;
        }
        const contribution = script;
        if (typeof contribution.path !== 'string') {
            return undefined;
        }
        return {
            path: contribution.path,
            type: contribution.type === 'module' ? contribution.type : undefined,
        };
    }
})(MarkdownContributions || (exports.MarkdownContributions = MarkdownContributions = {}));
class VSCodeExtensionMarkdownContributionProvider extends dispose_1.Disposable {
    #contributions;
    #extensionContext;
    constructor(extensionContext) {
        super();
        this.#extensionContext = extensionContext;
        this._register(vscode.extensions.onDidChange(() => {
            const currentContributions = this.#getCurrentContributions();
            const existingContributions = this.#contributions || MarkdownContributions.Empty;
            if (!MarkdownContributions.equal(existingContributions, currentContributions)) {
                this.#contributions = currentContributions;
                this.#onContributionsChanged.fire(this);
            }
        }));
    }
    get extensionUri() {
        return this.#extensionContext.extensionUri;
    }
    #onContributionsChanged = this._register(new vscode.EventEmitter());
    onContributionsChanged = this.#onContributionsChanged.event;
    get contributions() {
        this.#contributions ??= this.#getCurrentContributions();
        return this.#contributions;
    }
    #getCurrentContributions() {
        return vscode.extensions.all
            .map(MarkdownContributions.fromExtension)
            .reduce(MarkdownContributions.merge, MarkdownContributions.Empty);
    }
}
function getMarkdownExtensionContributions(context) {
    return new VSCodeExtensionMarkdownContributionProvider(context);
}
//# sourceMappingURL=markdownExtensions.js.map