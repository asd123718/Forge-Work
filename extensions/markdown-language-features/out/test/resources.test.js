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
const resources_1 = require("../util/resources");
suite('Markdown local resource roots', () => {
    const mediaRoot = vscode.Uri.parse('test:/extension/media');
    const workspaceRootA = vscode.Uri.parse('test:/workspace/a');
    const workspaceRootB = vscode.Uri.parse('test:/workspace/b');
    const workspaceFolders = [
        { index: 0, name: 'a', uri: workspaceRootA },
        { index: 1, name: 'b', uri: workspaceRootB },
    ];
    test('Uses all workspace roots for a workspace resource', () => {
        const resource = vscode.Uri.parse('test:/workspace/a/docs/readme.md');
        const workspaceContext = {
            workspaceFolders,
            getWorkspaceFolder: () => workspaceFolders[0],
        };
        assert.deepStrictEqual((0, resources_1.getMarkdownLocalResourceRoots)(resource, [mediaRoot], { workspaceContext }), [mediaRoot, workspaceRootA, workspaceRootB]);
    });
    test('Uses the document directory outside a workspace', () => {
        const resource = vscode.Uri.parse('test:/outside/docs/readme.md');
        const workspaceContext = {
            workspaceFolders,
            getWorkspaceFolder: () => undefined,
        };
        assert.deepStrictEqual((0, resources_1.getMarkdownLocalResourceRoots)(resource, [mediaRoot], { workspaceContext }), [mediaRoot, vscode.Uri.parse('test:/outside/docs')]);
    });
    test('Does not include workspace resources when disabled', () => {
        const resource = vscode.Uri.parse('test:/workspace/a/docs/readme.md');
        const workspaceContext = {
            workspaceFolders,
            getWorkspaceFolder: () => workspaceFolders[0],
        };
        assert.deepStrictEqual((0, resources_1.getMarkdownLocalResourceRoots)(resource, [mediaRoot], {
            includeWorkspaceResources: false,
            workspaceContext,
        }), [mediaRoot]);
    });
});
//# sourceMappingURL=resources.test.js.map