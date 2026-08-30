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
const utils_1 = require("../utils");
const ipynbContent = JSON.stringify({
    'cells': [
        {
            'cell_type': 'markdown',
            'source': ['## Header'],
            'metadata': {}
        },
        {
            'cell_type': 'code',
            'execution_count': 2,
            'source': [`print('hello 1')\n`, `print('hello 2')`],
            'outputs': [
                {
                    'output_type': 'stream',
                    'name': 'stdout',
                    'text': ['hello 1\n', 'hello 2\n']
                }
            ],
            'metadata': {}
        }
    ]
});
suite('ipynb NotebookSerializer', function () {
    teardown(async function () {
        (0, utils_1.assertNoRpc)();
        await (0, utils_1.closeAllEditors)();
    });
    test.skip('Can open an ipynb notebook', async () => {
        const file = await (0, utils_1.createRandomFile)(ipynbContent, undefined, '.ipynb');
        const notebook = await vscode.workspace.openNotebookDocument(file);
        await vscode.window.showNotebookDocument(notebook);
        const notebookEditor = vscode.window.activeNotebookEditor;
        assert.ok(notebookEditor);
        assert.strictEqual(notebookEditor.notebook.cellCount, 2);
        assert.strictEqual(notebookEditor.notebook.cellAt(0).kind, vscode.NotebookCellKind.Markup);
        assert.strictEqual(notebookEditor.notebook.cellAt(1).kind, vscode.NotebookCellKind.Code);
        assert.strictEqual(notebookEditor.notebook.cellAt(1).outputs.length, 1);
    });
});
//# sourceMappingURL=ipynb.test.js.map