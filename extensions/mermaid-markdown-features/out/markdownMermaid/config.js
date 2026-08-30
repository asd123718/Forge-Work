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
exports.configSection = void 0;
exports.buildMermaidConfigData = buildMermaidConfigData;
exports.injectMermaidConfig = injectMermaidConfig;
exports.renderMermaidConfigSpan = renderMermaidConfigSpan;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const vscode = __importStar(require("vscode"));
exports.configSection = 'markdown-mermaid';
const defaultMermaidTheme = 'vscode';
const validMermaidThemes = [
    'vscode',
    'base',
    'forest',
    'dark',
    'default',
    'neutral',
];
function sanitizeMermaidTheme(theme) {
    return typeof theme === 'string' && validMermaidThemes.includes(theme) ? theme : defaultMermaidTheme;
}
function buildMermaidConfigData() {
    const config = vscode.workspace.getConfiguration(exports.configSection);
    return {
        darkModeTheme: sanitizeMermaidTheme(config.get('darkModeTheme')),
        lightModeTheme: sanitizeMermaidTheme(config.get('lightModeTheme')),
        maxTextSize: config.get('maxTextSize'),
        clickDrag: config.get('mouseNavigation.enabled', "alt" /* ClickDragMode.Alt */),
        showControls: config.get('controls.show', "onHoverOrFocus" /* ShowControlsMode.OnHoverOrFocus */),
        resizable: config.get('resizable', true),
        maxHeight: config.get('maxHeight', ''),
    };
}
function injectMermaidConfig(md) {
    const render = md.renderer.render;
    md.renderer.render = function (...args) {
        return `${renderMermaidConfigSpan()}
				${render.apply(md.renderer, args)}`;
    };
    return md;
}
function renderMermaidConfigSpan() {
    const escapedConfig = escapeHtmlAttribute(JSON.stringify(buildMermaidConfigData()));
    return `<span id="${exports.configSection}" aria-hidden="true" data-config="${escapedConfig}"></span>`;
}
function escapeHtmlAttribute(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
//# sourceMappingURL=config.js.map