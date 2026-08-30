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
exports.getMarkdownLocalResourceRoots = getMarkdownLocalResourceRoots;
exports.areUrisEqual = areUrisEqual;
const vscode = __importStar(require("vscode"));
const vscode_uri_1 = require("vscode-uri");
function getMarkdownLocalResourceRoots(resource, baseRoots, options = {}) {
    const roots = [...baseRoots];
    if (options.includeWorkspaceResources === false) {
        return roots;
    }
    const workspaceContext = options.workspaceContext ?? vscode.workspace;
    if (workspaceContext.getWorkspaceFolder(resource)) {
        roots.push(...workspaceContext.workspaceFolders?.map(folder => folder.uri) ?? []);
    }
    else {
        roots.push(vscode_uri_1.Utils.dirname(resource));
    }
    return roots;
}
function areUrisEqual(uri1, uri2) {
    if (uri1.scheme !== uri2.scheme) {
        return false;
    }
    if (uri1.authority !== uri2.authority) {
        return false;
    }
    if (uri1.scheme === 'file') {
        if (process.platform === 'win32' || process.platform === 'darwin') {
            return uri1.fsPath.toLowerCase() === uri2.fsPath.toLowerCase();
        }
        return uri1.fsPath === uri2.fsPath;
    }
    return uri1.toString() === uri2.toString();
}
//# sourceMappingURL=resources.js.map