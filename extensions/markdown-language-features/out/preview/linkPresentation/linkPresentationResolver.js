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
exports.ImmutableLinkPresentationCache = exports.LinkPresentationCache = void 0;
exports.decodeUrlPathSegments = decodeUrlPathSegments;
exports.createAsyncLinkPresentation = createAsyncLinkPresentation;
const observables_1 = require("@vscode/observables");
const vscode = __importStar(require("vscode"));
const cacheLifetimeMs = 60_000;
const persistentCacheLifetimeMs = 7 * 24 * 60 * 60 * 1_000;
const persistentCacheEntryLimit = 100;
const persistentCacheKey = 'markdown.linkPresentations.cache.v1';
function decodeUrlPathSegments(uri) {
    try {
        return uri.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    }
    catch {
        return undefined;
    }
}
class LinkPresentationCache {
    #entries = new Map();
    #persistentEntries = new Map();
    #storage;
    #logger;
    #writeQueue = Promise.resolve();
    #generation = 0;
    constructor(storage, logger) {
        this.#storage = storage;
        this.#logger = logger;
        for (const entry of readPersistentLinkPresentationCache(storage?.get(persistentCacheKey))) {
            this.#persistentEntries.set(entry.href, entry);
        }
    }
    getPersisted(href, now = Date.now()) {
        const entry = this.#persistentEntries.get(href);
        if (!entry) {
            return undefined;
        }
        if (entry.storedAt + persistentCacheLifetimeMs <= now) {
            this.#persistentEntries.delete(href);
            this.#persist();
            return undefined;
        }
        return { ...entry.presentation, isLoading: true };
    }
    get(href, resolve, now = Date.now()) {
        this.#removeExpiredMemoryEntries(now);
        const cached = this.#entries.get(href);
        if (cached) {
            return cached.value;
        }
        const value = resolve();
        const entry = { value, expiresAt: now + cacheLifetimeMs };
        const generation = this.#generation;
        this.#entries.set(href, entry);
        void value.then(presentation => {
            if (generation !== this.#generation) {
                return;
            }
            this.#persistentEntries.set(href, {
                href,
                presentation: { ...presentation, isLoading: undefined },
                storedAt: Date.now(),
            });
            this.#trimPersistentEntries();
            this.#persist();
        }, () => {
            if (this.#entries.get(href) === entry) {
                this.#entries.delete(href);
            }
        });
        return value;
    }
    clear() {
        this.#generation++;
        this.#entries.clear();
        this.#persistentEntries.clear();
        this.#persist();
    }
    #removeExpiredMemoryEntries(now) {
        for (const [key, entry] of this.#entries) {
            if (entry.expiresAt <= now) {
                this.#entries.delete(key);
            }
        }
    }
    #trimPersistentEntries() {
        const entries = [...this.#persistentEntries.values()].sort((a, b) => b.storedAt - a.storedAt);
        this.#persistentEntries.clear();
        for (const entry of entries.slice(0, persistentCacheEntryLimit)) {
            this.#persistentEntries.set(entry.href, entry);
        }
    }
    #persist() {
        const storage = this.#storage;
        if (!storage) {
            return;
        }
        const value = {
            version: 1,
            entries: [...this.#persistentEntries.values()],
        };
        this.#writeQueue = this.#writeQueue.then(() => storage.update(persistentCacheKey, value)).then(undefined, error => {
            this.#logger?.trace('Markdown rich link', 'Failed to persist link presentation cache', error);
        });
    }
}
exports.LinkPresentationCache = LinkPresentationCache;
class ImmutableLinkPresentationCache {
    #entries = new Map();
    get(href, resolve) {
        const cached = this.#entries.get(href);
        if (cached) {
            return cached;
        }
        const value = resolve();
        this.#entries.set(href, value);
        void value.catch(() => {
            if (this.#entries.get(href) === value) {
                this.#entries.delete(href);
            }
        });
        return value;
    }
}
exports.ImmutableLinkPresentationCache = ImmutableLinkPresentationCache;
function createAsyncLinkPresentation(href, initialPresentation, context, resolve, getFailurePresentation, onDidRequestRefresh = [context.onDidRequestRefresh], resetOnRefresh) {
    return (0, observables_1.derived)(reader => reader.store.add(new AsyncLinkPresentation(href, initialPresentation, context, resolve, getFailurePresentation, onDidRequestRefresh, resetOnRefresh))).map((value, reader) => value.presentation.read(reader));
}
class AsyncLinkPresentation {
    presentation;
    #subscriptions;
    #resolve;
    #getFailurePresentation;
    #context;
    #href;
    #generation = 0;
    constructor(href, initialPresentation, context, resolve, getFailurePresentation, onDidRequestRefresh, resetOnRefresh) {
        this.#href = href;
        this.#context = context;
        this.#resolve = resolve;
        this.#getFailurePresentation = getFailurePresentation;
        this.presentation = (0, observables_1.observableValue)(`linkPresentation:${href}`, initialPresentation);
        this.#subscriptions = vscode.Disposable.from(...onDidRequestRefresh.map(event => event(() => this.#refresh())), ...(resetOnRefresh ? [resetOnRefresh.event(() => {
                this.presentation.set(resetOnRefresh.presentation, undefined);
                this.#refresh();
            })] : []));
        this.#refresh();
    }
    dispose() {
        this.#generation++;
        this.#subscriptions.dispose();
    }
    #refresh() {
        const currentGeneration = ++this.#generation;
        void this.#resolve().then(value => {
            if (currentGeneration === this.#generation) {
                this.presentation.set({ ...value, isLoading: undefined }, undefined);
            }
        }, error => {
            if (currentGeneration === this.#generation) {
                this.#context.logger.trace('Markdown rich link', `Failed to resolve ${this.#href}`, error);
                if (this.presentation.get().status?.kind === 'pending') {
                    this.presentation.set(this.#getFailurePresentation(error), undefined);
                }
            }
        });
    }
}
function readPersistentLinkPresentationCache(value) {
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) {
        return [];
    }
    return value.entries.flatMap(entry => {
        if (!isRecord(entry) || typeof entry.href !== 'string' || typeof entry.storedAt !== 'number') {
            return [];
        }
        const presentation = readLinkPresentation(entry.presentation);
        return presentation ? [{ href: entry.href, presentation, storedAt: entry.storedAt }] : [];
    });
}
function readLinkPresentation(value) {
    if (!isRecord(value) || !isLinkPresentationKind(value.kind)) {
        return undefined;
    }
    const status = readLinkPresentationStatus(value.status);
    const secondaryStatus = readLinkPresentationStatus(value.secondaryStatus);
    if ((value.status !== undefined && !status) || (value.secondaryStatus !== undefined && !secondaryStatus)) {
        return undefined;
    }
    return {
        kind: value.kind,
        ...(typeof value.title === 'string' ? { title: value.title } : {}),
        ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
        ...(typeof value.reference === 'string' ? { reference: value.reference } : {}),
        ...(status ? { status } : {}),
        ...(secondaryStatus ? { secondaryStatus } : {}),
        ...(typeof value.tooltip === 'string' ? { tooltip: value.tooltip } : {}),
        ...(typeof value.ariaLabel === 'string' ? { ariaLabel: value.ariaLabel } : {}),
    };
}
function readLinkPresentationStatus(value) {
    return isRecord(value) && isLinkPresentationStatusKind(value.kind) && typeof value.label === 'string'
        ? { kind: value.kind, label: value.label }
        : undefined;
}
function isLinkPresentationKind(value) {
    return value === 'resource'
        || value === 'issue'
        || value === 'pullRequest'
        || value === 'commit'
        || value === 'file'
        || value === 'folder'
        || value === 'session'
        || value === 'repository'
        || value === 'branch';
}
function isLinkPresentationStatusKind(value) {
    return value === 'neutral'
        || value === 'pending'
        || value === 'success'
        || value === 'warning'
        || value === 'error'
        || value === 'open'
        || value === 'closed'
        || value === 'merged'
        || value === 'draft'
        || value === 'notPlanned';
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
//# sourceMappingURL=linkPresentationResolver.js.map