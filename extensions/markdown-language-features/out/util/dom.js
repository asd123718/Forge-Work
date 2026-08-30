"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeAttribute = escapeAttribute;
exports.escapeHtml = escapeHtml;
function escapeAttribute(value) {
    return value.toString()
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
//# sourceMappingURL=dom.js.map