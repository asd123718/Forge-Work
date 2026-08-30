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
exports.RenderedDiffWarningManager = void 0;
const vscode = __importStar(require("vscode"));
const dispose_1 = require("../util/dispose");
const suppressedStorageKey = 'markdown.preview.renderedDiffWarning.suppressed';
const notificationShownStorageKey = 'markdown.preview.renderedDiffWarning.notificationShown';
class RenderedDiffWarningManager extends dispose_1.Disposable {
    #workspaceState;
    #statusBarItem;
    #hasActiveDiffPreview = false;
    #showWarningCommandId = '_markdown.preview.showRenderedDiffWarning';
    constructor(workspaceState) {
        super();
        this.#workspaceState = workspaceState;
        this._register(vscode.commands.registerCommand(this.#showWarningCommandId, () => {
            void this.#showWarningNotification();
        }));
    }
    dispose() {
        this.#statusBarItem?.dispose();
        this.#statusBarItem = undefined;
        super.dispose();
    }
    /**
     * Set whether a diff preview is currently the active editor.
     *
     * Drives the visibility of the status bar warning and triggers the one-time
     * notification the first time the user focuses a diff preview.
     */
    setActiveDiffPreview(active) {
        if (this.#isSuppressed() || this.#hasActiveDiffPreview === active) {
            return;
        }
        this.#hasActiveDiffPreview = active;
        this.#updateStatusBar();
        if (active && !this.#workspaceState.get(notificationShownStorageKey, false)) {
            void this.#workspaceState.update(notificationShownStorageKey, true);
            void this.#showWarningNotification();
        }
    }
    #updateStatusBar() {
        if (this.#isSuppressed() || !this.#hasActiveDiffPreview) {
            this.#statusBarItem?.dispose();
            this.#statusBarItem = undefined;
            return;
        }
        if (!this.#statusBarItem) {
            this.#statusBarItem = vscode.window.createStatusBarItem('markdown.renderedDiffWarning', vscode.StatusBarAlignment.Right, 100);
            this.#statusBarItem.name = vscode.l10n.t('Rendered Markdown Diff Warning');
            this.#statusBarItem.text = vscode.l10n.t('{0} Rendered Diff', '$(warning)');
            this.#statusBarItem.tooltip = vscode.l10n.t('Rendered Markdown diffs may hide important changes. Click for details.');
            this.#statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.#statusBarItem.command = this.#showWarningCommandId;
        }
        this.#statusBarItem.show();
    }
    async #showWarningNotification() {
        const dontShowAgain = vscode.l10n.t("Don't Show Again");
        const selected = await vscode.window.showWarningMessage(vscode.l10n.t('Rendered Markdown diffs may hide important changes such as formatting, whitespace, links, or HTML. Switch to the text diff if you need to review them.'), dontShowAgain);
        if (selected === dontShowAgain) {
            await this.#workspaceState.update(suppressedStorageKey, true);
            this.#hasActiveDiffPreview = false;
            this.#updateStatusBar();
        }
    }
    #isSuppressed() {
        return this.#workspaceState.get(suppressedStorageKey, false);
    }
}
exports.RenderedDiffWarningManager = RenderedDiffWarningManager;
//# sourceMappingURL=renderedDiffWarning.js.map