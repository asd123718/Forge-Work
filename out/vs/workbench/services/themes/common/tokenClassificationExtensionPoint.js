import * as nls from "../../../../nls.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { getTokenClassificationRegistry, typeAndModifierIdPattern } from "../../../../platform/theme/common/tokenClassificationRegistry.js";
const tokenClassificationRegistry = getTokenClassificationRegistry();
const tokenTypeExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "semanticTokenTypes",
  jsonSchema: {
    description: nls.localize("contributes.semanticTokenTypes", "Contributes semantic token types."),
    type: "array",
    items: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: nls.localize("contributes.semanticTokenTypes.id", "The identifier of the semantic token type"),
          pattern: typeAndModifierIdPattern,
          patternErrorMessage: nls.localize("contributes.semanticTokenTypes.id.format", "Identifiers should be in the form letterOrDigit[_-letterOrDigit]*")
        },
        superType: {
          type: "string",
          description: nls.localize("contributes.semanticTokenTypes.superType", "The super type of the semantic token type"),
          pattern: typeAndModifierIdPattern,
          patternErrorMessage: nls.localize("contributes.semanticTokenTypes.superType.format", "Super types should be in the form letterOrDigit[_-letterOrDigit]*")
        },
        description: {
          type: "string",
          description: nls.localize("contributes.color.description", "The description of the semantic token type")
        }
      }
    }
  }
});
const tokenModifierExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "semanticTokenModifiers",
  jsonSchema: {
    description: nls.localize("contributes.semanticTokenModifiers", "Contributes semantic token modifiers."),
    type: "array",
    items: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: nls.localize("contributes.semanticTokenModifiers.id", "The identifier of the semantic token modifier"),
          pattern: typeAndModifierIdPattern,
          patternErrorMessage: nls.localize("contributes.semanticTokenModifiers.id.format", "Identifiers should be in the form letterOrDigit[_-letterOrDigit]*")
        },
        description: {
          description: nls.localize("contributes.semanticTokenModifiers.description", "The description of the semantic token modifier")
        }
      }
    }
  }
});
const tokenStyleDefaultsExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "semanticTokenScopes",
  jsonSchema: {
    description: nls.localize("contributes.semanticTokenScopes", "Contributes semantic token scope maps."),
    type: "array",
    items: {
      type: "object",
      properties: {
        language: {
          description: nls.localize("contributes.semanticTokenScopes.languages", "Lists the languge for which the defaults are."),
          type: "string"
        },
        scopes: {
          description: nls.localize("contributes.semanticTokenScopes.scopes", "Maps a semantic token (described by semantic token selector) to one or more textMate scopes used to represent that token."),
          type: "object",
          additionalProperties: {
            type: "array",
            items: {
              type: "string"
            }
          }
        }
      }
    }
  }
});
class TokenClassificationExtensionPoints {
  constructor() {
    function validateTypeOrModifier(contribution, extensionPoint, collector) {
      if (typeof contribution.id !== "string" || contribution.id.length === 0) {
        collector.error(nls.localize("invalid.id", "'configuration.{0}.id' must be defined and can not be empty", extensionPoint));
        return false;
      }
      if (!contribution.id.match(typeAndModifierIdPattern)) {
        collector.error(nls.localize("invalid.id.format", "'configuration.{0}.id' must follow the pattern letterOrDigit[-_letterOrDigit]*", extensionPoint));
        return false;
      }
      const superType = contribution.superType;
      if (superType && !superType.match(typeAndModifierIdPattern)) {
        collector.error(nls.localize("invalid.superType.format", "'configuration.{0}.superType' must follow the pattern letterOrDigit[-_letterOrDigit]*", extensionPoint));
        return false;
      }
      if (typeof contribution.description !== "string" || contribution.id.length === 0) {
        collector.error(nls.localize("invalid.description", "'configuration.{0}.description' must be defined and can not be empty", extensionPoint));
        return false;
      }
      return true;
    }
    tokenTypeExtPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        if (!extensionValue || !Array.isArray(extensionValue)) {
          collector.error(nls.localize("invalid.semanticTokenTypeConfiguration", "'configuration.semanticTokenType' must be an array"));
          return;
        }
        for (const contribution of extensionValue) {
          if (validateTypeOrModifier(contribution, "semanticTokenType", collector)) {
            tokenClassificationRegistry.registerTokenType(contribution.id, contribution.description, contribution.superType);
          }
        }
      }
      for (const extension of delta.removed) {
        const extensionValue = extension.value;
        for (const contribution of extensionValue) {
          tokenClassificationRegistry.deregisterTokenType(contribution.id);
        }
      }
    });
    tokenModifierExtPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        if (!extensionValue || !Array.isArray(extensionValue)) {
          collector.error(nls.localize("invalid.semanticTokenModifierConfiguration", "'configuration.semanticTokenModifier' must be an array"));
          return;
        }
        for (const contribution of extensionValue) {
          if (validateTypeOrModifier(contribution, "semanticTokenModifier", collector)) {
            tokenClassificationRegistry.registerTokenModifier(contribution.id, contribution.description);
          }
        }
      }
      for (const extension of delta.removed) {
        const extensionValue = extension.value;
        for (const contribution of extensionValue) {
          tokenClassificationRegistry.deregisterTokenModifier(contribution.id);
        }
      }
    });
    tokenStyleDefaultsExtPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        if (!extensionValue || !Array.isArray(extensionValue)) {
          collector.error(nls.localize("invalid.semanticTokenScopes.configuration", "'configuration.semanticTokenScopes' must be an array"));
          return;
        }
        for (const contribution of extensionValue) {
          if (contribution.language && typeof contribution.language !== "string") {
            collector.error(nls.localize("invalid.semanticTokenScopes.language", "'configuration.semanticTokenScopes.language' must be a string"));
            continue;
          }
          if (!contribution.scopes || typeof contribution.scopes !== "object") {
            collector.error(nls.localize("invalid.semanticTokenScopes.scopes", "'configuration.semanticTokenScopes.scopes' must be defined as an object"));
            continue;
          }
          for (const selectorString in contribution.scopes) {
            const tmScopes = contribution.scopes[selectorString];
            if (!Array.isArray(tmScopes) || tmScopes.some((l) => typeof l !== "string")) {
              collector.error(nls.localize("invalid.semanticTokenScopes.scopes.value", "'configuration.semanticTokenScopes.scopes' values must be an array of strings"));
              continue;
            }
            try {
              const selector = tokenClassificationRegistry.parseTokenSelector(selectorString, contribution.language);
              tokenClassificationRegistry.registerTokenStyleDefault(selector, { scopesToProbe: tmScopes.map((s) => s.split(" ")) });
            } catch (e) {
              collector.error(nls.localize("invalid.semanticTokenScopes.scopes.selector", "configuration.semanticTokenScopes.scopes': Problems parsing selector {0}.", selectorString));
            }
          }
        }
      }
      for (const extension of delta.removed) {
        const extensionValue = extension.value;
        for (const contribution of extensionValue) {
          for (const selectorString in contribution.scopes) {
            const tmScopes = contribution.scopes[selectorString];
            try {
              const selector = tokenClassificationRegistry.parseTokenSelector(selectorString, contribution.language);
              tokenClassificationRegistry.registerTokenStyleDefault(selector, { scopesToProbe: tmScopes.map((s) => s.split(" ")) });
            } catch (e) {
            }
          }
        }
      }
    });
  }
}
export {
  TokenClassificationExtensionPoints
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxcdG9rZW5DbGFzc2lmaWNhdGlvbkV4dGVuc2lvblBvaW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnksIEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZ2V0VG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LCBJVG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LCB0eXBlQW5kTW9kaWZpZXJJZFBhdHRlcm4gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LmpzJztcblxuaW50ZXJmYWNlIElUb2tlblR5cGVFeHRlbnNpb25Qb2ludCB7XG5cdGlkOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHN1cGVyVHlwZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElUb2tlbk1vZGlmaWVyRXh0ZW5zaW9uUG9pbnQge1xuXHRpZDogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVRva2VuU3R5bGVEZWZhdWx0RXh0ZW5zaW9uUG9pbnQge1xuXHRsYW5ndWFnZT86IHN0cmluZztcblx0c2NvcGVzOiB7IFtzZWxlY3Rvcjogc3RyaW5nXTogc3RyaW5nW10gfTtcbn1cblxuY29uc3QgdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5OiBJVG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5ID0gZ2V0VG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5KCk7XG5cbmNvbnN0IHRva2VuVHlwZUV4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVRva2VuVHlwZUV4dGVuc2lvblBvaW50W10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdzZW1hbnRpY1Rva2VuVHlwZXMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuc2VtYW50aWNUb2tlblR5cGVzJywgJ0NvbnRyaWJ1dGVzIHNlbWFudGljIHRva2VuIHR5cGVzLicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnNlbWFudGljVG9rZW5UeXBlcy5pZCcsICdUaGUgaWRlbnRpZmllciBvZiB0aGUgc2VtYW50aWMgdG9rZW4gdHlwZScpLFxuXHRcdFx0XHRcdHBhdHRlcm46IHR5cGVBbmRNb2RpZmllcklkUGF0dGVybixcblx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnNlbWFudGljVG9rZW5UeXBlcy5pZC5mb3JtYXQnLCAnSWRlbnRpZmllcnMgc2hvdWxkIGJlIGluIHRoZSBmb3JtIGxldHRlck9yRGlnaXRbXy1sZXR0ZXJPckRpZ2l0XSonKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c3VwZXJUeXBlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuc2VtYW50aWNUb2tlblR5cGVzLnN1cGVyVHlwZScsICdUaGUgc3VwZXIgdHlwZSBvZiB0aGUgc2VtYW50aWMgdG9rZW4gdHlwZScpLFxuXHRcdFx0XHRcdHBhdHRlcm46IHR5cGVBbmRNb2RpZmllcklkUGF0dGVybixcblx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnNlbWFudGljVG9rZW5UeXBlcy5zdXBlclR5cGUuZm9ybWF0JywgJ1N1cGVyIHR5cGVzIHNob3VsZCBiZSBpbiB0aGUgZm9ybSBsZXR0ZXJPckRpZ2l0W18tbGV0dGVyT3JEaWdpdF0qJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuY29sb3IuZGVzY3JpcHRpb24nLCAnVGhlIGRlc2NyaXB0aW9uIG9mIHRoZSBzZW1hbnRpYyB0b2tlbiB0eXBlJyksXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5jb25zdCB0b2tlbk1vZGlmaWVyRXh0UG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJVG9rZW5Nb2RpZmllckV4dGVuc2lvblBvaW50W10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdzZW1hbnRpY1Rva2VuTW9kaWZpZXJzJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnNlbWFudGljVG9rZW5Nb2RpZmllcnMnLCAnQ29udHJpYnV0ZXMgc2VtYW50aWMgdG9rZW4gbW9kaWZpZXJzLicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnNlbWFudGljVG9rZW5Nb2RpZmllcnMuaWQnLCAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIHNlbWFudGljIHRva2VuIG1vZGlmaWVyJyksXG5cdFx0XHRcdFx0cGF0dGVybjogdHlwZUFuZE1vZGlmaWVySWRQYXR0ZXJuLFxuXHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuc2VtYW50aWNUb2tlbk1vZGlmaWVycy5pZC5mb3JtYXQnLCAnSWRlbnRpZmllcnMgc2hvdWxkIGJlIGluIHRoZSBmb3JtIGxldHRlck9yRGlnaXRbXy1sZXR0ZXJPckRpZ2l0XSonKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnNlbWFudGljVG9rZW5Nb2RpZmllcnMuZGVzY3JpcHRpb24nLCAnVGhlIGRlc2NyaXB0aW9uIG9mIHRoZSBzZW1hbnRpYyB0b2tlbiBtb2RpZmllcicpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5jb25zdCB0b2tlblN0eWxlRGVmYXVsdHNFeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElUb2tlblN0eWxlRGVmYXVsdEV4dGVuc2lvblBvaW50W10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdzZW1hbnRpY1Rva2VuU2NvcGVzJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnNlbWFudGljVG9rZW5TY29wZXMnLCAnQ29udHJpYnV0ZXMgc2VtYW50aWMgdG9rZW4gc2NvcGUgbWFwcy4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0bGFuZ3VhZ2U6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZW1hbnRpY1Rva2VuU2NvcGVzLmxhbmd1YWdlcycsICdMaXN0cyB0aGUgbGFuZ3VnZSBmb3Igd2hpY2ggdGhlIGRlZmF1bHRzIGFyZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzY29wZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZW1hbnRpY1Rva2VuU2NvcGVzLnNjb3BlcycsICdNYXBzIGEgc2VtYW50aWMgdG9rZW4gKGRlc2NyaWJlZCBieSBzZW1hbnRpYyB0b2tlbiBzZWxlY3RvcikgdG8gb25lIG9yIG1vcmUgdGV4dE1hdGUgc2NvcGVzIHVzZWQgdG8gcmVwcmVzZW50IHRoYXQgdG9rZW4uJyksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cblxuZXhwb3J0IGNsYXNzIFRva2VuQ2xhc3NpZmljYXRpb25FeHRlbnNpb25Qb2ludHMge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGZ1bmN0aW9uIHZhbGlkYXRlVHlwZU9yTW9kaWZpZXIoY29udHJpYnV0aW9uOiBJVG9rZW5UeXBlRXh0ZW5zaW9uUG9pbnQgfCBJVG9rZW5Nb2RpZmllckV4dGVuc2lvblBvaW50LCBleHRlbnNpb25Qb2ludDogc3RyaW5nLCBjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IpOiBib29sZWFuIHtcblx0XHRcdGlmICh0eXBlb2YgY29udHJpYnV0aW9uLmlkICE9PSAnc3RyaW5nJyB8fCBjb250cmlidXRpb24uaWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuaWQnLCBcIidjb25maWd1cmF0aW9uLnswfS5pZCcgbXVzdCBiZSBkZWZpbmVkIGFuZCBjYW4gbm90IGJlIGVtcHR5XCIsIGV4dGVuc2lvblBvaW50KSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICghY29udHJpYnV0aW9uLmlkLm1hdGNoKHR5cGVBbmRNb2RpZmllcklkUGF0dGVybikpIHtcblx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5pZC5mb3JtYXQnLCBcIidjb25maWd1cmF0aW9uLnswfS5pZCcgbXVzdCBmb2xsb3cgdGhlIHBhdHRlcm4gbGV0dGVyT3JEaWdpdFstX2xldHRlck9yRGlnaXRdKlwiLCBleHRlbnNpb25Qb2ludCkpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdXBlclR5cGUgPSAoY29udHJpYnV0aW9uIGFzIElUb2tlblR5cGVFeHRlbnNpb25Qb2ludCkuc3VwZXJUeXBlO1xuXHRcdFx0aWYgKHN1cGVyVHlwZSAmJiAhc3VwZXJUeXBlLm1hdGNoKHR5cGVBbmRNb2RpZmllcklkUGF0dGVybikpIHtcblx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5zdXBlclR5cGUuZm9ybWF0JywgXCInY29uZmlndXJhdGlvbi57MH0uc3VwZXJUeXBlJyBtdXN0IGZvbGxvdyB0aGUgcGF0dGVybiBsZXR0ZXJPckRpZ2l0Wy1fbGV0dGVyT3JEaWdpdF0qXCIsIGV4dGVuc2lvblBvaW50KSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgY29udHJpYnV0aW9uLmRlc2NyaXB0aW9uICE9PSAnc3RyaW5nJyB8fCBjb250cmlidXRpb24uaWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuZGVzY3JpcHRpb24nLCBcIidjb25maWd1cmF0aW9uLnswfS5kZXNjcmlwdGlvbicgbXVzdCBiZSBkZWZpbmVkIGFuZCBjYW4gbm90IGJlIGVtcHR5XCIsIGV4dGVuc2lvblBvaW50KSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHRva2VuVHlwZUV4dFBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIGRlbHRhKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZWx0YS5hZGRlZCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25WYWx1ZSA9IDxJVG9rZW5UeXBlRXh0ZW5zaW9uUG9pbnRbXT5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdGNvbnN0IGNvbGxlY3RvciA9IGV4dGVuc2lvbi5jb2xsZWN0b3I7XG5cblx0XHRcdFx0aWYgKCFleHRlbnNpb25WYWx1ZSB8fCAhQXJyYXkuaXNBcnJheShleHRlbnNpb25WYWx1ZSkpIHtcblx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnNlbWFudGljVG9rZW5UeXBlQ29uZmlndXJhdGlvbicsIFwiJ2NvbmZpZ3VyYXRpb24uc2VtYW50aWNUb2tlblR5cGUnIG11c3QgYmUgYW4gYXJyYXlcIikpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb25WYWx1ZSkge1xuXHRcdFx0XHRcdGlmICh2YWxpZGF0ZVR5cGVPck1vZGlmaWVyKGNvbnRyaWJ1dGlvbiwgJ3NlbWFudGljVG9rZW5UeXBlJywgY29sbGVjdG9yKSkge1xuXHRcdFx0XHRcdFx0dG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5UeXBlKGNvbnRyaWJ1dGlvbi5pZCwgY29udHJpYnV0aW9uLmRlc2NyaXB0aW9uLCBjb250cmlidXRpb24uc3VwZXJUeXBlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVmFsdWUgPSA8SVRva2VuVHlwZUV4dGVuc2lvblBvaW50W10+ZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb25WYWx1ZSkge1xuXHRcdFx0XHRcdHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyVG9rZW5UeXBlKGNvbnRyaWJ1dGlvbi5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHR0b2tlbk1vZGlmaWVyRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLmFkZGVkKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblZhbHVlID0gPElUb2tlbk1vZGlmaWVyRXh0ZW5zaW9uUG9pbnRbXT5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdGNvbnN0IGNvbGxlY3RvciA9IGV4dGVuc2lvbi5jb2xsZWN0b3I7XG5cblx0XHRcdFx0aWYgKCFleHRlbnNpb25WYWx1ZSB8fCAhQXJyYXkuaXNBcnJheShleHRlbnNpb25WYWx1ZSkpIHtcblx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnNlbWFudGljVG9rZW5Nb2RpZmllckNvbmZpZ3VyYXRpb24nLCBcIidjb25maWd1cmF0aW9uLnNlbWFudGljVG9rZW5Nb2RpZmllcicgbXVzdCBiZSBhbiBhcnJheVwiKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIGV4dGVuc2lvblZhbHVlKSB7XG5cdFx0XHRcdFx0aWYgKHZhbGlkYXRlVHlwZU9yTW9kaWZpZXIoY29udHJpYnV0aW9uLCAnc2VtYW50aWNUb2tlbk1vZGlmaWVyJywgY29sbGVjdG9yKSkge1xuXHRcdFx0XHRcdFx0dG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5Nb2RpZmllcihjb250cmlidXRpb24uaWQsIGNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZWx0YS5yZW1vdmVkKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblZhbHVlID0gPElUb2tlbk1vZGlmaWVyRXh0ZW5zaW9uUG9pbnRbXT5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIGV4dGVuc2lvblZhbHVlKSB7XG5cdFx0XHRcdFx0dG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LmRlcmVnaXN0ZXJUb2tlbk1vZGlmaWVyKGNvbnRyaWJ1dGlvbi5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHR0b2tlblN0eWxlRGVmYXVsdHNFeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEuYWRkZWQpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVmFsdWUgPSA8SVRva2VuU3R5bGVEZWZhdWx0RXh0ZW5zaW9uUG9pbnRbXT5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdGNvbnN0IGNvbGxlY3RvciA9IGV4dGVuc2lvbi5jb2xsZWN0b3I7XG5cblx0XHRcdFx0aWYgKCFleHRlbnNpb25WYWx1ZSB8fCAhQXJyYXkuaXNBcnJheShleHRlbnNpb25WYWx1ZSkpIHtcblx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnNlbWFudGljVG9rZW5TY29wZXMuY29uZmlndXJhdGlvbicsIFwiJ2NvbmZpZ3VyYXRpb24uc2VtYW50aWNUb2tlblNjb3BlcycgbXVzdCBiZSBhbiBhcnJheVwiKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIGV4dGVuc2lvblZhbHVlKSB7XG5cdFx0XHRcdFx0aWYgKGNvbnRyaWJ1dGlvbi5sYW5ndWFnZSAmJiB0eXBlb2YgY29udHJpYnV0aW9uLmxhbmd1YWdlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5zZW1hbnRpY1Rva2VuU2NvcGVzLmxhbmd1YWdlJywgXCInY29uZmlndXJhdGlvbi5zZW1hbnRpY1Rva2VuU2NvcGVzLmxhbmd1YWdlJyBtdXN0IGJlIGEgc3RyaW5nXCIpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWNvbnRyaWJ1dGlvbi5zY29wZXMgfHwgdHlwZW9mIGNvbnRyaWJ1dGlvbi5zY29wZXMgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnNlbWFudGljVG9rZW5TY29wZXMuc2NvcGVzJywgXCInY29uZmlndXJhdGlvbi5zZW1hbnRpY1Rva2VuU2NvcGVzLnNjb3BlcycgbXVzdCBiZSBkZWZpbmVkIGFzIGFuIG9iamVjdFwiKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZWxlY3RvclN0cmluZyBpbiBjb250cmlidXRpb24uc2NvcGVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0bVNjb3BlcyA9IGNvbnRyaWJ1dGlvbi5zY29wZXNbc2VsZWN0b3JTdHJpbmddO1xuXHRcdFx0XHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KHRtU2NvcGVzKSB8fCB0bVNjb3Blcy5zb21lKGwgPT4gdHlwZW9mIGwgIT09ICdzdHJpbmcnKSkge1xuXHRcdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnNlbWFudGljVG9rZW5TY29wZXMuc2NvcGVzLnZhbHVlJywgXCInY29uZmlndXJhdGlvbi5zZW1hbnRpY1Rva2VuU2NvcGVzLnNjb3BlcycgdmFsdWVzIG11c3QgYmUgYW4gYXJyYXkgb2Ygc3RyaW5nc1wiKSk7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0b3IgPSB0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkucGFyc2VUb2tlblNlbGVjdG9yKHNlbGVjdG9yU3RyaW5nLCBjb250cmlidXRpb24ubGFuZ3VhZ2UpO1xuXHRcdFx0XHRcdFx0XHR0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkucmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdChzZWxlY3RvciwgeyBzY29wZXNUb1Byb2JlOiB0bVNjb3Blcy5tYXAocyA9PiBzLnNwbGl0KCcgJykpIH0pO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnNlbWFudGljVG9rZW5TY29wZXMuc2NvcGVzLnNlbGVjdG9yJywgXCJjb25maWd1cmF0aW9uLnNlbWFudGljVG9rZW5TY29wZXMuc2NvcGVzJzogUHJvYmxlbXMgcGFyc2luZyBzZWxlY3RvciB7MH0uXCIsIHNlbGVjdG9yU3RyaW5nKSk7XG5cdFx0XHRcdFx0XHRcdC8vIGludmFsaWQgc2VsZWN0b3IsIGlnbm9yZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEucmVtb3ZlZCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25WYWx1ZSA9IDxJVG9rZW5TdHlsZURlZmF1bHRFeHRlbnNpb25Qb2ludFtdPmV4dGVuc2lvbi52YWx1ZTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb250cmlidXRpb24gb2YgZXh0ZW5zaW9uVmFsdWUpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNlbGVjdG9yU3RyaW5nIGluIGNvbnRyaWJ1dGlvbi5zY29wZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRtU2NvcGVzID0gY29udHJpYnV0aW9uLnNjb3Blc1tzZWxlY3RvclN0cmluZ107XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RvciA9IHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS5wYXJzZVRva2VuU2VsZWN0b3Ioc2VsZWN0b3JTdHJpbmcsIGNvbnRyaWJ1dGlvbi5sYW5ndWFnZSk7XG5cdFx0XHRcdFx0XHRcdHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS5yZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KHNlbGVjdG9yLCB7IHNjb3Blc1RvUHJvYmU6IHRtU2NvcGVzLm1hcChzID0+IHMuc3BsaXQoJyAnKSkgfSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdC8vIGludmFsaWQgc2VsZWN0b3IsIGlnbm9yZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cblxuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBcUQ7QUFDOUQsU0FBUyxnQ0FBOEQsZ0NBQWdDO0FBa0J2RyxNQUFNLDhCQUE0RCwrQkFBK0I7QUFFakcsTUFBTSxvQkFBb0IsbUJBQW1CLHVCQUFtRDtBQUFBLEVBQy9GLGdCQUFnQjtBQUFBLEVBQ2hCLFlBQVk7QUFBQSxJQUNYLGFBQWEsSUFBSSxTQUFTLGtDQUFrQyxtQ0FBbUM7QUFBQSxJQUMvRixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxJQUFJO0FBQUEsVUFDSCxNQUFNO0FBQUEsVUFDTixhQUFhLElBQUksU0FBUyxxQ0FBcUMsMkNBQTJDO0FBQUEsVUFDMUcsU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyw0Q0FBNEMsbUVBQW1FO0FBQUEsUUFDbEo7QUFBQSxRQUNBLFdBQVc7QUFBQSxVQUNWLE1BQU07QUFBQSxVQUNOLGFBQWEsSUFBSSxTQUFTLDRDQUE0QywyQ0FBMkM7QUFBQSxVQUNqSCxTQUFTO0FBQUEsVUFDVCxxQkFBcUIsSUFBSSxTQUFTLG1EQUFtRCxtRUFBbUU7QUFBQSxRQUN6SjtBQUFBLFFBQ0EsYUFBYTtBQUFBLFVBQ1osTUFBTTtBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMsaUNBQWlDLDRDQUE0QztBQUFBLFFBQ3hHO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUVELE1BQU0sd0JBQXdCLG1CQUFtQix1QkFBdUQ7QUFBQSxFQUN2RyxnQkFBZ0I7QUFBQSxFQUNoQixZQUFZO0FBQUEsSUFDWCxhQUFhLElBQUksU0FBUyxzQ0FBc0MsdUNBQXVDO0FBQUEsSUFDdkcsTUFBTTtBQUFBLElBQ04sT0FB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
