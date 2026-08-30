"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignatureHelpState = void 0;
/** Tracks automatic and user-selected signature help overloads between provider calls. */
class SignatureHelpState {
    requestIds = new WeakMap();
    previousSignatureHelpState = new WeakMap();
    startRequest(document) {
        const requestId = (this.requestIds.get(document) ?? 0) + 1;
        this.requestIds.set(document, requestId);
        return requestId;
    }
    getActiveSignature(document, requestId, context, typeScriptSelectedSignatureIndex, signatures) {
        if (requestId !== this.requestIds.get(document)) {
            return typeScriptSelectedSignatureIndex;
        }
        const previousSignatureHelpState = this.previousSignatureHelpState.get(document);
        const previouslyActiveSignatureHelp = context.activeSignatureHelp;
        let userSelectedSignatureLabel;
        if (context.isRetrigger
            && previousSignatureHelpState
            && previouslyActiveSignatureHelp
            && this.hasMatchingSignatures(previouslyActiveSignatureHelp.signatures, previousSignatureHelpState.signatureLabels)) {
            userSelectedSignatureLabel = previousSignatureHelpState.userSelectedSignatureLabel;
            if (previouslyActiveSignatureHelp.activeSignature !== previousSignatureHelpState.activeSignatureIndex) {
                userSelectedSignatureLabel = previouslyActiveSignatureHelp.signatures[previouslyActiveSignatureHelp.activeSignature]?.label;
            }
        }
        let activeSignatureIndex = typeScriptSelectedSignatureIndex;
        if (userSelectedSignatureLabel !== undefined) {
            const userSelectedSignatureIndex = signatures.findIndex(signature => signature.label === userSelectedSignatureLabel);
            if (userSelectedSignatureIndex >= 0) {
                activeSignatureIndex = userSelectedSignatureIndex;
            }
            else {
                userSelectedSignatureLabel = undefined;
            }
        }
        this.previousSignatureHelpState.set(document, {
            activeSignatureIndex,
            signatureLabels: signatures.map(signature => signature.label),
            userSelectedSignatureLabel,
        });
        return activeSignatureIndex;
    }
    hasMatchingSignatures(signatures, signatureLabels) {
        return signatures.length === signatureLabels.length
            && signatures.every((signature, index) => signature.label === signatureLabels[index]);
    }
}
exports.SignatureHelpState = SignatureHelpState;
//# sourceMappingURL=signatureHelpState.js.map