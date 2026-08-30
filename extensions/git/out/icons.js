"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Icons = void 0;
const vscode_1 = require("vscode");
/**
 * Shared, immutable ThemeIcon instances used across the git extension. ThemeIcon has no
 * mutable state, so a single instance can safely be reused wherever the same icon id is
 * needed, instead of allocating a new instance per ref/commit/artifact on every refresh.
 * This avoids allocating large numbers of short-lived ThemeIcon instances when rendering
 * many refs, tags, worktrees, or stashes across many repositories.
 */
exports.Icons = {
    account: new vscode_1.ThemeIcon('account'),
    branch: new vscode_1.ThemeIcon('git-branch'),
    chatWorktree: new vscode_1.ThemeIcon('chat-sparkle'),
    head: new vscode_1.ThemeIcon('target'),
    remoteBranch: new vscode_1.ThemeIcon('cloud'),
    repository: new vscode_1.ThemeIcon('repo'),
    stash: new vscode_1.ThemeIcon('git-stash'),
    tag: new vscode_1.ThemeIcon('tag'),
    worktree: new vscode_1.ThemeIcon('worktree'),
};
//# sourceMappingURL=icons.js.map