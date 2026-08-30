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
require("mocha");
const vscode = __importStar(require("vscode"));
const markdownExtensions_1 = require("../markdownExtensions");
const markdownEditorProvider_1 = require("../preview/markdownEditorProvider");
const webviewInitialState_1 = require("../preview/webviewInitialState");
suite('Markdown editor diff', () => {
    test('maps modified-side line changes to quick diff gutter markers', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'one\ntwo changed\nthree added\nfour\n' });
        const changes = [
            { originalRange: new vscode.Range(1, 0, 2, 0), modifiedRange: new vscode.Range(1, 0, 2, 0) },
            { originalRange: new vscode.Range(2, 0, 2, 0), modifiedRange: new vscode.Range(2, 0, 3, 0) },
            { originalRange: new vscode.Range(3, 0, 4, 0), modifiedRange: new vscode.Range(3, 0, 3, 0) },
        ];
        assert.deepStrictEqual((0, markdownEditorProvider_1.lineRangesToGutterMarkers)(document, changes), [
            { start: 4, endExclusive: 15, type: 'modified' },
            { start: 16, endExclusive: 27, type: 'added' },
            { start: 28, endExclusive: 28, type: 'deleted' },
        ]);
    });
});
suite('Markdown editor initial state', () => {
    test('safely round-trips document content', () => {
        const state = {
            content: '</meta><script>globalThis.modified = true</script><!--\n# Heading "quoted"',
            documentVersion: 17,
            readonly: true,
            richLinksEnabled: true,
            linkPresentationRules: [],
        };
        const encoded = (0, webviewInitialState_1.encodeWebviewInitialState)(state);
        assert.deepStrictEqual({
            containsHtmlAttributeSyntax: /["<>&]/.test(encoded),
            roundTrip: JSON.parse(decodeURIComponent(encoded)),
        }, {
            containsHtmlAttributeSyntax: false,
            roundTrip: state,
        });
    });
});
suite('Markdown code block editor API versioning', () => {
    test('requires an explicit positive integer export API version', () => {
        assert.strictEqual(readCodeBlockEditorProviders({ kind: 'exportApi' }).length, 0);
        assert.strictEqual(readCodeBlockEditorProviders({ kind: 'exportApi', apiVersion: 0 }).length, 0);
        assert.strictEqual(readCodeBlockEditorProviders({ kind: 'exportApi', apiVersion: 1.5 }).length, 0);
        assert.deepStrictEqual(readCodeBlockEditorProviders({ kind: 'exportApi', apiVersion: 1 })[0]?.source, {
            kind: 'exportApi',
            apiVersion: 1,
        });
        assert.deepStrictEqual(readCodeBlockEditorProviders({ kind: 'exportApi', apiVersion: 2 })[0]?.source, {
            kind: 'exportApi',
            apiVersion: 2,
        });
    });
    test('only accepts the namespaced V1 extension API', () => {
        const apiV1 = { getProvider: () => undefined };
        assert.strictEqual((0, markdownEditorProvider_1.getMarkdownCodeBlockEditorApiV1)({
            markdownCodeBlockEditors: { apiV1 },
        }), apiV1);
        assert.strictEqual((0, markdownEditorProvider_1.getMarkdownCodeBlockEditorApiV1)({
            getMarkdownCodeBlockEditorProvider: () => undefined,
        }), undefined);
        assert.strictEqual((0, markdownEditorProvider_1.getMarkdownCodeBlockEditorApiV1)({
            markdownCodeBlockEditors: { apiV1: {} },
        }), undefined);
        assert.strictEqual((0, markdownEditorProvider_1.getMarkdownCodeBlockEditorApiV1)({
            markdownCodeBlockEditors: { apiV2: apiV1 },
        }), undefined);
    });
    test('only advertises API version 1', () => {
        assert.strictEqual((0, markdownEditorProvider_1.isSupportedMarkdownCodeBlockEditorApiVersion)(1), true);
        assert.strictEqual((0, markdownEditorProvider_1.isSupportedMarkdownCodeBlockEditorApiVersion)(2), false);
    });
});
function readCodeBlockEditorProviders(source) {
    const extension = {
        id: 'test.markdown-code-block-editor',
        extensionUri: vscode.Uri.file('/test/markdown-code-block-editor'),
        packageJSON: {
            version: '1.0.0',
            contributes: {
                'markdown.codeBlockEditorProviders': [{
                        id: 'test',
                        selector: { language: 'test' },
                        source,
                    }],
            },
        },
    };
    return markdownExtensions_1.MarkdownContributions.fromExtension(extension).codeBlockEditorProviders;
}
//# sourceMappingURL=markdownEditorProvider.test.js.map