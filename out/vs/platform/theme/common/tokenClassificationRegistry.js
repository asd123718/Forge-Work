import { RunOnceScheduler } from "../../../base/common/async.js";
import { Color } from "../../../base/common/color.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as nls from "../../../nls.js";
import { Extensions as JSONExtensions } from "../../jsonschemas/common/jsonContributionRegistry.js";
import * as platform from "../../registry/common/platform.js";
const TOKEN_TYPE_WILDCARD = "*";
const TOKEN_CLASSIFIER_LANGUAGE_SEPARATOR = ":";
const CLASSIFIER_MODIFIER_SEPARATOR = ".";
const idPattern = "\\w+[-_\\w+]*";
const typeAndModifierIdPattern = `^${idPattern}$`;
const selectorPattern = `^(${idPattern}|\\*)(\\${CLASSIFIER_MODIFIER_SEPARATOR}${idPattern})*(${TOKEN_CLASSIFIER_LANGUAGE_SEPARATOR}${idPattern})?$`;
const fontStylePattern = "^(\\s*(italic|bold|underline|strikethrough))*\\s*$";
class TokenStyle {
  constructor(foreground, bold, underline, strikethrough, italic) {
    this.foreground = foreground;
    this.bold = bold;
    this.underline = underline;
    this.strikethrough = strikethrough;
    this.italic = italic;
  }
}
((TokenStyle2) => {
  function toJSONObject(style) {
    return {
      _foreground: style.foreground === void 0 ? null : Color.Format.CSS.formatHexA(style.foreground, true),
      _bold: style.bold === void 0 ? null : style.bold,
      _underline: style.underline === void 0 ? null : style.underline,
      _italic: style.italic === void 0 ? null : style.italic,
      _strikethrough: style.strikethrough === void 0 ? null : style.strikethrough
    };
  }
  TokenStyle2.toJSONObject = toJSONObject;
  function fromJSONObject(obj) {
    if (obj) {
      const boolOrUndef = (b) => typeof b === "boolean" ? b : void 0;
      const colorOrUndef = (s) => typeof s === "string" ? Color.fromHex(s) : void 0;
      return new TokenStyle2(
        colorOrUndef(obj._foreground),
        boolOrUndef(obj._bold),
        boolOrUndef(obj._underline),
        boolOrUndef(obj._strikethrough),
        boolOrUndef(obj._italic)
      );
    }
    return void 0;
  }
  TokenStyle2.fromJSONObject = fromJSONObject;
  function equals(s1, s2) {
    if (s1 === s2) {
      return true;
    }
    return s1 !== void 0 && s2 !== void 0 && (s1.foreground instanceof Color ? s1.foreground.equals(s2.foreground) : s2.foreground === void 0) && s1.bold === s2.bold && s1.underline === s2.underline && s1.strikethrough === s2.strikethrough && s1.italic === s2.italic;
  }
  TokenStyle2.equals = equals;
  function is(s) {
    return s instanceof TokenStyle2;
  }
  TokenStyle2.is = is;
  function fromData(data) {
    return new TokenStyle2(data.foreground, data.bold, data.underline, data.strikethrough, data.italic);
  }
  TokenStyle2.fromData = fromData;
  function fromSettings(foreground, fontStyle, bold, underline, strikethrough, italic) {
    let foregroundColor = void 0;
    if (foreground !== void 0) {
      foregroundColor = Color.fromHex(foreground);
    }
    if (fontStyle !== void 0) {
      bold = italic = underline = strikethrough = false;
      const expression = /italic|bold|underline|strikethrough/g;
      let match;
      while (match = expression.exec(fontStyle)) {
        switch (match[0]) {
          case "bold":
            bold = true;
            break;
          case "italic":
            italic = true;
            break;
          case "underline":
            underline = true;
            break;
          case "strikethrough":
            strikethrough = true;
            break;
        }
      }
    }
    return new TokenStyle2(foregroundColor, bold, underline, strikethrough, italic);
  }
  TokenStyle2.fromSettings = fromSettings;
})(TokenStyle || (TokenStyle = {}));
var SemanticTokenRule;
((SemanticTokenRule2) => {
  function fromJSONObject(registry, o) {
    if (o && typeof o._selector === "string" && o._style) {
      const style = TokenStyle.fromJSONObject(o._style);
      if (style) {
        try {
          return { selector: registry.parseTokenSelector(o._selector), style };
        } catch (_ignore) {
        }
      }
    }
    return void 0;
  }
  SemanticTokenRule2.fromJSONObject = fromJSONObject;
  function toJSONObject(rule) {
    return {
      _selector: rule.selector.id,
      _style: TokenStyle.toJSONObject(rule.style)
    };
  }
  SemanticTokenRule2.toJSONObject = toJSONObject;
  function equals(r1, r2) {
    if (r1 === r2) {
      return true;
    }
    return r1 !== void 0 && r2 !== void 0 && r1.selector && r2.selector && r1.selector.id === r2.selector.id && TokenStyle.equals(r1.style, r2.style);
  }
  SemanticTokenRule2.equals = equals;
  function is(r) {
    return r && r.selector && typeof r.selector.id === "string" && TokenStyle.is(r.style);
  }
  SemanticTokenRule2.is = is;
})(SemanticTokenRule || (SemanticTokenRule = {}));
const Extensions = {
  TokenClassificationContribution: "base.contributions.tokenClassification"
};
class TokenClassificationRegistry extends Disposable {
  constructor() {
    super();
    this._onDidChangeSchema = this._register(new Emitter());
    this.onDidChangeSchema = this._onDidChangeSchema.event;
    this.currentTypeNumber = 0;
    this.currentModifierBit = 1;
    this.tokenStylingDefaultRules = [];
    this.tokenStylingSchema = {
      type: "object",
      properties: {},
      patternProperties: {
        [selectorPattern]: getStylingSchemeEntry()
      },
      //errorMessage: nls.localize('schema.token.errors', 'Valid token selectors have the form (*|tokenType)(.tokenModifier)*(:tokenLanguage)?.'),
      additionalProperties: false,
      definitions: {
        style: {
          type: "object",
          description: nls.localize("schema.token.settings", "Colors and styles for the token."),
          properties: {
            foreground: {
              type: "string",
              description: nls.localize("schema.token.foreground", "Foreground color for the token."),
              format: "color-hex",
              default: "#ff0000"
            },
            background: {
              type: "string",
              deprecationMessage: nls.localize("schema.token.background.warning", "Token background colors are currently not supported.")
            },
            fontStyle: {
              type: "string",
              description: nls.localize("schema.token.fontStyle", "Sets the all font styles of the rule: 'italic', 'bold', 'underline' or 'strikethrough' or a combination. All styles that are not listed are unset. The empty string unsets all styles."),
              pattern: fontStylePattern,
              patternErrorMessage: nls.localize("schema.fontStyle.error", "Font style must be 'italic', 'bold', 'underline' or 'strikethrough' or a combination. The empty string unsets all styles."),
              defaultSnippets: [
                { label: nls.localize("schema.token.fontStyle.none", "None (clear inherited style)"), bodyText: '""' },
                { body: "italic" },
                { body: "bold" },
                { body: "underline" },
                { body: "strikethrough" },
                { body: "italic bold" },
                { body: "italic underline" },
                { body: "italic strikethrough" },
                { body: "bold underline" },
                { body: "bold strikethrough" },
                { body: "underline strikethrough" },
                { body: "italic bold underline" },
                { body: "italic bold strikethrough" },
                { body: "italic underline strikethrough" },
                { body: "bold underline strikethrough" },
                { body: "italic bold underline strikethrough" }
              ]
            },
            bold: {
              type: "boolean",
              description: nls.localize("schema.token.bold", "Sets or unsets the font style to bold. Note, the presence of 'fontStyle' overrides this setting.")
            },
            italic: {
              type: "boolean",
              description: nls.localize("schema.token.italic", "Sets or unsets the font style to italic. Note, the presence of 'fontStyle' overrides this setting.")
            },
            underline: {
              type: "boolean",
              description: nls.localize("schema.token.underline", "Sets or unsets the font style to underline. Note, the presence of 'fontStyle' overrides this setting.")
            },
            strikethrough: {
              type: "boolean",
              description: nls.localize("schema.token.strikethrough", "Sets or unsets the font style to strikethrough. Note, the presence of 'fontStyle' overrides this setting.")
            }
          },
          defaultSnippets: [{ body: { foreground: "${1:#FF0000}", fontStyle: "${2:bold}" } }]
        }
      }
    };
    this.tokenTypeById = /* @__PURE__ */ Object.create(null);
    this.tokenModifierById = /* @__PURE__ */ Object.create(null);
    this.typeHierarchy = /* @__PURE__ */ Object.create(null);
  }
  registerTokenType(id, description, superType, deprecationMessage) {
    if (!id.match(typeAndModifierIdPattern)) {
      throw new Error("Invalid token type id.");
    }
    if (superType && !superType.match(typeAndModifierIdPattern)) {
      throw new Error("Invalid token super type id.");
    }
    const num = this.currentTypeNumber++;
    const tokenStyleContribution = { num, id, superType, description, deprecationMessage };
    this.tokenTypeById[id] = tokenStyleContribution;
    const stylingSchemeEntry = getStylingSchemeEntry(description, deprecationMessage);
    this.tokenStylingSchema.properties[id] = stylingSchemeEntry;
    this.typeHierarchy = /* @__PURE__ */ Object.create(null);
  }
  registerTokenModifier(id, description, deprecationMessage) {
    if (!id.match(typeAndModifierIdPattern)) {
      throw new Error("Invalid token modifier id.");
    }
    const num = this.currentModifierBit;
    this.currentModifierBit = this.currentModifierBit * 2;
    const tokenStyleContribution = { num, id, description, deprecationMessage };
    this.tokenModifierById[id] = tokenStyleContribution;
    this.tokenStylingSchema.properties[`*.${id}`] = getStylingSchemeEntry(description, deprecationMessage);
  }
  parseTokenSelector(selectorString, language) {
    const selector = parseClassifierString(selectorString, language);
    if (!selector.type) {
      return {
        match: () => -1,
        id: "$invalid"
      };
    }
    return {
      match: (type, modifiers, language2) => {
        let score = 0;
        if (selector.language !== void 0) {
          if (selector.language !== language2) {
            return -1;
          }
          score += 10;
        }
        if (selector.type !== TOKEN_TYPE_WILDCARD) {
          const hierarchy = this.getTypeHierarchy(type);
          const level = hierarchy.indexOf(selector.type);
          if (level === -1) {
            return -1;
          }
          score += 100 - level;
        }
        for (const selectorModifier of selector.modifiers) {
          if (modifiers.indexOf(selectorModifier) === -1) {
            return -1;
          }
        }
        return score + selector.modifiers.length * 100;
      },
      id: `${[selector.type, ...selector.modifiers.sort()].join(".")}${selector.language !== void 0 ? ":" + selector.language : ""}`
    };
  }
  registerTokenStyleDefault(selector, defaults) {
    this.tokenStylingDefaultRules.push({ selector, defaults });
  }
  deregisterTokenStyleDefault(selector) {
    const selectorString = selector.id;
    this.tokenStylingDefaultRules = this.tokenStylingDefaultRules.filter((r) => r.selector.id !== selectorString);
  }
  deregisterTokenType(id) {
    delete this.tokenTypeById[id];
    delete this.tokenStylingSchema.properties[id];
    this.typeHierarchy = /* @__PURE__ */ Object.create(null);
  }
  deregisterTokenModifier(id) {
    delete this.tokenModifierById[id];
    delete this.tokenStylingSchema.properties[`*.${id}`];
  }
  getTokenTypes() {
    return Object.keys(this.tokenTypeById).map((id) => this.tokenTypeById[id]);
  }
  getTokenModifiers() {
    return Object.keys(this.tokenModifierById).map((id) => this.tokenModifierById[id]);
  }
  getTokenStylingSchema() {
    return this.tokenStylingSchema;
  }
  getTokenStylingDefaultRules() {
    return this.tokenStylingDefaultRules;
  }
  getTypeHierarchy(typeId) {
    let hierarchy = this.typeHierarchy[typeId];
    if (!hierarchy) {
      this.typeHierarchy[typeId] = hierarchy = [typeId];
      let type = this.tokenTypeById[typeId];
      while (type && type.superType) {
        hierarchy.push(type.superType);
        type = this.tokenTypeById[type.superType];
      }
    }
    return hierarchy;
  }
  toString() {
    const sorter = (a, b) => {
      const cat1 = a.indexOf(".") === -1 ? 0 : 1;
      const cat2 = b.indexOf(".") === -1 ? 0 : 1;
      if (cat1 !== cat2) {
        return cat1 - cat2;
      }
      return a.localeCompare(b);
    };
    return Object.keys(this.tokenTypeById).sort(sorter).map((k) => `- \`${k}\`: ${this.tokenTypeById[k].description}`).join("\n");
  }
}
const CHAR_LANGUAGE = TOKEN_CLASSIFIER_LANGUAGE_SEPARATOR.charCodeAt(0);
const CHAR_MODIFIER = CLASSIFIER_MODIFIER_SEPARATOR.charCodeAt(0);
function parseClassifierString(s, defaultLanguage) {
  let k = s.length;
  let language = defaultLanguage;
  const modifiers = [];
  for (let i = k - 1; i >= 0; i--) {
    const ch = s.charCodeAt(i);
    if (ch === CHAR_LANGUAGE || ch === CHAR_MODIFIER) {
      const segment = s.substring(i + 1, k);
      k = i;
      if (ch === CHAR_LANGUAGE) {
        language = segment;
      } else {
        modifiers.push(segment);
      }
    }
  }
  const type = s.substring(0, k);
  return { type, modifiers, language };
}
const tokenClassificationRegistry = createDefaultTokenClassificationRegistry();
platform.Registry.add(Extensions.TokenClassificationContribution, tokenClassificationRegistry);
function createDefaultTokenClassificationRegistry() {
  const registry = new TokenClassificationRegistry();
  function registerTokenType(id, description, scopesToProbe = [], superType, deprecationMessage) {
    registry.registerTokenType(id, description, superType, deprecationMessage);
    if (scopesToProbe) {
      registerTokenStyleDefault(id, scopesToProbe);
    }
    return id;
  }
  function registerTokenStyleDefault(selectorString, scopesToProbe) {
    try {
      const selector = registry.parseTokenSelector(selectorString);
      registry.registerTokenStyleDefault(selector, { scopesToProbe });
    } catch (e) {
      console.log(e);
    }
  }
  registerTokenType("comment", nls.localize("comment", "Style for comments."), [["comment"]]);
  registerTokenType("string", nls.localize("string", "Style for strings."), [["string"]]);
  registerTokenType("keyword", nls.localize("keyword", "Style for keywords."), [["keyword.control"]]);
  registerTokenType("number", nls.localize("number", "Style for numbers."), [["constant.numeric"]]);
  registerTokenType("regexp", nls.localize("regexp", "Style for expressions."), [["constant.regexp"]]);
  registerTokenType("operator", nls.localize("operator", "Style for operators."), [["keyword.operator"]]);
  registerTokenType("namespace", nls.localize("namespace", "Style for namespaces."), [["entity.name.namespace"]]);
  registerTokenType("type", nls.localize("type", "Style for types."), [["entity.name.type"], ["support.type"]]);
  registerTokenType("struct", nls.localize("struct", "Style for structs."), [["entity.name.type.struct"]]);
  registerTokenType("class", nls.localize("class", "Style for classes."), [["entity.name.type.class"], ["support.class"]]);
  registerTokenType("interface", nls.localize("interface", "Style for interfaces."), [["entity.name.type.interface"]]);
  registerTokenType("enum", nls.localize("enum", "Style for enums."), [["entity.name.type.enum"]]);
  registerTokenType("typeParameter", nls.localize("typeParameter", "Style for type parameters."), [["entity.name.type.parameter"]]);
  registerTokenType("function", nls.localize("function", "Style for functions"), [["entity.name.function"], ["support.function"]]);
  registerTokenType("member", nls.localize("member", "Style for member functions"), [], "method", "Deprecated use `method` instead");
  registerTokenType("method", nls.localize("method", "Style for method (member functions)"), [["entity.name.function.member"], ["support.function"]]);
  registerTokenType("macro", nls.localize("macro", "Style for macros."), [["entity.name.function.preprocessor"]]);
  registerTokenType("variable", nls.localize("variable", "Style for variables."), [["variable.other.readwrite"], ["entity.name.variable"]]);
  registerTokenType("parameter", nls.localize("parameter", "Style for parameters."), [["variable.parameter"]]);
  registerTokenType("property", nls.localize("property", "Style for properties."), [["variable.other.property"]]);
  registerTokenType("enumMember", nls.localize("enumMember", "Style for enum members."), [["variable.other.enummember"]]);
  registerTokenType("event", nls.localize("event", "Style for events."), [["variable.other.event"]]);
  registerTokenType("decorator", nls.localize("decorator", "Style for decorators & annotations."), [["entity.name.decorator"], ["entity.name.function"]]);
  registerTokenType("label", nls.localize("labels", "Style for labels. "), void 0);
  registry.registerTokenModifier("declaration", nls.localize("declaration", "Style for all symbol declarations."), void 0);
  registry.registerTokenModifier("documentation", nls.localize("documentation", "Style to use for references in documentation."), void 0);
  registry.registerTokenModifier("static", nls.localize("static", "Style to use for symbols that are static."), void 0);
  registry.registerTokenModifier("abstract", nls.localize("abstract", "Style to use for symbols that are abstract."), void 0);
  registry.registerTokenModifier("deprecated", nls.localize("deprecated", "Style to use for symbols that are deprecated."), void 0);
  registry.registerTokenModifier("modification", nls.localize("modification", "Style to use for write accesses."), void 0);
  registry.registerTokenModifier("async", nls.localize("async", "Style to use for symbols that are async."), void 0);
  registry.registerTokenModifier("readonly", nls.localize("readonly", "Style to use for symbols that are read-only."), void 0);
  registerTokenStyleDefault("variable.readonly", [["variable.other.constant"]]);
  registerTokenStyleDefault("property.readonly", [["variable.other.constant.property"]]);
  registerTokenStyleDefault("type.defaultLibrary", [["support.type"]]);
  registerTokenStyleDefault("class.defaultLibrary", [["support.class"]]);
  registerTokenStyleDefault("interface.defaultLibrary", [["support.class"]]);
  registerTokenStyleDefault("variable.defaultLibrary", [["support.variable"], ["support.other.variable"]]);
  registerTokenStyleDefault("variable.defaultLibrary.readonly", [["support.constant"]]);
  registerTokenStyleDefault("property.defaultLibrary", [["support.variable.property"]]);
  registerTokenStyleDefault("property.defaultLibrary.readonly", [["support.constant.property"]]);
  registerTokenStyleDefault("function.defaultLibrary", [["support.function"]]);
  registerTokenStyleDefault("member.defaultLibrary", [["support.function"]]);
  return registry;
}
function getTokenClassificationRegistry() {
  return tokenClassificationRegistry;
}
function getStylingSchemeEntry(description, deprecationMessage) {
  return {
    description,
    deprecationMessage,
    defaultSnippets: [{ body: "${1:#ff0000}" }],
    anyOf: [
      {
        type: "string",
        format: "color-hex"
      },
      {
        $ref: "#/definitions/style"
      }
    ]
  };
}
const tokenStylingSchemaId = "vscode://schemas/token-styling";
const schemaRegistry = platform.Registry.as(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(tokenStylingSchemaId, tokenClassificationRegistry.getTokenStylingSchema());
const delayer = new RunOnceScheduler(() => schemaRegistry.notifySchemaChanged(tokenStylingSchemaId), 200);
tokenClassificationRegistry.onDidChangeSchema(() => {
  if (!delayer.isScheduled()) {
    delayer.schedule();
  }
});
export {
  SemanticTokenRule,
  TokenStyle,
  getTokenClassificationRegistry,
  parseClassifierString,
  tokenStylingSchemaId,
  typeAndModifierIdPattern
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGhlbWVcXGNvbW1vblxcdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSwgSUpTT05TY2hlbWFNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIEpTT05FeHRlbnNpb25zLCBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUgfSBmcm9tICcuL3RoZW1lU2VydmljZS5qcyc7XG5cbmNvbnN0IFRPS0VOX1RZUEVfV0lMRENBUkQgPSAnKic7XG5jb25zdCBUT0tFTl9DTEFTU0lGSUVSX0xBTkdVQUdFX1NFUEFSQVRPUiA9ICc6JztcbmNvbnN0IENMQVNTSUZJRVJfTU9ESUZJRVJfU0VQQVJBVE9SID0gJy4nO1xuXG4vLyBxdWFsaWZpZWQgc3RyaW5nIFt0eXBlfCpdKC5tb2RpZmllcikqKC9sYW5ndWFnZSkhXG50eXBlIFRva2VuQ2xhc3NpZmljYXRpb25TdHJpbmcgPSBzdHJpbmc7XG5cbmNvbnN0IGlkUGF0dGVybiA9ICdcXFxcdytbLV9cXFxcdytdKic7XG5leHBvcnQgY29uc3QgdHlwZUFuZE1vZGlmaWVySWRQYXR0ZXJuID0gYF4ke2lkUGF0dGVybn0kYDtcblxuY29uc3Qgc2VsZWN0b3JQYXR0ZXJuID0gYF4oJHtpZFBhdHRlcm59fFxcXFwqKShcXFxcJHtDTEFTU0lGSUVSX01PRElGSUVSX1NFUEFSQVRPUn0ke2lkUGF0dGVybn0pKigke1RPS0VOX0NMQVNTSUZJRVJfTEFOR1VBR0VfU0VQQVJBVE9SfSR7aWRQYXR0ZXJufSk/JGA7XG5cbmNvbnN0IGZvbnRTdHlsZVBhdHRlcm4gPSAnXihcXFxccyooaXRhbGljfGJvbGR8dW5kZXJsaW5lfHN0cmlrZXRocm91Z2gpKSpcXFxccyokJztcblxuZXhwb3J0IGludGVyZmFjZSBUb2tlblNlbGVjdG9yIHtcblx0bWF0Y2godHlwZTogc3RyaW5nLCBtb2RpZmllcnM6IHN0cmluZ1tdLCBsYW5ndWFnZTogc3RyaW5nKTogbnVtYmVyO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRva2VuVHlwZU9yTW9kaWZpZXJDb250cmlidXRpb24ge1xuXHRyZWFkb25seSBudW06IG51bWJlcjtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc3VwZXJUeXBlPzogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRyZWFkb25seSBkZXByZWNhdGlvbk1lc3NhZ2U/OiBzdHJpbmc7XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBUb2tlblN0eWxlRGF0YSB7XG5cdGZvcmVncm91bmQ6IENvbG9yIHwgdW5kZWZpbmVkO1xuXHRib2xkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHR1bmRlcmxpbmU6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHN0cmlrZXRocm91Z2g6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdGl0YWxpYzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFRva2VuU3R5bGUgaW1wbGVtZW50cyBSZWFkb25seTxUb2tlblN0eWxlRGF0YT4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZm9yZWdyb3VuZDogQ29sb3IgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGJvbGQ6IGJvb2xlYW4gfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHVuZGVybGluZTogYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RyaWtldGhyb3VnaDogYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaXRhbGljOiBib29sZWFuIHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRva2VuU3R5bGUge1xuXHRleHBvcnQgZnVuY3Rpb24gdG9KU09OT2JqZWN0KHN0eWxlOiBUb2tlblN0eWxlKTogYW55IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X2ZvcmVncm91bmQ6IHN0eWxlLmZvcmVncm91bmQgPT09IHVuZGVmaW5lZCA/IG51bGwgOiBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEoc3R5bGUuZm9yZWdyb3VuZCwgdHJ1ZSksXG5cdFx0XHRfYm9sZDogc3R5bGUuYm9sZCA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IHN0eWxlLmJvbGQsXG5cdFx0XHRfdW5kZXJsaW5lOiBzdHlsZS51bmRlcmxpbmUgPT09IHVuZGVmaW5lZCA/IG51bGwgOiBzdHlsZS51bmRlcmxpbmUsXG5cdFx0XHRfaXRhbGljOiBzdHlsZS5pdGFsaWMgPT09IHVuZGVmaW5lZCA/IG51bGwgOiBzdHlsZS5pdGFsaWMsXG5cdFx0XHRfc3RyaWtldGhyb3VnaDogc3R5bGUuc3RyaWtldGhyb3VnaCA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IHN0eWxlLnN0cmlrZXRocm91Z2gsXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbUpTT05PYmplY3Qob2JqOiBhbnkpOiBUb2tlblN0eWxlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAob2JqKSB7XG5cdFx0XHRjb25zdCBib29sT3JVbmRlZiA9IChiOiBhbnkpID0+ICh0eXBlb2YgYiA9PT0gJ2Jvb2xlYW4nKSA/IGIgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBjb2xvck9yVW5kZWYgPSAoczogYW55KSA9PiAodHlwZW9mIHMgPT09ICdzdHJpbmcnKSA/IENvbG9yLmZyb21IZXgocykgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gbmV3IFRva2VuU3R5bGUoXG5cdFx0XHRcdGNvbG9yT3JVbmRlZihvYmouX2ZvcmVncm91bmQpLFxuXHRcdFx0XHRib29sT3JVbmRlZihvYmouX2JvbGQpLFxuXHRcdFx0XHRib29sT3JVbmRlZihvYmouX3VuZGVybGluZSksXG5cdFx0XHRcdGJvb2xPclVuZGVmKG9iai5fc3RyaWtldGhyb3VnaCksXG5cdFx0XHRcdGJvb2xPclVuZGVmKG9iai5faXRhbGljKVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gZXF1YWxzKHMxOiBhbnksIHMyOiBhbnkpOiBib29sZWFuIHtcblx0XHRpZiAoczEgPT09IHMyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHMxICE9PSB1bmRlZmluZWQgJiYgczIgIT09IHVuZGVmaW5lZFxuXHRcdFx0JiYgKHMxLmZvcmVncm91bmQgaW5zdGFuY2VvZiBDb2xvciA/IHMxLmZvcmVncm91bmQuZXF1YWxzKHMyLmZvcmVncm91bmQpIDogczIuZm9yZWdyb3VuZCA9PT0gdW5kZWZpbmVkKVxuXHRcdFx0JiYgczEuYm9sZCA9PT0gczIuYm9sZFxuXHRcdFx0JiYgczEudW5kZXJsaW5lID09PSBzMi51bmRlcmxpbmVcblx0XHRcdCYmIHMxLnN0cmlrZXRocm91Z2ggPT09IHMyLnN0cmlrZXRocm91Z2hcblx0XHRcdCYmIHMxLml0YWxpYyA9PT0gczIuaXRhbGljO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBpcyhzOiBhbnkpOiBzIGlzIFRva2VuU3R5bGUge1xuXHRcdHJldHVybiBzIGluc3RhbmNlb2YgVG9rZW5TdHlsZTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbURhdGEoZGF0YTogeyBmb3JlZ3JvdW5kOiBDb2xvciB8IHVuZGVmaW5lZDsgYm9sZDogYm9vbGVhbiB8IHVuZGVmaW5lZDsgdW5kZXJsaW5lOiBib29sZWFuIHwgdW5kZWZpbmVkOyBzdHJpa2V0aHJvdWdoOiBib29sZWFuIHwgdW5kZWZpbmVkOyBpdGFsaWM6IGJvb2xlYW4gfCB1bmRlZmluZWQgfSk6IFRva2VuU3R5bGUge1xuXHRcdHJldHVybiBuZXcgVG9rZW5TdHlsZShkYXRhLmZvcmVncm91bmQsIGRhdGEuYm9sZCwgZGF0YS51bmRlcmxpbmUsIGRhdGEuc3RyaWtldGhyb3VnaCwgZGF0YS5pdGFsaWMpO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU2V0dGluZ3MoZm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBmb250U3R5bGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFRva2VuU3R5bGU7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU2V0dGluZ3MoZm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBmb250U3R5bGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgYm9sZDogYm9vbGVhbiB8IHVuZGVmaW5lZCwgdW5kZXJsaW5lOiBib29sZWFuIHwgdW5kZWZpbmVkLCBzdHJpa2V0aHJvdWdoOiBib29sZWFuIHwgdW5kZWZpbmVkLCBpdGFsaWM6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBUb2tlblN0eWxlO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVNldHRpbmdzKGZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgZm9udFN0eWxlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGJvbGQ/OiBib29sZWFuLCB1bmRlcmxpbmU/OiBib29sZWFuLCBzdHJpa2V0aHJvdWdoPzogYm9vbGVhbiwgaXRhbGljPzogYm9vbGVhbik6IFRva2VuU3R5bGUge1xuXHRcdGxldCBmb3JlZ3JvdW5kQ29sb3IgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGZvcmVncm91bmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Zm9yZWdyb3VuZENvbG9yID0gQ29sb3IuZnJvbUhleChmb3JlZ3JvdW5kKTtcblx0XHR9XG5cdFx0aWYgKGZvbnRTdHlsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRib2xkID0gaXRhbGljID0gdW5kZXJsaW5lID0gc3RyaWtldGhyb3VnaCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgZXhwcmVzc2lvbiA9IC9pdGFsaWN8Ym9sZHx1bmRlcmxpbmV8c3RyaWtldGhyb3VnaC9nO1xuXHRcdFx0bGV0IG1hdGNoO1xuXHRcdFx0d2hpbGUgKChtYXRjaCA9IGV4cHJlc3Npb24uZXhlYyhmb250U3R5bGUpKSkge1xuXHRcdFx0XHRzd2l0Y2ggKG1hdGNoWzBdKSB7XG5cdFx0XHRcdFx0Y2FzZSAnYm9sZCc6IGJvbGQgPSB0cnVlOyBicmVhaztcblx0XHRcdFx0XHRjYXNlICdpdGFsaWMnOiBpdGFsaWMgPSB0cnVlOyBicmVhaztcblx0XHRcdFx0XHRjYXNlICd1bmRlcmxpbmUnOiB1bmRlcmxpbmUgPSB0cnVlOyBicmVhaztcblx0XHRcdFx0XHRjYXNlICdzdHJpa2V0aHJvdWdoJzogc3RyaWtldGhyb3VnaCA9IHRydWU7IGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgVG9rZW5TdHlsZShmb3JlZ3JvdW5kQ29sb3IsIGJvbGQsIHVuZGVybGluZSwgc3RyaWtldGhyb3VnaCwgaXRhbGljKTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBQcm9iZVNjb3BlID0gc3RyaW5nW107XG5cbmV4cG9ydCBpbnRlcmZhY2UgVG9rZW5TdHlsZUZ1bmN0aW9uIHtcblx0KHRoZW1lOiBJQ29sb3JUaGVtZSk6IFRva2VuU3R5bGUgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVG9rZW5TdHlsZURlZmF1bHRzIHtcblx0c2NvcGVzVG9Qcm9iZT86IFByb2JlU2NvcGVbXTtcblx0bGlnaHQ/OiBUb2tlblN0eWxlVmFsdWU7XG5cdGRhcms/OiBUb2tlblN0eWxlVmFsdWU7XG5cdGhjRGFyaz86IFRva2VuU3R5bGVWYWx1ZTtcblx0aGNMaWdodD86IFRva2VuU3R5bGVWYWx1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZW1hbnRpY1Rva2VuRGVmYXVsdFJ1bGUge1xuXHRzZWxlY3RvcjogVG9rZW5TZWxlY3Rvcjtcblx0ZGVmYXVsdHM6IFRva2VuU3R5bGVEZWZhdWx0cztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZW1hbnRpY1Rva2VuUnVsZSB7XG5cdHN0eWxlOiBUb2tlblN0eWxlO1xuXHRzZWxlY3RvcjogVG9rZW5TZWxlY3Rvcjtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBTZW1hbnRpY1Rva2VuUnVsZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tSlNPTk9iamVjdChyZWdpc3RyeTogSVRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSwgbzogYW55KTogU2VtYW50aWNUb2tlblJ1bGUgfCB1bmRlZmluZWQge1xuXHRcdGlmIChvICYmIHR5cGVvZiBvLl9zZWxlY3RvciA9PT0gJ3N0cmluZycgJiYgby5fc3R5bGUpIHtcblx0XHRcdGNvbnN0IHN0eWxlID0gVG9rZW5TdHlsZS5mcm9tSlNPTk9iamVjdChvLl9zdHlsZSk7XG5cdFx0XHRpZiAoc3R5bGUpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXR1cm4geyBzZWxlY3RvcjogcmVnaXN0cnkucGFyc2VUb2tlblNlbGVjdG9yKG8uX3NlbGVjdG9yKSwgc3R5bGUgfTtcblx0XHRcdFx0fSBjYXRjaCAoX2lnbm9yZSkge1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvSlNPTk9iamVjdChydWxlOiBTZW1hbnRpY1Rva2VuUnVsZSk6IGFueSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZWxlY3RvcjogcnVsZS5zZWxlY3Rvci5pZCxcblx0XHRcdF9zdHlsZTogVG9rZW5TdHlsZS50b0pTT05PYmplY3QocnVsZS5zdHlsZSlcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBlcXVhbHMocjE6IFNlbWFudGljVG9rZW5SdWxlIHwgdW5kZWZpbmVkLCByMjogU2VtYW50aWNUb2tlblJ1bGUgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAocjEgPT09IHIyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHIxICE9PSB1bmRlZmluZWQgJiYgcjIgIT09IHVuZGVmaW5lZFxuXHRcdFx0JiYgcjEuc2VsZWN0b3IgJiYgcjIuc2VsZWN0b3IgJiYgcjEuc2VsZWN0b3IuaWQgPT09IHIyLnNlbGVjdG9yLmlkXG5cdFx0XHQmJiBUb2tlblN0eWxlLmVxdWFscyhyMS5zdHlsZSwgcjIuc3R5bGUpO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBpcyhyOiBhbnkpOiByIGlzIFNlbWFudGljVG9rZW5SdWxlIHtcblx0XHRyZXR1cm4gciAmJiByLnNlbGVjdG9yICYmIHR5cGVvZiByLnNlbGVjdG9yLmlkID09PSAnc3RyaW5nJyAmJiBUb2tlblN0eWxlLmlzKHIuc3R5bGUpO1xuXHR9XG59XG5cbi8qKlxuICogQSBUb2tlblN0eWxlIFZhbHVlIGlzIGVpdGhlciBhIHRva2VuIHN0eWxlIGxpdGVyYWwsIG9yIGEgVG9rZW5DbGFzc2lmaWNhdGlvblN0cmluZ1xuICovXG5leHBvcnQgdHlwZSBUb2tlblN0eWxlVmFsdWUgPSBUb2tlblN0eWxlIHwgVG9rZW5DbGFzc2lmaWNhdGlvblN0cmluZztcblxuLy8gVG9rZW5TdHlsZSByZWdpc3RyeVxuY29uc3QgRXh0ZW5zaW9ucyA9IHtcblx0VG9rZW5DbGFzc2lmaWNhdGlvbkNvbnRyaWJ1dGlvbjogJ2Jhc2UuY29udHJpYnV0aW9ucy50b2tlbkNsYXNzaWZpY2F0aW9uJ1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJVG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5IHtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVNjaGVtYTogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIGEgdG9rZW4gdHlwZSB0byB0aGUgcmVnaXN0cnkuXG5cdCAqIEBwYXJhbSBpZCBUaGUgVG9rZW5UeXBlIGlkIGFzIHVzZWQgaW4gdGhlbWUgZGVzY3JpcHRpb24gZmlsZXNcblx0ICogQHBhcmFtIGRlc2NyaXB0aW9uIHRoZSBkZXNjcmlwdGlvblxuXHQgKi9cblx0cmVnaXN0ZXJUb2tlblR5cGUoaWQ6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc3VwZXJUeXBlPzogc3RyaW5nLCBkZXByZWNhdGlvbk1lc3NhZ2U/OiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBhIHRva2VuIG1vZGlmaWVyIHRvIHRoZSByZWdpc3RyeS5cblx0ICogQHBhcmFtIGlkIFRoZSBUb2tlbk1vZGlmaWVyIGlkIGFzIHVzZWQgaW4gdGhlbWUgZGVzY3JpcHRpb24gZmlsZXNcblx0ICogQHBhcmFtIGRlc2NyaXB0aW9uIHRoZSBkZXNjcmlwdGlvblxuXHQgKi9cblx0cmVnaXN0ZXJUb2tlbk1vZGlmaWVyKGlkOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSB0b2tlbiBzZWxlY3RvciBmcm9tIGEgc2VsZWN0b3Igc3RyaW5nLlxuXHQgKiBAcGFyYW0gc2VsZWN0b3JTdHJpbmcgc2VsZWN0b3Igc3RyaW5nIGluIHRoZSBmb3JtICgqfHR5cGUpKC5tb2RpZmllcikqXG5cdCAqIEBwYXJhbSBsYW5ndWFnZSBsYW5ndWFnZSB0byB3aGljaCB0aGUgc2VsZWN0b3IgYXBwbGllcyBvciB1bmRlZmluZWQgaWYgdGhlIHNlbGVjdG9yIGlzIGZvciBhbGwgbGFuZ3VhZmVcblx0ICogQHJldHVybnMgdGhlIHBhcnNlc2Qgc2VsZWN0b3Jcblx0ICogQHRocm93cyBhbiBlcnJvciBpZiB0aGUgc3RyaW5nIGlzIG5vdCBhIHZhbGlkIHNlbGVjdG9yXG5cdCAqL1xuXHRwYXJzZVRva2VuU2VsZWN0b3Ioc2VsZWN0b3JTdHJpbmc6IHN0cmluZywgbGFuZ3VhZ2U/OiBzdHJpbmcpOiBUb2tlblNlbGVjdG9yO1xuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBhIFRva2VuU3R5bGUgZGVmYXVsdCB0byB0aGUgcmVnaXN0cnkuXG5cdCAqIEBwYXJhbSBzZWxlY3RvciBUaGUgcnVsZSBzZWxlY3RvclxuXHQgKiBAcGFyYW0gZGVmYXVsdHMgVGhlIGRlZmF1bHQgdmFsdWVzXG5cdCAqL1xuXHRyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KHNlbGVjdG9yOiBUb2tlblNlbGVjdG9yLCBkZWZhdWx0czogVG9rZW5TdHlsZURlZmF1bHRzKTogdm9pZDtcblxuXHQvKipcblx0ICogRGVyZWdpc3RlciBhIFRva2VuU3R5bGUgZGVmYXVsdCB0byB0aGUgcmVnaXN0cnkuXG5cdCAqIEBwYXJhbSBzZWxlY3RvciBUaGUgcnVsZSBzZWxlY3RvclxuXHQgKi9cblx0ZGVyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KHNlbGVjdG9yOiBUb2tlblNlbGVjdG9yKTogdm9pZDtcblxuXHQvKipcblx0ICogRGVyZWdpc3RlciBhIFRva2VuVHlwZSBmcm9tIHRoZSByZWdpc3RyeS5cblx0ICovXG5cdGRlcmVnaXN0ZXJUb2tlblR5cGUoaWQ6IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIERlcmVnaXN0ZXIgYSBUb2tlbk1vZGlmaWVyIGZyb20gdGhlIHJlZ2lzdHJ5LlxuXHQgKi9cblx0ZGVyZWdpc3RlclRva2VuTW9kaWZpZXIoaWQ6IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEdldCBhbGwgVG9rZW5UeXBlIGNvbnRyaWJ1dGlvbnNcblx0ICovXG5cdGdldFRva2VuVHlwZXMoKTogVG9rZW5UeXBlT3JNb2RpZmllckNvbnRyaWJ1dGlvbltdO1xuXG5cdC8qKlxuXHQgKiBHZXQgYWxsIFRva2VuTW9kaWZpZXIgY29udHJpYnV0aW9uc1xuXHQgKi9cblx0Z2V0VG9rZW5Nb2RpZmllcnMoKTogVG9rZW5UeXBlT3JNb2RpZmllckNvbnRyaWJ1dGlvbltdO1xuXG5cdC8qKlxuXHQgKiBUaGUgc3R5bGluZyBydWxlcyB0byB1c2VkIHdoZW4gYSBzY2hlbWEgZG9lcyBub3QgZGVmaW5lIGFueSBzdHlsaW5nIHJ1bGVzLlxuXHQgKi9cblx0Z2V0VG9rZW5TdHlsaW5nRGVmYXVsdFJ1bGVzKCk6IFNlbWFudGljVG9rZW5EZWZhdWx0UnVsZVtdO1xuXG5cdC8qKlxuXHQgKiBKU09OIHNjaGVtYSBmb3IgYW4gb2JqZWN0IHRvIGFzc2lnbiBzdHlsaW5nIHRvIHRva2VuIGNsYXNzaWZpY2F0aW9uc1xuXHQgKi9cblx0Z2V0VG9rZW5TdHlsaW5nU2NoZW1hKCk6IElKU09OU2NoZW1hO1xufVxuXG5jbGFzcyBUb2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTY2hlbWEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTY2hlbWE6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VTY2hlbWEuZXZlbnQ7XG5cblx0cHJpdmF0ZSBjdXJyZW50VHlwZU51bWJlciA9IDA7XG5cdHByaXZhdGUgY3VycmVudE1vZGlmaWVyQml0ID0gMTtcblxuXHRwcml2YXRlIHRva2VuVHlwZUJ5SWQ6IHsgW2tleTogc3RyaW5nXTogVG9rZW5UeXBlT3JNb2RpZmllckNvbnRyaWJ1dGlvbiB9O1xuXHRwcml2YXRlIHRva2VuTW9kaWZpZXJCeUlkOiB7IFtrZXk6IHN0cmluZ106IFRva2VuVHlwZU9yTW9kaWZpZXJDb250cmlidXRpb24gfTtcblxuXHRwcml2YXRlIHRva2VuU3R5bGluZ0RlZmF1bHRSdWxlczogU2VtYW50aWNUb2tlbkRlZmF1bHRSdWxlW10gPSBbXTtcblxuXHRwcml2YXRlIHR5cGVIaWVyYXJjaHk6IHsgW2lkOiBzdHJpbmddOiBzdHJpbmdbXSB9O1xuXG5cdHByaXZhdGUgdG9rZW5TdHlsaW5nU2NoZW1hOiBJSlNPTlNjaGVtYSAmIHsgcHJvcGVydGllczogSUpTT05TY2hlbWFNYXA7IHBhdHRlcm5Qcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCB9ID0ge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHt9LFxuXHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiB7XG5cdFx0XHRbc2VsZWN0b3JQYXR0ZXJuXTogZ2V0U3R5bGluZ1NjaGVtZUVudHJ5KClcblx0XHR9LFxuXHRcdC8vZXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5lcnJvcnMnLCAnVmFsaWQgdG9rZW4gc2VsZWN0b3JzIGhhdmUgdGhlIGZvcm0gKCp8dG9rZW5UeXBlKSgudG9rZW5Nb2RpZmllcikqKDp0b2tlbkxhbmd1YWdlKT8uJyksXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdGRlZmluaXRpb25zOiB7XG5cdFx0XHRzdHlsZToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLnNldHRpbmdzJywgJ0NvbG9ycyBhbmQgc3R5bGVzIGZvciB0aGUgdG9rZW4uJyksXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRmb3JlZ3JvdW5kOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5mb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3IgZm9yIHRoZSB0b2tlbi4nKSxcblx0XHRcdFx0XHRcdGZvcm1hdDogJ2NvbG9yLWhleCcsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnI2ZmMDAwMCdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJhY2tncm91bmQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5iYWNrZ3JvdW5kLndhcm5pbmcnLCAnVG9rZW4gYmFja2dyb3VuZCBjb2xvcnMgYXJlIGN1cnJlbnRseSBub3Qgc3VwcG9ydGVkLicpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRmb250U3R5bGU6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmZvbnRTdHlsZScsICdTZXRzIHRoZSBhbGwgZm9udCBzdHlsZXMgb2YgdGhlIHJ1bGU6IFxcJ2l0YWxpY1xcJywgXFwnYm9sZFxcJywgXFwndW5kZXJsaW5lXFwnIG9yIFxcJ3N0cmlrZXRocm91Z2hcXCcgb3IgYSBjb21iaW5hdGlvbi4gQWxsIHN0eWxlcyB0aGF0IGFyZSBub3QgbGlzdGVkIGFyZSB1bnNldC4gVGhlIGVtcHR5IHN0cmluZyB1bnNldHMgYWxsIHN0eWxlcy4nKSxcblx0XHRcdFx0XHRcdHBhdHRlcm46IGZvbnRTdHlsZVBhdHRlcm4sXG5cdFx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb250U3R5bGUuZXJyb3InLCAnRm9udCBzdHlsZSBtdXN0IGJlIFxcJ2l0YWxpY1xcJywgXFwnYm9sZFxcJywgXFwndW5kZXJsaW5lXFwnIG9yIFxcJ3N0cmlrZXRocm91Z2hcXCcgb3IgYSBjb21iaW5hdGlvbi4gVGhlIGVtcHR5IHN0cmluZyB1bnNldHMgYWxsIHN0eWxlcy4nKSxcblx0XHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW1xuXHRcdFx0XHRcdFx0XHR7IGxhYmVsOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5mb250U3R5bGUubm9uZScsICdOb25lIChjbGVhciBpbmhlcml0ZWQgc3R5bGUpJyksIGJvZHlUZXh0OiAnXCJcIicgfSxcblx0XHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICdib2xkJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICd1bmRlcmxpbmUnIH0sXG5cdFx0XHRcdFx0XHRcdHsgYm9keTogJ3N0cmlrZXRocm91Z2gnIH0sXG5cdFx0XHRcdFx0XHRcdHsgYm9keTogJ2l0YWxpYyBib2xkJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgdW5kZXJsaW5lJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdFx0XHRcdFx0eyBib2R5OiAnYm9sZCB1bmRlcmxpbmUnIH0sXG5cdFx0XHRcdFx0XHRcdHsgYm9keTogJ2JvbGQgc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdFx0XHRcdFx0eyBib2R5OiAndW5kZXJsaW5lIHN0cmlrZXRocm91Z2gnIH0sXG5cdFx0XHRcdFx0XHRcdHsgYm9keTogJ2l0YWxpYyBib2xkIHVuZGVybGluZScgfSxcblx0XHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljIGJvbGQgc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljIHVuZGVybGluZSBzdHJpa2V0aHJvdWdoJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICdib2xkIHVuZGVybGluZSBzdHJpa2V0aHJvdWdoJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgYm9sZCB1bmRlcmxpbmUgc3RyaWtldGhyb3VnaCcgfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9sZDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmJvbGQnLCAnU2V0cyBvciB1bnNldHMgdGhlIGZvbnQgc3R5bGUgdG8gYm9sZC4gTm90ZSwgdGhlIHByZXNlbmNlIG9mIFxcJ2ZvbnRTdHlsZVxcJyBvdmVycmlkZXMgdGhpcyBzZXR0aW5nLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aXRhbGljOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEudG9rZW4uaXRhbGljJywgJ1NldHMgb3IgdW5zZXRzIHRoZSBmb250IHN0eWxlIHRvIGl0YWxpYy4gTm90ZSwgdGhlIHByZXNlbmNlIG9mIFxcJ2ZvbnRTdHlsZVxcJyBvdmVycmlkZXMgdGhpcyBzZXR0aW5nLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dW5kZXJsaW5lOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEudG9rZW4udW5kZXJsaW5lJywgJ1NldHMgb3IgdW5zZXRzIHRoZSBmb250IHN0eWxlIHRvIHVuZGVybGluZS4gTm90ZSwgdGhlIHByZXNlbmNlIG9mIFxcJ2ZvbnRTdHlsZVxcJyBvdmVycmlkZXMgdGhpcyBzZXR0aW5nLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0c3RyaWtldGhyb3VnaDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLnN0cmlrZXRocm91Z2gnLCAnU2V0cyBvciB1bnNldHMgdGhlIGZvbnQgc3R5bGUgdG8gc3RyaWtldGhyb3VnaC4gTm90ZSwgdGhlIHByZXNlbmNlIG9mIFxcJ2ZvbnRTdHlsZVxcJyBvdmVycmlkZXMgdGhpcyBzZXR0aW5nLicpLFxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgZm9yZWdyb3VuZDogJyR7MTojRkYwMDAwfScsIGZvbnRTdHlsZTogJyR7Mjpib2xkfScgfSB9XVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMudG9rZW5UeXBlQnlJZCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy50b2tlbk1vZGlmaWVyQnlJZCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy50eXBlSGllcmFyY2h5ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlclRva2VuVHlwZShpZDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzdXBlclR5cGU/OiBzdHJpbmcsIGRlcHJlY2F0aW9uTWVzc2FnZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghaWQubWF0Y2godHlwZUFuZE1vZGlmaWVySWRQYXR0ZXJuKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRva2VuIHR5cGUgaWQuJyk7XG5cdFx0fVxuXHRcdGlmIChzdXBlclR5cGUgJiYgIXN1cGVyVHlwZS5tYXRjaCh0eXBlQW5kTW9kaWZpZXJJZFBhdHRlcm4pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG9rZW4gc3VwZXIgdHlwZSBpZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBudW0gPSB0aGlzLmN1cnJlbnRUeXBlTnVtYmVyKys7XG5cdFx0Y29uc3QgdG9rZW5TdHlsZUNvbnRyaWJ1dGlvbjogVG9rZW5UeXBlT3JNb2RpZmllckNvbnRyaWJ1dGlvbiA9IHsgbnVtLCBpZCwgc3VwZXJUeXBlLCBkZXNjcmlwdGlvbiwgZGVwcmVjYXRpb25NZXNzYWdlIH07XG5cdFx0dGhpcy50b2tlblR5cGVCeUlkW2lkXSA9IHRva2VuU3R5bGVDb250cmlidXRpb247XG5cblx0XHRjb25zdCBzdHlsaW5nU2NoZW1lRW50cnkgPSBnZXRTdHlsaW5nU2NoZW1lRW50cnkoZGVzY3JpcHRpb24sIGRlcHJlY2F0aW9uTWVzc2FnZSk7XG5cdFx0dGhpcy50b2tlblN0eWxpbmdTY2hlbWEucHJvcGVydGllc1tpZF0gPSBzdHlsaW5nU2NoZW1lRW50cnk7XG5cdFx0dGhpcy50eXBlSGllcmFyY2h5ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlclRva2VuTW9kaWZpZXIoaWQ6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgZGVwcmVjYXRpb25NZXNzYWdlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCFpZC5tYXRjaCh0eXBlQW5kTW9kaWZpZXJJZFBhdHRlcm4pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG9rZW4gbW9kaWZpZXIgaWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbnVtID0gdGhpcy5jdXJyZW50TW9kaWZpZXJCaXQ7XG5cdFx0dGhpcy5jdXJyZW50TW9kaWZpZXJCaXQgPSB0aGlzLmN1cnJlbnRNb2RpZmllckJpdCAqIDI7XG5cdFx0Y29uc3QgdG9rZW5TdHlsZUNvbnRyaWJ1dGlvbjogVG9rZW5UeXBlT3JNb2RpZmllckNvbnRyaWJ1dGlvbiA9IHsgbnVtLCBpZCwgZGVzY3JpcHRpb24sIGRlcHJlY2F0aW9uTWVzc2FnZSB9O1xuXHRcdHRoaXMudG9rZW5Nb2RpZmllckJ5SWRbaWRdID0gdG9rZW5TdHlsZUNvbnRyaWJ1dGlvbjtcblxuXHRcdHRoaXMudG9rZW5TdHlsaW5nU2NoZW1hLnByb3BlcnRpZXNbYCouJHtpZH1gXSA9IGdldFN0eWxpbmdTY2hlbWVFbnRyeShkZXNjcmlwdGlvbiwgZGVwcmVjYXRpb25NZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyBwYXJzZVRva2VuU2VsZWN0b3Ioc2VsZWN0b3JTdHJpbmc6IHN0cmluZywgbGFuZ3VhZ2U/OiBzdHJpbmcpOiBUb2tlblNlbGVjdG9yIHtcblx0XHRjb25zdCBzZWxlY3RvciA9IHBhcnNlQ2xhc3NpZmllclN0cmluZyhzZWxlY3RvclN0cmluZywgbGFuZ3VhZ2UpO1xuXG5cdFx0aWYgKCFzZWxlY3Rvci50eXBlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtYXRjaDogKCkgPT4gLTEsXG5cdFx0XHRcdGlkOiAnJGludmFsaWQnXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRtYXRjaDogKHR5cGU6IHN0cmluZywgbW9kaWZpZXJzOiBzdHJpbmdbXSwgbGFuZ3VhZ2U6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRsZXQgc2NvcmUgPSAwO1xuXHRcdFx0XHRpZiAoc2VsZWN0b3IubGFuZ3VhZ2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rvci5sYW5ndWFnZSAhPT0gbGFuZ3VhZ2UpIHtcblx0XHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2NvcmUgKz0gMTA7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlbGVjdG9yLnR5cGUgIT09IFRPS0VOX1RZUEVfV0lMRENBUkQpIHtcblx0XHRcdFx0XHRjb25zdCBoaWVyYXJjaHkgPSB0aGlzLmdldFR5cGVIaWVyYXJjaHkodHlwZSk7XG5cdFx0XHRcdFx0Y29uc3QgbGV2ZWwgPSBoaWVyYXJjaHkuaW5kZXhPZihzZWxlY3Rvci50eXBlKTtcblx0XHRcdFx0XHRpZiAobGV2ZWwgPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNjb3JlICs9ICgxMDAgLSBsZXZlbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gYWxsIHNlbGVjdG9yIG1vZGlmaWVycyBtdXN0IGJlIHByZXNlbnRcblx0XHRcdFx0Zm9yIChjb25zdCBzZWxlY3Rvck1vZGlmaWVyIG9mIHNlbGVjdG9yLm1vZGlmaWVycykge1xuXHRcdFx0XHRcdGlmIChtb2RpZmllcnMuaW5kZXhPZihzZWxlY3Rvck1vZGlmaWVyKSA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHNjb3JlICsgc2VsZWN0b3IubW9kaWZpZXJzLmxlbmd0aCAqIDEwMDtcblx0XHRcdH0sXG5cdFx0XHRpZDogYCR7W3NlbGVjdG9yLnR5cGUsIC4uLnNlbGVjdG9yLm1vZGlmaWVycy5zb3J0KCldLmpvaW4oJy4nKX0ke3NlbGVjdG9yLmxhbmd1YWdlICE9PSB1bmRlZmluZWQgPyAnOicgKyBzZWxlY3Rvci5sYW5ndWFnZSA6ICcnfWBcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoc2VsZWN0b3I6IFRva2VuU2VsZWN0b3IsIGRlZmF1bHRzOiBUb2tlblN0eWxlRGVmYXVsdHMpOiB2b2lkIHtcblx0XHR0aGlzLnRva2VuU3R5bGluZ0RlZmF1bHRSdWxlcy5wdXNoKHsgc2VsZWN0b3IsIGRlZmF1bHRzIH0pO1xuXHR9XG5cblx0cHVibGljIGRlcmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdChzZWxlY3RvcjogVG9rZW5TZWxlY3Rvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdG9yU3RyaW5nID0gc2VsZWN0b3IuaWQ7XG5cdFx0dGhpcy50b2tlblN0eWxpbmdEZWZhdWx0UnVsZXMgPSB0aGlzLnRva2VuU3R5bGluZ0RlZmF1bHRSdWxlcy5maWx0ZXIociA9PiByLnNlbGVjdG9yLmlkICE9PSBzZWxlY3RvclN0cmluZyk7XG5cdH1cblxuXHRwdWJsaWMgZGVyZWdpc3RlclRva2VuVHlwZShpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0ZGVsZXRlIHRoaXMudG9rZW5UeXBlQnlJZFtpZF07XG5cdFx0ZGVsZXRlIHRoaXMudG9rZW5TdHlsaW5nU2NoZW1hLnByb3BlcnRpZXNbaWRdO1xuXHRcdHRoaXMudHlwZUhpZXJhcmNoeSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgZGVyZWdpc3RlclRva2VuTW9kaWZpZXIoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGRlbGV0ZSB0aGlzLnRva2VuTW9kaWZpZXJCeUlkW2lkXTtcblx0XHRkZWxldGUgdGhpcy50b2tlblN0eWxpbmdTY2hlbWEucHJvcGVydGllc1tgKi4ke2lkfWBdO1xuXHR9XG5cblx0cHVibGljIGdldFRva2VuVHlwZXMoKTogVG9rZW5UeXBlT3JNb2RpZmllckNvbnRyaWJ1dGlvbltdIHtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpcy50b2tlblR5cGVCeUlkKS5tYXAoaWQgPT4gdGhpcy50b2tlblR5cGVCeUlkW2lkXSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VG9rZW5Nb2RpZmllcnMoKTogVG9rZW5UeXBlT3JNb2RpZmllckNvbnRyaWJ1dGlvbltdIHtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpcy50b2tlbk1vZGlmaWVyQnlJZCkubWFwKGlkID0+IHRoaXMudG9rZW5Nb2RpZmllckJ5SWRbaWRdKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlblN0eWxpbmdTY2hlbWEoKTogSUpTT05TY2hlbWEge1xuXHRcdHJldHVybiB0aGlzLnRva2VuU3R5bGluZ1NjaGVtYTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlblN0eWxpbmdEZWZhdWx0UnVsZXMoKTogU2VtYW50aWNUb2tlbkRlZmF1bHRSdWxlW10ge1xuXHRcdHJldHVybiB0aGlzLnRva2VuU3R5bGluZ0RlZmF1bHRSdWxlcztcblx0fVxuXG5cdHByaXZhdGUgZ2V0VHlwZUhpZXJhcmNoeSh0eXBlSWQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRsZXQgaGllcmFyY2h5ID0gdGhpcy50eXBlSGllcmFyY2h5W3R5cGVJZF07XG5cdFx0aWYgKCFoaWVyYXJjaHkpIHtcblx0XHRcdHRoaXMudHlwZUhpZXJhcmNoeVt0eXBlSWRdID0gaGllcmFyY2h5ID0gW3R5cGVJZF07XG5cdFx0XHRsZXQgdHlwZSA9IHRoaXMudG9rZW5UeXBlQnlJZFt0eXBlSWRdO1xuXHRcdFx0d2hpbGUgKHR5cGUgJiYgdHlwZS5zdXBlclR5cGUpIHtcblx0XHRcdFx0aGllcmFyY2h5LnB1c2godHlwZS5zdXBlclR5cGUpO1xuXHRcdFx0XHR0eXBlID0gdGhpcy50b2tlblR5cGVCeUlkW3R5cGUuc3VwZXJUeXBlXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGhpZXJhcmNoeTtcblx0fVxuXG5cblx0cHVibGljIG92ZXJyaWRlIHRvU3RyaW5nKCkge1xuXHRcdGNvbnN0IHNvcnRlciA9IChhOiBzdHJpbmcsIGI6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgY2F0MSA9IGEuaW5kZXhPZignLicpID09PSAtMSA/IDAgOiAxO1xuXHRcdFx0Y29uc3QgY2F0MiA9IGIuaW5kZXhPZignLicpID09PSAtMSA/IDAgOiAxO1xuXHRcdFx0aWYgKGNhdDEgIT09IGNhdDIpIHtcblx0XHRcdFx0cmV0dXJuIGNhdDEgLSBjYXQyO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGEubG9jYWxlQ29tcGFyZShiKTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKHRoaXMudG9rZW5UeXBlQnlJZCkuc29ydChzb3J0ZXIpLm1hcChrID0+IGAtIFxcYCR7a31cXGA6ICR7dGhpcy50b2tlblR5cGVCeUlkW2tdLmRlc2NyaXB0aW9ufWApLmpvaW4oJ1xcbicpO1xuXHR9XG5cbn1cblxuY29uc3QgQ0hBUl9MQU5HVUFHRSA9IFRPS0VOX0NMQVNTSUZJRVJfTEFOR1VBR0VfU0VQQVJBVE9SLmNoYXJDb2RlQXQoMCk7XG5jb25zdCBDSEFSX01PRElGSUVSID0gQ0xBU1NJRklFUl9NT0RJRklFUl9TRVBBUkFUT1IuY2hhckNvZGVBdCgwKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2xhc3NpZmllclN0cmluZyhzOiBzdHJpbmcsIGRlZmF1bHRMYW5ndWFnZTogc3RyaW5nKTogeyB0eXBlOiBzdHJpbmc7IG1vZGlmaWVyczogc3RyaW5nW107IGxhbmd1YWdlOiBzdHJpbmcgfTtcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNsYXNzaWZpZXJTdHJpbmcoczogc3RyaW5nLCBkZWZhdWx0TGFuZ3VhZ2U/OiBzdHJpbmcpOiB7IHR5cGU6IHN0cmluZzsgbW9kaWZpZXJzOiBzdHJpbmdbXTsgbGFuZ3VhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2xhc3NpZmllclN0cmluZyhzOiBzdHJpbmcsIGRlZmF1bHRMYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogeyB0eXBlOiBzdHJpbmc7IG1vZGlmaWVyczogc3RyaW5nW107IGxhbmd1YWdlOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB7XG5cdGxldCBrID0gcy5sZW5ndGg7XG5cdGxldCBsYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gZGVmYXVsdExhbmd1YWdlO1xuXHRjb25zdCBtb2RpZmllcnMgPSBbXTtcblxuXHRmb3IgKGxldCBpID0gayAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y29uc3QgY2ggPSBzLmNoYXJDb2RlQXQoaSk7XG5cdFx0aWYgKGNoID09PSBDSEFSX0xBTkdVQUdFIHx8IGNoID09PSBDSEFSX01PRElGSUVSKSB7XG5cdFx0XHRjb25zdCBzZWdtZW50ID0gcy5zdWJzdHJpbmcoaSArIDEsIGspO1xuXHRcdFx0ayA9IGk7XG5cdFx0XHRpZiAoY2ggPT09IENIQVJfTEFOR1VBR0UpIHtcblx0XHRcdFx0bGFuZ3VhZ2UgPSBzZWdtZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bW9kaWZpZXJzLnB1c2goc2VnbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHR5cGUgPSBzLnN1YnN0cmluZygwLCBrKTtcblx0cmV0dXJuIHsgdHlwZSwgbW9kaWZpZXJzLCBsYW5ndWFnZSB9O1xufVxuXG5cbmNvbnN0IHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSA9IGNyZWF0ZURlZmF1bHRUb2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkoKTtcbnBsYXRmb3JtLlJlZ2lzdHJ5LmFkZChFeHRlbnNpb25zLlRva2VuQ2xhc3NpZmljYXRpb25Db250cmlidXRpb24sIHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSk7XG5cblxuZnVuY3Rpb24gY3JlYXRlRGVmYXVsdFRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSgpOiBUb2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkge1xuXG5cdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IFRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSgpO1xuXG5cdGZ1bmN0aW9uIHJlZ2lzdGVyVG9rZW5UeXBlKGlkOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHNjb3Blc1RvUHJvYmU6IFByb2JlU2NvcGVbXSA9IFtdLCBzdXBlclR5cGU/OiBzdHJpbmcsIGRlcHJlY2F0aW9uTWVzc2FnZT86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmVnaXN0cnkucmVnaXN0ZXJUb2tlblR5cGUoaWQsIGRlc2NyaXB0aW9uLCBzdXBlclR5cGUsIGRlcHJlY2F0aW9uTWVzc2FnZSk7XG5cdFx0aWYgKHNjb3Blc1RvUHJvYmUpIHtcblx0XHRcdHJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoaWQsIHNjb3Blc1RvUHJvYmUpO1xuXHRcdH1cblx0XHRyZXR1cm4gaWQ7XG5cdH1cblxuXHRmdW5jdGlvbiByZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KHNlbGVjdG9yU3RyaW5nOiBzdHJpbmcsIHNjb3Blc1RvUHJvYmU6IFByb2JlU2NvcGVbXSkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZWxlY3RvciA9IHJlZ2lzdHJ5LnBhcnNlVG9rZW5TZWxlY3RvcihzZWxlY3RvclN0cmluZyk7XG5cdFx0XHRyZWdpc3RyeS5yZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KHNlbGVjdG9yLCB7IHNjb3Blc1RvUHJvYmUgfSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5sb2coZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gZGVmYXVsdCB0b2tlbiB0eXBlc1xuXG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdjb21tZW50JywgbmxzLmxvY2FsaXplKCdjb21tZW50JywgXCJTdHlsZSBmb3IgY29tbWVudHMuXCIpLCBbWydjb21tZW50J11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ3N0cmluZycsIG5scy5sb2NhbGl6ZSgnc3RyaW5nJywgXCJTdHlsZSBmb3Igc3RyaW5ncy5cIiksIFtbJ3N0cmluZyddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdrZXl3b3JkJywgbmxzLmxvY2FsaXplKCdrZXl3b3JkJywgXCJTdHlsZSBmb3Iga2V5d29yZHMuXCIpLCBbWydrZXl3b3JkLmNvbnRyb2wnXV0pO1xuXHRyZWdpc3RlclRva2VuVHlwZSgnbnVtYmVyJywgbmxzLmxvY2FsaXplKCdudW1iZXInLCBcIlN0eWxlIGZvciBudW1iZXJzLlwiKSwgW1snY29uc3RhbnQubnVtZXJpYyddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdyZWdleHAnLCBubHMubG9jYWxpemUoJ3JlZ2V4cCcsIFwiU3R5bGUgZm9yIGV4cHJlc3Npb25zLlwiKSwgW1snY29uc3RhbnQucmVnZXhwJ11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ29wZXJhdG9yJywgbmxzLmxvY2FsaXplKCdvcGVyYXRvcicsIFwiU3R5bGUgZm9yIG9wZXJhdG9ycy5cIiksIFtbJ2tleXdvcmQub3BlcmF0b3InXV0pO1xuXG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCduYW1lc3BhY2UnLCBubHMubG9jYWxpemUoJ25hbWVzcGFjZScsIFwiU3R5bGUgZm9yIG5hbWVzcGFjZXMuXCIpLCBbWydlbnRpdHkubmFtZS5uYW1lc3BhY2UnXV0pO1xuXG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCd0eXBlJywgbmxzLmxvY2FsaXplKCd0eXBlJywgXCJTdHlsZSBmb3IgdHlwZXMuXCIpLCBbWydlbnRpdHkubmFtZS50eXBlJ10sIFsnc3VwcG9ydC50eXBlJ11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ3N0cnVjdCcsIG5scy5sb2NhbGl6ZSgnc3RydWN0JywgXCJTdHlsZSBmb3Igc3RydWN0cy5cIiksIFtbJ2VudGl0eS5uYW1lLnR5cGUuc3RydWN0J11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ2NsYXNzJywgbmxzLmxvY2FsaXplKCdjbGFzcycsIFwiU3R5bGUgZm9yIGNsYXNzZXMuXCIpLCBbWydlbnRpdHkubmFtZS50eXBlLmNsYXNzJ10sIFsnc3VwcG9ydC5jbGFzcyddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdpbnRlcmZhY2UnLCBubHMubG9jYWxpemUoJ2ludGVyZmFjZScsIFwiU3R5bGUgZm9yIGludGVyZmFjZXMuXCIpLCBbWydlbnRpdHkubmFtZS50eXBlLmludGVyZmFjZSddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdlbnVtJywgbmxzLmxvY2FsaXplKCdlbnVtJywgXCJTdHlsZSBmb3IgZW51bXMuXCIpLCBbWydlbnRpdHkubmFtZS50eXBlLmVudW0nXV0pO1xuXHRyZWdpc3RlclRva2VuVHlwZSgndHlwZVBhcmFtZXRlcicsIG5scy5sb2NhbGl6ZSgndHlwZVBhcmFtZXRlcicsIFwiU3R5bGUgZm9yIHR5cGUgcGFyYW1ldGVycy5cIiksIFtbJ2VudGl0eS5uYW1lLnR5cGUucGFyYW1ldGVyJ11dKTtcblxuXHRyZWdpc3RlclRva2VuVHlwZSgnZnVuY3Rpb24nLCBubHMubG9jYWxpemUoJ2Z1bmN0aW9uJywgXCJTdHlsZSBmb3IgZnVuY3Rpb25zXCIpLCBbWydlbnRpdHkubmFtZS5mdW5jdGlvbiddLCBbJ3N1cHBvcnQuZnVuY3Rpb24nXV0pO1xuXHRyZWdpc3RlclRva2VuVHlwZSgnbWVtYmVyJywgbmxzLmxvY2FsaXplKCdtZW1iZXInLCBcIlN0eWxlIGZvciBtZW1iZXIgZnVuY3Rpb25zXCIpLCBbXSwgJ21ldGhvZCcsICdEZXByZWNhdGVkIHVzZSBgbWV0aG9kYCBpbnN0ZWFkJyk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdtZXRob2QnLCBubHMubG9jYWxpemUoJ21ldGhvZCcsIFwiU3R5bGUgZm9yIG1ldGhvZCAobWVtYmVyIGZ1bmN0aW9ucylcIiksIFtbJ2VudGl0eS5uYW1lLmZ1bmN0aW9uLm1lbWJlciddLCBbJ3N1cHBvcnQuZnVuY3Rpb24nXV0pO1xuXHRyZWdpc3RlclRva2VuVHlwZSgnbWFjcm8nLCBubHMubG9jYWxpemUoJ21hY3JvJywgXCJTdHlsZSBmb3IgbWFjcm9zLlwiKSwgW1snZW50aXR5Lm5hbWUuZnVuY3Rpb24ucHJlcHJvY2Vzc29yJ11dKTtcblxuXHRyZWdpc3RlclRva2VuVHlwZSgndmFyaWFibGUnLCBubHMubG9jYWxpemUoJ3ZhcmlhYmxlJywgXCJTdHlsZSBmb3IgdmFyaWFibGVzLlwiKSwgW1sndmFyaWFibGUub3RoZXIucmVhZHdyaXRlJ10sIFsnZW50aXR5Lm5hbWUudmFyaWFibGUnXV0pO1xuXHRyZWdpc3RlclRva2VuVHlwZSgncGFyYW1ldGVyJywgbmxzLmxvY2FsaXplKCdwYXJhbWV0ZXInLCBcIlN0eWxlIGZvciBwYXJhbWV0ZXJzLlwiKSwgW1sndmFyaWFibGUucGFyYW1ldGVyJ11dKTtcblx0cmVnaXN0ZXJUb2tlblR5cGUoJ3Byb3BlcnR5JywgbmxzLmxvY2FsaXplKCdwcm9wZXJ0eScsIFwiU3R5bGUgZm9yIHByb3BlcnRpZXMuXCIpLCBbWyd2YXJpYWJsZS5vdGhlci5wcm9wZXJ0eSddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdlbnVtTWVtYmVyJywgbmxzLmxvY2FsaXplKCdlbnVtTWVtYmVyJywgXCJTdHlsZSBmb3IgZW51bSBtZW1iZXJzLlwiKSwgW1sndmFyaWFibGUub3RoZXIuZW51bW1lbWJlciddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdldmVudCcsIG5scy5sb2NhbGl6ZSgnZXZlbnQnLCBcIlN0eWxlIGZvciBldmVudHMuXCIpLCBbWyd2YXJpYWJsZS5vdGhlci5ldmVudCddXSk7XG5cdHJlZ2lzdGVyVG9rZW5UeXBlKCdkZWNvcmF0b3InLCBubHMubG9jYWxpemUoJ2RlY29yYXRvcicsIFwiU3R5bGUgZm9yIGRlY29yYXRvcnMgJiBhbm5vdGF0aW9ucy5cIiksIFtbJ2VudGl0eS5uYW1lLmRlY29yYXRvciddLCBbJ2VudGl0eS5uYW1lLmZ1bmN0aW9uJ11dKTtcblxuXHRyZWdpc3RlclRva2VuVHlwZSgnbGFiZWwnLCBubHMubG9jYWxpemUoJ2xhYmVscycsIFwiU3R5bGUgZm9yIGxhYmVscy4gXCIpLCB1bmRlZmluZWQpO1xuXG5cdC8vIGRlZmF1bHQgdG9rZW4gbW9kaWZpZXJzXG5cblx0cmVnaXN0cnkucmVnaXN0ZXJUb2tlbk1vZGlmaWVyKCdkZWNsYXJhdGlvbicsIG5scy5sb2NhbGl6ZSgnZGVjbGFyYXRpb24nLCBcIlN0eWxlIGZvciBhbGwgc3ltYm9sIGRlY2xhcmF0aW9ucy5cIiksIHVuZGVmaW5lZCk7XG5cdHJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5Nb2RpZmllcignZG9jdW1lbnRhdGlvbicsIG5scy5sb2NhbGl6ZSgnZG9jdW1lbnRhdGlvbicsIFwiU3R5bGUgdG8gdXNlIGZvciByZWZlcmVuY2VzIGluIGRvY3VtZW50YXRpb24uXCIpLCB1bmRlZmluZWQpO1xuXHRyZWdpc3RyeS5yZWdpc3RlclRva2VuTW9kaWZpZXIoJ3N0YXRpYycsIG5scy5sb2NhbGl6ZSgnc3RhdGljJywgXCJTdHlsZSB0byB1c2UgZm9yIHN5bWJvbHMgdGhhdCBhcmUgc3RhdGljLlwiKSwgdW5kZWZpbmVkKTtcblx0cmVnaXN0cnkucmVnaXN0ZXJUb2tlbk1vZGlmaWVyKCdhYnN0cmFjdCcsIG5scy5sb2NhbGl6ZSgnYWJzdHJhY3QnLCBcIlN0eWxlIHRvIHVzZSBmb3Igc3ltYm9scyB0aGF0IGFyZSBhYnN0cmFjdC5cIiksIHVuZGVmaW5lZCk7XG5cdHJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5Nb2RpZmllcignZGVwcmVjYXRlZCcsIG5scy5sb2NhbGl6ZSgnZGVwcmVjYXRlZCcsIFwiU3R5bGUgdG8gdXNlIGZvciBzeW1ib2xzIHRoYXQgYXJlIGRlcHJlY2F0ZWQuXCIpLCB1bmRlZmluZWQpO1xuXHRyZWdpc3RyeS5yZWdpc3RlclRva2VuTW9kaWZpZXIoJ21vZGlmaWNhdGlvbicsIG5scy5sb2NhbGl6ZSgnbW9kaWZpY2F0aW9uJywgXCJTdHlsZSB0byB1c2UgZm9yIHdyaXRlIGFjY2Vzc2VzLlwiKSwgdW5kZWZpbmVkKTtcblx0cmVnaXN0cnkucmVnaXN0ZXJUb2tlbk1vZGlmaWVyKCdhc3luYycsIG5scy5sb2NhbGl6ZSgnYXN5bmMnLCBcIlN0eWxlIHRvIHVzZSBmb3Igc3ltYm9scyB0aGF0IGFyZSBhc3luYy5cIiksIHVuZGVmaW5lZCk7XG5cdHJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5Nb2RpZmllcigncmVhZG9ubHknLCBubHMubG9jYWxpemUoJ3JlYWRvbmx5JywgXCJTdHlsZSB0byB1c2UgZm9yIHN5bWJvbHMgdGhhdCBhcmUgcmVhZC1vbmx5LlwiKSwgdW5kZWZpbmVkKTtcblxuXG5cdHJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoJ3ZhcmlhYmxlLnJlYWRvbmx5JywgW1sndmFyaWFibGUub3RoZXIuY29uc3RhbnQnXV0pO1xuXHRyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KCdwcm9wZXJ0eS5yZWFkb25seScsIFtbJ3ZhcmlhYmxlLm90aGVyLmNvbnN0YW50LnByb3BlcnR5J11dKTtcblx0cmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdCgndHlwZS5kZWZhdWx0TGlicmFyeScsIFtbJ3N1cHBvcnQudHlwZSddXSk7XG5cdHJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoJ2NsYXNzLmRlZmF1bHRMaWJyYXJ5JywgW1snc3VwcG9ydC5jbGFzcyddXSk7XG5cdHJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoJ2ludGVyZmFjZS5kZWZhdWx0TGlicmFyeScsIFtbJ3N1cHBvcnQuY2xhc3MnXV0pO1xuXHRyZWdpc3RlclRva2VuU3R5bGVEZWZhdWx0KCd2YXJpYWJsZS5kZWZhdWx0TGlicmFyeScsIFtbJ3N1cHBvcnQudmFyaWFibGUnXSwgWydzdXBwb3J0Lm90aGVyLnZhcmlhYmxlJ11dKTtcblx0cmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdCgndmFyaWFibGUuZGVmYXVsdExpYnJhcnkucmVhZG9ubHknLCBbWydzdXBwb3J0LmNvbnN0YW50J11dKTtcblx0cmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdCgncHJvcGVydHkuZGVmYXVsdExpYnJhcnknLCBbWydzdXBwb3J0LnZhcmlhYmxlLnByb3BlcnR5J11dKTtcblx0cmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdCgncHJvcGVydHkuZGVmYXVsdExpYnJhcnkucmVhZG9ubHknLCBbWydzdXBwb3J0LmNvbnN0YW50LnByb3BlcnR5J11dKTtcblx0cmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdCgnZnVuY3Rpb24uZGVmYXVsdExpYnJhcnknLCBbWydzdXBwb3J0LmZ1bmN0aW9uJ11dKTtcblx0cmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdCgnbWVtYmVyLmRlZmF1bHRMaWJyYXJ5JywgW1snc3VwcG9ydC5mdW5jdGlvbiddXSk7XG5cdHJldHVybiByZWdpc3RyeTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSgpOiBJVG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5IHtcblx0cmV0dXJuIHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeTtcbn1cblxuZnVuY3Rpb24gZ2V0U3R5bGluZ1NjaGVtZUVudHJ5KGRlc2NyaXB0aW9uPzogc3RyaW5nLCBkZXByZWNhdGlvbk1lc3NhZ2U/OiBzdHJpbmcpOiBJSlNPTlNjaGVtYSB7XG5cdHJldHVybiB7XG5cdFx0ZGVzY3JpcHRpb24sXG5cdFx0ZGVwcmVjYXRpb25NZXNzYWdlLFxuXHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogJyR7MTojZmYwMDAwfScgfV0sXG5cdFx0YW55T2Y6IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGZvcm1hdDogJ2NvbG9yLWhleCdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3N0eWxlJ1xuXHRcdFx0fVxuXHRcdF1cblx0fTtcbn1cblxuZXhwb3J0IGNvbnN0IHRva2VuU3R5bGluZ1NjaGVtYUlkID0gJ3ZzY29kZTovL3NjaGVtYXMvdG9rZW4tc3R5bGluZyc7XG5cbmNvbnN0IHNjaGVtYVJlZ2lzdHJ5ID0gcGxhdGZvcm0uUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5zY2hlbWFSZWdpc3RyeS5yZWdpc3RlclNjaGVtYSh0b2tlblN0eWxpbmdTY2hlbWFJZCwgdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LmdldFRva2VuU3R5bGluZ1NjaGVtYSgpKTtcblxuY29uc3QgZGVsYXllciA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHNjaGVtYVJlZ2lzdHJ5Lm5vdGlmeVNjaGVtYUNoYW5nZWQodG9rZW5TdHlsaW5nU2NoZW1hSWQpLCAyMDApO1xudG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlU2NoZW1hKCgpID0+IHtcblx0aWYgKCFkZWxheWVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRkZWxheWVyLnNjaGVkdWxlKCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYyxzQkFBaUQ7QUFDeEUsWUFBWSxjQUFjO0FBRzFCLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0sc0NBQXNDO0FBQzVDLE1BQU0sZ0NBQWdDO0FBS3RDLE1BQU0sWUFBWTtBQUNYLE1BQU0sMkJBQTJCLElBQUksU0FBUztBQUVyRCxNQUFNLGtCQUFrQixLQUFLLFNBQVMsV0FBVyw2QkFBNkIsR0FBRyxTQUFTLE1BQU0sbUNBQW1DLEdBQUcsU0FBUztBQUUvSSxNQUFNLG1CQUFtQjtBQXdCbEIsTUFBTSxXQUErQztBQUFBLEVBQzNELFlBQ2lCLFlBQ0EsTUFDQSxXQUNBLGVBQ0EsUUFDZjtBQUxlO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQSxFQUVqQjtBQUNEO0FBQUEsQ0FFTyxDQUFVQSxnQkFBVjtBQUNDLFdBQVMsYUFBYSxPQUF3QjtBQUNwRCxXQUFPO0FBQUEsTUFDTixhQUFhLE1BQU0sZUFBZSxTQUFZLE9BQU8sTUFBTSxPQUFPLElBQUksV0FBVyxNQUFNLFlBQVksSUFBSTtBQUFBLE1BQ3ZHLE9BQU8sTUFBTSxTQUFTLFNBQVksT0FBTyxNQUFNO0FBQUEsTUFDL0MsWUFBWSxNQUFNLGNBQWMsU0FBWSxPQUFPLE1BQU07QUFBQSxNQUN6RCxTQUFTLE1BQU0sV0FBVyxTQUFZLE9BQU8sTUFBTTtBQUFBLE1BQ25ELGdCQUFnQixNQUFNLGtCQUFrQixTQUFZLE9BQU8sTUFBTTtBQUFBLElBQ2xFO0FBQUEsRUFDRDtB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TUFBUztBQUNwSCxXQUFTLHNCQUFzQixZQUFZLElBQUksU0FBUyxZQUFZLDhDQUE4QyxHQUFHLE1BQVM7QUFHOUgsNEJBQTBCLHFCQUFxQixDQUFDLENBQUMseUJBQXlCLENBQUMsQ0FBQztBQUM1RSw0QkFBMEIscUJBQXFCLENBQUMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO0FBQ3JGLDRCQUEwQix1QkFBdUIsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0FBQ25FLDRCQUEwQix3QkFBd0IsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ3JFLDRCQUEwQiw0QkFBNEIsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBQ3pFLDRCQUEwQiwyQkFBMkIsQ0FBQyxDQUFDLGtCQUFrQixHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztBQUN2Ryw0QkFBMEIsb0NBQW9DLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3BGLDRCQUEwQiwyQkFBMkIsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLENBQUM7QUFDcEYsNEJBQTBCLG9DQUFvQyxDQUFDLENBQUMsMkJBQTJCLENBQUMsQ0FBQztBQUM3Riw0QkFBMEIsMkJBQTJCLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0FBQzNFLDRCQUEwQix5QkFBeUIsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUM7QUFDekUsU0FBTztBQUNSO0FBRU8sU0FBUyxpQ0FBK0Q7QUFDOUUsU0FBTztBQUNSO0FBRUEsU0FBUyxzQkFBc0IsYUFBc0Isb0JBQTBDO0FBQzlGLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQTtBQUFBLElBQ0EsaUJBQWlCLENBQUMsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUFBLElBQzFDLE9BQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0sdUJBQXVCO0FBRXBDLE1BQU0saUJBQWlCLFNBQVMsU0FBUyxHQUE4QixlQUFlLGdCQUFnQjtBQUN0RyxlQUFlLGVBQWUsc0JBQXNCLDRCQUE0QixzQkFBc0IsQ0FBQztBQUV2RyxNQUFNLFVBQVUsSUFBSSxpQkFBaUIsTUFBTSxlQUFlLG9CQUFvQixvQkFBb0IsR0FBRyxHQUFHO0FBQ3hHLDRCQUE0QixrQkFBa0IsTUFBTTtBQUNuRCxNQUFJLENBQUMsUUFBUSxZQUFZLEdBQUc7QUFDM0IsWUFBUSxTQUFTO0FBQUEsRUFDbEI7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJUb2tlblN0eWxlIiwgIlNlbWFudGljVG9rZW5SdWxlIiwgImxhbmd1YWdlIl0KfQo=
