"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = exports.PatternKind = exports.ConformancePatternRule = void 0;
const error_code_1 = require("../error_code");
Object.defineProperty(exports, "ErrorCode", { enumerable: true, get: function () { return error_code_1.ErrorCode; } });
const pattern_config_1 = require("../util/pattern_config");
Object.defineProperty(exports, "PatternKind", { enumerable: true, get: function () { return pattern_config_1.PatternKind; } });
const name_engine_1 = require("../util/pattern_engines/name_engine");
const property_engine_1 = require("../util/pattern_engines/property_engine");
const property_non_constant_write_engine_1 = require("../util/pattern_engines/property_non_constant_write_engine");
const property_write_engine_1 = require("../util/pattern_engines/property_write_engine");
/**
 * Builds a Rule that matches a certain pattern, given as parameter, and
 * that can additionally run a suggested fix generator on the matches.
 *
 * This is templated, mostly to ensure the nodes that have been matched
 * correspond to what the Fixer expects.
 */
class ConformancePatternRule {
    constructor(config, fixers) {
        var _a;
        this.config = config;
        this.code = config.errorCode;
        // Avoid undefined rule names.
        this.ruleName = (_a = config.name) !== null && _a !== void 0 ? _a : '';
        let engine;
        switch (config.kind) {
            case pattern_config_1.PatternKind.BANNED_PROPERTY:
                engine = property_engine_1.PropertyEngine;
                break;
            case pattern_config_1.PatternKind.BANNED_PROPERTY_WRITE:
                engine = property_write_engine_1.PropertyWriteEngine;
                break;
            case pattern_config_1.PatternKind.BANNED_PROPERTY_NON_CONSTANT_WRITE:
                engine = property_non_constant_write_engine_1.PropertyNonConstantWriteEngine;
                break;
            case pattern_config_1.PatternKind.BANNED_NAME:
                engine = name_engine_1.NameEngine;
                break;
            case pattern_config_1.PatternKind.BANNED_IMPORTED_NAME:
                engine = name_engine_1.ImportedNameEngine;
                break;
            default:
                throw new Error('Config type not recognized, or not implemented yet.');
        }
        this.engine = new engine(this.ruleName, config, fixers);
    }
    register(checker) {
        this.engine.register(checker);
    }
}
exports.ConformancePatternRule = ConformancePatternRule;
//# sourceMappingURL=conformance_pattern_rule.js.map