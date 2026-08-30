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
exports.WorkspaceLinkPresentationResolver = void 0;
const vscode = __importStar(require("vscode"));
const linkPresentationResolver_1 = require("./linkPresentationResolver");
class WorkspaceLinkPresentationResolver {
    refreshOnInterval = true;
    #onDidChangeWorkspaceResource = new vscode.EventEmitter();
    #subscriptions;
    #gitApi;
    constructor() {
        const refresh = () => this.#onDidChangeWorkspaceResource.fire();
        this.#subscriptions = vscode.Disposable.from(vscode.workspace.onDidCreateFiles(refresh), vscode.workspace.onDidDeleteFiles(refresh), vscode.workspace.onDidRenameFiles(refresh), vscode.workspace.onDidSaveTextDocument(refresh));
    }
    resolve(href, context) {
        if (!isWorkspaceResourceLink(href)) {
            return undefined;
        }
        return (0, linkPresentationResolver_1.createAsyncLinkPresentation)(href, {
            kind: 'file',
            status: { kind: 'pending', label: vscode.l10n.t("Loading") },
        }, context, () => this.#resolve(href), error => ({
            kind: 'file',
            status: { kind: 'error', label: vscode.l10n.t("Not found") },
            tooltip: error instanceof Error ? error.message : vscode.l10n.t("The workspace resource could not be resolved."),
            ariaLabel: vscode.l10n.t("Workspace resource could not be resolved: {0}", href),
        }), [context.onDidRequestRefresh, this.#onDidChangeWorkspaceResource.event]);
    }
    dispose() {
        this.#subscriptions.dispose();
        this.#onDidChangeWorkspaceResource.dispose();
    }
    async #resolve(href) {
        const uri = vscode.Uri.parse(href);
        const stat = await vscode.workspace.fs.stat(uri);
        return this.#present(uri, stat.type === vscode.FileType.Directory ? 'folder' : 'file');
    }
    async #present(uri, kind) {
        const label = vscode.workspace.asRelativePath(uri, false);
        const repository = await this.#getGitApi().then(api => api?.getRepository(uri) ?? undefined);
        const branch = repository?.state.HEAD?.name;
        const changed = repository ? repositoryChangeCount(repository) : 0;
        const isRepositoryRoot = kind === 'folder' && repository?.rootUri.fsPath === uri.fsPath;
        if (isRepositoryRoot) {
            const detail = [branch, changed ? `${changed} changes` : 'clean'].filter((value) => !!value).join(' · ');
            return {
                kind: 'repository',
                ...(detail ? { detail } : {}),
                status: branch ? { kind: changed ? 'warning' : 'success', label: branch } : undefined,
                tooltip: uri.toString(true),
                ariaLabel: `Local repository ${label}${branch ? ` on branch ${branch}` : ''}, ${changed ? `${changed} changes` : 'clean'}`,
            };
        }
        const details = [
            compactParent(label),
            branch,
            repository && repositoryContainsChange(repository, uri) ? 'modified' : undefined,
        ].filter((value) => !!value);
        return {
            kind,
            ...(details.length ? { detail: details.join(' · ') } : {}),
            tooltip: uri.toString(true),
            ariaLabel: `${kind === 'folder' ? 'Folder' : 'File'} ${label}`,
        };
    }
    #getGitApi() {
        this.#gitApi ??= (async () => {
            const extension = vscode.extensions.getExtension('vscode.git');
            const git = await extension?.activate();
            return git?.enabled ? git.getAPI(1) : undefined;
        })();
        return this.#gitApi;
    }
}
exports.WorkspaceLinkPresentationResolver = WorkspaceLinkPresentationResolver;
function isWorkspaceResourceLink(href) {
    return /^(?:file|vscode-remote|vscode-vfs):/i.test(href);
}
function repositoryChangeCount(repository) {
    const state = repository.state;
    return state.mergeChanges.length
        + state.indexChanges.length
        + state.workingTreeChanges.length
        + state.untrackedChanges.length;
}
function repositoryContainsChange(repository, uri) {
    const key = uri.toString();
    const state = repository.state;
    return [
        ...state.mergeChanges,
        ...state.indexChanges,
        ...state.workingTreeChanges,
        ...state.untrackedChanges,
    ].some(change => change.uri.toString() === key);
}
function relativeParent(value) {
    const separator = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
    return separator > 0 ? value.slice(0, separator) : undefined;
}
function compactParent(value) {
    const parent = relativeParent(value);
    if (!parent) {
        return undefined;
    }
    if (!/^(?:[a-z]:[\\/]|[\\/])/i.test(parent)) {
        return parent;
    }
    return parent.split(/[\\/]+/).filter(Boolean).slice(-4).join('/');
}
//# sourceMappingURL=workspaceLinkPresentationResolver.js.map