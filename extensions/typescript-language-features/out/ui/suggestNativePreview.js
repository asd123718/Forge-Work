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
exports.suggestNativePreview = suggestNativePreview;
const vscode = __importStar(require("vscode"));
const useTsgo_1 = require("../commands/useTsgo");
const suggestNativePreviewStorageKey = 'typescript.suggestNativePreview.dismissed';
async function suggestNativePreview(context, experimentationService) {
    if (context.globalState.get(suggestNativePreviewStorageKey)) {
        return;
    }
    // Only show when the window is active
    if (!vscode.window.state.active) {
        return;
    }
    // Only show when the nightly extension is installed
    if (!vscode.extensions.getExtension('ms-vscode.vscode-typescript-next')) {
        return;
    }
    // Don't show if the native preview extension is already installed
    if ((0, useTsgo_1.getTsNativeExtension)()) {
        // Also don't prompt in the future
        await context.globalState.update(suggestNativePreviewStorageKey, true);
        return;
    }
    const inExperiment = await experimentationService.getTreatmentVariable('suggestNativePreview', false);
    if (!inExperiment) {
        return;
    }
    const install = { title: vscode.l10n.t("Install") };
    const learnMore = { title: vscode.l10n.t("Learn More") };
    const dismiss = { title: vscode.l10n.t("Don't Show Again") };
    const selection = await vscode.window.showInformationMessage(vscode.l10n.t("Try TypeScript 7 Native Preview for significantly faster type checking and language features."), {}, install, learnMore, dismiss);
    // Don't show again
    await context.globalState.update(suggestNativePreviewStorageKey, true);
    if (selection === install) {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', useTsgo_1.tsNativeExtensionOldId);
    }
    else if (selection === learnMore) {
        await vscode.env.openExternal(vscode.Uri.parse('https://aka.ms/vscode-try-ts-7-learn-more'));
    }
}
//# sourceMappingURL=suggestNativePreview.js.map