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
let errMsg = 'Do not use HTMLScriptElement#appendChild because it is similar to eval and can cause code-injection security vulnerabilities.';
/** A rule that bans the use of HTMLScriptElement#appendChild */
class Rule extends conformance_pattern_rule_1.ConformancePatternRule {
    constructor(configuration = {}) {
        super(Object.assign({ errorCode: conformance_pattern_rule_1.ErrorCode.CONFORMANCE_PATTERN, errorMessage: errMsg, kind: conformance_pattern_rule_1.PatternKind.BANNED_PROPERTY, values: ['HTMLScriptElement.prototype.appendChild'], name: Rule.RULE_NAME }, configuration));
    }
}
exports.Rule = Rule;
Rule.RULE_NAME = 'ban-script-appendchild-calls';
//# sourceMappingURL=ban_script_appendchild_calls.js.map