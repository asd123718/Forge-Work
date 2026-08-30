"use strict";
// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rule = void 0;
const conformance_pattern_rule_1 = require("../../third_party/tsetse/rules/conformance_pattern_rule");
const pattern_config_1 = require("../../third_party/tsetse/util/pattern_config");
const trusted_types_configuration_1 = require("../../third_party/tsetse/util/trusted_types_configuration");
let errMsg = 'Do not use eval, as this can lead to XSS.';
const bannedValues = [
    'GLOBAL|eval',
];
/**
 * A Rule that looks for references to the built-in eval() and window.eval()
 * methods. window.eval performs an indirect call to eval(), so a single check
 * for eval() bans both calls.
 */
class Rule extends conformance_pattern_rule_1.ConformancePatternRule {
    constructor(configuration = {}) {
        super((0, pattern_config_1.overridePatternConfig)(Object.assign({ errorCode: conformance_pattern_rule_1.ErrorCode.CONFORMANCE_PATTERN, errorMessage: errMsg, kind: conformance_pattern_rule_1.PatternKind.BANNED_NAME, values: bannedValues, name: Rule.RULE_NAME, allowedTrustedType: trusted_types_configuration_1.TRUSTED_SCRIPT }, configuration)));
    }
}
exports.Rule = Rule;
Rule.RULE_NAME = 'ban-eval-calls';
//# sourceMappingURL=ban_eval_calls.js.map