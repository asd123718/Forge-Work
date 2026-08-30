import * as nls from "../../../../nls.js";
import { Color } from "../../../../base/common/color.js";
import { isObject, isUndefinedOrNull, isString, isStringArray } from "../../../../base/common/types.js";
function canBeType(propTypes, ...types) {
  return types.some((t) => propTypes.includes(t));
}
function isNullOrEmpty(value) {
  return value === "" || isUndefinedOrNull(value);
}
function createValidator(prop) {
  const type = Array.isArray(prop.type) ? prop.type : [prop.type];
  const isNullable = canBeType(type, "null");
  const isNumeric = (canBeType(type, "number") || canBeType(type, "integer")) && (type.length === 1 || type.length === 2 && isNullable);
  const numericValidations = getNumericValidators(prop);
  const stringValidations = getStringValidators(prop);
  const arrayValidator = getArrayValidator(prop);
  const objectValidator = getObjectValidator(prop);
  return (value) => {
    if (isNullable && isNullOrEmpty(value)) {
      return "";
    }
    const errors = [];
    if (arrayValidator) {
      const err = arrayValidator(value);
      if (err) {
        errors.push(err);
      }
    }
    if (objectValidator) {
      const err = objectValidator(value);
      if (err) {
        errors.push(err);
      }
    }
    if (prop.type === "boolean" && value !== true && value !== false) {
      errors.push(nls.localize("validations.booleanIncorrectType", 'Incorrect type. Expected "boolean".'));
    }
    if (isNumeric) {
      if (isNullOrEmpty(value) || typeof value === "boolean" || Array.isArray(value) || isNaN(+value)) {
        errors.push(nls.localize("validations.expectedNumeric", "Value must be a number."));
      } else {
        errors.push(...numericValidations.filter((validator) => !validator.isValid(+value)).map((validator) => validator.message));
      }
    }
    if (prop.type === "string") {
      if (prop.enum && !isStringArray(prop.enum)) {
        errors.push(nls.localize("validations.stringIncorrectEnumOptions", "The enum options should be strings, but there is a non-string option. Please file an issue with the extension author."));
      } else if (!isString(value)) {
        errors.push(nls.localize("validations.stringIncorrectType", 'Incorrect type. Expected "string".'));
      } else {
        errors.push(...stringValidations.filter((validator) => !validator.isValid(value)).map((validator) => validator.message));
      }
    }
    if (errors.length) {
      return prop.errorMessage ? [prop.errorMessage, ...errors].join(" ") : errors.join(" ");
    }
    return "";
  };
}
function getInvalidTypeError(value, type) {
  if (typeof type === "undefined") {
    return;
  }
  const typeArr = Array.isArray(type) ? type : [type];
  if (!typeArr.some((_type) => valueValidatesAsType(value, _type))) {
    return nls.localize("invalidTypeError", "Setting has an invalid type, expected {0}. Fix in JSON.", JSON.stringify(type));
  }
  return;
}
function valueValidatesAsType(value, type) {
  const valueType = typeof value;
  if (type === "boolean") {
    return valueType === "boolean";
  } else if (type === "object") {
    return value && !Array.isArray(value) && valueType === "object";
  } else if (type === "null") {
    return value === null;
  } else if (type === "array") {
    return Array.isArray(value);
  } else if (type === "string") {
    return valueType === "string";
  } else if (type === "number" || type === "integer") {
    return valueType === "number";
  }
  return true;
}
function toRegExp(pattern) {
  try {
    return new RegExp(pattern, "u");
  } catch (e) {
    try {
      return new RegExp(pattern);
    } catch (e2) {
      console.error(nls.localize("regexParsingError", "Error parsing the following regex both with and without the u flag:"), pattern);
      return /.*/;
    }
  }
}
function getStringValidators(prop) {
  const uriRegex = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
  let patternRegex;
  if (typeof prop.pattern === "string") {
    patternRegex = toRegExp(prop.pattern);
  }
  return [
    {
      enabled: prop.maxLength !== void 0,
      isValid: ((value) => value.length <= prop.maxLength),
      message: nls.localize("validations.maxLength", "Value must be {0} or fewer characters long.", prop.maxLength)
    },
    {
      enabled: prop.minLength !== void 0,
      isValid: ((value) => value.length >= prop.minLength),
      message: nls.localize("validations.minLength", "Value must be {0} or more characters long.", prop.minLength)
    },
    {
      enabled: patternRegex !== void 0,
      isValid: ((value) => patternRegex.test(value)),
      message: prop.patternErrorMessage || nls.localize("validations.regex", "Value must match regex `{0}`.", prop.pattern)
    },
    {
      enabled: prop.format === "color-hex",
      isValid: ((value) => Color.Format.CSS.parseHex(value)),
      message: nls.localize("validations.colorFormat", "Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.")
    },
    {
      enabled: prop.format === "uri" || prop.format === "uri-reference",
      isValid: ((value) => !!value.length),
      message: nls.localize("validations.uriEmpty", "URI expected.")
    },
    {
      enabled: prop.format === "uri" || prop.format === "uri-reference",
      isValid: ((value) => uriRegex.test(value)),
      message: nls.localize("validations.uriMissing", "URI is expected.")
    },
    {
      enabled: prop.format === "uri",
      isValid: ((value) => {
        const matches = value.match(uriRegex);
        return !!(matches && matches[2]);
      }),
      message: nls.localize("validations.uriSchemeMissing", "URI with a scheme is expected.")
    },
    {
      enabled: prop.enum !== void 0,
      isValid: ((value) => {
        return prop.enum.includes(value);
      }),
      message: nls.localize(
        "validations.invalidStringEnumValue",
        "Value is not accepted. Valid values: {0}.",
        prop.enum ? prop.enum.map((key) => `"${key}"`).join(", ") : "[]"
      )
    }
  ].filter((validation) => validation.enabled);
}
function getNumericValidators(prop) {
  const type = Array.isArray(prop.type) ? prop.type : [prop.type];
  const isNullable = canBeType(type, "null");
  const isIntegral = canBeType(type, "integer") && (type.length === 1 || type.length === 2 && isNullable);
  const isNumeric = canBeType(type, "number", "integer") && (type.length === 1 || type.length === 2 && isNullable);
  if (!isNumeric) {
    return [];
  }
  let exclusiveMax;
  let exclusiveMin;
  if (typeof prop.exclusiveMaximum === "boolean") {
    exclusiveMax = prop.exclusiveMaximum ? prop.maximum : void 0;
  } else {
    exclusiveMax = prop.exclusiveMaximum;
  }
  if (typeof prop.exclusiveMinimum === "boolean") {
    exclusiveMin = prop.exclusiveMinimum ? prop.minimum : void 0;
  } else {
    exclusiveMin = prop.exclusiveMinimum;
  }
  return [
    {
      enabled: exclusiveMax !== void 0 && (prop.maximum === void 0 || exclusiveMax <= prop.maximum),
      isValid: ((value) => value < exclusiveMax),
      message: nls.localize("validations.exclusiveMax", "Value must be strictly less than {0}.", exclusiveMax)
    },
    {
      enabled: exclusiveMin !== void 0 && (prop.minimum === void 0 || exclusiveMin >= prop.minimum),
      isValid: ((value) => value > exclusiveMin),
      message: nls.localize("validations.exclusiveMin", "Value must be strictly greater than {0}.", exclusiveMin)
    },
    {
      enabled: prop.maximum !== void 0 && (exclusiveMax === void 0 || exclusiveMax > prop.maximum),
      isValid: ((value) => value <= prop.maximum),
      message: nls.localize("validations.max", "Value must be less than or equal to {0}.", prop.maximum)
    },
    {
      enabled: prop.minimum !== void 0 && (exclusiveMin === void 0 || exclusiveMin < prop.minimum),
      isValid: ((value) => value >= prop.minimum),
      message: nls.localize("validations.min", "Value must be greater than or equal to {0}.", prop.minimum)
    },
    {
      enabled: prop.multipleOf !== void 0,
      isValid: ((value) => value % prop.multipleOf === 0),
      message: nls.localize("validations.multipleOf", "Value must be a multiple of {0}.", prop.multipleOf)
    },
    {
      enabled: isIntegral,
      isValid: ((value) => value % 1 === 0),
      message: nls.localize("validations.expectedInteger", "Value must be an integer.")
    }
  ].filter((validation) => validation.enabled);
}
function getArrayValidator(prop) {
  if (prop.type === "array" && prop.items && !Array.isArray(prop.items)) {
    const propItems = prop.items;
    if (propItems && !Array.isArray(propItems.type)) {
      const withQuotes = (s) => `'` + s + `'`;
      return (value) => {
        if (!value) {
          return null;
        }
        let message = "";
        if (!Array.isArray(value)) {
          message += nls.localize("validations.arrayIncorrectType", "Incorrect type. Expected an array.");
          message += "\n";
          return message;
        }
        const arrayValue = value;
        if (prop.uniqueItems) {
          if (new Set(arrayValue).size < arrayValue.length) {
            message += nls.localize("validations.stringArrayUniqueItems", "Array has duplicate items");
            message += "\n";
          }
        }
        if (prop.minItems && arrayValue.length < prop.minItems) {
          message += nls.localize("validations.stringArrayMinItem", "Array must have at least {0} items", prop.minItems);
          message += "\n";
        }
        if (prop.maxItems && arrayValue.length > prop.maxItems) {
          message += nls.localize("validations.stringArrayMaxItem", "Array must have at most {0} items", prop.maxItems);
          message += "\n";
        }
        if (propItems.type === "string") {
          if (!isStringArray(arrayValue)) {
            message += nls.localize("validations.stringArrayIncorrectType", "Incorrect type. Expected a string array.");
            message += "\n";
            return message;
          }
          if (typeof propItems.pattern === "string") {
            const patternRegex = toRegExp(propItems.pattern);
            arrayValue.forEach((v) => {
              if (!patternRegex.test(v)) {
                message += propItems.patternErrorMessage || nls.localize(
                  "validations.stringArrayItemPattern",
                  "Value {0} must match regex {1}.",
                  withQuotes(v),
                  withQuotes(propItems.pattern)
                );
              }
            });
          }
          const propItemsEnum = propItems.enum;
          if (propItemsEnum) {
            arrayValue.forEach((v) => {
              if (propItemsEnum.indexOf(v) === -1) {
                message += nls.localize(
                  "validations.stringArrayItemEnum",
                  "Value {0} is not one of {1}",
                  withQuotes(v),
                  "[" + propItemsEnum.map(withQuotes).join(", ") + "]"
                );
                message += "\n";
              }
            });
          }
        } else if (propItems.type === "integer" || propItems.type === "number") {
          arrayValue.forEach((v) => {
            const errorMessage = getErrorsForSchema(propItems, v);
            if (errorMessage) {
              message += `${v}: ${errorMessage}
`;
            }
          });
        }
        return message;
      };
    }
  }
  return null;
}
function getObjectValidator(prop) {
  if (prop.type === "object") {
    const { properties, patternProperties, additionalProperties, propertyNames } = prop;
    return (value) => {
      if (!value) {
        return null;
      }
      const errors = [];
      let propertyNamesErrorShown = false;
      if (!isObject(value)) {
        errors.push(nls.localize("validations.objectIncorrectType", "Incorrect type. Expected an object."));
      } else {
        Object.keys(value).forEach((key) => {
          const data = value[key];
          if (propertyNames?.pattern && !propertyNamesErrorShown) {
            const patternRegex = toRegExp(propertyNames.pattern);
            if (!patternRegex.test(key)) {
              const errorMessage = propertyNames.patternErrorMessage || nls.localize("validations.propertyNamePattern", "Property name must match pattern `{0}`.", propertyNames.pattern);
              errors.push(errorMessage + "\n");
              propertyNamesErrorShown = true;
            }
          }
          if (properties && key in properties) {
            const errorMessage = getErrorsForSchema(properties[key], data);
            if (errorMessage) {
              errors.push(`${key}: ${errorMessage}
`);
            }
            return;
          }
          if (patternProperties) {
            for (const pattern in patternProperties) {
              if (RegExp(pattern).test(key)) {
                const errorMessage = getErrorsForSchema(patternProperties[pattern], data);
                if (errorMessage) {
                  errors.push(`${key}: ${errorMessage}
`);
                }
                return;
              }
            }
          }
          if (additionalProperties === false) {
            errors.push(nls.localize("validations.objectPattern", "Property {0} is not allowed.\n", key));
          } else if (typeof additionalProperties === "object") {
            const errorMessage = getErrorsForSchema(additionalProperties, data);
            if (errorMessage) {
              errors.push(`${key}: ${errorMessage}
`);
            }
          }
        });
      }
      if (errors.length) {
        return prop.errorMessage ? [prop.errorMessage, ...errors].join(" ") : errors.join(" ");
      }
      return "";
    };
  }
  return null;
}
function validatePropertyName(propertyNames, key) {
  if (!propertyNames?.pattern) {
    return true;
  }
  const patternRegex = toRegExp(propertyNames.pattern);
  return patternRegex.test(key);
}
function getErrorsForSchema(propertySchema, data) {
  const validator = createValidator(propertySchema);
  const errorMessage = validator(data);
  return errorMessage;
}
export {
  createValidator,
  getInvalidTypeError,
  validatePropertyName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxwcmVmZXJlbmNlc1xcY29tbW9uXFxwcmVmZXJlbmNlc1ZhbGlkYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEpTT05TY2hlbWFUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IGlzT2JqZWN0LCBpc1VuZGVmaW5lZE9yTnVsbCwgaXNTdHJpbmcsIGlzU3RyaW5nQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcblxudHlwZSBWYWxpZGF0b3I8VD4gPSB7IGVuYWJsZWQ6IGJvb2xlYW47IGlzVmFsaWQ6ICh2YWx1ZTogVCkgPT4gYm9vbGVhbjsgbWVzc2FnZTogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIGNhbkJlVHlwZShwcm9wVHlwZXM6IChzdHJpbmcgfCB1bmRlZmluZWQpW10sIC4uLnR5cGVzOiBKU09OU2NoZW1hVHlwZVtdKTogYm9vbGVhbiB7XG5cdHJldHVybiB0eXBlcy5zb21lKHQgPT4gcHJvcFR5cGVzLmluY2x1ZGVzKHQpKTtcbn1cblxuZnVuY3Rpb24gaXNOdWxsT3JFbXB0eSh2YWx1ZTogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdmFsdWUgPT09ICcnIHx8IGlzVW5kZWZpbmVkT3JOdWxsKHZhbHVlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZhbGlkYXRvcihwcm9wOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKTogKHZhbHVlOiBhbnkpID0+IChzdHJpbmcgfCBudWxsKSB7XG5cdGNvbnN0IHR5cGU6IChzdHJpbmcgfCB1bmRlZmluZWQpW10gPSBBcnJheS5pc0FycmF5KHByb3AudHlwZSkgPyBwcm9wLnR5cGUgOiBbcHJvcC50eXBlXTtcblx0Y29uc3QgaXNOdWxsYWJsZSA9IGNhbkJlVHlwZSh0eXBlLCAnbnVsbCcpO1xuXHRjb25zdCBpc051bWVyaWMgPSAoY2FuQmVUeXBlKHR5cGUsICdudW1iZXInKSB8fCBjYW5CZVR5cGUodHlwZSwgJ2ludGVnZXInKSkgJiYgKHR5cGUubGVuZ3RoID09PSAxIHx8IHR5cGUubGVuZ3RoID09PSAyICYmIGlzTnVsbGFibGUpO1xuXG5cdGNvbnN0IG51bWVyaWNWYWxpZGF0aW9ucyA9IGdldE51bWVyaWNWYWxpZGF0b3JzKHByb3ApO1xuXHRjb25zdCBzdHJpbmdWYWxpZGF0aW9ucyA9IGdldFN0cmluZ1ZhbGlkYXRvcnMocHJvcCk7XG5cdGNvbnN0IGFycmF5VmFsaWRhdG9yID0gZ2V0QXJyYXlWYWxpZGF0b3IocHJvcCk7XG5cdGNvbnN0IG9iamVjdFZhbGlkYXRvciA9IGdldE9iamVjdFZhbGlkYXRvcihwcm9wKTtcblxuXHRyZXR1cm4gdmFsdWUgPT4ge1xuXHRcdGlmIChpc051bGxhYmxlICYmIGlzTnVsbE9yRW1wdHkodmFsdWUpKSB7IHJldHVybiAnJzsgfVxuXG5cdFx0Y29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChhcnJheVZhbGlkYXRvcikge1xuXHRcdFx0Y29uc3QgZXJyID0gYXJyYXlWYWxpZGF0b3IodmFsdWUpO1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRlcnJvcnMucHVzaChlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvYmplY3RWYWxpZGF0b3IpIHtcblx0XHRcdGNvbnN0IGVyciA9IG9iamVjdFZhbGlkYXRvcih2YWx1ZSk7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdGVycm9ycy5wdXNoKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHByb3AudHlwZSA9PT0gJ2Jvb2xlYW4nICYmIHZhbHVlICE9PSB0cnVlICYmIHZhbHVlICE9PSBmYWxzZSkge1xuXHRcdFx0ZXJyb3JzLnB1c2gobmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5ib29sZWFuSW5jb3JyZWN0VHlwZScsICdJbmNvcnJlY3QgdHlwZS4gRXhwZWN0ZWQgXCJib29sZWFuXCIuJykpO1xuXHRcdH1cblxuXHRcdGlmIChpc051bWVyaWMpIHtcblx0XHRcdGlmIChpc051bGxPckVtcHR5KHZhbHVlKSB8fCB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJyB8fCBBcnJheS5pc0FycmF5KHZhbHVlKSB8fCBpc05hTigrdmFsdWUpKSB7XG5cdFx0XHRcdGVycm9ycy5wdXNoKG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuZXhwZWN0ZWROdW1lcmljJywgXCJWYWx1ZSBtdXN0IGJlIGEgbnVtYmVyLlwiKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlcnJvcnMucHVzaCguLi5udW1lcmljVmFsaWRhdGlvbnMuZmlsdGVyKHZhbGlkYXRvciA9PiAhdmFsaWRhdG9yLmlzVmFsaWQoK3ZhbHVlKSkubWFwKHZhbGlkYXRvciA9PiB2YWxpZGF0b3IubWVzc2FnZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwcm9wLnR5cGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRpZiAocHJvcC5lbnVtICYmICFpc1N0cmluZ0FycmF5KHByb3AuZW51bSkpIHtcblx0XHRcdFx0ZXJyb3JzLnB1c2gobmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5zdHJpbmdJbmNvcnJlY3RFbnVtT3B0aW9ucycsICdUaGUgZW51bSBvcHRpb25zIHNob3VsZCBiZSBzdHJpbmdzLCBidXQgdGhlcmUgaXMgYSBub24tc3RyaW5nIG9wdGlvbi4gUGxlYXNlIGZpbGUgYW4gaXNzdWUgd2l0aCB0aGUgZXh0ZW5zaW9uIGF1dGhvci4nKSk7XG5cdFx0XHR9IGVsc2UgaWYgKCFpc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdFx0ZXJyb3JzLnB1c2gobmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5zdHJpbmdJbmNvcnJlY3RUeXBlJywgJ0luY29ycmVjdCB0eXBlLiBFeHBlY3RlZCBcInN0cmluZ1wiLicpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVycm9ycy5wdXNoKC4uLnN0cmluZ1ZhbGlkYXRpb25zLmZpbHRlcih2YWxpZGF0b3IgPT4gIXZhbGlkYXRvci5pc1ZhbGlkKHZhbHVlKSkubWFwKHZhbGlkYXRvciA9PiB2YWxpZGF0b3IubWVzc2FnZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlcnJvcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gcHJvcC5lcnJvck1lc3NhZ2UgPyBbcHJvcC5lcnJvck1lc3NhZ2UsIC4uLmVycm9yc10uam9pbignICcpIDogZXJyb3JzLmpvaW4oJyAnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gJyc7XG5cdH07XG59XG5cbi8qKlxuICogUmV0dXJucyBhbiBlcnJvciBzdHJpbmcgaWYgdGhlIHZhbHVlIGlzIGludmFsaWQgYW5kIGNhbid0IGJlIGRpc3BsYXllZCBpbiB0aGUgc2V0dGluZ3MgVUkgZm9yIHRoZSBnaXZlbiB0eXBlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0SW52YWxpZFR5cGVFcnJvcih2YWx1ZTogYW55LCB0eXBlOiB1bmRlZmluZWQgfCBzdHJpbmcgfCBzdHJpbmdbXSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh0eXBlb2YgdHlwZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCB0eXBlQXJyID0gQXJyYXkuaXNBcnJheSh0eXBlKSA/IHR5cGUgOiBbdHlwZV07XG5cdGlmICghdHlwZUFyci5zb21lKF90eXBlID0+IHZhbHVlVmFsaWRhdGVzQXNUeXBlKHZhbHVlLCBfdHlwZSkpKSB7XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnaW52YWxpZFR5cGVFcnJvcicsIFwiU2V0dGluZyBoYXMgYW4gaW52YWxpZCB0eXBlLCBleHBlY3RlZCB7MH0uIEZpeCBpbiBKU09OLlwiLCBKU09OLnN0cmluZ2lmeSh0eXBlKSk7XG5cdH1cblxuXHRyZXR1cm47XG59XG5cbmZ1bmN0aW9uIHZhbHVlVmFsaWRhdGVzQXNUeXBlKHZhbHVlOiBhbnksIHR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCB2YWx1ZVR5cGUgPSB0eXBlb2YgdmFsdWU7XG5cdGlmICh0eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRyZXR1cm4gdmFsdWVUeXBlID09PSAnYm9vbGVhbic7XG5cdH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gdmFsdWUgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpICYmIHZhbHVlVHlwZSA9PT0gJ29iamVjdCc7XG5cdH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bGwnKSB7XG5cdFx0cmV0dXJuIHZhbHVlID09PSBudWxsO1xuXHR9IGVsc2UgaWYgKHR5cGUgPT09ICdhcnJheScpIHtcblx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG5cdH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gdmFsdWVUeXBlID09PSAnc3RyaW5nJztcblx0fSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJyB8fCB0eXBlID09PSAnaW50ZWdlcicpIHtcblx0XHRyZXR1cm4gdmFsdWVUeXBlID09PSAnbnVtYmVyJztcblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB0b1JlZ0V4cChwYXR0ZXJuOiBzdHJpbmcpOiBSZWdFeHAge1xuXHR0cnkge1xuXHRcdC8vIFRoZSB1IGZsYWcgYWxsb3dzIHN1cHBvcnQgZm9yIGJldHRlciBVbmljb2RlIG1hdGNoaW5nLFxuXHRcdC8vIGJ1dCBkZXByZWNhdGVzIHNvbWUgcGF0dGVybnMgc3VjaCBhcyBbXFxzLTldXG5cdFx0Ly8gUmVmIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL1JlZ3VsYXJfZXhwcmVzc2lvbnMvQ2hhcmFjdGVyX2NsYXNzI2Rlc2NyaXB0aW9uXG5cdFx0cmV0dXJuIG5ldyBSZWdFeHAocGF0dGVybiwgJ3UnKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJlZ0V4cChwYXR0ZXJuKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBJZiB0aGUgcGF0dGVybiBjYW4ndCBiZSBwYXJzZWQgZXZlbiB3aXRob3V0IHRoZSAndScgZmxhZyxcblx0XHRcdC8vIGp1c3QgbG9nIHRoZSBlcnJvciB0byBhdm9pZCByZW5kZXJpbmcgdGhlIGVudGlyZSBTZXR0aW5ncyBlZGl0b3IgYmxhbmsuXG5cdFx0XHQvLyBSZWYgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE5NTA1NFxuXHRcdFx0Y29uc29sZS5lcnJvcihubHMubG9jYWxpemUoJ3JlZ2V4UGFyc2luZ0Vycm9yJywgXCJFcnJvciBwYXJzaW5nIHRoZSBmb2xsb3dpbmcgcmVnZXggYm90aCB3aXRoIGFuZCB3aXRob3V0IHRoZSB1IGZsYWc6XCIpLCBwYXR0ZXJuKTtcblx0XHRcdHJldHVybiAvLiovO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBnZXRTdHJpbmdWYWxpZGF0b3JzKHByb3A6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpIHtcblx0Y29uc3QgdXJpUmVnZXggPSAvXigoW146Lz8jXSs/KTopPyhcXC9cXC8oW14vPyNdKikpPyhbXj8jXSopKFxcPyhbXiNdKikpPygjKC4qKSk/Lztcblx0bGV0IHBhdHRlcm5SZWdleDogUmVnRXhwIHwgdW5kZWZpbmVkO1xuXHRpZiAodHlwZW9mIHByb3AucGF0dGVybiA9PT0gJ3N0cmluZycpIHtcblx0XHRwYXR0ZXJuUmVnZXggPSB0b1JlZ0V4cChwcm9wLnBhdHRlcm4pO1xuXHR9XG5cblx0cmV0dXJuIFtcblx0XHR7XG5cdFx0XHRlbmFibGVkOiBwcm9wLm1heExlbmd0aCAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0aXNWYWxpZDogKCh2YWx1ZTogeyBsZW5ndGg6IG51bWJlciB9KSA9PiB2YWx1ZS5sZW5ndGggPD0gcHJvcC5tYXhMZW5ndGghKSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMubWF4TGVuZ3RoJywgXCJWYWx1ZSBtdXN0IGJlIHswfSBvciBmZXdlciBjaGFyYWN0ZXJzIGxvbmcuXCIsIHByb3AubWF4TGVuZ3RoKVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0ZW5hYmxlZDogcHJvcC5taW5MZW5ndGggIT09IHVuZGVmaW5lZCxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IHsgbGVuZ3RoOiBudW1iZXIgfSkgPT4gdmFsdWUubGVuZ3RoID49IHByb3AubWluTGVuZ3RoISksXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLm1pbkxlbmd0aCcsIFwiVmFsdWUgbXVzdCBiZSB7MH0gb3IgbW9yZSBjaGFyYWN0ZXJzIGxvbmcuXCIsIHByb3AubWluTGVuZ3RoKVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0ZW5hYmxlZDogcGF0dGVyblJlZ2V4ICE9PSB1bmRlZmluZWQsXG5cdFx0XHRpc1ZhbGlkOiAoKHZhbHVlOiBzdHJpbmcpID0+IHBhdHRlcm5SZWdleCEudGVzdCh2YWx1ZSkpLFxuXHRcdFx0bWVzc2FnZTogcHJvcC5wYXR0ZXJuRXJyb3JNZXNzYWdlIHx8IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMucmVnZXgnLCBcIlZhbHVlIG11c3QgbWF0Y2ggcmVnZXggYHswfWAuXCIsIHByb3AucGF0dGVybilcblx0XHR9LFxuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IHByb3AuZm9ybWF0ID09PSAnY29sb3ItaGV4Jyxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IHN0cmluZykgPT4gQ29sb3IuRm9ybWF0LkNTUy5wYXJzZUhleCh2YWx1ZSkpLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5jb2xvckZvcm1hdCcsIFwiSW52YWxpZCBjb2xvciBmb3JtYXQuIFVzZSAjUkdCLCAjUkdCQSwgI1JSR0dCQiBvciAjUlJHR0JCQUEuXCIpXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRlbmFibGVkOiBwcm9wLmZvcm1hdCA9PT0gJ3VyaScgfHwgcHJvcC5mb3JtYXQgPT09ICd1cmktcmVmZXJlbmNlJyxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IHN0cmluZykgPT4gISF2YWx1ZS5sZW5ndGgpLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy51cmlFbXB0eScsIFwiVVJJIGV4cGVjdGVkLlwiKVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0ZW5hYmxlZDogcHJvcC5mb3JtYXQgPT09ICd1cmknIHx8IHByb3AuZm9ybWF0ID09PSAndXJpLXJlZmVyZW5jZScsXG5cdFx0XHRpc1ZhbGlkOiAoKHZhbHVlOiBzdHJpbmcpID0+IHVyaVJlZ2V4LnRlc3QodmFsdWUpKSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMudXJpTWlzc2luZycsIFwiVVJJIGlzIGV4cGVjdGVkLlwiKVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0ZW5hYmxlZDogcHJvcC5mb3JtYXQgPT09ICd1cmknLFxuXHRcdFx0aXNWYWxpZDogKCh2YWx1ZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCh1cmlSZWdleCk7XG5cdFx0XHRcdHJldHVybiAhIShtYXRjaGVzICYmIG1hdGNoZXNbMl0pO1xuXHRcdFx0fSksXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLnVyaVNjaGVtZU1pc3NpbmcnLCBcIlVSSSB3aXRoIGEgc2NoZW1lIGlzIGV4cGVjdGVkLlwiKVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0ZW5hYmxlZDogcHJvcC5lbnVtICE9PSB1bmRlZmluZWQsXG5cdFx0XHRpc1ZhbGlkOiAoKHZhbHVlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0cmV0dXJuIHByb3AuZW51bSEuaW5jbHVkZXModmFsdWUpO1xuXHRcdFx0fSksXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLmludmFsaWRTdHJpbmdFbnVtVmFsdWUnLCBcIlZhbHVlIGlzIG5vdCBhY2NlcHRlZC4gVmFsaWQgdmFsdWVzOiB7MH0uXCIsXG5cdFx0XHRcdHByb3AuZW51bSA/IHByb3AuZW51bS5tYXAoa2V5ID0+IGBcIiR7a2V5fVwiYCkuam9pbignLCAnKSA6ICdbXScpXG5cdFx0fVxuXHRdLmZpbHRlcih2YWxpZGF0aW9uID0+IHZhbGlkYXRpb24uZW5hYmxlZCk7XG59XG5cbmZ1bmN0aW9uIGdldE51bWVyaWNWYWxpZGF0b3JzKHByb3A6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpOiBWYWxpZGF0b3I8bnVtYmVyPltdIHtcblx0Y29uc3QgdHlwZTogKHN0cmluZyB8IHVuZGVmaW5lZClbXSA9IEFycmF5LmlzQXJyYXkocHJvcC50eXBlKSA/IHByb3AudHlwZSA6IFtwcm9wLnR5cGVdO1xuXG5cdGNvbnN0IGlzTnVsbGFibGUgPSBjYW5CZVR5cGUodHlwZSwgJ251bGwnKTtcblx0Y29uc3QgaXNJbnRlZ3JhbCA9IChjYW5CZVR5cGUodHlwZSwgJ2ludGVnZXInKSkgJiYgKHR5cGUubGVuZ3RoID09PSAxIHx8IHR5cGUubGVuZ3RoID09PSAyICYmIGlzTnVsbGFibGUpO1xuXHRjb25zdCBpc051bWVyaWMgPSBjYW5CZVR5cGUodHlwZSwgJ251bWJlcicsICdpbnRlZ2VyJykgJiYgKHR5cGUubGVuZ3RoID09PSAxIHx8IHR5cGUubGVuZ3RoID09PSAyICYmIGlzTnVsbGFibGUpO1xuXHRpZiAoIWlzTnVtZXJpYykge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGxldCBleGNsdXNpdmVNYXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bGV0IGV4Y2x1c2l2ZU1pbjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGlmICh0eXBlb2YgcHJvcC5leGNsdXNpdmVNYXhpbXVtID09PSAnYm9vbGVhbicpIHtcblx0XHRleGNsdXNpdmVNYXggPSBwcm9wLmV4Y2x1c2l2ZU1heGltdW0gPyBwcm9wLm1heGltdW0gOiB1bmRlZmluZWQ7XG5cdH0gZWxzZSB7XG5cdFx0ZXhjbHVzaXZlTWF4ID0gcHJvcC5leGNsdXNpdmVNYXhpbXVtO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBwcm9wLmV4Y2x1c2l2ZU1pbmltdW0gPT09ICdib29sZWFuJykge1xuXHRcdGV4Y2x1c2l2ZU1pbiA9IHByb3AuZXhjbHVzaXZlTWluaW11bSA/IHByb3AubWluaW11bSA6IHVuZGVmaW5lZDtcblx0fSBlbHNlIHtcblx0XHRleGNsdXNpdmVNaW4gPSBwcm9wLmV4Y2x1c2l2ZU1pbmltdW07XG5cdH1cblxuXHRyZXR1cm4gW1xuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IGV4Y2x1c2l2ZU1heCAhPT0gdW5kZWZpbmVkICYmIChwcm9wLm1heGltdW0gPT09IHVuZGVmaW5lZCB8fCBleGNsdXNpdmVNYXggPD0gcHJvcC5tYXhpbXVtKSxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IG51bWJlcikgPT4gdmFsdWUgPCBleGNsdXNpdmVNYXghKSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuZXhjbHVzaXZlTWF4JywgXCJWYWx1ZSBtdXN0IGJlIHN0cmljdGx5IGxlc3MgdGhhbiB7MH0uXCIsIGV4Y2x1c2l2ZU1heClcblx0XHR9LFxuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IGV4Y2x1c2l2ZU1pbiAhPT0gdW5kZWZpbmVkICYmIChwcm9wLm1pbmltdW0gPT09IHVuZGVmaW5lZCB8fCBleGNsdXNpdmVNaW4gPj0gcHJvcC5taW5pbXVtKSxcblx0XHRcdGlzVmFsaWQ6ICgodmFsdWU6IG51bWJlcikgPT4gdmFsdWUgPiBleGNsdXNpdmVNaW4hKSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuZXhjbHVzaXZlTWluJywgXCJWYWx1ZSBtdXN0IGJlIHN0cmljdGx5IGdyZWF0ZXIgdGhhbiB7MH0uXCIsIGV4Y2x1c2l2ZU1pbilcblx0XHR9LFxuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IHByb3AubWF4aW11bSAhPT0gdW5kZWZpbmVkICYmIChleGNsdXNpdmVNYXggPT09IHVuZGVmaW5lZCB8fCBleGNsdXNpdmVNYXggPiBwcm9wLm1heGltdW0pLFxuXHRcdFx0aXNWYWxpZDogKCh2YWx1ZTogbnVtYmVyKSA9PiB2YWx1ZSA8PSBwcm9wLm1heGltdW0hKSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMubWF4JywgXCJWYWx1ZSBtdXN0IGJlIGxlc3MgdGhhbiBvciBlcXVhbCB0byB7MH0uXCIsIHByb3AubWF4aW11bSlcblx0XHR9LFxuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IHByb3AubWluaW11bSAhPT0gdW5kZWZpbmVkICYmIChleGNsdXNpdmVNaW4gPT09IHVuZGVmaW5lZCB8fCBleGNsdXNpdmVNaW4gPCBwcm9wLm1pbmltdW0pLFxuXHRcdFx0aXNWYWxpZDogKCh2YWx1ZTogbnVtYmVyKSA9PiB2YWx1ZSA+PSBwcm9wLm1pbmltdW0hKSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMubWluJywgXCJWYWx1ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byB7MH0uXCIsIHByb3AubWluaW11bSlcblx0XHR9LFxuXHRcdHtcblx0XHRcdGVuYWJsZWQ6IHByb3AubXVsdGlwbGVPZiAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0aXNWYWxpZDogKCh2YWx1ZTogbnVtYmVyKSA9PiB2YWx1ZSAlIHByb3AubXVsdGlwbGVPZiEgPT09IDApLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5tdWx0aXBsZU9mJywgXCJWYWx1ZSBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgezB9LlwiLCBwcm9wLm11bHRpcGxlT2YpXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRlbmFibGVkOiBpc0ludGVncmFsLFxuXHRcdFx0aXNWYWxpZDogKCh2YWx1ZTogbnVtYmVyKSA9PiB2YWx1ZSAlIDEgPT09IDApLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5leHBlY3RlZEludGVnZXInLCBcIlZhbHVlIG11c3QgYmUgYW4gaW50ZWdlci5cIilcblx0XHR9LFxuXHRdLmZpbHRlcih2YWxpZGF0aW9uID0+IHZhbGlkYXRpb24uZW5hYmxlZCk7XG59XG5cbmZ1bmN0aW9uIGdldEFycmF5VmFsaWRhdG9yKHByb3A6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpOiAoKHZhbHVlOiBhbnkpID0+IChzdHJpbmcgfCBudWxsKSkgfCBudWxsIHtcblx0aWYgKHByb3AudHlwZSA9PT0gJ2FycmF5JyAmJiBwcm9wLml0ZW1zICYmICFBcnJheS5pc0FycmF5KHByb3AuaXRlbXMpKSB7XG5cdFx0Y29uc3QgcHJvcEl0ZW1zID0gcHJvcC5pdGVtcztcblx0XHRpZiAocHJvcEl0ZW1zICYmICFBcnJheS5pc0FycmF5KHByb3BJdGVtcy50eXBlKSkge1xuXHRcdFx0Y29uc3Qgd2l0aFF1b3RlcyA9IChzOiBzdHJpbmcpID0+IGAnYCArIHMgKyBgJ2A7XG5cdFx0XHRyZXR1cm4gdmFsdWUgPT4ge1xuXHRcdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgbWVzc2FnZSA9ICcnO1xuXG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0XHRtZXNzYWdlICs9IG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMuYXJyYXlJbmNvcnJlY3RUeXBlJywgJ0luY29ycmVjdCB0eXBlLiBFeHBlY3RlZCBhbiBhcnJheS4nKTtcblx0XHRcdFx0XHRtZXNzYWdlICs9ICdcXG4nO1xuXHRcdFx0XHRcdHJldHVybiBtZXNzYWdlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYXJyYXlWYWx1ZSA9IHZhbHVlIGFzIHVua25vd25bXTtcblx0XHRcdFx0aWYgKHByb3AudW5pcXVlSXRlbXMpIHtcblx0XHRcdFx0XHRpZiAobmV3IFNldChhcnJheVZhbHVlKS5zaXplIDwgYXJyYXlWYWx1ZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdG1lc3NhZ2UgKz0gbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5zdHJpbmdBcnJheVVuaXF1ZUl0ZW1zJywgJ0FycmF5IGhhcyBkdXBsaWNhdGUgaXRlbXMnKTtcblx0XHRcdFx0XHRcdG1lc3NhZ2UgKz0gJ1xcbic7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHByb3AubWluSXRlbXMgJiYgYXJyYXlWYWx1ZS5sZW5ndGggPCBwcm9wLm1pbkl0ZW1zKSB7XG5cdFx0XHRcdFx0bWVzc2FnZSArPSBubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLnN0cmluZ0FycmF5TWluSXRlbScsICdBcnJheSBtdXN0IGhhdmUgYXQgbGVhc3QgezB9IGl0ZW1zJywgcHJvcC5taW5JdGVtcyk7XG5cdFx0XHRcdFx0bWVzc2FnZSArPSAnXFxuJztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChwcm9wLm1heEl0ZW1zICYmIGFycmF5VmFsdWUubGVuZ3RoID4gcHJvcC5tYXhJdGVtcykge1xuXHRcdFx0XHRcdG1lc3NhZ2UgKz0gbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5zdHJpbmdBcnJheU1heEl0ZW0nLCAnQXJyYXkgbXVzdCBoYXZlIGF0IG1vc3QgezB9IGl0ZW1zJywgcHJvcC5tYXhJdGVtcyk7XG5cdFx0XHRcdFx0bWVzc2FnZSArPSAnXFxuJztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChwcm9wSXRlbXMudHlwZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRpZiAoIWlzU3RyaW5nQXJyYXkoYXJyYXlWYWx1ZSkpIHtcblx0XHRcdFx0XHRcdG1lc3NhZ2UgKz0gbmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5zdHJpbmdBcnJheUluY29ycmVjdFR5cGUnLCAnSW5jb3JyZWN0IHR5cGUuIEV4cGVjdGVkIGEgc3RyaW5nIGFycmF5LicpO1xuXHRcdFx0XHRcdFx0bWVzc2FnZSArPSAnXFxuJztcblx0XHRcdFx0XHRcdHJldHVybiBtZXNzYWdlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0eXBlb2YgcHJvcEl0ZW1zLnBhdHRlcm4gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXR0ZXJuUmVnZXggPSB0b1JlZ0V4cChwcm9wSXRlbXMucGF0dGVybik7XG5cdFx0XHRcdFx0XHRhcnJheVZhbHVlLmZvckVhY2godiA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICghcGF0dGVyblJlZ2V4LnRlc3QodikpIHtcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlICs9XG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wSXRlbXMucGF0dGVybkVycm9yTWVzc2FnZSB8fFxuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQndmFsaWRhdGlvbnMuc3RyaW5nQXJyYXlJdGVtUGF0dGVybicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdWYWx1ZSB7MH0gbXVzdCBtYXRjaCByZWdleCB7MX0uJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0d2l0aFF1b3Rlcyh2KSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0d2l0aFF1b3Rlcyhwcm9wSXRlbXMucGF0dGVybiEpXG5cdFx0XHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBwcm9wSXRlbXNFbnVtID0gcHJvcEl0ZW1zLmVudW07XG5cdFx0XHRcdFx0aWYgKHByb3BJdGVtc0VudW0pIHtcblx0XHRcdFx0XHRcdGFycmF5VmFsdWUuZm9yRWFjaCh2ID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKHByb3BJdGVtc0VudW0uaW5kZXhPZih2KSA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlICs9IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0XHRcdCd2YWxpZGF0aW9ucy5zdHJpbmdBcnJheUl0ZW1FbnVtJyxcblx0XHRcdFx0XHRcdFx0XHRcdCdWYWx1ZSB7MH0gaXMgbm90IG9uZSBvZiB7MX0nLFxuXHRcdFx0XHRcdFx0XHRcdFx0d2l0aFF1b3Rlcyh2KSxcblx0XHRcdFx0XHRcdFx0XHRcdCdbJyArIHByb3BJdGVtc0VudW0ubWFwKHdpdGhRdW90ZXMpLmpvaW4oJywgJykgKyAnXSdcblx0XHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2UgKz0gJ1xcbic7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChwcm9wSXRlbXMudHlwZSA9PT0gJ2ludGVnZXInIHx8IHByb3BJdGVtcy50eXBlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGFycmF5VmFsdWUuZm9yRWFjaCh2ID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IGdldEVycm9yc0ZvclNjaGVtYShwcm9wSXRlbXMsIHYpO1xuXHRcdFx0XHRcdFx0aWYgKGVycm9yTWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlICs9IGAke3Z9OiAke2Vycm9yTWVzc2FnZX1cXG5gO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG1lc3NhZ2U7XG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRPYmplY3RWYWxpZGF0b3IocHJvcDogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSk6ICgodmFsdWU6IGFueSkgPT4gKHN0cmluZyB8IG51bGwpKSB8IG51bGwge1xuXHRpZiAocHJvcC50eXBlID09PSAnb2JqZWN0Jykge1xuXHRcdGNvbnN0IHsgcHJvcGVydGllcywgcGF0dGVyblByb3BlcnRpZXMsIGFkZGl0aW9uYWxQcm9wZXJ0aWVzLCBwcm9wZXJ0eU5hbWVzIH0gPSBwcm9wO1xuXHRcdHJldHVybiB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRsZXQgcHJvcGVydHlOYW1lc0Vycm9yU2hvd24gPSBmYWxzZTtcblxuXHRcdFx0aWYgKCFpc09iamVjdCh2YWx1ZSkpIHtcblx0XHRcdFx0ZXJyb3JzLnB1c2gobmxzLmxvY2FsaXplKCd2YWxpZGF0aW9ucy5vYmplY3RJbmNvcnJlY3RUeXBlJywgJ0luY29ycmVjdCB0eXBlLiBFeHBlY3RlZCBhbiBvYmplY3QuJykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0T2JqZWN0LmtleXModmFsdWUpLmZvckVhY2goKGtleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IHZhbHVlW2tleV07XG5cblx0XHRcdFx0XHQvLyBWYWxpZGF0ZSBwcm9wZXJ0eU5hbWVzLnBhdHRlcm4gLSBzaG93IGVycm9yIG1lc3NhZ2Ugb25jZVxuXHRcdFx0XHRcdGlmIChwcm9wZXJ0eU5hbWVzPy5wYXR0ZXJuICYmICFwcm9wZXJ0eU5hbWVzRXJyb3JTaG93bikge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGF0dGVyblJlZ2V4ID0gdG9SZWdFeHAocHJvcGVydHlOYW1lcy5wYXR0ZXJuKTtcblx0XHRcdFx0XHRcdGlmICghcGF0dGVyblJlZ2V4LnRlc3Qoa2V5KSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBwcm9wZXJ0eU5hbWVzLnBhdHRlcm5FcnJvck1lc3NhZ2UgfHxcblx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3ZhbGlkYXRpb25zLnByb3BlcnR5TmFtZVBhdHRlcm4nLCAnUHJvcGVydHkgbmFtZSBtdXN0IG1hdGNoIHBhdHRlcm4gYHswfWAuJywgcHJvcGVydHlOYW1lcy5wYXR0ZXJuKTtcblx0XHRcdFx0XHRcdFx0ZXJyb3JzLnB1c2goZXJyb3JNZXNzYWdlICsgJ1xcbicpO1xuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0eU5hbWVzRXJyb3JTaG93biA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHByb3BlcnRpZXMgJiYga2V5IGluIHByb3BlcnRpZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IGdldEVycm9yc0ZvclNjaGVtYShwcm9wZXJ0aWVzW2tleV0sIGRhdGEpO1xuXHRcdFx0XHRcdFx0aWYgKGVycm9yTWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcnMucHVzaChgJHtrZXl9OiAke2Vycm9yTWVzc2FnZX1cXG5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocGF0dGVyblByb3BlcnRpZXMpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBpbiBwYXR0ZXJuUHJvcGVydGllcykge1xuXHRcdFx0XHRcdFx0XHRpZiAoUmVnRXhwKHBhdHRlcm4pLnRlc3Qoa2V5KSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IGdldEVycm9yc0ZvclNjaGVtYShwYXR0ZXJuUHJvcGVydGllc1twYXR0ZXJuXSwgZGF0YSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGVycm9yTWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXJyb3JzLnB1c2goYCR7a2V5fTogJHtlcnJvck1lc3NhZ2V9XFxuYCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChhZGRpdGlvbmFsUHJvcGVydGllcyA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdGVycm9ycy5wdXNoKG5scy5sb2NhbGl6ZSgndmFsaWRhdGlvbnMub2JqZWN0UGF0dGVybicsICdQcm9wZXJ0eSB7MH0gaXMgbm90IGFsbG93ZWQuXFxuJywga2V5KSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgYWRkaXRpb25hbFByb3BlcnRpZXMgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBnZXRFcnJvcnNGb3JTY2hlbWEoYWRkaXRpb25hbFByb3BlcnRpZXMsIGRhdGEpO1xuXHRcdFx0XHRcdFx0aWYgKGVycm9yTWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0XHRlcnJvcnMucHVzaChgJHtrZXl9OiAke2Vycm9yTWVzc2FnZX1cXG5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXJyb3JzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gcHJvcC5lcnJvck1lc3NhZ2UgPyBbcHJvcC5lcnJvck1lc3NhZ2UsIC4uLmVycm9yc10uam9pbignICcpIDogZXJyb3JzLmpvaW4oJyAnKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH07XG5cdH1cblxuXHRyZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZXMgYSBzaW5nbGUgcHJvcGVydHkgbmFtZSBhZ2FpbnN0IHRoZSBwcm9wZXJ0eU5hbWVzLnBhdHRlcm4gc2NoZW1hLlxuICogUmV0dXJucyB0cnVlIGlmIHRoZSBrZXkgaXMgdmFsaWQsIGZhbHNlIG90aGVyd2lzZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlUHJvcGVydHlOYW1lKHByb3BlcnR5TmFtZXM6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWFbJ3Byb3BlcnR5TmFtZXMnXSwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKCFwcm9wZXJ0eU5hbWVzPy5wYXR0ZXJuKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Y29uc3QgcGF0dGVyblJlZ2V4ID0gdG9SZWdFeHAocHJvcGVydHlOYW1lcy5wYXR0ZXJuKTtcblx0cmV0dXJuIHBhdHRlcm5SZWdleC50ZXN0KGtleSk7XG59XG5cbmZ1bmN0aW9uIGdldEVycm9yc0ZvclNjaGVtYShwcm9wZXJ0eVNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgZGF0YTogYW55KTogc3RyaW5nIHwgbnVsbCB7XG5cdGNvbnN0IHZhbGlkYXRvciA9IGNyZWF0ZVZhbGlkYXRvcihwcm9wZXJ0eVNjaGVtYSk7XG5cdGNvbnN0IGVycm9yTWVzc2FnZSA9IHZhbGlkYXRvcihkYXRhKTtcblx0cmV0dXJuIGVycm9yTWVzc2FnZTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FB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
