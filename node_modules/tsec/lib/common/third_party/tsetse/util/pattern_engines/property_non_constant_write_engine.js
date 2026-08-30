"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropertyNonConstantWriteEngine = void 0;
const ast_tools_1 = require("../ast_tools");
const is_literal_1 = require("../is_literal");
const property_write_engine_1 = require("./property_write_engine");
function matchPropertyNonConstantWrite(tc, n, matcher) {
    (0, ast_tools_1.debugLog)(() => `inspecting ${n.getFullText().trim()}`);
    if ((0, property_write_engine_1.matchPropertyWrite)(tc, n, matcher) === undefined) {
        return;
    }
    const rval = n.parent.right;
    if ((0, is_literal_1.isLiteral)(tc, rval)) {
        (0, ast_tools_1.debugLog)(() => `Assigned value (${rval.getFullText()}) is a compile-time constant.`);
        return;
    }
    return n.parent;
}
/**
 * The engine for BANNED_PROPERTY_NON_CONSTANT_WRITE.
 */
class PropertyNonConstantWriteEngine extends property_write_engine_1.PropertyWriteEngine {
    register(checker) {
        this.registerWith(checker, matchPropertyNonConstantWrite);
    }
}
exports.PropertyNonConstantWriteEngine = PropertyNonConstantWriteEngine;
//# sourceMappingURL=property_non_constant_write_engine.js.map