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
const openDocumentLink_1 = require("../util/openDocumentLink");
suite('Open Markdown document link', () => {
    test('recognizes absolute links without treating relative links as URIs', () => {
        assert.deepStrictEqual({
            github: (0, openDocumentLink_1.getAbsoluteUri)('https://github.com/microsoft/vscode/issues/123')?.toString(),
            session: (0, openDocumentLink_1.getAbsoluteUri)('agent-host-session://copilotcli/session-id?chat=chat-id')?.toString(),
            file: (0, openDocumentLink_1.getAbsoluteUri)('file:///workspace/readme.md')?.toString(),
            windowsForwardSlash: (0, openDocumentLink_1.getAbsoluteUri)('C:/workspace/readme.md'),
            windowsBackslash: (0, openDocumentLink_1.getAbsoluteUri)('C:\\workspace\\readme.md'),
            relative: (0, openDocumentLink_1.getAbsoluteUri)('./readme.md'),
        }, {
            github: 'https://github.com/microsoft/vscode/issues/123',
            session: 'agent-host-session://copilotcli/session-id?chat%3Dchat-id',
            file: 'file:///workspace/readme.md',
            windowsForwardSlash: undefined,
            windowsBackslash: undefined,
            relative: undefined,
        });
    });
});
//# sourceMappingURL=openDocumentLink.test.js.map