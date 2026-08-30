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
exports.MarkdownEditorRichLinkController = void 0;
const vscode = __importStar(require("vscode"));
const dispose_1 = require("../util/dispose");
const openDocumentLink_1 = require("../util/openDocumentLink");
class MarkdownEditorRichLinkController extends dispose_1.Disposable {
    #documentUri;
    #linkOpener;
    #logger;
    #postMessage;
    #entries = new Map();
    constructor(document, linkOpener, logger, postMessage) {
        super();
        this.#documentUri = document.uri;
        this.#linkOpener = linkOpener;
        this.#logger = logger;
        this.#postMessage = postMessage;
    }
    updateTargets(hrefs) {
        const targets = new Set(hrefs);
        for (const [href, entry] of this.#entries) {
            if (!targets.has(href)) {
                entry.dispose();
                this.#entries.delete(href);
            }
        }
        for (const href of targets) {
            if (!this.#entries.has(href)) {
                this.#entries.set(href, new ApiLinkPresentationEntry(href, this.#documentUri, this.#linkOpener, presentation => this.#publishPresentation(href, presentation), this.#logger));
            }
        }
    }
    dispose() {
        for (const entry of this.#entries.values()) {
            entry.dispose();
        }
        this.#entries.clear();
        super.dispose();
    }
    async #publishPresentation(href, presentation) {
        try {
            await this.#postMessage({
                type: 'richLinkPresentations',
                presentations: [{ href, presentation }],
            });
        }
        catch (error) {
            this.#logger.trace('Markdown rich link', `Failed to publish ${href}`, error);
        }
    }
}
exports.MarkdownEditorRichLinkController = MarkdownEditorRichLinkController;
class ApiLinkPresentationEntry extends dispose_1.Disposable {
    constructor(href, documentUri, linkOpener, publishPresentation, logger) {
        super();
        void this.#initialize(href, documentUri, linkOpener, publishPresentation, logger);
    }
    async #initialize(href, documentUri, linkOpener, publishPresentation, logger) {
        try {
            const resource = await resolveLinkResource(href, documentUri, linkOpener);
            if (this.isDisposed) {
                return;
            }
            if (!resource) {
                publishPresentation(undefined);
                return;
            }
            const resourceString = resource.toString(true);
            const rule = vscode.window.linkPresentationRules.find(rule => matchesRule(rule.uriPattern, resourceString));
            if (!rule) {
                publishPresentation(undefined);
                return;
            }
            const watcher = this._register(vscode.window.createLinkPresentationWatcher(rule.id, resource));
            publishPresentation(watcher.presentation);
            this._register(watcher.onDidChangePresentation(() => publishPresentation(watcher.presentation)));
        }
        catch (error) {
            logger.trace('Markdown rich link', `Failed to resolve ${href}`, error);
            if (!this.isDisposed) {
                publishPresentation(undefined);
            }
        }
    }
}
async function resolveLinkResource(href, documentUri, linkOpener) {
    const absoluteUri = (0, openDocumentLink_1.getAbsoluteUri)(href);
    if (absoluteUri) {
        return absoluteUri;
    }
    const resolved = await linkOpener.resolveDocumentLink(href, documentUri);
    return resolved && resolved.kind !== 'external' ? vscode.Uri.from(resolved.uri) : undefined;
}
function matchesRule(rule, value) {
    rule.lastIndex = 0;
    return rule.test(value);
}
//# sourceMappingURL=markdownEditorRichLinks.js.map