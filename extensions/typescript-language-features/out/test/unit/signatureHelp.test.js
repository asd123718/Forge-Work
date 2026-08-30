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
const signatureHelpState_1 = require("../../languageFeatures/signatureHelpState");
function createSignatures(...labels) {
    return labels.map(label => ({ label, parameters: [] }));
}
function createContext(signatures, activeSignature = 0) {
    return {
        triggerKind: 2,
        triggerCharacter: ',',
        isRetrigger: signatures !== undefined,
        activeSignatureHelp: signatures ? {
            signatures,
            activeSignature,
            activeParameter: 0,
        } : undefined,
    };
}
function getActiveSignature(state, document, context, typeScriptSelectedSignatureIndex, signatures) {
    const requestId = state.startRequest(document);
    return state.getActiveSignature(document, requestId, context, typeScriptSelectedSignatureIndex, signatures);
}
suite('SignatureHelpState', () => {
    const document = {};
    test('updates the active signature when TypeScript changes its recommendation (#268728)', () => {
        const state = new signatureHelpState_1.SignatureHelpState();
        const signatures = createSignatures('foo(x: number, y: number)', 'foo(x: string, y: string)');
        const initial = getActiveSignature(state, document, createContext(), 0, signatures);
        const retrigger = getActiveSignature(state, document, createContext(signatures, initial), 1, signatures);
        assert.deepStrictEqual([initial, retrigger], [0, 1]);
    });
    test('preserves an overload selected by the user (#94834)', () => {
        const state = new signatureHelpState_1.SignatureHelpState();
        const signatures = createSignatures('foo(x: number, y: "abc")', 'foo(x: number, y: "xyz")');
        const initial = getActiveSignature(state, document, createContext(), 0, signatures);
        const afterUserSelection = getActiveSignature(state, document, createContext(signatures, 1), 0, signatures);
        const matchingTypeScriptSelection = getActiveSignature(state, document, createContext(signatures, afterUserSelection), 1, signatures);
        const retrigger = getActiveSignature(state, document, createContext(signatures, matchingTypeScriptSelection), 0, signatures);
        assert.deepStrictEqual([initial, afterUserSelection, matchingTypeScriptSelection, retrigger], [0, 1, 1, 1]);
    });
    test('tracks automatic and user selections across signature reordering', () => {
        const state = new signatureHelpState_1.SignatureHelpState();
        const initialSignatures = createSignatures('foo(x: number)', 'foo(x: string)');
        const reorderedSignatures = createSignatures('foo(x: string)', 'foo(x: number)');
        const initial = getActiveSignature(state, document, createContext(), 0, initialSignatures);
        const automaticSelection = getActiveSignature(state, document, createContext(initialSignatures, initial), 1, reorderedSignatures);
        const newState = new signatureHelpState_1.SignatureHelpState();
        getActiveSignature(newState, document, createContext(), 0, initialSignatures);
        const userSelection = getActiveSignature(newState, document, createContext(initialSignatures, 1), 1, reorderedSignatures);
        assert.deepStrictEqual([automaticSelection, userSelection], [1, 0]);
    });
    test('uses the TypeScript recommendation when the user-selected signature is removed', () => {
        const state = new signatureHelpState_1.SignatureHelpState();
        const initialSignatures = createSignatures('foo(x: number)', 'foo(x: string)');
        const updatedSignatures = createSignatures('foo(x: number)');
        getActiveSignature(state, document, createContext(), 0, initialSignatures);
        const actual = getActiveSignature(state, document, createContext(initialSignatures, 1), 0, updatedSignatures);
        assert.strictEqual(actual, 0);
    });
    test('does not infer a user selection without previous state for the document', () => {
        const state = new signatureHelpState_1.SignatureHelpState();
        const signatures = createSignatures('foo(x: number)', 'foo(x: string)');
        const actual = getActiveSignature(state, document, createContext(signatures, 1), 0, signatures);
        assert.strictEqual(actual, 0);
    });
    test('does not infer a user selection from unrelated previous signature help', () => {
        const state = new signatureHelpState_1.SignatureHelpState();
        const initialSignatures = createSignatures('foo(x: number)', 'foo(x: string)');
        const unrelatedSignatures = createSignatures('bar(x: number)', 'bar(x: string)');
        getActiveSignature(state, document, createContext(), 0, initialSignatures);
        const actual = getActiveSignature(state, document, createContext(unrelatedSignatures, 1), 0, unrelatedSignatures);
        assert.strictEqual(actual, 0);
    });
    test('does not update state from an obsolete request', () => {
        const state = new signatureHelpState_1.SignatureHelpState();
        const signatures = createSignatures('foo(x: number)', 'foo(x: string)');
        getActiveSignature(state, document, createContext(), 0, signatures);
        const obsoleteRequestId = state.startRequest(document);
        const currentRequestId = state.startRequest(document);
        state.getActiveSignature(document, obsoleteRequestId, createContext(signatures, 0), 1, signatures);
        const actual = state.getActiveSignature(document, currentRequestId, createContext(signatures, 0), 1, signatures);
        assert.strictEqual(actual, 1);
    });
});
//# sourceMappingURL=signatureHelp.test.js.map