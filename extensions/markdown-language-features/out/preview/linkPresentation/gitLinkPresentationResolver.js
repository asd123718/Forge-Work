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
exports.GitLinkPresentationResolver = void 0;
exports.normalizeGitRemoteUrl = normalizeGitRemoteUrl;
exports.getGitCommitPresentation = getGitCommitPresentation;
const vscode = __importStar(require("vscode"));
const linkPresentationResolver_1 = require("./linkPresentationResolver");
class GitLinkPresentationResolver {
    refreshOnInterval = false;
    #cache;
    #onDidChangeRepositories = new vscode.EventEmitter();
    #gitApi;
    #gitApiSubscriptions;
    #isDisposed = false;
    constructor(cache) {
        this.#cache = cache;
    }
    resolve(href, context) {
        const target = parseGitCommitTarget(href);
        if (!target) {
            return undefined;
        }
        return (0, linkPresentationResolver_1.createAsyncLinkPresentation)(href, {
            kind: 'commit',
            status: { kind: 'pending', label: 'Loading' },
        }, context, () => this.#cache.get(href, () => this.#resolve(target)), error => ({
            kind: 'commit',
            status: { kind: 'error', label: 'Not available' },
            tooltip: error instanceof Error ? error.message : 'The Git commit could not be resolved.',
            ariaLabel: `Git commit ${target.sha.slice(0, 7)} could not be resolved`,
        }), [context.onDidRequestRefresh, this.#onDidChangeRepositories.event]);
    }
    async open(href) {
        const target = parseGitCommitTarget(href);
        if (!target) {
            return false;
        }
        try {
            const result = await this.#findCommit(target);
            const revealed = await vscode.commands.executeCommand('_workbench.scm.revealHistoryItem', result.repository.rootUri, result.commit.hash);
            if (!revealed) {
                await vscode.window.showWarningMessage(vscode.l10n.t("The commit could not be revealed in the Source Control Graph."));
            }
            return true;
        }
        catch (error) {
            if (target.repository) {
                return false;
            }
            await vscode.window.showWarningMessage(vscode.l10n.t("The commit could not be found in an open Git repository. {0}", error instanceof Error ? error.message : ''));
            return true;
        }
    }
    dispose() {
        this.#isDisposed = true;
        this.#gitApiSubscriptions?.dispose();
        this.#onDidChangeRepositories.dispose();
    }
    async #resolve(target) {
        return getGitCommitPresentation((await this.#findCommit(target)).commit);
    }
    async #findCommit(target) {
        const api = await this.#getGitApi();
        const repositories = api?.repositories.filter(repository => !target.repository || repository.state.remotes.some(remote => ([remote.fetchUrl, remote.pushUrl].some(url => url && normalizeGitRemoteUrl(url) === target.repository)))) ?? [];
        if (!repositories.length) {
            throw new Error(target.repository
                ? `No open Git repository matches ${target.repository}.`
                : 'No Git repositories are open.');
        }
        const results = await Promise.allSettled(repositories.map(async (repository) => ({
            repository,
            commit: await repository.getCommit(target.sha),
        })));
        const match = results.find((result) => result.status === 'fulfilled');
        if (match) {
            return match.value;
        }
        throw new AggregateError(results.map(result => result.status === 'rejected' ? result.reason : undefined).filter(error => error !== undefined), `Commit ${target.sha} was not found in the open Git repositories.`);
    }
    #getGitApi() {
        this.#gitApi ??= (async () => {
            const extension = vscode.extensions.getExtension('vscode.git');
            const git = await extension?.activate();
            if (!git?.enabled) {
                return undefined;
            }
            const api = git.getAPI(1);
            const subscriptions = vscode.Disposable.from(api.onDidOpenRepository(() => this.#onDidChangeRepositories.fire()), api.onDidCloseRepository(() => this.#onDidChangeRepositories.fire()));
            if (this.#isDisposed) {
                subscriptions.dispose();
            }
            else {
                this.#gitApiSubscriptions = subscriptions;
            }
            return api;
        })();
        return this.#gitApi;
    }
}
exports.GitLinkPresentationResolver = GitLinkPresentationResolver;
function parseGitCommitTarget(href) {
    let uri;
    try {
        uri = new URL(href);
    }
    catch {
        return undefined;
    }
    if (uri.protocol === 'commit:') {
        const sha = uri.hostname || uri.pathname.replace(/^\/+/, '');
        return isGitCommitSha(sha) ? { sha } : undefined;
    }
    if (uri.protocol !== 'https:' && uri.protocol !== 'http:') {
        return undefined;
    }
    const segments = (0, linkPresentationResolver_1.decodeUrlPathSegments)(uri);
    if (!segments) {
        return undefined;
    }
    const commitIndex = segments.lastIndexOf('commit');
    if (commitIndex < 1 || commitIndex === segments.length - 1) {
        return undefined;
    }
    const repositorySegments = segments[commitIndex - 1] === '-'
        ? segments.slice(0, commitIndex - 1)
        : segments.slice(0, commitIndex);
    if (!repositorySegments.length) {
        return undefined;
    }
    const sha = segments[commitIndex + 1];
    if (!isGitCommitSha(sha)) {
        return undefined;
    }
    return {
        repository: `${uri.hostname.toLowerCase()}/${repositorySegments.join('/').replace(/\.git$/i, '')}`,
        sha,
    };
}
function isGitCommitSha(value) {
    return /^[0-9a-f]{4,64}$/i.test(value);
}
function normalizeGitRemoteUrl(value) {
    if (!value.includes('://')) {
        const scp = /^(?:[^@]+@)?(?<host>[^:]+):(?<path>.+)$/.exec(value);
        if (scp?.groups) {
            return normalizeGitRepository(scp.groups.host, scp.groups.path);
        }
    }
    let uri;
    try {
        uri = new URL(value);
    }
    catch {
        return undefined;
    }
    return normalizeGitRepository(uri.hostname, uri.pathname);
}
function normalizeGitRepository(host, path) {
    return `${host.toLowerCase()}/${path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')}`;
}
function getGitCommitPresentation(commit) {
    const title = commit.message.split(/\r?\n/, 1)[0];
    const insertions = commit.shortStat?.insertions ?? 0;
    const deletions = commit.shortStat?.deletions ?? 0;
    const shortHash = commit.hash.slice(0, 7);
    return {
        kind: 'commit',
        detail: title,
        // TODO: Include insertion and deletion counts once the Markdown editor package supports them.
        tooltip: `${shortHash} · ${title} · ${insertions} insertions, ${deletions} deletions`,
        ariaLabel: `Commit ${shortHash}, ${insertions} insertions and ${deletions} deletions: ${title}`,
    };
}
//# sourceMappingURL=gitLinkPresentationResolver.js.map