/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getLanguageModelCache } from '../languageModelCache.js';
import { SymbolKind, TextEdit, TextDocument, DiagnosticSeverity, Range, CompletionItemKind, DocumentHighlightKind, Position, FoldingRangeKind, SelectionRange, isCompletionItemData, FILE_PROTOCOL } from './languageModes.js';
import { MarkupKind } from 'vscode-languageserver';
import { getWordAtText, isWhitespaceOnly, repeat } from '../utils/strings.js';
import * as ts from 'typescript';
import { getSemanticTokens, getSemanticTokenLegend } from './javascriptSemanticTokens.js';
const JS_WORD_REGEX = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;
function getLanguageServiceHost(scriptKind) {
    const compilerOptions = { allowNonTsExtensions: true, allowJs: true, lib: ['lib.es2020.full.d.ts'], target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Classic, experimentalDecorators: false };
    let currentTextDocument = TextDocument.create('init', 'javascript', 1, '');
    const jsLanguageService = import(/* webpackChunkName: "javascriptLibs" */ './javascriptLibs.js').then(libs => {
        const host = {
            getCompilationSettings: () => compilerOptions,
            getScriptFileNames: () => [currentTextDocument.uri, 'jquery'],
            getScriptKind: (fileName) => {
                if (fileName === currentTextDocument.uri) {
                    return scriptKind;
                }
                return fileName.substr(fileName.length - 2) === 'ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS;
            },
            getScriptVersion: (fileName) => {
                if (fileName === currentTextDocument.uri) {
                    return String(currentTextDocument.version);
                }
                return '1'; // default lib an jquery.d.ts are static
            },
            getScriptSnapshot: (fileName) => {
                let text = '';
                if (fileName === currentTextDocument.uri) {
                    text = currentTextDocument.getText();
                }
                else {
                    text = libs.loadLibrary(fileName);
                }
                return {
                    getText: (start, end) => text.substring(start, end),
                    getLength: () => text.length,
                    getChangeRange: () => undefined
                };
            },
            getCurrentDirectory: () => '',
            getDefaultLibFileName: (_options) => 'es2020.full',
            readFile: (path, _encoding) => {
                if (path === currentTextDocument.uri) {
                    return currentTextDocument.getText();
                }
                else {
                    return libs.loadLibrary(path);
                }
            },
            fileExists: (path) => {
                if (path === currentTextDocument.uri) {
                    return true;
                }
                else {
                    return !!libs.loadLibrary(path);
                }
            },
            directoryExists: (path) => {
                // typescript tries to first find libraries in node_modules/@types and node_modules/@typescript
                // there's no node_modules in our setup
                if (path.startsWith('node_modules')) {
                    return false;
                }
                return true;
            }
        };
        return {
            service: ts.createLanguageService(host),
            loadLibrary: libs.loadLibrary,
        };
    });
    return {
        async getLanguageService(jsDocument) {
            currentTextDocument = jsDocument;
            return (await jsLanguageService).service;
        },
        getCompilationSettings() {
            return compilerOptions;
        },
        async loadLibrary(fileName) {
            return (await jsLanguageService).loadLibrary(fileName);
        },
        dispose() {
            jsLanguageService.then(s => s.service.dispose());
        }
    };
}
const ignoredErrors = [
    1108, /* A_return_statement_can_only_be_used_within_a_function_body_1108 */
    2792, /* Cannot_find_module_0_Did_you_mean_to_set_the_moduleResolution_option_to_node_or_to_add_aliases_to_the_paths_option */
];
export function getJavaScriptMode(documentRegions, languageId, workspace) {
    const jsDocuments = getLanguageModelCache(10, 60, document => documentRegions.get(document).getEmbeddedDocument(languageId));
    const host = getLanguageServiceHost(languageId === 'javascript' ? ts.ScriptKind.JS : ts.ScriptKind.TS);
    const globalSettings = {};
    const libParentUri = `${FILE_PROTOCOL}://${languageId}/libs/`;
    function updateHostSettings(settings) {
        const hostSettings = host.getCompilationSettings();
        hostSettings.experimentalDecorators = settings?.['js/ts']?.implicitProjectConfig?.experimentalDecorators;
        hostSettings.strictNullChecks = settings?.['js/ts']?.implicitProjectConfig.strictNullChecks;
    }
    return {
        getId() {
            return languageId;
        },
        async doValidation(document, settings = workspace.settings) {
            updateHostSettings(settings);
            const diagnostics = [];
            for (const jsDocument of documentRegions.get(document).getEmbeddedDocuments(languageId)) {
                const languageService = await host.getLanguageService(jsDocument);
                const syntaxDiagnostics = languageService.getSyntacticDiagnostics(jsDocument.uri);
                const semanticDiagnostics = languageService.getSemanticDiagnostics(jsDocument.uri);
                diagnostics.push(...syntaxDiagnostics.concat(semanticDiagnostics).filter(d => !ignoredErrors.includes(d.code)).map((diag) => {
                    return {
                        range: convertRange(jsDocument, diag),
                        severity: DiagnosticSeverity.Error,
                        source: languageId,
                        message: ts.flattenDiagnosticMessageText(diag.messageText, '\n')
                    };
                }));
            }
            return diagnostics;
        },
        async doComplete(document, position, _documentContext) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            const offset = jsDocument.offsetAt(position);
            const completions = jsLanguageService.getCompletionsAtPosition(jsDocument.uri, offset, { includeExternalModuleExports: false, includeInsertTextCompletions: false });
            if (!completions) {
                return { isIncomplete: false, items: [] };
            }
            const replaceRange = convertRange(jsDocument, getWordAtText(jsDocument.getText(), offset, JS_WORD_REGEX));
            return {
                isIncomplete: false,
                items: completions.entries.map(entry => {
                    const data = {
                        languageId,
                        uri: document.uri,
                        offset: offset
                    };
                    return {
                        uri: document.uri,
                        position: position,
                        label: entry.name,
                        sortText: entry.sortText,
                        kind: convertKind(entry.kind),
                        textEdit: TextEdit.replace(replaceRange, entry.name),
                        data
                    };
                })
            };
        },
        async doResolve(document, item) {
            if (isCompletionItemData(item.data)) {
                const jsDocument = jsDocuments.get(document);
                const jsLanguageService = await host.getLanguageService(jsDocument);
                const details = jsLanguageService.getCompletionEntryDetails(jsDocument.uri, item.data.offset, item.label, undefined, undefined, undefined, undefined);
                if (details) {
                    item.detail = ts.displayPartsToString(details.displayParts);
                    item.documentation = ts.displayPartsToString(details.documentation);
                    delete item.data;
                }
            }
            return item;
        },
        async doHover(document, position) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            const info = jsLanguageService.getQuickInfoAtPosition(jsDocument.uri, jsDocument.offsetAt(position));
            if (info) {
                const signature = ts.displayPartsToString(info.displayParts);
                const documentation = ts.displayPartsToString(info.documentation);
                const tags = tagsToMarkdown(info.tags);
                const parts = [];
                if (signature) {
                    parts.push(['```typescript', signature, '```'].join('\n'));
                }
                if (documentation) {
                    parts.push(documentation);
                }
                if (tags) {
                    parts.push(tags);
                }
                return {
                    range: convertRange(jsDocument, info.textSpan),
                    contents: {
                        kind: MarkupKind.Markdown,
                        value: parts.join('\n\n')
                    }
                };
            }
            return null;
        },
        async doSignatureHelp(document, position) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            const signHelp = jsLanguageService.getSignatureHelpItems(jsDocument.uri, jsDocument.offsetAt(position), undefined);
            if (signHelp) {
                const ret = {
                    activeSignature: signHelp.selectedItemIndex,
                    activeParameter: signHelp.argumentIndex,
                    signatures: []
                };
                signHelp.items.forEach(item => {
                    const signature = {
                        label: '',
                        documentation: undefined,
                        parameters: []
                    };
                    signature.label += ts.displayPartsToString(item.prefixDisplayParts);
                    item.parameters.forEach((p, i, a) => {
                        const label = ts.displayPartsToString(p.displayParts);
                        const parameter = {
                            label: label,
                            documentation: ts.displayPartsToString(p.documentation)
                        };
                        signature.label += label;
                        signature.parameters.push(parameter);
                        if (i < a.length - 1) {
                            signature.label += ts.displayPartsToString(item.separatorDisplayParts);
                        }
                    });
                    signature.label += ts.displayPartsToString(item.suffixDisplayParts);
                    ret.signatures.push(signature);
                });
                return ret;
            }
            return null;
        },
        async doRename(document, position, newName) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            const jsDocumentPosition = jsDocument.offsetAt(position);
            const { canRename } = jsLanguageService.getRenameInfo(jsDocument.uri, jsDocumentPosition);
            if (!canRename) {
                return null;
            }
            const renameInfos = jsLanguageService.findRenameLocations(jsDocument.uri, jsDocumentPosition, false, false);
            const edits = [];
            renameInfos?.map(renameInfo => {
                edits.push({
                    range: convertRange(jsDocument, renameInfo.textSpan),
                    newText: newName,
                });
            });
            return {
                changes: { [document.uri]: edits },
            };
        },
        async findDocumentHighlight(document, position) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            const highlights = jsLanguageService.getDocumentHighlights(jsDocument.uri, jsDocument.offsetAt(position), [jsDocument.uri]);
            const out = [];
            for (const entry of highlights || []) {
                for (const highlight of entry.highlightSpans) {
                    out.push({
                        range: convertRange(jsDocument, highlight.textSpan),
                        kind: highlight.kind === 'writtenReference' ? DocumentHighlightKind.Write : DocumentHighlightKind.Text
                    });
                }
            }
            return out;
        },
        async findDocumentSymbols(document) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            const items = jsLanguageService.getNavigationBarItems(jsDocument.uri);
            if (items) {
                const result = [];
                const existing = Object.create(null);
                const collectSymbols = (item, containerLabel) => {
                    const sig = item.text + item.kind + item.spans[0].start;
                    if (item.kind !== 'script' && !existing[sig]) {
                        const symbol = {
                            name: item.text,
                            kind: convertSymbolKind(item.kind),
                            location: {
                                uri: document.uri,
                                range: convertRange(jsDocument, item.spans[0])
                            },
                            containerName: containerLabel
                        };
                        existing[sig] = true;
                        result.push(symbol);
                        containerLabel = item.text;
                    }
                    if (item.childItems && item.childItems.length > 0) {
                        for (const child of item.childItems) {
                            collectSymbols(child, containerLabel);
                        }
                    }
                };
                items.forEach(item => collectSymbols(item));
                return result;
            }
            return [];
        },
        async findDefinition(document, position) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            const definition = jsLanguageService.getDefinitionAtPosition(jsDocument.uri, jsDocument.offsetAt(position));
            if (definition) {
                return (await Promise.all(definition.map(async (d) => {
                    if (d.fileName === jsDocument.uri) {
                        return {
                            uri: document.uri,
                            range: convertRange(jsDocument, d.textSpan)
                        };
                    }
                    else {
                        const libUri = libParentUri + d.fileName;
                        const content = await host.loadLibrary(d.fileName);
                        if (!content) {
                            return undefined;
                        }
                        const libDocument = TextDocument.create(libUri, languageId, 1, content);
                        return {
                            uri: libUri,
                            range: convertRange(libDocument, d.textSpan)
                        };
                    }
                }))).filter(d => !!d);
            }
            return null;
        },
        async findReferences(document, position) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            const references = jsLanguageService.getReferencesAtPosition(jsDocument.uri, jsDocument.offsetAt(position));
            if (references) {
                return references.filter(d => d.fileName === jsDocument.uri).map(d => {
                    return {
                        uri: document.uri,
                        range: convertRange(jsDocument, d.textSpan)
                    };
                });
            }
            return [];
        },
        async getSelectionRange(document, position) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            function convertSelectionRange(selectionRange) {
                const parent = selectionRange.parent ? convertSelectionRange(selectionRange.parent) : undefined;
                return SelectionRange.create(convertRange(jsDocument, selectionRange.textSpan), parent);
            }
            const range = jsLanguageService.getSmartSelectionRange(jsDocument.uri, jsDocument.offsetAt(position));
            return convertSelectionRange(range);
        },
        async format(document, range, formatParams, settings = globalSettings) {
            const jsDocument = documentRegions.get(document).getEmbeddedDocument('javascript', true);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            const formatterSettings = settings && settings.javascript && settings.javascript.format;
            const initialIndentLevel = computeInitialIndent(document, range, formatParams);
            const formatSettings = convertOptions(formatParams, formatterSettings, initialIndentLevel + 1);
            const start = jsDocument.offsetAt(range.start);
            let end = jsDocument.offsetAt(range.end);
            let lastLineRange = null;
            if (range.end.line > range.start.line && (range.end.character === 0 || isWhitespaceOnly(jsDocument.getText().substr(end - range.end.character, range.end.character)))) {
                end -= range.end.character;
                lastLineRange = Range.create(Position.create(range.end.line, 0), range.end);
            }
            const edits = jsLanguageService.getFormattingEditsForRange(jsDocument.uri, start, end, formatSettings);
            if (edits) {
                const result = [];
                for (const edit of edits) {
                    if (edit.span.start >= start && edit.span.start + edit.span.length <= end) {
                        result.push({
                            range: convertRange(jsDocument, edit.span),
                            newText: edit.newText
                        });
                    }
                }
                if (lastLineRange) {
                    result.push({
                        range: lastLineRange,
                        newText: generateIndent(initialIndentLevel, formatParams)
                    });
                }
                return result;
            }
            return [];
        },
        async getFoldingRanges(document) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            const spans = jsLanguageService.getOutliningSpans(jsDocument.uri);
            const ranges = [];
            for (const span of spans) {
                const curr = convertRange(jsDocument, span.textSpan);
                const startLine = curr.start.line;
                const endLine = curr.end.line;
                if (startLine < endLine) {
                    const foldingRange = { startLine, endLine };
                    const match = document.getText(curr).match(/^\s*\/(?:(\/\s*#(?:end)?region\b)|(\*|\/))/);
                    if (match) {
                        foldingRange.kind = match[1] ? FoldingRangeKind.Region : FoldingRangeKind.Comment;
                    }
                    ranges.push(foldingRange);
                }
            }
            return ranges;
        },
        onDocumentRemoved(document) {
            jsDocuments.onDocumentRemoved(document);
        },
        async getSemanticTokens(document) {
            const jsDocument = jsDocuments.get(document);
            const jsLanguageService = await host.getLanguageService(jsDocument);
            return [...getSemanticTokens(jsLanguageService, jsDocument, jsDocument.uri)];
        },
        getSemanticTokenLegend() {
            return getSemanticTokenLegend();
        },
        async getTextDocumentContent(documentUri) {
            if (documentUri.startsWith(libParentUri)) {
                return host.loadLibrary(documentUri.substring(libParentUri.length));
            }
            return undefined;
        },
        dispose() {
            host.dispose();
            jsDocuments.dispose();
        }
    };
}
function tagToMarkdown(tag) {
    const text = ts.displayPartsToString(tag.text);
    switch (tag.name) {
        case 'param':
        case 'template':
        case 'augments':
        case 'extends': {
            // Parse out the parameter name, e.g. "name - description" or "name description"
            const match = text.match(/^(\S+)\s*-?\s*(.*)$/s);
            if (match) {
                const param = match[1];
                const doc = match[2];
                const label = `*@${tag.name}* \`${param}\``;
                if (!doc) {
                    return label;
                }
                return label + (doc.match(/\r\n|\n/g) ? '  \n' + doc : ` — ${doc}`);
            }
            break;
        }
    }
    const label = `*@${tag.name}*`;
    if (!text) {
        return label;
    }
    return label + (text.match(/\r\n|\n/g) ? '  \n' + text : ` — ${text}`);
}
function tagsToMarkdown(tags) {
    if (!tags || tags.length === 0) {
        return '';
    }
    return tags.map(tagToMarkdown).join('  \n\n');
}
function convertRange(document, span) {
    if (typeof span.start === 'undefined') {
        const pos = document.positionAt(0);
        return Range.create(pos, pos);
    }
    const startPosition = document.positionAt(span.start);
    const endPosition = document.positionAt(span.start + (span.length || 0));
    return Range.create(startPosition, endPosition);
}
function convertKind(kind) {
    switch (kind) {
        case "primitive type" /* Kind.primitiveType */:
        case "keyword" /* Kind.keyword */:
            return CompletionItemKind.Keyword;
        case "const" /* Kind.const */:
        case "let" /* Kind.let */:
        case "var" /* Kind.variable */:
        case "local var" /* Kind.localVariable */:
        case "alias" /* Kind.alias */:
        case "parameter" /* Kind.parameter */:
            return CompletionItemKind.Variable;
        case "property" /* Kind.memberVariable */:
        case "getter" /* Kind.memberGetAccessor */:
        case "setter" /* Kind.memberSetAccessor */:
            return CompletionItemKind.Field;
        case "function" /* Kind.function */:
        case "local function" /* Kind.localFunction */:
            return CompletionItemKind.Function;
        case "method" /* Kind.method */:
        case "construct" /* Kind.constructSignature */:
        case "call" /* Kind.callSignature */:
        case "index" /* Kind.indexSignature */:
            return CompletionItemKind.Method;
        case "enum" /* Kind.enum */:
            return CompletionItemKind.Enum;
        case "enum member" /* Kind.enumMember */:
            return CompletionItemKind.EnumMember;
        case "module" /* Kind.module */:
        case "external module name" /* Kind.externalModuleName */:
            return CompletionItemKind.Module;
        case "class" /* Kind.class */:
        case "type" /* Kind.type */:
            return CompletionItemKind.Class;
        case "interface" /* Kind.interface */:
            return CompletionItemKind.Interface;
        case "warning" /* Kind.warning */:
            return CompletionItemKind.Text;
        case "script" /* Kind.script */:
            return CompletionItemKind.File;
        case "directory" /* Kind.directory */:
            return CompletionItemKind.Folder;
        case "string" /* Kind.string */:
            return CompletionItemKind.Constant;
        default:
            return CompletionItemKind.Property;
    }
}
function convertSymbolKind(kind) {
    switch (kind) {
        case "module" /* Kind.module */: return SymbolKind.Module;
        case "class" /* Kind.class */: return SymbolKind.Class;
        case "enum" /* Kind.enum */: return SymbolKind.Enum;
        case "enum member" /* Kind.enumMember */: return SymbolKind.EnumMember;
        case "interface" /* Kind.interface */: return SymbolKind.Interface;
        case "index" /* Kind.indexSignature */: return SymbolKind.Method;
        case "call" /* Kind.callSignature */: return SymbolKind.Method;
        case "method" /* Kind.method */: return SymbolKind.Method;
        case "property" /* Kind.memberVariable */: return SymbolKind.Property;
        case "getter" /* Kind.memberGetAccessor */: return SymbolKind.Property;
        case "setter" /* Kind.memberSetAccessor */: return SymbolKind.Property;
        case "var" /* Kind.variable */: return SymbolKind.Variable;
        case "let" /* Kind.let */: return SymbolKind.Variable;
        case "const" /* Kind.const */: return SymbolKind.Variable;
        case "local var" /* Kind.localVariable */: return SymbolKind.Variable;
        case "alias" /* Kind.alias */: return SymbolKind.Variable;
        case "function" /* Kind.function */: return SymbolKind.Function;
        case "local function" /* Kind.localFunction */: return SymbolKind.Function;
        case "construct" /* Kind.constructSignature */: return SymbolKind.Constructor;
        case "constructor" /* Kind.constructorImplementation */: return SymbolKind.Constructor;
        case "type parameter" /* Kind.typeParameter */: return SymbolKind.TypeParameter;
        case "string" /* Kind.string */: return SymbolKind.String;
        default: return SymbolKind.Variable;
    }
}
function convertOptions(options, formatSettings, initialIndentLevel) {
    return {
        convertTabsToSpaces: options.insertSpaces,
        tabSize: options.tabSize,
        indentSize: options.tabSize,
        indentStyle: ts.IndentStyle.Smart,
        newLineCharacter: '\n',
        baseIndentSize: options.tabSize * initialIndentLevel,
        insertSpaceAfterCommaDelimiter: Boolean(!formatSettings || formatSettings.insertSpaceAfterCommaDelimiter),
        insertSpaceAfterConstructor: Boolean(formatSettings && formatSettings.insertSpaceAfterConstructor),
        insertSpaceAfterSemicolonInForStatements: Boolean(!formatSettings || formatSettings.insertSpaceAfterSemicolonInForStatements),
        insertSpaceBeforeAndAfterBinaryOperators: Boolean(!formatSettings || formatSettings.insertSpaceBeforeAndAfterBinaryOperators),
        insertSpaceAfterKeywordsInControlFlowStatements: Boolean(!formatSettings || formatSettings.insertSpaceAfterKeywordsInControlFlowStatements),
        insertSpaceAfterFunctionKeywordForAnonymousFunctions: Boolean(!formatSettings || formatSettings.insertSpaceAfterFunctionKeywordForAnonymousFunctions),
        insertSpaceBeforeFunctionParenthesis: Boolean(formatSettings && formatSettings.insertSpaceBeforeFunctionParenthesis),
        insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis),
        insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets),
        insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces),
        insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: Boolean(!formatSettings || formatSettings.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces),
        insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces),
        insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces),
        insertSpaceAfterTypeAssertion: Boolean(formatSettings && formatSettings.insertSpaceAfterTypeAssertion),
        placeOpenBraceOnNewLineForControlBlocks: Boolean(formatSettings && formatSettings.placeOpenBraceOnNewLineForFunctions),
        placeOpenBraceOnNewLineForFunctions: Boolean(formatSettings && formatSettings.placeOpenBraceOnNewLineForControlBlocks),
        semicolons: formatSettings?.semicolons
    };
}
function computeInitialIndent(document, range, options) {
    const lineStart = document.offsetAt(Position.create(range.start.line, 0));
    const content = document.getText();
    let i = lineStart;
    let nChars = 0;
    const tabSize = options.tabSize || 4;
    while (i < content.length) {
        const ch = content.charAt(i);
        if (ch === ' ') {
            nChars++;
        }
        else if (ch === '\t') {
            nChars += tabSize;
        }
        else {
            break;
        }
        i++;
    }
    return Math.floor(nChars / tabSize);
}
function generateIndent(level, options) {
    if (options.insertSpaces) {
        return repeat(' ', level * options.tabSize);
    }
    else {
        return repeat('\t', level);
    }
}
//# sourceMappingURL=javascriptMode.js.map