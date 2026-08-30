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
exports.register = register;
const vscode = __importStar(require("vscode"));
const typeConverters = __importStar(require("../typeConverters"));
const typescriptService_1 = require("../typescriptService");
const signatureHelpState_1 = require("./signatureHelpState");
const dependentRegistration_1 = require("./util/dependentRegistration");
const Previewer = __importStar(require("./util/textRendering"));
class TypeScriptSignatureHelpProvider {
    client;
    static triggerCharacters = ['(', ',', '<'];
    static retriggerCharacters = [')'];
    state = new signatureHelpState_1.SignatureHelpState();
    constructor(client) {
        this.client = client;
    }
    async provideSignatureHelp(document, position, token, context) {
        const filepath = this.client.toOpenTsFilePath(document);
        if (!filepath) {
            return undefined;
        }
        const requestId = this.state.startRequest(document);
        const args = {
            ...typeConverters.Position.toFileLocationRequestArgs(filepath, position),
            triggerReason: toTsTriggerReason(context)
        };
        const response = await this.client.interruptGetErr(() => this.client.execute('signatureHelp', args, token));
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        const info = response.body;
        const result = new vscode.SignatureHelp();
        result.signatures = info.items.map(signature => this.convertSignature(signature, document.uri));
        result.activeSignature = this.state.getActiveSignature(document, requestId, context, info.selectedItemIndex, result.signatures);
        result.activeParameter = this.getActiveParameter(info, result.activeSignature);
        return result;
    }
    getActiveParameter(info, activeSignatureIndex) {
        const activeSignature = info.items[activeSignatureIndex];
        if (activeSignature?.isVariadic) {
            return Math.min(info.argumentIndex, activeSignature.parameters.length - 1);
        }
        return info.argumentIndex;
    }
    convertSignature(item, baseUri) {
        const signature = new vscode.SignatureInformation(Previewer.asPlainTextWithLinks(item.prefixDisplayParts, this.client), Previewer.documentationToMarkdown(item.documentation, item.tags.filter(x => x.name !== 'param'), this.client, baseUri));
        let textIndex = signature.label.length;
        const separatorLabel = Previewer.asPlainTextWithLinks(item.separatorDisplayParts, this.client);
        for (let i = 0; i < item.parameters.length; ++i) {
            const parameter = item.parameters[i];
            const label = Previewer.asPlainTextWithLinks(parameter.displayParts, this.client);
            signature.parameters.push(new vscode.ParameterInformation([textIndex, textIndex + label.length], Previewer.documentationToMarkdown(parameter.documentation, [], this.client, baseUri)));
            textIndex += label.length;
            signature.label += label;
            if (i !== item.parameters.length - 1) {
                signature.label += separatorLabel;
                textIndex += separatorLabel.length;
            }
        }
        signature.label += Previewer.asPlainTextWithLinks(item.suffixDisplayParts, this.client);
        return signature;
    }
}
function toTsTriggerReason(context) {
    switch (context.triggerKind) {
        case vscode.SignatureHelpTriggerKind.TriggerCharacter:
            if (context.triggerCharacter) {
                if (context.isRetrigger) {
                    return { kind: 'retrigger', triggerCharacter: context.triggerCharacter };
                }
                else {
                    return { kind: 'characterTyped', triggerCharacter: context.triggerCharacter };
                }
            }
            else {
                return { kind: 'invoked' };
            }
        case vscode.SignatureHelpTriggerKind.ContentChange:
            return context.isRetrigger ? { kind: 'retrigger' } : { kind: 'invoked' };
        case vscode.SignatureHelpTriggerKind.Invoke:
        default:
            return { kind: 'invoked' };
    }
}
function register(selector, client) {
    return (0, dependentRegistration_1.conditionalRegistration)([
        (0, dependentRegistration_1.requireSomeCapability)(client, typescriptService_1.ClientCapability.EnhancedSyntax, typescriptService_1.ClientCapability.Semantic),
    ], () => {
        return vscode.languages.registerSignatureHelpProvider(selector.syntax, new TypeScriptSignatureHelpProvider(client), {
            triggerCharacters: TypeScriptSignatureHelpProvider.triggerCharacters,
            retriggerCharacters: TypeScriptSignatureHelpProvider.retriggerCharacters
        });
    });
}
//# sourceMappingURL=signatureHelp.js.map