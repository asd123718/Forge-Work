const _UriTemplate = class _UriTemplate {
  constructor(template, components) {
    this.template = template;
    this.template = template;
    this.components = components;
  }
  /**
   * Parses a URI template string into a UriTemplate instance.
   */
  static parse(template) {
    const components = [];
    const regex = /\{([^{}]+)\}/g;
    let match;
    let lastPos = 0;
    while (match = regex.exec(template)) {
      const [expression, inner] = match;
      components.push(template.slice(lastPos, match.index));
      lastPos = match.index + expression.length;
      if (template[match.index - 1] === "{" || template[lastPos] === "}") {
        components.push(inner);
        continue;
      }
      let operator = "";
      let rest = inner;
      if (rest.length > 0 && _UriTemplate._isOperator(rest[0])) {
        operator = rest[0];
        rest = rest.slice(1);
      }
      const variables = rest.split(",").map((v) => {
        let name = v;
        let explodable = false;
        let repeatable = false;
        let prefixLength = void 0;
        let optional = false;
        if (name.endsWith("*")) {
          explodable = true;
          repeatable = true;
          name = name.slice(0, -1);
        }
        const prefixMatch = name.match(/^(.*?):(\d+)$/);
        if (prefixMatch) {
          name = prefixMatch[1];
          prefixLength = parseInt(prefixMatch[2], 10);
        }
        if (name.endsWith("?")) {
          optional = true;
          name = name.slice(0, -1);
        }
        return { explodable, name, optional, prefixLength, repeatable };
      });
      components.push({ expression, operator, variables });
    }
    components.push(template.slice(lastPos));
    return new _UriTemplate(template, components);
  }
  static _isOperator(ch) {
    return _UriTemplate._operators.includes(ch);
  }
  /**
   * Resolves the template with the given variables.
   */
  resolve(variables) {
    let result = "";
    for (const comp of this.components) {
      if (typeof comp === "string") {
        result += comp;
      } else {
        result += this._expand(comp, variables);
      }
    }
    return result;
  }
  _expand(comp, variables) {
    const op = comp.operator;
    const varSpecs = comp.variables;
    if (varSpecs.length === 0) {
      return comp.expression;
    }
    const vals = [];
    const isNamed = op === ";" || op === "?" || op === "&";
    const isReserved = op === "+" || op === "#";
    const isFragment = op === "#";
    const isLabel = op === ".";
    const isPath = op === "/";
    const isForm = op === "?";
    const isFormCont = op === "&";
    const isParam = op === ";";
    let prefix = "";
    if (op === "+") {
      prefix = "";
    } else if (op === "#") {
      prefix = "#";
    } else if (op === ".") {
      prefix = ".";
    } else if (op === "/") {
      prefix = "";
    } else if (op === ";") {
      prefix = ";";
    } else if (op === "?") {
      prefix = "?";
    } else if (op === "&") {
      prefix = "&";
    }
    for (const v of varSpecs) {
      const value = variables[v.name];
      const defined = Object.prototype.hasOwnProperty.call(variables, v.name);
      if (value === void 0 || value === null || Array.isArray(value) && value.length === 0) {
        if (isParam) {
          if (defined && (value === null || value === void 0)) {
            vals.push(v.name);
          }
          continue;
        }
        if (isForm || isFormCont) {
          if (defined) {
            vals.push(_UriTemplate._formPair(v.name, "", isNamed));
          }
          continue;
        }
        continue;
      }
      if (typeof value === "object" && !Array.isArray(value)) {
        if (v.explodable) {
          const pairs = [];
          for (const k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
              const thisVal = String(value[k]);
              if (isParam) {
                pairs.push(k + "=" + thisVal);
              } else if (isForm || isFormCont) {
                pairs.push(k + "=" + thisVal);
              } else if (isLabel) {
                pairs.push(k + "=" + thisVal);
              } else if (isPath) {
                pairs.push("/" + k + "=" + _UriTemplate._encode(thisVal, isReserved));
              } else {
                pairs.push(k + "=" + _UriTemplate._encode(thisVal, isReserved));
              }
            }
          }
          if (isLabel) {
            vals.push(pairs.join("."));
          } else if (isPath) {
            vals.push(pairs.join(""));
          } else if (isParam) {
            vals.push(pairs.join(";"));
          } else if (isForm || isFormCont) {
            vals.push(pairs.join("&"));
          } else {
            vals.push(pairs.join(","));
          }
        } else {
          const pairs = [];
          for (const k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
              pairs.push(k);
              pairs.push(String(value[k]));
            }
          }
          const joined2 = pairs.join(",");
          if (isLabel) {
            vals.push(joined2);
          } else if (isParam || isForm || isFormCont) {
            vals.push(v.name + "=" + joined2);
          } else {
            vals.push(joined2);
          }
        }
        continue;
      }
      if (Array.isArray(value)) {
        if (v.explodable) {
          if (isLabel) {
            vals.push(value.join("."));
          } else if (isPath) {
            vals.push(value.map((x) => "/" + _UriTemplate._encode(x, isReserved)).join(""));
          } else if (isParam) {
            vals.push(value.map((x) => v.name + "=" + String(x)).join(";"));
          } else if (isForm || isFormCont) {
            vals.push(value.map((x) => v.name + "=" + String(x)).join("&"));
          } else {
            vals.push(value.map((x) => _UriTemplate._encode(x, isReserved)).join(","));
          }
        } else {
          if (isLabel) {
            vals.push(value.join(","));
          } else if (isParam) {
            vals.push(v.name + "=" + value.join(","));
          } else if (isForm || isFormCont) {
            vals.push(v.name + "=" + value.join(","));
          } else {
            vals.push(value.map((x) => _UriTemplate._encode(x, isReserved)).join(","));
          }
        }
        continue;
      }
      let str = String(value);
      if (v.prefixLength !== void 0) {
        str = str.substring(0, v.prefixLength);
      }
      const enc = _UriTemplate._encode(str, op === "+" || op === "#");
      if (isParam) {
        vals.push(v.name + "=" + enc);
      } else if (isForm || isFormCont) {
        vals.push(v.name + "=" + enc);
      } else if (isLabel) {
        vals.push(enc);
      } else if (isPath) {
        vals.push("/" + enc);
      } else {
        vals.push(enc);
      }
    }
    let joined = "";
    if (isLabel) {
      const filtered = vals.filter((v) => v !== "");
      joined = filtered.length ? prefix + filtered.join(".") : "";
    } else if (isPath) {
      const filtered = vals.filter((v) => v !== "");
      joined = filtered.length ? filtered.join("") : "";
      if (joined && !joined.startsWith("/")) {
        joined = "/" + joined;
      }
    } else if (isParam) {
      joined = vals.length ? prefix + vals.map((v) => v.replace(/=\s*$/, "")).join(";") : "";
    } else if (isForm) {
      joined = vals.length ? prefix + vals.join("&") : "";
    } else if (isFormCont) {
      joined = vals.length ? prefix + vals.join("&") : "";
    } else if (isFragment) {
      joined = prefix + vals.join(",");
    } else if (isReserved) {
      joined = vals.join(",");
    } else {
      joined = vals.join(",");
    }
    return joined;
  }
  static _encode(str, reserved) {
    return reserved ? encodeURI(str) : pctEncode(str);
  }
  static _formPair(k, v, named) {
    return named ? k + "=" + encodeURIComponent(String(v)) : encodeURIComponent(String(v));
  }
};
_UriTemplate._operators = ["+", "#", ".", "/", ";", "?", "&"];
let UriTemplate = _UriTemplate;
function pctEncode(str) {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    if (
      // alphanum ranges:
      chr >= 48 && chr <= 57 || chr >= 65 && chr <= 90 || chr >= 97 && chr <= 122 || // unreserved characters:
      (chr === 45 || chr === 46 || chr === 95 || chr === 126)
    ) {
      out += str[i];
    } else {
      out += "%" + chr.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}
export {
  UriTemplate
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXHVyaVRlbXBsYXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuZXhwb3J0IGludGVyZmFjZSBJVXJpVGVtcGxhdGVWYXJpYWJsZSB7XG5cdHJlYWRvbmx5IGV4cGxvZGFibGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgb3B0aW9uYWw6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHByZWZpeExlbmd0aD86IG51bWJlcjtcblx0cmVhZG9ubHkgcmVwZWF0YWJsZTogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElVcmlUZW1wbGF0ZUNvbXBvbmVudCB7XG5cdHJlYWRvbmx5IGV4cHJlc3Npb246IHN0cmluZztcblx0cmVhZG9ubHkgb3BlcmF0b3I6IHN0cmluZztcblx0cmVhZG9ubHkgdmFyaWFibGVzOiByZWFkb25seSBJVXJpVGVtcGxhdGVWYXJpYWJsZVtdO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYW4gUkZDIDY1NzAgVVJJIFRlbXBsYXRlLlxuICovXG5leHBvcnQgY2xhc3MgVXJpVGVtcGxhdGUge1xuXHQvKipcblx0ICogVGhlIHBhcnNlZCB0ZW1wbGF0ZSBjb21wb25lbnRzIChleHByZXNzaW9ucykuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgY29tcG9uZW50czogUmVhZG9ubHlBcnJheTxJVXJpVGVtcGxhdGVDb21wb25lbnQgfCBzdHJpbmc+O1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHRlbXBsYXRlOiBzdHJpbmcsXG5cdFx0Y29tcG9uZW50czogUmVhZG9ubHlBcnJheTxJVXJpVGVtcGxhdGVDb21wb25lbnQgfCBzdHJpbmc+XG5cdCkge1xuXHRcdHRoaXMudGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblx0XHR0aGlzLmNvbXBvbmVudHMgPSBjb21wb25lbnRzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBhcnNlcyBhIFVSSSB0ZW1wbGF0ZSBzdHJpbmcgaW50byBhIFVyaVRlbXBsYXRlIGluc3RhbmNlLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBwYXJzZSh0ZW1wbGF0ZTogc3RyaW5nKTogVXJpVGVtcGxhdGUge1xuXHRcdGNvbnN0IGNvbXBvbmVudHM6IEFycmF5PElVcmlUZW1wbGF0ZUNvbXBvbmVudCB8IHN0cmluZz4gPSBbXTtcblx0XHRjb25zdCByZWdleCA9IC9cXHsoW157fV0rKVxcfS9nO1xuXHRcdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHRsZXQgbGFzdFBvcyA9IDA7XG5cdFx0d2hpbGUgKChtYXRjaCA9IHJlZ2V4LmV4ZWModGVtcGxhdGUpKSkge1xuXHRcdFx0Y29uc3QgW2V4cHJlc3Npb24sIGlubmVyXSA9IG1hdGNoO1xuXHRcdFx0Y29tcG9uZW50cy5wdXNoKHRlbXBsYXRlLnNsaWNlKGxhc3RQb3MsIG1hdGNoLmluZGV4KSk7XG5cdFx0XHRsYXN0UG9zID0gbWF0Y2guaW5kZXggKyBleHByZXNzaW9uLmxlbmd0aDtcblxuXHRcdFx0Ly8gSGFuZGxlIGVzY2FwZWQgYnJhY2VzOiB0cmVhdCAne3snIGFuZCAnfX0nIGFzIGxpdGVyYWxzLCBub3QgZXhwcmVzc2lvbnNcblx0XHRcdGlmICh0ZW1wbGF0ZVttYXRjaC5pbmRleCAtIDFdID09PSAneycgfHwgdGVtcGxhdGVbbGFzdFBvc10gPT09ICd9Jykge1xuXHRcdFx0XHRjb21wb25lbnRzLnB1c2goaW5uZXIpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG9wZXJhdG9yID0gJyc7XG5cdFx0XHRsZXQgcmVzdCA9IGlubmVyO1xuXHRcdFx0aWYgKHJlc3QubGVuZ3RoID4gMCAmJiBVcmlUZW1wbGF0ZS5faXNPcGVyYXRvcihyZXN0WzBdKSkge1xuXHRcdFx0XHRvcGVyYXRvciA9IHJlc3RbMF07XG5cdFx0XHRcdHJlc3QgPSByZXN0LnNsaWNlKDEpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmFyaWFibGVzID0gcmVzdC5zcGxpdCgnLCcpLm1hcCgodik6IElVcmlUZW1wbGF0ZVZhcmlhYmxlID0+IHtcblx0XHRcdFx0bGV0IG5hbWUgPSB2O1xuXHRcdFx0XHRsZXQgZXhwbG9kYWJsZSA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgcmVwZWF0YWJsZSA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgcHJlZml4TGVuZ3RoOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBvcHRpb25hbCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAobmFtZS5lbmRzV2l0aCgnKicpKSB7XG5cdFx0XHRcdFx0ZXhwbG9kYWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0cmVwZWF0YWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0bmFtZSA9IG5hbWUuc2xpY2UoMCwgLTEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHByZWZpeE1hdGNoID0gbmFtZS5tYXRjaCgvXiguKj8pOihcXGQrKSQvKTtcblx0XHRcdFx0aWYgKHByZWZpeE1hdGNoKSB7XG5cdFx0XHRcdFx0bmFtZSA9IHByZWZpeE1hdGNoWzFdO1xuXHRcdFx0XHRcdHByZWZpeExlbmd0aCA9IHBhcnNlSW50KHByZWZpeE1hdGNoWzJdLCAxMCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5hbWUuZW5kc1dpdGgoJz8nKSkge1xuXHRcdFx0XHRcdG9wdGlvbmFsID0gdHJ1ZTtcblx0XHRcdFx0XHRuYW1lID0gbmFtZS5zbGljZSgwLCAtMSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgZXhwbG9kYWJsZSwgbmFtZSwgb3B0aW9uYWwsIHByZWZpeExlbmd0aCwgcmVwZWF0YWJsZSB9O1xuXHRcdFx0fSk7XG5cdFx0XHRjb21wb25lbnRzLnB1c2goeyBleHByZXNzaW9uLCBvcGVyYXRvciwgdmFyaWFibGVzIH0pO1xuXHRcdH1cblx0XHRjb21wb25lbnRzLnB1c2godGVtcGxhdGUuc2xpY2UobGFzdFBvcykpO1xuXG5cdFx0cmV0dXJuIG5ldyBVcmlUZW1wbGF0ZSh0ZW1wbGF0ZSwgY29tcG9uZW50cyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfb3BlcmF0b3JzID0gWycrJywgJyMnLCAnLicsICcvJywgJzsnLCAnPycsICcmJ10gYXMgY29uc3Q7XG5cdHByaXZhdGUgc3RhdGljIF9pc09wZXJhdG9yKGNoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFVyaVRlbXBsYXRlLl9vcGVyYXRvcnMgYXMgcmVhZG9ubHkgc3RyaW5nW10pLmluY2x1ZGVzKGNoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgdGVtcGxhdGUgd2l0aCB0aGUgZ2l2ZW4gdmFyaWFibGVzLlxuXHQgKi9cblx0cHVibGljIHJlc29sdmUodmFyaWFibGVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9ICcnO1xuXHRcdGZvciAoY29uc3QgY29tcCBvZiB0aGlzLmNvbXBvbmVudHMpIHtcblx0XHRcdGlmICh0eXBlb2YgY29tcCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmVzdWx0ICs9IGNvbXA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQgKz0gdGhpcy5fZXhwYW5kKGNvbXAsIHZhcmlhYmxlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9leHBhbmQoY29tcDogSVVyaVRlbXBsYXRlQ29tcG9uZW50LCB2YXJpYWJsZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogc3RyaW5nIHtcblx0XHRjb25zdCBvcCA9IGNvbXAub3BlcmF0b3I7XG5cdFx0Y29uc3QgdmFyU3BlY3MgPSBjb21wLnZhcmlhYmxlcztcblx0XHRpZiAodmFyU3BlY3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gY29tcC5leHByZXNzaW9uO1xuXHRcdH1cblx0XHRjb25zdCB2YWxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGlzTmFtZWQgPSBvcCA9PT0gJzsnIHx8IG9wID09PSAnPycgfHwgb3AgPT09ICcmJztcblx0XHRjb25zdCBpc1Jlc2VydmVkID0gb3AgPT09ICcrJyB8fCBvcCA9PT0gJyMnO1xuXHRcdGNvbnN0IGlzRnJhZ21lbnQgPSBvcCA9PT0gJyMnO1xuXHRcdGNvbnN0IGlzTGFiZWwgPSBvcCA9PT0gJy4nO1xuXHRcdGNvbnN0IGlzUGF0aCA9IG9wID09PSAnLyc7XG5cdFx0Y29uc3QgaXNGb3JtID0gb3AgPT09ICc/Jztcblx0XHRjb25zdCBpc0Zvcm1Db250ID0gb3AgPT09ICcmJztcblx0XHRjb25zdCBpc1BhcmFtID0gb3AgPT09ICc7JztcblxuXHRcdGxldCBwcmVmaXggPSAnJztcblx0XHRpZiAob3AgPT09ICcrJykgeyBwcmVmaXggPSAnJzsgfVxuXHRcdGVsc2UgaWYgKG9wID09PSAnIycpIHsgcHJlZml4ID0gJyMnOyB9XG5cdFx0ZWxzZSBpZiAob3AgPT09ICcuJykgeyBwcmVmaXggPSAnLic7IH1cblx0XHRlbHNlIGlmIChvcCA9PT0gJy8nKSB7IHByZWZpeCA9ICcnOyB9XG5cdFx0ZWxzZSBpZiAob3AgPT09ICc7JykgeyBwcmVmaXggPSAnOyc7IH1cblx0XHRlbHNlIGlmIChvcCA9PT0gJz8nKSB7IHByZWZpeCA9ICc/JzsgfVxuXHRcdGVsc2UgaWYgKG9wID09PSAnJicpIHsgcHJlZml4ID0gJyYnOyB9XG5cblx0XHRmb3IgKGNvbnN0IHYgb2YgdmFyU3BlY3MpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gdmFyaWFibGVzW3YubmFtZV07XG5cdFx0XHRjb25zdCBkZWZpbmVkID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhcmlhYmxlcywgdi5uYW1lKTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsIHx8IChBcnJheS5pc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDApKSB7XG5cdFx0XHRcdGlmIChpc1BhcmFtKSB7XG5cdFx0XHRcdFx0aWYgKGRlZmluZWQgJiYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0XHR2YWxzLnB1c2godi5uYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzRm9ybSB8fCBpc0Zvcm1Db250KSB7XG5cdFx0XHRcdFx0aWYgKGRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHZhbHMucHVzaChVcmlUZW1wbGF0ZS5fZm9ybVBhaXIodi5uYW1lLCAnJywgaXNOYW1lZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0XHRpZiAodi5leHBsb2RhYmxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFpcnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrIGluIHZhbHVlKSB7XG5cdFx0XHRcdFx0XHRpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCBrKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0aGlzVmFsID0gU3RyaW5nKCh2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba10pO1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNQYXJhbSkge1xuXHRcdFx0XHRcdFx0XHRcdHBhaXJzLnB1c2goayArICc9JyArIHRoaXNWYWwpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzRm9ybSB8fCBpc0Zvcm1Db250KSB7XG5cdFx0XHRcdFx0XHRcdFx0cGFpcnMucHVzaChrICsgJz0nICsgdGhpc1ZhbCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNMYWJlbCkge1xuXHRcdFx0XHRcdFx0XHRcdHBhaXJzLnB1c2goayArICc9JyArIHRoaXNWYWwpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzUGF0aCkge1xuXHRcdFx0XHRcdFx0XHRcdHBhaXJzLnB1c2goJy8nICsgayArICc9JyArIFVyaVRlbXBsYXRlLl9lbmNvZGUodGhpc1ZhbCwgaXNSZXNlcnZlZCkpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHBhaXJzLnB1c2goayArICc9JyArIFVyaVRlbXBsYXRlLl9lbmNvZGUodGhpc1ZhbCwgaXNSZXNlcnZlZCkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpc0xhYmVsKSB7XG5cdFx0XHRcdFx0XHR2YWxzLnB1c2gocGFpcnMuam9pbignLicpKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzUGF0aCkge1xuXHRcdFx0XHRcdFx0dmFscy5wdXNoKHBhaXJzLmpvaW4oJycpKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzUGFyYW0pIHtcblx0XHRcdFx0XHRcdHZhbHMucHVzaChwYWlycy5qb2luKCc7JykpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNGb3JtIHx8IGlzRm9ybUNvbnQpIHtcblx0XHRcdFx0XHRcdHZhbHMucHVzaChwYWlycy5qb2luKCcmJykpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR2YWxzLnB1c2gocGFpcnMuam9pbignLCcpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gTm90IGV4cGxvZGFibGU6IGpvaW4gYXMgazEsdjEsazIsdjIsLi4uIGFuZCBhc3NpZ24gdG8gdmFyaWFibGUgbmFtZVxuXHRcdFx0XHRcdGNvbnN0IHBhaXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgayBpbiB2YWx1ZSkge1xuXHRcdFx0XHRcdFx0aWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgaykpIHtcblx0XHRcdFx0XHRcdFx0cGFpcnMucHVzaChrKTtcblx0XHRcdFx0XHRcdFx0cGFpcnMucHVzaChTdHJpbmcoKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtrXSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBGb3IgbGFiZWwsIHBhcmFtLCBmb3JtLCBqb2luIGFzIGtleXM9c2VtaSw7LGRvdCwuLGNvbW1hLCwgKG5vIGVuY29kaW5nIG9mICwgb3IgOylcblx0XHRcdFx0XHRjb25zdCBqb2luZWQgPSBwYWlycy5qb2luKCcsJyk7XG5cdFx0XHRcdFx0aWYgKGlzTGFiZWwpIHtcblx0XHRcdFx0XHRcdHZhbHMucHVzaChqb2luZWQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNQYXJhbSB8fCBpc0Zvcm0gfHwgaXNGb3JtQ29udCkge1xuXHRcdFx0XHRcdFx0dmFscy5wdXNoKHYubmFtZSArICc9JyArIGpvaW5lZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHZhbHMucHVzaChqb2luZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0XHRpZiAodi5leHBsb2RhYmxlKSB7XG5cdFx0XHRcdFx0aWYgKGlzTGFiZWwpIHtcblx0XHRcdFx0XHRcdHZhbHMucHVzaCh2YWx1ZS5qb2luKCcuJykpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNQYXRoKSB7XG5cdFx0XHRcdFx0XHR2YWxzLnB1c2godmFsdWUubWFwKHggPT4gJy8nICsgVXJpVGVtcGxhdGUuX2VuY29kZSh4LCBpc1Jlc2VydmVkKSkuam9pbignJykpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNQYXJhbSkge1xuXHRcdFx0XHRcdFx0dmFscy5wdXNoKHZhbHVlLm1hcCh4ID0+IHYubmFtZSArICc9JyArIFN0cmluZyh4KSkuam9pbignOycpKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzRm9ybSB8fCBpc0Zvcm1Db250KSB7XG5cdFx0XHRcdFx0XHR2YWxzLnB1c2godmFsdWUubWFwKHggPT4gdi5uYW1lICsgJz0nICsgU3RyaW5nKHgpKS5qb2luKCcmJykpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR2YWxzLnB1c2godmFsdWUubWFwKHggPT4gVXJpVGVtcGxhdGUuX2VuY29kZSh4LCBpc1Jlc2VydmVkKSkuam9pbignLCcpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKGlzTGFiZWwpIHtcblx0XHRcdFx0XHRcdHZhbHMucHVzaCh2YWx1ZS5qb2luKCcsJykpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNQYXJhbSkge1xuXHRcdFx0XHRcdFx0dmFscy5wdXNoKHYubmFtZSArICc9JyArIHZhbHVlLmpvaW4oJywnKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpc0Zvcm0gfHwgaXNGb3JtQ29udCkge1xuXHRcdFx0XHRcdFx0dmFscy5wdXNoKHYubmFtZSArICc9JyArIHZhbHVlLmpvaW4oJywnKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHZhbHMucHVzaCh2YWx1ZS5tYXAoeCA9PiBVcmlUZW1wbGF0ZS5fZW5jb2RlKHgsIGlzUmVzZXJ2ZWQpKS5qb2luKCcsJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCBzdHIgPSBTdHJpbmcodmFsdWUpO1xuXHRcdFx0aWYgKHYucHJlZml4TGVuZ3RoICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0c3RyID0gc3RyLnN1YnN0cmluZygwLCB2LnByZWZpeExlbmd0aCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBGb3Igc2ltcGxlIGV4cGFuc2lvbiwgZW5jb2RlICEgYXMgd2VsbCAobm90IHJlc2VydmVkKVxuXHRcdFx0Ly8gT25seSArIGFuZCAjIGFyZSByZXNlcnZlZFxuXHRcdFx0Y29uc3QgZW5jID0gVXJpVGVtcGxhdGUuX2VuY29kZShzdHIsIG9wID09PSAnKycgfHwgb3AgPT09ICcjJyk7XG5cdFx0XHRpZiAoaXNQYXJhbSkge1xuXHRcdFx0XHR2YWxzLnB1c2godi5uYW1lICsgJz0nICsgZW5jKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNGb3JtIHx8IGlzRm9ybUNvbnQpIHtcblx0XHRcdFx0dmFscy5wdXNoKHYubmFtZSArICc9JyArIGVuYyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzTGFiZWwpIHtcblx0XHRcdFx0dmFscy5wdXNoKGVuYyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzUGF0aCkge1xuXHRcdFx0XHR2YWxzLnB1c2goJy8nICsgZW5jKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhbHMucHVzaChlbmMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBqb2luZWQgPSAnJztcblx0XHRpZiAoaXNMYWJlbCkge1xuXHRcdFx0Ly8gUmVtb3ZlIHRyYWlsaW5nIGRvdCBmb3IgbWlzc2luZyB2YWx1ZXNcblx0XHRcdGNvbnN0IGZpbHRlcmVkID0gdmFscy5maWx0ZXIodiA9PiB2ICE9PSAnJyk7XG5cdFx0XHRqb2luZWQgPSBmaWx0ZXJlZC5sZW5ndGggPyBwcmVmaXggKyBmaWx0ZXJlZC5qb2luKCcuJykgOiAnJztcblx0XHR9IGVsc2UgaWYgKGlzUGF0aCkge1xuXHRcdFx0Ly8gUmVtb3ZlIGVtcHR5IHNlZ21lbnRzIGZvciB1bmRlZmluZWQvbnVsbFxuXHRcdFx0Y29uc3QgZmlsdGVyZWQgPSB2YWxzLmZpbHRlcih2ID0+IHYgIT09ICcnKTtcblx0XHRcdGpvaW5lZCA9IGZpbHRlcmVkLmxlbmd0aCA/IGZpbHRlcmVkLmpvaW4oJycpIDogJyc7XG5cdFx0XHRpZiAoam9pbmVkICYmICFqb2luZWQuc3RhcnRzV2l0aCgnLycpKSB7XG5cdFx0XHRcdGpvaW5lZCA9ICcvJyArIGpvaW5lZDtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzUGFyYW0pIHtcblx0XHRcdC8vIEZvciBwYXJhbSwgaWYgdmFsdWUgaXMgZW1wdHkgc3RyaW5nLCBqdXN0IGFwcGVuZCA7bmFtZVxuXHRcdFx0am9pbmVkID0gdmFscy5sZW5ndGggPyBwcmVmaXggKyB2YWxzLm1hcCh2ID0+IHYucmVwbGFjZSgvPVxccyokLywgJycpKS5qb2luKCc7JykgOiAnJztcblx0XHR9IGVsc2UgaWYgKGlzRm9ybSkge1xuXHRcdFx0am9pbmVkID0gdmFscy5sZW5ndGggPyBwcmVmaXggKyB2YWxzLmpvaW4oJyYnKSA6ICcnO1xuXHRcdH0gZWxzZSBpZiAoaXNGb3JtQ29udCkge1xuXHRcdFx0am9pbmVkID0gdmFscy5sZW5ndGggPyBwcmVmaXggKyB2YWxzLmpvaW4oJyYnKSA6ICcnO1xuXHRcdH0gZWxzZSBpZiAoaXNGcmFnbWVudCkge1xuXHRcdFx0am9pbmVkID0gcHJlZml4ICsgdmFscy5qb2luKCcsJyk7XG5cdFx0fSBlbHNlIGlmIChpc1Jlc2VydmVkKSB7XG5cdFx0XHRqb2luZWQgPSB2YWxzLmpvaW4oJywnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0am9pbmVkID0gdmFscy5qb2luKCcsJyk7XG5cdFx0fVxuXHRcdHJldHVybiBqb2luZWQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZW5jb2RlKHN0cjogc3RyaW5nLCByZXNlcnZlZDogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHJlc2VydmVkID8gZW5jb2RlVVJJKHN0cikgOiBwY3RFbmNvZGUoc3RyKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9mb3JtUGFpcihrOiBzdHJpbmcsIHY6IHVua25vd24sIG5hbWVkOiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbmFtZWQgPyBrICsgJz0nICsgZW5jb2RlVVJJQ29tcG9uZW50KFN0cmluZyh2KSkgOiBlbmNvZGVVUklDb21wb25lbnQoU3RyaW5nKHYpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBwY3RFbmNvZGUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgb3V0ID0gJyc7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgY2hyID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cdFx0aWYgKFxuXHRcdFx0Ly8gYWxwaGFudW0gcmFuZ2VzOlxuXHRcdFx0KGNociA+PSAweDMwICYmIGNociA8PSAweDM5IHx8IGNociA+PSAweDQxICYmIGNociA8PSAweDVhIHx8IGNociA+PSAweDYxICYmIGNociA8PSAweDdhKSB8fFxuXHRcdFx0Ly8gdW5yZXNlcnZlZCBjaGFyYWN0ZXJzOlxuXHRcdFx0KGNociA9PT0gMHgyZCB8fCBjaHIgPT09IDB4MmUgfHwgY2hyID09PSAweDVmIHx8IGNociA9PT0gMHg3ZSlcblx0XHQpIHtcblx0XHRcdG91dCArPSBzdHJbaV07XG5cdFx0fSBlbHNlIHtcblx0XHRcdG91dCArPSAnJScgKyBjaHIudG9TdHJpbmcoMTYpLnRvVXBwZXJDYXNlKCkucGFkU3RhcnQoMiwgJzAnKTtcblx0XHR9XG5cdH1c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
