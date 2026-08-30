"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternEngine = void 0;
const allowlist_1 = require("../../allowlist");
const ast_tools_1 = require("../ast_tools");
/**
 * A patternEngine is the logic that handles a specific PatternKind.
 */
class PatternEngine {
    constructor(ruleName, config, fixers) {
        this.ruleName = ruleName;
        this.config = config;
        this.fixers = fixers;
        this.allowlist = new allowlist_1.Allowlist(config.allowlistEntries);
    }
    /**
     * A composer that wraps checking functions with code handling aspects of the
     * analysis that are not engine-specific, and which defers to the
     * subclass-specific logic afterwards. Subclasses should transform their
     * checking logic with this composer before registered on the checker.
     */
    wrapCheckWithAllowlistingAndFixer(checkFunction) {
        return (c, n) => {
            var _a, _b;
            const sf = n.getSourceFile();
            if (!(0, ast_tools_1.shouldExamineNode)(n) || sf.isDeclarationFile) {
                return;
            }
            const matchedNode = checkFunction(c.typeChecker, n);
            if (matchedNode) {
                const fixes = (_b = (_a = this.fixers) === null || _a === void 0 ? void 0 : _a.map(fixer => fixer.getFixForFlaggedNode(matchedNode))) === null || _b === void 0 ? void 0 : _b.filter((fix) => fix !== undefined);
                c.addFailureAtNode(matchedNode, this.config.errorMessage, this.ruleName, this.allowlist, fixes);
            }
        };
    }
}
exports.PatternEngine = PatternEngine;
//# sourceMappingURL=pattern_engine.js.map