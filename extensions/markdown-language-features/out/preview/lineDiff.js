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
exports.MarkdownPreviewLineDiffProvider = void 0;
const vscode = __importStar(require("vscode"));
class MarkdownPreviewLineDiffProvider {
    #originalDocument;
    #modifiedDocument;
    #cachedOriginalVersion = -1;
    #cachedModifiedVersion = -1;
    #cachedLineChanges;
    constructor(originalDocument, modifiedDocument) {
        this.#originalDocument = originalDocument;
        this.#modifiedDocument = modifiedDocument;
    }
    async getOriginalLineChanges() {
        const changes = await this.#getLineChanges();
        const deleted = changes.deleted;
        const innerChanges = changes.originalInnerChanges;
        return deleted.length || innerChanges.length ? { deleted, innerChanges } : undefined;
    }
    async getModifiedLineChanges(options) {
        const changes = await this.#getLineChanges();
        const added = changes.added;
        const innerChanges = changes.modifiedInnerChanges;
        const changeIndicators = options?.includeChangeIndicators === false ? [] : changes.changeIndicators;
        return added.length || innerChanges.length || changeIndicators.length ? { added, innerChanges, changeIndicators } : undefined;
    }
    async getChangedLineRanges() {
        return (await this.#getLineChanges()).changedLineRanges;
    }
    async translateOriginalLineToModified(line) {
        return translateLine(line, (await this.#getLineChanges()).originalToModified, this.#modifiedDocument.lineCount);
    }
    async translateModifiedLineToOriginal(line) {
        return translateLine(line, (await this.#getLineChanges()).modifiedToOriginal, this.#originalDocument.lineCount);
    }
    async getOriginalToModifiedMappings() {
        return (await this.#getLineChanges()).originalToModified;
    }
    async getModifiedToOriginalMappings() {
        return (await this.#getLineChanges()).modifiedToOriginal;
    }
    #getLineChanges() {
        if (!this.#cachedLineChanges || this.#cachedOriginalVersion !== this.#originalDocument.version || this.#cachedModifiedVersion !== this.#modifiedDocument.version) {
            this.#cachedOriginalVersion = this.#originalDocument.version;
            this.#cachedModifiedVersion = this.#modifiedDocument.version;
            this.#cachedLineChanges = computeLineChanges(this.#originalDocument, this.#modifiedDocument);
        }
        return this.#cachedLineChanges;
    }
}
exports.MarkdownPreviewLineDiffProvider = MarkdownPreviewLineDiffProvider;
async function computeLineChanges(originalDocument, modifiedDocument) {
    const diff = vscode.workspace.getTextDiff(originalDocument, modifiedDocument, {
        ignoreTrimWhitespace: false,
        maxComputationTimeMs: 5000,
    });
    const originalLineCount = originalDocument.lineCount;
    const modifiedLineCount = modifiedDocument.lineCount;
    const added = [];
    const deleted = [];
    const originalInnerChanges = [];
    const modifiedInnerChanges = [];
    const changedLineRanges = [];
    const mappings = createEmptyLineMappings(originalLineCount, modifiedLineCount);
    let lastOriginalEnd = 0;
    let lastModifiedEnd = 0;
    for await (const change of diff.changes) {
        const origStart = change.originalRange.start.line;
        const origEnd = change.originalRange.end.line;
        const modStart = change.modifiedRange.start.line;
        const modEnd = change.modifiedRange.end.line;
        // Map unchanged lines before this change
        fillUnchangedLineMappings(mappings, lastOriginalEnd, origStart, lastModifiedEnd, modStart);
        // Mark deleted and added lines within this change
        for (let i = origStart; i < origEnd; ++i) {
            deleted.push(i);
            mappings.originalToModified[i] = clampLine(modStart, modifiedLineCount);
        }
        for (let i = modStart; i < modEnd; ++i) {
            added.push(i);
            mappings.modifiedToOriginal[i] = clampLine(origStart, originalLineCount);
        }
        // Collect change indicators for deletions and modifications
        const origChangedCount = origEnd - origStart;
        if (origChangedCount > 0) {
            changedLineRanges.push(change);
        }
        // Collect inner changes (character-level changes within modified lines)
        if (change.innerChanges) {
            for (const inner of change.innerChanges) {
                collectInnerChangesForSide(inner.originalRange, originalInnerChanges);
                collectInnerChangesForSide(inner.modifiedRange, modifiedInnerChanges);
            }
        }
        lastOriginalEnd = origEnd;
        lastModifiedEnd = modEnd;
    }
    // Map unchanged lines after the last change
    fillUnchangedLineMappings(mappings, lastOriginalEnd, originalLineCount, lastModifiedEnd, modifiedLineCount);
    fillMissingLineMappings(mappings);
    const splitChangedLineRanges = splitChangedLineRangesByMarkdownBlocks(changedLineRanges, originalDocument, modifiedDocument);
    const changeIndicators = createChangeIndicators(splitChangedLineRanges, originalDocument, modifiedDocument, originalInnerChanges, modifiedInnerChanges);
    return { added, deleted, changedLineRanges, originalInnerChanges, modifiedInnerChanges, changeIndicators, ...mappings };
}
function createChangeIndicators(ranges, originalDocument, modifiedDocument, originalInnerChanges, modifiedInnerChanges) {
    return ranges.map(range => {
        const modifiedLineCount = range.modifiedRange.end.line - range.modifiedRange.start.line;
        return {
            modifiedLine: range.modifiedRange.start.line,
            modifiedLineCount,
            originalLineCount: range.originalRange.end.line - range.originalRange.start.line,
            originalContent: getLineRangeText(originalDocument, range.originalRange),
            originalInnerChanges: getRelativeInnerChanges(originalInnerChanges, range.originalRange),
            modifiedContent: getLineRangeText(modifiedDocument, range.modifiedRange),
            modifiedInnerChanges: getRelativeInnerChanges(modifiedInnerChanges, range.modifiedRange),
            type: modifiedLineCount === 0 ? 'deletion' : 'modification',
        };
    });
}
function getRelativeInnerChanges(innerChanges, range) {
    const relativeInnerChanges = [];
    for (const change of innerChanges) {
        if (change.line >= range.start.line && change.line < range.end.line) {
            relativeInnerChanges.push({
                line: change.line - range.start.line,
                startColumn: change.startColumn,
                endColumn: change.endColumn,
            });
        }
    }
    return relativeInnerChanges.length ? relativeInnerChanges : undefined;
}
function splitChangedLineRangesByMarkdownBlocks(ranges, originalDocument, modifiedDocument) {
    const splitRanges = [];
    for (const range of ranges) {
        const originalBlocks = getNonBlankLineRanges(originalDocument, range.originalRange);
        const modifiedBlocks = getNonBlankLineRanges(modifiedDocument, range.modifiedRange);
        if (originalBlocks.length > 1 && originalBlocks.length === modifiedBlocks.length) {
            for (let i = 0; i < originalBlocks.length; ++i) {
                splitRanges.push({
                    originalRange: originalBlocks[i],
                    modifiedRange: modifiedBlocks[i],
                });
            }
        }
        else {
            splitRanges.push(range);
        }
    }
    return splitRanges;
}
function getNonBlankLineRanges(document, range) {
    const ranges = [];
    let blockStartLine;
    for (let line = range.start.line; line < range.end.line; ++line) {
        if (document.lineAt(line).text.trim().length === 0) {
            if (blockStartLine !== undefined) {
                ranges.push(new vscode.Range(blockStartLine, 0, line, 0));
                blockStartLine = undefined;
            }
        }
        else if (blockStartLine === undefined) {
            blockStartLine = line;
        }
    }
    if (blockStartLine !== undefined) {
        ranges.push(new vscode.Range(blockStartLine, 0, range.end.line, 0));
    }
    return ranges;
}
function getLineRangeText(document, range) {
    const lines = [];
    for (let line = range.start.line; line < range.end.line; ++line) {
        lines.push(document.lineAt(line).text);
    }
    return lines.join('\n');
}
/**
 * Splits a Range into per-line inner change entries.
 * For single-line ranges, emits one entry. For multi-line ranges,
 * the first line goes from startColumn to end-of-line (maxColumn),
 * middle lines are full-line, and the last line goes from column 0
 * to endColumn.
 */
function collectInnerChangesForSide(range, out) {
    if (range.isEmpty) {
        return;
    }
    if (range.isSingleLine) {
        out.push({ line: range.start.line, startColumn: range.start.character, endColumn: range.end.character });
    }
    else {
        // First line: from start column to end-of-line
        out.push({ line: range.start.line, startColumn: range.start.character, endColumn: Number.MAX_SAFE_INTEGER });
        // Middle lines: entire line
        for (let line = range.start.line + 1; line < range.end.line; ++line) {
            out.push({ line, startColumn: 0, endColumn: Number.MAX_SAFE_INTEGER });
        }
        // Last line: from start to end column (skip if endColumn is 0, meaning the range ended at the line boundary)
        if (range.end.character > 0) {
            out.push({ line: range.end.line, startColumn: 0, endColumn: range.end.character });
        }
    }
}
function createEmptyLineMappings(originalLineCount, modifiedLineCount) {
    return {
        originalToModified: new Array(originalLineCount),
        modifiedToOriginal: new Array(modifiedLineCount),
    };
}
function fillUnchangedLineMappings(mappings, originalStart, originalEnd, modifiedStart, modifiedEnd) {
    const count = Math.min(originalEnd - originalStart, modifiedEnd - modifiedStart);
    for (let i = 0; i < count; ++i) {
        mappings.originalToModified[originalStart + i] = clampLine(modifiedStart + i, mappings.modifiedToOriginal.length);
        mappings.modifiedToOriginal[modifiedStart + i] = clampLine(originalStart + i, mappings.originalToModified.length);
    }
}
function fillMissingLineMappings(mappings) {
    for (let i = 0; i < mappings.originalToModified.length; ++i) {
        if (typeof mappings.originalToModified[i] !== 'number') {
            mappings.originalToModified[i] = clampLine(i, mappings.modifiedToOriginal.length);
        }
    }
    for (let i = 0; i < mappings.modifiedToOriginal.length; ++i) {
        if (typeof mappings.modifiedToOriginal[i] !== 'number') {
            mappings.modifiedToOriginal[i] = clampLine(i, mappings.originalToModified.length);
        }
    }
}
function translateLine(line, mappings, targetLineCount) {
    const sourceLine = Math.floor(line);
    const progress = line - sourceLine;
    const mappedLine = mappings[sourceLine] ?? line;
    if (progress <= 0) {
        return clampLine(mappedLine, targetLineCount);
    }
    const nextMappedLine = mappings[sourceLine + 1];
    if (typeof nextMappedLine !== 'number') {
        return clampLine(mappedLine + progress, targetLineCount);
    }
    return clampLine(mappedLine + ((nextMappedLine - mappedLine) * progress), targetLineCount);
}
function clampLine(line, lineCount) {
    return Math.max(0, Math.min(line, lineCount - 1));
}
//# sourceMappingURL=lineDiff.js.map