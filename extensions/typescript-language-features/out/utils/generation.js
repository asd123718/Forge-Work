"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGenerationGuardedHandler = createGenerationGuardedHandler;
function createGenerationGuardedHandler(generation, getCurrentGeneration, isActive, handler) {
    return value => {
        if (getCurrentGeneration() === generation && isActive()) {
            handler(value);
        }
    };
}
//# sourceMappingURL=generation.js.map