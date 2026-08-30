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
const assert = __importStar(require("assert"));
const observables_1 = require("@vscode/observables");
require("mocha");
const vscode = __importStar(require("vscode"));
const githubLinkPresentationResolver_1 = require("../preview/linkPresentation/githubLinkPresentationResolver");
const gitLinkPresentationResolver_1 = require("../preview/linkPresentation/gitLinkPresentationResolver");
const linkPresentationResolver_1 = require("../preview/linkPresentation/linkPresentationResolver");
const linkPresentationService_1 = require("../preview/linkPresentation/linkPresentationService");
class TestMemento {
    #values = new Map();
    keys() {
        return [...this.#values.keys()];
    }
    get(key, defaultValue) {
        return this.#values.get(key) ?? defaultValue;
    }
    update(key, value) {
        if (value === undefined) {
            this.#values.delete(key);
        }
        else {
            this.#values.set(key, value);
        }
        return Promise.resolve();
    }
}
suite('Markdown editor rich links', () => {
    test('separates GitHub branch names from folder paths', () => {
        const refs = [
            { ref: 'refs/heads/main' },
            { ref: 'refs/heads/feature/rich-links' },
        ];
        assert.deepStrictEqual((0, githubLinkPresentationResolver_1.resolveGitHubTreePath)(['main'], refs), {
            branch: 'main',
        });
        assert.deepStrictEqual((0, githubLinkPresentationResolver_1.resolveGitHubTreePath)(['main', 'src', 'vs'], refs), {
            branch: 'main',
            path: 'src/vs',
        });
        assert.deepStrictEqual((0, githubLinkPresentationResolver_1.resolveGitHubTreePath)(['feature', 'rich-links'], refs), {
            branch: 'feature/rich-links',
        });
        assert.deepStrictEqual((0, githubLinkPresentationResolver_1.resolveGitHubTreePath)(['feature', 'rich-links', 'src'], refs), {
            branch: 'feature/rich-links',
            path: 'src',
        });
    });
    test('maps GitHub issue lifecycle states', () => {
        assert.deepStrictEqual((0, githubLinkPresentationResolver_1.getGitHubIssueStatus)('open', undefined), { kind: 'open', label: 'Open' });
        assert.deepStrictEqual((0, githubLinkPresentationResolver_1.getGitHubIssueStatus)('closed', 'completed'), { kind: 'closed', label: 'Closed' });
        assert.deepStrictEqual((0, githubLinkPresentationResolver_1.getGitHubIssueStatus)('closed', 'not_planned'), { kind: 'notPlanned', label: 'Not planned' });
    });
    test('maps GitHub pull request lifecycle states', () => {
        const open = (0, githubLinkPresentationResolver_1.getGitHubPullRequestStatus)('open', false, false);
        const draft = (0, githubLinkPresentationResolver_1.getGitHubPullRequestStatus)('open', true, false);
        const closed = (0, githubLinkPresentationResolver_1.getGitHubPullRequestStatus)('closed', false, false);
        const merged = (0, githubLinkPresentationResolver_1.getGitHubPullRequestStatus)('closed', false, true);
        assert.deepStrictEqual(open, { kind: 'open', label: 'Open' });
        assert.deepStrictEqual(draft, { kind: 'draft', label: 'Draft' });
        assert.deepStrictEqual(closed, { kind: 'closed', label: 'Closed' });
        assert.deepStrictEqual(merged, { kind: 'merged', label: 'Merged' });
        assert.strictEqual((0, githubLinkPresentationResolver_1.shouldShowGitHubPullRequestChecks)(open), true);
        assert.strictEqual((0, githubLinkPresentationResolver_1.shouldShowGitHubPullRequestChecks)(draft), true);
        assert.strictEqual((0, githubLinkPresentationResolver_1.shouldShowGitHubPullRequestChecks)(closed), false);
        assert.strictEqual((0, githubLinkPresentationResolver_1.shouldShowGitHubPullRequestChecks)(merged), false);
    });
    test('keeps GitHub lookup failures visible and actionable', () => {
        assert.deepStrictEqual((0, githubLinkPresentationResolver_1.getGitHubLookupFailurePresentation)('https://github.com/hediet/demo-json-schema-validator/pull/5', new githubLinkPresentationResolver_1.GitHubLookupError('authenticationRequired', 'No GitHub session.')), {
            kind: 'pullRequest',
            status: { kind: 'error', label: 'Authorization required' },
            tooltip: 'Authorize GitHub repository access in VS Code to load this link. No GitHub session.',
            ariaLabel: 'GitHub pullRequest lookup failed: Authorization required',
        });
        assert.deepStrictEqual((0, githubLinkPresentationResolver_1.getGitHubLookupFailurePresentation)('https://github.com/hediet/demo-json-schema-validator/issues/1', new githubLinkPresentationResolver_1.GitHubLookupError('rateLimited', '403 Forbidden'))?.status, { kind: 'error', label: 'Rate limited' });
        assert.strictEqual((0, githubLinkPresentationResolver_1.getGitHubLookupFailurePresentation)('https://example.com/issues/1', new Error('offline')), undefined);
    });
    test('normalizes common Git remote URL formats', () => {
        assert.deepStrictEqual([
            (0, gitLinkPresentationResolver_1.normalizeGitRemoteUrl)('https://github.com/microsoft/vscode.git'),
            (0, gitLinkPresentationResolver_1.normalizeGitRemoteUrl)('git@github.com:microsoft/vscode.git'),
            (0, gitLinkPresentationResolver_1.normalizeGitRemoteUrl)('ssh://git@github.com/microsoft/vscode.git'),
        ], [
            'github.com/microsoft/vscode',
            'github.com/microsoft/vscode',
            'github.com/microsoft/vscode',
        ]);
    });
    test('supports local and forge Git commit links', () => {
        const refresh = new vscode.EventEmitter();
        const resolver = new gitLinkPresentationResolver_1.GitLinkPresentationResolver(new linkPresentationResolver_1.ImmutableLinkPresentationCache());
        try {
            const context = {
                onDidRequestRefresh: refresh.event,
                logger: { trace: () => { } },
            };
            assert.deepStrictEqual({
                local: !!resolver.resolve('commit://1234567890abcdef', context),
                github: !!resolver.resolve('https://github.com/microsoft/vscode/commit/1234567890abcdef', context),
                gitlab: !!resolver.resolve('https://gitlab.com/microsoft/vscode/-/commit/1234567890abcdef', context),
                invalidLocal: !!resolver.resolve('commit:--output=package.json', context),
                invalidForge: !!resolver.resolve('https://github.com/microsoft/vscode/commit/--output=package.json', context),
                malformedForge: !!resolver.resolve('https://github.com/microsoft/vscode/commit/%', context),
                other: !!resolver.resolve('https://example.com/resource', context),
            }, {
                local: true,
                github: true,
                gitlab: true,
                invalidLocal: false,
                invalidForge: false,
                malformedForge: false,
                other: false,
            });
        }
        finally {
            resolver.dispose();
            refresh.dispose();
        }
    });
    test('ignores malformed GitHub paths', () => {
        assert.strictEqual((0, githubLinkPresentationResolver_1.getGitHubLookupFailurePresentation)('https://github.com/microsoft/vscode/issues/%', new Error('failed')), undefined);
    });
    test('shows Git commit metadata', () => {
        assert.deepStrictEqual((0, gitLinkPresentationResolver_1.getGitCommitPresentation)({
            hash: '1234567890abcdef',
            message: 'Refactor rich-link resolvers\n\nUse observable lifetimes.',
            shortStat: {
                insertions: 20,
                deletions: 5,
            },
        }), {
            kind: 'commit',
            detail: 'Refactor rich-link resolvers',
            tooltip: '1234567 · Refactor rich-link resolvers · 20 insertions, 5 deletions',
            ariaLabel: 'Commit 1234567, 20 insertions and 5 deletions: Refactor rich-link resolvers',
        });
    });
    test('owns async resolution through observable lifetime', () => {
        const refresh = new vscode.EventEmitter();
        let resolveCount = 0;
        const presentation = (0, linkPresentationResolver_1.createAsyncLinkPresentation)('https://example.com/resource', { kind: 'file', status: { kind: 'pending', label: 'Loading' } }, {
            onDidRequestRefresh: refresh.event,
            logger: { trace: () => { } },
        }, async () => ({ kind: 'file', detail: String(++resolveCount) }), () => ({ kind: 'file', status: { kind: 'error', label: 'Error' } }));
        assert.strictEqual(resolveCount, 0);
        const observer = (0, observables_1.autorun)(reader => presentation.read(reader));
        assert.strictEqual(resolveCount, 1);
        refresh.fire();
        assert.strictEqual(resolveCount, 2);
        observer.dispose();
        refresh.fire();
        assert.strictEqual(resolveCount, 2);
        refresh.dispose();
    });
    test('shares one live resolver observable per canonical URL', () => {
        const source = (0, observables_1.observableValue)('presentation', { kind: 'pullRequest', title: 'Shared presentation' });
        let resolveCount = 0;
        let activeSubscriptions = 0;
        let resolverDisposeCount = 0;
        const resolver = {
            refreshOnInterval: false,
            resolve: () => {
                resolveCount++;
                return (0, observables_1.derived)(reader => {
                    activeSubscriptions++;
                    reader.store.add({
                        dispose: () => activeSubscriptions--,
                    });
                    return source.read(reader);
                });
            },
            dispose: () => resolverDisposeCount++,
        };
        const service = new linkPresentationService_1.LinkPresentationService([resolver], { trace: () => { } });
        const first = service.watch('https://github.com/microsoft/vscode/pull/1');
        const second = service.watch('https://github.com/microsoft/vscode/pull/1');
        assert.deepStrictEqual({ resolveCount, activeSubscriptions }, { resolveCount: 1, activeSubscriptions: 1 });
        first.dispose();
        assert.strictEqual(activeSubscriptions, 1);
        second.dispose();
        assert.strictEqual(activeSubscriptions, 0);
        const third = service.watch('https://github.com/microsoft/vscode/pull/1');
        assert.deepStrictEqual({ resolveCount, activeSubscriptions }, { resolveCount: 2, activeSubscriptions: 1 });
        third.dispose();
        service.dispose();
        assert.deepStrictEqual({ activeSubscriptions, resolverDisposeCount }, { activeSubscriptions: 0, resolverDisposeCount: 1 });
    });
    test('caches immutable Git commit presentations without expiry', async () => {
        const cache = new linkPresentationResolver_1.ImmutableLinkPresentationCache();
        let resolveCount = 0;
        const resolve = async () => (0, gitLinkPresentationResolver_1.getGitCommitPresentation)({
            hash: '1234567890abcdef',
            message: 'Cached commit',
            shortStat: {
                insertions: ++resolveCount,
                deletions: 0,
            },
        });
        const href = 'https://github.com/microsoft/vscode/commit/1234567890abcdef';
        const first = await cache.get(href, resolve);
        const second = await cache.get(href, resolve);
        const third = await cache.get(href, resolve);
        assert.deepStrictEqual({
            first,
            second,
            third,
            resolveCount,
        }, {
            first: {
                kind: 'commit',
                detail: 'Cached commit',
                tooltip: '1234567 · Cached commit · 1 insertions, 0 deletions',
                ariaLabel: 'Commit 1234567, 1 insertions and 0 deletions: Cached commit',
            },
            second: {
                kind: 'commit',
                detail: 'Cached commit',
                tooltip: '1234567 · Cached commit · 1 insertions, 0 deletions',
                ariaLabel: 'Commit 1234567, 1 insertions and 0 deletions: Cached commit',
            },
            third: {
                kind: 'commit',
                detail: 'Cached commit',
                tooltip: '1234567 · Cached commit · 1 insertions, 0 deletions',
                ariaLabel: 'Commit 1234567, 1 insertions and 0 deletions: Cached commit',
            },
            resolveCount: 1,
        });
    });
    test('expires mutable link presentations after one minute', async () => {
        const cache = new linkPresentationResolver_1.LinkPresentationCache();
        let resolveCount = 0;
        const resolve = async () => ({ kind: 'issue', title: String(++resolveCount) });
        const first = await cache.get('https://github.com/microsoft/vscode/issues/1', resolve, 0);
        const cached = await cache.get('https://github.com/microsoft/vscode/issues/1', resolve, 59_999);
        const refreshed = await cache.get('https://github.com/microsoft/vscode/issues/1', resolve, 60_000);
        assert.deepStrictEqual({ first, cached, refreshed, resolveCount }, {
            first: { kind: 'issue', title: '1' },
            cached: { kind: 'issue', title: '1' },
            refreshed: { kind: 'issue', title: '2' },
            resolveCount: 2,
        });
    });
    test('restores persistent presentations as loading and refreshes them', async () => {
        const storage = new TestMemento();
        const href = 'https://github.com/microsoft/vscode/issues/1';
        let resolveCount = 0;
        const resolve = async () => ({ kind: 'issue', title: String(++resolveCount) });
        const firstCache = new linkPresentationResolver_1.LinkPresentationCache(storage);
        await firstCache.get(href, resolve);
        await Promise.resolve();
        const restoredCache = new linkPresentationResolver_1.LinkPresentationCache(storage);
        const loading = restoredCache.getPersisted(href);
        const refreshed = await restoredCache.get(href, resolve);
        assert.deepStrictEqual({ loading, refreshed, resolveCount }, {
            loading: { kind: 'issue', title: '1', isLoading: true },
            refreshed: { kind: 'issue', title: '2' },
            resolveCount: 2,
        });
    });
    test('does not restore a request that completes after the cache is cleared', async () => {
        const storage = new TestMemento();
        const cache = new linkPresentationResolver_1.LinkPresentationCache(storage);
        const href = 'https://github.com/microsoft/vscode/issues/1';
        let completeRequest;
        const request = new Promise(resolve => completeRequest = resolve);
        const pending = cache.get(href, () => request);
        cache.clear();
        completeRequest({ kind: 'issue', title: 'Old issue' });
        await pending;
        await Promise.resolve();
        assert.strictEqual(new linkPresentationResolver_1.LinkPresentationCache(storage).getPersisted(href), undefined);
    });
    test('keeps a restored presentation visible while loading in the background', async () => {
        const requestRefresh = new vscode.EventEmitter();
        let completeRefresh;
        const refresh = new Promise(resolve => completeRefresh = resolve);
        const presentation = (0, linkPresentationResolver_1.createAsyncLinkPresentation)('https://github.com/microsoft/vscode/issues/1', { kind: 'issue', title: 'Cached issue', isLoading: true }, {
            onDidRequestRefresh: requestRefresh.event,
            logger: { trace: () => { } },
        }, () => refresh, () => ({ kind: 'issue', status: { kind: 'error', label: 'Error' } }), []);
        const values = [];
        const observer = (0, observables_1.autorun)(reader => values.push(presentation.read(reader)));
        completeRefresh({ kind: 'issue', title: 'Fresh issue' });
        await refresh;
        await Promise.resolve();
        observer.dispose();
        requestRefresh.dispose();
        assert.deepStrictEqual(values, [
            { kind: 'issue', title: 'Cached issue', isLoading: true },
            { kind: 'issue', title: 'Fresh issue', isLoading: undefined },
        ]);
    });
    test('does not mark a fresh presentation loading during background refresh', async () => {
        const requestRefresh = new vscode.EventEmitter();
        let resolveCount = 0;
        let completeRefresh;
        const presentation = (0, linkPresentationResolver_1.createAsyncLinkPresentation)('https://github.com/microsoft/vscode/issues/1', { kind: 'issue', status: { kind: 'pending', label: 'Loading' } }, {
            onDidRequestRefresh: requestRefresh.event,
            logger: { trace: () => { } },
        }, () => {
            resolveCount++;
            return resolveCount === 1
                ? Promise.resolve({ kind: 'issue', title: 'Fresh issue' })
                : new Promise(resolve => completeRefresh = resolve);
        }, () => ({ kind: 'issue', status: { kind: 'error', label: 'Error' } }), [requestRefresh.event]);
        const values = [];
        const observer = (0, observables_1.autorun)(reader => values.push(presentation.read(reader)));
        await Promise.resolve();
        await Promise.resolve();
        requestRefresh.fire();
        await Promise.resolve();
        completeRefresh({ kind: 'issue', title: 'Refreshed issue' });
        await Promise.resolve();
        await Promise.resolve();
        observer.dispose();
        requestRefresh.dispose();
        assert.deepStrictEqual(values, [
            { kind: 'issue', status: { kind: 'pending', label: 'Loading' } },
            { kind: 'issue', title: 'Fresh issue', isLoading: undefined },
            { kind: 'issue', title: 'Refreshed issue', isLoading: undefined },
        ]);
    });
});
//# sourceMappingURL=markdownEditorRichLinks.test.js.map