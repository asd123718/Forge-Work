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
exports.extendMarkdownIt = extendMarkdownIt;
const vscode = __importStar(require("vscode"));
const yaml = __importStar(require("yaml"));
const dom_1 = require("../../util/dom");
const FRONT_MATTER_TOKEN = 'front_matter';
const MARKER = '---';
const FRONT_MATTER_CONTEXT = JSON.stringify({ webviewSection: 'frontMatter' });
/**
 * Extends a `markdown-it` instance with parsing and rendering support for YAML
 * frontmatter at the start of a Markdown document.
 *
 * Frontmatter is delimited by lines containing only `---`. How (or whether) the parsed
 * frontmatter is rendered in the preview is controlled by the `markdown.preview.frontMatter`
 * setting.
 */
function extendMarkdownIt(md) {
    md.block.ruler.before('fence', FRONT_MATTER_TOKEN, frontMatterRule, {
        alt: ['paragraph', 'reference', 'blockquote', 'list']
    });
    md.renderer.rules[FRONT_MATTER_TOKEN] = renderFrontMatter;
    return md;
}
const frontMatterRule = (state, startLine, endLine, silent) => {
    if (startLine !== 0 || state.tShift[startLine] !== 0) {
        return false;
    }
    const firstLineStart = state.bMarks[startLine];
    const firstLineEnd = state.eMarks[startLine];
    const firstLine = state.src.slice(firstLineStart, firstLineEnd).replace(/\s+$/, '');
    if (firstLine !== MARKER) {
        return false;
    }
    let nextLine = startLine + 1;
    let foundEnd = false;
    for (; nextLine < endLine; nextLine++) {
        if (state.tShift[nextLine] !== 0) {
            continue;
        }
        const lineStart = state.bMarks[nextLine];
        const lineEnd = state.eMarks[nextLine];
        const line = state.src.slice(lineStart, lineEnd).replace(/\s+$/, '');
        if (line === MARKER) {
            foundEnd = true;
            break;
        }
    }
    if (!foundEnd) {
        return false;
    }
    if (silent) {
        return true;
    }
    const contentStart = state.bMarks[startLine + 1];
    const contentEnd = state.bMarks[nextLine];
    const rawContent = state.src.slice(contentStart, contentEnd).replace(/\n$/, '');
    const token = state.push(FRONT_MATTER_TOKEN, '', 0);
    token.block = true;
    token.hidden = false;
    token.markup = MARKER;
    token.map = [startLine, nextLine + 1];
    const meta = { content: rawContent };
    token.meta = meta;
    state.line = nextLine + 1;
    return true;
};
function renderFrontMatter(tokens, idx, options, env) {
    const meta = tokens[idx].meta;
    if (!meta) {
        return '';
    }
    const currentDocument = env?.currentDocument;
    const style = getFrontMatterRenderStyle(currentDocument);
    switch (style) {
        case 'codeBlock':
            return renderAsCodeBlock(meta, options);
        case 'table':
            return renderAsTable(meta);
        case 'hide':
        default:
            return '';
    }
}
function getFrontMatterRenderStyle(resource) {
    const config = vscode.workspace.getConfiguration('markdown', resource ?? null);
    const value = config.get('preview.frontMatter', 'table');
    switch (value) {
        case 'codeBlock':
        case 'table':
        case 'hide':
            return value;
        default:
            return 'table';
    }
}
function renderAsCodeBlock(meta, options) {
    let highlighted;
    if (typeof options.highlight === 'function') {
        try {
            highlighted = options.highlight(meta.content, 'yaml', '') || undefined;
        }
        catch {
            highlighted = undefined;
        }
    }
    if (highlighted?.startsWith('<pre')) {
        return highlighted.replace(/^<pre\b/, `<pre ${frontMatterAttributes()}`) + '\n';
    }
    const body = highlighted ?? (0, dom_1.escapeHtml)(meta.content);
    return `<pre class="frontmatter hljs" ${frontMatterAttributes()}><code class="language-yaml">${body}</code></pre>\n`;
}
function renderAsTable(meta) {
    const result = parseEntries(meta);
    if (result.error !== undefined) {
        return renderError(result.error);
    }
    if (!result.entries.length) {
        return '';
    }
    const rows = result.entries.map(([key, value]) => `<tr><th>${(0, dom_1.escapeHtml)(key)}</th><td>${formatValueHtml(value)}</td></tr>`).join('');
    return `<table class="frontmatter" ${frontMatterAttributes()}><tbody>${rows}</tbody></table>\n`;
}
function renderError(message) {
    const label = vscode.l10n.t('Failed to parse frontmatter');
    return `<div class="frontmatter-error" role="alert" ${frontMatterAttributes()}><strong>${(0, dom_1.escapeHtml)(label)}</strong><pre>${(0, dom_1.escapeHtml)(message)}</pre></div>\n`;
}
function frontMatterAttributes() {
    const label = (0, dom_1.escapeHtml)(vscode.l10n.t('Frontmatter'));
    return `title="${label}" data-vscode-context='${(0, dom_1.escapeHtml)(FRONT_MATTER_CONTEXT)}'`;
}
function parseEntries(meta) {
    try {
        const parsed = yaml.parse(meta.content);
        if (parsed === null || parsed === undefined) {
            return { entries: [] };
        }
        if (typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { entries: [['', parsed]] };
        }
        return { entries: Object.entries(parsed) };
    }
    catch (e) {
        return { entries: [], error: e instanceof Error ? e.message : String(e) };
    }
}
function formatValueHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (Array.isArray(value)) {
        if (!value.length) {
            return '';
        }
        return `<ul>${value.map(v => `<li>${formatValueHtml(v)}</li>`).join('')}</ul>`;
    }
    if (typeof value === 'object') {
        return `<code>${(0, dom_1.escapeHtml)(yaml.stringify(value).trimEnd())}</code>`;
    }
    return (0, dom_1.escapeHtml)(formatScalar(value));
}
function formatScalar(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return String(value);
}
//# sourceMappingURL=yamlPreamble.js.map