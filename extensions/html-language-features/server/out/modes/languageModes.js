/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getCSSLanguageService } from 'vscode-css-languageservice';
import { getLanguageService as getHTMLLanguageService, ClientCapabilities, TokenType } from 'vscode-html-languageservice';
import { getLanguageModelCache } from '../languageModelCache.js';
import { getCSSMode } from './cssMode.js';
import { getDocumentRegions } from './embeddedSupport.js';
import { getHTMLMode } from './htmlMode.js';
import { getJavaScriptMode } from './javascriptMode.js';
export { WorkspaceFolder, CompletionItem, CompletionList, CompletionItemKind, Diagnostic, DocumentHighlight, DocumentHighlightKind, DocumentLink, FoldingRange, FoldingRangeKind, FormattingOptions, Hover, Location, Position, Range, SymbolInformation, SymbolKind, TextEdit, Color, ColorInformation, ColorPresentation, WorkspaceEdit, SignatureInformation, ParameterInformation, DiagnosticSeverity, SelectionRange, TextDocumentIdentifier } from 'vscode-languageserver';
export { ClientCapabilities, TokenType };
export { TextDocument } from 'vscode-languageserver-textdocument';
export function isCompletionItemData(value) {
    return value && typeof value.languageId === 'string' && typeof value.uri === 'string' && typeof value.offset === 'number';
}
export const FILE_PROTOCOL = 'html-server';
export function getLanguageModes(supportedLanguages, workspace, clientCapabilities, requestService) {
    const htmlLanguageService = getHTMLLanguageService({ clientCapabilities, fileSystemProvider: requestService });
    const cssLanguageService = getCSSLanguageService({ clientCapabilities, fileSystemProvider: requestService });
    const documentRegions = getLanguageModelCache(10, 60, document => getDocumentRegions(htmlLanguageService, document));
    let modelCaches = [];
    modelCaches.push(documentRegions);
    let modes = Object.create(null);
    modes['html'] = getHTMLMode(htmlLanguageService, workspace);
    if (supportedLanguages['css']) {
        modes['css'] = getCSSMode(cssLanguageService, documentRegions, workspace);
    }
    if (supportedLanguages['javascript']) {
        modes['javascript'] = getJavaScriptMode(documentRegions, 'javascript', workspace);
        modes['typescript'] = getJavaScriptMode(documentRegions, 'typescript', workspace);
    }
    return {
        async updateDataProviders(dataProviders) {
            htmlLanguageService.setDataProviders(true, dataProviders);
        },
        getModeAtPosition(document, position) {
            const languageId = documentRegions.get(document).getLanguageAtPosition(position);
            if (languageId) {
                return modes[languageId];
            }
            return undefined;
        },
        getModesInRange(document, range) {
            return documentRegions.get(document).getLanguageRanges(range).map((r) => {
                return {
                    start: r.start,
                    end: r.end,
                    mode: r.languageId && modes[r.languageId],
                    attributeValue: r.attributeValue
                };
            });
        },
        getAllModesInDocument(document) {
            const result = [];
            for (const languageId of documentRegions.get(document).getLanguagesInDocument()) {
                const mode = modes[languageId];
                if (mode) {
                    result.push(mode);
                }
            }
            return result;
        },
        getAllModes() {
            const result = [];
            for (const languageId in modes) {
                const mode = modes[languageId];
                if (mode) {
                    result.push(mode);
                }
            }
            return result;
        },
        getMode(languageId) {
            return modes[languageId];
        },
        onDocumentRemoved(document) {
            modelCaches.forEach(mc => mc.onDocumentRemoved(document));
            for (const mode in modes) {
                modes[mode].onDocumentRemoved(document);
            }
        },
        dispose() {
            modelCaches.forEach(mc => mc.dispose());
            modelCaches = [];
            for (const mode in modes) {
                modes[mode].dispose();
            }
            modes = {};
        }
    };
}
//# sourceMappingURL=languageModes.js.map