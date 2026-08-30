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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
suite('vscode API - Module Interception', () => {
    test('import and require(vscode) return the same API instance in ESM', async function () {
        // This file CANNOT be written to the OS temp directory.
        // The VS Code API module interceptor looks up the extension by associating
        // the parent URL via path containment. If the file is placed outside the
        // extension's directory, the interceptor will fail to provide the 'vscode' module.
        const testFile = path.join(__dirname, 'esm-test.mjs');
        try {
            try {
                fs.writeFileSync(testFile, `
// THIS IS A TEMPORARY FILE CREATED BY VSCODE-API-TESTS (module.test.ts)
// IT SHOULD BE AUTO-DELETED. IF YOU SEE THIS, IT IS SAFE TO REMOVE.
import * as vscode1 from 'vscode';
import { createRequire } from 'node:module';
import * as assert from 'assert';

export function runTest() {
	const vscode2 = createRequire(import.meta.url)('vscode');
	assert.ok(Object.keys(vscode1).length > 0);
	for (const key of Object.keys(vscode1)) {
		assert.strictEqual(vscode1[key], vscode2[key], "Mismatch at " + key);
	}
	return true;
}
`);
            }
            catch (err) {
                this.skip();
            }
            const asyncImport = new Function('url', 'return import(url)');
            const m = await asyncImport(vscode.Uri.file(testFile).toString(true));
            assert.strictEqual(m.runTest(), true);
        }
        finally {
            try {
                fs.unlinkSync(testFile);
            }
            catch (err) { /* ignore */ }
        }
    });
});
//# sourceMappingURL=module.test.js.map