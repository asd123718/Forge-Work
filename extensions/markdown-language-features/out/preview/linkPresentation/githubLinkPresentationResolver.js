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
exports.GitHubLookupError = exports.GitHubLinkPresentationResolver = void 0;
exports.getGitHubLookupFailurePresentation = getGitHubLookupFailurePresentation;
exports.resolveGitHubTreePath = resolveGitHubTreePath;
exports.getGitHubIssueStatus = getGitHubIssueStatus;
exports.getGitHubPullRequestStatus = getGitHubPullRequestStatus;
exports.shouldShowGitHubPullRequestChecks = shouldShowGitHubPullRequestChecks;
const vscode = __importStar(require("vscode"));
const linkPresentationResolver_1 = require("./linkPresentationResolver");
const githubRepositoryScope = 'repo';
class GitHubLinkPresentationResolver {
    refreshOnInterval = true;
    #cache;
    #onDidChangeAuthentication = new vscode.EventEmitter();
    #authenticationSubscription;
    #accessToken;
    constructor(cache) {
        this.#cache = cache;
        this.#authenticationSubscription = vscode.authentication.onDidChangeSessions(event => {
            if (event.provider.id === 'github') {
                this.#accessToken = undefined;
                this.#cache.clear();
                this.#onDidChangeAuthentication.fire();
            }
        });
    }
    resolve(href, context) {
        const target = parseGitHubTarget(href);
        if (!target) {
            return undefined;
        }
        const persisted = this.#cache.getPersisted(href);
        const loadingPresentation = {
            kind: target.kind === 'tree' ? 'resource' : target.kind,
            status: { kind: 'pending', label: 'Loading' },
        };
        return (0, linkPresentationResolver_1.createAsyncLinkPresentation)(href, persisted ?? loadingPresentation, context, () => this.#cache.get(href, () => this.#resolve(target)), error => getGitHubLookupFailurePresentationForTarget(target, error), [context.onDidRequestRefresh], { event: this.#onDidChangeAuthentication.event, presentation: loadingPresentation });
    }
    dispose() {
        this.#authenticationSubscription.dispose();
        this.#onDidChangeAuthentication.dispose();
    }
    async #resolve(target) {
        const request = new GitHubRequest(await this.#getAccessToken());
        switch (target.kind) {
            case 'issue': {
                const issue = await request.get(`/repos/${target.owner}/${target.repository}/issues/${target.number}`, readIssue);
                const state = getGitHubIssueStatus(issue.state, issue.stateReason);
                return {
                    kind: 'issue',
                    title: issue.title,
                    reference: `#${target.number}`,
                    status: state,
                    tooltip: `${target.owner}/${target.repository}#${target.number} · ${state.label}`,
                    ariaLabel: `Issue ${target.owner} slash ${target.repository} number ${target.number}, ${state.label}: ${issue.title}`,
                };
            }
            case 'pullRequest': {
                const pullRequest = await request.get(`/repos/${target.owner}/${target.repository}/pulls/${target.number}`, readPullRequest);
                const state = getGitHubPullRequestStatus(pullRequest.state, pullRequest.draft, pullRequest.merged);
                const checksStatus = shouldShowGitHubPullRequestChecks(state)
                    ? checkRunStatus(await request.getAll(`/repos/${target.owner}/${target.repository}/commits/${encodeURIComponent(pullRequest.headSha)}/check-runs`, readCheckRuns))
                    : undefined;
                return {
                    kind: 'pullRequest',
                    title: pullRequest.title,
                    reference: `#${target.number}`,
                    status: state,
                    ...(checksStatus ? { secondaryStatus: checksStatus } : {}),
                    tooltip: [target.owner + '/' + target.repository + '#' + target.number, state.label, checksStatus?.label].filter(Boolean).join(' · '),
                    ariaLabel: `Pull request ${target.owner} slash ${target.repository} number ${target.number}, ${state.label}${checksStatus ? `, ${checksStatus.label}` : ''}: ${pullRequest.title}`,
                };
            }
            case 'repository': {
                const repository = await request.get(`/repos/${target.owner}/${target.repository}`, readRepository);
                const details = [
                    repository.language,
                    repository.stars === undefined ? undefined : `${formatCount(repository.stars)} stars`,
                ].filter((value) => !!value);
                return {
                    kind: 'repository',
                    ...(details.length ? { detail: details.join(' · ') } : {}),
                    tooltip: `${target.owner}/${target.repository}`,
                    ariaLabel: `GitHub repository ${target.owner} slash ${target.repository}`,
                };
            }
            case 'tree': {
                const refs = await request.get(`/repos/${target.owner}/${target.repository}/git/matching-refs/heads/${encodeURIComponent(target.segments[0])}`, readGitRefs);
                const tree = resolveGitHubTreePath(target.segments, refs);
                if (!tree) {
                    throw new GitHubLookupError('notFound', `GitHub did not find branch ${target.segments.join('/')}.`);
                }
                if (tree.path) {
                    return {
                        kind: 'folder',
                        detail: `${target.owner}/${target.repository} · ${tree.path}`,
                        tooltip: target.href,
                        ariaLabel: `Folder ${tree.path} in ${target.owner} slash ${target.repository}`,
                    };
                }
                const branch = await request.get(`/repos/${target.owner}/${target.repository}/branches/${encodeURIComponent(tree.branch)}`, readBranch);
                return {
                    kind: 'branch',
                    detail: branch.sha.slice(0, 7),
                    tooltip: `${target.owner}/${target.repository} · ${tree.branch}`,
                    ariaLabel: `Branch ${tree.branch} in ${target.owner} slash ${target.repository}`,
                };
            }
            case 'file':
                return {
                    kind: 'file',
                    detail: `${target.owner}/${target.repository} · ${target.path}`,
                    tooltip: target.href,
                    ariaLabel: `File ${target.path} in ${target.owner} slash ${target.repository}`,
                };
        }
    }
    #getAccessToken() {
        if (this.#accessToken) {
            return this.#accessToken;
        }
        const value = this.#readAccessToken().catch(error => {
            if (this.#accessToken === value
                && !(error instanceof GitHubLookupError && error.kind === 'authenticationRequired')) {
                this.#accessToken = undefined;
            }
            throw error;
        });
        this.#accessToken = value;
        return value;
    }
    async #readAccessToken() {
        try {
            const accounts = await vscode.authentication.getAccounts('github');
            for (const account of accounts) {
                const session = await vscode.authentication.getSession('github', [], { silent: true, account });
                if (session?.scopes.includes(githubRepositoryScope)) {
                    return session.accessToken;
                }
            }
            const session = await vscode.authentication.getSession('github', [githubRepositoryScope], {
                createIfNone: {
                    detail: 'The Markdown editor needs repository access to show issue, pull request, and CI status.',
                },
                ...(accounts.length === 1 ? { account: accounts[0] } : {}),
            });
            return session.accessToken;
        }
        catch (error) {
            throw new GitHubLookupError('authenticationRequired', `GitHub repository access was not authorized.${error instanceof Error ? ` ${error.message}` : ''}`);
        }
    }
}
exports.GitHubLinkPresentationResolver = GitHubLinkPresentationResolver;
class GitHubRequest {
    #accessToken;
    constructor(accessToken) {
        this.#accessToken = accessToken;
    }
    async get(apiPath, read) {
        const response = await fetch(`https://api.github.com${apiPath}`, {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${this.#accessToken}`,
            },
        });
        if (!response.ok) {
            throw GitHubLookupError.fromResponse(apiPath, response);
        }
        const value = read(await response.json());
        if (!value) {
            throw new GitHubLookupError('invalidResponse', `GitHub request ${apiPath} returned an unexpected response.`);
        }
        return value;
    }
    async getAll(apiPath, read) {
        const values = [];
        const pageSize = 100;
        for (let page = 1;; page++) {
            const separator = apiPath.includes('?') ? '&' : '?';
            const pageValues = await this.get(`${apiPath}${separator}per_page=${pageSize}&page=${page}`, read);
            values.push(...pageValues);
            if (pageValues.length < pageSize) {
                return values;
            }
        }
    }
}
class GitHubLookupError extends Error {
    kind;
    constructor(kind, message) {
        super(message);
        this.name = 'GitHubLookupError';
        this.kind = kind;
    }
    static fromResponse(apiPath, response) {
        const message = `GitHub request ${apiPath} failed: ${response.status} ${response.statusText}`;
        if (response.status === 401) {
            return new GitHubLookupError('authenticationFailed', message);
        }
        if (response.status === 403) {
            return new GitHubLookupError(response.headers.get('x-ratelimit-remaining') === '0' ? 'rateLimited' : 'accessDenied', message);
        }
        if (response.status === 404) {
            return new GitHubLookupError('notFound', message);
        }
        return new GitHubLookupError('requestFailed', message);
    }
}
exports.GitHubLookupError = GitHubLookupError;
function parseGitHubTarget(href) {
    let uri;
    try {
        uri = new URL(href);
    }
    catch {
        return undefined;
    }
    if (uri.protocol !== 'https:' || uri.hostname.toLowerCase() !== 'github.com') {
        return undefined;
    }
    const segments = (0, linkPresentationResolver_1.decodeUrlPathSegments)(uri);
    if (!segments) {
        return undefined;
    }
    const [owner, repository, category, identifier, ...rest] = segments;
    if (!owner || !repository) {
        return undefined;
    }
    if (!category) {
        return { kind: 'repository', href, owner, repository };
    }
    if (category === 'issues' || category === 'pull') {
        const number = Number(identifier);
        return Number.isInteger(number) && number > 0
            ? { kind: category === 'issues' ? 'issue' : 'pullRequest', href, owner, repository, number }
            : undefined;
    }
    if (category === 'tree' && identifier) {
        return { kind: 'tree', href, owner, repository, segments: [identifier, ...rest] };
    }
    if (category === 'blob' && identifier && rest.length) {
        return { kind: 'file', href, owner, repository, path: rest.join('/') };
    }
    return undefined;
}
function getGitHubLookupFailurePresentation(href, error) {
    const target = parseGitHubTarget(href);
    if (!target) {
        return undefined;
    }
    return getGitHubLookupFailurePresentationForTarget(target, error);
}
function getGitHubLookupFailurePresentationForTarget(target, error) {
    const failure = error instanceof GitHubLookupError
        ? githubLookupFailureDescription(error.kind)
        : { label: 'Lookup failed', detail: 'The GitHub request could not be completed.' };
    const kind = target.kind === 'tree' ? 'resource' : target.kind;
    return {
        kind,
        status: { kind: 'error', label: failure.label },
        tooltip: `${failure.detail} ${error instanceof Error ? error.message : ''}`.trim(),
        ariaLabel: `GitHub ${kind} lookup failed: ${failure.label}`,
    };
}
function githubLookupFailureDescription(kind) {
    switch (kind) {
        case 'authenticationRequired':
            return {
                label: 'Authorization required',
                detail: 'Authorize GitHub repository access in VS Code to load this link.',
            };
        case 'authenticationFailed':
            return {
                label: 'Authentication failed',
                detail: 'GitHub rejected the current VS Code authentication session.',
            };
        case 'accessDenied':
            return {
                label: 'Access denied',
                detail: 'The current GitHub account cannot access this resource.',
            };
        case 'rateLimited':
            return {
                label: 'Rate limited',
                detail: 'GitHub API rate limiting prevented this lookup.',
            };
        case 'notFound':
            return {
                label: 'Not found',
                detail: 'GitHub did not find this resource, or the current account cannot access it.',
            };
        case 'invalidResponse':
            return {
                label: 'Invalid response',
                detail: 'GitHub returned data the Markdown editor could not read.',
            };
        case 'requestFailed':
            return {
                label: 'Lookup failed',
                detail: 'GitHub returned an unsuccessful response.',
            };
    }
}
function readGitRefs(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const refs = [];
    for (const item of value) {
        if (!isRecord(item) || typeof item.ref !== 'string') {
            return undefined;
        }
        refs.push({ ref: item.ref });
    }
    return refs;
}
function resolveGitHubTreePath(segments, refs) {
    const target = segments.join('/');
    const branch = refs
        .map(ref => ref.ref.startsWith('refs/heads/') ? ref.ref.slice('refs/heads/'.length) : undefined)
        .filter((candidate) => !!candidate && (target === candidate || target.startsWith(`${candidate}/`)))
        .sort((a, b) => b.length - a.length)[0];
    if (!branch) {
        return undefined;
    }
    const path = target === branch ? undefined : target.slice(branch.length + 1);
    return { branch, ...(path ? { path } : {}) };
}
function readIssue(value) {
    if (!isRecord(value) || typeof value.title !== 'string' || (value.state !== 'open' && value.state !== 'closed')) {
        return undefined;
    }
    const stateReason = value.state_reason === 'completed' || value.state_reason === 'not_planned' || value.state_reason === 'reopened'
        ? value.state_reason
        : undefined;
    return { title: value.title, state: value.state, ...(stateReason ? { stateReason } : {}) };
}
function readPullRequest(value) {
    if (!isRecord(value) || !isRecord(value.head)) {
        return undefined;
    }
    const issue = readIssue(value);
    return issue
        && typeof value.draft === 'boolean'
        && typeof value.merged === 'boolean'
        && typeof value.head.sha === 'string'
        ? { ...issue, draft: value.draft, merged: value.merged, headSha: value.head.sha }
        : undefined;
}
function readCheckRuns(value) {
    if (!isRecord(value) || !Array.isArray(value.check_runs)) {
        return undefined;
    }
    const runs = [];
    for (const run of value.check_runs) {
        if (!isRecord(run) || typeof run.status !== 'string' || (run.conclusion !== null && typeof run.conclusion !== 'string')) {
            return undefined;
        }
        runs.push({ status: run.status, conclusion: run.conclusion });
    }
    return runs;
}
function getGitHubIssueStatus(state, stateReason) {
    if (state === 'open') {
        return { kind: 'open', label: 'Open' };
    }
    return stateReason === 'not_planned'
        ? { kind: 'notPlanned', label: 'Not planned' }
        : { kind: 'closed', label: 'Closed' };
}
function getGitHubPullRequestStatus(state, draft, merged) {
    if (merged) {
        return { kind: 'merged', label: 'Merged' };
    }
    if (draft) {
        return { kind: 'draft', label: 'Draft' };
    }
    return state === 'closed'
        ? { kind: 'closed', label: 'Closed' }
        : { kind: 'open', label: 'Open' };
}
function shouldShowGitHubPullRequestChecks(status) {
    return status.kind === 'open' || status.kind === 'draft';
}
function checkRunStatus(checks) {
    if (!checks?.length) {
        return undefined;
    }
    if (checks.some(check => check.status !== 'completed')) {
        return { kind: 'pending', label: 'Checks running' };
    }
    if (checks.some(check => check.conclusion === 'failure'
        || check.conclusion === 'timed_out'
        || check.conclusion === 'cancelled'
        || check.conclusion === 'action_required')) {
        return { kind: 'error', label: 'Checks failed' };
    }
    return { kind: 'success', label: 'Checks passed' };
}
function readRepository(value) {
    if (!isRecord(value)) {
        return undefined;
    }
    return {
        ...(typeof value.language === 'string' ? { language: value.language } : {}),
        ...(typeof value.stargazers_count === 'number' ? { stars: value.stargazers_count } : {}),
    };
}
function readBranch(value) {
    return isRecord(value)
        && isRecord(value.commit)
        && typeof value.commit.sha === 'string'
        ? { sha: value.commit.sha }
        : undefined;
}
function formatCount(value) {
    return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
//# sourceMappingURL=githubLinkPresentationResolver.js.map