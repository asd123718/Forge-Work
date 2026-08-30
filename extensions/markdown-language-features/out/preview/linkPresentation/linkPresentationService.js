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
exports.LinkPresentationService = exports.linkPresentationProviderId = void 0;
exports.createSharedLinkPresentationService = createSharedLinkPresentationService;
exports.registerLinkPresentationProvider = registerLinkPresentationProvider;
exports.canonicalizeLinkHref = canonicalizeLinkHref;
const observables_1 = require("@vscode/observables");
const vscode = __importStar(require("vscode"));
const dispose_1 = require("../../util/dispose");
const githubLinkPresentationResolver_1 = require("./githubLinkPresentationResolver");
const gitLinkPresentationResolver_1 = require("./gitLinkPresentationResolver");
const linkPresentationResolver_1 = require("./linkPresentationResolver");
const workspaceLinkPresentationResolver_1 = require("./workspaceLinkPresentationResolver");
const refreshIntervalMs = 30_000;
exports.linkPresentationProviderId = 'markdown.linkPresentations';
class LinkPresentationService extends dispose_1.Disposable {
    #logger;
    #resolvers;
    #entries = new Map();
    #onDidRequestRefresh = this._register(new vscode.EventEmitter());
    #refreshTimer;
    constructor(resolvers, logger) {
        super();
        this.#logger = logger;
        this.#resolvers = resolvers.map(resolver => this._register(resolver));
    }
    watch(href) {
        const key = canonicalizeLinkHref(href);
        let entry = this.#entries.get(key);
        if (!entry) {
            const resolved = this.#resolve(key);
            if (!resolved) {
                return undefined;
            }
            entry = {
                ...resolved,
                references: 0,
                subscription: (0, observables_1.autorun)(reader => resolved.presentation.read(reader)),
            };
            this.#entries.set(key, entry);
        }
        entry.references++;
        this.#scheduleRefresh();
        let disposed = false;
        return {
            presentation: entry.presentation,
            dispose: () => {
                if (!disposed) {
                    disposed = true;
                    this.#release(key, entry);
                }
            },
        };
    }
    async openLink(href) {
        for (const resolver of this.#resolvers) {
            if (resolver.open && await resolver.open(href)) {
                return true;
            }
        }
        return false;
    }
    refresh() {
        this.#cancelRefresh();
        this.#onDidRequestRefresh.fire();
        this.#scheduleRefresh();
    }
    dispose() {
        this.#cancelRefresh();
        for (const entry of this.#entries.values()) {
            entry.subscription.dispose();
        }
        this.#entries.clear();
        super.dispose();
    }
    #resolve(href) {
        const context = {
            onDidRequestRefresh: this.#onDidRequestRefresh.event,
            logger: this.#logger,
        };
        for (const resolver of this.#resolvers) {
            const presentation = resolver.resolve(href, context);
            if (presentation) {
                return {
                    presentation,
                    refreshOnInterval: resolver.refreshOnInterval,
                };
            }
        }
        return undefined;
    }
    #release(key, entry) {
        entry.references--;
        if (entry.references === 0 && this.#entries.get(key) === entry) {
            entry.subscription.dispose();
            this.#entries.delete(key);
            this.#scheduleRefresh();
        }
    }
    #scheduleRefresh() {
        if (![...this.#entries.values()].some(entry => entry.refreshOnInterval)) {
            this.#cancelRefresh();
        }
        else if (this.#refreshTimer === undefined) {
            this.#refreshTimer = setTimeout(() => {
                this.#refreshTimer = undefined;
                this.refresh();
            }, refreshIntervalMs);
        }
    }
    #cancelRefresh() {
        if (this.#refreshTimer !== undefined) {
            clearTimeout(this.#refreshTimer);
            this.#refreshTimer = undefined;
        }
    }
}
exports.LinkPresentationService = LinkPresentationService;
function createSharedLinkPresentationService(globalState, logger) {
    return new LinkPresentationService([
        new gitLinkPresentationResolver_1.GitLinkPresentationResolver(new linkPresentationResolver_1.ImmutableLinkPresentationCache()),
        new githubLinkPresentationResolver_1.GitHubLinkPresentationResolver(new linkPresentationResolver_1.LinkPresentationCache(globalState, logger)),
        new workspaceLinkPresentationResolver_1.WorkspaceLinkPresentationResolver(),
    ], logger);
}
function registerLinkPresentationProvider(service) {
    return vscode.window.registerLinkPresentationProvider(exports.linkPresentationProviderId, {
        provideLinkPresentationWatcher: resource => {
            const href = resource.toString(true);
            const watch = service.watch(href);
            if (!watch) {
                throw new Error(`No link presentation resolver accepted ${href}.`);
            }
            return new ExtensionLinkPresentationWatcher(watch);
        },
    });
}
class ExtensionLinkPresentationWatcher extends dispose_1.Disposable {
    #onDidChangePresentation = this._register(new vscode.EventEmitter());
    onDidChangePresentation = this.#onDidChangePresentation.event;
    #source;
    #presentation;
    get presentation() {
        return this.#presentation;
    }
    constructor(watch) {
        super();
        this._register(watch);
        this.#source = watch.presentation.get();
        this.#presentation = toApiPresentation(this.#source);
        this._register((0, observables_1.autorun)(reader => {
            const presentation = watch.presentation.read(reader);
            if (presentation !== this.#source) {
                this.#source = presentation;
                this.#presentation = toApiPresentation(presentation);
                this.#onDidChangePresentation.fire();
            }
        }));
    }
}
function toApiPresentation(presentation) {
    return {
        kind: presentation.kind,
        ...(presentation.title ? { title: presentation.title } : {}),
        ...(presentation.detail ? { detail: presentation.detail } : {}),
        ...(presentation.reference ? { reference: presentation.reference } : {}),
        ...(presentation.status ? { status: presentation.status } : {}),
        ...(presentation.secondaryStatus ? { secondaryStatus: presentation.secondaryStatus } : {}),
        ...(presentation.tooltip ? { tooltip: presentation.tooltip } : {}),
        ...(presentation.ariaLabel ? { ariaLabel: presentation.ariaLabel } : {}),
        ...(presentation.isLoading ? { isLoading: true } : {}),
    };
}
function canonicalizeLinkHref(href) {
    try {
        return new URL(href).toString();
    }
    catch {
        return href;
    }
}
//# sourceMappingURL=linkPresentationService.js.map