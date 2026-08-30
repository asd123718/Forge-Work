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
const vscode = __importStar(require("vscode"));
const github_1 = require("../github");
suite('account avatar caching', () => {
    test('a pending session needs a lookup, and its serialized no-avatar result no longer needs one', () => {
        const pendingSession = {
            id: 'session1',
            account: { id: 'account1', label: 'Some One' },
            scopes: [],
            accessToken: 'token'
        };
        const noAvatarIcon = (0, github_1.serializeAccountIcon)(undefined, true);
        const cachedNoAvatarSession = {
            id: 'session1',
            account: { id: 'account1', label: 'Some One', icon: noAvatarIcon },
            scopes: [],
            accessToken: 'token'
        };
        assert.deepStrictEqual([(0, github_1.needsAccountIconLookup)(pendingSession), noAvatarIcon, (0, github_1.needsAccountIconLookup)(cachedNoAvatarSession)], [true, null, false]);
    });
    test('a resolved avatar URI is serialized as-is and is never replaced by null', () => {
        const icon = vscode.Uri.parse('https://example.com/avatar.png');
        assert.deepStrictEqual((0, github_1.serializeAccountIcon)(icon, true), {
            scheme: icon.scheme,
            authority: icon.authority,
            path: icon.path,
            query: icon.query,
            fragment: icon.fragment
        });
    });
});
//# sourceMappingURL=github.test.js.map