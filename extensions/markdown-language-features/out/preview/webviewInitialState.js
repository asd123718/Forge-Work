"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeWebviewInitialState = encodeWebviewInitialState;
/**
 * Encodes the initial state using an alphabet that cannot terminate or add an HTML attribute.
 */
function encodeWebviewInitialState(state) {
    return encodeURIComponent(JSON.stringify(state));
}
//# sourceMappingURL=webviewInitialState.js.map