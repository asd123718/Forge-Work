"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRUSTED_SCRIPT_URL = exports.TRUSTED_SCRIPT = exports.TRUSTED_HTML = void 0;
/**
 * Create `TrustedTypesConfig` for the given Trusted Type.
 */
function createDefaultTrustedTypeConfig(type) {
    const config = {
        allowAmbientTrustedTypesDeclaration: true,
        // the module path may look like
        // "/home/username/.../node_modules/@types/trusted-types/"
        modulePathMatcher: '/node_modules/@types/trusted-types/',
        typeName: type,
    };
    return config;
}
/**
 * Trusted Types configuration allowing usage of `TrustedHTML` for a given rule.
 */
exports.TRUSTED_HTML = createDefaultTrustedTypeConfig('TrustedHTML');
/**
 * Trusted Types configuration allowing usage of `TrustedScript` for a given
 * rule.
 */
exports.TRUSTED_SCRIPT = createDefaultTrustedTypeConfig('TrustedScript');
/**
 * Trusted Types configuration allowing usage of `TrustedScriptURL` for a given
 * rule.
 */
exports.TRUSTED_SCRIPT_URL = createDefaultTrustedTypeConfig('TrustedScriptURL');
//# sourceMappingURL=trusted_types_configuration.js.map