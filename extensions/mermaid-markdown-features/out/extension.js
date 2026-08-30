"use strict";
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
exports.activate = activate;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode = __importStar(require("vscode"));
const chatOutputRenderer_1 = require("./chatOutputRenderer");
const editorManager_1 = require("./editorManager");
const config_1 = require("./markdownMermaid/config");
const markdownIt_1 = require("./markdownMermaid/markdownIt");
const webviewManager_1 = require("./webviewManager");
function activate(context) {
    const webviewManager = new webviewManager_1.MermaidWebviewManager();
    const editorManager = new editorManager_1.MermaidEditorManager(context.extensionUri, webviewManager);
    context.subscriptions.push(editorManager);
    // Register chat support
    context.subscriptions.push((0, chatOutputRenderer_1.registerChatSupport)(context, webviewManager, editorManager));
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('_mermaid-markdown.resetPanZoom', (ctx) => {
        webviewManager.resetPanZoom(ctx?.mermaidWebviewId);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('_mermaid-markdown.copySource', (ctx) => {
        if (typeof ctx?.mermaidSource === 'string') {
            void vscode.env.clipboard.writeText(ctx.mermaidSource);
            return;
        }
        const webviewInfo = ctx?.mermaidWebviewId ? webviewManager.getWebview(ctx.mermaidWebviewId) : webviewManager.activeWebview;
        if (webviewInfo) {
            void vscode.env.clipboard.writeText(webviewInfo.mermaidSource);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(`${config_1.configSection}.languages`)) {
            void vscode.commands.executeCommand('markdown.api.reloadPlugins');
        }
        if (e.affectsConfiguration(config_1.configSection) || e.affectsConfiguration('workbench.colorTheme')) {
            void vscode.commands.executeCommand('markdown.preview.refresh');
        }
    }));
    return {
        extendMarkdownIt(md) {
            (0, markdownIt_1.extendMarkdownItWithMermaid)(md, {
                languageIds: () => vscode.workspace.getConfiguration(config_1.configSection).get('languages', ['mermaid'])
            });
            md.use(config_1.injectMermaidConfig);
            return md;
        }
    };
}
//# sourceMappingURL=extension.js.map